// 系统动作（字符串协议）
// 协议示例：[系统]发朋友圈|标题|内容|配图(可空)

window.SystemActions = {
  _debugEnabled() {
    try {
      // 约定：localStorage.yd_debug_system_actions = "1" 开启
      return String(localStorage.getItem('yd_debug_system_actions') || '').trim() === '1';
    } catch (e) {
      return false;
    }
  },

  _log(...args) {
    if (!this._debugEnabled()) return;
    try {
      console.log('[SystemActions]', ...args);
    } catch (e) {}
  },

  _routes: {
    '发朋友圈': async function (args, ctx) {
      const title = String(args[0] || '').trim();
      const content = String(args[1] || '').trim();
      const imageDesc = String(args[2] || '').trim(); // 先作为描述，不做真实配图选择

      const textParts = [];
      if (title) textParts.push(title);
      if (content) textParts.push(content);
      if (imageDesc) textParts.push(`配图：${imageDesc}`);
      const text = textParts.join('\n').trim();
      if (!text) return;

      let images = [];
      if (imageDesc && typeof Moments !== 'undefined' && Moments._isImageGenAutoMomentsEnabled && Moments._isImageGenAutoMomentsEnabled()) {
        if (typeof Moments._buildMomentImagesFromImageDesc === 'function') {
          try {
            const raced = await Promise.race([
              Moments._buildMomentImagesFromImageDesc(imageDesc),
              new Promise((resolve) => setTimeout(() => resolve({ images: [] }), 15000))
            ]);
            images = raced && Array.isArray(raced.images) ? raced.images : [];
          } catch (e) {
            images = [];
          }
        }
      }

      const now = Date.now();
      const moment = {
        id: (typeof State !== 'undefined' && State.generateId) ? State.generateId() : (now + Math.random()).toString(36),
        authorName: (ctx && ctx.characterName) ? String(ctx.characterName) : '我',
        authorAvatar: (ctx && ctx.characterAvatar) ? String(ctx.characterAvatar) : '',
        text,
        images,
        createdAt: now,
        likes: [],
        comments: []
      };

      await Storage.dbAdd('moments', moment);
      window.dispatchEvent(new CustomEvent('yd:moments:changed', { detail: { source: ctx?.source || 'system', momentId: moment.id } }));
      this._log('发朋友圈 已写入 moments', { momentId: moment.id, authorName: moment.authorName, title, hasContent: !!content, hasImageDesc: !!imageDesc });

      // 通知：发朋友圈成功
      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        Notifications.enqueue('朋友圈', moment.authorName, title ? `已发表：${title}` : '已发表朋友圈');
      }
    }
    ,
    // 主动消息计划（由角色在聊天同轮输出系统动作）
    // 支持：
    // [系统]主动消息|35|正文
    // [系统]主动消息|at=10:00|正文
    // [系统]主动消息|正文
    // [系统]主动消息|cancel
    '主动消息': async function (args, ctx) {
      const sessionId = ctx?.sessionId ? String(ctx.sessionId).trim() : '';
      if (!sessionId) return;

      const segs = Array.isArray(args) ? args.map((s) => String(s || '').trim()) : [];
      if (!segs.length) return;
      const first = String(segs[0] || '').trim();
      if (!first) return;

      // 取消当前会话的主动消息计划（后台执行，不阻塞 parseAndExecute / 聊天入库）
      if (/^(cancel|取消|清除)$/i.test(first)) {
        if (
          typeof ProactiveScheduler !== 'undefined' &&
          ProactiveScheduler &&
          typeof ProactiveScheduler.scheduleFromSystemAction === 'function'
        ) {
          await ProactiveScheduler.scheduleFromSystemAction({
            sessionId,
            cancel: true,
            source: ctx?.source || 'chat',
            characterId: ctx?.characterId ? String(ctx.characterId) : '',
            characterName: ctx?.characterName ? String(ctx.characterName) : ''
          }).catch((e) => {
            try {
              console.error('[SystemActions] scheduleFromSystemAction(cancel) failed:', e);
            } catch (e2) {}
          });
        }
        return;
      }

      let delayMinutes = null;
      let atText = '';
      let body = '';

      if (/^at\s*=/.test(first)) {
        atText = first.replace(/^at\s*=\s*/i, '').trim();
        body = segs.slice(1).join('|').trim();
      } else if (/^-?\d+$/.test(first)) {
        delayMinutes = parseInt(first, 10);
        body = segs.slice(1).join('|').trim();
      } else {
        // 仅正文：保留原分隔符（便于自然文本）
        body = segs.join('|').trim();
      }

      if (!body) return;

      if (
        typeof ProactiveScheduler !== 'undefined' &&
        ProactiveScheduler &&
        typeof ProactiveScheduler.scheduleFromSystemAction === 'function'
      ) {
        await ProactiveScheduler.scheduleFromSystemAction({
          sessionId,
          body,
          delayMinutes,
          atText,
          source: ctx?.source || 'chat',
          characterId: ctx?.characterId ? String(ctx.characterId) : '',
          characterName: ctx?.characterName ? String(ctx.characterName) : ''
        }).catch((e) => {
          try {
            console.error('[SystemActions] scheduleFromSystemAction failed:', e);
          } catch (e2) {}
        });
      }
    }
    ,
    // 代付结果（由角色用 [系统] 一行返回）
    // 协议示例：[系统]代付结果|外卖或商城|订单ID|是 或 [系统]代付结果|外卖或商城|订单ID|否
    '代付结果': async function (args, ctx) {
      const sourceRaw = String(args?.[0] || '').trim(); // 外卖|商城 或 takeout|shop
      const source = (sourceRaw === '外卖' || sourceRaw === 'takeout')
        ? 'takeout'
        : (sourceRaw === '商城' || sourceRaw === 'shop' ? 'shop' : '');
      const orderId = String(args?.[1] || '').trim();
      const decision = String(args?.[2] || '').trim(); // 是 | 否
      const sessionId = ctx?.sessionId ? String(ctx.sessionId) : '';
      if (!source || !orderId || !sessionId) return;

      const key = source === 'shop' ? 'shop_orders_v1' : 'takeout_orders_v1';
      let orders = [];
      try {
        const existing = await Storage.kvGet(key);
        if (Array.isArray(existing)) orders = existing;
      } catch (e) {}
      if (!orders.length) return;

      const idx = orders.findIndex(o => String(o?.id || '') === orderId);
      if (idx < 0) return;

      const now = Date.now();
      const paid = decision === '是' || decision === '是的' || decision === 'OK' || decision === '同意';

      const order = orders[idx];
      order.payState = paid ? 'proxy_paid' : 'unpaid';
      order.paidBy = paid ? 'proxy' : 'unpaid';
      order.paidAt = paid ? now : order.paidAt || 0;
      orders[idx] = order;

      await Storage.kvSet(key, orders);

      // 写入“订单回显”到聊天：复用现有分享消息体格式 [分享]...（让 chat.js 直接渲染订单卡片）
      const escPipe = (v) => String(v ?? '').replace(/\|/g, '｜');
      const shareTitle = source === 'shop' ? '购物订单' : '外卖订单';
      const shareTotal = Number(order.total || 0) || 0;
      const shareAddress = String(order.address || '');
      const shareTs = Number(order.ts || 0) || 0;
      const items = Array.isArray(order.items) ? order.items : [];
      const app = source === 'shop' ? '商城' : '外卖';
      const status = paid ? '已代付' : '未支付';

      const parts = [
        app,
        '订单',
        '查看',
        escPipe(orderId),
        escPipe(shareTitle),
        escPipe(String(shareTotal)),
        escPipe(status),
        escPipe(String(shareTs)),
        escPipe(shareAddress)
      ];

      // item 固定段：itemIcon|itemName|qty|specText|unitPrice
      items.forEach(it => {
        const icon = String(it?.icon || '');
        const name = String(it?.name || '');
        const qty = Number(it?.qty || 0) || 0;
        const specText = String(it?.specText || '').trim();
        const unitPrice = Number(it?.unitPrice || 0) || 0;
        parts.push(escPipe(icon));
        parts.push(escPipe(name));
        parts.push(escPipe(String(qty)));
        parts.push(escPipe(specText));
        parts.push(escPipe(String(unitPrice)));
      });

      const msg = {
        id: (typeof State !== 'undefined' && State.generateId) ? State.generateId() : (now + Math.random()).toString(36),
        sessionId,
        role: 'assistant',
        content: `[分享]${parts.join('|')}`,
        createdAt: now,
        characterId: ctx?.characterId ? String(ctx.characterId) : null,
        characterName: ctx?.characterName ? String(ctx.characterName) : null
      };

      await Storage.dbAdd('messages', msg);

      // 更新会话最新时间 + 尝试在当前打开会话中立即渲染
      try {
        const session = await Storage.dbGet('sessions', sessionId);
        if (session) {
          session.updatedAt = now;
          await Storage.dbPut('sessions', session);
        }
      } catch (e) {}

      try {
        if (typeof Chat !== 'undefined' && Chat && Chat._scheduleChatListRefresh) {
          Chat._scheduleChatListRefresh();
        }
        if (typeof State !== 'undefined' && State?.currentPage === 'page-chat' && Chat && String(Chat.currentSessionId || '') === sessionId) {
          Chat.messages.push(msg);
          await Chat.renderMessages();
        }
      } catch (e) {}
    }
    ,
    // 兼容旧 [系统]收款结果 → 转为 [收取红包]/[收取转账] 写入助手正文，由 applyMoneyCollectMessage 结清
    '收款结果': async function (args, ctx) {
      const kindRaw = String(args?.[0] || '').trim();
      const messageId = String(args?.[1] || '').trim();
      const decision = String(args?.[2] || '').trim();
      const sessionId = ctx?.sessionId ? String(ctx.sessionId) : '';
      if (!messageId || !sessionId) return;

      const kind = (kindRaw === '转账' || kindRaw === 'transfer')
        ? 'transfer'
        : (kindRaw === '红包' || kindRaw === 'redpacket' ? 'redpacket' : '');
      if (!kind) return;

      const accepted = decision === '是' || decision === '是的' || decision === 'OK' || decision === '同意';
      const declined = decision === '否' || decision === '不要' || decision === '拒绝';
      if (!accepted && !declined) return;
      if (
        typeof Chat === 'undefined' ||
        !Chat ||
        typeof Chat.buildCollectLineFromLegacy收款结果 !== 'function'
      ) {
        return;
      }
      const line = await Chat.buildCollectLineFromLegacy收款结果({
        sessionId,
        kind,
        messageId,
        accepted,
        characterName: ctx?.characterName ? String(ctx.characterName) : ''
      });
      if (line) {
        if (!Array.isArray(ctx._appendCleanLines)) ctx._appendCleanLines = [];
        ctx._appendCleanLines.push(line);
        this._log('收款结果 已转为收取消息行', { messageId, kind, decision });
      }
    }
  },

  async parseAndExecute(text, ctx) {
    const { actions, cleanText } = this.extract(text);
    if (!actions.length) return { actions: [], cleanText: String(text || '') };

    // 约束：同一轮里 [系统]主动消息 最多消费一条（取最后一条）
    const lastProactiveIdx = (() => {
      for (let i = actions.length - 1; i >= 0; i--) {
        if (String(actions[i]?.action || '').trim() === '主动消息') return i;
      }
      return -1;
    })();
    const filteredActions = actions.filter((a, idx) => {
      if (String(a?.action || '').trim() !== '主动消息') return true;
      return idx === lastProactiveIdx;
    });

    this._log('parseAndExecute 命中系统动作', {
      count: filteredActions.length,
      actions: filteredActions,
      ctx: ctx || {}
    });

    const runCtx = { ...(ctx || {}), _appendCleanLines: [] };
    for (const a of filteredActions) {
      const handler = this._routes[a.action];
      if (!handler) continue;
      try {
        await handler.call(this, a.args, runCtx);
      } catch (e) {
        console.error('SystemActions execute failed:', a, e);
      }
    }
    const extra = Array.isArray(runCtx._appendCleanLines)
      ? runCtx._appendCleanLines.filter((s) => String(s || '').trim())
      : [];
    const merged =
      extra.length > 0
        ? [String(cleanText || '').trim(), ...extra].filter(Boolean).join('\n')
        : String(cleanText || '');
    return { actions: filteredActions, cleanText: merged };
  },

  extract(text) {
    const raw = String(text || '');
    const lines = raw.split('\n');
    const actions = [];
    const kept = [];

    for (const line of lines) {
      const trimmed = String(line || '').trim();
      // 兼容模型在 [系统] 前附带引号/前缀文本的情况：
      // - " [系统]..."
      // - …… [系统]...
      // 这些都应被识别为系统动作并从聊天正文中剔除。
      const idx = trimmed.indexOf('[系统]');
      if (idx < 0) {
        kept.push(line);
        continue;
      }
      const lead = String(trimmed.slice(0, idx) || '').trim();
      const tail = String(trimmed.slice(idx + '[系统]'.length) || '').trim();
      // 行内 [系统] 前若有可读内容，保留到正文，避免误吞正常文本
      if (lead) kept.push(lead);
      const payload = tail;
      if (!payload) continue;
      const parts = payload.split('|').map(s => String(s || '').trim());
      const action = String(parts[0] || '').trim();
      const args = parts.slice(1);
      if (action) actions.push({ action, args, raw: trimmed });
      // 系统动作行不进入聊天正文
    }

    return { actions, cleanText: kept.join('\n') };
  }
};


// Shopping has been removed; old model outputs cannot trigger payment actions.
delete SystemActions._routes["代付结果"];

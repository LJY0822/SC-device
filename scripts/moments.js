// 朋友圈
// 用户发表成功后：选取常聊至多 5 个角色 + 各会话最近聊天摘录 → 调用与聊天相同的 /chat/completions
// → 解析：候选角色每人 1 条评论（必出）+ AI 自行决定点赞 [朋友圈点赞]momentId|角色名
const Moments = {
  maxImages: 9,
  _momentEngagementInFlight: new Set(),
  _momentImageGenInFlight: new Set(),
  _MOMENTS_AI_LAST_UPDATE_KEY: 'moments_ai_last_update_v1',
  _momentsUpdateCandidates: [],
  _MOMENTS_ROLE_SIGNAL_KEY_PREFIX: 'moments_role_social_signals_',

  init() {
    // 启动时先强制隐藏“新内容更新”条，避免缓存/旧 DOM 状态残留
    try { this._setUpdateBarVisible(false); } catch (e0) {}

    document.getElementById('moments-back')?.addEventListener('click', () => {
      State.backToHome();
    });
    document.getElementById('moments-new')?.addEventListener('click', () => {
      this.openComposer();
    });
    document.getElementById('moments-refresh')?.addEventListener('click', async () => {
      try {
        await this.runMomentsUpdateFromChats();
      } catch (e) {
        console.warn('[Moments] runMomentsUpdateFromChats failed:', e);
        alert(String(e?.message || e || '朋友圈更新失败'));
      } finally {
        try {
          // 无论成功/失败都复位按钮状态，避免卡在“正在更新…”
          await this._syncMomentsUpdateButton();
        } catch (e2) {}
      }
    });

    // 监听系统动作写入的朋友圈，若当前正停留在朋友圈页则立刻刷新
    window.addEventListener('yd:moments:changed', async (e) => {
      try {
        if (State?.currentPage !== 'page-moments') return;
        await this.renderList();
        // 朋友圈变化后也同步一次按钮可见性（避免状态残留）
        await this._syncMomentsUpdateButton();
      } catch (err) {
        console.error('Moments refresh on yd:moments:changed failed:', err);
      }
    });

    const coverEl = document.querySelector('.yd-moments-cover__bg');
    const coverInput = document.createElement('input');
    coverInput.type = 'file';
    coverInput.accept = 'image/png,image/jpeg,image/webp';
    coverInput.style.display = 'none';
    coverInput.setAttribute('aria-hidden', 'true');
    document.body.appendChild(coverInput);
    coverEl?.addEventListener('click', () => coverInput.click());
    coverInput.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f || !f.type.match(/^image\/(png|jpeg|webp)$/)) return;
      const dataUrl = await this._readFileAsDataUrl(f);
      if (dataUrl) {
        await Storage.kvSet('momentsCover', dataUrl);
        this._applyCoverBg(dataUrl);
      }
    });

    window.addEventListener('yd:pagechange', (e) => {
      const to = e?.detail?.to;
      if (to === 'page-moments') {
        this.renderHeader();
        this.renderList();
        this._loadCoverBg();
        try { this._setUpdateBarVisible(false); } catch (e1) {}
        void this._syncMomentsUpdateButton();
      }
    });
  },

  _setUpdateBarVisible(visible, opts = {}) {
    const bar = document.getElementById('moments-updatebar');
    const btn = document.getElementById('moments-refresh');
    const badge = document.getElementById('moments-refresh-badge');
    if (!bar || !btn) return;
    const v = !!visible;
    bar.hidden = !v;
    btn.disabled = !v;
    const textEl = btn.querySelector('.yd-moments-updatebar__text');
    const text = String(opts?.text || '').trim();
    const count = opts?.count != null ? Math.max(0, Math.floor(Number(opts.count) || 0)) : 0;
    if (v) {
      if (textEl) textEl.textContent = text || '有新内容更新';
      else if (text) btn.textContent = text;
      if (badge) {
        badge.hidden = !(count > 0);
        if (count > 0) badge.textContent = String(Math.min(99, count));
      }
    }
  },

  async _getMomentsAiLastUpdateState() {
    try {
      const row = await Storage.kvGet(this._MOMENTS_AI_LAST_UPDATE_KEY);
      if (!row || typeof row !== 'object') return { byCharacterId: {}, lastRunAt: 0 };
      const by = row.byCharacterId && typeof row.byCharacterId === 'object' ? row.byCharacterId : {};
      const lastRunAt = Number(row.lastRunAt || 0) || 0;
      return { byCharacterId: { ...by }, lastRunAt };
    } catch (e) {
      return { byCharacterId: {}, lastRunAt: 0 };
    }
  },

  async _setMomentsAiLastUpdateState(next) {
    const obj = next && typeof next === 'object' ? next : null;
    const by = obj?.byCharacterId && typeof obj.byCharacterId === 'object' ? obj.byCharacterId : {};
    const lastRunAt = Number(obj?.lastRunAt || 0) || 0;
    await Storage.kvSet(this._MOMENTS_AI_LAST_UPDATE_KEY, { byCharacterId: { ...by }, lastRunAt });
  },

  _sessionInvolvesCharacter(session, characterId) {
    const cid = String(characterId || '').trim();
    if (!cid || !session) return false;
    const parts = Array.isArray(session.participantCharacterIds)
      ? session.participantCharacterIds.filter(Boolean)
      : [];
    if (parts.some((x) => String(x) === cid)) return true;
    if (String(session.characterId || '').trim() === cid) return true;
    return false;
  },

  async _syncMomentsUpdateButton() {
    try {
      this._setUpdateBarVisible(false);
      this._momentsUpdateCandidates = [];

      const lastState = await this._getMomentsAiLastUpdateState();
      const byCharacterId = lastState.byCharacterId || {};

      const sessions = await Storage.dbGetAll('sessions');
      const allSessions = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
      const messages = await Storage.dbGetAll('messages');
      const allMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];

      const chars = await Storage.dbGetAll('characters');
      const allChars = Array.isArray(chars) ? chars.filter(Boolean) : [];
      const charById = new Map(allChars.map((c) => [String(c?.id || ''), c]));

      // 先收集“出现过会话”的角色 id，避免无会话角色参与计算
      const candidateIds = new Set();
      for (const s of allSessions) {
        const ids = Array.isArray(s?.participantCharacterIds) ? s.participantCharacterIds.filter(Boolean) : [];
        ids.forEach((x) => candidateIds.add(String(x)));
        const legacy = String(s?.characterId || '').trim();
        if (legacy) candidateIds.add(legacy);
      }
      if (!candidateIds.size) {
        this._setUpdateBarVisible(false);
        return;
      }

      const sessionById = new Map(allSessions.map((s) => [String(s?.id || ''), s]));
      const newCountByChar = new Map();

      for (const cid of candidateIds) {
        const c = charById.get(String(cid));
        if (!c) continue;
        const lastAt = Number(byCharacterId[String(cid)] || 0) || 0;
        let count = 0;
        for (const m of allMessages) {
          if (!m) continue;
          if (m.role === 'memory') continue;
          if (m._pending || m._localOnly) continue;
          const createdAt = Number(m.createdAt || 0) || 0;
          if (createdAt <= lastAt) continue;
          const sid = String(m.sessionId || '');
          const s = sessionById.get(sid);
          if (!s) continue;
          if (!this._sessionInvolvesCharacter(s, cid)) continue;
          count += 1;
        }
        if (count > 0) newCountByChar.set(String(cid), count);
      }

      const list = Array.from(newCountByChar.entries())
        .map(([characterId, newCount]) => ({
          characterId,
          newCount,
          character: charById.get(String(characterId)) || null
        }))
        .filter((x) => x.character && x.newCount > 5)
        .sort((a, b) => (b.newCount || 0) - (a.newCount || 0));

      this._momentsUpdateCandidates = list;
      if (!list.length) {
        this._setUpdateBarVisible(false);
        return;
      }
      const topN = Math.min(3, list.length);
      this._setUpdateBarVisible(true, { text: '有新内容更新', count: topN });
    } catch (e) {
      console.warn('[Moments] _syncMomentsUpdateButton failed:', e);
      this._setUpdateBarVisible(false);
      this._momentsUpdateCandidates = [];
    }
  },

  _safeParseJson(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    let s = raw;
    if (s.startsWith('```')) {
      s = s.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    }
    try {
      return JSON.parse(s);
    } catch (e) {
      return null;
    }
  },

  _normalizeApiContent(content) {
    if (content == null || content === '') return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return String(content);
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && part.type === 'text' && part.text) return part.text;
      return '';
    }).join('');
  },

  _parseMomentPublishTime(raw, fallbackNow = Date.now()) {
    const fb = Number(fallbackNow || Date.now()) || Date.now();
    if (raw == null || raw === '') return fb;
    const v = String(raw).trim();
    if (!v) return fb;

    // 纯数字：支持秒/毫秒时间戳
    if (/^\d{10,13}$/.test(v)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        return v.length <= 10 ? (n * 1000) : n;
      }
    }

    // 常见格式：YYYY-MM-DD HH:mm（本地时间）
    if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(v)) {
      const t = Date.parse(v.replace(/\s+/, 'T'));
      if (Number.isFinite(t)) return t;
    }

    // 兜底：交给 Date.parse
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
    return fb;
  },

  /**
   * 根据「配图描述」调用设置中的生图 API（/v1/images/generations），返回可写入 moment.images 的地址列表。
   * 未配置完整生图设置或调用失败时返回空数组，不阻断发朋友圈文。
   */
  async _buildMomentImagesFromImageDesc(desc) {
    const d = String(desc || '').trim();
    if (!d) return [];
    if (typeof ImageGenerationApi === 'undefined' || typeof ImageGenerationApi.generateFromDescription !== 'function') {
      return [];
    }
    const base = String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL) || '').trim();
    const key = String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY) || '').trim();
    const model = String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL) || '').trim();
    if (!base || !key || !model) {
      console.warn('[Moments] 生图设置不完整，跳过配图生成');
      return [];
    }
    try {
      const { images } = await ImageGenerationApi.generateFromDescription(d);
      const first = images && images[0];
      const src = first && (first.dataUrl || first.url);
      return src ? [src] : [];
    } catch (e) {
      console.warn('[Moments] 配图生成失败', e);
      return [];
    }
  },

  /** 生图设置「自动生图」：开启后 AI 朋友圈动态会先文生图再写入数据库 */
  _isImageGenAutoMomentsEnabled() {
    try {
      const k = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS)
        ? CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS
        : 'image_gen_auto_moments';
      const r = String(Storage.get(k) || '').trim().toLowerCase();
      return r === 'on' || r === '1' || r === 'true';
    } catch (e) {
      return false;
    }
  },

  _extractMomentTextAndImageDesc(rawText) {
    const raw = String(rawText || '');
    if (!raw.trim()) return { text: '', imageDesc: '' };
    const lines = raw.split(/\r?\n/);
    let imageDesc = '';
    const textLines = [];
    lines.forEach((line) => {
      const s = String(line || '').trim();
      const m = s.match(/^配图[：:]\s*(.+)$/);
      if (m) {
        const desc = String(m[1] || '').trim();
        if (desc && !imageDesc) imageDesc = desc;
        return;
      }
      textLines.push(line);
    });
    return {
      text: textLines.join('\n').trim(),
      imageDesc: imageDesc.trim()
    };
  },

  /** 仅更新朋友圈正文中的「配图：」一行，不影响其余正文 */
  async _persistMomentImageDesc(momentId, imageDesc) {
    const mid = String(momentId || '').trim();
    const d = String(imageDesc || '').trim();
    const m = await Storage.dbGet('moments', mid);
    if (!m) throw new Error('朋友圈不存在');
    const parsed = this._extractMomentTextAndImageDesc(String(m?.text || ''));
    const body = String(parsed?.text || '').trim();
    m.text = d ? [body, `配图：${d}`].filter(Boolean).join('\n').trim() : body;
    await Storage.dbPut('moments', m);
    try {
      window.dispatchEvent(new CustomEvent('yd:moments:changed', { detail: { source: 'moments_image_desc_edit', momentId: mid } }));
    } catch (e) {}
  },

  _buildMomentPlaceholderImageDataUrl(descText) {
    // 注意：描述文本会在弹窗里单独显示；这里的占位图不再重复绘制文字
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#93c5fd"/>
      <stop offset="100%" stop-color="#bfdbfe"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect x="90" y="90" width="900" height="900" rx="36" fill="rgba(255,255,255,0.55)" stroke="rgba(59,130,246,0.25)"/>
  <text x="540" y="560" text-anchor="middle" font-size="140">🖼️</text>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  },

  _cleanKvKeyPart(v) {
    return String(v || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .replace(/[^\w\u4e00-\u9fa5 \-().]/g, '_');
  },

  _momentsRoleSignalsKeyByName(characterName) {
    const n = String(characterName || '').trim();
    if (!n) return '';
    return `${this._MOMENTS_ROLE_SIGNAL_KEY_PREFIX}${this._cleanKvKeyPart(n)}`;
  },

  async _findCharacterIdByName(characterName) {
    const name = String(characterName || '').trim();
    if (!name) return '';
    try {
      const all = await Storage.dbGetAll('characters');
      const arr = Array.isArray(all) ? all.filter(Boolean) : [];
      const hit = arr.find((c) => String(c?.name || '').trim() === name) || null;
      return hit ? String(hit.id || '').trim() : '';
    } catch (e) {
      return '';
    }
  },

  async _pushMomentRoleSignal(characterName, signal) {
    const name = String(characterName || '').trim();
    if (!name) return;
    const key = this._momentsRoleSignalsKeyByName(name);
    if (!key) return;
    const ts = Number(signal?.ts || Date.now()) || Date.now();
    const kind = String(signal?.kind || '').trim();
    const momentId = String(signal?.momentId || '').trim();
    const momentAuthorName = String(signal?.momentAuthorName || '').trim();
    const momentText = String(signal?.momentText || '').trim();
    const actorName = String(signal?.actorName || '').trim();
    const replyToName = String(signal?.replyToName || '').trim();
    const text = String(signal?.text || '').trim();
    const item = {
      ts,
      kind: kind || 'event',
      momentId,
      momentAuthorName,
      momentText,
      actorName,
      replyToName,
      text
    };
    try {
      const row = await Storage.kvGet(key);
      const arr = Array.isArray(row?.value) ? row.value.slice() : (Array.isArray(row) ? row.slice() : []);
      arr.unshift(item);
      const dedup = [];
      const seen = new Set();
      for (const it of arr) {
        const sig = [
          String(it?.kind || ''),
          String(it?.momentId || ''),
          String(it?.momentAuthorName || ''),
          String(it?.actorName || ''),
          String(it?.replyToName || ''),
          String(it?.text || '')
        ].join('||');
        if (seen.has(sig)) continue;
        seen.add(sig);
        dedup.push(it);
        if (dedup.length >= 24) break;
      }
      await Storage.kvSet(key, dedup);
    } catch (e) {}
  },

  async _runCharacterReplyForMomentComment(moment, userCommentText) {
    const m = moment && typeof moment === 'object' ? moment : null;
    if (!m) return null;
    const authorName = String(m.authorName || '').trim();
    if (!authorName) return null;
    const characterId = await this._findCharacterIdByName(authorName);
    if (!characterId) return null;

    const momentText = String(m.text || '').trim();
    const comments = Array.isArray(m.comments) ? m.comments.filter(Boolean) : [];
    const tail = comments.slice(-12).map((c, idx) => {
      const n = String(c?.name || '').trim() || '匿名';
      const t = String(c?.text || '').trim();
      if (!t) return '';
      return `${idx + 1}. ${n}：${t}`;
    }).filter(Boolean).join('\n');

    const context = await TaPages._buildFeatureContextForCharacter(characterId, { maxMsgs: 36 });
    if (!context) return null;
    const { name, charProfile, chatTranscript } = context;

    const systemRoleAndGoal = [
      '你是「朋友圈评论回复生成器」。',
      '场景：用户刚在某个角色的朋友圈下发表评论；请让该角色以“本人”身份回复一条自然的短评论。',
      '目标：语气符合角色设定，回复简短真实，不要像客服，不要长篇大论。'
    ].join('\n');

    const systemCharacterContext = [
      `## 角色：${name}`,
      charProfile ? `## 角色设定（角色库）\n${charProfile}` : '## 角色设定（角色库）\n（未填写详情）'
    ].join('\n');

    const visionUrlsForComment = this._collectMomentVisionImageUrls(m);
    const systemSupplementContext = [
      '## 补充资料：近期摘要与聊天上下文（用于隐藏线索参考）',
      chatTranscript || '（无）',
      '',
      '## 朋友圈原文',
      momentText ? momentText : '（无正文）',
      ...(visionUrlsForComment.length
        ? [`（另：本轮 user 消息附带 ${visionUrlsForComment.length} 张该朋友圈配图，请结合理解）`, '']
        : ['']),
      '## 该朋友圈下最近评论（从旧到新，最多12条）',
      tail || '（暂无评论）'
    ].join('\n');

    const systemOutputContractAndExample = [
      '你只输出纯文本，不要输出 JSON、Markdown、代码块或任何解释性文字。',
      '只输出一条回复内容，不要带昵称，不要带引号，不要换行。',
      '回复长度建议 8～60 字。',
      '禁止输出敏感/越界内容；不要提及“提示词/系统/模型”。'
    ].join('\n');

    const userMessage = [
      '请回复用户刚发的这条评论，回复要像真实朋友圈评论区的一句话。',
      `用户评论：${String(userCommentText || '').trim() || '（空）'}`
    ].join('\n');

    let userContentParts = null;
    if (visionUrlsForComment.length) {
      const parts = [{ type: 'text', text: userMessage }];
      visionUrlsForComment.forEach((url) => parts.push({ type: 'image_url', image_url: { url } }));
      userContentParts = parts;
    }

    const spec = TaPages._buildAiFeatureSpec({
      systemMessages: [systemRoleAndGoal, systemCharacterContext, systemSupplementContext, systemOutputContractAndExample],
      userMessage,
      userContentParts,
      parse: (raw) => String(raw || '').replace(/\s+/g, ' ').trim()
    });

    const { parsed } = await TaPages._runAiFeatureTask(spec);
    const reply = String(parsed || '').trim();
    if (!reply) return null;
    if (reply.length > 90) return reply.slice(0, 90) + '…';
    return reply;
  },

  async runMomentsUpdateFromChats() {
    // 确保候选是最新的（允许用户停留页面期间继续聊天）
    await this._syncMomentsUpdateButton();
    const candidates = Array.isArray(this._momentsUpdateCandidates) ? this._momentsUpdateCandidates : [];
    const picked = candidates.slice(0, 3);
    if (!picked.length) {
      this._setUpdateBarVisible(false);
      return;
    }

    const btn = document.getElementById('moments-refresh');
    try {
      this._setUpdateBarVisible(true, { text: '正在更新…', count: 0 });
      if (btn) btn.disabled = true;

      const selected = picked
        .map((x) => ({
          characterId: String(x?.characterId || '').trim(),
          characterName: String(x?.character?.name || '').trim(),
          character: x?.character || null,
          newCount: Number(x?.newCount || 0) || 0
        }))
        .filter((x) => x.characterId && x.character && x.characterName);

      if (!selected.length) {
        await this._syncMomentsUpdateButton();
        return;
      }

      const generationResults = await Promise.allSettled(
        selected.map((x) => this._generateMomentForCharacter(x))
      );
      const now = Date.now();
      const lastState = await this._getMomentsAiLastUpdateState();
      const by = lastState.byCharacterId || {};
      let wrote = 0;
      let successCount = 0;

      for (let i = 0; i < generationResults.length; i += 1) {
        const result = generationResults[i];
        const selectedOne = selected[i] || null;
        if (!selectedOne) continue;
        if (result.status !== 'fulfilled') {
          console.warn('[Moments] generate moment failed:', selectedOne.characterName, result.reason);
          continue;
        }

        const row = result.value;
        const text = String(row?.text || '').trim();
        if (!text) continue;
        const imageDesc = String(row?.imageDesc || '').trim();
        const publishTimeRaw = row?.publishTime;
        const c = selectedOne.character || null;
        const authorName = selectedOne.characterName || String(c?.name || '').trim() || '未命名角色';
        const authorAvatar = String(c?.avatar || c?.data?.avatar || '').trim();
        const parsedText = this._extractMomentTextAndImageDesc(text);
        const mergedImageDesc = String(parsedText.imageDesc || imageDesc || '').trim();
        const momentText = [parsedText.text, mergedImageDesc ? `配图：${mergedImageDesc}` : ''].filter(Boolean).join('\n').trim();
        if (!momentText) continue;
        const publishAt = this._parseMomentPublishTime(publishTimeRaw, now);

        let images = [];
        if (mergedImageDesc && this._isImageGenAutoMomentsEnabled()) {
          images = await this._buildMomentImagesFromImageDesc(mergedImageDesc);
        }

        const moment = {
          id: (typeof State !== 'undefined' && State.generateId) ? State.generateId() : (now + Math.random()).toString(36),
          authorName,
          authorAvatar,
          text: momentText,
          images,
          createdAt: publishAt,
          likes: [],
          comments: []
        };
        await Storage.dbAdd('moments', moment);
        wrote += 1;
        successCount += 1;
        const cid = String(selectedOne.characterId || '').trim();
        if (cid) by[cid] = now;
        try {
          window.dispatchEvent(new CustomEvent('yd:moments:changed', { detail: { source: 'moments_update_ai', momentId: moment.id } }));
        } catch (e) {}
      }

      if (successCount > 0) {
        await this._setMomentsAiLastUpdateState({ byCharacterId: by, lastRunAt: now });
        this._notifyMomentEngagementResult(`已更新 ${wrote} 条朋友圈`);
      } else {
        this._notifyMomentEngagementResult('已请求更新，但未生成有效朋友圈');
      }

      await this.renderList();
      await this._syncMomentsUpdateButton();
    } finally {
      // 确保按钮不会长期停留在“正在更新…”
      try {
        if (btn) btn.disabled = false;
      } catch (e) {}
    }
  },

  async _generateMomentForCharacter(selectedOne) {
    const characterId = String(selectedOne?.characterId || '').trim();
    const characterName = String(selectedOne?.characterName || '').trim();
    if (!characterId || !characterName) throw new Error('角色信息缺失');

    // 真正复用 TaPages 标准上下文：角色设定 + 线上聊天摘录 +（未来可扩展的）统一“隐藏线索”注入
    if (typeof TaPages === 'undefined' || !TaPages || typeof TaPages._buildFeatureContextForCharacter !== 'function') {
      throw new Error('标准上下文构造器不可用');
    }
    const ctx = await TaPages._buildFeatureContextForCharacter(characterId, { maxMsgs: 56 });
    const profile = String(ctx?.charProfile || '').trim();
    const transcript = String(ctx?.chatTranscript || '').trim();
    const roleBlock = [
      '【角色】',
      `characterName: ${characterName || '未命名角色'}`,
      '',
      '【角色设定】',
      profile || '（无）',
      '',
      '【近期聊天摘录（按线上聊天加载上下文逻辑整理）】',
      transcript || '（无）'
    ].join('\n');

    const systemPrompt = [
      '你是「手机里的朋友圈内容生成器」。',
      '你会收到 1 个角色：包含 characterName、角色设定、以及与用户的近期聊天摘录。',
      '你的任务：只为这个角色生成 1 条“角色自己发的朋友圈”。',
      '要求：',
      '- 输出必须是严格 JSON，且只能输出 JSON（禁止 markdown、禁止解释、禁止多余文本）。',
      '- 返回 JSON 对象，必须包含 characterName、text、publishTime。',
      '- characterName 必须严格来自输入，不可编造新的角色名。',
      '- text 为朋友圈正文：自然口吻、符合该角色人设；可少量换行；不要出现 ] 字符；尽量少用 |。',
      '- publishTime 为该角色自己决定的发布时间，必须为可解析时间（推荐 YYYY-MM-DD HH:mm 或时间戳）。',
      '',
      '【配图描述（将原样送入文生图模型，决定成片质量，务必写满视觉信息）】',
      '- 仅在需要配图时，在 text 最末尾追加单独一行，且整段 JSON 中只有这一行以「配图：」开头，格式严格为：配图：<配图描述>。不需要配图则全文不要出现「配图：」。',
      '- <配图描述>用中文写成一段完整、可执行的绘画说明：不依赖读者去看正文上文也能还原画面；禁止只写情绪词或口号（如「很美」「氛围感拉满」），必须落到能看见的内容。',
      '- 至少覆盖这些维度（可合并为流畅长句，但信息要齐）： ①需要有很强的信息说明和细节去支撑整个图片的生成(主体与数量、谁/什么物、在做什么、大致姿态、物品、文字内容文字字体、室内或户外、具体空间类型、背景里有什么...等等各方面的信息和细节的详细描述）；②整体风格需要满足世界观设定③光线与时间感；④镜头与构图（远景/中景/特写、平视或略俯/仰、主体在画面中的位置、景深是否虚化背景）。',
      '- 与角色人设、正文语气一致：同一角色发朋友圈的配图应在细节上自洽（衣着风格、居住环境档次、审美偏好等可从设定与摘录中推断）。',
      '- 慎用可识别的真人明星脸、真实品牌 Logo 与受版权保护的形象；需要人物时可写年龄段、发型、衣着风格与气质等泛化特征。',
      '- 该行内不要写「生图」「AI 生成」「这是配图说明」等元叙述；不要用 markdown；<配图描述>内部不要换行（单行一段）。',
      '- JSON 的 imageDesc：无配图则为空字符串 ""；有配图则必须与 text 里「配图：」后的文字完全一致（便于程序校验与生图）。',
      '',
      '输出 JSON 结构：',
      '{"characterName":"...","text":"...","publishTime":"YYYY-MM-DD HH:mm","imageDesc":"..."}'
    ].join('\n');

    const userPrompt = [
      '请为以下角色生成 1 条朋友圈：',
      '',
      roleBlock,
      '',
      '若需要配图：「配图：」后的描述请尽量充实（主体、环境、光线、色彩材质、构图），以便文生图稳定出片。',
      '再次强调：只输出 JSON 对象。'
    ].join('\n');

    // 强制复用 TaPages 通用封装：不在业务模块手动注入时间 system，也不直接调用 Chat.requestChatCompletions
    if (typeof TaPages === 'undefined' || !TaPages || typeof TaPages._buildAiFeatureSpec !== 'function' || typeof TaPages._runAiFeatureTask !== 'function') {
      throw new Error('通用 AI 骨架不可用');
    }
    const spec = TaPages._buildAiFeatureSpec({
      systemMessages: [systemPrompt],
      userMessage: userPrompt,
      extraPayload: { temperature: 0.75 },
      parse: (r) => String(r || '')
    });
    const { raw } = await TaPages._runAiFeatureTask(spec);
    const normalized = this._normalizeApiContent(raw);
    const parsed = this._safeParseJson(normalized);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!row || typeof row !== 'object') {
      throw new Error('AI 返回为空或格式不正确');
    }
    if (String(row?.characterName || '').trim() !== characterName) {
      throw new Error('AI 返回角色名不匹配');
    }
    return row;
  },

  async _loadCoverBg() {
    try {
      const url = await Storage.kvGet('momentsCover');
      if (url) this._applyCoverBg(url);
    } catch (e) {}
  },

  _applyCoverBg(dataUrl) {
    const el = document.querySelector('.yd-moments-cover__bg');
    if (!el) return;
    if (dataUrl) {
      el.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.05) 82%, rgba(0,0,0,0.3) 100%), url(${dataUrl})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      el.style.backgroundImage = '';
      el.style.backgroundSize = '';
      el.style.backgroundPosition = '';
    }
  },

  async renderHeader() {
    const nameEl = document.getElementById('moments-me-name');
    const avatarEl = document.getElementById('moments-me-avatar');
    if (!nameEl || !avatarEl) return;

    const me = await this._getMeProfile();
    nameEl.textContent = me.name || '我';
    if (me.avatar) {
      avatarEl.innerHTML = `<img src="${this._esc(me.avatar)}" alt="${this._esc(me.name || '我')}">`;
    } else {
      avatarEl.textContent = '👤';
    }
  },

  async renderList() {
    const listEl = document.getElementById('moments-list');
    if (!listEl) return;

    const items = await Storage.dbGetAll('moments');
    let moments = Array.isArray(items) ? items.slice() : [];
    /* 历史：主屏新建生图曾写入「壳」朋友圈；不再展示在动态里 */
    moments = moments.filter((m) => !m || m.imageStudioShellOnly !== true);
    moments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!moments.length) {
      listEl.innerHTML = `
        <div class="yd-empty" style="padding:22px 0;">
          <div class="yd-empty__icon">📷</div>
          <div class="yd-empty__text">还没有朋友圈，点击右上角发表</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    const me = await this._getMeProfile();
    const myName = me.name || '我';
    moments.forEach(m => {
      const el = document.createElement('div');
      el.className = 'yd-moment';

      const authorName = String(m?.authorName || '我');
      const authorAvatar = String(m?.authorAvatar || '');
      const rawText = String(m?.text || '');
      const parsedText = this._extractMomentTextAndImageDesc(rawText);
      const text = parsedText.text;
      const generatedImageDesc = parsedText.imageDesc;
      const images = Array.isArray(m?.images) ? m.images.filter(Boolean).slice(0, this.maxImages) : [];
      const time = this._formatMomentTime(m?.createdAt);

      const avatarHtml = authorAvatar
        ? `<img src="${this._esc(authorAvatar)}" alt="${this._esc(authorName)}">`
        : '👤';

      const imgsHtml = images.length
        ? `<div class="yd-moment__images${images.length === 1 ? ' yd-moment__images--single' : ''}">${images.map(src => `
            <div class="yd-moment__img" data-src="${this._esc(src)}">
              <img src="${this._esc(src)}" alt="图片">
            </div>
          `).join('')}</div>`
        : '';
      // 已有配图时不展示占位；无图但有说明（如生成失败）时仅显示图标占位，点按可查看说明
      const generatedImgCardHtml =
        generatedImageDesc && !images.length
          ? `<button type="button" class="yd-moment__generated-img yd-moment__generated-img--icon-only" data-action="generated-img" data-image-desc="${this._esc(generatedImageDesc)}" aria-label="配图说明（未生成图片）">
               <div class="yd-moment__generated-img-icon">🖼️</div>
             </button>`
          : '';

      const likes = Array.isArray(m?.likes) ? m.likes : [];
      const comments = Array.isArray(m?.comments) ? m.comments : [];

      const likesHtml = likes.length ? `❤️ ${likes.map(n => this._esc(n)).join('、')}` : '';
      const commentsHtml = comments.map(c => {
        const n = String(c?.name || '我');
        const replyTo = String(c?.replyTo || '').trim();
        const t = String(c?.text || '');
        if (!t) return '';
        const label = replyTo ? `${n} 回复 ${replyTo}` : n;
        return `<div class="yd-moment__comment"><b>${this._esc(label)}</b>：${this._esc(t)}</div>`;
      }).filter(Boolean).join('');

      const socialHtml = (likesHtml || commentsHtml)
        ? `<div class="yd-moment__social">
             ${likesHtml ? `<div class="yd-moment__likes">${likesHtml}</div>` : ''}
             ${commentsHtml ? `<div class="yd-moment__comments">${commentsHtml}</div>` : ''}
           </div>`
        : '';

      const hasLiked = likes.includes(myName);
      const likeSvg = '<svg class="yd-moment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
      const commentSvg = '<svg class="yd-moment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
      const moreSvg = '<svg class="yd-moment-icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>';

      el.innerHTML = `
        <div class="yd-moment__avatar">${avatarHtml}</div>
        <div class="yd-moment__body">
          <div class="yd-moment__header">
            <div class="yd-moment__name">${this._esc(authorName)}</div>
            <button type="button" class="yd-moment__more" data-action="more" aria-label="更多">${moreSvg}</button>
          </div>
          ${text ? `<div class="yd-moment__text">${this._esc(text)}</div>` : ''}
          ${generatedImgCardHtml}
          ${imgsHtml}
          <div class="yd-moment__meta">
            <div class="yd-moment__time">${this._esc(time)}</div>
            <div class="yd-moment__actions">
              <button type="button" data-action="like" aria-label="点赞" ${hasLiked ? 'class="is-liked"' : ''}>${likeSvg}</button>
              <button type="button" data-action="comment" aria-label="评论">${commentSvg}</button>
            </div>
          </div>
          ${socialHtml}
        </div>
      `;

      // 图片预览（全屏黑底 + 捏合缩放；详情 / 编辑图片弹窗 / 生图编辑）
      const descTrim = String(generatedImageDesc || '').trim();
      const mid = String(m?.id || '').trim();
      const openMomentsImageViewer = (imgSrc, originRect) => {
        if (typeof Character === 'undefined' || !Character.openImageViewer) return;
        Character.openImageViewer(String(imgSrc || '').trim(), '配图预览', {
          variant: 'moments',
          momentId: mid,
          description: descTrim,
          originRect: originRect || null,
          showChange: true,
          changeText: '换一张图',
          reselectText: '重新选择',
          onSaveDescription: async (nextDesc) => {
            if (!mid) return;
            await this._persistMomentImageDesc(mid, nextDesc);
            await this.renderList();
          },
          onOpenAlbumPick: () => {
            if (typeof Album === 'undefined' || !Album.openForMomentImagePick) {
              alert('相册未就绪，无法从相册选图');
              return;
            }
            Album.openForMomentImagePick(async (item) => {
              const dataUrl = item && item.data;
              if (!dataUrl || !mid) return;
              const mm = await Storage.dbGet('moments', mid);
              if (!mm) return;
              mm.images = [dataUrl];
              await Storage.dbPut('moments', mm);
              try {
                window.dispatchEvent(
                  new CustomEvent('yd:moments:changed', { detail: { source: 'moments_album_pick', momentId: mid } })
                );
              } catch (e) {}
              await this.renderList();
            });
          },
          onOpenStudio: () => {
            void (async () => {
              if (typeof State === 'undefined') return;
              State.momentsImageStudioStandalone = false;
              State.momentsImageStudioReturnPage = 'page-moments';
              const rid =
                typeof MomentsImageStudio !== 'undefined' &&
                typeof MomentsImageStudio.ensureFeedLinkedRecordForMoment === 'function'
                  ? await MomentsImageStudio.ensureFeedLinkedRecordForMoment(mid)
                  : null;
              State.momentsImageStudioMomentId = mid;
              State.momentsImageStudioRecordId = rid || null;
              if (State.switchPage) State.switchPage('page-moments-image-studio');
            })();
          }
        });
      };

      el.querySelectorAll('.yd-moment__img').forEach((imgWrap) => {
        imgWrap.addEventListener('click', () => {
          const src = imgWrap.getAttribute('data-src');
          if (!src) return;
          const r = imgWrap.getBoundingClientRect();
          openMomentsImageViewer(src, { left: r.left, top: r.top, width: r.width, height: r.height });
        });
      });
      el.querySelector('button[data-action="generated-img"]')?.addEventListener('click', (ev) => {
        const r = ev.currentTarget.getBoundingClientRect();
        openMomentsImageViewer('', { left: r.left, top: r.top, width: r.width, height: r.height });
      });

      // 点赞：直接切换
      el.querySelector('button[data-action="like"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const likes = Array.isArray(m.likes) ? m.likes : [];
        const beforeLiked = likes.includes(myName);
        if (!beforeLiked) likes.push(myName);
        else likes.splice(likes.indexOf(myName), 1);
        m.likes = likes;
        await Storage.dbPut('moments', m);
        // 只记录“用户点赞角色朋友圈”的正向信号，不记录取消点赞
        try {
          const authorName = String(m?.authorName || '').trim();
          if (!beforeLiked && authorName && authorName !== myName) {
            const characterId = await this._findCharacterIdByName(authorName);
            if (characterId) {
              await this._pushMomentRoleSignal(authorName, {
                kind: 'user_like',
                momentId: String(m?.id || '').trim(),
                momentAuthorName: authorName,
                momentText: String(m?.text || '').trim(),
                actorName: myName,
                text: '',
                ts: Date.now()
              });
            }
          }
        } catch (e2) {}
        await this.renderList();
      });

      // 评论：直接弹出输入
      el.querySelector('button[data-action="comment"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = prompt('评论内容');
        const t = String(text || '').trim();
        if (!t) return;
        const comments = Array.isArray(m.comments) ? m.comments : [];
        comments.push({ id: State.generateId(), name: myName, text: t, createdAt: Date.now() });
        m.comments = comments;
        await Storage.dbPut('moments', m);
        // 记录“用户评论角色朋友圈”信号，并触发角色回复一条评论
        try {
          const authorName = String(m?.authorName || '').trim();
          if (authorName && authorName !== myName) {
            const characterId = await this._findCharacterIdByName(authorName);
            if (characterId) {
              await this._pushMomentRoleSignal(authorName, {
                kind: 'user_comment',
                momentId: String(m?.id || '').trim(),
                momentAuthorName: authorName,
                momentText: String(m?.text || '').trim(),
                actorName: myName,
                text: t,
                ts: Date.now()
              });
              const replyText = await this._runCharacterReplyForMomentComment(m, t);
              if (replyText) {
                const nextComments = Array.isArray(m.comments) ? m.comments : [];
                nextComments.push({
                  id: State.generateId(),
                  name: authorName,
                  replyTo: myName,
                  text: replyText,
                  createdAt: Date.now()
                });
                m.comments = nextComments;
                await Storage.dbPut('moments', m);
                await this._pushMomentRoleSignal(authorName, {
                  kind: 'role_reply',
                  momentId: String(m?.id || '').trim(),
                  momentAuthorName: authorName,
                  momentText: String(m?.text || '').trim(),
                  actorName: authorName,
                  replyToName: myName,
                  text: replyText,
                  ts: Date.now()
                });
              }
            }
          }
        } catch (e3) {}
        await this.renderList();
      });

      // 右上角三点：弹窗 编辑/删除
      el.querySelector('button[data-action="more"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.openActionMenu(m?.id);
      });

      listEl.appendChild(el);
    });
  },

  async _generateAndAttachMomentImages(momentId, fallbackDesc) {
    const mid = String(momentId || '').trim();
    if (!mid) return;
    if (this._momentImageGenInFlight.has(mid)) return;
    this._momentImageGenInFlight.add(mid);

    try {
      const m = await Storage.dbGet('moments', mid);
      if (!m) throw new Error('朋友圈不存在');

      const parsed = this._extractMomentTextAndImageDesc(String(m?.text || ''));
      const desc = String(parsed?.imageDesc || fallbackDesc || '').trim();
      if (!desc) throw new Error('配图描述为空，无法生成');

      const imageUrls = await this._buildMomentImagesFromImageDesc(desc);
      // 生成失败时返回空数组：仍更新 moment.images，避免用户重复点“生图”时状态卡死
      m.images = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
      await Storage.dbPut('moments', m);
      try {
        window.dispatchEvent(new CustomEvent('yd:moments:changed', { detail: { source: 'moments_image_gen', momentId: mid } }));
      } catch (e) {}
    } finally {
      this._momentImageGenInFlight.delete(mid);
    }
  },

  async openActionMenu(momentId) {
    const id = String(momentId || '').trim();
    if (!id) return;
    const m = await Storage.dbGet('moments', id);
    if (!m) return;

    const overlayId = 'yd-moment-action';
    const existing = document.getElementById(overlayId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content" style="width:260px;padding:12px;border-radius:14px;">
        <button type="button" class="yd-btn" id="yd-moment-edit" style="width:100%;margin-bottom:10px;">编辑</button>
        <button type="button" class="yd-btn yd-btn--secondary" id="yd-moment-delete" style="width:100%;">删除</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector('#yd-moment-edit')?.addEventListener('click', () => {
      close();
      this.openComposer(m);
    });

    overlay.querySelector('#yd-moment-delete')?.addEventListener('click', async () => {
      if (!confirm('确定删除这条朋友圈？')) return;
      await Storage.dbDelete('moments', id);
      close();
      await this.renderList();
    });
  },

  async openComposer(editMoment = null) {
    const existing = document.getElementById('yd-moments-compose');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-moments-compose';
    modal.className = 'yd-moments-compose';
    modal.innerHTML = `
      <div class="yd-moments-compose__mask" data-close="1"></div>
      <div class="yd-moments-compose__panel" role="dialog" aria-modal="true">
        <div class="yd-moments-compose__bar">
          <div class="yd-moments-compose__title">${editMoment ? '编辑朋友圈' : '发表朋友圈'}</div>
          <button type="button" class="yd-moments-compose__btn" id="yd-moments-post" disabled>${editMoment ? '保存' : '发表'}</button>
        </div>
        <textarea class="yd-moments-compose__textarea" id="yd-moments-text" placeholder="这一刻的想法…"></textarea>
        <div class="yd-moments-compose__grid" id="yd-moments-grid">
          <div class="yd-moments-compose__thumb" id="yd-moments-add">＋</div>
        </div>
        <input type="file" id="yd-moments-file" accept="image/png,image/jpeg,image/webp" multiple style="display:none" aria-hidden="true">
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const textEl = modal.querySelector('#yd-moments-text');
    const postBtn = modal.querySelector('#yd-moments-post');
    const addBtn = modal.querySelector('#yd-moments-add');
    const fileEl = modal.querySelector('#yd-moments-file');
    const gridEl = modal.querySelector('#yd-moments-grid');

    let images = [];
    const refreshPostState = () => {
      const hasText = String(textEl?.value || '').trim().length > 0;
      const hasImg = images.length > 0;
      if (postBtn) postBtn.disabled = !(hasText || hasImg);
    };

    const renderGrid = () => {
      if (!gridEl) return;
      const thumbs = images.map(src => `
        <div class="yd-moments-compose__thumb" data-src="${this._esc(src)}">
          <img src="${this._esc(src)}" alt="图片">
        </div>
      `).join('');
      const canAdd = images.length < this.maxImages;
      gridEl.innerHTML = thumbs + (canAdd ? `<div class="yd-moments-compose__thumb" id="yd-moments-add">＋</div>` : '');
      gridEl.querySelector('#yd-moments-add')?.addEventListener('click', () => fileEl?.click());
      refreshPostState();
    };

    if (editMoment) {
      textEl.value = String(editMoment.text || '');
      images = Array.isArray(editMoment.images) ? editMoment.images.slice(0, this.maxImages) : [];
      renderGrid();
    }

    textEl?.addEventListener('input', refreshPostState);
    addBtn?.addEventListener('click', () => fileEl?.click());

    fileEl?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).slice(0, this.maxImages - images.length);
      for (const f of files) {
        const dataUrl = await this._readFileAsDataUrl(f);
        if (dataUrl) images.push(dataUrl);
      }
      e.target.value = '';
      renderGrid();
    });

    postBtn?.addEventListener('click', async () => {
      const text = String(textEl?.value || '').trim();
      const me = await this._getMeProfile();
      if (editMoment) {
        editMoment.text = text;
        editMoment.images = images.slice(0, this.maxImages);
        await Storage.dbPut('moments', editMoment);
      } else {
        const moment = {
          id: State.generateId(),
          createdAt: Date.now(),
          authorName: me.name || '我',
          authorAvatar: me.avatar || '',
          text,
          images: images.slice(0, this.maxImages),
          likes: [],
          comments: []
        };
        await Storage.dbAdd('moments', moment);
        close();
        await this.renderList();
        void this._runMomentEngagementAi(moment).catch((err) => {
          console.error('[Moments] engagement AI failed:', err);
        });
        return;
      }
      close();
      await this.renderList();
    });

    refreshPostState();
  },

  async _getCharacterMap() {
    try {
      if (typeof Chat !== 'undefined' && Chat && typeof Chat.getCharacterMap === 'function') {
        return await Chat.getCharacterMap(true);
      }
    } catch (e) {}
    return new Map();
  },

  _aggregateMessagesBySession(allMessages) {
    const bySession = new Map();
    const list = Array.isArray(allMessages) ? allMessages : [];
    for (const msg of list) {
      const sid = String(msg?.sessionId || '').trim();
      if (!sid) continue;
      const t = Number(msg?.createdAt || msg?.ts || 0) || 0;
      const cur = bySession.get(sid) || { count: 0, lastAt: 0 };
      cur.count += 1;
      if (t > cur.lastAt) cur.lastAt = t;
      bySession.set(sid, cur);
    }
    return bySession;
  },

  /**
   * 常聊：按会话消息最近活跃度排序，取最多 5 个不同角色（用角色名展示，内部用 session 拉最近聊天）
   */
  async _pickTopChatCharacters(max = 5) {
    const sessions = await Storage.dbGetAll('sessions');
    const messages = await Storage.dbGetAll('messages');
    const agg = this._aggregateMessagesBySession(messages);
    const map = await this._getCharacterMap();

    const rows = (Array.isArray(sessions) ? sessions : [])
      .map((s) => {
        const ids = Array.isArray(s?.participantCharacterIds) && s.participantCharacterIds.length
          ? s.participantCharacterIds.filter(Boolean).map(String)
          : (s?.characterId ? [String(s.characterId)] : []);
        const a = agg.get(String(s?.id || '')) || { count: 0, lastAt: 0 };
        const score = (Number(a.lastAt) || 0) + (Number(a.count) || 0) * 1000;
        return { session: s, ids, score };
      })
      .filter((r) => r.ids.length)
      .sort((a, b) => b.score - a.score);

    const seen = new Set();
    const seenNames = new Set();
    const out = [];
    for (const row of rows) {
      for (const cid of row.ids) {
        if (seen.has(cid)) continue;
        const ch = map.get(cid);
        const name = String(ch?.name || '').trim();
        if (!name || seenNames.has(name)) continue;
        seen.add(cid);
        seenNames.add(name);
        out.push({
          characterId: cid,
          name,
          description: String(ch?.description || '').trim().slice(0, 500),
          sessionId: String(row.session?.id || '')
        });
        if (out.length >= max) return { candidates: out, allMessages: messages };
      }
    }
    return { candidates: out, allMessages: messages };
  },

  _getRecentChatSnippet(allMessages, sessionId, maxLines = 14) {
    const sid = String(sessionId || '').trim();
    if (!sid) return '';
    const list = (Array.isArray(allMessages) ? allMessages : [])
      .filter((m) => String(m?.sessionId || '') === sid)
      .sort((a, b) => (Number(a?.createdAt || 0) || 0) - (Number(b?.createdAt || 0) || 0));
    const tail = list.slice(-maxLines);
    return tail
      .map((m) => {
        const who = m.role === 'user'
          ? '用户'
          : String(m.characterName || '角色').trim() || '角色';
        const text = String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 220);
        return `${who}：${text}`;
      })
      .filter(Boolean)
      .join('\n');
  },

  _normalizeApiContent(content) {
    if (content == null || content === '') return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return String(content);
    return content
      .map((p) => (p && typeof p.text === 'string') ? p.text : (p && typeof p.content === 'string') ? p.content : '')
      .filter(Boolean)
      .join('');
  },

  _parseMomentEngagementResponse(raw, momentId, allowedNames) {
    const mid = String(momentId || '').trim();
    const allowed = new Set(Array.from(allowedNames || []).map((n) => String(n || '').trim()).filter(Boolean));
    const lines = String(raw || '').split('\n').map((l) => String(l || '').trim()).filter(Boolean);
    const commentByName = new Map();
    const liked = new Set();
    for (const line of lines) {
      let m = line.match(/^\[朋友圈点赞\](.+)$/);
      if (m) {
        const payload = String(m[1] || '').trim();
        const parts = payload.split('|').map((s) => String(s || '').trim());
        if (parts.length >= 2 && parts[0] === mid && allowed.has(parts[1])) {
          liked.add(parts[1]);
        }
        continue;
      }
      m = line.match(/^\[朋友圈评论\](.+)$/);
      if (m) {
        const payload = String(m[1] || '').trim();
        const i0 = payload.indexOf('|');
        if (i0 < 0) continue;
        const i1 = payload.indexOf('|', i0 + 1);
        if (i1 < 0) continue;
        const id = payload.slice(0, i0).trim();
        const name = payload.slice(i0 + 1, i1).trim();
        const text = payload.slice(i1 + 1).trim();
        if (id === mid && allowed.has(name) && text) {
          commentByName.set(name, { type: 'comment', name, text });
        }
      }
    }
    const out = Array.from(commentByName.values());
    for (const name of liked) {
      out.push({ type: 'like', name });
    }
    return out;
  },

  async _applyMomentEngagement(momentId, actions) {
    const id = String(momentId || '').trim();
    if (!id || !actions.length) return;
    const m = await Storage.dbGet('moments', id);
    if (!m) return;
    const likes = Array.isArray(m.likes) ? m.likes.slice() : [];
    const comments = Array.isArray(m.comments) ? m.comments.slice() : [];
    for (const act of actions) {
      if (act.type === 'like') {
        const n = String(act.name || '').trim();
        if (n && !likes.includes(n)) likes.push(n);
      } else if (act.type === 'comment') {
        const n = String(act.name || '').trim();
        const t = String(act.text || '').trim();
        if (n && t) {
          comments.push({
            id: (typeof State !== 'undefined' && State.generateId) ? State.generateId() : (Date.now() + Math.random()).toString(36),
            name: n,
            text: t,
            createdAt: Date.now()
          });
        }
      }
    }
    m.likes = likes;
    m.comments = comments;
    await Storage.dbPut('moments', m);
    try {
      window.dispatchEvent(new CustomEvent('yd:moments:changed', { detail: { source: 'moment_engagement_ai', momentId: id } }));
    } catch (e) {}
  },

  _notifyMomentEngagementResult(body) {
    const b = String(body || '').trim();
    if (!b) return;
    try {
      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        Notifications.enqueue('朋友圈', '', b, 0, '消息');
      }
    } catch (e) {}
  },

  // 开启「多模态自动识图」且 URL 可被 API 接受时，收集朋友圈配图（与聊天侧规则一致）
  _collectMomentVisionImageUrls(moment, cap = 9) {
    const urls = [];
    const max = Math.min(Math.max(Number(cap) || 9, 1), 24);
    const arr = Array.isArray(moment?.images) ? moment.images.filter(Boolean) : [];
    let visionOn = false;
    try {
      visionOn =
        typeof ChatMessageBuilder !== 'undefined' &&
        ChatMessageBuilder.isAutoVisionEnabled &&
        ChatMessageBuilder.isAutoVisionEnabled();
    } catch (e) {
      visionOn = false;
    }
    if (!visionOn || !arr.length) return urls;
    for (const it of arr) {
      const u =
        typeof it === 'string'
          ? String(it).trim()
          : String(it?.url || it?.src || it?.dataUrl || '').trim();
      if (!u) continue;
      try {
        if (
          typeof ChatMessageBuilder !== 'undefined' &&
          ChatMessageBuilder.isVisionImageUrlForApi &&
          ChatMessageBuilder.isVisionImageUrlForApi(u)
        ) {
          urls.push(u);
          if (urls.length >= max) break;
        }
      } catch (e2) {}
    }
    return urls;
  },

  _buildMomentEngagementPrompt(moment, candidates) {
    const mid = String(moment?.id || '').trim();
    const text = String(moment?.text || '').trim();
    const imgN = Array.isArray(moment?.images) ? moment.images.filter(Boolean).length : 0;
    const visionN = this._collectMomentVisionImageUrls(moment).length;
    const lines = [];
    lines.push(`目标 momentId（必须原样使用）：${mid}`);
    lines.push(`朋友圈正文：${text || '（无文字）'}`);
    lines.push(
      visionN
        ? `附图：${visionN} 张（本请求将附带配图，请结合画面与文字理解）`
        : imgN
          ? `附图：${imgN} 张（只需根据文字与常识想象，不要编造具体画面细节）`
          : '附图：无'
    );
    lines.push('');
    lines.push('候选角色（角色名必须完全一致，从中选择，不要编造）：');
    candidates.forEach((c, idx) => {
      lines.push(`${idx + 1}. 角色名：${c.name}`);
      if (c.description) lines.push(`   人设摘要：${c.description}`);
      const snip = this._getRecentChatSnippet(c._allMessages || [], c.sessionId, 14);
      lines.push(snip ? `   与用户最近聊天摘录：\n${snip.split('\n').map((l) => '   ' + l).join('\n')}` : '   与用户最近聊天摘录：（暂无）');
      lines.push('');
    });
    const n = candidates.length;
    lines.push(`最近常聊的 ${n} 个候选角色必须每人各评论 1 条（共 ${n} 条评论，不得遗漏任一角色）。`);
    lines.push('是否点赞仍由你判断：在候选角色中自行决定谁会额外点赞（可不输出任何点赞行；已评论的角色也可以点赞）。');
    lines.push('输出要求：只输出协议行，不要其它说明。');
    lines.push(`评论格式：[朋友圈评论]${mid}|角色名|评论正文`);
    lines.push(`点赞格式：[朋友圈点赞]${mid}|角色名`);
    lines.push('评论正文单行、不要换行，不要出现 ]，尽量少用 |。评论必须输出满候选人数；点赞行最多 5 行。');
    return lines.join('\n');
  },

  _buildMomentEngagementTask(moment, candidates) {
    const m = moment && moment.id ? moment : null;
    const list = Array.isArray(candidates) ? candidates : [];
    if (!m || !list.length) return null;
    if (typeof TaPages === 'undefined' || !TaPages || typeof TaPages._buildAiFeatureSpec !== 'function') {
      throw new Error('通用 AI 骨架不可用');
    }

    const mid = String(m.id || '').trim();
    const candidateCount = list.length;
    const systemRoleAndGoal = [
      '你是「手机里的朋友圈」互动模拟器。',
      `目标：根据用户刚发的一条朋友圈，以及最近常聊的 ${candidateCount} 个候选角色信息生成互动。`,
      `- 评论：候选列表中的每个角色都必须各发 1 条评论（共 ${candidateCount} 条，不得遗漏任一角色名）。`,
      '- 点赞：在候选角色中由你判断谁会点赞（可选，可不输出任何点赞行；已评论的角色也可以额外点赞）。'
    ].join('\n');

    const visionUrls = this._collectMomentVisionImageUrls(m, this.maxImages || 9);
    const imgN = Array.isArray(m?.images) ? m.images.filter(Boolean).length : 0;
    const systemMomentContext = [
      `目标 momentId（必须原样使用）：${mid}`,
      `朋友圈正文：${String(m?.text || '').trim() || '（无文字）'}`,
      visionUrls.length
        ? `附图：${visionUrls.length} 张（已通过多模态消息附带，请结合画面与文字理解；不要编造图中不存在的细节）`
        : imgN
          ? `附图：${imgN} 张（当前未附带图像，只需根据文字与常识想象，不要编造具体画面细节）`
          : '附图：无'
    ].join('\n');

    const systemCandidatesContext = [
      '候选角色（角色名必须完全一致，从中选择，不要编造）：',
      ...list.map((c, idx) => {
        const name = String(c?.name || '').trim();
        const desc = String(c?.description || '').trim();
        const snip = this._getRecentChatSnippet(c?._allMessages || [], c?.sessionId, 14);
        return [
          `${idx + 1}. 角色名：${name}`,
          desc ? `   人设摘要：${desc}` : '',
          snip ? `   与用户最近聊天摘录：\n${snip.split('\n').map((l) => '   ' + l).join('\n')}` : '   与用户最近聊天摘录：（暂无）'
        ].filter(Boolean).join('\n');
      })
    ].join('\n');

    const systemOutputContractAndExample = [
      '输出必须是协议行，每行一条，禁止 markdown、禁止 JSON、禁止解释。',
      '角色名必须与候选列表中的名字完全一致（逐字）。momentId 必须与 system 提供的目标 momentId 完全一致。',
      `评论格式：[朋友圈评论]${mid}|角色名|评论正文`,
      `点赞格式：[朋友圈点赞]${mid}|角色名`,
      '评论正文单行、不要换行，不要出现 ]，尽量少用 |。',
      `必须输出 ${candidateCount} 条评论（候选角色每人 1 条）；点赞行 0～${candidateCount} 条，由你决定是否点赞。`
    ].join('\n');

    const userMessage = [
      `请为全部 ${candidateCount} 个候选角色各生成 1 条评论，并自行决定其中哪些角色会点赞。`,
      '只输出协议行，不要其它说明。'
    ].join('\n');

    let userContentParts = null;
    if (visionUrls.length) {
      const parts = [{ type: 'text', text: userMessage }];
      visionUrls.forEach((url) => parts.push({ type: 'image_url', image_url: { url } }));
      userContentParts = parts;
    }

    return {
      spec: TaPages._buildAiFeatureSpec({
        systemMessages: [
          systemRoleAndGoal,
          systemMomentContext,
          systemCandidatesContext,
          systemOutputContractAndExample
        ],
        userMessage,
        userContentParts,
        parse: (raw) => String(raw || '')
      })
    };
  },

  async _runMomentEngagementAi(moment) {
    const m = moment && moment.id ? moment : null;
    if (!m) return;
    if (this._momentEngagementInFlight.has(m.id)) return;
    this._momentEngagementInFlight.add(m.id);

    try {
      // 强制复用 TaPages 通用封装（禁止业务模块自建 request/messages/run）
      if (typeof TaPages === 'undefined' || !TaPages || typeof TaPages._buildAiFeatureSpec !== 'function' || typeof TaPages._runAiFeatureTask !== 'function') {
        throw new Error('通用 AI 骨架不可用');
      }

      const { candidates, allMessages } = await this._pickTopChatCharacters(5);
      if (!candidates.length) return;

      candidates.forEach((c) => { c._allMessages = allMessages; });
      const task = this._buildMomentEngagementTask(m, candidates);
      if (!task) return;
      const { raw } = await TaPages._runAiFeatureTask(task.spec);
      let rawContent = this._normalizeApiContent(raw);
      rawContent = String(rawContent || '').trim();
      if (rawContent.startsWith('```')) {
        rawContent = rawContent.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }
      const allowedNames = candidates.map((c) => c.name);
      const actions = this._parseMomentEngagementResponse(rawContent, m.id, allowedNames);
      const nLike = actions.filter((a) => a.type === 'like').length;
      const nCom = actions.filter((a) => a.type === 'comment').length;
      const expectedCom = candidates.length;
      if (actions.length) {
        const parts = [];
        if (nCom) parts.push(`${nCom}条评论`);
        if (nLike) parts.push(`${nLike}个点赞`);
        let msg = `已收到回复：${parts.join('、')}`;
        if (nCom < expectedCom) {
          msg += `（应有 ${expectedCom} 条评论，部分未生成）`;
        }
        this._notifyMomentEngagementResult(msg);
      } else {
        this._notifyMomentEngagementResult('已收到回复：暂未生成评论');
      }
      if (actions.length) {
        await this._applyMomentEngagement(m.id, actions);
      }
      if (typeof State !== 'undefined' && State.currentPage === 'page-moments') {
        await this.renderList();
      }
    } finally {
      this._momentEngagementInFlight.delete(m.id);
    }
  },

  async _getMeProfile() {
    // 优先默认面具；没有则回退 “我”
    try {
      const defaultId = Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID);
      if (defaultId) {
        const mask = await Storage.dbGet('masks', defaultId);
        if (mask) {
          return {
            name: String(mask.name || '我'),
            avatar: String(mask.avatar || '')
          };
        }
      }
    } catch (e) {}
    return { name: '我', avatar: '' };
  },

  _formatMomentTime(ts) {
    const t = Number(ts || 0);
    if (!t) return '';
    const d = new Date(t);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const mo = d.getMonth() + 1;
    const da = d.getDate();
    return `${mo}月${da}日 ${hh}:${mm}`;
  },

  _readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      if (!file) return resolve('');
      if (!file.type.match(/^image\/(png|jpeg|webp)$/)) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  },

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};


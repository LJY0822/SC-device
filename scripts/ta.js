// ta 的手机
const TaPages = {
  /** 本页选中的「角色」characters.id（不是面具） */
  STORAGE_KEY_TA_PHONE_CHARACTER: 'ta_phone_character_id_v1',
  STORAGE_KEY_TA_PHONE_TAB: 'ta_phone_tab_v1',
  STORAGE_KEY_TA_PHONE_SEG: 'ta_phone_seg_v1',
  STORAGE_KEY_TA_PHONE_SNAPSHOT: 'ta_phone_snapshot_cache_v1',

  _taPhoneUiInited: false,
  _taPhoneSnapshotInFlight: false,
  /** 最近一次 apply 的会话行（含 thread messages），供点进会话页渲染 */
  _taPhoneLastChatRows: null,

  init() {
    document.getElementById('ta-phone-back')?.addEventListener('click', () => {
      const returnPage = String(State.taFeatureReturnPage || '').trim();
      const returnSid = String(State.taFeatureReturnSessionId || '').trim();
      State.taFeatureReturnPage = null;
      State.taFeatureReturnSessionId = null;
      if (returnPage === 'page-chat') {
        if (returnSid && typeof Chat !== 'undefined' && Chat) Chat.currentSessionId = returnSid;
        State.switchPage('page-chat');
        return;
      }
      State.backToHome();
    });
    document.getElementById('ta-room-back')?.addEventListener('click', () => State.backToHome());
    document.getElementById('ta-diary-back')?.addEventListener('click', () => State.backToHome());

    document.getElementById('ta-phone-gate-btn')?.addEventListener('click', async () => {
      await this.openTaPhoneSwitch();
    });

    document.getElementById('ta-phone-switch')?.addEventListener('click', async () => {
      await this.openTaPhoneSwitch();
    });
    document.getElementById('ta-phone-refresh')?.addEventListener('click', async (e) => {
      const btn = e?.currentTarget;
      if (btn) btn.classList.add('is-loading');
      try {
        await this.refreshTaPhoneHeader();
        await this.fetchTaPhoneSnapshot({ force: true });
      } finally {
        if (btn) btn.classList.remove('is-loading');
      }
    });

    window.addEventListener('yd:pagechange', async (e) => {
      const to = e?.detail?.to;
      const from = e?.detail?.from;
      if (to === 'page-ta-phone' && from !== 'page-chat') {
        State.taFeatureReturnPage = null;
        State.taFeatureReturnSessionId = null;
      }
      if (to === 'page-ta-phone') {
        await this.refreshTaPhoneHeader();
        this._initTaPhoneUiOnce();
        this._restoreTaPhoneUiState();
        this._syncTaPhoneGate();
        const characterId = this._getTaCharacterId();
        if (!characterId) {
          return;
        }
        const cached = this._loadSnapshotCache();
        if (cached && cached.parsed && cached.characterId === characterId) {
          this.applyTaPhoneSnapshot(cached.parsed);
        }
        // 进入本页仅用缓存；点刷新或更换角色后再请求 API
      }
    });
  },

  /** 刷新成功后顶部标准通知（Notifications.enqueue） */
  _notifyTaPhoneSnapshotReady(displayName) {
    const name = String(displayName || '').trim() || 'ta';
    try {
      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        Notifications.enqueue('ta的手机', `${name}的手机`, `已解锁${name}的手机`);
      }
    } catch (e) {}
  },

  _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  _firstGrapheme(s) {
    const t = String(s || '').trim();
    if (!t) return '';
    const arr = [...t];
    return arr[0] || '';
  },

  /** 仅使用本页「切换」中显式选中的角色 id（characters 表），无默认回退 */
  _getTaCharacterId() {
    return String(Storage.get(this.STORAGE_KEY_TA_PHONE_CHARACTER) || '').trim();
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

  _syncTaPhoneGate() {
    const characterId = this._getTaCharacterId();
    const gate = document.getElementById('ta-phone-gate');
    const device = document.getElementById('ta-phone-device');
    const refresh = document.getElementById('ta-phone-refresh');
    const has = !!characterId;
    if (gate) gate.hidden = has;
    if (device) device.hidden = !has;
    if (refresh) refresh.disabled = !has;
  },

  _resetTaPhoneDevicePreview() {
    const ph = document.getElementById('ta-phone-browser-placeholder');
    if (ph) ph.textContent = '搜索或输入网址';
    this.applyTaPhoneSnapshot({
      status: '正在生成界面…',
      chatRows: [],
      browser: { addr: '', chips: [], recents: [] },
      wish: [],
      orders: []
    });
  },

  _buildCharacterProfileText(c) {
    if (!c || typeof c !== 'object') return '';
    const parts = [];
    const name = String(c.name || '').trim();
    if (name) parts.push(`名称：${name}`);
    const desc = String(c.description || '').trim();
    if (desc) parts.push(`描述：${desc}`);
    const pers = String(c.personality || '').trim();
    if (pers) parts.push(`性格：${pers}`);
    const scen = String(c.scenario || '').trim();
    if (scen) parts.push(`场景：${scen}`);
    const sp = String(c.system_prompt || '').trim();
    if (sp) {
      parts.push(
        `系统提示（摘要）：${sp.length > 1400 ? sp.slice(0, 1400) + '…' : sp}`
      );
    }
    const ex = String(c.mes_example || '').trim();
    if (ex) {
      parts.push(
        `对话示例（摘要）：${ex.length > 700 ? ex.slice(0, 700) + '…' : ex}`
      );
    }
    const fm = String(c.first_mes || '').trim();
    if (fm) {
      parts.push(`开场白：${fm.length > 500 ? fm.slice(0, 500) + '…' : fm}`);
    }
    return parts.join('\n');
  },

  _compactMessageForTaContext(raw) {
    let s = String(raw || '');
    s = s.replace(/```[\s\S]*?```/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length > 420) s = s.slice(0, 420) + '…';
    return s;
  },

  // ta 手机聊天摘录时间格式：YYYY-MM-DD HH:mm
  _formatTaPhoneChatTime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  },

  // 解析协议前缀中的说话人，例如：[消息|霍沉] / [动作|霍沉]
  _extractSpeakerFromProtocolPrefix(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const m = s.match(/^\[(?:消息|对白|对话|动作|语音|图片|表情包|转账|红包|邀请|分享|css美化)\|([^\]]+)\]/);
    return m ? String(m[1] || '').trim() : '';
  },

  // 对话正文规范化：把 [消息|霍沉] 归一为 [消息]，便于“发言人：内容”稳定展示。
  _normalizeTaPhoneDialogueContent(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.replace(
      /^\[(消息|对白|对话|动作|语音|图片|表情包|转账|红包|邀请|分享|css美化)\|[^\]]+\]/,
      '[$1]'
    );
  },

  /**
   * 按会话解析「用户」信息：会话 maskId → 默认面具 → 兜底「用户」。
   * 返回 Map<sessionId, { name: string, detail: string }>
   */
  async _buildTaPhoneUserLabelsBySession(sessionById) {
    const out = new Map();
    const defaultMaskId = String(Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '').trim();
    const maskIds = new Set();
    if (defaultMaskId) maskIds.add(defaultMaskId);
    for (const s of sessionById.values()) {
      const mid = String(s?.maskId || '').trim();
      if (mid) maskIds.add(mid);
    }
    const maskInfo = new Map();
    for (const id of maskIds) {
      try {
        const mask = await Storage.dbGet('masks', id);
        const n = String(mask?.name || '').trim();
        const d = String(mask?.detail || '').trim();
        if (n || d) maskInfo.set(id, { name: n, detail: d });
      } catch (e) {}
    }
    for (const [sid, s] of sessionById.entries()) {
      const explicit = String(s?.maskId || '').trim();
      const useId = explicit || defaultMaskId;
      const info = useId ? maskInfo.get(useId) : null;
      const name = String(info?.name || '').trim() || '用户';
      const detail = String(info?.detail || '').trim();
      out.set(sid, { name, detail });
    }
    return out;
  },

  /**
   * 为「ta 手机」摘录行显示说话人：面具名或用户 / 角色名 / 系统；群聊里非本角色用消息上的 characterName。
   */
  _speakerLabelForTaPhoneMessage(m, characterId, displayName, sessionById, userLabelBySessionId) {
    const cid = String(characterId || '').trim();
    const cn = String(displayName || '').trim() || 'ta';
    const role = String(m?.role || '');
    if (role === 'user') {
      const sid = String(m?.sessionId || '');
      if (userLabelBySessionId && userLabelBySessionId.has(sid)) {
        const info = userLabelBySessionId.get(sid);
        const n = String(info?.name || '').trim();
        if (n) return n;
      }
      return '用户';
    }
    if (role === 'system') return '系统';
    const mid = String(m?.characterId || '').trim();
    if (mid && mid === cid) return cn;
    const mn = String(m?.characterName || '').trim();
    if (mn) return mn;
    if (mid && mid !== cid) return '对方';
    const sid = m?.sessionId;
    const s = sid && sessionById && sessionById.get ? sessionById.get(sid) : null;
    if (s && !mid) {
      const parts = Array.isArray(s.participantCharacterIds)
        ? s.participantCharacterIds.filter(Boolean).map(String)
        : [];
      const legacy = String(s.characterId || '').trim();
      if (parts.length === 1 && parts[0] === cid) return cn;
      if (!parts.length && legacy === cid) return cn;
    }
    return '对方';
  },

  _getTaPhoneSessionSummaryText(session) {
    if (!session || typeof session !== 'object') return '';
    const parts = [];
    try {
      const history = Array.isArray(session.memoryEnhanceHistory) ? session.memoryEnhanceHistory : [];
      const enabled = history.filter((e) => e && e.enabled !== false && String(e.text || '').trim());
      enabled.sort((a, b) => Number(a.userRoundFrom || 0) - Number(b.userRoundFrom || 0));
      enabled.forEach((e) => parts.push(String(e.text || '').trim()));
    } catch (e) {}
    try {
      const online = String(session.onlineMemoryText || '').trim();
      if (online) parts.push(online);
    } catch (e) {}
    try {
      const offline = String(session.offlineMemoryText || '').trim();
      if (offline) parts.push(offline);
    } catch (e) {}
    const uniq = [];
    const seen = new Set();
    for (const raw of parts) {
      const t = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      uniq.push(t);
    }
    const joined = uniq.join('\n');
    return joined.length > 380 ? `${joined.slice(0, 380)}…` : joined;
  },

  _getTaPhoneSessionTypeLabel(session, characterId) {
    if (!session) return '单聊';
    const cid = String(characterId || '').trim();
    const parts = Array.isArray(session.participantCharacterIds)
      ? session.participantCharacterIds.filter(Boolean).map((x) => String(x))
      : [];
    if (parts.length > 1) return '群聊';
    if (parts.length === 1 && parts[0] !== cid) return '群聊';
    return '单聊';
  },

  _getTaPhoneSessionTitle(session, characterName = '') {
    const byTitle = String(session?.title || '').trim();
    if (byTitle) return byTitle;
    const names = Array.isArray(session?.participantCharacterNames)
      ? session.participantCharacterNames.filter(Boolean).map((x) => String(x).trim()).filter(Boolean)
      : [];
    if (names.length) return names.join('、');
    return String(characterName || '').trim() || '会话';
  },

  _buildTaPhoneSessionTranscriptHeader(session, characterId, displayName, userLabelBySessionId) {
    const sid = String(session?.id || '').trim();
    const userInfo = (() => {
      if (userLabelBySessionId && userLabelBySessionId.get && sid) {
        const v = userLabelBySessionId.get(sid);
        if (v && typeof v === 'object') return v;
      }
      return { name: '用户', detail: '' };
    })();
    const userLabel = String(userInfo?.name || '').trim() || '用户';
    const userDetail = String(userInfo?.detail || '').replace(/\s+/g, ' ').trim() || '无';
    const typeLabel = this._getTaPhoneSessionTypeLabel(session, characterId);
    const title = this._getTaPhoneSessionTitle(session, displayName);
    if (typeLabel === '群聊') {
      const participantNames = Array.isArray(session?.participantCharacterNames)
        ? session.participantCharacterNames.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const names = Array.from(new Set([userLabel, ...participantNames]));
      const groupNames = names.length ? names.join('、') : `${userLabel}、${title}`;
      return `【手机线上的群聊聊天记录】${groupNames}的聊天会话\n【用户方信息】当前用户昵称：${userLabel}。用户设定：${userDetail}。`;
    }
    return `【手机线上的聊天记录】${userLabel}与${title}的聊天会话\n【用户方信息】当前用户昵称：${userLabel}。用户设定：${userDetail}。`;
  },

  _pickTaPhoneContextSessions(sessions, characterId) {
    const list = Array.isArray(sessions) ? sessions.slice() : [];
    list.sort((a, b) => (Number(b?.updatedAt || b?.createdAt || 0) || 0) - (Number(a?.updatedAt || a?.createdAt || 0) || 0));
    const singles = [];
    const groups = [];
    for (const s of list) {
      if (this._getTaPhoneSessionTypeLabel(s, characterId) === '群聊') groups.push(s);
      else singles.push(s);
    }
    const out = [];
    const maxTotalSessions = 8;
    const maxSingleSessions = 4;
    const maxGroupSessions = 4;
    for (const s of singles.slice(0, maxSingleSessions)) out.push(s);
    for (const s of groups.slice(0, maxGroupSessions)) out.push(s);
    out.sort((a, b) => (Number(b?.updatedAt || b?.createdAt || 0) || 0) - (Number(a?.updatedAt || a?.createdAt || 0) || 0));
    return out.slice(0, maxTotalSessions);
  },

  async _buildRecentChatTranscriptForCharacter(characterId, maxMsgs = 56, characterName = '') {
    const cid = String(characterId || '').trim();
    const displayName = String(characterName || '').trim() || 'ta';
    if (!cid) return '（未选择角色，无聊天记录）';
    try {
      const sessions = await Storage.dbGetAll('sessions');
      const sessionById = new Map();
      for (const s of Array.isArray(sessions) ? sessions : []) {
        if (!s || !s.id || !this._sessionInvolvesCharacter(s, cid)) continue;
        sessionById.set(s.id, s);
      }
      const ids = new Set(sessionById.keys());
      if (!ids.size) {
        return '（暂无与该角色的聊天会话；可先去聊天里与该角色开聊或加入含该角色的群聊）';
      }
      const selectedSessions = this._pickTaPhoneContextSessions(Array.from(sessionById.values()), cid);
      const selectedIds = new Set(selectedSessions.map((s) => String(s.id || '')));
      if (!selectedIds.size) {
        return '（暂无可用会话上下文）';
      }
      const userLabelBySessionId = await this._buildTaPhoneUserLabelsBySession(sessionById);
      const all = await Storage.dbGetAll('messages');
      const rows = (Array.isArray(all) ? all : [])
        .filter((m) => m && selectedIds.has(String(m.sessionId || '')))
        .filter((m) => !m._pending && !m._localOnly && m.role !== 'memory');
      rows.sort((a, b) => (Number(a?.createdAt || 0) || 0) - (Number(b?.createdAt || 0) || 0));
      if (!rows.length) return '（相关会话中暂无消息）';

      const bySession = new Map();
      for (const m of rows) {
        const sid = String(m?.sessionId || '');
        if (!sid) continue;
        if (!bySession.has(sid)) bySession.set(sid, []);
        bySession.get(sid).push(m);
      }

      const blocks = [];
      // 单聊：按“对话轮数 chat_rounds”取最近窗口；群聊：才使用动态预算截断
      const rounds = typeof resolveStoredChatRoundsNum === 'function'
        ? resolveStoredChatRoundsNum()
        : Math.max(
          1,
          parseInt(Storage.get(CONFIG.STORAGE_KEYS.CHAT_ROUNDS) || '200', 10) || 200
        );
      const singleAllow = Math.max(2, rounds * 2); // 约等于 rounds 轮的 user+assistant
      const maxPerSession = Math.max(6, Math.min(16, Math.floor(Number(maxMsgs) / 4) || 12));
      let leftTotal = Math.max(24, Number(maxMsgs) || 56); // 仅用于群聊预算

      const singles = [];
      const groups = [];
      for (const s of selectedSessions) {
        if (this._getTaPhoneSessionTypeLabel(s, cid) === '群聊') groups.push(s);
        else singles.push(s);
      }

      // 先处理单聊（不计入群聊动态预算）
      for (const s of singles) {
        const sid = String(s?.id || '');
        const list = bySession.get(sid) || [];
        if (!list.length) continue;
        const tail = list.slice(-Math.min(singleAllow, list.length));
        const lines = tail
          .map((m) => {
            const fallbackWho = this._speakerLabelForTaPhoneMessage(
              m,
              cid,
              displayName,
              sessionById,
              userLabelBySessionId
            );
            const compact = this._compactMessageForTaContext(m.content);
            const line = this._normalizeTaPhoneDialogueContent(compact);
            if (!line) return '';
            const protoWho = this._extractSpeakerFromProtocolPrefix(compact);
            const who = protoWho || fallbackWho;
            const at = this._formatTaPhoneChatTime(m?.createdAt);
            return at ? `[${at}] ${who}：${line}` : `${who}：${line}`;
          })
          .filter(Boolean);
        const header = this._buildTaPhoneSessionTranscriptHeader(
          s,
          cid,
          displayName,
          userLabelBySessionId
        );
        const summary = this._getTaPhoneSessionSummaryText(s);
        const seg = [
          header,
          `【近期摘要】${summary || '无'}`,
          '【真实线上聊天对话记录】',
          ...(lines.length ? lines : ['（暂无可用聊天记录）'])
        ].filter(Boolean).join('\n');
        blocks.push(seg);
      }

      // 再处理群聊（使用动态预算）
      for (const s of groups) {
        if (leftTotal <= 0) break;
        const sid = String(s?.id || '');
        const list = bySession.get(sid) || [];
        if (!list.length) continue;
        const allow = Math.max(2, Math.min(maxPerSession, leftTotal));
        const tail = list.slice(-allow);
        leftTotal -= tail.length;
        const lines = tail
          .map((m) => {
            const fallbackWho = this._speakerLabelForTaPhoneMessage(
              m,
              cid,
              displayName,
              sessionById,
              userLabelBySessionId
            );
            const compact = this._compactMessageForTaContext(m.content);
            const line = this._normalizeTaPhoneDialogueContent(compact);
            if (!line) return '';
            const protoWho = this._extractSpeakerFromProtocolPrefix(compact);
            const who = protoWho || fallbackWho;
            const at = this._formatTaPhoneChatTime(m?.createdAt);
            return at ? `[${at}] ${who}：${line}` : `${who}：${line}`;
          })
          .filter(Boolean);
        const header = this._buildTaPhoneSessionTranscriptHeader(
          s,
          cid,
          displayName,
          userLabelBySessionId
        );
        const summary = this._getTaPhoneSessionSummaryText(s);
        const seg = [
          header,
          `【近期摘要】${summary || '无'}`,
          '【真实线上聊天对话记录】',
          ...(lines.length ? lines : ['（暂无可用聊天记录）'])
        ].filter(Boolean).join('\n');
        blocks.push(seg);
      }
      if (!blocks.length) return '（相关会话中暂无可用摘录）';
      return blocks.join('\n\n');
    } catch (e) {
      console.warn('[ta-phone] chat transcript', e);
      return '（读取聊天记录失败）';
    }
  },

  async _buildForumSignalsContextForCharacter(characterName = '', maxItems = 8) {
    const name = String(characterName || '').trim();
    if (!name) return '';
    try {
      const cleanId = (v) => String(v || '').replace(/[`"'“”‘’]/g, '').trim();
      const kvRows = await Storage.dbGetAll('kv');
      const rows = Array.isArray(kvRows) ? kvRows : [];
      const targetPrefix = 'forum_role_social_signals_';
      const viewedPrefix = 'forum_recent_viewed_threads_';
      const postedPrefix = 'forum_recent_user_posted_threads_';
      const commentedPrefix = 'forum_recent_user_commented_threads_';
      const likedPrefix = 'forum_recent_user_liked_threads_';
      const hits = [];
      const userBehavior = { viewed: [], posted: [], commented: [], liked: [] };
      rows.forEach((row) => {
        const key = String(row?.key || '').trim();
        if (key.startsWith(targetPrefix)) {
          const forumId = cleanId(key.slice(targetPrefix.length));
          const arr = Array.isArray(row?.value) ? row.value : [];
          arr.forEach((it) => {
            const roleNames = Array.isArray(it?.roleNames)
              ? it.roleNames.map((x) => String(x || '').trim()).filter(Boolean)
              : [];
            if (!roleNames.includes(name)) return;
            hits.push({
              forumId: String(forumId || '').trim() || 'unknown',
              title: String(it?.title || '').trim(),
              topic: String(it?.topic || '').trim(),
              socialText: String(it?.socialText || '').trim(),
              ts: Number(it?.ts || 0) || 0
            });
          });
          return;
        }
        const pushBehavior = (bucket, prefix) => {
          if (!key.startsWith(prefix)) return false;
          const forumId = cleanId(key.slice(prefix.length));
          const arr = Array.isArray(row?.value) ? row.value : [];
          arr.forEach((it) => {
            userBehavior[bucket].push({
              forumId: String(forumId || '').trim() || 'unknown',
              threadId: cleanId(it?.id),
              ts: Number(it?.ts || 0) || 0
            });
          });
          return true;
        };
        if (pushBehavior('viewed', viewedPrefix)) return;
        if (pushBehavior('posted', postedPrefix)) return;
        if (pushBehavior('commented', commentedPrefix)) return;
        if (pushBehavior('liked', likedPrefix)) return;
      });
      const hasUserBehavior =
        userBehavior.viewed.length || userBehavior.posted.length || userBehavior.commented.length || userBehavior.liked.length;
      if (!hits.length && !hasUserBehavior) return '';
      hits.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const lines = hits
        .slice(0, Math.max(1, Number(maxItems || 8)))
        .map((x, idx) => {
          const title = x.title ? (x.title.length > 40 ? `${x.title.slice(0, 40)}…` : x.title) : `帖子#${idx + 1}`;
          return `${idx + 1}. ${title} | ${x.socialText}`;
        });
      let currentForumNickname = '';
      try {
        const currentForumId = String(Storage.get('forum_current_forum_id') || '').trim() || 'forum_default';
        const forumCharacterAccounts = await Storage.kvGet(`forum_character_accounts_${currentForumId}`);
        if (forumCharacterAccounts && typeof forumCharacterAccounts === 'object' && !Array.isArray(forumCharacterAccounts)) {
          currentForumNickname = String(forumCharacterAccounts[name] || '').trim();
        }
      } catch (e) {}
      const block1 = hits.length
        ? [
          `【论坛互动信号摘要】角色「${name}」在论坛中的近期互动（最多${Math.max(1, Number(maxItems || 8))}条）：`,
          currentForumNickname ? `该角色在当前论坛使用的昵称：${currentForumNickname}` : '',
          '',
          ...lines
        ].join('\n')
        : '';

      const formatBucket = (title, arr) => {
        const list = Array.isArray(arr) ? arr : [];
        list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        return { title, items: list.slice(0, 8) };
      };
      // 不在提示词暴露 forumId/threadId：用 threads 表反查标题/分组
      let threadMap = new Map();
      try {
        const allThreads = await Storage.dbGetAll('threads');
        const arr = Array.isArray(allThreads) ? allThreads : [];
        threadMap = new Map(
          arr
            .map((t) => [cleanId(t?.id), t])
            .filter(([id]) => id)
        );
      } catch (e) {
        threadMap = new Map();
      }
      const renderThreadRefs = async (pack) => {
        if (!pack) return '';
        if (!pack.items || !pack.items.length) return [pack.title, '（无）'].join('\n');
        const lines = [];
        for (let idx = 0; idx < pack.items.length; idx += 1) {
          const x = pack.items[idx];
          const t = threadMap.get(cleanId(x.threadId)) || null;
          const title = t ? String(t.title || '').trim() : '';
          const content = t ? String(t.content || '').trim() : '';
          const briefTitle = title ? (title.length > 40 ? `${title.slice(0, 40)}…` : title) : `帖子#${idx + 1}`;
          const briefContent = content
            ? (content.length > 70 ? `${content.slice(0, 70)}…` : content)
            : '（无正文）';
          lines.push(`${idx + 1}. ${briefTitle} | ${briefContent}`);
        }
        return [pack.title, ...lines].join('\n');
      };
      const block2 = hasUserBehavior
        ? [
          '【用户论坛行为摘要】（用于隐藏线索参考）',
          await renderThreadRefs(formatBucket('用户最近常看（最多8条）：', userBehavior.viewed)),
          await renderThreadRefs(formatBucket('用户最近点赞（最多8条）：', userBehavior.liked)),
          await renderThreadRefs(formatBucket('用户最近发布（最多8条）：', userBehavior.posted))
        ].filter(Boolean).join('\n')
        : '';

      return [block1, block2].filter(Boolean).join('\n\n');
    } catch (e) {
      console.warn('[ta] forum signals context', e);
      return '';
    }
  },

  async _buildMomentsSignalsContextForCharacter(characterName = '', maxItems = 8) {
    const name = String(characterName || '').trim();
    if (!name) return '';
    try {
      const cleanKeyPart = (v) => String(v || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 80)
        .replace(/[^\w\u4e00-\u9fa5 \-().]/g, '_');
      const key = `moments_role_social_signals_${cleanKeyPart(name)}`;
      const row = await Storage.kvGet(key);
      const arr = Array.isArray(row?.value) ? row.value : (Array.isArray(row) ? row : []);
      const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
      list.sort((a, b) => (Number(b?.ts || 0) || 0) - (Number(a?.ts || 0) || 0));
      const n = Math.max(1, Number(maxItems || 8));

      // 反查 moments 表，尽量展示“谁发的朋友圈 + 原文（尽量完整）”，并按 moment 聚合互动行
      let momentMap = new Map();
      let allMoments = [];
      try {
        const all = await Storage.dbGetAll('moments');
        const ms = Array.isArray(all) ? all.filter(Boolean) : [];
        allMoments = ms.slice();
        momentMap = new Map(ms.map((m) => [String(m?.id || '').trim(), m]));
      } catch (e0) {
        allMoments = [];
        momentMap = new Map();
      }

      const safeFullText = (raw) => {
        const t = String(raw || '').trim();
        if (!t) return '';
        // “尽量完整”：只有极长时才截断，避免污染上下文
        if (t.length <= 900) return t;
        return t.slice(0, 900) + '…';
      };
      const formatTs = (ts) => {
        const n = Number(ts || 0) || 0;
        if (n <= 0) return '未知时间';
        const d = new Date(n);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
      };

      const renderEventLine = (it) => {
        const kind = String(it?.kind || '').trim();
        const actor = String(it?.actorName || '').trim() || '（未知）';
        const replyTo = String(it?.replyToName || '').trim();
        const text = String(it?.text || '').trim();
        if (kind === 'user_like') return `${actor} 点赞`;
        if (kind === 'user_comment') return `${actor} 评论：${text || '（无内容）'}`;
        if (kind === 'role_reply') return `${actor} 回复${replyTo ? ` ${replyTo}` : ''}：${text || '（无内容）'}`;
        return `${actor} 互动：${text || '（无内容）'}`;
      };

      // 最近事件里可能出现多条同一条朋友圈；把“朋友圈原文”只展示一次
      const picked = list.slice(0, Math.min(40, list.length));
      const byMomentId = new Map();
      for (const it of picked) {
        const mid = String(it?.momentId || '').trim();
        const k = mid || `__noid__${String(it?.momentText || '').slice(0, 32)}`;
        if (!byMomentId.has(k)) byMomentId.set(k, []);
        byMomentId.get(k).push(it);
      }

      const blocks = [];
      let used = 0;
      const seenEvent = new Set();
      for (const [k, items] of byMomentId.entries()) {
        if (used >= n) break;
        const first = items[0] || {};
        const momentId = String(first?.momentId || '').trim();
        const m = momentId ? (momentMap.get(momentId) || null) : null;
        const authorName = String(m?.authorName || first?.momentAuthorName || name).trim() || name;
        const fullText = safeFullText(m ? m.text : first?.momentText);
        const publishAt = Number(m?.createdAt || first?.ts || 0) || 0;
        const header = `- 朋友圈（${authorName} 发布）`;
        const body = fullText ? `  原文：${fullText}` : '  原文：（无）';
        const publishLine = `  发布时间：${formatTs(publishAt)}`;

        // 同一条朋友圈内部按时间正序：先评论，再出现后续回复，阅读更自然
        const sortedItems = items.slice().sort((a, b) => (Number(a?.ts || 0) || 0) - (Number(b?.ts || 0) || 0));
        const lines = [];
        for (const it of sortedItems) {
          if (used >= n) break;
          const sig = [
            String(it?.kind || ''),
            String(it?.momentId || ''),
            String(it?.actorName || ''),
            String(it?.replyToName || ''),
            String(it?.text || '')
          ].join('||');
          if (seenEvent.has(sig)) continue;
          seenEvent.add(sig);
          lines.push(`  - ${renderEventLine(it)}`);
          used += 1;
        }
        if (!lines.length) continue;
        blocks.push([header, publishLine, body, ...lines].join('\n'));
      }

      // 用户最近发的朋友圈（最多 8 条）始终可见；
      // 在这些用户朋友圈里，角色只感知“自己的评论”以及“用户对自己评论的回复”，其余角色评论不纳入。
      const userAliases = new Set(['我', '用户']);
      try {
        const defaultMaskId = String(Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '').trim();
        if (defaultMaskId) {
          const mask = await Storage.dbGet('masks', defaultMaskId);
          const maskName = String(mask?.name || '').trim();
          if (maskName) userAliases.add(maskName);
        }
      } catch (e1) {}
      const isUserName = (v) => userAliases.has(String(v || '').trim());
      const userMoments = allMoments
        .filter((m) => isUserName(m?.authorName))
        .sort((a, b) => (Number(b?.createdAt || 0) || 0) - (Number(a?.createdAt || 0) || 0))
        .slice(0, 8);
      const userMomentBlocks = userMoments.map((m) => {
        const fullText = safeFullText(m?.text);
        const publishLine = `  发布时间：${formatTs(Number(m?.createdAt || 0) || 0)}`;
        const body = fullText ? `  原文：${fullText}` : '  原文：（无）';
        const likes = Array.isArray(m?.likes) ? m.likes.map((x) => String(x || '').trim()).filter(Boolean) : [];
        const likesLine = likes.length ? `  点赞：${Array.from(new Set(likes)).join('、')}` : '  点赞：（暂无）';
        const comments = Array.isArray(m?.comments) ? m.comments.slice() : [];
        comments.sort((a, b) => (Number(a?.createdAt || 0) || 0) - (Number(b?.createdAt || 0) || 0));
        const pickedComments = comments.filter((c) => {
          const cName = String(c?.name || '').trim();
          const replyTo = String(c?.replyTo || '').trim();
          if (!cName) return false;
          // 放开：用户朋友圈下，所有“角色评论”都纳入可见范围
          if (!isUserName(cName)) return true;
          if (cName === name) return true;
          return isUserName(cName) && replyTo === name;
        });
        const commentLines = pickedComments.length
          ? pickedComments.map((c) => {
            const cName = String(c?.name || '').trim() || '匿名';
            const replyTo = String(c?.replyTo || '').trim();
            const txt = String(c?.text || '').trim() || '（无内容）';
            return `  - 评论：${cName}${replyTo ? ` 回复 ${replyTo}` : ''}：${txt}`;
          })
          : ['  - 评论：（该角色暂无可感知评论）'];
        return [
          '- 朋友圈（用户发布）',
          publishLine,
          body,
          likesLine,
          ...commentLines
        ].join('\n');
      });

      if (!blocks.length && !userMomentBlocks.length) return '';
      return [
        `【朋友圈互动信号摘要】角色「${name}」近期朋友圈互动（最多${n}条，用于隐藏线索参考）：`,
        '',
        ...blocks,
        ...(userMomentBlocks.length
          ? ['', `【用户最近发布的朋友圈（最多8条）｜角色「${name}」可见范围】`, ...userMomentBlocks]
          : [])
      ].join('\n');
    } catch (e) {
      console.warn('[ta] moments signals context', e);
      return '';
    }
  },

  _normalizeTaPhoneApiContent(content) {
    if (content == null || content === '') return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return String(content);
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && part.type === 'text' && part.text) return part.text;
      return '';
    }).join('');
  },

  // 通用 AI 返回内容规范化（保留 ta 兼容实现，便于后续功能复用）。
  _normalizeAiContent(content) {
    return this._normalizeTaPhoneApiContent(content);
  },

  _extractBracketBlocks(text) {
    const tags = ['当前状态', '手机', '浏览器', '心愿单', '已购', '购物车'];
    const esc = tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`\\[(${esc})\\]`, 'g');
    const parts = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      parts.push({ tag: m[1], start: m.index, end: re.lastIndex });
    }
    const map = {};
    for (let i = 0; i < parts.length; i++) {
      const body = text.slice(parts[i].end, parts[i + 1] ? parts[i + 1].start : text.length).trim();
      map[parts[i].tag] = body;
    }
    return map;
  },

  /**
   * 解析 [手机] 块：列表一行 + 可选多行历史气泡。
   * 列表行：标题|列表预览（仅最后一句/极短摘要）|时间|角标
   * 紧随其后的历史行：>>(L|R|左|右) 文本 —— L/左=左侧白气泡（对方），R/右=右侧绿气泡（持手机的 ta）
   */
  _parseTaPhoneChatBlock(body) {
    const rows = [];
    let current = null;
    const lines = String(body || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const tm = line.match(/^>>\s*(L|R|左|右)\s*(.*)$/i);
      if (tm) {
        const sideChar = String(tm[1] || '').trim();
        const side = /^(R|右)$/i.test(sideChar) ? 'R' : 'L';
        let text = String(tm[2] || '').replace(/^[：:\s]+/, '').trim();
        if (current && text) {
          if (!current.messages) current.messages = [];
          current.messages.push({ side, text });
        }
        continue;
      }
      const parts = line.split('|').map((s) => s.trim());
      if (!parts[0]) continue;
      const title = parts[0];
      const preview = parts[1] || '';
      const time = parts[2] || '';
      const badgeRaw = parts[3] || '';
      let unread = false;
      let badge = '';
      const br = badgeRaw.toLowerCase();
      if (br === 'unread' || br === 'dot' || br === '·' || br === '红点') unread = true;
      else if (/^\d+$/.test(badgeRaw)) badge = badgeRaw;
      current = { title, preview, time, badge, unread, messages: [] };
      rows.push(current);
    }
    for (const r of rows) {
      const msgs = Array.isArray(r.messages) ? r.messages : [];
      r.messages = msgs;
      const pv = String(r.preview || '').trim();
      if (!pv && msgs.length) {
        const last = msgs[msgs.length - 1];
        const t = String(last?.text || '').trim();
        r.preview = t.length > 48 ? `${t.slice(0, 48)}…` : t;
      }
      if (!msgs.length && String(r.preview || '').trim()) {
        r.messages = [{ side: 'L', text: String(r.preview).trim() }];
      }
    }
    return rows;
  },

  _parseTaPhoneBrowserBlock(body) {
    const raw = String(body || '').trim();
    let addr = '';
    const chips = [];
    const recents = [];
    let recentMode = false;
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^快捷[：:]/.test(line)) {
        recentMode = false;
        const rest = line.replace(/^快捷[：:]\s*/, '');
        rest.split('|').map((s) => s.trim()).filter(Boolean).forEach((c) => chips.push(c));
        continue;
      }
      if (/^最近[：:]/.test(line)) {
        recentMode = true;
        const rest = line.replace(/^最近[：:]\s*/, '');
        if (rest.includes('|')) {
          const [t, s] = rest.split('|').map((x) => x.trim());
          if (t) recents.push({ title: t, site: s || '' });
        }
        continue;
      }
      if (recentMode && line.includes('|')) {
        const [t, s] = line.split('|').map((x) => x.trim());
        if (t) recents.push({ title: t, site: s || '' });
        continue;
      }
      if (!addr && chips.length === 0 && recents.length === 0 && !recentMode) {
        addr = line;
      }
    }
    return { addr, chips, recents };
  },

  _parseTaPhoneWishBlock(body) {
    const items = [];
    const lines = String(body || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length >= 4) {
        items.push({
          icon: parts[0] || '🛒',
          title: parts[1] || '',
          sub: parts[2] || '',
          price: parts[3] || ''
        });
      } else if (parts.length === 3) {
        const title = parts[0] || '';
        items.push({
          icon: this._firstGrapheme(title) || '🛒',
          title,
          sub: parts[1] || '',
          price: parts[2] || ''
        });
      }
    }
    return items;
  },

  _parseTaPhoneOrdersBlock(body) {
    const items = [];
    const lines = String(body || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 3) continue;
      const title = parts[0] || '';
      const time = parts[1] || '';
      const amount = parts[2] || '';
      const status = parts[3] || '';
      items.push({
        icon: this._firstGrapheme(title) || '📦',
        title,
        time,
        amount,
        status
      });
    }
    return items;
  },

  parseTaPhoneProtocol(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const blocks = this._extractBracketBlocks(text);
    if (!blocks || Object.keys(blocks).length === 0) return null;

    let wishBody = blocks['心愿单'] || '';
    let ordersBody = blocks['已购'] || '';
    if (blocks['购物车']) {
      const sub = this._extractBracketBlocks(blocks['购物车']);
      if (sub['心愿单']) wishBody = sub['心愿单'];
      if (sub['已购']) ordersBody = sub['已购'];
    }

    const out = {
      status: String(blocks['当前状态'] || '').replace(/^\n+|\n+$/g, '').trim(),
      chatRows: this._parseTaPhoneChatBlock(blocks['手机'] || ''),
      browser: this._parseTaPhoneBrowserBlock(blocks['浏览器'] || ''),
      wish: this._parseTaPhoneWishBlock(wishBody),
      orders: this._parseTaPhoneOrdersBlock(ordersBody)
    };

    const hasAny =
      !!out.status ||
      out.chatRows.length > 0 ||
      (out.browser.addr && out.browser.addr.length > 0) ||
      out.browser.chips.length > 0 ||
      out.browser.recents.length > 0 ||
      out.wish.length > 0 ||
      out.orders.length > 0;
    return hasAny ? out : null;
  },

  applyTaPhoneSnapshot(data) {
    if (!data || typeof data !== 'object') return;

    const chatList = document.getElementById('ta-phone-chat-list');
    if (chatList) {
      const rows = Array.isArray(data.chatRows) ? data.chatRows : [];
      this._taPhoneLastChatRows = rows.length ? rows : null;
      if (!rows.length) {
        chatList.innerHTML = '';
      } else {
        chatList.innerHTML = rows
          .map((row, idx) => {
            const av = this._escapeHtml(this._firstGrapheme(row.title) || '聊');
            const title = this._escapeHtml(row.title);
            const preview = this._escapeHtml(row.preview);
            const time = this._escapeHtml(row.time);
            let metaExtra = '';
            if (row.unread) {
              metaExtra = '<span class="yd-ta-chat-row__dot" aria-label="未读"></span>';
            } else if (row.badge) {
              metaExtra = `<span class="yd-ta-chat-row__badge">${this._escapeHtml(row.badge)}</span>`;
            }
            return `
<button type="button" class="yd-ta-chat-row" data-thread="${idx}">
  <span class="yd-ta-chat-row__avatar">${av}</span>
  <span class="yd-ta-chat-row__main">
    <span class="yd-ta-chat-row__title">${title}</span>
    <span class="yd-ta-chat-row__preview">${preview}</span>
  </span>
  <span class="yd-ta-chat-row__meta">
    <span class="yd-ta-chat-row__time">${time}</span>
    ${metaExtra}
  </span>
</button>`;
          })
          .join('');
      }
    }

    const ph = document.getElementById('ta-phone-browser-placeholder');
    if (ph && data.browser && data.browser.addr) {
      ph.textContent = String(data.browser.addr);
    }

    const grid = document.querySelector('#page-ta-phone .yd-ta-browser__grid');
    if (grid && data.browser) {
      const chips = Array.isArray(data.browser.chips) ? data.browser.chips : [];
      grid.innerHTML = chips.length
        ? chips
            .map(
              (c) =>
                `<div class="yd-ta-browser__chip" role="button" tabindex="0" aria-label="历史记录：${this._escapeHtml(c)}">${this._escapeHtml(c)}</div>`
            )
            .join('')
        : '';
    }

    const recentWrap = document.querySelector('#page-ta-phone .yd-ta-browser__recent');
    if (recentWrap && data.browser) {
      const recents = Array.isArray(data.browser.recents) ? data.browser.recents : [];
      const titleEl = recentWrap.querySelector('.yd-ta-browser__recent-title');
      recentWrap.querySelectorAll('.yd-ta-recent-row').forEach((el) => el.remove());
      if (recents.length) {
        const frag = document.createDocumentFragment();
        recents.forEach((r) => {
          const row = document.createElement('div');
          row.className = 'yd-ta-recent-row';
          row.innerHTML = `<div class="yd-ta-recent-row__t">${this._escapeHtml(r.title)}</div><div class="yd-ta-recent-row__s">${this._escapeHtml(r.site)}</div>`;
          frag.appendChild(row);
        });
        if (titleEl) {
          recentWrap.insertBefore(frag, titleEl.nextSibling);
        } else {
          recentWrap.appendChild(frag);
        }
      }
    }

    const wishPanel = document.querySelector(
      '#page-ta-phone .yd-ta-shop__panel[data-seg-panel="wish"]'
    );
    if (wishPanel) {
      const wish = Array.isArray(data.wish) ? data.wish : [];
      wishPanel.innerHTML = wish.length
        ? wish
            .map((w) => {
              const ico = this._escapeHtml(w.icon || '🛒');
              const priceRaw = String(w.price || '').trim();
              const price = priceRaw.startsWith('¥') || priceRaw.startsWith('￥')
                ? this._escapeHtml(priceRaw)
                : this._escapeHtml(priceRaw ? `¥${priceRaw}` : '');
              return `
<div class="yd-ta-card">
  <div class="yd-ta-card__ico">${ico}</div>
  <div class="yd-ta-card__main">
    <div class="yd-ta-card__t">${this._escapeHtml(w.title)}</div>
    <div class="yd-ta-card__s">${this._escapeHtml(w.sub)}</div>
  </div>
  <div class="yd-ta-card__r">
    <div class="yd-ta-card__p">${price}</div>
    <button type="button" class="yd-ta-card__btn">去看看</button>
  </div>
</div>`;
            })
            .join('')
        : '';
    }

    const ordersPanel = document.querySelector(
      '#page-ta-phone .yd-ta-shop__panel[data-seg-panel="orders"]'
    );
    if (ordersPanel) {
      const orders = Array.isArray(data.orders) ? data.orders : [];
      ordersPanel.innerHTML = orders.length
        ? orders
            .map((o) => {
              const ico = this._escapeHtml(o.icon || '📦');
              const amt = String(o.amount || '').trim();
              const price = amt.startsWith('¥') || amt.startsWith('￥')
                ? this._escapeHtml(amt)
                : this._escapeHtml(amt ? `¥${amt}` : '');
              return `
<div class="yd-ta-order-row">
  <div class="yd-ta-order-row__ico">${ico}</div>
  <div class="yd-ta-order-row__main">
    <div class="yd-ta-order-row__t">${this._escapeHtml(o.title)}</div>
    <div class="yd-ta-order-row__s">${this._escapeHtml(o.time)}</div>
  </div>
  <div class="yd-ta-order-row__r">
    <div class="yd-ta-order-row__p">${price}</div>
    <div class="yd-ta-order-row__st">${this._escapeHtml(o.status)}</div>
  </div>
</div>`;
            })
            .join('')
        : '';
    }
  },

  _saveSnapshotCache(payload) {
    try {
      Storage.set(
        this.STORAGE_KEY_TA_PHONE_SNAPSHOT,
        JSON.stringify({
          characterId: payload.characterId,
          raw: payload.raw,
          parsed: payload.parsed,
          updatedAt: Date.now()
        })
      );
    } catch (e) {}
  },

  _loadSnapshotCache() {
    try {
      const s = Storage.get(this.STORAGE_KEY_TA_PHONE_SNAPSHOT);
      if (!s) return null;
      return JSON.parse(s);
    } catch (e) {
      return null;
    }
  },

  async _requestAiChatCompletions(messages, extraPayload = null) {
    const apiKey = String(Storage.get(CONFIG.STORAGE_KEYS.API_KEY) || '').trim();
    const baseRaw = Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || 'https://api.openai.com/v1';
    const baseUrl = String(baseRaw || '').trim().replace(/\/$/, '');
    const model = Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || 'gpt-3.5-turbo';
    if (!apiKey) throw new Error('请先在设置中配置 API Key');
    if (!baseUrl) throw new Error('请先在设置中配置 Base URL');

    const extra = (extraPayload && typeof extraPayload === 'object') ? extraPayload : null;

    const payload = {
      model,
      messages: Array.isArray(messages) ? messages : [],
      ...(extra || {})
    };

    if (typeof Chat !== 'undefined' && typeof Chat._postChatCompletionsAndParse === 'function') {
      return Chat._postChatCompletionsAndParse({ baseUrl, apiKey, payload });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ ...payload, stream: false })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data?.error && (data.error.message || data.error.msg))) {
      const em = String(data?.error?.message || data?.error?.msg || response.statusText || 'API error').trim();
      throw new Error(em || 'API error');
    }
    return data;
  },

  // 构造任务消息：支持多段 system 消息，并可选追加实时系统时间消息。
  // userContentParts：OpenAI 多模态 [{type:'text',...},{type:'image_url',...}]；仅当 ChatMessageBuilder.isAutoVisionEnabled() 时采用，否则退回 userMessage 纯文本
  _buildAiMessagesWithOptionalRealtime(systemMessages, userMessage = '', userContentParts = null) {
    const messages = [];
    const sysArr = Array.isArray(systemMessages) ? systemMessages : [systemMessages];
    sysArr
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .forEach((content) => messages.push({ role: 'system', content }));

    try {
      if (
        typeof ChatMessageBuilder !== 'undefined' &&
        ChatMessageBuilder.isRealTimeAwarenessEnabled &&
        ChatMessageBuilder.isRealTimeAwarenessEnabled()
      ) {
        messages.push({ role: 'system', content: ChatMessageBuilder.getCurrentTimeSystemContent() });
      }
    } catch (e) {}
    const userText = String(userMessage || '').trim();
    const partsRaw = Array.isArray(userContentParts) && userContentParts.length ? userContentParts : null;
    let multimodalOk = false;
    try {
      multimodalOk =
        !!partsRaw &&
        typeof ChatMessageBuilder !== 'undefined' &&
        ChatMessageBuilder.isAutoVisionEnabled &&
        ChatMessageBuilder.isAutoVisionEnabled();
    } catch (e) {
      multimodalOk = false;
    }
    if (multimodalOk && partsRaw) {
      const cleaned = [];
      for (const p of partsRaw) {
        if (!p || typeof p !== 'object') continue;
        if (p.type === 'text' && String(p.text || '').trim()) {
          cleaned.push({ type: 'text', text: String(p.text) });
          continue;
        }
        if (p.type === 'image_url' && p.image_url) {
          const u = String(p.image_url.url || '').trim();
          if (
            typeof ChatMessageBuilder !== 'undefined' &&
            ChatMessageBuilder.isVisionImageUrlForApi &&
            ChatMessageBuilder.isVisionImageUrlForApi(u)
          ) {
            cleaned.push({ type: 'image_url', image_url: { url: u } });
          }
        }
      }
      if (cleaned.length) {
        messages.push({ role: 'user', content: cleaned });
        return messages;
      }
    }
    if (userText) messages.push({ role: 'user', content: userText });
    return messages;
  },

  // 通用任务执行器：负责 messages 组装、AI 调用与输出解析。
  async _runAiFeatureTask(spec = {}) {
    const messages = this._buildAiMessagesWithOptionalRealtime(
      spec.systemMessages,
      spec.userMessage,
      spec.userContentParts
    );
    const data = await this._requestAiChatCompletions(messages, spec.extraPayload || null);
    const raw = this._normalizeAiContent(data?.choices?.[0]?.message?.content);
    const parsed = typeof spec.parse === 'function' ? spec.parse(raw) : raw;
    return { data, raw, parsed };
  },

  // 通用上下文封装：选定角色后，统一提取“角色设定 + 真实线上聊天上下文”。
  async _buildFeatureContextForCharacter(characterId, options = {}) {
    const cid = String(characterId || '').trim();
    if (!cid) return null;
    const character = await Storage.dbGet('characters', cid);
    if (!character) return null;
    const name = String(character.name || '').trim() || 'ta';
    const maxMsgs = Number.isFinite(Number(options.maxMsgs)) ? Number(options.maxMsgs) : 56;
    // 将角色设定中的 {{user}} 替换为“当前用户面具名”（默认面具），避免出现占位符
    const userMaskName = await (async () => {
      try {
        const id = String(Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '').trim();
        if (!id) return '用户';
        const mask = await Storage.dbGet('masks', id);
        const n = String(mask?.name || '').trim();
        return n || '用户';
      } catch (e) {
        return '用户';
      }
    })();
    const replaceUserTemplate = (text) => String(text || '').replace(/\{\{user\}\}/g, userMaskName);
    const charProfile = replaceUserTemplate(this._buildCharacterProfileText(character));
    const baseTranscript = await this._buildRecentChatTranscriptForCharacter(
      cid,
      maxMsgs,
      name
    );
    const forumSignals = await this._buildForumSignalsContextForCharacter(name, 8);
    const momentsSignals = await this._buildMomentsSignalsContextForCharacter(name, 8);
    // 确保论坛摘要块前有一个空行（即两次换行）
    const chatTranscript = [baseTranscript, forumSignals, momentsSignals]
      .filter((x) => String(x || '').trim())
      .reduce((acc, cur) => {
        if (!acc) return String(cur || '');
        return [acc, '', '', String(cur || '')].join('\n');
      }, '');
    return { characterId: cid, character, name, charProfile, chatTranscript };
  },

  // 通用 spec 组装器：新功能只需替换 system/user 指令与 parse。
  // userContentParts：可选多模态 user.content 数组；与 userMessage 二选一生效逻辑见 _buildAiMessagesWithOptionalRealtime
  _buildAiFeatureSpec({
    systemMessages = [],
    userMessage = '',
    parse = null,
    extraPayload = null,
    userContentParts = null
  } = {}) {
    return {
      systemMessages: Array.isArray(systemMessages) ? systemMessages : [systemMessages],
      userMessage: String(userMessage || ''),
      userContentParts: Array.isArray(userContentParts) && userContentParts.length ? userContentParts : null,
      parse: typeof parse === 'function' ? parse : null,
      extraPayload: extraPayload && typeof extraPayload === 'object' ? extraPayload : null
    };
  },

  // ta 手机任务规范：把角色设定/聊天上下文/输出协议拆分成独立 system 消息段。
  async _buildTaPhoneSnapshotTask(characterId) {
    const context = await this._buildFeatureContextForCharacter(characterId, { maxMsgs: 56 });
    if (!context) return null;
    const { character, name, charProfile, chatTranscript } = context;

    // system-1: 功能定位与总目标。
    const systemRoleAndGoal = [
      '你是「ta 的手机」界面快照生成器。你会收到「角色卡设定」以及「用户与该角色在聊天中的近期摘录」（含单聊/群聊里出现该角色时）。请结合两者推断 ta 当前状态、可能在聊的会话、浏览与购物偏好，生成手机界面快照。',
      '聊天记录仅作推断依据；手机会话列表要像真实 App：列表里「预览」列只写该会话最后一句（或极短摘要，≤20 字为佳）。'
    ].join('\n');

    // system-2: 角色设定（system）。
    const systemCharacterContext = [
      `## 角色：${name}`,
      charProfile ? `## 角色设定（角色库）\n${charProfile}` : '## 角色设定（角色库）\n（未填写详情）'
    ].join('\n');

    // system-3: 补充资料（近期摘要/聊天摘录等，用于推断语境；system）。
    const systemSupplementContext = [
      '## 补充资料：近期摘要与聊天上下文（与该角色相关的单聊/群聊；含会话摘要+摘录）',
      chatTranscript
    ].join('\n');

    // system-4: 输出要求 + 输出示例（system）。
    const systemOutputContractAndExample = [
      '你必须只输出纯文本，禁止使用 Markdown、代码块、JSON、或任何额外解释。',
      '当生成“角色与用户”的聊天相关内容时，必须严格参考「【真实线上聊天对话记录】」里的既有事实与语气，严禁编造角色与用户之间未出现过的聊天内容。',
      '严格使用下列标签块（标签名必须一致），按下面顺序输出；块内可多行。',
      '[当前状态]后面紧跟一句简短状态（不要换行到标签外）。',
      '[手机] 每个会话先写一行列表行，格式：标题|列表预览（仅最后一句）|时间|角标',
      '角标可为空；未读可写 unread 或 dot；数字角标写阿拉伯数字。',
      '紧接着在该会话下方写多条历史气泡行（按时间从早到晚），每行必须以 >> 开头，格式：>>L 文本 或 >>R 文本（也可用 >>左 >>右）。',
      '含义：L/左=左侧白气泡（会话里的「对方」：如用户、客服、群友）；R/右=右侧绿气泡（持手机的 ta，即当前角色本人）。',
      '每个重要会话至少输出 4～10 条 >> 行，以便点进会话页能还原多轮对话；列表预览应与该会话最后一条 >> 内容一致或是其极短摘要。',
      '[浏览器] 第一行可选地址栏占位文案；再输出「快捷：」与「最近：」数据行。',
      '[心愿单] 每行：标题|副标题|价格；或：emoji|标题|副标题|价格。',
      '[已购] 每行：订单标题|时间|金额|状态。',
      '也可使用 [购物车] 包裹子块，例如：[购物车][心愿单]...[已购]...（子块内格式同上）。',
      '',
      '示例（格式示意，内容需随角色变化）：',
      '[当前状态]刚下单了一杯奶茶',
      '[手机]',
      '室友小A|那晚上见|14:32|2',
      '>>L 在吗',
      '>>R 在呢',
      '>>L 晚上吃火锅吗',
      '>>R 好啊几点',
      '>>L 七点行不',
      '>>R 那晚上见',
      '购物助手|满减券今天过期|昨天|unread',
      '>>L 您有一张券将过期',
      '>>R 看看怎么用',
      '>>L 满39可用',
      '>>R 好的',
      '[浏览器]',
      'm.example.com/search',
      '快捷：外卖|天气|地图|优惠券',
      '最近：',
      '今日热榜|news.example.com',
      '[心愿单]',
      '🎧|无线耳机|想要·黑色|129',
      '[已购]',
      '纸巾|2026.03.10 18:30|39.00|已完成'
    ].join('\n');

    // user-1: 本次任务指令（user）。
    const userMessage = [
      '请根据以上 system 提供的角色设定与补充资料，生成该角色当前「ta 的手机」界面快照。',
      '要求：严格按 system 的标签块与字段格式输出；不要输出任何解释性文字。',
      '在生成角色与用户的聊天内容时，只能严格引用「【真实线上聊天对话记录】」中的原文内容；禁止改写、禁止补写、禁止杜撰双方聊天事实。',
      '仅允许去掉影响阅读的噪音标记，例如：[消息]、(动作)、(chuckle)、(sighs)；除此之外不得改动原文内容。',
      '特别注意：[手机] 里每个会话在列表行下方必须输出多条以 >>L / >>R（或 >>左 / >>右）开头的历史气泡行，以便会话详情页展示完整多轮对话；列表行的第二列「预览」只保留该会话最后一句（或极短摘要）。'
    ].join('\n');

    return {
      character,
      name,
      spec: this._buildAiFeatureSpec({
        systemMessages: [
          systemRoleAndGoal,
          systemCharacterContext,
          systemSupplementContext,
          systemOutputContractAndExample
        ],
        userMessage,
        parse: (raw) => this.parseTaPhoneProtocol(raw)
      })
    };
  },

  async fetchTaPhoneSnapshot(opts = {}) {
    const force = !!opts.force;
    if (this._taPhoneSnapshotInFlight && !force) return;

    const characterId = this._getTaCharacterId();
    this._syncTaPhoneGate();
    if (!characterId) {
      return;
    }

    const apiKey = String(Storage.get(CONFIG.STORAGE_KEYS.API_KEY) || '').trim();
    if (!apiKey) {
      return;
    }

    this._taPhoneSnapshotInFlight = true;
    try {
      const task = await this._buildTaPhoneSnapshotTask(characterId);
      if (!task) return;
      const { name, spec } = task;
      const { raw, parsed } = await this._runAiFeatureTask(spec);
      if (!parsed) {
        const cached = this._loadSnapshotCache();
        if (cached && cached.characterId === characterId && cached.parsed) {
          this.applyTaPhoneSnapshot(cached.parsed);
          alert('本次生成格式无法解析，已回显上次成功内容');
        } else {
          alert('无法解析模型返回，请重试或检查提示词');
        }
        return;
      }
      this._saveSnapshotCache({ characterId, raw, parsed });
      this.applyTaPhoneSnapshot(parsed);
      this._notifyTaPhoneSnapshotReady(name);
    } catch (e) {
      console.error('[ta-phone] fetchTaPhoneSnapshot', e);
      const cached = this._loadSnapshotCache();
      if (cached && cached.characterId === characterId && cached.parsed) {
        this.applyTaPhoneSnapshot(cached.parsed);
      }
      alert(e?.message || '加载失败，请检查网络与 API 配置');
    } finally {
      this._taPhoneSnapshotInFlight = false;
    }
  },

  _initTaPhoneUiOnce() {
    if (this._taPhoneUiInited) return;
    this._taPhoneUiInited = true;

    const tabbar = document.getElementById('ta-phone-tabbar');
    if (tabbar) {
      tabbar.querySelectorAll('button[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.getAttribute('data-tab');
          if (!tab) return;
          this.setTaPhoneTab(tab);
        });
      });
    }

    const chatList = document.getElementById('ta-phone-chat-list');
    if (chatList) {
      chatList.addEventListener('click', (e) => {
        const row = e.target && e.target.closest && e.target.closest('button.yd-ta-chat-row[data-thread]');
        if (!row) return;
        const raw = row.getAttribute('data-thread');
        const idx = parseInt(String(raw || ''), 10);
        if (!Number.isFinite(idx) || idx < 0) return;
        this.openTaPhoneThread(idx);
      });
    }

    document.getElementById('ta-phone-chat-back')?.addEventListener('click', () => {
      this.closeTaPhoneThread();
    });

    document.querySelectorAll('#page-ta-phone .yd-ta-seg-btn[data-seg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const seg = btn.getAttribute('data-seg');
        if (!seg) return;
        this.setTaPhoneSegment(seg);
      });
    });
  },

  _restoreTaPhoneUiState() {
    const tab = String(Storage.get(this.STORAGE_KEY_TA_PHONE_TAB) || 'chat');
    this.setTaPhoneTab(tab);
    const seg = String(Storage.get(this.STORAGE_KEY_TA_PHONE_SEG) || 'wish');
    this.setTaPhoneSegment(seg);
    this.closeTaPhoneThread();
  },

  setTaPhoneTab(tab) {
    const t = String(tab || '').trim();
    const allowed = new Set(['chat', 'browser', 'shop']);
    const use = allowed.has(t) ? t : 'chat';

    try {
      Storage.set(this.STORAGE_KEY_TA_PHONE_TAB, use);
    } catch (e) {}

    if (use === 'chat') {
      this.closeTaPhoneThread();
    } else {
      this.closeTaPhoneThread();
    }

    document.querySelectorAll('#page-ta-phone button[data-tab]').forEach((btn) => {
      const is = btn.getAttribute('data-tab') === use;
      btn.setAttribute('aria-selected', String(is));
    });
    document.querySelectorAll('#page-ta-phone [data-tab-panel]').forEach((panel) => {
      const is = panel.getAttribute('data-tab-panel') === use;
      panel.setAttribute('aria-hidden', String(!is));
    });
  },

  openTaPhoneThread(rowIndex) {
    const thread = document.getElementById('ta-phone-chat-thread');
    const titleEl = document.getElementById('ta-phone-chat-thread-title');
    const msgsEl = thread?.querySelector('.yd-ta-thread__msgs');
    const tabbar = document.getElementById('ta-phone-tabbar');
    const home = document.querySelector('#page-ta-phone .yd-ta-phone__home');

    const rows = this._taPhoneLastChatRows;
    let row = Array.isArray(rows) && rows[rowIndex] ? rows[rowIndex] : null;
    if (!row) {
      const list = document.getElementById('ta-phone-chat-list');
      const btn = list?.querySelector(`button.yd-ta-chat-row[data-thread="${rowIndex}"]`);
      if (btn) {
        const t = btn.querySelector('.yd-ta-chat-row__title')?.textContent?.trim() || '会话';
        const pv = btn.querySelector('.yd-ta-chat-row__preview')?.textContent?.trim() || '';
        row = {
          title: t,
          preview: pv,
          messages: pv ? [{ side: 'L', text: pv }] : []
        };
      } else {
        row = { title: '会话', preview: '', messages: [] };
      }
    }

    const title = String(row.title || '会话').trim() || '会话';
    if (titleEl) titleEl.textContent = title;

    let msgs = Array.isArray(row.messages) ? row.messages : [];
    if (!msgs.length && String(row.preview || '').trim()) {
      msgs = [{ side: 'L', text: String(row.preview).trim() }];
    }
    if (msgsEl) {
      msgsEl.innerHTML = msgs.length
        ? msgs
            .map((m) => {
              const side = m.side === 'R' ? 'right' : 'left';
              const text = this._escapeHtml(String(m.text || '').trim() || ' ');
              return `<div class="yd-ta-bubble yd-ta-bubble--${side}"><div class="yd-ta-bubble__text">${text}</div></div>`;
            })
            .join('')
        : `<div class="yd-ta-bubble yd-ta-bubble--left"><div class="yd-ta-bubble__text">${this._escapeHtml(
            '暂无消息'
          )}</div></div>`;
      requestAnimationFrame(() => {
        msgsEl.scrollTop = msgsEl.scrollHeight;
      });
    }

    if (thread) thread.hidden = false;
    if (tabbar) tabbar.setAttribute('hidden', 'true');
    if (home) home.setAttribute('hidden', 'true');
  },

  closeTaPhoneThread() {
    const thread = document.getElementById('ta-phone-chat-thread');
    const tabbar = document.getElementById('ta-phone-tabbar');
    const home = document.querySelector('#page-ta-phone .yd-ta-phone__home');
    if (thread) thread.hidden = true;
    if (tabbar) tabbar.removeAttribute('hidden');
    if (home) home.removeAttribute('hidden');
  },

  setTaPhoneSegment(seg) {
    const s = String(seg || '').trim();
    const allowed = new Set(['wish', 'orders']);
    const use = allowed.has(s) ? s : 'wish';

    try {
      Storage.set(this.STORAGE_KEY_TA_PHONE_SEG, use);
    } catch (e) {}

    document.querySelectorAll('#page-ta-phone .yd-ta-seg-btn[data-seg]').forEach((btn) => {
      const is = btn.getAttribute('data-seg') === use;
      btn.setAttribute('aria-selected', String(is));
    });
    document.querySelectorAll('#page-ta-phone .yd-ta-shop__panel[data-seg-panel]').forEach((panel) => {
      const is = panel.getAttribute('data-seg-panel') === use;
      panel.setAttribute('aria-hidden', String(!is));
    });
  },

  async refreshTaPhoneHeader() {
    const nameEl = document.getElementById('ta-phone-role-name');
    if (!nameEl) return;
    try {
      const useId = this._getTaCharacterId();
      if (!useId) {
        nameEl.textContent = '未选择角色';
        return;
      }
      const c = await Storage.dbGet('characters', useId);
      const name = String(c?.name || '').trim();
      nameEl.textContent = name || '未选择角色';
    } catch (e) {
      nameEl.textContent = '未选择角色';
    }
  },

  async openTaPhoneSwitch() {
    const existing = document.getElementById('yd-ta-phone-switch');
    if (existing) {
      existing.remove();
    }

    let characters = [];
    try {
      characters = await Storage.dbGetAll('characters');
    } catch (e) {
      characters = [];
    }
    characters = Array.isArray(characters) ? characters.slice() : [];
    characters.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));

    const currentSavedId = String(Storage.get(this.STORAGE_KEY_TA_PHONE_CHARACTER) || '').trim();
    const currentUseId = currentSavedId;

    const escapeHtml = (str) => this._escapeHtml(str);

    const overlay = document.createElement('div');
    overlay.id = 'yd-ta-phone-switch';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = '1200';
    overlay.innerHTML = `
      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);"></div>
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,360px);background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.25);overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #EEE;">
          <div style="font-size:15px;font-weight:900;color:#111;">选择角色</div>
          <button type="button" id="yd-ta-phone-switch-x" style="border:none;background:transparent;width:32px;height:32px;border-radius:10px;font-size:22px;line-height:1;color:#666;cursor:pointer;">×</button>
        </div>
        <div style="max-height:min(56vh,420px);overflow:auto;-webkit-overflow-scrolling:touch;padding:8px;">
          ${(characters.length ? characters : [{ id: '', name: '暂无角色' }])
            .map((m) => {
              const id = String(m?.id || '');
              const name = String(m?.name || '').trim() || (id ? '未命名角色' : '请先到「角色」里创建角色');
              const isActive = !!id && id === currentUseId;
              return `
              <button type="button" data-id="${escapeHtml(id)}"
                style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:none;background:${isActive ? 'rgba(255,107,0,0.10)' : 'transparent'};border-radius:12px;cursor:${id ? 'pointer' : 'default'};">
                <div style="text-align:left;">
                  <div style="font-size:14px;font-weight:900;color:#111;">${escapeHtml(name)}${isActive ? '（当前）' : ''}</div>
                  <div style="font-size:12px;color:#8E8E93;margin-top:2px;">使用该角色的设定 + 与该角色相关会话的近期聊天记录</div>
                </div>
                <div aria-hidden="true" style="width:18px;height:18px;border-radius:9px;border:2px solid ${isActive ? '#FF6B00' : '#E5E5EA'};background:${isActive ? '#FF6B00' : 'transparent'};"></div>
              </button>
            `;
            })
            .join('')}
        </div>
      </div>
    `;

    const close = () => {
      try {
        overlay.remove();
      } catch (e) {}
    };

    overlay.firstElementChild?.addEventListener('click', close);
    overlay.querySelector('#yd-ta-phone-switch-x')?.addEventListener('click', close);

    Array.from(overlay.querySelectorAll('button[data-id]')).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = String(btn.getAttribute('data-id') || '').trim();
        if (!id) return;
        const prevId = String(Storage.get(this.STORAGE_KEY_TA_PHONE_CHARACTER) || '').trim();
        try {
          Storage.set(this.STORAGE_KEY_TA_PHONE_CHARACTER, id);
        } catch (e) {}
        await this.refreshTaPhoneHeader();
        this._syncTaPhoneGate();
        close();
        if (id !== prevId) {
          this._resetTaPhoneDevicePreview();
          await this.fetchTaPhoneSnapshot({ force: true });
        }
      });
    });

    document.body.appendChild(overlay);
  }
};

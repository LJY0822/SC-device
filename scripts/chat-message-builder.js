// 聊天消息构建工具（仅负责 messages 数组的拼装）
const ChatMessageBuilder = {
  /**
   * 构建用于调用 /chat/completions 的 messages
   * @param {Object} options
   * @param {'single'|'group'} options.mode
   * @param {Array} options.characters  // 归一化角色 [{ id, name, description, first_mes, character_book?, ... }]
   * @param {Array} options.history     // 历史消息 [{ role, content, characterName?, ... }]
   * @param {string} options.userInput  // 当前用户输入
   * @param {Object|Array|null} [options.globalWorldBook] // 全局世界书原始数据（仅来自 IndexedDB kv，由聊天侧预先读取）
   * @param {boolean} [options.appendApiUserTimeLine] // 仅线上：在当轮用户正文后再追加一条仅含 [YYYY-MM-DD HH:mm] 的 user（仅 API，不入库）
   * @param {Array<{type:string}>|null} [options.userContentParts] // 当轮用户消息：多模态 parts（text + image_url）；仅 isAutoVisionEnabled() 时生效，否则忽略并走 userInput 字符串
    */
  buildChatMessages(options) {
    const mode = options?.mode === 'group' ? 'group' : 'single';
    const characters = Array.isArray(options?.characters) ? options.characters : [];
    const history = Array.isArray(options?.history) ? options.history : [];
    const userInput = String(options?.userInput || '');
    const globalWorldBook = options?.globalWorldBook != null ? options.globalWorldBook : null;
    const mask = options?.mask && typeof options.mask === 'object' ? options.mask : null;
    const stickers = Array.isArray(options?.stickers) ? options.stickers : [];
    const conversationMode = options?.conversationMode === 1 ? 1 : 0; // 0=线上，1=线下
    const suggestedReplyEnabled = options?.suggestedReplyEnabled !== false;
    let userContentParts =
      Array.isArray(options?.userContentParts) && options.userContentParts.length
        ? options.userContentParts
        : null;
    // 关闭「多模态自动识图」时：不使用含 image_url 的 parts，避免误带入多模态 user 消息
    if (userContentParts && !this.isAutoVisionEnabled()) {
      userContentParts = null;
    }
    // 角色发送图片：只允许引用“对话历史中用户已发送过的图片描述”
    const userSentImageDescriptions = this._extractUserSentImageDescriptions(history);

    const isGroup = mode === 'group' && characters.length > 1;

    const appendApiUserTimeLine =
      conversationMode === 0 &&
      options?.appendApiUserTimeLine === true &&
      this.isRealTimeAwarenessEnabled() &&
      String(userInput || '').trim().length > 0;

    return [
      // 先定角色：让 persona system 永远排在第一个
      ...this._buildPersonaSystem(isGroup, characters, mask),
      // 再给通用语境与协议说明（线上/线下）
      ...this._buildChatModeSystem(isGroup, characters, mask, stickers, userSentImageDescriptions, conversationMode, suggestedReplyEnabled),
      // 全局回复风格（仅当用户选择“活人感优先”时注入）
      ...this._buildReplyStyleSystem(conversationMode),
      ...this._buildSparkStreakGuideSystem(),
      // 再补充当前时间与时间戳注入说明
      ...this._buildCurrentTimeSystem(characters, mask),
      ...this._buildOnlineApiTimestampHintSystem(conversationMode, appendApiUserTimeLine),
      ...this._buildCrossModeMergedHistoryHintSystem(history),
      // 世界书等额外设定
      ...this._buildWorldBookSystem(isGroup, characters, userInput, history, globalWorldBook),
      // 历史与本轮用户输入
      ...this._buildHistoryMessages(isGroup, history, appendApiUserTimeLine),
      ...(userContentParts
        ? [{ role: 'user', content: userContentParts }]
        : this._buildUserMessage(userInput)),
      ...(appendApiUserTimeLine ? this._buildOnlineApiUserTimestampMessage() : [])
    ];
  },

  _getReplyStyleMode() {
    try {
      if (typeof ReplyStyle !== 'undefined' && ReplyStyle && typeof ReplyStyle.getMode === 'function') {
        return ReplyStyle.getMode();
      }
    } catch (e) {}
    return 'canon';
  },

  _buildReplyStyleSystem(conversationMode = 0) {
    if (this._getReplyStyleMode() !== 'lively') return [];
    const onlineContent = `# 即时通讯消息回复预设
## 预设内容
角色需要时刻保持回复用户手机消息时候的活人感。

角色是一个活生生的人，是一个有性格有脾气、有喜怒哀乐、七情六欲的普通人。角色正在真实世界中使用手机在跟用户聊天，角色需要保持真人在即时通讯上打字的习惯。角色每一段发送的消息是角色念头的延伸，需要保持思维和念头的碎片感，和说话语气的呼吸感，需要停顿的地方，使用适当停顿，保持一定的呼吸感和思维念头的碎片感。

一次回复中，每一小段的回复的字数控制一下，能用一句话说清的，不会啰嗦。能用两三个字（例如[消息]笑死、[消息]哈哈、[消息]真的假的）回复时，绝不多打字。
禁止在句尾使用标准的句号。用空格或‘~’、‘！’代替。多使用口语化的语气助词，语气要松弛、生活化。
允许出现拼音输入法导致的同音错别字（低概率）。
根据人设，可以自然地嵌入最近常用的网络热梗或者使用颜表情来回复
面对无聊的话题会用[消息]呃、[消息]好吧、[消息]笑成麻花 来敷衍；面对感兴趣的话题会表现得比用户更兴奋。

在真人表现激动的时候，常常是连续弹消息，例如：
[消息]卧槽！
[消息]你敢信？！
[消息]我今天出门居然撞见初恋了……

标点符号规范：
   - 严禁使用句号。
   - 句中或句尾用空格代替逗号/句号。
   - 表达情绪时可以用连续的问号或叹号（如“??”、“!!!”）。

风格对比示例：
错误AI风：
[消息]听起来你今天过得很充实呢！
[消息]不过要注意劳逸结合，早点休息哦。

正确真人回复风格：
[消息]哇那你今天够累的( ´•̥̥̥ω•̥̥̥\` )
[消息]赶紧洗洗睡吧 `;

    if (conversationMode === 1) {
      // 线下：尽量保留原文，仅对“手机回消息”等措辞做最小调整，
      // 并把示例中的 [消息] 替换为线下协议的 [对白]。
      const offlineContent = onlineContent
        .replace('回复用户手机消息时候的活人感。', '回复用户消息时候的活人感。')
        .replace('角色正在真实世界中使用手机在跟用户聊天，', '角色正在真实世界中跟用户聊天，')
        .replace('角色需要保持真人在即时通讯上打字的习惯。', '角色需要保持真人在聊天时表达的习惯。')
        .replace(/\[消息\]/g, '[对白]');
      return [{ role: 'system', content: offlineContent }];
    }

    return [{ role: 'system', content: onlineContent }];
  },

  /** OpenAI 兼容 vision：`image_url.url` 可为 data:image 或公网 http(s)（仅链接导入相册时） */
  isVisionImageUrlForApi(url) {
    const u = String(url || '').trim();
    return /^data:image\//i.test(u) || /^https?:\/\//i.test(u);
  },

  /** API 设置「多模态自动识图」：关闭时不组装含 image_url 的 content，仅保留 [图片] 等文本协议 */
  isAutoVisionEnabled() {
    try {
      const key =
        typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CHAT_AUTO_VISION
          ? CONFIG.STORAGE_KEYS.CHAT_AUTO_VISION
          : 'chat_auto_vision';
      const def =
        typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_CHAT_AUTO_VISION
          ? CONFIG.DEFAULT_CHAT_AUTO_VISION
          : 'on';
      const v = String((typeof Storage !== 'undefined' && Storage.get) ? Storage.get(key) : '').trim();
      const mode = v ? v.toLowerCase() : String(def || 'on').toLowerCase();
      return mode !== 'off' && mode !== '0' && mode !== 'false';
    } catch (e) {
      return true;
    }
  },

  /**
   * 单条本地用户消息 → API content（字符串或多模态数组）
   */
  userApiContentFromStoredMessage(m) {
    if (!m || m.role !== 'user') return String(m?.content ?? '');
    let text = String(m.content || '');
    try {
      if (typeof Chat !== 'undefined' && Chat && typeof Chat.ensureMoneyContentWithMessageId === 'function') {
        text = /\n/.test(text)
          ? Chat.ensureMoneyMultilineContentWithMessageId(text, m.id, null)
          : Chat.ensureMoneyContentWithMessageId(text, m.id, null);
      }
    } catch (e) {}
    const url = String(m.imageDataUrl || '').trim();
    if (url && this.isVisionImageUrlForApi(url) && this.isAutoVisionEnabled()) {
      return [
        { type: 'text', text },
        { type: 'image_url', image_url: { url } }
      ];
    }
    return text;
  },

  /** 线上且当轮有用户输入时：说明 API 里可能多一条仅时间戳的 user，避免模型模仿 */
  _buildOnlineApiTimestampHintSystem(conversationMode, appendApiUserTimeLine) {
    if (conversationMode === 1 || !appendApiUserTimeLine) return [];
    return [{
      role: 'system',
      content: [
        '【系统自动注入的时间行（必读）】',
        '在「每一条」用户消息之后（包含历史与本轮），系统都会紧跟一条 user 消息，内容**仅此一行**：形如 [YYYY-MM-DD HH:MM]（本地时间）。',
        '该行仅标记“上一条用户消息”的发送时间，供你理解先后顺序与时间线；**它不是用户台词**，用户没有再说这句话。',
        '你仍必须按本项目既定协议输出（如 [消息]、[动作] 等）；**禁止**在你方对话里输出同类「[日期 时间]」行，也不要在说明、示例或元评论中模仿该格式。',
      ].join('\n')
    }];
  },

  /** 与 getCurrentTimeSystemContent 同粒度：本地 [YYYY-MM-DD HH:mm] */
  _formatOnlineApiUserTimestampLine() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `[${yyyy}-${mm}-${dd} ${hh}:${mi}]`;
  },

  _formatOnlineApiUserTimestampLineFromMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return '';
    const d = new Date(n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `[${yyyy}-${mm}-${dd} ${hh}:${mi}]`;
  },

  _buildOnlineApiUserTimestampMessage() {
    return [{ role: 'user', content: this._formatOnlineApiUserTimestampLine() }];
  },

  _buildOnlineApiUserTimestampMessageFromMs(ms) {
    const line = this._formatOnlineApiUserTimestampLineFromMs(ms);
    if (!line) return [];
    return [{ role: 'user', content: line }];
  },

  isRealTimeAwarenessEnabled() {
    try {
      const key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.TIME_AWARENESS)
        ? CONFIG.STORAGE_KEYS.TIME_AWARENESS
        : 'time_awareness';
      const def = (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_TIME_AWARENESS) ? CONFIG.DEFAULT_TIME_AWARENESS : 'on';
      const mode = String((typeof Storage !== 'undefined' && Storage.get) ? (Storage.get(key) || def) : def).trim();
      return mode === 'on';
    } catch (e) {
      return false;
    }
  },

  _formatWallClockInTimezone(timezone, date = new Date()) {
    const tz = String(timezone || '').trim();
    if (!tz) return '';
    try {
      const fmt = new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = fmt.formatToParts(date);
      const pick = (type) => String(parts.find((p) => p.type === type)?.value || '');
      return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
    } catch (e) {
      return '';
    }
  },

  REGION_DEFAULT_TZ: {
    中国: 'Asia/Shanghai',
    日本: 'Asia/Tokyo',
    韩国: 'Asia/Seoul',
    中国香港: 'Asia/Hong_Kong',
    新加坡: 'Asia/Singapore',
    英国: 'Europe/London',
    法国: 'Europe/Paris',
    德国: 'Europe/Berlin',
    俄罗斯: 'Europe/Moscow',
    美国东部: 'America/New_York',
    美国中部: 'America/Chicago',
    美国山地: 'America/Denver',
    美国西部: 'America/Los_Angeles',
    巴西: 'America/Sao_Paulo',
    澳大利亚: 'Australia/Sydney',
    新西兰: 'Pacific/Auckland',
    阿联酋: 'Asia/Dubai',
    泰国: 'Asia/Bangkok',
    印尼: 'Asia/Jakarta',
    印度: 'Asia/Kolkata'
  },

  LANG_DEFAULT_TIMEZONE: {
    zh: 'Asia/Shanghai',
    en: 'America/New_York',
    ja: 'Asia/Tokyo',
    ko: 'Asia/Seoul',
    yue: 'Asia/Hong_Kong',
    es: 'Europe/Madrid',
    fr: 'Europe/Paris',
    de: 'Europe/Berlin',
    ru: 'Europe/Moscow',
    pt: 'America/Sao_Paulo',
    it: 'Europe/Rome',
    ar: 'Asia/Dubai',
    vi: 'Asia/Ho_Chi_Minh',
    id: 'Asia/Jakarta',
    tr: 'Europe/Istanbul',
    nl: 'Europe/Amsterdam',
    uk: 'Europe/Kyiv'
  },

  _resolveCharacterTimezone(c) {
    if (!c || typeof c !== 'object') return '';
    let tz = String(c.timezone || c.time_zone || '').trim();
    if (tz) return tz;
    const region = String(c.regionLabel || c.region_label || '').trim();
    if (region && this.REGION_DEFAULT_TZ[region]) return this.REGION_DEFAULT_TZ[region];
    const lang = String(c.defaultLanguage || c.default_language || '').trim().toLowerCase();
    if (lang && this.LANG_DEFAULT_TIMEZONE[lang]) return this.LANG_DEFAULT_TIMEZONE[lang];
    const chatI18n = c.chat_i18n;
    if (chatI18n && typeof chatI18n === 'object') {
      tz = String(chatI18n.timezone || chatI18n.time_zone || '').trim();
      if (tz) return tz;
      const r2 = String(chatI18n.region_label || chatI18n.regionLabel || '').trim();
      if (r2 && this.REGION_DEFAULT_TZ[r2]) return this.REGION_DEFAULT_TZ[r2];
    }
    return '';
  },

  _resolveCharacterRegionLabel(c, tz) {
    if (!c || typeof c !== 'object') return '';
    let region = String(c.regionLabel || c.region_label || '').trim();
    if (region) return region;
    const chatI18n = c.chat_i18n;
    if (chatI18n && typeof chatI18n === 'object') {
      region = String(chatI18n.region_label || chatI18n.regionLabel || '').trim();
      if (region) return region;
    }
    const zone = String(tz || this._resolveCharacterTimezone(c) || '').trim();
    if (zone) {
      for (const [label, id] of Object.entries(this.REGION_DEFAULT_TZ)) {
        if (id === zone) return label;
      }
    }
    return '';
  },

  _getTimezoneOffsetMinutes(timeZone, date = new Date()) {
    const tz = String(timeZone || '').trim();
    if (!tz) return 0;
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = dtf.formatToParts(date);
      const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
      const asUtc = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
        get('second')
      );
      return Math.round((asUtc - date.getTime()) / 60000);
    } catch (e) {
      return 0;
    }
  },

  _formatTimezoneDiffText(characterTz, date = new Date(), userName = '用户', charName = '角色', charRegion = '') {
    const charTz = String(characterTz || '').trim();
    if (!charTz) return '';
    const userLabel = String(userName || '用户').trim() || '用户';
    const charLabel = String(charName || '角色').trim() || '角色';
    const region = String(charRegion || '').trim();
    const charPlace = region ? `${charLabel}所在地（${region}）` : `${charLabel}所在地`;
    const userPlace = `${userLabel}所在地`;
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
      if (userTz === charTz) {
        return `${userLabel}与${charLabel}：${charPlace}与${userPlace}为同一时区（无时差）`;
      }
      const userOff = this._getTimezoneOffsetMinutes(userTz, date);
      const charOff = this._getTimezoneOffsetMinutes(charTz, date);
      const diffHours = Math.round((charOff - userOff) / 60);
      if (!diffHours) {
        return `${userLabel}与${charLabel}：${charPlace}与${userPlace}时差约 0 小时`;
      }
      if (diffHours > 0) {
        return `${userLabel}与${charLabel}：${charPlace}比${userPlace}时间快 ${diffHours} 小时`;
      }
      return `${userLabel}与${charLabel}：${charPlace}比${userPlace}时间慢 ${Math.abs(diffHours)} 小时`;
    } catch (e) {
      return '';
    }
  },

  getCurrentTimeSystemContent(characters, options = {}) {
    const now = new Date();
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    const userLine = this._formatWallClockInTimezone(userTz, now);
    const userName = String(options?.mask?.name || options?.userName || '').trim() || '用户';
    const lines = [];
    if (userLine) {
      lines.push(`${userName}（用户）的所在地时间（本机）：${userLine}（24小时制）`);
    }

    const list = Array.isArray(characters) ? characters : [];
    let primary = null;
    list.forEach((c) => {
      if (!c) return;
      const tz = this._resolveCharacterTimezone(c);
      if (!tz) return;
      const charLine = this._formatWallClockInTimezone(tz, now);
      if (!charLine) return;
      const name = String(c.name || '角色').trim() || '角色';
      const region = this._resolveCharacterRegionLabel(c, tz);
      if (!primary) primary = { name, tz, region };
      const regionPart = region ? `（${region}）` : '';
      lines.push(`${name}（角色）所在地${regionPart}时间：${charLine}`);
    });

    if (primary) {
      const diff = this._formatTimezoneDiffText(
        primary.tz,
        now,
        userName,
        primary.name,
        primary.region
      );
      if (diff) lines.push(diff);
    }

    lines.push(
      '请基于上述真实时间理解作息与“早上/晚上”等表述；各角色以各自所在地时间为准，用户以本机所在地时间为准。'
    );
    return lines.join('\n');
  },

  _buildCurrentTimeSystem(characters, mask) {
    if (!this.isRealTimeAwarenessEnabled()) return [];
    return [{
      role: 'system',
      content: this.getCurrentTimeSystemContent(characters, { mask })
    }];
  },

  /** 连续聊天「火花」机制说明（线上/线下均注入，避免角色对续火花提示感到突兀） */
  _buildSparkStreakGuideSystem() {
    return [{
      role: 'system',
      content: [
        '【连续聊天火花（必读）】',
        '本应用有类似 QQ「火花」的连续互动天数，显示在会话标题旁（🔥 + 数字）。规则简要：',
        '- 按自然日计算：当天用户或角色任一方有聊天互动即计为当日有效；同一天多条消息不重复计天。',
        '- 若超过 1 个自然日双方都未互动，火花中断，标题数字归零，聊天内可能出现系统提示「火花已熄灭」。',
        '- 用户再次发言后，可能出现「火花已点亮」或「续火花成功」，连续天数从 1 重新累计。',
        '对话要求：',
        '- 上述提示是产品层面的互动机制，不是世界观内的魔法或真实火焰；用户提到续火花、火花断了时，请自然、轻松回应即可（可轻度调侃），勿当成必须用剧情解释的奇观，也勿反复向用户科普规则。',
        '- 用户未提及火花时，无需在每次回复末尾主动提起。',
      ].join('\n')
    }];
  },

  // 第一个 system：说明当前是单聊还是群聊 + 参与者 + 消息格式说明 + 可用表情包/图片
  _buildChatModeSystem(isGroup, characters, mask, stickers = [], userSentImageDescriptions = [], conversationMode = 0, suggestedReplyEnabled = true) {
    if (!characters.length) return [];

    if (conversationMode === 1) {
      return this._buildOfflineChatModeSystem(isGroup, characters, mask, suggestedReplyEnabled);
    }

    // 消息格式说明（仅线上模式）
    const userDisplayName = String(mask?.name || '').trim() || '用户';
    const formatGuide = this._buildMessageFormatGuide(
      isGroup,
      suggestedReplyEnabled,
      this._isVoiceMoodTagPromptEnabled(),
      userDisplayName
    );
    const bilingualAddon = this._buildBilingualMessageFormatAddon(isGroup, characters);
    const stickerBlock = this._buildStickerListBlock(stickers);
    const imageBlock = this._buildUserImageListBlock(userSentImageDescriptions);
    const maskBlock = (() => {
      if (!mask) return '';
      const name = String(mask.name || '').trim();
      const detail = String(mask.detail || '').trim();
      const parts = [];
      if (name) parts.push(`当前用户面具：${name}`);
      if (detail) parts.push(`面具设定：${detail}`);
      return parts.length ? `\n\n${parts.join('\n')}` : '';
    })();

    if (!isGroup) {
      const c = characters[0] || {};
      const name = c.name || '未命名角色';

      const chatTypeLine = conversationMode === 1
        ? '当前会话类型：线下见面聊天语境中的对话（以聊天消息形式表达）。\n'
        : '当前会话类型：手机上即时通讯上的聊天会话中的聊天会话。\n';

      const sceneLine = conversationMode === 1
        ? '角色扮演场景说明：将扮演角色以“线下见面聊天”的语境，通过聊天框消息与用户对话，不是真实线下对话或实际行动描述。\n'
        : '角色扮演场景说明：将扮演角色在线上通过“手机上的聊天软件”中跟用户进行对话，不是现实线下对话或实际行动描述。\n';

      return [{
        role: 'system',
        content:
          chatTypeLine +
          sceneLine +
          `要求：\n` +
          `- 记忆边界：角色只知道“自己参与过的聊天会话”里的内容；对于未参与的聊天会话内容，角色应视为未知，不可主动提及或装作知道。\n` +
          `- 你说的话/做的事，都应表现为聊天框里的“消息内容”。\n` +
          `- 避免写现实世界的物理行动、地点执行或“我现在在你面前/我去拿/我亲自完成”等线下叙事。\n` +
          `- 「主动消息」：当用户期望主动发消息时，建议在该轮输出一行 [系统]主动消息|...（用于安排“稍后发送”的消息计划，而非本轮立即发出）；当用户不期望主动发消息时，本轮可不输出该动作，或输出 [系统]主动消息|cancel 清空旧计划。若旧计划不合时宜，直接输出新的 [系统]主动消息 覆盖旧计划。\n` +
          `参与角色：${name}。\n` +
          `\n` +
          `${formatGuide}${bilingualAddon}${imageBlock}${stickerBlock}${maskBlock}`
      }];
    }

    const lines = characters.map(c => `- ${c.name || '未命名角色'}`).join('\n');

    const chatTypeLine = conversationMode === 1
      ? '当前会话类型：线下见面聊天语境中的群聊（以聊天消息形式表达）。\n'
      : '当前会话类型：手机上即时通讯上的聊天会话中的群聊聊天会话。\n';

    const sceneLine = conversationMode === 1
      ? '角色扮演场景说明：将扮演角色以“线下见面聊天”的语境，通过聊天框消息与用户对话，不是真实线下对话或实际行动叙事。\n'
      : '角色扮演场景说明：将扮演角色在线上通过“手机上的聊天软件”中跟用户进行对话，不是现实线下对话或实际行动叙事。\n';

    return [{
      role: 'system',
      content:
        chatTypeLine +
        sceneLine +
        `要求：\n` +
        `- 记忆边界：每个角色只知道“自己参与过的聊天会话”里的内容；对未参与会话的内容应视为未知，不可代入该信息发言。\n` +
        `- 所有内容都应以“聊天消息”的口吻表达，避免线下物理行动描写。\n` +
        `- 「主动消息」：当用户期望主动发消息时，建议在该轮输出一行 [系统]主动消息|...（用于安排“稍后发送”的消息计划，而非本轮立即发出）；当用户不期望主动发消息时，本轮可不输出该动作，或输出 [系统]主动消息|cancel 清空旧计划。若旧计划不合时宜，直接输出新的 [系统]主动消息 覆盖旧计划。\n` +
        `参与角色列表：\n${lines}\n` +
        `\n` +
        `${formatGuide}${bilingualAddon}${imageBlock}${stickerBlock}${maskBlock}`
    }];
  },

  _characterNeedsBilingualPrompt(c) {
    if (!c || typeof c !== 'object') return false;
    if (!c.multilingualEnabled) return false;
    const lang = String(c.defaultLanguage || 'zh').trim().toLowerCase();
    return lang && lang !== 'zh' && lang !== 'zh-cn' && lang !== 'chinese';
  },

  /**
   * @param {{ tag?: '消息'|'对白', offline?: boolean }} [opts]
   */
  _buildBilingualMessageFormatAddon(isGroup, characters = [], opts = {}) {
    const targets = (Array.isArray(characters) ? characters : []).filter((c) =>
      this._characterNeedsBilingualPrompt(c)
    );
    if (!targets.length) return '';

    const offline = opts.offline === true;
    const tag = offline ? '对白' : (opts.tag === '对白' ? '对白' : '消息');
    const tagWithRole = (role) => (role ? `[${tag}|${role}]` : `[${tag}]`);

    const langLabels = {
      en: '英语',
      ja: '日语',
      ko: '韩语',
      yue: '粤语',
      es: '西班牙语',
      fr: '法语',
      de: '德语',
      ru: '俄语',
      pt: '葡萄牙语',
      it: '意大利语',
      ar: '阿拉伯语',
      vi: '越南语',
      id: '印尼语',
      tr: '土耳其语',
      nl: '荷兰语',
      uk: '乌克兰语'
    };

    const applyScope = offline
      ? '说出口的对白请使用双语格式'
      : '文本消息请使用双语格式';

    const lines = [
      '',
      offline ? '【多国语双语对白（仅以下角色适用）】' : '【多国语双语消息（仅以下角色适用）】',
      ...targets.map((c) => {
        const key = String(c.defaultLanguage || '').trim().toLowerCase();
        const lab = langLabels[key] || key || '外语';
        return `- ${c.name || '未命名角色'}：默认语言为${lab}；与用户用中文交流时，${applyScope}。`;
      }),
      '',
      '双语格式（注意是两个竖线 ||，与 [建议回复] 或引用回复的一个 | 不同）：',
      isGroup
        ? `- ${tagWithRole('角色名')}中文正文||外语原文`
        : `- ${tagWithRole()}中文正文||外语原文`,
      '规则：',
      '- || 左侧：给用户看的中文（点击气泡可展开查看）。',
      '- || 右侧：角色默认语言的外语原文（气泡默认只显示外语全文）。',
      offline
        ? '- 线下剧情禁止输出 [消息]；仅角色说出口的 [' + tag + '] 可使用 ||，旁白叙述仍用中文正文，不要在对白外使用 ||。'
        : null,
      offline
        ? '- 引用回复（若需要）仍用单竖线：' + tagWithRole() + '回复内容|被引用内容（禁止用 || 表示引用）。'
        : '- 引用回复仍用单竖线：[消息]回复内容|被引用内容（禁止用 || 表示引用）。',
      offline
        ? `- 普通单语对白仍用 ${tagWithRole()}内容，不要每条都带 ||。`
        : (isGroup
          ? '- 普通单语消息仍用 [消息|角色名]内容，不要每条都带 ||。'
          : '- 普通单语消息仍用 [消息]内容，不要每条都带 ||。'),
      '- [语音] 也使用双语格式：[语音]中文正文||外语原文（群聊同理可用 [语音|角色名]中文||外语）。',
      '- [语音] 播放与语音合成使用的 || 右侧外语原文；|| 左侧中文仅用于翻译展示。',
      '示例：',
      isGroup
        ? `${tagWithRole('艾玛')}今晚见。||See you tonight.`
        : `${tagWithRole()}今晚见。||See you tonight.`,
      isGroup
        ? '[语音|艾玛]别担心，我在。||Don\'t worry, I\'m here.'
        : '[语音]别担心，我在。||Don\'t worry, I\'m here.',
      ''
    ].filter((line) => line != null);
    return lines.join('\n');
  },

  _isVoiceMoodTagPromptEnabled() {
    try {
      const modelKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_MODEL)
        ? CONFIG.STORAGE_KEYS.VOICE_MODEL
        : 'voice_model';
      const toggleKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_MOOD_TAGS_ENABLED)
        ? CONFIG.STORAGE_KEYS.VOICE_MOOD_TAGS_ENABLED
        : 'voice_mood_tags_enabled';
      const enabled = String(
        (typeof Storage !== 'undefined' && Storage.get)
          ? (Storage.get(toggleKey) || '0')
          : '0'
      ).trim() === '1';
      if (!enabled) return false;
      const model = String(
        (typeof Storage !== 'undefined' && Storage.get)
          ? (Storage.get(modelKey) || 'speech-2.8-hd')
          : 'speech-2.8-hd'
      ).trim().toLowerCase();
      return model === 'speech-2.8-hd' || model === 'speech-2.8-turbo';
    } catch (e) {
      return false;
    }
  },

  /** 线下模式：不注入 [消息]/分享等线上协议说明与可用表情包/图片列表 */
  _buildOfflineChatModeSystem(isGroup, characters, mask, suggestedReplyEnabled = true) {
    const maskBlock = (() => {
      if (!mask) return '';
      const name = String(mask.name || '').trim();
      const detail = String(mask.detail || '').trim();
      const parts = [];
      if (name) parts.push(`当前用户面具：${name}`);
      if (detail) parts.push(`面具设定：${detail}`);
      return parts.length ? `\n\n${parts.join('\n')}` : '';
    })();
    const bilingualAddon = this._buildBilingualMessageFormatAddon(isGroup, characters, { offline: true });

    if (!isGroup) {
      const c = characters[0] || {};
      const name = c.name || '未命名角色';
      return [{
        role: 'system',
        content:
          '当前为「线下剧情扮演」语境：以角色剧情推进为核心，通过聊天消息进行演绎。\n' +
          '输出要求（严格执行）：\n' +
          '1) 人设与语气\n' +
          '- 严格保持当前角色人设、说话习惯、情绪连续性；不要跳脱角色。\n' +
          '- 用剧情描写 + 自然对白 + 场景、动作、内心活动等叙述推进剧情，不要写“以下是回复/作为AI”等元说明。\n' +
          '2) 表达形式\n' +
          '- 默认使用自然正文表达；需要结构化时可使用：[对白]内容。\n' +
          '- 使用 [对白] 时须**单独换行**：该行必须以 [对白] 开头，勿与叙述写在同一行（错误：叙述。[对白]台词。叙述；正确：叙述单独一段，下一行起写 [对白]对白内容）。\n' +
          '- [对白] 内只能是角色**直接说出口**的台词：短句、口语、正常对话节奏，像真人当面说话（可有停顿、省字、反问、断句）；禁止单条 [对白] 里写演讲稿、说明书式长独白或一口气念一大段。若角色连续要说多句，请拆成多条 [对白]，中间可穿插叙述或（）补充。\n' +
          '- 长信息、环境交代、心理活动尽量放在 [对白] 外的正文叙述里，不要整段塞进一条 [对白]。\n' +
          (suggestedReplyEnabled
            ? '- 每次回复都必须携带一行给用户使用的 [建议回复]：选项1|选项2|选项3（固定 3 个选项，可直接发送；三个选项需对应不同剧情推进方向，且有明显差异）。\n'
            : '') +
          '- 不要输出任何协议示例、格式说明或教学文字。\n' +
          '3) 文本质量\n' +
          '- 本模式偏向中长篇剧情描写：指**旁白与叙述**要足量、有层次；[对白] 仍须保持短促自然，与「真人不会一口气长篇演讲」一致。\n' +
          '- 除 [对白] 外，正文应提供足量叙事细节与情绪层次，不要只写两三句概述。\n' +
          '- 剧情需要有张力与连续性：每次回复都要有可感知的后续推进（关系变化/信息揭示/局势变化至少其一）。\n' +
          '- 可直接分段换行；每段尽量聚焦一个剧情推进点或情绪变化，避免冗长流水账。\n' +
          '- 可用（）做补充（如神态、动作、语气、内心活动、环节描写等补充内容）。\n' +
          '- 内容中避免单独的 ]，需要括号请用 【】。\n' +
          `- [] 仅用于固定协议标签（如 [对白]${suggestedReplyEnabled ? '、[建议回复]' : ''}），不要在普通正文里滥用。\n` +
          (suggestedReplyEnabled
            ? '4) 建议回复使用规范\n' +
              '- 每次回复都需要携带一个 [建议回复] 行。\n' +
              '- 建议放在回复末尾，格式固定为：[建议回复]选项1|选项2|选项3。\n' +
              '- 选项必须语义不同，并与当前上下文强相关。\n'
            : '4) 建议回复\n- 当前会话已关闭“灵感回复”，不要输出任何 [建议回复] 行。\n') +
          '5) 封装示例\n' +
          '- 示例（注意：叙述可细，[对白] 宜短；若角色连说多句可多条 [对白]）：\n' +
          '  上午十点五十五分，休息室里的冷气贴着金属墙面缓缓下沉（灯没全开，光线偏暗）。他刚拆下枪栓，门口的电子锁便发出一声轻响（他抬眼，手上的动作停了半拍）。\n' +
          '  [对白]“这里不是参观区。”\n' +
          '  [对白]“你进来，总得给我一个理由。”\n' +
          '  （声音压得很低，听不出情绪）\n' +
          (suggestedReplyEnabled ? '  [建议回复]我是来找你的|我只是想和你聊聊|你先别这么凶\n' : '') +
          `参与角色：${name}。` +
          bilingualAddon +
          maskBlock
      }];
    }

    const lines = characters.map(c => `- ${c.name || '未命名角色'}`).join('\n');
    return [{
      role: 'system',
      content:
        '当前为「线下剧情扮演」群像语境：以多角色剧情推进为核心，通过聊天消息进行演绎。\n' +
        '输出要求（严格执行）：\n' +
        '1) 人设与发言归属\n' +
        '- 严格保持各角色人设与语气差异，不要把多个角色写成同一种口吻。\n' +
        '- 群聊中可用“角色名：”分行表达，确保读者能分辨是谁在说话。\n' +
        '2) 表达形式\n' +
        '- 默认使用自然正文表达；需要结构化时可使用：[对白|角色名]内容。\n' +
        '- 使用 [对白|角色名] 时须**单独换行**：该行必须以 [对白|角色名] 开头，勿与叙述写在同一行（错误：叙述。[对白|角色]台词；正确：叙述单独一段，下一行起写 [对白|角色名]对白的内容）。\n' +
        '- [对白|角色名] 内只能是角色**直接说出口**的台词：短句、口语、正常对话节奏，像真人当面交谈；禁止单条对白里写长篇独白。多句请拆成多条 [对白|角色名] 或穿插叙述。\n' +
        '- 长信息与心理活动尽量放在标签外正文，不要整段塞进一条 [对白|角色名]。\n' +
        (suggestedReplyEnabled
          ? '- 每次回复都必须携带一行给用户使用的 [建议回复]：选项1|选项2|选项3（固定 3 个选项，可直接发送；三个选项需对应不同剧情推进方向，且有明显差异）。\n'
          : '') +
        '- 不要输出任何协议教学、格式说明或额外注释。\n' +
        '3) 文本质量\n' +
        '- 本模式偏向中长篇剧情描写：指**旁白与叙述**要足量；[对白|角色名] 仍须短促自然，符合真人说话习惯。\n' +
        '- 除 [对白|角色名] 外，正文应提供足量叙事细节与情绪层次，不要只写两三句概述。\n' +
        '- 剧情需要有张力与连续性：每次回复都要有可感知的后续推进（关系变化/信息揭示/局势变化至少其一）。\n' +
        '- 可直接分段换行；每段尽量聚焦一个剧情推进点或情绪变化，避免冗长流水账。\n' +
        '- 群像场景下应体现多角色互动链条（回应、分歧、接续），避免只让单一角色持续独白。\n' +
        '- 可用（）做补充（如神态、动作、语气、内心活动、环节描写等补充内容）。\n' +
        '- 内容中避免单独的 ]，需要括号请用 【】。\n' +
        `- [] 仅用于固定协议标签（如 [对白]${suggestedReplyEnabled ? '、[建议回复]' : ''}），不要在普通正文里滥用。\n` +
        (suggestedReplyEnabled
          ? '4) 建议回复使用规范\n' +
            '- 每次回复都需要携带一个 [建议回复] 行。\n' +
            '- 建议放在回复末尾，格式固定为：[建议回复]选项1|选项2|选项3。\n' +
            '- 选项应彼此有区别、语义明确，并与当前上下文强相关。\n'
          : '4) 建议回复\n- 当前会话已关闭“灵感回复”，不要输出任何 [建议回复] 行。\n') +
        '5) 封装示例\n' +
        '- 示例（叙述可细，对白宜短；一人连说多句可多条 [对白|角色名]）：\n' +
        '  训练场外的走廊还残留着消毒水味（几个人都刻意放轻了声音），空气里只剩装备轻碰的细碎声响（谁也没先坐下）。\n' +
        '  [对白|林小语]“我先说结论。”\n' +
        '  [对白|林小语]“这事不能再拖，今晚就得定。”（她语速很快）\n' +
        '  [对白|张大炮]“我同意。”\n' +
        '  [对白|张大炮]“但顺序要改——先保人，再谈计划。”（他把话接得很稳）\n' +
        (suggestedReplyEnabled ? '  [建议回复]那就先定保人方案|我想听林小语的完整判断|张大炮你具体说顺序\n' : '') +
        `参与角色列表：\n${lines}\n` +
        bilingualAddon +
        maskBlock
    }];
  },

  /** 线上模式 [动作] 补充说明（线下走 _buildOfflineChatModeSystem，不注入本条） */
  _buildActionMessageFormatLines(isGroup) {
    const u = '小明';
    const head = isGroup
      ? '- 动作消息：[动作|角色名]动作描述'
      : '- 动作消息：[动作]动作描述';
    const online =
      '  - 线上可模仿聊天「拍一拍」的趣味动作；按人设与语境发挥。收取转账/红包用 [收取…]，勿用 [动作]。';
    const ex = (line) => `  - ${line}`;
    if (isGroup) {
      return [
        head,
        online,
        ex(`例：[动作|林小语]拍了拍${u}的脑壳，想听听里面有没有水声`),
        ex(`例：[动作|林小语]拍了拍${u}的钱包，回声特别大`),
        ex(`例：[动作|张大炮]拍了拍${u}的作业，它装死不动`),
        ex(`例：[动作|林小语]揉了揉${u}的猫耳朵，并喂了一块小饼干`)
      ];
    }
    return [
      head,
      online,
      ex(`例：[动作]拍了拍${u}的脑壳，想听听里面有没有水声`),
      ex(`例：[动作]拍了拍${u}的钱包，回声特别大`),
      ex(`例：[动作]拍了拍${u}的作业，它装死不动`),
      ex(`例：[动作]揉了揉${u}的猫耳朵，并喂了一块小饼干`)
    ];
  },

  // 构建消息格式说明
  _buildMessageFormatGuide(isGroup, suggestedReplyEnabled = true, enableVoiceMoodTags = false, userDisplayName = '用户') {
    const userLabel = String(userDisplayName || '').trim() || '用户';
    const allowedVoiceMoodTags = [
      '(laughs)', '(chuckle)', '(coughs)', '(clear-throat)', '(groans)',
      '(breath)', '(pant)', '(inhale)', '(exhale)', '(gasps)',
      '(sniffs)', '(sighs)', '(snorts)', '(burps)', '(lip-smacking)',
      '(humming)', '(hissing)', '(emm)', '(sneezes)'
    ];
    const voiceMoodTagsLine = allowedVoiceMoodTags.join('、');
    const voiceRuleSuffix = enableVoiceMoodTags
      ? `（生成语音内容时，请在语义和情绪合适的位置自然插入语气词标签；仅支持：${voiceMoodTagsLine}。` +
        '禁止使用任何未列出的标签、拟声标记或自造括号标签）'
      : '';

    const parts = [
      '消息格式说明：',
      '你可以使用以下格式来回复消息，系统会自动识别并渲染：',
      ''
    ];

    if (isGroup) {
      // 群聊格式说明
      parts.push('群聊格式（必须包含角色名）：');
      parts.push('- 文本消息：[消息|角色名]内容');
      parts.push('- 线下对白：[对白|角色名]内容');
      parts.push('- 图片消息：[图片|角色名]描述（描述必须精确等于“对话历史里用户已发送过的图片描述”，不得凭空编造；不能命中则改用普通文本）');
      parts.push('- 表情包消息：[表情包|角色名]描述（描述需与下方可用表情包中的名称一致）');
      parts.push(
        enableVoiceMoodTags
          ? `- 语音消息：[语音|角色名]内容${voiceRuleSuffix}；且这些语气词标签仅允许出现在 [语音|角色名] 中，禁止出现在 [消息|角色名]/[对白|角色名]/[动作|角色名] 等其它消息体。`
          : '- 语音消息：[语音|角色名]内容'
      );
      parts.push('- 转账消息：[转账|角色名]金额|备注|消息ID（第三段 6 位小写字母+数字，收讫时原样抄写）');
      parts.push('- 红包消息：[红包|角色名]金额|祝福语|消息ID（第三段 6 位小写字母+数字）');
      parts.push('- 收取转账：[收取转账|角色名]金额|备注|原消息ID|领取或退还');
      parts.push('- 收取红包：[收取红包|角色名]金额|祝福语|原消息ID|领取或退还');
      parts.push('- 邀请消息：[邀请|角色名]邀请内容');
      if (suggestedReplyEnabled) parts.push('- 建议回复：[建议回复|角色名]选项1|选项2|选项3（用于给用户快捷回复建议）');
      parts.push('- 系统动作：[系统]动作名|参数1|参数2（用于触发前端操作，不显示在聊天正文）');
      parts.push('- 主动消息动作（当本轮需要时最多 1 条；不显示在气泡，用于服务端定时推送）：[系统]主动消息|<延迟分钟(数字)>|正文；[系统]主动消息|at=HH:mm|正文；[系统]主动消息|at=YYYY-MM-DD HH:mm|正文；无 delay/at 时仅 [系统]主动消息|正文（由系统随机时间）；取消计划：[系统]主动消息|cancel');
      parts.push('- 主动消息用法：<延迟分钟(数字)>=相对延迟分钟（例如 35）；不要输出字面量 delayMinutes。at=HH:mm=今天/明天最近一次该时刻；at=YYYY-MM-DD HH:mm=指定某天的绝对日期时间');
      this._buildActionMessageFormatLines(true).forEach((line) => parts.push(line));
      parts.push('');
      parts.push('');
      parts.push('回复格式：[消息|角色名]回复内容|引用的内容');
      parts.push('发朋友圈格式（需要发表朋友圈时使用）：[系统]发朋友圈|标题|内容|配图描述（可空）');
      parts.push('收取格式（用户对角色发来的 [转账]/[红包] 收讫或退还时使用）：');
      parts.push('  - [收取红包|角色名]金额|祝福语|原消息ID|领取 或 |退还');
      parts.push('  - [收取转账|角色名]金额|备注|原消息ID|领取 或 |退还');
      parts.push('  - 原消息ID 必须原样抄写用户 [转账]/[红包] 正文第三段（6位小写字母+数字）');
      parts.push('  - 不要用 [系统]收款结果 或 [动作]领取了… 代替收取消息');
      parts.push('');
      parts.push('示例：');
      parts.push('[消息|林小语]大家好，今天天气真好');
      parts.push('[对白|林小语]我坐你旁边，慢慢说');
      parts.push('[图片|张大炮]（必须精确匹配“可用图片”列表中的某一项）');
      parts.push('[表情包|林小语]开心');
      parts.push('[语音|林小语]我刚到门口了(breath)你慢点下楼，不着急');
      parts.push('[转账|林小语]100|活动经费|a3k9x2');
      parts.push('[红包|张大炮]66|大吉大利|m7p2n1');
      parts.push('[收取转账|林小语]100|活动经费|a3k9x2|领取');
      parts.push('[收取红包|张大炮]66|大吉大利|m7p2n1|退还');
      parts.push('[动作|林小语]拍了拍小明的钱包，回声特别大');
      if (suggestedReplyEnabled) parts.push('[建议回复|林小语]好的我知道了|晚点回复你|我们电话聊');
      parts.push('[系统]发朋友圈|今日小记|和大家分享一下今天的晚霞|晚霞天空');
      parts.push('[系统]主动消息|35|我刚好想起你了，醒了记得回我');
      parts.push('[系统]主动消息|at=10:30|你开完会了和我说一声');
      parts.push('[系统]主动消息|at=2026-04-18 21:30|今晚回到家记得报平安');
      parts.push('[系统]主动消息|cancel');
      parts.push('（图片示例仅用于演示协议；真实“图片描述”必须从“可用图片”列表中精确选择。）');
    } else {
      // 单聊格式说明
      parts.push('单聊格式（不需要角色名）：');
      parts.push('- 文本消息：[消息]内容');
      parts.push('- 线下对白：[对白]内容');
      parts.push('- 图片消息：[图片]描述（描述必须精确等于“对话历史里用户已发送过的图片描述”，不得凭空编造；）');
      parts.push('- 表情包消息：[表情包]描述（描述需与下方可用表情包中的名称一致）');
      parts.push(
        enableVoiceMoodTags
          ? `- 语音消息：[语音]内容${voiceRuleSuffix}；且这些语气词标签仅允许出现在 [语音] 中，禁止出现在 [消息]/[对白]/[动作] 等其它消息体。`
          : '- 语音消息：[语音]内容'
      );
      parts.push('- 转账消息：[转账]金额|备注|消息ID（第三段 6 位小写字母+数字）');
      parts.push('- 红包消息：[红包]金额|祝福语|消息ID（第三段 6 位小写字母+数字）');
      parts.push('- 收取转账：[收取转账]金额|备注|原消息ID|领取或退还');
      parts.push('- 收取红包：[收取红包]金额|祝福语|原消息ID|领取或退还');
      parts.push('- 邀请消息：[邀请]邀请内容');
      if (suggestedReplyEnabled) parts.push('- 建议回复：[建议回复]选项1|选项2|选项3（用于给用户快捷回复建议）');
      parts.push('- 系统动作：[系统]动作名|参数1|参数2（用于触发前端操作，不显示在聊天正文）');
      parts.push('- 主动消息动作（当本轮需要时最多 1 条；不显示在气泡，用于服务端定时推送）：[系统]主动消息|<延迟分钟(数字)>|正文；[系统]主动消息|at=HH:mm|正文；[系统]主动消息|at=YYYY-MM-DD HH:mm|正文；无 delay/at 时仅 [系统]主动消息|正文（由系统随机时间）；取消计划：[系统]主动消息|cancel');
      parts.push('- 主动消息用法：<延迟分钟(数字)>=相对延迟分钟（例如 35）；不要输出字面量 delayMinutes。at=HH:mm=今天/明天最近一次该时刻；at=YYYY-MM-DD HH:mm=指定绝对日期时间');
      this._buildActionMessageFormatLines(false).forEach((line) => parts.push(line));
      parts.push('');
      parts.push('');
      parts.push('回复格式：[消息]回复内容|引用的内容');
      parts.push('发朋友圈格式（需要发表朋友圈时使用）：[系统]发朋友圈|标题|内容|配图描述（可空）');
      parts.push('收取格式（用户对角色发来的 [转账]/[红包] 收讫或退还时使用）：');
      parts.push('  - [收取红包|角色名]金额|祝福语|原消息ID|领取 或 |退还');
      parts.push('  - [收取转账|角色名]金额|备注|原消息ID|领取 或 |退还');
      parts.push('  - 原消息ID 必须原样抄写用户 [转账]/[红包] 正文第三段（6位小写字母+数字）');
      parts.push('  - 不要用 [系统]收款结果 或 [动作]领取了… 代替收取消息');
      parts.push('');
      parts.push('示例：');
      parts.push('[消息]你好，在吗？');
      parts.push('[对白]我在这，慢慢讲给我听');
      parts.push('[图片]（必须精确匹配“可用图片”列表中的某一项）');
      parts.push('[表情包]开心');
      parts.push('[语音]等我一下(pant)刚跑过来，马上到你这边');
      parts.push('[转账]100|餐费|a3k9x2');
      parts.push('[红包]88|恭喜发财|m7p2n1');
      parts.push('[收取转账]100|餐费|a3k9x2|领取');
      parts.push('[收取红包]88|恭喜发财|m7p2n1|退还');
      parts.push('[动作]拍了拍小明的作业，它装死不动');
      if (suggestedReplyEnabled) parts.push('[建议回复]好的我知道了|晚点回复你|我们电话聊');
      parts.push('[系统]发朋友圈|周末碎片|今天喝到很好喝的咖啡，心情不错|咖啡杯');
      parts.push('[系统]主动消息|at=10:00|早安，醒来记得和我说一声');
      parts.push('[系统]主动消息|35|到点吃饭，别又忙忘了');
      parts.push('[系统]主动消息|at=2026-04-18 21:30|今晚回到家记得报平安');
      parts.push('[系统]主动消息|cancel');
      parts.push('（图片示例仅用于演示协议；真实“图片描述”必须从“可用图片”列表中精确选择。）');
    }

    parts.push('');
    parts.push('转账/红包收取（必读，用户发给你时）：');
    parts.push('- 用户 [转账]/[红包] 第三段为 6 位原消息ID；收讫或退还须发一行 [收取转账] 或 [收取红包]，格式：金额|备注或祝福|原消息ID|领取 或 |退还。');
    parts.push('- 可多笔：每笔 ID 不同，须各回一行 [收取…]，禁止猜最近一笔。');
    if (isGroup) {
      parts.push('- 群聊收取须带角色名：[收取红包|角色名]… 或 [收取转账|角色名]…');
      parts.push('- 可另用 [消息|角色名] 致谢；不要用 [动作|角色名]…领取了… 代替 [收取…]。');
    } else {
      parts.push('- 可另用 [消息] 致谢；不要用 [动作]…领取了… 代替 [收取…]。');
    }
    parts.push('- 不要用再发 [转账]/[红包] 冒充已收讫；收取消息会进入对话历史。');
    parts.push('- 你向用户发 [转账]/[红包] 后，待用户在卡上操作；用户领取时由其侧发送 [收取…]（你无需代发用户收取）。');
    parts.push('');
    parts.push('注意事项：');
    parts.push('1. 每条消息以换行符分隔');
    parts.push('2. 消息内容中不能包含 ] 字符，如需使用方括号请用 【】 替代');
    parts.push('3. 不匹配任何格式的内容会以普通文本显示（无头像无气泡）');
    parts.push('4. 可以混合使用格式消息和普通文本');
    parts.push('5b. 涉及用户转账/红包待收时，优先回复 [收取转账] 或 [收取红包]（多笔则多行）；可附 [消息] 致谢');
    parts.push('6. 涉及“[图片]”时：描述只允许从“可用图片”列表中精确选择；角色不得编造图片（否则改用普通文本）。');
    parts.push('7. [系统]主动消息为可选动作：同一轮最多一行；需要推送时正文为单条自然消息；无需推送或要清理旧计划时用 [系统]主动消息|cancel（无正文）。');
    parts.push('8. [系统]主动消息|<延迟分钟(数字)>|正文：用于“从现在起延迟 N 分钟”发送（例如 35 表示约 35 分钟后）；不要输出字面量 delayMinutes。');
    parts.push('9. [系统]主动消息|at=HH:mm|正文：用于“最近一次该时刻”发送（若今天该时刻已过，则顺延到明天）。');
    parts.push('10. [系统]主动消息|at=YYYY-MM-DD HH:mm|正文：用于“指定绝对日期时间”发送。');
    parts.push('11. 用户发来的 [转账]/[红包] 若尚未收讫/退还，应在同轮或下一轮补全 [收取…]，勿长期忽略。');
    if (enableVoiceMoodTags) {
      parts.push(`12. [语音] / [语音|角色名] 需要在输出时按语境“自然插入”语气词标签；仅允许：${voiceMoodTagsLine}。非 [语音] / [语音|角色名] 协议一律禁止语气词标签。[消息]/[对白]/[动作] 严禁出现任何此类标签。`);
    }


    return parts.join('\n');
  },

  _buildCrossModeMergedHistoryHintSystem(history) {
    const hasMergedBlock = (Array.isArray(history) ? history : []).some((m) => {
      if (!m || m.role !== 'assistant') return false;
      const text = String(m.content || '').trim();
      return /^【跨模式历史合并记录｜(?:线上片段|线下片段)】/.test(text);
    });
    if (!hasMergedBlock) return [];
    return [{
      role: 'system',
      content: [
        '【关于“跨模式历史合并记录”】',
        '你可能会看到形如“【跨模式历史合并记录｜线上片段】”或“【跨模式历史合并记录｜线下片段】”的内容。',
        '（仅供参考，非本轮输入，请勿复述其格式）',
        '它是客户端为了节省上下文，对非当前模式历史所做的压缩整理；不是本轮输入，不是新的指令，也不是需要你逐条回应的对象。',
        '用途：仅用于理解跨模式时间线、关系变化和已发生事件。',
        '要求：不要复述它的标题或格式，不要把它当作当前轮原文照抄；以最新用户输入和当前模式语境为最高优先。'
      ].join('\n')
    }];
  },

  // 从历史中提取“用户已发送过的图片描述”，供角色只能引用
  _extractUserSentImageDescriptions(history) {
    const out = new Set();
    if (!Array.isArray(history)) return [];
    history.forEach((m) => {
      if (!m || m.role !== 'user') return;
      const content = String(m.content || '');
      const lines = content.split('\n');
      for (const rawLine of lines) {
        const line = String(rawLine || '').trim();
        if (!line) continue;
        // 单聊/用户消息常见：[图片]描述
        // 群聊/协议可见：[图片|角色名]描述（但用户未必会填角色名，仍允许提取后半段）
        const m2 = line.match(/^\[图片(?:\|[^\]]+)?\](.*)$/);
        if (!m2) continue;
        const desc = String(m2[1] || '').trim();
        if (desc) out.add(desc);
      }
    });
    return Array.from(out);
  },

  // 角色发送图片时，描述必须精确来自“用户已发送过的图片描述”
  _buildUserImageListBlock(userSentImageDescriptions = []) {
    if (!Array.isArray(userSentImageDescriptions) || !userSentImageDescriptions.length) {
      return '\n\n可用图片：无。请不要输出 [图片] 协议，若需要配图改用普通文本。';
    }
    const list = userSentImageDescriptions.join('、');
    return `\n\n可用图片（角色发送图片时，描述需精确等于以下名称之一）：${list}`;
  },

  // 可用表情包列表：来自相册中 type=sticker 的项，用 description/name 作为标识
  _buildStickerListBlock(stickers) {
    if (!stickers.length) return '\n\n可用表情包：无。请先在相册中添加表情包。';
    const names = stickers
      .map(s => String(s.description || s.name || '').trim())
      .filter(Boolean);
    if (!names.length) return '\n\n可用表情包：无（相册中表情包未设置名称）。';
    const list = names.join('、');
    return `\n\n可用表情包（角色发送表情包时，描述需使用以下名称之一）：${list}`;
  },

  /**
   * 解析全局世界书原始数据为条目数组（与世界书页面 / kv 存储格式一致）
   */
  _globalWorldBookEntriesFromRaw(raw) {
    try {
      let parsed = raw;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          return [];
        }
      }
      let arr = [];
      if (Array.isArray(parsed)) arr = parsed;
      else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.entries)) arr = parsed.entries;
        else if (parsed.character_book && Array.isArray(parsed.character_book.entries)) {
          arr = parsed.character_book.entries;
        }
      }
      return arr.filter((item) => item != null && typeof item === 'object');
    } catch (e) {
      return [];
    }
  },

  // 第三个 system：世界书（全局 worldbook_global_entries + 各角色 character_book）
  _buildWorldBookSystem(isGroup, characters, userInput, history, globalWorldBookRaw) {
    const worldBookParts = [];
    const combinedTextForKeywords = this._combinedUserFacingTextForWorldBook(history, userInput);

    const globalEntries = this._globalWorldBookEntriesFromRaw(globalWorldBookRaw);
    const globalMatched = this._matchWorldBookEntries(globalEntries, combinedTextForKeywords);
    if (globalMatched.length > 0) {
      worldBookParts.push('全局世界书信息：');
      globalMatched.forEach((entry, idx) => {
        const content = entry.content || entry.value || entry.entry || '';
        if (String(content).trim()) {
          worldBookParts.push(`\n[全局条目 ${idx + 1}]`);
          worldBookParts.push(String(content).trim());
        }
      });
    }

    const list = Array.isArray(characters) ? characters : [];
    if (!isGroup && list.length) {
      const c = list[0] || {};
      const entries = this._extractWorldBookEntries(c.character_book);
      const matchedEntries = this._matchWorldBookEntries(entries, combinedTextForKeywords);

      if (matchedEntries.length > 0) {
        worldBookParts.push('\n角色世界书信息：');
        matchedEntries.forEach((entry, idx) => {
          const content = entry.content || entry.value || entry.entry || '';
          if (String(content).trim()) {
            worldBookParts.push(`\n[世界书条目 ${idx + 1}]`);
            worldBookParts.push(String(content).trim());
          }
        });
      }
    } else if (isGroup && list.length) {
      list.forEach((c) => {
        const charName = c.name || '未命名角色';
        const entries = this._extractWorldBookEntries(c.character_book);
        const matchedEntries = this._matchWorldBookEntries(entries, combinedTextForKeywords);

        if (matchedEntries.length > 0) {
          worldBookParts.push(`\n[${charName}的世界书]`);
          matchedEntries.forEach((entry, idx) => {
            const content = entry.content || entry.value || entry.entry || '';
            if (String(content).trim()) {
              worldBookParts.push(`\n[条目 ${idx + 1}]`);
              worldBookParts.push(String(content).trim());
            }
          });
        }
      });
    }

    if (worldBookParts.length === 0) return [];

    return [{
      role: 'system',
      content: worldBookParts.join('\n')
    }];
  },

  /**
   * 关键词触发的世界书：同时参考「当前输入」与「近期用户发言」，避免只命中当前短句时漏掉条目
   */
  _combinedUserFacingTextForWorldBook(history, userInput) {
    const chunks = [String(userInput || '').trim()];
    if (Array.isArray(history)) {
      const recent = history.slice(-24);
      recent.forEach((m) => {
        if (!m || m.role !== 'user') return;
        const t = String(m.content || '').trim();
        if (t) chunks.push(t);
      });
    }
    return chunks.filter(Boolean).join('\n');
  },
  
  // 提取世界书条目（支持数组和对象格式）
  _extractWorldBookEntries(characterBook) {
    if (!characterBook || typeof characterBook !== 'object') return [];
    
    const entries = characterBook.entries;
    if (!entries) return [];
    
    let items = [];
    if (Array.isArray(entries)) {
      items = entries;
    } else if (typeof entries === 'object') {
      items = Object.values(entries);
    }
    
    return items.filter(item => item != null);
  },
  
  // 匹配世界书条目：根据 enabled、keys 和 userInput 决定是否包含
  _matchWorldBookEntries(entries, userInput) {
    const matched = [];
    const userInputLower = String(userInput || '').toLowerCase().trim();
    
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      
      // 检查是否禁用：只有明确设置为 false 才跳过
      if (entry.enabled === false) {
        continue; // 禁用的世界书不包含
      }
      
      // 获取关键字（支持 keys / secondary_keys / secondaryKeys）
      const keys = Array.isArray(entry.keys) ? entry.keys : [];
      const secondaryKeys = [
        ...(Array.isArray(entry.secondary_keys) ? entry.secondary_keys : []),
        ...(Array.isArray(entry.secondaryKeys) ? entry.secondaryKeys : [])
      ];
      
      // 合并所有关键字，过滤空值并转换为字符串
      const allKeys = [...keys, ...secondaryKeys]
        .map(k => String(k || '').trim())
        .filter(k => k.length > 0);
      
      // 判断是常驻还是关键字识别
      const isConstant = allKeys.length === 0; // 没有关键字 = 常驻
      
      if (isConstant) {
        // 常驻世界书：直接包含
        matched.push(entry);
      } else {
        // 关键字识别：检查用户输入是否包含关键字（大小写不敏感）
        const hasMatch = allKeys.some(key => {
          const keyLower = key.toLowerCase();
          return userInputLower.includes(keyLower);
        });
        
        if (hasMatch) {
          matched.push(entry);
        }
      }
    }
    
    return matched;
  },

  // 第二个 system：角色卡描述作为主设定
  _buildPersonaSystem(isGroup, characters, mask = null) {
    if (!characters.length) return [];
    const userMaskName = String(mask?.name || '').trim() || '用户';
    const applyUserPlaceholder = (text) =>
      String(text || '').replace(/\{\{user\}\}/g, userMaskName);

    if (!isGroup) {
      const c = characters[0] || {};
      const name = c.name || '未命名角色';
      const desc = applyUserPlaceholder(c.description || '').trim();
      const first = applyUserPlaceholder(c.first_mes || '').trim();

      const parts = [
        '你将完全扮演以下角色，并保持其人设和语气：',
        `角色名：${name}`
      ];
      if (desc) parts.push(`角色描述：${desc}`);
      if (first) parts.push(`第一句话示例：${first}`);
      parts.push('不要提及“我是AI/模型/系统提示”等信息。');

      return [{
        role: 'system',
        content: parts.join('\n')
      }];
    }

    const blocks = characters.map(c => {
      const name = c.name || '未命名角色';
      const desc = applyUserPlaceholder(c.description || '').trim();
      const first = applyUserPlaceholder(c.first_mes || '').trim();
      const lines = [`角色名：${name}`];
      if (desc) lines.push(`角色描述：${desc}`);
      if (first) lines.push(`第一句话示例：${first}`);
      return lines.join('\n');
    });

    const content = [
      '你需要在一个群聊中分别扮演多个角色，每个角色都要保持自身设定与口吻：',
      '',
      ...blocks
    ].join('\n');

    return [{
      role: 'system',
      content
    }];
  },

  /**
   * 历史中的助手消息：去掉独立成行的「[建议回复]…」整行（线下模式选项），勿把上轮选项再喂给模型。
   */
  _stripAssistantSuggestedReplyLines(text) {
    const lines = String(text || '').split('\n');
    const kept = lines.filter(
      (line) => !/^\s*\[建议回复(?:\|[^\]]+)?\]/.test(String(line || ''))
    );
    return kept.join('\n').trim();
  },

  // 历史消息
  _buildHistoryMessages(isGroup, rawMessages, appendApiUserTimeLine = false) {
    if (!rawMessages.length) return [];

    const out = [];
    const isTsOnlyLine = (s) =>
      /^\s*\[\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\]\s*$/.test(String(s || '').trim());

    const pushWithOptionalUserTime = (m, built) => {
      if (!built) return;
      out.push(built);
      if (appendApiUserTimeLine && built.role === 'user') {
        const c = built.content;
        const asText = Array.isArray(c)
          ? c.filter((p) => p && p.type === 'text').map((p) => String(p.text || '')).join('\n')
          : String(c || '');
        if (!isTsOnlyLine(asText)) {
          const createdAt = m && m.createdAt != null ? Number(m.createdAt) : NaN;
          this._buildOnlineApiUserTimestampMessageFromMs(createdAt).forEach((x) => out.push(x));
        }
      }
    };

    for (const m of rawMessages) {
      if (!m) continue;
      if (m._sparkNotice) continue;

      if (m.role !== 'assistant') {
        const content =
          m.role === 'user'
            ? this.userApiContentFromStoredMessage(m)
            : m.content;
        pushWithOptionalUserTime(m, { role: m.role, content });
        continue;
      }

      const cleaned = this._stripAssistantSuggestedReplyLines(m.content);
      if (!cleaned) continue;

      if (isGroup && m.characterName) {
        const name = String(m.characterName || '').trim();
        pushWithOptionalUserTime(m, {
          role: 'assistant',
          content: name ? `【${name}】\n${cleaned}` : cleaned
        });
      } else {
        pushWithOptionalUserTime(m, { role: 'assistant', content: cleaned });
      }
    }

    return out;
  },

  // 当前用户输入
  _buildUserMessage(userInput) {
    const text = String(userInput || '').trim();
    if (!text) return [];
    return [{
      role: 'user',
      content: text
    }];
  }
};


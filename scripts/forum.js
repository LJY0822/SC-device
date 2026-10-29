// 论坛（简版：列表 + 发帖）
const Forum = {
  _FORUMS_KEY: 'forum_forums',
  _CURRENT_FORUM_KEY: 'forum_current_forum_id',
  _DEFAULT_FORUM_ID: 'forum_default',
  _USER_FORUM_ACCOUNTS_KV_KEY: 'forum_user_accounts_v1',
  _refreshingForumIds: new Set(),
  _currentThreadId: '',
  _commentMode: 'comment',
  _pendingReplyTarget: null,

  _returnToRecordedPage() {
    const returnPage = String(State?.forumReturnPage || '').trim();
    const returnSessionId = String(State?.forumReturnSessionId || '').trim();
    if (returnPage === 'page-chat') {
      try {
        if (returnSessionId && typeof Chat !== 'undefined' && Chat && typeof Chat.openSession === 'function') {
          Chat.openSession(returnSessionId);
        }
      } catch (e) {}
      try {
        State.switchPage('page-chat');
      } catch (e) {
        State.backToHome();
      }
      State.forumReturnPage = null;
      State.forumReturnSessionId = null;
      return true;
    }
    return false;
  },

  init() {
    document.getElementById('forum-back')?.addEventListener('click', () => {
      if (this._returnToRecordedPage()) return;
      State.backToHome();
    });

    document.getElementById('forum-thread-back')?.addEventListener('click', () => {
      if (this._returnToRecordedPage()) return;
      State.switchPage('page-forum');
    });
    document.getElementById('forum-thread-share')?.addEventListener('click', async () => {
      const threadId = String(this._currentThreadId || '').trim();
      if (!threadId) return;
      try {
        const t = await Storage.dbGet('threads', threadId);
        if (!t) return;
        await this._openShareSessionPickerForThread(t);
      } catch (e) {
        if (typeof Chat !== 'undefined' && Chat && typeof Chat._toast === 'function') {
          Chat._toast('分享失败，请稍后重试');
        }
      }
    });

    document.getElementById('forum-refresh')?.addEventListener('click', async () => {
      await this.refreshThreads();
    });

    document.getElementById('forum-switch')?.addEventListener('click', () => {
      this.openForumPicker();
    });

    document.getElementById('forum-new')?.addEventListener('click', () => {
      this.openPublishPicker();
    });

    document.getElementById('forum-thread-load')?.addEventListener('click', async () => {
      await this.loadThreadComments(false, 'comment');
    });
    document.getElementById('forum-thread-more')?.addEventListener('click', async () => {
      await this.loadThreadComments(true, 'comment');
    });
    document.getElementById('forum-thread-send')?.addEventListener('click', async () => {
      await this.postThreadComment();
    });
    document.getElementById('forum-thread-input')?.addEventListener('keydown', async (e) => {
      if (e && e.key === 'Enter') {
        e.preventDefault();
        await this.postThreadComment();
      }
    });
    document.getElementById('forum-thread-mode')?.addEventListener('click', () => {
      this.openCommentModePicker();
    });
    document.getElementById('forum-thread-to-bottom')?.addEventListener('click', () => {
      this._scrollThreadCommentsToBottom();
    });

    window.addEventListener('yd:pagechange', (e) => {
      const to = e?.detail?.to;
      if (to === 'page-forum') {
        this._ensureForums();
        this._syncHeaderForumButton();
        this._syncRefreshButtonState();
        this.renderList();
      }
      if (to === 'page-forum-thread') {
        this._renderThreadDetail();
      }
    });
  },

  _ensureForums() {
    let forums = [];
    try {
      const raw = Storage.get(this._FORUMS_KEY);
      if (Array.isArray(raw)) forums = raw.filter(Boolean);
    } catch (e) {}

    if (!forums.length) {
      forums = [
        {
          id: this._DEFAULT_FORUM_ID,
          name: '默认',
          worldbook: '默认论坛世界书：这是一个通用论坛，可发布任何轻松话题。',
          icon: '💬',
          createdAt: Date.now()
        }
      ];
      try { Storage.set(this._FORUMS_KEY, forums); } catch (e) {}
    }

    // current forum
    try {
      const cur = Storage.get(this._CURRENT_FORUM_KEY);
      const curId = (typeof cur === 'string' && cur) ? cur : '';
      const ok = curId && forums.some(f => f && f.id === curId);
      if (!ok) Storage.set(this._CURRENT_FORUM_KEY, forums[0].id || this._DEFAULT_FORUM_ID);
    } catch (e) {
      try { Storage.set(this._CURRENT_FORUM_KEY, forums[0].id || this._DEFAULT_FORUM_ID); } catch (e2) {}
    }
  },

  _getForums() {
    try {
      const raw = Storage.get(this._FORUMS_KEY);
      if (Array.isArray(raw)) return raw.filter(Boolean);
    } catch (e) {}
    return [];
  },

  async _getForumCharacterOptions() {
    try {
      const rows = await Storage.dbGetAll('characters');
      const arr = Array.isArray(rows) ? rows : [];
      return arr
        .map((c) => {
          const base = c && typeof c === 'object' ? c : {};
          const data = base.data && typeof base.data === 'object' ? base.data : {};
          const id = base.id ?? data.id ?? '';
          const name = String(data.name ?? base.name ?? '').trim();
          if (!id || !name) return null;
          return { id: String(id), name };
        })
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  },

  _getCurrentForumId() {
    try {
      const v = Storage.get(this._CURRENT_FORUM_KEY);
      if (typeof v === 'string' && v) return v;
    } catch (e) {}
    return this._DEFAULT_FORUM_ID;
  },

  _getCurrentForum() {
    const id = this._getCurrentForumId();
    const forums = this._getForums();
    return forums.find(f => f && f.id === id) || forums[0] || { id: this._DEFAULT_FORUM_ID, name: '默认', worldbook: '' };
  },

  async _getUserForumAccountsAll() {
    // 全局“用户论坛账号列表”（所有论坛共享同一份）
    try {
      const v = await Storage.kvGet(this._USER_FORUM_ACCOUNTS_KV_KEY);
      if (Array.isArray(v) && v.length) return v;
    } catch (e) {}

    // 迁移：兼容旧版“每个论坛各自保存 userForumAccounts”
    try {
      const forums = this._getForums();
      const map = new Map();
      for (const f of forums) {
        if (!f) continue;
        const arr = Array.isArray(f.userForumAccounts) ? f.userForumAccounts : [];
        for (const x of arr) {
          const idRaw = String(x?.id || '').trim();
          const id = idRaw || ('u' + (State && typeof State.generateId === 'function' ? State.generateId() : Date.now().toString(36)));
          const nickname = String(x?.nickname || '').trim();
          if (!nickname) continue;
          // 去重优先用 id；如果旧数据没 id 则用 nickname+avatar 做第二次去重
          const key = idRaw ? id : `anon:${nickname}:${String(x?.avatar || '').trim()}`;
          if (!map.has(key)) {
            map.set(key, {
              id,
              nickname,
              avatar: String(x?.avatar || '').trim(),
              bio: String(x?.bio || '').trim(),
              createdAt: Number(x?.createdAt || 0) || Date.now()
            });
          }
        }
      }
      const merged = Array.from(map.values());
      if (merged.length) {
        try { await Storage.kvSet(this._USER_FORUM_ACCOUNTS_KV_KEY, merged); } catch (e2) {}
      }
      return merged;
    } catch (e2) {
      return [];
    }
  },

  async _setUserForumAccountsAll(accounts) {
    const next = Array.isArray(accounts) ? accounts : [];
    try {
      await Storage.kvSet(this._USER_FORUM_ACCOUNTS_KV_KEY, next);
    } catch (e) {
      console.error('[forum] persist userForumAccounts failed:', e);
      alert('保存用户论坛账号失败，请稍后重试');
    }
  },

  async _getCurrentForumUserAccount() {
    const forum = this._getCurrentForum();
    const activeId = String(forum?.activeUserForumAccountId || '').trim();
    if (!activeId) return null;
    const list = await this._getUserForumAccountsAll();
    const hit = list.find((x) => String(x?.id || '').trim() === activeId);
    if (!hit) return null;
    const nickname = String(hit.nickname || '').trim();
    if (!nickname) return null;
    return {
      id: String(hit.id || '').trim(),
      nickname,
      avatar: String(hit.avatar || '').trim(),
      bio: String(hit.bio || '').trim()
    };
  },

  async _getForumSelfDisplayName() {
    const forumAccount = await this._getCurrentForumUserAccount();
    if (forumAccount && forumAccount.nickname) return forumAccount.nickname;

    let meName = '我';
    try {
      const defaultId = String(Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '').trim();
      if (defaultId) {
        const mask = await Storage.dbGet('masks', defaultId);
        const n = String(mask?.name || '').trim();
        if (n) meName = n;
      }
    } catch (e) {}
    return meName;
  },

  async _getDefaultMaskName() {
    try {
      const defaultId = String(Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '').trim();
      if (!defaultId) return '';
      const mask = await Storage.dbGet('masks', defaultId);
      return String(mask?.name || '').trim();
    } catch (e) {
      return '';
    }
  },

  async _getDefaultMaskProfile() {
    try {
      const defaultId = String(Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '').trim();
      if (!defaultId) return { name: '', detail: '' };
      const mask = await Storage.dbGet('masks', defaultId);
      return {
        name: String(mask?.name || '').trim(),
        detail: String(mask?.detail || '').trim()
      };
    } catch (e) {
      return { name: '', detail: '' };
    }
  },

  async _getForumSelfDisplayProfile() {
    const forumAccount = await this._getCurrentForumUserAccount();
    if (forumAccount && forumAccount.nickname) {
      return {
        name: String(forumAccount.nickname || '我').trim() || '我',
        avatar: String(forumAccount.avatar || '').trim()
      };
    }
    const meName = await this._getForumSelfDisplayName();
    return {
      name: meName || '我',
      avatar: ''
    };
  },

  async _resolveThreadAuthorDisplay(thread) {
    if (thread?.isMine || thread?.authorType === 'user') {
      return await this._getForumSelfDisplayProfile();
    }
    return {
      name: String(thread?.username || '匿名').trim() || '匿名',
      avatar: String(thread?.avatar || '').trim()
    };
  },

  async _resolveCommentAuthorDisplay(comment) {
    if (comment?.isMine || comment?.authorType === 'user') {
      return await this._getForumSelfDisplayProfile();
    }
    return {
      name: String(comment?.username || '匿名').trim() || '匿名',
      avatar: String(comment?.avatar || '').trim()
    };
  },

  _buildForumAvatarHtml(name, avatar) {
    const src = String(avatar || '').trim();
    if (/^data:image\//i.test(src)) {
      return `<img src="${this._esc(src)}" alt="${this._esc(name || '头像')}">`;
    }
    if (src) return this._esc(src.slice(0, 2));
    return this._esc(this._firstChar(name || '匿'));
  },

  _formatForumCommentBody(comment) {
    const body = String(comment?.content || '').trim();
    const replyTarget = comment?.replyTarget || null;
    if (replyTarget?.type === 'comment') {
      const floor = Number(replyTarget?.targetFloor || 0) || 0;
      const targetName = String(replyTarget?.targetName || '匿名').trim() || '匿名';
      const prefix = `回复${floor || '?'}楼 ${targetName}：`;
      return `${prefix}${body || '（空）'}`;
    }
    return body || '（空）';
  },

  _closeForumCommentActionMenu() {
    const existing = document.getElementById('yd-forum-comment-actions');
    if (existing) existing.remove();
    if (this._forumCommentActionDismissHandler) {
      document.removeEventListener('pointerdown', this._forumCommentActionDismissHandler, true);
      this._forumCommentActionDismissHandler = null;
    }
    if (this._forumCommentActionEscHandler) {
      document.removeEventListener('keydown', this._forumCommentActionEscHandler, true);
      this._forumCommentActionEscHandler = null;
    }
  },

  _openForumCommentActionMenu(anchorPoint, comment) {
    this._closeForumCommentActionMenu();
    const x = Math.max(12, Number(anchorPoint?.x || 0));
    const y = Math.max(12, Number(anchorPoint?.y || 0));
    const menu = document.createElement('div');
    menu.id = 'yd-forum-comment-actions';
    menu.className = 'yd-forum-comment-actions';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" class="yd-forum-comment-actions__item" data-act="reply" role="menuitem">回复评论</button>
    `;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - rect.width - 12);
    const maxTop = Math.max(12, window.innerHeight - rect.height - 12);
    menu.style.left = `${Math.min(x, maxLeft)}px`;
    menu.style.top = `${Math.min(y, maxTop)}px`;

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = String(btn.getAttribute('data-act') || '').trim();
      this._closeForumCommentActionMenu();
      if (act === 'reply') {
        this._commentMode = 'comment';
        this._pendingReplyTarget = {
          type: 'comment',
          threadId: String(this._currentThreadId || '').trim(),
          targetFloor: Number(comment?.floor || 0) || 0,
          targetName: String(comment?.username || '').trim() || '匿名',
          targetContent: String(comment?.content || '').trim()
        };
        this._syncCommentPlaceholder();
        try {
          const inputEl = document.getElementById('forum-thread-input');
          inputEl?.focus();
        } catch (e) {}
        return;
      }
    });

    this._forumCommentActionDismissHandler = (evt) => {
      if (menu.contains(evt.target)) return;
      this._closeForumCommentActionMenu();
    };
    this._forumCommentActionEscHandler = (evt) => {
      if (evt.key === 'Escape') this._closeForumCommentActionMenu();
    };
    document.addEventListener('pointerdown', this._forumCommentActionDismissHandler, true);
    document.addEventListener('keydown', this._forumCommentActionEscHandler, true);
  },

  _syncHeaderForumButton() {
    const btn = document.getElementById('forum-switch');
    if (btn) {
      // 保证按钮里始终有切换 SVG（避免旧逻辑覆盖成文字或清空）
      if (!btn.querySelector('svg')) {
        btn.innerHTML = `
          <svg class="yd-forum-switch-icon" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
            <path d="M96 416h832c0.32 0 0.576-0.192 0.896-0.192a30.656 30.656 0 0 0 30.976-30.976c-0.064-0.256 0.128-0.512 0.128-0.832a31.424 31.424 0 0 0-14.912-26.368l-188.48-188.48a30.72 30.72 0 1 0-43.456 43.456L852.544 352H96a32 32 0 0 0 0 64z m832 192H96c-0.32 0-0.576 0.192-0.896 0.192a30.528 30.528 0 0 0-30.976 30.976c0.064 0.256-0.128 0.512-0.128 0.832 0 11.264 6.144 20.672 14.912 26.368l188.48 188.48a30.72 30.72 0 1 0 43.456-43.456L171.456 672H928a32 32 0 0 0 0-64z"></path>
          </svg>
        `;
      }
      btn.title = '切换论坛';
    }

    const f = this._getCurrentForum();
    const textEl = document.getElementById('forum-title-text');
    if (textEl) textEl.textContent = (f && f.name) ? String(f.name).trim() : '默认';
    const iconEl = document.getElementById('forum-title-icon');
    if (iconEl) iconEl.textContent = (f && f.icon) ? String(f.icon).trim() : '💬';
  },

  _syncRefreshButtonState() {
    const btn = document.getElementById('forum-refresh');
    if (!btn) return;
    const curId = this._getCurrentForumId();
    const loading = !!(curId && this._refreshingForumIds && this._refreshingForumIds.has(curId));
    btn.disabled = loading;
    btn.classList.toggle('is-loading', loading);
  },

  _buildForumFeatureSpec({ systemMessages = [], userMessage = '', parse = null, extraPayload = null } = {}) {
    if (
      typeof TaPages === 'undefined' ||
      !TaPages ||
      typeof TaPages._buildAiFeatureSpec !== 'function'
    ) {
      throw new Error('通用 AI 骨架不可用');
    }
    return TaPages._buildAiFeatureSpec({
      systemMessages,
      userMessage,
      parse,
      extraPayload
    });
  },

  async _runForumFeatureTask(spec = {}) {
    if (
      typeof TaPages === 'undefined' ||
      !TaPages ||
      typeof TaPages._runAiFeatureTask !== 'function'
    ) {
      throw new Error('通用 AI 执行器不可用');
    }
    return TaPages._runAiFeatureTask(spec);
  },

  _buildForumThreadsTask(options = {}) {
    const forumName = String(options?.forumName || '默认').trim() || '默认';
    const worldbook = String(options?.worldbook || '').trim();
    const count = Math.max(1, Number(options?.count || 8));
    const mode = typeof options?.mode === 'string' ? options.mode : 'refresh';
    const hotTopic = typeof options?.hotTopic === 'string' ? options.hotTopic.trim() : '';
    const selectedCharacterIds = Array.isArray(options?.selectedCharacterIds)
      ? options.selectedCharacterIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const selectedCharacterNames = Array.isArray(options?.selectedCharacterNames)
      ? options.selectedCharacterNames.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const selectedCharacterContext = String(options?.selectedCharacterContext || '').trim();
    const characterForumAccountMap = options?.characterForumAccountMap && typeof options.characterForumAccountMap === 'object'
      ? options.characterForumAccountMap
      : {};
    const knownAccountLines = selectedCharacterIds
      .map((characterId, idx) => {
        const charName = String(selectedCharacterNames[idx] || '').trim();
        const accountName = String(characterForumAccountMap[characterId] || '').trim();
        if (!charName || !accountName) return '';
        return `- ${charName} 在当前论坛的账号名：${accountName}`;
      })
      .filter(Boolean);
    const missingAccountNames = selectedCharacterIds
      .map((characterId, idx) => {
        const charName = String(selectedCharacterNames[idx] || '').trim();
        const accountName = String(characterForumAccountMap[characterId] || '').trim();
        if (!charName || accountName) return '';
        return charName;
      })
      .filter(Boolean);

    let scene = '普通刷帖：围绕论坛设定和用户给出的讨论点生成日常帖子。';
    if (mode === 'hot') {
      scene = '大家都在聊：围绕当前热议话题/实时热点生成讨论帖。';
    } else if (mode === 'breaking') {
      scene = '突发大新闻：围绕用户提供的突发事件信息，生成新闻讨论帖（注意不要捏造真实人物隐私）。';
    } else if (mode === 'rumor') {
      scene = '小道消息爆料：围绕用户提供的小道消息/爆料，生成偏八卦/讨论向的帖子，但避免明显违法/恶意内容。';
    }

    const systemRoleAndGoal = [
      '你是一个论坛内容生成器。',
      `当前场景：${scene}`,
      '目标：生成看起来真实、可读、可讨论的论坛帖子列表。'
    ].join('\n');

    const systemForumContext = [
      `论坛名称：${forumName}`,
      worldbook ? `论坛世界书：${worldbook}` : '论坛世界书：无',
      selectedCharacterNames.length
        ? `论坛绑定角色：${selectedCharacterNames.join('、')}`
        : '论坛绑定角色：无',
      knownAccountLines.length
        ? `论坛内已知角色账号名：\n${knownAccountLines.join('\n')}`
        : '论坛内已知角色账号名：暂无'
    ].join('\n');

    const systemSupplementContext = [
      '角色参考说明：以下角色参考仅用于“少数帖子”的角色相关度判断，以及决定哪些帖子需要展示 socialText（谁在看/谁点赞）。',
      '重要：论坛帖子生成必须优先遵守「论坛世界书」的设定与规则；不要把角色参考当作论坛世界规则本身。',
      '隐藏线索用法（重要）：你可以把角色设定/世界背景/价值观/生活方式当作“潜在线索”来影响帖子内容走向（例如：某类话题更常出现、某些争议点更尖锐、某些建议更偏保守/理性/克制、某些商品/地点/职业细节更贴合），但不要强行点名角色、不要把帖子写成角色传记或角色自述。',
      '换句话说：角色参考可以“间接影响”论坛氛围与少量帖子细节，但大多数帖子仍应像该论坛世界里自由发生的日常讨论。',
      selectedCharacterContext || '角色参考：无'
    ].join('\n');

    const systemOutputContractAndExample = [
      '你只输出纯文本，不要输出 JSON、Markdown、代码块或任何解释性文字。',
      '每条帖子必须用一对 <post>...</post> 标签包裹。',
      '每条帖子在标签内部使用竖线 | 分割字段。',
      '输出格式（每条帖子 5 段，最后一段可为空）：',
      '<post>标题|发帖人昵称|帖子分组|帖子内容|socialText</post>',
      '字段要求：',
      '- 标题：像真实论坛标题，简洁可读。',
      '- 发帖人昵称：只能是昵称，不要带动作或状态描述。',
      '- 帖子分组：短词，例如：闲聊/求助/吐槽/经验/分享。',
      '- 帖子内容：完整正文，不要占位符。',
      '- socialText：帖子下方附加提示文案（可为空）。',
      '- socialText 只允许以下两种句式之一（除此之外禁止输出任何其它文案）：',
      '  1) 「角色名、角色名正在看」或「角色名正在看」',
      '  2) 「角色名、角色名点赞了」或「角色名点赞了」',
      '- socialText 中出现的角色名必须严格来自 system 的「论坛绑定角色」里的“角色本名”；禁止使用角色在本论坛下的账号名/昵称；禁止使用论坛名/分组名等替代角色名；禁止编造新名字。',
      '- socialText 最多出现 2 个角色名（用顿号“、”连接）。',
      '- 大多数帖子 socialText 为空（例如 ≥60%）。',
      '- 角色在本论坛下的账号名/昵称（若提供）仅用于“角色本人发帖”时作为发帖人昵称（username）候选；socialText 里禁止使用账号名。',
      '- 角色本人发帖概率必须很低（建议 ≤10%），绝大多数帖子由随机路人发帖。不要让帖子列表被角色刷屏。',
      '输出示例（共两条）：',
      '<post>受够了现在的网剧能不能别硬塞糖精|拒绝脑残剧|吐槽|刚刚看完最新更新那部…|霍沉正在看</post>',
      '<post>求推荐一部不狗血的青春剧|阿柠|求助|最近剧荒，想找…|</post>'
    ].join('\n');

    const userMessage = [
      hotTopic ? `用户提供的讨论点：${hotTopic}` : '',
      `请生成 ${count} 条帖子。`,
      '生成优先级要求：',
      '1) 论坛世界书（背景/规则/氛围/禁忌）必须优先遵守，是帖子生成的主约束。',
      '2) 角色参考仅用于少数帖子：让少量帖子更可能与绑定角色相关，并决定这些帖子是否需要 socialText。',
      '内容分布建议：多数帖子应来自论坛世界自由发生的日常/争议/求助/分享/八卦/吐槽等讨论，而不是围绕角色设定展开。',
      selectedCharacterNames.length
        ? 'socialText 分布：只有少数帖子（建议 20%～40%）带 socialText；其余帖子 socialText 为空字符串。带 socialText 时只允许使用角色本名（来自绑定角色列表），禁止使用论坛昵称/账号名/论坛名。'
        : 'socialText：全部留空字符串。'
    ].filter(Boolean).join('\n');

    return {
      spec: this._buildForumFeatureSpec({
        systemMessages: [
          systemRoleAndGoal,
          systemForumContext,
          systemSupplementContext,
          systemOutputContractAndExample
        ],
        userMessage,
        // 帖子生成采用 <post>...</post> 的纯文本协议，这里不要做 JSON 解析
        parse: (raw) => String(raw || '')
      })
    };
  },

  _buildForumCharacterAccountsTask(options = {}) {
    const forumName = String(options?.forumName || '默认').trim() || '默认';
    const worldbook = String(options?.worldbook || '').trim();
    const selectedCharacterNames = Array.isArray(options?.selectedCharacterNames)
      ? options.selectedCharacterNames.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const selectedCharacterContext = String(options?.selectedCharacterContext || '').trim();
    const missingAccountNames = Array.isArray(options?.missingAccountNames)
      ? options.missingAccountNames.map((x) => String(x || '').trim()).filter(Boolean)
      : [];

    const systemRoleAndGoal = [
      '你是一个论坛账号昵称生成器。',
      '目标：为指定角色生成其在当前论坛下会使用的账号昵称（像真实论坛昵称）。'
    ].join('\n');

    const systemForumContext = [
      `论坛名称：${forumName}`,
      worldbook ? `论坛世界书：${worldbook}` : '论坛世界书：无'
    ].join('\n');

    const systemSupplementContext = selectedCharacterContext || '角色参考：无';

    const systemOutputContractAndExample = [
      '你只输出 JSON 数组，不要输出任何其它文字。',
      '数组元素字段：characterName, forumAccountName。',
      '- characterName 必须严格从 user 指定的角色名里取值，不要编造新角色名。',
      '- forumAccountName 必须像真实论坛昵称（可中英文混合，可带点符号），不要写解释。',
      '输出示例：',
      '[',
      '  {"characterName":"霍沉","forumAccountName":"H.C."}',
      ']'
    ].join('\n');

    const userMessage = [
      missingAccountNames.length
        ? `请为以下角色生成其在本论坛下的账号昵称：${missingAccountNames.join('、')}。`
        : '请生成账号昵称。'
    ].join('\n');

    return {
      spec: this._buildForumFeatureSpec({
        systemMessages: [
          systemRoleAndGoal,
          systemForumContext,
          systemSupplementContext,
          systemOutputContractAndExample
        ],
        userMessage,
        parse: (raw) => this._safeParseJsonArray(raw)
      })
    };
  },

  _buildForumCommentsTask(options = {}) {
    const thread = options?.thread || {};
    const count = Math.max(1, Number(options?.count || 8));
    const offset = Math.max(0, Number(options?.offset || 0));
    const mode = typeof options?.mode === 'string' ? options.mode : 'comment';
    const existingArr = Array.isArray(options?.existingComments) ? options.existingComments : [];
    const forumName = String(options?.forumName || '').trim();
    const worldbook = String(options?.worldbook || '').trim();
    const selectedCharacterNames = Array.isArray(options?.selectedCharacterNames)
      ? options.selectedCharacterNames.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const selectedCharacterContext = String(options?.selectedCharacterContext || '').trim();
    const replyTarget = options?.replyTarget || null;
    const currentUserForumName = String(options?.currentUserForumName || '').trim();
    const currentUserMaskName = String(options?.currentUserMaskName || '').trim();
    const currentUserMaskDetail = String(options?.currentUserMaskDetail || '').trim();
    const latestUserCommentText = String(options?.latestUserCommentText || '').trim();
    const currentForumCharacterAccountsByName = options?.currentForumCharacterAccountsByName && typeof options.currentForumCharacterAccountsByName === 'object'
      ? options.currentForumCharacterAccountsByName
      : {};

    const title = String(thread?.title || '').trim();
    const content = String(thread?.content || '').trim();
    const topic = String(thread?.topic || '').trim();
    const author = String(thread?.username || '').trim();

    const recentExisting = existingArr.slice(Math.max(0, existingArr.length - 40));
    const recentStartFloor = Math.max(1, existingArr.length - recentExisting.length + 1);
    const recentCommentsText = recentExisting.length
      ? recentExisting.map((c, idx) => {
          const floor = recentStartFloor + idx;
          const name = String(c?.username || '匿名').trim() || '匿名';
          const body = this._formatForumCommentBody(c);
          return `${floor}楼 ${name}：${body || '（空）'}`;
        }).join('\n')
      : '';

    let scene = '普通评论：像真实用户一样围绕帖子内容进行正常讨论。';
    if (mode === 'hot') {
      scene = '大家都在聊：围绕当前热议/实时热点，像真实用户一样讨论、追问、补充信息。';
    } else if (mode === 'breaking') {
      scene = '突发大新闻：围绕突发事件，像真实用户一样讨论新闻细节和影响，但避免捏造具体个人隐私。';
    } else if (mode === 'rumor') {
      scene = '小道消息爆料：围绕爆料内容，像真实用户一样八卦/质疑/讨论，但不要出现恶意人身攻击或违法内容。';
    }

    const systemRoleAndGoal = [
      '你是一个论坛评论生成器。',
      `场景说明：${scene}`,
      '目标：生成自然、连贯、像真实用户说话的评论楼层。'
    ].join('\n');

    const forumBoundCharacterBlock = selectedCharacterNames.length
      ? [
        '论坛绑定角色：',
        ...selectedCharacterNames.map((name, idx) => {
          const characterName = String(name || '').trim();
          const accountByName = String(currentForumCharacterAccountsByName[characterName] || '').trim();
          return `${idx + 1}. ${characterName}，该角色在本论坛使用的昵称：${accountByName || '（未设置）'}`;
        })
      ].join('\n')
      : '';

    const systemForumBaseContext = [
      forumName ? `论坛名称：${forumName}` : '',
      '',
      (currentUserMaskName || currentUserMaskDetail || currentUserForumName)
        ? [
          currentUserMaskName ? `当前用户：${currentUserMaskName}` : '',
          currentUserMaskDetail ? `用户设定：${currentUserMaskDetail}` : '',
          currentUserForumName ? `当前用户在本论坛使用的昵称：${currentUserForumName}` : ''
        ].filter(Boolean).join('。') + '。'
        : '',
      '',
      forumBoundCharacterBlock,
      '',
      worldbook ? `论坛世界书：${worldbook}` : ''
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();

    const systemSupplementContext = [
      // 角色补充参考：保留 ta.js 标准上下文里的角色资料，forum.js 只补论坛任务特有的信息块
      selectedCharacterContext
        ? [
          '角色参考说明：以下角色参考仅用于影响“少量评论”的关注点与语气（例如某些评论更可能提到某类价值观/偏好），但绝大多数评论仍应像普通路人发言。',
          '重要：评论必须优先遵守论坛世界书的设定与氛围；不要让角色刷屏；不要强行点名角色。',
          '隐藏线索用法：可以把角色设定/世界背景当作潜在线索，间接影响少量评论的倾向与细节（例如更偏控制欲/边界感/精英思维/校园视角等），但不要直接输出“这是某角色的观点/某角色说…”。',
          selectedCharacterContext
        ].join('\n')
        : ''
    ].filter(Boolean).join('\n');

    const systemOutputContractAndExample = [
      '你只输出纯文本，不要输出 JSON、Markdown、代码块或任何解释性文字。',
      '每条评论必须用一对 <comment>...</comment> 标签包裹。',
      '每条评论在标签内部使用竖线 | 分割字段。',
      '输出格式（每条评论 2 段）：',
      '<comment>评论人昵称|评论内容</comment>',
      '字段要求：',
      '- 评论人昵称：只能是昵称，不要带“正在看/路过/在线”等状态描述。',
      '- 评论内容：像真实论坛用户回复，简短自然，不要占位符。',
      '- 如果评论是在回复某一层，评论内容必须写成“回复x楼 昵称：具体内容”的形式。',
      '- “回复x楼 昵称”中的楼层和昵称，必须严格来自“已有评论”中真实存在的楼层；禁止编造不存在的评论或楼层。',
      '- 例如：回复3楼 不吃香菜：那个实习生是谁',
      '输出示例（共两条）：',
      '<comment>路人甲|这剧情确实离谱，编剧是不是没上过班…</comment>',
      '<comment>jojo|回复3楼 不吃香菜：那个实习生是谁</comment>'
    ].join('\n');

    const systemCurrentThreadContext = [
      (title || content || topic || author)
        ? [
          '用户当前所在帖子：',
          `帖子作者：${author || '匿名'}`,
          topic ? `话题：${topic}` : '',
          title ? `标题：${title}` : '标题：',
          content ? `正文：${content}` : '正文：'
        ].join('\n')
        : '',
      recentCommentsText
        ? `当前帖子已有评论（按楼层从旧到新，最多展示最近40楼）：\n${recentCommentsText}`
        : '当前帖子已有评论：暂无',
      replyTarget?.type === 'comment'
        ? [
          '回复语境补充：用户刚刚触发了“回复评论”。',
          `用户刚刚手动发表/准备发表的那条评论，是在回复 ${Number(replyTarget?.targetFloor || 0) || '?'}楼 ${String(replyTarget?.targetName || '匿名').trim() || '匿名'}。`,
          '严格要求：只能回复“已有评论”里真实存在的楼层与评论人，禁止自己编造不存在的评论、楼层、评论人、回复关系。',
          '如果要写“回复x楼 昵称：……”格式，其中 x 楼和昵称必须能在“已有评论”列表里一一对应找到。',
          '评论串需要体现楼中楼的延续关系：后续有人可以继续接这个回复往下聊，也可以回到原帖讨论，但整体语气仍要像真实论坛楼层对话。',
          '如果评论是在回复某一楼，请优先使用这种表现形式：',
          '“回复x楼 昵称：评论内容”',
          '不要把每条评论都写成回复格式；只有确实在接某一层时才这样写。'
        ].join('\n')
        : ''
    ].filter(Boolean).join('\n');

    const userMessage = [
      `请生成 ${count} 条新的评论（这是第 ${offset + 1} 楼之后的追加评论），不要重复之前内容。`,
      (currentUserMaskName || currentUserMaskDetail || currentUserForumName)
        ? [
          currentUserMaskName ? `当前用户：${currentUserMaskName}` : '',
          currentUserMaskDetail ? `用户设定：${currentUserMaskDetail}` : '',
          currentUserForumName ? `当前用户在这个论坛里的昵称是「${currentUserForumName}」` : ''
        ].filter(Boolean).join('。') + '。'
        : '',
      latestUserCommentText ? `用户刚刚手动发布的评论内容是：${latestUserCommentText}` : '',
      replyTarget?.type === 'comment'
        ? `用户刚刚这条评论是在回复“${Number(replyTarget?.targetFloor || 0) || '?'}楼 ${String(replyTarget?.targetName || '匿名').trim() || '匿名'}：${String(replyTarget?.targetContent || '').trim() || '（无内容）'}”。`
        : '',
      '生成规则（非常重要）：',
      '1) 禁止生成内容使用“当前用户在本论坛里的昵称”作为评论人昵称。',
      '2) 禁止替用户发言，禁止替用户继续发布评论；用户刚刚说的话只作为上下文参考，不属于你要生成的新评论。',
      '3) 如果生成的评论内容涉及“回复某一楼”，只能回复“已有评论”列表里已经真实存在的评论。',
      `4) 本次你要生成的是 ${offset + 1} 到 ${offset + count} 楼；禁止让这些新生成的评论互相回复。也就是说，禁止出现回复 ${offset + 1}-${offset + count} 楼任意楼层的内容。`,
      '5) 尤其禁止回复本次刚生成出来的新评论；只能回复已有评论列表中的旧楼层。',
      selectedCharacterNames.length
        ? '6) 如果这个论坛设置了“与角色一起逛论坛”，允许少量角色发言，但前提是必须符合角色设定、论坛世界书和当前讨论语境；不要让角色刷屏，仍以普通路人为主。'
        : '6) 以普通路人评论为主，保持真实论坛讨论感。',
      replyTarget?.type === 'comment'
        ? '7) 这次讨论要自然承接用户刚刚那条“回复评论”的语境，但不要机械地每条都写成回复格式。'
        : ''
    ].filter(Boolean).join('\n');

    return {
      spec: this._buildForumFeatureSpec({
        systemMessages: [
          systemRoleAndGoal,
          systemForumBaseContext,
          systemSupplementContext,
          systemOutputContractAndExample,
          systemCurrentThreadContext
        ],
        userMessage,
        // 评论生成采用 <comment>...</comment> 的纯文本协议，这里不要做 JSON 解析
        parse: (raw) => String(raw || '')
      })
    };
  },

  _syncCommentPlaceholder() {
    const inputEl = document.getElementById('forum-thread-input');
    if (!inputEl) return;
    let ph = '写下你的评论…';
    if (this._pendingReplyTarget?.type === 'comment') {
      const floor = Number(this._pendingReplyTarget?.targetFloor || 0) || 0;
      ph = `回复${floor || '?'}楼…`;
    } else if (this._commentMode === 'hot') {
      ph = '补充当前热议话题 / 实时热点…';
    } else if (this._commentMode === 'breaking') {
      ph = '补充突发大新闻的关键信息…';
    } else if (this._commentMode === 'rumor') {
      ph = '补充你要爆料的小道消息细节…';
    }
    inputEl.placeholder = ph;
  },

  openCommentModePicker() {
    const existing = document.getElementById('yd-forum-comment-mode');
    if (existing) existing.remove();

    const cur = this._commentMode || 'comment';
    const modal = document.createElement('div');
    modal.id = 'yd-forum-comment-mode';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">选择评论方式</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-forum-picker__list" style="gap:12px;">
          <div class="yd-forum-item" data-mode="comment" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">发送评论</div>
              <div class="yd-forum-item__desc">自己写这条回复评论，发布后等待大家回复</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn ${cur === 'comment' ? 'yd-forum-item__btn--current' : 'yd-forum-item__btn--primary'}" data-act="switch" ${cur === 'comment' ? 'disabled' : ''}>
                ${cur === 'comment' ? '当前' : '切换'}
              </button>
            </div>
          </div>
          <div class="yd-forum-item" data-mode="hot" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">大家都在聊</div>
              <div class="yd-forum-item__desc">补充当前热议话题/实时热点，自动生成围绕讨论点的评论</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn ${cur === 'hot' ? 'yd-forum-item__btn--current' : 'yd-forum-item__btn--primary'}" data-act="switch" ${cur === 'hot' ? 'disabled' : ''}>
                ${cur === 'hot' ? '当前' : '切换'}
              </button>
            </div>
          </div>
          <div class="yd-forum-item" data-mode="breaking" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">突发大新闻</div>
              <div class="yd-forum-item__desc">补充突发事件的关键信息，让评论围绕重大新闻展开讨论</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn ${cur === 'breaking' ? 'yd-forum-item__btn--current' : 'yd-forum-item__btn--primary'}" data-act="switch" ${cur === 'breaking' ? 'disabled' : ''}>
                ${cur === 'breaking' ? '当前' : '切换'}
              </button>
            </div>
          </div>
          <div class="yd-forum-item" data-mode="rumor" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">小道消息爆料</div>
              <div class="yd-forum-item__desc">补充你听到的小道消息/八卦，让评论以讨论爆料为主</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn ${cur === 'rumor' ? 'yd-forum-item__btn--current' : 'yd-forum-item__btn--primary'}" data-act="switch" ${cur === 'rumor' ? 'disabled' : ''}>
                ${cur === 'rumor' ? '当前' : '切换'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    modal.querySelectorAll('.yd-forum-item').forEach((row) => {
      const btn = row.querySelector('[data-act="switch"]');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const mode = row.getAttribute('data-mode') || 'comment';
        this._commentMode = mode;
        if (mode !== 'comment') this._pendingReplyTarget = null;
        this._syncCommentPlaceholder();
        close();
      });
    });
  },

  openPublishPicker() {
    const existing = document.getElementById('yd-forum-publish-picker');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-forum-publish-picker';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">选择发布方式</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-forum-picker__list" style="gap:12px;">
          <div class="yd-forum-item" id="yd-publish-mine" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">发布我的帖子</div>
              <div class="yd-forum-item__desc">自己写标题和内容，发布后等待大家回复</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary">选择</button>
            </div>
          </div>
          <div class="yd-forum-item" id="yd-publish-hot" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">大家都在聊</div>
              <div class="yd-forum-item__desc">补充当前热议话题/实时热点，自动生成围绕讨论点的帖子</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary">选择</button>
            </div>
          </div>
          <div class="yd-forum-item" id="yd-publish-breaking" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">突发大新闻</div>
              <div class="yd-forum-item__desc">补充突发事件的关键信息，让大家围绕重大新闻展开讨论</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary">选择</button>
            </div>
          </div>
          <div class="yd-forum-item" id="yd-publish-rumor" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">小道消息爆料</div>
              <div class="yd-forum-item__desc">补充你听到的小道消息/八卦，让帖子以讨论爆料为主</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary">选择</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    modal.querySelector('#yd-publish-mine')?.addEventListener('click', () => {
      close();
      this.openComposer();
    });
    modal.querySelector('#yd-publish-hot')?.addEventListener('click', () => {
      close();
      this.openHotComposer('hot');
    });
    modal.querySelector('#yd-publish-breaking')?.addEventListener('click', () => {
      close();
      this.openHotComposer('breaking');
    });
    modal.querySelector('#yd-publish-rumor')?.addEventListener('click', () => {
      close();
      this.openHotComposer('rumor');
    });
  },

  openHotComposer(mode = 'hot') {
    const existing = document.getElementById('yd-forum-hot-compose');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-forum-hot-compose';
    modal.className = 'yd-forum-compose';
    let title = '大家都在聊';
    let placeholder = '补充说明：当前热议的话题 / 实时热点 / 讨论点（越具体越好）';
    if (mode === 'breaking') {
      title = '突发大新闻';
      placeholder = '补充说明：发生了什么突发事件？时间、地点、人物、影响是什么？';
    } else if (mode === 'rumor') {
      title = '小道消息爆料';
      placeholder = '补充说明：你听到的小道消息/爆料内容，有哪些细节？';
    }
    modal.innerHTML = `
      <div class="yd-forum-compose__mask" data-close="1"></div>
      <div class="yd-forum-compose__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-compose__bar">
          <div class="yd-forum-compose__title">${title}</div>
          <button type="button" class="yd-forum-compose__btn" id="yd-forum-hot-generate" disabled>生成并刷新</button>
        </div>
        <textarea class="yd-forum-compose__textarea" id="yd-forum-hot" placeholder="${placeholder}"></textarea>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const hotEl = modal.querySelector('#yd-forum-hot');
    const genBtn = modal.querySelector('#yd-forum-hot-generate');
    const refresh = () => {
      const ok = String(hotEl?.value || '').trim().length > 0;
      if (genBtn) genBtn.disabled = !ok;
    };
    hotEl?.addEventListener('input', refresh);
    hotEl?.addEventListener('change', refresh);
    refresh();

    genBtn?.addEventListener('click', async () => {
      const hot = String(hotEl?.value || '').trim();
      if (!hot) return;
      genBtn.disabled = true;
      genBtn.textContent = '生成中...';
      try {
        await this.refreshThreads(8, { hotTopic: hot, mode: mode || 'hot' });
        close();
      } finally {
        try {
          genBtn.disabled = false;
          genBtn.textContent = '生成并刷新';
        } catch (e) {}
      }
    });
  },

  async refreshThreads(count = 8, opts = null) {
    this._ensureForums();
    const refreshBtn = document.getElementById('forum-refresh');
    const currentForumIdAtClick = this._getCurrentForumId();
    if (refreshBtn && refreshBtn.disabled && this._refreshingForumIds.has(currentForumIdAtClick)) return;

    const targetForumId = currentForumIdAtClick;

    const forum = this._getForums().find(f => f && f.id === targetForumId) || this._getCurrentForum();
    const forumName = String(forum?.name || '默认').trim() || '默认';
    const worldbook = String(forum?.worldbook || '').trim();
    const icon = String(forum?.icon || '💬').trim() || '💬';
    try {
      const allMsgs = await Storage.dbGetAll('messages');
      this._forumRecentMessagesCache = Array.isArray(allMsgs)
        ? allMsgs
          .filter((m) => m && String(m.role || '') === 'assistant')
          .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0))
        : [];
    } catch (e) {
      this._forumRecentMessagesCache = [];
    }
    const selectedCharacterProfiles = await this._getForumSelectedCharacterProfiles(forum);
    const selectedCharacterIds = selectedCharacterProfiles.map((x) => String(x?.id || '').trim()).filter(Boolean);
    const selectedCharacterNames = selectedCharacterProfiles.map((x) => String(x?.name || '').trim()).filter(Boolean);
    const forumKeyId = targetForumId || forum?.id || this._DEFAULT_FORUM_ID;
    const selectedCharacterContext = await this._buildForumCharacterContextText(selectedCharacterProfiles, forumKeyId);
    let characterForumAccountMap = await this._getForumCharacterAccountMap(forumKeyId);
    const hotTopic = opts && typeof opts.hotTopic === 'string' ? opts.hotTopic.trim() : '';

    try {
      if (targetForumId) this._refreshingForumIds.add(targetForumId);
      this._syncRefreshButtonState();

      const mode = opts && typeof opts.mode === 'string' ? opts.mode : 'refresh';
      // 若当前论坛绑定角色存在缺失账号名：先单独生成账号名并写入缓存，再生成帖子列表。
      const missingAccountNames = selectedCharacterIds
        .map((cid, idx) => {
          const charName = String(selectedCharacterNames[idx] || '').trim();
          const accountName = String(characterForumAccountMap[cid] || '').trim();
          if (!cid || !charName || accountName) return '';
          return charName;
        })
        .filter(Boolean);
      if (missingAccountNames.length) {
        const accountTask = this._buildForumCharacterAccountsTask({
          forumName,
          worldbook,
          selectedCharacterNames,
          selectedCharacterContext,
          missingAccountNames
        });
        const { parsed: accountsParsed } = await this._runForumFeatureTask(accountTask.spec);
        const accountsArr = Array.isArray(accountsParsed) ? accountsParsed : [];
        if (accountsArr.length) {
          await this._mergeForumCharacterAccounts(forumKeyId, forum, accountsArr);
          characterForumAccountMap = await this._getForumCharacterAccountMap(forumKeyId);
        }
      }

      const task = this._buildForumThreadsTask({
        forumName,
        worldbook,
        count,
        mode,
        hotTopic,
        selectedCharacterIds,
        selectedCharacterNames,
        selectedCharacterContext,
        characterForumAccountMap
      });
      const { parsed } = await this._runForumFeatureTask(task.spec);
      const parsedThreads = this._parseForumThreadsPipe(parsed);
      if (!parsedThreads.length) throw new Error('API 返回内容无法解析为帖子列表');

      const now = Date.now();
      const threads = parsedThreads.slice(0, count).map((x, idx) => {
        return ({
        id: State.generateId(),
        forumId: targetForumId || forum?.id || this._DEFAULT_FORUM_ID,
        forumIcon: icon,
        username: this._normalizeForumUsername(x?.username),
        socialText: this._normalizeForumSocialText(x?.socialText),
        // 新协议：不再从帖子生成接口产出 watching/status；避免空 socialText 时出现旧逻辑兜底标签
        status: '',
        watchingCharacterNames: [],
        topic: this._normalizeForumTopic(x?.topic),
        title: this._normalizeForumTitle(x?.title),
        content: this._normalizeForumContent(x?.content),
        createdAt: now + idx,
        replyCount: 0
      });
      });

      for (const t of threads) {
        try { await Storage.dbAdd('threads', t); } catch (e) {}
      }
      // 记录帖子里的角色互动信号（socialText：正在看/点赞了），供后续角色补充上下文复用
      try {
        await this._recordForumRoleSocialSignals(
          forumKeyId,
          threads,
          selectedCharacterNames
        );
      } catch (e) {}
      // 仅当用户仍在同一个论坛时，才刷新当前列表，避免“跑到别的论坛”
      if (String(this._getCurrentForumId() || '') === String(targetForumId || '')) {
        await this.renderList();
      }

      // 刷新完成：发全局通知，点击可跳转到对应论坛
      try {
        if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
          // 通知展示“列表最上方”的那条（createdAt 最大的最新帖）
          const top = Array.isArray(threads) && threads.length
            ? threads.reduce((best, cur) => ((cur?.createdAt || 0) > (best?.createdAt || 0) ? cur : best), threads[0])
            : null;
          const topTitle = top ? String(top.title || '').trim() : '';
          const topUser = top ? String(top.username || '').trim() : '';
          Notifications.enqueue('论坛', forumName, topTitle || '有新内容', 0, '', {
            forumId: String(targetForumId || ''),
            rightText: topUser
          });
        }
      } catch (e) {}
    } catch (e) {
      console.error('refreshThreads failed:', e);
      const em = String(e && e.message ? e.message : '').trim();
      alert(`刷新失败：${em || '请检查网络和API配置'}`);
    } finally {
      this._forumRecentMessagesCache = null;
      if (targetForumId) this._refreshingForumIds.delete(targetForumId);
      this._syncRefreshButtonState();
    }
  },

  _safeParseJsonArray(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    // 允许模型输出 ```json ... ```
    const cleaned = s
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      const v = JSON.parse(cleaned);
      if (Array.isArray(v)) return v;
      return null;
    } catch (e) {}
    // 尝试截取第一段数组
    const a = cleaned.indexOf('[');
    const b = cleaned.lastIndexOf(']');
    if (a >= 0 && b > a) {
      try {
        const v = JSON.parse(cleaned.slice(a, b + 1));
        return Array.isArray(v) ? v : null;
      } catch (e2) {}
    }
    return null;
  },

  _safeParseJsonObject(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    const cleaned = s
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      const v = JSON.parse(cleaned);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
    } catch (e) {}
    const a = cleaned.indexOf('{');
    const b = cleaned.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        const v = JSON.parse(cleaned.slice(a, b + 1));
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
      } catch (e2) {}
    }
    return null;
  },

  _parseForumThreadsResult(raw) {
    const arr = this._safeParseJsonArray(raw);
    if (Array.isArray(arr)) return { threads: arr, forumCharacterAccounts: [] };
    const obj = this._safeParseJsonObject(raw);
    if (!obj) return { threads: [], forumCharacterAccounts: [] };
    return {
      threads: Array.isArray(obj?.threads) ? obj.threads : [],
      forumCharacterAccounts: Array.isArray(obj?.forumCharacterAccounts) ? obj.forumCharacterAccounts : []
    };
  },

  _normalizeForumUsername(v) {
    const raw = this._stripForumPostTags(String(v || ''))
      .replace(/[`"'“”‘’]/g, '')
      .trim();
    if (!raw) return '匿名';
    let s = raw
      .replace(/[:：].*$/, '')
      .replace(/（.*?）/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\s+/g, '');
    s = s.replace(/(正在看|在看|路过|在线|围观|吃瓜).*/g, '').trim();
    s = s.replace(/^[^\u4e00-\u9fa5A-Za-z0-9_]+|[^\u4e00-\u9fa5A-Za-z0-9_]+$/g, '');
    if (!s) return '匿名';
    if (s.length > 12) s = s.slice(0, 12);
    return s || '匿名';
  },

  _normalizeForumTitle(v) {
    const s = this._stripForumPostTags(String(v || '')).replace(/\s+/g, ' ').trim();
    if (!s) return '（无标题）';
    const out = s.replace(/^(标题|title)\s*[:：-]\s*/i, '').trim();
    return out || '（无标题）';
  },

  _normalizeForumTopic(v) {
    const s = this._stripForumPostTags(String(v || '')).replace(/\s+/g, ' ').trim();
    if (!s) return '闲聊';
    const out = s.replace(/^(话题|topic)\s*[:：-]\s*/i, '').trim();
    return out || '闲聊';
  },

  _normalizeForumStatus(v) {
    const s = this._stripForumPostTags(String(v || '')).replace(/\s+/g, '').trim();
    if (!s) return '';
    if (s.length > 8) return s.slice(0, 8);
    return s;
  },

  _normalizeForumSocialText(v) {
    const s = this._stripForumPostTags(String(v || '')).replace(/\s+/g, ' ').trim();
    if (!s) return '';
    return s.replace(/^(附加提示|提示文案|socialText)\s*[:：-]\s*/i, '').trim();
  },

  _stripForumPostTags(text) {
    // 渲染/规范化防御：避免 <post>...</post> 作为字面文本出现在 UI
    return String(text || '').replace(/<\/?(?:post|comment)>/gi, '');
  },

  _parseForumThreadsPipe(raw) {
    // 纯文本协议：每行一条帖子
    // <post>标题|发帖人昵称|帖子分组|帖子内容|socialText(可空)</post>
    const text = String(raw || '').trim();
    if (!text) return [];

    const blocks = [];
    const re = /<post>([\s\S]*?)<\/post>/gi;
    let m;
    while ((m = re.exec(text))) {
      const inner = String(m[1] || '').trim();
      if (inner) blocks.push(inner);
    }
    // 兼容：若模型没按标签输出，回退到按行解析
    const lines = blocks.length
      ? blocks
      : text
        .split(/\r?\n/)
        .map((l) => String(l || '').trim())
        .filter(Boolean)
        // 防御：忽略明显的代码块/围栏
        .filter((l) => l !== '```' && !l.startsWith('```'));

    const out = [];
    for (const line of lines) {
      // 允许内容里出现 |，所以只按前 4 个分割，剩余并回 content 或 social
      const parts = line.split('|');
      if (parts.length < 4) continue;
      const title = String(parts[0] || '').trim();
      const username = String(parts[1] || '').trim();
      const topic = String(parts[2] || '').trim();
      const content = String(parts[3] || '').trim();
      const socialText = String(parts.slice(4).join('|') || '').trim(); // 第5段及之后合并为 socialText
      if (!title || !username || !topic) continue;
      out.push({ title, username, topic, content, socialText });
    }
    return out;
  },

  _parseForumCommentsPipe(raw) {
    // <comment>评论人昵称|评论内容</comment>
    const text = String(raw || '').trim();
    if (!text) return [];

    const blocks = [];
    const re = /<comment>([\s\S]*?)<\/comment>/gi;
    let m;
    while ((m = re.exec(text))) {
      const inner = String(m[1] || '').trim();
      if (inner) blocks.push(inner);
    }
    const lines = blocks.length
      ? blocks
      : text
        .split(/\r?\n/)
        .map((l) => String(l || '').trim())
        .filter(Boolean)
        .filter((l) => l !== '```' && !l.startsWith('```'));

    const out = [];
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 2) continue;
      const username = String(parts[0] || '').trim();
      const content = String(parts.slice(1).join('|') || '').trim();
      if (!username || !content) continue;
      out.push({ username, content });
    }
    return out;
  },

  _forumCharacterAccountsKey(forumId) {
    return `forum_character_accounts_${String(forumId || '').trim() || this._DEFAULT_FORUM_ID}`;
  },

  _forumRecentViewedThreadsKey(forumId) {
    return `forum_recent_viewed_threads_${String(forumId || '').trim() || this._DEFAULT_FORUM_ID}`;
  },

  _forumRecentUserPostedThreadsKey(forumId) {
    return `forum_recent_user_posted_threads_${String(forumId || '').trim() || this._DEFAULT_FORUM_ID}`;
  },

  _forumRecentUserCommentedThreadsKey(forumId) {
    return `forum_recent_user_commented_threads_${String(forumId || '').trim() || this._DEFAULT_FORUM_ID}`;
  },

  _forumRecentUserLikedThreadsKey(forumId) {
    return `forum_recent_user_liked_threads_${String(forumId || '').trim() || this._DEFAULT_FORUM_ID}`;
  },

  _forumRoleSocialSignalsKey(forumId) {
    return `forum_role_social_signals_${String(forumId || '').trim() || this._DEFAULT_FORUM_ID}`;
  },

  async _getForumRecentViewedThreads(forumId) {
    const key = this._forumRecentViewedThreadsKey(forumId);
    try {
      const v = await Storage.kvGet(key);
      const arr = Array.isArray(v) ? v : [];
      return arr
        .map((x) => ({
          id: String(x?.id || '').trim(),
          ts: Number(x?.ts || 0) || 0
        }))
        .filter((x) => x.id)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 10);
    } catch (e) {
      return [];
    }
  },

  async _setForumRecentViewedThreads(forumId, items) {
    const key = this._forumRecentViewedThreadsKey(forumId);
    const arr = Array.isArray(items) ? items : [];
    const cleaned = arr
      .map((x) => ({
        id: String(x?.id || '').trim(),
        ts: Number(x?.ts || 0) || 0
      }))
      .filter((x) => x.id)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 10);
    try { await Storage.kvSet(key, cleaned); } catch (e) {}
  },

  async _getForumRecentThreadIdListByKey(key) {
    try {
      const v = await Storage.kvGet(key);
      const arr = Array.isArray(v) ? v : [];
      return arr
        .map((x) => ({
          id: String(x?.id || '').trim(),
          ts: Number(x?.ts || 0) || 0
        }))
        .filter((x) => x.id)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 10);
    } catch (e) {
      return [];
    }
  },

  async _setForumRecentThreadIdListByKey(key, items) {
    const arr = Array.isArray(items) ? items : [];
    const cleaned = arr
      .map((x) => ({
        id: String(x?.id || '').trim(),
        ts: Number(x?.ts || 0) || 0
      }))
      .filter((x) => x.id)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 10);
    try { await Storage.kvSet(key, cleaned); } catch (e) {}
  },

  async _recordForumViewedThread(thread) {
    const t = thread && typeof thread === 'object' ? thread : null;
    if (!t) return;
    const id = String(t.id || '').trim();
    if (!id) return;
    const forumId = String(t.forumId || '').trim() || this._DEFAULT_FORUM_ID;
    const list = await this._getForumRecentViewedThreads(forumId);
    const now = Date.now();
    const next = [{ id, ts: now }].concat(list.filter((x) => x && x.id && x.id !== id));
    await this._setForumRecentViewedThreads(forumId, next);
  },

  async _recordForumUserPostedThread(thread) {
    const t = thread && typeof thread === 'object' ? thread : null;
    if (!t) return;
    const id = String(t.id || '').trim();
    if (!id) return;
    const forumId = String(t.forumId || '').trim() || this._DEFAULT_FORUM_ID;
    const key = this._forumRecentUserPostedThreadsKey(forumId);
    const list = await this._getForumRecentThreadIdListByKey(key);
    const now = Date.now();
    const next = [{ id, ts: now }].concat(list.filter((x) => x && x.id && x.id !== id));
    await this._setForumRecentThreadIdListByKey(key, next);
  },

  async _recordForumUserCommentedThread(thread) {
    const t = thread && typeof thread === 'object' ? thread : null;
    if (!t) return;
    const id = String(t.id || '').trim();
    if (!id) return;
    const forumId = String(t.forumId || '').trim() || this._DEFAULT_FORUM_ID;
    const key = this._forumRecentUserCommentedThreadsKey(forumId);
    const list = await this._getForumRecentThreadIdListByKey(key);
    const now = Date.now();
    const next = [{ id, ts: now }].concat(list.filter((x) => x && x.id && x.id !== id));
    await this._setForumRecentThreadIdListByKey(key, next);
  },

  async _recordForumUserLikedThread(thread, liked = true) {
    const t = thread && typeof thread === 'object' ? thread : null;
    if (!t) return;
    const id = String(t.id || '').trim();
    if (!id) return;
    const forumId = String(t.forumId || '').trim() || this._DEFAULT_FORUM_ID;
    const key = this._forumRecentUserLikedThreadsKey(forumId);
    const list = await this._getForumRecentThreadIdListByKey(key);
    if (liked) {
      const now = Date.now();
      const next = [{ id, ts: now }].concat(list.filter((x) => x && x.id && x.id !== id));
      await this._setForumRecentThreadIdListByKey(key, next);
      return;
    }
    // 取消点赞：从最近点赞列表中移除
    const next = list.filter((x) => x && x.id && x.id !== id);
    await this._setForumRecentThreadIdListByKey(key, next);
  },

  async _buildForumRecentThreadHintTextByIds(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '';
    let allThreads = [];
    try {
      const rows = await Storage.dbGetAll('threads');
      allThreads = Array.isArray(rows) ? rows : [];
    } catch (e) {
      allThreads = [];
    }
    const map = new Map(
      allThreads
        .map((t) => [String(t?.id || '').trim(), t])
        .filter(([id]) => id)
    );
    const lines = [];
    list.forEach((it, idx) => {
      const t = map.get(it.id) || null;
      const title = t ? String(t.title || '').trim() : '';
      const briefTitle = title ? (title.length > 44 ? (title.slice(0, 44) + '…') : title) : `帖子#${idx + 1}`;
      lines.push(`${idx + 1}. ${briefTitle}`);
    });
    return lines.join('\n');
  },

  async _buildUserForumBehaviorHintText(forumId) {
    const viewed = await this._getForumRecentViewedThreads(forumId);
    const posted = await this._getForumRecentThreadIdListByKey(this._forumRecentUserPostedThreadsKey(forumId));
    const commented = await this._getForumRecentThreadIdListByKey(this._forumRecentUserCommentedThreadsKey(forumId));
    const viewedText = await this._buildForumRecentThreadHintTextByIds(viewed);
    const postedText = await this._buildForumRecentThreadHintTextByIds(posted);
    const commentedText = await this._buildForumRecentThreadHintTextByIds(commented);
    const blocks = [];
    if (viewedText) blocks.push(['用户最近常看帖子（最多10条）：', viewedText].join('\n'));
    if (postedText) blocks.push(['用户最近发布帖子（最多10条）：', postedText].join('\n'));
    if (commentedText) blocks.push(['用户近期评论过的帖子（最多10条）：', commentedText].join('\n'));
    return blocks.join('\n\n');
  },

  async _buildRecentViewedThreadsHintText(forumId) {
    const list = await this._getForumRecentViewedThreads(forumId);
    if (!list.length) return '';
    let allThreads = [];
    try {
      const items = await Storage.dbGetAll('threads');
      allThreads = Array.isArray(items) ? items : [];
    } catch (e) {
      allThreads = [];
    }
    const map = new Map(
      allThreads
        .map((t) => [String(t?.id || '').trim(), t])
        .filter(([id]) => id)
    );
    const lines = [];
    list.forEach((it, idx) => {
      const t = map.get(it.id) || null;
      const title = t ? String(t.title || '').trim() : '';
      const briefTitle = title ? (title.length > 44 ? (title.slice(0, 44) + '…') : title) : `帖子#${idx + 1}`;
      lines.push(`${idx + 1}. ${briefTitle}`);
    });
    return lines.join('\n');
  },

  async _getForumRoleSocialSignals(forumId) {
    const key = this._forumRoleSocialSignalsKey(forumId);
    try {
      const v = await Storage.kvGet(key);
      const arr = Array.isArray(v) ? v : [];
      return arr
        .map((x) => ({
          threadId: String(x?.threadId || '').trim(),
          title: String(x?.title || '').trim(),
          topic: String(x?.topic || '').trim(),
          socialText: String(x?.socialText || '').trim(),
          roleNames: Array.isArray(x?.roleNames) ? x.roleNames.map((n) => String(n || '').trim()).filter(Boolean) : [],
          action: String(x?.action || '').trim(),
          ts: Number(x?.ts || 0) || 0
        }))
        .filter((x) => x.socialText && x.roleNames.length)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 80);
    } catch (e) {
      return [];
    }
  },

  async _setForumRoleSocialSignals(forumId, items) {
    const key = this._forumRoleSocialSignalsKey(forumId);
    const arr = Array.isArray(items) ? items : [];
    const cleaned = arr
      .map((x) => ({
        threadId: String(x?.threadId || '').trim(),
        title: String(x?.title || '').trim(),
        topic: String(x?.topic || '').trim(),
        socialText: String(x?.socialText || '').trim(),
        roleNames: Array.isArray(x?.roleNames) ? x.roleNames.map((n) => String(n || '').trim()).filter(Boolean) : [],
        action: String(x?.action || '').trim(),
        ts: Number(x?.ts || 0) || 0
      }))
      .filter((x) => x.socialText && x.roleNames.length)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 80);
    try { await Storage.kvSet(key, cleaned); } catch (e) {}
  },

  _extractRoleSocialSignal(socialText, allowedRoleNames = []) {
    const text = this._normalizeForumSocialText(socialText);
    if (!text) return null;
    const allowed = Array.isArray(allowedRoleNames)
      ? allowedRoleNames.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (!allowed.length) return null;

    const action = text.endsWith('正在看')
      ? 'watching'
      : (text.endsWith('点赞了') ? 'liked' : '');
    if (!action) return null;
    const suffix = action === 'watching' ? '正在看' : '点赞了';
    const namesPart = text.slice(0, -suffix.length).trim();
    if (!namesPart) return null;
    const roleNames = namesPart
      .split('、')
      .map((x) => String(x || '').trim())
      .filter((x) => x && allowed.includes(x));
    const uniq = Array.from(new Set(roleNames));
    if (!uniq.length) return null;
    return { action, roleNames: uniq };
  },

  async _recordForumRoleSocialSignals(forumId, threads, allowedRoleNames) {
    const arr = Array.isArray(threads) ? threads : [];
    if (!arr.length) return;
    const current = await this._getForumRoleSocialSignals(forumId);
    const now = Date.now();
    const additions = [];
    arr.forEach((t, idx) => {
      const thread = t && typeof t === 'object' ? t : null;
      if (!thread) return;
      const socialText = this._normalizeForumSocialText(thread.socialText);
      const parsed = this._extractRoleSocialSignal(socialText, allowedRoleNames);
      if (!parsed) return;
      additions.push({
        threadId: String(thread.id || '').trim(),
        title: String(thread.title || '').trim(),
        topic: String(thread.topic || '').trim(),
        socialText,
        roleNames: parsed.roleNames,
        action: parsed.action,
        ts: Number(thread.createdAt || 0) || (now + idx)
      });
    });
    if (!additions.length) return;
    // 相同帖子+socialText 认为同一条，后来的覆盖时间
    const map = new Map();
    current.forEach((x) => {
      const k = `${x.threadId}__${x.socialText}`;
      map.set(k, x);
    });
    additions.forEach((x) => {
      const k = `${x.threadId}__${x.socialText}`;
      map.set(k, x);
    });
    await this._setForumRoleSocialSignals(forumId, Array.from(map.values()));
  },

  async _buildForumRoleSocialSignalsHintText(forumId, maxItems = 8) {
    const list = await this._getForumRoleSocialSignals(forumId);
    if (!list.length) return '';
    return list
      .slice(0, Math.max(1, Number(maxItems || 8)))
      .map((x, idx) => {
        const title = String(x.title || '').trim();
        const briefTitle = title ? (title.length > 36 ? `${title.slice(0, 36)}…` : title) : `帖子#${idx + 1}`;
        return `${idx + 1}. ${briefTitle} | ${x.socialText}`;
      })
      .join('\n');
  },

  async _getForumCharacterAccountMap(forumId) {
    const key = this._forumCharacterAccountsKey(forumId);
    try {
      const v = await Storage.kvGet(key);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) {
      return {};
    }
  },

  async _setForumCharacterAccountMap(forumId, map) {
    const key = this._forumCharacterAccountsKey(forumId);
    try {
      await Storage.kvSet(key, (map && typeof map === 'object' && !Array.isArray(map)) ? map : {});
    } catch (e) {}
  },

  async _mergeForumCharacterAccounts(forumId, forum, items) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return {};
    const current = await this._getForumCharacterAccountMap(forumId);
    const next = { ...current };
    const selectedProfiles = await this._getForumSelectedCharacterProfiles(forum);
    const nameToId = new Map(
      selectedProfiles
        .map((x) => [String(x?.name || '').trim(), String(x?.id || '').trim()])
        .filter(([name, id]) => name && id)
    );
    arr.forEach((row) => {
      const characterName = String(row?.characterName || '').trim();
      const forumAccountName = this._normalizeForumUsername(row?.forumAccountName);
      const characterId = nameToId.get(characterName) || '';
      if (!characterId || !forumAccountName) return;
      next[characterId] = forumAccountName;
    });
    await this._setForumCharacterAccountMap(forumId, next);
    return next;
  },

  _buildForumLegacySocialText(thread) {
    const watchers = Array.isArray(thread?.watchingCharacterNames)
      ? thread.watchingCharacterNames.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (!watchers.length) return '';
    const statusRaw = String(thread?.status || '').trim();
    const status = this._normalizeForumStatus(statusRaw) || '正在看';
    return `${watchers.join('、')}${status}`;
  },

  _getForumSocialText(thread) {
    const current = this._normalizeForumSocialText(thread?.socialText);
    if (current) return current;
    return this._buildForumLegacySocialText(thread);
  },

  _normalizeWatchingCharacterNames(v, selectedCharacterNames, idx = 0) {
    const allowed = Array.isArray(selectedCharacterNames)
      ? selectedCharacterNames.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const allowedSet = new Set(allowed);
    const arr = Array.isArray(v) ? v : [];
    const cleaned = arr
      .map((x) => String(x || '').trim())
      .filter((x) => x && (!allowedSet.size || allowedSet.has(x)));
    const uniq = Array.from(new Set(cleaned));
    if (uniq.length) return uniq.slice(0, 4);
    if (!allowed.length) return [];
    // 模型未返回时兜底：约 2/3 帖子有人在看，人数 1~2
    if ((idx % 3) === 2) return [];
    if (allowed.length === 1) return [allowed[0]];
    const a = allowed[idx % allowed.length];
    const b = allowed[(idx + 1) % allowed.length];
    return (idx % 2 === 0) ? [a] : Array.from(new Set([a, b]));
  },

  _normalizeForumContent(v) {
    const s = this._stripForumPostTags(String(v || '')).trim();
    if (!s) return '';
    return s
      .replace(/^```(?:json|text|markdown)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .replace(/\b[\u4e00-\u9fa5A-Za-z0-9_]{1,12}\s*正在看\b/g, '')
      .trim();
  },

  async _getForumSelectedCharacterProfiles(forum) {
    const ids = Array.isArray(forum?.characterIds)
      ? forum.characterIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (!ids.length) return [];
    if (
      typeof TaPages === 'undefined' ||
      !TaPages ||
      typeof TaPages._buildFeatureContextForCharacter !== 'function'
    ) {
      throw new Error('通用角色上下文封装不可用');
    }
    const out = [];
    for (const id of ids) {
      try {
        const ctx = await TaPages._buildFeatureContextForCharacter(id, { maxMsgs: 24 });
        if (!ctx || !ctx.character) continue;
        out.push({
          id: String(ctx.characterId || id).trim(),
          name: String(ctx.name || '').trim(),
          profileText: String(ctx.charProfile || '').trim(),
          transcriptText: String(ctx.chatTranscript || '').trim()
        });
      } catch (e) {}
    }
    return out.filter((x) => x && x.name);
  },

  async _buildForumCharacterContextText(profiles, forumId = '') {
    const arr = Array.isArray(profiles) ? profiles : [];
    if (!arr.length) return '';
    const lines = ['角色参考（请用于判断谁会对帖子感兴趣）：'];
    arr.forEach((c, i) => {
      const profileText = String(c?.profileText || '').trim();
      const transcriptText = String(c?.transcriptText || '').trim();
      lines.push(`${i + 1}. 角色名：${String(c?.name || '').trim()}`);
      if (profileText) lines.push(`   设定：${profileText}`);
      if (transcriptText) lines.push(`   近期上下文：${transcriptText}`);
    });
    const socialHints = await this._buildForumRoleSocialSignalsHintText(forumId, 8);
    if (socialHints) {
      lines.push('');
      lines.push('近期角色互动信号帖子（最多8条，用于隐藏线索参考）：');
      lines.push(socialHints);
    }
    const userHints = await this._buildUserForumBehaviorHintText(forumId);
    if (userHints) {
      lines.push('');
      lines.push('用户在本论坛的近期行为（用于隐藏线索参考）：');
      lines.push(userHints);
    }
    return lines.join('\n');
  },

  _generateLocalThreads(forum, count) {
    const forumId = forum?.id || this._DEFAULT_FORUM_ID;
    const forumName = String(forum?.name || '默认').trim();
    const wb = String(forum?.worldbook || '').trim();
    const icon = String(forum?.icon || '💬').trim() || '💬';

    const topics = [
      '闲聊', '分享', '求助', '吐槽', '经验', '技巧', '推荐', '记录', '随笔', '提问'
    ];
    const names = [
      '小云', '阿北', '小森', '橘子', '星河', '路人甲', '小鹿', 'Kiki', '小白', '小火'
    ];
    const titleTpl = [
      '关于「{forum}」的一点小想法',
      '今天在{forum}遇到的事',
      '{forum}：你们会怎么做？',
      '求助：{forum}里这种情况正常吗',
      '{forum}的一个小技巧分享'
    ];
    const bodyTpl = [
      '我最近在这里{action}，感觉{feel}。想听听大家的看法。',
      '先说结论：{conclusion}。细节是这样的：{detail}。',
      '有个小问题困扰我：{question}。如果你也遇到过，欢迎留言。',
      '分享一个小记录：{detail}。可能对你有用，也可能只是随便聊聊。'
    ];
    const actions = ['刷帖子', '发帖', '看大家讨论', '整理想法', '记录日常'];
    const feels = ['很有意思', '有点离谱', '挺治愈', '收获不少', '有点迷茫'];
    const conclusions = ['别太焦虑，慢慢来', '先做最小可行版本', '多试几次就顺了', '问题不大但要注意细节', '先把节奏放缓'];
    const details = [
      '我把步骤拆成三段做，最后效果比想象中好。',
      '一开始以为是小事，结果牵扯到好几个地方。',
      '我试了两个方案，第二个明显更顺手。',
      '如果从体验角度看，其实关键在于反馈要及时。'
    ];
    const questions = [
      '你们一般怎么处理这种“想做但不知道从哪开始”的状态？',
      '遇到卡住的时候，你会继续硬顶还是先休息？',
      '你更喜欢简单直接还是更丰富的交互？'
    ];

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const fill = (tpl, map) => tpl.replace(/\{(\w+)\}/g, (_, k) => (map[k] ?? ''));

    const now = Date.now();
    const out = [];
    for (let i = 0; i < count; i++) {
      const username = pick(names);
      const topic = pick(topics);
      const title = fill(pick(titleTpl), { forum: forumName });
      const content = fill(pick(bodyTpl), {
        action: pick(actions),
        feel: pick(feels),
        conclusion: pick(conclusions),
        detail: pick(details),
        question: pick(questions)
      }) + (wb ? `\n\n（论坛设定参考：${wb.slice(0, 80)}${wb.length > 80 ? '…' : ''}）` : '');

      out.push({
        id: State.generateId(),
        forumId,
        forumIcon: icon,
        username,
        topic,
        title,
        content,
        createdAt: now + i, // 保证“新的在上面”
        replyCount: 0
      });
    }
    return out;
  },

  async renderList() {
    const listEl = document.getElementById('forum-list');
    if (!listEl) return;

    const meName = await this._getForumSelfDisplayName();

    const items = await Storage.dbGetAll('threads');
    const threads = Array.isArray(items) ? items.slice() : [];
    
    // 兼容旧数据：没有 forumId 的帖子归入“默认论坛”
    try {
      const needFix = threads.filter(t => t && !t.forumId);
      for (const t of needFix) {
        t.forumId = this._DEFAULT_FORUM_ID;
        try { await Storage.dbPut('threads', t); } catch (e) {}
      }
    } catch (e) {}

    const curForumId = this._getCurrentForumId();
    const visible = threads.filter(t => t && (t.forumId || this._DEFAULT_FORUM_ID) === curForumId);
    visible.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // 用户最近常看：用于“正在看”旁边的回显
    let viewedSet = new Set();
    try {
      const viewed = await this._getForumRecentViewedThreads(curForumId);
      viewedSet = new Set((Array.isArray(viewed) ? viewed : []).map((x) => String(x?.id || '').trim()).filter(Boolean));
    } catch (e1) {
      viewedSet = new Set();
    }

    if (!visible.length) {
      listEl.innerHTML = `
        <div class="yd-empty" style="padding:22px 0;">
          <div class="yd-empty__icon">💬</div>
          <div class="yd-empty__text">还没有帖子，点击右下角发帖</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    for (const t of visible) {
      const el = document.createElement('div');
      el.className = 'yd-thread';
      const title = String(t?.title || '（无标题）');
      const content = String(t?.content || '');
      const authorDisplay = await this._resolveThreadAuthorDisplay(t);
      const username = String(authorDisplay.name || '').trim();
      const avatarHtml = this._buildForumAvatarHtml(username, authorDisplay.avatar);
      const topic = String(t?.topic || '').trim();
      const socialText = this._getForumSocialText(t);
      const socialKind = socialText.endsWith('点赞了')
        ? 'liked'
        : (socialText.endsWith('正在看') ? 'watching' : '');
      const leftMeta = [username || '匿名', topic].filter(Boolean).join(' · ');
      const ago = this._formatAgo(t?.createdAt);
      const isLiked = t?.userLiked === true;

      const parseNamesFromSocialText = (text, suffix) => {
        const s = String(text || '').trim();
        if (!s || !suffix || !s.endsWith(suffix)) return [];
        const raw = s.slice(0, Math.max(0, s.length - suffix.length));
        return raw
          .split('、')
          .map((x) => String(x || '').trim())
          .filter(Boolean);
      };
      const joinNamesWithSuffix = (names, suffix) => {
        const uniq = [];
        const seen = new Set();
        names.forEach((n) => {
          const k = String(n || '').trim();
          if (!k || seen.has(k)) return;
          seen.add(k);
          uniq.push(k);
        });
        return uniq.length ? `${uniq.join('、')}${suffix}` : '';
      };

      // 点赞回显：有角色点赞就显示；用户点赞时在前面追加用户名
      // 位置在“爱心右侧、分享左侧”
      const likedDisplayText = (() => {
        if (socialKind === 'liked') {
          const others = parseNamesFromSocialText(socialText, '点赞了');
          return isLiked
            ? joinNamesWithSuffix([meName, ...others], '点赞了')
            : joinNamesWithSuffix(others, '点赞了');
        }
        return isLiked ? `${meName}点赞了` : '';
      })();

      // 正在看：挪到“时间旁边”；若用户最近看过该帖，则把用户名并进正在看名单
      const watchingText = (() => {
        const userWatching = viewedSet.has(String(t?.id || '').trim());
        if (!userWatching && socialKind !== 'watching') return '';
        const others = socialKind === 'watching' ? parseNamesFromSocialText(socialText, '正在看') : [];
        const names = userWatching ? [meName, ...others] : others;
        return joinNamesWithSuffix(names, '正在看');
      })();
      const watchingHtml = watchingText
        ? `
          <span class="yd-thread__social-tag yd-thread__social-tag--watching">
            <svg class="yd-thread__social-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"></circle>
            </svg>
            <span>${this._esc(watchingText)}</span>
          </span>
        `
        : '';

      el.innerHTML = `
        <div class="yd-thread__title">${this._esc(title)}</div>
        ${content ? `<div class="yd-thread__preview">${this._esc(content)}</div>` : ''}
        <div class="yd-thread__meta">
          <div class="yd-thread__meta-left">
            <div class="yd-thread__avatar">${avatarHtml}</div>
            <div class="yd-thread__meta-text">${this._esc(leftMeta)}</div>
          </div>
          <div class="yd-thread__meta-right">
            ${watchingHtml ? watchingHtml : ''}
            <div class="yd-thread__reply">${this._esc(ago)}</div>
          </div>
        </div>
        <div class="yd-thread__actions">
          <div class="yd-thread__actions-left">
            <button type="button" class="yd-thread__icon-btn yd-thread__like-btn ${isLiked ? 'is-liked' : ''}" data-act="like" aria-label="点赞">
              <svg class="yd-thread__like-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
            ${likedDisplayText ? `<span class="yd-thread__liked-text" data-role="liked-text">${this._esc(likedDisplayText)}</span>` : ''}
            <button type="button" class="yd-thread__icon-btn" data-act="share" aria-label="分享">
              <svg viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
                <path d="M143.865 804.341c-15.104 0-28.156-11.033-30.476-26.21-1.056-6.86-24.388-169.313 83.291-294.69 73.525-85.582 188.41-131.583 341.819-136.95v-95.967a30.87 30.87 0 0 1 17.787-27.959c10.912-5.08 23.634-3.422 32.856 4.264l313.213 261.435a30.883 30.883 0 0 1 11.094 23.696 30.88 30.88 0 0 1-11.094 23.693l-313.18 261.513c-9.165 7.7-21.978 9.347-32.86 4.266a30.87 30.87 0 0 1-17.784-27.959l-0.032-96.54a1464.42 1464.42 0 0 0-32.076-0.35c-201.492 0-331.658 38.03-331.658 96.89 0 16.14-12.45 29.556-28.548 30.778-0.784 0.057-1.568 0.09-2.352 0.09z m362.558-189.495c38.95 0 64.694 1.464 64.694 1.464 16.338 0.932 29.12 14.454 29.12 30.823v60.366l234.17-195.538-234.172-195.464v60.336c0 17.047-13.805 30.869-30.869 30.869-149.792 0-259.28 38.858-325.418 115.487-41.18 47.706-59.207 103.34-66.652 149.596 77.022-45.927 210.596-57.939 329.127-57.939z"></path>
              </svg>
            </button>
          </div>
          <div class="yd-thread__actions-right">
            <div class="yd-thread__more-wrap">
              <button type="button" class="yd-thread__icon-btn" data-act="more" aria-label="更多">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="6" cy="12" r="1.6"></circle>
                  <circle cx="12" cy="12" r="1.6"></circle>
                  <circle cx="18" cy="12" r="1.6"></circle>
                </svg>
              </button>
              <div class="yd-thread__more-menu" hidden>
                <button type="button" class="yd-thread__more-delete" data-act="delete">删除</button>
              </div>
            </div>
          </div>
        </div>
      `;

      el.addEventListener('click', () => {
        if (!t || !t.id) return;
        this.openThread(String(t.id));
      });
      const moreBtn = el.querySelector('[data-act="more"]');
      const moreMenu = el.querySelector('.yd-thread__more-menu');
      const deleteBtn = el.querySelector('[data-act="delete"]');
      const likeBtn = el.querySelector('[data-act="like"]');
      const shareBtn = el.querySelector('[data-act="share"]');
      if (moreBtn && moreMenu) {
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const show = moreMenu.hasAttribute('hidden');
          if (show) moreMenu.removeAttribute('hidden');
          else moreMenu.setAttribute('hidden', 'hidden');
        });
      }
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!t?.id) return;
          const ok = confirm('确定删除这条帖子吗？删除后无法恢复。');
          if (!ok) return;
          try {
            await Storage.dbDelete('threads', String(t.id));
          } catch (err) {
            alert('删除失败，请稍后重试');
            return;
          }
          await this.renderList();
        });
      }
      if (likeBtn) {
        likeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!t?.id) return;
          const nextLiked = !(t?.userLiked === true);
          t.userLiked = nextLiked;
          // 先记录“用户点赞”行为（用于摘要），forumId 缺失时兜底用当前论坛
          try {
            await this._recordForumUserLikedThread(
              { id: String(t.id), forumId: String(t.forumId || curForumId || '').trim() || this._DEFAULT_FORUM_ID },
              nextLiked
            );
          } catch (e2) {}
          // 再写回 threads（用于 UI 状态）
          try {
            await Storage.dbPut('threads', t);
          } catch (err) {}
          likeBtn.classList.toggle('is-liked', nextLiked);
          // 同步“点赞回显”：点赞/取消时更新（可能包含角色点赞文案）
          const left = el.querySelector('.yd-thread__actions-left');
          if (left) {
            const existed = left.querySelector('[data-role="liked-text"]');
            if (!nextLiked) {
              // 取消点赞：若仍有“角色点赞了”，则回退显示角色文案；否则移除
              const currentSocial = this._getForumSocialText(t);
              const cur = String(currentSocial || '').trim();
              if (cur.endsWith('点赞了')) {
                const others = parseNamesFromSocialText(cur, '点赞了');
                const text = joinNamesWithSuffix(others, '点赞了');
                if (text) {
                  if (existed) existed.textContent = text;
                  else {
                    const span = document.createElement('span');
                    span.className = 'yd-thread__liked-text';
                    span.setAttribute('data-role', 'liked-text');
                    span.textContent = text;
                    const share = left.querySelector('[data-act="share"]');
                    if (share) left.insertBefore(span, share);
                    else left.appendChild(span);
                  }
                } else if (existed) {
                  existed.remove();
                }
              } else if (existed) {
                existed.remove();
              }
            } else {
              // 点赞：若有角色点赞文案则在前面加用户名；否则显示“用户名点赞了”
              const currentSocial = this._getForumSocialText(t);
              const cur = String(currentSocial || '').trim();
              let text = '';
              if (cur.endsWith('点赞了')) {
                const others = parseNamesFromSocialText(cur, '点赞了');
                text = joinNamesWithSuffix([meName, ...others], '点赞了');
              } else {
                text = `${meName}点赞了`;
              }
              if (!text) return;
              if (existed) existed.textContent = text;
              else {
                const span = document.createElement('span');
                span.className = 'yd-thread__liked-text';
                span.setAttribute('data-role', 'liked-text');
                span.textContent = text;
                const share = left.querySelector('[data-act="share"]');
                if (share) left.insertBefore(span, share);
                else left.appendChild(span);
              }
            }
          }
        });
      }
      if (shareBtn) {
        shareBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this._openShareSessionPickerForThread(t);
        });
      }
      el.addEventListener('click', () => {
        if (moreMenu && !moreMenu.hasAttribute('hidden')) {
          moreMenu.setAttribute('hidden', 'hidden');
        }
      });

      listEl.appendChild(el);
    }
  },

  async _openShareSessionPickerForThread(thread) {
    const t = thread && typeof thread === 'object' ? thread : null;
    const threadId = String(t?.id || '').trim();
    if (!threadId) return;

    const existingEl = document.getElementById('forum-share-session-modal');
    if (existingEl) existingEl.remove();

    const modal = document.createElement('div');
    modal.id = 'forum-share-session-modal';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="选择会话">
        <div class="yd-modal-header">
          <div style="font-weight:900">分享至哪个会话</div>
          <button type="button" class="yd-btn-close" id="forum-share-session-close" aria-label="关闭">×</button>
        </div>
        <div id="forum-share-session-list" style="display:flex;flex-direction:column;gap:0;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      const el = document.getElementById('forum-share-session-modal');
      if (el) el.remove();
    };
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('forum-share-session-close')?.addEventListener('click', close);

    let sessions = [];
    try {
      sessions = await Storage.dbGetAll('sessions');
    } catch (e) {
      sessions = [];
    }
    if (!Array.isArray(sessions) || sessions.length === 0) {
      const list = document.getElementById('forum-share-session-list');
      if (list) list.innerHTML = `<div style="padding:28px 0;text-align:center;color:#999;font-size:13px;">暂无会话</div>`;
      return;
    }

    const getTs = (s) => {
      const u = Number(s && s.updatedAt);
      if (Number.isFinite(u) && u > 0) return u;
      const c = Number(s && s.createdAt);
      if (Number.isFinite(c) && c > 0) return c;
      return 0;
    };
    sessions.sort((a, b) => getTs(b) - getTs(a));

    const listEl = document.getElementById('forum-share-session-list');
    if (!listEl) return;
    const candidates = sessions.slice(0, 50);
    const labelForSession = (session) => {
      const names = Array.isArray(session?.participantCharacterNames)
        ? session.participantCharacterNames.filter(Boolean)
        : [];
      return names.length ? names.join('、') : (session?.title || '默认AI');
    };

    listEl.innerHTML = candidates.map((s) => {
      const label = labelForSession(s);
      const time = this._formatAgo(getTs(s));
      return `
        <div class="yd-list-item" role="button" tabindex="0" data-session-id="${this._esc(String(s.id || ''))}">
          <div class="yd-list-item__avatar">💬</div>
          <div class="yd-list-item__content">
            <div class="yd-list-item__header">
              <div class="yd-list-item__title">${this._esc(s.title || label)}</div>
              <div class="yd-list-item__time">${this._esc(time)}</div>
            </div>
            <div class="yd-list-item__subtitle">${this._esc(label)}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-session-id]').forEach((item) => {
      const sid = item.getAttribute('data-session-id');
      if (!sid) return;
      const run = async () => {
        try {
          await this._insertForumThreadShareToSession({ sessionId: sid, thread: t });
          close();
          if (typeof Chat !== 'undefined' && Chat && typeof Chat.openSession === 'function') {
            await Chat.openSession(sid);
            if (typeof Chat._toast === 'function') Chat._toast('已分享');
          } else if (typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
            State.switchPage('page-chat');
          }
        } catch (e) {
          console.error('[forum][share] insert failed', e);
          alert('分享失败，请稍后重试');
        }
      };
      item.addEventListener('click', run);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') run();
      });
    });
  },

  async _insertForumThreadShareToSession({ sessionId, thread }) {
    const sid = String(sessionId || '').trim();
    const t = thread && typeof thread === 'object' ? thread : null;
    if (!sid || !t) return;
    const escPipe = (v) => String(v ?? '').replace(/\|/g, '｜');
    const title = String(t?.title || '').trim() || '论坛帖子';
    const content = String(t?.content || '').trim();
    const summary = content ? (content.length > 180 ? `${content.slice(0, 180)}…` : content) : '（无正文）';
    const threadId = String(t?.id || '').trim();
    const ts = Number(t?.createdAt || Date.now()) || Date.now();
    const forumName = String(this._getCurrentForum()?.name || '论坛').trim() || '论坛';
    const authorDisplay = await this._resolveThreadAuthorDisplay(t);
    const threadAuthorName = String(authorDisplay?.name || t?.username || '匿名').trim() || '匿名';
    let hiddenPayloadB64 = '';
    try {
      const cachedComments = await this._getCachedComments(threadId);
      const recentComments = Array.isArray(cachedComments) ? cachedComments.slice(-40) : [];
      if (recentComments.length) {
        const commentLines = recentComments.map((c, idx) => {
          const floor = Math.max(1, recentComments.length - recentComments.length + idx + 1);
          const name = String(c?.username || '匿名').trim() || '匿名';
          const body = this._formatForumCommentBody(c);
          return `${floor}楼 ${name}：${body || '（空）'}`;
        });
        const payloadObj = {
          type: 'forum_thread_share_hidden_context',
          forumName,
          threadId,
          threadTitle: title,
          threadAuthor: threadAuthorName,
          recentCommentsText: commentLines.join('\n')
        };
        const json = JSON.stringify(payloadObj);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        if (b64) hiddenPayloadB64 = b64;
      }
    } catch (e) {}

    // 论坛帖子分享：复用 [分享] 协议，交给 chat 侧统一渲染
    // [分享]应用|资源|动作|主键|标题|金额|状态|时间|地址
    const parts = [
      '论坛',
      '帖子',
      '查看',
      escPipe(threadId),
      escPipe(title),
      '0',
      '已分享',
      String(ts),
      escPipe(`${forumName}｜${summary}`)
    ];
    const msg = {
      id: State.generateId(),
      sessionId: sid,
      role: 'user',
      content: `[分享]${parts.join('|')}`,
      sharePayloadB64: hiddenPayloadB64,
      createdAt: Date.now()
    };
    await Storage.dbAdd('messages', msg);

    const session = await Storage.dbGet('sessions', sid);
    if (session) {
      session.updatedAt = Date.now();
      await Storage.dbPut('sessions', session);
    }
    try {
      if (typeof Chat !== 'undefined' && Chat._scheduleChatListRefresh) {
        Chat._scheduleChatListRefresh();
      }
      if (State.currentPage === 'page-chat' && typeof Chat !== 'undefined' && Chat.currentSessionId === sid && Chat.loadMessages) {
        await Chat.loadMessages();
      }
    } catch (e) {}
  },

  openThread(threadId) {
    const id = String(threadId || '').trim();
    if (!id) return;
    this._currentThreadId = id;
    this._pendingReplyTarget = null;
    try { State.switchPage('page-forum-thread'); } catch (e) {}
  },

  async _renderThreadDetail() {
    const postEl = document.getElementById('forum-thread-post');
    const listEl = document.getElementById('forum-thread-comments');
    const loadBtn = document.getElementById('forum-thread-load');
    const moreBtn = document.getElementById('forum-thread-more');
    const metaEl = document.getElementById('forum-thread-reply-meta');
    if (postEl) postEl.innerHTML = '';
    if (listEl) listEl.innerHTML = '';
    if (moreBtn) {
      moreBtn.hidden = true;
      moreBtn.textContent = '加载评论';
    }
    if (metaEl) metaEl.textContent = '帖子回复';
    if (loadBtn) {
      loadBtn.hidden = false;
      loadBtn.disabled = false;
      loadBtn.textContent = '加载评论';
    }
    this._syncThreadToBottomButton(0);

    const threadId = String(this._currentThreadId || '').trim();
    if (!threadId) return;
    const t = await Storage.dbGet('threads', threadId);
    if (!t) return;

    if (postEl) {
      const wrap = document.createElement('div');
      wrap.className = 'yd-thread';
      const socialText = this._getForumSocialText(t);
      const authorDisplay = await this._resolveThreadAuthorDisplay(t);
      const authorName = String(authorDisplay.name || '匿名').trim() || '匿名';
      const authorAvatarHtml = this._buildForumAvatarHtml(authorName, authorDisplay.avatar);
      wrap.innerHTML = `
        <div class="yd-thread__title">${this._esc(String(t?.title || '（无标题）'))}</div>
        ${t?.content ? `<div class="yd-thread__preview" style="-webkit-line-clamp: 99;">${this._esc(String(t.content || ''))}</div>` : ''}
        <div class="yd-thread__meta">
          <div class="yd-thread__meta-left">
            <div class="yd-thread__avatar">${authorAvatarHtml}</div>
            <div class="yd-thread__meta-text">${this._esc([
              authorName,
              String(t?.topic || '').trim()
            ].filter(Boolean).join(' · '))}</div>
          </div>
          <div class="yd-thread__meta-right">
            ${socialText ? `<span class="yd-thread__social-tag">${this._esc(socialText)}</span>` : ''}
            <div class="yd-thread__reply">${this._esc(this._formatAgo(t?.createdAt))}</div>
          </div>
        </div>
      `;
      postEl.appendChild(wrap);
    }

    // 默认不加载评论：如果有本地缓存，则直接渲染缓存（仍不触发 API）
    const cached = await this._getCachedComments(threadId);
    if (cached.length) {
      this._renderComments(cached, true);
      if (metaEl) metaEl.textContent = '帖子回复';
      if (loadBtn) loadBtn.hidden = true;
      if (moreBtn) {
        moreBtn.hidden = false;
        moreBtn.textContent = '加载评论';
      }
    }
    this._syncThreadToBottomButton(cached.length);
  },

  async _getCachedComments(threadId) {
    const key = `forum_comments_${String(threadId || '')}`;
    try {
      const v = await Storage.kvGet(key);
      return Array.isArray(v) ? v.filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  },

  async _setCachedComments(threadId, comments) {
    const key = `forum_comments_${String(threadId || '')}`;
    try { await Storage.kvSet(key, Array.isArray(comments) ? comments : []); } catch (e) {}
  },

  async _renderComments(items, replace = false) {
    const listEl = document.getElementById('forum-thread-comments');
    if (!listEl) return;
    if (replace) listEl.innerHTML = '';
    const base = replace ? 0 : listEl.querySelectorAll('.yd-forum-comment').length;
    const arr = Array.isArray(items) ? items : [];
    for (const [idx, c] of arr.entries()) {
      const floor = base + idx + 1;
      c.floor = floor;
      const authorDisplay = await this._resolveCommentAuthorDisplay(c);
      const name = String(authorDisplay.name || '匿名').trim() || '匿名';
      const content = this._formatForumCommentBody(c);
      const { bg } = this._avatarStyle(name);
      const avatarHtml = this._buildForumAvatarHtml(name, authorDisplay.avatar);
      const el = document.createElement('div');
      el.className = 'yd-forum-comment';
      el.innerHTML = `
        <div class="yd-forum-comment__avatar" style="background:${bg}">${avatarHtml}</div>
        <div class="yd-forum-comment__main">
          <div class="yd-forum-comment__meta">
            <div class="yd-forum-comment__name">${this._esc(name)}</div>
            <div class="yd-forum-comment__floor">${floor}楼</div>
          </div>
          <div class="yd-forum-comment__body">${this._esc(content)}</div>
        </div>
      `;
      el.addEventListener('click', (evt) => {
        const px = Number(evt?.clientX || 0);
        const py = Number(evt?.clientY || 0);
        this._openForumCommentActionMenu({ x: px + 6, y: py + 6 }, c);
      });
      listEl.appendChild(el);
    }

    const metaEl = document.getElementById('forum-thread-reply-meta');
    if (metaEl) metaEl.textContent = '帖子回复';
    this._syncThreadToBottomButton(listEl.querySelectorAll('.yd-forum-comment').length);
  },

  _syncThreadToBottomButton(totalCount = 0) {
    const btn = document.getElementById('forum-thread-to-bottom');
    if (!btn) return;
    const n = Number(totalCount || 0);
    btn.hidden = !(n > 8);
  },

  _scrollThreadCommentsToBottom() {
    const listEl = document.getElementById('forum-thread-comments');
    const last = listEl?.lastElementChild;
    if (last && last.scrollIntoView) {
      last.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    try {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    } catch (e) {
      window.scrollTo(0, document.documentElement.scrollHeight || 0);
    }
  },

  _firstChar(name) {
    const s = String(name || '').trim();
    if (!s) return '匿';
    return s.slice(0, 1);
  },

  _avatarStyle(name) {
    const s = String(name || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    const sat = 65;
    const light = 82;
    return { bg: `hsl(${hue} ${sat}% ${light}%)` };
  },

  async loadThreadComments(isMore, modeOverride, extraOptions = null) {
    const threadId = String(this._currentThreadId || '').trim();
    if (!threadId) return;
    const loadBtn = document.getElementById('forum-thread-load');
    const moreBtn = document.getElementById('forum-thread-more');
    const sendBtn = document.getElementById('forum-thread-send');
    const inputEl = document.getElementById('forum-thread-input');
    const busyAttr = 'data-busy';

    const busy = (el) => el && el.getAttribute && el.getAttribute(busyAttr) === '1';
    if (busy(loadBtn) || busy(moreBtn)) return;

    const existing = await this._getCachedComments(threadId);
    const offset = isMore ? existing.length : 0;

    const setBusy = (el, v) => {
      if (!el || !el.setAttribute) return;
      if (v) el.setAttribute(busyAttr, '1');
      else el.removeAttribute(busyAttr);
    };

    try {
      if (!isMore && loadBtn) {
        setBusy(loadBtn, true);
        loadBtn.disabled = true;
        loadBtn.textContent = '加载中...';
      }
      if (isMore && moreBtn) {
        setBusy(moreBtn, true);
        moreBtn.disabled = true;
        moreBtn.textContent = '加载中...';
      }
      if (sendBtn) sendBtn.disabled = true;
      if (inputEl) inputEl.disabled = true;

      const t = await Storage.dbGet('threads', threadId);
      if (!t) return;
      // 记录“用户在当前论坛常看帖子”：只要触发过加载评论，就算看过（按最近排序，最多10条）
      try { await this._recordForumViewedThread(t); } catch (e) {}
      const mode = modeOverride || this._commentMode || 'comment';
      const newComments = await this._fetchCommentsFromApi(t, 8, offset, mode, existing, extraOptions || null);
      const merged = offset ? existing.concat(newComments) : newComments;
      await this._setCachedComments(threadId, merged);
      this._renderComments(offset ? newComments : merged, !offset);

      if (moreBtn) {
        moreBtn.hidden = false;
        moreBtn.textContent = '加载评论';
      }
      if (loadBtn) loadBtn.hidden = true;
    } finally {
      if (!isMore && loadBtn) setBusy(loadBtn, false);
      if (isMore && moreBtn) {
        setBusy(moreBtn, false);
        moreBtn.disabled = false;
        moreBtn.textContent = '加载更多';
      }
      if (sendBtn) sendBtn.disabled = false;
      if (inputEl) inputEl.disabled = false;
    }
  },

  async postThreadComment() {
    const threadId = String(this._currentThreadId || '').trim();
    if (!threadId) return;
    const inputEl = document.getElementById('forum-thread-input');
    const sendBtn = document.getElementById('forum-thread-send');
    const text = String(inputEl?.value || '').trim();
    if (!text) return;

    if (sendBtn) sendBtn.disabled = true;
    if (inputEl) inputEl.disabled = true;
    try {
      const existing = await this._getCachedComments(threadId);
      const meName = await this._getForumSelfDisplayName();
      const replyTarget = this._pendingReplyTarget && this._pendingReplyTarget.type
        ? { ...this._pendingReplyTarget }
        : null;
      const mine = {
        username: meName || '我',
        content: text,
        createdAt: Date.now(),
        isMine: true,
        authorType: 'user',
        replyTarget
      };
      const merged = existing.concat([mine]);
      await this._setCachedComments(threadId, merged);
      await this._renderComments([mine], false);
      if (inputEl) inputEl.value = '';

      // 记录“用户评论过该帖”
      try {
        const t = await Storage.dbGet('threads', threadId);
        if (t) await this._recordForumUserCommentedThread(t);
      } catch (e) {}

      // 发表后也触发一次“加载更多”的 API（根据当前模式）
      await this.loadThreadComments(true, this._commentMode || 'comment', {
        replyTarget,
        latestUserCommentText: text
      });
      this._pendingReplyTarget = null;
      this._syncCommentPlaceholder();
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (inputEl) inputEl.disabled = false;
    }
  },

  async _fetchCommentsFromApi(thread, count, offset, mode, existingComments = [], extraOptions = null) {
    // 评论也注入论坛/角色上下文（同论坛帖子生成逻辑），避免“新版标准里有角色上下文，但评论没有”的割裂
    this._ensureForums();
    const forumId = String(thread?.forumId || '').trim() || this._getCurrentForumId();
    const forum = this._getForums().find((f) => f && String(f.id || '').trim() === forumId) || this._getCurrentForum();
    const forumName = String(forum?.name || '').trim();
    const worldbook = String(forum?.worldbook || '').trim();
    let selectedCharacterProfiles = [];
    try {
      selectedCharacterProfiles = await this._getForumSelectedCharacterProfiles(forum);
    } catch (e) {
      selectedCharacterProfiles = [];
    }
    const selectedCharacterNames = selectedCharacterProfiles.map((x) => String(x?.name || '').trim()).filter(Boolean);
    const selectedCharacterContext = await this._buildForumCharacterContextText(selectedCharacterProfiles, forumId);
    const currentUserForumName = await this._getForumSelfDisplayName();
    const currentUserMaskProfile = await this._getDefaultMaskProfile();
    const characterAccountMapById = await this._getForumCharacterAccountMap(forumId);
    const currentForumCharacterAccountsByName = Object.fromEntries(
      selectedCharacterProfiles
        .map((x) => {
          const characterName = String(x?.name || '').trim();
          const characterId = String(x?.id || '').trim();
          const accountName = String(characterAccountMapById[characterId] || '').trim();
          return characterName ? [characterName, accountName] : null;
        })
        .filter(Boolean)
    );

    const task = this._buildForumCommentsTask({
      thread,
      count,
      offset,
      mode,
      existingComments,
      replyTarget: extraOptions?.replyTarget || null,
      currentUserForumName,
      currentUserMaskName: String(currentUserMaskProfile?.name || '').trim(),
      currentUserMaskDetail: String(currentUserMaskProfile?.detail || '').trim(),
      currentForumCharacterAccountsByName,
      latestUserCommentText: String(extraOptions?.latestUserCommentText || '').trim(),
      forumName,
      worldbook,
      selectedCharacterNames,
      selectedCharacterContext
    });
    try {
      const { parsed } = await this._runForumFeatureTask(task.spec);
      const arr = this._parseForumCommentsPipe(parsed);
      return arr.slice(0, count).map((x) => ({
        username: this._normalizeForumUsername(x?.username),
        content: this._normalizeForumContent(x?.content)
      }));
    } catch (e) {
      console.error('_fetchCommentsFromApi failed:', e);
      const em = String(e && e.message ? e.message : '').trim();
      alert(`加载评论失败：${em || '请检查网络和API配置'}`);
      return [];
    }
  },

  openComposer() {
    const existing = document.getElementById('yd-forum-compose');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-forum-compose';
    modal.className = 'yd-forum-compose';
    modal.innerHTML = `
      <div class="yd-forum-compose__mask" data-close="1"></div>
      <div class="yd-forum-compose__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-compose__bar">
          <div class="yd-forum-compose__title">发布帖子</div>
          <button type="button" class="yd-forum-compose__btn" id="yd-forum-post" disabled>确认</button>
        </div>
        <input class="yd-forum-compose__input" id="yd-forum-title" placeholder="标题（必填）" maxlength="60" />
        <textarea class="yd-forum-compose__textarea" id="yd-forum-content" placeholder="说点什么…"></textarea>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const titleEl = modal.querySelector('#yd-forum-title');
    const contentEl = modal.querySelector('#yd-forum-content');
    const postBtn = modal.querySelector('#yd-forum-post');

    const refresh = () => {
      const ok = String(titleEl?.value || '').trim().length > 0;
      if (postBtn) postBtn.disabled = !ok;
    };

    titleEl?.addEventListener('input', refresh);
    titleEl?.addEventListener('change', refresh);
    refresh();

    postBtn?.addEventListener('click', async () => {
      const title = String(titleEl?.value || '').trim();
      if (!title) return;
      const content = String(contentEl?.value || '').trim();
      const forumId = this._getCurrentForumId();
      const meName = await this._getForumSelfDisplayName();
      const thread = {
        id: State.generateId(),
        forumId,
        username: meName || '我',
        isMine: true,
        authorType: 'user',
        title,
        content,
        createdAt: Date.now(),
        replyCount: 0
      };
      await Storage.dbAdd('threads', thread);
      try { await this._recordForumUserPostedThread(thread); } catch (e) {}
      close();
      await this.renderList();
    });
  },

  openForumPicker() {
    this._ensureForums();
    const existing = document.getElementById('yd-forum-picker');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-forum-picker';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">论坛列表</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-forum-picker__list" id="yd-forum-picker-list"></div>
        <div class="yd-forum-picker__footer">
          <button type="button" class="yd-forum-picker__add" id="yd-forum-add">＋ 新增论坛</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const listEl = modal.querySelector('#yd-forum-picker-list');
    const render = () => {
      const forums = this._getForums();
      const curId = this._getCurrentForumId();
      if (!listEl) return;
      listEl.innerHTML = '';
      forums.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'yd-forum-item';
        const name = String(f?.name || '未命名论坛').trim();
        const desc = String(f?.worldbook || '').trim().replace(/\s+/g, ' ');
        const brief = desc ? (desc.length > 40 ? (desc.slice(0, 40) + '…') : desc) : '未填写世界书';
        const isCurrent = f && f.id === curId;
        if (isCurrent) row.classList.add('yd-forum-item--current');
        row.innerHTML = `
          <div class="yd-forum-item__main">
            <div class="yd-forum-item__name">${this._esc(name)}</div>
            <div class="yd-forum-item__desc">${this._esc(brief)}</div>
          </div>
          <div class="yd-forum-item__actions">
            <button type="button" class="yd-forum-item__btn" data-act="edit">编辑</button>
            <button type="button" class="yd-forum-item__btn ${isCurrent ? 'yd-forum-item__btn--current' : 'yd-forum-item__btn--primary'}" data-act="switch" ${isCurrent ? 'disabled' : ''}>
              ${isCurrent ? '当前' : '切换'}
            </button>
          </div>
        `;
        row.querySelector('[data-act="switch"]')?.addEventListener('click', () => {
          try { Storage.set(this._CURRENT_FORUM_KEY, f.id); } catch (e) {}
          this._syncHeaderForumButton();
          this._syncRefreshButtonState();
          this.renderList();
          render();
        });
        row.querySelector('[data-act="edit"]')?.addEventListener('click', () => {
          this._openForumEditor(f, () => render());
        });
        listEl.appendChild(row);
      });
    };
    render();

    modal.querySelector('#yd-forum-add')?.addEventListener('click', () => {
      this._openForumEditor(null, () => render());
    });
  },

  async _openForumEditor(forum, onDone) {
    const existing = document.getElementById('yd-forum-editor');
    if (existing) existing.remove();

    const isEdit = !!(forum && forum.id);
    const allCharacters = await this._getForumCharacterOptions();
    const selectedSet = new Set(
      Array.isArray(forum?.characterIds) ? forum.characterIds.map((x) => String(x || '').trim()).filter(Boolean) : []
    );
    let draftActiveUserAccountId = String(forum?.activeUserForumAccountId || '').trim();
    let draftUserAccounts = await this._getUserForumAccountsAll();

    const modal = document.createElement('div');
    modal.id = 'yd-forum-editor';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar yd-forum-picker__bar--sticky">
          <div class="yd-forum-picker__title">${isEdit ? '编辑论坛' : '新增论坛'}</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div style="font-size:13px;color:#666;margin:0 0 8px;">论坛名称</div>
        <input class="yd-forum-compose__input" id="yd-forum-edit-name" placeholder="论坛名称（必填）" maxlength="24" />
        <div style="font-size:13px;color:#666;margin:10px 0 8px;">论坛世界书</div>
        <textarea class="yd-forum-compose__textarea" id="yd-forum-edit-worldbook" placeholder="论坛世界书（背景/规则/补充信息）"></textarea>
        <div style="margin-top:10px;">
          <div style="font-size:13px;color:#666;margin:0 0 8px;">与角色一起逛论坛</div>
          <div id="yd-forum-edit-characters" style="width:100%;box-sizing:border-box;max-height:180px;overflow:auto;border:1px solid #E5E5EA;border-radius:12px;padding:8px 10px;background:#fff;"></div>
        </div>
        <div style="margin-top:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px;">
            <div style="font-size:13px;color:#666;">用户的论坛账号</div>
            <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-forum-user-account-add">+新增</button>
          </div>
          <div id="yd-forum-user-account-list" style="width:100%;box-sizing:border-box;max-height:180px;overflow:auto;border:1px solid #E5E5EA;border-radius:12px;padding:8px 10px;background:#fff;"></div>
        </div>
        <div class="yd-forum-picker__footer yd-forum-picker__footer--sticky" style="justify-content:flex-end;gap:10px;">
          ${isEdit ? '<button type="button" class="yd-forum-item__btn" id="yd-forum-edit-delete" style="margin-right:auto;color:#dc2626;border-color:rgba(220,38,38,.35);">删除</button>' : ''}
          <button type="button" class="yd-forum-item__btn" data-close="1">取消</button>
          <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-forum-edit-save">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const nameEl = modal.querySelector('#yd-forum-edit-name');
    const wbEl = modal.querySelector('#yd-forum-edit-worldbook');
    const charWrap = modal.querySelector('#yd-forum-edit-characters');
    const userAccountListEl = modal.querySelector('#yd-forum-user-account-list');
    if (nameEl) nameEl.value = isEdit ? String(forum.name || '') : '';
    if (wbEl) wbEl.value = isEdit ? String(forum.worldbook || '') : '';
    if (charWrap) {
      if (!allCharacters.length) {
        charWrap.innerHTML = `<div style="font-size:12px;color:#9ca3af;padding:6px 4px;">暂无角色可选</div>`;
      } else {
        charWrap.innerHTML = allCharacters.map((c) => {
          const checked = selectedSet.has(c.id) ? 'checked' : '';
          return `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;">
              <input type="checkbox" value="${this._esc(c.id)}" ${checked}>
              <span style="font-size:14px;color:#111;">${this._esc(c.name)}</span>
            </label>
          `;
        }).join('');
      }
    }

    const renderUserForumAccounts = () => {
      if (!userAccountListEl) return;
      if (!draftUserAccounts.length) {
        userAccountListEl.innerHTML = `<div style="font-size:12px;color:#9ca3af;padding:6px 4px;">暂无用户论坛账号</div>`;
        draftActiveUserAccountId = '';
        return;
      }
      const activeSet = draftActiveUserAccountId || '';
      userAccountListEl.innerHTML = draftUserAccounts.map((x) => {
        const avatarText = String(x.avatar || '').trim() || '☁️';
        const avatarHtml = /^data:image\//i.test(avatarText)
          ? `<img src="${this._esc(avatarText)}" alt="头像" style="width:24px;height:24px;border-radius:999px;object-fit:cover;display:block;">`
          : this._esc(avatarText.slice(0, 2));
        const nickname = String(x.nickname || '').trim();
        const bio = String(x.bio || '').trim() || '未填写主页介绍';
        const aid = String(x.id || '').trim();
        const checked = activeSet && activeSet === aid ? 'checked' : '';
        return `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:8px 4px;border-bottom:1px dashed #ECECF1;">
            <label style="display:flex;align-items:flex-start;gap:10px;min-width:0;cursor:pointer;flex:1 1 auto;">
              <input type="checkbox" data-act="pick-user-account" data-id="${this._esc(aid)}" ${checked} style="margin-top:2px;">
              <div style="display:flex;align-items:flex-start;gap:8px;min-width:0;">
                <div style="width:24px;height:24px;border-radius:999px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;flex:0 0 auto;font-size:14px;overflow:hidden;">${avatarHtml}</div>
                <div style="min-width:0;">
                  <div style="font-size:13px;color:#111;font-weight:600;line-height:1.3;">${this._esc(nickname)}</div>
                  <div style="font-size:12px;color:#666;line-height:1.4;word-break:break-word;">${this._esc(bio)}</div>
                </div>
              </div>
            </label>
            <button type="button" class="yd-forum-item__btn" data-act="remove-user-account" data-id="${this._esc(aid)}">删除</button>
          </div>
        `;
      }).join('');
    };

    const openUserAccountCreateModal = () => {
      const existed = document.getElementById('yd-forum-user-account-editor');
      if (existed) existed.remove();

      const sub = document.createElement('div');
      sub.id = 'yd-forum-user-account-editor';
      sub.className = 'yd-forum-picker';
      sub.innerHTML = `
        <div class="yd-forum-picker__mask" data-close="1"></div>
        <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
          <div class="yd-forum-picker__bar yd-forum-picker__bar--sticky">
            <div class="yd-forum-picker__title">新增用户论坛账号</div>
            <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
          </div>
          <input class="yd-forum-compose__input" id="yd-forum-user-account-nickname" placeholder="用户昵称（必填）" maxlength="24" />
          <div style="margin-top:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div id="yd-forum-user-account-avatar-preview" style="width:40px;height:40px;border-radius:999px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;">☁️</div>
              <button type="button" class="yd-forum-item__btn" id="yd-forum-user-account-avatar-upload">上传头像</button>
              <input type="file" id="yd-forum-user-account-avatar-file" accept="image/png,image/jpeg,image/webp" style="display:none" />
            </div>
          </div>
          <textarea class="yd-forum-compose__textarea" id="yd-forum-user-account-bio" placeholder="用户论坛主页介绍" maxlength="120" style="margin-top:8px;"></textarea>
          <div class="yd-forum-picker__footer" style="justify-content:flex-end;gap:10px;">
            <button type="button" class="yd-forum-item__btn" data-close="1">取消</button>
            <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-forum-user-account-save">保存</button>
          </div>
        </div>
      `;
      document.body.appendChild(sub);

      const closeSub = () => sub.remove();
      sub.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-close') === '1') closeSub();
      });

      const nicknameEl = sub.querySelector('#yd-forum-user-account-nickname');
      const bioEl = sub.querySelector('#yd-forum-user-account-bio');
      const avatarPreviewEl = sub.querySelector('#yd-forum-user-account-avatar-preview');
      const avatarUploadBtnEl = sub.querySelector('#yd-forum-user-account-avatar-upload');
      const avatarFileEl = sub.querySelector('#yd-forum-user-account-avatar-file');
      let avatarData = '';

      avatarUploadBtnEl?.addEventListener('click', () => avatarFileEl?.click());
      avatarFileEl?.addEventListener('change', () => {
        const file = avatarFileEl.files && avatarFileEl.files[0];
        if (!file) return;
        if (!/^image\//i.test(String(file.type || ''))) {
          alert('请选择图片文件');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          avatarData = String(reader.result || '').trim();
          if (!avatarData) return;
          if (avatarPreviewEl) {
            avatarPreviewEl.innerHTML = `<img src="${this._esc(avatarData)}" alt="头像预览" style="width:100%;height:100%;object-fit:cover;display:block;">`;
          }
        };
        reader.onerror = () => {
          alert('头像读取失败，请重试');
        };
        reader.readAsDataURL(file);
      });

      sub.querySelector('#yd-forum-user-account-save')?.addEventListener('click', () => {
        const nickname = String(nicknameEl?.value || '').trim();
        if (!nickname) {
          alert('请填写用户昵称');
          return;
        }
        const bio = String(bioEl?.value || '').trim();
        draftUserAccounts.push({
          id: State.generateId(),
          nickname,
          avatar: avatarData,
          bio,
          createdAt: Date.now()
        });
        // 立即持久化：这样其它论坛编辑里也能立刻直接选到
        void this._setUserForumAccountsAll(draftUserAccounts).then(() => {
          renderUserForumAccounts();
          closeSub();
        }).catch(() => {
          alert('保存用户账号失败，请稍后重试');
        });
      });
    };

    renderUserForumAccounts();
    modal.querySelector('#yd-forum-user-account-add')?.addEventListener('click', () => {
      openUserAccountCreateModal();
    });
    userAccountListEl?.addEventListener('change', (e) => {
      const t = e?.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-act') !== 'pick-user-account') return;
      const id = String(t.getAttribute('data-id') || '').trim();
      if (!id) return;
      const checked = !!t.checked;
      if (!checked) {
        if (draftActiveUserAccountId === id) draftActiveUserAccountId = '';
        renderUserForumAccounts();
        return;
      }
      // 单选：勾选一个时，取消其它
      draftActiveUserAccountId = id;
      renderUserForumAccounts();
    });
    userAccountListEl?.addEventListener('click', (e) => {
      const btn = e?.target?.closest?.('[data-act="remove-user-account"]');
      if (!btn) return;
      const id = String(btn.getAttribute('data-id') || '').trim();
      if (!id) return;
      draftUserAccounts = draftUserAccounts.filter((x) => String(x?.id || '') !== id);
      if (draftActiveUserAccountId === id) draftActiveUserAccountId = '';
      void this._setUserForumAccountsAll(draftUserAccounts).then(() => renderUserForumAccounts()).catch(() => {
        alert('删除用户账号失败，请稍后重试');
      });
    });

    modal.querySelector('#yd-forum-edit-delete')?.addEventListener('click', () => {
      if (!isEdit || !forum?.id) return;
      const forumName = String(forum?.name || '该论坛').trim() || '该论坛';
      const ok = confirm(`确认删除「${forumName}」吗？删除后不可恢复。`);
      if (!ok) return;

      const forums = this._getForums().filter((x) => x && x.id !== forum.id);
      if (!forums.length) {
        forums.push({
          id: this._DEFAULT_FORUM_ID,
          name: '默认论坛',
          worldbook: '默认论坛世界书：这是一个通用论坛，可发布任何轻松话题。',
          icon: '💬',
          createdAt: Date.now(),
          characterIds: []
        });
      }
      try { Storage.set(this._FORUMS_KEY, forums); } catch (e) {}

      const currentId = String(this._getCurrentForumId() || '').trim();
      if (!currentId || currentId === forum.id || !forums.some((x) => x && x.id === currentId)) {
        try { Storage.set(this._CURRENT_FORUM_KEY, forums[0].id); } catch (e) {}
      }

      this._syncHeaderForumButton();
      this._syncRefreshButtonState();
      this.renderList();
      if (typeof onDone === 'function') onDone();
      close();
    });

    modal.querySelector('#yd-forum-edit-save')?.addEventListener('click', () => {
      const name = String(nameEl?.value || '').trim();
      if (!name) return;
      const worldbook = String(wbEl?.value || '').trim();
      const forums = this._getForums();
      const nextCharacterIds = Array.from(modal.querySelectorAll('#yd-forum-edit-characters input[type="checkbox"]:checked'))
        .map((el) => String(el?.value || '').trim())
        .filter(Boolean);
      let newId = '';
      const lowerName = name.toLowerCase();
      const hasDup = forums.some(x => {
        if (!x) return false;
        if (isEdit && x.id === forum.id) return false;
        const n = String(x.name || '').trim().toLowerCase();
        return n && n === lowerName;
      });
      if (hasDup) {
        alert('论坛名称已存在，请换一个名称');
        return;
      }

      if (isEdit) {
        const idx = forums.findIndex(x => x && x.id === forum.id);
        if (idx >= 0) forums[idx] = {
          ...forums[idx],
          name,
          worldbook,
          icon: forums[idx]?.icon || '💬',
          characterIds: nextCharacterIds,
          useUserForumAccount: !!draftActiveUserAccountId,
          activeUserForumAccountId: String(draftActiveUserAccountId || '').trim()
        };
      } else {
        newId = State.generateId();
        forums.push({
          id: newId,
          name,
          worldbook,
          icon: '💬',
          createdAt: Date.now(),
          characterIds: nextCharacterIds,
          useUserForumAccount: !!draftActiveUserAccountId,
          activeUserForumAccountId: String(draftActiveUserAccountId || '').trim()
        });
      }

      // 角色唯一归属：本论坛勾选的角色，会从其它论坛里移除
      if (nextCharacterIds.length) {
        const chosen = new Set(nextCharacterIds);
        forums.forEach((f) => {
          if (!f || !f.id) return;
          const isSelf = isEdit ? (f.id === forum.id) : (f.id === newId);
          if (isSelf) return;
          const currentIds = Array.isArray(f.characterIds) ? f.characterIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
          const filtered = currentIds.filter((id) => !chosen.has(id));
          if (filtered.length !== currentIds.length) {
            f.characterIds = filtered;
          }
        });
      }

      try { Storage.set(this._FORUMS_KEY, forums); } catch (e) {}

      // 新增：直接切换到新论坛
      if (!isEdit && newId) {
        try { Storage.set(this._CURRENT_FORUM_KEY, newId); } catch (e) {}
        this._syncHeaderForumButton();
        this.renderList();
      } else {
        this._syncHeaderForumButton();
      }

      if (typeof onDone === 'function') onDone();
      close();
    });
  },

  _formatTime(ts) {
    const t = Number(ts || 0);
    if (!t) return '';
    const d = new Date(t);
    const mo = d.getMonth() + 1;
    const da = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${mo}月${da}日 ${hh}:${mm}`;
  },

  _formatAgo(ts) {
    const t = Number(ts || 0);
    if (!t) return '';
    const diff = Date.now() - t;
    const sec = Math.floor(diff / 1000);
    if (sec < 5) return '刚刚';
    if (sec < 60) return `${sec}秒前`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}小时前`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}天前`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}个月前`;
    const yr = Math.floor(mo / 12);
    return `${yr}年前`;
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


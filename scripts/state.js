// 应用状态管理
const State = {
  currentPage: 'page-homescreen',
  currentSessionId: null,
  icons: [],
  // 主屏是否需要刷新（避免每次返回都全量重渲染导致闪烁）
  _homescreenDirty: false,
  /** 从 API 设置返回时跳转的页面；若为 null 则返回 page-settings */
  apiSettingsReturnPage: null,
  /** 从生图设置返回时跳转的页面；若为 null 则返回 page-settings */
  imageGenSettingsReturnPage: null,
  /** 从气泡设置返回时跳转的页面；若为 null 则返回 page-chat-settings */
  bubbleSettingsReturnPage: null,
  /** 从组件列表返回时跳转的页面（按入口来源记录） */
  widgetsReturnPage: null,
  /** 从商城返回到聊天页时使用 */
  shopReturnPage: null,
  /** 从商城返回到聊天页时使用（会话 id） */
  shopReturnSessionId: null,
  /** 从「全局正则」页返回时的页面 id，默认 page-chat */
  regexRulesReturnPage: null,
  /** 进入「全局正则」页时仅展示该角色的角色正则（空则不限制） */
  regexRulesCharacterFilterId: null,
  /** 从「会话美化」页返回时的页面 id（例如 page-chat） */
  sessionBeautifyReturnPage: null,
  /** 从「会话美化」页返回时使用（会话 id） */
  sessionBeautifyReturnSessionId: null,
  /** 从「世界书」页返回时的页面 id，默认 page-homescreen */
  worldbookReturnPage: null,
  /** 进入「世界书」页时仅展示该角色的角色世界书（空则不限制） */
  worldbookCharacterFilterId: null,
  /** 「正则测试」全屏页返回目标 */
  regexTestReturnPage: null,
  /** 进入测试页时预选的规则 { pattern, flags, replacement, label } */
  regexTestInitialRule: null,
  /** 从角色详情/编辑页返回时的页面 id（例如 page-chat） */
  characterEditReturnPage: null,
  /** 从角色详情/编辑页返回时使用（会话 id，用于回到指定聊天会话） */
  characterEditReturnSessionId: null,
  /** 从“我的面具”页返回时跳转的页面 id（例如 page-chat-settings） */
  maskReturnPage: null,
  /** 从“我的面具”页返回时使用（会话 id，用于回到指定会话设置） */
  maskReturnSessionId: null,
  /** 从 ta 的手机/世界线功能页返回时的页面 id（例如 page-chat） */
  taFeatureReturnPage: null,
  /** 从 ta 的手机/世界线功能页返回时使用（会话 id，用于回到指定聊天） */
  taFeatureReturnSessionId: null,
  /** 从论坛返回时跳转的页面 id（例如 page-chat） */
  forumReturnPage: null,
  /** 从论坛返回时使用（会话 id，用于回到指定聊天） */
  forumReturnSessionId: null,
  /** 朋友圈「生图制作」页编辑的朋友圈条目 id */
  momentsImageStudioMomentId: null,
  /** 当前正在编辑的生图记录 id（与 moments.imageStudioActiveRecordId 同步） */
  momentsImageStudioRecordId: null,
  /** 离开生图制作页时返回的页面 id */
  momentsImageStudioReturnPage: null,
  /** 当前是否在编辑「独立生图」记录（不关联朋友圈，数据在 kv） */
  momentsImageStudioStandalone: false,

  // 标记主屏需要刷新（在真正进入主屏时再渲染）
  markHomescreenDirty() {
    this._homescreenDirty = true;
  },
  
  // 切换页面
  switchPage(pageId) {
    if (typeof pageId !== 'string') return;
    let nextId = pageId.trim();
    if (!nextId) return;

    // 兼容：某些旧配置可能只存了 "camera" 这类短 id
    if (!nextId.startsWith('page-')) {
      const guess = 'page-' + nextId;
      if (document.getElementById(guess)) {
        nextId = guess;
      }
    }

    if (['page-shop','page-shop-app-manager','page-wallet','page-takeout','page-ta-phone','page-ta-diary'].includes(nextId)) return;
    if (['page-live','page-share','page-notebook','page-notebook-detail','page-map','page-calendar','page-music','page-music-player','page-widgets','page-settings-beautify-new-widget'].includes(nextId) || nextId.startsWith('page-widget-')) return;
    const fromId = this.currentPage;
    if (fromId === nextId) return;

    // 统一记录“聊天气泡设置”的返回来源：
    // 从主屏图标进入时也能正确返回主屏，而不是误回聊天设置。
    if (nextId === 'page-bubble-settings') {
      this.bubbleSettingsReturnPage = fromId || 'page-homescreen';
    }
    if (nextId === 'page-widgets') {
      // widgetsReturnPage 只用于“从组件列表返回到上一级页面”。
      // 当从 widget 编辑页返回到组件列表时（fromId 形如 page-widget-*-style），不要覆盖原本的返回目标，
      // 否则会出现：组件列表 -> 编辑页 -> 返回列表 -> 再返回仍跳回编辑页的循环问题。
      const isFromWidgetEditor = typeof fromId === 'string' && fromId.startsWith('page-widget-');
      if (!isFromWidgetEditor) {
        this.widgetsReturnPage = fromId || 'page-homescreen';
      }
    }

    const fromPage = document.getElementById(fromId);
    const targetPage = document.getElementById(nextId);
    if (!targetPage) return;

    // 仅对设置相关页面做淡入淡出
    const fadePages = new Set(['page-settings', 'page-settings-api', 'page-settings-image-gen', 'page-settings-theme']);
    const useFade = fadePages.has(fromId) || fadePages.has(pageId);

    // 清理可能残留的动画状态
    if (this._switchTimer) {
      clearTimeout(this._switchTimer);
      this._switchTimer = null;
    }
    document.querySelectorAll('.yd-page').forEach((page) => {
      page.classList.remove('yd-page--transition', 'yd-page--entering', 'yd-page--leaving');
    });

    const updateMusicMiniPlayerVisibility = () => {
      const mini = document.getElementById('music-mini-player');
      if (!mini) return;
      // 只有在音乐页面时显示迷你播放器，其余页面一律隐藏
      mini.hidden = pageId !== 'page-music';
    };

    if (!useFade) {
      // 非设置页：保持原有瞬切逻辑
      document.querySelectorAll('.yd-page').forEach(page => {
        page.classList.remove('yd-page--active');
      });
      targetPage.classList.add('yd-page--active');
      this.currentPage = nextId;
      updateMusicMiniPlayerVisibility();
      // 进入主屏：仅在“有需要”时才重渲染，避免组件闪烁
      if (nextId === 'page-homescreen' && this._homescreenDirty) {
        try {
          if (typeof Homescreen !== 'undefined') {
            if (Homescreen.renderHomescreen) Homescreen.renderHomescreen();
            if (Homescreen.renderDock) Homescreen.renderDock();
            if (Homescreen.loadWallpaper) Homescreen.loadWallpaper();
          }
        } catch (e) {}
        this._homescreenDirty = false;
      }
      // 美化设置页：确保通过任意入口进入时都完成初始化
      if (nextId === 'page-settings-beautify' && typeof Settings !== 'undefined' && Settings.initBeautifySettings) {
        try { Settings.initBeautifySettings(); } catch (e) {}
      }
      try {
        window.dispatchEvent(new CustomEvent('yd:pagechange', { detail: { from: fromId, to: nextId } }));
      } catch (e) {}
      return;
    }

    // 进入淡入淡出：仅保留 from 和 target 为 active，其他直接隐藏
    document.querySelectorAll('.yd-page').forEach((page) => {
      if (page !== fromPage && page !== targetPage) page.classList.remove('yd-page--active');
    });

    if (fromPage) {
      fromPage.classList.add('yd-page--active', 'yd-page--transition', 'yd-page--leaving');
    }
    targetPage.classList.add('yd-page--active', 'yd-page--transition', 'yd-page--entering');

    // 下一帧移除 entering，触发淡入
    requestAnimationFrame(() => {
      targetPage.classList.remove('yd-page--entering');
    });

    // 动画结束后移除离场页面 active
    this._switchTimer = setTimeout(() => {
      if (fromPage) fromPage.classList.remove('yd-page--active', 'yd-page--leaving', 'yd-page--transition');
      targetPage.classList.remove('yd-page--transition');
      this.currentPage = nextId;
      this._switchTimer = null;
      updateMusicMiniPlayerVisibility();
      // 进入主屏：仅在“有需要”时才重渲染，避免组件闪烁
      if (nextId === 'page-homescreen' && this._homescreenDirty) {
        try {
          if (typeof Homescreen !== 'undefined') {
            if (Homescreen.renderHomescreen) Homescreen.renderHomescreen();
            if (Homescreen.renderDock) Homescreen.renderDock();
            if (Homescreen.loadWallpaper) Homescreen.loadWallpaper();
          }
        } catch (e) {}
        this._homescreenDirty = false;
      }
      if (nextId === 'page-settings-beautify' && typeof Settings !== 'undefined' && Settings.initBeautifySettings) {
        try { Settings.initBeautifySettings(); } catch (e) {}
      }
      try {
        window.dispatchEvent(new CustomEvent('yd:pagechange', { detail: { from: fromId, to: nextId } }));
      } catch (e) {}
    }, 200);
  },
  
  // 返回主屏幕
  backToHome() {
    // 仅切回主屏；是否重渲染由 _homescreenDirty 决定（在 switchPage 里统一处理）
    this.switchPage('page-homescreen');
  },
  
  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
};


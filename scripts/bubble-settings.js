// 聊天气泡设置
const BubbleSettings = {
  _styleEl: null,
  _baselineTheme: null,
  _draftTheme: null,
  _dirty: false,
  _baselinePresetId: '',
  _draftPresetId: '',
  _eventsBound: false,
  _hydrating: false,
  _presetsCache: {},
  _toast(message) {
    const msg = String(message || '').trim();
    if (!msg) return;
    try {
      if (typeof Settings !== 'undefined' && Settings && typeof Settings.showToast === 'function') {
        Settings.showToast(msg);
        return;
      }
    } catch (e) {}
    try {
      if (typeof Chat !== 'undefined' && Chat && typeof Chat._toast === 'function') {
        Chat._toast(msg);
        return;
      }
    } catch (e) {}
    try { console.log(msg); } catch (e) {}
  },

  init() {
    try {
      this._ensureStyleElement();
      // 先用默认启动（避免白屏），再从 IndexedDB 异步恢复
      this._hydrating = true;
      this._baselineTheme = this.getDefaultTheme();
      this._draftTheme = { ...this._baselineTheme };
      this._presetsCache = {};
      this.applyThemeToDom(this._baselineTheme);
      this._dirty = false;
      this._baselinePresetId = '';
      this._draftPresetId = '';
      this.setupEvents();
      this._restoreFromIndexedDb();
    } catch (e) {
      console.error('初始化气泡设置失败:', e);
    }
  },

  async _restoreFromIndexedDb() {
    try {
      const presetId = (await Storage.kvGet(CONFIG.STORAGE_KEYS.CURRENT_BUBBLE_PRESET)) || '';
      const theme = (await Storage.kvGet(CONFIG.STORAGE_KEYS.BUBBLE_THEME)) || null;
      const presets = (await Storage.kvGet(CONFIG.STORAGE_KEYS.BUBBLE_PRESETS)) || null;
      // 只允许 IndexedDB：没有就用默认
      const nextTheme = (theme && typeof theme === 'object') ? theme : null;
      const nextPresets = (presets && typeof presets === 'object') ? presets : {};
      const nextPresetId = presetId || '';

      // 恢复缓存，并为旧预设补全缺失的 metaBadge 字段
      this._presetsCache = nextPresets || {};
      let presetsMetaMigrated = false;
      Object.keys(this._presetsCache).forEach((id) => {
        const p = this._presetsCache[id];
        if (!p || !p.theme || typeof p.theme !== 'object') return;
        const before = JSON.stringify(p.theme.metaBadge || null);
        const normalized = this.normalizeTheme(p.theme);
        p.theme.metaBadge = normalized.metaBadge;
        if (JSON.stringify(p.theme.metaBadge) !== before) presetsMetaMigrated = true;
      });
      if (presetsMetaMigrated) this.setPresets(this._presetsCache);

      // 如果用户已经开始编辑，不打断
      if (this._dirty) {
        this._hydrating = false;
        return;
      }

      if (nextTheme) {
        this._baselineTheme = this.normalizeTheme({
          userBg: nextTheme.userBg || '#007AFF',
          userText: nextTheme.userText || '#FFFFFF',
          roleBg: nextTheme.roleBg || '#F0F0F0',
          roleText: nextTheme.roleText || '#000000',
          metaBadge: nextTheme.metaBadge,
          customCss: typeof nextTheme.customCss === 'string' && nextTheme.customCss.trim()
            ? nextTheme.customCss
            : this.getDefaultCssSnippet()
        });
      } else {
        this._baselineTheme = this.getDefaultTheme();
      }

      this._draftTheme = { ...this._baselineTheme };
      this.applyThemeToDom(this._baselineTheme);

      this._baselinePresetId = nextPresetId || '';
      this._draftPresetId = this._baselinePresetId;

      // 如果当前预设存在，用预设 theme 覆盖并应用
      if (this._baselinePresetId) {
        const p = this._presetsCache && this._presetsCache[this._baselinePresetId];
        if (p && p.theme) {
          const t = p.theme;
          const merged = this.normalizeTheme({
            ...this._baselineTheme,
            userBg: t.userBg || this._baselineTheme.userBg,
            userText: t.userText || this._baselineTheme.userText,
            roleBg: t.roleBg || this._baselineTheme.roleBg,
            roleText: t.roleText || this._baselineTheme.roleText,
            metaBadge: t.metaBadge || this._baselineTheme.metaBadge,
            customCss: typeof t.customCss === 'string' ? t.customCss : this._baselineTheme.customCss
          });
          this._baselineTheme = { ...merged };
          this._draftTheme = { ...merged };
          this.applyThemeToDom(merged);
        }
      }

      // 刷新 UI
      this.fillFormFromTheme();
      this.loadPresetsToSelect();
      const sel = document.getElementById('bubble-preset-select');
      if (sel) sel.value = this._baselinePresetId || '';
      this._hydrating = false;
    } catch (e) {
      console.error('从 IndexedDB 恢复气泡设置失败:', e);
      this._hydrating = false;
    }
  },

  _ensureStyleElement() {
    if (this._styleEl && document.head.contains(this._styleEl)) return;
    let el = document.getElementById('yd-bubble-custom-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'yd-bubble-custom-style';
      document.head.appendChild(el);
    }
    this._styleEl = el;
  },

  getDefaultCssSnippet() {
    return [
      '/* =======================================================================',
      '   聊天气泡 · 自定义 CSS 基础模板（可直接改）',
      '',
      '   你可以在这里改到：',
      '   - 气泡（对方/我方）：背景、文字色、圆角、边框、阴影、透明/毛玻璃、动画……',
      '   - 聊天页整体：背景（纯色/渐变/纹理）、全局文字色、标题栏/底栏/输入框……（建议用 #page-chat 作为作用域）',
      '   - 顶栏按钮：左侧返回圆形（#chat-back / .yd-header-btn--circle）、右侧会话菜单胶囊（#chat-menu / .yd-chat-menu-pill）；浅色与 #page-chat[data-bg-tone="dark"] 两套见模板 G 段',
      '   - 顶栏标题位置：可通过 #page-chat .yd-page-header__center / #page-chat .yd-page-header__center.yd-chat-title 的 margin-left 自由调位置（按用户想法调，数值范围不限制）',
      '   - 顶栏图标替换：支持 SVG / 图片链接（url(...) 或 data:image/svg+xml,...），可用伪元素替换原生 svg 图标',
      '   - 顶栏消息红点（返回按钮右侧）：支持背景色、位置、大小、字号、边框、圆角、层级调整（选择器：#page-chat .yd-chat-back-unread-badge）',
      '   - 底部栏：支持改整条底部栏、工具栏图标、输入框、发送按钮（伪发送/真实发送）图标；可改色或用 SVG/图片链接替换',
      '   - 辅助信息：角色名、时间、类型标签',
      '   - 灵感回复卡片样式（协议仍是 [建议回复]，UI 标题显示为“灵感回复”）',
      '',
      '   重要说明：',
      '   1) 这里的 CSS 会注入到页面 <style id="yd-bubble-custom-style">，属于“全局样式”。',
      '      为了避免影响其它页面，推荐尽量使用 #page-chat 作为作用域前缀。',
      '   2) 配色推荐优先用 var(--yd-bubble-*) / var(--yd-chat-*)，这样能和内置颜色/深浅模式更好兼容。',
      '   3) 你完全可以添加新的选择器（比如 .yd-chat-input、.yd-chat-send-btn、.yd-message__avatar、#page-chat .yd-header-btn--circle、#page-chat .yd-chat-menu-pill、.yd-suggested-reply 等），',
      '      只要页面上存在对应 class，就会生效。',
      '   4) #page-chat .yd-chat-input-container 不要加padding,不要动padding这一项',
      '   5) .yd-chat-send-btn尽量不要加填充色，加也只需要加一点点淡饱和度浅色',
      '   6) 若要替换顶栏按钮图标，优先在 #chat-back / #chat-menu 上用 ::before + background:url(...)，原 svg 用 opacity:0 隐藏（可保留点击热区）',
      '   7) 若要替换底部发送按钮图标，建议对 #chat-send 使用 ::before；因为 chat.js 会按“伪发送/真实发送”动态重写按钮内 svg。',
      '   8) 工具栏按钮替换图标请使用真实 id 选择器，不要使用 data-type（本项目没有该属性）。线上可用 id：#chat-model-btn #chat-btn-redpacket #chat-btn-transfer #chat-btn-call #chat-btn-video #chat-btn-sticker #chat-btn-image #chat-btn-gift',
      '   9) 线下工具栏也要用真实 id：#chat-offline-model-btn #chat-offline-regex-btn #chat-offline-worldbook-btn',
      '   10) 发送按钮固定 id 是 #chat-send（不是 data-type）；它会在“伪发送/真实发送”两种图标间动态切换，替换图标建议写在 #chat-send::before 上。',
      '   11) 不要先全局隐藏 .yd-chat-toolbar__btn svg 再慢慢补图标；应按按钮 id 单独替换并单独隐藏，避免“按钮只剩外框”的空白状态。',
      '   ======================================================================= */',
      '',
      '/* =========================',
      '   A. 气泡主体（核心）',
      '   可发挥：背景/渐变、文字色、圆角、边框、阴影、内边距、最大宽度、滤镜',
      '   可读性提醒（很重要）：',
      '   - 气泡 background 和气泡文字 color 不要“同色/同明度”，否则会看不清。',
      '',
      '   常用“想象力扩展”示例（你可自行添加）：',
      '   - background: linear-gradient(...);',
      '   - border: 1px solid rgba(...); / 2px dashed ...;',
      '   - box-shadow: 0 8px 24px rgba(...);',
      '   - backdrop-filter: blur(12px);  (做玻璃态，注意配合半透明背景)',
      '   - filter: saturate(1.1) contrast(1.05);',
      '   - transition: transform .15s ease, box-shadow .15s ease;',
      '   - transform: translateY(-1px);  (配合 :hover/:active 做交互感)',
      '   ========================= */',
      '/* ========== 系统当前默认（与 chat.css 保持一致） ========== */',
      '',
      '/* 消息列表容器（对应 chat.css：.yd-chat-messages/.yd-chat-scroll） */',
      '.yd-chat-messages {',
      '  padding: 16px;',
      '  background: transparent;',
      '  overflow-x: hidden;',
      '}',
      '',
      '.yd-chat-scroll {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 10px;',
      '  max-width: 100%;',
      '}',
      '',
      '/* 单条消息行（对应 chat.css：.yd-message） */',
      '.yd-message {',
      '  display: flex;',
      '  gap: var(--yd-chat-message-gap);',
      '  max-width: 100%;',
      '  box-sizing: border-box;',
      '}',
      '',
      '.yd-message--user {',
      '  align-self: flex-end;',
      '  flex-direction: row-reverse; /* 头像在右，内容在左 */',
      '}',
      '',
      '/* 头像列（对应 chat.css：.yd-message__avatar / __inner / --hidden） */',
      '.yd-message__avatar {',
      '  width: var(--yd-chat-avatar-size);',
      '  height: var(--yd-chat-avatar-size);',
      '  flex-shrink: 0;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '}',
      '',
      '.yd-message__avatar-inner {',
      '  width: var(--yd-chat-avatar-size);',
      '  height: var(--yd-chat-avatar-size);',
      '  border-radius: 50%;',
      '  background: linear-gradient(135deg, #a8c5e6 0%, #b8d4f1 100%);',
      '  color: #333;',
      '  font-size: 14px;',
      '  font-weight: 500;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  overflow: hidden;',
      '}',
      '',
      '.yd-message__avatar--hidden {',
      '  visibility: hidden;',
      '}',
      '',
      '.yd-message__avatar-inner img,',
      '.yd-message__avatar-inner .yd-chat-avatar-img {',
      '  width: 100%;',
      '  height: 100%;',
      '  object-fit: cover;',
      '  border-radius: 50%;',
      '  display: block;',
      '}',
      '',
      '.yd-message__avatar-fallback {',
      '  width: 100%;',
      '  height: 100%;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '}',
      '',
      '/* 消息主体列（对应 chat.css：.yd-message__body） */',
      '.yd-message__body {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 2px;',
      '  /* 最大宽度约束：像即时通讯一样，不能“跨到对侧区域” */',
      '  max-width: min(72%, calc(100% - var(--yd-chat-avatar-slot)));',
      '  /* 关键：让内容按说话方收拢，而不是被 stretch 拉满跨中线 */',
      '  align-items: flex-start;',
      '  box-sizing: border-box;',
      '}',
      '',
      '/* 用户侧：内容整体右对齐（气泡/卡片/分享卡片都遵守） */',
      '.yd-message--user .yd-message__body {',
      '  align-items: flex-end;',
      '}',
      '',
      '/* 气泡/内容区内收：避免贴边（对应 chat.css：margin-right/left avatar-slot） */',
      '.yd-message:not(.yd-message--user) .yd-message__body {',
      '  margin-right: var(--yd-chat-avatar-slot);',
      '}',
      '',
      '.yd-message--user .yd-message__body {',
      '  margin-left: var(--yd-chat-avatar-slot);',
      '}',
      '',
      '/* 气泡主体（对应 chat.css：.yd-message__content） */',
      '.yd-message__content {',
      '  background: var(--yd-bubble-role-bg, #f0f0f0);',
      '  color: var(--yd-bubble-role-text, #000000);',
      '  padding: 6px 12px;',
      '  border-radius: 18px;',
      '  line-height: 1.6;',
      '  word-wrap: break-word;',
      '  overflow-wrap: break-word;',
      '  max-width: 100%;',
      '}',
      '',
      '.yd-message--user .yd-message__content {',
      '  background: var(--yd-bubble-user-bg, #007AFF);',
      '  color: var(--yd-bubble-user-text, #ffffff);',
      '}',
      '',
      '/* 仿即时通讯气泡：靠近说话方的“上角”做直角（对应 chat.css） */',
      '.yd-message:not(.yd-message--user) .yd-message__content {',
      '  border-top-left-radius: 4px;',
      '}',
      '',
      '.yd-message--user .yd-message__content {',
      '  border-top-right-radius: 4px;',
      '}',
      '',
      '/* =========================',
      '   B. 气泡内部文字排版',
      '   可发挥：字号、行高、字重、字距、段落间距、自动换行策略',
      '   - white-space: pre-wrap;   (保留换行；项目里 chat.css 已设置)',
      '   - word-break: break-word; (长单词/链接断行)',
      '   - letter-spacing: 0.2px;  (更“精致”的字面)',
      '   可读性提醒：',
      '   - 当背景较花/较亮时，适当加一点 text-shadow 可以显著提升可读性。',
      '   ========================= */',
      '.yd-message__text {',
      '  font-size: var(--yd-chat-message-font-size, 16px);',
      '  line-height: 1.6;',
      '  /* 可选：',
      '  font-weight: 400;',
      '  letter-spacing: 0.1px;',
      '  text-shadow: 0 1px 0 rgba(255,255,255,0.25);  // 适合浅色背景微浮雕',
      '  */',
      '}',
      '',
      '/* =========================',
      '   C. 气泡旁的元信息（角色名 / 时间 / 类型标签）',
      '   可发挥：颜色、字号、字重、透明度、间距',
      '   可读性提醒：',
      '   - 角色名/时间通常比正文更淡；如果你把聊天背景做成雾白/浅灰，它们会很容易“消失”。',
      '   - 建议优先通过 --yd-chat-meta-fg / --yd-chat-time-fg 统一调深浅。',
      '   ========================= */',
      '.yd-message__name {',
      '  color: var(--yd-chat-meta-fg, #666);',
      '  /* 可选：',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  */',
      '}',
      '',
      '.yd-message__time {',
      '  font-size: 11px;',
      '  color: var(--yd-chat-time-fg, #999);',
      '  margin-top: 5px;',
      '  text-align: center;',
      '}',
      '',
      '.yd-message__type-label {',
      '  color: #999;',
      '}',
      '',
      '.yd-message--user .yd-message__type-label {',
      '  color: rgba(255, 255, 255, 0.7);',
      '}',
      '',
      '/* =========================',
      '   D. 聊天页全局（背景 / 全局色 / 变量）',
      '   可发挥：',
      '   - 全局背景：纯色、渐变、图案纹理（repeating-linear-gradient）、噪点叠加',
      '   - 全局文字色：建议只用于“plain 区域”或页面框架，气泡文字仍以气泡规则为准',
      '   - 变量：统一管理标题/状态/时间/元信息用色，换主题更省心',
      '',
      '   纹理灵感（你可以自己加在 background 上）：',
      '   - repeating-linear-gradient(...) 做格纹/条纹',
      '   - radial-gradient(...) 做光斑',
      '   - 多层 background 叠加：background: layer1, layer2, layer3;',
      '   可读性提醒：',
      '   - 如果你把 #page-chat 背景做得很深或很花，记得同步调整 --yd-chat-title-fg / --yd-chat-status-fg / --yd-chat-meta-fg / --yd-chat-time-fg。',
      '   ========================= */',
      '#page-chat {',
      '  --yd-chat-title-fg: #111;',
      '  --yd-chat-status-fg: rgba(60, 60, 67, 0.72);',
      '  --yd-chat-meta-fg: #666;',
      '  --yd-chat-time-fg: #999;',
      '}',
      '',
      '/* 深色聊天背景时（若页面带 data-bg-tone="dark"）变量覆盖参考',
      '   - 如果你做了很深的背景，建议同步调整这些变量，否则标题/时间可能不清晰',
      '*/',
      '#page-chat[data-bg-tone="dark"] {',
      '  --yd-chat-title-fg: #fff;',
      '  --yd-chat-status-fg: rgba(255, 255, 255, 0.78);',
      '  --yd-chat-meta-fg: rgba(255, 255, 255, 0.8);',
      '  --yd-chat-time-fg: rgba(255, 255, 255, 0.62);',
      '}',
      '',
      '/* =========================',
      '   E. 消息列表容器（滚动区）',
      '   可发挥：背景、内边距、消息之间间距（需要更深入可改 .yd-chat-scroll 的 gap）',
      '   ========================= */',
      '#page-chat > .yd-page-content.yd-chat-messages {',
      '  /* 顶部栏悬浮：消息区需要让出空间（对应 chat.css） */',
      '  padding-top: calc(64px + env(safe-area-inset-top));',
      '  /* 底部输入区覆盖：padding-bottom 由 JS spacer + safe-area 控制 */',
      '  padding-bottom: calc(var(--yd-chat-bottom-pad, 0px) + env(safe-area-inset-bottom));',
      '  box-sizing: border-box;',
      '}',
      '',
      '.yd-chat-messages {',
      '  padding: 16px;',
      '  background: transparent;',
      '}',
      '',
      '/* =========================',
      '   F. 顶部标题区（会话名 / 在线状态 / 火花）',
      '   可发挥：颜色、字重、发光、渐变文字、状态点动画（呼吸/闪烁）',
      '   可读性提醒：',
      '   - 顶栏通常带透明/毛玻璃：如果标题与背景接近同色，会“融进去”。',
      '   - 优先用 --yd-chat-title-fg / --yd-chat-status-fg 管理；必要时给标题加轻微 text-shadow。',
      '   ========================= */',
      '#page-chat .yd-chat-title__name {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: flex-start;',
      '  font-size: 15px;',
      '  font-weight: 800;',
      '  letter-spacing: 0.2px;',
      '  color: var(--yd-chat-title-fg);',
      '}',
      '',
      '#page-chat .yd-chat-title__status {',
      '  color: var(--yd-chat-status-fg, rgba(60, 60, 67, 0.72));',
      '}',
      '',
      '#page-chat .yd-chat-title__dot {',
      '  width: 7px;',
      '  height: 7px;',
      '  border-radius: 999px;',
      '  background: #22c55e;',
      '  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.18);',
      '}',
      '',
      '#page-chat .yd-chat-title__spark {',
      '  color: #f97316;',
      '}',
      '',
      '/* =========================',
      '   G. 顶栏容器 + 顶栏按钮（返回圆形 / 右侧胶囊菜单）',
      '   可发挥：毛玻璃、分割线、渐变、阴影、按钮底色与描边、:active、深色 data-bg-tone 下与背景的对比',
      '   可读性提醒：',
      '   - 顶栏背景越透明，底下消息/背景越容易透出来干扰阅读；可以提高不透明度或加一点 blur。',
      '   - 下方示例与当前工程 settings.css（圆形按钮）+ layout.css（胶囊基础）+ chat.css（聊天顶栏与深色覆盖）一致，便于直接改。',
      '   ========================= */',
      '#page-chat .yd-page-header.yd-settings-nav {',
      '  background: rgba(255, 255, 255, 0.02);',
      '}',
      '',
      '/* 顶栏标题文字（如果你只想改标题色，改这里就够） */',
      '#page-chat .yd-page-header.yd-settings-nav .yd-page-header__center,',
      '#page-chat .yd-page-header.yd-settings-nav .yd-settings-nav__title {',
      '  color: #111827;',
      '}',
      '/* 顶栏标题位置微调：可直接改 margin-left；按用户想法自由设置，范围不限制 */',
      '#page-chat .yd-page-header__center {',
      '  margin-left: 0;',
      '}',
      '#page-chat .yd-page-header__center.yd-chat-title {',
      '  margin-left: 0;',
      '}',
      '',
      '/* 左侧返回 #chat-back：.yd-header-btn.yd-header-btn--circle（与 settings.css 一致） */',
      '#page-chat .yd-header-btn--circle {',
      '  width: 40px;',
      '  height: 40px;',
      '  border-radius: 50%;',
      '  background: rgb(244 244 244 / 83%);',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 0;',
      '  border: 1px solid rgb(255 255 255 / 92%);',
      '  box-shadow: 0 0 12px rgb(213 213 213 / 87%);',
      '  color: #000;',
      '}',
      '',
      '#page-chat .yd-header-btn--circle:active {',
      '  background: rgb(230 230 230 / 85%);',
      '}',
      '',
      '#page-chat .yd-header-btn--circle .yd-settings-back-arrow {',
      '  display: block;',
      '  width: 28px;',
      '  height: 28px;',
      '  margin-left: -2px;',
      '}',
      '',
      '/* 深色聊天背景：圆形返回（chat.css） */',
      '#page-chat[data-bg-tone="dark"] .yd-header-btn--circle {',
      '  width: 40px;',
      '  height: 40px;',
      '  border-radius: 50%;',
      '  background: rgb(244 244 244 / 20%);',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 0;',
      '  border: 1px solid rgb(255 255 255 / 30%);',
      '  box-shadow: 0 0 12px rgb(213 213 213 / 50%);',
      '  color: #000;',
      '}',
      '',
      '/* 右侧 #chat-menu：layout 胶囊 + chat 的 .yd-chat-menu-pill（高度 34px） */',
      '#page-chat .yd-header-btn.yd-header-btn--capsule.yd-chat-menu-pill {',
      '  width: auto;',
      '  min-width: auto;',
      '  height: 34px;',
      '  padding: 0 10px;',
      '  border-radius: 999px;',
      '  background: rgb(244 244 244 / 83%);',
      '  border: 1px solid rgb(255 255 255 / 92%);',
      '  box-shadow: 0 0 12px rgb(213 213 213 / 87%);',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: flex-start;',
      '  gap: 6px;',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  color: #000;',
      '  line-height: 1;',
      '}',
      '',
      '#page-chat .yd-header-btn.yd-header-btn--capsule.yd-chat-menu-pill:active {',
      '  background: rgb(230 230 230 / 85%);',
      '}',
      '',
      '#page-chat .yd-header-btn--menu .yd-chat-menu-icon {',
      '  display: block;',
      '  width: 20px;',
      '  height: 20px;',
      '}',
      '',
      '#page-chat .yd-chat-menu-pill__left {',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  color: #000;',
      '  white-space: nowrap;',
      '}',
      '',
      '#page-chat .yd-chat-menu-pill__divider {',
      '  flex: 0 0 auto;',
      '  width: 1px;',
      '  height: 20px;',
      '  background: rgba(0, 0, 0, 0.08);',
      '}',
      '',
      '#page-chat .yd-chat-menu-pill .yd-chat-menu-icon {',
      '  margin-left: 0;',
      '}',
      '',
      '/* 深色聊天背景：右侧胶囊（chat.css） */',
      '#page-chat[data-bg-tone="dark"] .yd-chat-menu-pill {',
      '  background: rgb(244 244 244 / 20%);',
      '  border: 1px solid rgb(255 255 255 / 30%);',
      '  box-shadow: 0 0 12px rgb(213 213 213 / 50%);',
      '  color: #000;',
      '}',
      '',
      '#page-chat[data-bg-tone="dark"] .yd-chat-menu-pill__left {',
      '  color: #000;',
      '}',
      '',
      '#page-chat[data-bg-tone="dark"] .yd-chat-menu-pill__divider {',
      '  background: rgb(255 255 255 / 30%);',
      '}',
      '',
      '/* 顶栏消息红点（返回按钮右侧）：位置 / 大小 / 颜色 / 字号都可自由改 */',
      '#page-chat .yd-chat-back-unread-badge {',
      '  position: absolute;',
      '  left: 52px;',
      '  top: calc(env(safe-area-inset-top) + 19px);',
      '  min-width: 18px;',
      '  height: 18px;',
      '  padding: 0 5px;',
      '  border-radius: 999px;',
      '  background: #ff3b30;',
      '  color: #fff;',
      '  font-size: 11px;',
      '  line-height: 1;',
      '  font-weight: 700;',
      '  border: 1px solid rgba(255, 255, 255, 0.9);',
      '  box-sizing: border-box;',
      '  z-index: 6;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '}',
      '',
      '/* 图标替换示例（SVG / 图片链接）',
      '   注意：下面示例默认注释，不会生效；按需取消注释再用。',
      '   #page-chat #chat-back { position: relative; }',
      '   #page-chat #chat-back .yd-settings-back-arrow { opacity: 0; }',
      '   #page-chat #chat-back::before {',
      '     content: "";',
      '     width: 22px;',
      '     height: 22px;',
      '     display: block;',
      '     background: center / contain no-repeat url("https://example.com/icons/back.svg");',
      '   }',
      '   #page-chat #chat-menu { position: relative; }',
      '   #page-chat #chat-menu .yd-chat-menu-icon { opacity: 0; }',
      '   #page-chat #chat-menu::before {',
      '     content: "";',
      '     width: 18px;',
      '     height: 18px;',
      '     display: block;',
      '     flex: 0 0 auto;',
      '     background: center / contain no-repeat url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22%3E%3Cpath d=%22M5 12h14M5 6h14M5 18h14%22/%3E%3C/svg%3E");',
      '   }',
      '*/',
      '',
      '/* =========================',
      '   H. 底栏输入区（承载输入框/工具栏的外层）',
      '   可发挥：毛玻璃、渐变、边框、阴影、与背景融为一体的“底部雾化层”',
      '   可读性提醒：',
      '   - 底栏很透明时，输入区会被底下消息“穿透”影响阅读；建议提高底栏背景不透明度或加 blur。',
      '   ========================= */',
      '#page-chat > .yd-page-footer.yd-chat-input-wrapper {',
      '  position: absolute;',
      '  left: 0;',
      '  right: 0;',
      '  bottom: 0;',
      '  z-index: 5;',
      '  background: rgba(255, 255, 255, 0.02);',
      '  backdrop-filter: blur(10px);',
      '  -webkit-backdrop-filter: blur(10px);',
      '  padding: 0 0 14px;',
      '  box-sizing: border-box;',
      '}',
      '',
      '/* 中间内容盒子（对应 chat.css：.yd-chat-input-shell） */',
      '#page-chat .yd-chat-input-shell {',
      '  position: relative;',
      '  width: min(680px, calc(100vw - 20px));',
      '  margin: 0 auto 0;',
      '  padding: 10px 10px 10px;',
      '  box-sizing: border-box;',
      '  border-radius: 16px;',
      '  background: transparent;',
      '  /* 虚线框默认隐藏：border 颜色来自变量，默认 transparent */',
      '  border: 1.5px dashed var(--yd-chat-input-shell-dash-color, transparent);',
      '}',
      '',
      '/* 仅上移内部内容 2px：虚线框位置保持不变（对应 chat.css） */',
      '#page-chat .yd-chat-input-shell .yd-chat-toolbar,',
      '#page-chat .yd-chat-input-shell .yd-chat-offline-toolbar,',
      '#page-chat .yd-chat-input-shell .yd-chat-sticker-strip,',
      '#page-chat .yd-chat-input-shell .yd-chat-input-container {',
      '  position: relative;',
      '  top: -2px;',
      '  transform: none !important;',
      '}',
      '',
      '/* 输入框外层容器（对应 chat.css：.yd-chat-input-container） */',
      '#page-chat .yd-chat-input-container {',
      '  position: relative;',
      '  display: flex;',
      '  align-items: flex-end;',
      '}',
      '',
      '/* 输入框与发送按钮（更细颗粒度）',
      '   - 输入框本体通常是 textarea/input（.yd-chat-input）',
      '   - 发送按钮（.yd-chat-send-btn）可以做成圆形胶囊/发光按钮',
      '   可读性提醒：',
      '   - 输入框文字颜色/光标颜色要和输入框背景有足够对比；必要时显式设置 caret-color。',
      '*/',
      '#page-chat .yd-chat-input {',
      '  flex: 1;',
      '  max-height: calc(1.5em * 3 + 24px);',
      '  padding-right: 44px; /* 仅给发送按钮预留 */',
      '}',
      '',
      '#page-chat .yd-chat-input:focus,',
      '#page-chat .yd-chat-input:focus-visible {',
      '  outline: none;',
      '  border: 1.5px solid rgba(10, 132, 255, 0.95);',
      '  box-shadow: none;',
      '}',
      '',
      '#page-chat .yd-chat-send-btn {',
      '  position: absolute;',
      '  right: 8px;',
      '  bottom: 8px;',
      '  width: 32px;',
      '  height: 32px;',
      '  border-radius: 50%;',
      '  background: transparent;',
      '  border: none;',
      '  color: #333;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  cursor: pointer;',
      '  padding: 0;',
      '  flex-shrink: 0;',
      '}',
      '',
      '/* 底部栏工具栏图标改色示例（默认注释，不生效）',
      '   注意：很多图标是 stroke-only 或 fill-only，强行同时改 fill+stroke 会改变线条观感。',
      '   #page-chat .yd-chat-toolbar__btn svg,',
      '   #page-chat .yd-chat-sticker-strip__add svg {',
      '     color: #333;',
      '   }',
      '   #page-chat .yd-chat-toolbar__btn svg path,',
      '   #page-chat .yd-chat-sticker-strip__add svg path {',
      '     stroke: currentColor;',
      '   }',
      '*/',
      '',
      '/* 发送按钮图标替换示例（默认注释，不生效）',
      '   #page-chat #chat-send {',
      '     position: absolute;',
      '     right: 8px;',
      '     bottom: 8px;',
      '   }',
      '   #page-chat #chat-send > svg {',
      '     opacity: 0;',
      '   }',
      '   #page-chat #chat-send::before {',
      '     content: "";',
      '     width: 20px;',
      '     height: 20px;',
      '     display: block;',
      '     background: center / contain no-repeat url("https://example.com/icons/send.svg");',
      '   }',
      '*/',
      '/* #page-chat #chat-send svg path { fill: #80B7F9; } */',
      '',
      '/* =========================',
      '   I. 建议回复（灵感回复）卡片',
      '   可发挥：卡片底色、边框样式、按钮 hover/active、列表间距',
      '   可读性提醒：',
      '   - 卡片背景越花/越透明，文字就越需要更高对比（更深/更浅）来保证可读。',
      '   ========================= */',
      '#page-chat .yd-suggested-reply {',
      '  width: 240px;',
      '  max-width: 100%;',
      '  /* 主区域：毛玻璃透明底（对应 chat.css） */',
      '  background: rgba(255, 255, 255, 0.14);',
      '  border: 1px solid rgba(255, 255, 255, 0.28);',
      '  border-radius: 14px;',
      '  padding: 10px;',
      '  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.09);',
      '}',
      '',
      '@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {',
      '  #page-chat .yd-suggested-reply {',
      '    backdrop-filter: blur(14px);',
      '    -webkit-backdrop-filter: blur(14px);',
      '  }',
      '}',
      '',
      '#page-chat .yd-suggested-reply__title {',
      '  font-size: 12px;',
      '  color: #6b7280;',
      '  margin-bottom: 8px;',
      '  text-align: left;',
      '}',
      '',
      '#page-chat .yd-suggested-reply__list {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 8px;',
      '}',
      '',
      '#page-chat .yd-suggested-reply__item {',
      '  width: 100%;',
      '  border: 1px solid rgba(0, 122, 255, 0.32);',
      '  background: rgba(240, 247, 255, 0.98);',
      '  color: #0f172a;',
      '  border-radius: 10px;',
      '  text-align: left;',
      '  padding: 8px 10px;',
      '  font-size: 13px;',
      '  line-height: 1.35;',
      '  cursor: pointer;',
      '  backdrop-filter: none;',
      '  -webkit-backdrop-filter: none;',
      '}',
      '',
      '#page-chat .yd-suggested-reply__item:active {',
      '  transform: translateY(1px);',
      '  background: rgba(0, 122, 255, 0.14);',
      '}',
      '',
      '/* =========================',
      '   J. 你可以继续自由扩展（示例）',
      '',
      '   【一些非常实用的美化技巧总结（推荐你复制改造）】',
      '',
      '   0) “先定风格，再定细节”的结构化写法：',
      '      - 先在 .yd-message__content 里统一：圆角、padding、溢出、backdrop-filter',
      '      - 再分别写 角色/我方 的背景与文字色（避免重复）',
      '      - 如果你换了一套风格（例如从“贴纸风”切到“玻璃风”），记得清掉旧伪元素：',
      '        .yd-message__content::before/.after { display:none }',
      '',
      '   1) 低饱和渐变 + “不抢戏”的文字色：',
      '      - 用 very-soft 渐变（to bottom / 135deg）让气泡更“纸感/奶油感”，',
      '        文字用灰褐/雾灰（例如 #686A67）避免脏/刺眼。',
      '      - 经验：渐变两端的亮度差不要太大（否则像塑料）。',
      '',
      '   2) 气泡“尾巴”最自然的方式：',
      '      - 用 ::after 做尾巴，关键点：',
      '        a) position:absolute + 贴近气泡边缘（left:-6px / right:-12px 等）',
      '        b) z-index:-1 把尾巴压到气泡下层（更像一体成型）',
      '        c) clip-path: path(...) 做有机曲线（比三角形高级很多）',
      '        d) transform 微旋转/缩放，让尾巴不“工整”更手作',
      '      - 注意：clip-path path() 兼容性较新；不兼容时可以改用 polygon() 或 SVG 背景图兜底。',
      '',
      '   3) “贴纸/挂件”装饰：',
      '      - 用 ::before/::after 叠加 PNG 贴纸，配合：',
      '        pointer-events:none（避免挡点击）',
      '        z-index:2（压在气泡上层）',
      '        适当 rotate/scale（更自然）',
      '      - 经验：贴纸不要太大；尽量贴角落并留 4~10px 呼吸空间。',
      '',
      '   4) 玻璃态 + 纹理叠加（非常推荐）：',
      '      - backdrop-filter: blur(12px) saturate(120%) 做“玻璃材质”',
      '      - 背景分两层：',
      '        a) linear-gradient(...) 做光照方向',
      '        b) 一个非常淡的 SVG data-url 纹理（例如星芒/格纹），提升质感',
      '      - 叠加 inset 阴影：inset 0 0 20px rgba(255,255,255,0.7) 做“内发光/厚度”。',
      '',
      '   5) “胶囊气泡”+ 白边高光：',
      '      - border-radius: 999px 直接把气泡做成糖果/棉花糖风',
      '      - border: 5px solid #fff 做白边（像贴纸描边）',
      '      - 再用轻微外发光 box-shadow 增加梦幻感',
      '      - 小贴士：胶囊风更适合短句；长句建议把 radius 降一点（例如 18~24）。',
      '',
      '   6) “别让图片/卡片被气泡样式破坏”的兜底（:has 很关键）：',
      '      - 当气泡里只有一张图时，常见需求是：透明背景、无 padding、无尾巴、只保留图片圆角。',
      '      - 例如：.yd-message__content:has(> img:only-child) 可以做很好的“单图气泡”兜底。',
      '      - 同理你也可以对红包/转账/分享卡片做 :has(...) 清理，避免卡片被气泡渐变/贴纸污染。',
      '      - 注意：:has() 在较老浏览器不支持；如果你的运行环境较旧，需要改为在渲染层加 class 来分流。',
      '',
      '   1) 让链接更好看：',
      '      #page-chat .yd-message__text a { color: ...; text-decoration: ...; }',
      '',
      '   2) 让代码块更像“卡片”：',
      '      #page-chat pre, #page-chat code { background: ...; border-radius: ...; }',
      '',
      '   3) 头像与间距（更进阶，可能影响布局）：',
      '      #page-chat .yd-message__avatar { ... }',
      '',
      '   4) 交互反馈（谨慎使用动画，避免眩晕）：',
      '      .yd-message__content { transition: ... }',
      '      .yd-message__content:active { transform: ... }',
      '   ========================= */',
      ''
    ].join('\n');
  },

  // 将草稿/基线主题规范化
  getDefaultMetaBadgeSide(side) {
    const isUser = side === 'user';
    return {
      showTime: true,
      timePosition: isUser ? 'left' : 'right',
      showRead: true,
      readPosition: isUser ? 'left' : 'right'
    };
  },

  _normalizeMetaPosition(pos) {
    const p = String(pos || 'bottom').toLowerCase();
    return ['top', 'bottom', 'left', 'right'].includes(p) ? p : 'bottom';
  },

  getDefaultMetaBadge() {
    return {
      user: { ...this.getDefaultMetaBadgeSide('user') },
      role: { ...this.getDefaultMetaBadgeSide('role') }
    };
  },

  normalizeMetaBadgeSide(raw, side) {
    const def = this.getDefaultMetaBadgeSide(side);
    if (!raw || typeof raw !== 'object') return { ...def };

    const s = raw;
    const legacyPos = s.position;

    let showTime;
    let showRead;
    if (typeof s.showRead === 'boolean' || !('enabled' in s)) {
      showTime = s.showTime !== undefined ? !!s.showTime : def.showTime;
      showRead = s.showRead !== undefined ? !!s.showRead : def.showRead;
    } else {
      showTime = s.showTime !== undefined ? !!s.showTime : (!!s.enabled && def.showTime);
      showRead = s.showRead !== undefined ? !!s.showRead : def.showRead;
    }

    const timePosition =
      s.timePosition !== undefined
        ? this._normalizeMetaPosition(s.timePosition)
        : legacyPos !== undefined
          ? this._normalizeMetaPosition(legacyPos)
          : def.timePosition;
    const readPosition =
      s.readPosition !== undefined
        ? this._normalizeMetaPosition(s.readPosition)
        : legacyPos !== undefined
          ? this._normalizeMetaPosition(legacyPos)
          : def.readPosition;

    return { showTime, timePosition, showRead, readPosition };
  },

  normalizeMetaBadge(raw) {
    const m = raw && typeof raw === 'object' ? raw : {};
    return {
      user: this.normalizeMetaBadgeSide(m.user, 'user'),
      role: this.normalizeMetaBadgeSide(m.role, 'role')
    };
  },

  normalizeTheme(theme) {
    const base = (theme && typeof theme === 'object') ? theme : {};
    return {
      userBg: base.userBg || '#007AFF',
      userText: base.userText || '#FFFFFF',
      roleBg: base.roleBg || '#F0F0F0',
      roleText: base.roleText || '#000000',
      customCss: typeof base.customCss === 'string' ? base.customCss : this.getDefaultCssSnippet(),
      metaBadge: this.normalizeMetaBadge(base.metaBadge)
    };
  },

  getAppliedMetaBadgeSide(isUser) {
    const theme = this.normalizeTheme(this._baselineTheme || this.getDefaultTheme());
    const side = isUser ? 'user' : 'role';
    return theme.metaBadge[side];
  },

  _refreshChatMessagesAfterThemeApply() {
    try {
      if (typeof Chat === 'undefined' || !Chat || !Chat.currentSessionId) return;
      if (typeof Chat.renderMessages !== 'function') return;
      Chat._forceFullRenderNext = true;
      void Chat.renderMessages();
    } catch (e) {}
  },

  applyThemeToDom(theme) {
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty('--yd-bubble-user-bg', theme.userBg);
    root.style.setProperty('--yd-bubble-user-text', theme.userText);
    root.style.setProperty('--yd-bubble-role-bg', theme.roleBg);
    root.style.setProperty('--yd-bubble-role-text', theme.roleText);

    this._ensureStyleElement();
    const css = String(theme.customCss || '').trim();
    if (this._styleEl) {
      this._styleEl.textContent = css
        ? `/* 用户自定义聊天气泡样式 */\n${css}\n`
        : '';
    }
  },

  setupEvents() {
    // 进入页面时填充表单（与绑定事件解耦）
    const hydrate = () => {
      this.fillFormFromTheme();
      this.loadPresetsToSelect();
    };
    document.addEventListener('DOMContentLoaded', hydrate);
    setTimeout(hydrate, 0);

    // 事件绑定：做成“尽量晚绑定 + 只绑定一次”
    const bindOnce = () => {
      if (this._eventsBound) return;

      // 页面返回
      const backBtn = document.getElementById('bubble-settings-back');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          if (this._dirty) {
            const ok = confirm('修改尚未应用，确定要退出吗？');
            if (!ok) return;
            // 放弃未应用的预览效果，恢复为进入页面时的样式
            if (this._baselineTheme) this.applyThemeToDom(this._baselineTheme);
            this._draftTheme = this._baselineTheme ? { ...this._baselineTheme } : this.getDefaultTheme();
            this._draftPresetId = this._baselinePresetId || '';
            this._dirty = false;
            // 恢复 UI 选择
            const sel = document.getElementById('bubble-preset-select');
            if (sel) sel.value = this._baselinePresetId || '';
          }
          const target = State.bubbleSettingsReturnPage || 'page-chat-settings';
          State.bubbleSettingsReturnPage = null;
          State.switchPage(target);
          if (target === 'page-chat' || target === 'page-chat-settings') {
            this._refreshChatMessagesAfterThemeApply();
          }
        });
      }

      // 底部：恢复默认 / 应用
      const resetBtn = document.getElementById('bubble-settings-reset-default');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => this.resetToDefaultDraft(true));
      }

      const applyBtn = document.getElementById('bubble-settings-apply');
      if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
          await this.applyDraftAndSave();
        });
      }

      // 预设：新增 / 操作 / 导入
      const addPresetBtn = document.getElementById('bubble-preset-add');
      if (addPresetBtn) {
        addPresetBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePresetMenu('add', e);
        });
      }

      const presetSelect = document.getElementById('bubble-preset-select');
      if (presetSelect) {
        presetSelect.addEventListener('change', () => this.handleApplyPreset());
      }

      const addManualBtn = document.getElementById('bubble-preset-add-manual');
      if (addManualBtn) {
        addManualBtn.addEventListener('click', () => {
          this.closePresetMenus();
          this.handleSavePreset();
        });
      }

      const addImportBtn = document.getElementById('bubble-preset-add-import');
      const importInput = document.getElementById('bubble-preset-import');
      if (addImportBtn && importInput) {
        addImportBtn.addEventListener('click', () => {
          this.closePresetMenus();
          importInput.click();
        });
        importInput.addEventListener('change', (e) => this.handleImportPreset(e));
      }

      const presetOpsBtn = document.getElementById('bubble-preset-actions');
      if (presetOpsBtn) {
        presetOpsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePresetMenu('ops', e);
        });
      }

      const deletePresetBtn = document.getElementById('bubble-preset-delete');
      if (deletePresetBtn) {
        deletePresetBtn.addEventListener('click', () => {
          this.closePresetMenus();
          this.handleDeletePreset();
        });
      }

      const exportBtn = document.getElementById('bubble-preset-export');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => {
          this.closePresetMenus();
          this.handleExportPreset();
        });
      }

      document.addEventListener('click', () => this.closePresetMenus());

      // 颜色输入变化时：仅更新草稿，并同步到预览
      this.bindColorInputs();

      // 自定义 CSS：输入仅标记为未应用；点击“预览”才应用到页面（但不保存）
      this.bindCustomCssDrafting();
      this.bindCustomCssPreview();
      this.bindCustomCssActions();
      this.bindMetaBadgeInputs();

      this._eventsBound = true;
    };

    document.addEventListener('DOMContentLoaded', bindOnce);
    setTimeout(bindOnce, 0);

    // 立刻尝试一次
    bindOnce();
  },

  bindColorInputs() {
    const bind = (inputId, labelId) => {
      const input = document.getElementById(inputId);
      const label = labelId ? document.getElementById(labelId) : null;
      if (!input) return;
      const update = () => {
        const v = String(input.value || '').toUpperCase();
        if (label) label.textContent = v;
        // 更新草稿，并应用到预览（不保存）
        this._draftTheme = {
          ...(this._draftTheme || this.getDefaultTheme()),
          ...this.readBasicForm()
        };
        // 初始化填充时不算“改动”，避免阻止 IndexedDB 恢复
        if (!this._hydrating) {
          this._dirty = true;
          this.applyThemeToDom(this._draftTheme);
        }
      };
      // 不在绑定时触发 update（避免把默认值当成用户修改）
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    };

    // 背景色：没有文本展示，只需要保存+应用
    bind('bubble-user-bg', null);
    bind('bubble-role-bg', null);
    // 字体色
    bind('bubble-user-text', null);
    bind('bubble-role-text', null);
  },

  bindCustomCssDrafting() {
    const textarea = document.getElementById('bubble-custom-css');
    if (!textarea) return;
    const onChange = () => {
      const customCss = String(textarea.value || '');
      this._draftTheme = {
        ...(this._draftTheme || this.getDefaultTheme()),
        customCss
      };
      if (!this._hydrating) this._dirty = true;
    };
    textarea.addEventListener('input', onChange);
    textarea.addEventListener('change', onChange);
  },

  bindCustomCssPreview() {
    const textarea = document.getElementById('bubble-custom-css');
    const btn = document.getElementById('bubble-custom-preview');
    if (!textarea || !btn) return;

    btn.addEventListener('click', () => {
      const customCss = String(textarea.value || '');
      this._draftTheme = {
        ...(this._draftTheme || this.getDefaultTheme()),
        ...this.readBasicForm(),
        customCss
      };
      this._dirty = true;
      // 预览：应用到页面，但不保存
      this.applyThemeToDom(this._draftTheme);

      // 尝试从 CSS 中解析颜色，反写到颜色选择器
      this.syncColorsFromCss(customCss);
    });
  },

  bindCustomCssActions() {
    const textarea = document.getElementById('bubble-custom-css');
    const clearBtn = document.getElementById('bubble-custom-clear');
    const copyBtn = document.getElementById('bubble-custom-copy');
    if (!textarea) return;

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        textarea.value = '';
        textarea.dispatchEvent(new Event('input'));
        this._toast('已清空');
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const text = String(textarea.value || '');
        if (!text.trim()) {
          this._toast('暂无内容可复制');
          return;
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
          }
          this._toast('已复制');
        } catch (e) {
          console.error('复制自定义 CSS 失败:', e);
          this._toast('复制失败');
        }
      });
    }
  },

  syncColorsFromCss(cssText) {
    if (!cssText || typeof cssText !== 'string') return;
    const css = cssText;

    const extractColor = (selector, property) => {
      const idx = css.indexOf(selector);
      if (idx === -1) return null;
      const sub = css.slice(idx);
      const end = sub.indexOf('}');
      const block = end !== -1 ? sub.slice(0, end) : sub;
      const propRe = new RegExp(property + '\\s*:[^;]*?(#[0-9a-fA-F]{3,8})', 'i');
      const m = block.match(propRe);
      if (m && m[1]) return m[1];
      // 退化：找任意 hex
      const hexRe = /(#[0-9a-fA-F]{3,8})/;
      const m2 = block.match(hexRe);
      return m2 ? m2[1] : null;
    };

    // 角色气泡 block
    const roleBg = extractColor('.yd-message__content', 'background');
    const roleText = extractColor('.yd-message__content', 'color');
    // 我的气泡 block
    const userBg = extractColor('.yd-message--user .yd-message__content', 'background');
    const userText = extractColor('.yd-message--user .yd-message__content', 'color');

    const setIfColor = (id, value) => {
      if (!value) return;
      const el = document.getElementById(id);
      if (!el) return;
      try {
        el.value = value;
      } catch (e) {
        // 某些非法值忽略
      }
    };

    setIfColor('bubble-role-bg', roleBg);
    setIfColor('bubble-role-text', roleText);
    setIfColor('bubble-user-bg', userBg);
    setIfColor('bubble-user-text', userText);

    // 颜色输入的 change 会触发 bindColorInputs 内的逻辑，重新保存并应用颜色变量
    const trigger = (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.dispatchEvent(new Event('change'));
      }
    };
    ['bubble-role-bg', 'bubble-role-text', 'bubble-user-bg', 'bubble-user-text'].forEach(trigger);
  },

  fillFormFromTheme() {
    const theme = this.normalizeTheme(this._draftTheme || this.getDefaultTheme());
    this._draftTheme = { ...theme };
    const userBg = document.getElementById('bubble-user-bg');
    const userText = document.getElementById('bubble-user-text');
    const roleBg = document.getElementById('bubble-role-bg');
    const roleText = document.getElementById('bubble-role-text');
    const cssEl = document.getElementById('bubble-custom-css');

    if (userBg) userBg.value = theme.userBg;
    if (userText) userText.value = theme.userText;
    if (roleBg) roleBg.value = theme.roleBg;
    if (roleText) roleText.value = theme.roleText;
    if (cssEl) cssEl.value = theme.customCss || '';

    const setMetaForm = (prefix, cfg) => {
      const showTimeEl = document.getElementById(`bubble-${prefix}-meta-show-time`);
      const showReadEl = document.getElementById(`bubble-${prefix}-meta-show-read`);
      const timePosEl = document.getElementById(`bubble-${prefix}-meta-time-position`);
      const readPosEl = document.getElementById(`bubble-${prefix}-meta-read-position`);
      const timePosRow = document.getElementById(`bubble-${prefix}-meta-time-pos-row`);
      const readPosRow = document.getElementById(`bubble-${prefix}-meta-read-pos-row`);
      if (showTimeEl) showTimeEl.checked = !!cfg.showTime;
      if (showReadEl) showReadEl.checked = !!cfg.showRead;
      if (timePosEl) timePosEl.value = cfg.timePosition || 'bottom';
      if (readPosEl) readPosEl.value = cfg.readPosition || 'bottom';
      if (timePosRow) {
        if (cfg.showTime) timePosRow.removeAttribute('hidden');
        else timePosRow.setAttribute('hidden', '');
      }
      if (readPosRow) {
        if (cfg.showRead) readPosRow.removeAttribute('hidden');
        else readPosRow.setAttribute('hidden', '');
      }
    };
    setMetaForm('user', theme.metaBadge.user);
    setMetaForm('role', theme.metaBadge.role);
    this.updateBubblePreviewMeta(theme);
  },

  readMetaBadgeForm() {
    const readSide = (prefix) => {
      const showTimeEl = document.getElementById(`bubble-${prefix}-meta-show-time`);
      const showReadEl = document.getElementById(`bubble-${prefix}-meta-show-read`);
      const timePosEl = document.getElementById(`bubble-${prefix}-meta-time-position`);
      const readPosEl = document.getElementById(`bubble-${prefix}-meta-read-position`);
      return this.normalizeMetaBadgeSide({
        showTime: !!(showTimeEl && showTimeEl.checked),
        timePosition: timePosEl ? timePosEl.value : undefined,
        showRead: !!(showReadEl && showReadEl.checked),
        readPosition: readPosEl ? readPosEl.value : undefined
      }, prefix);
    };
    return {
      user: readSide('user'),
      role: readSide('role')
    };
  },

  readBasicForm() {
    const userBg = document.getElementById('bubble-user-bg');
    const userText = document.getElementById('bubble-user-text');
    const roleBg = document.getElementById('bubble-role-bg');
    const roleText = document.getElementById('bubble-role-text');
    return {
      userBg: userBg && userBg.value ? userBg.value : undefined,
      userText: userText && userText.value ? userText.value : undefined,
      roleBg: roleBg && roleBg.value ? roleBg.value : undefined,
      roleText: roleText && roleText.value ? roleText.value : undefined,
      metaBadge: this.readMetaBadgeForm()
    };
  },

  _resolveMetaSlot(configPos, isUser) {
    const p = String(configPos || 'bottom').toLowerCase();
    const norm = ['top', 'bottom', 'left', 'right'].includes(p) ? p : 'bottom';
    if (norm === 'top' || norm === 'bottom') return norm;
    const underAvatar = isUser ? norm === 'right' : norm === 'left';
    return underAvatar ? 'avatarBelow' : 'outerSide';
  },

  _joinPreviewMetaInner(parts, slot) {
    const filtered = parts.filter(Boolean);
    if (!filtered.length) return '';
    if (slot === 'avatarBelow' || slot === 'outerSide') {
      return filtered.map((html) => '<span class="yd-message__meta-line">' + html + '</span>').join('');
    }
    return filtered.join('<span class="yd-message__meta-sep"> · </span>');
  },

  _previewMetaClassForSlot(slot) {
    if (slot === 'avatarBelow') return 'yd-message__meta yd-message__meta--avatar-below';
    if (slot === 'outerSide') return 'yd-message__meta yd-message__meta--outer-side';
    return 'yd-message__meta yd-message__meta--' + slot;
  },

  updateBubblePreviewMeta(theme) {
    const normalized = this.normalizeTheme(theme || this._draftTheme || this.getDefaultTheme());
    const previewTime = (() => {
      try {
        return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return '23:59';
      }
    })();
    const applySlot = (slotEl, slot, inner) => {
      if (!slotEl) return;
      const metaClass = this._previewMetaClassForSlot(slot);
      const isUserHeaderTop =
        slot === 'top' && slotEl.classList.contains('yd-message__meta-row--top');
      if (inner) {
        if (isUserHeaderTop) {
          slotEl.innerHTML =
            '<div class="' + metaClass + '" aria-hidden="true">' + inner + '</div>';
        } else {
          slotEl.className = metaClass;
          slotEl.innerHTML = inner;
          slotEl.setAttribute('aria-hidden', 'true');
        }
        slotEl.removeAttribute('hidden');
      } else {
        if (isUserHeaderTop) {
          slotEl.className = 'yd-message__header yd-message__meta-row--top';
          slotEl.innerHTML = '';
        } else {
          slotEl.removeAttribute('class');
          slotEl.innerHTML = '';
        }
        slotEl.setAttribute('hidden', '');
      }
    };
    const previewSelectorForSlot = (slot, side) => {
      if (slot === 'avatarBelow') return '[data-bubble-preview-meta-avatar="' + side + '"]';
      if (slot === 'outerSide') return '[data-bubble-preview-meta-outer="' + side + '"]';
      return '[data-bubble-preview-meta-' + slot + '="' + side + '"]';
    };
    ['user', 'role'].forEach((side) => {
      const cfg = normalized.metaBadge[side];
      const timePos = cfg.timePosition || 'bottom';
      const readPos = cfg.readPosition || 'bottom';
      const timeInner = cfg.showTime ? '<span class="yd-message__time">' + previewTime + '</span>' : '';
      const readInner = cfg.showRead ? '<span class="yd-message__read">已读</span>' : '';
      const isUser = side === 'user';
      const joinAtSlot = (slot) => {
        const useTime = cfg.showTime && this._resolveMetaSlot(timePos, isUser) === slot;
        const useRead = cfg.showRead && this._resolveMetaSlot(readPos, isUser) === slot;
        if (!useTime && !useRead) return '';
        const parts = isUser
          ? [useRead ? readInner : '', useTime ? timeInner : '']
          : [useTime ? timeInner : '', useRead ? readInner : ''];
        return this._joinPreviewMetaInner(parts, slot);
      };
      ['top', 'bottom', 'avatarBelow', 'outerSide'].forEach((slot) => {
        const slotEl = document.querySelector(previewSelectorForSlot(slot, side));
        applySlot(slotEl, slot, joinAtSlot(slot));
      });
    });
  },

  bindMetaBadgeInputs() {
    const syncMetaPosRows = () => {
      ['user', 'role'].forEach((prefix) => {
        const showTimeEl = document.getElementById(`bubble-${prefix}-meta-show-time`);
        const showReadEl = document.getElementById(`bubble-${prefix}-meta-show-read`);
        const timePosRow = document.getElementById(`bubble-${prefix}-meta-time-pos-row`);
        const readPosRow = document.getElementById(`bubble-${prefix}-meta-read-pos-row`);
        if (timePosRow) {
          if (showTimeEl && showTimeEl.checked) timePosRow.removeAttribute('hidden');
          else timePosRow.setAttribute('hidden', '');
        }
        if (readPosRow) {
          if (showReadEl && showReadEl.checked) readPosRow.removeAttribute('hidden');
          else readPosRow.setAttribute('hidden', '');
        }
      });
    };
    const onChange = () => {
      syncMetaPosRows();
      this._draftTheme = this.normalizeTheme({
        ...(this._draftTheme || this.getDefaultTheme()),
        ...this.readBasicForm()
      });
      if (!this._hydrating) this._dirty = true;
      this.updateBubblePreviewMeta(this._draftTheme);
    };
    [
      'bubble-user-meta-show-time',
      'bubble-user-meta-show-read',
      'bubble-user-meta-time-position',
      'bubble-user-meta-read-position',
      'bubble-role-meta-show-time',
      'bubble-role-meta-show-read',
      'bubble-role-meta-time-position',
      'bubble-role-meta-read-position'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', onChange);
    });
  },

  // ===== 预设管理 =====
  getPresets() {
    return this._presetsCache || {};
  },

  setPresets(presets) {
    this._presetsCache = presets || {};
    // 只使用 IndexedDB：预设变化立即持久化（不阻塞 UI）
    (async () => {
      try {
        await Storage.kvSet(CONFIG.STORAGE_KEYS.BUBBLE_PRESETS, this._presetsCache);
      } catch (e) {
        console.error('持久化气泡预设到 IndexedDB 失败:', e);
      }
    })();
  },

  loadPresetsToSelect() {
    const select = document.getElementById('bubble-preset-select');
    if (!select) return;
    const presets = this.getPresets();
    const currentTheme = this._baselineTheme || this.getDefaultTheme();
    const currentPresetId = this._baselinePresetId || '';

    const currentKey = Object.keys(presets).find((id) => {
      const p = presets[id];
      if (!p || !p.theme) return false;
      const t = p.theme;
      return (
        t.userBg === currentTheme.userBg &&
        t.userText === currentTheme.userText &&
        t.roleBg === currentTheme.roleBg &&
        t.roleText === currentTheme.roleText &&
        String(t.customCss || '') === String(currentTheme.customCss || '')
      );
    }) || '';

    const prev = select.value;

    select.innerHTML = '<option value=\"\">默认</option>';
    Object.keys(presets).forEach((id) => {
      const p = presets[id];
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = p && p.name ? p.name : id;
      if (id === prev || (!prev && (id === currentPresetId || id === currentKey))) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    // 同步草稿选择（不触发 change）
    const nextSelected = select.value || '';
    if (!this._draftPresetId) this._draftPresetId = nextSelected;
  },

  handleSavePreset() {
    const name = prompt('请输入气泡预设名称：');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    // 保存预设：优先保存当前草稿（未应用也可保存为预设）
    const draft = this._draftTheme || this.getDefaultTheme();
    const normalizedDraft = this.normalizeTheme(draft);
    const theme = {
      userBg: normalizedDraft.userBg,
      userText: normalizedDraft.userText,
      roleBg: normalizedDraft.roleBg,
      roleText: normalizedDraft.roleText,
      metaBadge: normalizedDraft.metaBadge,
      customCss: String(normalizedDraft.customCss || '')
    };

    const presets = this.getPresets();
    const id = 'bubble_' + Date.now().toString(36);
    presets[id] = {
      id,
      name: cleanName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      theme
    };
    this.setPresets(presets);
    this.loadPresetsToSelect();
    // 新增预设后，切换到该预设（需要点“应用”才会设为当前预设并生效持久化）
    const select = document.getElementById('bubble-preset-select');
    if (select) select.value = id;
    this._draftPresetId = id;
    this._dirty = true;
    this._toast('气泡预设已保存');
  },

  togglePresetMenu(menuType, anchorEvent = null) {
    const addMenu = document.getElementById('bubble-preset-add-menu');
    const opsMenu = document.getElementById('bubble-preset-ops-menu');
    if (!addMenu || !opsMenu) return;
    if (menuType === 'add') {
      const willOpen = addMenu.hasAttribute('hidden');
      this.closePresetMenus();
      if (willOpen) {
        this.positionAddMenu(addMenu, anchorEvent);
        addMenu.removeAttribute('hidden');
      }
      return;
    }
    if (menuType === 'ops') {
      const willOpen = opsMenu.hasAttribute('hidden');
      this.closePresetMenus();
      if (willOpen) {
        this.positionMenuNearClick(opsMenu, anchorEvent);
        opsMenu.removeAttribute('hidden');
      }
    }
  },

  positionAddMenu(menuEl, anchorEvent) {
    this.positionMenuNearClick(menuEl, anchorEvent);
  },

  positionMenuNearClick(menuEl, anchorEvent) {
    if (!menuEl) return;
    const margin = 8;
    const prevVisibility = menuEl.style.visibility;
    const prevHidden = menuEl.hasAttribute('hidden');
    if (prevHidden) menuEl.removeAttribute('hidden');
    menuEl.style.visibility = 'hidden';
    menuEl.style.left = '0px';
    menuEl.style.top = '0px';

    const rect = menuEl.getBoundingClientRect();
    const menuWidth = Math.max(96, rect.width || 120);
    const menuHeight = Math.max(72, rect.height || 80);
    let x = window.innerWidth - menuWidth - margin;
    let y = 56;
    if (anchorEvent) {
      x = anchorEvent.clientX - menuWidth + 24;
      y = anchorEvent.clientY + 10;
    }
    x = Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin));
    y = Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin));
    menuEl.style.left = x + 'px';
    menuEl.style.top = y + 'px';
    menuEl.style.visibility = prevVisibility || '';
    if (prevHidden) menuEl.setAttribute('hidden', '');
  },

  closePresetMenus() {
    const addMenu = document.getElementById('bubble-preset-add-menu');
    const opsMenu = document.getElementById('bubble-preset-ops-menu');
    if (addMenu && !addMenu.hasAttribute('hidden')) addMenu.setAttribute('hidden', '');
    if (opsMenu && !opsMenu.hasAttribute('hidden')) opsMenu.setAttribute('hidden', '');
  },

  handleDeletePreset() {
    const select = document.getElementById('bubble-preset-select');
    if (!select) return;
    const id = select.value;
    if (!id) {
      this._toast('请先选择一个预设');
      return;
    }
    if (!confirm('确定要删除这个气泡预设吗？')) return;
    const presets = this.getPresets();
    if (!presets[id]) {
      this._toast('预设不存在');
      return;
    }
    delete presets[id];
    this.setPresets(presets);
    this.loadPresetsToSelect();
    this._toast('预设已删除');
  },

  handleApplyPreset() {
    const select = document.getElementById('bubble-preset-select');
    if (!select) return;
    const id = select.value;
    this._draftPresetId = id || '';
    this._dirty = true;
    if (!id) {
      // 选择“默认”：不动现有主题，仅不再绑定某个预设
      return;
    }
    const presets = this.getPresets();
    const preset = presets[id];
    if (!preset || !preset.theme) {
      this._toast('预设不存在或数据无效');
      return;
    }
    // 选择预设：进入草稿并预览，不直接保存（需要点底部“应用”才生效）
    this.setThemeAndRefresh(preset.theme);
  },

  async handleExportPreset() {
    const theme = this._draftTheme || this.getDefaultTheme();
    const data = {
      version: 1,
      type: 'bubble_theme',
      exportedAt: new Date().toISOString(),
      theme
    };
    const json = JSON.stringify(data);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const filename = 'bubble-theme-' + new Date().toISOString().slice(0, 10) + '.json';
      await Storage.downloadBlobWithWait(blob, filename, '正在导出预设…');
    } catch (e) {
      console.error('导出气泡预设失败:', e);
    }
  },

  async handleImportPreset(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || data.type !== 'bubble_theme' || !data.theme) {
        this._toast('预设文件格式不正确');
        input.value = '';
        return;
      }
      const name = prompt('为导入的气泡预设取一个名字：', file.name.replace(/\.json$/i, ''));
      const cleanName = (name && name.trim()) || '导入预设';

      const presets = this.getPresets();
      const id = 'bubble_' + Date.now().toString(36);
      presets[id] = {
        id,
        name: cleanName,
        importedAt: Date.now(),
        theme: data.theme
      };
      this.setPresets(presets);
      this.setThemeAndRefresh(data.theme);
      // 导入后切换到该预设（需要点“应用”确认）
      const select = document.getElementById('bubble-preset-select');
      if (select) select.value = id;
      this._draftPresetId = id;
      this._dirty = true;
      this._toast('气泡预设已导入');
    } catch (err) {
      console.error('导入气泡预设失败:', err);
      this._toast('导入失败，请检查文件格式');
    } finally {
      input.value = '';
    }
  },

  setThemeAndRefresh(theme) {
    // 仅作为草稿切换并预览，不直接保存
    this._draftTheme = this.normalizeTheme({
      ...(this._draftTheme || this.getDefaultTheme()),
      ...(theme || {}),
      metaBadge: (theme && theme.metaBadge) ? theme.metaBadge : (this._draftTheme || {}).metaBadge
    });
    this._dirty = true;
    this.applyThemeToDom(this._draftTheme);
    this.fillFormFromTheme();
    this.loadPresetsToSelect();
  },

  getDefaultTheme() {
    return this.normalizeTheme({
      userBg: '#007AFF',
      userText: '#FFFFFF',
      roleBg: '#F0F0F0',
      roleText: '#000000',
      metaBadge: this.getDefaultMetaBadge(),
      customCss: this.getDefaultCssSnippet()
    });
  },

  resetToDefaultDraft(alsoPreview = false) {
    const def = this.getDefaultTheme();
    this._draftTheme = { ...def };
    this._dirty = true;
    this.fillFormFromTheme();
    if (alsoPreview) {
      this.applyThemeToDom(this._draftTheme);
    }
  },

  async applyDraftAndSave() {
    const theme = this.normalizeTheme(this._draftTheme || this.getDefaultTheme());
    const merged = this.normalizeTheme(theme);

    // 如果当前选中了某个预设：将当前设置写回该预设
    const presetId = this._draftPresetId || (document.getElementById('bubble-preset-select')?.value || '');
    if (presetId) {
      const presets = this.getPresets();
      if (presets[presetId]) {
        presets[presetId] = {
          ...presets[presetId],
          updatedAt: Date.now(),
          theme: {
            userBg: merged.userBg,
            userText: merged.userText,
            roleBg: merged.roleBg,
            roleText: merged.roleText,
            metaBadge: merged.metaBadge,
            customCss: String(merged.customCss || '')
          }
        };
        this.setPresets(presets);
        this._baselinePresetId = presetId;
      }
    } else {
      this._baselinePresetId = '';
    }

    // 持久化到 IndexedDB（避免刷新丢失）
    // 这里不使用 localStorage，全部走 IndexedDB，并等待写入完成
    try {
      await Storage.kvSet(CONFIG.STORAGE_KEYS.BUBBLE_THEME, merged);
      await Storage.kvSet(CONFIG.STORAGE_KEYS.BUBBLE_PRESETS, this.getPresets());
      await Storage.kvSet(CONFIG.STORAGE_KEYS.CURRENT_BUBBLE_PRESET, this._baselinePresetId || '');
    } catch (e) {
      console.error('持久化气泡设置到 IndexedDB 失败:', e);
      this._toast('应用失败：无法写入本地数据库');
      return;
    }

    // 全局生效（所有会话气泡共用这套变量/style）
    this.applyThemeToDom(merged);
    this._baselineTheme = { ...merged };
    this._draftTheme = { ...merged };
    this._draftPresetId = this._baselinePresetId || '';
    this._dirty = false;
    this.loadPresetsToSelect();
    this._toast('已应用');
    this._refreshChatMessagesAfterThemeApply();
  },

  /**
   * 程序化：把一段 AI 给出的 ```css ... ```（不包含围栏）当作“新增预设的 customCss”，并立即应用到页面。
   * 用于聊天页自动检测到 ```css``` 后的“一键替换气泡样式”。
   *
   * @param {string} customCssText
   * @param {string} [presetName]
   * @returns {Promise<string|null>} presetId
   */
  async applyCustomCssAsNewPreset(customCssText, presetName = '') {
    const css = String(customCssText || '').trim();
    if (!css) return null;

    const genSuffix3 = () => {
      const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
      let out = '';
      for (let i = 0; i < 3; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
      return out;
    };

    const sanitizeCss = (s) => {
      // style 标签使用 textContent，不会当 HTML 执行；这里主要是防止明显的破坏性语句
      return String(s || '')
        .replace(/<\/style\s*>/gi, '')
        .replace(/<!--/g, '')
        .replace(/-->/g, '')
        .replace(/@import\s+[^;]+;/gi, '')
        .replace(/\burl\s*\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, _q, rawUrl) => {
          const u = String(rawUrl || '').trim();
          if (!u) return 'url()';
          // 仅拦截明显危险协议，保留 http(s)/data:image 等资源链接
          if (/^(javascript:|vbscript:|data:text\/html)/i.test(u)) return 'url()';
          return `url("${u.replace(/"/g, '\\"')}")`;
        })
        .trim();
    };

    const extractColor = (cssText, selector, property) => {
      const idx = cssText.indexOf(selector);
      if (idx === -1) return null;
      const sub = cssText.slice(idx);
      const end = sub.indexOf('}');
      const block = end !== -1 ? sub.slice(0, end) : sub;

      // 只提取 hex（与现有 syncColorsFromCss 一致），提取不到就保持当前颜色变量。
      const propRe = new RegExp(property + '\\s*:\\s*[^;]*?(#[0-9a-fA-F]{3,8})', 'i');
      const m = block.match(propRe);
      if (m && m[1]) return m[1];

      const hexRe = /(#[0-9a-fA-F]{3,8})/;
      const m2 = block.match(hexRe);
      return m2 ? m2[1] : null;
    };

    const baseTheme = this._baselineTheme || this.getDefaultTheme();
    const safeCss = sanitizeCss(css);

    // 尝试从 customCss 反推颜色变量（让 var() 路径也能按 AI 的颜色生效）
    const roleBg = extractColor(safeCss, '.yd-message__content', 'background') || null;
    const roleText = extractColor(safeCss, '.yd-message__content', 'color') || null;
    const userBg = extractColor(safeCss, '.yd-message--user .yd-message__content', 'background') || null;
    const userText = extractColor(safeCss, '.yd-message--user .yd-message__content', 'color') || null;

    const theme = this.normalizeTheme({
      userBg: userBg || baseTheme.userBg,
      userText: userText || baseTheme.userText,
      roleBg: roleBg || baseTheme.roleBg,
      roleText: roleText || baseTheme.roleText,
      metaBadge: baseTheme.metaBadge,
      customCss: safeCss
    });

    const presets = this.getPresets();
    const id = 'bubble_' + Date.now().toString(36);
    const cleanName = String(presetName || '').trim();
    const displayName = cleanName
      ? `${cleanName}-${genSuffix3()}`
      : id;
    presets[id] = {
      id,
      name: displayName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      theme
    };
    this.setPresets(presets);

    // 立即应用到页面（全局共享气泡样式）
    this._baselinePresetId = id;
    this._draftPresetId = id;
    this._baselineTheme = { ...theme };
    this._draftTheme = { ...theme };
    this._dirty = false;
    this.applyThemeToDom(theme);

    // 持久化：确保下次进入仍是该预设
    try {
      await Storage.kvSet(CONFIG.STORAGE_KEYS.BUBBLE_THEME, this.normalizeTheme(theme));
      await Storage.kvSet(CONFIG.STORAGE_KEYS.BUBBLE_PRESETS, this.getPresets());
      await Storage.kvSet(CONFIG.STORAGE_KEYS.CURRENT_BUBBLE_PRESET, id);
    } catch (e) {
      console.error('自动应用气泡预设持久化失败:', e);
    }

    // 刷新设置页下拉（不依赖当前是否在该页）
    try {
      this.loadPresetsToSelect();
      this.fillFormFromTheme();
      const sel = document.getElementById('bubble-preset-select');
      if (sel) sel.value = id;
    } catch (e) {}

    return id;
  }
};


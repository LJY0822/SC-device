// 会话美化（聊天头像大小 / 字体大小）
const SessionBeautify = {
  defaults: {
    avatarSize: 36,
    fontSize: 14,
    quoteBeautifyEnabled: true,
    quoteBeautifyCss: 'background: linear-gradient(90deg, #ff6db9 0%, #ffb16c 35%, #ff7ab0 68%, #ffab8e 100%); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: 700;',
    quoteBeautifyTextColor: '#000000'
  },
  _chatModalEl: null,
  _styleEl: null,

  init() {
    this.applyFromStorage();
    this.setupEvents();
  },

  setupEvents() {
    const backBtn = document.getElementById('session-beautify-back');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        const returnPage = State.sessionBeautifyReturnPage;
        const returnSid = State.sessionBeautifyReturnSessionId;
        State.sessionBeautifyReturnPage = null;
        State.sessionBeautifyReturnSessionId = null;
        if (returnPage === 'page-chat' && returnSid) {
          try {
            if (typeof Chat !== 'undefined' && Chat.openSession) {
              await Chat.openSession(returnSid);
              return;
            }
          } catch (e) {}
          try {
            State.switchPage('page-chat');
            return;
          } catch (e2) {}
        }
        if (returnPage) {
          try {
            State.switchPage(returnPage);
            return;
          } catch (e3) {}
        }
        State.backToHome();
      });
    }

    const avatarInput = document.getElementById('session-avatar-size');
    const fontInput = document.getElementById('session-font-size');
    const quoteEnabledInput = document.getElementById('session-quote-beautify-enabled');
    const quoteCssInput = document.getElementById('session-quote-beautify-css');
    const quoteTextColorInput = document.getElementById('session-quote-beautify-text-color');
    const resetBtn = document.getElementById('session-beautify-reset');
    const applyBtn = document.getElementById('session-beautify-apply');
    const avatarLabel = document.getElementById('session-avatar-size-label');
    const fontLabel = document.getElementById('session-font-size-label');
    const syncForm = this.bindRangeControls({
      avatarInput,
      fontInput,
      quoteEnabledInput,
      quoteCssInput,
      quoteTextColorInput,
      avatarLabel,
      fontLabel
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.applyToDom(
          this.defaults.avatarSize,
          this.defaults.fontSize,
          this.defaults.quoteBeautifyEnabled,
          this.defaults.quoteBeautifyCss,
          this.defaults.quoteBeautifyTextColor
        );
        this.saveSettings(
          this.defaults.avatarSize,
          this.defaults.fontSize,
          this.defaults.quoteBeautifyEnabled,
          this.defaults.quoteBeautifyCss,
          this.defaults.quoteBeautifyTextColor
        );
        syncForm();
        this._toast('已恢复默认');
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const current = this.getCurrentSettings();
        this.applyToDom(
          current.avatarSize,
          current.fontSize,
          current.quoteBeautifyEnabled,
          current.quoteBeautifyCss,
          current.quoteBeautifyTextColor
        );
        this.saveSettings(
          current.avatarSize,
          current.fontSize,
          current.quoteBeautifyEnabled,
          current.quoteBeautifyCss,
          current.quoteBeautifyTextColor
        );
        this._toast('已应用');
      });
    }

    window.addEventListener('yd:pagechange', (e) => {
      const to = e && e.detail ? e.detail.to : '';
      if (to === 'page-session-beautify') {
        syncForm();
      }
    });

    setTimeout(syncForm, 0);
  },

  _toast(message) {
    const msg = String(message || '').trim();
    if (!msg) return;
    try {
      if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') {
        Chat._toast(msg);
        return;
      }
    } catch (e) {}
    try {
      // 兜底：不阻塞，不报错
      console.log('[session-beautify]', msg);
    } catch (e2) {}
  },

  applyFromStorage() {
    const current = this.getCurrentSettings();
    this.ensureStyleElement();
    this.applyToDom(
      current.avatarSize,
      current.fontSize,
      current.quoteBeautifyEnabled,
      current.quoteBeautifyCss,
      current.quoteBeautifyTextColor
    );
  },

  getCurrentSettings() {
    const avatarRaw = Storage.get(CONFIG.STORAGE_KEYS.CHAT_AVATAR_SIZE);
    const fontRaw = Storage.get(CONFIG.STORAGE_KEYS.CHAT_FONT_SIZE);
    const quoteEnabledRaw = Storage.get(CONFIG.STORAGE_KEYS.CHAT_QUOTE_BEAUTIFY_ENABLED);
    const quoteCssRaw = Storage.get(CONFIG.STORAGE_KEYS.CHAT_QUOTE_BEAUTIFY_CSS);
    const quoteTextColorRaw = Storage.get(CONFIG.STORAGE_KEYS.CHAT_QUOTE_BEAUTIFY_TEXT_COLOR);
    const enabled =
      quoteEnabledRaw == null
        ? this.defaults.quoteBeautifyEnabled
        : (String(quoteEnabledRaw) === '1' || String(quoteEnabledRaw).toLowerCase() === 'true');
    const quoteCss = this._normalizeQuoteCssText(quoteCssRaw || this.defaults.quoteBeautifyCss);
    const quoteTextColor = this._normalizeFontColorText(quoteTextColorRaw || this.defaults.quoteBeautifyTextColor);
    return {
      avatarSize: this.clamp(avatarRaw, 28, 56, this.defaults.avatarSize),
      fontSize: this.clamp(fontRaw, 12, 20, this.defaults.fontSize),
      quoteBeautifyEnabled: enabled,
      quoteBeautifyCss: quoteCss,
      quoteBeautifyTextColor: quoteTextColor
    };
  },

  updateLabels(settings) {
    const avatarLabel = document.getElementById('session-avatar-size-label');
    const fontLabel = document.getElementById('session-font-size-label');
    if (avatarLabel) avatarLabel.textContent = `${settings.avatarSize}px`;
    if (fontLabel) fontLabel.textContent = `${settings.fontSize}px`;
  },

  bindRangeControls({ avatarInput, fontInput, quoteEnabledInput, quoteCssInput, quoteTextColorInput, avatarLabel, fontLabel }) {
    const updateLabels = (settings) => {
      if (avatarLabel) avatarLabel.textContent = `${settings.avatarSize}px`;
      if (fontLabel) fontLabel.textContent = `${settings.fontSize}px`;
    };
    const sync = () => {
      const current = this.getCurrentSettings();
      if (avatarInput) avatarInput.value = String(current.avatarSize);
      if (fontInput) fontInput.value = String(current.fontSize);
      if (quoteEnabledInput) quoteEnabledInput.checked = !!current.quoteBeautifyEnabled;
      if (quoteCssInput) quoteCssInput.value = String(current.quoteBeautifyCss || '');
      if (quoteTextColorInput) quoteTextColorInput.value = String(current.quoteBeautifyTextColor || this.defaults.quoteBeautifyTextColor);
      updateLabels(current);
    };

    if (avatarInput) {
      avatarInput.addEventListener('input', () => {
        const size = this.clamp(avatarInput.value, 28, 56, this.defaults.avatarSize);
        this.applyToDom(size, null);
        this.saveSettings(size, null);
        updateLabels({ avatarSize: size, fontSize: this.getCurrentSettings().fontSize });
      });
    }
    if (fontInput) {
      fontInput.addEventListener('input', () => {
        const size = this.clamp(fontInput.value, 12, 20, this.defaults.fontSize);
        this.applyToDom(null, size);
        this.saveSettings(null, size);
        updateLabels({ avatarSize: this.getCurrentSettings().avatarSize, fontSize: size });
      });
    }
    if (quoteEnabledInput) {
      quoteEnabledInput.addEventListener('change', () => {
        const enabled = !!quoteEnabledInput.checked;
        this.applyToDom(null, null, enabled, null, null);
        this.saveSettings(null, null, enabled, null, null);
      });
    }
    if (quoteCssInput) {
      const onQuoteCssInput = () => {
        const css = this._normalizeQuoteCssText(quoteCssInput.value || this.defaults.quoteBeautifyCss);
        this.applyToDom(null, null, null, css, null);
        this.saveSettings(null, null, null, css, null);
      };
      quoteCssInput.addEventListener('input', onQuoteCssInput);
      quoteCssInput.addEventListener('change', onQuoteCssInput);
    }

    if (quoteTextColorInput) {
      const onQuoteTextColorInput = () => {
        const c = this._normalizeFontColorText(quoteTextColorInput.value || this.defaults.quoteBeautifyTextColor);
        this.applyToDom(null, null, null, null, c);
        this.saveSettings(null, null, null, null, c);
      };
      quoteTextColorInput.addEventListener('input', onQuoteTextColorInput);
      quoteTextColorInput.addEventListener('change', onQuoteTextColorInput);
    }
    return sync;
  },

  openChatModal() {
    this.closeChatModal();
    const current = this.getCurrentSettings();
    const overlay = document.createElement('div');
    overlay.className = 'yd-session-beautify-modal';
    overlay.innerHTML = `
      <div class="yd-session-beautify-modal__backdrop" data-act="close"></div>
      <div class="yd-session-beautify-modal__panel">
        <button type="button" class="yd-session-beautify-modal__close" data-act="close" aria-label="关闭">×</button>
        <div class="yd-session-beautify-modal__title">会话美化</div>
        <div class="yd-session-beautify-item">
          <div class="yd-session-beautify-item__head">
            <span>头像大小</span>
            <span id="yd-session-beautify-modal-avatar-label">${current.avatarSize}px</span>
          </div>
          <input type="range" id="yd-session-beautify-modal-avatar" min="28" max="56" step="1" value="${current.avatarSize}">
        </div>
        <div class="yd-session-beautify-item">
          <div class="yd-session-beautify-item__head">
            <span>字体大小</span>
            <span id="yd-session-beautify-modal-font-label">${current.fontSize}px</span>
          </div>
          <input type="range" id="yd-session-beautify-modal-font" min="12" max="20" step="1" value="${current.fontSize}">
        </div>
        <div class="yd-session-beautify-modal__more" data-act="more" role="button" tabindex="0" aria-label="更多设置">
          更多设置
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._chatModalEl = overlay;

    const avatarInput = overlay.querySelector('#yd-session-beautify-modal-avatar');
    const fontInput = overlay.querySelector('#yd-session-beautify-modal-font');
    const avatarLabel = overlay.querySelector('#yd-session-beautify-modal-avatar-label');
    const fontLabel = overlay.querySelector('#yd-session-beautify-modal-font-label');
    this.bindRangeControls({ avatarInput, fontInput, avatarLabel, fontLabel });

    overlay.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-act') === 'close') {
        this.closeChatModal();
        return;
      }
      if (t && t.getAttribute && t.getAttribute('data-act') === 'more') {
        this.closeChatModal();
        try {
          const sid =
            (typeof Chat !== 'undefined' && Chat.currentSessionId) ||
            Storage.get(CONFIG.STORAGE_KEYS.CURRENT_SESSION) ||
            null;
          State.sessionBeautifyReturnPage = 'page-chat';
          State.sessionBeautifyReturnSessionId = sid ? String(sid) : null;
        } catch (e3) {}
        try { State.switchPage('page-session-beautify'); } catch (e2) {}
      }
    });

    overlay.addEventListener('keydown', (e) => {
      const key = e.key;
      if (key !== 'Enter' && key !== ' ') return;
      const t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-act') !== 'more') return;
      e.preventDefault();
      this.closeChatModal();
      try {
        const sid =
          (typeof Chat !== 'undefined' && Chat.currentSessionId) ||
          Storage.get(CONFIG.STORAGE_KEYS.CURRENT_SESSION) ||
          null;
        State.sessionBeautifyReturnPage = 'page-chat';
        State.sessionBeautifyReturnSessionId = sid ? String(sid) : null;
      } catch (e3) {}
      try { State.switchPage('page-session-beautify'); } catch (e2) {}
    });
  },

  closeChatModal() {
    if (this._chatModalEl && this._chatModalEl.parentNode) {
      this._chatModalEl.parentNode.removeChild(this._chatModalEl);
    }
    this._chatModalEl = null;
  },

  saveSettings(avatarSize, fontSize, quoteBeautifyEnabled, quoteBeautifyCss, quoteBeautifyTextColor) {
    if (typeof avatarSize === 'number') {
      Storage.set(CONFIG.STORAGE_KEYS.CHAT_AVATAR_SIZE, avatarSize);
    }
    if (typeof fontSize === 'number') {
      Storage.set(CONFIG.STORAGE_KEYS.CHAT_FONT_SIZE, fontSize);
    }
    if (typeof quoteBeautifyEnabled === 'boolean') {
      Storage.set(CONFIG.STORAGE_KEYS.CHAT_QUOTE_BEAUTIFY_ENABLED, quoteBeautifyEnabled ? '1' : '0');
    }
    if (typeof quoteBeautifyCss === 'string') {
      Storage.set(CONFIG.STORAGE_KEYS.CHAT_QUOTE_BEAUTIFY_CSS, this._normalizeQuoteCssText(quoteBeautifyCss));
    }
    if (typeof quoteBeautifyTextColor === 'string') {
      Storage.set(CONFIG.STORAGE_KEYS.CHAT_QUOTE_BEAUTIFY_TEXT_COLOR, this._normalizeFontColorText(quoteBeautifyTextColor));
    }
  },

  applyToDom(avatarSize, fontSize, quoteBeautifyEnabled, quoteBeautifyCss, quoteBeautifyTextColor) {
    const root = document.documentElement;
    if (!root) return;
    this.ensureStyleElement();
    const current = this.getCurrentSettings();
    const enabled =
      typeof quoteBeautifyEnabled === 'boolean' ? quoteBeautifyEnabled : !!current.quoteBeautifyEnabled;
    const quoteCss =
      typeof quoteBeautifyCss === 'string'
        ? this._normalizeQuoteCssText(quoteBeautifyCss)
        : this._normalizeQuoteCssText(current.quoteBeautifyCss || this.defaults.quoteBeautifyCss);
    const fontColor =
      typeof quoteBeautifyTextColor === 'string'
        ? this._normalizeFontColorText(quoteBeautifyTextColor)
        : this._normalizeFontColorText(current.quoteBeautifyTextColor || this.defaults.quoteBeautifyTextColor);
    if (typeof avatarSize === 'number') {
      root.style.setProperty('--yd-chat-avatar-size', `${avatarSize}px`);
    }
    if (typeof fontSize === 'number') {
      root.style.setProperty('--yd-chat-message-font-size', `${fontSize}px`);
    }
    // 兜底：避免被其它动态样式（如聊天气泡自定义 CSS）覆盖
    if (this._styleEl) {
      this._styleEl.textContent = [
        '.yd-message__avatar, .yd-message__avatar-inner {',
        '  width: var(--yd-chat-avatar-size) !important;',
        '  height: var(--yd-chat-avatar-size) !important;',
        '}',
        // “正文部分”颜色：同时作用于 plain markdown 与阅读设置页的气泡预览正文
        '.yd-message__plain--md,',
        '.yd-message--memory,',
        '#page-session-beautify #yd-session-text-preview {',
        `  color: ${fontColor} !important;`,
        '}',
        '.yd-message__text,',
        '.yd-message__plain,',
        '.yd-message__plain--md,',
        '.yd-message__plain--md p,',
        '.yd-message__content {',
        '  font-size: var(--yd-chat-message-font-size) !important;',
        '}',
        '.yd-quote-beautify {',
        enabled ? `  ${quoteCss}` : '  color: inherit; background: none; -webkit-background-clip: initial; background-clip: initial; font-weight: inherit;',
        '}'
      ].join('\n');
    }
  },

  _normalizeQuoteCssText(cssText) {
    const s = String(cssText || '').trim();
    const fallback = this.defaults.quoteBeautifyCss;
    if (!s) return fallback;
    // 仅允许 style 声明体，去掉大括号，避免破坏整段 style 注入。
    return s.replace(/[{}<>]/g, '').trim() || fallback;
  },

  _normalizeFontColorText(colorText) {
    const s = String(colorText || '').trim();
    const fallback = this.defaults.quoteBeautifyTextColor;
    if (!s) return fallback;
    // 防止注入：移除可能破坏 CSS 结构的符号
    const cleaned = s.replace(/[{};]/g, '').trim();
    return cleaned || fallback;
  },

  ensureStyleElement() {
    if (this._styleEl && document.head.contains(this._styleEl)) return;
    let el = document.getElementById('yd-session-beautify-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'yd-session-beautify-style';
      document.head.appendChild(el);
    }
    this._styleEl = el;
  },

  clamp(value, min, max, fallback) {
    if (value == null) return fallback;
    if (typeof value === 'string' && !value.trim()) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }
};


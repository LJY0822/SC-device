// 全局回复风格（所有会话聊天框共用）
const ReplyStyle = {
  defaults: {},
  defaultMode: 'lively',
  _chatModalEl: null,

  init() {
    this.applyFromStorage();
    this._syncSettingsValueLabel();
  },

  _storageKey() {
    return (
      (typeof CONFIG !== 'undefined' &&
        CONFIG.STORAGE_KEYS &&
        CONFIG.STORAGE_KEYS.CHAT_REPLY_STYLE) ||
      'chat_reply_style_global'
    );
  },

  _readStoredPayload() {
    const raw = typeof Storage !== 'undefined' && Storage.get ? Storage.get(this._storageKey()) : null;
    if (raw == null) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return null;
    try {
      let parsed = JSON.parse(raw);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e2) {
          return null;
        }
      }
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  },

  getSettings() {
    const parsed = this._readStoredPayload();
    return parsed ? parsed : { ...this.defaults };
  },

  _getStoredMode() {
    const parsed = this._readStoredPayload();
    const mode = String(parsed?.mode || '').trim();
    if (mode === 'lively' || mode === 'canon') return mode;
    return null;
  },

  hasUserSelection() {
    return !!this._getStoredMode();
  },

  getMode() {
    const mode = this._getStoredMode();
    if (mode) return mode;
    return this.defaultMode === 'canon' ? 'canon' : 'lively';
  },

  saveSettings(data) {
    const raw = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const next = {
      mode: raw.mode === 'lively' ? 'lively' : 'canon'
    };
    if (typeof Storage !== 'undefined' && Storage.set) {
      Storage.set(this._storageKey(), next);
    }
    this.applyFromStorage();
    this._syncSettingsValueLabel();
  },

  getDisplaySummary() {
    return this.getMode() === 'lively' ? '活人感优先' : '原设定优先';
  },

  applyFromStorage() {
    const settings = this.getSettings();
    const mode = this.getMode();
    try {
      document.documentElement?.setAttribute('data-yd-reply-style', mode);
    } catch (e) {}
    try {
      document.dispatchEvent(
        new CustomEvent('yd-reply-style-changed', { detail: settings })
      );
    } catch (e2) {}
  },

  _syncSettingsValueLabel() {
    const el = document.getElementById('yd-chat-settings-reply-style-value');
    if (el) el.textContent = this.getDisplaySummary();
  },

  openChatModal(opts = {}) {
    this.closeChatModal();
    const forceSelect = !!opts.forceSelect;
    const currentMode = this.getMode();
    const overlay = document.createElement('div');
    overlay.className = 'yd-reply-style-modal';
    overlay.innerHTML = `
      <div class="yd-reply-style-modal__backdrop" data-act="${forceSelect ? '' : 'close'}"></div>
      <div class="yd-reply-style-modal__panel" role="dialog" aria-modal="true" aria-label="回复风格">
        ${forceSelect ? '' : '<button type="button" class="yd-reply-style-modal__close" data-act="close" aria-label="关闭">×</button>'}
        <div class="yd-reply-style-modal__title">请选择一种回复风格</div>
        <div class="yd-reply-style-modal__subtitle">请选择你期望角色的说话方式</div>

        <button type="button" class="yd-reply-style-option ${currentMode === 'lively' ? 'is-active' : ''}" data-mode="lively">
          <div class="yd-reply-style-option__head">
            <span class="yd-reply-style-option__title">活人感优先 <span class="yd-reply-style-option__badge">新手推荐</span></span>
            <span class="yd-reply-style-option__tag">${currentMode === 'lively' ? '当前使用' : ''}</span>
          </div>
          <div class="yd-reply-style-option__desc">使用活人感预设，偏口语化</div>
          <div class="yd-reply-style-stars">
            <div class="yd-reply-style-stars__row">
              <span class="yd-reply-style-stars__label">贴人设</span>
              <span class="yd-reply-style-stars__icons">★★</span>
            </div>
            <div class="yd-reply-style-stars__row">
              <span class="yd-reply-style-stars__label">活人感</span>
              <span class="yd-reply-style-stars__icons">★★★</span>
            </div>
          </div>
        </button>

        <button type="button" class="yd-reply-style-option ${currentMode === 'canon' ? 'is-active' : ''}" data-mode="canon">
          <div class="yd-reply-style-option__head">
            <span class="yd-reply-style-option__title">原设定优先</span>
            <span class="yd-reply-style-option__tag">${currentMode === 'canon' ? '当前使用' : ''}</span>
          </div>
          <div class="yd-reply-style-option__desc">使用角色原本人设，不额外加入任何预设</div>
          <div class="yd-reply-style-stars">
            <div class="yd-reply-style-stars__row">
              <span class="yd-reply-style-stars__label">贴人设</span>
              <span class="yd-reply-style-stars__icons">★★★</span>
            </div>
            <div class="yd-reply-style-stars__row">
              <span class="yd-reply-style-stars__label">活人感</span>
              <span class="yd-reply-style-stars__icons">★★</span>
            </div>
          </div>
        </button>

        <div class="yd-reply-style-modal__actions">
          <button type="button" class="yd-btn yd-btn--primary" data-act="close">完成</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._chatModalEl = overlay;

    const syncOptionState = () => {
      const activeMode = this.getMode();
      const opts = overlay.querySelectorAll('.yd-reply-style-option[data-mode]');
      opts.forEach((el) => {
        const mode = String(el.getAttribute('data-mode') || '').trim();
        const active = mode === activeMode;
        el.classList.toggle('is-active', active);
        const tag = el.querySelector('.yd-reply-style-option__tag');
        if (tag) tag.textContent = active ? '当前使用' : '';
      });
    };

    overlay.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-act') === 'close') {
        if (forceSelect && !this.hasUserSelection()) {
          this.saveSettings({ mode: this.getMode() });
        }
        this.closeChatModal();
        return;
      }
      const option = t && t.closest ? t.closest('.yd-reply-style-option[data-mode]') : null;
      if (option) {
        const nextMode = String(option.getAttribute('data-mode') || '').trim() === 'lively' ? 'lively' : 'canon';
        this.saveSettings({ mode: nextMode });
        syncOptionState();
      }
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !forceSelect) this.closeChatModal();
    });
  },

  closeChatModal() {
    if (this._chatModalEl && this._chatModalEl.parentNode) {
      this._chatModalEl.parentNode.removeChild(this._chatModalEl);
    }
    this._chatModalEl = null;
  }
};

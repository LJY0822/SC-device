// 全局通知（顶部横幅）
// 协议：[通知]应用|角色|通知展示内容

window.Notifications = {
  _inited: false,
  _queue: [],
  _timer: null,
  _hideTimer: null,
  _hideAnimTimer: null,
  _current: null,
  _overlay: null,
  _banner: null,
  _titleEl: null,
  _titleLeftEl: null,
  _titleRightEl: null,
  _bodyEl: null,
  _iconEl: null,
  _swipeStartY: 0,

  _messageIconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
  _momentsIconSvg: (typeof CONFIG !== 'undefined' && Array.isArray(CONFIG.DEFAULT_ICONS))
    ? (CONFIG.DEFAULT_ICONS.find(it => it && it.id === 'moments')?.svg || '')
    : '',
  _walletIconSvg: (typeof CONFIG !== 'undefined' && Array.isArray(CONFIG.DEFAULT_ICONS))
    ? (CONFIG.DEFAULT_ICONS.find(it => it && it.id === 'wallet')?.svg || '')
    : '',

  _getIconStyles() {
    try {
      return (typeof Storage !== 'undefined' && Storage.get)
        ? (Storage.get((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS) ? CONFIG.STORAGE_KEYS.ICON_STYLES : 'icon_styles') || {})
        : {};
    } catch (e) {
      return {};
    }
  },

  _getIconIdByAppLabel(appLabel) {
    const a = String(appLabel || '').trim();
    if (!a) return '';
    if (a === '聊天') return 'chat';
    if (a === '朋友圈') return 'moments';
    if (a === '钱包') return 'wallet';
    return '';
  },

  _renderAppIcon(container, appLabel, messageType) {
    if (!container) return;
    const iconId = this._getIconIdByAppLabel(appLabel);
    const iconStyles = this._getIconStyles();
    const globalStyle = iconStyles && iconStyles.__global__ ? iconStyles.__global__ : null;
    const style = iconId ? (iconStyles[iconId] || globalStyle) : globalStyle;

    // 默认兜底图标：聊天消息优先用“气泡”，朋友圈用“朋友圈”图标，其它为空
    const appText = String(appLabel || '').trim();
    const fallbackSvg =
      appText === '朋友圈'
        ? (this._momentsIconSvg || this._messageIconSvg)
        : (
          appText === '钱包'
            ? (this._walletIconSvg || this._messageIconSvg)
            : this._messageIconSvg
        );

    let html = '';
    try {
      container.style.opacity = '';
      // 重要：通知横幅的 icon 区域不受“图标背景渐变/颜色”自定义影响
      // 只在用户把图标替换为“图片”时回显该图片；否则一律使用默认 fallbackSvg + 默认样式
      if (style && style.imageData) {
        html = `<img src="${String(style.imageData).replace(/"/g, '&quot;')}" alt="" class="yd-notify-banner__icon-img">`;
        container.style.background = '';
        container.style.color = '';
        if (typeof style.opacity === 'number') container.style.opacity = String(style.opacity);
      } else {
        container.style.background = '';
        container.style.color = '';
        html = fallbackSvg;
      }
    } catch (e) {
      container.style.background = '';
      container.style.color = '';
      container.style.opacity = '';
      html = fallbackSvg;
    }
    container.innerHTML = html;
  },

  _renderChatIcon(container) {
    if (!container) return;
    let html = '';
    try {
      const iconStyles = (typeof Storage !== 'undefined' && Storage.get) ? Storage.get((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS) ? CONFIG.STORAGE_KEYS.ICON_STYLES : 'icon_styles') || {} : {};
      const globalStyle = iconStyles && iconStyles.__global__ ? iconStyles.__global__ : null;
      const style = iconStyles.chat || globalStyle;
      if (style && style.imageData) {
        html = `<img src="${String(style.imageData).replace(/"/g, '&quot;')}" alt="" class="yd-notify-banner__icon-img">`;
        container.style.background = '';
        container.style.color = '';
        if (typeof style.opacity === 'number') container.style.opacity = String(style.opacity);
      } else if (style && (style.bgStart || style.bgEnd)) {
        const bgStart = style.bgStart || '#a8c5e6';
        const bgEnd = style.bgEnd || '#b8d4f1';
        const fg = style.fgColor || '#ffffff';
        container.style.background = `linear-gradient(135deg,${bgStart} 0%,${bgEnd} 100%)`;
        container.style.color = fg;
        html = this._messageIconSvg;
        if (typeof style.opacity === 'number') container.style.opacity = String(style.opacity);
      } else {
        container.style.background = '';
        container.style.color = '';
        html = this._messageIconSvg;
      }
    } catch (e) {
      container.style.background = '';
      container.style.color = '';
      container.style.opacity = '';
      html = this._messageIconSvg;
    }
    container.innerHTML = html;
  },

  // 显示时长（ms），单条/最后一条 7 秒；新消息来则直接顶掉
  showMs: 7000,

  // 应用映射（第一版：仅聊天）
  _appMap: {
    '聊天': { page: 'page-chat' },
    '朋友圈': { page: 'page-moments' },
    '论坛': { page: 'page-forum' },
    '钱包': { page: 'page-wallet' },
    'ta的手机': { page: 'page-ta-phone' }
  },

  init() {
    if (this._inited) return;
    this._inited = true;

    const overlay = document.getElementById('yd-global-notify');
    if (!overlay) return;

    this._overlay = overlay;
    this._banner = overlay.querySelector('.yd-notify-banner');
    this._iconEl = overlay.querySelector('.yd-notify-banner__icon');
    this._titleEl = overlay.querySelector('.yd-notify-banner__title');
    this._titleLeftEl = overlay.querySelector('.yd-notify-banner__title-left');
    this._titleRightEl = overlay.querySelector('.yd-notify-banner__title-right');
    this._bodyEl = overlay.querySelector('.yd-notify-banner__body');

    this._banner?.addEventListener('click', () => {
      const cur = this._current;
      this._hideNow();
      if (!cur) return;
      this._navigate(cur);
    });

    this._banner?.addEventListener('touchstart', (e) => {
      this._swipeStartY = e.touches?.[0]?.pageY ?? 0;
    }, { passive: true });
    this._banner?.addEventListener('touchend', (e) => {
      const endY = e.changedTouches?.[0]?.pageY ?? 0;
      const dy = this._swipeStartY - endY;
      if (dy > 50) {
        e.preventDefault();
        this._hideNow();
      }
    }, { passive: false });
  },

  _debugEnabled() {
    try {
      return String(localStorage.getItem('yd_debug_notifications') || '').trim() === '1';
    } catch (e) {
      return false;
    }
  },

  _log(...args) {
    if (!this._debugEnabled()) return;
    try { console.log('[Notifications]', ...args); } catch (e) {}
  },

  _getMode() {
    try {
      const key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.NOTIFY_MODE)
        ? CONFIG.STORAGE_KEYS.NOTIFY_MODE
        : 'notify_mode';
      const mode = String((typeof Storage !== 'undefined' && Storage.get) ? (Storage.get(key) || 'in_app') : 'in_app').trim();
      if (mode === 'system' || mode === 'off' || mode === 'in_app') return mode;
    } catch (e) {}
    return 'in_app';
  },

  _buildOpenPayload(item) {
    const app = String(item?.app || '').trim();
    const role = String(item?.role || '').trim();
    const body = String(item?.body || '').trim();
    const mapping = this._appMap[app] || {};
    const sessionId = item?.meta && typeof item.meta.sessionId === 'string' ? String(item.meta.sessionId).trim() : '';
    const payload = {
      app,
      role,
      body,
      page: String(mapping.page || ''),
      forumId: item?.meta && typeof item.meta.forumId === 'string' ? String(item.meta.forumId) : '',
      sessionId
    };
    const params = new URLSearchParams();
    if (payload.page) params.set('yd_notify_page', payload.page);
    if (payload.app) params.set('yd_notify_app', payload.app);
    if (payload.role) params.set('yd_notify_role', payload.role);
    if (payload.forumId) params.set('yd_notify_forum_id', payload.forumId);
    if (payload.sessionId) params.set('yd_notify_session', payload.sessionId);
    payload.url = '/?' + params.toString();
    return payload;
  },

  async _showSystemNotification(item) {
    const app = String(item?.app || '').trim();
    const role = String(item?.role || '').trim();
    const body = String(item?.body || '').trim();
    if (!app || !body) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'granted') return;

    const title = role || app;
    const data = this._buildOpenPayload(item);
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.showNotification) return;
    await reg.showNotification(title, {
      body,
      tag: `yd-${app}-${role}`.slice(0, 64),
      renotify: false,
      data
    });
  },

  enqueue(app, role, body, delayMs = 0, messageType = '', meta = null) {
    // 兜底：如果模块还没 init，先初始化（避免因为 init 时机导致不弹）
    try {
      if (!this._inited && this.init) this.init();
    } catch (e) {}

    const a = String(app || '').trim();
    const r = String(role || '').trim();
    const b = String(body || '').trim();
    if (!a || !b) return;
    const mode = this._getMode();
    if (mode === 'off') return;
    if (mode === 'system') {
      this._showSystemNotification({ app: a, role: r, body: b, messageType: String(messageType || '').trim(), meta }).catch(() => {});
      return;
    }

    const now = Date.now();
    const lastDue = this._queue.length ? (this._queue[this._queue.length - 1].dueAt || now) : now;
    const dueAt = Math.max(now, lastDue) + Math.max(0, Number(delayMs) || 0);

    const item = { app: a, role: r, body: b, dueAt, messageType: String(messageType || '').trim(), meta };
    this._queue.push(item);
    this._log('enqueue', item);

    if (this._current) {
      this._queue.pop();
      // 顶掉当前通知时使用即时隐藏，避免与下一条入场动画冲突
      this._hideNow(true);
      this._show(item);
      return;
    }
    this._scheduleNext();
  },

  enqueueFromText(text) {
    const { items } = this.extract(text);
    if (!items.length) return;
    items.forEach((it, idx) => {
      const delay = idx === 0 ? 0 : this._estimateDelayMs(it.body);
      this.enqueue(it.app, it.role, it.body, delay);
    });
  },

  extract(text) {
    const raw = String(text || '');
    const lines = raw.split('\n');
    const items = [];
    const kept = [];

    for (const line of lines) {
      const trimmed = String(line || '').trim();
      const m = trimmed.match(/^\[通知\](.+)$/);
      if (!m) {
        kept.push(line);
        continue;
      }
      const payload = String(m[1] || '').trim();
      const parts = payload.split('|');
      const app = String(parts[0] || '').trim();
      const role = String(parts[1] || '').trim();
      const body = String(parts.slice(2).join('|') || '').trim();
      if (app && body) items.push({ app, role, body });
      // 通知行不进入聊天正文
    }

    return { items, cleanText: kept.join('\n') };
  },

  _estimateDelayMs(body) {
    const t = String(body || '').trim();
    const len = t.replace(/\s+/g, '').length;
    const ms = 500 + len * 42;
    return Math.max(300, Math.min(2400, ms));
  },

  _scheduleNext() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (!this._queue.length) return;
    const now = Date.now();
    const next = this._queue[0];
    const wait = Math.max(0, (next.dueAt || now) - now);
    this._timer = setTimeout(() => this._showNextDue(), wait);
  },

  _showNextDue() {
    if (!this._queue.length) return;
    const now = Date.now();

    // 找到当前应到达的第一条（队列有序）
    const next = this._queue[0];
    if ((next.dueAt || 0) > now) {
      this._scheduleNext();
      return;
    }

    // 你的需求：新通知到了就立即显示新的（顶掉旧的）
    this._queue.shift();
    this._show(next);
    this._scheduleNext();
  },

  _show(item) {
    // 兜底：可能 init 未成功/DOM 尚未挂载，尝试再次 init
    if (!this._banner) {
      try { if (this.init) this.init(); } catch (e) {}
    }
    if (!this._banner) {
      this._log('show skipped (no banner)', item);
      return;
    }
    this._current = item;

    if (this._iconEl) {
      // 统一：通知永远显示左侧图标（按 app 选择图标/样式）
      try {
        this._renderAppIcon(this._iconEl, item.app, item.messageType);
      } catch (e) {
        // 图标渲染失败不影响通知主体展示
        try { this._iconEl.innerHTML = this._messageIconSvg; } catch (e2) {}
        console.error('render notify icon failed:', e);
      }
      this._iconEl.style.display = '';
    }
    const app = String(item.app || '').trim();
    const role = String(item.role || '').trim();
    const titleLeft = role || app;
    if (this._titleLeftEl) {
      this._titleLeftEl.textContent = titleLeft;
    } else if (this._titleEl) {
      // 兼容旧结构：没有 left/right 时写入整个 title
      this._titleEl.textContent = titleLeft;
    }
    const rightText = item?.meta && typeof item.meta.rightText === 'string'
      ? String(item.meta.rightText).trim()
      : '';
    if (this._titleRightEl) this._titleRightEl.textContent = rightText;
    if (this._bodyEl) this._bodyEl.textContent = String(item.body || '');
    this._log('show', { app: item.app, role: item.role, body: item.body });

    if (this._hideAnimTimer) {
      clearTimeout(this._hideAnimTimer);
      this._hideAnimTimer = null;
    }
    this._banner.hidden = false;
    this._banner.classList.remove('yd-notify-banner--enter');
    // 触发动画
    requestAnimationFrame(() => this._banner && this._banner.classList.add('yd-notify-banner--enter'));

    if (this._hideTimer) clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => this._hideNow(), this.showMs);
  },

  _hideNow(immediate = false) {
    if (!this._banner) return;
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    if (this._hideAnimTimer) {
      clearTimeout(this._hideAnimTimer);
      this._hideAnimTimer = null;
    }
    this._current = null;
    this._banner.classList.remove('yd-notify-banner--enter');

    if (immediate) {
      this._banner.hidden = true;
      this._scheduleNext();
      return;
    }

    // 退场动画：复用与入场相同的过渡参数，反向收起后再 hidden
    this._hideAnimTimer = setTimeout(() => {
      this._banner.hidden = true;
      this._hideAnimTimer = null;
      this._scheduleNext();
    }, 230);
  },

  _navigate(item) {
    const a = String(item?.app || '').trim();
    const r = String(item?.role || '').trim();
    const body = String(item?.body || '').trim();
    const mapping = this._appMap[a];
    if (!mapping || !mapping.page) return;

    // 用户已点击进入，清除同一会话的剩余通知，避免多条通知反复挡住返回按钮
    this._queue = this._queue.filter((it) => !(String(it.app || '') === a && String(it.role || '') === r));
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._scheduleNext();

    try {
      State.switchPage(mapping.page);
    } catch (e) {
      console.error('notify navigate failed:', e);
      return;
    }

    if (a === '聊天' && typeof Chat !== 'undefined') {
      const sessionId = item?.meta && typeof item.meta.sessionId === 'string' ? String(item.meta.sessionId).trim() : '';
      if (sessionId && typeof Chat.openSession === 'function') {
        Chat.openSession(sessionId).catch(() => {});
      } else if (Chat.openSessionByTitle) {
        const sessionTitle = r;
        if (sessionTitle) {
          Chat.openSessionByTitle(sessionTitle);
        } else {
          try { State.switchPage('page-chat-list'); } catch (e) {}
        }
      }
    }

    if (a === '论坛') {
      const forumId = item?.meta && typeof item.meta.forumId === 'string' ? String(item.meta.forumId) : '';
      if (forumId && typeof Storage !== 'undefined' && Storage.set) {
        try { Storage.set('forum_current_forum_id', forumId); } catch (e) {}
      }
      try {
        if (typeof Forum !== 'undefined' && Forum._ensureForums) Forum._ensureForums();
        if (typeof Forum !== 'undefined' && Forum._syncHeaderForumButton) Forum._syncHeaderForumButton();
        if (typeof Forum !== 'undefined' && Forum.renderList) Forum.renderList();
      } catch (e) {
        console.error('notify forum switch failed:', e);
      }
    }
  },

  openByPayload(payload) {
    const app = String(payload?.app || '').trim();
    const role = String(payload?.role || '').trim();
    const forumId = String(payload?.forumId || '').trim();
    const sessionId = String(payload?.sessionId || '').trim();
    const page = String(payload?.page || '').trim();
    if (!page && !app) return;
    let appText = app;
    if (!appText && page) {
      appText = Object.keys(this._appMap).find((k) => this._appMap[k]?.page === page) || '';
    }
    const meta = {};
    if (forumId) meta.forumId = forumId;
    if (sessionId) meta.sessionId = sessionId;
    this._navigate({
      app: appText,
      role,
      body: '',
      meta: Object.keys(meta).length ? meta : null
    });
  }
};


// 定时任务页：主动推送配置 + 待触发列表（统一旧版 yd-timer-item 样式）
const TimerPage = {
  PUSH_USER_KEY: 'yd_push_user_id',
  PUSH_SUBSCRIBE_OK_KEY: 'yd_push_subscribe_ok_v1',
  NOTIFY_SELF_CHECK_RATE_KEY: 'yd_notify_self_check_rate_v1',
  NOTIFY_SELF_CHECK_MAX_PER_MINUTE: 5,
  SYSTEM_NOTIFY_SETUP_KEY: 'yd_system_notify_setup_v1',
  _autoSaveT: 0,
  _permissionUiForcedOff: false,
  _lastPushSubscribeDiag: null,

  init() {
    document.getElementById('timer-back')?.addEventListener('click', () => State.backToHome());
    // 用户只要“打开开关”就立即生效，避免忘点保存导致不触发
    document.getElementById('proactive-enabled')?.addEventListener('change', () => {
      this._saveProactiveConfig({ silent: true }).catch(() => {});
    });
    // 输入框改动：自动保存（轻微防抖，避免每次按键都触发）
    ['proactive-min', 'proactive-max', 'proactive-dnd-start', 'proactive-dnd-end'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const handler = () => this._scheduleAutoSave();
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
      el.addEventListener('blur', handler);
    });

    document.getElementById('system-notify-enabled')?.addEventListener('change', async (e) => {
      const checked = !!e?.target?.checked;
      this._markSystemNotifySetupDone(checked ? 'enabled' : 'disabled');
      if (checked) {
        const result = await this._enableSystemNotification();
        if (!result?.ok) {
          this._permissionUiForcedOff = true;
          this._toast('开启系统通知失败（已输出详细日志）');
          this._showSystemNotifyFailureReport(result);
          try { e.target.checked = false; } catch (_) {}
        }
      } else {
        await this._disableSystemNotification();
        this._permissionUiForcedOff = true;
      }
      await this._renderPermissionStatus();
    });
    document.getElementById('timer-task-list')?.addEventListener('click', (e) => this._onListClick(e));
    window.addEventListener('yd:pagechange', (e) => {
      if (e?.detail?.to === 'page-timer') {
        this._hydrateProactiveForm().catch(() => {});
        this._renderPermissionStatus().catch(() => {});
        this.render().catch(() => {});
      }
    });
    window.addEventListener('yd:proactive-scheduled', () => {
      try {
        if (typeof State !== 'undefined' && State.currentPage === 'page-timer') {
          this.render().catch(() => {});
        }
      } catch (e) {}
    });
    window.addEventListener('yd:proactive-local-preview', () => {
      try {
        if (typeof State !== 'undefined' && State.currentPage === 'page-timer') {
          this._renderLocalPreview().catch(() => {});
        }
      } catch (e) {}
    });
    window.addEventListener('yd:proactive-status', () => {
      try {
        if (typeof State !== 'undefined' && State.currentPage === 'page-timer') {
          this._renderProactiveStatus().catch(() => {});
        }
      } catch (e) {}
    });
  },

  _markSystemNotifySetupDone(mode = '') {
    const val = String(mode || '').trim() || 'set';
    try {
      localStorage.setItem(this.SYSTEM_NOTIFY_SETUP_KEY, val);
    } catch (e) {}
  },

  _hasSystemNotifySetupValue() {
    try {
      const v = String(localStorage.getItem(this.SYSTEM_NOTIFY_SETUP_KEY) || '').trim();
      return !!v;
    } catch (e) {
      return false;
    }
  },

  promptSystemNotifySetupIfNeeded() {
    if (this._hasSystemNotifySetupValue()) return;
    const existed = document.getElementById('yd-system-notify-onboarding-modal');
    if (existed) return;
    const overlay = document.createElement('div');
    overlay.id = 'yd-system-notify-onboarding-modal';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="系统通知权限提示" style="max-width:520px;">
        <div class="yd-modal-header" style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:16px;font-weight:700;">系统通知权限提示</div>
          <button type="button" class="yd-header-btn" data-act="close" aria-label="关闭">×</button>
        </div>
        <div style="padding:12px 8px 8px;color:#333;line-height:1.6;">
          当前系统通知权限未开启，角色无法给你主动发消息。是否需要设置？
        </div>
        <div style="padding:8px 8px 12px;display:flex;gap:10px;">
          <button type="button" class="yd-btn" data-act="keep-off" style="flex:1;min-width:0;height:40px;border-radius:10px;">保持不开启</button>
          <button type="button" class="yd-btn yd-btn--primary" data-act="go-setup" style="flex:1;min-width:0;height:40px;border-radius:10px;">去开启</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => {
      const el = document.getElementById('yd-system-notify-onboarding-modal');
      if (el) el.remove();
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this._markSystemNotifySetupDone('dismissed');
      close();
    });
    overlay.querySelector('[data-act="keep-off"]')?.addEventListener('click', () => {
      this._markSystemNotifySetupDone('keep-off');
      close();
    });
    overlay.querySelector('[data-act="go-setup"]')?.addEventListener('click', async () => {
      this._markSystemNotifySetupDone('go-setup');
      close();
      try {
        const key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.NOTIFY_MODE)
          ? CONFIG.STORAGE_KEYS.NOTIFY_MODE
          : 'notify_mode';
        if (typeof Storage !== 'undefined' && Storage.set) Storage.set(key, 'system');
        else localStorage.setItem(key, 'system');
      } catch (e0) {}
      try {
        if (typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
          State.switchPage('page-timer');
        }
      } catch (e1) {}
      setTimeout(() => {
        const el = document.getElementById('system-notify-enabled');
        if (!el) return;
        try {
          if (!el.checked) {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch (e2) {}
      }, 120);
    });
  },

  async render() {
    await this._renderLocalPreview();
    await this._renderProactiveStatus();
    const listEl = document.getElementById('timer-task-list');
    if (!listEl) return;

    const userId = this._getOrCreatePushUserId();
    let items = [];
    let fetchFailed = false;
    try {
      if (location && String(location.protocol || '') === 'file:') {
        throw new Error('file protocol');
      }
      const res = await fetch(`/api/proactive/pending?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      items = Array.isArray(data?.items) ? data.items : [];
    } catch (e) {
      fetchFailed = true;
    }

    if (fetchFailed) {
      const localItems = await this._getLocalPendingItems();
      if (!localItems.length) {
        listEl.innerHTML = '';
        return;
      }
      items = localItems;
    }

    if (!items.length) {
      const localItems = await this._getLocalPendingItems();
      if (!localItems.length) {
        listEl.innerHTML = '';
        return;
      }
      items = localItems;
    }

    const sorted = items.slice().sort((a, b) => Number(a?.dueAt || 0) - Number(b?.dueAt || 0));
    const rows = await Promise.all(
      sorted.map(async (it) => {
        const taskId = this._escapeHtml(String(it?.taskId || '').trim());
        const sid = String(it?.sessionId || '').trim();
        let sessionTitle = '';
        try {
          if (sid) {
            const s = await Storage.dbGet('sessions', sid);
            sessionTitle = String(s?.title || '').trim();
          }
        } catch (e) {}
        const dueAt = Number(it?.dueAt || 0);
        const timeText = this._formatDateTime(dueAt);
        const remain = this._formatRemain(dueAt - Date.now());
        const title = this._escapeHtml(String(it?.title || '主动推送'));
        const bodyRaw = String(it?.body || '').trim();
        const content = this._escapeHtml(bodyRaw);
        const metaExtra = sessionTitle
          ? this._escapeHtml(sessionTitle)
          : (sid ? this._escapeHtml(sid.slice(0, 10)) : '');
        return `
        <div class="yd-timer-item" data-id="${taskId}">
          <div class="yd-timer-item__left">
            <div class="yd-timer-item__title">${title}</div>
            <div class="yd-timer-item__meta">剩余：${remain}${metaExtra ? ` · ${metaExtra}` : ''}</div>
            ${content ? `<div class="yd-timer-item__desc">${content}</div>` : ''}
            <div class="yd-timer-item__ops">
              <button type="button" class="yd-timer-item__delete" data-action="delete">删除</button>
            </div>
          </div>
          <div class="yd-timer-item__right">
            <div class="yd-timer-item__time">${timeText}</div>
            <div class="yd-timer-item__status is-on">待触发</div>
          </div>
        </div>
      `;
      })
    );

    listEl.innerHTML = rows.join('');
  },

  async _renderLocalPreview() {
    const card = document.getElementById('proactive-local-preview-card');
    const box = document.getElementById('proactive-local-preview');
    if (!card || !box) return;
    if (typeof ProactiveScheduler === 'undefined' || !ProactiveScheduler.LOCAL_PREVIEW_KEY) {
      card.hidden = true;
      return;
    }
    let row = null;
    try {
      row = await Storage.kvGet(ProactiveScheduler.LOCAL_PREVIEW_KEY);
    } catch (e) {
      row = null;
    }
    if (!row || typeof row !== 'object' || !String(row.body || '').trim()) {
      card.hidden = true;
      return;
    }

    const sid = String(row.sessionId || '').trim();
    let sessionTitle = String(row.title || '').trim();
    try {
      if (sid) {
        const s = await Storage.dbGet('sessions', sid);
        const t = String(s?.title || '').trim();
        if (t) sessionTitle = t;
      }
    } catch (e) {}
    const dueAt = Number(row.dueAt || 0);
    const timeText = this._formatDateTime(dueAt);
    const remain = this._formatRemain(dueAt - Date.now());
    const body = this._escapeHtml(String(row.body || '').trim());

    card.hidden = false;
    box.innerHTML = `
      <div class="yd-timer-local-preview__meta">预计：${timeText}（剩余 ${remain}） · ${this._escapeHtml(sessionTitle || (sid ? sid.slice(0, 10) : ''))}</div>
      <div class="yd-timer-local-preview__body">${body}</div>
    `;
  },

  async _getLocalPendingItems() {
    try {
      if (typeof ProactiveScheduler === 'undefined' || !ProactiveScheduler || typeof ProactiveScheduler.getLocalPendingTasks !== 'function') {
        return [];
      }
      const rows = await ProactiveScheduler.getLocalPendingTasks();
      if (!Array.isArray(rows) || !rows.length) return [];
      return rows.map((r) => ({
        taskId: String(r?.taskId || '').trim(),
        sessionId: String(r?.sessionId || '').trim(),
        dueAt: Number(r?.dueAt || 0) || 0,
        title: String(r?.title || '主动消息').trim(),
        body: String(r?.body || '').trim()
      })).filter((r) => !!r.taskId && !!r.sessionId && !!r.body);
    } catch (e) {
      return [];
    }
  },

  async _renderProactiveStatus() {
    const st = document.getElementById('proactive-status');
    if (!st) return;
    if (typeof ProactiveScheduler === 'undefined' || !ProactiveScheduler.STATUS_KEY) {
      st.textContent = '';
      return;
    }
    let row = null;
    try {
      row = await Storage.kvGet(ProactiveScheduler.STATUS_KEY);
    } catch (e) {
      row = null;
    }
    const msg = String(row?.message || '').trim();
    if (!msg) {
      st.textContent = '';
      return;
    }
    // 不显示旧的 file:// 提示（历史残留）
    if (msg.includes('file://') && msg.includes('/api/proactive')) {
      st.textContent = '';
      return;
    }
    st.textContent = msg;
  },

  async _hydrateProactiveForm() {
    if (typeof ProactiveScheduler === 'undefined' || !ProactiveScheduler.loadConfig) return;
    const cfg = await ProactiveScheduler.loadConfig();
    const en = document.getElementById('proactive-enabled');
    if (en) en.checked = !!cfg.enabled;
    const setNum = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v ?? '');
    };
    setNum('proactive-min', cfg.proactiveMin);
    setNum('proactive-max', cfg.proactiveMax);
    setNum('proactive-dnd-start', cfg.dndStart);
    setNum('proactive-dnd-end', cfg.dndEnd);
    await this._renderProactiveStatus();
  },

  async _saveProactiveConfig({ silent = false } = {}) {
    if (typeof ProactiveScheduler === 'undefined' || !ProactiveScheduler.saveConfig) return;
    const st = document.getElementById('proactive-status');
    const g = (id) => {
      const el = document.getElementById(id);
      const raw = String(el?.value ?? '').trim();
      if (raw === '') return NaN;
      const n = Number(raw);
      return Number.isFinite(n) ? n : NaN;
    };
    const enabled = !!document.getElementById('proactive-enabled')?.checked;
    const minRaw = g('proactive-min');
    const maxRaw = g('proactive-max');
    let proactiveMin = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : 30;
    let proactiveMax = Number.isFinite(maxRaw) ? Math.max(0, Math.floor(maxRaw)) : 60;
    if (proactiveMax < proactiveMin) {
      const t = proactiveMin;
      proactiveMin = proactiveMax;
      proactiveMax = t;
    }
    const dndStart = Math.max(0, Math.min(23, Math.floor(g('proactive-dnd-start')) || 0));
    const dndEnd = Math.max(0, Math.min(23, Math.floor(g('proactive-dnd-end')) || 0));
    await ProactiveScheduler.saveConfig({
      enabled,
      proactiveMin,
      proactiveMax,
      dndStart,
      dndEnd
    });
    if (!silent && st) st.textContent = '已保存';
  },

  _scheduleAutoSave() {
    try { clearTimeout(this._autoSaveT); } catch (e) {}
    this._autoSaveT = setTimeout(() => {
      this._saveProactiveConfig({ silent: true }).catch(() => {});
    }, 450);
  },

  async _renderPermissionStatus() {
    const toggle = document.getElementById('system-notify-enabled');
    if (!toggle) return;
    if (!('Notification' in window)) {
      if (toggle) toggle.checked = false;
      return;
    }
    const p = Notification.permission;
    let hasSub = false;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg?.pushManager?.getSubscription?.();
        hasSub = !!sub;
      }
    } catch (e) {}
    const enabled = !this._permissionUiForcedOff && p === 'granted' && hasSub;
    if (toggle) toggle.checked = !!enabled;
  },

  async _enableSystemNotification() {
    // 选择“已开启”：请求权限 + 订阅 + 上报服务端（订阅接口）
    try {
      if (!('Notification' in window)) {
        return this._notifyFailureResult('precheck', '当前环境不支持 Notification API');
      }
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        return this._notifyFailureResult('requestPermission', `用户未授予权限（permission=${String(p)})`);
      }
      const ok = await this._ensurePushSubscribed({ silent: true });
      if (ok) this._permissionUiForcedOff = false;
      if (ok) {
        // 开启成功后：主动发一条“马上推送”的测试通知，帮助用户确认链路畅通
        try {
          await this._sendImmediateSystemNotifyTest();
        } catch (e0) {}
      }
      if (!ok) {
        const detail = this._lastPushSubscribeDiag && typeof this._lastPushSubscribeDiag === 'object'
          ? this._lastPushSubscribeDiag
          : {};
        return this._notifyFailureResult('subscribe', 'Web Push 订阅未就绪（_ensurePushSubscribed=false）', null, detail);
      }
      return { ok: true };
    } catch (e) {
      return this._notifyFailureResult('exception', '执行过程中抛出异常', e);
    }
  },

  _notifyFailureResult(stage, reason, error, detail) {
    const now = new Date();
    const ext = (detail && typeof detail === 'object') ? detail : {};
    const lines = [
      `[系统通知权限开启失败]`,
      `time=${now.toISOString()}`,
      `stage=${String(stage || 'unknown')}`,
      `reason=${String(reason || 'unknown')}`,
      `page=${String(location?.href || '')}`,
      `isSecureContext=${String(!!window.isSecureContext)}`,
      `protocol=${String(location?.protocol || '')}`,
      `notificationSupported=${String('Notification' in window)}`,
      `permission=${String(('Notification' in window && Notification?.permission) ? Notification.permission : 'unknown')}`,
      `serviceWorkerSupported=${String('serviceWorker' in navigator)}`,
      `pushManagerSupported=${String('PushManager' in window)}`
    ];
    Object.keys(ext).forEach((k) => {
      const v = ext[k];
      if (v == null || v === '') return;
      lines.push(`${k}=${String(v)}`);
    });
    if (error) {
      const em = String(error?.message || error || '').trim();
      if (em) lines.push(`error=${em}`);
      const en = String(error?.name || '').trim();
      if (en) lines.push(`errorName=${en}`);
      const stack = String(error?.stack || '').trim();
      if (stack) lines.push(`stack=${stack}`);
    }
    return { ok: false, stage, reason, error, detail: ext, report: lines.join('\n') };
  },

  _showSystemNotifyFailureReport(result) {
    const report = String(result?.report || '').trim();
    if (!report) return;
    try { console.error(report); } catch (e) {}
    this._openSystemNotifyFailureModal(report);
  },

  _openSystemNotifyFailureModal(report) {
    const existing = document.getElementById('yd-system-notify-failure-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'yd-system-notify-failure-modal';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="系统通知失败日志" style="max-width:620px;">
        <div class="yd-modal-header" style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:16px;font-weight:700;">系统通知失败日志</div>
          <button type="button" class="yd-header-btn" data-act="close" aria-label="关闭">×</button>
        </div>
        <pre id="yd-system-notify-failure-text" style="white-space:pre-wrap;word-break:break-all;max-height:48vh;overflow:auto;padding:10px;border-radius:10px;background:#f5f7fb;color:#111;font-size:12px;line-height:1.5;margin:8px 0 12px;">${this._escapeHtml(report)}</pre>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button type="button" class="yd-btn" data-act="close" style="height:38px;">关闭</button>
          <button type="button" class="yd-btn yd-btn--primary" data-act="copy" style="height:38px;">复制日志</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => {
      const el = document.getElementById('yd-system-notify-failure-modal');
      if (el) el.remove();
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelectorAll('[data-act="close"]').forEach((btn) => {
      btn.addEventListener('click', close);
    });
    modal.querySelector('[data-act="copy"]')?.addEventListener('click', async () => {
      const ok = await this._copySystemNotifyFailureText(report);
      this._toast(ok ? '日志已复制' : '复制失败，请手动复制');
    });
  },

  async _copySystemNotifyFailureText(text) {
    const t = String(text || '');
    if (!t.trim()) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = !!document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e2) {
      return false;
    }
  },

  async _sendImmediateSystemNotifyTest() {
    try {
      if (location && String(location.protocol || '') === 'file:') return false;
    } catch (e) {}
    const userId = this._getOrCreatePushUserId();
    if (!userId) return false;
    if (!this._acquireNotifySelfCheckQuota(userId)) {
      return false;
    }
    const taskId = typeof State !== 'undefined' && State.generateId ? `notify_on_${State.generateId()}` : `notify_on_${Date.now()}`;
    const dueAt = Date.now() + 2500;
    const res = await fetch('/api/timer/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        taskId,
        dueAt,
        title: '系统通知已开启',
        body: '系统通知功能正常运行中'
      })
    });
    if (!res.ok) return false;
    // 不强制 toast，避免太吵；仅在失败时提示
    return true;
  },

  _acquireNotifySelfCheckQuota(userId) {
    const uid = String(userId || '').trim();
    if (!uid) return false;
    const now = Date.now();
    const windowMs = 60 * 1000;
    const max = Math.max(1, Number(this.NOTIFY_SELF_CHECK_MAX_PER_MINUTE) || 5);
    let map = {};
    try {
      const raw = localStorage.getItem(this.NOTIFY_SELF_CHECK_RATE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object') map = parsed;
    } catch (e) {
      map = {};
    }
    const arr = Array.isArray(map[uid]) ? map[uid] : [];
    const valid = arr
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0 && (now - n) <= windowMs);
    if (valid.length >= max) {
      map[uid] = valid;
      try { localStorage.setItem(this.NOTIFY_SELF_CHECK_RATE_KEY, JSON.stringify(map)); } catch (e2) {}
      return false;
    }
    valid.push(now);
    map[uid] = valid;
    try { localStorage.setItem(this.NOTIFY_SELF_CHECK_RATE_KEY, JSON.stringify(map)); } catch (e3) {}
    return true;
  },

  async _disableSystemNotification() {
    // 选择“未开启”：尽量解除订阅（含服务端取消订阅）
    try {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg?.pushManager?.getSubscription?.();
      if (!sub) return true;
      try {
        const endpoint = String(sub.endpoint || '').trim();
        if (endpoint) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: this._getOrCreatePushUserId(), endpoint })
          }).catch(() => null);
        }
      } catch (e1) {}
      try { await sub.unsubscribe(); } catch (e2) {}
      return true;
    } catch (e) {
      return false;
    }
  },

  async checkPermissionAndSendTest() {
    const toggle = document.getElementById('system-notify-enabled');
    await this._renderPermissionStatus();
    if (!('Notification' in window)) {
      this._toast('当前环境不支持系统通知');
      this._permissionUiForcedOff = true;
      if (toggle) toggle.checked = false;
      await this._renderPermissionStatus();
      return;
    }
    if (Notification.permission !== 'granted') {
      this._toast('请先把「系统通知权限」设为已开启');
      this._permissionUiForcedOff = true;
      if (toggle) toggle.checked = false;
      await this._renderPermissionStatus();
      return;
    }
    const ok = await this._ensurePushSubscribed({ silent: true });
    await this._renderPermissionStatus();
    if (!ok) {
      this._toast('检查失败：Web Push 订阅未就绪');
      this._permissionUiForcedOff = true;
      if (toggle) toggle.checked = false;
      await this._renderPermissionStatus();
      return;
    }

    // 使用 timer/create 创建一条“马上触发”的测试通知任务（后端到点会推送）
    try {
      const userId = this._getOrCreatePushUserId();
      const taskId = typeof State !== 'undefined' && State.generateId ? `test_${State.generateId()}` : `test_${Date.now()}`;
      const dueAt = Date.now() + 2500;
      const res = await fetch('/api/timer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          taskId,
          dueAt,
          title: '系统通知测试',
          body: '检查已通过，系统通知功能正常运行中'
        })
      });
      if (!res.ok) throw new Error('timer create failed');
      this._permissionUiForcedOff = false;
      await this._renderPermissionStatus();
      this._toast('已发送测试通知，请留意系统通知');
    } catch (e) {
      this._toast('测试通知发送失败');
      this._permissionUiForcedOff = true;
      if (toggle) toggle.checked = false;
      await this._renderPermissionStatus();
    }
  },

  async _onListClick(e) {
    const btn = e?.target?.closest?.('[data-action="delete"]');
    if (!btn) return;
    const item = btn.closest('[data-id]');
    const id = item?.getAttribute('data-id');
    if (!id) return;

    try {
      await this._apiDeleteTimer(id);
    } catch (e) {
      // 云端不可用时，允许删除本地主动消息任务（本地链路）
      let localDeleted = false;
      try {
        if (typeof ProactiveScheduler !== 'undefined' && ProactiveScheduler && typeof ProactiveScheduler.deleteTaskById === 'function') {
          localDeleted = await ProactiveScheduler.deleteTaskById(id);
        }
      } catch (e2) {}
      if (!localDeleted) {
        this._toast('删除失败');
        return;
      }
    }
    await this.render();
  },

  async _ensurePushSubscribed({ silent = false } = {}) {
    this._lastPushSubscribeDiag = null;
    try {
      if (!('serviceWorker' in navigator)) {
        this._lastPushSubscribeDiag = { subStage: 'precheck_sw', fail: 'serviceWorker_unsupported' };
        if (!silent) this._toast('当前环境不支持 Service Worker');
        return false;
      }
      if (!('PushManager' in window)) {
        this._lastPushSubscribeDiag = { subStage: 'precheck_push', fail: 'push_manager_unsupported' };
        if (!silent) this._toast('当前环境不支持 Web Push');
        return false;
      }
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        this._lastPushSubscribeDiag = { subStage: 'precheck_permission', fail: `permission_${String(Notification?.permission || 'unknown')}` };
        if (!silent) this._toast('请先开启系统通知权限');
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      if (!reg?.pushManager) {
        this._lastPushSubscribeDiag = { subStage: 'sw_ready', fail: 'push_manager_missing_in_registration' };
        if (!silent) this._toast('当前环境不支持推送能力');
        return false;
      }

      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        let pub = null;
        try {
          pub = await this._apiGetPushPublicKey();
        } catch (ePub) {
          this._lastPushSubscribeDiag = {
            subStage: 'public_key_fetch',
            fail: 'public_key_request_error',
            publicKeyError: String(ePub?.message || ePub || '').slice(0, 300)
          };
          throw ePub;
        }
        if (!pub?.publicKey) {
          this._lastPushSubscribeDiag = {
            subStage: 'public_key_fetch',
            fail: 'public_key_missing',
            publicKeyStatus: String(pub?._status || ''),
            publicKeyBody: String(pub?._bodyPreview || '')
          };
          if (!silent) this._toast('获取推送公钥失败');
          return false;
        }

        try {
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this._urlB64ToUint8Array(pub.publicKey)
          });
        } catch (eSub) {
          this._lastPushSubscribeDiag = {
            subStage: 'push_subscribe',
            fail: 'push_manager_subscribe_error',
            subscribeErrorName: String(eSub?.name || ''),
            subscribeError: String(eSub?.message || eSub || '').slice(0, 300)
          };
          throw eSub;
        }
      }

      try {
        await this._apiSubscribe(subscription);
      } catch (eApi) {
        this._lastPushSubscribeDiag = {
          subStage: 'subscribe_api',
          fail: 'subscribe_api_error',
          subscribeApiError: String(eApi?.message || eApi || '').slice(0, 300),
          subscribeApiStatus: String(eApi?._status || ''),
          subscribeApiBody: String(eApi?._bodyPreview || '')
        };
        throw eApi;
      }
      this._lastPushSubscribeDiag = { subStage: 'done', result: 'ok' };
      return true;
    } catch (e) {
      if (!this._lastPushSubscribeDiag) {
        this._lastPushSubscribeDiag = {
          subStage: 'unknown',
          fail: 'unexpected_exception',
          errorName: String(e?.name || ''),
          errorMessage: String(e?.message || e || '').slice(0, 300)
        };
      }
      if (!silent) {
        try { console.error(e); } catch (_) {}
        this._toast('Web Push 订阅失败');
      }
      return false;
    }
  },

  _getOrCreatePushUserId() {
    try {
      const v = Storage.get(this.PUSH_USER_KEY);
      if (v && v.id) return String(v.id);
      const id = 'push_' + State.generateId();
      Storage.set(this.PUSH_USER_KEY, { id });
      return id;
    } catch (e) {
      const k = this.PUSH_USER_KEY;
      try {
        const raw = localStorage.getItem(k);
        if (raw) return String(JSON.parse(raw).id || raw);
      } catch (e2) {}
      const id = 'push_' + State.generateId();
      try { localStorage.setItem(k, JSON.stringify({ id })); } catch (e3) {}
      return id;
    }
  },

  async _apiGetPushPublicKey() {
    const res = await fetch('/api/push/public-key', { method: 'GET' });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    const bodyPreview = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    if (!res.ok) {
      const err = new Error(`public key api failed: ${res.status}`);
      err._status = res.status;
      err._bodyPreview = bodyPreview;
      throw err;
    }
    if (data && typeof data === 'object') {
      data._status = res.status;
      data._bodyPreview = bodyPreview;
    }
    return data || { _status: res.status, _bodyPreview: bodyPreview };
  },

  async _apiSubscribe(subscription) {
    const userId = this._getOrCreatePushUserId();
    const endpoint = String(subscription?.endpoint || '').trim();
    if (!endpoint) throw new Error('missing endpoint');

    const p256dh = subscription.getKey ? subscription.getKey('p256dh') : null;
    const auth = subscription.getKey ? subscription.getKey('auth') : null;
    if (!p256dh || !auth) throw new Error('missing subscription keys');

    const p256dhB64 = this._arrayBufferToBase64Url(p256dh);
    const authB64 = this._arrayBufferToBase64Url(auth);

    const body = {
      userId,
      endpoint,
      p256dh: p256dhB64,
      auth: authB64
    };

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const err = new Error(`subscribe api failed: ${res.status}`);
      err._status = res.status;
      err._bodyPreview = String(bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 260);
      throw err;
    }
  },

  async _apiDeleteTimer(taskId) {
    const userId = this._getOrCreatePushUserId();
    const res = await fetch('/api/timer/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, taskId: String(taskId || '') })
    });
    if (!res.ok) throw new Error('timer delete api failed');
  },

  _urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  _arrayBufferToBase64Url(arrayBuffer) {
    const bytes = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : new Uint8Array(arrayBuffer.buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = window.btoa(binary);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  },

  _formatDateTime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '--:--';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '--:--';
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${mo}-${day} ${h}:${m}:${s}`;
  },

  _formatRemain(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '00:00';
    const sec = Math.ceil(n / 1000);
    const mm = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  _toast(text) {
    const msg = String(text || '').trim();
    if (!msg) return;
    if (typeof Chat !== 'undefined' && typeof Chat._toast === 'function') {
      Chat._toast(msg);
      return;
    }
    if (typeof Settings !== 'undefined' && typeof Settings.showToast === 'function') {
      Settings.showToast(msg);
      return;
    }
    try { alert(msg); } catch (e) {}
  },

  _escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

// 主动定时推送：由聊天同轮系统动作 [系统]主动消息 直接调度到服务端队列
const ProactiveScheduler = {
  CONFIG_KEY: 'timer_proactive_config_v1',
  LOCAL_PREVIEW_KEY: 'proactive_local_preview_v1',
  LOCAL_TASKS_KEY: 'proactive_local_tasks_v1',
  STATUS_KEY: 'proactive_status_v1',
  // localStorage mirror to survive IndexedDB/kv glitches on some devices
  LS_CONFIG_KEY: 'yd_proactive_cfg_v1',

  _sessionTimers: Object.create(null), // sessionId -> timeoutId
  _pendingBySession: Object.create(null), // sessionId -> { taskId, dueAt, title, body }
  _localReconcileTimer: 0,
  _CLOUD_FETCH_MS: 12000,

  _fetchJsonWithTimeout(url, init, ms = 12000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl
      ? setTimeout(() => {
          try {
            ctrl.abort();
          } catch (e) {}
        }, ms)
      : null;
    return fetch(url, ctrl ? { ...init, signal: ctrl.signal } : init)
      .then(async (res) => {
        const out = await res.json().catch(() => ({}));
        return { res, out };
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  },

  /** 云端登记不阻塞聊天主流程；本地账本已在调用前写入 */
  _scheduleCloudPushInBackground({ userId, sessionId, taskId, dueAt, title, body }) {
    void (async () => {
      try {
        const { res, out } = await this._fetchJsonWithTimeout(
          '/api/proactive/schedule',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              sessionId,
              taskId,
              dueAt,
              title,
              body
            })
          },
          this._CLOUD_FETCH_MS
        );
        if (!res.ok) {
          const msg = String(out.message || out.error || res.statusText || '').trim();
          await this._reportStatus({
            level: 'error',
            message: res.status === 409 ? '主动推送队列已满（全设备最多 10 条待触发）' : `登记主动推送失败：${msg.slice(0, 64)}`,
            sessionId
          });
          return;
        }
        try {
          window.dispatchEvent(new CustomEvent('yd:proactive-scheduled', { detail: { sessionId, taskId } }));
        } catch (e) {}
      } catch (e) {}
    })();
  },

  _deleteCloudTaskInBackground(userId, taskId, sessionId) {
    void (async () => {
      try {
        await this._fetchJsonWithTimeout(
          '/api/timer/delete',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, taskId })
          },
          this._CLOUD_FETCH_MS
        );
      } catch (e) {}
    })();
  },

  async _isSystemPushReady() {
    try {
      if (!('Notification' in window)) return false;
      if (!('serviceWorker' in navigator)) return false;
      if (Notification.permission !== 'granted') return false;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg?.pushManager?.getSubscription?.();
      return !!sub;
    } catch (e) {
      return false;
    }
  },

  async _loadLocalTasks() {
    try {
      const rows = await Storage.kvGet(this.LOCAL_TASKS_KEY);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      return [];
    }
  },

  async _saveLocalTasks(rows) {
    const list = Array.isArray(rows) ? rows : [];
    try {
      await Storage.kvSet(this.LOCAL_TASKS_KEY, list);
    } catch (e) {}
  },

  async _upsertLocalTask(task) {
    const next = task && typeof task === 'object' ? task : null;
    if (!next) return;
    const tid = String(next.taskId || '').trim();
    if (!tid) return;
    const rows = await this._loadLocalTasks();
    const idx = rows.findIndex((r) => String(r?.taskId || '').trim() === tid);
    if (idx >= 0) rows[idx] = { ...rows[idx], ...next };
    else rows.push(next);
    // 控制本地账本体积，保留最近 200 条
    rows.sort((a, b) => Number(a?.dueAt || 0) - Number(b?.dueAt || 0));
    const keep = rows.slice(-200);
    await this._saveLocalTasks(keep);
  },

  async _removeLocalTask(taskId) {
    const tid = String(taskId || '').trim();
    if (!tid) return;
    const rows = await this._loadLocalTasks();
    const next = rows.filter((r) => String(r?.taskId || '').trim() !== tid);
    await this._saveLocalTasks(next);
  },

  async _removeUndeliveredLocalTasksBySession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const rows = await this._loadLocalTasks();
    const next = rows.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      const rsid = String(r.sessionId || '').trim();
      if (rsid !== sid) return true;
      return !!r.delivered;
    });
    await this._saveLocalTasks(next);
  },

  async getLocalPendingTasks() {
    const rows = await this._loadLocalTasks();
    const now = Date.now();
    return rows
      .filter((r) => r && typeof r === 'object' && !r.delivered)
      .filter((r) => (Number(r.dueAt || 0) || 0) > now - 60 * 1000)
      .sort((a, b) => Number(a?.dueAt || 0) - Number(b?.dueAt || 0));
  },

  async deleteTaskById(taskId) {
    const tid = String(taskId || '').trim();
    if (!tid) return false;
    try {
      await this._removeLocalTask(tid);
      return true;
    } catch (e) {
      return false;
    }
  },

  async _reconcileLocalDueTasks() {
    let rows = await this._loadLocalTasks();
    if (!rows.length) return;
    const now = Date.now();
    let dirty = false;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      if (row.delivered) continue;
      const dueAt = Number(row.dueAt || 0) || 0;
      if (!dueAt || dueAt > now + 1500) continue;
      const payload = {
        kind: 'proactive',
        sessionId: String(row.sessionId || '').trim(),
        taskId: String(row.taskId || '').trim(),
        body: String(row.body || '').trim()
      };
      if (!payload.sessionId || !payload.body) continue;
      try {
        if (typeof Chat !== 'undefined' && Chat && typeof Chat.insertProactivePushMessage === 'function') {
          const ok = await Chat.insertProactivePushMessage(payload);
          if (ok) {
            row.delivered = true;
            row.deliveredAt = Date.now();
            dirty = true;
          }
        }
      } catch (e) {}
    }
    if (dirty) {
      // 清理老的已投递记录，避免无限增长
      rows = rows.filter((r) => {
        if (!r || typeof r !== 'object') return false;
        if (!r.delivered) return true;
        const ts = Number(r.deliveredAt || 0) || 0;
        return ts > Date.now() - 7 * 24 * 60 * 60 * 1000;
      });
      await this._saveLocalTasks(rows);
    }
  },

  startLocalReconciler() {
    try { if (this._localReconcileTimer) clearInterval(this._localReconcileTimer); } catch (e) {}
    this._localReconcileTimer = setInterval(() => {
      this._reconcileLocalDueTasks().catch(() => {});
    }, 5000);
    this._reconcileLocalDueTasks().catch(() => {});
    try {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this._reconcileLocalDueTasks().catch(() => {});
      });
      window.addEventListener('focus', () => this._reconcileLocalDueTasks().catch(() => {}));
      window.addEventListener('pageshow', () => this._reconcileLocalDueTasks().catch(() => {}));
      window.addEventListener('online', () => this._reconcileLocalDueTasks().catch(() => {}));
    } catch (e) {}
  },

  _getPushUserId() {
    // 与 TimerPage._getOrCreatePushUserId 保持兼容（避免引入循环依赖）
    try {
      if (typeof TimerPage !== 'undefined' && TimerPage && typeof TimerPage._getOrCreatePushUserId === 'function') {
        return String(TimerPage._getOrCreatePushUserId() || '').trim();
      }
    } catch (e) {}
    try {
      const v = (typeof Storage !== 'undefined' && Storage.get) ? Storage.get('yd_push_user_id') : null;
      if (v && v.id) return String(v.id);
    } catch (e) {}
    return '';
  },

  _clearSessionTimer(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const t = this._sessionTimers[sid];
    if (t) {
      try { clearTimeout(t); } catch (e) {}
      delete this._sessionTimers[sid];
    }
  },

  async _reportStatus({ level, message, sessionId }) {
    const msg = String(message || '').trim();
    if (!msg) return;
    const row = {
      ts: Date.now(),
      level: String(level || 'info'),
      message: msg,
      sessionId: String(sessionId || '').trim()
    };
    try {
      if (typeof Storage !== 'undefined' && Storage.kvSet) {
        await Storage.kvSet(this.STATUS_KEY, row);
      }
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent('yd:proactive-status', { detail: row }));
    } catch (e) {}
  },

  async _fetchPendingList() {
    const userId = this._getPushUserId();
    if (!userId) return [];
    try {
      if (location && String(location.protocol || '') === 'file:') return [];
    } catch (e) {}
    try {
      const res = await fetch(`/api/proactive/pending?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data?.items) ? data.items : [];
      return items;
    } catch (e) {
      return [];
    }
  },

  async syncPendingForSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    const list = await this._fetchPendingList();
    const one = list.find((it) => it && String(it.sessionId || '').trim() === sid) || null;
    if (!one) {
      delete this._pendingBySession[sid];
      return null;
    }
    const row = {
      taskId: String(one.taskId || '').trim(),
      sessionId: sid,
      dueAt: Number(one.dueAt || 0) || 0,
      title: String(one.title || '').trim(),
      body: String(one.body || '').trim()
    };
    this._pendingBySession[sid] = row;
    return row;
  },

  async ensureCountdownForSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    // 二次确保：进入会话先补偿一次本地到点消息。
    await this._reconcileLocalDueTasks();
    const canUseCloud = await this._isSystemPushReady();
    // 仅在“系统通知权限已开启 + Push订阅就绪”时走云端待发倒计时。
    const row = canUseCloud ? await this.syncPendingForSession(sid) : null;
    this._clearSessionTimer(sid);
    if (!row || !row.body) return;

    const now = Date.now();
    const dueAt = Number(row.dueAt || 0) || 0;
    const taskId = String(row.taskId || '').trim();
    const body = String(row.body || '').trim();

    if (dueAt > 0 && dueAt <= now) {
      try {
        if (typeof Chat !== 'undefined' && Chat && typeof Chat.insertProactivePushMessage === 'function') {
          await Chat.insertProactivePushMessage({ kind: 'proactive', sessionId: sid, taskId, body });
        }
      } catch (e) {}
      return;
    }

    const waitMs = Math.max(0, dueAt - now);
    this._sessionTimers[sid] = setTimeout(async () => {
      try {
        // 到点前再确认一下服务器仍有这条（避免被用户操作/其它端改掉）
        const latest = await this.syncPendingForSession(sid);
        const latestDue = Number(latest?.dueAt || 0) || 0;
        const latestTaskId = String(latest?.taskId || '').trim();
        const latestBody = String(latest?.body || '').trim();
        if (!latestBody) return;
        if (latestDue > Date.now() + 150) {
          // 被顺延了：重新挂一次倒计时
          await this.ensureCountdownForSession(sid);
          return;
        }
        if (typeof Chat !== 'undefined' && Chat && typeof Chat.insertProactivePushMessage === 'function') {
          await Chat.insertProactivePushMessage({ kind: 'proactive', sessionId: sid, taskId: latestTaskId, body: latestBody });
        }
      } catch (e) {}
    }, Math.min(waitMs, 0x7fffffff));
  },

  // 用户在等待期间发言：把待发送时间往后顺延，并同步更新服务器
  async deferPendingOnUserActivity(sessionId) {
    // 为保证“已安排时间”稳定可预期，默认不再因用户发言自动顺延。
    // 如后续要恢复顺延策略，建议改为显式开关并只作用于“非明确时间”的任务。
    return;
  },

  defaultConfig() {
    return {
      enabled: true,
      proactiveMin: 30,
      proactiveMax: 60,
      dndStart: 23,
      dndEnd: 8
    };
  },

  async loadConfig() {
    try {
      const row = await Storage.kvGet(this.CONFIG_KEY);
      if (row && typeof row === 'object') {
        return { ...this.defaultConfig(), ...row };
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem(this.LS_CONFIG_KEY);
      if (raw) {
        const row2 = JSON.parse(raw);
        if (row2 && typeof row2 === 'object') {
          return { ...this.defaultConfig(), ...row2 };
        }
      }
    } catch (e) {}
    return this.defaultConfig();
  },

  async saveConfig(cfg) {
    const next = { ...this.defaultConfig(), ...(cfg || {}) };
    try {
      await Storage.kvSet(this.CONFIG_KEY, next);
    } catch (e) {}
    try {
      localStorage.setItem(this.LS_CONFIG_KEY, JSON.stringify(next));
    } catch (e) {}
    return next;
  },

  onEnterSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    // 进入会话：检查是否有待发送主动消息并挂倒计时
    try {
      void this.ensureCountdownForSession(sid);
    } catch (e) {}
    try {
      void this._reconcileLocalDueTasks();
    } catch (e) {}
    // 再做一次延迟补偿，覆盖页面切换/恢复阶段的竞态窗口。
    try {
      setTimeout(() => this._reconcileLocalDueTasks().catch(() => {}), 400);
    } catch (e) {}
  },

  onLeaveSession(sessionId) {
    // 新模式：不再使用“离开会话触发 AI 生成主动消息”
    // 仅保留兼容方法，避免旧调用链报错。
  },

  async afterUserFlush(sessionId) {
    // 新模式：不再使用“每 N 轮触发 AI 生成主动消息”
    // 仅保留兼容方法，避免旧调用链报错。
  },

  _randomInt(a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  },

  _isDndHour(hour, dndStart, dndEnd) {
    const s = Math.max(0, Math.min(23, Math.floor(Number(dndStart) || 0)));
    const e = Math.max(0, Math.min(23, Math.floor(Number(dndEnd) || 0)));
    if (s === e) return false;
    if (s < e) return hour >= s && hour < e;
    return hour >= s || hour < e;
  },

  _computeDueAt(nowMs, minMin, maxMin, dndStart, dndEnd) {
    const nMin = Number(minMin);
    const nMax = Number(maxMin);
    const lo = Number.isFinite(nMin) ? Math.max(0, Math.floor(nMin)) : 0;
    const hiBase = Number.isFinite(nMax) ? Math.floor(nMax) : lo;
    const hi = Math.max(lo, Math.max(0, hiBase));
    let due = nowMs + this._randomInt(lo, hi) * 60 * 1000;
    for (let i = 0; i < 2000; i++) {
      const h = new Date(due).getHours();
      if (!this._isDndHour(h, dndStart, dndEnd)) break;
      due += 60 * 1000;
    }
    return due;
  },

  _parseAtDueAt(atText, nowMs = Date.now()) {
    const s = String(atText || '').trim();
    if (!s) return 0;

    // at=HH:mm -> 解析为“下一次该时间点”
    const hm = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (hm) {
      const h = Number(hm[1]);
      const m = Number(hm[2]);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
      if (h < 0 || h > 23 || m < 0 || m > 59) return 0;
      const d = new Date(nowMs);
      d.setSeconds(0, 0);
      d.setHours(h, m, 0, 0);
      let due = d.getTime();
      if (due <= nowMs) {
        d.setDate(d.getDate() + 1);
        due = d.getTime();
      }
      return due;
    }

    // at=YYYY-MM-DD HH:mm 或 YYYY-MM-DDTHH:mm
    const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})$/);
    if (m2) {
      const yy = Number(m2[1]);
      const mm = Number(m2[2]);
      const dd = Number(m2[3]);
      const hh = Number(m2[4]);
      const mi = Number(m2[5]);
      if (
        !Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd) ||
        !Number.isFinite(hh) || !Number.isFinite(mi)
      ) return 0;
      const dt = new Date(yy, mm - 1, dd, hh, mi, 0, 0).getTime();
      return Number.isFinite(dt) && dt > 0 ? dt : 0;
    }

    return 0;
  },

  async scheduleFromSystemAction({ sessionId, body, delayMinutes = null, atText = '', cancel = false } = {}) {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;

    const cfg = await this.loadConfig();
    if (!cfg.enabled) return false;
    const bodyText = String(body || '').trim();

    const now = Date.now();
    let dueAt = 0;
    let explicitAiTime = false;
    if (cancel) {
      try {
        const canUseCloud = await this._isSystemPushReady();
        const row = canUseCloud ? (this._pendingBySession[sid] || (await this.syncPendingForSession(sid))) : null;
        const taskId = String(row?.taskId || '').trim();
        if (taskId && canUseCloud) {
          const uid = this._getPushUserId();
          if (uid) this._deleteCloudTaskInBackground(uid, taskId, sid);
        }
        if (taskId) await this._removeLocalTask(taskId);
      } catch (e) {}
      try { await this._removeUndeliveredLocalTasksBySession(sid); } catch (e2) {}
      delete this._pendingBySession[sid];
      this._clearSessionTimer(sid);
      try {
        await Storage.kvSet(this.LOCAL_PREVIEW_KEY, {
          sessionId: sid,
          source: 'system-action',
          dueAt: 0,
          title: '',
          body: '',
          canceled: true,
          createdAt: Date.now()
        });
        window.dispatchEvent(new CustomEvent('yd:proactive-local-preview', { detail: { sessionId: sid } }));
      } catch (e2) {}
      return true;
    } else if (!bodyText) {
      return false;
    } else if (String(atText || '').trim()) {
      dueAt = this._parseAtDueAt(String(atText || '').trim(), now);
      if (dueAt > 0) explicitAiTime = true;
    } else if (Number.isFinite(delayMinutes) && delayMinutes !== null) {
      const dm = Math.floor(Number(delayMinutes));
      // AI 给出的合法时间优先使用；只有无效时间才回退系统随机。
      if (dm >= 0) {
        dueAt = now + dm * 60 * 1000;
        explicitAiTime = true;
      }
    }

    // 未给时间/不可靠：回退系统随机时间
    if (!dueAt) {
      dueAt = this._computeDueAt(now, cfg.proactiveMin, cfg.proactiveMax, cfg.dndStart, cfg.dndEnd);
    } else {
      // 最后防护：勿扰时间段顺延
      for (let i = 0; i < 2000; i++) {
        const h = new Date(dueAt).getHours();
        if (!this._isDndHour(h, cfg.dndStart, cfg.dndEnd)) break;
        dueAt += 60 * 1000;
      }
    }

    let session = null;
    try {
      session = await Storage.dbGet('sessions', sid);
    } catch (e) {}
    try {
      await Storage.kvSet(this.LOCAL_PREVIEW_KEY, {
        sessionId: sid,
        source: 'system-action',
        dueAt,
        title: String(session?.title || '').trim(),
        body: bodyText,
        createdAt: Date.now()
      });
      window.dispatchEvent(new CustomEvent('yd:proactive-local-preview', { detail: { sessionId: sid } }));
    } catch (e) {}

    const userId =
      typeof TimerPage !== 'undefined' && TimerPage._getOrCreatePushUserId
        ? TimerPage._getOrCreatePushUserId()
        : '';
    if (!userId) return false;

    const taskSeed = (typeof State !== 'undefined' && State.generateId) ? State.generateId() : `${Date.now()}`;
    const taskId = explicitAiTime ? `p_ai_exact_${taskSeed}` : `p_${taskSeed}`;
    const title =
      String(session?.title || '').trim() ||
      '主动消息';

    // 本地账本优先：无论走本地还是云端都先入账，保证“权限未开/网络波动”不丢计划。
    try { await this._removeUndeliveredLocalTasksBySession(sid); } catch (e) {}
    await this._upsertLocalTask({
      taskId,
      sessionId: sid,
      dueAt,
      title,
      body: bodyText,
      delivered: false,
      createdAt: Date.now()
    });
    await this._reconcileLocalDueTasks();

    // When opened as file:// (origin null), /api/* becomes file:///api/* and will be blocked by CORS.
    // Local preview is still useful for debugging; just skip server scheduling in this case.
    try {
      if (location && String(location.protocol || '') === 'file:') {
        return true;
      }
    } catch (e) {}

    const canUseCloud = await this._isSystemPushReady();
    if (canUseCloud) {
      this._scheduleCloudPushInBackground({
        userId,
        sessionId: sid,
        taskId,
        dueAt,
        title,
        body: bodyText
      });
    }
    return true;
  }
};

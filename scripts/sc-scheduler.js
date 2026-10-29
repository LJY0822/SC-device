// Local-only plans. Durable delivery ids prevent duplicates on reopening.
const ProactiveScheduler = {
  CONFIG_KEY: 'timer_proactive_config_v1', LOCAL_PREVIEW_KEY: 'proactive_local_preview_v1',
  LOCAL_TASKS_KEY: 'proactive_local_tasks_v1', STATUS_KEY: 'proactive_status_v1',
  _queue: Promise.resolve(),
  _exclusive(fn) {
    const run = () => navigator.locks ? navigator.locks.request('sc-proactive', fn) : fn();
    const result = this._queue.then(run, run);
    this._queue = result.catch(() => {});
    return result;
  },
  defaultConfig() { return { enabled: false, proactiveMin: 30, proactiveMax: 60, dndStart: 23, dndEnd: 8 }; },
  async loadConfig() { return { ...this.defaultConfig(), ...await Storage.kvGet(this.CONFIG_KEY) }; },
  async saveConfig(cfg) {
    return this._exclusive(async () => {
      const next = { ...this.defaultConfig(), ...cfg };
      for (const key of ['proactiveMin', 'proactiveMax', 'dndStart', 'dndEnd']) {
        if (!Number.isFinite(Number(next[key])) || Number(next[key]) < 0) throw new Error('定时时间无效');
        next[key] = Number(next[key]);
      }
      if (next.proactiveMax < next.proactiveMin || next.dndStart > 23 || next.dndEnd > 23) throw new Error('定时时间范围无效');
      await Storage.kvSet(this.CONFIG_KEY, next);
      if (!next.enabled) {
        const sessions=await Storage.dbGetAll('sessions');
        const explicit=new Set(sessions.filter(s=>s.scProactiveEnabled===true).map(s=>s.id));
        await Storage.kvSet(this.LOCAL_TASKS_KEY,(await this._loadLocalTasks()).filter(r=>r.delivered||explicit.has(r.sessionId)));
      }
      return next;
    });
  },
  async _loadLocalTasks() { return await Storage.kvGet(this.LOCAL_TASKS_KEY) || []; },
  async getLocalPendingTasks() { return (await this._loadLocalTasks()).filter(r => !r.delivered).sort((a,b) => a.dueAt-b.dueAt); },
  async deleteTaskById(taskId) {
    return this._exclusive(async () => {
      await Storage.kvSet(this.LOCAL_TASKS_KEY, (await this._loadLocalTasks()).filter(r => r.taskId !== taskId));
      return true;
    });
  },
  async syncPendingForSession(sessionId) { return (await this.getLocalPendingTasks()).find(r => r.sessionId === sessionId) || null; },
  _isDndHour(h, start, end) { return start === end ? false : start < end ? h >= start && h < end : h >= start || h < end; },
  _parseAtDueAt(text, now) {
    const hm = text.match(/^(\d{1,2}):(\d{2})$/);
    if (hm) {
      if (+hm[1] > 23 || +hm[2] > 59) throw new Error('主动消息时间无效');
      const date = new Date(now); date.setHours(+hm[1], +hm[2], 0, 0);
      if (+date <= now) date.setDate(date.getDate()+1);
      return +date;
    }
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!m) throw new Error('主动消息日期无效');
    const date = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
    if (date.getFullYear() !== +m[1] || date.getMonth() !== +m[2]-1 || date.getDate() !== +m[3] || date.getHours() !== +m[4] || date.getMinutes() !== +m[5]) throw new Error('主动消息日期无效');
    return +date;
  },
  async scheduleFromSystemAction({ sessionId, body, delayMinutes = null, atText = '', cancel = false, characterId = '', characterName = '' } = {}) {
    if (!sessionId) return false;
    return this._exclusive(async () => {
      const cfg = await this.loadConfig();
      const session = await Storage.dbGet('sessions', sessionId);
      if (!session) return false;
      let rows = await this._loadLocalTasks();
      const sameOwner = r => r.sessionId === sessionId && (!characterId || r.characterId === characterId);
      if (cancel) { await Storage.kvSet(this.LOCAL_TASKS_KEY, rows.filter(r => r.delivered || !sameOwner(r))); return true; }
      if (!(session.scProactiveEnabled ?? cfg.enabled) || !String(body || '').trim()) return false;
      const now = Date.now();
      const delay = delayMinutes == null ? cfg.proactiveMin + Math.floor(Math.random()*(cfg.proactiveMax-cfg.proactiveMin+1)) : Number(delayMinutes);
      if (!Number.isFinite(delay) || delay < 0) throw new Error('主动消息延时无效');
      let dueAt = atText ? this._parseAtDueAt(atText, now) : now+delay*60000;
      if (dueAt < now) throw new Error('不能安排过去的主动消息');
      while (this._isDndHour(new Date(dueAt).getHours(), cfg.dndStart, cfg.dndEnd)) dueAt += 60000;
      const row = { taskId: State.generateId(), sessionId, body: String(body).trim(), dueAt, createdAt: now, title: session.title || '主动消息', characterId, characterName, delivered: false };
      rows = rows.filter(r => !sameOwner(r) || r.delivered); rows.push(row);
      await Storage.kvSet(this.LOCAL_TASKS_KEY, rows);
      await Storage.kvSet(this.LOCAL_PREVIEW_KEY, row);
      window.dispatchEvent(new CustomEvent('yd:proactive-local-preview'));
      return true;
    });
  },
  async _reconcileLocalDueTasks() {
    if (document.hidden || this.importing) return;
    return this._exclusive(async () => {
      const cfg = await this.loadConfig(); const rows = await this._loadLocalTasks();
      for (const row of rows) {
        if (row.delivered || row.dueAt > Date.now()) continue;
        const session = await Storage.dbGet('sessions', row.sessionId);
        if (!session || !(session.scProactiveEnabled ?? cfg.enabled)) continue;
        if (await Chat.insertProactivePushMessage(row)) {
          row.delivered = true; row.deliveredAt = Date.now();
          await Storage.kvSet(this.LOCAL_TASKS_KEY, rows);
        }
      }
    });
  },
  startLocalReconciler() {
    if (this._timer) return;
    const check = () => this._reconcileLocalDueTasks().catch(e => console.error('主动消息投递失败', e));
    this._timer = setInterval(check, 5000); document.addEventListener('visibilitychange', check); window.addEventListener('focus', check); check();
  },
  onEnterSession() { void this._reconcileLocalDueTasks().catch(console.error); },
  onLeaveSession() {}, async afterUserFlush() {}, async deferPendingOnUserActivity() {}
};

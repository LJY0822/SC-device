// 日历本地提醒（横幅通知 + 可选系统通知）
const CalendarReminders = {
  FIRED_KEY: 'calendar_reminder_fired_v1',
  _timer: null,

  start() {
    try {
      if (this._timer) clearInterval(this._timer);
    } catch (e) {}
    this._timer = setInterval(() => {
      this.reconcile().catch(() => {});
    }, 60 * 1000);
    this.reconcile().catch(() => {});
    try {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.reconcile().catch(() => {});
      });
      window.addEventListener('focus', () => this.reconcile().catch(() => {}));
    } catch (e) {}
  },

  async _getConfig() {
    try {
      const cfg = await Storage.kvGet(CalendarPage.CONFIG_KEY);
      return CycleEngine.normalizeConfig(cfg);
    } catch (e) {
      return CycleEngine.normalizeConfig(null);
    }
  },

  async _getFiredMap() {
    try {
      const row = await Storage.kvGet(this.FIRED_KEY);
      return row && typeof row === 'object' ? row : {};
    } catch (e) {
      return {};
    }
  },

  async _markFired(key) {
    const k = String(key || '').trim();
    if (!k) return;
    const map = await this._getFiredMap();
    map[k] = Date.now();
    const keys = Object.keys(map);
    if (keys.length > 400) {
      keys.sort((a, b) => (map[a] || 0) - (map[b] || 0));
      keys.slice(0, keys.length - 300).forEach((id) => delete map[id]);
    }
    await Storage.kvSet(this.FIRED_KEY, map);
  },

  async _alreadyFired(key) {
    const map = await this._getFiredMap();
    return !!map[String(key || '').trim()];
  },

  _nextOccurrenceDayKey(ev, refDayKey) {
    const date = String(ev?.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const ref = refDayKey || CycleEngine.dayKeyFromTs(Date.now());
    if (ev.repeat === 'yearly') {
      const refD = CycleEngine.parseDayKey(ref);
      if (!refD) return null;
      let y = refD.getFullYear();
      let target = `${y}-${date.slice(5)}`;
      if (CycleEngine.daysBetween(ref, target) < 0) target = `${y + 1}-${date.slice(5)}`;
      return target;
    }
    if (CycleEngine.daysBetween(ref, date) >= 0) return date;
    return null;
  },

  _notify(app, body) {
    const text = String(body || '').trim();
    if (!text) return;
    try {
      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        Notifications.enqueue('日历', '', text, 0);
        return;
      }
    } catch (e) {}
    try {
      if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast(text);
    } catch (e2) {}
  },

  async _characterName(id) {
    const cid = String(id || '').trim();
    if (!cid) return '';
    try {
      const c = await Storage.dbGet('characters', cid);
      return String(c?.name || c?.data?.name || '').trim();
    } catch (e) {
      return '';
    }
  },

  async reconcile() {
    const cfg = await this._getConfig();
    if (cfg.remindEventsEnabled !== false) {
      await this._reconcileEvents(cfg);
    }
    await this._reconcilePeriod(cfg);
  },

  async _reconcileEvents(cfg) {
    let events = [];
    try {
      events = await Storage.kvGet(CalendarPage.EVENTS_KEY);
    } catch (e) {}
    if (!Array.isArray(events) || !events.length) return;

    const today = CycleEngine.dayKeyFromTs(Date.now());
    const offsets = Array.isArray(cfg.remindDaysBefore) && cfg.remindDaysBefore.length
      ? cfg.remindDaysBefore.map((n) => Math.max(0, Math.min(30, Number(n) || 0)))
      : [0, 1];

    for (const ev of events) {
      if (ev && ev.remindEnabled === false) continue;
      const target = this._nextOccurrenceDayKey(ev, today);
      if (!target) continue;

      const typeLabel = ev.type === 'birthday' ? '生日' : (ev.type === 'anniversary' ? '纪念日' : '日程');
      const title = typeof CalendarPage !== 'undefined' && CalendarPage.formatEventDisplayTitle
        ? CalendarPage.formatEventDisplayTitle(ev)
        : (String(ev.title || '').trim() || '未命名');
      const namePart = '';

      for (const offset of offsets) {
        const remindOn = offset === 0 ? target : CycleEngine.addDays(target, -offset);
        if (!remindOn || remindOn !== today) continue;
        const fireKey = `ev:${ev.id}:${target}:${offset}`;
        if (await this._alreadyFired(fireKey)) continue;

        let body = '';
        if (offset === 0) body = `今天是${namePart}${title}的${typeLabel}`;
        else if (offset === 1) body = `明天是${namePart}${title}的${typeLabel}`;
        else body = `${offset} 天后（${target.slice(5).replace('-', '月')}日）是${namePart}${title}的${typeLabel}`;

        this._notify('日历', body);
        await this._markFired(fireKey);
      }
    }
  },

  async _reconcilePeriod(cfg) {
    let logs = [];
    try {
      logs = await Storage.kvGet(CalendarPage.PERIOD_LOGS_KEY);
    } catch (e) {}
    const list = CycleEngine.normalizeLogs(logs);
    if (!list.length) return;

    const pred = CycleEngine.predictNextPeriod(list, cfg, CycleEngine.dayKeyFromTs(Date.now()));
    if (!pred || !pred.start) return;

    const today = CycleEngine.dayKeyFromTs(Date.now());
    const offsets = [0, 1];

    for (const offset of offsets) {
      const remindOn = offset === 0 ? pred.start : CycleEngine.addDays(pred.start, -offset);
      if (remindOn !== today) continue;
      const fireKey = `period:${pred.start}:${offset}`;
      if (await this._alreadyFired(fireKey)) continue;

      const body =
        offset === 0
          ? '预计今天开始进入经期，记得照顾好自己'
          : '预计明天开始进入经期，可以提前准备一下';
      this._notify('日历', body);
      await this._markFired(fireKey);
    }
  },
};

// 日历：纪念日 / 生日 / 经期记录与预测
const CalendarPage = {
  CONFIG_KEY: 'calendar_config_v1',
  PERIOD_LOGS_KEY: 'calendar_period_logs_v1',
  EVENTS_KEY: 'calendar_events_v1',

  _viewYear: 0,
  _viewMonth: 0,
  _selectedDayKey: null,
  _config: null,
  _periodLogs: [],
  _events: [],
  _editingEventId: null,
  _editingPeriodStartDate: null,
  _sheetCharacters: [],
  _touchStartX: 0,

  async init() {
    const now = new Date();
    this._viewYear = now.getFullYear();
    this._viewMonth = now.getMonth();
    this._selectedDayKey = CycleEngine.dayKeyFromTs(now.getTime());

    document.getElementById('calendar-back')?.addEventListener('click', () => State.backToHome());
    document.getElementById('calendar-prev-month')?.addEventListener('click', () => this._shiftMonth(-1));
    document.getElementById('calendar-next-month')?.addEventListener('click', () => this._shiftMonth(1));
    document.getElementById('calendar-today-btn')?.addEventListener('click', () => this._goToday());
    document.getElementById('calendar-add-event')?.addEventListener('click', () => this._openEventSheet());
    document.getElementById('calendar-event-type')?.addEventListener('change', () => {
      const ev = this._editingEventId
        ? this._events.find((e) => e.id === this._editingEventId)
        : null;
      this._syncSheetForType(ev);
    });
    document.getElementById('calendar-char-select-all')?.addEventListener('click', (e) => {
      e.preventDefault();
      this._toggleCharacterSelectAll();
    });
    document.getElementById('calendar-char-pick')?.addEventListener('change', (e) => {
      if (e.target?.classList?.contains('cal-char-cb')) this._syncCharacterSelectAllBtn();
    });
    const grid = document.getElementById('calendar-grid');
    grid?.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-day-key]');
      if (!cell) return;
      const key = cell.getAttribute('data-day-key');
      if (key) this._selectDay(key);
    });

    const swipeEl = document.getElementById('calendar-month-swipe');
    swipeEl?.addEventListener('touchstart', (e) => {
      this._touchStartX = e.changedTouches?.[0]?.clientX ?? 0;
    }, { passive: true });
    swipeEl?.addEventListener('touchend', (e) => {
      const x = e.changedTouches?.[0]?.clientX ?? 0;
      const dx = x - this._touchStartX;
      if (Math.abs(dx) < 50) return;
      this._shiftMonth(dx > 0 ? -1 : 1);
    }, { passive: true });

    const sheet = document.getElementById('calendar-event-sheet');
    sheet?.querySelectorAll('[data-cal-act="close"]').forEach((el) => {
      el.addEventListener('click', () => this._closeEventSheet());
    });
    sheet?.addEventListener('click', (e) => {
      if (e.target === sheet) this._closeEventSheet();
    });
    document.getElementById('calendar-event-save')?.addEventListener('click', () => void this._saveEventFromSheet());
    document.getElementById('calendar-event-delete')?.addEventListener('click', () => void this._deleteEventFromSheet());

    document.getElementById('calendar-day-events')?.addEventListener('click', (e) => {
      const periodRow = e.target.closest('[data-period-start]');
      if (periodRow) {
        const start = periodRow.getAttribute('data-period-start');
        if (start) void this._openEventSheet(null, { periodStartDate: start });
        return;
      }
      const row = e.target.closest('[data-event-id]');
      if (!row) return;
      const id = row.getAttribute('data-event-id');
      if (id) void this._openEventSheet(id);
    });

    document.getElementById('calendar-upcoming-list')?.addEventListener('click', (e) => {
      const row = e.target.closest('.yd-cal-upcoming-row');
      if (!row) return;
      const dayKey = row.getAttribute('data-day-key');
      if (dayKey) this._selectDay(dayKey);
      const periodStart = row.getAttribute('data-period-start');
      if (periodStart) {
        void this._openEventSheet(null, { periodStartDate: periodStart });
        return;
      }
      const eventId = row.getAttribute('data-event-id');
      if (eventId) void this._openEventSheet(eventId);
    });

    window.addEventListener('yd:pagechange', (e) => {
      const to = e?.detail?.to || '';
      if (to === 'page-calendar') void this.refresh();
    });

    await this.refresh();
  },

  async _loadAll() {
    try {
      const cfg = await Storage.kvGet(this.CONFIG_KEY);
      this._config = CycleEngine.normalizeConfig(cfg);
    } catch (e) {
      this._config = CycleEngine.normalizeConfig(null);
    }
    try {
      const logs = await Storage.kvGet(this.PERIOD_LOGS_KEY);
      this._periodLogs = CycleEngine.normalizeLogs(logs);
    } catch (e) {
      this._periodLogs = [];
    }
    try {
      const ev = await Storage.kvGet(this.EVENTS_KEY);
      this._events = Array.isArray(ev)
        ? ev.filter((x) => x && x.id).map((x) => this._normalizeEvent(x))
        : [];
    } catch (e) {
      this._events = [];
    }
  },

  async _saveConfig(patch) {
    this._config = CycleEngine.normalizeConfig({ ...this._config, ...patch });
    await Storage.kvSet(this.CONFIG_KEY, this._config);
    this._renderMonth();
    this._renderDayPanel();
  },

  async _savePeriodLogs() {
    await Storage.kvSet(this.PERIOD_LOGS_KEY, this._periodLogs);
    this._renderMonth();
    this._renderDayPanel();
    this._renderUpcoming().catch(() => {});
  },

  async _saveEvents() {
    await Storage.kvSet(this.EVENTS_KEY, this._events);
    this._renderMonth();
    this._renderDayPanel();
    this._renderUpcoming().catch(() => {});
  },

  async refresh() {
    await this._loadAll();
    await this._loadSheetCharacters();
    this._renderMonth();
    this._renderDayPanel();
    this._renderUpcoming().catch(() => {});
  },

  _shiftMonth(delta) {
    let m = this._viewMonth + delta;
    let y = this._viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    this._viewMonth = m;
    this._viewYear = y;
    this._renderMonth();
  },

  _goToday() {
    const now = new Date();
    this._viewYear = now.getFullYear();
    this._viewMonth = now.getMonth();
    this._selectDay(CycleEngine.dayKeyFromTs(now.getTime()));
  },

  _selectDay(dayKey) {
    this._selectedDayKey = dayKey;
    this._renderMonth();
    this._renderDayPanel();
  },

  _getUserDisplayName() {
    try {
      const name = String(Storage.get('user_name') || '').trim();
      if (name) return name;
    } catch (e) {}
    return '我';
  },

  _normalizeEvent(ev) {
    if (!ev || typeof ev !== 'object') return ev;
    const out = { ...ev };
    if (out.type === 'birthday') {
      if (!out.birthdaySubject) {
        if (out.birthdayCharacterId) {
          out.birthdaySubject = 'character';
        } else {
          const t = String(out.title || '').trim();
          if (!t || t === '我' || t === '我的' || t === '自己' || t.includes('我的生日')) {
            out.birthdaySubject = 'self';
          }
        }
      }
    }
    if (out.characterLinkMode === 'all') {
      out.linkedCharacterIds = Array.isArray(out.linkedCharacterIds) ? out.linkedCharacterIds : [];
    } else if (Array.isArray(out.linkedCharacterIds) && out.linkedCharacterIds.length) {
      out.characterLinkMode = out.characterLinkMode || 'multi';
    } else if (out.linkedCharacterId) {
      out.linkedCharacterIds = [String(out.linkedCharacterId)];
      out.characterLinkMode = out.characterLinkMode || 'single';
    } else {
      out.linkedCharacterIds = [];
      out.characterLinkMode = out.characterLinkMode || 'none';
    }
    return out;
  },

  getLinkedCharacterIds(ev) {
    const e = this._normalizeEvent(ev);
    if (!e) return [];
    if (e.characterLinkMode === 'all') return ['__all__'];
    return (e.linkedCharacterIds || []).map((id) => String(id)).filter(Boolean);
  },

  _getCharacterDisplayName(characterId) {
    const id = String(characterId || '').trim();
    if (!id) return '角色';
    const c = (this._sheetCharacters || []).find((x) => String(x.id) === id);
    if (c) return String(c.name || c.data?.name || '未命名').trim();
    return '角色';
  },

  /** 供聊天 API：区分用户生日 / 角色生日，避免「我的生日」歧义 */
  formatEventApiLabel(ev) {
    const e = this._normalizeEvent(ev || {});
    if (e.type === 'birthday') {
      if (e.birthdaySubject === 'self') {
        const userName = this._getUserDisplayName();
        return `用户本人（${userName}）生日 → 角色应向用户祝贺，勿当成角色自己的生日`;
      }
      if (e.birthdaySubject === 'character' && e.birthdayCharacterId) {
        const name = this._getCharacterDisplayName(e.birthdayCharacterId);
        return `角色「${name}」生日 → 可向 Ta 自然祝福`;
      }
      return `生日：${this.formatEventDisplayTitle(e)}`;
    }
    if (e.type === 'anniversary') {
      return `纪念日「${this.formatEventDisplayTitle(e)}」`;
    }
    return this.formatEventDisplayTitle(e);
  },

  _formatDayKeyWithWeek(dayKey, todayKey) {
    const d = CycleEngine.parseDayKey(dayKey);
    if (!d) return String(dayKey || '');
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    const suffix = dayKey === todayKey ? '·今天' : '';
    return `${dayKey}（${week}${suffix}）`;
  },

  _periodTag(recorded) {
    return recorded ? '（记录）' : '（预计）';
  },

  _appendPeriodItemsToTimeline(items, seen, today, pastDays, futureDays, cfg) {
    const logs = this._periodLogs || [];
    if (!logs.length) return;
    const periodLenDefault = CycleEngine._estimatePeriodLength(logs, cfg);

    const pushPeriodPoint = (kind, dayKey, recorded) => {
      const diff = CycleEngine.daysBetween(today, dayKey);
      if (diff < -pastDays || diff > futureDays) return;
      const key = `${kind}:${dayKey}:${recorded ? 'r' : 'p'}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ kind, target: dayKey, diff, recorded });
    };

    for (const log of logs) {
      const start = log.startDate;
      let end = String(log.endDate || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        end = CycleEngine.addDays(start, periodLenDefault - 1);
      }
      pushPeriodPoint('period_start', start, true);
      if (end && end !== start) {
        pushPeriodPoint('period_end', end, true);
      }
    }

    const pred = CycleEngine.predictNextPeriod(logs, cfg, today);
    if (pred?.start) {
      pushPeriodPoint('period_start', pred.start, false);
      if (pred.end && pred.end !== pred.start) {
        pushPeriodPoint('period_end', pred.end, false);
      }
    }
  },

  _formatTimelineEntry(it) {
    const rel = this._formatScheduleWhen(it.diff);
    if (it.kind === 'period_start') {
      return `${it.target} · ${this._periodTag(it.recorded)}经期开始（${rel}）`;
    }
    if (it.kind === 'period_end') {
      return `${it.target} · ${this._periodTag(it.recorded)}经期结束（${rel}）`;
    }
    const ev = it.ev;
    const label = this.formatEventApiLabel(ev);
    const typeHint = ev.type === 'birthday' ? '' : (ev.type === 'anniversary' ? '' : '日程·');
    return `${it.target} · ${typeHint}${label}（${rel}）`;
  },

  _formatTodayCyclePhaseLine(today) {
    const cfg = this._config || CycleEngine.normalizeConfig(null);
    if (!cfg.cycleTrackingEnabled || !(this._periodLogs || []).length) return null;
    const info = CycleEngine.getPhaseForDay(today, this._periodLogs, cfg);
    if (!info || info.phase === 'unknown') return null;

    let tag = '（推断）';
    if (info.phase === 'menstrual') tag = '（记录）';
    else if (info.phase === 'menstrual_predicted') tag = '（预计）';

    const conf = info.confidence === 'low' ? '，仅供参考' : '';
    return `${today} · ${tag}当前月经阶段：${info.label}（周期约第 ${info.cycleDay}/${info.cycleLen} 天${conf}）`;
  },

  async _collectTimelineItemsForParticipants(participantIds, today, pastDays = 45, futureDays = 21) {
    await this._loadSheetCharacters();
    const cfg = this._config || CycleEngine.normalizeConfig(null);
    const all = this._collectRecentScheduleItems(today, pastDays, futureDays);
    return all.filter((it) => {
      if (it.kind === 'event') {
        return this._eventMatchesParticipants(it.ev, participantIds);
      }
      return !!cfg.cycleTrackingEnabled;
    });
  },

  _buildTimelineSection(title, entries) {
    if (!entries.length) return '';
    return [`── ${title} ──`, ...entries, ''].join('\n');
  },

  formatEventDisplayTitle(ev) {
    const e = this._normalizeEvent(ev || {});
    const raw = String(e.title || '').trim();
    if (e.type === 'birthday') {
      if (e.birthdaySubject === 'self') return '我的生日';
      if (e.birthdaySubject === 'character' && e.birthdayCharacterId) {
        const c = (this._sheetCharacters || []).find((x) => String(x.id) === String(e.birthdayCharacterId));
        const name = c ? String(c.name || c.data?.name || '').trim() : raw;
        if (name) return name.endsWith('的生日') ? name : `${name}的生日`;
      }
      if (!raw) return '生日';
      if (raw.endsWith('的生日')) return raw;
      return `${raw}的生日`;
    }
    if (e.type === 'anniversary') return raw || '纪念日';
    return raw || '日程';
  },

  _eventMatchesParticipants(ev, participantIds) {
    const ids = (participantIds || []).map((id) => String(id)).filter(Boolean);
    if (!ids.length) return false;
    const e = this._normalizeEvent(ev);
    const mode = e.characterLinkMode || 'none';
    if (mode === 'none' && !this.getLinkedCharacterIds(e).length) return false;
    if (mode === 'all' || this.getLinkedCharacterIds(e).includes('__all__')) return true;
    const linked = this.getLinkedCharacterIds(e).filter((id) => id !== '__all__');
    return linked.some((id) => ids.includes(id));
  },

  async _loadSheetCharacters() {
    let chars = [];
    try {
      chars = await Storage.dbGetAll('characters');
    } catch (e) {}
    this._sheetCharacters = (chars || []).filter((c) => c && c.id);
    return this._sheetCharacters;
  },

  _selectedIdsFromEvent(ev) {
    const normalized = this._normalizeEvent(ev || {});
    const mode = normalized.characterLinkMode || 'none';
    if (mode === 'all') {
      return new Set(this._sheetCharacters.map((c) => String(c.id)));
    }
    if (mode === 'none') return new Set();
    return new Set(this.getLinkedCharacterIds(normalized).filter((id) => id !== '__all__'));
  },

  async _renderBirthdaySubjectUI(ev) {
    const pickEl = document.getElementById('calendar-birthday-subject-pick');
    if (!pickEl) return;
    await this._loadSheetCharacters();
    const normalized = this._normalizeEvent(ev || {});
    let selected = 'self';
    if (normalized.birthdaySubject === 'character' && normalized.birthdayCharacterId) {
      selected = `char:${normalized.birthdayCharacterId}`;
    } else if (normalized.birthdaySubject === 'self') {
      selected = 'self';
    }
    const userName = this._getUserDisplayName();
    const rows = [
      `<label class="yd-cal-birthday-pick__row"><input type="radio" name="cal-birthday-subject" value="self"${selected === 'self' ? ' checked' : ''} /><span>我自己（${this._escapeHtml(userName)}）</span></label>`,
    ];
    for (const c of this._sheetCharacters) {
      const id = String(c.id);
      const name = String(c.name || c.data?.name || '未命名').trim();
      const val = `char:${id}`;
      const on = selected === val ? ' checked' : '';
      rows.push(
        `<label class="yd-cal-birthday-pick__row"><input type="radio" name="cal-birthday-subject" value="${this._escapeHtml(val)}"${on} /><span>${this._escapeHtml(name)}</span></label>`
      );
    }
    if (!this._sheetCharacters.length) {
      rows.push('<p class="yd-cal-char-pick__hint">暂无角色，仅可记录我自己的生日</p>');
    }
    pickEl.innerHTML = rows.join('');
  },

  _readBirthdaySubjectFromSheet() {
    const checked = document.querySelector('input[name="cal-birthday-subject"]:checked');
    if (!checked) return null;
    const val = String(checked.value || '').trim();
    if (val === 'self') {
      return { birthdaySubject: 'self', birthdayCharacterId: null, title: '我' };
    }
    if (val.startsWith('char:')) {
      const id = val.slice(5);
      const c = this._sheetCharacters.find((x) => String(x.id) === id);
      const name = c ? String(c.name || c.data?.name || '未命名').trim() : '角色';
      return { birthdaySubject: 'character', birthdayCharacterId: id, title: name };
    }
    return null;
  },

  async _renderCharacterLinkUI(ev) {
    const pickEl = document.getElementById('calendar-char-pick');
    const allBtn = document.getElementById('calendar-char-select-all');
    const boxEl = pickEl?.closest('.yd-cal-char-pick-box');
    if (!pickEl) return;
    await this._loadSheetCharacters();
    if (!this._sheetCharacters.length) {
      if (allBtn) allBtn.hidden = true;
      if (boxEl) boxEl.hidden = false;
      pickEl.innerHTML = '<p class="yd-cal-char-pick__hint">暂无角色，请先在角色库创建</p>';
      return;
    }
    if (allBtn) allBtn.hidden = false;
    if (boxEl) boxEl.hidden = false;
    const selected = this._selectedIdsFromEvent(ev);
    this._renderCharacterPickList(selected);
  },

  _renderCharacterPickList(selected) {
    const pickEl = document.getElementById('calendar-char-pick');
    if (!pickEl || !this._sheetCharacters.length) return;
    const selectedSet = selected instanceof Set ? selected : new Set(selected || []);
    pickEl.innerHTML = this._sheetCharacters.map((c) => {
      const id = String(c.id);
      const name = String(c.name || c.data?.name || '未命名').trim();
      const on = selectedSet.has(id) ? ' checked' : '';
      return `<label class="yd-cal-char-pick__row"><input type="checkbox" class="cal-char-cb" value="${this._escapeHtml(id)}"${on} /><span class="yd-cal-char-pick__name">${this._escapeHtml(name)}</span></label>`;
    }).join('');
    this._syncCharacterSelectAllBtn();
  },

  _getCharacterCheckboxes() {
    const pickEl = document.getElementById('calendar-char-pick');
    return pickEl ? Array.from(pickEl.querySelectorAll('.cal-char-cb')) : [];
  },

  _toggleCharacterSelectAll() {
    const boxes = this._getCharacterCheckboxes();
    if (!boxes.length) return;
    const allOn = boxes.every((cb) => cb.checked);
    boxes.forEach((cb) => { cb.checked = !allOn; });
    this._syncCharacterSelectAllBtn();
  },

  _syncCharacterSelectAllBtn() {
    const btn = document.getElementById('calendar-char-select-all');
    const boxes = this._getCharacterCheckboxes();
    if (!btn || !boxes.length) return;
    const allOn = boxes.every((cb) => cb.checked);
    btn.classList.toggle('yd-cal-char-pick__all--on', allOn);
    btn.setAttribute('aria-pressed', allOn ? 'true' : 'false');
  },

  _readCharacterLinkFromSheet() {
    const allIds = this._sheetCharacters.map((c) => String(c.id));
    const ids = this._getCharacterCheckboxes()
      .filter((cb) => cb.checked)
      .map((cb) => String(cb.value || '').trim())
      .filter(Boolean);
    if (!ids.length) {
      return { characterLinkMode: 'none', linkedCharacterIds: [], linkedCharacterId: null };
    }
    if (allIds.length && ids.length === allIds.length && allIds.every((id) => ids.includes(id))) {
      return { characterLinkMode: 'all', linkedCharacterIds: allIds, linkedCharacterId: allIds[0] || null };
    }
    return {
      characterLinkMode: 'multi',
      linkedCharacterIds: ids,
      linkedCharacterId: ids[0] || null,
    };
  },

  _syncSheetForType(ev) {
    const type = String(document.getElementById('calendar-event-type')?.value || 'anniversary');
    const titleWrap = document.getElementById('calendar-event-title-wrap');
    const birthdayWrap = document.getElementById('calendar-birthday-subject-wrap');
    const periodFields = document.getElementById('calendar-sheet-period-fields');
    const charWrap = document.getElementById('calendar-char-link-wrap');
    const repeatWrap = document.getElementById('calendar-event-repeat-wrap');
    const notesWrap = document.getElementById('calendar-event-notes-wrap');
    const titleLabel = document.getElementById('calendar-event-title-label');
    const titleInput = document.getElementById('calendar-event-title');
    const titleHint = document.getElementById('calendar-event-title-hint');
    const dateLabel = document.getElementById('calendar-event-date-label');
    const remindHint = document.querySelector('.yd-cal-remind-hint');
    const isPeriod = type === 'period_start';
    const isBirthday = type === 'birthday';

    if (dateLabel) dateLabel.textContent = isPeriod ? '开始时间' : '日期';

    if (titleWrap) titleWrap.hidden = isPeriod || isBirthday;
    if (birthdayWrap) birthdayWrap.hidden = isPeriod || !isBirthday;
    if (periodFields) periodFields.hidden = !isPeriod;
    if (charWrap) charWrap.hidden = isPeriod;
    if (repeatWrap) repeatWrap.hidden = isPeriod;
    if (remindHint) remindHint.hidden = isPeriod;
    if (notesWrap) notesWrap.hidden = isPeriod;

    if (isBirthday) {
      void this._renderBirthdaySubjectUI(ev);
    }

    if (titleLabel && titleInput && titleHint && !isBirthday) {
      if (type === 'anniversary') {
        titleLabel.textContent = '纪念日名称';
        titleInput.placeholder = '在一起的第一天';
        titleHint.hidden = true;
      } else {
        titleLabel.textContent = '标题';
        titleInput.placeholder = '自定义标题';
        titleHint.hidden = true;
      }
    }

    const repeatEl = document.getElementById('calendar-event-repeat');
    if (repeatEl && !this._editingEventId && !this._editingPeriodStartDate) {
      if (type === 'birthday') repeatEl.checked = true;
      else if (type === 'anniversary' || type === 'custom') repeatEl.checked = false;
    }

    if (isPeriod) {
      const cfg = this._config || CycleEngine.normalizeConfig(null);
      const durEl = document.getElementById('calendar-period-duration');
      const cycleEl = document.getElementById('calendar-cycle-length');
      if (durEl && !durEl.dataset.touched) durEl.value = String(cfg.defaultPeriodLength || 5);
      if (cycleEl && !cycleEl.dataset.touched) cycleEl.value = String(cfg.defaultCycleLength || 28);
    }
  },

  _eventOccurrencesNearToday(ev, today, pastDays, futureDays) {
    const date = String(ev?.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const out = [];
    const add = (target) => {
      const diff = CycleEngine.daysBetween(today, target);
      if (diff >= -pastDays && diff <= futureDays) out.push({ target, diff });
    };
    if (ev.repeat === 'yearly') {
      const ref = CycleEngine.parseDayKey(today);
      const mmdd = date.slice(5);
      if (ref) {
        const y = ref.getFullYear();
        add(`${y}-${mmdd}`);
        add(`${y - 1}-${mmdd}`);
        add(`${y + 1}-${mmdd}`);
      }
    } else {
      add(date);
    }
    return out;
  },

  _formatScheduleWhen(diff) {
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === -1) return '昨天';
    if (diff > 0) return `${diff} 天后`;
    return `已过 ${Math.abs(diff)} 天`;
  },

  _formatScheduleDateLabel(dayKey) {
    const d = CycleEngine.parseDayKey(dayKey);
    if (!d) return dayKey;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  _collectRecentScheduleItems(today, pastDays = 60, futureDays = 60) {
    const items = [];
    const seen = new Set();
    for (const ev of this._events || []) {
      for (const occ of this._eventOccurrencesNearToday(ev, today, pastDays, futureDays)) {
        const key = `event:${ev.id}:${occ.target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ kind: 'event', ev, target: occ.target, diff: occ.diff });
      }
    }
    const cfg = this._config || CycleEngine.normalizeConfig(null);
    if (cfg.cycleTrackingEnabled) {
      this._appendPeriodItemsToTimeline(items, seen, today, pastDays, futureDays, cfg);
    }
    items.sort((a, b) => a.diff - b.diff || String(a.target).localeCompare(String(b.target)));
    return items;
  },

  async _renderUpcoming() {
    const el = document.getElementById('calendar-upcoming-list');
    if (!el) return;
    const today = CycleEngine.dayKeyFromTs(Date.now());
    const items = this._collectRecentScheduleItems(today);

    if (!items.length) {
      el.innerHTML = '<p class="yd-cal-empty">暂无最近日程</p>';
      return;
    }

    const htmlParts = [];
    for (const it of items.slice(0, 40)) {
      const dateLabel = this._formatScheduleDateLabel(it.target);
      const when = this._formatScheduleWhen(it.diff);
      if (it.kind === 'period_start' || it.kind === 'period_end') {
        const title = it.kind === 'period_start'
          ? `${this._periodTag(it.recorded)}经期开始`
          : `${this._periodTag(it.recorded)}经期结束`;
        const attrs = it.kind === 'period_start' && it.recorded
          ? ` data-period-start="${this._escapeHtml(it.target)}"`
          : '';
        htmlParts.push(
          `<button type="button" class="yd-cal-upcoming-row" data-day-key="${this._escapeHtml(it.target)}"${attrs}>` +
          `<span class="yd-cal-upcoming-row__icon">🌸</span>` +
          `<span class="yd-cal-upcoming-row__body"><span class="yd-cal-upcoming-row__title">${dateLabel} · ${title}</span>` +
          `<span class="yd-cal-upcoming-row__meta">${this._escapeHtml(when)}</span></span></button>`
        );
        continue;
      }
      const ev = it.ev;
      const typeLabel = ev.type === 'birthday' ? '生日' : (ev.type === 'anniversary' ? '纪念日' : '日程');
      const title = this.formatEventDisplayTitle(ev);
      const icon = ev.type === 'birthday' ? '🎂' : (ev.type === 'anniversary' ? '💕' : '📌');
      htmlParts.push(
        `<button type="button" class="yd-cal-upcoming-row" data-event-id="${this._escapeHtml(ev.id)}" data-day-key="${this._escapeHtml(it.target)}">` +
        `<span class="yd-cal-upcoming-row__icon">${icon}</span>` +
        `<span class="yd-cal-upcoming-row__body"><span class="yd-cal-upcoming-row__title">${this._escapeHtml(dateLabel)} · ${this._escapeHtml(title)}</span>` +
        `<span class="yd-cal-upcoming-row__meta">${this._escapeHtml(typeLabel)} · ${this._escapeHtml(when)}</span></span></button>`
      );
    }
    el.innerHTML = htmlParts.join('');
  },

  _renderMonth() {
    const titleEl = document.getElementById('calendar-month-title');
    const gridEl = document.getElementById('calendar-grid');
    if (!titleEl || !gridEl) return;

    titleEl.textContent = `${this._viewYear}年${this._viewMonth + 1}月`;

    const cfg = this._config || CycleEngine.normalizeConfig(null);
    const logs = this._periodLogs;
    const periodLen = CycleEngine._estimatePeriodLength(logs, cfg);
    const todayKey = CycleEngine.dayKeyFromTs(Date.now());

    const first = new Date(this._viewYear, this._viewMonth, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(this._viewYear, this._viewMonth + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push('<span class="yd-cal-cell yd-cal-cell--pad" aria-hidden="true"></span>');
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${this._viewYear}-${String(this._viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const state = this._dayState(key, cfg, logs, periodLen, todayKey);
      cells.push(this._renderDayCell(key, d, state));
    }

    gridEl.innerHTML = cells.join('');
  },

  _dayState(dayKey, cfg, logs, periodLen, todayKey) {
    const events = this._eventsOnDay(dayKey);
    let period = 'none';
    if (cfg.cycleTrackingEnabled) {
      if (CycleEngine.isLoggedPeriodDay(dayKey, logs, periodLen)) period = 'logged';
      else {
        const pred = CycleEngine.predictNextPeriod(logs, cfg, dayKey);
        if (pred && CycleEngine.isDayInRange(dayKey, pred.start, pred.end)) {
          period = 'predicted';
        }
      }
    }
    return {
      isToday: dayKey === todayKey,
      isSelected: dayKey === this._selectedDayKey,
      period,
      eventCount: events.length,
      hasBirthday: events.some((e) => e.type === 'birthday'),
      hasAnniversary: events.some((e) => e.type === 'anniversary' || e.type === 'custom'),
    };
  },

  _renderDayCell(dayKey, dayNum, state) {
    const cls = [
      'yd-cal-cell',
      state.isToday ? 'yd-cal-cell--today' : '',
      state.isSelected ? 'yd-cal-cell--selected' : '',
      state.period === 'logged' ? 'yd-cal-cell--period' : '',
      state.period === 'predicted' ? 'yd-cal-cell--period-pred' : '',
    ].filter(Boolean).join(' ');

    let dots = '';
    if (state.hasBirthday) dots += '<span class="yd-cal-dot yd-cal-dot--birth"></span>';
    if (state.hasAnniversary) dots += '<span class="yd-cal-dot yd-cal-dot--event"></span>';
    if (state.eventCount > 2) dots = `<span class="yd-cal-dot yd-cal-dot--more">${state.eventCount}</span>`;

    return `<button type="button" class="${cls}" data-day-key="${this._escapeHtml(dayKey)}" aria-label="${dayNum}日">
      <span class="yd-cal-cell__num">${dayNum}</span>
      ${dots ? `<span class="yd-cal-cell__dots">${dots}</span>` : ''}
    </button>`;
  },

  _renderDayPanel() {
    const key = this._selectedDayKey || CycleEngine.dayKeyFromTs(Date.now());
    const titleEl = document.getElementById('calendar-day-title');
    const listEl = document.getElementById('calendar-day-events');
    if (!titleEl || !listEl) return;

    const d = CycleEngine.parseDayKey(key);
    const week = d ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] : '';
    const todayKey = CycleEngine.dayKeyFromTs(Date.now());
    const suffix = key === todayKey ? ' · 今天' : '';

    titleEl.textContent = d ? `${d.getMonth() + 1}月${d.getDate()}日 ${week}${suffix}` : key;

    const cfg = this._config || CycleEngine.normalizeConfig(null);

    const periodStart = cfg.cycleTrackingEnabled ? this._periodLogs.find((l) => l.startDate === key) : null;
    const nextPred = this._periodLogs.length
      ? CycleEngine.predictNextPeriod(this._periodLogs, cfg, key)
      : null;
    const isPredDay = nextPred && CycleEngine.isDayInRange(key, nextPred.start, nextPred.end) && !periodStart
      && !CycleEngine.isLoggedPeriodDay(key, this._periodLogs, CycleEngine._estimatePeriodLength(this._periodLogs, cfg));
    const dayEvents = this._eventsOnDay(key);
    const rows = [];

    if (isPredDay) {
      rows.push(
        `<div class="yd-cal-event-row yd-cal-event-row--period yd-cal-event-row--period-pred">` +
        `<span class="yd-cal-event-row__icon">🌸</span>` +
        `<span class="yd-cal-event-row__body">` +
        `<span class="yd-cal-event-row__title">预计经期</span>` +
        `<span class="yd-cal-event-row__meta">预测区间内的日期</span></span></div>`
      );
    }

    if (periodStart) {
      rows.push(
        `<button type="button" class="yd-cal-event-row yd-cal-event-row--period" data-period-start="${this._escapeHtml(key)}">` +
        `<span class="yd-cal-event-row__icon">🌸</span>` +
        `<span class="yd-cal-event-row__body">` +
        `<span class="yd-cal-event-row__title">经期开始</span>` +
        `<span class="yd-cal-event-row__meta">点击编辑</span></span></button>`
      );
    }

    dayEvents.forEach((ev) => rows.push(this._renderEventRow(ev, key)));

    if (!rows.length) {
      listEl.innerHTML = '<p class="yd-cal-empty">暂无记录，点右上角 + 添加</p>';
    } else {
      listEl.innerHTML = rows.join('');
    }
    this._renderUpcoming().catch(() => {});
  },

  _renderEventRow(ev, refDayKey) {
    const icon = ev.type === 'birthday' ? '🎂' : (ev.type === 'anniversary' ? '💕' : '📌');
    const countdown = this._eventCountdownText(ev, refDayKey);
    const title = this.formatEventDisplayTitle(ev);
    return `<button type="button" class="yd-cal-event-row" data-event-id="${this._escapeHtml(ev.id)}">
      <span class="yd-cal-event-row__icon">${icon}</span>
      <span class="yd-cal-event-row__body">
        <span class="yd-cal-event-row__title">${this._escapeHtml(title)}</span>
        <span class="yd-cal-event-row__meta">${this._escapeHtml(countdown)}</span>
      </span>
    </button>`;
  },

  _eventsOnDay(dayKey) {
    return (this._events || []).filter((ev) => this._eventMatchesDay(ev, dayKey));
  },

  _eventMatchesDay(ev, dayKey) {
    const date = String(ev.date || '').trim();
    if (!date) return false;
    if (ev.repeat === 'yearly' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const mmdd = date.slice(5);
      return dayKey.slice(5) === mmdd;
    }
    return date === dayKey;
  },

  _eventCountdownText(ev, refDayKey) {
    const date = String(ev.date || '').trim();
    if (!date) return '';
    let targetKey = date;
    if (ev.repeat === 'yearly' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const ref = CycleEngine.parseDayKey(refDayKey);
      if (!ref) return '每年重复';
      let y = ref.getFullYear();
      targetKey = `${y}-${date.slice(5)}`;
      if (CycleEngine.daysBetween(refDayKey, targetKey) < 0) {
        targetKey = `${y + 1}-${date.slice(5)}`;
      }
    }
    const diff = CycleEngine.daysBetween(refDayKey, targetKey);
    if (diff === 0) return '就是今天';
    if (diff > 0) return `还有 ${diff} 天`;
    return `已过 ${Math.abs(diff)} 天`;
  },

  async _openEventSheet(eventId, opts = {}) {
    const sheet = document.getElementById('calendar-event-sheet');
    const panel = document.getElementById('calendar-event-sheet-panel');
    if (!sheet || !panel) return;

    const periodStartDate = String(opts.periodStartDate || '').trim();
    const key = this._selectedDayKey || CycleEngine.dayKeyFromTs(Date.now());
    const ev = eventId ? this._events.find((e) => e.id === eventId) : null;
    const isPeriodEdit = !!periodStartDate || (!eventId && opts.openAsPeriod);

    this._editingEventId = eventId || null;
    this._editingPeriodStartDate = isPeriodEdit ? (periodStartDate || key) : null;

    const cfg = this._config || CycleEngine.normalizeConfig(null);
    const titleEl = document.getElementById('calendar-event-sheet-title');
    if (titleEl) {
      titleEl.textContent = isPeriodEdit
        ? (this._periodLogs.some((l) => l.startDate === (periodStartDate || key)) ? '编辑经期' : '记录经期开始')
        : (ev ? '编辑' : '添加');
    }

    const typeEl = document.getElementById('calendar-event-type');
    if (typeEl) typeEl.value = isPeriodEdit ? 'period_start' : (ev?.type || 'anniversary');

    document.getElementById('calendar-event-title').value = ev?.title || '';
    document.getElementById('calendar-event-date').value = isPeriodEdit ? (periodStartDate || key) : (ev?.date || key);
    const typeForRepeat = isPeriodEdit ? 'period_start' : (ev?.type || typeEl?.value || 'anniversary');
    document.getElementById('calendar-event-repeat').checked = ev
      ? ev.repeat !== 'none'
      : typeForRepeat === 'birthday';
    document.getElementById('calendar-event-notes').value = ev?.notes || '';

    const durEl = document.getElementById('calendar-period-duration');
    const cycleEl = document.getElementById('calendar-cycle-length');
    if (durEl) {
      durEl.dataset.touched = '';
      const log = this._periodLogs.find((l) => l.startDate === (periodStartDate || key));
      let dur = cfg.defaultPeriodLength || 5;
      if (log?.endDate) {
        const d = CycleEngine.daysBetween(log.startDate, log.endDate) + 1;
        if (d >= 2 && d <= 10) dur = d;
      }
      durEl.value = String(dur);
    }
    if (cycleEl) {
      cycleEl.dataset.touched = '';
      cycleEl.value = String(cfg.defaultCycleLength || 28);
    }

    const deleteBtn = document.getElementById('calendar-event-delete');
    if (deleteBtn) deleteBtn.hidden = !(ev || isPeriodEdit);

    await this._loadSheetCharacters();
    await this._renderCharacterLinkUI(ev);
    this._syncSheetForType(ev);

    sheet.hidden = false;
    sheet.classList.add('yd-modal--active');
    requestAnimationFrame(() => panel.classList.add('yd-cal-sheet-panel--open'));
  },

  _closeEventSheet() {
    const sheet = document.getElementById('calendar-event-sheet');
    const panel = document.getElementById('calendar-event-sheet-panel');
    panel?.classList.remove('yd-cal-sheet-panel--open');
    sheet?.classList.remove('yd-modal--active');
    setTimeout(() => {
      if (sheet) sheet.hidden = true;
    }, 200);
    this._editingEventId = null;
    this._editingPeriodStartDate = null;
  },

  async _saveEventFromSheet() {
    const date = String(document.getElementById('calendar-event-date')?.value || '').trim();
    const type = String(document.getElementById('calendar-event-type')?.value || 'anniversary');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      this._toast('日期格式无效');
      return;
    }

    if (type === 'period_start') {
      const duration = Math.max(2, Math.min(10, Number(document.getElementById('calendar-period-duration')?.value) || 5));
      const cycleLen = Math.max(21, Math.min(45, Number(document.getElementById('calendar-cycle-length')?.value) || 28));
      const endDate = CycleEngine.addDays(date, duration - 1);
      await this._saveConfig({ defaultPeriodLength: duration, defaultCycleLength: cycleLen });
      const idx = this._periodLogs.findIndex((l) => l.startDate === date);
      const log = { startDate: date, endDate, source: 'user' };
      if (idx >= 0) this._periodLogs[idx] = log;
      else this._periodLogs.push(log);
      this._periodLogs = CycleEngine.normalizeLogs(this._periodLogs);
      await this._savePeriodLogs();
      if (typeof CalendarReminders !== 'undefined' && CalendarReminders.reconcile) {
        CalendarReminders.reconcile().catch(() => {});
      }
      this._closeEventSheet();
      this._toast('经期已记录');
      return;
    }

    let title = '';
    let birthdayFields = {};
    if (type === 'birthday') {
      const birthday = this._readBirthdaySubjectFromSheet();
      if (!birthday) {
        this._toast('请选择谁的生日');
        return;
      }
      title = birthday.title;
      birthdayFields = {
        birthdaySubject: birthday.birthdaySubject,
        birthdayCharacterId: birthday.birthdayCharacterId,
      };
    } else {
      title = String(document.getElementById('calendar-event-title')?.value || '').trim();
      if (!title) {
        this._toast('请填写标题');
        return;
      }
      birthdayFields = { birthdaySubject: null, birthdayCharacterId: null };
    }
    const repeat = document.getElementById('calendar-event-repeat')?.checked ? 'yearly' : 'none';
    const notes = String(document.getElementById('calendar-event-notes')?.value || '').trim();
    const link = this._readCharacterLinkFromSheet();
    const now = Date.now();

    if (this._editingEventId) {
      const idx = this._events.findIndex((e) => e.id === this._editingEventId);
      if (idx >= 0) {
        this._events[idx] = this._normalizeEvent({
          ...this._events[idx],
          title,
          date,
          type,
          repeat,
          notes,
          ...birthdayFields,
          ...link,
          remindEnabled: true,
          updatedAt: now,
        });
      }
    } else {
      this._events.push(this._normalizeEvent({
        id: State.generateId(),
        title,
        date,
        type,
        repeat,
        notes,
        ...birthdayFields,
        ...link,
        remindEnabled: true,
        createdAt: now,
        updatedAt: now,
      }));
    }
    await this._saveEvents();
    if (typeof CalendarReminders !== 'undefined' && CalendarReminders.reconcile) {
      CalendarReminders.reconcile().catch(() => {});
    }
    this._closeEventSheet();
    this._toast('已保存');
  },

  async _deleteEventFromSheet() {
    if (this._editingPeriodStartDate) {
      const key = this._editingPeriodStartDate;
      if (!confirm(`确定删除 ${key} 的经期记录？`)) return;
      this._periodLogs = this._periodLogs.filter((l) => l.startDate !== key);
      await this._savePeriodLogs();
      this._closeEventSheet();
      this._toast('已删除');
      return;
    }
    if (!this._editingEventId) return;
    if (!confirm('确定删除该事件？')) return;
    this._events = this._events.filter((e) => e.id !== this._editingEventId);
    await this._saveEvents();
    this._closeEventSheet();
    this._toast('已删除');
  },

  _toast(msg) {
    try {
      if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast(msg);
      else alert(msg);
    } catch (e) {
      alert(msg);
    }
  },

  _escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /** 供 Chat 注入：读取配置与记录并生成 system */
  async buildCycleStyleSystemForApi() {
    try {
      const cfg = await Storage.kvGet(this.CONFIG_KEY);
      const normalized = CycleEngine.normalizeConfig(cfg);
      if (!normalized.cycleTrackingEnabled || !normalized.styleByPhaseEnabled) return '';
      const logs = await Storage.kvGet(this.PERIOD_LOGS_KEY);
      const today = CycleEngine.dayKeyFromTs(Date.now());
      return CycleEngine.buildStyleSystemContent(today, logs, normalized);
    } catch (e) {
      return '';
    }
  },

  /** 按会话角色注入：过去 / 今天 / 未来，带完整日期 */
  async buildCalendarTimelineForParticipantsApi(participantCharacterIds, opts = {}) {
    try {
      const ids = (participantCharacterIds || []).map((id) => String(id)).filter(Boolean);
      if (!ids.length) return '';

      const pastDays = Math.max(7, Math.min(90, Number(opts.pastDays) || 45));
      const futureDays = Math.max(7, Math.min(60, Number(opts.futureDays) || 21));
      const today = CycleEngine.dayKeyFromTs(Date.now());

      await this._loadAll();
      const items = await this._collectTimelineItemsForParticipants(ids, today, pastDays, futureDays);
      const phaseLine = this._formatTodayCyclePhaseLine(today);
      if (!items.length && !phaseLine) return '';

      const past = [];
      const todayList = [];
      const future = [];
      items.forEach((it) => {
        const line = this._formatTimelineEntry(it);
        if (it.diff < 0) past.push(line);
        else if (it.diff === 0) todayList.push(line);
        else future.push(line);
      });
      if (phaseLine) {
        todayList.unshift(phaseLine);
      }
      const sortByDate = (arr) => {
        if (arr.length <= 1) return arr;
        const head = arr[0] && arr[0].includes('当前月经阶段') ? [arr[0]] : [];
        const rest = head.length ? arr.slice(1) : arr;
        rest.sort((a, b) => String(a).localeCompare(String(b)));
        return head.length ? [...head, ...rest] : rest;
      };

      const baseline = this._formatDayKeyWithWeek(today, today);
      const parts = [
        '【用户日历时间轴｜与本对话角色可见记录｜系统自动】',
        `基准日：${baseline}（公历）`,
        '',
      ];

      const pastSec = this._buildTimelineSection('已过去 · 回顾参考，勿主动翻旧账', sortByDate(past));
      const todaySec = this._buildTimelineSection('今天', sortByDate(todayList));
      const futureSec = this._buildTimelineSection('即将到来', sortByDate(future));

      if (pastSec) parts.push(pastSec);
      if (todaySec) parts.push(todaySec);
      if (futureSec) parts.push(futureSec);

      if (parts.length <= 3) return '';

      parts.push(
        '使用说明：以日期为准；可自然融入对话，勿像通知清单一样罗列；勿向用户复述「日历时间轴」等系统用语。',
      );
      return parts.join('\n');
    } catch (e) {
      return '';
    }
  },

  /** @deprecated 请使用 buildCalendarTimelineForParticipantsApi */
  async buildCalendarContextForParticipantsApi(participantCharacterIds) {
    return this.buildCalendarTimelineForParticipantsApi(participantCharacterIds);
  },

  async buildTodayEventsSystemForApi() {
    return '';
  },
};

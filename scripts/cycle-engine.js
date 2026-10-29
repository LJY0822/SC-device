// 经期预测与周期阶段（纯函数，无 DOM 依赖）
const CycleEngine = {
  dayKeyFromTs(ts) {
    const d = new Date(Number(ts) || Date.now());
    if (!Number.isFinite(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dd}`;
  },

  parseDayKey(key) {
    const s = String(key || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T12:00:00`);
    return Number.isFinite(d.getTime()) ? d : null;
  },

  daysBetween(earlierKey, laterKey) {
    if (!earlierKey || !laterKey) return 0;
    const a = this.parseDayKey(earlierKey);
    const b = this.parseDayKey(laterKey);
    if (!a || !b) return 0;
    return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  },

  isDayInRange(dayKey, startKey, endKey) {
    const key = String(dayKey || '').trim();
    const start = String(startKey || '').trim();
    const end = String(endKey || '').trim();
    if (!key || !start || !end) return false;
    return this.daysBetween(start, key) >= 0 && this.daysBetween(key, end) >= 0;
  },

  addDays(dayKey, n) {
    const d = this.parseDayKey(dayKey);
    if (!d) return null;
    d.setDate(d.getDate() + (Number(n) || 0));
    return this.dayKeyFromTs(d.getTime());
  },

  _defaultConfig() {
    return {
      cycleTrackingEnabled: true,
      defaultCycleLength: 28,
      defaultPeriodLength: 5,
      styleByPhaseEnabled: true,
      remindEventsEnabled: true,
      remindPeriodEnabled: true,
      remindDaysBefore: [0, 1]
    };
  },

  normalizeConfig(cfg) {
    const base = this._defaultConfig();
    const c = cfg && typeof cfg === 'object' ? cfg : {};
    let remindDays = c.remindDaysBefore;
    if (!Array.isArray(remindDays) || !remindDays.length) {
      remindDays = base.remindDaysBefore;
    }
    remindDays = [...new Set(remindDays.map((n) => Math.max(0, Math.min(30, Number(n) || 0))))].sort((a, b) => a - b);
    return {
      cycleTrackingEnabled: true,
      defaultCycleLength: Math.max(21, Math.min(45, Number(c.defaultCycleLength) || base.defaultCycleLength)),
      defaultPeriodLength: Math.max(2, Math.min(10, Number(c.defaultPeriodLength) || base.defaultPeriodLength)),
      styleByPhaseEnabled: c.styleByPhaseEnabled !== false,
      remindEventsEnabled: c.remindEventsEnabled !== false,
      remindPeriodEnabled: true,
      remindDaysBefore: remindDays.length ? remindDays : base.remindDaysBefore
    };
  },

  normalizeLogs(logs) {
    const list = Array.isArray(logs) ? logs : [];
    const out = [];
    const seen = new Set();
    list.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const startDate = String(row.startDate || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || seen.has(startDate)) return;
      seen.add(startDate);
      let endDate = String(row.endDate || '').trim();
      if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) endDate = '';
      if (endDate && this.daysBetween(startDate, endDate) < 0) endDate = '';
      out.push({ startDate, endDate: endDate || null, source: String(row.source || 'user') });
    });
    out.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return out;
  },

  _estimatePeriodLength(logs, defaults) {
    const durations = [];
    (logs || []).forEach((row) => {
      if (!row.endDate) return;
      const d = this.daysBetween(row.startDate, row.endDate) + 1;
      if (d >= 2 && d <= 10) durations.push(d);
    });
    if (durations.length) {
      return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }
    return defaults.defaultPeriodLength;
  },

  _estimateCycleLength(logs, defaults) {
    const starts = (logs || []).map((l) => l.startDate).sort();
    const gaps = [];
    for (let i = 1; i < starts.length; i++) {
      const g = this.daysBetween(starts[i - 1], starts[i]);
      if (g >= 21 && g <= 45) gaps.push(g);
    }
    if (gaps.length) {
      return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    }
    return defaults.defaultCycleLength;
  },

  isLoggedPeriodDay(dayKey, logs, periodLen) {
    const key = String(dayKey || '').trim();
    if (!key) return false;
    for (const row of logs || []) {
      const start = row.startDate;
      let end = row.endDate;
      if (!end) end = this.addDays(start, (periodLen || 5) - 1);
      if (this.daysBetween(start, key) >= 0 && this.daysBetween(key, end) >= 0) return true;
    }
    return false;
  },

  predictNextPeriod(logs, defaults, refDayKey) {
    const cfg = this.normalizeConfig(defaults);
    const list = this.normalizeLogs(logs);
    if (!list.length) return null;
    const periodLen = this._estimatePeriodLength(list, cfg);
    const cycleLen = this._estimateCycleLength(list, cfg);
    const lastStart = list[list.length - 1].startDate;
    const ref = refDayKey || this.dayKeyFromTs(Date.now());
    let nextStart = this.addDays(lastStart, cycleLen);
    let guard = 0;
    while (nextStart && this.daysBetween(ref, nextStart) > 0 && guard < 24) {
      nextStart = this.addDays(nextStart, cycleLen);
      guard += 1;
    }
    if (!nextStart) return null;
    const confidence = list.length >= 3 ? 'high' : (list.length >= 2 ? 'medium' : 'low');
    return {
      start: nextStart,
      end: this.addDays(nextStart, periodLen - 1),
      confidence
    };
  },

  getPhaseForDay(dayKey, logs, defaults) {
    const cfg = this.normalizeConfig(defaults);
    const list = this.normalizeLogs(logs);
    const key = String(dayKey || this.dayKeyFromTs(Date.now())).trim();
    const periodLen = this._estimatePeriodLength(list, cfg);
    const cycleLen = this._estimateCycleLength(list, cfg);

    if (!list.length) {
      return { phase: 'unknown', cycleDay: 0, cycleLen, periodLen, confidence: 'low', label: '未记录' };
    }

    const starts = list.map((l) => l.startDate);
    let lastStart = starts[starts.length - 1];
    for (let i = starts.length - 1; i >= 0; i--) {
      if (this.daysBetween(starts[i], key) >= 0) {
        lastStart = starts[i];
        break;
      }
    }

    let dayInCycle = this.daysBetween(lastStart, key) + 1;
    if (dayInCycle < 1) {
      const prevStarts = starts.filter((s) => this.daysBetween(s, key) >= 0);
      if (prevStarts.length) {
        lastStart = prevStarts[prevStarts.length - 1];
        dayInCycle = this.daysBetween(lastStart, key) + 1;
      }
    }
    while (dayInCycle > cycleLen) dayInCycle -= cycleLen;

    const confidence = list.length >= 3 ? 'high' : (list.length >= 2 ? 'medium' : 'low');

    if (this.isLoggedPeriodDay(key, list, periodLen)) {
      return { phase: 'menstrual', cycleDay: dayInCycle, cycleLen, periodLen, confidence, label: '月经期' };
    }

    const nextPred = this.predictNextPeriod(list, cfg, key);
    if (nextPred) {
      const inPred = this.isDayInRange(key, nextPred.start, nextPred.end);
      if (inPred) {
        return { phase: 'menstrual_predicted', cycleDay: dayInCycle, cycleLen, periodLen, confidence: nextPred.confidence, label: '预计经期' };
      }
    }

    // 简化时间轴：月经 → 卵泡期 → 排卵期 → 黄体期 → 经前期（黄体期只在排卵之后）
    const ovulationCenter = Math.round(cycleLen / 2);
    const ovulationStart = Math.max(periodLen + 1, ovulationCenter - 2);
    const ovulationEnd = Math.min(cycleLen - 7, ovulationCenter + 2);
    const premenstrualStart = Math.max(ovulationEnd + 1, cycleLen - 6);

    if (dayInCycle >= premenstrualStart) {
      return { phase: 'premenstrual', cycleDay: dayInCycle, cycleLen, periodLen, confidence, label: '经前期' };
    }
    if (dayInCycle >= ovulationStart && dayInCycle <= ovulationEnd) {
      return { phase: 'ovulation', cycleDay: dayInCycle, cycleLen, periodLen, confidence, label: '排卵期' };
    }
    if (dayInCycle > ovulationEnd) {
      return { phase: 'luteal', cycleDay: dayInCycle, cycleLen, periodLen, confidence, label: '黄体期' };
    }
    if (dayInCycle > periodLen) {
      return { phase: 'follicular', cycleDay: dayInCycle, cycleLen, periodLen, confidence, label: '卵泡期' };
    }

    return { phase: 'follicular', cycleDay: dayInCycle, cycleLen, periodLen, confidence, label: '卵泡期' };
  },

  buildStyleSystemContent(dayKey, logs, config) {
    const cfg = this.normalizeConfig(config);
    if (!cfg.cycleTrackingEnabled || !cfg.styleByPhaseEnabled) return '';

    const list = this.normalizeLogs(logs);
    if (!list.length) return '';

    const info = this.getPhaseForDay(dayKey, list, cfg);
    const phase = info.phase;
    if (phase === 'unknown') return '';

    if (phase === 'menstrual_predicted') {
      return [
        '【用户生理周期上下文（系统自动，勿向用户主动科普）】',
        '今日处于预计经期附近，用户可能身体不适。',
        '对话要求：语气更温柔体贴，少施压、少争论；不要主动提及「月经」「经期」等词，除非用户先提起；勿扮演医生。',
      ].join('\n');
    }

    const confText = info.confidence === 'high' ? '较高' : (info.confidence === 'medium' ? '中' : '仅供参考');
    const toneSummary = {
      menstrual: '更温柔、照顾、耐心；少催促、少说教',
      follicular: '可偏轻快、积极，仍尊重用户情绪',
      ovulation: '可略活泼、暧昧，但不油腻、不越界',
      luteal: '更谨慎、温和；少刺激、少开玩笑过头，多确认感受',
      premenstrual: '更包容；少争论、少批评，语气柔软',
    };
    const summary = toneSummary[phase] || '对用户更体贴';

    return [
      '【对话情境｜语气参考（系统自动，勿向用户复述本段）】',
      `依据用户经期记录推断今日语气倾向（置信度：${confText}，周期约第 ${info.cycleDay}/${info.cycleLen} 天）：${summary}。`,
      '保持角色人设；不要主动提及月经、经期、黄体期、排卵等医学词，除非用户先提起；勿扮演医生。',
      '具体日程见「用户日历时间轴」条目（若有）。',
    ].join('\n');
  },
};

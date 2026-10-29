const TaExperience = {
  STORAGE_KEY_CHARACTER: 'ta_experience_character_id_v1',
  STORAGE_KEY_LAST_SUCCESS: 'ta_experience_last_success_time_v1',
  STORAGE_KEY_CACHE: 'ta_experience_cache_v1',
  _lastSeenSuccessTs: 0,
  _newCountPending: 0,
  _inFlight: false,

  init() {
    document.getElementById('ta-exp-back')?.addEventListener('click', () => {
      const returnPage = String(State.taFeatureReturnPage || '').trim();
      const returnSid = String(State.taFeatureReturnSessionId || '').trim();
      State.taFeatureReturnPage = null;
      State.taFeatureReturnSessionId = null;
      if (returnPage === 'page-chat') {
        if (returnSid && typeof Chat !== 'undefined' && Chat) Chat.currentSessionId = returnSid;
        State.switchPage('page-chat');
        return;
      }
      State.backToHome();
    });
    document.getElementById('ta-exp-switch-top')?.addEventListener('click', async () => {
      await this.openCharacterSwitch();
    });
    document.getElementById('ta-exp-update-btn')?.addEventListener('click', async (e) => {
      const btn = e?.currentTarget;
      this._setUpdateBtnLoading(true, btn);
      try {
        await this.fetchTimeline({ force: true });
      } finally {
        this._setUpdateBtnLoading(false, btn);
      }
    });
    window.addEventListener('yd:pagechange', async (e) => {
      const to = e?.detail?.to;
      const from = e?.detail?.from;
      if (to !== 'page-ta-experience') return;
      if (from !== 'page-chat') {
        State.taFeatureReturnPage = null;
        State.taFeatureReturnSessionId = null;
      }
      await this.refreshHeader();
      this.syncGate();
      if (!this._getCharacterId()) {
        await this.openCharacterSwitch();
        return;
      }
      this._lastSeenSuccessTs = this._getLastSuccessTsForCurrentCharacter();
      this.renderFromCache();
      await this._updateUpdateBarVisibility();
      this._scrollToBottomSoon();
    });
  },

  _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  _getCharacterId() {
    return String(Storage.get(this.STORAGE_KEY_CHARACTER) || '').trim();
  },

  _getLastSuccessMap() {
    try {
      const raw = Storage.get(this.STORAGE_KEY_LAST_SUCCESS);
      const obj = raw && typeof raw === 'object' ? raw : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  },

  _getLastSuccessTsForCurrentCharacter() {
    const characterId = this._getCharacterId();
    if (!characterId) return 0;
    const lastMap = this._getLastSuccessMap();
    return Number(lastMap[characterId] || 0) || 0;
  },

  _setLastSuccess(characterId, endTime) {
    const cid = String(characterId || '').trim();
    if (!cid) return;
    const map = this._getLastSuccessMap();
    map[cid] = Number(endTime || Date.now()) || Date.now();
    try {
      Storage.set(this.STORAGE_KEY_LAST_SUCCESS, map);
    } catch (e) {}
  },

  _getCacheMap() {
    try {
      const raw = Storage.get(this.STORAGE_KEY_CACHE);
      const obj = raw && typeof raw === 'object' ? raw : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  },

  _getCurrentCharacterRows() {
    const id = this._getCharacterId();
    if (!id) return [];
    const map = this._getCacheMap();
    const rows = map && Array.isArray(map[id]) ? map[id] : [];
    return rows;
  },

  _setCache(characterId, rows) {
    const cid = String(characterId || '').trim();
    if (!cid) return;
    const map = this._getCacheMap();
    map[cid] = Array.isArray(rows) ? rows : [];
    try {
      Storage.set(this.STORAGE_KEY_CACHE, map);
    } catch (e) {}
  },

  _formatTime(ms) {
    const n = Number(ms || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  },

  _parseTimeLineToMs(s) {
    const t = String(s || '').trim();
    if (!t) return 0;
    const v = Date.parse(t.replace(/\./g, '-'));
    if (Number.isFinite(v)) return v;
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (!m) return 0;
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      0,
      0
    ).getTime();
  },

  _parseTimelineProtocol(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    const lines = text
      .split(/\r?\n/)
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((x) => x !== '[经历]');
    const out = [];
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 2) continue;
      const time = String(parts[0] || '').trim();
      // 兼容两种协议：
      // 1) time|event
      // 2) time|地点|情绪|event（地点/情绪允许为空）
      let location = '';
      let mood = '';
      let event = '';
      if (parts.length === 2) {
        event = String(parts[1] || '').trim();
      } else {
        location = String(parts[1] || '').trim();
        mood = String(parts[2] || '').trim();
        event = String(parts.slice(3).join('|') || '').trim();
        // 若模型只输出到 3 段（time|location|event），则把第二段当地点，第三段当事件
        if (!event && parts.length === 3) {
          mood = '';
          event = String(parts[2] || '').trim();
        }
      }
      if (!time || !event) continue;
      const ts = this._parseTimeLineToMs(time);
      if (!ts) continue;
      out.push({ time, location, mood, event, ts });
    }
    return out;
  },

  _formatHm(ms) {
    const n = Number(ms || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mi}`;
  },

  _formatYmd(ms) {
    const n = Number(ms || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  async _countCharacterUserRoundsAfter(characterId, sinceTs) {
    const cid = String(characterId || '').trim();
    const since = Number(sinceTs || 0) || 0;
    if (!cid || since <= 0) return 0;
    try {
      const sessions = await Storage.dbGetAll('sessions');
      const targetSessionIds = new Set();
      for (const s of Array.isArray(sessions) ? sessions : []) {
        if (!s || !s.id) continue;
        let hit = false;
        try {
          if (typeof TaPages !== 'undefined' && TaPages && typeof TaPages._sessionInvolvesCharacter === 'function') {
            hit = !!TaPages._sessionInvolvesCharacter(s, cid);
          }
        } catch (e) {}
        if (!hit) {
          const parts = Array.isArray(s.participantCharacterIds)
            ? s.participantCharacterIds.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
          hit = parts.includes(cid) || String(s.characterId || '').trim() === cid;
        }
        if (hit) targetSessionIds.add(String(s.id));
      }
      if (!targetSessionIds.size) return 0;
      const allMessages = await Storage.dbGetAll('messages');
      let rounds = 0;
      for (const m of Array.isArray(allMessages) ? allMessages : []) {
        if (!m || m._pending || m._localOnly) continue;
        if (String(m.role || '') !== 'user') continue;
        const sid = String(m.sessionId || '').trim();
        if (!sid || !targetSessionIds.has(sid)) continue;
        const createdAt = Number(m.createdAt || 0) || 0;
        if (createdAt > since) rounds += 1;
      }
      return rounds;
    } catch (e) {
      return 0;
    }
  },

  async _updateUpdateBarVisibility() {
    const bar = document.getElementById('ta-exp-updatebar');
    const btn = document.getElementById('ta-exp-update-btn');
    const badge = document.getElementById('ta-exp-update-badge');
    const characterId = this._getCharacterId();
    if (!bar || !btn) return;
    if (!characterId) {
      bar.hidden = true;
      return;
    }
    const rows = this._getCurrentCharacterRows();
    const hasAnyRows = rows.length > 0;
    const last = this._getLastSuccessTsForCurrentCharacter();
    const byTime = last > 0 && (Date.now() - last) >= 5 * 60 * 1000;
    const rounds = await this._countCharacterUserRoundsAfter(characterId, last);
    const byRounds = last > 0 && rounds >= 5;
    const shouldShow = !hasAnyRows || byTime || byRounds;
    bar.hidden = !shouldShow;
    if (badge) {
      // “可更新”出现时默认展示红点 1（即使未精确统计新条数）
      const n0 = Number(this._newCountPending || 0) || 0;
      const n = shouldShow ? Math.max(1, n0) : n0;
      const isLoading = !!(btn && btn.classList.contains('is-loading'));
      badge.hidden = !shouldShow || isLoading;
      badge.textContent = String(Math.min(99, n));
    }
    if (btn) btn.disabled = this._inFlight;
  },

  _setUpdateBtnLoading(isLoading, btnEl = null) {
    const btn = btnEl || document.getElementById('ta-exp-update-btn');
    const badge = document.getElementById('ta-exp-update-badge');
    const spinner = document.getElementById('ta-exp-update-spinner');
    if (!btn) return;
    const textEl = btn.querySelector('.yd-moments-updatebar__text');
    if (isLoading) {
      btn.classList.add('is-loading');
      btn.disabled = true;
      if (textEl) textEl.textContent = '正在更新';
      if (badge) badge.hidden = true;
      if (spinner) spinner.hidden = false;
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      if (textEl) textEl.textContent = '有新内容更新';
      if (spinner) spinner.hidden = true;
      this._updateUpdateBarVisibility();
    }
  },

  _scrollToBottomSoon() {
    const list = document.getElementById('ta-exp-list');
    if (!list || list.hidden) return;
    try {
      requestAnimationFrame(() => {
        try {
          list.scrollTop = list.scrollHeight;
        } catch (e) {}
      });
    } catch (e2) {}
  },

  _scrollToFirstNewSoon() {
    const list = document.getElementById('ta-exp-list');
    const firstNew = document.querySelector('#ta-exp-list-inner .yd-ta-exp-item.is-new-first');
    if (!list || list.hidden || !firstNew) return false;
    try {
      requestAnimationFrame(() => {
        try {
          const top = Math.max(0, (firstNew.offsetTop || 0) - 8);
          list.scrollTop = top;
        } catch (e) {}
      });
      return true;
    } catch (e2) {
      return false;
    }
  },

  _mergeRows(prevRows, nextRows) {
    const all = [];
    const seen = new Set();
    const add = (r) => {
      if (!r || !r.time || !r.event) return;
      const k = `${r.time}__${r.location || ''}__${r.mood || ''}__${r.event}`;
      if (seen.has(k)) return;
      seen.add(k);
      all.push(r);
    };
    (Array.isArray(prevRows) ? prevRows : []).forEach(add);
    (Array.isArray(nextRows) ? nextRows : []).forEach(add);
    // 缓存保持倒序（新在前），渲染时再做升序与截断
    all.sort((a, b) => (Number(b?.ts || 0) || 0) - (Number(a?.ts || 0) || 0));
    return all.slice(0, 200);
  },

  async _buildExperienceTask(characterId, startLabel, endLabel) {
    if (
      typeof TaPages === 'undefined' ||
      !TaPages ||
      typeof TaPages._buildFeatureContextForCharacter !== 'function' ||
      typeof TaPages._buildAiFeatureSpec !== 'function'
    ) {
      throw new Error('通用 AI 骨架不可用');
    }
    const context = await TaPages._buildFeatureContextForCharacter(characterId, { maxMsgs: 56 });
    if (!context) return null;
    const { character, name, charProfile, chatTranscript } = context;

    const systemRoleAndGoal = [
      '你是「ta 的经历」时间线生成器。',
      '目标：根据角色设定与补充资料，生成指定时间区间内该角色“在自己的世界线里”自主发生的关键经历事件。',
      '你会看到系统提供的「当前真实时间」。它仅用于校准时间规律与作息节奏：请将其视为本次时间区间的 end（现在）锚点。',
      '经历仍必须完整覆盖 user 指定的时间区间（start 到 end），并在区间内按真实时间规律生成（时间推进、地点迁移、事件节奏必须合理）。'
    ].join('\n');

    const systemCharacterContext = [
      `## 角色：${name}`,
      charProfile ? `## 角色设定（角色库）\n${charProfile}` : '## 角色设定（角色库）\n（未填写详情）'
    ].join('\n');

    const systemSupplementContext = [
      '## 补充资料：近期摘要与聊天上下文（与该角色相关的单聊/群聊；含会话摘要+摘录）',
      chatTranscript
    ].join('\n');

    const systemOutputContractAndExample = [
      '你必须只输出纯文本，禁止输出 markdown、JSON、代码块或任何解释性文字。',
      '输出格式必须严格为：',
      '[经历]',
      'YYYY-MM-DD HH:mm|地点|此时内心的想法（内心OS）|事件',
      'YYYY-MM-DD HH:mm|地点|此时内心的想法（内心OS）|事件',
      '每行必须且仅包含「时间|地点|此时内心的想法（内心OS）|事件」。地点或内心OS若无法确定可留空，但分隔符必须保留。',
      '事件必须写得具体、可视化（包含发生了什么、与谁/因为什么、结果/影响），不要只写“聊天/工作/吃饭”等泛泛词。',
      '地点要求：尽量给出具体地点（如：公司会议室/家中客厅/某商场/地铁上/咖啡店）。',
      '时间规律要求（必须遵守）：',
      '- 同一条经历内部的“时间 → 地点 → 事件”要自洽：早晚作息、通勤/移动耗时、餐点时间、工作节奏合理。',
      '- 地点变化要符合真实迁移逻辑：不要在 5 分钟内跨城市/跨省；若需要移动，先出现“路上/地铁/车里”等过渡地点或留出足够时间间隔。',
      '- 事件发生要符合时间跨度：短间隔内只发生小事；大事需要更长时间推进。',
      '内心OS要求：不是一个词，而是一段“此时内心的想法”的短段落（建议 1～3 句）。',
      '必须使用第一人称视角（我）。写成“我此刻在想什么”，不要用“他/她在想什么”的旁白口吻。',
      '可写：内心吐槽、当下想法、下一步计划、自我对话、权衡取舍。',
      '可以适度使用 ... 表示思考停顿、犹豫或临时改主意，但不要每句都用，避免做作。',
      '语感要求：真实、口语化、有一点碎念感；不要文艺腔，不要鸡汤，不要总结式大道理。',
      '请尽量具体，写出“我此刻脑子里在想什么”，而不是空泛情绪词。',
      '内心OS示例：',
      '- “先把这关过了再说...细节回头补。我现在不能露怯，先把场面稳住。”',
      '- “又被临时打断了...今天计划大概率要往后顺延。我得先把优先级改掉，不然后面全乱。”',
      '- “这事总算落地了。晚上回去我先把明天要用的材料理一遍，省得早上手忙脚乱。”',
      '经历范围说明：这些经历是角色在其世界线中自主发生的事情，不限于与用户的互动；可以包含工作、社交、生活琐事、内心决定、与他人互动等。',
      '自由度说明：角色是主动和自由的，你可以生成少量“自然发生的临时插曲”（例如偶遇、突发小麻烦、小收获、计划变更等），让世界线更真实。',
      '自由度边界：随机事件必须在现实与人设上可成立，且不与补充资料冲突；禁止引入超自然/硬科幻/无根据的巨大设定跳变（除非角色设定本身明确支持）。',
      '角色一致性：不要求死板复读角色卡原文，但人物行为与价值观、社会身份、生活方式要大体一致；可以在合理范围内出现“情绪波动/临时决定/小反常”，但不能彻底崩坏人设。',
      '输出禁令：禁止在正文中输出任何元标签/分类词，例如“随机事件”“临时插曲”“事件类型”“标签”“注释”“括注说明”；不要写“（随机事件）”“【随机】”这类前缀。',
      '当事件涉及“用户与角色”的互动事实（例如：用户是否说过某句话、是否约了时间、是否发生过某次对话），必须严格参考【真实线上聊天对话记录】，禁止编造、补写、改写事实。',
      '默认不要输出任何具体对话原文（尤其不要逐句复刻聊天）；如确需提及互动，用“概述”表述即可，并确保不违反真实记录。',
      '仅允许去掉影响阅读的噪音标记（如 [消息]、(动作)、(chuckle)、(sighs)）。其余内容不要替换为新台词。',
      '',
      '示例：',
      '[经历]',
      '2026-04-21 09:20|公司会议室|先把结论讲清楚...细节被追问再补，不然节奏会被带乱。下午我必须把数据口径统一掉。|早会中被点名汇报项目进度，他临时补充了数据口径并当场承诺下午给出修正方案',
      '2026-04-21 12:10|公司附近餐厅|这顿饭吃完我就把下午安排重排，先处理最容易卡住的那一段。再拖下去今晚又要加班。|午饭时和同事聊到周末安排，他一边回消息一边把原本的加班计划推迟到了周日'
    ].join('\n');

    const userMessage = [
      `生成时间区间：${startLabel} 到 ${endLabel}`,
      '请按时间从近到远生成该区间内的角色经历，至少 8 条。',
      '其中至少 2 条为“自然发生的自主插曲”（不需要来自聊天记录，但必须符合时间与地点规律）。',
      '注意：直接输出事件内容本身，不要在任何一行里写“随机事件/临时插曲/标签说明”等字眼。',
      '只输出协议内容，不要额外说明。'
    ].join('\n');

    return {
      character,
      name,
      spec: TaPages._buildAiFeatureSpec({
        systemMessages: [
          systemRoleAndGoal,
          systemCharacterContext,
          systemSupplementContext,
          systemOutputContractAndExample
        ],
        userMessage,
        parse: (raw) => this._parseTimelineProtocol(raw)
      })
    };
  },

  syncGate() {
    const hasRole = !!this._getCharacterId();
    const gate = document.getElementById('ta-exp-gate');
    const list = document.getElementById('ta-exp-list');
    // 无角色时仅弹出选择框，不显示任何占位文案/卡片
    if (gate) gate.hidden = true;
    if (list) list.hidden = !hasRole;
  },

  async refreshHeader() {
    const nameEl = document.getElementById('ta-exp-role-name');
    if (!nameEl) return;
    const id = this._getCharacterId();
    if (!id) {
      nameEl.textContent = '未选择角色';
      return;
    }
    try {
      const c = await Storage.dbGet('characters', id);
      nameEl.textContent = String(c?.name || '').trim() || '未选择角色';
    } catch (e) {
      nameEl.textContent = '未选择角色';
    }
  },

  renderRows(rows, opts = {}) {
    const list = document.getElementById('ta-exp-list');
    const inner = document.getElementById('ta-exp-list-inner');
    if (!list || !inner) return;
    const raw = Array.isArray(rows) ? rows : [];
    const limit = 30;
    // UI：旧在上，新在下（升序）；只显示最近 30 条（取末尾）
    const asc = raw
      .slice()
      .sort((a, b) => (Number(a?.ts || 0) || 0) - (Number(b?.ts || 0) || 0));
    const data = asc.length > limit ? asc.slice(-limit) : asc;
    const newSinceTs = Number(opts.newSinceTs || 0) || 0;
    if (!data.length) {
      inner.innerHTML = '';
      return;
    }

    let lastYmd = '';
    let lastLocation = '';
    let firstNewMarked = false;
    const html = [];
    for (let i = 0; i < data.length; i++) {
      const r = data[i] || {};
      const ts = Number(r.ts || 0) || 0;
      const ymd = ts ? this._formatYmd(ts) : '';
      if (ymd && ymd !== lastYmd) {
        // 跨日期分隔线（中间文字不被贯穿）
        html.push(`<div class="yd-ta-exp-day"><span>${this._escapeHtml(ymd)}</span></div>`);
        lastYmd = ymd;
      }

      const hm = ts ? this._formatHm(ts) : '';
      const isNew = newSinceTs > 0 && ts > newSinceTs;
      const isFirstNew = isNew && !firstNewMarked;
      if (isFirstNew) firstNewMarked = true;
      const location = String(r.location || '').trim();
      if (location && lastLocation && location !== lastLocation) {
        html.push(
          `<div class="yd-ta-exp-loc-shift">位置变化：${this._escapeHtml(lastLocation)} → ${this._escapeHtml(location)}</div>`
        );
      }
      html.push(`
<article class="yd-ta-exp-item${isNew ? ' is-new' : ''}${isFirstNew ? ' is-new-first' : ''}">
  <div class="yd-ta-exp-item__time">
    <span class="yd-ta-exp-item__time-text">${this._escapeHtml(hm || r.time)}</span>
    ${isNew ? `<span class="yd-ta-exp-item__new">最新</span>` : ''}
  </div>
  ${
    location
      ? `<div class="yd-ta-exp-item__loc">📍${this._escapeHtml(location)}</div>`
      : ''
  }
  <div class="yd-ta-exp-item__event">${this._escapeHtml(r.event)}</div>
  ${
    String(r.mood || '').trim()
      ? `<div class="yd-ta-exp-item__mood"><div class="yd-ta-exp-item__mood-title">内心OS</div><div class="yd-ta-exp-item__mood-text">${this._escapeHtml(r.mood)}</div></div>`
      : ''
  }
</article>`);
      if (location) lastLocation = location;
    }
    inner.innerHTML = html.join('');
  },

  renderFromCache() {
    const id = this._getCharacterId();
    if (!id) return;
    const cache = this._getCacheMap();
    this.renderRows(cache[id] || [], { newSinceTs: 0 });
  },

  async fetchTimeline(opts = {}) {
    if (this._inFlight && !opts.force) return;
    const characterId = this._getCharacterId();
    if (!characterId) return;
    const apiKey = String(Storage.get(CONFIG.STORAGE_KEYS.API_KEY) || '').trim();
    if (!apiKey) return;
    this._inFlight = true;
    try {
      const now = Date.now();
      const lastMap = this._getLastSuccessMap();
      const last = Number(lastMap[characterId] || 0) || 0;
      const startLabel = last ? this._formatTime(last) : '（首次生成，补全近24小时）';
      const endLabel = this._formatTime(now);
      const prevLastSuccess = last;
      const task = await this._buildExperienceTask(characterId, startLabel, endLabel);
      if (!task) throw new Error('角色不存在');
      if (!TaPages || typeof TaPages._runAiFeatureTask !== 'function') {
        throw new Error('通用 AI 执行器不可用');
      }
      const { parsed } = await TaPages._runAiFeatureTask(task.spec);
      if (!parsed.length) throw new Error('返回格式无法解析');
      const cache = this._getCacheMap();
      const merged = this._mergeRows(cache[characterId] || [], parsed);
      this._setCache(characterId, merged);
      this._setLastSuccess(characterId, now);
      // 统计“新内容”：以本次刷新前的 lastSuccess 为分界（首次则不标新）
      if (prevLastSuccess > 0) {
        const n = merged.filter((r) => (Number(r?.ts || 0) || 0) > prevLastSuccess).length;
        this._newCountPending = Math.max(0, n);
      } else {
        this._newCountPending = 0;
      }
      this._lastSeenSuccessTs = now;
      this.renderRows(merged, { newSinceTs: prevLastSuccess });
      if (!this._scrollToFirstNewSoon()) {
        this._scrollToBottomSoon();
      }
      await this._updateUpdateBarVisibility();
    } catch (e) {
      console.error('[ta-experience] fetchTimeline', e);
      this.renderFromCache();
      alert(e?.message || '加载失败，请检查网络与 API 配置');
    } finally {
      this._inFlight = false;
      this._updateUpdateBarVisibility();
    }
  },

  async openCharacterSwitch() {
    const existing = document.getElementById('yd-ta-exp-switch');
    if (existing) existing.remove();
    let characters = [];
    try {
      characters = await Storage.dbGetAll('characters');
    } catch (e) {
      characters = [];
    }
    characters = Array.isArray(characters) ? characters.slice() : [];
    characters.sort((a, b) => (Number(b?.createdAt || 0) || 0) - (Number(a?.createdAt || 0) || 0));
    const current = this._getCharacterId();
    const overlay = document.createElement('div');
    overlay.id = 'yd-ta-exp-switch';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = '1200';
    overlay.innerHTML = `
      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);"></div>
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,360px);background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.25);overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #EEE;">
          <div style="font-size:15px;font-weight:900;color:#111;">选择角色</div>
          <button type="button" id="yd-ta-exp-switch-x" style="border:none;background:transparent;width:32px;height:32px;border-radius:10px;font-size:22px;line-height:1;color:#666;cursor:pointer;">×</button>
        </div>
        <div style="max-height:min(56vh,420px);overflow:auto;-webkit-overflow-scrolling:touch;padding:8px;">
          ${(characters.length ? characters : [{ id: '', name: '暂无角色' }])
            .map((m) => {
              const id = String(m?.id || '');
              const name = String(m?.name || '').trim() || (id ? '未命名角色' : '请先到「角色」里创建角色');
              const isCurrent = !!id && id === current;
              return `
                <button type="button" data-id="${this._escapeHtml(id)}"
                  style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:none;background:${isCurrent ? 'rgba(255,107,0,0.10)' : 'transparent'};border-radius:12px;cursor:${id ? 'pointer' : 'default'};">
                  <div style="text-align:left;">
                    <div style="font-size:14px;font-weight:900;color:#111;">${this._escapeHtml(name)}${isCurrent ? '（当前）' : ''}</div>
                    <div style="font-size:12px;color:#8E8E93;margin-top:2px;">将基于该角色生成经历时间线</div>
                  </div>
                  <div aria-hidden="true" style="width:18px;height:18px;border-radius:9px;border:2px solid ${isCurrent ? '#FF6B00' : '#E5E5EA'};background:${isCurrent ? '#FF6B00' : 'transparent'};"></div>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
    const close = () => {
      try {
        overlay.remove();
      } catch (e) {}
    };
    overlay.firstElementChild?.addEventListener('click', close);
    overlay.querySelector('#yd-ta-exp-switch-x')?.addEventListener('click', close);
    Array.from(overlay.querySelectorAll('button[data-id]')).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = String(btn.getAttribute('data-id') || '').trim();
        if (!id) return;
        try {
          Storage.set(this.STORAGE_KEY_CHARACTER, id);
        } catch (e) {}
        close();
        await this.refreshHeader();
        this.syncGate();
        this._lastSeenSuccessTs = this._getLastSuccessTsForCurrentCharacter();
        this.renderFromCache();
        await this._updateUpdateBarVisibility();
      });
    });
    document.body.appendChild(overlay);
  }
};

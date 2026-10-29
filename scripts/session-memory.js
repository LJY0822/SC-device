// 会话记忆增强（与会话绑定，不与角色绑定）
const SessionMemory = {
  _inited: false,
  _currentSessionId: null,
  _defaultHelperPrompt: `# Role: 高保真对话精炼助手

## Profile
你具备极强的聊天内容概括能力，擅长将长篇、冗长的历史聊天记录，提炼出无损关键信息的极简总结。你的目标是在不遗漏任何决策细节和核心事实的前提下，用最少的文字还原对话精髓。

## Execution Rules
1. **极致精简：** 消除所有重复指令、语气词、寒暄或无意义的互动（如“好的”、“在吗”）。
3. **逻辑重组：** 聊天记录往往是跳跃的，你需要按事件发展的逻辑顺序重新梳理，而非简单的截取，需要保证内容的连贯性。
4. **客观中立：** 保持客观第三视角，不添加个人主观评判和联想，仅基于提供的内容进行概括。

## Workflow
2. **核心锚定：** 提取对话中的核心事件、事件的顺序、双方的关系和情感变化、达成的共识、关键的转折点以及未解决的遗留问题。
3. **浓缩概括：** 将零散的信息点串联成简洁的叙事性段落，需要在有限的文字里面浓缩足够多的有效信息，因为双方将会基于这份输出内容作为双方的共同记忆，这份内容的提供的信息需要能做到历史记忆唤醒的作用。

## Output Format
严禁任何开场白（如“好的”、“这是总结”等），你需要直接输出纯文字正文，禁止出现markdown格式，输出内容前需要检查内容的连贯性。 
`,

  init() {
    if (this._inited) return;
    this._inited = true;

    const backBtn = document.getElementById('session-memory-back');
    backBtn?.addEventListener('click', async () => {
      const returnPage = State.sessionMemoryReturnPage;
      const returnSid = State.sessionMemoryReturnSessionId;
      State.sessionMemoryReturnPage = null;
      State.sessionMemoryReturnSessionId = null;
      if (returnPage === 'page-chat-settings' && returnSid) {
        try {
          if (typeof Chat !== 'undefined' && Chat.openSessionSettings) {
            Chat.currentSessionId = returnSid;
            await Chat.openSessionSettings();
            return;
          }
        } catch (e) {}
        try { State.switchPage('page-chat-settings'); } catch (e2) {}
        return;
      }
      try { State.switchPage('page-chat'); } catch (e3) {}
    });

    const enabledInput = document.getElementById('yd-session-memory-enabled');
    const everyInput = document.getElementById('yd-session-memory-every-rounds');
    const nowBtn = document.getElementById('yd-session-memory-summarize-now');
    const goApiBtn = document.getElementById('yd-session-memory-go-api');
    const helperBtn = document.getElementById('yd-session-memory-helper');
    const helperModal = document.getElementById('yd-session-memory-helper-modal');
    const helperText = document.getElementById('yd-session-memory-helper-text');
    const helperSave = document.getElementById('yd-session-memory-helper-save');
    const helperReset = document.getElementById('yd-session-memory-helper-reset');

    const closeHelperModal = () => {
      if (!helperModal) return;
      helperModal.hidden = true;
      helperModal.classList.remove('yd-modal--active');
    };
    const openHelperModal = async () => {
      const sid = String(this._currentSessionId || '').trim();
      if (!sid) return;
      if (!helperModal || !helperText) return;
      const session = await Storage.dbGet('sessions', sid);
      const cur = String(session?.memoryEnhanceHelperPrompt || '').trim();
      helperText.value = cur || this._defaultHelperPrompt;
      helperModal.hidden = false;
      helperModal.classList.add('yd-modal--active');
    };

    helperModal?.querySelectorAll('[data-act="close"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeHelperModal();
      });
    });
    helperModal?.addEventListener('click', (e) => {
      if (e.target === helperModal) closeHelperModal();
    });

    helperBtn?.addEventListener('click', () => {
      void openHelperModal();
    });
    helperReset?.addEventListener('click', () => {
      if (helperText) helperText.value = this._defaultHelperPrompt;
    });
    helperSave?.addEventListener('click', async () => {
      const sid = String(this._currentSessionId || '').trim();
      if (!sid || !helperText) return;
      const session = await Storage.dbGet('sessions', sid);
      if (!session) return;
      session.memoryEnhanceHelperPrompt = String(helperText.value || '').trim();
      session.updatedAt = Date.now();
      await Storage.dbPut('sessions', session);
      closeHelperModal();
      if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast('已保存提示词');
    });

    enabledInput?.addEventListener('change', () => this._saveFromForm().catch(() => {}));
    everyInput?.addEventListener('change', () => this._saveFromForm().catch(() => {}));
    everyInput?.addEventListener('blur', () => this._saveFromForm().catch(() => {}));

    nowBtn?.addEventListener('click', () => {
      void this._openRoundRangePicker(String(this._currentSessionId || '').trim(), 'summarize');
    });

    goApiBtn?.addEventListener('click', () => {
      const sid = String(this._currentSessionId || '').trim();
      if (!sid) return;
      State.apiSettingsReturnPage = 'page-session-memory';
      State.sessionMemoryReturnSessionId = sid;
      State.sessionMemoryReturnPage = 'page-chat-settings';
      State.switchPage('page-settings-api');
      try {
        if (typeof Settings !== 'undefined' && Settings.loadSettings) Settings.loadSettings();
      } catch (e) {}
    });

    window.addEventListener('yd:pagechange', (e) => {
      const to = e && e.detail ? e.detail.to : '';
      if (to === 'page-session-memory') {
        const sid = String(State.sessionMemoryReturnSessionId || Chat?.currentSessionId || '').trim();
        if (sid) this.refresh(sid).catch(() => {});
      }
    });
  },

  openChatModal() {
    this.init();
    const sid = String((typeof Chat !== 'undefined' && Chat.currentSessionId) ? Chat.currentSessionId : '').trim();
    if (!sid) return;
    this._currentSessionId = sid;
    State.sessionMemoryReturnPage = 'page-chat-settings';
    State.sessionMemoryReturnSessionId = sid;
    try { State.switchPage('page-session-memory'); } catch (e) {}
    void this.refresh(sid);
  },

  _getDefaults() {
    return { enabled: false, everyRounds: 50, history: [] };
  },

  _formatTime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  },

  async refresh(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    this._currentSessionId = sid;

    const roundsEl = document.getElementById('yd-session-memory-realtime-rounds');
    const rounds = typeof resolveStoredChatRoundsNum === 'function'
      ? resolveStoredChatRoundsNum()
      : Math.max(
        1,
        parseInt(Storage.get(CONFIG.STORAGE_KEYS.CHAT_ROUNDS) || '200', 10) || 200
      );
    if (roundsEl) roundsEl.textContent = `${rounds}轮`;

    const enabledInput = document.getElementById('yd-session-memory-enabled');
    const everyInput = document.getElementById('yd-session-memory-every-rounds');
    const listEl = document.getElementById('yd-session-memory-history-list');

    const session = await Storage.dbGet('sessions', sid);
    if (session && Object.prototype.hasOwnProperty.call(session, 'memoryEnhanceLastSummaryAt')) {
      try {
        delete session.memoryEnhanceLastSummaryAt;
        session.updatedAt = Date.now();
        await Storage.dbPut('sessions', session);
      } catch (eStrip) {}
    }
    const def = this._getDefaults();
    const enabled = session && typeof session.memoryEnhanceEnabled === 'boolean' ? session.memoryEnhanceEnabled : def.enabled;
    const every = Number(session?.memoryEnhanceEveryRounds);
    const everyRounds = Number.isFinite(every) && every > 0 ? Math.floor(every) : def.everyRounds;
    const history = Array.isArray(session?.memoryEnhanceHistory) ? session.memoryEnhanceHistory : def.history;

    if (enabledInput) enabledInput.checked = !!enabled;
    if (everyInput) everyInput.value = String(everyRounds);

    if (listEl) {
      if (!history.length) {
        listEl.innerHTML = `<div class="yd-session-memory-empty">暂无记忆书记录</div>`;
      } else {
        const rows = history
          .slice()
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
          .map((h) => {
            const timeRaw = this._formatTime(h?.createdAt) || '（未知时间）';
            const rf = Number(h?.userRoundFrom);
            const rt = Number(h?.userRoundTo);
            let roundsRaw = '';
            if (Number.isFinite(rf) && Number.isFinite(rt)) {
              roundsRaw = `第${rf}-${rt}轮`;
            } else if (h?.userTurns != null) {
              roundsRaw = `共${Number(h.userTurns) || 0}轮`;
            } else {
              roundsRaw = '记忆';
            }
            const roundsPart = this._escape(roundsRaw);
            const timePart = this._escape(timeRaw);
            const text = String(h?.text || '').trim();
            const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
            const id = String(h?.id || '');
            const en = h && h.enabled !== false;
            return `
              <div class="yd-session-memory-history-row" data-id="${id}">
                <label class="yd-session-memory-history-enable" title="开启后加入请求上下文">
                  <input type="checkbox" class="yd-session-memory-history-enabled-input" data-id="${id}" ${en ? 'checked' : ''} aria-label="加入记忆请求">
                </label>
                <button type="button" class="yd-session-memory-history-item yd-session-memory-history-item--main" data-id="${id}">
                  <div class="yd-session-memory-history-item__head">
                    <div class="yd-session-memory-history-item__title">
                      <span class="yd-session-memory-history-item__rounds">${roundsPart}</span>
                      <span class="yd-session-memory-history-item__time">${timePart}</span>
                    </div>
                    <div class="yd-session-memory-history-item__hint">查看</div>
                  </div>
                  <div class="yd-session-memory-history-item__preview">${this._escape(preview)}</div>
                </button>
              </div>
            `;
          })
          .join('');
        listEl.innerHTML = rows;

        Array.from(listEl.querySelectorAll('.yd-session-memory-history-enabled-input')).forEach((inp) => {
          inp.addEventListener('click', (ev) => ev.stopPropagation());
          inp.addEventListener('change', async () => {
            const id = inp.getAttribute('data-id') || '';
            const checked = !!inp.checked;
            await this._setHistoryEntryEnabled(sid, id, checked);
          });
        });

        Array.from(listEl.querySelectorAll('.yd-session-memory-history-item--main')).forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id') || '';
            const one = history.find((x) => String(x?.id || '') === String(id));
            const text = String(one?.text || '').trim();
            this._openTextModal(text || '无内容', { sessionId: sid, entryId: id });
          });
        });
      }
    }
  },

  refreshIfVisible(sessionId) {
    try {
      const page = document.getElementById('page-session-memory');
      if (!page || !page.classList.contains('yd-page--active')) return;
    } catch (e) {
      return;
    }
    void this.refresh(sessionId);
  },

  async _saveFromForm() {
    const sid = String(this._currentSessionId || '').trim();
    if (!sid) return;
    const enabledInput = document.getElementById('yd-session-memory-enabled');
    const everyInput = document.getElementById('yd-session-memory-every-rounds');
    const enabled = !!enabledInput?.checked;
    const everyRaw = everyInput ? Number(everyInput.value) : 50;
    const everyRounds = Number.isFinite(everyRaw) && everyRaw > 0 ? Math.floor(everyRaw) : 50;

    const session = await Storage.dbGet('sessions', sid);
    if (!session) return;
    session.memoryEnhanceEnabled = enabled;
    session.memoryEnhanceEveryRounds = everyRounds;
    session.updatedAt = Date.now();
    await Storage.dbPut('sessions', session);
    await this.refresh(sid);
  },

  _escape(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  async _setHistoryEntryEnabled(sessionId, entryId, enabled) {
    const sid = String(sessionId || '').trim();
    const id = String(entryId || '').trim();
    if (!sid || !id) return;
    const session = await Storage.dbGet('sessions', sid);
    if (!session) return;
    const cur = Array.isArray(session.memoryEnhanceHistory) ? session.memoryEnhanceHistory : [];
    session.memoryEnhanceHistory = cur.map((x) => {
      if (!x || String(x.id || '') !== id) return x;
      return { ...x, enabled: !!enabled };
    });
    session.updatedAt = Date.now();
    await Storage.dbPut('sessions', session);
  },

  async _deleteHistoryEntry(sessionId, entryId) {
    const sid = String(sessionId || '').trim();
    const id = String(entryId || '').trim();
    if (!sid || !id) return false;
    const session = await Storage.dbGet('sessions', sid);
    if (!session) return false;
    const cur = Array.isArray(session.memoryEnhanceHistory) ? session.memoryEnhanceHistory : [];
    const next = cur.filter((x) => x && String(x.id || '') !== id);
    if (next.length === cur.length) return false;
    session.memoryEnhanceHistory = next;
    session.updatedAt = Date.now();
    await Storage.dbPut('sessions', session);
    return true;
  },

  _openRoundEchoModal(roundNum, echoText) {
    const existed = document.getElementById('yd-session-memory-round-echo-modal');
    if (existed) existed.remove();
    const overlay = document.createElement('div');
    overlay.id = 'yd-session-memory-round-echo-modal';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content yd-session-memory-round-echo-content" role="dialog" aria-modal="true" aria-label="该轮对话预览" style="max-width:560px;position:relative;padding:0 !important;overflow:hidden;">
        <div class="yd-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 10px 8px;margin:0;border:0;">
          <div style="font-weight:900">第 ${Number(roundNum) || '—'} 轮 · 原文回显</div>
          <button type="button" class="yd-btn-close" data-act="close" aria-label="关闭">×</button>
        </div>
        <div class="yd-session-memory-round-echo-body">
          <div class="yd-session-memory-round-echo-stream"></div>
        </div>
      </div>
    `;
    const close = () => {
      try {
        overlay.remove();
      } catch (e) {}
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);

    const stream = overlay.querySelector('.yd-session-memory-round-echo-stream');
    const raw = String(echoText || '').trim();
    if (stream) {
      if (!raw) {
        const empty = document.createElement('div');
        empty.className = 'yd-sm-echo-empty';
        empty.textContent = '无内容';
        stream.appendChild(empty);
      } else {
        raw.split('\n').forEach((line) => {
          const s = String(line).trim();
          if (!s) return;
          const idx = s.indexOf('：');
          let roleClass = 'assistant';
          let roleLabel = '角色';
          let body = s;
          if (idx >= 0) {
            const lab = s.slice(0, idx).trim();
            body = s.slice(idx + 1).trim();
            if (lab === '用户') {
              roleClass = 'user';
              roleLabel = '用户';
            } else if (lab === '角色') {
              roleClass = 'assistant';
              roleLabel = '角色';
            } else {
              roleClass = 'other';
              roleLabel = lab || '消息';
            }
          }
          const row = document.createElement('div');
          row.className = `yd-sm-echo-row yd-sm-echo-row--${roleClass}`;
          const roleSpan = document.createElement('span');
          roleSpan.className = 'yd-sm-echo-role';
          roleSpan.textContent = roleLabel;
          const bodySpan = document.createElement('span');
          bodySpan.className = 'yd-sm-echo-body';
          bodySpan.textContent = body;
          row.appendChild(roleSpan);
          row.appendChild(bodySpan);
          stream.appendChild(row);
        });
      }
    }

    document.body.appendChild(overlay);
  },

  openExportRoundRangeModal(sessionId) {
    void this._openRoundRangePicker(String(sessionId || '').trim(), 'export');
  },

  async _openRoundRangePicker(sessionId, mode) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const isExport = mode === 'export';
    const existed = document.getElementById('yd-session-memory-range-modal');
    if (existed) existed.remove();

    const titleText = isExport ? '选择待导出的内容' : '选择待总结的内容';
    const ariaLabel = titleText;
    const selectionPrefix = isExport ? '已选择导出' : '已选择总结';
    const footerClass = isExport
      ? 'yd-session-memory-range-actions yd-session-memory-range-actions--export'
      : 'yd-session-memory-range-actions';
    const footerInner = isExport
      ? `
            <span class="yd-session-memory-range-chars yd-session-memory-range-chars--inline" id="yd-session-memory-range-chars">原始字数：?字</span>
            <button type="button" class="yd-btn yd-btn--secondary yd-session-memory-btn-sm" data-act="export-txt">纯文本导出</button>
            <button type="button" class="yd-btn yd-session-memory-btn-sm" data-act="export-html" style="background:#111;color:#fff;">HTML导出</button>
          `
      : `
            <span class="yd-session-memory-range-chars yd-session-memory-range-chars--inline" id="yd-session-memory-range-chars">原始字数：?字</span>
            <button type="button" class="yd-btn yd-session-memory-btn-sm" data-act="summarize" style="background:#111;color:#fff;">总结</button>
          `;

    const overlay = document.createElement('div');
    overlay.id = 'yd-session-memory-range-modal';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content yd-session-memory-range-modal-content" role="dialog" aria-modal="true" aria-label="${this._escape(ariaLabel)}" style="max-width:520px;position:relative;padding:0 !important;overflow:hidden;">
        <div class="yd-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 10px 8px;margin:0;border:0;">
          <div style="font-weight:900">${this._escape(titleText)}</div>
          <button type="button" class="yd-btn-close" data-act="close" aria-label="关闭">×</button>
        </div>
        <div class="yd-session-memory-range-modal-inner">
          <div class="yd-session-memory-range-note" id="yd-session-memory-range-total">正在加载对话列表…</div>
          <div class="yd-sm-range-scroll" id="yd-sm-range-scroll">
            <div id="yd-sm-range-list" class="yd-sm-range-list"></div>
          </div>
          <div class="yd-session-memory-range-fields yd-session-memory-range-fields--echo" id="yd-session-memory-range-selection">${this._escape(`${selectionPrefix}：第 ? 轮到第 ? 轮`)}</div>
          <div class="${footerClass}" id="yd-session-memory-range-footer">
            ${footerInner}
          </div>
        </div>
      </div>
    `;

    const close = () => {
      try {
        overlay.remove();
      } catch (e) {}
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll('[data-act="close"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        close();
      });
    });

    const totalEl = overlay.querySelector('#yd-session-memory-range-total');
    const listEl = overlay.querySelector('#yd-sm-range-list');
    const selectionEl = overlay.querySelector('#yd-session-memory-range-selection');
    const charsEl = overlay.querySelector('#yd-session-memory-range-chars');
    const summarizeBtn = overlay.querySelector('[data-act="summarize"]');
    const exportTxtBtn = overlay.querySelector('[data-act="export-txt"]');
    const exportHtmlBtn = overlay.querySelector('[data-act="export-html"]');

    let totalUserRounds = 0;
    /** @type {Map<number, string>} */
    const echoByRound = new Map();

    try {
      if (typeof Chat !== 'undefined' && Chat.getSessionMemoryDialogueRoundRows) {
        const pack = await Chat.getSessionMemoryDialogueRoundRows(sid);
        totalUserRounds = Number(pack.totalUserRounds) || 0;
        const rows = Array.isArray(pack.rows) ? pack.rows : [];
        if (totalEl) {
          if (totalUserRounds > 0) {
            totalEl.textContent = `总共${totalUserRounds}轮对话`;
          } else {
            totalEl.textContent = isExport ? '本会话暂无可用对话，无法导出。' : '本会话暂无可用对话，无法总结。';
          }
        }
        if (listEl && rows.length) {
          listEl.innerHTML = rows
            .map((r) => {
              const k = Number(r.round);
              echoByRound.set(k, String(r.echo || ''));
              const safeTitle = this._escape(String(r.title || ''));
              const tip = this._escape(String(r.titleFull || r.title || ''));
              return `
                <div class="yd-sm-range-row" data-round="${k}">
                  <button type="button" class="yd-sm-range-dot" data-act="pick-dot" data-round="${k}" aria-label="选择第${k}轮"></button>
                  <span class="yd-sm-range-num">${k}</span>
                  <span class="yd-sm-range-title" title="${tip}">${safeTitle}</span>
                  <button type="button" class="yd-btn yd-session-memory-btn-sm yd-sm-range-preview" data-act="preview-round" data-round="${k}">预览</button>
                </div>
              `;
            })
            .join('');
        } else if (listEl) {
          listEl.innerHTML = '<div class="yd-session-memory-empty" style="padding:12px;">暂无列表</div>';
        }
      }
    } catch (eLoad) {
      if (totalEl) totalEl.textContent = '加载失败';
    }

    let anchorRound = null;
    let selFrom = null;
    let selTo = null;
    let debounceTimer = null;

    const syncDots = () => {
      if (!listEl || selFrom == null || selTo == null) return;
      const lo = Math.min(selFrom, selTo);
      const hi = Math.max(selFrom, selTo);
      listEl.querySelectorAll('.yd-sm-range-dot').forEach((dot) => {
        const rk = Math.floor(Number(dot.getAttribute('data-round')));
        dot.classList.toggle('yd-sm-range-dot--on', rk >= lo && rk <= hi);
      });
    };

    const updateSelectionLine = () => {
      if (!selectionEl) return;
      if (selFrom != null && selTo != null) {
        const lo = Math.min(selFrom, selTo);
        const hi = Math.max(selFrom, selTo);
        selectionEl.textContent = `${selectionPrefix}：第 ${lo} 轮到第 ${hi} 轮`;
      } else {
        selectionEl.textContent = `${selectionPrefix}：第 ? 轮到第 ? 轮`;
      }
    };

    const runPreview = async () => {
      if (!charsEl || selFrom == null || selTo == null) {
        charsEl.textContent = '原始字数：?字';
        return;
      }
      const fr = Math.min(selFrom, selTo);
      const tr = Math.max(selFrom, selTo);
      try {
        if (typeof Chat !== 'undefined' && Chat.getSessionMemoryRangePreview) {
          const r = await Chat.getSessionMemoryRangePreview(sid, fr, tr);
          if (r.ok) {
            charsEl.textContent = `原始字数：${r.charCountRaw}字`;
          } else {
            charsEl.textContent = '原始字数：?字';
          }
        }
      } catch (e2) {
        charsEl.textContent = '原始字数：?字';
      }
    };

    const schedulePreview = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void runPreview(), 120);
    };

    const applyRoundPick = (k) => {
      if (!Number.isFinite(k) || k < 1) return;
      if (anchorRound == null) {
        anchorRound = k;
        selFrom = k;
        selTo = k;
        syncDots();
        updateSelectionLine();
        schedulePreview();
        return;
      }
      const lo = Math.min(anchorRound, k);
      const hi = Math.max(anchorRound, k);
      anchorRound = null;
      selFrom = lo;
      selTo = hi;
      syncDots();
      updateSelectionLine();
      schedulePreview();
    };

    listEl?.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const previewBtn = t.closest('[data-act="preview-round"]');
      if (previewBtn) {
        e.preventDefault();
        const rk = Math.floor(Number(previewBtn.getAttribute('data-round')));
        const echo = echoByRound.get(rk) || '';
        this._openRoundEchoModal(rk, echo);
        return;
      }
      const row = t.closest('.yd-sm-range-row');
      if (!row) return;
      e.preventDefault();
      const k = Math.floor(Number(row.getAttribute('data-round')));
      applyRoundPick(k);
    });

    const ensureRangeSelected = () => {
      if (selFrom == null || selTo == null) {
        if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast('请先选择起止对话轮次');
        return null;
      }
      return { fr: Math.min(selFrom, selTo), tr: Math.max(selFrom, selTo) };
    };

    summarizeBtn?.addEventListener('click', async () => {
      const range = ensureRangeSelected();
      if (!range) return;
      const { fr, tr } = range;
      if (typeof Chat !== 'undefined' && Chat.getSessionMemoryRangePreview) {
        const pv = await Chat.getSessionMemoryRangePreview(sid, fr, tr);
        if (!pv.ok) {
          if (typeof Chat !== 'undefined' && Chat._toast) {
            Chat._toast(pv.error === 'out_of_range' ? `结束轮不能超过当前 ${pv.totalUserRounds} 轮` : '该区间没有可总结内容');
          }
          return;
        }
      }
      summarizeBtn.disabled = true;
      try {
        if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast('已提交到后台总结，请稍等...');
        if (typeof Chat !== 'undefined' && Chat._summarizeSessionMemoryByUserRounds) {
          const entry = await Chat._summarizeSessionMemoryByUserRounds(sid, fr, tr, 'manual');
          close();
          await this.refresh(sid);
          if (entry) {
            if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast(`已生成记忆：第${fr}-${tr}轮`);
          } else if (typeof Chat !== 'undefined' && Chat._toast) {
            Chat._toast('总结未完成（内容为空或 API 失败）');
          }
        }
      } catch (e3) {
        if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast('总结失败，请检查网络与 API 设置');
      } finally {
        if (summarizeBtn) summarizeBtn.disabled = false;
      }
    });

    const runExport = async (format) => {
      const range = ensureRangeSelected();
      if (!range) return;
      const { fr, tr } = range;
      if (typeof Chat !== 'undefined' && Chat.getSessionMemoryRangePreview) {
        const pv = await Chat.getSessionMemoryRangePreview(sid, fr, tr);
        if (!pv.ok) {
          if (typeof Chat !== 'undefined' && Chat._toast) {
            Chat._toast(pv.error === 'out_of_range' ? `结束轮不能超过当前 ${pv.totalUserRounds} 轮` : '该区间没有可导出内容');
          }
          return;
        }
      }
      try {
        if (typeof Chat !== 'undefined' && Chat.exportSessionDialogueRange) {
          await Chat.exportSessionDialogueRange(sid, fr, tr, format);
          close();
        }
      } catch (e4) {
        if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast('导出失败');
      }
    };

    exportTxtBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      void runExport('txt');
    });
    exportHtmlBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      void runExport('html');
    });

    document.body.appendChild(overlay);
  },

  _openTextModal(text, { sessionId, entryId } = {}) {
    const existed = document.getElementById('yd-session-memory-modal');
    if (existed) existed.remove();
    const overlay = document.createElement('div');
    overlay.id = 'yd-session-memory-modal';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content yd-session-memory-modal-content" role="dialog" aria-modal="true" aria-label="记忆总结详情" style="max-width:680px;position:relative;padding:0 !important;overflow:hidden;">
        <div class="yd-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 8px 2px;margin:0;border:0;">
          <div id="yd-session-memory-modal-title" style="font-weight:900">记忆总结详情</div>
          <button type="button" class="yd-btn-close" data-act="close" aria-label="关闭">×</button>
        </div>
        <div class="yd-session-memory-modal-body">
          <pre class="yd-session-memory-modal-pre" data-role="view"></pre>
          <textarea class="yd-session-memory-modal-textarea" data-role="edit" rows="14" hidden></textarea>
          <div class="yd-session-memory-modal-actions yd-session-memory-modal-actions--sticky">
            <div class="yd-session-memory-modal-count" id="yd-session-memory-modal-count">当前字数:0字</div>
            <button type="button" class="yd-btn yd-btn--secondary yd-session-memory-btn-sm yd-session-memory-modal-delete" data-act="delete">删除</button>
            <button type="button" class="yd-btn yd-btn--secondary yd-session-memory-btn-sm" data-act="edit">编辑总结</button>
            <button type="button" class="yd-btn yd-session-memory-btn-sm" data-act="save" style="background:#111;color:#fff;" hidden>保存</button>
          </div>
        </div>
      </div>
    `;
    const pre = overlay.querySelector('[data-role="view"]');
    const ta = overlay.querySelector('[data-role="edit"]');
    const finalText = String(text || '').trim() || '无内容';
    if (pre) pre.textContent = finalText;
    if (ta) ta.value = finalText;
    const countEl = overlay.querySelector('#yd-session-memory-modal-count');
    const computeCount = (s) => String(s || '').replace(/\s+/g, '').length;
    const syncCount = (s) => {
      if (!countEl) return;
      countEl.textContent = `当前字数:${computeCount(s)}字`;
    };
    syncCount(finalText);
    const close = () => {
      try { overlay.remove(); } catch (e) {}
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);
    const editBtn = overlay.querySelector('[data-act="edit"]');
    const deleteBtn = overlay.querySelector('[data-act="delete"]');
    const saveBtn = overlay.querySelector('[data-act="save"]');
    const titleEl = overlay.querySelector('#yd-session-memory-modal-title');
    const dialogEl = overlay.querySelector('.yd-session-memory-modal-content');

    const enterEdit = () => {
      if (!pre || !ta) return;
      pre.hidden = true;
      ta.hidden = false;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      if (deleteBtn) deleteBtn.hidden = true;
      if (editBtn) editBtn.hidden = true;
      if (saveBtn) saveBtn.hidden = false;
      if (titleEl) titleEl.textContent = '编辑记忆总结';
      if (dialogEl) dialogEl.setAttribute('aria-label', '编辑记忆总结');
      syncCount(ta.value);
    };
    const exitEdit = (reset = true) => {
      if (!pre || !ta) return;
      if (reset) ta.value = String(pre.textContent || '');
      ta.hidden = true;
      pre.hidden = false;
      if (deleteBtn) deleteBtn.hidden = false;
      if (editBtn) editBtn.hidden = false;
      if (saveBtn) saveBtn.hidden = true;
      if (titleEl) titleEl.textContent = '记忆总结详情';
      if (dialogEl) dialogEl.setAttribute('aria-label', '记忆总结详情');
      syncCount(pre.textContent || '');
    };

    editBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      enterEdit();
    });
    deleteBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sid = String(sessionId || this._currentSessionId || '').trim();
      const id = String(entryId || '').trim();
      if (!sid || !id) return;
      const ok = window.confirm('确定要删除本次记忆总结吗？删除后无法恢复。');
      if (!ok) return;
      const removed = await this._deleteHistoryEntry(sid, id);
      if (!removed) {
        if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast('删除失败');
        return;
      }
      close();
      await this.refresh(sid);
      if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast('已删除该条记忆总结');
    });
    ta?.addEventListener('input', () => syncCount(ta.value));
    saveBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sid = String(sessionId || this._currentSessionId || '').trim();
      const id = String(entryId || '').trim();
      if (!sid || !id || !ta) return;
      const next = String(ta.value || '').trim();
      const session = await Storage.dbGet('sessions', sid);
      if (!session) return;
      const cur = Array.isArray(session.memoryEnhanceHistory) ? session.memoryEnhanceHistory : [];
      const updated = cur.map((x) => {
        if (!x) return x;
        if (String(x.id || '') !== id) return x;
        return { ...x, text: next || '' };
      });
      session.memoryEnhanceHistory = updated;
      session.updatedAt = Date.now();
      await Storage.dbPut('sessions', session);
      if (pre) pre.textContent = next || '';
      exitEdit(false);
      await this.refresh(sid);
      if (typeof Chat !== 'undefined' && Chat._toast) Chat._toast('已保存');
    });
    document.body.appendChild(overlay);
  }
};


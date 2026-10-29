// 全局正则页面：布局与交互对齐「世界书」列表页

/** 扩展里 enabled 可能非布尔，与列表「开启/禁用」标签对齐 */
function grCoerceEnabled(raw) {
  if (raw === false || raw === 0 || raw === '0') return false;
  if (raw === true || raw === 1 || raw === '1') return true;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'false' || s === 'no' || s === 'off') return false;
    if (s === 'true' || s === 'yes' || s === 'on') return true;
  }
  return true;
}

const GlobalRegexPage = {
  /** 角色扩展规则扁平列表，供「测试」按钮按下标取 payload */
  _charRegexTestSlots: [],
  _activeFilter: 'all',

  init() {
    document.getElementById('global-regex-back')?.addEventListener('click', () => {
      const back = State.regexRulesReturnPage || 'page-homescreen';
      State.regexRulesReturnPage = null;
      State.switchPage(back);
    });

    document.getElementById('global-regex-add')?.addEventListener('click', async () => {
      await this.openCreateDialog();
    });

    const tabs = document.getElementById('global-regex-tabs');
    if (tabs) {
      tabs.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.yd-beautify-tab[data-filter]') : null;
        if (!btn) return;
        const filter = String(btn.getAttribute('data-filter') || '').trim() || 'all';
        this._activeFilter = filter;
        tabs.querySelectorAll('.yd-beautify-tab').forEach((el) => {
          el.classList.toggle('yd-beautify-tab--active', el === btn);
        });
        void this.renderList();
      });
    }

    window.addEventListener('yd:pagechange', (e) => {
      const to = e && e.detail ? e.detail.to : '';
      if (to === 'page-global-regex') {
        void this.renderIfNeeded();
      }
    });

    setTimeout(() => {
      const page = document.getElementById('page-global-regex');
      const isActive = page && page.classList && page.classList.contains('yd-page--active');
      if (isActive) void this.renderIfNeeded();
    }, 50);
  },

  _applyFilterVisibility() {
    const filter = this._activeFilter || 'all';
    const globalSection = document.getElementById('global-regex-section-user');
    const characterSection = document.getElementById('global-regex-section-character');
    if (globalSection) {
      globalSection.style.display = filter === 'all' || filter === 'global' ? '' : 'none';
    }
    if (characterSection) {
      characterSection.style.display = filter === 'all' || filter === 'character' ? '' : 'none';
    }
  },

  escapeHtml(str) {
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },

  _wrapCollapseInner(html) {
    return `<div class="yd-global-regex-collapse-inner">${html}</div>`;
  },

  openRegexTestWithRule(payload) {
    if (!payload || !String(payload.pattern || '').trim()) {
      window.alert('该规则没有可用的匹配正则');
      return;
    }
    State.regexTestReturnPage = 'page-global-regex';
    State.regexTestInitialRule = {
      pattern: payload.pattern,
      flags: payload.flags || 'g',
      replacement: payload.replacement != null ? payload.replacement : '',
      label: String(payload.label || '规则')
    };
    if (typeof State.switchPage === 'function') State.switchPage('page-regex-test');
  },

  loadCharacterRegexSections() {
    return this._loadCharacterRegexSections();
  },

  _titleForEntry(entry) {
    const c = entry.comment && String(entry.comment).trim();
    if (c) return c;
    const p = String(entry.pattern || '').replace(/\s+/g, ' ');
    if (!p) return '未命名规则';
    return p.length > 36 ? `${p.slice(0, 36)}…` : p;
  },

  openRuleModal(opts) {
    const {
      titleBar,
      enabled: enabledInit = true,
      comment: commentInit = '',
      pattern: patternInit = '',
      flags: flagsInit = 'g',
      replacement: replacementInit = '',
      scopeType: scopeTypeInit = 'global',
      scopeCharacterId: scopeCharacterIdInit = '',
      scopeCharacterOptions: scopeCharacterOptionsInit = [],
      showDelete = false,
      onSave,
      onDelete
    } = opts || {};

    const existingModal = document.getElementById('yd-global-regex-dialog');
    if (existingModal) existingModal.remove();

    const deleteRow = showDelete
      ? `<button type="button" class="yd-forum-item__btn" id="yd-global-regex-delete" style="color:#dc2626;">删除本条</button>`
      : '';

    const scopeCharacterOptions = Array.isArray(scopeCharacterOptionsInit)
      ? scopeCharacterOptionsInit
          .map((it) => ({
            id: String(it && it.id || '').trim(),
            name: String(it && it.name || '').trim() || '未命名角色'
          }))
          .filter((it) => !!it.id)
      : [];
    const canChooseCharacterScope = scopeCharacterOptions.length > 0;
    const scopeCharacterInitialId =
      String(scopeCharacterIdInit || '').trim() ||
      (scopeCharacterOptions[0] ? scopeCharacterOptions[0].id : '');
    const scopeInitialType =
      canChooseCharacterScope && scopeTypeInit === 'character' ? 'character' : 'global';
    const scopeCharacterOptionsHtml = scopeCharacterOptions
      .map((it) => `<option value="${this.escapeHtml(it.id)}">${this.escapeHtml(it.name)}</option>`)
      .join('');
    const scopeRowHtml = canChooseCharacterScope
      ? `
        <div style="margin:8px 0 10px 0;">
          <label class="yd-global-regex-label" for="yd-global-regex-scope-type" style="display:block;margin-bottom:6px;">作用范围</label>
          <select class="yd-forum-compose__input" id="yd-global-regex-scope-type">
            <option value="global" ${scopeInitialType === 'global' ? 'selected' : ''}>全局正则</option>
            <option value="character" ${scopeInitialType === 'character' ? 'selected' : ''}>指定角色正则</option>
          </select>
          <select class="yd-forum-compose__input" id="yd-global-regex-scope-character" style="margin-top:8px;${scopeInitialType === 'character' ? '' : 'display:none;'}">
            ${scopeCharacterOptionsHtml}
          </select>
        </div>
      `
      : '';

    const modal = document.createElement('div');
    modal.id = 'yd-global-regex-dialog';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">${this.escapeHtml(titleBar || '正则条目')}</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-global-regex-modal-toggle">
          <span class="yd-global-regex-modal-toggle__label">是否开启</span>
          <label class="yd-global-regex-modal-toggle__switch">
            <input type="checkbox" id="yd-global-regex-enabled" class="yd-global-regex-modal-toggle__input" ${enabledInit ? 'checked' : ''}>
            <span class="yd-global-regex-modal-toggle__slider" aria-hidden="true"></span>
          </label>
        </div>
        <input class="yd-forum-compose__input" id="yd-global-regex-title" placeholder="条目标题（可选）" maxlength="48" value="${this.escapeHtml(commentInit)}">
        ${scopeRowHtml}
        <textarea class="yd-forum-compose__textarea yd-global-regex-pattern" id="yd-global-regex-pattern" placeholder="匹配正则（支持 /pattern/flags）" rows="2" style="margin-top:10px;font-family:ui-monospace,monospace;">${this.escapeHtml(patternInit)}</textarea>
        <textarea class="yd-forum-compose__textarea" id="yd-global-regex-replacement" placeholder="替换为（可为空，支持 $1、$2 等）" rows="3" style="margin-top:10px;">${this.escapeHtml(replacementInit)}</textarea>
        <div class="yd-forum-picker__footer" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:nowrap;">
          <div style="display:flex;align-items:center;gap:10px;min-height:32px;">${deleteRow}</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-global-regex-save">保存</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const saveBtn = modal.querySelector('#yd-global-regex-save');
    const scopeTypeEl = modal.querySelector('#yd-global-regex-scope-type');
    const scopeCharacterEl = modal.querySelector('#yd-global-regex-scope-character');
    const syncScopeCharacterVisible = () => {
      if (!scopeTypeEl || !scopeCharacterEl) return;
      scopeCharacterEl.style.display = scopeTypeEl.value === 'character' ? '' : 'none';
    };
    if (scopeTypeEl && scopeCharacterEl) {
      scopeCharacterEl.value = scopeCharacterInitialId || scopeCharacterEl.value || '';
      scopeTypeEl.addEventListener('change', syncScopeCharacterVisible);
      syncScopeCharacterVisible();
    }
    if (saveBtn && typeof onSave === 'function') {
      saveBtn.addEventListener('click', async () => {
        const titleEl = document.getElementById('yd-global-regex-title');
        const patternEl = document.getElementById('yd-global-regex-pattern');
        const repEl = document.getElementById('yd-global-regex-replacement');
        const enabledEl = document.getElementById('yd-global-regex-enabled');
        if (!patternEl) return;

        const comment = String(titleEl && titleEl.value || '').trim();
        const pattern = String(patternEl.value || '').trim();
        const flags = String(flagsInit || 'g').trim() || 'g';
        if (!/^[gimsuy]*$/i.test(flags)) {
          alert('规则标志位异常，请删除本条后重新添加。');
          return;
        }
        const replacement = String(repEl && repEl.value || '');
        if (!pattern) {
          alert('请填写匹配正则');
          patternEl.focus();
          return;
        }
        try {
          void new RegExp(pattern, flags);
        } catch (err) {
          alert('正则表达式无效：' + (err && err.message ? err.message : String(err)));
          patternEl.focus();
          return;
        }

        const payload = {
          enabled: enabledEl ? !!enabledEl.checked : true,
          comment,
          pattern,
          flags,
          replacement,
          scopeType: canChooseCharacterScope && scopeTypeEl && scopeTypeEl.value === 'character' ? 'character' : 'global',
          characterId: canChooseCharacterScope && scopeCharacterEl ? String(scopeCharacterEl.value || '').trim() : ''
        };
        if (payload.scopeType === 'character' && !payload.characterId) {
          alert('请选择要保存到哪个角色');
          if (scopeCharacterEl) scopeCharacterEl.focus();
          return;
        }

        try {
          await onSave(payload);
          close();
        } catch (e) {
          console.error('[GlobalRegexPage] onSave failed', e);
          alert('保存失败，请稍后再试。');
        }
      });
    }

    const delBtn = modal.querySelector('#yd-global-regex-delete');
    if (delBtn && typeof onDelete === 'function') {
      delBtn.addEventListener('click', async () => {
        try {
          const r = await onDelete();
          if (r === false) return;
        } catch (e) {
          console.error('[GlobalRegexPage] onDelete failed', e);
          return;
        }
        close();
      });
    }

    setTimeout(() => document.getElementById('yd-global-regex-pattern')?.focus(), 0);
  },

  async openCreateDialog() {
    const charOptions = await this._loadSessionCharactersForCreate();
    this.openRuleModal({
      titleBar: '新增正则条目',
      enabled: true,
      comment: '',
      pattern: '',
      flags: 'g',
      replacement: '',
      scopeType: 'global',
      scopeCharacterId: charOptions[0] ? charOptions[0].id : '',
      scopeCharacterOptions: charOptions,
      showDelete: false,
      onSave: async (payload) => {
        if (payload.scopeType === 'character') {
          await this._appendCharacterRegexRule(payload.characterId, payload);
        } else {
          const arr = typeof GlobalRegexConverter !== 'undefined' ? GlobalRegexConverter.getEntries() : [];
          arr.push({ ...payload });
          await GlobalRegexConverter.setEntries(arr, true);
        }
        await this.renderList();
      }
    });
  },

  openEditDialog(index) {
    const arr = typeof GlobalRegexConverter !== 'undefined' ? GlobalRegexConverter.getEntries() : [];
    const existing = Array.isArray(arr) && index >= 0 && index < arr.length ? arr[index] : null;
    if (!existing) return;

    this.openRuleModal({
      titleBar: '编辑正则条目',
      enabled: existing.enabled !== false,
      comment: String(existing.comment || ''),
      pattern: String(existing.pattern || ''),
      flags: String(existing.flags || 'g'),
      replacement: String(existing.replacement || ''),
      showDelete: true,
      onSave: async (payload) => {
        const next = GlobalRegexConverter.getEntries();
        if (!(Array.isArray(next) && index >= 0 && index < next.length)) return;
        next[index] = { ...payload };
        await GlobalRegexConverter.setEntries(next, true);
        await this.renderList();
      },
      onDelete: async () => {
        if (!confirm('确定删除这条正则规则？')) return false;
        const next = GlobalRegexConverter.getEntries();
        if (index >= 0 && index < next.length) next.splice(index, 1);
        await GlobalRegexConverter.setEntries(next, true);
        await this.renderList();
      }
    });
  },

  _buildParserTransformPreview() {
    if (typeof MessageParser === 'undefined' || typeof MessageParser.previewInlineTagSplit !== 'function') {
      return '';
    }
    const { before, after } = MessageParser.previewInlineTagSplit();
    const text = `示例（原文一行）\n${before}\n\n预处理后（插入换行，再按行匹配协议）\n${after}`;
    return `
      <div class="yd-global-regex-block">
        <span class="yd-global-regex-label">转换预览</span>
        <pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(text)}</pre>
      </div>
    `;
  },

  _buildProtocolTransformPreview(desc) {
    if (typeof MessageTypes === 'undefined' || typeof MessageTypes.getBuiltinProtocolPreview !== 'function') {
      return '';
    }
    const prev = MessageTypes.getBuiltinProtocolPreview(desc.typeName);
    if (!prev) return '';
    if (prev.error) {
      const body = `${prev.input}\n\n错误：${prev.error}`;
      return `
        <div class="yd-global-regex-block">
          <div class="yd-global-regex-sample-line">示例</div>
          <pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(body)}</pre>
        </div>
      `;
    }
    if (!prev.parsed) {
      const body = `${prev.input}\n\n（未能解析）`;
      return `
        <div class="yd-global-regex-block">
          <div class="yd-global-regex-sample-line">示例</div>
          <pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(body)}</pre>
        </div>
      `;
    }

    const samplePre = `
      <div class="yd-global-regex-block">
        <div class="yd-global-regex-sample-line">示例</div>
        <pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(prev.input)}</pre>
      </div>
    `;

    let previewInner = '';
    if (typeof Chat !== 'undefined' && typeof Chat.buildProtocolPreviewHtml === 'function') {
      previewInner = Chat.buildProtocolPreviewHtml(prev.parsed) || '';
    }
    if (!previewInner) {
      let json;
      try {
        json = JSON.stringify(prev.parsed, null, 2);
      } catch (e) {
        json = String(prev.parsed);
      }
      return (
        samplePre +
        `<div class="yd-global-regex-block">
          <span class="yd-global-regex-label">结构化数据</span>
          <pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(json)}</pre>
        </div>`
      );
    }

    return (
      samplePre +
      `<div class="yd-global-regex-block">
        <span class="yd-global-regex-label">预览</span>
        <div class="yd-global-regex-chat-preview">${previewInner}</div>
      </div>`
    );
  },

  _bindListInteractions(container) {
    if (!container) return;
    const headers = container.querySelectorAll(':scope > .yd-collapse-item > .yd-collapse-item__header');
    headers.forEach((header) => {
      header.addEventListener('click', () => {
        const targetId = header.getAttribute('data-collapse');
        const content = targetId ? document.getElementById(targetId) : null;
        const icon = header.querySelector('.yd-collapse-item__icon');
        const item = header.parentElement;
        if (content && icon && item) {
          item.classList.toggle('yd-collapse-item--active');
          if (item.classList.contains('yd-collapse-item--active')) {
            content.style.maxHeight = `${content.scrollHeight}px`;
            icon.textContent = '▲';
          } else {
            content.style.maxHeight = '0';
            icon.textContent = '▼';
          }
        }
      });
    });

    container.querySelectorAll('.yd-global-regex-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-regex-index'));
        if (Number.isFinite(idx)) this.openEditDialog(idx);
      });
    });

    container.querySelectorAll('.yd-global-regex-edit-char').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const charId = String(btn.getAttribute('data-char-id') || '').trim();
        const charName = String(btn.getAttribute('data-char-name') || '').trim() || '角色';
        const origTitle = String(btn.getAttribute('data-orig-title') || '').trim() || '规则';
        const origFind = String(btn.getAttribute('data-orig-find') || '');
        const origRep = String(btn.getAttribute('data-orig-rep') || '');
        this.openRuleModal({
          titleBar: `编辑角色正则 · ${charName}`,
          enabled: true,
          comment: origTitle,
          pattern: origFind,
          flags: 'g',
          replacement: origRep,
          showDelete: false,
          onSave: async (payload) => {
            await this._updateCharacterRegexRule({
              charId,
              origTitle,
              origFind,
              origRep,
              payload
            });
            await this.renderList();
          }
        });
      });
    });

    container.querySelectorAll('.yd-global-regex-open-test').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.hasAttribute('data-global-regex-idx')) {
          const idx = Number(btn.getAttribute('data-global-regex-idx'));
          const arr =
            typeof GlobalRegexConverter !== 'undefined' ? GlobalRegexConverter.getEntries() : [];
          const ent = Array.isArray(arr) && idx >= 0 && idx < arr.length ? arr[idx] : null;
          if (!ent) return;
          this.openRegexTestWithRule({
            pattern: ent.pattern,
            flags: ent.flags || 'g',
            replacement: ent.replacement != null ? ent.replacement : '',
            label: `[全局] ${this._titleForEntry(ent)}`
          });
          return;
        }
        if (btn.hasAttribute('data-char-regex-test-slot')) {
          const slot = Number(btn.getAttribute('data-char-regex-test-slot'));
          const payload = Array.isArray(this._charRegexTestSlots)
            ? this._charRegexTestSlots[slot]
            : null;
          if (payload) this.openRegexTestWithRule(payload);
        }
      });
    });
  },

  async _loadCharacterRegexSections() {
    const out = [];
    const filterId =
      typeof State !== 'undefined' ? String(State.regexRulesCharacterFilterId || '').trim() : '';
    const collectFromCharRecord = (charRecord) => {
      if (!charRecord) return [];
      let extensions = null;
      if (typeof Character !== 'undefined' && typeof Character.normalizeCard === 'function') {
        try {
          const norm = Character.normalizeCard(charRecord);
          extensions = norm.extensions || null;
        } catch (e) {
          extensions =
            charRecord.extensions || (charRecord.data && charRecord.data.extensions) || null;
        }
      } else {
        extensions = charRecord.extensions || (charRecord.data && charRecord.data.extensions) || null;
      }
      return (
        typeof Character !== 'undefined' &&
        typeof Character.collectRegexLikeEntriesDetailed === 'function'
          ? Character.collectRegexLikeEntriesDetailed(extensions)
          : []
      ) || [];
    };

    if (filterId) {
      try {
        const charRecord = await Storage.dbGet('characters', filterId);
        if (!charRecord) return out;
        const name =
          String(charRecord.name || (charRecord.data && charRecord.data.name) || '未命名角色').trim() ||
          '未命名角色';
        const entries = collectFromCharRecord(charRecord);
        if (entries.length) out.push({ characterName: name, characterId: filterId, entries });
      } catch (e) {}
      return out;
    }

    // 主屏进入：展示所有角色的角色正则（按角色分组）
    if (typeof Chat === 'undefined' || !Chat.currentSessionId) {
      try {
        const all = await Storage.dbGetAll('characters');
        const rows = Array.isArray(all) ? all : [];
        rows.forEach((charRecord) => {
          if (!charRecord) return;
          const id = String(charRecord.id || '').trim();
          if (!id) return;
          const name =
            String(charRecord.name || (charRecord.data && charRecord.data.name) || '未命名角色').trim() ||
            '未命名角色';
          const entries = collectFromCharRecord(charRecord);
          if (entries.length) out.push({ characterName: name, characterId: id, entries });
        });
      } catch (e) {}
      return out;
    }

    let session = Chat.currentSession;
    if ((!session || typeof session !== 'object') && typeof Storage !== 'undefined' && Storage.dbGet) {
      try {
        session = await Storage.dbGet('sessions', Chat.currentSessionId);
      } catch (e) {
        session = null;
      }
    }
    if (!session) return out;

    const ids =
      Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length
        ? session.participantCharacterIds.filter(Boolean)
        : session.characterId
          ? [session.characterId]
          : [];

    for (let i = 0; i < ids.length; i++) {
      const id = String(ids[i] || '').trim();
      if (!id) continue;

      let charRecord = null;
      try {
        if (Storage.dbGet) charRecord = await Storage.dbGet('characters', id);
      } catch (e) {}
      if (!charRecord) continue;

      const name =
        String(charRecord.name || (charRecord.data && charRecord.data.name) || '未命名角色').trim() ||
        '未命名角色';

      const entries = collectFromCharRecord(charRecord);

      if (entries.length) {
        out.push({ characterName: name, characterId: id, entries });
      }
    }

    return out;
  },

  _renderCharacterRegexItem(detail, charName, charId, container, rowIdx, collapsiblePrefix) {
    const find = String(detail.findRegex || '').trim();
    const rep = String(detail.replaceString || '');
    const contentId = `${collapsiblePrefix}-ch-${rowIdx}`;
    const item = document.createElement('div');
    item.className = 'yd-collapse-item yd-global-regex-item--character';

    const header = document.createElement('div');
    header.className = 'yd-collapse-item__header';
    header.setAttribute('data-collapse', contentId);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'yd-collapse-item__title-wrap';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'yd-collapse-item__title';
    titleSpan.textContent = `${rowIdx + 1}. ${charName} · ${detail.title || '规则'}`;

    const b1 = document.createElement('span');
    b1.className = 'yd-book-type-badge yd-book-type--keyword';
    b1.textContent = '角色扩展';
    b1.style.marginLeft = '6px';

    titleWrap.appendChild(titleSpan);
    titleWrap.appendChild(b1);

    const rightWrap = document.createElement('div');
    rightWrap.className = 'yd-collapse-item__right';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'yd-icon-btn yd-global-regex-edit-char';
    editBtn.title = '编辑角色正则';
    editBtn.setAttribute('aria-label', '编辑角色正则');
    editBtn.setAttribute('data-char-id', String(charId || ''));
    editBtn.setAttribute('data-char-name', String(charName || ''));
    editBtn.setAttribute('data-orig-title', String(detail.title || '规则'));
    editBtn.setAttribute('data-orig-find', String(find || ''));
    editBtn.setAttribute('data-orig-rep', String(rep || ''));
    editBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
      '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>' +
      '</svg>';
    rightWrap.appendChild(editBtn);
    const on = grCoerceEnabled(detail.enabled);
    const sw = document.createElement('span');
    sw.className = on ? 'yd-switch yd-switch--on' : 'yd-switch yd-switch--off';
    sw.textContent = on ? '开启' : '禁用';
    rightWrap.appendChild(sw);

    const icon = document.createElement('span');
    icon.className = 'yd-collapse-item__icon';
    icon.textContent = '▼';

    header.appendChild(titleWrap);
    header.appendChild(rightWrap);
    header.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'yd-collapse-item__content';
    body.id = contentId;

    const slotIdx = this._charRegexTestSlots.length;
    this._charRegexTestSlots.push({
      pattern: find,
      flags: 'g',
      replacement: rep,
      label: `${charName} · ${detail.title || '规则'}`
    });
    body.innerHTML = this._wrapCollapseInner(`
      <div class="yd-global-regex-block">
        <span class="yd-global-regex-label">匹配</span>
        <pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(find || '（空）')}</pre>
      </div>
      <div class="yd-global-regex-block">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span class="yd-global-regex-label">替换为</span>
          <button type="button" class="yd-global-regex-open-test yd-forum-item__btn yd-forum-item__btn--primary" data-char-regex-test-slot="${slotIdx}">测试</button>
        </div>
        <pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(rep)}</pre>
      </div>
    `);

    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
  },

  async _updateCharacterRegexRule({ charId, origTitle, origFind, origRep, payload }) {
    if (!charId) return;
    let record = null;
    try {
      record = await Storage.dbGet('characters', charId);
    } catch (e) {
      console.error('[GlobalRegexPage] load character failed', e);
      alert('加载角色失败，无法保存正则。');
      return;
    }
    if (!record) {
      alert('未找到对应角色，无法保存正则。');
      return;
    }
    const norm =
      typeof Character !== 'undefined' && typeof Character.normalizeCard === 'function'
        ? Character.normalizeCard(record)
        : record;
    const extensions = norm.extensions || null;
    if (!extensions || typeof extensions !== 'object') {
      alert('该角色未包含可编辑的扩展配置。');
      return;
    }

    const matchScriptName = (node, fallbackTitle) => {
      const scriptName =
        node.scriptName || node.name || node.id || node.comment || fallbackTitle || '';
      return String(scriptName || '').trim() === String(origTitle || '').trim();
    };

    let updated = false;
    const walk = (node, path = '') => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          const p = path ? `${path}.${k}` : k;
          if (/regex|pattern|rule|script/i.test(k) && !/scriptname|findregex|replacestring/i.test(k)) {
            if (Array.isArray(v)) {
              v.forEach((item, idx) => {
                if (!item || typeof item !== 'object') return;
                const findRegex = item.findRegex || item.regex || item.pattern || item.find || '';
                const replaceString =
                  item.replaceString || item.replace || item.replacement || '';
                if (
                  String(findRegex || '') === String(origFind || '') &&
                  String(replaceString || '') === String(origRep || '') &&
                  matchScriptName(item, `规则${idx + 1}`)
                ) {
                  item.enabled = payload.enabled;
                  item.findRegex = payload.pattern;
                  item.replaceString = payload.replacement;
                  item.flags = payload.flags || 'g';
                  updated = true;
                }
              });
            } else if (v && typeof v === 'object') {
              const findRegex = v.findRegex || v.regex || v.pattern || v.find || '';
              const replaceString =
                v.replaceString || v.replace || v.replacement || '';
              if (
                String(findRegex || '') === String(origFind || '') &&
                String(replaceString || '') === String(origRep || '') &&
                matchScriptName(v, p)
              ) {
                v.enabled = payload.enabled;
                v.findRegex = payload.pattern;
                v.replaceString = payload.replacement;
                v.flags = payload.flags || 'g';
                updated = true;
              }
            }
          }
          walk(v, p);
        }
      }
    };

    walk(extensions);
    if (!updated) {
      alert('未能在角色扩展中定位到对应规则，可能该规则已被修改。');
      return;
    }

    try {
      // 回写到角色记录的 data.extensions（保持 normalizeCard 行为）
      if (!record.data || typeof record.data !== 'object') record.data = {};
      record.data.extensions = extensions;
      await Storage.dbPut('characters', record);
      if (typeof Chat !== 'undefined' && Chat.invalidateCharacterCache) {
        Chat.invalidateCharacterCache();
      }
      alert('角色正则已保存。重新进入会话后生效。');
    } catch (e) {
      console.error('[GlobalRegexPage] save character failed', e);
      alert('保存角色失败，请稍后再试。');
    }
  },

  async _appendCharacterRegexRule(charId, payload) {
    if (!charId) {
      throw new Error('missing character id');
    }
    let record = null;
    try {
      record = await Storage.dbGet('characters', charId);
    } catch (e) {
      console.error('[GlobalRegexPage] append load character failed', e);
      throw e;
    }
    if (!record) throw new Error('character not found');

    if (!record.data || typeof record.data !== 'object') record.data = {};
    if (!record.data.extensions || typeof record.data.extensions !== 'object') {
      record.data.extensions = {};
    }
    const extensions = record.data.extensions;
    if (!Array.isArray(extensions.regex_scripts)) {
      extensions.regex_scripts = [];
    }
    extensions.regex_scripts.push({
      scriptName: String(payload.comment || '').trim() || `规则${extensions.regex_scripts.length + 1}`,
      enabled: payload.enabled !== false,
      findRegex: String(payload.pattern || ''),
      replaceString: String(payload.replacement || ''),
      flags: String(payload.flags || 'g').trim() || 'g'
    });

    await Storage.dbPut('characters', record);
    if (typeof Chat !== 'undefined' && typeof Chat.invalidateCharacterCache === 'function') {
      Chat.invalidateCharacterCache();
    }
  },

  async _loadSessionCharactersForCreate() {
    const out = [];
    if (typeof Chat === 'undefined' || !Chat.currentSessionId) {
      // 主屏幕进入正则页时没有“当前会话”，回退到全角色列表
      try {
        const all = await Storage.dbGetAll('characters');
        (all || []).forEach((record) => {
          if (!record) return;
          const id = String(record.id || '').trim();
          if (!id) return;
          const name =
            String(record.name || (record.data && record.data.name) || '未命名角色').trim() ||
            '未命名角色';
          out.push({ id, name });
        });
      } catch (e) {}
      return out;
    }
    let session = Chat.currentSession;
    if ((!session || typeof session !== 'object') && typeof Storage !== 'undefined' && Storage.dbGet) {
      try {
        session = await Storage.dbGet('sessions', Chat.currentSessionId);
      } catch (e) {
        session = null;
      }
    }
    if (!session) {
      try {
        const all = await Storage.dbGetAll('characters');
        (all || []).forEach((record) => {
          if (!record) return;
          const id = String(record.id || '').trim();
          if (!id) return;
          const name =
            String(record.name || (record.data && record.data.name) || '未命名角色').trim() ||
            '未命名角色';
          out.push({ id, name });
        });
      } catch (e) {}
      return out;
    }
    const ids =
      Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length
        ? session.participantCharacterIds.filter(Boolean)
        : session.characterId
          ? [session.characterId]
          : [];
    for (let i = 0; i < ids.length; i++) {
      const id = String(ids[i] || '').trim();
      if (!id) continue;
      try {
        const record = await Storage.dbGet('characters', id);
        if (!record) continue;
        const name = String(record.name || (record.data && record.data.name) || '未命名角色').trim() || '未命名角色';
        out.push({ id, name });
      } catch (e) {}
    }
    return out;
  },

  /** 系统：MessageParser 预处理规则（只读） */
  _renderSystemParserItem(d, container, rowIdx, collapsiblePrefix) {
    const contentId = `${collapsiblePrefix}-sp-${rowIdx}`;
    const item = document.createElement('div');
    item.className = 'yd-collapse-item yd-global-regex-item--system';

    const header = document.createElement('div');
    header.className = 'yd-collapse-item__header';
    header.setAttribute('data-collapse', contentId);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'yd-collapse-item__title-wrap';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'yd-collapse-item__title';
    titleSpan.textContent = `${rowIdx + 1}. ${d.label}`;

    const b1 = document.createElement('span');
    b1.className = 'yd-book-type-badge yd-book-type--constant';
    b1.textContent = '系统';
    const b2 = document.createElement('span');
    b2.className = 'yd-book-type-badge yd-book-type--keyword';
    b2.textContent = '预处理';
    b2.style.marginLeft = '6px';

    titleWrap.appendChild(titleSpan);
    titleWrap.appendChild(b1);
    titleWrap.appendChild(b2);

    const rightWrap = document.createElement('div');
    rightWrap.className = 'yd-collapse-item__right';
    const fixed = document.createElement('span');
    fixed.className = 'yd-switch yd-switch--on';
    fixed.textContent = '内置';
    rightWrap.appendChild(fixed);

    const icon = document.createElement('span');
    icon.className = 'yd-collapse-item__icon';
    icon.textContent = '▼';

    header.appendChild(titleWrap);
    header.appendChild(rightWrap);
    header.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'yd-collapse-item__content';
    body.id = contentId;
    body.innerHTML = this._wrapCollapseInner(`
      <div class="yd-global-regex-block"><span class="yd-global-regex-label">说明</span><p class="yd-global-regex-hint">${this.escapeHtml(d.hint || '')}</p></div>
      <div class="yd-global-regex-block"><span class="yd-global-regex-label">正则</span><pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(d.pattern || '')}</pre></div>
      ${this._buildParserTransformPreview()}
    `);

    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
  },

  /** 系统：MessageTypes 行首协议（只读） */
  _renderSystemProtocolItem(desc, container, rowIdx, collapsiblePrefix) {
    const contentId = `${collapsiblePrefix}-st-${rowIdx}`;
    const item = document.createElement('div');
    item.className = 'yd-collapse-item yd-global-regex-item--system';

    const header = document.createElement('div');
    header.className = 'yd-collapse-item__header';
    header.setAttribute('data-collapse', contentId);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'yd-collapse-item__title-wrap';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'yd-collapse-item__title';
    titleSpan.textContent = `${rowIdx + 1}. [${desc.label}] 行首协议`;

    const b1 = document.createElement('span');
    b1.className = 'yd-book-type-badge yd-book-type--constant';
    b1.textContent = '系统';
    const b2 = document.createElement('span');
    b2.className = 'yd-book-type-badge yd-book-type--keyword';
    b2.textContent = '协议';
    b2.style.marginLeft = '6px';

    titleWrap.appendChild(titleSpan);
    titleWrap.appendChild(b1);
    titleWrap.appendChild(b2);

    const rightWrap = document.createElement('div');
    rightWrap.className = 'yd-collapse-item__right';
    const pri = document.createElement('span');
    pri.className = 'yd-global-regex-priority-pill';
    pri.textContent = `优先级 ${desc.priority}`;
    rightWrap.appendChild(pri);

    const icon = document.createElement('span');
    icon.className = 'yd-collapse-item__icon';
    icon.textContent = '▼';

    header.appendChild(titleWrap);
    header.appendChild(rightWrap);
    header.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'yd-collapse-item__content';
    body.id = contentId;
    body.innerHTML = this._wrapCollapseInner(`
      <div class="yd-global-regex-block"><span class="yd-global-regex-label">匹配正则</span><pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(desc.pattern || '')}</pre></div>
      ${this._buildProtocolTransformPreview(desc)}
    `);

    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
  },

  _renderEntryItem(entry, container, editIndex, collapsiblePrefix) {
    const title = this._titleForEntry(entry);
    const enabled = grCoerceEnabled(entry.enabled);
    const patternH = String(entry.pattern || '');
    const repH = String(entry.replacement || '');
    const contentId = `${collapsiblePrefix}-${editIndex}`;

    const item = document.createElement('div');
    item.className = 'yd-collapse-item';

    const header = document.createElement('div');
    header.className = 'yd-collapse-item__header';
    header.setAttribute('data-collapse', contentId);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'yd-collapse-item__title-wrap';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'yd-collapse-item__title';
    titleSpan.textContent = `${editIndex + 1}. ${title}`;

    const typeBadge = document.createElement('span');
    typeBadge.className = 'yd-book-type-badge yd-book-type--keyword';
    typeBadge.textContent = '正则';

    titleWrap.appendChild(titleSpan);
    titleWrap.appendChild(typeBadge);

    const rightWrap = document.createElement('div');
    rightWrap.className = 'yd-collapse-item__right';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'yd-icon-btn yd-global-regex-edit-btn';
    editBtn.setAttribute('data-regex-index', String(editIndex));
    editBtn.title = '编辑';
    editBtn.setAttribute('aria-label', '编辑');
    editBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
      '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>' +
      '</svg>';
    rightWrap.appendChild(editBtn);

    const switchEl = document.createElement('span');
    switchEl.className = `yd-switch ${enabled ? 'yd-switch--on' : 'yd-switch--off'}`;
    switchEl.textContent = enabled ? '开启' : '禁用';
    rightWrap.appendChild(switchEl);

    const icon = document.createElement('span');
    icon.className = 'yd-collapse-item__icon';
    icon.textContent = '▼';

    header.appendChild(titleWrap);
    header.appendChild(rightWrap);
    header.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'yd-collapse-item__content';
    body.id = contentId;

    body.innerHTML = this._wrapCollapseInner(`
      <div class="yd-global-regex-block"><span class="yd-global-regex-label">匹配</span><pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(patternH || '（空）')}</pre></div>
      <div class="yd-global-regex-block"><span class="yd-global-regex-label">替换为</span><pre class="yd-collapse-item__text yd-global-regex-pre">${this.escapeHtml(repH)}</pre></div>
      <div class="yd-global-regex-block">
        <button type="button" class="yd-global-regex-open-test yd-forum-item__btn yd-forum-item__btn--primary" data-global-regex-idx="${editIndex}">测试</button>
      </div>
    `);

    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
  },

  async renderList() {
    this._charRegexTestSlots = [];

    const sysEl = document.getElementById('global-regex-system-list');
    if (sysEl) {
      sysEl.innerHTML = '';
      const sysPrefix = `gr-sys-${Date.now()}`;
      let row = 0;
      if (typeof MessageParser !== 'undefined' && typeof MessageParser.getInlineTagSplitDescriptor === 'function') {
        try {
          const d = MessageParser.getInlineTagSplitDescriptor();
          this._renderSystemParserItem(d, sysEl, row++, sysPrefix);
        } catch (e) {
          console.warn('[GlobalRegexPage] parser descriptor', e);
        }
      }
      if (typeof MessageTypes !== 'undefined' && typeof MessageTypes.getBuiltinProtocolDescriptors === 'function') {
        try {
          const protos = MessageTypes.getBuiltinProtocolDescriptors();
          protos.forEach((desc) => {
            this._renderSystemProtocolItem(desc, sysEl, row++, sysPrefix);
          });
        } catch (e) {
          console.warn('[GlobalRegexPage] protocol descriptors', e);
        }
      }
      if (row === 0) {
        sysEl.innerHTML = '<div style="color:#888;font-size:13px;padding:12px;">（未能加载系统内置规则）</div>';
      } else {
        this._bindListInteractions(sysEl);
      }
    }

    const charEl = document.getElementById('global-regex-character-list');
    if (charEl) {
      charEl.innerHTML = '';
      try {
        const sections = await this._loadCharacterRegexSections();
        const filteredSections = sections;
        if (!filteredSections.length) {
          charEl.innerHTML =
            '<div style="color:#888;font-size:13px;padding:12px;">暂无角色正则规则</div>';
        } else {
          charEl.innerHTML = '';
          const groupPrefix = `gr-group-${Date.now()}`;
          for (let s = 0; s < filteredSections.length; s++) {
            const sec = filteredSections[s];
            const group = document.createElement('div');
            group.className = 'yd-worldbook-role-group yd-regex-role-group';
            const title = document.createElement('div');
            title.className = 'yd-worldbook-role-group__title';
            title.textContent = sec.characterName || '角色';
            const list = document.createElement('div');
            list.className = 'yd-worldbook-list yd-worldbook-role-group__list';
            group.appendChild(title);
            group.appendChild(list);
            charEl.appendChild(group);

            const prefix = `${groupPrefix}-${s}`;
            for (let j = 0; j < (sec.entries || []).length; j++) {
              this._renderCharacterRegexItem(
                sec.entries[j],
                sec.characterName,
                sec.characterId,
                list,
                j,
                prefix
              );
            }
            this._bindListInteractions(list);
          }
        }
      } catch (e) {
        console.warn('[GlobalRegexPage] character regex', e);
        charEl.innerHTML =
          '<div style="color:#888;font-size:13px;padding:12px;">（加载角色扩展失败）</div>';
      }
    }

    const listEl = document.getElementById('global-regex-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    const entries = typeof GlobalRegexConverter !== 'undefined' ? GlobalRegexConverter.getEntries() : [];
    const displayEntries = entries;

    if (!displayEntries.length) {
      listEl.innerHTML =
        '<div style="color:#888;font-size:13px;padding:12px;">暂无全局正则规则，点击右上角 ＋ 添加</div>';
      this._applyFilterVisibility();
      return;
    }

    const prefix = `gr-${Date.now()}`;
    displayEntries.forEach((e, idx) => this._renderEntryItem(e, listEl, idx, prefix));
    this._bindListInteractions(listEl);
    this._applyFilterVisibility();
  },

  async renderIfNeeded() {
    // 从主屏/其它入口进入：清掉上次从聊天带来的“角色过滤”
    try {
      if (!State || State.regexRulesReturnPage !== 'page-chat') {
        if (State) State.regexRulesCharacterFilterId = null;
      }
    } catch (e) {}
    await this.renderList();
  }
};

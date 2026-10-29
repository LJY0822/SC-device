// 世界书页面：展示“全局世界书”和“局部世界书”

/** ST/导入数据里 enabled 可能是 0、字符串等，统一成布尔，避免列表「开关」回显错 */
function wbCoerceEnabled(raw) {
  if (raw === false || raw === 0 || raw === '0') return false;
  if (raw === true || raw === 1 || raw === '1') return true;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'false' || s === 'no' || s === 'off') return false;
    if (s === 'true' || s === 'yes' || s === 'on') return true;
  }
  return true;
}

const Worldbook = {
  _renderedOnce: false,
  _activeFilter: 'all',
  _charWorldbookEditSlots: [],

  init() {
    this.setupEvents();
    // 进入页面时再刷新内容（避免首次进入空渲染/性能浪费）
    window.addEventListener('yd:pagechange', (e) => {
      const to = e && e.detail ? e.detail.to : '';
      if (to === 'page-worldbook') {
        this.renderIfNeeded();
      }
    });

    // 首次进入（若默认就在该页）也加载
    setTimeout(() => {
      const page = document.getElementById('page-worldbook');
      const isActive = page && page.classList && page.classList.contains('yd-page--active');
      if (isActive) this.renderIfNeeded();
    }, 50);
  },

  setupEvents() {
    const backBtn = document.getElementById('worldbook-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const back = State.worldbookReturnPage || 'page-homescreen';
        State.worldbookReturnPage = null;
        State.switchPage(back);
      });
    }

    const addBtn = document.getElementById('worldbook-add');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        await this.openCreateDialog();
      });
    }

    const tabs = document.getElementById('worldbook-tabs');
    if (tabs) {
      tabs.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.yd-beautify-tab[data-filter]') : null;
        if (!btn) return;
        const filter = String(btn.getAttribute('data-filter') || '').trim() || 'all';
        this._activeFilter = filter;
        tabs.querySelectorAll('.yd-beautify-tab').forEach((el) => {
          el.classList.toggle('yd-beautify-tab--active', el === btn);
        });
        void this.renderWorldbooks();
      });
    }
  },

  async _buildGlobalEntriesArray() {
    let raw = null;
    try {
      raw = await Storage.worldbookGlobalGet();
    } catch (e) {}
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = null;
      }
    }
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && typeof raw === 'object' && Array.isArray(raw.entries)) arr = raw.entries;
    else if (raw && typeof raw === 'object' && Array.isArray(raw.character_book?.entries)) {
      arr = raw.character_book.entries;
    }
    return Array.isArray(arr) ? arr : [];
  },

  /**
   * 通用世界书条目弹窗（全局页与角色编辑页共用）
   * @param {Object} opts
   * @param {string} opts.titleBar - 顶栏标题
   * @param {boolean} [opts.enabled=true]
   * @param {string} [opts.comment='']
   * @param {string} [opts.keysText=''] - 关键词展示串（逗号/中文逗号/顿号分隔）
   * @param {string} [opts.content='']
   * @param {boolean} [opts.showDelete=false]
   * @param {'global'|'character'} [opts.scopeType='global']
   * @param {string} [opts.scopeCharacterId='']
   * @param {Array<{id: string, name: string}>} [opts.scopeCharacterOptions=[]]
   * @param {(payload: { enabled: boolean, comment: string, keys: string[], content: string, scopeType: 'global'|'character', characterId: string }) => void|Promise<void>} opts.onSave
   * @param {() => boolean|void|Promise<boolean|void>} [opts.onDelete] - 返回 false 时不关闭弹窗
   */
  openEntryModal(opts) {
    const {
      titleBar,
      enabled: enabledInit = true,
      comment: commentInit = '',
      keysText: keysInit = '',
      content: contentInit = '',
      scopeType: scopeTypeInit = 'global',
      scopeCharacterId: scopeCharacterIdInit = '',
      scopeCharacterOptions: scopeCharacterOptionsInit = [],
      showDelete = false,
      onSave,
      onDelete
    } = opts || {};

    const existingModal = document.getElementById('yd-worldbook-dialog');
    if (existingModal) existingModal.remove();

    const deleteRow = showDelete
      ? `<button type="button" class="yd-forum-item__btn" id="yd-worldbook-delete" style="color:#dc2626;">删除本条</button>`
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
          <label class="yd-global-regex-label" for="yd-worldbook-scope-type" style="display:block;margin-bottom:6px;">作用范围</label>
          <select class="yd-forum-compose__input" id="yd-worldbook-scope-type">
            <option value="global" ${scopeInitialType === 'global' ? 'selected' : ''}>全局世界书</option>
            <option value="character" ${scopeInitialType === 'character' ? 'selected' : ''}>指定角色世界书</option>
          </select>
          <select class="yd-forum-compose__input" id="yd-worldbook-scope-character" style="margin-top:8px;${scopeInitialType === 'character' ? '' : 'display:none;'}">
            ${scopeCharacterOptionsHtml}
          </select>
        </div>
      `
      : '';

    const modal = document.createElement('div');
    modal.id = 'yd-worldbook-dialog';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">${this.escapeHtml(titleBar || '世界书条目')}</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <label class="yd-book-edit__row yd-toggle" style="margin-bottom:8px;">
          <span class="yd-toggle__label yd-book-edit__toggle-label">是否开启</span>
          <span class="yd-toggle__control">
            <input type="checkbox" id="yd-worldbook-enabled" class="yd-book-enabled yd-toggle__input" ${enabledInit ? 'checked' : ''}>
            <span class="yd-toggle__slider"></span>
          </span>
        </label>
        <input class="yd-forum-compose__input" id="yd-worldbook-title" placeholder="条目标题（可选）" maxlength="48" value="${this.escapeHtml(commentInit)}">
        ${scopeRowHtml}
        <input class="yd-forum-compose__input" id="yd-worldbook-keys" placeholder="关键词（逗号/顿号分隔，可留空表示常驻）" style="margin-top:10px;" value="${this.escapeHtml(keysInit)}">
        <textarea class="yd-forum-compose__textarea" id="yd-worldbook-content" placeholder="世界书内容（必填，用于描述规则、背景、设定等）" maxlength="100000" style="margin-top:10px;">${this.escapeHtml(contentInit)}</textarea>
        <div class="yd-forum-picker__footer" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:nowrap;">
          <div style="display:flex;align-items:center;gap:10px;min-height:32px;">${deleteRow}</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-worldbook-save">保存</button>
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

    const parseKeys = (raw) => {
      const s = String(raw || '').trim();
      if (!s) return [];
      return s.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
    };

    const saveBtn = modal.querySelector('#yd-worldbook-save');
    const scopeTypeEl = modal.querySelector('#yd-worldbook-scope-type');
    const scopeCharacterEl = modal.querySelector('#yd-worldbook-scope-character');
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
        const titleEl = document.getElementById('yd-worldbook-title');
        const keysEl = document.getElementById('yd-worldbook-keys');
        const contentEl = document.getElementById('yd-worldbook-content');
        const enabledEl = document.getElementById('yd-worldbook-enabled');
        if (!contentEl) return;

        const comment = String(titleEl && titleEl.value || '').trim();
        const keys = parseKeys(keysEl && keysEl.value);
        const content = String(contentEl.value || '').trim();
        if (!content) {
          alert('内容不能为空');
          contentEl.focus();
          return;
        }

        const payload = {
          enabled: enabledEl ? !!enabledEl.checked : true,
          comment,
          keys,
          content,
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
          console.error('[worldbook] openEntryModal onSave failed', e);
          alert('保存失败，请稍后再试。');
        }
      });
    }

    const delBtn = modal.querySelector('#yd-worldbook-delete');
    if (delBtn && typeof onDelete === 'function') {
      delBtn.addEventListener('click', async () => {
        try {
          const r = await onDelete();
          if (r === false) return;
        } catch (e) {
          console.error('[worldbook] openEntryModal onDelete failed', e);
          return;
        }
        close();
      });
    }

    const firstInput = document.getElementById('yd-worldbook-title');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 0);
    }
  },

  async openEditDialog(index) {
    const arr = await this._buildGlobalEntriesArray();
    const existing = (Array.isArray(arr) && index >= 0 && index < arr.length) ? arr[index] : null;
    if (!existing) {
      return;
    }

    const keysInit = (() => {
      const keys = Array.isArray(existing.keys) ? existing.keys : [];
      const sk = Array.isArray(existing.secondary_keys) ? existing.secondary_keys : [];
      const all = [...keys, ...sk].map(s => String(s || '').trim()).filter(Boolean);
      return all.join(', ');
    })();

    this.openEntryModal({
      titleBar: '编辑世界书条目',
      enabled: existing.enabled !== false,
      comment: String(existing.comment || '').trim(),
      keysText: keysInit,
      content: String(existing.content || existing.value || existing.entry || '').trim(),
      showDelete: true,
      onSave: async (payload) => {
        const nextArr = await this._buildGlobalEntriesArray();
        if (!(Array.isArray(nextArr) && index >= 0 && index < nextArr.length)) {
          return;
        }
        nextArr[index] = {
          enabled: payload.enabled,
          comment: payload.comment,
          content: payload.content,
          keys: payload.keys,
          secondary_keys: []
        };
        await Storage.worldbookGlobalSet({ entries: nextArr });
        await this.renderWorldbooks();
      },
      onDelete: async () => {
        if (!confirm('确定删除这条世界书？')) return false;
        const nextArr = await this._buildGlobalEntriesArray();
        if (!(Array.isArray(nextArr) && index >= 0 && index < nextArr.length)) return false;
        nextArr.splice(index, 1);
        await Storage.worldbookGlobalSet({ entries: nextArr });
        await this.renderWorldbooks();
      }
    });
  },

  async openCreateDialog() {
    const charOptions = await this._loadSessionCharactersForCreate();
    this.openEntryModal({
      titleBar: '新增世界书条目',
      enabled: true,
      comment: '',
      keysText: '',
      content: '',
      scopeType: 'global',
      scopeCharacterId: charOptions[0] ? charOptions[0].id : '',
      scopeCharacterOptions: charOptions,
      showDelete: false,
      onSave: async (payload) => {
        if (payload.scopeType === 'character') {
          const ok = await this._appendCharacterWorldbookEntry(payload.characterId, payload);
          if (!ok) throw new Error('append character worldbook failed');
        } else {
          const arr = await this._buildGlobalEntriesArray();
          arr.push({
            enabled: payload.enabled,
            comment: payload.comment,
            content: payload.content,
            keys: payload.keys,
            secondary_keys: []
          });
          await Storage.worldbookGlobalSet({ entries: arr });
        }
        await this.renderWorldbooks();
      }
    });
  },

  async renderIfNeeded() {
    // 从主屏/其它入口进入：清掉上次从聊天带来的“角色过滤”
    try {
      if (!State || State.worldbookReturnPage !== 'page-chat') {
        if (State) State.worldbookCharacterFilterId = null;
      }
    } catch (e) {}
    // 允许每次进入都刷新（保证新建/编辑后立即生效）
    await this.renderWorldbooks();
    this._renderedOnce = true;
  },

  escapeHtml(str) {
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },

  _extractEntriesFromBook(characterBook) {
    if (!characterBook || typeof characterBook !== 'object') return [];
    const entries = characterBook.entries;
    if (!entries) return [];

    let items = [];
    if (Array.isArray(entries)) items = entries;
    else if (typeof entries === 'object') items = Object.values(entries);
    else return [];

    return (items || [])
      .filter((it) => it && typeof it === 'object')
      .map((it) => {
        const enabled = wbCoerceEnabled(it.enabled);
        const comment = String(it.comment || '').trim();
        const content = String(it.content || it.value || it.entry || '').trim();
        const keys = Array.isArray(it.keys) ? it.keys.map(k => String(k || '').trim()).filter(Boolean) : [];
        const secondaryKeys = [
          ...(Array.isArray(it.secondary_keys) ? it.secondary_keys : []),
          ...(Array.isArray(it.secondaryKeys) ? it.secondaryKeys : [])
        ].map(k => String(k || '').trim()).filter(Boolean);
        return {
          enabled,
          comment,
          content,
          keys,
          secondaryKeys
        };
      });
  },

  _extractCharacterBook(rawCharacter) {
    if (!rawCharacter || typeof rawCharacter !== 'object') return null;
    const data = (rawCharacter.data && typeof rawCharacter.data === 'object') ? rawCharacter.data : rawCharacter;
    return data.character_book || rawCharacter.character_book || null;
  },

  _extractEntriesFromBookWithSource(characterBook) {
    if (!characterBook || typeof characterBook !== 'object') return [];
    const entries = characterBook.entries;
    if (!entries) return [];
    const out = [];
    if (Array.isArray(entries)) {
      entries.forEach((it, idx) => {
        if (!it || typeof it !== 'object') return;
        const norm = this._extractEntriesFromBook({ entries: [it] })[0];
        if (!norm) return;
        out.push({ ...norm, _sourceType: 'array', _sourceIndex: idx, _raw: it });
      });
      return out;
    }
    if (typeof entries === 'object') {
      Object.entries(entries).forEach(([key, it]) => {
        if (!it || typeof it !== 'object') return;
        const norm = this._extractEntriesFromBook({ entries: [it] })[0];
        if (!norm) return;
        out.push({ ...norm, _sourceType: 'object', _sourceKey: key, _raw: it });
      });
      return out;
    }
    return out;
  },

  async _loadCharacterWorldbookSections() {
    const out = [];
    const filterId =
      typeof State !== 'undefined' ? String(State.worldbookCharacterFilterId || '').trim() : '';
    if (filterId) {
      try {
        const charRecord = await Storage.dbGet('characters', filterId);
        if (!charRecord) return out;
        const name =
          String(charRecord.name || (charRecord.data && charRecord.data.name) || '未命名角色').trim() ||
          '未命名角色';
        const book = this._extractCharacterBook(charRecord);
        const entries = this._extractEntriesFromBookWithSource(book);
        if (entries.length) out.push({ characterName: name, characterId: filterId, entries });
      } catch (e) {}
      return out;
    }

    // 主屏进入：展示所有角色的角色世界书（按角色分组）
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
          const book = this._extractCharacterBook(charRecord);
          const entries = this._extractEntriesFromBookWithSource(book);
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

      const book = this._extractCharacterBook(charRecord);
      const entries = this._extractEntriesFromBookWithSource(book);
      if (entries.length) {
        out.push({ characterName: name, characterId: id, entries });
      }
    }

    return out;
  },

  async _updateCharacterWorldbookEntry({ charId, sourceType, sourceIndex, sourceKey, payload, remove = false }) {
    if (!charId) return false;
    let record = null;
    try {
      record = await Storage.dbGet('characters', charId);
    } catch (e) {
      console.error('[worldbook] load character failed', e);
      alert('加载角色失败，无法保存世界书。');
      return false;
    }
    if (!record) {
      alert('未找到对应角色，无法保存世界书。');
      return false;
    }

    const data = (record.data && typeof record.data === 'object') ? record.data : record;
    if (!data.character_book || typeof data.character_book !== 'object') {
      data.character_book = { entries: [] };
    }
    if (!data.character_book.entries || (typeof data.character_book.entries !== 'object')) {
      data.character_book.entries = [];
    }

    const entries = data.character_book.entries;
    if (Array.isArray(entries)) {
      const idx = Number(sourceIndex);
      if (!(Number.isFinite(idx) && idx >= 0 && idx < entries.length)) return false;
      if (remove) {
        entries.splice(idx, 1);
      } else {
        const base = entries[idx] && typeof entries[idx] === 'object' ? { ...entries[idx] } : {};
        entries[idx] = {
          ...base,
          enabled: payload.enabled,
          comment: payload.comment,
          content: payload.content,
          keys: payload.keys,
          secondary_keys: []
        };
      }
    } else if (entries && typeof entries === 'object') {
      const k = String(sourceKey || '').trim();
      if (!k || !(k in entries)) return false;
      if (remove) {
        delete entries[k];
      } else {
        const base = entries[k] && typeof entries[k] === 'object' ? { ...entries[k] } : {};
        entries[k] = {
          ...base,
          enabled: payload.enabled,
          comment: payload.comment,
          content: payload.content,
          keys: payload.keys,
          secondary_keys: []
        };
      }
    } else {
      return false;
    }

    if (record.data && typeof record.data === 'object') {
      record.data.character_book = data.character_book;
    } else {
      record.character_book = data.character_book;
    }

    await Storage.dbPut('characters', record);
    return true;
  },

  async _appendCharacterWorldbookEntry(charId, payload) {
    if (!charId) return false;
    let record = null;
    try {
      record = await Storage.dbGet('characters', charId);
    } catch (e) {
      console.error('[worldbook] append character entry load failed', e);
      return false;
    }
    if (!record) return false;

    const data = (record.data && typeof record.data === 'object') ? record.data : record;
    if (!data.character_book || typeof data.character_book !== 'object') {
      data.character_book = {};
    }
    if (!data.character_book.entries || typeof data.character_book.entries !== 'object') {
      data.character_book.entries = [];
    }
    const entry = {
      enabled: payload.enabled,
      comment: payload.comment,
      content: payload.content,
      keys: Array.isArray(payload.keys) ? payload.keys : [],
      secondary_keys: []
    };
    if (Array.isArray(data.character_book.entries)) {
      data.character_book.entries.push(entry);
    } else {
      const key = `yd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      data.character_book.entries[key] = entry;
    }

    if (record.data && typeof record.data === 'object') {
      record.data.character_book = data.character_book;
    } else {
      record.character_book = data.character_book;
    }
    await Storage.dbPut('characters', record);
    return true;
  },

  async _loadSessionCharactersForCreate() {
    const out = [];
    if (typeof Chat === 'undefined' || !Chat.currentSessionId) {
      // 主屏幕进入世界书页时没有“当前会话”，这里回退到全角色列表
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
      // 有 sessionId 但 session 拉取失败：也回退到全角色列表
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

  _openCharacterWorldbookEditBySlot(slotIdx) {
    const slot = Array.isArray(this._charWorldbookEditSlots) ? this._charWorldbookEditSlots[slotIdx] : null;
    if (!slot || !slot.entry) return;
    const entry = slot.entry;
    const keysText = [...(entry.keys || []), ...(entry.secondaryKeys || [])].join(', ');
    this.openEntryModal({
      titleBar: `${slot.characterName || '角色'} · 编辑世界书`,
      enabled: entry.enabled !== false,
      comment: String(entry.comment || '').trim(),
      keysText,
      content: String(entry.content || '').trim(),
      showDelete: true,
      onSave: async (payload) => {
        const ok = await this._updateCharacterWorldbookEntry({
          charId: slot.characterId,
          sourceType: entry._sourceType,
          sourceIndex: entry._sourceIndex,
          sourceKey: entry._sourceKey,
          payload,
          remove: false
        });
        if (!ok) throw new Error('save character worldbook failed');
        await this.renderWorldbooks();
      },
      onDelete: async () => {
        if (!confirm('确定删除这条角色世界书？')) return false;
        const ok = await this._updateCharacterWorldbookEntry({
          charId: slot.characterId,
          sourceType: entry._sourceType,
          sourceIndex: entry._sourceIndex,
          sourceKey: entry._sourceKey,
          payload: null,
          remove: true
        });
        if (!ok) return false;
        await this.renderWorldbooks();
      }
    });
  },

  _titleForEntry(entry) {
    const c = entry.comment && entry.comment.trim() ? entry.comment.trim() : '';
    if (c) return c;
    const firstLine = String(entry.content || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
    return firstLine ? (firstLine.length > 28 ? firstLine.slice(0, 28) + '…' : firstLine) : '未命名条目';
  },

  _bindWorldbookListInteractions(container) {
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

    container.querySelectorAll('.yd-worldbook-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-worldbook-index'));
        if (Number.isFinite(idx)) this.openEditDialog(idx);
      });
    });
    container.querySelectorAll('.yd-worldbook-edit-char').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = Number(btn.getAttribute('data-worldbook-char-slot'));
        if (Number.isFinite(slot)) this._openCharacterWorldbookEditBySlot(slot);
      });
    });
  },

  _renderEntryItem(entry, container, ownerLabel = '', editIndex = null, collapsiblePrefix = 'wb', charEditSlot = null) {
    const title = this._titleForEntry(entry);
    const displayTitle = ownerLabel ? `${ownerLabel} - ${title}` : title;
    const contentH = String(entry.content || '').trim();
    const allKeys = [...(entry.keys || []), ...(entry.secondaryKeys || [])]
      .map((k) => String(k || '').trim())
      .filter((k) => k.length > 0);
    const isConstant = allKeys.length === 0;
    const enabled = entry.enabled !== false;

    const rowIdx = typeof editIndex === 'number' ? editIndex : 0;
    const contentId = `${collapsiblePrefix}-${rowIdx}`;

    const item = document.createElement('div');
    item.className = 'yd-collapse-item';

    const header = document.createElement('div');
    header.className = 'yd-collapse-item__header';
    header.setAttribute('data-collapse', contentId);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'yd-collapse-item__title-wrap';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'yd-collapse-item__title';
    titleSpan.textContent =
      typeof editIndex === 'number' ? `${editIndex + 1}. ${displayTitle}` : displayTitle;

    const typeBadge = document.createElement('span');
    typeBadge.className = `yd-book-type-badge ${isConstant ? 'yd-book-type--constant' : 'yd-book-type--keyword'}`;
    typeBadge.textContent = isConstant ? '常驻' : '关键词触发';

    titleWrap.appendChild(titleSpan);
    titleWrap.appendChild(typeBadge);

    const rightWrap = document.createElement('div');
    rightWrap.className = 'yd-collapse-item__right';

    if (typeof editIndex === 'number' || Number.isFinite(charEditSlot)) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = `yd-icon-btn ${Number.isFinite(charEditSlot) ? 'yd-worldbook-edit-char' : 'yd-worldbook-edit-btn'}`;
      if (Number.isFinite(charEditSlot)) {
        editBtn.setAttribute('data-worldbook-char-slot', String(charEditSlot));
      } else {
        editBtn.setAttribute('data-worldbook-index', String(editIndex));
      }
      editBtn.title = '编辑';
      editBtn.setAttribute('aria-label', '编辑');
      editBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
        '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>' +
        '</svg>';
      rightWrap.appendChild(editBtn);
    }

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
    let bodyInner = '';
    if (!isConstant && allKeys.length) {
      const keysLine = allKeys.map((k) => this.escapeHtml(k)).join('、');
      bodyInner += `<div class="yd-book-keywords-info">关键词触发：${keysLine}</div>`;
    }
    bodyInner += `<pre class="yd-collapse-item__text">${this.escapeHtml(contentH || '（无内容）')}</pre>`;
    body.innerHTML = bodyInner;

    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
  },

  _applyFilterVisibility() {
    const filter = this._activeFilter || 'all';
    const globalSection = document.getElementById('worldbook-section-global');
    const characterSection = document.getElementById('worldbook-section-character');
    if (globalSection) {
      globalSection.style.display = filter === 'all' || filter === 'global' ? '' : 'none';
    }
    if (characterSection) {
      characterSection.style.display = filter === 'all' || filter === 'character' ? '' : 'none';
    }
  },

  async renderWorldbooks() {
    this._charWorldbookEditSlots = [];
    const globalListEl = document.getElementById('worldbook-global-list');
    const charListEl = document.getElementById('worldbook-character-list');
    if (!globalListEl) return;

    globalListEl.innerHTML = '';
    if (charListEl) charListEl.innerHTML = '';

    // 1) 全局：仅从 IndexedDB kv 读取（首读时从旧 localStorage 迁入）
    let globalRaw = null;
    try {
      globalRaw = await Storage.worldbookGlobalGet();
    } catch (e) {}
    if (typeof globalRaw === 'string') {
      try {
        globalRaw = JSON.parse(globalRaw);
      } catch (e) {
        globalRaw = null;
      }
    }

    let globalEntriesArray = [];
    if (Array.isArray(globalRaw)) globalEntriesArray = globalRaw;
    else if (globalRaw && typeof globalRaw === 'object') {
      if (Array.isArray(globalRaw.entries)) globalEntriesArray = globalRaw.entries;
      else if (Array.isArray(globalRaw.character_book?.entries)) globalEntriesArray = globalRaw.character_book.entries;
    }

    // 「当前」标签表示会话/角色范围内一览，不按 enabled 过滤（否则会隐藏关闭项、序号与存储错位）
    const globalEntriesRaw = this._extractEntriesFromBook({ entries: globalEntriesArray });
    const globalEntries = globalEntriesRaw;
    if (!globalEntries.length) {
      globalListEl.innerHTML =
        '<div style="color:#888;font-size:13px;padding:12px;">暂无全局世界书条目</div>';
    } else {
      const collapsiblePrefix = `wb-${Date.now()}`;
      globalEntries.forEach((e, idx) =>
        this._renderEntryItem(e, globalListEl, '', idx, collapsiblePrefix)
      );
      this._bindWorldbookListInteractions(globalListEl);
    }

    if (charListEl) {
      try {
        const sections = await this._loadCharacterWorldbookSections();
        const filteredSections = sections;
        if (!filteredSections.length) {
          charListEl.innerHTML =
            '<div style="color:#888;font-size:13px;padding:12px;">暂无角色世界书条目（若无会话，可从主屏进入并选择「角色世界书」查看全部角色）</div>';
        } else {
          charListEl.innerHTML = '';
          const groupPrefix = `wb-group-${Date.now()}`;
          for (let s = 0; s < filteredSections.length; s++) {
            const sec = filteredSections[s];
            const group = document.createElement('div');
            group.className = 'yd-worldbook-role-group';
            const title = document.createElement('div');
            title.className = 'yd-worldbook-role-group__title';
            title.textContent = sec.characterName || '角色';
            const list = document.createElement('div');
            list.className = 'yd-worldbook-list yd-worldbook-role-group__list';
            group.appendChild(title);
            group.appendChild(list);
            charListEl.appendChild(group);

            const prefix = `${groupPrefix}-${s}`;
            for (let j = 0; j < (sec.entries || []).length; j++) {
              const entry = sec.entries[j];
              const slot = this._charWorldbookEditSlots.length;
              this._charWorldbookEditSlots.push({
                characterId: sec.characterId,
                characterName: sec.characterName,
                entry
              });
              this._renderEntryItem(entry, list, sec.characterName, null, `${prefix}-${j}`, slot);
            }
            this._bindWorldbookListInteractions(list);
          }
        }
      } catch (e) {
        console.warn('[worldbook] character worldbook', e);
        charListEl.innerHTML = '<div style="color:#888;font-size:13px;padding:12px;">（加载角色世界书失败）</div>';
      }
    }

    this._applyFilterVisibility();
  }
};


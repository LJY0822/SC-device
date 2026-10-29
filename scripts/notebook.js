// 笔记本（备忘录）
const Notebook = {
  _notes: [],
  _currentNoteId: null,
  _saveTimer: 0,
  DIARY_KIND: 'diary',

  init() {
    this.setupEvents();
    this.renderList();
  },

  setupEvents() {
    document.getElementById('notebook-back')?.addEventListener('click', () => State.backToHome());
    document.getElementById('notebook-detail-back')?.addEventListener('click', () => State.switchPage('page-notebook'));
    document.getElementById('notebook-add')?.addEventListener('click', () => this.createNoteAndOpen());
    document.getElementById('notebook-delete')?.addEventListener('click', () => this.deleteCurrentNote());

    const titleEl = document.getElementById('notebook-title');
    const editorEl = document.getElementById('notebook-editor');
    const onChange = () => this._scheduleSaveCurrent();
    titleEl?.addEventListener('input', onChange);
    editorEl?.addEventListener('input', onChange);
  },

  async renderList() {
    const listEl = document.getElementById('notebook-list');
    if (!listEl) return;

    const notes = await Storage.dbGetAll('notes');
    const filtered = (notes || []).filter((n) => String(n?.kind || 'notebook') !== this.DIARY_KIND);
    this._notes = filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!this._notes.length) {
      listEl.innerHTML = `
        <div class="yd-notebook-empty">
          <div class="yd-notebook-empty__icon">📝</div>
          <div>还没有笔记，点击右下角新增</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this._notes.map(n => this._renderNoteCard(n)).join('');
    Array.from(listEl.querySelectorAll('.yd-note-card')).forEach((el) => {
      const id = el.getAttribute('data-id') || '';
      el.addEventListener('click', () => this.openNote(id));
    });
  },

  _renderNoteCard(note) {
    const title = (note.title || '').trim() || '无标题';
    const preview = this._buildPreview(note);
    const time = this._formatTime(note.updatedAt || note.createdAt || Date.now());
    return `
      <div class="yd-note-card" data-id="${this._escapeHtml(note.id)}">
        <div class="yd-note-card__title">${this._escapeHtml(title)}</div>
        <div class="yd-note-card__preview">${this._escapeHtml(preview)}</div>
        <div class="yd-note-card__meta">${this._escapeHtml(time)}</div>
      </div>
    `;
  },

  _buildPreview(note) {
    const content = String(note.content || '').trim();
    if (!content) return '（空）';
    return content.replace(/\s+/g, ' ').slice(0, 80);
  },

  async createNoteAndOpen() {
    const now = Date.now();
    const note = {
      id: State.generateId(),
      kind: 'notebook',
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now
    };
    await Storage.dbAdd('notes', note);
    await this.renderList();
    await this.openNote(note.id, true);
  },

  async openNote(id, focusEditor = false) {
    const note = await Storage.dbGet('notes', id);
    if (!note) return;
    this._currentNoteId = id;

    const titleEl = document.getElementById('notebook-title');
    const editorEl = document.getElementById('notebook-editor');
    if (titleEl) titleEl.value = note.title || '';
    if (editorEl) editorEl.value = note.content || '';

    State.switchPage('page-notebook-detail');
    if (focusEditor) {
      setTimeout(() => editorEl?.focus(), 50);
    }
  },

  async deleteCurrentNote() {
    if (!this._currentNoteId) return;
    const ok = confirm('确定删除这条笔记吗？');
    if (!ok) return;
    await Storage.dbDelete('notes', this._currentNoteId);
    this._currentNoteId = null;
    State.switchPage('page-notebook');
    await this.renderList();
  },

  _scheduleSaveCurrent() {
    if (!this._currentNoteId) return;
    window.clearTimeout(this._saveTimer);
    this._saveTimer = window.setTimeout(() => {
      this._saveCurrent().catch((e) => console.error('保存笔记失败:', e));
    }, 250);
  },

  async _saveCurrent() {
    const id = this._currentNoteId;
    if (!id) return;
    const note = await Storage.dbGet('notes', id);
    if (!note) return;

    const titleEl = document.getElementById('notebook-title');
    const editorEl = document.getElementById('notebook-editor');
    note.title = titleEl ? String(titleEl.value || '') : (note.title || '');
    note.content = editorEl ? String(editorEl.value || '') : (note.content || '');
    note.updatedAt = Date.now();
    await Storage.dbPut('notes', note);
    // 列表页若用户返回，会看到最新排序与预览
  },

  _formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  },

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }
};


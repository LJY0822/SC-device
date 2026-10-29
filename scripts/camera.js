// 相机页面：通过文件选择器选图，填写一句话描述后保存到 IndexedDB(album)
const Camera = {
  _dataUrl: '',
  _participantsState: null,
  _shotTimeText: '',
  _shotLocationText: '',
  _draftDescText: '',

  init() {
    this.setupEvents();
  },

  setupEvents() {
    const backBtn = document.getElementById('camera-back');
    if (backBtn) backBtn.addEventListener('click', () => State.backToHome());

    const captureBtn = document.getElementById('camera-capture');
    const fileInput = document.getElementById('camera-file');
    if (captureBtn && fileInput) {
      captureBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        this._handleFile(file);
        // 允许重复拍照：清空 value 以便同一文件也能触发 change
        e.target.value = '';
      });
    }

    const retakeBtn = document.getElementById('camera-retake');
    if (retakeBtn && fileInput) {
      retakeBtn.addEventListener('click', () => fileInput.click());
    }

    const saveBtn = document.getElementById('camera-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await this.openDescSheet();
      });
    }

    const chipParticipants = document.getElementById('camera-chip-participants');
    if (chipParticipants) {
      chipParticipants.addEventListener('click', async () => {
        await this.openDescSheet({ focus: 'participants', fromChip: true });
      });
    }

    const chipLocation = document.getElementById('camera-chip-location');
    if (chipLocation) {
      chipLocation.addEventListener('click', async () => {
        await this.openDescSheet({ focus: 'location', fromChip: true });
      });
    }

    const sheet = document.getElementById('camera-desc-sheet');
    const cancel = document.getElementById('camera-desc-cancel');
    const confirmBtn = document.getElementById('camera-desc-confirm');
    if (sheet) {
      sheet.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-close') === '1') {
          this.closeDescSheet();
        }
      });
    }
    if (cancel) cancel.addEventListener('click', () => this.closeDescSheet());
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        // 未拍照时：只保存“出镜角色/时间/地点/描述”的临时设置，不存相册
        if (!this._dataUrl) {
          this.saveDraftMetaFromSheet();
          this.closeDescSheet();
          return;
        }
        await this.saveToAlbum();
      });
    }
  },

  async _handleFile(file) {
    // 基础校验
    if (!file.type || !file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      this._dataUrl = String(dataUrl || '');
      this._renderPreview(this._dataUrl);

      const retakeBtn = document.getElementById('camera-retake');
      const saveBtn = document.getElementById('camera-save');
      if (retakeBtn) retakeBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = false;

      // 默认描述：用日期时间
      const desc = document.getElementById('camera-desc');
      if (desc && !String(desc.value || '').trim()) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        desc.value = `照片 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }

      // 拍完后自动弹出描述层（更贴近系统相机“拍完确认”的节奏）
      await this.openDescSheet();
    } catch (e) {
      console.error('读取照片失败:', e);
      alert('读取照片失败');
    }
  },

  _renderPreview(dataUrl) {
    const img = document.getElementById('camera-preview-img');
    const empty = document.getElementById('camera-preview-empty');
    if (img) {
      img.src = dataUrl;
      img.style.display = dataUrl ? 'block' : 'none';
    }
    if (empty) {
      empty.style.display = dataUrl ? 'none' : 'block';
    }
  },

  async openDescSheet(options = {}) {
    // 允许在未拍照情况下，从 chips 打开信息面板，用于预先设置角色/地点
    if (!this._dataUrl && !options.fromChip) return;
    const sheet = document.getElementById('camera-desc-sheet');
    if (!sheet) return;
    sheet.hidden = false;

    // 渲染出镜角色列表
    try {
      await this.renderParticipantsList();
    } catch (e) {
      console.error('渲染出镜角色列表失败:', e);
    }

    // 默认拍摄时间（若为空）
    const timeInput = document.getElementById('camera-shot-time');
    if (timeInput) {
      if (this._shotTimeText) {
        timeInput.value = this._shotTimeText;
      } else if (!String(timeInput.value || '').trim()) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        timeInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }

    const locInput = document.getElementById('camera-shot-location');
    if (locInput && this._shotLocationText) {
      locInput.value = this._shotLocationText;
    }

    const descEl = document.getElementById('camera-desc');
    if (descEl && this._draftDescText && !String(descEl.value || '').trim()) {
      descEl.value = this._draftDescText;
    }

    // 根据已保存的 participantsState 预选复选框
    if (this._participantsState) {
      try {
        const inputs = document.querySelectorAll('.camera-participant-input');
        inputs.forEach((el) => {
          const id = el.getAttribute('data-id');
          if (!id) return;
          if (id === 'self') {
            el.checked = !!this._participantsState.self;
          } else {
            el.checked = Array.isArray(this._participantsState.characterIds)
              ? this._participantsState.characterIds.includes(id)
              : false;
          }
        });
      } catch (e) {
        console.error('预选出镜角色失败:', e);
      }
    }

    // 聚焦：根据来源决定先聚焦哪一块
    setTimeout(() => {
      if (options && options.focus === 'participants') {
        const first = document.querySelector('.camera-participant-input');
        if (first && first.focus) first.focus();
        return;
      }
      if (options && options.focus === 'location') {
        const loc = document.getElementById('camera-shot-location');
        if (loc && loc.focus) loc.focus();
        return;
      }
      const input = document.getElementById('camera-desc');
      if (input && input.focus) input.focus();
    }, 0);
  },

  closeDescSheet() {
    const sheet = document.getElementById('camera-desc-sheet');
    if (sheet) sheet.hidden = true;
  },

  saveDraftMetaFromSheet() {
    const participants = this.readParticipantsSelection();
    const shotTimeInput = document.getElementById('camera-shot-time');
    const shotLocationInput = document.getElementById('camera-shot-location');
    const descEl = document.getElementById('camera-desc');

    this._participantsState = participants || null;
    if (shotTimeInput) this._shotTimeText = String(shotTimeInput.value || '').trim();
    if (shotLocationInput) this._shotLocationText = String(shotLocationInput.value || '').trim();
    if (descEl) this._draftDescText = String(descEl.value || '');
  },

  async renderParticipantsList() {
    const container = document.getElementById('camera-participants');
    if (!container) return;

    // 如果已经渲染过，这里简单清空重建（角色数量不会太多）
    container.innerHTML = '';

    // 先加上“我（自己）”
    container.innerHTML += `
      <label class="yd-camera-participant">
        <input type="checkbox" class="camera-participant-input" data-id="self">
        <span class="yd-camera-participant-label">我（自己）</span>
      </label>
    `;

    let characters = [];
    try {
      characters = await Storage.dbGetAll('characters');
    } catch (e) {
      console.error('读取角色列表失败:', e);
      characters = [];
    }

    // 使用 Character.normalizeCard 提取名称（如果可用）
    characters.forEach((ch) => {
      if (!ch) return;
      let name = '';
      if (typeof Character !== 'undefined' && Character.normalizeCard) {
        try {
          const norm = Character.normalizeCard(ch);
          name = norm.name || '';
        } catch (e) {
          name = '';
        }
      }
      if (!name) {
        name =
          (ch.data && typeof ch.data === 'object' && ch.data.name) ||
          ch.name ||
          '';
      }
      name = String(name || '').trim();
      if (!name) return;

      const safeName = name.replace(/"/g, '&quot;');
      container.innerHTML += `
        <label class="yd-camera-participant">
          <input type="checkbox" class="camera-participant-input" data-id="${ch.id}">
          <span class="yd-camera-participant-label">${safeName}</span>
        </label>
      `;
    });
  },

  readParticipantsSelection() {
    try {
      const inputs = document.querySelectorAll('.camera-participant-input');
      const ids = [];
      inputs.forEach((el) => {
        if (el.checked) {
          const id = el.getAttribute('data-id');
          if (id) ids.push(id);
        }
      });
      const hasSelf = ids.includes('self');
      const characterIds = ids.filter((id) => id !== 'self');
      if (!hasSelf && characterIds.length === 0) {
        return null;
      }
      return {
        self: hasSelf,
        characterIds
      };
    } catch (e) {
      console.error('读取出镜角色选择失败:', e);
      return null;
    }
  },

  async _getUniqueDescription(inputDesc, existingItems) {
    const used = new Set(
      (existingItems || [])
        .map(it => (it && typeof it.description === 'string' ? it.description.trim() : ''))
        .filter(Boolean)
    );

    let desc = String(inputDesc || '').trim();
    if (!desc) desc = '未命名照片';

    if (!used.has(desc)) return desc;

    // 冲突时自动追加短后缀，避免相册/聊天选择歧义
    for (let i = 2; i <= 99; i++) {
      const next = `${desc} (${i})`;
      if (!used.has(next)) return next;
    }

    // 仍冲突：加时间戳
    return `${desc} (${Date.now()})`;
  },

  async saveToAlbum() {
    if (!this._dataUrl) {
      alert('请先拍照');
      return;
    }

    const descEl = document.getElementById('camera-desc');
    const rawDesc = descEl ? descEl.value : '';

    try {
      const existing = await Storage.dbGetAll('album');
      const desc = await this._getUniqueDescription(rawDesc, existing);

      // 收集出镜角色选择
      const participants = this.readParticipantsSelection();

      const shotTimeInput = document.getElementById('camera-shot-time');
      const shotLocationInput = document.getElementById('camera-shot-location');

      // 把本次填写的时间/地点/出镜角色记在内存里，方便下次回显
      this._shotTimeText = shotTimeInput ? String(shotTimeInput.value || '').trim() : '';
      this._shotLocationText = shotLocationInput ? String(shotLocationInput.value || '').trim() : '';
      this._participantsState = participants || null;
      this._draftDescText = String(rawDesc || '');

      const item = {
        id: State.generateId(),
        data: this._dataUrl,
        name: 'camera.jpg',
        description: desc,
        shotTime: shotTimeInput ? String(shotTimeInput.value || '').trim() : undefined,
        shotLocation: shotLocationInput ? String(shotLocationInput.value || '').trim() : undefined,
        createdAt: Date.now(),
        participants
      };

      await Storage.dbAdd('album', item);

      // 刷新相册
      if (typeof Album !== 'undefined' && Album.loadAlbum) {
        await Album.loadAlbum();
      }

      // 清理 UI
      this._dataUrl = '';
      this._renderPreview('');
      if (descEl) descEl.value = '';
      if (shotTimeInput) shotTimeInput.value = '';
      if (shotLocationInput) shotLocationInput.value = '';
      const retakeBtn = document.getElementById('camera-retake');
      const saveBtn = document.getElementById('camera-save');
      if (retakeBtn) retakeBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
      this.closeDescSheet();

      // 跳转到相册查看
      State.switchPage('page-album');
    } catch (e) {
      console.error('保存到相册失败:', e);
      alert('保存失败');
    }
  }
};


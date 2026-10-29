// 相册管理
window.Album = {
  // 初始化
  init() {
    this._currentFilter = 'all';   // 'all' | 'sticker' | 'image'
    this._pendingUploadType = null; // 'sticker' | 'image'，点击上传类型后设置
    this._batchMode = false;
    this._batchSelectedIds = new Set();
    this._oneClickMode = false;
    this._oneClickTargets = [];
    this.setupEvents();
    this.loadAlbum();
    this._pickForChat = false;
    this._pickForSessionAvatar = false;
    this._pickForChatBackground = false;
    this._pickForDiaryBackground = false;
    this._pickForMomentImage = false;
    this._momentImagePickHandler = null;
    this._pickForMomentImageReturnPage = 'page-moments';
    /** loadAlbum 完成后滚动到该项（如从生图预览「已保存到相册」跳转） */
    this._pendingScrollToAlbumItemId = null;
  },

  // 获取项目类型（兼容旧数据，默认为 image）
  getItemType(item) {
    const t = item && item.type;
    if (t === 'sticker') return 'sticker';
    return 'image';
  },
  
  // 设置事件
  setupEvents() {
    // 返回按钮
    document.getElementById('album-back').addEventListener('click', () => {
      // 根据当前使用场景决定返回位置
      if (this._pickForChat) {
        // 从聊天页打开进行“发送图片/表情包”选择
        this._pickForChat = false;
        State.switchPage('page-chat');
      } else if (this._pickForSessionAvatar || this._pickForChatBackground) {
        // 从聊天设置打开进行头像/背景选择
        this._pickForSessionAvatar = false;
        this._pickForChatBackground = false;
        State.switchPage('page-chat-settings');
      } else if (this._pickForDiaryBackground) {
        this._pickForDiaryBackground = false;
        State.switchPage('page-ta-diary');
      } else if (this._pickForMomentImage) {
        this._pickForMomentImage = false;
        this._momentImagePickHandler = null;
        const rp = this._pickForMomentImageReturnPage || 'page-moments';
        this._pickForMomentImageReturnPage = 'page-moments';
        State.switchPage(rp);
      } else {
        // 其它情况保持原来的返回主屏逻辑
        State.backToHome();
      }
    });
    
    // 上传按钮：先弹出类型选择
    document.getElementById('album-upload').addEventListener('click', () => {
      this.showUploadTypePicker();
    });

    // 操作按钮：显示快捷操作菜单
    const actionBtn = document.getElementById('album-actions');
    if (actionBtn) {
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showActionMenu(actionBtn);
      });
    }
    
    // 文件选择
    document.getElementById('album-file').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).filter(Boolean);
      e.target.value = '';
      if (!files.length) return;
      const type = this._pendingUploadType || 'image';
      this._pendingUploadType = null;
      // 批量上传：逐张处理，避免描述去重/写入竞争
      await this.uploadImage(files, type);
    });

    // 相册 tabs
    const tabs = document.getElementById('album-tabs');
    if (tabs) {
      tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.yd-beautify-tab');
        if (!btn) return;
        const filter = btn.dataset.filter;
        if (!filter) return;
        this._currentFilter = filter;
        tabs.querySelectorAll('.yd-beautify-tab').forEach(b => b.classList.remove('yd-beautify-tab--active'));
        btn.classList.add('yd-beautify-tab--active');
        this.loadAlbum();
      });
    }
  },

  showActionMenu(anchorEl) {
    this.closeActionMenu();

    if (!anchorEl) return;
    const menu = document.createElement('div');
    menu.id = 'yd-album-action-menu';
    menu.className = 'yd-album-action-menu';
    menu.innerHTML = `
      <button type="button" class="yd-album-action-menu__item" data-action="batch-delete">批量删除</button>
      <button type="button" class="yd-album-action-menu__item" data-action="beautify-phone">一键美化小手机（内测版）</button>
    `;

    const rect = anchorEl.getBoundingClientRect();
    const top = rect.bottom + 8;
    const left = Math.max(8, rect.right - 190);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.yd-album-action-menu__item');
      if (!btn) return;
      const action = btn.dataset.action;
      this.closeActionMenu();
      if (action === 'batch-delete') {
        this.enterBatchDeleteMode();
      } else if (action === 'beautify-phone') {
        this.showOneClickTargetPicker();
      }
    });

    document.body.appendChild(menu);
    this._actionMenuEl = menu;

    this._onActionMenuOutsideClick = (evt) => {
      const target = evt.target;
      if (!menu.contains(target) && target !== anchorEl) {
        this.closeActionMenu();
      }
    };
    document.addEventListener('click', this._onActionMenuOutsideClick);
  },

  closeActionMenu() {
    if (this._actionMenuEl && this._actionMenuEl.remove) {
      this._actionMenuEl.remove();
    }
    this._actionMenuEl = null;
    if (this._onActionMenuOutsideClick) {
      document.removeEventListener('click', this._onActionMenuOutsideClick);
      this._onActionMenuOutsideClick = null;
    }
  },

  enterBatchDeleteMode() {
    this._batchMode = true;
    this._batchSelectedIds = new Set();
    this.loadAlbum();
  },

  exitBatchDeleteMode() {
    this._batchMode = false;
    this._batchSelectedIds = new Set();
    this.loadAlbum();
  },

  async deleteSelectedBatch() {
    const ids = Array.from(this._batchSelectedIds || []);
    if (!ids.length) {
      alert('请先勾选要删除的照片');
      return;
    }
    if (!confirm(`确定删除已选中的 ${ids.length} 张照片吗？删除后无法恢复。`)) return;
    try {
      for (const id of ids) {
        await Storage.dbDelete('album', id);
      }
      this._batchSelectedIds = new Set();
      await this.loadAlbum();
      alert('已删除选中照片');
    } catch (e) {
      console.error('批量删除失败:', e);
      alert('批量删除失败，请稍后重试');
    }
  },

  showOneClickTargetPicker() {
    const existing = document.getElementById('yd-album-oneclick-picker');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'yd-album-oneclick-picker';
    overlay.className = 'yd-album-upload-picker';
    overlay.innerHTML = `
      <div class="yd-album-upload-picker__inner" style="min-width:260px;">
        <div class="yd-album-upload-picker__title">选择一键美化范围</div>
        <div class="yd-album-oneclick-targets">
          <label class="yd-album-oneclick-target"><input type="checkbox" data-target="icon" checked>图标</label>
          <label class="yd-album-oneclick-target"><input type="checkbox" data-target="wallpaper" checked>壁纸</label>
          <label class="yd-album-oneclick-target"><input type="checkbox" data-target="widget" checked>组件</label>
        </div>
        <div class="yd-album-link-import__actions" style="margin-top:14px;">
          <button type="button" class="yd-album-btn yd-album-btn--secondary" id="yd-album-oneclick-cancel">取消</button>
          <button type="button" class="yd-album-btn yd-album-btn--primary" id="yd-album-oneclick-next">下一步</button>
        </div>
      </div>
    `;
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    const cancelBtn = overlay.querySelector('#yd-album-oneclick-cancel');
    const nextBtn = overlay.querySelector('#yd-album-oneclick-next');
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const checked = Array.from(overlay.querySelectorAll('input[data-target]:checked'))
          .map((it) => it.getAttribute('data-target'))
          .filter(Boolean);
        if (!checked.length) {
          alert('请至少选择一个美化目标');
          return;
        }
        close();
        this.startOneClickPhotoPick(checked);
      });
    }
    document.body.appendChild(overlay);
  },

  startOneClickPhotoPick(targets) {
    this._oneClickTargets = Array.isArray(targets) ? targets.slice() : [];
    this._oneClickMode = true;
    this._batchMode = false;
    this._batchSelectedIds = new Set();
    this.loadAlbum();
    alert('请勾选要用于一键美化的照片，可多选。');
  },

  exitOneClickMode() {
    this._oneClickMode = false;
    this._oneClickTargets = [];
    this._batchSelectedIds = new Set();
    this.loadAlbum();
  },

  _pickRandomFrom(items) {
    if (!Array.isArray(items) || !items.length) return null;
    const idx = Math.floor(Math.random() * items.length);
    return items[idx] || null;
  },

  async _applyOneClickToIcons(selectedItems) {
    const allIcons = Array.isArray(State.icons) ? State.icons : (CONFIG.DEFAULT_ICONS || []);
    const ids = Array.from(new Set((allIcons || []).map((it) => it && it.id).filter(Boolean)));
    const styles = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
    ids.forEach((id) => {
      const pick = this._pickRandomFrom(selectedItems);
      if (!pick) return;
      const next = styles[id] && typeof styles[id] === 'object' ? { ...styles[id] } : {};
      next.imageData = pick.data || '';
      styles[id] = next;
    });
    Storage.set(CONFIG.STORAGE_KEYS.ICON_STYLES, styles);
  },

  async _applyOneClickToWallpaper(selectedItems) {
    const pick = this._pickRandomFrom(selectedItems);
    if (!pick) return;
    Storage.set(CONFIG.STORAGE_KEYS.WALLPAPER, { albumId: pick.id });
  },

  async _applyOneClickToWidgets(selectedItems) {
    const pick1 = this._pickRandomFrom(selectedItems);
    const pick2 = this._pickRandomFrom(selectedItems);
    const pick3 = this._pickRandomFrom(selectedItems);
    const pick4 = this._pickRandomFrom(selectedItems);
    const pick5 = this._pickRandomFrom(selectedItems);
    const pick6 = this._pickRandomFrom(selectedItems);

    const noteStyle = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_NOTE_STYLE) || {};
    noteStyle.image1 = (pick1 && pick1.data) || '';
    noteStyle.image2 = (pick2 && pick2.data) || '';
    noteStyle.image1AlbumId = (pick1 && pick1.id) || '';
    noteStyle.image2AlbumId = (pick2 && pick2.id) || '';
    Storage.set(CONFIG.STORAGE_KEYS.WIDGET_NOTE_STYLE, noteStyle);

    const photoCardStyle = Storage.get(CONFIG.STORAGE_KEYS.PHOTO_CARD_STYLE) || {};
    photoCardStyle.image = (pick3 && pick3.data) || '';
    Storage.set(CONFIG.STORAGE_KEYS.PHOTO_CARD_STYLE, photoCardStyle);

    const photoCircleStyle = Storage.get(CONFIG.STORAGE_KEYS.PHOTO_CIRCLE_STYLE) || {};
    photoCircleStyle.image = (pick4 && pick4.data) || '';
    Storage.set(CONFIG.STORAGE_KEYS.PHOTO_CIRCLE_STYLE, photoCircleStyle);

    const dateCardStyle = Storage.get(CONFIG.STORAGE_KEYS.DATE_CARD_STYLE) || {};
    dateCardStyle.bgImage = (pick5 && pick5.data) || '';
    Storage.set(CONFIG.STORAGE_KEYS.DATE_CARD_STYLE, dateCardStyle);

    const timeDateStyle = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE) || {};
    timeDateStyle.bgImage = (pick6 && pick6.data) || '';
    timeDateStyle.bgImageAlbumId = (pick6 && pick6.id) || '';
    Storage.set(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE, timeDateStyle);

    const playerStyle = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE) || {};
    const playerPick = this._pickRandomFrom(selectedItems);
    playerStyle.presetImage = (playerPick && playerPick.data) || '';
    playerStyle.presetImageAlbumId = (playerPick && playerPick.id) || '';
    Storage.set(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE, playerStyle);

    try {
      const all = await Storage.dbGetAll('widgetResources');
      const keep = (all || []).filter((r) => !(r && r.widgetId === 'widget-profile-card' && r.kind === 'image'));
      await Storage.dbClear('widgetResources');
      for (const one of keep) {
        await Storage.dbAdd('widgetResources', one);
      }
      const bgPick = this._pickRandomFrom(selectedItems);
      const avatarPick = this._pickRandomFrom(selectedItems);
      if (bgPick && bgPick.data) {
        await Storage.dbAdd('widgetResources', { widgetId: 'widget-profile-card', kind: 'image', order: 0, albumId: bgPick.id, imageData: bgPick.data });
      }
      if (avatarPick && avatarPick.data) {
        await Storage.dbAdd('widgetResources', { widgetId: 'widget-profile-card', kind: 'image', order: 1, albumId: avatarPick.id, imageData: avatarPick.data });
      }
    } catch (e) {
      console.error('更新头像卡片组件图片失败:', e);
    }
  },

  async confirmOneClickBeautify() {
    const ids = Array.from(this._batchSelectedIds || []);
    if (!ids.length) {
      alert('请先勾选要用于美化的照片');
      return;
    }
    if (!this._oneClickTargets || !this._oneClickTargets.length) {
      alert('未选择一键美化目标');
      return;
    }
    if (!confirm(`将使用已选 ${ids.length} 张照片进行一键美化，是否继续？`)) return;
    try {
      const allItems = await Storage.dbGetAll('album');
      const selectedItems = (allItems || []).filter((it) => it && ids.includes(it.id) && it.data);
      if (!selectedItems.length) {
        alert('未找到可用照片，请重试');
        return;
      }
      const targets = new Set(this._oneClickTargets);
      if (targets.has('icon')) await this._applyOneClickToIcons(selectedItems);
      if (targets.has('wallpaper')) await this._applyOneClickToWallpaper(selectedItems);
      if (targets.has('widget')) await this._applyOneClickToWidgets(selectedItems);

      const dt = new Date();
      const name = `一键美化_${dt.getMonth() + 1}-${dt.getDate()}_${dt.getHours()}-${dt.getMinutes()}`;
      if (typeof Settings !== 'undefined' && Settings.saveBeautifyPreset) {
        await Settings.saveBeautifyPreset(name, null, true);
        if (Settings.loadBeautifyPresets) Settings.loadBeautifyPresets();
      }

      if (typeof Homescreen !== 'undefined') {
        if (Homescreen.loadAndSyncWidgets) await Homescreen.loadAndSyncWidgets();
        if (Homescreen.renderHomescreen) Homescreen.renderHomescreen();
        if (Homescreen.renderDock) Homescreen.renderDock();
        if (Homescreen.loadWallpaper) Homescreen.loadWallpaper();
      }

      this._oneClickMode = false;
      this._oneClickTargets = [];
      this._batchSelectedIds = new Set();
      await this.loadAlbum();
      alert('一键美化完成，已新增并应用预设');
    } catch (e) {
      console.error('一键美化失败:', e);
      alert('一键美化失败，请稍后重试');
    }
  },

  // 上传类型选择弹窗（表情包 / 图片）
  showUploadTypePicker() {
    const existing = document.getElementById('yd-album-upload-picker');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-album-upload-picker';
    overlay.className = 'yd-album-upload-picker';
    overlay.innerHTML = `
      <div class="yd-album-upload-picker__inner">
        <div class="yd-album-upload-picker__title">选择上传类型</div>
        <div class="yd-album-upload-picker__btns">
          <button type="button" class="yd-beautify-tab yd-album-upload-type-btn" data-mode="file" data-type="sticker">表情包（选择文件）</button>
          <button type="button" class="yd-beautify-tab yd-album-upload-type-btn" data-mode="links" data-type="sticker">表情包（粘贴链接）</button>
          <button type="button" class="yd-beautify-tab yd-album-upload-type-btn" data-mode="file" data-type="image">图片（选择文件）</button>
          <button type="button" class="yd-beautify-tab yd-album-upload-type-btn" data-mode="links" data-type="image">图片（粘贴链接）</button>
        </div>
      </div>
    `;

    const close = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelectorAll('.yd-album-upload-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const mode = btn.dataset.mode || 'file';
        this._pendingUploadType = type;
        close();

        if (mode === 'links') {
          this.showLinkImportModal(type);
        } else {
          document.getElementById('album-file').click();
        }
      });
    });

    document.body.appendChild(overlay);
  },
  
  // 粘贴链接上传（批量下载后写入 IndexedDB album 表）
  showLinkImportModal(type) {
    const saveType = (type === 'sticker') ? 'sticker' : 'image';
    const existing = document.getElementById('yd-album-link-import');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-album-link-import';
    overlay.className = 'yd-album-upload-picker';
    overlay.innerHTML = `
      <div class="yd-album-upload-picker__inner" style="min-width:260px;max-width:720px;width:100%;">
        <div class="yd-album-upload-picker__title" style="text-align:left;">
          ${saveType === 'sticker' ? '批量导入表情包' : '批量导入图片'}
        </div>

        <div style="font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:10px;">
          将多个图片链接粘贴到这里：支持“换行 / 空格 / 逗号 / Tab”分隔。
        </div>

        <textarea id="yd-album-link-import-textarea" class="yd-album-link-import__textarea" placeholder="例如：&#10;https://xxx.png&#10;https://xxx2.png&#10;"></textarea>

        <div class="yd-album-link-import__actions">
          <button type="button" class="yd-album-btn yd-album-btn--secondary" id="yd-album-link-import-cancel">取消</button>
          <button type="button" class="yd-album-btn yd-album-btn--primary" id="yd-album-link-import-start">开始导入</button>
        </div>

        <div id="yd-album-link-import-status" class="yd-album-link-import__status" aria-live="polite"></div>
      </div>
    `;

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#yd-album-link-import-textarea');
    const cancelBtn = overlay.querySelector('#yd-album-link-import-cancel');
    const startBtn = overlay.querySelector('#yd-album-link-import-start');
    const statusEl = overlay.querySelector('#yd-album-link-import-status');

    setTimeout(() => {
      try {
        textarea && textarea.focus();
      } catch (e) {}
    }, 0);

    if (cancelBtn) cancelBtn.addEventListener('click', close);

    const parseUrls = (raw) => {
      const s = String(raw || '');
      const matches = s.match(/https?:\/\/[^\s,，]+/g) || [];
      // 去掉末尾可能携带的标点（来自复制文本）
      return matches
        .map((u) => String(u).trim().replace(/[)\]]+$/g, '').replace(/[.。]+$/g, ''))
        .filter(Boolean);
    };

    const downloadAsDataUrl = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers && res.headers.get ? res.headers.get('content-type') : '';
      if (ct && !ct.startsWith('image/')) {
        // 仍然尝试读 blob（有些资源没有准确 content-type）
      }
      const blob = await res.blob();
      if (blob && blob.type && !blob.type.startsWith('image/')) {
        throw new Error(`非图片类型：${blob.type}`);
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(blob);
      });
      return dataUrl;
    };

    if (!startBtn) return;
    startBtn.addEventListener('click', async () => {
      if (!textarea) return;
      const raw = textarea.value || '';
      const urls = Array.from(new Set(parseUrls(raw)));
      if (!urls.length) {
        alert('请先粘贴至少一个图片链接');
        return;
      }

      // 防止误粘贴导致卡死：给一个上限
      const MAX_LINKS = 40;
      const limited = urls.slice(0, MAX_LINKS);
      if (urls.length > MAX_LINKS) {
        alert(`检测到 ${urls.length} 个链接，已限制为前 ${MAX_LINKS} 个进行导入。`);
      }

      try {
        statusEl && (statusEl.textContent = `正在导入：0/${limited.length}`);

        const existing = await Storage.dbGetAll('album');
        const usedDesc = new Set(
          (existing || [])
            .map(it => (it && typeof it.description === 'string' ? it.description.trim() : ''))
            .filter(Boolean)
        );

        const genRandomDesc = () => {
          const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
          return `照片_${rand.slice(0, 12)}`;
        };

        let imported = 0;
        let failed = 0;
        let linkOnly = 0;

        for (let i = 0; i < limited.length; i++) {
          const url = limited[i];
          if (statusEl) statusEl.textContent = `正在导入：${i + 1}/${limited.length}`;

          try {
            const dataUrl = await downloadAsDataUrl(url);
            if (!dataUrl) throw new Error('empty dataUrl');

            let desc = genRandomDesc();
            let guard = 0;
            while (usedDesc.has(desc) && guard < 10) {
              desc = genRandomDesc();
              guard += 1;
            }
            usedDesc.add(desc);

            const name = (() => {
              try {
                const u = new URL(url);
                const last = u.pathname.split('/').filter(Boolean).pop();
                return decodeURIComponent(last || '').trim() || '导入图片';
              } catch (e) {
                return '导入图片';
              }
            })();

            await Storage.dbAdd('album', {
              id: State.generateId(),
              data: dataUrl,
              name,
              description: desc,
              type: saveType,
              createdAt: Date.now()
            });
            imported++;
          } catch (e) {
            // 只要“下载为 dataURL”失败，就统一退化为只保存原始 URL。
            // 常见原因：CORS、防盗链(HTTP 403/401)、临时网络错误等。
            try {
              const name = (() => {
                try {
                  const u = new URL(url);
                  const last = u.pathname.split('/').filter(Boolean).pop();
                  return decodeURIComponent(last || '').trim() || '导入图片';
                } catch (err) {
                  return '导入图片';
                }
              })();

              const desc = (() => {
                let d = genRandomDesc();
                let guard = 0;
                while (usedDesc.has(d) && guard < 10) {
                  d = genRandomDesc();
                  guard += 1;
                }
                usedDesc.add(d);
                return d;
              })();

              await Storage.dbAdd('album', {
                id: State.generateId(),
                data: url,
                name,
                description: desc,
                type: saveType,
                createdAt: Date.now()
              });
              linkOnly++;
              continue;
            } catch (err) {
              console.error('[album] 保存远程链接失败:', url, err);
              console.error('[album] 导入链接失败:', url, e);
              failed++;
            }
          }
        }

        await this.loadAlbum();

        if (statusEl) {
          statusEl.textContent = `导入完成：离线成功 ${imported}，仅保存链接 ${linkOnly}，失败 ${failed}`;
        }
        alert(`导入完成：离线成功 ${imported}，仅保存链接 ${linkOnly}，失败 ${failed}`);
        close();
      } catch (e) {
        console.error('[album] 批量导入失败:', e);
        alert('批量导入失败，请重试');
      }
    });
  },

  // 上传图片（type: 'sticker' | 'image'，缺省为 'image'）
  // 支持批量：file 可以是单个 File，也可以是 File[]
  async uploadImage(file, type) {
    const files = Array.isArray(file) ? file.filter(Boolean) : (file ? [file] : []);
    if (!files.length) return;

    const saveType = (type === 'sticker') ? 'sticker' : 'image';

    // 批量上传（表情包/图片）：不再提示逐张输入描述，直接随机生成描述并写入。
    if (files.length > 1 && (saveType === 'sticker' || saveType === 'image')) {
      const existing = await Storage.dbGetAll('album');
      const usedDesc = new Set(
        (existing || [])
          .map(it => (it && typeof it.description === 'string' ? it.description.trim() : ''))
          .filter(Boolean)
      );

      const genRandomDesc = () => {
        // 生成类似：照片_hdfiuqwhduiqh
        const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        return `照片_${rand.slice(0, 12)}`;
      };

      try {
        for (const one of files) {
          if (!one || !one.type || !one.type.match(/^image\/(png|jpeg|webp)$/)) {
            // 批量中发现不支持格式：跳过该项
            continue;
          }

          let desc = genRandomDesc();
          // 理论上几乎不会撞，但仍做一次保底去重
          let guard = 0;
          while (usedDesc.has(desc) && guard < 10) {
            desc = genRandomDesc();
            guard += 1;
          }
          usedDesc.add(desc);

          const imageData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target && e.target.result ? e.target.result : null);
            reader.onerror = () => reject(new Error('读取图片失败'));
            reader.readAsDataURL(one);
          });
          if (!imageData) continue;

          await Storage.dbAdd('album', {
            id: State.generateId(),
            data: imageData,
            name: one.name,
            description: desc,
            type: saveType,
            createdAt: Date.now()
          });
        }

        await this.loadAlbum();
        alert('批量上传成功');
      } catch (error) {
        console.error('批量上传失败:', error);
        alert('批量上传失败');
      }
      return;
    }

    // 非批量或非表情包：保持原逻辑（逐张输入描述、去重、允许取消）
    const one = files[0];
    
    
    // 检查文件类型
    if (!one.type.match(/^image\/(png|jpeg|webp)$/)) {
      alert('只支持PNG、JPG、WebP格式');
      return;
    }
    
    try {
      // 先获取现有描述列表，确保新描述不重复
      const existing = await Storage.dbGetAll('album');
      const usedDesc = new Set(
        (existing || [])
          .map(it => (it && typeof it.description === 'string' ? it.description.trim() : ''))
          .filter(Boolean)
      );

      // 交互式输入描述，不能为空且不能重复
      let desc = '';
      const defaultDesc = one.name ? one.name.replace(/\.[^.]+$/, '') : '';
      // 最多给几次机会，避免死循环
      for (let i = 0; i < 5; i++) {
        // eslint-disable-next-line no-alert
        desc = prompt('请输入这张照片的描述（用于聊天发送图片，不能与其他照片重复）：', defaultDesc) || '';
        desc = desc.trim();
        if (!desc) {
          const giveUp = confirm('未填写描述将取消本次上传，是否确定？');
          if (giveUp) return;
          // 否则继续循环
          continue;
        }
        if (usedDesc.has(desc)) {
          alert('已有其他照片使用了相同的描述，请换一个方便区分的描述。');
          continue;
        }
        break;
      }
      if (!desc) {
        // 多次尝试后仍未得到有效描述，放弃上传
        return;
      }

      // 读取为Base64
      await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const imageData = e.target.result;

          // 保存到IndexedDB（type: 'sticker' | 'image'）
          const item = {
            id: State.generateId(),
            data: imageData,
            name: one.name,
            description: desc,
            type: saveType,
            createdAt: Date.now()
          };

          try {
            await Storage.dbAdd('album', item);
            await this.loadAlbum();
            alert('上传成功');
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(one);
      });
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败');
    }
  },
  
  // 加载相册（按当前 tab 过滤）
  async loadAlbum() {
    const allItems = await Storage.dbGetAll('album');
    const filter = this._currentFilter || 'all';
    const items = (allItems || []).filter(it => {
      if (!it) return false;
      const t = this.getItemType(it);
      if (filter === 'all') return true;
      if (filter === 'sticker') return t === 'sticker';
      if (filter === 'image') return t === 'image';
      return true;
    });
    const grid = document.getElementById('album-grid');
    grid.innerHTML = '';
    const batchBarOld = document.getElementById('yd-album-batch-bar');
    if (batchBarOld) batchBarOld.remove();
    
    if (items.length === 0) {
      this._pendingScrollToAlbumItemId = null;
      const emptyMsg = filter === 'all' ? '暂无图片' : (filter === 'sticker' ? '暂无表情包' : '暂无图片');
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#8E8E93;padding:40px 0;font-size:13px;">${emptyMsg}</div>`;
      if (this._batchMode || this._oneClickMode) {
        const content = document.querySelector('#page-album .yd-album-content');
        if (content) {
          const bar = document.createElement('div');
          bar.id = 'yd-album-batch-bar';
          bar.className = 'yd-album-batch-bar';
          bar.innerHTML = this._oneClickMode
            ? `
              <div class="yd-album-batch-bar__text">一键美化选图（已选择 0 张）</div>
              <button type="button" class="yd-album-btn yd-album-btn--secondary" id="album-batch-cancel">取消</button>
              <button type="button" class="yd-album-btn yd-album-btn--primary" id="album-batch-confirm">确认美化</button>
            `
            : `
              <div class="yd-album-batch-bar__text">批量删除模式（已选择 0 张）</div>
              <button type="button" class="yd-album-btn yd-album-btn--secondary" id="album-batch-cancel">取消</button>
              <button type="button" class="yd-album-btn yd-album-btn--danger" id="album-batch-delete">删除</button>
            `;
          content.appendChild(bar);
          const cancelBtn = bar.querySelector('#album-batch-cancel');
          const deleteBtn = bar.querySelector('#album-batch-delete');
          const confirmBtn = bar.querySelector('#album-batch-confirm');
          if (cancelBtn) cancelBtn.addEventListener('click', () => (this._oneClickMode ? this.exitOneClickMode() : this.exitBatchDeleteMode()));
          if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSelectedBatch());
          if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmOneClickBeautify());
        }
      }
      return;
    }
    
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(item => {
      const el = document.createElement('div');
      el.setAttribute('data-album-item-id', String(item.id || ''));
      const selecting = this._batchMode || this._oneClickMode;
      const selected = this._batchSelectedIds && this._batchSelectedIds.has(item.id);
      el.className = `yd-album-item${selecting ? ' yd-album-item--batch' : ''}${selected ? ' yd-album-item--selected' : ''}`;
      const displayName = (item.description || item.name || '').trim();
      const isSticker = this.getItemType(item) === 'sticker';

      el.innerHTML = `
        <div class="yd-album-item__image" style="background-image:url(${item.data})"></div>
        ${selecting ? `<div class="yd-album-item__check" aria-label="勾选照片">${selected ? '✓' : ''}</div>` : ''}
        <div class="yd-album-item__name">
          <span class="yd-album-item__name-text">${this.escapeHtml(displayName || '未命名照片')}</span>
          ${isSticker ? '<span class="yd-album-badge" aria-label="表情包标签">表情</span>' : ''}
        </div>
      `;

      // 点击卡片：要么用于聊天发送，要么打开预览弹窗
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._batchMode || this._oneClickMode) {
          if (!this._batchSelectedIds) this._batchSelectedIds = new Set();
          if (this._batchSelectedIds.has(item.id)) {
            this._batchSelectedIds.delete(item.id);
          } else {
            this._batchSelectedIds.add(item.id);
          }
          this.loadAlbum();
          return;
        }
        // 优先顺序：朋友圈配图选图 > 聊天图片消息 > …
        if (this._pickForMomentImage && typeof this._momentImagePickHandler === 'function') {
          const fn = this._momentImagePickHandler;
          const rp = this._pickForMomentImageReturnPage || 'page-moments';
          this._pickForMomentImage = false;
          this._momentImagePickHandler = null;
          this._pickForMomentImageReturnPage = 'page-moments';
          void (async () => {
            try {
              await Promise.resolve(fn(item));
            } catch (err) {
              console.error('[album] moment image pick:', err);
              alert(err && err.message ? err.message : '选择失败');
            }
            State.switchPage(rp);
          })();
        } else if (this._pickForChat && typeof Chat !== 'undefined' && Chat.insertImageMessageFromAlbum) {
          void (async () => {
            try {
              const r = await Chat.insertImageMessageFromAlbum(item);
              if (r !== 'cancelled') {
                this._pickForChat = false;
              }
            } catch (err) {
              console.error('[album] insertImageMessageFromAlbum:', err);
              this._pickForChat = false;
            }
          })();
        } else if (this._pickForDiaryBackground) {
          // 查日记背景：只允许图片选择（包括来自 sticker 的数据也会照样写入，渲染端以 background-image 处理）
          try {
            Storage.set(CONFIG.STORAGE_KEYS.TA_DIARY_BACKGROUND, { albumId: item.id });
          } catch (e) {}
          this._pickForDiaryBackground = false;
          State.switchPage('page-ta-diary');
        } else if (this._pickForSessionAvatar && typeof Chat !== 'undefined' && Chat.setSessionAvatarFromAlbum) {
          Chat.setSessionAvatarFromAlbum(item);
          this._pickForSessionAvatar = false;
        } else if (this._pickForChatBackground && typeof Chat !== 'undefined' && Chat.setSessionChatBackgroundFromAlbumItem) {
          Chat.setSessionChatBackgroundFromAlbumItem(item);
          this._pickForChatBackground = false;
        } else {
          this.openViewer(item);
        }
      });

      // 列表名称可编辑：点击仅修改 description，不触发卡片点击行为
      const nameTextEl = el.querySelector('.yd-album-item__name-text');
      if (nameTextEl) {
        nameTextEl.style.cursor = 'text';
        nameTextEl.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            const all = await Storage.dbGetAll('album');
            const nextRaw = prompt('请输入新的图片/表情包描述：', displayName) || '';
            const nextDesc = String(nextRaw).trim();
            if (!nextDesc) return;
            const uniqueDesc = await this._getUniqueDescription(nextDesc, all, item.id);
            item.description = uniqueDesc;
            await Storage.dbPut('album', item);
            await this.loadAlbum();
          } catch (err) {
            console.error('修改名称失败:', err);
            alert('修改失败');
          }
        });
      }

      grid.appendChild(el);
    });

    if (this._batchMode || this._oneClickMode) {
      const content = document.querySelector('#page-album .yd-album-content');
      if (content) {
        const selectedCount = this._batchSelectedIds ? this._batchSelectedIds.size : 0;
        const bar = document.createElement('div');
        bar.id = 'yd-album-batch-bar';
        bar.className = 'yd-album-batch-bar';
        bar.innerHTML = this._oneClickMode
          ? `
            <div class="yd-album-batch-bar__text">一键美化选图（已选择 ${selectedCount} 张）</div>
            <button type="button" class="yd-album-btn yd-album-btn--secondary" id="album-batch-cancel">取消</button>
            <button type="button" class="yd-album-btn yd-album-btn--primary" id="album-batch-confirm">确认美化</button>
          `
          : `
            <div class="yd-album-batch-bar__text">批量删除模式（已选择 ${selectedCount} 张）</div>
            <button type="button" class="yd-album-btn yd-album-btn--secondary" id="album-batch-cancel">取消</button>
            <button type="button" class="yd-album-btn yd-album-btn--danger" id="album-batch-delete">删除</button>
          `;
        content.appendChild(bar);
        const cancelBtn = bar.querySelector('#album-batch-cancel');
        const deleteBtn = bar.querySelector('#album-batch-delete');
        const confirmBtn = bar.querySelector('#album-batch-confirm');
        if (cancelBtn) cancelBtn.addEventListener('click', () => (this._oneClickMode ? this.exitOneClickMode() : this.exitBatchDeleteMode()));
        if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSelectedBatch());
        if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmOneClickBeautify());
      }
    }

    const revealId = this._pendingScrollToAlbumItemId;
    this._pendingScrollToAlbumItemId = null;
    if (revealId && grid) {
      requestAnimationFrame(() => {
        try {
          const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(revealId)) : String(revealId);
          const target = grid.querySelector(`[data-album-item-id="${esc}"]`);
          if (target) {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            target.classList.add('yd-album-item--reveal-flash');
            setTimeout(() => target.classList.remove('yd-album-item--reveal-flash'), 1400);
          }
        } catch (e) {}
      });
    }
  },

  /** 下次 loadAlbum 渲染后滚动并高亮该图（需在 switchPage 到相册前调用） */
  scheduleScrollToAlbumItem(albumItemId) {
    const id = String(albumItemId || '').trim();
    this._pendingScrollToAlbumItemId = id || null;
  },

  // 从聊天页面打开相册进行“发送图片消息”选择
  openForImageMessage() {
    this._pickForMomentImage = false;
    this._momentImagePickHandler = null;
    this._pickForChat = true;
    this._pickForSessionAvatar = false;
    this._pickForChatBackground = false;
    this._currentFilter = 'all';
    this._syncTabsUI();
    State.switchPage('page-album');
  },

  // 从聊天页面打开相册进行“发送表情包”选择
  openForStickerMessage() {
    this._pickForMomentImage = false;
    this._momentImagePickHandler = null;
    this._pickForChat = true;
    this._pickForSessionAvatar = false;
    this._pickForChatBackground = false;
    this._currentFilter = 'sticker';
    this._syncTabsUI();
    State.switchPage('page-album');
  },

  _syncTabsUI() {
    const tabs = document.getElementById('album-tabs');
    if (!tabs) return;
    const current = this._currentFilter || 'all';
    tabs.querySelectorAll('.yd-beautify-tab').forEach(b => b.classList.remove('yd-beautify-tab--active'));
    const btn = tabs.querySelector(`.yd-beautify-tab[data-filter="${current}"]`);
    if (btn) btn.classList.add('yd-beautify-tab--active');
  },

  // 从聊天设置打开相册进行“选择会话头像”
  openForSessionAvatar() {
    this._pickForMomentImage = false;
    this._momentImagePickHandler = null;
    this._pickForChat = false;
    this._pickForSessionAvatar = true;
    this._pickForChatBackground = false;
    State.switchPage('page-album');
  },

  // 从聊天设置打开相册进行“选择聊天背景”
  openForChatBackground() {
    this._pickForMomentImage = false;
    this._momentImagePickHandler = null;
    this._pickForChat = false;
    this._pickForSessionAvatar = false;
    this._pickForChatBackground = true;
    State.switchPage('page-album');
  },

  // 从查日记打开相册进行“日记背景”选择
  openForDiaryBackground() {
    this._pickForMomentImage = false;
    this._momentImagePickHandler = null;
    this._pickForChat = false;
    this._pickForSessionAvatar = false;
    this._pickForChatBackground = false;
    this._pickForDiaryBackground = true;
    this._currentFilter = 'image';
    this._syncTabsUI();
    State.switchPage('page-album');
  },

  /**
   * 从朋友圈配图预览「更换图片」进入相册，点选一张后回调（item.data 为 data URL）
   * @param {(item: object) => void | Promise<void>} handler
   * @param {string} [returnPage]
   */
  openForMomentImagePick(handler, returnPage = 'page-moments') {
    this._pickForMomentImage = true;
    this._momentImagePickHandler = typeof handler === 'function' ? handler : null;
    this._pickForMomentImageReturnPage = returnPage || 'page-moments';
    this._pickForChat = false;
    this._pickForSessionAvatar = false;
    this._pickForChatBackground = false;
    this._pickForDiaryBackground = false;
    this._currentFilter = 'all';
    this._syncTabsUI();
    State.switchPage('page-album');
  },

  // 简单转义（与 Chat.escapeHtml 风格保持一致）
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  async _getUniqueDescription(inputDesc, existingItems, currentId) {
    const used = new Set(
      (existingItems || [])
        .filter(it => it && it.id !== currentId)
        .map(it => (it && typeof it.description === 'string' ? it.description.trim() : ''))
        .filter(Boolean)
    );

    let desc = String(inputDesc || '').trim();
    if (!desc) desc = '未命名照片';

    if (!used.has(desc)) return desc;

    for (let i = 2; i <= 99; i++) {
      const next = `${desc} (${i})`;
      if (!used.has(next)) return next;
    }

    return `${desc} (${Date.now()})`;
  },

  async _buildParticipantsText(participants) {
    if (!participants || (participants.self !== true && (!Array.isArray(participants.characterIds) || participants.characterIds.length === 0))) {
      return '';
    }

    const names = [];
    if (participants.self) names.push('我');

    const ids = Array.isArray(participants.characterIds) ? participants.characterIds : [];
    if (ids.length) {
      let characters = [];
      try {
        characters = await Storage.dbGetAll('characters');
      } catch (e) {
        console.error('读取角色列表失败:', e);
        characters = [];
      }

      const map = new Map();
      (characters || []).forEach((ch) => {
        if (!ch || !ch.id) return;
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
          name = (ch.data && typeof ch.data === 'object' && ch.data.name) || ch.name || '';
        }
        name = String(name || '').trim();
        if (!name) return;
        map.set(String(ch.id), name);
      });

      ids.forEach((id) => {
        const n = map.get(String(id));
        if (n) names.push(n);
      });
    }

    return names.join('、');
  },

  async _renderAlbumMetaIntoModal(modal, item) {
    if (!modal || !item) return;
    const metaWrap = modal.querySelector('#yd-album-meta');
    if (!metaWrap) return;

    const shotTime = String(item.shotTime || '').trim();
    const shotLocation = String(item.shotLocation || '').trim();
    const desc = String(item.description || '').trim();
    const participantsText = await this._buildParticipantsText(item.participants);

    // 只有相机类照片（带出镜/时间/地点任一字段）才显示“更多信息”和编辑按钮
    // 普通相片仅展示标题（description）即可，不展示下面的描述区。
    const hasCameraMeta =
      !!participantsText ||
      !!shotTime ||
      !!shotLocation ||
      (item && Object.prototype.hasOwnProperty.call(item, 'participants')) ||
      (item && Object.prototype.hasOwnProperty.call(item, 'shotTime')) ||
      (item && Object.prototype.hasOwnProperty.call(item, 'shotLocation'));

    if (!hasCameraMeta) {
      metaWrap.innerHTML = '';
      return;
    }

    const rows = [];
    if (participantsText) rows.push({ k: '出镜角色', v: participantsText });
    if (shotTime) rows.push({ k: '拍摄时间', v: shotTime });
    if (shotLocation) rows.push({ k: '拍摄地点', v: shotLocation });
    if (desc) rows.push({ k: '描述', v: desc });

    if (rows.length === 0) {
      metaWrap.innerHTML = '<div class="yd-album-meta__empty">暂无照片信息</div>';
      return;
    }

    metaWrap.innerHTML = rows.map(r => `
      <div class="yd-album-meta__row">
        <div class="yd-album-meta__k">${this.escapeHtml(r.k)}</div>
        <div class="yd-album-meta__v">${this.escapeHtml(r.v)}</div>
      </div>
    `).join('') + (hasCameraMeta ? `
      <div class="yd-album-meta__actions">
        <button type="button" class="yd-album-btn yd-album-btn--meta" id="yd-album-meta-edit">编辑照片信息</button>
      </div>
    ` : '');
  },

  async _renderParticipantsPicker(container, participantsState) {
    if (!container) return;
    container.innerHTML = '';

    const addOne = (id, label, checked) => {
      const safeLabel = String(label || '').replace(/"/g, '&quot;');
      container.innerHTML += `
        <label class="yd-album-participant">
          <input type="checkbox" class="album-participant-input" data-id="${id}" ${checked ? 'checked' : ''}>
          <span class="yd-album-participant-label">${safeLabel}</span>
        </label>
      `;
    };

    addOne('self', '我（自己）', !!(participantsState && participantsState.self));

    let characters = [];
    try {
      characters = await Storage.dbGetAll('characters');
    } catch (e) {
      console.error('读取角色列表失败:', e);
      characters = [];
    }

    const selected = participantsState && Array.isArray(participantsState.characterIds) ? participantsState.characterIds : [];

    (characters || []).forEach((ch) => {
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
        name = (ch.data && typeof ch.data === 'object' && ch.data.name) || ch.name || '';
      }
      name = String(name || '').trim();
      if (!name) return;
      addOne(ch.id, name, selected.includes(ch.id));
    });
  },

  _readParticipantsFromPicker(scopeEl) {
    try {
      const inputs = scopeEl ? scopeEl.querySelectorAll('.album-participant-input') : [];
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
      return { self: hasSelf, characterIds };
    } catch (e) {
      console.error('读取出镜角色选择失败:', e);
      return null;
    }
  },

  async openMetaEditor(item, modal) {
    if (!item) return;
    const existing = document.getElementById('yd-album-desc-sheet');
    if (existing) existing.remove();

    const sheet = document.createElement('div');
    sheet.id = 'yd-album-desc-sheet';
    sheet.className = 'yd-album-desc-sheet';
    sheet.innerHTML = `
      <div class="yd-album-desc-sheet__mask" data-close="1"></div>
      <div class="yd-album-desc-sheet__panel" role="dialog" aria-modal="true" aria-label="照片信息">
        <div class="yd-album-desc-sheet__title">照片信息</div>

        <div class="yd-album-desc-sheet__section">
          <div class="yd-album-desc-sheet__label">出镜角色（可多选）</div>
          <div class="yd-album-desc-sheet__hint">可以选择和你一起出镜的角色，也可以只选“我”或留空。</div>
          <div class="yd-album-participants" id="album-participants"></div>
        </div>

        <div class="yd-album-desc-sheet__section">
          <div class="yd-album-desc-sheet__label">拍摄时间</div>
          <input class="yd-album-desc-input" id="album-shot-time" />
          <div class="yd-album-desc-sheet__hint">你可以改成更合适的描述。</div>
        </div>

        <div class="yd-album-desc-sheet__section">
          <div class="yd-album-desc-sheet__label">拍摄地点（可选）</div>
          <input class="yd-album-desc-input" id="album-shot-location" placeholder="例如：上海·外滩" />
        </div>

        <div class="yd-album-desc-sheet__section">
          <div class="yd-album-desc-sheet__label">描述这张照片</div>
          <textarea class="yd-album-desc-textarea" id="album-desc" rows="3"></textarea>
          <div class="yd-album-desc-sheet__hint">例如：和小南在海边散步的傍晚。</div>
        </div>

        <div class="yd-album-desc-sheet__actions">
          <button type="button" class="yd-album-desc-btn yd-album-desc-btn--secondary" id="album-desc-cancel">取消</button>
          <button type="button" class="yd-album-desc-btn yd-album-desc-btn--primary" id="album-desc-confirm">确认保存</button>
        </div>
      </div>
    `;

    const close = () => sheet.remove();
    sheet.addEventListener('click', (e) => {
      const t = e.target;
      if (t === sheet) close();
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const timeInput = sheet.querySelector('#album-shot-time');
    const locInput = sheet.querySelector('#album-shot-location');
    const descEl = sheet.querySelector('#album-desc');
    if (timeInput) timeInput.value = String(item.shotTime || '').trim();
    if (locInput) locInput.value = String(item.shotLocation || '').trim();
    if (descEl) descEl.value = String(item.description || '').trim();

    const participantsContainer = sheet.querySelector('#album-participants');
    await this._renderParticipantsPicker(participantsContainer, item.participants || null);

    const cancelBtn = sheet.querySelector('#album-desc-cancel');
    const confirmBtn = sheet.querySelector('#album-desc-confirm');
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        try {
          const all = await Storage.dbGetAll('album');
          const nextDescRaw = descEl ? String(descEl.value || '').trim() : '';
          const nextDesc = await this._getUniqueDescription(nextDescRaw, all, item.id);
          item.description = nextDesc;
          item.shotTime = timeInput ? String(timeInput.value || '').trim() : undefined;
          item.shotLocation = locInput ? String(locInput.value || '').trim() : undefined;
          item.participants = this._readParticipantsFromPicker(sheet);

          await Storage.dbPut('album', item);
          await this.loadAlbum();

          const nameEl = modal ? modal.querySelector('#yd-album-modal-name') : document.getElementById('yd-album-modal-name');
          if (nameEl) nameEl.textContent = nextDesc;
          await this._renderAlbumMetaIntoModal(modal || document.getElementById('yd-album-modal'), item);
          close();
        } catch (e) {
          console.error('保存照片信息失败:', e);
          alert('保存失败');
        }
      });
    }

    document.body.appendChild(sheet);
    setTimeout(() => {
      const input = sheet.querySelector('#album-desc');
      if (input && input.focus) input.focus();
    }, 0);
  },

  async openViewer(item) {
    if (!item) return;
    const existing = document.getElementById('yd-album-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-album-modal';
    modal.className = 'yd-album-modal';

    const name = (item.description || item.name || '').trim() || '未命名照片';
    const isSticker = this.getItemType(item) === 'sticker';
    const stickerBtnText = isSticker ? '移出表情包库' : '设置为表情包';

    modal.innerHTML = `
      <div class="yd-album-modal__inner">
        <div class="yd-album-modal__image-wrap">
          <img class="yd-album-modal__image" src="${item.data}" alt="${this.escapeHtml(name)}">
        </div>
        <div class="yd-album-modal__body">
          <div class="yd-album-modal__name" id="yd-album-modal-name">${this.escapeHtml(name)}</div>
          <div class="yd-album-modal__actions">
            <button type="button" class="yd-album-btn yd-album-btn--danger" id="yd-album-delete">删除</button>
            <button type="button" class="yd-album-btn yd-album-btn--tag" id="yd-album-sticker-toggle">${stickerBtnText}</button>
            <button type="button" class="yd-album-btn" id="yd-album-edit">编辑名称</button>
          </div>
          <div class="yd-album-meta" id="yd-album-meta"></div>
        </div>
      </div>
    `;

    const close = () => modal.remove();

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        close();
      }
    });

    const editBtn = modal.querySelector('#yd-album-edit');
    const deleteBtn = modal.querySelector('#yd-album-delete');
    const stickerToggleBtn = modal.querySelector('#yd-album-sticker-toggle');

    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        try {
          const all = await Storage.dbGetAll('album');
          const used = new Set(
            (all || [])
              .filter(it => it && it.id !== item.id)
              .map(it => (it.description || it.name || '').trim())
              .filter(Boolean)
          );
          let next = (item.description || item.name || '').trim();
          const origin = next;
          for (let i = 0; i < 5; i++) {
            // eslint-disable-next-line no-alert
            const input = prompt('编辑照片名称（不能与其他照片重复）：', next) || '';
            next = input.trim();
            if (!next) {
              const giveUp = confirm('名称为空将保持不变，是否放弃修改？');
              if (giveUp) {
                next = origin;
                break;
              }
              continue;
            }
            if (used.has(next)) {
              alert('已有其他照片使用了相同名称，请换一个。');
              continue;
            }
            break;
          }
          if (!next || next === origin) {
            return;
          }
          item.description = next;
          await Storage.dbPut('album', item);
          await this.loadAlbum();
          const nameEl = document.getElementById('yd-album-modal-name');
          if (nameEl) nameEl.textContent = next;
        } catch (e) {
          console.error('编辑照片名称失败:', e);
          alert('编辑失败');
        }
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('确定要删除这张照片吗？删除后无法恢复。')) return;
        try {
          await Storage.dbDelete('album', item.id);
          close();
          await this.loadAlbum();
        } catch (e) {
          console.error('删除照片失败:', e);
          alert('删除失败');
        }
      });
    }

    if (stickerToggleBtn) {
      stickerToggleBtn.addEventListener('click', async () => {
        try {
          const nextType = this.getItemType(item) === 'sticker' ? 'image' : 'sticker';
          item.type = nextType;
          await Storage.dbPut('album', item);
          await this.loadAlbum();
          stickerToggleBtn.textContent = nextType === 'sticker' ? '移出表情包库' : '设置为表情包';
        } catch (e) {
          console.error('设置表情包失败:', e);
          alert('操作失败');
        }
      });
    }

    document.body.appendChild(modal);
    await this._renderAlbumMetaIntoModal(modal, item);

    // 注意：编辑按钮是 meta 区域动态渲染出来的，所以在渲染完成后再绑定事件
    const metaEditBtn = modal.querySelector('#yd-album-meta-edit');
    if (metaEditBtn) {
      metaEditBtn.addEventListener('click', async () => {
        await this.openMetaEditor(item, modal);
      });
    }
  }
};


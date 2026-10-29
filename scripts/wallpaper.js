// 壁纸管理页面（使用相册数据，一行两列展示，每张下方一个“设置成壁纸”按钮）
const Wallpaper = {
  init() {
    this.setupEvents();
  },

  setupEvents() {
    document.getElementById('wallpaper-reset')?.addEventListener('click',async()=>{
      Storage.set(CONFIG.STORAGE_KEYS.WALLPAPER,'');
      await Homescreen.loadWallpaper();
      await this.loadWallpapers();
      Settings.showToast('已恢复默认木纹背景');
    });
    const backBtn = document.getElementById('wallpaper-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        State.switchPage('page-settings');
      });
    }

    const uploadBtn = document.getElementById('wallpaper-upload');
    const fileInput = document.getElementById('wallpaper-file');

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.uploadImage(file);
        }
        // 允许选择同一个文件多次
        e.target.value = '';
      });
    }
  },

  async uploadImage(file) {
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      if (typeof Settings !== 'undefined' && Settings.showToast) Settings.showToast('只支持PNG、JPG、WebP格式');
      else alert('只支持PNG、JPG、WebP格式');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target.result;
        const item = {
          id: State.generateId(),
          data: imageData,
          name: file.name || '壁纸',
          createdAt: Date.now()
        };

        await Storage.dbAdd('album', item);
        if (typeof Settings !== 'undefined' && Settings.showToast) Settings.showToast('上传成功');
        else alert('上传成功');
        await this.loadWallpapers();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('上传壁纸失败:', err);
      if (typeof Settings !== 'undefined' && Settings.showToast) Settings.showToast('上传失败');
      else alert('上传失败');
    }
  },

  // 加载所有已上传图片（来自 album 表），一行两列展示
  async loadWallpapers() {
    const grid = document.getElementById('wallpaper-grid');
    if (!grid) return;

    const items = await Storage.dbGetAll('album');
    grid.innerHTML = '';

    if (!items || items.length === 0) {
      grid.innerHTML = '<div class="yd-wallpaper-empty">暂无壁纸，点击右上角“+”上传</div>';
      return;
    }

    // 当前壁纸（Storage 中存的是 { albumId }）
    let currentAlbumId = '';
    try {
      const wp = Storage.get(CONFIG.STORAGE_KEYS.WALLPAPER);
      currentAlbumId = (wp && typeof wp === 'object' && wp.albumId) ? String(wp.albumId) : '';
    } catch (e) {}

    // 按时间倒序
    items.sort((a, b) => b.createdAt - a.createdAt).forEach((item) => {
      const wrap = document.createElement('div');
      wrap.className = 'yd-wallpaper-item';

      const img = document.createElement('div');
      img.className = 'yd-wallpaper-item__image';
      img.style.backgroundImage = `url(${item.data})`;

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'yd-wallpaper-item__delete';
      delBtn.setAttribute('aria-label', '删除壁纸');
      delBtn.innerHTML = '<svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M799.2 874.4c0 34.4-28 62.4-62.368 62.4H287.2a62.496 62.496 0 0 1-62.4-62.4V212h574.4v662.4zM349.6 100c0-7.2 5.6-12.8 12.8-12.8h300c7.2 0 12.768 5.6 12.768 12.8v37.6H349.6V100z m636.8 37.6H749.6V100c0-48-39.2-87.2-87.2-87.2h-300a87.392 87.392 0 0 0-87.2 87.2v37.6H37.6C16.8 137.6 0 154.4 0 175.2s16.8 37.6 37.6 37.6h112v661.6A137.6 137.6 0 0 0 287.2 1012h449.6a137.6 137.6 0 0 0 137.6-137.6V212h112c20.8 0 37.6-16.8 37.6-37.6s-16.8-36.8-37.6-36.8zM512 824c20.8 0 37.6-16.8 37.6-37.6v-400c0-20.8-16.768-37.6-37.6-37.6-20.8 0-37.6 16.8-37.6 37.6v400c0 20.8 16.8 37.6 37.6 37.6m-175.2 0c20.8 0 37.6-16.8 37.6-37.6v-400c0-20.8-16.8-37.6-37.6-37.6s-37.6 16.8-37.6 37.6v400c0.8 20.8 17.6 37.6 37.6 37.6m350.4 0c20.8 0 37.632-16.8 37.632-37.6v-400c0-20.8-16.8-37.6-37.632-37.6-20.768 0-37.6 16.8-37.6 37.6v400c0 20.8 16.8 37.6 37.6 37.6" ></path></svg>';
      delBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = confirm('确定删除这张壁纸吗？');
        if (!ok) return;
        try {
          await Storage.dbDelete('album', item.id);
          if (isCurrent) {
            try {
              Storage.set(CONFIG.STORAGE_KEYS.WALLPAPER, '');
            } catch (err) {}
            const wallpaperEl = document.getElementById('wallpaper');
            if (wallpaperEl) wallpaperEl.style.backgroundImage = '';
          }
          if (typeof Settings !== 'undefined' && Settings.showToast) Settings.showToast('已删除壁纸');
          else alert('已删除壁纸');
          await this.loadWallpapers();
        } catch (err) {
          console.error('删除壁纸失败:', err);
          if (typeof Settings !== 'undefined' && Settings.showToast) Settings.showToast('删除失败');
          else alert('删除失败');
        }
      });
      img.appendChild(delBtn);

      const btn = document.createElement('button');
      btn.className = 'yd-btn yd-wallpaper-item__btn';
      const isCurrent = currentAlbumId && item && String(item.id) === currentAlbumId;
      if (isCurrent) {
        btn.type = 'button';
        btn.classList.add('yd-wallpaper-item__btn--current');
        btn.textContent = '当前壁纸';
        btn.disabled = true;
      } else {
        btn.textContent = '设置成壁纸';
      }

      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        if (typeof Homescreen !== 'undefined') {
          await Homescreen.setWallpaper(item.data, item.id);
        }
        if (typeof Settings !== 'undefined' && Settings.showToast) Settings.showToast('主屏幕壁纸已设置');
        else alert('主屏幕壁纸已设置');
        // 立即刷新按钮状态
        await this.loadWallpapers();
      });

      wrap.appendChild(img);
      wrap.appendChild(btn);
      grid.appendChild(wrap);
    });
  }
};











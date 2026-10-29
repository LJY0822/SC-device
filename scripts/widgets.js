// 组件列表页面（按尺寸分类）
const Widgets = {
  _currentCategoryId: '2x2',

  _categories: [
    { id: '1x1', w: 1, h: 1, label: '1×1' },
    { id: '2x2', w: 2, h: 2, label: '2×2' },
    { id: '3x3', w: 3, h: 3, label: '3×3' },
    { id: '4x4', w: 4, h: 4, label: '4×4' },
    { id: '4x1', w: 4, h: 1, label: '4×1' },
    { id: '4x2', w: 4, h: 2, label: '4×2' },
    { id: '4x3', w: 4, h: 3, label: '4×3' }
  ],

  init() {
    // 监听页面切换，进入组件页时渲染
    try {
      window.addEventListener('yd:pagechange', (e) => {
        const to = e && e.detail && e.detail.to;
        if (to === 'page-widgets') {
          this.render();
        }
      });
    } catch (e) {}

    // 如果当前就在组件页（理论上不会），也渲染一次
    if (typeof State !== 'undefined' && State.currentPage === 'page-widgets') {
      this.render();
    }
  },

  render() {
    const page = document.getElementById('page-widgets');
    if (!page) return;
    this.renderCategories();
    this.renderList();
  },

  // 兼容：保留分类条，但内容清空，仅用于“新增组件”按钮
  renderCategories() {
    const bar = document.getElementById('widgets-category-bar');
    const addLabel = document.getElementById('widgets-add-label');
    if (bar) {
      bar.innerHTML = '';
    }
    if (addLabel) {
      addLabel.textContent = '新增组件';
    }

    const addBtn = document.getElementById('widgets-add-btn');
    if (addBtn) {
      addBtn.onclick = () => {
        const cur = this._categories.find(c => c.id === this._currentCategoryId);
        if (!cur || typeof Settings === 'undefined') return;
        Settings._pendingNewWidgetSize = { w: cur.w, h: cur.h, label: cur.label };
        if (Settings.showToast) {
          Settings.showToast(`新增 ${cur.label} 组件`);
        }
        if (typeof State !== 'undefined' && State.switchPage) {
          State.switchPage('page-settings-beautify-new-widget');
        }
      };
    }
  },

  _collectWidgets() {
    const result = [];
    const layoutMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT) || {};
    let htmlMap = {};
    try {
      htmlMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HTML) || {};
    } catch (e) {
      htmlMap = {};
    }

    const pushIfMissing = (id, fallback) => {
      if (!id) return;
      const cfg = layoutMap[id] || {};
      const w = Number.isFinite(cfg.w) && cfg.w > 0 ? cfg.w : fallback.w;
      const h = Number.isFinite(cfg.h) && cfg.h > 0 ? cfg.h : fallback.h;
      const label = (cfg.label && String(cfg.label).trim()) || fallback.label || id;
      result.push({ id, w, h, label });
    };

    // 内置组件默认尺寸
    pushIfMissing('widget-time-date', { w: 4, h: 2, label: '时间与日期' });
    pushIfMissing('widget-note', { w: 2, h: 2, label: '相片' });
    pushIfMissing('widget-player', { w: 2, h: 2, label: '播放器' });
    // 4×2 头像卡片组件
    pushIfMissing('widget-profile-card', { w: 4, h: 3, label: '头像卡片' });
    // 2×2 相片卡片组件（单张照片 + 文本）
    pushIfMissing('widget-photo-card', { w: 2, h: 2, label: '相片卡片' });
    // 2×2 相片圆卡组件（圆形图片 + 两行文字）
    pushIfMissing('widget-photo-circle', { w: 2, h: 2, label: '相片圆卡' });
    // 2×2 日期卡组件（背景图 + 日期角标）
    pushIfMissing('widget-date-card', { w: 2, h: 2, label: '日期卡' });

    // 用户自定义 widget：仅展示「布局表 + 已保存的组件 HTML」同时存在的项，避免 layout 里残留 id（如测试 widget-111）占列表
    Object.keys(layoutMap).forEach((wid) => {
      if (!wid || !wid.startsWith('widget-')) return;
      if (result.some(it => it.id === wid)) return;
      const customHtml = htmlMap[wid];
      if (typeof customHtml !== 'string' || !customHtml.trim()) return;
      const cfg = layoutMap[wid] || {};
      const w = Number.isFinite(cfg.w) && cfg.w > 0 ? cfg.w : 2;
      const h = Number.isFinite(cfg.h) && cfg.h > 0 ? cfg.h : 2;
      const label = (cfg.label && String(cfg.label).trim()) || wid;
      result.push({ id: wid, w, h, label });
    });

    return result;
  },

  renderList() {
    const listEl = document.getElementById('widgets-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const itemsRaw = this._collectWidgets();
    // 头像卡片（w=4）会占满整行。为了让它出现在“组件列表最后一排”，将其放到 items 数组末尾。
    const items = (() => {
      const idx = itemsRaw.findIndex(it => it && it.id === 'widget-profile-card');
      if (idx < 0) return itemsRaw;
      const profile = itemsRaw[idx];
      return [...itemsRaw.slice(0, idx), ...itemsRaw.slice(idx + 1), profile];
    })();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'yd-widgets-empty';
      empty.textContent = '暂无组件，可以点击右上角新增。';
      listEl.appendChild(empty);
      return;
    }

    items.forEach((it) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'yd-widgets-item';

      // 按 homescreen 的 4 列网格，控制缩略卡片在列表中占用的列数
      const spanCols = Math.max(1, Math.min(4, it.w || 1));
      card.style.gridColumn = 'span ' + spanCols;

      // 预览区：只保留一层带 aspect-ratio 的容器，直接放 iframe，减少外层干扰
      const preview = document.createElement('div');
      preview.className = 'yd-widgets-item__preview';
      preview.style.aspectRatio = it.w + '/' + it.h;

      let iframe = null;
      try {
        if (typeof Homescreen !== 'undefined' && Homescreen.getWidgetSrcDoc && it.id && it.id.startsWith('widget-')) {
          iframe = document.createElement('iframe');
          iframe.className = 'yd-widgets-preview-iframe';
          iframe.setAttribute('sandbox', 'allow-scripts');
          iframe.srcdoc = Homescreen.getWidgetSrcDoc(it.id);

          // 时间日期组件：加载后推送当前时间用于预览
          if (it.id === 'widget-time-date') {
            iframe.addEventListener('load', () => {
              try {
                const payload = (typeof Homescreen !== 'undefined' && Homescreen.widgetData)
                  ? Homescreen.widgetData
                  : (function () {
                      const now = new Date();
                      const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
                      const dateStr = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
                      return { time: timeStr, date: dateStr, weather: '' };
                    })();
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({ type: 'yd-widget-update', payload }, '*');
                }
              } catch (e) {}
            });
          }

          // 播放器组件：组件列表中的预览也使用当前的预设封面
          if (it.id === 'widget-player') {
            iframe.addEventListener('load', async () => {
              try {
                let presetImage = '';
                const style = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE) || {};
                if (style.presetImageAlbumId && Storage && Storage.db && Storage.dbGet) {
                  try {
                    const item = await Storage.dbGet('album', style.presetImageAlbumId);
                    if (item && item.data) {
                      presetImage = item.data;
                    }
                  } catch (e) {
                    // 忽略单个读取失败
                  }
                } else if (style.presetImage && typeof style.presetImage === 'string') {
                  presetImage = style.presetImage;
                }

                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage(
                    {
                      type: 'yd-widget-player-state',
                      payload: {
                        hasTrack: false,
                        title: '未在播放',
                        artist: '',
                        coverDataUrl: '',
                        duration: 0,
                        currentTime: 0,
                        isPlaying: false,
                        lyricLine: '',
                        presetImage
                      }
                    },
                    '*'
                  );
                }
              } catch (e) {
                // 忽略单个预览失败
              }
            });
          }

          // 相片组件：组件列表预览中也需要显示当前两张照片
          if (it.id === 'widget-note') {
            iframe.addEventListener('load', async () => {
              try {
                const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_NOTE_STYLE);
                if (!raw || typeof raw !== 'object') return;

                const images = { image1: '', image2: '' };

                if (raw.image1AlbumId && Storage && Storage.db && Storage.dbGet) {
                  try {
                    const item = await Storage.dbGet('album', raw.image1AlbumId);
                    if (item && item.data) {
                      images.image1 = item.data;
                    }
                  } catch (e) {
                    console.error('[widget-note] 组件列表预览读取 image1 失败:', e);
                  }
                } else if (raw.image1 && typeof raw.image1 === 'string') {
                  images.image1 = raw.image1;
                }

                if (raw.image2AlbumId && Storage && Storage.db && Storage.dbGet) {
                  try {
                    const item = await Storage.dbGet('album', raw.image2AlbumId);
                    if (item && item.data) {
                      images.image2 = item.data;
                    }
                  } catch (e) {
                    console.error('[widget-note] 组件列表预览读取 image2 失败:', e);
                  }
                } else if (raw.image2 && typeof raw.image2 === 'string') {
                  images.image2 = raw.image2;
                }

                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage(
                    { type: 'yd-widget-note-images', payload: images },
                    '*'
                  );
                }
              } catch (e) {
                // 忽略单个预览失败
              }
            });
          }

          // 头像卡片组件：组件列表预览需要同步 widgetResources（文本+图片）
          if (it.id === 'widget-profile-card') {
            iframe.addEventListener('load', async () => {
              try {
                if (!Storage || !Storage.db || !Storage.dbGetAll) return;
                const resourcesAll = await Storage.dbGetAll('widgetResources');
                const resources = (resourcesAll || []).filter(r => r && r.widgetId === 'widget-profile-card');
                if (!resources.length) return;

                // 解析图片资源为 imageData（从 albumId 读取）
                const albumAll = await Storage.dbGetAll('album');
                const albumMap = {};
                (albumAll || []).forEach((pic) => {
                  if (pic && pic.id) albumMap[pic.id] = pic;
                });

                const payload = resources.map((r) => {
                  if (r.kind === 'image' && r.albumId && albumMap[r.albumId] && albumMap[r.albumId].data) {
                    return { ...r, imageData: albumMap[r.albumId].data };
                  }
                  return r;
                });

                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage(
                    { type: 'yd-widget-data', widgetId: 'widget-profile-card', resources: payload },
                    '*'
                  );
                }
              } catch (e) {
                console.error('[widget-profile-card] 组件列表预览同步资源失败:', e);
              }
            });
          }

          preview.appendChild(iframe);
        }
      } catch (e) {}
      if (!iframe) {
        const placeholder = document.createElement('div');
        placeholder.className = 'yd-widgets-item__preview-placeholder';
        preview.appendChild(placeholder);
      }

      const info = document.createElement('div');
      info.className = 'yd-widgets-item__info';

      const title = document.createElement('div');
      title.className = 'yd-widgets-item__title';
      title.textContent = it.label;

      info.appendChild(title);

      card.appendChild(preview);
      card.appendChild(info);
      card.addEventListener('click', () => {
        // 时间日期组件：进入专属样式页
        if (it.id === 'widget-time-date') {
          if (typeof State !== 'undefined' && State.switchPage) {
            State.switchPage('page-widget-time-date-style');
          }
          return;
        }

        // 播放器组件：进入专属样式页
        if (it.id === 'widget-player') {
          if (typeof State !== 'undefined' && State.switchPage) {
            State.switchPage('page-widget-player-style');
          }
          return;
        }

        // 相片卡片组件：进入专属样式页
        if (it.id === 'widget-photo-card') {
          if (typeof State !== 'undefined' && State.switchPage) {
            State.switchPage('page-widget-photo-card-style');
          }
          return;
        }

        // 相片圆卡组件：进入专属样式页
        if (it.id === 'widget-photo-circle') {
          if (typeof State !== 'undefined' && State.switchPage) {
            State.switchPage('page-widget-photo-circle-style');
          }
          return;
        }

        // 日期卡组件：进入专属样式页
        if (it.id === 'widget-date-card') {
          if (typeof State !== 'undefined' && State.switchPage) {
            State.switchPage('page-widget-date-card-style');
          }
          return;
        }

        // 头像卡片组件：进入专属样式页
        if (it.id === 'widget-profile-card') {
          if (typeof State !== 'undefined' && State.switchPage) {
            State.switchPage('page-widget-profile-card-style');
          }
          return;
        }

        // 便笺组件：进入专属样式页
        if (it.id === 'widget-note') {
          if (typeof State !== 'undefined' && State.switchPage) {
            State.switchPage('page-widget-note-style');
          }
          return;
        }

        // 其他组件：进入美化设置页
        if (typeof Settings !== 'undefined') {
          Settings._pendingOpenWidgetId = it.id;
        }
        if (typeof State !== 'undefined' && State.switchPage) {
          State.switchPage('page-settings-beautify');
        }
      });
      listEl.appendChild(card);
    });
  }
};


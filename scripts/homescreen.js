// 主屏幕管理
const Homescreen = {
  draggedIcon: null,
  // 旧版时间组件 iframe（向后兼容）
  widgetIframe: null,
  // 多组件 iframe 映射：{ [widgetId]: iframe }
  widgetIframes: {},
  // widget 通用数据（时间/日期/天气等）
  widgetData: { time: '', date: '', weather: '' },
  // widget 资源数据：从 IndexedDB 加载，按 widgetId 分组
  widgetResourceMap: {},
  // 时间组件字体（Baloo 2）缓存为 data URL，离线可用
  _cachedFontDataUrl: null,
  _cachedFont: null,
  _pagerBound: false,
  _pagerRaf: 0,
  _lastPageIndex: 0,
  // 记录上一次在主屏可见状态下计算出的网格规格，避免隐藏状态重排漂移
  _lastGridSpec: null,

  /** 图标点击：有合法 http(s) url 则新窗口打开，否则进入内部 page */
  openIconTarget(icon) {
    if (!icon) return;
    try {
      const url = typeof icon.url === 'string' ? icon.url.trim() : '';
      if (url && /^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      const page = typeof icon.page === 'string' ? icon.page.trim() : '';
      if (page) State.switchPage(page);
    } catch (e) {}
  },
  
  // 初始化
  async init() {
    this.loadIcons();
    this.loadWallpaper();
  },
  
  // 加载图标
  loadIcons() {
    // 检查图标配置版本，如果版本不匹配则使用新的默认配置
    const savedVersion = Storage.get('icon_config_version');
    const currentVersion = CONFIG.ICON_CONFIG_VERSION || 1;
    
    if (savedVersion !== currentVersion) {
      // 版本不匹配，使用新的默认图标并保存版本号
      console.log(`图标配置版本更新: ${savedVersion} -> ${currentVersion}，重置为默认布局`);
      State.icons = CONFIG.DEFAULT_ICONS;
      Storage.set('icon_config_version', currentVersion);
      Storage.remove(CONFIG.STORAGE_KEYS.ICON_ORDER);
    } else {
      // 版本匹配，使用保存的图标顺序
      const savedOrder = Storage.get(CONFIG.STORAGE_KEYS.ICON_ORDER);
      State.icons = savedOrder || CONFIG.DEFAULT_ICONS;
    }

    // 轻量迁移：确保“天气/相机”等图标跳转到正确页面（避免旧的保存布局仍指向 page-chat）
    try {
      const icons = Array.isArray(State.icons) ? State.icons : [];
      let changed = false;
      const idToPage = {};
      const idToLabel = {};
      const idToUrl = {};
      (CONFIG.DEFAULT_ICONS || []).forEach((it) => {
        if (!it || !it.id) return;
        if (it.page) idToPage[it.id] = it.page;
        if (it.label) idToLabel[it.id] = it.label;
        if (typeof it.url === 'string' && it.url.trim()) idToUrl[it.id] = it.url.trim();
      });

      icons.forEach(ic => {
        if (!ic) return;
        // 旧版晒图图标 id 迁移（兼容历史布局）
        const legacyShareId = String.fromCharCode(105, 110, 115);
        if (ic.id === legacyShareId) {
          ic.id = 'share';
          ic.page = 'page-share';
          changed = true;
          return;
        }
        // 再按 id 修正（常规情况：id 未被用户“改名伪装”）
        if (ic.id && idToPage[ic.id] && ic.page !== idToPage[ic.id]) {
          ic.page = idToPage[ic.id];
          changed = true;
          return;
        }
        // 按默认配置修正 label（避免旧布局残留旧名称）
        if (ic.id && idToLabel[ic.id] && ic.label !== idToLabel[ic.id]) {
          ic.label = idToLabel[ic.id];
          changed = true;
        }
        if (ic.id && idToUrl[ic.id] && ic.url !== idToUrl[ic.id]) {
          ic.url = idToUrl[ic.id];
          changed = true;
        }
        if (ic.id && idToUrl[ic.id]) {
          const def = (CONFIG.DEFAULT_ICONS || []).find((d) => d && d.id === ic.id);
          const wantPage = def && typeof def.page === 'string' ? def.page : '';
          if ((ic.page || '') !== wantPage) {
            ic.page = wantPage;
            changed = true;
          }
        }
      });

      // 生图记录：旧版 SVG 仅根节点 fill=none，会被 .yd-icon__img svg{fill:currentColor} 打成整块实心；同步为默认矢量
      try {
        const defMr = (CONFIG.DEFAULT_ICONS || []).find((d) => d && d.id === 'mis-records');
        if (defMr && defMr.type === 'svg' && defMr.svg) {
          icons.forEach((ic) => {
            if (!ic || ic.id !== 'mis-records' || ic.type !== 'svg') return;
            if (ic.svg !== defMr.svg) {
              ic.svg = defMr.svg;
              changed = true;
            }
          });
        }
      } catch (e) {}

      // 清理不需要的图标（占位/未实现/测试）
      const blocked = new Set([
        'health', 'finance', 'study', 'work',
        'video', 'book', 'mail', 'clock',
        'test-large', 'test-image',
        'game', 'sport', 'food', 'travel', 'social', 'news', 'podcast', 'tools',
        'files', 'cloud', 'security', 'browser', 'calculator', 'reminder', 'voice',
        'ta-room', 'shop', 'wallet', 'takeout', 'ta-phone', 'ta-diary'
      ]);
      const beforeLen = icons.length;
      for (let i = icons.length - 1; i >= 0; i--) {
        const it = icons[i];
        if (it && blocked.has(it.id)) {
          icons.splice(i, 1);
          changed = true;
        }
      }

      // 去重：同 id 只保留第一个
      const seen = new Set();
      for (let i = icons.length - 1; i >= 0; i--) {
        const it = icons[i];
        const id = it && it.id;
        if (!id) continue;
        if (seen.has(id)) {
          icons.splice(i, 1);
          changed = true;
        } else {
          seen.add(id);
        }
      }

      // 轻量迁移：将“外卖”图标移动到“角色”后面（满足默认排序要求）
      try {
        const idxTakeout = icons.findIndex(it => it && it.id === 'takeout');
        const idxCharacter = icons.findIndex(it => it && it.id === 'character');
        if (idxTakeout >= 0 && idxCharacter >= 0 && idxTakeout !== idxCharacter + 1) {
          const [takeout] = icons.splice(idxTakeout, 1);
          const nextCharacterIdx = icons.findIndex(it => it && it.id === 'character');
          icons.splice(Math.max(0, nextCharacterIdx + 1), 0, takeout);
          changed = true;
        }
      } catch (e) {}

      // 轻量迁移：将“手册”图标移动到最后，保持第二页末尾位置
      try {
        const idxManual = icons.findIndex(it => it && it.id === 'manual');
        if (idxManual >= 0 && idxManual !== icons.length - 1) {
          const [manual] = icons.splice(idxManual, 1);
          icons.push(manual);
          changed = true;
        }
      } catch (e) {}

      // 轻量迁移：将“制卡助手”图标放在“手册”前一位
      try {
        const idxAssistant = icons.findIndex(it => it && it.id === 'card-assistant');
        const desired = Math.max(0, icons.length - 2);
        if (idxAssistant >= 0 && idxAssistant !== desired) {
          const [assistant] = icons.splice(idxAssistant, 1);
          icons.splice(desired, 0, assistant);
          changed = true;
        }
      } catch (e) {}

      // 轻量迁移：将“查日记”图标放在“查日程”后面
      try {
        const idxDiary = icons.findIndex(it => it && it.id === 'ta-diary');
        const idxExp = icons.findIndex(it => it && it.id === 'ta-experience');
        if (idxDiary >= 0 && idxExp >= 0 && idxDiary !== idxExp + 1) {
          const [diary] = icons.splice(idxDiary, 1);
          const nextExpIdx = icons.findIndex(it => it && it.id === 'ta-experience');
          icons.splice(Math.max(0, nextExpIdx + 1), 0, diary);
          changed = true;
        }
      } catch (e) {}

      // 若新增默认图标（如“朋友圈”）不存在于当前布局，则追加（不重置用户布局）
      const existingIds = new Set(icons.map(i => i && i.id).filter(Boolean));
      (CONFIG.DEFAULT_ICONS || []).forEach((it) => {
        if (!it || !it.id) return;
        if (!existingIds.has(it.id)) {
          icons.push({ ...it });
          existingIds.add(it.id);
          changed = true;
        }
      });

      // 再次兜底：补齐默认图标后，确保“查日记”紧跟“查日程”
      try {
        // 再次兜底：补齐默认图标后，确保“手册”最后且“制卡助手”在其前一位
        try {
          const idxManual = icons.findIndex(it => it && it.id === 'manual');
          if (idxManual >= 0 && idxManual !== icons.length - 1) {
            const [manual] = icons.splice(idxManual, 1);
            icons.push(manual);
            changed = true;
          }

          const idxAssistant = icons.findIndex(it => it && it.id === 'card-assistant');
          const desired = Math.max(0, icons.length - 2);
          if (idxAssistant >= 0 && idxAssistant !== desired) {
            const [assistant] = icons.splice(idxAssistant, 1);
            icons.splice(desired, 0, assistant);
            changed = true;
          }
        } catch (e2) {}

        const idxDiary = icons.findIndex(it => it && it.id === 'ta-diary');
        const idxExp = icons.findIndex(it => it && it.id === 'ta-experience');
        if (idxDiary >= 0 && idxExp >= 0 && idxDiary !== idxExp + 1) {
          const [diary] = icons.splice(idxDiary, 1);
          const nextExpIdx = icons.findIndex(it => it && it.id === 'ta-experience');
          icons.splice(Math.max(0, nextExpIdx + 1), 0, diary);
          changed = true;
        }
      } catch (e) {}

      if (changed) {
        Storage.set(CONFIG.STORAGE_KEYS.ICON_ORDER, icons);
        State.icons = icons;
        // 图标顺序变化：下次进入主屏需要刷新
        try { if (State && State.markHomescreenDirty) State.markHomescreenDirty(); } catch (e) {}
      }
    } catch (e) {
      console.warn('迁移图标跳转失败:', e);
    }

    // 强制清理 iconStyles 里的 label 字段（用户不允许改名称）
    try {
      const iconStyles = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
      let changed = false;
      Object.keys(iconStyles || {}).forEach((k) => {
        const v = iconStyles[k];
        if (v && typeof v === 'object' && 'label' in v) {
          delete v.label;
          changed = true;
        }
      });
      if (changed) {
        Storage.set(CONFIG.STORAGE_KEYS.ICON_STYLES, iconStyles);
      }
    } catch (e) {}
    
    this.renderDock();
  },
  
  // 计算网格规格（列固定=CONFIG.GRID_COLS，行根据可用高度自适应）
  getGridSpec() {
    const pager = document.getElementById('homescreen-pager');
    const cols = CONFIG.GRID_COLS || 4;
    const gap = 20;

    let pagerHeight = pager ? pager.clientHeight : window.innerHeight;
    const pagerWidth = pager ? pager.clientWidth : window.innerWidth;

    // 如果主屏幕不可见（在设置页面等），使用 window.innerHeight 作为参考
    if (pagerHeight < 100) {
      console.log('⚠️ [getGridSpec] 主屏幕不可见，使用 window.innerHeight');
      // 在隐藏状态下渲染（例如保存组件后）会导致 rows 波动，
      // 优先复用上一次可见时的网格规格，避免组件“5/6行与6/7行”来回跳。
      if (this._lastGridSpec) {
        return { ...this._lastGridSpec };
      }
      pagerHeight = window.innerHeight;
    }

    // 预留空间：顶部padding + 额外上移(视觉下移) + 底部padding；Dock 显示时再计入 Dock 占位高度
    const paddingX = 18 * 2; // left+right
    const dockReserve = this._isHomescreenDockHidden() ? 0 : 100;
    const paddingY = 18 + 20 + 18 + dockReserve; // top + 下移 + bottom +（可选）dock

    const usableH = Math.max(0, pagerHeight - paddingY);
    const usableW = Math.max(0, pagerWidth - paddingX);

    // 根据可用高度计算能放多少行（使用更小的单元格尺寸）
    const minUnit = 72; // 最小单元格尺寸
    let rows = Math.floor((usableH + gap) / (minUnit + gap));
    rows = Math.max(6, Math.min(10, rows)); // 最少6行，最多10行

    // 根据实际行数和可用空间，计算最终的单元格尺寸
    const unitByHeight = Math.floor((usableH - gap * (rows - 1)) / rows);
    const unitByWidth = Math.floor((usableW - gap * (cols - 1)) / cols);
    const unit = Math.max(minUnit, Math.min(unitByHeight, unitByWidth));

    console.log(`📏 [getGridSpec] pagerHeight=${pagerHeight}, usableH=${usableH}, 计算行数=${rows}, 单元格=${unit}px`);
    const spec = { cols, rows, unit, gap };
    this._lastGridSpec = spec;
    return spec;
  },

  _isHomescreenDockHidden() {
    try {
      const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.HOMESCREEN_DOCK) || 'homescreen_dock';
      const def = (CONFIG && CONFIG.DEFAULT_HOMESCREEN_DOCK) || 'show';
      return String(Storage.get(key) || def).trim() === 'hide';
    } catch (e) {
      return false;
    }
  },

  // 读取组件布局（支持在美化设置中自定义 w×h + page/row/col）
  getWidgetHideFromHomescreenMap() {
    const out = {};
    try {
      const m = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HIDE_FROM_HOMESCREEN);
      if (m && typeof m === 'object') {
        Object.keys(m).forEach((k) => {
          if (k && m[k]) out[k] = true;
        });
      }
    } catch (e) {}
    try {
      const st = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE);
      if (st && typeof st === 'object' && st.hideFromHomescreen) out['widget-time-date'] = true;
    } catch (e) {}
    return out;
  },

  setWidgetHideFromHomescreen(widgetId, hidden) {
    let raw = {};
    try {
      const x = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HIDE_FROM_HOMESCREEN);
      if (x && typeof x === 'object') raw = { ...x };
    } catch (e) {}
    if (hidden) raw[widgetId] = true;
    else delete raw[widgetId];
    const cleaned = {};
    Object.keys(raw).forEach((k) => {
      if (k && raw[k]) cleaned[k] = true;
    });
    try {
      Storage.set(CONFIG.STORAGE_KEYS.WIDGET_HIDE_FROM_HOMESCREEN, cleaned);
    } catch (e) {}
    if (widgetId === 'widget-time-date') {
      try {
        const st = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE);
        if (st && typeof st === 'object' && 'hideFromHomescreen' in st) {
          const next = { ...st };
          delete next.hideFromHomescreen;
          Storage.set(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE, next);
        }
      } catch (e) {}
    }
  },

  getWidgetLayout(widgetId, defaults) {
    const result = {
      w: defaults.w,
      h: defaults.h,
      page: defaults.page,
      row: defaults.row,
      col: defaults.col
    };
    try {
      const map = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT) || {};
      const cfg = widgetId && map && map[widgetId];
      if (cfg && typeof cfg === 'object') {
        if (Number.isFinite(cfg.w) && cfg.w > 0) result.w = Math.max(1, Math.floor(cfg.w));
        if (Number.isFinite(cfg.h) && cfg.h > 0) result.h = Math.max(1, Math.floor(cfg.h));
        if (Number.isFinite(cfg.page) && cfg.page >= 0) result.page = Math.floor(cfg.page);
        if (Number.isFinite(cfg.row) && cfg.row >= 0) result.row = Math.floor(cfg.row);
        if (Number.isFinite(cfg.col) && cfg.col >= 0) result.col = Math.floor(cfg.col);
      }
    } catch (e) {
      console.error('读取组件布局失败:', e);
    }
    return result;
  },

  // 生成要布局的 tiles：使用固定的默认布局
  // gridRows 用于把“页尾组件”精确放到底部（不同屏幕行数会变化）
  buildTiles(gridRows) {
    const rows = Number.isFinite(gridRows) && gridRows > 0 ? Math.floor(gridRows) : 6;
    const tiles = [];
    const cols = CONFIG.GRID_COLS || 4;
    const hideMap = this.getWidgetHideFromHomescreenMap();

    const colOverlap = (c1, w1, c2, w2) => c1 < c2 + w2 && c2 < c1 + w1;

    /** 被隐藏的组件在「默认布局」下的占位，用于把同列下方的固定块上移 */
    const hiddenRects = [];
    const markHidden = (id, page, row, col, w, h) => {
      if (hideMap[id]) hiddenRects.push({ page, row, col, w, h });
    };
    markHidden('widget-time-date', 0, 0, 0, cols, 2);
    markHidden('widget-note', 0, 2, 0, 2, 2);
    markHidden('widget-player', 0, 4, 2, 2, 2);
    markHidden('widget-photo-card', 1, 0, 0, 2, 2);
    markHidden('widget-profile-card', 2, 0, 0, cols, 3);
    const bottomRow = Math.max(0, rows - 2);
    markHidden('widget-photo-circle', 1, bottomRow, 0, 2, 2);
    markHidden('widget-date-card', 1, bottomRow, 2, 2, 2);

    const adjustFixed = (page, baseRow, col, w, h) => {
      let nr = baseRow;
      for (const H of hiddenRects) {
        if (H.page !== page) continue;
        if (H.row + H.h <= baseRow && colOverlap(H.col, H.w, col, w)) nr -= H.h;
      }
      return Math.max(0, nr);
    };

    const pushWidget = (id, w, h, page, baseRow, col) => {
      if (hideMap[id]) return;
      tiles.push({
        id,
        kind: 'widget',
        w,
        h,
        fixed: { page, row: adjustFixed(page, baseRow, col, w, h), col }
      });
    };

    // ========== 第1页组件 ==========
    pushWidget('widget-time-date', cols, 2, 0, 0, 0);
    pushWidget('widget-note', 2, 2, 0, 2, 0);
    pushWidget('widget-player', 2, 2, 0, 4, 2);

    // ========== 第2页组件 ==========
    pushWidget('widget-photo-card', 2, 2, 1, 0, 0);
    pushWidget('widget-profile-card', cols, 3, 2, 0, 0);

    // ========== 第2页底部（行数依赖）==========
    pushWidget('widget-photo-circle', 2, 2, 1, bottomRow, 0);
    pushWidget('widget-date-card', 2, 2, 1, bottomRow, 2);

    // ========== 图标：填充剩余空间 ==========
    // 第1页可用位置：
    // row 2-3, col 2-3 (第3-4行右边，2×2区域，4个位置)
    // row 4-5, col 0-1 (第5-6行左边，2×2区域，4个位置)
    const page0IconPositions = [
      // 第3行右边：2个图标
      { row: 2, col: 2 }, { row: 2, col: 3 },
      // 第4行右边：2个图标
      { row: 3, col: 2 }, { row: 3, col: 3 },
      // 第5行左边：2个图标
      { row: 4, col: 0 }, { row: 4, col: 1 },
      // 第6行左边：2个图标
      { row: 5, col: 0 }, { row: 5, col: 1 }
    ];

    // 添加图标到布局（第1页：按“优先功能/初版可用”的 icon id 白名单固定到这 8 个格子）
    const page0PriorityIconIds = [
      'chat', 'settings', 'forum', 'music',
      'camera', 'shop', 'moments', 'widgets'
    ];

    const hiddenIconIds = new Set(['map', 'weather', 'beautify', 'share', 'live', 'note', 'session-beautify']);
    const icons = (Array.isArray(State.icons) ? State.icons : []).filter((icon) => {
      const id = String(icon?.id || '');
      return !hiddenIconIds.has(id);
    });

    // 先把第1页 8 个格子固定放置
    const placedPage0Ids = new Set();
    page0PriorityIconIds.forEach((id, i) => {
      const iconIndex = icons.findIndex((it) => it && it.id === id);
      if (iconIndex < 0) return;
      const icon = icons[iconIndex];
      const isLarge = icon.size === 'large';
      const pos = page0IconPositions[i];
      if (!pos) return;

      placedPage0Ids.add(id);
      tiles.push({
        id: `icon-${icon.id || iconIndex}`,
        kind: 'icon',
        icon,
        index: iconIndex,
        w: isLarge ? 2 : 1,
        h: isLarge ? 2 : 1,
        fixed: { page: 0, row: adjustFixed(0, pos.row, pos.col, isLarge ? 2 : 1, isLarge ? 2 : 1), col: pos.col }
      });
    });

    // 第 1 页：隐藏组件后空出的格子，按图标在列表中的顺序用后续 1×1 图标填满（大图标仍走流式页）
    const markOccPage0 = (occ, r, c, w, h) => {
      for (let rr = r; rr < r + h; rr++) {
        for (let cc = c; cc < c + w; cc++) {
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) occ[rr][cc] = true;
        }
      }
    };
    const buildPage0Occ = () => {
      const occ = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
      tiles.forEach((t) => {
        if (!t || !t.fixed || t.fixed.page !== 0) return;
        markOccPage0(occ, t.fixed.row, t.fixed.col, t.w, t.h);
      });
      return occ;
    };
    const collectFreePage0Cells = (occ) => {
      const out = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!occ[r][c]) out.push({ row: r, col: c });
        }
      }
      return out;
    };
    const freePage0Cells = collectFreePage0Cells(buildPage0Occ());
    const backfillIcons = icons.filter((ic) => {
      if (!ic || !ic.id) return false;
      if (placedPage0Ids.has(ic.id)) return false;
      if (ic.size === 'large') return false;
      return true;
    });
    const nBackfill = Math.min(freePage0Cells.length, backfillIcons.length);
    for (let i = 0; i < nBackfill; i++) {
      const icon = backfillIcons[i];
      const pos = freePage0Cells[i];
      placedPage0Ids.add(icon.id);
      const iconIndex = icons.findIndex((it) => it && it.id === icon.id);
      tiles.push({
        id: `icon-${icon.id || iconIndex}`,
        kind: 'icon',
        icon,
        index: iconIndex >= 0 ? iconIndex : i,
        w: 1,
        h: 1,
        fixed: { page: 0, row: pos.row, col: pos.col }
      });
    }

    // 再把剩余图标按原来的分页策略（优先放第2页，再溢出到第3页）
    icons.forEach((icon, index) => {
      if (!icon) return;

      // 强制校正关键图标的跳转页面（与配置保持一致，避免历史脏数据）
      if (icon.id === 'camera') icon.page = 'page-camera';
      if (icon.id === 'chat') icon.page = icon.page || 'page-chat-list';

      // 已经固定到第1页的图标不再重复放置
      if (icon.id && placedPage0Ids.has(icon.id)) return;

      const isLarge = icon.size === 'large';

      // 第2页：前 26 个图标（剩余部分）尝试放到 layoutPage=1
      if (index < 26) {
        tiles.push({
          id: `icon-${icon.id || index}`,
          kind: 'icon',
          icon,
          index,
          w: isLarge ? 2 : 1,
          h: isLarge ? 2 : 1,
          layoutPage: 1,
          minRow: isLarge ? Math.max(0, rows - 2) : 0
        });
      } else {
        // 剩余图标放第3页（自动流式布局）
        tiles.push({
          id: `icon-${icon.id || index}`,
          kind: 'icon',
          icon,
          index,
          w: isLarge ? 2 : 1,
          h: isLarge ? 2 : 1
          // 不设置 fixed，让 computeLayout 自动排版到第3页
        });
      }
    });

    return tiles;
  },

  // 简单装箱：先放固定块，再顺序放其他块；放不下就自动加页（最少2页）
  computeLayout(tiles, cols, rows) {
    const pages = [];
    const placements = [];

    const createEmptyOcc = () =>
      Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

    const ensurePage = (pageIndex) => {
      while (pages.length <= pageIndex) pages.push(createEmptyOcc());
      return pages[pageIndex];
    };

    const canPlace = (occ, row, col, w, h) => {
      if (row < 0 || col < 0) return false;
      if (row + h > rows || col + w > cols) return false;
      for (let r = row; r < row + h; r++) {
        for (let c = col; c < col + w; c++) {
          if (occ[r][c]) return false;
        }
      }
      return true;
    };

    const markPlace = (occ, row, col, w, h) => {
      for (let r = row; r < row + h; r++) {
        for (let c = col; c < col + w; c++) {
          occ[r][c] = true;
        }
      }
    };

    // 1) 固定块
    tiles
      .filter(t => t.fixed)
      .forEach(t => {
        const { page, row, col } = t.fixed;
        const occ = ensurePage(page);
        if (canPlace(occ, row, col, t.w, t.h)) {
          markPlace(occ, row, col, t.w, t.h);
          placements.push({ ...t, page, row, col });
        }
      });

    // 2) 顺序块（图标等）
    const flowing = tiles.filter(t => !t.fixed);
    for (const t of flowing) {
      // 防御：若尺寸超过网格，直接跳过，避免 while 死循环导致页面卡死
      if (t.w > cols || t.h > rows) {
        console.warn('[computeLayout] tile 太大，无法放入网格，已跳过:', {
          id: t.id,
          kind: t.kind,
          w: t.w,
          h: t.h,
          cols,
          rows
        });
        continue;
      }
      let placed = false;
      let pageIndex = Number.isFinite(t.layoutPage) ? Math.max(0, Math.floor(t.layoutPage)) : 0;
      while (!placed) {
        const occ = ensurePage(pageIndex);
        const startRow = typeof t.minRow === 'number' ? Math.max(0, t.minRow) : 0;
        for (let r = startRow; r <= rows - t.h; r++) {
          for (let c = 0; c <= cols - t.w; c++) {
            if (canPlace(occ, r, c, t.w, t.h)) {
              markPlace(occ, r, c, t.w, t.h);
              placements.push({ ...t, page: pageIndex, row: r, col: c });
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
        if (!placed) pageIndex += 1;
      }
    }

    const pageCount = Math.max(2, pages.length || 2);
    return { placements, pageCount };
  },

  // 渲染主屏（分页 + 网格 + tiles）
  renderHomescreen() {
    return; // SC uses its own desktop; legacy widget frames must not run.
    console.log('🎨 [renderHomescreen] 开始渲染主屏幕');
    const pagesEl = document.getElementById('homescreen-pages');
    const dotsEl = document.getElementById('homescreen-dots');
    if (!pagesEl || !dotsEl) {
      console.error('❌ [renderHomescreen] 找不到页面容器元素');
      return;
    }

    const { cols, rows, unit, gap } = this.getGridSpec();
    console.log(`📐 [renderHomescreen] 网格规格: ${cols}列 × ${rows}行, 单元格=${unit}px, 间距=${gap}px`);
    
    const tiles = this.buildTiles(rows);
    console.log(`🧩 [renderHomescreen] 生成了 ${tiles.length} 个 tiles`);
    
    const { placements, pageCount } = this.computeLayout(tiles, cols, rows);
    console.log(`📄 [renderHomescreen] 计算布局: ${placements.length} 个放置位置, ${pageCount} 页`);
    console.log('📍 [renderHomescreen] 放置详情:', placements.map(p => ({
      id: p.id,
      kind: p.kind,
      page: p.page,
      row: p.row,
      col: p.col,
      w: p.w,
      h: p.h
    })));

    pagesEl.innerHTML = '';
    dotsEl.innerHTML = '';
    this.widgetIframe = null;
    this.widgetIframes = {};

    // 生成页面与 grid
    const pageGrids = [];
    for (let i = 0; i < pageCount; i++) {
      const pageEl = document.createElement('div');
      pageEl.className = 'yd-homescreen-page';
      pageEl.dataset.pageIndex = i;

      const innerEl = document.createElement('div');
      innerEl.className = 'yd-homescreen-page__inner';

      const gridEl = document.createElement('div');
      gridEl.className = 'yd-homescreen-grid';
      gridEl.style.setProperty('--grid-cols', String(cols));
      gridEl.style.setProperty('--grid-rows', String(rows));
      gridEl.style.setProperty('--grid-unit', `${unit}px`);
      gridEl.style.setProperty('--grid-gap', `${gap}px`);
      
      console.log(`📄 [renderHomescreen] 创建第 ${i + 1} 页, CSS变量: --grid-cols=${cols}, --grid-rows=${rows}`);

      innerEl.appendChild(gridEl);
      pageEl.appendChild(innerEl);
      pagesEl.appendChild(pageEl);
      pageGrids.push(gridEl);

      const dot = document.createElement('div');
      dot.className = 'yd-homescreen-dot' + (i === 0 ? ' yd-homescreen-dot--active' : '');
      dot.dataset.pageIndex = String(i);
      dot.setAttribute('role', 'button');
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('aria-label', `主屏第 ${i + 1} 页`);
      dot.addEventListener('click', () => {
        const pageWidth = pagesEl.clientWidth || 1;
        pagesEl.scrollTo({ left: i * pageWidth, behavior: 'smooth' });
        this.updatePagerDots();
      });
      dot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          dot.click();
        }
      });
      dotsEl.appendChild(dot);
    }

    // 放置 tiles
    let placedCount = 0;
    placements.forEach(p => {
      const gridEl = pageGrids[p.page];
      if (!gridEl) {
        console.warn(`⚠️ [renderHomescreen] 找不到第 ${p.page} 页的网格容器`);
        return;
      }

      // 外层容器：用于阴影（不裁剪）
      const tileOuterEl = document.createElement('div');
      tileOuterEl.className = `yd-tile-outer yd-tile-outer--${p.kind}`;
      tileOuterEl.style.gridColumn = `${p.col + 1} / span ${p.w}`;
      tileOuterEl.style.gridRow = `${p.row + 1} / span ${p.h}`;

      // 内层容器：用于圆角裁剪
      const tileEl = document.createElement('div');
      tileEl.className = `yd-tile yd-tile--${p.kind}`;
      
      placedCount++;
      if (p.row >= 4) {
        console.log(`🔍 [renderHomescreen] 放置第${placedCount}个tile: ${p.id}, 第${p.page}页, 行${p.row}, 列${p.col}, gridRow=${p.row + 1}`);
      }

      if (p.kind === 'widget') {
        tileEl.classList.add('yd-tile--widget');
        // 为特定组件打标，便于在主屏上做差异化样式（阴影/圆角等）
        if (p.id) {
          tileOuterEl.dataset.widgetId = p.id;
          tileOuterEl.classList.add(`yd-widget--${p.id}`);
          tileEl.dataset.widgetId = p.id;
        }
        // 所有组件都使用透明背景，不再需要特殊标记
        const iframe = document.createElement('iframe');
        iframe.className = 'yd-widget-iframe';
        iframe.setAttribute('title', p.id);
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.srcdoc = this.getWidgetSrcDoc(p.id);
        iframe.addEventListener('load', () => {
          // 时间组件：沿用旧版更新逻辑
          if (p.id === 'widget-time-date') {
            // 先记录 iframe 再发送消息，避免首次更新丢失
            this.widgetIframe = iframe;
            this.sendWidgetUpdate();
            // 再尝试把背景图同步进去（需要从 IndexedDB 读取）
            this.loadTimeDateBackground();
          }
          // 其余组件：加载后同步对应的资源数据
          this.widgetIframes[p.id] = iframe;
          this.sendWidgetData(p.id);
          // 相片组件：加载后从 IndexedDB 读取图片并更新
          if (p.id === 'widget-note') {
            setTimeout(async () => {
              try {
                const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_NOTE_STYLE);
                if (!raw || typeof raw !== 'object') return;
                
                const images = { image1: '', image2: '' };
                
                if (raw.image1AlbumId && Storage && Storage.db) {
                  try {
                    const item = await Storage.dbGet('album', raw.image1AlbumId);
                    if (item && item.data) {
                      images.image1 = item.data;
                    }
                  } catch (e) {
                    console.error('[widget-note] iframe load 后从 IndexedDB 读取 image1 失败:', e);
                  }
                } else if (raw.image1 && typeof raw.image1 === 'string') {
                  images.image1 = raw.image1;
                }
                
                if (raw.image2AlbumId && Storage && Storage.db) {
                  try {
                    const item = await Storage.dbGet('album', raw.image2AlbumId);
                    if (item && item.data) {
                      images.image2 = item.data;
                    }
                  } catch (e) {
                    console.error('[widget-note] iframe load 后从 IndexedDB 读取 image2 失败:', e);
                  }
                } else if (raw.image2 && typeof raw.image2 === 'string') {
                  images.image2 = raw.image2;
                }
                
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage(
                    { type: 'yd-widget-note-images', payload: images },
                    '*'
                  );
                  console.log('[widget-note] iframe load 后从 IndexedDB 读取图片并发送', {
                    hasImage1: !!images.image1,
                    hasImage2: !!images.image2,
                    image1Length: images.image1 ? images.image1.length : 0,
                    image2Length: images.image2 ? images.image2.length : 0
                  });
                }
              } catch (e) {
                console.error('[widget-note] iframe load 后处理失败:', e);
              }
            }, 100);
          }
          
          // 播放器组件：加载后立即同步当前播放状态和样式（需要异步读取 IndexedDB）
          if (p.id === 'widget-player') {
            setTimeout(async () => {
              try {
                // 读取预设图片（可能存储在 IndexedDB）
                let presetImage = '';
                const style = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE) || {};
                if (style.presetImageAlbumId && Storage && Storage.db) {
                  try {
                    const item = await Storage.dbGet('album', style.presetImageAlbumId);
                    if (item && item.data) {
                      presetImage = item.data;
                      console.log('iframe load 后从 IndexedDB 读取预设图片，长度:', presetImage.length);
                    }
                  } catch (e) {
                    console.error('从 IndexedDB 读取预设图片失败:', e);
                  }
                } else if (style.presetImage && typeof style.presetImage === 'string') {
                  presetImage = style.presetImage;
                }
                
                if (typeof Music !== 'undefined' && Music._syncPlayerWidget) {
                  // 先更新预设图片，再同步播放状态
                  const currentState = {
                    hasTrack: Music._currentTrack ? true : false,
                    title: (Music._currentTrack && Music._currentTrack.title) || '未在播放',
                    artist: (Music._currentTrack && Music._currentTrack.artist) || '',
                    coverDataUrl: (Music._currentTrack && Music._currentTrack.coverDataUrl) || '',
                    duration: (Music._audio && Music._audio.duration) || 0,
                    currentTime: (Music._audio && Music._audio.currentTime) || 0,
                    isPlaying: (Music._audio && !Music._audio.paused) || false,
                    lyricLine: Music._lastLyricLine || '',
                    presetImage: presetImage
                  };
                  this.updatePlayerWidget(currentState);
                } else {
                  // 如果没有音乐模块，至少发送预设图片状态
                  this.updatePlayerWidget({
                    hasTrack: false,
                    title: '未在播放',
                    artist: '',
                    coverDataUrl: '',
                    duration: 0,
                    currentTime: 0,
                    isPlaying: false,
                    lyricLine: '',
                    presetImage: presetImage
                  });
                }
              } catch (e) {
                console.error('同步播放器预设图片失败:', e);
              }
            }, 100);
          }
        });
        tileEl.appendChild(iframe);
      } else if (p.kind === 'icon') {
        tileEl.appendChild(this.createIconElement(p.icon, p.index));
      }

      tileOuterEl.appendChild(tileEl);
      gridEl.appendChild(tileOuterEl);
    });

    // 重新排版后，恢复到上次停留的页（避免返回主屏跳到第一页）
    const pageWidth = pagesEl.clientWidth || 1;
    const maxIdx = Math.max(0, pageCount - 1);
    const idx = Math.max(0, Math.min(maxIdx, this._lastPageIndex || 0));
    pagesEl.scrollLeft = idx * pageWidth;
    this.updatePagerDots();
    // 网格重建后，尽可能把已有数据同步给所有 widget
    this.syncAllWidgetIframes();
  },

  // 创建单个图标元素（用于 tile 内）
  createIconElement(icon, index) {
    const iconEl = document.createElement('div');
    iconEl.className = 'yd-icon';

    if (icon.size === 'large') {
      iconEl.classList.add('yd-icon--large');
    }

    iconEl.dataset.index = index;
    iconEl.dataset.page = icon.page;

    // 读取图标样式：单图标覆盖与全局设置合并（上传自定义图后仍保留全局的 labelColor 等）
    let style = null;
    let perIconStyle = null;
    let globalStyle = null;
    try {
      const iconStyles = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
      perIconStyle = icon && icon.id ? iconStyles[icon.id] : null;
      globalStyle = iconStyles && iconStyles.__global__ ? iconStyles.__global__ : null;
      style =
        globalStyle || perIconStyle
          ? { ...(globalStyle || {}), ...(perIconStyle || {}) }
          : null;
    } catch (e) {
      console.error('读取图标样式失败:', e);
    }

    const finalLabel = icon.label;
    const hasCustomImage = !!(perIconStyle && perIconStyle.imageData);
    const finalImage = hasCustomImage ? perIconStyle.imageData : icon.image;

    let iconContent = '';
    if (finalImage) {
      iconContent = `<img src="${finalImage}" alt="${finalLabel || icon.id || ''}">`;
    } else if (icon.type === 'svg' && icon.svg) {
      iconContent = icon.svg;
    } else if (icon.type === 'emoji' && icon.emoji) {
      iconContent = `<span class="emoji">${icon.emoji}</span>`;
    } else if (icon.emoji) {
      iconContent = `<span class="emoji">${icon.emoji}</span>`;
    }

    iconEl.innerHTML = `
      <div class="yd-icon__img">${iconContent}</div>
      <div class="yd-icon__label">${finalLabel}</div>
    `;

    // 应用美化设置中的图标样式覆盖（背景渐变 / 透明度 / 图案颜色）
    try {
      if (style) {
        const imgEl = iconEl.querySelector('.yd-icon__img');
        if (imgEl) {
          // 上传图片作为图标时：不再叠加背景色（只保留透明度控制）
          if (hasCustomImage) {
            imgEl.classList.add('yd-icon__img--custom-image');
            imgEl.style.background = 'transparent';
          } else if (style.bgStart && style.bgEnd) {
            imgEl.style.background = `linear-gradient(135deg, ${style.bgStart} 0%, ${style.bgEnd} 100%)`;
          }
          if (typeof style.opacity === 'number') {
            imgEl.style.opacity = String(style.opacity);
          }
          if (!hasCustomImage && style.fgColor) {
            imgEl.style.color = style.fgColor;
          }
        }
        const labelEl = iconEl.querySelector('.yd-icon__label');
        if (labelEl) {
          const lc = style.labelColor || '#000000';
          labelEl.style.color = lc;
        }
      }
    } catch (e) {
      console.error('应用图标样式失败:', e);
    }

    iconEl.addEventListener('click', () => {
      this.openIconTarget(icon);
    });

    return iconEl;
  },
  
  // 渲染Dock
  renderDock() {
    const dock = document.getElementById('dock');
    if (!dock) return;
    dock.innerHTML = '';

    const dockKey = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.HOMESCREEN_DOCK) || 'homescreen_dock';
    const dockDefault = (CONFIG && CONFIG.DEFAULT_HOMESCREEN_DOCK) || 'show';
    const dockMode = String(Storage.get(dockKey) || dockDefault).trim();
    const pageHs = document.getElementById('page-homescreen');
    if (dockMode === 'hide') {
      dock.style.display = 'none';
      if (pageHs) pageHs.classList.add('yd-homescreen--dock-hidden');
      return;
    }
    dock.style.display = '';
    if (pageHs) pageHs.classList.remove('yd-homescreen--dock-hidden');
    
    // Dock：聊天、朋友圈、论坛 + 相机（最右原为直播，改为相机）
    const firstThree = (CONFIG.DEFAULT_ICONS || []).slice(0, 3);
    const cameraIcon = (CONFIG.DEFAULT_ICONS || []).find((it) => it && it.id === 'camera');
    const dockIcons = cameraIcon ? [...firstThree, cameraIcon] : (CONFIG.DEFAULT_ICONS || []).slice(0, 4);
    
    dockIcons.forEach(icon => {
      const iconEl = document.createElement('div');
      iconEl.className = 'yd-icon';
      iconEl.dataset.page = icon.page;
      
      // 读取图标样式：全局 + 单图标合并（与桌面图标一致）
      let style = null;
      let perIconStyle = null;
      let globalStyle = null;
      try {
        const iconStyles = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
        perIconStyle = icon && icon.id ? iconStyles[icon.id] : null;
        globalStyle = iconStyles && iconStyles.__global__ ? iconStyles.__global__ : null;
        style =
          globalStyle || perIconStyle
            ? { ...(globalStyle || {}), ...(perIconStyle || {}) }
            : null;
      } catch (e) {
        console.error('读取 Dock 图标样式失败:', e);
      }

      const finalLabel = icon.label;
      const hasCustomImage = !!(perIconStyle && perIconStyle.imageData);
      const finalImage = hasCustomImage ? perIconStyle.imageData : icon.image;

      // 根据图标类型渲染不同内容
      let iconContent = '';
      if (finalImage) {
        iconContent = `<img src="${finalImage}" alt="${finalLabel || icon.id || ''}">`;
      } else if (icon.type === 'svg' && icon.svg) {
        iconContent = icon.svg;
      } else if (icon.type === 'emoji' && icon.emoji) {
        iconContent = `<span class="emoji">${icon.emoji}</span>`;
      } else if (icon.type === 'image' && icon.image) {
        iconContent = `<img src="${icon.image}" alt="${icon.label}">`;
      } else if (icon.emoji) {
        iconContent = `<span class="emoji">${icon.emoji}</span>`;
      }
      
      iconEl.innerHTML = `
        <div class="yd-icon__img">${iconContent}</div>
      `;

      // Dock 中同样应用图标样式覆盖（背景 / 透明度 / 图案颜色）
      try {
        if (style) {
          const imgEl = iconEl.querySelector('.yd-icon__img');
          if (imgEl) {
            if (hasCustomImage) {
              imgEl.classList.add('yd-icon__img--custom-image');
              imgEl.style.background = 'transparent';
            } else if (style.bgStart && style.bgEnd) {
              imgEl.style.background = `linear-gradient(135deg, ${style.bgStart} 0%, ${style.bgEnd} 100%)`;
            }
            if (typeof style.opacity === 'number') {
              imgEl.style.opacity = String(style.opacity);
            }
            if (!hasCustomImage && style.fgColor) {
              imgEl.style.color = style.fgColor;
            }
          }
        }
      } catch (e) {
        console.error('应用 Dock 图标样式失败:', e);
      }
      
      iconEl.addEventListener('click', () => {
        this.openIconTarget(icon);
      });
      
      dock.appendChild(iconEl);
    });
  },
  
  // 设置分页滚动与指示点
  setupPager() {
    if (this._pagerBound) {
      this.updatePagerDots();
      return;
    }

    const pagesEl = document.getElementById('homescreen-pages');
    if (!pagesEl) return;

    pagesEl.addEventListener('scroll', () => {
      if (this._pagerRaf) return;
      this._pagerRaf = window.requestAnimationFrame(() => {
        this._pagerRaf = 0;
        this.updatePagerDots();
      });
    }, { passive: true });

    this._pagerBound = true;
    this.updatePagerDots();
  },

  updatePagerDots() {
    const pagesEl = document.getElementById('homescreen-pages');
    const dotsEl = document.getElementById('homescreen-dots');
    if (!pagesEl || !dotsEl) return;
    const pageWidth = pagesEl.clientWidth || 1;
    const idx = Math.round(pagesEl.scrollLeft / pageWidth);
    // 记录当前页，便于返回主屏恢复
    this._lastPageIndex = Math.max(0, idx);
    try { Storage.set('homescreen_page_index', this._lastPageIndex); } catch (e) {}
    const dots = Array.from(dotsEl.children);
    dots.forEach((d, i) => {
      d.classList.toggle('yd-homescreen-dot--active', i === idx);
    });
  },
  
  // 加载壁纸（从相册引用，兼容旧版本的直接存Base64字符串）
  async loadWallpaper() {
    const wallpaper = Storage.get(CONFIG.STORAGE_KEYS.WALLPAPER);
    const el = document.getElementById('wallpaper');
    if (!el) return;
    el.style.backgroundImage = '';
    if (!wallpaper) return;

    // 旧版本：直接把 Base64 存在 localStorage 里（可能导致 QuotaExceeded）
    if (typeof wallpaper === 'string') {
      // 如果是 dataURL，则尝试迁移到相册（IndexedDB），只存引用，减小 localStorage 体积
      if (wallpaper.startsWith('data:image/')) {
        try {
          const item = {
            id: State.generateId(),
            data: wallpaper,
            name: '壁纸',
            createdAt: Date.now()
          };
          await Storage.dbAdd('album', item);
          Storage.set(CONFIG.STORAGE_KEYS.WALLPAPER, { albumId: item.id });
          el.style.backgroundImage = `url(${item.data})`;
          return;
        } catch (e) {
          console.error('迁移旧壁纸到相册失败:', e);
          // 迁移失败时，至少先把原有壁纸显示出来
          el.style.backgroundImage = `url(${wallpaper})`;
          return;
        }
      }

      // 不是 dataURL，按旧逻辑直接使用
      el.style.backgroundImage = `url(${wallpaper})`;
      return;
    }

    // 新版本：只在 localStorage 里存相册图片的 id
    if (wallpaper && wallpaper.albumId) {
      try {
        const item = await Storage.dbGet('album', wallpaper.albumId);
        if (item && item.data) {
          el.style.backgroundImage = `url(${item.data})`;
        }
      } catch (e) {
        console.error('加载壁纸失败:', e);
      }
    }
  },
  
  // 设置壁纸：图片数据存入相册，只在 localStorage 中保存引用，避免超出配额
  async setWallpaper(imageData, albumId) {
    const el = document.getElementById('wallpaper');
    if (el && imageData) {
      el.style.backgroundImage = `url(${imageData})`;
    }

    try {
      let id = albumId;

      // 如果没有传入相册ID，则自动写入相册作为一条记录
      if (!id && imageData) {
        const item = {
          id: State.generateId(),
          data: imageData,
          name: '壁纸',
          createdAt: Date.now()
        };
        await Storage.dbAdd('album', item);
        id = item.id;
      }

      if (id) {
        Storage.set(CONFIG.STORAGE_KEYS.WALLPAPER, { albumId: id });
        // 壁纸变化：下次进入主屏需要刷新（避免强制立即全量重渲染）
        try { if (State && State.markHomescreenDirty) State.markHomescreenDirty(); } catch (e) {}
      }
    } catch (e) {
      console.error('保存壁纸失败:', e);
    }
  },
  
  // 更新Widget
  updateWidget() {
    const now = new Date();
    
    // 时间
    const timeStr = now.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    // 日期
    const dateStr = now.toLocaleDateString('zh-CN', { 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });

    this.widgetData = {
      time: timeStr,
      date: dateStr,
      weather: '',
      bgImage: this.widgetData && this.widgetData.bgImage ? this.widgetData.bgImage : '',
      bgBlur: (this.widgetData && typeof this.widgetData.bgBlur !== 'undefined') ? this.widgetData.bgBlur : 0,
      bgAlpha: (this.widgetData && typeof this.widgetData.bgAlpha !== 'undefined') ? this.widgetData.bgAlpha : 0,
      align: this.widgetData && this.widgetData.align ? this.widgetData.align : 'center'
    };

    this.sendWidgetUpdate();
  },

  // 时间日期组件：加载背景图（从相册引用），并同步到 iframe
  async loadTimeDateBackground() {
    try {
      let albumId = '';
      let bgBlur = 0;
      let bgAlpha = 0;
      let align = 'center';
      try {
        const style = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE) || null;
        if (style && typeof style.bgImageAlbumId === 'string') {
          albumId = style.bgImageAlbumId;
        }
        bgBlur = Math.max(0, Math.min(30, parseInt(style && style.bgBlur, 10) || 0));
        bgAlpha = Math.max(0, Math.min(100, parseInt(style && style.bgAlpha, 10) || 0));
        align = (style && (style.align === 'left' || style.align === 'center' || style.align === 'right')) ? style.align : 'center';
      } catch (e) {}
      if (!albumId || !Storage || !Storage.db) {
        // 清空背景
        if (this.widgetData) this.widgetData.bgImage = '';
        if (this.widgetData) this.widgetData.bgBlur = bgBlur;
        if (this.widgetData) this.widgetData.bgAlpha = bgAlpha;
        if (this.widgetData) this.widgetData.align = align;
        this.sendWidgetUpdate();
        return;
      }
      const item = await Storage.dbGet('album', albumId);
      const dataUrl = item && item.data ? item.data : '';
      if (!this.widgetData) this.widgetData = {};
      this.widgetData.bgImage = dataUrl || '';
      this.widgetData.bgBlur = bgBlur;
      this.widgetData.bgAlpha = bgAlpha;
      this.widgetData.align = align;
      this.sendWidgetUpdate();
    } catch (e) {
      console.error('[widget-time-date] 加载背景图失败:', e);
    }
  },

  _fetchWithTimeout(url, ms = 6000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl
      ? setTimeout(() => {
          try {
            ctrl.abort();
          } catch (e) {}
        }, ms)
      : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).finally(() => {
      if (timer) clearTimeout(timer);
    });
  },

  // 确保“时间日期”组件选中的字体已缓存在 IndexedDB（离线可用）
  async ensureFontCached() {
    const CDN_NPM_BASES = [
      // 国内镜像优先（更快/更稳定）
      'https://cdn.jsdmirror.com/npm/',
      'https://jsd.onmicrosoft.cn/npm/',
      // 原站兜底
      'https://cdn.jsdelivr.net/npm/'
    ];

    const fontMap = {
      system: { family: 'System', weight: null, filePath: null, kind: 'system' },
      nunito: { family: 'Nunito', weight: null, filePath: '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2', kind: 'variable' },
      rubik: { family: 'Rubik', weight: null, filePath: '@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2', kind: 'variable' },
      quicksand: { family: 'Quicksand', weight: null, filePath: '@fontsource-variable/quicksand/files/quicksand-latin-wght-normal.woff2', kind: 'variable' },
      comfortaa: { family: 'Comfortaa', weight: null, filePath: '@fontsource-variable/comfortaa/files/comfortaa-latin-wght-normal.woff2', kind: 'variable' },
      'baloo-2': { family: 'Baloo 2', weight: 700, filePath: '@fontsource/baloo-2/files/baloo-2-latin-700-normal.woff2', kind: 'static' },
      fredoka: { family: 'Fredoka', weight: 600, filePath: '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2', kind: 'static' },
      'press-start-2p': { family: 'Press Start 2P', weight: 400, filePath: '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2', kind: 'static' }
    };

    let choice = 'press-start-2p';
    try {
      const style = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE) || null;
      if (style && typeof style.font === 'string' && style.font) choice = style.font;
    } catch (e) {}

    const f = fontMap[choice] || fontMap.system;
    const FONT_ID = `timeDateFont:${choice}`;
    if (this._cachedFont && this._cachedFont.id === choice && this._cachedFont.dataUrl) return;
    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    try {
      if (Storage && Storage.db) {
        const blob = await Storage.fontCacheGet(FONT_ID);
        if (blob) {
          const dataUrl = await blobToDataUrl(blob);
          this._cachedFont = { id: choice, family: f.family, weight: f.weight, dataUrl, url: f.url };
          return;
        }
      }
      if (!f.filePath) return;
      // 直接从 CDN 拉取 woff2：国内镜像优先
      const fontCandidates = [
        ...CDN_NPM_BASES.map(base => base + f.filePath),
        // 备用：unpkg
        'https://unpkg.com/' + f.filePath
      ];
      for (const url of fontCandidates) {
        try {
          const res = await this._fetchWithTimeout(url, 6000);
          if (!res.ok) continue;
          const blob = await res.blob();
          if (Storage && Storage.db) await Storage.fontCacheSet(FONT_ID, blob);
          const dataUrl = await blobToDataUrl(blob);
          this._cachedFont = { id: choice, family: f.family, weight: f.weight, dataUrl, url };
          break;
        } catch (e) {
          // try next
        }
      }
    } catch (e) {
      console.warn('字体缓存失败，将使用网络加载:', e);
    }
  },

  // 加载所有 widget 资源并同步到 iframe（从 IndexedDB 读取）
  async loadAndSyncWidgets() {
    if (!Storage || !Storage.db) return;
    try {
      const all = await Storage.dbGetAll('widgetResources');
      // 预读取相册数据，用于解析图片型资源（通过 albumId 引用）
      let albumMap = null;
      const albumIdSet = new Set((all || [])
        .filter((item) => item && item.kind === 'image' && item.albumId)
        .map((item) => String(item.albumId)));

      if (albumIdSet.size > 0) {
        albumMap = {};
        const albumAll = await Storage.dbGetAll('album');
        (albumAll || []).forEach((pic) => {
          if (pic && pic.id) albumMap[String(pic.id)] = pic;
        });

        // 兜底：当 albumAll 未命中某些 albumId 时，再逐个 dbGet 一次
        // 目的：避免某些导入/初始化时序下，图片引用解析失败导致“头像卡片丢样式”。
        const missing = [];
        albumIdSet.forEach((id) => {
          if (!albumMap || !albumMap[id]) missing.push(id);
        });
        if (missing.length) {
          await Promise.all(missing.map(async (id) => {
            try {
              const item = await Storage.dbGet('album', id);
              if (item && item.id) albumMap[String(item.id)] = item;
            } catch (e) {}
          }));
        }
      }
      const map = {};
      (all || []).forEach(item => {
        if (!item || !item.widgetId) return;
        // 将图片资源解析为可直接使用的 imageData（避免在 HTML 里写死图片）
        if (item.kind === 'image' && item.albumId && albumMap) {
          const albumId = String(item.albumId);
          if (albumMap[albumId]) {
            item.imageData = albumMap[albumId].data || null;
          }
        }
        const wid = String(item.widgetId);
        if (!map[wid]) map[wid] = [];
        map[wid].push(item);
      });
      this.widgetResourceMap = map;
      this.syncAllWidgetIframes();
    } catch (e) {
      console.error('加载 widget 资源失败:', e);
    }
  },

  // 向指定 widget iframe 发送资源数据
  sendWidgetData(widgetId) {
    if (!widgetId) return;
    const iframe = this.widgetIframes && this.widgetIframes[widgetId];
    if (!iframe || !iframe.contentWindow) return;
    const resources = (this.widgetResourceMap && this.widgetResourceMap[widgetId]) || [];
    iframe.contentWindow.postMessage(
      { type: 'yd-widget-data', widgetId, resources },
      '*'
    );
  },

  // 播放器组件：由 Music 模块调用，将当前播放状态同步到桌面播放器 widget
  async updatePlayerWidget(state) {
    try {
      const iframe = this.widgetIframes && this.widgetIframes['widget-player'];
      if (!iframe || !iframe.contentWindow) return;
      // 读取播放器样式（目前主要是预设封面图片）
      let presetImage = '';
      try {
        const style = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE) || {};
        // 如果存储的是 albumId，则从 IndexedDB 读取图片数据
        if (style.presetImageAlbumId && Storage && Storage.db) {
          try {
            const item = await Storage.dbGet('album', style.presetImageAlbumId);
            if (item && item.data) {
              presetImage = item.data;
            }
          } catch (e) {
            console.error('从 IndexedDB 读取预设图片失败:', e);
          }
        } else if (style.presetImage && typeof style.presetImage === 'string') {
          presetImage = style.presetImage;
        }
      } catch (e) {
        console.error('读取播放器样式失败:', e);
      }
      const payload = {
        ...(state || {}),
        presetImage: presetImage || (state && state.presetImage) || ''
      };
      iframe.contentWindow.postMessage(
        { type: 'yd-widget-player-state', payload },
        '*'
      );
    } catch (e) {
      console.error('同步播放器组件状态失败:', e);
    }
  },

  // 遍历所有 widget iframe，同步各自资源
  syncAllWidgetIframes() {
    if (!this.widgetIframes || !this.widgetResourceMap) return;
    Object.keys(this.widgetIframes).forEach((widgetId) => {
      this.sendWidgetData(widgetId);
    });
  },

  // iframe widget 的 srcdoc（内嵌 HTML 组件）
  getWidgetSrcDoc(widgetId) {
    // 时间日期 / 相片组件：始终使用内置模板，忽略自定义 HTML，保证样式页能完全控制
    if (widgetId === 'widget-time-date') return this.getTimeDateWidgetSrcDoc();
    if (widgetId === 'widget-note') return this.getNoteWidgetSrcDoc();
    if (widgetId === 'widget-photo-card') return this.getPhotoCardWidgetSrcDoc();
    if (widgetId === 'widget-photo-circle') return this.getPhotoCircleWidgetSrcDoc();
    if (widgetId === 'widget-date-card') return this.getDateCardWidgetSrcDoc();

    // 优先使用美化设置中自定义的组件 HTML
    try {
      const htmlMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HTML) || {};
      const custom = widgetId && htmlMap && htmlMap[widgetId];
      if (typeof custom === 'string' && custom.trim()) {
        return custom;
      }
    } catch (e) {
      console.error('读取自定义组件HTML失败:', e);
    }

    if (widgetId === 'widget-player') {
      // 注意：getPlayerWidgetSrcDoc 现在是异步的，但这里需要同步返回
      // 先返回一个占位，然后通过 postMessage 更新
      return this.getPlayerWidgetSrcDocSync();
    }
    if (widgetId === 'widget-profile-card') return this.getHotnewsWidgetSrcDoc();
    return this.getDemoWidgetSrcDoc(widgetId);
  },

  // 时间日期：透明背景 + 字体更大（由 tile 控制“隐形背景”）
  getTimeDateWidgetSrcDoc(overrideStyle) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    const timeHtml = Array.from(timeStr).slice(0, 5).map((c, idx) => `<span class="digit digit-${idx + 1}">${c}</span>`).join('');

    // 可配置样式（由“时间日期样式”专属页面写入）
    let style = null;
    if (overrideStyle && typeof overrideStyle === 'object') {
      style = overrideStyle;
    } else {
      try {
        style = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE) || null;
      } catch (e) {}
    }
    const fontChoice = (style && typeof style.font === 'string' && style.font) ? style.font : 'system';
    const align = (style && typeof style.align === 'string' && style.align) ? style.align : 'center';
    const timeSize = Math.max(10, parseInt(style && style.timeSize, 10) || 60);
    const timeWeight = Math.max(100, parseInt(style && style.timeWeight, 10) || 800);
    const dateSize = Math.max(8, parseInt(style && style.dateSize, 10) || 16);
    const dateWeight = Math.max(100, parseInt(style && style.dateWeight, 10) || 800);
    const dateColor = (style && typeof style.dateColor === 'string' && style.dateColor) ? style.dateColor : '#a8e9ff';
    const bgImage = (style && typeof style.bgImage === 'string' && style.bgImage.startsWith('data:image/'))
      ? style.bgImage
      : '';
    const bgBlur = Math.max(0, Math.min(30, parseInt(style && style.bgBlur, 10) || 0));
    const bgAlphaPct = Math.max(0, Math.min(100, parseInt(style && style.bgAlpha, 10) || 0));
    const bgAlpha = (bgAlphaPct / 100) * 0.55;
    const bgUrlCss = bgImage ? `url(${bgImage})` : 'none';
    const timeColors = Array.isArray(style && style.timeColors) ? style.timeColors : null;
    const c1 = (timeColors && timeColors[0]) ? timeColors[0] : '#afc8f8';
    const c2 = (timeColors && timeColors[1]) ? timeColors[1] : '#b3f2ab';
    const c3 = (timeColors && timeColors[2]) ? timeColors[2] : '#ffd1d1';
    const c4 = (timeColors && timeColors[3]) ? timeColors[3] : '#c2c9ff';
    const c5 = (timeColors && timeColors[4]) ? timeColors[4] : '#ffd4a3';

    // 字体来源（CDN + IndexedDB 缓存 dataURL）
    const CDN_NPM_BASE = 'https://cdn.jsdmirror.com/npm/';
    const fontMap = {
      system: { family: 'System', cssFamily: `-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`, weight: null, filePath: null, kind: 'system' },
      nunito: { family: 'Nunito', cssFamily: `'Nunito'`, weight: null, filePath: '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2', kind: 'variable' },
      rubik: { family: 'Rubik', cssFamily: `'Rubik'`, weight: null, filePath: '@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2', kind: 'variable' },
      quicksand: { family: 'Quicksand', cssFamily: `'Quicksand'`, weight: null, filePath: '@fontsource-variable/quicksand/files/quicksand-latin-wght-normal.woff2', kind: 'variable' },
      comfortaa: { family: 'Comfortaa', cssFamily: `'Comfortaa'`, weight: null, filePath: '@fontsource-variable/comfortaa/files/comfortaa-latin-wght-normal.woff2', kind: 'variable' },
      'baloo-2': { family: 'Baloo 2', cssFamily: `'Baloo 2'`, weight: 700, filePath: '@fontsource/baloo-2/files/baloo-2-latin-700-normal.woff2', kind: 'static' },
      fredoka: { family: 'Fredoka', cssFamily: `'Fredoka'`, weight: 600, filePath: '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2', kind: 'static' },
      'press-start-2p': { family: 'Press Start 2P', cssFamily: `'Press Start 2P'`, weight: 400, filePath: '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2', kind: 'static' }
    };
    const f = fontMap[fontChoice] || fontMap.system;
    const cached = (this._cachedFont && this._cachedFont.id === fontChoice) ? this._cachedFont.dataUrl : null;
    const fontUrl = f.filePath ? (CDN_NPM_BASE + f.filePath) : null;
    const fontCss = (f.kind === 'system')
      ? ''
      : (cached
        ? `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.kind === 'static' ? f.weight : '100 900'};src:url(${cached}) format('woff2');}`
        : `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.kind === 'static' ? f.weight : '100 900'};src:url(${fontUrl}) format('woff2');}`);
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    /* 字体：系统字体为默认；选择艺术字体时会加载并缓存 */
    ${fontCss}
    :root{ color-scheme: light; }
    *{ box-sizing:border-box; }
    html,body{
      height:100%;
      width:100%;
      margin:0;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow:hidden;
    }
    body{ -ms-overflow-style: none; scrollbar-width: none; }
    body::-webkit-scrollbar{ display:none; }
    .wrap{
      height:100%;
      width:100%;
      /* 让日期/时间离边缘更远一点 */
      padding: 12px 12px;
      display:flex;
      flex-direction:column;
      justify-content:center;
      align-items:stretch;
      background: transparent;
      color:#0b0b0b;
      text-shadow: 0 8px 20px rgba(0,0,0,0.12);
      text-align:center;
      position: relative;
      --bg-url: ${bgUrlCss};
      --bg-blur: ${bgBlur}px;
      --bg-alpha: ${bgAlpha.toFixed(3)};
    }
    .wrap::before{
      content:'';
      position:absolute;
      inset:0;
      background-image: var(--bg-url, none);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      filter: blur(var(--bg-blur, 0px));
      transform: scale(1.08);
      pointer-events:none;
      z-index:0;
    }
    .wrap::after{
      content:'';
      position:absolute;
      inset:0;
      background: rgba(0,0,0,var(--bg-alpha, 0));
      pointer-events:none;
      z-index:0;
    }
    .wrap > *{ position:relative; z-index:1; }
    .pos{
      width:100%;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      text-align:center;
      padding: 0 4px;
    }
    .wrap.align-left .pos{
      width:50%;
      margin-right:auto;
      align-items:flex-start;
      text-align:left;
    }
    .wrap.align-right .pos{
      width:50%;
      margin-left:auto;
      align-items:flex-end;
      text-align:right;
    }
    .time{
      font-family: ${f.kind === 'system' ? f.cssFamily : `${f.cssFamily}, -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`};
      font-weight: ${timeWeight};
      font-size: ${timeSize}px;
      letter-spacing: -1px;
      line-height: 1.05;
      display: inline-flex;
      justify-content: center;
    }
    .time .digit{
      display:inline-block;
      min-width: 0.85em;
      text-align:center;
    }
    .time .digit-1{ color:${c1}; }
    .time .digit-2{ color:${c2}; }
    .time .digit-3{ color:${c3}; }
    .time .digit-4{ color:${c4}; }
    .time .digit-5{ color:${c5}; }
    .date{
      margin-top: 6px;
      font-size: ${dateSize}px;
      font-weight: ${dateWeight};
      opacity: 0.9;
      color: ${dateColor};
    }
    .weather{
      margin-top: 6px;
      font-size: 13px;
      opacity: 0.75;
    }
  </style>
</head>
<body>
  <div class="wrap align-${align}">
    <div class="pos">
      <div class="time" id="t">${timeHtml}</div>
      <div class="date" id="d">${dateStr}</div>
      <div class="weather" id="w"></div>
    </div>
  </div>
  <script>
    function apply(data){
      if(!data) return;
      var wrap = document.querySelector('.wrap');
      function clamp(v, min, max){ return v < min ? min : (v > max ? max : v); }
      if (wrap) {
        if(typeof data.bgImage === 'string'){
          var u = data.bgImage && data.bgImage.trim() ? ('url(' + data.bgImage + ')') : 'none';
          wrap.style.setProperty('--bg-url', u);
        }
        if(typeof data.bgBlur !== 'undefined'){
          var b = parseInt(data.bgBlur, 10);
          if (!isFinite(b)) b = 0;
          b = clamp(b, 0, 30);
          wrap.style.setProperty('--bg-blur', b + 'px');
        }
        if(typeof data.bgAlpha !== 'undefined'){
          var aPct = parseInt(data.bgAlpha, 10);
          if (!isFinite(aPct)) aPct = 0;
          aPct = clamp(aPct, 0, 100);
          // 与样式页一致：0-100% 映射到 0-0.55
          var a = (aPct / 100) * 0.55;
          wrap.style.setProperty('--bg-alpha', String(a));
        }
      }
      if(typeof data.time === 'string'){
        var tEl = document.getElementById('t');
        var t = data.time;
        tEl.innerHTML = '';
        for (var i = 0; i < Math.min(5, t.length); i++) {
          var span = document.createElement('span');
          span.textContent = t.charAt(i);
          span.className = 'digit digit-' + (i + 1);
          tEl.appendChild(span);
        }
      }
      if(typeof data.date === 'string') document.getElementById('d').textContent = data.date;
      if(typeof data.weather === 'string') document.getElementById('w').textContent = data.weather;

      if(typeof data.align === 'string'){
        if (wrap) {
          wrap.classList.remove('align-left', 'align-center', 'align-right');
          var a = data.align;
          if (a !== 'left' && a !== 'center' && a !== 'right') a = 'center';
          wrap.classList.add('align-' + a);
        }
      }
    }
    window.addEventListener('message', function(ev){
      var msg = ev && ev.data;
      if(!msg || msg.type !== 'yd-widget-update') return;
      apply(msg.payload);
    });
  <\/script>
</body>
</html>`;
  },

  // 播放器组件：2x2 方形，磨砂背景 + 封面裁剪 + 控件 + 歌词
  // 说明：
  // - 实际播放逻辑完全由主应用的 Music 模块负责，本组件只做展示和控制信号发送
  // - 父页面通过 Homescreen.updatePlayerWidget(state) 将当前歌曲信息同步进来
  // - state 结构示例：
  //   {
  //     hasTrack: true/false,
  //     title: '歌名',
  //     artist: '歌手',
  //     coverDataUrl: 'data:image/..',
  //     duration: 180.2,
  //     currentTime: 23.5,
  //     isPlaying: true/false,
  //     lyricLine: '当前歌词行',
  //     presetImage: 'data:image/..' // 若存在，则优先作为封面与配色来源
  //   }
  // 同步版本：用于 iframe srcdoc（不能异步）
  getPlayerWidgetSrcDocSync(styleOverride) {
    let style = null;
    if (styleOverride && typeof styleOverride === 'object') {
      style = styleOverride;
    } else {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE);
        style = (raw && typeof raw === 'object') ? raw : {};
      } catch (e) {
        style = {};
      }
    }
    if (!style || typeof style !== 'object') {
      style = {};
    }
    // 同步版本：如果有 albumId，先返回空，后续通过 postMessage 更新
    const presetImage = (style && style.presetImage && typeof style.presetImage === 'string' && style.presetImage.trim()) ? style.presetImage.trim() : '';
    const rawBlur = style && style.blurAmount;
    const blurAmount = Math.max(0, Math.min(50, (typeof rawBlur === 'number' ? rawBlur : (parseInt(rawBlur, 10) || 18))));
    const tintColor = (style && typeof style.tintColor === 'string' && style.tintColor) ? style.tintColor : '#ffffff';
    const rawAlpha = style && style.blurAlpha;
    const blurAlpha = (typeof rawAlpha === 'number' ? rawAlpha : 0.75);
    return this._buildPlayerWidgetHtml(presetImage, blurAmount, tintColor, blurAlpha);
  },

  // 异步版本：用于预览等场景，可以读取 IndexedDB
  async getPlayerWidgetSrcDoc(styleOverride) {
    // 允许样式预览页传入草稿样式（例如预设图片），否则从本地存储读取
    let style = null;
    if (styleOverride && typeof styleOverride === 'object') {
      style = styleOverride;
    } else {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE);
        style = (raw && typeof raw === 'object') ? raw : {};
        console.log('getPlayerWidgetSrcDoc 读取样式:', style);
        
        // 如果存储的是 albumId，则从 IndexedDB 读取图片数据
        if (style.presetImageAlbumId && Storage && Storage.db) {
          try {
            const item = await Storage.dbGet('album', style.presetImageAlbumId);
            if (item && item.data) {
              style.presetImage = item.data;
              console.log('从 IndexedDB 读取预设图片，长度:', item.data ? item.data.length : 0);
            } else {
              style.presetImage = '';
            }
          } catch (e) {
            console.error('从 IndexedDB 读取预设图片失败:', e);
            style.presetImage = '';
          }
        } else if (!style.presetImage || typeof style.presetImage !== 'string') {
          // 兼容旧版本：如果没有 presetImageAlbumId，也没有 presetImage，则设为空
          style.presetImage = '';
        }
      } catch (e) {
        console.error('读取播放器样式失败:', e);
        style = {};
      }
    }
    // 确保 style 是对象
    if (!style || typeof style !== 'object') {
      style = {};
    }
    const presetImage = (style && typeof style.presetImage === 'string' && style.presetImage.trim()) ? style.presetImage.trim() : '';
    const rawBlur = style && style.blurAmount;
    const blurAmount = Math.max(0, Math.min(50, (typeof rawBlur === 'number' ? rawBlur : (parseInt(rawBlur, 10) || 18))));
    const tintColor = (style && typeof style.tintColor === 'string' && style.tintColor) ? style.tintColor : '#ffffff';
    const rawAlpha = style && style.blurAlpha;
    const blurAlpha = (typeof rawAlpha === 'number' ? rawAlpha : 0.75);
    console.log('getPlayerWidgetSrcDoc 最终使用的 presetImage 长度:', presetImage ? presetImage.length : 0);
    return this._buildPlayerWidgetHtml(presetImage, blurAmount, tintColor, blurAlpha);
  },

  // 构建播放器组件的 HTML（内部方法）
  _buildPlayerWidgetHtml(presetImage, blurAmount, tintColor, blurAlpha) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{ box-sizing:border-box; }
    html,body{
      height:100%;
      width:100%;
      margin:0;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow:hidden;
    }
    :root{
      color-scheme: light;
      --player-fg-color: ${tintColor || '#ffffff'};
    }
    .wrap{
      height:100%;
      width:100%;
      padding: 8px 8px 4px 8px;
      display:flex;
      flex-direction:column;
      background: transparent;
      border-radius: 18px;
      color: var(--player-fg-color, #ffffff);
      position:relative;
      overflow:hidden;
      backdrop-filter: blur(${blurAmount}px) saturate(180%);
      -webkit-backdrop-filter: blur(${blurAmount}px) saturate(180%);
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      /* 去掉白色细边，避免出现一圈白线 */
      border: none;
    }
    /* 不再叠加任何白色蒙版，完全交给主色 + 毛玻璃来表现 */
    .wrap::before{
      content:'';
      position:absolute;
      inset:0;
      background: transparent;
      pointer-events:none;
      z-index:0;
    }
    .wrap-inner{
      position:relative;
      flex:1;
      min-height:0;
      display:flex;
      flex-direction:column;
      /* 减到几乎没有间距，让封面 + 按钮吃掉更多高度 */
      gap: 2px;
      z-index:2;
    }

    .cover-wrap{
      /* 封面区域占绝对大头：整个组件接近 2/3 高度是封面 */
      flex:2.3;
      min-height:0;
      /* 圆角不要那么圆，收紧一点 */
      border-radius: 10px;
      overflow:hidden;
      position:relative;
      /* 默认纯色底，主色会在 JS 里覆盖，不要任何渐变 */
      background: #c7d7ff;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .cover-img{
      width:100%;
      height:100%;
      object-fit:cover;
      object-position:center;
      display:block;
      transform:scale(1.02);
      transition: transform 0.3s ease, opacity 0.25s ease;
    }
    .cover-empty{
      font-size:26px;
      opacity:0.45;
      display:flex;
      align-items:center;
      justify-content:center;
      width:100%;
      height:100%;
    }
    .cover-wrap.is-paused .cover-img{
      transform:scale(1.02);
    }
    .cover-wrap.is-playing .cover-img{
      transform:scale(1.08) rotate(0.0001deg);
    }

    .info{
      flex-shrink:0;
      display:flex;
      flex-direction:column;
      gap: 1px;
      margin-top: 1px;
      min-height:0;
    }
    .title-row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: 6px;
    }
    .song-title{
      flex:1;
      min-width:0;
      font-size: 11px;
      font-weight: 700;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .song-meta{
      font-size: 8px;
      opacity: 0.7;
      white-space:nowrap;
      max-width:32%;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .progress-row{
      display:flex;
      align-items:center;
      gap: 4px;
      margin-top: 1px;
    }
    .time-text{
      font-size: 8px;
      opacity: 0.7;
      min-width: 22px;
      text-align:center;
    }
    .bar{
      flex:1;
      /* 进度条高度压缩，让位给按钮 */
      height: 3px;
      border-radius: 999px;
      /* 底色用当前前景色的低透明度，整体颜色跟随字体颜色 */
      background: rgba(255,255,255,0.18);
      color: var(--player-fg-color, #ffffff);
      overflow:hidden;
      position:relative;
    }
    .bar-fill{
      position:absolute;
      inset:0;
      width:0%;
      /* 使用 currentColor，随字体/按钮颜色一起变化 */
      background: currentColor;
      border-radius:999px;
      transition: width 0.18s linear;
    }

    .controls-row{
      display:flex;
      align-items:center;
      justify-content:center;
      /* 减小按钮间距，让它们更靠近 */
      gap: 0px !important;
      margin-top: 0;
      padding: 0;
      width: 100%;
    }
    .ctrl-btn{
      /* 上一曲 / 下一曲 按钮明显放大：在 2x2 内占比较大面积 */
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      flex-shrink:0;
      transition: all 0.2s;
      background: transparent;
      color: var(--player-fg-color, #ffffff);
      margin: 0;
      padding: 0;
    }
    .controls-row > .ctrl-btn + .ctrl-btn{
      margin-left: -2px !important;
    }
    .ctrl-btn--play{
      /* 播放按钮和两侧统一尺寸，保持整体一排视觉权重 */
      width: 36px;
      height: 36px;
      background: transparent;
      box-shadow: none;
      margin: 0 !important;
      padding: 0 !important;
    }
    .ctrl-btn svg{
      /* 上一曲 / 下一曲 图标再大一号 */
      width: 22px;
      height: 22px;
      fill: currentColor;
    }
    .ctrl-btn--play svg{
      width: 24px;
      height: 24px;
      fill: currentColor;
    }
    /* 暂停（两条竖线）跟随放大：120% */
    #iconPause{
      transform: scale(1.4);
      transform-origin:30% 28%;
    }
    .ctrl-btn:active{
      transform: scale(0.92);
      opacity:0.8;
    }

    .lyric-row{
      margin-top: 2px;
      flex-shrink:0;
      min-width:0;
      font-size: 10px;
      line-height: 1.4;
      color: var(--player-fg-color, #ffffff);
      height: 1.4em;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      /* 歌词区域整体往右一点，别太贴左边 */
      padding-left: 8px;
      padding-right: 2px;
    }
    .lyric-row.empty{
      opacity:0.5;
    }

    .placeholder{
      font-size: 11px;
      opacity:0.7;
    }
  </style>
</head>
<body>
  <div class="wrap" id="root">
    <div class="wrap-inner">
      <div class="cover-wrap" id="coverWrap">
        <img id="coverImg" class="cover-img" alt="" style="display:none;">
        <div class="cover-empty" id="coverEmpty">🎵</div>
      </div>
      <div class="info">
        <div class="title-row">
          <div class="song-title" id="songTitle">未在播放</div>
          <div class="song-meta" id="songMeta">音乐播放器</div>
        </div>
        <div class="progress-row">
          <div class="time-text" id="timeStart">0:00</div>
          <div class="bar">
            <div class="bar-fill" id="barFill"></div>
          </div>
          <div class="time-text" id="timeRemain">-0:00</div>
        </div>
        <div class="controls-row">
          <button class="ctrl-btn" type="button" id="btnPrev" aria-label="上一曲">
            <svg viewBox="0 0 1024 1024" style="overflow: visible;">
              <!-- 左一颗：镜像并居中显示 -->
              <path d="M819.498667 584.832L343.168 875.904A85.333333 85.333333 0 0 1 213.333333 803.114667V220.885333a85.333333 85.333333 0 0 1 129.834667-72.789333l476.330667 291.072a85.333333 85.333333 0 0 1 0 145.664z"
                    fill="currentColor" transform="translate(320,180) scale(-0.9,0.9) "></path>
              <!-- 左二颗：与左一颗有明显间距，不重叠，完全可见 -->
              <path d="M819.498667 584.832L343.168 875.904A85.333333 85.333333 0 0 1 213.333333 803.114667V220.885333a85.333333 85.333333 0 0 1 129.834667-72.789333l476.330667 291.072a85.333333 85.333333 0 0 1 0 145.664z"
                    fill="currentColor" transform="translate(900,180) scale(-0.9,0.9) "></path>
            </svg>
          </button>
          <button class="ctrl-btn ctrl-btn--play" type="button" id="btnPlay" aria-label="播放/暂停">
            <svg id="iconPlay" viewBox="0 0 1024 1024" style="overflow: visible;">
              <path d="M819.498667 584.832L343.168 875.904A85.333333 85.333333 0 0 1 213.333333 803.114667V220.885333a85.333333 85.333333 0 0 1 129.834667-72.789333l476.330667 291.072a85.333333 85.333333 0 0 1 0 145.664z"
                    fill="currentColor" transform="scale(1.2,1.2)"></path>
            </svg>
            <svg id="iconPause" viewBox="0 0 24 24" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button class="ctrl-btn" type="button" id="btnNext" aria-label="下一曲">
            <svg viewBox="0 0 1024 1024" style="overflow: visible;">
              <!-- 右一颗：居中显示 -->
              <path d="M819.498667 584.832L343.168 875.904A85.333333 85.333333 0 0 1 213.333333 803.114667V220.885333a85.333333 85.333333 0 0 1 129.834667-72.789333l476.330667 291.072a85.333333 85.333333 0 0 1 0 145.664z"
                    fill="currentColor" transform="translate(320,180) scale(0.9,0.9) "></path>
              <!-- 右二颗：与右一颗有明显间距，不重叠，完全可见 -->
              <path d="M819.498667 584.832L343.168 875.904A85.333333 85.333333 0 0 1 213.333333 803.114667V220.885333a85.333333 85.333333 0 0 1 129.834667-72.789333l476.330667 291.072a85.333333 85.333333 0 0 1 0 145.664z"
                    fill="currentColor" transform="translate(900,180) scale(0.9,0.9)"></path>
            </svg>
          </button>
        </div>
        <div class="lyric-row empty" id="lyricRow">
          <span id="lyricText" class="lyric-text">当前暂无歌词</span>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function(){
      var root = document.getElementById('root');
      var coverWrap = document.getElementById('coverWrap');
      var coverImg = document.getElementById('coverImg');
      var coverEmpty = document.getElementById('coverEmpty');
      var titleEl = document.getElementById('songTitle');
      var metaEl = document.getElementById('songMeta');
      var barFill = document.getElementById('barFill');
      var timeStartEl = document.getElementById('timeStart');
      var timeRemainEl = document.getElementById('timeRemain');
      var lyricRow = document.getElementById('lyricRow');
      var lyricTextEl = document.getElementById('lyricText');
      var btnPrev = document.getElementById('btnPrev');
      var btnPlay = document.getElementById('btnPlay');
      var btnNext = document.getElementById('btnNext');
      var iconPlay = document.getElementById('iconPlay');
      var iconPause = document.getElementById('iconPause');

      var lastImage = '';
      var lastBaseColor = '#b8c5e6';
      var PLAYER_TINT_ALPHA = ${typeof blurAlpha === 'number' ? blurAlpha : 0.75};

      function clamp(v, min, max){
        return v < min ? min : (v > max ? max : v);
      }

      function formatTime(sec){
        if (!sec || !isFinite(sec) || sec < 0) return '0:00';
        var s = Math.floor(sec);
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m + ':' + (r < 10 ? '0' + r : r);
      }

      function updatePlayState(isPlaying){
        var playing = !!isPlaying;
        if (playing) {
          iconPlay.style.display = 'none';
          iconPause.style.display = 'block';
          coverWrap.classList.add('is-playing');
          coverWrap.classList.remove('is-paused');
        } else {
          iconPlay.style.display = 'block';
          iconPause.style.display = 'none';
          coverWrap.classList.add('is-paused');
          coverWrap.classList.remove('is-playing');
        }
      }

      function applyColorToBg(rgb){
        if (!rgb) return;
        var r = clamp(rgb[0], 0, 255);
        var g = clamp(rgb[1], 0, 255);
        var b = clamp(rgb[2], 0, 255);
        lastBaseColor = 'rgb(' + r + ',' + g + ',' + b + ')';

        // 整个播放器卡片：直接使用主色，不要任何渐变
        var mainColor = 'rgba(' + r + ',' + g + ',' + b + ',' + PLAYER_TINT_ALPHA + ')';
        root.style.backgroundImage = 'none';
        root.style.backgroundColor = mainColor;

        // 封面容器：同样使用主色纯色，保持色调统一、无渐变
        try {
          if (coverWrap) {
            coverWrap.style.backgroundImage = 'none';
            coverWrap.style.backgroundColor = mainColor;
          }
        } catch (e) {}
      }

      function extractDominantColor(src){
        if (!src || src === lastImage) return;
        lastImage = src;
        try {
          var img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = function(){
            try {
              var canvas = document.createElement('canvas');
              var size = 24;
              canvas.width = size;
              canvas.height = size;
              var ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, size, size);
              var data = ctx.getImageData(0, 0, size, size).data;
              var r = 0, g = 0, b = 0, count = 0;
              for (var i = 0; i < data.length; i += 4) {
                var alpha = data[i + 3];
                if (alpha < 32) continue;
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
              }
              if (!count) return;
              r = Math.round(r / count);
              g = Math.round(g / count);
              b = Math.round(b / count);
              // 提升亮度，避免过暗
              var boost = 0.15;
              r = clamp(Math.round(r + (255 - r) * boost), 40, 245);
              g = clamp(Math.round(g + (255 - g) * boost), 40, 245);
              b = clamp(Math.round(b + (255 - b) * boost), 60, 250);
              applyColorToBg([r, g, b]);
            } catch (e) {}
          };
          img.onerror = function(){};
          img.src = src;
        } catch (e) {}
      }

      function applyState(state){
        state = state || {};
        var hasTrack = !!state.hasTrack;
        var title = hasTrack ? (state.title || '未命名歌曲') : '未在播放';
        var artist = hasTrack ? (state.artist || '') : '音乐播放器';
        var duration = typeof state.duration === 'number' ? state.duration : 0;
        var currentTime = typeof state.currentTime === 'number' ? state.currentTime : 0;
        if (currentTime < 0) currentTime = 0;
        if (duration > 0 && currentTime > duration) currentTime = duration;

        titleEl.textContent = title;
        metaEl.textContent = artist || (hasTrack ? '' : '音乐播放器');

        var progress = (duration > 0) ? (currentTime / duration) : 0;
        if (!isFinite(progress) || progress < 0) progress = 0;
        if (progress > 1) progress = 1;
        barFill.style.width = (progress * 100).toFixed(1) + '%';

        timeStartEl.textContent = formatTime(currentTime);
        if (duration > 0) {
          timeRemainEl.textContent = '-' + formatTime(duration - currentTime);
        } else {
          timeRemainEl.textContent = '-0:00';
        }

        var lyric = state.lyricLine || '';
        if (lyric && lyric.trim()) {
          lyricRow.classList.remove('empty');
          lyricTextEl.textContent = lyric.trim();
        } else {
          lyricRow.classList.add('empty');
          lyricTextEl.textContent = hasTrack ? (artist || '当前暂无歌词') : '当前暂无歌曲';
        }

        var displayImage = state.presetImage || state.coverDataUrl || '${presetImage}';
        if (displayImage && typeof displayImage === 'string' && displayImage.trim()) {
          coverImg.style.display = 'block';
          coverEmpty.style.display = 'none';
          coverImg.src = displayImage;
          extractDominantColor(displayImage);
        } else {
          // 即使没有图片，也要显示占位符，保持上半区区域可见
          coverImg.style.display = 'none';
          coverEmpty.style.display = 'flex';
          // 无封面时使用默认淡蓝背景
          if (!lastBaseColor || lastBaseColor === '#b8c5e6') {
            applyColorToBg([184, 197, 230]);
          }
        }

        updatePlayState(state.isPlaying);
      }

      // 绑定控制按钮：向父页面发送控制命令
      function postCommand(cmd){
        try {
          parent.postMessage({ type: 'yd-widget-player-command', command: cmd }, '*');
        } catch (e) {}
      }

      btnPrev.addEventListener('click', function(){ postCommand('prev'); });
      btnNext.addEventListener('click', function(){ postCommand('next'); });
      btnPlay.addEventListener('click', function(){ postCommand('toggle'); });

      // 点击除上一曲/播放/下一曲外的区域：进入音乐页
      root.addEventListener('click', function(ev){
        var t = ev && ev.target;
        if (!t || !t.closest) return;
        if (t.closest('.ctrl-btn')) return;
        try {
          parent.postMessage({ type: 'yd-widget-player-open-music' }, '*');
        } catch (e) {}
      }, true);

      // 监听来自父页面的播放状态
      window.addEventListener('message', function(ev){
        var msg = ev && ev.data;
        if (!msg || msg.type !== 'yd-widget-player-state') return;
        applyState(msg.payload || {});
      });

      // 初始状态：始终调用一次 applyState，确保占位符显示
      var initialPreset = '${presetImage}';
      if (initialPreset && initialPreset.trim()) {
        applyState({ hasTrack:false, title:'未在播放', artist:'', duration:0, currentTime:0, lyricLine:'', coverDataUrl:initialPreset, presetImage:initialPreset, isPlaying:false });
      } else {
        // 没有预设图片时，也要显示占位符
        applyState({ hasTrack:false, title:'未在播放', artist:'音乐播放器', duration:0, currentTime:0, lyricLine:'', coverDataUrl:'', presetImage:'', isPlaying:false });
      }
    })();
  <\/script>
</body>
</html>`;
  },

  // 便笺组件：拍立得照片样式（两张斜着摆）
  getNoteWidgetSrcDoc(overrideStyle) {
    // 注意：这个方法需要同步返回 HTML，但读取 IndexedDB 是异步的
    // 所以这里先返回一个占位 HTML，然后通过 postMessage 更新
    // 如果 overrideStyle 已经包含图片数据（预览时），直接使用
    let image1 = '';
    let image2 = '';
    
    // 默认边框样式
    let borderColor = '#ffffff';
    let borderAlpha = 0.6;

    if (overrideStyle && typeof overrideStyle === 'object') {
      // 预览时直接使用传入的图片数据
      image1 = (overrideStyle.image1 && typeof overrideStyle.image1 === 'string') ? overrideStyle.image1 : '';
      image2 = (overrideStyle.image2 && typeof overrideStyle.image2 === 'string') ? overrideStyle.image2 : '';
      if (overrideStyle.borderColor && typeof overrideStyle.borderColor === 'string') {
        borderColor = overrideStyle.borderColor;
      }
      if (typeof overrideStyle.borderAlpha === 'number') {
        borderAlpha = overrideStyle.borderAlpha;
      }
    } else {
      // 主屏渲染时：先尝试从 localStorage 读取 albumId，然后异步从 IndexedDB 加载
      // 这里先返回占位，后续通过 postMessage 更新
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_NOTE_STYLE);
        if (raw && typeof raw === 'object') {
          // 如果有旧的 dataURL 格式（兼容旧数据），直接使用
          if (raw.image1 && typeof raw.image1 === 'string' && !raw.image1AlbumId) {
            image1 = raw.image1;
          }
          if (raw.image2 && typeof raw.image2 === 'string' && !raw.image2AlbumId) {
            image2 = raw.image2;
          }
          // 如果有 albumId，会在 iframe 加载后通过 postMessage 更新

          if (raw.borderColor && typeof raw.borderColor === 'string') {
            borderColor = raw.borderColor;
          }
          if (typeof raw.borderAlpha === 'number') {
            borderAlpha = raw.borderAlpha;
          }
        }
      } catch (e) {}
    }
    
    // 如果没有图片，显示占位符
    const hasImage1 = image1 && image1.trim().length > 0;
    const hasImage2 = image2 && image2.trim().length > 0;

    // 将边框颜色 + 透明度组合成 rgba，用于白边背景
    let borderBg = 'rgba(255,255,255,0.15)';
    try {
      if (borderColor && typeof borderColor === 'string') {
        // 简单解析 #rrggbb / #rgb
        let r = 255, g = 255, b = 255;
        if (borderColor.startsWith('#')) {
          const hex = borderColor.slice(1);
          if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
          } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
          }
        }
        const alpha = (typeof borderAlpha === 'number') ? Math.max(0, Math.min(1, borderAlpha)) : 0.6;
        borderBg = `rgba(${r},${g},${b},${alpha})`;
      }
    } catch (e) {}
    
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{ box-sizing:border-box; }
    html,body{
      height:100%;
      width:100%;
      margin:0;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow:hidden;
      background: transparent;
    }
    .wrap{
      height:100%;
      width:100%;
      padding: 8px;
      display:flex;
      align-items:center;
      justify-content:center;
      position:relative;
      /* 拍立得组件只裁剪自身：避免下层阴影/框在底部泄露出来 */
      background: transparent;
      border-radius: 18px;
      overflow: hidden;
    }
    .polaroid-container{
      position:relative;
      width:100%;
      height:100%;
      display:flex;
      align-items:center;
      justify-content:center;
      gap:0;
    }
    .polaroid{
      position:relative;
      background:${borderBg};
      padding:6px 2px 20px 2px;
      box-shadow:0 8px 16px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.15);
      border-radius:2px;
      width:calc(50% - 4px);
      height:auto;
      max-height:95%;
      aspect-ratio:3/4;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
    }
    .polaroid:nth-child(1){
      transform:rotate(-10deg) translateY(-2px);
      z-index:1;
    }
    .polaroid:nth-child(2){
      transform:rotate(8deg) translateY(2px);
      z-index:2;
      margin-left:-12px;
    }
    .polaroid-image{
      width:calc(100% - 8px);
      height:auto;
      flex:1;
      min-height:0;
      object-fit:cover;
      border-radius:1px;
      background:#e0e0e0;
      display:block;
    }
    .polaroid-placeholder{
      width:calc(100% - 8px);
      height:auto;
      flex:1;
      min-height:0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:28px;
      color:#ccc;
      background:#f0f0f0;
      border-radius:1px;
    }
  </style>
</head>
<body>
  <div class="wrap">
      <div class="polaroid-container">
        <div class="polaroid">
          <img class="polaroid-image" id="note-img1" alt="拍立得照片1" style="display:none;">
          <div class="polaroid-placeholder" id="note-placeholder1">📷</div>
        </div>
        <div class="polaroid">
          <img class="polaroid-image" id="note-img2" alt="拍立得照片2" style="display:none;">
          <div class="polaroid-placeholder" id="note-placeholder2">📷</div>
        </div>
      </div>
  </div>
  <script>
    (function(){
      var img1El = document.getElementById('note-img1');
      var img2El = document.getElementById('note-img2');
      var placeholder1 = document.getElementById('note-placeholder1');
      var placeholder2 = document.getElementById('note-placeholder2');
      
      function updateImages(data) {
        if (!data) return;
        
        if (data.image1 && typeof data.image1 === 'string' && data.image1.trim()) {
          if (img1El) {
            img1El.src = data.image1;
            img1El.style.display = 'block';
          }
          if (placeholder1) placeholder1.style.display = 'none';
        } else {
          if (img1El) img1El.style.display = 'none';
          if (placeholder1) placeholder1.style.display = 'flex';
        }
        
        if (data.image2 && typeof data.image2 === 'string' && data.image2.trim()) {
          if (img2El) {
            img2El.src = data.image2;
            img2El.style.display = 'block';
          }
          if (placeholder2) placeholder2.style.display = 'none';
        } else {
          if (img2El) img2El.style.display = 'none';
          if (placeholder2) placeholder2.style.display = 'flex';
        }
      }
      
      // 初始图片（如果有，通过 JSON 转义避免特殊字符问题）
      ${hasImage1 || hasImage2 ? `updateImages(${JSON.stringify({ image1: hasImage1 ? image1 : '', image2: hasImage2 ? image2 : '' })});` : ''}
      
      // 监听来自父页面的图片更新
      window.addEventListener('message', function(ev){
        var msg = ev && ev.data;
        if (!msg || msg.type !== 'yd-widget-note-images') return;
        updateImages(msg.payload || {});
      });
    })();
  <\/script>
</body>
</html>`;
  },

  // 4×2 头像卡片组件：上方背景图 + 中间头像 + 下方多行文字 + 上半区四格文本
  getHotnewsWidgetSrcDoc() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{ box-sizing:border-box; }
    html,body{
      height:100%;
      width:100%;
      margin:0;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow:hidden;
    }
    .wrap{
      height:100%;
      width:100%;
      /* 不留外部边距：占满 4×3 区域 */
      padding: 0;
      display:flex;
      flex-direction:column;
      background: transparent;
      border-radius: 18px;
      color: #222222;
    }
    .card{
      position:relative;
      flex:1;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
      border-radius: 18px;
      overflow:hidden;
      background: transparent;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }
    .bg{
      position:absolute;
      inset:0;
      z-index:0;
      background-size:cover;
      background-position:center;
      background-repeat:no-repeat;
      filter:brightness(0.98);
    }
    .bg::after{
      content:'';
      position:absolute;
      inset:0;
      /* 让底部文案区更易读，同时不遮住圆角露出的背景 */
      background: linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.00) 55%, rgba(0,0,0,0.10) 100%);
      pointer-events:none;
    }

    /* 上半区：四格文本（左右两列各两行） */
    .top-text{
      position:absolute;
      left:12px;
      right:12px;
      top:24px;
      z-index:2;
      display:grid;
      grid-template-columns: 1fr 1fr;
      grid-auto-rows: minmax(0, auto);
      gap:22px 20px;
      pointer-events:none;
    }
    .top-text-item{
      display:flex;
      justify-content:center;
    }
    /* 左列（1/3）左对齐，右列（2/4）右对齐 */
    .top-text-item:nth-child(odd){
      justify-content:flex-start;
    }
    .top-text-item:nth-child(even){
      justify-content:flex-end;
    }
    .top-text-pill{
      max-width:100%;
      padding: 4px 8px;
      border-radius: 12px;
      background: rgba(255,255,255,0.78);
      border: 1px solid rgba(0,0,0,0.05);
      color:#111827;
      font-size:11px;
      font-weight:700;
      line-height:1.2;
      text-align:left;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      box-shadow: 0 6px 14px rgba(0,0,0,0.10);
    }
    .top-text-item:nth-child(even) .top-text-pill{
      text-align:right;
    }
    .top-text-pill.is-empty{
      display:none;
    }
    .avatar-wrap{
      position:absolute;
      left:50%;
      top:52%;
      transform:translate(-50%, -50%);
      z-index:2;
      width:68px;
      height:68px;
      border-radius:50%;
      background: transparent;
      box-shadow:0 10px 22px rgba(0,0,0,0.22);
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
    }
    .avatar{
      width:96%;
      height:96%;
      border-radius:50%;
      object-fit:cover;
      display:block;
    }
    .avatar-placeholder{
      width:100%;
      height:100%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:24px;
    }
    .content{
      margin-top:auto;
      width:100%;
      padding: 28px 12px 10px;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
      gap:4px;
      text-align:center;
      position:relative;
      z-index:1;
      /* 在上下区域交界处做圆角，让下半部分更像一张独立卡片 */
      background: rgba(255,255,255,0.96);
      border-top-left-radius: 18px;
      border-top-right-radius: 18px;
    }
    .title{
      font-size:14px;
      font-weight:700;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      max-width:100%;
    }
    .tagline{
      font-size:11px;
      opacity:0.8;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      max-width:100%;
    }
    .lines{
      margin-top:4px;
      font-size:11px;
      line-height:1.4;
      opacity:0.9;
      max-height:3.2em;
      overflow:hidden;
      display:-webkit-box;
      -webkit-line-clamp:3;
      -webkit-box-orient:vertical;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="bg" id="bg"></div>
      <div class="top-text" aria-hidden="true">
        <div class="top-text-item"><div class="top-text-pill" id="topText1">文本1</div></div>
        <div class="top-text-item"><div class="top-text-pill" id="topText2">文本2</div></div>
        <div class="top-text-item"><div class="top-text-pill" id="topText3">文本3</div></div>
        <div class="top-text-item"><div class="top-text-pill" id="topText4">文本4</div></div>
      </div>
      <div class="avatar-wrap">
        <img id="avatar" class="avatar" alt="" style="display:none;">
        <div id="avatarPlaceholder" class="avatar-placeholder">📷</div>
      </div>
      <div class="content" id="lowerPanel">
        <div class="title" id="title" style="display:none;"></div>
        <div class="tagline" id="tagline" style="display:none;"></div>
        <div class="lines" id="lines" style="display:none;"></div>
      </div>
    </div>
  </div>
  <script>
    (function(){
      var bgEl = document.getElementById('bg');
      var avatarEl = document.getElementById('avatar');
      var avatarPlaceholder = document.getElementById('avatarPlaceholder');
      var titleEl = document.getElementById('title');
      var taglineEl = document.getElementById('tagline');
      var linesEl = document.getElementById('lines');
      var lowerPanelEl = document.getElementById('lowerPanel');
      var top1 = document.getElementById('topText1');
      var top2 = document.getElementById('topText2');
      var top3 = document.getElementById('topText3');
      var top4 = document.getElementById('topText4');

      var _dominant = { r: 255, g: 255, b: 255 };
      var _lowerBlur = 10;
      var _lowerAlpha = 0.92;
      var _lowerTextColor = '#111827';
      var _topFontSize = 11;

      function applyLowerPanelStyle(){
        try {
          if (!lowerPanelEl) return;
          var a = _lowerAlpha;
          if (!isFinite(a)) a = 0.92;
          if (a < 0) a = 0;
          if (a > 1) a = 1;
          var r = _dominant && isFinite(_dominant.r) ? _dominant.r : 255;
          var g = _dominant && isFinite(_dominant.g) ? _dominant.g : 255;
          var b = _dominant && isFinite(_dominant.b) ? _dominant.b : 255;
          lowerPanelEl.style.background = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
          var blurPx = _lowerBlur;
          if (!isFinite(blurPx)) blurPx = 10;
          if (blurPx < 0) blurPx = 0;
          if (blurPx > 15) blurPx = 15;
          lowerPanelEl.style.backdropFilter = 'blur(' + blurPx + 'px) saturate(140%)';
          lowerPanelEl.style.webkitBackdropFilter = 'blur(' + blurPx + 'px) saturate(140%)';

          var c = (_lowerTextColor || '').trim() || '#111827';
          if (titleEl) titleEl.style.color = c;
          if (taglineEl) taglineEl.style.color = c;
          if (linesEl) linesEl.style.color = c;
        } catch (e) {}
      }

      function computeDominantFromDataUrl(dataUrl){
        try {
          if (!dataUrl) return;
          var img = new Image();
          img.onload = function(){
            try {
              var w = 24, h = 24;
              var canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              var ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (!ctx) return;
              ctx.drawImage(img, 0, 0, w, h);
              var d = ctx.getImageData(0, 0, w, h).data;
              var r = 0, g = 0, b = 0, n = 0;
              for (var i = 0; i < d.length; i += 4) {
                var a = d[i + 3];
                if (a < 24) continue;
                r += d[i];
                g += d[i + 1];
                b += d[i + 2];
                n++;
              }
              if (n) {
                _dominant = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
                applyLowerPanelStyle();
              }
            } catch (e) {}
          };
          img.src = dataUrl;
        } catch (e) {}
      }

      // 应用来自 IndexedDB 的资源数据：
      // - kind=image 的前两条：第1张作为背景，第2张作为头像
      // - kind=text 的多条：
      //   texts[0] 标题、texts[1] 副标题
      //   texts[2..5] 上半区四格文本（左右两列各两行）
      //   texts[6..] 作为下半区多行文案
      function applyResources(list){
        if (!Array.isArray(list)) return;

        var images = list
          .filter(function(item){ return item && item.kind === 'image' && item.imageData; })
          .slice()
          .sort(function(a, b){ return (Number(a.order || 0) - Number(b.order || 0)); });
        var texts = list
          .filter(function(item){ return item && item.kind === 'text' && item.text; })
          .slice()
          .sort(function(a, b){ return (Number(a.order || 0) - Number(b.order || 0)); });
        var cfg = null;
        for (var ci = 0; ci < list.length; ci++) {
          var it = list[ci];
          if (it && it.kind === 'config' && it.key === 'profile-card-lower') { cfg = it; break; }
        }
        var cfgTop = null;
        for (var ci2 = 0; ci2 < list.length; ci2++) {
          var it2 = list[ci2];
          if (it2 && it2.kind === 'config' && it2.key === 'profile-card-top') { cfgTop = it2; break; }
        }

        // config：下半区背景板（模糊度/透明度）
        if (cfg) {
          var blurRaw = (typeof cfg.lowerBlur === 'number') ? cfg.lowerBlur : parseInt(cfg.lowerBlur, 10);
          var alphaRaw = (typeof cfg.lowerAlpha === 'number') ? cfg.lowerAlpha : parseInt(cfg.lowerAlpha, 10);
          _lowerBlur = isFinite(blurRaw) ? blurRaw : 10;
          var alphaPct = isFinite(alphaRaw) ? alphaRaw : 92;
          if (alphaPct < 0) alphaPct = 0;
          if (alphaPct > 100) alphaPct = 100;
          _lowerAlpha = alphaPct / 100;
          _lowerTextColor = (cfg.lowerTextColor && typeof cfg.lowerTextColor === 'string') ? cfg.lowerTextColor : '#111827';
          applyLowerPanelStyle();
        } else {
          _lowerBlur = 10;
          _lowerAlpha = 0.92;
          _lowerTextColor = '#111827';
          applyLowerPanelStyle();
        }

        // config：上半区四句（字体大小）
        if (cfgTop) {
          var sizeRaw = (typeof cfgTop.topFontSize === 'number') ? cfgTop.topFontSize : parseInt(cfgTop.topFontSize, 10);
          _topFontSize = isFinite(sizeRaw) ? sizeRaw : 11;
          if (_topFontSize < 9) _topFontSize = 9;
          if (_topFontSize > 18) _topFontSize = 18;
        } else {
          _topFontSize = 11;
        }
        try {
          if (top1) top1.style.fontSize = _topFontSize + 'px';
          if (top2) top2.style.fontSize = _topFontSize + 'px';
          if (top3) top3.style.fontSize = _topFontSize + 'px';
          if (top4) top4.style.fontSize = _topFontSize + 'px';
        } catch (e) {}

        // 背景图
        if (images[0] && images[0].imageData && bgEl) {
          bgEl.style.backgroundImage = 'url(' + images[0].imageData + ')';
          computeDominantFromDataUrl(images[0].imageData);
        }

        // 头像图
        if (images[1] && images[1].imageData && avatarEl && avatarPlaceholder) {
          avatarEl.src = images[1].imageData;
          avatarEl.style.display = 'block';
          avatarPlaceholder.style.display = 'none';
        }

      function setTop(el, cfg){
          if (!el) return;
        cfg = cfg || {};
        var t = (cfg.text || '').trim();
          if (!t) {
            el.textContent = '';
            el.classList.add('is-empty');
            return;
          }
          el.textContent = t;
          el.classList.remove('is-empty');

        // 样式：字体颜色 + 背景（可关）
        var color = (cfg.color || '').trim();
        if (color) el.style.color = color;
        var bgEnabled = (typeof cfg.bgEnabled === 'boolean') ? cfg.bgEnabled : true;
        var bgColor = (cfg.bgColor || '').trim();
        var bgAlphaPct = (typeof cfg.bgAlpha === 'number') ? cfg.bgAlpha : parseInt(cfg.bgAlpha, 10);
        if (!isFinite(bgAlphaPct)) bgAlphaPct = 78;
        if (bgAlphaPct < 0) bgAlphaPct = 0;
        if (bgAlphaPct > 100) bgAlphaPct = 100;

        function hexToRgba(hex, alpha){
          try {
            if (!hex || typeof hex !== 'string') return 'rgba(255,255,255,' + alpha + ')';
            var h = hex.trim();
            if (h.charAt(0) === '#') h = h.slice(1);
            if (h.length === 3) {
              var r = parseInt(h.charAt(0) + h.charAt(0), 16);
              var g = parseInt(h.charAt(1) + h.charAt(1), 16);
              var b = parseInt(h.charAt(2) + h.charAt(2), 16);
              return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
            }
            if (h.length === 6) {
              var r6 = parseInt(h.slice(0,2), 16);
              var g6 = parseInt(h.slice(2,4), 16);
              var b6 = parseInt(h.slice(4,6), 16);
              return 'rgba(' + r6 + ',' + g6 + ',' + b6 + ',' + alpha + ')';
            }
          } catch (e) {}
          return 'rgba(255,255,255,' + alpha + ')';
        }

        if (!bgEnabled) {
          el.style.background = 'transparent';
          el.style.border = 'none';
          el.style.boxShadow = 'none';
        } else {
          var a = bgAlphaPct / 100;
          el.style.background = hexToRgba(bgColor || '#ffffff', a);
          el.style.border = '1px solid rgba(0,0,0,0.05)';
          el.style.boxShadow = '0 6px 14px rgba(0,0,0,0.10)';
        }
        }

        // 文本：标题 / 副标题 / 四格 / 多行介绍（按 order 精确匹配，避免顺序/缺项导致错位）
        var byOrder = {};
        for (var ti = 0; ti < texts.length; ti++) {
          var tRec = texts[ti];
          var o = Number(tRec && tRec.order);
          if (!isFinite(o)) continue;
          byOrder[o] = tRec;
        }

        // 标题/副标题（order 0/1）：你填什么显示什么；为空就清空并隐藏
        if (titleEl) {
          var t0 = (byOrder[0] && byOrder[0].text) ? String(byOrder[0].text).trim() : '';
          if (t0) {
            titleEl.textContent = t0;
            titleEl.style.display = 'block';
          } else {
            titleEl.textContent = '';
            titleEl.style.display = 'none';
          }
        }
        if (taglineEl) {
          var t1 = (byOrder[1] && byOrder[1].text) ? String(byOrder[1].text).trim() : '';
          if (t1) {
            taglineEl.textContent = t1;
            taglineEl.style.display = 'block';
          } else {
            taglineEl.textContent = '';
            taglineEl.style.display = 'none';
          }
        }

        // 上半区四句（order 2-5）
        setTop(top1, byOrder[2] || {});
        setTop(top2, byOrder[3] || {});
        setTop(top3, byOrder[4] || {});
        setTop(top4, byOrder[5] || {});

        // 下半区多行文案（order >= 6）：你填什么显示什么；清空则不显示
        var rest = [];
        for (var k = 6; k <= 200; k++) {
          if (!byOrder[k] || !byOrder[k].text) continue;
          var tx = String(byOrder[k].text || '').trim();
          if (!tx) continue;
          rest.push(tx);
        }
        if (linesEl) {
          if (rest.length) {
            linesEl.textContent = rest.join('\\n');
            linesEl.style.display = 'block';
          } else {
            linesEl.textContent = '';
            linesEl.style.display = 'none';
          }
        }
      }

      window.addEventListener('message', function(ev){
        var msg = ev && ev.data;
        if (!msg || msg.type !== 'yd-widget-data' || msg.widgetId !== 'widget-profile-card') return;
        applyResources(msg.resources || []);
      });
    })();
  <\/script>
</body>
</html>`;
  },

  // 其它尺寸组件：用于演示装箱效果（带明显背景/标题）
  getDemoWidgetSrcDoc(widgetId) {
    const map = {
      'widget-1x3': { title: '1×3', sub: '竖向卡片', bg1: '#c6e6ff', bg2: '#e8f6ff' },
      'widget-2x3': { title: '2×3', sub: '大卡片', bg1: '#ffe4c7', bg2: '#fff3e5' },
      'widget-2x2': { title: '2×2', sub: '方形组件', bg1: '#ffd6e7', bg2: '#fff1f7' },
      'widget-2x1': { title: '2×1', sub: '横条', bg1: '#d9ffd8', bg2: '#f0fff0' },
      'widget-1x3b': { title: '1×3', sub: '列表', bg1: '#f5d2ff', bg2: '#fff0ff' },
      'widget-2x1b': { title: '2×1', sub: '播放器', bg1: '#d7ddff', bg2: '#f0f3ff' }
    };
    const info = map[widgetId] || { title: widgetId, sub: '', bg1: '#ffffff', bg2: '#ffffff' };
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{ box-sizing:border-box; }
    html,body{
      height:100%;
      width:100%;
      margin:0;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow:auto;
    }
    body{ -ms-overflow-style: none; scrollbar-width: none; }
    body::-webkit-scrollbar{ display:none; }
    .wrap{
      height:100%;
      width:100%;
      padding: 12px 12px;
      border-radius: 18px;
      display:flex;
      flex-direction:column;
      justify-content:space-between;
      background: linear-gradient(145deg, ${info.bg1}, ${info.bg2});
      color:#0b0b0b;
    }
    .title{
      font-size: 18px;
      font-weight: 900;
      letter-spacing: -0.2px;
    }
    .sub{
      margin-top: 4px;
      font-size: 12px;
      opacity: 0.8;
      font-weight: 600;
    }
    .fake{
      margin-top: 10px;
      display:flex;
      flex-direction:column;
      gap: 8px;
      opacity: 0.55;
      font-size: 12px;
      font-weight: 600;
    }
    .row{
      height: 10px;
      border-radius: 999px;
      background: rgba(0,0,0,0.12);
    }
    .row:nth-child(2){ width: 72%; }
    .row:nth-child(3){ width: 90%; }
    .row:nth-child(4){ width: 64%; }
  </style>
</head>
<body>
  <div class="wrap">
    <div>
      <div class="title">${info.title}</div>
      <div class="sub">${info.sub}</div>
    </div>
    <div class="fake" aria-hidden="true">
      <div class="row"></div>
      <div class="row"></div>
      <div class="row"></div>
      <div class="row"></div>
    </div>
  </div>
</body>
</html>`;
  },

  // 新增：2×2 相片卡片组件（模糊背景 + 单张照片 + 左/右下角文字）
  getPhotoCardWidgetSrcDoc(overrideStyle) {
    let image = '';
    let blurAmount = 8;
    let blurAlpha = 0.6;
    let textLeft = '';
    let textRight = '';
    let bgColorHex = '';

    if (overrideStyle && typeof overrideStyle === 'object') {
      image = (overrideStyle.image && typeof overrideStyle.image === 'string') ? overrideStyle.image : '';
      if (typeof overrideStyle.blurAmount === 'number') blurAmount = overrideStyle.blurAmount;
      if (typeof overrideStyle.blurAlpha === 'number') blurAlpha = overrideStyle.blurAlpha;
      if (typeof overrideStyle.textLeft === 'string') textLeft = overrideStyle.textLeft;
      if (typeof overrideStyle.textRight === 'string') textRight = overrideStyle.textRight;
      if (typeof overrideStyle.bgColor === 'string') bgColorHex = overrideStyle.bgColor;
    } else {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.PHOTO_CARD_STYLE);
        if (raw && typeof raw === 'object') {
          if (raw.image && typeof raw.image === 'string') image = raw.image;
          if (typeof raw.blurAmount === 'number') blurAmount = raw.blurAmount;
          if (typeof raw.blurAlpha === 'number') blurAlpha = raw.blurAlpha;
          if (typeof raw.textLeft === 'string') textLeft = raw.textLeft;
          if (typeof raw.textRight === 'string') textRight = raw.textRight;
          if (typeof raw.bgColor === 'string') bgColorHex = raw.bgColor;
        }
      } catch (e) {}
    }

    const safeBlur = Math.max(0, Math.min(15, Number.isFinite(blurAmount) ? blurAmount : 8));
    const safeAlpha = (typeof blurAlpha === 'number') ? Math.max(0, Math.min(1, blurAlpha)) : 0.6;

    // 将主色 hex + 透明度转换为 rgba
    let bgColor = `rgba(15, 23, 42, ${safeAlpha.toFixed(2)})`;
    try {
      if (bgColorHex && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(bgColorHex)) {
        let hex = bgColorHex.slice(1);
        if (hex.length === 3) {
          hex = hex.split('').map(ch => ch + ch).join('');
        }
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        bgColor = `rgba(${r},${g},${b},${safeAlpha.toFixed(2)})`;
      }
    } catch (e) {}

    const safeTextLeft = String(textLeft || '').slice(0, 24).replace(/</g, '&lt;');
    const safeTextRight = String(textRight || '').slice(0, 24).replace(/</g, '&lt;');

    const imgHtml = (image && image.trim())
      ? `<img src="${image}" alt="相片" />`
      : '<div class="card-image-placeholder">📷</div>';

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{ box-sizing:border-box; }
    html,body{
      height:100%;
      width:100%;
      margin:0;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow:hidden;
      background:transparent;
    }
    .wrap{
      height:100%;
      width:100%;
      /* 不留外部边距：占满 2×2 区域（内部图片等仍保留 card 的 padding） */
      padding:0;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .card{
      position:relative;
      width:100%;
      height:100%;
      border-radius:18px;
      overflow:hidden;
      background:${bgColor};
      backdrop-filter:blur(${safeBlur}px);
      -webkit-backdrop-filter:blur(${safeBlur}px);
      /* 取消外层强阴影，避免被格子边界“截断”出明显方框 */
      box-shadow:none;
      display:flex;
      flex-direction:column;
      padding:12px;
      color:#f9fafb;
    }
    .card-image{
      position:relative;
      /* 图片占比别太大，给底部文字留出空间 */
      flex:0 0 84%;
      min-height:0;
      border-radius:10px;
      overflow:hidden;
      background:rgba(15,23,42,0.6);
      display:flex;
      align-items:center;
      justify-content:center;
      /* 让图片离边框更远一点 */
      margin: 2px 2px 0;
    }
    .card-image img{
      width:100%;
      height:100%;
      object-fit:cover;
      display:block;
    }
    .card-image-placeholder{
      font-size:26px;
      opacity:0.45;
    }
    .card-footer{
      margin-top:8px;
      display:flex;
      justify-content:space-between;
      align-items:flex-end;
      font-size:11px;
      line-height:1.3;
      letter-spacing:0.2px;
    }
    .card-text-left,
    .card-text-right{
      max-width:58%;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .card-text-left{
      font-weight:600;
    }
    .card-text-right{
      text-align:right;
      opacity:0.85;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="card-image">
        ${imgHtml}
      </div>
      <div class="card-footer">
        <div class="card-text-left">${safeTextLeft || '左下角文字'}</div>
        <div class="card-text-right">${safeTextRight || '右下角文字'}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  },

  // 新增：2×2 相片圆卡组件（模糊背景 + 圆形图片 + 下方两行文字）
  getPhotoCircleWidgetSrcDoc(overrideStyle) {
    let image = '';
    let blurAmount = 8;
    let blurAlpha = 0.6;
    let textLine1 = '';
    let textLine2 = '';
    let bgColorHex = '';
    let line1Color = '#ffffff';
    let line2Color = '#ffffff';
    let line1BgHex = '#000000';
    let line2BgHex = '#000000';
    let line1BgEnabled = true;
    let line2BgEnabled = true;

    if (overrideStyle && typeof overrideStyle === 'object') {
      image = (overrideStyle.image && typeof overrideStyle.image === 'string') ? overrideStyle.image : '';
      if (typeof overrideStyle.blurAmount === 'number') blurAmount = overrideStyle.blurAmount;
      if (typeof overrideStyle.blurAlpha === 'number') blurAlpha = overrideStyle.blurAlpha;
      if (typeof overrideStyle.textLine1 === 'string') textLine1 = overrideStyle.textLine1;
      if (typeof overrideStyle.textLine2 === 'string') textLine2 = overrideStyle.textLine2;
      if (typeof overrideStyle.bgColor === 'string') bgColorHex = overrideStyle.bgColor;
      if (typeof overrideStyle.line1Color === 'string') line1Color = overrideStyle.line1Color;
      if (typeof overrideStyle.line2Color === 'string') line2Color = overrideStyle.line2Color;
      if (typeof overrideStyle.line1Bg === 'string') line1BgHex = overrideStyle.line1Bg;
      if (typeof overrideStyle.line2Bg === 'string') line2BgHex = overrideStyle.line2Bg;
      if (typeof overrideStyle.line1BgEnabled === 'boolean') line1BgEnabled = overrideStyle.line1BgEnabled;
      if (typeof overrideStyle.line2BgEnabled === 'boolean') line2BgEnabled = overrideStyle.line2BgEnabled;
    } else {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.PHOTO_CIRCLE_STYLE);
        if (raw && typeof raw === 'object') {
          if (raw.image && typeof raw.image === 'string') image = raw.image;
          if (typeof raw.blurAmount === 'number') blurAmount = raw.blurAmount;
          if (typeof raw.blurAlpha === 'number') blurAlpha = raw.blurAlpha;
          if (typeof raw.textLine1 === 'string') textLine1 = raw.textLine1;
          if (typeof raw.textLine2 === 'string') textLine2 = raw.textLine2;
          if (typeof raw.bgColor === 'string') bgColorHex = raw.bgColor;
          if (typeof raw.line1Color === 'string') line1Color = raw.line1Color;
          if (typeof raw.line2Color === 'string') line2Color = raw.line2Color;
          if (typeof raw.line1Bg === 'string') line1BgHex = raw.line1Bg;
          if (typeof raw.line2Bg === 'string') line2BgHex = raw.line2Bg;
          if (typeof raw.line1BgEnabled === 'boolean') line1BgEnabled = raw.line1BgEnabled;
          if (typeof raw.line2BgEnabled === 'boolean') line2BgEnabled = raw.line2BgEnabled;
        }
      } catch (e) {}
    }

    const safeBlur = Math.max(0, Math.min(15, Number.isFinite(blurAmount) ? blurAmount : 8));
    const safeAlpha = (typeof blurAlpha === 'number') ? Math.max(0, Math.min(1, blurAlpha)) : 0.6;

    let bgColor = `rgba(15, 23, 42, ${safeAlpha.toFixed(2)})`;
    try {
      if (bgColorHex && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(bgColorHex)) {
        let hex = bgColorHex.slice(1);
        if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        bgColor = `rgba(${r},${g},${b},${safeAlpha.toFixed(2)})`;
      }
    } catch (e) {}

    const t1 = String(textLine1 || '').slice(0, 13).replace(/</g, '&lt;');
    const t2 = String(textLine2 || '').slice(0, 13).replace(/</g, '&lt;');

    const safeLine1Color = String(line1Color || '#ffffff').replace(/</g, '');
    const safeLine2Color = String(line2Color || '#ffffff').replace(/</g, '');
    const bgAlpha = Math.min(0.75, Math.max(0, safeAlpha));
    const hexToRgba = (hex, a) => {
      try {
        if (!hex || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return `rgba(0,0,0,${a.toFixed(2)})`;
        let h = hex.slice(1);
        if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a.toFixed(2)})`;
      } catch (e) {
        return `rgba(0,0,0,${a.toFixed(2)})`;
      }
    };
    const line1Bg = hexToRgba(line1BgHex, bgAlpha);
    const line2Bg = hexToRgba(line2BgHex, bgAlpha);

    const imgHtml = (image && image.trim())
      ? `<img src="${image}" alt="相片" />`
      : '<div class="avatar-placeholder">📷</div>';

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{ box-sizing:border-box; }
    html,body{
      height:100%;
      width:100%;
      margin:0;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow:hidden;
      background:transparent;
    }
    .wrap{
      height:100%;
      width:100%;
      /* 不留外部边距：占满 2×2 区域（内部仍由 .card 控制） */
      padding:0;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .card{
      width:100%;
      height:100%;
      border-radius:18px;
      overflow:hidden;
      background:${bgColor};
      backdrop-filter:blur(${safeBlur}px);
      -webkit-backdrop-filter:blur(${safeBlur}px);
      box-shadow:none;
      /* 用 grid 固定上下结构，避免用负 margin “挤”出来导致头像位置漂移 */
      display:grid;
      /* 三段式：顶部弹性留白 + 头像自适应 + 文本自适应
         避免头像在 1fr 区域垂直居中导致下方空隙过大 */
      grid-template-rows: 1fr auto auto;
      /* 第二句离底部距离 +4px */
      padding: 10px 10px 13px;
      color:#f9fafb;
      /* 图片到第一行文字的真实间距 */
      row-gap: 10px;
    }
    .spacer{
      min-height: 0;
    }
    .avatar{
      min-height:0;
      display:flex;
      align-items:center;
      /* 保持图片在可用区域内居中 */
      justify-content:center;
      /* 让头像区域稍微靠上，缩短与文字的距离 */
      padding-bottom: 12px;
    }
    .avatar-inner{
      /* 圆形图片再小一点 */
      width:min(48%, 108px);
      aspect-ratio: 1 / 1;
      border-radius:999px;
      overflow:hidden;
      background:rgba(15,23,42,0.6);
      display:flex;
      align-items:center;
      justify-content:center;
      box-shadow: 0 10px 22px rgba(0,0,0,0.22);
      border: 1px solid rgba(255,255,255,0.14);
    }
    .avatar-inner img{
      width:100%;
      height:100%;
      object-fit:cover;
      display:block;
    }
    .avatar-placeholder{
      font-size:28px;
      opacity:0.45;
    }
    .footer{
      display:flex;
      flex-direction:column;
      /* 第一行与第二行的间距 */
      gap:12px;
      padding: 0 2px;
      align-items:center;
      text-align:center;
      margin-top: 0;
    }
    .line1{
      font-size:11px;
      font-weight:700;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      color: ${safeLine1Color};
    }
    .line2{
      font-size:10px;
      opacity:0.85;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      color: ${safeLine2Color};
    }
    .line-pill{
      display:inline-block;
      padding: 2px 7px;
      border-radius: 9px;
      border: 1px solid rgba(255,255,255,0.10);
      max-width: 100%;
    }
    .line-pill--off{
      padding: 0;
      border: none;
      background: transparent;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="spacer" aria-hidden="true"></div>
      <div class="avatar">
        <div class="avatar-inner">
          ${imgHtml}
        </div>
      </div>
      <div class="footer">
        <div class="${line1BgEnabled ? 'line-pill' : 'line-pill line-pill--off'}" style="${line1BgEnabled ? `background:${line1Bg};` : ''}">
          <div class="line1">${t1 || '第一行文字'}</div>
        </div>
        <div class="${line2BgEnabled ? 'line-pill' : 'line-pill line-pill--off'}" style="${line2BgEnabled ? `background:${line2Bg};` : ''}">
          <div class="line2">${t2 || '第二行文字'}</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  },

  // 新增：2×2 日期卡组件（背景图 + 日期/星期角标 + 模糊/透明）
  getDateCardWidgetSrcDoc(overrideStyle) {
    let bgImage = '';
    let blurAmount = 6;
    let alpha = 0.85;
    let corner = 'tr'; // tr/tl/br/bl
    let dateFont = 'system';
    let weekFont = 'system';
    let dateSize = 16;
    let weekSize = 11;
    let dateColor = '#ffffff';
    let weekColor = '#ffffff';
    let dateOpacity = 1;
    let weekOpacity = 1;

    if (overrideStyle && typeof overrideStyle === 'object') {
      bgImage = (typeof overrideStyle.bgImage === 'string') ? overrideStyle.bgImage : '';
      if (typeof overrideStyle.blurAmount === 'number') blurAmount = overrideStyle.blurAmount;
      if (typeof overrideStyle.alpha === 'number') alpha = overrideStyle.alpha;
      if (typeof overrideStyle.corner === 'string') corner = overrideStyle.corner;
      if (typeof overrideStyle.dateFont === 'string') dateFont = overrideStyle.dateFont;
      if (typeof overrideStyle.weekFont === 'string') weekFont = overrideStyle.weekFont;
      if (typeof overrideStyle.dateSize === 'number') dateSize = overrideStyle.dateSize;
      if (typeof overrideStyle.weekSize === 'number') weekSize = overrideStyle.weekSize;
      if (typeof overrideStyle.dateColor === 'string') dateColor = overrideStyle.dateColor;
      if (typeof overrideStyle.weekColor === 'string') weekColor = overrideStyle.weekColor;
      if (typeof overrideStyle.dateOpacity === 'number') dateOpacity = overrideStyle.dateOpacity;
      if (typeof overrideStyle.weekOpacity === 'number') weekOpacity = overrideStyle.weekOpacity;
    } else {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.DATE_CARD_STYLE);
        if (raw && typeof raw === 'object') {
          if (typeof raw.bgImage === 'string') bgImage = raw.bgImage;
          if (typeof raw.blurAmount === 'number') blurAmount = raw.blurAmount;
          if (typeof raw.alpha === 'number') alpha = raw.alpha;
          if (typeof raw.corner === 'string') corner = raw.corner;
          if (typeof raw.dateFont === 'string') dateFont = raw.dateFont;
          if (typeof raw.weekFont === 'string') weekFont = raw.weekFont;
          if (typeof raw.dateSize === 'number') dateSize = raw.dateSize;
          if (typeof raw.weekSize === 'number') weekSize = raw.weekSize;
          if (typeof raw.dateColor === 'string') dateColor = raw.dateColor;
          if (typeof raw.weekColor === 'string') weekColor = raw.weekColor;
          if (typeof raw.dateOpacity === 'number') dateOpacity = raw.dateOpacity;
          if (typeof raw.weekOpacity === 'number') weekOpacity = raw.weekOpacity;
        }
      } catch (e) {}
    }

    const safeBlur = Math.max(0, Math.min(15, Number.isFinite(blurAmount) ? blurAmount : 6));
    const safeAlpha = Math.max(0.2, Math.min(1, Number.isFinite(alpha) ? alpha : 0.85));
    const safeCorner = (corner === 'tl' || corner === 'br' || corner === 'bl' || corner === 'tr') ? corner : 'tr';
    const safeDateSize = Math.max(10, Math.min(26, Number.isFinite(dateSize) ? dateSize : 16));
    const safeWeekSize = Math.max(9, Math.min(20, Number.isFinite(weekSize) ? weekSize : 11));
    const safeDateOpacity = Math.max(0.2, Math.min(1, Number.isFinite(dateOpacity) ? dateOpacity : 1));
    const safeWeekOpacity = Math.max(0.2, Math.min(1, Number.isFinite(weekOpacity) ? weekOpacity : 1));

    const normalizeFontKey = (k) => {
      const s = String(k || '').trim();
      if (s === 'yahei' || s === 'pingfang' || s === 'serif' || s === 'mono' || s === 'system') return s;
      return 'system';
    };
    const fontKeyToCss = (k) => {
      const key = normalizeFontKey(k);
      if (key === 'yahei') return '"Microsoft YaHei","Segoe UI",-apple-system,BlinkMacSystemFont,sans-serif';
      if (key === 'pingfang') return '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",-apple-system,BlinkMacSystemFont,sans-serif';
      if (key === 'serif') return 'ui-serif, Georgia, "Times New Roman", serif';
      if (key === 'mono') return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      return '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    };
    const dateFontCss = fontKeyToCss(dateFont);
    const weekFontCss = fontKeyToCss(weekFont);

    const hexToRgba = (hex, a, fallback) => {
      try {
        if (!hex || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return fallback;
        let h = hex.slice(1);
        if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a.toFixed(2)})`;
      } catch (e) {
        return fallback;
      }
    };

    const dateColorCss = hexToRgba(dateColor, safeDateOpacity, `rgba(255,255,255,${safeDateOpacity.toFixed(2)})`);
    const weekColorCss = hexToRgba(weekColor, safeWeekOpacity, `rgba(255,255,255,${safeWeekOpacity.toFixed(2)})`);

    const cornerClass = safeCorner === 'tl' ? 'pos-tl'
      : safeCorner === 'tr' ? 'pos-tr'
      : safeCorner === 'bl' ? 'pos-bl'
      : 'pos-br';

    const bgStyle = bgImage && bgImage.trim()
      ? `background-image:url(${bgImage});`
      : `background: linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08));`;

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{ box-sizing:border-box; }
    html,body{
      height:100%;
      width:100%;
      margin:0;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      overflow:hidden;
      background:transparent;
    }
    .wrap{
      height:100%;
      width:100%;
      padding:0;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .card{
      position:relative;
      width:100%;
      height:100%;
      border-radius:18px;
      overflow:hidden;
      background: rgba(0,0,0,0.10);
    }
    .bg{
      position:absolute;
      inset:0;
      ${bgStyle}
      background-size:cover;
      background-position:center;
      background-repeat:no-repeat;
      filter: blur(${safeBlur}px);
      transform: scale(1.08);
      opacity: ${safeAlpha};
    }
    .bg::after{
      content:'';
      position:absolute;
      inset:0;
      background: linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.00) 55%, rgba(0,0,0,0.12));
    }
    .badge{
      position:absolute;
      z-index:2;
      padding: 0;
      color:#ffffff;
      display:flex;
      flex-direction:column;
      gap:2px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.55);
    }
    .badge .d{
      font-size: ${safeDateSize}px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 0.2px;
      font-family: ${dateFontCss};
      color: ${dateColorCss};
    }
    .badge .w{
      font-size: ${safeWeekSize}px;
      font-weight: 800;
      line-height: 1.15;
      white-space:nowrap;
      letter-spacing: 0.2px;
      font-family: ${weekFontCss};
      color: ${weekColorCss};
    }
    .pos-tl{ top:16px; left:16px; text-align:left; }
    .pos-tr{ top:16px; right:16px; text-align:right; }
    .pos-bl{ bottom:16px; left:16px; text-align:left; }
    .pos-br{ bottom:16px; right:16px; text-align:right; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="bg"></div>
      <div class="badge ${cornerClass}">
        <div class="d" id="d">----.--.--</div>
        <div class="w" id="w">Sunday</div>
      </div>
    </div>
  </div>
  <script>
    (function(){
      function pad2(n){ return (n<10?'0':'') + n; }
      function tick(){
        var now = new Date();
        var y = now.getFullYear();
        var m = now.getMonth() + 1;
        var d = now.getDate();
        var week = now.toLocaleDateString('en-US', { weekday: 'long' });
        document.getElementById('d').textContent = y + '.' + pad2(m) + '.' + pad2(d);
        document.getElementById('w').textContent = week;
      }
      tick();
      setInterval(tick, 60 * 1000);
    })();
  <\/script>
</body>
</html>`;
  },

  // 向 widget iframe 发送更新
  sendWidgetUpdate() {
    if (!this.widgetIframe || !this.widgetIframe.contentWindow) return;
    this.widgetIframe.contentWindow.postMessage(
      { type: 'yd-widget-update', payload: this.widgetData },
      '*'
    );
  }
};


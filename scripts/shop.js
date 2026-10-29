// 商城：电商首页 + 商品详情 + 购物车
const Shop = {
  STORAGE_KEY_CART: 'shop_cart_v1',
  STORAGE_KEY_PREFS: 'shop_item_prefs_v1',
  STORAGE_KEY_ADDR: 'shop_address_v1',
  STORAGE_KEY_ORDERS: 'shop_orders_v1',
  STORAGE_KEY_ADMIN: 'shop_admin_data_v1',
  STORAGE_KEY_APPS: 'shop_apps_v1',
  STORAGE_KEY_CURRENT_APP: 'shop_current_app_id',

  _currentCat: 'all',
  _cart: {},
  _prefs: {},
  _addr: '',
  _detailCtx: null,
  _payPwd: '',
  _payProcessing: false,

  _cats: [
    { id: 'all', name: '推荐', icon: '⭐' },
    { id: 'digital', name: '数码', icon: '📱' },
    { id: 'home', name: '家电家具', icon: '🏠' },
    { id: 'lux', name: '奢品', icon: '👜' },
    { id: 'beauty', name: '美妆', icon: '💄' },
    { id: 'food', name: '零食', icon: '🍪' },
    { id: 'wear', name: '服饰', icon: '👕' },
    { id: 'jewel', name: '珠宝', icon: '💎' },
    { id: 'fleet', name: '大件', icon: '🚚' }
  ],

  // 用户自定义分类/商品/选项（持久化）
  _userNavItems: [],
  _userCategoryItems: {},
  _userOptionDefs: {},
  _userItemsFlat: [],
  _adminPersistTimer: null,
  _adminItemStyleChoices: [],
  _adminItemStyleOptionId: null,
  _adminPersistInited: false,
  _shopApps: [],
  _currentAppId: '',
  _baseOptionDefs: null,

  _optionDefs: {
    colorBasic: { title: '颜色', required: true, choices: [{ id: 'black', label: '黑色' }, { id: 'white', label: '白色' }, { id: 'blue', label: '蓝色' }] },
    storagePhone: { title: '容量', required: true, choices: [{ id: '128', label: '128G' }, { id: '256', label: '256G' }] },
    warranty: { title: '服务', required: true, choices: [{ id: 'std', label: '标准' }, { id: 'plus', label: '延长' }] },
    sizeWear: { title: '尺码', required: true, choices: [{ id: 'm', label: 'M' }, { id: 'l', label: 'L' }, { id: 'xl', label: 'XL' }] },
    styleWear: { title: '版型', required: true, choices: [{ id: 'regular', label: '常规' }, { id: 'loose', label: '宽松' }] },
    scent: { title: '香型', required: true, choices: [{ id: 'none', label: '无香' }, { id: 'fresh', label: '清新' }, { id: 'flower', label: '花香' }] },
    volume: { title: '规格', required: true, choices: [{ id: 'small', label: '小瓶' }, { id: 'big', label: '大瓶' }] },
    snackPack: { title: '规格', required: true, choices: [{ id: 'one', label: '1袋' }, { id: 'two', label: '2袋' }, { id: 'box', label: '1箱' }] },
    flavorSnack: { title: '口味', required: true, choices: [{ id: 'original', label: '原味' }, { id: 'spicy', label: '微辣' }, { id: 'bbq', label: '烧烤' }] },
    paperPack: { title: '规格', required: true, choices: [{ id: 'one', label: '1提' }, { id: 'two', label: '2提' }] },
    paperType: { title: '类型', required: true, choices: [{ id: 'soft', label: '柔软' }, { id: 'thick', label: '加厚' }] },
    bookType: { title: '版本', required: true, choices: [{ id: 'paper', label: '纸质' }, { id: 'set', label: '套装' }] },
    // 载具与大件
    vehicleType: { title: '类型', required: true, choices: [{ id: 'sport', label: '超跑' }, { id: 'sedan', label: '豪华轿车' }, { id: 'suv', label: '越野SUV' }] },
    vehicleColor: { title: '颜色', required: true, choices: [{ id: 'black', label: '曜黑' }, { id: 'white', label: '珍珠白' }, { id: 'silver', label: '银灰' }] },
    yachtLen: { title: '长度', required: true, choices: [{ id: '20', label: '20米级' }, { id: '30', label: '30米级' }] },
    jetRange: { title: '航程', required: true, choices: [{ id: 'short', label: '短途' }, { id: 'long', label: '远程' }] },

    // 珠宝
    jewelType: { title: '款式', required: true, choices: [{ id: 'ring', label: '戒指' }, { id: 'neck', label: '项链' }, { id: 'brace', label: '手链' }] },
    jewelMaterial: { title: '材质', required: true, choices: [{ id: 'au', label: '黄金' }, { id: 'pt', label: '铂金' }, { id: 'ag', label: '银' }] },
    jewelSize: { title: '尺寸', required: true, choices: [{ id: 's', label: '小号' }, { id: 'm', label: '中号' }, { id: 'l', label: '大号' }] },

    // 奢品
    bagColor: { title: '颜色', required: true, choices: [{ id: 'black', label: '黑色' }, { id: 'tan', label: '棕色' }, { id: 'cream', label: '奶油白' }] },
    bagSize: { title: '尺寸', required: true, choices: [{ id: 'mini', label: '迷你' }, { id: 'mid', label: '中号' }, { id: 'big', label: '大号' }] },
    strap: { title: '肩带', required: true, choices: [{ id: 'yes', label: '含肩带' }, { id: 'no', label: '不含肩带' }] },
    beltSize: { title: '长度', required: true, choices: [{ id: '95', label: '95cm' }, { id: '105', label: '105cm' }] },
    beltBuckle: { title: '扣头', required: true, choices: [{ id: 'silver', label: '银色' }, { id: 'gold', label: '金色' }] },
    glassColor: { title: '镜片', required: true, choices: [{ id: 'gray', label: '灰色' }, { id: 'brown', label: '茶色' }] },
    glassStyle: { title: '款式', required: true, choices: [{ id: 'square', label: '方框' }, { id: 'round', label: '圆框' }] },
    ringSize: { title: '号数', required: true, choices: [{ id: '10', label: '10号' }, { id: '12', label: '12号' }, { id: '14', label: '14号' }] },

    tvSize: { title: '尺寸', required: true, choices: [{ id: '55', label: '55英寸' }, { id: '65', label: '65英寸' }] },
    fridgeDoor: { title: '类型', required: true, choices: [{ id: 'double', label: '双开门' }, { id: 'three', label: '三门' }] },
    washerKg: { title: '容量', required: true, choices: [{ id: '8', label: '8kg' }, { id: '10', label: '10kg' }] },
    sofaType: { title: '类型', required: true, choices: [{ id: 'two', label: '两人位' }, { id: 'three', label: '三人位' }] },
    mattressSize: { title: '尺寸', required: true, choices: [{ id: '15', label: '1.5m' }, { id: '18', label: '1.8m' }] },
    deskSize: { title: '长度', required: true, choices: [{ id: '120', label: '120cm' }, { id: '140', label: '140cm' }] },
    ship: { title: '配送', required: true, choices: [{ id: 'door', label: '送货上门' }, { id: 'install', label: '送装一体' }] }
  },

  _items: [
    { id: 'p01', cat: 'digital', name: '无线耳机', price: 129, icon: '🎧', desc: '长续航 · 降噪', options: ['colorBasic', 'warranty'] },
    { id: 'p02', cat: 'digital', name: '智能手表', price: 199, icon: '⌚', desc: '健康监测 · 防水', options: ['colorBasic'] },
    { id: 'p03', cat: 'digital', name: '手机壳', price: 29, icon: '📱', desc: '防摔 · 轻薄', options: ['colorBasic'] },
    { id: 'p04', cat: 'home', name: '台灯', price: 59, icon: '💡', desc: '护眼 · 三档调光', options: ['colorBasic'] },
    { id: 'p05', cat: 'home', name: '收纳箱', price: 39, icon: '🧺', desc: '可叠放 · 大容量', options: ['colorBasic'] },
    { id: 'p06', cat: 'beauty', name: '洗发水', price: 49, icon: '🧴', desc: '清爽控油', options: ['scent', 'volume'] },
    { id: 'p07', cat: 'beauty', name: '沐浴露', price: 45, icon: '🧼', desc: '保湿', options: ['scent', 'volume'] },
    { id: 'p08', cat: 'food', name: '薯片', price: 12, icon: '🥔', desc: '酥脆', options: ['flavorSnack', 'snackPack'] },
    { id: 'p09', cat: 'food', name: '坚果', price: 26, icon: '🥜', desc: '每日一袋', options: ['snackPack'] },
    { id: 'p10', cat: 'wear', name: '基础T恤', price: 39, icon: '👕', desc: '亲肤 · 简约', options: ['sizeWear', 'styleWear'] },
    { id: 'p11', cat: 'wear', name: '休闲长裤', price: 79, icon: '👖', desc: '弹力 · 透气', options: ['sizeWear'] },
    { id: 'p16', cat: 'fleet', name: '超跑', price: 2680000, icon: '🏎️', desc: '性能强劲', options: ['vehicleType', 'vehicleColor'] },
    { id: 'p17', cat: 'home', name: '抽纸', price: 19, icon: '🧻', desc: '家庭装', options: ['paperType', 'paperPack'] },
    { id: 'p18', cat: 'digital', name: '充电器', price: 39, icon: '🔌', desc: '快充', options: ['warranty'] },

    { id: 'p19', cat: 'home', name: '智能电视', price: 2199, icon: '📺', desc: '4K · 高刷', options: ['tvSize', 'ship'] },
    { id: 'p20', cat: 'home', name: '冰箱', price: 1699, icon: '🧊', desc: '节能 · 大容量', options: ['fridgeDoor', 'ship'] },
    { id: 'p21', cat: 'home', name: '洗衣机', price: 1499, icon: '🧺', desc: '变频 · 静音', options: ['washerKg', 'ship'] },
    { id: 'p22', cat: 'home', name: '沙发', price: 2599, icon: '🛋️', desc: '舒适坐感', options: ['sofaType', 'ship'] },
    { id: 'p23', cat: 'home', name: '床垫', price: 999, icon: '🛏️', desc: '护脊', options: ['mattressSize', 'ship'] },
    { id: 'p24', cat: 'home', name: '书桌', price: 599, icon: '🪑', desc: '稳固', options: ['deskSize', 'colorBasic'] },
    { id: 'p22', cat: 'lux', name: '手提包', price: 12800, icon: '👜', desc: '经典', options: ['bagColor', 'bagSize'] },
    { id: 'p23', cat: 'lux', name: '皮带', price: 3200, icon: '🧷', desc: '真皮', options: ['beltSize', 'beltBuckle'] },
    { id: 'p24', cat: 'lux', name: '太阳镜', price: 2200, icon: '🕶️', desc: '防紫外线', options: ['glassColor', 'glassStyle'] },

    { id: 'p25', cat: 'jewel', name: '项链', price: 6800, icon: '📿', desc: '闪耀', options: ['jewelMaterial', 'jewelSize'] },
    { id: 'p26', cat: 'jewel', name: '戒指', price: 5200, icon: '💍', desc: '精致', options: ['jewelMaterial', 'ringSize'] },
    { id: 'p27', cat: 'jewel', name: '手链', price: 4600, icon: '🔗', desc: '百搭', options: ['jewelMaterial', 'jewelSize'] },

    { id: 'p28', cat: 'fleet', name: '豪华轿车', price: 980000, icon: '🚘', desc: '舒适', options: ['vehicleType', 'vehicleColor'] },
    { id: 'p29', cat: 'fleet', name: '越野SUV', price: 1280000, icon: '🚙', desc: '全地形', options: ['vehicleType', 'vehicleColor'] },
    { id: 'p30', cat: 'fleet', name: '游艇', price: 5200000, icon: '🛥️', desc: '海上出行', options: ['yachtLen', 'ship'] },
    { id: 'p31', cat: 'fleet', name: '私人飞机', price: 16800000, icon: '✈️', desc: '商务出行', options: ['jetRange', 'ship'] },

    // 数码补充
    { id: 'p32', cat: 'digital', name: '平板电脑', price: 2699, icon: '💻', desc: '影音娱乐', options: ['storagePhone', 'colorBasic'] },
    { id: 'p33', cat: 'digital', name: '无线键盘', price: 199, icon: '⌨️', desc: '静音', options: ['colorBasic', 'warranty'] },

    // 家电家具补充
    { id: 'p34', cat: 'home', name: '空气炸锅', price: 499, icon: '🍟', desc: '少油', options: ['warranty'] },
    { id: 'p35', cat: 'home', name: '扫地机', price: 1599, icon: '🧹', desc: '自动清扫', options: ['warranty', 'ship'] },
    { id: 'p36', cat: 'home', name: '衣帽架', price: 189, icon: '🪵', desc: '稳固', options: ['colorBasic'] },

    // 美妆补充
    { id: 'p37', cat: 'beauty', name: '口红', price: 199, icon: '💄', desc: '显色', options: ['scent', 'volume'] },
    { id: 'p38', cat: 'beauty', name: '粉底液', price: 239, icon: '🧴', desc: '持妆', options: ['scent', 'volume'] },

    // 零食补充
    { id: 'p39', cat: 'food', name: '软糖', price: 16, icon: '🍬', desc: 'Q弹', options: ['snackPack'] },
    { id: 'p40', cat: 'food', name: '海苔', price: 18, icon: '🟩', desc: '低脂', options: ['snackPack'] },

    // 服饰补充
    { id: 'p41', cat: 'wear', name: '连帽外套', price: 199, icon: '🧥', desc: '防风', options: ['sizeWear', 'styleWear'] },
    { id: 'p42', cat: 'wear', name: '运动袜', price: 39, icon: '🧦', desc: '吸汗', options: ['sizeWear'] },

    // 奢品补充
    { id: 'p43', cat: 'lux', name: '卡包', price: 1800, icon: '💳', desc: '小巧', options: ['bagColor'] },
    { id: 'p44', cat: 'lux', name: '丝巾', price: 2600, icon: '🧣', desc: '配色', options: ['bagColor'] },

    // 珠宝补充
    { id: 'p45', cat: 'jewel', name: '耳钉', price: 3200, icon: '🪙', desc: '低调', options: ['jewelMaterial', 'jewelSize'] },
    { id: 'p46', cat: 'jewel', name: '胸针', price: 2800, icon: '📌', desc: '点缀', options: ['jewelMaterial'] },

    // 大件补充
    { id: 'p47', cat: 'fleet', name: '房车', price: 520000, icon: '🚐', desc: '露营', options: ['vehicleType', 'vehicleColor'] },
    { id: 'p48', cat: 'fleet', name: '工程车模型', price: 899, icon: '🚜', desc: '收藏', options: ['warranty'] }
  ],

  async init() {
    document.getElementById('shop-back')?.addEventListener('click', async () => {
      const returnPage = State.shopReturnPage;
      const returnSessionId = State.shopReturnSessionId;
      if (returnPage === 'page-chat') {
        // 清理，避免影响后续正常返回
        State.shopReturnPage = null;
        State.shopReturnSessionId = null;

        State.switchPage('page-chat');
        if (returnSessionId && typeof Chat !== 'undefined' && Chat) {
          try {
            if (Chat.currentSessionId !== returnSessionId) Chat.currentSessionId = returnSessionId;
            if (typeof Chat.loadMessages === 'function') await Chat.loadMessages();
          } catch (e) {}
        }
        return;
      }
      State.backToHome();
    });
    document.getElementById('shop-orders')?.addEventListener('click', () => this.openOrdersModal());
    document.getElementById('shop-cart-fab')?.addEventListener('click', () => this.openCart());
    document.getElementById('shop-cart-close')?.addEventListener('click', () => this.closeCart());
    document.getElementById('shop-cart-clear')?.addEventListener('click', () => this.clearCart());
    document.getElementById('shop-cart-pay')?.addEventListener('click', () => this._precheckWalletThenPay());
    document.getElementById('shop-cart-help')?.addEventListener('click', () => this._requestProxyPayFromCart());

    document.getElementById('shop-item-close')?.addEventListener('click', () => this.closeDetail());
    document.getElementById('shop-item-x')?.addEventListener('click', () => this.closeDetail());
    document.getElementById('shop-item-add')?.addEventListener('click', () => this.confirmAdd());

    // 新增商品（统一弹窗）
    document.getElementById('shop-admin-item-close')?.addEventListener('click', () => this.closeAdminItemModal());
    document.getElementById('shop-admin-item-x')?.addEventListener('click', () => this.closeAdminItemModal());
    document.getElementById('shop-admin-item-save')?.addEventListener('click', () => this.confirmAdminAddItem());
    document.getElementById('shop-admin-item-style-add')?.addEventListener('click', () => this._adminAddStyleChoice());
    document.getElementById('shop-admin-item-style-input')?.addEventListener('keydown', (e) => {
      if (e?.key === 'Enter') {
        e.preventDefault();
        this._adminAddStyleChoice();
      }
    });
    document.getElementById('shop-admin-item-style-input')?.addEventListener('input', () => this._refreshAdminStyleAddState());
    document.getElementById('shop-admin-item-style-input')?.addEventListener('change', () => this._refreshAdminStyleAddState());
    document.getElementById('shop-admin-item-style-input')?.addEventListener('focus', () => this._scrollAdminItemModalToBottom());
    document.getElementById('shop-admin-item-new-cat-toggle')?.addEventListener('click', () => {
      const fields = document.getElementById('shop-admin-item-new-cat-fields');
      const toggleBtn = document.getElementById('shop-admin-item-new-cat-toggle');
      const catSel = document.getElementById('shop-admin-item-category');
      if (!fields || !toggleBtn) return;
      const isShown = fields.style.display !== 'none';
      fields.style.display = isShown ? 'none' : 'block';
      if (catSel) catSel.style.display = isShown ? '' : 'none';
      toggleBtn.textContent = isShown ? '+ 新增分类' : '取消新增分类';
      if (!isShown) this._scrollAdminItemModalToBottom();
    });
    document.getElementById('shop-admin-item-new-cat-save')?.addEventListener('click', () => this.confirmAdminAddCategoryInline());
    document.getElementById('shop-app-switch')?.addEventListener('click', () => this.openShopAppPicker());
    document.getElementById('shop-app-manage-back')?.addEventListener('click', () => State.switchPage('page-shop'));
    document.getElementById('shop-app-manage-add')?.addEventListener('click', () => this.openShopManagerActionPicker());

    document.getElementById('shop-cart-address')?.addEventListener('input', (e) => {
      this._addr = String(e.target?.value || '');
      this._persistSoon();
    });

    // 支付面板事件
    document.getElementById('shop-pay-close')?.addEventListener('click', () => this.closePaySheet());
    document.getElementById('shop-pay-x')?.addEventListener('click', () => this.closePaySheet());
    document.getElementById('shop-pay-kb')?.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button[data-k]');
      const k = btn?.getAttribute?.('data-k');
      if (!k) return;
      this._handlePayKey(k);
    });
    document.getElementById('shop-pay-forgot')?.addEventListener('click', () => {
      this.closePaySheet();
      State.switchPage('page-wallet');
      setTimeout(() => {
        try { if (typeof Wallet !== 'undefined' && Wallet.openPasswordModal) Wallet.openPasswordModal(); } catch (e) {}
      }, 220);
    });

    // 订单页事件
    document.getElementById('shop-orders-close')?.addEventListener('click', () => this.closeOrdersModal());
    document.getElementById('shop-orders-x')?.addEventListener('click', () => this.closeOrdersModal());
    document.getElementById('shop-order-detail-close')?.addEventListener('click', () => this.closeOrderDetail());
    document.getElementById('shop-order-detail-x')?.addEventListener('click', () => this.closeOrderDetail());
    document.getElementById('shop-order-share')?.addEventListener('click', () => {
      const modal = document.getElementById('shop-order-detail');
      const orderId = modal?.dataset?.orderId;
      if (!orderId) return;
      this._openShareSessionPickerById(orderId);
    });

    await this._loadPersisted();
    if (!this._baseOptionDefs) {
      this._baseOptionDefs = JSON.parse(JSON.stringify(this._optionDefs || {}));
    }
    await this._loadShopAppsPersisted();
    await this._loadAdminPersisted();
    this._syncActiveAdminDataFromCurrentApp();
    this._applyAdminDataToMemory();
    if (State?.currentPage === 'page-shop') this.render();

    window.addEventListener('yd:pagechange', (e) => {
      const to = e?.detail?.to;
      if (to === 'page-shop') {
        this._currentCat = 'all';
        this.render();
      }
      if (to === 'page-shop-app-manager') this.renderShopAppManager();
    });
  },

  render() {
    const cats = this._getAllCats();
    const hasCurCat = cats.some((c) => String(c?.id || '') === String(this._currentCat || ''));
    if (!hasCurCat) this._currentCat = 'all';
    this._renderAppHeader();
    this._renderCats();
    this._renderGrid();
    this._renderBadge();
    const addrInput = document.getElementById('shop-cart-address');
    if (addrInput) addrInput.value = this._addr || '';
  },

  _fmtPrice(n) {
    const num = Number(n || 0);
    if (!Number.isFinite(num)) return '0';
    if (num >= 10000) {
      const w = num / 10000;
      const s = (Math.round(w * 10) % 10 === 0) ? String(Math.round(w)) : w.toFixed(1);
      return `${s}万`;
    }
    return Math.round(num).toLocaleString('zh-CN');
  },

  _getAllCats() {
    const app = this._getCurrentShopApp();
    const isDefaultApp = String(app?.id || '') === 'shop_app_default';
    const base = isDefaultApp ? (this._cats || []) : [];
    const merged = [...base, ...(this._userNavItems || [])].filter((c) => c && c.id);
    const allCat = merged.find((c) => String(c.id) === 'all') || { id: 'all', name: '推荐', icon: '⭐' };
    const rest = merged.filter((c) => String(c.id) !== 'all');
    return [allCat, ...rest];
  },

  _getAllItems() {
    const app = this._getCurrentShopApp();
    const isDefaultApp = String(app?.id || '') === 'shop_app_default';
    const base = isDefaultApp ? (this._items || []) : [];
    return [...base, ...(this._userItemsFlat || [])];
  },

  _makeDefaultShopApp() {
    return {
      id: 'shop_app_default',
      name: '默认',
      icon: '',
      desc: '默认购物App',
      createdAt: Date.now(),
      data: {
        userNavItems: [],
        userCategoryItems: {},
        userOptionDefs: {}
      }
    };
  },

  _sanitizeShopAppData(data) {
    const d = data && typeof data === 'object' ? data : {};
    return {
      userNavItems: Array.isArray(d.userNavItems) ? d.userNavItems : [],
      userCategoryItems: d.userCategoryItems && typeof d.userCategoryItems === 'object' ? d.userCategoryItems : {},
      userOptionDefs: d.userOptionDefs && typeof d.userOptionDefs === 'object' ? d.userOptionDefs : {}
    };
  },

  _normalizeShopApps(apps) {
    const arr = Array.isArray(apps) ? apps.filter(Boolean) : [];
    const out = arr.map((app) => {
      const id = String(app?.id || '').trim() || `shop_app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      return {
        id,
        name: String(app?.name || '未命名').trim() || '未命名',
        icon: String(app?.icon || '').trim(),
        desc: String(app?.desc || '').trim(),
        createdAt: Number(app?.createdAt) || Date.now(),
        data: this._sanitizeShopAppData(app?.data)
      };
    });
    if (!out.length) out.push(this._makeDefaultShopApp());
    return out;
  },

  _getCurrentShopApp() {
    const list = this._normalizeShopApps(this._shopApps);
    const curId = String(this._currentAppId || '').trim();
    return list.find((x) => x.id === curId) || list[0];
  },

  _syncActiveAdminDataFromCurrentApp() {
    const app = this._getCurrentShopApp();
    if (!app) return;
    this._currentAppId = app.id;
    const data = this._sanitizeShopAppData(app.data);
    this._userNavItems = data.userNavItems;
    this._userCategoryItems = data.userCategoryItems;
    this._userOptionDefs = data.userOptionDefs;
  },

  _writeActiveAdminDataToCurrentApp() {
    const list = this._normalizeShopApps(this._shopApps);
    const cur = this._getCurrentShopApp();
    const idx = list.findIndex((x) => x.id === cur.id);
    if (idx < 0) return;
    list[idx] = {
      ...list[idx],
      data: this._sanitizeShopAppData({
        userNavItems: this._userNavItems,
        userCategoryItems: this._userCategoryItems,
        userOptionDefs: this._userOptionDefs
      })
    };
    this._shopApps = list;
  },

  _renderAppHeader() {
    const app = this._getCurrentShopApp();
    const nameEl = document.getElementById('shop-app-current');
    if (nameEl) {
      const icon = String(app?.icon || '').trim();
      const name = String(app?.name || '默认');
      nameEl.textContent = icon ? `${icon} ${name}` : name;
    }
  },

  _getAppItemCount(app) {
    const data = this._sanitizeShopAppData(app?.data);
    let count = 0;
    Object.values(data.userCategoryItems || {}).forEach((items) => {
      if (Array.isArray(items)) count += items.length;
    });
    const isDefaultApp = String(app?.id || '') === 'shop_app_default';
    if (isDefaultApp) {
      return count + (Array.isArray(this._items) ? this._items.length : 0);
    }
    return count;
  },

  async _loadShopAppsPersisted() {
    let apps = null;
    let curId = '';
    try {
      apps = await Storage.kvGet(this.STORAGE_KEY_APPS);
      curId = String((await Storage.kvGet(this.STORAGE_KEY_CURRENT_APP)) || '').trim();
    } catch (e) {
      try {
        apps = Storage.get(this.STORAGE_KEY_APPS);
        curId = String(Storage.get(this.STORAGE_KEY_CURRENT_APP) || '').trim();
      } catch (e2) {}
    }
    this._shopApps = this._normalizeShopApps(apps);
    this._currentAppId = curId && this._shopApps.some((x) => x.id === curId) ? curId : this._shopApps[0].id;
  },

  _renderCats() {
    const el = document.getElementById('shop-cats');
    if (!el) return;

    const addCategoryId = '__shop_admin_add_category__';
    const allCats = this._getAllCats();
    const renderCats = [
      ...(allCats || []),
      { id: addCategoryId, icon: '＋', name: '新增', _isAddCategoryTile: true }
    ];

    el.innerHTML = renderCats.map(c => {
      const isAdd = !!c._isAddCategoryTile;
      const pressed = c.id === this._currentCat && !isAdd;
      return `
        <button class="yd-shop-cat${isAdd ? ' yd-shop-cat--add' : ''}" type="button" data-id="${this._esc(c.id)}" aria-pressed="${pressed}">
          <div class="yd-shop-cat__icon">${this._esc(c.icon)}</div>
          <div class="yd-shop-cat__name">${this._esc(c.name)}</div>
        </button>
      `;
    }).join('');

    el.querySelectorAll('.yd-shop-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;

        if (id === addCategoryId) {
          this.openShopAppManager();
          setTimeout(() => this.openShopManagerActionPicker(), 0);
          return;
        }

        this._currentCat = id;
        this._renderCats();
        this._renderGrid();
      });
    });
  },

  _filteredItems() {
    const all = this._getAllItems();
    if (this._currentCat === 'all') return all.slice();
    return all.filter(i => i.cat === this._currentCat);
  },

  _renderGrid() {
    const title = document.getElementById('shop-section-title');
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    if (title) {
      const cat = this._getAllCats().find(c => c.id === this._currentCat);
      title.textContent = cat ? cat.name : '猜你喜欢';
    }
    const list = this._filteredItems()
      .slice()
      .sort((a, b) => {
        const au = !!a?.__isUserAdded;
        const bu = !!b?.__isUserAdded;
        if (au === bu) return 0;
        return au ? -1 : 1;
      });

    grid.innerHTML = list.map(it => {
      const isUser = !!it?.__isUserAdded;
      const customId = String(it?.__customId || '');
      return `
        <div class="yd-shop-card" role="button" data-id="${this._esc(it.id)}">
          ${isUser ? `
            <div class="yd-takeout-item-menu">
              <button class="yd-takeout-item-menu__trigger" type="button" data-custom-id="${this._esc(customId)}" data-cat-id="${this._esc(it.cat)}" aria-label="更多">⋯</button>
              <div class="yd-takeout-item-menu__panel" hidden>
                <button class="yd-takeout-item-menu__delete" type="button" data-custom-id="${this._esc(customId)}" data-cat-id="${this._esc(it.cat)}">删除</button>
              </div>
            </div>
          ` : ''}
          <div class="yd-shop-card__img">${this._esc(it.icon)}</div>
          <div class="yd-shop-card__body">
            <div class="yd-shop-card__name">${this._esc(it.name)}</div>
            <div class="yd-shop-card__desc">${this._esc(it.desc || '')}</div>
            <div class="yd-shop-card__row">
              <div class="yd-shop-card__price">¥${this._fmtPrice(it.price)}</div>
              <button class="yd-shop-card__add" type="button" data-id="${this._esc(it.id)}" aria-label="加入购物车">+</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.yd-shop-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // 避免点到 + 触发两次
        const add = e?.target?.closest?.('.yd-shop-card__add');
        const menuBtn = e?.target?.closest?.('.yd-takeout-item-menu__trigger, .yd-takeout-item-menu__delete');
        if (add || menuBtn) return;
        const id = card.getAttribute('data-id');
        if (!id) return;
        this.openDetail(id);
      });
    });
    grid.querySelectorAll('.yd-shop-card__add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!id) return;
        this.openDetail(id);
      });
    });

    grid.querySelectorAll('.yd-takeout-item-menu__trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.yd-shop-card');
        const panel = card?.querySelector('.yd-takeout-item-menu__panel');
        if (!panel) return;
        const isHidden = panel.hasAttribute('hidden');
        grid.querySelectorAll('.yd-takeout-item-menu__panel').forEach(p => p.setAttribute('hidden', 'true'));
        if (isHidden) panel.removeAttribute('hidden');
      });
    });

    grid.querySelectorAll('.yd-takeout-item-menu__delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const customId = String(btn.getAttribute('data-custom-id') || '');
        const catId = String(btn.getAttribute('data-cat-id') || '');
        if (!customId || !catId) return;
        if (!confirm('是否要删除这个商品？')) return;
        this._deleteUserItem(catId, customId);
      });
    });
  },

  openShopAppPicker() {
    const existing = document.getElementById('yd-shop-app-picker');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-shop-app-picker';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">购物App列表</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-forum-picker__list" id="yd-shop-app-picker-list"></div>
        <div class="yd-forum-picker__footer">
          <button type="button" class="yd-forum-picker__add" id="yd-shop-app-add">＋ 新增购物App</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const listEl = modal.querySelector('#yd-shop-app-picker-list');
    const render = () => {
      const apps = this._normalizeShopApps(this._shopApps);
      const cur = this._getCurrentShopApp();
      if (!listEl) return;
      listEl.innerHTML = apps.map((app) => {
        const isCurrent = app.id === cur.id;
        const count = this._getAppItemCount(app);
        const desc = String(app?.desc || '').trim();
        return `
          <div class="yd-forum-item yd-shop-app-item">
            <div class="yd-shop-app-item__top">
              <div class="yd-forum-item__main">
                <div class="yd-forum-item__name">${app.icon ? `${this._esc(app.icon)} ` : ''}${this._esc(app.name || '未命名')}</div>
                <div class="yd-forum-item__desc">${count}件商品</div>
              </div>
              <div class="yd-forum-item__actions">
                <button type="button" class="yd-forum-item__btn" data-act="manage" data-id="${this._esc(app.id)}">编辑</button>
                <button type="button" class="yd-forum-item__btn ${isCurrent ? 'yd-forum-item__btn--current' : 'yd-forum-item__btn--primary'}" data-act="switch" data-id="${this._esc(app.id)}" ${isCurrent ? 'disabled' : ''}>${isCurrent ? '当前' : '去购物'}</button>
              </div>
            </div>
            <div class="yd-shop-app-item__desc-line">
              ${this._esc(desc || '暂无描述')}
            </div>
          </div>
        `;
      }).join('');
      listEl.querySelectorAll('[data-act="switch"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = String(btn.getAttribute('data-id') || '').trim();
          if (!id) return;
          this.switchShopApp(id);
          close();
        });
      });
      listEl.querySelectorAll('[data-act="manage"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = String(btn.getAttribute('data-id') || '').trim();
          if (!id) return;
          this.switchShopApp(id);
          close();
          this.openShopAppManager();
        });
      });
    };
    render();

    modal.querySelector('#yd-shop-app-add')?.addEventListener('click', () => {
      close();
      this.openShopAppCreateComposer();
    });
  },

  openShopAppCreateComposer() {
    const existing = document.getElementById('yd-shop-app-create-compose');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'yd-shop-app-create-compose';
    modal.className = 'yd-forum-compose';
    modal.innerHTML = `
      <div class="yd-forum-compose__mask" data-close="1"></div>
      <div class="yd-forum-compose__panel yd-shop-app-create-panel" role="dialog" aria-modal="true">
        <div class="yd-forum-compose__bar">
          <div class="yd-forum-compose__title">新增购物App</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-shop-app-create-panel__body">
          <input class="yd-forum-compose__input" id="yd-shop-app-create-name" placeholder="请输入购物App名称" />
          <input class="yd-forum-compose__input" id="yd-shop-app-create-icon" placeholder="请输入图标（例如：🛒）（可选）" />
          <textarea class="yd-forum-compose__textarea" id="yd-shop-app-create-desc" placeholder="请输入购物App描述（可选）"></textarea>
        </div>
        <div class="yd-shop-app-create-panel__footer">
          <button type="button" class="yd-forum-item__btn" data-close="1">取消</button>
          <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-shop-app-create-submit" disabled>创建并切换</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });
    const nameEl = modal.querySelector('#yd-shop-app-create-name');
    const iconEl = modal.querySelector('#yd-shop-app-create-icon');
    const descEl = modal.querySelector('#yd-shop-app-create-desc');
    const submitBtn = modal.querySelector('#yd-shop-app-create-submit');
    const refresh = () => {
      const ok = String(nameEl?.value || '').trim().length > 0;
      if (submitBtn) submitBtn.disabled = !ok;
    };
    nameEl?.addEventListener('input', refresh);
    nameEl?.addEventListener('change', refresh);
    iconEl?.addEventListener('input', refresh);
    iconEl?.addEventListener('change', refresh);
    refresh();
    submitBtn?.addEventListener('click', () => {
      const name = String(nameEl?.value || '').trim();
      if (!name) return;
      const icon = String(iconEl?.value || '').trim();
      const desc = String(descEl?.value || '').trim();
      const app = {
        id: `shop_app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        icon,
        name,
        desc,
        createdAt: Date.now(),
        data: { userNavItems: [], userCategoryItems: {}, userOptionDefs: {} }
      };
      this._shopApps = [...this._normalizeShopApps(this._shopApps), app];
      this.switchShopApp(app.id);
      close();
      this.openShopPostCreatePrompt(app.id);
    });
  },

  openShopPostCreatePrompt(appId) {
    const id = String(appId || '').trim();
    const app = this._normalizeShopApps(this._shopApps).find((x) => x.id === id);
    const existing = document.getElementById('yd-shop-post-create-prompt');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'yd-shop-post-create-prompt';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">已新增购物App</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-forum-item">
          <div class="yd-forum-item__main">
            <div class="yd-forum-item__name">${app?.icon ? `${this._esc(app.icon)} ` : ''}${this._esc(app?.name || '新购物App')}</div>
            <div class="yd-forum-item__desc">当前App暂无商品，是否立即新增商品？</div>
          </div>
          <div class="yd-forum-item__actions">
            <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-shop-post-create-go">去新增</button>
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
    modal.querySelector('#yd-shop-post-create-go')?.addEventListener('click', () => {
      close();
      this.openShopAppManager();
      setTimeout(() => this.openShopManagerActionPicker(), 0);
    });
  },

  switchShopApp(appId) {
    const id = String(appId || '').trim();
    const list = this._normalizeShopApps(this._shopApps);
    if (!id || !list.some((x) => x.id === id)) return;
    this._shopApps = list;
    this._currentAppId = id;
    this._currentCat = 'all';
    this._syncActiveAdminDataFromCurrentApp();
    this._applyAdminDataToMemory();
    this._persistAdminSoon();
    this.render();
    if (State?.currentPage === 'page-shop-app-manager') this.renderShopAppManager();
  },

  openShopAppManager() {
    State.switchPage('page-shop-app-manager');
    this.renderShopAppManager();
  },

  renderShopAppManager() {
    const titleEl = document.getElementById('shop-app-manage-title');
    if (titleEl) titleEl.textContent = `商品管理`;

    const appInfoEl = document.getElementById('shop-app-manager-appinfo');
    const curApp = this._getCurrentShopApp();
    if (appInfoEl) {
      const icon = String(curApp?.icon || '').trim();
      const name = String(curApp?.name || '未命名');
      const desc = String(curApp?.desc || '').trim();
      appInfoEl.innerHTML = `
        <div class="yd-shop-appinfo">
          <div class="yd-shop-appinfo__left">
            ${icon ? `<div class="yd-shop-appinfo__icon">${this._esc(icon)}</div>` : ''}
            <div class="yd-shop-appinfo__main">
              <div class="yd-shop-appinfo__name">${this._esc(name)}</div>
              <div class="yd-shop-appinfo__desc">${this._esc(desc || '暂无描述')}</div>
            </div>
          </div>
          <div class="yd-shop-appinfo__actions">
            <button type="button" class="yd-shop-appinfo__btn" id="yd-shop-app-edit">编辑</button>
            <button type="button" class="yd-shop-appinfo__btn yd-shop-appinfo__btn--danger" id="yd-shop-app-del">删除</button>
          </div>
        </div>
      `;
      appInfoEl.querySelector('#yd-shop-app-edit')?.addEventListener('click', () => this.openShopAppEditComposer(curApp?.id));
      appInfoEl.querySelector('#yd-shop-app-del')?.addEventListener('click', () => this.deleteShopAppById(curApp?.id));
    }

    const catsEl = document.getElementById('shop-app-manager-cats');
    const itemsEl = document.getElementById('shop-app-manager-items');
    if (itemsEl) itemsEl.innerHTML = '';
    if (!catsEl) return;
    const cats = this._getAllCats().filter((c) => c && c.id && c.id !== 'all');
    if (!cats.length) {
      catsEl.innerHTML = `<div class="yd-shop-admin-app-row"><div class="yd-shop-admin-app-row__sub">暂无分类</div></div>`;
      return;
    }

    const allItems = this._getAllItems();
    catsEl.innerHTML = cats.map((c) => {
      const cid = String(c.id || '');
      const catItems = allItems.filter((it) => String(it?.cat || '') === cid);
      const detailHtml = catItems.length
        ? catItems.map((it) => {
            const attrs = it?.attrs && typeof it.attrs === 'object' ? it.attrs : {};
            const attrsText = Object.entries(attrs).map(([k, v]) => `${k}:${v}`).join(' | ');
            const optText = Array.isArray(it?.options)
              ? it.options.map((oid) => this._optionDefs?.[oid]?.title || oid).join('、')
              : '';
            const hasAttrs = !!attrsText;
            return `
              <div class="yd-shop-admin-app-row yd-shop-admin-app-row--child">
                <div class="yd-shop-admin-app-row__title">${this._esc(it.icon || '📦')} ${this._esc(it.name || '')} · ¥${this._fmtPrice(it.price)}</div>
                <div class="yd-shop-admin-app-row__sub">${this._esc(it.desc || '')}</div>
                <div class="yd-shop-admin-app-row__sub">
                  规格：${this._esc(optText || '无')}
                  ${hasAttrs ? `<span class="yd-shop-admin-app-row__meta">｜参数：${this._esc(attrsText)}</span>` : ''}
                </div>
              </div>
            `;
          }).join('')
        : `<div class="yd-shop-admin-app-row yd-shop-admin-app-row--child"><div class="yd-shop-admin-app-row__sub">该分类暂无商品</div></div>`;
      return `
        <details class="yd-shop-admin-fold">
          <summary class="yd-shop-admin-app-row yd-shop-admin-app-row--folder">
            <div class="yd-shop-admin-app-row__title">${this._esc(c.icon || '📦')} ${this._esc(c.name || '')}</div>
            <div class="yd-shop-admin-app-row__sub">${catItems.length}个商品</div>
            <div class="yd-shop-admin-app-folder__arrow">▸</div>
          </summary>
          <div class="yd-shop-admin-app-folder__detail">
            ${detailHtml}
          </div>
        </details>
      `;
    }).join('');
  },

  openShopAppEditComposer(appId) {
    const id = String(appId || '').trim();
    const apps = this._normalizeShopApps(this._shopApps);
    const app = apps.find((x) => x.id === id) || this._getCurrentShopApp();
    if (!app) return;

    const existing = document.getElementById('yd-shop-app-edit-compose');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'yd-shop-app-edit-compose';
    modal.className = 'yd-forum-compose';
    modal.innerHTML = `
      <div class="yd-forum-compose__mask" data-close="1"></div>
      <div class="yd-forum-compose__panel yd-shop-app-create-panel" role="dialog" aria-modal="true">
        <div class="yd-forum-compose__bar">
          <div class="yd-forum-compose__title">编辑购物App</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-shop-app-create-panel__body">
          <input class="yd-forum-compose__input" id="yd-shop-app-edit-name" placeholder="请输入购物App名称" />
          <input class="yd-forum-compose__input" id="yd-shop-app-edit-icon" placeholder="请输入图标（例如：🛒）（可选）" />
          <textarea class="yd-forum-compose__textarea" id="yd-shop-app-edit-desc" placeholder="请输入购物App描述（可选）"></textarea>
        </div>
        <div class="yd-shop-app-create-panel__footer">
          <button type="button" class="yd-forum-item__btn" data-close="1">取消</button>
          <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-shop-app-edit-submit" disabled>保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const nameEl = modal.querySelector('#yd-shop-app-edit-name');
    const iconEl = modal.querySelector('#yd-shop-app-edit-icon');
    const descEl = modal.querySelector('#yd-shop-app-edit-desc');
    const submitBtn = modal.querySelector('#yd-shop-app-edit-submit');
    if (nameEl) nameEl.value = String(app.name || '').trim();
    if (iconEl) iconEl.value = String(app.icon || '').trim();
    if (descEl) descEl.value = String(app.desc || '').trim();
    const refresh = () => {
      const ok = String(nameEl?.value || '').trim().length > 0;
      if (submitBtn) submitBtn.disabled = !ok;
    };
    nameEl?.addEventListener('input', refresh);
    nameEl?.addEventListener('change', refresh);
    iconEl?.addEventListener('input', refresh);
    iconEl?.addEventListener('change', refresh);
    refresh();
    submitBtn?.addEventListener('click', () => {
      const name = String(nameEl?.value || '').trim();
      if (!name) return;
      const icon = String(iconEl?.value || '').trim();
      const desc = String(descEl?.value || '').trim();
      const list = this._normalizeShopApps(this._shopApps).map((x) => {
        if (x.id !== app.id) return x;
        return { ...x, name, icon, desc };
      });
      this._shopApps = list;
      this._persistAdminSoon();
      this.render();
      if (State?.currentPage === 'page-shop-app-manager') this.renderShopAppManager();
      close();
    });
  },

  deleteShopAppById(appId) {
    const id = String(appId || '').trim();
    if (!id) return;
    const list = this._normalizeShopApps(this._shopApps);
    if (list.length <= 1) {
      alert('至少需要保留一个购物App');
      return;
    }
    const target = list.find((x) => x.id === id);
    const name = String(target?.name || '该App');
    if (!confirm(`确定要删除【${name}】吗？删除后不可恢复。`)) return;
    const next = list.filter((x) => x.id !== id);
    this._shopApps = next;
    if (String(this._currentAppId || '') === id) {
      this._currentAppId = next[0]?.id || 'shop_app_default';
      this._currentCat = 'all';
      this._syncActiveAdminDataFromCurrentApp();
      this._applyAdminDataToMemory();
    }
    this._persistAdminSoon();
    this.render();
    if (State?.currentPage === 'page-shop-app-manager') this.renderShopAppManager();
  },

  openDetail(id) {
    const it = this._getAllItems().find(x => x.id === id);
    if (!it) return;
    const modal = document.getElementById('shop-item-modal');
    if (!modal) return;

    const title = document.getElementById('shop-item-title');
    const hero = document.getElementById('shop-item-hero');
    const price = document.getElementById('shop-item-price');
    const desc = document.getElementById('shop-item-desc');
    const opts = document.getElementById('shop-item-options');

    const itemKey = it.id;
    const optionIds = Array.isArray(it.options) ? it.options.slice(0, 2) : [];
    const prefs = (this._prefs && this._prefs[itemKey]) ? { ...this._prefs[itemKey] } : {};
    Object.keys(prefs).forEach(k => {
      if (!optionIds.includes(k)) delete prefs[k];
    });
    optionIds.forEach(oid => {
      if (!(oid in prefs)) prefs[oid] = '';
    });
    this._detailCtx = { item: it, optionIds, selections: prefs };

    if (title) title.textContent = it.name;
    if (hero) hero.textContent = it.icon || '📦';
    if (price) {
      price.innerHTML = `
        <span class="yd-shop-item-price__num">¥${this._fmtPrice(it.price)}</span>
        <span class="yd-shop-item-price__name">${this._esc(it.name || '')}</span>
      `;
    }
    if (desc) desc.textContent = it.desc || '';
    if (opts) {
      const attrs = it?.attrs && typeof it.attrs === 'object' ? it.attrs : null;
      const attrsEntries = attrs ? Object.entries(attrs).filter(([k, v]) => String(k || '').trim() && String(v ?? '').trim()) : [];
      const attrsHtml = attrsEntries.length
        ? `
          <div class="yd-shop-attrs" aria-label="商品参数">
            <span class="yd-shop-attrs__title">参数 </span>
            <span class="yd-shop-attrs__inline" role="list">
              ${attrsEntries.map(([k, v]) => `
                <span class="yd-shop-attrs__pair" role="listitem">
                  <span class="yd-shop-attrs__pair-v">${this._esc(String(v))}</span>
                  <span class="yd-shop-attrs__pair-k">${this._esc(k)}</span>
                </span>
              `).join('')}
            </span>
          </div>
        `
        : '';
      const optHtml = optionIds.map(oid => this._renderOptGroup(oid)).join('');
      opts.innerHTML = `${attrsHtml}${optHtml}`;
    }

    opts?.querySelectorAll?.('.yd-shop-opt')?.forEach(btn => {
      btn.addEventListener('click', () => {
        const oid = btn.getAttribute('data-oid');
        const cid = btn.getAttribute('data-cid');
        if (!oid || !cid || !this._detailCtx) return;
        this._detailCtx.selections[oid] = cid;
        this._prefs[itemKey] = { ...this._detailCtx.selections };
        this._persistSoon();
        this._refreshDetail();
      });
    });

    modal.classList.add('yd-modal--active');
    modal.setAttribute('aria-hidden', 'false');
    this._refreshDetail();
  },

  _renderOptGroup(optionId) {
    const def = this._optionDefs[optionId];
    if (!def) return '';
    const sel = this._detailCtx?.selections?.[optionId] || '';
    return `
      <div class="yd-shop-opt-group">
        <div class="yd-shop-opt-group__title">${this._esc(def.title)}（必选）</div>
        <div class="yd-shop-opts">
          ${(def.choices || []).map(ch => `
            <button class="yd-shop-opt" type="button" data-oid="${this._esc(optionId)}" data-cid="${this._esc(ch.id)}" aria-pressed="${ch.id === sel}">
              ${this._esc(ch.label)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  _refreshDetail() {
    const modalBtn = document.getElementById('shop-item-add');
    if (!modalBtn || !this._detailCtx) return;
    const ok = this._detailCtx.optionIds.every(oid => {
      const def = this._optionDefs[oid];
      if (!def || !def.required) return true;
      return !!this._detailCtx.selections[oid];
    });
    modalBtn.disabled = !ok;
    const opts = document.getElementById('shop-item-options');
    opts?.querySelectorAll?.('.yd-shop-opt')?.forEach(btn => {
      const oid = btn.getAttribute('data-oid');
      const cid = btn.getAttribute('data-cid');
      if (!oid || !cid) return;
      btn.setAttribute('aria-pressed', String(this._detailCtx.selections[oid] === cid));
    });
  },

  closeDetail() {
    const modal = document.getElementById('shop-item-modal');
    if (!modal) return;
    modal.classList.remove('yd-modal--active');
    modal.setAttribute('aria-hidden', 'true');
    this._detailCtx = null;
  },

  confirmAdd() {
    if (!this._detailCtx) return;
    const it = this._detailCtx.item;
    const optionIds = this._detailCtx.optionIds || [];
    const selections = this._detailCtx.selections || {};
    const ok = optionIds.every(oid => {
      const def = this._optionDefs[oid];
      if (!def || !def.required) return true;
      return !!selections[oid];
    });
    if (!ok) return;
    const cartKey = this._makeCartKey(it.id, optionIds, selections);
    const existing = this._cart[cartKey];
    if (existing) existing.qty = Number(existing.qty || 0) + 1;
    else {
      this._cart[cartKey] = {
        itemId: it.id,
        name: it.name,
        icon: it.icon || '📦',
        unitPrice: Number(it.price || 0),
        optionIds,
        selections: { ...selections },
        qty: 1
      };
    }
    this._persistSoon();
    this._renderBadge();
    this.closeDetail();
  },

  _makeCartKey(itemId, optionIds, selections) {
    const parts = [];
    (optionIds || []).forEach(oid => parts.push(`${oid}=${selections?.[oid] || ''}`));
    return `${itemId}|${parts.join('&')}`;
  },

  _renderBadge() {
    const badge = document.getElementById('shop-cart-badge');
    if (!badge) return;
    const total = Object.values(this._cart).reduce((sum, row) => sum + Number(row?.qty || 0), 0);
    if (total > 0) {
      badge.hidden = false;
      badge.textContent = String(total);
    } else {
      badge.hidden = true;
      badge.textContent = '0';
    }
  },

  openCart() {
    const drawer = document.getElementById('shop-cart-drawer');
    const fab = document.getElementById('shop-cart-fab');
    if (!drawer) return;
    drawer.classList.add('yd-modal--active');
    drawer.setAttribute('aria-hidden', 'false');
    if (fab) { fab.hidden = true; fab.style.display = 'none'; }
    this._renderCartDrawer();
  },

  closeCart() {
    const drawer = document.getElementById('shop-cart-drawer');
    const fab = document.getElementById('shop-cart-fab');
    if (!drawer) return;
    drawer.classList.remove('yd-modal--active');
    drawer.setAttribute('aria-hidden', 'true');
    if (fab) {
      // 支付完成后会打开“订单列表/订单详情”弹窗，此时不要恢复购物车图标
      const ordersModal = document.getElementById('shop-orders');
      const orderDetailModal = document.getElementById('shop-order-detail');
      const ordersOpen = !!ordersModal && ordersModal.getAttribute('aria-hidden') === 'false';
      const orderDetailOpen = !!orderDetailModal && orderDetailModal.getAttribute('aria-hidden') === 'false';
      if (ordersOpen || orderDetailOpen) {
        fab.hidden = true;
        fab.style.display = 'none';
      } else {
        fab.hidden = false;
        fab.style.display = '';
      }
    }
  },

  async _precheckWalletThenPay() {
    const addr = String(this._addr || '').trim();
    const addrInput = document.getElementById('shop-cart-address');
    if (!addr) {
      alert('请先填写配送地址再结算');
      if (addrInput) addrInput.focus();
      return;
    }
    try {
      const wallet = await Storage.kvGet('wallet_v1');
      const activated = !!wallet?.activated;
      const balance = Number(wallet?.balance) || 0;
      if (!activated || balance <= 0) {
        const msg = !activated
          ? '你还未激活银行卡，无法结算。现在去“我的钱包”激活吗？'
          : '银行卡余额为 0，无法结算。现在去“我的钱包”修改余额吗？';
        if (confirm(msg)) {
          this.closeCart();
          State.switchPage('page-wallet');
          if (activated && balance <= 0) {
            setTimeout(() => {
              try { if (typeof Wallet !== 'undefined' && Wallet.openBalanceModal) Wallet.openBalanceModal(); } catch (e) {}
            }, 220);
          }
        }
        return;
      }
    } catch (e) {}

    await this.openPaySheet();
  },

  // 点击“请Ta代付”：先创建一条未支付订单，再让用户选择会话向角色发起代付询问
  async _requestProxyPayFromCart() {
    try {
      const total = Object.values(this._cart || {}).reduce((sum, row) => sum + Number(row.unitPrice || 0) * Number(row.qty || 0), 0);
      if (!total || total <= 0) {
        alert('购物车为空');
        return;
      }

      const addr = String(document.getElementById('shop-cart-address')?.value || '').trim();
      if (!addr) {
        alert('请先填写配送地址再代付');
        document.getElementById('shop-cart-address')?.focus?.();
        return;
      }

      const order = await this._createOrderFromCart(total, { payState: 'unpaid', paidBy: 'unpaid', paidAt: 0 });
      await this._openProxyRequestSessionPicker({ source: 'shop', order });
    } catch (e) {
      console.error('[shop][proxy]request failed', e);
      alert('代付请求失败，请稍后重试');
    }
  },

  async _openProxyRequestSessionPicker({ source, order }) {
    const existing = document.getElementById('shop-proxy-session-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'shop-proxy-session-modal';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="选择会话">
        <div class="yd-modal-header">
          <div style="font-weight:900">代付请求发往哪个会话</div>
          <button type="button" class="yd-btn-close" id="shop-proxy-session-close" aria-label="关闭">×</button>
        </div>
        <div id="shop-proxy-session-list" style="display:flex;flex-direction:column;gap:0;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      const el = document.getElementById('shop-proxy-session-modal');
      if (el) el.remove();
    };
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('shop-proxy-session-close')?.addEventListener('click', close);

    let sessions = [];
    try {
      sessions = await Storage.dbGetAll('sessions');
    } catch (e) {
      sessions = [];
    }

    if (!Array.isArray(sessions) || !sessions.length) {
      const listEl = document.getElementById('shop-proxy-session-list');
      if (listEl) listEl.innerHTML = `<div style="padding:28px 0;text-align:center;color:#999;font-size:13px;">暂无会话</div>`;
      return;
    }

    const getTs = (s) => {
      const u = Number(s && s.updatedAt);
      if (Number.isFinite(u) && u > 0) return u;
      const c = Number(s && s.createdAt);
      if (Number.isFinite(c) && c > 0) return c;
      return 0;
    };
    sessions.sort((a, b) => getTs(b) - getTs(a));

    const listEl = document.getElementById('shop-proxy-session-list');
    if (!listEl) return;
    listEl.innerHTML = sessions.slice(0, 50).map(s => {
      const names = Array.isArray(s?.participantCharacterNames) ? s.participantCharacterNames.filter(Boolean) : [];
      const label = names.length ? names.join('、') : (s?.title || '默认AI');
      return `
        <div class="yd-list-item" role="button" tabindex="0" data-session-id="${this._esc(String(s.id || ''))}">
          <div class="yd-list-item__avatar">💬</div>
          <div class="yd-list-item__content">
            <div class="yd-list-item__header">
              <div class="yd-list-item__title">${this._esc(s.title || label)}</div>
              <div class="yd-list-item__time">${this._esc(this._formatTime(getTs(s)) || '')}</div>
            </div>
            <div class="yd-list-item__subtitle">${this._esc(label)}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-session-id]').forEach(item => {
      const sid = item.getAttribute('data-session-id');
      if (!sid) return;
      const run = async () => {
        try {
          close();
          if (typeof Chat === 'undefined' || !Chat) return;
          await Chat.openSession(sid);

          // 代付请求走 [分享] 中文协议：应用|资源|动作|主键|标题|金额|状态|时间|地址|...
          const escPipe = (v) => String(v ?? '').replace(/\|/g, '｜');
          const items = Array.isArray(order.items) ? order.items : [];
          const parts = [
            '商城',
            '订单',
            '邀请代付',
            escPipe(order.id),
            escPipe('购物订单'),
            escPipe(String(order.total || 0)),
            '未支付',
            escPipe(String(order.ts || 0)),
            escPipe(order.address || '')
          ];
          items.forEach(it => {
            parts.push(escPipe(it?.icon || ''));
            parts.push(escPipe(it?.name || ''));
            parts.push(escPipe(String(it?.qty || 0)));
            parts.push(escPipe(String(it?.specText || '')));
            parts.push(escPipe(String(it?.unitPrice || 0)));
          });
          const reqText = `[分享]${parts.join('|')}`;

          await Chat._queueUserMessage(reqText);
          await Chat._flushPendingMessages();
        } catch (e) {
          console.error('[shop][proxy]send failed', e);
          alert('代付询问发送失败，请稍后重试');
        }
      };
      item.addEventListener('click', run);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') run();
      });
    });
  },

  async openPaySheet() {
    const total = Object.values(this._cart).reduce((sum, row) => sum + Number(row.unitPrice || 0) * Number(row.qty || 0), 0);
    if (!total || total <= 0) {
      alert('购物车为空');
      return;
    }
    const sheet = document.getElementById('shop-pay');
    if (!sheet) return;
    this._payPwd = '';
    sheet.setAttribute('aria-hidden', 'false');
    const forgot = document.getElementById('shop-pay-forgot');
    if (forgot) forgot.hidden = true;

    const amountEl = document.getElementById('shop-pay-amount');
    if (amountEl) amountEl.textContent = this._formatCny(total);

    const rows = Object.values(this._cart || {}).filter(Boolean);
    const totalQty = rows.reduce((s, r) => s + (Number(r?.qty) || 0), 0);
    const names = [];
    for (const r of rows) {
      const n = String(r?.name || '').trim();
      if (n) names.push(n);
      if (names.length >= 2) break;
    }
    const descEl = document.getElementById('shop-pay-desc');
    if (descEl) {
      const a = names[0] || '商品';
      const b = names[1] || '';
      descEl.textContent = `购买 ${b ? `${a}、${b}` : a} ${totalQty || 0}件商品`;
    }

    let balance = 0;
    try {
      const wallet = await Storage.kvGet('wallet_v1');
      balance = Number(wallet?.balance) || 0;
    } catch (e) {}
    const methodEl = document.getElementById('shop-pay-method');
    if (methodEl) methodEl.textContent = `银行卡（余额：${this._formatCny(balance)}）`;
    this._renderPayBoxes();
  },

  closePaySheet() {
    if (this._payProcessing) return;
    const sheet = document.getElementById('shop-pay');
    if (!sheet) return;
    sheet.setAttribute('aria-hidden', 'true');
    this._payPwd = '';
    const forgot = document.getElementById('shop-pay-forgot');
    if (forgot) forgot.hidden = true;
  },

  _renderPayBoxes() {
    const boxes = document.querySelectorAll('#shop-pay-boxes .yd-shop-pay__box');
    const pwd = String(this._payPwd || '');
    boxes.forEach((b, i) => b.classList.toggle('is-filled', !!pwd[i]));
  },

  async _handlePayKey(k) {
    if (this._payProcessing) return;
    if (k === 'del') {
      this._payPwd = String(this._payPwd || '').slice(0, -1);
      this._renderPayBoxes();
      return;
    }
    if (k === 'clear') {
      this._payPwd = '';
      this._renderPayBoxes();
      return;
    }
    if (!/^\d$/.test(k)) return;
    if (String(this._payPwd || '').length >= 6) return;
    this._payPwd = String(this._payPwd || '') + k;
    this._renderPayBoxes();
    if (this._payPwd.length === 6) await this._tryPay();
  },

  async _showPayProcessing(ms = 1000) {
    let mask = document.getElementById('shop-pay-processing');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'shop-pay-processing';
      mask.className = 'yd-shop-pay-processing';
      mask.setAttribute('aria-hidden', 'true');
      mask.innerHTML = `
        <div class="yd-shop-pay-processing__box" role="status" aria-live="polite">
          <div class="yd-shop-pay-processing__spinner" aria-hidden="true"></div>
          <div class="yd-shop-pay-processing__text">正在支付，请稍候…</div>
        </div>
      `;
      document.body.appendChild(mask);
    }
    mask.setAttribute('aria-hidden', 'false');
    await new Promise(resolve => setTimeout(resolve, Math.max(350, Number(ms) || 0)));
  },

  _hidePayProcessing() {
    const mask = document.getElementById('shop-pay-processing');
    if (!mask) return;
    mask.setAttribute('aria-hidden', 'true');
  },

  async _tryPay() {
    const total = Object.values(this._cart).reduce((sum, row) => sum + Number(row.unitPrice || 0) * Number(row.qty || 0), 0);
    try {
      const wallet = await Storage.kvGet('wallet_v1');
      if (!wallet?.activated) {
        alert('请先在“我的钱包”激活银行卡');
        this._payPwd = '';
        this._renderPayBoxes();
        return;
      }
      const payPwd = String(wallet?.payPwd || '').trim();
      if (!/^\d{6}$/.test(payPwd)) {
        alert('请先在“我的钱包”设置支付密码');
        this._payPwd = '';
        this._renderPayBoxes();
        return;
      }
      if (String(this._payPwd || '') !== payPwd) {
        alert('支付密码错误');
        const forgot = document.getElementById('shop-pay-forgot');
        if (forgot) forgot.hidden = false;
        this._payPwd = '';
        this._renderPayBoxes();
        return;
      }

      this._payProcessing = true;
      await this._showPayProcessing(1000);

      const balance = Number(wallet.balance) || 0;
      if (balance < total) {
        this._hidePayProcessing();
        this._payProcessing = false;
        alert('余额不足');
        this._payPwd = '';
        this._renderPayBoxes();
        return;
      }

      wallet.balance = Math.round((balance - total) * 100) / 100;
      wallet.bills = Array.isArray(wallet.bills) ? wallet.bills : [];
      wallet.bills.push({
        id: State.generateId(),
        ts: Date.now(),
        title: '购物支付',
        amount: -Math.round(total * 100) / 100
      });
      await Storage.kvSet('wallet_v1', wallet);

      const order = await this._createOrderFromCart(total, { payState: 'paid', paidBy: 'self', paidAt: Date.now() });
      this._hidePayProcessing();
      this._payProcessing = false;
      this.openOrderDetail(order);
      this.closePaySheet();
      this.clearCart();
      this.closeCart();
    } catch (e) {
      this._hidePayProcessing();
      this._payProcessing = false;
      console.error('shop pay failed', e);
      alert('支付失败');
      this._payPwd = '';
      this._renderPayBoxes();
    }
  },

  async _createOrderFromCart(total, payMeta = null) {
    const rows = Object.keys(this._cart || {}).map(k => ({ key: k, ...this._cart[k] })).filter(r => r && typeof r === 'object');
    const items = rows.map(r => ({
      name: String(r.name || '').trim(),
      icon: r.icon || '',
      qty: Number(r.qty || 0),
      unitPrice: Number(r.unitPrice || 0),
      selections: r.selections || {},
      optionIds: r.optionIds || [],
      // 用于聊天分享/订单回显展示的 SKU 参数文本
      specText: this._formatOrderItemOptions(r.optionIds, r.selections)
    })).filter(x => x.name && x.qty > 0);

    const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const names = items.map(it => it.name).filter(Boolean);
    const title = names.slice(0, 2).join('、') || '购物订单';
    const now = Date.now();
    const resolvedPayState = payMeta?.payState || 'paid';
    const resolvedPaidBy = payMeta?.paidBy || 'self';

    const order = {
      id: State.generateId(),
      ts: now,
      title,
      total: Math.round(Number(total || 0) * 100) / 100,
      qty: totalQty,
      address: String(this._addr || '').trim(),
      items,
      payState: resolvedPayState,
      paidBy: resolvedPaidBy,
      paidAt: payMeta?.paidAt || (resolvedPayState === 'paid' ? now : 0)
    };

    let list = [];
    try {
      const existing = await Storage.kvGet(this.STORAGE_KEY_ORDERS);
      if (Array.isArray(existing)) list = existing;
    } catch (e) {}
    list.unshift(order);
    await Storage.kvSet(this.STORAGE_KEY_ORDERS, list);
    return order;
  },

  clearCart() {
    this._cart = {};
    this._persistSoon();
    this._renderBadge();
    this._renderCartDrawer();
  },

  _renderCartDrawer() {
    const list = document.getElementById('shop-cart-list');
    const totalEl = document.getElementById('shop-cart-total');
    if (!list || !totalEl) return;
    const rows = Object.keys(this._cart || {}).map(k => ({ key: k, ...this._cart[k] }));
    if (!rows.length) {
      list.innerHTML = `<div style="padding:28px 0;text-align:center;color:#999;font-size:13px;">购物车空空的</div>`;
      totalEl.textContent = '¥0';
      return;
    }

    const formatOpts = (row) => {
      const labels = [];
      (row.optionIds || []).forEach(oid => {
        const def = this._optionDefs[oid];
        const cid = row.selections?.[oid];
        if (!def || !cid) return;
        const ch = (def.choices || []).find(x => x.id === cid);
        if (ch) labels.push(`${def.title}：${ch.label}`);
      });
      return labels.join(' · ');
    };

    list.innerHTML = rows.map(row => `
      <div class="yd-shop-cart-row" data-key="${this._esc(row.key)}">
        <div class="yd-shop-cart-row__icon">${this._esc(row.icon)}</div>
        <div class="yd-shop-cart-row__main">
          <div class="yd-shop-cart-row__name">${this._esc(row.name)}</div>
          <div class="yd-shop-cart-row__opts">${this._esc(formatOpts(row))}</div>
        </div>
        <div class="yd-shop-cart-row__right">
          <div class="yd-shop-cart-row__price">¥${this._fmtPrice(Number(row.unitPrice || 0) * Number(row.qty || 0))}</div>
          <div class="yd-shop-cart-row__stepper">
            <button type="button" data-act="minus" aria-label="减少">−</button>
            <span>${Number(row.qty || 0)}</span>
            <button type="button" data-act="plus" aria-label="增加">＋</button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.yd-shop-cart-row button').forEach(btn => {
      btn.addEventListener('click', () => {
        const rowEl = btn.closest('.yd-shop-cart-row');
        const key = rowEl?.getAttribute('data-key');
        const act = btn.getAttribute('data-act');
        if (!key || !this._cart[key]) return;
        const cur = Number(this._cart[key].qty || 0);
        if (act === 'plus') this._cart[key].qty = cur + 1;
        if (act === 'minus') {
          const next = cur - 1;
          if (next <= 0) delete this._cart[key];
          else this._cart[key].qty = next;
        }
        this._persistSoon();
        this._renderBadge();
        this._renderCartDrawer();
      });
    });

    const total = Object.values(this._cart).reduce((sum, row) => sum + Number(row.unitPrice || 0) * Number(row.qty || 0), 0);
    totalEl.textContent = `¥${this._fmtPrice(total)}`;
  },

  async openOrdersModal() {
    const modal = document.getElementById('shop-orders-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    // 订单列表页不显示购物车（与外卖一致）
    const fab = document.getElementById('shop-cart-fab');
    if (fab) { fab.hidden = true; fab.style.display = 'none'; }
    await this._renderOrdersList();
  },

  closeOrdersModal() {
    const modal = document.getElementById('shop-orders-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    // 如果订单列表仍在显示（例如从详情返回列表），或购物车抽屉仍打开，则不恢复购物车图标
    const drawer = document.getElementById('shop-cart-drawer');
    const drawerActive = drawer?.getAttribute('aria-hidden') === 'false';
    const ordersModal = document.getElementById('shop-orders-modal');
    const ordersOpen = ordersModal?.getAttribute('aria-hidden') === 'false';
    const fab = document.getElementById('shop-cart-fab');
    if (fab) {
      const hide = !!drawerActive || !!ordersOpen;
      fab.hidden = hide;
      fab.style.display = hide ? 'none' : '';
    }
  },

  async _renderOrdersList() {
    const listEl = document.getElementById('shop-orders-list');
    if (!listEl) return;
    let orders = [];
    try {
      const existing = await Storage.kvGet(this.STORAGE_KEY_ORDERS);
      if (Array.isArray(existing)) orders = existing;
    } catch (e) {}
    if (!orders.length) {
      listEl.innerHTML = `<div style="padding:28px 0;text-align:center;color:#999;font-size:13px;">暂无订单</div>`;
      return;
    }
    const payLabel = (o) => {
      const ps = String(o?.payState || '');
      const pb = String(o?.paidBy || '');
      if (ps === 'proxy_paid' || pb === 'proxy') return '已代付（代付方）';
      if (ps === 'unpaid' || pb === 'unpaid') return '未支付';
      return '已支付（自己）';
    };

    listEl.innerHTML = orders.map(o => `
      <button type="button" class="yd-shop-order-item" data-id="${this._esc(o.id)}">
        <div class="yd-shop-order-item__left">
          <div class="yd-shop-order-item__title">${this._esc(o.title || '购物订单')}（${Number(o.qty || 0)}件）</div>
          <div class="yd-shop-order-item__meta">
            ${this._esc(this._formatTime(o.ts || 0))}${o.address ? ' · ' + this._esc(o.address) : ''} · ${this._esc(payLabel(o))}
          </div>
        </div>
        <div class="yd-shop-order-item__amount">${this._formatCny(o.total || 0)}</div>
      </button>
    `).join('');
    listEl.querySelectorAll('.yd-shop-order-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        const order = orders.find(x => String(x?.id || '') === String(id));
        if (order) this.openOrderDetail(order);
      });
    });
  },

  openOrderDetail(order) {
    const modal = document.getElementById('shop-order-detail');
    const body = document.getElementById('shop-order-detail-body');
    if (!modal || !body || !order) return;
    modal.setAttribute('aria-hidden', 'false');
    // 订单详情页不显示购物车（与外卖一致）
    const fab = document.getElementById('shop-cart-fab');
    if (fab) { fab.hidden = true; fab.style.display = 'none'; }
    modal.dataset.orderId = String(order.id || '');
    const items = Array.isArray(order.items) ? order.items : [];
    body.innerHTML = `
      <div class="yd-shop-order-detail__section">
        <div class="yd-shop-order-detail__row"><div class="yd-shop-order-detail__label">订单</div><div class="yd-shop-order-detail__value">${this._esc(order.title || '购物订单')}</div></div>
        <div class="yd-shop-order-detail__row"><div class="yd-shop-order-detail__label">时间</div><div class="yd-shop-order-detail__value">${this._esc(this._formatTime(order.ts || 0))}</div></div>
        <div class="yd-shop-order-detail__row"><div class="yd-shop-order-detail__label">金额</div><div class="yd-shop-order-detail__value" style="color:#FF6B00;">${this._formatCny(order.total || 0)}</div></div>
        <div class="yd-shop-order-detail__row"><div class="yd-shop-order-detail__label">支付方式</div><div class="yd-shop-order-detail__value">银行卡支付</div></div>
        <div class="yd-shop-order-detail__row"><div class="yd-shop-order-detail__label">支付状态</div><div class="yd-shop-order-detail__value">${this._esc((() => {
          const ps = String(order?.payState || '');
          const pb = String(order?.paidBy || '');
          if (ps === 'proxy_paid' || pb === 'proxy') return '已代付（代付方）';
          if (ps === 'unpaid' || pb === 'unpaid') return '未支付';
          return '已支付（自己）';
        })())}</div></div>
        <div class="yd-shop-order-detail__row"><div class="yd-shop-order-detail__label">地址</div><div class="yd-shop-order-detail__value">${this._esc(order.address || '—')}</div></div>
      </div>
      <div class="yd-shop-order-detail__section">
        <div style="font-weight:900;margin-bottom:6px;">商品明细</div>
        <div class="yd-shop-order-detail__items">
          ${items.map(it => `
            <div class="yd-shop-order-detail__item">
              <div class="yd-shop-order-detail__item-name">
                ${this._esc(it.icon || '')} ${this._esc(it.name || '')}
                ${(() => {
                  // 订单详情页：DB 完整字段优先；如果来自聊天分享消息则可能只有 specText。
                  const txt = this._formatOrderItemOptions(it.optionIds, it.selections) || (it.specText ? String(it.specText) : '');
                  return txt ? `<div style="font-size:11px;color:rgba(17,17,17,0.6);margin-top:2px;">${this._esc(txt)}</div>` : '';
                })()}
              </div>
              <div class="yd-shop-order-detail__item-qty">×${Number(it.qty || 0)}</div>
              <div class="yd-shop-order-detail__item-sub">${this._formatCny(Math.round((Number(it.unitPrice || 0) * Number(it.qty || 0)) * 100) / 100)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  async openOrderDetailById(orderId) {
    const idStr = String(orderId || '');
    if (!idStr) return;
    let orders = [];
    try {
      const existing = await Storage.kvGet(this.STORAGE_KEY_ORDERS);
      if (Array.isArray(existing)) orders = existing;
    } catch (e) {}
    const order = orders.find(x => String(x?.id || '') === idStr);
    if (order) this.openOrderDetail(order);
  },

  closeOrderDetail() {
    const modal = document.getElementById('shop-order-detail');
    if (!modal) return;

    const returnPage = modal.dataset?.returnPage ? String(modal.dataset.returnPage) : '';
    const returnSessionId = modal.dataset?.returnSessionId ? String(modal.dataset.returnSessionId) : '';
    if (modal.dataset) {
      delete modal.dataset.returnPage;
      delete modal.dataset.returnSessionId;
    }
    modal.setAttribute('aria-hidden', 'true');

    // 如果订单列表仍在显示（从详情返回列表），或购物车抽屉仍打开，则不恢复购物车图标
    const drawer = document.getElementById('shop-cart-drawer');
    const drawerActive = drawer?.getAttribute('aria-hidden') === 'false';
    const ordersModal = document.getElementById('shop-orders-modal');
    const ordersOpen = ordersModal?.getAttribute('aria-hidden') === 'false';
    const fab = document.getElementById('shop-cart-fab');
    if (fab) {
      const hide = !!drawerActive || !!ordersOpen;
      fab.hidden = hide;
      fab.style.display = hide ? 'none' : '';
    }

    // 如果从聊天卡片进入，需要回到原页面
    if (returnPage && typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
      if (returnSessionId && typeof Chat !== 'undefined' && Chat) {
        if (Chat.currentSessionId !== returnSessionId) Chat.currentSessionId = returnSessionId;
      }
      if (State.currentPage !== returnPage) {
        State.switchPage(returnPage);
        if (returnPage === 'page-chat' && typeof Chat !== 'undefined' && Chat && typeof Chat.loadMessages === 'function' && returnSessionId) {
          try { Chat.loadMessages(); } catch (e) {}
        }
      }
    }
  },

  _b64EncodeUtf8(str) {
    const s = String(str || '');
    try {
      return btoa(unescape(encodeURIComponent(s)));
    } catch (e) {
      return btoa(s);
    }
  },

  async _openShareSessionPickerById(orderId) {
    const idStr = String(orderId || '');
    if (!idStr) return;

    let order = null;
    try {
      const existing = await Storage.kvGet(this.STORAGE_KEY_ORDERS);
      if (Array.isArray(existing)) order = existing.find(x => String(x?.id || '') === idStr) || null;
    } catch (e) {}

    if (!order) {
      alert('订单不存在，无法分享');
      return;
    }

    // close existing
    const existingEl = document.getElementById('shop-share-session-modal');
    if (existingEl) existingEl.remove();

    const modal = document.createElement('div');
    modal.id = 'shop-share-session-modal';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="选择会话">
        <div class="yd-modal-header">
          <div style="font-weight:900">分享至哪个会话</div>
          <button type="button" class="yd-btn-close" id="shop-share-session-close" aria-label="关闭">×</button>
        </div>
        <div id="shop-share-session-list" style="display:flex;flex-direction:column;gap:0;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      const el = document.getElementById('shop-share-session-modal');
      if (el) el.remove();
    };
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('shop-share-session-close')?.addEventListener('click', close);

    let sessions = [];
    try {
      sessions = await Storage.dbGetAll('sessions');
    } catch (e) {
      sessions = [];
    }
    if (!Array.isArray(sessions) || sessions.length === 0) {
      const list = document.getElementById('shop-share-session-list');
      if (list) list.innerHTML = `<div style="padding:28px 0;text-align:center;color:#999;font-size:13px;">暂无会话</div>`;
      return;
    }

    const getTs = (s) => {
      const u = Number(s && s.updatedAt);
      if (Number.isFinite(u) && u > 0) return u;
      const c = Number(s && s.createdAt);
      if (Number.isFinite(c) && c > 0) return c;
      return 0;
    };
    sessions.sort((a, b) => getTs(b) - getTs(a));

    const listEl = document.getElementById('shop-share-session-list');
    if (!listEl) return;

    const characterList = sessions.slice(0, 50);
    const labelForSession = (session) => {
      const names = Array.isArray(session?.participantCharacterNames)
        ? session.participantCharacterNames.filter(Boolean)
        : [];
      return names.length ? names.join('、') : (session?.title || '默认AI');
    };

    listEl.innerHTML = characterList.map(s => {
      const label = labelForSession(s);
      const time = this._formatTime(getTs(s));
      return `
        <div class="yd-list-item" role="button" tabindex="0" data-session-id="${this._esc(String(s.id || ''))}">
          <div class="yd-list-item__avatar">💬</div>
          <div class="yd-list-item__content">
            <div class="yd-list-item__header">
              <div class="yd-list-item__title">${this._esc(s.title || label)}</div>
              <div class="yd-list-item__time">${this._esc(time)}</div>
            </div>
            <div class="yd-list-item__subtitle">${this._esc(label)}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-session-id]').forEach(item => {
      const sid = item.getAttribute('data-session-id');
      if (!sid) return;
      const run = async () => {
        try {
          await this._insertShareMessageToSession({ sessionId: sid, order });
          close();

          // 写入成功后，直接跳转到该会话的聊天框
          if (typeof Chat !== 'undefined' && Chat && typeof Chat.openSession === 'function') {
            await Chat.openSession(sid);
            if (typeof Chat._toast === 'function') Chat._toast('已分享');
          } else if (typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
            State.switchPage('page-chat');
          }
        } catch (e) {
          console.error('[shop][share]insert failed', e);
          alert('分享失败，请稍后重试');
        }
      };
      item.addEventListener('click', run);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') run();
      });
    });
  },

  async _insertShareMessageToSession({ sessionId, order }) {
    const sid = String(sessionId || '');
    if (!sid || !order || typeof order !== 'object') return;

    const orderId = String(order.id || '');
    if (!orderId) return;

    // 新分享消息体（中文协议）
    // [分享]应用|资源|动作|主键|标题|金额|状态|时间|地址|图标|名称|数量|规格|单价...
    const shareTitle = '购物订单';
    const total = Number(order.total || 0) || 0;
    const address = String(order.address || '');
    const ts = Number(order.ts || 0) || 0;
    const items = (Array.isArray(order.items) ? order.items : []);
    const payStatus = (() => {
      const ps = String(order?.payState || '');
      const pb = String(order?.paidBy || '');
      if (ps === 'proxy_paid' || pb === 'proxy') return '已代付';
      if (ps === 'unpaid' || pb === 'unpaid') return '未支付';
      return '自己已支付';
    })();

    const escPipe = (v) => String(v ?? '').replace(/\|/g, '｜');

    const parts = [
      '商城',
      '订单',
      '查看',
      escPipe(orderId),
      escPipe(shareTitle),
      escPipe(String(total)),
      escPipe(payStatus),
      escPipe(String(ts)),
      escPipe(address)
    ];

    items.forEach(it => {
      const icon = String(it?.icon || '');
      const name = String(it?.name || '');
      const qty = Number(it?.qty || 0) || 0;
      const specText = this._formatOrderItemOptionsWithChoiceId(it?.optionIds, it?.selections);
      const unitPrice = Number(it?.unitPrice || 0) || 0;

      parts.push(escPipe(icon));
      parts.push(escPipe(name));
      parts.push(escPipe(String(qty)));
      parts.push(escPipe(specText || ''));
      parts.push(escPipe(String(unitPrice)));
    });

    const msg = {
      id: State.generateId(),
      sessionId: sid,
      role: 'user',
      content: `[分享]${parts.join('|')}`,
      createdAt: Date.now()
    };

    await Storage.dbAdd('messages', msg);

    const session = await Storage.dbGet('sessions', sid);
    if (session) {
      session.updatedAt = Date.now();
      await Storage.dbPut('sessions', session);
    }

    // Chat UI sync (if currently in same session)
    try {
      if (typeof Chat !== 'undefined' && Chat._scheduleChatListRefresh) {
        Chat._scheduleChatListRefresh();
      }
      if (State.currentPage === 'page-chat' && typeof Chat !== 'undefined' && Chat.currentSessionId === sid && Chat.loadMessages) {
        await Chat.loadMessages();
      }
    } catch (e) {}
  },

  _formatOrderItemOptions(optionIds, selections) {
    const ids = Array.isArray(optionIds) ? optionIds : [];
    const sels = selections && typeof selections === 'object' ? selections : {};
    if (!ids.length) return '';
    const labels = [];
    ids.forEach(oid => {
      const def = this._optionDefs?.[oid];
      const cid = sels[oid];
      if (!def || !cid) return;
      const c = (def.choices || []).find(x => x.id === cid);
      if (c) labels.push(`${def.title}：${c.label}`);
    });
    return labels.join(' · ');
  },

  _formatOrderItemOptionsWithChoiceId(optionIds, selections) {
    const ids = Array.isArray(optionIds) ? optionIds : [];
    const sels = selections && typeof selections === 'object' ? selections : {};
    if (!ids.length) return '';
    const labels = [];
    ids.forEach(oid => {
      const def = this._optionDefs?.[oid];
      const cid = sels[oid];
      if (!def || !cid) return;
      const c = (def.choices || []).find(x => x.id === cid);
      if (c) labels.push(`${def.title}：${c.label} (${cid})`);
    });
    return labels.join(' · ');
  },

  openAdminCategoryModal() {
    const modal = document.getElementById('shop-admin-cat-modal');
    if (!modal) return;
    const name = document.getElementById('shop-admin-cat-name');
    const icon = document.getElementById('shop-admin-cat-icon');
    if (name) name.value = '';
    if (icon) icon.value = '';
    modal.classList.add('yd-modal--active');
    modal.setAttribute('aria-hidden', 'false');
  },

  closeAdminCategoryModal() {
    const modal = document.getElementById('shop-admin-cat-modal');
    if (!modal) return;
    modal.classList.remove('yd-modal--active');
    modal.setAttribute('aria-hidden', 'true');
  },

  openAdminItemModal() {
    const modal = document.getElementById('shop-admin-item-modal');
    if (!modal) return;
    // 弹窗原本位于购物页容器内；在商品管理页时购物页会被隐藏。
    // 打开前将弹窗提升到 body，确保任意页面都能正常显示。
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    const catSel = document.getElementById('shop-admin-item-category');
    if (catSel) {
      const cats = this._getAllCats().filter(c => c && c.id && c.id !== 'all');
      const selectedId = this._currentCat;
      const hasSelected = cats.some((c) => String(c.id) === String(selectedId));
      const placeholderSelected = hasSelected ? '' : 'selected';
      const placeholder = `<option value="" disabled ${placeholderSelected}>请选择该商品的分类</option>`;
      const options = (cats || []).map((c) => {
        const selected = hasSelected && c.id === selectedId ? 'selected' : '';
        return `<option value="${String(c.id)}" ${selected}>${this._esc(c.name)}</option>`;
      }).join('');
      catSel.innerHTML = `${placeholder}${options}`;
      catSel.style.display = '';
    }

    const name = document.getElementById('shop-admin-item-name');
    const price = document.getElementById('shop-admin-item-price');
    const icon = document.getElementById('shop-admin-item-icon');
    const desc = document.getElementById('shop-admin-item-desc');
    const newCatName = document.getElementById('shop-admin-item-new-cat-name');
    const newCatIcon = document.getElementById('shop-admin-item-new-cat-icon');
    const newCatFields = document.getElementById('shop-admin-item-new-cat-fields');
    const newCatToggle = document.getElementById('shop-admin-item-new-cat-toggle');
    if (name) name.value = '';
    if (price) price.value = '';
    if (icon) icon.value = '';
    if (desc) desc.value = '';
    if (newCatName) newCatName.value = '';
    if (newCatIcon) newCatIcon.value = '';
    if (newCatFields) newCatFields.style.display = 'none';
    if (newCatToggle) newCatToggle.textContent = '+ 新增分类';

    const styleInput = document.getElementById('shop-admin-item-style-input');
    if (styleInput) styleInput.value = '';
    this._adminItemStyleChoices = [];
    this._adminItemStyleOptionId = null;
    this._renderAdminStyleList();
    this._refreshAdminStyleAddState();

    modal.classList.add('yd-modal--active');
    modal.setAttribute('aria-hidden', 'false');
  },

  confirmAdminAddCategoryInline() {
    const nameInput = document.getElementById('shop-admin-item-new-cat-name');
    const iconInput = document.getElementById('shop-admin-item-new-cat-icon');
    const catSel = document.getElementById('shop-admin-item-category');
    const fields = document.getElementById('shop-admin-item-new-cat-fields');
    const toggleBtn = document.getElementById('shop-admin-item-new-cat-toggle');

    const name = String(nameInput?.value || '').trim();
    const icon = String(iconInput?.value || '').trim();
    if (!name) {
      alert('请先填写分类名称');
      nameInput?.focus?.();
      return;
    }
    if (!icon) {
      alert('请先填写分类图标（例如：🧋）');
      iconInput?.focus?.();
      return;
    }

    const cats = this._getAllCats().filter(c => c && c.id && c.id !== 'all');
    const exists = cats.find((c) => String(c?.name || '').trim() === name);
    let cid = '';
    if (exists && exists.id) {
      cid = String(exists.id);
    } else {
      cid = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const cat = { id: cid, icon, name };
      this._userNavItems.push(cat);
      if (!this._userCategoryItems[cid]) this._userCategoryItems[cid] = [];
      this._persistAdminSoon();
      if (State?.currentPage === 'page-shop-app-manager') this.renderShopAppManager();
    }

    if (catSel) {
      const nextCats = this._getAllCats().filter(c => c && c.id && c.id !== 'all');
      const placeholder = `<option value="" disabled>请选择该商品的分类</option>`;
      const options = (nextCats || []).map((c) => {
        const selected = String(c.id) === String(cid) ? 'selected' : '';
        return `<option value="${String(c.id)}" ${selected}>${this._esc(c.name)}</option>`;
      }).join('');
      catSel.innerHTML = `${placeholder}${options}`;
      catSel.style.display = '';
    }

    // 收起新增分类区并清空输入
    if (nameInput) nameInput.value = '';
    if (iconInput) iconInput.value = '';
    if (fields) fields.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = '+ 新增分类';
  },

  closeAdminItemModal() {
    const modal = document.getElementById('shop-admin-item-modal');
    if (!modal) return;
    modal.classList.remove('yd-modal--active');
    modal.setAttribute('aria-hidden', 'true');
  },

  _renderAdminStyleList() {
    const listEl = document.getElementById('shop-admin-item-style-list');
    if (!listEl) return;
    const choices = Array.isArray(this._adminItemStyleChoices) ? this._adminItemStyleChoices : [];
    listEl.innerHTML = choices.map((label, idx) => `
      <span class="yd-takeout-admin-style-chip" data-idx="${idx}">
        ${this._esc(label)}
        <button type="button" data-del-idx="${idx}" aria-label="删除款式">×</button>
      </span>
    `).join('');
    listEl.querySelectorAll('button[data-del-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const delIdx = Number(btn.getAttribute('data-del-idx'));
        if (!Number.isFinite(delIdx)) return;
        this._adminItemStyleChoices.splice(delIdx, 1);
        this._renderAdminStyleList();
      });
    });
  },

  _adminAddStyleChoice() {
    const input = document.getElementById('shop-admin-item-style-input');
    if (!input) return;
    const raw = String(input.value || '').trim();
    if (!raw) return;
    if (!Array.isArray(this._adminItemStyleChoices)) this._adminItemStyleChoices = [];
    if (this._adminItemStyleChoices.length >= 8) {
      alert('款式最多只能添加 8 个');
      input.value = '';
      this._refreshAdminStyleAddState();
      this._scrollAdminItemModalToBottom();
      return;
    }
    if (this._adminItemStyleChoices.includes(raw)) {
      input.value = '';
      this._refreshAdminStyleAddState();
      return;
    }
    this._adminItemStyleChoices.push(raw);
    input.value = '';
    this._renderAdminStyleList();
    this._refreshAdminStyleAddState();
    this._scrollAdminItemModalToBottom();
  },

  _refreshAdminStyleAddState() {
    const input = document.getElementById('shop-admin-item-style-input');
    const btn = document.getElementById('shop-admin-item-style-add');
    if (!input || !btn) return;
    const hasText = String(input.value || '').trim().length > 0;
    btn.disabled = !hasText;
  },

  _scrollAdminItemModalToBottom() {
    const modal = document.getElementById('shop-admin-item-modal');
    if (!modal) return;
    const body = modal.querySelector?.('.yd-takeout-modal__body');
    if (!body) return;
    // 下一帧滚动，避免布局尚未更新导致滚动不生效
    requestAnimationFrame(() => {
      try { body.scrollTop = body.scrollHeight; } catch (e) {}
    });
  },

  _makeUserItemId() {
    return `uitem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  },

  _normalizeUserCategoryItems() {
    let changed = false;
    Object.entries(this._userCategoryItems || {}).forEach(([cid, items]) => {
      if (!Array.isArray(items)) return;
      items.forEach((it) => {
        if (!it || typeof it !== 'object') return;
        if (!it.__customId) {
          it.__customId = this._makeUserItemId();
          changed = true;
        }
        if (!it.__isUserAdded) {
          it.__isUserAdded = true;
          changed = true;
        }
        if (!it.id) {
          // 如果旧数据没有 itemId，兜底补一个，确保能渲染/加入购物车
          it.id = this._makeUserItemId();
          changed = true;
        }
      });
      this._userCategoryItems[cid] = items;
    });
    if (changed) this._persistAdminSoon();
  },

  _deleteUserItem(categoryId, customId) {
    const cid = String(categoryId || '').trim();
    const uid = String(customId || '').trim();
    if (!cid || !uid) return;

    let changed = false;
    const userList = this._userCategoryItems?.[cid];
    if (Array.isArray(userList)) {
      const next = userList.filter(it => String(it?.__customId || '') !== uid && String(it?.id || '') !== uid);
      if (next.length !== userList.length) {
        this._userCategoryItems[cid] = next;
        changed = true;
      }
    }

    if (!changed) return;
    this._persistAdminSoon();
    this._applyAdminDataToMemory();
    this.render();
    if (State?.currentPage === 'page-shop-app-manager') this.renderShopAppManager();
  },

  confirmAdminAddCategory() {
    const nameInput = document.getElementById('shop-admin-cat-name');
    const iconInput = document.getElementById('shop-admin-cat-icon');
    const name = String(nameInput?.value || '').trim();
    const icon = String(iconInput?.value || '').trim();

    if (!name) {
      alert('请先填写分类名称');
      nameInput?.focus?.();
      return;
    }
    if (!icon) {
      alert('请先填写分类图标（例如：🍰）');
      iconInput?.focus?.();
      return;
    }

    const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const cat = { id, icon, name };
    this._userNavItems.push(cat);
    if (!this._userCategoryItems[id]) this._userCategoryItems[id] = [];

    this._currentCat = id;
    this._persistAdminSoon();
    this.closeAdminCategoryModal();
    this.render();
    if (State?.currentPage === 'page-shop-app-manager') this.renderShopAppManager();
  },

  confirmAdminAddItem() {
    const catSel = document.getElementById('shop-admin-item-category');
    const nameInput = document.getElementById('shop-admin-item-name');
    const priceInput = document.getElementById('shop-admin-item-price');
    const iconInput = document.getElementById('shop-admin-item-icon');
    const descInput = document.getElementById('shop-admin-item-desc');
    let cid = String(catSel?.value || '').trim();
    const name = String(nameInput?.value || '').trim();
    const price = Number(priceInput?.value || 0);
    const icon = String(iconInput?.value || '').trim();
    const desc = String(descInput?.value || '').trim();

    const styleChoices = Array.isArray(this._adminItemStyleChoices) ? this._adminItemStyleChoices : [];
    const cats = this._getAllCats().filter(c => c && c.id && c.id !== 'all');
    const cidOk = cats.some(c => c.id === cid);
    if (!cid || !cidOk) {
      alert('请选择一个有效分类');
      return;
    }
    if (!name) {
      alert('请先填写商品名称');
      nameInput?.focus?.();
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      alert('请填写正确的价格');
      priceInput?.focus?.();
      return;
    }
    if (!icon) {
      alert('请先填写商品图标（例如：🍟）');
      iconInput?.focus?.();
      return;
    }

    if (!styleChoices.length) {
      alert('请先添加至少一个“款式”选项');
      return;
    }

    const labels = styleChoices
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 8);

    const optionId = `custom_style_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const choices = labels.map((label, idx) => ({
      id: `c${idx + 1}`,
      label
    }));

    const def = { title: '款式', required: true, choices };
    this._userOptionDefs[optionId] = def;
    this._optionDefs[optionId] = def;

    const itemId = this._makeUserItemId();
    const item = {
      id: itemId,
      __customId: itemId,
      __isUserAdded: true,
      cat: cid,
      name,
      price,
      icon,
      desc,
      options: [optionId],
      attrs: {}
    };

    if (!this._userCategoryItems[cid]) this._userCategoryItems[cid] = [];
    this._userCategoryItems[cid].push(item);

    this._currentCat = cid;
    this._persistAdminSoon();
    this.closeAdminItemModal();
    this._applyAdminDataToMemory();
    this.render();
    if (State?.currentPage === 'page-shop-app-manager') this.renderShopAppManager();
  },

  _parseAttrsText(text) {
    const src = String(text || '').trim();
    if (!src) return {};
    const out = {};
    src.split('\n').map((x) => String(x || '').trim()).filter(Boolean).forEach((line) => {
      const idx = line.indexOf('=');
      if (idx <= 0) return;
      const k = String(line.slice(0, idx)).trim();
      const v = String(line.slice(idx + 1)).trim();
      if (!k || !v) return;
      out[k] = v;
    });
    return out;
  },

  _safeParseJsonArray(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const v = JSON.parse(cleaned);
      if (Array.isArray(v)) return v;
    } catch (e) {}
    const a = cleaned.indexOf('[');
    const b = cleaned.lastIndexOf(']');
    if (a >= 0 && b > a) {
      try {
        const v = JSON.parse(cleaned.slice(a, b + 1));
        return Array.isArray(v) ? v : null;
      } catch (e2) {}
    }
    return null;
  },

  _inferCategoryIcon(name) {
    const s = String(name || '').trim();
    if (!s) return '🛍️';
    if (/电器|家电|数码|手机|电脑|智能|充电|耳机|相机/i.test(s)) return '📱';
    if (/化妆|美妆|护肤|香水|口红|粉底/i.test(s)) return '💄';
    if (/零食|食品|饮料|咖啡|生鲜|水果|酒水/i.test(s)) return '🍪';
    if (/服饰|穿搭|鞋|帽|衣|裤|外套/i.test(s)) return '👕';
    if (/家居|家具|厨具|收纳|清洁/i.test(s)) return '🏠';
    if (/珠宝|饰品|首饰|项链|戒指/i.test(s)) return '💎';
    if (/奢品|奢侈|箱包|皮具/i.test(s)) return '👜';
    if (/母婴|宝宝|儿童|玩具/i.test(s)) return '🧸';
    if (/运动|户外|健身|骑行|露营/i.test(s)) return '🏃';
    return '🛍️';
  },

  openShopManagerActionPicker() {
    const existing = document.getElementById('yd-shop-manager-action');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'yd-shop-manager-action';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">新增方式</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-forum-picker__list" style="gap:12px;">
          <div class="yd-forum-item" id="yd-shop-manager-action-ai" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">AI生成一批商品</div>
              <div class="yd-forum-item__desc">输入本次生成要求，AI增量生成并入当前购物App</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary">选择</button>
            </div>
          </div>
          <div class="yd-forum-item" id="yd-shop-manager-action-manual" style="cursor:pointer;">
            <div class="yd-forum-item__main">
              <div class="yd-forum-item__name">手动添加商品</div>
              <div class="yd-forum-item__desc">手动填写分类、价格、参数与款式</div>
            </div>
            <div class="yd-forum-item__actions">
              <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary">选择</button>
            </div>
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
    modal.querySelector('#yd-shop-manager-action-ai')?.addEventListener('click', () => {
      close();
      this.openShopAiGenerateComposer();
    });
    modal.querySelector('#yd-shop-manager-action-manual')?.addEventListener('click', () => {
      close();
      this.openAdminItemModal();
    });
  },

  openShopAiGenerateComposer() {
    const existing = document.getElementById('yd-shop-ai-generate-compose');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'yd-shop-ai-generate-compose';
    modal.className = 'yd-forum-compose';
    modal.innerHTML = `
      <div class="yd-forum-compose__mask" data-close="1"></div>
      <div class="yd-forum-compose__panel yd-shop-ai-generate-panel" role="dialog" aria-modal="true">
        <div class="yd-forum-compose__bar">
          <div class="yd-forum-compose__title">新增一批商品</div>
        </div>
        <textarea class="yd-forum-compose__textarea" id="yd-shop-ai-generate-requirement" placeholder="请输入本次生成的商品的要求。可以补充类型、品牌、参数等信息，描述越详细，生成结果越符合预期。"></textarea>
        <div class="yd-shop-ai-generate-actions">
          <label class="yd-shop-ai-generate-count" for="yd-shop-ai-generate-count-input">
            生成
            <input id="yd-shop-ai-generate-count-input" type="number" min="1" max="100" step="1" value="8" />
            件商品
          </label>
          <button type="button" class="yd-shop-ai-generate-fab" id="yd-shop-ai-generate-submit" disabled>生成并入库</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });
    const reqEl = modal.querySelector('#yd-shop-ai-generate-requirement');
    const countEl = modal.querySelector('#yd-shop-ai-generate-count-input');
    const submitBtn = modal.querySelector('#yd-shop-ai-generate-submit');
    const normalizeCount = () => {
      const raw = Number(countEl?.value || 8);
      const n = Number.isFinite(raw) ? Math.max(1, Math.min(100, Math.round(raw))) : 8;
      if (countEl) countEl.value = String(n);
      return n;
    };
    const refresh = () => {
      const ok = String(reqEl?.value || '').trim().length > 0;
      if (submitBtn) submitBtn.disabled = !ok;
    };
    reqEl?.addEventListener('input', refresh);
    reqEl?.addEventListener('change', refresh);
    countEl?.addEventListener('blur', normalizeCount);
    countEl?.addEventListener('change', normalizeCount);
    refresh();
    submitBtn?.addEventListener('click', async () => {
      const requirement = String(reqEl?.value || '').trim();
      const generateCount = normalizeCount();
      if (!requirement) return;
      submitBtn.disabled = true;
      submitBtn.textContent = '生成中...';
      // 复用现有无确认提示样式：提示 4 秒
      try {
        if (typeof Settings !== 'undefined' && Settings && typeof Settings.showToast === 'function') {
          Settings.showToast('后台生成中，请耐心等待...', 4000);
        } else if (typeof Chat !== 'undefined' && Chat && typeof Chat._toast === 'function') {
          Chat._toast('后台生成中，请耐心等待...');
        }
      } catch (e) {}
      // 后台生成：立即关闭弹窗，完成后再提示结果
      close();
      (async () => {
        try {
          const result = await this.generateItemsForCurrentApp(requirement, { silent: true, count: generateCount });
          const appName = String(result?.appName || this._getCurrentShopApp()?.name || '当前');
          const added = Number(result?.addedCount || 0);
          this._shopToast(`【${appName}】已上新${added}款新产品`, 2200);
        } catch (e) {
          this._shopToast('生成失败，请检查网络和API配置', 2600);
        }
      })();
    });
  },

  async generateItemsForCurrentApp(requirement = '', opts = {}) {
    const app = this._getCurrentShopApp();
    const silent = !!opts?.silent;
    const targetCount = Math.max(1, Math.min(100, Number(opts?.count) || 8));
    const apiKey = Storage.get(CONFIG.STORAGE_KEYS.API_KEY);
    const baseUrl = Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || 'https://api.openai.com/v1';
    if (!apiKey) {
      this._shopToast('请先在设置中配置API Key', 2600);
      return;
    }
    const categories = this._getAllCats().filter((c) => c && c.id && c.id !== 'all').map((c) => ({ id: c.id, name: c.name }));
    const systemPrompt = [
      '你是模拟商品数据生成器。',
      '你的任务是为指定购物App增量生成可直接入库的商品JSON。',
      '只输出 JSON 数组，不输出解释、注释、代码块或任何额外文字。',
      '每个商品必须包含字段：categoryName, categoryIcon, name, price, icon, desc, optionGroups, attrs。',
      '字段要求：',
      '- categoryName: 分类名称，字符串。',
      '- categoryIcon: 分类emoji，字符串，优先单个emoji。',
      '- name: 商品标题，简洁自然，避免重复。',
      '- price: 数字（整数或一位小数），>=0。',
      '- icon: 商品emoji图标，字符串。',
      '- desc: 20字以内卖点文案，简洁口语化。',
      '- optionGroups: 数组，1-3组，推荐2组，尽量保证至少2组；每组含 title 和 choices；choices 为 1-8 个字符串。',
      '- attrs: 对象，1-3个键值，键值都为短字符串。',
      '生成规则：',
      '- 尽量贴合购物App定位与用户要求。',
      '- 优先复用已有分类，不够时可新增合理分类。',
      '- 商品名称和卖点避免高度重复，保证多样性。',
      '- 商品详情尽量描述详细，描述可以带一些趣味性。',
      '输出格式示例：',
      '[{"categoryName":"零食","categoryIcon":"🍪","name":"脆薯条","price":19,"icon":"🍟","desc":"酥脆咸香","optionGroups":[{"title":"规格","choices":["小份","大份"]}],"attrs":{"品牌":"Foxhole & Acorn Box","重量":"180g"}}]'
    ].join('\n');
    const userPrompt = [
      `当前购物App名称：${String(app?.name || '默认')}`,
      `当前购物App描述：${String(app?.desc || '暂无描述')}`,
      `现有分类：${categories.length ? categories.map((c) => `${c.name}`).join('、') : '暂无（你可以同时生成新的分类）'}`,
      `本次生成要求：${String(requirement || '').trim() || '无特别要求'}`,
      `请生成 ${targetCount} 条商品。`
    ].join('\n');
    try {
      const messages = [{ role: 'system', content: systemPrompt }];
      messages.push({ role: 'user', content: userPrompt });
      const payload = {
        model: Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || 'gpt-3.5-turbo',
        messages
      };
      const data = (typeof Chat !== 'undefined' && typeof Chat._postChatCompletionsAndParse === 'function')
        ? await Chat._postChatCompletionsAndParse({ baseUrl, apiKey, payload })
        : await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ ...payload, stream: false })
        }).then((r) => r.json());
      const raw = data?.choices?.[0]?.message?.content;
      const arr = this._safeParseJsonArray(raw) || [];
      if (!arr.length) {
        if (!silent) this._shopToast('AI返回为空或格式不正确', 2600);
        return { appName: String(app?.name || '默认'), addedCount: 0 };
      }
      const catByName = new Map(categories.map((c) => [String(c.name || '').trim(), c]));
      let addedCount = 0;
      arr.slice(0, targetCount).forEach((row) => {
        const name = String(row?.name || '').trim();
        if (!name) return;
        const categoryName = String(row?.categoryName || '未分类').trim() || '未分类';
        let cat = catByName.get(categoryName);
        if (!cat) {
          const newId = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          const iconRaw = String(row?.categoryIcon || '').trim();
          const icon = iconRaw || this._inferCategoryIcon(categoryName);
          cat = { id: newId, name: categoryName, icon };
          catByName.set(categoryName, cat);
          this._userNavItems.push(cat);
          if (!this._userCategoryItems[newId]) this._userCategoryItems[newId] = [];
        }
        const optionIds = [];
        const optionGroupsRaw = Array.isArray(row?.optionGroups) ? row.optionGroups : [];
        const optionGroups = optionGroupsRaw
          .map((g) => {
            const title = String(g?.title || '').trim();
            const choices = Array.isArray(g?.choices)
              ? g.choices.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8)
              : [];
            if (!title || !choices.length) return null;
            return { title, choices };
          })
          .filter(Boolean)
          .slice(0, 2);
        if (!optionGroups.length) {
          const styles = Array.isArray(row?.styles) ? row.styles.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8) : [];
          const fallback = styles.length ? styles : ['标准'];
          optionGroups.push({ title: '款式', choices: fallback });
        }
        optionGroups.forEach((group) => {
          const optionId = `custom_opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          const choices = group.choices.map((label, idx) => ({ id: `c${idx + 1}`, label }));
          const def = { title: group.title, required: true, choices };
          this._userOptionDefs[optionId] = def;
          optionIds.push(optionId);
        });
        const itemId = this._makeUserItemId();
        const attrs = row?.attrs && typeof row.attrs === 'object' ? row.attrs : {};
        const item = {
          id: itemId,
          __customId: itemId,
          __isUserAdded: true,
          cat: cat.id,
          name,
          price: Math.max(0, Number(row?.price) || 0),
          icon: String(row?.icon || '📦').trim() || '📦',
          desc: String(row?.desc || '').trim(),
          options: optionIds.slice(0, 2),
          attrs
        };
        if (!this._userCategoryItems[cat.id]) this._userCategoryItems[cat.id] = [];
        this._userCategoryItems[cat.id].push(item);
        addedCount += 1;
      });
      this._applyAdminDataToMemory();
      this._persistAdminSoon();
      this.render();
      this.renderShopAppManager();
      if (!silent) {
        this._shopToast(`【${String(app?.name || '当前')}】已上新${addedCount}款新产品`, 2200);
      }
      return { appName: String(app?.name || '默认'), addedCount };
    } catch (e) {
      console.error('generateItemsForCurrentApp failed:', e);
      if (!silent) this._shopToast('AI生成失败，请检查网络和API配置', 2600);
      throw e;
    }
  },

  _shopToast(message = '', durationMs = 1800) {
    const msg = String(message || '').trim();
    if (!msg) return;
    try {
      if (typeof Settings !== 'undefined' && Settings && typeof Settings.showToast === 'function') {
        Settings.showToast(msg, durationMs);
        return;
      }
    } catch (e) {}
    try {
      if (typeof Chat !== 'undefined' && Chat && typeof Chat._toast === 'function') {
        Chat._toast(msg);
        return;
      }
    } catch (e2) {}
    try { alert(msg); } catch (e3) {}
  },

  async _loadAdminPersisted() {
    this._adminPersistInited = false;
    try {
      const data = await Storage.kvGet(this.STORAGE_KEY_ADMIN);
      if (data && typeof data === 'object') {
        const hasLegacy = Array.isArray(data.userNavItems) ||
          (data.userCategoryItems && typeof data.userCategoryItems === 'object') ||
          (data.userOptionDefs && typeof data.userOptionDefs === 'object');
        if (hasLegacy) {
          const cur = this._getCurrentShopApp();
          const list = this._normalizeShopApps(this._shopApps);
          const idx = list.findIndex((x) => x.id === cur.id);
          if (idx >= 0) {
            const existing = this._sanitizeShopAppData(list[idx].data);
            const existingCount = Object.values(existing.userCategoryItems || {}).reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 0), 0);
            if (existingCount === 0) {
              list[idx].data = this._sanitizeShopAppData({
                userNavItems: Array.isArray(data.userNavItems) ? data.userNavItems : [],
                userCategoryItems: data.userCategoryItems && typeof data.userCategoryItems === 'object' ? data.userCategoryItems : {},
                userOptionDefs: data.userOptionDefs && typeof data.userOptionDefs === 'object' ? data.userOptionDefs : {}
              });
              this._shopApps = list;
            }
          }
        }
      }
    } catch (e) {
      try {
        const data = Storage.get(this.STORAGE_KEY_ADMIN);
        if (data && typeof data === 'object') {
          const hasLegacy = Array.isArray(data.userNavItems) ||
            (data.userCategoryItems && typeof data.userCategoryItems === 'object') ||
            (data.userOptionDefs && typeof data.userOptionDefs === 'object');
          if (hasLegacy) {
            const cur = this._getCurrentShopApp();
            const list = this._normalizeShopApps(this._shopApps);
            const idx = list.findIndex((x) => x.id === cur.id);
            if (idx >= 0) {
              list[idx].data = this._sanitizeShopAppData({
                userNavItems: Array.isArray(data.userNavItems) ? data.userNavItems : [],
                userCategoryItems: data.userCategoryItems && typeof data.userCategoryItems === 'object' ? data.userCategoryItems : {},
                userOptionDefs: data.userOptionDefs && typeof data.userOptionDefs === 'object' ? data.userOptionDefs : {}
              });
              this._shopApps = list;
            }
          }
        }
      } catch (e2) {}
    }
    this._persistAdminSoon();
    this._adminPersistInited = true;
  },

  _applyAdminDataToMemory() {
    this._normalizeUserCategoryItems();

    // 按 app 切换时需要重置为基础选项，避免跨 app 污染
    this._optionDefs = JSON.parse(JSON.stringify(this._baseOptionDefs || {}));

    // 合并用户自定义“款式”选项
    Object.entries(this._userOptionDefs || {}).forEach(([optionId, def]) => {
      if (!optionId || !def || typeof def !== 'object') return;
      this._optionDefs[optionId] = def;
    });

    // 生成用户商品扁平列表（用于渲染/查找）
    const flat = [];
    Object.values(this._userCategoryItems || {}).forEach(items => {
      if (Array.isArray(items)) flat.push(...items);
    });
    this._userItemsFlat = flat.filter(Boolean);
  },

  _persistAdminSoon() {
    if (this._adminPersistTimer) clearTimeout(this._adminPersistTimer);
    this._adminPersistTimer = setTimeout(async () => {
      this._writeActiveAdminDataToCurrentApp();
      const payload = {
        userNavItems: this._userNavItems || [],
        userCategoryItems: this._userCategoryItems || {},
        userOptionDefs: this._userOptionDefs || {}
      };
      try {
        if (Storage && Storage.kvSet) {
          await Storage.kvSet(this.STORAGE_KEY_APPS, this._shopApps || []);
          await Storage.kvSet(this.STORAGE_KEY_CURRENT_APP, this._currentAppId || '');
          await Storage.kvSet(this.STORAGE_KEY_ADMIN, payload);
          return;
        }
      } catch (e) {}
      try {
        Storage.set(this.STORAGE_KEY_APPS, this._shopApps || []);
        Storage.set(this.STORAGE_KEY_CURRENT_APP, this._currentAppId || '');
        Storage.set(this.STORAGE_KEY_ADMIN, payload);
      } catch (e2) {}
    }, 140);
  },

  _formatCny(n) {
    const v = Number(n) || 0;
    return '￥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _formatTime(ts) {
    const t = Number(ts) || 0;
    if (!t) return '';
    const d = new Date(t);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  },

  async _loadPersisted() {
    try {
      const cart = await Storage.kvGet(this.STORAGE_KEY_CART);
      const prefs = await Storage.kvGet(this.STORAGE_KEY_PREFS);
      const addr = await Storage.kvGet(this.STORAGE_KEY_ADDR);
      if (cart && typeof cart === 'object') this._cart = cart;
      if (prefs && typeof prefs === 'object') this._prefs = prefs;
      if (typeof addr === 'string') this._addr = addr;
    } catch (e) {
      try {
        const cart = Storage.get(this.STORAGE_KEY_CART);
        const prefs = Storage.get(this.STORAGE_KEY_PREFS);
        const addr = Storage.get(this.STORAGE_KEY_ADDR);
        if (cart && typeof cart === 'object') this._cart = cart;
        if (prefs && typeof prefs === 'object') this._prefs = prefs;
        if (typeof addr === 'string') this._addr = addr;
      } catch (e2) {}
    }
  },

  _persistSoon() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(async () => {
      try {
        if (Storage && Storage.kvSet) {
          await Storage.kvSet(this.STORAGE_KEY_CART, this._cart);
          await Storage.kvSet(this.STORAGE_KEY_PREFS, this._prefs);
          await Storage.kvSet(this.STORAGE_KEY_ADDR, this._addr);
          return;
        }
      } catch (e) {}
      try {
        Storage.set(this.STORAGE_KEY_CART, this._cart);
        Storage.set(this.STORAGE_KEY_PREFS, this._prefs);
        Storage.set(this.STORAGE_KEY_ADDR, this._addr);
      } catch (e2) {}
    }, 120);
  },

  _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};


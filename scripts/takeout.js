// 外卖首页（点餐配送类应用界面）
const Takeout = {
  STORAGE_KEY_CART: 'takeout_cart_v1',
  STORAGE_KEY_PREFS: 'takeout_item_prefs_v1',
  STORAGE_KEY_ADDR: 'takeout_address_v1',
  STORAGE_KEY_ORDERS: 'takeout_orders_v1',
  STORAGE_KEY_ADMIN: 'takeout_admin_data_v1',

  _navItems: [
    { id: 'food', icon: '🍜', name: '美食' },
    { id: 'dessert', icon: '🍰', name: '甜点饮品' },
    { id: 'super', icon: '🛒', name: '超市' },
    { id: 'vegetable', icon: '🥬', name: '蔬菜' },
    { id: 'fruit', icon: '🍎', name: '水果' },
    { id: 'flower', icon: '🌸', name: '鲜花' },
    { id: 'medicine', icon: '💊', name: '医药' },
    { id: 'errand', icon: '🚴', name: '跑腿' }
  ],

  _categoryItems: {
    food: [
      { name: '宫保鸡丁', price: 28, icon: '🍗', desc: '下饭', options: ['size', 'kungPaoNut'] },
      { name: '麻辣香锅', price: 38, icon: '🍲', desc: '香麻过瘾', options: ['malaLevel', 'spiciness3'] },
      { name: '酸辣土豆丝', price: 12, icon: '🥔', desc: '爽口开胃', options: ['sourLevel', 'garlic'] },
      { name: '红烧肉', price: 32, icon: '🥩', desc: '软糯入味', options: ['size', 'porkFat'] },
      { name: '糖醋排骨', price: 35, icon: '🍖', desc: '酸甜酥香', options: ['size', 'sweetSour'] }
      ,
      { name: '番茄鸡蛋盖饭', price: 22, icon: '🍅', desc: '家常', options: ['riceSize', 'onion'] },
      { name: '扬州炒饭', price: 24, icon: '🍚', desc: '粒粒分明', options: ['riceSize', 'addEgg'] },
      { name: '牛肉面', price: 26, icon: '🍜', desc: '热汤', options: ['noodleWidth', 'chiliOil'] },
      { name: '鸡丝凉面', price: 18, icon: '🥢', desc: '清爽', options: ['sauce', 'spiciness3'] },
      { name: '韭菜鸡蛋饺子', price: 20, icon: '🥟', desc: '现包', options: ['dumplingCount', 'vinegar'] },
      { name: '炸鸡腿', price: 16, icon: '🍗', desc: '外酥里嫩', options: ['salt', 'spiciness3'] },
      { name: '清蒸鲈鱼', price: 46, icon: '🐟', desc: '鲜嫩', options: ['scallion', 'soy'] },
      { name: '酸菜鱼', price: 48, icon: '🍲', desc: '开胃', options: ['fishPortion', 'spiciness3'] }
    ],
    dessert: [
      { name: '提拉米苏', price: 32, icon: '🍰', desc: '绵密可可', options: ['portionDessert', 'cocoa'] },
      { name: '杨枝甘露', price: 18, icon: '🥤', desc: '芒果西柚', options: ['ice3', 'sweet3'] },
      { name: '美式咖啡', price: 22, icon: '☕', desc: '醇香回甘', options: ['tempCoffee', 'espresso'] },
      { name: '珍珠奶茶', price: 15, icon: '🧋', desc: '香浓顺滑', options: ['sweet3', 'pearl'] }
      ,
      { name: '抹茶拿铁', price: 26, icon: '🍵', desc: '回甘', options: ['tempCoffee', 'cupSize2'] },
      { name: '柠檬水', price: 10, icon: '🍋', desc: '清爽', options: ['ice3', 'sweet3'] },
      { name: '草莓酸奶', price: 16, icon: '🍓', desc: '酸甜', options: ['sweet3', 'cupSize2'] },
      { name: '热可可', price: 18, icon: '🍫', desc: '浓郁', options: ['tempCocoa', 'cupSize2'] },
      { name: '芝士蛋糕', price: 28, icon: '🧀', desc: '细腻', options: ['portionDessert', 'cheese'] },
      { name: '布丁', price: 14, icon: '🍮', desc: '嫩滑', options: ['portionDessert', 'caramel'] }
    ],
    super: [
      { name: '矿泉水', price: 2, icon: '🥤', desc: '550ml', options: ['packWater'] },
      { name: '方便面', price: 5, icon: '🍜', desc: '红烧牛肉味', options: ['packNoodle'] },
      { name: '牛奶', price: 8, icon: '🥛', desc: '250ml', options: ['milkType', 'packMilk'] },
      { name: '薯片', price: 12, icon: '🥔', desc: '酥脆', options: ['chipsFlavor', 'packChips'] }
      ,
      { name: '纸巾', price: 9, icon: '🧻', desc: '家用', options: ['tissuePack', 'tissueType'] },
      { name: '鸡蛋', price: 12, icon: '🥚', desc: '新鲜', options: ['eggCount'] },
      { name: '面包', price: 11, icon: '🍞', desc: '松软', options: ['breadType', 'breadCount'] },
      { name: '酸奶', price: 8, icon: '🥛', desc: '冷藏', options: ['yogurtSweet', 'packYogurt'] },
      { name: '洗洁精', price: 15, icon: '🧴', desc: '去油', options: ['cleanSize'] }
    ],
    vegetable: [
      { name: '西红柿', price: 6, icon: '🍅', desc: '新鲜', options: ['weight2', 'ripe2'] },
      { name: '黄瓜', price: 5, icon: '🥒', desc: '新鲜', options: ['weight2', 'cut2'] },
      { name: '大白菜', price: 4, icon: '🥬', desc: '新鲜', options: ['weight2'] },
      { name: '胡萝卜', price: 5, icon: '🥕', desc: '新鲜', options: ['weight2', 'cut2'] }
      ,
      { name: '土豆', price: 6, icon: '🥔', desc: '新鲜', options: ['weight2', 'cut2'] },
      { name: '洋葱', price: 5, icon: '🧅', desc: '新鲜', options: ['weight2', 'onion'] },
      { name: '青椒', price: 7, icon: '🫑', desc: '新鲜', options: ['weight2', 'spicinessPepper'] },
      { name: '生姜', price: 6, icon: '🫚', desc: '提味', options: ['gingerSize'] }
    ],
    fruit: [
      { name: '苹果', price: 12, icon: '🍎', desc: '脆甜', options: ['weight2', 'cut2'] },
      { name: '香蕉', price: 8, icon: '🍌', desc: '香甜', options: ['weight2', 'ripe2'] },
      { name: '橙子', price: 10, icon: '🍊', desc: '多汁', options: ['weight2'] },
      { name: '葡萄', price: 18, icon: '🍇', desc: '清甜', options: ['weight2'] }
      ,
      { name: '西瓜', price: 25, icon: '🍉', desc: '冰爽', options: ['watermelonSize', 'cut2'] },
      { name: '菠萝', price: 16, icon: '🍍', desc: '香甜', options: ['cutPine', 'ripe2'] },
      { name: '草莓', price: 22, icon: '🍓', desc: '时令', options: ['weight2', 'strawberryGrade'] },
      { name: '猕猴桃', price: 18, icon: '🥝', desc: '酸甜', options: ['weight2', 'ripe2'] }
    ],
    flower: [
      { name: '玫瑰花束', price: 88, icon: '🌹', desc: '同城送', options: ['roseCount', 'wrapColor'] },
      { name: '向日葵', price: 58, icon: '🌻', desc: '同城送', options: ['sunCount', 'wrapColor'] },
      { name: '满天星', price: 45, icon: '🌸', desc: '同城送', options: ['starSize', 'wrapColor'] }
      ,
      { name: '百合花束', price: 78, icon: '💐', desc: '清香', options: ['lilyCount', 'wrapColor'] },
      { name: '康乃馨花束', price: 66, icon: '🌺', desc: '温柔', options: ['carnationCount', 'wrapColor'] }
    ],
    medicine: [
      { name: '感冒灵', price: 18, icon: '💊', desc: '常备', options: ['coldForm', 'coldPack'] },
      { name: '创可贴', price: 8, icon: '🩹', desc: '常备', options: ['bandageType', 'bandagePack'] },
      { name: '维生素C', price: 25, icon: '💊', desc: '常备', options: ['vitaminForm', 'vitaminPack'] }
      ,
      { name: '口罩', price: 12, icon: '😷', desc: '防护', options: ['maskCount', 'maskType'] },
      { name: '消毒湿巾', price: 10, icon: '🧻', desc: '便携', options: ['wipeCount', 'wipeScent'] }
    ],
    errand: [
      { name: '代取快递', price: 5, icon: '📦', desc: '同城', options: ['errandType', 'errandSpeed'] },
      { name: '代买商品', price: 8, icon: '🛒', desc: '同城', options: ['errandType', 'errandSpeed'] },
      { name: '急送', price: 10, icon: '🚴', desc: '同城', options: ['errandType', 'errandSpeed'] }
      ,
      { name: '代排队', price: 15, icon: '🧍', desc: '省心', options: ['queueTime', 'errandSpeed'] },
      { name: '代办文件', price: 20, icon: '📄', desc: '同城', options: ['docType', 'errandSpeed'] }
    ]
  },

  _userNavItems: [],
  _userCategoryItems: {},
  _userOptionDefs: {},
  _adminPersistTimer: null,
  _adminItemStyleChoices: [],
  _adminItemStyleOptionId: null,

  _currentCategory: 'food',
  _addr: '',
  // cart: { [cartKey]: { itemKey, name, icon, basePrice, optionIds, selections, qty, unitPrice } }
  _cart: {},
  // 单品-属性选择关系表：{ [itemKey]: { [optionId]: choiceId, ... } }
  _itemPrefs: {},
  _skuCtx: null,
  _skuQty: 1,

  _optionDefs: {
    // 通用：份量/规格
    size: { title: '份量', required: true, choices: [{ id: 'small', label: '小份' }, { id: 'big', label: '大份' }] },
    portionDessert: { title: '规格', required: true, choices: [{ id: 'one', label: '1份' }, { id: 'two', label: '2份' }] },

    // 菜品：更贴近真实点餐的定制属性
    spiciness3: { title: '辣度', required: true, choices: [{ id: 'none', label: '不辣' }, { id: 'mild', label: '微辣' }, { id: 'hot', label: '重辣' }] },
    kungPaoNut: { title: '花生', required: true, choices: [{ id: 'keep', label: '正常' }, { id: 'less', label: '少花生' }, { id: 'none', label: '不要花生' }] },
    malaLevel: { title: '麻度', required: true, choices: [{ id: 'light', label: '轻麻' }, { id: 'normal', label: '正常麻' }, { id: 'strong', label: '重麻' }] },
    sourLevel: { title: '酸度', required: true, choices: [{ id: 'light', label: '微酸' }, { id: 'normal', label: '正常酸' }, { id: 'strong', label: '重酸' }] },
    garlic: { title: '蒜', required: true, choices: [{ id: 'add', label: '加蒜' }, { id: 'no', label: '不加蒜' }] },
    porkFat: { title: '肥瘦', required: true, choices: [{ id: 'lean', label: '偏瘦' }, { id: 'half', label: '五花' }, { id: 'fat', label: '偏肥' }] },
    sweetSour: { title: '口味', required: true, choices: [{ id: 'sweet', label: '偏甜' }, { id: 'balanced', label: '酸甜平衡' }, { id: 'sour', label: '偏酸' }] },

    // 饮品：常见真实参数（每个单品最多取 1-2 组）
    cupSize2: { title: '杯型', required: true, choices: [{ id: 'medium', label: '中杯' }, { id: 'large', label: '大杯' }] },
    tempCoffee: { title: '温度', required: true, choices: [{ id: 'hot', label: '热' }, { id: 'iced', label: '冰' }] },
    espresso: { title: '浓度', required: true, choices: [{ id: 'single', label: '单份浓缩' }, { id: 'double', label: '双份浓缩' }] },
    ice3: { title: '冰量', required: true, choices: [{ id: 'regular', label: '正常冰' }, { id: 'less', label: '少冰' }, { id: 'none', label: '去冰' }] },
    sweet3: { title: '甜度', required: true, choices: [{ id: 'none', label: '无糖' }, { id: 'less', label: '少糖' }, { id: 'regular', label: '正常糖' }] },
    pearl: { title: '珍珠', required: true, choices: [{ id: 'normal', label: '正常' }, { id: 'more', label: '多珍珠' }, { id: 'none', label: '不要珍珠' }] },
    cocoa: { title: '可可粉', required: true, choices: [{ id: 'normal', label: '正常' }, { id: 'more', label: '多可可' }, { id: 'less', label: '少可可' }] },

    // 超市：包装/口味（每个单品最多 1-2 组）
    packWater: { title: '规格', required: true, choices: [{ id: 'one', label: '1瓶' }, { id: 'six', label: '6瓶装' }, { id: 'case', label: '1箱' }] },
    packNoodle: { title: '规格', required: true, choices: [{ id: 'one', label: '1桶/袋' }, { id: 'six', label: '6桶装' }, { id: 'case', label: '1箱' }] },
    milkType: { title: '类型', required: true, choices: [{ id: 'whole', label: '全脂' }, { id: 'low', label: '低脂' }] },
    packMilk: { title: '规格', required: true, choices: [{ id: 'one', label: '1盒' }, { id: 'twelve', label: '12盒装' }] },
    chipsFlavor: { title: '口味', required: true, choices: [{ id: 'original', label: '原味' }, { id: 'bbq', label: '烧烤味' }, { id: 'tomato', label: '番茄味' }] },
    packChips: { title: '规格', required: true, choices: [{ id: 'one', label: '1袋' }, { id: 'two', label: '2袋' }] },

    // 生鲜：重量/成熟度/处理方式（每个单品最多 1-2 组）
    weight2: { title: '重量', required: true, choices: [{ id: '500g', label: '约500g' }, { id: '1kg', label: '约1kg' }] },
    ripe2: { title: '成熟度', required: true, choices: [{ id: 'crisp', label: '偏脆' }, { id: 'ripe', label: '偏熟' }] },
    cut2: { title: '处理', required: true, choices: [{ id: 'whole', label: '整份' }, { id: 'cut', label: '切块' }] },

    // 鲜花：枝数/包装
    roseCount: { title: '枝数', required: true, choices: [{ id: '11', label: '11枝' }, { id: '19', label: '19枝' }] },
    wrapColor: { title: '包装', required: true, choices: [{ id: 'white', label: '白色' }, { id: 'pink', label: '粉色' }, { id: 'black', label: '黑金' }] },
    sunCount: { title: '枝数', required: true, choices: [{ id: '6', label: '6枝' }, { id: '9', label: '9枝' }] },
    starSize: { title: '规格', required: true, choices: [{ id: 'small', label: '小束' }, { id: 'big', label: '大束' }] },

    // 医药：规格 + 形态
    coldForm: { title: '剂型', required: true, choices: [{ id: 'granule', label: '颗粒' }, { id: 'capsule', label: '胶囊' }] },
    coldPack: { title: '规格', required: true, choices: [{ id: '10', label: '10袋/粒' }, { id: '20', label: '20袋/粒' }] },
    bandageType: { title: '类型', required: true, choices: [{ id: 'normal', label: '普通' }, { id: 'water', label: '防水' }] },
    bandagePack: { title: '规格', required: true, choices: [{ id: '20', label: '20片' }, { id: '40', label: '40片' }] },
    vitaminPack: { title: '规格', required: true, choices: [{ id: '100', label: '100片' }, { id: '200', label: '200片' }] },
    vitaminForm: { title: '形态', required: true, choices: [{ id: 'tablet', label: '片剂' }, { id: 'chew', label: '咀嚼片' }] },

    // 跑腿：服务/速度
    errandType: { title: '服务', required: true, choices: [{ id: 'pickup', label: '代取' }, { id: 'buy', label: '代买' }, { id: 'send', label: '同城急送' }] },
    errandSpeed: { title: '速度', required: true, choices: [{ id: 'normal', label: '普通' }, { id: 'urgent', label: '加急' }] }
    ,
    // 盖饭/炒饭/面食等更贴近单品的属性
    riceSize: { title: '分量', required: true, choices: [{ id: 'normal', label: '正常' }, { id: 'more', label: '加饭' }] },
    onion: { title: '葱', required: true, choices: [{ id: 'add', label: '加葱' }, { id: 'no', label: '不加葱' }] },
    addEgg: { title: '加蛋', required: true, choices: [{ id: 'no', label: '不加蛋' }, { id: 'yes', label: '加蛋' }] },
    noodleWidth: { title: '面条', required: true, choices: [{ id: 'thin', label: '细面' }, { id: 'wide', label: '宽面' }] },
    chiliOil: { title: '辣油', required: true, choices: [{ id: 'no', label: '不加' }, { id: 'less', label: '少量' }, { id: 'normal', label: '正常' }] },
    sauce: { title: '酱', required: true, choices: [{ id: 'sesame', label: '麻酱' }, { id: 'soy', label: '酱油' }] },
    dumplingCount: { title: '份量', required: true, choices: [{ id: '10', label: '10个' }, { id: '15', label: '15个' }] },
    vinegar: { title: '醋', required: true, choices: [{ id: 'normal', label: '正常' }, { id: 'more', label: '多醋' }, { id: 'none', label: '不要醋' }] },
    salt: { title: '咸淡', required: true, choices: [{ id: 'light', label: '少盐' }, { id: 'normal', label: '正常' }] },
    scallion: { title: '葱丝', required: true, choices: [{ id: 'yes', label: '要' }, { id: 'no', label: '不要' }] },
    soy: { title: '蒸鱼豉油', required: true, choices: [{ id: 'yes', label: '要' }, { id: 'no', label: '不要' }] },
    fishPortion: { title: '规格', required: true, choices: [{ id: 'half', label: '半份' }, { id: 'full', label: '整份' }] },

    // 甜点饮品补充
    tempCocoa: { title: '温度', required: true, choices: [{ id: 'hot', label: '热' }, { id: 'warm', label: '温' }] },
    cheese: { title: '口味', required: true, choices: [{ id: 'original', label: '原味' }, { id: 'berry', label: '莓果' }] },
    caramel: { title: '焦糖', required: true, choices: [{ id: 'normal', label: '正常' }, { id: 'more', label: '多焦糖' }, { id: 'none', label: '不要焦糖' }] },

    // 超市补充
    tissuePack: { title: '规格', required: true, choices: [{ id: 'one', label: '1提' }, { id: 'two', label: '2提' }] },
    tissueType: { title: '类型', required: true, choices: [{ id: 'soft', label: '柔软' }, { id: 'thick', label: '加厚' }] },
    eggCount: { title: '数量', required: true, choices: [{ id: '10', label: '10枚' }, { id: '20', label: '20枚' }] },
    breadType: { title: '类型', required: true, choices: [{ id: 'toast', label: '吐司' }, { id: 'baguette', label: '法棍' }] },
    breadCount: { title: '数量', required: true, choices: [{ id: 'one', label: '1个' }, { id: 'two', label: '2个' }] },
    yogurtSweet: { title: '口味', required: true, choices: [{ id: 'original', label: '原味' }, { id: 'fruit', label: '果味' }] },
    packYogurt: { title: '规格', required: true, choices: [{ id: 'one', label: '1瓶' }, { id: 'six', label: '6瓶装' }] },
    cleanSize: { title: '规格', required: true, choices: [{ id: '500', label: '500ml' }, { id: '1l', label: '1L' }] },

    // 蔬菜/水果补充
    spicinessPepper: { title: '辣度', required: true, choices: [{ id: 'mild', label: '微辣' }, { id: 'hot', label: '偏辣' }] },
    gingerSize: { title: '规格', required: true, choices: [{ id: 'small', label: '小块' }, { id: 'big', label: '大块' }] },
    watermelonSize: { title: '规格', required: true, choices: [{ id: 'quarter', label: '1/4个' }, { id: 'half', label: '1/2个' }] },
    cutPine: { title: '处理', required: true, choices: [{ id: 'whole', label: '整颗' }, { id: 'cut', label: '去皮切块' }] },
    strawberryGrade: { title: '等级', required: true, choices: [{ id: 'a', label: '精选' }, { id: 'b', label: '标准' }] },

    // 鲜花补充
    lilyCount: { title: '支数', required: true, choices: [{ id: '3', label: '3支' }, { id: '5', label: '5支' }] },
    carnationCount: { title: '支数', required: true, choices: [{ id: '9', label: '9支' }, { id: '19', label: '19支' }] },

    // 医药补充
    maskCount: { title: '数量', required: true, choices: [{ id: '10', label: '10只' }, { id: '50', label: '50只' }] },
    maskType: { title: '类型', required: true, choices: [{ id: 'normal', label: '日常' }, { id: 'protect', label: '防护' }] },
    wipeCount: { title: '数量', required: true, choices: [{ id: '10', label: '10片' }, { id: '30', label: '30片' }] },
    wipeScent: { title: '气味', required: true, choices: [{ id: 'none', label: '无香' }, { id: 'fresh', label: '清新' }] },

    // 跑腿补充
    queueTime: { title: '时长', required: true, choices: [{ id: '30', label: '30分钟' }, { id: '60', label: '60分钟' }] },
    docType: { title: '类型', required: true, choices: [{ id: 'copy', label: '复印打印' }, { id: 'deliver', label: '文件递送' }] }
  },

  async init() {
    document.getElementById('takeout-back')?.addEventListener('click', () => {
      State.backToHome();
    });

    document.getElementById('takeout-cart')?.addEventListener('click', () => {
      this.openCartDrawer();
    });

    document.getElementById('takeout-orders')?.addEventListener('click', () => {
      this.openOrdersModal();
    });

    document.getElementById('takeout-cart-close')?.addEventListener('click', () => this.closeCartDrawer());
    document.getElementById('takeout-cart-clear')?.addEventListener('click', () => this.clearCart());
    document.getElementById('takeout-cart-address')?.addEventListener('input', (e) => {
      this._addr = String(e?.target?.value || '');
      this._persistAddrSoon();
    });
    document.getElementById('takeout-cart-pay')?.addEventListener('click', () => {
      this._precheckWalletThenPay();
    });
    document.getElementById('takeout-cart-help')?.addEventListener('click', () => {
      this._requestProxyPayFromCart();
    });

    document.getElementById('takeout-sku-close')?.addEventListener('click', () => this.closeSkuModal());
    document.getElementById('takeout-sku-x')?.addEventListener('click', () => this.closeSkuModal());
    document.getElementById('takeout-sku-minus')?.addEventListener('click', () => this._changeSkuQty(-1));
    document.getElementById('takeout-sku-plus')?.addEventListener('click', () => this._changeSkuQty(1));
    document.getElementById('takeout-sku-ok')?.addEventListener('click', () => this.confirmSkuAdd());

    // 新增分类/商品
    document.getElementById('takeout-item-add')?.addEventListener('click', () => this.openAdminItemModal());
    document.getElementById('takeout-admin-cat-close')?.addEventListener('click', () => this.closeAdminCategoryModal());
    document.getElementById('takeout-admin-cat-x')?.addEventListener('click', () => this.closeAdminCategoryModal());
    document.getElementById('takeout-admin-cat-save')?.addEventListener('click', () => this.confirmAdminAddCategory());
    document.getElementById('takeout-admin-item-close')?.addEventListener('click', () => this.closeAdminItemModal());
    document.getElementById('takeout-admin-item-x')?.addEventListener('click', () => this.closeAdminItemModal());
    document.getElementById('takeout-admin-item-save')?.addEventListener('click', () => this.confirmAdminAddItem());
    document.getElementById('takeout-admin-item-style-add')?.addEventListener('click', () => this._adminAddStyleChoice());
    document.getElementById('takeout-admin-item-style-input')?.addEventListener('keydown', (e) => {
      if (e?.key === 'Enter') {
        e.preventDefault();
        this._adminAddStyleChoice();
      }
    });

    await this._loadPersisted();
    await this._loadAdminPersisted();
    this._applyAdminDataToMemory();

    window.addEventListener('yd:pagechange', (e) => {
      const to = e?.detail?.to;
      if (to === 'page-takeout') {
        this.render();
      }
    });

    // 支付面板事件
    document.getElementById('takeout-pay-close')?.addEventListener('click', () => this.closePaySheet());
    document.getElementById('takeout-pay-x')?.addEventListener('click', () => this.closePaySheet());
    document.getElementById('takeout-pay-kb')?.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button[data-k]');
      const k = btn?.getAttribute?.('data-k');
      if (!k) return;
      this._handlePayKey(k);
    });
    document.getElementById('takeout-pay-forgot')?.addEventListener('click', () => {
      this.closePaySheet();
      State.switchPage('page-wallet');
      // 进入钱包后打开修改密码弹窗
      setTimeout(() => {
        try { if (typeof Wallet !== 'undefined' && Wallet.openPasswordModal) Wallet.openPasswordModal(); } catch (e) {}
      }, 220);
    });

    // 订单弹窗事件
    document.getElementById('takeout-orders-close')?.addEventListener('click', () => this.closeOrdersModal());
    document.getElementById('takeout-orders-x')?.addEventListener('click', () => this.closeOrdersModal());
    document.getElementById('takeout-order-detail-close')?.addEventListener('click', () => this.closeOrderDetail());
    document.getElementById('takeout-order-detail-x')?.addEventListener('click', () => this.closeOrderDetail());
    document.getElementById('takeout-order-share')?.addEventListener('click', () => {
      const modal = document.getElementById('takeout-order-detail');
      const orderId = modal?.dataset?.orderId;
      if (!orderId) return;
      this._openShareSessionPicker({
        orderId: modal.dataset.orderId,
        title: modal.dataset.orderTitle || '',
        total: modal.dataset.orderTotal || '0'
      });
    });
  },

  async _precheckWalletThenPay() {
    try {
      const addrInput = document.getElementById('takeout-cart-address');
      const addr = String(addrInput?.value || '').trim();
      if (!addr) {
        alert('请先填写配送地址再结算');
        if (addrInput) addrInput.focus();
        return;
      }

      const wallet = await Storage.kvGet('wallet_v1');
      const activated = !!wallet?.activated;
      const balance = Number(wallet?.balance) || 0;
      if (!activated || balance <= 0) {
        const msg = !activated
          ? '你还未激活银行卡，无法结算。现在去“我的钱包”激活吗？'
          : '银行卡余额为 0，无法结算。现在去“我的钱包”修改余额吗？';
        if (confirm(msg)) {
          this.closeCartDrawer();
          State.switchPage('page-wallet');
          // 进入钱包后：未激活会自动弹激活；已激活但余额为0时引导打开修改余额
          if (activated && balance <= 0) {
            setTimeout(() => {
              try { if (typeof Wallet !== 'undefined' && Wallet.openBalanceModal) Wallet.openBalanceModal(); } catch (e) {}
            }, 220);
          }
        }
        return;
      }
    } catch (e) {
      // 若读取失败，仍允许进入支付弹窗（后续会再校验）
    }
    await this.openPaySheet();
  },

  // 点击购物车“请Ta代付”后：先在本地生成一条“未支付（待代付）”订单，再让用户选择会话把代付询问发给角色
  async _requestProxyPayFromCart() {
    try {
      const total = Object.values(this._cart || {}).reduce((sum, row) => sum + Number(row.unitPrice || 0) * Number(row.qty || 0), 0);
      if (!total || total <= 0) {
        alert('购物车为空');
        return;
      }

      const addrInput = document.getElementById('takeout-cart-address');
      const addr = String(addrInput?.value || '').trim();
      if (!addr) {
        alert('请先填写配送地址再代付');
        addrInput?.focus?.();
        return;
      }

      // 生成待代付订单（不扣款）
      const order = await this._createOrderFromCart(total, { payState: 'unpaid', paidBy: 'unpaid', paidAt: 0 });

      // 选择会话并向角色发起代付询问
      await this._openProxyRequestSessionPicker({ source: 'takeout', order });
    } catch (e) {
      console.error('[takeout][proxy]request failed', e);
      alert('代付请求失败，请稍后重试');
    }
  },

  async _openProxyRequestSessionPicker({ source, order }) {
    const existing = document.getElementById('takeout-proxy-session-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'takeout-proxy-session-modal';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="选择会话">
        <div class="yd-modal-header">
          <div style="font-weight:900">代付请求发往哪个会话</div>
          <button type="button" class="yd-btn-close" id="takeout-proxy-session-close" aria-label="关闭">×</button>
        </div>
        <div id="takeout-proxy-session-list" style="display:flex;flex-direction:column;gap:0;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      const el = document.getElementById('takeout-proxy-session-modal');
      if (el) el.remove();
    };
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('takeout-proxy-session-close')?.addEventListener('click', close);

    let sessions = [];
    try {
      sessions = await Storage.dbGetAll('sessions');
    } catch (e) {
      sessions = [];
    }
    if (!Array.isArray(sessions) || !sessions.length) {
      const listEl = document.getElementById('takeout-proxy-session-list');
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

    const listEl = document.getElementById('takeout-proxy-session-list');
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
            '外卖',
            '订单',
            '邀请代付',
            escPipe(order.id),
            escPipe('外卖订单'),
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
          console.error('[takeout][proxy]send failed', e);
          alert('代付询问发送失败，请稍后重试');
        }
      };
      item.addEventListener('click', run);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') run();
      });
    });
  },

  _payPwd: '',
  _payProcessing: false,

  async openPaySheet() {
    const total = Object.values(this._cart).reduce((sum, row) => sum + Number(row.unitPrice || 0) * Number(row.qty || 0), 0);
    if (!total || total <= 0) {
      alert('购物车为空');
      return;
    }
    const sheet = document.getElementById('takeout-pay');
    if (!sheet) return;
    this._payPwd = '';
    sheet.setAttribute('aria-hidden', 'false');
    const forgot = document.getElementById('takeout-pay-forgot');
    if (forgot) forgot.hidden = true;

    const amountEl = document.getElementById('takeout-pay-amount');
    if (amountEl) amountEl.textContent = this._formatCny(total);

    const descEl = document.getElementById('takeout-pay-desc');
    if (descEl) {
      const rows = Object.values(this._cart || {}).filter(Boolean);
      const totalQty = rows.reduce((s, r) => s + (Number(r?.qty) || 0), 0);
      const names = [];
      for (const r of rows) {
        const n = String(r?.name || '').trim();
        if (n) names.push(n);
        if (names.length >= 2) break;
      }
      const a = names[0] || '商品';
      const b = names[1] || '';
      const itemsText = b ? `${a}、${b}` : a;
      const qtyText = totalQty > 0 ? `${totalQty}` : '0';
      descEl.textContent = `购买 ${itemsText} ${qtyText}件商品`;
    }

    // 读取钱包余额
    let balance = 0;
    try {
      const wallet = await Storage.kvGet('wallet_v1');
      balance = Number(wallet?.balance) || 0;
    } catch (e) {}
    const methodEl = document.getElementById('takeout-pay-method');
    if (methodEl) {
      methodEl.textContent = `银行卡（余额：${this._formatCny(balance)}）`;
    }
    this._renderPayBoxes();
  },

  closePaySheet() {
    if (this._payProcessing) return;
    const sheet = document.getElementById('takeout-pay');
    if (!sheet) return;
    sheet.setAttribute('aria-hidden', 'true');
    this._payPwd = '';
    const forgot = document.getElementById('takeout-pay-forgot');
    if (forgot) forgot.hidden = true;
  },

  _renderPayBoxes() {
    const boxes = document.querySelectorAll('#takeout-pay-boxes .yd-takeout-pay__box');
    const pwd = String(this._payPwd || '');
    boxes.forEach((b, i) => {
      b.classList.toggle('is-filled', !!pwd[i]);
    });
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

    if (this._payPwd.length === 6) {
      await this._tryPay();
    }
  },

  async _showPayProcessing(ms = 1000) {
    let mask = document.getElementById('takeout-pay-processing');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'takeout-pay-processing';
      mask.className = 'yd-takeout-pay-processing';
      mask.innerHTML = `
        <div class="yd-takeout-pay-processing__box" role="status" aria-live="polite">
          <div class="yd-takeout-pay-processing__spinner" aria-hidden="true"></div>
          <div class="yd-takeout-pay-processing__text">正在支付，请稍候…</div>
        </div>
      `;
      document.body.appendChild(mask);
    }
    mask.setAttribute('aria-hidden', 'false');
    await new Promise(resolve => setTimeout(resolve, Math.max(350, Number(ms) || 0)));
  },

  _hidePayProcessing() {
    const mask = document.getElementById('takeout-pay-processing');
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
        const forgot = document.getElementById('takeout-pay-forgot');
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
      const nextBalance = Math.round((balance - total) * 100) / 100;
      wallet.balance = nextBalance;
      wallet.bills = Array.isArray(wallet.bills) ? wallet.bills : [];
      wallet.bills.push({
        id: State.generateId(),
        ts: Date.now(),
        title: '外卖支付',
        amount: -Math.round(total * 100) / 100
      });
      await Storage.kvSet('wallet_v1', wallet);

      const order = await this._createOrderFromCart(total, { payState: 'paid', paidBy: 'self', paidAt: Date.now() });
      this._hidePayProcessing();
      this._payProcessing = false;
      this.openOrderDetail(order);
      this.closePaySheet();
      this.clearCart();
      this.closeCartDrawer();
    } catch (e) {
      this._hidePayProcessing();
      this._payProcessing = false;
      console.error('pay failed', e);
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
      // 用于聊天分享/订单回显：SKU 参数文本
      specText: this._formatOrderItemOptions(r.optionIds, r.selections)
    })).filter(x => x.name && x.qty > 0);

    const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const names = items.map(it => it.name).filter(Boolean);
    const title = names.slice(0, 2).join('、') || '外卖订单';
    const addr = String(document.getElementById('takeout-cart-address')?.value || '').trim();
    const now = Date.now();
    const resolvedPayState = payMeta?.payState || 'paid';
    const resolvedPaidBy = payMeta?.paidBy || 'self';

    const order = {
      id: State.generateId(),
      ts: now,
      title,
      total: Math.round(Number(total || 0) * 100) / 100,
      qty: totalQty,
      address: addr,
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

  async openOrdersModal() {
    const modal = document.getElementById('takeout-orders-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    await this._renderOrdersList();
  },

  closeOrdersModal() {
    const modal = document.getElementById('takeout-orders-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
  },

  async _renderOrdersList() {
    const listEl = document.getElementById('takeout-orders-list');
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
      <button type="button" class="yd-takeout-order-item" data-id="${this._esc(o.id)}">
        <div class="yd-takeout-order-item__left">
          <div class="yd-takeout-order-item__title">${this._esc(o.title || '外卖订单')}（${Number(o.qty || 0)}件）</div>
          <div class="yd-takeout-order-item__meta">
            ${this._esc(this._formatTime(o.ts || 0))}${o.address ? ' · ' + this._esc(o.address) : ''} · ${this._esc(payLabel(o))}
          </div>
        </div>
        <div class="yd-takeout-order-item__amount">${this._formatCny(o.total || 0)}</div>
      </button>
    `).join('');
    listEl.querySelectorAll('.yd-takeout-order-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        const order = orders.find(x => String(x?.id || '') === String(id));
        if (order) this.openOrderDetail(order);
      });
    });
  },

  openOrderDetail(order) {
    const modal = document.getElementById('takeout-order-detail');
    const body = document.getElementById('takeout-order-detail-body');
    if (!modal || !body || !order) return;
    modal.setAttribute('aria-hidden', 'false');
    modal.dataset.orderId = String(order.id || '');
    modal.dataset.orderTitle = String(order.title || '');
    modal.dataset.orderTotal = String(order.total || 0);
    const items = Array.isArray(order.items) ? order.items : [];
    body.innerHTML = `
      <div class="yd-takeout-order-detail__section">
        <div class="yd-takeout-order-detail__row"><div class="yd-takeout-order-detail__label">订单</div><div class="yd-takeout-order-detail__value">${this._esc(order.title || '外卖订单')}</div></div>
        <div class="yd-takeout-order-detail__row"><div class="yd-takeout-order-detail__label">时间</div><div class="yd-takeout-order-detail__value">${this._esc(this._formatTime(order.ts || 0))}</div></div>
        <div class="yd-takeout-order-detail__row"><div class="yd-takeout-order-detail__label">金额</div><div class="yd-takeout-order-detail__value" style="color:#FF6B00;">${this._formatCny(order.total || 0)}</div></div>
        <div class="yd-takeout-order-detail__row"><div class="yd-takeout-order-detail__label">支付方式</div><div class="yd-takeout-order-detail__value">银行卡支付</div></div>
        <div class="yd-takeout-order-detail__row"><div class="yd-takeout-order-detail__label">支付状态</div><div class="yd-takeout-order-detail__value">${this._esc((() => {
          const ps = String(order?.payState || '');
          const pb = String(order?.paidBy || '');
          if (ps === 'proxy_paid' || pb === 'proxy') return '已代付（代付方）';
          if (ps === 'unpaid' || pb === 'unpaid') return '未支付';
          return '已支付（自己）';
        })())}</div></div>
        <div class="yd-takeout-order-detail__row"><div class="yd-takeout-order-detail__label">地址</div><div class="yd-takeout-order-detail__value">${this._esc(order.address || '—')}</div></div>
      </div>
      <div class="yd-takeout-order-detail__section">
        <div style="font-weight:900;margin-bottom:6px;">商品明细</div>
        <div class="yd-takeout-order-detail__items">
          ${items.map(it => `
            <div class="yd-takeout-order-detail__item">
              <div class="yd-takeout-order-detail__item-name">
                ${this._esc(it.icon || '')} ${this._esc(it.name || '')}
                ${(() => {
                  // 订单详情页：DB 完整字段优先；如果来自聊天分享消息则可能只有 specText。
                  const txt = this._formatOrderItemOptions(it.optionIds, it.selections) || (it.specText ? String(it.specText) : '');
                  return txt ? `<div style="font-size:11px;color:rgba(17,17,17,0.6);margin-top:2px;">${this._esc(txt)}</div>` : '';
                })()}
              </div>
              <div class="yd-takeout-order-detail__item-qty">×${Number(it.qty || 0)}</div>
              <div class="yd-takeout-order-detail__item-sub">¥${Math.round((Number(it.unitPrice||0) * Number(it.qty||0))*100)/100}</div>
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

  async _openShareSessionPicker({ orderId, title, total }) {
    const orderIdStr = String(orderId || '');
    if (!orderIdStr) return;

    // 尽量拿到“整份订单对象”，用于把完整详情写入聊天消息体
    let order = null;
    try {
      const existing = await Storage.kvGet(this.STORAGE_KEY_ORDERS);
      if (Array.isArray(existing)) {
        order = existing.find(x => String(x?.id || '') === orderIdStr) || null;
      }
    } catch (e) {}
    if (!order) {
      // 兜底：至少保证能打开详情页（如果订单确实存在于 DB，则不会走到这里）
      order = {
        id: orderIdStr,
        title: String(title || ''),
        total: Number(total || 0),
        ts: 0,
        qty: 0,
        address: ''
      };
    }

    // close existing
    const existing = document.getElementById('takeout-share-session-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'takeout-share-session-modal';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="选择会话">
        <div class="yd-modal-header">
          <div style="font-weight:900">分享至哪个会话</div>
          <button type="button" class="yd-btn-close" id="takeout-share-session-close" aria-label="关闭">×</button>
        </div>
        <div id="takeout-share-session-list" style="display:flex;flex-direction:column;gap:0;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      const el = document.getElementById('takeout-share-session-modal');
      if (el) el.remove();
    };

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    document.getElementById('takeout-share-session-close')?.addEventListener('click', close);

    // Load sessions from IndexedDB
    let sessions = [];
    try {
      sessions = await Storage.dbGetAll('sessions');
    } catch (e) {
      sessions = [];
    }

    if (!Array.isArray(sessions) || sessions.length === 0) {
      const list = document.getElementById('takeout-share-session-list');
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

    const characterList = sessions.slice(0, 50);
    const listEl = document.getElementById('takeout-share-session-list');
    if (!listEl) return;
    const charNamesForSession = (session) => {
      const names = Array.isArray(session?.participantCharacterNames)
        ? session.participantCharacterNames.filter(Boolean)
        : [];
      return names.length ? names.join('、') : (session?.title || '默认AI');
    };

    listEl.innerHTML = characterList.map(s => {
      const label = charNamesForSession(s);
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
          await this._insertShareMessageToSession({
            sessionId: sid,
            order
          });
          close();

          // 写入成功后，直接跳转到该会话的聊天框
          if (typeof Chat !== 'undefined' && Chat && typeof Chat.openSession === 'function') {
            await Chat.openSession(sid);
            if (typeof Chat._toast === 'function') Chat._toast('已分享');
          } else if (typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
            State.switchPage('page-chat');
          }
        } catch (e) {
          console.error('[takeout][share]insert failed', e);
          alert('分享失败，请稍后重试');
        }
      };
      item.addEventListener('click', run);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') run();
      });
    });
  },

  _b64EncodeUtf8(str) {
    // 浏览器端 base64 + UTF-8 安全编码
    const s = String(str || '');
    try {
      return btoa(unescape(encodeURIComponent(s)));
    } catch (e) {
      // 极端情况下兜底：直接 btoa（可能丢失非 ASCII）
      return btoa(s);
    }
  },

  async _insertShareMessageToSession({ sessionId, order }) {
    const sid = String(sessionId || '');
    if (!sid) return;

    const orderObj = order && typeof order === 'object' ? order : { id: '' };
    const orderId = String(orderObj.id || '');
    if (!orderId) return;

    // 新分享消息体（中文协议）
    // [分享]应用|资源|动作|主键|标题|金额|状态|时间|地址|图标|名称|数量|规格|单价...
    const shareTitle = '外卖订单';
    const total = Number(orderObj.total || 0) || 0;
    const address = String(orderObj.address || '');
    const ts = Number(orderObj.ts || 0) || 0;
    const items = Array.isArray(orderObj.items) ? orderObj.items : [];
    const payStatus = (() => {
      const ps = String(orderObj?.payState || '');
      const pb = String(orderObj?.paidBy || '');
      if (ps === 'proxy_paid' || pb === 'proxy') return '已代付';
      if (ps === 'unpaid' || pb === 'unpaid') return '未支付';
      return '自己已支付';
    })();

    const escPipe = (v) => String(v ?? '').replace(/\|/g, '｜');

    const parts = [
      '外卖',
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

  closeOrderDetail() {
    const modal = document.getElementById('takeout-order-detail');
    if (!modal) return;

    const returnPage = modal.dataset?.returnPage ? String(modal.dataset.returnPage) : '';
    const returnSessionId = modal.dataset?.returnSessionId ? String(modal.dataset.returnSessionId) : '';
    if (modal.dataset) {
      delete modal.dataset.returnPage;
      delete modal.dataset.returnSessionId;
    }
    modal.setAttribute('aria-hidden', 'true');

    // 如果从聊天卡片进入，需要回到原页面
    if (returnPage && typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
      if (returnSessionId && typeof Chat !== 'undefined' && Chat) {
        // 尽量保持回到聊天后仍在同一会话
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

  render() {
    const navEl = document.getElementById('takeout-nav');
    const titleEl = document.getElementById('takeout-section-title');
    const current = (this._navItems || []).find(x => x && x.id === this._currentCategory);
    if (titleEl) titleEl.textContent = current?.name || '推荐';
    if (navEl) {
      const addCategoryId = '__takeout_admin_add_category__';
      const renderNavItems = [
        ...(this._navItems || []),
        { id: addCategoryId, icon: '＋', name: '新增', _isAddCategoryTile: true }
      ];

      navEl.innerHTML = renderNavItems.map((item) => {
        const isAdd = !!item._isAddCategoryTile;
        const pressed = item.id === this._currentCategory && !isAdd;
        return `
          <button class="yd-takeout-nav-item${isAdd ? ' yd-takeout-nav-item--add' : ''}" type="button" data-category="${this._esc(item.id)}" data-name="${this._esc(item.name)}" aria-pressed="${pressed}">
            <span class="icon">${item.icon}</span>
            <span>${item.name}</span>
          </button>
        `;
      }).join('');
      navEl.querySelectorAll('.yd-takeout-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const cid = btn.dataset.category;
          if (!cid) return;
          if (cid === addCategoryId) {
            this.openAdminCategoryModal();
            return;
          }
          this._currentCategory = cid;
          this.render();
        });
      });
    }

    this._renderItems();
    this._renderCartBadge();
  },

  _renderItems() {
    const listEl = document.getElementById('takeout-item-list');
    if (listEl) {
      const currentCid = this._currentCategory;
      const rawItems = this._categoryItems[currentCid] || [];
      const items = rawItems
        .map((it, idx) => ({
          it,
          rawIdx: idx,
          isUser: !!it?.__isUserAdded,
          customId: String(it?.__customId || '')
        }))
        .sort((a, b) => {
          if (a.isUser === b.isUser) return 0;
          return a.isUser ? -1 : 1;
        });

      listEl.innerHTML = items.map(({ it, rawIdx, isUser, customId }) => `
        <div class="yd-takeout-item-card">
          ${isUser ? `
          <div class="yd-takeout-item-menu">
            <button class="yd-takeout-item-menu__trigger" type="button" data-custom-id="${this._esc(customId)}" aria-label="更多">⋯</button>
            <div class="yd-takeout-item-menu__panel" hidden>
              <button class="yd-takeout-item-menu__delete" type="button" data-custom-id="${this._esc(customId)}">删除</button>
            </div>
          </div>
          ` : ''}
          <div class="yd-takeout-item-card__inner">
            <div class="yd-takeout-item-card__img">${it.icon || '🍽️'}</div>
            <div class="yd-takeout-item-card__info">
              <div>
                <div class="yd-takeout-item-card__name">${this._esc(it.name)}</div>
                <div class="yd-takeout-item-card__desc">${this._esc(it.desc || '')}</div>
              </div>
              <div class="yd-takeout-item-card__meta">
                <div class="yd-takeout-item-card__price">¥${Number(it.price || 0)}</div>
                <button class="yd-takeout-item-card__add" type="button" data-idx="${rawIdx}" aria-label="选择属性并加入">+</button>
              </div>
            </div>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.yd-takeout-item-menu__trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const card = btn.closest('.yd-takeout-item-card');
          const panel = card?.querySelector('.yd-takeout-item-menu__panel');
          if (!panel) return;
          const isHidden = panel.hasAttribute('hidden');
          listEl.querySelectorAll('.yd-takeout-item-menu__panel').forEach(p => p.setAttribute('hidden', 'true'));
          if (isHidden) panel.removeAttribute('hidden');
        });
      });

      listEl.querySelectorAll('.yd-takeout-item-menu__delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const customId = btn.getAttribute('data-custom-id') || '';
          if (!customId) return;
          if (!confirm('是否要删除这个商品？')) return;
          this._deleteUserItem(currentCid, customId);
        });
      });

      listEl.querySelectorAll('.yd-takeout-item-card__add').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          const pick = rawItems[idx];
          if (!pick) return;
          const itemKey = `${this._currentCategory}:${idx}`;
          this.openSkuModal(itemKey, pick);
        });
      });
    }
  },

  openSkuModal(itemKey, item) {
    const modal = document.getElementById('takeout-sku-modal');
    const title = document.getElementById('takeout-sku-title');
    const body = document.getElementById('takeout-sku-body');
    if (!modal || !title || !body) return;

    const optionIds = Array.isArray(item.options) ? item.options.slice(0, 2) : [];
    const prefs = (this._itemPrefs && this._itemPrefs[itemKey]) ? { ...this._itemPrefs[itemKey] } : {};
    // 只保留当前单品支持的选项
    Object.keys(prefs).forEach(k => {
      if (!optionIds.includes(k)) delete prefs[k];
    });
    // 若必选但无值，先置空，等待用户选择
    optionIds.forEach(oid => {
      if (!(oid in prefs)) prefs[oid] = '';
    });

    this._skuQty = 1;
    this._skuCtx = { itemKey, item, optionIds, selections: prefs };

    title.textContent = item.name || '选择规格';
    body.innerHTML = optionIds.length
      ? optionIds.map(oid => this._renderOptionGroup(oid)).join('')
      : `<div style="color:#777;font-size:13px;padding:8px 2px;">无需选择属性</div>`;

    body.querySelectorAll('.yd-takeout-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const oid = btn.getAttribute('data-oid');
        const cid = btn.getAttribute('data-cid');
        if (!oid || !cid || !this._skuCtx) return;
        this._skuCtx.selections[oid] = cid;
        this._itemPrefs[this._skuCtx.itemKey] = { ...this._skuCtx.selections };
        this._persistSoon();
        this._refreshSkuModal();
      });
    });

    modal.classList.add('yd-modal--active');
    modal.setAttribute('aria-hidden', 'false');
    this._refreshSkuModal();
  },

  _renderOptionGroup(optionId) {
    const def = this._optionDefs[optionId];
    if (!def) return '';
    const sel = (this._skuCtx && this._skuCtx.selections) ? this._skuCtx.selections[optionId] : '';
    return `
      <div class="yd-takeout-option-group">
        <div class="yd-takeout-option-group__title">
          ${this._esc(def.title)}
          <span class="yd-takeout-option-group__hint">${def.required ? '必选' : '可选'}</span>
        </div>
        <div class="yd-takeout-options">
          ${(def.choices || []).map(ch => `
            <button type="button" class="yd-takeout-option" data-oid="${this._esc(optionId)}" data-cid="${this._esc(ch.id)}" aria-pressed="${ch.id === sel}">
              ${this._esc(ch.label)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  _refreshSkuModal() {
    const qtyEl = document.getElementById('takeout-sku-qty');
    const priceEl = document.getElementById('takeout-sku-price');
    const okBtn = document.getElementById('takeout-sku-ok');
    if (qtyEl) qtyEl.textContent = String(this._skuQty);

    const base = Number(this._skuCtx?.item?.price || 0);
    const unit = base; // 这里先不做加价逻辑，保持简单真实：规格通常不额外加价可后续扩展
    if (priceEl) priceEl.textContent = `¥${unit * this._skuQty}`;

    const ready = this._isSkuReady();
    if (okBtn) okBtn.disabled = !ready;

    // 更新按钮 pressed 状态（重建更简单但会丢事件，这里局部更新）
    const body = document.getElementById('takeout-sku-body');
    if (body && this._skuCtx) {
      body.querySelectorAll('.yd-takeout-option').forEach(btn => {
        const oid = btn.getAttribute('data-oid');
        const cid = btn.getAttribute('data-cid');
        if (!oid || !cid) return;
        btn.setAttribute('aria-pressed', String(this._skuCtx.selections[oid] === cid));
      });
    }
  },

  _isSkuReady() {
    if (!this._skuCtx) return false;
    const optionIds = this._skuCtx.optionIds || [];
    for (const oid of optionIds) {
      const def = this._optionDefs[oid];
      if (def && def.required && !this._skuCtx.selections[oid]) return false;
    }
    return true;
  },

  _changeSkuQty(delta) {
    this._skuQty = Math.max(1, Math.min(99, this._skuQty + Number(delta || 0)));
    this._refreshSkuModal();
  },

  closeSkuModal() {
    const modal = document.getElementById('takeout-sku-modal');
    if (!modal) return;
    modal.classList.remove('yd-modal--active');
    modal.setAttribute('aria-hidden', 'true');
    this._skuCtx = null;
    this._skuQty = 1;
  },

  confirmSkuAdd() {
    if (!this._isSkuReady() || !this._skuCtx) return;
    const { itemKey, item, optionIds, selections } = this._skuCtx;
    const cartKey = this._makeCartKey(itemKey, selections, optionIds);
    const basePrice = Number(item.price || 0);
    const unitPrice = basePrice;
    const qty = this._skuQty;

    const existing = this._cart[cartKey];
    if (existing) {
      existing.qty = Number(existing.qty || 0) + qty;
    } else {
      this._cart[cartKey] = {
        itemKey,
        name: item.name || '单品',
        icon: item.icon || '🍽️',
        basePrice,
        unitPrice,
        optionIds: optionIds || [],
        selections: { ...selections },
        qty
      };
    }
    this._persistSoon();
    this._renderCartBadge();
    this.closeSkuModal();
  },

  _makeCartKey(itemKey, selections, optionIds) {
    const parts = [];
    (optionIds || []).forEach(oid => {
      parts.push(`${oid}=${selections?.[oid] || ''}`);
    });
    return `${itemKey}|${parts.join('&')}`;
  },

  openCartDrawer() {
    const drawer = document.getElementById('takeout-cart-drawer');
    if (!drawer) return;
    drawer.classList.add('yd-modal--active');
    drawer.setAttribute('aria-hidden', 'false');
    const addrInput = document.getElementById('takeout-cart-address');
    if (addrInput) addrInput.value = String(this._addr || '');
    this._renderCartDrawer();
  },

  closeCartDrawer() {
    const drawer = document.getElementById('takeout-cart-drawer');
    if (!drawer) return;
    drawer.classList.remove('yd-modal--active');
    drawer.setAttribute('aria-hidden', 'true');
  },

  clearCart() {
    this._cart = {};
    this._persistSoon();
    this._renderCartBadge();
    this._renderCartDrawer();
  },

  _renderCartDrawer() {
    const list = document.getElementById('takeout-cart-list');
    const totalEl = document.getElementById('takeout-cart-total');
    if (!list || !totalEl) return;

    const rows = Object.keys(this._cart || {}).map(k => ({ key: k, ...this._cart[k] }));
    if (!rows.length) {
      list.innerHTML = `<div style="padding:28px 0;text-align:center;color:#999;font-size:13px;">购物车空空的</div>`;
      totalEl.textContent = '¥0';
      return;
    }

    const formatOpts = (row) => {
      const optionIds = row.optionIds || [];
      const sels = row.selections || {};
      const labels = [];
      optionIds.forEach(oid => {
        const def = this._optionDefs[oid];
        const cid = sels[oid];
        if (!def || !cid) return;
        const c = (def.choices || []).find(x => x.id === cid);
        if (c) labels.push(`${def.title}：${c.label}`);
      });
      return labels.join(' · ');
    };

    list.innerHTML = rows.map(row => `
      <div class="yd-takeout-cart-row" data-key="${this._esc(row.key)}">
        <div class="yd-takeout-cart-row__icon">${this._esc(row.icon)}</div>
        <div class="yd-takeout-cart-row__main">
          <div class="yd-takeout-cart-row__name">${this._esc(row.name)}</div>
          <div class="yd-takeout-cart-row__opts">${this._esc(formatOpts(row))}</div>
        </div>
        <div class="yd-takeout-cart-row__right">
          <div class="yd-takeout-cart-row__price">¥${Number(row.unitPrice || 0) * Number(row.qty || 0)}</div>
          <div class="yd-takeout-cart-row__stepper">
            <button type="button" data-act="minus" aria-label="减少">−</button>
            <span>${Number(row.qty || 0)}</span>
            <button type="button" data-act="plus" aria-label="增加">＋</button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.yd-takeout-cart-row button').forEach(btn => {
      btn.addEventListener('click', () => {
        const rowEl = btn.closest('.yd-takeout-cart-row');
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
        this._renderCartBadge();
        this._renderCartDrawer();
      });
    });

    const total = Object.values(this._cart).reduce((sum, row) => {
      return sum + Number(row.unitPrice || 0) * Number(row.qty || 0);
    }, 0);
    totalEl.textContent = `¥${total}`;
  },

  _renderCartBadge() {
    const badge = document.getElementById('takeout-cart-badge');
    if (!badge) return;
    const total = Object.values(this._cart).reduce((sum, row) => {
      if (!row || typeof row !== 'object') return sum;
      return sum + Number(row.qty || 0);
    }, 0);
    if (total > 0) {
      badge.hidden = false;
      badge.textContent = String(total);
    } else {
      badge.hidden = true;
      badge.textContent = '0';
    }
  },

  openAdminCategoryModal() {
    const modal = document.getElementById('takeout-admin-cat-modal');
    if (!modal) return;
    const name = document.getElementById('takeout-admin-cat-name');
    const icon = document.getElementById('takeout-admin-cat-icon');
    if (name) name.value = '';
    if (icon) icon.value = '';
    modal.classList.add('yd-modal--active');
    modal.setAttribute('aria-hidden', 'false');
  },

  closeAdminCategoryModal() {
    const modal = document.getElementById('takeout-admin-cat-modal');
    if (!modal) return;
    modal.classList.remove('yd-modal--active');
    modal.setAttribute('aria-hidden', 'true');
  },

  openAdminItemModal() {
    const modal = document.getElementById('takeout-admin-item-modal');
    if (!modal) return;

    const catSel = document.getElementById('takeout-admin-item-category');
    if (catSel) {
      const options = (this._navItems || []).map((c) => {
        const selected = c.id === this._currentCategory ? 'selected' : '';
        return `<option value="${String(c.id)}" ${selected}>${this._esc(c.name)}</option>`;
      }).join('');
      catSel.innerHTML = options || '';
    }

    const name = document.getElementById('takeout-admin-item-name');
    const price = document.getElementById('takeout-admin-item-price');
    const icon = document.getElementById('takeout-admin-item-icon');
    const desc = document.getElementById('takeout-admin-item-desc');
    if (name) name.value = '';
    if (price) price.value = '';
    if (icon) icon.value = '';
    if (desc) desc.value = '';

    const styleInput = document.getElementById('takeout-admin-item-style-input');
    if (styleInput) styleInput.value = '';
    this._adminItemStyleChoices = [];
    this._adminItemStyleOptionId = null;
    this._renderAdminStyleList();

    modal.classList.add('yd-modal--active');
    modal.setAttribute('aria-hidden', 'false');
  },

  closeAdminItemModal() {
    const modal = document.getElementById('takeout-admin-item-modal');
    if (!modal) return;
    modal.classList.remove('yd-modal--active');
    modal.setAttribute('aria-hidden', 'true');
  },

  _renderAdminStyleList() {
    const listEl = document.getElementById('takeout-admin-item-style-list');
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
    const input = document.getElementById('takeout-admin-item-style-input');
    if (!input) return;
    const raw = String(input.value || '').trim();
    if (!raw) return;
    if (!Array.isArray(this._adminItemStyleChoices)) this._adminItemStyleChoices = [];
    if (this._adminItemStyleChoices.includes(raw)) {
      input.value = '';
      return;
    }
    this._adminItemStyleChoices.push(raw);
    input.value = '';
    this._adminItemStyleChoices = this._adminItemStyleChoices.slice(0, 8);
    this._renderAdminStyleList();
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
      const next = userList.filter(it => String(it?.__customId || '') !== uid);
      if (next.length !== userList.length) {
        this._userCategoryItems[cid] = next;
        changed = true;
      }
    }

    const allList = this._categoryItems?.[cid];
    if (Array.isArray(allList)) {
      const nextAll = allList.filter(it => String(it?.__customId || '') !== uid);
      if (nextAll.length !== allList.length) {
        this._categoryItems[cid] = nextAll;
        changed = true;
      }
    }

    if (!changed) return;
    this._persistAdminSoon();
    this.render();
  },

  confirmAdminAddCategory() {
    const nameInput = document.getElementById('takeout-admin-cat-name');
    const iconInput = document.getElementById('takeout-admin-cat-icon');
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

    this._navItems.push(cat);
    if (!this._categoryItems[id]) this._categoryItems[id] = [];

    this._currentCategory = id;
    this._persistAdminSoon();
    this.closeAdminCategoryModal();
    this.render();
  },

  confirmAdminAddItem() {
    const catSel = document.getElementById('takeout-admin-item-category');
    const nameInput = document.getElementById('takeout-admin-item-name');
    const priceInput = document.getElementById('takeout-admin-item-price');
    const iconInput = document.getElementById('takeout-admin-item-icon');
    const descInput = document.getElementById('takeout-admin-item-desc');

    const cid = String(catSel?.value || '').trim();
    const name = String(nameInput?.value || '').trim();
    const price = Number(priceInput?.value || 0);
    const icon = String(iconInput?.value || '').trim();
    const desc = String(descInput?.value || '').trim();
    const styleChoices = Array.isArray(this._adminItemStyleChoices) ? this._adminItemStyleChoices : [];

    if (!cid || !(cid in this._categoryItems)) {
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
      alert('请先填写商品图标（例如：🍗）');
      iconInput?.focus?.();
      return;
    }

    const item = {
      name,
      price,
      icon,
      desc,
      options: [],
      __customId: this._makeUserItemId(),
      __isUserAdded: true
    };

    // 用户自定义“款式”选项（最多 8 个）
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

    item.options = [optionId];

    if (!this._userCategoryItems[cid]) this._userCategoryItems[cid] = [];
    this._userCategoryItems[cid].push(item);

    if (!this._categoryItems[cid]) this._categoryItems[cid] = [];
    this._categoryItems[cid].push(item);

    this._currentCategory = cid;
    this._persistAdminSoon();
    this.closeAdminItemModal();
    this.render();
  },

  async _loadAdminPersisted() {
    try {
      const data = await Storage.kvGet(this.STORAGE_KEY_ADMIN);
      if (data && typeof data === 'object') {
        if (Array.isArray(data.userNavItems)) this._userNavItems = data.userNavItems;
        if (data.userCategoryItems && typeof data.userCategoryItems === 'object') this._userCategoryItems = data.userCategoryItems;
        if (data.userOptionDefs && typeof data.userOptionDefs === 'object') this._userOptionDefs = data.userOptionDefs;
      }
    } catch (e) {
      try {
        const data = Storage.get(this.STORAGE_KEY_ADMIN);
        if (data && typeof data === 'object') {
          if (Array.isArray(data.userNavItems)) this._userNavItems = data.userNavItems;
          if (data.userCategoryItems && typeof data.userCategoryItems === 'object') this._userCategoryItems = data.userCategoryItems;
          if (data.userOptionDefs && typeof data.userOptionDefs === 'object') this._userOptionDefs = data.userOptionDefs;
        }
      } catch (e2) {}
    }
  },

  _applyAdminDataToMemory() {
    this._normalizeUserCategoryItems();

    // 合并用户自定义 SKU 定义
    Object.entries(this._userOptionDefs || {}).forEach(([optionId, def]) => {
      if (!optionId || !def || typeof def !== 'object') return;
      this._optionDefs[optionId] = def;
    });

    // 合并分类到导航
    (this._userNavItems || []).forEach((cat) => {
      if (!cat || !cat.id) return;
      if (!this._navItems.some((x) => x && x.id === cat.id)) {
        this._navItems.push({ id: cat.id, icon: cat.icon || '🍽️', name: cat.name || '分类' });
      }
      if (!this._categoryItems[cat.id]) this._categoryItems[cat.id] = [];
    });

    // 合并用户新增商品到对应分类
    Object.entries(this._userCategoryItems || {}).forEach(([cid, items]) => {
      if (!cid) return;
      if (!Array.isArray(items) || !items.length) return;
      if (!this._categoryItems[cid]) this._categoryItems[cid] = [];
      this._categoryItems[cid].push(...items);
    });
  },

  _persistAdminSoon() {
    if (this._adminPersistTimer) clearTimeout(this._adminPersistTimer);
    this._adminPersistTimer = setTimeout(async () => {
      const payload = {
        userNavItems: this._userNavItems || [],
        userCategoryItems: this._userCategoryItems || {},
        userOptionDefs: this._userOptionDefs || {}
      };
      try {
        if (Storage && Storage.kvSet) {
          await Storage.kvSet(this.STORAGE_KEY_ADMIN, payload);
          return;
        }
      } catch (e) {}
      try {
        Storage.set(this.STORAGE_KEY_ADMIN, payload);
      } catch (e2) {}
    }, 140);
  },

  async _loadPersisted() {
    try {
      const cart = await Storage.kvGet(this.STORAGE_KEY_CART);
      const prefs = await Storage.kvGet(this.STORAGE_KEY_PREFS);
      const addr = await Storage.kvGet(this.STORAGE_KEY_ADDR);
      if (cart && typeof cart === 'object') this._cart = cart;
      if (prefs && typeof prefs === 'object') this._itemPrefs = prefs;
      if (typeof addr === 'string') this._addr = addr;
    } catch (e) {
      // fallback to localStorage
      try {
        const cart = Storage.get(this.STORAGE_KEY_CART);
        const prefs = Storage.get(this.STORAGE_KEY_PREFS);
        const addr = Storage.get(this.STORAGE_KEY_ADDR);
        if (cart && typeof cart === 'object') this._cart = cart;
        if (prefs && typeof prefs === 'object') this._itemPrefs = prefs;
        if (typeof addr === 'string') this._addr = addr;
      } catch (e2) {}
    }
  },

  _persistAddrSoon() {
    if (this._addrPersistTimer) clearTimeout(this._addrPersistTimer);
    this._addrPersistTimer = setTimeout(async () => {
      try {
        if (Storage && Storage.kvSet) {
          await Storage.kvSet(this.STORAGE_KEY_ADDR, this._addr);
          return;
        }
      } catch (e) {}
      try {
        Storage.set(this.STORAGE_KEY_ADDR, this._addr);
      } catch (e2) {}
    }, 120);
  },

  _persistSoon() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(async () => {
      try {
        if (Storage && Storage.kvSet) {
          await Storage.kvSet(this.STORAGE_KEY_CART, this._cart);
          await Storage.kvSet(this.STORAGE_KEY_PREFS, this._itemPrefs);
          return;
        }
      } catch (e) {}
      try {
        Storage.set(this.STORAGE_KEY_CART, this._cart);
        Storage.set(this.STORAGE_KEY_PREFS, this._itemPrefs);
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

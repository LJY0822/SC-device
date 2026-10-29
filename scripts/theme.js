// 主题管理
const Theme = {
  currentThemeStyle: null,
  
  // 初始化
  init() {
    // 创建主题style标签
    this.currentThemeStyle = document.createElement('style');
    this.currentThemeStyle.id = 'yd-theme-custom';
    document.head.appendChild(this.currentThemeStyle);
    
    // 加载当前主题
    const currentTheme = Storage.get(CONFIG.STORAGE_KEYS.CURRENT_THEME);
    if (currentTheme) {
      this.applyTheme(currentTheme);
    }
  },
  
  // 应用主题
  async applyTheme(themeId) {
    const theme = await Storage.dbGet('themes', themeId);
    if (theme && theme.css) {
      this.currentThemeStyle.textContent = theme.css;
      Storage.set(CONFIG.STORAGE_KEYS.CURRENT_THEME, themeId);
    }
  },
  
  // 应用CSS代码
  applyCss(css) {
    this.currentThemeStyle.textContent = css;
  },
  
  // 保存主题
  async saveTheme(name, css) {
    const theme = {
      id: State.generateId(),
      name: name,
      css: css,
      createdAt: Date.now()
    };
    await Storage.dbPut('themes', theme);
    return theme;
  },
  
  // 获取所有主题
  async getAllThemes() {
    return await Storage.dbGetAll('themes');
  },
  
  // 删除主题
  async deleteTheme(themeId) {
    await Storage.dbDelete('themes', themeId);
    // 如果删除的是当前主题，清空样式
    const currentTheme = Storage.get(CONFIG.STORAGE_KEYS.CURRENT_THEME);
    if (currentTheme === themeId) {
      this.currentThemeStyle.textContent = '';
      Storage.remove(CONFIG.STORAGE_KEYS.CURRENT_THEME);
    }
  }
};


// 全局配置
const CONFIG = {
  // IndexedDB配置
  DB_NAME: 'sc_personal_comms_v1',
  // 升级到 11：与部分设备上已存在的版本兼容（避免 VersionError）
  DB_VERSION: 11,
  // 图标配置版本（更新此版本号会重置为默认图标布局）
  ICON_CONFIG_VERSION: 4,
  // 时间感知：未写入本地前默认开启；仅当用户在系统设置里选择关闭时存为 off
  DEFAULT_TIME_AWARENESS: 'on',
  // 主屏幕 Dock 栏默认显示
  DEFAULT_HOMESCREEN_DOCK: 'hide',
  // 聊天多模态：是否在请求中附带 image_url；API 设置页「多模态自动识图」开关，默认开启
  DEFAULT_CHAT_AUTO_VISION: 'on',
  /** API 设置「流式请求」：on 时先拉流式片段并拼接，再走原有非流式处理；默认 off */
  DEFAULT_API_STREAM: 'off',
  /** chat/completions 请求超时（毫秒） */
  API_CHAT_TIMEOUT_MS: 301000,
  // API「上下文上限」：chat/completions 的 max_tokens；字符串 unlimited 表示不限制（请求体不传 max_tokens）
  // 旧版默认曾固定为 12000；已迁移为 unlimited，且不再提供 12k 选项（见 Settings.migrateLegacyApiMaxTokensFrom12000）
  DEFAULT_API_MAX_TOKENS: 'unlimited',
  // API 温度参数（用于 chat/completions 的 temperature）
  DEFAULT_API_TEMPERATURE: 0.8,
  /** API 设置「记忆轮数」默认值（与 chat_rounds 存储一致） */
  DEFAULT_CHAT_ROUNDS: 200,
  /** 生图设置里新建配置时的默认模型占位（与 OpenAI images 文档常见值对齐） */
  DEFAULT_IMAGE_GEN_MODEL: 'dall-e-3',
  /** 朋友圈：AI 生成带「配图：」时是否先文生图再展示（off=仅展示配图描述） */
  DEFAULT_IMAGE_GEN_AUTO_MOMENTS: 'on',
  /** 朋友圈生图制作页：垫图（参考图）最多张数，与 images/edits 请求截断一致 */
  MOMENTS_IMAGE_STUDIO_REF_MAX: 10,
  // 跨会话记忆：默认开启（不建记忆池，实时按角色关联检索）
  DEFAULT_CROSS_SESSION_MEMORY_ENABLED: 'on',
  // 群聊匹配策略：默认允许“任一成员命中”
  DEFAULT_CROSS_SESSION_MEMORY_INCLUDE_PARTIAL_GROUP: 'on',
  // 跨会话记忆注入预算（避免 token 过大）
  DEFAULT_CROSS_SESSION_MEMORY_MAX_MESSAGES: 220,
  DEFAULT_CROSS_SESSION_MEMORY_MAX_CHARS: 28000,

  // 默认图标
  DEFAULT_ICONS: [
    { 
      id: 'chat', 
      label: '聊天', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
      page: 'page-chat-list' 
    },
    {
      id: 'moments',
      label: '朋友圈',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M7 2h10a2 2 0 0 1 2 2v18l-7-4-7 4V4a2 2 0 0 1 2-2z"/><path d="M8 7h8M8 11h8M8 15h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".65"/></svg>',
      page: 'page-moments'
    },
    {
      id: 'mis-records',
      label: '生图记录',
      type: 'svg',
      svg:
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">' +
        '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
        '<text x="12" y="12.35" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,-apple-system,\'Segoe UI\',sans-serif" font-size="9.5" font-weight="800" letter-spacing="-0.02em" fill="currentColor" stroke="none">AI</text>' +
        '</svg>',
      page: 'page-mis-records'
    },
    {
      id: 'forum',
      label: '论坛',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path fill="currentColor" d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path fill="none" d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
      page: 'page-forum'
    },
    {
      id: 'live',
      label: '直播',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M17 10.5l5-3v9l-5-3v-3z"/><circle cx="7.5" cy="12" r="1.2" fill="currentColor"/><circle cx="11" cy="12" r="1.2" fill="currentColor"/></svg>',
      page: 'page-live'
    },
    {
      id: 'share',
      label: '晒图',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="4" ry="4"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.6" cy="7.4" r="1.1" fill="currentColor"/></svg>',
      page: 'page-share'
    },
    {
      id: 'shop',
      label: '购物',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M6 7h15l-1.5 12H7.5L6 7z"/><path d="M6 7 5 3H2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 10h8M9 13h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".7"/><circle cx="9" cy="21" r="1.4" fill="currentColor"/><circle cx="18" cy="21" r="1.4" fill="currentColor"/></svg>',
      page: 'page-shop'
    },
    {
      id: 'wallet',
      label: '我的钱包',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V8H6a3 3 0 0 0 0 6h15v2.5A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9z"/><path d="M21 10H6a1 1 0 0 0 0 2h15v-2z"/><circle cx="18" cy="11" r="0.9" fill="currentColor"/></svg>',
      page: 'page-wallet'
    },
    {
      id: 'timer',
      label: '定时',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 13V9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 13l3.2 2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="13" r="1" fill="currentColor"/><path d="M9 3h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".72"/></svg>',
      page: 'page-timer'
    },
    {
      id: 'calendar',
      label: '日历',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>',
      page: 'page-calendar'
    },
    { 
      id: 'settings', 
      label: '设置', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
      page: 'page-settings' 
    },
    { 
      id: 'beautify', 
      label: '美化小助手', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>',
      page: 'page-beautify' 
    },
    { 
      id: 'album', 
      label: '相册', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
      page: 'page-album' 
    },
    { 
      id: 'camera', 
      label: '相机', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M20 5h-3.2l-1.2-1.5A2 2 0 0 0 14 3H10a2 2 0 0 0-1.6.8L7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-8 13a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.2a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z"/></svg>',
      page: 'page-camera' 
    },
    { 
      id: 'mask', 
      label: '我的面具', 
      type: 'svg',
      svg: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path fill="currentColor" d="M918.912 389.802667l-36.096 140.672c-18.346667 71.509333-55.722667 121.813333-99.669333 157.226666 9.344-48.810667 9.130667-103.168-6.144-162.730666l-36.864-143.786667-6.4-24.917333a37.888 37.888 0 0 1 25.557333-1.877334c16.128 4.309333 25.941333 17.322667 27.178667 29.952a32 32 0 1 0 63.701333-6.186666c-3.882667-40.192-33.408-74.624-74.325333-85.589334a102.485333 102.485333 0 0 0-60.501334 2.133334l-0.725333-1.877334c-9.557333-25.429333-23.552-52.437333-49.962667-72.234666a147.114667 147.114667 0 0 0-48.213333-23.978667c-32.384-9.173333-62.421333-3.242667-88.064 5.290667-23.808 7.893333-51.626667 20.906667-82.090667 35.2l-3.072 1.450666c-50.56 23.68-70.784 32.981333-91.477333 39.594667-6.272 1.962667-12.629333 3.797333-19.029333 5.418667l13.952-54.058667c18.773333-73.344 28.202667-109.994667 52.736-128.426667 8.234667-6.186667 17.493333-10.752 27.221333-13.525333 29.184-8.277333 62.336 7.253333 128.64 38.272 49.066667 23.04 73.642667 34.517333 99.242667 42.666667 8.96 2.773333 17.92 5.333333 26.965333 7.509333 26.112 6.357333 52.864 9.216 106.368 14.976 72.277333 7.765333 108.373333 11.648 129.706667 34.048 7.125333 7.552 12.928 16.341333 17.066666 25.984 12.458667 28.8 3.072 65.450667-15.701333 138.794667z"/><path fill="currentColor" d="M715.008 540.885333l-36.053333-140.714666c-18.773333-73.344-28.16-109.994667-52.736-128.426667a83.114667 83.114667 0 0 0-27.221334-13.525333c-29.184-8.277333-62.293333 7.253333-128.64 38.272-49.066667 23.04-73.642667 34.517333-99.242666 42.666666a408.32 408.32 0 0 1-26.965334 7.509334c-26.069333 6.357333-52.821333 9.216-106.368 14.976-72.277333 7.765333-108.373333 11.648-129.706666 34.048a88.704 88.704 0 0 0-17.066667 25.984c-12.458667 28.8-3.072 65.450667 15.744 138.794666l36.053333 140.672c42.368 165.376 183.296 217.429333 278.016 233.514667 28.885333 4.906667 43.349333 7.338667 87.210667-4.949333s55.210667-21.930667 77.866667-41.301334c74.325333-63.445333 171.52-182.186667 129.109333-347.52z m-458.794667 29.482667a32 32 0 1 1-63.701333-6.186667c3.925333-40.192 33.450667-74.666667 74.368-85.589333 40.917333-10.965333 83.669333 4.096 107.178667 36.949333a32 32 0 1 1-52.053334 37.205334c-7.424-10.325333-22.4-16.64-38.570666-12.373334-16.170667 4.352-25.984 17.365333-27.221334 29.994667z m247.296-66.261333a32 32 0 0 1-63.701333-6.186667c3.925333-40.234667 33.450667-74.666667 74.368-85.589333 40.917333-10.965333 83.669333 4.053333 107.178667 36.949333a32 32 0 1 1-52.053334 37.205333c-7.424-10.325333-22.4-16.64-38.570666-12.373333-16.170667 4.352-26.026667 17.365333-27.221334 29.994667z m78.762667 162.730666a32 32 0 0 1-37.76 51.669334l-0.426667-0.256a88.32 88.32 0 0 0-20.693333-8.533334c-15.36-4.181333-39.637333-6.954667-71.893333 1.706667-32.256 8.618667-51.882667 23.168-63.146667 34.474667a88.021333 88.021333 0 0 0-13.653333 17.749333l-0.213334 0.426667a32 32 0 0 1-58.538666-25.898667l29.354666 12.714667c-29.354667-12.714667-29.312-12.8-29.312-12.8v-0.042667l0.085334-0.170667 0.170666-0.384 0.426667-0.938666 1.408-2.730667c1.152-2.176 2.730667-5.034667 4.906667-8.362667 4.266667-6.656 10.752-15.36 19.968-24.661333 18.645333-18.773333 48-39.424 91.989333-51.2 43.989333-11.818667 79.786667-8.533333 105.258667-1.621333 12.629333 3.413333 22.613333 7.68 29.610666 11.349333a112.896 112.896 0 0 1 11.008 6.442667l0.853334 0.64 0.341333 0.213333 0.128 0.128h0.085333l0.042667 0.085333z"/></svg>',
      page: 'page-mask' 
    },
    // 第二行
    { 
      id: 'music', 
      label: '音乐', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
      page: 'page-music' 
    },
    { 
      id: 'note', 
      label: '笔记', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
      page: 'page-notebook' 
    },
    {
      id: 'worldbook',
      label: '世界书',
      type: 'svg',
      svg: '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path fill="currentColor" d="M512 0C229.2 0 0 229.2 0 512s229.2 512 512 512 512-229.2 512-512S794.8 0 512 0zM337.6 924.8c-53.3-22.6-101.3-54.9-142.4-96-41.2-41.2-73.5-89.1-96-142.4C75.8 631.2 64 572.5 64 512c0-29 2.7-57.6 8.1-85.5 6.5 2.5 13.8 3.9 20.9 3.9 9.7 0 19.3-2.4 27.1-7.6 8-5.3 17.3-8.1 26.5-8.1 7.9 0 15.8 2.1 22.8 6.4 8.1 5 13.8 11.6 13.8 22.8 0 81.6 2.8 168.7 76.9 169.9 2.2 0 41.2 14.9 59.8 63.3 2.2 5.6 6.4 7.4 12.2 7.4 11.5 0 29-7.4 47.6-7.4 13.9 0 0 23.6 0 74.5C379.8 802 489 880.1 489 880.1c-0.6 32 0.9 58.5 3.3 79.4-53.5-2.2-105.5-13.9-154.7-34.7zm491.2-96c-41.2 41.2-89.1 73.5-142.4 96-24.4 10.3-49.4 18.4-75 24.1-1.5-0.3-3.2-0.4-5-0.4-3.5 0-7.5 0.5-12 1.7 15.5-65.5 22.9-102.4 54.9-130.2 44-38.2 9.7-80.4-24-80.4-1.9 0-3.9 0.1-5.8 0.4-1.5 0.2-2.8 0.3-4 0.3-22.2 0-7.5-34.9-31.1-36.9-24.8-2.1-57.3-51.4-93.4-68.5-19-9-37.5-33.2-67-34.5h-1.7c-18.6 0-42.3 11.1-54.4 11.1-4.8 0-7.8-1.8-7.8-6.7 0-57.1-5.9-97.7-6.8-113.8-0.4-5.5-2-7.1-1.1-7.1 1.2 0 7.2 3.2 27.8 3.7h0.5c18.6 0 9.7-38.5 28.1-40 0.8-0.1 1.6-0.1 2.4-0.1 16.4 0 47.5 11.8 63.8 11.8 3.4 0 6.1-0.5 7.9-1.7 0.2-0.1 0.4-0.2 0.7-0.2 8.8 0 43.4 86.3 62.8 86.3 8 0 13.4-14.7 13.4-56 0-17.1-9-46.9 0-63.3 35.1-64.2 67.9-116.7 65.1-124.1-0.9-2.3-11.3-4.4-25-4.4-11.7 0-25.7 1.5-38.3 5.6-9.4 3.1 2.8 17.7-10.2 20.8-8.7 2-17.2 2.9-25.2 2.9-38.2 0-65.8-20.3-53.3-39.8 15.9-23.9 72.8-10.6 77.9-58.6 2.3-22.2 4.3-47.2 5.8-68.5 0.5-7.7 6.7-13.7 14.4-14.2 37.2-2.7 41-47 6.2-75.3 37.5 5.4 74.1 15.6 109.2 30.5 53.3 22.6 101.3 54.9 142.4 96 37.4 37.4 67.4 80.3 89.6 127.8-5.7-3.5-11.6-5.2-17.4-5.2-28.3 0-54.2 38.4-38 82-133 102-98.9 173.4-55.5 214 12.8 12 25.4 27.4 36.4 42.7 10.6 14.6 17.2 31.5 21 49.2 1.4 6.4 6.4 9.6 13.7 9.6 11 0 27-7.3 43.1-21.7-22.2 50.3-53.4 95.8-92.7 135.1z"/></svg>',
      page: 'page-worldbook'
    },
    {
      id: 'regex',
      label: '正则',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path></g></svg>',
      page: 'page-global-regex'
    },
    {
      id: 'ta-phone',
      label: '查手机',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.8" width="11" height="18.4" rx="2.3" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="10.05" y="4.3" width="3.9" height="0.85" rx="0.42" fill="none" stroke="currentColor" stroke-width="1.05" opacity=".72"/><circle cx="12" cy="18.1" r="1.05" fill="currentColor" opacity=".85"/></svg>',
      page: 'page-ta-phone'
    },
    {
      id: 'ta-experience',
      label: '查日程',
      type: 'svg',
      svg: '<svg viewBox="0 0 1391 1024" aria-hidden="true"><path fill="currentColor" d="M1359.819487 306.333538c-21.293949-78.821744-115.580718-130.363077-246.311384-151.578256 18.248205 24.234667 36.49641 48.49559 51.672615 75.776 72.992821 21.215179 121.645949 54.560821 133.802667 93.997949 6.091487 24.234667 0 51.515077-18.248206 81.841231-18.248205 33.345641-54.718359 69.710769-103.371487 109.121641v-6.038975C1177.337436 242.661744 958.411487 24.392205 690.806154 24.392205 429.318564 21.346462 210.392615 239.642256 210.392615 506.407385c0 81.867487 21.293949 160.689231 57.764103 227.380512-97.28-18.195692-161.13559-57.606564-176.338051-103.082666-6.091487-24.260923 0-51.541333 18.248205-81.841231 9.110974-18.195692 24.313436-36.391385 39.515897-54.587077 0-30.299897 3.045744-63.645538 9.137231-90.952205-97.306256 78.821744-149.005128 166.728205-127.711179 242.530461 24.313436 84.886974 130.756923 139.474051 279.735794 157.643488 91.214769 115.213128 228.063179 187.969641 386.179282 187.969641 237.174154 0 437.851897-172.793436 477.394052-397.154462 136.822154-90.925949 212.834462-197.054359 185.475282-287.980308zM696.897641 930.842256c-115.528205 0-221.971692-45.476103-298.010256-121.278359h30.431179c106.417231 0 225.017436-15.149949 346.637128-45.476102 121.619692-30.299897 231.082667-75.776 322.323693-124.297846-51.725128 169.773949-212.860718 291.052308-401.381744 291.052307zM1119.573333 557.948718c-88.169026 54.560821-209.788718 109.147897-355.774359 145.513026-112.482462 30.326154-228.036923 45.476103-331.434666 45.476102-30.404923 0-57.764103-3.019487-85.123282-3.019487-48.653128-69.737026-76.012308-151.604513-76.012308-239.510974 0-233.419487 191.566769-424.408615 425.695179-424.408616 234.12841 0 425.695179 190.989128 425.69518 424.408616 0 18.195692 0 33.345641-3.045744 51.541333z"/></svg>',
      page: 'page-ta-experience'
    },
    {
      id: 'ta-diary',
      label: '查日记',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M7 3.2h8.4A2.4 2.4 0 0 1 17.8 5.6v14.2A1.2 1.2 0 0 1 16.6 21H7A2.8 2.8 0 0 1 4.2 18.2V6A2.8 2.8 0 0 1 7 3.2zm-.2 2A1.6 1.6 0 0 0 5.2 6.8v10.8A1.4 1.4 0 0 0 6.6 19h9.2V5.6a.4.4 0 0 0-.4-.4H6.8z"/><path d="M8.2 8.1h5.8M8.2 11.2H14M8.2 14.3h4.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      page: 'page-ta-diary'
    },
    {
      id: 'session-beautify',
      label: '会话美化',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M4 6.5h13a2.5 2.5 0 1 1 0 5H4a2.5 2.5 0 0 1 0-5zm0 6h16a2.5 2.5 0 1 1 0 5H4a2.5 2.5 0 0 1 0-5z"/><circle cx="9" cy="9" r="1.6" fill="currentColor"/><circle cx="15" cy="15" r="1.6" fill="currentColor"/></svg>',
      page: 'page-session-beautify'
    },
    { 
      id: 'bubble', 
      label: '气泡美化', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 012 2v7a2 2 0 01-2 2h-5l-4 3-1-3H4a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>',
      page: 'page-bubble-settings' 
    },
    // 第三行
    {
      id: 'widgets',
      label: '组件',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/></svg>',
      page: 'page-widgets'
    },
    { 
      id: 'character', 
      label: '角色', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M12 12c2.76 0 5-2.24 5-5S14.76 2 12 2 7 4.24 7 7s2.24 5 5 5zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z"/></svg>',
      page: 'page-character' 
    },
    {
      id: 'takeout',
      label: '外卖',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3-9H9V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2z"/></svg>',
      page: 'page-takeout'
    },
    // 第四行
    { 
      id: 'weather', 
      label: '天气', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4h11c2.76 0 5-2.24 5-5 0-2.44-1.76-4.47-4.08-4.91C17.44 8.64 15.06 7 12.3 7c-3.05 0-5.65 2.01-6.47 4.79-.27-.05-.55-.08-.83-.08z"/><path d="M6.5 2.5a1 1 0 011 1V5a1 1 0 11-2 0V3.5a1 1 0 011-1zm7 0a1 1 0 011 1V5a1 1 0 11-2 0V3.5a1 1 0 011-1z" opacity=".25"/></svg>',
      page: 'page-weather' 
    },
    { 
      id: 'map', 
      label: '地图', 
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24"><path d="M15 5l-6-2-6 2v16l6-2 6 2 6-2V3l-6 2zm-6 14l-4 1.33V6.67L9 5.33V19zm6 0l-4-1.33V4.67l4 1.33V19zm4-1.33L15 19V6l4-1.33v13.0z"/></svg>',
      page: 'page-map' 
    },
    {
      id: 'card-assistant',
      label: '制卡助手',
      type: 'svg',
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3.5 8.2A2.2 2.2 0 0 1 5.7 6h12.6a2.2 2.2 0 0 1 2.2 2.2v7.6a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V8.2Z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M3.5 10h17"/><path d="M19.6 3.5l.9 1.9 2.1.9-2.1.9-.9 2-.9-2-2.1-.9 2.1-.9.9-1.9Z" fill="currentColor" opacity=".75"/></svg>',
      page: 'page-card-assistant'
    },

    // 移除未实现/占位/测试图标（video/calendar/book/mail/clock/test-* 以及一组 emoji）
  ],
  
  // 网格配置
  GRID_COLS: 4,
  
  // 存储键名
  STORAGE_KEYS: {
    API_KEY: 'api_key',
    BASE_URL: 'base_url',
    /** 多模态自动识图：on | off，与 API 设置页开关一致 */
    CHAT_AUTO_VISION: 'chat_auto_vision',
    /** 流式请求：on | off，与 API 设置页开关一致 */
    API_STREAM: 'api_stream',
    API_MODEL: 'api_model',
    /** 以下为「生图设置」独立存储（与聊天 API 分离） */
    IMAGE_GEN_BASE_URL: 'image_gen_base_url',
    IMAGE_GEN_API_KEY: 'image_gen_api_key',
    IMAGE_GEN_MODEL: 'image_gen_model',
    /** on | off：开启后 AI 朋友圈动态会先按配图描述生图，完成后再写入并显示 */
    IMAGE_GEN_AUTO_MOMENTS: 'image_gen_auto_moments',
    IMAGE_GEN_CONFIG_PRESETS: 'image_gen_config_presets',
    CURRENT_IMAGE_GEN_CONFIG: 'current_image_gen_config',
    IMAGE_GEN_DEFAULT_CONFIG: 'image_gen_default_config',
    CHAT_ROUNDS: 'chat_rounds',
    API_MAX_TOKENS: 'api_max_tokens',
    API_TEMPERATURE: 'api_temperature',
    API_CONFIG_PRESETS: 'api_config_presets',
    CURRENT_API_CONFIG: 'current_api_config',
    API_DEFAULT_CONFIG: 'api_default_config',
    WALLPAPER: 'wallpaper',
    // 查日记背景（与主屏壁纸独立）
    TA_DIARY_BACKGROUND: 'ta_diary_background',
    /** 查日记：用户在设置里填写的补充说明，拼接到生成请求的 user 消息末尾 */
    TA_DIARY_USER_OUTPUT_SUPPLEMENT: 'ta_diary_user_output_supplement_v1',
    ICON_ORDER: 'icon_order',
    CURRENT_THEME: 'current_theme',
    CURRENT_SESSION: 'current_session_id',
    ICON_STYLES: 'icon_styles',
    WIDGET_LAYOUT: 'widget_layout',
    WIDGET_HTML: 'widget_html',
    /** 主屏幕隐藏的内置组件 id → true（如 widget-note） */
    WIDGET_HIDE_FROM_HOMESCREEN: 'widget_hide_from_homescreen',
    WIDGET_TIME_DATE_STYLE: 'widget_time_date_style',
    // 播放器组件样式（目前主要用于预设封面图片等）
    WIDGET_PLAYER_STYLE: 'widget_player_style',
    // 便笺组件样式（拍立得照片）
    WIDGET_NOTE_STYLE: 'widget_note_style',
    BEAUTIFY_PRESETS: 'beautify_presets',
      CURRENT_BEAUTIFY_PRESET: 'current_beautify_preset',
      ICON_LAYOUT: 'icon_layout',  // 图标固定位置布局
      BUBBLE_THEME: 'bubble_theme',            // 聊天气泡当前主题
      BUBBLE_PRESETS: 'bubble_presets',        // 聊天气泡预设集合
    CURRENT_BUBBLE_PRESET: 'current_bubble_preset', // 当前选中的气泡预设（空字符串表示默认）
    CHAT_AVATAR_SIZE: 'chat_avatar_size',
    CHAT_FONT_SIZE: 'chat_font_size',
    CHAT_QUOTE_BEAUTIFY_ENABLED: 'chat_quote_beautify_enabled',
    CHAT_QUOTE_BEAUTIFY_CSS: 'chat_quote_beautify_css',
    CHAT_QUOTE_BEAUTIFY_TEXT_COLOR: 'chat_quote_beautify_text_color',
    /** 全局回复风格（JSON，所有会话聊天框共用） */
    CHAT_REPLY_STYLE: 'chat_reply_style_global',
    CHAT_UNREAD_BADGE_ENABLED: 'chat_unread_badge_enabled',
    // 聊天两段式发送引导：选择“不再提示”后关闭
    CHAT_PSEUDO_SEND_GUIDE_DISMISSED: 'chat_pseudo_send_guide_dismissed',
    // 相册选图：粘贴链接仅保存 URL 时的提醒，选择「不再提示此类提醒」后为 1
    CHAT_ALBUM_LINK_ONLY_HINT_DISMISSED: 'chat_album_link_only_hint_dismissed',
    SUGGESTED_REPLY_ENABLED_GLOBAL: 'suggested_reply_enabled_global',
    DEFAULT_MASK_ID: 'default_mask_id',     // 默认面具（可选）
    WEATHER_7DAY: 'weather_7day',           // 7天天气（本地模拟）

    // 语音合成（MiniMax T2A）
    VOICE_API_KEY: 'voice_api_key',
    VOICE_MODEL: 'voice_model',
    VOICE_MOOD_TAGS_ENABLED: 'voice_mood_tags_enabled',
    VOICE_TYPE: 'voice_type',
    VOICE_ID: 'voice_id',
    VOICE_SPEED: 'voice_speed',
    VOICE_VOL: 'voice_vol',
    VOICE_PITCH: 'voice_pitch',
    VOICE_EMOTION: 'voice_emotion',
    VOICE_AUDIO_FORMAT: 'voice_audio_format',
    VOICE_SAMPLE_RATE: 'voice_sample_rate',
    VOICE_BITRATE: 'voice_bitrate'
    ,
    // 通知模式：in_app | system | off
    NOTIFY_MODE: 'notify_mode',
    // 时间感知：on | off
    TIME_AWARENESS: 'time_awareness',
    // 主屏幕 dock 栏：show | hide
    HOMESCREEN_DOCK: 'homescreen_dock',
    // 跨会话记忆互通（隐藏配置，先走代码开关）
    CROSS_SESSION_MEMORY_ENABLED: 'cross_session_memory_enabled',
    CROSS_SESSION_MEMORY_MAX_MESSAGES: 'cross_session_memory_max_messages',
    CROSS_SESSION_MEMORY_MAX_CHARS: 'cross_session_memory_max_chars',
    CROSS_SESSION_MEMORY_INCLUDE_PARTIAL_GROUP: 'cross_session_memory_include_partial_group',
    // 新增：2×2 相片卡片组件样式（背景模糊/透明 + 单张照片 + 左/右文字）
    PHOTO_CARD_STYLE: 'widget_photo_card_style',
    // 新增：2×2 相片圆卡组件样式（圆形图片 + 两行文字）
    PHOTO_CIRCLE_STYLE: 'widget_photo_circle_style',
    // 新增：2×2 日期卡组件样式（背景图 + 日期角标 + 模糊/透明）
    DATE_CARD_STYLE: 'widget_date_card_style',

    // 世界书：真正的全局世界书条目（不应聚合角色的 character_book）
    WORLDBOOK_GLOBAL_ENTRIES: 'worldbook_global_entries',

    // 全局正则规则（聊天渲染前顺序应用）
    GLOBAL_REGEX_RULES: 'global_regex_rules'
  }
};

/**
 * 读取 API 设置「记忆轮数」chat_rounds：未写入时使用 CONFIG.DEFAULT_CHAT_ROUNDS。
 * 由聊天打包历史、Ta 上下文、会话记忆页等共用，避免各处硬编码不一致。
 */
function resolveStoredChatRoundsNum() {
  const def = Math.max(
    1,
    Math.floor(Number(typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_CHAT_ROUNDS)) || 200
  );
  const key =
    typeof CONFIG !== 'undefined' &&
    CONFIG.STORAGE_KEYS &&
    CONFIG.STORAGE_KEYS.CHAT_ROUNDS
      ? CONFIG.STORAGE_KEYS.CHAT_ROUNDS
      : 'chat_rounds';
  const raw = typeof Storage !== 'undefined' && Storage.get ? Storage.get(key) : null;
  const parsed = parseInt(raw != null && raw !== '' ? String(raw).trim() : String(def), 10);
  return Math.max(1, parsed || def);
}


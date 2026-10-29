// 存储管理
const Storage = {
  db: null,

  /** 内存中的图标美化配置（大体积 imageData 不进入 localStorage，避免 QuotaExceededError） */
  _iconStylesCache: undefined,

  /** IndexedDB kv 中使用的键，与 CONFIG.STORAGE_KEYS.ICON_STYLES 值一致 */
  _ICON_STYLES_KV_KEY: 'icon_styles',

  /** localStorage 仅占位，表示真实数据在 IDB kv */
  _ICON_STYLES_LS_SENTINEL: { __yd_icon_styles_kv: 1 },

  /**
   * 从 IndexedDB kv 加载 icon_styles；老数据从 localStorage 迁入 kv（写入在后台，不阻塞启动）。
   */
  async hydrateIconStylesCache() {
    if (!this.db) {
      this._iconStylesCache = {};
      return;
    }

    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.ICON_STYLES);
    if (!raw) {
      this._iconStylesCache = {};
      return;
    }

    if (raw.indexOf('__yd_icon_styles_kv') !== -1) {
      try {
        const fromKv = await this.kvGet(this._ICON_STYLES_KV_KEY);
        this._iconStylesCache =
          fromKv && typeof fromKv === 'object' ? fromKv : {};
      } catch (e) {
        this._iconStylesCache = {};
      }
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      this._iconStylesCache = {};
      return;
    }
    if (parsed && typeof parsed === 'object' && parsed.__yd_icon_styles_kv === 1) {
      this._iconStylesCache = {};
      return;
    }
    this._iconStylesCache = parsed && typeof parsed === 'object' ? parsed : {};
    const cacheCopy = this._iconStylesCache;
    void this.kvSet(this._ICON_STYLES_KV_KEY, cacheCopy)
      .then(() => {
        try {
          localStorage.setItem(
            CONFIG.STORAGE_KEYS.ICON_STYLES,
            JSON.stringify(this._ICON_STYLES_LS_SENTINEL)
          );
        } catch (e) {}
      })
      .catch((e) => console.warn('[Storage] icon_styles 迁移到 IndexedDB 失败', e));
  },
  
  // 初始化IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        // 会话表
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('createdAt', 'createdAt');
        }
        
        // 消息表
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('sessionId', 'sessionId');
          messageStore.createIndex('createdAt', 'createdAt');
        }
        
        // 主题表
        if (!db.objectStoreNames.contains('themes')) {
          db.createObjectStore('themes', { keyPath: 'id' });
        }
        
        // 相册表
        if (!db.objectStoreNames.contains('album')) {
          db.createObjectStore('album', { keyPath: 'id' });
        }
        
        // 面具表（我的面具）
        if (!db.objectStoreNames.contains('masks')) {
          const maskStore = db.createObjectStore('masks', { keyPath: 'id' });
          maskStore.createIndex('createdAt', 'createdAt');
        }
        
        // 音乐表（我的音乐）
        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('createdAt', 'createdAt');
          trackStore.createIndex('title', 'title');
        }

        // 笔记表（笔记本）
        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('updatedAt', 'updatedAt');
          noteStore.createIndex('createdAt', 'createdAt');
        }
        
        // Widget 资源表：用于存储各组件的图片/文本等内容
        if (!db.objectStoreNames.contains('widgetResources')) {
          const widgetStore = db.createObjectStore('widgetResources', { keyPath: 'id' });
          widgetStore.createIndex('widgetId', 'widgetId');
        }
        
        // 角色表
        if (!db.objectStoreNames.contains('characters')) {
          const characterStore = db.createObjectStore('characters', { keyPath: 'id' });
          characterStore.createIndex('createdAt', 'createdAt');
        }

        // 通用 KV 表：用于持久化少量配置（替代不稳定的 localStorage 场景）
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }

        // 朋友圈表
        if (!db.objectStoreNames.contains('moments')) {
          const momentsStore = db.createObjectStore('moments', { keyPath: 'id' });
          momentsStore.createIndex('createdAt', 'createdAt');
        }

        // 论坛帖子表
        if (!db.objectStoreNames.contains('threads')) {
          const threadStore = db.createObjectStore('threads', { keyPath: 'id' });
          threadStore.createIndex('createdAt', 'createdAt');
        }

        // 字体缓存表：存储 woff2 Blob，keyPath: id（如 Baloo2-700）
        if (!db.objectStoreNames.contains('fontCache')) {
          db.createObjectStore('fontCache', { keyPath: 'id' });
        }
      };
    });
  },
  
  // localStorage操作
  set(key, value) {
    if (key === CONFIG.STORAGE_KEYS.ICON_STYLES) {
      try {
        this._iconStylesCache =
          value && typeof value === 'object'
            ? JSON.parse(JSON.stringify(value))
            : {};
      } catch (e) {
        this._iconStylesCache = {};
      }
      if (this.db) {
        this.kvSet(this._ICON_STYLES_KV_KEY, this._iconStylesCache).catch((e) => {
          console.warn('[Storage] icon_styles 写入 IndexedDB 失败', e);
        });
      }
      try {
        localStorage.setItem(
          key,
          JSON.stringify(this._ICON_STYLES_LS_SENTINEL)
        );
      } catch (e) {
        console.warn('[Storage] icon_styles 占位写入 localStorage 失败', e);
      }
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  },

  get(key) {
    if (key === CONFIG.STORAGE_KEYS.ICON_STYLES) {
      if (this._iconStylesCache !== undefined) {
        try {
          return JSON.parse(JSON.stringify(this._iconStylesCache));
        } catch (e) {
          return { ...this._iconStylesCache };
        }
      }
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.__yd_icon_styles_kv === 1) {
          return {};
        }
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (e) {
        return {};
      }
    }
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  },

  remove(key) {
    if (key === CONFIG.STORAGE_KEYS.ICON_STYLES) {
      this._iconStylesCache = {};
      if (this.db) {
        this.kvRemove(this._ICON_STYLES_KV_KEY).catch(() => {});
      }
      localStorage.removeItem(key);
      return;
    }
    localStorage.removeItem(key);
  },

  // IndexedDB：KV 操作（key/value）
  async kvSet(key, value) {
    return await this.dbPut('kv', { key, value });
  },

  async kvGet(key) {
    const row = await this.dbGet('kv', key);
    return row ? row.value : null;
  },

  async kvRemove(key) {
    return await this.dbDelete('kv', key);
  },

  // ========= 回收站（七天冷静期备份） =========
  // 说明：回收站数据存 IndexedDB.kv，避免改动 DB schema（只用现有 kv objectStore）。
  _RECYCLE_BIN_ITEM_KEY_PREFIX: 'recycle_bin_item_v1_',

  async recycleBinAddBackup({ kind, sessionId, sessionSnapshot, messagesSnapshot, days = 7 } = {}) {
    if (!this.db) throw new Error('IndexedDB 未初始化');

    const createdAt = Date.now();
    const dd = Number(days);
    const useDays = Number.isFinite(dd) && dd > 0 ? dd : 7;
    const deleteAt = createdAt + useDays * 24 * 60 * 60 * 1000;

    const id = 'rb_' + createdAt.toString(36) + '_' + Math.random().toString(36).slice(2);
    const key = this._RECYCLE_BIN_ITEM_KEY_PREFIX + id;

    const payload = {
      id,
      kind: String(kind || '').trim(),
      sessionId: sessionId != null ? String(sessionId) : '',
      createdAt,
      deleteAt,
      // full snapshot：用于“七天冷静期后才真正删除”
      sessionSnapshot: sessionSnapshot && typeof sessionSnapshot === 'object' ? sessionSnapshot : null,
      messagesSnapshot: Array.isArray(messagesSnapshot) ? messagesSnapshot : [],
      // 保存 kv 的实际 key，后续用于恢复/删除
      _kvKey: key
    };

    await this.kvSet(key, payload);
    return id;
  },

  async recycleBinList() {
    if (!this.db) return [];
    const all = await this.dbGetAll('kv');
    const prefix = this._RECYCLE_BIN_ITEM_KEY_PREFIX;
    const items = [];
    for (const row of all || []) {
      const k = row && typeof row.key === 'string' ? row.key : '';
      if (!k.startsWith(prefix)) continue;
      const v = row.value;
      if (v && typeof v === 'object') {
        // 保留 kv key，用于后续恢复/清空
        items.push({ ...v, _kvKey: k });
      }
    }
    items.sort((a, b) => Number(a?.deleteAt || 0) - Number(b?.deleteAt || 0));
    return items;
  },

  async recycleBinClearAll() {
    if (!this.db) return 0;
    const all = await this.dbGetAll('kv');
    const prefix = this._RECYCLE_BIN_ITEM_KEY_PREFIX;
    const expiredKeys = [];
    for (const row of all || []) {
      const k = row && typeof row.key === 'string' ? row.key : '';
      if (!k.startsWith(prefix)) continue;
      expiredKeys.push(k);
    }
    for (const key of expiredKeys) {
      try { await this.kvRemove(key); } catch (e) {}
    }
    return expiredKeys.length;
  },

  async recycleBinRestoreItem(item) {
    if (!item || typeof item !== 'object') return false;
    const sid = String(item?.sessionId || item?.sessionSnapshot?.id || '').trim();
    if (!sid) return false;

    const sessionSnapshot = item.sessionSnapshot && typeof item.sessionSnapshot === 'object'
      ? item.sessionSnapshot
      : null;
    const messagesSnapshot = Array.isArray(item.messagesSnapshot) ? item.messagesSnapshot : [];

    // 1) 恢复 session
    if (sessionSnapshot) {
      const nextSess = { ...sessionSnapshot, id: String(sessionSnapshot?.id || sid) };
      try {
        await this.dbPut('sessions', nextSess);
      } catch (e) {
        // 继续尝试恢复消息
        console.error('[recycle-bin] 恢复 sessions 失败:', e);
      }
    } else {
      // 没有 sessionSnapshot 时至少保底写一条 sessions 记录（避免恢复消息但列表不显示）
      try {
        await this.dbPut('sessions', { id: sid, title: '恢复的会话', createdAt: Date.now(), updatedAt: Date.now() });
      } catch (e2) {}
    }

    // 2) 先清理该 session 下现有 messages，避免重复/冲突
    try {
      const allMsgs = await this.dbGetAll('messages');
      for (const m of allMsgs) {
        if (m && String(m.sessionId || '') === sid) {
          try { await this.dbDelete('messages', m.id); } catch (_) {}
        }
      }
    } catch (e) {}

    // 3) 写入备份 messages
    for (const msg of messagesSnapshot) {
      if (!msg || typeof msg !== 'object') continue;
      const nextMsg = {
        ...msg,
        id: msg.id || ('rbm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2)),
        sessionId: sid
      };
      try {
        await this.dbPut('messages', nextMsg);
      } catch (e) {
        // 使用 dbPut 理论上不会冲突；若仍失败就跳过
      }
    }

    // 4) 删除该条备份（七天冷静期不再生效）
    const kvKey = String(item?._kvKey || item?.kvKey || '');
    if (kvKey) {
      try { await this.kvRemove(kvKey); } catch (e3) {}
    }

    return true;
  },

  async recycleBinPruneExpired() {
    if (!this.db) return 0;
    const all = await this.dbGetAll('kv');
    const prefix = this._RECYCLE_BIN_ITEM_KEY_PREFIX;
    const now = Date.now();
    const expiredKeys = [];
    for (const row of all || []) {
      const k = row && typeof row.key === 'string' ? row.key : '';
      if (!k.startsWith(prefix)) continue;
      const v = row.value;
      const deleteAt = Number(v?.deleteAt || 0);
      if (deleteAt > 0 && deleteAt <= now) expiredKeys.push(k);
    }
    for (const key of expiredKeys) {
      try { await this.kvRemove(key); } catch (e) {}
    }
    return expiredKeys.length;
  },

  /** 全局世界书：仅存 IndexedDB kv，不使用 localStorage（旧数据首次读取时迁入 kv 并清除 localStorage） */
  _worldbookGlobalKey() {
    return (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.WORLDBOOK_GLOBAL_ENTRIES)
      ? CONFIG.STORAGE_KEYS.WORLDBOOK_GLOBAL_ENTRIES
      : 'worldbook_global_entries';
  },

  async worldbookGlobalGet() {
    const key = this._worldbookGlobalKey();
    if (!this.db) return null;
    const ensureDefaultStatusBarEntry = async (rawValue) => {
      const entryName = '官方推荐状态栏';
      const entryContent = [
        '每次回复的结尾必须带上状态栏',
        '状态栏标准格式：',
        '/<状态>([\\s\\S]*?)<\\/状态>|<心声>([\\s\\S]*?)<\\/心声>|<记忆>([\\s\\S]*?)<\\/记忆>/g',
        '',
        '示例：',
        '<状态>正在努力工作，但眼神有些飘忽</状态>',
        '<心声>等会儿下班去吃那家超赞的舒芙蕾吧！</心声>',
        '<记忆>对方曾在三月份提到过对花粉过敏</记忆>',
        '',
        '状态栏要求：内容要求足够详细'
      ].join('\n');

      const normalizeToEntriesArray = (value) => {
        if (value == null) return { containerType: 'object', entries: [] };
        let parsed = value;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch (e) {
            return { containerType: 'object', entries: [] };
          }
        }
        if (Array.isArray(parsed)) return { containerType: 'array', entries: parsed };
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.entries)) return { containerType: 'object', entries: parsed.entries };
          if (parsed.character_book && Array.isArray(parsed.character_book.entries)) {
            return { containerType: 'character_book', entries: parsed.character_book.entries };
          }
        }
        return { containerType: 'object', entries: [] };
      };

      const { containerType, entries } = normalizeToEntriesArray(rawValue);
      const arr = Array.isArray(entries) ? entries.filter(it => it && typeof it === 'object') : [];
      const exists = arr.some((it) => String(it.comment || '').trim() === entryName);
      if (exists) return { changed: false, value: rawValue };

      const nextArr = arr.concat([{
        enabled: false,
        comment: entryName,
        content: entryContent,
        keys: [],
        secondary_keys: []
      }]);

      let nextValue = null;
      if (containerType === 'array') {
        nextValue = nextArr;
      } else if (containerType === 'character_book') {
        nextValue = { character_book: { entries: nextArr } };
      } else {
        nextValue = { entries: nextArr };
      }

      try {
        await this.kvSet(key, nextValue);
        try { localStorage.removeItem(key); } catch (e) {}
      } catch (e) {
        // kv 写入失败时，至少返回补齐后的内存值，不阻塞调用链
      }
      return { changed: true, value: nextValue };
    };

    let v = await this.kvGet(key);
    if (v != null) {
      const r = await ensureDefaultStatusBarEntry(v);
      return r.value;
    }
    try {
      const legacy = this.get(key);
      if (legacy != null) {
        const r = await ensureDefaultStatusBarEntry(legacy);
        return r.value;
      }
    } catch (e) {}
    const r = await ensureDefaultStatusBarEntry(null);
    return r.value;
  },

  async worldbookGlobalSet(value) {
    const key = this._worldbookGlobalKey();
    if (!this.db) {
      console.warn('[Storage] worldbookGlobalSet: IndexedDB 未初始化，全局世界书未保存');
      return;
    }
    await this.kvSet(key, value);
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },

  _globalRegexKey() {
    return (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.GLOBAL_REGEX_RULES)
      ? CONFIG.STORAGE_KEYS.GLOBAL_REGEX_RULES
      : 'global_regex_rules';
  },

  async globalRegexGet() {
    if (!this.db) return null;
    const key = this._globalRegexKey();

    const ensureDefaultOfficialRegex = async (rawValue) => {
      const ruleName = '官方推荐正则';
      const rulePattern = '<状态>([\\s\\S]*?)<\\/状态>|<心声>([\\s\\S]*?)<\\/心声>|<记忆>([\\s\\S]*?)<\\/记忆>';
      const ruleReplacement = `<style>.st-box[data-val=""]{display:none !important;} .st-box{margin:12px 0;transition:transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);user-select:none;} .st-box:active{transform:scale(0.97);}</style>

<div class="st-box" data-val="$1">
<div style="background: #fdfcf0; border: 1px solid #e0dcd0; padding: 16px; border-radius: 4px; box-shadow: 2px 2px 0px #e0dcd0; position: relative;">
<div style="position: absolute; top: -10px; left: 20px; background: rgba(243, 156, 18, 0.2); padding: 2px 15px; transform: rotate(-3deg); font-size: 12px; color: #7f8c8d; border: 1px dashed rgba(0,0,0,0.1);">Today's Log</div>
<div style="color: #a69b8d; font-size: 13px; border-bottom: 1px dashed #d0d0d0; padding-bottom: 4px; margin-bottom: 8px; font-weight: bold; letter-spacing: 1px;">[ 状态 ]</div>
<div style="color: #5d4037; line-height: 1.6; font-size: 14px;">$1</div>
</div>
</div>

<div class="st-box" data-val="$2">
<div style="background: linear-gradient(135deg, #fff5f7 0%, #fef9e7 100%); border-radius: 20px; padding: 15px; border: 2px solid #ffdde1; box-shadow: 0 4px 12px rgba(255, 221, 225, 0.3);">
<div style="display: flex; align-items: center; margin-bottom: 8px;">
<span style="background: #ffdde1; color: #fc6767; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 11px; margin-right: 8px;">❤</span>
<span style="color: #fb7299; font-weight: bold; font-size: 13px; letter-spacing: 0.5px;">心声...</span>
</div>
<div style="color: #8a7373; font-size: 14px; background: rgba(255,255,255,0.6); padding: 10px 12px; border-radius: 12px; line-height: 1.5;">$2</div>
</div>
</div>

<div class="st-box" data-val="$3">
<details style="background: rgba(240, 249, 255, 0.6); border: 1px solid #e0f2fe; border-radius: 8px; overflow: hidden; cursor: pointer; box-shadow: 0 2px 6px rgba(224, 242, 254, 0.4);">
<summary style="padding: 10px 15px; color: #7dd3fc; font-size: 13px; font-weight: bold; list-style: none; display: flex; align-items: center;">
<span style="margin-right: 6px;">✦</span> 记忆 (点击展开/收起)
</summary>
<div style="padding: 0 15px 15px 15px; color: #64748b; font-size: 13px; line-height: 1.6;">
<div style="background: white; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #bae6fd;">$3</div>
</div>
</details>
</div>`;

      const normalizeToEntriesArray = (value) => {
        if (value == null) return [];
        let parsed = value;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch (e) {
            return [];
          }
        }
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) return parsed.entries;
        return [];
      };

      const arr = normalizeToEntriesArray(rawValue).filter((it) => it && typeof it === 'object');
      const exists = arr.some((it) => String(it.comment || '').trim() === ruleName);
      if (exists) return { changed: false, value: rawValue };

      const nextArr = arr.concat([{
        enabled: false,
        comment: ruleName,
        pattern: rulePattern,
        flags: 'g',
        replacement: ruleReplacement
      }]);
      const nextValue = { entries: nextArr };

      try {
        await this.kvSet(key, nextValue);
      } catch (e) {
        // kv 写入失败时，至少返回补齐后的内存值，不阻塞调用链
      }
      return { changed: true, value: nextValue };
    };

    const v = await this.kvGet(key);
    if (v != null) {
      const r = await ensureDefaultOfficialRegex(v);
      return r.value;
    }
    const r = await ensureDefaultOfficialRegex(null);
    return r.value;
  },

  async globalRegexSet(value) {
    if (!this.db) {
      console.warn('[Storage] globalRegexSet: IndexedDB 未初始化');
      return;
    }
    await this.kvSet(this._globalRegexKey(), value);
  },

  // 字体缓存：存/取 Blob
  async fontCacheGet(id) {
    const row = await this.dbGet('fontCache', id);
    return row ? row.data : null;
  },

  async fontCacheSet(id, blob) {
    await this.dbPut('fontCache', { id, data: blob });
  },

  // IndexedDB操作
  async dbAdd(storeName, data) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async dbPut(storeName, data) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async dbGet(storeName, id) {
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  async dbGetAll(storeName) {
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async dbCount(storeName) {
    const tx = this.db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(Number(request.result) || 0);
      request.onerror = () => reject(request.error);
    });
  },

  /** 游标统计各会话消息数，不一次性加载全部消息 */
  async getMessageCountBySession() {
    const counts = new Map();
    if (!this.db) return counts;
    const tx = this.db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(counts);
          return;
        }
        const sid = String(cursor.value?.sessionId || '').trim();
        if (sid) counts.set(sid, (counts.get(sid) || 0) + 1);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  },

  /** 导出弹窗：各会话及消息条数（按最近活跃排序） */
  async getExportSessionMessageList() {
    const [sessions, countMap] = await Promise.all([
      this.dbGetAll('sessions'),
      this.getMessageCountBySession()
    ]);
    const rows = [];
    const seen = new Set();
    const list = Array.isArray(sessions) ? sessions.slice() : [];
    list.sort((a, b) => {
      const ua = Number(a?.updatedAt) || Number(a?.createdAt) || 0;
      const ub = Number(b?.updatedAt) || Number(b?.createdAt) || 0;
      return ub - ua;
    });
    for (const s of list) {
      const id = String(s?.id || '').trim();
      if (!id) continue;
      seen.add(id);
      rows.push({
        id,
        title: String(s?.title || '').trim() || '未命名会话',
        messageCount: countMap.get(id) || 0
      });
    }
    for (const [sid, cnt] of countMap.entries()) {
      if (!seen.has(sid) && cnt > 0) {
        rows.push({
          id: sid,
          title: '已删除的会话',
          messageCount: cnt
        });
      }
    }
    return rows;
  },
  
  async dbDelete(storeName, id) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async dbClear(storeName) {
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  _isIOS() {
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  formatBytes(n) {
    const b = Number(n) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  },

  /** 预估导出体积（不含美化缩进；相册/音乐占比大） */
  async estimateExportBytes(options = {}) {
    const lite = !!options.lite;
    const breakdown = {};
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const len = (localStorage.getItem(key) || '').length;
        breakdown.localStorage = (breakdown.localStorage || 0) + len;
        total += len;
      }
    } catch (e) {}
    const stores = [
      'sessions', 'messages', 'themes', 'album', 'characters', 'masks',
      'tracks', 'notes', 'widgetResources', 'kv', 'moments', 'threads'
    ];
    const skipIfLite = new Set(['album', 'tracks']);
    for (const store of stores) {
      if (lite && skipIfLite.has(store)) {
        breakdown[store] = 0;
        continue;
      }
      try {
        const items = await this.dbGetAll(store);
        const len = JSON.stringify(items || []).length;
        breakdown[store] = len;
        total += len;
      } catch (e) {
        breakdown[store] = 0;
      }
    }
    return { total: Math.ceil(total * 1.05), breakdown, lite };
  },

  /** 导出确认弹窗用：各分类名称与条数（只 count，不读全量，避免大数据卡死） */
  async getExportCategories() {
    const defs = [
      { id: 'localStorage', label: '应用设置与偏好' },
      { id: 'settings', label: 'API 连接配置' },
      { id: 'homescreen', label: '主屏幕（壁纸与图标）' },
      { id: 'currentTheme', label: '当前主题' },
      { id: 'sessions', label: '聊天会话' },
      { id: 'messages', label: '聊天消息' },
      { id: 'themes', label: '美化主题' },
      { id: 'characters', label: '角色' },
      { id: 'masks', label: '面具' },
      { id: 'notes', label: '笔记' },
      { id: 'moments', label: '朋友圈' },
      { id: 'threads', label: '话题' },
      { id: 'widgetResources', label: '小组件资源' },
      { id: 'kv', label: '其他键值数据' },
      { id: 'album', label: '相册', hint: '体积较大' },
      { id: 'tracks', label: '本地音乐', hint: '体积较大' }
    ];

    const categories = [];
    for (const def of defs) {
      const cat = { ...def, count: 0, bytes: 0, hasData: false };
      if (def.id === 'localStorage') {
        try {
          let bytes = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            bytes += (localStorage.getItem(key) || '').length;
          }
          cat.count = localStorage.length;
          cat.bytes = bytes;
          cat.hasData = cat.count > 0;
        } catch (e) {}
      } else if (def.id === 'settings') {
        cat.hasData = !!(
          this.get(CONFIG.STORAGE_KEYS.API_KEY) ||
          this.get(CONFIG.STORAGE_KEYS.BASE_URL) ||
          this.get(CONFIG.STORAGE_KEYS.API_MODEL) ||
          this.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL) ||
          this.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY) ||
          this.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL) ||
          this.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS)
        );
      } else if (def.id === 'homescreen') {
        cat.hasData = !!(
          this.get(CONFIG.STORAGE_KEYS.WALLPAPER) ||
          this.get(CONFIG.STORAGE_KEYS.ICON_ORDER)
        );
      } else if (def.id === 'currentTheme') {
        cat.hasData = !!this.get(CONFIG.STORAGE_KEYS.CURRENT_THEME);
      } else {
        try {
          cat.count = await this.dbCount(def.id);
          cat.hasData = cat.count > 0;
        } catch (e) {}
      }
      categories.push(cat);
    }
    return categories;
  },

  async gzipBlob(blob) {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  },

  async readImportFileText(file) {
    if (!file) throw new Error('未选择文件');
    const name = String(file.name || '').toLowerCase();
    const isGz = name.endsWith('.gz') ||
      file.type === 'application/gzip' ||
      file.type === 'application/x-gzip';
    if (!isGz) return await file.text();
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('当前浏览器无法解压 .gz，请先在电脑上解压为 .json 再导入');
    }
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  },

  // 导出所有数据；options.lite 为 true 时不含相册与本地音乐（体积常占大头）
  // options.include 为 { sessions: true, ... } 时仅导出勾选项；缺省则导出全部
  // options.includeMessageSessionIds 为会话 id 白名单时，仅导出这些会话的消息（及对应会话记录）
  async exportAll(options = {}) {
    const lite = !!options.lite;
    const include = options.include && typeof options.include === 'object' ? options.include : null;
    const includeMsgSessions = Array.isArray(options.includeMessageSessionIds)
      ? new Set(options.includeMessageSessionIds.map((id) => String(id || '').trim()).filter(Boolean))
      : null;
    const shouldInclude = (key) => !include || include[key] === true;
    const payload = {};

    if (shouldInclude('localStorage')) {
      const localStorageDump = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          localStorageDump[key] = localStorage.getItem(key);
        }
      } catch (e) {}
      payload.localStorage = localStorageDump;
    }

    if (shouldInclude('settings')) {
      payload.settings = {
        apiKey: this.get(CONFIG.STORAGE_KEYS.API_KEY),
        baseUrl: this.get(CONFIG.STORAGE_KEYS.BASE_URL),
        apiModel: this.get(CONFIG.STORAGE_KEYS.API_MODEL),
        imageGenBaseUrl: this.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL),
        imageGenApiKey: this.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY),
        imageGenModel: this.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL),
        imageGenAutoMoments: this.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS)
      };
    }

    if (shouldInclude('homescreen')) {
      payload.homescreen = {
        wallpaper: this.get(CONFIG.STORAGE_KEYS.WALLPAPER),
        iconOrder: this.get(CONFIG.STORAGE_KEYS.ICON_ORDER)
      };
    }

    if (shouldInclude('currentTheme')) {
      payload.currentTheme = this.get(CONFIG.STORAGE_KEYS.CURRENT_THEME);
    }

    const dbStores = [
      'themes', 'characters', 'masks',
      'notes', 'widgetResources', 'kv', 'moments', 'threads'
    ];
    for (const store of dbStores) {
      if (shouldInclude(store)) {
        payload[store] = await this.dbGetAll(store);
      }
    }

    if (shouldInclude('sessions')) {
      let sessions = await this.dbGetAll('sessions');
      if (includeMsgSessions && includeMsgSessions.size) {
        sessions = (sessions || []).filter((s) => includeMsgSessions.has(String(s?.id || '').trim()));
      }
      payload.sessions = sessions;
    }

    if (shouldInclude('messages')) {
      let messages = await this.dbGetAll('messages');
      if (includeMsgSessions && includeMsgSessions.size) {
        messages = (messages || []).filter((m) => {
          const sid = String(m?.sessionId || '').trim();
          return sid && includeMsgSessions.has(sid);
        });
      }
      payload.messages = messages;
    }

    if (!lite && shouldInclude('album')) {
      payload.album = await this.dbGetAll('album');
    }
    if (!lite && shouldInclude('tracks')) {
      payload.tracks = await this.dbGetAll('tracks');
    }

    const allKeys = [
      'localStorage', 'settings', 'homescreen', 'currentTheme',
      'sessions', 'messages',
      ...dbStores, 'album', 'tracks'
    ];
    const includedCount = allKeys.filter((k) => shouldInclude(k)).length;
    let exportMode = 'full';
    if (lite) exportMode = 'lite';
    else if (include && includedCount < allKeys.length) exportMode = 'partial';

    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportMode,
      data: payload
    };
    if (include) {
      data.included = allKeys.filter((k) => shouldInclude(k));
    }
    if (includeMsgSessions && includeMsgSessions.size) {
      data.includedMessageSessionIds = [...includeMsgSessions];
    }
    return data;
  },
  
  // 导入所有数据
  async importAll(data) {
    if (!data || data.version !== 1) {
      throw new Error('无效的数据格式');
    }

    // 导入 localStorage 数据：
    // - 新版：优先完整恢复 localStorage 快照（覆盖美化相关全部键）
    // - 旧版：回退到仅恢复部分关键键（兼容历史备份）
    const hasLocalStorageDump = !!(data.data && data.data.localStorage && typeof data.data.localStorage === 'object');
    if (hasLocalStorageDump) {
      try {
        localStorage.clear();
        Object.keys(data.data.localStorage).forEach((k) => {
          const raw = data.data.localStorage[k];
          // exportAll 按 raw string 导出，这里按原样恢复
          if (typeof raw === 'string') localStorage.setItem(k, raw);
          else if (raw == null) localStorage.removeItem(k);
          else localStorage.setItem(k, String(raw));
        });
      } catch (e) {}
    } else {
      if (data.data.settings) {
        this.set(CONFIG.STORAGE_KEYS.API_KEY, data.data.settings.apiKey);
        this.set(CONFIG.STORAGE_KEYS.BASE_URL, data.data.settings.baseUrl);
        if (data.data.settings.apiModel != null) {
          this.set(CONFIG.STORAGE_KEYS.API_MODEL, data.data.settings.apiModel);
        }
        if (data.data.settings.imageGenBaseUrl != null) {
          this.set(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL, data.data.settings.imageGenBaseUrl);
        }
        if (data.data.settings.imageGenApiKey != null) {
          this.set(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY, data.data.settings.imageGenApiKey);
        }
        if (data.data.settings.imageGenModel != null) {
          this.set(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL, data.data.settings.imageGenModel);
        }
        if (data.data.settings.imageGenAutoMoments != null) {
          this.set(CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS, data.data.settings.imageGenAutoMoments);
        }
      }
      if (data.data.homescreen) {
        this.set(CONFIG.STORAGE_KEYS.WALLPAPER, data.data.homescreen.wallpaper);
        this.set(CONFIG.STORAGE_KEYS.ICON_ORDER, data.data.homescreen.iconOrder);
      }
      if (data.data.currentTheme) {
        this.set(CONFIG.STORAGE_KEYS.CURRENT_THEME, data.data.currentTheme);
      }
    }
    
    // 导入IndexedDB数据
    if (data.data.sessions) {
      await this.dbClear('sessions');
      for (const session of data.data.sessions) {
        await this.dbAdd('sessions', session);
      }
    }
    if (data.data.messages) {
      await this.dbClear('messages');
      for (const message of data.data.messages) {
        await this.dbAdd('messages', message);
      }
    }
    if (data.data.themes) {
      await this.dbClear('themes');
      for (const theme of data.data.themes) {
        await this.dbAdd('themes', theme);
      }
    }
    if (data.data.album) {
      await this.dbClear('album');
      for (const item of data.data.album) {
        await this.dbAdd('album', item);
      }
    }
    if (data.data.characters) {
      await this.dbClear('characters');
      for (const item of data.data.characters) {
        await this.dbAdd('characters', item);
      }
    }
    if (data.data.masks) {
      await this.dbClear('masks');
      for (const item of data.data.masks) {
        await this.dbAdd('masks', item);
      }
    }
    if (data.data.tracks) {
      await this.dbClear('tracks');
      for (const item of data.data.tracks) {
        await this.dbAdd('tracks', item);
      }
    }
    if (data.data.notes) {
      await this.dbClear('notes');
      for (const item of data.data.notes) {
        await this.dbAdd('notes', item);
      }
    }
    if (data.data.widgetResources) {
      await this.dbClear('widgetResources');
      for (const item of data.data.widgetResources) {
        await this.dbAdd('widgetResources', item);
      }
    }

    if (data.data.kv) {
      await this.dbClear('kv');
      for (const item of data.data.kv) {
        await this.dbAdd('kv', item);
      }
    }

    if (data.data.moments) {
      await this.dbClear('moments');
      for (const item of data.data.moments) {
        await this.dbAdd('moments', item);
      }
    }

    if (data.data.threads) {
      await this.dbClear('threads');
      for (const item of data.data.threads) {
        await this.dbAdd('threads', item);
      }
    }

    try {
      await this.hydrateIconStylesCache();
    } catch (e) {}
  },

  _showExportWait(message) {
    let el = document.getElementById('yd-export-wait');
    if (!el) {
      el = document.createElement('div');
      el.id = 'yd-export-wait';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML =
        '<div class="yd-export-wait__box">' +
        '<div class="yd-export-wait__spinner" aria-hidden="true"></div>' +
        '<div class="yd-export-wait__text" id="yd-export-wait-text">导出中，请稍候…</div>' +
        '</div>';
      el.style.cssText =
        'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
      const box = el.querySelector('.yd-export-wait__box');
      if (box) {
        box.style.cssText =
          'min-width:168px;max-width:80vw;padding:22px 26px;border-radius:16px;background:rgba(255,255,255,0.96);' +
          'box-shadow:0 12px 40px rgba(0,0,0,0.18);display:flex;flex-direction:column;align-items:center;gap:14px;';
      }
      const spinner = el.querySelector('.yd-export-wait__spinner');
      if (spinner) {
        spinner.style.cssText =
          'width:32px;height:32px;border:3px solid rgba(0,122,255,0.2);border-top-color:#007aff;' +
          'border-radius:50%;animation:yd-export-wait-spin 0.8s linear infinite;';
      }
      const text = el.querySelector('.yd-export-wait__text');
      if (text) {
        text.style.cssText = 'font-size:15px;font-weight:600;color:#111;text-align:center;line-height:1.4;';
      }
      if (!document.getElementById('yd-export-wait-style')) {
        const style = document.createElement('style');
        style.id = 'yd-export-wait-style';
        style.textContent = '@keyframes yd-export-wait-spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(style);
      }
      document.body.appendChild(el);
    }
    const textEl = document.getElementById('yd-export-wait-text');
    if (textEl) textEl.textContent = message || '导出中，请稍候…';
    el.style.display = 'flex';
    el.hidden = false;
  },

  _hideExportWait() {
    const el = document.getElementById('yd-export-wait');
    if (!el) return;
    el.hidden = true;
    el.style.display = 'none';
  },

  _attachDownloadFallback(url, name) {
    let el = document.getElementById('yd-export-fallback');
    if (!el) {
      el = document.createElement('a');
      el.id = 'yd-export-fallback';
      el.style.cssText =
        'position:fixed;left:16px;right:16px;bottom:calc(20px + env(safe-area-inset-bottom,0px));' +
        'z-index:99999;padding:14px 16px;border-radius:12px;background:#007aff;color:#fff;' +
        'font-size:15px;font-weight:600;text-align:center;text-decoration:none;box-shadow:0 4px 20px rgba(0,0,0,.2);';
      document.body.appendChild(el);
    }
    el.href = url;
    el.download = name;
    el.textContent = '点此保存备份';
    el.onclick = () => {
      setTimeout(() => {
        try { el.remove(); } catch (e) {}
      }, 8000);
    };
  },

  /**
   * 保存 Blob：依次尝试分享、下载链、新标签；仍不行则显示底部「点此保存」链接（不弹窗）。
   */
  async downloadBlob(blob, filename) {
    const name = String(filename || 'download').trim() || 'download';
    const fileBlob = blob instanceof Blob ? blob : new Blob([blob], { type: 'application/octet-stream' });
    const mime = fileBlob.type || 'application/octet-stream';
    const size = fileBlob.size;
    const isIOS = this._isIOS();
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const isMobile = isIOS || /Android/i.test(ua);

    const tryShare = async () => {
      if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
      try {
        const file = new File([fileBlob], name, { type: mime });
        let canTry = true;
        if (typeof navigator.canShare === 'function') {
          try { canTry = navigator.canShare({ files: [file] }); } catch (e) { canTry = true; }
        }
        if (!canTry && !isIOS) return false;
        await navigator.share({ files: [file], title: name });
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return true;
        return false;
      }
    };

    if (isMobile) await tryShare();

    const url = URL.createObjectURL(fileBlob);
    let openedTab = false;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      a.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (isIOS) {
        try {
          const w = window.open(url, '_blank', 'noopener,noreferrer');
          openedTab = !!w;
        } catch (e) {}
      }

      if (isMobile) {
        this._attachDownloadFallback(url, name);
      }
    } finally {
      const delay = openedTab || isMobile ? 300000 : 60000;
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (e) {}
      }, delay);
    }
    return { method: 'ok', size };
  },

  /** 带等待层的文件导出（设置/会话/气泡等统一入口） */
  async downloadBlobWithWait(blob, filename, message) {
    this._showExportWait(message || '导出中，请稍候…');
    try {
      await this.downloadBlob(blob, filename);
    } finally {
      this._hideExportWait();
    }
  },

  /** 打包并触发下载；内存不足时自动改精简导出，不弹窗、不中断 */
  async exportBackupToFile(options = {}) {
    const include = options.include && typeof options.include === 'object' ? options.include : null;
    const includeMessageSessionIds = Array.isArray(options.includeMessageSessionIds)
      ? options.includeMessageSessionIds
      : null;
    this._showExportWait('正在打包备份…');
    try {
      const date = new Date().toISOString().slice(0, 10);
      for (const lite of [false, true]) {
        try {
          this._showExportWait(lite ? '正在精简导出…' : '正在读取数据…');
          const data = await this.exportAll({ lite, include, includeMessageSessionIds });
          this._showExportWait('正在生成文件…');
          let json;
          try {
            json = JSON.stringify(data);
          } catch (e) {
            continue;
          }
          let blob = new Blob([json], { type: 'application/json' });
          let filename = lite ? `SC备份_精简_${date}.json` : `SC备份_${date}.json`;
          this._showExportWait('正在压缩…');
          const gz = await this.gzipBlob(blob);
          if (gz && gz.size < blob.size) {
            blob = gz;
            filename = filename.replace(/\.json$/, '.json.gz');
          }
          this._showExportWait('即将保存文件…');
          await this.downloadBlob(blob, filename);
          return;
        } catch (e) {
          console.warn('[导出] 尝试' + (lite ? '精简' : '完整') + '失败', e);
        }
      }
      const empty = { version: 1, exportedAt: new Date().toISOString(), exportMode: 'empty', data: {} };
      const blob = new Blob([JSON.stringify(empty)], { type: 'application/json' });
      await this.downloadBlob(blob, `SC备份_${date}.json`);
    } finally {
      this._hideExportWait();
    }
  }
};


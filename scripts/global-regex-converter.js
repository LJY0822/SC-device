// 全局正则：对助手输出等文本做顺序替换；规则存 IndexedDB kv，与会话无关

function greCoerceEnabled(raw) {
  if (raw === false || raw === 0 || raw === '0') return false;
  if (raw === true || raw === 1 || raw === '1') return true;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'false' || s === 'no' || s === 'off') return false;
    if (s === 'true' || s === 'yes' || s === 'on') return true;
  }
  return true;
}

const GlobalRegexConverter = {
  /** @type {Array<{enabled:boolean,comment:string,pattern:string,flags:string,replacement:string}>} */
  _entries: [],

  /** @type {Array<{re:RegExp,replacement:string}>} */
  _compiled: [],

  init() {
    this._entries = [];
    this._compiled = [];
  },

  /**
   * 兼容 SillyTavern 常见写法：/pattern/flags
   * 返回 { pattern, flags }；无法解析时返回 null。
   */
  _parseDelimitedPattern(source) {
    const s = String(source || '').trim();
    if (!s || s[0] !== '/') return null;
    let escaped = false;
    let end = -1;
    for (let i = 1; i < s.length; i++) {
      const ch = s[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '/') {
        end = i;
      }
    }
    if (end <= 0) return null;
    const body = s.slice(1, end);
    const flags = s.slice(end + 1).trim();
    if (!body) return null;
    if (flags && !/^[gimsuy]*$/i.test(flags)) return null;
    return { pattern: body, flags: flags || '' };
  },

  _normalizeEntries(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((it) => it && typeof it === 'object')
      .map((it) => {
        const rawPattern = String(it.pattern ?? it.findRegex ?? it.regex ?? '').trim();
        const rawFlags = String(it.flags || 'g').trim() || 'g';
        const parsed = this._parseDelimitedPattern(rawPattern);
        return {
          enabled: greCoerceEnabled(it.enabled),
          comment: String(it.comment || '').trim(),
          pattern: parsed ? parsed.pattern : rawPattern,
          flags: parsed ? (parsed.flags || rawFlags || 'g') : rawFlags,
          replacement: String(it.replacement ?? it.replaceString ?? it.replace ?? '')
        };
      })
      .filter((it) => it.pattern.length > 0);
  },

  _recompile() {
    this._compiled = [];
    for (const e of this._entries) {
      if (!greCoerceEnabled(e.enabled)) continue;
      try {
        const re = new RegExp(e.pattern, e.flags);
        this._compiled.push({ re, replacement: e.replacement });
      } catch (err) {
        console.warn('[GlobalRegexConverter] 跳过无效正则:', e.pattern, err);
      }
    }
  },

  /**
   * 从存储加载（应用启动时调用）
   */
  async loadFromStorage() {
    let raw = null;
    try {
      if (typeof Storage !== 'undefined' && Storage.globalRegexGet) {
        raw = await Storage.globalRegexGet();
      }
    } catch (e) {
      console.warn('[GlobalRegexConverter] loadFromStorage', e);
    }
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && typeof raw === 'object' && Array.isArray(raw.entries)) arr = raw.entries;
    this._entries = this._normalizeEntries(arr);
    this._recompile();
  },

  getEntries() {
    return this._entries.map((e) => ({ ...e }));
  },

  /**
   * 替换内存中的规则并可选写入存储
   * @param {Array} entries
   * @param {boolean} persist
   */
  async setEntries(entries, persist = false) {
    this._entries = this._normalizeEntries(entries);
    this._recompile();
    if (persist && typeof Storage !== 'undefined' && Storage.globalRegexSet) {
      try {
        await Storage.globalRegexSet({ entries: this._entries });
      } catch (e) {
        console.error('[GlobalRegexConverter] persist failed', e);
        throw e;
      }
    }
  },

  apply(text) {
    let result = String(text || '');
    if (!result || !this._compiled.length) return result;
    for (const c of this._compiled) {
      try {
        result = result.replace(c.re, c.replacement);
      } catch (e) {
        console.warn('[GlobalRegexConverter] apply 失败:', e);
      }
    }
    return result;
  }
};

GlobalRegexConverter.init();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GlobalRegexConverter;
}

/** 查日记生成：第四段 system「输出协议与风格」（固定内置，不在设置里修改） */
const TA_DIARY_OUTPUT_PRESET_DEFAULT_LINES = [
  '你必须只输出纯 HTML 片段（不是 markdown）。',
  '禁止输出 ``` 代码块，禁止输出 <html><head><body> 外层标签。',
  '仅允许标签：p, br, strong, em, u, i, b, ul, ol, li, blockquote, hr, div, span, a, style。',
  '禁止 script/iframe/form/button/input/textarea。禁止任何解释性文字或前后缀。',
  '允许使用 class/style（包括 <style> 标签），用于让排版更好看。',
  '移动端优先：默认按手机视口排版（约 360-430px 宽），避免固定宽度大容器与超大内边距。',
  '样式约束：不要使用 width: 600px 这类固定宽度；容器优先使用 width:100% + max-width:100%；减少 float，优先 flex/块布局。',
  '请在片段内附带 @media (max-width:430px) 的兜底规则：缩小字体与间距，避免横向溢出和元素挤压。',
  '便签/批注交互：需要“点击后看内容”时，把可点击文字包在 <span> 或 <div> 上，并附带 data-yd-note="纯文本便签内容"（不要写 HTML）。',
  '内容必须是“日记富文本片段”，允许在片段内部包含 <style> 来定义该片段的视觉风格。',
  '叙事视角：必须使用角色方第一人称写日记（我/今天我）；禁止替用户方说话，禁止出现“你说/用户说/你让我”等代用户对白。',
  '结构要求：开头需要像写日记一样先写“日期、时间、天气、星期、心情”信息，再写正文随笔。',
  '风格禁令：禁止卡片化 UI 外框（例如把天气或正文包在一个卡片框里做装饰），避免出戏。',
  '唯一允许的轻卡片是“便利贴”：必须模拟真实便利贴细节（阴影、轻微渐变、纸张质感、可选小胶带粘贴感），且只作为局部点缀。',
  '涂鸦与笔触：需要大量使用融合手写涂鸦元素，需要使用不同粗细、颜色的手写字体，并且需要模拟钢笔、圆珠笔、铅笔、中性笔的样式。',
  '字体禁令：禁止宋体、楷体等官方印刷感字体；字体样式必须采用非常像手写感觉的字体样式。',
  '风格方案：',
  '参考 ：手账风（温馨/少女/生活化）。要求：',
  '1) 背景：淡奶油色纸张质感，自带自然纹理感（可用轻微渐变/噪点/纹理类背景）。',
  '2) 标题区：包含日期、星期、天气、心情...等；呈现为手账笔记风，不要做应用卡片框。',
  '3) 随笔正文：内容需要像真实真人随手写的日记、禁止写模板小作文。需要有自己思考的点和着重想记录下来的侧重点。下列的每一项效果都必须在生成内容里面应用进去，并且每一项效果在随笔正文中至少有一处应用：\n' +
    '1. 荧光笔涂抹（用半透明底色渐变块）；\n' +
    '2. 字体下面划线：波浪线、直线、不规则线；\n' +
    '3. 涂改：把原有的圈起来划掉、或者直接划掉、或者涂黑、或者抹上修正带。然后重新写上新的内容；\n' +
    '4. 划掉：把原有的字划掉，划掉的样式有多种，不仅限于单横线划掉、双横线划掉、波浪线划掉、折线型划掉、各种颜色的笔划掉、划掉的角度不仅限于水平、斜线、弧线、波浪线、不规则线；\n' +
    '5. 橡皮擦后模糊的字：把原有的字用橡皮擦擦掉、或者把字体做颜色变淡变模糊（模拟橡皮擦掉后只剩一些隐隐约约的痕迹，能基本看清）、并且支持纸张被橡皮擦擦掉后留下的痕迹，比如纸张在擦掉字迹的地方会有一团晕影、或者模糊、或者撕裂的痕迹；点击需要有点击事件：点击之后这一处地方之后能立即看清的那种\n' +
    '6. 手动圈起来的地方：圈起来的样式不限于圆形、方形、椭圆形、不规则形、波浪形、直线形、斜线形、弧线形、折线形、各种颜色的笔圈起来、圈起来的角度不仅限于水平、斜线、略微超出圈出字体的边界等；\n' +
    '7. 一些随便的笔迹涂画：一些随意的笔迹涂画，比如随意的涂鸦、随意的线条、随意的图形。；\n' +
    '8. 一些在纸上不经意地方留下的笔误触：是在模拟真人在写字时候，因为不小心把墨水洒在了纸上，然后留下的墨水痕迹。或者在写字的时候，分神时候留下的一些笔误触留下的笔痕划痕，通常为一小段不起眼的不规则走线；\n' +
    '9. 修正带覆盖上的遮挡、修正带不要标准的矩形，近似矩形的修正带涂抹反而会更加真实、需要有模拟修正带的质感、修正带通常为白色、但是可以混一些纯度不是那么高的白色来模拟真实修正带质感、并且支持点击修正带部分、会渐渐的一点一点露出被修正带覆盖的字迹（设定为点击此处2次点击后，会慢慢一次一次比上一次更加清晰，最后一次点击会完全露出被修正带覆盖的字迹，并且在每次点击的时候会飘出字体“擦拭了一下~”，这里禁止出现还需要二次确认的提示，这里必须加上这样的点击的脚本）。\n',
  '强制要求：字体必须使用手写感很强的字体，必须需要引用外部字体使用。需要字迹清晰不潦草的字体。\n',
  '字体颜色不限，只需要考虑真实手写的是会用什么字体颜色和放置大规范同色字体导致审美疲劳。\n',
  '4) 装饰分割线：纸张撕裂边缘的波浪线（hr 使用 border-radius/clip-path 或背景波纹）。胶带样式装饰条（可用 div 包裹 hr 或伪元素）。',
  '5) 整体色调：低饱和度莫兰迪色系，轻盈、有呼吸感。',
  '6) 禁止出现违和的提示，禁止出现例如：点击抹除修正带、这是一些涂鸦、（此处有一段杂乱的不规则走线）...等提示。',
  '7) 禁止出现弹窗的脚本，禁止出现弹窗，禁止出现还需要二次确认的提示',
  '若涉及“用户与角色”的互动事实，只允许概述已有事件，不得杜撰聊天事实。'
];

const TaDiary = {
  DIARY_KIND: 'diary',
  STORAGE_ID_PREFIX: 'ta_diary_',
  STORAGE_KEY_CHARACTER: 'ta_diary_character_id_v1',
  /** 日记富文本在 light DOM 下的作用域（若样式挂在页面内时使用） */
  _DIARY_CSS_SCOPE: '#page-ta-diary #ta-diary-rich',
  _inFlight: false,
  _lastRenderedDateKey: null,
  _selectedDateTs: null,
  _currentEntryId: '',

  init() {
    this._selectedDateTs = Date.now();

    document.getElementById('ta-diary-prev')?.addEventListener('click', () => {
      this.shiftEntry(-1).catch(() => {});
    });

    document.getElementById('ta-diary-next')?.addEventListener('click', () => {
      this.shiftEntry(1).catch(() => {});
    });

    document.getElementById('ta-diary-refresh')?.addEventListener('click', () => {
      this.generateDiary({ dateTs: this._selectedDateTs }).catch(() => {});
    });

    document.getElementById('ta-diary-settings')?.addEventListener('click', () => {
      this.openSettingsModal().catch(() => {});
    });

    document.getElementById('ta-diary-directory')?.addEventListener('click', () => {
      this.openDirectory().catch(() => {});
    });

    document.getElementById('ta-diary-switch-top')?.addEventListener('click', async () => {
      await this.openCharacterSwitch();
    });

    window.addEventListener('yd:pagechange', async (e) => {
      const from = e?.detail?.from;
      const to = e?.detail?.to;
      if (from === 'page-ta-diary' && to !== 'page-ta-diary') {
        this._purgeDiaryGlobalLeaks();
      }
      if (to === 'page-ta-diary') {
        await this.loadDiaryAndRender();
      }
    });

    // 清理历史版本曾提升到 head 的日记样式（修复后不应再产生）
    this._purgeDiaryGlobalLeaks();

    // 首次进入（如默认就开在该页）
    if (State?.currentPage === 'page-ta-diary') {
      this.loadDiaryAndRender().catch(() => {});
    }
  },

  _pad2(n) {
    return String(n).padStart(2, '0');
  },

  setSelectedDateTs(dateTs) {
    const ts = Number(dateTs || 0);
    if (!Number.isFinite(ts) || ts <= 0) return;
    this._selectedDateTs = ts;
  },

  shiftSelectedDay(deltaDays) {
    const base = Number(this._selectedDateTs || Date.now()) || Date.now();
    const d = new Date(base);
    d.setDate(d.getDate() + Number(deltaDays || 0));
    // 固定到中午附近，避免跨时区/夏令时导致日期键漂移
    d.setHours(12, 0, 0, 0);
    this._selectedDateTs = d.getTime();
  },

  _formatDateKey(ts) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = this._pad2(d.getMonth() + 1);
    const dd = this._pad2(d.getDate());
    return `${yyyy}-${mm}-${dd}`;
  },

  _formatDateTitle(ts) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()] || '';
    return `${yyyy}年${mm}月${dd}日 ${week}`.trim();
  },

  _formatDateTimeTitle(ts) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = this._pad2(d.getMonth() + 1);
    const dd = this._pad2(d.getDate());
    const hh = this._pad2(d.getHours());
    const mi = this._pad2(d.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  },

  _getCharacterId() {
    try {
      return String(Storage.get(this.STORAGE_KEY_CHARACTER) || '').trim();
    } catch (e) {
      return '';
    }
  },

  async _getUsableCharacterId() {
    const selected = this._getCharacterId();
    if (selected) return selected;
    try {
      const all = await Storage.dbGetAll('characters');
      const rows = Array.isArray(all) ? all.slice() : [];
      if (!rows.length) return '';
      rows.sort((a, b) => (Number(b?.createdAt || 0) || 0) - (Number(a?.createdAt || 0) || 0));
      const fallback = String(rows[0]?.id || '').trim();
      if (fallback) {
        try {
          Storage.set(this.STORAGE_KEY_CHARACTER, fallback);
        } catch (e) {}
      }
      return fallback;
    } catch (e) {
      return '';
    }
  },

  async _refreshHeaderRoleName() {
    const nameEl = document.getElementById('ta-diary-role-name');
    if (!nameEl) return;
    const cid = this._getCharacterId();
    if (!cid) {
      nameEl.textContent = '未选择角色';
      return;
    }
    try {
      const c = await Storage.dbGet('characters', cid);
      nameEl.textContent = String(c?.name || '').trim() || '未选择角色';
    } catch (e) {
      nameEl.textContent = '未选择角色';
    }
  },

  async openCharacterSwitch() {
    const existing = document.getElementById('yd-ta-diary-switch');
    if (existing) existing.remove();

    let characters = [];
    try {
      characters = await Storage.dbGetAll('characters');
    } catch (e) {
      characters = [];
    }
    characters = Array.isArray(characters) ? characters.slice() : [];
    characters.sort((a, b) => (Number(b?.createdAt || 0) || 0) - (Number(a?.createdAt || 0) || 0));

    const current = this._getCharacterId();

    const overlay = document.createElement('div');
    overlay.id = 'yd-ta-diary-switch';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = '1200';
    overlay.innerHTML = `
      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);"></div>
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,360px);background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.25);overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #EEE;">
          <div style="font-size:15px;font-weight:900;color:#111;">选择角色</div>
          <button type="button" id="yd-ta-diary-switch-x" style="border:none;background:transparent;width:32px;height:32px;border-radius:10px;font-size:22px;line-height:1;color:#666;cursor:pointer;">×</button>
        </div>
        <div style="max-height:min(56vh,420px);overflow:auto;-webkit-overflow-scrolling:touch;padding:8px;">
          ${(characters.length ? characters : [{ id: '', name: '暂无角色' }])
            .map((m) => {
              const id = String(m?.id || '');
              const name = String(m?.name || '').trim() || (id ? '未命名角色' : '请先到「角色」里创建角色');
              const isCurrent = !!id && id === current;
              return `
                <button type="button" data-id="${this._escapeHtml(id)}"
                  style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:none;background:${isCurrent ? 'rgba(255,107,0,0.10)' : 'transparent'};border-radius:12px;cursor:${id ? 'pointer' : 'default'};">
                  <div style="text-align:left;">
                    <div style="font-size:14px;font-weight:900;color:#111;">${this._escapeHtml(name)}${isCurrent ? '（当前）' : ''}</div>
                    <div style="font-size:12px;color:#8E8E93;margin-top:2px;">将基于该角色生成日记</div>
                  </div>
                  <div aria-hidden="true" style="width:18px;height:18px;border-radius:9px;border:2px solid ${isCurrent ? '#FF6B00' : '#E5E5EA'};background:${isCurrent ? '#FF6B00' : 'transparent'};"></div>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    const close = () => {
      try {
        overlay.remove();
      } catch (e) {}
    };

    overlay.firstElementChild?.addEventListener('click', close);
    overlay.querySelector('#yd-ta-diary-switch-x')?.addEventListener('click', close);

    Array.from(overlay.querySelectorAll('button[data-id]')).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = String(btn.getAttribute('data-id') || '').trim();
        if (!id) return;
        try {
          Storage.set(this.STORAGE_KEY_CHARACTER, id);
        } catch (e) {}
        close();
        await this._refreshHeaderRoleName();
        await this.loadDiaryAndRender();
      });
    });

    document.body.appendChild(overlay);
  },

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  _userSupplementStorageKey() {
    try {
      return String(CONFIG?.STORAGE_KEYS?.TA_DIARY_USER_OUTPUT_SUPPLEMENT || '').trim();
    } catch (e) {
      return '';
    }
  },

  _getStoredUserOutputSupplement() {
    const key = this._userSupplementStorageKey();
    if (!key) return '';
    try {
      const v = Storage.get(key);
      return typeof v === 'string' ? v : String(v ?? '');
    } catch (e) {
      return '';
    }
  },

  /** 拼入 user 消息末尾的补充说明（可含多行）；空则无追加 */
  _getUserSupplementForRequest() {
    return this._getStoredUserOutputSupplement().trim();
  },

  openSettingsModal() {
    const existing = document.getElementById('yd-ta-diary-settings-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-ta-diary-settings-modal';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:1250;display:flex;align-items:flex-end;justify-content:center;padding:0;';
    overlay.innerHTML = `
      <div data-close-bg style="position:absolute;inset:0;background:rgba(0,0,0,0.45);"></div>
      <div style="position:relative;width:100%;max-width:440px;max-height:min(88vh,640px);background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -8px 40px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #EEE;flex-shrink:0;">
          <div style="font-size:16px;font-weight:900;color:#111;">日记设置</div>
          <button type="button" id="yd-ta-diary-settings-x" style="border:none;background:transparent;width:36px;height:36px;border-radius:10px;font-size:22px;line-height:1;color:#666;cursor:pointer;">×</button>
        </div>
        <div style="padding:12px 14px;overflow:auto;-webkit-overflow-scrolling:touch;flex:1;display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;flex-direction:column;gap:6px;">
            <div style="font-size:13px;font-weight:800;color:#333;">更换背景</div>
            <button type="button" id="yd-ta-diary-settings-bg" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid #E5E5EA;background:#F9F9FB;font-size:14px;font-weight:800;color:#111;cursor:pointer;text-align:center;">打开相册选择</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;">
            <div style="font-size:13px;font-weight:800;color:#333;">补充预设</div>
            <div style="font-size:11px;color:#8E8E93;line-height:1.35;">可选。预设内容会追加到本次生成请求里面。</div>
            <textarea id="yd-ta-diary-preset-textarea" placeholder="例如：请使用字迹简单容易辨认的字体、多用蓝色系笔迹、少用一些涂改效果、口吻更简短……" style="width:100%;flex:1;min-height:200px;box-sizing:border-box;padding:10px 12px;border:1px solid #E5E5EA;border-radius:12px;font-size:12px;line-height:1.45;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#111;"></textarea>
          </div>
        </div>
        <div style="display:flex;gap:10px;padding:12px 14px;padding-bottom:max(12px, env(safe-area-inset-bottom));border-top:1px solid #EEE;flex-shrink:0;">
          <button type="button" id="yd-ta-diary-preset-restore" style="flex:1;padding:11px 12px;border-radius:12px;border:1px solid #E5E5EA;background:#fff;font-size:14px;font-weight:800;color:#333;cursor:pointer;">恢复默认</button>
          <button type="button" id="yd-ta-diary-preset-save" style="flex:1;padding:11px 12px;border-radius:12px;border:none;background:#7A9AB8;font-size:14px;font-weight:800;color:#fff;cursor:pointer;">保存补充</button>
        </div>
      </div>
    `;

    const close = () => {
      try {
        overlay.remove();
      } catch (e) {}
    };

    overlay.querySelector('[data-close-bg]')?.addEventListener('click', close);
    overlay.querySelector('#yd-ta-diary-settings-x')?.addEventListener('click', close);

    const ta = overlay.querySelector('#yd-ta-diary-preset-textarea');
    if (ta) {
      ta.value = this._getStoredUserOutputSupplement();
    }

    overlay.querySelector('#yd-ta-diary-settings-bg')?.addEventListener('click', () => {
      try {
        if (typeof Album !== 'undefined' && Album && typeof Album.openForDiaryBackground === 'function') {
          close();
          Album.openForDiaryBackground();
          return;
        }
        alert('相册模块未就绪，无法选择日记背景');
      } catch (e) {}
    });

    overlay.querySelector('#yd-ta-diary-preset-restore')?.addEventListener('click', async () => {
      const supKey = this._userSupplementStorageKey();
      if (ta) ta.value = '';
      if (supKey) {
        try {
          Storage.remove(supKey);
        } catch (e) {}
      }
      try {
        const bgKey = CONFIG?.STORAGE_KEYS?.TA_DIARY_BACKGROUND;
        if (bgKey) Storage.remove(bgKey);
      } catch (e) {}
      try {
        await this._applyBackgroundImage();
      } catch (e) {}
      alert('已清除补充预设并重置日记背景');
    });

    overlay.querySelector('#yd-ta-diary-preset-save')?.addEventListener('click', () => {
      const key = this._userSupplementStorageKey();
      if (!key) {
        alert('存储配置缺失，无法保存');
        return;
      }
      const raw = ta ? String(ta.value || '') : '';
      if (!raw.trim()) {
        try {
          Storage.remove(key);
        } catch (e) {}
        if (ta) ta.value = '';
        alert('已清空补充预设');
        return;
      }
      try {
        Storage.set(key, raw);
        alert('已保存，下次生成日记时会追加到用户消息');
      } catch (e) {
        alert(e?.message || '保存失败');
      }
    });

    document.body.appendChild(overlay);
    return Promise.resolve();
  },

  _cleanCodeFenceIfAny(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return s;
    if (s.startsWith('```')) {
      // 去掉首尾 ``` （允许 ```html 之类的语言标记）
      return s
        .replace(/^```[a-zA-Z]*\s*/g, '')
        .replace(/```$/g, '')
        .trim();
    }
    return s;
  },

  // 基础富文本净化：只允许很小的“日记正文”标签集合，移除危险属性
  _sanitizeHtml(raw) {
    let html = this._cleanCodeFenceIfAny(raw);
    html = String(html || '').trim();

    // 如果模型直接输出纯文本（无 HTML 标签），按段落包起来
    const looksLikeHtml = /<\s*[a-zA-Z]/.test(html);
    if (!looksLikeHtml) {
      const lines = html.split(/\n+/).map((x) => String(x).trim()).filter(Boolean);
      if (!lines.length) return '';
      return lines.map((line) => `<p>${this._escapeHtml(line)}</p>`).join('');
    }
    // 直通模式：保留模型输出的全部 HTML/属性/脚本
    return html;
  },

  _extractBraceBlock(css, openBraceIdx) {
    let depth = 0;
    for (let i = openBraceIdx; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) {
          return { inner: css.slice(openBraceIdx + 1, i), end: i + 1 };
        }
      }
    }
    return { inner: '', end: css.length };
  },

  _scopeDiarySelectorList(selectors, opts = {}) {
    const shadow = !!opts.shadow;
    const shadowRoot = '#ta-diary-shadow-content';
    const root = shadow ? shadowRoot : this._DIARY_CSS_SCOPE;
    return String(selectors || '')
      .split(',')
      .map((sel) => {
        const s = sel.trim();
        if (!s) return '';
        if (/^@/.test(s)) return s;
        if (/^(html|body|:root)\b/i.test(s)) return root;
        if (s === '*') return shadow ? `${shadowRoot} *` : `${root} *`;
        if (shadow) {
          // Shadow 内 .class / div 等已天然隔离，勿再加 #page-ta-diary（在 Shadow 里匹配不到）
          if (/^:host\b/.test(s)) return s.replace(/^:host\b/, shadowRoot);
          if (s.includes('#page-ta-diary') || s.includes('#ta-diary-rich')) {
            return s
              .replace(/#page-ta-diary\s+/g, '')
              .replace(/#ta-diary-rich\s+/g, `${shadowRoot} `)
              .replace(/#ta-diary-rich\b/g, shadowRoot)
              .trim();
          }
          return s;
        }
        if (s.includes('#page-ta-diary') || s.includes('#ta-diary-rich')) return s;
        return `${root} ${s}`;
      })
      .filter(Boolean)
      .join(', ');
  },

  _scopeDiaryCss(cssText, opts = {}) {
    const css = String(cssText || '');
    if (!css.trim()) return '';

    const out = [];
    let i = 0;
    const len = css.length;

    while (i < len) {
      while (i < len && /\s/.test(css[i])) i++;
      if (i >= len) break;

      if (css[i] === '@') {
        const semi = css.indexOf(';', i);
        const brace = css.indexOf('{', i);
        if (brace !== -1 && (semi === -1 || brace < semi)) {
          const block = this._extractBraceBlock(css, brace);
          const atText = css.slice(i, block.end);
          const atHead = atText.slice(0, atText.indexOf('{')).trim();

          if (/^@font-face\b/i.test(atHead) || /^@import\b/i.test(atHead) || /^@charset\b/i.test(atHead) || /^@keyframes\b/i.test(atHead)) {
            out.push(atText);
          } else if (/^@media\b/i.test(atHead)) {
            const open = atText.indexOf('{');
            const scopedInner = this._scopeDiaryCss(block.inner, opts);
            out.push(atText.slice(0, open + 1) + scopedInner + '}');
          } else {
            out.push(atText);
          }
          i = block.end;
        } else {
          const end = semi === -1 ? len : semi + 1;
          out.push(css.slice(i, end));
          i = end;
        }
        continue;
      }

      const brace = css.indexOf('{', i);
      if (brace === -1) {
        out.push(css.slice(i));
        break;
      }
      const selectorText = css.slice(i, brace).trim();
      const block = this._extractBraceBlock(css, brace);
      if (selectorText) {
        out.push(`${this._scopeDiarySelectorList(selectorText, opts)}{${block.inner}}`);
      }
      i = block.end;
    }

    return out.join('');
  },

  _splitDiaryEmbeddedAssets(html) {
    const raw = String(html || '');
    if (!raw.trim()) return { html: '', styleTexts: [], linkHrefs: [] };

    try {
      const doc = new DOMParser().parseFromString(`<div id="yd-diary-frag-root">${raw}</div>`, 'text/html');
      const root = doc.getElementById('yd-diary-frag-root');
      if (!root) return { html: raw, styleTexts: [], linkHrefs: [] };

      const styleTexts = [];
      root.querySelectorAll('style').forEach((node) => {
        styleTexts.push(node.textContent || '');
        node.remove();
      });

      const linkHrefs = [];
      root.querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="style"]').forEach((node) => {
        const href = String(node.getAttribute('href') || '').trim();
        if (href) linkHrefs.push(href);
        node.remove();
      });

      return { html: root.innerHTML, styleTexts, linkHrefs };
    } catch (e) {
      return { html: raw, styleTexts: [], linkHrefs: [] };
    }
  },

  _purgeDiaryGlobalLeaks() {
    try {
      document.querySelectorAll('head [data-yd-ta-diary], #ta-diary-head-fontface-style').forEach((el) => el.remove());
    } catch (e) {}

    const keepStyleIds = new Set(['yd-bubble-custom-style']);

    try {
      document.querySelectorAll('head > style').forEach((el) => {
        if (el.id && keepStyleIds.has(el.id)) return;
        if (el.hasAttribute('data-yd-ta-diary')) return;
        const text = el.textContent || '';
        if (/@font-face/i.test(text) && /\b(body|html|:root)\b/i.test(text) && /font-family/i.test(text)) {
          el.remove();
        }
      });
    } catch (e) {}

    try {
      document.querySelectorAll('head > link[rel="stylesheet"]').forEach((el) => {
        if (el.hasAttribute('data-yd-ta-diary')) return;
        const href = String(el.href || el.getAttribute('href') || '');
        if (/fonts\.googleapis\.com|fonts\.gstatic\.com|fontsource/i.test(href)) {
          el.remove();
        }
      });
    } catch (e) {}

    try {
      document.body.style.fontFamily = '';
      document.documentElement.style.fontFamily = '';
    } catch (e) {}
  },

  _mirrorDiaryFontCssUrl(href) {
    const s = String(href || '').trim();
    if (!s) return s;
    if (/fonts\.googleapis\.com/i.test(s)) {
      return s.replace(/fonts\.googleapis\.com/i, 'fonts.googleapis.cn');
    }
    return s;
  },

  _diaryShadowBaseCss() {
    return `
      :host {
        display: block;
        font-size: 18px;
        color: #444;
        text-align: justify;
        line-height: 1.85;
        white-space: normal;
        overflow-wrap: anywhere;
      }
      :host p { margin: 0 0 18px; }
      @media (max-width: 430px) {
        :host { font-size: 16px; line-height: 1.72; }
      }
    `;
  },

  _extractCssImportUrls(cssText) {
    const urls = [];
    const re = /@import\s+(?:url\(\s*)?['"]?([^'");\s]+)['"]?\s*\)?[^;]*;/gi;
    let m;
    while ((m = re.exec(String(cssText || ''))) !== null) {
      const u = String(m[1] || '').trim();
      if (u) urls.push(u);
    }
    return urls;
  },

  _stripCssImports(cssText) {
    return String(cssText || '').replace(/@import\s+(?:url\(\s*)?['"]?[^'");\s]+['"]?\s*\)?[^;]*;/gi, '').trim();
  },

  _uniqueDiaryUrls(list) {
    const out = [];
    (list || []).forEach((raw) => {
      const u = String(raw || '').trim();
      if (!u) return;
      if (!out.includes(u)) out.push(u);
    });
    return out;
  },

  _fontFamiliesFromGoogleCssUrl(href) {
    const out = [];
    try {
      const u = new URL(String(href || ''), window.location.href);
      if (!/fonts\.googleapis\.com|fonts\.googleapis\.cn|fonts\.loli\.net/i.test(u.hostname)) return out;
      const families = u.searchParams.getAll('family');
      families.forEach((raw) => {
        const name = decodeURIComponent(String(raw || '').split(':')[0].replace(/\+/g, ' ')).trim();
        if (name) out.push(name);
      });
    } catch (e) {}
    return out;
  },

  _diaryFontCssUrlCandidates(href) {
    const base = String(href || '').trim();
    if (!base) return [];
    const out = [base];
    if (/fonts\.googleapis\.com/i.test(base)) {
      out.push(base.replace(/fonts\.googleapis\.com/i, 'fonts.googleapis.cn'));
      out.push(base.replace(/fonts\.googleapis\.com/i, 'fonts.loli.net'));
    }
    return this._uniqueDiaryUrls(out);
  },

  _rewriteDiaryFontAssetUrls(cssText) {
    return String(cssText || '').replace(/https?:\/\/fonts\.gstatic\.com/gi, 'https://fonts.gstatic.cn');
  },

  _extractFontFaceRulesFromCss(cssText) {
    const faces = [];
    const s = String(cssText || '');
    let i = 0;
    while (i < s.length) {
      const idx = s.toLowerCase().indexOf('@font-face', i);
      if (idx === -1) break;
      const brace = s.indexOf('{', idx);
      if (brace === -1) break;
      const block = this._extractBraceBlock(s, brace);
      faces.push(s.slice(idx, block.end));
      i = block.end;
    }
    return faces.join('\n');
  },

  _stripFontFaceBlocks(cssText) {
    let css = String(cssText || '');
    let guard = 0;
    while (guard++ < 200) {
      const idx = css.toLowerCase().indexOf('@font-face');
      if (idx === -1) break;
      const brace = css.indexOf('{', idx);
      if (brace === -1) break;
      const block = this._extractBraceBlock(css, brace);
      css = css.slice(0, idx) + css.slice(block.end);
    }
    return css.trim();
  },

  _clearDiaryHeadFontAssets() {
    try {
      document.querySelectorAll('head link[data-yd-ta-diary="font"], #ta-diary-head-fontface-style').forEach((el) => el.remove());
    } catch (e) {}
  },

  _injectDiaryFontsToHead(fontUrls, inlineFontFaceCss) {
    const urls = this._uniqueDiaryUrls(fontUrls).map((u) => this._mirrorDiaryFontCssUrl(u));
    urls.forEach((href) => {
      const exists = Array.from(document.head.querySelectorAll('link[data-yd-ta-diary="font"]')).some((el) => {
        const attr = String(el.getAttribute('href') || '');
        return attr === href || String(el.href || '') === href;
      });
      if (exists) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-yd-ta-diary', 'font');
      document.head.appendChild(link);
    });

    const extra = String(inlineFontFaceCss || '').trim();
    let styleEl = document.getElementById('ta-diary-head-fontface-style');
    if (!extra) {
      if (styleEl) styleEl.textContent = '';
      return;
    }
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ta-diary-head-fontface-style';
      styleEl.setAttribute('data-yd-ta-diary', 'fontface');
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = extra;
  },

  async _fetchDiaryFontFaceCss(href) {
    const candidates = this._diaryFontCssUrlCandidates(href);
    for (const url of candidates) {
      try {
        const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
        if (!res.ok) continue;
        const raw = await res.text();
        const faces = this._extractFontFaceRulesFromCss(this._rewriteDiaryFontAssetUrls(raw));
        if (faces.trim()) return faces;
      } catch (e) {}
    }
    return '';
  },

  async _loadDiaryFontFaces(fontUrls) {
    const urls = this._uniqueDiaryUrls(fontUrls);
    if (!urls.length) return '';
    const chunks = await Promise.all(urls.map((u) => this._fetchDiaryFontFaceCss(u)));
    return chunks.filter(Boolean).join('\n');
  },

  async _preloadDiaryFontFamilies(fontUrls, scopedCss) {
    const names = [];
    (fontUrls || []).forEach((href) => {
      this._fontFamiliesFromGoogleCssUrl(href).forEach((n) => {
        if (n && !names.includes(n)) names.push(n);
      });
    });
    const re = /font-family\s*:\s*([^;}{]+)/gi;
    let m;
    while ((m = re.exec(String(scopedCss || ''))) !== null) {
      String(m[1] || '')
        .split(',')
        .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
        .filter((x) => x && !/^(inherit|initial|unset|cursive|serif|sans-serif|monospace)$/i.test(x))
        .forEach((n) => {
          if (!names.includes(n)) names.push(n);
        });
    }
    if (!names.length || typeof document === 'undefined' || !document.fonts?.load) return;
    await Promise.all(
      names.map(async (name) => {
        try {
          await document.fonts.load(`16px "${name}"`);
        } catch (e) {}
      })
    );
  },

  _buildDiaryFontFallbackCss(fontUrls, scopedCss) {
    if (/font-family\s*:/i.test(String(scopedCss || ''))) return '';
    const names = [];
    (fontUrls || []).forEach((href) => {
      this._fontFamiliesFromGoogleCssUrl(href).forEach((n) => {
        if (n && !names.includes(n)) names.push(n);
      });
    });
    if (!names.length) return '';
    const stack = names.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(', ');
    return `#ta-diary-shadow-content { font-family: ${stack}, cursive, sans-serif; }\n`;
  },

  _ensureDiaryShadowRoot(richEl) {
    if (!richEl) return null;
    if (richEl.shadowRoot) {
      const baseStyle = richEl.shadowRoot.querySelector('style[data-yd-ta-diary="base"]');
      if (baseStyle) baseStyle.textContent = this._diaryShadowBaseCss();
      this._ensureDiaryFontFaceStyle(richEl.shadowRoot);
      return richEl.shadowRoot;
    }

    const shadow = richEl.attachShadow({ mode: 'open' });
    const baseStyle = document.createElement('style');
    baseStyle.setAttribute('data-yd-ta-diary', 'base');
    baseStyle.textContent = this._diaryShadowBaseCss();

    const fontFaceStyle = document.createElement('style');
    fontFaceStyle.id = 'ta-diary-fontface-style';
    fontFaceStyle.setAttribute('data-yd-ta-diary', 'fontface');

    const modelStyle = document.createElement('style');
    modelStyle.id = 'ta-diary-model-style';
    modelStyle.setAttribute('data-yd-ta-diary', 'model');

    const content = document.createElement('div');
    content.id = 'ta-diary-shadow-content';

    shadow.append(baseStyle, fontFaceStyle, modelStyle, content);
    return shadow;
  },

  _ensureDiaryFontFaceStyle(shadow) {
    if (!shadow) return null;
    let el = shadow.getElementById('ta-diary-fontface-style');
    if (el) return el;
    el = document.createElement('style');
    el.id = 'ta-diary-fontface-style';
    el.setAttribute('data-yd-ta-diary', 'fontface');
    const modelStyle = shadow.getElementById('ta-diary-model-style');
    if (modelStyle) shadow.insertBefore(el, modelStyle);
    else shadow.appendChild(el);
    return el;
  },

  _renderDiaryRichHtml(richEl, html) {
    if (!richEl) return;

    const { html: bodyHtml, styleTexts, linkHrefs } = this._splitDiaryEmbeddedAssets(html);
    const shadow = this._ensureDiaryShadowRoot(richEl);
    if (!shadow) return;

    const contentEl = shadow.getElementById('ta-diary-shadow-content');
    const modelStyle = shadow.getElementById('ta-diary-model-style');
    const fontFaceStyle = this._ensureDiaryFontFaceStyle(shadow);
    if (!contentEl) return;

    const importUrls = [];
    let inlineFontFaceCss = '';
    const cssChunksForScope = [];
    styleTexts.forEach((t) => {
      importUrls.push(...this._extractCssImportUrls(t));
      const stripped = this._stripCssImports(t);
      inlineFontFaceCss += this._extractFontFaceRulesFromCss(stripped);
      cssChunksForScope.push(this._stripFontFaceBlocks(stripped));
    });
    const fontUrls = this._uniqueDiaryUrls([...(linkHrefs || []), ...importUrls]);

    let scopedCss = cssChunksForScope.map((t) => this._scopeDiaryCss(t, { shadow: true })).filter(Boolean).join('\n');
    scopedCss += this._buildDiaryFontFallbackCss(fontUrls, scopedCss);

    this._clearDiaryHeadFontAssets();
    this._injectDiaryFontsToHead(fontUrls, inlineFontFaceCss);
    if (fontFaceStyle) fontFaceStyle.textContent = '';
    shadow.querySelectorAll('link[data-yd-ta-diary="font"]').forEach((node) => node.remove());
    if (modelStyle) modelStyle.textContent = scopedCss;

    contentEl.innerHTML = bodyHtml;

    const loadToken = Date.now();
    richEl._ydDiaryFontLoadToken = loadToken;
    this._loadDiaryFontFaces(fontUrls)
      .then((faceCss) => {
        if (!richEl.isConnected || richEl._ydDiaryFontLoadToken !== loadToken) return;
        if (faceCss) {
          let styleEl = document.getElementById('ta-diary-head-fontface-style');
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'ta-diary-head-fontface-style';
            styleEl.setAttribute('data-yd-ta-diary', 'fontface');
            document.head.appendChild(styleEl);
          }
          const prev = String(styleEl.textContent || '').trim();
          styleEl.textContent = prev ? `${prev}\n${faceCss}` : faceCss;
        }
        return this._preloadDiaryFontFamilies(fontUrls, scopedCss);
      })
      .catch(() => {});
  },

  _clearDiaryRichHost(richEl) {
    if (!richEl) return;
    const contentEl = richEl.shadowRoot?.getElementById('ta-diary-shadow-content');
    if (contentEl) contentEl.innerHTML = '';
    const modelStyle = richEl.shadowRoot?.getElementById('ta-diary-model-style');
    if (modelStyle) modelStyle.textContent = '';
    const fontFaceStyle = richEl.shadowRoot?.getElementById('ta-diary-fontface-style');
    if (fontFaceStyle) fontFaceStyle.textContent = '';
    richEl.shadowRoot?.querySelectorAll('link[data-yd-ta-diary="font"]').forEach((node) => node.remove());
    richEl._ydDiaryFontLoadToken = 0;
    richEl.innerHTML = '';
  },

  _getDiaryIdForTs(characterId, createdAtTs) {
    const cid = String(characterId || '').trim();
    const ts = Number(createdAtTs || Date.now()) || Date.now();
    return cid ? `${this.STORAGE_ID_PREFIX}${cid}_${ts}` : `${this.STORAGE_ID_PREFIX}${ts}`;
  },

  async _loadDiaryEntries(characterId) {
    const all = await Storage.dbGetAll('notes');
    const cid = String(characterId || '').trim();
    const diaries = (all || []).filter((n) => {
      const k = String(n?.kind || '') === this.DIARY_KIND;
      if (!k) return false;
      if (!cid) return true;
      return String(n?.characterId || '') === cid;
    });
    diaries.sort((a, b) => (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0));
    return diaries;
  },

  async shiftEntry(delta) {
    const characterId = await this._getUsableCharacterId();
    const rows = await this._loadDiaryEntries(characterId);
    if (!rows.length) return;
    let idx = rows.findIndex((x) => String(x?.id || '') === String(this._currentEntryId || ''));
    if (idx < 0) idx = rows.length - 1;
    const nextIdx = Math.max(0, Math.min(rows.length - 1, idx + Number(delta || 0)));
    this._currentEntryId = String(rows[nextIdx]?.id || '');
    await this.loadDiaryAndRender();
  },

  _renderDirectoryListHtml(rows) {
    if (!rows.length) {
      return `<div style="padding:16px 12px;color:#999;font-size:13px;text-align:center;">还没有日记记录</div>`;
    }
    return rows
      .slice()
      .reverse()
      .map((n) => {
        const id = String(n?.id || '');
        const ts = Number(n?.createdAt || n?.updatedAt || Date.now()) || Date.now();
        const t = this._formatDateTimeTitle(ts);
        const active = id === String(this._currentEntryId || '');
        return `<div class="yd-ta-diary-directory-item" style="display:flex;align-items:center;gap:6px;padding:2px 0;">
          <button type="button" data-id="${this._escapeHtml(id)}" style="flex:1;min-width:0;text-align:left;border:none;background:${active ? 'rgba(255,107,0,0.10)' : 'transparent'};border-radius:10px;padding:10px 10px;cursor:pointer;">
            <div style="font-size:13px;font-weight:900;color:#111;">${this._escapeHtml(t)}</div>
          </button>
          <button type="button" data-delete-id="${this._escapeHtml(id)}" aria-label="删除日记" style="flex-shrink:0;border:none;background:transparent;color:#dc2626;font-size:12px;font-weight:700;padding:8px 10px;border-radius:8px;cursor:pointer;">删除</button>
        </div>`;
      })
      .join('');
  },

  _bindDirectoryListEvents(overlay, close) {
    Array.from(overlay.querySelectorAll('button[data-id]')).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = String(btn.getAttribute('data-id') || '');
        if (!id) return;
        this._currentEntryId = id;
        close();
        await this.loadDiaryAndRender();
      });
    });
    Array.from(overlay.querySelectorAll('button[data-delete-id]')).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = String(btn.getAttribute('data-delete-id') || '');
        if (!id) return;
        await this.deleteDiaryEntry(id, { directoryOverlay: overlay });
      });
    });
  },

  async deleteDiaryEntry(id, opts = {}) {
    const entryId = String(id || '').trim();
    if (!entryId) return false;

    const note = await Storage.dbGet('notes', entryId);
    if (!note || String(note?.kind || '') !== this.DIARY_KIND) return false;

    const ts = Number(note.createdAt || note.updatedAt || Date.now()) || Date.now();
    const title = this._formatDateTimeTitle(ts);
    const ok = confirm(`确定删除「${title}」这条日记吗？删除后不可恢复。`);
    if (!ok) return false;

    try {
      await Storage.dbDelete('notes', entryId);
    } catch (e) {
      console.error('[TaDiary] deleteDiaryEntry', e);
      alert('删除失败，请稍后重试');
      return false;
    }

    if (String(this._currentEntryId || '') === entryId) {
      this._currentEntryId = '';
    }
    await this.loadDiaryAndRender();

    const overlay = opts.directoryOverlay || document.getElementById('yd-ta-diary-directory');
    if (overlay) {
      const characterId = await this._getUsableCharacterId();
      const rows = await this._loadDiaryEntries(characterId);
      const listEl = overlay.querySelector('#yd-ta-diary-directory-list');
      if (listEl) {
        listEl.innerHTML = this._renderDirectoryListHtml(rows);
        this._bindDirectoryListEvents(overlay, () => {
          try { overlay.remove(); } catch (err) {}
        });
      }
    }
    return true;
  },

  async openDirectory() {
    const characterId = await this._getUsableCharacterId();
    const rows = await this._loadDiaryEntries(characterId);
    const old = document.getElementById('yd-ta-diary-directory');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-ta-diary-directory';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '1300';
    overlay.innerHTML = `
      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.42);"></div>
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(88vw,420px);max-height:min(70vh,620px);overflow:hidden;background:#fff;border-radius:14px;box-shadow:0 26px 60px rgba(0,0,0,0.35);display:flex;flex-direction:column;">
        <div style="height:46px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid #eee;">
          <div style="font-size:15px;font-weight:900;color:#111;">日记目录</div>
          <button type="button" id="yd-ta-diary-directory-close" style="border:none;background:transparent;font-size:22px;line-height:1;color:#666;cursor:pointer;">×</button>
        </div>
        <div id="yd-ta-diary-directory-list" style="padding:8px;overflow:auto;-webkit-overflow-scrolling:touch;flex:1;"></div>
      </div>
    `;
    const listEl = overlay.querySelector('#yd-ta-diary-directory-list');
    if (listEl) {
      listEl.innerHTML = this._renderDirectoryListHtml(rows);
    }
    const close = () => {
      try { overlay.remove(); } catch (e) {}
    };
    overlay.firstElementChild?.addEventListener('click', close);
    overlay.querySelector('#yd-ta-diary-directory-close')?.addEventListener('click', close);
    this._bindDirectoryListEvents(overlay, close);
    document.body.appendChild(overlay);
  },

  _renderDiary(note) {
    const richEl = document.getElementById('ta-diary-rich');
    const emptyEl = document.getElementById('ta-diary-empty');
    const titleEl = document.getElementById('ta-diary-title');
    const metaDateEl = document.getElementById('ta-diary-meta-date');
    const stampDateEl = document.getElementById('ta-diary-stamp-date');
    if (!richEl) return;

    if (!note || !String(note.content || '').trim()) {
      this._clearDiaryRichHost(richEl);
      richEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      const t = document.getElementById('ta-diary-current-time');
      if (t) t.textContent = '--';
      return;
    }

    richEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    this._renderDiaryRichHtml(richEl, this._sanitizeHtml(note.content));

    const dateKey = String(note.dateKey || '').trim();
    const ts = Number(note.createdAt || note.updatedAt || (dateKey ? Date.parse(dateKey) : Date.now()) || Date.now());
    const title = String(note.title || '').trim() || this._formatDateTitle(ts);

    if (titleEl) titleEl.textContent = title;
    if (metaDateEl) metaDateEl.textContent = title;

    if (dateKey) {
      const parts = dateKey.split('-');
      if (stampDateEl) {
        if (parts.length === 3) stampDateEl.textContent = `${parts[0]}.${parts[1]}.${parts[2]}`;
        else stampDateEl.textContent = title;
      }
    } else {
      if (stampDateEl) stampDateEl.textContent = title;
    }

    const t = document.getElementById('ta-diary-current-time');
    if (t) t.textContent = this._formatDateTimeTitle(ts);
  },

  // 应用“整图背景”：不影响纸张富文本渲染层，只改变背景图与装饰显示
  async _applyBackgroundImage() {
    const pageEl = document.getElementById('page-ta-diary');
    const bgEl = document.getElementById('ta-diary-bg');
    if (!pageEl || !bgEl || typeof Storage === 'undefined' || typeof CONFIG === 'undefined') return false;

    // 支持两种写法：
    // 1) string：直接是 dataURL 或 https://... 的图片链接
    // 2) { albumId }: 从 album 表取 data 字段
    const raw = Storage.get(CONFIG.STORAGE_KEYS.TA_DIARY_BACKGROUND);
    if (!raw) {
      // 默认背景也按“背景图层模式”处理，避免与自定义背景显示逻辑不一致
      pageEl.classList.add('yd-diary-page--bg-image');
      bgEl.style.backgroundImage = [
        'radial-gradient(1200px 420px at 8% -15%, rgba(255,247,222,0.58), transparent 62%)',
        'radial-gradient(1200px 520px at 90% -22%, rgba(255,235,196,0.46), transparent 64%)',
        'linear-gradient(180deg, #f6f2e8 0%, #efe8da 100%)'
      ].join(',');
      return true;
    }

    let bgUrl = '';
    if (typeof raw === 'string') {
      bgUrl = raw;
    } else if (raw && typeof raw === 'object' && raw.albumId) {
      try {
        const item = await Storage.dbGet('album', raw.albumId);
        bgUrl = item?.data || item?.imageData || '';
      } catch (e) {
        bgUrl = '';
      }
    }

    if (bgUrl && typeof bgUrl === 'string') {
      pageEl.classList.add('yd-diary-page--bg-image');
      bgEl.style.backgroundImage = `url(${bgUrl})`;
      return true;
    } else {
      pageEl.classList.remove('yd-diary-page--bg-image');
      bgEl.style.backgroundImage = 'none';
      return false;
    }
  },

  async loadDiaryAndRender() {
    const dateTs = Number(this._selectedDateTs || Date.now()) || Date.now();
    const now = dateTs;
    const dateKey = this._formatDateKey(now);
    this._lastRenderedDateKey = dateKey;

    let hasCustomBg = false;
    try {
      hasCustomBg = !!(await this._applyBackgroundImage());
    } catch (e) {
      hasCustomBg = false;
    }

    const characterId = await this._getUsableCharacterId();

    // 先渲染“日期信息”，即使还没有正文内容也能看到标题
    try {
      const title = this._formatDateTitle(now);
      const titleEl = document.getElementById('ta-diary-title');
      const metaDateEl = document.getElementById('ta-diary-meta-date');
      const stampDateEl = document.getElementById('ta-diary-stamp-date');
      if (titleEl) titleEl.textContent = title;
      if (metaDateEl) metaDateEl.textContent = title;
      if (stampDateEl && dateKey) stampDateEl.textContent = `${dateKey.replace(/-/g, '.')}`;
    } catch (e) {}

    await this._refreshHeaderRoleName();

    const rows = await this._loadDiaryEntries(characterId);
    if (!rows.length) {
      this._renderDiary(null);
      return;
    }
    let note = null;
    if (this._currentEntryId) {
      note = rows.find((x) => String(x?.id || '') === String(this._currentEntryId || '')) || null;
    }
    if (!note) note = rows[rows.length - 1] || null;
    this._currentEntryId = String(note?.id || '');
    this._renderDiary(note);
  },

  async _buildDiaryTask(characterId, dateTs) {
    if (typeof TaPages === 'undefined' || !TaPages || typeof TaPages._buildAiFeatureSpec !== 'function') {
      throw new Error('通用 AI 骨架不可用');
    }
    if (typeof TaPages._buildFeatureContextForCharacter !== 'function') {
      throw new Error('通用角色上下文不可用');
    }

    const cid = String(characterId || '').trim();
    if (!cid) return null;

    const context = await TaPages._buildFeatureContextForCharacter(cid, { maxMsgs: 56 });
    if (!context) return null;

    const { name, charProfile, chatTranscript } = context;
    const dateTitle = this._formatDateTitle(dateTs);

    const systemRoleAndGoal = [
      '你是「日记本」日记正文生成器。',
      '目标：根据角色设定与补充资料，生成指定日期的日记正文富文本（HTML 片段）。'
    ].join('\n');

    const systemCharacterContext = [
      `## 角色：${name}`,
      charProfile ? `## 角色设定（角色库）\n${charProfile}` : '## 角色设定（角色库）\n（未填写详情）'
    ].join('\n');

    const systemSupplementContext = [
      '## 补充资料：近期摘要与聊天上下文（与该角色相关；含会话摘要+摘录）',
      chatTranscript
    ].join('\n');

    const systemOutputContractAndExample = TA_DIARY_OUTPUT_PRESET_DEFAULT_LINES.join('\n');

    const userBase = [
      `为 ${dateTitle} 生成一篇日记正文。`,
      '正文主题：今天的一个小瞬间（看到的东西/听到的声音/一个小决定/小情绪变化）。',
      '输出必须是纯 HTML 片段，内容字体必须使用手写感很强的字体，必须需要引用外部字体使用。直接给内容。'
    ].join('\n');

    const userExtra = this._getUserSupplementForRequest();
    const userMessage = userExtra
      ? `${userBase}\n\n【用户补充要求】\n${userExtra}`
      : userBase;

    return {
      spec: TaPages._buildAiFeatureSpec({
        systemMessages: [
          systemRoleAndGoal,
          systemCharacterContext,
          systemSupplementContext,
          systemOutputContractAndExample
        ],
        userMessage,
        parse: (raw) => this._sanitizeHtml(raw)
      })
    };
  },

  async generateDiary(opts = {}) {
    this._inFlight = true;
    const btn = document.getElementById('ta-diary-refresh');
    const hadBtn = !!btn;
    if (hadBtn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
    }

    try {
      if (typeof TaPages === 'undefined' || !TaPages || typeof TaPages._runAiFeatureTask !== 'function') {
        throw new Error('AI 能力不可用：TaPages 未就绪');
      }

      const characterId = await this._getUsableCharacterId();
      if (!characterId) throw new Error('暂无可用角色，请先创建角色');

      const dateTs = Number(opts.dateTs || this._selectedDateTs || Date.now()) || Date.now();
      const dateKey = this._formatDateKey(dateTs);
      const dateTitle = this._formatDateTitle(dateTs);
      const createdAt = Date.now();
      const diaryId = this._getDiaryIdForTs(characterId, createdAt);

      const task = await this._buildDiaryTask(characterId, dateTs);
      if (!task || !task.spec) throw new Error('日记任务构造失败');

      const { parsed } = await TaPages._runAiFeatureTask(task.spec);
      if (!String(parsed || '').trim()) {
        throw new Error('AI 返回的富文本内容为空');
      }

      const note = {
        id: diaryId,
        kind: this.DIARY_KIND,
        characterId,
        title: dateTitle,
        dateKey,
        content: String(parsed || ''),
        createdAt,
        updatedAt: Date.now()
      };

      await Storage.dbPut('notes', note);
      this._currentEntryId = diaryId;
      await this.loadDiaryAndRender();
    } catch (e) {
      console.error('[TaDiary] generateDiary', e);
      alert(e?.message || '生成失败，请检查网络与 API 配置');
    } finally {
      this._inFlight = false;
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        btn.removeAttribute('aria-busy');
      }
    }
  }
};

/**
 * 助手 plain 段：Markdown → HTML，经 DOMPurify 白名单消毒。
 * 依赖全局 marked、DOMPurify（由 index.html CDN 引入）。
 */
const MarkdownPlain = {
  _escape(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _isQuoteBeautifyEnabled() {
    try {
      if (typeof Storage === 'undefined' || typeof CONFIG === 'undefined') return false;
      const raw = Storage.get(CONFIG.STORAGE_KEYS.CHAT_QUOTE_BEAUTIFY_ENABLED);
      if (raw == null) return true;
      const s = String(raw).toLowerCase();
      return s === '1' || s === 'true';
    } catch (e) {
      return false;
    }
  },

  _beautifyQuotesInHtml(html) {
    const src = String(html || '');
    if (!src || typeof document === 'undefined') return src;
    const tpl = document.createElement('template');
    tpl.innerHTML = src;
    const blockedTags = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEXTAREA']);
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
    const toPatch = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node || !node.parentElement) continue;
      if (blockedTags.has(node.parentElement.tagName)) continue;
      if (node.parentElement.closest && node.parentElement.closest('pre, code, script, style, textarea')) continue;
      const text = String(node.nodeValue || '');
      if (!/[“”"]/.test(text)) continue;
      toPatch.push(node);
    }
    toPatch.forEach((node) => {
      const text = String(node.nodeValue || '');
      const pairRe = /“[^”]+”|"[^"]+"/g;
      let m;
      let last = 0;
      let hasAny = false;
      const frag = document.createDocumentFragment();
      while ((m = pairRe.exec(text)) !== null) {
        hasAny = true;
        const start = m.index;
        const end = start + m[0].length;
        if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
        const span = document.createElement('span');
        span.className = 'yd-quote-beautify';
        span.textContent = m[0];
        frag.appendChild(span);
        last = end;
      }
      if (!hasAny) return;
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    });
    return tpl.innerHTML;
  },

  _enhanceSoftBreaksInHtml(html) {
    const src = String(html || '');
    if (!src || typeof document === 'undefined') return src;
    const tpl = document.createElement('template');
    tpl.innerHTML = src;
    const brs = Array.from(tpl.content.querySelectorAll('br'));
    brs.forEach((br) => {
      if (!br) return;
      // 避免影响代码块/预格式化区域
      const p = br.parentElement;
      if (!p) return;
      if (p.closest && p.closest('pre, code, script, style, textarea')) return;
      const sp = document.createElement('span');
      sp.className = 'yd-md-softbreak';
      // 使用空高元素来模拟“段落感”的软换行间距
      // （比直接给 br 设置 margin 更稳定，也避免一些 CSS 校验警告）
      br.replaceWith(sp);
    });
    return tpl.innerHTML;
  },

  /**
   * @param {string} raw 原始正文（不进 _formatMessageLineBreaksForDisplay，以免破坏列表/代码块换行）
   * @returns {{ html: string }}
   */
  renderAssistantPlainMarkdown(raw) {
    const s = SCUI.normalizeMath(raw)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const __dbg = (() => {
      try { return !!(typeof window !== 'undefined' && window.__YD_DEBUG_MD_RENDER); } catch (e) { return false; }
    })();

    if (__dbg) {
      try {
        const pick = (x) => {
          const t = String(x || '').replace(/\s+/g, ' ').trim();
          return t.length > 180 ? `${t.slice(0, 180)}…` : t;
        };
        console.log('[md-plain] input', {
          len: s.length,
          hasFence: /```/.test(s),
          hasHtmlTag: /<html\b/i.test(s),
          hasStyleTag: /<style\b/i.test(s),
          preview: pick(s)
        });
      } catch (e) {}
    }

    if (typeof marked === 'undefined') {
      return { html: `<p>${MarkdownPlain._escape(s).replace(/\n/g, '<br>')}</p>` };
    }

    try {
      // 当内容本身就是 HTML 模板（且非 fenced code）时，绕过 Markdown 解析，
      // 避免 marked 将大段缩进/样式片段误识别为 <pre><code> 代码块。
      const looksLikeHtmlTemplate = (() => {
        const t = s.trim();
        if (!t) return false;
        if (/^```/.test(t)) return false;
        if (t[0] !== '<') return false;
        return /<([a-zA-Z][\w:-]*)(\s[^>]*)?>/.test(t);
      })();

      const dirty =
        looksLikeHtmlTemplate
          ? s
          : (typeof marked.parse === 'function'
              ? marked.parse(s, { async: false, gfm: true, breaks: true })
              : String(s));
      if (__dbg) {
        try {
          console.log('[md-plain] marked', {
            bypassedMarked: looksLikeHtmlTemplate,
            hasPreCode: /<pre><code/i.test(String(dirty || '')),
            hasHtmlTag: /<html\b/i.test(String(dirty || '')),
            hasStyleTag: /<style\b/i.test(String(dirty || ''))
          });
        } catch (e) {}
      }

      // 用户要求：完全不清洗，直接放行渲染内容。
      let decoded = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(String(dirty || '')) : MarkdownPlain._escape(s);
      // 双引号美化仅作用于“正文 Markdown 渲染路径”，不处理原生 HTML 模板输入。
      if (!looksLikeHtmlTemplate && MarkdownPlain._isQuoteBeautifyEnabled()) {
        decoded = MarkdownPlain._beautifyQuotesInHtml(decoded);
      }
      // soft line break（<br>）增加一点段落感：仅 Markdown 路径
      if (!looksLikeHtmlTemplate) {
        decoded = MarkdownPlain._enhanceSoftBreaksInHtml(decoded);
      }
      if (__dbg) {
        try {
          console.log('[md-plain] out', {
            hasPreCode: /<pre><code/i.test(String(decoded || '')),
            hasStyleTag: /<style\b/i.test(String(decoded || '')),
            preview: String(decoded || '').slice(0, 180)
          });
        } catch (e) {}
      }
      return { html: decoded && decoded.trim() ? decoded : `<p>${MarkdownPlain._escape(s)}</p>` };
    } catch (e) {
      return { html: `<p>${MarkdownPlain._escape(s)}</p>` };
    }
  }
};

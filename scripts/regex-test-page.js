// 正则测试：独立全屏页，聊天消息区 + 底部输入框

const RegexTestPage = {
  selectedRule: null,
  testInput: '',

  escapeHtml(str) {
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },

  _truncate(s, n) {
    const t = String(s || '').trim();
    if (t.length <= n) return t;
    return t.slice(0, n) + '…';
  },

  init() {
    document.getElementById('regex-test-back')?.addEventListener('click', () => this.goBack());
    document.getElementById('regex-test-pick-rule')?.addEventListener('click', () => {
      void this.openPickRuleModal();
    });
    document.getElementById('regex-test-send')?.addEventListener('click', () => this.handleSend());
    document.getElementById('regex-test-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    window.addEventListener('yd:pagechange', (e) => {
      const to = e && e.detail ? e.detail.to : '';
      if (to === 'page-regex-test') void this.onShow();
    });
  },

  goBack() {
    const back = State.regexTestReturnPage || 'page-global-regex';
    State.regexTestReturnPage = null;
    State.regexTestInitialRule = null;
    this.selectedRule = null;
    this.testInput = '';
    if (typeof State.switchPage === 'function') State.switchPage(back);
  },

  async onShow() {
    const init = State.regexTestInitialRule;
    State.regexTestInitialRule = null;

    if (init && typeof init === 'object' && String(init.pattern || '').trim()) {
      const flagsRaw = String(init.flags || 'g').trim() || 'g';
      const flags = flagsRaw.replace(/[^gimsuy]/gi, '') || 'g';
      this.selectedRule = {
        pattern: String(init.pattern || ''),
        flags,
        replacement: init.replacement != null ? String(init.replacement) : '',
        label: String(init.label || '已选规则')
      };
    } else {
      this.selectedRule = null;
    }
    this.testInput = '';
    const input = document.getElementById('regex-test-input');
    if (input) input.value = '';
    this._updateFooterLabels();
    this._showPlaceholder();

    try {
      if (typeof Chat !== 'undefined' && typeof Chat.loadChatBackground === 'function') {
        await Chat.loadChatBackground();
      }
    } catch (e) {}
    const src = document.getElementById('chat-background');
    const dst = document.getElementById('regex-test-background');
    if (src && dst) {
      dst.style.backgroundImage = src.style.backgroundImage || '';
      dst.style.backgroundSize = 'cover';
      dst.style.backgroundPosition = 'center';
      dst.style.backgroundRepeat = 'no-repeat';
    }
  },

  _updateFooterLabels() {
    const pickBtn = document.getElementById('regex-test-pick-rule');
    if (pickBtn) {
      const label = this.selectedRule ? this._truncate(this.selectedRule.label, 16) : '选择正则';
      pickBtn.textContent = label;
    }
  },

  _showPlaceholder() {
    const scroll = document.getElementById('regex-test-scroll');
    if (!scroll) return;
    scroll.innerHTML = `<div class="yd-regex-test-empty-hint">在底部先「选择正则」，再输入测试内容并发送，将仅套用所选<strong>一条</strong>规则替换，并在下方按<strong>角色方消息</strong>样式显示解析效果。</div>`;
  },

  handleSend() {
    const input = document.getElementById('regex-test-input');
    this.testInput = input ? String(input.value || '') : '';
    this._tryRender();
  },

  _applyOneRule(text) {
    const rawPattern = String(this.selectedRule.pattern || '').trim();
    const rawFlags = String(this.selectedRule.flags || 'g').trim() || 'g';
    const parsed = (() => {
      const src = String(rawPattern || '').trim();
      const fallbackFlags = String(rawFlags || '').replace(/[^gimsuy]/gi, '') || 'g';
      if (src.length >= 2 && src[0] === '/') {
        let end = -1;
        let escaped = false;
        for (let i = src.length - 1; i > 0; i--) {
          const ch = src[i];
          if (ch === '/' && !escaped) { end = i; break; }
          escaped = (ch === '\\') ? !escaped : false;
        }
        if (end > 0) {
          const body = src.slice(1, end);
          const f = src.slice(end + 1).trim().replace(/[^gimsuy]/gi, '') || fallbackFlags;
          return { pattern: body, flags: f || 'g' };
        }
      }
      return { pattern: src, flags: fallbackFlags };
    })();
    const rep =
      this.selectedRule.replacement != null ? String(this.selectedRule.replacement) : '';
    if (!parsed.pattern) {
      return { error: '规则缺少匹配正则' };
    }
    try {
      const re = new RegExp(parsed.pattern, parsed.flags || 'g');
      return { text: String(text).replace(re, rep) };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) };
    }
  },

  _tryRender() {
    if (!this.selectedRule) {
      window.alert('请先选择正则');
      return;
    }
    if (this.testInput === null || this.testInput === undefined || this.testInput === '') {
      window.alert('请先输入测试内容');
      return;
    }
    const r = this._applyOneRule(this.testInput);
    if (r.error) {
      window.alert('替换失败：' + r.error);
      return;
    }
    this._renderAssistantMessages(r.text);
    const wrap = document.getElementById('regex-test-messages');
    if (wrap) {
      requestAnimationFrame(() => {
        wrap.scrollTop = wrap.scrollHeight;
      });
    }
  },

  _renderAssistantMessages(afterText) {
    const scroll = document.getElementById('regex-test-scroll');
    if (!scroll) return;
    scroll.innerHTML = '';

    const after = String(afterText ?? '');

    const appendHtml = (html) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      while (tmp.firstChild) {
        scroll.appendChild(tmp.firstChild);
      }
    };

    /** 纯文本段：走协议解析 + 气泡预览（与聊天一致，不含 ```html 块） */
    const renderTextChunk = (chunk) => {
      const t = String(chunk || '');
      if (!t.trim()) return;
      let msgs = [];
      if (typeof MessageParser !== 'undefined' && typeof MessageParser.parse === 'function') {
        try {
          msgs = MessageParser.parse(t, false) || [];
        } catch (e) {
          msgs = [];
        }
      }
      if (typeof MessageParser.mergeConsecutivePlain === 'function' && msgs && msgs.length) {
        msgs = MessageParser.mergeConsecutivePlain(msgs);
      }
      if (!msgs.length) {
        const plain = document.createElement('div');
        plain.className = 'yd-message__plain yd-message__plain--md';
        plain.style.whiteSpace = 'normal';
        if (typeof MarkdownPlain !== 'undefined' && typeof MarkdownPlain.renderAssistantPlainMarkdown === 'function') {
          plain.innerHTML = MarkdownPlain.renderAssistantPlainMarkdown(t).html;
        } else {
          plain.className = 'yd-message__plain';
          plain.style.whiteSpace = 'pre-wrap';
          plain.textContent = t;
        }
        scroll.appendChild(plain);
        return;
      }
      msgs.forEach((m) => {
        if (!m) return;
        if (m.type === 'plain') {
          const plain = document.createElement('div');
          plain.className = 'yd-message__plain yd-message__plain--md';
          plain.style.whiteSpace = 'normal';
          if (typeof MarkdownPlain !== 'undefined' && typeof MarkdownPlain.renderAssistantPlainMarkdown === 'function') {
            plain.innerHTML = MarkdownPlain.renderAssistantPlainMarkdown(m.content || '').html;
          } else {
            plain.className = 'yd-message__plain';
            plain.style.whiteSpace = 'pre-wrap';
            plain.textContent = m.content || '';
          }
          scroll.appendChild(plain);
        } else if (typeof Chat !== 'undefined' && typeof Chat.buildProtocolPreviewHtml === 'function') {
          const h = Chat.buildProtocolPreviewHtml(m);
          if (h) appendHtml(h);
        }
      });
    };

    // 与聊天相同：先切 ```html ... ```，HTML 段用 iframe 渲染，其余再交给 MessageParser
    if (typeof Chat !== 'undefined' && typeof Chat._parseMixedContent === 'function') {
      const mixed = Chat._parseMixedContent(after);
      mixed.forEach((seg) => {
        if (!seg) return;
        if (seg.type === 'html' && String(seg.content || '').trim()) {
          if (typeof Chat._createHtmlIframe === 'function') {
            const htmlWrap = document.createElement('div');
            htmlWrap.className = 'yd-message__html-wrap';
            htmlWrap.appendChild(Chat._createHtmlIframe(seg.content));
            scroll.appendChild(htmlWrap);
          } else {
            renderTextChunk(seg.content);
          }
        } else if (seg.type === 'text') {
          renderTextChunk(seg.content);
        }
      });
      return;
    }

    renderTextChunk(after);
  },

  async _collectAllRules() {
    const out = [];
    const entries =
      typeof GlobalRegexConverter !== 'undefined' ? GlobalRegexConverter.getEntries() : [];
    entries.forEach((e, i) => {
      out.push({
        pattern: String(e.pattern || ''),
        flags: String(e.flags || 'g').trim() || 'g',
        replacement: e.replacement != null ? String(e.replacement) : '',
        label: `[全局 ${i + 1}] ${
          typeof GlobalRegexPage !== 'undefined' && GlobalRegexPage._titleForEntry
            ? GlobalRegexPage._titleForEntry(e)
            : '规则'
        }`
      });
    });

    if (typeof GlobalRegexPage !== 'undefined' && GlobalRegexPage.loadCharacterRegexSections) {
      try {
        const secs = await GlobalRegexPage.loadCharacterRegexSections();
        secs.forEach((sec) => {
          sec.entries.forEach((det) => {
            const find = String(det.findRegex || '').trim();
            out.push({
              pattern: find,
              flags: 'g',
              replacement: String(det.replaceString || ''),
              label: `[角色 · ${sec.characterName}] ${det.title || '规则'}`
            });
          });
        });
      } catch (e) {
        console.warn('[RegexTestPage] loadCharacterRegexSections', e);
      }
    }

    return out;
  },

  async openPickRuleModal() {
    const options = await this._collectAllRules();
    if (!options.length) {
      window.alert('暂无可选规则（请先在「全局替换」或角色扩展里添加）');
      return;
    }

    const existing = document.getElementById('yd-regex-test-pick-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-regex-test-pick-modal';
    modal.className = 'yd-forum-picker';
    const listHtml = options
      .map(
        (opt, idx) =>
          `<button type="button" class="yd-regex-test-rule-row" data-rule-idx="${idx}">${this.escapeHtml(opt.label)}</button>`
      )
      .join('');

    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">选择正则</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <div class="yd-regex-test-rule-list">${listHtml}</div>
      </div>
    `;

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    modal.querySelectorAll('.yd-regex-test-rule-row').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = Number(row.getAttribute('data-rule-idx'));
        const opt = options[idx];
        if (opt) {
          const flagsRaw = String(opt.flags || 'g').trim() || 'g';
          const flags = flagsRaw.replace(/[^gimsuy]/gi, '') || 'g';
          this.selectedRule = {
            pattern: opt.pattern,
            flags,
            replacement: opt.replacement != null ? String(opt.replacement) : '',
            label: opt.label
          };
          this._updateFooterLabels();
          this._tryRender();
        }
        close();
      });
    });

    document.body.appendChild(modal);
  },

};

RegexTestPage.init();

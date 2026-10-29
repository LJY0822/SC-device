// 晒图：stories + feed（使用相册图片模拟）
const Share = {
  init() {
    document.getElementById('share-back')?.addEventListener('click', () => {
      State.backToHome();
    });

    document.getElementById('share-switch')?.addEventListener('click', () => {
      this._toggleStoriesFeed();
    });

    window.addEventListener('yd:pagechange', (e) => {
      const to = e?.detail?.to;
      if (to === 'page-share') {
        this.render();
      }
    });
  },

  async render() {
    await this.renderStories();
    await this.renderFeed();

    // render 完之后再根据当前滚动位置决定“当前停在哪个区”，便于图标点击时切换正确方向
    this._syncSwitchModeFromScroll();
    this._applySwitchState();
  },

  _syncSwitchModeFromScroll() {
    const stories = document.getElementById('share-stories');
    const feed = document.getElementById('share-feed');
    const content = document.querySelector('#page-share .yd-share-content');
    if (!stories || !feed || !content) return;

    // 简单判断：如果滚动过了一点，认为用户在 feed 区
    this._mode = content.scrollTop > 160 ? 'feed' : 'stories';
  },

  _applySwitchState() {
    const btn = document.getElementById('share-switch');
    if (!btn) return;

    const mode = this._mode || 'stories';
    // aria-label 表示“点击后将切换到哪里”
    btn.setAttribute('aria-label', mode === 'stories' ? '切换到动态' : '切换到故事');
    btn.title = mode === 'stories' ? '切换到动态' : '切换到故事';
  },

  _toggleStoriesFeed() {
    const stories = document.getElementById('share-stories');
    const feed = document.getElementById('share-feed');
    if (!stories || !feed) return;

    const mode = this._mode || 'stories';
    if (mode === 'stories') {
      feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this._mode = 'feed';
    } else {
      stories.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this._mode = 'stories';
    }
    this._applySwitchState();
  },

  async renderStories() {
    const el = document.getElementById('share-stories');
    if (!el) return;
    const charsRaw = await Storage.dbGetAll('characters');
    const chars = (charsRaw || []).map(c => this._normChar(c)).filter(c => c && c.id);
    const list = chars.slice(0, 12);

    if (!list.length) {
      el.innerHTML = `<div style="color:#8E8E93;font-size:13px;padding:6px 2px;">暂无角色故事</div>`;
      return;
    }

    el.innerHTML = list.map(c => {
      const avatar = c.avatar
        ? `<img src="${this._esc(c.avatar)}" alt="${this._esc(c.name)}">`
        : '';
      const fallback = c.avatar ? '' : '👤';
      return `
        <div class="yd-share-story">
          <div class="yd-share-story__ring">
            <div class="yd-share-story__avatar">${avatar || fallback}</div>
          </div>
          <div class="yd-share-story__name">${this._esc(c.name || '角色')}</div>
        </div>
      `;
    }).join('');
  },

  async renderFeed() {
    const el = document.getElementById('share-feed');
    if (!el) return;

    const album = await Storage.dbGetAll('album');
    const pics = (album || []).filter(a => a && a.data && String(a.data).startsWith('data:image/'));
    const charsRaw = await Storage.dbGetAll('characters');
    const chars = (charsRaw || []).map(c => this._normChar(c)).filter(c => c && c.id);
    const author = chars[0] || { name: '用户', avatar: '' };

    if (!pics.length) {
      el.innerHTML = `
        <div class="yd-empty" style="padding:28px 0;">
          <div class="yd-empty__icon">🖼️</div>
          <div class="yd-empty__text">相册里暂无图片，先去相册上传几张</div>
        </div>
      `;
      return;
    }

    const pick = pics.slice(0, 12);
    el.innerHTML = pick.map((p, idx) => {
      const avatarHtml = author.avatar
        ? `<img src="${this._esc(author.avatar)}" alt="${this._esc(author.name)}">`
        : '👤';
      const likes = 20 + (idx * 7) % 380;
      const time = this._formatTime(Date.now() - idx * 3600 * 1000);
      const caption = (p.description || p.name || '').trim() || '📷';
      return `
        <div class="yd-share-post">
          <div class="yd-share-post__header">
            <div class="yd-share-post__user">
              <div class="yd-share-post__avatar">${avatarHtml}</div>
              <div class="yd-share-post__name">${this._esc(author.name || '用户')}</div>
            </div>
            <button class="yd-share-post__more" type="button" aria-label="更多">···</button>
          </div>
          <div class="yd-share-post__media" data-src="${this._esc(p.data)}">
            <img src="${this._esc(p.data)}" alt="照片">
          </div>
          <div class="yd-share-post__actions">
            <div class="yd-share-post__actions-left">
              <button class="yd-share-icon-btn" type="button" aria-label="喜欢">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s-7-4.6-9.5-8.9C.8 8.7 3 6 6.2 6c1.8 0 3.1 1 3.8 2 0 0 1.3-2 3.8-2C17 6 19.2 8.7 21.5 12.1 19 16.4 12 21 12 21z"/></svg>
              </button>
              <button class="yd-share-icon-btn" type="button" aria-label="评论">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5h16v12H7l-3 3V5z"/></svg>
              </button>
              <button class="yd-share-icon-btn" type="button" aria-label="分享">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>
              </button>
            </div>
            <button class="yd-share-icon-btn" type="button" aria-label="收藏">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3h10a2 2 0 0 1 2 2v17l-7-4-7 4V5a2 2 0 0 1 2-2z"/></svg>
            </button>
          </div>
          <div class="yd-share-post__meta">
            <div class="yd-share-post__likes">${likes} 次赞</div>
            <div class="yd-share-post__caption"><b>${this._esc(author.name || '用户')}</b> ${this._esc(caption)}</div>
            <div class="yd-share-post__time">${this._esc(time)}</div>
          </div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.yd-share-post__media').forEach(wrap => {
      wrap.addEventListener('click', () => {
        const src = wrap.getAttribute('data-src');
        if (src && typeof Character !== 'undefined' && Character.openImageViewer) {
          Character.openImageViewer(src, '图片预览', { showChange: false });
        }
      });
    });
  },

  _normChar(raw) {
    const base = (raw && typeof raw === 'object') ? raw : {};
    const inner = (base.data && typeof base.data === 'object') ? base.data : {};
    return {
      id: base.id ?? inner.id ?? null,
      name: inner.name ?? base.name ?? '',
      avatar: inner.avatar ?? base.avatar ?? ''
    };
  },

  _formatTime(ts) {
    const d = new Date(Number(ts || Date.now()));
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
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

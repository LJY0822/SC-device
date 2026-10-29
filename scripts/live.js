// 直播：上下滑直播流 + 直播间
const Live = {
  _rooms: [],
  _currentRoom: null,
  _commentTimer: null,

  async init() {
    document.getElementById('live-back')?.addEventListener('click', () => {
      State.backToHome();
    });
    document.getElementById('live-room-close')?.addEventListener('click', () => {
      this.closeRoom();
    });
    document.getElementById('live-room-send')?.addEventListener('click', () => {
      this.sendComment();
    });
    document.getElementById('live-room-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendComment();
    });

    window.addEventListener('yd:pagechange', async (e) => {
      const to = e?.detail?.to;
      if (to === 'page-live') {
        await this.renderFeed();
      }
      if (to !== 'page-live-room') {
        this._stopAutoComments();
      }
    });
  },

  async renderFeed() {
    const feed = document.getElementById('live-feed');
    if (!feed) return;

    const charactersRaw = await Storage.dbGetAll('characters');
    const characters = (charactersRaw || []).map(c => this._normalizeCharacter(c)).filter(c => c && c.id && c.name);
    const album = await Storage.dbGetAll('album');
    const pics = (album || []).filter(a => a && a.data && String(a.data).startsWith('data:image/'));

    // 生成房间：若无角色，则生成 6 个匿名房间
    const baseRooms = (characters.length ? characters : new Array(6).fill(0).map((_, i) => ({
      id: `guest_${i}`,
      name: `主播${i + 1}`,
      avatar: ''
    })));

    const ratios = ['16/9', '3/2', '1/1', '9/16'];
    this._rooms = baseRooms.slice(0, 20).map((c, idx) => {
      const pic = pics.length ? pics[(idx * 7) % pics.length] : null;
      const isLive = Math.random() > 0.35;
      const ratio = ratios[(idx + Math.floor(Math.random() * ratios.length)) % ratios.length];
      return {
        id: `live_${c.id}_${idx}`,
        anchor: c,
        isLive,
        title: this._mockTitle(c.name),
        image: pic ? pic.data : this._fallbackImage(idx),
        ratio
      };
    });

    feed.innerHTML = '';
    this._rooms.forEach((room) => {
      const card = document.createElement('div');
      card.className = 'yd-live-card';

      const media = document.createElement('div');
      media.className = 'yd-live-media';

      media.innerHTML = `
        <img src="${this._esc(room.image)}" alt="直播封面">
        <div class="yd-live-overlay"></div>
        <button class="yd-live-enter" type="button" data-enter="1">
          <span class="yd-live-eq" aria-hidden="true"><span></span><span></span><span></span></span>
          点击进入直播间
        </button>
        <div class="yd-live-info">
          <div class="yd-live-badge ${room.isLive ? 'yd-live-badge--on' : ''}">${room.isLive ? '直播中' : '未开播'}</div>
          <div class="yd-live-name">@${this._esc(room.anchor.name)}</div>
          <div class="yd-live-title">${this._esc(room.title)}</div>
        </div>
      `;

      media.querySelector('[data-enter="1"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openRoom(room);
      });

      card.appendChild(media);
      feed.appendChild(card);
    });
  },

  openRoom(room) {
    const page = document.getElementById('page-live-room');
    if (!page) return;
    this._currentRoom = room;

    // 背景图
    const bg = document.getElementById('live-room-bg');
    if (bg) bg.style.backgroundImage = `url(${room.image})`;

    // 主播头像/名称
    const avatarEl = document.getElementById('live-room-anchor-avatar');
    const nameEl = document.getElementById('live-room-anchor-name');
    if (avatarEl) {
      if (room.anchor.avatar) avatarEl.innerHTML = `<img src="${this._esc(room.anchor.avatar)}" alt="${this._esc(room.anchor.name)}">`;
      else avatarEl.textContent = '👤';
    }
    if (nameEl) nameEl.textContent = room.anchor.name;

    // 观众头像（随机 3 个）
    const viewersEl = document.getElementById('live-room-viewers');
    if (viewersEl) {
      viewersEl.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const v = document.createElement('div');
        v.className = 'yd-live-room__viewer';
        v.textContent = ['😀', '😺', '🧑', '👩', '🧒'][Math.floor(Math.random() * 5)];
        viewersEl.appendChild(v);
      }
    }

    // 人数
    const countEl = document.getElementById('live-room-count');
    const count = room.isLive ? this._randInt(88, 24000) : this._randInt(0, 120);
    if (countEl) countEl.textContent = `${count}`;

    // 评论初始化
    const commentsEl = document.getElementById('live-room-comments');
    if (commentsEl) commentsEl.innerHTML = '';
    this._seedComments();
    this._startAutoComments();

    // 切页
    page.hidden = false;
    State.switchPage('page-live-room');
  },

  closeRoom() {
    const page = document.getElementById('page-live-room');
    if (page) page.hidden = true;
    this._currentRoom = null;
    this._stopAutoComments();
    State.switchPage('page-live');
  },

  sendComment() {
    const input = document.getElementById('live-room-input');
    if (!input) return;
    const text = String(input.value || '').trim();
    if (!text) return;
    input.value = '';
    this._appendComment('我', text);
  },

  _seedComments() {
    const names = ['小橘子', '阿星', '可可', '路人甲', '甜豆', '小雨'];
    const texts = ['来了来了', '主播太会了', '这图好美', '哈哈哈哈', '求关注', '今天状态不错'];
    for (let i = 0; i < 5; i++) {
      this._appendComment(names[this._randInt(0, names.length - 1)], texts[this._randInt(0, texts.length - 1)]);
    }
  },

  _startAutoComments() {
    this._stopAutoComments();
    this._commentTimer = window.setInterval(() => {
      const names = ['小猫', '同学', '观众', '路人', '粉丝'];
      const texts = ['点赞了', '在看在看', '来了', '冲冲冲', '好耶'];
      this._appendComment(names[this._randInt(0, names.length - 1)], texts[this._randInt(0, texts.length - 1)]);
    }, 2200);
  },

  _stopAutoComments() {
    if (this._commentTimer) {
      clearInterval(this._commentTimer);
      this._commentTimer = null;
    }
  },

  _appendComment(name, text) {
    const el = document.getElementById('live-room-comments');
    if (!el) return;
    const row = document.createElement('div');
    row.className = 'yd-live-room__comment';
    row.innerHTML = `<b>${this._esc(name)}</b>：${this._esc(text)}`;
    el.appendChild(row);
    // 保持最多 10 条
    while (el.children.length > 10) el.removeChild(el.firstElementChild);
  },

  _normalizeCharacter(raw) {
    const base = (raw && typeof raw === 'object') ? raw : {};
    const inner = (base.data && typeof base.data === 'object') ? base.data : {};
    return {
      id: base.id ?? inner.id ?? null,
      name: inner.name ?? base.name ?? '',
      avatar: inner.avatar ?? base.avatar ?? null
    };
  },

  _mockTitle(name) {
    const tails = ['带你逛街区', '聊天唠嗑', '今日随拍', '深夜电台', '分享日常', '放松一下'];
    return `${name} · ${tails[this._randInt(0, tails.length - 1)]}`;
  },

  _fallbackImage(seed) {
    const colors = [
      ['#111827', '#0B1220'],
      ['#1F2937', '#111827'],
      ['#0F172A', '#1D4ED8'],
      ['#111827', '#16A34A']
    ];
    const c = colors[seed % colors.length];
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${c[0]}"/>
            <stop offset="1" stop-color="${c[1]}"/>
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#g)"/>
        <circle cx="640" cy="120" r="80" fill="rgba(255,255,255,0.10)"/>
        <circle cx="160" cy="460" r="120" fill="rgba(255,255,255,0.06)"/>
      </svg>
    `.trim();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  },

  _randInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
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


// 模拟地图：展示角色与“我”的距离
const MapPage = {
  async init() {
    document.getElementById('map-back')?.addEventListener('click', () => {
      State.backToHome();
    });

    // 进入地图页时刷新
    window.addEventListener('yd:pagechange', (e) => {
      const to = e?.detail?.to;
      if (to === 'page-map') {
        this.render();
      }
    });
  },

  async render() {
    const listEl = document.getElementById('map-distance-list');
    if (!listEl) return;

    const raw = await Storage.dbGetAll('characters');
    const chars = (raw || []).map(c => this._normalizeCharacter(c)).filter(c => c && c.id);
    listEl.innerHTML = '';

    if (!chars.length) {
      listEl.innerHTML = `
        <div class="yd-empty" style="padding:12px 0;">
          <div class="yd-empty__icon">📍</div>
          <div class="yd-empty__text">暂无角色，可先去“角色”页面创建</div>
        </div>
      `;
      return;
    }

    // 为了更有趣，按“离你最近”排序
    const distances = chars.map(c => ({
      ...c,
      distance: this._mockDistanceForId(c.id)
    })).sort((a, b) => a.distance - b.distance);

    distances.forEach(c => {
      const row = document.createElement('div');
      row.className = 'yd-map-item';

      const initial = (c.name || '').slice(0, 1) || '👤';
      const avatarHtml = c.avatar
        ? `<img src="${this._esc(c.avatar)}" alt="${this._esc(c.name)}">`
        : this._esc(initial);

      row.innerHTML = `
        <div class="yd-map-item__left">
          <div class="yd-map-item__avatar">${avatarHtml}</div>
          <div class="yd-map-item__name">${this._esc(c.name || '未命名角色')}</div>
        </div>
        <div class="yd-map-item__distance">距你约 ${c.distance.toFixed(1)} km</div>
      `;

      listEl.appendChild(row);
    });
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

  _mockDistanceForId(id) {
    // 稍微稳定一点的伪随机：基于 id 做 hash
    const s = String(id || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    const r = (h % 1000) / 10; // 0.0 - 99.9
    // 基础范围 0.5km ~ 50km
    return 0.5 + (r / 2);
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


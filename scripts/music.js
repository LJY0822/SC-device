// 我的音乐
const Music = {
  _audio: null,
  _currentTrack: null,
  _currentUrl: null,
  _tracks: [],
  _lastLyricLine: '',
  _playerLyricBuiltForTrackId: '',
  _playerActiveLyricIndex: -1,
  _playerLyricMode: 'none',
  _playerUserAvatarUrl: '',
  _playerRoleAvatarUrls: [],
  _playerTogetherMode: false,
  _playerTogetherSessionId: '',
  _playerTogetherTrackId: '',
  _playerTogetherStartedAt: 0,
  _playerBackToChatSessionId: '',
  _playerShareBtnDefaultHtml: '',
  STORAGE_KEY_TOGETHER_STATE: 'music_together_state_v1',
  STORAGE_KEY_LAST_TRACK_ID: 'music_last_track_id_v1',
  _playMode: 'sequence',
  _batchDeleteMode: false,
  _selectedTrackIds: new Set(),

  init() {
    this._audio = new Audio();
    this._audio.addEventListener('ended', () => this._onTrackEnd());
    this._audio.addEventListener('timeupdate', () => {
      this.updateMiniLyric();
      this.updatePlayerProgress();
      this.updatePlayerLyricHighlight();
      this._syncPlayerWidget(false);
    });
    this.setupEvents();
    this.renderList();
    this._syncPlayModeButton();
  },

  setupEvents() {
    document.getElementById('music-back')?.addEventListener('click', () => State.backToHome());
    document.getElementById('music-import')?.addEventListener('click', () => document.getElementById('music-file-input')?.click());
    document.getElementById('music-file-input')?.addEventListener('change', (e) => this.handleImport(e));
    document.getElementById('music-mini-player')?.addEventListener('click', () => {
      this._playerBackToChatSessionId = '';
      this.openPlayerPage();
    });
    document.getElementById('music-mini-play')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlay();
    });
    document.getElementById('music-player-back')?.addEventListener('click', async () => {
      const sid = String(this._playerBackToChatSessionId || '').trim();
      if (sid && typeof Chat !== 'undefined' && Chat && typeof Chat.openSession === 'function') {
        await Chat.openSession(sid);
        this._playerBackToChatSessionId = '';
        return;
      }
      this._playerBackToChatSessionId = '';
      State.switchPage('page-music');
    });
    document.getElementById('music-player-prev')?.addEventListener('click', () => this.playPrev());
    document.getElementById('music-player-next')?.addEventListener('click', () => this.playNext());
    document.getElementById('music-player-toggle')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('music-player-mode')?.addEventListener('click', () => this.cyclePlayMode());
    document.getElementById('music-player-list')?.addEventListener('click', () => this.openPlaylistPicker());
    const shareBtn = document.getElementById('music-player-share');
    if (shareBtn && !this._playerShareBtnDefaultHtml) {
      this._playerShareBtnDefaultHtml = shareBtn.innerHTML;
    }
    shareBtn?.addEventListener('click', async () => {
      if (this._playerTogetherMode) {
        const ok = confirm('是否要退出一起听？');
        if (!ok) return;
        if (typeof this._exitTogetherMode === 'function') {
          await this._exitTogetherMode();
        }
        this._renderTogetherArea();
        return;
      }
      this.openTogetherSharePicker();
    });
    document.getElementById('music-player-together-exit')?.addEventListener('click', () => this._exitTogetherMode());
    document.getElementById('music-player-seek')?.addEventListener('input', (e) => this.handleSeekInput(e));
    document.getElementById('music-edit-cover-btn')?.addEventListener('click', () => document.getElementById('music-cover-input')?.click());
    document.getElementById('music-cover-input')?.addEventListener('change', (e) => this.handleCoverUpload(e));
    document.getElementById('music-lyrics-import-btn')?.addEventListener('click', () => document.getElementById('music-lyrics-input')?.click());
    document.getElementById('music-lyrics-input')?.addEventListener('change', (e) => this.handleLyricsUpload(e));
    document.getElementById('music-edit-cancel')?.addEventListener('click', () => this.closeEditModal());
    document.getElementById('music-edit-save')?.addEventListener('click', () => this.saveEdit());
    document.querySelector('#music-edit-modal .yd-modal__backdrop')?.addEventListener('click', () => this.closeEditModal());

    // 桌面播放器组件发送的控制命令（上一曲/下一曲/播放暂停）
    try {
      window.addEventListener('message', (ev) => {
        const msg = ev && ev.data;
        if (!msg) return;
        if (msg.type === 'yd-widget-player-open-music') {
          try {
            State.switchPage('page-music');
          } catch (e) {}
          return;
        }
        if (msg.type !== 'yd-widget-player-command') return;
        const cmd = msg.command;
        if (cmd === 'prev') {
          this.playPrev();
        } else if (cmd === 'next') {
          this.playNext();
        } else if (cmd === 'toggle') {
          // 若当前没有正在播放的歌曲，则自动播放第一首
          if (!this._currentTrack && this._tracks && this._tracks.length) {
            this.playTrack(this._tracks[0]);
          } else {
            this.togglePlay();
          }
        }
      });
    } catch (e) {}
  },

  async handleImport(e) {
    const files = e.target.files;
    if (!files || !files.length) return;
    for (let i = 0; i < files.length; i++) {
      await this.importFile(files[i]);
    }
    e.target.value = '';
    this.renderList();
  },

  async importFile(file) {
    // 某些浏览器/系统对 flac 等文件的 file.type 可能为空，需用扩展名兜底
    const name = String(file?.name || '').toLowerCase();
    const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const allowExt = new Set(['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac']);
    const isAudioByType = !!(file && typeof file.type === 'string' && file.type.startsWith('audio/'));
    const isAudioByExt = allowExt.has(ext);
    if (!isAudioByType && !isAudioByExt) return;

    const rawTitle = (file.name || '未命名').replace(/\.[^.]+$/, '');
    let artist = '';
    let album = '';
    let coverDataUrl = null;
    let lyrics = '';
    let titleResolved = rawTitle;

    // 尝试从文件名解析：Artist - Title
    const dashMatch = rawTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) {
      artist = dashMatch[1].trim();
      titleResolved = dashMatch[2].trim();
    }

    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
      try {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(r.error || new Error('readAsDataURL failed'));
        r.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });

    // 尝试解析元数据（如果 jsmediatags 可用）
    if (typeof jsmediatags !== 'undefined') {
      try {
        const tags = await new Promise((resolve, reject) => {
          jsmediatags.read(file, {
            onSuccess: (t) => resolve(t),
            onError: (err) => reject(err)
          });
        });
        if (tags && tags.tags) {
          const t = tags.tags;
          artist = t.artist || artist;
          album = t.album || album;
          titleResolved = t.title || titleResolved;

          // 歌词：不同格式字段名可能不同，尽量兼容
          const l1 = t.unsynchronisedLyrics?.lyrics;
          const l2 = t.USLT?.lyrics;
          const l3 = t.lyrics;
          const l4 = t.LYRICS;
          lyrics = (l1 || l2 || l3 || l4 || lyrics || '').toString();

          // 封面：避免 String.fromCharCode/apply 导致大图崩溃，改用 Blob -> dataURL
          if (t.picture && t.picture.data) {
            const format = t.picture.format || 'image/jpeg';
            const bytes = new Uint8Array(t.picture.data);
            const blob = new Blob([bytes], { type: format });
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl && dataUrl.startsWith('data:')) coverDataUrl = dataUrl;
          }
        }
      } catch (err) {
        console.log('元数据解析跳过:', err);
      }
    }

    const track = {
      id: State.generateId(),
      title: titleResolved || rawTitle,
      artist: artist || '未知歌手',
      album: album || '',
      coverDataUrl: coverDataUrl,
      lyrics: lyrics,
      audioBlob: file,
      duration: 0,
      createdAt: Date.now() + Math.random()
    };

    await Storage.dbAdd('tracks', track);
  },

  async renderList() {
    const listEl = document.getElementById('music-list');
    const summaryEl = document.getElementById('music-summary');
    const miniEl = document.getElementById('music-mini-player');
    if (!listEl || !summaryEl) return;

    const tracks = await Storage.dbGetAll('tracks');
    this._tracks = (tracks || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    this._syncBatchSelectionWithTracks();

    const count = this._tracks.length;
    const totalMin = Math.floor((this._tracks.reduce((s, t) => s + (t.duration || 0), 0) / 60));
    this.renderSummary();

    if (!count) {
      this._batchDeleteMode = false;
      this._selectedTrackIds.clear();
      listEl.innerHTML = `
        <div class="yd-music-empty">
          <div class="yd-music-empty__icon">🎵</div>
          <div>点击右上角「导入」添加音乐</div>
        </div>
      `;
      if (miniEl) miniEl.hidden = true;
      return;
    }

    if (miniEl) miniEl.hidden = !this._currentTrack;

    listEl.innerHTML = this._tracks.map((t, i) => this.renderItem(t, i)).join('');

    listEl.querySelectorAll('.yd-music-item').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.yd-music-item__options') || e.target.closest('.yd-music-item__check')) return;
        if (this._batchDeleteMode) {
          const track = this._tracks[i];
          if (track) this.toggleTrackSelection(track.id);
          return;
        }
        this.playTrack(this._tracks[i]);
        this._playerBackToChatSessionId = '';
        this.openPlayerPage();
      });
    });

    listEl.querySelectorAll('.yd-music-item__check').forEach((checkEl, i) => {
      checkEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = this._tracks[i];
        if (track) this.toggleTrackSelection(track.id);
      });
    });

    listEl.querySelectorAll('.yd-music-item__options').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._batchDeleteMode) return;
        this.openEditModal(this._tracks[i]);
      });
    });

    this.bindSummaryEvents();
  },

  renderSummary() {
    const summaryEl = document.getElementById('music-summary');
    if (!summaryEl) return;
    const count = this._tracks.length;
    const totalMin = Math.floor((this._tracks.reduce((s, t) => s + (t.duration || 0), 0) / 60));
    const selectedCount = this._selectedTrackIds.size;
    const text = count ? `全部歌曲 · ${count}首` + (totalMin > 0 ? ` · 约${totalMin}分钟` : '') : '暂无歌曲';
    const actions = count
      ? (
        this._batchDeleteMode
          ? `
            <button class="yd-music-summary-btn yd-music-summary-btn--delete" id="music-delete-selected-btn" type="button"${selectedCount ? '' : ' disabled'}>
              删除已选${selectedCount ? `（${selectedCount}）` : ''}
            </button>
            <button class="yd-music-summary-btn" id="music-delete-cancel-btn" type="button">取消</button>
          `
          : `<button class="yd-music-summary-btn yd-music-summary-btn--delete" id="music-delete-mode-btn" type="button">删除</button>`
      )
      : '';
    summaryEl.innerHTML = `
      <div class="yd-music-summary__inner">
        <span class="yd-music-summary__text">${this.escapeHtml(text)}</span>
        <div class="yd-music-summary__actions">${actions}</div>
      </div>
    `;
  },

  bindSummaryEvents() {
    document.getElementById('music-delete-mode-btn')?.addEventListener('click', () => {
      this._batchDeleteMode = true;
      this._selectedTrackIds.clear();
      this.renderList();
    });

    document.getElementById('music-delete-cancel-btn')?.addEventListener('click', () => {
      this._batchDeleteMode = false;
      this._selectedTrackIds.clear();
      this.renderList();
    });

    document.getElementById('music-delete-selected-btn')?.addEventListener('click', async () => {
      if (!this._selectedTrackIds.size) return;
      const ok = confirm(`确认删除已选中的 ${this._selectedTrackIds.size} 首歌曲吗？`);
      if (!ok) return;
      await this.deleteSelectedTracks();
    });
  },

  toggleTrackSelection(trackId) {
    const id = String(trackId || '').trim();
    if (!id) return;
    if (this._selectedTrackIds.has(id)) this._selectedTrackIds.delete(id);
    else this._selectedTrackIds.add(id);
    this.renderList();
  },

  _syncBatchSelectionWithTracks() {
    if (!this._selectedTrackIds || !this._selectedTrackIds.size) return;
    const validIds = new Set((this._tracks || []).map(t => String(t?.id || '')).filter(Boolean));
    for (const id of Array.from(this._selectedTrackIds)) {
      if (!validIds.has(id)) this._selectedTrackIds.delete(id);
    }
  },

  async deleteSelectedTracks() {
    const deletingIds = Array.from(this._selectedTrackIds);
    if (!deletingIds.length) return;
    const deletingSet = new Set(deletingIds);
    for (const id of deletingIds) {
      await Storage.dbDelete('tracks', id);
    }

    if (this._currentTrack && deletingSet.has(String(this._currentTrack.id || ''))) {
      try {
        this._audio.pause();
      } catch (e) {}
      if (this._currentUrl) {
        URL.revokeObjectURL(this._currentUrl);
        this._currentUrl = null;
      }
      this._currentTrack = null;
      this._prepareLyricCues(null);
      this.updateMiniPlayer();
      this.updateMiniLyric(true);
      this.renderPlayerDetail(true);
      this.updatePlayerProgress();
      this._syncPlayButtons();
      const miniEl = document.getElementById('music-mini-player');
      if (miniEl) miniEl.hidden = true;
      this._syncPlayerWidget(true);
    }

    this._batchDeleteMode = false;
    this._selectedTrackIds.clear();
    await this.renderList();
  },

  renderItem(t, index) {
    const cover = t.coverDataUrl
      ? `<img src="${this.escapeHtml(t.coverDataUrl)}" alt="">`
      : '<span class="yd-music-item__cover-placeholder">🎵</span>';
    const meta = [t.artist, t.album].filter(Boolean).join(' · ') || '未知';
    const checked = this._selectedTrackIds.has(String(t.id || ''));
    const checkHtml = this._batchDeleteMode
      ? `<button class="yd-music-item__check${checked ? ' is-checked' : ''}" type="button" aria-label="${checked ? '取消选择' : '选择歌曲'}"></button>`
      : '';
    const optionsHtml = this._batchDeleteMode
      ? ''
      : '<button class="yd-music-item__options" type="button" aria-label="更多">⋮</button>';
    return `
      <div class="yd-music-item" data-index="${index}">
        ${checkHtml}
        <div class="yd-music-item__cover">${cover}</div>
        <div class="yd-music-item__info">
          <div class="yd-music-item__title">${this.escapeHtml(t.title || '未命名')}</div>
          <div class="yd-music-item__meta">${this.escapeHtml(meta)}</div>
        </div>
        ${optionsHtml}
      </div>
    `;
  },

  async playTrack(track) {
    if (!track || !track.audioBlob) return;
    if (this._currentUrl) URL.revokeObjectURL(this._currentUrl);
    this._currentUrl = URL.createObjectURL(track.audioBlob);
    this._audio.src = this._currentUrl;
    this._audio.play().catch(e => console.warn('播放失败:', e));
    this._currentTrack = track;
    this._prepareLyricCues(track);
    this.updateMiniPlayer();
    this.updateMiniLyric(true);
    this.renderPlayerDetail(true);
    this.updatePlayerProgress();
    this._syncPlayButtons();
    document.getElementById('music-mini-player').hidden = false;
    this._syncPlayerWidget(true);
    this._persistLastTrackId(track?.id);
  },

  async togglePlay() {
    if (!this._audio) return;
    if (!this._currentTrack) {
      const picked = await this._pickInitialTrackForPlay();
      if (picked) {
        await this.playTrack(picked);
      }
      return;
    }
    const btn = document.getElementById('music-mini-play');
    if (this._audio.paused) {
      this._audio.play().catch(() => {});
      if (btn) btn.classList.add('yd-music-mini-play--playing');
    } else {
      this._audio.pause();
      if (btn) btn.classList.remove('yd-music-mini-play--playing');
    }
    this._syncPlayButtons();
    this._syncPlayerWidget(true);
  },

  async _pickInitialTrackForPlay() {
    let list = Array.isArray(this._tracks) ? this._tracks.filter(Boolean) : [];
    if (!list.length) {
      try {
        const tracks = await Storage.dbGetAll('tracks');
        this._tracks = (tracks || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        list = Array.isArray(this._tracks) ? this._tracks.filter(Boolean) : [];
      } catch (e) {
        list = [];
      }
    }
    if (!list.length) return null;

    const lastId = this._readLastTrackId();
    if (lastId) {
      const hit = list.find(t => String(t?.id || '') === lastId);
      if (hit) return hit;
    }
    return list[0] || null;
  },

  _persistLastTrackId(trackId) {
    const id = String(trackId || '').trim();
    if (!id) return;
    try { Storage.set(this.STORAGE_KEY_LAST_TRACK_ID, id); } catch (e) {}
  },

  _readLastTrackId() {
    try {
      return String(Storage.get(this.STORAGE_KEY_LAST_TRACK_ID) || '').trim();
    } catch (e) {
      return '';
    }
  },

  // 上一曲（供桌面播放器组件调用）
  playPrev() {
    const list = Array.isArray(this._tracks) ? this._tracks : [];
    if (!list.length) return;
    if (!this._currentTrack) {
      this.playTrack(list[0]);
      return;
    }
    const idx = this._getCurrentTrackIndex(list);
    const nextIdx = idx <= 0 ? (list.length - 1) : (idx - 1);
    this.playTrack(list[nextIdx]);
  },

  // 下一曲（供桌面播放器组件调用）
  playNext() {
    const list = Array.isArray(this._tracks) ? this._tracks : [];
    if (!list.length) return;
    if (!this._currentTrack) {
      this.playTrack(list[0]);
      return;
    }
    const idx = this._getCurrentTrackIndex(list);
    const nextIdx = (idx < 0 || idx >= list.length - 1) ? 0 : (idx + 1);
    this.playTrack(list[nextIdx]);
  },

  _onTrackEnd() {
    if (!this._currentTrack || !this._tracks.length) {
      document.getElementById('music-mini-play')?.classList.remove('yd-music-mini-play--playing');
      this._syncPlayButtons();
      this._syncPlayerWidget(true);
      return;
    }

    if (this._playMode === 'single') {
      this._audio.currentTime = 0;
      this._audio.play().catch(() => {});
      this._syncPlayButtons();
      this._syncPlayerWidget(true);
      return;
    }

    if (this._playMode === 'random') {
      const list = Array.isArray(this._tracks) ? this._tracks : [];
      if (!list.length) return;
      if (list.length === 1) {
        this._audio.currentTime = 0;
        this._audio.play().catch(() => {});
        this._syncPlayButtons();
        this._syncPlayerWidget(true);
        return;
      }
      const curIdx = this._getCurrentTrackIndex(list);
      let nextIdx = Math.floor(Math.random() * list.length);
      if (nextIdx === curIdx) nextIdx = (nextIdx + 1) % list.length;
      this.playTrack(list[nextIdx]);
      return;
    }

    this._playNextInSequence();
  },

  _playNextInSequence() {
    const list = Array.isArray(this._tracks) ? this._tracks : [];
    if (!list.length) return;
    const idx = this._getCurrentTrackIndex(list);
    const nextIdx = (idx < 0 || idx >= list.length - 1) ? 0 : (idx + 1);
    this.playTrack(list[nextIdx]);
  },

  _getCurrentTrackIndex(list) {
    return list.findIndex(t => t && this._currentTrack && t.id === this._currentTrack.id);
  },

  updateMiniPlayer() {
    const t = this._currentTrack;
    if (!t) return;
    const coverEl = document.getElementById('music-mini-cover');
    const titleEl = document.getElementById('music-mini-title');
    const lyricTextEl = document.getElementById('music-mini-lyric-text');
    if (coverEl) {
      coverEl.innerHTML = t.coverDataUrl ? `<img src="${this.escapeHtml(t.coverDataUrl)}" alt="">` : '';
    }
    if (titleEl) titleEl.textContent = t.title || '未命名';
    // 初始化歌词区域：先清空，等待 timeupdate 填充；无歌词时回退显示作者
    if (lyricTextEl) lyricTextEl.textContent = '';
    const btn = document.getElementById('music-mini-play');
    if (btn) btn.classList.toggle('yd-music-mini-play--playing', !this._audio.paused);
    this._syncPlayButtons();
  },

  _prepareLyricCues(track) {
    const lrc = String(track?.lyricsLrc || track?.lyrics || '').trim();
    if (!lrc) {
      this._lyricCues = [];
      return;
    }
    // 如果不是 LRC，直接当作纯文本处理（不做时间同步）
    if (!this._isLikelyLrc(lrc)) {
      this._lyricCues = [];
      this._plainLyric = lrc;
      return;
    }
    this._plainLyric = '';
    this._lyricCues = this._parseLrc(lrc);
  },

  _parseLrc(text) {
    const lines = String(text || '').split(/\r?\n/);
    const cues = [];
    for (const line of lines) {
      if (!line) continue;
      // 跳过 meta
      if (/^\s*\[(ar|ti|al|by|offset|re|ve):/i.test(line)) continue;
      const timeTags = Array.from(line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g));
      if (!timeTags.length) continue;
      const content = line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
      if (!content) continue;
      for (const m of timeTags) {
        const mm = parseInt(m[1], 10) || 0;
        const ss = parseInt(m[2], 10) || 0;
        const msRaw = m[3] ? String(m[3]) : '0';
        const ms = parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) || 0;
        const t = mm * 60 + ss + ms / 1000;
        cues.push({ t, text: content });
      }
    }
    cues.sort((a, b) => a.t - b.t);
    return cues;
  },

  updateMiniLyric(force = false) {
    const track = this._currentTrack;
    const wrap = document.getElementById('music-mini-lyric-track');
    const textEl = document.getElementById('music-mini-lyric-text');
    if (!wrap || !textEl) return;

    // 无同步歌词：回退显示作者或纯文本歌词
    if (!track) {
      textEl.textContent = '';
      wrap.classList.remove('is-marquee');
      return;
    }

    // 纯文本歌词（无时间轴）
    if (this._plainLyric) {
      const line = this._plainLyric.split(/\r?\n/).find(Boolean) || (track.artist || '');
      if (force || textEl.textContent !== line) {
        textEl.textContent = line;
        this._refreshMarquee(wrap, textEl);
      }
      this._lastLyricLine = line;
      return;
    }

    const cues = Array.isArray(this._lyricCues) ? this._lyricCues : [];
    if (!cues.length) {
      const fallback = track.artist || '';
      if (force || textEl.textContent !== fallback) {
        textEl.textContent = fallback;
        this._refreshMarquee(wrap, textEl);
      }
      this._lastLyricLine = fallback;
      return;
    }

    const ct = Number(this._audio?.currentTime || 0);
    // 找到最后一个 t <= currentTime 的 cue
    let idx = 0;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].t <= ct) idx = i;
      else break;
    }
    const nextLine = cues[idx]?.text || '';
    if (force || textEl.textContent !== nextLine) {
      textEl.textContent = nextLine;
      this._refreshMarquee(wrap, textEl);
    }
    this._lastLyricLine = nextLine;
  },

  _refreshMarquee(wrap, textEl) {
    // 下一帧测量是否溢出，决定是否 marquee
    wrap.classList.remove('is-marquee');
    requestAnimationFrame(() => {
      try {
        const overflow = textEl.scrollWidth > wrap.clientWidth + 6;
        wrap.classList.toggle('is-marquee', overflow);
      } catch (e) {}
    });
  },

  openPlayerPage() {
    (async () => {
      await this._loadTogetherState();
      if (!this._currentTrack && this._playerTogetherTrackId) {
        await this._ensureCurrentTrackById(this._playerTogetherTrackId, false);
      }
      if (!this._isTogetherStateValidForCurrentTrack()) this._playerTogetherMode = false;
      if (this._playerTogetherMode && this._playerTogetherSessionId) {
        const sess = await Storage.dbGet('sessions', this._playerTogetherSessionId);
        await this._hydrateRoleAvatarsFromSession(sess);
      }
      this.renderPlayerDetail(true);
      this.updatePlayerProgress();
      this._syncPlayButtons();
      this._hydratePlayerUserAvatar().catch(() => {});
      State.switchPage('page-music-player');
    })();
  },

  async _ensureCurrentTrackById(trackId, autoPlay = false) {
    const id = String(trackId || '').trim();
    if (!id) return null;
    if (this._currentTrack && String(this._currentTrack.id || '') === id) return this._currentTrack;
    let list = Array.isArray(this._tracks) ? this._tracks : [];
    if (!list.length) {
      try {
        const tracks = await Storage.dbGetAll('tracks');
        this._tracks = (tracks || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        list = this._tracks;
      } catch (e) {
        list = [];
      }
    }
    const hit = (Array.isArray(list) ? list : []).find(t => String(t?.id || '') === id);
    if (!hit) return null;
    if (autoPlay) {
      await this.playTrack(hit);
      return hit;
    }
    this._currentTrack = hit;
    this._prepareLyricCues(hit);
    this.updateMiniPlayer();
    this.updateMiniLyric(true);
    this.renderPlayerDetail(true);
    this.updatePlayerProgress();
    this._syncPlayButtons();
    document.getElementById('music-mini-player').hidden = false;
    return hit;
  },

  renderPlayerDetail(forceRebuildLyric = false) {
    const t = this._currentTrack;
    const playerBgEl = document.getElementById('music-player-bg');
    const coverEl = document.getElementById('music-player-cover');
    const lyricEl = document.getElementById('music-player-lyric-list');
    const lyricLinesEl = document.getElementById('music-player-lyric-lines');
    if (!coverEl || !lyricEl || !lyricLinesEl || !playerBgEl) return;
    // 只有“已分享 + 会话有效 + 当前歌曲匹配”才显示一起听区域
    this._playerTogetherMode = this._isTogetherStateValidForCurrentTrack();
    this._renderTogetherArea();

    if (!t) {
      playerBgEl.style.backgroundImage = 'none';
      lyricLinesEl.innerHTML = '<div class="yd-music-player-lyric__line">当前暂无歌词</div>';
      this._playerLyricBuiltForTrackId = '';
      this._playerActiveLyricIndex = -1;
      this._renderPlayerUserAvatar();
      this._renderPlayerRoleAvatars();
      return;
    }

    if (t.coverDataUrl) {
      playerBgEl.style.backgroundImage = `url("${String(t.coverDataUrl).replace(/"/g, '\\"')}")`;
    } else {
      playerBgEl.style.backgroundImage = 'none';
    }
    this._playerMetaText = `${String(t.title || '未命名').trim() || '未命名'} - ${String(t.artist || '未知歌手').trim() || '未知歌手'}`;
    this._renderPlayerUserAvatar();
    this._renderPlayerRoleAvatars();

    const trackId = String(t.id || '');
    if (forceRebuildLyric || this._playerLyricBuiltForTrackId !== trackId) {
      this._buildPlayerLyricList(t);
      this._playerLyricBuiltForTrackId = trackId;
      this._playerActiveLyricIndex = -1;
    }
    this.updatePlayerLyricHighlight(true);
  },

  _renderTogetherArea() {
    const avatars = document.getElementById('music-player-cover');
    const status = document.getElementById('music-player-together-status');
    const shareBtn = document.getElementById('music-player-share');
    const exitBtn = document.getElementById('music-player-together-exit');
    if (!avatars) return;
    avatars.hidden = !this._playerTogetherMode;
    // 一起听时：右上角分享按钮替换为“×”退出；内部退出按钮隐藏，避免重复入口
    if (shareBtn) {
      if (this._playerTogetherMode) {
        shareBtn.classList.add('is-exit');
        shareBtn.setAttribute('aria-label', '退出一起听');
        shareBtn.innerHTML = `
          <svg class="yd-music-share-btn__x" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6.8 6.8L17.2 17.2M17.2 6.8L6.8 17.2" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"></path>
          </svg>
        `.trim();
      } else {
        shareBtn.classList.remove('is-exit');
        shareBtn.setAttribute('aria-label', '分享');
        shareBtn.innerHTML = this._playerShareBtnDefaultHtml || shareBtn.innerHTML;
      }
    }
    if (exitBtn) exitBtn.hidden = true;
    if (status) {
      status.hidden = !this._playerTogetherMode;
      if (!status.hidden) {
        const started = Number(this._playerTogetherStartedAt || 0);
        const minutes = Math.max(1, started > 0 ? Math.floor((Date.now() - started) / 60000) + 1 : 1);
        status.textContent = `一起听歌中 ${minutes}分钟`;
      }
    }
  },

  _isTogetherStateValidForCurrentTrack() {
    return !!(
      this._playerTogetherMode &&
      this._playerTogetherSessionId &&
      this._playerTogetherTrackId &&
      this._currentTrack &&
      String(this._playerTogetherTrackId) === String(this._currentTrack.id || '')
    );
  },

  _renderPlayerUserAvatar() {
    const el = document.getElementById('music-player-avatar-user-inner') || document.getElementById('music-player-avatar-user');
    if (!el) return;
    const url = String(this._playerUserAvatarUrl || '').trim();
    if (url) {
      el.innerHTML = `<img alt="" src="${this.escapeHtml(url)}">`;
      return;
    }
    el.innerHTML = `<div class="yd-music-player-avatar__placeholder">我</div>`;
  },

  _renderPlayerRoleAvatars() {
    const listEl = document.getElementById('music-player-role-list');
    const wrap = document.getElementById('music-player-cover');
    if (!listEl || !wrap) return;
    const avatars = this._playerRoleAvatarUrls.length ? this._playerRoleAvatarUrls : [''];
    wrap.classList.toggle('is-multi', avatars.length > 1);
    listEl.innerHTML = avatars.map((url, idx) => {
      const trimmed = String(url || '').trim();
      return `
        <div class="yd-music-player-avatar yd-music-player-avatar--role${avatars.length > 1 ? ' is-small' : ''}" aria-label="角色头像">
          <div class="yd-music-player-avatar__inner">
            ${trimmed ? `<img alt="" src="${this.escapeHtml(trimmed)}">` : `<div class="yd-music-player-avatar__placeholder">${this.escapeHtml(avatars.length > 1 ? String(idx + 1) : '角')}</div>`}
          </div>
        </div>
      `;
    }).join('');
  },

  async _hydratePlayerUserAvatar() {
    // 规则：默认面具头像 > 任意面具头像 > 占位“我”
    let picked = '';
    try {
      const defaultId = (typeof Storage !== 'undefined' && Storage.get && typeof CONFIG !== 'undefined')
        ? String(Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '')
        : '';
      const masks = (typeof Storage !== 'undefined' && Storage.dbGetAll)
        ? await Storage.dbGetAll('masks')
        : [];
      const list = Array.isArray(masks) ? masks : [];

      const byId = defaultId ? list.find(m => String(m?.id || '') === defaultId) : null;
      const defaultAvatar = String(byId?.avatar || '').trim();
      if (defaultAvatar) {
        picked = defaultAvatar;
      } else {
        const any = list.find(m => String(m?.avatar || '').trim());
        picked = any ? String(any.avatar || '').trim() : '';
      }
    } catch (e) {
      picked = '';
    }
    this._playerUserAvatarUrl = picked;
    this._renderPlayerUserAvatar();
  },

  async openTogetherSharePicker() {
    if (!this._currentTrack) {
      alert('请先播放一首歌曲再分享');
      return;
    }
    const existing = document.getElementById('music-share-session-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'music-share-session-modal';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="邀请一起听">
        <div class="yd-modal-header">
          <div style="font-weight:900">邀请一起听</div>
          <button type="button" class="yd-btn-close" id="music-share-session-close" aria-label="关闭">×</button>
        </div>
        <div id="music-share-session-list" style="display:flex;flex-direction:column;gap:0;"></div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => {
      const el = document.getElementById('music-share-session-modal');
      if (el) el.remove();
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.getElementById('music-share-session-close')?.addEventListener('click', close);

    let sessions = [];
    try { sessions = await Storage.dbGetAll('sessions'); } catch (e) { sessions = []; }
    const candidates = (Array.isArray(sessions) ? sessions : []).filter((s) => {
      const ids = Array.isArray(s?.participantCharacterIds) ? s.participantCharacterIds.filter(Boolean) : [];
      return ids.length >= 1;
    });
    const listEl = document.getElementById('music-share-session-list');
    if (!listEl) return;
    if (!candidates.length) {
      listEl.innerHTML = `<div style="padding:28px 0;text-align:center;color:#999;font-size:13px;">暂无可用会话</div>`;
      return;
    }
    const getTs = (s) => {
      const u = Number(s?.updatedAt);
      if (Number.isFinite(u) && u > 0) return u;
      const c = Number(s?.createdAt);
      return Number.isFinite(c) && c > 0 ? c : 0;
    };
    candidates.sort((a, b) => getTs(b) - getTs(a));
    listEl.innerHTML = candidates.slice(0, 60).map((s) => {
      const names = Array.isArray(s?.participantCharacterNames) ? s.participantCharacterNames.filter(Boolean) : [];
      const label = names[0] || s?.title || '单聊';
      const isGroup = names.length > 1;
      return `
        <div class="yd-list-item" role="button" tabindex="0" data-session-id="${this.escapeHtml(String(s.id || ''))}">
          <div class="yd-list-item__avatar">💬</div>
          <div class="yd-list-item__content">
            <div class="yd-list-item__header">
              <div class="yd-list-item__title">${this.escapeHtml(s.title || label)}${isGroup ? '（群聊）' : ''}</div>
              <div class="yd-list-item__time">${this.escapeHtml(this._formatSessionTime(getTs(s)))}</div>
            </div>
            <div class="yd-list-item__subtitle">${this.escapeHtml(names.join('、') || label)}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-session-id]').forEach((item) => {
      const sid = item.getAttribute('data-session-id');
      if (!sid) return;
      const run = async () => {
        try {
          await this._shareTogetherToSession(sid, candidates.find(x => String(x?.id || '') === String(sid)) || null);
          close();
        } catch (e) {
          console.error('[music] share together failed', e);
          alert('分享失败，请稍后重试');
        }
      };
      item.addEventListener('click', run);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') run();
      });
    });
  },

  _formatSessionTime(ts) {
    const t = Number(ts) || 0;
    if (!t) return '';
    const d = new Date(t);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${hh}:${mm}`;
  },

  async _shareTogetherToSession(sessionId, session) {
    const sid = String(sessionId || '').trim();
    if (!sid || !this._currentTrack) return;
    const t = this._currentTrack;
    const sess = session || await Storage.dbGet('sessions', sid);

    // 发起新的“一起听”时：全局只允许一个，先关闭上一次（如果在别的会话）
    try {
      const prevSid = String(this._playerTogetherSessionId || '').trim();
      if (this._playerTogetherMode && prevSid && prevSid !== sid && typeof this._exitTogetherMode === 'function') {
        await this._exitTogetherMode();
      }
    } catch (e) {}

    // 再做一次兜底：全局只允许一个会话处于 enabled
    try {
      const allSessions = await Storage.dbGetAll('sessions');
      const now = Date.now();
      const list = Array.isArray(allSessions) ? allSessions : [];
      for (const s of list) {
        const ssid = String(s?.id || '').trim();
        if (!ssid || ssid === sid) continue;
        if (s?.togetherListening?.enabled) {
          s.togetherListening.enabled = false;
          s.togetherListening.trackId = '';
          s.togetherListening.status = '已退出';
          s.togetherListening.updatedAt = now;
          await Storage.dbPut('sessions', s);
        }
      }
    } catch (e2) {}

    // 一起听分享固定走“线上”消息流：若会话在线下，先切回线上。
    const sessionMode = 0;
    if (sess && (Number(sess.mode) === 1 || sess.mode === '1')) {
      sess.mode = 0;
      sess.updatedAt = Date.now();
      await Storage.dbPut('sessions', sess);
    }
    const parts = [
      '音乐',
      '一起听',
      '邀请',
      String(t.id || ''),
      String(t.title || '歌曲'),
      '0',
      '邀请一起听',
      String(Date.now()),
      '',
      '🎵',
      String(t.title || '歌曲'),
      '1',
      `歌手：${String(t.artist || '未知歌手')}`,
      '0'
    ];
    const msg = {
      id: State.generateId(),
      sessionId: sid,
      role: 'user',
      content: `[分享]${parts.map(v => String(v ?? '').replace(/\|/g, '｜')).join('|')}`,
      createdAt: Date.now(),
      mode: sessionMode
    };
    await Storage.dbAdd('messages', msg);
    if (sess) {
      sess.updatedAt = Date.now();
      sess.togetherListening = {
        enabled: true,
        trackId: String(t.id || ''),
        status: '邀请一起听',
        startedAt: Date.now(),
        updatedAt: Date.now()
      };
      await Storage.dbPut('sessions', sess);
      if (typeof Chat !== 'undefined' && Chat && String(Chat.currentSessionId || '') === sid) {
        Chat.currentSession = sess;
        if (typeof Chat._updateTypingDisplay === 'function') Chat._updateTypingDisplay();
      }
    }
    await this._hydrateRoleAvatarsFromSession(sess);
    this._playerTogetherMode = true;
    this._playerTogetherSessionId = sid;
    this._playerTogetherTrackId = String(this._currentTrack?.id || '');
    this._playerTogetherStartedAt = Number(sess?.togetherListening?.startedAt || Date.now());
    await this._persistTogetherState();
    this._renderTogetherArea();
    this._renderPlayerRoleAvatars();
    if (typeof Chat !== 'undefined' && Chat && typeof Chat._scheduleChatListRefresh === 'function') {
      Chat._scheduleChatListRefresh();
    }
    // 分享后直接进入该会话聊天框
    if (typeof Chat !== 'undefined' && Chat && typeof Chat.openSession === 'function') {
      await Chat.openSession(sid);
      // 强制确保 UI 在线上态（防止旧会话状态残留）
      try {
        if (Chat.currentSession) Chat.currentSession.mode = 0;
        if (typeof Chat._applyModeUI === 'function') Chat._applyModeUI(0);
      } catch (e) {}
    }

    // 1秒后角色回复“已接受邀请”卡片
    setTimeout(async () => {
      try {
        const acceptParts = [
          '音乐',
          '一起听',
          '邀请',
          String(t.id || ''),
          String(t.title || '歌曲'),
          '0',
          '已接受邀请',
          String(Date.now()),
          '',
          '🎵',
          String(t.title || '歌曲'),
          '1',
          `歌手：${String(t.artist || '未知歌手')}`,
          '0'
        ];
        const s2 = await Storage.dbGet('sessions', sid);
        const ids = Array.isArray(s2?.participantCharacterIds) ? s2.participantCharacterIds.filter(Boolean).map((x) => String(x)) : [];
        const names = Array.isArray(s2?.participantCharacterNames) ? s2.participantCharacterNames.filter(Boolean).map((x) => String(x)) : [];
        const isGroup = ids.length > 1;
        const acceptBody = acceptParts.map(v => String(v ?? '').replace(/\|/g, '｜')).join('|');

        // 群聊：每个角色各发一条“已接受邀请”；单聊：只发一条
        const roleRows = [];
        if (isGroup) {
          for (let i = 0; i < ids.length; i++) {
            const cid = String(ids[i] || '').trim();
            let cn = String(names[i] || '').trim();
            if (!cn && cid) {
              try {
                const ch = await Storage.dbGet('characters', cid);
                cn = String((typeof Chat !== 'undefined' && Chat && typeof Chat.normalizeCharacter === 'function')
                  ? (Chat.normalizeCharacter(ch)?.name || '')
                  : (ch?.name || ch?.data?.name || '')
                ).trim();
              } catch (e0) {}
            }
            cn = cn || `角色${i + 1}`;
            roleRows.push({ characterId: cid || null, characterName: cn });
          }
        } else {
          roleRows.push({ characterId: null, characterName: null });
        }

        for (const rr of roleRows) {
          const roleName = String(rr.characterName || '').trim();
          const prefix = isGroup ? `[分享|${roleName.replace(/\|/g, '｜')}]` : '[分享]';
          const roleMsg = {
            id: State.generateId(),
            sessionId: sid,
            role: 'assistant',
            content: `${prefix}${acceptBody}`,
            createdAt: Date.now(),
            mode: sessionMode,
            characterId: rr.characterId,
            characterName: rr.characterName
          };
          await Storage.dbAdd('messages', roleMsg);
        }

        if (s2) {
          s2.updatedAt = Date.now();
          s2.togetherListening = {
            enabled: true,
            trackId: String(t.id || ''),
            status: '已接受邀请',
            startedAt: Number(s2?.togetherListening?.startedAt || this._playerTogetherStartedAt || Date.now()),
            updatedAt: Date.now()
          };
          await Storage.dbPut('sessions', s2);
          if (typeof Chat !== 'undefined' && Chat && String(Chat.currentSessionId || '') === sid) {
            Chat.currentSession = s2;
            if (typeof Chat._updateTypingDisplay === 'function') Chat._updateTypingDisplay();
          }
        }
        if (typeof Chat !== 'undefined' && Chat && typeof Chat._scheduleChatListRefresh === 'function') {
          Chat._scheduleChatListRefresh();
        }
        if (typeof Chat !== 'undefined' && Chat && String(Chat.currentSessionId || '') === sid && typeof Chat.loadMessages === 'function') {
          await Chat.loadMessages();
        }
      } catch (e) {
        console.error('[music] together accept message failed', e);
      }
    }, 1000);
  },

  async _hydrateRoleAvatarsFromSession(session) {
    this._playerRoleAvatarUrls = [];
    const ids = Array.isArray(session?.participantCharacterIds) ? session.participantCharacterIds.filter(Boolean) : [];
    const out = [];

    const pickAvatar = (raw) => {
      if (!raw || typeof raw !== 'object') return '';
      try {
        if (typeof Chat !== 'undefined' && Chat && typeof Chat.normalizeCharacter === 'function') {
          const norm = Chat.normalizeCharacter(raw);
          const src = String(norm?.avatar || '').trim();
          if (src) return src;
        }
      } catch (e) {}
      const inner = raw && raw.data && typeof raw.data === 'object' ? raw.data : null;
      return String(
        raw.avatar ||
        inner?.avatar ||
        raw?.extensions?.avatar ||
        inner?.extensions?.avatar ||
        ''
      ).trim();
    };

    if (ids.length) {
      for (const id of ids) {
        try {
          const ch = await Storage.dbGet('characters', String(id));
          out.push(pickAvatar(ch));
        } catch (e) {
          out.push('');
        }
      }
    }

    // 单聊兜底：participant ids 缺失时尝试 session.avatar
    if (!out.length) {
      const sessAvatar = String(session?.avatar || '').trim();
      if (sessAvatar) out.push(sessAvatar);
    }

    this._playerRoleAvatarUrls = out.filter((x) => String(x || '').trim());
  },

  async _persistTogetherState() {
    const payload = {
      enabled: !!this._playerTogetherMode,
      sessionId: String(this._playerTogetherSessionId || ''),
      trackId: String(this._playerTogetherTrackId || ''),
      startedAt: Number(this._playerTogetherStartedAt || 0) || 0
    };
    try {
      if (Storage && Storage.kvSet) {
        await Storage.kvSet(this.STORAGE_KEY_TOGETHER_STATE, payload);
        return;
      }
    } catch (e) {}
    try { Storage.set(this.STORAGE_KEY_TOGETHER_STATE, payload); } catch (e2) {}
  },

  async _loadTogetherState() {
    let data = null;
    try {
      if (Storage && Storage.kvGet) data = await Storage.kvGet(this.STORAGE_KEY_TOGETHER_STATE);
    } catch (e) {}
    if (!data) {
      try { data = Storage.get(this.STORAGE_KEY_TOGETHER_STATE); } catch (e2) {}
    }
    if (!data || typeof data !== 'object') return;
    this._playerTogetherMode = !!data.enabled;
    this._playerTogetherSessionId = String(data.sessionId || '');
    this._playerTogetherTrackId = String(data.trackId || '');
    this._playerTogetherStartedAt = Number(data.startedAt || 0) || 0;
    if (this._playerTogetherSessionId) {
      try {
        const sess = await Storage.dbGet('sessions', this._playerTogetherSessionId);
        if (sess?.togetherListening?.enabled) {
          this._playerTogetherMode = true;
          this._playerTogetherTrackId = String(sess.togetherListening.trackId || this._playerTogetherTrackId || '');
          this._playerTogetherStartedAt = Number(sess.togetherListening.startedAt || this._playerTogetherStartedAt || 0) || this._playerTogetherStartedAt;
          await this._hydrateRoleAvatarsFromSession(sess);
        }
      } catch (e) {}
    }
  },

  async _exitTogetherMode() {
    const sid = String(this._playerTogetherSessionId || '').trim();
    const startAt = Number(this._playerTogetherStartedAt || 0) || 0;
    this._playerTogetherMode = false;
    this._playerTogetherSessionId = '';
    this._playerTogetherTrackId = '';
    this._playerTogetherStartedAt = 0;
    this._playerRoleAvatarUrls = [];
    await this._persistTogetherState();
    if (sid) {
      try {
        const sess = await Storage.dbGet('sessions', sid);
        if (sess) {
          sess.togetherListening = {
            enabled: false,
            trackId: '',
            status: '已退出',
            updatedAt: Date.now()
          };
          await Storage.dbPut('sessions', sess);
        }
      } catch (e) {}

      // 退出一起听：补一条用户消息“🎵已退出听歌，一起听时长 mm:ss”
      try {
        const sec = startAt ? Math.max(0, Math.floor((Date.now() - startAt) / 1000)) : 0;
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        const durationText = `🎵已退出听歌，一起听时长 ${mm}:${ss}`;
        const now = Date.now();
        const msg = {
          id: State.generateId(),
          sessionId: sid,
          role: 'user',
          content: durationText,
          createdAt: now,
          mode: 0
        };
        Storage.dbAdd('messages', msg).then(async () => {
          try {
            const s = await Storage.dbGet('sessions', sid);
            if (s) {
              s.updatedAt = Date.now();
              await Storage.dbPut('sessions', s);
            }
          } catch (e2) {}
        }).catch(() => {});

        try {
          if (typeof Chat !== 'undefined' && Chat) {
            const viewing = String(Chat.currentSessionId || '') === sid && State.currentPage === 'page-chat';
            if (viewing && Array.isArray(Chat.messages)) {
              Chat.messages.push(msg);
              if (typeof Chat.renderMessages === 'function') {
                Chat.renderMessages().catch(() => {});
              }
            }
            if (typeof Chat._scheduleChatListRefresh === 'function') {
              Chat._scheduleChatListRefresh();
            }
          }
        } catch (e3) {}
      } catch (e4) {}
    }
    this._renderTogetherArea();
    this._renderPlayerRoleAvatars();
  },

  _buildPlayerLyricList(track) {
    const linesEl = document.getElementById('music-player-lyric-lines');
    if (!linesEl) return;
    const meta = String(this._playerMetaText || '').trim();
    const metaHtml = meta ? `<div class="yd-music-player-lyric__meta-line">${this.escapeHtml(meta)}</div>` : '';
    const cues = Array.isArray(this._lyricCues) ? this._lyricCues : [];
    if (cues.length) {
      this._playerLyricMode = 'timed';
      linesEl.innerHTML = metaHtml + cues.map((c, idx) => `
        <div class="yd-music-player-lyric__line" data-idx="${idx}">${this.escapeHtml(c.text || '')}</div>
      `).join('');
      return;
    }

    const plainRaw = String(track?.lyricsPlain || track?.lyrics || this._lastLyricLine || '').trim();
    let lines = plainRaw
      ? plainRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 140)
      : [];
    if (!lines.length || lines.length === 1) {
      lines = [
        '暂无歌词',
        '你可以在歌曲编辑里粘贴 LRC 或纯文本歌词'
      ];
    }
    this._playerLyricMode = 'plain';
    linesEl.innerHTML = metaHtml + lines.map(line => `<div class="yd-music-player-lyric__line">${this.escapeHtml(line)}</div>`).join('');
  },

  updatePlayerLyricHighlight(force = false) {
    const lyricEl = document.getElementById('music-player-lyric-list');
    const linesWrap = document.getElementById('music-player-lyric-lines');
    if (!lyricEl || !linesWrap) return;
    const lines = linesWrap.querySelectorAll('.yd-music-player-lyric__line');
    if (!lines.length) return;

    let idx = 0;
    if (this._playerLyricMode === 'timed') {
      const cues = Array.isArray(this._lyricCues) ? this._lyricCues : [];
      if (!cues.length) return;
      const ct = Number(this._audio?.currentTime || 0);
      for (let i = 0; i < cues.length; i++) {
        if (cues[i].t <= ct) idx = i;
        else break;
      }
    } else {
      const duration = Number(this._audio?.duration || 0);
      const current = Number(this._audio?.currentTime || 0);
      if (duration > 0) {
        const progress = Math.max(0, Math.min(1, current / duration));
        idx = Math.floor(progress * Math.max(0, lines.length - 1));
      } else {
        idx = 0;
      }
    }
    if (!force && idx === this._playerActiveLyricIndex) return;

    const prev = linesWrap.querySelector('.yd-music-player-lyric__line.is-active');
    if (prev) prev.classList.remove('is-active');
    const active = lines[idx] || linesWrap.querySelector(`.yd-music-player-lyric__line[data-idx="${idx}"]`);
    if (active) {
      active.classList.add('is-active');
      // 只滚动歌词容器本身，避免 scrollIntoView 触发整页位移
      // 用实时几何位置差计算，避免 offsetTop 在某些布局下漂移
      const lyricRect = lyricEl.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const activeCenterInView = (activeRect.top - lyricRect.top) + (activeRect.height / 2);
      const targetTop = (lyricEl.scrollTop + activeCenterInView) - (lyricEl.clientHeight / 2);
      const nextTop = Math.max(0, targetTop);
      if (force) {
        lyricEl.scrollTop = nextTop;
      } else {
        lyricEl.scrollTo({ top: nextTop, behavior: 'smooth' });
      }
    }
    this._playerActiveLyricIndex = idx;
  },

  updatePlayerProgress() {
    const seek = document.getElementById('music-player-seek');
    const curEl = document.getElementById('music-player-current');
    const durEl = document.getElementById('music-player-duration');
    const audio = this._audio;
    if (!seek || !curEl || !durEl || !audio) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    seek.max = String(Math.max(duration, 1));
    seek.value = String(Math.min(current, duration || 0));
    curEl.textContent = this._formatTime(current);
    durEl.textContent = this._formatTime(duration);
  },

  handleSeekInput(e) {
    if (!this._audio) return;
    const val = Number(e?.target?.value || 0);
    if (!Number.isFinite(val)) return;
    this._audio.currentTime = Math.max(0, val);
    this.updateMiniLyric(true);
    this.updatePlayerLyricHighlight(true);
    this.updatePlayerProgress();
  },

  _syncPlayButtons() {
    const audio = this._audio;
    const playing = !!(audio && !audio.paused);
    const detailToggle = document.getElementById('music-player-toggle');
    if (detailToggle) detailToggle.textContent = playing ? '❚❚' : '▶';
    const mini = document.getElementById('music-mini-play');
    if (mini) mini.classList.toggle('yd-music-mini-play--playing', playing);
  },

  cyclePlayMode() {
    const modes = ['sequence', 'single', 'random'];
    const idx = modes.indexOf(this._playMode);
    this._playMode = modes[(idx + 1) % modes.length];
    this._syncPlayModeButton();
  },

  _syncPlayModeButton() {
    const btn = document.getElementById('music-player-mode');
    if (!btn) return;
    const iconSequence = `
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <path d="M361.5 727.8c-119.1 0-215.9-96.9-215.9-215.9 0-119.1 96.9-215.9 215.9-215.9 2.3 0 4.6-0.2 6.8-0.6v58.3c0 12.3 14 19.4 23.9 12.1l132.6-97.6c8.1-6 8.1-18.2 0-24.2l-132.6-97.6c-9.9-7.3-23.9-0.2-23.9 12.1v58.1c-2.2-0.4-4.5-0.6-6.8-0.6-39.8 0-78.5 7.9-115 23.4-35.2 15-66.8 36.3-94 63.5s-48.6 58.8-63.5 94c-15.5 36.5-23.4 75.2-23.4 115s7.9 78.5 23.4 115c15 35.2 36.3 66.8 63.5 94s58.8 48.6 94 63.5c36.5 15.5 75.2 23.4 115 23.4 22.1 0 40-17.9 40-40s-17.9-40-40-40z m576.7-330.9c-15-35.2-36.3-66.8-63.5-94s-58.8-48.6-94-63.5c-36.5-15.5-75.2-23.4-115-23.4-22.1 0-40 17.9-40 40s17.9 40 40 40c119.1 0 215.9 96.9 215.9 215.9 0 119.1-96.9 215.9-215.9 215.9-4.1 0-8.1 0.6-11.8 1.8v-60.8c0-12.3-14-19.4-23.9-12.1l-132.6 97.6c-8.1 6-8.1 18.2 0 24.2L629.9 876c9.9 7.3 23.9 0.2 23.9-12.1V806c3.7 1.2 7.7 1.8 11.8 1.8 39.8 0 78.5-7.9 115-23.4 35.2-15 66.8-36.3 94-63.5s48.6-58.8 63.5-94c15.5-36.5 23.4-75.2 23.4-115s-7.8-78.5-23.3-115z" fill="currentColor"></path>
      </svg>
    `;
    const iconSingle = `
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <path d="M361.5 727.8c-119.1 0-215.9-96.9-215.9-215.9 0-119.1 96.9-215.9 215.9-215.9 2.3 0 4.6-0.2 6.8-0.6v58.3c0 12.3 14 19.4 23.9 12.1l132.6-97.6c8.1-6 8.1-18.2 0-24.2l-132.6-97.6c-9.9-7.3-23.9-0.2-23.9 12.1v58.1c-2.2-0.4-4.5-0.6-6.8-0.6-39.8 0-78.5 7.9-115 23.4-35.2 15-66.8 36.3-94 63.5s-48.6 58.8-63.5 94c-15.5 36.5-23.4 75.2-23.4 115s7.9 78.5 23.4 115c15 35.2 36.3 66.8 63.5 94s58.8 48.6 94 63.5c36.5 15.5 75.2 23.4 115 23.4 22.1 0 40-17.9 40-40s-17.9-40-40-40z m576.7-330.9c-15-35.2-36.3-66.8-63.5-94s-58.8-48.6-94-63.5c-36.5-15.5-75.2-23.4-115-23.4-22.1 0-40 17.9-40 40s17.9 40 40 40c119.1 0 215.9 96.9 215.9 215.9 0 119.1-96.9 215.9-215.9 215.9-4.1 0-8.1 0.6-11.8 1.8v-60.8c0-12.3-14-19.4-23.9-12.1l-132.6 97.6c-8.1 6-8.1 18.2 0 24.2L629.9 876c9.9 7.3 23.9 0.2 23.9-12.1V806c3.7 1.2 7.7 1.8 11.8 1.8 39.8 0 78.5-7.9 115-23.4 35.2-15 66.8-36.3 94-63.5s48.6-58.8 63.5-94c15.5-36.5 23.4-75.2 23.4-115s-7.8-78.5-23.3-115z" fill="currentColor"></path>
        <path d="M512.8 660.6c22.1-0.1 39.9-18.1 39.8-40.2l-1.2-214.1c-0.1-22-18-39.8-40-39.8h-0.2c-22.1 0.1-39.9 18.1-39.8 40.2l1.2 214.1c0.1 22 18 39.8 40 39.8h0.2z" fill="currentColor"></path>
      </svg>
    `;
    const iconRandom = `
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <path d="M914.2 705L796.4 596.8c-8.7-8-22.7-1.8-22.7 10V688c-69.5-1.8-134-39.7-169.3-99.8l-45.1-77 47-80.2c34.9-59.6 98.6-97.4 167.4-99.8v60.1c0 11.8 14 17.9 22.7 10l117.8-108.1c5.8-5.4 5.8-14.6 0-19.9L796.4 165c-8.7-8-22.7-1.8-22.7 10v76H758c-4.7 0-9.3 0.8-13.5 2.3-36.5 4.7-72 16.6-104.1 35-42.6 24.4-78.3 59.8-103.1 102.2L513 432l-24.3-41.5c-24.8-42.4-60.5-77.7-103.1-102.2C343 263.9 294.5 251 245.3 251H105c-22.1 0-40 17.9-40 40s17.9 40 40 40h140.3c71.4 0 138.3 38.3 174.4 99.9l47 80.2-45.1 77c-36.2 61.7-103 99.9-174.4 99.9H105c-22.1 0-40 17.9-40 40s17.9 40 40 40l142 0.1h0.2c49.1 0 97.6-12.9 140.2-37.3 42.7-24.4 78.3-59.8 103.2-102.2l22.4-38.3 22.4 38.3c24.8 42.4 60.5 77.8 103.2 102.2 33.1 18.9 69.6 30.9 107.3 35.4 3.8 1.2 7.8 1.8 11.9 1.8l15.9 0.1v55c0 11.8 14 17.9 22.7 10L914.2 725c5.9-5.5 5.9-14.7 0-20z" fill="currentColor"></path>
      </svg>
    `;
    if (this._playMode === 'single') {
      btn.innerHTML = iconSingle;
      btn.setAttribute('aria-label', '播放模式：单曲循环');
      btn.title = '单曲循环';
      return;
    }
    if (this._playMode === 'random') {
      btn.innerHTML = iconRandom;
      btn.setAttribute('aria-label', '播放模式：随机播放');
      btn.title = '随机播放';
      return;
    }
    btn.innerHTML = iconSequence;
    btn.setAttribute('aria-label', '播放模式：列表循环');
    btn.title = '列表循环';
  },

  openPlaylistPicker() {
    const tracks = Array.isArray(this._tracks) ? this._tracks : [];
    if (!tracks.length) {
      alert('当前没有可播放的歌曲');
      return;
    }
    const existing = document.getElementById('music-player-playlist-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'music-player-playlist-modal';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content yd-music-playlist-modal__content" role="dialog" aria-modal="true" aria-label="播放列表">
        <div class="yd-modal-header">
          <div style="font-weight:900">播放列表</div>
          <button type="button" class="yd-btn-close" id="music-player-playlist-close" aria-label="关闭">×</button>
        </div>
        <div id="music-player-playlist-items" style="display:flex;flex-direction:column;gap:0;max-height:58vh;overflow:auto;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      const el = document.getElementById('music-player-playlist-modal');
      if (el) el.remove();
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.getElementById('music-player-playlist-close')?.addEventListener('click', close);

    const listEl = document.getElementById('music-player-playlist-items');
    if (!listEl) return;
    listEl.innerHTML = tracks.map((t) => {
      const active = this._currentTrack && String(this._currentTrack.id || '') === String(t.id || '');
      const avatarHtml = t.coverDataUrl
        ? `<div class="yd-music-playlist-avatar"><img src="${this.escapeHtml(String(t.coverDataUrl || ''))}" alt=""></div>`
        : `<div class="yd-music-playlist-avatar">🎵</div>`;
      return `
        <div class="yd-list-item" role="button" tabindex="0" data-track-id="${this.escapeHtml(String(t.id || ''))}" style="${active ? 'background: rgba(0,122,255,0.08);' : ''}">
          <div class="yd-list-item__avatar">${avatarHtml}</div>
          <div class="yd-list-item__content">
            <div class="yd-list-item__header">
              <div class="yd-list-item__title">${this.escapeHtml(t.title || '未命名')}</div>
            </div>
            <div class="yd-list-item__subtitle">${this.escapeHtml(t.artist || '未知歌手')}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-track-id]').forEach((item) => {
      const id = String(item.getAttribute('data-track-id') || '');
      const run = () => {
        const selected = tracks.find(t => String(t?.id || '') === id);
        if (selected) this.playTrack(selected);
        close();
      };
      item.addEventListener('click', run);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') run();
      });
    });
  },

  _formatTime(sec) {
    const n = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  openEditModal(track) {
    this._editingTrack = track;
    this._editingTrackCoverData = null;
    document.getElementById('music-edit-title').value = track.title || '';
    document.getElementById('music-edit-artist').value = track.artist || '';
    document.getElementById('music-edit-album').value = track.album || '';
    document.getElementById('music-edit-lyrics').value = track.lyrics || '';
    const img = document.getElementById('music-edit-cover-img');
    if (img) {
      img.src = track.coverDataUrl || '';
      img.style.display = track.coverDataUrl ? 'block' : 'none';
    }
    document.getElementById('music-edit-modal').classList.add('yd-modal--active');
  },

  closeEditModal() {
    this._editingTrack = null;
    this._editingTrackCoverData = null;
    document.getElementById('music-edit-modal').classList.remove('yd-modal--active');
  },

  handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !this._editingTrack) return;
    const reader = new FileReader();
    reader.onload = () => {
      this._editingTrackCoverData = reader.result;
      const img = document.getElementById('music-edit-cover-img');
      if (img) {
        img.src = reader.result;
        img.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  async handleLyricsUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !this._editingTrack) return;
    try {
      const text = await file.text();
      const textarea = document.getElementById('music-edit-lyrics');
      if (textarea) textarea.value = text || '';
    } catch (err) {
      console.error('读取 LRC 失败:', err);
      alert('读取 LRC 失败');
    } finally {
      e.target.value = '';
    }
  },

  _isLikelyLrc(text) {
    const s = String(text || '');
    return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(s) || /^\s*\[(ar|ti|al|by|offset):/im.test(s);
  },

  _lrcToPlain(text) {
    const s = String(text || '');
    // 1) 去掉头信息 [ar:..][ti:..] 等；2) 去掉时间轴；3) 合并空行
    const lines = s.split(/\r?\n/).map(line => {
      // 去 meta 行
      if (/^\s*\[(ar|ti|al|by|offset|re|ve):/i.test(line)) return '';
      // 去所有时间戳
      return line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    }).filter(Boolean);
    return lines.join('\n').trim();
  },

  async saveEdit() {
    const t = this._editingTrack;
    if (!t) return;
    t.title = document.getElementById('music-edit-title').value.trim() || t.title;
    t.artist = document.getElementById('music-edit-artist').value.trim() || t.artist;
    t.album = document.getElementById('music-edit-album').value.trim() || t.album;
    const lyricsText = document.getElementById('music-edit-lyrics').value || '';
    t.lyrics = String(lyricsText).trim();
    // 额外保存一个纯文本版本（若是 LRC，则去时间轴）
    if (this._isLikelyLrc(t.lyrics)) {
      t.lyricsLrc = t.lyrics;
      t.lyricsPlain = this._lrcToPlain(t.lyrics);
    } else {
      t.lyricsLrc = '';
      t.lyricsPlain = t.lyrics;
    }
    if (this._editingTrackCoverData) t.coverDataUrl = this._editingTrackCoverData;
    this._editingTrackCoverData = null;
    await Storage.dbPut('tracks', t);
    this.closeEditModal();
    this.renderList();
    if (this._currentTrack && this._currentTrack.id === t.id) {
      this.updateMiniPlayer();
      this._prepareLyricCues(t);
      this.updateMiniLyric(true);
      this.renderPlayerDetail(true);
      this.updatePlayerProgress();
      this._syncPlayerWidget(true);
    }
  },

  // 将当前播放状态同步到桌面上的播放器组件（widget-player）
  async _syncPlayerWidget(force = false) {
    if (typeof Homescreen === 'undefined' || !Homescreen.updatePlayerWidget) return;
    const t = this._currentTrack;
    const audio = this._audio;
    const hasTrack = !!(t && audio);
    const state = {
      hasTrack,
      title: hasTrack ? (t.title || '') : '',
      artist: hasTrack ? (t.artist || '') : '',
      coverDataUrl: hasTrack ? (t.coverDataUrl || '') : '',
      duration: hasTrack ? (Number.isFinite(audio.duration) ? audio.duration : (t.duration || 0)) : 0,
      currentTime: hasTrack ? (Number.isFinite(audio.currentTime) ? audio.currentTime : 0) : 0,
      isPlaying: hasTrack ? !audio.paused : false,
      lyricLine: this._lastLyricLine || ''
    };
    try {
      await Homescreen.updatePlayerWidget(state);
    } catch (e) {
      console.error('同步播放器组件状态失败:', e);
    }
  },

  escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }
};

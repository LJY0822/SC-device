/**
 * 朋友圈生图制作页：提示词 + 可选垫图（参考图）。
 * - 从朋友圈进入：记录挂在对应 moments 条目的 imageStudioRecords。
 * - 主屏「生图记录」新建：独立记录存 kv（MIS_STANDALONE_KV_KEY），不创建朋友圈。
 * 无垫图 → images/generations；有垫图 → images/edits
 */
const MomentsImageStudio = {
  /** 独立生图（不挂朋友圈）：IndexedDB kv */
  MIS_STANDALONE_KV_KEY: 'yd_mis_standalone_v1',

  _refDataUrls: [],
  /** @type {Array<{ dataUrl: string|null, url: string|null, b64?: string|null }>} */
  _previewList: [],
  _selectedIdx: null,
  /** @type {Array<{ id: string, at: number, images: Array<object>, selectedIdx?: number|null }>} */
  _generationRuns: [],
  _activeGenerationRunIndex: -1,
  /** 防止同一条记录并发重复提交生成 */
  _genInflight: new Set(),
  /** @type {ReturnType<typeof setInterval>|null} */
  _generatingPollTimer: null,
  /** @type {WeakMap<HTMLElement, number>} */
  _recordsListRenderSeq: null,
  /** 删除/保存记录后由代码主动刷新列表时，避免与 yd:moments:changed 等事件重复渲染 */
  _recordsListRefreshInProgress: false,

  _emitStandaloneChanged() {
    try {
      window.dispatchEvent(new CustomEvent('yd:mis:standalone:changed', { detail: {} }));
    } catch (e) {}
  },

  async _loadStandaloneBundle() {
    if (typeof Storage === 'undefined' || !Storage.kvGet) return { records: [], activeRecordId: null };
    const raw = await Storage.kvGet(this.MIS_STANDALONE_KV_KEY);
    if (raw && typeof raw === 'object' && Array.isArray(raw.records)) {
      return {
        records: (raw.records || []).filter(Boolean),
        activeRecordId: raw.activeRecordId != null ? String(raw.activeRecordId).trim() : null
      };
    }
    return { records: [], activeRecordId: null };
  },

  async _saveStandaloneBundle(bundle) {
    if (typeof Storage === 'undefined' || !Storage.kvSet) return;
    await Storage.kvSet(this.MIS_STANDALONE_KV_KEY, {
      records: Array.isArray(bundle.records) ? bundle.records : [],
      activeRecordId:
        bundle.activeRecordId != null && String(bundle.activeRecordId).trim()
          ? String(bundle.activeRecordId).trim()
          : null
    });
    this._emitStandaloneChanged();
  },

  _findStandaloneRecord(bundle, rid) {
    const sid = String(rid || '').trim();
    if (!sid || !bundle) return null;
    return (bundle.records || []).find((r) => r && String(r.id) === sid) || null;
  },

  _upsertStandaloneRecord(bundle, rec) {
    const arr = Array.isArray(bundle.records) ? [...bundle.records] : [];
    const idx = arr.findIndex((r) => r && String(r.id) === String(rec.id));
    rec.updatedAt = Date.now();
    if (idx >= 0) arr[idx] = rec;
    else arr.push(rec);
    bundle.records = arr;
  },

  _resetTransientUi() {
    this._closeResultLightbox();
    this._closeRecordsPanel();
  },

  init() {
    document.getElementById('moments-image-studio-back')?.addEventListener('click', () => {
      this._resetTransientUi();
      const back = String(State?.momentsImageStudioReturnPage || '').trim() || 'page-moments';
      if (typeof State !== 'undefined' && State.switchPage) State.switchPage(back);
    });

    document.getElementById('mis-ref-files')?.addEventListener('change', (e) => this._onRefFilesChange(e));
    document.getElementById('mis-draft')?.addEventListener('click', () => this._saveDraft());
    document.getElementById('mis-run')?.addEventListener('click', () => this._runGenerate());

    document.getElementById('mis-records-open')?.addEventListener('click', () => this._openRecordsPanel());
    document.getElementById('mis-records-close')?.addEventListener('click', () => this._closeRecordsPanel());
    document.getElementById('mis-records-new')?.addEventListener('click', () => this._createNewRecord());
    document.getElementById('mis-records-overlay')?.addEventListener('click', (e) => {
      if (e.target?.id === 'mis-records-overlay') this._closeRecordsPanel();
    });

    document.getElementById('mis-result-run-select')?.addEventListener('change', () => this._onRunSelectChange());
    document.getElementById('mis-result-lightbox-backdrop')?.addEventListener('click', () => this._closeResultLightbox());
    document.getElementById('mis-result-lightbox-close')?.addEventListener('click', () => this._closeResultLightbox());
    document.getElementById('mis-result-lightbox-save')?.addEventListener('click', () => void this._onLightboxAlbumButtonClick());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const lb = document.getElementById('mis-result-lightbox');
      if (lb && !lb.hidden) this._closeResultLightbox();
    });

    document.getElementById('mis-records-page-back')?.addEventListener('click', () => {
      if (typeof State !== 'undefined' && State.switchPage) State.switchPage('page-homescreen');
    });
    document.getElementById('mis-records-page-new')?.addEventListener('click', () => void this._createNewStudioFromRecordsPage());

    window.addEventListener('yd:pagechange', (ev) => {
      if (ev?.detail?.to === 'page-moments-image-studio') {
        void this._onEnter();
      }
      if (ev?.detail?.to === 'page-mis-records') {
        void this._onEnterGlobalRecordsPage();
      }
      if (ev?.detail?.from === 'page-moments-image-studio') {
        this._stopGeneratingPoll();
        this._resetTransientUi();
      }
    });

    window.addEventListener('yd:moments:changed', (e) => {
      if (this._recordsListRefreshInProgress) return;
      if (e?.detail?.source === 'moments_image_studio_delete') return;
      if (typeof State !== 'undefined' && State.currentPage === 'page-mis-records') {
        void this._onEnterGlobalRecordsPage();
      }
    });

    window.addEventListener('yd:mis:standalone:changed', () => {
      if (this._recordsListRefreshInProgress) return;
      if (typeof State !== 'undefined' && State.currentPage === 'page-mis-records') {
        void this._onEnterGlobalRecordsPage();
      }
    });

    window.addEventListener('yd:mis:gen-complete', (ev) => {
      const { mid, rid, ok, message } = ev.detail || {};
      if (this._isActiveStudioRecord(mid, rid)) {
        void this._reloadActiveRecordFromDb();
        this._setGenerateUiBusy(false);
        this._stopGeneratingPoll();
        return;
      }
      if (typeof State !== 'undefined' && State.currentPage === 'page-mis-records') {
        void this._onEnterGlobalRecordsPage();
      }
      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        const text =
          ok !== false ? '后台生成已完成' : message ? `生成失败：${message}` : '后台生成失败';
        Notifications.enqueue('生图', '', text, 0, '消息');
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target?.closest?.('.mis-records-item-menu__trigger, .mis-records-item-menu__delete')) return;
      this._closeAllRecordsItemMenus();
    });

    this._initLightboxZoom();
  },

  _closeAllRecordsItemMenus() {
    document.querySelectorAll('.mis-records-item-menu__panel').forEach((p) => p.setAttribute('hidden', ''));
  },

  _bumpRecordsListRenderSeq(wrap) {
    if (!this._recordsListRenderSeq) this._recordsListRenderSeq = new WeakMap();
    const n = (this._recordsListRenderSeq.get(wrap) || 0) + 1;
    this._recordsListRenderSeq.set(wrap, n);
    return n;
  },

  _isRecordsListRenderStale(wrap, seq) {
    return !wrap || !this._recordsListRenderSeq || (this._recordsListRenderSeq.get(wrap) || 0) !== seq;
  },

  /**
   * 大图预览：双指捏合缩放、单指拖动平移、双指缩放后可用一指拖动、双击切换缩放；桌面滚轮缩放 + 拖拽平移。
   */
  _resetLightboxZoom() {
    this._lightboxPinch?.reset?.();
  },

  /**
   * 捏合 / 滚轮 / 拖拽缩放（全屏看图等场景复用）
   * @param {HTMLElement} viewportEl
   * @param {HTMLElement} stageEl
   * @param {{ isActive?: () => boolean }} [opts]
   * @returns {{ reset: () => void, destroy: () => void }}
   */
  bindPinchZoomViewport(viewportEl, stageEl, opts = {}) {
    if (!viewportEl || !stageEl) {
      return {
        reset() {},
        destroy() {}
      };
    }
    const isActive = typeof opts.isActive === 'function' ? opts.isActive : () => true;
    const z = {
      scale: 1,
      tx: 0,
      ty: 0,
      minScale: 1,
      maxScale: 5,
      pinchDist0: null,
      scaleAtPinch0: 1,
      panning: false,
      panStartX: 0,
      panStartY: 0,
      tx0: 0,
      ty0: 0,
      lastTap: 0,
      lastTapX: 0,
      lastTapY: 0,
      mousePan: false,
      mouseBtn: false
    };
    const apply = () => {
      if (z.scale <= 1.001) {
        stageEl.style.transform = '';
        return;
      }
      stageEl.style.transform = `translate3d(${z.tx}px, ${z.ty}px, 0) scale(${z.scale})`;
    };
    const reset = () => {
      z.scale = 1;
      z.tx = 0;
      z.ty = 0;
      z.pinchDist0 = null;
      z.panning = false;
      z.mousePan = false;
      z.mouseBtn = false;
      stageEl.style.transform = '';
    };
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const clampScale = (s) => Math.max(z.minScale, Math.min(z.maxScale, s));
    const ac = new AbortController();
    const sig = ac.signal;

    viewportEl.addEventListener(
      'touchstart',
      (e) => {
        if (!isActive()) return;
        if (e.touches.length === 2) {
          z.panning = false;
          z.pinchDist0 = dist(e.touches[0], e.touches[1]);
          z.scaleAtPinch0 = z.scale;
        } else if (e.touches.length === 1 && z.scale > 1.05) {
          z.panning = true;
          z.panStartX = e.touches[0].clientX;
          z.panStartY = e.touches[0].clientY;
          z.tx0 = z.tx;
          z.ty0 = z.ty;
        }
      },
      { signal: sig, passive: true }
    );

    viewportEl.addEventListener(
      'touchmove',
      (e) => {
        if (!isActive()) return;
        if (e.touches.length === 2 && z.pinchDist0 != null) {
          e.preventDefault();
          z.scale = clampScale(z.scaleAtPinch0 * (dist(e.touches[0], e.touches[1]) / z.pinchDist0));
          if (z.scale <= 1.05) {
            z.tx = 0;
            z.ty = 0;
          }
          apply();
        } else if (e.touches.length === 1 && z.panning && z.scale > 1.05) {
          e.preventDefault();
          const t = e.touches[0];
          z.tx = z.tx0 + (t.clientX - z.panStartX);
          z.ty = z.ty0 + (t.clientY - z.panStartY);
          apply();
        }
      },
      { signal: sig, passive: false }
    );

    const endTouchCluster = (e) => {
      if (!isActive()) return;
      if (e.touches.length < 2) z.pinchDist0 = null;
      if (e.touches.length === 0) {
        z.panning = false;
        if (e.changedTouches.length === 1) {
          const t = e.changedTouches[0];
          const now = Date.now();
          if (now - z.lastTap < 320 && Math.hypot(t.clientX - z.lastTapX, t.clientY - z.lastTapY) < 48) {
            if (z.scale > 1.2) {
              z.scale = 1;
              z.tx = 0;
              z.ty = 0;
            } else {
              z.scale = 2.25;
              z.tx = 0;
              z.ty = 0;
            }
            apply();
            z.lastTap = 0;
          } else {
            z.lastTap = now;
            z.lastTapX = t.clientX;
            z.lastTapY = t.clientY;
          }
        }
      }
    };
    viewportEl.addEventListener('touchend', endTouchCluster, { signal: sig, passive: true });
    viewportEl.addEventListener('touchcancel', endTouchCluster, { signal: sig, passive: true });

    viewportEl.addEventListener(
      'wheel',
      (e) => {
        if (!isActive()) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.14 : -0.14;
        z.scale = clampScale(z.scale + delta);
        if (z.scale <= 1.05) {
          z.tx = 0;
          z.ty = 0;
        }
        apply();
      },
      { signal: sig, passive: false }
    );

    viewportEl.addEventListener(
      'mousedown',
      (e) => {
        if (!isActive()) return;
        if (e.button !== 0) return;
        if (z.scale <= 1.05) return;
        e.preventDefault();
        z.mousePan = true;
        z.mouseBtn = true;
        z.panStartX = e.clientX;
        z.panStartY = e.clientY;
        z.tx0 = z.tx;
        z.ty0 = z.ty;
      },
      { signal: sig }
    );

    window.addEventListener(
      'mousemove',
      (e) => {
        if (!isActive() || !z.mousePan || !z.mouseBtn) return;
        z.tx = z.tx0 + (e.clientX - z.panStartX);
        z.ty = z.ty0 + (e.clientY - z.panStartY);
        apply();
      },
      { signal: sig }
    );

    window.addEventListener(
      'mouseup',
      () => {
        z.mouseBtn = false;
        z.mousePan = false;
      },
      { signal: sig }
    );

    return {
      reset,
      destroy() {
        try {
          ac.abort();
        } catch (e) {}
      }
    };
  },

  _initLightboxZoom() {
    const vp = document.getElementById('mis-result-lightbox-zoom-viewport');
    const stage = document.getElementById('mis-result-lightbox-zoom-stage');
    if (!vp || !stage || vp.dataset.misLbZoomBound === '1') return;
    vp.dataset.misLbZoomBound = '1';
    this._lightboxPinch?.destroy?.();
    this._lightboxPinch = this.bindPinchZoomViewport(vp, stage, {
      isActive: () => {
        const lb = document.getElementById('mis-result-lightbox');
        return !!(lb && !lb.hidden);
      }
    });
  },

  _isActiveStudioRecord(mid, rid) {
    if (String(State?.currentPage || '') !== 'page-moments-image-studio') return false;
    const curRid = String(State?.momentsImageStudioRecordId || '').trim();
    const curMid = String(State?.momentsImageStudioMomentId || '').trim();
    const smid = String(mid || '').trim();
    if (String(rid || '').trim() !== curRid) return false;
    if (State?.momentsImageStudioStandalone) return !curMid && !smid;
    return curMid === smid;
  },

  _setGenerateUiBusy(busy) {
    const btn = document.getElementById('mis-run');
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? '生成中…' : '生成';
  },

  _stopGeneratingPoll() {
    if (this._generatingPollTimer) {
      clearInterval(this._generatingPollTimer);
      this._generatingPollTimer = null;
    }
  },

  _startGeneratingPoll(mid, rid) {
    this._stopGeneratingPoll();
    const smid = String(mid || '').trim();
    const srid = String(rid || '').trim();
    const standalone = !smid && typeof State !== 'undefined' && State.momentsImageStudioStandalone;
    this._generatingPollTimer = setInterval(async () => {
      try {
        let rec = null;
        if (standalone) {
          const bundle = await this._loadStandaloneBundle();
          rec = this._findStandaloneRecord(bundle, srid);
        } else {
          const m = await Storage.dbGet('moments', smid);
          rec = this._findRecord(m, srid);
        }
        if (!rec || rec.status !== 'generating') {
          this._stopGeneratingPoll();
          if (this._isActiveStudioRecord(smid, srid) && rec) {
            this._loadRecordIntoEditor(rec);
            this._setGenerateUiBusy(false);
          }
        }
      } catch (e) {}
    }, 2000);
  },

  async _recoverStaleGeneratingStandalone(rid) {
    const srid = String(rid || '').trim();
    const bundle = await this._loadStandaloneBundle();
    let rec = this._findStandaloneRecord(bundle, srid);
    if (!rec || rec.status !== 'generating') return rec;
    const staleMs = 15 * 60 * 1000;
    const started = Number(rec.generatingStartedAt) || 0;
    let stale = started > 0 && Date.now() - started > staleMs;
    if (!started) {
      const u = Number(rec.updatedAt) || 0;
      if (u && Date.now() - u > staleMs) stale = true;
    }
    if (stale) {
      rec.status = 'error';
      rec.errorMessage = '生成超时或已中断，请重试';
      try {
        delete rec.generatingStartedAt;
      } catch (e) {}
      this._upsertStandaloneRecord(bundle, rec);
      await this._saveStandaloneBundle(bundle);
      return rec;
    }
    return rec;
  },

  async _recoverStaleGeneratingIfNeeded(mid, rid) {
    const smid = String(mid || '').trim();
    const srid = String(rid || '').trim();
    if (!smid) {
      return this._recoverStaleGeneratingStandalone(srid);
    }
    const m = await Storage.dbGet('moments', smid);
    let rec = this._findRecord(m, srid);
    if (!rec || rec.status !== 'generating') return rec;

    const staleMs = 15 * 60 * 1000;
    const started = Number(rec.generatingStartedAt) || 0;
    let stale = started > 0 && Date.now() - started > staleMs;
    if (!started) {
      const u = Number(rec.updatedAt) || 0;
      if (u && Date.now() - u > staleMs) stale = true;
    }
    if (stale) {
      rec.status = 'error';
      rec.errorMessage = '生成超时或已中断，请重试';
      try {
        delete rec.generatingStartedAt;
      } catch (e) {}
      this._upsertRecord(m, rec);
      await Storage.dbPut('moments', m);
      return rec;
    }
    return rec;
  },

  async _syncGeneratingStateAfterLoad(mid) {
    const rid = String(State?.momentsImageStudioRecordId || '').trim();
    if (!rid) return;

    if (typeof State !== 'undefined' && State.momentsImageStudioStandalone) {
      const bundle0 = await this._loadStandaloneBundle();
      const before = this._findStandaloneRecord(bundle0, rid);
      const wasGenerating = before?.status === 'generating';
      await this._recoverStaleGeneratingStandalone(rid);
      const bundle = await this._loadStandaloneBundle();
      const rec = this._findStandaloneRecord(bundle, rid);
      if (!rec) return;
      if (wasGenerating && rec.status !== 'generating') {
        this._loadRecordIntoEditor(rec);
      }
      if (rec.status === 'generating') {
        this._setGenerateUiBusy(true);
        this._startGeneratingPoll('', rid);
      } else {
        this._setGenerateUiBusy(false);
        this._stopGeneratingPoll();
      }
      return;
    }

    if (!String(mid || '').trim()) return;

    const m0 = await Storage.dbGet('moments', mid);
    const before = this._findRecord(m0, rid);
    const wasGenerating = before?.status === 'generating';

    await this._recoverStaleGeneratingIfNeeded(mid, rid);

    const m = await Storage.dbGet('moments', mid);
    const rec = this._findRecord(m, rid);
    if (!rec) return;

    if (wasGenerating && rec.status !== 'generating') {
      this._loadRecordIntoEditor(rec);
    }

    if (rec.status === 'generating') {
      this._setGenerateUiBusy(true);
      this._startGeneratingPoll(mid, rid);
    } else {
      this._setGenerateUiBusy(false);
      this._stopGeneratingPoll();
    }
  },

  async _reloadActiveRecordFromDb() {
    const rid = String(State?.momentsImageStudioRecordId || '').trim();
    if (!rid) return;
    if (typeof State !== 'undefined' && State.momentsImageStudioStandalone) {
      const bundle = await this._loadStandaloneBundle();
      const rec = this._findStandaloneRecord(bundle, rid);
      if (rec) {
        this._loadRecordIntoEditor(rec);
        await this._syncGeneratingStateAfterLoad('');
      }
      return;
    }
    const mid = String(State?.momentsImageStudioMomentId || '').trim();
    if (!mid) return;
    const m = await Storage.dbGet('moments', mid);
    const rec = this._findRecord(m, rid);
    if (rec) {
      this._loadRecordIntoEditor(rec);
      await this._syncGeneratingStateAfterLoad(mid);
    }
  },

  async _appendRunToRecordInIdb(mid, rid, enriched) {
    const smid = String(mid || '').trim();
    const srid = String(rid || '').trim();
    if (!smid) {
      const bundle = await this._loadStandaloneBundle();
      const rec = this._findStandaloneRecord(bundle, srid);
      if (!rec) return { savedToAlbum: 0, total: 0 };
      this._migrateRecordShape(rec);
      const albumIds = await this._saveGeneratedImagesToAlbum(enriched);
      const runs = Array.isArray(rec.generationRuns) ? [...rec.generationRuns] : [];
      const newRun = {
        id: this._uuid(),
        at: Date.now(),
        images: enriched.map((x, i) => {
          const o = { ...this._serializeStoredImage(x) };
          if (albumIds[i]) o.albumId = albumIds[i];
          return o;
        }),
        selectedIdx: null
      };
      runs.push(newRun);
      rec.generationRuns = runs;
      rec.selectedGenerationRunIndex = runs.length - 1;
      rec.selectedIdx = null;
      rec.status = 'done';
      rec.errorMessage = '';
      try {
        delete rec.generatingStartedAt;
      } catch (e) {}
      this._upsertStandaloneRecord(bundle, rec);
      await this._saveStandaloneBundle(bundle);
      const savedToAlbum = albumIds.filter(Boolean).length;
      return { savedToAlbum, total: enriched.length };
    }

    const m = await Storage.dbGet('moments', smid);
    if (!m) return { savedToAlbum: 0, total: 0 };
    const rec = this._findRecord(m, srid);
    if (!rec) return { savedToAlbum: 0, total: 0 };

    this._migrateRecordShape(rec);
    const albumIds = await this._saveGeneratedImagesToAlbum(enriched);
    const runs = Array.isArray(rec.generationRuns) ? [...rec.generationRuns] : [];
    const newRun = {
      id: this._uuid(),
      at: Date.now(),
      images: enriched.map((x, i) => {
        const o = { ...this._serializeStoredImage(x) };
        if (albumIds[i]) o.albumId = albumIds[i];
        return o;
      }),
      selectedIdx: null
    };
    runs.push(newRun);
    rec.generationRuns = runs;
    rec.selectedGenerationRunIndex = runs.length - 1;
    rec.selectedIdx = null;
    rec.status = 'done';
    rec.errorMessage = '';
    try {
      delete rec.generatingStartedAt;
    } catch (e) {}

    this._upsertRecord(m, rec);
    this._syncLegacyDraftFromRecord(m, rec);
    await Storage.dbPut('moments', m);
    const savedToAlbum = albumIds.filter(Boolean).length;
    return { savedToAlbum, total: enriched.length };
  },

  async _setRecordGenerationFailed(mid, rid, err) {
    const msg = String(err && err.message ? err.message : err || '生成失败');
    const smid = String(mid || '').trim();
    const srid = String(rid || '').trim();
    if (!smid) {
      const bundle = await this._loadStandaloneBundle();
      const rec = this._findStandaloneRecord(bundle, srid);
      if (!rec) return;
      rec.status = 'error';
      rec.errorMessage = msg;
      try {
        delete rec.generatingStartedAt;
      } catch (e) {}
      this._upsertStandaloneRecord(bundle, rec);
      await this._saveStandaloneBundle(bundle);
      return;
    }
    const m = await Storage.dbGet('moments', smid);
    if (!m) return;
    const rec = this._findRecord(m, srid);
    if (!rec) return;
    rec.status = 'error';
    rec.errorMessage = msg;
    try {
      delete rec.generatingStartedAt;
    } catch (e) {}
    this._upsertRecord(m, rec);
    await Storage.dbPut('moments', m);
  },

  async _runGenerationJob(ctx) {
    const { mid, rid, prompt, refDataUrls, hasRef, opts } = ctx;
    try {
      let normalized;
      if (hasRef) {
        if (typeof ImageGenerationApi === 'undefined' || !ImageGenerationApi.editFromPromptAndImageUrls) {
          throw new Error('生图模块未加载');
        }
        normalized = await ImageGenerationApi.editFromPromptAndImageUrls(prompt, refDataUrls, opts);
      } else {
        if (typeof ImageGenerationApi === 'undefined' || !ImageGenerationApi.generateFromDescription) {
          throw new Error('生图模块未加载');
        }
        normalized = await ImageGenerationApi.generateFromDescription(prompt, opts);
      }

      const enriched = await this._enrichImagesForStorage(normalized.images || []);
      if (!enriched.length) throw new Error('接口未返回图片数据');

      const albumStat = await this._appendRunToRecordInIdb(mid, rid, enriched);
      if (albumStat && albumStat.savedToAlbum > 0 && typeof Notifications !== 'undefined' && Notifications.enqueue) {
        const t =
          albumStat.savedToAlbum >= albumStat.total
            ? '生成结果已同步到相册'
            : `部分图片已存入相册（${albumStat.savedToAlbum}/${albumStat.total}）`;
        Notifications.enqueue('相册', '', t, 0, '消息');
      }

      try {
        window.dispatchEvent(
          new CustomEvent('yd:mis:gen-complete', { detail: { mid, rid, ok: true } })
        );
      } catch (e) {}

      try {
        window.dispatchEvent(new CustomEvent('yd:moments:changed', { detail: { source: 'moments_image_studio_gen', momentId: mid } }));
      } catch (e) {}
    } catch (e) {
      const msg = String(e && e.message ? e.message : e || '生成失败');
      await this._setRecordGenerationFailed(mid, rid, msg);

      try {
        window.dispatchEvent(
          new CustomEvent('yd:mis:gen-complete', { detail: { mid, rid, ok: false, message: msg } })
        );
      } catch (e3) {}

      if (this._isActiveStudioRecord(mid, rid)) {
        alert(msg);
      }

      try {
        window.dispatchEvent(new CustomEvent('yd:moments:changed', { detail: { source: 'moments_image_studio_gen_err', momentId: mid } }));
      } catch (e4) {}
    }
  },

  _uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  },

  /**
   * @param {{ linkedMomentId?: string|null }} [opts] 关联朋友圈 id；独立生图为 null
   */
  _newRecord(opts = {}) {
    const lm = opts && opts.linkedMomentId != null ? String(opts.linkedMomentId).trim() : '';
    return {
      id: this._uuid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      linkedMomentId: lm || null,
      prompt: '',
      draft: { refs: [], n: '1', size: '', quality: '', format: '', responseFormat: '', inputFidelity: '' },
      status: 'draft',
      errorMessage: '',
      generationRuns: [],
      selectedGenerationRunIndex: null,
      selectedIdx: null
    };
  },

  /** 将旧版 results 迁入 generationRuns（仅内存；下次 persist 写入库） */
  _migrateRecordShape(rec) {
    if (!rec || typeof rec !== 'object') return;
    if (Array.isArray(rec.generationRuns) && rec.generationRuns.length > 0) return;
    const legacy = Array.isArray(rec.results) ? rec.results : [];
    rec.generationRuns = [];
    if (legacy.length > 0) {
      const sel = rec.selectedIdx != null && Number.isFinite(Number(rec.selectedIdx)) ? Math.floor(Number(rec.selectedIdx)) : null;
      rec.generationRuns.push({
        id: this._uuid(),
        at: Number(rec.updatedAt || rec.createdAt) || Date.now(),
        images: legacy.map((x) => ({
          dataUrl: x && x.dataUrl != null ? String(x.dataUrl) : null,
          url: x && x.url != null ? String(x.url) : null,
          b64: x && x.b64 != null ? String(x.b64) : null
        })),
        selectedIdx: sel
      });
      rec.selectedGenerationRunIndex = 0;
    }
  },

  _previewRowFromStored(x) {
    const row = {
      dataUrl: x && x.dataUrl != null ? String(x.dataUrl) : null,
      url: x && x.url != null ? String(x.url) : null,
      b64: x && x.b64 != null ? String(x.b64) : null
    };
    if (x && x.albumId != null && String(x.albumId).trim()) row.albumId = String(x.albumId).trim();
    return row;
  },

  _serializeStoredImage(x) {
    const o = {
      dataUrl: x && x.dataUrl != null ? String(x.dataUrl) : null,
      url: x && x.url != null ? String(x.url) : null,
      b64: x && x.b64 != null ? String(x.b64) : null
    };
    if (x && x.albumId != null && String(x.albumId).trim()) o.albumId = String(x.albumId).trim();
    return o;
  },

  /** 为每张生成图写入相册，返回与 enriched 等长的 album 条目 id（失败为 null） */
  async _saveGeneratedImagesToAlbum(enriched) {
    const list = Array.isArray(enriched) ? enriched : [];
    const ids = [];
    for (let i = 0; i < list.length; i++) {
      let aid = null;
      try {
        const one = await this._enrichSingleImageForStorage(this._serializeStoredImage(list[i]));
        const data = one.dataUrl || one.url;
        if (!data) {
          ids.push(null);
          continue;
        }
        const all =
          (typeof Storage !== 'undefined' && Storage.dbGetAll && (await Storage.dbGetAll('album'))) || [];
        const usedDesc = new Set(
          (all || [])
            .map((it) => (it && typeof it.description === 'string' ? it.description.trim() : ''))
            .filter(Boolean)
        );
        let desc = `朋友圈生图_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
        let guard = 0;
        while (usedDesc.has(desc) && guard < 20) {
          desc = `朋友圈生图_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
          guard += 1;
        }
        const id =
          typeof State !== 'undefined' && typeof State.generateId === 'function'
            ? State.generateId()
            : `a_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await Storage.dbAdd('album', {
          id,
          data,
          name: '生图.png',
          description: desc,
          type: 'image',
          createdAt: Date.now()
        });
        aid = id;
      } catch (e) {
        console.error('[MomentsImageStudio] 生成图写入相册失败:', e);
      }
      ids.push(aid);
    }
    try {
      if (typeof window.Album !== 'undefined' && typeof window.Album.loadAlbum === 'function') {
        await window.Album.loadAlbum();
      }
    } catch (e) {}
    return ids;
  },

  _previewSrc(row) {
    if (!row) return '';
    if (row.dataUrl) return row.dataUrl;
    if (row.url) return row.url;
    if (row.b64) return `data:image/png;base64,${String(row.b64)}`;
    return '';
  },

  async _enrichSingleImageForStorage(img) {
    const out = {
      dataUrl: img?.dataUrl != null ? String(img.dataUrl) : null,
      url: img?.url != null ? String(img.url).trim() : null,
      b64: img?.b64 != null ? String(img.b64).trim() : null
    };
    /* 已是 data: 图片（含接口给的 base64）→ 直接入库 */
    if (out.dataUrl && /^data:image\//i.test(out.dataUrl)) return out;
    if (out.b64) {
      out.dataUrl = `data:image/png;base64,${out.b64}`;
      return out;
    }
    /* 仅 URL → 尽量拉取为 Blob 再存成 data URL 写入 IndexedDB；跨域失败则保留 url */
    if (out.url && /^https?:\/\//i.test(out.url)) {
      try {
        const r = await fetch(out.url, { mode: 'cors', credentials: 'omit' });
        if (r.ok) {
          const blob = await r.blob();
          const dataUrl = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ''));
            fr.onerror = () => reject(new Error('read'));
            fr.readAsDataURL(blob);
          });
          if (dataUrl && /^data:image\//i.test(dataUrl)) {
            out.dataUrl = dataUrl;
            out.url = null;
          }
        }
      } catch (e) {
        /* 保留 url */
      }
    }
    return out;
  },

  async _enrichImagesForStorage(images) {
    const arr = Array.isArray(images) ? images : [];
    const out = [];
    for (const im of arr) {
      if (!im || (!im.dataUrl && !im.url && !im.b64)) continue;
      out.push(await this._enrichSingleImageForStorage(im));
    }
    return out;
  },

  _flushPreviewToActiveRun() {
    const i = this._activeGenerationRunIndex;
    if (i < 0 || !this._generationRuns || !this._generationRuns[i]) return;
    this._generationRuns[i].images = this._previewList.map((x) => this._serializeStoredImage(x));
    this._generationRuns[i].selectedIdx = this._selectedIdx;
  },

  _renderRunSelector() {
    const wrap = document.getElementById('mis-result-runs-wrap');
    const sel = document.getElementById('mis-result-run-select');
    if (!wrap || !sel) return;
    const n = (this._generationRuns || []).length;
    sel.innerHTML = '';
    if (n === 0) {
      wrap.hidden = true;
      return;
    }
    for (let i = 0; i < n; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `第 ${i + 1} 次生成`;
      sel.appendChild(o);
    }
    const cur = Math.max(0, Math.min(this._activeGenerationRunIndex, n - 1));
    sel.value = String(cur);
    wrap.hidden = n < 2;
  },

  _onRunSelectChange() {
    const sel = document.getElementById('mis-result-run-select');
    const v = Number(sel?.value);
    if (!Number.isFinite(v) || v < 0 || v >= (this._generationRuns || []).length) return;
    if (v === this._activeGenerationRunIndex) return;
    this._flushPreviewToActiveRun();
    this._activeGenerationRunIndex = v;
    const run = this._generationRuns[v];
    this._previewList = (run.images || []).map((x) => this._previewRowFromStored(x));
    const si = run.selectedIdx;
    this._selectedIdx = si != null && Number.isFinite(Number(si)) ? Math.floor(Number(si)) : null;
    void this._persistRecordSnapshot();
    this._renderResultGridOnly();
  },

  async _openResultLightbox(idx) {
    const src = this._previewSrc(this._previewList[idx]);
    if (!src) return;
    const lb = document.getElementById('mis-result-lightbox');
    const img = document.getElementById('mis-result-lightbox-img');
    if (!lb || !img) return;
    this._resetLightboxZoom();
    img.src = src;
    lb.dataset.idx = String(idx);
    await this._syncLightboxAlbumButton(idx);
    try {
      lb.inert = false;
    } catch (e) {}
    lb.hidden = false;
    lb.setAttribute('aria-hidden', 'false');
  },

  async _syncLightboxAlbumButton(idx) {
    const pickBtn = document.getElementById('mis-result-lightbox-save');
    if (!pickBtn || !Number.isFinite(idx) || idx < 0 || idx >= this._previewList.length) return;
    const row = this._previewList[idx];
    const standalone = !!(typeof State !== 'undefined' && State.momentsImageStudioStandalone);
    const mid = String(State?.momentsImageStudioMomentId || '').trim();
    let shell = false;
    if (mid) {
      try {
        const m = await Storage.dbGet('moments', mid);
        shell = !!(m && m.imageStudioShellOnly === true);
      } catch (e) {}
    }
    if (standalone || !mid) {
      pickBtn.textContent = row?.albumId ? '已保存到相册' : '保存到相册';
      pickBtn.dataset.action = row?.albumId ? 'open-album' : 'save';
      pickBtn.removeAttribute('disabled');
      return;
    }
    if (shell) {
      pickBtn.textContent = row?.albumId ? '已保存到相册' : '保存到相册';
      pickBtn.dataset.action = row?.albumId ? 'open-album' : 'save';
    } else {
      pickBtn.textContent = '应用到朋友圈';
      pickBtn.dataset.action = 'apply-moment';
    }
    pickBtn.removeAttribute('disabled');
  },

  _closeResultLightbox() {
    const lb = document.getElementById('mis-result-lightbox');
    if (!lb) return;
    this._resetLightboxZoom();
    try {
      const ae = document.activeElement;
      if (ae && lb.contains(ae) && typeof ae.blur === 'function') ae.blur();
    } catch (e) {}
    const img = document.getElementById('mis-result-lightbox-img');
    if (img) {
      img.removeAttribute('src');
      img.alt = '';
    }
    const pickBtn = document.getElementById('mis-result-lightbox-save');
    if (pickBtn) {
      pickBtn.textContent = '应用到朋友圈';
      pickBtn.dataset.action = 'apply-moment';
      pickBtn.disabled = false;
    }
    try {
      lb.inert = true;
    } catch (e) {}
    lb.hidden = true;
    lb.setAttribute('aria-hidden', 'true');
  },

  async _onLightboxAlbumButtonClick() {
    const lb = document.getElementById('mis-result-lightbox');
    const pickBtn = document.getElementById('mis-result-lightbox-save');
    const idx = Number(lb?.dataset?.idx);
    if (!Number.isFinite(idx) || idx < 0 || idx >= this._previewList.length) return;
    const row = this._previewList[idx];
    const action = String(pickBtn?.dataset?.action || '').trim();

    if (action === 'apply-moment') {
      await this._applyLightboxImageToMoment(idx);
      return;
    }
    if (action === 'open-album' && row?.albumId) {
      this._closeResultLightbox();
      if (typeof window.Album !== 'undefined' && typeof window.Album.scheduleScrollToAlbumItem === 'function') {
        window.Album.scheduleScrollToAlbumItem(row.albumId);
      }
      if (typeof State !== 'undefined' && State.switchPage) State.switchPage('page-album');
      try {
        if (typeof window.Album !== 'undefined' && typeof window.Album.loadAlbum === 'function') {
          await window.Album.loadAlbum();
        }
      } catch (e) {}
      return;
    }
    await this._saveLightboxImageToAlbum();
  },

  /** 将当前预览图写入当前制作页所属朋友圈的配图（非「仅生图壳」朋友圈） */
  async _applyLightboxImageToMoment(idx) {
    if (typeof State !== 'undefined' && State.momentsImageStudioStandalone) {
      alert('独立生图记录请使用「已保存到相册」进入相册查看');
      return;
    }
    const mid = String(State?.momentsImageStudioMomentId || '').trim();
    if (!mid) {
      alert('缺少朋友圈条目');
      return;
    }
    const m0 = await Storage.dbGet('moments', mid);
    if (m0 && m0.imageStudioShellOnly === true) {
      alert('当前为独立生图记录，请使用「已保存到相册」进入相册查看');
      return;
    }
    if (!Number.isFinite(idx) || idx < 0 || idx >= this._previewList.length) return;
    const row = this._previewList[idx];
    const ser = this._serializeStoredImage(row);
    let enriched;
    try {
      enriched = await this._enrichSingleImageForStorage(ser);
    } catch (e) {
      alert('读取图片失败');
      return;
    }
    const dataUrl = enriched.dataUrl || enriched.url;
    if (!dataUrl) {
      alert('无法应用：缺少图像数据');
      return;
    }
    const pickBtn = document.getElementById('mis-result-lightbox-save');
    if (pickBtn) {
      pickBtn.disabled = true;
      pickBtn.textContent = '应用中…';
    }
    try {
      const m = await Storage.dbGet('moments', mid);
      if (!m) throw new Error('朋友圈不存在');
      m.images = [dataUrl];
      await Storage.dbPut('moments', m);
      try {
        window.dispatchEvent(
          new CustomEvent('yd:moments:changed', { detail: { source: 'moments_apply_studio_image', momentId: mid } })
        );
      } catch (e) {}
      if (typeof Moments !== 'undefined' && typeof Moments.renderList === 'function') {
        try {
          await Moments.renderList();
        } catch (e) {}
      }
      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        Notifications.enqueue('朋友圈', '', '已替换该条配图', 0, '消息');
      }
      this._closeResultLightbox();
    } catch (e) {
      alert(String(e && e.message ? e.message : e || '应用失败'));
    } finally {
      if (pickBtn) {
        pickBtn.disabled = false;
        void this._syncLightboxAlbumButton(idx);
      }
    }
  },

  async _saveLightboxImageToAlbum() {
    const lb = document.getElementById('mis-result-lightbox');
    const pickBtn = document.getElementById('mis-result-lightbox-save');
    const idx = Number(lb?.dataset?.idx);
    if (!Number.isFinite(idx) || idx < 0 || idx >= this._previewList.length) return;

    const row = this._previewList[idx];
    const ser = this._serializeStoredImage(row);
    let enriched;
    try {
      enriched = await this._enrichSingleImageForStorage(ser);
    } catch (e) {
      alert('读取图片失败');
      return;
    }
    const data = enriched.dataUrl || enriched.url;
    if (!data) {
      alert('无法保存：缺少图像数据');
      return;
    }

    if (pickBtn) {
      pickBtn.disabled = true;
      pickBtn.textContent = '保存中…';
    }
    try {
      const all = (typeof Storage !== 'undefined' && Storage.dbGetAll && (await Storage.dbGetAll('album'))) || [];
      const usedDesc = new Set(
        (all || [])
          .map((it) => (it && typeof it.description === 'string' ? it.description.trim() : ''))
          .filter(Boolean)
      );
      let desc = `生图_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      let guard = 0;
      while (usedDesc.has(desc) && guard < 12) {
        desc = `生图_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
        guard += 1;
      }
      const id =
        typeof State !== 'undefined' && typeof State.generateId === 'function'
          ? State.generateId()
          : `a_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await Storage.dbAdd('album', {
        id,
        data,
        name: '生图.png',
        description: desc,
        type: 'image',
        createdAt: Date.now()
      });

      this._previewList[idx] = { ...this._previewList[idx], albumId: id };
      this._flushPreviewToActiveRun();
      await this._persistRecordSnapshot();

      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        Notifications.enqueue('相册', '', '已保存到相册', 0, '消息');
      } else {
        alert('已保存到相册');
      }
      if (typeof window.Album !== 'undefined' && typeof window.Album.loadAlbum === 'function') {
        try {
          await window.Album.loadAlbum();
        } catch (e) {}
      }
      await this._syncLightboxAlbumButton(idx);
    } catch (e) {
      alert(String(e && e.message ? e.message : e || '保存失败'));
    } finally {
      if (pickBtn) {
        pickBtn.disabled = false;
        void this._syncLightboxAlbumButton(idx);
      }
    }
  },

  _getRecordsOrdered(m) {
    const arr = Array.isArray(m?.imageStudioRecords) ? [...m.imageStudioRecords] : [];
    arr.sort((a, b) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0));
    return arr;
  },

  _findRecord(m, id) {
    const sid = String(id || '').trim();
    if (!sid) return null;
    const arr = Array.isArray(m?.imageStudioRecords) ? m.imageStudioRecords : [];
    return arr.find((r) => r && String(r.id) === sid) || null;
  },

  _upsertRecord(m, rec) {
    const arr = Array.isArray(m.imageStudioRecords) ? [...m.imageStudioRecords] : [];
    const idx = arr.findIndex((r) => r && String(r.id) === String(rec.id));
    rec.updatedAt = Date.now();
    if (idx >= 0) arr[idx] = rec;
    else arr.push(rec);
    m.imageStudioRecords = arr;
  },

  _draftPayloadFromUi() {
    const nRaw = String(document.getElementById('mis-n')?.value ?? '').trim();
    const rfRaw = String(document.getElementById('mis-response-format')?.value || '').trim().toLowerCase();
    let responseFormat = '';
    if (rfRaw === 'url') responseFormat = 'url';
    else if (rfRaw === 'b64_json') responseFormat = 'b64_json';
    else responseFormat = '';
    const ifRaw = String(document.getElementById('mis-input-fidelity')?.value || '').trim().toLowerCase();
    const inputFidelity = ifRaw === 'low' || ifRaw === 'high' ? ifRaw : '';
    return {
      refs: this._refDataUrls.slice(0, this._refCap()),
      n: nRaw || '1',
      size: String(document.getElementById('mis-size')?.value || '').trim(),
      quality: String(document.getElementById('mis-quality')?.value || '').trim(),
      format: String(document.getElementById('mis-format')?.value || '').trim(),
      responseFormat,
      inputFidelity
    };
  },

  _syncLegacyDraftFromRecord(m, rec) {
    if (!rec?.draft || typeof rec.draft !== 'object') return;
    m.imageStudioDraft = {
      refs: Array.isArray(rec.draft.refs) ? rec.draft.refs : [],
      n: rec.draft.n != null ? String(rec.draft.n) : '1',
      size: String(rec.draft.size || ''),
      quality: String(rec.draft.quality || ''),
      format: String(rec.draft.format || ''),
      responseFormat:
        rec.draft.responseFormat === 'url'
          ? 'url'
          : rec.draft.responseFormat === 'b64_json'
            ? 'b64_json'
            : '',
      inputFidelity:
        rec.draft.inputFidelity === 'low' || rec.draft.inputFidelity === 'high' ? rec.draft.inputFidelity : ''
    };
  },

  async _migrateLegacyIfNeeded(m) {
    if (!m) return false;
    const hasRecords = Array.isArray(m.imageStudioRecords) && m.imageStudioRecords.length > 0;
    if (hasRecords) return false;

    const parsed =
      typeof Moments !== 'undefined' && Moments._extractMomentTextAndImageDesc
        ? Moments._extractMomentTextAndImageDesc(String(m.text || ''))
        : { imageDesc: '', text: '' };
    const prompt = String(parsed.imageDesc || '').trim();
    const legacyDraft = m.imageStudioDraft && typeof m.imageStudioDraft === 'object' ? m.imageStudioDraft : null;
    const hasLegacyRefs = legacyDraft && Array.isArray(legacyDraft.refs) && legacyDraft.refs.length > 0;

    if (!prompt && !hasLegacyRefs && !legacyDraft) return false;

    const rec = this._newRecord({ linkedMomentId: String(m.id) });
    rec.prompt = prompt;
    if (legacyDraft) {
      rec.draft = {
        refs: Array.isArray(legacyDraft.refs)
          ? legacyDraft.refs.filter((u) => typeof u === 'string' && /^data:image\/(png|jpeg|webp);/i.test(u)).slice(0, this._refCap())
          : [],
        n: legacyDraft.n != null ? String(legacyDraft.n) : '1',
        size: String(legacyDraft.size || ''),
        quality: String(legacyDraft.quality || ''),
        format: String(legacyDraft.format || ''),
        responseFormat:
          legacyDraft.responseFormat === 'url'
            ? 'url'
            : legacyDraft.responseFormat === 'b64_json'
              ? 'b64_json'
              : '',
        inputFidelity:
          legacyDraft.inputFidelity === 'low' || legacyDraft.inputFidelity === 'high'
            ? legacyDraft.inputFidelity
            : ''
      };
    }
    m.imageStudioRecords = [rec];
    m.imageStudioActiveRecordId = rec.id;
    m.imageStudioFeedRecordId = rec.id;
    await Storage.dbPut('moments', m);
    return true;
  },

  /** 补全朋友圈上「从配图入口应对应的生图记录 id」；不写无效 id */
  async _ensureMomentFeedLink(m) {
    if (!m || !m.id) return;
    const mid = String(m.id);
    const ordered = this._getRecordsOrdered(m);
    let feed = String(m.imageStudioFeedRecordId || '').trim();
    if (feed && this._findRecord(m, feed)) return;
    if (feed && !this._findRecord(m, feed)) feed = '';
    const active = String(m.imageStudioActiveRecordId || '').trim();
    if (active && this._findRecord(m, active)) {
      m.imageStudioFeedRecordId = active;
      await Storage.dbPut('moments', m);
      return;
    }
    if (ordered.length) {
      const fid = String(ordered[0].id);
      m.imageStudioFeedRecordId = fid;
      if (!m.imageStudioActiveRecordId || !this._findRecord(m, String(m.imageStudioActiveRecordId))) {
        m.imageStudioActiveRecordId = fid;
      }
      await Storage.dbPut('moments', m);
    }
  },

  /**
   * 从朋友圈「生图制作」进入前调用：若已有配图入口关联记录则返回其 id，否则新建并绑定。
   * 写入 moments.imageStudioFeedRecordId（配图入口锚点）与记录的 linkedMomentId。
   */
  async ensureFeedLinkedRecordForMoment(momentId) {
    const mid = String(momentId || '').trim();
    if (!mid) return null;
    let m = await Storage.dbGet('moments', mid);
    if (!m) return null;
    if (await this._migrateLegacyIfNeeded(m)) m = await Storage.dbGet('moments', mid);
    if (!m) return null;

    await this._ensureMomentFeedLink(m);
    m = await Storage.dbGet('moments', mid);
    if (!m) return null;

    let feed = String(m.imageStudioFeedRecordId || '').trim();
    let rec = feed ? this._findRecord(m, feed) : null;
    if (rec) {
      if (String(m.imageStudioActiveRecordId || '') !== feed) {
        m.imageStudioActiveRecordId = feed;
        await Storage.dbPut('moments', m);
      }
      return feed;
    }

    const ordered = this._getRecordsOrdered(m);
    if (ordered.length) {
      const fid = String(ordered[0].id);
      m.imageStudioFeedRecordId = fid;
      m.imageStudioActiveRecordId = fid;
      await Storage.dbPut('moments', m);
      return fid;
    }

    const parsed =
      typeof Moments !== 'undefined' && Moments._extractMomentTextAndImageDesc
        ? Moments._extractMomentTextAndImageDesc(String(m.text || ''))
        : { imageDesc: '' };
    const seed = String(parsed.imageDesc || '').trim();
    rec = this._newRecord({ linkedMomentId: mid });
    rec.prompt = seed;
    this._upsertRecord(m, rec);
    feed = String(rec.id);
    m.imageStudioFeedRecordId = feed;
    m.imageStudioActiveRecordId = feed;
    await Storage.dbPut('moments', m);
    return feed;
  },

  async _pickActiveRecord(m) {
    if (!m || !m.id) return null;
    let wantId = String(State?.momentsImageStudioRecordId || '').trim();
    if (!wantId) {
      await this._ensureMomentFeedLink(m);
      m = (await Storage.dbGet('moments', String(m.id))) || m;
      wantId = String(m.imageStudioFeedRecordId || m.imageStudioActiveRecordId || '').trim();
    }
    const ordered = this._getRecordsOrdered(m);
    let rec = wantId ? this._findRecord(m, wantId) : null;
    if (!rec && ordered.length) {
      rec = ordered[0];
      wantId = String(rec.id);
    }
    if (!rec) {
      const mid = String(m.id);
      rec = this._newRecord({ linkedMomentId: mid });
      this._upsertRecord(m, rec);
      wantId = String(rec.id);
      m.imageStudioFeedRecordId = wantId;
      m.imageStudioActiveRecordId = wantId;
      await Storage.dbPut('moments', m);
    }
    if (String(m.imageStudioActiveRecordId || '') !== String(rec.id)) {
      m.imageStudioActiveRecordId = rec.id;
      await Storage.dbPut('moments', m);
    }
    if (typeof State !== 'undefined') State.momentsImageStudioRecordId = rec.id;
    return rec;
  },

  _clearResultPanel() {
    this._previewList = [];
    this._selectedIdx = null;
    this._generationRuns = [];
    this._activeGenerationRunIndex = -1;
    const panel = document.getElementById('mis-result-panel');
    const grid = document.getElementById('mis-result-grid');
    const rw = document.getElementById('mis-result-runs-wrap');
    const rsel = document.getElementById('mis-result-run-select');
    if (panel) panel.hidden = true;
    if (grid) grid.innerHTML = '';
    if (rw) rw.hidden = true;
    if (rsel) rsel.innerHTML = '';
    this._closeResultLightbox();
  },

  _renderRefGrid() {
    const grid = document.getElementById('mis-ref-grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.removeAttribute('data-empty');

    const maxRef = this._refCap();
    const canAdd = this._refDataUrls.length < maxRef;

    if (this._refDataUrls.length === 0) {
      grid.setAttribute('data-empty', '1');
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'mis-ref-empty';
      empty.setAttribute('aria-label', '上传参考图，支持 PNG、JPG、WebP');
      empty.innerHTML = `
        <span class="mis-ref-empty__icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2"/>
            <circle cx="8.5" cy="11" r="1.6"/>
            <path d="M21 17l-5.2-5.2a1 1 0 0 0-1.4 0L9 17"/>
          </svg>
        </span>
        <span class="mis-ref-empty__title">上传参考图</span>
        <span class="mis-ref-empty__sub">PNG / JPG / WebP，最多 ${maxRef} 张</span>
      `;
      empty.addEventListener('click', () => this._openRefPicker());
      grid.appendChild(empty);
    } else {
      this._refDataUrls.forEach((dataUrl, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'mis-ref-item';
        wrap.setAttribute('role', 'listitem');
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mis-ref-remove';
        btn.setAttribute('aria-label', '移除');
        btn.textContent = '×';
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._refDataUrls.splice(idx, 1);
          this._renderRefGrid();
        });
        wrap.appendChild(img);
        wrap.appendChild(btn);
        grid.appendChild(wrap);
      });

      if (canAdd) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'mis-ref-add';
        add.setAttribute('aria-label', '继续添加参考图');
        add.innerHTML = '<span class="mis-ref-add__plus">+</span>';
        add.addEventListener('click', () => this._openRefPicker());
        grid.appendChild(add);
      }
    }

    const hasRef = this._refDataUrls.length > 0;
    const sizeField = document.getElementById('mis-size-field');
    const qfRow = document.getElementById('mis-quality-format-row');
    const fidelityRow = document.getElementById('mis-input-fidelity-row');
    if (sizeField) sizeField.hidden = hasRef;
    if (qfRow) qfRow.hidden = hasRef;
    if (fidelityRow) fidelityRow.hidden = !hasRef;
  },

  async _onRefFilesChange(e) {
    const files = Array.from(e.target?.files || []).filter(Boolean);
    const accept = /^image\/(png|jpeg|webp)$/i;
    const maxRef = this._refCap();
    for (const f of files) {
      if (this._refDataUrls.length >= maxRef) break;
      if (!accept.test(f.type || '')) continue;
      const dataUrl = await this._readFileAsDataUrl(f);
      if (dataUrl) this._refDataUrls.push(dataUrl);
    }
    if (e.target) e.target.value = '';
    this._renderRefGrid();
  },

  _openRefPicker() {
    document.getElementById('mis-ref-files')?.click();
  },

  _readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  },

  _refCap() {
    return Number(CONFIG?.MOMENTS_IMAGE_STUDIO_REF_MAX) > 0 ? Math.floor(Number(CONFIG.MOMENTS_IMAGE_STUDIO_REF_MAX)) : 10;
  },

  _applyDefaultForm() {
    const nEl = document.getElementById('mis-n');
    if (nEl) nEl.value = '1';
    const sizeEl = document.getElementById('mis-size');
    if (sizeEl) sizeEl.value = '';
    const qEl = document.getElementById('mis-quality');
    if (qEl) qEl.value = '';
    const fEl = document.getElementById('mis-format');
    if (fEl) fEl.value = '';
    const rfEl = document.getElementById('mis-response-format');
    if (rfEl) rfEl.value = '';
    const infEl = document.getElementById('mis-input-fidelity');
    if (infEl) infEl.value = '';
  },

  _applyDraftToForm(draft) {
    if (!draft || typeof draft !== 'object') {
      this._applyDefaultForm();
      return;
    }
    const nEl = document.getElementById('mis-n');
    if (nEl) nEl.value = draft.n != null && String(draft.n).trim() !== '' ? String(draft.n).trim() : '1';
    const sizeEl = document.getElementById('mis-size');
    if (sizeEl) sizeEl.value = draft.size != null ? String(draft.size) : '';
    const qEl = document.getElementById('mis-quality');
    if (qEl) qEl.value = draft.quality != null ? String(draft.quality) : '';
    const fEl = document.getElementById('mis-format');
    if (fEl) fEl.value = draft.format != null ? String(draft.format) : '';
    const rfEl = document.getElementById('mis-response-format');
    if (rfEl) {
      const rf = String(draft.responseFormat || '').trim().toLowerCase();
      if (rf === 'url') rfEl.value = 'url';
      else if (rf === 'b64_json') rfEl.value = 'b64_json';
      else rfEl.value = '';
    }
    const infEl = document.getElementById('mis-input-fidelity');
    if (infEl) {
      const inf = String(draft.inputFidelity || '').trim().toLowerCase();
      if (inf === 'low' || inf === 'high') infEl.value = inf;
      else infEl.value = '';
    }
  },

  _renderResultGridOnly() {
    const panel = document.getElementById('mis-result-panel');
    const grid = document.getElementById('mis-result-grid');
    if (!panel || !grid) return;

    grid.innerHTML = '';
    this._previewList.forEach((_, idx) => {
      const wrap = document.createElement('button');
      wrap.type = 'button';
      wrap.className = 'mis-result-item';
      wrap.dataset.idx = String(idx);
      wrap.setAttribute('aria-label', `预览第 ${idx + 1} 张`);
      const img = document.createElement('img');
      img.src = this._previewSrc(this._previewList[idx]);
      img.alt = '';
      wrap.appendChild(img);
      wrap.addEventListener('click', () => void this._openResultLightbox(idx));
      grid.appendChild(wrap);
    });

    panel.hidden = this._previewList.length === 0;

    if (this._previewList.length === 1) {
      this._selectResult(0);
    }
  },

  _loadRecordIntoEditor(rec) {
    const ta = document.getElementById('mis-prompt');
    if (ta) ta.value = String(rec.prompt || '').trim();

    const maxRef = this._refCap();
    const d = rec.draft && typeof rec.draft === 'object' ? rec.draft : {};
    this._refDataUrls = Array.isArray(d.refs)
      ? d.refs.filter((u) => typeof u === 'string' && /^data:image\/(png|jpeg|webp);/i.test(u)).slice(0, maxRef)
      : [];
    this._applyDraftToForm(d);

    this._migrateRecordShape(rec);
    this._generationRuns = Array.isArray(rec.generationRuns)
      ? JSON.parse(JSON.stringify(rec.generationRuns))
      : [];

    let idx =
      rec.selectedGenerationRunIndex != null && Number.isFinite(Number(rec.selectedGenerationRunIndex))
        ? Math.floor(Number(rec.selectedGenerationRunIndex))
        : -1;
    if (idx < 0 || idx >= this._generationRuns.length) {
      idx = this._generationRuns.length > 0 ? this._generationRuns.length - 1 : -1;
    }
    this._activeGenerationRunIndex = idx;

    if (idx >= 0) {
      const run = this._generationRuns[idx];
      this._previewList = (run.images || []).map((x) => this._previewRowFromStored(x));
      const rsel = run.selectedIdx != null ? run.selectedIdx : rec.selectedIdx;
      this._selectedIdx = rsel != null && Number.isFinite(Number(rsel)) ? Math.floor(Number(rsel)) : null;
    } else {
      this._previewList = [];
      this._selectedIdx = null;
    }

    this._renderRefGrid();
    if (this._previewList.length === 0) {
      this._clearResultPanel();
    } else {
      this._renderRunSelector();
      this._renderResultGridOnly();
    }
  },

  async _persistRecordSnapshot(opts = {}) {
    const rid = String(State?.momentsImageStudioRecordId || '').trim();
    if (!rid) return;

    this._flushPreviewToActiveRun();
    const applyToRec = (rec) => {
      rec.prompt = String(document.getElementById('mis-prompt')?.value || '').trim();
      rec.draft = this._draftPayloadFromUi();
      if (opts.status) rec.status = opts.status;
      if (opts.status === 'generating') {
        rec.generatingStartedAt = Date.now();
      } else if (opts.status) {
        try {
          delete rec.generatingStartedAt;
        } catch (e) {}
      }
      if (opts.errorMessage != null) rec.errorMessage = String(opts.errorMessage || '');
      rec.generationRuns = JSON.parse(JSON.stringify(this._generationRuns || []));
      rec.selectedGenerationRunIndex = this._activeGenerationRunIndex >= 0 ? this._activeGenerationRunIndex : null;
      rec.selectedIdx = this._selectedIdx;
      try {
        delete rec.results;
      } catch (e) {}
    };

    if (typeof State !== 'undefined' && State.momentsImageStudioStandalone) {
      const bundle = await this._loadStandaloneBundle();
      const rec = this._findStandaloneRecord(bundle, rid);
      if (!rec) return;
      applyToRec(rec);
      rec.linkedMomentId = null;
      this._upsertStandaloneRecord(bundle, rec);
      await this._saveStandaloneBundle(bundle);
      return;
    }

    const mid = String(State?.momentsImageStudioMomentId || '').trim();
    if (!mid) return;
    const m = await Storage.dbGet('moments', mid);
    if (!m) return;
    const rec = this._findRecord(m, rid);
    if (!rec) return;

    applyToRec(rec);
    if (!rec.linkedMomentId && mid) rec.linkedMomentId = mid;

    this._upsertRecord(m, rec);
    this._syncLegacyDraftFromRecord(m, rec);
    await Storage.dbPut('moments', m);
  },

  async _onEnter() {
    this._resetTransientUi();

    const fi = document.getElementById('mis-ref-files');
    if (fi) fi.value = '';

    if (typeof State !== 'undefined' && State.momentsImageStudioStandalone) {
      try {
        let bundle = await this._loadStandaloneBundle();
        let rid = String(State?.momentsImageStudioRecordId || '').trim();
        let rec = rid ? this._findStandaloneRecord(bundle, rid) : null;
        if (!rec && bundle.records.length) {
          const ordered = [...bundle.records].sort((a, b) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0));
          rec = ordered[0];
          rid = String(rec.id);
          State.momentsImageStudioRecordId = rid;
          bundle.activeRecordId = rid;
          await this._saveStandaloneBundle(bundle);
        }
        if (!rec) {
          rec = this._newRecord({ linkedMomentId: null });
          bundle.records = [...(bundle.records || []), rec];
          bundle.activeRecordId = rec.id;
          await this._saveStandaloneBundle(bundle);
          State.momentsImageStudioRecordId = rec.id;
        }
        this._loadRecordIntoEditor(rec);
        await this._syncGeneratingStateAfterLoad('');
      } catch (e) {
        const ta = document.getElementById('mis-prompt');
        if (ta) ta.value = '';
        this._refDataUrls = [];
        this._applyDefaultForm();
        this._renderRefGrid();
        this._clearResultPanel();
      }
      return;
    }

    const mid = String(State?.momentsImageStudioMomentId || '').trim();
    if (!mid) {
      if (typeof State !== 'undefined' && State.switchPage) State.switchPage('page-moments');
      return;
    }

    try {
      let m = await Storage.dbGet('moments', mid);
      if (!m) {
        if (typeof State !== 'undefined' && State.switchPage) State.switchPage('page-moments');
        return;
      }

      await this._migrateLegacyIfNeeded(m);
      m = await Storage.dbGet('moments', mid);

      const rec = await this._pickActiveRecord(m);
      this._loadRecordIntoEditor(rec);
      await this._syncGeneratingStateAfterLoad(mid);
    } catch (e) {
      const ta = document.getElementById('mis-prompt');
      if (ta) ta.value = '';
      this._refDataUrls = [];
      this._applyDefaultForm();
      this._renderRefGrid();
      this._clearResultPanel();
    }
  },

  _statusLabel(status) {
    if (status === 'done') return { cls: 'mis-records-item__badge--done', text: '已生成' };
    if (status === 'error') return { cls: 'mis-records-item__badge--error', text: '失败' };
    if (status === 'generating') return { cls: 'mis-records-item__badge--generating', text: '生成中' };
    return { cls: 'mis-records-item__badge--draft', text: '草稿' };
  },

  async _deleteStudioRecord({ momentId, recordId, standalone, listWrap }) {
    const rid = String(recordId || '').trim();
    if (!rid) return;
    if (!confirm('是否要删除生图记录？')) return;

    const wasActive = this._isActiveStudioRecord(standalone ? '' : momentId, rid);
    let deletedMomentId = '';

    this._recordsListRefreshInProgress = true;
    try {
      if (standalone) {
        const bundle = await this._loadStandaloneBundle();
        const before = (bundle.records || []).length;
        bundle.records = (bundle.records || []).filter((r) => r && String(r.id) !== rid);
        if (bundle.records.length === before) {
          alert('该生图记录已不存在');
          return;
        }
        if (String(bundle.activeRecordId || '').trim() === rid) {
          const ordered = [...bundle.records].sort(
            (a, b) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0)
          );
          bundle.activeRecordId = ordered[0] ? String(ordered[0].id) : null;
        }
        await this._saveStandaloneBundle(bundle);
        if (typeof State !== 'undefined' && State.momentsImageStudioStandalone && String(State.momentsImageStudioRecordId) === rid) {
          State.momentsImageStudioRecordId = bundle.activeRecordId || null;
        }
      } else {
        const mid = String(momentId || '').trim();
        if (!mid || mid === '__mis_standalone__') return;
        deletedMomentId = mid;
        const m = await Storage.dbGet('moments', mid);
        if (!m) {
          alert('该朋友圈已不存在');
          return;
        }
        const arr = Array.isArray(m.imageStudioRecords) ? m.imageStudioRecords : [];
        const next = arr.filter((r) => r && String(r.id) !== rid);
        if (next.length === arr.length) {
          alert('该生图记录已不存在');
          return;
        }
        m.imageStudioRecords = next;
        if (!next.length) {
          delete m.imageStudioFeedRecordId;
          delete m.imageStudioActiveRecordId;
          await Storage.dbPut('moments', m);
        } else {
          await this._ensureMomentFeedLink(m);
        }
        if (typeof State !== 'undefined' && !State.momentsImageStudioStandalone && String(State.momentsImageStudioRecordId) === rid) {
          const m2 = await Storage.dbGet('moments', mid);
          State.momentsImageStudioRecordId =
            String(m2?.imageStudioActiveRecordId || m2?.imageStudioFeedRecordId || '').trim() || null;
        }
      }

      this._genInflight.delete(rid);

      if (wasActive && typeof State !== 'undefined') {
        const stillRid = String(State.momentsImageStudioRecordId || '').trim();
        if (!stillRid) {
          const back = String(State.momentsImageStudioReturnPage || '').trim() || 'page-mis-records';
          if (State.switchPage) State.switchPage(back);
        } else if (State.currentPage === 'page-moments-image-studio') {
          await this._reloadStudioEditorFromState();
        }
      }

      this._closeAllRecordsItemMenus();
      if (listWrap) {
        const globalReturn = String(listWrap.dataset.globalReturnPageAfterOpen || '').trim();
        await this._renderRecordsListInto(
          listWrap,
          globalReturn ? { globalReturnPageAfterOpen: globalReturn } : {}
        );
      } else if (typeof State !== 'undefined' && State.currentPage === 'page-mis-records') {
        await this._onEnterGlobalRecordsPage();
      }
    } catch (e) {
      alert(String(e && e.message ? e.message : e || '删除失败'));
    } finally {
      this._recordsListRefreshInProgress = false;
    }

    if (deletedMomentId) {
      try {
        window.dispatchEvent(
          new CustomEvent('yd:moments:changed', {
            detail: { source: 'moments_image_studio_delete', momentId: deletedMomentId }
          })
        );
      } catch (e) {}
    }
  },

  async _onEnterGlobalRecordsPage() {
    const wrap = document.getElementById('mis-records-global-list');
    if (!wrap) return;
    await this._renderRecordsListInto(wrap, {});
  },

  /**
   * 生图记录页顶栏「+」：新建独立生图记录（不创建朋友圈），进入制作页。
   */
  async _createNewStudioFromRecordsPage() {
    try {
      const rec = this._newRecord({ linkedMomentId: null });
      let bundle = await this._loadStandaloneBundle();
      this._upsertStandaloneRecord(bundle, rec);
      bundle.activeRecordId = rec.id;
      await this._saveStandaloneBundle(bundle);

      if (typeof State !== 'undefined') {
        State.momentsImageStudioStandalone = true;
        State.momentsImageStudioMomentId = null;
        State.momentsImageStudioRecordId = rec.id;
        State.momentsImageStudioReturnPage = 'page-mis-records';
        if (State.switchPage) State.switchPage('page-moments-image-studio');
      }
    } catch (e) {
      alert(String(e && e.message ? e.message : e || '新建失败'));
    }
  },

  async _openStudioFromGlobalList(momentId, recordId, pickOpts = {}) {
    const rid = String(recordId || '').trim();
    if (!rid) return;

    if (String(momentId || '').trim() === '__mis_standalone__' || pickOpts.standalone) {
      const bundle = await this._loadStandaloneBundle();
      const rec = this._findStandaloneRecord(bundle, rid);
      if (!rec) {
        alert('该生图记录已不存在');
        return;
      }
      bundle.activeRecordId = rid;
      await this._saveStandaloneBundle(bundle);
      if (typeof State !== 'undefined') {
        State.momentsImageStudioStandalone = true;
        State.momentsImageStudioMomentId = null;
        State.momentsImageStudioRecordId = rid;
        const rp = String(pickOpts.returnPage || '').trim();
        State.momentsImageStudioReturnPage = rp || 'page-mis-records';
      }
      this._closeRecordsPanel();
      const onStudio = typeof State !== 'undefined' && State.currentPage === 'page-moments-image-studio';
      if (onStudio) {
        await this._reloadStudioEditorFromState();
      } else if (typeof State !== 'undefined' && State.switchPage) {
        State.switchPage('page-moments-image-studio');
      }
      return;
    }

    const mid = String(momentId || '').trim();
    if (!mid) return;
    const m = await Storage.dbGet('moments', mid);
    if (!m) {
      alert('该朋友圈已不存在');
      return;
    }
    const rec = this._findRecord(m, rid);
    if (!rec) {
      alert('该生图记录已不存在');
      return;
    }
    m.imageStudioActiveRecordId = rid;
    m.imageStudioFeedRecordId = rid;
    await Storage.dbPut('moments', m);
    if (typeof State !== 'undefined') {
      State.momentsImageStudioStandalone = false;
      State.momentsImageStudioMomentId = mid;
      State.momentsImageStudioRecordId = rid;
      const rp = String(pickOpts.returnPage || '').trim();
      State.momentsImageStudioReturnPage = rp || 'page-mis-records';
    }
    this._closeRecordsPanel();
    const onStudio = typeof State !== 'undefined' && State.currentPage === 'page-moments-image-studio';
    if (onStudio) {
      await this._reloadStudioEditorFromState();
    } else if (typeof State !== 'undefined' && State.switchPage) {
      State.switchPage('page-moments-image-studio');
    }
  },

  /** 已在制作页时切换 moment/record：State.switchPage 同页会 no-op，须直接重载编辑器 */
  async _reloadStudioEditorFromState() {
    const rid = String(State?.momentsImageStudioRecordId || '').trim();
    if (!rid) return;

    if (typeof State !== 'undefined' && State.momentsImageStudioStandalone) {
      const bundle = await this._loadStandaloneBundle();
      const rec = this._findStandaloneRecord(bundle, rid);
      if (!rec) return;
      this._closeResultLightbox();
      this._loadRecordIntoEditor(rec);
      await this._syncGeneratingStateAfterLoad('');
      return;
    }

    const mid = String(State?.momentsImageStudioMomentId || '').trim();
    if (!mid) return;
    const m = await Storage.dbGet('moments', mid);
    if (!m) return;
    const rec = this._findRecord(m, rid);
    if (!rec) return;
    this._closeResultLightbox();
    this._loadRecordIntoEditor(rec);
    await this._syncGeneratingStateAfterLoad(mid);
  },

  /**
   * 汇总所有朋友圈下的生图记录（与主屏「生图记录」页同源）。
   * @param {HTMLElement} wrap
   * @param {{ globalReturnPageAfterOpen?: string }} [opts] 从制作页浮层打开时传入，点选后写入 State.momentsImageStudioReturnPage
   */
  async _renderRecordsListInto(wrap, opts = {}) {
    const globalReturnAfter = String(opts.globalReturnPageAfterOpen || '').trim();
    if (!wrap) return;

    const seq = this._bumpRecordsListRenderSeq(wrap);

    if (globalReturnAfter) wrap.dataset.globalReturnPageAfterOpen = globalReturnAfter;
    else delete wrap.dataset.globalReturnPageAfterOpen;

    wrap.innerHTML = '';

    const items = await Storage.dbGetAll('moments');
    if (this._isRecordsListRenderStale(wrap, seq)) return;

    const moments = Array.isArray(items) ? items : [];
    const rows = [];
    moments.forEach((m) => {
      const mid = String(m?.id || '').trim();
      if (!mid) return;
      const ordered = this._getRecordsOrdered(m);
      ordered.forEach((rec) => {
        if (rec && rec.id) rows.push({ moment: m, rec, standalone: false });
      });
    });
    const sb = await this._loadStandaloneBundle();
    if (this._isRecordsListRenderStale(wrap, seq)) return;

    (sb.records || []).forEach((rec) => {
      if (rec && rec.id) rows.push({ moment: null, rec, standalone: true });
    });
    rows.sort((a, b) => (Number(b.rec?.updatedAt) || 0) - (Number(a.rec?.updatedAt) || 0));

    if (!rows.length) {
      if (this._isRecordsListRenderStale(wrap, seq)) return;
      const p = document.createElement('p');
      p.className = 'mis-records-empty';
      p.textContent = '暂无生图记录';
      wrap.appendChild(p);
      return;
    }

    if (this._isRecordsListRenderStale(wrap, seq)) return;

    const curMid = String(State?.momentsImageStudioMomentId || '').trim();
    const curRid = String(State?.momentsImageStudioRecordId || '').trim();
    const curStandalone = !!(typeof State !== 'undefined' && State.momentsImageStudioStandalone);

    const frag = document.createDocumentFragment();
    rows.forEach(({ moment, rec, standalone }) => {
      this._migrateRecordShape(rec);
      const mid = standalone ? '__mis_standalone__' : String(moment?.id || '').trim();
      const runCount = Array.isArray(rec.generationRuns) ? rec.generationRuns.length : 0;

      const card = document.createElement('div');
      card.className = 'mis-records-item';
      card.setAttribute('role', 'listitem');
      card.dataset.momentId = mid;
      card.dataset.recordId = String(rec.id);
      if (standalone) card.dataset.standalone = '1';
      if (standalone) {
        if (curStandalone && String(rec.id) === curRid) card.classList.add('is-active');
      } else if (mid && curMid === String(moment?.id || '').trim() && String(rec.id) === curRid && !curStandalone) {
        card.classList.add('is-active');
      }

      const menu = document.createElement('div');
      menu.className = 'mis-records-item-menu';
      const menuTrigger = document.createElement('button');
      menuTrigger.type = 'button';
      menuTrigger.className = 'mis-records-item-menu__trigger';
      menuTrigger.setAttribute('aria-label', '更多');
      menuTrigger.textContent = '⋮';
      const menuPanel = document.createElement('div');
      menuPanel.className = 'mis-records-item-menu__panel';
      menuPanel.hidden = true;
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'mis-records-item-menu__delete';
      deleteBtn.textContent = '删除';
      menuPanel.appendChild(deleteBtn);
      menu.appendChild(menuTrigger);
      menu.appendChild(menuPanel);

      menuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = menuPanel.hasAttribute('hidden');
        wrap.querySelectorAll('.mis-records-item-menu__panel').forEach((p) => p.setAttribute('hidden', ''));
        if (isHidden) menuPanel.removeAttribute('hidden');
      });
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuPanel.setAttribute('hidden', '');
        void this._deleteStudioRecord({
          momentId: mid,
          recordId: String(rec.id),
          standalone,
          listWrap: wrap
        });
      });

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mis-records-item__main';

      const thumb = document.createElement('img');
      thumb.className = 'mis-records-item__thumb';
      thumb.alt = '';
      const ts = this._thumbSrc(rec);
      thumb.src = ts || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

      const meta = document.createElement('div');
      meta.className = 'mis-records-item__meta';
      const time = document.createElement('div');
      time.className = 'mis-records-item__time';
      const t = Number(rec.updatedAt || rec.createdAt) || Date.now();
      time.textContent = new Date(t).toLocaleString();

      const hint = document.createElement('div');
      hint.className = 'mis-records-item__hint';
      const pt = String(rec.prompt || '').trim();
      hint.textContent = (standalone ? '独立生图 · ' : '') + (pt || '（无提示词）');

      meta.appendChild(time);
      meta.appendChild(hint);
      if (runCount > 1) {
        const runsEl = document.createElement('div');
        runsEl.className = 'mis-records-item__runs';
        runsEl.textContent = `共 ${runCount} 次生成`;
        meta.appendChild(runsEl);
      }

      const badge = document.createElement('span');
      const lab = this._statusLabel(rec.status);
      badge.className = `mis-records-item__badge ${lab.cls}`;
      badge.textContent = lab.text;

      btn.appendChild(thumb);
      btn.appendChild(meta);
      btn.appendChild(badge);
      btn.addEventListener('click', () =>
        void this._openStudioFromGlobalList(mid, String(rec.id), {
          ...(globalReturnAfter ? { returnPage: globalReturnAfter } : {}),
          ...(standalone ? { standalone: true } : {})
        })
      );
      card.appendChild(menu);
      card.appendChild(btn);
      frag.appendChild(card);
    });

    if (this._isRecordsListRenderStale(wrap, seq)) return;
    wrap.appendChild(frag);
  },

  _thumbSrc(rec) {
    this._migrateRecordShape(rec);
    const runs = Array.isArray(rec.generationRuns) ? rec.generationRuns : [];
    if (runs.length) {
      const last = runs[runs.length - 1];
      const imgs = last && Array.isArray(last.images) ? last.images : [];
      const first = imgs.find((x) => x && (x.dataUrl || x.url || x.b64));
      if (first) {
        if (first.dataUrl) return first.dataUrl;
        if (first.url) return first.url;
        if (first.b64) return `data:image/png;base64,${String(first.b64)}`;
      }
    }
    const res = Array.isArray(rec.results) ? rec.results : [];
    const leg = res.find((x) => x && (x.dataUrl || x.url));
    if (leg) return leg.dataUrl || leg.url || '';
    const refs = rec.draft && Array.isArray(rec.draft.refs) ? rec.draft.refs : [];
    return refs[0] || '';
  },

  async _renderRecordsList() {
    const wrap = document.getElementById('mis-records-list');
    if (!wrap) return;
    /* 与主屏「生图记录」页一致：展示全部朋友圈下的生图记录，避免仅从当前条朋友圈点进来只能看到一条 */
    const rp = String(State?.momentsImageStudioReturnPage || '').trim() || 'page-moments';
    await this._renderRecordsListInto(wrap, { globalReturnPageAfterOpen: rp });
  },

  _openRecordsPanel() {
    const el = document.getElementById('mis-records-overlay');
    if (!el) return;
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    void this._renderRecordsList();
  },

  _closeRecordsPanel() {
    const el = document.getElementById('mis-records-overlay');
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
  },

  async _createNewRecord() {
    if (typeof State !== 'undefined' && State.momentsImageStudioStandalone) {
      const rec = this._newRecord({ linkedMomentId: null });
      const bundle = await this._loadStandaloneBundle();
      this._upsertStandaloneRecord(bundle, rec);
      bundle.activeRecordId = rec.id;
      await this._saveStandaloneBundle(bundle);
      State.momentsImageStudioRecordId = rec.id;

      this._refDataUrls = [];
      const ta = document.getElementById('mis-prompt');
      if (ta) ta.value = '';
      this._applyDefaultForm();
      this._renderRefGrid();
      this._clearResultPanel();

      this._closeRecordsPanel();
      this._setGenerateUiBusy(false);
      this._stopGeneratingPoll();

      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        Notifications.enqueue('生图', '', '已新建一条记录', 0, '消息');
      }
      return;
    }

    const mid = String(State?.momentsImageStudioMomentId || '').trim();
    if (!mid) return;

    const m = await Storage.dbGet('moments', mid);
    if (!m) return;

    const rec = this._newRecord({ linkedMomentId: mid });
    this._upsertRecord(m, rec);
    m.imageStudioActiveRecordId = rec.id;
    m.imageStudioFeedRecordId = rec.id;
    await Storage.dbPut('moments', m);

    if (typeof State !== 'undefined') State.momentsImageStudioRecordId = rec.id;

    this._refDataUrls = [];
    const ta = document.getElementById('mis-prompt');
    if (ta) ta.value = '';
    this._applyDefaultForm();
    this._renderRefGrid();
    this._clearResultPanel();

    this._closeRecordsPanel();
    this._setGenerateUiBusy(false);
    this._stopGeneratingPoll();

    if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
      Notifications.enqueue('生图', '', '已新建一条记录', 0, '消息');
    }
  },

  async _saveDraft() {
    const prompt = String(document.getElementById('mis-prompt')?.value || '').trim();
    const btn = document.getElementById('mis-draft');
    const old = btn?.textContent;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '保存中…';
      }

      if (typeof State !== 'undefined' && State.momentsImageStudioStandalone) {
        const rid = String(State?.momentsImageStudioRecordId || '').trim();
        if (!rid) throw new Error('缺少记录');
        const bundle = await this._loadStandaloneBundle();
        let rec = this._findStandaloneRecord(bundle, rid);
        if (!rec) {
          rec = this._newRecord({ linkedMomentId: null });
          this._upsertStandaloneRecord(bundle, rec);
          State.momentsImageStudioRecordId = rec.id;
          bundle.activeRecordId = rec.id;
        }
        rec.prompt = prompt;
        rec.draft = this._draftPayloadFromUi();
        const keepGen = rec.status === 'generating';
        rec.status = keepGen ? 'generating' : 'draft';
        if (!keepGen) rec.errorMessage = '';
        rec.linkedMomentId = null;
        this._upsertStandaloneRecord(bundle, rec);
        await this._saveStandaloneBundle(bundle);
        if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
          Notifications.enqueue('生图', '', '草稿已保存', 0, '消息');
        }
        return;
      }

      const mid = String(State?.momentsImageStudioMomentId || '').trim();
      if (!mid) {
        alert('缺少朋友圈条目');
        return;
      }

      if (typeof Moments !== 'undefined' && Moments._persistMomentImageDesc) {
        await Moments._persistMomentImageDesc(mid, prompt);
      }
      const m = await Storage.dbGet('moments', mid);
      if (!m) throw new Error('朋友圈不存在');

      let rec = this._findRecord(m, State?.momentsImageStudioRecordId);
      if (!rec) {
        rec = this._newRecord({ linkedMomentId: mid });
        this._upsertRecord(m, rec);
        m.imageStudioActiveRecordId = rec.id;
        if (!String(m.imageStudioFeedRecordId || '').trim()) m.imageStudioFeedRecordId = rec.id;
        if (typeof State !== 'undefined') State.momentsImageStudioRecordId = rec.id;
      }

      rec.prompt = prompt;
      rec.draft = this._draftPayloadFromUi();
      const keepGen = rec.status === 'generating';
      rec.status = keepGen ? 'generating' : 'draft';
      if (!keepGen) rec.errorMessage = '';
      this._upsertRecord(m, rec);
      this._syncLegacyDraftFromRecord(m, rec);
      await Storage.dbPut('moments', m);

      try {
        window.dispatchEvent(new CustomEvent('yd:moments:changed', { detail: { source: 'moments_image_studio_draft', momentId: mid } }));
      } catch (e) {}

      if (typeof Moments !== 'undefined' && Moments.renderList) await Moments.renderList();

      if (typeof Notifications !== 'undefined' && Notifications.enqueue) {
        Notifications.enqueue('朋友圈', '', '草稿已保存', 0, '消息');
      }
    } catch (e) {
      alert(String(e && e.message ? e.message : e || '保存失败'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = old || '存草稿';
      }
    }
  },

  /** @returns {string|null} 有误则返回提示文案，通过则 null */
  _validateMisN() {
    const raw = String(document.getElementById('mis-n')?.value ?? '').trim();
    if (!raw) return '请填写生成张数 n';
    const nNum = Number(raw);
    const n = Math.floor(nNum);
    if (!Number.isFinite(nNum) || n < 1 || n > 10 || n !== nNum) {
      return '生成张数 n 须为 1～10 之间的整数';
    }
    return null;
  },

  _collectOptions(isEdit) {
    const nRaw = Number(document.getElementById('mis-n')?.value);
    const size = String(document.getElementById('mis-size')?.value || '').trim();
    const quality = String(document.getElementById('mis-quality')?.value || '').trim();
    const format = String(document.getElementById('mis-format')?.value || '').trim();
    const rfRaw = String(document.getElementById('mis-response-format')?.value || '').trim().toLowerCase();
    const responseFormat = rfRaw === 'url' ? 'url' : 'b64_json';

    const opts = { responseFormat };
    if (Number.isFinite(nRaw)) {
      const n = Math.floor(nRaw);
      if (n >= 1 && n <= 10) opts.n = n;
    }
    if (!isEdit) {
      if (size) opts.size = size;
      if (quality) opts.quality = quality;
      if (format === 'png' || format === 'jpeg' || format === 'webp') opts.format = format;
    } else {
      const ifRaw = String(document.getElementById('mis-input-fidelity')?.value || '').trim().toLowerCase();
      opts.inputFidelity = ifRaw === 'low' || ifRaw === 'high' ? ifRaw : '';
    }
    return opts;
  },

  _selectResult(idx) {
    if (idx < 0 || idx >= this._previewList.length) return;
    this._selectedIdx = idx;
    void this._persistRecordSnapshot();
  },

  async _runGenerate() {
    const standalone = !!(typeof State !== 'undefined' && State.momentsImageStudioStandalone);
    const mid = standalone ? '' : String(State?.momentsImageStudioMomentId || '').trim();
    const rid = String(State?.momentsImageStudioRecordId || '').trim();
    const prompt = String(document.getElementById('mis-prompt')?.value || '').trim();
    if (!rid || (!standalone && !mid)) {
      alert(standalone ? '缺少生图记录' : '缺少朋友圈条目');
      return;
    }
    if (!prompt) {
      alert('请填写提示词');
      return;
    }

    const nErr = this._validateMisN();
    if (nErr) {
      alert(nErr);
      return;
    }

    const baseOk =
      typeof Storage !== 'undefined' &&
      String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL) || '').trim() &&
      String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY) || '').trim();
    if (!baseOk) {
      alert('请先在「API 设置 → 生图设置」中配置接口地址与 Key');
      return;
    }

    const genKey = standalone ? `__std::${rid}` : `${mid}::${rid}`;
    if (this._genInflight.has(genKey)) {
      alert('当前记录正在生成中');
      return;
    }

    const hasRef = this._refDataUrls.length > 0;
    const refDataUrls = this._refDataUrls.slice();
    const opts = this._collectOptions(hasRef);

    try {
      await this._persistRecordSnapshot({ status: 'generating' });
    } catch (e) {
      alert(String(e && e.message ? e.message : e || '无法保存状态'));
      return;
    }

    this._genInflight.add(genKey);
    this._setGenerateUiBusy(true);

    void (async () => {
      try {
        await this._runGenerationJob({ mid, rid, prompt, refDataUrls, hasRef, opts });
      } finally {
        this._genInflight.delete(genKey);
      }
    })();
  }
};

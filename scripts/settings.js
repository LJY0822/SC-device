// 设置管理（iOS 风格入口 + 子页）
const Settings = {
  _formatApiMaxTokensDisplay(raw) {
    const defaultRaw = () => {
      const d = CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS;
      if (d === undefined || d === null) return 'unlimited';
      return String(d);
    };
    let v = String(raw || '').trim().toLowerCase();
    if (!v) v = String(defaultRaw()).trim().toLowerCase();
    if (v === 'unlimited') return '无上限';
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return this._formatApiMaxTokensDisplay(defaultRaw());
    if (n >= 1000000) {
      const m = n / 1000000;
      const label = Number.isInteger(m)
        ? String(m)
        : String(Math.round(m * 10) / 10).replace(/\.0$/, '');
      return `${label}m`;
    }
    if (n >= 1000 && n % 1000 === 0) return `${Math.floor(n / 1000)}k`;
    return String(Math.floor(n));
  },

  _defaultChatRoundsStr() {
    const n = Number(CONFIG && CONFIG.DEFAULT_CHAT_ROUNDS);
    return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '200';
  },

  /**
   * 旧版默认/选项「12k」已与新版默认「无上限」对齐：把仍存为 12000 的配置迁移为 unlimited。
   * 需在读取聊天相关逻辑之前调用一次（见 app.js）。
   */
  migrateLegacyApiMaxTokensFrom12000() {
    const shouldMigrate12k = (v) => {
      if (v === undefined || v === null || v === '') return false;
      if (typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === 12000) return true;
      const s = String(v).trim();
      return s === '12000';
    };
    try {
      const keyMax = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_MAX_TOKENS)
        ? CONFIG.STORAGE_KEYS.API_MAX_TOKENS
        : 'api_max_tokens';
      const rawMain = Storage.get(keyMax);
      if (shouldMigrate12k(rawMain)) Storage.set(keyMax, 'unlimited');

      const keys = this._getApiConfigStoreKeys();
      const presets = Storage.get(keys.presets);
      if (presets && typeof presets === 'object') {
        let presetDirty = false;
        Object.keys(presets).forEach((id) => {
          const p = presets[id];
          if (!p || !p.data || !shouldMigrate12k(p.data.apiMaxTokens)) return;
          p.data.apiMaxTokens = 'unlimited';
          presetDirty = true;
        });
        if (presetDirty) Storage.set(keys.presets, presets);
      }

      const defDraft = Storage.get(keys.defaultConfig);
      if (defDraft && typeof defDraft === 'object' && shouldMigrate12k(defDraft.apiMaxTokens)) {
        defDraft.apiMaxTokens = 'unlimited';
        Storage.set(keys.defaultConfig, defDraft);
      }
    } catch (e) {
      console.warn('migrateLegacyApiMaxTokensFrom12000 failed:', e);
    }
  },

  showToast(message, durationMs = 1600) {
    try {
      const id = 'yd-toast';
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.top = 'calc(12px + env(safe-area-inset-top, 0px))';
        el.style.transform = 'translateX(-50%)';
        el.style.zIndex = '9999';
        el.style.maxWidth = '88vw';
        el.style.padding = '10px 14px';
        el.style.borderRadius = '999px';
        el.style.background = 'rgba(0,0,0,0.72)';
        el.style.color = '#fff';
        el.style.fontSize = '13px';
        el.style.fontWeight = '600';
        el.style.letterSpacing = '0.2px';
        el.style.boxShadow = '0 10px 26px rgba(0,0,0,0.22)';
        el.style.backdropFilter = 'blur(14px)';
        el.style.webkitBackdropFilter = 'blur(14px)';
        el.style.opacity = '0';
        el.style.transition = 'opacity 160ms ease, transform 160ms ease';
        el.style.pointerEvents = 'none';
        document.body.appendChild(el);
      }
      el.textContent = message || '';
      el.style.transform = 'translateX(-50%) translateY(0)';
      requestAnimationFrame(() => {
        el.style.opacity = '1';
      });
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        const toast = document.getElementById(id);
        if (!toast) return;
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-6px)';
      }, Math.max(600, durationMs | 0));
    } catch (e) {
      // fallback: 不影响主流程
      console.log(message);
    }
  },
  init() {
    this.setupEvents();
    this.loadSettings();
  },

  setupEvents() {
    // 主设置页：返回主屏
    document.getElementById('settings-back').addEventListener('click', () => {
      State.backToHome();
    });

    // SC 用户装饰卡片：点击可编辑回显字段（名称/头像/备注）
    const profileRow = document.getElementById('settings-profile');
    if (profileRow) {
      profileRow.addEventListener('click', (e) => {
        e.preventDefault();
        this._openDecorProfileEditor();
      });
    }

    // 入口：API 设置 → 进入子页（进入时刷新回显）
    document.getElementById('settings-api').addEventListener('click', (e) => {
      e.preventDefault();
      State.apiSettingsReturnPage = 'page-settings';
      State.switchPage('page-settings-api');
      this.loadSettings();
    });

    const settingsImageGen = document.getElementById('settings-image-gen');
    if (settingsImageGen) {
      settingsImageGen.addEventListener('click', (e) => {
        e.preventDefault();
        State.imageGenSettingsReturnPage = 'page-settings';
        State.switchPage('page-settings-image-gen');
        this.loadImageGenFromStorage();
      });
    }

    const settingsImageGenBack = document.getElementById('settings-image-gen-back');
    if (settingsImageGenBack) {
      settingsImageGenBack.addEventListener('click', () => {
        const target = State.imageGenSettingsReturnPage || 'page-settings';
        State.imageGenSettingsReturnPage = null;
        State.switchPage(target);
      });
    }

    const genTestTa = document.getElementById('gen-test-prompt');
    if (genTestTa) {
      genTestTa.addEventListener('input', () => this._syncGenTestRunButtonState());
    }
    this._syncGenTestRunButtonState();
    const genTestRunBtn = document.getElementById('gen-test-run');
    if (genTestRunBtn) {
      genTestRunBtn.addEventListener('click', () => {
        this.runGenTestFromSettings();
      });
    }

    // API 子页：返回（来自聊天则回会话，否则回设置列表）
    document.getElementById('settings-api-back').addEventListener('click', () => {
      const target = State.apiSettingsReturnPage || 'page-settings';
      State.apiSettingsReturnPage = null;
      State.switchPage(target);
    });

    // 保存 API
    document.getElementById('save-api').addEventListener('click', () => {
      this.saveApiSettings();
    });
    const apiAutoVisionEl = document.getElementById('api-auto-vision');
    if (apiAutoVisionEl) {
      apiAutoVisionEl.addEventListener('change', () => {
        try {
          const k =
            CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CHAT_AUTO_VISION
              ? CONFIG.STORAGE_KEYS.CHAT_AUTO_VISION
              : 'chat_auto_vision';
          Storage.set(k, apiAutoVisionEl.checked ? 'on' : 'off');
        } catch (e) {}
      });
    }
    const apiStreamEl = document.getElementById('api-stream');
    if (apiStreamEl) {
      apiStreamEl.addEventListener('change', () => {
        try {
          const k =
            CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_STREAM
              ? CONFIG.STORAGE_KEYS.API_STREAM
              : 'api_stream';
          Storage.set(k, apiStreamEl.checked ? 'on' : 'off');
        } catch (e) {}
      });
    }
    const apiConfigSelect = document.getElementById('api-config-select');
    if (apiConfigSelect) {
      apiConfigSelect.addEventListener('change', () => {
        const nextPresetId = apiConfigSelect.value || '';
        const currentDraft = this._collectApiDraftFromForm();
        const hasUnsaved = !!this._apiConfigDirty || this._isApiDraftChanged(currentDraft, this._apiConfigLastAppliedDraft);
        if (hasUnsaved) {
          const ok = confirm('当前 API 配置有未保存变更，确定切换吗？');
          if (!ok) {
            apiConfigSelect.value = this._apiConfigLastSelectedId || '';
            return;
          }
        }
        this.switchApiConfigPreset(nextPresetId);
      });
    }
    const apiConfigAddBtn = document.getElementById('api-config-add');
    if (apiConfigAddBtn) {
      apiConfigAddBtn.addEventListener('click', () => {
        const name = prompt('请输入 API 配置名称：');
        if (!name || !name.trim()) return;
        this.createApiConfigPreset(name.trim());
      });
    }
    const apiConfigDeleteBtn = document.getElementById('api-config-delete');
    if (apiConfigDeleteBtn) {
      apiConfigDeleteBtn.addEventListener('click', () => {
        const selectEl = document.getElementById('api-config-select');
        const presetId = selectEl ? String(selectEl.value || '').trim() : '';
        if (!presetId) {
          alert('请先选择一个 API 配置');
          return;
        }
        if (!confirm('确定删除这个 API 配置吗？')) return;
        this.deleteApiConfigPreset(presetId);
      });
    }

    // API 弹窗：点击行打开
    document.getElementById('api-row-base-url').addEventListener('click', () => {
      this.openApiEditModal('base-url', 'API 地址', 'https://api.openai.com/v1');
    });
    document.getElementById('api-row-api-key').addEventListener('click', () => {
      this.openApiEditModal('api-key', 'API Key', '输入 API Key');
    });
    document.getElementById('api-row-chat-rounds').addEventListener('click', () => {
      this.openApiEditModal('chat-rounds', '记忆轮数', this._defaultChatRoundsStr(), { type: 'number', min: 1, max: 200 });
    });
    const apiMaxTokensRow = document.getElementById('api-row-max-tokens');
    if (apiMaxTokensRow) {
      apiMaxTokensRow.addEventListener('click', (e) => {
        e.preventDefault();
        this.openApiMaxTokensEditModal();
      });
    }
    const apiTemperatureRow = document.getElementById('api-row-temperature');
    if (apiTemperatureRow) {
      apiTemperatureRow.addEventListener('click', () => {
        this.openApiEditModal('api-temperature', '温度', '0.8', { type: 'number', min: 0, max: 2, step: '0.1' });
      });
    }
    document.getElementById('api-edit-cancel').addEventListener('click', () => this.closeApiEditModal());
    document.getElementById('api-edit-confirm').addEventListener('click', () => this.confirmApiEditModal());
    document.querySelector('.yd-api-modal__backdrop').addEventListener('click', () => this.closeApiEditModal());

    // 点击模型选择时自动拉取模型列表（延迟执行让下拉先打开）
    const modelRow = document.getElementById('api-row-model');
    const modelSelect = document.getElementById('api-model');
    const triggerFetch = () => setTimeout(() => this.fetchModelsFromApi(), 10);
    if (modelRow) modelRow.addEventListener('click', triggerFetch);
    if (modelSelect) modelSelect.addEventListener('focus', triggerFetch);
    if (modelSelect) modelSelect.addEventListener('change', () => this._markApiConfigDirty());

    const saveImageGenBtn = document.getElementById('save-image-gen');
    if (saveImageGenBtn) {
      saveImageGenBtn.addEventListener('click', () => {
        this.saveImageGenSettings();
      });
    }
    const imageGenConfigSelect = document.getElementById('image-gen-config-select');
    if (imageGenConfigSelect) {
      imageGenConfigSelect.addEventListener('change', () => {
        const nextPresetId = imageGenConfigSelect.value || '';
        const currentDraft = this._collectImageGenDraftFromForm();
        const hasUnsaved = !!this._imageGenConfigDirty
          || this._isImageGenDraftChanged(currentDraft, this._imageGenConfigLastAppliedDraft);
        if (hasUnsaved) {
          const ok = confirm('当前生图配置有未保存变更，确定切换吗？');
          if (!ok) {
            imageGenConfigSelect.value = this._imageGenConfigLastSelectedId || '';
            return;
          }
        }
        this.switchImageGenConfigPreset(nextPresetId);
      });
    }
    const imageGenConfigAddBtn = document.getElementById('image-gen-config-add');
    if (imageGenConfigAddBtn) {
      imageGenConfigAddBtn.addEventListener('click', () => {
        const name = prompt('请输入生图配置名称：');
        if (!name || !name.trim()) return;
        this.createImageGenConfigPreset(name.trim());
      });
    }
    const imageGenConfigDeleteBtn = document.getElementById('image-gen-config-delete');
    if (imageGenConfigDeleteBtn) {
      imageGenConfigDeleteBtn.addEventListener('click', () => {
        const selectEl = document.getElementById('image-gen-config-select');
        const presetId = selectEl ? String(selectEl.value || '').trim() : '';
        if (!presetId) {
          alert('请先选择一个生图配置');
          return;
        }
        if (!confirm('确定删除这个生图配置吗？')) return;
        this.deleteImageGenConfigPreset(presetId);
      });
    }
    const imageGenRowBase = document.getElementById('image-gen-row-base-url');
    if (imageGenRowBase) {
      imageGenRowBase.addEventListener('click', () => {
        this.openImageGenEditModal('image-gen-base-url', '生图 API 地址', 'https://api.openai.com/v1');
      });
    }
    const imageGenRowKey = document.getElementById('image-gen-row-api-key');
    if (imageGenRowKey) {
      imageGenRowKey.addEventListener('click', () => {
        this.openImageGenEditModal('image-gen-api-key', '生图 API Key', '输入 API Key');
      });
    }
    const imageGenModelRow = document.getElementById('image-gen-row-model');
    const imageGenModelSelect = document.getElementById('image-gen-model');
    const imageGenTriggerFetch = () => setTimeout(() => this.fetchModelsForImageGen(), 10);
    if (imageGenModelRow) imageGenModelRow.addEventListener('click', imageGenTriggerFetch);
    if (imageGenModelSelect) {
      imageGenModelSelect.addEventListener('focus', imageGenTriggerFetch);
      imageGenModelSelect.addEventListener('change', () => this._markImageGenConfigDirty());
    }
    const imageGenAutoMomentsEl = document.getElementById('image-gen-auto-moments');
    if (imageGenAutoMomentsEl) {
      imageGenAutoMomentsEl.addEventListener('change', () => {
        this._markImageGenConfigDirty();
        const key = CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS
          ? CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS
          : 'image_gen_auto_moments';
        Storage.set(key, imageGenAutoMomentsEl.checked ? 'on' : 'off');
      });
    }

    // 数据与存储入口
    document.getElementById('settings-clear-cache').addEventListener('click', (e) => {
      e.preventDefault();
      this.clearCache();
    });

    document.getElementById('settings-export').addEventListener('click', async (e) => {
      e.preventDefault();
      const row = document.getElementById('settings-export');
      if (row && row.dataset.exporting === '1') return;
      if (row) row.dataset.exporting = '1';
      try {
        await this.exportData();
      } finally {
        if (row) delete row.dataset.exporting;
      }
    });

    document.getElementById('settings-import').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
      this.importData(e.target.files[0]);
    });

    // 增量同步：一个入口管导出/导入，只传上次同步后的变化
    const syncRow = document.getElementById('settings-sync');
    if (syncRow) {
      syncRow.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await SCSync.openPanel();
        } catch (err) {
          this.showToast?.(`增量同步面板打开失败：${err.message}`);
        }
      });
    }
    const syncFileInput = document.getElementById('sc-sync-file');
    if (syncFileInput) {
      syncFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          const r = await SCSync.importFile(file);
          alert(`增量合并完成：新增 ${r.added} 项、更新 ${r.updated} 项、删除 ${r.removed} 项`);
          location.reload();
        } catch (err) {
          alert(`增量导入失败：${err.message}`);
        }
      });
    }

    // 安装到主屏幕（PWA）
    const installRow = document.getElementById('settings-install-app');
    if (installRow) {
      installRow.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          if (window.__ydIsAppInstalled) {
            this.showToast?.('已安装到主屏幕');
            return;
          }
          const deferredPrompt = window.__ydDeferredInstallPrompt;
          if (!deferredPrompt) {
            this.showToast?.('请在浏览器菜单中选择“添加到主屏幕”');
            return;
          }
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          window.__ydDeferredInstallPrompt = null;
          if (choice && choice.outcome === 'accepted') {
            this.showToast?.('已发起安装');
          } else {
            this.showToast?.('已取消安装');
          }
        } catch (err) {
          console.error('触发安装失败:', err);
          this.showToast?.('安装失败，请重试');
        }
      });
    }

    const forceRefreshRow = document.getElementById('settings-force-refresh-app');
    if (forceRefreshRow) {
      forceRefreshRow.addEventListener('click', (e) => {
        e.preventDefault();
        this.forceRefreshEntireApp();
      });
    }
    const storageCheckRow = document.getElementById('settings-storage-check');
    if (storageCheckRow) {
      storageCheckRow.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.runStorageHealthCheckAndRepair();
      });
    }

    // 回收站兜底：如果当前页面没带“回收站”DOM（例如 Service Worker 缓存了旧 HTML）
    // 就在“数据检测与修复”这一栏内部动态插入，避免你看不到。
    try {
      if ((!document.getElementById('yd-recycle-bin-list') || !document.getElementById('yd-recycle-bin-header')) && storageCheckRow) {
        const group = storageCheckRow.closest('.yd-settings-group') || storageCheckRow.parentElement;
        if (group) {
          const wrap = document.createElement('div');
          wrap.innerHTML = `
            <!-- 回收站（七天冷静期备份）：动态兜底 -->
            <div class="yd-settings-row" style="cursor: pointer; padding: 11px 16px;" id="yd-recycle-bin-header">
              <span class="yd-settings-row__icon yd-settings-row__icon--trash" aria-hidden="true"></span>
              <span class="yd-settings-row__main">
                <span class="yd-settings-row__title">回收站</span>
                <span class="yd-settings-row__subtitle" id="yd-recycle-bin-meta"></span>
              </span>
              <span class="yd-settings-row__chevron" aria-hidden="true"></span>
            </div>
            <div id="yd-recycle-bin-list" style="display:flex; flex-direction:column; gap:0;"></div>
          `;
          group.appendChild(wrap);
        }
      }
    } catch (e) {}

    // 回收站：点击后直接打开自定义弹窗（列表 + 单项恢复）
    const recycleHeaderEl = document.getElementById('yd-recycle-bin-header');
    if (recycleHeaderEl) {
      recycleHeaderEl.addEventListener('click', async (e) => {
        e.preventDefault?.();
        await this._openRecycleBinRestorePicker();
        try { await this._renderRecycleBinUi(); } catch (_) {}
      });
    }

    // 壁纸设置：进入「壁纸」页面，使用聊天页风格顶部 + 一行两列网格
    const wallpaperRow = document.getElementById('settings-wallpaper');
    if (wallpaperRow) {
      wallpaperRow.addEventListener('click', (e) => {
        e.preventDefault();
        // 先加载一次壁纸列表，再进入页面
        if (typeof Wallpaper !== 'undefined' && Wallpaper.loadWallpapers) {
          Wallpaper.loadWallpapers();
        }
        State.switchPage('page-wallpaper');
      });
    }

    // 语音设置入口
    const voiceRow = document.getElementById('settings-voice');
    if (voiceRow) {
      voiceRow.addEventListener('click', (e) => {
        e.preventDefault();
        State.switchPage('page-settings-voice');
        this.loadSettings();
        // 进入后如果还没加载过音色列表，尝试拉取一次
        setTimeout(() => this.fetchVoicesFromMiniMax(true), 30);
      });
    }

    const notifyModeRow = document.getElementById('settings-notify-mode');
    if (notifyModeRow) {
      notifyModeRow.addEventListener('click', (e) => {
        e.preventDefault();
        this.openNotifyModePicker(e.currentTarget);
      });
    }
    const timeAwarenessRow = document.getElementById('settings-time-awareness');
    if (timeAwarenessRow) {
      timeAwarenessRow.addEventListener('click', (e) => {
        e.preventDefault();
        this.openTimeAwarenessPicker(e.currentTarget);
      });
    }
    const homescreenDockRow = document.getElementById('settings-homescreen-dock');
    if (homescreenDockRow) {
      homescreenDockRow.addEventListener('click', (e) => {
        e.preventDefault();
        this.openHomescreenDockPicker(e.currentTarget);
      });
    }

    const bubbleBeautifyRow = document.getElementById('settings-bubble-beautify');
    if (bubbleBeautifyRow) {
      bubbleBeautifyRow.addEventListener('click', (e) => {
        e.preventDefault();
        State.switchPage('page-bubble-settings');
      });
    }

    const sessionBeautifyRow = document.getElementById('settings-session-beautify');
    if (sessionBeautifyRow) {
      sessionBeautifyRow.addEventListener('click', (e) => {
        e.preventDefault();
        State.sessionBeautifyReturnPage = 'page-settings';
        State.sessionBeautifyReturnSessionId = null;
        State.switchPage('page-session-beautify');
        if (typeof SessionBeautify !== 'undefined' && SessionBeautify.applyFromStorage) {
          SessionBeautify.applyFromStorage();
        }
      });
    }

    // 语音设置子页返回
    const voiceBack = document.getElementById('settings-voice-back');
    if (voiceBack) {
      voiceBack.addEventListener('click', () => {
        State.switchPage('page-settings');
      });
    }

    // 语音设置：保存/测试/获取音色
    document.getElementById('voice-save')?.addEventListener('click', () => this.saveVoiceSettings());
    document.getElementById('voice-test')?.addEventListener('click', async () => await this.testVoiceT2A());
    document.getElementById('voice-pick')?.addEventListener('click', async () => await this.openVoiceSettingsPicker());

    // 美化设置入口
    const beautifyConfigRow = document.getElementById('settings-beautify-config');
    if (beautifyConfigRow) {
      beautifyConfigRow.addEventListener('click', (e) => {
        e.preventDefault();
        State.switchPage('page-settings-beautify');
        this.initBeautifySettings();
      });
    }

    // 小组件美化入口：跳转到组件列表页
    const widgetsBeautifyRow = document.getElementById('settings-widgets-beautify');
    if (widgetsBeautifyRow) {
      widgetsBeautifyRow.addEventListener('click', (e) => {
        e.preventDefault();
        State.switchPage('page-widgets');
      });
    }

    // 组件列表页返回
    const widgetsBack = document.getElementById('widgets-back');
    if (widgetsBack) {
      widgetsBack.addEventListener('click', () => {
        const target = State.widgetsReturnPage || 'page-homescreen';
        State.widgetsReturnPage = null;
        State.switchPage(target);
      });
    }

    // 美化设置子页返回
    const beautifyBack = document.getElementById('settings-beautify-back');
    if (beautifyBack) {
      beautifyBack.addEventListener('click', () => {
        if (!this._confirmBeautifyUnsavedOrContinue('当前编辑内容未保存，确定要返回吗？')) {
          return;
        }
        // 返回前刷新主屏幕，确保预设更改生效
        if (typeof Homescreen !== 'undefined') {
          if (Homescreen.renderHomescreen) {
            Homescreen.renderHomescreen();
          }
          if (Homescreen.renderDock) {
            Homescreen.renderDock();
          }
        }
        State.switchPage('page-settings');
      });
    }

    // 新增组件页面返回
    const newWidgetBack = document.getElementById('settings-beautify-new-widget-back');
    if (newWidgetBack) {
      newWidgetBack.addEventListener('click', () => {
        if (!this._confirmBeautifyUnsavedOrContinue('当前编辑内容未保存，确定要返回吗？')) {
          return;
        }
        State.switchPage('page-settings-beautify');
        // 返回后重新初始化美化设置
        this.initBeautifySettings();
      });
    }

    // 时间日期样式页返回（未保存则提示）
    const timeDateBack = document.getElementById('time-date-style-back');
    if (timeDateBack) {
      timeDateBack.addEventListener('click', () => {
        if (this._timeDateDirty) {
          const ok = confirm('当前修改尚未保存，确定要退出吗？');
          if (!ok) return;
        }
        this._timeDateDirty = false;
        this._timeDateDraft = null;
        State.switchPage('page-widgets');
      });
    }

    // 时间日期样式页：保存/重置/实时预览
    const previewEl = document.getElementById('time-date-preview');
    const timeDateBgUploadBtn = document.getElementById('time-date-bg-upload-btn');
    const timeDateBgInput = document.getElementById('time-date-bg-input');
    const timeDateBgClearBtn = document.getElementById('time-date-bg-clear-btn');
    const timeDateBgBlurEl = document.getElementById('time-date-bg-blur');
    const timeDateBgBlurLabelEl = document.getElementById('time-date-bg-blur-label');
    const timeDateBgAlphaEl = document.getElementById('time-date-bg-alpha');
    const timeDateBgAlphaLabelEl = document.getElementById('time-date-bg-alpha-label');

    const timeC1 = document.getElementById('time-date-time-c1');
    const timeC2 = document.getElementById('time-date-time-c2');
    const timeC3 = document.getElementById('time-date-time-c3');
    const timeC4 = document.getElementById('time-date-time-c4');
    const timeC5 = document.getElementById('time-date-time-c5');
    const timeSizeEl = document.getElementById('time-date-time-size');
    const timeSizeLabel = document.getElementById('time-date-time-size-label');
    const timeWeightEl = document.getElementById('time-date-time-weight');

    const dateSizeEl = document.getElementById('time-date-date-size');
    const dateSizeLabel = document.getElementById('time-date-date-size-label');
    const dateColorEl = document.getElementById('time-date-date-color');
    const dateWeightEl = document.getElementById('time-date-date-weight');

    const alignEl = document.getElementById('time-date-align');
    const fontEl = document.getElementById('time-date-font');
    const timeDateHideHomescreenEl = document.getElementById('time-date-hide-from-homescreen');
    const saveBtn = document.getElementById('time-date-style-save');
    const resetBtn = document.getElementById('time-date-style-reset');

    const getDefault = () => ({
      // 默认值对齐时间组件 srcdoc 的展示效果
      font: 'system',
      align: 'center',
      timeSize: 60,
      timeWeight: 800,
      timeColors: ['#afc8f8', '#b3f2ab', '#ffd1d1', '#c2c9ff', '#ffd4a3'],
      dateSize: 16,
      dateWeight: 800,
      dateColor: '#a8e9ff',
      bgBlur: 0,
      bgAlpha: 0,
      // 预览用的 dataURL（不建议持久化到 localStorage）
      bgImage: '',
      // 持久化用：相册图片 id（IndexedDB）
      bgImageAlbumId: ''
    });

    const readStyle = () => {
      const d = getDefault();
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE);
        if (raw && typeof raw === 'object') return { ...d, ...raw };
      } catch (e) {}
      return d;
    };

    const writeStyle = (s) => {
      try {
        Storage.set(CONFIG.STORAGE_KEYS.WIDGET_TIME_DATE_STYLE, s);
        return true;
      } catch (e) {
        console.error('[widget-time-date] 保存样式失败:', e);
        if (this.showToast) this.showToast('保存失败：图片太大或存储空间不足');
        return false;
      }
    };

    const loadAlbumDataUrl = async (albumId) => {
      try {
        if (!albumId || !Storage || !Storage.db) return '';
        const item = await Storage.dbGet('album', albumId);
        return (item && item.data) ? item.data : '';
      } catch (e) {
        console.error('[widget-time-date] 读取背景图失败:', e);
        return '';
      }
    };

    const renderPreview = () => {
      if (!previewEl || typeof Homescreen === 'undefined' || !Homescreen.getTimeDateWidgetSrcDoc) return;
      try {
        const iframe = document.createElement('iframe');
        iframe.className = 'yd-time-date-preview-iframe';
        iframe.setAttribute('sandbox', 'allow-scripts');
        const style = this._timeDateDraft && typeof this._timeDateDraft === 'object'
          ? this._timeDateDraft
          : readStyle();
        iframe.srcdoc = Homescreen.getTimeDateWidgetSrcDoc(style);
        previewEl.innerHTML = '';
        previewEl.appendChild(iframe);
      } catch (e) {
        previewEl.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">预览失败</div>';
      }
    };

    const syncUi = (s) => {
      const colors = Array.isArray(s.timeColors) ? s.timeColors : getDefault().timeColors;
      if (timeC1) timeC1.value = colors[0] || '#FF5E57';
      if (timeC2) timeC2.value = colors[1] || '#FF9F1A';
      if (timeC3) timeC3.value = colors[2] || '#FFD32A';
      if (timeC4) timeC4.value = colors[3] || '#0BE881';
      if (timeC5) timeC5.value = colors[4] || '#34C759';

      if (timeSizeEl) timeSizeEl.value = String(s.timeSize);
      if (timeSizeLabel) timeSizeLabel.textContent = `${s.timeSize}px`;
      if (timeWeightEl) timeWeightEl.value = String(s.timeWeight || 400);

      if (dateSizeEl) dateSizeEl.value = String(s.dateSize);
      if (dateSizeLabel) dateSizeLabel.textContent = `${s.dateSize}px`;
      if (dateColorEl) dateColorEl.value = s.dateColor || '#0b0b0b';
      if (dateWeightEl) dateWeightEl.value = String(s.dateWeight || 700);

      if (alignEl) alignEl.value = String(s.align || 'center');
      if (fontEl) fontEl.value = String(s.font || 'press-start-2p');

      const blur = Math.max(0, Math.min(30, Number.isFinite(s.bgBlur) ? s.bgBlur : parseInt(s.bgBlur, 10) || 0));
      const alphaPct = Math.max(0, Math.min(100, Number.isFinite(s.bgAlpha) ? s.bgAlpha : parseInt(s.bgAlpha, 10) || 0));
      if (timeDateBgBlurEl) timeDateBgBlurEl.value = String(blur);
      if (timeDateBgBlurLabelEl) timeDateBgBlurLabelEl.textContent = `${blur}px`;
      if (timeDateBgAlphaEl) timeDateBgAlphaEl.value = String(alphaPct);
      if (timeDateBgAlphaLabelEl) timeDateBgAlphaLabelEl.textContent = `${alphaPct}%`;

      if (timeDateHideHomescreenEl && typeof Homescreen !== 'undefined' && Homescreen.getWidgetHideFromHomescreenMap) {
        timeDateHideHomescreenEl.checked = !!Homescreen.getWidgetHideFromHomescreenMap()['widget-time-date'];
      }

      // 某些字体（例如像素风 Press Start 2P）本身只有单一粗细，粗细选择对视觉影响有限：
      // 这里不禁用选项，但通过实际渲染时做权重限制，以免误导预期。
    };

    const collectUi = () => {
      // 注意：bgImage(dataURL) 只用于预览，不会持久化到 localStorage。
      // 所以这里必须优先从 draft 里拿 bgImage，否则用户一调整任何参数预览就会丢背景。
      const cur = (this._timeDateDraft && typeof this._timeDateDraft === 'object')
        ? this._timeDateDraft
        : readStyle();
      const readColors = () => ([
        String(timeC1?.value || ''),
        String(timeC2?.value || ''),
        String(timeC3?.value || ''),
        String(timeC4?.value || ''),
        String(timeC5?.value || '')
      ].map(v => v && v.trim() ? v : '#0b0b0b'));
      const next = {
        ...cur,
        align: String(alignEl?.value || cur.align || 'center'),
        font: String(fontEl?.value || cur.font || 'press-start-2p'),
        timeColors: readColors(),
        timeSize: Math.max(12, parseInt(timeSizeEl?.value || cur.timeSize, 10) || cur.timeSize),
        timeWeight: Math.max(100, parseInt(timeWeightEl?.value || cur.timeWeight, 10) || (cur.timeWeight || 400)),
        dateSize: Math.max(8, parseInt(dateSizeEl?.value || cur.dateSize, 10) || cur.dateSize),
        dateColor: String(dateColorEl?.value || cur.dateColor || '#0b0b0b'),
        dateWeight: Math.max(100, parseInt(dateWeightEl?.value || cur.dateWeight, 10) || (cur.dateWeight || 700)),
        bgBlur: Math.max(0, Math.min(30, parseInt(timeDateBgBlurEl?.value || cur.bgBlur || 0, 10) || 0)),
        bgAlpha: Math.max(0, Math.min(100, parseInt(timeDateBgAlphaEl?.value || cur.bgAlpha || 0, 10) || 0)),
        bgImage: (cur && typeof cur.bgImage === 'string') ? cur.bgImage : '',
        bgImageAlbumId: (cur && typeof cur.bgImageAlbumId === 'string') ? cur.bgImageAlbumId : ''
      };
      return next;
    };

    const sameStyle = (a, b) => {
      try {
        const aa = a || {};
        const bb = b || {};
        const hideA = (typeof Homescreen !== 'undefined' && Homescreen.getWidgetHideFromHomescreenMap)
          ? !!Homescreen.getWidgetHideFromHomescreenMap()['widget-time-date']
          : false;
        const hideB = !!(timeDateHideHomescreenEl && timeDateHideHomescreenEl.checked);
        if (hideA !== hideB) return false;
        const keys = ['align', 'font', 'timeSize', 'timeWeight', 'dateSize', 'dateColor', 'dateWeight', 'bgImageAlbumId', 'bgBlur', 'bgAlpha'];
        for (const k of keys) {
          if (String(aa[k] ?? '') !== String(bb[k] ?? '')) return false;
        }
        const ac = Array.isArray(aa.timeColors) ? aa.timeColors : [];
        const bc = Array.isArray(bb.timeColors) ? bb.timeColors : [];
        for (let i = 0; i < 5; i++) {
          if (String(ac[i] ?? '') !== String(bc[i] ?? '')) return false;
        }
        return true;
      } catch (e) {
        return false;
      }
    };

    const onChange = () => {
      const saved = readStyle();
      const s = collectUi();
      if (timeSizeLabel) timeSizeLabel.textContent = `${s.timeSize}px`;
      if (dateSizeLabel) dateSizeLabel.textContent = `${s.dateSize}px`;
      this._timeDateDraft = s;
      this._timeDateDirty = !sameStyle(s, saved);
      try {
        if (typeof Homescreen !== 'undefined' && Homescreen.ensureFontCached) {
          Homescreen.ensureFontCached();
        }
      } catch (e) {}
      renderPreview();
      try {
        if (typeof Homescreen !== 'undefined' && Homescreen.loadTimeDateBackground) {
          Homescreen.loadTimeDateBackground();
        }
      } catch (e) {}
    };

    if (previewEl && timeSizeEl && dateSizeEl && dateColorEl) {
      // 初始回显
      (async () => {
        const s = readStyle();
        syncUi(s);
        // 进入页面时：从已保存的 albumId 读取背景图并用于预览
        if (s.bgImageAlbumId && (!s.bgImage || !String(s.bgImage).trim())) {
          const dataUrl = await loadAlbumDataUrl(s.bgImageAlbumId);
          this._timeDateDraft = { ...(s || {}), bgImage: dataUrl };
        } else {
          this._timeDateDraft = s;
        }
        renderPreview();
      })();

      if (timeC1) timeC1.addEventListener('input', onChange);
      if (timeC2) timeC2.addEventListener('input', onChange);
      if (timeC3) timeC3.addEventListener('input', onChange);
      if (timeC4) timeC4.addEventListener('input', onChange);
      if (timeC5) timeC5.addEventListener('input', onChange);
      alignEl?.addEventListener('change', onChange);
      timeSizeEl.addEventListener('input', onChange);
      timeWeightEl?.addEventListener('change', onChange);
      dateSizeEl.addEventListener('input', onChange);
      dateColorEl.addEventListener('input', onChange);
      dateWeightEl?.addEventListener('change', onChange);
      fontEl?.addEventListener('change', onChange);
      timeDateBgBlurEl?.addEventListener('input', onChange);
      timeDateBgAlphaEl?.addEventListener('input', onChange);
      timeDateHideHomescreenEl?.addEventListener('change', onChange);
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const s = this._timeDateDraft && typeof this._timeDateDraft === 'object' ? this._timeDateDraft : collectUi();
        // 不把 dataURL 持久化进 localStorage，避免超出配额
        const toSave = { ...(s || {}) };
        if (toSave && typeof toSave === 'object') delete toSave.bgImage;
        if (toSave && typeof toSave === 'object') delete toSave.hideFromHomescreen;
        const ok = writeStyle(toSave);
        try {
          if (typeof Homescreen !== 'undefined' && Homescreen.setWidgetHideFromHomescreen) {
            Homescreen.setWidgetHideFromHomescreen('widget-time-date', !!(timeDateHideHomescreenEl && timeDateHideHomescreenEl.checked));
          }
        } catch (e) {}
        if (!ok) return;
        this._timeDateDirty = false;
        if (this.showToast) this.showToast('已保存');
        renderPreview();
        try {
          if (typeof Homescreen !== 'undefined') {
            if (Homescreen.loadTimeDateBackground) Homescreen.loadTimeDateBackground();
            if (Homescreen.renderHomescreen) Homescreen.renderHomescreen();
          }
        } catch (e) {}
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const d = getDefault();
        syncUi(d);
        this._timeDateDraft = d;
        this._timeDateDirty = true;
        renderPreview();
        if (this.showToast) this.showToast('已恢复默认（未保存）');
      });
    }

    // 时间日期样式页：背景图上传（图片存 IndexedDB，相册 id 存到样式里）
    if (timeDateBgUploadBtn && timeDateBgInput) {
      timeDateBgUploadBtn.addEventListener('click', () => timeDateBgInput.click());
      timeDateBgInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || '').trim();
          if (!dataUrl) return;
          try {
            // 写入相册（IndexedDB）
            const albumItem = {
              id: State.generateId(),
              data: dataUrl,
              name: file.name || 'time-date-bg',
              createdAt: Date.now()
            };
            await Storage.dbAdd('album', albumItem);

            const cur = this._timeDateDraft && typeof this._timeDateDraft === 'object'
              ? this._timeDateDraft
              : collectUi();
            // draft 中保留 dataURL 仅用于预览；持久化只存 albumId
            this._timeDateDraft = { ...(cur || {}), bgImage: dataUrl, bgImageAlbumId: albumItem.id };
            this._timeDateDirty = true;
            renderPreview();
            try {
              if (typeof Homescreen !== 'undefined' && Homescreen.loadTimeDateBackground) {
                Homescreen.loadTimeDateBackground();
              }
            } catch (err) {}
            if (this.showToast) this.showToast('已选择背景图（未保存）');
          } catch (err) {
            console.error('[widget-time-date] 背景图保存失败:', err);
            if (this.showToast) this.showToast('背景图保存失败');
          } finally {
            e.target.value = '';
          }
        };
        reader.onerror = () => {
          if (this.showToast) this.showToast('读取图片失败');
          e.target.value = '';
        };
        reader.readAsDataURL(file);
      });
    }

    // 不使用背景图
    if (timeDateBgClearBtn) {
      timeDateBgClearBtn.addEventListener('click', () => {
        const cur = this._timeDateDraft && typeof this._timeDateDraft === 'object'
          ? this._timeDateDraft
          : collectUi();
        this._timeDateDraft = { ...(cur || {}), bgImage: '', bgImageAlbumId: '' };
        this._timeDateDirty = true;
        renderPreview();
        if (this.showToast) this.showToast('已关闭背景图（未保存）');
      });
    }

    // 播放器组件样式页：预设封面图片上传 / 预览 / 保存
    const playerPreviewEl = document.getElementById('player-style-preview');
    const playerUploadBtn = document.getElementById('player-style-image-upload-btn');
    const playerFileInput = document.getElementById('player-style-image-input');
    const playerResetBtn = document.getElementById('player-style-reset');
    const playerSaveBtn = document.getElementById('player-style-save');
    const playerBackBtn = document.getElementById('player-style-back');
    const playerHideHomescreenEl = document.getElementById('homescreen-hide-widget-player');

    const readPlayerStyle = async () => {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE);
        const base = {
          presetImage: '',
          blurAmount: 8,
          tintColor: '#ffffff',
          blurAlpha: 0.75,
        };
        if (raw && typeof raw === 'object') {
          // 如果存储的是 albumId，则从 IndexedDB 读取图片数据
          if (raw.presetImageAlbumId && Storage && Storage.db) {
            try {
              const item = await Storage.dbGet('album', raw.presetImageAlbumId);
              if (item && item.data) {
                return {
                  ...base,
                  ...raw,
                  presetImage: item.data,
                  blurAmount: (typeof raw.blurAmount === 'number' ? raw.blurAmount : 8),
                  tintColor: (typeof raw.tintColor === 'string' && raw.tintColor) ? raw.tintColor : '#ffffff',
                  blurAlpha: (typeof raw.blurAlpha === 'number' ? raw.blurAlpha : 0.75),
                };
              }
            } catch (e) {
              console.error('读取预设图片失败:', e);
            }
          }
          // 兼容旧版本：直接存储 dataURL（如果存在）
          if (raw.presetImage && typeof raw.presetImage === 'string' && raw.presetImage.startsWith('data:')) {
            return {
              ...base,
              ...raw,
              blurAmount: (typeof raw.blurAmount === 'number' ? raw.blurAmount : 8),
              tintColor: (typeof raw.tintColor === 'string' && raw.tintColor) ? raw.tintColor : '#ffffff',
              blurAlpha: (typeof raw.blurAlpha === 'number' ? raw.blurAlpha : 0.75),
            };
          }
          return {
            ...base,
            blurAmount: (typeof raw.blurAmount === 'number' ? raw.blurAmount : 8),
            tintColor: (typeof raw.tintColor === 'string' && raw.tintColor) ? raw.tintColor : '#ffffff',
            blurAlpha: (typeof raw.blurAlpha === 'number' ? raw.blurAlpha : 0.75),
          };
        }
      } catch (e) {
        console.error('读取播放器样式失败:', e);
      }
      return { presetImage: '', blurAmount: 8, tintColor: '#ffffff', blurAlpha: 0.75 };
    };

    const writePlayerStyle = async (s) => {
      try {
        const toSave = {
          blurAmount: (s && typeof s.blurAmount === 'number') ? s.blurAmount : 8,
          tintColor: (s && typeof s.tintColor === 'string' && s.tintColor) ? s.tintColor : '#ffffff',
          blurAlpha: (s && typeof s.blurAlpha === 'number') ? s.blurAlpha : 0.75,
        };
        // 如果有预设图片，存储到 IndexedDB，只保存引用
        if (s && s.presetImage && typeof s.presetImage === 'string' && s.presetImage.startsWith('data:')) {
          try {
            // 检查是否已存在相同的图片（通过 dataURL 判断）
            const existing = await Storage.dbGetAll('album');
            let existingItem = null;
            for (const item of existing || []) {
              if (item && item.data === s.presetImage) {
                existingItem = item;
                break;
              }
            }
            
            if (existingItem) {
              // 使用已存在的图片
              toSave.presetImageAlbumId = existingItem.id;
            } else {
              // 保存新图片到相册
              const item = {
                id: State.generateId(),
                data: s.presetImage,
                name: '播放器预设封面',
                createdAt: Date.now()
              };
              await Storage.dbAdd('album', item);
              toSave.presetImageAlbumId = item.id;
            }
          } catch (e) {
            console.error('保存预设图片到 IndexedDB 失败:', e);
            // 如果 IndexedDB 保存失败，尝试直接保存到 localStorage（可能失败）
            toSave.presetImage = s.presetImage;
          }
        } else {
          // 没有预设图片，清除引用
          toSave.presetImageAlbumId = null;
        }
        // 保存到 localStorage（只存引用，不存大图片）
        Storage.set(CONFIG.STORAGE_KEYS.WIDGET_PLAYER_STYLE, toSave);
      } catch (e) {
        console.error('保存播放器样式失败:', e);
        throw e;
      }
    };

    const renderPlayerPreview = async (style) => {
      if (!playerPreviewEl || typeof Homescreen === 'undefined' || !Homescreen.getPlayerWidgetSrcDoc) return;
      try {
        const iframe = document.createElement('iframe');
        iframe.className = 'yd-time-date-preview-iframe';
        iframe.setAttribute('sandbox', 'allow-scripts');
        // 如果 style 是草稿（有 presetImage），直接使用同步版本；否则异步读取
        const html = style && style.presetImage 
          ? Homescreen.getPlayerWidgetSrcDocSync(style)
          : await Homescreen.getPlayerWidgetSrcDoc(style || await readPlayerStyle());
        iframe.srcdoc = html;
        playerPreviewEl.innerHTML = '';
        playerPreviewEl.appendChild(iframe);
      } catch (e) {
        console.error('渲染播放器预览失败:', e);
        playerPreviewEl.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">预览失败</div>';
      }
    };

    const playerBlurEl = document.getElementById('player-style-blur');
    const playerBlurLabel = document.getElementById('player-style-blur-label');
    const playerBlurAlphaEl = document.getElementById('player-style-blur-alpha');
    const playerBlurAlphaLabel = document.getElementById('player-style-blur-alpha-label');
    const playerColorEl = document.getElementById('player-style-color');

    const syncPlayerUi = (style) => {
      const blurRaw = style && style.blurAmount;
      const blur = Math.max(0, Math.min(15, (typeof blurRaw === 'number' ? blurRaw : (parseInt(blurRaw, 10) || 8))));
      if (playerBlurEl) playerBlurEl.value = String(blur);
      if (playerBlurLabel) playerBlurLabel.textContent = blur + 'px';

      const color = (style && typeof style.tintColor === 'string' && style.tintColor) ? style.tintColor : '#ffffff';
      if (playerColorEl) playerColorEl.value = color;

      const alphaRaw = style && style.blurAlpha;
      const alpha = (typeof alphaRaw === 'number' ? alphaRaw : 0.75);
      const alphaPercent = Math.max(0, Math.min(100, Math.round(alpha * 100)));
      if (playerBlurAlphaEl) playerBlurAlphaEl.value = String(alphaPercent);
      if (playerBlurAlphaLabel) playerBlurAlphaLabel.textContent = alphaPercent + '%';
    };

    if (playerPreviewEl && playerUploadBtn && playerFileInput) {
      // 未保存改动提醒（统一监听 input/change 标记 dirty）
      this._playerDirty = false;
      const playerPageEl = document.getElementById('page-widget-player-style');
      if (playerPageEl && !playerPageEl.__ydDirtyBound) {
        playerPageEl.__ydDirtyBound = true;
        playerPageEl.addEventListener('input', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'player-style-save' || t.id === 'player-style-reset' || t.id === 'player-style-back') return;
          this._playerDirty = true;
        }, true);
        playerPageEl.addEventListener('change', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'player-style-save' || t.id === 'player-style-reset' || t.id === 'player-style-back') return;
          this._playerDirty = true;
        }, true);
      }

      let draft = { presetImage: '', blurAmount: 8, tintColor: '#ffffff', blurAlpha: 0.75 };
      // 异步读取样式
      (async () => {
        draft = await readPlayerStyle();
        syncPlayerUi(draft);
        if (playerHideHomescreenEl && typeof Homescreen !== 'undefined' && Homescreen.getWidgetHideFromHomescreenMap) {
          playerHideHomescreenEl.checked = !!Homescreen.getWidgetHideFromHomescreenMap()['widget-player'];
        }
        renderPlayerPreview(draft);
        this._playerDirty = false;
      })();

      const onChange = () => {
        const blurStr = playerBlurEl ? playerBlurEl.value : '8';
        const blurParsed = parseInt(blurStr, 10);
        const blur = Math.max(0, Math.min(15, Number.isFinite(blurParsed) ? blurParsed : 8));

        let color = playerColorEl ? String(playerColorEl.value || '').trim() : '';
        if (!color) color = '#ffffff';

        const alphaStr = playerBlurAlphaEl ? playerBlurAlphaEl.value : '75';
        const alphaParsed = parseInt(alphaStr, 10);
        const alphaPercent = Math.max(0, Math.min(100, Number.isFinite(alphaParsed) ? alphaParsed : 75));
        const blurAlpha = alphaPercent / 100;

        draft = { ...(draft || {}), blurAmount: blur, tintColor: color, blurAlpha };
        if (playerBlurLabel) playerBlurLabel.textContent = blur + 'px';
        if (playerBlurAlphaLabel) playerBlurAlphaLabel.textContent = alphaPercent + '%';
        renderPlayerPreview(draft);
      };

      playerUploadBtn.addEventListener('click', () => {
        playerFileInput.click();
      });

      playerFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || '').trim();
          if (!dataUrl) return;
          // 确保 draft 对象存在，并保留已有的模糊与颜色设置
          const currentBlur = (draft && typeof draft.blurAmount === 'number') ? draft.blurAmount : 8;
          const currentColor = (draft && typeof draft.tintColor === 'string' && draft.tintColor) ? draft.tintColor : (playerColorEl ? playerColorEl.value || '#ffffff' : '#ffffff');
          const currentAlpha = (draft && typeof draft.blurAlpha === 'number') ? draft.blurAlpha : 0.75;
          draft = { presetImage: dataUrl, blurAmount: currentBlur, tintColor: currentColor, blurAlpha: currentAlpha };
          console.log('上传图片后 draft:', { presetImageLength: dataUrl.length, blurAmount: currentBlur });
          syncPlayerUi(draft);
          await renderPlayerPreview(draft);
        };
        reader.onerror = () => {
          console.error('读取图片文件失败');
          if (this.showToast) this.showToast('读取图片失败');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });

      playerBlurEl?.addEventListener('input', onChange);
      playerBlurAlphaEl?.addEventListener('input', onChange);
      playerColorEl?.addEventListener('input', onChange);

      playerResetBtn?.addEventListener('click', async () => {
        draft = { presetImage: '', blurAmount: 8, tintColor: '#ffffff', blurAlpha: 0.75 };
        syncPlayerUi(draft);
        await renderPlayerPreview(draft);
        if (this.showToast) this.showToast('已重置为默认（未保存）');
      });

      playerSaveBtn?.addEventListener('click', async () => {
        // 确保保存时包含所有必要的字段
        const toSave = {
          presetImage: (draft && draft.presetImage && String(draft.presetImage).trim()) || '',
          blurAmount: (draft && typeof draft.blurAmount === 'number') ? draft.blurAmount : 8,
          tintColor: (draft && typeof draft.tintColor === 'string' && draft.tintColor) ? draft.tintColor : '#ffffff',
          blurAlpha: (draft && typeof draft.blurAlpha === 'number') ? draft.blurAlpha : 0.75,
        };
        console.log('准备保存播放器样式:', { 
          presetImageLength: toSave.presetImage ? toSave.presetImage.length : 0, 
          blurAmount: toSave.blurAmount 
        });
        
        try {
          await writePlayerStyle(toSave);
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.setWidgetHideFromHomescreen) {
              Homescreen.setWidgetHideFromHomescreen('widget-player', !!(playerHideHomescreenEl && playerHideHomescreenEl.checked));
            }
          } catch (e) {}
          
          // 立即验证保存是否成功
          const saved = await readPlayerStyle();
          console.log('保存后立即读取验证:', { 
            presetImageLength: saved.presetImage ? saved.presetImage.length : 0,
            blurAmount: saved.blurAmount 
          });
          
          if (this.showToast) this.showToast('已保存');
          this._playerDirty = false;
          
          if (typeof Homescreen !== 'undefined') {
            // 重新渲染主屏幕，确保播放器组件更新
            if (Homescreen.renderHomescreen) {
              Homescreen.renderHomescreen();
            }
            // 延迟一下，确保 iframe 加载完成后再同步状态
            setTimeout(async () => {
              // 重新同步播放器状态，确保预设图片生效
              if (typeof Homescreen !== 'undefined' && Homescreen.updatePlayerWidget) {
                const style = await readPlayerStyle();
                console.log('延迟后读取样式用于更新:', { 
                  presetImageLength: style.presetImage ? style.presetImage.length : 0 
                });
                const state = {
                  hasTrack: typeof Music !== 'undefined' && Music._currentTrack ? true : false,
                  title: (typeof Music !== 'undefined' && Music._currentTrack && Music._currentTrack.title) || '未在播放',
                  artist: (typeof Music !== 'undefined' && Music._currentTrack && Music._currentTrack.artist) || '',
                  coverDataUrl: (typeof Music !== 'undefined' && Music._currentTrack && Music._currentTrack.coverDataUrl) || '',
                  duration: (typeof Music !== 'undefined' && Music._audio && Music._audio.duration) || 0,
                  currentTime: (typeof Music !== 'undefined' && Music._audio && Music._audio.currentTime) || 0,
                  isPlaying: (typeof Music !== 'undefined' && Music._audio && !Music._audio.paused) || false,
                  lyricLine: (typeof Music !== 'undefined' && Music._lastLyricLine) || '',
                  presetImage: (style && style.presetImage && String(style.presetImage).trim()) || ''
                };
                console.log('发送播放器状态，presetImage长度:', state.presetImage ? state.presetImage.length : 0);
                Homescreen.updatePlayerWidget(state);
              }
            }, 500);
          }
        } catch (e) {
          console.error('保存播放器样式失败:', e);
          if (this.showToast) this.showToast('保存失败：' + (e.message || '未知错误'));
        }
      });

      playerBackBtn?.addEventListener('click', () => {
        if (this._playerDirty) {
          const ok = confirm('当前修改尚未保存，确定要退出吗？');
          if (!ok) return;
        }
        State.switchPage('page-widgets');
      });
    }

    // 便笺组件样式页：拍立得照片上传 / 预览 / 保存
    const notePreviewEl = document.getElementById('note-style-preview');
    const noteImage1PreviewEl = document.getElementById('note-style-image1-preview');
    const noteImage2PreviewEl = document.getElementById('note-style-image2-preview');
    const noteImage1UploadBtn = document.getElementById('note-style-image1-upload-btn');
    const noteImage2UploadBtn = document.getElementById('note-style-image2-upload-btn');
    const noteImage1FileInput = document.getElementById('note-style-image1-input');
    const noteImage2FileInput = document.getElementById('note-style-image2-input');
    const noteResetBtn = document.getElementById('note-style-reset');
    const noteSaveBtn = document.getElementById('note-style-save');
    const noteBackBtn = document.getElementById('note-style-back');
    const noteHideHomescreenEl = document.getElementById('homescreen-hide-widget-note');

    const readNoteStyle = async () => {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_NOTE_STYLE);
        if (!raw || typeof raw !== 'object') {
          return { image1: '', image2: '', image1AlbumId: '', image2AlbumId: '', borderColor: '#ffffff', borderAlpha: 0.6 };
        }
        
        // 如果存储的是 albumId，从 IndexedDB 读取图片数据
        const result = {
          image1: '',
          image2: '',
          image1AlbumId: (raw.image1AlbumId && typeof raw.image1AlbumId === 'string') ? raw.image1AlbumId : '',
          image2AlbumId: (raw.image2AlbumId && typeof raw.image2AlbumId === 'string') ? raw.image2AlbumId : '',
          borderColor: (raw.borderColor && typeof raw.borderColor === 'string') ? raw.borderColor : '#ffffff',
          borderAlpha: (typeof raw.borderAlpha === 'number') ? raw.borderAlpha : 0.6
        };
        
        if (raw.image1AlbumId && Storage && Storage.db) {
          try {
            const item = await Storage.dbGet('album', raw.image1AlbumId);
            if (item && item.data) {
              result.image1 = item.data;
            }
          } catch (e) {
            console.error('[widget-note] 从 IndexedDB 读取 image1 失败:', e);
          }
        } else if (raw.image1 && typeof raw.image1 === 'string') {
          result.image1 = raw.image1;
        }
        
        if (raw.image2AlbumId && Storage && Storage.db) {
          try {
            const item = await Storage.dbGet('album', raw.image2AlbumId);
            if (item && item.data) {
              result.image2 = item.data;
            }
          } catch (e) {
            console.error('[widget-note] 从 IndexedDB 读取 image2 失败:', e);
          }
        } else if (raw.image2 && typeof raw.image2 === 'string') {
          result.image2 = raw.image2;
        }
        
        console.log('[widget-note] 读取样式成功', {
          hasImage1: !!result.image1,
          hasImage2: !!result.image2,
          image1Length: result.image1 ? result.image1.length : 0,
          image2Length: result.image2 ? result.image2.length : 0,
          borderColor: result.borderColor,
          borderAlpha: result.borderAlpha
        });
        
        return result;
      } catch (e) {
        console.warn('[widget-note] 读取样式出错', e);
      }
      return { image1: '', image2: '', image1AlbumId: '', image2AlbumId: '', borderColor: '#ffffff', borderAlpha: 0.6 };
    };

    const writeNoteStyle = async (s) => {
      try {
        // 保存样式时不要把已存在的照片清空：
        // - 优先保存 albumId（避免 localStorage 配额超限）
        // - 若本次没有带 albumId，则沿用已保存的 albumId / 旧 dataURL（兼容旧数据）
        let prev = null;
        try {
          const raw = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_NOTE_STYLE);
          prev = (raw && typeof raw === 'object') ? raw : null;
        } catch (e) {}

        const prevImg1AlbumId = (prev && typeof prev.image1AlbumId === 'string') ? prev.image1AlbumId : '';
        const prevImg2AlbumId = (prev && typeof prev.image2AlbumId === 'string') ? prev.image2AlbumId : '';
        const prevImg1 = (prev && typeof prev.image1 === 'string') ? prev.image1 : '';
        const prevImg2 = (prev && typeof prev.image2 === 'string') ? prev.image2 : '';

        const toSave = {
          image1AlbumId: (s && typeof s.image1AlbumId === 'string' && s.image1AlbumId) ? s.image1AlbumId : (prevImg1AlbumId || ''),
          image2AlbumId: (s && typeof s.image2AlbumId === 'string' && s.image2AlbumId) ? s.image2AlbumId : (prevImg2AlbumId || ''),
          borderColor: (s && typeof s.borderColor === 'string' && s.borderColor) ? s.borderColor : '#ffffff',
          borderAlpha: (typeof s?.borderAlpha === 'number') ? s.borderAlpha : 0.6
        };

        // 兼容旧数据：如果没有 albumId，且之前/当前存在 dataURL，则保留 dataURL，避免调边框导致照片“丢失”
        if (!toSave.image1AlbumId) {
          const img1 = (s && typeof s.image1 === 'string' && s.image1.trim()) ? s.image1.trim() : (prevImg1 || '');
          if (img1) toSave.image1 = img1;
        }
        if (!toSave.image2AlbumId) {
          const img2 = (s && typeof s.image2 === 'string' && s.image2.trim()) ? s.image2.trim() : (prevImg2 || '');
          if (img2) toSave.image2 = img2;
        }
        
        console.log('[widget-note] 准备保存样式', {
          hasImage1AlbumId: !!toSave.image1AlbumId,
          hasImage2AlbumId: !!toSave.image2AlbumId,
          image1AlbumId: toSave.image1AlbumId || '',
          image2AlbumId: toSave.image2AlbumId || '',
          borderColor: toSave.borderColor,
          borderAlpha: toSave.borderAlpha
        });
        
        Storage.set(CONFIG.STORAGE_KEYS.WIDGET_NOTE_STYLE, toSave);
        console.log('[widget-note] 保存样式成功');
      } catch (e) {
        console.error('[widget-note] 保存样式失败', e);
        throw e;
      }
    };

    const renderNotePreview = async (style) => {
      if (!notePreviewEl || typeof Homescreen === 'undefined' || !Homescreen.getNoteWidgetSrcDoc) return;
      try {
        const styleToUse = style || await readNoteStyle();
        const iframe = document.createElement('iframe');
        iframe.className = 'yd-time-date-preview-iframe';
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.srcdoc = Homescreen.getNoteWidgetSrcDoc(styleToUse);
        notePreviewEl.innerHTML = '';
        notePreviewEl.appendChild(iframe);
      } catch (e) {
        console.error('[widget-note] 预览失败:', e);
        notePreviewEl.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">预览失败</div>';
      }
    };

    const syncNoteUi = (style) => {
      const img1 = style && typeof style.image1 === 'string' ? style.image1 : '';
      const img2 = style && typeof style.image2 === 'string' ? style.image2 : '';
      
      if (noteImage1PreviewEl) {
        if (img1) {
          noteImage1PreviewEl.src = img1;
          noteImage1PreviewEl.style.display = 'block';
        } else {
          noteImage1PreviewEl.src = '';
          noteImage1PreviewEl.style.display = 'none';
        }
      }
      
      if (noteImage2PreviewEl) {
        if (img2) {
          noteImage2PreviewEl.src = img2;
          noteImage2PreviewEl.style.display = 'block';
        } else {
          noteImage2PreviewEl.src = '';
          noteImage2PreviewEl.style.display = 'none';
        }
      }
    };

    if (notePreviewEl && noteImage1PreviewEl && noteImage2PreviewEl && noteImage1UploadBtn && noteImage2UploadBtn && noteImage1FileInput && noteImage2FileInput) {
      // 未保存改动提醒（统一监听 input/change 标记 dirty）
      this._noteDirty = false;
      const notePageEl = document.getElementById('page-widget-note-style');
      if (notePageEl && !notePageEl.__ydDirtyBound) {
        notePageEl.__ydDirtyBound = true;
        notePageEl.addEventListener('input', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'note-style-save' || t.id === 'note-style-reset' || t.id === 'note-style-back') return;
          this._noteDirty = true;
        }, true);
        notePageEl.addEventListener('change', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'note-style-save' || t.id === 'note-style-reset' || t.id === 'note-style-back') return;
          this._noteDirty = true;
        }, true);
      }

      const borderColorEl = document.getElementById('note-style-border-color');
      const borderAlphaEl = document.getElementById('note-style-border-alpha');
      const borderAlphaLabelEl = document.getElementById('note-style-border-alpha-label');

      let draft = { image1: '', image2: '', image1AlbumId: '', image2AlbumId: '', borderColor: '#ffffff', borderAlpha: 0.6 };
      
      // 初始化：异步加载已保存的样式
      (async () => {
        const saved = await readNoteStyle();
        draft = {
          image1: saved.image1 || '',
          image2: saved.image2 || '',
          image1AlbumId: saved.image1AlbumId || '',
          image2AlbumId: saved.image2AlbumId || '',
          borderColor: saved.borderColor || '#ffffff',
          borderAlpha: typeof saved.borderAlpha === 'number' ? saved.borderAlpha : 0.6
        };
        syncNoteUi(draft);
        if (borderColorEl) borderColorEl.value = draft.borderColor;
        if (borderAlphaEl && borderAlphaLabelEl) {
          borderAlphaEl.value = String(Math.round(draft.borderAlpha * 100));
          borderAlphaLabelEl.textContent = Math.round(draft.borderAlpha * 100) + '%';
        }
        await renderNotePreview(draft);
        if (noteHideHomescreenEl && typeof Homescreen !== 'undefined' && Homescreen.getWidgetHideFromHomescreenMap) {
          noteHideHomescreenEl.checked = !!Homescreen.getWidgetHideFromHomescreenMap()['widget-note'];
        }
        this._noteDirty = false;
      })();

      const handleImageUpload = async (fileInput, imageKey) => {
        const file = fileInput.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = String(e.target.result || '');
          console.log('[widget-note] 上传图片完成', {
            slot: imageKey,
            dataUrlLength: dataUrl.length
          });
          
          try {
            // 保存到 IndexedDB 的 album 表
            const albumId = State.generateId();
            const albumItem = {
              id: albumId,
              data: dataUrl,
              name: file.name || `widget-note-${imageKey}.jpg`,
              description: `相片组件-${imageKey}`,
              type: 'image',
              createdAt: Date.now()
            };
            
            await Storage.dbPut('album', albumItem);
            console.log('[widget-note] 图片已保存到 IndexedDB', {
              slot: imageKey,
              albumId: albumId
            });
            
            // 更新 draft：保存 albumId 和 dataURL（用于预览）
            const albumIdKey = imageKey === 'image1' ? 'image1AlbumId' : 'image2AlbumId';
            draft = {
              ...draft,
              [imageKey]: dataUrl, // 用于预览
              [albumIdKey]: albumId // 用于保存
            };
            
            syncNoteUi(draft);
            await renderNotePreview(draft);
          } catch (error) {
            console.error('[widget-note] 保存图片到 IndexedDB 失败:', error);
            if (this.showToast) this.showToast('保存图片失败：' + (error.message || '未知错误'));
          }
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
      };

      noteImage1UploadBtn.addEventListener('click', () => {
        noteImage1FileInput.click();
      });

      noteImage1FileInput.addEventListener('change', (e) => {
        handleImageUpload(e.target, 'image1');
      });

      noteImage2UploadBtn.addEventListener('click', () => {
        noteImage2FileInput.click();
      });

      noteImage2FileInput.addEventListener('change', (e) => {
        handleImageUpload(e.target, 'image2');
      });

      // 边框颜色
      borderColorEl?.addEventListener('input', (e) => {
        const val = String(e.target.value || '').trim() || '#ffffff';
        draft = { ...draft, borderColor: val };
        renderNotePreview(draft);
      });

      // 边框透明度
      borderAlphaEl?.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '60', 10);
        const pct = Math.max(10, Math.min(100, Number.isFinite(raw) ? raw : 60));
        const alpha = pct / 100;
        draft = { ...draft, borderAlpha: alpha };
        if (borderAlphaLabelEl) borderAlphaLabelEl.textContent = pct + '%';
        renderNotePreview(draft);
      });

      noteResetBtn?.addEventListener('click', async () => {
        draft = { image1: '', image2: '', image1AlbumId: '', image2AlbumId: '', borderColor: '#ffffff', borderAlpha: 0.6 };
        syncNoteUi(draft);
        if (borderColorEl) borderColorEl.value = '#ffffff';
        if (borderAlphaEl && borderAlphaLabelEl) {
          borderAlphaEl.value = '60';
          borderAlphaLabelEl.textContent = '60%';
        }
        await renderNotePreview(draft);
        if (this.showToast) this.showToast('已重置为默认（未保存）');
      });

      noteSaveBtn?.addEventListener('click', async () => {
        try {
          console.log('[widget-note] 准备保存样式', {
            hasImage1: !!(draft.image1 || draft.image1AlbumId),
            hasImage2: !!(draft.image2 || draft.image2AlbumId),
            image1AlbumId: draft.image1AlbumId || '',
            image2AlbumId: draft.image2AlbumId || '',
            borderColor: draft.borderColor,
            borderAlpha: draft.borderAlpha
          });
          
          await writeNoteStyle(draft);
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.setWidgetHideFromHomescreen) {
              Homescreen.setWidgetHideFromHomescreen('widget-note', !!(noteHideHomescreenEl && noteHideHomescreenEl.checked));
            }
          } catch (e) {}
          if (this.showToast) this.showToast('已保存');
          this._noteDirty = false;
          
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen) {
              Homescreen.renderHomescreen();
            }
          } catch (e) {
            console.error('[widget-note] 重新渲染主屏失败:', e);
          }
        } catch (e) {
          console.error('[widget-note] 保存失败:', e);
          if (this.showToast) this.showToast('保存失败：' + (e.message || '未知错误'));
        }
      });

      noteBackBtn?.addEventListener('click', () => {
        if (this._noteDirty) {
          const ok = confirm('当前修改尚未保存，确定要退出吗？');
          if (!ok) return;
        }
        State.switchPage('page-widgets');
      });
    }

    // 相片卡片组件样式页：背景模糊 / 透明、单张照片、下方左右文字
    const photoCardPreviewEl = document.getElementById('photo-card-style-preview');
    const photoCardImagePreviewEl = document.getElementById('photo-card-style-image-preview');
    const photoCardImageUploadBtn = document.getElementById('photo-card-style-image-upload-btn');
    const photoCardImageFileInput = document.getElementById('photo-card-style-image-input');
    const photoCardBlurEl = document.getElementById('photo-card-style-blur');
    const photoCardBlurLabelEl = document.getElementById('photo-card-style-blur-label');
    const photoCardBlurAlphaEl = document.getElementById('photo-card-style-blur-alpha');
    const photoCardBlurAlphaLabelEl = document.getElementById('photo-card-style-blur-alpha-label');
    const photoCardTextLeftEl = document.getElementById('photo-card-style-text-left');
    const photoCardTextRightEl = document.getElementById('photo-card-style-text-right');
    const photoCardResetBtn = document.getElementById('photo-card-style-reset');
    const photoCardSaveBtn = document.getElementById('photo-card-style-save');
    const photoCardBackBtn = document.getElementById('photo-card-style-back');
    const photoCardHideHomescreenEl = document.getElementById('homescreen-hide-widget-photo-card');

    const readPhotoCardStyle = () => {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.PHOTO_CARD_STYLE);
        if (raw && typeof raw === 'object') {
          return {
            image: (typeof raw.image === 'string') ? raw.image : '',
            blurAmount: (typeof raw.blurAmount === 'number') ? raw.blurAmount : 8,
            blurAlpha: (typeof raw.blurAlpha === 'number') ? raw.blurAlpha : 0.6,
            textLeft: (typeof raw.textLeft === 'string') ? raw.textLeft : '',
            textRight: (typeof raw.textRight === 'string') ? raw.textRight : '',
            bgColor: (typeof raw.bgColor === 'string') ? raw.bgColor : ''
          };
        }
      } catch (e) {}
      return { image: '', blurAmount: 8, blurAlpha: 0.6, textLeft: '', textRight: '', bgColor: '' };
    };

    const writePhotoCardStyle = (s) => {
      try {
        const blur = Math.max(0, Math.min(15, Number.isFinite(s?.blurAmount) ? s.blurAmount : 8));
        const alpha = (typeof s?.blurAlpha === 'number') ? Math.max(0, Math.min(1, s.blurAlpha)) : 0.6;
        const toSave = {
          // 将图片以压缩后的 dataURL 存入（上传时已缩小分辨率），避免占用过大配额
          image: (s && typeof s.image === 'string') ? s.image : '',
          blurAmount: blur,
          blurAlpha: alpha,
          textLeft: (s && typeof s.textLeft === 'string') ? s.textLeft : '',
          textRight: (s && typeof s.textRight === 'string') ? s.textRight : '',
          bgColor: (s && typeof s.bgColor === 'string') ? s.bgColor : ''
        };
        Storage.set(CONFIG.STORAGE_KEYS.PHOTO_CARD_STYLE, toSave);
      } catch (e) {
        console.error('[widget-photo-card] 保存样式失败', e);
        throw e;
      }
    };

    const renderPhotoCardPreview = (style) => {
      if (!photoCardPreviewEl || typeof Homescreen === 'undefined' || !Homescreen.getPhotoCardWidgetSrcDoc) return;
      try {
        const s = style || readPhotoCardStyle();
        const iframe = document.createElement('iframe');
        iframe.className = 'yd-time-date-preview-iframe';
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.srcdoc = Homescreen.getPhotoCardWidgetSrcDoc(s);
        photoCardPreviewEl.innerHTML = '';
        photoCardPreviewEl.appendChild(iframe);
      } catch (e) {
        console.error('[widget-photo-card] 预览失败:', e);
        photoCardPreviewEl.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">预览失败</div>';
      }
    };

    if (photoCardPreviewEl && photoCardImagePreviewEl && photoCardImageUploadBtn && photoCardImageFileInput && photoCardBlurEl && photoCardBlurAlphaEl && photoCardTextLeftEl && photoCardTextRightEl) {
      // 未保存改动提醒（统一监听 input/change 标记 dirty）
      this._photoCardDirty = false;
      const photoCardPageEl = document.getElementById('page-widget-photo-card-style');
      if (photoCardPageEl && !photoCardPageEl.__ydDirtyBound) {
        photoCardPageEl.__ydDirtyBound = true;
        photoCardPageEl.addEventListener('input', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'photo-card-style-save' || t.id === 'photo-card-style-reset' || t.id === 'photo-card-style-back') return;
          this._photoCardDirty = true;
        }, true);
        photoCardPageEl.addEventListener('change', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'photo-card-style-save' || t.id === 'photo-card-style-reset' || t.id === 'photo-card-style-back') return;
          this._photoCardDirty = true;
        }, true);
      }

      let photoDraft = readPhotoCardStyle();

      const syncPhotoUi = () => {
        if (photoCardImagePreviewEl) {
          if (photoDraft.image) {
            photoCardImagePreviewEl.src = photoDraft.image;
            photoCardImagePreviewEl.style.display = 'block';
          } else {
            photoCardImagePreviewEl.src = '';
            photoCardImagePreviewEl.style.display = 'none';
          }
        }
        const blur = Math.max(0, Math.min(15, Number.isFinite(photoDraft.blurAmount) ? photoDraft.blurAmount : 8));
        const alphaPct = Math.round(((typeof photoDraft.blurAlpha === 'number' ? photoDraft.blurAlpha : 0.6) * 100));
        if (photoCardBlurEl) photoCardBlurEl.value = String(blur);
        if (photoCardBlurLabelEl) photoCardBlurLabelEl.textContent = blur + 'px';
        if (photoCardBlurAlphaEl) photoCardBlurAlphaEl.value = String(alphaPct);
        if (photoCardBlurAlphaLabelEl) photoCardBlurAlphaLabelEl.textContent = alphaPct + '%';
        if (photoCardTextLeftEl) photoCardTextLeftEl.value = photoDraft.textLeft || '';
        if (photoCardTextRightEl) photoCardTextRightEl.value = photoDraft.textRight || '';
      };

      syncPhotoUi();
      if (photoCardHideHomescreenEl && typeof Homescreen !== 'undefined' && Homescreen.getWidgetHideFromHomescreenMap) {
        photoCardHideHomescreenEl.checked = !!Homescreen.getWidgetHideFromHomescreenMap()['widget-photo-card'];
      }
      renderPhotoCardPreview(photoDraft);
      this._photoCardDirty = false;

      photoCardImageUploadBtn.addEventListener('click', () => {
        photoCardImageFileInput.click();
      });

      photoCardImageFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const originalDataUrl = String(reader.result || '').trim();
          if (!originalDataUrl) return;

          // 使用 canvas 缩放图片并提取主色，避免存入过大的 dataURL
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const targetSize = 200;
              canvas.width = targetSize;
              canvas.height = targetSize;
              ctx.drawImage(img, 0, 0, targetSize, targetSize);

              // 计算简单平均色作为主色
              const imgData = ctx.getImageData(0, 0, targetSize, targetSize).data;
              let r = 0, g = 0, b = 0;
              const total = targetSize * targetSize;
              for (let i = 0; i < imgData.length; i += 4 * 16) { // 每隔 16 像素采样一次，减小开销
                r += imgData[i];
                g += imgData[i + 1];
                b += imgData[i + 2];
              }
              const samples = Math.max(1, Math.floor(total / 16));
              r = Math.round(r / samples);
              g = Math.round(g / samples);
              b = Math.round(b / samples);
              const toHex = (v) => v.toString(16).padStart(2, '0');
              const mainColor = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

              // 压缩后的 dataURL
              const smallDataUrl = canvas.toDataURL('image/jpeg', 0.7);

              photoDraft = {
                ...(photoDraft || {}),
                image: smallDataUrl,
                bgColor: mainColor
              };
              syncPhotoUi();
              renderPhotoCardPreview(photoDraft);
            } catch (err) {
              console.error('[widget-photo-card] 处理图片失败', err);
              if (this.showToast) this.showToast('处理图片失败');
            }
          };
          img.onerror = () => {
            console.error('[widget-photo-card] 图片加载失败');
            if (this.showToast) this.showToast('图片加载失败');
          };
          img.src = originalDataUrl;
        };
        reader.onerror = () => {
          console.error('[widget-photo-card] 读取图片失败');
          if (this.showToast) this.showToast('读取图片失败');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });

      photoCardBlurEl.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '8', 10);
        const blur = Math.max(0, Math.min(15, Number.isFinite(raw) ? raw : 8));
        photoDraft = { ...(photoDraft || {}), blurAmount: blur };
        if (photoCardBlurLabelEl) photoCardBlurLabelEl.textContent = blur + 'px';
        renderPhotoCardPreview(photoDraft);
      });

      photoCardBlurAlphaEl.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '60', 10);
        const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 60));
        const alpha = pct / 100;
        photoDraft = { ...(photoDraft || {}), blurAlpha: alpha };
        if (photoCardBlurAlphaLabelEl) photoCardBlurAlphaLabelEl.textContent = pct + '%';
        renderPhotoCardPreview(photoDraft);
      });

      photoCardTextLeftEl.addEventListener('input', (e) => {
        const v = String(e.target.value || '').slice(0, 24);
        photoDraft = { ...(photoDraft || {}), textLeft: v };
        renderPhotoCardPreview(photoDraft);
      });

      photoCardTextRightEl.addEventListener('input', (e) => {
        const v = String(e.target.value || '').slice(0, 24);
        photoDraft = { ...(photoDraft || {}), textRight: v };
        renderPhotoCardPreview(photoDraft);
      });

      photoCardResetBtn?.addEventListener('click', () => {
        photoDraft = { image: '', blurAmount: 8, blurAlpha: 0.6, textLeft: '', textRight: '' };
        syncPhotoUi();
        renderPhotoCardPreview(photoDraft);
        if (this.showToast) this.showToast('已重置为默认（未保存）');
      });

      photoCardSaveBtn?.addEventListener('click', () => {
        try {
          writePhotoCardStyle(photoDraft);
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.setWidgetHideFromHomescreen) {
              Homescreen.setWidgetHideFromHomescreen('widget-photo-card', !!(photoCardHideHomescreenEl && photoCardHideHomescreenEl.checked));
            }
          } catch (e) {}
          if (this.showToast) this.showToast('已保存');
          this._photoCardDirty = false;
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen) {
              Homescreen.renderHomescreen();
            }
          } catch (e) {
            console.error('[widget-photo-card] 重新渲染主屏失败:', e);
          }
        } catch (e) {
          if (this.showToast) this.showToast('保存失败：' + (e.message || '未知错误'));
        }
      });

      photoCardBackBtn?.addEventListener('click', () => {
        if (this._photoCardDirty) {
          const ok = confirm('当前修改尚未保存，确定要退出吗？');
          if (!ok) return;
        }
        State.switchPage('page-widgets');
      });
    }

    // 相片圆卡组件样式页：背景模糊 / 透明、圆形图片、下方两行文字
    const photoCirclePreviewEl = document.getElementById('photo-circle-style-preview');
    const photoCircleImagePreviewEl = document.getElementById('photo-circle-style-image-preview');
    const photoCircleImageUploadBtn = document.getElementById('photo-circle-style-image-upload-btn');
    const photoCircleImageFileInput = document.getElementById('photo-circle-style-image-input');
    const photoCircleBlurEl = document.getElementById('photo-circle-style-blur');
    const photoCircleBlurLabelEl = document.getElementById('photo-circle-style-blur-label');
    const photoCircleBlurAlphaEl = document.getElementById('photo-circle-style-blur-alpha');
    const photoCircleBlurAlphaLabelEl = document.getElementById('photo-circle-style-blur-alpha-label');
    const photoCircleTextLine1El = document.getElementById('photo-circle-style-text-line1');
    const photoCircleTextLine2El = document.getElementById('photo-circle-style-text-line2');
    const photoCircleLine1ColorEl = document.getElementById('photo-circle-style-line1-color');
    const photoCircleLine2ColorEl = document.getElementById('photo-circle-style-line2-color');
    const photoCircleLine1BgEnabledEl = document.getElementById('photo-circle-style-line1-bg-enabled');
    const photoCircleLine2BgEnabledEl = document.getElementById('photo-circle-style-line2-bg-enabled');
    const photoCircleLine1BgEl = document.getElementById('photo-circle-style-line1-bg');
    const photoCircleLine2BgEl = document.getElementById('photo-circle-style-line2-bg');
    const photoCircleResetBtn = document.getElementById('photo-circle-style-reset');
    const photoCircleSaveBtn = document.getElementById('photo-circle-style-save');
    const photoCircleBackBtn = document.getElementById('photo-circle-style-back');
    const photoCircleHideHomescreenEl = document.getElementById('homescreen-hide-widget-photo-circle');

    const readPhotoCircleStyle = () => {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.PHOTO_CIRCLE_STYLE);
        if (raw && typeof raw === 'object') {
          return {
            image: (typeof raw.image === 'string') ? raw.image : '',
            blurAmount: (typeof raw.blurAmount === 'number') ? raw.blurAmount : 8,
            blurAlpha: (typeof raw.blurAlpha === 'number') ? raw.blurAlpha : 0.6,
            textLine1: (typeof raw.textLine1 === 'string') ? raw.textLine1 : '',
            textLine2: (typeof raw.textLine2 === 'string') ? raw.textLine2 : '',
            bgColor: (typeof raw.bgColor === 'string') ? raw.bgColor : '',
            line1Color: (typeof raw.line1Color === 'string') ? raw.line1Color : '#ffffff',
            line2Color: (typeof raw.line2Color === 'string') ? raw.line2Color : '#ffffff',
            line1BgEnabled: (typeof raw.line1BgEnabled === 'boolean') ? raw.line1BgEnabled : true,
            line2BgEnabled: (typeof raw.line2BgEnabled === 'boolean') ? raw.line2BgEnabled : true,
            line1Bg: (typeof raw.line1Bg === 'string') ? raw.line1Bg : '#000000',
            line2Bg: (typeof raw.line2Bg === 'string') ? raw.line2Bg : '#000000'
          };
        }
      } catch (e) {}
      return { image: '', blurAmount: 8, blurAlpha: 0.6, textLine1: '', textLine2: '', bgColor: '', line1Color: '#ffffff', line2Color: '#ffffff', line1BgEnabled: true, line2BgEnabled: true, line1Bg: '#000000', line2Bg: '#000000' };
    };

    const writePhotoCircleStyle = (s) => {
      try {
        const blur = Math.max(0, Math.min(15, Number.isFinite(s?.blurAmount) ? s.blurAmount : 8));
        const alpha = (typeof s?.blurAlpha === 'number') ? Math.max(0, Math.min(1, s.blurAlpha)) : 0.6;
        const toSave = {
          image: (s && typeof s.image === 'string') ? s.image : '',
          blurAmount: blur,
          blurAlpha: alpha,
          textLine1: (s && typeof s.textLine1 === 'string') ? s.textLine1 : '',
          textLine2: (s && typeof s.textLine2 === 'string') ? s.textLine2 : '',
          bgColor: (s && typeof s.bgColor === 'string') ? s.bgColor : '',
          line1Color: (s && typeof s.line1Color === 'string') ? s.line1Color : '#ffffff',
          line2Color: (s && typeof s.line2Color === 'string') ? s.line2Color : '#ffffff',
          line1BgEnabled: (typeof s?.line1BgEnabled === 'boolean') ? s.line1BgEnabled : true,
          line2BgEnabled: (typeof s?.line2BgEnabled === 'boolean') ? s.line2BgEnabled : true,
          line1Bg: (s && typeof s.line1Bg === 'string') ? s.line1Bg : '#000000',
          line2Bg: (s && typeof s.line2Bg === 'string') ? s.line2Bg : '#000000'
        };
        Storage.set(CONFIG.STORAGE_KEYS.PHOTO_CIRCLE_STYLE, toSave);
      } catch (e) {
        console.error('[widget-photo-circle] 保存样式失败', e);
        throw e;
      }
    };

    const renderPhotoCirclePreview = (style) => {
      if (!photoCirclePreviewEl || typeof Homescreen === 'undefined' || !Homescreen.getPhotoCircleWidgetSrcDoc) return;
      try {
        const s = style || readPhotoCircleStyle();
        const iframe = document.createElement('iframe');
        iframe.className = 'yd-time-date-preview-iframe';
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.srcdoc = Homescreen.getPhotoCircleWidgetSrcDoc(s);
        photoCirclePreviewEl.innerHTML = '';
        photoCirclePreviewEl.appendChild(iframe);
      } catch (e) {
        console.error('[widget-photo-circle] 预览失败:', e);
        photoCirclePreviewEl.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">预览失败</div>';
      }
    };

    if (photoCirclePreviewEl && photoCircleImagePreviewEl && photoCircleImageUploadBtn && photoCircleImageFileInput && photoCircleBlurEl && photoCircleBlurAlphaEl && photoCircleTextLine1El && photoCircleTextLine2El) {
      // 未保存改动提醒（统一监听 input/change 标记 dirty）
      this._photoCircleDirty = false;
      const photoCirclePageEl = document.getElementById('page-widget-photo-circle-style');
      if (photoCirclePageEl && !photoCirclePageEl.__ydDirtyBound) {
        photoCirclePageEl.__ydDirtyBound = true;
        photoCirclePageEl.addEventListener('input', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'photo-circle-style-save' || t.id === 'photo-circle-style-reset' || t.id === 'photo-circle-style-back') return;
          this._photoCircleDirty = true;
        }, true);
        photoCirclePageEl.addEventListener('change', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'photo-circle-style-save' || t.id === 'photo-circle-style-reset' || t.id === 'photo-circle-style-back') return;
          this._photoCircleDirty = true;
        }, true);
      }

      let circleDraft = readPhotoCircleStyle();

      const syncCircleUi = () => {
        if (photoCircleImagePreviewEl) {
          if (circleDraft.image) {
            photoCircleImagePreviewEl.src = circleDraft.image;
            photoCircleImagePreviewEl.style.display = 'block';
          } else {
            photoCircleImagePreviewEl.src = '';
            photoCircleImagePreviewEl.style.display = 'none';
          }
        }
        const blur = Math.max(0, Math.min(15, Number.isFinite(circleDraft.blurAmount) ? circleDraft.blurAmount : 8));
        const alphaPct = Math.round(((typeof circleDraft.blurAlpha === 'number' ? circleDraft.blurAlpha : 0.6) * 100));
        if (photoCircleBlurEl) photoCircleBlurEl.value = String(blur);
        if (photoCircleBlurLabelEl) photoCircleBlurLabelEl.textContent = blur + 'px';
        if (photoCircleBlurAlphaEl) photoCircleBlurAlphaEl.value = String(alphaPct);
        if (photoCircleBlurAlphaLabelEl) photoCircleBlurAlphaLabelEl.textContent = alphaPct + '%';
        if (photoCircleTextLine1El) photoCircleTextLine1El.value = circleDraft.textLine1 || '';
        if (photoCircleTextLine2El) photoCircleTextLine2El.value = circleDraft.textLine2 || '';
        if (photoCircleLine1ColorEl) photoCircleLine1ColorEl.value = circleDraft.line1Color || '#ffffff';
        if (photoCircleLine2ColorEl) photoCircleLine2ColorEl.value = circleDraft.line2Color || '#ffffff';
        if (photoCircleLine1BgEnabledEl) photoCircleLine1BgEnabledEl.checked = (circleDraft.line1BgEnabled !== false);
        if (photoCircleLine2BgEnabledEl) photoCircleLine2BgEnabledEl.checked = (circleDraft.line2BgEnabled !== false);
        if (photoCircleLine1BgEl) photoCircleLine1BgEl.value = circleDraft.line1Bg || '#000000';
        if (photoCircleLine2BgEl) photoCircleLine2BgEl.value = circleDraft.line2Bg || '#000000';
      };

      syncCircleUi();
      if (photoCircleHideHomescreenEl && typeof Homescreen !== 'undefined' && Homescreen.getWidgetHideFromHomescreenMap) {
        photoCircleHideHomescreenEl.checked = !!Homescreen.getWidgetHideFromHomescreenMap()['widget-photo-circle'];
      }
      renderPhotoCirclePreview(circleDraft);
      this._photoCircleDirty = false;

      photoCircleImageUploadBtn.addEventListener('click', () => {
        photoCircleImageFileInput.click();
      });

      photoCircleImageFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const originalDataUrl = String(reader.result || '').trim();
          if (!originalDataUrl) return;

          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const targetSize = 200;
              canvas.width = targetSize;
              canvas.height = targetSize;
              ctx.drawImage(img, 0, 0, targetSize, targetSize);

              const imgData = ctx.getImageData(0, 0, targetSize, targetSize).data;
              let r = 0, g = 0, b = 0;
              const total = targetSize * targetSize;
              for (let i = 0; i < imgData.length; i += 4 * 16) {
                r += imgData[i];
                g += imgData[i + 1];
                b += imgData[i + 2];
              }
              const samples = Math.max(1, Math.floor(total / 16));
              r = Math.round(r / samples);
              g = Math.round(g / samples);
              b = Math.round(b / samples);
              const toHex = (v) => v.toString(16).padStart(2, '0');
              const mainColor = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

              const smallDataUrl = canvas.toDataURL('image/jpeg', 0.7);

              circleDraft = { ...(circleDraft || {}), image: smallDataUrl, bgColor: mainColor };
              syncCircleUi();
              renderPhotoCirclePreview(circleDraft);
            } catch (err) {
              console.error('[widget-photo-circle] 处理图片失败', err);
              if (this.showToast) this.showToast('处理图片失败');
            }
          };
          img.onerror = () => {
            console.error('[widget-photo-circle] 图片加载失败');
            if (this.showToast) this.showToast('图片加载失败');
          };
          img.src = originalDataUrl;
        };
        reader.onerror = () => {
          console.error('[widget-photo-circle] 读取图片失败');
          if (this.showToast) this.showToast('读取图片失败');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });

      photoCircleBlurEl.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '8', 10);
        const blur = Math.max(0, Math.min(15, Number.isFinite(raw) ? raw : 8));
        circleDraft = { ...(circleDraft || {}), blurAmount: blur };
        if (photoCircleBlurLabelEl) photoCircleBlurLabelEl.textContent = blur + 'px';
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleBlurAlphaEl.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '60', 10);
        const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 60));
        const alpha = pct / 100;
        circleDraft = { ...(circleDraft || {}), blurAlpha: alpha };
        if (photoCircleBlurAlphaLabelEl) photoCircleBlurAlphaLabelEl.textContent = pct + '%';
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleTextLine1El.addEventListener('input', (e) => {
        const v = String(e.target.value || '').slice(0, 13);
        circleDraft = { ...(circleDraft || {}), textLine1: v };
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleTextLine2El.addEventListener('input', (e) => {
        const v = String(e.target.value || '').slice(0, 13);
        circleDraft = { ...(circleDraft || {}), textLine2: v };
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleLine1ColorEl?.addEventListener('input', (e) => {
        const v = String(e.target.value || '').trim() || '#ffffff';
        circleDraft = { ...(circleDraft || {}), line1Color: v };
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleLine2ColorEl?.addEventListener('input', (e) => {
        const v = String(e.target.value || '').trim() || '#ffffff';
        circleDraft = { ...(circleDraft || {}), line2Color: v };
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleLine1BgEnabledEl?.addEventListener('change', (e) => {
        circleDraft = { ...(circleDraft || {}), line1BgEnabled: !!e.target.checked };
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleLine2BgEnabledEl?.addEventListener('change', (e) => {
        circleDraft = { ...(circleDraft || {}), line2BgEnabled: !!e.target.checked };
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleLine1BgEl?.addEventListener('input', (e) => {
        const v = String(e.target.value || '').trim() || '#000000';
        circleDraft = { ...(circleDraft || {}), line1Bg: v };
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleLine2BgEl?.addEventListener('input', (e) => {
        const v = String(e.target.value || '').trim() || '#000000';
        circleDraft = { ...(circleDraft || {}), line2Bg: v };
        renderPhotoCirclePreview(circleDraft);
      });

      photoCircleResetBtn?.addEventListener('click', () => {
        circleDraft = { image: '', blurAmount: 8, blurAlpha: 0.6, textLine1: '', textLine2: '', bgColor: '', line1Color: '#ffffff', line2Color: '#ffffff', line1BgEnabled: true, line2BgEnabled: true, line1Bg: '#000000', line2Bg: '#000000' };
        syncCircleUi();
        renderPhotoCirclePreview(circleDraft);
        if (this.showToast) this.showToast('已重置为默认（未保存）');
      });

      photoCircleSaveBtn?.addEventListener('click', () => {
        try {
          writePhotoCircleStyle(circleDraft);
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.setWidgetHideFromHomescreen) {
              Homescreen.setWidgetHideFromHomescreen('widget-photo-circle', !!(photoCircleHideHomescreenEl && photoCircleHideHomescreenEl.checked));
            }
          } catch (e) {}
          if (this.showToast) this.showToast('已保存');
          this._photoCircleDirty = false;
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen) {
              Homescreen.renderHomescreen();
            }
          } catch (e) {
            console.error('[widget-photo-circle] 重新渲染主屏失败:', e);
          }
        } catch (e) {
          if (this.showToast) this.showToast('保存失败：' + (e.message || '未知错误'));
        }
      });

      photoCircleBackBtn?.addEventListener('click', () => {
        if (this._photoCircleDirty) {
          const ok = confirm('当前修改尚未保存，确定要退出吗？');
          if (!ok) return;
        }
        State.switchPage('page-widgets');
      });
    }

    // 日期卡组件样式页：背景图 + 日期角标位置 + 背景模糊/透明
    const dateCardPreviewEl = document.getElementById('date-card-style-preview');
    const dateCardBgPreviewEl = document.getElementById('date-card-style-bg-preview');
    const dateCardBgUploadBtn = document.getElementById('date-card-style-bg-upload-btn');
    const dateCardBgFileInput = document.getElementById('date-card-style-bg-input');
    const dateCardBlurEl = document.getElementById('date-card-style-blur');
    const dateCardBlurLabelEl = document.getElementById('date-card-style-blur-label');
    const dateCardAlphaEl = document.getElementById('date-card-style-alpha');
    const dateCardAlphaLabelEl = document.getElementById('date-card-style-alpha-label');
    const dateCardCornerEl = document.getElementById('date-card-style-corner');
    const dateCardDateFontEl = document.getElementById('date-card-style-date-font');
    const dateCardDateSizeEl = document.getElementById('date-card-style-date-size');
    const dateCardDateSizeLabelEl = document.getElementById('date-card-style-date-size-label');
    const dateCardWeekFontEl = document.getElementById('date-card-style-week-font');
    const dateCardWeekSizeEl = document.getElementById('date-card-style-week-size');
    const dateCardWeekSizeLabelEl = document.getElementById('date-card-style-week-size-label');
    const dateCardDateColorEl = document.getElementById('date-card-style-date-color');
    const dateCardDateOpacityEl = document.getElementById('date-card-style-date-opacity');
    const dateCardDateOpacityLabelEl = document.getElementById('date-card-style-date-opacity-label');
    const dateCardWeekColorEl = document.getElementById('date-card-style-week-color');
    const dateCardWeekOpacityEl = document.getElementById('date-card-style-week-opacity');
    const dateCardWeekOpacityLabelEl = document.getElementById('date-card-style-week-opacity-label');
    const dateCardResetBtn = document.getElementById('date-card-style-reset');
    const dateCardSaveBtn = document.getElementById('date-card-style-save');
    const dateCardBackBtn = document.getElementById('date-card-style-back');
    const dateCardHideHomescreenEl = document.getElementById('homescreen-hide-widget-date-card');

    const readDateCardStyle = () => {
      try {
        const raw = Storage.get(CONFIG.STORAGE_KEYS.DATE_CARD_STYLE);
        if (raw && typeof raw === 'object') {
          return {
            bgImage: (typeof raw.bgImage === 'string') ? raw.bgImage : '',
            blurAmount: (typeof raw.blurAmount === 'number') ? raw.blurAmount : 6,
            alpha: (typeof raw.alpha === 'number') ? raw.alpha : 0.85,
            corner: (typeof raw.corner === 'string') ? raw.corner : 'tr',
            dateFont: (typeof raw.dateFont === 'string') ? raw.dateFont : 'system',
            weekFont: (typeof raw.weekFont === 'string') ? raw.weekFont : 'system',
            dateSize: (typeof raw.dateSize === 'number') ? raw.dateSize : 16,
            weekSize: (typeof raw.weekSize === 'number') ? raw.weekSize : 11,
            dateColor: (typeof raw.dateColor === 'string') ? raw.dateColor : '#ffffff',
            weekColor: (typeof raw.weekColor === 'string') ? raw.weekColor : '#ffffff',
            dateOpacity: (typeof raw.dateOpacity === 'number') ? raw.dateOpacity : 1,
            weekOpacity: (typeof raw.weekOpacity === 'number') ? raw.weekOpacity : 1
          };
        }
      } catch (e) {}
      return {
        bgImage: '',
        blurAmount: 6,
        alpha: 0.85,
        corner: 'tr',
        dateFont: 'system',
        weekFont: 'system',
        dateSize: 16,
        weekSize: 11,
        dateColor: '#ffffff',
        weekColor: '#ffffff',
        dateOpacity: 1,
        weekOpacity: 1
      };
    };

    const writeDateCardStyle = (s) => {
      try {
        const blur = Math.max(0, Math.min(15, Number.isFinite(s?.blurAmount) ? s.blurAmount : 6));
        const alpha = (typeof s?.alpha === 'number') ? Math.max(0.2, Math.min(1, s.alpha)) : 0.85;
        const corner = (s && typeof s.corner === 'string') ? s.corner : 'tr';
        const safeCorner = (corner === 'tl' || corner === 'tr' || corner === 'bl' || corner === 'br') ? corner : 'tr';
        const dateFont = (s && typeof s.dateFont === 'string') ? s.dateFont : 'system';
        const weekFont = (s && typeof s.weekFont === 'string') ? s.weekFont : 'system';
        const dateSize = Math.max(10, Math.min(26, Number.isFinite(s?.dateSize) ? s.dateSize : 16));
        const weekSize = Math.max(9, Math.min(20, Number.isFinite(s?.weekSize) ? s.weekSize : 11));
        const dateColor = (s && typeof s.dateColor === 'string') ? s.dateColor : '#ffffff';
        const weekColor = (s && typeof s.weekColor === 'string') ? s.weekColor : '#ffffff';
        const dateOpacity = (typeof s?.dateOpacity === 'number') ? Math.max(0.2, Math.min(1, s.dateOpacity)) : 1;
        const weekOpacity = (typeof s?.weekOpacity === 'number') ? Math.max(0.2, Math.min(1, s.weekOpacity)) : 1;
        const toSave = {
          bgImage: (s && typeof s.bgImage === 'string') ? s.bgImage : '',
          blurAmount: blur,
          alpha,
          corner: safeCorner,
          dateFont,
          weekFont,
          dateSize,
          weekSize,
          dateColor,
          weekColor,
          dateOpacity,
          weekOpacity
        };
        Storage.set(CONFIG.STORAGE_KEYS.DATE_CARD_STYLE, toSave);
      } catch (e) {
        console.error('[widget-date-card] 保存样式失败', e);
        throw e;
      }
    };

    const renderDateCardPreview = (style) => {
      if (!dateCardPreviewEl || typeof Homescreen === 'undefined' || !Homescreen.getDateCardWidgetSrcDoc) return;
      try {
        const s = style || readDateCardStyle();
        const iframe = document.createElement('iframe');
        iframe.className = 'yd-time-date-preview-iframe';
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.srcdoc = Homescreen.getDateCardWidgetSrcDoc(s);
        dateCardPreviewEl.innerHTML = '';
        dateCardPreviewEl.appendChild(iframe);
      } catch (e) {
        console.error('[widget-date-card] 预览失败:', e);
        dateCardPreviewEl.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">预览失败</div>';
      }
    };

    if (dateCardPreviewEl && dateCardBgUploadBtn && dateCardBgFileInput && dateCardBlurEl && dateCardAlphaEl && dateCardCornerEl) {
      // 未保存改动提醒（统一监听 input/change 标记 dirty）
      this._dateCardDirty = false;
      const dateCardPageEl = document.getElementById('page-widget-date-card-style');
      if (dateCardPageEl && !dateCardPageEl.__ydDirtyBound) {
        dateCardPageEl.__ydDirtyBound = true;
        dateCardPageEl.addEventListener('input', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'date-card-style-save' || t.id === 'date-card-style-reset' || t.id === 'date-card-style-back') return;
          this._dateCardDirty = true;
        }, true);
        dateCardPageEl.addEventListener('change', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'date-card-style-save' || t.id === 'date-card-style-reset' || t.id === 'date-card-style-back') return;
          this._dateCardDirty = true;
        }, true);
      }

      let dateDraft = readDateCardStyle();

      const syncDateUi = () => {
        if (dateCardBgPreviewEl) {
          if (dateDraft.bgImage) {
            dateCardBgPreviewEl.src = dateDraft.bgImage;
            dateCardBgPreviewEl.style.display = 'block';
          } else {
            dateCardBgPreviewEl.src = '';
            dateCardBgPreviewEl.style.display = 'none';
          }
        }

        const blur = Math.max(0, Math.min(15, Number.isFinite(dateDraft.blurAmount) ? dateDraft.blurAmount : 6));
        const alphaPct = Math.round(((typeof dateDraft.alpha === 'number' ? dateDraft.alpha : 0.85) * 100));
        if (dateCardBlurEl) dateCardBlurEl.value = String(blur);
        if (dateCardBlurLabelEl) dateCardBlurLabelEl.textContent = blur + 'px';
        if (dateCardAlphaEl) dateCardAlphaEl.value = String(alphaPct);
        if (dateCardAlphaLabelEl) dateCardAlphaLabelEl.textContent = alphaPct + '%';

        const corner = (typeof dateDraft.corner === 'string') ? dateDraft.corner : 'tr';
        const safeCorner = (corner === 'tl' || corner === 'tr' || corner === 'bl' || corner === 'br') ? corner : 'tr';
        if (dateCardCornerEl) dateCardCornerEl.value = safeCorner;

        const df = (typeof dateDraft.dateFont === 'string') ? dateDraft.dateFont : 'system';
        const wf = (typeof dateDraft.weekFont === 'string') ? dateDraft.weekFont : 'system';
        if (dateCardDateFontEl) dateCardDateFontEl.value = df;
        if (dateCardWeekFontEl) dateCardWeekFontEl.value = wf;

        const ds = Math.max(10, Math.min(26, Number.isFinite(dateDraft.dateSize) ? dateDraft.dateSize : 16));
        const ws = Math.max(9, Math.min(20, Number.isFinite(dateDraft.weekSize) ? dateDraft.weekSize : 11));
        if (dateCardDateSizeEl) dateCardDateSizeEl.value = String(ds);
        if (dateCardDateSizeLabelEl) dateCardDateSizeLabelEl.textContent = ds + 'px';
        if (dateCardWeekSizeEl) dateCardWeekSizeEl.value = String(ws);
        if (dateCardWeekSizeLabelEl) dateCardWeekSizeLabelEl.textContent = ws + 'px';

        const dc = (typeof dateDraft.dateColor === 'string') ? dateDraft.dateColor : '#ffffff';
        const wc = (typeof dateDraft.weekColor === 'string') ? dateDraft.weekColor : '#ffffff';
        const doVal = (typeof dateDraft.dateOpacity === 'number') ? Math.round(Math.max(0.2, Math.min(1, dateDraft.dateOpacity)) * 100) : 100;
        const woVal = (typeof dateDraft.weekOpacity === 'number') ? Math.round(Math.max(0.2, Math.min(1, dateDraft.weekOpacity)) * 100) : 100;
        if (dateCardDateColorEl) dateCardDateColorEl.value = dc;
        if (dateCardWeekColorEl) dateCardWeekColorEl.value = wc;
        if (dateCardDateOpacityEl) dateCardDateOpacityEl.value = String(doVal);
        if (dateCardDateOpacityLabelEl) dateCardDateOpacityLabelEl.textContent = doVal + '%';
        if (dateCardWeekOpacityEl) dateCardWeekOpacityEl.value = String(woVal);
        if (dateCardWeekOpacityLabelEl) dateCardWeekOpacityLabelEl.textContent = woVal + '%';
      };

      syncDateUi();
      if (dateCardHideHomescreenEl && typeof Homescreen !== 'undefined' && Homescreen.getWidgetHideFromHomescreenMap) {
        dateCardHideHomescreenEl.checked = !!Homescreen.getWidgetHideFromHomescreenMap()['widget-date-card'];
      }
      renderDateCardPreview(dateDraft);
      this._dateCardDirty = false;

      dateCardBgUploadBtn.addEventListener('click', () => {
        dateCardBgFileInput.click();
      });

      dateCardBgFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const originalDataUrl = String(reader.result || '').trim();
          if (!originalDataUrl) return;

          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const target = 320;
              canvas.width = target;
              canvas.height = target;
              ctx.drawImage(img, 0, 0, target, target);
              const smallDataUrl = canvas.toDataURL('image/jpeg', 0.75);
              dateDraft = { ...(dateDraft || {}), bgImage: smallDataUrl };
              syncDateUi();
              renderDateCardPreview(dateDraft);
            } catch (err) {
              console.error('[widget-date-card] 处理图片失败', err);
              if (this.showToast) this.showToast('处理图片失败');
            }
          };
          img.onerror = () => {
            console.error('[widget-date-card] 图片加载失败');
            if (this.showToast) this.showToast('图片加载失败');
          };
          img.src = originalDataUrl;
        };
        reader.onerror = () => {
          console.error('[widget-date-card] 读取图片失败');
          if (this.showToast) this.showToast('读取图片失败');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      });

      dateCardBlurEl.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '6', 10);
        const blur = Math.max(0, Math.min(15, Number.isFinite(raw) ? raw : 6));
        dateDraft = { ...(dateDraft || {}), blurAmount: blur };
        if (dateCardBlurLabelEl) dateCardBlurLabelEl.textContent = blur + 'px';
        renderDateCardPreview(dateDraft);
      });

      dateCardAlphaEl.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '85', 10);
        const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 85));
        dateDraft = { ...(dateDraft || {}), alpha: pct / 100 };
        if (dateCardAlphaLabelEl) dateCardAlphaLabelEl.textContent = pct + '%';
        renderDateCardPreview(dateDraft);
      });

      dateCardCornerEl.addEventListener('change', (e) => {
        const v = String(e.target.value || '').trim();
        const safeCorner = (v === 'tl' || v === 'tr' || v === 'bl' || v === 'br') ? v : 'tr';
        dateDraft = { ...(dateDraft || {}), corner: safeCorner };
        renderDateCardPreview(dateDraft);
      });

      dateCardDateFontEl?.addEventListener('change', (e) => {
        const v = String(e.target.value || '').trim() || 'system';
        dateDraft = { ...(dateDraft || {}), dateFont: v };
        renderDateCardPreview(dateDraft);
      });

      dateCardWeekFontEl?.addEventListener('change', (e) => {
        const v = String(e.target.value || '').trim() || 'system';
        dateDraft = { ...(dateDraft || {}), weekFont: v };
        renderDateCardPreview(dateDraft);
      });

      dateCardDateSizeEl?.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '16', 10);
        const ds = Math.max(10, Math.min(26, Number.isFinite(raw) ? raw : 16));
        dateDraft = { ...(dateDraft || {}), dateSize: ds };
        if (dateCardDateSizeLabelEl) dateCardDateSizeLabelEl.textContent = ds + 'px';
        renderDateCardPreview(dateDraft);
      });

      dateCardWeekSizeEl?.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '11', 10);
        const ws = Math.max(9, Math.min(20, Number.isFinite(raw) ? raw : 11));
        dateDraft = { ...(dateDraft || {}), weekSize: ws };
        if (dateCardWeekSizeLabelEl) dateCardWeekSizeLabelEl.textContent = ws + 'px';
        renderDateCardPreview(dateDraft);
      });

      dateCardDateColorEl?.addEventListener('input', (e) => {
        const v = String(e.target.value || '').trim() || '#ffffff';
        dateDraft = { ...(dateDraft || {}), dateColor: v };
        renderDateCardPreview(dateDraft);
      });

      dateCardWeekColorEl?.addEventListener('input', (e) => {
        const v = String(e.target.value || '').trim() || '#ffffff';
        dateDraft = { ...(dateDraft || {}), weekColor: v };
        renderDateCardPreview(dateDraft);
      });

      dateCardDateOpacityEl?.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '100', 10);
        const pct = Math.max(20, Math.min(100, Number.isFinite(raw) ? raw : 100));
        dateDraft = { ...(dateDraft || {}), dateOpacity: pct / 100 };
        if (dateCardDateOpacityLabelEl) dateCardDateOpacityLabelEl.textContent = pct + '%';
        renderDateCardPreview(dateDraft);
      });

      dateCardWeekOpacityEl?.addEventListener('input', (e) => {
        const raw = parseInt(e.target.value || '100', 10);
        const pct = Math.max(20, Math.min(100, Number.isFinite(raw) ? raw : 100));
        dateDraft = { ...(dateDraft || {}), weekOpacity: pct / 100 };
        if (dateCardWeekOpacityLabelEl) dateCardWeekOpacityLabelEl.textContent = pct + '%';
        renderDateCardPreview(dateDraft);
      });

      dateCardResetBtn?.addEventListener('click', () => {
        dateDraft = {
          bgImage: '',
          blurAmount: 6,
          alpha: 0.85,
          corner: 'tr',
          dateFont: 'system',
          weekFont: 'system',
          dateSize: 16,
          weekSize: 11,
          dateColor: '#ffffff',
          weekColor: '#ffffff',
          dateOpacity: 1,
          weekOpacity: 1
        };
        syncDateUi();
        renderDateCardPreview(dateDraft);
        if (this.showToast) this.showToast('已重置为默认（未保存）');
      });

      dateCardSaveBtn?.addEventListener('click', () => {
        try {
          writeDateCardStyle(dateDraft);
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.setWidgetHideFromHomescreen) {
              Homescreen.setWidgetHideFromHomescreen('widget-date-card', !!(dateCardHideHomescreenEl && dateCardHideHomescreenEl.checked));
            }
          } catch (e) {}
          if (this.showToast) this.showToast('已保存');
          this._dateCardDirty = false;
          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen) {
              Homescreen.renderHomescreen();
            }
          } catch (e) {
            console.error('[widget-date-card] 重新渲染主屏失败:', e);
          }
        } catch (e) {
          if (this.showToast) this.showToast('保存失败：' + (e.message || '未知错误'));
        }
      });

      dateCardBackBtn?.addEventListener('click', () => {
        if (this._dateCardDirty) {
          const ok = confirm('当前修改尚未保存，确定要退出吗？');
          if (!ok) return;
        }
        State.switchPage('page-widgets');
      });
    }

    // 头像卡片组件内容编辑页：管理 widget-profile-card 的多行文案（文本资源）
    const profileCardPreviewEl = document.getElementById('profile-card-style-preview');
    const profileCardTextEl = document.getElementById('profile-card-style-text');
    const profileCardSaveBtn = document.getElementById('profile-card-style-save');
    const profileCardResetBtn = document.getElementById('profile-card-style-reset');
    const profileCardBackBtn = document.getElementById('profile-card-style-back');
    const profileCardHideHomescreenEl = document.getElementById('homescreen-hide-widget-profile-card');
    const profileCardLowerBlurEl = document.getElementById('profile-card-lower-blur');
    const profileCardLowerBlurLabelEl = document.getElementById('profile-card-lower-blur-label');
    const profileCardLowerAlphaEl = document.getElementById('profile-card-lower-alpha');
    const profileCardLowerAlphaLabelEl = document.getElementById('profile-card-lower-alpha-label');
    const profileCardLowerTextColorEl = document.getElementById('profile-card-lower-text-color');
    const profileCardBgPreviewEl = document.getElementById('profile-card-style-bg-preview');
    const profileCardBgPlaceholderEl = document.getElementById('profile-card-style-bg-placeholder');
    const profileCardBgUploadBtn = document.getElementById('profile-card-style-bg-upload-btn');
    const profileCardBgInput = document.getElementById('profile-card-style-bg-input');
    const profileCardAvatarPreviewEl = document.getElementById('profile-card-style-avatar-preview');
    const profileCardAvatarPlaceholderEl = document.getElementById('profile-card-style-avatar-placeholder');
    const profileCardAvatarUploadBtn = document.getElementById('profile-card-style-avatar-upload-btn');
    const profileCardAvatarInput = document.getElementById('profile-card-style-avatar-input');
    const profileCardTopFontSizeEl = document.getElementById('profile-card-top-font-size');
    const profileCardTopFontSizeLabelEl = document.getElementById('profile-card-top-font-size-label');
    const topEls = [
      {
        text: document.getElementById('profile-card-top1-text'),
        color: document.getElementById('profile-card-top1-color'),
        bgEnabled: document.getElementById('profile-card-top1-bg-enabled'),
        bg: document.getElementById('profile-card-top1-bg'),
        bgAlpha: document.getElementById('profile-card-top1-bg-alpha'),
        bgAlphaLabel: document.getElementById('profile-card-top1-bg-alpha-label')
      },
      {
        text: document.getElementById('profile-card-top2-text'),
        color: document.getElementById('profile-card-top2-color'),
        bgEnabled: document.getElementById('profile-card-top2-bg-enabled'),
        bg: document.getElementById('profile-card-top2-bg'),
        bgAlpha: document.getElementById('profile-card-top2-bg-alpha'),
        bgAlphaLabel: document.getElementById('profile-card-top2-bg-alpha-label')
      },
      {
        text: document.getElementById('profile-card-top3-text'),
        color: document.getElementById('profile-card-top3-color'),
        bgEnabled: document.getElementById('profile-card-top3-bg-enabled'),
        bg: document.getElementById('profile-card-top3-bg'),
        bgAlpha: document.getElementById('profile-card-top3-bg-alpha'),
        bgAlphaLabel: document.getElementById('profile-card-top3-bg-alpha-label')
      },
      {
        text: document.getElementById('profile-card-top4-text'),
        color: document.getElementById('profile-card-top4-color'),
        bgEnabled: document.getElementById('profile-card-top4-bg-enabled'),
        bg: document.getElementById('profile-card-top4-bg'),
        bgAlpha: document.getElementById('profile-card-top4-bg-alpha'),
        bgAlphaLabel: document.getElementById('profile-card-top4-bg-alpha-label')
      }
    ];

    if (profileCardTextEl && profileCardSaveBtn && profileCardResetBtn && profileCardBackBtn) {
      // 未保存改动提醒
      this._profileCardDirty = false;
      const profilePageEl = document.getElementById('page-widget-profile-card-style');
      if (profilePageEl && !profilePageEl.__ydDirtyBound) {
        profilePageEl.__ydDirtyBound = true;
        profilePageEl.addEventListener('input', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'profile-card-style-save' || t.id === 'profile-card-style-reset' || t.id === 'profile-card-style-back') return;
          this._profileCardDirty = true;
        }, true);
        profilePageEl.addEventListener('change', (e) => {
          const t = e && e.target;
          if (!t) return;
          if (t.id === 'profile-card-style-save' || t.id === 'profile-card-style-reset' || t.id === 'profile-card-style-back') return;
          this._profileCardDirty = true;
        }, true);
      }

      const WIDGET_ID = 'widget-profile-card';
      let _profileCardPreviewIframe = null;
      let _profileCardImageCache = [];

      const loadProfileCardResources = async () => {
        try {
          const all = await Storage.dbGetAll('widgetResources');
          const texts = (all || []).filter(r => r && r.widgetId === WIDGET_ID && r.kind === 'text');
          const images = (all || []).filter(r => r && r.widgetId === WIDGET_ID && r.kind === 'image');
          const configs = (all || []).filter(r => r && r.widgetId === WIDGET_ID && r.kind === 'config');

          const sortedTexts = texts.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
          const byOrder = new Map(sortedTexts.map(t => [Number(t.order || 0), t]));

          // 顶部四句：order 2-5
          for (let i = 0; i < 4; i++) {
            const rec = byOrder.get(2 + i);
            const ui = topEls[i];
            if (!ui) continue;
            if (ui.text) ui.text.value = (rec && rec.text ? String(rec.text).trim() : '');
            if (ui.color) ui.color.value = (rec && typeof rec.color === 'string' && rec.color) ? rec.color : '#111827';
            if (ui.bgEnabled) ui.bgEnabled.checked = (rec && typeof rec.bgEnabled === 'boolean') ? rec.bgEnabled : true;
            if (ui.bg) ui.bg.value = (rec && typeof rec.bgColor === 'string' && rec.bgColor) ? rec.bgColor : '#ffffff';
            const pct = (rec && typeof rec.bgAlpha === 'number') ? rec.bgAlpha : 78;
            const safePct = Math.max(0, Math.min(100, pct));
            if (ui.bgAlpha) ui.bgAlpha.value = String(safePct);
            if (ui.bgAlphaLabel) ui.bgAlphaLabel.textContent = `${safePct}%`;
          }

          // textarea：仅保留标题/副标题/下半区文案（order 0,1, >=6）
          const value = sortedTexts
            .filter(r => {
              const o = Number(r.order || 0);
              return o === 0 || o === 1 || o >= 6;
            })
            .map(r => (r.text || '').trim())
            .join('\n');
          profileCardTextEl.value = value;

          // 下半区背景板：模糊度/透明度（config）
          try {
            const cfg = (configs || []).find(x => x && x.key === 'profile-card-lower') || null;
            const blurRaw = (cfg && typeof cfg.lowerBlur === 'number') ? cfg.lowerBlur : parseInt(cfg && cfg.lowerBlur, 10);
            const blur = Math.max(0, Math.min(15, Number.isFinite(blurRaw) ? blurRaw : 10));
            const alphaRaw = (cfg && typeof cfg.lowerAlpha === 'number') ? cfg.lowerAlpha : parseInt(cfg && cfg.lowerAlpha, 10);
            const alpha = Math.max(0, Math.min(100, Number.isFinite(alphaRaw) ? alphaRaw : 92));
            const txtColor = (cfg && typeof cfg.lowerTextColor === 'string' && cfg.lowerTextColor) ? cfg.lowerTextColor : '#111827';
            if (profileCardLowerBlurEl) profileCardLowerBlurEl.value = String(blur);
            if (profileCardLowerBlurLabelEl) profileCardLowerBlurLabelEl.textContent = String(blur);
            if (profileCardLowerAlphaEl) profileCardLowerAlphaEl.value = String(alpha);
            if (profileCardLowerAlphaLabelEl) profileCardLowerAlphaLabelEl.textContent = `${alpha}%`;
            if (profileCardLowerTextColorEl) profileCardLowerTextColorEl.value = txtColor;
          } catch (e) {}

          // 上半区四句：字体大小（config）
          try {
            const cfgTop = (configs || []).find(x => x && x.key === 'profile-card-top') || null;
            const sizeRaw = (cfgTop && typeof cfgTop.topFontSize === 'number') ? cfgTop.topFontSize : parseInt(cfgTop && cfgTop.topFontSize, 10);
            const size = Math.max(9, Math.min(18, Number.isFinite(sizeRaw) ? sizeRaw : 11));
            if (profileCardTopFontSizeEl) profileCardTopFontSizeEl.value = String(size);
            if (profileCardTopFontSizeLabelEl) profileCardTopFontSizeLabelEl.textContent = `${size}px`;
          } catch (e) {}

          // 约定：images[0] 作为背景图，images[1] 作为头像图
          const loadImagePreview = async (res, previewEl, placeholderEl) => {
            if (!previewEl || !placeholderEl || !res) return;
            try {
              let data = null;
              if (res.imageData && typeof res.imageData === 'string') {
                data = res.imageData;
              } else if (res.albumId && Storage && Storage.db && Storage.dbGet) {
                const pic = await Storage.dbGet('album', res.albumId);
                data = pic && pic.data;
              }
              if (data) {
                previewEl.src = data;
                previewEl.style.display = 'block';
                placeholderEl.style.display = 'none';
              } else {
                previewEl.src = '';
                previewEl.style.display = 'none';
                placeholderEl.style.display = 'inline-flex';
              }
            } catch (e) {
              console.error('[widget-profile-card] 读取图片失败:', e);
            }
          };

          if (images[0]) {
            await loadImagePreview(images[0], profileCardBgPreviewEl, profileCardBgPlaceholderEl);
          }
          if (images[1]) {
            await loadImagePreview(images[1], profileCardAvatarPreviewEl, profileCardAvatarPlaceholderEl);
          }

          // 组件预览：缓存图片数据，供“未保存时的实时预览”使用
          try {
            const albumAll = await Storage.dbGetAll('album');
            const albumMap = {};
            (albumAll || []).forEach((pic) => {
              if (pic && pic.id) albumMap[pic.id] = pic;
            });
            _profileCardImageCache = (images || []).map((r, idx) => {
              let imageData = r && r.imageData;
              if (!imageData && r && r.albumId && albumMap[r.albumId] && albumMap[r.albumId].data) {
                imageData = albumMap[r.albumId].data;
              }
              return {
                widgetId: WIDGET_ID,
                kind: 'image',
                imageData: imageData || '',
                order: (typeof r.order === 'number') ? r.order : idx
              };
            }).filter(x => x.imageData);
          } catch (e) {}

          // 渲染预览 iframe，并按照当前资源实时回显
          if (profileCardPreviewEl && typeof Homescreen !== 'undefined' && Homescreen.getWidgetSrcDoc) {
            try {
              const iframe = document.createElement('iframe');
              iframe.className = 'yd-time-date-preview-iframe';
              iframe.setAttribute('sandbox', 'allow-scripts');
              iframe.srcdoc = Homescreen.getWidgetSrcDoc(WIDGET_ID);
              profileCardPreviewEl.innerHTML = '';
              profileCardPreviewEl.appendChild(iframe);
              _profileCardPreviewIframe = iframe;

              iframe.addEventListener('load', async () => {
                try {
                  // 组合当前的文本和图片资源，发送给 widget
                  const resources = [];

                  // 文本资源：按顺序
                  sortedTexts
                    .forEach((r) => {
                      const t = (r.text || '').trim();
                      if (!t) return;
                      resources.push({
                        widgetId: WIDGET_ID,
                        kind: 'text',
                        text: t,
                        order: r.order || 0,
                        slot: r.slot || '',
                        color: r.color,
                        bgColor: r.bgColor,
                        bgEnabled: r.bgEnabled,
                        bgAlpha: r.bgAlpha
                      });
                    });

                  // 图片资源：解析出 imageData
                  const resolveImageData = async (res) => {
                    if (!res) return null;
                    if (res.imageData && typeof res.imageData === 'string') return res.imageData;
                    if (res.albumId && Storage && Storage.db && Storage.dbGet) {
                      try {
                        const pic = await Storage.dbGet('album', res.albumId);
                        return (pic && pic.data) || null;
                      } catch (e) {
                        console.error('[widget-profile-card] 解析图片失败:', e);
                      }
                    }
                    return null;
                  };

                  for (let i = 0; i < images.length; i++) {
                    const data = await resolveImageData(images[i]);
                    if (!data) continue;
                    resources.push({
                      widgetId: WIDGET_ID,
                      kind: 'image',
                      imageData: data,
                      order: images[i].order || i
                    });
                  }

                  // config：下半区背景板（模糊度/透明度）
                  if (profileCardLowerBlurEl || profileCardLowerAlphaEl || profileCardLowerTextColorEl) {
                    const blur = Math.max(0, Math.min(15, parseInt(profileCardLowerBlurEl?.value || '10', 10) || 0));
                    const alpha = Math.max(0, Math.min(100, parseInt(profileCardLowerAlphaEl?.value || '92', 10) || 0));
                    resources.push({
                      widgetId: WIDGET_ID,
                      kind: 'config',
                      key: 'profile-card-lower',
                      lowerBlur: blur,
                      lowerAlpha: alpha,
                      lowerTextColor: String(profileCardLowerTextColorEl?.value || '#111827')
                    });
                  }

                  // config：上半区四句（字体大小）
                  if (profileCardTopFontSizeEl) {
                    const size = Math.max(9, Math.min(18, parseInt(profileCardTopFontSizeEl.value || '11', 10) || 11));
                    resources.push({
                      widgetId: WIDGET_ID,
                      kind: 'config',
                      key: 'profile-card-top',
                      topFontSize: size
                    });
                  }

                  if (iframe.contentWindow && resources.length) {
                    iframe.contentWindow.postMessage(
                      { type: 'yd-widget-data', widgetId: WIDGET_ID, resources },
                      '*'
                    );
                  }
                } catch (e) {
                  console.error('[widget-profile-card] 发送预览数据失败:', e);
                }
              });
            } catch (e) {
              console.error('[widget-profile-card] 预览失败:', e);
              profileCardPreviewEl.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">预览失败</div>';
            }
          }
        } catch (e) {
          console.error('[widget-profile-card] 读取资源失败:', e);
        }
      };

      // 未保存时的实时预览：根据当前 UI 组装资源并发给 iframe
      const pushProfileCardPreview = () => {
        try {
          if (!_profileCardPreviewIframe || !_profileCardPreviewIframe.contentWindow) return;
          const resources = [];

          // 文案 textarea：title/tagline/rest
          const raw = String(profileCardTextEl.value || '');
          const lines = raw.split(/\r?\n/).map(s => String(s || '').trim());
          const title = (lines[0] || '').trim();
          const tagline = (lines[1] || '').trim();
          const rest = lines.slice(2).filter(Boolean);
          if (title) resources.push({ widgetId: WIDGET_ID, kind: 'text', text: title, order: 0 });
          if (tagline) resources.push({ widgetId: WIDGET_ID, kind: 'text', text: tagline, order: 1 });

          // 上半区四句：order 2-5
          for (let i = 0; i < 4; i++) {
            const ui = topEls[i];
            const textVal = String(ui?.text?.value || '').trim();
            if (!textVal) continue;
            const bgAlphaPct = Math.max(0, Math.min(100, parseInt(ui?.bgAlpha?.value || '78', 10) || 0));
            resources.push({
              widgetId: WIDGET_ID,
              kind: 'text',
              text: textVal,
              order: 2 + i,
              slot: 'top' + (i + 1),
              color: String(ui?.color?.value || '#111827'),
              bgColor: String(ui?.bg?.value || '#ffffff'),
              bgEnabled: !!ui?.bgEnabled?.checked,
              bgAlpha: bgAlphaPct
            });
          }

          // 下半区多行：order 从 6 开始
          rest.forEach((t, idx) => {
            resources.push({ widgetId: WIDGET_ID, kind: 'text', text: t, order: 6 + idx });
          });

          // 图片：使用缓存（背景/头像）
          (_profileCardImageCache || []).forEach((img) => resources.push(img));

          // config：下半区背景板（模糊度/透明度）
          {
            const blur = Math.max(0, Math.min(15, parseInt(profileCardLowerBlurEl?.value || '10', 10) || 0));
            const alpha = Math.max(0, Math.min(100, parseInt(profileCardLowerAlphaEl?.value || '92', 10) || 0));
            resources.push({
              widgetId: WIDGET_ID,
              kind: 'config',
              key: 'profile-card-lower',
              lowerBlur: blur,
              lowerAlpha: alpha,
              lowerTextColor: String(profileCardLowerTextColorEl?.value || '#111827')
            });
          }

          // config：上半区四句（字体大小）
          if (profileCardTopFontSizeEl) {
            const size = Math.max(9, Math.min(18, parseInt(profileCardTopFontSizeEl.value || '11', 10) || 11));
            resources.push({
              widgetId: WIDGET_ID,
              kind: 'config',
              key: 'profile-card-top',
              topFontSize: size
            });
          }

          _profileCardPreviewIframe.contentWindow.postMessage(
            { type: 'yd-widget-data', widgetId: WIDGET_ID, resources },
            '*'
          );
        } catch (e) {}
      };

      // 绑定 UI 变化到实时预览
      const bindPreviewOnChange = (el, evt) => {
        if (!el) return;
        el.addEventListener(evt || 'input', () => pushProfileCardPreview());
      };

      loadProfileCardResources();
      try {
        if (profileCardHideHomescreenEl && typeof Homescreen !== 'undefined' && Homescreen.getWidgetHideFromHomescreenMap) {
          profileCardHideHomescreenEl.checked = !!Homescreen.getWidgetHideFromHomescreenMap()['widget-profile-card'];
        }
      } catch (e) {}

      // 上半区四句：背景透明度标签实时回显 + 实时预览
      topEls.forEach((ui) => {
        if (ui && ui.bgAlpha && ui.bgAlphaLabel) {
          ui.bgAlpha.addEventListener('input', (e) => {
            const raw = parseInt(e.target.value || '0', 10);
            const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
            ui.bgAlphaLabel.textContent = `${pct}%`;
            pushProfileCardPreview();
          });
        }
      });

      // 绑定 UI 变化到实时预览
      if (profileCardTextEl) {
        profileCardTextEl.addEventListener('input', () => pushProfileCardPreview());
      }
      if (profileCardLowerBlurEl) {
        profileCardLowerBlurEl.addEventListener('input', (e) => {
          const raw = parseInt(e.target.value || '10', 10);
          const v = Math.max(0, Math.min(15, Number.isFinite(raw) ? raw : 10));
          if (profileCardLowerBlurLabelEl) profileCardLowerBlurLabelEl.textContent = String(v);
          pushProfileCardPreview();
        });
      }
      if (profileCardLowerAlphaEl) {
        profileCardLowerAlphaEl.addEventListener('input', (e) => {
          const raw = parseInt(e.target.value || '92', 10);
          const v = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 92));
          if (profileCardLowerAlphaLabelEl) profileCardLowerAlphaLabelEl.textContent = `${v}%`;
          pushProfileCardPreview();
        });
      }
      if (profileCardLowerTextColorEl) {
        profileCardLowerTextColorEl.addEventListener('input', () => pushProfileCardPreview());
      }
      if (profileCardTopFontSizeEl) {
        profileCardTopFontSizeEl.addEventListener('input', (e) => {
          const raw = parseInt(e.target.value || '11', 10);
          const v = Math.max(9, Math.min(18, Number.isFinite(raw) ? raw : 11));
          if (profileCardTopFontSizeLabelEl) profileCardTopFontSizeLabelEl.textContent = `${v}px`;
          pushProfileCardPreview();
        });
      }
      topEls.forEach((ui) => {
        if (ui?.text) ui.text.addEventListener('input', () => pushProfileCardPreview());
        if (ui?.color) ui.color.addEventListener('input', () => pushProfileCardPreview());
        if (ui?.bgEnabled) ui.bgEnabled.addEventListener('change', () => pushProfileCardPreview());
        if (ui?.bg) ui.bg.addEventListener('input', () => pushProfileCardPreview());
        if (ui?.bgAlpha) ui.bgAlpha.addEventListener('input', () => pushProfileCardPreview());
      });

      profileCardResetBtn.addEventListener('click', () => {
        (async () => {
          try {
            // 清空当前 widget 的文本与图片资源
            const all = await Storage.dbGetAll('widgetResources');
            const related = (all || []).filter(r => r && r.widgetId === WIDGET_ID);
            for (const r of related) {
              await Storage.dbDelete('widgetResources', r.id);
            }
            // 清空本页输入框
            profileCardTextEl.value = '';
            topEls.forEach((ui) => {
              if (ui.text) ui.text.value = '';
              if (ui.color) ui.color.value = '#111827';
              if (ui.bgEnabled) ui.bgEnabled.checked = true;
              if (ui.bg) ui.bg.value = '#ffffff';
              if (ui.bgAlpha) ui.bgAlpha.value = '78';
              if (ui.bgAlphaLabel) ui.bgAlphaLabel.textContent = '78%';
            });
            if (profileCardLowerBlurEl) profileCardLowerBlurEl.value = '10';
            if (profileCardLowerBlurLabelEl) profileCardLowerBlurLabelEl.textContent = '10';
            if (profileCardLowerAlphaEl) profileCardLowerAlphaEl.value = '92';
            if (profileCardLowerAlphaLabelEl) profileCardLowerAlphaLabelEl.textContent = '92%';
            if (profileCardLowerTextColorEl) profileCardLowerTextColorEl.value = '#111827';
            if (profileCardTopFontSizeEl) profileCardTopFontSizeEl.value = '11';
            if (profileCardTopFontSizeLabelEl) profileCardTopFontSizeLabelEl.textContent = '11px';

            // 刷新主屏与本页预览
            if (Homescreen && Homescreen.loadAndSyncWidgets) {
              Homescreen.loadAndSyncWidgets();
              Homescreen.renderHomescreen();
            }
            loadProfileCardResources();

            if (this.showToast) this.showToast('已重置头像卡片（未保存图片文件本身，仅清除引用）');
            this._profileCardDirty = true;
          } catch (e) {
            console.error('[widget-profile-card] 重置失败:', e);
            if (this.showToast) this.showToast('重置失败');
          }
        })();
      });

      // 图片上传：写入 album + widgetResources（背景图和头像）
      const handleImageUpload = (inputEl, previewEl, placeholderEl, slotIndex) => {
        if (!inputEl) return;
        inputEl.addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const data = reader.result;
              const albumItem = {
                id: State.generateId(),
                data,
                name: file.name || '头像卡片图片',
                createdAt: Date.now()
              };
              await Storage.dbAdd('album', albumItem);

              // 读取当前该 widget 的所有 image 资源
              const all = await Storage.dbGetAll('widgetResources');
              const images = (all || []).filter(r => r && r.widgetId === WIDGET_ID && r.kind === 'image');

              const ensureImageRec = async (idx) => {
                let rec = images[idx];
                if (rec) {
                  rec.albumId = albumItem.id;
                  rec.imageData = undefined;
                  await Storage.dbPut('widgetResources', rec);
                } else {
                  rec = {
                    id: State.generateId(),
                    widgetId: WIDGET_ID,
                    kind: 'image',
                    albumId: albumItem.id,
                    order: idx,
                    createdAt: Date.now()
                  };
                  await Storage.dbAdd('widgetResources', rec);
                }
              };

              await ensureImageRec(slotIndex);

              if (previewEl && placeholderEl) {
                previewEl.src = data;
                previewEl.style.display = 'block';
                placeholderEl.style.display = 'none';
              }

              // 更新本页实时预览缓存，并立刻推送到 iframe
              try {
                const order = slotIndex;
                _profileCardImageCache = (_profileCardImageCache || []).filter(x => !(x && x.kind === 'image' && Number(x.order) === Number(order)));
                _profileCardImageCache.push({ widgetId: WIDGET_ID, kind: 'image', imageData: data, order });
              } catch (e) {}
              try { pushProfileCardPreview(); } catch (e) {}

              if (Homescreen && Homescreen.loadAndSyncWidgets) {
                Homescreen.loadAndSyncWidgets();
                Homescreen.renderHomescreen();
              }

              if (this.showToast) this.showToast('图片已保存到头像卡片');
            } catch (err) {
              console.error('[widget-profile-card] 上传图片失败:', err);
              if (this.showToast) this.showToast('上传失败');
            } finally {
              e.target.value = '';
            }
          };
          reader.readAsDataURL(file);
        });
      };

      if (profileCardBgUploadBtn && profileCardBgInput) {
        profileCardBgUploadBtn.addEventListener('click', () => profileCardBgInput.click());
        handleImageUpload(profileCardBgInput, profileCardBgPreviewEl, profileCardBgPlaceholderEl, 0);
      }
      if (profileCardAvatarUploadBtn && profileCardAvatarInput) {
        profileCardAvatarUploadBtn.addEventListener('click', () => profileCardAvatarInput.click());
        handleImageUpload(profileCardAvatarInput, profileCardAvatarPreviewEl, profileCardAvatarPlaceholderEl, 1);
      }

      profileCardSaveBtn.addEventListener('click', async () => {
        try {
          const raw = String(profileCardTextEl.value || '');
          const lines = raw.split(/\r?\n/);

          const all = await Storage.dbGetAll('widgetResources');
          const existing = (all || []).filter(r => r && r.widgetId === WIDGET_ID && r.kind === 'text');
          for (const r of existing) {
            await Storage.dbDelete('widgetResources', r.id);
          }
          const existingConfig = (all || []).filter(r => r && r.widgetId === WIDGET_ID && r.kind === 'config' && r.key === 'profile-card-lower');
          for (const r of existingConfig) {
            await Storage.dbDelete('widgetResources', r.id);
          }
          const existingTopConfig = (all || []).filter(r => r && r.widgetId === WIDGET_ID && r.kind === 'config' && r.key === 'profile-card-top');
          for (const r of existingTopConfig) {
            await Storage.dbDelete('widgetResources', r.id);
          }

          const now = Date.now();
          const title = (lines[0] || '').trim();
          const tagline = (lines[1] || '').trim();
          const rest = lines.slice(2).map(x => String(x || '').trim()).filter(Boolean);

          const toAdd = [];
          if (title) {
            toAdd.push({ order: 0, text: title });
          }
          if (tagline) {
            toAdd.push({ order: 1, text: tagline });
          }

          // 顶部四句（order 2-5）
          for (let i = 0; i < 4; i++) {
            const ui = topEls[i];
            const textVal = String(ui?.text?.value || '').trim();
            if (!textVal) continue;
            toAdd.push({
              order: 2 + i,
              text: textVal,
              slot: 'top' + (i + 1),
              color: String(ui?.color?.value || '#111827'),
              bgColor: String(ui?.bg?.value || '#ffffff'),
              bgEnabled: !!ui?.bgEnabled?.checked,
              bgAlpha: Math.max(0, Math.min(100, parseInt(ui?.bgAlpha?.value || '78', 10) || 0))
            });
          }

          // 下半区文案（order 从 6 开始）
          rest.forEach((t, idx) => {
            toAdd.push({ order: 6 + idx, text: t });
          });

          for (let i = 0; i < toAdd.length; i++) {
            const it = toAdd[i];
            const rec = {
              id: State.generateId(),
              widgetId: WIDGET_ID,
              kind: 'text',
              text: it.text,
              order: it.order,
              slot: it.slot || '',
              color: it.color,
              bgColor: it.bgColor,
              bgEnabled: it.bgEnabled,
              bgAlpha: it.bgAlpha,
              createdAt: now + i
            };
            Storage.dbAdd('widgetResources', rec);
          }

          // 保存 config：下半区背景板（模糊度/透明度）
          try {
            const blur = Math.max(0, Math.min(15, parseInt(profileCardLowerBlurEl?.value || '10', 10) || 0));
            const alpha = Math.max(0, Math.min(100, parseInt(profileCardLowerAlphaEl?.value || '92', 10) || 0));
            await Storage.dbAdd('widgetResources', {
              id: State.generateId(),
              widgetId: WIDGET_ID,
              kind: 'config',
              key: 'profile-card-lower',
              lowerBlur: blur,
              lowerAlpha: alpha,
              lowerTextColor: String(profileCardLowerTextColorEl?.value || '#111827'),
              createdAt: now + 999
            });
          } catch (e) {}

          // 保存 config：上半区四句（字体大小）
          try {
            const size = Math.max(9, Math.min(18, parseInt(profileCardTopFontSizeEl?.value || '11', 10) || 11));
            await Storage.dbAdd('widgetResources', {
              id: State.generateId(),
              widgetId: WIDGET_ID,
              kind: 'config',
              key: 'profile-card-top',
              topFontSize: size,
              createdAt: now + 1000
            });
          } catch (e) {}

          try {
            if (typeof Homescreen !== 'undefined' && Homescreen.setWidgetHideFromHomescreen) {
              Homescreen.setWidgetHideFromHomescreen('widget-profile-card', !!(profileCardHideHomescreenEl && profileCardHideHomescreenEl.checked));
            }
          } catch (e) {}

          if (Homescreen && Homescreen.loadAndSyncWidgets) {
            Homescreen.loadAndSyncWidgets();
            Homescreen.renderHomescreen();
          }

          if (this.showToast) this.showToast('已保存并应用到头像卡片');

          // 保存后刷新编辑页预览，确保与当前样式保持一致
          loadProfileCardResources();
          this._profileCardDirty = false;
        } catch (e) {
          console.error('[widget-profile-card] 保存文案失败:', e);
          if (this.showToast) this.showToast('保存失败：' + (e.message || '未知错误'));
        }
      });

      profileCardBackBtn.addEventListener('click', () => {
        if (this._profileCardDirty) {
          const ok = confirm('当前修改尚未保存，确定要退出吗？');
          if (!ok) return;
        }
        State.switchPage('page-widgets');
      });
    }

    // 新增组件页面：实时预览
    const newWidgetPreview = document.getElementById('new-widget-preview');
    const newWidgetHtmlEl = document.getElementById('new-widget-html');
    if (newWidgetPreview && newWidgetHtmlEl) {
      const updatePreview = () => {
        const html = newWidgetHtmlEl.value.trim();
        if (html) {
          try {
            const iframe = document.createElement('iframe');
            iframe.className = 'yd-new-widget-preview-iframe';
            iframe.setAttribute('sandbox', 'allow-scripts');
            iframe.srcdoc = html;
            newWidgetPreview.innerHTML = '';
            newWidgetPreview.appendChild(iframe);
          } catch (e) {
            console.error('预览失败:', e);
            newWidgetPreview.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">预览失败</div>';
          }
        } else {
          newWidgetPreview.innerHTML = '<div style="padding:20px;text-align:center;color:#8E8E93;">输入 HTML 后显示预览</div>';
        }
      };
      newWidgetHtmlEl.addEventListener('input', updatePreview);
      updatePreview();

      // 若从组件列表页带入了预设尺寸，则预填宽高
      const wEl = document.getElementById('new-widget-w');
      const hEl = document.getElementById('new-widget-h');
      if (this._pendingNewWidgetSize && wEl && hEl) {
        const size = this._pendingNewWidgetSize;
        wEl.value = String(size.w || 2);
        hEl.value = String(size.h || 2);
        if (this.showToast && size.label) {
          this.showToast(`已选择 ${size.label} 尺寸`);
        }
        this._pendingNewWidgetSize = null;
      }
    }

    // 新增组件页面：添加按钮（仅保存HTML，不放置）
    const newWidgetAddBtn = document.getElementById('new-widget-add-btn');
    if (newWidgetAddBtn) {
      newWidgetAddBtn.addEventListener('click', () => {
        const nameEl = document.getElementById('new-widget-name');
        const idEl = document.getElementById('new-widget-id');
        const htmlEl = document.getElementById('new-widget-html');
        const wEl = document.getElementById('new-widget-w');
        const hEl = document.getElementById('new-widget-h');
        
        if (!nameEl || !idEl || !htmlEl || !wEl || !hEl) return;
        
        const name = nameEl.value.trim();
        const id = idEl.value.trim();
        const html = htmlEl.value.trim();
        const w = parseInt(wEl.value || '2', 10);
        const h = parseInt(hEl.value || '2', 10);
        
        if (!id || !/^widget-[a-zA-Z0-9_-]+$/.test(id)) {
          alert('组件 ID 不能为空，且须以 widget- 开头（例如：widget-weather）');
          return;
        }
        if (!html) {
          alert('请填写组件 HTML');
          return;
        }
        if (w < 1 || w > 4 || h < 1 || h > 6) {
          alert('组件尺寸必须在 1×1 到 4×6 之间');
          return;
        }
        
        try {
          // 保存组件 HTML
          const htmlMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HTML) || {};
          htmlMap[id] = html;
          Storage.set(CONFIG.STORAGE_KEYS.WIDGET_HTML, htmlMap);

          // 保存组件布局（不设置位置，仅保存尺寸和名称）
          const layoutMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT) || {};
          layoutMap[id] = {
            ...(layoutMap[id] || {}),
            label: name || id,
            w,
            h
          };
          Storage.set(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT, layoutMap);

          alert('组件已添加，可以在美化设置中选择并放置');
        } catch (e) {
          console.error('添加组件失败:', e);
          alert('添加组件失败');
        }
      });
    }

    // 新增组件页面：保存按钮（保存并放置到选中位置）
    const newWidgetSaveBtn = document.getElementById('new-widget-save-btn');
    if (newWidgetSaveBtn) {
      newWidgetSaveBtn.addEventListener('click', () => {
        const nameEl = document.getElementById('new-widget-name');
        const idEl = document.getElementById('new-widget-id');
        const htmlEl = document.getElementById('new-widget-html');
        const wEl = document.getElementById('new-widget-w');
        const hEl = document.getElementById('new-widget-h');
        
        if (!nameEl || !idEl || !htmlEl || !wEl || !hEl) return;
        
        const name = nameEl.value.trim();
        const id = idEl.value.trim();
        const html = htmlEl.value.trim();
        const w = parseInt(wEl.value || '2', 10);
        const h = parseInt(hEl.value || '2', 10);
        
        if (!id || !/^widget-[a-zA-Z0-9_-]+$/.test(id)) {
          alert('组件 ID 不能为空，且须以 widget- 开头（例如：widget-weather）');
          return;
        }
        if (!html) {
          alert('请填写组件 HTML');
          return;
        }
        if (w < 1 || w > 4 || h < 1 || h > 6) {
          alert('组件尺寸必须在 1×1 到 4×6 之间');
          return;
        }
        
        // 获取选中的空白格（从保存的状态中获取）
        // 获取选中的空白格（从保存的状态中获取，作为起始位置）
        const pendingCell = this._pendingEmptyCell;
        if (!pendingCell) {
          alert('请先返回美化设置页面，选择一个空白格作为组件放置的起始位置');
          return;
        }
        
        const startRow = pendingCell.row;
        const startCol = pendingCell.col;
        const page = pendingCell.page;
        const cols = CONFIG.GRID_COLS || 4;
        const rows = 6;
        
        // 计算所需区域
        const endRow = startRow + h - 1;
        const endCol = startCol + w - 1;
        
        // 验证是否超出边界
        if (endRow >= rows || endCol >= cols) {
          alert(`组件尺寸为 ${w}×${h}，从位置 (${startRow + 1}, ${startCol + 1}) 开始会超出网格范围。请返回美化设置页面选择其他位置。`);
          return;
        }
        
        // 验证该区域是否被占用
        const tiles = Homescreen.buildTiles(rows);
        const layout = Homescreen.computeLayout(tiles, cols, rows);
        const placements = (layout && layout.placements) ? layout.placements.filter(p => p.page === page) : [];
        
        // 检查该区域是否与已有组件/图标重叠
        for (const p of placements) {
          const pEndRow = p.row + p.h - 1;
          const pEndCol = p.col + p.w - 1;
          
          // 检查是否有重叠
          if (!(endRow < p.row || startRow > pEndRow || endCol < p.col || startCol > pEndCol)) {
            alert(`该位置已被占用。组件 "${p.kind === 'widget' ? (p.id || '组件') : (p.icon?.label || '图标')}" 占据了该区域。请返回美化设置页面选择其他位置。`);
            return;
          }
        }
        
        try {
          // 保存组件 HTML
          const htmlMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HTML) || {};
          htmlMap[id] = html;
          Storage.set(CONFIG.STORAGE_KEYS.WIDGET_HTML, htmlMap);

          // 保存组件布局
          const layoutMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT) || {};
            layoutMap[id] = {
            ...(layoutMap[id] || {}),
            label: name || id,
            w,
            h,
            page,
            row: startRow,
            col: startCol
          };
          Storage.set(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT, layoutMap);

          // 清空待放置位置
          this._pendingEmptyCell = null;

          // 更新主屏
          if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen) {
            Homescreen.renderHomescreen();
          }

          // 返回美化设置页面并刷新
          State.switchPage('page-settings-beautify');
          this.initBeautifySettings();
          alert('新组件已创建并放置');
        } catch (e) {
          console.error('创建新组件失败:', e);
          alert('创建组件失败');
        }
      });
    }
  },

  async _syncDecorProfileHeader() {
    try {
      const profileRowEl = document.getElementById('settings-profile');
      const avatarEl = document.getElementById('settings-profile-avatar');
      const titleEl = profileRowEl ? profileRowEl.querySelector('.yd-settings-row__title') : null;
      const subtitleEl = profileRowEl ? profileRowEl.querySelector('.yd-settings-row__subtitle') : null;
      if (!profileRowEl || !avatarEl || !titleEl || !subtitleEl) return;

      const DEFAULT_NAME = 'SC 用户';
      const DEFAULT_REMARK = '本地数据 · 手动备份迁移';
      const DEFAULT_AVATAR_LETTER = '云';

      const name = String(Storage.get('yd_decor_profile_name') || '').trim();
      const remark = String(Storage.get('yd_decor_profile_remark') || '').trim();
      const avatar = String(Storage.get('yd_decor_profile_avatar') || '').trim();

      const safeName = name || DEFAULT_NAME;
      const safeRemark = remark || DEFAULT_REMARK;
      titleEl.textContent = safeName;
      subtitleEl.textContent = safeRemark;

      avatarEl.textContent = '';
      avatarEl.innerHTML = '';

      if (avatar) {
        avatarEl.style.background = 'none';
        avatarEl.style.color = 'transparent';
        avatarEl.style.overflow = 'hidden';

        const img = document.createElement('img');
        img.src = avatar;
        img.alt = safeName;
        avatarEl.appendChild(img);
      } else {
        avatarEl.style.background = '';
        avatarEl.style.color = '#fff';
        const letter = safeName ? safeName.slice(0, 1) : DEFAULT_AVATAR_LETTER;
        avatarEl.textContent = letter;
      }
    } catch (e) {}
  },

  _readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      if (!file) return resolve('');
      if (!String(file.type || '').match(/^image\/(png|jpeg|jpg|webp)$/i)) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  },

  async _openDecorProfileEditor() {
    try {
      const existing = document.getElementById('yd-decor-profile-modal');
      if (existing) existing.remove();

      const DEFAULT_NAME = 'SC 用户';
      const DEFAULT_REMARK = '本地数据 · 手动备份迁移';

      const name0 = String(Storage.get('yd_decor_profile_name') || '').trim() || DEFAULT_NAME;
      const remark0 = String(Storage.get('yd_decor_profile_remark') || '').trim() || DEFAULT_REMARK;
      const avatar0 = String(Storage.get('yd_decor_profile_avatar') || '').trim();

      const esc = (str) => String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      const letter = (name0 || DEFAULT_NAME || '云').slice(0, 1) || '云';

      const overlay = document.createElement('div');
      overlay.id = 'yd-decor-profile-modal';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(0,0,0,0.45)';
      overlay.style.zIndex = '1400';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      overlay.innerHTML = `
        <div style="width:min(92vw,420px);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #eee;">
            <div style="font-size:15px;font-weight:900;color:#111;">编辑装饰卡片</div>
            <button type="button" id="yd-decor-profile-x" style="border:none;background:transparent;width:32px;height:32px;border-radius:10px;font-size:22px;line-height:1;color:#666;cursor:pointer;">×</button>
          </div>

          <div style="padding:14px 14px 16px;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="width:56px;height:56px;border-radius:999px;overflow:hidden;background:linear-gradient(135deg,#a8c5e6 0%,#b8d4f1 100%);display:flex;align-items:center;justify-content:center;flex:0 0 auto;position:relative;" id="yd-decor-profile-avatar-preview">
                ${avatar0 ? `<img src="${avatar0}" alt="头像" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;">` : `<span style="color:#fff;font-weight:800;font-size:20px;">${letter}</span>`}
              </div>
              <div style="flex:1;min-width:0;">
                <input type="file" id="yd-decor-profile-avatar-input" accept="image/png,image/jpeg,image/webp" style="width:100%;">
                <div style="font-size:12px;color:#8E8E93;margin-top:6px;">仅用于装饰显示</div>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:10px;">
              <div>
                <div style="font-size:13px;font-weight:700;color:#111;margin-bottom:6px;">名称</div>
                <input type="text" id="yd-decor-profile-name" value="${esc(name0)}" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;">
              </div>
              <div>
                <div style="font-size:13px;font-weight:700;color:#111;margin-bottom:6px;">备注（显示在第二行）</div>
                <textarea id="yd-decor-profile-remark" rows="3" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;resize:none;">${esc(remark0)}</textarea>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:10px;padding:12px 14px;border-top:1px solid #eee;">
            <button type="button" id="yd-decor-profile-cancel" style="flex:1;padding:10px 0;border-radius:12px;border:1px solid #e5e7eb;background:#fff;color:#111;font-weight:700;cursor:pointer;">取消</button>
            <button type="button" id="yd-decor-profile-save" style="flex:1;padding:10px 0;border-radius:12px;border:none;background:#111827;color:#fff;font-weight:800;cursor:pointer;">保存</button>
          </div>
        </div>
      `;
      const xBtn = overlay.querySelector('#yd-decor-profile-x');
      const cancelBtn = overlay.querySelector('#yd-decor-profile-cancel');
      const saveBtn = overlay.querySelector('#yd-decor-profile-save');
      const nameEl = overlay.querySelector('#yd-decor-profile-name');
      const remarkEl = overlay.querySelector('#yd-decor-profile-remark');
      const fileEl = overlay.querySelector('#yd-decor-profile-avatar-input');
      const previewEl = overlay.querySelector('#yd-decor-profile-avatar-preview');

      let avatarPending = avatar0;
      const setPreview = (dataUrl) => {
        avatarPending = dataUrl || '';
        if (!previewEl) return;
        previewEl.innerHTML = '';
        if (avatarPending) {
          const img = document.createElement('img');
          img.src = avatarPending;
          img.alt = '头像';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.display = 'block';
          img.style.borderRadius = '50%';
          previewEl.appendChild(img);
        }
      };

      // close
      const close = () => { try { overlay.remove(); } catch (e) {} };
      xBtn?.addEventListener('click', close);
      cancelBtn?.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      fileEl?.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        const dataUrl = await this._readFileAsDataUrl(f);
        setPreview(dataUrl);
      });

      saveBtn?.addEventListener('click', async () => {
        const name = String(nameEl?.value || '').trim() || DEFAULT_NAME;
        const remark = String(remarkEl?.value || '').trim() || DEFAULT_REMARK;
        Storage.set('yd_decor_profile_name', name);
        Storage.set('yd_decor_profile_remark', remark);
        Storage.set('yd_decor_profile_avatar', String(avatarPending || '').trim());
        close();
        await this._syncDecorProfileHeader();
        this.showToast?.('已保存');
      });

      document.body.appendChild(overlay);
    } catch (e) {
      console.error('openDecorProfileEditor failed:', e);
    }
  },

  loadSettings() {
    const apiKey = Storage.get(CONFIG.STORAGE_KEYS.API_KEY) || '';
    const baseUrl = Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || '';
    const model = Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || '';
    const chatRounds = Storage.get(CONFIG.STORAGE_KEYS.CHAT_ROUNDS);
    const chatRoundsVal = (chatRounds != null && chatRounds !== '') ? String(chatRounds) : this._defaultChatRoundsStr();
    const apiMaxTokensRaw = Storage.get(CONFIG.STORAGE_KEYS.API_MAX_TOKENS);
    const apiMaxTokensVal = (apiMaxTokensRaw != null && apiMaxTokensRaw !== '')
      ? String(apiMaxTokensRaw)
      : String((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited');
    const apiTemperatureRaw = Storage.get(CONFIG.STORAGE_KEYS.API_TEMPERATURE);
    const apiTemperatureVal = this._normalizeApiTemperature(
      apiTemperatureRaw != null && apiTemperatureRaw !== ''
        ? String(apiTemperatureRaw)
        : String((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)
    );

    const apiKeyEl = document.getElementById('api-key');
    const baseUrlEl = document.getElementById('base-url');
    const modelEl = document.getElementById('api-model');
    const chatRoundsEl = document.getElementById('chat-rounds');
    const chatRoundsDisplay = document.getElementById('chat-rounds-display');
    const apiMaxTokensEl = document.getElementById('api-max-tokens');
    const apiMaxTokensDisplay = document.getElementById('api-max-tokens-display');
    const apiTemperatureEl = document.getElementById('api-temperature');
    const apiTemperatureDisplay = document.getElementById('api-temperature-display');
    const baseUrlDisplay = document.getElementById('base-url-display');
    const apiKeyDisplay = document.getElementById('api-key-display');
    if (baseUrlEl) baseUrlEl.value = baseUrl;
    if (apiKeyEl) apiKeyEl.value = apiKey;
    if (chatRoundsEl) chatRoundsEl.value = chatRoundsVal;
    if (chatRoundsDisplay) chatRoundsDisplay.textContent = chatRoundsVal;
    if (apiMaxTokensEl) apiMaxTokensEl.value = apiMaxTokensVal;
    if (apiMaxTokensDisplay) apiMaxTokensDisplay.textContent = this._formatApiMaxTokensDisplay(apiMaxTokensVal);
    if (apiTemperatureEl) apiTemperatureEl.value = apiTemperatureVal;
    if (apiTemperatureDisplay) apiTemperatureDisplay.textContent = apiTemperatureVal;
    if (baseUrlDisplay) baseUrlDisplay.textContent = baseUrl ? baseUrl.trim() : '未设置';
    if (apiKeyDisplay) apiKeyDisplay.textContent = apiKey || '未设置';
    if (modelEl) {
      // 不设默认值：仅当本地已保存模型时才回显
      if (model) {
        if (!modelEl.querySelector(`option[value="${model}"]`)) {
          const opt = document.createElement('option');
          opt.value = model;
          opt.textContent = model;
          modelEl.appendChild(opt);
        }
        modelEl.value = model;
      } else {
        modelEl.value = '';
      }
    }
    const apiAutoVisionEl = document.getElementById('api-auto-vision');
    if (apiAutoVisionEl) {
      const k =
        CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CHAT_AUTO_VISION
          ? CONFIG.STORAGE_KEYS.CHAT_AUTO_VISION
          : 'chat_auto_vision';
      const defRaw =
        CONFIG && CONFIG.DEFAULT_CHAT_AUTO_VISION != null ? CONFIG.DEFAULT_CHAT_AUTO_VISION : 'on';
      const rawAv = Storage.get(k);
      const mode = String(rawAv != null && rawAv !== '' ? rawAv : defRaw)
        .trim()
        .toLowerCase();
      apiAutoVisionEl.checked = mode !== 'off' && mode !== '0' && mode !== 'false';
    }
    const apiStreamEl = document.getElementById('api-stream');
    if (apiStreamEl) {
      const k =
        CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_STREAM
          ? CONFIG.STORAGE_KEYS.API_STREAM
          : 'api_stream';
      const defRaw =
        CONFIG && CONFIG.DEFAULT_API_STREAM != null ? CONFIG.DEFAULT_API_STREAM : 'off';
      const rawStream = Storage.get(k);
      const streamMode = String(rawStream != null && rawStream !== '' ? rawStream : defRaw)
        .trim()
        .toLowerCase();
      apiStreamEl.checked = streamMode === 'on' || streamMode === '1' || streamMode === 'true';
    }
    this.loadApiConfigPresets();

    // ===== 语音设置回显（MiniMax T2A） =====
    try {
      const keyEl = document.getElementById('voice-api-key');
      const modelSel = document.getElementById('voice-model');
      const voiceSel = document.getElementById('voice-id-select');
      const moodToggleEl = document.getElementById('voice-mood-tags-enabled');
      const textEl = document.getElementById('voice-test-text');

      const savedKey = Storage.get(CONFIG.STORAGE_KEYS.VOICE_API_KEY) || '';
      const savedModel = Storage.get(CONFIG.STORAGE_KEYS.VOICE_MODEL) || 'speech-2.8-hd';
      const savedVoiceId = Storage.get(CONFIG.STORAGE_KEYS.VOICE_ID) || '';
      const savedMoodEnabled = String(
        Storage.get((CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_MOOD_TAGS_ENABLED) || 'voice_mood_tags_enabled') || '0'
      ).trim() === '1';

      if (keyEl) keyEl.value = savedKey;
      if (modelSel) modelSel.value = savedModel;
      if (voiceSel) voiceSel.value = savedVoiceId;
      if (moodToggleEl) moodToggleEl.checked = savedMoodEnabled;
      this._renderVoiceDisplay(savedVoiceId);
      if (textEl && !String(textEl.value || '').trim()) {
        textEl.value = '今天是不是很开心呀(laughs)，当然了！';
      }
    } catch (e) {}

    // 同步“SC 用户”装饰卡片栏
    try { void this._syncDecorProfileHeader(); } catch (e) {}
    this._syncNotifyModeDisplay();

    // 回收站 UI（非阻塞）
    try { void this._renderRecycleBinUi(); } catch (e) {}
  },

  // 回收站弹窗：展示备份列表，每条可单独恢复，并支持清空
  async _openRecycleBinRestorePicker() {
    let items = [];
    try {
      if (typeof Storage.recycleBinList === 'function') {
        items = await Storage.recycleBinList();
      }
    } catch (e) {}

    const overlayId = 'yd-recycle-bin-restore-modal';
    const existed = document.getElementById(overlayId);
    if (existed) {
      try { existed.remove(); } catch (e) {}
    }

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="恢复数据" style="max-width:560px;">
        <div class="yd-modal-header">
          <div style="font-size:16px;font-weight:700;">回收站</div>
          <button type="button" class="yd-btn-close" id="yd-recycle-bin-restore-close" aria-label="关闭">×</button>
        </div>
        <div style="color:#8E8E93;font-size:13px;margin-top:-6px;margin-bottom:14px;">
          七天冷静期内可恢复，过期会自动清理。
        </div>
        <div id="yd-recycle-bin-restore-list" style="display:flex;flex-direction:column;gap:10px;"></div>
        <div style="margin-top:16px;display:flex;justify-content:flex-end;">
          <button type="button" class="yd-btn yd-btn--secondary" id="yd-recycle-bin-restore-clear" style="min-width:120px;">清空回收站</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch (e) {}
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#yd-recycle-bin-restore-close')?.addEventListener('click', close);

    const listEl = overlay.querySelector('#yd-recycle-bin-restore-list');
    const kindLabel = (k) => {
      const kind = String(k || '').trim();
      if (kind === 'clear_session') return '清理聊天记录';
      if (kind === 'clear_session_with_memory') return '清理聊天记录与记忆';
      if (kind === 'delete_session') return '删除会话';
      return '删除操作';
    };

    const renderItems = (rows) => {
      const now = Date.now();
      if (!Array.isArray(rows) || rows.length === 0) {
        listEl.innerHTML = `
          <div style="padding:14px 12px;border:1px solid #E5E5EA;border-radius:12px;color:#8E8E93;font-size:13px;">
            回收站为空
          </div>
        `;
        return;
      }

      listEl.innerHTML = rows.map((it, idx) => {
        const sid = String(it?.sessionId || '');
        const msgCount = Array.isArray(it?.messagesSnapshot) ? it.messagesSnapshot.length : 0;
        const deleteAt = Number(it?.deleteAt || 0);
        const remainMs = deleteAt > 0 ? Math.max(0, deleteAt - now) : 0;
        const remainDays = Math.floor(remainMs / (24 * 60 * 60 * 1000));
        const remainHours = Math.floor((remainMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const remainMin = Math.floor((remainMs % (60 * 60 * 1000)) / (60 * 1000));
        const remainText = deleteAt > 0
          ? (remainDays > 0 ? `剩余 ${remainDays} 天` : (remainHours > 0 ? `剩余 ${remainHours} 小时` : `剩余 ${remainMin} 分钟`))
          : '—';
        return `
          <div class="yd-recycle-bin-restore-entry">
            <div class="yd-recycle-bin-restore-entry__main">
              <div class="yd-recycle-bin-restore-entry__title">
                ${kindLabel(it?.kind)}
                ${sid ? `<span class="yd-recycle-bin-restore-entry__sid">${sid}</span>` : ''}
              </div>
              <div class="yd-recycle-bin-restore-entry__meta">
                ${remainText} · 将于 ${deleteAt > 0 ? new Date(deleteAt).toLocaleString() : '—'} 清理 · 消息数：${msgCount}
              </div>
            </div>
            <button
              type="button"
              class="yd-btn yd-recycle-bin-restore-action"
              data-idx="${idx}"
              style="">
              恢复
            </button>
          </div>
        `;
      }).join('');
    };

    renderItems(items);

    listEl.addEventListener('click', async (e) => {
      const t = e?.target;
      const btn = t && t.closest ? t.closest('button.yd-recycle-bin-restore-action') : null;
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-idx') || '-1');
      if (!Number.isFinite(idx) || idx < 0) return;
      const picked = items[idx];
      if (!picked) return;
      btn.disabled = true;
      const prevText = btn.textContent;
      btn.textContent = '恢复中...';
      try {
        const ok = await Storage.recycleBinRestoreItem(picked);
        if (!ok) {
          this.showToast?.('恢复失败', 1600);
          return;
        }
        this.showToast?.('恢复成功', 1600);
        items.splice(idx, 1);
        renderItems(items);
        try { await this._renderRecycleBinUi(); } catch (_) {}
        try {
          if (typeof Chat !== 'undefined' && Chat && typeof Chat.loadSessions === 'function') {
            await Chat.loadSessions();
          }
        } catch (e2) {}
      } catch (err) {
        console.error('[recycle-bin] 恢复失败:', err);
        this.showToast?.('恢复失败', 1600);
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });

    overlay.querySelector('#yd-recycle-bin-restore-clear')?.addEventListener('click', async () => {
      if (!Array.isArray(items) || items.length === 0) {
        this.showToast?.('回收站为空', 1600);
        return;
      }
      const ok = confirm('确定清空回收站吗？这将删除所有七天冷静期备份。');
      if (!ok) return;
      try {
        const removed = await Storage.recycleBinClearAll();
        this.showToast?.(`已清空回收站（${removed}）`, 1400);
        items = [];
        renderItems(items);
        try { await this._renderRecycleBinUi(); } catch (_) {}
      } catch (err) {
        console.error('[recycle-bin] 清空失败:', err);
        this.showToast?.('清空回收站失败', 1600);
      }
    });
  },

  async _renderRecycleBinUi() {
    const listEl = document.getElementById('yd-recycle-bin-list');
    const metaEl = document.getElementById('yd-recycle-bin-meta');
    if (!listEl) return;

    try {
      if (typeof Storage.recycleBinPruneExpired === 'function') {
        await Storage.recycleBinPruneExpired();
      }
    } catch (e) {}

    let items = [];
    try {
      if (typeof Storage.recycleBinList === 'function') {
        items = await Storage.recycleBinList();
      }
    } catch (e) {}

    const now = Date.now();
    if (!Array.isArray(items) || items.length === 0) {
      if (metaEl) metaEl.textContent = '暂无备份';
      listEl.innerHTML = '';
      return;
    }

    const nextDeleteAt = items.reduce((min, it) => {
      const v = Number(it?.deleteAt || 0);
      return v > 0 && v < min ? v : min;
    }, Number.POSITIVE_INFINITY);
    if (metaEl) {
      const nextText = Number.isFinite(nextDeleteAt) && nextDeleteAt !== Infinity
        ? new Date(nextDeleteAt).toLocaleString()
        : '—';
      metaEl.textContent = `共有 ${items.length} 条备份，最早到期：${nextText}`;
    }
    // 设置页只展示摘要信息，具体条目在点击“回收站”后的弹窗中查看
    listEl.innerHTML = '';
  },

  _getApiConfigStoreKeys() {
    return {
      presets: (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_CONFIG_PRESETS) || 'api_config_presets',
      current: (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CURRENT_API_CONFIG) || 'current_api_config',
      defaultConfig: (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_DEFAULT_CONFIG) || 'api_default_config'
    };
  },

  _collectApiDraftFromForm() {
    const apiKeyEl = document.getElementById('api-key');
    const baseUrlEl = document.getElementById('base-url');
    const modelEl = document.getElementById('api-model');
    const chatRoundsEl = document.getElementById('chat-rounds');
    const apiMaxTokensEl = document.getElementById('api-max-tokens');
    const apiTemperatureEl = document.getElementById('api-temperature');
    return {
      apiKey: String(apiKeyEl ? apiKeyEl.value : (Storage.get(CONFIG.STORAGE_KEYS.API_KEY) || '')).trim(),
      baseUrl: String(baseUrlEl ? baseUrlEl.value : (Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || '')).trim(),
      model: String(modelEl ? modelEl.value : (Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || '')).trim(),
      chatRounds: String(chatRoundsEl ? chatRoundsEl.value : (Storage.get(CONFIG.STORAGE_KEYS.CHAT_ROUNDS) || this._defaultChatRoundsStr())).trim() || this._defaultChatRoundsStr(),
      apiMaxTokens: String(
        apiMaxTokensEl
          ? apiMaxTokensEl.value
          : (Storage.get(CONFIG.STORAGE_KEYS.API_MAX_TOKENS) || (CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited')
      ).trim() || String((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited'),
      apiTemperature: this._normalizeApiTemperature(
        String(
          apiTemperatureEl
            ? apiTemperatureEl.value
            : (Storage.get(CONFIG.STORAGE_KEYS.API_TEMPERATURE) || (CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || '0.8')
        ).trim() || String((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)
      )
    };
  },

  _markApiConfigDirty() {
    this._apiConfigDirty = true;
  },

  _normalizeApiDraft(draft) {
    const d = draft && typeof draft === 'object' ? draft : {};
    return {
      apiKey: String(d.apiKey || '').trim(),
      baseUrl: String(d.baseUrl || '').trim(),
      model: String(d.model || '').trim(),
      chatRounds: String(d.chatRounds || this._defaultChatRoundsStr()).trim() || this._defaultChatRoundsStr(),
      apiMaxTokens: String(d.apiMaxTokens || ((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited')).trim() || String((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited'),
      apiTemperature: this._normalizeApiTemperature(
        String(d.apiTemperature || ((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)).trim() || String((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)
      )
    };
  },

  _isApiDraftChanged(a, b) {
    const left = this._normalizeApiDraft(a);
    const right = this._normalizeApiDraft(b);
    return (
      left.apiKey !== right.apiKey ||
      left.baseUrl !== right.baseUrl ||
      left.model !== right.model ||
      left.chatRounds !== right.chatRounds ||
      left.apiMaxTokens !== right.apiMaxTokens ||
      left.apiTemperature !== right.apiTemperature
    );
  },

  _applyApiDraftToForm(draft) {
    const next = draft && typeof draft === 'object' ? draft : {};
    const baseUrl = String(next.baseUrl || '').trim();
    const apiKey = String(next.apiKey || '').trim();
    const model = String(next.model || '').trim();
    let chatRounds = String(next.chatRounds || this._defaultChatRoundsStr()).trim();
    if (!chatRounds) chatRounds = this._defaultChatRoundsStr();
    let apiMaxTokens = String(next.apiMaxTokens || ((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited')).trim();
    if (!apiMaxTokens) apiMaxTokens = String((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited');
    const apiTemperature = this._normalizeApiTemperature(
      String(next.apiTemperature || ((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)).trim() || String((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)
    );

    const apiKeyEl = document.getElementById('api-key');
    const baseUrlEl = document.getElementById('base-url');
    const modelEl = document.getElementById('api-model');
    const chatRoundsEl = document.getElementById('chat-rounds');
    const chatRoundsDisplay = document.getElementById('chat-rounds-display');
    const apiMaxTokensEl = document.getElementById('api-max-tokens');
    const apiMaxTokensDisplay = document.getElementById('api-max-tokens-display');
    const apiTemperatureEl = document.getElementById('api-temperature');
    const apiTemperatureDisplay = document.getElementById('api-temperature-display');
    const baseUrlDisplay = document.getElementById('base-url-display');
    const apiKeyDisplay = document.getElementById('api-key-display');
    if (baseUrlEl) baseUrlEl.value = baseUrl;
    if (apiKeyEl) apiKeyEl.value = apiKey;
    if (chatRoundsEl) chatRoundsEl.value = chatRounds;
    if (chatRoundsDisplay) chatRoundsDisplay.textContent = chatRounds;
    if (apiMaxTokensEl) apiMaxTokensEl.value = apiMaxTokens;
    if (apiMaxTokensDisplay) apiMaxTokensDisplay.textContent = this._formatApiMaxTokensDisplay(apiMaxTokens);
    if (apiTemperatureEl) apiTemperatureEl.value = apiTemperature;
    if (apiTemperatureDisplay) apiTemperatureDisplay.textContent = apiTemperature;
    if (baseUrlDisplay) baseUrlDisplay.textContent = baseUrl || '未设置';
    if (apiKeyDisplay) apiKeyDisplay.textContent = apiKey || '未设置';
    if (modelEl) {
      if (model && !modelEl.querySelector(`option[value="${model}"]`)) {
        const opt = document.createElement('option');
        opt.value = model;
        opt.textContent = model;
        modelEl.appendChild(opt);
      }
      modelEl.value = model || '';
    }
  },

  _persistApiDraftToStorage(draft) {
    const next = draft && typeof draft === 'object' ? draft : {};
    Storage.set(CONFIG.STORAGE_KEYS.API_KEY, String(next.apiKey || '').trim());
    Storage.set(CONFIG.STORAGE_KEYS.BASE_URL, String(next.baseUrl || '').trim());
    Storage.set(CONFIG.STORAGE_KEYS.API_MODEL, String(next.model || '').trim());
    Storage.set(CONFIG.STORAGE_KEYS.CHAT_ROUNDS, String(next.chatRounds || this._defaultChatRoundsStr()).trim() || this._defaultChatRoundsStr());
    Storage.set(
      CONFIG.STORAGE_KEYS.API_MAX_TOKENS,
      String(next.apiMaxTokens || ((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited')).trim() || String((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited')
    );
    Storage.set(
      CONFIG.STORAGE_KEYS.API_TEMPERATURE,
      this._normalizeApiTemperature(
        String(next.apiTemperature || ((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)).trim() || String((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)
      )
    );
  },

  _getStoredDefaultApiDraft() {
    const keys = this._getApiConfigStoreKeys();
    const raw = Storage.get(keys.defaultConfig);
    if (raw && typeof raw === 'object') {
      return this._normalizeApiDraft(raw);
    }
    return null;
  },

  _saveDefaultApiDraft(draft) {
    const keys = this._getApiConfigStoreKeys();
    Storage.set(keys.defaultConfig, this._normalizeApiDraft(draft));
  },

  loadApiConfigPresets() {
    const selectEl = document.getElementById('api-config-select');
    if (!selectEl) return;
    const keys = this._getApiConfigStoreKeys();
    const presets = Storage.get(keys.presets) || {};
    const currentPresetId = String(Storage.get(keys.current) || '').trim();

    selectEl.innerHTML = '<option value="">默认</option>';
    Object.keys(presets).forEach((id) => {
      const item = presets[id];
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = String(item && item.name ? item.name : id);
      if (id === currentPresetId) opt.selected = true;
      selectEl.appendChild(opt);
    });
    this._apiConfigLastSelectedId = selectEl.value || '';
    this._apiConfigLastAppliedDraft = this._collectApiDraftFromForm();
    this._apiConfigDirty = false;
  },

  switchApiConfigPreset(presetId) {
    const id = String(presetId || '').trim();
    const keys = this._getApiConfigStoreKeys();
    if (!id) {
      const defaultDraft = this._getStoredDefaultApiDraft() || this._collectApiDraftFromForm();
      this._applyApiDraftToForm(defaultDraft);
      this._persistApiDraftToStorage(defaultDraft);
      Storage.set(keys.current, '');
      this.loadApiConfigPresets();
      this._apiConfigLastSelectedId = '';
      this._apiConfigLastAppliedDraft = this._normalizeApiDraft(defaultDraft);
      this._apiConfigDirty = false;
      this.showToast('已切换到默认配置');
      return;
    }
    const presets = Storage.get(keys.presets) || {};
    const preset = presets[id];
    if (!preset || !preset.data) {
      alert('API 配置不存在');
      this.loadApiConfigPresets();
      return;
    }
    const draft = {
      apiKey: preset.data.apiKey || '',
      baseUrl: preset.data.baseUrl || '',
      model: preset.data.model || '',
      chatRounds: preset.data.chatRounds || this._defaultChatRoundsStr(),
      apiMaxTokens: preset.data.apiMaxTokens || String((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited'),
      apiTemperature: preset.data.apiTemperature || String((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)
    };
    this._applyApiDraftToForm(draft);
    this._persistApiDraftToStorage(draft);
    Storage.set(keys.current, id);
    this.loadApiConfigPresets();
    this._apiConfigLastSelectedId = id;
    this._apiConfigLastAppliedDraft = this._collectApiDraftFromForm();
    this._apiConfigDirty = false;
    this.showToast(`已切换到 ${preset.name || 'API 配置'}`);
  },

  openApiMaxTokensEditModal() {
    this._apiEditField = 'api-max-tokens';
    const modal = document.getElementById('api-edit-modal');
    const titleEl = document.getElementById('api-edit-modal-title');
    const singleWrap = document.getElementById('api-edit-single-wrap');
    const hintEl = document.getElementById('api-edit-hint');
    const panel = document.getElementById('api-edit-max-tokens-panel');
    const hidden = document.getElementById('api-max-tokens');
    const sw = document.getElementById('api-edit-max-tokens-unlimited-switch');
    const numWrap = document.getElementById('api-edit-max-tokens-number-row');
    const numInput = document.getElementById('api-edit-max-tokens-number');
    const input = document.getElementById('api-edit-input');
    if (!modal || !titleEl || !singleWrap || !panel || !hidden || !sw || !numWrap || !numInput) return;

    if (this._apiEditBaseUrlBlurHandler && input && typeof input.removeEventListener === 'function') {
      try {
        input.removeEventListener('blur', this._apiEditBaseUrlBlurHandler);
      } catch (e) {}
    }
    if (this._apiEditImageGenBlurHandler && input && typeof input.removeEventListener === 'function') {
      try {
        input.removeEventListener('blur', this._apiEditImageGenBlurHandler);
      } catch (e) {}
      this._apiEditImageGenBlurHandler = null;
    }

    titleEl.textContent = '上下文上限';
    singleWrap.hidden = true;
    if (hintEl) hintEl.hidden = true;
    panel.hidden = false;

    const raw = String(hidden.value || '').trim();
    const lower = raw.toLowerCase();
    const unlimited = lower === 'unlimited' || lower === '';
    sw.checked = unlimited;
    if (unlimited) {
      numWrap.hidden = true;
      numInput.value = '';
    } else {
      numWrap.hidden = false;
      numInput.value = raw;
    }

    if (this._apiMaxTokensSwitchHandler && sw) {
      try {
        sw.removeEventListener('change', this._apiMaxTokensSwitchHandler);
      } catch (e) {}
    }
    this._apiMaxTokensSwitchHandler = () => {
      const on = sw.checked;
      numWrap.hidden = on;
      if (on) numInput.value = '';
      else setTimeout(() => {
        try {
          numInput.focus();
        } catch (e2) {}
      }, 50);
    };
    sw.addEventListener('change', this._apiMaxTokensSwitchHandler);

    modal.hidden = false;
  },

  createApiConfigPreset(name) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return;
    const keys = this._getApiConfigStoreKeys();
    const presets = Storage.get(keys.presets) || {};
    const presetId = 'api_cfg_' + Date.now();
    presets[presetId] = {
      id: presetId,
      name: trimmedName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: this._collectApiDraftFromForm()
    };
    Storage.set(keys.presets, presets);
    Storage.set(keys.current, presetId);
    this.loadApiConfigPresets();
    this._apiConfigLastSelectedId = presetId;
    this._apiConfigLastAppliedDraft = this._collectApiDraftFromForm();
    this._apiConfigDirty = false;
    this.showToast('已新增 API 配置');
  },

  deleteApiConfigPreset(presetId) {
    const id = String(presetId || '').trim();
    if (!id) return;
    const keys = this._getApiConfigStoreKeys();
    const presets = Storage.get(keys.presets) || {};
    if (!presets[id]) return;
    delete presets[id];
    Storage.set(keys.presets, presets);
    const cur = String(Storage.get(keys.current) || '').trim();
    if (cur === id) Storage.set(keys.current, '');
    this.loadApiConfigPresets();
    const latestCur = String(Storage.get(keys.current) || '').trim();
    this._apiConfigLastSelectedId = latestCur;
    this._apiConfigLastAppliedDraft = this._collectApiDraftFromForm();
    this._apiConfigDirty = false;
    this.showToast('已删除 API 配置');
  },

  _getImageGenConfigStoreKeys() {
    return {
      presets: (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.IMAGE_GEN_CONFIG_PRESETS) || 'image_gen_config_presets',
      current: (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CURRENT_IMAGE_GEN_CONFIG) || 'current_image_gen_config',
      defaultConfig: (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.IMAGE_GEN_DEFAULT_CONFIG) || 'image_gen_default_config'
    };
  },

  _collectImageGenDraftFromForm() {
    const baseUrlEl = document.getElementById('image-gen-base-url');
    const apiKeyEl = document.getElementById('image-gen-api-key');
    const modelEl = document.getElementById('image-gen-model');
    const autoEl = document.getElementById('image-gen-auto-moments');
    const autoMoments = autoEl && autoEl.checked ? 'on' : 'off';
    return {
      baseUrl: String(baseUrlEl ? baseUrlEl.value : (Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL) || '')).trim(),
      apiKey: String(apiKeyEl ? apiKeyEl.value : (Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY) || '')).trim(),
      model: String(modelEl ? modelEl.value : (Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL) || '')).trim(),
      autoMoments
    };
  },

  _markImageGenConfigDirty() {
    this._imageGenConfigDirty = true;
  },

  _normalizeImageGenDraft(draft) {
    const d = draft && typeof draft === 'object' ? draft : {};
    const defAuto = String((CONFIG && CONFIG.DEFAULT_IMAGE_GEN_AUTO_MOMENTS) || 'off').trim().toLowerCase();
    const autoRaw = String(d.autoMoments != null ? d.autoMoments : '').trim().toLowerCase();
    const autoMoments = autoRaw === 'on' || autoRaw === '1' || autoRaw === 'true'
      ? 'on'
      : (autoRaw === 'off' || autoRaw === '0' || autoRaw === 'false'
        ? 'off'
        : (defAuto === 'on' ? 'on' : 'off'));
    return {
      baseUrl: String(d.baseUrl || '').trim(),
      apiKey: String(d.apiKey || '').trim(),
      model: String(d.model || '').trim(),
      autoMoments
    };
  },

  _isImageGenDraftChanged(a, b) {
    const left = this._normalizeImageGenDraft(a);
    const right = this._normalizeImageGenDraft(b);
    return left.baseUrl !== right.baseUrl || left.apiKey !== right.apiKey || left.model !== right.model
      || left.autoMoments !== right.autoMoments;
  },

  _applyImageGenDraftToForm(draft) {
    const next = this._normalizeImageGenDraft(draft);
    const baseUrlEl = document.getElementById('image-gen-base-url');
    const apiKeyEl = document.getElementById('image-gen-api-key');
    const modelEl = document.getElementById('image-gen-model');
    const baseUrlDisplay = document.getElementById('image-gen-base-url-display');
    const apiKeyDisplay = document.getElementById('image-gen-api-key-display');
    const autoEl = document.getElementById('image-gen-auto-moments');
    if (baseUrlEl) baseUrlEl.value = next.baseUrl;
    if (apiKeyEl) apiKeyEl.value = next.apiKey;
    if (autoEl) autoEl.checked = next.autoMoments === 'on';
    if (baseUrlDisplay) baseUrlDisplay.textContent = next.baseUrl || '未设置';
    if (apiKeyDisplay) apiKeyDisplay.textContent = next.apiKey || '未设置';
    if (modelEl) {
      const model = next.model;
      if (model) {
        const hasOpt = Array.from(modelEl.options || []).some((o) => String(o.value) === model);
        if (!hasOpt) {
          const opt = document.createElement('option');
          opt.value = model;
          opt.textContent = model;
          modelEl.appendChild(opt);
        }
        modelEl.value = model;
      } else {
        modelEl.value = '';
      }
    }
  },

  _persistImageGenDraftToStorage(draft) {
    const next = this._normalizeImageGenDraft(draft);
    Storage.set(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL, next.baseUrl);
    Storage.set(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY, next.apiKey);
    Storage.set(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL, next.model);
    Storage.set(CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS, next.autoMoments);
  },

  _getStoredDefaultImageGenDraft() {
    const keys = this._getImageGenConfigStoreKeys();
    const raw = Storage.get(keys.defaultConfig);
    if (raw && typeof raw === 'object') {
      return this._normalizeImageGenDraft(raw);
    }
    return null;
  },

  _saveDefaultImageGenDraft(draft) {
    const keys = this._getImageGenConfigStoreKeys();
    Storage.set(keys.defaultConfig, this._normalizeImageGenDraft(draft));
  },

  loadImageGenConfigPresets() {
    const selectEl = document.getElementById('image-gen-config-select');
    if (!selectEl) return;
    const keys = this._getImageGenConfigStoreKeys();
    const presets = Storage.get(keys.presets) || {};
    const currentPresetId = String(Storage.get(keys.current) || '').trim();

    selectEl.innerHTML = '<option value="">默认</option>';
    Object.keys(presets).forEach((id) => {
      const item = presets[id];
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = String(item && item.name ? item.name : id);
      if (id === currentPresetId) opt.selected = true;
      selectEl.appendChild(opt);
    });
    this._imageGenConfigLastSelectedId = selectEl.value || '';
    this._imageGenConfigLastAppliedDraft = this._collectImageGenDraftFromForm();
    this._imageGenConfigDirty = false;
  },

  switchImageGenConfigPreset(presetId) {
    const id = String(presetId || '').trim();
    const keys = this._getImageGenConfigStoreKeys();
    if (!id) {
      const defaultDraft = this._getStoredDefaultImageGenDraft() || this._collectImageGenDraftFromForm();
      this._applyImageGenDraftToForm(defaultDraft);
      this._persistImageGenDraftToStorage(defaultDraft);
      Storage.set(keys.current, '');
      this.loadImageGenConfigPresets();
      this._imageGenConfigLastSelectedId = '';
      this._imageGenConfigLastAppliedDraft = this._normalizeImageGenDraft(defaultDraft);
      this._imageGenConfigDirty = false;
      this.showToast('已切换到默认生图配置');
      return;
    }
    const presets = Storage.get(keys.presets) || {};
    const preset = presets[id];
    if (!preset || !preset.data) {
      alert('生图配置不存在');
      this.loadImageGenConfigPresets();
      return;
    }
    const draft = this._normalizeImageGenDraft(preset.data || {});
    this._applyImageGenDraftToForm(draft);
    this._persistImageGenDraftToStorage(draft);
    Storage.set(keys.current, id);
    this.loadImageGenConfigPresets();
    this._imageGenConfigLastSelectedId = id;
    this._imageGenConfigLastAppliedDraft = this._collectImageGenDraftFromForm();
    this._imageGenConfigDirty = false;
    this.showToast(`已切换到 ${preset.name || '生图配置'}`);
  },

  createImageGenConfigPreset(name) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return;
    const keys = this._getImageGenConfigStoreKeys();
    const presets = Storage.get(keys.presets) || {};
    const presetId = 'img_cfg_' + Date.now();
    presets[presetId] = {
      id: presetId,
      name: trimmedName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: this._collectImageGenDraftFromForm()
    };
    Storage.set(keys.presets, presets);
    Storage.set(keys.current, presetId);
    this.loadImageGenConfigPresets();
    this._imageGenConfigLastSelectedId = presetId;
    this._imageGenConfigLastAppliedDraft = this._collectImageGenDraftFromForm();
    this._imageGenConfigDirty = false;
    this.showToast('已新增生图配置');
  },

  deleteImageGenConfigPreset(presetId) {
    const id = String(presetId || '').trim();
    if (!id) return;
    const keys = this._getImageGenConfigStoreKeys();
    const presets = Storage.get(keys.presets) || {};
    if (!presets[id]) return;
    delete presets[id];
    Storage.set(keys.presets, presets);
    const cur = String(Storage.get(keys.current) || '').trim();
    if (cur === id) Storage.set(keys.current, '');
    this.loadImageGenConfigPresets();
    const latestCur = String(Storage.get(keys.current) || '').trim();
    this._imageGenConfigLastSelectedId = latestCur;
    this._imageGenConfigLastAppliedDraft = this._collectImageGenDraftFromForm();
    this._imageGenConfigDirty = false;
    this.showToast('已删除生图配置');
  },

  saveImageGenSettings() {
    const draft = this._collectImageGenDraftFromForm();
    this._persistImageGenDraftToStorage(draft);
    const keys = this._getImageGenConfigStoreKeys();
    const currentPresetId = String(Storage.get(keys.current) || '').trim();
    if (currentPresetId) {
      const presets = Storage.get(keys.presets) || {};
      const current = presets[currentPresetId];
      if (current && current.data) {
        current.updatedAt = Date.now();
        current.data = {
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey,
          model: draft.model,
          autoMoments: draft.autoMoments
        };
        presets[currentPresetId] = current;
        Storage.set(keys.presets, presets);
      }
    } else {
      this._saveDefaultImageGenDraft({
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey,
        model: draft.model,
        autoMoments: draft.autoMoments
      });
    }
    this._imageGenConfigLastSelectedId = currentPresetId || '';
    this._imageGenConfigLastAppliedDraft = this._collectImageGenDraftFromForm();
    this._imageGenConfigDirty = false;
    this.showToast('生图设置已保存');
  },

  loadImageGenFromStorage() {
    const autoKey = CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS
      ? CONFIG.STORAGE_KEYS.IMAGE_GEN_AUTO_MOMENTS
      : 'image_gen_auto_moments';
    const autoStored = Storage.get(autoKey);
    const autoNorm = String(autoStored != null && autoStored !== '' ? autoStored : ((CONFIG && CONFIG.DEFAULT_IMAGE_GEN_AUTO_MOMENTS) || 'off')).trim().toLowerCase();
    const autoMoments = autoNorm === 'on' || autoNorm === '1' || autoNorm === 'true' ? 'on' : 'off';
    const draft = {
      baseUrl: String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL) || '').trim(),
      apiKey: String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY) || '').trim(),
      model: String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL) || '').trim(),
      autoMoments
    };
    this._applyImageGenDraftToForm(draft);
    this.loadImageGenConfigPresets();
  },

  _syncGenTestRunButtonState() {
    const ta = document.getElementById('gen-test-prompt');
    const btn = document.getElementById('gen-test-run');
    if (!ta || !btn) return;
    btn.disabled = String(ta.value || '').trim().length === 0;
  },

  /**
   * 生图设置页「测试」：根据描述调用标准 images/generations（ImageGenerationApi）。
   */
  async runGenTestFromSettings() {
    const ta = document.getElementById('gen-test-prompt');
    const btn = document.getElementById('gen-test-run');
    const errEl = document.getElementById('gen-test-error');
    const resultCard = document.getElementById('gen-test-result-card');
    const imgEl = document.getElementById('gen-test-image');
    const text = String(ta && ta.value != null ? ta.value : '').trim();
    if (!text) return;
    if (typeof ImageGenerationApi === 'undefined' || typeof ImageGenerationApi.generateFromDescription !== 'function') {
      this.showToast('生图模块未加载');
      return;
    }
    const base = String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL) || '').trim();
    const key = String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY) || '').trim();
    const model = String(Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_MODEL) || '').trim();
    if (!base || !key || !model) {
      this.showToast('请先在「生图设置」中配置地址、Key 与模型');
      if (errEl) {
        errEl.textContent = '请先在「生图设置」中完成配置并点击存储。';
        errEl.hidden = false;
      }
      if (resultCard) resultCard.hidden = true;
      return;
    }
    if (errEl) {
      errEl.textContent = '';
      errEl.hidden = true;
    }
    const idleLabel = '测试生成图片';
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '生成中…';
      }
      const { images } = await ImageGenerationApi.generateFromDescription(text);
      const first = images && images[0];
      const src = first && (first.dataUrl || first.url);
      if (!src) throw new Error('接口未返回可用图片');
      if (imgEl) imgEl.src = src;
      if (resultCard) resultCard.hidden = false;
      this.showToast('已生成');
    } catch (e) {
      const msg = String(e && e.message ? e.message : e || '生成失败');
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
      }
      if (resultCard) resultCard.hidden = true;
    } finally {
      if (btn) {
        btn.textContent = idleLabel;
        this._syncGenTestRunButtonState();
      }
    }
  },

  _getNotifyMode() {
    const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.NOTIFY_MODE) || 'notify_mode';
    const mode = String(Storage.get(key) || 'in_app').trim();
    return (mode === 'system' || mode === 'off' || mode === 'in_app') ? mode : 'in_app';
  },

  _notifyModeLabel(mode) {
    if (mode === 'system') return '手机系统通知';
    if (mode === 'off') return '关闭';
    return '软件内通知';
  },

  _syncNotifyModeDisplay() {
    // 列表页不回显模式，遵循“仅在选择器内部显示”的交互
  },

  async _setNotifyMode(next) {
    const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.NOTIFY_MODE) || 'notify_mode';
    if (next !== 'in_app' && next !== 'system' && next !== 'off') return;
    Storage.set(key, next);
    this._syncNotifyModeDisplay();

    if (next === 'system') {
      try {
        if (!('Notification' in window)) {
          this.showToast('当前环境不支持系统通知');
          return;
        }
        const p = await Notification.requestPermission();
        if (p !== 'granted') {
          this.showToast('未授予系统通知权限，仍可稍后在浏览器设置里开启');
        } else {
          this.showToast('已切换为手机系统通知');
        }
      } catch (e) {
        this.showToast('系统通知权限请求失败');
      }
      return;
    }

    this.showToast(next === 'off' ? '通知已关闭' : '已切换为软件内通知');
  },

  async openNotifyModePicker(anchorEl) {
    const cur = this._getNotifyMode();
    const picked = await this._openNativeChoicePicker({
      current: cur,
      anchorEl,
      options: [
        { value: 'system', label: '真实手机通知' },
        { value: 'in_app', label: '软件内通知' },
        { value: 'off', label: '关闭通知' }
      ]
    });
    if (!picked || picked === cur) return;
    await this._setNotifyMode(picked);
  },

  _getTimeAwarenessMode() {
    const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.TIME_AWARENESS) || 'time_awareness';
    const def = (CONFIG && CONFIG.DEFAULT_TIME_AWARENESS) || 'on';
    const mode = String(Storage.get(key) || def).trim();
    return mode === 'on' ? 'on' : 'off';
  },

  async _setTimeAwarenessMode(next) {
    const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.TIME_AWARENESS) || 'time_awareness';
    const v = next === 'on' ? 'on' : 'off';
    Storage.set(key, v);
    this.showToast(v === 'on' ? '已开启真实时间感知' : '已关闭真实时间感知');
  },

  async openTimeAwarenessPicker(anchorEl) {
    const cur = this._getTimeAwarenessMode();
    const picked = await this._openNativeChoicePicker({
      current: cur,
      anchorEl,
      options: [
        { value: 'on', label: '开启真实时间感知' },
        { value: 'off', label: '关闭' }
      ]
    });
    if (!picked || picked === cur) return;
    await this._setTimeAwarenessMode(picked);
  },

  _getHomescreenDockMode() {
    const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.HOMESCREEN_DOCK) || 'homescreen_dock';
    const def = (CONFIG && CONFIG.DEFAULT_HOMESCREEN_DOCK) || 'show';
    const mode = String(Storage.get(key) || def).trim();
    return mode === 'hide' ? 'hide' : 'show';
  },

  async _setHomescreenDockMode(next) {
    const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.HOMESCREEN_DOCK) || 'homescreen_dock';
    const v = next === 'hide' ? 'hide' : 'show';
    Storage.set(key, v);
    if (typeof Homescreen !== 'undefined' && Homescreen.renderDock) {
      Homescreen.renderDock();
      try {
        if (Homescreen.renderHomescreen) Homescreen.renderHomescreen();
      } catch (e) {}
    }
    this.showToast(v === 'hide' ? '已隐藏主屏幕dock栏' : '已显示主屏幕dock栏');
  },

  async openHomescreenDockPicker(anchorEl) {
    const cur = this._getHomescreenDockMode();
    const picked = await this._openNativeChoicePicker({
      current: cur,
      anchorEl,
      options: [
        { value: 'show', label: '显示dock栏' },
        { value: 'hide', label: '隐藏dock栏' }
      ]
    });
    if (!picked || picked === cur) return;
    await this._setHomescreenDockMode(picked);
  },

  _openNativeChoicePicker({ current, options, anchorEl }) {
    return new Promise((resolve) => {
      const list = Array.isArray(options) ? options : [];
      if (!list.length) {
        resolve('');
        return;
      }
      const rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
      const anchorX = rect ? (rect.left + rect.width * 0.5) : (window.innerWidth * 0.5);
      const anchorY = rect ? (rect.top + rect.height * 0.5) : (window.innerHeight * 0.5);

      const select = document.createElement('select');
      select.setAttribute('aria-label', '选项选择器');
      select.style.position = 'fixed';
      select.style.left = `${Math.max(0, Math.round(anchorX - 1))}px`;
      select.style.top = `${Math.max(0, Math.round(anchorY - 1))}px`;
      select.style.width = '2px';
      select.style.height = '2px';
      select.style.opacity = '0';
      select.style.pointerEvents = 'none';
      select.style.zIndex = '9999';
      list.forEach((it) => {
        const opt = document.createElement('option');
        opt.value = String(it.value || '');
        opt.textContent = String(it.label || it.value || '');
        select.appendChild(opt);
      });
      select.value = String(current || list[0].value || '');
      document.body.appendChild(select);

      let done = false;
      const cleanup = (val) => {
        if (done) return;
        done = true;
        setTimeout(() => {
          try { select.remove(); } catch (e) {}
        }, 20);
        resolve(String(val || ''));
      };

      select.addEventListener('change', () => cleanup(select.value), { once: true });
      select.addEventListener('blur', () => cleanup(''), { once: true });

      try {
        select.focus();
        if (typeof select.showPicker === 'function') {
          select.showPicker();
        } else {
          select.click();
        }
      } catch (e) {
        cleanup('');
      }
    });
  },

  openApiEditModal(field, title, placeholder, opts = {}) {
    this._apiEditField = field;
    const maxTokPanel = document.getElementById('api-edit-max-tokens-panel');
    const singleWrap = document.getElementById('api-edit-single-wrap');
    if (maxTokPanel) maxTokPanel.hidden = true;
    if (singleWrap) singleWrap.hidden = false;
    const modal = document.getElementById('api-edit-modal');
    const titleEl = document.getElementById('api-edit-modal-title');
    const input = document.getElementById('api-edit-input');
    const hintEl = document.getElementById('api-edit-hint');
    const hidden = document.getElementById(field);
    if (!modal || !titleEl || !input || !hidden) return;
    if (this._apiEditImageGenBlurHandler && typeof input.removeEventListener === 'function') {
      try {
        input.removeEventListener('blur', this._apiEditImageGenBlurHandler);
      } catch (e) {}
      this._apiEditImageGenBlurHandler = null;
    }
    titleEl.textContent = title;
    input.placeholder = placeholder;
    input.value = hidden.value || '';
    input.type = opts.type || 'text';
    input.min = opts.min;
    input.max = opts.max;
    if (hintEl) hintEl.hidden = field !== 'chat-rounds';

    // API 地址弹窗：输入失焦时检查是否缺少 `/v1`
    // 注意：只修改输入框内容，不直接写入 hidden/base-url，避免用户点取消时误保存。
    if (field === 'base-url') {
      if (this._apiEditBaseUrlBlurHandler && typeof input.removeEventListener === 'function') {
        input.removeEventListener('blur', this._apiEditBaseUrlBlurHandler);
      }
      this._apiEditBaseUrlBlurHandler = () => {
        try {
          const raw = String(input?.value || '').trim();
          if (!raw) return;

          // 已经是标准格式：https://xxx/v1 或 https://xxx/v1/
          if (/\/v1\/?$/i.test(raw)) return;

          // 仅缺少 `/v1`：https://xxx 或 https://xxx/
          const m = raw.match(/^https?:\/\/[^\/\s]+\/?$/i);
          if (!m) return;

          const base = raw.replace(/\/$/, '');
          const withV1 = `${base}/v1`;
          const ok = confirm(`当前 API 地址不是标准格式（缺少 /v1），是否改为：\n${withV1}`);
          if (ok) input.value = withV1;
        } catch (e) {}
      };
      input.addEventListener('blur', this._apiEditBaseUrlBlurHandler);
    } else if (this._apiEditBaseUrlBlurHandler && typeof input.removeEventListener === 'function') {
      // 非 base-url 字段：移除旧的 blur 校验，避免误触发
      input.removeEventListener('blur', this._apiEditBaseUrlBlurHandler);
    }

    modal.hidden = false;
    setTimeout(() => input.focus(), 100);
  },

  closeApiEditModal() {
    const sw = document.getElementById('api-edit-max-tokens-unlimited-switch');
    if (this._apiMaxTokensSwitchHandler && sw) {
      try {
        sw.removeEventListener('change', this._apiMaxTokensSwitchHandler);
      } catch (e) {}
      this._apiMaxTokensSwitchHandler = null;
    }
    const maxTokPanel = document.getElementById('api-edit-max-tokens-panel');
    const singleWrap = document.getElementById('api-edit-single-wrap');
    if (maxTokPanel) maxTokPanel.hidden = true;
    if (singleWrap) singleWrap.hidden = false;
    const modal = document.getElementById('api-edit-modal');
    const hintEl = document.getElementById('api-edit-hint');
    const input = document.getElementById('api-edit-input');
    if (modal) modal.hidden = true;
    if (hintEl) hintEl.hidden = true;
    if (this._apiEditBaseUrlBlurHandler && input && typeof input.removeEventListener === 'function') {
      try {
        input.removeEventListener('blur', this._apiEditBaseUrlBlurHandler);
      } catch (e) {}
    }
    if (this._apiEditImageGenBlurHandler && input && typeof input.removeEventListener === 'function') {
      try {
        input.removeEventListener('blur', this._apiEditImageGenBlurHandler);
      } catch (e) {}
      this._apiEditImageGenBlurHandler = null;
    }
    this._apiEditField = null;
  },

  openImageGenEditModal(fieldId, title, placeholder, opts = {}) {
    this._apiEditField = fieldId;
    const maxTokPanel = document.getElementById('api-edit-max-tokens-panel');
    const singleWrap = document.getElementById('api-edit-single-wrap');
    if (maxTokPanel) maxTokPanel.hidden = true;
    if (singleWrap) singleWrap.hidden = false;
    const modal = document.getElementById('api-edit-modal');
    const titleEl = document.getElementById('api-edit-modal-title');
    const input = document.getElementById('api-edit-input');
    const hintEl = document.getElementById('api-edit-hint');
    const hidden = document.getElementById(fieldId);
    if (!modal || !titleEl || !input || !hidden) return;
    if (this._apiEditBaseUrlBlurHandler && typeof input.removeEventListener === 'function') {
      try {
        input.removeEventListener('blur', this._apiEditBaseUrlBlurHandler);
      } catch (e) {}
    }
    titleEl.textContent = title;
    input.placeholder = placeholder;
    input.value = hidden.value || '';
    input.type = opts.type || 'text';
    input.min = opts.min;
    input.max = opts.max;
    if (hintEl) hintEl.hidden = true;

    if (fieldId === 'image-gen-base-url') {
      if (this._apiEditImageGenBlurHandler && typeof input.removeEventListener === 'function') {
        input.removeEventListener('blur', this._apiEditImageGenBlurHandler);
      }
      this._apiEditImageGenBlurHandler = () => {
        try {
          const raw = String(input?.value || '').trim();
          if (!raw) return;
          if (/\/v1\/?$/i.test(raw)) return;
          const m = raw.match(/^https?:\/\/[^\/\s]+\/?$/i);
          if (!m) return;
          const base = raw.replace(/\/$/, '');
          const withV1 = `${base}/v1`;
          const ok = confirm(`当前生图 API 地址不是标准格式（缺少 /v1），是否改为：\n${withV1}`);
          if (ok) input.value = withV1;
        } catch (e) {}
      };
      input.addEventListener('blur', this._apiEditImageGenBlurHandler);
    } else if (this._apiEditImageGenBlurHandler && typeof input.removeEventListener === 'function') {
      input.removeEventListener('blur', this._apiEditImageGenBlurHandler);
      this._apiEditImageGenBlurHandler = null;
    }

    modal.hidden = false;
    setTimeout(() => input.focus(), 100);
  },

  async fetchModelsFromApi() {
    if (this._fetchingModels) return;
    const baseUrl = (document.getElementById('base-url') && document.getElementById('base-url').value) || Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || '';
    const apiKey = (document.getElementById('api-key') && document.getElementById('api-key').value) || Storage.get(CONFIG.STORAGE_KEYS.API_KEY) || '';
    if (!baseUrl.trim() || !apiKey.trim()) {
      alert('请先填写 API 地址和 API Key 后再选择模型');
      return;
    }
    const modelEl = document.getElementById('api-model');
    if (!modelEl) return;
    this._fetchingModels = true;
    const currentValue = modelEl.value;
    const url = baseUrl.replace(/\/$/, '') + '/models';
    try {
      const loadingOpt = document.createElement('option');
      loadingOpt.value = '';
      loadingOpt.textContent = '加载中…';
      loadingOpt.disabled = true;
      modelEl.appendChild(loadingOpt);
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      // 检查 HTTP 状态码，只有成功响应才处理
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      const list = (data && data.data && Array.isArray(data.data)) ? data.data : [];
      const ids = list.map(m => (m.id || m).toString()).filter(Boolean);
      modelEl.innerHTML = '';
      modelEl.removeAttribute('disabled');
      if (ids.length === 0) {
        // 请求成功但列表为空：不显示默认列表，只显示提示
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '未找到可用模型';
        emptyOpt.disabled = true;
        modelEl.appendChild(emptyOpt);
      } else {
        // 请求成功且有模型：显示实际获取到的模型列表
        ids.forEach(id => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = id;
          modelEl.appendChild(opt);
        });
        if (currentValue && ids.includes(currentValue)) {
          modelEl.value = currentValue;
        } else {
          // 不自动选中：留给用户手动选择
          modelEl.selectedIndex = -1;
        }
      }
    } catch (err) {
      console.error('拉取模型列表失败:', err);
      modelEl.removeAttribute('disabled');
      modelEl.innerHTML = '';
      // 请求失败：不显示默认列表，只显示错误提示
      const errorOpt = document.createElement('option');
      errorOpt.value = '';
      errorOpt.textContent = '加载失败，请检查 API 配置';
      errorOpt.disabled = true;
      modelEl.appendChild(errorOpt);
      // 如果之前有保存的模型值，保留它（但不在下拉列表中显示，用户需要重新选择）
      if (currentValue) {
        const opt = document.createElement('option');
        opt.value = currentValue;
        opt.textContent = currentValue + '（已保存）';
        modelEl.appendChild(opt);
        modelEl.value = currentValue;
      }
    } finally {
      this._fetchingModels = false;
    }
  },

  async fetchModelsForImageGen() {
    if (this._fetchingImageGenModels) return;
    const baseUrl = (document.getElementById('image-gen-base-url') && document.getElementById('image-gen-base-url').value)
      || Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_BASE_URL) || '';
    const apiKey = (document.getElementById('image-gen-api-key') && document.getElementById('image-gen-api-key').value)
      || Storage.get(CONFIG.STORAGE_KEYS.IMAGE_GEN_API_KEY) || '';
    if (!String(baseUrl).trim() || !String(apiKey).trim()) {
      alert('请先填写生图 API 地址和 API Key 后再选择模型');
      return;
    }
    const modelEl = document.getElementById('image-gen-model');
    if (!modelEl) return;
    this._fetchingImageGenModels = true;
    const currentValue = modelEl.value;
    const url = String(baseUrl).replace(/\/$/, '') + '/models';
    try {
      const loadingOpt = document.createElement('option');
      loadingOpt.value = '';
      loadingOpt.textContent = '加载中…';
      loadingOpt.disabled = true;
      modelEl.appendChild(loadingOpt);
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const list = (data && data.data && Array.isArray(data.data)) ? data.data : [];
      const ids = list.map((m) => (m.id || m).toString()).filter(Boolean);
      modelEl.innerHTML = '';
      modelEl.removeAttribute('disabled');
      if (ids.length === 0) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '未找到可用模型';
        emptyOpt.disabled = true;
        modelEl.appendChild(emptyOpt);
      } else {
        ids.forEach((id) => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = id;
          modelEl.appendChild(opt);
        });
        if (currentValue && ids.includes(currentValue)) {
          modelEl.value = currentValue;
        } else {
          modelEl.selectedIndex = -1;
        }
      }
    } catch (err) {
      console.error('拉取生图模型列表失败:', err);
      modelEl.removeAttribute('disabled');
      modelEl.innerHTML = '';
      const errorOpt = document.createElement('option');
      errorOpt.value = '';
      errorOpt.textContent = '加载失败，请检查生图 API 配置';
      errorOpt.disabled = true;
      modelEl.appendChild(errorOpt);
      if (currentValue) {
        const opt = document.createElement('option');
        opt.value = currentValue;
        opt.textContent = `${currentValue}（已保存）`;
        modelEl.appendChild(opt);
        modelEl.value = currentValue;
      }
    } finally {
      this._fetchingImageGenModels = false;
    }
  },

  confirmApiEditModal() {
    const field = this._apiEditField;
    const input = document.getElementById('api-edit-input');
    if (field === 'api-max-tokens') {
      const sw = document.getElementById('api-edit-max-tokens-unlimited-switch');
      const numInput = document.getElementById('api-edit-max-tokens-number');
      const hidden = document.getElementById('api-max-tokens');
      const display = document.getElementById('api-max-tokens-display');
      if (!sw || !numInput || !hidden) return;
      let value;
      if (sw.checked) {
        value = 'unlimited';
      } else {
        const n = parseInt(String(numInput.value || '').trim(), 10);
        if (!Number.isFinite(n) || n < 1) {
          alert('请输入大于 0 的整数');
          return;
        }
        value = String(Math.floor(n));
      }
      hidden.value = value;
      if (display) display.textContent = this._formatApiMaxTokensDisplay(value);
      this._markApiConfigDirty();
      this.closeApiEditModal();
      return;
    }
    if (field === 'image-gen-base-url' || field === 'image-gen-api-key') {
      const hidden = document.getElementById(field);
      const display = field === 'image-gen-base-url'
        ? document.getElementById('image-gen-base-url-display')
        : document.getElementById('image-gen-api-key-display');
      if (!input || !hidden) return;
      const value = String(input.value || '').trim();
      hidden.value = value;
      if (display) display.textContent = value || '未设置';
      this._markImageGenConfigDirty();
      this.closeApiEditModal();
      return;
    }
    const hidden = document.getElementById(field);
    const display = field === 'base-url' ? document.getElementById('base-url-display')
      : field === 'api-key' ? document.getElementById('api-key-display')
      : field === 'chat-rounds' ? document.getElementById('chat-rounds-display')
      : field === 'api-temperature' ? document.getElementById('api-temperature-display')
      : null;
    if (!field || !input || !hidden) return;
    let value = input.value.trim();
    if (field === 'chat-rounds') {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1) value = this._defaultChatRoundsStr();
      else if (n > 200) value = '200';
      else value = String(n);
    } else if (field === 'api-temperature') {
      value = this._normalizeApiTemperature(value);
    }
    hidden.value = value;
    if (display) display.textContent = value || '未设置';
    if (field === 'base-url' || field === 'api-key' || field === 'chat-rounds' || field === 'api-temperature') {
      this._markApiConfigDirty();
    }
    this.closeApiEditModal();
  },

  saveApiSettings() {
    const apiKeyEl = document.getElementById('api-key');
    const baseUrlEl = document.getElementById('base-url');
    const modelEl = document.getElementById('api-model');
    const chatRoundsEl = document.getElementById('chat-rounds');
    const apiMaxTokensEl = document.getElementById('api-max-tokens');
    const apiTemperatureEl = document.getElementById('api-temperature');
    const apiKey = apiKeyEl ? apiKeyEl.value.trim() : '';
    const baseUrl = baseUrlEl ? baseUrlEl.value.trim() : '';
    const model = modelEl ? modelEl.value : '';
    const chatRounds = chatRoundsEl ? chatRoundsEl.value.trim() : this._defaultChatRoundsStr();
    const apiMaxTokens = apiMaxTokensEl
      ? (apiMaxTokensEl.value.trim() || String((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited'))
      : String((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS) || 'unlimited');
    const apiTemperature = this._normalizeApiTemperature(
      apiTemperatureEl
        ? apiTemperatureEl.value.trim()
        : String((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8)
    );

    Storage.set(CONFIG.STORAGE_KEYS.API_KEY, apiKey);
    Storage.set(CONFIG.STORAGE_KEYS.BASE_URL, baseUrl);
    Storage.set(CONFIG.STORAGE_KEYS.API_MODEL, model);
    Storage.set(CONFIG.STORAGE_KEYS.CHAT_ROUNDS, chatRounds || this._defaultChatRoundsStr());
    Storage.set(CONFIG.STORAGE_KEYS.API_MAX_TOKENS, apiMaxTokens);
    Storage.set(CONFIG.STORAGE_KEYS.API_TEMPERATURE, apiTemperature);
    const apiAutoVisionEl = document.getElementById('api-auto-vision');
    if (apiAutoVisionEl) {
      const avKey =
        CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CHAT_AUTO_VISION
          ? CONFIG.STORAGE_KEYS.CHAT_AUTO_VISION
          : 'chat_auto_vision';
      Storage.set(avKey, apiAutoVisionEl.checked ? 'on' : 'off');
    }
    const apiStreamEl = document.getElementById('api-stream');
    if (apiStreamEl) {
      const streamKey =
        CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_STREAM
          ? CONFIG.STORAGE_KEYS.API_STREAM
          : 'api_stream';
      Storage.set(streamKey, apiStreamEl.checked ? 'on' : 'off');
    }
    const keys = this._getApiConfigStoreKeys();
    const currentPresetId = String(Storage.get(keys.current) || '').trim();
    if (currentPresetId) {
      const presets = Storage.get(keys.presets) || {};
      const current = presets[currentPresetId];
      if (current && current.data) {
        current.updatedAt = Date.now();
        current.data = { apiKey, baseUrl, model, chatRounds: chatRounds || this._defaultChatRoundsStr(), apiMaxTokens, apiTemperature };
        presets[currentPresetId] = current;
        Storage.set(keys.presets, presets);
      }
    } else {
      this._saveDefaultApiDraft({ apiKey, baseUrl, model, chatRounds: chatRounds || this._defaultChatRoundsStr(), apiMaxTokens, apiTemperature });
    }
    this._apiConfigLastSelectedId = currentPresetId || '';
    this._apiConfigLastAppliedDraft = this._collectApiDraftFromForm();
    this._apiConfigDirty = false;

    this.showToast('API 设置已保存');
  },

  _normalizeApiTemperature(inputVal) {
    const fallback = Number((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8);
    const raw = String(inputVal == null ? '' : inputVal).trim();
    const n = Number(raw);
    const base = Number.isFinite(n) ? n : (Number.isFinite(fallback) ? fallback : 0.8);
    const clamped = Math.min(2, Math.max(0, base));
    return (Math.round(clamped * 100) / 100).toString();
  },

  saveVoiceSettings() {
    const key = String(document.getElementById('voice-api-key')?.value || '').trim();
    const model = String(document.getElementById('voice-model')?.value || 'speech-2.8-hd').trim();
    const voiceId = String(document.getElementById('voice-id-select')?.value || '').trim();
    const moodEnabled = !!document.getElementById('voice-mood-tags-enabled')?.checked;
    const voiceType = String(Storage.get((CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_TYPE) || 'voice_type') || 'all').trim() || 'all';

    Storage.set(CONFIG.STORAGE_KEYS.VOICE_API_KEY, key);
    Storage.set(CONFIG.STORAGE_KEYS.VOICE_MODEL, model);
    Storage.set(CONFIG.STORAGE_KEYS.VOICE_ID, voiceId);
    Storage.set(
      (CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_MOOD_TAGS_ENABLED) || 'voice_mood_tags_enabled',
      moodEnabled ? '1' : '0'
    );
    Storage.set((CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_TYPE) || 'voice_type', voiceType);

    this.showToast('语音设置已保存');
  },

  async fetchVoicesFromMiniMax(quietIfNoKey = false, voiceTypeOverride = '') {
    if (this._fetchingVoices) return;
    const key = String(document.getElementById('voice-api-key')?.value || Storage.get(CONFIG.STORAGE_KEYS.VOICE_API_KEY) || '').trim();
    if (!key) {
      if (!quietIfNoKey) alert('请先填写 MiniMax API Key');
      return;
    }

    const voiceInputEl = document.getElementById('voice-id-select');
    const voiceType = String(
      voiceTypeOverride || Storage.get((CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_TYPE) || 'voice_type') || 'all'
    ).trim() || 'all';
    if (!voiceInputEl) return;

    this._fetchingVoices = true;
    const currentValue = String(voiceInputEl.value || '').trim();
    this._renderVoiceDisplay('', '加载中...');

    const url = 'https://api.minimaxi.com/v1/get_voice';
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({ voice_type: voiceType })
      });
      const json = await res.json();
      if (!res.ok || (json?.base_resp?.status_code && json.base_resp.status_code !== 0)) {
        const msg = json?.base_resp?.status_msg || `HTTP ${res.status}`;
        console.error('拉取音色失败:', json);
        throw new Error(msg);
      }

      const items = [];
      const sys = Array.isArray(json?.system_voice) ? json.system_voice : [];
      const cloning = Array.isArray(json?.voice_cloning) ? json.voice_cloning : [];
      const gen = Array.isArray(json?.voice_generation) ? json.voice_generation : [];
      sys.forEach(v => items.push({ voice_id: v.voice_id, name: v.voice_name || v.voice_id, group: '系统' }));
      cloning.forEach(v => items.push({ voice_id: v.voice_id, name: v.voice_id, group: '复刻' }));
      gen.forEach(v => items.push({ voice_id: v.voice_id, name: v.voice_id, group: '生成' }));
      this._voiceSettingsVoices = items.filter(it => it && it.voice_id);

      if (items.length === 0) {
        voiceInputEl.value = '';
        this._renderVoiceDisplay('', '未查询到可用音色');
        return;
      }

      const savedVoiceId = Storage.get(CONFIG.STORAGE_KEYS.VOICE_ID) || '';
      const preferred = currentValue || savedVoiceId;
      let picked = '';
      if (preferred && this._voiceSettingsVoices.some(v => v.voice_id === preferred)) {
        picked = preferred;
      } else if (this._voiceSettingsVoices[0] && this._voiceSettingsVoices[0].voice_id) {
        picked = this._voiceSettingsVoices[0].voice_id;
      }
      voiceInputEl.value = picked;
      this._renderVoiceDisplay(picked);

      this.showToast('音色已更新');
    } catch (e) {
      console.error('fetchVoicesFromMiniMax:error', e);
      this._renderVoiceDisplay('', '加载失败，请检查密钥');
      if (!quietIfNoKey) alert(`获取音色失败：${String(e?.message || e)}`);
    } finally {
      this._fetchingVoices = false;
    }
  },

  _renderVoiceDisplay(voiceId, fallbackText = '') {
    const displayEl = document.getElementById('voice-id-display');
    if (!displayEl) return;
    const id = String(voiceId || '').trim();
    if (!id) {
      displayEl.textContent = fallbackText || '请先获取可用音色';
      return;
    }
    const voices = Array.isArray(this._voiceSettingsVoices) ? this._voiceSettingsVoices : [];
    const hit = voices.find(v => String(v.voice_id || '').trim() === id);
    const name = String(hit?.name || '').trim();
    displayEl.textContent = name && name !== id ? `${name}（${id}）` : id;
  },

  async openVoiceSettingsPicker() {
    const old = document.getElementById('yd-voice-settings-picker');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-voice-settings-picker';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content yd-voice-settings-picker" role="dialog" aria-modal="true" aria-label="选择默认音色">
        <div class="yd-modal-header">
          <div class="yd-voice-settings-picker__title">选择默认音色</div>
          <button type="button" class="yd-btn-close" id="yd-voice-settings-picker-close" aria-label="关闭">×</button>
        </div>
        <div class="yd-voice-settings-picker__toolbar">
          <select class="yd-input yd-voice-settings-picker__type" id="yd-voice-settings-picker-type" aria-label="查询类型">
            <option value="system">system（系统音色）</option>
            <option value="voice_cloning">voice_cloning（快速复刻）</option>
            <option value="voice_generation">voice_generation（文生音色）</option>
            <option value="all">all（全部）</option>
          </select>
          <input class="yd-input yd-voice-settings-picker__search" id="yd-voice-settings-picker-search" placeholder="搜索音色名 / ID">
        </div>
        <div class="yd-voice-settings-picker__list" id="yd-voice-settings-picker-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#yd-voice-settings-picker-close')?.addEventListener('click', close);

    const listEl = overlay.querySelector('#yd-voice-settings-picker-list');
    const searchEl = overlay.querySelector('#yd-voice-settings-picker-search');
    const typeEl = overlay.querySelector('#yd-voice-settings-picker-type');
    const voiceInputEl = document.getElementById('voice-id-select');
    let currentId = String(voiceInputEl?.value || '').trim();
    let voices = [];
    const savedType = String(Storage.get((CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_TYPE) || 'voice_type') || 'all').trim() || 'all';
    if (typeEl) typeEl.value = savedType || 'all';

    const render = () => {
      if (!listEl) return;
      const kw = String(searchEl?.value || '').trim().toLowerCase();
      const filtered = kw
        ? voices.filter(v => `${String(v.name || '')} ${String(v.voice_id || '')}`.toLowerCase().includes(kw))
        : voices;
      listEl.innerHTML = '';
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'yd-character-preview__empty';
        empty.textContent = '没有匹配的音色';
        listEl.appendChild(empty);
        return;
      }
      filtered.forEach((v) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `yd-voice-settings-voice-card${currentId && currentId === v.voice_id ? ' is-active' : ''}`;

        const top = document.createElement('div');
        top.className = 'yd-voice-settings-voice-card__top';
        const name = document.createElement('span');
        name.className = 'yd-voice-settings-voice-card__name';
        name.textContent = String(v.name || v.voice_id || '');
        top.appendChild(name);
        if (v.group) {
          const group = document.createElement('span');
          group.className = 'yd-voice-settings-voice-card__group';
          group.textContent = String(v.group);
          top.appendChild(group);
        }

        const id = document.createElement('div');
        id.className = 'yd-voice-settings-voice-card__id';
        id.textContent = String(v.voice_id || '');

        btn.appendChild(top);
        btn.appendChild(id);
        btn.addEventListener('click', () => {
          if (voiceInputEl) voiceInputEl.value = String(v.voice_id || '').trim();
          this._renderVoiceDisplay(String(v.voice_id || '').trim());
          close();
        });
        listEl.appendChild(btn);
      });
    };

    const reloadByType = async (voiceType) => {
      listEl.innerHTML = '<div class="yd-character-preview__empty">正在加载音色列表...</div>';
      await this.fetchVoicesFromMiniMax(false, voiceType);
      voices = Array.isArray(this._voiceSettingsVoices) ? this._voiceSettingsVoices.slice() : [];
      Storage.set((CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VOICE_TYPE) || 'voice_type', String(voiceType || 'all'));
      currentId = String(voiceInputEl?.value || '').trim();
      render();
    };

    typeEl?.addEventListener('change', async () => {
      const pickedType = String(typeEl.value || 'all').trim() || 'all';
      await reloadByType(pickedType);
    });
    searchEl?.addEventListener('input', render);
    await reloadByType(typeEl?.value || savedType || 'all');
    render();
  },

  _hexToBytes(hex) {
    const clean = String(hex || '').trim();
    const out = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  },

  async testVoiceT2A() {
    const key = String(document.getElementById('voice-api-key')?.value || '').trim();
    const model = String(document.getElementById('voice-model')?.value || 'speech-2.8-hd').trim();
    const voiceId = String(document.getElementById('voice-id-select')?.value || '').trim();
    const text = String(document.getElementById('voice-test-text')?.value || '').trim();

    if (!key) return alert('请先填写 MiniMax API Key');
    if (!voiceId) return alert('请先选择默认音色');
    if (!text) return alert('请输入要合成的文本');

    const url = 'https://api.minimaxi.com/v1/t2a_v2';
    const body = {
      model,
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: 1,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1
      },
      output_format: 'hex'
    };

    const audioEl = document.getElementById('voice-audio');
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.style.display = 'none';
    }

    this.showToast('正在合成…', 1200);
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      console.error('语音合成请求失败:', e);
      return alert('请求失败，请检查网络或 API Key');
    }

    let json;
    try {
      json = await resp.json();
    } catch (e) {
      console.error('语音合成响应解析失败:', e);
      return alert('响应解析失败');
    }

    if (!resp.ok || (json?.base_resp?.status_code && json.base_resp.status_code !== 0)) {
      const msg = json?.base_resp?.status_msg || `HTTP ${resp.status}`;
      console.error('语音合成失败:', json);
      return alert(`合成失败：${msg}`);
    }

    const hexAudio = json?.data?.audio;
    if (!hexAudio) return alert('合成成功但未返回音频数据');

    const bytes = this._hexToBytes(hexAudio);
    const mime = 'audio/mpeg';
    const blob = new Blob([bytes], { type: mime });
    const objectUrl = URL.createObjectURL(blob);

    if (audioEl) {
      audioEl.src = objectUrl;
      audioEl.style.display = 'block';
      try { await audioEl.play(); } catch (e) {}
    }
    this.showToast('合成完成');
  },

  /**
   * 美化页：组件编辑或单图标样式有未保存修改时确认是否放弃。
   * @returns {boolean} 是否允许继续后续操作
   */
  _confirmBeautifyUnsavedOrContinue(message) {
    const msg =
      message ||
      '当前编辑内容未保存，确定要继续吗？';
    if (!this._beautifyWidgetDirty && !this._beautifyIconDirty) return true;
    const ok = confirm(msg);
    if (ok) {
      this._beautifyWidgetDirty = false;
      this._beautifyIconDirty = false;
    }
    return ok;
  },

  /**
   * 缩小桌面图标用图尺寸并转 JPEG，减少 icon_styles 体积（避免各浏览器 localStorage 配额差异）。
   */
  async _downscaleIconDataUrl(dataUrl, maxEdge = 256, quality = 0.88) {
    const s = String(dataUrl || '').trim();
    if (!s || !/^data:image\//i.test(s)) return s;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve(s);
            return;
          }
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          const cw = Math.max(1, Math.round(w * scale));
          const ch = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(s);
            return;
          }
          ctx.drawImage(img, 0, 0, cw, ch);
          const out = canvas.toDataURL('image/jpeg', quality);
          resolve(out && out.length < s.length ? out : s);
        } catch (e) {
          resolve(s);
        }
      };
      img.onerror = () => resolve(s);
      img.src = s;
    });
  },

  // ===== 美化设置：桌面布局预览 + 组件资源编辑 =====
  initBeautifySettings() {
    if (this._beautifyInited) {
      this._beautifySelectedPage = this._beautifySelectedPage ?? 0;
      this.renderBeautifyLayout(this._beautifySelectedPage);
      this.loadBeautifyPresets();
      // 更新全局图标设置控件（切换预设后需要同步显示）
      this._refreshGlobalIconSettingsUI?.();
       // 若有待打开的组件，优先打开其编辑面板
       if (this._pendingOpenWidgetId) {
         this.openWidgetEditorById(this._pendingOpenWidgetId);
         this._pendingOpenWidgetId = null;
       }
      return;
    }
    this._beautifyInited = true;
    this._beautifySelectedPage = 0;
    this._beautifySelectedTile = null;

    // 初始化全局图标设置（背景渐变 / 图标颜色 / 透明度）
    this._initGlobalIconSettingsUI?.();

    const tabs = document.getElementById('beautify-layout-tabs');
    if (tabs) {
      tabs.querySelectorAll('.yd-beautify-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!this._confirmBeautifyUnsavedOrContinue('当前编辑内容未保存，确定要切换桌面屏幕吗？')) {
            return;
          }
          const page = parseInt(btn.getAttribute('data-page') || '0', 10) || 0;
          this._beautifySelectedPage = page;
          tabs.querySelectorAll('.yd-beautify-tab').forEach(b => {
            b.classList.toggle('yd-beautify-tab--active', b === btn);
          });
          this.renderBeautifyLayout(page);
        });
      });
    }

    // 初始化预设主题功能
    this.initBeautifyPresets();

    // 桌面布局清空按钮
    const layoutResetBtn = document.getElementById('beautify-layout-reset');
    if (layoutResetBtn) {
      layoutResetBtn.addEventListener('click', () => {
        if (confirm('确定要清空桌面吗？这将删除所有组件和图标，桌面将变成完全空白。')) {
          this.resetLayoutToDefault();
        }
      });
    }

    this.renderBeautifyLayout(this._beautifySelectedPage);
    // 首次进入也处理待打开组件
    if (this._pendingOpenWidgetId) {
      this.openWidgetEditorById(this._pendingOpenWidgetId);
      this._pendingOpenWidgetId = null;
    }
  },

  _getGlobalIconStyle() {
    try {
      const iconStyles = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
      return iconStyles && iconStyles.__global__ && typeof iconStyles.__global__ === 'object' ? iconStyles.__global__ : null;
    } catch (e) {
      return null;
    }
  },

  _refreshGlobalIconSettingsUI() {
    const bgStartEl = document.getElementById('beautify-icon-global-bg-start');
    const bgEndEl = document.getElementById('beautify-icon-global-bg-end');
    const fgEl = document.getElementById('beautify-icon-global-fg');
    const labelEl = document.getElementById('beautify-icon-global-label');
    const opacityEl = document.getElementById('beautify-icon-global-opacity');
    if (!bgStartEl || !bgEndEl || !fgEl || !labelEl || !opacityEl) return;

    const globalStyle = this._getGlobalIconStyle() || {};
    const bgStart = globalStyle.bgStart || '#a8c5e6';
    const bgEnd = globalStyle.bgEnd || '#b8d4f1';
    const fgColor = globalStyle.fgColor || '#ffffff';
    const labelColor = globalStyle.labelColor || '#000000';
    const opacity = (typeof globalStyle.opacity === 'number') ? globalStyle.opacity : 1;

    bgStartEl.value = bgStart;
    bgEndEl.value = bgEnd;
    fgEl.value = fgColor;
    labelEl.value = labelColor;
    opacityEl.value = String(opacity);
  },

  _initGlobalIconSettingsUI() {
    const saveBtn = document.getElementById('beautify-save-global-icon-style-btn');
    if (!saveBtn) return;

    // 避免重复绑定
    if (saveBtn.dataset.ydBound === '1') {
      this._refreshGlobalIconSettingsUI();
      return;
    }
    saveBtn.dataset.ydBound = '1';

    saveBtn.addEventListener('click', async () => {
      const bgStartEl = document.getElementById('beautify-icon-global-bg-start');
      const bgEndEl = document.getElementById('beautify-icon-global-bg-end');
      const fgEl = document.getElementById('beautify-icon-global-fg');
      const labelEl = document.getElementById('beautify-icon-global-label');
      const opacityEl = document.getElementById('beautify-icon-global-opacity');
      if (!bgStartEl || !bgEndEl || !fgEl || !labelEl || !opacityEl) return;

      const bgStart = bgStartEl.value || '#a8c5e6';
      const bgEnd = bgEndEl.value || '#b8d4f1';
      const fgColor = fgEl.value || '#ffffff';
      const labelColor = labelEl.value || '#000000';
      const opacity = parseFloat(opacityEl.value);

      const all = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
      all.__global__ = {
        bgStart,
        bgEnd,
        fgColor,
        labelColor,
        opacity: isNaN(opacity) ? 1 : opacity
      };
      Storage.set(CONFIG.STORAGE_KEYS.ICON_STYLES, all);

      // 刷新主屏预览
      if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen) {
        Homescreen.renderHomescreen();
      }
      if (typeof Homescreen !== 'undefined' && Homescreen.renderDock) {
        Homescreen.renderDock();
      }

      // 自动保存到当前预设
      if (this._autoSavePreset) {
        await this._autoSavePreset();
      }

      this.showToast?.('全局图标样式已保存');
    });

    this._refreshGlobalIconSettingsUI();
  },

  openWidgetEditorById(widgetId) {
    if (!widgetId) return;
    if (!this._confirmBeautifyUnsavedOrContinue('当前编辑内容未保存，确定要切换到该组件吗？')) {
      return;
    }
    this._beautifySelectedTile = {
      kind: 'widget',
      widgetId,
      label: widgetId,
      page: 0,
      row: 0,
      col: 0
    };
    this.renderBeautifyWidgetPanel();
  },

  // 初始化预设主题功能
  initBeautifyPresets() {
    // 加载预设列表
    this.loadBeautifyPresets();

    // 预设选择下拉框 - 切换预设时自动加载
    const presetSelect = document.getElementById('beautify-preset-select');
    if (presetSelect) {
      this._beautifyLastPresetId = presetSelect.value || '';
      presetSelect.addEventListener('change', async () => {
        const nextVal = presetSelect.value;
        if (!this._confirmBeautifyUnsavedOrContinue('当前编辑内容未保存，确定要切换预设吗？')) {
          presetSelect.value = this._beautifyLastPresetId;
          return;
        }
        this._beautifyLastPresetId = nextVal;
        if (nextVal) {
          await this.loadBeautifyPreset(nextVal);
        } else {
          await this.resetToDefault();
        }
      });
    }

    // 新增预设主题（移到顶部栏）
    const addBtn = document.getElementById('beautify-preset-add');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const name = prompt('请输入预设主题名称：');
        if (name && name.trim()) {
          await this.createBeautifyPresetFromDefault(name.trim());
        }
      });
    }

    // 删除预设主题
    const deleteBtn = document.getElementById('beautify-preset-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const presetSelect = document.getElementById('beautify-preset-select');
        const presetId = presetSelect ? presetSelect.value : '';
        if (!presetId) {
          alert('请先选择一个预设主题');
          return;
        }
        if (confirm('确定要删除这个预设主题吗？')) {
          this.deleteBeautifyPreset(presetId);
        }
      });
    }

    // 监听所有可能修改预设的操作，自动保存到当前预设
    this.setupAutoSavePreset();
  },

  // 设置自动保存预设功能
  setupAutoSavePreset() {
    // 当保存组件设置、图标样式等操作时，自动保存到当前预设
    const autoSave = async () => {
      const presetSelect = document.getElementById('beautify-preset-select');
      const presetId = presetSelect ? presetSelect.value : '';
      
      if (presetId) {
        // 如果当前选中了预设，自动保存（静默模式，不显示弹窗）
        const presets = Storage.get(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS) || {};
        const preset = presets[presetId];
        if (preset && preset.name) {
          await this.saveBeautifyPreset(preset.name, presetId, true);
        }
      }
    };

    // 将自动保存函数存储起来，供其他地方调用
    this._autoSavePreset = autoSave;
  },

  // 加载预设列表到下拉框
  loadBeautifyPresets() {
    const presetSelect = document.getElementById('beautify-preset-select');
    if (!presetSelect) return;

    const presets = Storage.get(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS) || {};
    const currentPresetId = Storage.get(CONFIG.STORAGE_KEYS.CURRENT_BEAUTIFY_PRESET) || '';

    // 清空下拉框（保留"默认"选项）
    presetSelect.innerHTML = '<option value="">默认</option>';

    // 添加所有预设
    Object.keys(presets).forEach(id => {
      const preset = presets[id];
      const option = document.createElement('option');
      option.value = id;
      option.textContent = preset.name || id;
      if (id === currentPresetId) {
        option.selected = true;
      }
      presetSelect.appendChild(option);
    });
    this._beautifyLastPresetId = presetSelect.value || '';
  },

  // 保存当前设置为预设主题（自动保存，不显示提示）
  async saveBeautifyPreset(name, existingPresetId = null, silent = false) {
    try {
      // 收集当前所有美化设置
      const iconStyles = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
      const widgetHtml = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HTML) || {};
      const wallpaper = Storage.get(CONFIG.STORAGE_KEYS.WALLPAPER) || '';

      // 获取组件资源（从IndexedDB）
      const widgetResources = await Storage.dbGetAll('widgetResources');

      // 创建或更新预设数据
      const presetId = existingPresetId || ('preset_' + Date.now());
      const presets = Storage.get(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS) || {};
      const existingPreset = presets[presetId];
      
      const preset = {
        id: presetId,
        name: name,
        createdAt: existingPreset ? existingPreset.createdAt : Date.now(),
        updatedAt: Date.now(),
        data: {
          iconStyles,
          widgetHtml,
          wallpaper,
          widgetResources: widgetResources || []
        }
      };

      // 保存到存储
      presets[presetId] = preset;
      Storage.set(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS, presets);

      // 更新下拉框
      this.loadBeautifyPresets();

      // 设置为当前预设
      Storage.set(CONFIG.STORAGE_KEYS.CURRENT_BEAUTIFY_PRESET, presetId);
      const presetSelect = document.getElementById('beautify-preset-select');
      if (presetSelect) {
        presetSelect.value = presetId;
      }

      if (!silent) {
        alert(existingPresetId ? '预设主题已更新' : '预设主题已保存');
      }
    } catch (e) {
      console.error('保存预设主题失败:', e);
      if (!silent) {
        alert('保存预设主题失败');
      }
    }
  },

  // 新建预设：从“默认样式”开始（不复制当前样式）
  async createBeautifyPresetFromDefault(name) {
    try {
      const presetId = 'preset_' + Date.now();
      const presets = Storage.get(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS) || {};

      presets[presetId] = {
        id: presetId,
        name: name || presetId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: {
          iconStyles: {},
          widgetHtml: {},
          wallpaper: '',
          widgetResources: []
        }
      };

      Storage.set(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS, presets);
      Storage.set(CONFIG.STORAGE_KEYS.CURRENT_BEAUTIFY_PRESET, presetId);

      // 立即应用“默认样式”到当前环境
      Storage.set(CONFIG.STORAGE_KEYS.ICON_STYLES, {});
      Storage.set(CONFIG.STORAGE_KEYS.WIDGET_HTML, {});
      Storage.set(CONFIG.STORAGE_KEYS.WALLPAPER, '');

      // 清空组件资源（避免沿用旧预设的上传资源）
      try {
        await Storage.dbClear('widgetResources');
      } catch (e) {
        console.error('清空组件资源失败:', e);
      }

      // 更新下拉框并选中当前预设
      this.loadBeautifyPresets();
      const presetSelect = document.getElementById('beautify-preset-select');
      if (presetSelect) presetSelect.value = presetId;

      // 刷新界面
      if (typeof Homescreen !== 'undefined') {
        if (Homescreen.loadAndSyncWidgets) {
          await Homescreen.loadAndSyncWidgets();
        }
        if (Homescreen.renderHomescreen) Homescreen.renderHomescreen();
        if (Homescreen.renderDock) Homescreen.renderDock();
        if (Homescreen.loadWallpaper) Homescreen.loadWallpaper();
      }

      this.renderBeautifyLayout(this._beautifySelectedPage || 0);
      this.renderBeautifyWidgetPanel();

      this._refreshGlobalIconSettingsUI?.();

      this.showToast('已新建空白预设');
    } catch (e) {
      console.error('新建空白预设失败:', e);
      alert('新建预设失败');
    }
  },

  // 加载预设主题
  async loadBeautifyPreset(presetId) {
    try {
      const presets = Storage.get(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS) || {};
      const preset = presets[presetId];
      if (!preset || !preset.data) {
        alert('预设主题不存在');
        return;
      }

      const data = preset.data;

      // 恢复设置（只恢复样式和内容，不恢复布局）
      Storage.set(CONFIG.STORAGE_KEYS.ICON_STYLES, data.iconStyles || {});
      Storage.set(CONFIG.STORAGE_KEYS.WIDGET_HTML, data.widgetHtml || {});
      Storage.set(CONFIG.STORAGE_KEYS.WALLPAPER, data.wallpaper || '');

      // 恢复组件资源到IndexedDB
      if (data.widgetResources && Array.isArray(data.widgetResources)) {
        // 先清空现有资源
        await Storage.dbClear('widgetResources');
        // 恢复资源
        for (const res of data.widgetResources) {
          await Storage.dbAdd('widgetResources', res);
        }
      }

      // 设置为当前预设
      Storage.set(CONFIG.STORAGE_KEYS.CURRENT_BEAUTIFY_PRESET, presetId);

      // 刷新界面
      if (typeof Homescreen !== 'undefined') {
        if (Homescreen.loadAndSyncWidgets) {
          await Homescreen.loadAndSyncWidgets();
        }
        if (Homescreen.renderHomescreen) {
          Homescreen.renderHomescreen();
        }
        if (Homescreen.renderDock) {
          Homescreen.renderDock();
        }
        if (Homescreen.loadWallpaper) {
          Homescreen.loadWallpaper();
        }
      }

      // 刷新美化设置页面
      this.renderBeautifyLayout(this._beautifySelectedPage || 0);
      this.renderBeautifyWidgetPanel();
      this._refreshGlobalIconSettingsUI?.();

      alert('预设主题已加载');
    } catch (e) {
      console.error('加载预设主题失败:', e);
      alert('加载预设主题失败');
    }
  },

  // 删除预设主题
  deleteBeautifyPreset(presetId) {
    try {
      const presets = Storage.get(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS) || {};
      if (!presets[presetId]) {
        alert('预设主题不存在');
        return;
      }

      delete presets[presetId];
      Storage.set(CONFIG.STORAGE_KEYS.BEAUTIFY_PRESETS, presets);

      // 如果删除的是当前预设，切换到默认
      const currentPresetId = Storage.get(CONFIG.STORAGE_KEYS.CURRENT_BEAUTIFY_PRESET) || '';
      if (currentPresetId === presetId) {
        Storage.set(CONFIG.STORAGE_KEYS.CURRENT_BEAUTIFY_PRESET, '');
        const presetSelect = document.getElementById('beautify-preset-select');
        if (presetSelect) {
          presetSelect.value = '';
        }
      }

      // 更新下拉框
      this.loadBeautifyPresets();

      alert('预设主题已删除');
    } catch (e) {
      console.error('删除预设主题失败:', e);
      alert('删除预设主题失败');
    }
  },

  // 重置为默认设置
  async resetToDefault() {
    try {
      // 清空所有自定义设置（只清空样式和内容，不清空布局）
      Storage.set(CONFIG.STORAGE_KEYS.ICON_STYLES, {});
      Storage.set(CONFIG.STORAGE_KEYS.WIDGET_HTML, {});
      Storage.set(CONFIG.STORAGE_KEYS.CURRENT_BEAUTIFY_PRESET, '');

      // 刷新界面
      if (typeof Homescreen !== 'undefined') {
        if (Homescreen.loadAndSyncWidgets) {
          await Homescreen.loadAndSyncWidgets();
        }
        if (Homescreen.renderHomescreen) {
          Homescreen.renderHomescreen();
        }
        if (Homescreen.renderDock) {
          Homescreen.renderDock();
        }
      }

      // 刷新美化设置页面
      this.renderBeautifyLayout(this._beautifySelectedPage || 0);
      this.renderBeautifyWidgetPanel();

      alert('已重置为默认设置');
    } catch (e) {
      console.error('重置失败:', e);
      alert('重置失败');
    }
  },

  // 清空桌面布局（清空所有组件和图标）
  async resetLayoutToDefault() {
    try {
      // 清空图标顺序（让主屏幕变成空白）
      Storage.set(CONFIG.STORAGE_KEYS.ICON_ORDER, []);
      State.icons = [];

      // 清除选中状态
      this._beautifySelectedTile = null;

      // 刷新界面
      if (typeof Homescreen !== 'undefined') {
        if (Homescreen.loadAndSyncWidgets) {
          await Homescreen.loadAndSyncWidgets();
        }
        if (Homescreen.renderHomescreen) {
          Homescreen.renderHomescreen();
        }
      }

      // 刷新美化设置页面
      this.renderBeautifyLayout(this._beautifySelectedPage || 0);
      this.renderBeautifyWidgetPanel();

      // 自动保存到当前预设
      if (this._autoSavePreset) {
        await this._autoSavePreset();
      }

      alert('桌面已清空');
    } catch (e) {
      console.error('清空桌面失败:', e);
      alert('清空桌面失败');
    }
  },

  // 应用当前预设（应用到主屏幕）
  async applyCurrentPreset() {
    try {
      const presetSelect = document.getElementById('beautify-preset-select');
      const presetId = presetSelect ? presetSelect.value : '';
      
      if (presetId) {
        // 如果有选中的预设，加载它
        await this.loadBeautifyPreset(presetId);
      } else {
        // 否则应用当前设置（已经是当前状态，只需要刷新）
        if (typeof Homescreen !== 'undefined') {
          if (Homescreen.loadAndSyncWidgets) {
            await Homescreen.loadAndSyncWidgets();
          }
          if (Homescreen.renderHomescreen) {
            Homescreen.renderHomescreen();
          }
          if (Homescreen.renderDock) {
            Homescreen.renderDock();
          }
        }
      }

      alert('预设已应用到主屏幕');
    } catch (e) {
      console.error('应用预设失败:', e);
      alert('应用预设失败');
    }
  },

  // 渲染桌面布局预览网格
  renderBeautifyLayout(pageIndex) {
    const grid = document.getElementById('beautify-grid');
    if (!grid || typeof Homescreen === 'undefined') return;

    const cols = CONFIG.GRID_COLS || 4;
    const rows = 7; // 预览固定为 4×7
    const tiles = Homescreen.buildTiles(rows);
    const layout = Homescreen.computeLayout(tiles, cols, rows);
    const placements = (layout && layout.placements) ? layout.placements.filter(p => p.page === pageIndex) : [];

    grid.innerHTML = '';
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(rows));

    // 先画出占位格，让用户直观看到容量
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'yd-beautify-grid-cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        // 空白格不可点击（固定布局模式）
        // 不添加点击事件

        grid.appendChild(cell);
      }
    }

    const nameMap = {
      'widget-time-date': '时间日期',
      'widget-player': '播放器',
      'widget-note': '相片',
      'widget-profile-card': '头像卡片'
    };

    // 读取用户自定义组件名称（若有）
    let widgetLabelMap = {};
    try {
      const layoutMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT) || {};
      widgetLabelMap = Object.keys(layoutMap || {}).reduce((acc, id) => {
        const cfg = layoutMap && layoutMap[id];
        if (cfg && typeof cfg.label === 'string' && cfg.label.trim()) {
          acc[id] = cfg.label.trim();
        }
        return acc;
      }, {});
    } catch (e) {
      console.error('读取组件名称失败:', e);
    }

    // 再叠加组件/图标块
    placements.forEach((p) => {
      const tile = document.createElement('div');
      const isWidget = p.kind === 'widget';
      tile.className = 'yd-beautify-grid-tile' + (isWidget ? ' yd-beautify-grid-tile--widget' : '');
      tile.style.gridColumn = `${p.col + 1} / span ${p.w}`;
      tile.style.gridRow = `${p.row + 1} / span ${p.h}`;

      let label = '';
      let widgetId = null;
      if (isWidget) {
        widgetId = p.id;
        label = widgetLabelMap[p.id] || nameMap[p.id] || p.id;
      } else if (p.kind === 'icon' && p.icon) {
        label = p.icon.label || '图标';
      } else {
        label = p.id || '块';
      }

      tile.textContent = label;
      tile.dataset.kind = p.kind;
      if (widgetId) tile.dataset.widgetId = widgetId;

      tile.addEventListener('click', () => {
        if (!this._confirmBeautifyUnsavedOrContinue('当前编辑内容未保存，确定要切换到其他块吗？')) {
          return;
        }

        // 高亮当前选中块
        grid.querySelectorAll('.yd-beautify-grid-tile').forEach((el) => {
          el.classList.toggle('yd-beautify-grid-tile--selected', el === tile);
        });
        this._beautifySelectedTile = {
          label,
          kind: p.kind,
          widgetId: widgetId,
          icon: p.icon || null,
          page: pageIndex,
          row: p.row,
          col: p.col,
          w: p.w,
          h: p.h,
          iconIndex: typeof p.index === 'number' ? p.index : null
        };
        this.renderBeautifyWidgetPanel();
      });

      grid.appendChild(tile);
    });
  },

  // 在网格中显示组件占位预览
  showWidgetPlaceholder(w, h) {
    const grid = document.getElementById('beautify-grid');
    if (!grid) return;
    
    // 清除之前的占位预览
    const existingPlaceholder = grid.querySelector('.yd-beautify-grid-placeholder');
    if (existingPlaceholder) {
      existingPlaceholder.remove();
    }
    
    // 获取选中的空白格（作为起始位置）
    const selectedCell = grid.querySelector('.yd-beautify-grid-cell--selected');
    if (!selectedCell) {
      return; // 没有选中空白格，不显示占位
    }
    
    const startRow = parseInt(selectedCell.dataset.row || '0', 10);
    const startCol = parseInt(selectedCell.dataset.col || '0', 10);
    const cols = CONFIG.GRID_COLS || 4;
    const rows = 7;
    
    // 计算所需区域
    const endRow = startRow + h - 1;
    const endCol = startCol + w - 1;
    
    // 验证是否超出边界
    if (endRow >= rows || endCol >= cols) {
      // 显示错误提示
      const hintEl = document.getElementById('beautify-empty-hint');
      if (hintEl) {
        hintEl.textContent = `⚠️ 组件尺寸为 ${w}×${h}，从位置 (${startRow + 1}, ${startCol + 1}) 开始会超出网格范围。请选择其他位置。`;
        hintEl.style.color = '#FF3B30';
      }
      return;
    }
    
    // 验证该区域是否被占用
    const tiles = Homescreen.buildTiles(rows);
    const layout = Homescreen.computeLayout(tiles, cols, rows);
    const currentPage = this._beautifySelectedPage || 0;
    const placements = (layout && layout.placements) ? layout.placements.filter(p => p.page === currentPage) : [];
    
    // 检查该区域是否与已有组件/图标重叠
    for (const p of placements) {
      const pEndRow = p.row + p.h - 1;
      const pEndCol = p.col + p.w - 1;
      
      // 检查是否有重叠
      if (!(endRow < p.row || startRow > pEndRow || endCol < p.col || startCol > pEndCol)) {
        // 显示错误提示
        const hintEl = document.getElementById('beautify-empty-hint');
        if (hintEl) {
          const occupiedLabel = p.kind === 'widget' ? (p.id || '组件') : (p.icon?.label || '图标');
          hintEl.textContent = `⚠️ 该位置已被占用。组件 "${occupiedLabel}" 占据了该区域。请选择其他位置。`;
          hintEl.style.color = '#FF3B30';
        }
        return;
      }
    }
    
    // 可以放置，显示占位预览
    const placeholder = document.createElement('div');
    placeholder.className = 'yd-beautify-grid-placeholder';
    placeholder.style.gridColumn = `${startCol + 1} / span ${w}`;
    placeholder.style.gridRow = `${startRow + 1} / span ${h}`;
    grid.appendChild(placeholder);
    
    // 更新提示为正常状态
    const hintEl = document.getElementById('beautify-empty-hint');
    if (hintEl) {
      hintEl.style.color = '#8E8E93';
    }
  },

  // 渲染下方组件资源编辑面板
  async renderBeautifyWidgetPanel() {
    const panel = document.getElementById('beautify-widget-panel');
    if (!panel) return;
    const sel = this._beautifySelectedTile;
    if (!sel) {
      this._beautifyWidgetDirty = false;
      this._beautifyIconDirty = false;
      panel.innerHTML = '<div class="yd-beautify-widget-empty">点击上方网格中的组件或图标，可以在这里编辑对应的内容。</div>';
      return;
    }

    const isWidget = sel.kind === 'widget' && sel.widgetId;
    const isIcon = sel.kind === 'icon' && sel.icon;

    // 空白格：不支持新增，提示用户点击已有的组件或图标
    if (sel.kind === 'empty') {
      panel.innerHTML = `
        <div class="yd-beautify-widget-title">空白位置</div>
        <div class="yd-beautify-widget-meta">
          第 ${sel.page + 1} 屏 · 行 ${sel.row + 1} · 列 ${sel.col + 1}
        </div>
        <div class="yd-beautify-hint" style="padding: 20px; text-align: center; color: #8E8E93;">
          当前布局为固定布局，不支持自定义位置。<br>
          请点击已有的组件或图标进行编辑。
        </div>
      `;
      return;
    }

    // 图标：展示图标名称、预览，并支持更换样式（名称 / 背景渐变 / 透明度 / 上传图片）
    if (isIcon) {
      const icon = sel.icon || {};
      const iconStyles = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
      const globalStyle = iconStyles && iconStyles.__global__ && typeof iconStyles.__global__ === 'object' ? iconStyles.__global__ : {};
      const currentStyle = icon && icon.id && iconStyles[icon.id] ? iconStyles[icon.id] : {};
      const defaultBgStart = currentStyle.bgStart || globalStyle.bgStart || '#a8c5e6';
      const defaultBgEnd = currentStyle.bgEnd || globalStyle.bgEnd || '#b8d4f1';
      const defaultOpacity = (typeof currentStyle.opacity === 'number') ? currentStyle.opacity : (typeof globalStyle.opacity === 'number' ? globalStyle.opacity : 1);
      const defaultFgColor = currentStyle.fgColor || globalStyle.fgColor || '#ffffff';
      const defaultLabelColor = globalStyle.labelColor || '#000000';
      const defaultName = sel.label || icon.label || '';
      const defaultImageData = currentStyle.imageData || '';

      let iconVisual = '';
      if (icon.type === 'svg' && icon.svg) {
        iconVisual = icon.svg;
      } else if (icon.type === 'emoji' && icon.emoji) {
        iconVisual = `<span class="yd-beautify-icon-emoji">${icon.emoji}</span>`;
      } else if (icon.type === 'image' && icon.image) {
        iconVisual = `<img src="${icon.image}" alt="${icon.label || icon.id || '图标'}">`;
      } else if (icon.emoji) {
        iconVisual = `<span class="yd-beautify-icon-emoji">${icon.emoji}</span>`;
      }

      panel.innerHTML = `
        <div class="yd-beautify-widget-title-row">
          <div class="yd-beautify-widget-title">${sel.label}</div>
          <div class="yd-beautify-icon-toolbar">
            <button type="button" class="yd-btn yd-btn--text" id="beautify-delete-icon-btn">删除</button>
            <button type="button" class="yd-btn yd-btn--text" id="beautify-reset-icon-style-btn">恢复默认</button>
          </div>
        </div>

        <div class="yd-beautify-icon-header">
          <div class="yd-beautify-icon-preview">
            <div class="yd-beautify-icon-preview-inner">
              ${iconVisual || '<span class="yd-beautify-icon-placeholder">?</span>'}
            </div>
          </div>
          <div class="yd-beautify-icon-main">
            <div class="yd-beautify-field-label">图标名称（颜色跟随全局「字体颜色」）</div>
            <div id="beautify-icon-name" style="font-size:14px;font-weight:500;line-height:1.4;color:${defaultLabelColor};">${defaultName}</div>
            <div class="yd-beautify-widget-meta">
              图标 ID：${icon.id || '未知'} · 类型：${icon.type || '默认'} · 跳转页面：${icon.page || '无'}
            </div>
          </div>
        </div>

        <div class="yd-beautify-field-label">背景渐变</div>
        <div class="yd-beautify-icon-style-row">
          <input type="color" id="beautify-icon-bg-start" value="${defaultBgStart}">
          <span style="font-size:12px;">→</span>
          <input type="color" id="beautify-icon-bg-end" value="${defaultBgEnd}">
        </div>

        <div class="yd-beautify-field-label">图标图案颜色</div>
        <div class="yd-beautify-icon-style-row">
          <input type="color" id="beautify-icon-fg" value="${defaultFgColor}">
        </div>

        <div class="yd-beautify-field-label">透明度</div>
        <div class="yd-beautify-icon-style-row">
          <input type="range" id="beautify-icon-opacity" min="0.3" max="1" step="0.05" value="${defaultOpacity}">
        </div>

        <div class="yd-beautify-field-label">图标图片（可选）</div>
        <div class="yd-beautify-icon-style-row yd-beautify-icon-upload-row">
          <button type="button" class="yd-btn yd-btn--secondary" id="beautify-icon-upload-btn">
            <span class="yd-beautify-upload-icon" aria-hidden="true"></span>
            <span>上传图片作为图标</span>
          </button>
          <input type="file" id="beautify-icon-upload-input" accept="image/png,image/jpeg,image/webp" style="display:none" aria-hidden="true">
        </div>

        <div class="yd-beautify-actions">
          <button type="button" class="yd-btn yd-btn--primary-full" id="beautify-save-icon-style-btn">保存样式</button>
        </div>
      `;

      const saveBtn = document.getElementById('beautify-save-icon-style-btn');
      const resetBtn = document.getElementById('beautify-reset-icon-style-btn');
      const deleteBtn = document.getElementById('beautify-delete-icon-btn');
      const uploadBtn = document.getElementById('beautify-icon-upload-btn');
      const uploadInput = document.getElementById('beautify-icon-upload-input');
      const nameInput = document.getElementById('beautify-icon-name');
      const previewInner = panel.querySelector('.yd-beautify-icon-preview-inner');
      let pendingImageData = defaultImageData;

      const markIconDirty = () => {
        this._beautifyIconDirty = true;
      };

      const bgStartEl = document.getElementById('beautify-icon-bg-start');
      const bgEndEl = document.getElementById('beautify-icon-bg-end');
      const opacityEl = document.getElementById('beautify-icon-opacity');
      const fgEl = document.getElementById('beautify-icon-fg');

      function updatePreviewStyles() {
        if (!previewInner) return;
        const bgStart = bgStartEl ? bgStartEl.value : defaultBgStart;
        const bgEnd = bgEndEl ? bgEndEl.value : defaultBgEnd;
        const opacity = opacityEl ? parseFloat(opacityEl.value) : defaultOpacity;
        previewInner.style.background = `linear-gradient(135deg, ${bgStart} 0%, ${bgEnd} 100%)`;
        if (!isNaN(opacity)) {
          previewInner.style.opacity = String(opacity);
        }
        const fg = fgEl ? fgEl.value : defaultFgColor;
        if (fg) {
          previewInner.style.color = fg;
        }
      }

      // 如果已有自定义图片，优先显示
      if (pendingImageData && previewInner) {
        previewInner.innerHTML = '';
        const img = document.createElement('img');
        img.src = pendingImageData;
        img.alt = defaultName || icon.label || icon.id || '图标';
        previewInner.appendChild(img);
      }

      // 初始化预览背景/透明度
      updatePreviewStyles();

      if (bgStartEl) {
        bgStartEl.addEventListener('input', () => {
          updatePreviewStyles();
          markIconDirty();
        });
      }
      if (bgEndEl) {
        bgEndEl.addEventListener('input', () => {
          updatePreviewStyles();
          markIconDirty();
        });
      }
      if (opacityEl) {
        opacityEl.addEventListener('input', () => {
          updatePreviewStyles();
          markIconDirty();
        });
      }
      if (fgEl) {
        fgEl.addEventListener('input', () => {
          updatePreviewStyles();
          markIconDirty();
        });
      }

      if (uploadBtn && uploadInput) {
        uploadBtn.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            let data = reader.result;
            try {
              data = await this._downscaleIconDataUrl(data);
            } catch (err) {}
            pendingImageData = data;
            markIconDirty();
            if (previewInner) {
              previewInner.innerHTML = '';
              const img = document.createElement('img');
              img.src = pendingImageData;
              img.alt = (nameInput && nameInput.textContent) || icon.label || icon.id || '图标';
              previewInner.appendChild(img);
            }
          };
          reader.readAsDataURL(file);
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const bgStartEl = document.getElementById('beautify-icon-bg-start');
          const bgEndEl = document.getElementById('beautify-icon-bg-end');
          const opacityEl = document.getElementById('beautify-icon-opacity');

          const bgStart = bgStartEl ? bgStartEl.value : defaultBgStart;
          const bgEnd = bgEndEl ? bgEndEl.value : defaultBgEnd;
          const opacity = opacityEl ? parseFloat(opacityEl.value) : defaultOpacity;
          const fgColor = fgEl ? fgEl.value : defaultFgColor;

          const all = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
          if (icon && icon.id) {
            all[icon.id] = {
              bgStart,
              bgEnd,
              opacity: isNaN(opacity) ? 1 : opacity,
              fgColor,
              imageData: pendingImageData || undefined
            };
            Storage.set(CONFIG.STORAGE_KEYS.ICON_STYLES, all);
          }

          if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen && Homescreen.renderDock) {
            Homescreen.renderHomescreen();
            Homescreen.renderDock();
          }
          
          // 自动保存到当前预设
          if (this._autoSavePreset) {
            await this._autoSavePreset();
          }
          
          // 使用顶部 toast，而不是阻塞式弹窗
          if (Settings && Settings.showToast) {
            Settings.showToast('图标样式已保存');
          }
          this._beautifyIconDirty = false;
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const all = Storage.get(CONFIG.STORAGE_KEYS.ICON_STYLES) || {};
          if (icon && icon.id && all[icon.id]) {
            delete all[icon.id];
            Storage.set(CONFIG.STORAGE_KEYS.ICON_STYLES, all);
          }
          if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen && Homescreen.renderDock) {
            Homescreen.renderHomescreen();
            Homescreen.renderDock();
          }
          this._beautifyIconDirty = false;
          this.renderBeautifyWidgetPanel();
        });
      }

      // 删除当前格子上的图标（从主屏隐藏此实例）
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (!this._confirmBeautifyUnsavedOrContinue('当前编辑内容未保存，确定要继续吗？')) {
            return;
          }
          const idx = typeof sel.iconIndex === 'number' ? sel.iconIndex : -1;
          if (idx < 0) {
            alert('无法确定要删除的图标位置');
            return;
          }
          if (!confirm('确定从主屏隐藏这个图标吗？')) return;
          try {
            const icons = Array.isArray(State.icons) ? State.icons.slice() : [];
            if (idx >= 0 && idx < icons.length) {
              icons.splice(idx, 1);
              State.icons = icons;
              Storage.set(CONFIG.STORAGE_KEYS.ICON_ORDER, icons);
              if (typeof Homescreen !== 'undefined' && Homescreen.renderHomescreen && Homescreen.renderDock) {
                Homescreen.renderHomescreen();
                Homescreen.renderDock();
              }
              // 删除后刷新预览布局与下方面板
              this._beautifyIconDirty = false;
              this._beautifyWidgetDirty = false;
              this.renderBeautifyLayout(this._beautifySelectedPage || 0);
              this._beautifySelectedTile = null;
              this.renderBeautifyWidgetPanel();
            } else {
              alert('图标索引超出范围，删除失败');
            }
          } catch (e) {
            console.error('删除图标失败:', e);
            alert('删除图标失败');
          }
        });
      }

      return;
    }

    if (!isWidget) {
      panel.innerHTML = `
        <div class="yd-beautify-widget-title">${sel.label}</div>
        <div class="yd-beautify-widget-meta">当前仅对组件开放内容编辑。</div>
      `;
      return;
    }

    const widgetId = sel.widgetId;
    const resourcesAll = await Storage.dbGetAll('widgetResources');
    const resources = (resourcesAll || []).filter(r => r && r.widgetId === widgetId);
    const textResources = resources.filter(r => r.kind === 'text');
    const imageResources = resources.filter(r => r.kind === 'image');

    // 读取组件尺寸与自定义 HTML
    let currentW = sel.w || 1;
    let currentH = sel.h || 1;
    let widgetLabel = sel.label || widgetId;
    try {
      const layoutMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT) || {};
      const layoutCfg = layoutMap && layoutMap[widgetId];
      if (layoutCfg && typeof layoutCfg.label === 'string' && layoutCfg.label.trim()) {
        widgetLabel = layoutCfg.label.trim();
      }
      if (layoutCfg && layoutCfg.w && layoutCfg.h) {
        currentW = layoutCfg.w;
        currentH = layoutCfg.h;
      }
    } catch (e) {
      console.error('读取组件布局失败:', e);
    }

    let customHtml = '';
    try {
      const htmlMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HTML) || {};
      if (htmlMap && htmlMap[widgetId]) {
        customHtml = htmlMap[widgetId];
      }
    } catch (e) {
      console.error('读取组件HTML失败:', e);
    }

    // 默认（原始）组件 HTML：用于查看/复制，不受自定义 HTML 覆盖影响
    let defaultHtml = '';
    try {
      if (widgetId === 'widget-time-date' && Homescreen.getTimeDateWidgetSrcDoc) {
        defaultHtml = Homescreen.getTimeDateWidgetSrcDoc();
      } else if (widgetId === 'widget-player' && Homescreen.getPlayerWidgetSrcDoc) {
        defaultHtml = Homescreen.getPlayerWidgetSrcDoc();
      } else if (widgetId === 'widget-note' && Homescreen.getNoteWidgetSrcDoc) {
        defaultHtml = Homescreen.getNoteWidgetSrcDoc();
      } else if (widgetId === 'widget-profile-card' && Homescreen.getHotnewsWidgetSrcDoc) {
        defaultHtml = Homescreen.getHotnewsWidgetSrcDoc();
      } else if (Homescreen.getDemoWidgetSrcDoc) {
        defaultHtml = Homescreen.getDemoWidgetSrcDoc(widgetId);
      }
    } catch (e) {
      console.error('读取默认组件HTML失败:', e);
    }

    const isTimeDate = widgetId === 'widget-time-date';

    let textareaLabel = '文本内容';
    let textareaHint = '一行代表一条内容。';
    if (widgetId === 'widget-player') {
      textareaLabel = '播放列表';
      textareaHint = '一行一首歌，格式示例：歌曲标题｜歌手名称。';
    } else if (widgetId === 'widget-profile-card') {
      textareaLabel = '头像卡片文案';
      textareaHint = '一行一条文案，按顺序展示。';
    } else if (widgetId === 'widget-note') {
      textareaLabel = '相片内容';
      textareaHint = '单条相片文本，可多行。';
    }

    let textValue = '';
    if (widgetId === 'widget-player') {
      textValue = textResources.map(r => {
        const t = (r.text || '').trim();
        const slot = (r.slot || '').trim();
        return slot ? `${t}｜${slot}` : t;
      }).join('\n');
    } else if (widgetId === 'widget-profile-card') {
      textValue = textResources.map(r => (r.text || '').trim()).join('\n');
    } else if (widgetId === 'widget-note') {
      textValue = textResources.length ? (textResources[0].text || '') : '';
    } else {
      textValue = textResources.map(r => (r.text || '').trim()).join('\n');
    }

    panel.innerHTML = `
      <div class="yd-beautify-field-label">组件名称</div>
      <input type="text" class="yd-settings-input" id="beautify-widget-name" value="${widgetLabel || ''}" placeholder="请输入组件名称">

      <div class="yd-beautify-widget-meta">组件尺寸：${currentW}×${currentH}</div>

      ${isTimeDate ? '' : `
        <div class="yd-beautify-field-label">${textareaLabel}</div>
        <textarea class="yd-beautify-textarea" id="beautify-widget-text">${textValue || ''}</textarea>
        <div class="yd-beautify-hint">${textareaHint}</div>

        <div class="yd-beautify-field-label">图片资源（可选）</div>
        <div class="yd-beautify-actions">
          <button type="button" class="yd-btn yd-btn--secondary" id="beautify-upload-image-btn">添加图片</button>
        </div>
        <input type="file" id="beautify-upload-image-input" accept="image/png,image/jpeg,image/webp" style="display:none" aria-hidden="true">
        <div class="yd-beautify-upload-list" id="beautify-upload-list"></div>
      `}

      <textarea class="yd-beautify-textarea" id="beautify-widget-html" rows="12" placeholder="留空则使用默认组件 HTML 模板">${customHtml || ''}</textarea>
      <div class="yd-beautify-actions">
        <button type="button" class="yd-btn yd-btn--secondary" id="beautify-export-default-html-btn">模板导出</button>
        <button type="button" class="yd-btn yd-btn--secondary" id="beautify-save-widget-btn">保存</button>
      </div>
    `;

    // 渲染已存在的图片缩略图
    const listEl = document.getElementById('beautify-upload-list');
    if (!isTimeDate && listEl && imageResources.length) {
      const albumAll = await Storage.dbGetAll('album');
      const albumMap = {};
      (albumAll || []).forEach((pic) => {
        if (pic && pic.id) albumMap[pic.id] = pic;
      });
      imageResources.forEach((res) => {
        const pic = res.albumId ? albumMap[res.albumId] : null;
        if (!pic || !pic.data) return;
        const thumb = document.createElement('div');
        thumb.className = 'yd-beautify-upload-thumb';
        thumb.style.backgroundImage = `url(${pic.data})`;
        listEl.appendChild(thumb);
      });
    }

    // 绑定保存按钮
    const saveBtn = document.getElementById('beautify-save-widget-btn');
    const exportDefaultBtn = document.getElementById('beautify-export-default-html-btn');
    const nameEl = document.getElementById('beautify-widget-name');
    const htmlEl = document.getElementById('beautify-widget-html');

    // 为了避免 innerHTML 注入导致的边界问题，确保 textarea 的值以 property 写入
    try {
      if (htmlEl && typeof customHtml === 'string' && customHtml) {
        htmlEl.value = customHtml;
      }
    } catch (e) {
      console.error('写入组件HTML到文本框失败:', e);
    }

    // 未保存修改标记
    const markDirty = () => {
      this._beautifyWidgetDirty = true;
    };
    if (nameEl) nameEl.addEventListener('input', markDirty);
    const textElMaybe = document.getElementById('beautify-widget-text');
    if (textElMaybe) textElMaybe.addEventListener('input', markDirty);
    if (htmlEl) htmlEl.addEventListener('input', markDirty);

    // 模板导出（导出默认模板）
    if (exportDefaultBtn) {
      exportDefaultBtn.addEventListener('click', () => {
        if (!defaultHtml || !defaultHtml.trim()) {
          alert('该组件没有可导出的默认模板');
          return;
        }
        (async () => {
          try {
            const blob = new Blob([defaultHtml], { type: 'text/html;charset=utf-8' });
            await Storage.downloadBlobWithWait(blob, `${widgetId}_template.html`, '正在导出模板…');
          } catch (e) {
            console.error('导出模板失败:', e);
            alert('导出失败');
          }
        })();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        // 保存组件名称（可改）
        try {
          const layoutMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT) || {};
          const cfg = (layoutMap && layoutMap[widgetId] && typeof layoutMap[widgetId] === 'object') ? layoutMap[widgetId] : {};
          const nextLabel = nameEl && nameEl.value != null ? String(nameEl.value).trim() : '';
          layoutMap[widgetId] = { ...(cfg || {}), label: nextLabel || undefined };
          Storage.set(CONFIG.STORAGE_KEYS.WIDGET_LAYOUT, layoutMap);
        } catch (e) {
          console.error('保存组件名称失败:', e);
        }

        // 时间日期组件：不需要文本/图片资源
        if (!isTimeDate) {
          const textEl = document.getElementById('beautify-widget-text');
          const raw = (textEl && textEl.value != null) ? String(textEl.value) : '';
          const lines = raw.split(/\r?\n/);

          // 先删除旧的文本资源
          for (const r of textResources) {
            await Storage.dbDelete('widgetResources', r.id);
          }

          const now = Date.now();
          if (widgetId === 'widget-player') {
            lines.forEach((line, idx) => {
              const t = line.trim();
              if (!t) return;
              const parts = t.split(/[\-|｜—]/);
              const title = (parts[0] || '').trim();
              const artist = (parts[1] || '').trim();
              const rec = {
                id: State.generateId(),
                widgetId,
                kind: 'text',
                text: title,
                slot: artist,
                order: idx,
                createdAt: now + idx
              };
              Storage.dbAdd('widgetResources', rec);
            });
          } else if (widgetId === 'widget-profile-card') {
            lines.forEach((line, idx) => {
              const t = line.trim();
              if (!t) return;
              const rec = {
                id: State.generateId(),
                widgetId,
                kind: 'text',
                text: t,
                order: idx,
                createdAt: now + idx
              };
              Storage.dbAdd('widgetResources', rec);
            });
          } else if (widgetId === 'widget-note') {
            const t = raw.trim();
            if (t) {
              const rec = {
                id: State.generateId(),
                widgetId,
                kind: 'text',
                text: t,
                order: 0,
                createdAt: now
              };
              await Storage.dbAdd('widgetResources', rec);
            }
          } else {
            lines.forEach((line, idx) => {
              const t = line.trim();
              if (!t) return;
              const rec = {
                id: State.generateId(),
                widgetId,
                kind: 'text',
                text: t,
                order: idx,
                createdAt: now + idx
              };
              Storage.dbAdd('widgetResources', rec);
            });
          }
        }

        // 保存自定义 HTML
        try {
          const htmlMap = Storage.get(CONFIG.STORAGE_KEYS.WIDGET_HTML) || {};
          const htmlContent = htmlEl && htmlEl.value ? String(htmlEl.value) : '';
          if (htmlContent.trim()) {
            htmlMap[widgetId] = htmlContent;
          } else if (htmlMap[widgetId]) {
            delete htmlMap[widgetId];
          }
          Storage.set(CONFIG.STORAGE_KEYS.WIDGET_HTML, htmlMap);
        } catch (e) {
          console.error('保存组件HTML失败:', e);
        }

        // 更新主屏组件内容
        if (Homescreen && Homescreen.loadAndSyncWidgets) {
          Homescreen.loadAndSyncWidgets();
          Homescreen.renderHomescreen();
        }
        
        // 自动保存到当前预设
        if (this._autoSavePreset) {
          await this._autoSavePreset();
        }

        this._beautifyWidgetDirty = false;

        // 刷新预览网格名称
        this.renderBeautifyLayout(this._beautifySelectedPage || 0);
        this.showToast('已保存');
      });
    }

    // 绑定上传图片按钮
    const uploadBtn = document.getElementById('beautify-upload-image-btn');
    const uploadInput = document.getElementById('beautify-upload-image-input');
    if (uploadBtn && uploadInput) {
      uploadBtn.addEventListener('click', () => uploadInput.click());
      uploadInput.addEventListener('change', async (e) => {
        this._beautifyWidgetDirty = true;
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const data = reader.result;
            const albumItem = {
              id: State.generateId(),
              data,
              name: file.name || '组件图片',
              createdAt: Date.now()
            };
            await Storage.dbAdd('album', albumItem);
            const res = {
              id: State.generateId(),
              widgetId,
              kind: 'image',
              albumId: albumItem.id,
              createdAt: Date.now()
            };
            await Storage.dbAdd('widgetResources', res);
            if (Homescreen && Homescreen.loadAndSyncWidgets) {
              Homescreen.loadAndSyncWidgets();
            }
            this.renderBeautifyWidgetPanel();
          } catch (err) {
            console.error('上传组件图片失败:', err);
            alert('上传失败');
          } finally {
            uploadInput.value = '';
          }
        };
        reader.readAsDataURL(file);
      });
    }
  },

  async clearCache() {
    if (!confirm('确定要清空数据吗？这将清除所有数据。')) return;

    try {
      await Storage.dbClear('sessions');
      await Storage.dbClear('messages');

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      alert('数据已清空');
      await Chat.loadSessions();
    } catch (err) {
      console.error('清空数据失败:', err);
      alert('清空数据失败');
    }
  },

  async collectStorageHealthSnapshot() {
    const out = {
      dbReady: !!(Storage && Storage.db),
      stores: {
        sessions: -1,
        messages: -1,
        kv: -1,
        characters: -1,
        album: -1,
        widgetResources: -1
      },
      worldbook: {
        globalKvExists: false,
        globalEntriesCount: 0,
        characterEntriesCount: 0
      },
      localStorage: {
        worldbookLegacyExists: false
      },
      errors: []
    };

    const countStore = async (storeName) => {
      try {
        const rows = await Storage.dbGetAll(storeName);
        return Array.isArray(rows) ? rows.length : 0;
      } catch (e) {
        out.errors.push(`${storeName}: ${String(e && e.message ? e.message : e)}`);
        return -1;
      }
    };

    if (!out.dbReady) {
      return out;
    }

    out.stores.sessions = await countStore('sessions');
    out.stores.messages = await countStore('messages');
    out.stores.kv = await countStore('kv');
    out.stores.characters = await countStore('characters');
    out.stores.album = await countStore('album');
    out.stores.widgetResources = await countStore('widgetResources');

    try {
      const key = CONFIG && CONFIG.STORAGE_KEYS
        ? CONFIG.STORAGE_KEYS.WORLDBOOK_GLOBAL_ENTRIES
        : 'worldbook_global_entries';
      const row = await Storage.kvGet(key);
      out.worldbook.globalKvExists = row != null;

      let globalEntries = [];
      if (Array.isArray(row)) globalEntries = row;
      else if (row && typeof row === 'object' && Array.isArray(row.entries)) globalEntries = row.entries;
      else if (row && typeof row === 'object' && row.character_book && Array.isArray(row.character_book.entries)) {
        globalEntries = row.character_book.entries;
      }
      out.worldbook.globalEntriesCount = Array.isArray(globalEntries) ? globalEntries.length : 0;
    } catch (e) {
      out.errors.push(`worldbook(kv): ${String(e && e.message ? e.message : e)}`);
    }

    try {
      const chars = await Storage.dbGetAll('characters');
      let count = 0;
      (Array.isArray(chars) ? chars : []).forEach((ch) => {
        const data = (ch && ch.data && typeof ch.data === 'object') ? ch.data : (ch || {});
        const book = data.character_book || ch.character_book || null;
        const entries = book && book.entries;
        if (Array.isArray(entries)) {
          count += entries.filter(Boolean).length;
        } else if (entries && typeof entries === 'object') {
          count += Object.values(entries).filter(Boolean).length;
        }
      });
      out.worldbook.characterEntriesCount = count;
    } catch (e) {
      out.errors.push(`worldbook(characters): ${String(e && e.message ? e.message : e)}`);
    }

    try {
      const key = CONFIG && CONFIG.STORAGE_KEYS
        ? CONFIG.STORAGE_KEYS.WORLDBOOK_GLOBAL_ENTRIES
        : 'worldbook_global_entries';
      out.localStorage.worldbookLegacyExists = !!localStorage.getItem(key);
    } catch (e) {
      out.errors.push(`localStorage(worldbook): ${String(e && e.message ? e.message : e)}`);
    }

    return out;
  },

  _formatStorageHealthMessage(snapshot) {
    const s = snapshot || {};
    const stores = s.stores || {};
    const wb = s.worldbook || {};
    const ls = s.localStorage || {};
    const errs = Array.isArray(s.errors) ? s.errors : [];

    const lines = [
      `DB可用: ${s.dbReady ? '是' : '否'}`,
      `sessions: ${stores.sessions}`,
      `messages: ${stores.messages}`,
      `kv: ${stores.kv}`,
      `characters: ${stores.characters}`,
      `album: ${stores.album}`,
      `widgetResources: ${stores.widgetResources}`,
      `世界书(全局kv存在): ${wb.globalKvExists ? '是' : '否'}`,
      `世界书(全局条目): ${wb.globalEntriesCount || 0}`,
      `世界书(角色条目总数): ${wb.characterEntriesCount || 0}`,
      `旧版worldbook(localStorage): ${ls.worldbookLegacyExists ? '有' : '无'}`
    ];
    if (errs.length) {
      lines.push('', `错误: ${errs.join(' | ')}`);
    }
    return lines.join('\n');
  },

  async attemptSoftRepairAfterStorageIssue() {
    const actions = [];
    try {
      if (Storage && typeof Storage.hydrateIconStylesCache === 'function') {
        await Storage.hydrateIconStylesCache();
        actions.push('重建图标样式缓存');
      }
    } catch (e) {}

    try {
      if (typeof Homescreen !== 'undefined' && Homescreen && typeof Homescreen.loadAndSyncWidgets === 'function') {
        await Homescreen.loadAndSyncWidgets();
        actions.push('重载主屏组件');
      }
    } catch (e) {}

    try {
      if (typeof Chat !== 'undefined' && Chat && typeof Chat.loadSessions === 'function') {
        await Chat.loadSessions();
        actions.push('重载会话列表');
      }
    } catch (e) {}

    try {
      if (typeof Worldbook !== 'undefined' && Worldbook && typeof Worldbook.renderWorldbooks === 'function') {
        await Worldbook.renderWorldbooks();
        actions.push('重载世界书页面数据');
      }
    } catch (e) {}

    return actions;
  },

  async runStorageHealthCheckAndRepair() {
    try {
      this.showToast('正在体检存储，请稍候…', 1200);
      const before = await this.collectStorageHealthSnapshot();
      const beforeText = this._formatStorageHealthMessage(before);
      const shouldRepair = confirm(
        `存储体检结果：\n\n${beforeText}\n\n是否尝试“轻量修复”？\n（不会删除数据，只重载缓存与页面数据）`
      );
      if (!shouldRepair) return;

      const actions = await this.attemptSoftRepairAfterStorageIssue();
      const after = await this.collectStorageHealthSnapshot();
      const afterText = this._formatStorageHealthMessage(after);
      const actionText = actions.length ? actions.join('、') : '未执行到可修复动作';
      alert(`轻量修复完成\n执行动作：${actionText}\n\n修复后体检：\n${afterText}`);
    } catch (e) {
      console.error('存储体检/修复失败:', e);
      alert('存储体检失败，请重试');
    }
  },

  /**
   * 强制刷新：注销 Service Worker、清空 Cache Storage，再整页重新加载。
   * 不会删除 IndexedDB 里的聊天等数据（与「清理缓存」不同）。
   */
  async forceRefreshEntireApp() {
    if (!confirm('将清除本站的 Service Worker 与静态资源缓存并重新加载页面，确定继续？\n（不会删除聊天记录与本地数据）')) {
      return;
    }
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch (err) {
      console.error('强制刷新预处理失败:', err);
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('_yd_hard');
      url.searchParams.set('_yd_hard', String(Date.now()));
      window.location.replace(url.toString());
    } catch (e) {
      window.location.reload();
    }
  },

  async _openExportDataPicker() {
    return new Promise(async (resolve) => {
      const overlayId = 'yd-export-data-picker-modal';
      const existed = document.getElementById(overlayId);
      if (existed) {
        try { existed.remove(); } catch (e) {}
      }

      let categories = [];
      try {
        if (typeof Storage.getExportCategories === 'function') {
          categories = await Storage.getExportCategories();
        }
      } catch (e) {}

      const esc = (s) => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');

      /** @type {Array<{id:string,title:string,messageCount:number}>} */
      let sessionRows = [];
      /** @type {HTMLElement|null} */
      let overlay = null;

      const otherCategories = categories.filter((c) => c.id !== 'sessions' && c.id !== 'messages');
      const msgCat = categories.find((c) => c.id === 'messages');
      const totalMsgCount = msgCat?.count || 0;

      const getSelectedSessionIds = () => {
        if (!overlay) return [];
        const ids = [];
        overlay.querySelectorAll('[data-msg-session-id]').forEach((el) => {
          if (el.checked) ids.push(String(el.getAttribute('data-msg-session-id') || ''));
        });
        return ids.filter(Boolean);
      };

      const updateChatMeta = () => {
        if (!overlay) return;
        const metaEl = overlay.querySelector('#yd-export-chat-meta');
        if (!metaEl) return;
        if (!sessionRows.length) {
          metaEl.textContent = totalMsgCount > 0 ? `共 ${totalMsgCount.toLocaleString()} 条消息` : '暂无聊天记录';
          return;
        }
        const selected = getSelectedSessionIds();
        const selectedMsgCount = sessionRows.reduce((sum, row) => (
          selected.includes(row.id) ? sum + (row.messageCount || 0) : sum
        ), 0);
        metaEl.textContent = `已勾选 ${selected.length}/${sessionRows.length} 个会话 · ${selectedMsgCount.toLocaleString()} 条消息`;
      };

      const renderSessionList = () => {
        if (!overlay) return;
        const wrap = overlay.querySelector('#yd-export-chat-session-list');
        if (!wrap) return;
        if (!sessionRows.length) {
          wrap.innerHTML = '<div style="padding:10px 12px;color:#8E8E93;font-size:13px;">暂无会话</div>';
          updateChatMeta();
          return;
        }
        wrap.innerHTML = sessionRows.map((row) => `
          <label class="yd-export-chat-session-item" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #E5E5EA;border-radius:10px;cursor:pointer;background:#FAFAFA;">
            <input type="checkbox" data-msg-session-id="${esc(row.id)}" checked style="width:18px;height:18px;flex-shrink:0;">
            <span style="flex:1;min-width:0;">
              <span style="display:block;font-size:15px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(row.title)}</span>
              <span style="display:block;font-size:12px;color:#8E8E93;margin-top:3px;">${(row.messageCount || 0).toLocaleString()} 条消息</span>
            </span>
          </label>
        `).join('');
        wrap.querySelectorAll('[data-msg-session-id]').forEach((el) => {
          el.addEventListener('change', updateChatMeta);
        });
        updateChatMeta();
      };

      const formatMeta = (cat) => {
        if (cat.id === 'localStorage') {
          return `${cat.count || 0} 项 · ${Storage.formatBytes(cat.bytes || 0)}`;
        }
        if (['settings', 'homescreen', 'currentTheme'].includes(cat.id)) {
          return cat.hasData ? '已配置' : '无';
        }
        const count = cat.count || 0;
        if (count === 0) return '无数据';
        return `${count.toLocaleString()} 条`;
      };

      overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.className = 'yd-modal yd-modal--active';
      overlay.innerHTML = `
        <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="选择导出内容" style="max-width:520px;">
          <div class="yd-modal-header">
            <div style="font-size:16px;font-weight:700;">选择导出内容</div>
            <button type="button" class="yd-btn-close" id="yd-export-data-picker-close" aria-label="关闭">×</button>
          </div>
          <div style="color:#8E8E93;font-size:13px;margin-top:-6px;margin-bottom:12px;">
            在下方逐个勾选要导出的会话；其它数据类型在列表中单独勾选。
          </div>
          <div id="yd-export-data-picker-list" style="display:flex;flex-direction:column;gap:8px;max-height:58vh;overflow-y:auto;"></div>
          <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px;">
            <button type="button" class="yd-btn yd-btn--secondary" id="yd-export-data-picker-cancel" style="min-width:96px;">取消</button>
            <button type="button" class="yd-btn" id="yd-export-data-picker-confirm" style="min-width:96px;background:#111;color:#fff;">开始导出</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try { overlay.remove(); } catch (e) {}
        resolve(value);
      };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(null);
      });
      overlay.querySelector('#yd-export-data-picker-close')?.addEventListener('click', () => finish(null));
      overlay.querySelector('#yd-export-data-picker-cancel')?.addEventListener('click', () => finish(null));

      const listEl = overlay.querySelector('#yd-export-data-picker-list');
      if (listEl) {
        const chatBlock = `
          <div class="yd-export-chat-block" style="padding:12px;border:1px solid #E5E5EA;border-radius:12px;">
            <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:4px;">聊天记录</div>
            <div id="yd-export-chat-meta" style="font-size:12px;color:#8E8E93;margin-bottom:10px;">正在加载会话列表…</div>
            <div id="yd-export-chat-session-list" style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;"></div>
          </div>
        `;

        const otherHtml = otherCategories.map((cat) => {
          const meta = formatMeta(cat);
          const hint = cat.hint ? `<span style="color:#FF9500;font-size:12px;margin-left:6px;">${cat.hint}</span>` : '';
          return `
            <label class="yd-export-data-picker-item" style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid #E5E5EA;border-radius:12px;cursor:pointer;">
              <input type="checkbox" id="yd-export-cat-${cat.id}" data-cat-id="${cat.id}" checked style="margin-top:3px;flex-shrink:0;">
              <span style="flex:1;min-width:0;">
                <span style="display:block;font-size:15px;font-weight:600;color:#111;">${cat.label}${hint}</span>
                <span style="display:block;font-size:12px;color:#8E8E93;margin-top:4px;">${meta}</span>
              </span>
            </label>
          `;
        }).join('');

        if (!otherCategories.length && totalMsgCount === 0) {
          listEl.innerHTML = `
            <div style="padding:14px 12px;border:1px solid #E5E5EA;border-radius:12px;color:#8E8E93;font-size:13px;">
              暂无可导出的数据
            </div>
          `;
        } else {
          listEl.innerHTML = chatBlock + (otherHtml ? `<div style="font-size:13px;font-weight:600;color:#8E8E93;margin:4px 0 0;">其它数据</div>${otherHtml}` : '');
        }
      }

      try {
        if (typeof Storage.getExportSessionMessageList === 'function') {
          sessionRows = await Storage.getExportSessionMessageList();
        }
      } catch (e) {
        sessionRows = [];
      }
      renderSessionList();

      overlay.querySelector('#yd-export-data-picker-confirm')?.addEventListener('click', () => {
        const include = {};
        let picked = 0;

        const selectedSessionIds = getSelectedSessionIds();
        const exportChat = selectedSessionIds.length > 0;
        include.sessions = exportChat;
        include.messages = exportChat;
        if (exportChat) picked += 1;

        otherCategories.forEach((cat) => {
          const cb = overlay.querySelector(`#yd-export-cat-${cat.id}`);
          const on = !!cb?.checked;
          include[cat.id] = on;
          if (on) picked += 1;
        });

        if (picked === 0) {
          this.showToast?.('请至少选择一项（勾选一个会话或其它数据）', 1800);
          return;
        }

        finish({
          include,
          includeMessageSessionIds: exportChat ? selectedSessionIds : []
        });
      });
    });
  },

  async exportData() {
    const picked = await this._openExportDataPicker();
    if (!picked) return;
    const include = picked.include || picked;
    const includeMessageSessionIds = picked.includeMessageSessionIds || [];
    try {
      await Storage.exportBackupToFile({ include, includeMessageSessionIds });
    } catch (err) {
      console.error('导出失败:', err);
      try {
        await Storage.exportBackupToFile({ include, includeMessageSessionIds });
      } catch (e) {}
    }
  },

  async importData(file) {
    if (!file) return;

    try {
      const text = await Storage.readImportFileText(file);
      const data = JSON.parse(text);

      if (!confirm('导入数据将覆盖当前所有数据，确定继续吗？')) return;

      await Storage.importAll(data);
      alert('导入成功，页面即将刷新');
      location.reload();
    } catch (err) {
      console.error('导入失败:', err);
      alert('导入失败，请检查文件格式');
    }
  },
};

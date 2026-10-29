// 应用入口
(async function() {
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((resolve) => {
        setTimeout(() => {
          console.warn(`[启动] ${label} 超时(${ms}ms)，继续启动`);
          resolve(undefined);
        }, ms);
      })
    ]);

  try {
    // 初始化存储
    await Storage.init();
    // 图标美化：后台加载，不阻塞首屏（大图数据读 IndexedDB 可能较慢）
    Storage._iconStylesCache = {};
    void Storage.hydrateIconStylesCache()
      .then(() => {
        try {
          if (typeof Homescreen !== 'undefined' && typeof Homescreen.renderHomescreen === 'function') {
            Homescreen.renderHomescreen();
          }
        } catch (e) {}
      })
      .catch((e) => console.warn('[Storage] hydrateIconStylesCache', e));
    // 回收站清理放到后台，不阻塞首屏
    setTimeout(() => {
      try {
        if (typeof Storage.recycleBinPruneExpired === 'function') {
          Storage.recycleBinPruneExpired().catch(() => {});
        }
      } catch (e) {}
    }, 0);

    if (typeof GlobalRegexConverter !== 'undefined' && GlobalRegexConverter.loadFromStorage) {
      await GlobalRegexConverter.loadFromStorage();
    }

    // 初始化各模块
    if (typeof Notifications !== 'undefined' && Notifications.init) {
      Notifications.init();
    }
    Theme.init();
    BubbleSettings.init();
    if (typeof SessionBeautify !== 'undefined' && SessionBeautify.init) {
      SessionBeautify.init();
    }
    if (typeof ReplyStyle !== 'undefined' && ReplyStyle.init) {
      ReplyStyle.init();
    }
    await Homescreen.init();
    SCUI.init();
    try {
      if (typeof Settings !== 'undefined' && typeof Settings.migrateLegacyApiMaxTokensFrom12000 === 'function') {
        Settings.migrateLegacyApiMaxTokensFrom12000();
      }
    } catch (e) {}
    Chat.init();
    Settings.init();

    Beautify.init();
    Album.init();
    Camera.init();
    Wallpaper.init();
    Weather.init();

    Moments.init();
    if (typeof MomentsImageStudio !== 'undefined' && MomentsImageStudio.init) {
      MomentsImageStudio.init();
    }
    Forum.init();




    if (typeof Wallet !== 'undefined' && Wallet.init) {
      Wallet.init();
    }
    if (typeof TimerPage !== 'undefined' && TimerPage.init) {
      TimerPage.init();
    }
    if (typeof ProactiveScheduler !== 'undefined' && ProactiveScheduler && typeof ProactiveScheduler.startLocalReconciler === 'function') {
      ProactiveScheduler.startLocalReconciler();
    }




    Character.init();
    if (typeof Worldbook !== 'undefined' && Worldbook.init) {
      Worldbook.init();
    }
    if (typeof GlobalRegexPage !== 'undefined' && GlobalRegexPage.init) {
      GlobalRegexPage.init();
    }
    Mask.init();

    if (typeof TaExperience !== 'undefined' && TaExperience.init) {
      TaExperience.init();
    }
    if (typeof TaDiary !== 'undefined' && TaDiary.init) {
      TaDiary.init();
    }
    // 首次引导：若用户从未设置过系统通知权限，启动后立即提示
    try {
      if (typeof TimerPage !== 'undefined' && TimerPage && typeof TimerPage.promptSystemNotifySetupIfNeeded === 'function') {
        setTimeout(() => TimerPage.promptSystemNotifySetupIfNeeded(), 180);
      }
    } catch (eGuide) {}

    try {
      const params = new URLSearchParams(window.location.search || '');
      // 冷启动时 notificationclick 可能从 hash 带参数（避免影响 PWA standalone 行为）。
      const rawHash = String(window.location.hash || '').trim();
      if (rawHash.startsWith('#')) {
        try {
          const hashParams = new URLSearchParams(rawHash.slice(1));
          hashParams.forEach((v, k) => {
            if (!params.has(k) || !String(params.get(k) || '').trim()) params.set(k, String(v || ''));
          });
        } catch (eHash) {}
      }

      const page = String(params.get('yd_notify_page') || '').trim();
      const app = String(params.get('yd_notify_app') || '').trim();
      const role = String(params.get('yd_notify_role') || '').trim();
      const forumId = String(params.get('yd_notify_forum_id') || '').trim();
      const sessionId = String(params.get('yd_notify_session') || '').trim();
      const kind = String(params.get('yd_notify_kind') || '').trim();
      const taskId = String(params.get('yd_notify_task') || '').trim();
      const body = String(params.get('yd_notify_body') || '').trim();
      if (page || app) {

        if (typeof Notifications !== 'undefined' && Notifications.openByPayload) {
          Notifications.openByPayload({ page, app, role, forumId, sessionId });
        }
        params.delete('yd_notify_page');
        params.delete('yd_notify_app');
        params.delete('yd_notify_role');
        params.delete('yd_notify_forum_id');
        params.delete('yd_notify_session');
        params.delete('yd_notify_kind');
        params.delete('yd_notify_task');
        params.delete('yd_notify_body');
        const q = params.toString();
        // 同时清空 hash，避免下次进入仍被误触发。
        history.replaceState(null, '', q ? `/?${q}` : '/');
      }
    } catch (e) {}
    
    console.log('SC初始化完成');
    window.__ydAppReady = true;
  } catch (error) {
    console.error('初始化失败:', error);
    window.__ydAppReady = true;
    alert('应用初始化失败，请刷新页面重试');
  }
})();

// 注册 Service Worker：不缓存 sw 脚本本身、每次进页检查更新；新版本接管后刷新一次
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 首次启动未完成时不 reload，避免更新 SW 时卡在半初始化状态
    if (!window.__ydAppReady) return;
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      reg.update().catch(() => {});
    })
    .catch((err) => console.log('Service Worker注册失败:', err));


}

// PWA 安装提示（Android Chrome 等）
window.__ydDeferredInstallPrompt = null;
window.__ydIsAppInstalled = window.matchMedia('(display-mode: standalone)').matches;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__ydDeferredInstallPrompt = e;
});

window.addEventListener('appinstalled', () => {
  window.__ydDeferredInstallPrompt = null;
  window.__ydIsAppInstalled = true;
});

// 左边缘向右滑动关闭/返回（全局手势）
// 目标：尽量复用各页面原本的“返回”按钮 click 逻辑，避免为每个页面单独写手势。
(() => {
  if (window.__ydEdgeBackSwipeInstalled) return;
  window.__ydEdgeBackSwipeInstalled = true;

  // NOTE: 22px 对部分手机/壳子/贴膜用户太窄，稍微放宽提升可用性
  const EDGE_THRESHOLD_X = 34; // 从最左侧起算，允许的触发宽度
  const MIN_DISTANCE_X = 56; // 向右滑动最小距离（放宽）
  const MAX_VERTICAL_DRIFT = 90; // 允许的纵向偏移（放宽）
  const MAX_TIME_MS = 1400; // 手势时长上限（放宽）

  // 交互式 swipe-back：拖动跟手，松手回弹/完成
  const START_SLOP_X = 6; // 认为开始“水平返回手势”的最小位移（放宽）
  const START_SLOP_Y = 20; // 明显纵向滚动时直接放弃（避免影响列表纵向滚动）
  const COMMIT_RATIO = 0.25; // 释放时超过屏宽比例则完成返回（放宽）
  const COMMIT_MAX_PX = 140; // 释放阈值上限（放宽）
  const ANIM_MS = 220;

  const drag = {
    kind: '', // 'pointer' | 'touch'
    id: null, // pointerId | touch.identifier
    startX: 0,
    startY: 0,
    startT: 0,
    lastX: 0,
    lastY: 0,
    started: false, // 是否已确认开始接管（跟手）
    cancelled: false,
    page: null
  };

  const ensureSwipeIndicator = () => {
    let el = document.getElementById('yd-swipeback-indicator');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'yd-swipeback-indicator';
    el.className = 'yd-swipeback-indicator';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M14.6 5.6a1 1 0 0 1 0 1.4L10.6 11l4 4a1 1 0 1 1-1.4 1.4l-4.7-4.7a1 1 0 0 1 0-1.4l4.7-4.7a1 1 0 0 1 1.4 0z"/></svg>';
    const host = document.querySelector('.yd-phone') || document.body;
    host.appendChild(el);
    return el;
  };

  const setIndicatorProgress = (dx) => {
    const el = ensureSwipeIndicator();
    const x = Math.max(0, Number(dx) || 0);
    const progress = Math.max(0, Math.min(1, x / 90));
    el.classList.add('is-visible');
    el.style.opacity = String(0.15 + progress * 0.85);
    el.style.transform = `translate3d(${Math.min(14, x * 0.12)}px, -50%, 0) scale(${0.96 + progress * 0.08})`;
  };

  const hideIndicator = () => {
    const el = document.getElementById('yd-swipeback-indicator');
    if (!el) return;
    el.classList.remove('is-visible');
    el.style.opacity = '';
    el.style.transform = '';
  };

  const getActivePage = () => document.querySelector('.yd-page--active');

  const triggerModalClose = (modal) => {
    if (!modal) return false;
    const closeBtn =
      modal.querySelector('[data-act="close"]') ||
      modal.querySelector('.yd-btn-close') ||
      modal.querySelector('button[aria-label="关闭"]') ||
      modal.querySelector('button[aria-label^="关闭"]');
    if (closeBtn && !closeBtn.disabled) {
      closeBtn.click();
      return true;
    }

    const backdrop = modal.querySelector('.yd-modal__backdrop');
    if (backdrop) {
      backdrop.click();
      return true;
    }
    return false;
  };

  const triggerBack = () => {
    const modal = document.querySelector('.yd-modal--active');
    if (triggerModalClose(modal)) return;

    const page = getActivePage();
    if (!page || page.id === 'page-homescreen') return;

    const backBtn =
      page.querySelector('button[aria-label="返回"]') ||
      page.querySelector('[id$="-back"]') ||
      page.querySelector('.yd-live-back');
    if (backBtn && !backBtn.disabled) backBtn.click();
    else if (window.State && typeof State.backToHome === 'function') State.backToHome();
  };

  const resetPageStyle = (page) => {
    if (!page) return;
    page.classList.remove('yd-swipeback--dragging', 'yd-swipeback--animating');
    page.style.transform = '';
    hideIndicator();
  };

  const getCommitDistance = () => {
    const w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 360);
    const ratioPx = Math.round(w * COMMIT_RATIO);
    return Math.max(MIN_DISTANCE_X, Math.min(COMMIT_MAX_PX, ratioPx));
  };

  const beginDrag = (kind, id, x, y) => {
    // 若有弹窗，仍允许“左边缘右滑”关闭，但不做页面跟手动画（避免层级怪异）
    const modal = document.querySelector('.yd-modal--active');
    if (modal) return false;

    const page = getActivePage();
    if (!page || page.id === 'page-homescreen') return false;

    drag.kind = kind;
    drag.id = id;
    drag.startX = x;
    drag.startY = y;
    drag.lastX = x;
    drag.lastY = y;
    drag.startT = performance.now();
    drag.started = false;
    drag.cancelled = false;
    drag.page = page;
    return true;
  };

  const applyDragX = (dx) => {
    const page = drag.page;
    if (!page) return;
    const w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 360);
    const x = Math.max(0, Math.min(w, dx));
    page.style.transform = `translate3d(${x}px, 0, 0)`;
  };

  const updateDrag = (x, y, ev) => {
    if (!drag.page || drag.cancelled) return;
    drag.lastX = x;
    drag.lastY = y;

    const dx = x - drag.startX;
    const dy = y - drag.startY;

    // 未接管前：判断意图。纵向滚动明显则直接放弃，不影响原滚动。
    if (!drag.started) {
      if (Math.abs(dy) >= START_SLOP_Y && Math.abs(dy) > Math.abs(dx)) {
        drag.cancelled = true;
        drag.page = null;
        return;
      }
      if (dx >= START_SLOP_X && dx > Math.abs(dy) * 1.2) {
        drag.started = true;
        drag.page.classList.add('yd-swipeback--dragging');
      } else {
        return;
      }
    }

    // 已接管：阻止浏览器的页面侧滑/回弹/滚动穿透
    try {
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    } catch (e) {}

    applyDragX(dx);
    setIndicatorProgress(dx);
  };

  const finishDrag = (x, y) => {
    if (!drag.page) return;
    const page = drag.page;
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    const dt = performance.now() - drag.startT;

    const commitDistance = getCommitDistance();
    const shouldCommit =
      drag.started &&
      dx >= commitDistance &&
      Math.abs(dy) <= MAX_VERTICAL_DRIFT &&
      dx > Math.abs(dy) * 1.2 &&
      dt <= MAX_TIME_MS * 1.4;

    // 清掉 drag 状态（但页面动画结束后再 reset transform）
    drag.kind = '';
    drag.id = null;
    drag.page = null;
    // 松手立即隐藏中间返回箭头，不等收尾动画
    hideIndicator();

    if (!drag.started) {
      resetPageStyle(page);
      return;
    }

    if (shouldCommit) {
      // 达到阈值后松手立即返回，不再追加“后半段滑出动画”
      resetPageStyle(page);
      triggerBack();
    } else {
      // 回弹
      page.classList.add('yd-swipeback--animating');
      page.style.transform = 'translate3d(0px, 0, 0)';
      setTimeout(() => {
        resetPageStyle(page);
      }, ANIM_MS + 30);
    }
  };

  const cancelDrag = () => {
    if (!drag.page) return;
    const page = drag.page;
    drag.kind = '';
    drag.id = null;
    drag.page = null;
    // 取消/中断时也立即隐藏箭头
    hideIndicator();
    page.classList.add('yd-swipeback--animating');
    page.style.transform = 'translate3d(0px, 0, 0)';
    setTimeout(() => resetPageStyle(page), ANIM_MS + 30);
  };

  // Pointer Events
  document.addEventListener(
    'pointerdown',
    (e) => {
      // 某些 WebView/浏览器可能不支持 pointerType；支持时仅允许 touch/pen
      if (typeof e.pointerType === 'string' && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (e.clientX > EDGE_THRESHOLD_X) return;
      beginDrag('pointer', e.pointerId, e.clientX, e.clientY);
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'pointermove',
    (e) => {
      if (drag.kind !== 'pointer') return;
      if (!drag.page) return;
      if (e.pointerId !== drag.id) return;
      updateDrag(e.clientX, e.clientY, e);
    },
    { capture: true, passive: false }
  );

  document.addEventListener(
    'pointerup',
    (e) => {
      if (drag.kind !== 'pointer') return;
      if (!drag.page) return;
      if (e.pointerId !== drag.id) return;
      finishDrag(e.clientX, e.clientY);
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'pointercancel',
    (e) => {
      if (drag.kind !== 'pointer') return;
      if (!drag.page) return;
      if (e.pointerId !== drag.id) return;
      cancelDrag();
    },
    { capture: true, passive: true }
  );

  // Touch Events 兜底
  document.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches && e.touches[0] ? e.touches[0] : null;
      if (!t) return;
      if ((t.clientX ?? 0) > EDGE_THRESHOLD_X) return;
      beginDrag('touch', t.identifier, t.clientX ?? 0, t.clientY ?? 0);
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (drag.kind !== 'touch') return;
      if (!drag.page) return;
      const t = e.touches && e.touches[0] ? e.touches[0] : null;
      if (!t) return;
      if (typeof t.identifier === 'number' && t.identifier !== drag.id) return;
      updateDrag(t.clientX ?? 0, t.clientY ?? 0, e);
    },
    { capture: true, passive: false }
  );

  document.addEventListener(
    'touchend',
    (e) => {
      if (drag.kind !== 'touch') return;
      if (!drag.page) return;
      const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
      if (!t) return;
      if (typeof t.identifier === 'number' && t.identifier !== drag.id) return;
      finishDrag(t.clientX ?? 0, t.clientY ?? 0);
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    'touchcancel',
    () => {
      if (drag.kind !== 'touch') return;
      cancelDrag();
    },
    { capture: true, passive: true }
  );
})();


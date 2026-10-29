// 聊天管理
const Chat = {
  _MONEY_ACTIONS_KEY: 'chat_money_actions_v1',
  currentSessionId: null,
  messages: [],
  currentSession: null,
  _characterCache: null,
  _characterCacheAt: 0,
  _pendingUserQueue: [], // 伪发送：待真实发送的用户消息（内存队列）
  _flushingPending: false,
  _currentQuote: null, // { text, fromName }
  _chatListRefreshTimer: null,
  _chatListRefreshPending: false,
  _debugScroll: false,
  _pageSize: 30,
  _sessionAllMessages: null, // 当前会话全量消息（按 createdAt 升序）
  _sessionPageStart: 0,      // 当前已加载窗口的起始 index（指向 _sessionAllMessages）
  _hasMoreHistory: false,
  _loadMoreScrollHandler: null,
  _forceFullRenderNext: false,
  _plainStreamDoneKeys: new Set(),
  /** 仅本次实时写入的助手消息 id：历史 plain 不进此集合，进入会话不流式 */
  _plainStreamPendingMsgIds: new Set(),
  /** plain 伪流式任务队列（按渲染顺序串行，避免多段同时打字） */
  _plainStreamRevealQueue: null,
  _plainStreamPumpRunning: false,
  _forceBottomAfterRender: false,
  _actionBottomPadBoostUntil: 0,
  _scrollBottomRunId: 0,
  _scrollBottomTimers: [],
  _suspendAutoScrollUntil: 0,
  _msgActionBarCleanup: null,
  _editMsgModalCleanup: null,
  _moneyActionContext: null,
  _moneyActionBound: false,
  _moneyCollectionNeedsRender: false,
  /** 收款/退还回执：等角色本轮首条回复入库前再插入，避免紧跟用户发红包之后 */
  _deferredMoneyCollectNotices: [],
  _moneyActionsMem: null,
  _pseudoSendGuideShowing: false,
  _bulkDeleteMode: false,
  _bulkDeleteSelectedIds: null,
  _bulkDeleteScrollCapture: null,
  _debugTogetherEnabled() {
    try {
      return String(localStorage.getItem('yd_debug_together') || '').trim() === '1';
    } catch (e) {
      return false;
    }
  },
  _debugTogether(stage, payload = {}) {
    if (!this._debugTogetherEnabled()) return;
    try {
      console.info(`[chat][together][${stage}]`, payload);
    } catch (e) {}
  },

  _getPseudoSendGuideDismissedKey() {
    try {
      return CONFIG?.STORAGE_KEYS?.CHAT_PSEUDO_SEND_GUIDE_DISMISSED || 'chat_pseudo_send_guide_dismissed';
    } catch (e) {
      return 'chat_pseudo_send_guide_dismissed';
    }
  },

  _isPseudoSendGuideDismissed() {
    const key = this._getPseudoSendGuideDismissedKey();
    try {
      const raw = Storage.get(key);
      return String(raw || '').trim() === '1';
    } catch (e) {
      return false;
    }
  },

  _setPseudoSendGuideDismissed(v) {
    const key = this._getPseudoSendGuideDismissedKey();
    try {
      Storage.set(key, v ? '1' : '0');
    } catch (e) {}
  },

  _openPseudoSendGuideModal() {
    const old = document.getElementById('yd-chat-pseudo-send-guide');
    if (old) old.remove();

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'yd-chat-pseudo-send-guide';
      overlay.className = 'yd-modal yd-modal--active';
      overlay.innerHTML = `
        <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="发送说明" style="max-width:420px;">
          <div class="yd-modal-header">
            <div style="font-weight:900">使用说明小提示~</div>
          </div>
          <div style="padding:14px 16px 12px;">
            <div style="font-size:13px;line-height:1.75;color:#333;">
              这里的发送是“两段式”：<br>
              第一次点击发送，会先把你输入的内容加入待发送队列；<br>
              你可以继续补充消息；<br>
              当输入框为空时，再次点击发送按钮，才会真正发送并开始接收回复。
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
              <button type="button" data-act="later" style="min-width:96px;min-height:34px;border-radius:10px;border:1px solid rgba(0,0,0,.12);background:#fff;color:#333;font-size:12px;font-weight:700;cursor:pointer;">稍后再看</button>
              <button type="button" data-act="dismiss" style="min-width:96px;min-height:34px;border-radius:10px;border:none;background:#111;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">不再提示</button>
            </div>
          </div>
        </div>
      `;

      const done = (dontShowAgain) => {
        try { overlay.remove(); } catch (e) {}
        resolve({ dontShowAgain: !!dontShowAgain });
      };
      overlay.querySelector('[data-act="later"]')?.addEventListener('click', () => done(false));
      overlay.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => done(true));
      document.body.appendChild(overlay);
    });
  },

  async _ensurePseudoSendGuideOnFirstUse() {
    if (this._isPseudoSendGuideDismissed()) return;
    if (this._pseudoSendGuideShowing) return;
    this._pseudoSendGuideShowing = true;
    try {
      const result = await this._openPseudoSendGuideModal();
      if (result && result.dontShowAgain) {
        this._setPseudoSendGuideDismissed(true);
      }
    } finally {
      this._pseudoSendGuideShowing = false;
    }
  },
  
  _closeMsgActionBar() {
    try {
      if (this._msgActionBarCleanup) this._msgActionBarCleanup();
    } catch (e) {}
    this._msgActionBarCleanup = null;
    const el = document.getElementById('yd-chat-msg-actions');
    if (el) el.remove();
  },

  _closeEditMsgModal() {
    try {
      if (this._editMsgModalCleanup) this._editMsgModalCleanup();
    } catch (e) {}
    this._editMsgModalCleanup = null;
    const el = document.getElementById('yd-chat-edit-msg');
    if (el) el.remove();
  },

  _openEditMsgModal({ msg, seedText = '' }) {
    try {
      if (!msg || !msg.id) return;
      this._closeEditMsgModal();
      const canBlockEdit = String(msg.role || '') === 'assistant';
      let editScope = 'single'; // single | block

      const getLocalAssistantBlock = () => {
        const list = Array.isArray(this.messages) ? this.messages : [];
        const idx = list.findIndex(m => m && String(m.id || '') === String(msg.id || ''));
        if (idx < 0) return [msg];
        if (String(list[idx]?.role || '') !== 'assistant') return [list[idx]];
        const modeOf = (m) => (m && m.mode != null) ? (Number(m.mode) === 1 ? 1 : 0) : 0;
        const mode = modeOf(list[idx]);
        let start = idx;
        let end = idx;
        while (start - 1 >= 0) {
          const p = list[start - 1];
          if (!p || String(p.role || '') !== 'assistant') break;
          if (modeOf(p) !== mode) break;
          start--;
        }
        while (end + 1 < list.length) {
          const n = list[end + 1];
          if (!n || String(n.role || '') !== 'assistant') break;
          if (modeOf(n) !== mode) break;
          end++;
        }
        return list.slice(start, end + 1).filter(Boolean);
      };

      const buildTextByScope = (scope) => {
        if (scope === 'block' && canBlockEdit) {
          const block = getLocalAssistantBlock();
          return block.map(x => String(x?.content || '')).join('\n\n').trimEnd();
        }
        const s = String(seedText || '').trimEnd();
        return s || String(msg.content || '').trimEnd();
      };

      const overlay = document.createElement('div');
      overlay.id = 'yd-chat-edit-msg';
      overlay.className = 'yd-modal yd-modal--active';
      overlay.innerHTML = `
        <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="编辑消息" style="max-width:560px;">
          <div class="yd-modal-header">
            <div style="font-weight:900">编辑消息</div>
            <button type="button" class="yd-btn-close" data-act="close" aria-label="关闭">×</button>
          </div>
          <div style="padding:12px 16px 16px;">
            ${canBlockEdit ? `
              <div style="display:flex;gap:8px;margin-bottom:10px;">
                <button type="button" data-act="scope-single" style="flex:1;min-height:34px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:#111;color:#fff;font-size:12px;font-weight:700;">编辑本条</button>
                <button type="button" data-act="scope-block" style="flex:1;min-height:34px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:rgba(0,0,0,0.04);color:#111;font-size:12px;font-weight:700;">编辑整段</button>
              </div>
            ` : ''}
            <div style="font-size:12px;color:rgba(17,17,17,0.60);margin-bottom:8px;">
              ${canBlockEdit ? '说明：可切换编辑本条，或编辑本次回复整段内容。' : '说明：编辑当前这条消息内容。'}
            </div>
            <textarea id="yd-chat-edit-msg-text" style="width:100%;min-height:180px;max-height:52vh;resize:vertical;padding:10px 12px;border:1px solid rgba(0,0,0,0.12);border-radius:12px;outline:none;font-size:13px;line-height:1.5;"></textarea>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
              <button type="button" class="yd-btn yd-btn--secondary" data-act="cancel">取消</button>
              <button type="button" class="yd-btn" data-act="save" style="background:#111;color:#fff;">保存</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const ta = overlay.querySelector('#yd-chat-edit-msg-text');
      if (ta) {
        ta.value = buildTextByScope(editScope);
        window.setTimeout(() => {
          try {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
          } catch (e) {}
        }, 0);
      }
      const btnScopeSingle = overlay.querySelector('[data-act="scope-single"]');
      const btnScopeBlock = overlay.querySelector('[data-act="scope-block"]');
      const syncScopeUi = () => {
        if (!canBlockEdit) return;
        const isSingle = editScope === 'single';
        if (btnScopeSingle) {
          btnScopeSingle.style.background = isSingle ? '#111' : 'rgba(0,0,0,0.04)';
          btnScopeSingle.style.color = isSingle ? '#fff' : '#111';
        }
        if (btnScopeBlock) {
          btnScopeBlock.style.background = isSingle ? 'rgba(0,0,0,0.04)' : '#111';
          btnScopeBlock.style.color = isSingle ? '#111' : '#fff';
        }
      };
      btnScopeSingle?.addEventListener('click', () => {
        if (editScope === 'single') return;
        editScope = 'single';
        if (ta) ta.value = buildTextByScope('single');
        syncScopeUi();
      });
      btnScopeBlock?.addEventListener('click', () => {
        if (!canBlockEdit || editScope === 'block') return;
        editScope = 'block';
        if (ta) ta.value = buildTextByScope('block');
        syncScopeUi();
      });
      syncScopeUi();

      const close = () => this._closeEditMsgModal();
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      window.addEventListener('keydown', onKey, true);
      this._editMsgModalCleanup = () => window.removeEventListener('keydown', onKey, true);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
      overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);
      overlay.querySelector('[data-act="cancel"]')?.addEventListener('click', close);
      overlay.querySelector('[data-act="save"]')?.addEventListener('click', async () => {
        try {
          const nextText = String(ta?.value || '').trimEnd();
          if (!nextText.trim()) {
            alert('内容不能为空');
            return;
          }

          if (editScope === 'block' && canBlockEdit) {
            const sid = String(this.currentSessionId || '');
            const allRows = await Storage.dbGetAll('messages');
            const list = Array.isArray(allRows)
              ? allRows.filter(r => String(r?.sessionId || '') === sid).sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0))
              : [];
            const idx = list.findIndex(r => r && String(r.id || '') === String(msg.id || ''));
            if (idx >= 0) {
              const modeOf = (m) => (m && m.mode != null) ? (Number(m.mode) === 1 ? 1 : 0) : 0;
              const mode = modeOf(list[idx]);
              let start = idx;
              let end = idx;
              while (start - 1 >= 0) {
                const p = list[start - 1];
                if (!p || String(p.role || '') !== 'assistant') break;
                if (modeOf(p) !== mode) break;
                start--;
              }
              while (end + 1 < list.length) {
                const n = list[end + 1];
                if (!n || String(n.role || '') !== 'assistant') break;
                if (modeOf(n) !== mode) break;
                end++;
              }
              const block = list.slice(start, end + 1).filter(Boolean);
              if (block.length) {
                const head = block[0];
                await Storage.dbPut('messages', { ...head, content: nextText });
                for (let i = 1; i < block.length; i++) {
                  try { await Storage.dbDelete('messages', block[i].id); } catch (e) {}
                }
              }
            }
          } else {
            const row = await Storage.dbGet('messages', msg.id);
            if (row) {
              let nextContent = nextText;
              const seed = String(seedText || '');
              const rawContent = String(row.content || '');
              // 本条编辑：如果输入框初始值来自“点击片段”，保存时仅替换该片段，避免整条内容被覆盖丢失。
              if (seed && rawContent && seed !== rawContent) {
                const pos = rawContent.indexOf(seed);
                if (pos >= 0) {
                  nextContent = rawContent.slice(0, pos) + nextText + rawContent.slice(pos + seed.length);
                }
              }
              const next = { ...row, content: nextContent };
              await Storage.dbPut('messages', next);
              const idx = this.messages.findIndex(m => m && String(m.id) === String(msg.id));
              if (idx >= 0) this.messages[idx].content = nextContent;
            }
          }

          // 编辑已有消息：为避免 renderMessages 的增量路径不刷新旧段内容，
          // 强制走全量渲染以保证当前聊天页立刻回显。
          this._forceFullRenderNext = true;
          await this.loadMessages();
          this._scheduleChatListRefresh();
          close();
          if (typeof this._toast === 'function') this._toast('已保存');
        } catch (err) {
          console.error('[chat] edit save failed', err);
          alert('保存失败，请稍后重试');
        }
      });
    } catch (e) {}
  },

  async _redoFromMessage(msg) {
    try {
      if (!msg || !msg.id || !this.currentSessionId) return;
      const sid = String(this.currentSessionId || '');

      let all = [];
      try {
        const rows = await Storage.dbGetAll('messages');
        all = Array.isArray(rows)
          ? rows.filter(r => String(r?.sessionId || '') === sid).sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0))
          : [];
      } catch (e) {
        all = [];
      }
      if (!all.length) return;

      const targetIdx = all.findIndex(r => String(r?.id || '') === String(msg.id));
      if (targetIdx < 0) return;

      // user 点击：从自己这条开始；assistant 点击：找上一条 user
      let userIdx = -1;
      if (String(all[targetIdx]?.role || '') === 'user') {
        userIdx = targetIdx;
      } else {
        for (let i = targetIdx - 1; i >= 0; i--) {
          if (String(all[i]?.role || '') === 'user') { userIdx = i; break; }
        }
      }
      if (userIdx < 0) {
        const row = all[targetIdx];
        if (row && (await this._shouldUseOfflineOpeningRedo(row))) {
          await this._redoOfflineOpeningFlow(row);
          return;
        }
        if (typeof this._toast === 'function') this._toast('找不到上一条用户消息');
        return;
      }

      const userText = String(all[userIdx]?.content || '').trim();
      if (!userText) return;

      // 删除该 userIdx 及其后的所有消息
      const toDelete = all.slice(userIdx);
      for (const row of toDelete) {
        try { await Storage.dbDelete('messages', row.id); } catch (e) {}
      }

      // 刷新并重跑
      await this.loadMessages();
      await this._queueUserMessage(userText);
      await this._flushPendingMessages();
    } catch (err) {
      console.error('[chat] redoFromMessage failed', err);
      alert('重说失败，请稍后重试');
    }
  },

  async _deleteSingleMessage(msg) {
    if (!msg || msg.id == null) return;
    await this._deleteMessagesByIds([msg.id]);
  },

  async _deleteMessagesByIds(ids) {
    try {
      const idList = Array.from(new Set(
        (Array.isArray(ids) ? ids : [])
          .map((x) => String(x || '').trim())
          .filter(Boolean)
      ));
      if (!idList.length) return;

      for (const keyStr of idList) {
        const row =
          (Array.isArray(this.messages) ? this.messages.find((m) => String(m?.id || '') === keyStr) : null) ||
          (Array.isArray(this._sessionAllMessages) ? this._sessionAllMessages.find((m) => String(m?.id || '') === keyStr) : null);
        const keyRaw = row && row.id != null ? row.id : keyStr;
        try { await Storage.dbDelete('messages', keyRaw); } catch (e) {}
        if (keyStr !== String(keyRaw)) {
          try { await Storage.dbDelete('messages', keyStr); } catch (e2) {}
        }
      }

      const matchId = (m) => m && idList.includes(String(m.id || ''));
      try {
        if (Array.isArray(this.messages)) {
          this.messages = this.messages.filter((m) => !matchId(m));
        }
        if (Array.isArray(this._sessionAllMessages)) {
          this._sessionAllMessages = this._sessionAllMessages.filter((m) => !matchId(m));
        }
      } catch (e) {}

      this._forceFullRenderNext = true;
      await this.loadMessages();
      this._scheduleChatListRefresh();
      if (typeof this._toast === 'function') {
        this._toast(idList.length > 1 ? `已删除 ${idList.length} 条` : '已删除');
      }
    } catch (err) {
      console.error('[chat] delete messages failed', err);
      alert('删除失败，请稍后重试');
    }
  },

  _isBulkDeleteEligibleMessage(m) {
    if (!m || m.id == null) return false;
    if (m._sparkNotice) return true;
    if (m._moneyCollectNotice) return true;
    if (m.role === 'memory') return true;
    if (m.role === 'user' || m.role === 'assistant') return true;
    return false;
  },

  _exitBulkDeleteMode() {
    this._bulkDeleteMode = false;
    this._bulkDeleteSelectedIds = null;
    const page = document.getElementById('page-chat');
    if (page) page.classList.remove('yd-page-chat--bulk-delete');
    document.getElementById('yd-bulk-delete-bar')?.remove();
    const scroll = document.getElementById('chat-scroll');
    if (scroll) {
      scroll.querySelectorAll('.yd-bulk-delete-check-host').forEach((n) => n.remove());
      scroll.querySelectorAll('.yd-message-bulk-selected').forEach((n) => n.classList.remove('yd-message-bulk-selected'));
    }
    if (this._bulkDeleteScrollCapture) {
      const scrollEl = document.getElementById('chat-scroll');
      scrollEl?.removeEventListener('click', this._bulkDeleteScrollCapture, true);
      this._bulkDeleteScrollCapture = null;
    }
    try { this._updateChatBottomPadding(); } catch (e) {}
  },

  _updateBulkDeleteBar() {
    const bar = document.getElementById('yd-bulk-delete-bar');
    if (!bar) return;
    const count = this._bulkDeleteSelectedIds ? this._bulkDeleteSelectedIds.size : 0;
    const countEl = bar.querySelector('#yd-bulk-delete-count');
    const confirmBtn = bar.querySelector('[data-act="confirm"]');
    if (countEl) countEl.textContent = String(count);
    if (confirmBtn) confirmBtn.disabled = count <= 0;
  },

  _ensureBulkDeleteBar() {
    let bar = document.getElementById('yd-bulk-delete-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'yd-bulk-delete-bar';
    bar.className = 'yd-bulk-delete-bar';
    bar.innerHTML = `
      <button type="button" class="yd-bulk-delete-bar__btn yd-bulk-delete-bar__btn--ghost" data-act="cancel">取消</button>
      <span class="yd-bulk-delete-bar__meta">已选择 <span id="yd-bulk-delete-count">0</span> 条</span>
      <button type="button" class="yd-bulk-delete-bar__btn yd-bulk-delete-bar__btn--danger" data-act="confirm" disabled>删除</button>
    `;
    bar.querySelector('[data-act="cancel"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._exitBulkDeleteMode();
    });
    bar.querySelector('[data-act="confirm"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this._confirmBulkDelete();
    });
    const footer = document.querySelector('#page-chat .yd-chat-input-wrapper');
    if (footer) footer.insertAdjacentElement('beforebegin', bar);
    else document.getElementById('page-chat')?.appendChild(bar);
    return bar;
  },

  _bindBulkDeleteScrollCapture() {
    const scroll = document.getElementById('chat-scroll');
    if (!scroll || this._bulkDeleteScrollCapture) return;
    this._bulkDeleteScrollCapture = (e) => {
      if (!this._bulkDeleteMode || !this._bulkDeleteSelectedIds) return;
      if (e.target.closest('#yd-bulk-delete-bar')) return;
      if (e.target.closest('.yd-bulk-delete-check-host')) return;
      const idHost = e.target.closest('[data-msg-id]');
      if (!idHost) return;
      const id = String(idHost.getAttribute('data-msg-id') || '').trim();
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      this._toggleBulkDeleteId(id);
    };
    scroll.addEventListener('click', this._bulkDeleteScrollCapture, true);
  },

  _toggleBulkDeleteId(id) {
    const key = String(id || '').trim();
    if (!key || !this._bulkDeleteSelectedIds) return;
    if (this._bulkDeleteSelectedIds.has(key)) this._bulkDeleteSelectedIds.delete(key);
    else this._bulkDeleteSelectedIds.add(key);
    const scroll = document.getElementById('chat-scroll');
    const checked = this._bulkDeleteSelectedIds.has(key);
    scroll?.querySelectorAll(`[data-msg-id="${CSS.escape(key)}"]`).forEach((el) => {
      const row = this._findBulkDeleteRowRoot(el);
      if (!row) return;
      row.classList.toggle('yd-message-bulk-selected', checked);
      const input = row.querySelector('.yd-bulk-delete-check__input');
      if (input) input.checked = checked;
    });
    this._updateBulkDeleteBar();
  },

  _findBulkDeleteRowRoot(el) {
    let node = el;
    while (node && node.parentElement) {
      if (node.parentElement.id === 'chat-scroll') return node;
      node = node.parentElement;
    }
    return el;
  },

  _clearBulkDeleteCheckboxHosts() {
    const scroll = document.getElementById('chat-scroll');
    if (!scroll) return;
    scroll.querySelectorAll('.yd-bulk-delete-check-host').forEach((n) => n.remove());
    scroll.querySelectorAll('.yd-message-bulk-selected').forEach((n) => n.classList.remove('yd-message-bulk-selected'));
  },

  _syncBulkDeleteCheckboxes() {
    if (!this._bulkDeleteMode || !this._bulkDeleteSelectedIds) return;
    const scroll = document.getElementById('chat-scroll');
    if (!scroll) return;
    this._clearBulkDeleteCheckboxHosts();

    const seen = new Set();
    const list = Array.isArray(this.messages) ? this.messages : [];
    for (const msg of list) {
      if (!this._isBulkDeleteEligibleMessage(msg)) continue;
      const id = String(msg.id);
      if (seen.has(id)) continue;
      seen.add(id);

      const els = scroll.querySelectorAll(`[data-msg-id="${CSS.escape(id)}"]`);
      if (!els.length) continue;
      const row = this._findBulkDeleteRowRoot(els[0]);
      if (!row) continue;

      const host = document.createElement('div');
      host.className = 'yd-bulk-delete-check-host';
      const label = document.createElement('label');
      label.className = 'yd-bulk-delete-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'yd-bulk-delete-check__input';
      input.checked = this._bulkDeleteSelectedIds.has(id);
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        if (input.checked) this._bulkDeleteSelectedIds.add(id);
        else this._bulkDeleteSelectedIds.delete(id);
        scroll.querySelectorAll(`[data-msg-id="${CSS.escape(id)}"]`).forEach((el) => {
          const r = this._findBulkDeleteRowRoot(el);
          if (r) r.classList.toggle('yd-message-bulk-selected', input.checked);
        });
        this._updateBulkDeleteBar();
      });
      label.appendChild(input);
      host.appendChild(label);
      row.insertBefore(host, row.firstChild);
      row.classList.toggle('yd-message-bulk-selected', input.checked);
    }
    this._updateBulkDeleteBar();
  },

  _enterBulkDeleteMode(seedMsg) {
    this._closeMsgActionBar();
    this._bulkDeleteMode = true;
    this._bulkDeleteSelectedIds = new Set();
    if (seedMsg && seedMsg.id != null) {
      this._bulkDeleteSelectedIds.add(String(seedMsg.id));
    }
    const page = document.getElementById('page-chat');
    page?.classList.add('yd-page-chat--bulk-delete');
    this._ensureBulkDeleteBar();
    this._bindBulkDeleteScrollCapture();
    this._syncBulkDeleteCheckboxes();
    this._updateBulkDeleteBar();
    try { this._updateChatBottomPadding(); } catch (e) {}
  },

  async _confirmBulkDelete() {
    const ids = this._bulkDeleteSelectedIds ? Array.from(this._bulkDeleteSelectedIds) : [];
    if (!ids.length) return;
    const ok = window.confirm(`确定删除已选的 ${ids.length} 条消息？`);
    if (!ok) return;
    this._exitBulkDeleteMode();
    await this._deleteMessagesByIds(ids);
  },

  _openMsgActionBar({ anchorEl, msg, editSeedText = '' }) {
    try {
      if (!anchorEl || !msg) return;
      if (this._bulkDeleteMode) return;
      this._closeMsgActionBar();

      const overlay = document.createElement('div');
      overlay.id = 'yd-chat-msg-actions';
      overlay.className = 'yd-chat-msg-actions';
      overlay.innerHTML = `
        <div class="yd-chat-msg-actions__panel" role="dialog" aria-label="消息操作">
          <button type="button" class="yd-chat-msg-actions__btn" data-act="edit">编辑</button>
          <button type="button" class="yd-chat-msg-actions__btn" data-act="redo">重说</button>
          <button type="button" class="yd-chat-msg-actions__btn" data-act="delete">删除</button>
        </div>
      `;
      document.body.appendChild(overlay);

      const panel = overlay.querySelector('.yd-chat-msg-actions__panel');
      const rect = anchorEl.getBoundingClientRect();
      // 先显示（让浏览器计算宽高），再定位
      const panelRect = panel.getBoundingClientRect();

      const preferTop = rect.top > 90;
      const top = preferTop
        ? Math.max(12, rect.top - panelRect.height - 8)
        : Math.min(window.innerHeight - panelRect.height - 12, rect.bottom + 8);
      const left = Math.min(
        window.innerWidth - panelRect.width - 12,
        Math.max(12, rect.left + (rect.width - panelRect.width) / 2)
      );
      panel.style.top = top + 'px';
      panel.style.left = left + 'px';

      const close = () => this._closeMsgActionBar();
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      const onRelayout = () => close();
      const onPointerDown = (e) => {
        if (!panel.contains(e.target)) close();
      };
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', onRelayout, true);
      window.addEventListener('resize', onRelayout, true);
      window.addEventListener('pointerdown', onPointerDown, true);
      this._msgActionBarCleanup = () => {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onRelayout, true);
        window.removeEventListener('resize', onRelayout, true);
        window.removeEventListener('pointerdown', onPointerDown, true);
      };

      const btnEdit = overlay.querySelector('[data-act="edit"]');
      const btnRedo = overlay.querySelector('[data-act="redo"]');
      const btnDelete = overlay.querySelector('[data-act="delete"]');

      const getRawText = () => String(msg.content || '').trim();

      btnEdit?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 编辑：支持用户/角色，且编辑整条 message.content（一次回复可能有多条格式消息）
        const seed = String(editSeedText || anchorEl?.textContent || '').trim();
        this._openEditMsgModal({ msg, seedText: seed });
        close();
      });

      btnRedo?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await this._shouldUseOfflineOpeningRedo(msg)) {
          const isFail =
            !!msg._offlineOpeningError ||
            String(msg.content || '').startsWith('生成开场白失败：');
          const ok = window.confirm(
            isFail
              ? '将重新请求生成线下开场白，是否继续？'
              : '将删除当前开场白并重新生成，是否继续？'
          );
          if (!ok) return;
          close();
          await this._redoOfflineOpeningFlow(msg);
          return;
        }
        // 二次确认 + 回滚删除后续消息
        const ok = window.confirm('将删除该消息之后的所有对话并重新生成，是否继续？');
        if (!ok) return;
        close();
        await this._redoFromMessage(msg);
      });

      btnDelete?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
        this._enterBulkDeleteMode(msg);
      });
    } catch (e) {}
  },
  
  // 初始化
  init() {
    this.setupEvents();
    this.initComposerToolbar();
    this.loadSessions();
    this._refreshChatHeaderUnreadBadge();
    // 兼容旧版本：无会话背景时可回落全局背景
    this.loadChatBackground();
    // 自动清理旧版/测试遗留的“模拟会话”（有就清理，没有就不处理）
    this.autoClearMockSessions();
  },

  _scheduleChatListRefresh() {
    // 会话列表预览依赖 renderChatList() 重新计算最新一句话；
    // 接收消息时会高频写入（分段/逐条），这里做轻量防抖，避免频繁全量扫描 messages。
    this._chatListRefreshPending = true;
    if (this._chatListRefreshTimer) return;
    this._chatListRefreshTimer = window.setTimeout(async () => {
      this._chatListRefreshTimer = null;
      if (!this._chatListRefreshPending) return;
      this._chatListRefreshPending = false;
      try {
        await this.renderChatList();
        await this._refreshChatHeaderUnreadBadge();
      } catch (e) {}
    }, 180);
  },

  _isUnreadBadgeEnabledGlobal() {
    try {
      const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CHAT_UNREAD_BADGE_ENABLED) || 'chat_unread_badge_enabled';
      const raw = Storage.get(key);
      if (raw === true || raw === 'true' || raw === 1 || raw === '1' || raw === 'on') return true;
      if (raw === false || raw === 'false' || raw === 0 || raw === '0' || raw === 'off') return false;
    } catch (e) {}
    return true;
  },

  _setUnreadBadgeEnabledGlobal(enabled) {
    try {
      const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CHAT_UNREAD_BADGE_ENABLED) || 'chat_unread_badge_enabled';
      Storage.set(key, !!enabled);
    } catch (e) {}
  },

  async _refreshChatHeaderUnreadBadge() {
    const badgeEl = document.getElementById('chat-back-unread-badge');
    if (!badgeEl) return;
    const hide = () => {
      badgeEl.textContent = '';
      badgeEl.hidden = true;
      badgeEl.setAttribute('hidden', 'true');
      // 双保险：避免自定义 CSS 意外覆盖 [hidden] 的 display
      badgeEl.style.display = 'none';
    };
    if (!this._isUnreadBadgeEnabledGlobal()) {
      hide();
      return;
    }
    let sessions = [];
    try {
      sessions = await Storage.dbGetAll('sessions');
    } catch (e) {
      sessions = [];
    }
    const curSid = String(this.currentSessionId || '').trim();
    /** 没有任何消息的会话不参与未读统计（也不应显示列表徽标） */
    let sessionHasMessage = new Set();
    try {
      const msgs = await Storage.dbGetAll('messages');
      (Array.isArray(msgs) ? msgs : []).forEach((m) => {
        if (m && m.sessionId) sessionHasMessage.add(String(m.sessionId));
      });
    } catch (e) {
      sessionHasMessage = new Set();
    }
    let total = 0;
    (Array.isArray(sessions) ? sessions : []).forEach((s) => {
      if (!s || !s.id) return;
      if (String(s.id) === curSid) return;
      if (!sessionHasMessage.has(String(s.id))) return;
      const n = Number(s.unreadCount || 0);
      if (Number.isFinite(n) && n > 0) total += Math.floor(n);
    });
    if (total <= 0) {
      hide();
      return;
    }
    badgeEl.textContent = total > 99 ? '99+' : String(total);
    badgeEl.hidden = false;
    badgeEl.removeAttribute('hidden');
    badgeEl.style.display = 'inline-flex';
  },

  async _increaseSessionUnreadIfNeeded(sessionId, viewingTarget = false) {
    const sid = String(sessionId || '').trim();
    if (!sid || viewingTarget) return;
    try {
      const s = await Storage.dbGet('sessions', sid);
      if (!s) return;
      const prev = Number(s.unreadCount || 0);
      s.unreadCount = Number.isFinite(prev) && prev > 0 ? (Math.floor(prev) + 1) : 1;
      await Storage.dbPut('sessions', s);
    } catch (e) {}
    await this._refreshChatHeaderUnreadBadge();
  },

  async _clearSessionUnread(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    try {
      const s = await Storage.dbGet('sessions', sid);
      if (!s) return;
      if (Number(s.unreadCount || 0) <= 0) {
        await this._refreshChatHeaderUnreadBadge();
        return;
      }
      s.unreadCount = 0;
      await Storage.dbPut('sessions', s);
      if (this.currentSession && String(this.currentSession.id) === sid) {
        this.currentSession.unreadCount = 0;
      }
    } catch (e) {}
    await this._refreshChatHeaderUnreadBadge();
  },
  
  // 设置事件
  setupEvents() {
    // 聊天列表页面 - 返回按钮
    document.getElementById('chat-list-back').addEventListener('click', () => {
      State.backToHome();
    });
    
    // 聊天列表页面 - 新建会话按钮
    document.getElementById('chat-list-new').addEventListener('click', () => {
      this.showNewSessionPicker();
    });

    // 聊天对话页面 - 返回按钮
    document.getElementById('chat-back').addEventListener('click', () => {
      const sid = Chat.currentSessionId ? String(Chat.currentSessionId) : '';
      this._exitBulkDeleteMode();
      State.switchPage('page-chat-list');
      if (typeof ProactiveScheduler !== 'undefined' && ProactiveScheduler.onLeaveSession) {
        ProactiveScheduler.onLeaveSession(sid);
      }
    });

    if (!window.__ydChatBulkDeletePageBound) {
      window.__ydChatBulkDeletePageBound = true;
      window.addEventListener('yd:pagechange', (e) => {
        const from = String(e?.detail?.from || '');
        const to = String(e?.detail?.to || '');
        if (from === 'page-chat' && to !== 'page-chat' && Chat._bulkDeleteMode) {
          Chat._exitBulkDeleteMode();
        }
      });
    }

    // 进入会话时已清零 unreadCount，但列表 DOM 不会自动更新；回到列表须重绘以去掉红点/数字
    if (!window.__ydChatListPageBound) {
      window.__ydChatListPageBound = true;
      window.addEventListener('yd:pagechange', async (e) => {
        const to = String(e?.detail?.to || '');
        if (to !== 'page-chat-list') return;
        try {
          await Chat.renderChatList();
          await Chat._refreshChatHeaderUnreadBadge();
        } catch (err) {}
      });
    }

    const togetherPill = document.querySelector('#page-chat .yd-chat-title__together-pill');
    togetherPill?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const trackId = String(this.currentSession?.togetherListening?.trackId || '').trim();
      await this._openTogetherPlayerFromSession(trackId);
    });
    
    // 聊天对话页面 - 胶囊按钮：左侧三点 = 会话设置，右侧文案 = 切换线上/线下
    document.getElementById('chat-menu').addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.yd-chat-menu-icon')) {
        this.showSessionMenu();
        return;
      }
      if (t && t.closest && (t.closest('.yd-chat-menu-pill__left') || t.closest('.yd-chat-menu-pill__divider'))) {
        this.showModeSwitchModal();
        return;
      }
      // 点到按钮空白区：按点击位置左右半区兜底
      const btn = e.currentTarget;
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width * 0.42) this.showSessionMenu();
      else this.showModeSwitchModal();
    });

    // 记忆资料点击查看全文（事件委托兜底，防止个别节点未绑定到单节点事件）
    const chatScroll = document.getElementById('chat-scroll');
    chatScroll?.addEventListener('click', (e) => {
      const target = e && e.target;
      if (!target || typeof target.closest !== 'function') return;

      // 1) 记忆资料点击查看全文
      const memoryEl = target.closest('.yd-message--memory');
      if (memoryEl) {
        e.preventDefault();
        e.stopPropagation();
        this._openMemoryDetailModal(memoryEl.textContent || '');
        return;
      }

    });
    
    // 发送消息
    document.getElementById('chat-send').addEventListener('click', () => {
      this.handleSendButtonClick();
    });
    
    // 回车发送
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendButtonClick();
      }
    });

    // 输入框自动高度：最多 3 行
    const inputEl = document.getElementById('chat-input');
    if (inputEl) {
      const resize = () => this._autoResizeTextarea(inputEl, 3);
      inputEl.addEventListener('input', resize);
      inputEl.addEventListener('input', () => this._updateSendButtonState());
      // 初始校准
      setTimeout(resize, 0);
    }

    // 初始按钮状态
    setTimeout(() => this._updateSendButtonState(), 0);
  },

  _openRedpacketModal() {
    this._ensureChatOverlayModalInBody('chat-redpacket-modal');
    const modal = document.getElementById('chat-redpacket-modal');
    const amountInput = document.getElementById('chat-redpacket-amount');
    const msgInput = document.getElementById('chat-redpacket-message');
    const display = document.getElementById('chat-redpacket-amount-display');
    const sendBtn = document.getElementById('chat-redpacket-send');
    if (!modal || !amountInput || !msgInput || !display || !sendBtn) return;

    amountInput.value = '';
    msgInput.value = '';
    display.textContent = '¥0.00';
    sendBtn.disabled = true;

    modal.classList.add('chat-redpacket-modal--active');
    modal.setAttribute('aria-hidden', 'false');

    const onInput = () => this._updateRedpacketDisplay();
    amountInput.removeEventListener?.('input', amountInput._ydRpHandler || (() => {}));
    amountInput._ydRpHandler = onInput;
    amountInput.addEventListener('input', onInput);
    msgInput.removeEventListener?.('input', msgInput._ydRpMsgHandler || (() => {}));
    msgInput._ydRpMsgHandler = onInput;
    msgInput.addEventListener('input', onInput);

    setTimeout(() => amountInput.focus(), 0);

    if (!this._redpacketBound) {
      this._redpacketBound = true;
      document.getElementById('chat-redpacket-cancel')?.addEventListener('click', () => this._closeRedpacketModal());
      document.getElementById('chat-redpacket-mask')?.addEventListener('click', () => this._closeRedpacketModal());
      sendBtn.addEventListener('click', () => this._confirmSendRedpacket());
    }
  },

  _closeRedpacketModal() {
    const modal = document.getElementById('chat-redpacket-modal');
    if (!modal) return;
    modal.classList.remove('chat-redpacket-modal--active');
    modal.setAttribute('aria-hidden', 'true');
  },

  _updateRedpacketDisplay() {
    const amountInput = document.getElementById('chat-redpacket-amount');
    const display = document.getElementById('chat-redpacket-amount-display');
    const sendBtn = document.getElementById('chat-redpacket-send');
    if (!amountInput || !display || !sendBtn) return;
    const raw = String(amountInput.value || '').trim();
    let num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      display.textContent = '¥0.00';
      sendBtn.disabled = true;
      return;
    }
    num = Math.min(20000, Math.max(0.01, num));
    display.textContent = `¥${num.toFixed(2)}`;
    sendBtn.disabled = false;
  },

  async _confirmSendRedpacket() {
    const amountInput = document.getElementById('chat-redpacket-amount');
    const msgInput = document.getElementById('chat-redpacket-message');
    if (!amountInput || !msgInput) return;
    const raw = String(amountInput.value || '').trim();
    let num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      amountInput.focus();
      return;
    }
    num = Math.min(20000, Math.max(0.01, num));
    const amountStr = num.toFixed(2);
    const blessingRaw = String(msgInput.value || '').trim();
    const blessing = blessingRaw || '恭喜发财';
    const toName = this._getChatCounterpartyName();
    try {
      await this._debitWalletForOutgoingChatPayment(num, `发红包给${toName}`);
    } catch (err) {
      const code = String(err?.message || '');
      if (code === 'wallet_not_activated') {
        alert('请先初始化并激活银行卡');
        if (typeof State !== 'undefined' && State.switchPage) State.switchPage('page-wallet');
        return;
      }
      if (code === 'wallet_insufficient_balance') {
        alert('余额不足，无法发红包');
        return;
      }
      alert('发红包失败，请稍后重试');
      return;
    }
    const text = `[红包]${amountStr}|${blessing}`;
    await this._queueUserMessage(text);
    this._closeRedpacketModal();
    this._updateSendButtonState();
  },

  _ensureChatOverlayModalInBody(modalId) {
    const modal = document.getElementById(modalId);
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    return modal;
  },

  _getChatCounterpartyName() {
    return String(
      document.getElementById('chat-title-name-text')?.textContent
      || document.getElementById('chat-title-name')?.textContent
      || document.getElementById('chat-title')?.textContent
      || '对方'
    ).trim() || '对方';
  },

  _applyUserLabelToPeerMoneyActionText(text, userDisplayName) {
    const name = String(userDisplayName || '').trim() || '用户';
    if (!name || name === '用户') return String(text || '');
    let s = String(text || '');
    const patterns = [
      [/领取了用户的/g, `领取了${name}的`],
      [/退还了用户的/g, `退还了${name}的`],
      [/领取了「用户」的/g, `领取了「${name}」的`],
      [/退还了「用户」的/g, `退还了「${name}」的`],
      [/领取了"用户"的/g, `领取了"${name}"的`],
      [/退还了"用户"的/g, `退还了"${name}"的`]
    ];
    patterns.forEach(([re, rep]) => {
      s = s.replace(re, rep);
    });
    return s;
  },

  _formatActionDisplayText(text) {
    const name = String(this._sessionUserDisplayName || '').trim() || '用户';
    return this._applyUserLabelToPeerMoneyActionText(text, name);
  },

  async _debitWalletForOutgoingChatPayment(amount, billTitle) {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error('invalid_amount');
    }
    return true; // SC: 金额仅用于剧情展示。
  },

  async _openTransferModal() {
    this._ensureChatOverlayModalInBody('chat-transfer-modal');
    const modal = document.getElementById('chat-transfer-modal');
    const amountInput = document.getElementById('chat-transfer-amount');
    const msgInput = document.getElementById('chat-transfer-message');
    const titleEl = document.getElementById('chat-transfer-title');
    const sendBtn = document.getElementById('chat-transfer-send');
    if (!modal || !amountInput || !msgInput || !titleEl || !sendBtn) return;

    const toName = this._getChatCounterpartyName();
    titleEl.textContent = toName && toName !== '对方' ? `转账给 ${toName}` : '转账';

    amountInput.value = '';
    msgInput.value = '';
    sendBtn.disabled = true;

    modal.classList.add('chat-transfer-modal--active');
    modal.setAttribute('aria-hidden', 'false');

    const onInput = () => {
      const raw = String(amountInput.value || '').trim();
      const num = Number(raw);
      sendBtn.disabled = !(Number.isFinite(num) && num > 0);
    };
    amountInput.removeEventListener?.('input', amountInput._ydTfHandler || (() => {}));
    amountInput._ydTfHandler = onInput;
    amountInput.addEventListener('input', onInput);
    msgInput.removeEventListener?.('input', msgInput._ydTfMsgHandler || (() => {}));
    msgInput._ydTfMsgHandler = onInput;
    msgInput.addEventListener('input', onInput);

    setTimeout(() => amountInput.focus(), 0);

    if (!this._transferBound) {
      this._transferBound = true;
      document.getElementById('chat-transfer-cancel')?.addEventListener('click', () => this._closeTransferModal());
      document.getElementById('chat-transfer-mask')?.addEventListener('click', () => this._closeTransferModal());
      sendBtn.addEventListener('click', () => this._confirmSendTransfer());
    }
  },

  _closeTransferModal() {
    const modal = document.getElementById('chat-transfer-modal');
    if (!modal) return;
    modal.classList.remove('chat-transfer-modal--active');
    modal.setAttribute('aria-hidden', 'true');
  },

  async _confirmSendTransfer() {
    const amountInput = document.getElementById('chat-transfer-amount');
    const msgInput = document.getElementById('chat-transfer-message');
    if (!amountInput || !msgInput) return;
    const raw = String(amountInput.value || '').trim();
    let num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      amountInput.focus();
      return;
    }
    num = Math.min(100000000000, Math.max(0.01, num));
    const amountStr = num.toFixed(2);
    const remarkRaw = String(msgInput.value || '').trim();
    const remark = remarkRaw || '转账留言';
    const toName = this._getChatCounterpartyName();
    try {
      await this._debitWalletForOutgoingChatPayment(num, `转账给${toName}`);
    } catch (err) {
      const code = String(err?.message || '');
      if (code === 'wallet_not_activated') {
        alert('请先初始化并激活银行卡');
        if (typeof State !== 'undefined' && State.switchPage) State.switchPage('page-wallet');
        return;
      }
      if (code === 'wallet_insufficient_balance') {
        alert('余额不足，无法转账');
        return;
      }
      alert('转账失败，请稍后重试');
      return;
    }
    const text = `[转账]${amountStr}|${remark}`;
    await this._queueUserMessage(text);
    this._closeTransferModal();
    this._updateSendButtonState();
  },

  _openVoiceCallModal() {
    const modal = document.getElementById('voice-call-modal');
    const nameEl = document.getElementById('voice-call-name');
    const statusTextEl = document.getElementById('voice-call-status-text');
    const durationEl = document.getElementById('voice-call-duration');
    const messagesEl = document.getElementById('voice-call-messages');
    const inputEl = document.getElementById('voice-call-input');
    const sendBtn = document.getElementById('voice-call-send');
    const contentEl = modal ? modal.querySelector('.voice-call-content') : null;
    if (!modal || !nameEl || !statusTextEl || !durationEl || !messagesEl || !inputEl || !sendBtn || !contentEl) return;

    const indicatorEl = modal.querySelector('.voice-call-status-indicator');

    const toName = String(
      document.getElementById('chat-title-name-text')?.textContent
      || document.getElementById('chat-title-name')?.textContent
      || document.getElementById('chat-title')?.textContent
      || ''
    ).trim();
    nameEl.textContent = toName || '语音通话';

    // 标记：当前语音/视频弹窗正在活跃（用于避免异步回调写入错误页面）
    this._voiceCallActive = true;
    this._voiceCallTargetSessionId = String(this.currentSessionId || '');
    this._voiceCallInjectedStart = false;
    this._voiceCallInjectedConnected = false;
    this._voiceCallAppendAssistantToUi = false;

    // 呼叫建立前：先展示“正在等待对方接通...”，2 秒后再进入“通话中 + 计时”
    // 等待阶段不显示计时，并且“点号”做循环动画：... -> . -> .. -> ...
    const waitingBaseText = '正在等待对方接通';
    const dotsCycle = ['...', '.', '..'];
    let dotsIdx = 0;

    // 防止快速重复触发时存在旧定时器
    if (this._voiceCallDotsInterval) {
      window.clearInterval(this._voiceCallDotsInterval);
      this._voiceCallDotsInterval = null;
    }

    statusTextEl.textContent = waitingBaseText + dotsCycle[dotsIdx];
    durationEl.textContent = '';
    try { durationEl.style.visibility = 'hidden'; } catch (e) {}
    // 等待阶段：不显示绿点呼吸指示
    if (indicatorEl) indicatorEl.hidden = true;
    messagesEl.innerHTML = '';
    inputEl.value = '';

    this._voiceCallMode = 'voice';
    this._voiceCameraOn = false;
    this._voiceCallMuted = false;
    this._voiceCallSpeakerOn = false;

    // 等待阶段：先不启动计时
    this._voiceCallStartAt = null;
    if (this._voiceCallTimer) {
      window.clearInterval(this._voiceCallTimer);
      this._voiceCallTimer = null;
    }

    // 清理“等待接通”的旧定时器（防止快速重复触发）
    if (this._voiceCallWaitTimeout) {
      window.clearTimeout(this._voiceCallWaitTimeout);
      this._voiceCallWaitTimeout = null;
    }

    // 页面一打开：延迟到下一轮，让“视频通话按钮”里的 _enterVoiceCallVideoMode() 先把 mode 切成 video
    window.setTimeout(() => {
      this._injectVoiceCallStartMessage().catch(() => {});
    }, 0);

    const onConnected = async () => {
      // 等待结束：注入“已接通”（角色方）作为第 2 条消息（并写入会话）
      await this._injectVoiceCallConnectedMessage();

      // 接通：停止等待点号动画
      if (this._voiceCallDotsInterval) {
        window.clearInterval(this._voiceCallDotsInterval);
        this._voiceCallDotsInterval = null;
      }

      // 防止用户在等待期间先挂断
      if (!this._voiceCallStartAt) {
        this._voiceCallStartAt = Date.now();
      }

      // 根据当前模式设置状态文案
      if (statusTextEl) {
        statusTextEl.textContent = this._voiceCallMode === 'video'
          ? '视频通话中'
          : '通话中';
      }

      // 接通阶段：显示绿点
      if (indicatorEl) indicatorEl.hidden = false;

      try {
        if (durationEl) {
          durationEl.style.visibility = 'visible';
          durationEl.textContent = '00:00';
        }
      } catch (e) {}

      if (!this._voiceCallTimer) {
    this._voiceCallTimer = window.setInterval(() => this._tickVoiceCallDuration(), 1000);
      }
    this._tickVoiceCallDuration();
    };

    // 等待阶段：点号动画（约 2 秒内循环一次~多次）
    this._voiceCallDotsInterval = window.setInterval(() => {
      dotsIdx = (dotsIdx + 1) % dotsCycle.length;
      if (statusTextEl) statusTextEl.textContent = waitingBaseText + dotsCycle[dotsIdx];
    }, 500);

    // 展示等待态 2 秒
    this._voiceCallWaitTimeout = window.setTimeout(onConnected, 2000);

    contentEl.classList.remove('voice-call--video');
    contentEl.classList.add('voice-call--voice');
    modal.classList.add('voice-call-modal--active');
    modal.setAttribute('aria-hidden', 'false');

    const backdrop = document.getElementById('voice-call-backdrop');
    if (backdrop) backdrop.style.backgroundImage = '';

    if (!this._voiceCallBound) {
      this._voiceCallBound = true;
      const hangupBtn = document.getElementById('voice-call-hangup');
      const micBtn = document.getElementById('voice-call-mic');
      const speakerBtn = document.getElementById('voice-call-speaker');
      const backdrop = document.getElementById('voice-call-backdrop');
      if (micBtn) {
        micBtn.addEventListener('click', () => this._toggleVoiceMic());
      }
      if (speakerBtn) {
        speakerBtn.addEventListener('click', () => this._toggleVoiceSpeaker());
      }
      if (hangupBtn) {
        hangupBtn.addEventListener('click', () => this._endVoiceCall());
      }
      if (backdrop) {
        backdrop.addEventListener('click', () => this._endVoiceCall());
      }
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendVoiceCallMessage();
        }
      });
      sendBtn.addEventListener('click', () => this._sendVoiceCallMessage());
    }

    setTimeout(() => inputEl.focus(), 0);
  },

  async _injectVoiceCallStartMessage() {
    if (!this._voiceCallActive) return;
    if (this._voiceCallInjectedStart) return;
    if (!this._voiceCallTargetSessionId) return;

    const isVideo = this._voiceCallMode === 'video';
    const userText = isVideo ? '我发起了🎥视频通话' : '我发起了📞语音通话';
    this._voiceCallInjectedStart = true;

    // 1) 立即展示到通话弹窗（第 1 条）
    this._appendVoiceCallMessage('user', userText);

    // 2) 同步写入当前会话历史（IndexedDB + 内存 messages）
    const targetSessionId = String(this._voiceCallTargetSessionId);
    const now = Date.now();

    const userMsg = {
      id: State.generateId(),
      sessionId: targetSessionId,
      role: 'user',
      content: userText,
      createdAt: now
    };

    await Storage.dbAdd('messages', userMsg);

    // 若当前正在查看该会话，则刷新主聊天 UI
    if (String(this.currentSessionId || '') === targetSessionId && State.currentPage === 'page-chat') {
      this.messages.push(userMsg);
      await this.renderMessages();
      this._scheduleChatListRefresh();
    } else {
      this._scheduleChatListRefresh();
    }

    // 更新会话时间
    try {
      const session = await Storage.dbGet('sessions', targetSessionId);
      if (session) {
        session.updatedAt = Date.now();
        await Storage.dbPut('sessions', session);
      }
    } catch (e) {}
  },

  async _injectVoiceCallConnectedMessage() {
    if (!this._voiceCallActive) return;
    if (this._voiceCallInjectedConnected) return;
    if (!this._voiceCallTargetSessionId) return;

    this._voiceCallInjectedConnected = true;

    const isVideo = this._voiceCallMode === 'video';
    const roleText = isVideo ? '[消息]🎥视频通话已接通' : '[消息]📞语音通话已接通';

    // 1) 立即展示到通话弹窗（第 2 条）
    this._appendVoiceCallMessage('role', roleText);

    // 2) 写入当前会话历史（确保带 characterId 以显示头像）
    const targetSessionId = String(this._voiceCallTargetSessionId);
    const now = Date.now();

    let roleCharacterId = null;
    let roleCharacterName = null;
    try {
      let session = this.currentSession;
      if (!session || String(session.id || '') !== targetSessionId) {
        session = await Storage.dbGet('sessions', targetSessionId);
      }
      const participantIds = Array.isArray(session?.participantCharacterIds)
        ? session.participantCharacterIds.filter(Boolean)
        : [];

      // 兼容旧结构：participantCharacterIds 缺失时尝试 session.characterId
      roleCharacterId = participantIds.length
        ? String(participantIds[0])
        : (session?.characterId ? String(session.characterId) : null);

      if (roleCharacterId) {
        const characterMap = await this.getCharacterMap();
        const roleChar = characterMap.get(String(roleCharacterId));
        roleCharacterName = roleChar?.name || null;
      }
    } catch (e) {}

    const assistantMsg = {
      id: State.generateId(),
      sessionId: targetSessionId,
      role: 'assistant',
      content: roleText,
      createdAt: now,
      characterId: roleCharacterId,
      characterName: roleCharacterName
    };

    await Storage.dbAdd('messages', assistantMsg);
    const viewingTarget = String(this.currentSessionId || '') === targetSessionId && State.currentPage === 'page-chat';
    await this._increaseSessionUnreadIfNeeded(targetSessionId, viewingTarget);

    if (viewingTarget) {
      this._plainStreamPendingMsgIds.add(String(assistantMsg.id));
      this.messages.push(assistantMsg);
      await this.renderMessages();
      this._scheduleChatListRefresh();
    } else {
      this._scheduleChatListRefresh();
    }

    try {
      const session = await Storage.dbGet('sessions', targetSessionId);
      if (session) {
        session.updatedAt = Date.now();
        await Storage.dbPut('sessions', session);
      }
    } catch (e) {}
  },

  _tickVoiceCallDuration() {
    const durationEl = document.getElementById('voice-call-duration');
    if (!durationEl || !this._voiceCallStartAt) return;
    const diffSec = Math.max(0, Math.floor((Date.now() - this._voiceCallStartAt) / 1000));
    const mm = String(Math.floor(diffSec / 60)).padStart(2, '0');
    const ss = String(diffSec % 60).padStart(2, '0');
    durationEl.textContent = `${mm}:${ss}`;
  },

  async _sendVoiceCallMessage() {
    const messagesEl = document.getElementById('voice-call-messages');
    const inputEl = document.getElementById('voice-call-input');
    const sendBtn = document.getElementById('voice-call-send');
    if (!messagesEl || !inputEl) return;
    const raw = String(inputEl.value || '').trim();
    if (!raw) return;
    if (!this._voiceCallActive) return;
    if (this._voiceCallSending) return;

    // 等待“正在接通”阶段结束前，不触发 API
    const isWaitingStage = !this._voiceCallStartAt && !!this._voiceCallWaitTimeout;
    if (isWaitingStage) return;

    // 锁定当前会话到“本次通话绑定的会话”，避免用户切走后写入错误
    const targetSessionId = String(this._voiceCallTargetSessionId || '');
    if (targetSessionId && String(this.currentSessionId || '') !== targetSessionId) {
      this.currentSessionId = targetSessionId;
      try {
        this.currentSession = await Storage.dbGet('sessions', targetSessionId);
      } catch (e) {}
    }

    this._appendVoiceCallMessage('user', raw);
    inputEl.value = '';

    // 走主聊天的两段式发送：入队 -> 仅 flush 当前这条 -> callAI
    this._voiceCallSending = true;
    this._setVoiceCallSendLoading(sendBtn, true);
    try {
      const pendingId = await this._queueUserMessage(raw);
      this._voiceCallAppendAssistantToUi = true;
      await this._flushPendingMessages([pendingId], {
        voiceCallRequest: true,
        voiceCallMode: this._voiceCallMode
      });
    } finally {
      this._voiceCallSending = false;
      this._setVoiceCallSendLoading(sendBtn, false);
    }
  },

  _setVoiceCallSendLoading(btn, loading) {
    if (!btn) return;
    if (!btn.dataset.originHtml) {
      btn.dataset.originHtml = btn.innerHTML;
    }
    if (loading) {
      btn.disabled = true;
      btn.classList.add('voice-call-send-btn--loading');
      btn.innerHTML = `
        <svg class="voice-call-send-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25"></circle>
          <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>
        </svg>
      `;
      return;
    }
    btn.disabled = false;
    btn.classList.remove('voice-call-send-btn--loading');
    if (btn.dataset.originHtml) {
      btn.innerHTML = btn.dataset.originHtml;
    }
  },

  _appendVoiceCallMessage(side, text) {
    const messagesEl = document.getElementById('voice-call-messages');
    if (!messagesEl || !text) return;

    const raw = String(text || '');
    const lines = raw
      .split('\n')
      .map(l => String(l || '').trim())
      .filter(Boolean);

    if (!lines.length) return;

    const appendSimpleText = (line) => {
    const row = document.createElement('div');
    row.className = `voice-call-message ${
      side === 'role' ? 'voice-call-message--role' : 'voice-call-message--user'
    }`;
      row.textContent = line;
    messagesEl.appendChild(row);
    };

    lines.forEach((line) => {
      const parsed = this._parseVoiceCallTaggedLine(line);
      if (parsed) {
        if (parsed.type === '消息') {
          appendSimpleText(parsed.body || '');
          return;
        }
        if (parsed.type === '语音') {
          this._appendVoiceCallVoiceMessage(side, parsed.body || '');
          return;
        }
        if (parsed.type === '动作') {
          this._appendVoiceCallActionMessage(side, parsed.body || '');
          return;
        }
      }
      appendSimpleText(line);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  },

  _parseVoiceCallTaggedLine(line) {
    // 允许：
    // - [语音]内容
    // - [语音|角色名]内容
    // - [动作]内容
    // - [动作|角色名]内容
    const m = String(line || '').trim().match(/^\[([^\]|]+)(?:\|([^\]]+))?\](.*)$/);
    if (!m) return null;
    const type = String(m[1] || '').trim();
    const roleName = String(m[2] || '').trim();
    const body = String(m[3] || '').trim();
    if (!type || !body) return null;
    return { type, roleName, body };
  },

  _appendVoiceCallVoiceMessage(side, voiceText) {
    const messagesEl = document.getElementById('voice-call-messages');
    if (!messagesEl || !voiceText) return;

    const text = String(voiceText || '').trim();
    if (!text) return;

    const durationSec = Math.max(1, Math.ceil(text.replace(/\s+/g, '').length / 2));

    // 通话页：保持“当前面板风格”，只复用语音播放控件内部的结构
    const wrapper = document.createElement('div');
    wrapper.className = `voice-call-message ${
      side === 'role' ? 'voice-call-message--role' : 'voice-call-message--user'
    } voice-call-message--voice`;

    const voiceEl = document.createElement('div');
    voiceEl.className = 'yd-voice-bubble voice-call-voice-bubble';
    voiceEl.setAttribute('data-voice-text', this.escapeHtml(text));
    voiceEl.setAttribute('role', 'presentation');

    voiceEl.innerHTML = `
      <button type="button" class="yd-voice-bubble__play" aria-label="播放语音">
        <svg class="yd-voice-bubble__svg yd-voice-bubble__svg--play" aria-hidden="true" viewBox="0 0 1024 1024" focusable="false">
          <path d="M819.498667 584.832L343.168 875.904A85.333333 85.333333 0 0 1 213.333333 803.114667V220.885333a85.333333 85.333333 0 0 1 129.834667-72.789333l476.330667 291.072a85.333333 85.333333 0 0 1 0 145.664z" fill="currentColor"></path>
        </svg>
        <svg class="yd-voice-bubble__svg yd-voice-bubble__svg--pause" aria-hidden="true" viewBox="0 0 24 24" focusable="false" style="display:none;">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"></path>
        </svg>
      </button>
      <div class="yd-voice-bubble__duration">
        <span class="yd-voice-bubble__duration-num">${durationSec}</span>
        <span class="yd-voice-bubble__waveform" aria-hidden="true">
          <span class="yd-voice-bubble__bar"></span>
          <span class="yd-voice-bubble__bar"></span>
          <span class="yd-voice-bubble__bar"></span>
          <span class="yd-voice-bubble__bar"></span>
        </span>
      </div>
    `;

    const playBtn = voiceEl.querySelector('.yd-voice-bubble__play');
    playBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      playBtn.classList.add('yd-voice-bubble__play--active');
      window.setTimeout(() => playBtn.classList.remove('yd-voice-bubble__play--active'), 180);

      if (voiceEl.classList.contains('yd-voice-bubble--playing')) {
        this._stopVoicePlayback();
        return;
      }
      try {
        await this._playVoiceText(text, voiceEl);
      } catch (err) {
        console.error('play voice_text failed:', err);
      }
    });

    const inline = document.createElement('div');
    inline.className = 'voice-call-voice-inline';
    inline.textContent = text;

    wrapper.appendChild(voiceEl);
    wrapper.appendChild(inline);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  },

  _appendVoiceCallActionMessage(side, actionText) {
    const messagesEl = document.getElementById('voice-call-messages');
    if (!messagesEl || !actionText) return;

    const text = String(actionText || '').trim();
    if (!text) return;

    const wrapper = document.createElement('div');
    wrapper.className = `voice-call-message ${
      side === 'role' ? 'voice-call-message--role' : 'voice-call-message--user'
    } voice-call-message--action`;

    const box = document.createElement('div');
    box.className = 'voice-call-action-box';
    box.textContent = text;

    wrapper.appendChild(box);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  },

  _toggleVoiceMute() {
    const btn = document.getElementById('voice-call-mute');
    const labelEl = btn ? btn.querySelector('span') : null;
    const statusTextEl = document.getElementById('voice-call-status-text');
    const durationEl = document.getElementById('voice-call-duration');
    const modal = document.getElementById('voice-call-modal');
    const indicatorEl = modal ? modal.querySelector('.voice-call-status-indicator') : null;
    const topChip = document.getElementById('voice-call-top-chip');
    const contentEl = modal ? modal.querySelector('.voice-call-content') : null;

    if (this._voiceCallMode === 'voice') {
      // 从语音切换到视频通话
      this._voiceCallMode = 'video';
      const isWaitingStage = !this._voiceCallStartAt && !!this._voiceCallWaitTimeout;
      if (!isWaitingStage && statusTextEl) {
        statusTextEl.textContent = '视频通话中';
        if (indicatorEl) indicatorEl.hidden = false;
      } else if (isWaitingStage) {
        // 等待接通阶段：不显示计时
        try {
          if (durationEl) {
            durationEl.textContent = '';
            durationEl.style.visibility = 'hidden';
          }
        } catch (e) {}
        if (indicatorEl) indicatorEl.hidden = true;
      }
      this._voiceCameraOn = true;
      if (topChip) {
        topChip.hidden = false;
        topChip.classList.add('voice-call-top-chip--on');
        topChip.textContent = '摄像头已开启';
      }
      if (labelEl) {
        labelEl.textContent = '切换';
      }
      if (btn) {
        btn.classList.add('voice-control-btn--active');
      }
      if (contentEl) {
        contentEl.classList.add('voice-call--video');
      }
      return;
    }

    // 视频模式下再次点击暂不做额外处理（保持视频通话状态）
  },

  _enterVoiceCallVideoMode() {
    const modal = document.getElementById('voice-call-modal');
    const contentEl = modal ? modal.querySelector('.voice-call-content') : null;
    const statusTextEl = document.getElementById('voice-call-status-text');
    const durationEl = document.getElementById('voice-call-duration');
    const indicatorEl = modal ? modal.querySelector('.voice-call-status-indicator') : null;
    const cameraBtn = document.getElementById('voice-call-speaker');
    if (!contentEl || !statusTextEl) return;

    this._voiceCallMode = 'video';
    this._voiceCameraOn = true;
    contentEl.classList.add('voice-call--video');
    contentEl.classList.remove('voice-call--voice');

    // 等待接通阶段：先保持“正在等待对方接通...”，不改文案、不展示计时
    const isWaitingStage = !this._voiceCallStartAt && !!this._voiceCallWaitTimeout;
    if (isWaitingStage) {
      try {
        if (durationEl) {
          durationEl.textContent = '';
          durationEl.style.visibility = 'hidden';
        }
        if (indicatorEl) indicatorEl.hidden = true;
      } catch (e) {}
    } else {
      statusTextEl.textContent = '视频通话中';
      if (indicatorEl) indicatorEl.hidden = false;
    }

    if (cameraBtn) {
      cameraBtn.classList.add('voice-control-btn--inverse');
      const labelEl = cameraBtn.querySelector('span');
      if (labelEl) labelEl.textContent = '摄像头';
    }

    this._applyVoiceCallVideoAvatars();
    this._setVoiceCallCameraUi(true);
    this._showVoiceCallToast('摄像头已开启');
  },

  async _applyVoiceCallVideoAvatars() {
    try {
      if (!this.currentSessionId) return;
      const session = await Storage.dbGet('sessions', this.currentSessionId);
      if (!session) return;

      const roleSrc = await this._resolveSessionRoleAvatar(session);
      const userSrc = await this._resolveSessionUserAvatar(session);

      const backdrop = document.getElementById('voice-call-backdrop');
      const selfImg = document.getElementById('voice-call-video-self-img');
      const selfFallback = document.getElementById('voice-call-video-self-fallback');
      const selfOff = document.getElementById('voice-call-video-self-off');

      if (backdrop) {
        backdrop.style.backgroundImage = roleSrc ? `url("${String(roleSrc).replace(/"/g, '\\"')}")` : '';
      }
      if (selfImg && selfFallback) {
        if (userSrc) {
          selfImg.src = userSrc;
          selfImg.style.display = 'block';
          selfFallback.style.display = 'none';
          selfImg.onerror = () => {
            selfImg.style.display = 'none';
            selfFallback.style.display = 'block';
            selfImg.onerror = null;
          };
        } else {
          selfImg.removeAttribute('src');
          selfImg.style.display = 'none';
          selfFallback.style.display = 'block';
        }
      }
      if (selfOff) {
        selfOff.style.display = this._voiceCameraOn ? 'none' : 'flex';
      }
    } catch (e) {
      console.warn('apply video avatars failed:', e);
    }
  },

  async _resolveSessionRoleAvatar(session) {
    let src = this._sanitizeAvatarSrc((session && typeof session.avatar === 'string') ? session.avatar : '');
    if (!src && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length === 1) {
      const map = await this.getCharacterMap();
      const c = map.get(String(session.participantCharacterIds[0]));
      if (c && typeof c.avatar === 'string') src = this._sanitizeAvatarSrc(c.avatar);
    }
    return src || '';
  },

  async _resolveSessionUserAvatar(session) {
    const effMask = await this._getEffectiveMaskForSession(session);
    const src = effMask && typeof effMask.avatar === 'string' ? effMask.avatar.trim() : '';
    return src || '';
  },

  /**
   * 会话列表里群聊宫格：第 1 格为「我」（当前会话面具），其后为角色，最多 4 格（与会话设置成员一致）
   */
  async _buildGroupChatListGridCells(session, characterMap) {
    const participantIds = Array.isArray(session?.participantCharacterIds)
      ? session.participantCharacterIds.filter(Boolean)
      : [];
    const userAvatar = await this._resolveSessionUserAvatar(session);
    const mask = await this._getEffectiveMaskForSession(session);
    const userName = String(mask?.name || '').trim() || '我';
    const cells = [
      {
        avatar: userAvatar ? String(userAvatar).trim() : '',
        name: userName
      }
    ];
    const chars = participantIds
      .map((id) => characterMap.get(String(id)))
      .filter((c) => c && (c.avatar || c.name));
    for (const c of chars) {
      if (cells.length >= 4) break;
      cells.push({
        avatar: c.avatar ? String(c.avatar).trim() : '',
        name: String(c.name || '').trim() || '成员'
      });
    }
    return cells;
  },

  _showVoiceCallToast(text) {
    const el = document.getElementById('voice-call-toast');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.add('voice-call-toast--show');
    if (this._voiceCallToastTimer) {
      window.clearTimeout(this._voiceCallToastTimer);
    }
    this._voiceCallToastTimer = window.setTimeout(() => {
      el.classList.remove('voice-call-toast--show');
    }, 1200);
  },

  _setVoiceCallCameraUi(isOn) {
    const btn = document.getElementById('voice-call-speaker');
    const labelEl = document.getElementById('voice-call-camera-label');
    const offEl = document.getElementById('voice-call-video-self-off');
    if (btn) {
      btn.classList.toggle('voice-control-btn--inverse', !!isOn);
    }
    if (labelEl) {
      labelEl.textContent = isOn ? '摄像头已开' : '摄像头已关';
    }
    if (offEl) {
      offEl.style.display = isOn ? 'none' : 'flex';
    }
  },

  _toggleVoiceMic() {
    const btn = document.getElementById('voice-call-mic');
    const labelEl = document.getElementById('voice-call-mic-label');
    this._voiceCallMicMuted = !this._voiceCallMicMuted;
    if (btn) {
      btn.classList.toggle('voice-control-btn--inverse', this._voiceCallMicMuted);
    }
    if (labelEl) {
      labelEl.textContent = this._voiceCallMicMuted ? '麦克风已关' : '麦克风已开';
    }
    this._showVoiceCallToast(this._voiceCallMicMuted ? '麦克风已关闭' : '麦克风已开启');
  },

  _toggleVoiceSpeaker() {
    if (this._voiceCallMode !== 'video') return;
    this._voiceCameraOn = !this._voiceCameraOn;
    this._setVoiceCallCameraUi(this._voiceCameraOn);
    this._showVoiceCallToast(this._voiceCameraOn ? '摄像头已开启' : '摄像头已关闭');
  },

  _endVoiceCall() {
    const modal = document.getElementById('voice-call-modal');
    const targetSessionId = String(this._voiceCallTargetSessionId || this.currentSessionId || '');
    const startAt = this._voiceCallStartAt;

    // 挂断：补一条用户消息“📞语音通话时长 mm:ss / 🎥视频通话时长 mm:ss”
    try {
      const sec = startAt ? Math.max(0, Math.floor((Date.now() - startAt) / 1000)) : 0;
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      const prefix = this._voiceCallMode === 'video' ? '🎥视频通话时长' : '📞语音通话时长';
      const durationText = `${prefix} ${mm}:${ss}`;

      if (targetSessionId) {
        const now = Date.now();
        const msg = {
          id: State.generateId(),
          sessionId: targetSessionId,
          role: 'user',
          content: durationText,
          createdAt: now
        };
        Storage.dbAdd('messages', msg).then(async () => {
          try {
            const s = await Storage.dbGet('sessions', targetSessionId);
            if (s) {
              s.updatedAt = Date.now();
              await Storage.dbPut('sessions', s);
            }
          } catch (e) {}
        }).catch(() => {});

        if (String(this.currentSessionId || '') === targetSessionId) {
          this.messages.push(msg);
          if (State.currentPage === 'page-chat') {
            this.renderMessages().catch(() => {});
          }
          this._scheduleChatListRefresh();
        } else {
          this._scheduleChatListRefresh();
        }
      }
    } catch (e) {}

    if (this._voiceCallTimer) {
      window.clearInterval(this._voiceCallTimer);
      this._voiceCallTimer = null;
    }

    if (this._voiceCallDotsInterval) {
      window.clearInterval(this._voiceCallDotsInterval);
      this._voiceCallDotsInterval = null;
    }

    if (this._voiceCallWaitTimeout) {
      window.clearTimeout(this._voiceCallWaitTimeout);
      this._voiceCallWaitTimeout = null;
    }

    this._voiceCallStartAt = null;
    this._voiceCallActive = false;
    this._voiceCallInjectedStart = false;
    this._voiceCallInjectedConnected = false;
    this._voiceCallAppendAssistantToUi = false;
    this._voiceCallTargetSessionId = '';
    if (modal) {
      modal.classList.remove('voice-call-modal--active');
      modal.setAttribute('aria-hidden', 'true');
    }
  },

  initComposerToolbar() {
    const select = document.getElementById('chat-model-select');
    const modelBtn = document.getElementById('chat-model-btn');
    const quoteBar = document.getElementById('chat-quote-bar');
    const quoteClose = document.getElementById('chat-quote-close');
    if (select) {
      const saved = Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || '';
      const defaults = [
        saved,
        'gpt-4o-mini',
        'gpt-4.1-mini',
        'gpt-3.5-turbo'
      ].filter(Boolean);
      const unique = Array.from(new Set(defaults));
      select.innerHTML = '';
      unique.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      });
      select.value = saved || unique[0] || '';
      if (modelBtn) modelBtn.title = select.value || '未选择模型';
      select.addEventListener('change', () => {
        Storage.set(CONFIG.STORAGE_KEYS.API_MODEL, select.value || '');
        const t = select.value || '未选择模型';
        if (modelBtn) modelBtn.title = t;
        const offlineModelBtn = document.getElementById('chat-offline-model-btn');
        if (offlineModelBtn) offlineModelBtn.title = t;
      });
    }

    const goApiSettingsFromChat = () => {
      State.apiSettingsReturnPage = 'page-chat';
      State.switchPage('page-settings-api');
      if (typeof Settings !== 'undefined' && Settings.loadSettings) {
        Settings.loadSettings();
      }
    };

    // 模型按钮：跳转到设置 - API 设置，返回时回到当前会话
    if (modelBtn) {
      modelBtn.addEventListener('click', goApiSettingsFromChat);
    }

    const offlineModelBtn = document.getElementById('chat-offline-model-btn');
    if (offlineModelBtn) {
      offlineModelBtn.addEventListener('click', goApiSettingsFromChat);
      try {
        const sel = document.getElementById('chat-model-select');
        offlineModelBtn.title = (sel && sel.value) || offlineModelBtn.title || '模型设置';
      } catch (e) {}
    }

    document.getElementById('chat-offline-regex-btn')?.addEventListener('click', () => {
      State.regexRulesReturnPage = 'page-chat';
      // 线下输入框上方图标进入：仅展示“当前会话主角色”的角色正则
      try {
        State.regexRulesCharacterFilterId = this.currentSession && this.currentSession.characterId
          ? String(this.currentSession.characterId || '').trim()
          : null;
      } catch (e) {
        State.regexRulesCharacterFilterId = null;
      }
      State.switchPage('page-global-regex');
    });
    document.getElementById('chat-offline-worldbook-btn')?.addEventListener('click', () => {
      State.worldbookReturnPage = 'page-chat';
      // 线下输入框上方图标进入：仅展示“当前会话主角色”的角色世界书
      try {
        State.worldbookCharacterFilterId = this.currentSession && this.currentSession.characterId
          ? String(this.currentSession.characterId || '').trim()
          : null;
      } catch (e) {
        State.worldbookCharacterFilterId = null;
      }
      State.switchPage('page-worldbook');
    });

    if (quoteClose) {
      quoteClose.addEventListener('click', () => this._clearQuote());
    }

    document.getElementById('chat-btn-redpacket')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openRedpacketModal();
    });
    document.getElementById('chat-btn-transfer')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openTransferModal();
    });
    document.getElementById('chat-btn-call')?.addEventListener('click', () => {
      this._openVoiceCallModal();
    });
    document.getElementById('chat-btn-video')?.addEventListener('click', () => {
      this._openVoiceCallModal();
      this._enterVoiceCallVideoMode();
    });
    document.getElementById('chat-btn-sticker')?.addEventListener('click', () => {
      this._toggleStickerStrip();
    });
    document.getElementById('chat-btn-image')?.addEventListener('click', () => {
      if (typeof Album !== 'undefined' && Album.openForImageMessage) {
        Album.openForImageMessage();
      } else {
        this._insertAtCursor('[图片]请描述图片内容');
      }
    });

    // 礼物：直接进入购物页
    document.getElementById('chat-btn-gift')?.addEventListener('click', () => {
      try { this._hideStickerStrip(); } catch (e) {}
      // 从商城返回到聊天页（保持同一会话）
      State.shopReturnPage = 'page-chat';
      State.shopReturnSessionId = this.currentSessionId ? String(this.currentSessionId) : null;
      State.switchPage('page-shop');
    });

    // 点击输入框时，自动收起表情栏，恢复工具栏
    const input = document.getElementById('chat-input');
    if (input) {
      input.addEventListener('focus', () => this._hideStickerStrip());
      input.addEventListener('click', () => this._hideStickerStrip());
    }

    // 点击聊天页面其它空白区域时，如果点的不在表情栏内，也收起表情栏
    const page = document.getElementById('page-chat');
    if (page) {
      page.addEventListener('click', (e) => {
        const target = e.target;
        const strip = document.getElementById('chat-sticker-strip');
        const stickerBtn = document.getElementById('chat-btn-sticker');
        if (!strip) return;
        if (!strip.hasAttribute('hidden')) {
          if (strip.contains(target) || (stickerBtn && stickerBtn.contains(target))) {
            return;
          }
          this._hideStickerStrip();
        }
      });
    }
  },

  _insertAtCursor(text) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const value = String(input.value || '');
    const start = typeof input.selectionStart === 'number' ? input.selectionStart : value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    input.value = next;
    const pos = start + text.length;
    try { input.setSelectionRange(pos, pos); } catch (e) {}
    input.focus();
    this._updateSendButtonState();
  },

  _setInputTextDirect(text) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const next = String(text || '');
    input.value = next;
    const pos = next.length;
    try { input.setSelectionRange(pos, pos); } catch (e) {}
    input.focus();
    this._autoResizeTextarea(input, 3);
    this._updateSendButtonState();
  },

  // 仅写入输入框：不聚焦、不触发“正在输入”视觉联想
  _setInputTextSilent(text) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const next = String(text || '');
    input.value = next;
    const pos = next.length;
    try { input.setSelectionRange(pos, pos); } catch (e) {}
    this._autoResizeTextarea(input, 3);
    this._updateSendButtonState();
  },

  _clearInputSilent() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.value = '';
    try { input.setSelectionRange(0, 0); } catch (e) {}
    this._autoResizeTextarea(input, 3);
    this._updateSendButtonState();
  },

  /** 插入全角括号「（）」并把光标放在中间；可多次点击得到 （）（）… */
  _insertFullWidthParensPairAtCursor() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const pair = '（）';
    const value = String(input.value || '');
    const start = typeof input.selectionStart === 'number' ? input.selectionStart : value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : value.length;
    const next = value.slice(0, start) + pair + value.slice(end);
    input.value = next;
    const pos = start + 1;
    try { input.setSelectionRange(pos, pos); } catch (e) {}
    input.focus();
    this._autoResizeTextarea(input, 3);
    this._updateSendButtonState();
  },

  _getSendSvgs() {
    // 伪发送（入队）
    const queueSvg = `
      <svg class="icon" viewBox="0 0 1024 1024" width="20" height="20" aria-hidden="true">
        <path d="M392.021333 925.013333a34.133333 34.133333 0 0 1-34.133333-34.133333V579.242667c0-10.24 4.608-19.968 12.629333-26.453334l276.48-224.085333a34.0992 34.0992 0 0 1 43.008 52.906667L426.154667 595.456v192.853333l82.944-110.592c10.069333-13.482667 28.672-17.578667 43.52-9.557333l137.557333 73.728L853.333333 156.16c3.242667-11.434667-3.413333-18.602667-6.485333-21.162667-3.072-2.56-11.093333-7.850667-21.845333-2.901333L206.336 422.4l80.213333 46.08c16.384 9.386667 22.016 30.208 12.629334 46.592s-30.208 22.016-46.592 12.629333l-137.045334-78.677333a33.979733 33.979733 0 0 1-17.066666-31.061333c0.512-12.8 8.021333-24.064 19.626666-29.525334L795.989333 70.314667c31.744-14.848 68.096-10.069333 94.890667 12.629333a87.790933 87.790933 0 0 1 28.16 91.477333L744.277333 801.28a34.082133 34.082133 0 0 1-48.981333 20.821333L546.133333 742.058667l-126.805333 169.301333c-6.656 8.704-16.896 13.653333-27.306667 13.653333z" fill="#80B7F9"/>
      </svg>
    `;
    // 真实发送（flush）
    const flushSvg = `
      <svg class="icon" viewBox="0 0 1024 1024" width="26" height="26" aria-hidden="true">
        <path d="M855.466667 179.2C765.866667 89.6 640 40.533333 512 42.666667c-128-2.133333-253.866667 46.933333-343.466667 136.533333-83.2 85.333333-128 196.266667-125.866666 311.466667 0 78.933333 21.333333 155.733333 57.6 221.866666l-34.133334 100.266667c-8.533333 29.866667-2.133333 61.866667 17.066667 83.2 17.066667 19.2 40.533333 29.866667 64 29.866667 4.266667 0 10.666667 0 14.933333-2.133334l147.2-27.733333c61.866667 27.733333 130.133333 40.533333 200.533334 40.533333h10.666666c125.866667 0 245.333333-49.066667 332.8-136.533333 85.333333-85.333333 130.133333-196.266667 125.866667-311.466667 4.266667-115.2-40.533333-224-123.733333-309.333333zM320 554.666667c-36.266667 0-64-27.733333-64-64s27.733333-64 64-64 64 27.733333 64 64-27.733333 64-64 64z m194.133333 0c-36.266667 0-64-27.733333-64-64s27.733333-64 64-64 64 27.733333 64 64-29.866667 64-64 64z m189.866667 0c-36.266667 0-64-27.733333-64-64s27.733333-64 64-64 64 27.733333 64 64-27.733333 64-64 64z" fill="#80B7F9"/>
      </svg>
    `;
    return { queueSvg, flushSvg };
  },

  /**
   * 相册条目 → 填入 API `image_url.url` 的字符串
   * - 选文件 / 链接导入成功：item.data 为 data:image;base64,...
   * - 链接导入仅保存链接：item.data 为 https?://...，原样传出（由模型服务端拉图，不经前端 base64）
   */
  _visionUrlFromAlbumItem(item) {
    const raw = String(item?.data || '').trim();
    if (!raw) return '';
    if (/^data:image\//i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    return '';
  },

  /** 相册 data 仅为 http(s) 链接（粘贴链接导入失败时的退化），无本地图像二进制 */
  _albumItemIsLinkOnly(item) {
    const raw = String(item?.data || '').trim();
    return /^https?:\/\//i.test(raw) && !/^data:image\//i.test(raw);
  },

  _isAlbumLinkOnlyHintDismissed() {
    try {
      const k =
        typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CHAT_ALBUM_LINK_ONLY_HINT_DISMISSED
          ? CONFIG.STORAGE_KEYS.CHAT_ALBUM_LINK_ONLY_HINT_DISMISSED
          : 'chat_album_link_only_hint_dismissed';
      return String((typeof Storage !== 'undefined' && Storage.get) ? Storage.get(k) : '').trim() === '1';
    } catch (e) {
      return false;
    }
  },

  _setAlbumLinkOnlyHintDismissed(on) {
    try {
      const k =
        typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CHAT_ALBUM_LINK_ONLY_HINT_DISMISSED
          ? CONFIG.STORAGE_KEYS.CHAT_ALBUM_LINK_ONLY_HINT_DISMISSED
          : 'chat_album_link_only_hint_dismissed';
      if (typeof Storage !== 'undefined' && Storage.set) Storage.set(k, on ? '1' : '0');
    } catch (e) {}
  },

  /**
   * 选择「仅链接」相册图时的说明弹窗
   * @returns {Promise<{ action: 'send' | 'later', suppressFuture?: boolean }>}
   */
  _openAlbumLinkOnlyHintModal() {
    const old = document.getElementById('yd-chat-album-link-hint');
    if (old) old.remove();

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'yd-chat-album-link-hint';
      overlay.className = 'yd-modal yd-modal--active';
      overlay.innerHTML = `
        <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="链接图片说明" style="max-width:440px;">
          <div class="yd-modal-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-right:4px;">
            <div style="font-weight:900;flex:1;min-width:0;">当前为「粘贴链接」导入的图片</div>
            <button type="button" data-act="close" aria-label="关闭" title="关闭"
              style="flex-shrink:0;width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:#666;font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
          </div>
          <div style="padding:14px 16px 12px;">
            <div style="font-size:13px;line-height:1.75;color:#333;">
              本地<strong>没有保存原始图像文件</strong>，仅保留了图片的图床存储地址。模型能否正确识别画面，取决于对方服务器是否允许访问该链接。
            </div>
            <div style="font-size:13px;line-height:1.75;color:#333;margin-top:10px;">
              建议您任选其一：<br>
              <strong>1.</strong> 在相册中用「选择文件」重新上传同一张图，再发送；<br>
              <strong>2.</strong> 为这张图写好<strong>备注/描述</strong>（或在发言里说明清楚），否则大模型可能无法可靠理解图片信息。
            </div>
            <div style="display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;">
              <button type="button" data-act="never" style="min-height:40px;padding:0 14px;border-radius:10px;border:1px solid rgba(0,0,0,.15);background:#fff;color:#333;font-size:12px;font-weight:700;cursor:pointer;max-width:52%;text-align:center;">不再提示此类提醒</button>
              <button type="button" data-act="send" style="min-height:40px;padding:0 22px;border-radius:10px;border:none;background:#111;color:#fff;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;">仍要发送</button>
            </div>
          </div>
        </div>
      `;

      const done = (payload) => {
        try {
          overlay.remove();
        } catch (e) {}
        resolve(payload);
      };

      overlay.querySelector('[data-act="send"]')?.addEventListener('click', () =>
        done({ action: 'send' })
      );
      overlay.querySelector('[data-act="never"]')?.addEventListener('click', () =>
        done({ action: 'send', suppressFuture: true })
      );
      overlay.querySelector('[data-act="close"]')?.addEventListener('click', () =>
        done({ action: 'later' })
      );

      document.body.appendChild(overlay);
    });
  },

  /**
   * @returns {Promise<'sent'|'cancelled'>}
   */
  async insertImageMessageFromAlbum(item) {
    if (!item) return 'cancelled';
    const rawDesc = (item.description || item.name || '').trim();
    if (!rawDesc) return 'cancelled';

    if (this._albumItemIsLinkOnly(item) && !this._isAlbumLinkOnlyHintDismissed()) {
      const hint = await this._openAlbumLinkOnlyHintModal();
      if (hint.action === 'later') return 'cancelled';
      if (hint.suppressFuture) this._setAlbumLinkOnlyHintDismissed(true);
    }

    const type = item && item.type === 'sticker' ? '表情包' : '图片';
    const text = `[${type}]${rawDesc}`;
    const visionUrl = this._visionUrlFromAlbumItem(item);
    const multimodalOn =
      typeof ChatMessageBuilder !== 'undefined' &&
      ChatMessageBuilder.isAutoVisionEnabled &&
      ChatMessageBuilder.isAutoVisionEnabled();
    await this._queueUserMessage(text, multimodalOn && visionUrl ? { imageDataUrl: visionUrl } : {});
    State.switchPage('page-chat');
    this._updateSendButtonState();
    return 'sent';
  },

  async _loadStickersIntoStrip() {
    const strip = document.getElementById('chat-sticker-scroll');
    if (!strip) return;
    strip.innerHTML = '';
    let items = [];
    try {
      const all = await Storage.dbGetAll('album');
      items = (all || []).filter(it => it && it.type === 'sticker');
    } catch (e) {
      console.error('读取表情包失败:', e);
      items = [];
    }
    if (!items.length) return;
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    items.forEach((item) => {
      const div = document.createElement('button');
      div.type = 'button';
      div.className = 'yd-chat-sticker-strip__item';
      div.style.backgroundImage = `url(${item.data})`;
      div.addEventListener('click', async () => {
        await this.insertImageMessageFromAlbum(item);
      });
      strip.appendChild(div);
    });
  },

  _toggleStickerStrip() {
    const bar = document.getElementById('chat-sticker-strip');
    if (!bar) return;
    const isHidden = bar.hasAttribute('hidden');
    if (isHidden) {
      this._showStickerStrip();
    } else {
      this._hideStickerStrip();
    }
  },

  _showStickerStrip() {
    const bar = document.getElementById('chat-sticker-strip');
    const toolbar = document.getElementById('chat-toolbar');
    if (!bar || !toolbar) return;
    // 隐藏工具栏，只展示表情栏
    toolbar.setAttribute('hidden', 'true');
    toolbar.style.display = 'none';
    bar.removeAttribute('hidden');
    bar.style.display = 'flex';
    this._loadStickersIntoStrip();
    const addBtn = document.getElementById('chat-sticker-add');
    if (addBtn && !addBtn._ydBound) {
      addBtn._ydBound = true;
      addBtn.addEventListener('click', () => {
        if (typeof Album !== 'undefined' && Album.openForStickerMessage) {
          Album.openForStickerMessage();
        } else if (typeof Album !== 'undefined' && Album.openForImageMessage) {
          Album.openForImageMessage();
        }
      });
    }
  },

  _hideStickerStrip() {
    const bar = document.getElementById('chat-sticker-strip');
    const toolbar = document.getElementById('chat-toolbar');
    if (!bar || !toolbar) return;
    bar.setAttribute('hidden', 'true');
    bar.style.display = 'none';
    const m = this._getCurrentSessionMode();
    if (m === 1) {
      toolbar.setAttribute('hidden', 'true');
      toolbar.style.display = 'none';
    } else {
      toolbar.removeAttribute('hidden');
      toolbar.style.display = 'flex';
    }
  },

  _updateSendButtonState() {
    const btn = document.getElementById('chat-send');
    const input = document.getElementById('chat-input');
    if (!btn || !input) return;

    const hasInput = String(input.value || '').trim().length > 0;
    const hasPending = Array.isArray(this._pendingUserQueue) && this._pendingUserQueue.length > 0;
    const { queueSvg, flushSvg } = this._getSendSvgs();

    // 真实发送进行中：避免按钮呈现“还需要再点一次 flush”的误导感。
    // 统一保持“伪发送”图标（禁用），等 flush 内部清队列后再恢复常态。
    if (this._flushingPending === true && !hasInput) {
      btn.disabled = true;
      btn.innerHTML = queueSvg;
      btn.setAttribute('aria-label', '发送中');
      return;
    }

    // 占位符：伪发送后（有 pending 无输入）提示确认发送
    input.placeholder = hasPending && !hasInput
      ? '继续补充，或点击右侧接收回复'
      : '输入消息...';

    // 有输入：永远是“伪发送（入队）”
    // 无输入但有 pending：显示“真实发送（flush）”
    // 都没有：禁用
    if (hasInput) {
      btn.disabled = false;
      btn.innerHTML = queueSvg;
      btn.setAttribute('aria-label', '发送（入队）');
      return;
    }
    if (hasPending) {
      btn.disabled = this._flushingPending === true;
      btn.innerHTML = flushSvg;
      btn.setAttribute('aria-label', '发送待发送消息');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = queueSvg;
    btn.setAttribute('aria-label', '发送');
  },

  async handleSendButtonClick() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = String(input.value || '').trim();

    // 1) 有输入：伪发送入队（允许囤积多条）
    if (text) {
      await this._ensurePseudoSendGuideOnFirstUse();
      await this._queueUserMessage(text);
      input.value = '';
      this._autoResizeTextarea(input, 3);
      this._updateSendButtonState();
      return;
    }

    // 2) 无输入：如果有 pending，则真实发送
    if (this._pendingUserQueue.length > 0) {
      await this._flushPendingMessages();
      this._updateSendButtonState();
    }
  },

  async _queueUserMessage(content, opts = null) {
    const text = String(content || '').trim();
    if (!text) return;

    const rawVision =
      opts && typeof opts === 'object' && opts.imageDataUrl
        ? String(opts.imageDataUrl).trim()
        : '';
    const autoVisionOn =
      typeof ChatMessageBuilder === 'undefined' ||
      !ChatMessageBuilder.isAutoVisionEnabled ||
      ChatMessageBuilder.isAutoVisionEnabled();
    const visionOk =
      !!rawVision &&
      autoVisionOn &&
      (typeof ChatMessageBuilder !== 'undefined' && ChatMessageBuilder.isVisionImageUrlForApi
        ? ChatMessageBuilder.isVisionImageUrlForApi(rawVision)
        : /^data:image\//i.test(rawVision) || /^https?:\/\//i.test(rawVision));
    const safeVisionUrl = visionOk ? rawVision : '';

    const mayEmbedMoneyId =
      /\[(?:转账|红包)(?:\|[^\]]+)?\]/.test(String(text || ''));
    const msgId = mayEmbedMoneyId ? this._generateMoneyMessageId() : State.generateId();
    let sessionForGroup = this.currentSession;
    try {
      if (!sessionForGroup && this.currentSessionId) {
        sessionForGroup = await Storage.dbGet('sessions', this.currentSessionId);
      }
    } catch (eSess) {}
    const isGroupQueue = !!(
      sessionForGroup &&
      Array.isArray(sessionForGroup.participantCharacterIds) &&
      sessionForGroup.participantCharacterIds.length > 1
    );
    let storedContent = text;
    const moneyInfo = this._parseMoneyMessage(text, isGroupQueue);
    if (moneyInfo) {
      storedContent = this._buildMoneyProtocolContent(moneyInfo, isGroupQueue, '', msgId);
    } else if (/\n/.test(text)) {
      storedContent = this.ensureMoneyMultilineContentWithMessageId(text, msgId, isGroupQueue);
    }

    const userMsg = {
      id: msgId,
      sessionId: this.currentSessionId,
      role: 'user',
      content: storedContent,
      createdAt: Date.now(),
      mode: this._getCurrentSessionMode(),
      _pending: true,
      ...(safeVisionUrl ? { imageDataUrl: safeVisionUrl } : {}),
      // 如果当前处于引用模式，把引用内容挂在消息上，方便后续 flush 统一格式化
      replyTo: this._currentQuote && this._currentQuote.text
        ? String(this._currentQuote.text || '').trim().slice(0, 120)
        : null
    };

    // _pending 是“仅内存”的临时标记，不应持久化到 IndexedDB，
    // 否则历史消息会长期携带 _pending 并被 historyForApi 过滤掉，导致请求体缺失 user 历史。
    const userMsgForDb = { ...userMsg };
    delete userMsgForDb._pending;
    await Storage.dbAdd('messages', userMsgForDb);
    this.messages.push(userMsg);
    this._pendingUserQueue.push(userMsg.id);
    this._clearQuote(); // 伪发送后自动取消引用栏（符合“一次引用”习惯）

    await this.renderMessages();
    this._scheduleChatListRefresh();

    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (session) {
      session.updatedAt = Date.now();
      await Storage.dbPut('sessions', session);
    }

    try {
      const info = this._parseMoneyMessage(storedContent, isGroupQueue);
      if (info) {
        this._registerPendingUserMoneyTx(userMsg.id, info, this.currentSessionId);
      }
      const collectInfo = this._parseCollectMessage(storedContent, isGroupQueue);
      if (collectInfo) {
        await this.applyMoneyCollectMessage({
          sessionId: this.currentSessionId,
          content: storedContent,
          collectMessageId: userMsg.id,
          role: 'user'
        });
      }
    } catch (eReceipt) {}

    return userMsg.id;
  },

  async _appendLocalUserAction(text, opts = null) {
    const content = String(text || '').trim();
    if (!content) return '';
    const skipRender = !!(opts && opts.skipRender);
    const msg = {
      id: State.generateId(),
      sessionId: this.currentSessionId,
      role: 'user',
      content,
      createdAt: Date.now(),
      mode: this._getCurrentSessionMode(),
      _localOnly: true
    };
    await Storage.dbAdd('messages', msg);
    this.messages.push(msg);
    if (!skipRender) {
      await this.renderMessages();
      this._scheduleChatListRefresh();
    }
    return msg.id;
  },

  _getMoneyActionsMap() {
    if (this._moneyActionsMem && typeof this._moneyActionsMem === 'object') {
      return this._moneyActionsMem;
    }
    try {
      const raw = Storage.get(this._MONEY_ACTIONS_KEY);
      if (raw && typeof raw === 'object') {
        this._moneyActionsMem = raw;
        return raw;
      }
    } catch (e) {}
    this._moneyActionsMem = {};
    return this._moneyActionsMem;
  },

  _flushMoneyActionsMap(all) {
    const map = all && typeof all === 'object' ? all : {};
    this._moneyActionsMem = map;
    try {
      Storage.set(this._MONEY_ACTIONS_KEY, map);
    } catch (e) {
      try {
        console.warn('[Chat] chat_money_actions 写入失败', e);
      } catch (e2) {}
    }
  },

  _setMoneyAction(messageId, payload) {
    if (!messageId) return;
    const all = this._getMoneyActionsMap();
    const record = { ...(payload || {}), senderMessageId: String(messageId) };
    all[String(messageId)] = record;
    if (record.receiptMessageId) {
      all[String(record.receiptMessageId)] = record;
    }
    this._flushMoneyActionsMap(all);
  },

  _setMoneyTxPair(senderMessageId, receiptMessageId, payload) {
    if (!senderMessageId) return;
    const all = this._getMoneyActionsMap();
    const record = {
      ...(payload || {}),
      senderMessageId: String(senderMessageId),
      receiptMessageId: receiptMessageId ? String(receiptMessageId) : ''
    };
    all[String(senderMessageId)] = record;
    if (receiptMessageId) all[String(receiptMessageId)] = record;
    this._flushMoneyActionsMap(all);
  },

  _getMoneyAction(messageId) {
    return this._getMoneyTxRecord(messageId);
  },

  _getMoneyTxRecord(messageId) {
    if (!messageId) return null;
    const all = this._getMoneyActionsMap();
    const direct = all[String(messageId)];
    if (direct) return direct;
    const keys = Object.keys(all);
    for (let i = 0; i < keys.length; i++) {
      const v = all[keys[i]];
      if (!v || typeof v !== 'object') continue;
      if (v.senderMessageId === String(messageId) || v.receiptMessageId === String(messageId)) {
        return v;
      }
    }
    return null;
  },

  _isMoneyReceiptMessage(msg) {
    if (!msg) return false;
    if (msg._moneyCollectNotice) return false;
    if (msg._moneyReceipt) return true;
    const tx = this._getMoneyTxRecord(String(msg.id || ''));
    return !!(tx && tx.receiptMessageId === String(msg.id || '') && !msg._moneyCollectNotice);
  },

  _isMoneyCollectNoticeMessage(msg) {
    return !!(msg && msg._moneyCollectNotice);
  },

  _findMessageInSessionMemory(messageId) {
    const mid = String(messageId || '').trim();
    if (!mid) return null;
    const fromMem = (this.messages || []).find((m) => String(m?.id || '') === mid);
    if (fromMem) return fromMem;
    const fromAll = (this._sessionAllMessages || []).find((m) => String(m?.id || '') === mid);
    return fromAll || null;
  },

  /** 已结清状态：优先消息 _moneyTxStatus，其次 chat_money_actions map */
  _getMoneySettledStatus(messageId, msg = null) {
    const mid = String(messageId || msg?.id || '').trim();
    if (!mid) return '';
    const row = msg || this._findMessageInSessionMemory(mid);
    const embedded = String(row?._moneyTxStatus || '').trim();
    if (embedded === 'received' || embedded === 'refunded') return embedded;
    const tx = this._getMoneyTxRecord(mid);
    const st = String(tx?.status || '').trim();
    return st === 'received' || st === 'refunded' ? st : '';
  },

  _isMoneySettled(messageId, msg = null) {
    return !!this._getMoneySettledStatus(messageId, msg);
  },

  _formatMoneyActionStatus(kind, status, opts = null) {
    const isReceipt = !!(opts && opts.isReceipt);
    const isUserSender = !!(opts && opts.isUserSender);
    if (status === 'received') {
      if (isUserSender) return '对方已领取';
      return isReceipt ? '已收款' : '已领取';
    }
    if (status === 'refunded') {
      if (isUserSender) return '对方已退还';
      return '已退还';
    }
    if (isReceipt) return kind === 'transfer' ? '待收款' : '待领取';
    if (isUserSender) return '待对方收款';
    if (opts && opts.isOutgoingAssistant) return '待对方收款';
    return kind === 'transfer' ? '待收款' : '待领取';
  },

  _resolveMoneyCardRenderCtx(msg, messageType, isUser) {
    const msgId = String(msg?.id || '');
    const isReceipt = this._isMoneyReceiptMessage(msg);
    const isOutboundUser = !!(
      isUser &&
      (messageType === 'transfer' || messageType === 'redpacket') &&
      !isReceipt &&
      !msg?._moneyCollectNotice
    );
    const embeddedStatus = String(msg?._moneyTxStatus || '').trim();
    let moneyTx = this._getMoneyTxRecord(msgId);
    if (embeddedStatus && isOutboundUser) {
      const isMoneySender = true;
      return {
        moneyTx,
        isMoneySender,
        isReceipt,
        status: embeddedStatus
      };
    }
    if (isOutboundUser && !moneyTx && !this._isMoneySettled(msgId, msg)) {
      const session = this.currentSession;
      const isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
      const info = this._parseMoneyMessage(msg.content, isGroup);
      if (info) {
        this._registerPendingUserMoneyTx(msgId, info, String(msg.sessionId || this.currentSessionId || ''));
        moneyTx = this._getMoneyTxRecord(msgId);
      }
    }
    if (
      !isUser &&
      !isReceipt &&
      (messageType === 'transfer' || messageType === 'redpacket') &&
      !moneyTx &&
      !this._isMoneySettled(msgId, msg)
    ) {
      const session = this.currentSession;
      const isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
      const info = this._parseMoneyMessage(msg.content, isGroup);
      if (info) {
        const fromName = String(msg.characterName || '').trim() || '对方';
        this._registerPendingAssistantMoneyTx(
          msgId,
          info,
          String(msg.sessionId || this.currentSessionId || ''),
          fromName
        );
        moneyTx = this._getMoneyTxRecord(msgId);
      }
    }
    const isMoneySender = isOutboundUser || !!(moneyTx && String(moneyTx.senderMessageId || '') === msgId);
    return {
      moneyTx,
      isMoneySender,
      isReceipt,
      status: String(moneyTx?.status || msg._moneyTxStatus || '')
    };
  },

  async _persistMoneyStatusOnMessage(msg, status) {
    if (!msg || !msg.id) return;
    const mid = String(msg.id);
    const st = String(status || '');
    msg._moneyTxStatus = st;
    const touch = (m) => {
      if (m && String(m.id || '') === mid) m._moneyTxStatus = st;
    };
    if (Array.isArray(this.messages)) this.messages.forEach(touch);
    if (Array.isArray(this._sessionAllMessages)) this._sessionAllMessages.forEach(touch);
    try {
      const row = await Storage.dbGet('messages', mid);
      if (row) {
        await Storage.dbPut('messages', { ...row, _moneyTxStatus: st });
      }
    } catch (e) {}
  },

  async _findUserMoneyMessageById(messageId, sessionId) {
    const mid = String(messageId || '').trim();
    const sid = String(sessionId || '').trim();
    if (!mid) return null;
    const matchSid = (m) => {
      if (!m || m.role !== 'user') return false;
      if (String(m.id || '') === mid) return true;
      if (!sid) return false;
      const ms = String(m.sessionId || '').trim();
      if (ms && ms !== sid) return false;
      let info = this._parseMoneyMessage(m.content, false);
      if (!info) info = this._parseMoneyMessage(m.content, true);
      return !!(info && String(info.messageId || '').trim() === mid);
    };
    const fromMem = (this.messages || []).find(matchSid);
    if (fromMem) return fromMem;
    const fromAll = (this._sessionAllMessages || []).find(matchSid);
    if (fromAll) return fromAll;
    try {
      const row = await Storage.dbGet('messages', mid);
      if (row && row.role === 'user') {
        if (!sid || String(row.sessionId || '') === sid) return row;
      }
    } catch (e) {}
    try {
      const list = await this._getSessionMessagesForMoneySync(sid);
      return list.find(matchSid) || null;
    } catch (e2) {
      return null;
    }
  },

  _findMoneyCollectNoticeForSender(messageList, sessionId, senderMessageId, opts = null) {
    const sid = String(sessionId || '').trim();
    const senderId = String(senderMessageId || '').trim();
    const wantRole = opts && opts.role ? String(opts.role) : '';
    if (!senderId) return null;
    const list = Array.isArray(messageList) ? messageList : [];
    const matchRole = (m) => !wantRole || String(m?.role || '') === wantRole;
    for (const m of list) {
      if (!m || !m._moneyCollectNotice) continue;
      if (!matchRole(m)) continue;
      if (sid) {
        const ms = String(m.sessionId || '').trim();
        if (ms && ms !== sid) continue;
      }
      if (String(m._moneyCollectLinkedId || '').trim() === senderId) return m;
    }
    for (const m of list) {
      if (!m || !m._moneyCollectNotice) continue;
      if (!matchRole(m)) continue;
      if (sid) {
        const ms = String(m.sessionId || '').trim();
        if (ms && ms !== sid) continue;
      }
      const raw = String(m.content || '').trim();
      if (!/^\[收取(?:红包|转账)/.test(raw)) continue;
      const segId = String(raw.split('|').pop() || '').trim();
      if (segId === senderId) return m;
    }
    return null;
  },

  _minMessageTsAfterMoneySender(list, senderId, senderTs, senderRole) {
    const sidRole = String(senderRole || '');
    let minAfter = Infinity;
    for (const m of list) {
      if (!m || m._moneyCollectNotice) continue;
      if (String(m.id || '') === senderId) continue;
      const ts = Number(m.createdAt) || 0;
      if (ts <= senderTs) continue;
      if (sidRole === 'user' && m.role !== 'assistant') continue;
      if (ts < minAfter) minAfter = ts;
    }
    return minAfter;
  },

  /**
   * 回执卡 createdAt：用户发红包/转账后角色收讫 → 在最后一条相关用户消息之后、角色正文之前；
   * 用户领角色款 → 紧挨角色发送卡之后。
   */
  _maxMessageListCreatedAt(messageList, excludeNoticeId = '') {
    const list = Array.isArray(messageList) ? messageList : [];
    let maxTs = 0;
    for (const m of list) {
      if (!m) continue;
      if (excludeNoticeId && String(m.id || '') === excludeNoticeId) continue;
      maxTs = Math.max(maxTs, Number(m.createdAt) || 0);
    }
    return maxTs;
  },

  _computeMoneyCollectNoticeAnchor(messageList, senderMsg, opts = null) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sender = senderMsg || null;
    const senderId = String(sender?.id || '');
    const senderTs = Number(sender?.createdAt) || 0;
    const senderRole = String(sender?.role || '');
    const settlementTs = Number(opts && opts.settlementTs) || 0;
    const excludeNoticeId = opts && opts.excludeNoticeId ? String(opts.excludeNoticeId) : '';
    const maxListTs = this._maxMessageListCreatedAt(list, excludeNoticeId);

    if (!senderTs) return settlementTs > 0 ? settlementTs : Date.now();

    if (senderRole === 'user') {
      let maxUserTs = senderTs;
      for (const m of list) {
        if (!m || m.role !== 'user') continue;
        const ts = Number(m.createdAt) || 0;
        if (ts >= senderTs) maxUserTs = Math.max(maxUserTs, ts);
      }
      let minAssistantAfter = Infinity;
      for (const m of list) {
        if (!m || m.role !== 'assistant' || m._moneyCollectNotice) continue;
        if (excludeNoticeId && String(m.id || '') === excludeNoticeId) continue;
        const ts = Number(m.createdAt) || 0;
        if (ts > maxUserTs && ts < minAssistantAfter) minAssistantAfter = ts;
      }
      let at = maxUserTs + 1;
      if (settlementTs > maxUserTs) {
        at = settlementTs;
      }
      if (Number.isFinite(minAssistantAfter) && minAssistantAfter > maxUserTs) {
        at = Math.min(at, minAssistantAfter - 1);
      }
      if (maxListTs > 0 && at > maxListTs + 1) {
        at = maxListTs + 1;
      }
      if (at <= senderTs) at = senderTs + 1;
      return at;
    }

    let minAfter = Infinity;
    for (const m of list) {
      if (!m || m._moneyCollectNotice) continue;
      if (excludeNoticeId && String(m.id || '') === excludeNoticeId) continue;
      if (String(m.id || '') === senderId) continue;
      const ts = Number(m.createdAt) || 0;
      if (ts > senderTs && ts < minAfter) minAfter = ts;
    }
    let at = senderTs + 1;
    if (settlementTs > senderTs) at = settlementTs;
    if (Number.isFinite(minAfter) && minAfter > senderTs) {
      at = Math.min(at, minAfter - 1);
    }
    if (maxListTs > 0 && at > maxListTs + 1) at = maxListTs + 1;
    return at;
  },

  _parseMoneyMessage(content, isGroup) {
    return this._parseUserMoneyMessage(content, isGroup);
  },

  /** 转账/红包正文第三段：6 位小写字母+数字 */
  _generateMoneyMessageId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let attempt = 0; attempt < 32; attempt++) {
      let id = '';
      for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
      if (!this._getMoneyTxRecord(id)) return id;
    }
    return String(Date.now() % 1e6).padStart(6, '0');
  },

  _buildMoneyCollectNoticeCardContent(info, linkedSenderMessageId, isGroup, characterName) {
    if (!info) return '';
    const amount = Number(info.amount) || 0;
    const linkedId = String(linkedSenderMessageId || '').trim();
    const ig = !!isGroup;
    const name = String(characterName || '').trim();
    if (info.kind === 'transfer') {
      return this._buildCollectTransferContent(amount, info.remark, linkedId, ig, name);
    }
    return this._buildCollectRedpacketContent(amount, info.blessing, linkedId, ig, name);
  },

  _formatMoneyCollectCardFooter(kind, status) {
    const refunded = String(status || '') === 'refunded';
    if (refunded) return '已退还';
    return '已领取';
  },

  _getCollectDisplayStatus(msg, isGroup) {
    const parsed = this._parseCollectMessage(msg?.content, isGroup);
    if (parsed && parsed.status) return parsed.status;
    if (String(msg?._moneyCollectStatus || '') === 'refunded') return 'refunded';
    return 'received';
  },

  _resolveMoneyCollectNoticeCreatedAt(messageList, senderMessageId, anchorCreatedAt = null) {
    const anchor = anchorCreatedAt != null ? Number(anchorCreatedAt) : NaN;
    if (Number.isFinite(anchor) && anchor > 0) return anchor;

    const list = Array.isArray(messageList) ? messageList : [];
    const senderId = String(senderMessageId || '').trim();
    const senderRoleForPin = String(
      list.find((x) => String(x?.id || '') === senderId)?.role || ''
    );
    const expectNoticeRole =
      senderRoleForPin === 'user' ? 'assistant' : senderRoleForPin === 'assistant' ? 'user' : '';
    const existingNotice = list.find((x) => {
      if (!x || !x._moneyCollectNotice) return false;
      if (String(x._moneyCollectLinkedId || '').trim() !== senderId) return false;
      if (expectNoticeRole && String(x.role || '') !== expectNoticeRole) return false;
      return true;
    });
    if (existingNotice) {
      const pinned = Number(existingNotice._moneyCollectAnchorAt) || 0;
      if (pinned > 0 && this._isMoneyCollectNoticePlacedOk(list, existingNotice, senderId)) {
        return pinned;
      }
    }

    const sender = list.find((x) => String(x?.id || '') === senderId);
    if (!sender) return Date.now();
    return this._computeMoneyCollectNoticeAnchor(list, sender, {
      excludeNoticeId: existingNotice ? String(existingNotice.id || '') : ''
    });
  },

  _isMoneyCollectNoticePlacedOk(messageList, noticeMsg, senderMessageId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const senderId = String(senderMessageId || '').trim();
    if (!noticeMsg || !senderId) return false;
    const sender = list.find((x) => String(x?.id || '') === senderId);
    const senderTs = Number(sender?.createdAt) || 0;
    const senderRole = String(sender?.role || '');
    const cur = Number(noticeMsg.createdAt) || 0;
    const noticeId = String(noticeMsg.id || '');
    if (!senderTs || !cur || cur <= senderTs) return false;

    if (senderRole === 'user') {
      let maxUserTs = senderTs;
      for (const m of list) {
        if (!m || m.role !== 'user') continue;
        const ts = Number(m.createdAt) || 0;
        if (ts >= senderTs) maxUserTs = Math.max(maxUserTs, ts);
      }
      if (cur <= maxUserTs) return false;
      const maxListTs = this._maxMessageListCreatedAt(list, noticeId);
      if (maxListTs > 0 && cur > maxListTs + 2000) return false;
      let minAssistantAfter = Infinity;
      for (const m of list) {
        if (!m || m.role !== 'assistant' || m._moneyCollectNotice) continue;
        if (noticeId && String(m.id || '') === noticeId) continue;
        const ts = Number(m.createdAt) || 0;
        if (ts > maxUserTs && ts < minAssistantAfter) minAssistantAfter = ts;
      }
      if (Number.isFinite(minAssistantAfter) && minAssistantAfter > maxUserTs) {
        return cur < minAssistantAfter;
      }
      return cur <= maxListTs + 2000;
    }

    let minAfter = Infinity;
    for (const m of list) {
      if (!m || m._moneyCollectNotice) continue;
      if (noticeId && String(m.id || '') === noticeId) continue;
      const ts = Number(m.createdAt) || 0;
      if (ts > senderTs && ts < minAfter) minAfter = ts;
    }
    const maxListTs = this._maxMessageListCreatedAt(list, noticeId);
    if (maxListTs > 0 && cur > maxListTs + 2000) return false;
    if (Number.isFinite(minAfter) && minAfter > senderTs) return cur < minAfter;
    return cur <= maxListTs + 2000;
  },

  _queueDeferredMoneyCollectNotice(entry) {
    if (!entry || !entry.sessionId || !entry.senderMessageId) return;
    if (!Array.isArray(this._deferredMoneyCollectNotices)) this._deferredMoneyCollectNotices = [];
    const key = `${entry.sessionId}:${entry.senderMessageId}`;
    this._deferredMoneyCollectNotices = this._deferredMoneyCollectNotices.filter(
      (x) => `${x.sessionId}:${x.senderMessageId}` !== key
    );
    this._deferredMoneyCollectNotices.push(entry);
  },

  async _flushDeferredMoneyCollectNotices(sessionId, anchorCreatedAt) {
    const sid = String(sessionId || '').trim();
    if (!sid || !Array.isArray(this._deferredMoneyCollectNotices)) return [];
    const pending = this._deferredMoneyCollectNotices.filter((x) => String(x.sessionId || '') === sid);
    if (!pending.length) return [];
    const anchor = Number(anchorCreatedAt);
    const ids = [];
    let list = [];
    try {
      list =
        String(this.currentSessionId || '') === sid && Array.isArray(this._sessionAllMessages)
          ? this._sessionAllMessages
          : await this._getSessionMessagesForMoneySync(sid);
    } catch (eList) {}
    const turnNow = Number.isFinite(anchor) && anchor > 0 ? anchor : Date.now();
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i];
      const senderRow =
        p.senderMsg ||
        list.find((x) => String(x?.id || '') === String(p.senderMessageId || '')) ||
        null;
      const txTs = senderRow
        ? Number(this._getMoneyTxRecord(String(p.senderMessageId || ''))?.ts) || 0
        : 0;
      const at = senderRow
        ? this._computeMoneyCollectNoticeAnchor(list, senderRow, {
            settlementTs: txTs > 0 ? txTs : turnNow + i,
            excludeNoticeId: ''
          })
        : turnNow + i;
      const id = await this._insertCharacterMoneyCollectNotice({
        ...p,
        anchorCreatedAt: at
      });
      if (id) ids.push(id);
    }
    this._deferredMoneyCollectNotices = this._deferredMoneyCollectNotices.filter(
      (x) => String(x.sessionId || '') !== sid
    );
    const pendingSenderIds = new Set(pending.map((p) => String(p.senderMessageId || '').trim()).filter(Boolean));
    const repaired = await this._repairMissingMoneyCollectNotices(sid, pendingSenderIds);
    if (repaired.length) ids.push(...repaired);

    if (ids.length) {
      this._moneyCollectionNeedsRender = true;
      if (String(this.currentSessionId || '') === sid) {
        this._forceFullRenderNext = true;
        try {
          await this.renderMessages();
        } catch (eRender) {}
      }
    }
    return ids;
  },

  async _repairMissingMoneyCollectNotices(sessionId, onlySenderIds = null) {
    const sid = String(sessionId || '').trim();
    if (!sid) return [];
    const list = await this._getSessionMessagesForMoneySync(sid);
    if (!list.length) return [];
    const limitSet =
      onlySenderIds instanceof Set
        ? onlySenderIds
        : onlySenderIds
          ? new Set(Array.isArray(onlySenderIds) ? onlySenderIds : [onlySenderIds])
          : null;
    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}
    const meta = await this._resolveReceiptAssistantMeta(await Storage.dbGet('sessions', sid));
    const userName = String(this._sessionUserDisplayName || '').trim() || '用户';
    const repaired = [];
    for (const m of list) {
      if (!m || m.role !== 'user') continue;
      const senderId = String(m.id || '');
      if (!senderId) continue;
      if (limitSet && !limitSet.has(senderId)) continue;
      const tx = this._getMoneyTxRecord(senderId);
      if (!tx || (tx.status !== 'received' && tx.status !== 'refunded')) continue;
      if (this._findMoneyCollectNoticeForSender(list, sid, senderId, { role: 'assistant' })) continue;
      let info = this._parseMoneyMessage(m.content, isGroup);
      if (!info) info = this._parseMoneyMessage(m.content, !isGroup);
      if (!info) continue;
      const id = await this._insertCharacterMoneyCollectNotice({
        sessionId: sid,
        senderMessageId: senderId,
        senderMsg: m,
        info,
        characterId: meta.characterId ? String(meta.characterId) : '',
        characterName: meta.characterName || '',
        userName,
        status: tx.status === 'refunded' ? 'refunded' : 'received'
      });
      if (id) repaired.push(id);
    }
    return repaired;
  },

  async _dedupeMoneyCollectNotices(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sid = String(sessionId || '').trim();
    if (!list.length || !sid) return false;
    const groups = new Map();
    for (const m of list) {
      if (!m || !m._moneyCollectNotice) continue;
      let senderId = String(m._moneyCollectLinkedId || '').trim();
      if (!senderId) {
        const raw = String(m.content || '').trim();
        if (/^\[收取(?:红包|转账)/.test(raw)) {
          senderId = String(raw.split('|').pop() || '').trim();
        }
      }
      if (!senderId) continue;
      const groupKey = `${senderId}:${String(m.role || '')}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(m);
    }
    let changed = false;
    const dropIds = new Set();
    for (const [groupKey, notices] of groups) {
      if (notices.length <= 1) continue;
      const senderId = String(groupKey.split(':')[0] || '');
      const tx = this._getMoneyTxRecord(senderId);
      const preferredId = String(tx?.receiptMessageId || '').trim();
      let keep = notices[0];
      if (preferredId) {
        const hit = notices.find((n) => String(n.id || '') === preferredId);
        if (hit) keep = hit;
      } else {
        keep = notices.reduce((a, b) =>
          (Number(a.createdAt) || 0) <= (Number(b.createdAt) || 0) ? a : b
        );
      }
      for (const drop of notices) {
        if (String(drop.id || '') === String(keep.id || '')) continue;
        dropIds.add(String(drop.id));
        try {
          await Storage.dbDelete('messages', String(drop.id));
        } catch (e) {}
        const idx = list.findIndex((x) => String(x?.id || '') === String(drop.id));
        if (idx >= 0) list.splice(idx, 1);
        changed = true;
      }
      const keepId = String(keep.id || '');
      if (keepId && tx) {
        this._setMoneyTxPair(senderId, keepId, {
          ...tx,
          receiptMessageId: keepId,
          collectNoticeMessageId: keepId
        });
      }
    }
    if (changed && dropIds.size) {
      const touch = (arr) => {
        if (!Array.isArray(arr)) return;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (dropIds.has(String(arr[i]?.id || ''))) arr.splice(i, 1);
        }
      };
      touch(this.messages);
      touch(this._sessionAllMessages);
    }
    return changed;
  },

  async _repositionMoneyCollectNotices(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sid = String(sessionId || '').trim();
    if (!list.length || !sid) return false;
    let changed = false;
    for (const m of list) {
      if (!m || !m._moneyCollectNotice) continue;
      const senderId = String(m._moneyCollectLinkedId || '').trim();
      if (!senderId) continue;
      const cur = Number(m.createdAt) || 0;
      if (this._isMoneyCollectNoticePlacedOk(list, m, senderId)) {
        if (!m._moneyCollectAnchorAt && cur > 0) {
          const pinned = { ...m, _moneyCollectAnchorAt: cur };
          try {
            await Storage.dbPut('messages', pinned);
          } catch (e) {}
          const touchPin = (arr) => {
            if (!Array.isArray(arr)) return;
            const idx = arr.findIndex((x) => String(x?.id || '') === String(pinned.id));
            if (idx >= 0) arr[idx] = pinned;
          };
          touchPin(list);
          touchPin(this.messages);
          touchPin(this._sessionAllMessages);
        }
        continue;
      }
      const sender = list.find((x) => String(x?.id || '') === senderId);
      const txRec = this._getMoneyTxRecord(senderId) || {};
      const txTs = Number(txRec.ts || txRec.settledAt) || 0;
      const ideal = sender
        ? this._computeMoneyCollectNoticeAnchor(list, sender, {
            settlementTs: txTs,
            excludeNoticeId: String(m.id || '')
          })
        : this._resolveMoneyCollectNoticeCreatedAt(list, senderId);
      if (!ideal || Math.abs(cur - ideal) < 2) continue;
      const updated = { ...m, createdAt: ideal, _moneyCollectAnchorAt: ideal };
      try {
        await Storage.dbPut('messages', updated);
      } catch (e) {
        continue;
      }
      const touch = (arr) => {
        if (!Array.isArray(arr)) return;
        const idx = arr.findIndex((x) => String(x?.id || '') === String(updated.id));
        if (idx >= 0) arr[idx] = updated;
        arr.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      };
      touch(list);
      touch(this.messages);
      touch(this._sessionAllMessages);
      changed = true;
    }
    if (changed) list.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    return changed;
  },

  _buildMoneyProtocolContent(info, isGroup, characterName, messageId = '') {
    if (!info) return '';
    const amount = Number(info.amount || 0).toFixed(2);
    const name = String(characterName || '').trim();
    const mid = String(messageId || info.messageId || '').trim();
    const idSuffix = mid ? `|${mid}` : '';
    if (info.kind === 'transfer') {
      const remark = String(info.remark || '').trim() || '转账留言';
      if (isGroup && name) return `[转账|${name}]${amount}|${remark}${idSuffix}`;
      return `[转账]${amount}|${remark}${idSuffix}`;
    }
    const blessing = String(info.blessing || '').trim() || '恭喜发财';
    if (isGroup && name) return `[红包|${name}]${amount}|${blessing}${idSuffix}`;
    return `[红包]${amount}|${blessing}${idSuffix}`;
  },

  _collectStatusLabel(status) {
    return String(status || '') === 'refunded' ? '退还' : '领取';
  },

  _buildCollectRedpacketContent(amount, blessing, linkedSenderMessageId, isGroup, characterName, statusLabel) {
    const amt = Number(amount || 0).toFixed(2);
    const bless = String(blessing || '').trim() || '恭喜发财';
    const mid = String(linkedSenderMessageId || '').trim();
    const st = String(statusLabel || '领取').trim() || '领取';
    const suffix = mid ? `|${mid}|${st}` : '';
    const name = String(characterName || '').trim();
    if (isGroup && name) return `[收取红包|${name}]${amt}|${bless}${suffix}`;
    return `[收取红包]${amt}|${bless}${suffix}`;
  },

  _buildCollectTransferContent(amount, remark, linkedSenderMessageId, isGroup, characterName, statusLabel) {
    const amt = Number(amount || 0).toFixed(2);
    const rm = String(remark || '').trim() || '转账留言';
    const mid = String(linkedSenderMessageId || '').trim();
    const st = String(statusLabel || '领取').trim() || '领取';
    const suffix = mid ? `|${mid}|${st}` : '';
    const name = String(characterName || '').trim();
    if (isGroup && name) return `[收取转账|${name}]${amt}|${rm}${suffix}`;
    return `[收取转账]${amt}|${rm}${suffix}`;
  },

  /** 确保转账/红包正文含消息 ID（第三段）；用于入库、历史回放 API */
  ensureMoneyContentWithMessageId(content, messageId, isGroup = null) {
    const mid = String(messageId || '').trim();
    if (!mid) return String(content || '');
    const raw = String(content || '').trim();
    if (!raw) return raw;
    const ig = isGroup != null ? !!isGroup : null;
    const info = this._parseMoneyMessage(raw, ig);
    if (!info) return raw;
    if (String(info.messageId || '').trim()) return raw;
    return this._buildMoneyProtocolContent(info, ig === true, info.characterName || '', mid);
  },

  /** 多行 user 内容：每行转账/红包若缺 ID 则补上（单行消息用同一 messageId） */
  ensureMoneyMultilineContentWithMessageId(content, messageId, isGroup = null) {
    const mid = String(messageId || '').trim();
    if (!mid) return String(content || '');
    const lines = String(content || '').split('\n');
    const ig = isGroup != null ? !!isGroup : null;
    return lines
      .map((line) => this.ensureMoneyContentWithMessageId(line, mid, ig))
      .join('\n');
  },

  async _resolveReceiptAssistantMeta(session) {
    const sess = session || this.currentSession;
    const ids = Array.isArray(sess?.participantCharacterIds)
      ? sess.participantCharacterIds.filter(Boolean)
      : [];
    const cid = ids[0] ? String(ids[0]) : '';
    if (!cid) return { characterId: null, characterName: '' };
    try {
      const c = await Storage.dbGet('characters', cid);
      return {
        characterId: c?.id || cid,
        characterName: String(c?.name || '').trim()
      };
    } catch (e) {
      return { characterId: cid, characterName: '' };
    }
  },

  async _ensureMoneyReceiptForSenderMessage(senderMsg, messageList = null) {
    if (!senderMsg || !senderMsg.id) return null;
    // 用户→角色：仅保留用户侧发送卡，收讫由 [系统]收款结果 更新状态；不克隆左侧「同款」卡
    if (senderMsg.role === 'user') return null;
    // 角色→用户：用户直接点击左侧角色发出的红包/转账领取，不克隆右侧收款卡
    if (senderMsg.role === 'assistant') return null;

    const senderId = String(senderMsg.id);
    const existing = this._getMoneyTxRecord(senderId);
    if (existing && existing.receiptMessageId) return existing.receiptMessageId;

    const sessionId = String(senderMsg.sessionId || this.currentSessionId || '');
    const session = await Storage.dbGet('sessions', sessionId);
    const isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    const info = this._parseMoneyMessage(senderMsg.content, isGroup);
    if (!info) return null;

    const receiptRole = senderMsg.role === 'user' ? 'assistant' : 'user';
    const charName = String(senderMsg.characterName || '').trim();
    const content = this._buildMoneyProtocolContent(
      info,
      isGroup,
      receiptRole === 'assistant' ? charName : ''
    );
    if (!content) return null;

    const createdAt = Number(senderMsg.createdAt || Date.now()) + 1;
    const receiptMsg = {
      id: State.generateId(),
      sessionId,
      role: receiptRole,
      content,
      createdAt,
      mode: senderMsg.mode != null ? senderMsg.mode : this._getCurrentSessionMode(),
      _moneyReceipt: true
    };

    if (receiptRole === 'assistant') {
      const meta = await this._resolveReceiptAssistantMeta(session);
      if (meta.characterId) receiptMsg.characterId = meta.characterId;
      if (meta.characterName) receiptMsg.characterName = meta.characterName;
    }

    await Storage.dbAdd('messages', receiptMsg);

    const fromName = senderMsg.role === 'user'
      ? (String(this._sessionUserDisplayName || '').trim() || '用户')
      : (charName || '对方');

    this._setMoneyTxPair(senderId, receiptMsg.id, {
      kind: info.kind,
      status: existing?.status || '',
      amount: Number(info.amount) || 0,
      remark: info.remark,
      blessing: info.blessing,
      fromName,
      ts: Date.now(),
      sessionId
    });

    if (String(this.currentSessionId || '') === sessionId) {
      const list = Array.isArray(messageList) ? messageList : this.messages;
      if (!list.some((m) => String(m?.id || '') === receiptMsg.id)) {
        this.messages.push(receiptMsg);
        if (Array.isArray(this._sessionAllMessages)) {
          this._sessionAllMessages.push(receiptMsg);
          this._sessionAllMessages.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
        }
      }
    }

    return receiptMsg.id;
  },

  _applyMoneyTxStatus(senderMessageId, status, patch = {}) {
    const senderId = String(senderMessageId || '');
    if (!senderId) return;
    const prev = this._getMoneyTxRecord(senderId) || {};
    const next = {
      ...prev,
      ...patch,
      status: String(status || ''),
      senderMessageId: senderId,
      receiptMessageId: prev.receiptMessageId || ''
    };
    this._setMoneyTxPair(senderId, next.receiptMessageId, next);
  },

  _registerPendingUserMoneyTx(messageId, info, sessionId) {
    const mid = String(messageId || '').trim();
    if (!mid || !info) return;
    if (this._isMoneySettled(mid)) return;
    const prev = this._getMoneyTxRecord(mid) || {};
    if (prev.status) return;
    const userName = String(this._sessionUserDisplayName || '').trim() || '用户';
    this._setMoneyTxPair(mid, prev.receiptMessageId || '', {
      kind: info.kind === 'transfer' ? 'transfer' : 'redpacket',
      status: '',
      amount: Number(info.amount) || 0,
      remark: info.remark,
      blessing: info.blessing,
      fromName: userName,
      ts: Date.now(),
      sessionId: String(sessionId || this.currentSessionId || '')
    });
  },

  _registerPendingAssistantMoneyTx(messageId, info, sessionId, fromName) {
    const mid = String(messageId || '').trim();
    if (!mid || !info) return;
    if (this._isMoneySettled(mid)) return;
    const prev = this._getMoneyTxRecord(mid) || {};
    if (prev.status) return;
    this._setMoneyTxPair(mid, '', {
      kind: info.kind === 'transfer' ? 'transfer' : 'redpacket',
      status: '',
      amount: Number(info.amount) || 0,
      remark: info.remark,
      blessing: info.blessing,
      fromName: String(fromName || '').trim() || '对方',
      ts: Date.now(),
      sessionId: String(sessionId || this.currentSessionId || '')
    });
  },

  async _listPendingUserMoneyTxsForSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return [];
    const list = await this._getSessionMessagesForMoneySync(sid);
    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}
    const out = [];
    for (const m of list) {
      if (!m || m.role !== 'user' || m._moneyReceipt) continue;
      const info = this._parseMoneyMessage(m.content, isGroup);
      if (!info) continue;
      if (this._isMoneySettled(String(m.id || ''), m)) continue;
      const tx = this._getMoneyTxRecord(String(m.id || ''));
      if (tx && tx.status) continue;
      const detail = info.kind === 'transfer'
        ? String(info.remark || '').trim() || '转账留言'
        : String(info.blessing || '').trim() || '恭喜发财';
      out.push({
        messageId: String(m.id || ''),
        kind: info.kind,
        amount: Number(info.amount) || 0,
        detail,
        createdAt: Number(m.createdAt || 0) || 0
      });
    }
    return out;
  },

  async _normalizeMoneyCollectNoticeCard(
    existing,
    {
      sessionId,
      senderMessageId,
      info,
      characterId,
      characterName,
      status,
      anchorCreatedAt,
      noticeRole = 'assistant'
    } = {}
  ) {
    if (!existing || !existing._moneyCollectNotice) return null;
    const sid = String(sessionId || existing.sessionId || '').trim();
    const senderId = String(senderMessageId || existing._moneyCollectLinkedId || '').trim();
    if (!sid || !senderId || !info) return null;
    const role = noticeRole === 'user' ? 'user' : 'assistant';

    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}

    const charName = String(characterName || existing.characterName || '').trim();
    const charId = String(characterId || existing.characterId || '').trim();
    const kind = info.kind === 'transfer' ? 'transfer' : 'redpacket';
    const settleStatus = status === 'refunded' ? 'refunded' : 'received';
    const cardContent = this._buildMoneyCollectNoticeCardContent(info, senderId, isGroup, charName);
    if (!cardContent) return null;

    const list =
      String(this.currentSessionId || '') === sid && Array.isArray(this._sessionAllMessages)
        ? this._sessionAllMessages
        : (await this._getSessionMessagesForMoneySync(sid));
    const createdAt =
      anchorCreatedAt != null
        ? Number(anchorCreatedAt)
        : this._resolveMoneyCollectNoticeCreatedAt(list, senderId, null);
    const finalAt =
      Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Number(existing.createdAt) || Date.now();
    const curAt = Number(existing.createdAt) || 0;
    const needsMove =
      Number.isFinite(finalAt) &&
      finalAt > 0 &&
      (!this._isMoneyCollectNoticePlacedOk(list, existing, senderId) || Math.abs(curAt - finalAt) >= 2);

    const needsUpdate =
      String(existing.content || '').trim() !== cardContent ||
      existing.role !== role ||
      existing._moneyCollectStatus !== settleStatus ||
      existing._moneyCollectKind !== kind ||
      String(existing._moneyCollectLinkedId || '') !== senderId ||
      (role === 'assistant' && charId && String(existing.characterId || '') !== charId) ||
      (role === 'assistant' && charName && String(existing.characterName || '') !== charName) ||
      needsMove;

    if (!needsUpdate) return String(existing.id || '');

    const upgraded = {
      ...existing,
      sessionId: sid,
      role,
      content: cardContent,
      createdAt: finalAt,
      _moneyCollectNotice: true,
      _moneyCollectKind: kind,
      _moneyCollectLinkedId: senderId,
      _moneyCollectStatus: settleStatus,
      _moneyCollectAnchorAt: finalAt,
      _moneyCollectSide: role === 'user' ? 'user' : 'character'
    };
    if (role === 'assistant' && charId) upgraded.characterId = charId;
    else delete upgraded.characterId;
    if (charName) upgraded.characterName = charName;
    else delete upgraded.characterName;

    try {
      await Storage.dbPut('messages', upgraded);
    } catch (e) {
      return null;
    }
    const touch = (arr) => {
      if (!Array.isArray(arr)) return;
      const idx = arr.findIndex((x) => String(x?.id || '') === String(upgraded.id));
      if (idx >= 0) arr[idx] = upgraded;
      arr.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    };
    touch(this.messages);
    touch(this._sessionAllMessages);
    return String(upgraded.id || '');
  },

  async _syncMoneyCollectNoticeIfNeeded(existing, opts = {}) {
    return this._normalizeMoneyCollectNoticeCard(existing, opts);
  },

  async _upgradeLegacyMoneyCollectNotice(existing, opts = {}) {
    return this._normalizeMoneyCollectNoticeCard(existing, opts);
  },

  /**
   * 用户→角色收款/退还后：插入左侧同款红包/转账回执卡（位于用户消息与角色回复之间）
   */
  async _insertCharacterMoneyCollectNotice({
    sessionId,
    senderMessageId,
    senderMsg,
    info,
    characterId,
    characterName,
    userName,
    status = 'received',
    anchorCreatedAt = null
  } = {}) {
    const sid = String(sessionId || '').trim();
    const senderId = String(senderMessageId || '').trim();
    if (!sid || !senderId || !info) return null;

    const settleStatus = status === 'refunded' ? 'refunded' : 'received';
    const listForLookup =
      String(this.currentSessionId || '') === sid && Array.isArray(this._sessionAllMessages)
        ? this._sessionAllMessages
        : await this._getSessionMessagesForMoneySync(sid);
    const linkedExisting = this._findMoneyCollectNoticeForSender(listForLookup, sid, senderId, {
      role: 'assistant'
    });
    if (linkedExisting) {
      const normalized = await this._normalizeMoneyCollectNoticeCard(linkedExisting, {
        sessionId: sid,
        senderMessageId: senderId,
        info,
        characterId: String(characterId || linkedExisting.characterId || ''),
        characterName,
        status: settleStatus,
        anchorCreatedAt,
        noticeRole: 'assistant'
      });
      const noticeId = normalized || String(linkedExisting.id || '');
      if (noticeId) {
        const tx = this._getMoneyTxRecord(senderId) || {};
        this._setMoneyTxPair(senderId, noticeId, {
          ...tx,
          kind: info.kind,
          status: settleStatus,
          receiptMessageId: noticeId,
          collectNoticeMessageId: noticeId
        });
      }
      return noticeId;
    }

    const tx = this._getMoneyTxRecord(senderId);
    if (tx && tx.receiptMessageId) {
      try {
        const existing = await Storage.dbGet('messages', String(tx.receiptMessageId));
        const linkedOk =
          existing &&
          existing._moneyCollectNotice &&
          String(existing._moneyCollectLinkedId || '').trim() === senderId;
        if (linkedOk) {
          const normalized = await this._normalizeMoneyCollectNoticeCard(existing, {
            sessionId: sid,
            senderMessageId: senderId,
            info,
            characterId: String(characterId || existing.characterId || ''),
            characterName,
            status: settleStatus,
            anchorCreatedAt,
            noticeRole: 'assistant'
          });
          return normalized || String(existing.id || tx.receiptMessageId);
        }
        if (existing && existing._moneyCollectNotice) {
          this._setMoneyTxPair(senderId, '', { ...tx, receiptMessageId: '' });
        }
      } catch (e) {}
    }

    const sender = senderMsg || (await this._findUserMoneyMessageById(senderId, sid));
    if (!sender || sender.role !== 'user') return null;

    const charName = String(characterName || sender.characterName || '').trim();
    const charId = String(characterId || '').trim();
    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}
    const cardContent = this._buildMoneyCollectNoticeCardContent(info, senderId, isGroup, charName);
    if (!cardContent) return null;

    const list =
      String(this.currentSessionId || '') === sid && Array.isArray(this._sessionAllMessages)
        ? this._sessionAllMessages
        : (await this._getSessionMessagesForMoneySync(sid));
    const createdAt = this._resolveMoneyCollectNoticeCreatedAt(list, senderId, anchorCreatedAt);
    const kind = info.kind === 'transfer' ? 'transfer' : 'redpacket';
    const collectMsg = {
      id: State.generateId(),
      sessionId: sid,
      role: 'assistant',
      content: cardContent,
      createdAt,
      mode: sender.mode != null ? sender.mode : this._getCurrentSessionMode(),
      _moneyCollectNotice: true,
      _moneyCollectKind: kind,
      _moneyCollectLinkedId: senderId,
      _moneyCollectStatus: settleStatus,
      _moneyCollectAnchorAt: createdAt,
      _moneyCollectSide: 'character'
    };
    if (charId) collectMsg.characterId = charId;
    if (charName) collectMsg.characterName = charName;

    await Storage.dbAdd('messages', collectMsg);

    this._setMoneyTxPair(senderId, collectMsg.id, {
      ...(tx || {}),
      kind: info.kind,
      status: settleStatus,
      amount,
      fromName: String(userName || '').trim() || '用户',
      remark: info.remark,
      blessing: info.blessing,
      ts: Date.now(),
      sessionId: sid,
      receiptMessageId: collectMsg.id,
      collectNoticeMessageId: collectMsg.id
    });

    const pushLocal = (arr) => {
      if (!Array.isArray(arr)) return;
      if (arr.some((x) => String(x?.id || '') === collectMsg.id)) return;
      arr.push(collectMsg);
      arr.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    };

    if (String(this.currentSessionId || '') === sid) {
      pushLocal(this.messages);
      pushLocal(this._sessionAllMessages);
    }

    return collectMsg.id;
  },

  /**
   * 角色→用户：用户领取/退还后，插入右侧 [收取红包]/[收取转账] 回执卡（紧挨角色发送卡之后）
   */
  async _insertUserMoneyCollectNotice({
    sessionId,
    senderMessageId,
    senderMsg,
    info,
    characterName,
    status = 'received',
    anchorCreatedAt = null
  } = {}) {
    const sid = String(sessionId || '').trim();
    const senderId = String(senderMessageId || '').trim();
    if (!sid || !senderId || !info) return null;

    const settleStatus = status === 'refunded' ? 'refunded' : 'received';
    const listForLookup =
      String(this.currentSessionId || '') === sid && Array.isArray(this._sessionAllMessages)
        ? this._sessionAllMessages
        : await this._getSessionMessagesForMoneySync(sid);
    const linkedExisting = this._findMoneyCollectNoticeForSender(listForLookup, sid, senderId, {
      role: 'user'
    });
    const charName = String(
      characterName || senderMsg?.characterName || linkedExisting?.characterName || ''
    ).trim();

    if (linkedExisting) {
      const normalized = await this._normalizeMoneyCollectNoticeCard(linkedExisting, {
        sessionId: sid,
        senderMessageId: senderId,
        info,
        characterName: charName,
        status: settleStatus,
        anchorCreatedAt,
        noticeRole: 'user'
      });
      const noticeId = normalized || String(linkedExisting.id || '');
      if (noticeId) {
        const tx = this._getMoneyTxRecord(senderId) || {};
        this._setMoneyTxPair(senderId, noticeId, {
          ...tx,
          kind: info.kind,
          status: settleStatus,
          receiptMessageId: noticeId,
          collectNoticeMessageId: noticeId,
          userCollectNoticeMessageId: noticeId
        });
      }
      return noticeId;
    }

    const sender = senderMsg || this._findMessageInSessionMemory(senderId);
    let senderRow = sender;
    if (!senderRow) {
      try {
        senderRow = await Storage.dbGet('messages', senderId);
      } catch (eDb) {}
    }
    if (!senderRow || senderRow.role !== 'assistant') return null;

    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}
    const cardContent = this._buildMoneyCollectNoticeCardContent(info, senderId, isGroup, charName);
    if (!cardContent) return null;

    const list =
      String(this.currentSessionId || '') === sid && Array.isArray(this._sessionAllMessages)
        ? this._sessionAllMessages
        : await this._getSessionMessagesForMoneySync(sid);
    const createdAt = this._resolveMoneyCollectNoticeCreatedAt(list, senderId, anchorCreatedAt);
    const kind = info.kind === 'transfer' ? 'transfer' : 'redpacket';
    const collectMsg = {
      id: State.generateId(),
      sessionId: sid,
      role: 'user',
      content: cardContent,
      createdAt,
      mode: senderRow.mode != null ? senderRow.mode : this._getCurrentSessionMode(),
      _moneyCollectNotice: true,
      _moneyCollectKind: kind,
      _moneyCollectLinkedId: senderId,
      _moneyCollectStatus: settleStatus,
      _moneyCollectAnchorAt: createdAt,
      _moneyCollectSide: 'user'
    };
    if (charName) collectMsg.characterName = charName;

    await Storage.dbAdd('messages', collectMsg);

    const tx = this._getMoneyTxRecord(senderId) || {};
    this._setMoneyTxPair(senderId, collectMsg.id, {
      ...tx,
      kind: info.kind,
      status: settleStatus,
      amount: Number(info.amount) || 0,
      fromName: charName || '对方',
      remark: info.remark,
      blessing: info.blessing,
      ts: Date.now(),
      sessionId: sid,
      receiptMessageId: collectMsg.id,
      collectNoticeMessageId: collectMsg.id,
      userCollectNoticeMessageId: collectMsg.id
    });

    const pushLocal = (arr) => {
      if (!Array.isArray(arr)) return;
      if (arr.some((x) => String(x?.id || '') === collectMsg.id)) return;
      arr.push(collectMsg);
      arr.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    };
    if (String(this.currentSessionId || '') === sid) {
      pushLocal(this.messages);
      pushLocal(this._sessionAllMessages);
    }

    return collectMsg.id;
  },

  async _backfillUserMoneyCollectNotices(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sid = String(sessionId || '').trim();
    if (!list.length || !sid) return false;
    let changed = false;
    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}
    for (const m of list) {
      if (!m || m.role !== 'assistant' || m._moneyCollectNotice) continue;
      const senderId = String(m.id || '');
      if (!senderId) continue;
      const settled = this._getMoneySettledStatus(senderId, m);
      if (!settled) continue;
      if (this._findMoneyCollectNoticeForSender(list, sid, senderId, { role: 'user' })) continue;
      let info = this._parseMoneyMessage(m.content, isGroup);
      if (!info) info = this._parseMoneyMessage(m.content, !isGroup);
      if (!info) continue;
      const charName = String(m.characterName || '').trim();
      const tx = this._getMoneyTxRecord(senderId) || {};
      const settleTs = Number(tx.ts || tx.settledAt) || 0;
      const anchorAt = this._computeMoneyCollectNoticeAnchor(list, m, {
        settlementTs: settleTs,
        excludeNoticeId: ''
      });
      const insertedId = await this._insertUserMoneyCollectNotice({
        sessionId: sid,
        senderMessageId: senderId,
        senderMsg: m,
        info,
        characterName: charName,
        status: settled === 'refunded' ? 'refunded' : 'received',
        anchorCreatedAt: anchorAt
      });
      if (insertedId) {
        const row = await Storage.dbGet('messages', insertedId);
        if (row && !list.some((x) => String(x?.id || '') === insertedId)) {
          list.push(row);
          list.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
        }
        changed = true;
      }
    }
    return changed;
  },

  /** 旧 _moneyCollectNotice 影子消息 → 普通 [收取…] 正文（带第四段 领取|退还） */
  async _migrateLegacyMoneyCollectNoticesToPlain(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sid = String(sessionId || '').trim();
    if (!list.length || !sid) return false;
    let changed = false;
    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}
    for (const m of list) {
      if (!m || !m._moneyCollectNotice) continue;
      const senderId = String(m._moneyCollectLinkedId || '').trim();
      const sender = senderId ? list.find((x) => String(x?.id || '') === senderId) : null;
      let info = null;
      if (sender) {
        info = this._parseMoneyMessage(sender.content, isGroup);
        if (!info) info = this._parseMoneyMessage(sender.content, !isGroup);
      }
      const st =
        String(m._moneyCollectStatus || '') === 'refunded' ? 'refunded' : 'received';
      const stLabel = this._collectStatusLabel(st);
      const protocolId = info
        ? String(info.messageId || senderId).trim()
        : senderId;
      const charName = String(m.characterName || sender?.characterName || '').trim();
      let content = String(m.content || '').trim();
      if (info && protocolId) {
        content =
          info.kind === 'transfer'
            ? this._buildCollectTransferContent(
                info.amount,
                info.remark,
                protocolId,
                isGroup,
                m.role === 'assistant' ? charName : '',
                stLabel
              )
            : this._buildCollectRedpacketContent(
                info.amount,
                info.blessing,
                protocolId,
                isGroup,
                m.role === 'assistant' ? charName : '',
                stLabel
              );
      }
      const upgraded = { ...m, content };
      delete upgraded._moneyCollectNotice;
      delete upgraded._moneyCollectAnchorAt;
      delete upgraded._moneyCollectSide;
      delete upgraded._moneyCollectKind;
      delete upgraded._moneyCollectLinkedId;
      delete upgraded._moneyCollectStatus;
      try {
        await Storage.dbPut('messages', upgraded);
      } catch (e) {
        continue;
      }
      const idx = list.findIndex((x) => String(x?.id || '') === String(upgraded.id));
      if (idx >= 0) list[idx] = upgraded;
      const touch = (arr) => {
        if (!Array.isArray(arr)) return;
        const i = arr.findIndex((x) => String(x?.id || '') === String(upgraded.id));
        if (i >= 0) arr[i] = upgraded;
      };
      touch(this.messages);
      touch(this._sessionAllMessages);
      changed = true;
    }
    return changed;
  },

  async _migrateAllLegacyMoneyCollectNotices(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sid = String(sessionId || '').trim();
    if (!list.length || !sid) return false;
    let changed = false;
    const all = this._getMoneyActionsMap();
    for (const m of list) {
      if (!m || !m._moneyCollectNotice) continue;
      let senderId = String(m._moneyCollectLinkedId || '').trim();
      if (!senderId) {
        for (const v of Object.values(all)) {
          if (v && String(v.receiptMessageId || '') === String(m.id || '')) {
            senderId = String(v.senderMessageId || '');
            break;
          }
        }
      }
      if (!senderId) continue;
      const sender = list.find((x) => String(x?.id || '') === senderId);
      let info = null;
      if (sender) {
        info = this._parseMoneyMessage(sender.content, false) || this._parseMoneyMessage(sender.content, true);
      }
      const meta = await this._resolveReceiptAssistantMeta(await Storage.dbGet('sessions', sid));
      const tx = this._getMoneyTxRecord(senderId);
      const upgraded = await this._normalizeMoneyCollectNoticeCard(m, {
        sessionId: sid,
        senderMessageId: senderId,
        info,
        characterId: meta.characterId ? String(meta.characterId) : '',
        characterName: meta.characterName || m.characterName || '',
        status: tx?.status === 'refunded' ? 'refunded' : 'received'
      });
      if (upgraded) changed = true;
    }
    return changed;
  },

  async _backfillCharacterMoneyCollectNotices(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sid = String(sessionId || '').trim();
    if (!list.length || !sid) return false;
    let changed = false;
    for (const m of list) {
      if (!m || m.role !== 'user') continue;
      const senderId = String(m.id || '');
      if (!senderId) continue;
      const settled = this._getMoneySettledStatus(senderId, m);
      if (!settled) continue;
      const tx = this._getMoneyTxRecord(senderId) || {};
      let isGroup = false;
      try {
        const session = await Storage.dbGet('sessions', sid);
        isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
      } catch (e) {}
      let info = this._parseMoneyMessage(m.content, isGroup);
      if (!info) info = this._parseMoneyMessage(m.content, !isGroup);
      if (!info) continue;
      const meta = await this._resolveReceiptAssistantMeta(await Storage.dbGet('sessions', sid));
      const existingNotice = this._findMoneyCollectNoticeForSender(list, sid, senderId, {
        role: 'assistant'
      });
      if (existingNotice) {
        const settleTs = Number(tx.ts || tx.settledAt) || 0;
        const anchorAt = this._computeMoneyCollectNoticeAnchor(list, m, {
          settlementTs: settleTs,
          excludeNoticeId: String(existingNotice.id || '')
        });
        const normalized = await this._normalizeMoneyCollectNoticeCard(existingNotice, {
          sessionId: sid,
          senderMessageId: senderId,
          info,
          characterId: meta.characterId ? String(meta.characterId) : '',
          characterName: meta.characterName || '',
          status: settled === 'refunded' ? 'refunded' : 'received',
          anchorCreatedAt: anchorAt,
          noticeRole: 'assistant'
        });
        if (normalized) {
          const noticeId = String(normalized);
          this._setMoneyTxPair(senderId, noticeId, {
            ...tx,
            receiptMessageId: noticeId,
            collectNoticeMessageId: noticeId
          });
          changed = true;
        }
        continue;
      }
      const userName = String(this._sessionUserDisplayName || '').trim() || '用户';
      const settleTs = Number(tx.ts || tx.settledAt) || 0;
      const anchorAt = this._computeMoneyCollectNoticeAnchor(list, m, {
        settlementTs: settleTs,
        excludeNoticeId: ''
      });
      const insertedId = await this._insertCharacterMoneyCollectNotice({
        sessionId: sid,
        senderMessageId: senderId,
        senderMsg: m,
        info,
        characterId: meta.characterId ? String(meta.characterId) : '',
        characterName: meta.characterName || '',
        userName,
        status: settled === 'refunded' ? 'refunded' : 'received',
        anchorCreatedAt: anchorAt
      });
      if (insertedId) {
        const row = await Storage.dbGet('messages', insertedId);
        if (row && !list.some((x) => String(x?.id || '') === insertedId)) {
          list.push(row);
          list.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
        }
        changed = true;
      }
    }
    return changed;
  },

  /** @deprecated 旧 [系统]收款结果 仅生成 [收取…] 行，结清由 applyMoneyCollectMessage 在消息入库后执行 */
  async applyMoneyCollectionFromSystem(opts = {}) {
    const line = await this.buildCollectLineFromLegacy收款结果({
      sessionId: opts.sessionId,
      kind: opts.kind,
      messageId: opts.messageId,
      accepted: opts.accepted,
      characterName: opts.characterName
    });
    return {
      ok: !!line,
      collectLine: line,
      status: opts.accepted ? 'received' : 'refunded'
    };
  },

  async _cleanupUserToCharacterMoneyReceipts(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sid = String(sessionId || '').trim();
    if (!list.length || !sid) return false;
    let changed = false;
    for (const m of list) {
      if (!m || m.role !== 'user') continue;
      const senderId = String(m.id || '');
      if (!senderId) continue;
      const tx = this._getMoneyTxRecord(senderId);
      const rid = tx && tx.receiptMessageId ? String(tx.receiptMessageId) : '';
      if (!rid) continue;
      const receipt = list.find((x) => String(x?.id || '') === rid);
      if (!receipt || receipt.role !== 'assistant' || !receipt._moneyReceipt) continue;
      try {
        await Storage.dbDelete('messages', rid);
      } catch (e) {}
      const idx = this.messages.findIndex((x) => String(x?.id || '') === rid);
      if (idx >= 0) this.messages.splice(idx, 1);
      const idxAll = Array.isArray(this._sessionAllMessages)
        ? this._sessionAllMessages.findIndex((x) => String(x?.id || '') === rid)
        : -1;
      if (idxAll >= 0) this._sessionAllMessages.splice(idxAll, 1);
      const all = this._getMoneyActionsMap();
      delete all[rid];
      this._setMoneyTxPair(senderId, '', {
        ...tx,
        receiptMessageId: ''
      });
      changed = true;
    }
    if (changed) {
      this._flushMoneyActionsMap(this._getMoneyActionsMap());
    }
    return changed;
  },

  async _cleanupCharacterToUserMoneyReceipts(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    const sid = String(sessionId || '').trim();
    if (!list.length || !sid) return false;
    let changed = false;
    const removeReceipt = async (rid, senderId, tx) => {
      try {
        await Storage.dbDelete('messages', rid);
      } catch (e) {}
      const idx = this.messages.findIndex((x) => String(x?.id || '') === rid);
      if (idx >= 0) this.messages.splice(idx, 1);
      const idxAll = Array.isArray(this._sessionAllMessages)
        ? this._sessionAllMessages.findIndex((x) => String(x?.id || '') === rid)
        : -1;
      if (idxAll >= 0) this._sessionAllMessages.splice(idxAll, 1);
      const all = this._getMoneyActionsMap();
      delete all[rid];
      if (senderId && tx) {
        this._setMoneyTxPair(senderId, '', { ...tx, receiptMessageId: '' });
      }
      changed = true;
    };
    for (const m of list) {
      if (!m || m.role !== 'assistant') continue;
      const senderId = String(m.id || '');
      if (!senderId) continue;
      const tx = this._getMoneyTxRecord(senderId);
      const rid = tx && tx.receiptMessageId ? String(tx.receiptMessageId) : '';
      if (!rid) continue;
      const receipt = list.find((x) => String(x?.id || '') === rid);
      if (!receipt || receipt.role !== 'user' || !receipt._moneyReceipt) continue;
      await removeReceipt(rid, senderId, tx);
    }
    for (const m of list) {
      if (!m || m.role !== 'user' || !m._moneyReceipt) continue;
      const rid = String(m.id || '');
      if (!rid) continue;
      const tx = this._getMoneyTxRecord(rid);
      const senderId = tx && tx.senderMessageId ? String(tx.senderMessageId) : '';
      if (!senderId) continue;
      const sender = list.find((x) => String(x?.id || '') === senderId);
      if (!sender || sender.role !== 'assistant') continue;
      await removeReceipt(rid, senderId, this._getMoneyTxRecord(senderId) || tx);
    }
    if (changed) {
      this._flushMoneyActionsMap(this._getMoneyActionsMap());
    }
    return changed;
  },

  async _backfillMoneyReceiptPairs(messageList, sessionId) {
    const list = Array.isArray(messageList) ? messageList : [];
    if (!list.length) return false;
    let changed = false;
    const sid = String(sessionId || '').trim();
    const cleaned = await this._cleanupCharacterToUserMoneyReceipts(list, sid);
    if (cleaned) changed = true;
    for (const m of list) {
      if (!m || m._moneyReceipt) continue;
      if (m.role !== 'assistant') continue;
      const senderId = String(m.id || '');
      if (!senderId) continue;
      const isGroup = false;
      const info = this._parseMoneyMessage(m.content, isGroup);
      if (!info) continue;
      if (this._isMoneySettled(senderId, m)) continue;
      const tx = this._getMoneyTxRecord(senderId);
      if (tx && tx.status) continue;
      if (!tx || !tx.receiptMessageId) {
        const fromName = String(m.characterName || '').trim() || '对方';
        this._registerPendingAssistantMoneyTx(senderId, info, sid, fromName);
        changed = true;
      }
    }
    return changed;
  },

  _parseUserMoneyMessage(content, isGroup) {
    const line = String(content || '').trim().split('\n')[0].trim();
    if (!line) return null;
    const tryGroup = (ig) => {
      if (typeof MessageTypes === 'undefined' || !MessageTypes.tryMatch) return null;
      try {
        return MessageTypes.tryMatch(line, !!ig);
      } catch (e) {
        return null;
      }
    };
    let parsed = isGroup != null ? tryGroup(isGroup) : null;
    if (!parsed) parsed = tryGroup(false);
    if (!parsed) parsed = tryGroup(true);
    if (!parsed || (parsed.type !== 'transfer' && parsed.type !== 'redpacket')) return null;
    return {
      kind: parsed.type,
      amount: Number(parsed.amount) || 0,
      remark: parsed.remark,
      blessing: parsed.blessing,
      messageId: String(parsed.messageId || '').trim()
    };
  },

  _parseCollectMessage(content, isGroup) {
    const line = String(content || '').trim().split('\n')[0].trim();
    if (!line) return null;
    const tryGroup = (ig) => {
      if (typeof MessageTypes === 'undefined' || !MessageTypes.tryMatch) return null;
      try {
        return MessageTypes.tryMatch(line, !!ig);
      } catch (e) {
        return null;
      }
    };
    let parsed = isGroup != null ? tryGroup(isGroup) : null;
    if (!parsed) parsed = tryGroup(false);
    if (!parsed) parsed = tryGroup(true);
    if (!parsed || (parsed.type !== 'collect_transfer' && parsed.type !== 'collect_redpacket')) {
      return null;
    }
    const kind = parsed.type === 'collect_transfer' ? 'transfer' : 'redpacket';
    const status =
      parsed.collectStatus === 'refunded' || parsed.collectStatus === 'received'
        ? parsed.collectStatus
        : 'received';
    return {
      collectKind: kind,
      kind,
      amount: Number(parsed.amount) || 0,
      remark: parsed.remark,
      blessing: parsed.blessing,
      linkedMessageId: String(parsed.messageId || '').trim(),
      status,
      characterName: parsed.characterName || null
    };
  },

  async _findMoneyMessageByProtocolId(protocolId, sessionId) {
    const mid = String(protocolId || '').trim();
    const sid = String(sessionId || '').trim();
    if (!mid) return null;
    const matchRow = (m) => {
      if (!m || m._sparkNotice) return false;
      if (String(m.id || '') === mid) return true;
      if (sid) {
        const ms = String(m.sessionId || '').trim();
        if (ms && ms !== sid) return false;
      }
      let info = this._parseMoneyMessage(m.content, false);
      if (!info) info = this._parseMoneyMessage(m.content, true);
      return !!(info && String(info.messageId || '').trim() === mid);
    };
    const fromMem = (this.messages || []).find(matchRow);
    if (fromMem) return fromMem;
    const fromAll = (this._sessionAllMessages || []).find(matchRow);
    if (fromAll) return fromAll;
    try {
      const row = await Storage.dbGet('messages', mid);
      if (row && matchRow(row)) return row;
    } catch (e) {}
    try {
      const list = await this._getSessionMessagesForMoneySync(sid);
      return list.find(matchRow) || null;
    } catch (e2) {
      return null;
    }
  },

  /**
   * 统一结清入口：[收取红包]/[收取转账] 为正式消息；解析后更新原卡状态与钱包。
   * 用户发 → 角色 assistant 收取；角色发 → 用户 user 收取。
   */
  async applyMoneyCollectMessage({
    sessionId,
    content,
    collectMessageId,
    role,
    characterId,
    characterName
  } = {}) {
    const sid = String(sessionId || '').trim();
    const collectRole = String(role || '').trim();
    const collectMid = String(collectMessageId || '').trim();
    if (!sid || !content) return { ok: false, reason: 'invalid_args' };

    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}

    const collectInfo = this._parseCollectMessage(content, isGroup);
    if (!collectInfo || !collectInfo.linkedMessageId) {
      return { ok: false, reason: 'parse_collect_failed' };
    }

    const sourceMsg = await this._findMoneyMessageByProtocolId(collectInfo.linkedMessageId, sid);
    if (!sourceMsg) {
      return { ok: false, reason: 'source_not_found', linkedMessageId: collectInfo.linkedMessageId };
    }

    const sourceRole = String(sourceMsg.role || '');
    const expectedCollectRole = sourceRole === 'user' ? 'assistant' : sourceRole === 'assistant' ? 'user' : '';
    if (expectedCollectRole && collectRole && collectRole !== expectedCollectRole) {
      return { ok: false, reason: 'role_mismatch', expected: expectedCollectRole, actual: collectRole };
    }

    let sourceInfo = this._parseMoneyMessage(sourceMsg.content, isGroup);
    if (!sourceInfo) sourceInfo = this._parseMoneyMessage(sourceMsg.content, !isGroup);
    if (!sourceInfo || sourceInfo.kind !== collectInfo.kind) {
      return { ok: false, reason: 'kind_mismatch' };
    }

    const sourceId = String(sourceMsg.id || '').trim();
    const status = collectInfo.status === 'refunded' ? 'refunded' : 'received';
    const settledBefore = this._getMoneySettledStatus(sourceId, sourceMsg);
    if (settledBefore) {
      if (collectMid) {
        const tx = this._getMoneyTxRecord(sourceId) || {};
        this._setMoneyTxPair(sourceId, collectMid, {
          ...tx,
          collectMessageId: collectMid,
          receiptMessageId: collectMid
        });
      }
      return { ok: false, reason: 'already_settled', status: settledBefore, sourceMessageId: sourceId };
    }

    const amount = Number(sourceInfo.amount) || Number(collectInfo.amount) || 0;
    const userName = String(this._sessionUserDisplayName || '').trim() || '用户';

    const settleAt = Date.now();
    this._applyMoneyTxStatus(sourceId, status, {
      kind: collectInfo.kind,
      amount,
      fromName: sourceRole === 'user' ? userName : String(sourceMsg.characterName || characterName || '对方'),
      remark: sourceInfo.remark,
      blessing: sourceInfo.blessing,
      ts: settleAt,
      settledAt: settleAt,
      sessionId: sid,
      collectMessageId: collectMid,
      receiptMessageId: collectMid,
      settledByCharacterId: characterId ? String(characterId) : '',
      settledByCharacterName: characterName ? String(characterName) : ''
    });

    try {
      await this._persistMoneyStatusOnMessage(sourceMsg, status);
    } catch (ePersist) {}

    if (String(this.currentSessionId || '') === sid) {
      this._moneyCollectionNeedsRender = true;
      this._forceFullRenderNext = true;
    } else {
      this._moneyCollectionNeedsRender = true;
    }

    return { ok: true, status, sourceMessageId: sourceId, collectMessageId: collectMid };
  },

  /** 兼容旧 [系统]收款结果：转为 [收取…] 行写入助手正文 */
  async buildCollectLineFromLegacy收款结果({ sessionId, kind, messageId, accepted, characterName } = {}) {
    const sid = String(sessionId || '').trim();
    const mid = String(messageId || '').trim();
    const moneyKind = kind === 'transfer' ? 'transfer' : kind === 'redpacket' ? 'redpacket' : '';
    if (!sid || !mid || !moneyKind) return '';
    const msg = await this._findMoneyMessageByProtocolId(mid, sid);
    if (!msg || msg.role !== 'user') return '';
    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (e) {}
    let info = this._parseMoneyMessage(msg.content, isGroup);
    if (!info) info = this._parseMoneyMessage(msg.content, !isGroup);
    if (!info || info.kind !== moneyKind) return '';
    const protocolId = String(info.messageId || mid).trim();
    const st = accepted ? '领取' : '退还';
    const name = String(characterName || '').trim();
    if (moneyKind === 'transfer') {
      return this._buildCollectTransferContent(
        info.amount,
        info.remark,
        protocolId,
        isGroup,
        name,
        st
      );
    }
    return this._buildCollectRedpacketContent(
      info.amount,
      info.blessing,
      protocolId,
      isGroup,
      name,
      st
    );
  },

  async _getSessionMessagesForMoneySync(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return [];
    if (String(this.currentSessionId || '') === sid && Array.isArray(this._sessionAllMessages) && this._sessionAllMessages.length) {
      return this._sessionAllMessages;
    }
    try {
      const all = await Storage.dbGetAll('messages');
      return (all || [])
        .filter((m) => m && String(m.sessionId || '') === sid)
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    } catch (e) {
      return [];
    }
  },

  /**
   * MessageTypes.tryMatch 结果 → 与 renderMessages 一致的 segment 形状（供正则页等预览）
   */
  mapParsedProtocolToSegment(parsedMsg) {
    if (!parsedMsg) return null;
    return {
      type: 'text',
      content: parsedMsg.content,
      messageType: parsedMsg.type,
      messageStyle: parsedMsg.style,
      characterName: parsedMsg.characterName,
      amount: parsedMsg.amount,
      remark: parsedMsg.remark,
      blessing: parsedMsg.blessing,
      albumId: parsedMsg.albumId,
      orderId: parsedMsg.orderId,
      shareTitle: parsedMsg.title,
      shareTotal: parsedMsg.total,
      shareOrder: parsedMsg.order,
      shareTs: parsedMsg.order?.ts,
      shareAddress: parsedMsg.order?.address,
      shareItems: Array.isArray(parsedMsg.order?.items) ? parsedMsg.order.items : [],
      sharePayloadB64: parsedMsg.sharePayloadB64,
      shareApp: parsedMsg.app || parsedMsg.order?.app || '',
      shareResource: parsedMsg.resource || parsedMsg.order?.resource || '',
      shareAction: parsedMsg.action || parsedMsg.order?.action || '',
      shareStatus: parsedMsg.status || parsedMsg.order?.status || '',
      suggestedReplies: Array.isArray(parsedMsg.suggestedReplies) ? parsedMsg.suggestedReplies : [],
      replyTo: parsedMsg.replyTo,
      isReply: parsedMsg.isReply,
      foreignText: parsedMsg.foreignText,
      isBilingual: !!parsedMsg.isBilingual
    };
  },

  _isTogetherListenShareSegment(segment) {
    if (!segment || String(segment.messageType || '') !== 'share') return false;
    const app = String(segment.shareApp || '').trim();
    const res = String(segment.shareResource || '').trim();
    const action = String(segment.shareAction || '').trim();
    return app === '音乐' && res === '一起听' && action === '邀请';
  },

  _decodeSharePayloadB64(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
      const json = decodeURIComponent(escape(atob(text)));
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  },

  _buildForumShareContextTextFromPayload(raw, fallbackTitle = '') {
    const hiddenPayload = this._decodeSharePayloadB64(raw);
    if (!hiddenPayload) return '';
    const recentCommentsText = String(hiddenPayload.recentCommentsText || '').trim();
    if (!recentCommentsText) return '';
    const forumName = String(hiddenPayload.forumName || '').trim();
    const threadTitle = String(hiddenPayload.threadTitle || fallbackTitle || '').trim();
    const threadAuthor = String(hiddenPayload.threadAuthor || '').trim();
    return [
      '论坛分享附带上下文：',
      forumName ? `论坛名称：${forumName}` : '',
      threadTitle ? `帖子标题：${threadTitle}` : '',
      threadAuthor ? `发帖人：${threadAuthor}` : '',
      `当前帖子已有评论（最近40楼）：\n${recentCommentsText}`
    ].filter(Boolean).join('\n');
  },

  _buildTogetherListenCardHtml(segment, { preview = false } = {}) {
    const title = String(segment?.shareTitle || segment?.content || '歌曲').trim() || '歌曲';
    const orderId = String(segment?.orderId || '').trim();
    const status = String(segment?.shareStatus || '邀请一起听').trim() || '邀请一起听';
    const ts = Number(segment?.shareTs || 0) || 0;
    const timeText = ts
      ? (() => {
          const d = new Date(ts);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          return `${y}.${m}.${day} ${hh}:${mm}`;
        })()
      : '';
    const items = Array.isArray(segment?.shareItems) ? segment.shareItems : [];
    const specText = String(items?.[0]?.specText || '').trim();
    const artist = specText.replace(/^歌手[:：]\s*/i, '').trim() || '未知歌手';
    const esc = (s) => this.escapeHtml(String(s ?? ''));

    return `
      <div class="yd-message__block yd-message__block--together">
        <div class="yd-together-card${preview ? ' is-preview' : ''}" data-track-id="${esc(orderId)}">
          <div class="yd-together-card__header">
            <span class="yd-together-card__brand">音乐</span>
            <span class="yd-together-card__status">${esc(status)}</span>
          </div>
          <div class="yd-together-card__body">
            <div class="yd-together-card__title">${esc(title)}</div>
            <div class="yd-together-card__artist">${esc(artist)}</div>
            <div class="yd-together-card__invite">${esc(status === '已接受邀请' ? '正在与你一起听' : '邀请你一起听')}</div>
          </div>
          <div class="yd-together-card__footer">
            <span>${esc(timeText || '')}</span>
            <span>点击查看</span>
          </div>
        </div>
      </div>
    `;
  },

  _parseTogetherShareRawSegment(content) {
    const raw = String(content || '').trim();
    const marker = '[分享]音乐|一起听|邀请|';
    let targetLine = '';
    if (raw.startsWith(marker)) {
      targetLine = raw;
    } else {
      const lines = raw.split(/\r?\n/).map(s => String(s || '').trim()).filter(Boolean);
      targetLine = lines.find(line => line.includes(marker)) || '';
      if (targetLine && !targetLine.startsWith('[分享]')) {
        const idx = targetLine.indexOf('[分享]');
        targetLine = idx >= 0 ? targetLine.slice(idx) : targetLine;
      }
    }
    if (!targetLine.startsWith('[分享]')) return null;

    const body = targetLine.slice(4);
    const parts = body.split('|');
    if (parts.length < 9) return null;
    const app = String(parts[0] || '').trim();
    const resource = String(parts[1] || '').trim();
    const action = String(parts[2] || '').trim();
    if (!(app === '音乐' && resource === '一起听' && action === '邀请')) return null;

    const orderId = String(parts[3] || '').trim();
    const title = String(parts[4] || '').trim();
    const total = Number(parts[5] || 0) || 0;
    const status = String(parts[6] || '').trim();
    const ts = Number(parts[7] || 0) || 0;
    const address = String(parts[8] || '').trim();
    const items = [];
    const rest = parts.slice(9);
    for (let i = 0; i + 4 < rest.length; i += 5) {
      items.push({
        icon: String(rest[i] || ''),
        name: String(rest[i + 1] || ''),
        qty: Number(rest[i + 2] || 0) || 0,
        specText: String(rest[i + 3] || ''),
        unitPrice: Number(rest[i + 4] || 0) || 0
      });
    }
    return {
      type: 'text',
      content: body,
      messageType: 'share',
      messageStyle: 'bubble',
      characterName: null,
      orderId,
      shareTitle: title,
      shareTotal: total,
      shareOrder: {
        app, resource, action, id: orderId, title, total, address, ts, status, items
      },
      shareTs: ts,
      shareAddress: address,
      shareItems: items,
      sharePayloadB64: '',
      shareApp: app,
      shareResource: resource,
      shareAction: action,
      shareStatus: status,
      suggestedReplies: [],
      replyTo: null,
      isReply: false,
      isRegexTransformedText: false
    };
  },

  /**
   * 内置协议解析结果在聊天里的视觉预览（与消息列表同款 DOM 结构，无点击交互）
   */
  buildProtocolPreviewHtml(parsedMsg) {
    const segment = this.mapParsedProtocolToSegment(parsedMsg);
    if (!segment || !segment.messageType) return '';
    const messageType = segment.messageType;
    const esc = (s) => this.escapeHtml(String(s ?? ''));

    const avatarHtml =
      '<span class="yd-message__avatar-fallback">' + esc('角') + '</span>';
    const nameRow = '<div class="yd-message__name">' + esc('示例角色') + '</div>';

    const mediaPlaceholderSvg =
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#e5e5e5"/><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="#8a8a8a"/></svg>'
      );

    let inner = '';

    if (messageType === 'action') {
      inner =
        '<div class="yd-message__action" style="white-space:pre-wrap">' +
        esc(this._formatMessageLineBreaksForDisplay(String(segment.content || ''))) +
        '</div>';
      return (
        '<div class="yd-message yd-global-regex-preview-msg" aria-hidden="true">' +
        '<div class="yd-message__avatar"><div class="yd-message__avatar-inner">' +
        avatarHtml +
        '</div></div><div class="yd-message__body">' +
        nameRow +
        inner +
        '</div>' +
        '</div>'
      );
    }

    if (messageType === 'suggested_reply') {
      const options = (Array.isArray(segment.suggestedReplies) ? segment.suggestedReplies : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean);
      const displayOptions = (options.length ? options : String(segment.content || '').split('|'))
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 6);
      inner =
        '<div class="yd-message__block yd-message__block--suggested-reply">' +
        '<div class="yd-suggested-reply">' +
        '<div class="yd-suggested-reply__title">灵感回复</div>' +
        '<div class="yd-suggested-reply__list">' +
        displayOptions.map((opt) => `<button type="button" class="yd-suggested-reply__item" tabindex="-1">${esc(opt)}</button>`).join('') +
        '</div></div></div>';
    }
    if (messageType === 'transfer') {
      const transferFooter = this._formatMoneyActionStatus('transfer', '');
      inner =
        '<div class="yd-message__block yd-message__block--transfer">' +
        '<div class="yd-transfer-card">' +
        '<div class="yd-transfer-card__header">' +
        '<div class="yd-transfer-card__row">' +
        '<svg class="yd-transfer-card__icon" viewBox="0 0 1024 1024" aria-hidden="true">' +
        '<path d="M725.333333 377.2672V443.733333H298.666667v-68.266666h330.837333L554.666667 296.891733l47.104-49.493333 121.856 128h1.706666v1.800533zM298.666667 646.7328V580.266667h426.666666v68.266666H394.496L469.333333 727.108267l-47.104 49.493333-121.856-128H298.666667v-1.800533z" fill="currentColor"></path>' +
        '<path d="M512 1024a512 512 0 1 1 512-512 512 512 0 0 1-512 512zM512 68.266667a443.733333 443.733333 0 1 0 443.733333 443.733333A443.733333 443.733333 0 0 0 512 68.266667z" fill="currentColor"></path>' +
        '</svg>' +
        '<div class="yd-transfer-card__main">' +
        '<div class="yd-transfer-card__amount">¥' +
        esc(String(segment.amount ?? 0)) +
        '</div>' +
        '<div class="yd-transfer-card__remark">' +
        esc(segment.remark || '转账备注') +
        '</div></div></div></div>' +
        '<div class="yd-transfer-card__footer">' +
        esc(transferFooter) +
        '</div></div></div>';
    } else if (messageType === 'redpacket') {
      const blessing = segment.blessing || '';
      const displayTitle = blessing || '大吉大利';
      const redpacketFooter = this._formatMoneyActionStatus('redpacket', '');
      inner =
        '<div class="yd-message__block yd-message__block--redpacket">' +
        '<div class="yd-redpacket-card">' +
        '<div class="yd-redpacket-card__header">' +
        '<div class="yd-redpacket-card__row">' +
        '<svg class="yd-redpacket-card__icon" viewBox="0 0 1024 1024" width="32" height="32" aria-hidden="true">' +
        '<path d="M520.084 264.084L975.494 56.59C956.633 24.253 921.6 2.695 878.485 2.695H137.432C102.4 0 70.063 21.558 51.2 48.505l468.884 215.58z m0 0" fill="#F44242"></path>' +
        '<path d="M530.863 320.674c-2.695 2.694-8.084 2.694-10.779 2.694-2.695 0-8.084 0-10.779-2.694L32.337 97.01v816.505C32.337 972.8 80.842 1024 140.127 1024h741.052c59.284 0 110.484-48.505 110.484-110.484V110.484l-460.8 210.19z m115.874 347.62c16.168 0 26.947 10.78 26.947 26.948s-10.779 26.947-26.947 26.947H536.253v107.79c0 16.168-10.78 26.947-26.948 26.947s-26.947-10.779-26.947-26.947v-107.79H371.874c-16.169 0-26.948-10.778-26.948-26.947s10.78-26.947 26.948-26.947h110.484V603.62h-113.18c-16.167 0-26.946-10.779-26.946-26.947s10.779-26.948 26.947-26.948h83.537l-91.621-91.62c-10.78-10.78-10.78-26.948 0-37.727 10.779-10.779 26.947-10.779 37.726 0l110.484 110.484L619.79 420.38c10.78-10.779 26.948-10.779 37.727 0 10.779 10.779 10.779 26.947 0 37.726l-91.621 88.927h83.537c16.168 0 26.947 10.779 26.947 26.947s-10.779 26.947-26.947 26.947h-113.18V665.6h110.485z m0 0" fill="#F44242"></path>' +
        '</svg>' +
        '<div class="yd-redpacket-card__main">' +
        '<div class="yd-redpacket-card__amount">¥' +
        esc(String(segment.amount ?? 0)) +
        '</div>' +
        '<div class="yd-redpacket-card__blessing">' +
        esc(displayTitle) +
        '</div></div></div></div>' +
        '<div class="yd-redpacket-card__footer">' +
        esc(redpacketFooter) +
        '</div></div></div>';
    } else if (messageType === 'image' || messageType === 'sticker') {
      const title = String(segment.content || '').trim();
      const label = messageType === 'sticker' ? '表情包' : '图片';
      inner =
        '<div class="yd-message__block yd-message__block--media yd-message__block--' +
        messageType +
        '" data-desc="' +
        esc(title) +
        '">' +
        '<img class="yd-message__media-img" alt="' +
        esc(title || label) +
        '" src="' +
        mediaPlaceholderSvg +
        '"/>' +
        '</div>';
    } else if (messageType === 'invitation') {
      inner =
        '<div class="yd-message__block yd-message__block--invitation">' +
        '<div class="yd-message__block-header">邀请</div>' +
        '<div class="yd-message__block-title">' +
        esc(segment.content || '') +
        '</div>' +
        '<div class="yd-message__block-sub">查看详情（占位）</div>' +
        '</div>';
    } else if (messageType === 'share') {
      if (this._isTogetherListenShareSegment(segment)) {
        inner = this._buildTogetherListenCardHtml(segment, { preview: true });
        return (
          '<div class="yd-message yd-global-regex-preview-msg" aria-hidden="true">' +
          '<div class="yd-message__avatar"><div class="yd-message__avatar-inner">' +
          avatarHtml +
          '</div></div><div class="yd-message__body">' +
          nameRow +
          inner +
          '</div>' +
          '</div>'
        );
      }
      const orderId = String(segment.orderId || '');
      const title = String(segment.shareTitle || '');
      const totalNum = Number(segment.shareTotal || 0);
      const totalText = Number.isFinite(totalNum) ? totalNum.toFixed(2) : '0.00';
      const addressText = segment.shareAddress ? String(segment.shareAddress) : '';
      const ts = Number(segment.shareTs || 0) || 0;
      const timeText = ts
        ? (() => {
            const d = new Date(ts);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${y}.${m}.${day} ${hh}:${mm}`;
          })()
        : '';
      const items = Array.isArray(segment.shareItems) ? segment.shareItems : [];
      const brand = String(segment.shareApp || '') || '外卖';
      const payStatus = (() => {
        if (String(segment.shareAction || '') === '邀请代付') return '邀请你代付';
        const s = String(segment.shareStatus || '');
        if (s === '自己已支付') return '已支付';
        if (s === '已代付') return '已代付';
        if (s === '未支付') return '未支付';
        return '已支付';
      })();
      const subtotal = items.reduce((sum, it) => {
        const u = Number(it?.unitPrice || 0) || 0;
        const q = Number(it?.qty || 0) || 0;
        return sum + u * q;
      }, 0);
      const subtotalText = Number.isFinite(subtotal) ? subtotal.toFixed(2) : '0.00';
      const itemsHtml = items
        .map((it) => {
          const emoji = String(it?.icon || '🍽️');
          const nm = String(it?.name || '').trim();
          const qty = Number(it?.qty || 0) || 0;
          const specText = String(it?.specText || '').trim();
          const unitPrice = Number(it?.unitPrice || 0) || 0;
          return (
            '<div class="yd-share-card__item-entry">' +
            '<div class="yd-share-card__item-main">' +
            '<span class="yd-share-card__item-emoji">' +
            esc(emoji) +
            '</span>' +
            '<div class="yd-share-card__item-name-spec">' +
            '<span class="yd-share-card__item-name">' +
            esc(nm || '商品') +
            '</span>' +
            '<span class="yd-share-card__item-spec">' +
            esc(specText || '') +
            '</span></div></div>' +
            '<div class="yd-share-card__item-price-qty">' +
            '<span class="yd-share-card__p-val">¥' +
            unitPrice.toFixed(2) +
            '</span>' +
            '<span class="yd-share-card__q-val">x' +
            qty +
            '</span></div></div>'
          );
        })
        .join('');
      const hasManyItems = items.length > 4;
      inner =
        '<div class="yd-message__block yd-message__block--share">' +
        '<div class="yd-share-card" data-order-id="' +
        esc(orderId) +
        '" data-source="' +
        esc(brand === '外卖' ? 'takeout' : 'shop') +
        '">' +
        '<div class="yd-share-card__status-header">' +
        '<span class="yd-share-card__brand">' +
        esc(brand) +
        '</span>' +
        '<span class="yd-share-card__pay-status">' +
        esc(payStatus) +
        '</span></div>' +
        '<div class="yd-share-card__main-info">' +
        '<h2 class="yd-share-card__order-title">' +
        esc(title || '订单') +
        '</h2>' +
        '<div class="yd-share-card__address-box">' +
        '<span class="yd-share-card__address-pin" aria-hidden="true">📍</span>' +
        '<span class="yd-share-card__address-text">送至：' +
        esc(addressText || '—') +
        '</span></div>' +
        '<div class="yd-share-card__items-list">' +
        (itemsHtml ||
          '<div style="padding:4px 0;color:rgba(17,17,17,0.45);font-size:12px;">暂无商品</div>') +
        '</div>' +
        (hasManyItems
          ? '<button type="button" class="yd-share-card__toggle" data-role="share-items-toggle" aria-expanded="false">展开 ▼</button>'
          : '') +
        '<div class="yd-share-card__cost-detail">' +
        '<div class="yd-share-card__detail-row"><span>商品小计</span><span>¥' +
        esc(subtotalText) +
        '</span></div>' +
        '<div class="yd-share-card__below-subtotal-meta">' +
        '<div class="yd-share-card__meta-line"><span>订单编号</span><span>' +
        esc(orderId) +
        '</span></div>' +
        '<div class="yd-share-card__meta-line"><span>下单时间</span><span>' +
        esc(timeText || '') +
        '</span></div></div>' +
        '<div class="yd-share-card__total-row">' +
        '<span class="yd-share-card__total-label">实付总额</span>' +
        '<span class="yd-share-card__total-price">¥' +
        esc(totalText) +
        '</span></div></div></div></div></div>';
    } else {
      let contentHtml = '';
      if (messageType === 'voice_text') {
        const speakTextRaw = String(segment.foreignText || segment.content || '');
        const speakText = this._stripVoiceMoodTagsFromNonVoiceMessage(`[语音]${speakTextRaw}`).replace(/^\[语音\]/, '');
        const durationSec = Math.max(1, Math.ceil(String(speakText || '').replace(/\s+/g, '').length / 2));
        contentHtml =
          '<div class="yd-voice-bubble">' +
          '<button type="button" class="yd-voice-bubble__play" aria-label="播放语音" tabindex="-1">' +
          '<svg class="yd-voice-bubble__svg yd-voice-bubble__svg--play" aria-hidden="true" viewBox="0 0 1024 1024" focusable="false">' +
          '<path d="M819.498667 584.832L343.168 875.904A85.333333 85.333333 0 0 1 213.333333 803.114667V220.885333a85.333333 85.333333 0 0 1 129.834667-72.789333l476.330667 291.072a85.333333 85.333333 0 0 1 0 145.664z" fill="currentColor"></path>' +
          '</svg></button>' +
          '<div class="yd-voice-bubble__duration"><span class="yd-voice-bubble__duration-num">' +
          durationSec +
          '"</span><span class="yd-voice-bubble__waveform" aria-hidden="true"><span class="yd-voice-bubble__bar"></span><span class="yd-voice-bubble__bar"></span><span class="yd-voice-bubble__bar"></span><span class="yd-voice-bubble__bar"></span></span></div></div>';
      } else if (segment.isBilingual && segment.foreignText) {
        contentHtml = this._buildBilingualBubbleInnerHtml(segment, esc);
      } else if (segment.isReply && segment.replyTo) {
        contentHtml =
          '<div class="yd-message__reply-to">' +
          esc(segment.replyTo) +
          '</div>' +
          '<div class="yd-message__text">' +
          esc(this._formatMessageLineBreaksForDisplay(String(segment.content || ''))) +
          '</div>';
      } else {
        contentHtml =
          '<div class="yd-message__text">' +
          esc(this._formatMessageLineBreaksForDisplay(String(segment.content || ''))) +
          '</div>';
      }
      inner = '<div class="yd-message__content">' + contentHtml + '</div>';
    }

    const bilingualClass = segment.isBilingual ? ' yd-message--bilingual' : '';
    const typeClass =
      (messageType && messageType !== 'plain' ? ' yd-message--' + messageType : '') + bilingualClass;
    return (
      '<div class="yd-message yd-global-regex-preview-msg' +
      typeClass +
      '" aria-hidden="true">' +
      '<div class="yd-message__avatar"><div class="yd-message__avatar-inner">' +
      avatarHtml +
      '</div></div><div class="yd-message__body">' +
      nameRow +
      inner +
      '</div></div>'
    );
  },

  _bindMoneyActionModal() {
    if (this._moneyActionBound) return;
    this._moneyActionBound = true;
    const modal = document.getElementById('chat-money-action-modal');
    modal?.addEventListener('click', (e) => {
      const t = e?.target;
      const cancelEl = t?.closest?.('#chat-money-action-cancel');
      if (cancelEl) {
        e.preventDefault();
        e.stopPropagation();
        this._closeMoneyActionModal();
        return;
      }
      const receiveEl = t?.closest?.('#chat-money-action-receive');
      if (receiveEl) {
        if (receiveEl.hasAttribute('disabled') || receiveEl.classList?.contains('chat-money-action-card__open-btn--handled') || receiveEl.classList?.contains('btn-confirm--handled')) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        void this._confirmMoneyAction('received');
        return;
      }
      const refundEl = t?.closest?.('#chat-money-action-refund');
      if (refundEl) {
        e.preventDefault();
        e.stopPropagation();
        void this._confirmMoneyAction('refunded');
        return;
      }

      // 点击卡片外部空白区域（含遮罩）也关闭
      const insideCard = t?.closest?.('#chat-money-action-card');
      if (!insideCard) {
        e.preventDefault();
        this._closeMoneyActionModal();
      }
    });

    document.getElementById('chat-money-action-mask')?.addEventListener('click', () => this._closeMoneyActionModal());
  },

  _openMoneyActionModal(ctx) {
    const modal = document.getElementById('chat-money-action-modal');
    const cardEl = document.getElementById('chat-money-action-card');
    if (!modal || !cardEl) return;
    this._moneyActionContext = ctx || null;
    const kind = ctx?.kind === 'transfer' ? 'transfer' : 'redpacket';
    const amount = Number(ctx?.amount) || 0;
    const fromName = String(ctx?.fromName || '对方');
    const handledStatus = String(ctx?.handledStatus || '').trim(); // received/refunded
    const transferStatusHeadline = handledStatus === 'received'
      ? '已收款'
      : handledStatus === 'refunded'
        ? '已退还'
        : (ctx?.isUserSender ? '待对方收款' : '待确认收款');

    // 格式化为：YYYY-MM-DD HH:mm:ss
    const formatDateTimeAbsolute = (ts) => {
      const n = Number(ts);
      if (!Number.isFinite(n) || n <= 0) return '';
      const d = new Date(n);
      const pad = (v) => String(v).padStart(2, '0');
      const y = d.getFullYear();
      const m = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hh = pad(d.getHours());
      const mm = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
    };

    if (kind === 'transfer') {
      const remark = (String(ctx?.remark || '').trim() || '转账留言');
      const createdAt = Number(ctx?.createdAt || Date.now());
      const timeText = formatDateTimeAbsolute(createdAt) || '';

      cardEl.className = 'chat-money-action-card chat-money-action-card--transfer';
      cardEl.innerHTML = `
        <div class="transfer-card">
          <button class="chat-money-action-card__close chat-money-action-card__close--transfer" id="chat-money-action-cancel" type="button" aria-label="关闭">×</button>
          <div class="card-pattern"></div>
          <div class="header">
            <div class="icon-box"></div>
            <div class="status-text">${this.escapeHtml(transferStatusHeadline)}</div>
          </div>
          <div class="amount">${this.escapeHtml(String(amount.toFixed(2)))}</div>
          <div class="details">
            <div class="divider"></div>
            <div class="info-row">
              <span class="label">转账说明</span>
              <div class="memo-content">${this.escapeHtml(remark)}</div>
            </div>

            <div class="info-row">
              <span class="label">转账时间</span>
              <div class="time-value">${this.escapeHtml(timeText)}</div>
            </div>
          </div>

          <div class="footer">
            <button class="btn-confirm${handledStatus ? ' btn-confirm--handled' : ''}" id="chat-money-action-receive" type="button" ${handledStatus ? 'disabled' : ''}>${handledStatus === 'received' ? '已领取' : (handledStatus === 'refunded' ? '已退还' : '确认收款')}</button>
            <div>
              <span class="return-link" id="chat-money-action-refund" role="button" tabindex="0" style="${handledStatus ? 'display:none;' : ''}">退还给对方</span>
            </div>
          </div>
        </div>
      `;
    } else {
      // 红包（领取/退还）保持你当前的“红底半圆”风格
      const blessing = (String(ctx?.blessing || '').trim() || '恭喜发财');
      cardEl.className = 'chat-money-action-card chat-money-action-card--redpacket';
      const redpacketActionHtml = handledStatus
        ? `<div class="chat-money-action-card__handled-text">${handledStatus === 'received' ? '已领取' : '已退还'}</div>`
        : `
        <button class="chat-money-action-card__open-btn" id="chat-money-action-receive" type="button">
          <div class="chat-money-action-card__open-btn-inner" aria-hidden="true"></div>
          開
        </button>
      `;
      cardEl.innerHTML = `
        <button class="chat-money-action-card__close" id="chat-money-action-cancel" type="button" aria-label="关闭">×</button>
        <div class="chat-money-action-card__cap" id="chat-money-action-cap" aria-hidden="true"></div>
        <div class="chat-money-action-card__body-pattern" id="chat-money-action-body-pattern" aria-hidden="true"></div>

        <div class="chat-money-action-card__wishes" id="chat-money-action-wishes">
          <div class="chat-money-action-card__wishes-top">
            <div class="chat-money-action-card__from" id="chat-money-action-from"></div>
            <div class="chat-money-action-card__amount" id="chat-money-action-top-amount">¥${amount.toFixed(2)}</div>
          </div>
          <div class="chat-money-action-card__text" id="chat-money-action-top-lines">
            <div>${this.escapeHtml(blessing)}</div>
          </div>
        </div>

        ${redpacketActionHtml}

        <div class="chat-money-action-card__footer-tag" id="chat-money-action-refund" role="button" tabindex="0" aria-label="退还" style="${handledStatus ? 'display:none;' : ''}">退还</div>
      `;

      const fromEl = cardEl.querySelector('#chat-money-action-from');
      if (fromEl) {
        fromEl.textContent = `来自 ${fromName} 的红包`;
      }
    }

    modal.classList.add('chat-money-action-modal--active');
    modal.setAttribute('aria-hidden', 'false');
    this._bindMoneyActionModal();
  },

  _closeMoneyActionModal() {
    const modal = document.getElementById('chat-money-action-modal');
    if (!modal) return;
    try {
      const active = document.activeElement;
      if (active && modal.contains(active) && typeof active.blur === 'function') active.blur();
    } catch (e) {}
    try {
      const sink = document.getElementById('chat-messages') || document.getElementById('page-chat') || document.body;
      if (sink && typeof sink.focus === 'function') sink.focus({ preventScroll: true });
    } catch (e) {}
    modal.classList.remove('chat-money-action-modal--active');
    modal.setAttribute('aria-hidden', 'true');
    this._moneyActionContext = null;
  },

  _bindMoneyPacketViewModal() {
    if (this._moneyPacketViewBound) return;
    this._moneyPacketViewBound = true;
    const modal = document.getElementById('chat-money-packet-view-modal');
    modal?.addEventListener('click', (e) => {
      const t = e?.target;
      const closeEl = t?.closest?.('#chat-money-packet-view-close');
      if (closeEl) {
        e.preventDefault();
        e.stopPropagation();
        this._closeMoneyPacketView();
        return;
      }
      const insideCard = t?.closest?.('#chat-money-packet-view');
      if (!insideCard) {
        e.preventDefault();
        this._closeMoneyPacketView();
      }
    });

    document.getElementById('chat-money-packet-view-close')?.addEventListener('click', () => this._closeMoneyPacketView());
    document.getElementById('chat-money-packet-view-mask')?.addEventListener('click', () => this._closeMoneyPacketView());
    document.getElementById('chat-money-packet-view-open-btn')?.addEventListener('click', () => {
      const btn = document.getElementById('chat-money-packet-view-open-btn');
      if (!btn) return;
      btn.classList.remove('chat-money-packet-view__open-btn--pulse');
      // 触发重排以保证动画每次都能播
      void btn.offsetWidth;
      btn.classList.add('chat-money-packet-view__open-btn--pulse');
      setTimeout(() => btn.classList.remove('chat-money-packet-view__open-btn--pulse'), 380);
    });
  },

  _openMoneyPacketView(ctx, status) {
    const modal = document.getElementById('chat-money-packet-view-modal');
    const viewEl = document.getElementById('chat-money-packet-view');
    const iconEl = document.getElementById('chat-money-packet-view-icon');
    const fromEl = document.getElementById('chat-money-packet-view-from');
    const amountEl = document.getElementById('chat-money-packet-view-amount');
    const textEl = document.getElementById('chat-money-packet-view-text');
    const openBtn = document.getElementById('chat-money-packet-view-open-btn');
    const footerTagEl = document.getElementById('chat-money-packet-view-footer-tag');

    if (!modal || !viewEl || !iconEl || !amountEl || !textEl || !openBtn || !footerTagEl || !fromEl) return;

    const kind = ctx?.kind === 'transfer' ? 'transfer' : 'redpacket';
    const amount = Number(ctx?.amount) || 0;
    const blessing = kind === 'redpacket' ? String(ctx?.blessing || '').trim() : '';
    const remark = kind === 'transfer' ? String(ctx?.remark || '').trim() : '';
    const desc = kind === 'transfer'
      ? (remark || '转账留言')
      : (blessing || '大吉大利');

    const processedClass = status === 'received'
      ? ' chat-money-packet-view--processed-received'
      : ' chat-money-packet-view--processed-refunded';
    viewEl.className = `chat-money-packet-view${kind === 'transfer' ? ' chat-money-packet-view--transfer' : ''}${processedClass}`;

    iconEl.innerHTML = '';
    if (kind === 'transfer') {
      iconEl.innerHTML = `
        <svg viewBox="0 0 1024 1024" width="44" height="44" aria-hidden="true">
          <path d="M725.333333 377.2672V443.733333H298.666667v-68.266666h330.837333L554.666667 296.891733l47.104-49.493333 121.856 128h1.706666v1.800533zM298.666667 646.7328V580.266667h426.666666v68.266667H394.496L469.333333 727.108267l-47.104 49.493333-121.856-128H298.666667v-1.800533z" fill="#fce3a2"></path>
        </svg>
      `;
    } else {
      iconEl.innerHTML = `
        <svg viewBox="0 0 1024 1024" width="44" height="44" aria-hidden="true">
          <path d="M520.084 264.084L975.494 56.59C956.633 24.253 921.6 2.695 878.485 2.695H137.432C102.4 0 70.063 21.558 51.2 48.505l468.884 215.58z" fill="#fce3a2"></path>
          <path d="M530.863 320.674c-2.695 2.694-8.084 2.694-10.779 2.694-2.695 0-8.084 0-10.779-2.694L32.337 97.01v816.505C32.337 972.8 80.842 1024 140.127 1024h741.052c59.284 0 110.484-48.505 110.484-110.484V110.484l-460.8 210.19z" fill="#fce3a2" opacity="0.95"></path>
          <path d="M530.863 320.674c-2.695 2.694-8.084 2.694-10.779 2.694-2.695 0-8.084 0-10.779-2.694L32.337 97.01v816.505C32.337 972.8 80.842 1024 140.127 1024h741.052c59.284 0 110.484-48.505 110.484-110.484V110.484l-460.8 210.19z m115.874 347.62c16.168 0 26.947 10.78 26.947 26.948s-10.779 26.947-26.947 26.947H536.253v107.79c0 16.168-10.78 26.947-26.948 26.947s-26.947-10.779-26.947-26.947v-107.79H371.874c-16.169 0-26.948-10.778-26.948-26.947s10.78-26.947 26.948-26.947h110.484V603.62h-113.18c-16.167 0-26.946-10.779-26.946-26.947s10.779-26.948 26.946-26.948h83.537l-91.621-91.62c-10.78-10.78-10.78-26.948 0-37.727 10.779-10.779 26.947-10.779 37.726 0l110.484 110.484L619.79 420.38c10.78-10.779 26.948-10.779 37.727 0 10.779 10.779 10.779 26.947 0 37.726l-91.621 88.927h83.537c16.168 0 26.947 10.779 26.947 26.947s-10.779 26.947-26.947 26.947h-113.18V665.6h110.485z m0 0" fill="#fce3a2"></path>
        </svg>
      `;
    }

    amountEl.textContent = `¥${amount.toFixed(2)}`;
    textEl.textContent = desc;
    fromEl.textContent = kind === 'redpacket' ? `来自 ${String(ctx?.fromName || '对方')} 的红包` : '';

    // 已处理状态下只是“打开查看”，不再触发领取/退还逻辑
    openBtn.textContent = '開';
    openBtn.disabled = false;

    // 已领取的红包页不显示“退还”
    if (status === 'received') {
      footerTagEl.style.display = 'none';
    } else {
      footerTagEl.style.display = '';
      footerTagEl.textContent = '退还';
    }

    this._bindMoneyPacketViewModal();
    modal.classList.add('chat-money-packet-view-modal--active');
    modal.setAttribute('aria-hidden', 'false');
  },

  _closeMoneyPacketView() {
    const modal = document.getElementById('chat-money-packet-view-modal');
    if (!modal) return;
    try {
      const active = document.activeElement;
      if (active && modal.contains(active) && typeof active.blur === 'function') active.blur();
    } catch (e) {}
    try {
      const sink = document.getElementById('chat-messages') || document.getElementById('page-chat') || document.body;
      if (sink && typeof sink.focus === 'function') sink.focus({ preventScroll: true });
    } catch (e) {}
    modal.classList.remove('chat-money-packet-view-modal--active');
    modal.setAttribute('aria-hidden', 'true');
  },

  _ensureLastMessageVisibleAboveInput() {
    try {
      const container = this._getChatScrollContainer();
      const root = document.getElementById('chat-scroll');
      const page = document.getElementById('page-chat');
      if (!container || !root || !page) return;
      const footer = page.querySelector('.yd-page-footer.yd-chat-input-wrapper');
      if (!footer) return;

      // 需要覆盖输入栏的“最后一块内容”可能是：
      // - 标准气泡消息：.yd-message
      // - 动作块：.yd-message__action
      // - 语音 inline：.yd-message-inline-voice-row
      // - assistant plain：.yd-message__plain / .yd-message__plain--md
      const candidates = Array.from(
        root.querySelectorAll('.yd-message, .yd-message__action, .yd-message-inline-voice-row, .yd-message__plain, .yd-message__plain--md')
      );
      const lastContentEl = candidates.length ? candidates[candidates.length - 1] : null;
      if (!lastContentEl) return;
      const spacerEl = document.getElementById('yd-chat-bottom-spacer');

      const footerTop = footer.getBoundingClientRect().top;
      const lastBottom = lastContentEl.getBoundingClientRect().bottom;
      const safeGap = 26;
      const covered = lastBottom - (footerTop - safeGap);
      if (covered > 0) {
        const prevTop = Number(container.scrollTop || 0);
        container.scrollTop = prevTop + covered + 12;

        // 如果已经在最大 scrollTop 仍然被遮挡，说明底部 spacer 仍不足；
        // 这里只做滚动兜底，不再在这里直接改 spacer，避免与 _updateChatBottomPadding 竞争写入。
        const maxTop = Math.max(0, (container.scrollHeight || 0) - (container.clientHeight || 0));
        const reachedMax = Math.abs((Number(container.scrollTop || 0)) - maxTop) < 1.5;
        if (reachedMax) {
          container.scrollTop = container.scrollHeight;
        }
      }
    } catch (e) {}
  },

  _needsActionBottomBoost() {
    try {
      if (!Array.isArray(this.messages) || !this.messages.length) return false;
      let last = null;
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const m = this.messages[i];
        if (!m) continue;
        last = m;
        break;
      }
      if (!last) return false;
      const text = String(last.content || '').trim();
      if (!text) return false;
      // 针对领取/退还动作消息（本地伪发送）增加会话级底部补偿
      return /^\[动作\]我(领取了|退还了).*(红包|转账)/.test(text);
    } catch (e) {
      return false;
    }
  },

  async _onMoneyCardClick(ctx) {
    const messageId = String(ctx?.messageId || '');
    if (!messageId) return;
    const tx = this._getMoneyTxRecord(messageId);
    const isReceipt = !!(ctx?.isReceipt || (tx && tx.receiptMessageId === messageId));
    const senderMessageId = String(tx?.senderMessageId || messageId);
    const effectiveCtx = {
      ...(ctx || {}),
      messageId: senderMessageId,
      isReceipt,
      isUserSender: !!(ctx?.isUserSender && !isReceipt)
    };

    if (isReceipt && ctx?.role === 'assistant') {
      const existed = this._getMoneyTxRecord(messageId);
    if (existed && existed.status) {
        this._openMoneyActionModal({ ...effectiveCtx, messageId, handledStatus: existed.status, readOnly: true });
      } else if (typeof this._toast === 'function') {
        this._toast('等待对方收款');
      }
      return;
    }

    if (effectiveCtx.isUserSender) {
      const settled = this._getMoneySettledStatus(senderMessageId);
      if (settled) {
        this._openMoneyActionModal({ ...effectiveCtx, handledStatus: settled });
      } else if (typeof this._toast === 'function') {
        this._toast('已发给对方，等待对方收款');
      }
      return;
    }
    const settledIncoming = this._getMoneySettledStatus(senderMessageId);
    if (settledIncoming) {
      this._openMoneyActionModal({ ...effectiveCtx, handledStatus: settledIncoming });
      return;
    }
    this._openMoneyActionModal(effectiveCtx);
  },

  async _confirmMoneyAction(status) {
    const ctx = this._moneyActionContext;
    if (!ctx || !ctx.messageId) return;
    const messageId = String(ctx.messageId);
    const tx = this._getMoneyTxRecord(messageId);
    const senderMessageId = String(tx?.senderMessageId || messageId);
    let senderMsg = this._findMessageInSessionMemory(senderMessageId);
    if (!senderMsg) {
      try {
        senderMsg = await Storage.dbGet('messages', senderMessageId);
      } catch (eDb) {}
    }
    const settledBefore = this._getMoneySettledStatus(senderMessageId, senderMsg);
    if (settledBefore) {
      this._closeMoneyActionModal();
      alert(settledBefore === 'received' ? '该红包/转账已领取' : '该红包/转账已退还');
      return;
    }

    const kind = ctx.kind === 'transfer' ? 'transfer' : 'redpacket';
    const fromName = String(ctx.fromName || '对方');
    const amount = Math.max(0, Number(ctx.amount) || 0);
    const sid = String(ctx.sessionId || this.currentSessionId || '');
    let isGroup = false;
    try {
      const session = await Storage.dbGet('sessions', sid);
      isGroup = !!(session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1);
    } catch (eSess) {}

    let info = senderMsg ? this._parseMoneyMessage(senderMsg.content, isGroup) : null;
    if (!info && senderMsg) info = this._parseMoneyMessage(senderMsg.content, !isGroup);
    const protocolId = String(info?.messageId || senderMessageId).trim();
    const stLabel = this._collectStatusLabel(status);
    const collectContent =
      kind === 'transfer'
        ? this._buildCollectTransferContent(amount, info?.remark || ctx.remark, protocolId, isGroup, '', stLabel)
        : this._buildCollectRedpacketContent(
            amount,
            info?.blessing || ctx.blessing,
            protocolId,
            isGroup,
            '',
            stLabel
          );

    const collectMsg = {
      id: State.generateId(),
      sessionId: sid,
      role: 'user',
      content: collectContent,
      createdAt: Date.now(),
      mode: this._getCurrentSessionMode(),
      characterName: fromName
    };
    await Storage.dbAdd('messages', collectMsg);
    if (String(this.currentSessionId || '') === sid) {
      this.messages.push(collectMsg);
      if (Array.isArray(this._sessionAllMessages)) {
        this._sessionAllMessages.push(collectMsg);
        this._sessionAllMessages.sort(
          (a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)
        );
      }
    }

    const applyResult = await this.applyMoneyCollectMessage({
      sessionId: sid,
      content: collectContent,
      collectMessageId: collectMsg.id,
      role: 'user'
    });
    if (!applyResult?.ok && applyResult?.reason === 'wallet_not_activated') {
          alert('请先初始化并激活银行卡');
          if (typeof State !== 'undefined' && State.switchPage) State.switchPage('page-wallet');
          return;
        }
    if (!applyResult?.ok && applyResult?.reason === 'wallet_credit_failed') {
        alert('领取失败，请稍后重试');
        return;
      }

    if (status === 'received' && applyResult?.ok) {
      try {
        if (typeof Notifications !== 'undefined' && Notifications && typeof Notifications.enqueue === 'function') {
          const now = new Date();
          const mm = now.getMonth() + 1;
          const dd = now.getDate();
          const act = kind === 'transfer' ? '转账' : '红包';
          const amountText = amount.toFixed(2);
          const body = `您的银行账户${mm}月${dd}日领取${act}${amountText}元`;
          Notifications.enqueue('聊天', '剧情转账', body, 0, '消息');
        }
      } catch (e) {}
    }

    this._closeMoneyActionModal();
    // 领取/退还动作消息：给一次短时固定底部补偿，避免被输入框覆盖
    this._actionBottomPadBoostUntil = Date.now() + 1800;
    this._forceFullRenderNext = true;
    this._forceBottomAfterRender = true;
    await this.renderMessages();
    // 领取/退还后新增本地动作消息：统一走一轮稳定的底部补偿与可见性校正
    this._updateChatBottomPadding();
    this._scrollChatToBottom();
    this._ensureLastMessageVisibleAboveInput();
    window.requestAnimationFrame(() => {
      this._updateChatBottomPadding();
      this._scrollChatToBottom();
      this._ensureLastMessageVisibleAboveInput();
    });
    this._scheduleChatListRefresh();
  },

  /** 与 _flushPendingMessages 中每条 pending 用户消息的装饰规则一致（用于合成 API 多模态 parts） */
  _decoratePendingUserLineForApi(m, wrapUserLineForApi) {
    let base = String(m.content || '').trim();
    if (!base) return '';
    try {
      const sess = this.currentSession || null;
      const isGroup = !!(sess && Array.isArray(sess.participantCharacterIds) && sess.participantCharacterIds.length > 1);
      if (m && m.id) {
        base = /\n/.test(base)
          ? this.ensureMoneyMultilineContentWithMessageId(base, m.id, isGroup)
          : this.ensureMoneyContentWithMessageId(base, m.id, isGroup);
      }
    } catch (eMoneyId) {}
    let decorated = base;
    if (/^\[分享\]论坛\|帖子\|查看\|/.test(base)) {
      const parts = base.replace(/^\[分享\]/, '').split('|');
      const fallbackTitle = String(parts[4] || '').trim();
      const forumShareContext = this._buildForumShareContextTextFromPayload(m.sharePayloadB64, fallbackTitle);
      if (forumShareContext) decorated = `${base}\n${forumShareContext}`;
    }
    const hasProtocolTag = /^\[[^\]]+\]/.test(base);
    const ownReplyTo = String(m.replyTo || '').trim();
    if (ownReplyTo) {
      return wrapUserLineForApi ? `[消息]${decorated}|${ownReplyTo}` : `${decorated}|${ownReplyTo}`;
    }
    if (hasProtocolTag) return decorated;
    return wrapUserLineForApi ? `[消息]${decorated}` : decorated;
  },

  /**
   * 当本轮 pending 中含相册 vision（imageDataUrl：data URL 或 http(s)）时，生成 OpenAI 兼容 user.content 数组
   */
  _buildUserContentPartsForApiFlush(pendingMsgs, wrapUserLineForApi) {
    const parts = [];
    let hasImage = false;
    for (const m of pendingMsgs) {
      const line = this._decoratePendingUserLineForApi(m, wrapUserLineForApi);
      if (!line) continue;
      parts.push({ type: 'text', text: line });
      const url = String(m.imageDataUrl || '').trim();
      if (
        url &&
        typeof ChatMessageBuilder !== 'undefined' &&
        ChatMessageBuilder.isAutoVisionEnabled &&
        ChatMessageBuilder.isAutoVisionEnabled() &&
        ChatMessageBuilder.isVisionImageUrlForApi &&
        ChatMessageBuilder.isVisionImageUrlForApi(url)
      ) {
        parts.push({ type: 'image_url', image_url: { url } });
        hasImage = true;
      }
    }
    if (!parts.length || !hasImage) return null;
    return parts;
  },

  async _flushPendingMessages(pendingIdsToFlush = null, callOpts = null) {
    if (this._flushingPending) return;
    this._flushingPending = true;
    this._updateSendButtonState();

    let flushSafetyTimer = null;
    let flushSid = '';

    try {
      const pendingIds = Array.isArray(pendingIdsToFlush)
        ? pendingIdsToFlush.slice()
        : (Array.isArray(this._pendingUserQueue) ? this._pendingUserQueue.slice() : []);
      const pendingSet = new Set(pendingIds);
      const pendingMsgs = this.messages.filter(m => m && m.role === 'user' && pendingSet.has(m.id));

      if (!pendingMsgs.length) {
        // 仅部分 flush 时，如果传入的 pending 已不在内存里，直接返回
        if (Array.isArray(pendingIdsToFlush)) {
          this._pendingUserQueue = (Array.isArray(this._pendingUserQueue) ? this._pendingUserQueue : [])
            .filter(id => !pendingSet.has(id));
        }
        return;
      }

      const sess = this.currentSession || await Storage.dbGet('sessions', this.currentSessionId);
      const flushMode = sess && sess.mode != null ? (Number(sess.mode) === 1 ? 1 : 0) : this._getCurrentSessionMode();
      const wrapUserLineForApi = flushMode === 0;

      const combined = pendingMsgs
        .map((m) => this._decoratePendingUserLineForApi(m, wrapUserLineForApi))
        .filter(Boolean)
        .join('\n');
      if (!combined) {
        if (Array.isArray(pendingIdsToFlush)) {
          this._pendingUserQueue = (Array.isArray(this._pendingUserQueue) ? this._pendingUserQueue : [])
            .filter(id => !pendingSet.has(id));
        } else {
        this._pendingUserQueue = [];
        }
        return;
      }

      // historyForApi：改为“动态合并记忆打包”。
      // - 最近窗口按 CHAT_ROUNDS 截断（跨线上/线下统一窗口）
      // - 当前模式保留原始 user/assistant 序列
      // - 非当前模式按连续段落压成 assistant 合并块
      const currentMode = flushMode;
      const historyForApi = await this._buildDynamicPackedHistoryForApi({
        session: sess,
        currentMode,
        pendingSet
      });

      let sparkRelight = false;
      let sparkFirstLight = false;
      try {
        const lastKey = this._getSparkLastActivityDayKeyExcluding(this._sessionAllMessages, pendingSet);
        const todayKey = this._sparkCalendarDayKey(Date.now());
        if (lastKey && todayKey) {
          sparkRelight = this._sparkCalendarDaysBetween(lastKey, todayKey) >= 2;
        } else if (!lastKey) {
          // 当前模式下此前无可计火花消息（含新会话）：首次真实发送后标题 0→1 也应有提示
          sparkFirstLight = true;
        }
      } catch (eSpark) {}
      const sparkFlushSessionId = String(this.currentSessionId || '').trim();
      flushSid = sparkFlushSessionId;
      const flushSafetyMs = Number((CONFIG && CONFIG.API_CHAT_TIMEOUT_MS) || 301000);
      flushSafetyTimer = setTimeout(() => {
        try {
          if (!this._flushingPending) return;
          this._flushingPending = false;
          this._updateSendButtonState();
          if (flushSid) this._clearTypingIfMatches(flushSid);
        } catch (e) {}
      }, flushSafetyMs);

      // 真实发送后：显示“正在输入中...”（绑定当前会话，切到其它会话时不显示）
      this._setTypingStatus(true, flushSid);
      try {
        requestAnimationFrame(() => this._updateTypingDisplay());
      } catch (e) {}
      const proactiveFlushSessionId = String(this.currentSessionId || '');
      // 点击“真实发送”后应立即恢复按钮图标（不等待 API 返回）。
      // 先基于 pending 快照构造好 combined/historyForApi，再立刻清队列并刷新按钮状态。
      const idsToClear = Array.from(pendingSet);
        this.messages.forEach(m => {
        if (m && pendingSet.has(m.id) && m._pending) delete m._pending;
      });
      this._pendingUserQueue = (Array.isArray(this._pendingUserQueue) ? this._pendingUserQueue : [])
        .filter(id => !pendingSet.has(id));
      this._updateSendButtonState();
      try {
        this._syncFlushedUserMessagesInDom(pendingSet);
      } catch (eSyncFlush) {}

      // 无论 AI 调用是否成功，都认为“真实发送”动作已完成；
      // 失败信息会在 callAI 内部以助手消息形式回显，用户可重新入队后再发送。
      const userContentParts = this._buildUserContentPartsForApiFlush(pendingMsgs, wrapUserLineForApi);
      await this.callAI(combined, historyForApi, {
        ...(callOpts && typeof callOpts === 'object' ? callOpts : {}),
        ...(userContentParts ? { userContentParts } : {})
      });

      if (sparkRelight || sparkFirstLight) {
        try {
          const eligible = this._getSparkStreakSourceMessages().filter((m) => this._isSparkStreakEligibleMessage(m));
          const days = Math.max(1, this._computeStreakDaysFromMessageList(eligible));
          const kind = sparkRelight ? 'renew' : 'light';
          const text = this._getSparkNoticeText(kind, days);
          const todayKey = this._sparkCalendarDayKey(Date.now()) || 'day';
          await this._insertSparkNoticeMessage({
            sessionId: sparkFlushSessionId,
            kind,
            text,
            dedupeId: `spark_${sparkFlushSessionId}_${kind}_${todayKey}_${Date.now()}`
          });
          if (String(this.currentSessionId || '') === sparkFlushSessionId) {
            await this.loadMessages();
          }
        } catch (eRenew) {}
      }

      if (typeof ProactiveScheduler !== 'undefined' && ProactiveScheduler.afterUserFlush) {
        void ProactiveScheduler.afterUserFlush(proactiveFlushSessionId);
      }
      // 若该会话存在“待发送主动消息”倒计时：用户刚发言则顺延（并同步服务端 dueAt）
      if (typeof ProactiveScheduler !== 'undefined' && ProactiveScheduler.deferPendingOnUserActivity) {
        void ProactiveScheduler.deferPendingOnUserActivity(proactiveFlushSessionId);
      }

      // DB 纠正放到后台做：避免大量消息时 UI “卡住”导致图标迟迟不变
      (async () => {
        for (const id of idsToClear) {
          try {
            const row = await Storage.dbGet('messages', id);
            if (row && row._pending) {
              const next = { ...row };
              delete next._pending;
              await Storage.dbPut('messages', next);
            }
          } catch (e) {}
        }
      })().catch(() => {});
    } finally {
      try {
        clearTimeout(flushSafetyTimer);
      } catch (e) {}
      this._flushingPending = false;
      this._updateSendButtonState();
      // AI 响应结束：恢复为“在线”
      if (flushSid) this._clearTypingIfMatches(flushSid);
      else this._setTypingStatus(false);
    }
  },

  _autoResizeTextarea(textarea, maxLines = 3) {
    if (!textarea) return;
    const cs = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const paddingBottom = parseFloat(cs.paddingBottom) || 0;
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
    const maxHeight = lineHeight * maxLines + paddingTop + paddingBottom + borderTop + borderBottom;

    textarea.style.height = 'auto';
    const next = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = next + 'px';
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    // 输入框高度变化会影响底部遮挡补偿，及时重算一次
    this._updateChatBottomPadding();
  },

  _showModelPicker(selectEl) {
    const existing = document.getElementById('yd-model-picker');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-model-picker';
    overlay.className = 'yd-voice-sheet';
    overlay.innerHTML = `
      <div class="yd-voice-sheet__mask"></div>
      <div class="yd-voice-sheet__panel" role="dialog" aria-modal="true">
        <div class="yd-voice-sheet__title">选择模型</div>
        <div class="yd-model-picker__list"></div>
        <button class="yd-btn yd-btn--secondary yd-voice-sheet__close" type="button">关闭</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const list = overlay.querySelector('.yd-model-picker__list');
    if (list) {
      const options = Array.from(selectEl.options || []);
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'yd-btn yd-btn--secondary';
        btn.style.width = '100%';
        btn.style.justifyContent = 'space-between';
        btn.textContent = opt.value;
        if (opt.value === selectEl.value) {
          btn.classList.add('yd-btn--primary');
        }
        btn.addEventListener('click', () => {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event('change'));
          overlay.remove();
        });
        list.appendChild(btn);
      });
    }

    const close = () => overlay.remove();
    overlay.querySelector('.yd-voice-sheet__mask')?.addEventListener('click', close);
    overlay.querySelector('.yd-voice-sheet__close')?.addEventListener('click', close);
  },

  // 触发“拍了拍 xxx”（聊天内作为一条动作消息）
  _triggerAvatarPat(name) {
    const displayName = String(name || '').trim() || 'Ta';
    console.log('[chat] pat-trigger', displayName);
    Chat._queueUserMessage(`[动作]你拍了拍${displayName}`).catch(err => {
      console.warn('[chat] pat queue failed', err);
    });
  },

  // 从聊天进入角色详情（返回页仍为聊天）
  async _openRoleDetailFromChat(characterId) {
    const cid = String(characterId || '').trim();
    if (!cid) {
      State.switchPage('page-character');
      return;
    }
    try {
      State.characterEditReturnPage = 'page-chat';
      State.characterEditReturnSessionId = String(Chat.currentSessionId || this.currentSessionId || '');
    } catch (err) {}
    try {
      if (typeof Character !== 'undefined' && Character && typeof Character.openCharacterDetailById === 'function') {
        const ok = await Character.openCharacterDetailById(cid);
        if (!ok) State.switchPage('page-character');
      } else {
        State.switchPage('page-character');
      }
    } catch (err) {
      State.switchPage('page-character');
    }
  },

  _openTaPhoneFromChat(characterId) {
    const cid = String(characterId || '').trim();
    if (!cid) return;
    try {
      // 与 ta.js 保持一致：TaPages.STORAGE_KEY_TA_PHONE_CHARACTER = 'ta_phone_character_id_v1'
      Storage.set('ta_phone_character_id_v1', cid);
    } catch (e) {}
    try {
      State.taFeatureReturnPage = 'page-chat';
      State.taFeatureReturnSessionId = String(this.currentSessionId || '');
    } catch (e1) {}
    try {
      State.switchPage('page-ta-phone');
    } catch (e2) {}
  },

  _openTaExperienceFromChat(characterId) {
    const cid = String(characterId || '').trim();
    if (!cid) return;
    try {
      // 与 ta-experience.js 保持一致：TaExperience.STORAGE_KEY_CHARACTER = 'ta_experience_character_id_v1'
      Storage.set('ta_experience_character_id_v1', cid);
    } catch (e) {}
    try {
      State.taFeatureReturnPage = 'page-chat';
      State.taFeatureReturnSessionId = String(this.currentSessionId || '');
    } catch (e1) {}
    try {
      State.switchPage('page-ta-experience');
    } catch (e2) {}
  },

  _openTaDiaryFromChat(characterId) {
    const cid = String(characterId || '').trim();
    if (!cid) return;
    try {
      // 与 ta-diary.js 保持一致：TaDiary.STORAGE_KEY_CHARACTER = 'ta_diary_character_id_v1'
      Storage.set('ta_diary_character_id_v1', cid);
    } catch (e) {}
    try {
      State.taFeatureReturnPage = 'page-chat';
      State.taFeatureReturnSessionId = String(this.currentSessionId || '');
    } catch (e1) {}
    try {
      State.switchPage('page-ta-diary');
    } catch (e2) {}
  },

  _closeAvatarQuickActions() {
    const existing = document.getElementById('yd-chat-avatar-quick-actions');
    if (existing) {
      try { existing.remove(); } catch (e) {}
    }
    if (this._avatarQuickDismissHandler) {
      document.removeEventListener('pointerdown', this._avatarQuickDismissHandler, true);
      this._avatarQuickDismissHandler = null;
    }
    if (this._avatarQuickResizeHandler) {
      window.removeEventListener('resize', this._avatarQuickResizeHandler);
      window.removeEventListener('scroll', this._avatarQuickResizeHandler, true);
      this._avatarQuickResizeHandler = null;
    }
    if (this._avatarQuickEscHandler) {
      document.removeEventListener('keydown', this._avatarQuickEscHandler);
      this._avatarQuickEscHandler = null;
    }
  },

  // 点击角色头像：弹出小操作窗（角色详情 / 拍一拍 / 查手机 / 查日程 / 查日记）
  _showAvatarQuickActions(options = {}) {
    const anchorEl = options.anchorEl || null;
    const roleId = String(options.roleId || '').trim();
    const roleName = String(options.roleName || '').trim() || 'Ta';
    const clickX = Number.isFinite(options.clientX) ? Number(options.clientX) : NaN;
    const clickY = Number.isFinite(options.clientY) ? Number(options.clientY) : NaN;
    this._closeAvatarQuickActions();

    const overlay = document.createElement('div');
    overlay.id = 'yd-chat-avatar-quick-actions';
    overlay.className = 'yd-chat-avatar-actions';
    overlay.innerHTML = `
      <div class="yd-chat-avatar-actions__menu" role="menu" aria-label="角色操作">
        <button type="button" class="yd-chat-avatar-actions__item" data-act="detail" role="menuitem">角色详情</button>
        <button type="button" class="yd-chat-avatar-actions__item" data-act="ta-exp" role="menuitem">查日程</button>
        <button type="button" class="yd-chat-avatar-actions__item" data-act="pat" role="menuitem">拍一拍 ta</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const menu = overlay.querySelector('.yd-chat-avatar-actions__menu');
    if (!menu) return;

    const rect = anchorEl?.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    const baseX = Number.isFinite(clickX) && clickX > 0
      ? clickX
      : (rect ? (rect.left + (rect.width / 2)) : (window.innerWidth / 2));
    const baseY = Number.isFinite(clickY) && clickY > 0
      ? clickY
      : (rect ? rect.bottom : (window.innerHeight / 2));

    const menuRect = menu.getBoundingClientRect();
    const gap = 8;
    const vw = Math.max(0, window.innerWidth);
    const vh = Math.max(0, window.innerHeight);
    let left = baseX - (menuRect.width / 2);
    let top = baseY + gap;
    if (top + menuRect.height + gap > vh) {
      top = (rect ? rect.top : baseY) - menuRect.height - gap;
    }
    left = Math.max(gap, Math.min(vw - menuRect.width - gap, left));
    top = Math.max(gap, Math.min(vh - menuRect.height - gap, top));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const close = () => this._closeAvatarQuickActions();
    this._avatarQuickDismissHandler = (evt) => {
      if (!overlay.contains(evt.target)) close();
    };
    this._avatarQuickResizeHandler = () => close();
    this._avatarQuickEscHandler = (evt) => {
      if (evt.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', this._avatarQuickDismissHandler, true);
    window.addEventListener('resize', this._avatarQuickResizeHandler);
    window.addEventListener('scroll', this._avatarQuickResizeHandler, true);
    document.addEventListener('keydown', this._avatarQuickEscHandler);

    overlay.querySelector('[data-act="detail"]')?.addEventListener('click', async (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      close();
      await this._openRoleDetailFromChat(roleId);
    });
    overlay.querySelector('[data-act="pat"]')?.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      close();
      this._triggerAvatarPat(roleName);
    });
    overlay.querySelector('[data-act="ta-phone"]')?.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      close();
      this._openTaPhoneFromChat(roleId);
    });
    overlay.querySelector('[data-act="ta-exp"]')?.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      close();
      this._openTaExperienceFromChat(roleId);
    });
    overlay.querySelector('[data-act="ta-diary"]')?.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      close();
      this._openTaDiaryFromChat(roleId);
    });
  },

  // 点击用户头像：弹出小操作窗（我的面具）
  _showUserAvatarQuickActions(options = {}) {
    const anchorEl = options.anchorEl || null;
    const clickX = Number.isFinite(options.clientX) ? Number(options.clientX) : NaN;
    const clickY = Number.isFinite(options.clientY) ? Number(options.clientY) : NaN;
    this._closeAvatarQuickActions();

    const overlay = document.createElement('div');
    overlay.id = 'yd-chat-avatar-quick-actions';
    overlay.className = 'yd-chat-avatar-actions';
    overlay.innerHTML = `
      <div class="yd-chat-avatar-actions__menu" role="menu" aria-label="我的操作">
        <button type="button" class="yd-chat-avatar-actions__item" data-act="my-mask" role="menuitem">我的面具</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const menu = overlay.querySelector('.yd-chat-avatar-actions__menu');
    if (!menu) return;

    const rect = anchorEl?.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    const baseX = Number.isFinite(clickX) && clickX > 0
      ? clickX
      : (rect ? (rect.left + (rect.width / 2)) : (window.innerWidth / 2));
    const baseY = Number.isFinite(clickY) && clickY > 0
      ? clickY
      : (rect ? rect.bottom : (window.innerHeight / 2));

    const menuRect = menu.getBoundingClientRect();
    const gap = 8;
    const vw = Math.max(0, window.innerWidth);
    const vh = Math.max(0, window.innerHeight);
    let left = baseX - (menuRect.width / 2);
    let top = baseY + gap;
    if (top + menuRect.height + gap > vh) {
      top = (rect ? rect.top : baseY) - menuRect.height - gap;
    }
    left = Math.max(gap, Math.min(vw - menuRect.width - gap, left));
    top = Math.max(gap, Math.min(vh - menuRect.height - gap, top));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const close = () => this._closeAvatarQuickActions();
    this._avatarQuickDismissHandler = (evt) => {
      if (!overlay.contains(evt.target)) close();
    };
    this._avatarQuickResizeHandler = () => close();
    this._avatarQuickEscHandler = (evt) => {
      if (evt.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', this._avatarQuickDismissHandler, true);
    window.addEventListener('resize', this._avatarQuickResizeHandler);
    window.addEventListener('scroll', this._avatarQuickResizeHandler, true);
    document.addEventListener('keydown', this._avatarQuickEscHandler);

    overlay.querySelector('[data-act="my-mask"]')?.addEventListener('click', async (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      close();
      await this._openSessionMaskPicker();
    });
  },

  // 角色消息长按：触发引用（400ms）
  _attachMessageLongPress(targetEl, payload) {
    if (!targetEl) return;
    let timer = null;

    const start = () => {
      if (timer) return;
      console.log('[chat] longpress-start', payload);
      timer = window.setTimeout(() => {
        console.log('[chat] longpress-trigger', payload);
        Chat._setQuote(payload);
        timer = null;
      }, 400);
    };

    const clear = () => {
      if (timer) {
        console.log('[chat] longpress-cancel', payload);
        window.clearTimeout(timer);
        timer = null;
      }
    };

    // 触摸（手机）
    targetEl.addEventListener('touchstart', start);
    targetEl.addEventListener('touchend', clear);
    targetEl.addEventListener('touchmove', clear);
    targetEl.addEventListener('touchcancel', clear);

    // 鼠标（调试时用，不影响手机）
    targetEl.addEventListener('mousedown', (e) => {
      if (e.button === 0) start();
    });
    targetEl.addEventListener('mouseup', clear);
    targetEl.addEventListener('mouseleave', clear);
  },
  
  // 加载会话
  async loadSessions() {
    const sessions = await Storage.dbGetAll('sessions');
    try {
      console.log('[chat] loadSessions', {
        count: Array.isArray(sessions) ? sessions.length : -1,
        sample: Array.isArray(sessions) ? sessions.slice(0, 3).map(s => ({
          id: s?.id,
          title: s?.title,
          updatedAt: s?.updatedAt,
          createdAt: s?.createdAt
        })) : null
      });
    } catch (e) {}
    
    // 渲染会话列表（包含默认会话）
    this.renderChatList();
  },
  
  // 渲染聊天列表
  async renderChatList() {
    const sessions = await Storage.dbGetAll('sessions');
    const container = document.getElementById('chat-list-content');
    if (!container) return;
    container.innerHTML = '';

    try {
      console.log('[chat] renderChatList:start', {
        containerFound: !!container,
        sessionsCount: Array.isArray(sessions) ? sessions.length : -1
      });
    } catch (e) {}
    
    if (sessions.length === 0) {
      // 空状态
      container.innerHTML = `
        <div class="yd-empty">
          <div class="yd-empty__icon">💬</div>
          <div class="yd-empty__text">暂无会话，点击右上角新建</div>
        </div>
      `;
      await this._refreshChatHeaderUnreadBadge();
      return;
    }
    
    // 按更新时间排序（兼容旧数据：updatedAt 缺失时回退 createdAt）
    const getTs = (s) => {
      const u = Number(s && s.updatedAt);
      if (Number.isFinite(u) && u > 0) return u;
      const c = Number(s && s.createdAt);
      if (Number.isFinite(c) && c > 0) return c;
      return 0;
    };
    sessions.sort((a, b) => getTs(b) - getTs(a));

    const allMessages = await Storage.dbGetAll('messages');
    const characterMap = await this.getCharacterMap();
    
    for (const session of sessions) {
      try {
        const sessionMessages = allMessages
          .filter(msg => msg.sessionId === session.id)
          .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
        
        const rawUnread = Number(session?.unreadCount || 0);
        const unreadCount = Math.max(0, Number.isFinite(rawUnread) ? Math.floor(rawUnread) : 0);
        const hasMessages = sessionMessages.length > 0;
        const listShowUnread = unreadCount > 0 && hasMessages;
        const time = this.formatTime(session.updatedAt || session.createdAt || 0);

        const participantNames = Array.isArray(session.participantCharacterNames)
          ? session.participantCharacterNames.filter(Boolean)
          : [];
        const participantLabel = participantNames.length
          ? participantNames.join('、')
          : '默认AI';

        const isGroup = Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1;

        // 头像：单聊优先用角色头像，多聊默认用群成员宫格；若有自定义群头像则优先使用
        const participantIds = Array.isArray(session.participantCharacterIds)
          ? session.participantCharacterIds.filter(Boolean)
          : [];
        let avatarHtml = '💬';
        // 优先使用会话自定义头像
        const sessionAvatar = this._sanitizeAvatarSrc(session && typeof session.avatar === 'string' ? session.avatar : '');
        if (sessionAvatar) {
          avatarHtml = `<img class="yd-chat-avatar-img" alt="${this.escapeHtml(session.title || participantLabel || '会话头像')}" src="${this.escapeHtml(sessionAvatar)}">`;
        } else if (participantIds.length === 1) {
          const c = characterMap.get(String(participantIds[0]));
          if (c && c.avatar) {
            avatarHtml = `<img class="yd-chat-avatar-img" alt="${this.escapeHtml(c.name || '角色头像')}" src="${this.escapeHtml(c.avatar)}">`;
          } else {
            avatarHtml = '👤';
          }
        } else if (participantIds.length > 1) {
          // 宫格群头像：第 1 格为「我」（面具），其余为角色，最多 4 格
          const cells = await this._buildGroupChatListGridCells(session, characterMap);
          const cellHtml = cells.map((cell, idx) => {
            const src = cell.avatar ? this.escapeHtml(cell.avatar) : '';
            const name = String(cell.name || '').trim() || '成员';
            const fallback = this._getInitialLetter(name, '群');
            const content = src
              ? `<img src="${src}" alt="${this.escapeHtml(name)}">`
              : `<span>${this.escapeHtml(fallback)}</span>`;
            return `<div class="yd-chat-avatar-grid__cell yd-chat-avatar-grid__cell--${cells.length}-${idx}">${content}</div>`;
          }).join('');
          avatarHtml = `
            <div class="yd-chat-avatar-grid yd-chat-avatar-grid--${cells.length}">
              ${cellHtml}
            </div>
          `;
        }
        
        const item = document.createElement('div');
        item.className = 'yd-list-item yd-chat-list-item';
        item.dataset.sessionId = session.id;
        
        const unreadText = listShowUnread ? (unreadCount > 99 ? '99+' : String(unreadCount)) : '';
        if (unreadCount > 0 && !hasMessages) {
          try {
            const sFix = await Storage.dbGet('sessions', session.id);
            if (sFix && Number(sFix.unreadCount || 0) > 0) {
              sFix.unreadCount = 0;
              await Storage.dbPut('sessions', sFix);
            }
          } catch (e) {}
        }
        // 未读为 0 时不要生成徽标节点：否则 min-width 会形成空红圈，且自定义 CSS 的 display:!important 可能压过 [hidden]
        const listUnreadBadgeHtml = listShowUnread
          ? `<span class="yd-chat-back-unread-badge yd-chat-list-unread-badge" aria-label="未读条数">${this.escapeHtml(unreadText)}</span>`
          : '';
        item.innerHTML = `
          <div class="yd-list-item__avatar">
            ${avatarHtml}
            ${listUnreadBadgeHtml}
          </div>
          <div class="yd-list-item__content">
            <div class="yd-list-item__header">
              <div class="yd-list-item__title">${this.escapeHtml(session.title || (isGroup ? `${participantLabel}的群聊` : participantLabel))}</div>
              <div class="yd-list-item__time">${time}</div>
            </div>
            <div class="yd-chat-list-participants">${this.escapeHtml(participantLabel)}</div>
          </div>
        `;
        
        // 点击进入会话
        item.addEventListener('click', () => {
          this.openSession(session.id);
        });
        
        container.appendChild(item);
      } catch (err) {
        console.error('[chat] renderChatList:sessionError', {
          sessionId: session?.id,
          updatedAt: session?.updatedAt,
          createdAt: session?.createdAt,
          title: session?.title
        }, err);
      }
    }

    try {
      console.log('[chat] renderChatList:done', { children: container.children.length });
    } catch (e) {}
    await this._refreshChatHeaderUnreadBadge();
  },

  _formatChatListPreview(sessionMessages) {
    const msgs = Array.isArray(sessionMessages) ? sessionMessages : [];
    if (!msgs.length) return '暂无消息';

    const isHtmlBlock = (content) => /```html[\s\S]*?```/i.test(String(content || ''));
    const isCardLikeProtocol = (content) => {
      const s = String(content || '').trim();
      // 会话列表预览：跳过“卡片类/资料类”协议（它们在聊天里是独立卡片块，作为预览信息价值低）
      // 注意：保留 [消息]/[对白]/[对话] 这类纯文本协议用于预览
      return /^\[(?:建议回复|图片|表情包|语音|转账|红包|邀请|分享|css美化)(?:\|[^\]]+)?\]/.test(s);
    };
    const normalizeOneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const clamp = (s, n = 46) => {
      const t = normalizeOneLine(s);
      if (!t) return '';
      return t.length > n ? t.slice(0, n) + '…' : t;
    };

    // 1) 优先使用“最后一条可展示的消息”作为预览来源（跳过 HTML / 建议回复）
    let candidate = msgs.find(m => m && !isHtmlBlock(m.content) && !isCardLikeProtocol(m.content));

    // 2) 如果最新的是 HTML：回显 HTML 的上一句（同一条消息里 html 前的文本；否则回退到上一条非 html）
    if (!candidate) {
      const last = msgs[0];
      const raw = String(last?.content || '');
      const m = raw.match(/([\s\S]*?)```html/i);
      const before = m ? String(m[1] || '') : '';
      const lines = before.split('\n').map(x => String(x || '').trim()).filter(Boolean);
      const prevLine = lines.length ? lines[lines.length - 1] : '';
      if (prevLine) return clamp(prevLine);
      // 回退到列表里下一条可展示（非 HTML / 非建议回复）
      const fallback = msgs.slice(1).find(x => x && !isHtmlBlock(x.content) && !isCardLikeProtocol(x.content));
      if (fallback) candidate = fallback;
    }

    const raw = String(candidate?.content || '').trim();
    if (!raw) return '暂无消息';

    // 聊天列表预览：对少数类型做友好化，其它类型一律保持原样
    const firstLine = raw.split('\n').map(l => String(l || '').trim()).find(Boolean) || raw;

    // 仅处理 [消息]/[对白]/[对话]：去掉协议标签（含群聊）
    const msgMatch = firstLine.match(/^\[(?:消息|对白|对话)(?:\|[^\]]+)?\](.+)$/);
    if (msgMatch) {
      const body = String(msgMatch[1] || '');
      const biIdx = body.indexOf('||');
      if (biIdx >= 0) {
        const foreign = body.slice(biIdx + 2).trim();
        if (foreign) return clamp(foreign);
      }
      return clamp(body);
    }

    // [分享]：显示为“分享订单：xxx”
    const shareMatch = firstLine.match(/^\[分享(?:\|[^\]]+)?\](.+)$/);
    if (shareMatch) {
      // 新分享消息体：应用|资源|动作|主键|标题|金额|状态|时间|地址|...
      const inner = String(shareMatch[1] || '');
      const parts = inner.split('|');
      const app = String(parts[0] || '');
      const title = String(parts[4] || '');
      const label = app || '分享';
      return clamp(`[分享]${label}：${title || '内容'}`);
    }

    // [转账] 以及其它所有类型：原样回显
    return clamp(firstLine);
  },
  
  async showNewSessionPicker() {
    const existing = document.getElementById('yd-chat-session-picker');
    if (existing) existing.remove();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };

    const close = () => {
      const pickerEl = document.getElementById('yd-chat-session-picker');
      if (pickerEl) pickerEl.remove();
      window.removeEventListener('keydown', onKeyDown);
    };

    // 先拉取角色数据，再创建并展示弹窗，避免“先闪一下空弹窗再填充内容”
    let characters = [];
    try {
      const charactersRaw = await Storage.dbGetAll('characters');
      characters = (charactersRaw || [])
        .map(c => this.normalizeCharacter(c))
        .filter(c => c && c.id && c.name);
      characters.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (e) {
      characters = [];
    }

    const modal = document.createElement('div');
    modal.id = 'yd-chat-session-picker';
    modal.className = 'yd-modal yd-modal--active';
    modal.innerHTML = `
      <div class="yd-modal-content yd-chat-picker" role="dialog" aria-modal="true">
        <div class="yd-chat-picker__header">
          <div class="yd-chat-picker__title">新建会话</div>
          <button class="yd-header-btn yd-chat-picker__close" type="button" aria-label="关闭">×</button>
        </div>

        <div class="yd-chat-picker__top-row">
          <div class="yd-chat-picker__top-left">
            <div class="yd-beautify-page-tabs yd-album-tabs yd-chat-picker__mode-tabs" role="tablist" aria-label="聊天模式">
              <button type="button" class="yd-beautify-tab yd-beautify-tab--active" data-mode="single">单聊</button>
              <button type="button" class="yd-beautify-tab" data-mode="multi">群聊</button>
            </div>
        </div>

          <div class="yd-chat-picker__top-right">
            <button type="button" class="yd-chat-picker__add-role-btn" id="yd-chat-picker-add-role">
              <span class="yd-chat-picker__add-role-plus" aria-hidden="true">+</span>新增角色
            </button>
          </div>
        </div>

        <div class="yd-chat-picker__hint">选择要一起聊天的角色</div>
        <div class="yd-chat-picker__list" id="yd-chat-picker-list"></div>

        <div class="yd-chat-picker__footer" id="yd-chat-picker-footer"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.yd-chat-picker__close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    window.addEventListener('keydown', onKeyDown);

    let mode = 'single';
    let selected = new Set();

    const listEl = modal.querySelector('#yd-chat-picker-list');
    const footerEl = modal.querySelector('#yd-chat-picker-footer');
    const segBtns = modal.querySelectorAll('.yd-beautify-tab[data-mode]');

    const addRoleBtn = modal.querySelector('#yd-chat-picker-add-role');
    addRoleBtn?.addEventListener('click', () => {
      close();
      try {
        if (typeof Character !== 'undefined' && Character) {
          if (typeof Character.resetEditForm === 'function') Character.resetEditForm();
          if (typeof Character.showCreateForm === 'function') Character.showCreateForm(null);
        }
      } catch (e) {}
      State.switchPage('page-character-edit');
    });

    const setMode = (nextMode) => {
      mode = nextMode;
      selected = new Set();
      segBtns.forEach(btn => {
        const btnMode = btn.getAttribute('data-mode') || 'single';
        const isActive = btnMode === mode;
        btn.classList.toggle('yd-beautify-tab--active', isActive);
      });
      render();
    };

    const renderEmpty = () => {
      if (!listEl || !footerEl) return;
      listEl.innerHTML = `
        <div class="yd-empty">
          <div class="yd-empty__icon">👤</div>
          <div class="yd-empty__text">暂无角色，可先去“角色”页面创建</div>
        </div>
      `;
      footerEl.innerHTML = '';
    };

    const render = () => {
      if (!listEl || !footerEl) return;
      listEl.innerHTML = '';
      footerEl.innerHTML = '';

      if (!characters.length) {
        renderEmpty();
        return;
      }

      // 角色列表
      characters.forEach(char => {
        const item = document.createElement('div');
        item.className = 'yd-list-item yd-chat-picker-item';

        const avatarHtml = char.avatar
          ? `<img class="yd-chat-avatar-img" alt="${this.escapeHtml(char.name)}" src="${this.escapeHtml(char.avatar)}">`
          : '👤';

        item.innerHTML = `
          <div class="yd-list-item__avatar">${avatarHtml}</div>
          <div class="yd-list-item__content">
            <div class="yd-list-item__header">
              <div class="yd-list-item__title">${this.escapeHtml(char.name)}</div>
            </div>
            <div class="yd-list-item__subtitle">${this.escapeHtml(char.description || '暂无描述')}</div>
          </div>
          ${mode === 'multi' ? `<div class="yd-chat-picker__check"><input type="checkbox" data-id="${this.escapeHtml(char.id)}" aria-label="选择 ${this.escapeHtml(char.name)}"></div>` : ''}
        `;

        item.addEventListener('click', async (e) => {
          const target = e.target;
          if (mode === 'single') {
            close();
            const session = await this.createSessionWithCharacters([char.id]);
            this.openSession(session.id);
            return;
          }
          if (target && target.tagName === 'INPUT') return;
          const cb = item.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = !cb.checked;
          if (cb && cb.checked) selected.add(char.id);
          if (cb && !cb.checked) selected.delete(char.id);
        });

        if (mode === 'multi') {
          const cb = item.querySelector('input[type="checkbox"]');
          cb?.addEventListener('change', () => {
            if (cb.checked) selected.add(char.id);
            else selected.delete(char.id);
          });
        }

        listEl.appendChild(item);
      });

      // footer actions
      if (mode === 'multi') {
        footerEl.innerHTML = `
          <div class="yd-chat-picker__footer-actions">
            <button class="yd-btn" type="button" id="yd-chat-picker-create">开始聊天</button>
          </div>
        `;
        footerEl.querySelector('#yd-chat-picker-create')?.addEventListener('click', async () => {
          const ids = Array.from(selected);
          if (ids.length < 2) {
            alert('群聊请至少选择 2 个角色（或切换到“单聊”）');
            return;
          }
          close();
          const session = await this.createSessionWithCharacters(ids);
          this.openSession(session.id);
        });
      } else {
        footerEl.innerHTML = '';
      }
    };

    segBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setMode(btn.getAttribute('data-mode') || 'single');
      });
    });

    render();
  },

  normalizeCharacter(raw) {
    const base = (raw && typeof raw === 'object') ? raw : {};
    const inner = (base.data && typeof base.data === 'object') ? base.data : {};
    const avatarRaw = inner.avatar ?? base.avatar ?? null;
    const avatar = (() => {
      const v = String(avatarRaw ?? '').trim();
      if (!v) return null;
      const low = v.toLowerCase();
      if (low === 'none' || low === 'null' || low === 'undefined') return null;
      return v;
    })();
    const roleVoice = inner.role_voice && typeof inner.role_voice === 'object'
      ? inner.role_voice
      : (base.role_voice && typeof base.role_voice === 'object' ? base.role_voice : null);
    const chatI18nRaw = inner.chat_i18n ?? base.chat_i18n ?? null;
    const chatI18n = chatI18nRaw && typeof chatI18nRaw === 'object' ? chatI18nRaw : {};
    const defaultLanguage = String(chatI18n.default_language || chatI18n.defaultLanguage || 'zh').trim().toLowerCase() || 'zh';
    const regionLabel = String(chatI18n.region_label || chatI18n.regionLabel || '').trim();
    const regionTzMap = (typeof ChatMessageBuilder !== 'undefined' && ChatMessageBuilder.REGION_DEFAULT_TZ)
      ? ChatMessageBuilder.REGION_DEFAULT_TZ
      : { 中国: 'Asia/Shanghai', 日本: 'Asia/Tokyo' };
    const langTzMap = (typeof ChatMessageBuilder !== 'undefined' && ChatMessageBuilder.LANG_DEFAULT_TIMEZONE)
      ? ChatMessageBuilder.LANG_DEFAULT_TIMEZONE
      : { zh: 'Asia/Shanghai', ja: 'Asia/Tokyo' };
    let timezone = String(chatI18n.timezone || chatI18n.time_zone || '').trim();
    if (!timezone && regionLabel && regionTzMap[regionLabel]) timezone = regionTzMap[regionLabel];
    if (!timezone && langTzMap[defaultLanguage]) timezone = langTzMap[defaultLanguage];
    if (!timezone) timezone = 'Asia/Shanghai';
    const isChinaRegion = regionLabel === '中国' || (!regionLabel && timezone === 'Asia/Shanghai');
    const multilingualEnabled =
      defaultLanguage !== 'zh' &&
      defaultLanguage !== 'zh-cn' &&
      defaultLanguage !== 'chinese' &&
      !isChinaRegion &&
      (chatI18n.enabled === true || String(chatI18n.enabled || '') === '1' || chatI18n.enabled === 1);
    return {
      id: base.id ?? inner.id ?? null,
      name: inner.name ?? base.name ?? '',
      description: inner.description ?? base.description ?? '',
      first_mes: inner.first_mes ?? base.first_mes ?? '',
      alternate_greetings: inner.alternate_greetings ?? base.alternate_greetings ?? [],
      avatar,
      role_voice: roleVoice,
      extensions: inner.extensions ?? base.extensions ?? null,
      character_book: inner.character_book ?? base.character_book ?? null,
      createdAt: base.createdAt ?? inner.createdAt ?? 0,
      defaultLanguage,
      multilingualEnabled,
      timezone,
      regionLabel
    };
  },

  _sanitizeAvatarSrc(src) {
    const v = String(src ?? '').trim();
    if (!v) return '';
    const low = v.toLowerCase();
    if (low === 'none' || low === 'null' || low === 'undefined') return '';
    return v;
  },

  invalidateCharacterCache() {
    this._characterCache = null;
    this._characterCacheAt = 0;
  },

  async getCharacterMap(force = false) {
    const now = Date.now();
    if (!force && this._characterCache && (now - this._characterCacheAt) < 15000) {
      return this._characterCache;
    }
    const charactersRaw = await Storage.dbGetAll('characters');
    const map = new Map();
    charactersRaw.forEach(c => {
      const norm = this.normalizeCharacter(c);
      if (norm && norm.id) map.set(String(norm.id), norm);
    });
    this._characterCache = map;
    this._characterCacheAt = now;
    return map;
  },

  async _ensureSessionParticipantIds(session) {
    const s = session && typeof session === 'object' ? session : null;
    if (!s || !s.id) return s;
    const curIds = Array.isArray(s.participantCharacterIds) ? s.participantCharacterIds.map(x => String(x || '').trim()).filter(Boolean) : [];
    if (curIds.length) return s;

    // 单聊旧结构兜底：characterId
    const legacy = String(s.characterId || '').trim();
    if (legacy) {
      s.participantCharacterIds = [legacy];
      if (!Array.isArray(s.participantCharacterNames) || !s.participantCharacterNames.length) {
        try {
          const cmap = await this.getCharacterMap(true);
          const c = cmap.get(legacy);
          if (c && c.name) s.participantCharacterNames = [String(c.name)];
        } catch (e) {}
      }
      s.updatedAt = Date.now();
      try { await Storage.dbPut('sessions', s); } catch (e2) {}
      return s;
    }

    // 群聊/单聊：若存在 participantCharacterNames，按角色表名字反查
    const names = Array.isArray(s.participantCharacterNames)
      ? s.participantCharacterNames.map(x => String(x || '').trim()).filter(Boolean)
      : [];
    if (!names.length) return s;
    let cmap;
    try { cmap = await this.getCharacterMap(true); } catch (e3) { cmap = null; }
    if (!cmap || !cmap.values) return s;
    const byName = new Map();
    try {
      for (const c of cmap.values()) {
        const n = String(c?.name || '').trim();
        if (!n) continue;
        if (!byName.has(n)) byName.set(n, []);
        byName.get(n).push(String(c.id));
      }
    } catch (e4) {}
    const resolved = [];
    names.forEach((n) => {
      const hits = byName.get(n);
      if (!hits || !hits.length) return;
      // 同名取第一个（若你们后续要做同名消歧，再增强这里）
      resolved.push(hits[0]);
    });
    const uniq = Array.from(new Set(resolved.map(x => String(x || '').trim()).filter(Boolean)));
    if (!uniq.length) return s;
    s.participantCharacterIds = uniq;
    s.updatedAt = Date.now();
    try { await Storage.dbPut('sessions', s); } catch (e5) {}
    return s;
  },

  async createSessionWithCharacters(characterIds) {
    const ids = Array.isArray(characterIds) ? characterIds.filter(Boolean) : [];
    const characterMap = await this.getCharacterMap(true);
    const characters = ids.map((id) => characterMap.get(String(id))).filter(Boolean);
    const names = characters.map(c => c.name).filter(Boolean);

    // 单聊去重：同一角色只能有一个单聊会话（群聊不限制）
    if (ids.length === 1 && ids[0]) {
      const existing = await this.findExistingSingleSessionByCharacterId(ids[0]);
      if (existing) {
        // 若是旧结构会话，尽量补齐 participantCharacterIds 以便后续统一逻辑
        if (!Array.isArray(existing.participantCharacterIds) || existing.participantCharacterIds.length !== 1) {
          existing.participantCharacterIds = [ids[0]];
          existing.participantCharacterNames = names;
          if (!existing.title && names.length) existing.title = names[0];
          await Storage.dbPut('sessions', existing);
        }
        await this.renderChatList();
        return existing;
      }
    }

    const now = Date.now();
    const session = {
      id: State.generateId(),
      title: names.length ? (names.length === 1 ? names[0] : `${names.join('、')}（群聊）`) : '新会话',
      createdAt: now,
      updatedAt: now,
      // 0 = 线上（默认），1 = 线下
      mode: 0,
      // 当前模式段落的进入边界：上一模式的对话在此之前
      modeEntryBoundaryMessageId: null,
      modeEntryBoundaryCreatedAt: null,
      // 记忆摘要文本（规则/抽取生成）：供下次进入该模式时作为 system 资料
      onlineMemoryText: null,
      offlineMemoryText: null,
      participantCharacterIds: ids,
      participantCharacterNames: names
    };

    await Storage.dbAdd('sessions', session);

    // 角色卡开场白（first_mes）暂不自动写入聊天消息：
    // 用户要求“角色卡里的开场白先不出现在聊天框”。

    await this.renderChatList();
    return session;
  },

  async findExistingSingleSessionByCharacterId(characterId) {
    const id = String(characterId || '').trim();
    if (!id) return null;
    const sessions = await Storage.dbGetAll('sessions');

    // 新结构：participantCharacterIds = [id]
    const hit = sessions.find(s => {
      const ids = Array.isArray(s?.participantCharacterIds) ? s.participantCharacterIds.filter(Boolean) : [];
      return ids.length === 1 && ids[0] === id;
    });
    if (hit) return hit;

    // 旧结构：characterId 字段（来自旧的 startChatWithCharacter）
    const legacy = sessions.find(s => String(s?.characterId || '').trim() === id);
    return legacy || null;
  },

  async autoClearMockSessions() {
    // “模拟数据”指：旧结构/测试遗留会话（例如只有 characterId，没有 participantCharacterIds）
    const sessions = await Storage.dbGetAll('sessions');
    const mockSessions = sessions.filter(s => {
      const hasNew = Array.isArray(s?.participantCharacterIds) && s.participantCharacterIds.filter(Boolean).length > 0;
      const hasLegacy = !!String(s?.characterId || '').trim();
      // 旧结构会话：没有 participantCharacterIds 但有 characterId
      return !hasNew && hasLegacy;
    });

    if (!mockSessions.length) return;

    const allMessages = await Storage.dbGetAll('messages');
    const mockIds = new Set(mockSessions.map(s => s.id));
    for (const msg of allMessages) {
      if (msg && mockIds.has(msg.sessionId)) {
        await Storage.dbDelete('messages', msg.id);
      }
    }
    for (const s of mockSessions) {
      await Storage.dbDelete('sessions', s.id);
    }

    await this.renderChatList();
    // 如果当前正处在被删除的会话里，回到列表
    if (this.currentSessionId && mockIds.has(this.currentSessionId)) {
      this.currentSessionId = null;
      this.currentSession = null;
      Storage.remove(CONFIG.STORAGE_KEYS.CURRENT_SESSION);
      State.switchPage('page-chat-list');
    }
    this._toast(`已清除 ${mockSessions.length} 个模拟会话`);
  },
  
  // 打开会话
  async openSession(sessionId) {
    this._moneyActionsMem = null;
    // 进入新会话前，作废上一个会话尚未完成的“滚到底”延迟任务，避免跨会话污染
    this._scrollBottomRunId += 1;
    try {
      (this._scrollBottomTimers || []).forEach(t => window.clearTimeout(t));
    } catch (e) {}
    this._scrollBottomTimers = [];
    // 切会话时清理领取流程的一次性补偿，避免历史页面出现过大空白
    this._actionBottomPadBoostUntil = 0;
    const prevSid = String(this.currentSessionId || '').trim();
    const nextSid = String(sessionId || '').trim();
    if (prevSid && nextSid && prevSid !== nextSid) {
      if (typeof ProactiveScheduler !== 'undefined' && ProactiveScheduler.onLeaveSession) {
        ProactiveScheduler.onLeaveSession(prevSid);
      }
    }
    if (prevSid !== nextSid) {
      try {
        this._plainStreamDoneKeys.clear();
        this._plainStreamPendingMsgIds.clear();
        this._plainStreamRevealQueue = null;
        this._plainStreamPumpRunning = false;
      } catch (e) {}
    }
    // 进入/重进会话一律退出批量删除，避免返回列表后再进来仍停留在待选状态
    this._exitBulkDeleteMode();
    this.currentSessionId = sessionId;
    // 每次进入会话全量重绘，避免双语气泡展开态残留在 DOM 上
    this._forceFullRenderNext = true;
    Storage.set(CONFIG.STORAGE_KEYS.CURRENT_SESSION, sessionId);
    this.currentSession = await Storage.dbGet('sessions', sessionId);
    await this._clearSessionUnread(sessionId);
    try {
      if (this.currentSession) {
        this.currentSession = await this._ensureSessionParticipantIds(this.currentSession);
      }
    } catch (e0) {}
    await ProactiveScheduler._reconcileLocalDueTasks();
    this._updateTypingDisplay();
    await this.loadMessages();
    this._applyModeUI(this.currentSession?.mode);
    // 聊天背景为“会话级设置”，进入会话时应用对应背景
    await this.loadChatBackground();
    this._updateChatBottomPadding();
    if (this._debugScroll) {
      try {
        const el0 = document.getElementById('chat-scroll');
        console.log('[chat][scroll] openSession before switchPage', {
          sessionId: this.currentSessionId,
          page: State.currentPage,
          hasEl: !!el0,
          top: el0 ? el0.scrollTop : null,
          h: el0 ? el0.scrollHeight : null,
          ch: el0 ? el0.clientHeight : null
        });
      } catch (e) {}
    }
    State.switchPage('page-chat');
    try {
      if (
        typeof ReplyStyle !== 'undefined' &&
        ReplyStyle &&
        typeof ReplyStyle.hasUserSelection === 'function' &&
        typeof ReplyStyle.openChatModal === 'function' &&
        !ReplyStyle.hasUserSelection()
      ) {
        ReplyStyle.openChatModal({ forceSelect: true });
      }
    } catch (e) {}
    this._updateChatBottomPadding();
    if (this._debugScroll) {
      try {
        const el1 = document.getElementById('chat-scroll');
        console.log('[chat][scroll] openSession after switchPage', {
          sessionId: this.currentSessionId,
          page: State.currentPage,
          hasEl: !!el1,
          top: el1 ? el1.scrollTop : null,
          h: el1 ? el1.scrollHeight : null,
          ch: el1 ? el1.clientHeight : null
        });
      } catch (e) {}
    }
    this._scrollChatToBottom();
    await this._refreshChatHeaderUnreadBadge();
    this._attachLoadMoreScrollWatcher();
    if (typeof ProactiveScheduler !== 'undefined' && ProactiveScheduler.onEnterSession) {
      ProactiveScheduler.onEnterSession(sessionId);
    }
  },

  _attachLoadMoreScrollWatcher() {
    try {
      const container = this._getChatScrollContainer();
      if (!container) return;
      if (this._loadMoreScrollHandler) {
        container.removeEventListener('scroll', this._loadMoreScrollHandler);
      }
      this._loadMoreScrollHandler = () => {
        this._updateLoadMoreButtonVisibility();
        // 用户手动上滑时，取消尚未执行的“延迟滚到底”任务，避免阅读历史消息被突然拉回底部。
        const nearBottom = this._isNearBottom(container, this._getChatNearBottomThresholdPx());
        if (!nearBottom) {
          this._suspendAutoScrollUntil = Date.now() + 1500;
          this._scrollBottomRunId += 1;
          try {
            (this._scrollBottomTimers || []).forEach(t => window.clearTimeout(t));
          } catch (e) {}
          this._scrollBottomTimers = [];
        }
      };
      container.addEventListener('scroll', this._loadMoreScrollHandler, { passive: true });
      this._updateLoadMoreButtonVisibility();
    } catch (e) {}
  },

  _updateLoadMoreButtonVisibility() {
    try {
      const btn = document.getElementById('yd-chat-load-more');
      if (!btn) return;
      // 没有更多历史时：按钮不应继续占位
      if (!this._hasMoreHistory) {
        btn.remove();
        return;
      }
      const container = this._getChatScrollContainer();
      const atTop = !container ? true : (container.scrollTop <= 2);
      btn.hidden = !(this._hasMoreHistory && atTop);
    } catch (e) {}
  },

  async loadMoreMessages() {
    if (!this._sessionAllMessages || !this._hasMoreHistory) return;
    const anchor = this._captureScrollAnchor();

    const step = Math.max(1, parseInt(this._pageSize, 10) || 30);
    const nextStart = Math.max(0, this._sessionPageStart - step);
    if (nextStart === this._sessionPageStart) {
      this._hasMoreHistory = false;
      this._updateLoadMoreButtonVisibility();
      return;
    }
    this._sessionPageStart = nextStart;
    this._hasMoreHistory = this._sessionPageStart > 0;
    this.messages = this._sessionAllMessages.slice(this._sessionPageStart);

    try {
      const session = this.currentSession || await Storage.dbGet('sessions', this.currentSessionId);
      const currentMode = session && session.mode != null
        ? (Number(session.mode) === 1 ? 1 : 0)
        : this._getCurrentSessionMode();
      const packed = await this._buildDynamicPackedHistoryForApi({
        session,
        currentMode,
        pendingSet: new Set()
      });
      this.messages = this._composeDisplayMessagesWithDynamicMemoryCards(
        this.messages,
        packed,
        currentMode
      );
    } catch (ePack) {}

    // 强制全量渲染（prepend 场景）。否则 renderMessages 可能走“增量 append”，导致重复/错位。
    this._forceFullRenderNext = true;
    await this.renderMessages();

    // 保持视口不跳：使用锚点对齐（比 scrollHeight 差值更稳定，避免 spacer/图片异步造成偏移）
    this._restoreScrollAnchor(anchor);
    this._updateLoadMoreButtonVisibility();
  },

  _updateChatBottomPadding() {
    try {
      const page = document.getElementById('page-chat');
      if (!page) return;
      const footer = page.querySelector('.yd-page-footer.yd-chat-input-wrapper');
      if (!footer) return;
      const rectH = Math.max(0, Number(footer.getBoundingClientRect().height || 0));
      const offsetH = Math.max(0, Number(footer.offsetHeight || 0));
      const scrollH = Math.max(0, Number(footer.scrollHeight || 0));
      // 某些重排时机 getBoundingClientRect 可能短暂偏小，取三者最大值更稳。
      const h = Math.round(Math.max(rectH, offsetH, scrollH));
      // 用户确认统一底部留白为固定值：避免不同会话出现 194/138 的不一致视觉。
      const basePad = 128;
      const boostPad = 0;
      const pad = 128;
      // padding-bottom 只保底，不再承担主要留白（主要由 spacer 控制）
      page.style.setProperty('--yd-chat-bottom-pad', `0px`);
      const spacer = document.getElementById('yd-chat-bottom-spacer');
      if (spacer) {
        spacer.style.height = `${pad}px`;
      } else {
      }
      if (this._debugScroll) {
        console.log('[chat][scroll] bottom pad set', { footerH: h, basePad, boostPad, pad });
      }
    } catch (e) {}
  },

  _scrollChatToBottom() {
    const page = document.getElementById('page-chat');
    if (!page || !page.classList.contains('yd-page--active')) return;
    const inner = document.getElementById('chat-scroll');
    const runId = ++this._scrollBottomRunId;
    const runSessionId = String(this.currentSessionId || '');
    try {
      (this._scrollBottomTimers || []).forEach(t => window.clearTimeout(t));
    } catch (e) {}
    this._scrollBottomTimers = [];
    const container = (() => {
      // 真正可滚动的容器通常是 page-chat 的内容区（.yd-page-content.yd-chat-messages）
      const page = document.getElementById('page-chat');
      const content = page ? page.querySelector('.yd-page-content.yd-chat-messages') : null;
      if (content) return content;
      // 回退：向上找第一个可滚动祖先
      let p = inner ? inner.parentElement : null;
      while (p && p !== document.body) {
        try {
          const cs = window.getComputedStyle(p);
          const oy = cs.overflowY;
          const canScroll = (oy === 'auto' || oy === 'scroll') && (p.scrollHeight > p.clientHeight + 2);
          if (canScroll) return p;
        } catch (e) {}
        p = p.parentElement;
      }
      // 最后兜底：window 滚动
      return null;
    })();

    if (!inner) {
      if (this._debugScroll) {
        try { console.log('[chat][scroll] no #chat-scroll element'); } catch (e) {}
      }
      return;
    }
    const stamp = Date.now();
    const jump = (tag) => {
      try {
        // 会话切换后旧的延迟滚动任务立即失效，避免 A 会话补偿污染到 B 会话
        if (runId !== this._scrollBottomRunId) return;
        if (String(this.currentSessionId || '') !== runSessionId) return;
        // 用户刚刚手动上滑阅读历史时，短时间内禁止自动滚到底。
        if (Date.now() < Number(this._suspendAutoScrollUntil || 0)) return;
        this._updateChatBottomPadding();
        const target = container;
        const before = target
          ? { top: target.scrollTop, h: target.scrollHeight, ch: target.clientHeight }
          : { top: window.scrollY, h: document.documentElement.scrollHeight, ch: window.innerHeight };

        if (target) {
          target.scrollTop = target.scrollHeight;
        } else {
          window.scrollTo(0, document.documentElement.scrollHeight);
        }

        // 用 scrollIntoView 再兜底一次（让浏览器选择正确的滚动容器）
        inner.lastElementChild?.scrollIntoView({ block: 'end' });
        // “滚到底”后再做一次输入框避让，确保最后一条不会被底部输入栏覆盖
        this._ensureLastMessageVisibleAboveInput();

        const after = target
          ? { top: target.scrollTop, h: target.scrollHeight, ch: target.clientHeight }
          : { top: window.scrollY, h: document.documentElement.scrollHeight, ch: window.innerHeight };
        if (this._debugScroll) {
          console.log('[chat][scroll] jump', {
            tag,
            stamp,
            before,
            after,
            atBottom: Math.abs((after.h - after.ch) - after.top) < 3
          });
        }
      } catch (e) {}
    };
    // 进入会话时：确保布局/图片渲染完成后仍能落在底部
    jump('sync'); // 立即一次（同步）
    window.requestAnimationFrame(() => jump('raf')); // 下一帧（DOM 已布局）
    // 再补两次：覆盖常见异步重排（字体加载/图片尺寸回填）
    this._scrollBottomTimers.push(window.setTimeout(() => jump('t+240'), 240));
    this._scrollBottomTimers.push(window.setTimeout(() => jump('t+800'), 800));

    // 额外探针：看看是否被后续渲染重置回顶部
    if (this._debugScroll) {
      this._scrollBottomTimers.push(window.setTimeout(() => {
        try {
          if (runId !== this._scrollBottomRunId) return;
          if (String(this.currentSessionId || '') !== runSessionId) return;
          const target = container;
          console.log('[chat][scroll] probe t+1200', {
            stamp,
            container: target ? (target.id || target.className || 'element') : 'window',
            top: target ? target.scrollTop : window.scrollY,
            h: target ? target.scrollHeight : document.documentElement.scrollHeight,
            ch: target ? target.clientHeight : window.innerHeight
          });
        } catch (e) {}
      }, 1200));
    }
  },

  _getChatScrollContainer() {
    try {
      const page = document.getElementById('page-chat');
      const content = page ? page.querySelector('.yd-page-content.yd-chat-messages') : null;
      return content || null;
    } catch (e) {
      return null;
    }
  },

  _isNearBottom(container, thresholdPx = 24) {
    try {
      if (!container) return false;
      const remaining = (container.scrollHeight - container.clientHeight) - container.scrollTop;
      return remaining <= Math.max(0, thresholdPx);
    } catch (e) {
      return false;
    }
  },

  _getChatNearBottomThresholdPx() {
    try {
      const page = document.getElementById('page-chat');
      if (!page) return 48;
      const footer = page.querySelector('.yd-page-footer.yd-chat-input-wrapper');
      const h = Math.max(0, Math.round(footer?.getBoundingClientRect().height || 0));
      // 输入栏高度会影响“遮挡”阈值；给滚到底留一点余量让体验更稳。
      return Math.max(48, h + 10);
    } catch (e) {
      return 48;
    }
  },

  _captureScrollAnchor() {
    try {
      const container = this._getChatScrollContainer();
      if (!container) return null;
      const containerRect = container.getBoundingClientRect();
      const root = document.getElementById('chat-scroll');
      if (!root) return null;
      const items = Array.from(root.querySelectorAll('[data-msg-id]'));
      for (const el of items) {
        const r = el.getBoundingClientRect();
        if (r.bottom > containerRect.top + 6) {
          const id = el.getAttribute('data-msg-id') || '';
          if (!id) continue;
          return { id, offset: r.top - containerRect.top };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  _restoreScrollAnchor(anchor) {
    try {
      if (!anchor || !anchor.id) return false;
      const container = this._getChatScrollContainer();
      if (!container) return false;
      const containerRect = container.getBoundingClientRect();
      const root = document.getElementById('chat-scroll');
      if (!root) return false;
      const el = root.querySelector(`[data-msg-id="${CSS.escape(anchor.id)}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const delta = (r.top - containerRect.top) - (Number(anchor.offset) || 0);
      if (!Number.isFinite(delta)) return false;
      container.scrollTop = (container.scrollTop || 0) + delta;
      return true;
    } catch (e) {
      return false;
    }
  },

  // 通知跳转：用“会话名称”打开会话（第一版：按 title 精确匹配）
  async openSessionByTitle(sessionTitle) {
    const title = String(sessionTitle || '').trim();
    if (!title) {
      State.switchPage('page-chat-list');
      return;
    }
    const sessions = await Storage.dbGetAll('sessions');
    const list = Array.isArray(sessions) ? sessions : [];
    const hit = list.find(s => String(s?.title || '').trim() === title);
    if (hit && hit.id) {
      await this.openSession(hit.id);
      return;
    }
    // 找不到则回到列表（不强行创建，避免误匹配）
    State.switchPage('page-chat-list');
  },
  
  // 显示会话菜单
  showSessionMenu() {
    this.openSessionSettings();
  },

  _syncModeToggleLabel(mode) {
    try {
      const m = (mode === 1 || mode === '1') ? 1 : 0;
      const btn = document.getElementById('chat-menu');
      const left = btn?.querySelector('.yd-chat-menu-pill__left');
      // 药丸展示「点击后将进入的模式」：已在线下则显示「线上」，已在线上则显示「线下」
      const switchTargetLabel = m === 1 ? '线上' : '线下';
      if (left) left.textContent = switchTargetLabel;
      btn?.setAttribute('aria-label', m === 1 ? '切换到线上模式' : '切换到线下模式');
    } catch (e) {}
  },

  _applyModeUI(mode = null) {
    const m = (mode === 1 || mode === '1')
      ? 1
      : (mode === 0 || mode === '0')
        ? 0
        : this._getCurrentSessionMode();

    this._syncModeToggleLabel(m);
    // 修复：避免前一次把 inline display/hide 作用到其它会话
    const menuBtn = document.getElementById('chat-menu');
    if (menuBtn) menuBtn.style.display = '';

    const toolbar = document.getElementById('chat-toolbar');
    const stickerStrip = document.getElementById('chat-sticker-strip');

    if (toolbar) {
      if (m === 1) {
        toolbar.setAttribute('hidden', 'true');
        toolbar.style.display = 'none';
      } else {
        toolbar.removeAttribute('hidden');
        toolbar.style.display = 'flex';
      }
    }

    if (stickerStrip) {
      stickerStrip.setAttribute('hidden', 'true');
      stickerStrip.style.display = 'none';
    }
    if (m === 0 && stickerStrip) {
      stickerStrip.removeAttribute('hidden');
      stickerStrip.style.display = '';
    }

    const chatPage = document.getElementById('page-chat');
    if (chatPage) {
      if (m === 1) chatPage.classList.add('yd-page-chat--offline');
      else chatPage.classList.remove('yd-page-chat--offline');
    }

    const inputFooter = document.querySelector('#page-chat .yd-page-footer.yd-chat-input-wrapper');
    if (inputFooter) {
      if (m === 1) inputFooter.classList.add('yd-chat-input-wrapper--offline');
      else inputFooter.classList.remove('yd-chat-input-wrapper--offline');
    }
    const offlineBar = document.getElementById('chat-offline-toolbar');
    if (offlineBar) {
      offlineBar.setAttribute('aria-hidden', m === 1 ? 'false' : 'true');
      offlineBar.style.display = '';
      offlineBar.removeAttribute('hidden');
    }
    // 模式切换后立即刷新标题状态文案（在线 / 线下 / 正在输入中...）
    this._updateTypingDisplay();
  },

  /**
   * 进入线下时由大模型生成一段「见面」开场正文（不入库为聊天消息，仅返回文本供 _persistModeArchive 插入）。
   */
  async _generateOfflineOpeningGreetingWithAI() {
    if (!await SCChat.review()) return null;
    const apiKey = Storage.get(CONFIG.STORAGE_KEYS.API_KEY);
    if (!apiKey) {
      alert('请先在设置中配置 API Key');
      return null;
    }
    const baseRaw = Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || 'https://api.openai.com/v1';
    const baseUrl = String(baseRaw).replace(/\/$/, '');
    const model = Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || 'gpt-3.5-turbo';

    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session) return null;

    const participantIds = Array.isArray(session.participantCharacterIds)
      ? session.participantCharacterIds.filter(Boolean)
      : [];
    const characterMap = await this.getCharacterMap(true);
    const participants = participantIds.map((id) => characterMap.get(String(id))).filter(Boolean);

    const truncate = (s, n) => {
      const t = String(s || '').trim();
      if (!t) return '';
      return t.length > n ? t.slice(0, n) + '…' : t;
    };

    let charBlock = '';
    if (participants.length === 1) {
      const c = participants[0];
      charBlock = [
        `角色名：${c.name}`,
        `人设：${truncate(c.description, 1800)}`,
        c.first_mes ? `默认开场参考（勿照抄）：${truncate(c.first_mes, 500)}` : ''
      ].filter(Boolean).join('\n');
    } else if (participants.length > 1) {
      charBlock = participants
        .map((c, i) => `${i + 1}. ${c.name}：${truncate(c.description, 500)}`)
        .join('\n');
    } else {
      charBlock = '（未绑定角色，请写一段通用的线下见面开场。）';
    }

    const memoryHint = '';
    const memoryLine = memoryHint
      ? `此前线上语境摘要（供衔接，可化用不可复述设定列表）：\n${truncate(memoryHint, 900)}`
      : '';

    const systemPrompt = [
      '你负责撰写「线下见面」场景中的开场正文。',
      '用自然中文，以角色口吻写出见面当下的一段叙述或对白开头，像真实在场说话；不要写元说明（不要“以下是开场白”）。',
      '长度约 200～800 字；不要 markdown、不要代码块。',
      '正文中不要使用 [消息]、[红包]、[语音] 等协议标签。',
      '只输出正文，不要引号包裹全篇。'
    ].join('\n');

    const userPrompt = [
      participants.length > 1
        ? '群聊：可让其中一位先开口，或两人各一句，保持同一见面场景。'
        : '单聊：以主要角色对在场用户开口。',
      '',
      charBlock,
      memoryLine ? `\n${memoryLine}` : '',
      '',
      '只输出开场正文。'
    ].join('\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    try {
      if (typeof ChatMessageBuilder !== 'undefined' && ChatMessageBuilder.isRealTimeAwarenessEnabled && ChatMessageBuilder.isRealTimeAwarenessEnabled()) {
        const mask = await this._getEffectiveMaskForSession(session);
        messages.splice(1, 0, {
          role: 'system',
          content: ChatMessageBuilder.getCurrentTimeSystemContent(participants, { mask })
        });
      }
    } catch (e) {}

    const openingSid = String(this.currentSessionId || '').trim();
    this._setTypingStatus(true, openingSid);
    this._updateTypingDisplay();
    try {
      try {
        requestAnimationFrame(() => this._updateTypingDisplay());
      } catch (e2) {}

      const maxTokOpen = this._getApiMaxTokensForRequest();
      const data = await this._postChatCompletionsAndParse({
        baseUrl,
        apiKey,
        payload: {
          model,
          messages,
          temperature: 0.82,
          ...(maxTokOpen != null ? { max_tokens: maxTokOpen } : {})
        }
      });
      const raw = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';
      const text = typeof this._normalizeApiContent === 'function'
        ? String(this._normalizeApiContent(raw) || '').trim()
        : String(raw || '').trim();
      if (!text) throw new Error('模型未返回有效内容');
      return text;
    } finally {
      this._setTypingStatus(false);
      this._updateTypingDisplay();
    }
  },

  async showModeSwitchModal() {
    if (!this.currentSessionId) return;

    const existed = document.getElementById('chat-mode-switch-modal');
    if (existed) existed.remove();
    const existedCustom = document.getElementById('chat-custom-greeting-modal');
    if (existedCustom) existedCustom.remove();

    const session = this.currentSession || await Storage.dbGet('sessions', this.currentSessionId);
    if (!session) return;

    const currentMode = (session && session.mode != null) ? (Number(session.mode) === 1 ? 1 : 0) : 0;
    const targetMode = currentMode === 1 ? 0 : 1;

    try {
      await this._persistModeArchive(targetMode, { openingGreetingText: null });
    } catch (e) {
      console.error('[chat] mode switch failed:', e);
      alert('切换失败，请稍后重试');
    }
  },

  // 先提供一个最小可用版本：只更新 mode + UI +（进入线下时的可选开场）。
  // 后续“记忆资料生成/边界/summary system”会在 persist-archive-and-boundary todo 里补全。
  async _persistModeArchive(requestedTargetMode, opts = {}) {
    if (!this.currentSessionId) return;
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session) return;

    const sourceMode = (session && session.mode != null) ? (Number(session.mode) === 1 ? 1 : 0) : 0;
    const targetMode = (requestedTargetMode === 1 || requestedTargetMode === '1') ? 1 : 0;
    if (sourceMode === targetMode) return;

    const allMessages = Array.isArray(this._sessionAllMessages) ? this._sessionAllMessages : [];
    const pendingSet = new Set(Array.isArray(this._pendingUserQueue) ? this._pendingUserQueue.map(x => String(x)) : []);
    const normalizeMsgMode = (m) => this._normalizeMsgModeForApi(m);
    const boundaryMsg = (() => {
      for (let i = allMessages.length - 1; i >= 0; i--) {
        const m = allMessages[i];
        if (!m) continue;
        if (m.role === 'memory') continue;
        if (m._localOnly) continue;
        if (pendingSet.has(String(m.id || ''))) continue;
        if (normalizeMsgMode(m) !== sourceMode) continue;
        return m;
      }
      return null;
    })();
    const boundaryMessageId = boundaryMsg?.id || null;
    const boundaryCreatedAt = Number(boundaryMsg?.createdAt || 0) || 0;
    const openingGreetingText = opts?.openingGreetingText ? String(opts.openingGreetingText) : null;
    const anchorTs = boundaryMsg
      ? boundaryCreatedAt
      : (session.modeEntryBoundaryCreatedAt != null ? Number(session.modeEntryBoundaryCreatedAt) : 0);
    const memCreatedAt = anchorTs > 0 ? (anchorTs + 0.5) : (Date.now() - 1000);
    session.mode = targetMode;
    if (boundaryMsg) {
      session.modeEntryBoundaryMessageId = boundaryMessageId;
      session.modeEntryBoundaryCreatedAt = boundaryCreatedAt;
    }
    session.updatedAt = Date.now();

    if (boundaryCreatedAt > 0) {
      try {
        await this._backfillSessionMessageModesUpToBoundary(
          this.currentSessionId,
          boundaryCreatedAt,
          sourceMode,
          boundaryMessageId
        );
      } catch (eBackfill) {}
    }

    if (targetMode === 1) {
      try {
        await this._repairMislabeledOfflineModesInSession(this.currentSessionId);
      } catch (eRepairMode) {}
    }

    await Storage.dbPut('sessions', session);
    this.currentSession = session;
    this._applyModeUI(session.mode);
    this._forceFullRenderNext = true;

    // 进入线下时可选插入开场白（首版只支持单角色会话）
    if (session.mode === 1 && openingGreetingText) {
      const oid = await this._insertOfflineAssistantOpening(openingGreetingText, memCreatedAt + 0.5);
      if (oid) this._plainStreamPendingMsgIds.add(String(oid));
    }

    await this.loadMessages();
    this._scrollChatToBottom();
  },

  async _insertOfflineAssistantOpening(content, createdAtOpt) {
    const text = String(content || '').trim();
    if (!text || !this.currentSessionId) return null;
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session || (Number(session.mode) !== 1 && session.mode !== '1')) return null;

    const ids = Array.isArray(session.participantCharacterIds)
      ? session.participantCharacterIds.filter(Boolean)
      : [];
    let characterId = null;
    let characterName = null;
    if (ids.length === 1) {
      const map = await this.getCharacterMap(true);
      const c = map.get(String(ids[0]));
      if (c) {
        characterId = c.id;
        characterName = c.name;
      }
    }

    const greetMsg = {
      id: State.generateId(),
      sessionId: this.currentSessionId,
      role: 'assistant',
      content: text,
      createdAt: createdAtOpt != null ? Number(createdAtOpt) : Date.now(),
      mode: 1,
      characterId,
      characterName,
      _offlineOpeningGreeting: true
    };
    await Storage.dbAdd('messages', greetMsg);
    return greetMsg.id;
  },

  async _addOfflineOpeningGeneratingPlaceholder() {
    if (!this.currentSessionId) return null;
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session) return null;
    const boundaryTs = session.modeEntryBoundaryCreatedAt != null
      ? Number(session.modeEntryBoundaryCreatedAt)
      : -Infinity;
    const createdAt = boundaryTs > -Infinity
      ? Math.max(Date.now(), boundaryTs + 1)
      : Date.now();

    const ids = Array.isArray(session.participantCharacterIds)
      ? session.participantCharacterIds.filter(Boolean)
      : [];
    let characterId = null;
    let characterName = null;
    if (ids.length === 1) {
      const map = await this.getCharacterMap(true);
      const c = map.get(String(ids[0]));
      if (c) {
        characterId = c.id;
        characterName = c.name;
      }
    }

    const msg = {
      id: State.generateId(),
      sessionId: this.currentSessionId,
      role: 'assistant',
      content: '开场白正在生成中',
      createdAt,
      mode: 1,
      characterId,
      characterName,
      _localOnly: true,
      _offlineOpeningPending: true
    };
    await Storage.dbAdd('messages', msg);
    await this.loadMessages();
    this._scrollChatToBottom();
    return msg.id;
  },

  async _clearOfflineOpeningPlaceholder() {
    if (!this.currentSessionId) return;
    const all = await Storage.dbGetAll('messages');
    for (const m of all) {
      if (!m || m.sessionId !== this.currentSessionId) continue;
      if (m._offlineOpeningPending) {
        try { await Storage.dbDelete('messages', m.id); } catch (e) {}
      }
    }
  },

  /** 开场白生成失败：落库为助手消息，可编辑 / 删除；「重说」走 _redoOfflineOpeningFlow */
  async _insertOfflineOpeningFailureMessage(errSummary) {
    const line = String(errSummary || '').trim() || '未知错误';
    const content =
      `生成开场白失败：${line}\n\n可点选本消息后使用「重说」再次生成，或「编辑」修改本条、「删除」移除。`;
    if (!this.currentSessionId) return null;
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session || (Number(session.mode) !== 1 && session.mode !== '1')) return null;

    const boundaryTs = session.modeEntryBoundaryCreatedAt != null
      ? Number(session.modeEntryBoundaryCreatedAt)
      : -Infinity;
    const createdAt = boundaryTs > -Infinity
      ? Math.max(Date.now(), boundaryTs + 2)
      : Date.now();

    const ids = Array.isArray(session.participantCharacterIds)
      ? session.participantCharacterIds.filter(Boolean)
      : [];
    let characterId = null;
    let characterName = null;
    if (ids.length === 1) {
      const map = await this.getCharacterMap(true);
      const c = map.get(String(ids[0]));
      if (c) {
        characterId = c.id;
        characterName = c.name;
      }
    }

    const failMsg = {
      id: State.generateId(),
      sessionId: this.currentSessionId,
      role: 'assistant',
      content,
      createdAt,
      mode: 1,
      characterId,
      characterName,
      _offlineOpeningError: true
    };
    await Storage.dbAdd('messages', failMsg);
    return failMsg.id;
  },

  async _shouldUseOfflineOpeningRedo(msg) {
    if (!msg || this._getCurrentSessionMode() !== 1) return false;
    if (String(msg.role || '') !== 'assistant') return false;
    if (msg._offlineOpeningError || msg._offlineOpeningGreeting) return true;
    if (String(msg.content || '').startsWith('生成开场白失败：')) return true;
    return this._isFirstAssistantInOfflineSegment(msg);
  },

  /** 当前线下段内，本条是否为「记忆之后第一条实质助手消息」（即开场白位），用于无标旧数据 */
  async _isFirstAssistantInOfflineSegment(msg) {
    if (!msg?.id || !this.currentSessionId) return false;
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session || (Number(session.mode) !== 1 && session.mode !== '1')) return false;
    const boundaryTs = session.modeEntryBoundaryCreatedAt != null
      ? Number(session.modeEntryBoundaryCreatedAt)
      : -Infinity;
    const msgMode = (m) =>
      m && (m.mode === 1 || m.mode === '1' || Number(m.mode) === 1) ? 1 : 0;
    let all = [];
    try {
      const rows = await Storage.dbGetAll('messages');
      all = (Array.isArray(rows) ? rows : [])
        .filter((r) => r && String(r.sessionId || '') === String(this.currentSessionId))
        .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    } catch (e) {
      return false;
    }
    const targetIdx = all.findIndex((r) => String(r?.id || '') === String(msg.id));
    if (targetIdx < 0 || msgMode(all[targetIdx]) !== 1) return false;
    if (String(all[targetIdx].role || '') !== 'assistant') return false;
    for (let i = targetIdx - 1; i >= 0; i--) {
      const m = all[i];
      if (msgMode(m) !== 1) continue;
      if (boundaryTs > -Infinity && Number(m.createdAt) <= boundaryTs) break;
      if (m.role === 'memory') continue;
      if (m._offlineOpeningPending) continue;
      if (m._localOnly) continue;
      if (m.role === 'user') return false;
      if (m.role === 'assistant') return false;
    }
    return true;
  },

  /** 删除当前条（失败条或开场白条）后重新请求生成线下开场白；保留原 createdAt 以免排序错乱 */
  async _redoOfflineOpeningFlow(msg) {
    if (!msg || !msg.id || !this.currentSessionId) return;
    if (this._getCurrentSessionMode() !== 1) {
      if (typeof this._toast === 'function') this._toast('当前不在线下模式');
      return;
    }
    const createdAtKeep = Number(msg.createdAt) > 0 ? Number(msg.createdAt) : Date.now();
    try {
      try { await Storage.dbDelete('messages', msg.id); } catch (e) {}
      this._forceFullRenderNext = true;
      await this.loadMessages();
      await this._addOfflineOpeningGeneratingPlaceholder();
      const text = await this._generateOfflineOpeningGreetingWithAI();
      await this._clearOfflineOpeningPlaceholder();
      this._forceFullRenderNext = true;
      if (!text) {
        await this._insertOfflineOpeningFailureMessage('模型未返回有效内容');
        await this.loadMessages();
        this._scrollChatToBottom();
        if (typeof this._toast === 'function') this._toast('开场白生成失败');
        return;
      }
      const openingId = await this._insertOfflineAssistantOpening(text, createdAtKeep);
      if (openingId) this._plainStreamPendingMsgIds.add(String(openingId));
      await this.loadMessages();
      this._scrollChatToBottom();
      if (typeof this._toast === 'function') this._toast('开场白已更新');
    } catch (e) {
      console.error('[chat] redo offline opening failed:', e);
      try { await this._clearOfflineOpeningPlaceholder(); } catch (e2) {}
      this._forceFullRenderNext = true;
      const errText = e && e.message ? String(e.message) : '生成开场白失败，请检查网络与 API 设置';
      try { await this._insertOfflineOpeningFailureMessage(errText); } catch (e3) {}
      try { await this.loadMessages(); } catch (e4) {}
      this._scrollChatToBottom();
      if (typeof this._toast === 'function') this._toast('开场白生成失败');
    }
  },

  // 规则/抽取式“记忆资料”生成（不调用 AI）
  // kind：'online' | 'offline'，表示这段资料对应的语境来源
  async _generateArchiveText(rawMessages, kind, sessionOpt = null) {
    const messages = Array.isArray(rawMessages) ? rawMessages : [];
    const src = String(kind || '').trim();
    const label = src === 'offline' ? '线下记忆资料' : '线上记忆资料';
    if (!messages.length) return `${label}\n- 无。`;

    const session = sessionOpt || this.currentSession;
    const isGroup = !!(session?.participantCharacterIds && session.participantCharacterIds.length > 1);

    // 用户侧显示名：当前会话面具 > 默认面具 > 无面具则“用户”
    let userDisplayName = '用户';
    try {
      const effMask = await this._getEffectiveMaskForSession(session);
      const nm = String(effMask?.name || '').trim();
      if (nm) userDisplayName = nm;
    } catch (e0) {}

    const formatTs = (ms) => {
      const n = Number(ms);
      if (!Number.isFinite(n) || n <= 0) return '';
      const d = new Date(n);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    };

    const timeAwarenessEnabled = (() => {
      try {
        if (typeof ChatMessageBuilder !== 'undefined' && ChatMessageBuilder && typeof ChatMessageBuilder.isRealTimeAwarenessEnabled === 'function') {
          return !!ChatMessageBuilder.isRealTimeAwarenessEnabled();
        }
      } catch (e) {}
      try {
        const key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.TIME_AWARENESS)
          ? CONFIG.STORAGE_KEYS.TIME_AWARENESS
          : 'time_awareness';
        const def = (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_TIME_AWARENESS) ? CONFIG.DEFAULT_TIME_AWARENESS : 'on';
        const mode = String((typeof Storage !== 'undefined' && Storage.get) ? (Storage.get(key) || def) : def).trim();
        return mode === 'on';
      } catch (e2) {
        return false;
      }
    })();

    const filtered = messages
      .filter(m => m && m.role && m.role !== 'memory')
      .filter(m => !m._pending && !m._localOnly)
      .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));

    if (!filtered.length) return `${label}\n- 无。`;

    const take = filtered;
    const truncate = (s, n) => {
      const t = String(s || '').replace(/\s+/g, ' ').trim();
      if (!t) return '';
      // 记忆详情需要可查看完整内容，这里不再追加省略号，避免误判“内容丢失”。
      return t.length > n ? t.slice(0, n) : t;
    };

    const formatOne = (m) => {
      const raw0 = String(m.content || '').trim();
      if (!raw0) return '';
      // 记忆资料里不要携带 [建议回复]（线上/线下都不应混入）
      const raw = raw0
        .split('\n')
        .map((x) => String(x || '').trim())
        .filter((line) => !!line && !/^\[建议回复(?:\|[^\]]+)?\]/.test(line))
        .join('\n')
        .trim();
      if (!raw) return '';

      let parsed = [];
      if (typeof MessageParser !== 'undefined' && MessageParser.parse) {
        try { parsed = MessageParser.parse(raw, isGroup); } catch (e) { parsed = []; }
      }

      const parts = [];
      const addPart = (t) => {
        const tt = truncate(t, 20000);
        if (tt) parts.push(tt);
      };

      if (parsed && parsed.length) {
        parsed.forEach(p => {
          if (!p) return;
          const type = String(p.type || '');
          if (type === 'suggested_reply') {
            return;
          }
          if (type === 'transfer') {
            addPart(`转账：¥${Number(p.amount || 0).toFixed(2)}${p.remark ? `（${truncate(p.remark, 20000)}）` : ''}`);
          } else if (type === 'redpacket') {
            addPart(`红包：¥${Number(p.amount || 0).toFixed(2)}${p.blessing ? `（${truncate(p.blessing, 20000)}）` : ''}`);
          } else if (type === 'voice_text') {
            addPart(`语音：${truncate(p.content || '', 20000)}`);
          } else if (type === 'image') {
            addPart(`图片：${truncate(p.content || '', 20000)}`);
          } else if (type === 'sticker') {
            addPart(`表情包：${truncate(p.content || '', 20000)}`);
          } else if (type === 'action') {
            addPart(`动作：${truncate(p.content || '', 20000)}`);
          } else if (type === 'invitation') {
            addPart(`邀请：${truncate(p.content || '', 20000)}`);
          } else if (type === 'share') {
            const app = truncate(p.app || '', 20000);
            const title = truncate(p.title || '', 20000);
            const total = Number(p.total || 0).toFixed(2);
            const status = truncate(p.status || '', 20000);
            const mid = [app, title].filter(Boolean).join(' / ') || '分享';
            addPart(`分享：${mid}，¥${total}${status ? `（${status}）` : ''}`);
            const hiddenPayload = this._decodeSharePayloadB64(p.sharePayloadB64 || m?.sharePayloadB64);
            if (
              app === '论坛' &&
              String(p.resource || '') === '帖子' &&
              hiddenPayload &&
              String(hiddenPayload.recentCommentsText || '').trim()
            ) {
              const forumName = truncate(String(hiddenPayload.forumName || ''), 20000);
              const threadTitle = truncate(String(hiddenPayload.threadTitle || title || ''), 20000);
              const threadAuthor = truncate(String(hiddenPayload.threadAuthor || ''), 20000);
              const recentCommentsText = truncate(String(hiddenPayload.recentCommentsText || ''), 20000);
              addPart([
                '论坛分享附带上下文：',
                forumName ? `论坛名称：${forumName}` : '',
                threadTitle ? `帖子标题：${threadTitle}` : '',
                threadAuthor ? `发帖人：${threadAuthor}` : '',
                `当前帖子已有评论（最近40楼）：\n${recentCommentsText}`
              ].filter(Boolean).join('\n'));
            }
          } else if (type === 'text' || type === 'plain') {
            // text/plain：提取可读前半段
            const pc = String(p.content || '').trim();
            if (/^\[建议回复(?:\|[^\]]+)?\]/.test(pc)) return;
            addPart(truncate(pc, 20000));
          } else {
            // 其它类型兜底：直接截取
            addPart(truncate(p.content || raw, 20000));
          }
        });
      }

      const side = m.role === 'user'
        ? userDisplayName
        : (m.characterName ? String(m.characterName) : '角色');

      const body = parts.length ? parts.join('；') : String(raw || '').replace(/\s+/g, ' ').trim();
      // 仅「线上记忆资料」：用户侧在消息后追加一行独立时间戳（与 UI/封装格式一致）
      if (src === 'online' && m.role === 'user' && timeAwarenessEnabled) {
        const ts = formatTs(m.createdAt);
        return ts
          ? `${side}：${body}\n[${ts}]`
          : `${side}：${body}`;
      }
      return `${side}：${body}`;
    };

    const lines = [];
    for (const m of take) {
      const s = formatOne(m);
      if (!s) continue;
      lines.push(s);
    }

    if (!lines.length) return `${label}\n- 无。`;
    return `${label}\n- ${lines.join('\n- ')}`;
  },

  _openMemoryDetailModal(memoryText) {
    const existed = document.getElementById('chat-memory-detail-modal');
    if (existed) existed.remove();

    const text = String(memoryText || '').trim();
    const overlay = document.createElement('div');
    overlay.id = 'chat-memory-detail-modal';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content" role="dialog" aria-modal="true" aria-label="记忆资料详情" style="max-width:680px;position:relative;padding:0 !important;overflow:hidden;">
        <div class="yd-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 8px 2px;margin:0;border:0;">
          <div style="font-weight:900">记忆资料详情</div>
          <button type="button" class="yd-btn-close" data-act="close" aria-label="关闭">×</button>
        </div>
        <div style="padding:6px 8px 8px;">
          <pre style="margin:0;max-height:min(76vh,720px);overflow:auto;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.04);border-radius:10px;padding:10px;color:#111;font-size:13px;line-height:1.55;"></pre>
        </div>
      </div>
    `;

    const pre = overlay.querySelector('pre');
    if (pre) pre.textContent = text || '无内容';

    const close = () => {
      try { overlay.remove(); } catch (e) {}
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);

    document.body.appendChild(overlay);
  },

  /** 删除聊天记录：选择「仅消息」或「消息+记忆」 */
  _openClearChatHistoryChoiceModal() {
    const old = document.getElementById('yd-chat-clear-history-modal');
    if (old) old.remove();

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'yd-chat-clear-history-modal';
      overlay.className = 'yd-modal yd-modal--active yd-chat-clear-history-modal';
      overlay.innerHTML = `
        <div class="yd-modal-content yd-chat-clear-history-modal__panel" role="dialog" aria-modal="true" aria-label="删除聊天记录">
          <div class="yd-modal-header yd-chat-clear-history-modal__head">
            <div class="yd-chat-clear-history-modal__title">删除聊天记录</div>
          </div>
          <p class="yd-chat-clear-history-modal__desc">请选择清理范围。操作前会自动备份到回收站（7 天可恢复）。</p>
          <div class="yd-chat-clear-history-modal__options">
            <button type="button" class="yd-chat-clear-history-modal__option" data-choice="messages-only">
              <span class="yd-chat-clear-history-modal__option-title">只清空聊天框</span>
              <span class="yd-chat-clear-history-modal__option-desc">删除本对话全部消息，保留会话记忆、总结与主动消息计划</span>
            </button>
            <button type="button" class="yd-chat-clear-history-modal__option yd-chat-clear-history-modal__option--strong" data-choice="messages-and-memory">
              <span class="yd-chat-clear-history-modal__option-title">清空聊天框和聊天记忆</span>
              <span class="yd-chat-clear-history-modal__option-desc">删除全部消息，并清除记忆总结、线上/线下记忆与待发送主动消息</span>
            </button>
          </div>
          <button type="button" class="yd-chat-clear-history-modal__cancel" data-act="cancel">取消</button>
        </div>
      `;

      const done = (choice) => {
        try { overlay.remove(); } catch (e) {}
        window.removeEventListener('keydown', onKeyDown);
        resolve(choice || null);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') done(null);
      };

      overlay.querySelector('[data-choice="messages-only"]')?.addEventListener('click', () => done('messages-only'));
      overlay.querySelector('[data-choice="messages-and-memory"]')?.addEventListener('click', () => done('messages-and-memory'));
      overlay.querySelector('[data-act="cancel"]')?.addEventListener('click', () => done(null));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) done(null);
      });
      window.addEventListener('keydown', onKeyDown);
      document.body.appendChild(overlay);
    });
  },

  async _clearSessionChatHistory(sessionId, { clearMemory = false } = {}) {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;

    const sessionBefore = await Storage.dbGet('sessions', sid);
    const allMessages = await Storage.dbGetAll('messages');
    const messagesForSession = allMessages.filter((msg) => msg && msg.sessionId === sid);

    try {
      if (typeof Storage.recycleBinAddBackup === 'function') {
        await Storage.recycleBinAddBackup({
          kind: clearMemory ? 'clear_session_with_memory' : 'clear_session',
          sessionId: sid,
          sessionSnapshot: sessionBefore,
          messagesSnapshot: messagesForSession,
          days: 7
        });
      }
    } catch (e) {
      console.error('[recycle-bin] 清理会话备份失败:', e);
    }

    for (const msg of allMessages) {
      if (msg.sessionId === sid) {
        await Storage.dbDelete('messages', msg.id);
      }
    }

    const s = await Storage.dbGet('sessions', sid);
    if (s) {
      if (clearMemory) {
        try { s.memoryEnhanceHistory = []; } catch (e) {}
        try {
          s.onlineMemoryText = '';
          s.offlineMemoryText = '';
        } catch (e2) {}
        try {
          s.modeEntryBoundaryMessageId = null;
          s.modeEntryBoundaryCreatedAt = null;
        } catch (e3) {}
        try { delete s.memoryEnhanceLastSummaryAt; } catch (e4) {}
      }
      s.updatedAt = Date.now();
      await Storage.dbPut('sessions', s);
    }

    if (clearMemory) {
      try {
        if (
          typeof ProactiveScheduler !== 'undefined' &&
          ProactiveScheduler &&
          typeof ProactiveScheduler.scheduleFromSystemAction === 'function'
        ) {
          await ProactiveScheduler.scheduleFromSystemAction({ sessionId: sid, cancel: true });
        }
      } catch (e5) {}
    }

    return true;
  },
  
  // 打开当前会话的聊天设置
  async openSessionSettings() {
    if (!this.currentSessionId) return;
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session) return;

    // 与设置页展示一致，避免内存会话落后于 IndexedDB（影响灵感回复等需同步手势的读取）
    this.currentSession = session;

    // 初始化设置页控件
    await this._initChatSettingsPage();
    await this._populateChatSettings(session);
    await SCUI.settings(session);
    State.switchPage('page-chat-settings');
  },

  async _initChatSettingsPage() {
    if (this._chatSettingsInited) return;
    this._chatSettingsInited = true;

    const backBtn = document.getElementById('chat-settings-back');
    backBtn?.addEventListener('click', () => {
      State.switchPage('page-chat');
      try {
        if (
          typeof BubbleSettings !== 'undefined' &&
          BubbleSettings &&
          typeof BubbleSettings._refreshChatMessagesAfterThemeApply === 'function'
        ) {
          BubbleSettings._refreshChatMessagesAfterThemeApply();
        }
      } catch (e) {}
    });

    // 编辑会话名称：点击右侧箭头进入编辑态
    const editableName = document.getElementById('editableGroupName');
    const titleInput = document.getElementById('yd-chat-settings-title');
    if (editableName && titleInput) {
      const startEditName = async () => {
        editableName.style.display = 'none';
        titleInput.style.display = 'inline-block';
        titleInput.focus();
        titleInput.select();
      };
      editableName.parentElement?.addEventListener('click', startEditName);
      titleInput.addEventListener('blur', async () => {
        await this._saveSessionTitle(titleInput.value);
        titleInput.style.display = 'none';
        editableName.style.display = '';
      });
      titleInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await this._saveSessionTitle(titleInput.value);
          titleInput.blur();
        }
      });
    }

    // 会话头像：点击“查看 / 设置会话头像”行弹出小窗
    const avatarRow = document.querySelector('#yd-chat-settings-avatar')?.parentElement?.parentElement;
    if (avatarRow) {
      avatarRow.addEventListener('click', async () => {
        await this._openSessionAvatarModal();
      });
    }

    // 聊天背景：会话背景（仅对当前会话生效）
    const bgRowLabel = Array.from(document.querySelectorAll('.settings-item .settings-label'))
      .find(el => el.textContent && el.textContent.includes('聊天背景'));
    if (bgRowLabel) {
      bgRowLabel.parentElement?.addEventListener('click', async () => {
        await this._openSessionBackgroundModal();
      });
    }

    // 聊天气泡设置：跳转到全局聊天气泡设置页
    const bubbleRow = document.getElementById('yd-chat-settings-bubble');
    if (bubbleRow) {
      bubbleRow.addEventListener('click', () => {
        State.bubbleSettingsReturnPage = 'page-chat-settings';
        State.switchPage('page-bubble-settings');
      });
    }

    const sessionBeautifyRow = document.getElementById('yd-chat-settings-session-beautify');
    if (sessionBeautifyRow) {
      sessionBeautifyRow.addEventListener('click', () => {
        State.switchPage('page-chat');
        try {
          if (typeof SessionBeautify !== 'undefined' && SessionBeautify.openChatModal) {
            SessionBeautify.openChatModal();
          }
        } catch (e) {}
      });
    }

    const replyStyleRow = document.getElementById('yd-chat-settings-reply-style');
    if (replyStyleRow) {
      replyStyleRow.addEventListener('click', () => {
        try {
          if (typeof ReplyStyle !== 'undefined' && ReplyStyle.openChatModal) {
            ReplyStyle.openChatModal();
          }
        } catch (e) {}
      });
    }

    const sessionMemoryRow = document.getElementById('yd-chat-settings-session-memory');
    if (sessionMemoryRow) {
      sessionMemoryRow.addEventListener('click', () => {
        State.switchPage('page-chat');
        try {
          if (typeof SessionMemory !== 'undefined' && SessionMemory.openChatModal) {
            SessionMemory.openChatModal();
          }
        } catch (e) {}
      });
    }

    const suggestedReplyRow = document.getElementById('yd-chat-settings-suggested-reply');
    if (suggestedReplyRow) {
      suggestedReplyRow.addEventListener('click', async (e) => {
        await this._openSuggestedReplyPicker(e.currentTarget);
      });
    }

    const unreadBadgeRow = document.getElementById('yd-chat-settings-unread-badge');
    if (unreadBadgeRow) {
      unreadBadgeRow.addEventListener('click', async (e) => {
        await this._openUnreadBadgePicker(e.currentTarget);
      });
    }

    // 角色语音：会话设置只回显，不在此页修改；点击跳转到角色详情页
    const roleVoiceRow = document.getElementById('yd-chat-settings-role-voice');
    if (roleVoiceRow) {
      roleVoiceRow.addEventListener('click', async () => {
        if (!this.currentSessionId) return;
        const session = await Storage.dbGet('sessions', this.currentSessionId);
        const ids = Array.isArray(session?.participantCharacterIds)
          ? session.participantCharacterIds.filter(Boolean)
          : [];
        if (ids.length !== 1) {
          if (typeof this._toast === 'function') this._toast('群聊暂不支持直接跳转，请到角色页修改');
          State.switchPage('page-character');
          return;
        }
        const cid = ids[0];
        try {
          if (typeof Character !== 'undefined' && Character && typeof Character.openCharacterDetailById === 'function') {
            const ok = await Character.openCharacterDetailById(cid);
            if (!ok) State.switchPage('page-character');
          } else {
            State.switchPage('page-character');
          }
        } catch (e) {
          State.switchPage('page-character');
        }
      });
    }

    // 我的面具：点击选择当前会话面具
    const myMaskRowLabel = Array.from(document.querySelectorAll('.settings-item .settings-label'))
      .find(el => el.textContent && el.textContent.includes('我的面具'));
    if (myMaskRowLabel) {
      myMaskRowLabel.parentElement?.addEventListener('click', async () => {
        await this._openSessionMaskPicker();
      });
    }

    const exportSessionRow = document.getElementById('yd-chat-settings-export-session');
    exportSessionRow?.addEventListener('click', () => {
      if (!this.currentSessionId) return;
      try {
        if (typeof SessionMemory !== 'undefined' && SessionMemory.openExportRoundRangeModal) {
          SessionMemory.openExportRoundRangeModal(this.currentSessionId);
        }
      } catch (e) {}
    });

    const clearBtn = document.getElementById('yd-chat-settings-clear');
    // 兜底：避免缓存页面导致文案仍显示“和记忆”
    try {
      const clearLabelEl = clearBtn?.querySelector?.('.settings-label');
      if (clearLabelEl) clearLabelEl.textContent = '删除聊天记录';
    } catch (e) {}
    clearBtn?.addEventListener('click', async () => {
      if (!this.currentSessionId) return;
      const choice = await this._openClearChatHistoryChoiceModal();
      if (!choice) return;

      const clearMemory = choice === 'messages-and-memory';
      await this._clearSessionChatHistory(this.currentSessionId, { clearMemory });

      if (typeof this._toast === 'function') {
        this._toast(clearMemory ? '已清空聊天框和聊天记忆' : '已清空聊天框');
      }
      await this.loadMessages();
      await this.renderChatList();
      State.switchPage('page-chat');
    });

    const deleteBtn = document.getElementById('yd-chat-settings-delete');
    // 兜底：避免缓存页面导致文案仍显示“和记忆”
    try {
      const deleteLabelEl = deleteBtn?.querySelector?.('.settings-label');
      if (deleteLabelEl) deleteLabelEl.textContent = '删除会话';
    } catch (e) {}
    deleteBtn?.addEventListener('click', async () => {
      if (!this.currentSessionId) return;
      if (!confirm('确定删除此会话及其所有消息？')) return;

      // 备份到回收站（七天冷静期）
      // 注意：备份失败时不阻断原删除流程
      const sessionBefore = await Storage.dbGet('sessions', this.currentSessionId);
      const allMessages = await Storage.dbGetAll('messages');
      const messagesForSession = allMessages.filter((msg) => msg && msg.sessionId === this.currentSessionId);
      try {
        if (typeof Storage.recycleBinAddBackup === 'function') {
          await Storage.recycleBinAddBackup({
            kind: 'delete_session',
            sessionId: this.currentSessionId,
            sessionSnapshot: sessionBefore,
            messagesSnapshot: messagesForSession,
            days: 7
          });
        }
      } catch (e) {
        console.error('[recycle-bin] 删除会话备份失败:', e);
      }

      await this.deleteCurrentSession();
      State.switchPage('page-chat-list');
    });
  },

  async _populateChatSettings(session) {
    // 顶部会话信息
    const nameEl = document.getElementById('settingsGroupName');
    const typeEl = document.getElementById('settingsGroupCreatedDays');
    const avatarImg = document.getElementById('settingsGroupAvatarImg');

    if (nameEl) nameEl.textContent = session.title || '会话';
    const isGroup = Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1;
    if (typeEl) typeEl.textContent = isGroup ? '群聊' : '私人聊天';

    if (avatarImg) {
      const fallbackSvg = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IndoaXRlIiBzdHJva2U9IiNlMGUwZTAiIHN0cm9rZS13aWR0aD0iMSIvPgo8Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSIzIiBmaWxsPSIjOTk5Ii8+CjxwYXRoIGQ9Im02IDIwLjVjMC0zLjMgMi43LTYgNi02czYgMi43IDYgNiIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4K';
      let src = this._sanitizeAvatarSrc(session.avatar || '');
      if (!src && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length === 1) {
        const map = await this.getCharacterMap();
        const c = map.get(String(session.participantCharacterIds[0]));
        if (c && c.avatar) src = c.avatar;
      }
      avatarImg.src = src || fallbackSvg;
      avatarImg.onerror = () => {
        avatarImg.src = fallbackSvg;
        avatarImg.onerror = null;
      };
    }

    // 会话名称 / 头像输入初始值
    const titleInput = document.getElementById('yd-chat-settings-title');
    const avatarInput = document.getElementById('yd-chat-settings-avatar');
    const editableName = document.getElementById('editableGroupName');
    if (titleInput) titleInput.value = session.title || '';
    if (editableName) editableName.textContent = session.title || '会话名称';
    if (avatarInput) avatarInput.value = this._sanitizeAvatarSrc(session.avatar || '');

    const suggestedReplyValue = document.getElementById('yd-chat-settings-suggested-reply-value');
    if (suggestedReplyValue) {
      suggestedReplyValue.textContent = this._isSuggestedReplyEnabledGlobal() ? '开启' : '关闭';
    }
    const unreadBadgeValue = document.getElementById('yd-chat-settings-unread-badge-value');
    if (unreadBadgeValue) {
      unreadBadgeValue.textContent = this._isUnreadBadgeEnabledGlobal() ? '开启' : '关闭';
    }
    const replyStyleValue = document.getElementById('yd-chat-settings-reply-style-value');
    if (replyStyleValue) {
      try {
        replyStyleValue.textContent =
          typeof ReplyStyle !== 'undefined' && ReplyStyle.getDisplaySummary
            ? ReplyStyle.getDisplaySummary()
            : '默认';
      } catch (e) {
        replyStyleValue.textContent = '默认';
      }
    }

    // 角色语音（只回显）
    const roleVoiceValue = document.getElementById('yd-chat-settings-role-voice-value');
    if (roleVoiceValue) {
      const ids = Array.isArray(session?.participantCharacterIds)
        ? session.participantCharacterIds.filter(Boolean)
        : [];
      if (ids.length !== 1) {
        roleVoiceValue.textContent = '群聊会话（请到角色页查看）';
      } else {
        let voiceText = '未设置（将使用系统默认音色）';
        // 会话设置页需要看到“刚刚在角色页修改”的最新音色，强制刷新角色缓存
        const map = await this.getCharacterMap(true);
        const c = map.get(String(ids[0]));
        const roleVoice = (c && typeof c === 'object' && c.role_voice && typeof c.role_voice === 'object')
          ? c.role_voice
          : null;
        if (roleVoice && String(roleVoice.voice_name || roleVoice.voice_id || '').trim()) {
          voiceText = String(roleVoice.voice_name || roleVoice.voice_id || '').trim();
        }
        roleVoiceValue.textContent = voiceText;
      }
    }

    // 成员列表
    const membersList = document.getElementById('settingsMembersList');
    const membersCount = document.getElementById('settingsMembersCount');
    if (membersList) {
      membersList.innerHTML = '';
      const ids = Array.isArray(session.participantCharacterIds)
        ? session.participantCharacterIds.filter(Boolean)
        : [];
      const map = await this.getCharacterMap();
      const members = ids.map((id) => map.get(String(id))).filter(Boolean);
      // 把“我”也算作成员（使用面具）
      const effMask = await this._getEffectiveMaskForSession(session);
      const meName = effMask ? (effMask.name || '我') : '我';
      const meAvatar = effMask ? (effMask.avatar || null) : null;
      const allMembers = [
        ...members,
        { id: '__me__', name: meName, avatar: meAvatar }
      ];
      if (membersCount) {
        membersCount.textContent = `该会话共 ${allMembers.length} 个成员`;
      }
      allMembers.forEach(c => {
        const item = document.createElement('div');
        item.className = 'member-item';
        const fallbackSvg = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIwIDIxVjE5QTQgNCAwIDAgMCAxNiAxNUg4QTQgNCAwIDAgMCA0IDE5VjIxIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4K';
        const imgSrc = c.avatar || fallbackSvg;
        item.innerHTML = `
          <div class="member-avatar">
            <img src="${this.escapeHtml(imgSrc)}" alt="${this.escapeHtml(c.name || '')}">
          </div>
          <div class="member-name">${this.escapeHtml(c.name || '')}</div>
        `;
        const img = item.querySelector('img');
        if (img) {
          img.onerror = () => {
            img.src = fallbackSvg;
            img.onerror = null;
          };
        }
        membersList.appendChild(item);
      });
    }

    // 我的面具（显示）
    const myMaskNameEl = document.getElementById('sessionMyMaskName');
    const myMaskAvatarImg = document.getElementById('sessionMyMaskAvatarImg');
    const effMask = await this._getEffectiveMaskForSession(session);
    if (myMaskNameEl) {
      if (session && session.maskId) {
        myMaskNameEl.textContent = effMask ? (effMask.name || '未命名面具') : '未选择';
      } else {
        myMaskNameEl.textContent = effMask ? `${effMask.name || '未命名面具'}（默认）` : '未选择';
      }
    }
    if (myMaskAvatarImg) {
      const fallbackSvg = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIwIDIxVjE5QTQgNCAwIDAgMCAxNiAxNUg4QTQgNCAwIDAgMCA0IDE5VjIxIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4K';
      const src = effMask && effMask.avatar ? effMask.avatar : fallbackSvg;
      myMaskAvatarImg.src = src;
      myMaskAvatarImg.onerror = () => {
        myMaskAvatarImg.src = fallbackSvg;
        myMaskAvatarImg.onerror = null;
      };
    }
  },

  async _getEffectiveMaskForSession(session) {
    try {
      const sid = session && typeof session.maskId === 'string' ? session.maskId.trim() : '';
      const defaultId = Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '';
      const useId = sid || defaultId;
      if (!useId) return null;
      const mask = await Storage.dbGet('masks', useId);
      return mask || null;
    } catch (e) {
      console.warn('读取会话面具失败:', e);
      return null;
    }
  },

  async _getAlbumStickers() {
    try {
      const all = await Storage.dbGetAll('album');
      return (all || []).filter(it => it && it.type === 'sticker');
    } catch (e) {
      console.warn('读取表情包失败:', e);
      return [];
    }
  },

  async _openSessionMaskPicker() {
    if (!this.currentSessionId) return;
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session) return;

    const existing = document.getElementById('yd-chat-mask-picker');
    if (existing) existing.remove();

    const masks = await Storage.dbGetAll('masks');
    masks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const defaultId = Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '';

    const overlay = document.createElement('div');
    overlay.id = 'yd-chat-mask-picker';
    overlay.className = 'yd-modal yd-modal--active';

    const current = (session.maskId || '').trim();
    const selectedId = current || (defaultId ? defaultId : '');

    const rowsHtml = masks.map(m => {
      const name = (m.name || '').trim() || '未命名面具';
      const avatar = (m.avatar || '').trim();
      const avatarHtml = avatar
        ? `<img class="yd-chat-avatar-img" alt="${this.escapeHtml(name)}" src="${this.escapeHtml(avatar)}">`
        : '🎭';
      const sub = (m.detail || '').trim();
      const preview = sub ? (sub.length > 40 ? sub.slice(0, 40) + '…' : sub) : '暂无设定详情';
      return `<button class="yd-mask-sheet__item" type="button" data-id="${this.escapeHtml(m.id)}">
        <div class="yd-mask-sheet__avatar">${avatarHtml}</div>
        <div class="yd-mask-sheet__content">
          <div class="yd-mask-sheet__title">${this.escapeHtml(name)}${defaultId && m.id === defaultId ? '（默认）' : ''}</div>
          <div class="yd-mask-sheet__sub">${this.escapeHtml(preview)}</div>
        </div>
        <div class="yd-mask-sheet__check" aria-hidden="true"></div>
      </button>`;
    }).join('');

    overlay.innerHTML = `
      <div class="yd-mask-sheet" role="dialog" aria-modal="true" aria-label="选择面具">
        <div class="yd-mask-sheet__mask"></div>
        <div class="yd-mask-sheet__panel">
          <div class="yd-mask-sheet__header">
            <div class="yd-mask-sheet__titlebar">选择面具</div>
            <button type="button" class="yd-mask-sheet__close" id="yd-chat-mask-close" aria-label="关闭">×</button>
          </div>
          <div class="yd-mask-sheet__list" id="yd-mask-sheet-list">
            ${rowsHtml}
          </div>
          <div class="yd-mask-sheet__footer">
            <button type="button" class="yd-mask-sheet__edit-btn" id="yd-chat-mask-edit">去编辑</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.yd-mask-sheet__mask')?.addEventListener('click', close);
    overlay.querySelector('#yd-chat-mask-close')?.addEventListener('click', close);
    overlay.querySelector('#yd-chat-mask-edit')?.addEventListener('click', () => {
      close();
      try {
        State.maskReturnPage = 'page-chat-settings';
        State.maskReturnSessionId = String(this.currentSessionId || '').trim();
        State.switchPage('page-mask');
      } catch (e) {}
    });

    Array.from(overlay.querySelectorAll('.yd-mask-sheet__item')).forEach((el) => {
      const id = el.getAttribute('data-id') || '';
      if (id === selectedId) {
        el.classList.add('is-selected');
      }
      el.addEventListener('click', async () => {
        try {
          // 明确选中某个面具：直接写入该面具 id
          session.maskId = id ? id : '';
          await Storage.dbPut('sessions', session);
          // 同步当前内存会话并立刻刷新聊天渲染（否则需要整页刷新才更新头像）
          try {
            if (this.currentSession && String(this.currentSessionId || '') === String(session.id || '')) {
              this.currentSession.maskId = session.maskId;
            }
          } catch (e) {}
          await this._populateChatSettings(session);
          try { await this.renderMessages(); } catch (e) {}
          close();
          this._toast('已设置面具');
        } catch (e) {
          console.error('设置会话面具失败:', e);
          alert('设置失败');
        }
      });
    });
  },

  async _openSuggestedReplyPicker(anchorFromEvent) {
    if (!this.currentSessionId) return;

    // 与全局设置「时间感知」一致：必须先同步调起原生选择器，不能在之前 await，
    // 否则手机浏览器会脱离用户手势，showPicker/click 无反应。
    const row = document.getElementById('yd-chat-settings-suggested-reply');
    const anchorEl =
      anchorFromEvent && anchorFromEvent.nodeType === 1
        ? anchorFromEvent
        : row?.querySelector('.settings-value-container') || row || null;

    let curOn = this._isSuggestedReplyEnabledGlobal();
    const cur = curOn ? 'on' : 'off';

    const pick =
      typeof Settings !== 'undefined' && Settings && typeof Settings._openNativeChoicePicker === 'function'
        ? Settings._openNativeChoicePicker.bind(Settings)
        : null;
    if (!pick) return;

    const picked = await pick({
      current: cur,
      anchorEl,
      options: [
        { value: 'on', label: '开启' },
        { value: 'off', label: '关闭' }
      ]
    });
    if (!picked || picked === cur) return;

    try {
      this._setSuggestedReplyEnabledGlobal(picked === 'on');
      const session = await Storage.dbGet('sessions', this.currentSessionId);
      if (!session) return;
      await this._populateChatSettings(session);
      this._forceFullRenderNext = true;
      try { await this.renderMessages(); } catch (e2) {}
    } catch (e) {
      console.error('设置灵感回复失败:', e);
      alert('设置失败');
    }
  },

  async _openUnreadBadgePicker(anchorFromEvent) {
    if (!this.currentSessionId) return;
    const row = document.getElementById('yd-chat-settings-unread-badge');
    const anchorEl =
      anchorFromEvent && anchorFromEvent.nodeType === 1
        ? anchorFromEvent
        : row?.querySelector('.settings-value-container') || row || null;

    const curOn = this._isUnreadBadgeEnabledGlobal();
    const cur = curOn ? 'on' : 'off';
    const pick =
      typeof Settings !== 'undefined' && Settings && typeof Settings._openNativeChoicePicker === 'function'
        ? Settings._openNativeChoicePicker.bind(Settings)
        : null;
    if (!pick) return;

    const picked = await pick({
      current: cur,
      anchorEl,
      options: [
        { value: 'on', label: '开启' },
        { value: 'off', label: '关闭' }
      ]
    });
    if (!picked || picked === cur) return;

    try {
      this._setUnreadBadgeEnabledGlobal(picked === 'on');
      const session = await Storage.dbGet('sessions', this.currentSessionId);
      if (!session) return;
      await this._populateChatSettings(session);
      await this._refreshChatHeaderUnreadBadge();
    } catch (e) {
      console.error('设置消息红点失败:', e);
      alert('设置失败');
    }
  },

  _isSuggestedReplyEnabledGlobal() {
    try {
      const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.SUGGESTED_REPLY_ENABLED_GLOBAL) || 'suggested_reply_enabled_global';
      const raw = Storage.get(key);
      if (raw === true || raw === 'true' || raw === 1 || raw === '1' || raw === 'on') return true;
      if (raw === false || raw === 'false' || raw === 0 || raw === '0' || raw === 'off') return false;
    } catch (e) {}
    // 默认关闭
    return false;
  },

  _setSuggestedReplyEnabledGlobal(enabled) {
    try {
      const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.SUGGESTED_REPLY_ENABLED_GLOBAL) || 'suggested_reply_enabled_global';
      Storage.set(key, !!enabled);
    } catch (e) {}
  },

  async _saveSessionTitle(nextTitle) {
    if (!this.currentSessionId) return;
    const trimmed = String(nextTitle || '').trim();
    const next = await Storage.dbGet('sessions', this.currentSessionId);
    if (!next) return;
    next.title = trimmed;
    await Storage.dbPut('sessions', next);
    await this.renderChatList();
    await this.updateTitle();
    const editableName = document.getElementById('editableGroupName');
    if (editableName) editableName.textContent = trimmed || '会话名称';
    const settingsBigName = document.getElementById('settingsGroupName');
    if (settingsBigName) settingsBigName.textContent = trimmed || '会话';
  },

  async _openSessionAvatarModal() {
    if (!this.currentSessionId) return;
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (!session) return;
    const existing = document.getElementById('yd-chat-avatar-modal');
    if (existing) existing.remove();

    const fallbackSvg = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IndoaXRlIiBzdHJva2U9IiNlMGUwZTAiIHN0cm9rZS13aWR0aD0iMSIvPgo8Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSIzIiBmaWxsPSIjOTk5Ii8+CjxwYXRoIGQ9Im02IDIwLjVjMC0zLjMgMi43LTYgNi02czYgMi43IDYgNiIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4K';
    let src = this._sanitizeAvatarSrc(session.avatar || '');
    if (!src && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length === 1) {
      const map = await this.getCharacterMap();
      const c = map.get(String(session.participantCharacterIds[0]));
      if (c && c.avatar) src = c.avatar;
    }

    const overlay = document.createElement('div');
    overlay.id = 'yd-chat-avatar-modal';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content yd-chat-avatar-modal" role="dialog" aria-modal="true">
        <div class="yd-chat-avatar-modal__body">
          <div class="yd-chat-avatar-modal__thumb">
            <img id="yd-chat-avatar-modal-img" src="${this.escapeHtml(src || fallbackSvg)}" alt="会话头像">
          </div>
        </div>
        <div class="yd-chat-avatar-modal__footer">
          <button type="button" class="yd-btn" id="yd-chat-avatar-modal-change">更换</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const imgEl = document.getElementById('yd-chat-avatar-modal-img');
    if (imgEl) {
      imgEl.onerror = () => {
        imgEl.src = fallbackSvg;
        imgEl.onerror = null;
      };
    }

    overlay.querySelector('#yd-chat-avatar-modal-change')?.addEventListener('click', () => {
      // 关闭当前预览弹窗，进入相册“选择会话头像”模式（相册图片存 IndexedDB）
      close();
      if (typeof Album !== 'undefined' && Album.openForSessionAvatar) {
        Album.openForSessionAvatar();
      } else {
        State.switchPage('page-album');
      }
    });
  },

  async _openSessionBackgroundModal() {
    if (!this.currentSessionId) return;
    const existing = document.getElementById('yd-chat-bg-modal');
    if (existing) existing.remove();

    // 当前聊天背景：会话级（若未设置则回落到旧的全局 chat_background）
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    const bg = session?.chatBackground ?? session?.chat_background ?? Storage.get('chat_background');
    let src = '';
    if (bg && typeof bg === 'string') {
      src = bg;
    } else if (bg && typeof bg === 'object' && bg.albumId) {
      try {
        const item = await Storage.dbGet('album', bg.albumId);
        if (item && item.data) src = item.data;
      } catch (e) {
        console.warn('读取聊天背景相册引用失败:', e);
      }
    }

    const overlay = document.createElement('div');
    overlay.id = 'yd-chat-bg-modal';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content yd-chat-bg-modal" role="dialog" aria-modal="true">
        <div class="yd-chat-bg-modal__body">
          <div class="yd-chat-bg-modal__frame">
            ${src ? `<img id="yd-chat-bg-modal-img" src="${this.escapeHtml(src)}" alt="聊天背景">` : '<div class="yd-chat-bg-modal__placeholder">暂无聊天背景</div>'}
          </div>
        </div>
        <div class="yd-chat-bg-modal__footer">
          <button type="button" class="yd-btn" id="yd-chat-bg-modal-change">更换</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector('#yd-chat-bg-modal-change')?.addEventListener('click', () => {
      // 先关闭弹窗，再跳转到相册“选择聊天背景”模式（沿用 IndexedDB 相册数据）
      close();
      if (typeof Album !== 'undefined' && Album.openForChatBackground) {
        Album.openForChatBackground();
      } else {
        State.switchPage('page-album');
      }
    });
  },

  // 从相册选择后，应用为当前会话头像（直接使用相册里的 Base64 数据，存到 IndexedDB sessions.avatar）
  async setSessionAvatarFromAlbum(item) {
    try {
      if (!this.currentSessionId || !item || !item.data) return;
      const session = await Storage.dbGet('sessions', this.currentSessionId);
      if (!session) return;
      session.avatar = item.data; // 直接存相册里的 Base64 图
      await Storage.dbPut('sessions', session);
      await this.renderChatList();
      await this._populateChatSettings(session);
      this._toast('会话头像已更换');
      // 返回聊天设置页，方便用户立刻看到效果
      State.switchPage('page-chat-settings');
    } catch (e) {
      console.error('设置会话头像失败:', e);
      alert('设置会话头像失败');
    }
  },

  // 从相册选择后，应用为聊天背景（使用已有 setChatBackground 逻辑，引用相册项）
  async setSessionChatBackgroundFromAlbumItem(item) {
    try {
      if (!this.currentSessionId || !item || !item.data || !item.id) return;
      const session = await Storage.dbGet('sessions', this.currentSessionId);
      if (!session) return;

      // 会话级保存：只存相册引用
      session.chatBackground = { albumId: item.id };
      await Storage.dbPut('sessions', session);
      this.currentSession = session;

      await this.loadChatBackground();
      this._toast('聊天背景已更换');
      // 返回聊天设置页或聊天页都可，这里回到聊天设置，方便继续设置
      State.switchPage('page-chat-settings');
    } catch (e) {
      console.error('设置聊天背景失败:', e);
      alert('设置聊天背景失败');
    }
  },

  _toast(text) {
    const msg = String(text || '').trim();
    if (!msg) return;
    const existing = document.getElementById('yd-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'yd-toast';
    el.className = 'yd-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    window.setTimeout(() => el.classList.add('yd-toast--show'), 10);
    window.setTimeout(() => {
      el.classList.remove('yd-toast--show');
      window.setTimeout(() => el.remove(), 250);
    }, 1600);
  },

  // 删除当前会话
  async deleteCurrentSession() {
    if (!this.currentSessionId) return;
    
    await Storage.dbDelete('sessions', this.currentSessionId);
    
    // 删除该会话的所有消息
    const allMessages = await Storage.dbGetAll('messages');
    for (const msg of allMessages) {
      if (msg.sessionId === this.currentSessionId) {
        await Storage.dbDelete('messages', msg.id);
      }
    }
    
    // 返回聊天列表
    State.switchPage('page-chat-list');
    this.renderChatList();
  },

  // Insert a proactive push message into chat history (dedupe by taskId).
  async insertProactivePushMessage(payload) {
    const sessionId = String(payload?.sessionId || '').trim();
    if (!sessionId || !payload.taskId) return false;
    const bodyRaw = String(payload?.body || '').trim();
    // 主动消息回显：若不是协议行，自动包成 [消息]，避免被当作普通正文渲染。
    const body = (() => {
      if (!bodyRaw) return '';
      if (/^\[[^\]]+\]/.test(bodyRaw)) return bodyRaw;
      return `[消息]${bodyRaw}`;
    })();
    if (!body) return false;
    const taskId = String(payload?.taskId || '').trim();
    const msgId = taskId ? `push_${taskId}` : `push_${State.generateId()}`;

    // Dedupe
    try {
      const existed = await Storage.dbGet('messages', msgId);
      if (existed) return true;
    } catch (e) {}

    // Ensure the session exists
    let sess = null;
    try { sess = await Storage.dbGet('sessions', sessionId); } catch (e) {}
    if (!sess) return false;

    const deliveredAt = Date.now();
    const now = Number(payload.dueAt) || deliveredAt;
    const msgMode = (sess && sess.mode != null) ? (Number(sess.mode) === 1 ? 1 : 0) : 0;
    const participantIds = Array.isArray(sess?.participantCharacterIds)
      ? sess.participantCharacterIds.filter(Boolean)
      : [];
    const participantNames = Array.isArray(sess?.participantCharacterNames)
      ? sess.participantCharacterNames.filter(Boolean)
      : [];
    const fallbackCharacterId = participantIds.length ? String(participantIds[0]) : null;
    const fallbackCharacterName = participantNames.length ? String(participantNames[0]) : null;
    let normalizedBody = body;
    // 群聊里若是单聊协议 [消息]，自动补成 [消息|角色名] 便于正常按角色气泡渲染。
    if (participantIds.length > 1 && (payload.characterName || fallbackCharacterName)) {
      const m = normalizedBody.match(/^\[消息\](.*)$/);
      if (m) normalizedBody = `[消息|${payload.characterName || fallbackCharacterName}]${String(m[1] || '')}`;
    }
    const assistantMsg = {
      id: msgId,
      sessionId,
      role: 'assistant',
      content: normalizedBody,
      createdAt: now,
      mode: msgMode,
      _proactivePush: true,
      deliveredAt,
      characterId: payload.characterId || fallbackCharacterId,
      characterName: payload.characterName || fallbackCharacterName
    };

    try {
      await Storage.dbAdd('messages', assistantMsg);
    } catch (e) {
      if (await Storage.dbGet('messages', msgId)) return true;
      return false;
    }

    try {
      sess.updatedAt = Math.max(Number(sess.updatedAt)||0, now);
      await Storage.dbPut('sessions', sess);
    } catch (e) {}

    // If currently viewing this session, update UI immediately
    try {
      const viewing = String(this.currentSessionId || '') === sessionId && State.currentPage === 'page-chat';
      await this._increaseSessionUnreadIfNeeded(sessionId, viewing);
      if (viewing) {
        this._forceFullRenderNext = true;
        await this.loadMessages();
      } else {
        const sessionTitle = String(sess?.title || '').trim();
        this._enqueueChatIncomingNotification(sessionTitle, normalizedBody);
      }
      this._scheduleChatListRefresh();
    } catch (e) {}

    return true;
  },

  _enqueueChatIncomingNotification(sessionTitle, rawText) {
    const title = String(sessionTitle || '').trim();
    if (!title) return;
    if (typeof Notifications === 'undefined' || !Notifications || typeof Notifications.enqueue !== 'function') return;
    const rawChunk = String(rawText || '').trim();
    if (!rawChunk) return;
    const isSuggestedReplyLine = (line) => /^\[建议回复(?:\|[^\]]+)?\]/.test(String(line || '').trim());
    let preview = rawChunk
      .split('\n')
      .map(x => String(x || '').trim())
      .filter((line) => !!line && !isSuggestedReplyLine(line))
      .find(Boolean) || '';
    let messageType = '';
    const msgMatch = preview.match(/^\[消息(?:\|[^\]]+)?\](.+)$/);
    if (msgMatch) {
      messageType = 'message';
      preview = String(msgMatch[1] || '').trim();
    }
    // 兜底：如果仍是建议回复行（例如被包在 [消息] 里），直接不推送
    if (isSuggestedReplyLine(preview)) preview = '';
    if (!preview) return;
    Notifications.enqueue('聊天', title, preview, 0, messageType);
  },
  
  // 加载消息
  async loadMessages() {
    const allMessages = await Storage.dbGetAll('messages');
    const full = allMessages
      .filter(msg => msg.sessionId === this.currentSessionId)
      .sort((a, b) => a.createdAt - b.createdAt);
    const togetherMarker = '[分享]音乐|一起听|邀请|';
    const togetherRowsInRaw = full.filter((m) => {
      const t = String(m?.content || '');
      return t.includes(togetherMarker);
    });
    this._debugTogether('load-raw', {
      sessionId: String(this.currentSessionId || ''),
      fullCount: full.length,
      togetherRawCount: togetherRowsInRaw.length,
      togetherRawIds: togetherRowsInRaw.map(x => String(x?.id || ''))
    });

    // 模式段落显示：只展示当前 mode 的消息；线下视图边界前仅隐藏线上，历史线下气泡仍参与渲染/分页。
    const session = this.currentSession || await Storage.dbGet('sessions', this.currentSessionId);
    try {
      this._sessionUserDisplayName = await this._resolveUserDisplayNameForApi(session);
    } catch (eMaskName) {
      this._sessionUserDisplayName = '用户';
    }
    const currentMode = session && session.mode != null
      ? (Number(session.mode) === 1 ? 1 : 0)
      : this._getCurrentSessionMode();

    if (currentMode === 1) {
      try {
        const repaired = await this._repairMislabeledOfflineModesInSession(this.currentSessionId);
        if (repaired) {
          const allMessages2 = await Storage.dbGetAll('messages');
          full = allMessages2
            .filter(msg => msg.sessionId === this.currentSessionId)
            .sort((a, b) => a.createdAt - b.createdAt);
        }
      } catch (eRepair) {}
    }

    let filteredFull = full.filter((m) =>
      this._shouldShowMessageInCurrentMode(m, session, currentMode)
    );
    this._debugTogether('after-mode-filter', {
      currentMode,
      filteredCount: filteredFull.length,
      togetherCountInFiltered: filteredFull.filter(x => String(x?.content || '').includes(togetherMarker)).length
    });

    // 数据核对：若原始 messages 里存在“一起听分享”但被过滤掉（例如历史 mode 异常），
    // 在线上会话中强制补回，避免“库里有值、聊天里不显示”。
    if (currentMode === 0 && togetherRowsInRaw.length) {
      const shownIds = new Set(filteredFull.map(m => String(m?.id || '')));
      const missingTogetherRows = togetherRowsInRaw.filter((m) => !shownIds.has(String(m?.id || '')));
      if (missingTogetherRows.length) {
        filteredFull = filteredFull.concat(missingTogetherRows).sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
      }
      try {
        const debugRows = togetherRowsInRaw.map((m) => ({
          id: String(m?.id || ''),
          sessionId: String(m?.sessionId || ''),
          role: String(m?.role || ''),
          mode: m?.mode != null ? Number(m.mode) : null,
          createdAt: Number(m?.createdAt || 0) || 0,
          content: String(m?.content || '')
        }));
        this._lastTogetherRawRowsDebug = debugRows;
        console.info('[chat][together][raw-check]', {
          currentSessionId: String(this.currentSessionId || ''),
          currentMode,
          rawCount: togetherRowsInRaw.length,
          renderCount: filteredFull.filter((m) => String(m?.content || '').includes(togetherMarker)).length,
          rows: debugRows
        });
      } catch (e) {}
    }

    let total = filteredFull.length;
    const pageSize = Math.max(1, parseInt(this._pageSize, 10) || 30);
    let pageStart = Math.max(0, total - pageSize);
    this._sessionAllMessages = filteredFull;
    this._sessionPageStart = pageStart;
    this._hasMoreHistory = this._sessionPageStart > 0;
    this.messages = filteredFull.slice(this._sessionPageStart);
    if (currentMode === 0 && togetherRowsInRaw.length) {
      const shownIds = new Set(this.messages.map(m => String(m?.id || '')));
      const missingInPage = togetherRowsInRaw.filter((m) => !shownIds.has(String(m?.id || '')));
      if (missingInPage.length) {
        this.messages = this.messages.concat(missingInPage)
          .sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
        // 防止增量渲染跳过“插入到中间”的一起听卡片
        this._forceFullRenderNext = true;
      }
      this._debugTogether('after-page-merge', {
        pageCount: this.messages.length,
        missingInPageCount: missingInPage.length,
        forceFullRender: !!this._forceFullRenderNext,
        togetherCountInPage: this.messages.filter(x => String(x?.content || '').includes(togetherMarker)).length
      });
    }
    
    // 兼容旧数据/历史遗留：如果 messages 表里曾经写入过 _pending，需要先清理，
    // 否则 historyForApi 会把这些历史 user 消息过滤掉，造成请求体缺失 user 历史。
    // 这里先全部去除 _pending，再仅对“末尾连续 user”重新打回 pending（作为待 flush 队列）。
    for (const m of this._sessionAllMessages) {
      if (!m || !m._pending) continue;
      delete m._pending;
      try {
        const row = await Storage.dbGet('messages', m.id);
        if (row && row._pending) {
          const next = { ...row };
          delete next._pending;
          await Storage.dbPut('messages', next);
        }
      } catch (e) {}
    }
    
    // 恢复待发送队列：末尾连续的用户消息（后无 AI 回复）视为未真实发送
    const pendingIds = [];
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i] && (this.messages[i]._localOnly || this.messages[i].role === 'memory')) continue;
      if (this.messages[i].role !== 'user') break;
      pendingIds.unshift(this.messages[i].id);
    }
    this._pendingUserQueue = pendingIds;
    this.messages.forEach(m => {
      if (m && pendingIds.includes(m.id)) m._pending = true;
    });

    try {
      const packed = await this._buildDynamicPackedHistoryForApi({
        session,
        currentMode,
        pendingSet: new Set()
      });
      this.messages = this._composeDisplayMessagesWithDynamicMemoryCards(this.messages, packed, currentMode);
    } catch (e) {}
    
    await this._ensureSparkExpiredNoticeOnEntry();
    try {
      const sid = String(this.currentSessionId || '');
      const cleanedReceipt = await this._cleanupUserToCharacterMoneyReceipts(this._sessionAllMessages, sid);
      if (cleanedReceipt) this._forceFullRenderNext = true;
      const cleanedCharReceipt = await this._cleanupCharacterToUserMoneyReceipts(this._sessionAllMessages, sid);
      if (cleanedCharReceipt) this._forceFullRenderNext = true;
      const migratedCollect = await this._migrateAllLegacyMoneyCollectNotices(this._sessionAllMessages, sid);
      if (migratedCollect) this._forceFullRenderNext = true;
      const plainCollect = await this._migrateLegacyMoneyCollectNoticesToPlain(this._sessionAllMessages, sid);
      if (plainCollect) this._forceFullRenderNext = true;
      const dedupedCollect = await this._dedupeMoneyCollectNotices(this._sessionAllMessages, sid);
      if (dedupedCollect) this._forceFullRenderNext = true;
      const backfilledReceipt = await this._backfillMoneyReceiptPairs(this._sessionAllMessages, sid);
      if (backfilledReceipt) this._forceFullRenderNext = true;
    } catch (eBackfill) {}
    await this.renderMessages();
    this.updateTitle();
    this._updateSendButtonState();
  },

  _plainStreamContentHash(s) {
    const str = String(s ?? '');
    const n = Math.min(str.length, 4000);
    let h = 5381;
    for (let i = 0; i < n; i++) h = Math.imul(h, 33) ^ str.charCodeAt(i);
    return `${str.length}:${h >>> 0}`;
  },

  _plainStreamCacheKey(msg, segmentIndex, text) {
    const sid = String(this.currentSessionId || '');
    const mid = msg && msg.id != null ? String(msg.id) : '';
    return `${sid}:${mid}:${segmentIndex}:${this._plainStreamContentHash(text)}`;
  },

  /**
   * 线上模式：若模型误输出独立成行的 API 时间戳格式，渲染时去掉（不入库修改）。
   * 匹配整行： [YYYY-MM-DD HH:MM]
   */
  _stripOnlineApiTimestampEchoFromDisplay(text) {
    const lineRe = /^\s*\[\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\]\s*$/;
    const lines = String(text || '').split('\n');
    const out = lines.filter((line) => !lineRe.test(String(line || '').trim()));
    return out.join('\n').trim();
  },

  // 非语音协议中若混入语气词标签（如 (chuckle)），在入库前剔除标签本体（含括号）。
  _stripVoiceMoodTagsFromNonVoiceMessage(text) {
    const raw = String(text || '');
    if (!raw) return '';
    const tags = [
      'laughs', 'chuckle', 'coughs', 'clear-throat', 'groans',
      'breath', 'pant', 'inhale', 'exhale', 'gasps',
      'sniffs', 'sighs', 'snorts', 'burps', 'lip-smacking',
      'humming', 'hissing', 'emm', 'sneezes'
    ];
    const tagSet = new Set(tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean));
    // 匹配“(xxx)”：只处理英文/连字符，避免误伤中文括号或正常标点括号
    const anyMoodTokenRe = /\(([a-z][a-z-]{0,32})\)/gi;
    const lines = raw.split('\n');
    const cleaned = lines.map((line) => {
      const m = String(line || '').match(/^(\[[^\]]+\])(.*)$/);
      if (!m) return line;
      const head = String(m[1] || '');
      const body = String(m[2] || '');
      const headInner = head.slice(1, -1);
      const msgType = String(headInner.split('|')[0] || '').trim();
      // [语音]：仅允许白名单语气词；其余“自造标签”剔除
      if (msgType === '语音') {
        const nextBody = body
          .replace(anyMoodTokenRe, (full, inner) => {
            const key = String(inner || '').trim().toLowerCase();
            return tagSet.has(key) ? `(${key})` : '';
          })
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (!nextBody) return '';
        return `${head}${nextBody}`;
      }
      // 其它协议：全部剔除语气词标签（含白名单/非白名单），避免污染正文
      const nextBody = body.replace(anyMoodTokenRe, '').replace(/\s{2,}/g, ' ').trim();
      if (!nextBody) return '';
      return `${head}${nextBody}`;
    }).filter((x) => String(x || '').trim());
    return cleaned.join('\n').trim();
  },

  /** 正文展示：连续换行（1 行或多行）统一为段间空一行（实际为 \n\n，pre-wrap 下可见空白行） */
  _formatMessageLineBreaksForDisplay(raw) {
    let s = SCUI.normalizeMath(raw);
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s = s.replace(/\n+/g, '\n\n');
    return s;
  },

  /**
   * 助手 plain：Markdown + 双引号美化 + .yd-message__plain--md（会话正文字色依赖 --md）。
   * 非流式整段与仿流式「当前前缀」共用；raw 须为 segment 原文，勿用 _formatMessageLineBreaksForDisplay。
   */
  _applyAssistantPlainMarkdownHtml(plainEl, raw) {
    if (!plainEl) return;
    const s = String(raw ?? '');
    if (typeof MarkdownPlain !== 'undefined' && typeof MarkdownPlain.renderAssistantPlainMarkdown === 'function') {
      plainEl.className = 'yd-message__plain yd-message__plain--md';
      plainEl.style.whiteSpace = 'normal';
      try {
        const { html } = MarkdownPlain.renderAssistantPlainMarkdown(s);
        plainEl.innerHTML = html || '';
      } catch (e) {
        plainEl.className = 'yd-message__plain';
        plainEl.style.whiteSpace = 'pre-wrap';
        plainEl.textContent = this._formatMessageLineBreaksForDisplay(s);
      }
    } else {
      plainEl.className = 'yd-message__plain';
      plainEl.style.whiteSpace = 'pre-wrap';
      plainEl.textContent = this._formatMessageLineBreaksForDisplay(s);
    }
  },

  /** plain 正文：入队后按顺序仿流式（多段不会同时打字） */
  _startPlainTextStreamReveal(plainEl, streamKey, rawForMd) {
    if (!this._plainStreamRevealQueue) this._plainStreamRevealQueue = [];
    this._plainStreamRevealQueue.push({
      plainEl,
      streamKey: streamKey || '',
      rawForMd: String(rawForMd ?? '')
    });
    this._kickPlainStreamRevealPump();
  },

  _kickPlainStreamRevealPump() {
    if (this._plainStreamPumpRunning) return;
    if (!this._plainStreamRevealQueue || !this._plainStreamRevealQueue.length) return;
    this._plainStreamPumpRunning = true;
    const drain = async () => {
      const q = this._plainStreamRevealQueue;
      try {
        while (q && q.length) {
          const job = q.shift();
          await this._runPlainTextStreamRevealJob(job);
        }
      } catch (e) {
      } finally {
        this._plainStreamPumpRunning = false;
      }
      if (this._plainStreamRevealQueue && this._plainStreamRevealQueue.length) {
        this._kickPlainStreamRevealPump();
      }
    };
    queueMicrotask(() => drain().catch(() => { this._plainStreamPumpRunning = false; }));
  },

  _runPlainTextStreamRevealJob(job) {
    const plainEl = job?.plainEl;
    const streamKey = job?.streamKey || '';
    const rawForMd = job?.rawForMd != null ? String(job.rawForMd) : '';
    if (!plainEl) return Promise.resolve();
    if (!plainEl.isConnected) return Promise.resolve();
    if (!streamKey) {
      this._applyAssistantPlainMarkdownHtml(plainEl, rawForMd);
      return Promise.resolve();
    }
    if (this._plainStreamDoneKeys.has(streamKey)) {
      this._applyAssistantPlainMarkdownHtml(plainEl, rawForMd);
      return Promise.resolve();
    }
    const units = [...rawForMd];
    if (!units.length) {
      this._applyAssistantPlainMarkdownHtml(plainEl, '');
      return Promise.resolve();
    }
    const targetMs = Math.min(10000, Math.max(250, units.length * 16));
    const cps = Math.max(20, Math.min(72, (units.length / targetMs) * 1000));
    return new Promise((resolve) => {
      let idx = 0;
      let acc = 0;
      let last = -1;
      const tick = (now) => {
        if (!plainEl.isConnected) {
          resolve();
          return;
        }
        if (last < 0) last = now;
        acc += ((now - last) / 1000) * cps;
        last = now;
        const next = Math.min(units.length, Math.floor(acc));
        if (next > idx) {
          idx = next;
          const prefix = units.slice(0, idx).join('');
          this._applyAssistantPlainMarkdownHtml(plainEl, prefix);
        }
        if (idx >= units.length) {
          this._plainStreamDoneKeys.add(streamKey);
          try {
            const container = this._getChatScrollContainer && this._getChatScrollContainer();
            if (container && this._isNearBottom(container, this._getChatNearBottomThresholdPx())) {
              this._scrollChatToBottom();
            }
          } catch (e) {}
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  },

  _sparkCalendarDayKey(ts) {
    const d = new Date(Number(ts) || 0);
    if (!Number.isFinite(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dd}`;
  },

  _sparkCalendarDaysBetween(earlierKey, laterKey) {
    if (!earlierKey || !laterKey) return 0;
    const a = new Date(`${earlierKey}T12:00:00`);
    const b = new Date(`${laterKey}T12:00:00`);
    if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0;
    return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  },

  _isSparkStreakEligibleMessage(m) {
    if (!m) return false;
    if (m._sparkNotice) return false;
    if (m.role === 'memory') return false;
    if (m._localOnly) return false;
    if (m.role !== 'user' && m.role !== 'assistant') return false;
    return true;
  },

  _isSparkBroken(messageList = null) {
    const list = messageList != null ? messageList : this._sessionAllMessages;
    const lastKey = this._getSparkLastActivityDayKeyExcluding(list, new Set());
    const todayKey = this._sparkCalendarDayKey(Date.now());
    if (!lastKey || !todayKey) return false;
    return this._sparkCalendarDaysBetween(lastKey, todayKey) >= 2;
  },

  _getSparkNoticeText(kind, days = 1) {
    const d = Math.max(1, Number(days) || 1);
    if (kind === 'renew') return `🔥 续火花成功！已连续互动 ${d} 天`;
    if (kind === 'light') return `🔥 火花已点亮！已连续互动 ${d} 天`;
    return '🔥 火花已熄灭：已超过 1 天未互动，连续聊天天数已中断。发消息即可重新续火花。';
  },

  async _insertSparkNoticeMessage({ sessionId, kind, text, dedupeId } = {}) {
    const sid = String(sessionId || this.currentSessionId || '').trim();
    const body = String(text || '').trim();
    if (!sid || !body) return null;
    const id = String(dedupeId || `spark_${State.generateId()}`).trim();
    try {
      const existed = await Storage.dbGet('messages', id);
      if (existed) return null;
    } catch (e) {}

    let sess = null;
    try {
      sess = await Storage.dbGet('sessions', sid);
    } catch (e2) {}
    if (!sess) return null;

    const msgMode = sess.mode != null ? (Number(sess.mode) === 1 ? 1 : 0) : this._getCurrentSessionMode();
    const now = Date.now();
    const msg = {
      id,
      sessionId: sid,
      role: 'system',
      content: body,
      createdAt: now,
      mode: msgMode,
      _sparkNotice: true,
      _sparkNoticeKind: String(kind || 'expired')
    };

    try {
      await Storage.dbAdd('messages', msg);
    } catch (e3) {
      return null;
    }

    try {
      sess.updatedAt = now;
      await Storage.dbPut('sessions', sess);
    } catch (e4) {}

    return msg;
  },

  _mergeSparkNoticeIntoSessionLists(msg) {
    if (!msg || !msg._sparkNotice) return;
    if (Array.isArray(this._sessionAllMessages)) {
      const exists = this._sessionAllMessages.some((m) => String(m?.id || '') === String(msg.id || ''));
      if (!exists) {
        this._sessionAllMessages.push(msg);
        this._sessionAllMessages.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      }
    }
    if (Array.isArray(this.messages)) {
      const exists = this.messages.some((m) => String(m?.id || '') === String(msg.id || ''));
      if (!exists) {
        this.messages.push(msg);
        this.messages.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
      }
    }
  },

  async _ensureSparkExpiredNoticeOnEntry() {
    if (!this._isSparkBroken()) return;
    const sessionId = String(this.currentSessionId || '').trim();
    const lastKey = this._getSparkLastActivityDayKeyExcluding(this._sessionAllMessages, new Set());
    if (!sessionId || !lastKey) return;
    const msg = await this._insertSparkNoticeMessage({
      sessionId,
      kind: 'expired',
      text: this._getSparkNoticeText('expired'),
      dedupeId: `spark_${sessionId}_expired_${lastKey}`
    });
    if (msg) this._mergeSparkNoticeIntoSessionLists(msg);
  },

  _getLatestSparkNoticeText(sessionId) {
    const sid = String(sessionId || this.currentSessionId || '').trim();
    if (!sid) return '';
    const list = this._getSparkStreakSourceMessages();
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (!m || !m._sparkNotice) continue;
      if (String(m.sessionId || '') !== sid) continue;
      const t = String(m.content || '').trim();
      if (t) return t;
    }
    return '';
  },

  _buildSparkContextSystemForApi(sessionId) {
    const streak = this._computeStreakDays();
    const broken = this._isSparkBroken();
    const recent = this._getLatestSparkNoticeText(sessionId);
    const lines = [
      '【当前会话火花状态】',
      `标题旁连续天数：${streak}（${broken ? '已中断，用户需重新发言续火' : '维持中'}）。`,
    ];
    if (recent) {
      lines.push(`最近聊天内系统提示（勿复读原文，仅作语境）：${recent}`);
    }
    return lines.join('\n');
  },

  _getSparkLastActivityDayKeyExcluding(messageList, excludeIdSet) {
    const ex = excludeIdSet && typeof excludeIdSet.has === 'function' ? excludeIdSet : new Set();
    let bestTs = 0;
    const arr = Array.isArray(messageList) ? messageList : [];
    for (const m of arr) {
      if (!this._isSparkStreakEligibleMessage(m)) continue;
      const id = m.id != null ? String(m.id) : '';
      if (id && ex.has(id)) continue;
      const t = Number(m.createdAt || 0) || 0;
      if (t > bestTs) bestTs = t;
    }
    if (!bestTs) return null;
    return this._sparkCalendarDayKey(bestTs);
  },

  _getSparkStreakSourceMessages() {
    const base = Array.isArray(this._sessionAllMessages) ? this._sessionAllMessages : [];
    const page = Array.isArray(this.messages) ? this.messages : [];
    if (!page.length) return base.slice();
    const map = new Map();
    for (const m of base) {
      if (m && m.id != null) map.set(String(m.id), m);
    }
    for (const m of page) {
      if (m && m.id != null) map.set(String(m.id), m);
    }
    return Array.from(map.values()).sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  },

  _computeStreakDaysFromMessageList(msgs) {
    const list = Array.isArray(msgs) ? msgs : [];
    const oneDay = 24 * 60 * 60 * 1000;
    const daySet = new Set();
    list.forEach((m) => {
      const key = this._sparkCalendarDayKey(m.createdAt);
      if (key) daySet.add(key);
    });
    const days = Array.from(daySet);
    if (!days.length) return 0;
    days.sort();
    let streak = 1;
    let lastDate = new Date(`${days[days.length - 1]}T12:00:00`);
    for (let i = days.length - 2; i >= 0; i--) {
      const d = new Date(`${days[i]}T12:00:00`);
      const diff = Math.round((lastDate.getTime() - d.getTime()) / oneDay);
      if (diff === 1) {
        streak += 1;
        lastDate = d;
      } else if (diff <= 0) {
        continue;
      } else {
        break;
      }
    }
    return streak;
  },

  // 渲染消息
  async renderMessages() {
    const scroll = document.getElementById('chat-scroll');
    if (!scroll) return;
    const chatPage = document.getElementById('page-chat');
    const isChatPageActive = !!(chatPage && chatPage.classList.contains('yd-page--active'));

    const container = this._getChatScrollContainer();
    const prevTopRaw = container ? container.scrollTop : 0;
    // “是否接近底部”阈值不应固定：不同设备/输入栏高度会导致固定 48px 有时不够，
    // 保存编辑/加载更多后如果不贴到底，就会出现“底部最低几条被输入框遮住”的问题。
    const nearBottomThreshold = this._getChatNearBottomThresholdPx();
    const wasNearBottom = this._isNearBottom(container, nearBottomThreshold);

    // 同一会话：尽量增量渲染，避免“全页面闪烁”
    const sid = String(this.currentSessionId || '');
    const prevSid = scroll.dataset.sessionId || '';
    const currentMode = (this.currentSession && this.currentSession.mode != null)
      ? (Number(this.currentSession.mode) === 1 ? '1' : '0')
      : '0';
    const prevMode = scroll.dataset.renderedMode || '';
    const prevCount = parseInt(scroll.dataset.renderedCount || '0', 10) || 0;
    const moneyNoticeMidInsert =
      !!this._forceFullRenderNext &&
      !!this._moneyCollectionNeedsRender &&
      prevCount > 0 &&
      (this.messages?.length || 0) > prevCount;
    const canIncremental =
      !this._forceFullRenderNext &&
      !moneyNoticeMidInsert &&
      prevSid === sid &&
      prevMode === currentMode &&
      prevCount >= 0 &&
      prevCount <= (this.messages?.length || 0) &&
      scroll.childElementCount > 0;

    // 全量渲染时先离屏构建，避免“先清空→再出现”的闪烁
    const offscreen = canIncremental ? null : document.createDocumentFragment();
    const appendTo = (node) => {
      (canIncremental ? scroll : offscreen).appendChild(node);
    };

    if (!canIncremental) {
      // 顶部“更多消息”按钮：只有滚到顶部且还有历史时显示
      if (this._hasMoreHistory) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.type = 'button';
        loadMoreBtn.id = 'yd-chat-load-more';
        loadMoreBtn.className = 'yd-btn yd-btn--secondary';
        loadMoreBtn.style.width = '100%';
        loadMoreBtn.style.margin = '6px 0 10px';
        loadMoreBtn.textContent = '更多消息';
        loadMoreBtn.hidden = true;
        loadMoreBtn.addEventListener('click', async () => {
          loadMoreBtn.disabled = true;
          try { await this.loadMoreMessages(); } finally { loadMoreBtn.disabled = false; }
        });
        appendTo(loadMoreBtn);
      }
    }

    const session = this.currentSession;
    const characterMap = await this.getCharacterMap();
    // 订单支付状态：用于渲染分享/代付回显卡片的右上角状态
    let takeoutOrders = [];
    let shopOrders = [];
    try {
      takeoutOrders = (await Storage.kvGet('takeout_orders_v1')) || [];
    } catch (e) {}
    try {
      shopOrders = (await Storage.kvGet('shop_orders_v1')) || [];
    } catch (e) {}
    const takeoutOrderMap = new Map(
      (Array.isArray(takeoutOrders) ? takeoutOrders : []).map(o => [String(o?.id || ''), o]).filter(([id]) => id)
    );
    const shopOrderMap = new Map(
      (Array.isArray(shopOrders) ? shopOrders : []).map(o => [String(o?.id || ''), o]).filter(([id]) => id)
    );
    // 我的头像：优先会话面具，其次默认面具；若都没有头像则使用默认“我”
    const effMaskForMe = await this._getEffectiveMaskForSession(session);
    const participantCharacters = (() => {
      const ids = Array.isArray(session?.participantCharacterIds)
        ? session.participantCharacterIds.filter(Boolean)
        : [];
      return ids.map((id) => characterMap.get(String(id))).filter(Boolean);
    })();
    const normalizeRoleName = (name) => String(name || '').trim().replace(/\s+/g, '');
    const participantByNormName = new Map();
    participantCharacters.forEach((c) => {
      const key = normalizeRoleName(c?.name || '');
      if (key && !participantByNormName.has(key)) participantByNormName.set(key, c);
    });
    let lastSpeakerKey = null;

    const startIdx = canIncremental ? prevCount : 0;
    const msgsToRender = this.messages.slice(startIdx);
    msgsToRender.forEach((msg, localIdx) => {
      const rawContentForDebug = String(msg?.content || '');
      const hasTogetherMarker = rawContentForDebug.includes('[分享]音乐|一起听|邀请|');
      if (hasTogetherMarker) {
        this._debugTogether('render-msg-hit', {
          msgId: String(msg?.id || ''),
          role: String(msg?.role || ''),
          mode: msg?.mode != null ? Number(msg.mode) : null,
          localIdx,
          startIdx
        });
      }
      if (msg && msg._sparkNotice) {
        const kind = String(msg._sparkNoticeKind || 'expired');
        const row = document.createElement('div');
        row.className = 'yd-chat-spark-notice-row';
        row.dataset.msgId = String(msg.id || '');
        const el = document.createElement('div');
        el.className = `yd-chat-spark-notice yd-chat-spark-notice--${kind === 'renew' || kind === 'light' ? kind : 'expired'}`;
        el.textContent = String(msg.content || '').trim();
        row.appendChild(el);
        appendTo(row);
        return;
      }
      if (msg && msg.role === 'memory') {
        const el = document.createElement('div');
        el.className = 'yd-message--memory';
        el.dataset.msgId = String(msg.id || '');
        el.style.whiteSpace = 'pre-wrap';
        const memoryText = String(msg.content || '').trim() || '';
        el.textContent = memoryText;
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.title = '点击查看全部';
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._openMemoryDetailModal(memoryText);
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            this._openMemoryDetailModal(memoryText);
          }
        });
        appendTo(el);
        return;
      }
      const isUser = msg.role === 'user';

      // 说话人基础 key（后面会拼上内容类型，便于在 html 消息处“断开”分组）
      let baseSpeakerKey = isUser ? 'user' : 'assistant';
      if (!isUser) {
        if (msg.characterId) baseSpeakerKey = `assistant:${msg.characterId}`;
        else if (msg.characterName) baseSpeakerKey = `assistant:${msg.characterName}`;
      }

      // 关联消息对应的角色（仅助手消息需要）
      let relatedCharacter = null;
      if (!isUser) {
        if (msg.characterId && characterMap.has(msg.characterId)) {
          relatedCharacter = characterMap.get(String(msg.characterId));
        } else if (session && Array.isArray(session.participantCharacterIds)) {
          const ids = session.participantCharacterIds.filter(Boolean);
          if (ids.length === 1 && characterMap.has(ids[0])) {
            relatedCharacter = characterMap.get(String(ids[0]));
          }
        }
      }

      // 文本内容处理流程（按“系统级 & HTML 优先”）：
      // 1) 应用系统级全局转换（GlobalRegexConverter）
      // 2) 识别“直接输出的 HTML 片段”（不执行 ```html 围栏代码块）
      // 3) 对纯文本段解析系统级消息类型（[消息]、[图片]、[转账]等）
      // 4) 对“未被系统类型匹配”的普通正文（plain）再应用角色扩展正则
      let displayText = String(msg.content || '');
      if (isUser && msg && msg.replyTo) {
        const userBase = String(msg.content || '').trim();
        const userReplyTo = String(msg.replyTo || '').trim();
        const userStoredMode = msg && msg.mode != null ? (Number(msg.mode) === 1 ? 1 : 0) : 0;
        if (userBase && userReplyTo && !/^\[(消息|对白|对话)(?:\|[^\]]+)?\]/.test(userBase)) {
          displayText =
            userStoredMode === 1
              ? `[对白]${userBase}|${userReplyTo}`
              : `[消息]${userBase}|${userReplyTo}`;
        }
      }

      const msgModeForUi = msg && msg.mode != null ? (Number(msg.mode) === 1 ? 1 : 0) : 0;
      if (!isUser && msgModeForUi === 0) {
        displayText = this._stripOnlineApiTimestampEchoFromDisplay(displayText);
      }

      // 调试：[css美化] + 换行问题跟踪（仅开发阶段使用）
      try {
        if (!isUser && typeof console !== 'undefined' && console.debug && /\[css美化\]|【css美化】/.test(displayText)) {
          console.debug('[chat][css-beautify] raw content', {
            msgId: msg?.id,
            raw: String(msg.content || ''),
            rawVisibleNewlines: String(msg.content || '').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
          });
        }
      } catch (e) {}

      // 步骤1：系统级全局正则转换（最高优先级）
      if (typeof GlobalRegexConverter !== 'undefined') {
        displayText = GlobalRegexConverter.apply(displayText);
      }

      try {
        if (!isUser && typeof console !== 'undefined' && console.debug && /\[css美化\]|【css美化】/.test(displayText)) {
          console.debug('[chat][css-beautify] after GlobalRegexConverter', {
            msgId: msg?.id,
            afterGlobal: String(displayText || ''),
            afterGlobalVisibleNewlines: String(displayText || '').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
          });
        }
      } catch (e) {}

      // 一些模型/角色扩展会把换行以字面量 "\\n" 输出（而不是实际换行）。
      // 这会导致 [css美化] + ```css 围栏提取/隐藏失败，从而出现「卡片 + 下方整块代码」分离。
      // 仅在“助手消息且疑似包含围栏/协议”时做轻量规范化，避免误伤普通文本里的转义串。
      try {
        if (!isUser) {
          const s0 = String(displayText || '');
          if ((s0.includes('[css美化]') || s0.includes('【css美化】') || s0.includes('```')) && s0.includes('\\n')) {
            displayText = s0.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
          }
        }
      } catch (e) {}

      // CSS fenced code 检测：
      // 把 ```css ... ``` 当作“新增气泡预设的 customCss”，静默自动应用到页面（全局替换）。
      try {
        const isAssistant = !isUser;
        const msgId = String(msg?.id ?? '');
        const hasAnyFence = /```/.test(String(displayText || ''));
        if (isAssistant && msgId && hasAnyFence) {
          // 懒加载：已应用的 msgId 集合（避免反复覆盖）
          if (!this._cssFenceAppliedMsgIds) this._cssFenceAppliedMsgIds = new Set();

          // 从 Storage 恢复（只在集合为空时尝试恢复，避免重复 JSON parse）
          if (this._cssFenceAppliedMsgIds.size === 0) {
            try {
              const raw = (typeof Storage !== 'undefined' && typeof Storage.get === 'function')
                ? Storage.get('yd_css_fence_applied_msg_ids')
                : null;
              const arr = raw ? JSON.parse(String(raw)) : [];
              if (Array.isArray(arr)) {
                arr.forEach((x) => {
                  const id = String(x ?? '').trim();
                  if (id) this._cssFenceAppliedMsgIds.add(id);
                });
              }
            } catch (e) {}
          }

          // 提取 fenced 代码块内容（优先 ```css```，否则取第一个 ```...```），
          // 并在存在 [css美化] 时把 fenced 内容从正文隐藏，改为在卡片里展开查看。
          let cssText = '';
          let cssTitle = '';
          let hasCssBeautifyTag = false;
          let extractedBy = ''; // 'css' | 'any' | ''
          try {
            // 1) [css美化] 行与 ``` 代码围栏之间多空行时，解析/隐藏容易错位；先压成「单行间隔」
            let s = String(displayText || '');
            s = s
              .replace(/(\[css美化\][^\n\r]*)\n{2,}(```)/gi, '$1\n$2')
              .replace(/(【css美化】[^\n\r]*)\n{2,}(```)/gi, '$1\n$2');
            // 标题建议格式（放在代码块前一行）：
            // [css美化]梦幻独角兽（晨雾粉蓝）+ 极光紫（紫粉）
            // 兼容：单独一行 [css美化]，下一行才是标题
            const titleSameLine =
              s.match(/^\s*\[css美化\]\s*(.+)\s*$/mi) ||
              s.match(/^\s*【css美化】\s*(.+)\s*$/mi);
            if (titleSameLine && String(titleSameLine[1] || '').trim()) {
              cssTitle = String(titleSameLine[1] || '').trim();
              hasCssBeautifyTag = true;
            } else {
              const titleNextLine =
                s.match(/\[css美化\]\s*(?:\r?\n)\s*([^\r\n]+?)(?=\r?\n|$)/i) ||
                s.match(/【css美化】\s*(?:\r?\n)\s*([^\r\n]+?)(?=\r?\n|$)/i);
              if (titleNextLine && String(titleNextLine[1] || '').trim()) {
                cssTitle = String(titleNextLine[1] || '').trim();
                hasCssBeautifyTag = true;
              }
            }
            // 2) 优先提取 ```css ... ```（兼容 ``` css / ```CSS / CRLF；兼容 ```css 后不换行直接写内容）
            {
              const reCss = /```\s*css\b[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/ig;
              let m;
              const parts = [];
              while ((m = reCss.exec(s)) !== null) {
                const one = String(m[1] || '').trim();
                if (one) parts.push(one);
              }
              cssText = parts.join('\n').trim();
              if (cssText) extractedBy = 'css';
            }
            // 3) 兼容：模型忘记写 css 语言标识，只写 ``` ... ```
            if (!cssText) {
              const mm = s.match(/```\s*[a-zA-Z0-9_-]*[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/);
              if (mm && mm[1]) {
                cssText = String(mm[1]).trim();
                if (cssText) extractedBy = 'any';
              }
            }
            // 供后续从正文移除时使用已规范化的全文
            displayText = s;

            try {
              if (!isUser && typeof console !== 'undefined' && console.debug && hasCssBeautifyTag) {
                console.debug('[chat][css-beautify] extracted fenced css', {
                  msgId,
                  cssTitle,
                  extractedBy,
                  cssLen: cssText.length,
                  displayTextVisibleNewlines: String(displayText || '').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
                });
              }
            } catch (e) {}
          } catch (e) {}

          // 将解析出的 css 文本暂存到 msg 上，供 css_beautify 卡片渲染“展开查看”
          try {
            if (hasCssBeautifyTag && cssText) {
              msg._cssBeautifyCssText = cssText;
            }
          } catch (e) {}

          // 折叠体验：当存在 [css美化] 协议时，把 fenced CSS 从“正文显示层”移除，
          // 只在 css_beautify 卡片里通过 <details> 展开查看。
          try {
            if (hasCssBeautifyTag && cssText) {
              const s2 = String(displayText || '');
              // 优先移除 ```css``` 块；若是从 “任意 fenced” 提取，则移除第一个 fenced block
              if (extractedBy === 'css') {
                displayText = s2.replace(/```\s*css\b[\s\S]*?```/ig, '');
              } else if (extractedBy === 'any') {
                displayText = s2.replace(/```\s*[a-zA-Z0-9_-]*[\s\S]*?```/m, '');
              } else {
                displayText = s2;
              }
              displayText = String(displayText || '').replace(/\n{3,}/g, '\n\n').trim();
            }
          } catch (e) {}

          // 仅针对 [css美化] 标题行：把标题行后面的“段落空行”压成单换行，
          // 避免全局展示逻辑把它拉成空段，导致卡片/正文看起来被“隔开一块”。
          try {
            if (hasCssBeautifyTag) {
              displayText = String(displayText || '')
                .replace(/(\n(?:\s*\[css美化\][^\n\r]*|\s*【css美化】[^\n\r]*))\n\n+/gi, '$1\n');
            }
          } catch (e) {}

          // 静默检测：不弹窗。仅保留 debug 日志，方便排查。
          try {
            if (typeof console !== 'undefined' && console.debug) {
              console.debug('[chat] detected css fenced block in message', {
                msgId,
                role: msg?.role,
                cssLen: cssText ? String(cssText).length : 0,
                presetName: cssTitle || ''
              });
            }
          } catch (e) {}

          // 自动应用（只对该消息应用一次）：只要存在 [css美化] 且提取到 cssText
          if (!this._cssFenceAppliedMsgIds.has(msgId)) {
            const canApply =
              typeof BubbleSettings !== 'undefined' &&
              BubbleSettings &&
              typeof BubbleSettings.applyCustomCssAsNewPreset === 'function';
            if (canApply && cssText) {
              this._cssFenceAppliedMsgIds.add(msgId);
              try {
                if (typeof Storage !== 'undefined' && typeof Storage.set === 'function') {
                  const capped = Array.from(this._cssFenceAppliedMsgIds).slice(-200);
                  Storage.set('yd_css_fence_applied_msg_ids', JSON.stringify(capped));
                }
              } catch (e) {}

              const presetName = cssTitle
                ? cssTitle
                : ('AI 气泡预设 ' + (msgId ? String(msgId).slice(-6) : ''));
              try {
                // 不阻塞渲染：apply 内部会持久化到 IndexedDB 并立即更新 style
                BubbleSettings.applyCustomCssAsNewPreset(cssText, presetName).catch((err) => {
                  try {
                    this._cssFenceAppliedMsgIds.delete(msgId);
                    if (typeof Storage !== 'undefined' && typeof Storage.set === 'function') {
                      const capped = Array.from(this._cssFenceAppliedMsgIds).slice(-200);
                      Storage.set('yd_css_fence_applied_msg_ids', JSON.stringify(capped));
                    }
                  } catch (e) {}
                  try {
                    if (typeof console !== 'undefined' && console.error) {
                      console.error('[chat] auto apply css preset failed', err);
                    }
                  } catch (e) {}
                });
              } catch (e) {}
            }
          }
        }
      } catch (e) {}

      // 会话关闭「灵感回复」时：去掉助手消息里独立成行的 [建议回复]…，避免仍以纯文本出现在气泡里
      if (!isUser && !this._isSuggestedReplyEnabledGlobal()) {
        const s = String(displayText || '');
        displayText = s
          .split('\n')
          .filter((line) => !/^\s*\[建议回复(?:\|[^\]]+)?\]/.test(String(line || '')))
          .join('\n')
          .replace(/\n{3,}/g, '\n\n');
      }

      const isGroup = session && Array.isArray(session.participantCharacterIds) && session.participantCharacterIds.length > 1;
      const assistantRegexRules =
        (!isUser && relatedCharacter && relatedCharacter.extensions)
          ? this._collectRegexRules(relatedCharacter.extensions)
          : [];
      const allSegments = [];
      const togetherRawSegment = this._parseTogetherShareRawSegment(msg?.content);
      if (hasTogetherMarker) {
        this._debugTogether('parse-raw-segment', {
          msgId: String(msg?.id || ''),
          parsed: !!togetherRawSegment,
          shareStatus: togetherRawSegment?.shareStatus || ''
        });
      }
      const mixed = togetherRawSegment ? [] : this._parseMixedContent(displayText); // HTML 优先：先识别原生 HTML 片段
      if (togetherRawSegment) {
        allSegments.push(togetherRawSegment);
      }
      mixed.forEach(seg => {
        if (seg.type === 'html') {
          // HTML 段：直接作为独立 segment，不参与消息类型解析
          allSegments.push({
            ...seg,
            messageType: 'plain',
            messageStyle: 'plain',
            characterName: msg.characterName || null
          });
          return;
        }

        const textContent = String(seg.content || '');
        if (!textContent.trim()) return;
        // 先在整段文本上做角色正则，再交给 MessageParser 分段。
        // 这样可避免 MiPhone_start...MiPhone_end 这类跨段规则因先分段而失配。
        const textForParse =
          (!isUser && assistantRegexRules.length)
            ? this._applyRegexRules(textContent, assistantRegexRules)
            : textContent;
        const isRegexTransformedText =
          !isUser &&
          assistantRegexRules.length > 0 &&
          String(textForParse) !== String(textContent);

        let localMessages = [];
        if (typeof MessageParser !== 'undefined') {
          localMessages = MessageParser.parse(textForParse, isGroup);
        }
        if (
          !isUser &&
          MessageParser &&
          typeof MessageParser.mergeConsecutivePlain === 'function' &&
          localMessages &&
          localMessages.length
        ) {
          localMessages = MessageParser.mergeConsecutivePlain(localMessages);
        }
        // [css美化]：若 ```css 围栏仍残留在 plain 段（多空行/围栏格式差异导致未从正文剥离），再清一次，避免「专属卡片 + 下方整块代码」重复
        if (
          !isUser &&
          localMessages &&
          localMessages.length &&
          localMessages.some((m) => m && m.type === 'css_beautify')
        ) {
          localMessages = localMessages
            .map((m) => {
              if (!m || m.type !== 'plain') return m;
              let c = String(m.content || '');
              c = c.replace(/```\s*css\b[\s\S]*?```/ig, '').trim();
              c = c.replace(/\n{3,}/g, '\n\n');
              return { ...m, content: c };
            })
            .filter((m) => {
              if (!m) return false;
              if (m.type !== 'plain') return true;
              return String(m.content || '').trim().length > 0;
            });
        }
        if (!localMessages || !localMessages.length) {
          localMessages = [{
            type: 'text',
            content: textContent,
            style: 'bubble',
            isReply: false
          }];
        }

        // 用户方：把未匹配到系统类型的 plain 也当作 text 气泡展示
        if (isUser && localMessages.length) {
          localMessages = localMessages.map(m => {
            if (!m || m.type !== 'plain') return m;
            return {
              ...m,
              type: 'text',
              style: 'bubble'
            };
          });
        }

        // 角色正则已在 parse 前应用到整段 textForParse，这里不再对拆分后的 plain 二次应用。

        // 将每条解析后的消息映射为 segment（文本）
        localMessages.forEach(parsedMsg => {
          allSegments.push({
            type: 'text',
            content: parsedMsg.content,
            messageType: parsedMsg.type,
            messageStyle: parsedMsg.style,
            characterName: parsedMsg.characterName,
            cssBeautifyCssText: parsedMsg.type === 'css_beautify' ? String(msg?._cssBeautifyCssText || '') : '',
            amount: parsedMsg.amount,
            remark: parsedMsg.remark,
            blessing: parsedMsg.blessing,
            albumId: parsedMsg.albumId,
            // share 类型专用：从 `[分享]应用|资源|动作|主键|标题|金额|状态|时间|地址|...` 解析出来
            orderId: parsedMsg.orderId,
            shareTitle: parsedMsg.title,
            shareTotal: parsedMsg.total,
            shareOrder: parsedMsg.order,
            shareTs: parsedMsg.order?.ts,
            shareAddress: parsedMsg.order?.address,
            shareItems: Array.isArray(parsedMsg.order?.items) ? parsedMsg.order.items : [],
            sharePayloadB64: parsedMsg.sharePayloadB64 || String(msg?.sharePayloadB64 || ''),
            shareApp: parsedMsg.app || parsedMsg.order?.app || '',
            shareResource: parsedMsg.resource || parsedMsg.order?.resource || '',
            shareAction: parsedMsg.action || parsedMsg.order?.action || '',
            shareStatus: parsedMsg.status || parsedMsg.order?.status || '',
            suggestedReplies: Array.isArray(parsedMsg.suggestedReplies) ? parsedMsg.suggestedReplies : [],
            replyTo: parsedMsg.replyTo,
            isReply: parsedMsg.isReply,
            foreignText: parsedMsg.foreignText,
            isBilingual: !!parsedMsg.isBilingual,
            isRegexTransformedText
          });
        });
      });

      const segments = allSegments.length > 0 ? allSegments : mixed;
      const isSinglePlainSegmentMessage =
        segments.length === 1 &&
        (
          (String(segments[0]?.messageType || '') === 'plain') ||
          (String(segments[0]?.messageStyle || '') === 'plain')
        );

      // 构建角色名HTML（群聊时显示，优先使用解析出的角色名）
      const getCharacterName = (segment) => {
        // 优先使用解析出的角色名（群聊格式中提取的）
        if (segment.characterName) return segment.characterName;
        // 否则使用消息中的角色名
        return msg.characterName || '';
      };

      const getAvatarInnerHtml = (segment) => {
      if (isUser) {
        const userName = (effMaskForMe && effMaskForMe.name) ? String(effMaskForMe.name) : (Storage.get('user_name') || '我');
        const userAvatar = (effMaskForMe && effMaskForMe.avatar) ? String(effMaskForMe.avatar) : '';
        if (userAvatar) {
            return `<img class="yd-chat-avatar-img" alt="${this.escapeHtml(userName)}" src="${this.escapeHtml(userAvatar)}">`;
          }
          const letter = this._getInitialLetter(userName, '我');
          return `<span class="yd-message__avatar-fallback">${this.escapeHtml(letter)}</span>`;
        }

        let displayName = String(getCharacterName(segment) || msg.characterName || '').trim();
        let avatarSrc = null;

        // 1) 精确 characterId
        if (msg.characterId) {
          const c = characterMap.get(String(msg.characterId));
          if (c) {
            displayName = displayName || c.name || '';
            avatarSrc = c.avatar || null;
          }
        }

        // 2) 群聊按 segment 角色名在“当前群成员”里匹配头像
        if (!avatarSrc && isGroup) {
          const byName = participantByNormName.get(normalizeRoleName(displayName || ''));
          if (byName) {
            displayName = displayName || byName.name || '';
            avatarSrc = byName.avatar || null;
          }
        }

        // 3) 单聊或兜底：当前消息推断角色
        if (!avatarSrc && relatedCharacter) {
          displayName = displayName || relatedCharacter.name || '';
          avatarSrc = relatedCharacter.avatar || null;
        }

        if (avatarSrc) {
          return `<img class="yd-chat-avatar-img" alt="${this.escapeHtml(displayName || '角色头像')}" src="${this.escapeHtml(avatarSrc)}">`;
        }
        const letter = this._getInitialLetter(displayName || 'Foxhole & Acorn Box', '云');
        return `<span class="yd-message__avatar-fallback">${this.escapeHtml(letter)}</span>`;
      };
      
      const getNameHtml = (segment) => {
        if (isUser) return '';
        const charName = getCharacterName(segment);
        return charName ? `<div class="yd-message__name">${this.escapeHtml(charName)}</div>` : '';
      };

      if (msg && msg._offlineOpeningPending && !isUser) {
        // 与下方 plain 分支同一套：仅 class + pre-wrap，不另写气泡/头像样式
        const plainEl = document.createElement('div');
        plainEl.className = 'yd-message__plain';
        plainEl.style.whiteSpace = 'pre-wrap';
        plainEl.dataset.msgId = String(msg.id || '');
        plainEl.innerHTML =
          '<span class="yd-offline-opening-line">开场白正在生成中<span class="yd-offline-opening-dots" aria-hidden="true">...</span></span>';
        appendTo(plainEl);
        return;
      }

      // 分段渲染：文本用气泡+头像，HTML 用 DOMPurify 消毒后直接渲染（不带头像）
      segments.forEach((segment, segmentIndex) => {
        const isFirstSegment = segmentIndex === 0;
        const isLastSegment = segmentIndex === segments.length - 1;
        
        // 判断是否与上一条消息同一说话人（仅对第一条分段判断）
        let sameSpeakerAsLast = false;
        if (isFirstSegment) {
          const speakerKey = `${baseSpeakerKey}:${segments.length > 1 ? 'mixed' : 'text'}`;
          sameSpeakerAsLast = speakerKey === lastSpeakerKey;
          if (!sameSpeakerAsLast) lastSpeakerKey = speakerKey;
        }

        // 文本分段：根据消息样式决定是否使用气泡
          const messageStyle = segment.messageStyle || 'bubble';
          const messageType = segment.messageType || 'plain';
          
          if (messageType === 'action') {
            // 动作类型：独立块（非气泡）
            const actionEl = document.createElement('div');
            actionEl.className = 'yd-message__action';
            actionEl.style.whiteSpace = 'pre-wrap';
            actionEl.textContent = this._formatMessageLineBreaksForDisplay(
              this._formatActionDisplayText(String(segment.content || ''))
            );
            actionEl.dataset.msgId = String(msg.id || '');
            // 单击动作：弹出“编辑/重说”
            actionEl.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              Chat._openMsgActionBar({ anchorEl: actionEl, msg });
            });
            appendTo(actionEl);
          } else if (['transfer', 'redpacket', 'collect_transfer', 'collect_redpacket', 'image', 'sticker', 'invitation', 'share', 'suggested_reply', 'css_beautify'].includes(messageType)) {
            if (messageType === 'suggested_reply' && !this._isSuggestedReplyEnabledGlobal()) {
              return;
            }
            // 卡片类消息：独立块（非气泡），但左侧仍需要头像（动作除外）
            const msgEl = document.createElement('div');
            msgEl.className = `yd-message ${isUser ? 'yd-message--user' : ''}`;
            if (messageType) msgEl.classList.add(`yd-message--${messageType}`);
            const moneyCtxEarly = ['transfer', 'redpacket'].includes(messageType)
              ? this._resolveMoneyCardRenderCtx(msg, messageType, isUser)
              : null;
            if (moneyCtxEarly && moneyCtxEarly.isReceipt && isUser) {
              msgEl.classList.add('yd-message--money-incoming');
            }
            if (msg._moneyCollectNotice && isUser) {
              msgEl.classList.add('yd-message--money-incoming', 'yd-message--money-collect-user');
            }
            msgEl.dataset.msgId = String(msg.id || '');

            // 「灵感回复」区：不显示头像和角色名，避免占空间干扰阅读
            const isSuggestedReplyCard = messageType === 'suggested_reply';
            const hideAvatar = isSuggestedReplyCard;
            const avatarClass = `yd-message__avatar${hideAvatar ? ' yd-message__avatar--hidden' : ''}`;
            const nameHtml = (!isUser && isFirstSegment && !isSuggestedReplyCard) ? getNameHtml(segment) : '';

            let blockHtml = '';
            let quoteText = '';
            if (messageType === 'transfer') {
              // 引用格式：[转账] 金额|备注
              const remarkText = segment.remark || '';
              quoteText = `[转账] ${segment.amount || 0}${remarkText ? '|' + remarkText : ''}`;
              const moneyCtx = moneyCtxEarly || this._resolveMoneyCardRenderCtx(msg, 'transfer', isUser);
              let displayRemark = segment.remark || '转账备注';
              if (moneyCtx.isReceipt && isUser) {
                const fromLabel = String(
                  moneyCtx.moneyTx?.fromName || getCharacterName(segment) || msg.characterName || '对方'
                ).trim();
                if (fromLabel) displayRemark = `来自 ${fromLabel}`;
              }
              const transferFooter = this._formatMoneyActionStatus(
                'transfer',
                moneyCtx.status,
                {
                  isUserSender: moneyCtx.isMoneySender && !!isUser,
                  isReceipt: moneyCtx.isReceipt,
                  isOutgoingAssistant: moneyCtx.isMoneySender && !isUser && !moneyCtx.isReceipt
                }
              );
              blockHtml = `
                <div class="yd-message__block yd-message__block--transfer">
                  <div class="yd-transfer-card" role="button" tabindex="0">
                    <div class="yd-transfer-card__header">
                      <div class="yd-transfer-card__row">
                        <svg class="yd-transfer-card__icon" viewBox="0 0 1024 1024" aria-hidden="true">
                          <path d="M725.333333 377.2672V443.733333H298.666667v-68.266666h330.837333L554.666667 296.891733l47.104-49.493333 121.856 128h1.706666v1.800533zM298.666667 646.7328V580.266667h426.666666v68.266666H394.496L469.333333 727.108267l-47.104 49.493333-121.856-128H298.666667v-1.800533z" fill="currentColor"></path>
                          <path d="M512 1024a512 512 0 1 1 512-512 512 512 0 0 1-512 512zM512 68.266667a443.733333 443.733333 0 1 0 443.733333 443.733333A443.733333 443.733333 0 0 0 512 68.266667z" fill="currentColor"></path>
                        </svg>
                        <div class="yd-transfer-card__main">
                          <div class="yd-transfer-card__amount">¥${segment.amount || 0}</div>
                          <div class="yd-transfer-card__remark">${this.escapeHtml(displayRemark)}</div>
                        </div>
                      </div>
                    </div>
                    <div class="yd-transfer-card__footer">${this.escapeHtml(transferFooter)}</div>
                  </div>
                </div>
              `;
            } else if (messageType === 'redpacket') {
              // 引用格式：[红包] 金额|祝福语
              const blessing = segment.blessing || '';
              quoteText = `[红包] ${segment.amount || 0}${blessing ? '|' + blessing : ''}`;
              const moneyCtx = moneyCtxEarly || this._resolveMoneyCardRenderCtx(msg, 'redpacket', isUser);
              let displayTitle = blessing || '大吉大利';
              if (moneyCtx.isReceipt && isUser) {
                const fromLabel = String(
                  moneyCtx.moneyTx?.fromName || getCharacterName(segment) || msg.characterName || '对方'
                ).trim();
                if (fromLabel) displayTitle = `来自 ${fromLabel}`;
              }
              const redpacketFooter = this._formatMoneyActionStatus(
                'redpacket',
                moneyCtx.status,
                {
                  isUserSender: moneyCtx.isMoneySender && !!isUser,
                  isReceipt: moneyCtx.isReceipt,
                  isOutgoingAssistant: moneyCtx.isMoneySender && !isUser && !moneyCtx.isReceipt
                }
              );
              blockHtml = `
                <div class="yd-message__block yd-message__block--redpacket">
                  <div class="yd-redpacket-card" role="button" tabindex="0">
                    <div class="yd-redpacket-card__header">
                      <div class="yd-redpacket-card__row">
                        <svg class="yd-redpacket-card__icon" viewBox="0 0 1024 1024" width="32" height="32" aria-hidden="true">
                          <path d="M520.084 264.084L975.494 56.59C956.633 24.253 921.6 2.695 878.485 2.695H137.432C102.4 0 70.063 21.558 51.2 48.505l468.884 215.58z m0 0" fill="#F44242"></path>
                          <path d="M530.863 320.674c-2.695 2.694-8.084 2.694-10.779 2.694-2.695 0-8.084 0-10.779-2.694L32.337 97.01v816.505C32.337 972.8 80.842 1024 140.127 1024h741.052c59.284 0 110.484-48.505 110.484-110.484V110.484l-460.8 210.19z m115.874 347.62c16.168 0 26.947 10.78 26.947 26.948s-10.779 26.947-26.947 26.947H536.253v107.79c0 16.168-10.78 26.947-26.948 26.947s-26.947-10.779-26.947-26.947v-107.79H371.874c-16.169 0-26.948-10.778-26.948-26.947s10.78-26.947 26.948-26.947h110.484V603.62h-113.18c-16.167 0-26.946-10.779-26.946-26.947s10.779-26.948 26.947-26.948h83.537l-91.621-91.62c-10.78-10.78-10.78-26.948 0-37.727 10.779-10.779 26.947-10.779 37.726 0l110.484 110.484L619.79 420.38c10.78-10.779 26.948-10.779 37.727 0 10.779 10.779 10.779 26.947 0 37.726l-91.621 88.927h83.537c16.168 0 26.947 10.779 26.947 26.947s-10.779 26.947-26.947 26.947h-113.18V665.6h110.485z m0 0" fill="#F44242"></path>
                        </svg>
                        <div class="yd-redpacket-card__main">
                          <div class="yd-redpacket-card__amount">¥${segment.amount || 0}</div>
                          <div class="yd-redpacket-card__blessing">${this.escapeHtml(displayTitle)}</div>
                        </div>
                      </div>
                    </div>
                    <div class="yd-redpacket-card__footer">${this.escapeHtml(redpacketFooter)}</div>
                  </div>
                </div>
              `;
            } else if (messageType === 'collect_redpacket') {
              const blessing = segment.blessing || '';
              quoteText = `[收取红包] ${segment.amount || 0}${blessing ? '|' + blessing : ''}`;
              let displayTitle = blessing || '大吉大利';
              if (isUser) {
                const fromLabel = String(
                  msg.characterName || getCharacterName(segment) || '对方'
                ).trim();
                if (fromLabel) displayTitle = `来自 ${fromLabel}`;
              }
              const collectStatus = this._getCollectDisplayStatus(
                msg,
                !!(this.currentSession && Array.isArray(this.currentSession.participantCharacterIds) && this.currentSession.participantCharacterIds.length > 1)
              );
              const redpacketFooter = this._formatMoneyCollectCardFooter('redpacket', collectStatus);
              blockHtml = `
                <div class="yd-message__block yd-message__block--redpacket yd-message__block--collect-redpacket">
                  <div class="yd-redpacket-card is-disabled" role="presentation">
                    <div class="yd-redpacket-card__header">
                      <div class="yd-redpacket-card__row">
                        <svg class="yd-redpacket-card__icon" viewBox="0 0 1024 1024" width="32" height="32" aria-hidden="true">
                          <path d="M520.084 264.084L975.494 56.59C956.633 24.253 921.6 2.695 878.485 2.695H137.432C102.4 0 70.063 21.558 51.2 48.505l468.884 215.58z m0 0" fill="#F44242"></path>
                          <path d="M530.863 320.674c-2.695 2.694-8.084 2.694-10.779 2.694-2.695 0-8.084 0-10.779-2.694L32.337 97.01v816.505C32.337 972.8 80.842 1024 140.127 1024h741.052c59.284 0 110.484-48.505 110.484-110.484V110.484l-460.8 210.19z m115.874 347.62c16.168 0 26.947 10.78 26.947 26.948s-10.779 26.947-26.947 26.947H536.253v107.79c0 16.168-10.78 26.947-26.948 26.947s-26.947-10.779-26.947-26.947v-107.79H371.874c-16.169 0-26.948-10.778-26.948-26.947s10.78-26.947 26.948-26.947h110.484V603.62h-113.18c-16.167 0-26.946-10.779-26.946-26.947s10.779-26.948 26.947-26.948h83.537l-91.621-91.62c-10.78-10.78-10.78-26.948 0-37.727 10.779-10.779 26.947-10.779 37.726 0l110.484 110.484L619.79 420.38c10.78-10.779 26.948-10.779 37.727 0 10.779 10.779 10.779 26.947 0 37.726l-91.621 88.927h83.537c16.168 0 26.947 10.779 26.947 26.947s-10.779 26.947-26.947 26.947h-113.18V665.6h110.485z m0 0" fill="#F44242"></path>
                        </svg>
                        <div class="yd-redpacket-card__main">
                          <div class="yd-redpacket-card__amount">¥${segment.amount || 0}</div>
                          <div class="yd-redpacket-card__blessing">${this.escapeHtml(displayTitle)}</div>
                        </div>
                      </div>
                    </div>
                    <div class="yd-redpacket-card__footer">${this.escapeHtml(redpacketFooter)}</div>
                  </div>
                </div>
              `;
            } else if (messageType === 'collect_transfer') {
              const remarkText = segment.remark || '';
              quoteText = `[收取转账] ${segment.amount || 0}${remarkText ? '|' + remarkText : ''}`;
              let displayRemark = remarkText || '转账备注';
              if (isUser) {
                const fromLabel = String(
                  msg.characterName || getCharacterName(segment) || '对方'
                ).trim();
                if (fromLabel) displayRemark = `来自 ${fromLabel}`;
              }
              const collectStatus = this._getCollectDisplayStatus(
                msg,
                !!(this.currentSession && Array.isArray(this.currentSession.participantCharacterIds) && this.currentSession.participantCharacterIds.length > 1)
              );
              const transferFooter = this._formatMoneyCollectCardFooter('transfer', collectStatus);
              blockHtml = `
                <div class="yd-message__block yd-message__block--transfer yd-message__block--collect-transfer">
                  <div class="yd-transfer-card is-disabled" role="presentation">
                    <div class="yd-transfer-card__header">
                      <div class="yd-transfer-card__row">
                        <svg class="yd-transfer-card__icon" viewBox="0 0 1024 1024" aria-hidden="true">
                          <path d="M725.333333 377.2672V443.733333H298.666667v-68.266666h330.837333L554.666667 296.891733l47.104-49.493333 121.856 128h1.706666v1.800533zM298.666667 646.7328V580.266667h426.666666v68.266666H394.496L469.333333 727.108267l-47.104 49.493333-121.856-128H298.666667v-1.800533z" fill="currentColor"></path>
                          <path d="M512 1024a512 512 0 1 1 512-512 512 512 0 0 1-512 512zM512 68.266667a443.733333 443.733333 0 1 0 443.733333 443.733333A443.733333 443.733333 0 0 0 512 68.266667z" fill="currentColor"></path>
                        </svg>
                        <div class="yd-transfer-card__main">
                          <div class="yd-transfer-card__amount">¥${segment.amount || 0}</div>
                          <div class="yd-transfer-card__remark">${this.escapeHtml(displayRemark)}</div>
                        </div>
                      </div>
                    </div>
                    <div class="yd-transfer-card__footer">${this.escapeHtml(transferFooter)}</div>
                  </div>
                </div>
              `;
            } else if (messageType === 'image' || messageType === 'sticker') {
              const title = String(segment.content || '').trim();
              const label = messageType === 'sticker' ? '表情包' : '图片';
              quoteText = `[${label}] ${title || ''}`;
              blockHtml = `
                <div class="yd-message__block yd-message__block--media yd-message__block--${messageType}" data-desc="${this.escapeHtml(title)}">
                  <img class="yd-message__media-img" alt="${this.escapeHtml(title || label)}" />
                </div>
              `;
            } else if (messageType === 'share') {
              if (this._isTogetherListenShareSegment(segment)) {
                this._debugTogether('render-card', {
                  msgId: String(msg?.id || ''),
                  orderId: String(segment?.orderId || ''),
                  status: String(segment?.shareStatus || '')
                });
                const fixedQuote = [
                  String(segment.shareApp || ''),
                  String(segment.shareResource || '一起听'),
                  String(segment.shareAction || '邀请'),
                  String(segment.orderId || ''),
                  String(segment.shareTitle || ''),
                  '0',
                  String(segment.shareStatus || ''),
                  String(Number(segment.shareTs || 0) || 0),
                  ''
                ].join('|');
                quoteText = fixedQuote ? `[分享]${fixedQuote}` : `[分享]音乐|一起听|邀请`;
                blockHtml = this._buildTogetherListenCardHtml(segment, { preview: false });
              } else {
              const app = String(segment.shareApp || '').trim();
              const resource = String(segment.shareResource || '').trim();
              if (app === '论坛' && resource === '帖子') {
                const postId = String(segment.orderId || '').trim();
                const postTitle = String(segment.shareTitle || '').trim() || '论坛帖子';
                const rawAddress = String(segment.shareAddress || '').trim();
                // address 字段里约定：论坛名｜帖子摘要
                const splitIdx = rawAddress.indexOf('｜');
                const forumName = splitIdx >= 0 ? rawAddress.slice(0, splitIdx).trim() : rawAddress;
                const postSummary = splitIdx >= 0 ? rawAddress.slice(splitIdx + 1).trim() : '';
                const ts = Number(segment.shareTs || 0) || 0;
                const timeText = ts ? (() => {
                  const d = new Date(ts);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const hh = String(d.getHours()).padStart(2, '0');
                  const mm = String(d.getMinutes()).padStart(2, '0');
                  return `${y}.${m}.${day} ${hh}:${mm}`;
                })() : '';
                const fixedQuote = [
                  app || '论坛',
                  resource || '帖子',
                  String(segment.shareAction || '查看'),
                  postId,
                  postTitle,
                  '0',
                  String(segment.shareStatus || '已分享'),
                  String(ts || 0),
                  rawAddress
                ].join('|');
                quoteText = fixedQuote ? `[分享]${fixedQuote}` : `[分享]论坛|帖子|查看`;
                blockHtml = `
                  <div class="yd-message__block yd-message__block--share">
                    <div class="yd-share-card yd-share-card--forum" role="button" tabindex="0" data-forum-post-id="${this.escapeHtml(postId)}">
                      <div class="yd-share-card__status-header">
                        <span class="yd-share-card__brand">论坛</span>
                        <span class="yd-share-card__pay-status">帖子分享</span>
                      </div>
                      <div class="yd-share-card__main-info">
                        <h2 class="yd-share-card__order-title">${this.escapeHtml(postTitle)}</h2>
                        <div class="yd-share-card__address-box">
                          <span class="yd-share-card__address-pin" aria-hidden="true">🧭</span>
                          <span class="yd-share-card__address-text">${this.escapeHtml(forumName || '论坛')}</span>
                        </div>
                        <div class="yd-share-card__forum-summary">${this.escapeHtml(postSummary || '（无摘要）')}</div>
                        <div class="yd-share-card__forum-meta">
                          <div class="yd-share-card__meta-line"><span>帖子ID</span><span>${this.escapeHtml(postId || '—')}</span></div>
                          <div class="yd-share-card__meta-line"><span>分享时间</span><span>${this.escapeHtml(timeText || '—')}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              } else {
              const orderId = String(segment.orderId || '');
              const title = String(segment.shareTitle || '');
              const totalNum = Number(segment.shareTotal || 0);
              const totalText = Number.isFinite(totalNum) ? totalNum.toFixed(2) : '0.00';
              const addressText = segment.shareAddress ? String(segment.shareAddress) : '';
              const ts = Number(segment.shareTs || 0) || 0;
              // 分享卡片里的“下单时间”显示成绝对日期时间，避免 `formatTime()` 的“刚刚”相对文案
              const timeText = ts ? (() => {
                const d = new Date(ts);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                return `${y}.${m}.${day} ${hh}:${mm}`;
              })() : '';

              const items = Array.isArray(segment.shareItems) ? segment.shareItems : [];
              // 根据订单归属取支付状态（已支付/已代付/未支付）
              const takeoutOrder = takeoutOrderMap.get(String(orderId || '')) || null;
              const shopOrder = shopOrderMap.get(String(orderId || '')) || null;
              const brand = String(segment.shareApp || '') || (takeoutOrder ? '外卖' : '商城');
              const fullOrder = takeoutOrder || shopOrder;
              const payStatus = (() => {
                if (String(segment.shareAction || '') === '邀请代付') return '邀请你代付';
                const s = String(segment.shareStatus || '');
                if (s === '自己已支付') return '已支付';
                if (s === '已代付') return '已代付';
                if (s === '未支付') return '未支付';
                const ps = String(fullOrder?.payState || fullOrder?.payStatus || '');
                const paidBy = String(fullOrder?.paidBy || '');
                if (ps === 'proxy_paid' || paidBy === 'proxy') return '已代付';
                if (ps === 'unpaid' || paidBy === 'unpaid') return '未支付';
                // 默认兼容：旧订单没字段时按“已支付”展示
                return '已支付';
              })();

              const subtotal = items.reduce((sum, it) => {
                const u = Number(it?.unitPrice || 0) || 0;
                const q = Number(it?.qty || 0) || 0;
                return sum + u * q;
              }, 0);
              const subtotalText = Number.isFinite(subtotal) ? subtotal.toFixed(2) : '0.00';

              const itemsHtml = items.map(it => {
                const emoji = String(it?.icon || '🍽️');
                const nm = String(it?.name || '').trim();
                const qty = Number(it?.qty || 0) || 0;
                const specText = String(it?.specText || '').trim();
                const unitPrice = Number(it?.unitPrice || 0) || 0;
                return `
                  <div class="yd-share-card__item-entry">
                    <div class="yd-share-card__item-main">
                      <span class="yd-share-card__item-emoji">${this.escapeHtml(emoji)}</span>
                      <div class="yd-share-card__item-name-spec">
                        <span class="yd-share-card__item-name">${this.escapeHtml(nm || '商品')}</span>
                        <span class="yd-share-card__item-spec">${this.escapeHtml(specText || '')}</span>
                      </div>
                    </div>
                    <div class="yd-share-card__item-price-qty">
                      <span class="yd-share-card__p-val">¥${unitPrice.toFixed(2)}</span>
                      <span class="yd-share-card__q-val">x${qty}</span>
                    </div>
                  </div>
                `;
              }).join('');
              const hasManyItems = items.length > 4;

              // 长按引用：保持与新协议的“固定头”一致（不带明细段）
              const fixedQuote = [
                String(segment.shareApp || ''),
                String(segment.shareResource || '订单'),
                String(segment.shareAction || ''),
                orderId,
                title,
                Number.isFinite(Number(segment.shareTotal || 0)) ? String(Number(segment.shareTotal || 0)) : '0',
                String(segment.shareStatus || ''),
                String(ts || 0),
                String(addressText || '')
              ].join('|');
              quoteText = fixedQuote ? `[分享]${fixedQuote}` : `[分享]${orderId}|${title}|${totalText}`;

              blockHtml = `
                <div class="yd-message__block yd-message__block--share">
                  <div class="yd-share-card" role="button" tabindex="0" data-order-id="${this.escapeHtml(orderId)}" data-source="${this.escapeHtml(brand === '外卖' ? 'takeout' : 'shop')}">
                    <div class="yd-share-card__status-header">
                      <span class="yd-share-card__brand">${this.escapeHtml(brand)}</span>
                      <span class="yd-share-card__pay-status">${this.escapeHtml(payStatus)}</span>
                    </div>

                    <div class="yd-share-card__main-info">
                      <h2 class="yd-share-card__order-title">${this.escapeHtml(title || '订单')}</h2>
                      <div class="yd-share-card__address-box">
                        <span class="yd-share-card__address-pin" aria-hidden="true">📍</span>
                        <span class="yd-share-card__address-text">送至：${this.escapeHtml(addressText || '—')}</span>
                      </div>

                      <div class="yd-share-card__items-list">
                        ${itemsHtml || `<div style="padding:4px 0;color:rgba(17,17,17,0.45);font-size:12px;">暂无商品</div>`}
                      </div>
                      ${hasManyItems ? `
                        <button type="button" class="yd-share-card__toggle" data-role="share-items-toggle" aria-expanded="false">
                          展开 ▼
                        </button>
                      ` : ''}

                      <div class="yd-share-card__cost-detail">
                        <div class="yd-share-card__detail-row">
                          <span>商品小计</span>
                          <span>¥${this.escapeHtml(subtotalText)}</span>
                        </div>
                        <div class="yd-share-card__below-subtotal-meta">
                          <div class="yd-share-card__meta-line">
                            <span>订单编号</span>
                            <span>${this.escapeHtml(orderId)}</span>
                          </div>
                          <div class="yd-share-card__meta-line">
                            <span>下单时间</span>
                            <span>${this.escapeHtml(timeText || '')}</span>
                          </div>
                        </div>
                        <div class="yd-share-card__total-row">
                          <span class="yd-share-card__total-label">实付总额</span>
                          <span class="yd-share-card__total-price">¥${this.escapeHtml(totalText)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              `;
              }
              }
            } else if (messageType === 'invitation') {
              // 引用格式：[邀请] 内容
              quoteText = `[邀请] ${segment.content || ''}`;
              blockHtml = `
                <div class="yd-message__block yd-message__block--invitation">
                  <div class="yd-message__block-header">邀请</div>
                  <div class="yd-message__block-title">${this.escapeHtml(segment.content || '')}</div>
                  <div class="yd-message__block-sub">查看详情（占位）</div>
                </div>
              `;
            } else if (messageType === 'css_beautify') {
              // 引用格式：[css美化] 标题
              quoteText = `[css美化] ${segment.content || ''}`;
              const code = String(segment.cssBeautifyCssText || '').trim();
              const hasCode = !!code;
              blockHtml = `
                <div class="yd-message__block yd-message__block--css-beautify">
                  ${hasCode ? `
                    <details class="yd-css-beautify-details">
                      <summary class="yd-css-beautify-summary" role="button">
                        <span class="yd-css-beautify-summary__title">${this.escapeHtml(segment.content || '')}</span>
                        <span class="yd-css-beautify-summary__action">&gt;查看美化</span>
                      </summary>
                      <pre class="yd-css-beautify-pre"><code>${this.escapeHtml(code)}</code></pre>
                    </details>
                  ` : `
                    <div class="yd-css-beautify-summary yd-css-beautify-summary--no-code">
                      <span class="yd-css-beautify-summary__title">${this.escapeHtml(segment.content || '')}</span>
                      <span class="yd-css-beautify-summary__action">&gt;查看美化</span>
                    </div>
                  `}
                </div>
              `;
            } else if (messageType === 'suggested_reply') {
              const options = (Array.isArray(segment.suggestedReplies) ? segment.suggestedReplies : [])
                .map((s) => String(s || '').trim())
                .filter(Boolean);
              const displayOptions = (options.length ? options : String(segment.content || '').split('|'))
                .map((s) => String(s || '').trim())
                .filter(Boolean)
                .slice(0, 6);
              quoteText = `[建议回复]${displayOptions.join('|')}`;
              const armedText = String(this._suggestedReplyArmedText || '').trim();
              const armedAt = Number(this._suggestedReplyArmedAt || 0) || 0;
              const armedAlive = !!armedText && (Date.now() - armedAt) < 8000;
              blockHtml = `
                <div class="yd-message__block yd-message__block--suggested-reply">
                  <div class="yd-suggested-reply">
                    <div class="yd-suggested-reply__title">灵感回复</div>
                    <div class="yd-suggested-reply__list">
                      ${displayOptions.map((opt) => {
                        const t = String(opt || '').trim();
                        const armed = armedAlive && t && t === armedText;
                        const cls = armed ? 'yd-suggested-reply__item is-armed' : 'yd-suggested-reply__item';
                        return `<button type="button" class="${cls}" data-sr-text="${this.escapeHtml(t)}">${this.escapeHtml(t)}</button>`;
                      }).join('')}
                    </div>
                  </div>
                </div>
              `;
            }

            msgEl.innerHTML = `
              <div class="${avatarClass}">
                <div class="yd-message__avatar-inner">
                  ${getAvatarInnerHtml(segment)}
                </div>
              </div>
              <div class="yd-message__body">
                ${nameHtml}
                ${blockHtml}
              </div>
            `;

            if (messageType === 'suggested_reply') {
              const optionEls = msgEl.querySelectorAll('.yd-suggested-reply__item');
              optionEls.forEach((btn) => {
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const text = String(btn.getAttribute('data-sr-text') || btn.textContent || '').trim();
                  if (!text) return;
                  const now = Date.now();
                  const armedText = String(this._suggestedReplyArmedText || '');
                  const armedAt = Number(this._suggestedReplyArmedAt || 0) || 0;
                  const isSecondTap = armedText === text && (now - armedAt) < 8000;

                  // 清理同组按钮状态
                  try {
                    optionEls.forEach((el) => el.classList.remove('is-armed', 'is-fired'));
                  } catch (e2) {}

                  if (!isSecondTap) {
                    // 第一次：只填入输入框，不聚焦
                    this._suggestedReplyArmedText = text;
                    this._suggestedReplyArmedAt = now;
                    btn.classList.add('is-armed');
                    this._setInputTextSilent(text);
                    return;
                  }

                  // 第二次：直接发送，清空输入框
                  this._suggestedReplyArmedText = '';
                  this._suggestedReplyArmedAt = 0;
                  btn.classList.add('is-fired');
                  (async () => {
                    // 立刻清空输入框：避免用户看到旧内容残留/误以为未发送
                    try { this._clearInputSilent(); } catch (e4) {}
                    try {
                      const pendingId = await this._queueUserMessage(text);
                      // 真实发送：立即 flush 触发 API 请求（等同“再次点击发送按钮”）
                      await this._flushPendingMessages([pendingId]);
                    } catch (err) {
                      try { console.error('[chat] suggested reply quick send failed', err); } catch (e3) {}
                      return;
                    }
                  })();
                });
              });
            }

            // 红包/转账：点击进入“领取/退还”流程（后续会在 _onMoneyCardClick 内做银行卡激活检查与弹窗）
            if (messageType === 'collect_redpacket' || messageType === 'collect_transfer') {
              const cardSelector = messageType === 'collect_redpacket' ? '.yd-redpacket-card' : '.yd-transfer-card';
              const cardEl = msgEl.querySelector(cardSelector);
              if (cardEl) cardEl.classList.add('is-disabled');
            } else if (messageType === 'redpacket' || messageType === 'transfer') {
              const cardSelector = messageType === 'redpacket' ? '.yd-redpacket-card' : '.yd-transfer-card';
              const cardEl = msgEl.querySelector(cardSelector);
              if (cardEl) {
                const moneyCtx = Chat._resolveMoneyCardRenderCtx(msg, messageType, isUser);
                const moneyTx = moneyCtx.moneyTx;
                const isMoneyReceipt = moneyCtx.isReceipt;
                const isMoneySender = moneyCtx.isMoneySender;
                const fromName = isMoneySender && isUser
                  ? (String(Chat._sessionUserDisplayName || '').trim() || '我')
                  : (getCharacterName(segment) || msg.characterName || '对方');
                const amount = Number(segment.amount) || 0;
                const settled = Chat._getMoneySettledStatus(String(msg.id || ''), msg);
                if (settled) {
                  cardEl.classList.add('is-disabled');
                } else if (isMoneySender && isUser) {
                  cardEl.classList.add('is-disabled');
                } else if (isMoneyReceipt && !isUser) {
                  cardEl.classList.add('is-disabled');
                }
                cardEl.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    if (Chat && typeof Chat._onMoneyCardClick === 'function') {
                      Chat._onMoneyCardClick({
                        kind: messageType === 'redpacket' ? 'redpacket' : 'transfer',
                        messageId: String(msg.id || ''),
                        sessionId: String(Chat.currentSessionId || ''),
                        fromName: String(fromName || '对方'),
                        amount,
                        createdAt: Number(msg?.createdAt || msg?.ts || Date.now()),
                        blessing: messageType === 'redpacket' ? String(segment.blessing || '') : '',
                        remark: messageType === 'transfer' ? String(segment.remark || '') : '',
                        isUserSender: isMoneySender && !!isUser,
                        isReceipt: isMoneyReceipt,
                        role: msg.role
                      });
                    }
                  } catch (err) {
                    console.error('[chat] money card click failed:', err);
                  }
                });
              }
            }

            // 头像单击弹菜单：角色头像=角色操作，用户头像=我的面具
            if (!isUser) {
              const avatarInner = msgEl.querySelector('.yd-message__avatar-inner');
              const parsedRoleName = typeof getCharacterName === 'function' ? String(getCharacterName(segment) || '').trim() : '';
              const nameForPat = parsedRoleName || msg.characterName || '';
              const parsedRoleNorm = normalizeRoleName(parsedRoleName);
              const fromParsed = parsedRoleNorm && participantByNormName.has(parsedRoleNorm)
                ? participantByNormName.get(parsedRoleNorm)
                : null;
              const cid = String(msg?.characterId || relatedCharacter?.id || fromParsed?.id || '').trim();
              if (avatarInner && !avatarInner.dataset.ydRoleActionBound) {
                avatarInner.dataset.ydRoleActionBound = '1';
                avatarInner.style.cursor = 'pointer';
                try { console.debug('[chat] bind avatar action menu', { msgId: msg?.id, cid }); } catch (e) {}
                avatarInner.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  Chat._showAvatarQuickActions({
                    anchorEl: avatarInner,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    roleId: cid,
                    roleName: nameForPat
                  });
                }, { passive: false });
              }
            } else {
              const avatarInner = msgEl.querySelector('.yd-message__avatar-inner');
              if (avatarInner && !avatarInner.dataset.ydUserActionBound) {
                avatarInner.dataset.ydUserActionBound = '1';
                avatarInner.style.cursor = 'pointer';
                avatarInner.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  Chat._showUserAvatarQuickActions({
                    anchorEl: avatarInner,
                    clientX: e.clientX,
                    clientY: e.clientY
                  });
                }, { passive: false });
              }
            }
            // 卡片：长按内容触发引用（角色方 + 用户方都支持）
            if (quoteText) {
              const blockEl = msgEl.querySelector('.yd-message__block');
              if (blockEl) {
                Chat._attachMessageLongPress(blockEl, {
                  text: quoteText,
                  fromName: isUser
                    ? (Storage.get('user_name') || '我')
                    : (getCharacterName(segment) || msg.characterName || '')
                });
              }
            }

            // 分享卡片：点击打开订单详情
            if (messageType === 'share') {
              if (this._isTogetherListenShareSegment(segment)) {
                const togetherCardEl = msgEl.querySelector('.yd-together-card[data-track-id]');
                const trackId = String(togetherCardEl?.getAttribute('data-track-id') || segment.orderId || '');
                if (togetherCardEl) {
                  togetherCardEl.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await this._openTogetherPlayerFromSession(trackId);
                  });
                }
                // 一起听卡片不走订单详情逻辑；继续后续流程以确保消息节点正常 append 到 DOM
              }
              const shareCardEl = msgEl.querySelector('.yd-share-card[data-order-id]');
              const forumShareCardEl = msgEl.querySelector('.yd-share-card[data-forum-post-id]');
              const clickOrderId = shareCardEl?.getAttribute('data-order-id');
              const forumPostId = String(forumShareCardEl?.getAttribute('data-forum-post-id') || '').trim();
              const source = String(shareCardEl?.getAttribute('data-source') || 'takeout');
              const payStatusEl = msgEl.querySelector('.yd-share-card__pay-status');
              const itemsListEl = msgEl.querySelector('.yd-share-card__items-list');
              const toggleEl = msgEl.querySelector('[data-role="share-items-toggle"]');

              if (itemsListEl && toggleEl) {
                // 默认折叠：商品区可滚动；点击切换展开/收起
                itemsListEl.classList.remove('is-expanded');
                const toggleItems = (e) => {
                  if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  const expanded = itemsListEl.classList.toggle('is-expanded');
                  toggleEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                  toggleEl.textContent = expanded ? '收起 ▲' : '展开 ▼';
                };
                toggleEl.addEventListener('click', toggleItems);
              }

              // 分享卡片：点右上角状态（不跳详情）-> 弹出“编辑/重说”
              if (payStatusEl) {
                payStatusEl.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  Chat._openMsgActionBar({ anchorEl: payStatusEl, msg });
                });
              }

              // 论坛分享卡片：点击跳转到论坛帖子详情
              if (forumShareCardEl && forumPostId) {
                const openForumPost = async () => {
                  try {
                    if (typeof State !== 'undefined' && State) {
                      State.forumReturnPage = 'page-chat';
                      State.forumReturnSessionId = String(this.currentSessionId || '');
                    }
                    // 优先切到论坛列表页，再通过现有 API 打开详情，复用 Forum 现有链路
                    if (typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
                      State.switchPage('page-forum');
                    }
                    if (typeof Forum !== 'undefined' && Forum && typeof Forum.openThread === 'function') {
                      Forum.openThread(forumPostId);
                    }
                  } catch (e) {
                    console.error('[chat] open forum share post failed:', e);
                  }
                };
                forumShareCardEl.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void openForumPost();
                });
                forumShareCardEl.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    void openForumPost();
                  }
                });
              }

              if (shareCardEl && clickOrderId) {
                const open = async () => {
                  try {
                    const returnPage = (typeof State !== 'undefined' && State && State.currentPage)
                      ? State.currentPage
                      : 'page-chat';
                    const shareOrder = segment.shareOrder || null;

                    // 先在聊天页把订单数据查出来/准备好，再切页面打开弹窗，避免“闪一下首页”
                    // 这样宁愿慢一点，也不让你看到 page-shop/page-takeout 的瞬时内容
                    let fullOrder = null;
                    if (source === 'shop') {
                      const key = (typeof Shop !== 'undefined' && Shop && Shop.STORAGE_KEY_ORDERS)
                        ? Shop.STORAGE_KEY_ORDERS
                        : 'shop_orders_v1';
                      let orders = [];
                      try { orders = await Storage.kvGet(key); } catch (e) {}
                      const order = Array.isArray(orders)
                        ? orders.find(x => String(x?.id || '') === String(clickOrderId))
                        : null;
                      fullOrder = order || null;
                    } else {
                      const key = (typeof Takeout !== 'undefined' && Takeout && Takeout.STORAGE_KEY_ORDERS)
                        ? Takeout.STORAGE_KEY_ORDERS
                        : 'takeout_orders_v1';
                      let orders = [];
                      try { orders = await Storage.kvGet(key); } catch (e) {}
                      const order = Array.isArray(orders)
                        ? orders.find(x => String(x?.id || '') === String(clickOrderId))
                        : null;
                      fullOrder = order || null;
                    }

                    const targetPage = source === 'shop' ? 'page-shop' : 'page-takeout';
                    const targetPageEl = document.getElementById(targetPage);
                    if (targetPageEl) {
                      // 切页面瞬间先隐藏一下，避免看到“加载中间闪一下”
                      targetPageEl.style.visibility = 'hidden';
                      targetPageEl.style.opacity = '0';
                      targetPageEl.style.transition = 'none';
                    }

                    if (typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
                      State.switchPage(targetPage);
                    }

                    // 让“返回/关闭订单详情”能回到聊天页（或触发分享前的页面）
                    const modalEl = document.getElementById(source === 'shop' ? 'shop-order-detail' : 'takeout-order-detail');
                    const returnSessionId = String(this?.currentSessionId || this?.currentSession || Chat?.currentSessionId || State?.currentSessionId || '');
                    if (modalEl) {
                      modalEl.dataset.returnPage = String(returnPage || 'page-chat');
                      modalEl.dataset.returnSessionId = returnSessionId;
                    }

                    // 在下一帧恢复可见，确保弹窗内容已渲染出来
                    window.requestAnimationFrame(() => {
                      if (targetPageEl) {
                        targetPageEl.style.visibility = '';
                        targetPageEl.style.opacity = '';
                        targetPageEl.style.transition = '';
                      }
                    });

                    if (source === 'shop') {
                      if (fullOrder && typeof Shop.openOrderDetail === 'function') return Shop.openOrderDetail(fullOrder);
                      if (shareOrder && typeof Shop.openOrderDetail === 'function') return Shop.openOrderDetail(shareOrder);
                      if (typeof Shop !== 'undefined' && Shop && typeof Shop.openOrderDetailById === 'function') return Shop.openOrderDetailById(clickOrderId);
                    } else {
                      if (fullOrder && typeof Takeout.openOrderDetail === 'function') return Takeout.openOrderDetail(fullOrder);
                      if (shareOrder && typeof Takeout.openOrderDetail === 'function') return Takeout.openOrderDetail(shareOrder);
                      if (typeof Takeout !== 'undefined' && Takeout && typeof Takeout.openOrderDetailById === 'function') return Takeout.openOrderDetailById(clickOrderId);
                    }
                  } catch (e) {}
                };

                shareCardEl.addEventListener('click', open);
                shareCardEl.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter' || e.key === ' ') open();
                });
              }
            }

            // 图片/表情包：加载相册图片 + 点击展开“名称详情行”（复用语音样式）
            if (messageType === 'image' || messageType === 'sticker') {
              const blockEl = msgEl.querySelector('.yd-message__block--media');
              const mediaPlaceholderSvg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#e5e5e5"/><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="#8a8a8a"/></svg>');
              if (blockEl) {
                const imgEl = blockEl.querySelector('.yd-message__media-img');
                const desc = (blockEl.getAttribute('data-desc') || '').trim();
                if (imgEl && desc) {
                  Storage.dbGetAll('album')
                    .then((all) => {
                      const items = all || [];
                      const found = items.find((it) => {
                        if (!it) return false;
                        const name = (it.description || it.name || '').trim();
                        return name === desc;
                      });
                      if (found && found.data) {
                        imgEl.src = found.data;
                        imgEl.onerror = () => {
                          imgEl.src = mediaPlaceholderSvg;
                          imgEl.classList.add('yd-message__media-img--placeholder');
                          imgEl.onerror = null;
                        };
                      } else {
                        imgEl.src = mediaPlaceholderSvg;
                        imgEl.classList.add('yd-message__media-img--placeholder');
                      }
                    })
                    .catch((err) => {
                      console.error('按描述加载图片失败:', err);
                      if (imgEl) {
                        imgEl.src = mediaPlaceholderSvg;
                        imgEl.classList.add('yd-message__media-img--placeholder');
                      }
                    });
                } else if (imgEl) {
                  imgEl.src = mediaPlaceholderSvg;
                  imgEl.classList.add('yd-message__media-img--placeholder');
                }

                // 点击图片：在其下方插入/移除一条“语音风格”的详情气泡
                blockEl.addEventListener('click', () => {
                  const title = (blockEl.getAttribute('data-desc') || '').trim();
                  if (!title) return;
                  const opened = blockEl.getAttribute('data-inline-open') === '1';
                  const existing = blockEl._inlineRow;
                  if (opened && existing && existing.parentNode) {
                    existing.parentNode.removeChild(existing);
                    blockEl.removeAttribute('data-inline-open');
                    blockEl._inlineRow = null;
                    return;
                  }
                  const inlineRow = document.createElement('div');
                  inlineRow.className = `yd-message yd-voice-inline-row ${isUser ? 'yd-message--user' : ''} yd-media-inline-row`;
                  inlineRow.innerHTML = `
                    <div class="yd-message__avatar yd-message__avatar--hidden" aria-hidden="true">
                      <div class="yd-message__avatar-inner"></div>
                    </div>
                    <div class="yd-message__body">
                      <div class="yd-voice-inline">${this.escapeHtml(this._formatMessageLineBreaksForDisplay(title))}</div>
                    </div>
                  `;
                  // 二次点击“描述框”才弹出 编辑/重说/删除
                  inlineRow.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    Chat._openMsgActionBar({ anchorEl: inlineRow, msg });
                  });
                  inlineRow.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      Chat._openMsgActionBar({ anchorEl: inlineRow, msg });
                    }
                  });
                  inlineRow.setAttribute('role', 'button');
                  inlineRow.setAttribute('tabindex', '0');
                  scroll.insertBefore(inlineRow, msgEl.nextSibling);
                  blockEl._inlineRow = inlineRow;
                  blockEl.setAttribute('data-inline-open', '1');
                });
              }
            }

            appendTo(msgEl);
          } else if (messageStyle === 'plain' || messageType === 'plain') {
            // 非消息正文（plain）：不带头像，不带气泡。助手走 Markdown+消毒；用户仍 pre-wrap + 可选仿流式
            const plainEl = document.createElement('div');
            plainEl.dataset.msgId = String(msg.id || '');
            const rawPlain = String(segment.content || '');
            plainEl.addEventListener('click', (e) => {
              const target = e && e.target;
              if (target && typeof target.closest === 'function') {
                // 交互元素区域不弹消息操作栏，避免和块内交互冲突
                if (target.closest('summary, details, button, input, select, textarea, label, a, [role="button"], video, audio, iframe')) {
                  return;
                }
                // 角色正则产生的富 HTML 块：点击其复杂结构区域时不弹操作栏；
                // 但普通段落文本（如你反馈的那两句）仍可点击触发。
                if (segment?.isRegexTransformedText) {
                  if (target.closest('img, svg, canvas, table, pre, code, .yd-message__block')) {
                    return;
                  }
                }
              }
              e.preventDefault();
              e.stopPropagation();
              Chat._openMsgActionBar({
                anchorEl: plainEl,
                msg,
                // 正则回显内容需要编辑“未参与正则转换的原始本体”
                // 这里显式传入原始 content，避免用回显文本做局部替换。
                editSeedText: segment?.isRegexTransformedText ? String(msg?.content || '') : ''
              });
            });
            appendTo(plainEl);

            // 是否允许逐字展示（用于线下/开场白/模拟逐条接收）。
            // 注意：如果走 Markdown 渲染（innerHTML），就无法复用逐字 reveal 逻辑。
            const mid = String(msg?.id || '');
            // 顺序保护：只有“整条消息是单一 plain 段”才允许逐字流式。
            // 若同一条消息混有 [对白]/[消息] 等协议段，逐字流式会导致协议段先出现、正文后补流的错序观感。
            const allowStream = !!(mid && this._plainStreamPendingMsgIds.has(mid) && isSinglePlainSegmentMessage);

            const useMd =
              !isUser &&
              !allowStream &&
              typeof MarkdownPlain !== 'undefined' &&
              typeof MarkdownPlain.renderAssistantPlainMarkdown === 'function';

            try {
              if (!isUser) {
                console.log('[chat] plain-render-path', {
                  id: mid,
                  allowStream,
                  useMd,
                  role: msg?.role,
                  mode: msg?.mode,
                  preview: String(rawPlain || '').slice(0, 40)
                });
              }
            } catch (e) {}

            if (useMd) {
              this._applyAssistantPlainMarkdownHtml(plainEl, rawPlain);
            } else {
              plainEl.className = 'yd-message__plain';
              plainEl.style.whiteSpace = 'pre-wrap';
              const fullPlain = this._formatMessageLineBreaksForDisplay(rawPlain);
              if (allowStream) {
                this._plainStreamPendingMsgIds.delete(mid);
                const sk = this._plainStreamCacheKey(msg, segmentIndex, rawPlain);
                this._startPlainTextStreamReveal(plainEl, sk, rawPlain);
              } else {
                plainEl.textContent = fullPlain;
              }
            }
          } else {
            // 带格式的消息：使用气泡+头像（仅第一条分段显示头像）
            const msgEl = document.createElement('div');
            msgEl.className = `yd-message ${isUser ? 'yd-message--user' : ''}`;
            msgEl.dataset.msgId = String(msg.id || '');
            
            // 添加消息类型类名，便于样式定制
            if (messageType && messageType !== 'plain') {
              msgEl.classList.add(`yd-message--${messageType}`);
            }
            if (segment.isBilingual && segment.foreignText) {
              msgEl.classList.add('yd-message--bilingual');
            }
            
            // 用户消息：每条都显示头像；角色消息：每条都显示头像
            const hideAvatar = false;
            const avatarClass = `yd-message__avatar${hideAvatar ? ' yd-message__avatar--hidden' : ''}`;
            
            // 构建消息内容HTML
            let contentHtml = '';
            
            // 根据消息类型渲染不同内容
            if (messageType === 'voice_text') {
              const speakTextRaw = String(segment.foreignText || segment.content || '');
              const speakText = this._stripVoiceMoodTagsFromNonVoiceMessage(`[语音]${speakTextRaw}`).replace(/^\[语音\]/, '');
              const durationSec = Math.max(1, Math.ceil(String(speakText || '').replace(/\s+/g, '').length / 2));
              contentHtml = `
                <div class="yd-voice-bubble" data-voice-text="${this.escapeHtml(speakText)}" role="button" tabindex="0">
                  <button type="button" class="yd-voice-bubble__play" aria-label="播放语音">
                    <svg class="yd-voice-bubble__svg yd-voice-bubble__svg--play" aria-hidden="true" viewBox="0 0 1024 1024" focusable="false">
                      <path d="M819.498667 584.832L343.168 875.904A85.333333 85.333333 0 0 1 213.333333 803.114667V220.885333a85.333333 85.333333 0 0 1 129.834667-72.789333l476.330667 291.072a85.333333 85.333333 0 0 1 0 145.664z" fill="currentColor"></path>
                    </svg>
                    <svg class="yd-voice-bubble__svg yd-voice-bubble__svg--pause" aria-hidden="true" viewBox="0 0 24 24" focusable="false" style="display:none;">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"></path>
                    </svg>
                  </button>
                  <div class="yd-voice-bubble__duration"><span class="yd-voice-bubble__duration-num">${durationSec}"</span><span class="yd-voice-bubble__waveform" aria-hidden="true"><span class="yd-voice-bubble__bar"></span><span class="yd-voice-bubble__bar"></span><span class="yd-voice-bubble__bar"></span><span class="yd-voice-bubble__bar"></span></span></div>
                </div>
              `;
            } else if (segment.isBilingual && segment.foreignText) {
              contentHtml = this._buildBilingualBubbleInnerHtml(segment);
            } else if (segment.isReply && segment.replyTo) {
              // 回复消息
              contentHtml = `
                <div class="yd-message__reply-to">${this.escapeHtml(segment.replyTo)}</div>
                <div class="yd-message__text">${this.escapeHtml(this._formatMessageLineBreaksForDisplay(String(segment.content || '')))}</div>
              `;
            } else {
              // 普通文本消息
              contentHtml = `<div class="yd-message__text">${this.escapeHtml(this._formatMessageLineBreaksForDisplay(String(segment.content || '')))}</div>`;
            }
            
            const metaPlacement = this._buildMessageMetaPlacement(msg, isUser, startIdx + localIdx);
            const roleNameHtml = (!isUser && isFirstSegment) ? getNameHtml(segment) : '';
            const nameHtmlForRow = metaPlacement.top ? roleNameHtml : '';
            const standaloneNameHtml = metaPlacement.top ? '' : (isFirstSegment ? roleNameHtml : '');
            const contentBlock = `<div class="yd-message__content">${contentHtml}</div>`;
            const outerMeta = metaPlacement.outerSide || '';
            const bubbleMainHtml = outerMeta
              ? (isUser
                ? `<div class="yd-message__bubble-row">${outerMeta}${contentBlock}</div>`
                : `<div class="yd-message__bubble-row">${contentBlock}${outerMeta}</div>`)
              : contentBlock;
            msgEl.innerHTML = `
              <div class="yd-message__avatar-col">
              <div class="${avatarClass}">
                <div class="yd-message__avatar-inner">
                  ${getAvatarInnerHtml(segment)}
                </div>
                </div>
                ${metaPlacement.avatarBelow}
              </div>
              <div class="yd-message__body">
                ${this._buildMessageBodyTopRow(isUser, isFirstSegment, nameHtmlForRow, metaPlacement.top)}
                ${standaloneNameHtml}
                ${bubbleMainHtml}
                ${metaPlacement.bottom}
              </div>
            `;

            // 语音气泡交互：播放按钮轻量反馈 + 点击气泡展开当前消息下方内容
            if (messageType === 'voice_text') {
              const voiceEl = msgEl.querySelector('.yd-voice-bubble');
              const playBtn = msgEl.querySelector('.yd-voice-bubble__play');
              const voiceText = voiceEl?.getAttribute('data-voice-text') || this._getSegmentSpeakText(segment) || '';

              // 播放按钮：播放时显示方形可打断；未播放时点击触发合成播放
              playBtn?.addEventListener('click', async (e) => {
                e.stopPropagation();
                playBtn.classList.add('yd-voice-bubble__play--active');
                window.setTimeout(() => playBtn.classList.remove('yd-voice-bubble__play--active'), 180);
                if (voiceEl.classList.contains('yd-voice-bubble--playing')) {
                  this._stopVoicePlayback();
                  return;
                }
                if (voiceText) {
                  try {
                    await this._playVoiceText(voiceText, voiceEl, msg, getCharacterName(segment));
                  } catch (err) {
                    console.error('play voice_text failed:', err);
                  }
                }
              });

              // 单击语音气泡（除播放按钮外）：只负责展开/收起下方“语音内容”预览框
              // （编辑/重说延后到点击展开后的内容区域再触发，避免操作条随滚动消失）
              const toggleInline = () => {
                const primaryText =
                  (segment && segment.isBilingual && segment.foreignText)
                    ? String(segment.foreignText || '')
                    : String(voiceText || '');
                const translationText =
                  (segment && segment.isBilingual && segment.foreignText)
                    ? String(segment.content || '')
                    : '';
                this._toggleVoiceInlineRow(msgEl, primaryText, translationText, msg);
              };
              voiceEl?.addEventListener('click', (e) => {
                  e.preventDefault();
                e.stopPropagation();
                  toggleInline();
              });

              // 双击语音：保留同一行为，避免用户误差
              voiceEl?.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleInline();
              });
            }

            // 头像单击弹菜单：角色头像=角色操作，用户头像=我的面具（普通气泡分支）
            if (!isUser) {
              const avatarInner = msgEl.querySelector('.yd-message__avatar-inner');
              const parsedRoleName = typeof getCharacterName === 'function' ? String(getCharacterName(segment) || '').trim() : '';
              const nameForPat = parsedRoleName || msg.characterName || '';
              const parsedRoleNorm = normalizeRoleName(parsedRoleName);
              const fromParsed = parsedRoleNorm && participantByNormName.has(parsedRoleNorm)
                ? participantByNormName.get(parsedRoleNorm)
                : null;
              const cid = String(msg?.characterId || relatedCharacter?.id || fromParsed?.id || '').trim();
              if (avatarInner && !avatarInner.dataset.ydRoleActionBound) {
                avatarInner.dataset.ydRoleActionBound = '1';
                avatarInner.style.cursor = 'pointer';
                try { console.debug('[chat] bind avatar action menu (bubble)', { msgId: msg?.id, cid }); } catch (e) {}
                avatarInner.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  Chat._showAvatarQuickActions({
                    anchorEl: avatarInner,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    roleId: cid,
                    roleName: nameForPat
                  });
                }, { passive: false });
              }
            } else {
              const avatarInner = msgEl.querySelector('.yd-message__avatar-inner');
              if (avatarInner && !avatarInner.dataset.ydUserActionBound) {
                avatarInner.dataset.ydUserActionBound = '1';
                avatarInner.style.cursor = 'pointer';
                avatarInner.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  Chat._showUserAvatarQuickActions({
                    anchorEl: avatarInner,
                    clientX: e.clientX,
                    clientY: e.clientY
                  });
                }, { passive: false });
              }
            }
            // 文本/语音消息：长按内容触发引用（角色方 + 用户方都支持）
            {
              const contentEl = msgEl.querySelector('.yd-message__content');
              if (contentEl) {
                Chat._attachMessageLongPress(contentEl, {
                  text: Chat._getSegmentQuoteText(segment),
                  fromName: isUser
                    ? (Storage.get('user_name') || '我')
                    : (getCharacterName(segment) || msg.characterName || '')
                });

                // 点击消息：双语先展开译文，再点出编辑/重说；语音由 voiceEl 接管
                if (segment.isBilingual && segment.foreignText) {
                  const biEl = msgEl.querySelector('.yd-bilingual-bubble');
                  this._attachBilingualBubbleClick(biEl, msg, msgEl);
                } else if (segment.messageType !== 'voice_text') {
                  contentEl.addEventListener('click', (e) => {
                    if (e?.target && e.target.closest && e.target.closest('button')) return;
                    Chat._openMsgActionBar({ anchorEl: contentEl, msg });
                  });
                }
              }
            }
            
            appendTo(msgEl);
          }
      });

      if (msg && msg.id != null && this._plainStreamPendingMsgIds.has(String(msg.id))) {
        this._plainStreamPendingMsgIds.delete(String(msg.id));
      }
    });

    // 底部占位：避免最后一条消息被底部输入栏覆盖（只保留一个）
    let spacer = document.getElementById('yd-chat-bottom-spacer');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = 'yd-chat-bottom-spacer';
      spacer.style.width = '1px';
      spacer.style.height = '0px';
      spacer.style.flex = '0 0 auto';
      spacer.style.pointerEvents = 'none';
    }
    // 全量渲染时 appendTo 指向离屏 fragment；增量渲染时指向 scroll。
    // 这里统一以“当前渲染目标”为准，避免全量渲染时因 spacer 已在旧 DOM 尾部而漏加到新 fragment。
    const renderTarget = canIncremental ? scroll : offscreen;
    if (spacer.parentNode !== renderTarget || spacer !== (canIncremental ? scroll.lastElementChild : spacer)) {
      appendTo(spacer);
    }
    if (!canIncremental) {
      // 一次性替换到页面上（避免空白期）
      scroll.replaceChildren(offscreen);
      scroll.dataset.sessionId = sid;
      scroll.dataset.renderedMode = currentMode;
      scroll.dataset.renderedCount = String(this.messages?.length || 0);
      this._forceFullRenderNext = false;
    }


    // 聊天页未激活时（例如 openSession 切页前）只更新渲染结果，不做滚动/底部补偿计算，
    // 避免出现 footerH=0 的错误链路污染后续会话滚动状态。
    if (!isChatPageActive) {
      this._debugTogether('render-dom-inactive', {
        sessionId: sid,
        messageCount: this.messages.length,
        togetherInMessages: this.messages.filter(m => String(m?.content || '').includes('[分享]音乐|一起听|邀请|')).length,
        togetherCardsInDom: scroll.querySelectorAll('.yd-together-card').length,
        canIncremental
      });
      this._updateLoadMoreButtonVisibility();
      scroll.dataset.renderedMode = currentMode;
      scroll.dataset.renderedCount = String(this.messages.length);
      if (this._bulkDeleteMode) this._syncBulkDeleteCheckboxes();
      return;
    }

    this._updateChatBottomPadding();
    this._updateLoadMoreButtonVisibility();

    // 更新“已渲染条数”
    scroll.dataset.renderedMode = currentMode;
    scroll.dataset.renderedCount = String(this.messages.length);
    this._debugTogether('render-dom-active', {
      sessionId: sid,
      messageCount: this.messages.length,
      togetherInMessages: this.messages.filter(m => String(m?.content || '').includes('[分享]音乐|一起听|邀请|')).length,
      togetherCardsInDom: scroll.querySelectorAll('.yd-together-card').length,
      canIncremental
    });

    // 恢复滚动位置
    if (this._forceBottomAfterRender) {
      this._forceBottomAfterRender = false;
      this._scrollChatToBottom();
    } else if (wasNearBottom) {
      this._scrollChatToBottom();
    } else if (container) {
      try {
        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const prevTop = Math.max(0, Math.min(prevTopRaw, maxTop));
        container.scrollTop = prevTop;
      } catch (e) {}
    }
    if (this._bulkDeleteMode) this._syncBulkDeleteCheckboxes();
  },
  
  // 根据名称获取首字母（中文/英文皆可），用于默认占位头像
  _getInitialLetter(name, fallback) {
    const text = String(name || '').trim();
    if (!text) return fallback || '云';
    return text.charAt(0);
  },

  // 从 extensions 中收集正则规则（与角色编辑里的预览思路保持一致）
  _collectRegexRules(extensions) {
    if (!extensions || typeof extensions !== 'object') return [];
    const rules = [];
    const seen = new Set();

    const walk = (node, path = '') => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          const p = path ? `${path}.${k}` : k;
          // 只把明显是“规则容器”的 key 当成规则集合，过滤掉 scriptName/findRegex/replaceString 这些叶子字段
          if (/regex|pattern|rule|script/i.test(k) && !/scriptname|findregex|replacestring/i.test(k)) {
            if (Array.isArray(v)) {
              v.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                const key = JSON.stringify(item);
                if (seen.has(key)) return;
                seen.add(key);

                const enabled = typeof item.enabled === 'boolean' ? item.enabled : true;
                const findRegex = item.findRegex || item.regex || item.pattern || item.find || '';
                const replaceString = item.replaceString || item.replace || item.replacement || '';
                const flags = item.flags || '';
                if (!findRegex) return;
                rules.push({ enabled, findRegex, replaceString, flags });
              });
            } else if (v && typeof v === 'object') {
              const key = JSON.stringify(v);
              if (!seen.has(key)) {
                seen.add(key);
                const enabled = typeof v.enabled === 'boolean' ? v.enabled : true;
                const findRegex = v.findRegex || v.regex || v.pattern || v.find || '';
                const replaceString = v.replaceString || v.replace || v.replacement || '';
                const flags = v.flags || '';
                if (!findRegex) continue;
                rules.push({ enabled, findRegex, replaceString, flags });
              }
            }
          }
          walk(v, p);
        }
      }
    };

    walk(extensions);
    return rules;
  },

  _parseRegexLikeST(findRegex, flagsRaw = '') {
    const src = String(findRegex || '').trim();
    const fallbackFlags = String(flagsRaw || '').trim();
    if (!src) return null;
    // 支持 /pattern/flags（SillyTavern 常见写法）
    if (src.startsWith('/')) {
      let escaped = false;
      let end = -1;
      for (let i = 1; i < src.length; i++) {
        const ch = src[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '/') end = i;
      }
      if (end > 0) {
        const body = src.slice(1, end);
        const f = src.slice(end + 1).trim() || fallbackFlags || 'g';
        return { pattern: body, flags: f };
      }
    }
    return { pattern: src, flags: fallbackFlags || 'g' };
  },

  // 按规则依次替换文本
  _applyRegexRules(text, rules) {
    let result = String(text || '');
    if (!rules || !rules.length) return result;
    for (const rule of rules) {
      if (!rule || rule.enabled === false) continue;
      const parsed = this._parseRegexLikeST(rule.findRegex, rule.flags);
      if (!parsed || !parsed.pattern) continue;
      try {
        const re = new RegExp(parsed.pattern, parsed.flags || 'g');
        const replacement = rule.replaceString != null ? String(rule.replaceString) : '';
        result = result.replace(re, replacement);
      } catch (e) {
        // 正则无效时安全跳过
        continue;
      }
    }
    return result;
  },

  // 解析混合内容：对齐 ST 主链路，统一按文本交给 Markdown + DOMPurify 处理。
  // 返回数组：[{ type: 'text', content: '...' }]
  _parseMixedContent(text) {
    const raw = String(text || '');
    return [{ type: 'text', content: raw }];
  },

  // 语音文本：底部弹框（占位展示文本内容）
  _showVoiceSheet(text) {
    const existing = document.getElementById('yd-voice-sheet');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-voice-sheet';
    overlay.className = 'yd-voice-sheet';
    overlay.innerHTML = `
      <div class="yd-voice-sheet__mask"></div>
      <div class="yd-voice-sheet__panel" role="dialog" aria-modal="true">
        <div class="yd-voice-sheet__title">语音内容</div>
        <div class="yd-voice-sheet__text"></div>
        <button class="yd-btn yd-btn--secondary yd-voice-sheet__close" type="button">关闭</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const textEl = overlay.querySelector('.yd-voice-sheet__text');
    if (textEl) textEl.textContent = String(text || '');

    const close = () => overlay.remove();
    overlay.querySelector('.yd-voice-sheet__mask')?.addEventListener('click', close);
    overlay.querySelector('.yd-voice-sheet__close')?.addEventListener('click', close);
    window.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        close();
        window.removeEventListener('keydown', onKey);
      }
    });
  },

  _buildBilingualBubbleInnerHtml(segment, escFn) {
    const esc = typeof escFn === 'function' ? escFn : (t) => this.escapeHtml(String(t ?? ''));
    const foreign = esc(this._formatMessageLineBreaksForDisplay(String(segment.foreignText || '')));
    const zh = esc(this._formatMessageLineBreaksForDisplay(String(segment.content || '')));
    return (
      '<div class="yd-bilingual-bubble" aria-expanded="false">' +
      '<div class="yd-bilingual-bubble__primary" role="button" tabindex="0" aria-label="外语原文，点击展开或收起翻译">' +
      foreign +
      '</div>' +
      '<div class="yd-bilingual-bubble__extra" hidden>' +
      '<hr class="yd-bilingual-bubble__divider" aria-hidden="true" />' +
      '<div class="yd-bilingual-bubble__translation" role="button" tabindex="0" aria-label="中文翻译，点击编辑或重说">' +
      zh +
      '</div>' +
      '</div></div>'
    );
  },

  _collapseBilingualBubble(bubbleEl, msgEl) {
    if (!bubbleEl) return;
    bubbleEl.classList.remove('is-expanded');
    bubbleEl.setAttribute('aria-expanded', 'false');
    const extra = bubbleEl.querySelector('.yd-bilingual-bubble__extra');
    if (extra) extra.hidden = true;
    if (msgEl) msgEl.classList.remove('yd-message--bilingual-expanded');
  },

  _expandBilingualBubble(bubbleEl, msgEl) {
    if (!bubbleEl) return;
    bubbleEl.classList.add('is-expanded');
    bubbleEl.setAttribute('aria-expanded', 'true');
    const extra = bubbleEl.querySelector('.yd-bilingual-bubble__extra');
    if (extra) extra.hidden = false;
    if (msgEl) msgEl.classList.add('yd-message--bilingual-expanded');
  },

  _getSegmentSpeakText(segment) {
    if (!segment) return '';
    if (segment.isBilingual && String(segment.foreignText || '').trim()) {
      return String(segment.foreignText).trim();
    }
    return String(segment.content || '').trim();
  },

  _getSegmentQuoteText(segment) {
    if (!segment) return '';
    if (String(segment.messageType || '') === 'voice_text') {
      return `[语音] ${String(segment.content || '').trim()}`;
    }
    if (segment.isBilingual) return this._getSegmentSpeakText(segment);
    return String(segment.content || '').trim();
  },

  _attachBilingualBubbleClick(bubbleEl, msg, msgEl) {
    if (!bubbleEl) return;
    const primary = bubbleEl.querySelector('.yd-bilingual-bubble__primary');
    const translation = bubbleEl.querySelector('.yd-bilingual-bubble__translation');

    if (primary) {
      primary.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (bubbleEl.classList.contains('is-expanded')) {
          this._collapseBilingualBubble(bubbleEl, msgEl);
        } else {
          this._expandBilingualBubble(bubbleEl, msgEl);
        }
      });
    }

    const openActionBar = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!bubbleEl.classList.contains('is-expanded')) return;
      const anchor = msgEl?.querySelector('.yd-message__content') || bubbleEl;
      Chat._openMsgActionBar({ anchorEl: anchor, msg });
    };

    if (translation) {
      translation.addEventListener('click', openActionBar);
    }
  },

  // 语音文本：在该消息“下面插入一条独立行”展开/收起（不影响原气泡宽度）
  // - 点击原文：展开/收起翻译
  // - 点击翻译：弹出编辑/重说/删除
  _toggleVoiceInlineRow(messageEl, primaryText, translationText = '', msgForActionBar = null) {
    if (!messageEl) return;

    const container = this._getChatScrollContainer ? this._getChatScrollContainer() : null;
    const wasNearBottom = this._isNearBottom ? this._isNearBottom(container, 28) : false;

    const next = messageEl.nextElementSibling;
    if (next && next.classList && next.classList.contains('yd-voice-inline-row')) {
      next.remove();
      return;
    }

    // 打开当前之前，先关闭其它已展开的
    document.querySelectorAll('.yd-voice-inline-row').forEach(el => el.remove());

    const isUser = messageEl.classList.contains('yd-message--user');
    const row = document.createElement('div');
    row.className = `yd-message yd-voice-inline-row${isUser ? ' yd-message--user' : ''}`;
    const primary = String(primaryText || '');
    const translation = String(translationText || '');
    const hasTranslation = !!translation.trim();

    // 保留头像列占位（隐藏），保证对齐到该消息的内容区域
    const primaryHtml = this.escapeHtml(this._formatMessageLineBreaksForDisplay(primary));
    const translationHtml = this.escapeHtml(this._formatMessageLineBreaksForDisplay(translation));
    row.innerHTML =
      `<div class="yd-message__avatar yd-message__avatar--hidden" aria-hidden="true"><div class="yd-message__avatar-inner"></div></div>` +
      `<div class="yd-message__body"><div class="yd-voice-inline" data-has-translation="${hasTranslation ? '1' : '0'}">` +
      `<div class="yd-voice-inline__primary">${primaryHtml}</div>` +
      (hasTranslation
        ? `<div class="yd-voice-inline__extra" hidden><hr class="yd-bilingual-bubble__divider" aria-hidden="true" /><div class="yd-voice-inline__translation" role="button" tabindex="0">${translationHtml}</div></div>`
        : '') +
      `</div></div>`;

    messageEl.insertAdjacentElement('afterend', row);

    const primaryEl = row.querySelector('.yd-voice-inline__primary');
    const extraEl = row.querySelector('.yd-voice-inline__extra');
    const translationEl = row.querySelector('.yd-voice-inline__translation');
    const toggleExtra = () => {
      if (!hasTranslation || !extraEl) return;
      extraEl.hidden = !extraEl.hidden;
    };
    if (primaryEl) {
      primaryEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (hasTranslation) {
          toggleExtra();
          return;
        }
    if (msgForActionBar) {
          Chat._openMsgActionBar({ anchorEl: primaryEl, msg: msgForActionBar });
        }
      });
    }
    if (translationEl) {
      translationEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!msgForActionBar) return;
        if (extraEl && extraEl.hidden) return;
        Chat._openMsgActionBar({ anchorEl: translationEl, msg: msgForActionBar });
      });
    }

    // 语音展开后需要让新插入行“显示在底部输入框上方”
    try { this._updateChatBottomPadding?.(); } catch (e) {}
    try {
      if (container) {
        if (wasNearBottom) {
          // 如果用户本来就在底部，则保持滚动落在最新内容处
          this._scrollChatToBottom?.();
        } else {
          // 非底部展开：微调 scrollTop 让 row 可见
          const cRect = container.getBoundingClientRect();
          const rRect = row.getBoundingClientRect();
          const gap = 10;
          if (rRect.bottom > cRect.bottom - gap) {
            const delta = (rRect.bottom - (cRect.bottom - gap));
            container.scrollTop = (container.scrollTop || 0) + delta;
          } else if (rRect.top < cRect.top + gap) {
            const delta = ((cRect.top + gap) - rRect.top);
            container.scrollTop = (container.scrollTop || 0) - delta;
          }
        }
      } else {
        row.scrollIntoView({ block: 'nearest' });
      }
    } catch (e) {}
  },
  
  async _playVoiceText(text, bubbleEl, msg, segmentCharacterName) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    const key = (typeof Storage !== 'undefined' && Storage.get)
      ? (Storage.get(CONFIG.STORAGE_KEYS.VOICE_API_KEY) || '').trim()
      : '';
    const model = (typeof Storage !== 'undefined' && Storage.get)
      ? (Storage.get(CONFIG.STORAGE_KEYS.VOICE_MODEL) || 'speech-2.8-hd').trim()
      : 'speech-2.8-hd';
    const defaultVoiceId = (typeof Storage !== 'undefined' && Storage.get)
      ? (Storage.get(CONFIG.STORAGE_KEYS.VOICE_ID) || '').trim()
      : '';
    let roleVoiceId = '';
    try {
      const msgRole = String(msg?.role || '').trim();
      const charId = String(msg?.characterId || '').trim();
      const charName = String(segmentCharacterName || msg?.characterName || '').trim();
      if (msgRole === 'assistant' && (charId || charName)) {
        // 语音播放要命中“刚改过的角色音色”，强制刷新角色缓存
        const map = await this.getCharacterMap(true);
        let c = null;
        if (charId) c = map.get(String(charId)) || null;
        if (!c && charName) {
          c = Array.from(map.values()).find(it => String(it?.name || '').trim() === charName) || null;
        }
        const roleVoice = (c && typeof c === 'object' && c.role_voice && typeof c.role_voice === 'object')
          ? c.role_voice
          : null;
        roleVoiceId = String(roleVoice?.voice_id || '').trim();
      }
    } catch (e) {}
    const voiceId = roleVoiceId || defaultVoiceId;

    if (!key || !voiceId) {
      alert('请先在“设置 - 语音设置”中配置 API Key 和默认音色');
      return;
    }

    const url = 'https://api.minimaxi.com/v1/t2a_v2';
    const body = {
      model,
      text: cleanText,
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

    // 切换 UI 状态：标记当前气泡为“播放中”，按钮改为方形
    if (bubbleEl && bubbleEl.classList) {
      bubbleEl.classList.add('yd-voice-bubble--playing');
      this._voicePlayingBubble = bubbleEl;
      this._setVoicePlayButtonIcon(bubbleEl, true);
    }

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
      console.error('Chat._playVoiceText request error:', e);
      if (bubbleEl) {
        bubbleEl.classList.remove('yd-voice-bubble--playing');
        this._setVoicePlayButtonIcon(bubbleEl, false);
      }
      this._voicePlayingBubble = null;
      alert('语音播放失败，请检查网络或语音设置');
      return;
    }

    let json;
    try {
      json = await resp.json();
    } catch (e) {
      console.error('Chat._playVoiceText parse error:', e);
      if (bubbleEl) {
        bubbleEl.classList.remove('yd-voice-bubble--playing');
        this._setVoicePlayButtonIcon(bubbleEl, false);
      }
      this._voicePlayingBubble = null;
      alert('语音播放失败：响应解析错误');
      return;
    }

    if (!resp.ok || (json?.base_resp?.status_code && json.base_resp.status_code !== 0)) {
      const msg = json?.base_resp?.status_msg || `HTTP ${resp.status}`;
      console.error('Chat._playVoiceText failed:', json);
      if (bubbleEl) {
        bubbleEl.classList.remove('yd-voice-bubble--playing');
        this._setVoicePlayButtonIcon(bubbleEl, false);
      }
      this._voicePlayingBubble = null;
      alert(`语音播放失败：${msg}`);
      return;
    }

    const hexAudio = json?.data?.audio;
    if (!hexAudio) {
      if (bubbleEl) {
        bubbleEl.classList.remove('yd-voice-bubble--playing');
        this._setVoicePlayButtonIcon(bubbleEl, false);
      }
      this._voicePlayingBubble = null;
      alert('语音播放失败：未返回音频数据');
      return;
    }

    // 注意：时长始终显示“估算值”，不使用 audio_length 覆盖，也不持久化保存

    const bytes = (typeof Settings !== 'undefined' && Settings._hexToBytes)
      ? Settings._hexToBytes(hexAudio)
      : (function toBytes(hex) {
          const clean = String(hex || '').trim();
          const out = new Uint8Array(Math.floor(clean.length / 2));
          for (let i = 0; i < out.length; i++) {
            out[i] = parseInt(clean.substr(i * 2, 2), 16);
          }
          return out;
        })(hexAudio);

    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const objectUrl = URL.createObjectURL(blob);

    if (!this._voiceAudioEl) {
      const audio = document.createElement('audio');
      audio.style.display = 'none';
      audio.setAttribute('aria-hidden', 'true');
      document.body.appendChild(audio);
      this._voiceAudioEl = audio;
    }

    const audioEl = this._voiceAudioEl;
    try {
      audioEl.pause();
    } catch (e) {}
    audioEl.src = objectUrl;

    const stopPlaying = () => {
      this._stopVoicePlayback();
    };
    this._voiceStopHandler = stopPlaying;
    audioEl.addEventListener('ended', stopPlaying, { once: true });
    audioEl.addEventListener('error', stopPlaying, { once: true });

    try {
      await audioEl.play();
    } catch (e) {
      console.error('Chat._playVoiceText play error:', e);
      stopPlaying();
    }
  },

  _setVoicePlayButtonIcon(bubbleEl, playing) {
    const btn = bubbleEl?.querySelector('.yd-voice-bubble__play');
    if (!btn) return;
    btn.classList.toggle('yd-voice-bubble__play--playing', !!playing);
    btn.setAttribute('aria-label', playing ? '停止播放' : '播放语音');
  },

  _stopVoicePlayback() {
    const bubbleEl = this._voicePlayingBubble;
    if (!bubbleEl) return;
    if (this._voiceAudioEl) {
      try { this._voiceAudioEl.pause(); } catch (e) {}
      this._voiceAudioEl.removeAttribute('src');
      if (this._voiceStopHandler) {
        this._voiceAudioEl.removeEventListener('ended', this._voiceStopHandler);
        this._voiceAudioEl.removeEventListener('error', this._voiceStopHandler);
        this._voiceStopHandler = null;
      }
    }
    bubbleEl.classList.remove('yd-voice-bubble--playing');
    this._setVoicePlayButtonIcon(bubbleEl, false);
    this._voicePlayingBubble = null;
  },

  _typingForSessionId: null,
  _togetherStatusReqId: 0,

  _getApiChatTimeoutMs() {
    const n = Number(CONFIG && CONFIG.API_CHAT_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 301000;
  },

  _fetchWithTimeout(url, init = {}, ms) {
    const timeout = Number.isFinite(ms) && ms > 0 ? ms : this._getApiChatTimeoutMs();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl
      ? setTimeout(() => {
          try {
            ctrl.abort();
          } catch (e) {}
        }, timeout)
      : null;
    return fetch(url, ctrl ? { ...init, signal: ctrl.signal } : init).finally(() => {
      if (timer) clearTimeout(timer);
    });
  },

  _clearTypingIfMatches(sessionId) {
    const sid = String(sessionId || '').trim();
    const tid = String(this._typingForSessionId ?? '').trim();
    if (!tid || (sid && tid === sid)) {
      this._setTypingStatus(false);
    }
  },

  _setTypingStatus(isTyping, forSessionId) {
    if (isTyping) {
      const raw = forSessionId != null ? String(forSessionId) : String(this.currentSessionId || '');
      const t = raw.trim();
      this._typingForSessionId = t || null;
    } else {
      this._typingForSessionId = null;
    }
    this._updateTypingDisplay();
  },

  _updateTypingDisplay() {
    const titleEl = document.querySelector('#page-chat .yd-page-header__center.yd-chat-title');
    const statusEl = document.querySelector('#page-chat .yd-chat-title__status');
    const textEl = document.querySelector('#page-chat .yd-chat-title__status-text');
    if (!textEl) return;
    const sid = String(this.currentSessionId ?? '').trim();
    const tid = String(this._typingForSessionId ?? '').trim();
    const showTyping = !!tid && sid === tid;
    const togetherEnabled = !!(this.currentSession?.togetherListening?.enabled) && this._getCurrentSessionMode() !== 1;
    let idle = '在线';
    try {
      if (this._getCurrentSessionMode() === 1) idle = '线下';
      else if (togetherEnabled) idle = '一起听歌中';
    } catch (e) {}
    if (showTyping) {
      if (statusEl) statusEl.classList.remove('is-together');
      if (titleEl) titleEl.classList.remove('is-together');
      textEl.textContent = '正在输入中...';
      return;
    }
    if (togetherEnabled) {
      if (statusEl) statusEl.classList.add('is-together');
      if (titleEl) titleEl.classList.add('is-together');
      textEl.textContent = idle;
      this._updateTogetherStatusMarquee(this.currentSession).catch(() => {});
      return;
    }
    if (statusEl) statusEl.classList.remove('is-together');
    if (titleEl) titleEl.classList.remove('is-together');
    textEl.textContent = idle;
  },

  async _updateTogetherStatusMarquee(session) {
    const reqId = ++this._togetherStatusReqId;
    const textEls = document.querySelectorAll('#page-chat .yd-chat-title__together-text');
    if (!textEls || !textEls.length) return;
    const trackId = String(session?.togetherListening?.trackId || '').trim();
    let title = '';
    let artist = '';
    try {
      const cur = (typeof Music !== 'undefined' && Music) ? Music._currentTrack : null;
      if (cur && String(cur?.id || '') === trackId) {
        title = String(cur?.title || '').trim();
        artist = String(cur?.artist || '').trim();
      }
    } catch (e) {}
    if (!title && trackId) {
      try {
        const row = await Storage.dbGet('tracks', trackId);
        title = String(row?.title || '').trim();
        artist = String(row?.artist || '').trim();
      } catch (e) {}
    }
    if (reqId !== this._togetherStatusReqId) return;
    const text = title
      ? `一起听歌中 · 正在听 ${title} - ${artist || '未知歌手'}`
      : '一起听歌中 · 正在听 音乐';
    textEls.forEach((el) => { el.textContent = text; });
  },

  async _openTogetherPlayerFromSession(trackId = '') {
    try {
      if (typeof Music !== 'undefined' && Music) {
        const curSid = String(this.currentSessionId || '').trim();
        let sess = null;
        try { sess = await Storage.dbGet('sessions', curSid); } catch (e0) {}
        if (!sess) sess = this.currentSession;
        const enabled = !!sess?.togetherListening?.enabled;
        if (!enabled) {
          alert('已退出一起听');
          return;
        }
        const trackIdFinal = String(trackId || sess?.togetherListening?.trackId || '').trim();

        try {
          const prevSid = String(Music._playerTogetherSessionId || '').trim();
          if (Music._playerTogetherMode && prevSid && prevSid !== curSid && typeof Music._exitTogetherMode === 'function') {
            await Music._exitTogetherMode();
          }
        } catch (e1) {}

        Music._playerTogetherMode = true;
        Music._playerTogetherSessionId = curSid;
        Music._playerTogetherTrackId = trackIdFinal;
        Music._playerTogetherStartedAt = Number(sess?.togetherListening?.startedAt || Date.now());
        Music._playerBackToChatSessionId = curSid;
        if (typeof Music._persistTogetherState === 'function') {
          await Music._persistTogetherState();
        }
        if (typeof Music._hydratePlayerUserAvatar === 'function') {
          await Music._hydratePlayerUserAvatar();
        }
        if (typeof Music._hydrateRoleAvatarsFromSession === 'function') {
          await Music._hydrateRoleAvatarsFromSession(sess);
        }
        if (trackIdFinal && typeof Music._ensureCurrentTrackById === 'function') {
          await Music._ensureCurrentTrackById(trackIdFinal, false);
        }
        if (typeof Music.openPlayerPage === 'function') {
          Music.openPlayerPage();
          return;
        }
      }
      if (typeof State !== 'undefined' && State && typeof State.switchPage === 'function') {
        State.switchPage('page-music-player');
      }
    } catch (err) {
      console.error('[together] open player failed', err);
    }
  },

  _getCurrentSessionMode() {
    const m = this.currentSession && this.currentSession.mode != null
      ? Number(this.currentSession.mode)
      : 0;
    return m === 1 ? 1 : 0;
  },

  _normalizeMsgModeForApi(m) {
    const mm = m && m.mode != null ? (Number(m.mode) === 1 ? 1 : 0) : 0;
    return mm === 1 ? 1 : 0;
  },

  _storedMsgModeRaw(m) {
    if (!m || m.mode == null || String(m.mode) === '') return null;
    return Number(m.mode) === 1 ? 1 : 0;
  },

  _messageLooksOfflineByContent(m) {
    if (!m) return false;
    if (m._offlineOpeningGreeting || m._offlineOpeningError || m._offlineOpeningPending) return true;
    const text = String(m.content || '');
    if (!text.trim()) return false;
    const lines = text.split('\n');
    for (const raw of lines) {
      const line = String(raw || '').trim();
      if (!line) continue;
      if (/^\[(?:对白|对话)(?:\|[^\]]+)?\]/i.test(line)) return true;
    }
    return false;
  },

  /** 列表过滤：识别误标为线上的线下消息；无 mode 时按边界与当前视图推断 */
  _msgModeForDisplayFilter(m, session, currentMode) {
    const stored = this._storedMsgModeRaw(m);
    if (stored != null) {
      if (stored === 0 && this._messageLooksOfflineByContent(m)) return 1;
      return stored;
    }
    if (this._messageLooksOfflineByContent(m)) return 1;
    const cm = currentMode === 1 ? 1 : 0;
    const boundaryTs = session && session.modeEntryBoundaryCreatedAt != null
      ? Number(session.modeEntryBoundaryCreatedAt)
      : 0;
    const ts = Number(m.createdAt) || 0;
    if (cm === 1 && boundaryTs > 0 && ts > boundaryTs) return 1;
    if (cm === 1) return 0;
    return 0;
  },

  /** 切换模式时：仅为刚结束的那一段补 mode，避免把更早的线下整段误标成线上 */
  async _backfillSessionMessageModesUpToBoundary(sessionId, boundaryCreatedAt, sourceMode, boundaryMessageId) {
    const sid = String(sessionId || '').trim();
    const boundaryTs = Number(boundaryCreatedAt) || 0;
    const leavingMode = sourceMode === 1 ? 1 : 0;
    const tagMode = leavingMode === 1 ? 1 : 0;
    if (!sid || boundaryTs <= 0) return;

    let all = [];
    try {
      all = await Storage.dbGetAll('messages');
    } catch (e) {
      return;
    }

    const rows = (Array.isArray(all) ? all : [])
      .filter((m) => m && String(m.sessionId || '') === sid)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => !m._localOnly)
      .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));

    if (!rows.length) return;

    let startIdx = -1;
    const bid = boundaryMessageId != null ? String(boundaryMessageId) : '';
    if (bid) startIdx = rows.findIndex((m) => String(m.id || '') === bid);
    if (startIdx < 0) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if ((Number(rows[i].createdAt) || 0) <= boundaryTs) {
          startIdx = i;
          break;
        }
      }
    }
    if (startIdx < 0) return;

    for (let i = startIdx; i >= 0; i--) {
      const m = rows[i];
      const stored = this._storedMsgModeRaw(m);
      if (leavingMode === 0) {
        if (stored === 1) break;
        if (this._messageLooksOfflineByContent(m)) break;
        if (stored === 0) continue;
        try {
          await Storage.dbPut('messages', { ...m, mode: tagMode });
        } catch (e2) {}
        continue;
      }
      if (stored === 0) break;
      if (stored === 1) continue;
      try {
        await Storage.dbPut('messages', { ...m, mode: tagMode });
      } catch (e3) {}
    }
  },

  _messageLooksOnlineByContent(m) {
    if (!m) return false;
    const text = String(m.content || '');
    if (!text.trim()) return false;
    const lines = text.split('\n');
    for (const raw of lines) {
      const line = String(raw || '').trim();
      if (!line) continue;
      if (/^\[(?:消息|分享|图片|表情包|语音|转账|红包|收取转账|收取红包|邀请|系统)(?:\|[^\]]+)?\]/i.test(line)) {
        return true;
      }
      return false;
    }
    return false;
  },

  _shouldAbsorbIntoOfflineIsland(m) {
    if (!m) return false;
    if (this._messageLooksOnlineByContent(m)) return false;
    const stored = this._storedMsgModeRaw(m);
    if (stored === 1) return true;
    if (this._messageLooksOfflineByContent(m)) return true;
    if (stored === 0) return true;
    return true;
  },

  /** 修复已误标 mode=0 的线下消息，避免 UI 只显示「线上片段」合并卡 */
  async _repairMislabeledOfflineModesInSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    let all = [];
    try {
      all = await Storage.dbGetAll('messages');
    } catch (e) {
      return false;
    }

    const rows = (Array.isArray(all) ? all : [])
      .filter((m) => m && String(m.sessionId || '') === sid)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => !m._localOnly)
      .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));

    if (!rows.length) return false;

    const ranges = [];
    for (let i = 0; i < rows.length; i++) {
      const stored = this._storedMsgModeRaw(rows[i]);
      const anchor = stored === 1 || this._messageLooksOfflineByContent(rows[i]);
      if (!anchor) continue;
      let start = i;
      let end = i;
      while (start > 0 && this._shouldAbsorbIntoOfflineIsland(rows[start - 1])) start -= 1;
      while (end < rows.length - 1 && this._shouldAbsorbIntoOfflineIsland(rows[end + 1])) end += 1;
      ranges.push([start, end]);
      i = end;
    }

    if (!ranges.length) {
      let changed = false;
      for (const m of rows) {
        if (this._storedMsgModeRaw(m) !== 0) continue;
        if (!this._messageLooksOfflineByContent(m)) continue;
        try {
          await Storage.dbPut('messages', { ...m, mode: 1 });
          changed = true;
        } catch (e2) {}
      }
      return changed;
    }

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach(([s, e]) => {
      const last = merged[merged.length - 1];
      if (!last || s > last[1] + 1) merged.push([s, e]);
      else last[1] = Math.max(last[1], e);
    });

    let changed = false;
    for (const [start, end] of merged) {
      for (let i = start; i <= end; i++) {
        const m = rows[i];
        if (this._storedMsgModeRaw(m) === 1) continue;
        if (this._messageLooksOnlineByContent(m)) continue;
        try {
          await Storage.dbPut('messages', { ...m, mode: 1 });
          changed = true;
        } catch (e3) {}
      }
    }
    return changed;
  },

  /** 聊天列表渲染：当前会话 mode + 切换边界时间，决定是否展示该条消息 */
  _shouldShowMessageInCurrentMode(m, session, currentMode) {
    if (!m) return false;
    const cm = currentMode === 1 ? 1 : 0;
    const msgMode = this._msgModeForDisplayFilter(m, session, currentMode);

    if (m._sparkNotice) return msgMode === cm;
    if (m._moneyCollectNotice) return msgMode === cm;

    const isProactivePush = !!m._proactivePush || String(m.id || '').startsWith('push_');
    if (isProactivePush) {
      if (msgMode === cm) return true;
      // 线上视图：主动推送 mode 异常时仍展示（旧数据/切换模式兼容）
      return cm === 0;
    }

    if (m.role === 'memory') return false;

    const boundaryTs = session && session.modeEntryBoundaryCreatedAt != null
      ? Number(session.modeEntryBoundaryCreatedAt)
      : 0;
    const ts = Number(m.createdAt) || 0;

    // 仅在线下视图：边界前只隐藏线上消息，保留本会话全部历史线下气泡（再进线下仍可见上一轮）
    if (cm === 1 && boundaryTs > 0 && ts > 0 && ts <= boundaryTs && msgMode === 0) {
      return false;
    }

    // 线上视图：边界之后写入的助手消息，即使误标为线下 mode 也展示
    if (cm === 0 && m.role === 'assistant' && msgMode === 1 && boundaryTs > 0 && ts > boundaryTs) {
      return true;
    }

    return msgMode === cm;
  },

  _stripAssistantSuggestedReplyLinesForApi(text) {
    const lines = String(text || '').split('\n');
    const kept = lines.filter((line) => !/^\s*\[建议回复(?:\|[^\]]+)?\]/.test(String(line || '')));
    return kept.join('\n').trim();
  },

  async _resolveUserDisplayNameForApi(session) {
    const defaultName = '用户';
    let name = '';
    try {
      const curMask = await this._getEffectiveMaskForSession(session);
      name = String(curMask?.name || '').trim();
    } catch (e) {}
    if (name) return name;
    try {
      const raw = await Storage.maskGetCurrent();
      name = String(raw?.name || '').trim();
    } catch (e2) {}
    return name || defaultName;
  },

  async _buildCharacterNameResolverForApi(session) {
    const ids = Array.isArray(session?.participantCharacterIds)
      ? session.participantCharacterIds.filter(Boolean).map((x) => String(x))
      : [];
    const mapById = new Map();
    if (ids.length) {
      try {
        const cmap = await this.getCharacterMap(true);
        ids.forEach((id) => {
          const c = cmap.get(id);
          if (!c) return;
          mapById.set(id, String(c.name || '').trim() || '角色');
        });
      } catch (e) {}
    }
    return (m) => {
      const n = String(m?.characterName || '').trim();
      if (n) return n;
      const cid = String(m?.characterId || '').trim();
      if (cid && mapById.has(cid)) return mapById.get(cid);
      return '角色';
    };
  },

  _buildDynamicMergedAssistantBlock(segMessages, segMode, userDisplayName, characterNameOf, includeOnlineUserTime, sessionSummaryText = '') {
    const rows = [];
    const modeLabel = segMode === 1 ? '线下片段' : '线上片段';
    rows.push(`【跨模式历史合并记录｜${modeLabel}】`);
    rows.push('');
    const summary = String(sessionSummaryText || '').trim();
    if (summary) {
      rows.push('【会话总结】');
      rows.push(summary);
      rows.push('');
      rows.push('【实时历史片段】');
      rows.push('');
    }
    (Array.isArray(segMessages) ? segMessages : []).forEach((m) => {
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
      const isUser = m.role === 'user';
      const roleName = isUser
        ? (String(userDisplayName || '').trim() || '用户')
        : (String(characterNameOf(m) || '').trim() || '角色');
      let text = String(m.content || '').trim();
      if (!text) return;
      if (!isUser) {
        text = this._stripAssistantSuggestedReplyLinesForApi(text);
        if (!text) return;
      }
      rows.push(`${roleName}：${text}`);
      if (includeOnlineUserTime && isUser && segMode === 0) {
        const t = this._formatSessionMemorySummaryTime(Number(m.createdAt));
        if (t) rows.push(`时间：${t}`);
      }
    });
    if (rows.length <= 3) return null;
    return {
      role: 'assistant',
      content: rows.join('\n')
    };
  },

  _getLatestSessionSummaryText(session) {
    const s = session && typeof session === 'object' ? session : null;
    if (!s) return '';
    const history = Array.isArray(s.memoryEnhanceHistory) ? s.memoryEnhanceHistory : [];
    const enabled = history.filter((e) => e && e.enabled !== false && String(e.text || '').trim());
    if (!enabled.length) return '';
    enabled.sort((a, b) => Number(a.userRoundFrom || 0) - Number(b.userRoundFrom || 0));
    return enabled.map((e) => String(e.text || '').trim()).join('\n');
  },

  _isDynamicMergedHistoryAssistantMessage(m) {
    if (!m || m.role !== 'assistant') return false;
    const text = String(m.content || '').trim();
    return /^【跨模式历史合并记录｜(?:线上片段|线下片段)】/.test(text);
  },

  _composeDisplayMessagesWithDynamicMemoryCards(baseMessages, packedHistory, currentMode) {
    const real = Array.isArray(baseMessages) ? baseMessages.slice() : [];
    const packed = Array.isArray(packedHistory) ? packedHistory : [];
    if (!real.length || !packed.length) return real;

    const realIndexById = new Map();
    real.forEach((m, idx) => {
      if (!m || m.id == null) return;
      realIndexById.set(String(m.id), idx);
    });

    const inserts = [];
    packed.forEach((item, idx) => {
      const isDynamicMerged = this._isDynamicMergedHistoryAssistantMessage(item);
      // 注意：跨会话记忆不在任何会话 UI 中展示卡片（仅用于 API history 注入）。
      if (!isDynamicMerged) return;
      const content = String(item.content || '').trim();
      if (!content) return;

      let prevRealIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        const p = packed[i];
        if (!p || this._isDynamicMergedHistoryAssistantMessage(p)) continue;
        const rid = p.id != null ? String(p.id) : '';
        if (rid && realIndexById.has(rid)) {
          prevRealIdx = realIndexById.get(rid);
          break;
        }
      }

      let nextRealIdx = -1;
      for (let i = idx + 1; i < packed.length; i++) {
        const p = packed[i];
        if (!p || this._isDynamicMergedHistoryAssistantMessage(p)) continue;
        const rid = p.id != null ? String(p.id) : '';
        if (rid && realIndexById.has(rid)) {
          nextRealIdx = realIndexById.get(rid);
          break;
        }
      }

      let insertAfter = prevRealIdx;
      if (insertAfter < 0 && nextRealIdx >= 0) insertAfter = nextRealIdx - 1;
      inserts.push({
        insertAfter,
        msg: {
          id: `dynamic-memory-${String(currentMode)}-${String(idx)}`,
          role: 'memory',
          mode: currentMode,
          _dynamicMemory: true,
          content
        }
      });
    });

    if (!inserts.length) return real;
    inserts.sort((a, b) => a.insertAfter - b.insertAfter);
    const out = real.slice();
    let offset = 0;
    inserts.forEach((it) => {
      const pos = Math.max(0, Math.min(out.length, it.insertAfter + 1 + offset));
      out.splice(pos, 0, it.msg);
      offset += 1;
    });
    return out;
  },

  _getCrossSessionMemorySettings() {
    const keyApiMaxTokens = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_MAX_TOKENS)
      ? CONFIG.STORAGE_KEYS.API_MAX_TOKENS
      : 'api_max_tokens';
    const keyEnabled = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CROSS_SESSION_MEMORY_ENABLED)
      ? CONFIG.STORAGE_KEYS.CROSS_SESSION_MEMORY_ENABLED
      : 'cross_session_memory_enabled';
    const keyMaxMessages = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CROSS_SESSION_MEMORY_MAX_MESSAGES)
      ? CONFIG.STORAGE_KEYS.CROSS_SESSION_MEMORY_MAX_MESSAGES
      : 'cross_session_memory_max_messages';
    const keyMaxChars = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CROSS_SESSION_MEMORY_MAX_CHARS)
      ? CONFIG.STORAGE_KEYS.CROSS_SESSION_MEMORY_MAX_CHARS
      : 'cross_session_memory_max_chars';
    const keyIncludePartial = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.CROSS_SESSION_MEMORY_INCLUDE_PARTIAL_GROUP)
      ? CONFIG.STORAGE_KEYS.CROSS_SESSION_MEMORY_INCLUDE_PARTIAL_GROUP
      : 'cross_session_memory_include_partial_group';

    const enabledRaw = String(Storage.get(keyEnabled) || (CONFIG && CONFIG.DEFAULT_CROSS_SESSION_MEMORY_ENABLED) || 'on').trim().toLowerCase();
    const includePartialRaw = String(Storage.get(keyIncludePartial) || (CONFIG && CONFIG.DEFAULT_CROSS_SESSION_MEMORY_INCLUDE_PARTIAL_GROUP) || 'on').trim().toLowerCase();
    const maxMessagesRaw = Number(Storage.get(keyMaxMessages));
    const maxCharsRaw = Number(Storage.get(keyMaxChars));
    const storedMaxTok = Storage.get(keyApiMaxTokens);
    const apiMaxTokensRaw = Number(storedMaxTok != null && storedMaxTok !== '' ? storedMaxTok : '');
    const apiMaxTokensText = String(
      storedMaxTok != null && storedMaxTok !== ''
        ? storedMaxTok
        : ((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS !== undefined && CONFIG.DEFAULT_API_MAX_TOKENS !== null)
          ? CONFIG.DEFAULT_API_MAX_TOKENS
          : 'unlimited')
    ).trim().toLowerCase();
    const apiUnlimited = apiMaxTokensText === 'unlimited';
    const apiMaxTokensDefault = Number(CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS);
    const apiMaxTokens = apiUnlimited
      ? 2000000
      : (Number.isFinite(apiMaxTokensRaw) && apiMaxTokensRaw > 0
      ? Math.floor(apiMaxTokensRaw)
      : (Number.isFinite(apiMaxTokensDefault) && apiMaxTokensDefault > 0 ? Math.floor(apiMaxTokensDefault) : 2000000));
    const maxMessagesDefault = Number(CONFIG && CONFIG.DEFAULT_CROSS_SESSION_MEMORY_MAX_MESSAGES);
    const maxCharsDefault = Number(CONFIG && CONFIG.DEFAULT_CROSS_SESSION_MEMORY_MAX_CHARS);
    const tokenDrivenChars = Math.max(6000, apiMaxTokens * 16);
    const tokenDrivenMessages = Math.max(60, Math.floor(apiMaxTokens / 8));
    const maxMessages = Number.isFinite(maxMessagesRaw) && maxMessagesRaw > 0
      ? Math.floor(maxMessagesRaw)
      : (Number.isFinite(maxMessagesDefault) && maxMessagesDefault > 0 ? Math.floor(maxMessagesDefault) : tokenDrivenMessages);
    const maxChars = Number.isFinite(maxCharsRaw) && maxCharsRaw > 0
      ? Math.floor(maxCharsRaw)
      : (Number.isFinite(maxCharsDefault) && maxCharsDefault > 0 ? Math.floor(maxCharsDefault) : tokenDrivenChars);
    return {
      enabled: enabledRaw !== 'off' && enabledRaw !== '0' && enabledRaw !== 'false',
      includePartialGroup: includePartialRaw !== 'off' && includePartialRaw !== '0' && includePartialRaw !== 'false',
      maxMessages,
      maxChars
    };
  },

  _getSessionParticipantIdsForCrossMemory(session) {
    const ids = Array.isArray(session?.participantCharacterIds) ? session.participantCharacterIds : [];
    const normalized = ids.map((x) => String(x || '').trim()).filter(Boolean);
    if (normalized.length) return Array.from(new Set(normalized));
    const legacy = String(session?.characterId || '').trim();
    return legacy ? [legacy] : [];
  },

  _getRelatedSessionsForCrossMemory(currentSession, allSessions, includePartialGroup = true, allMessages = []) {
    const sessionRoleMap = new Map();
    (Array.isArray(allMessages) ? allMessages : []).forEach((m) => {
      if (!m) return;
      const sid = String(m.sessionId || '').trim();
      const cid = String(m.characterId || '').trim();
      if (!sid || !cid) return;
      if (!sessionRoleMap.has(sid)) sessionRoleMap.set(sid, new Set());
      sessionRoleMap.get(sid).add(cid);
    });

    const resolveIds = (session) => {
      const fromStruct = this._getSessionParticipantIdsForCrossMemory(session);
      if (fromStruct.length) return fromStruct;
      const sid = String(session?.id || '').trim();
      if (!sid || !sessionRoleMap.has(sid)) return [];
      return Array.from(sessionRoleMap.get(sid));
    };

    const currentIds = resolveIds(currentSession);
    if (!currentIds.length) return [];
    const currentIdSet = new Set(currentIds);
    const currentSid = String(currentSession?.id || '').trim();
    const currentIsSingle = currentIds.length === 1;
    const currentSize = currentIds.length;
    const list = Array.isArray(allSessions) ? allSessions : [];

    const rows = [];
    list.forEach((s) => {
      if (!s) return;
      const sid = String(s.id || '').trim();
      if (!sid || sid === currentSid) return;
      const ids = resolveIds(s);
      if (!ids.length) return;
      const overlap = ids.filter((id) => currentIdSet.has(id));
      if (!overlap.length) return;
      const isSingle = ids.length === 1;
      let hit = false;
      if (currentIsSingle) {
        hit = true;
      } else if (isSingle) {
        hit = true;
      } else if (includePartialGroup) {
        hit = true;
      } else {
        hit = (ids.length === currentSize) && ids.every((id) => currentIdSet.has(id));
      }
      if (!hit) return;
      const updatedAt = Number(s.updatedAt || s.createdAt || 0) || 0;
      rows.push({
        session: s,
        overlapCount: overlap.length,
        sameSize: ids.length === currentSize ? 1 : 0,
        typeBonus: isSingle ? 1 : 0,
        updatedAt
      });
    });

    rows.sort((a, b) => {
      if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
      if (b.sameSize !== a.sameSize) return b.sameSize - a.sameSize;
      if (b.typeBonus !== a.typeBonus) return b.typeBonus - a.typeBonus;
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      return String(a.session?.id || '').localeCompare(String(b.session?.id || ''));
    });
    return rows.map((x) => x.session).filter(s => (currentSession.scMemoryAllow || []).includes(s.id));
  },

  _collectSessionRecentTurns(messages, sessionId, rounds, pendingSet) {
    const sid = String(sessionId || '').trim();
    if (!sid) return [];
    const skipPending = pendingSet instanceof Set ? pendingSet : new Set();
    const maxMessages = Math.max(2, (Math.max(1, Number(rounds) || 1) * 2));
    let list = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && String(m.sessionId || '') === sid)
      .filter((m) => !m._localOnly)
      .filter((m) => !skipPending.has(String(m.id || '')))
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
    if (list.length > maxMessages) list = list.slice(-maxMessages);
    return list;
  },

  _countHistoryCharsForApi(history) {
    return (Array.isArray(history) ? history : []).reduce((sum, m) => {
      const c = String(m?.content || '');
      return sum + c.length;
    }, 0);
  },

  _crossSessionTitleForSession(sourceSession) {
    const s = sourceSession && typeof sourceSession === 'object' ? sourceSession : null;
    if (!s) return '与“未知会话”的会话';
    const names = Array.isArray(s.participantCharacterNames)
      ? s.participantCharacterNames.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const ids = Array.isArray(s.participantCharacterIds)
      ? s.participantCharacterIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    if (ids.length === 1 && names.length) {
      return `与“${names[0]}”的会话`;
    }
    const t = String(s.title || '').trim();
    if (t) return `与“${t}”的会话`;
    if (names.length === 1) return `与“${names[0]}”的会话`;
    return '与“群聊会话”的会话';
  },

  _buildCrossSessionMergedAssistantBlock(segMessages, sourceSession, userDisplayName, includeOnlineUserTime) {
    const msgs = Array.isArray(segMessages) ? segMessages : [];
    if (!msgs.length) return null;
    const modeLabel = '线上片段';
    const title = this._crossSessionTitleForSession(sourceSession);
    const rows = [`【跨会话记忆｜${title}｜${modeLabel}】`, ''];
    msgs.forEach((m) => {
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
      const isUser = m.role === 'user';
      const roleName = isUser
        ? (String(userDisplayName || '').trim() || '用户')
        : (String(m.characterName || '').trim() || '角色');
      let text = String(m.content || '').trim();
      if (!text) return;
      if (!isUser) {
        text = this._stripAssistantSuggestedReplyLinesForApi(text);
        if (!text) return;
      }
      rows.push(`${roleName}：${text}`);
      if (includeOnlineUserTime && isUser) {
        const t = this._formatSessionMemorySummaryTime(Number(m.createdAt));
        if (t) rows.push(`时间：${t}`);
      }
    });
    if (rows.length <= 3) return null;
    return { role: 'assistant', content: rows.join('\n'), _crossSessionMemory: true };
  },

  async _buildCrossSessionHistoryForApi({ relatedSessions, allMessages, rounds, pendingSet, currentMode, includeOnlineUserTime } = {}) {
    const sessions = Array.isArray(relatedSessions) ? relatedSessions : [];
    const out = [];
    const seen = new Set();
    for (const sess of sessions) {
      const sid = String(sess?.id || '').trim();
      if (!sid) continue;
      // 跨会话只取“线上片段”（mode=0），并且每个会话只生成一个块：最近 rounds 轮。
      const skipPending = pendingSet instanceof Set ? pendingSet : new Set();
      const maxMessages = Math.max(2, (Math.max(1, Number(rounds) || 1) * 2));
      let list = (Array.isArray(allMessages) ? allMessages : [])
        .filter((m) => m && String(m.sessionId || '') === sid)
        .filter((m) => !m._localOnly)
        .filter((m) => !skipPending.has(String(m.id || '')))
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => this._normalizeMsgModeForApi(m) === 0) // 只要线上
        .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
      if (list.length > maxMessages) list = list.slice(-maxMessages);
      if (!list.length) continue;
      let userDisplayName = '用户';
      try {
        userDisplayName = await this._resolveUserDisplayNameForApi(sess);
      } catch (e0) {
        userDisplayName = '用户';
      }
      const block = this._buildCrossSessionMergedAssistantBlock(list, sess, userDisplayName, includeOnlineUserTime);
      if (!block) continue;
      const dedupeKey = `${sid}:online:${String(block.content || '')}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      block._crossSessionModeDistance = 0;
      out.push(block);
    }
    out.sort((a, b) => {
      const da = Number(a?._crossSessionModeDistance || 0);
      const db = Number(b?._crossSessionModeDistance || 0);
      if (da !== db) return da - db;
      return String(a?.content || '').length - String(b?.content || '').length;
    });
    return out;
  },

  async _buildDynamicPackedHistoryForApi({ session, currentMode, pendingSet } = {}) {
    const sid = String(this.currentSessionId || '').trim();
    if (!sid) return [];
    let all = [];
    try {
      all = await Storage.dbGetAll('messages');
    } catch (e) {
      all = [];
    }
    const skipPending = pendingSet instanceof Set ? pendingSet : new Set();
    const allMsgs = Array.isArray(all) ? all : [];
    const rounds = typeof resolveStoredChatRoundsNum === 'function'
      ? resolveStoredChatRoundsNum()
      : Math.max(
        1,
        parseInt(Storage.get(CONFIG.STORAGE_KEYS.CHAT_ROUNDS) || '200', 10) || 200
      );
    let list = this._collectSessionRecentTurns(
      allMsgs,
      sid,
      rounds,
      skipPending
    );
    const includeOnlineUserTime = this._isTimeAwarenessEnabled();
    const sessionSummaryText = this._getLatestSessionSummaryText(session || this.currentSession || null);
    const hasCrossMode = list.length
      ? list.some((m) => this._normalizeMsgModeForApi(m) !== currentMode)
      : false;
    const currentPacked = [];
    if (list.length) {
      const userDisplayName = await this._resolveUserDisplayNameForApi(session || this.currentSession || null);
      const characterNameOf = await this._buildCharacterNameResolverForApi(session || this.currentSession || null);
      const segments = [];
      list.forEach((m) => {
        const mm = this._normalizeMsgModeForApi(m);
        const last = segments[segments.length - 1];
        if (!last || last.mode !== mm) {
          segments.push({ mode: mm, messages: [m] });
        } else {
          last.messages.push(m);
        }
      });
      segments.forEach((seg) => {
        if (seg.mode === currentMode || !hasCrossMode) {
          currentPacked.push(...seg.messages);
          return;
        }
        const merged = this._buildDynamicMergedAssistantBlock(
          seg.messages,
          seg.mode,
          userDisplayName,
          characterNameOf,
          includeOnlineUserTime,
          sessionSummaryText
        );
        if (merged) currentPacked.push(merged);
      });
    }

    const crossSettings = this._getCrossSessionMemorySettings();
    if (!crossSettings.enabled) return currentPacked;

    let allSessions = [];
    try {
      allSessions = await Storage.dbGetAll('sessions');
    } catch (e) {
      allSessions = [];
    }
    const currentSession = session || this.currentSession || null;
    const relatedSessions = this._getRelatedSessionsForCrossMemory(
      currentSession,
      allSessions,
      crossSettings.includePartialGroup,
      allMsgs
    );
    if (!relatedSessions.length) return currentPacked;

    const crossPacked = await this._buildCrossSessionHistoryForApi({
      relatedSessions,
      allMessages: allMsgs,
      rounds,
      pendingSet: skipPending,
      currentMode,
      includeOnlineUserTime
    });
    if (!crossPacked.length) return currentPacked;

    // 预算控制：先保留当前会话窗口，再按相关度追加跨会话块，避免 token 膨胀。
    const result = currentPacked.slice();
    let totalChars = this._countHistoryCharsForApi(result);
    const maxMessages = Math.max(1, Number(crossSettings.maxMessages) || 220);
    const maxChars = Math.max(2000, Number(crossSettings.maxChars) || 28000);
    crossPacked.forEach((msg) => {
      if (!msg || !msg.content) return;
      const nextChars = totalChars + String(msg.content).length;
      if (result.length >= maxMessages) return;
      if (nextChars > maxChars) return;
      result.push(msg);
      totalChars = nextChars;
    });
    return result;
  },

  async _buildForumContextSystemForSession(session) {
    try {
      // 只替换“论坛记忆资料”这块：改为 TaPages 标准上下文里提取出的论坛相关摘要
      if (typeof TaPages === 'undefined' || !TaPages || typeof TaPages._buildFeatureContextForCharacter !== 'function') {
        return '';
      }
      const roleIds = Array.isArray(session?.participantCharacterIds)
        ? session.participantCharacterIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      if (!roleIds.length) return '';

      const extractForumBlocks = (text) => {
        const s = String(text || '');
        if (!s) return [];
        const parts = [];
        const re = /(【论坛互动信号摘要】[\s\S]*?)(?=\n{2,}【|\n{2,}$|$)|(【用户论坛行为摘要】[\s\S]*?)(?=\n{2,}【|\n{2,}$|$)/g;
        let m;
        while ((m = re.exec(s)) !== null) {
          const seg = String(m[1] || m[2] || '').trim();
          if (seg) parts.push(seg);
        }
        return parts;
      };

      const blocks = [];
      // 群聊最多取前 3 个角色，避免上下文过长
      for (const cid of roleIds.slice(0, 3)) {
        const ctx = await TaPages._buildFeatureContextForCharacter(cid, { maxMsgs: 56 });
        const hits = extractForumBlocks(ctx?.chatTranscript);
        hits.forEach((b) => blocks.push(b));
      }
      return blocks.length ? blocks.join('\n\n') : '';
    } catch (e) {
      return '';
    }
  },

  _formatMomentTimeForContext(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '未知时间';
    const d = new Date(n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  },

  _injectAssistantContextBeforeCurrentUser(messages, content) {
    if (!Array.isArray(messages)) return messages || [];
    const text = String(content || '').trim();
    if (!text) return messages;
    const out = messages.slice();
    let trailingUsers = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      const r = String(out[i]?.role || '');
      if (r === 'user') trailingUsers += 1;
      else break;
    }
    const insertAt = Math.max(0, out.length - trailingUsers);
    out.splice(insertAt, 0, { role: 'assistant', content: text });
    return out;
  },

  async _buildMomentsContextAssistantForSession(session, participants = []) {
    try {
      // 只替换“角色朋友圈记忆摘要”这块：改为 TaPages 标准上下文里提取出的朋友圈互动信号摘要
      if (typeof TaPages === 'undefined' || !TaPages || typeof TaPages._buildFeatureContextForCharacter !== 'function') {
        return '';
      }
      const roleIds = Array.isArray(session?.participantCharacterIds)
        ? session.participantCharacterIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      if (!roleIds.length) return '';

      const extractMomentsBlock = (text) => {
        const s = String(text || '');
        if (!s) return '';
        const start = s.indexOf('【朋友圈互动信号摘要】');
        if (start < 0) return '';

        // 主块默认在遇到下一个“【...】”段落时结束，
        // 但“用户最近发布的朋友圈”是该主块的子块，不应被截断。
        const afterStart = s.slice(start);
        const mainMatch = afterStart.match(/^【朋友圈互动信号摘要】[\s\S]*?(?=\n{2,}【|\n{2,}$|$)/);
        if (!mainMatch) return '';
        let out = String(mainMatch[0] || '').trim();

        const consumedLen = mainMatch[0].length;
        const rest = afterStart.slice(consumedLen);
        const userBlockMatch = rest.match(/^\n{2,}(【用户最近发布的朋友圈（最多8条）｜角色「[^」]+」可见范围】[\s\S]*?)(?=\n{2,}【|\n{2,}$|$)/);
        if (userBlockMatch && userBlockMatch[1]) {
          out += `\n\n${String(userBlockMatch[1] || '').trim()}`;
        }

        return out;
      };

      const blocks = [];
      for (const cid of roleIds.slice(0, 3)) {
        const ctx = await TaPages._buildFeatureContextForCharacter(cid, { maxMsgs: 56 });
        const b = extractMomentsBlock(ctx?.chatTranscript);
        if (b) blocks.push(b);
      }
      return blocks.length ? blocks.join('\n\n') : '';
    } catch (e) {
      return '';
    }
  },

  // 旧的 sendMessage 已被“两段式发送”替代：handleSendButtonClick/_queueUserMessage/_flushPendingMessages
  
  _isApiStreamEnabled() {
    const k = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_STREAM)
      ? CONFIG.STORAGE_KEYS.API_STREAM
      : 'api_stream';
    const def = (CONFIG && CONFIG.DEFAULT_API_STREAM != null) ? CONFIG.DEFAULT_API_STREAM : 'off';
    const raw = Storage.get(k);
    const mode = String(raw != null && raw !== '' ? raw : def).trim().toLowerCase();
    return mode === 'on' || mode === '1' || mode === 'true';
  },

  async _mergeStreamChunksToCompletion(response) {
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    if (!reader) {
      const data = await response.json().catch(() => ({}));
      if (data?.error && (data.error.message || data.error.msg)) {
        const msg = String(data.error.message || data.error.msg || 'API error').trim();
        throw new Error(msg || 'API error');
      }
      return data;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let role = 'assistant';
    let finishReason = null;
    let id = null;
    let modelId = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';
      for (let line of parts) {
        line = String(line || '').trim();
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        let chunk;
        try {
          chunk = JSON.parse(dataStr);
        } catch (e) {
          continue;
        }
        if (chunk?.error) {
          const em = String(chunk.error.message || chunk.error.msg || 'API error').trim();
          throw new Error(em || 'API error');
        }
        if (chunk.id) id = chunk.id;
        if (chunk.model) modelId = chunk.model;
        const choice = chunk.choices && chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (delta.role) role = delta.role;
        if (delta.content) content += delta.content;
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }

    return {
      ...(id ? { id } : {}),
      ...(modelId ? { model: modelId } : {}),
      choices: [{
        index: 0,
        message: { role, content },
        finish_reason: finishReason || 'stop'
      }]
    };
  },

  async _parseChatCompletionsResponse(response, useStream) {
    if (!response.ok) {
      const data = await response.json().catch(async () => {
        const text = await response.text().catch(() => '');
        try {
          return JSON.parse(text);
        } catch (e) {
          return {};
        }
      });
      const msg = String(data?.error?.message || data?.error?.msg || response.statusText || 'API error').trim();
      throw new Error(msg || 'API error');
    }
    if (!useStream) {
      const data = await response.json().catch(() => ({}));
      if (data?.error && (data.error.message || data.error.msg)) {
        const msg = String(data.error.message || data.error.msg || 'API error').trim();
        throw new Error(msg || 'API error');
      }
      return data;
    }
    return this._mergeStreamChunksToCompletion(response);
  },

  async _postChatCompletionsAndParse({ baseUrl, apiKey, payload, timeoutMs } = {}) {
    const reqTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : this._getApiChatTimeoutMs();
    const urlBase = String(baseUrl || '').trim().replace(/\/$/, '');
    const key = String(apiKey || '').trim();
    if (!urlBase) throw new Error('请先在设置中配置 Base URL');
    if (!key) throw new Error('请先在设置中配置 API Key');

    const useStream = this._isApiStreamEnabled();
    const body = {
      ...(payload && typeof payload === 'object' ? payload : {}),
      stream: useStream
    };

    const init = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body)
    };

    const url = `${urlBase}/chat/completions`;
    const response = await this._fetchWithTimeout(url, init, reqTimeoutMs);

    return this._parseChatCompletionsResponse(response, useStream);
  },

  /**
   * 标准 AI-API 调用：POST {baseUrl}/chat/completions
   * - 统一读取 API Key / Base URL / Model
   * - 统一错误处理（HTTP error / {error:{message|msg}}）
   * @param {Array<{role:'system'|'user'|'assistant', content:any}>} messages
   * @param {Object|null} [extraPayload] 额外 payload（如 temperature/max_tokens 等）
   */
  async requestChatCompletions(messages, extraPayload = null) {
    const apiKey = Storage.get(CONFIG.STORAGE_KEYS.API_KEY);
    const baseUrlRaw = Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || 'https://api.openai.com/v1';
    const baseUrl = String(baseUrlRaw || '').replace(/\/$/, '');
    if (!apiKey) throw new Error('请先在设置中配置 API Key');
    if (!baseUrl) throw new Error('请先在设置中配置 Base URL');

    const apiTemperature = this._getApiTemperatureForRequest();
    const maxTok = this._getApiMaxTokensForRequest();
    const payload = {
      model: Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || 'gpt-3.5-turbo',
      messages: Array.isArray(messages) ? messages : [],
      temperature: apiTemperature,
      ...(maxTok != null ? { max_tokens: maxTok } : {}),
      ...(extraPayload && typeof extraPayload === 'object' ? extraPayload : {})
    };

    return this._postChatCompletionsAndParse({ baseUrl, apiKey, payload });
  },

  _getApiTemperatureForRequest() {
    const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_TEMPERATURE)
      ? CONFIG.STORAGE_KEYS.API_TEMPERATURE
      : 'api_temperature';
    const fallback = Number((CONFIG && CONFIG.DEFAULT_API_TEMPERATURE) || 0.8);
    const raw = Number(Storage.get(key));
    const base = Number.isFinite(raw) ? raw : (Number.isFinite(fallback) ? fallback : 0.8);
    return Math.min(2, Math.max(0, base));
  },

  _getApiMaxTokensForRequest() {
    const key = (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.API_MAX_TOKENS)
      ? CONFIG.STORAGE_KEYS.API_MAX_TOKENS
      : 'api_max_tokens';
    const stored = Storage.get(key);
    const text = String(
      stored != null && stored !== ''
        ? stored
        : ((CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS !== undefined && CONFIG.DEFAULT_API_MAX_TOKENS !== null)
          ? CONFIG.DEFAULT_API_MAX_TOKENS
          : 'unlimited')
    ).trim().toLowerCase();
    if (text === 'unlimited') return null;
    const n = Number(stored != null && stored !== '' ? stored : '');
    const defNum = Number(CONFIG && CONFIG.DEFAULT_API_MAX_TOKENS);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    if (Number.isFinite(defNum) && defNum > 0) return Math.floor(defNum);
    return null;
  },

  // 调用AI
  async callAI(userMessage, historyForApi, opts = {}) {
    const apiKey = Storage.get(CONFIG.STORAGE_KEYS.API_KEY);
    const baseUrl = Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || 'https://api.openai.com/v1';

    const voiceCallRequest = !!opts?.voiceCallRequest;
    const voiceCallMode = opts?.voiceCallMode || this._voiceCallMode || 'voice';
    const shouldAppendAssistantToVoiceUi = !!voiceCallRequest && !!this._voiceCallActive && !!this._voiceCallAppendAssistantToUi;

    // 立即捕获目标会话ID，避免用户在 API 等待期间切到 B 时，回复误入 B
    const targetSessionId = String(opts.scSessionId || this.currentSessionId || '').trim();
    if (!targetSessionId) {
      this._setTypingStatus(false);
      this._updateTypingDisplay();
      return false;
    }

    if (!apiKey) {
      alert('请先在设置中配置API Key');
      this._setTypingStatus(false);
      this._updateTypingDisplay();
      return false;
    }

    try {
      this._setTypingStatus(true, targetSessionId);
      this._updateTypingDisplay();
      try {
        requestAnimationFrame(() => this._updateTypingDisplay());
      } catch (e0) {}

      // 读取目标会话的参与角色（用 targetSessionId，不用 this.currentSessionId）
      const session = await Storage.dbGet('sessions', targetSessionId);
      this.currentSession = session || this.currentSession;
      const requestMode = (session && session.mode != null)
        ? (Number(session.mode) === 1 ? 1 : 0)
        : 0;
      
      const participantIds = Array.isArray(session?.participantCharacterIds)
        ? session.participantCharacterIds.filter(Boolean)
        : [];
      const characterMap = await this.getCharacterMap(true);
      const participants = participantIds.map((id) => characterMap.get(String(id))).filter(Boolean);

      const mode = participants.length > 1 ? 'group' : 'single';
      const mask = await this._getEffectiveMaskForSession(session);
      const stickers = await this._getAlbumStickers();
      let globalWorldBook = null;
      try {
        globalWorldBook = await Storage.worldbookGlobalGet();
      } catch (e) {}
      const messages = ChatMessageBuilder.buildChatMessages({
        mode,
        characters: participants,
        history: Array.isArray(historyForApi) ? historyForApi : this.messages,
        userInput: userMessage,
        userContentParts: opts.userContentParts || null,
        conversationMode: requestMode,
        globalWorldBook,
        mask,
        stickers,
        suggestedReplyEnabled: this._isSuggestedReplyEnabledGlobal(),
        appendApiUserTimeLine: requestMode === 0
      });
      const sessionMemorySystem = this._buildSessionMemorySummarySystemForApi(session);
      if (sessionMemorySystem) {
        let memoryInsertAt = 0;
        while (memoryInsertAt < messages.length && String(messages[memoryInsertAt]?.role || '') === 'system') {
          memoryInsertAt += 1;
        }
        messages.splice(memoryInsertAt, 0, { role: 'system', content: sessionMemorySystem });
        this._logMemoryEnhanceDebug('inject-summary-system', {
          sessionId: targetSessionId,
          inserted: true,
          summaryChars: sessionMemorySystem.length
        });
      } else {
        this._logMemoryEnhanceDebug('inject-summary-system', {
          sessionId: targetSessionId,
          inserted: false
        });
      }
      // 强制清洗旧注入块：无论原 role 是什么，都先移除旧的跨会话/朋友圈/论坛摘要块
      const crossSessionSystemBlocks = [];
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        const content = String(m?.content || '').trim();
        if (content.startsWith('【跨会话记忆｜')) {
          crossSessionSystemBlocks.unshift(content);
          messages.splice(i, 1);
          continue;
        }
        if (content.startsWith('【朋友圈互动信号摘要】')) {
          messages.splice(i, 1);
          continue;
        }
        if (content.startsWith('【论坛互动信号摘要】') || content.startsWith('【用户论坛行为摘要】')) {
          messages.splice(i, 1);
        }
      }

      const momentsContextSystem = await this._buildMomentsContextAssistantForSession(session, participants);
      const forumContextSystem = await this._buildForumContextSystemForSession(session);

      // 基准插入位：现有 system 段末尾（即世界书 system 之后、history 之前）
      let insertAt = 0;
      while (insertAt < messages.length && String(messages[insertAt]?.role || '') === 'system') {
        insertAt += 1;
      }
      // 顺序：跨会话记忆 -> 朋友圈互动信号 -> 论坛互动信号
      crossSessionSystemBlocks.forEach((content) => {
        messages.splice(insertAt, 0, { role: 'system', content });
        insertAt += 1;
      });
      if (momentsContextSystem) {
        messages.splice(insertAt, 0, { role: 'system', content: momentsContextSystem });
        insertAt += 1;
      }
      if (forumContextSystem) {
        messages.splice(insertAt, 0, { role: 'system', content: forumContextSystem });
        insertAt += 1;
      }
      try {
        const sparkContextSystem = this._buildSparkContextSystemForApi(targetSessionId);
        if (sparkContextSystem) {
          let sparkInsertAt = 0;
          while (sparkInsertAt < messages.length && String(messages[sparkInsertAt]?.role || '') === 'system') {
            sparkInsertAt += 1;
          }
          messages.splice(sparkInsertAt, 0, { role: 'system', content: sparkContextSystem });
        }
      } catch (eSparkCtx) {}
      try {
        if (typeof CalendarPage !== 'undefined' && CalendarPage) {
          const cycleSystem = typeof CalendarPage.buildCycleStyleSystemForApi === 'function'
            ? await CalendarPage.buildCycleStyleSystemForApi()
            : '';
          const eventsSystem = typeof CalendarPage.buildCalendarTimelineForParticipantsApi === 'function'
            ? await CalendarPage.buildCalendarTimelineForParticipantsApi(participantIds)
            : (typeof CalendarPage.buildCalendarContextForParticipantsApi === 'function'
              ? await CalendarPage.buildCalendarContextForParticipantsApi(participantIds)
              : '');
          const calendarBlocks = [cycleSystem, eventsSystem].filter((s) => String(s || '').trim());
          if (calendarBlocks.length) {
            let calInsertAt = 0;
            while (calInsertAt < messages.length && String(messages[calInsertAt]?.role || '') === 'system') {
              calInsertAt += 1;
            }
            calendarBlocks.forEach((content) => {
              messages.splice(calInsertAt, 0, { role: 'system', content });
              calInsertAt += 1;
            });
          }
        }
      } catch (eCalCtx) {}
      if (requestMode === 0) {
        const proactiveZoneSystem = await this._buildProactiveSystemZoneForSession(targetSessionId);
        if (proactiveZoneSystem) {
          const timeHintIdx = messages.findIndex((m) =>
            m &&
            m.role === 'system' &&
            String(m.content || '').includes('【系统自动注入的时间行（必读）】')
          );
          const insertAt = timeHintIdx >= 0 ? (timeHintIdx + 1) : Math.min(1, messages.length);
          messages.splice(insertAt, 0, { role: 'system', content: proactiveZoneSystem });
        }
      }

      // 语音/视频通话口吻额外约束：口头化、语气化、禁止动作描写
      if (voiceCallRequest) {
        const modeLabel = voiceCallMode === 'video' ? '视频通话' : '语音通话';
        const typeRule = voiceCallMode === 'video'
          ? '消息类型限制：只允许 [语音] 或 [动作]，禁止 [消息] 及其他类型。'
          : '消息类型限制：只允许 [语音]，禁止 [消息]、[动作] 及其他类型。';
        messages.unshift({
          role: 'system',
          content: `当前语境：正在${modeLabel}中。请用正常${modeLabel}的口吻回答，尽量简短，表达更口头化和语气化。禁止动作描写（不要写线下行为或具体动作）。${typeRule}`
        });
      }

      const normalizeVoiceCallReplyForMode = (raw, callMode) => {
        const lines = String(raw || '').split('\n').map(l => String(l || '').trim()).filter(Boolean);
        if (!lines.length) return '';
        const out = [];
        const allowAction = callMode === 'video';
        const fallbackType = '语音';
        lines.forEach(line => {
          const m = line.match(/^\[([^\]|]+)(?:\|([^\]]+))?\](.*)$/);
          if (!m) {
            out.push(`[${fallbackType}]${line}`);
            return;
          }
          const msgType = String(m[1] || '').trim();
          const roleName = String(m[2] || '').trim();
          const body = String(m[3] || '').trim();
          if (!body) return;
          const allowed = msgType === '语音' || (allowAction && msgType === '动作');
          const normalizedType = allowed ? msgType : fallbackType;
          const roleSeg = roleName ? `|${roleName}` : '';
          out.push(`[${normalizedType}${roleSeg}]${body}`);
        });
        return out.join('\n');
      };

      const normalizeVoiceCallText = (raw) => {
        const s = String(raw || '').trim();
        if (!s) return '';
        // 如果返回的是协议行（如：[消息]xxx），尽量只展示“xxx”
        const lines = s.split('\n').map(l => String(l || '').trim()).filter(Boolean);
        const cleaned = lines.map(line => {
          let m = line.match(/^\[消息(?:\|[^\]]+)?\](.*)$/);
          if (m) return String(m[1] || '').trim();
          m = line.match(/^\[动作(?:\|[^\]]+)?\](.*)$/);
          if (m) return String(m[1] || '').trim();
          m = line.match(/^\[系统(?:\|[^\]]+)?\](.*)$/);
          if (m) return String(m[1] || '').trim();
          return line;
        });
        return cleaned.join('\n');
      };

      const maxTokChat = this._getApiMaxTokensForRequest();
      const data = await SCChat.complete({
        baseUrl,
        apiKey,
        payload: {
          model: Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || 'gpt-3.5-turbo',
          messages,
          temperature: this._getApiTemperatureForRequest(),
          ...(maxTokChat != null ? { max_tokens: maxTokChat } : {})
        }
      }, session);
      // API 已返回：标题不再长期停在「正在输入中」，后续逐条回显在后台继续
      this._clearTypingIfMatches(targetSessionId);

      if (data.error && (data.error.message || data.error.msg)) {
        const errMsg = String(data.error.message || data.error.msg || 'API 返回错误').trim();
        const one = participants.length === 1 ? participants[0] : null;
        const aiMsg = {
          id: State.generateId(),
          sessionId: targetSessionId,
          role: 'assistant',
          content: `[消息]${errMsg}`,
          createdAt: Date.now(),
          mode: requestMode,
          characterId: one ? one.id : null,
          characterName: one ? one.name : null
        };
        await Storage.dbAdd('messages', aiMsg);
        this._scheduleChatListRefresh();
        const stillViewingTarget = String(this.currentSessionId || '') === targetSessionId;
        await this._increaseSessionUnreadIfNeeded(targetSessionId, stillViewingTarget);
        if (stillViewingTarget) {
          this._plainStreamPendingMsgIds.add(String(aiMsg.id));
          this.messages.push(aiMsg);
          await this.renderMessages();
        }

        if (shouldAppendAssistantToVoiceUi) {
          const showErr = normalizeVoiceCallText(aiMsg.content || errMsg);
          this._appendVoiceCallMessage('role', showErr);
        }

        const session = await Storage.dbGet('sessions', targetSessionId);
        const sessionTitle = String(session?.title || '').trim() || (one ? one.name : '') || '';
        if (sessionTitle && (State.currentPage !== 'page-chat' || String(this.currentSessionId || '') !== targetSessionId) && typeof Notifications !== 'undefined' && Notifications.enqueue) {
          Notifications.enqueue('聊天', sessionTitle, errMsg.slice(0, 80), 0);
        }
        return false;
      }

      if (data.choices && data.choices[0]) {
        const rawContent = this._normalizeApiContent(
          data.choices[0].message && data.choices[0].message.content
        );
        const one = participants.length === 1 ? participants[0] : null;

        // 先解析并执行系统动作（[系统]...），并剔除这些行避免进入聊天正文
        let workingText = rawContent;
        if (typeof SystemActions !== 'undefined' && SystemActions.parseAndExecute) {
          try {
            try { console.log('[Chat] rawContent before SystemActions:', rawContent); } catch (e) {}
            const r = await SystemActions.parseAndExecute(workingText, {
              source: 'chat',
              sessionId: targetSessionId,
              characterId: one ? one.id : '',
              characterName: one ? one.name : '',
              characterAvatar: one ? (one.avatar || '') : ''
            });
            workingText = r && typeof r.cleanText === 'string' ? r.cleanText : workingText;
            try { console.log('[Chat] workingText after SystemActions:', workingText); } catch (e) {}
          } catch (e) {
            console.error('SystemActions.parseAndExecute failed:', e);
          }
        }

        // 显式通知（[通知]...）：入全局通知队列，并剔除这些行避免进入聊天正文
        if (typeof Notifications !== 'undefined' && Notifications.extract) {
          try {
            try { console.log('[Chat] workingText before Notifications.extract:', workingText); } catch (e) {}
            const r2 = Notifications.extract(workingText);
            if (r2 && Array.isArray(r2.items) && r2.items.length && Notifications.enqueueFromText) {
              Notifications.enqueueFromText(workingText);
            }
            workingText = r2 && typeof r2.cleanText === 'string' ? r2.cleanText : workingText;
            try { console.log('[Chat] workingText after Notifications.extract:', workingText); } catch (e) {}
          } catch (e) {
            console.error('Notifications.extract failed:', e);
          }
        }

        // 仅对 [css美化] 标题行后的空行做定向规范化：
        // 其它文本保持原样；这里只把「标题 -> ```css」之间压成单换行，避免入库后被看成分段。
        try {
          const beforeCssGapFix = String(workingText || '');
          const afterCssGapFix = beforeCssGapFix
            .replace(/(\[css美化\][^\n\r]*)\n{2,}(```\s*css\b)/gi, '$1\n$2')
            .replace(/(【css美化】[^\n\r]*)\n{2,}(```\s*css\b)/gi, '$1\n$2');
          if (afterCssGapFix !== beforeCssGapFix) {
            workingText = afterCssGapFix;
            try {
              console.log('[Chat] workingText after css-gap-fix:', workingText);
            } catch (e) {}
          }
        } catch (e) {}

        // 模拟真实“逐条接收”：除 HTML 外，其它内容按消息块依次到达（带间隔）
        let chunks = this._collectAssistantReceiveChunks(workingText, {
          requestMode,
          mode,
          voiceCallRequest,
          voiceCallMode,
          normalizeVoiceCallReplyForMode
        });
        chunks = this._ensureAssistantReceiveChunksFromApi(rawContent, workingText, chunks, {
          requestMode,
          mode,
          voiceCallRequest,
          voiceCallMode,
          normalizeVoiceCallReplyForMode
        });
        if (!chunks.length) {
          try {
            const previewChunks = await this._collectProactivePreviewFallbackChunks(targetSessionId, {
              requestMode,
              mode,
              voiceCallRequest,
              voiceCallMode,
              normalizeVoiceCallReplyForMode
            });
            if (previewChunks.length) chunks = previewChunks;
          } catch (ePrev) {}
        }

        // 场景1：A 的回复回来但用户不在该会话时，每条消息块都发通知（与聊天框同种延时逐条回显）
        let sessionTitleAtStart = '';
        try {
          const s0 = await Storage.dbGet('sessions', targetSessionId);
          sessionTitleAtStart = String(s0?.title || '').trim();
          if (!sessionTitleAtStart && one) sessionTitleAtStart = String(one.name || '').trim();
        } catch (e) {}

        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i];
          if (!c) continue;
          const isProtocolTextChunk = (() => {
            const td = String(c?.text || '').trim();
            if (!td || c?.type !== 'text') return false;
            return (typeof MessageTypes !== 'undefined' && MessageTypes && typeof MessageTypes.tryMatch === 'function')
              ? !!MessageTypes.tryMatch(td, mode === 'group')
              : /^\[(消息|对白|对话|建议回复|css美化|图片|表情包|语音|动作|邀请|分享|转账|红包|收取转账|收取红包|系统)(?:\|[^\]]+)?\]/.test(td);
          })();

          // 线下顺序保护（关键）：
          // 即使出现“切回线下后的首条回复”，也不允许 [对白]/协议块在前文正文流式未结束时抢先出现。
          if (requestMode === 1 && isProtocolTextChunk) {
            try {
              await this._waitPlainStreamQueueDrain(15000);
            } catch (ePre) {}
          }

          // plain / 线下：delayMs 为 0，不 sleep；线上协议块用 estimate，未显式给延时则兜底 260ms
          if (i > 0) {
            const ms = typeof c.delayMs === 'number' ? c.delayMs : 260;
            if (ms > 0) await this._sleep(ms);
          }
          const now = Date.now();
          const chunkText = String(c.text || '');
          const aiMsg = {
            id: State.generateId(),
            sessionId: targetSessionId,
            role: 'assistant',
            content: chunkText,
            createdAt: now,
            mode: requestMode,
            characterId: one ? one.id : null,
            characterName: one ? one.name : null
          };
          await Storage.dbAdd('messages', aiMsg);
          this._scheduleChatListRefresh();

          try {
            const moneyInfo = this._parseMoneyMessage(chunkText, mode === 'group');
            if (moneyInfo && aiMsg.role === 'assistant') {
              const charName = String(aiMsg.characterName || '').trim() || '对方';
              this._registerPendingAssistantMoneyTx(aiMsg.id, moneyInfo, targetSessionId, charName);
            }
            const collectInfo = this._parseCollectMessage(chunkText, mode === 'group');
            if (collectInfo) {
              await this.applyMoneyCollectMessage({
                sessionId: targetSessionId,
                content: chunkText,
                collectMessageId: aiMsg.id,
                role: 'assistant',
                characterId: one ? one.id : '',
                characterName: one ? one.name : ''
              });
            }
          } catch (eMoneySync) {}

          if (shouldAppendAssistantToVoiceUi) {
            this._appendVoiceCallMessage('role', normalizeVoiceCallText(chunkText));
          }

          const stillViewingTarget = String(this.currentSessionId || '') === targetSessionId;
          await this._increaseSessionUnreadIfNeeded(targetSessionId, stillViewingTarget);
          if (stillViewingTarget) {
            if (requestMode === 1) {
              this._plainStreamPendingMsgIds.add(String(aiMsg.id));
            }
            try {
              console.log('[chat] stream-flag-add', {
                id: String(aiMsg.id),
                mode: requestMode,
                kind: c?.type,
                len: String(c?.text || '').length
              });
            } catch (e) {}
            this.messages.push(aiMsg);
            // 线上首条助手块起强制全量渲染，避免旧会话 incremental 计数错位导致气泡不出现
            if (requestMode === 0 && i === 0) {
              this._forceFullRenderNext = true;
            }
            // 逐条接收：增量 append 新消息即可；勿每条全量 replaceChildren，否则历史图片 DOM 被销毁后异步重载导致闪烁。
            // 若本轮 chunk 触发了转账/红包回填（上方 moneySynced / rid），已设 _forceFullRenderNext。
            await this.renderMessages();

            // 线下：避免协议块抢跑（上一段逐字还没播完下一条就出现）
            try {
              if (requestMode === 1 && c.type === 'text') {
                const td = String(c.text || '').trim();
                const isProtocol =
                  (typeof MessageTypes !== 'undefined' && MessageTypes && typeof MessageTypes.tryMatch === 'function')
                    ? !!MessageTypes.tryMatch(td, mode === 'group')
                    : /^\[(消息|对白|对话|建议回复|css美化|图片|表情包|语音|动作|邀请|分享|转账|红包|收取转账|收取红包|系统)(?:\|[^\]]+)?\]/.test(td);
                if (!isProtocol) {
                  // 必须等待真实“逐字队列”完成，而不是仅按估算时长 sleep；
                  // 否则在队列拥堵时会出现后续 [对白] 先显示、前文正文后补流的乱序观感。
                  const estimated = this._estimatePlainStreamRevealMs(td);
                  await this._waitPlainStreamQueueDrain(Math.max(estimated + 2000, 4000));
                }
              }
            } catch (e) {}
          }

          const notViewing = (State.currentPage !== 'page-chat') || (String(Chat.currentSessionId || '') !== targetSessionId);
          if (notViewing && sessionTitleAtStart) {
            this._enqueueChatIncomingNotification(sessionTitleAtStart, String(c.text || '').trim());
          }
        }

        // 更新会话时间（以最后一段为准，用 targetSessionId）
        const s = await Storage.dbGet('sessions', targetSessionId);
        if (s) {
          s.updatedAt = Date.now();
          await Storage.dbPut('sessions', s);
        }
        this._scheduleChatListRefresh();

        // 自动总结记忆：与会话绑定；总结范围覆盖线上+线下，按时间顺序增量推进
        try {
          void this._maybeAutoSummarizeSessionMemory(targetSessionId);
        } catch (e) {}

        if (
          this._moneyCollectionNeedsRender &&
          String(this.currentSessionId || '') === targetSessionId
        ) {
          this._moneyCollectionNeedsRender = false;
          this._forceFullRenderNext = true;
          try {
            await this.renderMessages();
          } catch (eMoneyRender) {}
        }

        if (shouldAppendAssistantToVoiceUi) {
          // 本次通话请求已完成：关闭追加开关，避免后续错误重复追加
          this._voiceCallAppendAssistantToUi = false;
        }
        return true;
      }
    } catch (error) {
      console.error('AI调用失败:', error);
      alert(`AI调用失败：${error.message || '请检查网络和 API 配置'}`);
      return false;
    } finally {
      this._setTypingStatus(false);
      this._updateTypingDisplay();
    }
    return false;
  },

  _getSessionMemoryEnhanceDefaults() {
    return {
      enabled: false,
      everyRounds: 50,
      history: []
    };
  },

  _getSessionMemoryEnhanceConfig(session) {
    const def = this._getSessionMemoryEnhanceDefaults();
    const enabled = session && typeof session.memoryEnhanceEnabled === 'boolean'
      ? session.memoryEnhanceEnabled
      : def.enabled;
    const every = Number(session?.memoryEnhanceEveryRounds);
    const everyRounds = Number.isFinite(every) && every > 0 ? Math.floor(every) : def.everyRounds;
    const history = Array.isArray(session?.memoryEnhanceHistory) ? session.memoryEnhanceHistory : def.history;
    return { enabled, everyRounds, history };
  },

  async _getSortedMemoryEligibleMessages(sessionId) {
    let all = [];
    try {
      all = await Storage.dbGetAll('messages');
    } catch (e) {
      all = [];
    }
    const sid = String(sessionId || '').trim();
    return (Array.isArray(all) ? all : [])
      .filter((m) => m && String(m.sessionId || '') === sid)
      .filter((m) => !m._pending && !m._localOnly && m.role !== 'memory')
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  },

  _sliceMessagesByUserRounds(sortedMsgs, userRoundFrom, userRoundTo) {
    const sorted = Array.isArray(sortedMsgs) ? sortedMsgs : [];
    const fr = Math.floor(Number(userRoundFrom));
    const tr = Math.floor(Number(userRoundTo));
    const userIdx = [];
    sorted.forEach((m, i) => {
      if (m && m.role === 'user') userIdx.push(i);
    });
    const n = userIdx.length;
    if (!Number.isFinite(fr) || !Number.isFinite(tr) || fr < 1 || tr < fr || tr > n) return null;
    const start = userIdx[fr - 1];
    const end = tr < n ? userIdx[tr] - 1 : sorted.length - 1;
    if (start > end) return null;
    return sorted.slice(start, end + 1);
  },

  /** 自动总结锚点：取记忆书中已有条目的最大 userRoundTo（与是否勾选「加入记忆」无关，避免全关勾选时反复从第 1 轮重试）。 */
  _maxMemoryBookUserRoundEnd(session) {
    const s = session && typeof session === 'object' ? session : null;
    if (!s) return 0;
    const history = Array.isArray(s.memoryEnhanceHistory) ? s.memoryEnhanceHistory : [];
    let max = 0;
    history.forEach((e) => {
      if (!e) return;
      const t = Number(e.userRoundTo);
      if (Number.isFinite(t) && t > max) max = t;
    });
    return max;
  },

  async getSessionMemoryRangePreview(sessionId, userRoundFrom, userRoundTo) {
    const sorted = await this._getSortedMemoryEligibleMessages(sessionId);
    const totalUserRounds = sorted.filter((m) => m && m.role === 'user').length;
    const fr = Math.floor(Number(userRoundFrom));
    const tr = Math.floor(Number(userRoundTo));
    if (!Number.isFinite(fr) || !Number.isFinite(tr) || fr < 1 || tr < fr) {
      return { ok: false, totalUserRounds, charCountRaw: 0, error: 'invalid_range' };
    }
    if (tr > totalUserRounds) {
      return { ok: false, totalUserRounds, charCountRaw: 0, error: 'out_of_range' };
    }
    const msgs = this._sliceMessagesByUserRounds(sorted, fr, tr);
    if (!msgs || !msgs.length) {
      return { ok: false, totalUserRounds, charCountRaw: 0, error: 'no_messages' };
    }
    let charCountRaw = 0;
    for (let i = 0; i < msgs.length; i++) {
      charCountRaw += String(msgs[i].content || '').length;
    }
    return { ok: true, totalUserRounds, charCountRaw };
  },

  async getSessionMemoryDialogueRoundRows(sessionId) {
    const sorted = await this._getSortedMemoryEligibleMessages(sessionId);
    const userIdx = [];
    sorted.forEach((m, i) => {
      if (m && m.role === 'user') userIdx.push(i);
    });
    const n = userIdx.length;
    const rows = [];
    for (let k = 1; k <= n; k++) {
      const slice = this._sliceMessagesByUserRounds(sorted, k, k);
      if (!slice || !slice.length) continue;
      const userMsg = slice.find((m) => m && m.role === 'user');
      const rawUser = String(userMsg?.content || '').trim().replace(/\s+/g, ' ');
      const maxTitle = 44;
      const title = rawUser.length > maxTitle ? `${rawUser.slice(0, maxTitle)}…` : (rawUser || '（空）');
      const echoParts = [];
      slice.forEach((m) => {
        if (!m || !m.role) return;
        const lab = m.role === 'user' ? '用户' : (m.role === 'assistant' ? '角色' : String(m.role));
        echoParts.push(`${lab}：${String(m.content || '').trim()}`);
      });
      rows.push({
        round: k,
        title,
        titleFull: rawUser || '（空）',
        echo: echoParts.join('\n')
      });
    }
    return { totalUserRounds: n, rows };
  },

  _escapeHtmlForExport(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _cleanMessageContentForExport(text, role) {
    let t = String(text || '').trim();
    if (!t) return '';
    if (role === 'assistant') {
      t = this._stripAssistantSuggestedReplyLinesForApi(t);
    }
    try {
      t = t
        .split('\n')
        .map((x) => String(x || '').trim())
        .filter((line) => !!line && !/^\[建议回复(?:\|[^\]]+)?\]/.test(line))
        .join('\n');
      t = t.replace(/^\[(消息|对白|对话|动作|语音|图片|表情包|转账|红包|邀请|分享|css美化)(?:\|[^\]]+)?\]\s*/gm, '');
    } catch (e) {}
    t = String(t || '').trim().replace(/\s+/g, ' ');
    return t;
  },

  _sanitizeExportFileBase(name) {
    const raw = String(name || '会话').trim() || '会话';
    return raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || '会话';
  },

  async exportSessionDialogueRange(sessionId, userRoundFrom, userRoundTo, format) {
    const sid = String(sessionId || '').trim();
    const fr = Math.floor(Number(userRoundFrom));
    const tr = Math.floor(Number(userRoundTo));
    if (!sid || !Number.isFinite(fr) || !Number.isFinite(tr) || fr < 1 || tr < fr) {
      if (typeof this._toast === 'function') this._toast('区间无效');
      return;
    }
    const lo = Math.min(fr, tr);
    const hi = Math.max(fr, tr);
    const session = await Storage.dbGet('sessions', sid);
    if (!session) {
      if (typeof this._toast === 'function') this._toast('会话不存在');
      return;
    }
    const sorted = await this._getSortedMemoryEligibleMessages(sid);
    const msgs = this._sliceMessagesByUserRounds(sorted, lo, hi);
    if (!msgs || !msgs.length) {
      if (typeof this._toast === 'function') this._toast('该区间没有可导出内容');
      return;
    }
    const userDisplayName = await this._resolveUserDisplayNameForApi(session);
    const characterNameOf = await this._buildCharacterNameResolverForApi(session);

    const fmt = String(format || 'txt').toLowerCase() === 'html' ? 'html' : 'txt';
    const base = this._sanitizeExportFileBase(session.title);
    const day = new Date();
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const fileBase = `${base}_第${lo}-${hi}轮_${ymd}`;

    const blocks = [];
    msgs.forEach((m) => {
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
      const isUser = m.role === 'user';
      const name = isUser ? userDisplayName : characterNameOf(m);
      const body = this._cleanMessageContentForExport(m.content, m.role);
      if (!body) return;
      blocks.push({ isUser, name, body });
    });
    if (!blocks.length) {
      if (typeof this._toast === 'function') this._toast('清洗后无有效正文');
      return;
    }

    if (fmt === 'txt') {
      const lines = blocks.map((b) => `${b.name}：${b.body}`);
      const out = lines.join('\n\n');
      const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
      await Storage.downloadBlobWithWait(blob, `${fileBase}.txt`, '正在导出会话…');
      return;
    }

    const titleEsc = this._escapeHtmlForExport(session.title || '会话导出');
    const fixedRows = blocks.map((b) => {
      const cls = b.isUser ? 'yd-export-row yd-export-row--user' : 'yd-export-row yd-export-row--assistant';
      const nm = this._escapeHtmlForExport(b.name);
      const bd = this._escapeHtmlForExport(b.body).replace(/\n/g, '<br>');
      return `<div class="${cls}"><div class="yd-export-inner"><div class="yd-export-meta"><span class="yd-export-name">${nm}</span></div><div class="yd-export-bubble">${bd}</div></div></div>`;
    }).join('');

    const htmlDoc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titleEsc}</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;background:#f2f2f7;margin:0;padding:16px;color:#111;}
h1{font-size:16px;margin:0 0 12px;font-weight:800;}
.sub{font-size:12px;color:#666;margin-bottom:16px;}
.yd-export-wrap{max-width:560px;margin:0 auto;}
.yd-export-row{display:flex;width:100%;margin:10px 0;}
.yd-export-row--assistant{justify-content:flex-start;}
.yd-export-row--user{justify-content:flex-end;}
.yd-export-meta{font-size:11px;color:#666;margin-bottom:4px;}
.yd-export-bubble{max-width:100%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;word-break:break-word;}
.yd-export-row--assistant .yd-export-bubble{background:#ede9fe;border:1px solid rgba(91,33,182,0.12);}
.yd-export-row--user .yd-export-bubble{background:#dbeafe;border:1px solid rgba(0,81,168,0.12);}
.yd-export-inner{display:flex;flex-direction:column;max-width:78%;}
.yd-export-row--user .yd-export-inner{align-items:flex-end;}
.yd-export-row--assistant .yd-export-inner{align-items:flex-start;}
</style></head><body><div class="yd-export-wrap"><h1>${titleEsc}</h1><div class="sub">第 ${lo}–${hi} 轮 · ${this._escapeHtmlForExport(userDisplayName)} 与角色对话导出</div>${fixedRows}</div></body></html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    await Storage.downloadBlobWithWait(blob, `${fileBase}.html`, '正在导出会话…');
  },

  _formatSessionMemorySummaryTime(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  },

  _buildSessionMemorySummarySystemForApi(session) {
    const s = session && typeof session === 'object' ? session : null;
    if (!s) return '';
    const cfg = this._getSessionMemoryEnhanceConfig(s);
    if (!cfg.enabled) return '';
    const history = Array.isArray(cfg.history) ? cfg.history : [];
    const enabled = history.filter((e) => e && e.enabled !== false && String(e.text || '').trim());
    if (!enabled.length) return '';
    enabled.sort((a, b) => Number(a.userRoundFrom || 0) - Number(b.userRoundFrom || 0));
    const parts = ['【会话记忆摘要】（仅汇总「已开启」的记忆条目；用于上下文衔接，不要逐字复述）'];
    enabled.forEach((e) => {
      const rf = Number(e.userRoundFrom);
      const rt = Number(e.userRoundTo);
      const label = Number.isFinite(rf) && Number.isFinite(rt) ? `第${rf}-${rt}轮：` : '';
      parts.push(`${label}${String(e.text || '').trim()}`);
    });
    return parts.join('\n');
  },

  async _buildProactiveSystemZoneForSession(sessionId) {
    const session=await Storage.dbGet('sessions',sessionId);
    return session ? SCChat.proactivePrompt(session) : '';
  },
  _isTimeAwarenessEnabled() {
    try {
      if (typeof ChatMessageBuilder !== 'undefined' && ChatMessageBuilder && typeof ChatMessageBuilder.isRealTimeAwarenessEnabled === 'function') {
        return !!ChatMessageBuilder.isRealTimeAwarenessEnabled();
      }
    } catch (e) {}
    try {
      const key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.TIME_AWARENESS)
        ? CONFIG.STORAGE_KEYS.TIME_AWARENESS
        : 'time_awareness';
      const def = (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_TIME_AWARENESS) ? CONFIG.DEFAULT_TIME_AWARENESS : 'on';
      const mode = String((typeof Storage !== 'undefined' && Storage.get) ? (Storage.get(key) || def) : def).trim();
      return mode === 'on';
    } catch (e2) {
      return false;
    }
  },

  _buildMemorySummarizePromptFromMessages(
    msgs,
    { userDisplayName = '用户', characterNameOf = null, includeOnlineUserTime = false } = {}
  ) {
    const lines = [];
    (Array.isArray(msgs) ? msgs : []).forEach((m) => {
      if (!m || !m.role) return;
      const isUser = m.role === 'user';
      const msgMode = (m && m.mode != null) ? (Number(m.mode) === 1 ? 1 : 0) : 0;
      const roleName = (() => {
        if (isUser) return String(userDisplayName || '用户').trim() || '用户';
        if (typeof characterNameOf === 'function') {
          const n = String(characterNameOf(m) || '').trim();
          if (n) return n;
        }
        const n2 = String(m.characterName || '').trim();
        return n2 || '角色';
      })();
      let t = String(m.content || '').trim();
      if (!t) return;
      // 记忆总结：尽量剥离协议噪音，只保留可读信息
      try {
        // 去掉独立成行的 [建议回复]（线下选项）
        t = t
          .split('\n')
          .map((x) => String(x || '').trim())
          .filter((line) => !!line && !/^\[建议回复(?:\|[^\]]+)?\]/.test(line))
          .join('\n');
        // 去掉行首协议标签本体（保留后面的正文）
        t = t.replace(/^\[(消息|对白|对话|动作|语音|图片|表情包|转账|红包|邀请|分享|css美化)(?:\|[^\]]+)?\]\s*/gm, '');
      } catch (e) {}
      t = String(t || '').trim();
      if (!t) return;
      lines.push(`${roleName}：${t}`);
      // 仅在“时间感知开启”时为线上(user, mode=0)附带时间
      if (isUser && includeOnlineUserTime && msgMode === 0) {
        const ts = this._formatSessionMemorySummaryTime(m.createdAt);
        if (ts) lines.push(`时间：${ts}`);
      }
    });
    return lines.join('\n');
  },

  async _requestOpenAiStyleChatCompletion({ baseUrl, apiKey, payload } = {}) {
    return this._postChatCompletionsAndParse({ baseUrl, apiKey, payload: payload || {} });
  },

  _isMemoryEnhanceDebugEnabled() {
    try {
      return String(localStorage.getItem('yd_debug_memory_enhance') || '').trim() === '1';
    } catch (e) {
      return false;
    }
  },

  _logMemoryEnhanceDebug(...args) {
    if (!this._isMemoryEnhanceDebugEnabled()) return;
    try {
      console.log('[MemoryEnhance]', ...args);
    } catch (e) {}
  },

  async _summarizeSessionMemoryByUserRounds(sessionId, userRoundFrom, userRoundTo, reason = 'manual') {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    const fr = Math.floor(Number(userRoundFrom));
    const tr = Math.floor(Number(userRoundTo));
    if (!Number.isFinite(fr) || !Number.isFinite(tr) || fr < 1 || tr < fr) return null;

    const session = await Storage.dbGet('sessions', sid);
    if (!session) return null;

    const sorted = await this._getSortedMemoryEligibleMessages(sid);
    const msgs = this._sliceMessagesByUserRounds(sorted, fr, tr);
    const userTurnsInSlice = msgs ? msgs.filter((m) => m && m.role === 'user').length : 0;
    if (!msgs || !msgs.length || userTurnsInSlice === 0) return null;

    let userDisplayName = '用户';
    try {
      const effMask = await this._getEffectiveMaskForSession(session);
      const nm = String(effMask?.name || '').trim();
      if (nm) userDisplayName = nm;
    } catch (e) {}

    let characterMap = null;
    try {
      characterMap = await this.getCharacterMap(true);
    } catch (e) {
      characterMap = null;
    }
    const characterNameOf = (m) => {
      const n = String(m?.characterName || '').trim();
      if (n) return n;
      const cid = String(m?.characterId || '').trim();
      if (cid && characterMap && characterMap.get) {
        const c = characterMap.get(cid);
        const cn = String(c?.name || '').trim();
        if (cn) return cn;
      }
      return '';
    };

    const apiKey = Storage.get(CONFIG.STORAGE_KEYS.API_KEY);
    const baseRaw = Storage.get(CONFIG.STORAGE_KEYS.BASE_URL) || 'https://api.openai.com/v1';
    const baseUrl = String(baseRaw).replace(/\/$/, '');
    const model = Storage.get(CONFIG.STORAGE_KEYS.API_MODEL) || 'gpt-3.5-turbo';
    if (!apiKey) {
      if (typeof this._toast === 'function') this._toast('请先在设置中配置 API Key');
      return null;
    }

    const helperPrompt = String(session?.memoryEnhanceHelperPrompt || '').trim();
    const systemPrompt = helperPrompt || (typeof SessionMemory !== 'undefined' && SessionMemory._defaultHelperPrompt
      ? String(SessionMemory._defaultHelperPrompt || '').trim()
      : '');

    const includeOnlineUserTime = this._isTimeAwarenessEnabled();
    const userPrompt = [
      `请将以下聊天记录总结为记忆摘要（对应本会话第 ${fr}～${tr} 轮用户发言及其间的角色回复）。`,
      '要求：严格按时间顺序理解与整合，不要打乱先后。',
      this._buildMemorySummarizePromptFromMessages(msgs, { userDisplayName, characterNameOf, includeOnlineUserTime })
    ].join('\n');

    let text = '';
    try {
      const data = await this._requestOpenAiStyleChatCompletion({
        baseUrl,
        apiKey,
        payload: {
          model,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.25
        }
      });
      text = String(data?.choices?.[0]?.message?.content || '').trim();
    } catch (e) {
      const em = e && e.message ? String(e.message) : '总结失败';
      if (typeof this._toast === 'function') this._toast(`总结失败：${em.slice(0, 80)}`);
      return null;
    }

    if (!text) return null;

    const now = Date.now();
    const lastMsgAt = Number(msgs[msgs.length - 1]?.createdAt || now) || now;
    const firstMsgAt = Number(msgs[0]?.createdAt || now) || now;
    const entry = {
      id: State.generateId(),
      createdAt: now,
      userRoundFrom: fr,
      userRoundTo: tr,
      fromAt: firstMsgAt,
      toAt: lastMsgAt,
      userTurns: tr - fr + 1,
      text,
      enabled: true,
      reason: String(reason || 'manual')
    };

    session.memoryEnhanceHistory = Array.isArray(session.memoryEnhanceHistory)
      ? session.memoryEnhanceHistory
      : [];
    session.memoryEnhanceHistory.push(entry);
    try {
      delete session.memoryEnhanceLastSummaryAt;
    } catch (eDel) {}
    session.updatedAt = Date.now();
    await Storage.dbPut('sessions', session);
    return entry;
  },

  async _maybeAutoSummarizeSessionMemory(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    if (!this._memoryEnhanceAutoLocks) this._memoryEnhanceAutoLocks = new Set();
    if (this._memoryEnhanceAutoLocks.has(sid)) return;
    this._memoryEnhanceAutoLocks.add(sid);
    try {
      const session = await Storage.dbGet('sessions', sid);
      if (!session) return;
      const cfg = this._getSessionMemoryEnhanceConfig(session);
      if (!cfg.enabled) return;

      const sorted = await this._getSortedMemoryEligibleMessages(sid);
      const totalUserRounds = sorted.filter((m) => m && m.role === 'user').length;
      const maxBookEnd = this._maxMemoryBookUserRoundEnd(session);
      const nextFrom = maxBookEnd + 1;
      const nextTo = maxBookEnd + cfg.everyRounds;
      const willTrigger = totalUserRounds >= nextTo;

      this._logMemoryEnhanceDebug('check', {
        sessionId: sid,
        enabled: !!cfg.enabled,
        everyRounds: cfg.everyRounds,
        maxBookEnd,
        totalUserRounds,
        nextFrom,
        nextTo,
        willTrigger
      });
      if (!willTrigger) return;

      await this._summarizeSessionMemoryByUserRounds(sid, nextFrom, nextTo, 'auto');
      this._logMemoryEnhanceDebug('triggered', {
        sessionId: sid,
        reason: 'userRoundsWindow',
        range: `${nextFrom}-${nextTo}`
      });
      try {
        if (typeof SessionMemory !== 'undefined' && SessionMemory.refreshIfVisible) {
          SessionMemory.refreshIfVisible(sid);
        }
      } catch (e2) {}
    } catch (e) {
      this._logMemoryEnhanceDebug('error', {
        sessionId: sid,
        error: String(e?.message || e || '')
      });
      throw e;
    } finally {
      this._memoryEnhanceAutoLocks.delete(sid);
    }
  },

  // 归一化 API 返回的 content：支持 string 或 array（如 Gemini 的 [{type:'text',text:'...'}]）
  _normalizeApiContent(content) {
    if (content == null || content === '') return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return String(content);
    return content
      .map(p => (p && typeof p.text === 'string') ? p.text : (p && typeof p.content === 'string') ? p.content : '')
      .filter(Boolean)
      .join('');
  },

  _collectAssistantReceiveChunks(workingText, opts = {}) {
    const requestMode = opts.requestMode === 1 ? 1 : 0;
    const mode = opts.mode;
    const voiceCallRequest = !!opts.voiceCallRequest;
    const voiceCallMode = opts.voiceCallMode;
    const normalizeVoiceCallReplyForMode = typeof opts.normalizeVoiceCallReplyForMode === 'function'
      ? opts.normalizeVoiceCallReplyForMode
      : (t) => String(t || '');
    const mixed = this._parseMixedContent(workingText);
    const chunks = [];
    mixed.forEach((seg) => {
      if (!seg) return;
      if (seg.type === 'html') {
        const html = String(seg.content || '').trim();
        if (!html) return;
        chunks.push({ type: 'html', text: html, delayMs: 0 });
        return;
      }
      const text = voiceCallRequest
        ? normalizeVoiceCallReplyForMode(seg.content, voiceCallMode)
        : String(seg.content || '');
      const parts = this._splitTextIntoReceiveChunks(text, mode === 'group');
      const isGroupChat = mode === 'group';
      parts.forEach((p) => {
        const t = String(p || '').trim();
        if (!t) return;
        const sanitized = this._stripVoiceMoodTagsFromNonVoiceMessage(t);
        if (!sanitized) return;
        let delayMs = 0;
        const td = String(sanitized || '').trim();
        const isProtocolChunk =
          typeof MessageTypes !== 'undefined' && MessageTypes.tryMatch
            ? !!MessageTypes.tryMatch(td, isGroupChat)
            : /^\[(消息|对白|对话|建议回复|css美化|图片|表情包|语音|动作|邀请|分享|转账|红包|收取转账|收取红包|系统)(?:\|[^\]]+)?\]/.test(td);
        if (isProtocolChunk) {
          const base = this._estimateReceiveDelayMs(td);
          delayMs = requestMode === 1
            ? Math.max(300, Math.min(1000, base))
            : base;
        }
        chunks.push({ type: 'text', text: td, delayMs });
      });
    });
    return chunks;
  },

  /**
   * SystemActions/Notifications 剥空正文时：从 rawContent 回收可见行并包成线上 [消息] 块，避免“API 成功但聊天无气泡”。
   */
  _ensureAssistantReceiveChunksFromApi(rawContent, workingText, chunks, opts = {}) {
    if (Array.isArray(chunks) && chunks.length) return chunks;
    let fallback = String(workingText || '').trim();
    if (!fallback) {
      fallback = String(rawContent || '')
        .split('\n')
        .map((l) => String(l || '').trim())
        .filter((l) => l && !/^\[系统\]/.test(l) && !/^\[通知\]/.test(l))
        .join('\n')
        .trim();
    }
    if (!fallback) return chunks || [];
    const requestMode = opts.requestMode === 1 ? 1 : 0;
    if (requestMode === 0) {
      fallback = fallback
        .split('\n')
        .map((line) => {
          const t = String(line || '').trim();
          if (!t) return '';
          if (/^\[(消息|对白|对话|图片|表情包|语音|动作|建议回复|css美化|邀请|分享|转账|红包|系统)(?:\|[^\]]+)?\]/.test(t)) {
            return t;
          }
          return `[消息]${t}`;
        })
        .filter(Boolean)
        .join('\n');
    }
    if (!String(fallback || '').trim()) return chunks || [];
    return this._collectAssistantReceiveChunks(fallback, opts);
  },

  /** 本轮仅有 [系统]主动消息 时：把定时页预览正文同步进聊天（与 LOCAL_PREVIEW 一致） */
  async _collectProactivePreviewFallbackChunks() { return []; },

  _splitTextIntoReceiveChunks(text, isGroup = false) {
    const raw = String(text || '');
    if (!raw.trim()) return [];
    const lines = raw.split('\n');
    const out = [];
    let plain = [];

    // 协议 token：用于识别一行里是否出现多个 [消息]/[图片]/[动作] 这类块。
    // 例如模型输出 "[消息]... [图片]... [消息]..." 都挤在同一行（中间只有空格或直接紧挨），
    // 如果不拆开，会被视为一个 chunk，从而导致“这些消息一次性出现、没有逐条延时”。
    const protocolTokenRe = /\[(消息|对白|对话|图片|表情包|语音|动作|建议回复|邀请|分享|转账|红包|系统)(?:\|[^\]]+)?\]/g;

    const splitProtocolInLine = (s) => {
      const input = String(s || '');
      protocolTokenRe.lastIndex = 0;
      const matches = Array.from(input.matchAll(protocolTokenRe));
      if (matches.length <= 1) return [input];
      const pieces = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : input.length;
        const piece = input.slice(start, end).trim();
        if (piece) pieces.push(piece);
      }
      return pieces.length ? pieces : [input];
    };

    const flushPlain = () => {
      if (plain.length > 0) {
        out.push(plain.join('\n'));
        plain = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = String(line || '').trim();
      if (!trimmedLine) {
        // 空行不再强制切分为新消息：并回 plain，保留 \n\n 等段落结构。
        // 这样 MiPhone_start...MiPhone_end 这类跨段正则不会因空行被拆开而失配。
        plain.push('');
        continue;
      }

      // [css美化] 标题行后面的 fenced code（```...```）必须与标题保持在同一 chunk。
      // 否则逐条接收分段会把代码块拆成单独 plain，导致“上方 css_beautify 卡片 + 下方代码块”分离。
      const isCssBeautifyHeader =
        /^\[css美化(?:\|[^\]]+)?\]/.test(trimmedLine) ||
        /^【css美化】/.test(trimmedLine);
      if (isCssBeautifyHeader) {
        let j = i + 1;
        const followLines = [];
        let sawFenceStart = false;
        let sawFenceEnd = false;

        while (j < lines.length) {
          const oneRaw = String(lines[j] || '');
          const oneTrim = oneRaw.trim();

          if (!sawFenceStart) {
            // 标题与 fenced code 之间允许空行
            if (!oneTrim) {
              followLines.push(oneRaw);
              j++;
              continue;
            }
            // 只要下一段是 fenced code，就并入同一 chunk（不限定语言）
            if (/^```/.test(oneTrim)) {
              sawFenceStart = true;
              followLines.push(oneRaw);
              // 极端：开闭同一行 ```...```
              if (/^```[\s\S]*```$/.test(oneTrim) && oneTrim.length > 6) {
                sawFenceEnd = true;
                j++;
                break;
              }
              j++;
              continue;
            }
            break;
          }

          followLines.push(oneRaw);
          if (/^```/.test(oneTrim)) {
            sawFenceEnd = true;
            j++;
            break;
          }
          j++;
        }

        if (sawFenceStart && sawFenceEnd) {
          flushPlain();
          out.push([line, ...followLines].join('\n'));
          i = j - 1;
          continue;
        }
      }

      // 这一行里如果出现多个协议 token（[消息]/[图片]/[动作]...），
      // 先拆成多段再逐个判定，这样每个协议块都能单独成为一个 chunk，从而享受延时。
      protocolTokenRe.lastIndex = 0;
      const tokenCount = (trimmedLine.match(protocolTokenRe) || []).length;
      const segments = tokenCount > 1 ? splitProtocolInLine(trimmedLine) : [trimmedLine];

      segments.forEach(segment => {
        const seg = String(segment || '').trim();
        if (!seg) return;
      const matched = (typeof MessageTypes !== 'undefined' && MessageTypes.tryMatch)
          ? MessageTypes.tryMatch(seg, isGroup)
        : null;
      if (matched) {
        flushPlain();
          out.push(seg);
      } else {
          // 非协议格式仍然按原逻辑并入 plain，必要时合并成一段普通正文
          plain.push(segment);
      }
      });
    }
    flushPlain();
    return out;
  },

  _estimateReceiveDelayMs(text) {
    const t = String(text || '').trim();
    if (!t) return 0;
    const len = t.replace(/\s+/g, '').length;
    const ms = 650 + len * 70;
    return Math.max(400, Math.min(3500, ms));
  },

  // 线下 plain 逐字展示的预计耗时（与 _runPlainTextStreamRevealJob 的 targetMs 逻辑对齐）
  _estimatePlainStreamRevealMs(text) {
    const full = String(text ?? '');
    const units = [...full];
    if (!units.length) return 0;
    return Math.min(10000, Math.max(250, units.length * 16));
  },

  async _waitPlainStreamQueueDrain(maxWaitMs = 15000) {
    const deadline = Date.now() + Math.max(200, Number(maxWaitMs) || 15000);
    while (Date.now() < deadline) {
      const running = !!this._plainStreamPumpRunning;
      const qlen = Array.isArray(this._plainStreamRevealQueue) ? this._plainStreamRevealQueue.length : 0;
      if (!running && qlen <= 0) return true;
      await this._sleep(30);
    }
    return false;
  },

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms | 0)));
  },

  _setQuote(payload) {
    const text = String(payload?.text || '').trim();
    if (!text) {
      this._clearQuote();
      return;
    }
    this._currentQuote = {
      text,
      fromName: payload?.fromName || ''
    };
    const bar = document.getElementById('chat-toolbar');
    const textEl = document.getElementById('chat-quote-text');
    if (bar) bar.classList.add('yd-chat-toolbar--quoting');
    if (textEl) {
      // 显示文案做二次截断，避免过长（显示长度与输入区域视觉一致）
      const maxDisplayLen = 60;
      const base = text.length > maxDisplayLen ? text.slice(0, maxDisplayLen) + '…' : text;
      const label = this._currentQuote.fromName ? `${this._currentQuote.fromName}：${base}` : base;
      textEl.textContent = label;
    }
  },

  _clearQuote() {
    this._currentQuote = null;
    const bar = document.getElementById('chat-toolbar');
    const textEl = document.getElementById('chat-quote-text');
    if (bar) bar.classList.remove('yd-chat-toolbar--quoting');
    if (textEl) textEl.textContent = '';
  },
  
  // 更新标题
  async updateTitle() {
    const session = await Storage.dbGet('sessions', this.currentSessionId);
    if (session) {
      const names = Array.isArray(session.participantCharacterNames) ? session.participantCharacterNames.filter(Boolean) : [];
      const label = names.length ? (names.length === 1 ? names[0] : `${names.join('、')}（群聊）`) : '';
      const titleNameTextEl = document.getElementById('chat-title-name-text');
      const titleNameEl = document.getElementById('chat-title-name');
      const titleEl = document.getElementById('chat-title');
      const customTitle = String(session.title || '').trim();
      // 会话设置里改过的名称优先；未设置时再回退到角色名 / 默认
      const nameText = customTitle || label || '聊天';
      if (titleNameTextEl) {
        titleNameTextEl.textContent = nameText;
      } else if (titleNameEl) {
        titleNameEl.textContent = nameText;
      } else if (titleEl) {
        titleEl.textContent = nameText;
      }

      // 更新连续聊天天数（火花）
      const streakEl = document.getElementById('chat-title-spark-count');
      if (streakEl) {
        const days = this._computeStreakDays();
        streakEl.textContent = String(days);
      }
    }
  },

  _computeStreakDays() {
    if (this._isSparkBroken()) return 0;
    const eligible = this._getSparkStreakSourceMessages().filter((m) => this._isSparkStreakEligibleMessage(m));
    return this._computeStreakDaysFromMessageList(eligible);
  },
  
  _getBubbleMetaBadgeConfig(isUser) {
    try {
      if (
        typeof BubbleSettings !== 'undefined' &&
        BubbleSettings &&
        typeof BubbleSettings.getAppliedMetaBadgeSide === 'function'
      ) {
        return BubbleSettings.getAppliedMetaBadgeSide(!!isUser);
      }
    } catch (e) {}
    return isUser
      ? { showTime: true, showRead: true, timePosition: 'left', readPosition: 'left' }
      : { showTime: true, showRead: true, timePosition: 'right', readPosition: 'right' };
  },

  _normalizeMetaPosition(pos) {
    const p = String(pos || 'bottom').toLowerCase();
    return ['top', 'bottom', 'left', 'right'].includes(p) ? p : 'bottom';
  },

  /**
   * 左/右配置 → 实际槽位
   * - 角色「左」、用户「右」：头像正下方（avatarBelow）
   * - 角色「右」、用户「左」：气泡外侧（outerSide，紧贴气泡另一边）
   */
  _resolveMetaSlot(configPos, isUser) {
    const p = this._normalizeMetaPosition(configPos);
    if (p === 'top' || p === 'bottom') return p;
    const underAvatar = isUser ? p === 'right' : p === 'left';
    return underAvatar ? 'avatarBelow' : 'outerSide';
  },

  _joinMessageMetaInner(parts, slot) {
    const filtered = parts.filter(Boolean);
    if (!filtered.length) return '';
    if (slot === 'avatarBelow' || slot === 'outerSide') {
      return filtered.map((html) => `<span class="yd-message__meta-line">${html}</span>`).join('');
    }
    return filtered.join('<span class="yd-message__meta-sep"> · </span>');
  },

  _formatMessageMetaTimeHm(timestamp) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return '';
    try {
      return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  },

  /** 用户消息：伪发送=未读；真实发送后=已读（与「正在输入」等送达态一致） */
  _getMessageReadStatusText(msg) {
    if (!msg || String(msg.role || '') !== 'user') return '';
    return msg._pending ? '未读' : '已读';
  },

  /** 真实发送（flush）后：仅更新已 flush 用户消息的「未读→已读」，避免全量 renderMessages 导致历史图片闪烁 */
  _syncFlushedUserMessagesInDom(pendingIdSet) {
    const scroll = document.getElementById('chat-scroll');
    if (!scroll || !pendingIdSet || typeof pendingIdSet.has !== 'function') return;
    const list = Array.isArray(this.messages) ? this.messages : [];
    for (const msg of list) {
      if (!msg || msg.id == null) continue;
      const id = String(msg.id);
      if (!pendingIdSet.has(msg.id) && !pendingIdSet.has(id)) continue;
      if (String(msg.role || '') !== 'user') continue;
      const readText = this._getMessageReadStatusText(msg);
      if (!readText) continue;
      let nodes;
      try {
        nodes = scroll.querySelectorAll(`[data-msg-id="${CSS.escape(id)}"] .yd-message__read`);
      } catch (e) {
        nodes = scroll.querySelectorAll(`[data-msg-id="${id}"] .yd-message__read`);
      }
      nodes.forEach((el) => {
        if (el) el.textContent = readText;
      });
    }
  },

  _buildMessageMetaPlacement(msg, isUser, globalMsgIndex) {
    const cfg = this._getBubbleMetaBadgeConfig(isUser);
    const empty = { top: '', bottom: '', avatarBelow: '', outerSide: '' };
    if (!cfg) return empty;

    const buckets = {
      top: { time: '', read: '' },
      bottom: { time: '', read: '' },
      avatarBelow: { time: '', read: '' },
      outerSide: { time: '', read: '' }
    };

    if (cfg.showTime) {
      const timeText = this._formatMessageMetaTimeHm(msg && msg.createdAt);
      if (timeText) {
        const slot = this._resolveMetaSlot(cfg.timePosition, isUser);
        buckets[slot].time = `<span class="yd-message__time">${this.escapeHtml(timeText)}</span>`;
      }
    }
    if (cfg.showRead) {
      const readText = isUser
        ? this._getMessageReadStatusText(msg)
        : '已读';
      if (readText) {
        const slot = this._resolveMetaSlot(cfg.readPosition, isUser);
        buckets[slot].read = `<span class="yd-message__read">${this.escapeHtml(readText)}</span>`;
      }
    }

    const out = { top: '', bottom: '', avatarBelow: '', outerSide: '' };
    ['top', 'bottom', 'avatarBelow', 'outerSide'].forEach((slot) => {
      const b = buckets[slot];
      const parts = isUser ? [b.read, b.time] : [b.time, b.read];
      const inner = this._joinMessageMetaInner(parts, slot);
      if (inner) {
        const clsBySlot = {
          top: 'yd-message__meta yd-message__meta--top',
          bottom: 'yd-message__meta yd-message__meta--bottom',
          avatarBelow: 'yd-message__meta yd-message__meta--avatar-below',
          outerSide: 'yd-message__meta yd-message__meta--outer-side'
        };
        const cls = clsBySlot[slot] || 'yd-message__meta';
        out[slot] = `<div class="${cls}" aria-hidden="true">${inner}</div>`;
      }
    });
    return out;
  },

  _buildMessageBodyTopRow(isUser, isFirstSegment, nameHtml, metaTopHtml) {
    if (!metaTopHtml) return '';
    if (isUser) {
      return `<div class="yd-message__header yd-message__meta-row--top">${metaTopHtml}</div>`;
    }
    if (isFirstSegment && nameHtml) {
      return `<div class="yd-message__header yd-message__meta-row--top">${nameHtml}${metaTopHtml}</div>`;
    }
    return `<div class="yd-message__header yd-message__meta-row--top">${metaTopHtml}</div>`;
  },

  _buildMessageMetaHtml(msg, isUser, globalMsgIndex) {
    return this._buildMessageMetaPlacement(msg, isUser, globalMsgIndex).bottom || '';
  },
  
  // 格式化时间
  formatTime(timestamp) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return '';
    const now = Date.now();
    const diff = now - ts;
    const date = new Date(ts);
    
    // 一分钟内
    if (diff < 60000) {
      return '刚刚';
    }
    // 一小时内
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    }
    // 今天
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    // 昨天
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    }
    // 更早
    try {
      return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    } catch (e) {
      return '';
    }
  },
  
  // 加载聊天背景：优先会话级，其次兼容旧的全局 chat_background
  async loadChatBackground() {
    const el = document.getElementById('chat-background');
    if (!el) return;

    // 读取会话级背景
    let sessionBg = null;
    if (this.currentSessionId) {
      try {
        const session = this.currentSession || await Storage.dbGet('sessions', this.currentSessionId);
        sessionBg = session?.chatBackground ?? session?.chat_background ?? null;
      } catch (e) {
        console.warn('读取会话背景失败:', e);
      }
    }

    // 若没有会话背景，回落到旧的全局背景
    const bg = sessionBg ?? Storage.get('chat_background') ?? null;
    if (!bg) {
      el.style.backgroundImage = '';
      this._applyChatToneByBg('');
      return;
    }

    // 旧版本：直接把 Base64 存在 localStorage
    if (typeof bg === 'string') {
      if (bg.startsWith('data:image/')) {
        try {
          const item = {
            id: State.generateId(),
            data: bg,
            name: '聊天背景',
            createdAt: Date.now()
          };
          await Storage.dbAdd('album', item);
          // 迁移：把旧字符串迁移为相册引用（如果当前有会话则写会话，否则写全局）
          if (this.currentSessionId) {
            const session = this.currentSession || await Storage.dbGet('sessions', this.currentSessionId);
            if (session) {
              session.chatBackground = { albumId: item.id };
              await Storage.dbPut('sessions', session);
              this.currentSession = session;
            }
          } else {
            Storage.set('chat_background', { albumId: item.id });
          }
          el.style.backgroundImage = `url(${item.data})`;
          this._applyChatToneByBg(item.data);
          return;
        } catch (e) {
          console.error('迁移旧聊天背景到相册失败:', e);
          el.style.backgroundImage = `url(${bg})`;
          this._applyChatToneByBg(bg);
          return;
        }
      }

      el.style.backgroundImage = `url(${bg})`;
      this._applyChatToneByBg(bg);
      return;
    }

    // 新版本：只在 localStorage 里存相册图片的 id
    if (bg && bg.albumId) {
      try {
        const item = await Storage.dbGet('album', bg.albumId);
        if (item && item.data) {
          el.style.backgroundImage = `url(${item.data})`;
          this._applyChatToneByBg(item.data);
        } else {
          el.style.backgroundImage = '';
          this._applyChatToneByBg('');
        }
      } catch (e) {
        console.error('加载聊天背景失败:', e);
      }
      return;
    }
  },
  
  // 设置聊天背景（旧：全局）。保留以兼容历史调用，不建议新逻辑使用。
  async setChatBackground(imageData, albumId) {
    const el = document.getElementById('chat-background');
    if (el && imageData) {
      el.style.backgroundImage = `url(${imageData})`;
      this._applyChatToneByBg(imageData);
    }

    try {
      let id = albumId;

      if (!id && imageData) {
        const item = {
          id: State.generateId(),
          data: imageData,
          name: '聊天背景',
          createdAt: Date.now()
        };
        await Storage.dbAdd('album', item);
        id = item.id;
      }

      if (id) {
        Storage.set('chat_background', { albumId: id });
      }
    } catch (e) {
      console.error('保存聊天背景失败:', e);
    }
  },

  _applyChatToneByBg(src) {
    const page = document.getElementById('page-chat');
    if (!page) return;
    const s = String(src || '').trim();
    if (!s) {
      page.removeAttribute('data-bg-tone');
      return;
    }

    // 仅在可绘制的图片上取样；失败则默认浅色
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          const w = 32, h = 32;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);
          let sum = 0;
          let cnt = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 16) continue;
            // 相对亮度
            const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            sum += lum;
            cnt++;
          }
          const avg = cnt ? (sum / cnt) : 1;
          page.setAttribute('data-bg-tone', avg < 0.55 ? 'dark' : 'light');
        } catch (e) {
          page.setAttribute('data-bg-tone', 'light');
        }
      };
      img.onerror = () => page.setAttribute('data-bg-tone', 'light');
      img.src = s;
    } catch (e) {
      page.setAttribute('data-bg-tone', 'light');
    }
  },
  
  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

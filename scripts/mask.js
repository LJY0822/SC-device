// 我的面具管理
// 面具设定详情上限：用户反馈从“1万字”提升到“最高 10万字”
// 注意：这里按 detail 字符串的长度（字符数）来限制，与“字数”展示保持一致。
const MASK_DETAIL_MAX_LEN = 100000;

const Mask = {
  async init() {
    this.setupEvents();
    await this.loadMasks();
  },

  setupEvents() {
    const backBtn = document.getElementById('mask-back');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        const returnPage = String(State.maskReturnPage || '').trim();
        const returnSessionId = String(State.maskReturnSessionId || '').trim();
        State.maskReturnPage = null;
        State.maskReturnSessionId = null;
        if (returnPage === 'page-chat-settings' && returnSessionId) {
          try {
            if (typeof Chat !== 'undefined' && Chat && typeof Chat.openSessionSettings === 'function') {
              Chat.currentSessionId = returnSessionId;
              await Chat.openSessionSettings();
              return;
            }
          } catch (e) {}
        }
        if (returnPage) {
          try {
            State.switchPage(returnPage);
            return;
          } catch (e2) {}
        }
        State.backToHome();
      });
    }

    const addBtn = document.getElementById('mask-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.createMask());
    }
  },

  async loadMasks() {
    const listEl = document.getElementById('mask-list');
    if (!listEl) return;

    const defaultId = Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '';
    const masks = await Storage.dbGetAll('masks');
    masks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!masks.length) {
      listEl.innerHTML = `
        <div class="yd-empty">
          <div class="yd-empty__icon">🎭</div>
          <div class="yd-empty__text">暂无面具，可以点击右上角 + 新建</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    masks.forEach(mask => {
      const item = document.createElement('div');
      item.className = 'yd-list-item';

      const name = (mask.name || '').trim() || '未命名面具';
      const detail = (mask.detail || '').trim();
      const preview = detail
        ? (detail.length > 40 ? detail.slice(0, 40) + '…' : detail)
        : '暂无设定详情';
      const isDefault = defaultId && mask.id === defaultId;
      const avatar = (mask.avatar || '').trim();
      const avatarHtml = avatar
        ? `<img class="yd-chat-avatar-img" alt="${this.escapeHtml(name)}" src="${this.escapeHtml(avatar)}">`
        : '🎭';

      item.innerHTML = `
        <div class="yd-list-item__avatar">${avatarHtml}</div>
        <div class="yd-list-item__content">
          <div class="yd-list-item__header">
            <div class="yd-list-item__title">${this.escapeHtml(name)}${isDefault ? '（默认）' : ''}</div>
          </div>
          <div class="yd-list-item__subtitle">${this.escapeHtml(preview)}</div>
        </div>
      `;

      item.addEventListener('click', () => this.showMask(mask));
      listEl.appendChild(item);
    });
  },

  async createMask() {
    try {
      const existingMasks = await Storage.dbGetAll('masks');
      const isFirstMask = !Array.isArray(existingMasks) || existingMasks.length === 0;

      const existingModal = document.getElementById('yd-mask-add-modal');
      if (existingModal) existingModal.remove();

      const modal = document.createElement('div');
      modal.id = 'yd-mask-add-modal';
      modal.className = 'yd-forum-picker';
      modal.innerHTML = `
        <div class="yd-forum-picker__mask" data-close="1"></div>
        <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
          <div class="yd-forum-picker__bar">
            <div class="yd-forum-picker__title">新增面具</div>
            <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
          </div>

          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div id="yd-mask-add-avatar-holder" style="width:44px;height:44px;border-radius:999px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center;flex:0 0 auto;">
              <span id="yd-mask-add-avatar-placeholder" style="font-size:22px;">🎭</span>
            </div>
            <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <button type="button" class="yd-album-btn" id="yd-mask-add-avatar-upload">上传头像</button>
              <input type="file" id="yd-mask-add-avatar-file" accept="image/png,image/jpeg,image/webp" style="display:none" aria-hidden="true">
            </div>
          </div>

          <label class="yd-book-edit__row yd-toggle" style="margin:2px 0 12px;">
            <span class="yd-toggle__label">设为默认</span>
            <span class="yd-toggle__control">
              <input type="checkbox" id="yd-mask-add-default" class="yd-toggle__input" ${isFirstMask ? 'checked disabled' : ''}>
              <span class="yd-toggle__slider"></span>
            </span>
          </label>

          <input class="yd-forum-compose__input" id="yd-mask-add-name" placeholder="面具名称（对我的称呼）" maxlength="48" />
          <textarea class="yd-forum-compose__textarea" id="yd-mask-add-detail" placeholder="面具设定详情（最多 ${MASK_DETAIL_MAX_LEN} 字）" maxlength="${MASK_DETAIL_MAX_LEN}"></textarea>
          <div class="yd-forum-picker__footer" style="justify-content:flex-start; margin-top:6px; margin-bottom:12px;">
            <div id="yd-mask-add-count" style="font-size:12px;color:#6b7280;">
              当前面具：0字
            </div>
          </div>

          <div class="yd-forum-picker__footer">
            <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-mask-add-save">保存</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const close = () => modal.remove();
      modal.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
      });

      const nameEl = modal.querySelector('#yd-mask-add-name');
      const detailEl = modal.querySelector('#yd-mask-add-detail');
      const saveBtn = modal.querySelector('#yd-mask-add-save');
      const countEl = modal.querySelector('#yd-mask-add-count');
      const avatarHolderEl = modal.querySelector('#yd-mask-add-avatar-holder');
      const avatarUploadBtn = modal.querySelector('#yd-mask-add-avatar-upload');
      const avatarFileEl = modal.querySelector('#yd-mask-add-avatar-file');
      const defaultEl = modal.querySelector('#yd-mask-add-default');

      let avatarData = '';

      if (avatarUploadBtn && avatarFileEl) {
        avatarUploadBtn.addEventListener('click', () => avatarFileEl.click());
        avatarFileEl.addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
            alert('只支持PNG、JPG、WebP格式');
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            avatarData = reader.result;
            if (avatarHolderEl) {
              avatarHolderEl.innerHTML = `<img id="yd-mask-add-avatar-img" src="${this.escapeHtml(avatarData)}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
            }
          };
          reader.readAsDataURL(file);
          // allow re-upload same file
          avatarFileEl.value = '';
        });
      }

      setTimeout(() => nameEl && nameEl.focus(), 0);

      const updateCount = () => {
        if (!detailEl || !countEl) return;
        countEl.textContent = `当前面具：${(detailEl.value || '').length}字`;
      };
      if (detailEl) {
        detailEl.addEventListener('input', updateCount);
        updateCount();
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const name = String(nameEl && nameEl.value || '').trim();
          const detail = String(detailEl && detailEl.value || '').trim();
          const willSetDefault = !!(defaultEl && defaultEl.checked);

          if (!name) {
            alert('面具名称不能为空');
            nameEl && nameEl.focus();
            return;
          }
          if (detail.length > MASK_DETAIL_MAX_LEN) {
            alert(`内容过长（${detail.length} 字），请控制在 ${MASK_DETAIL_MAX_LEN} 字以内。`);
            detailEl && detailEl.focus();
            return;
          }

          const now = Date.now();
          const mask = {
            id: State.generateId(),
            name,
            detail,
            avatar: avatarData || '',
            createdAt: now
          };

          await Storage.dbAdd('masks', mask);
          if (isFirstMask || willSetDefault) Storage.set(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID, mask.id);
          await this.loadMasks();
          if (Settings && Settings.showToast) {
            Settings.showToast(isFirstMask || willSetDefault ? '面具已创建，并已设为默认' : '面具已创建');
          }

          close();
        });
      }
    } catch (e) {
      console.error('创建面具失败:', e);
      alert('创建面具失败');
    }
  },

  showMask(mask) {
    const existing = document.getElementById('yd-mask-modal');
    if (existing) existing.remove();

    const defaultId = Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '';
    const name = (mask.name || '').trim() || '未命名面具';
    const detail = (mask.detail || '').trim() || '暂无设定详情';
    const isDefault = defaultId && mask.id === defaultId;
    const avatar = (mask.avatar || '').trim();

    const modal = document.createElement('div');
    modal.id = 'yd-mask-modal';
    modal.className = 'yd-album-modal';

    modal.innerHTML = `
      <div class="yd-album-modal__inner">
        <div class="yd-album-modal__body">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:44px;height:44px;border-radius:999px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center;flex:0 0 auto;">
              ${avatar ? `<img id="yd-mask-avatar-img" src="${this.escapeHtml(avatar)}" alt="${this.escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:22px;">🎭</span>'}
            </div>
            <div style="flex:1;min-width:0;">
              <div class="yd-album-modal__name" style="margin:0;">${this.escapeHtml(name)}</div>
              <div style="font-size:12px;color:#6b7280;">${isDefault ? '当前为默认面具' : '可设置为默认面具（可选）'}</div>
            </div>
          </div>
          <div style="font-size:13px; line-height:1.6; white-space:pre-wrap; color:#374151; margin-bottom:12px; max-height:50vh; overflow:auto;">
            ${this.escapeHtml(detail)}
          </div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">
            当前面具：${detail.length}字
          </div>
          <div class="yd-album-modal__actions">
            <button type="button" class="yd-album-btn" id="yd-mask-avatar-upload">上传头像</button>
            <input type="file" id="yd-mask-avatar-file" accept="image/png,image/jpeg,image/webp" style="display:none" aria-hidden="true">
            <button type="button" class="yd-album-btn" id="yd-mask-default">${isDefault ? '取消默认' : '设为默认'}</button>
            <button type="button" class="yd-album-btn yd-album-btn--danger" id="yd-mask-delete">删除</button>
            <button type="button" class="yd-album-btn" id="yd-mask-edit">编辑</button>
          </div>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    const editBtn = modal.querySelector('#yd-mask-edit');
    const deleteBtn = modal.querySelector('#yd-mask-delete');
    const defaultBtn = modal.querySelector('#yd-mask-default');
    const uploadBtn = modal.querySelector('#yd-mask-avatar-upload');
    const fileEl = modal.querySelector('#yd-mask-avatar-file');

    if (uploadBtn && fileEl) {
      uploadBtn.addEventListener('click', () => fileEl.click());
      fileEl.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
          alert('只支持PNG、JPG、WebP格式');
          return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            mask.avatar = reader.result;
            await Storage.dbPut('masks', mask);
            await this.loadMasks();
            // 弹窗左上角头像：不管原来是占位 span 还是 img，都强制替换为 img
            const holder = modal.querySelector('#yd-mask-avatar-img')?.parentElement
              || modal.querySelector('#yd-mask-avatar-file')?.parentElement?.parentElement?.querySelector('div[style*="width:44px"]')
              || modal.querySelector('.yd-album-modal__body > div[style*="display:flex"] > div');
            if (holder) {
              holder.innerHTML = `<img id="yd-mask-avatar-img" src="${this.escapeHtml(mask.avatar)}" alt="${this.escapeHtml(mask.name || '')}" style="width:100%;height:100%;object-fit:cover;">`;
            }
            if (Settings && Settings.showToast) Settings.showToast('头像已更新');
          } catch (err) {
            console.error('更新面具头像失败:', err);
            alert('更新头像失败');
          } finally {
            fileEl.value = '';
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (defaultBtn) {
      defaultBtn.addEventListener('click', async () => {
        try {
          const current = Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '';
          const next = current === mask.id ? '' : mask.id;
          Storage.set(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID, next);
          await this.loadMasks();
          close();
          if (Settings && Settings.showToast) Settings.showToast(next ? '已设为默认面具' : '已取消默认面具');
        } catch (e) {
          console.error('设置默认面具失败:', e);
          alert('设置失败');
        }
      });
    }

    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        try {
          // 进入编辑表单：关闭当前展示弹窗，使用统一样式弹窗
          close();

          const editExisting = document.getElementById('yd-mask-edit-modal');
          if (editExisting) editExisting.remove();

          const defaultIdNow = Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '';
          const isCurrentlyDefault = !!(defaultIdNow && mask.id === defaultIdNow);

          const modal = document.createElement('div');
          modal.id = 'yd-mask-edit-modal';
          modal.className = 'yd-forum-picker';
          modal.innerHTML = `
            <div class="yd-forum-picker__mask" data-close="1"></div>
            <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
              <div class="yd-forum-picker__bar">
                <div class="yd-forum-picker__title">编辑面具</div>
                <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
              </div>

              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <div id="yd-mask-edit-avatar-holder" style="width:44px;height:44px;border-radius:999px;overflow:hidden;background:#f3f4f6;display:flex;align-items:center;justify-content:center;flex:0 0 auto;">
                  ${avatar ? `<img id="yd-mask-edit-avatar-img" src="${this.escapeHtml(avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : '<span id="yd-mask-edit-avatar-placeholder" style="font-size:22px;">🎭</span>'}
                </div>
                <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                  <button type="button" class="yd-album-btn" id="yd-mask-edit-avatar-upload">上传头像</button>
                  <input type="file" id="yd-mask-edit-avatar-file" accept="image/png,image/jpeg,image/webp" style="display:none" aria-hidden="true">
                </div>
              </div>

              <label class="yd-book-edit__row yd-toggle" style="margin:2px 0 12px;">
                <span class="yd-toggle__label">设为默认</span>
                <span class="yd-toggle__control">
                  <input type="checkbox" id="yd-mask-edit-default" class="yd-toggle__input" ${isCurrentlyDefault ? 'checked' : ''}>
                  <span class="yd-toggle__slider"></span>
                </span>
              </label>

              <input class="yd-forum-compose__input" id="yd-mask-edit-name" value="${this.escapeHtml(name)}" placeholder="面具名称（对我的称呼）" maxlength="48" />
              <textarea class="yd-forum-compose__textarea" id="yd-mask-edit-detail" maxlength="${MASK_DETAIL_MAX_LEN}">${this.escapeHtml(detail)}</textarea>

              <div class="yd-forum-picker__footer" style="justify-content:flex-start; margin-top:6px; margin-bottom:12px;">
                <div id="yd-mask-edit-count" style="font-size:12px;color:#6b7280;">
                  当前面具：${(detail || '').length}字
                </div>
              </div>

              <div class="yd-forum-picker__footer">
                <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-mask-edit-save">保存</button>
              </div>
            </div>
          `;

          document.body.appendChild(modal);

          const closeEdit = () => modal.remove();
          modal.addEventListener('click', (e) => {
            const t = e.target;
            if (t && t.getAttribute && t.getAttribute('data-close') === '1') closeEdit();
          });

          const nameEl = modal.querySelector('#yd-mask-edit-name');
          const detailEl = modal.querySelector('#yd-mask-edit-detail');
          const saveBtn = modal.querySelector('#yd-mask-edit-save');
          const countEl = modal.querySelector('#yd-mask-edit-count');
          const defaultEl = modal.querySelector('#yd-mask-edit-default');

          const avatarHolderEl = modal.querySelector('#yd-mask-edit-avatar-holder');
          const avatarUploadBtn = modal.querySelector('#yd-mask-edit-avatar-upload');
          const avatarFileEl = modal.querySelector('#yd-mask-edit-avatar-file');

          let avatarData = avatar || '';

          setTimeout(() => nameEl && nameEl.focus(), 0);

          const updateCount = () => {
            if (!detailEl || !countEl) return;
            countEl.textContent = `当前面具：${(detailEl.value || '').length}字`;
          };
          if (detailEl) {
            detailEl.addEventListener('input', updateCount);
            updateCount();
          }

          if (avatarUploadBtn && avatarFileEl) {
            avatarUploadBtn.addEventListener('click', () => avatarFileEl.click());
            avatarFileEl.addEventListener('change', async (e) => {
              const file = e.target.files && e.target.files[0];
              if (!file) return;
              if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
                alert('只支持PNG、JPG、WebP格式');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                avatarData = reader.result;
                if (avatarHolderEl) {
                  avatarHolderEl.innerHTML = `<img id="yd-mask-edit-avatar-img" src="${this.escapeHtml(avatarData)}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
                }
              };
              reader.readAsDataURL(file);
              avatarFileEl.value = '';
            });
          }

          if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
              const nameNext = String(nameEl && nameEl.value || '').trim();
              const detailNext = String(detailEl && detailEl.value || '').trim();
              const willSetDefault = !!(defaultEl && defaultEl.checked);

              if (!nameNext) {
                alert('面具名称不能为空');
                nameEl && nameEl.focus();
                return;
              }
              if (detailNext.length > MASK_DETAIL_MAX_LEN) {
                alert(`内容过长（${detailNext.length} 字），请控制在 ${MASK_DETAIL_MAX_LEN} 字以内。`);
                detailEl && detailEl.focus();
                return;
              }

              mask.name = nameNext;
              mask.detail = detailNext;
              mask.avatar = avatarData || '';

              try {
                const currentDefault = Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID) || '';
                if (willSetDefault) {
                  Storage.set(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID, mask.id);
                } else if (currentDefault === mask.id) {
                  Storage.set(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID, '');
                }
              } catch (e) {
                console.error('设置默认面具失败:', e);
              }

              await Storage.dbPut('masks', mask);
              await this.loadMasks();
              if (Settings && Settings.showToast) {
                Settings.showToast(willSetDefault ? '面具已更新，并已设为默认' : '面具已更新');
              }

              closeEdit();
            });
          }
        } catch (e) {
          console.error('编辑面具失败:', e);
          alert('编辑失败');
        }
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('确定要删除这个面具吗？删除后无法恢复。')) return;
        try {
          await Storage.dbDelete('masks', mask.id);
          await this.loadMasks();
          close();
        } catch (e) {
          console.error('删除面具失败:', e);
          alert('删除失败');
        }
      });
    }

    document.body.appendChild(modal);
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};


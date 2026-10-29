// 角色管理
const Character = {
  currentEditingId: null,
  currentEditingData: null, // 保存完整的导入数据
  currentRawData: null, // 保存导入/编辑时的原始对象（含 data 包裹）
  formDirty: false,
  _voicePickerCache: null,
  
  // 初始化
  init() {
    this.setupEvents();
    this.setupEditFieldCollapses();
    this.setupFormDirtyListeners();
    this.setupChatI18nFormListeners();
    this.loadCharacters();
  },

  markDirty() {
    this.formDirty = true;
  },

  setupFormDirtyListeners() {
    const ids = ['char-name', 'char-description'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.markDirty());
        el.addEventListener('change', () => this.markDirty());
      }
    });
  },

  async handleEditBack() {
    const backTo = () => {
      const target = State.characterEditReturnPage || 'page-character';
      const sid = State.characterEditReturnSessionId ? String(State.characterEditReturnSessionId) : '';
      State.characterEditReturnPage = null;
      State.characterEditReturnSessionId = null;
      if (target === 'page-chat') {
        State.switchPage('page-chat');
        try {
          if (sid && typeof Chat !== 'undefined' && Chat && typeof Chat.openSession === 'function') {
            // 角色头像/名称可能变化：回到同一会话时强制全量重绘，避免增量渲染保留旧头像 DOM
            try { Chat._forceFullRenderNext = true; } catch (e) {}
            Chat.openSession(sid);
          }
        } catch (e) {}
        return;
      }
      State.switchPage(target);
    };

    if (this.formDirty && confirm('数据已更新，是否要保存？')) {
      await this.saveCharacter();
      await this.loadCharacters();
      backTo();
    } else {
      this.resetEditForm();
      backTo();
    }
  },

  setupEditFieldCollapses() {
    const root = document.getElementById('page-character-edit');
    if (root) this.bindCollapseEvents(root);

    const nameEl = document.getElementById('char-name');
    const namePreview = document.getElementById('char-name-preview');
    const desc = document.getElementById('char-description');
    const descPreview = document.getElementById('char-description-preview');

    const updateDescPreview = (text) => {
      const t = String(text || '').trim().replace(/\s+/g, ' ');
      if (!t) return '未填写';
      return t.length > 50 ? t.slice(0, 50) + '…' : t;
    };

    const refresh = () => {
      if (namePreview) {
        const nameVal = String(nameEl?.value || '').trim();
        namePreview.textContent = nameVal || '未填写';
        namePreview.classList.toggle('yd-collapse-item__meta--filled', !!nameVal);
      }
      if (descPreview) descPreview.textContent = updateDescPreview(desc?.value);
    };

    if (nameEl) nameEl.addEventListener('input', refresh);
    if (nameEl) nameEl.addEventListener('change', refresh);
    if (desc) desc.addEventListener('input', refresh);

    // 初始刷新一次
    refresh();
  },
  
  // 设置事件
  setupEvents() {
    // 列表页：返回主屏
    document.getElementById('character-back').addEventListener('click', () => {
      State.backToHome();
    });
    
    // 列表页：添加角色按钮 - 显示创建方式选择菜单
    document.getElementById('character-add').addEventListener('click', () => {
      this.showCreateMenu();
    });

    // 编辑页：返回角色列表（有未保存修改时提示）
    document.getElementById('character-edit-back').addEventListener('click', () => {
      this.handleEditBack();
    });

    // 编辑页：保存按钮（顶部右侧）
    document.getElementById('character-save').addEventListener('click', async () => {
      await this.saveCharacter();
      await this.loadCharacters();
      // 保存后也按“入口来源”返回（例如从聊天头像进入角色详情）
      const target = State.characterEditReturnPage || 'page-character';
      const sid = State.characterEditReturnSessionId ? String(State.characterEditReturnSessionId) : '';
      State.characterEditReturnPage = null;
      State.characterEditReturnSessionId = null;
      if (target === 'page-chat') {
        State.switchPage('page-chat');
        try {
          if (sid && typeof Chat !== 'undefined' && Chat && typeof Chat.openSession === 'function') {
            // 角色头像/名称可能变化：回到同一会话时强制全量重绘，避免增量渲染保留旧头像 DOM
            try { Chat._forceFullRenderNext = true; } catch (e) {}
            Chat.openSession(sid);
          }
        } catch (e) {}
        return;
      }
      State.switchPage(target);
    });

    // 编辑页：头像点击（只绑定一次，始终读当前 currentRawData，避免切换角色/新建后闭包仍是旧数据）
    const avatarThumb = document.getElementById('char-avatar-thumb');
    if (avatarThumb && !this._avatarThumbClickBound) {
      this._avatarThumbClickBound = true;
      avatarThumb.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const norm = this.normalizeCard(this.currentRawData);
        const src = String(norm.avatar || '').trim();
        const title = String(norm.name || '').trim() || '头像预览';
        this.openImageViewer(src, title, {
          onChange: (nextAvatar) => {
            this._applyCurrentAvatar(nextAvatar);
            this.markDirty();
          }
        });
      });
    }
    
    // 列表页：文件导入
    document.getElementById('character-import-file').addEventListener('change', (e) => {
      this.importCharacterCard(e.target.files[0]);
    });

    // 编辑页：角色语音选择
    document.getElementById('char-role-voice-pick')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.openRoleVoicePicker();
    });
  },
  
  // 显示创建菜单
  showCreateMenu() {
    // 创建菜单HTML
    const menuHtml = `
      <div class="yd-character-menu-overlay" id="character-menu-overlay"></div>
      <div class="yd-character-menu" id="character-menu">
        <div class="yd-character-menu__title">创建角色</div>
        <div class="yd-character-menu__options">
          <button class="yd-btn yd-character-menu__option" id="char-menu-import">
            📥 导入角色卡（PNG/JSON）
          </button>
          <button class="yd-btn yd-character-menu__option" id="char-menu-create">
            ✏️ 手动创建角色
          </button>
          <button class="yd-btn yd-btn--secondary yd-character-menu__option" id="char-menu-cancel">
            取消
          </button>
        </div>
      </div>
    `;
    
    // 添加到body
    const container = document.createElement('div');
    container.innerHTML = menuHtml;
    document.body.appendChild(container.firstElementChild);
    document.body.appendChild(container.lastElementChild);
    
    // 显示菜单
    setTimeout(() => {
      document.getElementById('character-menu-overlay').classList.add('yd-character-menu-overlay--active');
      document.getElementById('character-menu').classList.add('yd-character-menu--active');
    }, 10);
    
    // 绑定事件（在列表页）
    document.getElementById('char-menu-import').addEventListener('click', () => {
      this.hideCreateMenu();
      this.openCharacterImportDisclaimer();
    });
    
    document.getElementById('char-menu-create').addEventListener('click', () => {
      this.hideCreateMenu();
      // 手动新建：清空当前数据，跳到编辑页
      this.currentEditingId = null;
      this.currentEditingData = null;
      this.currentRawData = null;
      this.resetEditForm();
      this.showCreateForm(null);
      document.getElementById('character-edit-title').textContent = '创建角色';
      State.switchPage('page-character-edit');
    });
    
    document.getElementById('char-menu-cancel').addEventListener('click', () => {
      this.hideCreateMenu();
    });
    
    document.getElementById('character-menu-overlay').addEventListener('click', () => {
      this.hideCreateMenu();
    });
  },
  
  /**
   * 导入前说明：不可用原生 confirm（会消耗用户手势，导致随后 fileInput.click() 被浏览器忽略）。
   * 用户在「继续选择文件」上的点击会直接触发选择文件，才算合法手势。
   */
  openCharacterImportDisclaimer() {
    const old = document.getElementById('yd-char-import-disclaimer');
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.id = 'yd-char-import-disclaimer';
    wrap.className = 'yd-char-import-disclaimer';
    wrap.innerHTML = `
      <div class="yd-char-import-disclaimer__backdrop" data-close="1" aria-hidden="true"></div>
      <div class="yd-char-import-disclaimer__panel" role="dialog" aria-modal="true" aria-labelledby="yd-char-import-disclaimer-title">
        <div class="yd-char-import-disclaimer__title" id="yd-char-import-disclaimer-title">导入前说明</div>
        <div class="yd-char-import-disclaimer__body">
          <p>不兼容酒馆卡，请勿导入、使用酒馆卡。</p>
          <p>尊重版权，请勿使用未授权的角色卡。</p>
        </div>
        <div class="yd-char-import-disclaimer__actions">
          <button type="button" class="yd-btn yd-btn--secondary" id="yd-char-import-disclaimer-cancel">取消</button>
          <button type="button" class="yd-btn yd-char-import-disclaimer__ok" id="yd-char-import-disclaimer-ok">我已知晓</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const close = () => {
      wrap.remove();
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onKey);
        close();
      }
    };
    window.addEventListener('keydown', onKey);

    wrap.querySelector('[data-close="1"]')?.addEventListener('click', () => {
      window.removeEventListener('keydown', onKey);
      close();
    });
    wrap.querySelector('#yd-char-import-disclaimer-cancel')?.addEventListener('click', () => {
      window.removeEventListener('keydown', onKey);
      close();
    });
    wrap.querySelector('#yd-char-import-disclaimer-ok')?.addEventListener('click', () => {
      window.removeEventListener('keydown', onKey);
      const inp = document.getElementById('character-import-file');
      if (inp) inp.click();
      close();
    });

    const panel = wrap.querySelector('.yd-char-import-disclaimer__panel');
    if (panel) panel.addEventListener('click', (e) => e.stopPropagation());
  },

  // 隐藏创建菜单
  hideCreateMenu() {
    const overlay = document.getElementById('character-menu-overlay');
    const menu = document.getElementById('character-menu');
    
    if (overlay) {
      overlay.classList.remove('yd-character-menu-overlay--active');
      menu.classList.remove('yd-character-menu--active');
      
      setTimeout(() => {
        overlay.remove();
        menu.remove();
      }, 300);
    }
  },
  
  // 导入角色卡
  async importCharacterCard(file) {
    if (!file) return;
    
    try {
      let charaData = null;
      
      // 判断文件类型
      if (file.type === 'application/json') {
        // JSON文件直接读取
        const text = await file.text();
        charaData = JSON.parse(text);
        console.log('JSON导入成功:', charaData);
      } else if (file.type === 'image/png') {
        // PNG文件解析
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        console.log('PNG文件大小:', uint8Array.length);
        
        // PNG文件格式：8字节签名 + chunks
        let offset = 8; // 跳过PNG签名
        
        while (offset < uint8Array.length) {
          // 读取chunk长度（大端序）
          const length = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) | 
                        (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
          offset += 4;
          
          // 读取chunk类型
          const type = String.fromCharCode(uint8Array[offset], uint8Array[offset + 1], 
                                          uint8Array[offset + 2], uint8Array[offset + 3]);
          offset += 4;
          
          console.log('Chunk类型:', type, '长度:', length);
          
          // 如果是tEXt chunk
          if (type === 'tEXt') {
            // 读取数据
            const data = uint8Array.slice(offset, offset + length);
            
            // 查找null分隔符
            let nullIndex = -1;
            for (let i = 0; i < data.length; i++) {
              if (data[i] === 0) {
                nullIndex = i;
                break;
              }
            }
            
            if (nullIndex !== -1) {
              // 读取关键字
              const keyword = new TextDecoder('latin1').decode(data.slice(0, nullIndex));
              console.log('tEXt关键字:', keyword);
              
              // 如果是chara关键字
              if (keyword === 'chara') {
                // 读取base64数据（跳过null分隔符）
                const base64Data = new TextDecoder('latin1').decode(data.slice(nullIndex + 1));
                console.log('Base64数据长度:', base64Data.length);
                console.log('Base64前100字符:', base64Data.substring(0, 100));
                
                try {
                  // 解码base64 - 使用Uint8Array来正确处理UTF-8
                  const binaryString = atob(base64Data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  
                  // 使用UTF-8解码
                  const jsonStr = new TextDecoder('utf-8').decode(bytes);
                  console.log('解码后JSON长度:', jsonStr.length);
                  console.log('解码后JSON前200字符:', jsonStr.substring(0, 200));
                  
                  charaData = JSON.parse(jsonStr);
                  console.log('PNG导入成功:', charaData);
                  break;
                } catch (e) {
                  console.error('解析角色数据失败:', e);
                }
              }
            }
          }
          
          // 跳到下一个chunk
          offset += length + 4; // 数据 + CRC
        }
      } else {
        alert('不支持的文件格式，请选择PNG或JSON文件');
        return;
      }

      // 如果是 PNG 角色卡，将图片本身也转为 dataURL 一并挂到数据上，方便后续存入 IndexedDB
      if (file.type === 'image/png') {
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          if (charaData && typeof charaData === 'object') {
            if (!charaData.data || typeof charaData.data !== 'object') {
              charaData.data = {};
            }
            // 统一使用 data.avatar 字段保存头像
            charaData.data.avatar = dataUrl;
          }
        } catch (e) {
          console.error('读取 PNG 图片失败（仅影响头像显示）:', e);
        }
      }
      
      if (!charaData) {
        alert('未找到角色数据，请确保这是有效的角色卡文件');
        return;
      }
      
      console.log('最终角色数据:', charaData);
      
      // 显示表单并填充数据，跳转到编辑页
      State.switchPage('page-character-edit');
      this.showCreateForm(charaData);
      document.getElementById('character-edit-title').textContent = '导入角色';
      
    } catch (error) {
      console.error('导入失败:', error);
      alert('导入失败，请检查文件格式');
    }
  },
  
  /** 新建角色时的空卡结构，避免 currentRawData 为 null 导致预览/头像状态错乱 */
  _emptyCharacterDraft() {
    return {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {}
    };
  },

  // 显示创建/编辑表单
  showCreateForm(data = null) {
    this.formDirty = false;
    this.currentEditingId = data?.id || null;
    this.currentEditingData = data ?? null;
    // 手动新建：必须用空草稿；编辑/导入：挂接当前数据对象
    this.currentRawData = data ? data : this._emptyCharacterDraft();
    
    console.log('表单填充数据:', data);
    
    // 设置标题
    document.getElementById('character-edit-title').textContent = 
      this.currentEditingId ? '编辑角色' : '创建角色';
    
    const normalized = this.normalizeCard(data);

    const name = normalized.name || '';
    const description = normalized.description || '';

    const nameInput = document.getElementById('char-name');
    if (nameInput) nameInput.value = name;

    const descInput = document.getElementById('char-description');
    if (descInput) descInput.value = description;

    const namePreview = document.getElementById('char-name-preview');
    if (namePreview) {
      const nameVal = String(name || '').trim();
      namePreview.textContent = nameVal || '未填写';
      namePreview.classList.toggle('yd-collapse-item__meta--filled', !!nameVal);
    }

    const descPreview = document.getElementById('char-description-preview');
    const normalizeText = (t) => String(t || '').trim().replace(/\s+/g, ' ');
    const clip = (t) => (!t ? '未填写' : (t.length > 50 ? t.slice(0, 50) + '…' : t));
    if (descPreview) descPreview.textContent = clip(normalizeText(description));

    this.renderAvatarPreview(normalized);

    this.renderImportSummary(normalized);
    this.renderJsonPreview(normalized);
    this.renderRoleVoicePreview(normalized);
    this._applyChatI18nToForm(normalized);
    this.setupChatI18nFormListeners();
  },

  renderAvatarPreview(normalized) {
    const thumb = document.getElementById('char-avatar-thumb');
    const img = document.getElementById('char-avatar-img');
    const placeholder = document.getElementById('char-avatar-placeholder');
    if (!thumb || !img || !placeholder) return;

    const src = normalized?.avatar || '';
    if (src) {
      img.src = src;
      img.style.display = 'block';
      placeholder.style.display = 'none';
      thumb.setAttribute('aria-label', '点击放大预览头像');
    } else {
      try {
        img.onload = null;
      } catch (e) {}
      img.removeAttribute('src');
      img.src = '';
      img.style.display = 'none';
      placeholder.style.display = 'flex';
      thumb.setAttribute('aria-label', '点击设置头像');
    }
  },

  _applyCurrentAvatar(dataUrl) {
    const next = String(dataUrl || '').trim();
    if (!this.currentRawData || typeof this.currentRawData !== 'object') {
      this.currentRawData = this._emptyCharacterDraft();
    }
    if (!this.currentRawData.data || typeof this.currentRawData.data !== 'object') {
      this.currentRawData.data = {};
    }
    this.currentRawData.data.avatar = next || null;
    this.currentRawData.avatar = next || null;
    const norm = this.normalizeCard(this.currentRawData);
    this.renderAvatarPreview(norm);
  },

  /**
   * 角色头像变更后，同步刷新绑定该角色的单聊会话头像。
   * 仅覆盖“未设置会话头像”或“仍等于旧角色头像”的会话，避免误伤用户手动改过的会话头像。
   */
  async _syncSingleSessionAvatarFromCharacter(characterId, oldAvatar, newAvatar) {
    const cid = String(characterId || '').trim();
    if (!cid) return;
    const before = String(oldAvatar || '').trim();
    const after = String(newAvatar || '').trim();
    if (before === after) return;

    let sessions = [];
    try {
      sessions = await Storage.dbGetAll('sessions');
    } catch (e) {
      return;
    }
    if (!Array.isArray(sessions) || !sessions.length) return;

    let hitCount = 0;
    let writeCount = 0;
    for (const s of sessions) {
      if (!s || typeof s !== 'object' || !s.id) continue;
      const participantIds = Array.isArray(s.participantCharacterIds)
        ? s.participantCharacterIds.filter(Boolean).map((x) => String(x).trim())
        : [];
      const legacyCharacterId = String(s.characterId || '').trim();
      const isSingleByParticipants = participantIds.length === 1 && participantIds[0] === cid;
      const isSingleByLegacy = !participantIds.length && legacyCharacterId === cid;
      // 仅处理单聊会话（群聊头像通常是会话级概念，不应自动覆盖）
      if (!isSingleByParticipants && !isSingleByLegacy) continue;
      hitCount += 1;
      s.avatar = after || '';
      s.updatedAt = Date.now();
      try {
        await Storage.dbPut('sessions', s);
        writeCount += 1;
      } catch (e) {}
    }
    try {
      console.info('[character] sync session avatar from character', {
        characterId: cid,
        matchedSessions: hitCount,
        updatedSessions: writeCount
      });
    } catch (e) {}
  },

  openImageViewer(src, title = '图片预览', options = {}) {
    const existing = document.getElementById('yd-image-viewer');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-image-viewer';
    overlay.className = 'yd-image-viewer';
    const hasSrc = !!String(src || '').trim();
    const hideImage = options?.hideImage === true;
    const hasOnChange = !!(options && typeof options.onChange === 'function');
    const showChange = options?.showChange === true ? true : (options?.showChange === false ? false : hasOnChange);
    const changeText = String(options?.changeText || '更换头像').trim() || '更换头像';
    const reselectText = String(options?.reselectText || '重新选择').trim() || '重新选择';
    const variant = String(options?.variant || '').trim();
    const descText = String(options?.description || '').trim();

    /* 朋友圈配图：进入时只决定主区先看图还是先看配文方板；其余 DOM / 按钮 / 回调同一套 */
    if (variant === 'moments') {
      overlay.className = 'yd-image-viewer yd-image-viewer--moments yd-image-viewer--moments-fs';
      const descEsc = this.escapeHtml(descText);
      const defaultDescHint =
        '暂无配图说明。可点「编辑图片」→「编辑图片描述」在弹窗里撰写，或点第三个按钮进入生图编辑生成画面。';
      const defaultNoImageHint =
        '暂无配图。可点第三个按钮进入「生图编辑」生成画面，或在「编辑图片」里从相册更换配图。';
      const descContentEsc = descText.length ? descEsc : this.escapeHtml(defaultDescHint);
      const noImagePlateEsc = this.escapeHtml(defaultNoImageHint);
      const showImage = hasSrc && !hideImage;
      let mainShowsDesc = !showImage;
      let liveDesc = descText;
      const allowAlbumReplace = !!showChange;

      const makeSquarePlateHtml = (bodyEsc) => `<div class="yd-image-viewer__fs-canvas">
              <div class="yd-image-viewer__fs-canvas-bg" aria-hidden="true"></div>
              <div class="yd-image-viewer__fs-canvas-content">
                <div class="yd-image-viewer__fs-canvas-scroll">${bodyEsc}</div>
              </div>
            </div>`;
      const squareDescHtml = makeSquarePlateHtml(descContentEsc);

      /* 主区切换：看图时显示「信息」图标；看配文方板时显示「图片」图标（标准 24×24） */
      const iconInfo = `<svg class="yd-image-viewer__fs-ico-svg yd-image-viewer__fs-ico-svg--info-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="6.2" r="2.75" fill="currentColor"/><rect x="9" y="10.25" width="6" height="12.75" rx="3" fill="currentColor"/></svg>`;
      const iconPhoto = `<svg class="yd-image-viewer__fs-ico-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM5 19l3.5-4.5 2.5 3.01L14.5 12l6.5 8.5H5zm13.5-9.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5S15.67 8 16.5 8s1.5.67 1.5 1.5z"/></svg>`;
      const toggleToolIconHtml = mainShowsDesc ? iconPhoto : iconInfo;
      const toggleToolLabel = mainShowsDesc ? '查看配图' : '查看配图说明';

      const iconEdit = `<svg class="yd-image-viewer__fs-ico-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>`;
      const iconAi = `<svg class="yd-image-viewer__fs-ico-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l1.3 4h4.4l-3.5 2.6 1.3 4L12 10.8 8.5 12.6l1.3-4L6.3 6h4.4L12 2zM6 16.5l.9 2.7 2.8 1-2.8 1-.9 2.7-.9-2.7-2.8-1 2.8-1 .9-2.7zm11 2l.7 2.1 2.2.8-2.2.8-.7 2.1-.7-2.1-2.2-.8 2.2-.8.7-2.1z"/></svg>`;

      const imageStageInner = showImage
        ? '<img class="yd-image-viewer__fs-img" alt="" draggable="false" />'
        : `<div class="yd-image-viewer__fs-desc-wrap yd-image-viewer__fs-desc-wrap--image-placeholder">${makeSquarePlateHtml(noImagePlateEsc)}</div>`;
      const mainHtml = `
        <div class="yd-image-viewer__fs-stack">
          <div class="yd-image-viewer__fs-layer-image"${mainShowsDesc ? ' hidden' : ''}>
            <div class="yd-image-viewer__fs-zoomwrap">
              <div class="yd-image-viewer__fs-stage">${imageStageInner}</div>
            </div>
          </div>
          <div class="yd-image-viewer__fs-layer-desc"${mainShowsDesc ? '' : ' hidden'}>
            <div class="yd-image-viewer__fs-desc-wrap">${squareDescHtml}</div>
          </div>
        </div>`;

      const tertiaryIcon = iconAi;
      const tertiaryLabel = '生图编辑';

      overlay.innerHTML = `
        <div class="yd-image-viewer__backdrop" data-close="1"></div>
        <div class="yd-image-viewer__fs" role="dialog" aria-modal="true" aria-label="图片预览">
          <div class="yd-image-viewer__fs-main">
            ${mainHtml}
          </div>
          <div class="yd-image-viewer__fs-toolbar" role="toolbar" aria-label="操作">
            <button type="button" class="yd-image-viewer__fs-ico${mainShowsDesc ? ' is-active' : ''}" id="yd-iv-tool-toggle-view" aria-label="${this.escapeHtml(toggleToolLabel)}" aria-pressed="${mainShowsDesc ? 'true' : 'false'}">${toggleToolIconHtml}</button>
            <button type="button" class="yd-image-viewer__fs-ico" id="yd-iv-tool-edit" aria-label="编辑图片">${iconEdit}</button>
            <button type="button" class="yd-image-viewer__fs-ico" id="yd-iv-tool-more" aria-label="${this.escapeHtml(tertiaryLabel)}">${tertiaryIcon}</button>
          </div>
        </div>
        <div id="yd-iv-moments-edit-modal" class="yd-modal yd-moments-img-edit-modal" hidden>
          <div class="yd-modal-content yd-moments-img-edit-modal__box">
            <div class="yd-modal-header yd-moments-img-edit-modal__head">
              <span class="yd-moments-img-edit-modal__title">编辑图片</span>
              <button type="button" class="yd-btn-close" id="yd-iv-moments-edit-modal-x" aria-label="关闭">×</button>
            </div>
            <div class="yd-moments-img-edit-modal__list">
              <button type="button" class="yd-moments-img-edit-modal__opt" id="yd-iv-edit-option-desc">编辑图片描述</button>
              <button type="button" class="yd-moments-img-edit-modal__opt" id="yd-iv-edit-option-file">更换图片</button>
            </div>
          </div>
        </div>
        <div id="yd-iv-moments-desc-edit-modal" class="yd-modal yd-moments-desc-edit-modal" hidden>
          <div class="yd-modal-content yd-moments-desc-edit-modal__box">
            <div class="yd-modal-header yd-moments-desc-edit-modal__head">
              <span class="yd-moments-desc-edit-modal__title">编辑图片描述</span>
              <button type="button" class="yd-btn-close" id="yd-iv-moments-desc-edit-modal-x" aria-label="关闭">×</button>
            </div>
            <textarea id="yd-iv-moments-desc-ta" class="yd-moments-desc-edit-modal__ta" rows="8" maxlength="4000" placeholder="填写本张配图的说明文字…"></textarea>
            <div class="yd-moments-desc-edit-modal__actions">
              <button type="button" class="yd-moments-desc-edit-modal__btn yd-moments-desc-edit-modal__btn--ghost" id="yd-iv-moments-desc-cancel">取消</button>
              <button type="button" class="yd-moments-desc-edit-modal__btn yd-moments-desc-edit-modal__btn--primary" id="yd-iv-moments-desc-save">保存</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const normalizeThumbRect = (r) => {
        if (!r || typeof r !== 'object') return null;
        const left = Number(r.left);
        const top = Number(r.top);
        const width = Number(r.width);
        const height = Number(r.height);
        if (![left, top, width, height].every((n) => Number.isFinite(n))) return null;
        if (width < 1 || height < 1) return null;
        return { left, top, width, height };
      };
      const thumbRect = normalizeThumbRect(options.originRect);
      const MOMENTS_IV_MS = 200;
      /** 线性匀速放大，避免 ease-out「弹开」与非均匀 scale 造成的挤压感 */
      const MOMENTS_IV_EASE = 'linear';

      const momentsIvFlipUniform = (lastRect, firstRect) => {
        const sx = firstRect.width / lastRect.width;
        const sy = firstRect.height / lastRect.height;
        const sStart = Math.min(sx, sy);
        const cxLast = lastRect.left + lastRect.width / 2;
        const cyLast = lastRect.top + lastRect.height / 2;
        const cxFirst = firstRect.left + firstRect.width / 2;
        const cyFirst = firstRect.top + firstRect.height / 2;
        return {
          dx: cxFirst - cxLast,
          dy: cyFirst - cyLast,
          sStart
        };
      };

      /** 前景层可点；黑幕单独用 WAAPI 线性淡入（避免前景铺满 #000 盖住 backdrop、CSS transition 被跳过） */
      const revealMomentsFsChrome = () => {
        try {
          overlay.classList.add('yd-image-viewer--moments-fs--dim');
          overlay.classList.add('yd-image-viewer--moments-fs--show');
          const bd = overlay.querySelector('.yd-image-viewer__backdrop');
          if (!bd) return;
          try {
            bd.getAnimations?.().forEach((a) => a.cancel());
          } catch (e2) {}
          bd.style.opacity = '0';
          void bd.offsetWidth;
          if (typeof bd.animate === 'function') {
            bd.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: MOMENTS_IV_MS,
              easing: 'linear',
              fill: 'forwards'
            });
          } else {
            bd.style.transition = `opacity ${MOMENTS_IV_MS}ms linear`;
            requestAnimationFrame(() => {
              bd.style.opacity = '1';
            });
          }
        } catch (e) {}
      };

      let pinch = null;
      const vp = overlay.querySelector('.yd-image-viewer__fs-zoomwrap');
      const st = overlay.querySelector('.yd-image-viewer__fs-stage');
      const fsImg = overlay.querySelector('.yd-image-viewer__fs-img');

      const bindPinch = () => {
        if (!showImage || !vp || !st || pinch) return;
        if (typeof MomentsImageStudio !== 'undefined' && MomentsImageStudio.bindPinchZoomViewport) {
          pinch = MomentsImageStudio.bindPinchZoomViewport(vp, st, {
            isActive: () => !!overlay.isConnected
          });
        }
      };
      const relaxPinchStage = () => {
        try {
          const stEl = overlay.querySelector('.yd-image-viewer__fs-stage');
          if (stEl) stEl.style.willChange = 'auto';
        } catch (e) {}
      };

      const runDescCanvasEnter = () => {
        if (!thumbRect) {
          revealMomentsFsChrome();
          return;
        }
        const canvas = overlay.querySelector('.yd-image-viewer__fs-layer-desc .yd-image-viewer__fs-canvas');
        if (!canvas) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!overlay.isConnected) return;
            revealMomentsFsChrome();
            const last = canvas.getBoundingClientRect();
            const first = thumbRect;
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              canvas.removeEventListener('transitionend', onEnd);
              canvas.style.transition = '';
              canvas.style.transform = '';
              canvas.style.transformOrigin = '';
            };
            const onEnd = (e) => {
              if (e.propertyName !== 'transform') return;
              finish();
            };
            if (!first || last.width < 1 || last.height < 1) {
              finish();
              return;
            }
            const { dx, dy, sStart } = momentsIvFlipUniform(last, first);
            canvas.style.transformOrigin = '50% 50%';
            canvas.style.transition = 'none';
            canvas.style.transform = `translate(${dx}px, ${dy}px) scale(${sStart})`;
            void canvas.offsetWidth;
            canvas.style.transition = `transform ${MOMENTS_IV_MS}ms ${MOMENTS_IV_EASE}`;
            requestAnimationFrame(() => {
              canvas.style.transform = 'translate(0, 0) scale(1)';
            });
            canvas.addEventListener('transitionend', onEnd);
            setTimeout(finish, MOMENTS_IV_MS + 80);
          });
        });
      };

      const runImageEnter = () => {
        if (!fsImg || !overlay.isConnected) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!overlay.isConnected || !fsImg) return;
            revealMomentsFsChrome();
            const last = fsImg.getBoundingClientRect();
            const first = thumbRect;
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              fsImg.removeEventListener('transitionend', onEnd);
              fsImg.style.transition = '';
              fsImg.style.transform = '';
              fsImg.style.transformOrigin = '';
              bindPinch();
              relaxPinchStage();
            };
            const onEnd = (e) => {
              if (e.propertyName !== 'transform') return;
              finish();
            };

            if (last.width < 1 || last.height < 1) {
              finish();
              return;
            }

            if (!first) {
              fsImg.style.transformOrigin = '50% 50%';
              fsImg.style.transition = 'none';
              fsImg.style.transform = 'scale(0.88)';
              void fsImg.offsetWidth;
              fsImg.style.transition = `transform ${MOMENTS_IV_MS}ms ${MOMENTS_IV_EASE}`;
              requestAnimationFrame(() => {
                fsImg.style.transform = 'scale(1)';
              });
              fsImg.addEventListener('transitionend', onEnd);
              setTimeout(finish, MOMENTS_IV_MS + 80);
              return;
            }

            const { dx, dy, sStart } = momentsIvFlipUniform(last, first);
            fsImg.style.transformOrigin = '50% 50%';
            fsImg.style.transition = 'none';
            fsImg.style.transform = `translate(${dx}px, ${dy}px) scale(${sStart})`;
            void fsImg.offsetWidth;
            fsImg.style.transition = `transform ${MOMENTS_IV_MS}ms ${MOMENTS_IV_EASE}`;
            requestAnimationFrame(() => {
              fsImg.style.transform = 'translate(0, 0) scale(1)';
            });
            fsImg.addEventListener('transitionend', onEnd);
            setTimeout(finish, MOMENTS_IV_MS + 80);
          });
        });
      };

      if (showImage && fsImg && hasSrc) {
        fsImg.src = src;
        const kick = () => {
          if (!overlay.isConnected) return;
          const go = () => runImageEnter();
          try {
            if (typeof fsImg.decode === 'function') {
              fsImg.decode().then(go, go);
            } else {
              go();
            }
          } catch (e) {
            go();
          }
        };
        if (fsImg.complete && fsImg.naturalWidth > 0) {
          kick();
        } else {
          fsImg.addEventListener('load', kick, { once: true });
          fsImg.addEventListener(
            'error',
            () => {
              revealMomentsFsChrome();
              bindPinch();
              relaxPinchStage();
            },
            { once: true }
          );
        }
      } else {
        runDescCanvasEnter();
      }

      let viewerClosed = false;
      const close = () => {
        if (viewerClosed) return;
        viewerClosed = true;
        try {
          pinch?.destroy?.();
        } catch (e) {}
        try {
          overlay.querySelector('.yd-image-viewer__backdrop')?.getAnimations?.().forEach((a) => a.cancel());
        } catch (e) {}
        try {
          overlay.querySelector('.yd-image-viewer__fs-img')?.getAnimations?.().forEach((a) => a.cancel());
        } catch (e) {}
        try {
          overlay.querySelectorAll?.('.yd-image-viewer__fs-layer-desc .yd-image-viewer__fs-canvas')?.forEach?.((el) => {
            el?.getAnimations?.().forEach?.((a) => a.cancel());
          });
        } catch (e) {}
        try {
          const stEl = overlay.querySelector('.yd-image-viewer__fs-stage');
          if (stEl) stEl.style.willChange = 'auto';
        } catch (e) {}
        window.removeEventListener('keydown', onKeyDown);
        const removeOverlay = () => {
          try {
            if (overlay.isConnected) overlay.remove();
          } catch (e) {}
          requestAnimationFrame(() => {
            try {
              const page = document.getElementById('page-moments');
              if (!page || !page.classList.contains('yd-page--active')) return;
              const sc = page.querySelector(':scope > .yd-page-content');
              if (!sc) return;
              const t = sc.scrollTop;
              sc.scrollTop = t ? t - 1 : 1;
              sc.scrollTop = t;
            } catch (e2) {}
          });
        };
        setTimeout(removeOverlay, 0);
      };
      const onKeyDown = (e) => {
        if (e.key !== 'Escape') return;
        const descM = overlay.querySelector('#yd-iv-moments-desc-edit-modal');
        if (descM && descM.classList.contains('yd-modal--active')) {
          descM.setAttribute('hidden', '');
          descM.classList.remove('yd-modal--active');
          return;
        }
        const editM = overlay.querySelector('#yd-iv-moments-edit-modal');
        if (editM && editM.classList.contains('yd-modal--active')) {
          editM.setAttribute('hidden', '');
          editM.classList.remove('yd-modal--active');
          return;
        }
        close();
      };
      window.addEventListener('keydown', onKeyDown);

      /* 主区（图片 / 配文 / 黑边）单击关闭；底部工具条为兄弟节点，点击不会命中此处 */
      overlay.querySelector('.yd-image-viewer__fs-main')?.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
      });
      overlay.addEventListener('click', (e) => {
        const target = e.target;
        if (target && target.getAttribute && target.getAttribute('data-close') === '1') close();
      });

      const toggleViewBtn = overlay.querySelector('#yd-iv-tool-toggle-view');
      const editModal = overlay.querySelector('#yd-iv-moments-edit-modal');
      const openEditModal = () => {
        if (!editModal) return;
        editModal.removeAttribute('hidden');
        editModal.classList.add('yd-modal--active');
      };
      const closeEditModal = () => {
        if (!editModal) return;
        editModal.setAttribute('hidden', '');
        editModal.classList.remove('yd-modal--active');
      };

      const descEditModal = overlay.querySelector('#yd-iv-moments-desc-edit-modal');
      const descTa = overlay.querySelector('#yd-iv-moments-desc-ta');
      const closeDescEditModal = () => {
        if (!descEditModal) return;
        descEditModal.setAttribute('hidden', '');
        descEditModal.classList.remove('yd-modal--active');
      };
      const openDescEditModal = () => {
        closeEditModal();
        if (descTa) descTa.value = liveDesc;
        if (!descEditModal) return;
        descEditModal.removeAttribute('hidden');
        descEditModal.classList.add('yd-modal--active');
      };
      const refreshDescPanels = () => {
        const bodyEsc = liveDesc.length ? this.escapeHtml(liveDesc) : this.escapeHtml(defaultDescHint);
        const scroll = overlay.querySelector('.yd-image-viewer__fs-layer-desc .yd-image-viewer__fs-canvas-scroll');
        if (scroll) scroll.innerHTML = bodyEsc;
      };

      const syncToggleViewBtn = () => {
        if (!toggleViewBtn) return;
        toggleViewBtn.innerHTML = mainShowsDesc ? iconPhoto : iconInfo;
        toggleViewBtn.setAttribute('aria-label', mainShowsDesc ? '查看配图' : '查看配图说明');
        toggleViewBtn.setAttribute('aria-pressed', mainShowsDesc ? 'true' : 'false');
        toggleViewBtn.classList.toggle('is-active', mainShowsDesc);
      };

      const applyMainView = () => {
        const layerImg = overlay.querySelector('.yd-image-viewer__fs-layer-image');
        const layerDesc = overlay.querySelector('.yd-image-viewer__fs-layer-desc');
        if (!layerImg || !layerDesc) return;
        if (mainShowsDesc) {
          try {
            pinch?.reset?.();
          } catch (e2) {}
          layerDesc.removeAttribute('hidden');
          layerImg.setAttribute('hidden', '');
        } else {
          layerImg.removeAttribute('hidden');
          layerDesc.setAttribute('hidden', '');
        }
        syncToggleViewBtn();
      };

      toggleViewBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        mainShowsDesc = !mainShowsDesc;
        applyMainView();
      });

      const editBtn = overlay.querySelector('#yd-iv-tool-edit');
      const moreBtn = overlay.querySelector('#yd-iv-tool-more');
      editBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal();
      });

      overlay.querySelector('#yd-iv-moments-edit-modal-x')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditModal();
      });
      editModal?.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
      });
      overlay.querySelector('#yd-iv-edit-option-desc')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openDescEditModal();
      });
      overlay.querySelector('#yd-iv-edit-option-file')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditModal();
        if (!allowAlbumReplace) {
          alert('当前不支持更换配图');
          return;
        }
        if (typeof options.onOpenAlbumPick !== 'function') {
          alert('相册未就绪，无法从相册选图');
          return;
        }
        close();
        options.onOpenAlbumPick();
      });

      overlay.querySelector('#yd-iv-moments-desc-edit-modal-x')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDescEditModal();
      });
      descEditModal?.addEventListener('click', (e) => {
        if (e.target === descEditModal) closeDescEditModal();
      });
      overlay.querySelector('#yd-iv-moments-desc-cancel')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDescEditModal();
      });
      overlay.querySelector('#yd-iv-moments-desc-save')?.addEventListener('click', (e) => {
        e.stopPropagation();
        void (async () => {
          const raw = String(descTa?.value ?? '').trim();
          try {
            if (typeof options.onSaveDescription === 'function') {
              await Promise.resolve(options.onSaveDescription(raw));
            }
            liveDesc = raw;
            refreshDescPanels();
            closeDescEditModal();
          } catch (err) {
            alert(err && err.message ? err.message : '保存失败');
          }
        })();
      });

      /* 第三钮：仅进入生图编辑页 */
      moreBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditModal();
        close();
        if (typeof options.onOpenStudio === 'function') options.onOpenStudio();
      });

      return;
    }

    if (variant) {
      overlay.classList.add(`yd-image-viewer--${variant}`);
    }
    const descExpandable =
      options?.descriptionExpandable === true && descText.length > 0 && showChange;
    const showDescInline = descText.length > 0 && !descExpandable;
    const detailToggleHtml = descExpandable
      ? `<span class="yd-image-viewer__detail-link" id="yd-image-viewer-detail-toggle" role="button" tabindex="0">详情</span>`
      : '';
    const detailBodyHtml = descExpandable
      ? `<div id="yd-image-viewer-detail-body" class="yd-image-viewer__desc yd-image-viewer__desc--toggle" hidden>${this.escapeHtml(descText)}</div>`
      : '';
    overlay.innerHTML = `
      <div class="yd-image-viewer__backdrop" data-close="1"></div>
      <div class="yd-image-viewer__panel" role="dialog" aria-modal="true">
        <button class="yd-image-viewer__close" type="button" aria-label="关闭">×</button>
        <div class="yd-image-viewer__title">${this.escapeHtml(title || '图片预览')}</div>
        ${hideImage ? '' : (hasSrc
          ? `<img class="yd-image-viewer__img" alt="${this.escapeHtml(title || '图片预览')}">`
          : `<div class="yd-image-viewer__img" style="display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px;">暂无头像</div>`
        )}
        ${showDescInline ? `<div class="yd-image-viewer__desc">${this.escapeHtml(descText)}</div>` : ''}
        ${showChange ? `
          <div class="yd-image-viewer__change-row">
            <div class="yd-image-viewer__change-row-side">${detailToggleHtml}</div>
            <div class="yd-image-viewer__change-row-center">
              <button type="button" class="yd-btn yd-btn--secondary" id="yd-image-viewer-change">${this.escapeHtml(changeText)}</button>
              <input type="file" id="yd-image-viewer-file" accept="image/png,image/jpeg,image/webp" style="display:none" aria-hidden="true">
            </div>
            <div class="yd-image-viewer__change-row-side" aria-hidden="true"></div>
          </div>
          ${detailBodyHtml}
        ` : ''}
      </div>
    `;
    document.body.appendChild(overlay);

    const img = overlay.querySelector('.yd-image-viewer__img');
    if (!hideImage && img && img.tagName === 'IMG') img.src = src;

    const close = () => {
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);

    const closeBtn = overlay.querySelector('.yd-image-viewer__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
      });
    }

    overlay.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute('data-close') === '1') {
        close();
      }
    });

    const panel = overlay.querySelector('.yd-image-viewer__panel');
    if (panel) {
      panel.addEventListener('click', (e) => e.stopPropagation());
    }

    // 更换头像：选择本地文件并回写到当前编辑对象
    const changeBtn = overlay.querySelector('#yd-image-viewer-change');
    const fileEl = overlay.querySelector('#yd-image-viewer-file');
    if (showChange && changeBtn && fileEl) {
      changeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileEl.click();
      });
      fileEl.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
          alert('只支持PNG、JPG、WebP格式');
          fileEl.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          try {
            if (img && img.tagName === 'IMG') {
              img.src = dataUrl;
            } else {
              // 原本是占位 div，替换为 img
              const holder = overlay.querySelector('.yd-image-viewer__img');
              if (holder) {
                holder.outerHTML = `<img class="yd-image-viewer__img" alt="${this.escapeHtml(title || '图片预览')}" src="${this.escapeHtml(dataUrl)}">`;
              }
            }
            // 上传/选择成功后，按钮应变为“重新选择”
            try {
              changeBtn.textContent = reselectText;
            } catch (e) {}
            if (options && typeof options.onChange === 'function') {
              options.onChange(dataUrl);
            }
          } catch (err) {
            console.error('更换头像失败:', err);
          } finally {
            fileEl.value = '';
          }
        };
        reader.readAsDataURL(file);
      });
    }

    const detailToggle = overlay.querySelector('#yd-image-viewer-detail-toggle');
    const detailBody = overlay.querySelector('#yd-image-viewer-detail-body');
    if (detailToggle && detailBody) {
      const labelDetail = '详情';
      const labelCollapse = '收起';
      const flip = (e) => {
        e.stopPropagation();
        const hidden = detailBody.hasAttribute('hidden');
        if (hidden) {
          detailBody.removeAttribute('hidden');
          detailToggle.textContent = labelCollapse;
        } else {
          detailBody.setAttribute('hidden', '');
          detailToggle.textContent = labelDetail;
        }
      };
      detailToggle.addEventListener('click', flip);
      detailToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          flip(e);
        }
      });
    }
  },

  renderImportSummary(data) {
    const summaryEl = document.getElementById('char-import-summary');
    if (!summaryEl) return;

    // 当前编辑页已不展示导入摘要，这里保持空实现以兼容旧调用
  },

  getCharacterBookCount(characterBook) {
    if (!characterBook) return 0;
    const entries = characterBook.entries;
    if (!entries) return 0;
    if (Array.isArray(entries)) return entries.length;
    if (typeof entries === 'object') return Object.keys(entries).length;
    return 0;
  },

  /** 确保 currentRawData.data.character_book.entries 为可改写的数组（与聊天侧 world book 结构一致） */
  _ensureMutableCharacterBook() {
    if (!this.currentRawData || typeof this.currentRawData !== 'object') {
      this.currentRawData = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {}
      };
    }
    if (!this.currentRawData.data || typeof this.currentRawData.data !== 'object') {
      this.currentRawData.data = {};
    }
    let book = this.currentRawData.data.character_book;
    if (!book || typeof book !== 'object') {
      const legacy = this.currentRawData.character_book;
      if (legacy && typeof legacy === 'object') {
        this.currentRawData.data.character_book = legacy;
        book = legacy;
      } else {
        book = { entries: [] };
        this.currentRawData.data.character_book = book;
      }
    }
    let ent = book.entries;
    if (ent == null) {
      book.entries = [];
      return book.entries;
    }
    if (Array.isArray(ent)) return ent;
    if (typeof ent === 'object') {
      const arr = Object.values(ent).filter((x) => x != null);
      book.entries = arr;
      return arr;
    }
    book.entries = [];
    return book.entries;
  },

  addCharacterBookEntry() {
    if (typeof Worldbook !== 'undefined' && Worldbook.openEntryModal) {
      Worldbook.openEntryModal({
        titleBar: '新增世界书条目',
        enabled: true,
        comment: '',
        keysText: '',
        content: '',
        showDelete: false,
        onSave: (payload) => {
          const entries = this._ensureMutableCharacterBook();
          const row = {
            enabled: !!payload.enabled,
            content: payload.content
          };
          const c = String(payload.comment || '').trim();
          if (c) row.comment = c;
          if (payload.keys && payload.keys.length) row.keys = payload.keys;
          entries.push(row);
          this.markDirty();
          this.renderJsonPreview(this.normalizeCard(this.currentRawData));
        }
      });
      return;
    }
    const entries = this._ensureMutableCharacterBook();
    entries.push({
      comment: '新条目',
      enabled: true,
      content: ''
    });
    this.markDirty();
    this.renderJsonPreview(this.normalizeCard(this.currentRawData));
  },

  // 统计 extensions 里“正则相关”的条目数（尽量泛化，不绑死字段名）
  getExtensionsRegexCount(extensions) {
    if (!extensions || typeof extensions !== 'object') return 0;

    let count = 0;
    const seen = new Set();

    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const v of node) walk(v);
        return;
      }
      if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          // 常见：regex / regex_scripts / scripts / rules / patterns 等命名
          if (typeof k === 'string' && /regex|pattern|rule|script/i.test(k)) {
            // 如果是数组或对象，尽量计数
            if (Array.isArray(v)) {
              for (const item of v) {
                const key = JSON.stringify(item);
                if (!seen.has(key)) {
                  seen.add(key);
                  count += 1;
                }
              }
            } else if (typeof v === 'object' && v) {
              const keys = Object.keys(v);
              if (keys.length) count += keys.length;
            } else if (typeof v === 'string' && v.trim()) {
              count += 1;
            }
          }
          walk(v);
        }
      }
    };

    walk(extensions);
    return count;
  },
  
  // 隐藏模态框
  resetEditForm() {
    this.formDirty = false;
    this.currentEditingId = null;
    this.currentEditingData = null;
    this.currentRawData = null;
    
    const nameEl = document.getElementById('char-name');
    if (nameEl) nameEl.value = '';
    const descEl = document.getElementById('char-description');
    if (descEl) descEl.value = '';

    const summaryEl = document.getElementById('char-import-summary');
    if (summaryEl) summaryEl.style.display = 'none';

    const bookPreview = document.getElementById('char-book-preview');
    const extPreview = document.getElementById('char-extensions-preview');
    if (bookPreview) bookPreview.innerHTML = '';
    if (extPreview) extPreview.innerHTML = '';

    const emptyNorm = this.normalizeCard(null);
    this.renderAvatarPreview(emptyNorm);
    this.renderRoleVoicePreview(emptyNorm);
    this._applyChatI18nToForm(emptyNorm);
    this._stopChatI18nTimeTicker();
    const np = document.getElementById('char-name-preview');
    if (np) {
      np.textContent = '未填写';
      np.classList.remove('yd-collapse-item__meta--filled');
    }
    const dp = document.getElementById('char-description-preview');
    if (dp) dp.textContent = '未填写';
  },

  // 将 v3 卡常见 data 包裹结构“拍平”为我们内部统一读取的结构
  normalizeCard(raw) {
    const base = (raw && typeof raw === 'object') ? raw : {};
    const inner = (base.data && typeof base.data === 'object') ? base.data : {};

    // name/description 等：优先 data 内，其次顶层
    const name = inner.name ?? base.name ?? '';
    const description = inner.description ?? base.description ?? '';
    const first_mes = inner.first_mes ?? base.first_mes ?? '';

    const avatarRaw = inner.avatar ?? base.avatar ?? null;
    const avatar = (() => {
      const v = String(avatarRaw ?? '').trim();
      if (!v) return null;
      const low = v.toLowerCase();
      if (low === 'none' || low === 'null' || low === 'undefined') return null;
      return v;
    })();
    const alternate_greetings = inner.alternate_greetings ?? base.alternate_greetings ?? [];
    const character_book = inner.character_book ?? base.character_book ?? null;
    const extensions = inner.extensions ?? base.extensions ?? null;
    const role_voice = inner.role_voice ?? base.role_voice ?? null;
    const chat_i18n_raw = inner.chat_i18n ?? base.chat_i18n ?? null;
    const chat_i18n = chat_i18n_raw && typeof chat_i18n_raw === 'object' ? chat_i18n_raw : null;

    return {
      id: base.id ?? inner.id ?? null,
      name,
      description,
      first_mes,
      avatar,
      role_voice,
      chat_i18n,
      alternate_greetings,
      character_book,
      extensions,
      // 保留原始对象引用（便于后续需要）
      __raw: base
    };
  },

  _chatI18nTimeTicker: null,

  LANG_DEFAULT_TIMEZONE: {
    zh: 'Asia/Shanghai',
    en: 'America/New_York',
    ja: 'Asia/Tokyo',
    ko: 'Asia/Seoul',
    yue: 'Asia/Hong_Kong',
    es: 'Europe/Madrid',
    fr: 'Europe/Paris',
    de: 'Europe/Berlin',
    ru: 'Europe/Moscow',
    pt: 'America/Sao_Paulo',
    it: 'Europe/Rome',
    ar: 'Asia/Dubai',
    vi: 'Asia/Ho_Chi_Minh',
    id: 'Asia/Jakarta',
    tr: 'Europe/Istanbul',
    nl: 'Europe/Amsterdam',
    uk: 'Europe/Kyiv'
  },

  CHAT_I18N_LANG_LABELS: {
    zh: '中文',
    en: '英语',
    ja: '日语',
    ko: '韩语',
    yue: '粤语',
    es: '西班牙语',
    fr: '法语',
    de: '德语',
    ru: '俄语',
    pt: '葡萄牙语',
    it: '意大利语',
    ar: '阿拉伯语',
    vi: '越南语',
    id: '印尼语',
    tr: '土耳其语',
    nl: '荷兰语',
    uk: '乌克兰语'
  },

  _isZhDefaultLanguage(langKey) {
    const k = String(langKey || 'zh').trim().toLowerCase();
    return !k || k === 'zh' || k === 'zh-cn' || k === 'chinese';
  },

  _getTimezoneSelectLabel(tzEl) {
    if (!tzEl) return '';
    const opt = tzEl.options[tzEl.selectedIndex];
    if (!opt) return '';
    return String(opt.getAttribute('data-label') || opt.textContent || '').trim();
  },

  _isChinaRegion(tzEl) {
    return this._getTimezoneSelectLabel(tzEl) === '中国';
  },

  _updateChatI18nRegionDependentUi(tzEl) {
    const isChina = this._isChinaRegion(tzEl);
    const live = document.getElementById('char-region-time-live');
    const biRow = document.getElementById('char-multilingual-row');
    if (live) {
      live.hidden = isChina;
      if (isChina) live.textContent = '';
    }
    if (biRow) biRow.hidden = isChina;
  },

  _formatWallClockInTimezone(timezone, date = new Date()) {
    const tz = String(timezone || '').trim();
    if (!tz) return '';
    try {
      const fmt = new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = fmt.formatToParts(date);
      const pick = (type) => String(parts.find((p) => p.type === type)?.value || '');
      return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
    } catch (e) {
      return '';
    }
  },

  _formatTimezoneOffsetDiffText(characterTz, date = new Date(), regionLabel = '') {
    const charTz = String(characterTz || '').trim();
    if (!charTz) return '';
    const region = String(regionLabel || '').trim();
    const charPlace = region ? `角色所在地（${region}）` : '角色所在地';
    const userPlace = '本机所在地';
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      if (userTz === charTz) return `${charPlace}与${userPlace}为同一时区（无时差）`;
      const userOff = this._getTimezoneOffsetMinutes(userTz, date);
      const charOff = this._getTimezoneOffsetMinutes(charTz, date);
      const diffHours = Math.round((charOff - userOff) / 60);
      if (!diffHours) return `${charPlace}与${userPlace}时差约 0 小时`;
      if (diffHours > 0) return `${charPlace}比${userPlace}时间快 ${diffHours} 小时`;
      return `${charPlace}比${userPlace}时间慢 ${Math.abs(diffHours)} 小时`;
    } catch (e) {
      return '';
    }
  },

  _getTimezoneOffsetMinutes(timeZone, date = new Date()) {
    const tz = String(timeZone || '').trim();
    if (!tz) return 0;
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = dtf.formatToParts(date);
      const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
      const asUtc = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
        get('second')
      );
      return Math.round((asUtc - date.getTime()) / 60000);
    } catch (e) {
      return 0;
    }
  },

  _readChatI18nFromForm() {
    const langEl = document.getElementById('char-default-language');
    const sw = document.getElementById('char-multilingual-enabled');
    const tzEl = document.getElementById('char-region-timezone');
    const default_language = String(langEl?.value || 'zh').trim() || 'zh';
    const isChina = this._isChinaRegion(tzEl);
    const enabled = !this._isZhDefaultLanguage(default_language) && !isChina && !!(sw && sw.checked);
    const timezone = String(tzEl?.value || this.LANG_DEFAULT_TIMEZONE[default_language] || 'Asia/Shanghai').trim();
    const region_label = this._getTimezoneSelectLabel(tzEl);
    return { default_language, enabled, timezone, region_label };
  },

  _refreshChatI18nPreview(lang, enabled, regionLabel, timezone) {
    const el = document.getElementById('char-chat-i18n-preview');
    const lab = this.CHAT_I18N_LANG_LABELS[String(lang || 'zh')] || lang || '中文';
    const region = String(regionLabel || '').trim();
    const isChina = region === '中国';
    const parts = [lab];
    if (region && !isChina) parts.push(region);
    parts.push(enabled ? '双语已开启' : '未开启');
    if (el) el.textContent = parts.join(' · ');

    const tzEl = document.getElementById('char-region-timezone');
    this._updateChatI18nRegionDependentUi(tzEl);

    const live = document.getElementById('char-region-time-live');
    if (live && !isChina) {
      const tz = String(timezone || '').trim();
      const userNow = this._formatWallClockInTimezone(
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
      );
      const charNow = tz ? this._formatWallClockInTimezone(tz) : '';
      const diff = tz ? this._formatTimezoneOffsetDiffText(tz, new Date(), region) : '';
      const lines = [];
      if (userNow) lines.push(`本机当前时间：${userNow}`);
      if (charNow) {
        const regionPart = region ? `（${region}）` : '';
        lines.push(`角色当前时间${regionPart}：${charNow}`);
      }
      if (diff) lines.push(diff);
      live.textContent = lines.join('\n');
      this._syncActiveFormCollapseHeight('char-chat-i18n-content');
    }
  },

  /** 角色编辑页表单折叠：展开后随内容增高（时区说明、双语开关等） */
  _syncActiveFormCollapseHeight(contentId) {
    const content = document.getElementById(contentId);
    if (!content) return;
    const item = content.closest('.yd-collapse-item--form');
    if (!item || !item.classList.contains('yd-collapse-item--active')) return;
    const apply = () => {
      content.style.maxHeight = 'none';
    };
    apply();
    requestAnimationFrame(apply);
  },

  _applyDefaultTimezoneForLanguage(lang) {
    const tzEl = document.getElementById('char-region-timezone');
    if (!tzEl) return;
    const key = String(lang || 'zh').trim();
    const def = this.LANG_DEFAULT_TIMEZONE[key] || 'Asia/Shanghai';
    if (Array.from(tzEl.options).some((o) => o.value === def)) {
      tzEl.value = def;
    }
  },

  _applyChatI18nToForm(normalized) {
    const chatI18n = normalized?.chat_i18n && typeof normalized.chat_i18n === 'object'
      ? normalized.chat_i18n
      : {};
    const lang = String(chatI18n.default_language || 'zh').trim() || 'zh';
    const langEl = document.getElementById('char-default-language');
    const sw = document.getElementById('char-multilingual-enabled');
    const tzEl = document.getElementById('char-region-timezone');
    if (langEl) langEl.value = lang;
    const savedTz = String(chatI18n.timezone || '').trim();
    if (tzEl && savedTz && Array.from(tzEl.options).some((o) => o.value === savedTz)) {
      tzEl.value = savedTz;
    } else {
      this._applyDefaultTimezoneForLanguage(lang);
    }
    const isZh = this._isZhDefaultLanguage(lang);
    const isChina = this._isChinaRegion(tzEl);
    const enabled = !isZh && !isChina && (
      chatI18n.enabled === true ||
      chatI18n.enabled === 1 ||
      String(chatI18n.enabled || '') === '1'
    );
    if (sw) {
      sw.checked = enabled;
      sw.disabled = isZh || isChina;
    }
    const regionLabel = String(chatI18n.region_label || '').trim() || this._getTimezoneSelectLabel(tzEl);
    const timezone = String(tzEl?.value || savedTz || '').trim();
    this._updateChatI18nRegionDependentUi(tzEl);
    this._refreshChatI18nPreview(lang, enabled, regionLabel, timezone);
    this._startChatI18nTimeTicker();
  },

  syncChatI18nUi() {
    const langEl = document.getElementById('char-default-language');
    const sw = document.getElementById('char-multilingual-enabled');
    const tzEl = document.getElementById('char-region-timezone');
    if (!langEl || !sw) return;
    const lang = String(langEl.value || 'zh').trim() || 'zh';
    const isZh = this._isZhDefaultLanguage(lang);
    if (isZh) {
      sw.checked = false;
      sw.disabled = true;
      if (tzEl) tzEl.value = 'Asia/Shanghai';
    } else {
      this._applyDefaultTimezoneForLanguage(lang);
      const isChina = this._isChinaRegion(tzEl);
      sw.disabled = isChina;
      if (isChina) {
        sw.checked = false;
      } else {
        sw.checked = true;
      }
    }
    this._updateChatI18nRegionDependentUi(tzEl);
    const regionLabel = this._getTimezoneSelectLabel(tzEl);
    const timezone = String(tzEl?.value || '').trim();
    const isChina = this._isChinaRegion(tzEl);
    this._refreshChatI18nPreview(lang, sw.checked && !isZh && !isChina, regionLabel, timezone);
    this.markDirty();
  },

  _startChatI18nTimeTicker() {
    this._stopChatI18nTimeTicker();
    const tick = () => {
      const langEl = document.getElementById('char-default-language');
      const sw = document.getElementById('char-multilingual-enabled');
      const tzEl = document.getElementById('char-region-timezone');
      if (!langEl || !document.getElementById('char-region-time-live')) return;
      const lang = String(langEl.value || 'zh').trim() || 'zh';
      const enabled = !this._isZhDefaultLanguage(lang) && !!(sw && sw.checked);
      this._refreshChatI18nPreview(
        lang,
        enabled,
        this._getTimezoneSelectLabel(tzEl),
        String(tzEl?.value || '').trim()
      );
    };
    tick();
    this._chatI18nTimeTicker = window.setInterval(tick, 30000);
  },

  _stopChatI18nTimeTicker() {
    if (this._chatI18nTimeTicker) {
      window.clearInterval(this._chatI18nTimeTicker);
      this._chatI18nTimeTicker = null;
    }
  },

  setupChatI18nFormListeners() {
    const langEl = document.getElementById('char-default-language');
    const sw = document.getElementById('char-multilingual-enabled');
    const tzEl = document.getElementById('char-region-timezone');
    if (langEl && !langEl.dataset.ydChatI18nBound) {
      langEl.dataset.ydChatI18nBound = '1';
      langEl.addEventListener('change', () => this.syncChatI18nUi());
    }
    if (sw && !sw.dataset.ydChatI18nBound) {
      sw.dataset.ydChatI18nBound = '1';
      sw.addEventListener('change', () => this.syncChatI18nUi());
    }
    if (tzEl && !tzEl.dataset.ydChatI18nBound) {
      tzEl.dataset.ydChatI18nBound = '1';
      tzEl.addEventListener('change', () => this.syncChatI18nUi());
    }
  },

  _normalizeVoiceOne(item, groupLabel = '系统') {
    if (!item || typeof item !== 'object') return null;
    const voice_id = String(item.voice_id || '').trim();
    if (!voice_id) return null;
    const voice_name = String(item.voice_name || item.name || voice_id).trim();
    const description = Array.isArray(item.description)
      ? item.description.map(x => String(x || '').trim()).filter(Boolean)
      : [];
    const created_time = String(item.created_time || '').trim();
    const lang = this._inferVoiceLanguage({ voice_id, voice_name, description });
    return {
      voice_id,
      voice_name,
      description,
      created_time,
      group: groupLabel,
      language_label: lang?.label || '',
      language_key: lang?.key || ''
    };
  },

  _inferVoiceLanguage({ voice_id, voice_name, description }) {
    const id = String(voice_id || '').trim();
    const name = String(voice_name || '').trim();
    const desc = Array.isArray(description) ? description.join(' ') : String(description || '');
    const blob = `${id} ${name} ${desc}`;
    const lower = blob.toLowerCase();

    const has = (re) => re.test(blob);
    const hasLower = (s) => lower.includes(s);

    if (has(/韩语|Korean/i) || hasLower('korean_')) return { label: '韩语', key: 'ko' };
    if (has(/日语|Japanese/i) || hasLower('japanese_')) return { label: '日语', key: 'ja' };
    if (has(/粤语|Cantonese/i) || hasLower('cantonese_')) return { label: '粤语', key: 'yue' };
    if (has(/普通话|中文|Chinese/i) || hasLower('chinese (mandarin)')) return { label: '中文', key: 'zh' };
    if (has(/英语|English/i) || hasLower('english_')) return { label: '英语', key: 'en' };
    if (has(/西班牙语|Spanish/i) || hasLower('spanish_')) return { label: '西语', key: 'es' };
    if (has(/葡萄牙语|Portuguese/i) || hasLower('portuguese_')) return { label: '葡语', key: 'pt' };
    if (has(/法语|French/i) || hasLower('french_')) return { label: '法语', key: 'fr' };
    if (has(/印尼语|Indonesian/i) || hasLower('indonesian_')) return { label: '印尼语', key: 'id' };
    if (has(/德语|German/i) || hasLower('german_')) return { label: '德语', key: 'de' };
    if (has(/俄语|Russian/i) || hasLower('russian_')) return { label: '俄语', key: 'ru' };
    if (has(/意大利语|Italian/i) || hasLower('italian_')) return { label: '意大利语', key: 'it' };
    if (has(/阿拉伯语|Arabic/i) || hasLower('arabic_')) return { label: '阿拉伯语', key: 'ar' };
    if (has(/土耳其语|Turkish/i) || hasLower('turkish_')) return { label: '土耳其语', key: 'tr' };
    if (has(/乌克兰语|Ukrainian/i) || hasLower('ukrainian_')) return { label: '乌克兰语', key: 'uk' };
    if (has(/越南语|Vietnamese/i) || hasLower('vietnamese_')) return { label: '越南语', key: 'vi' };
    if (has(/荷兰语|Dutch/i) || hasLower('dutch_')) return { label: '荷兰语', key: 'nl' };
    return null;
  },

  async _fetchRoleVoiceList() {
    const key = String(Storage.get(CONFIG.STORAGE_KEYS.VOICE_API_KEY) || '').trim();
    if (!key) {
      alert('请先在 设置-语音设置 中配置 API Key');
      return [];
    }
    const url = 'https://api.minimaxi.com/v1/get_voice';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({ voice_type: 'all' })
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || Number(json?.base_resp?.status_code || 0) !== 0) {
      throw new Error(String(json?.base_resp?.status_msg || `HTTP ${resp.status}`));
    }
    const out = [];
    (Array.isArray(json?.system_voice) ? json.system_voice : [])
      .forEach(v => { const n = this._normalizeVoiceOne(v, '系统'); if (n) out.push(n); });
    (Array.isArray(json?.voice_cloning) ? json.voice_cloning : [])
      .forEach(v => { const n = this._normalizeVoiceOne(v, '复刻'); if (n) out.push(n); });
    (Array.isArray(json?.voice_generation) ? json.voice_generation : [])
      .forEach(v => { const n = this._normalizeVoiceOne(v, '生成'); if (n) out.push(n); });
    return out;
  },

  _applyRoleVoiceToCurrent(voiceObj) {
    if (!this.currentRawData || typeof this.currentRawData !== 'object') this.currentRawData = {};
    if (!this.currentRawData.data || typeof this.currentRawData.data !== 'object') this.currentRawData.data = {};
    this.currentRawData.data.role_voice = voiceObj
      ? {
          voice_id: String(voiceObj.voice_id || ''),
          voice_name: String(voiceObj.voice_name || ''),
          description: Array.isArray(voiceObj.description) ? voiceObj.description.slice() : [],
          created_time: String(voiceObj.created_time || ''),
          group: String(voiceObj.group || '')
        }
      : null;
    this.currentRawData.role_voice = this.currentRawData.data.role_voice;
    this.markDirty();
    this.renderRoleVoicePreview(this.normalizeCard(this.currentRawData));
  },

  renderRoleVoicePreview(normalized) {
    const preview = document.getElementById('char-role-voice-preview');
    const nameEl = document.getElementById('char-role-voice-name');
    const idEl = document.getElementById('char-role-voice-id');
    const v = normalized?.role_voice && typeof normalized.role_voice === 'object' ? normalized.role_voice : null;
    const voiceName = v ? String(v.voice_name || v.voice_id || '').trim() : '';
    const voiceId = v ? String(v.voice_id || '').trim() : '';
    const desc = v && Array.isArray(v.description) ? v.description.map(x => String(x || '').trim()).filter(Boolean).join(' ') : '';
    if (preview) preview.textContent = voiceName || '未设置（将使用系统默认音色）';
    if (nameEl) nameEl.textContent = voiceName || '未设置';
    if (idEl) idEl.textContent = voiceId ? `${voiceId}${desc ? ` · ${desc}` : ''}` : '将使用系统默认音色';
  },

  async openRoleVoicePicker() {
    const existing = document.getElementById('yd-role-voice-picker');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'yd-role-voice-picker';
    overlay.className = 'yd-modal yd-modal--active';
    overlay.innerHTML = `
      <div class="yd-modal-content yd-role-voice-picker" role="dialog" aria-modal="true" aria-label="选择角色音色">
        <div class="yd-modal-header">
          <div style="font-weight:900">选择角色音色</div>
          <button type="button" class="yd-btn-close" id="yd-role-voice-picker-close" aria-label="关闭">×</button>
        </div>
        <div class="yd-role-voice-picker__toolbar">
          <input class="yd-input yd-role-voice-picker__search" id="yd-role-voice-picker-search" placeholder="搜索音色名 / ID / 描述">
          <button type="button" class="yd-btn yd-btn--secondary yd-btn--small" id="yd-role-voice-picker-clear">清空绑定</button>
        </div>
        <div class="yd-role-voice-picker__list" id="yd-role-voice-picker-list">
          <div class="yd-character-preview__empty">正在加载音色列表...</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#yd-role-voice-picker-close')?.addEventListener('click', close);
    overlay.querySelector('#yd-role-voice-picker-clear')?.addEventListener('click', () => {
      this._applyRoleVoiceToCurrent(null);
      close();
    });

    const listEl = overlay.querySelector('#yd-role-voice-picker-list');
    const searchEl = overlay.querySelector('#yd-role-voice-picker-search');

    let voices = [];
    try {
      voices = await this._fetchRoleVoiceList();
      this._voicePickerCache = voices;
    } catch (e) {
      console.error('获取角色音色失败:', e);
      listEl.innerHTML = `<div class="yd-character-preview__empty">获取音色失败：${this.escapeHtml(String(e?.message || e))}</div>`;
      return;
    }
    const currentVoiceId = String(this.normalizeCard(this.currentRawData || {}).role_voice?.voice_id || '').trim();

    const render = () => {
      const kw = String(searchEl?.value || '').trim().toLowerCase();
      const filtered = kw
        ? voices.filter(v => `${v.voice_name} ${v.voice_id} ${(v.description || []).join(' ')}`.toLowerCase().includes(kw))
        : voices;
      if (!filtered.length) {
        listEl.innerHTML = `<div class="yd-character-preview__empty">没有匹配的音色</div>`;
        return;
      }
      listEl.innerHTML = filtered.map(v => {
        const desc = Array.isArray(v.description) && v.description.length ? v.description.join(' ') : '暂无描述';
        const active = currentVoiceId && currentVoiceId === v.voice_id;
        const lang = String(v.language_label || '').trim();
        const langKey = String(v.language_key || '').trim();
        return `
          <button type="button" class="yd-role-voice-card${active ? ' is-active' : ''}" data-voice-id="${this.escapeHtml(v.voice_id)}">
            <div class="yd-role-voice-card__top">
              <span class="yd-role-voice-card__name">${this.escapeHtml(v.voice_name)}</span>
              ${lang ? `<span class="yd-role-voice-card__lang yd-role-voice-card__lang--${this.escapeHtml(langKey || 'default')}">${this.escapeHtml(lang)}</span>` : ''}
            </div>
            <div class="yd-role-voice-card__id">${this.escapeHtml(v.voice_id)}</div>
            <div class="yd-role-voice-card__desc">${this.escapeHtml(desc)}</div>
          </button>
        `;
      }).join('');
      listEl.querySelectorAll('[data-voice-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = String(btn.getAttribute('data-voice-id') || '').trim();
          const hit = voices.find(x => x.voice_id === id);
          if (!hit) return;
          this._applyRoleVoiceToCurrent(hit);
          close();
        });
      });
    };
    searchEl?.addEventListener('input', render);
    render();
  },

  renderJsonPreview(normalized) {
    // 世界书 entries 列表预览
    const bookPreview = document.getElementById('char-book-preview');
    if (bookPreview) {
      const entries = normalized?.character_book?.entries;
      let items = [];
      if (Array.isArray(entries)) {
        items = entries.map(e => ({ ref: e }));
      } else if (entries && typeof entries === 'object') {
        items = Object.values(entries).map(e => ({ ref: e }));
      }

      if (!items.length) {
        bookPreview.innerHTML = `
          <div class="yd-character-preview__empty">世界书为空，可添加条目（支持关键词触发或常驻）</div>
        `;
        this._bookEntriesCache = [];
        this.bindWorldBookAddButton(document);
      } else {
        const collapsibleId = 'book-collapse-' + Date.now();
        const lines = items.map((item, idx) => {
          const e = item.ref;
          const isObj = e && typeof e === 'object';
          const comment = isObj ? (e.comment || '') : '';
          const enabled = isObj ? e.enabled : undefined;
          const content = isObj ? (e.content || e.value || e.entry || '') : '';
          
          // 提取关键字信息
          const keys = Array.isArray(e?.keys) ? e.keys : [];
          const secondaryKeys = Array.isArray(e?.secondary_keys) ? e.secondary_keys : [];
          const allKeys = [...keys, ...secondaryKeys]
            .map(k => String(k || '').trim())
            .filter(k => k.length > 0);
          
          // 判断是常驻还是关键字识别
          const isConstant = allKeys.length === 0;
          const keyTypeClass = isConstant ? 'yd-book-type--constant' : 'yd-book-type--keyword';
          
          // 构建关键字显示文本（标题只显示类型，不显示具体关键词）
          const keyDisplayText = isConstant
            ? '<span class="yd-book-type-badge ' + keyTypeClass + '">常驻</span>'
            : `<span class="yd-book-type-badge ${keyTypeClass}">关键词触发</span>`;
          
          const titleText = comment || '[无标题]';
          const fullText = content || '[无内容]';
          
          // 构建内容显示：如果是关键词触发，第一行显示关键词信息
          let contentHtml = '';
          if (!isConstant && allKeys.length > 0) {
            const keysText = allKeys.map(k => this.escapeHtml(k)).join(', ');
            contentHtml = `<div class="yd-book-keywords-info">关键词触发：${keysText}</div>`;
          }
          contentHtml += `<pre class="yd-collapse-item__text">${this.escapeHtml(fullText)}</pre>`;
          
          const switchHtml = (typeof enabled === 'boolean')
            ? `<span class="yd-switch ${enabled ? 'yd-switch--on' : 'yd-switch--off'}">${enabled ? '开启' : '禁用'}</span>`
            : '';
          
          return `
            <div class="yd-collapse-item">
              <div class="yd-collapse-item__header" data-collapse="${collapsibleId}-${idx}">
                <div class="yd-collapse-item__title-wrap">
                  <span class="yd-collapse-item__title">${idx + 1}. ${this.escapeHtml(titleText)}</span>
                  ${keyDisplayText}
                </div>
                <div class="yd-collapse-item__right">
                  <button class="yd-icon-btn yd-book-edit-btn" data-book-index="${idx}" data-target-id="${collapsibleId}-${idx}" title="编辑" aria-label="编辑">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
                    </svg>
                  </button>
                  ${switchHtml}
                </div>
                <span class="yd-collapse-item__icon">▼</span>
              </div>
              <div class="yd-collapse-item__content" id="${collapsibleId}-${idx}">
                ${contentHtml}
              </div>
            </div>
          `;
        }).join('');
        bookPreview.innerHTML = `
          <div class="yd-collapse-list">${lines}</div>
        `;
        // 缓存引用，便于编辑时回写
        this._bookEntriesCache = items;
        
        // 绑定折叠事件
        this.bindCollapseEvents(bookPreview);
        this.bindBookEditButtons();
        this.bindWorldBookAddButton(document);
      }
    }

    // 扩展正则列表预览
    const extPreview = document.getElementById('char-extensions-preview');
    if (extPreview) {
      const found = this.collectRegexLikeEntriesDetailed(normalized?.extensions);
      if (!found.length) {
        extPreview.innerHTML = `<div class="yd-character-preview__empty">扩展（正则）为空</div>`;
      } else {
        const collapsibleId = 'ext-collapse-' + Date.now();
        const lines = found.map((item, idx) => {
          const switchHtml = (typeof item.enabled === 'boolean')
            ? `<span class="yd-switch ${item.enabled ? 'yd-switch--on' : 'yd-switch--off'}">${item.enabled ? '开启' : '禁用'}</span>`
            : '';
          const findText = item.findRegex || '';
          const replaceText = item.replaceString || '';
          return `
            <div class="yd-collapse-item">
              <div class="yd-collapse-item__header" data-collapse="${collapsibleId}-${idx}">
                <span class="yd-collapse-item__title">${idx + 1}. ${this.escapeHtml(item.title || '')}</span>
                <div class="yd-collapse-item__right">
                  ${switchHtml}
                  <button class="yd-icon-btn yd-ext-edit-btn" data-ext-index="${idx}" data-target-id="${collapsibleId}-${idx}" title="编辑" aria-label="编辑">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
                    </svg>
                  </button>
                </div>
                <span class="yd-collapse-item__icon">▼</span>
              </div>
              <div class="yd-collapse-item__content" id="${collapsibleId}-${idx}">
                <div class="yd-collapse-item__body">
                  <div class="yd-field">
                    <div class="yd-field__label">寻找：</div>
                    <div class="yd-field__value">${this.escapeHtml(findText || '（空）')}</div>
                  </div>
                  <div class="yd-field">
                    <div class="yd-field__label">替换为：</div>
                    <div class="yd-field__value">${this.escapeHtml(replaceText || '（空）')}</div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('');
        extPreview.innerHTML = `<div class="yd-collapse-list">${lines}</div>`;
        this._extEntriesCache = found;
        
        // 绑定折叠事件
        this.bindCollapseEvents(extPreview);
        this.bindExtEditButtons();
      }
    }
  },

  /** 折叠面板默认高度为 0，内嵌编辑器需先展开否则输入框被 overflow:hidden 裁切 */
  _expandCollapseForEditor(contentEl) {
    if (!contentEl) return;
    const collapseItem = contentEl.closest('.yd-collapse-item');
    if (collapseItem) {
      collapseItem.classList.add('yd-collapse-item--active');
      const hdrIcon = collapseItem.querySelector(':scope > .yd-collapse-item__header .yd-collapse-item__icon');
      if (hdrIcon) hdrIcon.textContent = '▲';
    }
    if (collapseItem?.classList.contains('yd-collapse-item--form')) {
      contentEl.style.maxHeight = 'none';
      return;
    }
    const stretch = () => {
      contentEl.style.maxHeight = `${Math.max(contentEl.scrollHeight + 24, 400)}px`;
    };
    stretch();
    requestAnimationFrame(stretch);
  },

  // 绑定折叠事件
  bindCollapseEvents(container) {
    const headers = container.querySelectorAll('.yd-collapse-item__header');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const targetId = header.getAttribute('data-collapse');
        const content = document.getElementById(targetId);
        const icon = header.querySelector('.yd-collapse-item__icon');
        const item = header.parentElement;
        
        if (content && icon && item) {
          const isForm = item.classList.contains('yd-collapse-item--form');
          item.classList.toggle('yd-collapse-item--active');
          if (item.classList.contains('yd-collapse-item--active')) {
            if (isForm) {
              content.style.maxHeight = 'none';
              if (content.id === 'char-chat-i18n-content') {
                requestAnimationFrame(() => this._syncActiveFormCollapseHeight(content.id));
              }
            } else {
              content.style.maxHeight = content.scrollHeight + 'px';
            }
            icon.textContent = '▲';
          } else {
            content.style.maxHeight = '0';
            icon.textContent = '▼';
          }
        }
      });
    });
  },

  bindWorldBookAddButton(container) {
    const btn = container && container.querySelector('#char-book-add-entry');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.addCharacterBookEntry();
    });
  },

  _applyWorldBookPayloadToRef(ref, payload) {
    if (!ref || typeof ref !== 'object' || !payload) return;
    ref.enabled = !!payload.enabled;
    const commentVal = String(payload.comment || '').trim();
    if (commentVal) ref.comment = commentVal;
    else delete ref.comment;

    if (payload.keys && payload.keys.length > 0) ref.keys = payload.keys;
    else delete ref.keys;

    delete ref.secondary_keys;

    const text = String(payload.content || '');
    if ('content' in ref || (!('value' in ref) && !('entry' in ref))) {
      ref.content = text;
    } else if ('value' in ref) {
      ref.value = text;
    } else if ('entry' in ref) {
      ref.entry = text;
    } else {
      ref.content = text;
    }
  },

  bindBookEditButtons() {
    const container = document.getElementById('char-book-preview');
    if (!container || !this._bookEntriesCache) return;
    const buttons = container.querySelectorAll('.yd-book-edit-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-book-index'));
        const targetId = btn.getAttribute('data-target-id');
        this.openBookEntryEditor(idx, targetId);
      });
    });
  },

  openBookEntryEditor(idx, targetId) {
    const item = this._bookEntriesCache && this._bookEntriesCache[idx];
    if (!item || !item.ref || typeof item.ref !== 'object') return;
    const ref = item.ref;

    if (typeof Worldbook === 'undefined' || !Worldbook.openEntryModal) {
      alert('世界书编辑组件未加载，请刷新页面重试。');
      return;
    }

    const currentKeys = Array.isArray(ref.keys) ? ref.keys : [];
    const currentSecondaryKeys = Array.isArray(ref.secondary_keys) ? ref.secondary_keys : [];
    const keysText = [...currentKeys, ...currentSecondaryKeys]
      .map((k) => String(k || '').trim())
      .filter(Boolean)
      .join(', ');

    Worldbook.openEntryModal({
      titleBar: '编辑世界书条目',
      enabled: ref.enabled !== false,
      comment: String(ref.comment ?? '').trim(),
      keysText,
      content: String(ref.content || ref.value || ref.entry || ''),
      showDelete: true,
      onSave: (payload) => {
        this._applyWorldBookPayloadToRef(ref, payload);
        this.markDirty();
        const norm = this.normalizeCard(this.currentRawData);
        this.renderJsonPreview(norm);
      },
      onDelete: () => {
        if (!confirm('确定删除这条世界书条目？')) return false;
        const entries = this._ensureMutableCharacterBook();
        const at = entries.indexOf(ref);
        if (at >= 0) entries.splice(at, 1);
        this.markDirty();
        const norm = this.normalizeCard(this.currentRawData);
        this.renderJsonPreview(norm);
        return true;
      }
    });
  },

  bindExtEditButtons() {
    const container = document.getElementById('char-extensions-preview');
    if (!container || !this._extEntriesCache) return;
    const buttons = container.querySelectorAll('.yd-ext-edit-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-ext-index'));
        this.openExtEntryEditor(idx);
      });
    });
  },

  openExtEntryEditor(idx) {
    const item = this._extEntriesCache && this._extEntriesCache[idx];
    if (!item || !item.ref || typeof item.ref !== 'object') return;
    const ref = item.ref;
    const currentEnabled = typeof ref.enabled === 'boolean' ? ref.enabled : true;
    const currentFind = item.findRegex || '';
    const currentReplace = item.replaceString || '';
    const existing = document.getElementById('yd-character-ext-dialog');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'yd-character-ext-dialog';
    modal.className = 'yd-forum-picker';
    modal.innerHTML = `
      <div class="yd-forum-picker__mask" data-close="1"></div>
      <div class="yd-forum-picker__panel" role="dialog" aria-modal="true">
        <div class="yd-forum-picker__bar">
          <div class="yd-forum-picker__title">编辑正则条目</div>
          <button type="button" class="yd-forum-picker__close" data-close="1" aria-label="关闭">×</button>
        </div>
        <label class="yd-book-edit__row yd-toggle" style="margin-bottom:8px;">
          <span class="yd-toggle__label yd-book-edit__toggle-label">是否开启</span>
          <span class="yd-toggle__control">
            <input type="checkbox" id="yd-character-ext-enabled" class="yd-toggle__input" ${currentEnabled ? 'checked' : ''}>
            <span class="yd-toggle__slider"></span>
          </span>
        </label>
        <textarea class="yd-forum-compose__textarea" id="yd-character-ext-find" placeholder="寻找（正则）" maxlength="100000" style="margin-top:10px;">${this.escapeHtml(currentFind)}</textarea>
        <textarea class="yd-forum-compose__textarea" id="yd-character-ext-replace" placeholder="替换为" maxlength="100000" style="margin-top:10px;">${this.escapeHtml(currentReplace)}</textarea>
        <div class="yd-forum-picker__footer" style="justify-content:flex-end;gap:10px;flex-wrap:wrap;">
          <button type="button" class="yd-forum-item__btn" id="yd-character-ext-delete" style="color:#dc2626;">删除本条</button>
          <button type="button" class="yd-forum-item__btn yd-forum-item__btn--primary" id="yd-character-ext-save">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    const saveBtn = modal.querySelector('#yd-character-ext-save');
    const deleteBtn = modal.querySelector('#yd-character-ext-delete');
    const removeRefFromNode = (node, target) => {
      if (!node) return false;
      if (Array.isArray(node)) {
        const idx = node.indexOf(target);
        if (idx >= 0) {
          node.splice(idx, 1);
          return true;
        }
        for (const item of node) {
          if (removeRefFromNode(item, target)) return true;
        }
        return false;
      }
      if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (v === target) {
            delete node[k];
            return true;
          }
          if (removeRefFromNode(v, target)) return true;
        }
      }
      return false;
    };

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (!confirm('确定删除这条正则条目？')) return;
        const removed = removeRefFromNode(this.currentRawData, ref);
        if (!removed) {
          alert('删除失败：未找到该条目');
          return;
        }
        this.markDirty();
        const norm = this.normalizeCard(this.currentRawData);
        this.renderJsonPreview(norm);
        close();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const enabledEl = document.getElementById('yd-character-ext-enabled');
        const findEl = document.getElementById('yd-character-ext-find');
        const replaceEl = document.getElementById('yd-character-ext-replace');

        const enabled = enabledEl ? !!enabledEl.checked : true;
        const findText = findEl ? String(findEl.value || '') : '';
        const replaceText = replaceEl ? String(replaceEl.value || '') : '';

        ref.enabled = enabled;

        const setFind = (val) => {
          if ('findRegex' in ref) ref.findRegex = val;
          else if ('regex' in ref) ref.regex = val;
          else if ('pattern' in ref) ref.pattern = val;
          else if ('find' in ref) ref.find = val;
          else ref.findRegex = val;
        };
        const setReplace = (val) => {
          if ('replaceString' in ref) ref.replaceString = val;
          else if ('replace' in ref) ref.replace = val;
          else if ('replacement' in ref) ref.replacement = val;
          else ref.replaceString = val;
        };

        setFind(findText);
        setReplace(replaceText);

        this.markDirty();
        const norm = this.normalizeCard(this.currentRawData);
        this.renderJsonPreview(norm);
        close();
      });
    }

    const first = document.getElementById('yd-character-ext-find');
    if (first) setTimeout(() => first.focus(), 0);
  },

  collectRegexLikeEntries(extensions) {
    const out = [];
    const seen = new Set();
    const push = (s) => {
      const v = String(s || '').trim();
      if (!v) return;
      if (seen.has(v)) return;
      seen.add(v);
      out.push(v);
    };
    const walk = (node, path = '') => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          const p = path ? `${path}.${k}` : k;
          if (/regex|pattern|rule|script/i.test(k)) {
            if (Array.isArray(v)) {
              v.forEach((item) => {
                if (typeof item === 'string') push(`${p}: ${item}`);
                else if (item && typeof item === 'object') {
                  push(`${p}: ${item.name || item.id || item.regex || item.pattern || '[对象]'}`);
                } else {
                  push(`${p}: [值]`);
                }
              });
            } else if (typeof v === 'string') {
              push(`${p}: ${v}`);
            } else if (v && typeof v === 'object') {
              push(`${p}: [对象]`);
            }
          }
          walk(v, p);
        }
      }
    };
    walk(extensions);
    return out;
  },

  // 收集扩展正则条目（详细版，包含匹配规则）
  collectRegexLikeEntriesDetailed(extensions) {
    const out = [];
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
              v.forEach((item, idx) => {
                if (!item || typeof item !== 'object') return;
                const key = JSON.stringify(item);
                if (seen.has(key)) return;
                seen.add(key);
                
                const scriptName = item.scriptName || item.name || item.id || item.comment || `规则${idx + 1}`;
                let enabled = item.enabled;
                if (enabled !== undefined && typeof enabled !== 'boolean') {
                  if (enabled === false || enabled === 0 || enabled === '0') enabled = false;
                  else if (enabled === true || enabled === 1 || enabled === '1') enabled = true;
                  else if (typeof enabled === 'string' && enabled.trim().toLowerCase() === 'false') enabled = false;
                  else enabled = true;
                }
                const findRegex = item.findRegex || item.regex || item.pattern || item.find || '';
                const replaceString = item.replaceString || item.replace || item.replacement || '';
                
                out.push({
                  title: scriptName,
                  enabled,
                  findRegex,
                  replaceString,
                  ref: item
                });
              });
            } else if (v && typeof v === 'object') {
              const key = JSON.stringify(v);
              if (!seen.has(key)) {
                seen.add(key);
                const scriptName = v.scriptName || v.name || v.id || v.comment || p;
                let enabled = v.enabled;
                if (enabled !== undefined && typeof enabled !== 'boolean') {
                  if (enabled === false || enabled === 0 || enabled === '0') enabled = false;
                  else if (enabled === true || enabled === 1 || enabled === '1') enabled = true;
                  else if (typeof enabled === 'string' && enabled.trim().toLowerCase() === 'false') enabled = false;
                  else enabled = true;
                }
                const findRegex = v.findRegex || v.regex || v.pattern || v.find || '';
                const replaceString = v.replaceString || v.replace || v.replacement || '';
                out.push({
                  title: scriptName,
                  enabled,
                  findRegex,
                  replaceString,
                  ref: v
                });
              }
            }
          }
          walk(v, p);
        }
      }
    };
    
    walk(extensions);
    return out;
  },
  
  // 保存角色
  async saveCharacter() {
    const name = document.getElementById('char-name').value.trim();
    
    if (!name) {
      alert('请输入角色名称');
      return;
    }
    
    // 取“原始卡数据”并归一化（支持 data 包裹结构）
    let baseRaw = this.currentRawData || null;
    if (!baseRaw && this.currentEditingId) {
      baseRaw = await Storage.dbGet('characters', this.currentEditingId);
    }
    const baseNorm = this.normalizeCard(baseRaw || {});

    const descEl = document.getElementById('char-description');
    const description = String((descEl && descEl.value) || baseNorm.description || '').trim();
    // 第一句话 / 多开场白：编辑页不展示，保存时沿用卡内已有数据（导入或历史数据）
    const first_mes = String(baseNorm.first_mes || '').trim();
    const alternateGreetings = Array.isArray(baseNorm.alternate_greetings)
      ? baseNorm.alternate_greetings.map((g) => String(g))
      : [];

    // 解析世界书 / 扩展 JSON（允许留空）；世界书优先使用当前编辑中的 currentRawData（与弹窗编辑一致）
    const bookText = (document.getElementById('char-character-book-json')?.value || '').trim();
    const extText = (document.getElementById('char-extensions-json')?.value || '').trim();
    let characterBook = null;
    let extensions = null;
    try {
      if (bookText) {
        characterBook = JSON.parse(bookText);
      } else if (this.currentRawData && this.currentRawData.data && typeof this.currentRawData.data === 'object' && this.currentRawData.data.character_book) {
        characterBook = this.currentRawData.data.character_book;
      } else if (this.currentRawData && this.currentRawData.character_book) {
        characterBook = this.currentRawData.character_book;
      } else {
        characterBook = baseNorm.character_book || null;
      }
    } catch (e) {
      alert('世界书 JSON 格式不正确');
      return;
    }
    try {
      extensions = extText ? JSON.parse(extText) : (baseNorm.extensions || null);
    } catch (e) {
      alert('扩展配置 JSON 格式不正确');
      return;
    }
    
    // 按“卡格式 v3”存：顶层保留基础字段，复杂字段放在 data 下（和你给的示例一致）
    const oldAvatar = String(baseNorm.avatar || '').trim();
    const character = {
      id: this.currentEditingId || State.generateId(),
      spec: (baseRaw && baseRaw.spec) ? baseRaw.spec : 'chara_card_v3',
      spec_version: (baseRaw && baseRaw.spec_version) ? baseRaw.spec_version : '3.0',
      name: name,
      description,
      first_mes,
      createdAt: (baseRaw && baseRaw.createdAt) ? baseRaw.createdAt : Date.now(),
      data: {
        ...(baseRaw && baseRaw.data && typeof baseRaw.data === 'object' ? baseRaw.data : {}),
        name: name,
        description,
        first_mes,
        alternate_greetings: alternateGreetings,
        character_book: characterBook,
        extensions: extensions,
        avatar: baseNorm.avatar ?? null,
        role_voice: baseNorm.role_voice ?? null,
        chat_i18n: this._readChatI18nFromForm()
      }
    };
    const newAvatar = String(character?.data?.avatar || '').trim();
    
    if (this.currentEditingId) {
      await Storage.dbPut('characters', character);
    } else {
      await Storage.dbAdd('characters', character);
    }
    await this._syncSingleSessionAvatarFromCharacter(character.id, oldAvatar, newAvatar);

    if (typeof Chat !== 'undefined' && Chat.invalidateCharacterCache) {
      Chat.invalidateCharacterCache();
    }
    // 角色头像/名称更新后，会话列表需要即时重绘（否则会保留旧 DOM，必须刷新才变化）
    try {
      if (typeof Chat !== 'undefined' && typeof Chat.renderChatList === 'function') {
        await Chat.renderChatList();
      }
    } catch (e) {}

    this.formDirty = false;
    this.currentEditingData = null;
    this.resetEditForm();
  },
  
  // 加载角色列表
  async loadCharacters() {
    const characters = await Storage.dbGetAll('characters');
    const container = document.getElementById('character-content');
    container.innerHTML = '';
    
    if (characters.length === 0) {
      // 空状态
      container.innerHTML = `
        <div class="yd-empty">
          <div class="yd-empty__icon">👤</div>
          <div class="yd-empty__text">暂无角色，点击右上角添加</div>
        </div>
      `;
      return;
    }
    
    // 按创建时间排序
    characters.sort((a, b) => b.createdAt - a.createdAt);
    
    characters.forEach(character => {
      const normalized = this.normalizeCard(character);
      const card = document.createElement('div');
      card.className = 'yd-character-card';

      const avatarSrc = normalized.avatar || null;
      const settingPreview = String(normalized.description || '').trim() || '暂无角色设定';

      let cardContent = `
        <div class="yd-character-card__header">
          <div class="yd-character-card__avatar">
            ${avatarSrc ? `<img src="${this.escapeHtml(avatarSrc)}" alt="${this.escapeHtml(normalized.name || '角色头像')}" class="yd-character-card__avatar-img">` : '👤'}
          </div>
          <div class="yd-character-card__info">
            <div class="yd-character-card__name">${this.escapeHtml(normalized.name)}</div>
            <div class="yd-character-card__desc">${this.escapeHtml(settingPreview)}</div>
          </div>
        </div>
      `;

      // character_book - 已隐藏
      // if (normalized.character_book && normalized.character_book.entries) {
      //   const entriesCount = Array.isArray(normalized.character_book.entries) ? 
      //     normalized.character_book.entries.length : 
      //     Object.keys(normalized.character_book.entries).length;
      //   
      //   if (entriesCount > 0) {
      //     cardContent += `
      //       <div class="yd-character-card__section">
      //         <div class="yd-character-card__label">📚 角色书 (${entriesCount}条)</div>
      //       </div>
      //     `;
      //   }
      // }
      
      // extensions正则 - 已隐藏
      // if (normalized.extensions) {
      //   const regexCount = this.getExtensionsRegexCount(normalized.extensions);
      //   if (regexCount > 0) {
      //     cardContent += `
      //       <div class="yd-character-card__section">
      //         <div class="yd-character-card__label">🔧 扩展（正则）(${regexCount}条)</div>
      //       </div>
      //     `;
      //   }
      // }
      
      cardContent += `
        <div class="yd-character-card__actions">
          <button class="yd-btn yd-btn--small" data-id="${character.id}" data-action="delete">删除</button>
          <button class="yd-btn yd-btn--small" data-id="${character.id}" data-action="edit">编辑</button>
        </div>
      `;
      
      card.innerHTML = cardContent;

      // 点击卡片进入编辑页
      card.addEventListener('click', async () => {
        this.currentEditingId = normalized.id || character.id;
        // 从 DB 取完整对象作为 raw
        const full = await Storage.dbGet('characters', this.currentEditingId) || character;
        State.switchPage('page-character-edit');
        this.showCreateForm(full);
        document.getElementById('character-edit-title').textContent = '编辑角色';
      });
      
      // 阻止内部按钮冒泡影响卡片点击
      const editBtn = card.querySelector('[data-action="edit"]');
      const delBtn = card.querySelector('[data-action="delete"]');
      
      if (editBtn) {
        editBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          this.currentEditingId = normalized.id || character.id;
          const full = await Storage.dbGet('characters', this.currentEditingId) || character;
          State.switchPage('page-character-edit');
          this.showCreateForm(full);
          document.getElementById('character-edit-title').textContent = '编辑角色';
        });
      }
      
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('确定删除此角色？')) {
            this.deleteCharacter(normalized.id || character.id);
          }
        });
      }
      
      container.appendChild(card);
    });
  },
  
  // 删除角色
  async deleteCharacter(characterId) {
    await Storage.dbDelete('characters', characterId);
    await this.loadCharacters();
  },

  async openCharacterDetailById(characterId) {
    const id = String(characterId || '').trim();
    if (!id) return false;
    const full = await Storage.dbGet('characters', id);
    if (!full) return false;
    this.currentEditingId = id;
    State.switchPage('page-character-edit');
    this.showCreateForm(full);
    const titleEl = document.getElementById('character-edit-title');
    if (titleEl) titleEl.textContent = '编辑角色';
    return true;
  },
  
  // 开始与角色对话
  async startChatWithCharacter(characterId) {
    const character = await Storage.dbGet('characters', characterId);
    if (!character) return;
    
    // 创建新会话
    const session = {
      id: State.generateId(),
      title: `与${character.name}的对话`,
      characterId: characterId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await Storage.dbAdd('sessions', session);
    
    // 构建系统提示词
    let systemPrompt = '';
    
    if (character.system_prompt) {
      systemPrompt = character.system_prompt;
    } else {
      // 根据角色信息构建系统提示词
      const parts = [];
      if (character.description) parts.push(character.description);
      if (character.personality) parts.push(`性格：${character.personality}`);
      if (character.scenario) parts.push(`场景：${character.scenario}`);
      if (character.mes_example) parts.push(`对话示例：\n${character.mes_example}`);
      
      systemPrompt = parts.join('\n\n');
    }
    
    // 添加系统消息
    if (systemPrompt) {
      const systemMsg = {
        id: State.generateId(),
        sessionId: session.id,
        role: 'system',
        content: systemPrompt,
        createdAt: Date.now()
      };
      await Storage.dbAdd('messages', systemMsg);
    }
    
    // 添加第一条消息
    if (character.first_mes) {
      const firstMsg = {
        id: State.generateId(),
        sessionId: session.id,
        role: 'assistant',
        content: character.first_mes,
        createdAt: Date.now() + 1
      };
      await Storage.dbAdd('messages', firstMsg);
    }
    
    // 打开聊天页面
    Chat.openSession(session.id);
  },
  
  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

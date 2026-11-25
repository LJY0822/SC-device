// SC 增量接力同步：只传上次同步之后的变更，靠记录 ID（全局随机唯一）做并集合并。
// 设计要点：
// 1) 数据表按时间同步；API与社交设置仅按白名单补充，保留接收端当前API选择。
// 2) 游标带安全窗 —— 每次导出包含「上次游标 - 24h」之后的变更；万一某次包没导入成功，
//    24 小时内再导一次仍能补回；首次同步游标为 0，自动退化为全量。
// 3) 删除靠墓碑（tombstone）—— 直接删掉对端无法区分「本端删除」与「对端新增」，
//    所以 Storage.dbDelete 会留一条墓碑，随增量包一起传，导入方据此执行删除。
// 4) 时间戳自洽 —— 记录的 createdAt/updatedAt 由产生它的设备写入，游标也用本端时钟，
//    同源比较不会因时钟差异错位；跨设备导入的行打 _syncAt 本地入库戳，保证三端接力不漏。
const SCSync = {
  VERSION: 1,
  KV: {
    CURSOR: '__sc_sync_cursor_v1',
    TOMB: '__sc_sync_tombstones_v1',
    DEVICE: '__sc_sync_device_v1',
    LAST_EXPORT: '__sc_sync_last_export_v1',
    LAST_IMPORT: '__sc_sync_last_import_v1'
  },
  // 参与同步的数据表；kv与本地设置仅通过白名单快照同步，缓存不参与
  STORES: [
    'sessions', 'messages', 'characters', 'masks', 'notes',
    'threads', 'moments', 'themes', 'album', 'tracks', 'widgetResources'
  ],
  SAFETY_MS: 24 * 60 * 60 * 1000,
  TOMB_KEEP_MS: 90 * 24 * 60 * 60 * 1000,
  TOMB_MAX: 5000,
  _busy: false,
  SOCIAL_SEED:'__sc_sync_social_seed_v2',
  apiKeyNames(){const keys=typeof CONFIG!=='undefined'?CONFIG.STORAGE_KEYS:{};return [...new Set([...Object.entries(keys||{}).filter(([name])=>/^(API_|IMAGE_GEN_|CURRENT_API_CONFIG$|CURRENT_IMAGE_GEN_CONFIG$|BASE_URL$|CHAT_ROUNDS$|CHAT_AUTO_VISION$|AUX_API_|VOICE_)/.test(name)).map(([,value])=>value),'api_key','base_url','api_model','api_config_presets','sc_aux_api_v1','sc_aux_api_profiles_v1','image_gen_base_url','image_gen_api_key','image_gen_model','image_gen_config_presets'])];},
  sharedKv(key){return typeof key==='string'&&(/^(forum_|moments_|sc_terminal_role_v1_|sc_game_chat_deleted_)/.test(key)||key==='sc_terminal_news_forum_id_v1'||/^sc_terminal_daily_v1_\d{4}-\d{2}-\d{2}$/.test(key));},
  async settingsSnapshot(){
    const local=[];if(typeof Storage.get==='function')for(const key of [...this.apiKeyNames(),'forum_forums','forum_current_forum_id']){const value=Storage.get(key);if(value!==null&&value!==undefined)local.push({key,value});}
    let rows;
    if(Storage.db?.transaction){const keys=(await this._allKeys('kv')).filter(key=>this.sharedKv(key));rows=(await Promise.all(keys.map(key=>Storage.dbGet('kv',key)))).filter(Boolean);}else rows=(await Storage.dbGetAll('kv')||[]).filter(r=>this.sharedKv(r.key));
    const latest=rows.filter(r=>r.key.startsWith('sc_terminal_daily_v1_')).sort((a,b)=>b.key.localeCompare(a.key))[0]?.key;
    return {local,kv:rows.filter(r=>!r.key.startsWith('sc_terminal_daily_v1_')||r.key===latest).map(r=>({key:r.key,value:r.value,modifiedAt:Number(r._syncAt||r.updatedAt)||0}))};
  },
  mergePresets(local,incoming,device){
    const array=Array.isArray(local)||Array.isArray(incoming),entries=v=>Array.isArray(v)?v.filter(r=>r&&r.id).map(r=>[r.id,r]):Object.entries(v&&typeof v==='object'?v:{});
    const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
    const fingerprint=row=>JSON.stringify(canonical(row&&typeof row==='object'?Object.fromEntries(Object.entries(row).filter(([k])=>!['id','name'].includes(k))):row));
    const map=new Map(entries(local)),ids={};
    for(const [id,row] of entries(incoming)){
      const value=fingerprint(row);let target=id;
      if(String(id).startsWith('sync_')){const prior=[...map].find(([,p])=>fingerprint(p)===value);if(prior){ids[id]=prior[0];continue;}}
      if(map.has(id)&&fingerprint(map.get(id))!==value){let hash=2166136261;for(const ch of value)hash=Math.imul(hash^ch.charCodeAt(0),16777619);const base='sync_'+device+'_'+id+'_'+(hash>>>0).toString(16);target=base;let n=1;while(map.has(target)&&fingerprint(map.get(target))!==value)target=base+'_'+n++;}
      ids[id]=target;if(!map.has(target))map.set(target,row&&typeof row==='object'?{...row,...('id'in row?{id:target}:{}),...(target!==id&&typeof row.name==='string'?{name:row.name+'（同步）'}:{})}:row);
    }
    return {value:array?[...map.values()]:Object.fromEntries(map),ids};
  },
  async applySettings(settings,device){
    if(!settings||typeof settings!=='object')return 0;let changed=0;
    const allowed=new Set([...this.apiKeyNames(),'forum_forums','forum_current_forum_id']),rows=(Array.isArray(settings.local)?settings.local:[]).filter(r=>r&&allowed.has(r.key));
    const get=key=>typeof Storage.get==='function'?Storage.get(key):null;
    const locked={chat:!!get('api_key'),image:!!(get('image_gen_api_key')&&get('image_gen_base_url')&&get('image_gen_model')),aux:!!(get('sc_aux_api_v1')?.apiKey&&get('sc_aux_api_v1')?.baseUrl&&get('sc_aux_api_v1')?.model),voice:!!get('voice_api_key')};
    const group=key=>key.startsWith('image_gen_')||key==='current_image_gen_config'?'image':key.startsWith('sc_aux_')?'aux':key.startsWith('voice_')?'voice':'chat';
    const idMaps={};
    for(const row of rows.filter(r=>['api_config_presets','image_gen_config_presets'].includes(r.key))){const merged=this.mergePresets(get(row.key),row.value,device);Storage.set(row.key,merged.value);idMaps[row.key]=merged.ids;changed++;}
    const aux=rows.find(r=>r.key==='sc_aux_api_profiles_v1');if(aux?.value&&Array.isArray(aux.value.items)){
      const prior=get(aux.key)||(get('sc_aux_api_v1')?{activeId:'default',items:[{id:'default',name:'默认',config:get('sc_aux_api_v1')}]}:{items:[]});const merged=this.mergePresets(prior.items,aux.value.items,device);Storage.set(aux.key,{items:merged.value,activeId:locked.aux?prior.activeId:(merged.ids[aux.value.activeId]||aux.value.activeId)});changed++;
    }
    for(const row of rows){
      if(['api_config_presets','image_gen_config_presets','sc_aux_api_profiles_v1'].includes(row.key))continue;
      if(row.key==='forum_forums'){if(!Array.isArray(row.value))continue;const map=new Map((Array.isArray(get(row.key))?get(row.key):[]).filter(r=>r?.id).map(r=>[r.id,r]));for(const forum of row.value)if(forum?.id)map.set(forum.id,forum);Storage.set(row.key,[...map.values()]);changed++;continue;}
      if(row.key==='forum_current_forum_id'){if(!get(row.key)){Storage.set(row.key,row.value);changed++;}continue;}
      if(locked[group(row.key)])continue;
      let value=row.value;if(row.key==='current_api_config')value=idMaps.api_config_presets?.[value]||value;if(row.key==='current_image_gen_config')value=idMaps.image_gen_config_presets?.[value]||value;
      Storage.set(row.key,value);changed++;
    }
    for(const row of Array.isArray(settings.kv)?settings.kv:[]){if(!row||!this.sharedKv(row.key))continue;const prior=await Storage.dbGet('kv',row.key);if(!prior||Number(row.modifiedAt||0)>=Number(prior._syncAt||prior.updatedAt||0)){await Storage.dbPut('kv',{key:row.key,value:row.value,_syncAt:Number(row.modifiedAt)||0},{syncImport:true});changed++;}}
    return changed;
  },

  // 记录的时间戳：取修改时间、创建时间、本地入库戳的最大值
  _time(row) {
    if (!row || typeof row !== 'object') return 0;
    return Math.max(
      Number(row.updatedAt) || 0,
      Number(row.createdAt) || 0,
      Number(row._syncAt) || 0
    );
  },

  // 递归判断是否含 Blob（相册图片可能在 data，也可能嵌在消息 content 里）
  _hasBlob(value, depth = 0) {
    if (!value || depth > 3) return false;
    if (value instanceof Blob) return true;
    if (Array.isArray(value)) return value.some((v) => this._hasBlob(v, depth + 1));
    if (typeof value === 'object') return Object.values(value).some((v) => this._hasBlob(v, depth + 1));
    return false;
  },

  _allKeys(name) {
    return new Promise((resolve, reject) => {
      const tx = Storage.db.transaction(name, 'readonly');
      const req = tx.objectStore(name).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error(`${name} 读取主键失败`));
    });
  },

  // 分块读取并按时间筛选：相册、音乐里是 Blob，整表 getAll 会把几百兆图片一次性读进内存
  async _pickChanged(name, since) {
    const seed=['threads','moments'].includes(name)&&!await Storage.kvGet(this.SOCIAL_SEED);
    const tx=Storage.db.transaction(name,'readonly'),store=tx.objectStore(name);
    if(typeof store.openCursor==='function')return new Promise((resolve,reject)=>{const picked=[],request=store.openCursor();request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(picked);return;}const row=cursor.value;if(row&&(seed||this._time(row)>since))picked.push(row);cursor.continue();};});
    const keys = await this._allKeys(name);
    const picked = [];
    const CHUNK = 40;
    for (let i = 0; i < keys.length; i += CHUNK) {
      const slice = keys.slice(i, i + CHUNK);
      const rows = await Promise.all(slice.map((k) => Storage.dbGet(name, k)));
      for (const r of rows) if (r && (seed||this._time(r) > since)) picked.push(r);
    }
    return picked;
  },

  async deviceId() {
    let id = await Storage.kvGet(this.KV.DEVICE);
    if (!id || typeof id !== 'string') {
      id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await Storage.kvSet(this.KV.DEVICE, id);
    }
    return id;
  },

  // ===== 墓碑 =====
  async _tombstones() {
    const raw = await Storage.kvGet(this.KV.TOMB);
    return Array.isArray(raw) ? raw : [];
  },

  // 由 Storage.dbDelete 调用：记录一次删除，供对端复现
  async noteDelete(store, id) {
    try {
      if (!this.STORES.includes(store) || !id) return;
      const list = await this._tombstones();
      if (list.some((t) => t.store === store && t.id === id)) return;
      list.push({ store, id, deletedAt: Date.now() });
      await this._saveTombstones(list);
    } catch (e) {
      console.warn('[SCSync] 记录删除墓碑失败', e);
    }
  },

  async _saveTombstones(list) {
    const cutoff = Date.now() - this.TOMB_KEEP_MS;
    let next = list.filter((t) => t && Number(t.deletedAt) >= cutoff);
    if (next.length > this.TOMB_MAX) {
      next.sort((a, b) => Number(a.deletedAt) - Number(b.deletedAt));
      next = next.slice(next.length - this.TOMB_MAX);
    }
    await Storage.kvSet(this.KV.TOMB, next);
    return next;
  },

  async _since() {
    const cursor = Number(await Storage.kvGet(this.KV.CURSOR)) || 0;
    if (!cursor) return 0; // 首次同步：全量
    return Math.max(0, cursor - this.SAFETY_MS);
  },

  // ===== 导出 =====
  // 统计待传出内容（不改动游标）
  async preview() {
    const since = await this._since();
    const result = { since, firstTime: since === 0, counts: {}, total: 0, tombstones: 0 };
    for (const name of this.STORES) {
      const rows = await this._pickChanged(name, since);
      if (rows.length) { result.counts[name] = rows.length; result.total += rows.length; }
    }
    const settings=await this.settingsSnapshot();const count=settings.local.length+settings.kv.length;if(count){result.counts.settings=count;result.total+=count;}
    const tombs = await this._tombstones();
    result.tombstones = tombs.filter((t) => Number(t.deletedAt) > since).length;
    result.total += result.tombstones;
    return result;
  },

  async buildDelta() {
    const since = await this._since();
    const now = Date.now();
    const data = {};
    let total = 0;
    for (const name of this.STORES) {
      const picked = await this._pickChanged(name,since);
      if (!picked.length) continue;
      // 只对确实含 Blob 的行做编码，避免 3 万多条纯文本消息走递归慢路径
      const needsEncode = picked.some((r) => Object.values(r).some((v) => v instanceof Blob));
      data[name] = needsEncode ? await SCBackup.encode(picked) : picked;
      total += picked.length;
    }
    const tombs = await this._tombstones();
    const tombstones = tombs.filter((t) => Number(t.deletedAt) > since);
    return {
      version: 1,
      scVersion: 1,
      exportMode: 'delta',
      exportedAt: new Date(now).toISOString(),
      deviceId: await this.deviceId(),
      cursor: now,
      since,
      data,
      settings:await SCBackup.encode(await this.settingsSnapshot()),
      tombstones
    };
  },

  async exportDelta() {
    if (this._busy) throw new Error('同步操作正在进行');
    this._busy = true;
    try {
      if (typeof SCChat !== 'undefined' && SCChat.busy && SCChat.busy.size) {
        throw new Error('请等待当前 AI 回复结束再导出');
      }
      Storage._showExportWait('正在打包增量…');
      try {
        const delta = await this.buildDelta();
        const blob = new Blob([JSON.stringify(delta)], { type: 'application/json' });
        const gzip = await Storage.gzipBlob(blob);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        await Storage.downloadBlob(
          gzip || blob,
          `SC增量_${stamp}.json${gzip ? '.gz' : ''}`
        );
        // 游标推进到本次导出时刻；因带 24h 安全窗，短期重复导出会含少量冗余但不会漏
        await Storage.kvSet(this.KV.CURSOR, delta.cursor);
        await Storage.kvSet(this.SOCIAL_SEED,true);
        await Storage.kvSet(this.KV.LAST_EXPORT, delta.cursor);
        const count = Object.values(delta.data).reduce((s, arr) => s + arr.length, 0)+(delta.settings?.local?.length||0)+(delta.settings?.kv?.length||0);
        return { count, tombstones: delta.tombstones.length, bytes: (gzip || blob).size };
      } finally {
        Storage._hideExportWait();
      }
    } finally {
      this._busy = false;
    }
  },

  // ===== 导入 =====
  // 单表单事务批量合并，避免 3 万多条逐条开事务导致卡死
  async _mergeStore(name, rows, now) {
    if (!Array.isArray(rows) || !rows.length) return { added: 0, updated: 0 };
    const all = await Storage.dbGetAll(name);
    const local = new Map((all || []).map((r) => [r.id, r]));
    const deletions=new Map((await this._tombstones()).filter(t=>t.store===name).map(t=>[t.id,t.deletedAt]));
    const puts = [];
    let added = 0;
    let updated = 0;
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id || Number(deletions.get(row.id)||0)>=this._time(row)&&deletions.has(row.id)) continue;
      const cur = local.get(row.id);
      if (!cur) {
        puts.push({ ...row, _syncAt: now });
        added++;
      } else if (this._time(row) > this._time(cur)) {
        puts.push({ ...row, _syncAt: now });
        updated++;
      }
    }
    if (!puts.length) return { added: 0, updated: 0 };
    await new Promise((resolve, reject) => {
      const tx = Storage.db.transaction(name, 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error(`${name} 合并事务回滚`));
      tx.onerror = () => {};
      try {
        const store = tx.objectStore(name);
        for (const row of puts) store.put(row);
      } catch (e) {
        tx.abort();
        reject(e);
      }
    });
    return { added, updated };
  },

  async applyDelta(pkg) {
    if (!pkg || pkg.version !== 1 || pkg.exportMode !== 'delta' || !pkg.data) {
      throw new Error('不是增量同步包');
    }
    const now = Date.now();
    const decoded = SCBackup.decode(pkg.data);
    const result = { added: 0, updated: 0, removed: 0, byStore: {} };

    for (const [name, rows] of Object.entries(decoded)) {
      if (!this.STORES.includes(name)) continue;
      const r = await this._mergeStore(name, rows, now);
      if (r.added || r.updated) {
        result.byStore[name] = r;
        result.added += r.added;
        result.updated += r.updated;
      }
    }

    // 应用对端墓碑：仅当本地记录不比删除时刻更新时才删
    const localTombs = await this._tombstones();
    const incoming = Array.isArray(pkg.tombstones) ? pkg.tombstones : [];
    for (const t of incoming) {
      if (!t || !this.STORES.includes(t.store) || typeof t.id !== 'string') continue;
      const row = await Storage.dbGet(t.store, t.id);
      if (row && this._time(row) <= Number(t.deletedAt)) {
        await Storage.dbDelete(t.store, t.id, { tombstone: false });
        result.removed++;
      }
      if (!localTombs.some((x) => x.store === t.store && x.id === t.id)) {
        localTombs.push({ store: t.store, id: t.id, deletedAt: Number(t.deletedAt) || now });
      }
    }
    await this._saveTombstones(localTombs);
    // 墓碑不清理：对端或第三台设备可能尚未收到这次删除，需继续随增量包传播；
    // 过期由 _saveTombstones 内的 90 天窗口与总量上限统一收敛。

    result.settings=await this.applySettings(SCBackup.decode(pkg.settings),String(pkg.deviceId||'peer'));

    // 游标推进到对端导出时刻，本端下次只传这之后的内容
    const peerCursor = Number(pkg.cursor) || now;
    const localCursor = Number(await Storage.kvGet(this.KV.CURSOR)) || 0;
    if (peerCursor > localCursor) await Storage.kvSet(this.KV.CURSOR, peerCursor);
    await Storage.kvSet(this.KV.LAST_IMPORT, now);
    return result;
  },

  async importFile(file) {
    if (!file) return null;
    if (this._busy) throw new Error('同步操作正在进行');
    this._busy = true;
    try {
      const text = await Storage.readImportFileText(file);
      let pkg;
      try {
        pkg = JSON.parse(text);
      } catch (e) {
        throw new Error('文件不是有效 JSON，可能已损坏');
      }
      return await this.applyDelta(pkg);
    } finally {
      this._busy = false;
    }
  },

  // 重置游标：下次导出包含全部历史（用于首次或兜底修数据）
  async resetCursor() {
    await Storage.kvSet(this.KV.CURSOR, 0);
    await Storage.kvSet(this.SOCIAL_SEED,false);
  },

  async status() {
    const cursor = Number(await Storage.kvGet(this.KV.CURSOR)) || 0;
    return {
      deviceId: await this.deviceId(),
      cursor,
      lastExport: Number(await Storage.kvGet(this.KV.LAST_EXPORT)) || 0,
      lastImport: Number(await Storage.kvGet(this.KV.LAST_IMPORT)) || 0,
      ...(await this.preview())
    };
  },

  _fmt(ts) {
    if (!ts) return '从未';
    const d = new Date(Number(ts));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  // 设置页入口
  async openPanel() {
    const st = await this.status();
    const storeLabel = {
      sessions: '会话', messages: '消息', characters: '角色', masks: '面具',
      notes: '笔记', threads: '论坛', moments: '朋友圈', themes: '主题',
      album: '相册', tracks: '音乐', widgetResources: '组件', settings:'API与社交设置'
    };
    const detail = Object.entries(st.counts)
      .map(([k, v]) => `${storeLabel[k] || k} ${v}`)
      .join(' · ') || '无待传内容';
    const html = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="font-size:13px;line-height:1.9;">
          <div>本机标识：<b>${SCUI.escape(st.deviceId)}</b></div>
          <div>上次导出：${this._fmt(st.lastExport)}</div>
          <div>上次导入：${this._fmt(st.lastImport)}</div>
          <div>待传出：<b>${st.total}</b> 项${st.tombstones ? `（含 ${st.tombstones} 项删除）` : ''}</div>
          <div style="color:var(--yd-text-secondary,#888);">${SCUI.escape(detail)}</div>
        </div>
        <div style="font-size:12px;line-height:1.8;color:var(--yd-text-secondary,#888);">
          ${st.firstTime ? '尚未同步过：首次导出会包含全部历史，体积较大，之后只传变化。' : ''}
          聊天、媒体、论坛、朋友圈、最近驻地简报与API预设会同步。保留本机当前API；本机未配置时采用导入配置。包内包含API密钥，仅在自己的设备间传递；壁纸与同步锁不参与。
        </div>
        <div class="sc-dialog-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="sc-sync-export" class="sc-primary">导出增量</button>
          <button id="sc-sync-import">导入增量</button>
          <button id="sc-sync-reset">重置游标</button>
        </div>
      </div>`;
    return new Promise((resolve) => {
      SCUI.modal('增量同步', html, (d) => {
        const close = () => { try { d.close(); } catch (e) {} };
        d.addEventListener('close', () => resolve(true), { once: true });
        d.querySelector('#sc-sync-export').onclick = async () => {
          try {
            const r = await this.exportDelta();
            close();
            alert(`已导出 ${r.count} 项变更${r.tombstones ? `、${r.tombstones} 项删除` : ''}\n文件大小约 ${(r.bytes / 1024 / 1024).toFixed(2)} MB\n请把这个文件传到另一端导入。`);
          } catch (e) {
            alert(`导出失败：${e.message}`);
          }
        };
        d.querySelector('#sc-sync-import').onclick = () => {
          close();
          const input = document.getElementById('sc-sync-file');
          if (input) input.click();
        };
        d.querySelector('#sc-sync-reset').onclick = async () => {
          if (!confirm('重置同步游标后，下次导出会包含全部历史数据（体积较大）。\n用于首次同步或数据缺失时兜底。继续？')) return;
          await this.resetCursor();
          close();
          alert('已重置。下次导出将包含全部数据。');
        };
      });
    });
  }
};

// Full snapshots only: never silently drop media on export failure.
const SCBackup = {
  confirm(message) {
    return new Promise(resolve=>SCUI.modal('数据备份与迁移',`<p>${SCUI.escape(message)}</p><div class="sc-dialog-actions"><button id="sc-backup-cancel">取消</button><button id="sc-backup-confirm" class="sc-primary">确认继续</button></div>`,d=>{
      let accepted=false;d.addEventListener('close',()=>resolve(accepted),{once:true});
      d.querySelector('#sc-backup-cancel').onclick=()=>d.close();
      d.querySelector('#sc-backup-confirm').onclick=()=>{accepted=true;d.close();};
    }));
  },
  async encode(value) {
    if (value instanceof Blob) return { __scBlob: true, type: value.type, data: await new Promise((resolve,reject) => { const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.readAsDataURL(value); }) };
    if (Array.isArray(value)) return Promise.all(value.map(v=>this.encode(v)));
    if (value && typeof value === 'object') {
      const out = Object.create(null);
      for (const [k,v] of Object.entries(value)) out[k]=await this.encode(v);
      return out;
    }
    return value;
  },
  decode(value) {
    if (value && value.__scBlob === true) {
      if (typeof value.data !== 'string' || !/^data:[^,]*;base64,/.test(value.data)) throw new Error('媒体内容损坏');
      const raw=atob(value.data.slice(value.data.indexOf(',')+1));
      return new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:String(value.type||'')});
    }
    if (Array.isArray(value)) return value.map(v=>this.decode(v));
    if (value && typeof value==='object') {
      const out=Object.create(null);
      for (const [k,v] of Object.entries(value)) { if (['__proto__','constructor','prototype'].includes(k)) throw new Error('备份包含不允许的字段'); out[k]=this.decode(v); }
      return out;
    }
    return value;
  },
  async snapshot() {
    if (typeof SCChat!=='undefined' && SCChat.busy.size) throw new Error('请等待当前 AI 回复结束再导出');
    const names=Array.from(Storage.db.objectStoreNames).filter(n=>n!=='fontCache');
    const data={version:1,scVersion:1,exportMode:'full',exportedAt:new Date().toISOString(),data:{localStorage:{...localStorage}}};
    await new Promise((resolve,reject)=>{
      const tx=Storage.db.transaction(names,'readonly');
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('快照读取失败'));tx.onerror=()=>{};
      for(const name of names){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{data.data[name]=request.result;};}
    });
    return this.encode(data);
  },
  async exportFile() {
    Storage._showExportWait('正在完整打包（含本地图片与音乐）…');
    try {
      const snapshot=await this.snapshot();
      const blob=new Blob([JSON.stringify(snapshot)],{type:'application/json'});
      const gzip=await Storage.gzipBlob(blob);
      await Storage.downloadBlob(gzip || blob, `SC完整备份_${new Date().toISOString().replace(/[:.]/g,'-')}.json${gzip?'.gz':''}`);
    } finally { Storage._hideExportWait(); }
  },
  validate(input) {
    if (!input || input.version!==1 || !input.data || typeof input.data!=='object') throw new Error('不是支持的备份文件');
    if (input.exportMode && input.exportMode!=='full') throw new Error('请使用完整备份，精简或部分备份不能替换全部数据');
    const data=this.decode(input.data);
    for (const required of ['sessions','messages','characters','album']) if (!Array.isArray(data[required])) throw new Error(`备份缺少 ${required}，为防丢失已停止导入`);
    const names=Array.from(Storage.db.objectStoreNames).filter(n=>n!=='fontCache');
    for (const name of names) {
      if (data[name]===undefined) { data[name]=[]; continue; }
      if (!Array.isArray(data[name])) throw new Error(`${name} 数据格式错误`);
      const seen=new Set(); const key=name==='kv'?'key':'id';
      for (const row of data[name]) {
        if (!row || typeof row[key]!=='string' || !row[key] || seen.has(row[key])) throw new Error(`${name} 包含无效或重复编号`);
        seen.add(row[key]);
      }
    }
    const sessions=new Set(data.sessions.map(s=>s.id));
    for (const row of data.messages) if (!sessions.has(row.sessionId)) throw new Error('消息引用了缺失的会话');
    if (!data.localStorage || typeof data.localStorage!=='object' || Array.isArray(data.localStorage)) throw new Error('缺少完整设置快照');
    for (const v of Object.values(data.localStorage)) if (typeof v!=='string') throw new Error('设置快照格式错误');
    return { data, names };
  },
  async importAll(input) {
    const {data,names}=this.validate(input);
    if (typeof SCChat!=='undefined' && SCChat.busy.size) throw new Error('请等待当前 AI 回复结束再导入');
    ProactiveScheduler.importing=true;
    try {
      await ProactiveScheduler._exclusive(async()=>{
        const before={...localStorage};
        const restoreLS=(values)=>{localStorage.clear(); for(const [k,v] of Object.entries(values)) localStorage.setItem(k,v);};
        // Quota-check localStorage first; roll it back if the single IDB transaction fails.
        try { restoreLS(data.localStorage); }
        catch(e) { restoreLS(before); throw e; }
        try {
          await new Promise((resolve,reject)=>{
            const tx=Storage.db.transaction(names,'readwrite');
            tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error || new Error('导入事务已回滚')); tx.onerror=()=>{};
            try { for (const name of names) { const store=tx.objectStore(name); store.clear(); for(const row of data[name]) store.put(row); } }
            catch(e) { tx.abort(); reject(e); }
          });
        } catch(e) { restoreLS(before); throw e; }
      });
    } finally { ProactiveScheduler.importing=false; }
  }
};
Storage.exportBackupToFile = () => SCBackup.exportFile();
Storage.importAll = data => SCBackup.importAll(data);
Settings.exportData = async () => {
  if (!await SCBackup.confirm('完整备份包含聊天、本地图片、音乐和 API 设置（含密钥）。外链图片仍依赖原网址。请妥善保管，只传给自己的设备。继续？')) return;
  try { await SCBackup.exportFile(); } catch(e) { alert(`完整备份失败，未生成精简替代包：${e.message}`); }
};
Settings.importData = async file => {
  if (!file) return;
  try {
    const input=JSON.parse(await Storage.readImportFileText(file));
    // 增量同步包：合并变化，不清空本机数据；与「完整备份替换」走完全不同的分支
    if (input && input.exportMode === 'delta') {
      if (typeof SCSync === 'undefined') throw new Error('增量同步模块未加载，请在设置里强制刷新后再试');
      const counts=Object.entries(input.data || {})
        .map(([k, rows]) => `${k} ${Array.isArray(rows) ? rows.length : 0}`).join('、') || '无';
      const tombs=Array.isArray(input.tombstones) ? input.tombstones.length : 0;
      if (!await SCBackup.confirm(`这是增量同步包，只把其中的变化合并进本机，不会清空现有数据。包含：${counts}${tombs ? `；删除项 ${tombs}` : ''}。继续？`)) return;
      const r=await SCSync.applyDelta(input);
      alert(`增量合并完成：新增 ${r.added} 项、更新 ${r.updated} 项、删除 ${r.removed} 项`);
      location.reload();
      return;
    }
    const {data}=SCBackup.validate(input);
    if (!await SCBackup.confirm(`将用 ${data.characters.length} 个角色、${data.sessions.length} 个会话、${data.messages.length} 条消息、${data.album.length} 项相册内容替换本设备旧数据。请先导出旧数据留底。继续？`)) return;
    await SCBackup.importAll(input); location.reload();
  } catch(e) { alert(`导入未完成：${e.message}`); }
};

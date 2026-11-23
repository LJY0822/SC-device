/* SC split backup v2: bounded binary volumes, lossless media, staged validation.
 * No record is removed by export. Partial restore never overwrites a live ID.
 */
const SCVolumes = {
  format:'SC-BACKUP-2', busy:false, defaultLimit:20*1024*1024,
  groups:{roles:'角色与设定',chat:'聊天记录',media:'图片与附件',music:'本地音乐',social:'社交与其他内容',settings:'设置与进度'},
  req(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});},
  done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('事务已回滚'));tx.onerror=()=>{};});},
  async temp(name){
    const req=indexedDB.open(name,1);req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('rows',{keyPath:['store','key']});db.createObjectStore('entries',{keyPath:'id'});db.createObjectStore('volumes',{keyPath:'index'});db.createObjectStore('meta');};
    return this.req(req);
  },
  async put(db,store,value,key){const tx=db.transaction(store,'readwrite'),done=this.done(tx);if(key===undefined)tx.objectStore(store).put(value);else tx.objectStore(store).put(value,key);await done;},
  async get(db,store,key){return this.req(db.transaction(store).objectStore(store).get(key));},
  async *rows(db,store){
    let last;
    while(true){const tx=db.transaction(store);const c=await this.req(tx.objectStore(store).openCursor(last===undefined?undefined:IDBKeyRange.lowerBound(last,true)));if(!c)return;last=c.key;yield c.value;}
  },
  async digest(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');},
  classify(store){return ({sessions:'chat',messages:'chat',characters:'roles',masks:'roles',album:'media',tracks:'music',moments:'social',threads:'social',notes:'social',widgetResources:'social',kv:'settings',themes:'settings'})[store]||'settings';},
  measure(value){
    if(value instanceof Blob)return {bytes:value.size,media:value.size};
    if(typeof value==='string'){const m=/^data:[^,]*;base64,/.exec(value);return {bytes:value.length*2,media:m?Math.floor((value.length-m[0].length)*3/4):0};}
    if(!value||typeof value!=='object')return {bytes:16,media:0};
    if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return {bytes:value.byteLength,media:value.byteLength};
    return Object.entries(value).reduce((a,[k,v])=>{const b=this.measure(v);return {bytes:a.bytes+b.bytes+k.length*2,media:a.media+b.media};},{bytes:0,media:0});
  },
  status(text){if(this.statusNode)this.statusNode.textContent=text;},
  channel(tx,name){
    let keep=true;const jobs=[];
    const pump=()=>{if(!keep)return;try{const r=tx.objectStore(name).get('__sc_backup_keepalive__');r.onsuccess=()=>{for(const job of jobs.splice(0)){try{Promise.resolve(job.fn()).then(job.resolve,job.reject);}catch(e){job.reject(e);}}pump();};}catch(e){for(const j of jobs.splice(0))j.reject(e);}};
    tx.addEventListener('abort',()=>{keep=false;for(const j of jobs.splice(0))j.reject(tx.error||Error('事务已中止'));});pump();
    return {run:fn=>new Promise((resolve,reject)=>jobs.push({fn,resolve,reject})),stop:()=>{keep=false;}};
  },
  assertIdle(){if(this.busy)throw Error('已有备份任务正在进行');if(typeof SCChat!=='undefined'&&SCChat.busy.size)throw Error('请等待当前 AI 回复结束');},
  // Keep a readonly transaction alive across bounded staging writes. It provides one
  // consistent IDB snapshot while other tabs' IDB writes wait; no whole-table getAll.
  async snapshot(target,scope='full',sessionId=''){
    const names=Array.from(Storage.db.objectStoreNames).filter(n=>n!=='fontCache');
    const tx=Storage.db.transaction(names,'readonly');const finished=this.done(tx);finished.catch(()=>{});
    const channel=this.channel(tx,names[0]);
    const ls={...localStorage};const counts={},stats={settings:{count:Object.keys(ls).length,bytes:this.measure(ls).bytes,media:this.measure(ls).media}};let read=0;
    try{
      for(const name of names){
        counts[name]=0;let after;
        while(true){
          const c=await channel.run(()=>this.req(tx.objectStore(name).openCursor(after===undefined?undefined:IDBKeyRange.lowerBound(after,true))));if(!c)break;after=c.key;
          const value=c.value,m=this.measure(value),group=this.classify(name);
          stats[group]??={count:0,bytes:0,media:0};stats[group].count++;stats[group].bytes+=m.bytes;stats[group].media+=m.media;
          let include=scope==='full'||group===scope;
          // Keep all configuration and role dependencies; original IDs remain intact.
          if(['chat','media','music','social','roles'].includes(scope)&&['roles','settings'].includes(group))include=true;
          if(scope==='chat'&&sessionId&&group==='chat')include=name==='sessions'?value.id===sessionId:value.sessionId===sessionId;
          if(scope==='media')include=include||m.media>0||name==='sessions';
          if(target&&include){await this.put(target,'rows',{store:name,key:c.primaryKey,value});counts[name]++;}
          if(++read%100===0)this.status(`正在读取 ${name} · ${read} 条（不修改原数据）`);
        }
      }
      if(JSON.stringify({...localStorage})!==JSON.stringify(ls))throw Error('导出期间设置发生变化，请关闭其他标签页后重试');
      channel.stop();await finished;
      const meta={format:this.format,backupId:crypto.randomUUID(),createdAt:new Date().toISOString(),scope,sessionId,stores:names,counts,localStorage:ls,stats};
      if(target)await this.put(target,'meta',meta,'manifest');return meta;
    }catch(e){channel.stop();try{tx.abort();}catch{}throw e;}
  },
  // Typed encoding avoids collisions with fields in old user data.
  async encode(value,emit){
    if(value instanceof Blob){const id=crypto.randomUUID();await emit({id,kind:'asset',mime:value.type},value);return {t:'blob',id,mime:value.type};}
    if(typeof value==='string'&&/^data:[^,]*;base64,/.test(value)){
      const comma=value.indexOf(','),prefix=value.slice(0,comma+1),id=crypto.randomUUID(),raw=value.slice(comma+1),parts=[];
      // Decode in small aligned blocks, never a single huge atob allocation.
      for(let i=0;i<raw.length;i+=65536){const b=atob(raw.slice(i,i+65536));parts.push(Uint8Array.from(b,c=>c.charCodeAt(0)));}
      await emit({id,kind:'asset',mime:prefix.slice(5).split(';')[0]},new Blob(parts));return {t:'dataurl',id,prefix};
    }
    if(value instanceof Date)return {t:'date',v:value.toISOString()};
    if(value instanceof ArrayBuffer){const id=crypto.randomUUID();await emit({id,kind:'asset'},new Blob([value]));return {t:'buffer',id};}
    if(ArrayBuffer.isView(value)){const id=crypto.randomUUID();await emit({id,kind:'asset'},new Blob([value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)]));return {t:'view',id,ctor:value.constructor.name};}
    if(Array.isArray(value)){const v=[];for(const x of value)v.push(await this.encode(x,emit));return {t:'array',v};}
    if(value&&typeof value==='object'){const v=[];for(const [k,x]of Object.entries(value))v.push([k,await this.encode(x,emit)]);return {t:'object',v};}
    if(value===undefined)return {t:'undefined'};
    if(typeof value==='number'&&!Number.isFinite(value))return {t:'number',v:String(value)};
    if(typeof value==='bigint')return {t:'bigint',v:String(value)};
    return {t:'value',v:value};
  },
  async decode(node,db){
    if(!node||typeof node.t!=='string')throw Error('记录编码损坏');
    if(['blob','dataurl','buffer','view'].includes(node.t)){
      const e=await this.get(db,'entries',node.id);if(!e||e.received!==e.total||e.kind!=='asset')throw Error('记录缺少完整附件');const blob=new Blob(e.parts,{type:node.mime||e.mime||''});
      if(node.t==='blob')return blob;
      if(node.t==='dataurl'){const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});return node.prefix+data.slice(data.indexOf(',')+1);}
      const bytes=await blob.arrayBuffer();if(node.t==='buffer')return bytes;
      const allowed={Uint8Array,Uint8ClampedArray,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,DataView};if(!allowed[node.ctor])throw Error('不支持的二进制类型');return new allowed[node.ctor](bytes);
    }
    if(node.t==='array'){const a=[];for(const x of node.v)a.push(await this.decode(x,db));return a;}
    if(node.t==='object'){const o=Object.create(null);for(const [k,x]of node.v)o[k]=await this.decode(x,db);return o;}
    if(node.t==='undefined')return undefined;if(node.t==='date')return new Date(node.v);if(node.t==='bigint')return BigInt(node.v);if(node.t==='number')return Number(node.v);if(node.t==='value')return node.v;throw Error('未知记录编码');
  },
  async build(db,limit=this.defaultLimit){
    const manifest=await this.get(db,'meta','manifest');manifest.volumes=[];let items=[],payload=[],size=0,index=0,kind=null;
    const flush=async()=>{
      if(!items.length)return;
      const header=new TextEncoder().encode(JSON.stringify({format:this.format,backupId:manifest.backupId,index,items}));
      const prefix=new Uint8Array(8);prefix.set([83,67,86,50]);new DataView(prefix.buffer).setUint32(4,header.length,true);
      const blob=new Blob([prefix,header,...payload],{type:'application/octet-stream'}),sha256=await this.digest(blob);
      const filename=`SC_${manifest.backupId}_${String(index+1).padStart(4,'0')}_${kind}.scv`;
      await this.put(db,'volumes',{index,blob,filename});manifest.volumes.push({index,filename,size:blob.size,sha256,kind});index++;items=[];payload=[];size=0;
    };
    const emit=async(meta,blob)=>{
      if(kind&&kind!==meta.kind)await flush();kind=meta.kind;
      let offset=0;
      do{
        // Reserve space for bounded per-volume headers; huge single records split too.
        if(size>=limit-131072||items.length>=200)await flush();
        const length=Math.min(blob.size-offset,limit-131072-size);
        items.push({...meta,offset,total:blob.size,length});payload.push(blob.slice(offset,offset+length));size+=length;offset+=length;
        if(offset<blob.size)await flush();
      }while(offset<blob.size);
    };
    // Separate media and text passes, so a photo in every message does not
    // produce a separate pair of tiny downloadable volumes for each message.
    const collect=async(meta,blob)=>this.put(db,'entries',{...meta,blob});
    let count=0;
    for await(const row of this.rows(db,'rows')){
      const encoded=await this.encode(row.value,collect);const plain=new Blob([JSON.stringify(encoded)]);const zipped=await Storage.gzipBlob(plain);
      await collect({id:crypto.randomUUID(),kind:'row',store:row.store,key:row.key,compression:zipped?'gzip':'none'},zipped||plain);
      if(++count%100===0)this.status(`正在分卷压缩 · ${count} 条记录`);
    }
    // Settings go through typed encoding as well, including embedded images.
    const settings=await this.encode(manifest.localStorage,collect),plain=new Blob([JSON.stringify(settings)]),zipped=await Storage.gzipBlob(plain);
    await collect({id:crypto.randomUUID(),kind:'localStorage',compression:zipped?'gzip':'none'},zipped||plain);
    for(const kind of ['asset','row','localStorage'])for await(const entry of this.rows(db,'entries'))if(entry.kind===kind){const {blob,...meta}=entry;await emit(meta,blob);}
    await flush();
    delete manifest.localStorage;await this.put(db,'meta',manifest,'manifest');return manifest;
  },
  async stageFiles(files){
    const list=Array.from(files),json=list.find(f=>f.name.endsWith('.scmanifest.json'));if(!json)throw Error('请同时选择清单 .scmanifest.json 和全部 .scv 分卷');
    if(json.size>8*1024*1024)throw Error('清单异常大');const m=JSON.parse(await json.text());
    const stores=Array.from(Storage.db.objectStoreNames).filter(n=>n!=='fontCache');
    if(m.format!==this.format||!['full',...Object.keys(this.groups)].includes(m.scope)||typeof m.backupId!=='string'||!Array.isArray(m.volumes)||!m.volumes.length||!Array.isArray(m.stores)||new Set(m.stores).size!==m.stores.length||m.stores.some(n=>!stores.includes(n)))throw Error('清单格式或数据表不兼容');
    if(m.scope==='full'&&stores.some(n=>!m.stores.includes(n)))throw Error('完整备份缺少数据表');
    if(!m.counts||m.stores.some(n=>!Number.isSafeInteger(m.counts[n])||m.counts[n]<0))throw Error('记录数量清单无效');
    if(new Set(list.map(f=>f.name)).size!==list.length||new Set(m.volumes.map(v=>v.filename)).size!==m.volumes.length)throw Error('分卷文件名重复');
    // Verify every volume before preparing any live writes.
    for(let i=0;i<m.volumes.length;i++){const v=m.volumes[i],f=list.find(f=>f.name===v.filename);if(v.index!==i||!f||f.size!==v.size||f.size>64*1024*1024)throw Error(`缺卷或大小错误：${v.filename}`);this.status(`正在校验分卷 ${i+1}/${m.volumes.length}`);if(await this.digest(f)!==v.sha256)throw Error(`校验失败：${v.filename}`);}
    const db=await this.temp('sc-backup-stage-'+crypto.randomUUID());
    try{
      let lsSeen=false;
      for(const v of m.volumes){
        const f=list.find(f=>f.name===v.filename),prefix=new DataView(await f.slice(0,8).arrayBuffer());
        if(prefix.getUint32(0)!==0x53435632)throw Error('分卷标识错误');const length=prefix.getUint32(4,true);if(length>131072||length+8>f.size)throw Error('分卷头损坏');
        const h=JSON.parse(await f.slice(8,8+length).text());if(h.format!==this.format||h.backupId!==m.backupId||h.index!==v.index||!Array.isArray(h.items)||h.items.length>200)throw Error('分卷不属于同一备份');let pos=8+length;
        for(const item of h.items){
          if(!item||typeof item.id!=='string'||!['row','asset','localStorage'].includes(item.kind)||![item.offset,item.total,item.length].every(Number.isSafeInteger)||item.offset<0||item.length<0||item.total<0||item.offset+item.length>item.total||pos+item.length>f.size)throw Error('分片范围无效');
          if(item.kind==='row'&&(!m.stores.includes(item.store)||typeof item.key!=='string'||!item.key))throw Error('记录索引无效');
          let e=await this.get(db,'entries',item.id);
          if(!e){if(item.offset!==0)throw Error('缺少起始分片');e={...item,received:0,parts:[]};}
          if(e.received!==item.offset||['kind','total','store','key','compression','mime'].some(k=>e[k]!==item[k])||e.complete)throw Error('分片重复或顺序错误');
          e.parts.push(f.slice(pos,pos+item.length));e.received+=item.length;pos+=item.length;
          if(e.received===e.total){
            e.complete=true;
            if(e.kind!=='asset'){
              let blob=new Blob(e.parts);if(e.compression==='gzip'){if(typeof DecompressionStream==='undefined')throw Error('浏览器不支持 gzip 解压');blob=await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();}else if(e.compression!=='none')throw Error('压缩方式无效');
              const value=await this.decode(JSON.parse(await blob.text()),db);
              if(e.kind==='localStorage'){if(lsSeen||!value||typeof value!=='object'||Array.isArray(value)||Object.values(value).some(v=>typeof v!=='string'))throw Error('设置快照损坏或重复');await this.put(db,'meta',value,'localStorage');lsSeen=true;}
              else{const key=e.store==='kv'?'key':'id';if(!value||value[key]!==e.key||await this.get(db,'rows',[e.store,e.key]))throw Error('记录编号损坏或重复');await this.put(db,'rows',{store:e.store,key:e.key,value});}
              e.parts=[];
            }
          }
          await this.put(db,'entries',e);
        }
        if(pos!==f.size)throw Error('分卷有未声明内容');
      }
      for await(const e of this.rows(db,'entries'))if(!e.complete)throw Error('存在未完成分片');
      if(!lsSeen)throw Error('缺少设置快照');
      const counts={};for await(const row of this.rows(db,'rows')){counts[row.store]=(counts[row.store]||0)+1;if(row.store==='messages'&&!await this.get(db,'rows',['sessions',row.value.sessionId])&&(m.scope==='full'||!await Storage.dbGet('sessions',row.value.sessionId)))throw Error('消息引用缺失会话');}
      for(const n of m.stores)if((counts[n]||0)!==m.counts[n])throw Error(`${n} 记录数量不符`);
      await this.put(db,'meta',m,'manifest');return {db,manifest:m};
    }catch(e){const name=db.name;db.close();indexedDB.deleteDatabase(name);throw e;}
  },
  async recoveryDB(){return this.temp('sc-backup-recovery-v2');},
  async recover(){
    const db=await this.recoveryDB();try{const pending=await this.get(db,'meta','pending');if(!pending)return;
      const marker=await Storage.kvGet('__sc_backup_commit_v2');
      if(marker?.attemptId!==pending.attemptId)this.restoreLS(pending.before);
      const tx=db.transaction('meta','readwrite'),done=this.done(tx);tx.objectStore('meta').delete('pending');await done;
    }finally{db.close();}
  },
  restoreLS(value){localStorage.clear();for(const [k,v]of Object.entries(value))localStorage.setItem(k,v);},
  async signature(value){
    const hashes=new Map();
    const encoded=await this.encode(value,async(meta,blob)=>{const pieces=[];for(let start=0;start<blob.size;start+=1048576)pieces.push(await this.digest(blob.slice(start,start+1048576)));hashes.set(meta.id,pieces.join(':'));});
    return JSON.stringify(encoded,(key,v)=>key==='id'&&hashes.has(v)?hashes.get(v):v);
  },
  async restore(db,mode='merge'){
    const m=await this.get(db,'meta','manifest'),ls=await this.get(db,'meta','localStorage');if(mode==='replace'&&m.scope!=='full')throw Error('分类备份禁止完整替换');
    const before={...localStorage},recovery=await this.recoveryDB();
    const counts={added:0,same:0,conflicts:0},attemptId=crypto.randomUUID();
    // Save a durable settings rollback journal before changing either storage.
    await this.put(recovery,'meta',{backupId:m.backupId,attemptId,before},'pending');
    const names=Array.from(Storage.db.objectStoreNames).filter(n=>n!=='fontCache');
    const tx=Storage.db.transaction(names,'readwrite'),done=this.done(tx);done.catch(()=>{});let committed=false;
    const channel=this.channel(tx,names[0]);
    try{
      if(mode==='replace')for(const name of names)tx.objectStore(name).clear();
      const conflictIds=new Set();
      // Dependencies first; any dependent incoming record with a conflicting ID is archived.
      const ordered=['characters','masks','sessions',...names.filter(n=>!['characters','masks','sessions'].includes(n))];
      for(const name of ordered){
        let last;
        while(true){const c=await this.req(db.transaction('rows').objectStore('rows').openCursor(last===undefined?IDBKeyRange.bound([name],[name,[]]):IDBKeyRange.bound(last,[name,[]],true)));if(!c)break;last=c.key;const row=c.value,store=tx.objectStore(name),old=mode==='replace'?undefined:await channel.run(()=>this.req(store.get(row.key)));
          const dependencies=name==='sessions'?[...(row.value.participantCharacterIds||[]),row.value.maskId].filter(Boolean):name==='messages'?[row.value.sessionId]:[];
          let conflict=dependencies.some(id=>conflictIds.has(id));
          if(old!==undefined&&!conflict){conflict=await this.signature(old)!==await this.signature(row.value);if(!conflict){counts.same++;continue;}}
          if(conflict){conflictIds.add(row.key);await channel.run(()=>this.req(tx.objectStore('kv').put({key:'__sc_backup_conflict_v2_'+m.backupId+'_'+encodeURIComponent(name)+'_'+encodeURIComponent(row.key),value:{backupId:m.backupId,store:name,key:row.key,incoming:row.value,reason:'保留本机原记录；备份版本留作冲突副本'}})));counts.conflicts++;}
          else{await channel.run(()=>this.req(store.put(row.value)));counts.added++;}
        }
      }
      if(mode==='replace')this.restoreLS(ls);
      else for(const [key,value]of Object.entries(ls)){const old=localStorage.getItem(key);if(old===null)localStorage.setItem(key,value);else if(old!==value){await channel.run(()=>this.req(tx.objectStore('kv').put({key:'__sc_backup_conflict_v2_'+m.backupId+'_localStorage_'+encodeURIComponent(key),value:{store:'localStorage',key,incoming:value}})));counts.conflicts++;}}
      await channel.run(()=>this.req(tx.objectStore('kv').put({key:'__sc_backup_commit_v2',value:{backupId:m.backupId,attemptId}})));
      channel.stop();await done;committed=true;
      const clean=recovery.transaction('meta','readwrite'),cleaned=this.done(clean);clean.objectStore('meta').delete('pending');await cleaned;
      return counts;
    }catch(e){if(committed)return counts;channel.stop();try{tx.abort();}catch{}await done.catch(()=>{});this.restoreLS(before);throw e;}
    finally{recovery.close();}
  },
  async exclusive(fn){
    this.assertIdle();this.busy=true;const old=ProactiveScheduler.importing;ProactiveScheduler.importing=true;
    try{return await ProactiveScheduler._exclusive(fn);}finally{ProactiveScheduler.importing=old;this.busy=false;}
  },
  async open(){
    const esc=SCUI.escape;
    const dialog=await SCUI.modal('分类备份与恢复',`<p>完整分卷保存全部内容；分类备份保留所需角色与设置依赖。图片和音乐无损保存。导出不改变原数据。操作期间请关闭其他 SC 标签页并保持此页前台。</p><div id="scv-stats"></div><label>导出内容<select id="scv-scope"><option value="full">完整分卷备份（推荐迁移）</option>${Object.entries(this.groups).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>聊天会话<select id="scv-session"><option value="">全部会话</option></select></label><label>每卷目标大小<select id="scv-limit"><option value="10">10 MB</option><option value="20" selected>20 MB</option><option value="50">50 MB</option></select></label><p>媒体分类包含附件所属记录和必要会话；分类包不是脱离原记录的图片集合。API 设置含密钥，请妥善保存。</p><div class="sc-dialog-actions"><button id="scv-analyze">统计容量</button><button id="scv-export" class="sc-primary">生成分卷</button></div><p id="scv-status" role="status" aria-live="polite"></p><div id="scv-files"></div><hr><p>恢复时同时选择清单与全部分卷。默认合并：原记录不覆盖，冲突版本另存于本机 KV 备份区。完整替换只接受完整分卷包。</p><label>恢复方式<select id="scv-mode"><option value="merge">安全合并，不覆盖原记录</option><option value="replace">完整替换（需要完整备份）</option></select></label><input id="scv-import" type="file" multiple accept=".scv,.json"><p>旧版 .json / .json.gz 完整备份仍从原“导入数据”入口恢复。</p>`);
    const body=dialog.querySelector('.sc-dialog-body');body.style.cssText='display:grid;gap:14px';
    body.querySelectorAll('label').forEach(e=>e.style.cssText='display:grid;gap:8px;font-size:14px');
    body.querySelectorAll('select,input[type=file]').forEach(e=>e.style.cssText='display:block;width:100%;min-height:44px;padding:10px;border:1px solid var(--sc-line);border-radius:10px;font:inherit;background:var(--sc-soft);color:inherit');
    this.statusNode=dialog.querySelector('#scv-status');let activeDB=null,dirty=false;
    const setBusy=v=>{dirty=v;dialog.querySelectorAll('button,select,input').forEach(e=>e.disabled=v);if(!v)dialog.querySelector('#scv-session').disabled=dialog.querySelector('#scv-scope').value!=='chat';};
    dialog.addEventListener('cancel',e=>{if(dirty)e.preventDefault();});
    dialog.addEventListener('close',()=>{this.statusNode=null;if(activeDB){const name=activeDB.name;activeDB.close();indexedDB.deleteDatabase(name);}});
    for await(const s of this.rows(Storage.db,'sessions'))dialog.querySelector('#scv-session').add(new Option(s.title||s.id,s.id));
    dialog.querySelector('#scv-scope').onchange=e=>dialog.querySelector('#scv-session').disabled=e.target.value!=='chat';dialog.querySelector('#scv-session').disabled=true;
    dialog.querySelector('#scv-analyze').onclick=async()=>{setBusy(true);try{await this.exclusive(async()=>{const m=await this.snapshot(null),space=await navigator.storage?.estimate?.();dialog.querySelector('#scv-stats').innerHTML='<table style="width:100%;font-size:12px;text-align:left"><tr><th>类别</th><th>条数</th><th>估算体积</th></tr>'+Object.entries(m.stats).map(([k,v])=>`<tr><td>${esc(this.groups[k])}</td><td>${v.count}</td><td>${(v.bytes/1048576).toFixed(1)} MB</td></tr>`).join('')+'</table><p>体积为逐条估算，不是压缩后大小。设置统计包含 localStorage，不会展示密钥内容。</p>'+(space?`<p>本站浏览器空间：已用 ${(space.usage/1048576).toFixed(1)} MB / 配额 ${(space.quota/1048576).toFixed(1)} MB。分卷会临时使用额外空间，关闭窗口后释放。</p>`:'');this.status('容量统计完成。');});}catch(e){this.status(e.message);}finally{setBusy(false);}};
    dialog.querySelector('#scv-export').onclick=async()=>{
      const scope=dialog.querySelector('#scv-scope').value,session=dialog.querySelector('#scv-session').value,limit=Number(dialog.querySelector('#scv-limit').value)*1048576;
      setBusy(true);
      try{await this.exclusive(async()=>{
        if(activeDB){const name=activeDB.name;activeDB.close();indexedDB.deleteDatabase(name);activeDB=null;}
        const files=dialog.querySelector('#scv-files');files.replaceChildren();activeDB=await this.temp('sc-backup-export-'+crypto.randomUUID());
        await this.snapshot(activeDB,scope,scope==='chat'?session:'');const m=await this.build(activeDB,limit);
        const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='display:block;width:100%;margin:8px 0;text-align:left';b.onclick=async()=>{try{await fn();b.dataset.requested='true';b.textContent=label+' · 已请求保存（请检查下载目录）';}catch(e){this.status('保存失败，可重试：'+e.message);}};files.append(b);};
        add('保存备份清单',()=>Storage.downloadBlob(new Blob([JSON.stringify(m)],{type:'application/json'}),`SC_${m.backupId}.scmanifest.json`));
        for(const v of m.volumes)add(`保存第 ${v.index+1}/${m.volumes.length} 卷 · ${(v.size/1048576).toFixed(1)} MB · ${v.kind==='asset'?'原始媒体':'文字与设置'}`,async()=>{const saved=await this.get(activeDB,'volumes',v.index);await Storage.downloadBlob(saved.blob,saved.filename);});
        this.status(`生成成功：${m.volumes.length} 卷。请逐个保存清单和全部分卷，浏览器无法保证文件已落盘，请核对下载目录。关闭窗口将释放临时副本。`);
      });}catch(e){this.status('导出未完成，原数据未改动：'+e.message);}finally{setBusy(false);}
    };
    dialog.querySelector('#scv-import').onchange=async e=>{
      if(!e.target.files.length)return;const files=Array.from(e.target.files),mode=dialog.querySelector('#scv-mode').value;setBusy(true);let staged;
      try{await this.exclusive(async()=>{staged=await this.stageFiles(files);const m=staged.manifest;
        if(!await SCBackup.confirm(`全部 ${m.volumes.length} 卷校验通过。${mode==='replace'?'将替换本机全部内容，请确保已保存当前备份。':'将补入缺失记录，冲突版本另存，不覆盖原记录。'}继续？`))return;
        const r=await this.restore(staged.db,mode);this.status(`恢复完成：写入 ${r.added}，相同跳过 ${r.same}，冲突留存 ${r.conflicts}。请重新加载页面后使用。`);
      });}catch(err){this.status('恢复未完成：'+err.message);}finally{if(staged){const name=staged.db.name;staged.db.close();indexedDB.deleteDatabase(name);}setBusy(false);e.target.value='';}
    };
    const cleanup=document.createElement('button');cleanup.textContent='清理中断后遗留的临时备份';body.append(cleanup);
    cleanup.onclick=async()=>{
      if(!indexedDB.databases){this.status('此浏览器不支持列出临时数据库。请勿通过清除站点数据清理，以免删除原记录。');return;}
      if(!await SCBackup.confirm('只清理临时分卷和恢复暂存，不删除聊天、图片、设置、冲突副本或恢复日志。请先保存已生成文件并关闭其他 SC 标签页；清理后当前分卷需重新生成。继续？'))return;
      setBusy(true);
      try{await this.exclusive(async()=>{
        if(activeDB){activeDB.close();activeDB=null;dialog.querySelector('#scv-files').replaceChildren();}
        const names=(await indexedDB.databases()).map(d=>d.name).filter(n=>n&&(n.startsWith('sc-backup-export-')||n.startsWith('sc-backup-stage-')));
        for(const name of names)await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('其他标签页仍在使用临时备份，请关闭后重试'));});
        this.status(`已清理 ${names.length} 个临时备份库，原数据未改动。`);
      });}catch(e){this.status(e.message);}finally{setBusy(false);}
    };
  }
};
// Preserve the legacy export as an explicit compatibility option.
const scLegacyExport=Settings.exportData.bind(Settings);
Settings.exportData=()=>SCUI.modal('备份方式','<p>手机大数据建议使用分类分卷，避免一次展开全部图片和音乐。</p><div class="sc-dialog-actions"><button id="scv-open" class="sc-primary">分类 / 分卷 / 恢复</button><button id="scv-legacy">旧版完整压缩包</button></div>',d=>{d.querySelector('#scv-open').onclick=()=>{d.close();SCVolumes.open();};d.querySelector('#scv-legacy').onclick=()=>{d.close();scLegacyExport();};});

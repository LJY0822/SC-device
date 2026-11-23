/* Shared character context, model service, game directory and host bridge. */
const SCRecreation={
  titles:{naval:'海上对弈',holdem:'德州扑克',gomoku:'五子棋',mastermind:'代码破解',miner:'双人黄金矿工'},context:null,audits:[],
  async prompts(){return this.templates??=(async()=>{const r=await fetch('prompts/game-prompts.json');if(!r.ok)throw Error('提示词文件无法加载');return r.json();})();},
  resolveApi(actor=null){
    const cfg=typeof SCChat!=='undefined'?SCChat.configFor(actor):{apiKey:Storage.get(CONFIG.STORAGE_KEYS.API_KEY),baseUrl:Storage.get(CONFIG.STORAGE_KEYS.BASE_URL),model:Storage.get(CONFIG.STORAGE_KEYS.API_MODEL)};
    const base=String(cfg.baseUrl||'https://api.openai.com/v1').trim().replace(/\/+$/,'').replace(/\/chat\/completions$/i,'');
    return {...cfg,baseUrl:base,model:cfg.model||'gpt-3.5-turbo'};
  },
  configured(roles=this.context?.roles||[]){return (roles.length?roles:[null]).some(r=>{try{return !!this.resolveApi(r).apiKey;}catch{return false;}});},
  timeout(kind='scene'){return kind==='scene'?Math.min(180000,Chat._getApiChatTimeoutMs()):Math.min(90000,Chat._getApiChatTimeoutMs());},
  async request(messages,signal,actor=null){
    const cfg=this.resolveApi(actor);if(!cfg.apiKey)throw Error('所选角色和全局设置都没有可用的文字 API');
    const stream=Chat._isApiStreamEnabled(),max=Chat._getApiMaxTokensForRequest();
    const payload={model:cfg.model,messages,stream,temperature:Chat._getApiTemperatureForRequest(),...(max?{max_tokens:max}:{})};
    try{
      const response=await fetch(cfg.baseUrl+'/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+String(cfg.apiKey).trim()},body:JSON.stringify(payload)});
      const streamed=/text\/event-stream/i.test(response.headers.get('content-type')||'');
      const data=await Chat._parseChatCompletionsResponse(response,streamed);
      const text=Chat._normalizeApiContent(data.choices?.[0]?.message?.content);
      if(!text.trim())throw Error(data.choices?.[0]?.finish_reason==='length'?'模型输出被截断，请提高主聊天的输出长度':'模型未返回正文（可能只有推理内容），请重试或调整模型');
      return text;
    }catch(e){if(signal?.aborted)throw Error('请求已取消或等待超时，可重试或使用本地开局');throw Error(String(e.message||e).split(String(cfg.apiKey)).join('[已隐藏密钥]'));}
  },
  parseObject(raw){
    const text=String(raw).replace(/<think>[\s\S]*?<\/think>/gi,'').trim().replace(/^```(?:json)?\s*|\s*```$/g,'');
    try{const obj=JSON.parse(text);if(obj&&typeof obj==='object'&&!Array.isArray(obj))return obj;}catch{}
    const start=text.indexOf('{');let depth=0,quote=false,escape=false;
    for(let i=start;i>=0&&i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;}else if(c==='"')quote=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){try{return JSON.parse(text.slice(start,i+1));}catch{break;}}}
    throw Error('模型没有返回完整的场景 JSON；可重试，或在调用记录中检查状态');
  },
  async json(template,input,signal){
    const templates=await this.prompts();if(!templates[template])throw Error('未知提示词模板');
    const actorInput=input.role||input.roles?.find(r=>{try{return !!this.resolveApi(r).apiKey;}catch{return false;}})||input.roles?.[0];
    const actor=actorInput?.id?await Storage.dbGet('characters',actorInput.id)||actorInput:actorInput;
    const cfg=this.resolveApi(actor),messages=[{role:'system',content:templates[template]},{role:'user',content:JSON.stringify(input)}];
    const audit={at:Date.now(),template,model:cfg.model,actor:actorInput?.name||'全局配置',status:'pending',messages};this.audits.push(audit);this.audits=this.audits.slice(-20);
    try{const raw=await this.request(messages,signal,actor);const result=this.parseObject(raw);audit.status='success';audit.durationMs=Date.now()-audit.at;return result;}
    catch(e){audit.status=signal?.aborted?'cancelled':'error';audit.error=e.message;audit.durationMs=Date.now()-audit.at;throw e;}
  },
  async recent(sessionId){
    if(!sessionId)return [];
    return new Promise((resolve,reject)=>{
      const rows=[],r=Storage.db.transaction('messages','readonly').objectStore('messages').index('sessionId').openCursor(IDBKeyRange.only(sessionId));
      r.onerror=()=>reject(r.error);r.onsuccess=()=>{const cursor=r.result;if(!cursor){resolve(rows.reverse().map(m=>({role:m.role,text:m.text})));return;}
        const m=cursor.value;if(['user','assistant'].includes(m.role)&&typeof m.content==='string'){
          rows.push({id:String(m.id),role:m.role,text:m.content.slice(0,1200),at:Number(m.createdAt)||Date.parse(m.createdAt)||0});
          rows.sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id));if(rows.length>10)rows.pop();
        }cursor.continue();};
    });
  },
  async directory(){
    return SCUI.modal('游戏',`<p>选择一种游戏，与角色开始或继续。对局数据与聊天分开保存。</p><div class="sc-game-directory">${Object.entries(this.titles).map(([id,name])=>`<button data-game="${id}"><img class="directory-sticker" src="assets/game-stickers/${id}-thumb-v1.webp" alt="" decoding="async"><span><strong>${name}</strong><small>${{naval:'8 × 8 海域 · 与一位角色交手',holdem:'2–4 人 · SC Chips 虚拟计分',gomoku:'15 × 15 · 本地棋类对手',mastermind:'猜测与反馈 · 可交换出题身份',miner:'双人实时 · 竞争或合作'}[id]}</small></span></button>`).join('')}</div>`,d=>{d.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{d.close();this.select(b.dataset.game);});});
  },
  async select(game){
    const chars=await Storage.dbGetAll('characters'),sessions=(await Storage.dbGetAll('sessions')).sort((a,b)=>(Number(b.updatedAt||b.createdAt)||0)-(Number(a.updatedAt||a.createdAt)||0));const esc=SCUI.escape;
    await SCUI.modal(this.titles[game]+' · 选择角色',`<p>${game==='holdem'?'选择1至3位角色，共2至4人入座。':'选择一位对手。'}生成开局时只读取所选会话最近十条文字、人设及对应游戏摘要，不写入 COMMS。</p><div id="sc-game-roster">${chars.map(c=>`<label class="sc-game-choice"><input type="${game==='holdem'?'checkbox':'radio'}" name="game-character" value="${esc(c.id)}">${esc(c.name||'未命名角色')}<select data-role="${esc(c.id)}"><option value="">不读取聊天情境</option>${sessions.filter(s=>s.participantCharacterIds?.length===1&&s.participantCharacterIds[0]===c.id).map(s=>`<option value="${esc(s.id)}" ${s.id===(Chat.currentSessionId&&sessions.some(v=>v.id===Chat.currentSessionId&&v.participantCharacterIds?.[0]===c.id)?Chat.currentSessionId:sessions.find(v=>v.participantCharacterIds?.length===1&&v.participantCharacterIds[0]===c.id)?.id)?'selected':''}>${esc(s.title||'角色会话')}</option>`).join('')}</select></label>`).join('')||'<p>请先在角色页面建立角色卡。</p>'}</div><p id="sc-game-select-error" role="status"></p><button id="sc-game-enter" class="sc-primary">进入游戏</button>`,d=>{
      d.querySelector('#sc-game-enter').onclick=async()=>{const button=d.querySelector('#sc-game-enter');button.disabled=true;try{const ids=[...d.querySelectorAll('input:checked')].map(e=>e.value);if(!ids.length||ids.length>(game==='holdem'?3:1))throw Error('请选择正确数量的角色');const roles=[];for(const id of ids){const c=Character.normalizeCard(chars.find(c=>c.id===id)),select=[...d.querySelectorAll('select')].find(e=>e.dataset.role===id);roles.push({id,name:c.name,description:(c.description||'').slice(0,8000),scApiPresetId:chars.find(v=>v.id===id)?.scApiPresetId||null,sessionTitle:select.selectedOptions[0]?.textContent||'',avatar:Chat._sanitizeAvatarSrc(c.avatar||''),sessionId:select.value,recent:await this.recent(select.value)});}
      const maskId=Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID),mask=maskId?await Storage.dbGet('masks',maskId):null;this.context={game,roles,user:{id:'user',name:'你',persona:mask?.name||'',avatar:Chat._sanitizeAvatarSrc(mask?.avatar||'')},key:game+'_'+roles.map(r=>r.id+'@'+r.sessionId).join('_'),night:document.documentElement.dataset.scMode==='night',configured:this.configured(roles)};d.close();this.mount(game);}catch(e){d.querySelector('#sc-game-select-error').textContent=e.message;button.disabled=false;}};
    });
  },
  mount(game){const shell=document.createElement('div');shell.className='sc-game-host';shell.style.cssText='position:fixed;inset:0;z-index:10000;background:#f6f7f8';const frame=document.createElement('iframe');frame.title=this.titles[game];frame.src='games/recreation/index.html?game='+game;frame.style.cssText='width:100%;height:100%;border:0';shell.append(frame);document.body.append(shell);const leave=()=>{frame.contentWindow.SCGamePage?.pause();frame.contentWindow.SCGamePage?.destroy();shell.remove();this.context=null;window.removeEventListener('popstate',leave);};history.pushState({scGame:game},'');window.addEventListener('popstate',leave,{once:true});},
  leave(){history.back();},
  openLegacyNaval(){SCNaval.open();},
  read(key){return Storage.kvGet(key);},write(key,value){return Storage.kvSet(key,value);},
  async generate(input,signal){return this.json('match',input,signal);},
  async beat(input,closing,signal){return this.json(closing?'closing':'event',input,signal);}
};
window.SCGameHost=SCRecreation;

/* Shared character context, model service, game directory and host bridge. */
const SCRecreation={
  titles:{holdem:'德州扑克',gomoku:'五子棋',mastermind:'代码破解',miner:'双人黄金矿工'},context:null,audits:[],
  async prompts(){return this.templates??=(async()=>{const r=await fetch('prompts/game-prompts.json');if(!r.ok)throw Error('提示词文件无法加载');return r.json();})();},
  async request(messages,signal){
    const apiKey=Storage.get(CONFIG.STORAGE_KEYS.API_KEY);if(!apiKey)throw Error('未配置文字 API，将使用本地模式');
    const baseUrl=(Storage.get(CONFIG.STORAGE_KEYS.BASE_URL)||'https://api.openai.com/v1').replace(/\/$/,'');
    const response=await fetch(baseUrl+'/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify({model:Storage.get(CONFIG.STORAGE_KEYS.API_MODEL)||'gpt-3.5-turbo',messages,stream:false})});
    if(!response.ok)throw Error('模型服务请求失败：'+response.status);const data=await response.json();return data.choices?.[0]?.message?.content||'';
  },
  async json(template,input,signal){const templates=await this.prompts();if(!templates[template])throw Error('未知提示词模板');const messages=[{role:'system',content:templates[template]},{role:'user',content:JSON.stringify(input)}];this.audits.push({at:Date.now(),template,messages});this.audits=this.audits.slice(-20);const raw=await this.request(messages,signal);return JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));},
  async recent(sessionId){if(!sessionId)return [];return new Promise((resolve,reject)=>{const out=[],r=Storage.db.transaction('messages').objectStore('messages').index('sessionId').openCursor(IDBKeyRange.only(sessionId),'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c||out.length===10){resolve(out.reverse());return;}const m=c.value;if(['user','assistant'].includes(m.role)&&typeof m.content==='string')out.push({role:m.role,text:m.content.slice(0,1000)});c.continue();};});},
  async directory(){
    return SCUI.modal('游戏',`<p>选择一种游戏，与角色开始或继续。对局数据与聊天分开保存。</p><div class="sc-game-directory"><button data-game="naval"><strong>海上对弈</strong><small>8 × 8 海域 · 与一位角色交手</small></button>${Object.entries(this.titles).map(([id,name])=>`<button data-game="${id}"><strong>${name}</strong><small>${{holdem:'2–4 人 · SC Chips 虚拟计分',gomoku:'15 × 15 · 本地棋类对手',mastermind:'猜测与反馈 · 可交换出题身份',miner:'双人实时 · 竞争或合作'}[id]}</small></button>`).join('')}</div>`,d=>{d.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{d.close();b.dataset.game==='naval'?SCNaval.open():this.select(b.dataset.game);});});
  },
  async select(game){
    const chars=await Storage.dbGetAll('characters'),sessions=await Storage.dbGetAll('sessions');const esc=SCUI.escape;
    await SCUI.modal(this.titles[game]+' · 选择角色',`<p>${game==='holdem'?'选择1至3位角色，共2至4人入座。':'选择一位对手。'}生成开局时只读取所选会话最近十条文字、人设及对应游戏摘要，不写入 COMMS。</p><div id="sc-game-roster">${chars.map(c=>`<label class="sc-game-choice"><input type="${game==='holdem'?'checkbox':'radio'}" name="game-character" value="${esc(c.id)}">${esc(c.name||'未命名角色')}<select data-role="${esc(c.id)}"><option value="">不读取聊天情境</option>${sessions.filter(s=>s.participantCharacterIds?.length===1&&s.participantCharacterIds[0]===c.id).map(s=>`<option value="${esc(s.id)}">${esc(s.title||'角色会话')}</option>`).join('')}</select></label>`).join('')||'<p>请先在角色页面建立角色卡。</p>'}</div><p id="sc-game-select-error" role="status"></p><button id="sc-game-enter" class="sc-primary">进入游戏</button>`,d=>{
      d.querySelector('#sc-game-enter').onclick=async()=>{const button=d.querySelector('#sc-game-enter');button.disabled=true;try{const ids=[...d.querySelectorAll('input:checked')].map(e=>e.value);if(!ids.length||ids.length>(game==='holdem'?3:1))throw Error('请选择正确数量的角色');const roles=[];for(const id of ids){const c=Character.normalizeCard(chars.find(c=>c.id===id)),select=[...d.querySelectorAll('select')].find(e=>e.dataset.role===id);roles.push({id,name:c.name,description:(c.description||'').slice(0,8000),avatar:Chat._sanitizeAvatarSrc(c.avatar||''),sessionId:select.value,recent:await this.recent(select.value)});}
      const maskId=Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID),mask=maskId?await Storage.dbGet('masks',maskId):null;this.context={game,roles,user:{id:'user',name:'你',persona:mask?.name||'',avatar:Chat._sanitizeAvatarSrc(mask?.avatar||'')},key:game+'_'+roles.map(r=>r.id+'@'+r.sessionId).join('_'),night:document.documentElement.dataset.scMode==='night',configured:!!Storage.get(CONFIG.STORAGE_KEYS.API_KEY)};d.close();this.mount(game);}catch(e){d.querySelector('#sc-game-select-error').textContent=e.message;button.disabled=false;}};
    });
  },
  mount(game){const shell=document.createElement('div');shell.className='sc-game-host';shell.style.cssText='position:fixed;inset:0;z-index:10000;background:#f6f7f8';const frame=document.createElement('iframe');frame.title=this.titles[game];frame.src='games/recreation/index.html?game='+game;frame.style.cssText='width:100%;height:100%;border:0';shell.append(frame);document.body.append(shell);const leave=()=>{frame.contentWindow.SCGamePage?.pause();frame.contentWindow.SCGamePage?.destroy();shell.remove();this.context=null;window.removeEventListener('popstate',leave);};history.pushState({scGame:game},'');window.addEventListener('popstate',leave,{once:true});},
  leave(){history.back();},
  read(key){return Storage.kvGet(key);},write(key,value){return Storage.kvSet(key,value);},
  configured(){return !!Storage.get(CONFIG.STORAGE_KEYS.API_KEY);},
  async generate(input,signal){return this.json('match',input,signal);},
  async beat(input,closing,signal){return this.json(closing?'closing':'event',input,signal);}
};
window.SCGameHost=SCRecreation;

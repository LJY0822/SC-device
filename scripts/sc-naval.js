// Separate game storage and public-only model context. No chat records are written.
const SCNaval = {
  async open() {
    const sessions=(await Storage.dbGetAll('sessions')).filter(s=>s.participantCharacterIds?.length===1);
    const box=document.createElement('dialog');box.style.cssText='max-width:440px;width:90%;padding:24px;border-radius:12px;background:var(--bg-primary,#eee);color:var(--text-primary,#222)';
    const title=document.createElement('h2');title.textContent='游戏 · 海战棋';
    const label=document.createElement('p');label.textContent='选择对手会话（每个会话独立续存）。生成场景时会向文字 API 发送该会话最近十条文字与角色人设。';
    const select=document.createElement('select');select.style.cssText='width:100%;padding:12px';
    for(const session of sessions){const card=await Storage.dbGet('characters',session.participantCharacterIds[0]);if(!card)continue;const opt=new Option(session.title||card.name,session.id);select.add(opt);}
    if(Chat.currentSessionId)select.value=Chat.currentSessionId;
    const start=document.createElement('button');start.textContent='进入海战棋';start.disabled=!select.options.length;
    const cancel=document.createElement('button');cancel.textContent='返回';cancel.onclick=()=>box.close();
    box.append(title,label,select,start,cancel);document.body.append(box);box.addEventListener('close',()=>box.remove());box.showModal();
    start.onclick=async()=>{
      start.disabled=true;
      try{
        const session=sessions.find(s=>s.id===select.value);
        const character=Character.normalizeCard(await Storage.dbGet('characters',session.participantCharacterIds[0]));
        const messages=await new Promise((resolve,reject)=>{const req=Storage.db.transaction('messages','readonly').objectStore('messages').index('sessionId').getAll(session.id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        const recent=messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').sort((a,b)=>(Number(a.createdAt)||0)-(Number(b.createdAt)||0)).slice(-10).map(m=>({role:m.role,text:m.content.slice(0,1000)}));
        window.SCNavalContext={sessionId:session.id,recent,character:{name:character.name,description:character.description||''},night:document.documentElement.dataset.scMode==='night'};
        box.close();this.mount();
      }catch{start.disabled=false;label.textContent='会话读取失败，请重试。';}
    };
  },
  mount(){
    const shell=document.createElement('div');shell.style.cssText='position:fixed;inset:0;z-index:10000;background:#11191a;display:flex;flex-direction:column';
    const back=document.createElement('button');back.textContent='‹ 返回游戏';back.style.cssText='min-height:44px;padding-top:env(safe-area-inset-top);background:transparent;color:inherit;border:0;text-align:left;font:15px Arial,Microsoft YaHei,sans-serif';
    const frame=document.createElement('iframe');frame.title='海战棋';frame.src='games/naval/index.html';frame.style.cssText='flex:1;min-height:0;width:100%;border:0';
    shell.dataset.navalShell='true';shell.style.background=SCNavalContext.night?'#1d2420':'#fff';shell.style.color=SCNavalContext.night?'#e8ecdf':'#202329';
    const leave=()=>{frame.contentWindow.SCNavalGame?.pause();shell.remove();window.removeEventListener('popstate',leave);};
    back.onclick=()=>history.back();history.pushState({naval:true},'');window.addEventListener('popstate',leave,{once:true});shell.append(back,frame);document.body.append(shell);
  },
  async request(messages,signal){
    const apiKey=Storage.get(CONFIG.STORAGE_KEYS.API_KEY);
    if(!apiKey)throw Error('未配置文字 API');
    const baseUrl=(Storage.get(CONFIG.STORAGE_KEYS.BASE_URL)||'https://api.openai.com/v1').replace(/\/$/,'');
    const response=await fetch(baseUrl+'/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify({model:Storage.get(CONFIG.STORAGE_KEYS.API_MODEL),messages,stream:false})});
    if(!response.ok)throw Error('模型服务请求失败');
    const data=await response.json();return data.choices?.[0]?.message?.content||'';
  },
  async generateBeat(event,{signal}){
    const c=window.SCNavalContext.character;
    const raw=await this.request([{role:'system',content:`扮演${c.name}。人设：${c.description.slice(0,8000)}。正在与玩家下海战棋。只依据公开信息写1至3句中文动作或对白，不落子、不改判。仅返回JSON {"text":"正文","inviteRematch":false}。仅closing可以邀请再战，是否邀请由你决定。`},{role:'user',content:JSON.stringify(event)}],signal);
    return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));
  },
  async generateScene(context){
    const c=window.SCNavalContext.character;
    const raw=await this.request([{role:'system',content:`为${c.name}与玩家下海战棋写一段不超过250字的开局场景，保持角色人设：${c.description.slice(0,4000)}。只返回JSON {"text":"场景正文"}。不要写落子或胜负。`},{role:'user',content:JSON.stringify({recent:window.SCNavalContext.recent,context:context||'延续最近情景，两人准备开始。'})}],AbortSignal.timeout(15000));
    const result=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));if(typeof result.text!=='string'||!result.text.trim())throw Error('场景为空');return result;
  }
};

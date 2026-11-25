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
        const recent=await SCRecreation.recent(session.id);
        window.SCNavalContext={sessionId:session.id,recent,character:{name:character.name,description:String(character.description||'').slice(0,8000)},night:document.documentElement.dataset.scMode==='night'};
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
  async request(messages,signal){return SCRecreation.request(messages,signal);},
  async generateBeat(event,{signal}){
    const c=window.SCNavalContext.character;
    return SCRecreation.json('navalEvent',{role:c,event},signal);
  },
  async generateScene(context){
    const c=window.SCNavalContext.character;
    const result=await SCRecreation.json('navalScene',{role:c,sessionId:window.SCNavalContext.sessionId,recent:window.SCNavalContext.recent,context:context||'延续最近情景，两人准备开始。'},AbortSignal.timeout(15000));
    if(typeof result.text!=='string'||!result.text.trim())throw Error('场景为空');return result;
  }
};

'use strict';
const GameFramework={
  version:1,host:window.parent!==window?window.parent.SCGameHost:null,
  titles:{naval:'海上对弈',holdem:'德州扑克',gomoku:'五子棋',mastermind:'代码破解',miner:'双人黄金矿工'},
  routes:{navalTurn:'PRESET',start:'PRESET',fold:'PRESET',raise:'PRESET',bigRaise:'LLM',allin:'LLM',bluff:'LLM',street:'PRESET',showdown:'LLM',threat:'PRESET',critical:'LLM',defend:'PRESET',feedback:'PRESET',breakthrough:'LLM',low:'LLM',collect:'PRESET',pause:'PRESET',return:'PRESET',reply:'LLM',closing:'LLM'},
  presets:{navalTurn:'“落点记下了，继续吧。”',start:'“我已经打开通讯终端，准备好就开始。”',fold:'“这手我弃牌，等下一轮。”',raise:'“你的下注额我看到了。”',bigRaise:'“这次加注不小，我得认真想想。”',allin:'“全下？这手得认真对待。”',bluff:'结算结束后，才开口复盘刚才公开的下注。',street:'视线落到新翻开的公共牌上。',showdown:'看清摊牌结果，点头记下这一手。',threat:'目光沿着刚刚形成的连线停了一下。',critical:'“我重新看一遍局面。”',defend:'“轮到你了。”',feedback:'把这轮反馈记下来，和之前的尝试对照。',breakthrough:'轻轻点了点新出现的反馈，神情专注起来。',low:'看了眼剩余的机会，重新集中精神。',collect:'看向刚刚收回的矿物，向你点了点头。',pause:'停下手上的动作，把当前进度留在原处。',return:'“回来了，继续刚才的对局吧。”',reply:'听完你的话，点点头，把注意力放回游戏。',closing:'“结算结果看到了，今天就记到这里。”'},
  clamp(v,fallback=.5){return Number.isFinite(v)?Math.max(0,Math.min(1,v)):fallback;},
  artIds:['duty','bar','train','tent','mess','dark'],
  inferArt(text){return /列车|车厢|地铁|末班车|火车/.test(text)?'train':/停电|熄灯|黑暗|暗处/.test(text)?'dark':/帐篷|营地|野营/.test(text)?'tent':/酒吧|酒馆|吧台|散场/.test(text)?'bar':/餐厅|食堂|午餐|餐盘/.test(text)?'mess':'duty';},
  art(id,thumb=false){return '../../assets/game-stickers/'+id+(thumb?'-thumb-v1.webp':'-v1.webp');},
  async read(key){return this.host?this.host.read(key):JSON.parse(localStorage.getItem(key)||'null');},
  async write(key,value){if(this.host)return this.host.write(key,value);localStorage.setItem(key,JSON.stringify(value));},
  async context(game){const source=this.host?.context;if(source?.game===game)return structuredClone(source);return {game,roles:[{id:'offline',name:'对手',description:'沉着、愿意认真陪玩家完成游戏。',recent:[],sessionId:''}],user:{id:'user',name:'你'},key:game+'_offline',night:false,configured:false};},
  async persona(role){const key='sc_game_persona_v1_'+role.id;let fixed=await this.read(key);if(!fixed){let n=2166136261;for(const c of role.id+role.description)n=Math.imul(n^c.charCodeAt(0),16777619);const base=.25+((n>>>0)%50)/100;fixed={aggression:/激进|冲动|aggress/i.test(role.description)?.85:base,risk:/谨慎|稳健|cautious/i.test(role.description)?.2:.85-base*.5,bluff:.15+base*.45,patience:1-base,observation:.4+base*.5,control:/冷静|沉着|calm/i.test(role.description)?.9:.5,reaction:base,value:.5+base*.4,weight:.5,timing:.4+base*.5,special:base};await this.write(key,fixed);}return fixed;},
  async scene(context,config,signal){if(!this.host||!this.host.configured(context.roles))throw Error('没有配置文字 API，使用本地开局');return this.host.generate({game:context.game,roles:context.roles,user:context.user,config},signal);},
  normalizeScene(result,context){const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';const sceneText=typeof result.scene==='string'?result.scene:result.scene?.text||result.scene?.description||result.narrative||result.text; if(!clean(sceneText,900))throw Error('场景格式无效');const presets={};for(const type of Object.keys(this.presets))if(clean(result.presets?.[type],300))presets[type]=clean(result.presets[type],300);const personalities={};for(const r of context.roles){const row=Array.isArray(result.personalities)?result.personalities.find(p=>p.id===r.id):result.personalities?.[r.id];if(row){const p={};for(const k of Object.keys(r.personality))p[k]=this.clamp(row[k],r.personality[k]);personalities[r.id]=p;}}return {artId:this.artIds.includes(result.artId)?result.artId:this.inferArt(sceneText),title:clean(result.title,60)||'线上对局',scene:clean(sceneText,900),mood:clean(result.mood,80),opening:clean(result.opening,400),presets,personalities,suggestions:result.suggestions&&typeof result.suggestions==='object'?result.suggestions:{}};},
  localScene(context){const names=context.roles.map(r=>r.name).join('、');return {artId:'dark',title:'线上终端对决',scene:`你与${names}各自身处不同地点，没有面对面见面。双方打开SC通讯终端，在线连接同一场${this.titles[context.game]}，通过终端消息交流，准备开始远程对决。`,mood:'安静，带一点竞争心',opening:'“准备好了就开始。”',presets:{},personalities:{},suggestions:{}};},
  async publishResult(context, session, result) {
    if (!this.host?.queueResult) return;
    await this.host.queueResult({game: context.game, matchId: session.id,
      roles: context.roles.map(r => ({id: r.id, name: r.name, sessionId: r.sessionId})),
      scene: {title: session.scene?.title, text: session.scene?.scene}, result,
      closing: session.closing ? ((session.log || []).filter(row => row.type === 'closing').map(row => row.who + '：' + row.text).join('\n') || session.closing.text) : '', endedAt: session.endedAt});
  },
  async remember(context,session,summary){for(const role of context.roles){const key='sc_game_memory_v1_'+context.game+'_'+role.id+'@'+role.sessionId,old=await this.read(key)||[];const row={id:session.id,at:Date.now(),result:summary,comment:session.closing?.text||''};await this.write(key,[...old.filter(x=>x.id!==session.id),row].slice(-20));}},
  async memories(context){return await this.read('sc_game_memory_v1_'+context.game+'_'+context.roles[0].id+'@'+context.roles[0].sessionId)||[];},
  async event(page,type,detail={},force){
    const session=page.session;if(!session||document.hidden&&type!=='pause')return;
    let route=force||page.settings.routes?.[type]||this.routes[type]||'PRESET';if(page.game==='miner'&&!['closing','return','start'].includes(type))route='PRESET';if(route==='SILENT')return;
    // Keep at most one model batch in flight; repeated key actions coalesce locally.
    if(type==='closing'){for(const controller of page.controllers)controller.abort();page.modelBusy=false;}
    if(page.modelBusy&&route==='LLM')route='PRESET';
    const id=crypto.randomUUID(),matchId=session.id,actors=page.context.roles.slice(0,type==='showdown'||type==='allin'?2:1);
    const publicState=structuredClone(page.publicState());
    const fallback=type==='closing'?this.presets.closing:type==='start'&&session.scene.opening?session.scene.opening:(session.scene.presets[type]||this.presets[type]||this.presets.reply);
    if(!page.guardNarrative(fallback))return;
    const notes=actors.map(actor=>({id:id+actor.id,type,who:actor.name,text:fallback,at:Date.now()}));session.log.push(...notes);session.log=session.log.slice(-120);page.renderLog();page.save();
    if(route!=='LLM'||!this.host||!this.host.configured(page.context.roles)){if(type==='closing'){session.closing={text:fallback,inviteRematch:false};await page.recordMemory();page.renderEnd();page.save();}return;}
    const controller=new AbortController();page.controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),this.host.timeout('event'));page.modelBusy=true;page.modelToken=controller;
    try{for(let n=0;n<actors.length;n++){const role=actors[n],input={eventId:id,matchId,game:page.game,type,detail,role:{id:role.id,name:role.name,description:role.description},state:{...publicState,scene:{title:session.scene.title,text:session.scene.scene,mood:session.scene.mood}},recent:role.recent||[],tableTalk:session.log.slice(-8).map(x=>({who:x.who,text:x.text}))};const result=await this.host.beat(input,type==='closing',controller.signal);if(page.destroyed||page.session?.id!==matchId||controller.signal.aborted)return;const text=typeof result.text==='string'?result.text.trim().slice(0,600):'';if(text){if(!page.guardNarrative(text))return;const note=page.session.log.find(x=>x.id===notes[n].id);if(note)note.text=text;if(type==='closing'){session.closing={text,inviteRematch:result.inviteRematch===true&&/再来|再战|下一局|再玩|再开|继续|again|another/i.test(text)};await page.recordMemory();}page.renderLog(note);page.renderEnd();page.save();}}}
    catch(error){if(page.session?.id===matchId&&!controller.signal.aborted)page.error('角色回应未生成：'+error.message+'。已保留本地互动。');if(type==='closing'&&page.session?.id===matchId){session.closing={text:fallback,inviteRematch:false};await page.recordMemory();page.renderEnd();page.save();}}
    finally{clearTimeout(timeout);page.controllers.delete(controller);if(page.modelToken===controller)page.modelBusy=false;}
  }
};

// The terminal reads the existing stores; chat, prompts and delivery remain unchanged.
const SCTerminal = {
  panel: 'home', category: 'menu', index: 0, paused: false, renderId: 0, unreadMode:'all',
  groups: [
    ['COMMUNICATION', '通讯', [['chat','聊天','COMMS','chat'],['character','角色','PERSONNEL','people'],['moments','朋友圈','SOCIAL','people'],['forum','论坛','FORUM','forum']]],
    ['OPERATIONS', '日常与任务', [['timer','定时','SCHEDULED OPS','timer'],['calendar','查日程','CALENDAR','calendar']]],
    ['MEDIA', '媒体', [['album','相册','ALBUM','image'],['mis-records','生图记录','IMAGE LOG','images']]],
    ['PERSONNEL & INTEL', '人员与情报', [['worldbook','世界书','WORLD BOOK','book'],['mask','我的面具','MY PERSONA','mask'],['card-assistant','制卡助手','CARD BUILDER','card'],['regex','正则','REGEX','code']]],
    ['GAMES', '游戏', [['games','游戏目录','RECREATION','code'],['naval','海上对弈','NAVAL GRID','code'],['holdem','德州扑克','TEXAS HOLD EM','card'],['gomoku','五子棋','GOMOKU','code'],['mastermind','代码破解','MASTERMIND','code'],['miner','双人黄金矿工','GOLD MINER','code']]],
    ['SYSTEM', '系统', [['settings','设置','SYSTEM','settings']]]
  ],
  categories: [['weather','天气','WEATHER'],['menu','菜单','DUTY'],['assistants','助手','DUTY'],['bulletin','资讯','BULLETIN'],['pinned','未读','UNREAD']],
  paths: {
    chat:'<rect x="3" y="3" width="18" height="14" rx="4"/><path d="m8 17-2 4v-4M8 10h.01M12 10h.01M16 10h.01"/>',
    people:'<circle cx="10" cy="7" r="4"/><path d="M2 21v-2a8 8 0 0 1 16 0v2ZM17 4a4 4 0 0 1 0 8M20 15a7 7 0 0 1 2 6"/>',
    forum:'<path d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 8h10M7 12h7"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h1M12 15h1M17 15h1M7 18h1M12 18h1"/>',
    timer:'<path d="M3 19V6a2 2 0 0 1 2-2h13M7 2v5M16 2v5M3 10h10"/><circle cx="16" cy="16" r="6"/><path d="M16 12v4l3 2"/>',
    book:'<path d="M12 5C8 2 5 2 2 3v16c3-1 6-1 10 2 4-3 7-3 10-2V3c-3-1-6-1-10 2v16"/>',
    mask:'<path d="M3 4c6 2 12 2 18 0v7c0 5-4 9-9 11-5-2-9-6-9-11ZM6 10l4 1-3 1ZM18 10l-4 1 3 1Z"/>',
    card:'<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M4 17a4 4 0 0 1 8 0M15 9h4M15 13h4"/>',
    code:'<path d="m7 5-6 7 6 7M17 5l6 7-6 7M14 3l-4 18"/>',
    image:'<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 6 6"/>',
    images:'<path d="M6 2h14a2 2 0 0 1 2 2v13M2 7h15v15H2ZM2 18l5-5 4 4 3-3 3 3"/>',
    camera:'<path d="M3 6h4l2-3h6l2 3h4v15H3Z"/><circle cx="12" cy="13" r="5"/>',
    wand:'<path d="m3 20 11-11 3 3L6 23ZM5 2v6M2 5h6M18 1v6M15 4h6M20 16v6M17 19h6"/>',
    settings:'<path d="m9 2-1 3-3 1-2-1-2 4 2 2v3l-2 2 2 4 3-1 2 1 1 3h5l1-3 3-1 2 1 2-4-2-2v-3l2-2-2-4-3 1-3-1-1-3Z"/><circle cx="12" cy="12" r="4"/>',
    left:'<path d="m15 5-7 7 7 7"/>', right:'<path d="m9 5 7 7-7 7"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
    pause:'<path d="M8 5v14M16 5v14"/>', play:'<path d="m8 4 12 8-12 8Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2"/>',
    moon:'<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>'
  },
  icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.paths[name] || this.paths.chat}</svg>`; },
  dateKey() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
  greeting(hour) { return !Number.isFinite(hour)?'欢迎':hour>=5&&hour<12?'上午好':hour>=12&&hour<18?'下午好':'晚上好'; },
  async readRecent(sessions, characters, limit=3) {
    const rows=[];
    for (const session of sessions.slice(0,limit)) {
      const messages=await new Promise((resolve,reject)=>{
        const tx=Storage.db.transaction('messages','readonly');
        const request=tx.objectStore('messages').index('sessionId').getAll(session.id);
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      messages.sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));
      const raw=characters.find(c=>c.id===session.participantCharacterIds?.[0]);
      const character=raw ? Character.normalizeCard(raw) : null;
      const name=session.title || character?.name || '未命名会话';
      const avatar=Chat._sanitizeAvatarSrc(session.avatar || character?.avatar || '');
      const preview=Chat._formatChatListPreview(messages) || '点击查看会话';
      rows.push({id:session.id,name,avatar,preview,hasMessages:messages.length>0,time:session.updatedAt || session.createdAt,unread:Math.max(0,Number(session.unreadCount)||0)});
    }
    return rows;
  },
  async render() {
    const run=++this.renderId;
    const host=document.getElementById('page-homescreen');
    host.classList.add('sc-home','sc-terminal');
    document.getElementById('homescreen-pager').hidden=true;
    let root=document.getElementById('sc-home');
    if(!root){root=document.createElement('div');root.id='sc-home';host.append(root);}
    try {
      const [sessions,characters,masks,daily]=await Promise.all([
        Storage.dbGetAll('sessions'),Storage.dbGetAll('characters'),Storage.dbGetAll('masks'),SCDaily.readLatest()
      ]);
      sessions.sort((a,b)=>(Number(b.updatedAt||b.createdAt)||0)-(Number(a.updatedAt||a.createdAt)||0));
      const recent=await this.readRecent(sessions,characters);
      if(run!==this.renderId)return;
      this.daily=daily && typeof daily==='object' ? daily : {};
      this.recent=recent;
      this.characters=characters;
      this.roles=await SCDaily.roles(characters);
      if(run!==this.renderId)return;
      this.sessions=sessions;
      const mask=masks.find(m=>m.id===Storage.get(CONFIG.STORAGE_KEYS.DEFAULT_MASK_ID));
      const personaPhoto=Chat._sanitizeAvatarSrc(mask?.avatar || '');
      const e=SCUI.escape;
      const brand=`<div class="terminal-brand"><b>SHADOW COMPANY</b><span>PERSONAL TERMINAL</span><button class="terminal-mode" aria-label="切换日夜模式">${this.icon('moon')}</button></div>`;
      root.innerHTML=`
        <section class="terminal-panel" data-panel="home" aria-label="终端首页">
          ${brand}
          <section class="terminal-identity"><div><time class="terminal-clock"></time><div class="terminal-date"></div></div><button data-module="mask" class="terminal-persona" aria-label="${e(mask?.name || '我的面具')}，打开面具"><span class="terminal-persona-photo">${personaPhoto?`<img src="${e(personaPhoto)}" alt="${e(mask?.name || '面具')}的照片" decoding="async">`:this.icon('mask')}</span><strong>${e(mask?.name || '我的面具')}</strong><span class="terminal-greeting" data-persona-set="${!!mask}"></span></button></section>
          <section class="terminal-game-launch"><button data-module="games">${this.icon('code')}<span><strong>游戏</strong><small>海上对弈 · 德州扑克 · 五子棋 · 更多</small></span>${this.icon('right')}</button><small>2026.11.24 RP2 · <a href="update.html">检查程序更新</a></small></section>
          <section class="terminal-comms"><header><h2>COMMS <span>/ 最近通讯</span></h2><button data-module="chat" aria-label="查看全部通讯">${this.icon('right')}</button></header><div class="terminal-recent">${recent.length ? recent.map(r=>`<button class="terminal-channel" data-session="${e(r.id)}"><span class="terminal-avatar">${r.avatar?`<img src="${e(r.avatar)}" alt="">`:e(r.name.slice(0,1))}</span><span class="terminal-message"><strong>${e(r.name)}</strong><span>${e(r.preview)}</span></span><span class="terminal-meta"><time>${r.time?e(new Date(r.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})):''}</time>${r.unread?`<b aria-label="${r.unread} 条未读">${r.unread>99?'99+':r.unread}</b>`:''}</span></button>`).join(''):`<button class="terminal-no-comms" data-module="chat"><span>${this.icon('chat')}</span><strong>暂无近期通讯</strong><small>进入通讯中心，建立你的第一个会话 ${this.icon('right')}</small></button>`}</div></section>
          <section class="terminal-feed"><h2>BASE FEED <span>/ 驻地简报</span></h2><div class="terminal-categories" role="tablist" aria-label="简报分类">${this.categories.map(([id,label])=>`<button id="terminal-tab-${id}" role="tab" data-category="${id}" aria-controls="terminal-feed-card">${label}</button>`).join('')}</div><div id="terminal-feed-card" role="tabpanel" tabindex="0"></div></section>
          <nav class="terminal-edges" aria-label="侧面板入口"><button data-panel-target="edc">${this.icon('left')}<span>私人 EDC</span></button><button data-panel-target="tactical"><span>业务操作面板</span>${this.icon('right')}</button></nav>
        </section>
        <section class="terminal-panel" data-panel="tactical" aria-label="业务操作面板" hidden>
          ${brand}<header class="terminal-tactical-title"><div><h1 tabindex="-1">OPERATIONS PANEL</h1><span>业务操作面板</span></div><button data-panel-target="home" aria-label="返回首页">${this.icon('left')} 返回</button></header>
          <div class="terminal-groups">${this.groups.map(([en,cn,modules])=>`<section class="terminal-group"><h2>${en} <span>/ ${cn}</span></h2><div class="terminal-module-grid">${modules.map(([id,label,english,icon])=>`<button data-module="${id}"><span class="terminal-module-icon">${this.icon(icon)}</span><span class="terminal-module-label"><strong>${label}</strong><small>${english}</small></span></button>`).join('')}</div></section>`).join('')}</div>
          <nav class="terminal-return"><button data-panel-target="home">${this.icon('left')} 返回首页</button></nav>
        </section>
        <section class="terminal-panel terminal-edc" data-panel="edc" aria-label="私人 EDC 纸质拼贴随身盒" hidden></section>`;
      void SCEDC.mount(root.querySelector('[data-panel="edc"]'));
      root.querySelectorAll('[data-panel-target]').forEach(b=>b.onclick=()=>this.setPanel(b.dataset.panelTarget,true));
      root.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>this.openModule(b.dataset.module));
      root.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>Chat.openSession(b.dataset.session));
      root.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{this.category=b.dataset.category;this.index=0;this.renderFeed();});
      root.querySelectorAll('.terminal-mode').forEach(b=>b.onclick=()=>this.setNight(!host.classList.contains('terminal-night')));
      const tabs=root.querySelector('.terminal-categories');
      tabs.onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const ids=this.categories.map(c=>c[0]);let i=ids.indexOf(this.category);
        i=event.key==='Home'?0:event.key==='End'?ids.length-1:(i+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;
        this.category=ids[i];this.index=0;this.renderFeed();root.querySelector(`[data-category="${this.category}"]`).focus();
      };
      this.bindSwipe(root);
      this.setPanel(this.panel);
      this.setNight(Storage.get('sc_terminal_night_v1')===true,false);
      this.clock();this.renderFeed();
      void this.refreshUnread();
    } catch(error) {
      console.error('[终端首页]',error);
      if(run!==this.renderId)return;
      root.replaceChildren();const message=document.createElement('p');message.className='terminal-load-error';message.textContent='终端内容读取失败，请重试。';
      const button=document.createElement('button');button.textContent='重新加载';button.onclick=()=>this.render();root.append(message,button);
    }
  },
  setPanel(name,focus=false) {
    if(!['home','tactical','edc'].includes(name))return;
    if(this.panel==='edc'&&name!=='edc'&&(SCEDC.dirty||SCEDC.saving)){SCEDC.requestLeave(()=>this.setPanel(name,focus));return;}
    this.cancelPanelSwipe?.();
    this.panel=name;
    document.querySelectorAll('#sc-home [data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name);
    SCEDC.onPanel(name);
    if(focus&&name!=='edc'){const panel=document.querySelector(`#sc-home [data-panel="${name}"]`);(panel?.querySelector('h1') || panel?.querySelector('button'))?.focus({preventScroll:true});}
  },
  bindSwipe(root) {
    if(root.dataset.terminalSwipeBound)return;
    root.dataset.terminalSwipeBound='true';
    let drag=null,timer=null,suppressClickUntil=0;
    const clean=()=>{
      clearTimeout(timer);timer=null;
      for(const panel of root.querySelectorAll('.terminal-swipe-page')){
        panel.classList.remove('terminal-swipe-page','terminal-swipe-target');
        panel.style.transform='';panel.style.transition='';
      }
      drag=null;this.cancelPanelSwipe=null;
    };
    const finish=commit=>{
      if(!drag?.target){clean();return;}
      const {page,target,width,sign,to}=drag;
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      page.style.transition=target.style.transition=reduced?'none':'transform 180ms ease-out';
      page.style.transform='translateX('+(commit?sign*width:0)+'px)';
      target.style.transform='translateX('+(commit?0:-sign*width)+'px)';
      const done=()=>{clean();if(commit)this.setPanel(to,true);};
      if(reduced)done();else timer=setTimeout(done,190);
    };
    root.addEventListener('pointerdown',event=>{
      if(timer||event.button!==0||!event.isPrimary||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(this.panel==='edc'&&(SCEDC.saving||event.target.closest('.edc-context,.edc-item')||(SCEDC.stage&&SCEDC.hit(SCEDC.point(event)))))return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,page:root.querySelector('[data-panel="'+this.panel+'"]')};
      this.cancelPanelSwipe=clean;
    },true);
    root.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId||timer)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.target){
        if(Math.max(Math.abs(dx),Math.abs(dy))<10)return;
        if(Math.abs(dx)<Math.abs(dy)*1.5){clean();return;}
        const to=this.panel==='home'?(dx>0?'edc':'tactical'):
          this.panel==='tactical'&&dx>0||this.panel==='edc'&&dx<0?'home':null;
        if(!to){clean();return;}
        Object.assign(drag,{to,sign:Math.sign(dx),width:root.clientWidth,target:root.querySelector('[data-panel="'+to+'"]')});
        drag.page.classList.add('terminal-swipe-page');
        drag.target.classList.add('terminal-swipe-page','terminal-swipe-target');
        if(to==='edc')SCEDC.resize();
        root.setPointerCapture(event.pointerId);
      }
      event.preventDefault();event.stopPropagation();
      const offset=drag.sign*Math.min(drag.width,Math.max(0,dx*drag.sign));
      drag.page.style.transform='translateX('+offset+'px)';
      drag.target.style.transform='translateX('+(-drag.sign*drag.width+offset)+'px)';
    },{capture:true,passive:false});
    root.addEventListener('pointerup',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      if(drag.target){
        event.preventDefault();event.stopPropagation();suppressClickUntil=Date.now()+400;
        const distance=(event.clientX-drag.x)*drag.sign;
        finish(distance>=Math.min(85,drag.width*.22));
      }else clean();
    },true);
    root.addEventListener('pointercancel',()=>finish(false),true);
    root.addEventListener('click',event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
    root.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.panel==='tactical')this.setPanel('home',true);});
  },
  openModule(id) {
    if(id==='games'){SCRecreation.directory();return;}
    if(['holdem','gomoku','mastermind','miner'].includes(id)){SCRecreation.select(id);return;}
    if(id==='naval'){SCRecreation.select('naval');return;}
    if(id==='calendar'){SCUI.modal('查日程','<p>旧版日历目前停用。此处已保留入口，日程页面将在后续接入。</p>');return;}
    const icon=CONFIG.DEFAULT_ICONS.find(i=>i.id===id);
    if(icon)Homescreen.openIconTarget(icon);
  },
  setNight(night,save=true) {
    document.documentElement.dataset.scMode=night?'night':'day';
    document.getElementById('page-homescreen').classList.toggle('terminal-night',night);
    document.querySelectorAll('.terminal-mode').forEach(b=>{b.innerHTML=this.icon(night?'sun':'moon');b.setAttribute('aria-label',night?'切换日间模式':'切换夜间模式');});
    if(save)try{Storage.set('sc_terminal_night_v1',night);}catch{Chat._toast('外观暂未保存');}
  },
  clock() {
    const d=new Date();const time=document.querySelector('.terminal-clock');
    if(time){
      if(!time.querySelector('.terminal-clock-main'))time.innerHTML='<span class="terminal-clock-main"></span><span class="terminal-clock-seconds"></span>';
      time.querySelector('.terminal-clock-main').textContent=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      time.querySelector('.terminal-clock-seconds').textContent=':'+String(d.getSeconds()).padStart(2,'0');time.dateTime=d.toISOString();
    }
    const date=document.querySelector('.terminal-date');if(date)date.textContent=`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} / ${['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]}`;
    const greeting=document.querySelector('.terminal-greeting');if(greeting)greeting.textContent=greeting.dataset.personaSet==='true'?this.greeting(d.getHours()):'欢迎';
    if(this.loadedDate&&this.loadedDate!==this.dateKey())void this.render();this.loadedDate=this.dateKey();
  },
  items(category) {
    if(category==='pinned')return this.unread || [];
    const rows=this.daily?.[category];
    return Array.isArray(rows)?rows.filter(r=>r&&typeof r.title==='string'&&typeof r.body==='string'&&(category!=='assistants'||!r.characterId||this.roles?.get(r.characterId)?.assistant)):[];
  },
  async refreshUnread() {
    if(!Storage.db || !this.unreadMode)return;
    try {
      const [sessions,characters]=await Promise.all([Storage.dbGetAll('sessions'),Storage.dbGetAll('characters')]);
      const prefs=await SCDaily.roles(characters);
      const focused=s=>s.participantCharacterIds?.some(id=>prefs.get(id)?.focus===true);
      const selected=sessions.filter(s=>Number(s.unreadCount)>0&&(this.unreadMode==='all'||focused(s)));
      selected.sort((a,b)=>Number(focused(b))-Number(focused(a)) || Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0));
      const signature=JSON.stringify(selected.map(s=>[s.id,s.updatedAt,s.unreadCount,focused(s)]));
      if(signature!==this.unreadSignature){
        this.unreadSignature=signature;
        const recent=await this.readRecent(selected,characters,Infinity);
        this.unread=recent.filter(r=>r.hasMessages).map(r=>({title:r.name,body:r.preview,sessionId:r.id,unread:r.unread,focused:focused(selected.find(s=>s.id===r.id))}));
        if(this.category==='pinned')this.renderFeed();
      }
      const tab=document.querySelector('[data-category=pinned]');
      const count=this.unread?.length || 0;
      if(tab){tab.classList.toggle('has-unread',count>0);tab.setAttribute('aria-label',count?`未读，有 ${count} 个会话未读`:'未读');}
    }catch{Chat._toast('未读信息暂时无法更新');}
  },
  renderFeed() {
    const card=document.getElementById('terminal-feed-card');if(!card)return;
    const e=SCUI.escape;
    const [id,label,en]=this.categories.find(c=>c[0]===this.category);
    document.querySelectorAll('[data-category]').forEach(b=>{const active=b.dataset.category===id;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    card.setAttribute('aria-labelledby','terminal-tab-'+id);
    card.dataset.feedCategory=id;
    const rows=this.items(id);this.index=Math.min(this.index,Math.max(0,rows.length-1));
    const item=id==='weather'?null:rows[this.index];
    let title=item?.title,body=item?`<div class="terminal-feed-body">${e(item.body)}</div>`:'',action='';
    if(id==='menu' && Array.isArray(item?.meals))body=`<table class="terminal-meals"><tbody>${item.meals.map(m=>`<tr><th scope="row">${e(m.name)}</th><td>${e((m.dishes || []).join('、'))}</td></tr>`).join('')}</tbody></table>`;
    if(!item){
      if(id==='weather'){
        title='城市天气';
        body=`<div class="terminal-weather-list">${Weather.rows().map(({city,source,state})=>{
          const usable=Weather.valid(state?.data),current=state?.data?.current;
          const cached=state?.error || (state?.at && Date.now()-state.at>=900000);
          const location=city.fictional?'绑定 '+(source?.name || '未设置'):'现实城市';
          const detail=(city.fictional?location+' ':'')+(usable?current.time.slice(11,16)+' 当地':city.fictional?'':location)+(cached&&usable?' / 缓存':'');
          return `<button type="button" class="terminal-weather-row" data-weather-open="${e(city.id)}" aria-label="${e(city.name)}，查看天气与城市设置"><span><strong>${e(city.name)}</strong><small>${e(detail.trim())}</small></span><span class="terminal-weather-reading"><b>${usable?e(current.temperature_2m+'°'):'--°'}</b><small>${usable?e(Weather.label(current.weather_code)):!source?'未绑定':state?.error?'暂不可用':'更新中'}</small></span></button>`;
        }).join('')}</div>`;action='<button data-feed-weather>城市与预报 '+this.icon('right')+'</button>';
      }else if(id==='pinned'){
        title='暂无未读消息';body='<p>这里的消息摘要不会被自动标为已读。</p>';
      }else{
        title={menu:'今日餐厅菜单',assistants:'助手早间留言',bulletin:'公司与驻地资讯'}[id];
        body=`<div class="terminal-feed-empty">${this.icon({menu:'calendar',assistants:'chat',bulletin:'forum'}[id])}<strong>${{menu:'今日菜单尚未编排',assistants:'暂无今日助手留言',bulletin:'暂无今日内部资讯'}[id]}</strong><p>${{menu:'基地自助餐吧 · 每日三餐',assistants:'在角色设置中勾选“加入首页助手”，手动刷新后生成独立留言。',bulletin:'新闻先发布，暗影之家再围绕新闻展开讨论。'}[id]}</p></div>`;
      }
    }
    if(item?.sessionId)action=`<button data-feed-session="${e(item.sessionId)}">进入会话 ${this.icon('right')}</button>`;
    if(id==='assistants' && item?.characterId)action=`<button data-feed-assistant="${e(item.characterId)}">进入对话 ${this.icon('right')}</button>`;
    if(id==='bulletin' && item)action=`<button data-feed-forum>查看论坛讨论 ${this.icon('right')}</button>`;
    const generated=['menu','assistants','bulletin'].includes(id);
    const configured=!!Storage.get(CONFIG.STORAGE_KEYS.API_KEY);
    const missingAssistant=id==='assistants'&&[...(this.roles||new Map())].some(([cid,p])=>p.assistant&&!rows.some(r=>r.characterId===cid));
    const status=generated?(SCDaily.activeCategory===id&&SCDaily.status==='running'?'正在更新':!configured?'请配置文字 API':this.daily?._dates?.[id]===this.dateKey()&&!missingAssistant?'今日内容':'待刷新'):(item?`${item.focused?'特别关注 · ':''}${item.unread} 条未读`:id==='weather'?'天气':'已读完');
    const refresh=generated?`<button type="button" class="terminal-feed-refresh" data-feed-refresh aria-label="刷新${e(label)}" title="手动刷新${e(label)}（会请求文字 API）" ${SCDaily.pending?'disabled':''}>${this.icon('refresh')}</button>`:'';
    card.innerHTML=`<div class="terminal-feed-heading"><strong>${en} <span>/ ${e(label)}</span></strong><div class="terminal-feed-state"><span class="terminal-feed-status">${status}</span>${refresh}</div></div><h3>${e(title)}</h3><div class="terminal-feed-content">${body}${action}</div><div class="terminal-feed-summary">助手留言 <b>${this.items('assistants').length}</b><span>·</span>内部资讯 <b>${this.items('bulletin').length}</b></div><div class="terminal-feed-controls"><button data-feed-prev aria-label="上一条简报">${this.icon('left')}</button><button data-feed-pause aria-label="${this.paused?'继续轮播':'暂停轮播'}" aria-pressed="${this.paused}">${this.icon(this.paused?'play':'pause')}</button><button data-feed-next aria-label="下一条简报">${this.icon('right')}</button><span>${String(this.categories.findIndex(c=>c[0]===id)+1).padStart(2,'0')}<i>/05</i></span></div>`;
    card.querySelector('[data-feed-session]')?.addEventListener('click',event=>Chat.openSession(event.currentTarget.dataset.feedSession));
    card.querySelector('[data-feed-assistant]')?.addEventListener('click',async event=>{
      const id=event.currentTarget.dataset.feedAssistant;
      const {sessionId}=await SCDaily.assistantContext(id);
      if(sessionId){await Chat.openSession(sessionId);return;}
      const character=await Storage.dbGet('characters',id);
      if(character)await Character.startChatWithCharacter(id);
    });
    card.querySelector('[data-feed-forum]')?.addEventListener('click',()=>{Storage.set(Forum._CURRENT_FORUM_KEY,Storage.get(SCDaily.forumKey));this.openModule('forum');});
    card.querySelector('[data-feed-refresh]')?.addEventListener('click',()=>{
      if(!configured){State.apiSettingsReturnPage='page-homescreen';State.switchPage('page-settings-api');return;}
      void SCDaily.run({manual:true,category:id});
    });
    card.querySelector('[data-feed-weather]')?.addEventListener('click',()=>Homescreen.openIconTarget(CONFIG.DEFAULT_ICONS.find(i=>i.id==='weather')));
    card.querySelectorAll('[data-weather-open]').forEach(button=>button.onclick=()=>{Weather.activeId=button.dataset.weatherOpen;this.openModule('weather');});
    card.querySelector('[data-feed-prev]').onclick=()=>this.step(-1);
    card.querySelector('[data-feed-next]').onclick=()=>this.step(1);
    card.querySelector('[data-feed-pause]').onclick=()=>{this.paused=!this.paused;this.renderFeed();card.querySelector('[data-feed-pause]').focus();};
  },
  step(delta) {
    const count=this.items(this.category).length;
    if(count>1&&this.index+delta>=0&&this.index+delta<count)this.index+=delta;
    else {const i=this.categories.findIndex(c=>c[0]===this.category);this.category=this.categories[(i+delta+5)%5][0];this.index=delta<0?Math.max(0,this.items(this.category).length-1):0;}
    const focused=document.activeElement?.hasAttribute('data-feed-prev')?'[data-feed-prev]':document.activeElement?.hasAttribute('data-feed-next')?'[data-feed-next]':null;
    this.renderFeed();if(focused)document.querySelector(focused)?.focus();
  },
  init() {
    document.documentElement.dataset.scMode=Storage.get('sc_terminal_night_v1')===true?'night':'day';
    SCUI.home=()=>this.render();SCUI.clock=()=>this.clock();
    const refresh=async()=>{
      if(!Storage.db)return;
      this.daily=await SCDaily.readLatest();
      this.roles=await SCDaily.roles(await Storage.dbGetAll('characters'));
      this.renderFeed();
    };
    window.addEventListener('sc:daily-updated',()=>void refresh().catch(()=>{}));
    window.addEventListener('sc:daily-status',()=>this.renderFeed());
    window.addEventListener('sc:weather-updated',()=>{if(this.category==='weather')this.renderFeed();});
    window.addEventListener('sc:roles-updated',()=>{this.unreadSignature=null;void refresh().catch(()=>{});void this.refreshUnread();});
    setInterval(()=>{if(!document.hidden&&State.currentPage==='page-homescreen')void this.refreshUnread();},5000);
    setInterval(()=>{
      const card=document.getElementById('terminal-feed-card');
      if(this.panel!=='home'||State.currentPage!=='page-homescreen'||document.hidden||this.paused||matchMedia('(prefers-reduced-motion: reduce)').matches||!card||card.matches(':hover')||card.contains(document.activeElement))return;
      if(this.categories.reduce((n,c)=>n+this.items(c[0]).length,0)>1)this.step(1);
    },8000);
  }
};
SCTerminal.init();

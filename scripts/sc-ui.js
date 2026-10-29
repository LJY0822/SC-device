const SCUI = {
  removed: new Set(['manual','shop','wallet','takeout','ta-phone','ta-diary','live','share','note','widgets','map','calendar','music']),
  escape: s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  normalizeMath(text) {
    const symbols={rightarrow:'→',leftarrow:'←',leftrightarrow:'↔',Rightarrow:'⇒',Leftarrow:'⇐',Leftrightarrow:'⇔',uparrow:'↑',downarrow:'↓',times:'×',div:'÷',geq:'≥',leq:'≤',neq:'≠',infty:'∞',pm:'±'};
    return String(text ?? '').split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part,i)=>i%2?part:part.replace(/\$\s*\\([a-zA-Z]+)\s*\$/g,(all,name)=>symbols[name]||all)).join('');
  },
  async modal(title, content, mount) {
    const dialog=document.createElement('dialog'); dialog.className='sc-dialog';
    dialog.innerHTML=`<header><h2>${this.escape(title)}</h2><button type="button" aria-label="关闭">×</button></header><div class="sc-dialog-body">${content}</div>`;
    document.body.append(dialog); dialog.querySelector('header button').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>dialog.remove()); dialog.showModal();
    if(mount) await mount(dialog); return dialog;
  },
  async home() {
    const home=document.getElementById('page-homescreen');
    home.classList.add('sc-home');
    document.getElementById('homescreen-pager').hidden=true;
    let panel=document.getElementById('sc-home');
    if(!panel) { panel=document.createElement('div');panel.id='sc-home';home.append(panel); }
    const sessions=(await Storage.dbGetAll('sessions')).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,2);
    const icons=CONFIG.DEFAULT_ICONS.filter(i=>!this.removed.has(i.id));
    const preferred=['chat','character','worldbook','moments','forum','album','weather','timer','settings'];
    icons.sort((a,b)=>(preferred.includes(a.id)?preferred.indexOf(a.id):99)-(preferred.includes(b.id)?preferred.indexOf(b.id):99));
    panel.innerHTML=`<div class="sc-brand"><b>SC</b><span>个人通讯装置<small>SHADOW COMPANY</small></span></div><div class="sc-clock"></div><div class="sc-date"></div><section class="sc-channels"><header>通讯频道<button id="sc-all-chats">查看全部 ›</button></header><div class="sc-channel-list">${sessions.length?sessions.map(s=>`<button data-session="${this.escape(s.id)}"><span class="sc-avatar">${this.escape((s.title||'SC').slice(0,2))}</span><span>${this.escape(s.title||'未命名会话')}<small>继续对话</small></span></button>`).join(''):'<button id="sc-start-chat">建立你的第一个通讯频道 →</button>'}</div></section><nav class="sc-apps" aria-label="应用">${icons.map(i=>`<button data-icon="${this.escape(i.id)}"><span>${i.type==='svg'?DOMPurify.sanitize(i.svg,{USE_PROFILES:{svg:true,svgFilters:true}}):this.escape(i.emoji||'◇')}</span>${this.escape(i.label)}</button>`).join('')}</nav><footer class="sc-home-footer">Foxhole &amp; Acorn Box</footer>`;
    panel.querySelector('#sc-all-chats').onclick=()=>State.switchPage('page-chat-list');
    panel.querySelector('#sc-start-chat')?.addEventListener('click',()=>State.switchPage('page-chat-list'));
    panel.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>Chat.openSession(b.dataset.session));
    panel.querySelectorAll('[data-icon]').forEach(b=>b.onclick=()=>Homescreen.openIconTarget(icons.find(i=>i.id===b.dataset.icon)));
    this.clock();
  },
  clock() {
    const date=new Date(); const time=document.querySelector('.sc-clock'); if(time) time.textContent=date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
    const day=document.querySelector('.sc-date'); if(day) day.textContent=date.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
  },
  async settings(session) {
    let box=document.getElementById('sc-session-settings');
    if(!box) { box=document.createElement('section'); box.id='sc-session-settings'; document.querySelector('#page-chat-settings .yd-page-content').prepend(box); }
    const esc=this.escape; const all=(await Storage.dbGetAll('sessions')).filter(s=>s.id!==session.id);
    const group=(session.participantCharacterIds||[]).length>1;
    const cfg=await ProactiveScheduler.loadConfig();
    box.innerHTML=`<div class="sc-settings-block"><h3>SC · 通讯设置</h3>${group?`<label>群聊模式<select id="sc-group-mode"><option value="shared">单模型扮演全员</option><option value="independent">独立角色依次回复</option></select></label><p>独立模式按成员顺序，每位角色每轮一次请求。</p><button id="sc-retry-round">继续未完成的群聊轮次</button>`:''}<label>查岗模式<select id="sc-inspection"><option value="off">关闭</option><option value="ask">每次申请</option><option value="allow">默认允许</option></select></label><details><summary>允许查岗的会话（各最近50条）</summary><p>只勾选同一剧情的对话，未选中项不会被查岗。</p>${all.map(s=>`<label class="sc-check"><input type="checkbox" data-inspect="${esc(s.id)}" ${(session.scInspectionAllow||[]).includes(s.id)?'checked':''}>${esc(s.title||'未命名')}</label>`).join('')||'<p>暂无其他会话</p>'}</details><details><summary>跨会话记忆范围（独立授权）</summary><p>这里勾选后，会在原有跨会话记忆开启时直接读取；需要每次申请的内容请只勾选在查岗范围。</p>${all.map(s=>`<label class="sc-check"><input type="checkbox" data-memory="${esc(s.id)}" ${(session.scMemoryAllow||[]).includes(s.id)?'checked':''}>${esc(s.title||'未命名')}</label>`).join('')}</details><label>主动消息<input id="sc-proactive" type="checkbox" role="switch" ${(session.scProactiveEnabled??cfg.enabled)?'checked':''}></label><p>仅应用运行时发送；错过后按原计划时间补发。关闭会取消本会话未发送计划。</p><button id="sc-save-session" class="sc-primary">保存通讯设置</button><button id="sc-prompt-view">本次发送给 AI 的内容 ›</button><button id="sc-audit-view">查看查岗申请记录 ›</button></div>`;
    box.querySelector('#sc-group-mode')?.setAttribute('aria-label','群聊模式');
    if(group) box.querySelector('#sc-group-mode').value=session.scGroupMode||'shared';
    if(group){
      const presets=SCChat.apiPresets();
      const actors=await Promise.all((session.participantCharacterIds||[]).map(id=>Storage.dbGet('characters',id)));
      const controls=document.createElement('div');
      controls.innerHTML=actors.filter(Boolean).map(a=>`<label>${esc(a.name)} · API<select data-actor-api="${esc(a.id)}"><option value="">共用当前配置</option>${presets.map(p=>`<option value="${esc(p.id)}" ${a.scApiPresetId===p.id?'selected':''}>${esc(p.name||p.id)}</option>`).join('')}</select></label>`).join('')+'<button id="sc-cancel-round">取消未完成轮次（保留已发消息）</button>';
      box.querySelector('#sc-retry-round').after(controls);
      controls.querySelector('#sc-cancel-round').onclick=async()=>{if(SCChat.busy.has(session.id))return Chat._toast('请等待当前请求结束');await Storage.kvRemove('sc_round_'+session.id);Chat._toast('已取消未完成轮次');};
    }
    box.querySelector('#sc-inspection').value=session.scInspectionMode||'off';
    box.querySelector('#sc-save-session').onclick=async()=>{
      try {
        const current=await Storage.dbGet('sessions',session.id);
        if(!current) throw new Error('会话已删除');
        current.scGroupMode=box.querySelector('#sc-group-mode')?.value||'shared';
        current.scInspectionMode=box.querySelector('#sc-inspection').value;
        current.scInspectionAllow=[...box.querySelectorAll('[data-inspect]:checked')].map(e=>e.dataset.inspect);
        current.scMemoryAllow=[...box.querySelectorAll('[data-memory]:checked')].map(e=>e.dataset.memory);
        current.scProactiveEnabled=box.querySelector('#sc-proactive').checked;
        if(typeof SCChat!=='undefined' && SCChat.busy.has(current.id))throw new Error('请等待当前回复结束再修改设置');
        for(const el of box.querySelectorAll('[data-actor-api]')) {const actor=await Storage.dbGet('characters',el.dataset.actorApi);if(actor){actor.scApiPresetId=el.value;await Storage.dbPut('characters',actor);}}
        await Storage.dbPut('sessions',current);
        if(!current.scProactiveEnabled) await ProactiveScheduler.scheduleFromSystemAction({sessionId:current.id,cancel:true});
        if(Chat.currentSessionId===current.id) Chat.currentSession=current;
        Chat._toast('通讯设置已保存');
      }catch(e){alert(e.message);}
    };
    box.querySelector('#sc-prompt-view').onclick=()=>this.modal('实际发送内容','<p>仅此页面运行期间记录，不包含请求密钥。模型仍可能有服务商自己的规则。</p><pre></pre>',d=>{d.querySelector('pre').textContent=JSON.stringify(typeof SCChat==='undefined'?[]:SCChat.requests.get(session.id)||[],null,2);});
    box.querySelector('#sc-audit-view').onclick=()=>typeof SCChat!=='undefined'&&SCChat.showAudit(session.id);
    box.querySelector('#sc-retry-round')?.addEventListener('click',()=>SCChat.resume(session.id));
  },
  init() {
    this.home(); setInterval(()=>this.clock(),30000);
    window.addEventListener('yd:pagechange',e=>{if(e.detail.to==='page-homescreen') this.home();});
  }
};


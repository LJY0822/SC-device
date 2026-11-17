document.getElementById('run').onclick=async()=>{
 const output=document.getElementById('out');output.textContent='运行中…\n';
 const w=document.getElementById('app').contentWindow;const get=code=>w.eval(code);
 const assert=(ok,name)=>{if(!ok)throw new Error(name);output.textContent+='PASS '+name+'\n';};
 try{
  if(location.hostname!=='localhost')throw new Error('请使用 localhost 测试源');
  const S=get('Storage'),C=get('Chat'),X=get('SCChat'),P=get('ProactiveScheduler'),B=get('SCBackup'),U=get('SCUI');
  if((await S.dbGetAll('sessions')).some(s=>!s.id.startsWith('test-')))throw new Error('检测到非测试数据，停止');
  await S.kvSet('sc_prompt_review',X.reviewVersion);
  const now=Date.now();
  await S.dbPut('characters',{id:'test-a',name:'Graves',description:'ONLY_PERSONA_A',first_mes:''});
  await S.dbPut('characters',{id:'test-b',name:'Shadow',description:'ONLY_PERSONA_B',first_mes:''});
  await S.dbPut('sessions',{id:'test-group',title:'SC 双人频道',participantCharacterIds:['test-a','test-b'],participantCharacterNames:['Graves','Shadow'],mode:0,scGroupMode:'independent',scInspectionMode:'allow',scInspectionAllow:['test-allowed'],scMemoryAllow:[],scProactiveEnabled:true,createdAt:now});
  await S.dbPut('sessions',{id:'test-allowed',title:'允许的 SC 对话',participantCharacterIds:['test-a'],participantCharacterNames:['Graves'],mode:0});
  await S.dbPut('sessions',{id:'test-denied',title:'隔离的跑团',participantCharacterIds:['test-a'],participantCharacterNames:['Graves'],mode:0});
  for(let i=0;i<55;i++)await S.dbPut('messages',{id:'test-allow-'+i,sessionId:'test-allowed',role:i%2?'assistant':'user',content:'allowed-'+i,createdAt:now+i});
  await S.dbPut('messages',{id:'test-private',sessionId:'test-denied',role:'user',content:'PRIVATE_CAMPAIGN_SENTINEL',createdAt:now});
  const actor=await S.dbGet('characters','test-a');const evidence=await X.inspect('test-group',actor);
  const blocks=JSON.parse(evidence);assert(blocks.length===1&&blocks[0].记录.length===50,'查岗只读取白名单，每会话恰好最近50条');
  assert(blocks[0].记录[0].内容==='allowed-5'&&!evidence.includes('PRIVATE_CAMPAIGN'),'隔离跑团记录、排除旧记录');
  let session=await S.dbGet('sessions','test-group');session.scInspectionMode='off';await S.dbPut('sessions',session);
  assert((await X.inspect('test-group',actor)).includes('关闭'),'查岗关闭拒绝读取');
  session.scInspectionMode='ask';await S.dbPut('sessions',session);
  const denied=X.inspect('test-group',actor);
  const rejectPoll=setInterval(()=>{const b=w.document.getElementById('sc-deny');if(b){clearInterval(rejectPoll);b.click();}},20);
  assert((await denied).includes('拒绝'),'逐次申请拒绝路径');
  const approved=X.inspect('test-group',actor);
  const allowPoll=setInterval(()=>{const b=w.document.getElementById('sc-allow');if(b){clearInterval(allowPoll);b.click();}},20);
  assert(JSON.parse(await approved)[0].记录.length===50,'逐次申请允许路径');
  await S.kvRemove('sc_prompt_review');
  const review=X.review();const reviewPoll=setInterval(()=>{const b=w.document.getElementById('sc-review-no');if(b){clearInterval(reviewPoll);b.click();}},20);
  assert(await review===false&&!await S.kvGet('sc_prompt_review'),'暂不接受内置指令不会保存同意');
  await S.kvSet('sc_prompt_review',X.reviewVersion);
  const map=C._getRelatedSessionsForCrossMemory(session,await S.dbGetAll('sessions'),true,await S.dbGetAll('messages'));
  assert(map.length===0,'默认跨会话记忆不绕过查岗权限');
  session.scInspectionMode='off';await S.dbPut('sessions',session);
  S.set(get('CONFIG.STORAGE_KEYS.API_KEY'),'test-only');S.set(get('CONFIG.STORAGE_KEYS.BASE_URL'),'https://unused.invalid/v1');
  const seen=[];let failB=true;
  C._postChatCompletionsAndParse=async params=>{const txt=JSON.stringify(params.payload.messages);seen.push(txt);if(txt.includes('ONLY_PERSONA_B')&&failB){failB=false;throw Error('SIMULATED_RETRY');}return {choices:[{message:{content:txt.includes('ONLY_PERSONA_A')?'[消息]A_FIRST_REPLY':'[消息]B_SECOND_REPLY'}}]};};
  C.currentSessionId='test-group';C.currentSession=session;
  const round={id:'test-round-'+now,sessionId:session.id,actorIds:['test-a','test-b'],next:0,userMessage:'测试依次回复',history:[],done:false};
  await S.kvSet('sc_round_'+session.id,round);
  try{await X.runRound(round);}catch(e){assert(e.message==='SIMULATED_RETRY','第二角色失败暂停');}
  assert(round.next===1,'已完成角色进度保留');
  assert(seen[0].includes('ONLY_PERSONA_A')&&!seen[0].includes('ONLY_PERSONA_B'),'第一请求只有本角色私有人设');
  assert(seen[1].includes('ONLY_PERSONA_B')&&!seen[1].includes('ONLY_PERSONA_A')&&seen[1].includes('A_FIRST_REPLY'),'第二角色收到前一发言，未收到前一角色私有人设');
  await X.runRound(await S.kvGet('sc_round_'+session.id));
  const generated=(await S.dbGetAll('messages')).filter(m=>m.scRoundId===round.id);
  assert(generated.length===2&&new Set(generated.map(m=>m.characterId)).size===2,'重试仅补失败角色、不重复已完成回复');
  assert(X.requests.get(session.id).every(r=>!JSON.stringify(r).includes('test-only')),'请求检查器不包含密钥');
  await P.saveConfig({enabled:true,proactiveMin:0,proactiveMax:0,dndStart:0,dndEnd:0});
  const due=now-7200000;await S.kvSet(P.LOCAL_TASKS_KEY,[{taskId:'test-overdue-'+now,sessionId:session.id,body:'晚到的16点消息',dueAt:due,characterId:'test-b',characterName:'Shadow'}]);
  await P._reconcileLocalDueTasks();await P._reconcileLocalDueTasks();
  const scheduled=await S.dbGet('messages','push_test-overdue-'+now);assert(scheduled.createdAt===due&&scheduled.deliveredAt>=now,'补发保留计划时间，另记实际投递时间');
  assert((await S.dbGetAll('messages')).filter(m=>m.id==='push_test-overdue-'+now).length===1,'补发幂等');
  assert(scheduled.content.includes('[消息|Shadow]'),'补发保持实际发送角色');
  assert((await C._collectProactivePreviewFallbackChunks(session.id)).length===0,'定时预览不冒充当前回复');
  assert(C._formatMessageLineBreaksForDisplay('$\\rightarrow$')==='→','聊天气泡箭头显示');
  await S.dbPut('album',{id:'test-blob',type:'image',data:new w.Blob(['media-bytes'],{type:'image/png'})});
  const snapshot=await B.snapshot();assert(snapshot.data.album.find(r=>r.id==='test-blob').data.__scBlob===true,'二进制图片编码进备份');
  await S.dbPut('messages',{id:'test-stale',sessionId:session.id,content:'obsolete',role:'user',createdAt:now});
  await B.importAll(snapshot);
  assert(!await S.dbGet('messages','test-stale'),'完整导入替换旧端新增数据');
  const media=await S.dbGet('album','test-blob');assert(await media.data.text()==='media-bytes','图片备份恢复无损');
  const count=(await S.dbGetAll('messages')).length;
  try{await B.importAll({version:1,exportMode:'empty',data:{}});throw Error('should reject');}catch(e){assert(e.message!=='should reject','拒绝空备份');}
  assert((await S.dbGetAll('messages')).length===count,'无效导入未清空数据');
  const presetKey=get('CONFIG.STORAGE_KEYS.API_CONFIG_PRESETS');const oldPresets=S.get(presetKey);
  try {
    S.set(presetKey,{'test-config':{name:'测试预设',data:{apiKey:'fake',baseUrl:'https://example.invalid',model:'test-model'}}});
    await C.openSession('test-group');
    w.document.querySelector('#chat-menu .yd-chat-menu-icon').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    await new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(w.document.getElementById('page-chat-settings').classList.contains('yd-page--active')){clearInterval(timer);resolve();}else if(++n>100){clearInterval(timer);reject(Error('群聊设置入口未打开'));}},30);});
    assert(w.document.querySelector('[data-actor-api] option[value="test-config"]')?.textContent==='测试预设','对象格式 API 预设可通过群聊三点入口打开');
    assert(X.configFor({scApiPresetId:'test-config'}).model==='test-model','独立角色正确读取对象格式 API 预设');
  }finally{S.set(presetKey,oldPresets);}
  await C.openSessionSettings();
  assert(w.document.querySelector('#sc-group-mode').value==='independent','群聊模式设置回显');
  assert(!w.document.getElementById('page-shop')&&!w.document.getElementById('chat-btn-gift'),'购物页面与聊天入口已移除');
  assert(w.getComputedStyle(w.document.getElementById('dock')).display==='none','首页无底部四入口');
  assert(!w.document.getElementById('sc-desktop-toggle'),'仅保留 SC 桌面');
  const backupConfirm=B.confirm('测试取消导入');
  const backupPoll=setInterval(()=>{const b=w.document.getElementById('sc-backup-cancel');if(b){clearInterval(backupPoll);b.click();}},20);
  assert(await backupConfirm===false,'备份确认框可以取消');
  await U.home();get("State.switchPage('page-homescreen')");
  assert(['page-live','page-share','page-notebook','page-widgets','page-map','page-calendar','page-music','page-settings-beautify-new-widget'].every(id=>!w.document.getElementById(id)),'指定模块页面已移除');
  assert(!w.document.getElementById('settings-widgets-beautify')&&!w.document.body.textContent.includes('屏幕布局预览')&&!w.document.body.textContent.includes('组件内容'),'组件与布局设置已移除');
  assert([...w.document.querySelectorAll('.sc-apps [data-icon]')].every(el=>!U.removed.has(el.dataset.icon)),'桌面无已移除功能入口');
  const iconStyle=w.getComputedStyle(w.document.querySelector('.sc-apps button>span'));
  assert(iconStyle.borderRadius==='10px'&&iconStyle.color==='rgb(255, 255, 255)'&&iconStyle.backgroundColor==='rgb(164, 135, 70)','图标固定小圆角金底白色');
  assert(!w.document.getElementById('settings-manual')&&!w.document.querySelector('[data-icon=manual]'),'手册入口已移除');
  const wallpaperKey=get('CONFIG.STORAGE_KEYS.WALLPAPER'), oldWallpaper=S.get(wallpaperKey), H=get('Homescreen');
  try {
    await S.dbPut('album',{id:'test-wallpaper',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='});
    await H.setWallpaper((await S.dbGet('album','test-wallpaper')).data,'test-wallpaper');
    assert(w.getComputedStyle(w.document.getElementById('wallpaper')).backgroundImage.includes('data:image/png'),'自选壁纸不再被白色样式遮挡');
    await H.loadWallpaper();
    assert(w.document.getElementById('wallpaper').style.backgroundImage.includes('data:image/png'),'重新加载保留所选壁纸');
    w.document.getElementById('wallpaper-reset').click();
    await new Promise(resolve=>setTimeout(resolve,80));
    assert(!S.get(wallpaperKey)&&!w.document.getElementById('wallpaper').style.backgroundImage&&w.getComputedStyle(w.document.getElementById('page-homescreen')).backgroundImage.includes('repeating-linear-gradient'),'恢复默认木纹背景');
    assert(!!await S.dbGet('album','test-wallpaper'),'恢复默认保留相册图片');
  }finally{S.set(wallpaperKey,oldWallpaper);await H.loadWallpaper();}
  await runNovemberTests(w,get,assert);
  output.textContent+='\nALL PASS — 模拟 API，无真实付费请求。';
 }catch(e){output.textContent+='\nFAIL '+e.stack;}
};



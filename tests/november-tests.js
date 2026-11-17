// Synthetic data and mock APIs only; called by browser-tests.js on localhost.
async function runNovemberTests(w,get,assert) {
 const S=get('Storage'),C=get('Chat'),X=get('SCChat'),M=get('SCMoments'),Studio=get('MomentsImageStudio'),T=get('TaPages'),I=get('ImageGenerationApi'),K=get('CONFIG.STORAGE_KEYS');
 const wait=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('等待界面结果超时');};
 const sid='test-november';const now=Date.now();
 const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 for(const [id,name] of [['test-a','Graves'],['test-b','Shadow']])await S.dbPut('characters',{id,name,description:'Test character',avatar:pixel});
 await S.dbPut('sessions',{id:sid,title:'测试配图剧情',participantCharacterIds:['test-a','test-b'],scInspectionMode:'allow',scInspectionAllow:['test-allowed'],mode:0});
 await S.dbPut('messages',{id:'test-nov-before',sessionId:sid,role:'user',content:'SELECTED_SCENE: meet in a snowy forest',createdAt:now-10000});
 await S.dbPut('messages',{id:'test-nov-middle',sessionId:sid,role:'assistant',characterName:'Graves',content:'SELECTED_ACTION: look at a map',createdAt:now-5000});
 await S.dbPut('messages',{id:'test-nov-after',sessionId:sid,role:'user',content:'EXCLUDED_PRIVATE_SENTINEL',createdAt:now});
 await S.kvSet('sc_inspection_audit_'+sid,[{id:'audit-a',at:now-7500,actor:'Graves',accepted:true,targets:[]},{id:'audit-b',at:now-2500,actor:'Shadow',accepted:false,targets:[]}]);
 await C.openSession(sid);await C.renderMessages();
 const order=()=>[...w.document.querySelector('#chat-scroll').children].map(el=>el.dataset.scAudit||el.dataset.msgId).filter(Boolean);
 let ids=order();assert(ids.indexOf('test-nov-before')<ids.indexOf('audit-a')&&ids.indexOf('audit-a')<ids.indexOf('test-nov-middle')&&ids.indexOf('test-nov-middle')<ids.indexOf('audit-b')&&ids.indexOf('audit-b')<ids.indexOf('test-nov-after'),'连续查岗提示按时间插入聊天，不固定在末尾');
 await C.renderMessages();assert(w.document.querySelectorAll('[data-sc-audit]').length===2,'重绘不重复、不丢失查岗提示');
 await X.inspect(sid,await S.dbGet('characters','test-a'));assert(w.document.querySelectorAll('[data-sc-audit]').length===3,'再次查岗立即显示新的独立提示');
 const Ch=get('Character'),lang=w.document.getElementById('char-default-language'),tz=w.document.getElementById('char-region-timezone'),sw=w.document.getElementById('char-multilingual-enabled');
 Ch.setupChatI18nFormListeners();tz.value='America/New_York';lang.value='zh';lang.dispatchEvent(new w.Event('change'));
 assert(tz.value==='America/New_York','中文默认语言不覆盖角色时区');
 lang.value='en';lang.dispatchEvent(new w.Event('change'));tz.value='Asia/Shanghai';tz.dispatchEvent(new w.Event('change'));sw.checked=true;sw.dispatchEvent(new w.Event('change'));
 assert(lang.value==='en'&&tz.value==='Asia/Shanghai'&&sw.checked&&Ch._readChatI18nFromForm().enabled,'时区和双语开关不改写语言，英语角色可处于中国');
 const saved=Ch._readChatI18nFromForm();Ch._applyChatI18nToForm({chat_i18n:saved});Ch._stopChatI18nTimeTicker();
 assert(lang.value==='en'&&tz.value==='Asia/Shanghai'&&sw.checked,'语言和地区独立保存回显');
 assert(C.normalizeCharacter({chat_i18n:saved}).multilingualEnabled===true,'发送上下文不因中国地区禁用双语');
 let specSeen=null,imageCalls=0,edited=null;
 const oldTask=T._runAiFeatureTask,oldEdit=I.editFromPromptAndImageUrls,oldGenerate=I.generateFromDescription;
 const configKeys=[K.IMAGE_GEN_BASE_URL,K.IMAGE_GEN_API_KEY,K.IMAGE_GEN_MODEL],oldConfigs=configKeys.map(k=>S.get(k));
 try {
  T._runAiFeatureTask=async spec=>{specSeen=spec;return {raw:JSON.stringify({prompt:'Two soldiers study a map in a snowy forest, soft morning light, medium shot.',characterIds:['test-a','test-b']})};};
  I.editFromPromptAndImageUrls=async(prompt,refs)=>{imageCalls++;edited={prompt,refs};return {images:[{dataUrl:pixel}]};};
  I.generateFromDescription=async()=>{throw Error('有默认垫图时不应调用纯文生图');};
  S.set(configKeys[0],'https://example.invalid/v1');S.set(configKeys[1],'fake');S.set(configKeys[2],'gpt-image-1');
  await C.openSessionSettings();w.document.getElementById('sc-chat-moments').click();await wait(()=>w.document.getElementById('sc-moments-history'));
  assert(w.document.getElementById('yd-chat-settings-session-memory').nextElementSibling.id==='sc-chat-moments','朋友圈入口紧跟记忆增强');
  for(const id of ['test-nov-before','test-nov-middle'])w.document.querySelector(`#sc-moments-history input[value="${id}"]`).checked=true;
  w.document.getElementById('sc-moments-prompt').click();await wait(()=>w.document.getElementById('page-moments-image-studio').classList.contains('yd-page--active')&&w.document.getElementById('mis-prompt').value.includes('Two soldiers'));
  assert(specSeen.userMessage.includes('SELECTED_SCENE')&&specSeen.userMessage.includes('SELECTED_ACTION')&&!specSeen.userMessage.includes('EXCLUDED_PRIVATE_SENTINEL'),'提示词请求只包含勾选的聊天片段');
  assert(specSeen.systemMessages.join('').includes('English')&&imageCalls===0,'先生成英文提示词，不自动调用生图');
  assert(Studio._refDataUrls.length===2,'自动选择两个出镜角色的人设图');
  const albumCount=(await S.dbGetAll('album')).length;
  await Studio._runGenerate();await wait(async()=>imageCalls===1&&(await S.dbGetAll('album')).length>albumCount);
  assert(edited.refs.length===2&&edited.prompt.includes('Reference image 1')&&edited.prompt.includes('Reference image 2'),'确认生图后发送每个角色的垫图与身份对应说明');
  assert((await S.dbGetAll('album')).some(a=>a.data===pixel&&a.name==='生图.png'),'成品自动保存到软件相册');
  const changed=await S.dbGet('characters','test-a');
  changed.avatar=pixel.replace('image/png','image/PNG');await S.dbPut('characters',changed);
  await M.addDefaultReferences('',get('State.momentsImageStudioRecordId'));
  assert(Studio._refDataUrls.length===2&&Studio._refDataUrls[0]===changed.avatar,'更换人设图时替换旧默认垫图，不累积旧面孔');
  let invalidActor=false;try{M.parsePrompt('{"prompt":"A scene","characterIds":["unknown"]}',[]);}catch{invalidActor=true;}assert(invalidActor,'拒绝模型编造的角色ID');
  let refused=false;try{M.parsePrompt('{"prompt":"中文","characterIds":[]}',[]);}catch{refused=true;}assert(refused,'拒绝不合要求的中文提示词输出');
 }finally{T._runAiFeatureTask=oldTask;I.editFromPromptAndImageUrls=oldEdit;I.generateFromDescription=oldGenerate;configKeys.forEach((k,i)=>S.set(k,oldConfigs[i]));}
}

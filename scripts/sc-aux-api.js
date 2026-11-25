// Separate credentials and model for optional world content; never fall back to chat.
const SCAuxAPI = {
  key:'sc_aux_api_v1',
  config(){const raw=Storage.get(this.key)||{};return {apiKey:String(raw.apiKey||'').trim(),baseUrl:String(raw.baseUrl||'').trim().replace(/\/+$/,'').replace(/\/chat\/completions$/i,''),model:String(raw.model||'').trim(),maxTokens:Number.isInteger(Number(raw.maxTokens))&&Number(raw.maxTokens)>=128&&Number(raw.maxTokens)<=32768?Number(raw.maxTokens):2048};},
  configured(){const c=this.config();return !!(c.apiKey&&c.baseUrl&&c.model);},
  requireConfig(){const c=this.config();if(!this.configured())throw Error('请先在设置中配置辅助 API；不会回退到对话 API');return c;},
  async request(messages,extra={},signal){
    const c=this.requireConfig();
    try{return await Chat._postChatCompletionsAndParse({baseUrl:c.baseUrl,apiKey:c.apiKey,signal,payload:{...extra,model:c.model,messages,stream:false,temperature:extra.temperature??0.7,max_tokens:c.maxTokens}});}
    catch(error){throw Error('辅助 API 调用失败：'+String(error.message||error).split(c.apiKey).join('[已隐藏密钥]'));}
  },
  async feature(spec={}){const messages=TaPages._buildAiMessagesWithOptionalRealtime(spec.systemMessages,spec.userMessage,spec.userContentParts);const data=await this.request(messages,spec.extraPayload||{});const raw=TaPages._normalizeAiContent(data?.choices?.[0]?.message?.content);return {data,raw,parsed:typeof spec.parse==='function'?spec.parse(raw):raw};},
  profilesKey:'sc_aux_api_profiles_v1',
  profiles(){const saved=Storage.get(this.profilesKey);if(saved&&Array.isArray(saved.items)&&saved.items.length&&saved.items.some(p=>p.id===saved.activeId))return saved;return {activeId:'default',items:[{id:'default',name:'默认',config:Storage.get(this.key)||{}}]};},
  storeProfile(config){const book=this.profiles();book.items.find(p=>p.id===book.activeId).config={...config};Storage.set(this.profilesKey,book);Storage.set(this.key,{...config});this.savedDraft=JSON.stringify(config);},
  activate(id){this.modelRequest?.abort();this.modelRequest=null;const book=this.profiles(),profile=book.items.find(p=>p.id===id);if(!profile)return;book.activeId=id;Storage.set(this.profilesKey,book);Storage.set(this.key,{...profile.config});this.loadForm();},
  loadForm(){const book=this.profiles();this.draft={...this.config()};this.savedDraft=JSON.stringify(this.draft);const select=document.getElementById('aux-api-config-select');select.replaceChildren(...book.items.map(p=>new Option(p.name,p.id)));select.value=book.activeId;this.renderForm();this.status('');},
  status(text){document.getElementById('aux-api-status').textContent=text;},
  renderForm(){const d=this.draft;document.getElementById('aux-base-url-display').textContent=d.baseUrl||'未设置';document.getElementById('aux-api-key-display').textContent=d.apiKey?'已设置（隐藏）':'未设置';document.getElementById('aux-api-max-tokens-display').textContent=String(d.maxTokens);const select=document.getElementById('aux-api-model');select.replaceChildren(new Option(d.model||'请选择',d.model||''));},
  async edit(field,title,type='text'){
    const dialog=await SCUI.modal(title,'<label><input id="aux-edit-value" class="yd-settings-input" autocomplete="off" type="'+type+'"></label><div class="sc-dialog-actions"><button data-cancel>取消</button><button data-confirm>确定</button></div><p role="status" data-error></p>');
    const input=dialog.querySelector('input');input.value=this.draft[field]||'';if(type==='number'){input.min='128';input.max='32768';input.step='1';}input.focus();
    dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.querySelector('[data-confirm]').onclick=()=>{const value=input.value.trim();if(field==='baseUrl'&&value){try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol))throw Error();}catch{dialog.querySelector('[data-error]').textContent='请输入有效的 HTTP 或 HTTPS 地址';return;}}
      if(field==='maxTokens'&&(!Number.isInteger(Number(value))||Number(value)<128||Number(value)>32768)){dialog.querySelector('[data-error]').textContent='请输入128至32768的整数';return;}
      if(field==='baseUrl'||field==='apiKey'){this.modelRequest?.abort();this.modelRequest=null;}this.draft[field]=field==='maxTokens'?Number(value):value;this.renderForm();this.status('有未保存的更改');dialog.close();};
  },
  async fetchModels(){
    const d=this.draft;if(!d.baseUrl||!d.apiKey){this.status('请先填写辅助 API 地址和 API Key');return;}
    const stamp=JSON.stringify([this.profiles().activeId,d.baseUrl,d.apiKey]);if(this.modelRequest&&this.modelStamp===stamp)return;
    this.modelRequest?.abort();const controller=new AbortController();this.modelRequest=controller;this.modelStamp=stamp;const timer=setTimeout(()=>controller.abort(),15000);this.status('正在拉取模型列表…');
    try{const base=d.baseUrl.replace(/\/+$/,'').replace(/\/chat\/completions$/i,'');const res=await fetch(base+'/models',{headers:{Authorization:'Bearer '+d.apiKey},signal:controller.signal});if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();if(controller.signal.aborted||stamp!==JSON.stringify([this.profiles().activeId,this.draft.baseUrl,this.draft.apiKey]))return;
      const ids=[...new Set((Array.isArray(data.data)?data.data:[]).map(m=>typeof m==='string'?m:m?.id).filter(id=>typeof id==='string'&&id))];const select=document.getElementById('aux-api-model');if(this.draft.model&&!ids.includes(this.draft.model))ids.unshift(this.draft.model);select.replaceChildren(new Option('请选择',''),...ids.map(id=>new Option(id,id)));select.value=this.draft.model||'';this.status(ids.length?'模型列表已更新，选择后点击存储':'未找到模型，可手动填写');
    }catch(error){if(this.modelRequest===controller)this.status(controller.signal.aborted?'模型列表请求已取消或超时，可重试或手动填写':'拉取失败：'+String(error.message).split(d.apiKey).join('[隐藏]')+'；可手动填写模型');}
    finally{clearTimeout(timer);if(this.modelRequest===controller)this.modelRequest=null;}
  },
  init(){
    const source=document.getElementById('page-settings-api'),page=source.cloneNode(true);page.querySelector('#api-row-chat-rounds').remove();page.querySelector('#api-row-temperature').remove();page.querySelector('#api-row-auto-vision').closest('.yd-settings-group').remove();page.querySelector('#api-row-stream').closest('.yd-settings-group').remove();
    for(const node of page.querySelectorAll('[id]'))node.id='aux-'+node.id;page.id='page-settings-aux-api';page.querySelector('.yd-settings-nav__title').textContent='辅助 API 设置';page.querySelector('#aux-api-config-add').setAttribute('aria-label','新增辅助 API 配置');page.querySelector('#aux-api-model').setAttribute('aria-label','辅助模型选择');page.querySelector('#aux-api-row-max-tokens .yd-settings-row__label').textContent='最大输出 Token';
    const intro=document.createElement('p');intro.className='aux-api-help';intro.textContent='驻地简报、游戏、论坛、朋友圈文字使用当前辅助配置；未配置或失败不回退到对话API。保存不会发起模型生成请求。';page.querySelector('.yd-page-content').prepend(intro);
    const manual=document.createElement('button');manual.className='yd-settings-row yd-settings-row--api-detail';manual.textContent='手动填写模型名称';manual.id='aux-api-model-manual';page.querySelector('#aux-api-row-model').parentElement.append(manual);
    const fetchButton=document.createElement('button');fetchButton.className='yd-settings-row yd-settings-row--api-detail';fetchButton.textContent='拉取模型列表';fetchButton.id='aux-api-model-fetch';manual.before(fetchButton);const status=document.createElement('p');status.id='aux-api-status';status.className='aux-api-help';status.setAttribute('role','status');page.querySelector('.yd-settings-detail-actions').append(status);source.parentElement.append(page);
    document.getElementById('settings-aux-api').onclick=()=>{this.loadForm();State.switchPage(page.id);};page.querySelector('#aux-settings-api-back').onclick=()=>{if(JSON.stringify(this.draft)!==this.savedDraft&&!confirm('辅助API配置未保存，确定返回吗？'))return;this.modelRequest?.abort();this.modelRequest=null;State.switchPage('page-settings');};
    for(const [id,field,title,type] of [['base-url','baseUrl','API 地址','url'],['api-key','apiKey','API Key','password'],['max-tokens','maxTokens','最大输出 Token','number']])page.querySelector('#aux-api-row-'+id).onclick=()=>this.edit(field,title,type);
    manual.onclick=()=>this.edit('model','模型名称');fetchButton.onclick=()=>this.fetchModels();page.querySelector('#aux-api-model').onfocus=()=>this.fetchModels();page.querySelector('#aux-api-model').onchange=e=>{this.draft.model=e.target.value;this.status('有未保存的更改');};
    page.querySelector('#aux-api-config-select').onchange=e=>{if(JSON.stringify(this.draft)!==this.savedDraft&&!confirm('当前辅助API配置有未保存更改，确定切换吗？')){e.target.value=this.profiles().activeId;return;}this.activate(e.target.value);};
    page.querySelector('#aux-api-config-add').onclick=()=>{const name=prompt('请输入辅助 API 配置名称：');if(!name?.trim())return;const book=this.profiles(),id=State.generateId();book.items.push({id,name:name.trim(),config:{...this.draft}});Storage.set(this.profilesKey,book);this.activate(id);this.status('已新增配置');};
    page.querySelector('#aux-api-config-delete').onclick=()=>{const book=this.profiles(),profile=book.items.find(p=>p.id===book.activeId);if(!confirm('确定删除辅助API配置“'+profile.name+'”？'))return;book.items=book.items.filter(p=>p.id!==book.activeId);if(!book.items.length)book.items=[{id:'default',name:'默认',config:{}}];book.activeId=book.items[0].id;Storage.set(this.profilesKey,book);this.activate(book.activeId);};
    page.querySelector('#aux-save-api').onclick=()=>{this.storeProfile(this.draft);this.status('已存储，当前辅助配置已生效');};
  }
};
SCAuxAPI.init();

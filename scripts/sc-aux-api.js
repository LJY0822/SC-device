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
  init(){
    const page=document.createElement('div');page.id='page-settings-aux-api';page.className='yd-page yd-page--settings-detail';
    page.innerHTML='<div class="yd-page-header yd-settings-nav"><button class="yd-header-btn" data-aux-back aria-label="返回">‹</button><div class="yd-page-header__center">辅助 API 设置</div></div><div class="yd-page-content"><form class="sc-settings-block" id="aux-api-form"><p>用于驻地简报、游戏场景与互动、论坛，以及朋友圈文案和评论。对话与总结记忆继续使用原对话 API，图片仍使用生图 API。请选择你认为成本合适的文字模型；未配置或失败时不回退。</p><label>Base URL<input id="aux-api-base" type="url" placeholder="https://服务地址/v1" required></label><label>API Key<input id="aux-api-key" type="password" autocomplete="off" required></label><label>模型名称<input id="aux-api-model" required placeholder="填写服务商提供的模型 ID"></label><label>最大输出 Token<input id="aux-api-max" type="number" min="128" max="32768" value="2048" required></label><button type="submit">保存辅助 API 设置</button><p role="status" id="aux-api-status"></p></form></div>';
    document.querySelector('#page-settings-api').parentElement.append(page);
    const fill=()=>{const c=this.config();for(const [id,key]of [['base','baseUrl'],['key','apiKey'],['model','model'],['max','maxTokens']])document.getElementById('aux-api-'+id).value=c[key];document.getElementById('aux-api-status').textContent='';};
    document.getElementById('settings-aux-api').onclick=()=>{fill();State.switchPage(page.id);};page.querySelector('[data-aux-back]').onclick=()=>State.switchPage('page-settings');
    page.querySelector('form').onsubmit=event=>{event.preventDefault();const url=new URL(document.getElementById('aux-api-base').value.trim());if(!['https:','http:'].includes(url.protocol))return;Storage.set(this.key,{baseUrl:url.href.replace(/\/+$/,''),apiKey:document.getElementById('aux-api-key').value.trim(),model:document.getElementById('aux-api-model').value.trim(),maxTokens:Number(document.getElementById('aux-api-max').value)});document.getElementById('aux-api-status').textContent='已保存，不会自动发起测试请求。';};
  }
};
SCAuxAPI.init();

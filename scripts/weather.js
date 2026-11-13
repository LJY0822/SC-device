const Weather = {
  configKey:'sc_weather_cities_v1', states:new Map(), requests:new Map(), activeId:'beijing',
  cities:[
    {id:'new-york',name:'纽约',country:'美国',latitude:40.7128,longitude:-74.006},
    {id:'beijing',name:'北京',country:'中国',latitude:39.9042,longitude:116.4074},
    {id:'shanghai',name:'上海',country:'中国',latitude:31.2304,longitude:121.4737},
    {id:'seattle',name:'西雅图',country:'美国',latitude:47.6062,longitude:-122.3321},
    {id:'kyiv',name:'基辅',country:'乌克兰',latitude:50.4501,longitude:30.5234},
    {id:'muscat',name:'马斯喀特',country:'阿曼',latitude:23.588,longitude:58.3829},
    {id:'guanajuato',name:'瓜纳华托',country:'墨西哥',latitude:21.019,longitude:-101.2574},
    {id:'monterrey',name:'蒙特雷',country:'墨西哥',latitude:25.6866,longitude:-100.3161},
    {id:'al-mazrah',name:'马兹拉',english:'Al Mazrah',fictional:true},
    {id:'las-almas',name:'拉斯阿玛斯',english:'Las Almas',fictional:true}
  ],
  label(code) {
    if(code===0)return '晴';if(code<=3)return '多云 / 阴';if([45,48].includes(code))return '雾';
    if(code>=95)return '雷雨';if([71,73,75,77,85,86].includes(code))return '雪';return '雨';
  },
  valid(d) {
    const codes=[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99];
    const c=d?.current,f=d?.daily;
    return !!c&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(c.time)&&codes.includes(c.weather_code)
      &&['temperature_2m','relative_humidity_2m','apparent_temperature','wind_speed_10m'].every(k=>Number.isFinite(c[k]))
      &&Array.isArray(f?.time)&&f.time.length===7&&f.time.every((t,i)=>/^\d{4}-\d{2}-\d{2}$/.test(t)&&codes.includes(f.weather_code?.[i])&&Number.isFinite(f.temperature_2m_min?.[i])&&Number.isFinite(f.temperature_2m_max?.[i]));
  },
  validCity(c) { return c&&typeof c.id==='string'&&typeof c.name==='string'&&c.name.trim()&&Number.isFinite(c.latitude)&&Math.abs(c.latitude)<=90&&Number.isFinite(c.longitude)&&Math.abs(c.longitude)<=180; },
  config() {
    const value=Storage.get(this.configKey);
    const custom=Array.isArray(value?.custom)?value.custom.filter(c=>this.validCity(c)&&!this.cities.some(p=>p.id===c.id)):[];
    const ids=new Set([...this.cities,...custom].map(c=>c.id));
    const selected=Array.isArray(value?.selected)?[...new Set(value.selected.filter(id=>ids.has(id)))]:['beijing'];
    return {selected:selected.length?selected:['beijing'],bindings:value?.bindings&&typeof value.bindings==='object'?value.bindings:{},custom};
  },
  all(config=this.config()) { return [...this.cities,...config.custom]; },
  source(city,config=this.config()) { return city?.fictional?this.all(config).find(c=>c.id===config.bindings[city.id]&&!c.fictional):city; },
  cacheKey(source) { return `sc_weather_v2_${source.latitude}_${source.longitude}`; },
  cached(source) {
    try {
      const raw=localStorage.getItem(this.cacheKey(source)) || (source.id==='beijing'?localStorage.getItem('sc_beijing_weather_v1'):null);
      const cached=JSON.parse(raw);return this.valid(cached?.data)?cached:null;
    }catch{return null;}
  },
  endpoint(source) {
    const query=new URLSearchParams({latitude:source.latitude,longitude:source.longitude,current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min',timezone:'auto',forecast_days:7,temperature_unit:'celsius',wind_speed_unit:'kmh'});
    return 'https://api.open-meteo.com/v1/forecast?'+query;
  },
  async load(source,force=false) {
    const key=this.cacheKey(source);if(this.requests.has(key))return this.requests.get(key);
    const work=(async()=>{
      const cached=this.states.get(key) || this.cached(source);
      if(!force&&cached&&Date.now()-cached.at>=0&&Date.now()-cached.at<900000&&!cached.error){this.states.set(key,cached);return cached;}
      try {
        const response=await fetch(this.endpoint(source),{signal:AbortSignal.timeout(12000),credentials:'omit'});
        if(!response.ok)throw new Error('天气服务不可用');
        const data=await response.json();if(!this.valid(data))throw new Error('天气数据格式异常');
        const state={at:Date.now(),data};this.states.set(key,state);
        try{localStorage.setItem(key,JSON.stringify(state));}catch{}
        return state;
      }catch{
        const state={...(cached || {}),error:true};this.states.set(key,state);return state;
      }
    })();
    this.requests.set(key,work);
    try{return await work;}finally{this.requests.delete(key);}
  },
  rows() {
    const config=this.config(),all=this.all(config);
    return config.selected.map(id=>{
      const city=all.find(c=>c.id===id),source=this.source(city,config);
      const state=source?(this.states.get(this.cacheKey(source)) || this.cached(source)):null;
      return {city,source,state};
    });
  },
  notify() { window.dispatchEvent(new CustomEvent('sc:weather-updated')); },
  async refresh(force=false) {
    const sources=new Map(this.rows().filter(r=>r.source).map(r=>[this.cacheKey(r.source),r.source]));
    const button=document.getElementById('weather-refresh');if(button)button.disabled=true;
    try { await Promise.all([...sources.values()].map(source=>this.load(source,force))); }
    finally{if(button)button.disabled=false;this.renderDetails();this.notify();}
  },
  init() {
    document.getElementById('weather-back')?.addEventListener('click',()=>State.backToHome());
    document.getElementById('weather-refresh')?.addEventListener('click',()=>void this.refresh(true));
    document.getElementById('weather-save-cities')?.addEventListener('click',()=>this.save());
    document.getElementById('weather-city-select')?.addEventListener('change',event=>{this.activeId=event.target.value;this.renderDetails();});
    document.getElementById('weather-search-form')?.addEventListener('submit',event=>{event.preventDefault();void this.search();});
    window.addEventListener('yd:pagechange',event=>{if(event.detail?.to==='page-weather')this.open();});
    window.addEventListener('focus',()=>void this.refresh());
    void this.refresh();
  },
  open() { this.draft=structuredClone(this.config());this.renderChoices();this.renderDetails();void this.refresh(); },
  renderChoices() {
    const root=document.getElementById('weather-city-options');if(!root)return;
    const e=SCUI.escape,config=this.draft,all=this.all(config),real=all.filter(c=>!c.fictional);
    root.innerHTML=all.map(city=>`<div class="weather-city-option"><label><input type="checkbox" data-weather-city="${e(city.id)}" ${config.selected.includes(city.id)?'checked':''}><span>${e(city.name)}<small>${e(city.fictional?city.english+' · 虚构地点':city.country || '现实城市')}</small></span></label>${city.fictional?`<select aria-label="${e(city.name)}的现实天气来源" data-weather-binding="${e(city.id)}"><option value="">选择现实天气来源</option>${real.map(source=>`<option value="${e(source.id)}" ${config.bindings[city.id]===source.id?'selected':''}>${e(source.name)}${source.country?' · '+e(source.country):''}</option>`).join('')}</select>`:''}</div>`).join('');
    root.querySelectorAll('[data-weather-city]').forEach(input=>input.onchange=()=>{config.selected=input.checked?[...new Set([...config.selected,input.dataset.weatherCity])]:config.selected.filter(id=>id!==input.dataset.weatherCity);});
    root.querySelectorAll('[data-weather-binding]').forEach(select=>select.onchange=()=>config.bindings[select.dataset.weatherBinding]=select.value);
  },
  save() {
    const status=document.getElementById('weather-selection-status'),config=this.draft;
    if(!config?.selected.length){status.textContent='请至少选择一座城市。';return;}
    const all=this.all(config);
    if(config.selected.some(id=>!this.source(all.find(c=>c.id===id),config))){status.textContent='请为选中的虚构地点绑定一座现实城市。';return;}
    try{Storage.set(this.configKey,structuredClone(config));}catch{status.textContent='城市设置保存失败，请重试。';return;}
    status.textContent='已保存，首页将显示这些城市。';this.renderDetails();this.notify();void this.refresh();
  },
  async search() {
    const input=document.getElementById('weather-search'),root=document.getElementById('weather-search-results');
    const query=input.value.trim();if(query.length<2){root.textContent='请输入至少两个字或字母。';return;}
    const token=(this.searchToken || 0)+1;this.searchToken=token;root.textContent='正在搜索…';
    try {
      const response=await fetch('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:query,count:5,language:'zh',format:'json'}),{signal:AbortSignal.timeout(12000),credentials:'omit'});
      if(!response.ok)throw new Error('无法搜索');const data=await response.json();if(token!==this.searchToken)return;
      const cities=(Array.isArray(data.results)?data.results:[]).map(r=>({id:'geo-'+r.id,name:String(r.name || '').slice(0,80),country:String(r.country || '').slice(0,80),latitude:r.latitude,longitude:r.longitude})).filter(c=>this.validCity(c));
      root.replaceChildren();if(!cities.length){root.textContent='未找到城市，可尝试英文名或加上国家名称。';return;}
      for(const city of cities){const button=document.createElement('button');button.type='button';button.textContent=`${city.name}${city.country?' · '+city.country:''} ＋`;
        button.onclick=()=>{const existing=this.all(this.draft).find(c=>!c.fictional&&Math.abs(c.latitude-city.latitude)<0.02&&Math.abs(c.longitude-city.longitude)<0.02);const id=existing?.id || city.id;if(!existing&&!this.draft.custom.some(c=>c.id===id))this.draft.custom.push(city);this.draft.selected=[...new Set([...this.draft.selected,id])];this.renderChoices();root.replaceChildren();input.value='';};root.append(button);}
    }catch{if(token===this.searchToken)root.textContent='搜索失败，请联网后重试。';}
  },
  renderDetails() {
    const select=document.getElementById('weather-city-select');if(!select)return;
    const rows=this.rows(),e=SCUI.escape;
    if(!rows.some(r=>r.city.id===this.activeId))this.activeId=rows[0]?.city.id;
    select.innerHTML=rows.map(r=>`<option value="${e(r.city.id)}">${e(r.city.name)}</option>`).join('');select.value=this.activeId;
    const row=rows.find(r=>r.city.id===this.activeId);if(!row)return;
    const {city,source,state}=row,data=state?.data,usable=this.valid(data);
    document.getElementById('weather-now-temp').textContent=usable?`${data.current.temperature_2m}°C`:'--°C';
    document.getElementById('weather-now-cond').textContent=usable?`${city.name} · ${this.label(data.current.weather_code)} · 体感 ${data.current.apparent_temperature}°C`:city.name;
    document.getElementById('weather-details').textContent=usable?`湿度 ${data.current.relative_humidity_2m}% · 风速 ${data.current.wind_speed_10m} km/h`:'';
    document.getElementById('weather-source').textContent=city.fictional?`虚构地点 · 绑定 ${source?.name || '未设置'} 的现实天气，非游戏官方气候设定`:`现实天气来源：${source?.name || city.name}`;
    document.getElementById('weather-status').textContent=usable?`${state.error?'更新失败，显示上次缓存。':Date.now()-state.at>=900000?'上次缓存。':''}数据时间：${data.current.time.replace('T',' ')}（来源城市当地时间，天气模型估算）`:state?.error?'暂时无法获取天气，请联网后重试。':'正在获取天气…';
    const list=document.getElementById('weather-list');list.replaceChildren();
    if(usable)data.daily.time.forEach((date,i)=>{const item=document.createElement('div');item.className='weather-forecast-row';const day=document.createElement('span'),condition=document.createElement('span'),temperature=document.createElement('strong');day.textContent=date.slice(5);condition.textContent=this.label(data.daily.weather_code[i]);temperature.textContent=`${data.daily.temperature_2m_min[i]}～${data.daily.temperature_2m_max[i]}°C`;item.append(day,condition,temperature);list.append(item);});
  }
};

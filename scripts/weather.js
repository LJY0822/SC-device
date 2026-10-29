const Weather = {
  endpoint: 'https://api.open-meteo.com/v1/forecast?latitude=39.9042&longitude=116.4074&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=7',
  label(code) {
    if(code===0)return '晴'; if(code<=3)return '多云 / 阴'; if([45,48].includes(code))return '雾';
    if(code>=95)return '雷雨'; if([71,73,75,77,85,86].includes(code))return '雪';
    return '雨';
  },
  valid(d) {
    const codes=[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99];
    const c=d?.current, f=d?.daily;
    return !!c && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.time) && codes.includes(c.weather_code)
      && ['temperature_2m','relative_humidity_2m','apparent_temperature','wind_speed_10m'].every(k=>Number.isFinite(c[k]))
      && Array.isArray(f?.time) && f.time.length===7 && f.time.every((t,i)=>/^\d{4}-\d{2}-\d{2}$/.test(t)
        && codes.includes(f.weather_code?.[i]) && Number.isFinite(f.temperature_2m_min?.[i]) && Number.isFinite(f.temperature_2m_max?.[i]));
  },
  init() {
    document.getElementById('weather-back')?.addEventListener('click',()=>State.backToHome());
    document.getElementById('weather-refresh')?.addEventListener('click',()=>this.render(true));
    window.addEventListener('yd:pagechange',e=>{if(e.detail?.to==='page-weather')this.render();});
  },
  show(d) {
    const c=d.current, f=d.daily;
    document.getElementById('weather-now-temp').textContent=`${c.temperature_2m}°C`;
    document.getElementById('weather-now-cond').textContent=`北京 · ${this.label(c.weather_code)} · 体感 ${c.apparent_temperature}°C`;
    document.getElementById('weather-details').textContent=`湿度 ${c.relative_humidity_2m}% · 风速 ${c.wind_speed_10m} km/h`;
    const list=document.getElementById('weather-list'); list.replaceChildren();
    f.time.forEach((date,i)=>{const row=document.createElement('div');row.className='yd-weather-row';row.textContent=`${date.slice(5)}　${this.label(f.weather_code[i])}　${f.temperature_2m_min[i]}～${f.temperature_2m_max[i]}°C`;list.append(row);});
  },
  async render(force=false) {
    if(this.loading)return;
    const status=document.getElementById('weather-status'), button=document.getElementById('weather-refresh');
    let cached; try{cached=JSON.parse(localStorage.getItem('sc_beijing_weather_v1'));}catch{}
    const usable=this.valid(cached?.data);
    if(usable)this.show(cached.data);
    const stamp=d=>`数据时间：${d.current.time.replace('T',' ')}（北京时间，模型估算）`;
    if(!force && usable && Date.now()-cached.at>=0 && Date.now()-cached.at<900000){status.textContent=stamp(cached.data);return;}
    this.loading=true;button.disabled=true;status.textContent='正在获取北京天气…';
    try {
      const response=await fetch(this.endpoint,{signal:AbortSignal.timeout(12000),credentials:'omit'});
      if(!response.ok)throw new Error('天气服务暂不可用');
      const data=await response.json();if(!this.valid(data))throw new Error('天气数据格式异常');
      this.show(data);status.textContent=stamp(data);
      try{localStorage.setItem('sc_beijing_weather_v1',JSON.stringify({at:Date.now(),data}));}catch{}
    }catch{status.textContent=usable?`更新失败，以下为上次缓存。${stamp(cached.data)}`:'暂时无法获取北京天气，请联网后重试。';}
    finally{this.loading=false;button.disabled=false;}
  }
};

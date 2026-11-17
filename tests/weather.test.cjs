const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const cache=new Map(),settings=new Map();let calls=0;
const ctx=vm.createContext({console,Date,Map,Set,URLSearchParams,AbortSignal,localStorage:{getItem:k=>cache.get(k) || null,setItem:(k,v)=>cache.set(k,v)},Storage:{get:k=>settings.get(k),set:(k,v)=>settings.set(k,v)},fetch:async()=>{calls++;throw Error('offline');}});
vm.runInContext(fs.readFileSync('scripts/weather.js','utf8'),ctx);const W=vm.runInContext('Weather',ctx),beijing=W.cities.find(c=>c.id==='beijing');
const d={current:{time:'2026-11-12T09:00',weather_code:0,temperature_2m:12,apparent_temperature:10,relative_humidity_2m:60,wind_speed_10m:5},daily:{time:Array(7).fill('2026-11-12'),weather_code:Array(7).fill(0),temperature_2m_min:Array(7).fill(8),temperature_2m_max:Array(7).fill(15)}};
(async()=>{
 assert(W.valid(d));assert(!W.valid({}));assert(!W.valid({...d,current:{...d.current,temperature_2m:null}}));
 let state=await W.load(beijing,true);assert(state.error);assert(!state.data);
 cache.set('sc_beijing_weather_v1',JSON.stringify({at:0,data:d}));W.states.clear();state=await W.load(beijing,true);assert(state.error);assert.equal(state.data.current.temperature_2m,12);
 ctx.fetch=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,2));return {ok:true,json:async()=>d};};
 let before=calls;const results=await Promise.all([W.load(beijing,true),W.load(beijing,true)]);assert.equal(calls-before,1,'same-source requests are deduplicated');assert(!results[0].error);assert(cache.has(W.cacheKey(beijing)));
 before=calls;await W.load(beijing);assert.equal(calls,before,'fresh cache avoids network');
 settings.set(W.configKey,{selected:['beijing','al-mazrah'],bindings:{'al-mazrah':'beijing'},custom:[]});
 const rows=W.rows();assert.equal(rows.length,2);assert.equal(rows[1].source.id,'beijing');assert.equal(W.cacheKey(rows[0].source),W.cacheKey(rows[1].source));
 settings.get(W.configKey).bindings['al-mazrah']='muscat';assert.notEqual(W.cacheKey(W.rows()[1].source),W.cacheKey(beijing),'changed bindings never reuse the old source cache');
 settings.get(W.configKey).custom=[{id:'invalid',name:'bad',latitude:999,longitude:0}];assert.equal(W.config().custom.length,0);
 assert.equal(new URL(W.endpoint(beijing)).searchParams.get('timezone'),'auto');
 console.log('PASS weather: response validation, offline/legacy caches, refresh, request dedupe, city bindings, coordinate validation, local weather timezone');
})().catch(error=>{console.error(error);process.exitCode=1;});

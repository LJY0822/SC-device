const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const messages=[['u1','user'],['a1','assistant'],['a1b','assistant'],['u2','user'],['a2','assistant'],['system','system'],['a2b','assistant'],['u3','user'],['a3','assistant']].map(([id,role],i)=>({id,role,content:id,sessionId:'s',createdAt:i}));
messages.push({id:'other',role:'user',content:'other',sessionId:'other',createdAt:1});
let captured,record,page;
const studio={_onEnter:async()=>{},_runGenerate:async()=>{},_newRecord:()=>({id:'draft',draft:{}}),_loadStandaloneBundle:async()=>({}),_upsertStandaloneRecord(bundle,r){record=r;},_saveStandaloneBundle:async()=>{}};
const context=vm.createContext({console,Storage:{dbGetAll:async()=>messages},State:{switchPage(id){page=id;}},MomentsImageStudio:studio,SessionMemory:{_openRoundRangePicker(sid,mode,select){assert.equal(sid,'s');assert.equal(mode,'moments');return select({fr:2,tr:3},{isConnected:true});}}});
for(const f of ['chat.js','sc-moments.js'])vm.runInContext(fs.readFileSync('scripts/'+f,'utf8'),context);
context.capture=(sid,ids)=>{captured=Array.from(ids);return {prompt:'A selected scene',characterIds:[]};};
vm.runInContext('SCMoments.createPrompt=capture;SCMoments.references=async()=>({refs:[],missing:[]})',context);
(async()=>{
 await vm.runInContext('SCMoments.open("s")',context);
 assert.deepEqual(captured,['u2','a2','a2b','u3','a3']);assert.deepEqual(Array.from(record.scSourceMessageIds),captured);
 assert.equal(record.scSourceSessionId,'s');assert.equal(page,'page-moments-image-studio');
 console.log('PASS moments range: complete chronological rounds, group replies included, system/other chat excluded, source IDs retained');
})().catch(e=>{console.error(e);process.exitCode=1;});

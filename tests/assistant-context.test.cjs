const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const sessions=[{id:'old',characterId:'a',updatedAt:1},{id:'new',participantCharacterIds:['a'],updatedAt:2},{id:'group',participantCharacterIds:['a','b'],updatedAt:99}];
const messages=Array.from({length:15},(_,i)=>({id:i,role:i%2?'assistant':'user',content:'message '+i,createdAt:i}));
messages.push({role:'system',content:'SYSTEM_SECRET',createdAt:99},{role:'assistant',content:'PENDING',_pending:true,createdAt:98});
let selected;
const context=vm.createContext({Date,Map,console,setInterval(){},setTimeout(){},window:{addEventListener(){}},document:{addEventListener(){}},Storage:{dbGetAll:async()=>sessions,db:{transaction(){return {objectStore(){return {index(){return {getAll(id){selected=id;const r={};queueMicrotask(()=>{r.result=messages;r.onsuccess();});return r;}};}};}};}}}});
vm.runInContext(fs.readFileSync('scripts/sc-daily.js','utf8'),context);
(async()=>{
 const result=await vm.runInContext('SCDaily.assistantContext("a")',context);
 assert.equal(selected,'new');assert.equal(result.sessionId,'new');assert.equal(result.recentConversation.length,10);
 assert.equal(result.recentConversation[0].content,'message 5');assert.equal(result.recentConversation[9].content,'message 14');
 assert.ok(!JSON.stringify(result).match(/SECRET|PENDING/));
 assert.equal((await vm.runInContext('SCDaily.assistantContext("missing")',context)).sessionId,null);
 console.log('PASS assistant context: latest private session, legacy IDs, last 10 chronological messages, system/pending excluded');
})().catch(e=>{console.error(e);process.exitCode=1;});

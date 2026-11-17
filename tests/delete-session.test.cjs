const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const deleted=[];const context=vm.createContext({State:{switchPage(){}},Storage:{dbGetAll:async()=>[{id:'target-msg',sessionId:'target'},{id:'other-msg',sessionId:'other'}],async dbDelete(store,id){deleted.push([store,id]);if(store==='sessions')vm.runInContext('Chat.currentSessionId="other"',context);}}});
vm.runInContext(fs.readFileSync('scripts/chat.js','utf8'),context);
vm.runInContext('Chat.currentSessionId="target";Chat.renderChatList=()=>{}',context);
(async()=>{
 await vm.runInContext('Chat.deleteCurrentSession("target")',context);
 assert.deepEqual(deleted,[['sessions','target'],['messages','target-msg']]);
 console.log('PASS deletion target: switching current session during deletion never deletes another chat');
})().catch(e=>{console.error(e);process.exitCode=1;});

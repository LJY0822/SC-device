const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
let input,apply,cancel,change,onClose;
const context=vm.createContext({SCUI:{async modal(){
 input={value:'',focus(){},addEventListener(type,fn){change=fn;}};apply={disabled:true};cancel={};
 return {querySelector(selector){return selector==='#sc-delete-token'?input:selector==='[data-delete-apply]'?apply:cancel;},addEventListener(type,fn){onClose=fn;},close(){onClose();}};
}}});
vm.runInContext(fs.readFileSync('scripts/chat.js','utf8'),context);
(async()=>{
 let settled=false;
 const result=vm.runInContext('Chat._confirmTypedDeletion("删除")',context).then(v=>{settled=true;return v;});
 await new Promise(setImmediate);
 for(const wrong of ['', 'DELETE','delete ']){input.value=wrong;change();assert.equal(apply.disabled,true);apply.onclick();}
 await new Promise(setImmediate);assert.equal(settled,false,'even forced clicks cannot delete without the exact token');
 input.value='delete';change();assert.equal(apply.disabled,false);apply.onclick();assert.equal(await result,true);
 const second=vm.runInContext('Chat._confirmTypedDeletion("删除")',context);await new Promise(setImmediate);cancel.onclick();assert.equal(await second,false);
 console.log('PASS typed deletion: exact lowercase token required, forced-click bypass rejected, cancel does not authorize');
})().catch(e=>{console.error(e);process.exitCode=1;});

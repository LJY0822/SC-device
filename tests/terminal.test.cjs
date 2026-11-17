const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const messages=[{id:'old',createdAt:1,content:'old'},{id:'new',createdAt:2,content:'new'}];
let writes=0;
let savedNight=true;
const document={documentElement:{dataset:{}},getElementById(){return {classList:{toggle(){}}};},querySelectorAll(){return [];}};
const context=vm.createContext({console,Date,Promise,document,setInterval(){},window:{addEventListener(){}},SCUI:{},Storage:{
  get(){return savedNight;},set(key,value){savedNight=value;},
  db:{transaction(){return {objectStore(){return {index(){return {getAll(){const request={};queueMicrotask(()=>{request.result=messages.map(m=>({...m}));request.onsuccess();});return request;}};}};}};}},
  dbPut(){writes++;},kvSet(){writes++;}
},Character:{normalizeCard:c=>c},Chat:{_sanitizeAvatarSrc:s=>s,_formatChatListPreview:rows=>rows[0].content}});
vm.runInContext(fs.readFileSync('scripts/sc-terminal.js','utf8'),context);
(async()=>{
  assert.equal(document.documentElement.dataset.scMode,'night','restore theme before rendering');
  vm.runInContext('SCTerminal.setNight(false)',context);
  assert.equal(document.documentElement.dataset.scMode,'day');assert.equal(savedNight,false);
  vm.runInContext('SCTerminal.setNight(true,false)',context);
  assert.equal(document.documentElement.dataset.scMode,'night');assert.equal(savedNight,false,'preview must not persist');
  const rows=await vm.runInContext('SCTerminal.readRecent([{id:"s",title:"频道",participantCharacterIds:["c"],unreadCount:3}],[{id:"c",avatar:"portrait.png"}])',context);
  assert.equal(rows[0].preview,'new');assert.equal(rows[0].avatar,'portrait.png');assert.equal(rows[0].unread,3);
  assert.equal(writes,0,'reading a home preview must never update messages or read state');
  assert.equal(messages[0].id,'old','preview must not mutate source ordering');
  vm.runInContext('SCTerminal.daily={assistants:[null,{title:"bad"},{title:"A",body:"message"}]}',context);
  assert.equal(vm.runInContext('SCTerminal.items("assistants").length',context),1);
  assert.equal(vm.runInContext('SCTerminal.greeting(8)',context),'上午好');
  assert.equal(vm.runInContext('SCTerminal.greeting(15)',context),'下午好');
  assert.equal(vm.runInContext('SCTerminal.greeting(21)',context),'晚上好');
  assert.equal(vm.runInContext('SCTerminal.greeting(2)',context),'晚上好');
  console.log('PASS terminal: latest preview, character avatar, existing unread, no writes, independent content validation');
})().catch(error=>{console.error(error);process.exitCode=1;});

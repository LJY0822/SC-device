const fs=require('node:fs');
const edit=(p,fn)=>fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')));
function replace(s,a,b){if(!s.includes(a))throw Error('Missing target: '+a.slice(0,90));return s.replace(a,b);}
edit('index.html',s=>{
 s=s.replace('<title>SC</title>','<title>SC-个人通讯装置</title>').replace(', user-scalable=no','');
 s=s.replace('</head>','  <link rel="stylesheet" href="styles/sc.css">\n</head>');
 for(const name of ['takeout','shop','wallet','ta-diary']) s=s.replace(new RegExp('  <script src="scripts/'+name+'\\.js"></script>\\n'),'');
 s=s.replace('scripts/proactive-scheduler.js','scripts/sc-scheduler.js').replace('scripts/timer.js','scripts/sc-timer.js');
 s=s.replace('  <script src="scripts/app.js">','  <script src="scripts/sc-ui.js"></script>\n  <script src="scripts/sc-backup.js"></script>\n  <script src="scripts/app.js">');
 // Remove complete app page trees, not merely their navigation entries.
 for(const id of ['page-takeout','page-shop','page-shop-app-manager','page-wallet','page-ta-phone','page-ta-diary']){
  const start=s.indexOf('<div id="'+id+'"');if(start<0)continue;
  const re=/<\/?div\b[^>]*>/g;re.lastIndex=start;let depth=0,m;
  while((m=re.exec(s))){depth+=m[0].startsWith('</')?-1:1;if(depth===0){s=s.slice(0,start)+s.slice(re.lastIndex);break;}}
 }
 s=s.replace(/<button\b[^>]*id="chat-btn-gift"[\s\S]*?<\/button>/,'');
 return s;
});
edit('scripts/app.js',s=>{
 s=s.replace('    Takeout.init();','').replace('    Shop.init();','');
 s=s.replace('    await Homescreen.init();','    await Homescreen.init();\n    SCUI.init();');
 return s;
});
edit('scripts/config.js',s=>s.replace("DB_NAME: 'yd_phone_db'","DB_NAME: 'sc_personal_comms_v1'").replace("DEFAULT_HOMESCREEN_DOCK: 'show'","DEFAULT_HOMESCREEN_DOCK: 'hide'"));
edit('scripts/homescreen.js',s=>s.replace("'ta-room'","'ta-room', 'shop', 'wallet', 'takeout', 'ta-phone', 'ta-diary'"));
edit('scripts/state.js',s=>replace(s,"    const fromId = this.currentPage;","    if (['page-shop','page-shop-app-manager','page-wallet','page-takeout','page-ta-phone','page-ta-diary'].includes(nextId)) return;\n    const fromId = this.currentPage;"));
edit('scripts/chat.js',s=>{
 s=replace(s,"    if (typeof Wallet === 'undefined' || !Wallet || typeof Wallet.debit !== 'function') {\n      throw new Error('wallet_unavailable');\n    }\n    return Wallet.debit(num, String(billTitle || '聊天支出'));","    return true; // SC: 金额仅用于剧情展示。");
 const a=s.indexOf("    if (sourceRole === 'user') {",s.indexOf('const amount = Number(sourceInfo.amount)'));const b=s.indexOf('    const settleAt = Date.now();',a);if(a<0||b<0)throw Error('money target');s=s.slice(0,a)+s.slice(b);
 const c=s.indexOf('    let activated = false;',s.indexOf('const settledIncoming'));const d=s.indexOf('    this._openMoneyActionModal(effectiveCtx);',c);s=s.slice(0,c)+s.slice(d);
 s=s.replace(/        <button[^\n]*data-act="ta-(?:phone|diary)"[^\n]*\n/g,'');
 s=replace(s,'    await this._populateChatSettings(session);','    await this._populateChatSettings(session);\n    await SCUI.settings(session);');
 const start=s.indexOf('  async insertProactivePushMessage(payload) {');const end=s.indexOf('  _enqueueChatIncomingNotification',start);let part=s.slice(start,end);
 part=part.replace('    if (!sessionId) return false;','    if (!sessionId || !payload.taskId) return false;').replace('    const now = Date.now();','    const deliveredAt = Date.now();\n    const now = Number(payload.dueAt) || deliveredAt;').replace('      _proactivePush: true,','      _proactivePush: true,\n      deliveredAt,').replace('characterId: fallbackCharacterId','characterId: payload.characterId || fallbackCharacterId').replace('characterName: fallbackCharacterName','characterName: payload.characterName || fallbackCharacterName').replace('sess.updatedAt = now;','sess.updatedAt = Math.max(Number(sess.updatedAt)||0, now);');
 part=part.replace('      return false;\n    }\n\n    try {\n      sess.updatedAt',"      if (await Storage.dbGet('messages', msgId)) return true;\n      return false;\n    }\n\n    try {\n      sess.updatedAt");
 s=s.slice(0,start)+part+s.slice(end);
 const f=s.indexOf('  async _collectProactivePreviewFallbackChunks(');const g=s.indexOf('  _splitTextIntoReceiveChunks(',f);s=s.slice(0,f)+'  async _collectProactivePreviewFallbackChunks() { return []; },\n\n'+s.slice(g);
 // Never replay system-only model output as ordinary text.
 s=s.replace('    const raw = String(rawContent || \'\');','    const raw = String(rawContent || \'\');');
 return s;
});
edit('scripts/markdown-plain.js',s=>s.replace("    const s = String(raw ?? '')","    const s = SCUI.normalizeMath(raw)").replace("      let decoded = String(dirty || '');","      let decoded = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(String(dirty || '')) : MarkdownPlain._escape(s);"));
edit('manifest.json',s=>{const m=JSON.parse(s);m.name='SC-个人通讯装置';m.short_name='SC通讯';m.start_url='./';m.scope='./';m.background_color='#ffffff';m.theme_color='#ffffff';return JSON.stringify(m,null,2);});
console.log('Base patches applied');

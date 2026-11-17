const fs=require('node:fs');const edit=(p,fn)=>fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')));
edit('index.html',s=>s.replace('  <script src="scripts/sc-backup.js">','  <script src="scripts/sc-chat.js"></script>\n  <script src="scripts/sc-backup.js">'));
edit('scripts/chat.js',s=>{
 const start=s.indexOf('  async callAI(');const end=s.indexOf('  _getSessionMemoryEnhanceDefaults()',start);let part=s.slice(start,end);
 part=part.replace("const targetSessionId = String(this.currentSessionId || '').trim();","const targetSessionId = String(opts.scSessionId || this.currentSessionId || '').trim();");
 part=part.replace('const data = await this._postChatCompletionsAndParse({','const data = await SCChat.complete({').replace('      });\n      // API 已返回','      }, session);\n      // API 已返回');
 part=part.replace("alert('AI调用失败，请检查网络和API配置');","alert(`AI调用失败：${error.message || '请检查网络和 API 配置'}`);");
 s=s.slice(0,start)+part+s.slice(end);
 s=s.replace('return rows.map((x) => x.session);',"return rows.map((x) => x.session).filter(s => (currentSession.scMemoryAllow || []).includes(s.id));");
 const a=s.indexOf('  async _buildProactiveSystemZoneForSession(');const b=s.indexOf('\n  },',a)+6;
 s=s.slice(0,a)+"  async _buildProactiveSystemZoneForSession(sessionId) {\n    const session=await Storage.dbGet('sessions',sessionId);\n    return session ? SCChat.proactivePrompt(session) : '';\n  },"+s.slice(b);
 return s;
});
// Keep original persona/style rules; remove protocol instructions for deleted apps.
edit('scripts/chat-message-builder.js',s=>s.split('\n').filter(line=>!(/(商城|外卖|代付|订单|商品明细|应用\|资源|第10段|分享消息结构说明)/.test(line)&&/(parts.push|`- 如需触发)/.test(line))).join('\n'));
edit('scripts/system-actions.js',s=>s.replaceAll('void ProactiveScheduler.scheduleFromSystemAction({','await ProactiveScheduler.scheduleFromSystemAction({')+'\n// Shopping has been removed; old model outputs cannot trigger payment actions.\ndelete SystemActions._routes["代付结果"];\n');
console.log('Chat integration applied');

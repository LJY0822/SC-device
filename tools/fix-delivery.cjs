const fs=require('node:fs');
let s=fs.readFileSync('scripts/chat.js','utf8');
const a=s.indexOf('    // 进入会话前兜底：');const b=s.indexOf('    this._updateTypingDisplay();',a);
if(a<0||b<0)throw Error('Missing delivery target');
s=s.slice(0,a)+"    await ProactiveScheduler._reconcileLocalDueTasks();\n"+s.slice(b);
fs.writeFileSync('scripts/chat.js',s);
// Remove legacy URL/cloud push ingestion. Only the durable local ledger may deliver plans.
s=fs.readFileSync('scripts/app.js','utf8').replace(/\r\n/g,'\n');
const x=s.indexOf('        // Cold start: recover proactive push');const y=s.indexOf('\n        if (typeof Notifications',x);
if(x>=0&&y>=0)s=s.slice(0,x)+s.slice(y);
const c=s.indexOf("  navigator.serviceWorker.addEventListener('message'");const d=s.indexOf('\n}\n',c);
if(c>=0&&d>=0)s=s.slice(0,c)+s.slice(d);
fs.writeFileSync('scripts/app.js',s);
// Source-only reference, no user chats or credentials.
const original='C:/Users/EDY/Downloads/ydj220diuqwyudyhiqwd/ydj220diuqwyudyhiqwd/scripts/';
const builder=fs.readFileSync(original+'chat-message-builder.js','utf8');
const chat=fs.readFileSync(original+'chat.js','utf8').split(/\r?\n/);
const doc='# 原版聊天内置指令原文\n\n只包含程序静态源码，不含你的角色卡、聊天或密钥。角色卡、世界书和动态上下文会在运行时插入，最终结果请在新版“本次发送给 AI 的内容”检查。以下覆盖主要聊天构建器与追加上下文；论坛、制卡等独立功能有各自的生成指令。\n\n## 聊天构建器（原版完整文件）\n\n```javascript\n'+builder+'\n```\n\n## 聊天追加上下文（原版 chat.js 13119–13236）\n\n```javascript\n'+chat.slice(13118,13236).join('\n')+'\n```\n\n## 主动消息区（原版 chat.js 13827–13884）\n\n```javascript\n'+chat.slice(13826,13884).join('\n')+'\n```\n';
fs.writeFileSync('docs/内置指令原文.md',doc);
console.log('Single delivery path and prompt reference ready');

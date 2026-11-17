const fs=require('node:fs');
const edit=(p,fn)=>fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')));
edit('scripts/chat.js',s=>s.replace("  _formatMessageLineBreaksForDisplay(raw) {\n    let s = String(raw ?? '');","  _formatMessageLineBreaksForDisplay(raw) {\n    let s = SCUI.normalizeMath(raw);").replace("Notifications.enqueue('钱包', '余额变动', body, 0, '消息');","Notifications.enqueue('聊天', '剧情转账', body, 0, '消息');"));
edit('scripts/settings.js',s=>s.replaceAll('Foxhole & Acorn Box用户','SC 用户').replaceAll('账号、云同步、媒体与购买项目','本地数据 · 手动备份迁移').replaceAll('SC','SC 通讯'));
edit('index.html',s=>s.replaceAll('Foxhole & Acorn Box用户','SC 用户').replaceAll('账号、云同步、媒体与购买项目','本地数据 · 手动备份迁移').replaceAll('SC','SC 通讯').replace(/<a\b[^>]*id="settings-homescreen-dock"[\s\S]*?<\/a>/,''));
// Keep shared TA context helpers used by retained calendar/experience features.
edit('scripts/app.js',s=>s.replace("    if (typeof TaPages !== 'undefined' && TaPages.init) {\n      TaPages.init();\n    }",''));
// The SC home reuses existing icon customization and opt-in widget previews.
edit('scripts/sc-ui.js',s=>s.replace("const icons=State.icons.filter(i=>!this.removed.has(i.id));","const icons=State.icons.filter(i=>!this.removed.has(i.id));"));
console.log('Branding and display fixes applied');

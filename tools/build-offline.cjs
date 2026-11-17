const fs=require('node:fs');const crypto=require('node:crypto');
const excluded=new Set(['map.js','map.css','live.js','live.css','share.js','share.css','calendar.js','calendar.css','calendar-reminders.js','calendar-reminders.css','music.js','music.css','notebook.js','notebook.css','widgets.js','widgets.css','shop.js','takeout.js','wallet.js','ta-diary.js','proactive-scheduler.js','timer.js','shop.css','takeout.css','wallet.css']);
const vendorFiles=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(f=>f.isDirectory()?vendorFiles(d+'/'+f.name):/\.(js|mjs|bcmap|pfb|ttf|otf)$/.test(f.name)?[d+'/'+f.name]:[]);
const files=['index.html','manifest.json','icon-192.png','icon-512.png',...['scripts','styles'].flatMap(d=>fs.readdirSync(d).filter(f=>/\.(js|css)$/.test(f)&&!excluded.has(f)).map(f=>d+'/'+f)),...vendorFiles('vendor'),...fs.readdirSync('assets/edc').filter(f=>/\.(png|json)$/.test(f)).map(f=>'assets/edc/'+f)];
const version=crypto.createHash('sha256');version.update(fs.readFileSync(__filename));for(const f of files)version.update(fs.readFileSync(f));
fs.writeFileSync('sw.js',`const CACHE='sc-terminal-static-${version.digest('hex').slice(0,12)}';
const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sc-terminal-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 const base=new URL('./',self.location.href);const relative=u.pathname.slice(base.pathname.length);
 if(e.request.mode==='navigate'&&(relative===''||relative==='index.html')){e.respondWith(caches.open(CACHE).then(async c=>(await c.match(new URL('index.html',base)))||fetch(e.request)));return;}
 if(!FILES.includes(relative))return;
 e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));
});
`);console.log('Offline bundle:',files.length,'assets');


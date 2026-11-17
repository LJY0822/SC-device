const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const handlers={};let core=[],activated=0,downloads=0;
const context=vm.createContext({URL,AbortController,setTimeout(){return 0;},clearTimeout(){},Request:class{constructor(url){this.url=url;}},self:{location:{href:'https://example.test/app/sw.js'},addEventListener(name,fn){handlers[name]=fn;},skipWaiting(){activated++;}},caches:{async open(){return {async addAll(requests){core=requests.map(r=>r.url);},async match(){return null;}};}},async fetch(){downloads++;return {ok:false,status:503};}});
vm.runInContext(fs.readFileSync('sw.js','utf8'),context);
(async()=>{
 let work;handlers.install({waitUntil(p){work=p;}});await work;
 assert.equal(activated,1);assert.ok(core.includes('index.html'));assert.ok(core.includes('scripts/sc-terminal.js'));
 assert.ok(!core.some(p=>p.startsWith('vendor/pdfjs/')||p.startsWith('assets/edc/')),'optional files cannot prevent core installation');
 assert.equal(downloads,0,'no optional download during install');
 handlers.message({data:{type:'CACHE_OPTIONAL'},waitUntil(p){work=p;}});await work;
 assert.ok(downloads>0);assert.equal(activated,1,'all optional 503 responses are tolerated without reverting the installed UI');
 console.log('PASS worker update: atomic core install, optional resources outside install, all optional failures tolerated');
})().catch(e=>{console.error(e);process.exitCode=1;});

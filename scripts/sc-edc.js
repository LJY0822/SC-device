// Paper stickers are separate assets; only their layout is stored in the existing kv table.
const SCEDC = {
  key:'sc_edc_layout_v1', width:1600, height:900, revision:0,
  selected:null, editing:false, dirty:false, history:[], masks:{}, loaded:false,
  items:[
    {id:'cloth',name:'叠好的手帕',material:'纸质贴片',description:'几层米白色的折叠手帕，边缘留着简单的针脚。',x:350,y:605,w:240,r:5,z:1},
    {id:'photo',name:'风景照片',material:'纸质贴片',description:'一张由天空、云朵和远山拼成的小照片。',x:720,y:590,w:350,r:-7,z:2},
    {id:'firesteel',name:'打火棒',material:'PVC 贴纸',description:'打火棒与刮片，由一小段橄榄绿绳子连在一起。',x:1220,y:602,w:235,r:8,z:3},
    {id:'note',name:'折叠便签',material:'纸质贴片',description:'一张留白的便签，保留着折叠后的压痕。',x:650,y:684,w:340,r:3,z:4},
    {id:'casing',name:'9mm 空弹壳',material:'PVC 贴纸',description:'黄铜色的空弹壳，开口朝外，不含弹头。',x:240,y:745,w:125,r:-12,z:5},
    {id:'glowstick',name:'迷你荧光棒',material:'亚克力贴片',description:'一小枚浅绿色荧光棒，顶端带着挂孔。',x:1370,y:690,w:48,r:12,z:6},
    {id:'key',name:'钥匙',material:'亚克力贴片',description:'银灰色的钥匙，用几笔深色线条勾出轮廓。',x:1130,y:725,w:165,r:-8,z:7},
    {id:'pen',name:'战术笔',material:'PVC 贴纸',description:'黑色笔身与橄榄绿握柄，一支带笔夹的随身笔。',x:750,y:680,w:840,r:-8,z:8},
    {id:'button',name:'彩色纽扣',material:'纸质贴片',description:'一颗砖红色四孔纽扣，像两层圆纸叠在一起。',x:540,y:763,w:100,r:9,z:9},
    {id:'coin',name:'硬币',material:'亚克力贴片',description:'银灰色的圆形硬币，上面是一圈简化的月桂叶。',x:850,y:759,w:110,r:4,z:10}
  ],
  clone(value) { return JSON.parse(JSON.stringify(value)); },
  defaults() {return this.items.map(({id,x,y,r,z})=>this.constrain({id,x,y,r,z}));},
  dimensions(id) {const item=this.items.find(i=>i.id===id),crop=this.assets[id].crop;return {w:item.w,h:item.w*crop[3]/crop[2]};},
  constrain(row) {
    const {w,h}=this.dimensions(row.id),a=row.r*Math.PI/180;
    const rx=(Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a)))/2;
    const ry=(Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a)))/2;
    // The long pen can turn through 360 degrees, so its center is kept in the tray while tall rotations use the open lid too.
    const lowY=ry*2>350?25:465,highY=ry*2>350?875:825;
    return {...row,x:Math.min(1480-rx,Math.max(120+rx,row.x)),y:Math.min(highY-ry,Math.max(lowY+ry,row.y))};
  },
  validate(value) {
    if(value===null||value===undefined)return {revision:0,layout:this.defaults()};
    if(value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.layout)||value.layout.length!==this.items.length)throw new Error('已保存的布置格式不完整，未覆盖原记录。');
    const ids=new Set();
    for(const row of value.layout){
      if(!row||!this.items.some(i=>i.id===row.id)||ids.has(row.id)||!['x','y','r','z'].every(k=>Number.isFinite(row[k]))||Math.abs(row.r)>360||row.x<0||row.x>1600||row.y<0||row.y>900||row.z<1||row.z>10)throw new Error('已保存的布置包含无效物品，未覆盖原记录。');
      ids.add(row.id);
    }
    return {revision:value.revision,layout:value.layout.map(row=>this.constrain({id:row.id,x:row.x,y:row.y,r:row.r,z:row.z}))};
  },
  async load() {
    if(this.loaded)return;
    if(this.loading)return this.loading;
    this.loading=(async()=>{
      const response=await fetch('assets/edc/metadata.json');if(!response.ok)throw new Error('盒子素材暂时无法读取，请联网重试。');
      this.assets=await response.json();
      await Promise.all(Object.entries(this.assets).map(async([id,asset])=>{
        if(!asset||!/^[a-z]+-v1\.png$/.test(asset.file)||!Array.isArray(asset.crop)||asset.crop.length!==4||!asset.crop.every(Number.isFinite))throw new Error('素材清单无效。');
        const image=new Image();image.src='assets/edc/'+asset.file;await image.decode();
        if(id==='box')return;
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=Math.max(1,Math.round(160*asset.crop[3]/asset.crop[2]));
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,...asset.crop,0,0,canvas.width,canvas.height);
        this.masks[id]={w:canvas.width,h:canvas.height,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
      }));
      const record=this.validate(await Storage.kvGet(this.key));this.revision=record.revision;this.saved=this.clone(record.layout);this.layout=this.clone(record.layout);this.loaded=true;
    })();
    try{await this.loading;}finally{this.loading=null;}
  },
  async mount(panel) {
    this.root=panel;panel.innerHTML='<div class="edc-loading" role="status">正在打开随身盒…</div>';
    try{await this.load();if(!panel.isConnected)return;
      panel.innerHTML=`<div class="edc-orientation"><div class="edc-stage" role="group" aria-label="纸质拼贴随身盒，点选物品查看说明，方向键可移动选中物品" tabindex="-1"><img class="edc-box" src="assets/edc/box-v1.png" alt="敞开的纸质金属烟盒"><div class="edc-items"></div><div class="edc-context" hidden></div><div class="edc-announcement" role="status" aria-live="polite"></div></div><button class="edc-access-back" aria-label="返回首页">返回首页</button></div>`;
      this.stage=panel.querySelector('.edc-stage');this.context=panel.querySelector('.edc-context');
      panel.querySelector('.edc-access-back').onclick=()=>SCTerminal.setPanel('home',true);
      this.renderItems();this.renderContext();this.resize();
      this.stage.addEventListener('pointerdown',e=>this.pointerDown(e));
      this.stage.addEventListener('pointermove',e=>this.pointerMove(e));
      this.stage.addEventListener('pointerup',e=>this.pointerUp(e));
      this.stage.addEventListener('pointercancel',()=>this.cancelDrag());
      this.stage.addEventListener('keydown',e=>this.keydown(e));
    }catch(error){
      panel.innerHTML='<div class="edc-load-error"><p></p><button>重试</button><button>返回首页</button></div>';
      panel.querySelector('p').textContent=error.message;
      const buttons=panel.querySelectorAll('button');buttons[0].onclick=()=>this.mount(panel);buttons[1].onclick=()=>SCTerminal.setPanel('home',true);
    }
  },
  resize() {
    if(!this.root?.isConnected)return;
    this.portrait=innerHeight>innerWidth;
    const w=this.portrait?innerHeight:innerWidth,h=this.portrait?innerWidth:innerHeight;
    const orientation=this.root.querySelector('.edc-orientation');if(!orientation)return;
    orientation.style.width=w+'px';orientation.style.height=h+'px';orientation.classList.toggle('edc-rotated',this.portrait);
    const size=Math.min(w*.97,h*.96*16/9);
    this.stage.style.width=size+'px';this.stage.style.height=size*9/16+'px';this.stage.style.setProperty('--edc-unit',Math.min(1,size/900));
  },
  onPanel(name) {
    document.body.classList.toggle('edc-open',name==='edc');
    if(name==='edc'){this.resize();if(!this.editing){this.selected=null;this.renderItems();this.renderContext();}this.stage?.focus({preventScroll:true});}
  },
  renderItems() {
    const host=this.root?.querySelector('.edc-items');if(!host||!this.layout)return;
    host.replaceChildren();
    for(const row of this.layout){
      const item=this.items.find(i=>i.id===row.id),asset=this.assets[row.id],{w,h}=this.dimensions(row.id),[x,y,cw,ch]=asset.crop;
      const button=document.createElement('button');button.type='button';button.className='edc-item';button.dataset.id=row.id;button.setAttribute('aria-label',item.name);button.setAttribute('aria-pressed',String(this.selected===row.id));
      button.style.width=w/16+'%';button.style.height=h/9+'%';this.place(button,row);button.classList.toggle('edc-selected',this.selected===row.id);
      const cut=document.createElement('span');cut.className='edc-cut';
      const img=document.createElement('img');img.src='assets/edc/'+asset.file;img.alt='';img.draggable=false;img.style.width=asset.width/cw*100+'%';img.style.height=asset.height/ch*100+'%';img.style.left=-x/cw*100+'%';img.style.top=-y/ch*100+'%';cut.append(img);button.append(cut);
      button.addEventListener('click',e=>{if(e.detail===0)this.select(row.id);});host.append(button);
    }
  },
  place(button,row) {button.style.left=row.x/16+'%';button.style.top=row.y/9+'%';button.style.transform=`translate(-50%,-50%) rotate(${row.r}deg)`;button.style.zIndex=row.z;},
  select(id) {
    this.selected=id;
    this.root.querySelectorAll('.edc-item').forEach(b=>{b.classList.toggle('edc-selected',b.dataset.id===id);b.setAttribute('aria-pressed',String(b.dataset.id===id));});
    this.renderContext();
  },
  renderContext() {
    if(!this.context)return;
    this.context.hidden=!this.selected;
    if(!this.selected)return;
    const item=this.items.find(i=>i.id===this.selected),e=SCUI.escape;
    this.context.innerHTML=`<div class="edc-caption"><div><strong>${e(item.name)}</strong><span>${e(item.material)}</span></div><button data-edc="close" aria-label="取消选中">×</button></div><p>${this.editing?'拖动物品调整位置 · 方向键微调':e(item.description)}</p>${this.editing?`<div class="edc-tools" aria-label="布置工具"><button data-edc="left" aria-label="向左移动">←</button><button data-edc="up" aria-label="向上移动">↑</button><button data-edc="down" aria-label="向下移动">↓</button><button data-edc="right" aria-label="向右移动">→</button><button data-edc="rotate-left" aria-label="逆时针旋转15度">↶ 15°</button><button data-edc="rotate-right" aria-label="顺时针旋转15度">↷ 15°</button><button data-edc="back">下移一层</button><button data-edc="front">上移一层</button><button data-edc="undo" ${this.history.length?'':'disabled'}>撤销</button></div><div class="edc-actions"><span class="edc-save-state" role="status">${this.dirty?'有未保存的布置':'布置模式'}</span><button data-edc="cancel">取消</button><button data-edc="save" class="edc-save">保存布置</button></div>`:`<div class="edc-actions"><button data-edc="home">返回首页</button><button data-edc="edit" class="edc-save">布置物品</button></div>`}`;
    this.context.querySelectorAll('[data-edc]').forEach(button=>button.onclick=()=>this.action(button.dataset.edc));
    this.context.onpointerdown=e=>e.stopPropagation();
  },
  action(action) {
    if(this.saving)return;
    if(action==='home'){SCTerminal.setPanel('home',true);return;}
    if(action==='close'){this.requestLeave(()=>{this.selected=null;this.editing=false;this.renderItems();this.renderContext();this.stage.focus();});return;}
    if(action==='edit'){this.editing=true;this.history=[];this.renderContext();return;}
    if(action==='cancel'){this.discard();return;}
    if(action==='save'){void this.save();return;}
    if(action==='undo'){if(this.history.length){this.layout=this.history.pop();this.changed();}return;}
    const before=this.clone(this.layout),row=this.layout.find(r=>r.id===this.selected);
    if(!row)return;
    if(action==='left')row.x-=10;if(action==='right')row.x+=10;if(action==='up')row.y-=10;if(action==='down')row.y+=10;
    if(action==='rotate-left'||action==='rotate-right')row.r=((row.r+(action==='rotate-left'?-15:15)+540)%360)-180;
    if(action==='front'||action==='back'){
      const sorted=[...this.layout].sort((a,b)=>a.z-b.z),index=sorted.indexOf(row),other=sorted[index+(action==='front'?1:-1)];
      if(other)[row.z,other.z]=[other.z,row.z];
    }
    Object.assign(row,this.constrain(row));
    if(JSON.stringify(before)!==JSON.stringify(this.layout)){this.history.push(before);this.changed();}
  },
  changed() {this.dirty=JSON.stringify(this.layout)!==JSON.stringify(this.saved);this.renderItems();this.renderContext();},
  point(event) {
    const rect=this.stage.getBoundingClientRect();
    return this.portrait?{x:(event.clientY-rect.top)/rect.height*1600,y:(rect.right-event.clientX)/rect.width*900}:{x:(event.clientX-rect.left)/rect.width*1600,y:(event.clientY-rect.top)/rect.height*900};
  },
  hit(point) {
    for(const row of [...this.layout].sort((a,b)=>b.z-a.z)){
      const a=-row.r*Math.PI/180,dx=point.x-row.x,dy=point.y-row.y,{w,h}=this.dimensions(row.id);
      const u=(dx*Math.cos(a)-dy*Math.sin(a))/w+.5,v=(dx*Math.sin(a)+dy*Math.cos(a))/h+.5;
      if(u<0||u>=1||v<0||v>=1)continue;
      const mask=this.masks[row.id];if(mask.pixels[(Math.floor(v*mask.h)*mask.w+Math.floor(u*mask.w))*4+3]>90)return row.id;
    }
    return null;
  },
  pointerDown(event) {
    if(event.button!==0||this.saving||this.drag||event.target.closest('.edc-context'))return;
    event.preventDefault();event.stopPropagation();
    const point=this.point(event),id=this.hit(point);
    if(!id){this.blankStart={x:event.clientX,y:event.clientY};return;}
    this.select(id);this.blankStart=null;
    if(this.editing){const row=this.layout.find(r=>r.id===id);this.drag={id,pointer:event.pointerId,start:point,x:row.x,y:row.y,before:this.clone(this.layout)};this.stage.setPointerCapture(event.pointerId);}
  },
  pointerMove(event) {
    if(!this.drag||event.pointerId!==this.drag.pointer)return;
    const point=this.point(event),row=this.layout.find(r=>r.id===this.drag.id);
    Object.assign(row,this.constrain({...row,x:this.drag.x+point.x-this.drag.start.x,y:this.drag.y+point.y-this.drag.start.y}));
    this.place(this.root.querySelector(`[data-id="${row.id}"]`),row);
  },
  pointerUp(event) {
    if(this.drag&&event.pointerId===this.drag.pointer){
      const before=this.drag.before;this.drag=null;
      if(this.stage.hasPointerCapture(event.pointerId))this.stage.releasePointerCapture(event.pointerId);
      if(JSON.stringify(before)!==JSON.stringify(this.layout)){this.history.push(before);this.changed();}
    }else if(this.blankStart){
      const dx=event.clientX-this.blankStart.x,dy=event.clientY-this.blankStart.y;this.blankStart=null;
      if(Math.hypot(dx,dy)<8&&this.selected)this.action('close');
    }
  },
  cancelDrag() {if(this.drag){this.layout=this.drag.before;this.drag=null;this.changed();}this.blankStart=null;},
  keydown(event) {
    if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(this.selected)this.action('close');else SCTerminal.setPanel('home',true);return;}
    if(this.editing&&this.selected&&event.key.startsWith('Arrow')){event.preventDefault();event.stopPropagation();this.action({ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[event.key]);}
  },
  discard() {this.layout=this.clone(this.saved);this.editing=false;this.dirty=false;this.history=[];this.renderItems();this.renderContext();},
  async save() {
    if(this.saving)return false;
    this.saving=true;
    try{
      const layout=this.clone(this.layout);this.validate({version:1,revision:this.revision,layout});
      await new Promise((resolve,reject)=>{
        const tx=Storage.db.transaction('kv','readwrite'),store=tx.objectStore('kv');let conflict=false;
        tx.oncomplete=resolve;tx.onerror=()=>{};tx.onabort=()=>reject(conflict?new Error('另一个页面已保存新的布置。请重新载入盒子后再编辑。'):tx.error||new Error('保存失败，请重试。'));
        const request=store.get(this.key);request.onsuccess=()=>{
          if((request.result?.value?.revision||0)!==this.revision){conflict=true;tx.abort();return;}
          store.put({key:this.key,value:{version:1,revision:this.revision+1,updatedAt:Date.now(),layout}});
        };
      });
      this.revision++;this.saved=layout;this.dirty=false;this.editing=false;this.history=[];this.renderContext();this.announce('布置已保存');return true;
    }catch(error){await SCUI.modal('布置未保存',`<p>${SCUI.escape(error.message)}</p><p>当前调整仍保留在页面中。</p>`);return false;}
    finally{this.saving=false;}
  },
  requestLeave(next) {
    if(this.saving)return;
    if(!this.dirty){next();return;}
    if(this.confirming)return;this.confirming=true;
    SCUI.modal('保留这次布置吗？','<p>盒子里还有未保存的位置调整。</p><div class="sc-dialog-actions"><button data-choice="discard">放弃</button><button data-choice="stay">继续编辑</button><button data-choice="save">保存</button></div>',dialog=>{
      dialog.addEventListener('close',()=>this.confirming=false,{once:true});
      dialog.querySelector('[data-choice="stay"]').onclick=()=>dialog.close();
      dialog.querySelector('[data-choice="discard"]').onclick=()=>{this.discard();dialog.close();next();};
      dialog.querySelector('[data-choice="save"]').onclick=async()=>{dialog.close();if(await this.save())next();};
    });
  },
  announce(text) {const node=this.root?.querySelector('.edc-announcement');if(node)node.textContent=text;}
};
window.addEventListener('resize',()=>SCEDC.resize());
window.addEventListener('beforeunload',event=>{if(SCEDC.dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('yd:pagechange',event=>{if(event.detail?.to!=='page-homescreen')document.body.classList.remove('edc-open');});

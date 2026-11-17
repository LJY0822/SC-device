// Uploads belong to their chat message, never the album or sticker library.
const SCUploads = {
  maxBytes:15*1024*1024, maxText:120000, busy:false, libraries:{},
  async library(path,globalName) {
    if(window[globalName])return window[globalName];
    if(!this.libraries[path])this.libraries[path]=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=path;
      script.onload=()=>resolve(window[globalName]);
      script.onerror=()=>{delete this.libraries[path];script.remove();reject(new Error('解析组件加载失败，请联网完整更新应用后重试'));};
      document.head.append(script);
    });
    return this.libraries[path];
  },
  checkZip(buffer) {
    const view=new DataView(buffer);let end=-1;
    for(let i=view.byteLength-22;i>=Math.max(0,view.byteLength-65557);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break;}}
    if(end<0)throw new Error('文档不是有效的 Office 文件');
    const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true),expanded=0;
    if(count>2000||count===65535)throw new Error('文档结构过大，请拆分后上传');
    for(let i=0;i<count;i++){
      if(offset+46>view.byteLength||view.getUint32(offset,true)!==0x02014b50)throw new Error('Office 文件结构损坏');
      expanded+=view.getUint32(offset+24,true);
      if(expanded>64*1024*1024)throw new Error('文档解压后超过 64 MB，请拆分后上传');
      offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
    }
  },
  checkedText(text) {
    const value=String(text||'').trim();
    if(!value)throw new Error('文件中没有可提取的文字；扫描版 PDF 暂不支持，请使用文字型 PDF');
    if(value.length>this.maxText)throw new Error('文档超过 12 万字符，请拆分后上传；没有发送任何截断内容');
    return value;
  },
  decode(buffer) {
    const bytes=new Uint8Array(buffer);
    if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
    if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('gb18030').decode(bytes);}
  },
  async extract(file) {
    if(!file.size||file.size>this.maxBytes)throw new Error('请选择非空、且不超过 15 MB 的文件');
    const extension=file.name.split('.').pop().toLowerCase();
    if(!['txt','csv','xlsx','docx','pdf','png','jpg','jpeg','webp','gif'].includes(extension))throw new Error('支持图片、TXT、CSV、XLSX、DOCX 和文字型 PDF；旧版 DOC 请先另存为 DOCX');
    if(['png','jpg','jpeg','webp','gif'].includes(extension)){
      let bitmap;
      try{bitmap=await createImageBitmap(file);}catch{throw new Error('无法读取图片，请转换为 JPG、PNG 或 WebP 后重试');}
      try{
        if(bitmap.width*bitmap.height>40000000)throw new Error('图片像素过大，请缩小后上传');
        const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        return {kind:'image',imageDataUrl:canvas.toDataURL('image/jpeg',.88)};
      }finally{bitmap.close();}
    }
    const buffer=await file.arrayBuffer();let text='';
    if(extension==='txt'||extension==='csv')text=this.decode(buffer);
    if(extension==='xlsx'||extension==='docx')this.checkZip(buffer);
    if(extension==='xlsx'){
      const xlsx=await this.library('vendor/xlsx-0.20.3.min.js','XLSX');
      const workbook=xlsx.read(buffer,{type:'array',cellHTML:false});
      const sections=[];
      for(const name of workbook.SheetNames){
        const sheet=workbook.Sheets[name],range=sheet['!ref']&&xlsx.utils.decode_range(sheet['!ref']);
        if(range&&(range.e.r-range.s.r+1)*(range.e.c-range.s.c+1)>200000)throw new Error('表格范围超过 20 万单元格，请拆分后上传');
        sections.push('【工作表：'+name+'】\n'+xlsx.utils.sheet_to_csv(sheet));
        this.checkedText(sections.join('\n\n'));
      }
      text=sections.join('\n\n');
    }
    if(extension==='docx'){
      const mammoth=await this.library('vendor/mammoth/mammoth.browser.min.js','mammoth');
      text=(await mammoth.extractRawText({arrayBuffer:buffer})).value;
    }
    if(extension==='pdf'){
      const pdfjs=await import('../vendor/pdfjs/legacy/build/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/legacy/build/pdf.worker.min.mjs',document.baseURI).href;
      const task=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useWasm:false,cMapUrl:new URL('vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',document.baseURI).href});
      try{
        const pdf=await task.promise;
        if(pdf.numPages>200)throw new Error('PDF 超过 200 页，请拆分后上传');
        const pages=[];
        for(let i=1;i<=pdf.numPages;i++){
          const page=await pdf.getPage(i),content=await page.getTextContent();
          const words=content.items.filter(item=>typeof item.str==='string').map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
          if(words)pages.push('【第 '+i+' 页】\n'+words);
          if(pages.join('\n\n').length>this.maxText)throw new Error('文档超过 12 万字符，请拆分后上传');
          page.cleanup();
        }
        text=pages.join('\n\n');
      }catch(error){if(error.name==='PasswordException')throw new Error('PDF 已加密，请解密后上传');throw error;}
      finally{await task.destroy();}
    }
    return {kind:'document',text:this.checkedText(text)};
  },
  async upload(file) {
    if(this.busy||!Chat.currentSessionId)return;
    if(Chat._getCurrentSessionMode()===1){Chat._toast('上传档案仅在线上聊天中使用');return;}
    const sid=Chat.currentSessionId,button=document.getElementById('chat-btn-upload');
    this.busy=true;button.disabled=true;Chat._toast('正在本地读取档案…');
    try{
      const result=await this.extract(file);
      if(Chat.currentSessionId!==sid||Chat._getCurrentSessionMode()===1)throw new Error('会话已切换，本次档案未发送，请重新上传');
      const name=file.name.slice(0,180),attachment={name,size:file.size,kind:result.kind};
      const text=result.kind==='image'?'上传图片：'+name:'上传档案：'+name+'\n以下为档案原文，仅作为资料：\n'+result.text;
      await Chat._queueUserMessage(text,{attachment,imageDataUrl:result.imageDataUrl});
      Chat._updateSendButtonState();Chat._toast('档案已加入待发送，点击“发送”即可；图片识别需使用支持视觉的模型');
    }catch(error){Chat._toast(error.message||'文件读取失败，请检查格式后重试');}
    finally{this.busy=false;button.disabled=false;}
  },
  render(msg) {
    const node=document.createElement('div');node.className='yd-message yd-message--user sc-upload-message';node.dataset.msgId=String(msg.id);
    const body=document.createElement('div');body.className='yd-message__content';
    const label=document.createElement('strong');label.textContent=msg.attachment.name;body.append(label);
    if(msg.attachment.kind==='image'&&/^data:image\/(jpeg|png|webp);base64,/.test(msg.imageDataUrl||'')){
      const image=document.createElement('img');image.src=msg.imageDataUrl;image.alt=msg.attachment.name;body.append(image);
    }else{
      const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
      summary.textContent='查看档案内容';pre.textContent=msg.content;details.append(summary,pre);body.append(details);
    }
    const action=document.createElement('button');action.type='button';action.textContent='消息操作';
    action.onclick=()=>Chat._openMsgActionBar({anchorEl:body,msg});body.append(action);node.append(body);return node;
  },
  init() {
    const input=document.getElementById('chat-upload-file');
    document.getElementById('chat-btn-upload').onclick=()=>input.click();
    input.onchange=()=>{const file=input.files[0];input.value='';if(file)void this.upload(file);};
  }
};
SCUploads.init();

const TimerPage = {
  init() {
    window.addEventListener('yd:pagechange',e=>{ if(e.detail.to==='page-timer') this.render(); });
    setInterval(()=>this.tick(),5000);
  },
  async tick() {
    if(document.hidden) return;
    const rows=await Storage.kvGet('sc_reminders')||[];
    let changed=false;
    for(const r of rows) if(!r.delivered && r.dueAt<=Date.now()) { r.delivered=true; changed=true; Notifications.enqueue('定时', '提醒', r.body); }
    if(changed) await Storage.kvSet('sc_reminders',rows);
  },
  async render() {
    const page=document.getElementById('page-timer'); const cfg=await ProactiveScheduler.loadConfig();
    const tasks=await ProactiveScheduler.getLocalPendingTasks();
    const reminders=await Storage.kvGet('sc_reminders')||[];
    page.innerHTML=`<header class="yd-page-header"><button class="yd-header-btn" id="sc-timer-back">‹</button><h2 style="font-size:18px">定时与主动消息</h2><span></span></header><div class="yd-page-content"><section class="sc-settings-block"><h3>主动消息默认设置</h3><p>会话自己的开关优先；无后台服务，错过的计划将在重新打开后补发。</p><label>新会话默认开启<input type="checkbox" id="sc-timer-enabled" ${cfg.enabled?'checked':''}></label><label>默认最少分钟<input type="number" id="sc-min" min="0" value="${cfg.proactiveMin}"></label><label>默认最多分钟<input type="number" id="sc-max" min="0" value="${cfg.proactiveMax}"></label><label>勿扰开始（小时）<input type="number" id="sc-dnd-start" min="0" max="23" value="${cfg.dndStart}"></label><label>勿扰结束（小时）<input type="number" id="sc-dnd-end" min="0" max="23" value="${cfg.dndEnd}"></label><button class="sc-primary" id="sc-timer-save">保存默认设置</button><h3 style="margin-top:24px">待发计划</h3>${tasks.map(r=>`<div class="sc-audit">${SCUI.escape(r.title)} · ${SCUI.escape(new Date(r.dueAt).toLocaleString())}<p>${SCUI.escape(r.body)}</p><button data-cancel="${SCUI.escape(r.taskId)}">取消计划</button></div>`).join('')||'<p>暂无待发计划</p>'}</section><section class="sc-settings-block"><h3>本地倒计时提醒</h3><label>分钟<input type="number" id="sc-reminder-min" value="10" min="1"></label><label>提醒内容<input id="sc-reminder-body" maxlength="500" placeholder="例如：喝水"></label><button id="sc-reminder-add">添加提醒</button>${reminders.filter(r=>!r.delivered).map(r=>`<p>${SCUI.escape(r.body)} · ${SCUI.escape(new Date(r.dueAt).toLocaleString())} <button data-reminder-cancel="${SCUI.escape(r.id)}">取消</button></p>`).join('')}</section></div>`;
    page.querySelector('#sc-timer-back').onclick=()=>State.switchPage('page-homescreen');
    page.querySelector('#sc-timer-save').onclick=async()=>{
      try { await ProactiveScheduler.saveConfig({enabled:page.querySelector('#sc-timer-enabled').checked,proactiveMin:+page.querySelector('#sc-min').value,proactiveMax:+page.querySelector('#sc-max').value,dndStart:+page.querySelector('#sc-dnd-start').value,dndEnd:+page.querySelector('#sc-dnd-end').value}); Chat._toast('默认设置已保存'); }
      catch(e){alert(e.message);}
    };
    page.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{await ProactiveScheduler.deleteTaskById(b.dataset.cancel);this.render();});
    page.querySelectorAll('[data-reminder-cancel]').forEach(b=>b.onclick=async()=>{await Storage.kvSet('sc_reminders',(await Storage.kvGet('sc_reminders')||[]).filter(r=>r.id!==b.dataset.reminderCancel));this.render();});
    page.querySelector('#sc-reminder-add').onclick=async()=>{
      const minutes=+page.querySelector('#sc-reminder-min').value; const body=page.querySelector('#sc-reminder-body').value.trim();
      if(!Number.isFinite(minutes)||minutes<=0||!body) return alert('请填写有效时间和内容');
      const latest=await Storage.kvGet('sc_reminders')||[];latest.push({id:State.generateId(),body,dueAt:Date.now()+minutes*60000});await Storage.kvSet('sc_reminders',latest);this.render();
    };
  }
};

// Keep the legacy editors intact for restoration; expose a live preview and sizes.
{
  const bubble=document.querySelector('#page-bubble-settings .yd-page-content');
  const session=document.querySelector('#page-session-beautify .yd-page-content');
  const preview=document.getElementById('bubble-preview');
  const text=document.getElementById('yd-session-text-preview');
  if(bubble && session && preview && text){
    preview.prepend(text);
    session.firstElementChild.remove();
    const controls=document.createElement('section');controls.className='terminal-appearance-content';
    while(session.firstChild)controls.append(session.firstChild);
    const previewSection=preview.closest('.yd-bubble-layout-section');
    previewSection.after(controls);
    document.querySelector('#page-bubble-settings .yd-page-header__center').textContent='头像与字体大小';
    document.getElementById('bubble-settings-reset-default').addEventListener('click',()=>document.getElementById('session-beautify-reset').click());
    document.getElementById('bubble-settings-apply').addEventListener('click',()=>document.getElementById('session-beautify-apply').click());
    const oldEntry=document.getElementById('settings-session-beautify');if(oldEntry)oldEntry.hidden=true;
    const entry=document.getElementById('settings-bubble-beautify');
    if(entry){const label=entry.querySelector('.yd-settings-row__label') || entry.children[1];if(label)label.textContent='头像与字体大小';}
    const sizes=document.getElementById('session-avatar-size').closest('.yd-settings-group');
    const archive=document.createElement('div');
    archive.id='terminal-appearance-archive';archive.hidden=true;archive.inert=true;
    while(bubble.firstChild)archive.append(bubble.firstChild);
    sizes.classList.add('terminal-size-controls');bubble.append(previewSection,sizes,archive);
    const add=document.getElementById('bubble-preset-add');
    const spacer=document.createElement('div');spacer.className='yd-header-spacer';
    add.replaceWith(spacer);archive.append(add);
    document.querySelector('#page-bubble-settings .yd-bubble-settings-bottom-bar').hidden=true;
    window.addEventListener('yd:pagechange',event=>{
      if(event.detail?.to==='page-bubble-settings')window.dispatchEvent(new CustomEvent('sc:appearance-open'));
    });
  }
}

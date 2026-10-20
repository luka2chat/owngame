import {track} from './analytics.js';

const dialog=document.getElementById('offline-info');
document.getElementById('offline-help')?.addEventListener('click',()=>{
  track('offline_help');
  dialog.showModal();
});
dialog?.querySelectorAll('[data-close-offline]').forEach(button=>button.addEventListener('click',()=>dialog.close()));

const install=document.getElementById('install');
let installEvent;
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();installEvent=event;if(install)install.hidden=false;
});
install?.addEventListener('click',async()=>{
  if(!installEvent)return;
  track('install_prompt');await installEvent.prompt();
  const choice=await installEvent.userChoice;
  track('install_choice',{outcome:choice.outcome});
  installEvent=null;install.hidden=true;
});

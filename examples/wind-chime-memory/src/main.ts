import Phaser from 'phaser';
import {Session,initial,RULES,stepMs,speed,Difficulty} from './rules';
import {load,persist,SAVE_KEY} from './storage';
import {fitLayout} from './layout';
import {ChimeAudio} from './audio';
import {GardenScene,NAMES} from './garden-scene';
declare const __SOURCE_SHA__:string;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const frame=$('frame'),play=$('play'),modal=$('modal'),loading=$('loading'),audio=new ChimeAudio();
const storage=()=>window.localStorage,restored=load(storage,matchMedia('(prefers-reduced-motion: reduce)').matches);
let session=new Session(restored.state),best=restored.best,muted=restored.muted,simple=restored.simple,notice=restored.notice,storageError=restored.storageError;
if(restored.exists)session.resume();
let chosen=session.state.difficulty,modalKind=restored.exists?(session.state.phase==='lost'?'new':'pause'):'start';
let ready=false,assetError=false,scene:GardenScene|null=null,begin=0,lastBeat=-1,inputCount=0,accepted=0,layoutEpoch=0;
let layout=fitLayout(720,1280,RULES.tiles[session.state.difficulty]);
const litUntil=[0,0,0,0],struckAt=[-1e9,-1e9,-1e9,-1e9],held=new Map<number,number>();
const buttons:HTMLButtonElement[]=[],registered=new Map<string,HTMLButtonElement>();let returnFocus:HTMLElement|null=null;
function save(){storageError=!persist(storage,{schema:1,state:session.state,best,muted,simple});}
function startPlayback(){begin=performance.now()+RULES.leadMs;lastBeat=-1;litUntil.fill(0);render();}
function flash(i:number,duration:number){struckAt[i]=performance.now();litUntil[i]=struckAt[i]+duration;audio.tone(i,muted);}
function press(i:number,pointer:number){if(!ready||modalKind)return;audio.unlock(muted);inputCount++;
 const result=session.down(i,pointer,performance.now());if(result==='ignored')return;accepted++;notice='';flash(i,425);
 if(result==='round'){const s=session.state;best[s.difficulty]=Math.max(best[s.difficulty],s.score);startPlayback();}
 save();render();
}
function release(pointer:number){held.delete(pointer);if(!modalKind&&session.up(pointer)==='lost'){save();render();}}
function resize(){const r=$('viewport').getBoundingClientRect();if(!r.width||!r.height)return;
 if(ready&&!modalKind){openModal('pause');}
 layout=fitLayout(r.width,r.height,RULES.tiles[session.state.difficulty]);layoutEpoch++;
 frame.style.left=layout.left+'px';frame.style.top=layout.top+'px';frame.style.height=layout.height+'px';frame.style.transform=`scale(${layout.scale})`;
 // The modal card stays in the safe frame; only its backdrop reaches the physical viewport.
 for(const[name,value]of Object.entries({'--backdrop-left':-(r.x+layout.left)/layout.scale,'--backdrop-top':-(r.y+layout.top)/layout.scale,'--backdrop-width':window.innerWidth/layout.scale,'--backdrop-height':window.innerHeight/layout.scale}))frame.style.setProperty(name,value+'px');
 for(const[name,value]of Object.entries({'--header-top':layout.headerTop,'--control-height':layout.controlHeight,'--settings-top':layout.settingsTop,'--controls-top':layout.controlsTop,'--status-top':layout.statusTop}))frame.style.setProperty(name,value+'px');
 buttons.forEach((b,i)=>{const p=layout.bells[i];b.hidden=!p;if(p){b.style.left=p.x-p.w/2+'px';b.style.top=p.y-p.h/2+'px';b.style.width=p.w+'px';b.style.height=p.h+'px';}});
 scene?.setLayout(layout);render();
}
function bind(element:HTMLButtonElement,id:string,action:()=>void){registered.set(id,element);element.dataset.target=id;let start:{id:number;x:number;y:number;epoch:number}|null=null;
 const clear=()=>{start=null;element.classList.remove('pressed');};
 element.addEventListener('pointerdown',e=>{if(!ready||e.button!==0||element.disabled)return;start={id:e.pointerId,x:e.clientX,y:e.clientY,epoch:layoutEpoch};element.setPointerCapture(e.pointerId);element.classList.add('pressed');audio.unlock(muted);});
 element.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>18*layout.scale)clear();});
 element.addEventListener('pointercancel',clear);element.addEventListener('lostpointercapture',clear);
 element.addEventListener('pointerup',e=>{const s=start;clear();if(s&&s.id===e.pointerId&&s.epoch===layoutEpoch&&Math.hypot(e.clientX-s.x,e.clientY-s.y)<=18*layout.scale&&!element.disabled){inputCount++;action();}});
 element.addEventListener('click',e=>{e.preventDefault();if(e.detail===0&&ready&&!element.disabled){audio.unlock(muted);inputCount++;action();}});
}
for(let i=0;i<4;i++){const button=document.createElement('button');button.type='button';button.className='bell';button.id='bell-'+i;button.dataset.target=button.id;button.setAttribute('aria-label',`${NAMES[i]}风铃，键盘 ${i+1}`);registered.set(button.id,button);$('bell-input').append(button);buttons.push(button);
 button.addEventListener('pointerdown',e=>{if(e.button!==0||!ready||modalKind)return;e.preventDefault();button.setPointerCapture(e.pointerId);held.set(e.pointerId,i);button.classList.add('pressed');press(i,e.pointerId);});
 const up=(e:PointerEvent)=>{button.classList.remove('pressed');release(e.pointerId);};button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',e=>{if(held.has(e.pointerId))up(e);});
 button.addEventListener('click',e=>{e.preventDefault();if(e.detail===0){press(i,20000+i);release(20000+i);}});
}
bind($('pause'),'pause',()=>openModal('pause'));
bind($('new'),'new',()=>{chosen=session.state.difficulty;openModal('new');});
bind($('help'),'help',()=>openModal('help'));
bind($('mute'),'mute',()=>{muted=!muted;audio.silence();save();openModal('pause');});
bind($('simple'),'simple',()=>{simple=!simple;save();openModal('pause');});
$('retry').addEventListener('click',()=>location.reload());
function render(){const s=session.state;
 $('score').textContent=`已奏 ${s.score} 轮 · 最佳 ${best[s.difficulty]}`;$('mode').textContent=`${['轻风','晨风','合奏'][s.difficulty]} · 第 ${s.sequence.length} 轮`;
 $('status').textContent=storageError?'保存失败，请保持页面打开':notice||(!ready?'庭院载入中…':s.phase==='lost'?'风停了，点「新一局」再奏':s.phase==='playing'?'听风铃，记住亮起的顺序':session.pending?'保持按住，再敲另一只风铃':`轮到你 · ${s.position} / ${s.sequence.length}`);
 $('status').classList.toggle('lost',s.phase==='lost');$('mute').textContent=muted?'声音：关':'声音：开';$('mute').setAttribute('aria-pressed',String(muted));$('simple').textContent=simple?'简动：开':'简动：关';$('simple').setAttribute('aria-pressed',String(simple));
 buttons.forEach((b,i)=>{b.setAttribute('aria-disabled',String(!!modalKind||s.phase!=='input'));b.setAttribute('aria-label',`${NAMES[i]}风铃，${performance.now()<litUntil[i]||session.pending?.tile===i?'正在鸣响':'按下敲响'}，键盘 ${i+1}`);});
}
function modalButton(id:string,text:string,primary:boolean,fn:()=>void){const b=document.createElement('button');b.type='button';b.id=id;b.className='porcelain'+(primary?' primary':'');b.textContent=text;$('modal-actions').append(b);bind(b,id,fn);return b;}
function drawModal(){for(const[id,el]of registered)if(el.closest('#modal'))registered.delete(id);$('modal-actions').replaceChildren();
 const help=modalKind==='help';$('modal-title').textContent=help?'记住风的来处':modalKind==='pause'?'风歇片刻':'选择风的节奏';
 if(help){$('modal-body').innerHTML='<p>看风铃亮起，再按相同顺序敲响。<br>完成一轮，下一轮追加一步。</p><p>轻风 3 铃 · 晨风 4 铃<br>合奏中会出现两只同时亮起。</p><p>双音先按住一铃，<br>0.5 秒内敲另一铃。<br>错铃或双音提前松开，本局结束。</p><p class="quiet">单音不催促；暂停或重新打开<br>会重播当前轮。静音也能玩。</p>';modalButton('resume','回到风铃',true,resume);}
 else if(modalKind==='pause'){$('modal-body').innerHTML=`<p>已奏 ${session.state.score} 轮</p><p>这一段旋律，仍为你留着。</p><p class="quiet">继续时会从头播放这一轮</p>`;modalButton('resume','继续这一段旋律',true,resume);}
 else{$('modal-body').innerHTML='<p class="quiet">听见一缕风，记下一段旋律</p>';
  ['轻风 · 3 只风铃','晨风 · 4 只风铃','合奏 · 双指配合'].forEach((s,d)=>modalButton('difficulty-'+d,(chosen===d?'✓  ':'')+s,chosen===d,()=>{chosen=d as Difficulty;drawModal();}));
  modalButton('confirm','开始新旋律',true,()=>{session=new Session(initial(Date.now(),chosen));notice='';closeModal();save();resize();closeModal();startPlayback();});
  if(modalKind!=='start')modalButton('resume','回到当前一局',false,resume);
 }
 const first=$('modal-actions').querySelector('button');first?.focus({preventScroll:true});
}
function openModal(kind:string){returnFocus=document.activeElement as HTMLElement;session.resume();held.clear();litUntil.fill(0);buttons.forEach(b=>b.classList.remove('pressed'));audio.silence();modalKind=kind;play.inert=true;modal.hidden=false;save();render();drawModal();}
function closeModal(){modalKind='';modal.hidden=true;play.inert=false;for(const[id,el]of registered)if(el.closest('#modal'))registered.delete(id);returnFocus?.focus({preventScroll:true});}
function resume(){if(!ready)return;closeModal();notice='';session.resume();save();startPlayback();}
function tick(now:number){if(!modalKind&&ready&&session.state.phase==='playing'&&now>=begin){const s=session.state,beat=Math.min(s.sequence.length-1,Math.floor((now-begin)/stepMs(s.sequence.length)));
 if(beat>lastBeat){if(beat>lastBeat+1){openModal('pause');return;}lastBeat=beat;for(const i of s.sequence[beat])flash(i,425*speed(s.sequence.length));if(beat===s.sequence.length-1){session.ready();save();render();}}}
 const lit=litUntil.map((t,i)=>!modalKind&&(now<t||session.pending?.tile===i));scene?.renderFrame(now,lit,struckAt,simple||!!modalKind);
}
document.addEventListener('keydown',e=>{if(e.repeat)return;const i=Number(e.key)-1;if(Number.isInteger(i)&&i>=0&&i<4&&!modalKind){e.preventDefault();press(i,10000+i);}if(e.key==='Escape'&&ready){e.preventDefault();if(modalKind==='pause'||modalKind==='help')resume();else if(!modalKind)openModal('pause');}
 if(e.key==='Tab'&&modalKind){const b=Array.from($('modal-actions').querySelectorAll('button'));if(b.length){e.preventDefault();const at=b.indexOf(document.activeElement as HTMLButtonElement);b[(at+(e.shiftKey?b.length-1:1))%b.length].focus();}}
});
document.addEventListener('keyup',e=>{const i=Number(e.key)-1;if(Number.isInteger(i)&&i>=0&&i<4)release(10000+i);});
function hide(){if(ready&&!modalKind&&session.state.phase!=='lost')openModal('pause');audio.silence();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});window.addEventListener('pagehide',hide);window.addEventListener('blur',hide);
resize();window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
const game=new Phaser.Game({type:Phaser.CANVAS,parent:'scene',width:720,height:layout.height,transparent:true,scale:{mode:Phaser.Scale.NONE},audio:{noAudio:true},banner:false,render:{antialias:true,roundPixels:false},input:{mouse:false,touch:false,keyboard:false},scene:new GardenScene(s=>{scene=s;scene.setLayout(layout);ready=true;loading.hidden=true;play.inert=true;modal.hidden=false;drawModal();render();},()=>{assetError=true;ready=false;loading.querySelector('p')!.textContent='画面载入失败，请重新打开';$('retry').hidden=false;},tick)});
Object.defineProperty(window,'__owngameChimes',{configurable:false,writable:false,value:Object.freeze({snapshot:()=>{
 const targets=Array.from(registered,([id,element])=>{const r=element.getBoundingClientRect();return{id,css:{x:r.x,y:r.y,w:r.width,h:r.height},disabled:element.disabled,element};}).filter(t=>!t.element.closest('[hidden]')&&(!modalKind?!t.element.closest('#modal'):!!t.element.closest('#modal'))&&t.css.w>0).map(({element,...t})=>t);
 return JSON.parse(JSON.stringify({id:'wind-chime-memory',ready:ready&&!assetError,engine:'phaser',phaser_version:Phaser.VERSION,source_sha256:__SOURCE_SHA__,state:session.state,pending:session.pending,modal:modalKind,chosen,best,muted,simple,saveError:storageError,inputCount,accepted,audio:audio.snapshot(),lit:litUntil.map((t,i)=>!modalKind&&(performance.now()<t||session.pending?.tile===i)),layout,targets,storage_key:SAVE_KEY}));
}})});
void game;

import Phaser from 'phaser';
import {initial,turn,advance,CONFIG,State,Difficulty,Direction} from './rules';
import {load,persist,SAVE_KEY} from './storage';
import {fitLayout,cellPoint} from './layout';
import {GardenScene} from './game-scene';

declare const __SOURCE_SHA__:string;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const viewport=$('viewport'),frame=$('frame'),play=$('play'),board=$('board-input'),modal=$('modal');
const loaded=load(()=>localStorage,matchMedia('(prefers-reduced-motion: reduce)').matches);
let state=loaded.state,simple=loaded.simple,muted=loaded.muted,best=loaded.best,notice=loaded.notice,saveError=loaded.saveError;
let paused=true,carry=0,lastNow=0,ready=false,assetError=false,scene:GardenScene|null=null,layout=fitLayout(720,1280,state.difficulty),layoutEpoch=0;
let modalKind='',pendingDifficulty=state.difficulty,returnFocus:HTMLElement|null=null;
let inputCount=0,accepted=0,rejected=0,audio:AudioContext|null=null;
const registered=new Map<string,HTMLButtonElement>();
const touches=new Set<number>();let multiple=false,gesture:{id:number;x:number;y:number;epoch:number}|null=null;
const names=['初游','游灯','逐风'],arrows=['→','↑','←','↓'];

function resize(){
 const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;
 layout=fitLayout(r.width,r.height,state.difficulty);layoutEpoch++;gesture=null;
 frame.style.left=layout.left+'px';frame.style.top=layout.top+'px';frame.style.height=layout.height+'px';frame.style.transform=`scale(${layout.scale})`;
 for(const [name,value]of Object.entries({'--header-top':layout.headerTop,'--header-height':layout.headerHeight,'--score-top':layout.headerHeight*.543,'--direction-top':layout.headerHeight*.726,'--status-top':layout.statusTop,'--row1-top':layout.row1Top,'--row2-top':layout.row2Top,'--control-height':layout.controlHeight}))frame.style.setProperty(name,value+'px');
 Object.assign(board.style,{left:layout.board.x+'px',top:layout.board.y+'px',width:layout.board.w+'px',height:layout.board.h+'px'});
 if(scene){scene.setLayout(layout);scene.setState(state,simple);}
}
resize();window.addEventListener('resize',resize);visualViewport?.addEventListener('resize',resize);
function save(){saveError=!persist(()=>localStorage,state,simple,muted,best);}
function unlockAudio(){try{const A=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(A&&!audio)audio=new A();void audio?.resume().catch(()=>{});}catch{}}
function bell(){if(muted||!audio)return;try{const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(660+Math.min(state.combo,8)*55,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.18);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.2);}catch{}}
function pause(message='已暂停，点继续逐珠'){paused=true;gesture=null;notice=message;save();render();}
function resume(){if(!ready||assetError||modalKind||state.status!=='alive')return;unlockAudio();lastNow=performance.now();paused=false;notice='';render();}
function primary(){if(state.status!=='alive'){pendingDifficulty=state.difficulty;reset();resume();}else if(paused)resume();else pause();}
function steer(d:Direction){inputCount++;if(!ready||paused||modalKind){rejected++;return;}const next=turn(state,d);if(!next){rejected++;return;}state=next;accepted++;save();render(false);}
function tick(now:number){
 const elapsed=lastNow?now-lastNow:0;lastNow=now;if(!ready||paused||modalKind)return;
 const previous=state,n=advance(previous,carry,elapsed,false);carry=n.carryMs;
 if(n.suspended){pause('画面暂歇，点继续逐珠');return;}if(n.state===previous)return;
 state=n.state;notice='';best[state.difficulty]=Math.max(best[state.difficulty],state.body.length);save();
 if(state.eaten>previous.eaten)bell();if(state.status!=='alive')paused=true;
 scene?.setState(state,simple,previous);render(false);
}
function render(updateScene=true){
 $('score').textContent=`长度 ${state.body.length}  ·  最佳 ${best[state.difficulty]}  ·  ${names[state.difficulty]}`;
 $('direction').textContent=state.status!=='alive'?'本次游灯结束':paused?'游龙已停靠':`前进 ${arrows[state.direction]}${state.queue.length?'  ·  接着 '+state.queue.map(d=>arrows[d]).join(' '):' · 滑动转向'}`;
 const c=CONFIG[state.difficulty],crash=state.crash;
 const result=state.status==='filled'?'满庭游龙！每一个角落都有了光':state.status==='crashed'?`碰到${crash&&(crash.x<0||crash.y<0||crash.x>=c.width||crash.y>=c.height)?'庭墙':'龙身'} · 本次长度 ${state.body.length}`:state.pending?`拾珠 +${2+state.combo} · 还有 ${state.pending} 节正在舒展`:paused?(state.ticks?'灯火仍在 · 点继续逐珠':'轻点开始 · 滑动转向'):'拾珠长大 · 灯下游庭';
 const message=saveError?'无法保存，请保持本页打开':notice||result;$('status').textContent=message;$('status').title=message;$('status').classList.toggle('error',saveError||state.status==='crashed');
 $('pause-label').textContent=!ready?'载入':state.status!=='alive'?'再游':paused?(state.ticks?'继续':'开始'):'暂停';
 $('pause-icon').innerHTML=paused?'<path d="m8 4 12 8-12 8Z"/>':'<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
 $('pause').setAttribute('aria-label',paused?'开始或继续逐珠':'暂停逐珠');
 $('simple-label').textContent=simple?'简动：开':'简动：关';$('simple').setAttribute('aria-pressed',String(simple));
 $('sound-label').textContent=muted?'声音：关':'声音：开';$('sound').setAttribute('aria-pressed',String(muted));
 for(const [id,element]of registered)if(!id.startsWith('difficulty-')&&!['confirm','cancel','close'].includes(id))element.disabled=!ready||assetError;
 if(updateScene)scene?.setState(state,simple);
}

function bind(element:HTMLButtonElement,id:string,action:()=>void){
 element.dataset.target=id;registered.set(id,element);let start:{x:number;y:number;id:number;epoch:number}|null=null;
 const clear=()=>{start=null;element.classList.remove('pressed');};
 element.addEventListener('pointerdown',e=>{if(element.disabled||!ready||e.button!==0)return;start={x:e.clientX,y:e.clientY,id:e.pointerId,epoch:layoutEpoch};element.setPointerCapture(e.pointerId);element.classList.add('pressed');});
 element.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>=18*layout.scale)clear();});
 element.addEventListener('pointercancel',clear);element.addEventListener('lostpointercapture',clear);
 element.addEventListener('pointerup',e=>{const s=start;clear();if(!s||s.id!==e.pointerId||s.epoch!==layoutEpoch||Math.hypot(e.clientX-s.x,e.clientY-s.y)>=18*layout.scale||element.disabled)return;inputCount++;action();});
 element.addEventListener('click',e=>{e.preventDefault();if(e.detail===0&&ready&&!element.disabled){inputCount++;action();}});
}
bind($<HTMLButtonElement>('pause'),'pause',primary);
bind($<HTMLButtonElement>('new'),'new',()=>openModal('new'));
bind($<HTMLButtonElement>('mode'),'mode',()=>openModal('mode'));
bind($<HTMLButtonElement>('help'),'help',()=>openModal('help'));
bind($<HTMLButtonElement>('simple'),'simple',()=>{simple=!simple;save();render();});
bind($<HTMLButtonElement>('sound'),'sound',()=>{muted=!muted;unlockAudio();save();render(false);});
$('retry').addEventListener('click',()=>location.reload());

board.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;touches.add(e.pointerId);board.setPointerCapture(e.pointerId);
 if(touches.size>1||multiple){multiple=true;gesture=null;return;}
 if(!ready||paused||modalKind){gesture=null;return;}gesture={id:e.pointerId,x:e.clientX,y:e.clientY,epoch:layoutEpoch};
});
board.addEventListener('pointermove',e=>{
 const a=gesture;if(!a||a.id!==e.pointerId||a.epoch!==layoutEpoch||multiple)return;
 const dx=e.clientX-a.x,dy=e.clientY-a.y,threshold=22*layout.scale;
 if(Math.max(Math.abs(dx),Math.abs(dy))<threshold)return;
 if(Math.min(Math.abs(dx),Math.abs(dy))<=Math.max(Math.abs(dx),Math.abs(dy))*.65)steer(Math.abs(dx)>Math.abs(dy)?dx>0?0:2:dy>0?3:1);
 gesture={id:a.id,x:e.clientX,y:e.clientY,epoch:layoutEpoch};
});
function releasePointer(e:PointerEvent){touches.delete(e.pointerId);if(gesture?.id===e.pointerId)gesture=null;if(!touches.size)multiple=false;}
board.addEventListener('pointerup',releasePointer);board.addEventListener('pointercancel',releasePointer);board.addEventListener('lostpointercapture',releasePointer);

function modalButton(id:string,label:string,primary:boolean,action:()=>void,parent=$('modal-actions')){
 const button=document.createElement('button');button.type='button';button.className='plaque'+(primary?' primary':'');button.textContent=label;parent.append(button);bind(button,id,action);return button;
}
function closeModal(){
 modalKind='';modal.hidden=true;play.inert=false;for(const key of [...registered.keys()])if(['close','cancel','confirm'].includes(key)||key.startsWith('difficulty-'))registered.delete(key);
 returnFocus?.focus({preventScroll:true});render();
}
function reset(){state=initial(Date.now(),pendingDifficulty);carry=0;paused=true;notice='新一局已备好 · 点开始出发';if(modalKind)closeModal();save();resize();render();}
function openModal(kind:string){
 if(modalKind)return;pause();pendingDifficulty=state.difficulty;modalKind=kind;returnFocus=document.activeElement as HTMLElement;
 play.inert=true;modal.hidden=false;$('modal-body').replaceChildren();$('modal-actions').replaceChildren();
 if(kind==='help'){
  $('modal-title').textContent='游庭须知';$('modal-body').innerHTML='<h3>逐珠游庭</h3><p>在棋盘内四向滑动，或用方向键 / WASD。<br>手指可以不抬起，连续划出转弯。</p><h3>舒展绢龙</h3><p>不能直接掉头，最多预备两次转弯。<br>拾珠基础长 2 节；1.6 秒内连拾额外增长。<br>撞到庭墙或龙身，本次游灯结束。</p><h3>灯火仍在</h3><p>切后台、失焦或重新打开都会暂停。<br>点继续出发；进度自动保存。</p><p class="quiet">简动与静音不改变规则，三档分别记录最佳。</p>';
  modalButton('close','回到庭院',true,closeModal);
 }else{
  $('modal-title').textContent=kind==='mode'?'选择步调':'重新出发';$('modal-body').innerHTML='<p>确认后替换当前游龙，最佳长度会保留。</p>';
  if(kind==='mode'){
   const choices=document.createElement('div');choices.className='mode-choices';$('modal-body').append(choices);
   names.forEach((name,d)=>modalButton('difficulty-'+d,name+' · '+['舒缓','轻快','迅捷'][d],d===pendingDifficulty,()=>{
    pendingDifficulty=d as Difficulty;for(let i=0;i<3;i++){const b=registered.get('difficulty-'+i)!;b.classList.toggle('primary',i===d);b.setAttribute('aria-pressed',String(i===d));}
   },choices).setAttribute('aria-pressed',String(d===pendingDifficulty)));
  }
  modalButton('cancel','保留当前进度',false,closeModal);modalButton('confirm','确认新开一局',true,reset);
 }
 modal.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{
 if(modalKind){if(e.key==='Escape'){e.preventDefault();closeModal();}else if(e.key==='Tab'){const buttons=Array.from(modal.querySelectorAll<HTMLButtonElement>('button'));if(buttons.length){e.preventDefault();const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(i+(e.shiftKey?buttons.length-1:1))%buttons.length].focus();}}return;}
 const dirs:Record<string,Direction>={ArrowRight:0,ArrowUp:1,ArrowLeft:2,ArrowDown:3,d:0,D:0,w:1,W:1,a:2,A:2,s:3,S:3};
 if(e.key in dirs){e.preventDefault();if(!e.repeat)steer(dirs[e.key]);}
 else if(e.code==='Space'||e.key==='Escape'){e.preventDefault();if(!e.repeat){inputCount++;if(e.code==='Space')primary();else pause();}}
},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('已暂停，回来后点继续');});
window.addEventListener('blur',()=>pause());window.addEventListener('pagehide',()=>pause());
render();
const game=new Phaser.Game({type:Phaser.AUTO,parent:'scene',width:720,height:layout.height,transparent:true,scale:{mode:Phaser.Scale.NONE},audio:{noAudio:true},banner:false,
 render:{antialias:true,roundPixels:false},input:{mouse:false,touch:false,keyboard:false},scene:new GardenScene(s=>{scene=s;scene.setLayout(layout);ready=true;$('loading').hidden=true;render();},message=>{assetError=true;ready=false;$('loading').hidden=false;$('loading').querySelector('p')!.textContent=message;$('retry').hidden=false;render();},tick)});

function cssRect(e:HTMLElement){const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}
Object.defineProperty(window,'__owngameSerpent',{configurable:false,writable:false,value:Object.freeze({snapshot:()=>{
 const f=frame.getBoundingClientRect(),v=viewport.getBoundingClientRect();
 const targets=Array.from(registered,([id,e])=>({id,css:cssRect(e),enabled:!e.disabled&&ready&&(!modalKind?!id.startsWith('difficulty-')&&!['close','cancel','confirm'].includes(id):id.startsWith('difficulty-')||['close','cancel','confirm'].includes(id))})).filter(t=>t.enabled);
 if(!modalKind&&ready)targets.push({id:'board',css:cssRect(board),enabled:true});
 if(!modalKind&&paused&&ready){const t=targets.find(t=>t.id==='pause');if(t)targets.push({...t,id:'start'});}
 return JSON.parse(JSON.stringify({id:'silk-serpent',ready:ready&&!assetError,engine:'phaser',phaserVersion:Phaser.VERSION,source_sha256:__SOURCE_SHA__,artDirection:'A-initial-silk-courtyard',
  state,paused,carry,simple,muted,modal:modalKind,notice,saveError,best,inputCount,accepted,rejected,saveKey:SAVE_KEY,
  board:{width:layout.board.columns,height:layout.board.rows,cell:layout.board.cell,left:layout.board.x,top:layout.board.y,css:cssRect(board)},
  design:{width:layout.width,height:layout.height},layout:{portrait:layout.portrait,scale:layout.scale,frame:{x:f.x,y:f.y,w:f.width,h:f.height},viewport:{x:v.x,y:v.y,w:v.width,h:v.height},header:cssRect($('header')),controlHeight:layout.controlHeight,epoch:layoutEpoch},
  headCss:{x:f.x+cellPoint(layout,state.body[0]).x*layout.scale,y:f.y+cellPoint(layout,state.body[0]).y*layout.scale},renderer:game.renderer?.type===Phaser.WEBGL?'webgl':'canvas',targets,
 }));
}})});

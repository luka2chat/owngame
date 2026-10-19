import Phaser from 'phaser';
import {initial,move,undo,won,legal,State,Size} from './rules';
import {load,persist,SAVE_KEY} from './storage';
import {fitLayout,cell} from './layout';
import {BoardScene} from './board-scene';
declare const __SOURCE_SHA__:string;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const frame=$('frame'),play=$('play'),modal=$('modal'),loading=$('loading');
const restored=load(()=>localStorage,matchMedia('(prefers-reduced-motion: reduce)').matches);
let state=restored.state,simple=restored.simple,best=restored.best,notice=restored.notice,saveError=restored.saveError;
let scene:BoardScene|null=null,ready=false,failed=false,modalKind='',pending='',busyUntil=0,inputCount=0,layoutEpoch=0;
let layout=fitLayout(720,1280),returnFocus:HTMLElement|null=null;
let fontReady=false,backgroundReady=false;
const background=new Image();
const buttons=new Map<string,HTMLButtonElement>(),cells:HTMLButtonElement[]=[];
const bg=$<HTMLCanvasElement>('backdrop');
function drawBackdrop(){
  if(!backgroundReady)return;const dpr=Math.min(devicePixelRatio||1,3);
  bg.width=Math.round(innerWidth*dpr);bg.height=Math.round(innerHeight*dpr);
  const c=bg.getContext('2d')!;
  // One full-screen paper layer extends behind the native safe areas. Runtime crop excludes the baked title.
  c.drawImage(background,0,310,background.width,background.height-310,0,0,bg.width,bg.height);
}
function resize(){
  const r=$('viewport').getBoundingClientRect();if(!r.width||!r.height)return;
  layout=fitLayout(r.width,r.height);layoutEpoch++;
  frame.style.width=layout.width+'px';frame.style.left=layout.left+'px';frame.style.top=layout.top+'px';frame.style.height=layout.height+'px';frame.style.transform=`scale(${layout.scale})`;
  for(const [key,v] of Object.entries({'header-left':layout.headerLeft,'header-width':layout.headerWidth,'panel-left':layout.panelLeft,'panel-width':layout.panelWidth,'header-top':layout.headerTop,'header-height':layout.headerHeight,'tabs-top':layout.tabsTop,'control-height':layout.controlHeight,'primary-top':layout.primaryTop,'secondary-top':layout.secondaryTop,'stats-top':layout.statsTop,'notice-top':layout.noticeTop}))frame.style.setProperty('--'+key,v+'px');
  cells.forEach((b,i)=>{const p=cell(layout,state.n,i);b.style.left=p.x+'px';b.style.top=p.y+'px';b.style.width=p.size+'px';b.style.height=p.size+'px';b.classList.remove('pressed');});
  scene?.setLayout(layout);drawBackdrop();if(scene)render();
}
resize();addEventListener('resize',resize);visualViewport?.addEventListener('resize',resize);
function maybeReady(){if(!scene||!fontReady||!backgroundReady||failed)return;ready=true;loading.hidden=true;resize();render();}
function fail(){failed=true;ready=false;loading.hidden=false;loading.querySelector('p')!.textContent='画面未能载入，请重新打开';$('retry').hidden=false;}
background.onload=()=>{backgroundReady=true;drawBackdrop();maybeReady();};background.onerror=fail;background.src='./assets/letter-background.png';
document.fonts.load('28px PostcardHand').then(()=>{fontReady=true;maybeReady();}).catch(fail);
$('retry').addEventListener('click',()=>location.reload());
function save(){saveError=!persist(()=>localStorage,state,simple,best);}
function bind(b:HTMLButtonElement,id:string,action:()=>void){
  buttons.set(id,b);b.dataset.target=id;let start:{x:number;y:number;pointer:number;epoch:number}|null=null;
  const clear=()=>{start=null;b.classList.remove('pressed');};
  b.addEventListener('pointerdown',e=>{if(!ready||b.disabled||e.button!==0)return;start={x:e.clientX,y:e.clientY,pointer:e.pointerId,epoch:layoutEpoch};b.setPointerCapture(e.pointerId);b.classList.add('pressed');});
  b.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>=18*layout.scale)clear();});
  b.addEventListener('pointercancel',clear);b.addEventListener('lostpointercapture',clear);
  b.addEventListener('pointerup',e=>{const a=start;clear();if(!a||a.pointer!==e.pointerId||a.epoch!==layoutEpoch||Math.hypot(e.clientX-a.x,e.clientY-a.y)>=18*layout.scale||b.disabled)return;inputCount++;action();});
  b.addEventListener('click',e=>{e.preventDefault();if(e.detail===0&&ready&&!b.disabled){inputCount++;action();}});
}
function ensureCells(){
  if(cells.length===state.n*state.n)return;
  for(const id of buttons.keys())if(id.startsWith('cell-'))buttons.delete(id);
  cells.splice(0);$('board-input').replaceChildren();$('board-input').setAttribute('aria-label',`${state.n}行${state.n}列滑块拼图`);
  state.board.forEach((_,i)=>{const b=document.createElement('button');b.type='button';b.className='cell';$('board-input').append(b);cells.push(b);bind(b,'cell-'+i,()=>playAt(i));});
  cells.forEach((b,i)=>{const p=cell(layout,state.n,i);Object.assign(b.style,{left:p.x+'px',top:p.y+'px',width:p.size+'px',height:p.size+'px'});});
}
function render(previous?:number[]){
  ensureCells();const complete=won(state.board),options=legal(state.board,state.n);
  $('stats').textContent=`${state.moves} 步 · ${state.n*state.n-1} 枚拼片 · 最佳 ${best[state.n]||'—'}`;
  $('notice').textContent=saveError?'存储不可用，本局暂时无法保存':notice||(complete?'明信片拼好了 · 再寄一封吧':'点同一行或列的拼片，让山城归位');$('notice').classList.toggle('error',saveError);
  $<HTMLButtonElement>('undo').disabled=!state.history.length;
  $('simple-text').textContent=simple?'简动：开':'简动：关';$('simple').setAttribute('aria-pressed',String(simple));
  document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.size)===state.n)));
  cells.forEach((b,i)=>{const v=state.board[i];b.setAttribute('aria-label',`第${Math.floor(i/state.n)+1}行第${i%state.n+1}列，${v?v+'号拼片':'空位'}`);b.setAttribute('aria-disabled',String(complete||!v||!options.includes(i)));b.hidden=!v&&!complete;b.tabIndex=v&&!complete?0:-1;});
  scene?.renderState(state,simple,previous);
}
function playAt(at:number){
  if(!ready||modalKind||performance.now()<busyUntil)return;
  const next=move(state,at);
  if(!next){notice=won(state.board)?'已经拼好，可以再寄一封':'请选择空位同行或同列的拼片';render();return;}
  const previous=state.board;state=next;notice='';busyUntil=performance.now()+(simple?0:160);
  if(won(state.board)&&(!best[state.n]||state.moves<best[state.n]))best[state.n]=state.moves;
  save();render(previous);
}
function confirm(action:string){
  if(!ready||modalKind||performance.now()<busyUntil)return;pending=action;
  if(state.moves&&!won(state.board))openModal('confirm');else reset();
}
function reset(){
  const n=pending.startsWith('size-')?Number(pending.slice(5)) as Size:state.n,seed=pending==='restart'?state.seed:Date.now()>>>0;
  state=initial(n,seed);pending='';busyUntil=0;notice='';closeModal();save();resize();render();
}
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-size]'))bind(b,'size-'+b.dataset.size,()=>{if(Number(b.dataset.size)!==state.n)confirm('size-'+b.dataset.size);});
bind($('undo'),'undo',()=>{if(modalKind||performance.now()<busyUntil||!state.history.length)return;const before=state.board;state=undo(state);notice='已退回一步';busyUntil=performance.now()+(simple?0:160);save();render(before);});
bind($('peek'),'peek',()=>{if(!modalKind)openModal('peek');});bind($('new'),'new',()=>confirm('new'));bind($('restart'),'restart',()=>confirm('restart'));
bind($('help'),'help',()=>{if(!modalKind)openModal('help');});bind($('simple'),'simple',()=>{if(modalKind)return;simple=!simple;busyUntil=0;save();render();});
function modalButton(id:string,text:string,action:()=>void){const b=document.createElement('button');b.type='button';b.className='paper';b.textContent=text;$('modal-actions').append(b);bind(b,id,action);}
function openModal(kind:string){
  modalKind=kind;returnFocus=document.activeElement as HTMLElement;play.inert=true;modal.hidden=false;$('modal-actions').replaceChildren();
  if(kind==='peek'){
    $('modal-title').textContent='一封来自山城的信';$('modal-body').innerHTML='<img class="original" src="./assets/watercolor-town.png" alt="完整水彩山城原图"><p class="quiet">按数字从左到右、从上到下排列</p>';modalButton('close','继续拼图',closeModal);
  }else if(kind==='help'){
    $('modal-title').textContent='慢慢拼，让山城归位';$('modal-body').innerHTML='<p>点空位同行或同列的拼片，<br>中间的拼片会一起滑入空位。</p><p>按 1、2、3… 还原图片，<br>空位留在右下角。</p><p>一次点击算一步，可撤销最近 100 手。</p><p>重来保留本局；再寄一封重新打乱。</p><p class="quiet">每手自动保存，没有倒计时。</p>';modalButton('close','继续拼图',closeModal);
  }else{
    $('modal-title').textContent='开始下一封来信？';$('modal-body').innerHTML=`<p>${pending==='restart'?'将恢复本局最初的布局。':'将开始一局新的明信片拼图。'}</p><p class="quiet">当前进度会被替换。</p>`;modalButton('cancel','继续这一封',()=>{pending='';closeModal();});modalButton('confirm','确认开始',reset);
  }
  $('modal-actions').querySelector('button')?.focus({preventScroll:true});
}
function closeModal(){modalKind='';modal.hidden=true;play.inert=false;for(const id of ['close','cancel','confirm'])buttons.delete(id);returnFocus?.focus({preventScroll:true});}
document.addEventListener('keydown',e=>{if(!modalKind)return;if(e.key==='Escape'){e.preventDefault();pending='';closeModal();}if(e.key==='Tab'){const options=Array.from($('modal-actions').querySelectorAll('button'));e.preventDefault();const at=options.indexOf(document.activeElement as HTMLButtonElement);options[(at+(e.shiftKey?options.length-1:1))%options.length]?.focus();}});
// Every change is already saved. Backgrounding must not rewrite an untouched legacy save.
addEventListener('pagehide',()=>{busyUntil=0;});document.addEventListener('visibilitychange',()=>{if(document.hidden)busyUntil=0;});
render();
const game=new Phaser.Game({type:Phaser.AUTO,parent:'scene',width:720,height:layout.height,transparent:true,scale:{mode:Phaser.Scale.NONE},audio:{noAudio:true},banner:false,render:{antialias:true},input:{mouse:false,touch:false,keyboard:false},scene:new BoardScene(s=>{scene=s;scene.setLayout(layout);maybeReady();},fail)});
Object.defineProperty(window,'__owngameSlide',{configurable:false,writable:false,value:Object.freeze({snapshot:()=>{
  const f=frame.getBoundingClientRect(),safe=$('viewport').getBoundingClientRect(),z=state.board.indexOf(0);
  return JSON.parse(JSON.stringify({id:'postcard-slide',ready:ready&&!failed,engine:'phaser',phaserVersion:Phaser.VERSION,artDirection:'C-watercolor',source_sha256:__SOURCE_SHA__,state,simple,best,notice,saveError,modal:modalKind,busy:performance.now()<busyUntil,inputCount,won:won(state.board),legal:legal(state.board,state.n),saveKey:SAVE_KEY,
    design:{width:layout.width,height:layout.height},layout:{...layout,frame:{x:f.x,y:f.y,w:f.width,h:f.height},viewport:{x:safe.x,y:safe.y,w:safe.width,h:safe.height},capsuleReserveCss:68},
    cues:won(state.board)?[]:legal(state.board,state.n).map(i=>({index:i,direction:Math.floor(i/state.n)===Math.floor(z/state.n)?i<z?'right':'left':i<z?'down':'up'})),
    renderer:game.renderer?.type===Phaser.WEBGL?'webgl':'canvas',targets:Array.from(buttons,([id,b])=>{const r=b.getBoundingClientRect();return{id,css:{x:r.x,y:r.y,w:r.width,h:r.height},enabled:!b.disabled,visible:!!r.width&&!!r.height&&!b.hidden&&(!modalKind?!['close','cancel','confirm'].includes(id):['close','cancel','confirm'].includes(id))};}).filter(t=>t.visible)}));
}})});

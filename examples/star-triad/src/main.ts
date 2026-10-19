import Phaser from 'phaser';
import {initial,move,legal,undo,choose} from './rules';
import {restore,persist,SAVE_KEY} from './storage';
import {BoardScene} from './board-scene';
import {fitLayout} from './layout';

declare const __SOURCE_SHA__:string;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const frame=$('frame'),play=$('play'),modal=$('modal'),loading=$('loading');
const storage=()=>window.localStorage;
const restored=restore(storage,window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let state=restored.state,solo=restored.solo,simple=restored.simple,notice=restored.notice,storageError=restored.storageError;
let scene:BoardScene|null=null,ready=false,assetError=false,modalKind='',pending='',busyUntil=0,inputs=0;
let botTimer:ReturnType<typeof setTimeout>|undefined;
let generation=0,returnFocus:HTMLElement|null=null;
const cellButtons:HTMLButtonElement[]=[];
const registered=new Map<string,{element:HTMLButtonElement;action:()=>void}>();
let layout=fitLayout(720,1280),layoutEpoch=0;

function resize(){
  const r=$('viewport').getBoundingClientRect();
  if(!r.width||!r.height)return;
  layout=fitLayout(r.width,r.height);layoutEpoch++;
  frame.style.left=layout.left+'px';frame.style.top=layout.top+'px';frame.style.height=layout.height+'px';
  frame.style.transform=`scale(${layout.scale})`;frame.style.setProperty('--scale',String(layout.scale));
  for(const [name,value]of Object.entries({
    '--header-offset':layout.headerOffset,'--footer-offset':layout.footerOffset,
    '--settings-offset':layout.settingsOffset,'--control-height':layout.controlHeight,
  }))frame.style.setProperty(name,value+'px');
  cellButtons.forEach((button,i)=>{const p=layout.cells[i],s=layout.boardScale;
    button.style.left=p.x-88*s+'px';button.style.top=p.y-86*s+'px';
    button.style.width=176*s+'px';button.style.height=172*s+'px';button.classList.remove('pressed');
  });
  if(scene){scene.setLayout(layout);render();}
}
resize();window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);

function save(){storageError=!persist(storage,state,solo,simple).ok;}
function cancelBot(){generation++;clearTimeout(botTimer);botTimer=undefined;}
function queueBot(){
  cancelBot();
  if(!ready||!solo||state.turn!==2||state.winner||modalKind||document.hidden)return;
  const epoch=generation;
  botTimer=setTimeout(()=>{
    botTimer=undefined;if(epoch!==generation||modalKind||document.hidden||!solo||state.turn!==2||state.winner)return;
    playAt(choose(state),true);
  },Math.max(0,busyUntil-performance.now())+120);
}

/** Pointer and keyboard actions use the same handlers. A drag or pointer cancellation never activates a button. */
function bind(element:HTMLButtonElement,id:string,action:()=>void){
  element.dataset.target=id;registered.set(id,{element,action});
  let start:{x:number;y:number;id:number;epoch:number}|null=null;
  const clear=()=>{start=null;element.classList.remove('pressed');};
  element.addEventListener('pointerdown',e=>{
    if(element.disabled||!ready||e.button!==0)return;
    start={x:e.clientX,y:e.clientY,id:e.pointerId,epoch:layoutEpoch};
    element.setPointerCapture(e.pointerId);element.classList.add('pressed');
    if(id.startsWith('cell-'))preview(Number(id.slice(5)));
  });
  element.addEventListener('pointermove',e=>{
    const scale=frame.getBoundingClientRect().width/720;
    if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>=18*scale){clear();scene?.preview(-1,state.turn);}
  });
  element.addEventListener('pointercancel',()=>{clear();scene?.preview(-1,state.turn);});
  element.addEventListener('lostpointercapture',clear);
  element.addEventListener('pointerup',e=>{
    const a=start,scale=frame.getBoundingClientRect().width/720;clear();scene?.preview(-1,state.turn);
    if(!a||a.id!==e.pointerId||a.epoch!==layoutEpoch||Math.hypot(e.clientX-a.x,e.clientY-a.y)>=18*scale||element.disabled)return;
    inputs++;action();
  });
  element.addEventListener('click',e=>{
    // Pointer input already activates on release; detail=0 is native keyboard/assistive activation.
    e.preventDefault();if(e.detail===0&&ready&&!element.disabled){inputs++;action();}
  });
  element.addEventListener('mouseenter',()=>{if(id.startsWith('cell-'))preview(Number(id.slice(5)));});
  element.addEventListener('mouseleave',()=>scene?.preview(-1,state.turn));
  element.addEventListener('focus',()=>{if(id.startsWith('cell-'))preview(Number(id.slice(5)));});
  element.addEventListener('blur',()=>scene?.preview(-1,state.turn));
}
function preview(at:number){
  if(!ready||modalKind||state.winner||performance.now()<busyUntil||solo&&state.turn===2||state.board[at])return;
  scene?.preview(at,state.turn);
}

layout.cells.forEach(({x,y},i)=>{
  const button=document.createElement('button');button.type='button';button.className='cell';
  button.style.left=x-88+'px';button.style.top=y-86+'px';
  $('board-input').append(button);cellButtons.push(button);bind(button,'cell-'+i,()=>playAt(i));
});
resize();
bind($<HTMLButtonElement>('undo'),'undo',()=>{
  if(modalKind)return;cancelBot();state=undo(state,solo);busyUntil=0;notice='已退回上一回合';save();render();queueBot();
});
bind($<HTMLButtonElement>('new'),'new',()=>confirm('new'));
bind($<HTMLButtonElement>('mode'),'mode',()=>confirm('mode'));
bind($<HTMLButtonElement>('simple'),'simple',()=>{if(modalKind)return;simple=!simple;busyUntil=0;save();render();queueBot();});
bind($<HTMLButtonElement>('help'),'help',()=>openModal('help'));
$('retry').addEventListener('click',()=>location.reload());

function render(animate=false){
  $('star-count').textContent='星 '+state.board.filter(v=>v===1).length;
  $('moon-count').textContent='月 '+state.board.filter(v=>v===2).length;
  const status=state.winner===3?'平分秋色':state.winner?(state.winner===1?'星获胜':'月获胜'):
    solo&&state.turn===2?'月正在思考…':state.turn===1?'星落子':'月落子';
  $('status-text').textContent=status;$('result').classList.toggle('won',!!state.winner);
  $('notice').textContent=storageError?'存储不可用，本局暂时无法保存':notice||'每手自动保存，随时接续';
  $('notice').classList.toggle('error',storageError);
  $<HTMLButtonElement>('undo').disabled=state.moves.length===0;
  $('mode-text').textContent=solo?'单人陪练':'同屏双人';
  $('mode').setAttribute('aria-label',(solo?'单人陪练':'同屏双人')+'，点击切换模式');
  $('simple-text').textContent=simple?'简动：开':'简动：关';$('simple').setAttribute('aria-pressed',String(simple));
  cellButtons.forEach((button,i)=>{
    const blocked=!!state.winner||!!state.board[i]||solo&&state.turn===2;
    button.setAttribute('aria-label',`第${Math.floor(i/3)+1}行第${i%3+1}列，${state.board[i]===1?'星':state.board[i]===2?'月':'空位'}`);
    button.setAttribute('aria-disabled',String(blocked));button.tabIndex=blocked?-1:0;
  });
  scene?.renderState(state,animate,simple);
}
function playAt(at:number,bot=false){
  if(!ready||modalKind||performance.now()<busyUntil||!bot&&solo&&state.turn===2)return;
  const next=move(state,at);
  if(!next){notice=state.winner?'本局已结束，可以开始新一局':'这里已有棋子';render();return;}
  cancelBot();state=next;notice='';busyUntil=performance.now()+(simple?0:160);save();render(true);queueBot();
}
function confirm(action:string){
  if(modalKind)return;pending=action;
  if(state.moves.length&&!state.winner)openModal('confirm');else reset();
}
function reset(){
  cancelBot();if(pending==='mode')solo=!solo;
  state=initial('tris');busyUntil=0;pending='';notice='';closeModal(false);save();render();queueBot();
}
function modalButton(id:string,label:string,primary:boolean,action:()=>void){
  const button=document.createElement('button');button.type='button';button.className='glass'+(primary?' primary':'');button.textContent=label;
  $('modal-actions').append(button);bind(button,id,action);
}
function openModal(kind:string){
  if(modalKind)return;cancelBot();scene?.preview(-1,state.turn);returnFocus=document.activeElement as HTMLElement;
  modalKind=kind;play.inert=true;modal.hidden=false;$('modal-actions').replaceChildren();
  if(kind==='help'){
    $('modal-title').textContent='星图里的约定';
    $('modal-body').innerHTML='<h3>三子连成一线</h3><p>轮流在空格落子，横、竖、斜向<br>连成三个即获胜；满盘则为平局。</p><h3>一起玩，或独自练习</h3><p>单人陪练由你执星先手；<br>同屏双人轮流操作。</p><h3>随时停下，也能继续</h3><p>每手自动保存；单人悔一步<br>会退回到你的上一回合。</p><p class="quiet">没有倒计时，慢慢想。</p>';
    modalButton('close','知道了，继续',true,()=>closeModal());
  }else{
    $('modal-title').textContent='开始新的星图？';
    $('modal-body').innerHTML=`<p>${pending==='mode'?'切换模式会开始新局。':'开始新局会替换当前棋局。'}</p><p class="quiet">当前棋局尚未结束</p>`;
    modalButton('cancel','继续本局',false,()=>{pending='';closeModal();});
    modalButton('confirm','开始新局',true,reset);
  }
  $('modal-actions').querySelector('button')?.focus({preventScroll:true});
}
function closeModal(resume=true){
  modalKind='';modal.hidden=true;play.inert=false;
  for(const key of ['close','cancel','confirm'])registered.delete(key);
  returnFocus?.focus({preventScroll:true});if(resume)queueBot();
}
document.addEventListener('keydown',e=>{
  if(!modalKind)return;
  if(e.key==='Escape'){e.preventDefault();pending='';closeModal();}
  if(e.key==='Tab'){
    const buttons=Array.from($('modal-actions').querySelectorAll('button'));
    if(buttons.length){e.preventDefault();const at=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(at+(e.shiftKey?buttons.length-1:1))%buttons.length].focus();}
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelBot();save();}else{render();queueBot();}});
window.addEventListener('pagehide',()=>{cancelBot();save();});
window.addEventListener('pageshow',()=>{if(ready){render();queueBot();}});
render();

const game=new Phaser.Game({
  type:Phaser.AUTO,parent:'scene',width:720,height:layout.height,transparent:true,
  scale:{mode:Phaser.Scale.NONE},audio:{noAudio:true},banner:false,
  render:{antialias:true,roundPixels:false},input:{mouse:false,touch:false,keyboard:false},
  scene:new BoardScene(s=>{scene=s;scene.setLayout(layout);ready=true;loading.hidden=true;render();queueBot();},message=>{
    assetError=true;ready=false;loading.querySelector('p')!.textContent=message;$('retry').hidden=false;
  }),
});
Object.defineProperty(window,'__owngameBoard',{configurable:false,writable:false,value:Object.freeze({
  snapshot:()=>JSON.parse(JSON.stringify({ready:ready&&!assetError,id:'star-triad',kind:'tris',engine:'phaser',phaserVersion:Phaser.VERSION,
    source_sha256:__SOURCE_SHA__,artDirection:'C-moonlight-enamel',state,solo,simple,modal:modalKind,notice,saveError:storageError,
    busy:performance.now()<busyUntil,ai:!!botTimer,inputCount:inputs,design:{width:layout.width,height:layout.height},saveKey:SAVE_KEY,
    layout:{portrait:layout.portrait,boardCenter:layout.boardCenter,boardScale:layout.boardScale,controlHeight:layout.controlHeight,
      frame:{x:frame.getBoundingClientRect().x,y:frame.getBoundingClientRect().y,w:frame.getBoundingClientRect().width,h:frame.getBoundingClientRect().height}},
    renderer:game.renderer?.type===Phaser.WEBGL?'webgl':'canvas',legal:legal(state),
    targets:Array.from(registered,([id,{element}])=>{const r=element.getBoundingClientRect(),f=frame.getBoundingClientRect(),s=f.width/720;
      return {id,x:(r.x-f.x+r.width/2)/s,y:(r.y-f.y+r.height/2)/s,w:r.width/s,h:r.height/s,
        css:{x:r.x,y:r.y,w:r.width,h:r.height},enabled:!element.disabled&&(!modalKind?!id.match(/^(close|cancel|confirm)$/):id.match(/^(close|cancel|confirm)$/))};
    }).filter(t=>t.enabled),
  })),
})});

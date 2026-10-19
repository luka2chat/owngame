import Phaser from 'phaser';
import {initial,move,undo,won,lost,State,Dir,dirs} from './rules';
import {load,persist,SAVE_KEY} from './storage';
import {fitLayout,Box} from './layout';
import {PotteryScene} from './board-scene';

declare const __SOURCE_SHA__:string;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const board=$('board-input'),play=$('play'),modal=$('modal'),loading=$('loading');
const loaded=load(()=>window.localStorage,matchMedia('(prefers-reduced-motion: reduce)').matches);
let state=loaded.state,best=loaded.best,simple=loaded.simple,notice=loaded.notice,saveError=loaded.saveError;
let noticeTimer:ReturnType<typeof setTimeout>|undefined;
let scene:PotteryScene|null=null,ready=false,assetError=false,modalKind='',busyUntil=0,inputs=0,accepted=0;
let layout=fitLayout(innerWidth,innerHeight,{top:0,right:0,bottom:0,left:0}),epoch=0,returnFocus:HTMLElement|null=null;
const registered=new Map<string,HTMLButtonElement>();
let gesture:{x:number;y:number;id:number;epoch:number;cancelled:boolean}|null=null;
const pointers=new Set<number>();

function place(element:HTMLElement,r:Box){Object.assign(element.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});}
function resize(){
  const s=getComputedStyle($('safe-insets'));
  layout=fitLayout(innerWidth,innerHeight,{top:parseFloat(s.paddingTop)||0,right:parseFloat(s.paddingRight)||0,bottom:parseFloat(s.paddingBottom)||0,left:parseFloat(s.paddingLeft)||0});
  epoch++;gesture=null;
  for(const [id,r]of Object.entries({'title-region':layout.title,'score-current':layout.current,'score-best':layout.best,turns:layout.turns,'board-input':layout.boardInput,status:layout.status,undo:layout.undo,new:layout.fresh,help:layout.help,simple:layout.simple}))place($(id),r);
  const font=Math.max(13,Math.min(18,layout.stageWidth*.04));
  for(const e of document.querySelectorAll<HTMLElement>('nav button span:not(.toggle)'))e.style.fontSize=font+'px';
  for(const e of document.querySelectorAll<HTMLElement>('.score strong'))e.style.fontSize=Math.max(20,Math.min(34,layout.stageWidth*.074))+'px';
  for(const e of document.querySelectorAll<HTMLElement>('.score>span'))e.style.fontSize=Math.max(12,Math.min(17,layout.stageWidth*.037))+'px';
  scene?.cancelAnimation();busyUntil=0;
  if(scene){scene.setLayout(layout);scene.renderState(state);updateUI();}
}
resize();window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
new ResizeObserver(()=>resize()).observe($('safe-insets'));

function save(){saveError=!persist(()=>window.localStorage,state,best,simple);}
function say(message:string,seconds=3){
  clearTimeout(noticeTimer);notice=message;updateUI();
  if(seconds)noticeTimer=setTimeout(()=>{notice='';updateUI();},seconds*1000);
}
function updateUI(){
  $('current').textContent=String(state.score);$('best').textContent=String(best);
  const measure=document.createElement('canvas').getContext('2d')!;
  for(const id of ['current','best']){
    const number=$(id),parent=number.parentElement!,label=parent.querySelector('span')!;
    const digits=number.textContent||'0',base=Math.max(20,Math.min(34,layout.stageWidth*.074));
    parent.classList.toggle('long-score',digits.length>6);
    if(digits.length>6){number.style.fontSize=Math.max(11,Math.min(18,layout.current.w/(digits.length*.65)))+'px';continue;}
    measure.font=`bold ${base}px Georgia, serif`;
    const available=parent.getBoundingClientRect().width-label.getBoundingClientRect().width-5;
    number.style.fontSize=Math.min(base,base*Math.max(0,available)/Math.max(1,measure.measureText(digits).width))+'px';
  }
  $('turns').textContent=`${state.moves} 手 · 撤销 ${state.undos}/1`;
  const status=won(state.board)?'2048 出窑了 · 这一炉圆满':lost(state.board)?'窑台已满 · 再开一炉吧':'横向或竖向滑动，让相同数字相融';
  $('status').textContent=saveError?'无法保存，请保持本页打开':notice||status;
  $('status').classList.toggle('error',saveError);$('status').classList.toggle('finished',won(state.board)||lost(state.board));
  const noUndo=!state.undos||!state.previous;
  $<HTMLButtonElement>('undo').disabled=noUndo;
  $('undo').setAttribute('aria-label',!state.undos?'退一手，本炉撤销已用完':!state.previous?'退一手，请先滑动一次':'退一手，剩余一次');
  $('simple-text').textContent=`简动：${simple?'开':'关'}`;$('simple').setAttribute('aria-pressed',String(simple));
  $('board-description').textContent=state.board.map((v,i)=>`第${Math.floor(i/4)+1}行第${i%4+1}列：${v||'空位'}`).join('；');
  board.setAttribute('aria-label',`四行四列窑台，本局${state.score}分。${won(state.board)?'已合成2048':lost(state.board)?'本局结束':'横向或竖向滑动，或用键盘方向键'}`);
  scene?.panels(noUndo);
}
function available(){return ready&&!modalKind&&!document.hidden&&performance.now()>=busyUntil;}
function act(dir:Dir){
  if(!available())return;
  const next=move(state,dir);
  if(!next){if(!won(state.board)&&!lost(state.board))say('这个方向没有移动，试试另一边',1.6);return;}
  const old=state;state=next;accepted++;best=Math.max(best,state.score);notice='';clearTimeout(noticeTimer);
  busyUntil=performance.now()+(simple?0:180);save();updateUI();scene?.animateMove(old,next,dir,simple);
}

/** DOM pointer release, native keyboard click and assistive click share exactly one activation. */
function bind(element:HTMLButtonElement,id:string,action:()=>void){
  registered.set(id,element);element.dataset.target=id;
  let start:{x:number;y:number;id:number;epoch:number}|null=null;
  const clear=()=>{start=null;element.classList.remove('pressed');};
  element.addEventListener('pointerdown',e=>{
    if(element.disabled||!ready||e.button!==0)return;
    start={x:e.clientX,y:e.clientY,id:e.pointerId,epoch};element.setPointerCapture(e.pointerId);element.classList.add('pressed');
  });
  element.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)clear();});
  element.addEventListener('pointercancel',clear);element.addEventListener('lostpointercapture',clear);
  element.addEventListener('pointerup',e=>{
    const a=start;clear();if(!a||a.id!==e.pointerId||a.epoch!==epoch||Math.hypot(e.clientX-a.x,e.clientY-a.y)>10||element.disabled)return;
    inputs++;action();
  });
  element.addEventListener('click',e=>{e.preventDefault();if(e.detail===0&&ready&&!element.disabled){inputs++;action();}});
}
window.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);if(pointers.size>1&&gesture)gesture.cancelled=true;},true);
window.addEventListener('pointerup',e=>pointers.delete(e.pointerId),true);
window.addEventListener('pointercancel',e=>pointers.delete(e.pointerId),true);
board.addEventListener('pointerdown',e=>{
  if(e.button!==0||!available())return;
  if(gesture){gesture.cancelled=true;return;}
  gesture={x:e.clientX,y:e.clientY,id:e.pointerId,epoch,cancelled:pointers.size>1};
  board.setPointerCapture(e.pointerId);
});
board.addEventListener('pointerup',e=>{
  const a=gesture;gesture=null;inputs++;
  if(!a||a.cancelled||a.id!==e.pointerId||a.epoch!==epoch)return;
  const dx=e.clientX-a.x,dy=e.clientY-a.y,max=Math.max(Math.abs(dx),Math.abs(dy)),min=Math.min(Math.abs(dx),Math.abs(dy));
  if(max<Math.max(12,32*layout.boardScale)||min>max*.65)return;
  act(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');
});
board.addEventListener('pointercancel',()=>{gesture=null;});
board.addEventListener('lostpointercapture',()=>{gesture=null;});

bind($<HTMLButtonElement>('undo'),'undo',()=>{
  if(!available())return;const next=undo(state);if(next===state)return;
  state=next;scene?.cancelAnimation();save();scene?.renderState(state);say('已退一手 · 最高分保留');
});
bind($<HTMLButtonElement>('new'),'new',()=>{if(available())openModal('confirm');});
bind($<HTMLButtonElement>('help'),'help',()=>{if(available())openModal('help');});
bind($<HTMLButtonElement>('simple'),'simple',()=>{
  if(!available())return;simple=!simple;scene?.cancelAnimation();save();scene?.renderState(state);updateUI();
});
$('retry').addEventListener('click',()=>location.reload());
function modalButton(id:string,label:string,primary:boolean,action:()=>void){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.className=primary?'primary':'';
  $('modal-actions').append(b);bind(b,id,action);
}
function openModal(kind:string){
  if(modalKind)return;gesture=null;returnFocus=document.activeElement as HTMLElement;modalKind=kind;play.inert=true;modal.hidden=false;
  $('modal-actions').replaceChildren();
  if(kind==='help'){
    $('modal-title').textContent='这炉瓷，慢慢烧';
    $('modal-body').innerHTML='<p>横向或竖向滑动整座窑台。相同数字相遇，合成更大的瓷片；合并后的数字计入分数。</p><p>每枚瓷片一手最多合并一次。有效移动后出现一枚新瓷片：2 约占 85%，4 约占 15%。</p><p>合成 2048 即完成；没有可移动的方向时结束。每局可撤销一次，进度自动保存。</p><p class="quiet">没有倒计时，按自己的节奏来。键盘也可使用方向键。</p>';
    modalButton('close','回到窑台',true,closeModal);
  }else{
    $('modal-title').textContent='再开一炉？';$('modal-body').innerHTML='<p>当前棋盘将被替换。</p><p class="quiet">最高分会为你留下。</p>';
    modalButton('cancel','继续这一炉',false,closeModal);
    modalButton('confirm','确认开炉',true,()=>{
      state=initial(Date.now()>>>0);busyUntil=0;notice='';clearTimeout(noticeTimer);scene?.cancelAnimation();save();scene?.renderState(state);closeModal();updateUI();
    });
  }
  $('modal-actions').querySelector('button')?.focus({preventScroll:true});
}
function closeModal(){
  modalKind='';modal.hidden=true;play.inert=false;for(const id of ['close','cancel','confirm'])registered.delete(id);
  returnFocus?.focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{
  if(modalKind){
    if(e.key==='Escape'){e.preventDefault();closeModal();}
    if(e.key==='Tab'){
      const buttons=Array.from($('modal-actions').querySelectorAll('button'));
      if(buttons.length){e.preventDefault();const at=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(at+(e.shiftKey?buttons.length-1:1)+buttons.length)%buttons.length].focus();}
    }
    return;
  }
  const dir=({ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'} as Record<string,Dir>)[e.key];
  if(dir){e.preventDefault();inputs++;act(dir);}
});
function suspend(){gesture=null;pointers.clear();scene?.cancelAnimation();busyUntil=0;save();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else{scene?.renderState(state);updateUI();}});
window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',()=>{if(ready){resize();updateUI();}});
updateUI();
const game=new Phaser.Game({type:Phaser.AUTO,parent:'scene',width:innerWidth,height:innerHeight,transparent:true,
  scale:{mode:Phaser.Scale.NONE},audio:{noAudio:true},banner:false,
  render:{antialias:true,roundPixels:false},input:{mouse:false,touch:false,keyboard:false},
  scene:new PotteryScene(s=>{scene=s;scene.setLayout(layout);ready=true;loading.hidden=true;scene.renderState(state);updateUI();
    if(notice&&!saveError)noticeTimer=setTimeout(()=>{notice='';updateUI();},3000);
  },message=>{assetError=true;ready=false;loading.querySelector('p')!.textContent=message;$('retry').hidden=false;}),
});
const css=(e:Element)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
Object.defineProperty(window,'__owngameMerge',{configurable:false,writable:false,value:Object.freeze({
  snapshot:()=>JSON.parse(JSON.stringify({id:'kiln-merge',engine:'phaser',phaserVersion:Phaser.VERSION,source_sha256:__SOURCE_SHA__,
    artDirection:'B-painted-pottery',ready:ready&&!assetError,state,best,simple,modal:modalKind,notice,saveError,
    busy:performance.now()<busyUntil,inputCount:inputs,accepted,won:won(state.board),lost:lost(state.board),
    saveKey:SAVE_KEY,saveSchema:1,design:{width:layout.width,height:layout.height},
    layout:{safe:layout.safe,title:layout.title,board:layout.board,cells:layout.cells,controlHeight:layout.controlH,background:{x:0,y:0,w:innerWidth,h:innerHeight}},
    renderer:game.renderer?.type===Phaser.WEBGL?'webgl':'canvas',
    targets:[{id:'board',...css(board),css:css(board),enabled:!modalKind&&!won(state.board)&&!lost(state.board)},
      ...Array.from(registered,([id,element])=>{const box=css(element),isModal=['close','cancel','confirm'].includes(id);return{id,...box,css:box,enabled:!element.disabled&&(!modalKind?!isModal:isModal)};})],
  })),
})});

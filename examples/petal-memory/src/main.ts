import Phaser from 'phaser';
import {initial,flip,settle,planBot,finished,winner,State,Difficulty,Mode,LOOK_SECONDS} from './rules';
import {readSave,writeSave,SAVE_KEY} from './storage';
import {fitLayout} from './layout';
import {CardScene} from './card-scene';
declare const __SOURCE_SHA__:string;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const names=['虞美人','向日葵','雏菊','薰衣草','鸢尾','郁金香','银杏','枫叶','蕨叶','橡果','松果','草莓','柠檬','蓝蝶','瓢虫','蜗牛'];
const restored=readSave(()=>localStorage);
let {state,simple,best}=restored.save,notice=restored.notice,saveError=restored.error;
let ready=false,scene:CardScene|null=null,assetError=false;
let busy=state.open.length===2?LOOK_SECONDS:.55;
let modal='',pendingDifficulty:Difficulty=state.difficulty,pendingMode:Mode=state.mode;
let layout=fitLayout(360,640,state.deck.length),layoutEpoch=0,inputCount=0,accepted=0;
let returnFocus:HTMLElement|null=null,lastFrame=performance.now();
const frame=$('frame'),play=$('play'),dialog=$('modal');
const registered=new Map<string,{element:HTMLButtonElement;action:()=>void;modal:boolean}>();
function save(){saveError=!writeSave(()=>localStorage,{schema:1,state,simple,best});}
function resize(){
 const r=frame.getBoundingClientRect();if(!r.width||!r.height)return;
 layout=fitLayout(r.width,r.height,state.deck.length,{width:innerWidth,height:innerHeight,frameX:r.x,frameY:r.y});layoutEpoch++;
 const styles:{[key:string]:number}={'title-paper':layout.titleTop,'score-paper':layout.scoreTop,status:layout.statusTop,'main-controls':layout.controlsTop,simple:layout.settingsTop};
 Object.entries(styles).forEach(([id,top])=>{$(id).style.top=top+'px';});
 scene?.setLayout(layout);render();
}
function bind(element:HTMLButtonElement,id:string,action:()=>void,isModal=false){
 element.dataset.target=id;registered.set(id,{element,action,modal:isModal});
 let start:{x:number;y:number;id:number;epoch:number}|null=null;
 const clear=()=>{start=null;element.classList.remove('pressed');};
 element.addEventListener('pointerdown',e=>{
  if(element.disabled||!ready||e.button!==0)return;
  if(start){clear();return;}
  start={x:e.clientX,y:e.clientY,id:e.pointerId,epoch:layoutEpoch};
  element.setPointerCapture(e.pointerId);element.classList.add('pressed');
 });
 element.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>=9)clear();});
 element.addEventListener('pointercancel',clear);element.addEventListener('lostpointercapture',clear);
 element.addEventListener('pointerup',e=>{
  const a=start;clear();const r=element.getBoundingClientRect();
  if(!a||a.id!==e.pointerId||a.epoch!==layoutEpoch||element.disabled||Math.hypot(e.clientX-a.x,e.clientY-a.y)>=9||e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;
  inputCount++;action();
 });
 element.addEventListener('click',e=>{e.preventDefault();if(e.detail===0&&ready&&!element.disabled){inputCount++;action();}});
}
function rebuildCards(animated=-1){
 for(const key of [...registered.keys()])if(key.startsWith('card-'))registered.delete(key);
 $('board-input').replaceChildren();
 state.deck.forEach((motif,i)=>{
  const p=layout.cells[i],owned=state.owners[i]>=0,face=state.open.includes(i);
  const button=document.createElement('button');button.type='button';button.className='card'+(owned?' archived':'');
  Object.assign(button.style,{left:p.x-p.size/2+'px',top:p.y-p.size/2+'px',width:p.size+'px',height:p.size+'px'});
  button.disabled=owned||face||finished(state)||state.mode==='bot'&&state.turn===1;
  button.setAttribute('aria-label',`第${i+1}张，${owned?'已收集的'+names[motif]:face?names[motif]:'未翻开的标本'}`);
  if(owned||face){const label=document.createElement('span');label.className='card-label';label.textContent=owned?'已收集':names[motif];button.append(label);}
  $('board-input').append(button);bind(button,'card-'+i,()=>reveal(i,true));
 });
 scene?.render(state,simple,animated);
}
function render(animated=-1){
 const left=state.mode==='bot'?'你':'花笺',right=state.mode==='bot'?'标本师':'叶笺';
 $('left-score').textContent=left+' '+state.scores[0];$('right-score').textContent=right+' '+state.scores[1];
 $('left-score').classList.toggle('active',state.turn===0);$('right-score').classList.toggle('active',state.turn===1);
 $('metadata').textContent=`${['初识','熟记','博览'][state.difficulty]} · ${state.deck.length} 张 · ${state.rounds} 回合`;
 const status=finished(state)?`${winner(state)===-1?'平局':winner(state)===0?left+'获胜':right+'获胜'} · 标本已全部收集`:
  state.open.length===2?(state.deck[state.open[0]]===state.deck[state.open[1]]?'找到了同一份标本，再翻一对':'记住它们的位置，下一位继续'):
  state.mode==='bot'&&state.turn===1?'标本师正在回想…':`轮到${state.turn===0?left:right} · ${state.open.length?'再翻一张':'翻开两张相同标本'}`;
 $('status').textContent=saveError?'无法保存，请保持本页打开':notice||status;$('status').classList.toggle('error',saveError);
 $('simple-text').textContent=simple?'简动：开':'简动：关';$('simple').setAttribute('aria-pressed',String(simple));
 rebuildCards(animated);
}
function reveal(i:number,human:boolean){
 if(!ready||busy>0||modal||finished(state)||human&&state.mode==='bot'&&state.turn===1)return;
 const next=flip(state,i);if(!next)return;state=next;if(human)accepted++;notice='';
 busy=state.open.length===2?LOOK_SECONDS:human?(simple?.04:.18):.65;
 save();render(i);
}
function tick(now:number){
 const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
 if(ready&&!modal&&!document.hidden){
  busy=Math.max(0,busy-dt);
  if(busy===0&&!finished(state)){
   if(state.open.length===2){state=settle(state)!;best[state.difficulty]=Math.max(best[state.difficulty],state.scores[0]);busy=.35;save();render();}
   else if(state.mode==='bot'&&state.turn===1){
    if(state.plan.length===0){state=planBot(state)!;busy=.65;save();}
    else reveal(state.plan[state.open.length],false);
   }
  }
 }
 requestAnimationFrame(tick);
}
function clearModalButtons(){for(const [id,entry]of registered)if(entry.modal)registered.delete(id);$('modal-options').replaceChildren();$('modal-actions').replaceChildren();}
function modalButton(id:string,label:string,fn:()=>void,options:{selected?:boolean;primary?:boolean;parent?:string}={}){
 const button=document.createElement('button');button.type='button';button.className='paper'+(options.selected?' selected':'')+(options.primary?' primary':'');button.textContent=label;
 if(options.selected!==undefined)button.setAttribute('aria-pressed',String(options.selected));
 $(options.parent||'modal-actions').append(button);bind(button,id,fn,true);return button;
}
function openModal(kind:string){
 if(modal)return;
 returnFocus=document.activeElement as HTMLElement;modal=kind;play.inert=true;dialog.hidden=false;
 pendingDifficulty=state.difficulty;pendingMode=state.mode;drawModal();
}
function drawModal(focusId=''){
 dialog.dataset.kind=modal;clearModalButtons();
 if(modal==='help'){
  $('modal-title').textContent='标本桌手记';
  $('modal-body').innerHTML='<h3>翻开一对自然</h3><p>每次翻两张，寻找相同的植物标本。<br>配对得 1 分，并继续行动。<br>不同的两张会翻回，轮到另一位。</p><h3>慢慢记，慢慢收集</h3><p>全部配对后，收集多的一位获胜。<br>初识 14 张 · 熟记 22 张 · 博览 30 张。</p><h3>随时停下，也能继续</h3><p>进度自动保存；标本师只记住<br>已翻开的牌。观察时间不计分。</p><p class="quiet">简动保留记忆时间，没有倒计时。</p>';
  modalButton('close','回到标本桌',closeModal,{primary:true});
 }else{
  $('modal-title').textContent=modal==='new'?'重新布置标本？':'选择玩法';
  $('modal-body').innerHTML='<p>确认后开启新局，当前对局会被替换。</p>';
  if(modal==='mode'){
   const group=(label:string)=>{const p=document.createElement('p');p.className='group-label';p.textContent=label;$('modal-options').append(p);};
   group('标本数量');
   ['初识 · 14 张','熟记 · 22 张','博览 · 30 张'].forEach((label,d)=>modalButton('difficulty-'+d,label,()=>{pendingDifficulty=d as Difficulty;drawModal('difficulty-'+d);},{selected:pendingDifficulty===d,parent:'modal-options'}));
   group('一起翻开');
   modalButton('bot','与标本师对战',()=>{pendingMode='bot';drawModal('bot');},{selected:pendingMode==='bot',parent:'modal-options'});
   modalButton('duo','同屏两人',()=>{pendingMode='duo';drawModal('duo');},{selected:pendingMode==='duo',parent:'modal-options'});
  }else $('modal-body').innerHTML+='<p class="quiet">拾一片叶，记一段时光。</p>';
  modalButton('cancel','继续当前对局',closeModal);
  modalButton('confirm','确认新开一局',()=>{
   state=initial(Date.now()>>>0,pendingDifficulty,pendingMode);notice='';busy=.2;
   resize();closeModal();save();
  },{primary:true});
 }
 const focus=focusId?registered.get(focusId)?.element:$('modal-actions').querySelector('button');focus?.focus({preventScroll:true});
}
function closeModal(){modal='';dialog.hidden=true;play.inert=false;clearModalButtons();returnFocus?.focus({preventScroll:true});render();}
for(const id of ['new','mode','help'])bind($<HTMLButtonElement>(id),id,()=>openModal(id));
bind($<HTMLButtonElement>('simple'),'simple',()=>{if(modal)return;simple=!simple;save();render();});
$('retry').addEventListener('click',()=>location.reload());
document.addEventListener('keydown',e=>{
 if(!modal)return;
 if(e.key==='Escape'){e.preventDefault();closeModal();}
 if(e.key==='Tab'){
  const buttons=Array.from(dialog.querySelectorAll('button'));
  if(buttons.length){e.preventDefault();const at=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(at+(e.shiftKey?buttons.length-1:1))%buttons.length].focus();}
 }
});
window.addEventListener('resize',resize);visualViewport?.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(ready)save();});
window.addEventListener('pagehide',()=>{if(ready)save();});
resize();
const fontReady=document.fonts.load('16px PetalSerif','花笺拾忆蕨叶').then(()=>document.fonts.ready);
const game=new Phaser.Game({type:Phaser.AUTO,parent:'scene',width:layout.width,height:layout.height,
 transparent:true,banner:false,audio:{noAudio:true},scale:{mode:Phaser.Scale.NONE},
 render:{antialias:true,roundPixels:false},input:{mouse:false,touch:false,keyboard:false},
 scene:new CardScene(s=>{scene=s;scene.setLayout(layout);fontReady.then(()=>{if(assetError)return;ready=true;$('loading').hidden=true;render();});},()=>{
  assetError=true;ready=false;$('loading-text').textContent='标本室载入失败，请重新打开';$('retry').hidden=false;
 }),
});
requestAnimationFrame(tick);
Object.defineProperty(window,'__owngameMemory',{configurable:false,writable:false,value:Object.freeze({
 snapshot:()=>JSON.parse(JSON.stringify({id:'petal-memory',ready:ready&&!assetError,engine:'web',framework:'Phaser '+Phaser.VERSION,
  source_sha256:__SOURCE_SHA__,artDirection:'A-paper-herbarium',state,simple,best,modal,notice,saveError,
  visible:state.deck.map((v,i)=>state.open.includes(i)||state.owners[i]>=0?v:-1),busy:busy>0,
  remainingObservationSeconds:state.open.length===2?busy:0,inputCount,accepted,finished:finished(state),winner:winner(state),saveKey:SAVE_KEY,
  renderer:game.renderer?.type===Phaser.WEBGL?'webgl':'canvas',
  layout:{...layout,frame:(()=>{const r=frame.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};})()},
  targets:Array.from(registered,([id,{element,modal:isModal}])=>{
   const r=element.getBoundingClientRect();return{id,css:{x:r.x,y:r.y,w:r.width,h:r.height},enabled:!element.disabled&&(modal?isModal:!isModal),label:element.getAttribute('aria-label')||element.textContent};
  }).filter(t=>t.enabled),
 })),
})});

import Phaser from 'phaser';
import {LEVELS,CHAPTERS,LESSONS,State,Signal,start,transfer,undo,won,rejection,boardKey,solve,SAVE_KEY,CONTENT_ID} from './rules';
import {restore,persist} from './storage';
import {fitLayout,Layout,Rect} from './layout';
import {HarborScene,Flight} from './harbor-scene';

declare const __SOURCE_SHA__:string;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const frame=$('frame'),viewport=$('viewport');
const stored=restore(()=>localStorage,window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let progress=stored.progress,state=progress.current,reduced=progress.reduced,saveWarning=stored.warning,message=stored.notice;
let ready=false,assetError=false,mapOpen=false,chapter=LEVELS[state.level].chapter,selected=-1,busy=false,hintBusy=false;
let hintRequest=0,inputs=0,layoutEpoch=0,activePointer:number|null=null;
let pending:Flight|null=null,scene:HarborScene|null=null;
let layout=fitLayout(720,1280,LEVELS[state.level].capacity,LEVELS[state.level].buoys);
const registered=new Map<string,{element:HTMLButtonElement;action:()=>void}>();
const columnButtons:HTMLButtonElement[]=[],columnLabels:HTMLElement[]=[],chapterButtons:HTMLButtonElement[]=[],levelButtons:HTMLButtonElement[]=[];
const NAMES=['珊瑚','青潮','暮紫'];
const place=(element:HTMLElement,r:Rect)=>Object.assign(element.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
function cancelHint(){hintRequest++;hintBusy=false;}
function save(){const saved=persist(()=>localStorage,progress,state,reduced);progress=saved.progress;saveWarning=saved.warning;}
function finishFlight(){scene?.stopFlight();pending=null;busy=false;}
function resize(){
  const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;
  finishFlight();layoutEpoch++;activePointer=null;
  let clearance=Math.max(60,76-r.y);
  // Same-origin Web shell can place its capsule outside this frame's CSS env.
  // Read only its geometry, leaving the shared shell and its controls untouched.
  try{
    if(window.parent!==window&&window.frameElement){
      const host=window.frameElement.getBoundingClientRect(),cap=window.parent.document.querySelector('.capsule')?.getBoundingClientRect();
      if(cap&&cap.left<host.right&&cap.right>host.left){const ratio=host.width/window.innerWidth;clearance=Math.max(clearance,(cap.bottom-host.top)/ratio-r.y+8);}
    }
  }catch{/* Cross-origin embeds keep the standalone safe-area layout. */}
  const level=LEVELS[state.level];layout=fitLayout(r.width,r.height,level.capacity,level.buoys,clearance);
  frame.style.left=layout.left+'px';frame.style.top=layout.top+'px';frame.style.height=layout.height+'px';frame.style.transform=`scale(${layout.scale})`;
  for(const [id,rect]of Object.entries({title:layout.title,subtitle:layout.subTitle,nav:layout.nav,mode:layout.mode,stats:layout.stats,rule:layout.rule,status:layout.status,next:layout.status,resume:layout.resume,lesson:layout.mapDescription}))place($(id),rect);
  for(const [i,id]of ['undo','restart','hint'].entries())place($(id),layout.controls[i]);
  chapterButtons.forEach((button,i)=>place(button,layout.tabs[i]));levelButtons.forEach((button,i)=>place(button,layout.cards[i]));
  columnButtons.forEach((button,i)=>{
    const group=i<3?layout.tower:layout.berth,j=i<3?i:i-3,r=group.hits[j];
    button.hidden=!r;columnLabels[i].hidden=!r;
    if(r){place(button,r);place(columnLabels[i],{x:group.x[j]-130,y:group.labelY,w:260,h:36});}
    button.classList.remove('pressed');
  });
  scene?.setLayout(layout);if(ready)render();
}
function feedback(){try{(window as unknown as {OwngameFeedback?:{tap:()=>void}}).OwngameFeedback?.tap();}catch{}}
function bind(element:HTMLButtonElement,id:string,action:()=>void){
  element.dataset.target=id;registered.set(id,{element,action});
  let startPoint:{x:number;y:number;id:number;epoch:number}|null=null;
  const clear=()=>{if(activePointer===startPoint?.id)activePointer=null;startPoint=null;element.classList.remove('pressed');};
  element.addEventListener('pointerdown',e=>{
    if(!ready||busy||element.disabled||e.button!==0||activePointer!==null)return;
    activePointer=e.pointerId;startPoint={x:e.clientX,y:e.clientY,id:e.pointerId,epoch:layoutEpoch};
    element.setPointerCapture(e.pointerId);element.classList.add('pressed');
  });
  element.addEventListener('pointermove',e=>{if(startPoint&&Math.hypot(e.clientX-startPoint.x,e.clientY-startPoint.y)>18*layout.scale)clear();});
  element.addEventListener('pointercancel',clear);element.addEventListener('lostpointercapture',clear);
  element.addEventListener('pointerup',e=>{
    const a=startPoint;clear();const r=element.getBoundingClientRect();
    if(!a||a.id!==e.pointerId||a.epoch!==layoutEpoch||busy||element.disabled||Math.hypot(e.clientX-a.x,e.clientY-a.y)>18*layout.scale||e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;
    inputs++;action();
  });
  element.addEventListener('click',e=>{e.preventDefault();if(e.detail===0&&ready&&!busy&&!element.disabled){inputs++;action();}});
}
for(let i=0;i<5;i++){
  const button=document.createElement('button');button.type='button';button.className='column-input';button.id='column-'+i;
  const label=document.createElement('span');label.className='column-label';label.setAttribute('aria-hidden','true');
  $('columns').append(button,label);columnButtons.push(button);columnLabels.push(label);bind(button,'column-'+i,()=>tap(i));
}
for(let c=0;c<3;c++){
  const b=document.createElement('button');b.type='button';b.className='chapter plaque';b.textContent=CHAPTERS[c];
  $('chapters').append(b);chapterButtons.push(b);bind(b,'chapter-'+c,()=>{chapter=c;render();});
}
for(let i=0;i<8;i++){
  const b=document.createElement('button');b.type='button';b.className='level panel';$('levels').append(b);levelButtons.push(b);
  bind(b,'level-'+i,()=>enter(chapter*8+i));
}
bind($<HTMLButtonElement>('nav'),'nav',()=>{cancelHint();selected=-1;mapOpen=!mapOpen;render();});
bind($<HTMLButtonElement>('mode'),'mode',()=>{reduced=!reduced;save();render();});
bind($<HTMLButtonElement>('resume'),'resume',()=>{mapOpen=false;render();});
bind($<HTMLButtonElement>('undo'),'undo',()=>{cancelHint();state=undo(state);selected=-1;message='退回一步，慢慢来';save();feedback();render();});
bind($<HTMLButtonElement>('restart'),'restart',()=>enter(state.level));
bind($<HTMLButtonElement>('hint'),'hint',()=>{void hint();});
bind($<HTMLButtonElement>('next'),'next',()=>{
  if(state.level===LEVELS.length-1){mapOpen=true;render();}else enter(state.level+1);
});
$('retry').addEventListener('click',()=>location.reload());

function enter(level:number){
  cancelHint();finishFlight();state=start(level);selected=-1;chapter=LEVELS[level].chapter;mapOpen=false;
  message=level===0?'先点青潮塔顶灯，再点临时泊位':LESSONS[chapter];save();resize();render();
}
function tap(i:number){
  if(!ready||busy||mapOpen||won(state.board,state.level)||i>=state.board.length)return;
  if(i===selected){selected=-1;message='已取消选择，换一盏试试';render();return;}
  if(selected<0){
    if(!state.board[i].length)message='这里还是空的，先选一盏信号灯';
    else{selected=i;message='已选中顶灯 · 点亮边空位';feedback();}
    render();return;
  }
  const from=selected,result=transfer(state,from,i);
  if(result.error){message=result.error;render();return;}
  const flight:Flight={from,fromSlot:state.board[from].length-1,to:i,toSlot:state.board[i].length,color:state.board[from].at(-1)!};
  cancelHint();state=result.state;selected=-1;save();feedback();
  message=won(state.board,state.level)?'灯光已归位 · 这片海记住了你的航迹':'归位一盏 · 继续点选最上面的灯';
  if(reduced){render();return;}
  busy=true;pending=flight;render();scene!.animate(layout,flight,()=>{busy=false;pending=null;render();});
}
async function hint(){
  if(hintBusy||busy||won(state.board,state.level))return;
  const request=++hintRequest,key=boardKey(state.board),level=state.level;
  hintBusy=true;message='正在寻找一条归航路线…';render();
  let check=start(level),path:number[][]|null=null;
  const authored=LEVELS[level].solution;
  for(let i=0;i<authored.length;i++){
    if(boardKey(check.board)===key){path=authored.slice(i);break;}
    check=transfer(check,authored[i][0],authored[i][1]).state;
  }
  try{
    const result=path?{path,status:'solved'}:await solve(state.board,level);
    if(request!==hintRequest||state.level!==level||boardKey(state.board)!==key||mapOpen)return;
    hintBusy=false;
    const name=(i:number)=>i<3?NAMES[i]+'塔':LEVELS[level].buoys===1?'临时泊位':i===3?'左泊位':'右泊位';
    if(result.path?.length){const[a,b]=result.path[0];selected=a;message='试试：'+name(a)+' → '+name(b);}
    else message=result.status==='dead-end'?'此处已无归航路线，撤销几步或重来':'暂未找到路线，可以撤销后再试';
  }catch{if(request!==hintRequest)return;hintBusy=false;message='暂未找到路线，可以撤销后再试';}
  render();
}
function render(){
  const level=LEVELS[state.level],best=progress.best[state.level],complete=won(state.board,state.level);
  $('play').hidden=mapOpen;$('map').hidden=!mapOpen;
  $('nav').textContent=mapOpen?'返回':'航图';$('mode').textContent=reduced?'简动 ✓':'动效 ✓';$('mode').setAttribute('aria-pressed',String(reduced));
  $('stats').replaceChildren();
  const line=document.createElement('span'),sub=document.createElement('small');
  line.textContent=mapOpen?`航图 · 已点亮 ${Object.keys(progress.best).length} / 24`:`${String(state.level+1).padStart(2,'0')} / 24 · ${level.name}`;
  sub.textContent=mapOpen?CHAPTERS[chapter]:`${state.moves} 步 · 目标 ${level.par} 步 · 最佳 ${best??'—'}`;
  $('stats').append(line,sub);
  $('rule').textContent=mapOpen?'三章航程 · 随时选关，无需按顺序':complete?`已归位 · 最佳 ${best} 步${best<=level.par?' · 星光航迹 ✧':''}`:'三塔各归其图案 · 泊位清空即过关';
  $('status').textContent=saveWarning?'本次无法保存航迹，仍可继续游玩':message;
  $('status').hidden=complete;$('next').hidden=!complete;
  $('next').textContent=state.level===23?'满港长明 · 查看航图':(state.level+1)%8===0?'这一程已归位 · 启程下一章':'下一盏灯 →';
  $<HTMLButtonElement>('undo').disabled=!state.history.length||busy;
  $<HTMLButtonElement>('restart').disabled=busy;
  $<HTMLButtonElement>('hint').disabled=busy||hintBusy||complete;$('hint').textContent=hintBusy?'寻路中':'提示';
  for(const id of ['nav','mode','resume','next'])$<HTMLButtonElement>(id).disabled=busy;
  columnButtons.forEach((button,i)=>{
    const stack=state.board[i],isTower=i<3;
    if(!stack){button.hidden=true;columnLabels[i].hidden=true;return;}
    const name=isTower?NAMES[i]+'塔':level.buoys===1?'临时泊位':i===3?'左泊位':'右泊位';
    const done=isTower&&stack.length===level.capacity&&stack.every(s=>s==='ABC'[i]);
    const valid=selected>=0&&rejection(state.board,selected,i,state.level)===null;
    const label=isTower?valid?'可放':selected===i?'已选顶灯':done?'已归位':NAMES[i]:name+' · 两盏';
    button.setAttribute('aria-label',`${name}，${stack.length} / ${isTower?level.capacity:2} 盏${stack.length?'，顶灯'+NAMES['ABC'.indexOf(stack.at(-1)!)]:''}${valid?'，可放':''}`);
    button.setAttribute('aria-pressed',String(selected===i));button.disabled=complete||busy;
    columnLabels[i].textContent=label;columnLabels[i].classList.toggle('active',selected===i||done||valid);
  });
  chapterButtons.forEach((b,c)=>{b.setAttribute('aria-pressed',String(c===chapter));b.disabled=busy;});
  $('lesson').textContent=LESSONS[chapter];
  levelButtons.forEach((button,i)=>{
    const index=chapter*8+i,l=LEVELS[index],score=progress.best[index];button.replaceChildren();
    const name=document.createElement('span'),record=document.createElement('small');name.textContent=`${String(index+1).padStart(2,'0')} ${l.name}`;
    record.textContent=score===undefined?`未点亮 · 目标 ${l.par} 步`:`${score<=l.par?'✧ 星光':'已归位'} · 最佳 ${score} 步`;
    button.append(name,record);button.classList.toggle('completed',score!==undefined);button.disabled=busy;button.setAttribute('aria-label',`第 ${index+1} 关 ${l.name}，${record.textContent}`);
  });
  scene?.renderState(layout,state,selected,pending);$('scene').hidden=mapOpen;
}
resize();render();
window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelHint();finishFlight();save();}else{resize();render();}});
window.addEventListener('pagehide',()=>{cancelHint();finishFlight();save();});
window.addEventListener('pageshow',()=>{if(ready){resize();render();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mapOpen){mapOpen=false;render();}});

const game=new Phaser.Game({
  type:Phaser.AUTO,parent:'scene',width:720,height:layout.height,transparent:true,
  scale:{mode:Phaser.Scale.NONE},audio:{noAudio:true},banner:false,
  render:{antialias:true,roundPixels:false},input:{mouse:false,touch:false,keyboard:false},
  scene:new HarborScene(s=>{scene=s;ready=true;resize();$('loading').hidden=true;render();},error=>{
    ready=false;assetError=true;$('loading').hidden=false;$('loading').querySelector('p')!.textContent=error;$('retry').hidden=false;
  }),
});
function snapshot(){
  const visible=(e:HTMLElement)=>!e.hidden&&getComputedStyle(e).display!=='none'&&e.getClientRects().length>0;
  return JSON.parse(JSON.stringify({
    id:'signal-harbor',version:'glasslight-web-24',engine:'phaser',phaserVersion:Phaser.VERSION,source_sha256:__SOURCE_SHA__,
    ready:ready&&!assetError,assetsReady:ready&&!assetError,loadError:assetError,level:state.level+1,state,board:state.board,moves:state.moves,best:progress.best,
    selected,mapOpen,chapter,busy,hintBusy,message,saveWarning,reducedMotion:reduced,inputCount:inputs,won:won(state.board,state.level),
    saveKey:SAVE_KEY,contentId:CONTENT_ID,renderer:game.renderer?.type===Phaser.WEBGL?'webgl':'canvas',
    layout,viewport:(()=>{const r=viewport.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};})(),
    renderedLamps:scene?.snapshot()??[],
    targets:Array.from(registered,([id,{element}])=>{
      const r=element.getBoundingClientRect();return{id,enabled:ready&&!busy&&!element.disabled&&visible(element),css:{x:r.x,y:r.y,w:r.width,h:r.height},label:element.getAttribute('aria-label')||element.textContent};
    }).filter(t=>t.css.w>0&&t.css.h>0),
  }));
}
Object.defineProperty(window,'__signalHarbor',{configurable:false,writable:false,value:Object.freeze({snapshot})});

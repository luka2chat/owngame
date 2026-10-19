import {generate,available,blocker,dirs,fresh,parseSave,COUNT,type Cell,type Arrow,type Checkpoint} from './rules.js';
const $=(id:string)=>document.getElementById(id)!;
const canvas=$('board') as HTMLCanvasElement,ctx=canvas.getContext('2d',{alpha:true})!;
const storageKey='owngame:arrow-escape:v1';
const progress=(()=>{try{return parseSave(localStorage.getItem(storageKey));}catch{return parseSave(null);}})();
let board=generate(progress.level),state=progress.current||fresh(board),phase:'play'|'won'|'lost'='play';
let history:Checkpoint[]=[],width=400,height=450,cell=30,ox=20,oy=20,zoom=1,pan={x:0,y:0},selected=-1,hint=-1;
let flash:number[]=[];let flashUntil=0,stamp=0,dirty=true,overlay='',audio:AudioContext|undefined;
let flight:{arrow:Arrow;start:number}|null=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointers=new Map<number,Cell>();
let gesture:{x:number;y:number;pan:Cell;distance:number;zoom:number;moved:boolean;pinched:boolean}|null=null;
function say(message:string,bad=false){$('message').textContent=message;$('message').style.color=bad?'#c63120':'#14262c';}
function persist(){progress.current=phase==='play'?structuredClone(state):null;try{localStorage.setItem(storageKey,JSON.stringify(progress));}catch{say('本次可以正常玩，当前浏览器无法保存进度。');}}
function tone(note:number){if(!progress.sound)return;try{audio??=new AudioContext();void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.frequency.setValueAtTime(note,audio.currentTime);o.frequency.exponentialRampToValueAtTime(note*.7,audio.currentTime+.13);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.15);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.16);}catch{}}
function update(){
 $('level').textContent=String(board.level+1).padStart(2,'0');
 $('chapter').textContent=['基础','转弯','交错','挑战'][Math.floor(board.level/9)];
 $('hearts').textContent=Array.from({length:3},(_,i)=>i<state.hearts?'♥':'♡').join(' ');$('hearts').setAttribute('aria-label','剩余 '+state.hearts+' 次机会');
 $('remaining').innerHTML='剩余 <strong>'+state.ids.length+'</strong> 支';$('cleared').textContent='已移出 '+(board.arrows.length-state.ids.length);
 $('bar').style.width=(1-state.ids.length/board.arrows.length)*100+'%';
 ($('undo') as HTMLButtonElement).disabled=history.length===0||phase!=='play';
 $('sound').innerHTML='<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M3 10h5l7-6v20l-7-6H3Z"/>'+(progress.sound?'<path fill="none" d="M19 8q6 6 0 12M23 4q10 10 0 20"/>':'<path fill="none" d="m19 10 7 8m0-8-7 8"/>')+'</svg>';$('sound').setAttribute('aria-label',progress.sound?'关闭音效':'开启音效');
 dirty=true;
}
function center(){zoom=1;pan={x:0,y:0};layout();}
function layout(){cell=Math.min((width-36)/board.size,(height-72)/board.size)*zoom;ox=(width-cell*(board.size-1))/2+pan.x;oy=(height-48-cell*(board.size-1))/2+pan.y;dirty=true;}
function resize(){const ratio=Math.min(devicePixelRatio||1,2);width=canvas.clientWidth;height=canvas.clientHeight;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);layout();draw(stamp);dirty=false;}
function closeSheet(){$('sheet').hidden=true;overlay='';dirty=true;}
function sheet(kind:string,title:string,copy:string,primary:string,action:()=>void,secondary='',cancel=closeSheet){
 overlay=kind;$('sheet').hidden=false;$('sheet-kicker').textContent=kind==='won'?'本关完成':kind==='levels'?'关卡选择':'箭径出逃';
 $('sheet-title').textContent=title;$('sheet-copy').textContent=copy;$('stars').textContent='';$('level-grid').hidden=kind!=='levels';
 const p=$('primary') as HTMLButtonElement;p.textContent=primary;p.onclick=action;
 const s=$('secondary') as HTMLButtonElement;s.hidden=!secondary;s.textContent=secondary;s.onclick=cancel;p.focus();
}
function load(level:number){board=generate(level);state=fresh(board);progress.level=level;phase='play';history=[];hint=-1;selected=-1;flight=null;flash=[];closeSheet();center();update();persist();say('点击畅通的箭头，让它离开棋盘。');}
function won(){
 phase='won';const stars=state.hearts;progress.stars[board.level]=Math.max(progress.stars[board.level],stars);
 progress.unlocked=Math.max(progress.unlocked,Math.min(COUNT-1,board.level+1));progress.level=Math.min(COUNT-1,board.level+1);persist();tone(880);update();
}
function winSheet(){const last=board.level===COUNT-1;sheet('won',last?'36 关全部完成':'本关完成',`${board.arrows.length} 支箭头全部移出 · ${state.moves} 次选择${state.hints?' · 使用提示 '+state.hints+' 次':''}`,last?'再玩这一关':'下一关 →',()=>load(last?board.level:board.level+1),'选择关卡',levels);$('stars').textContent='★'.repeat(state.hearts)+'☆'.repeat(3-state.hearts);}
function extract(id:number){
 if(overlay||phase!=='play'||flight||!state.ids.includes(id))return;
 const hit=blocker(board,state.ids,id);history.push(structuredClone(state));if(history.length>150)history.shift();state.moves++;hint=-1;selected=id;
 if(hit!==null){
  state.hearts--;flash=[id,hit];flashUntil=stamp+650;say('前方有阻挡。先移开挡路的箭。',true);tone(150);
  if(state.hearts===0){phase='lost';sheet('lost','本关未完成','可以重新开始，或撤销刚才一步。','重新开始',()=>load(board.level),'撤回刚才一步',()=>{closeSheet();undo();});}
 }else{
  flight={arrow:board.arrows[id],start:stamp};state.ids=state.ids.filter(n=>n!==id);tone(460+Math.min(18,board.arrows.length-state.ids.length)*17);say(state.ids.length?'已移出一支箭。':'棋盘已清空。');if(!state.ids.length)won();
 }
 update();persist();
}
function undo(){if(!history.length||overlay)return;state=history.pop()!;phase='play';progress.level=board.level;flight=null;hint=-1;flash=[];selected=-1;update();persist();say('已撤销上一步。');}
function giveHint(){if(overlay||phase!=='play'||flight)return;hint=available(board,state.ids)[0]??-1;if(hint>=0){state.hints++;update();persist();say('黄色箭头可以移出。');}}
function levels(){
 sheet('levels','选择关卡','已完成的关卡可以随时重玩。','回到棋盘',closeSheet);
 const grid=$('level-grid');grid.replaceChildren();
 for(let i=0;i<COUNT;i++){const b=document.createElement('button');b.textContent=String(i+1).padStart(2,'0');b.disabled=i>progress.unlocked;b.className=progress.stars[i]?'passed':'';b.setAttribute('aria-label','第 '+(i+1)+' 关'+(b.disabled?' 尚未解锁':progress.stars[i]?' 已完成':''));b.onclick=()=>load(i);grid.append(b);}
}
$('levels').onclick=levels;$('undo').onclick=undo;$('hint').onclick=giveHint;
$('restart').onclick=()=>sheet('restart','重新开始本关？','重新开始本关，已解锁的关卡和星星会保留。','重新开始本关',()=>load(board.level),'继续解题');
$('sound').onclick=()=>{progress.sound=!progress.sound;persist();update();if(progress.sound)tone(580);};
function changeZoom(factor:number){zoom=Math.max(1,Math.min(3,zoom*factor));if(zoom===1)pan={x:0,y:0};layout();}
$('zoom-in').onclick=()=>changeZoom(1.25);$('zoom-out').onclick=()=>changeZoom(.8);$('center').onclick=center;
const point=(c:Cell)=>({x:ox+c.x*cell,y:oy+c.y*cell});
function nearest(x:number,y:number){let id=-1,best=Math.max(9,Math.min(17,cell*.47));for(const n of state.ids){const a=board.arrows[n];for(let j=0;j<a.cells.length-1;j++){const aa=point(a.cells[j]),b=point(a.cells[j+1]),dx=b.x-aa.x,dy=b.y-aa.y,t=Math.max(0,Math.min(1,((x-aa.x)*dx+(y-aa.y)*dy)/(dx*dx+dy*dy)));const distance=Math.hypot(x-aa.x-t*dx,y-aa.y-t*dy);if(distance<best){best=distance;id=n;}}}return id;}
const relative=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.x,y:e.clientY-r.y};};
canvas.addEventListener('pointerdown',e=>{if(overlay)return;const p=relative(e);pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);if(pointers.size===1)gesture={...p,pan:{...pan},distance:0,zoom,moved:false,pinched:false};else if(pointers.size===2&&gesture){const [a,b]=[...pointers.values()];gesture={...gesture,pan:{...pan},x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,pinched:true,moved:true};}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;const p=relative(e);pointers.set(e.pointerId,p);if(pointers.size>=2){const [a,b]=[...pointers.values()];zoom=Math.max(1,Math.min(3,gesture.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,gesture.distance)));pan={x:gesture.pan.x+(a.x+b.x)/2-gesture.x,y:gesture.pan.y+(a.y+b.y)/2-gesture.y};gesture.moved=true;}else if(!gesture.pinched){const dx=p.x-gesture.x,dy=p.y-gesture.y;if(Math.hypot(dx,dy)>8)gesture.moved=true;if(gesture.moved)pan={x:gesture.pan.x+dx,y:gesture.pan.y+dy};}layout();});
canvas.addEventListener('pointerup',e=>{const p=relative(e);if(gesture&&!gesture.moved&&!gesture.pinched){const id=nearest(p.x,p.y);if(id>=0)extract(id);}pointers.delete(e.pointerId);if(!pointers.size)gesture=null;});
const cancel=(e:PointerEvent)=>{pointers.delete(e.pointerId);if(gesture)gesture.moved=true;if(!pointers.size)gesture=null;};canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?1.1:1/1.1);},{passive:false});
addEventListener('keydown',e=>{
 if(overlay){if(e.key==='Escape'&&phase==='play')closeSheet();return;}
 if(e.target instanceof HTMLButtonElement&&['Enter',' '].includes(e.key))return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter','+','-'].includes(e.key))e.preventDefault();
 if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)){const index=state.ids.indexOf(selected),delta=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;selected=state.ids[(index+delta+state.ids.length)%state.ids.length]??-1;dirty=true;}
 if(e.key==='Enter'&&selected>=0)extract(selected);if(e.key.toLowerCase()==='h')giveHint();if(e.key.toLowerCase()==='u'||(e.key.toLowerCase()==='z'&&(e.metaKey||e.ctrlKey))){e.preventDefault();undo();}if(e.key===' ')center();if(e.key==='+')changeZoom(1.25);if(e.key==='-')changeZoom(.8);
});
addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
function stroke(points:Cell[],color:string,lineWidth:number){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=lineWidth;ctx.strokeStyle=color;ctx.stroke();}
function arrow(a:Arrow,color:string,travel=0){
 const points=a.cells.map(point),d=dirs[a.dir],last=points.at(-1)!;
 if(travel>0){let remaining=travel;while(points.length>1){const length=Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);if(remaining<length)break;remaining-=length;points.shift();}
  if(points.length>1){const p=points[0],q=points[1],length=Math.hypot(q.x-p.x,q.y-p.y);points[0]={x:p.x+(q.x-p.x)*remaining/length,y:p.y+(q.y-p.y)*remaining/length};}
  else points[0]={x:last.x+d.x*remaining,y:last.y+d.y*remaining};
  points.push({x:last.x+d.x*travel,y:last.y+d.y*travel});
 }
 const thickness=Math.max(2.4,Math.min(8,cell*.16)),head=points.at(-1)!,size=Math.max(4.5,Math.min(12,cell*.28)),edge=Math.max(.7,Math.min(1.6,cell*.045));
 const tip=[{x:head.x-d.x*size-d.y*size*.72,y:head.y-d.y*size+d.x*size*.72},head,{x:head.x-d.x*size+d.y*size*.72,y:head.y-d.y*size-d.x*size*.72}];
 const tail=points[0];
 function silhouette(paint:string,padding:number){
  stroke(points,paint,thickness+padding*2);
  ctx.beginPath();ctx.arc(tail.x,tail.y,thickness*.8+padding,0,Math.PI*2);ctx.fillStyle=paint;ctx.fill();
  ctx.beginPath();tip.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=paint;ctx.strokeStyle=paint;ctx.lineWidth=padding*2+.5;ctx.lineJoin='round';ctx.fill();ctx.stroke();
 }
 ctx.save();ctx.translate(0,Math.min(2,cell*.06));silhouette('#c6b68e',edge*2.2);ctx.restore();
 silhouette('#14262c',edge*2);silhouette('#fff8de',edge*1.05);silhouette(color,0);
 // The same continuous path stays readable around bends; highlights never replace geometry.
 stroke(points,color==='#0878d9'?'#159cf0':color,Math.max(1,thickness*.36));
}
const grain=document.createElement('canvas');grain.width=96;grain.height=96;
const grainContext=grain.getContext('2d')!;grainContext.fillStyle='#f8efd8';grainContext.fillRect(0,0,96,96);
let grainSeed=139;for(let i=0;i<600;i++){grainSeed=(Math.imul(grainSeed,1664525)+1013904223)>>>0;const x=grainSeed%96;grainSeed=(Math.imul(grainSeed,1664525)+1013904223)>>>0;grainContext.fillStyle=i%2?'#c0ad7e16':'#ffffff55';grainContext.fillRect(x,grainSeed%96,1,1);}
const paper=ctx.createPattern(grain,'repeat')!;
function draw(now:number){
 ctx.clearRect(0,0,width,height);ctx.fillStyle=paper;ctx.fillRect(0,0,width,height);
 ctx.save();ctx.beginPath();ctx.rect(8,8,width-16,height-16);ctx.clip();
 for(let y=0;y<board.size;y++)for(let x=0;x<board.size;x++){const p=point({x,y});ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1,Math.min(3.2,cell*.055)),0,Math.PI*2);ctx.fillStyle='#c9bfa7';ctx.fill();}
 for(const id of state.ids){const a=board.arrows[id],highlight=id===hint||id===selected;const bad=flash.includes(id)&&now<flashUntil;
  arrow(a,bad?'#ee3d26':highlight?'#f5b817':'#0878d9');
 }
 if(flight){const t=Math.min(1,(now-flight.start)/(reduced?40:350));ctx.globalAlpha=1-t*.3;arrow(flight.arrow,'#0878d9',(1-(1-t)**2)*(width+height));ctx.globalAlpha=1;}
 ctx.restore();
}
function frame(now:number){stamp=now;if(flight&&now-flight.start>(reduced?50:360)){flight=null;dirty=true;if(phase==='won')winSheet();}if(flashUntil&&now>flashUntil){flashUntil=0;flash=[];dirty=true;}
 if(dirty||flight||flashUntil){draw(now);dirty=false;}requestAnimationFrame(frame);}
function syncHostCapsule(){
 let hosted=false;try{const capsule=window.parent.document.querySelector('.capsule');hosted=window.parent!==window&&!!capsule&&window.parent.getComputedStyle(capsule).display!=='none';}catch{}
 // Android's native game shell also owns a top-right capsule.
 hosted ||= /; wv\)/.test(navigator.userAgent);
 document.body.classList.toggle('host-capsule',hosted);
}
syncHostCapsule();addEventListener('resize',syncHostCapsule);
new ResizeObserver(resize).observe(canvas);resize();update();say('点击畅通的箭头，让它离开棋盘。');requestAnimationFrame(frame);
// Read-only geometry/state for delivery checks. Tests use real pointer/keyboard input.
Object.defineProperty(window,'__arrowEscape',{value:{snapshot:()=>({phase,overlay,level:board.level,board:structuredClone(board),state:structuredClone(state),unlocked:progress.unlocked,stars:[...progress.stars],available:available(board,state.ids),blocked:state.ids.filter(id=>blocker(board,state.ids,id)!==null),zoom,pan:{...pan},history:history.length,flight:!!flight,geometry:{cell,ox,oy,width,height},hint,selected})}});

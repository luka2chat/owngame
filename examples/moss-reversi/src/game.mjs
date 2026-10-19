import {initial,move,legal,undo,replay,choose} from './rules.js';
import {fitLayout} from './layout.mjs';
const $=id=>document.getElementById(id),board=$('board-art'),ctx=board.getContext('2d'),garden=$('garden'),bg=garden.getContext('2d');
const SAVE_KEY='owngame:board:moss-reversi:v1',names=['墨石','白瓷'],images={};
let state=initial('reversi'),solo=true,simple=matchMedia('(prefers-reduced-motion:reduce)').matches,ready=false,modal='',pending='',saveError=false;
let notice='',noticeUntil=0,busyUntil=0,aiDue=0,animation=null,dirty=true,inputCount=0,layout=null,active=null,lastFocus=null,layoutRevision=0;
const cells=[];
function say(text){notice=text;noticeUntil=performance.now()+3600;dirty=true;}
function clearNotice(){notice='';noticeUntil=0;}
function busy(){return performance.now()<busyUntil;}
function restore(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return;const d=JSON.parse(raw),s=replay('reversi',d.moves);if(d.schema!==1||d.kind!=='reversi'||typeof d.solo!=='boolean'||typeof d.simple!=='boolean'||!s)throw Error('invalid save');state=s;solo=d.solo;simple=d.simple;say('已接续上次的棋局');}catch{say('存档异常，已保留备份并开始新局');try{const raw=localStorage.getItem(SAVE_KEY);if(raw)localStorage.setItem(SAVE_KEY+':backup',raw);}catch{saveError=true;}}}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify({schema:1,kind:'reversi',solo,simple,moves:state.moves}));saveError=false;}catch{saveError=true;}}
function setModal(value){modal=value;active?.el.classList.remove('pressed');active=null;$('modal').hidden=!value;$('viewport').inert=!!value;aiDue=0;if(value){lastFocus=document.activeElement;renderModal();queueMicrotask(()=>$('modal-actions').querySelector('button')?.focus({preventScroll:true}));}else lastFocus?.focus?.({preventScroll:true});dirty=true;}
function reset(){if(pending==='mode')solo=!solo;state=initial('reversi');pending='';busyUntil=0;animation=null;aiDue=0;clearNotice();setModal('');save();dirty=true;}
function confirm(action){if(modal||busy())return;pending=action;if(state.moves.length&&!state.winner)setModal('confirm');else reset();}
function play(at,bot=false){if(!ready||modal||busy()||(!bot&&solo&&state.turn===2))return;const next=move(state,at);if(!next){say(state.winner?'本局已结束，可以开始新一局':'这里夹不住棋子，试试圆环处');return;}const before=state;state=next;clearNotice();if(next.passed&&!next.winner)say('对方无处落子，你继续');const now=performance.now();busyUntil=simple?0:now+440;animation=simple?null:{before,start:now};aiDue=0;save();dirty=true;}
function tap(el,fn){
 el.addEventListener('pointerdown',e=>{if(!ready||busy()||active||!e.isPrimary||el.disabled)return;e.preventDefault();active={el,id:e.pointerId,x:e.clientX,y:e.clientY,revision:layoutRevision,cancelled:false,boardScroll:$('board-region').scrollTop};el.classList.add('pressed');el.setPointerCapture(e.pointerId);});
 el.addEventListener('pointermove',e=>{if(active?.id!==e.pointerId||active.el!==el)return;if(Math.hypot(e.clientX-active.x,e.clientY-active.y)>10){active.cancelled=true;el.classList.remove('pressed');if(el.classList.contains('cell')&&layout.landscape)$('board-region').scrollTop=active.boardScroll+active.y-e.clientY;}});
 el.addEventListener('pointerup',e=>{if(active?.el!==el||active.id!==e.pointerId)return;const a=active;active=null;el.classList.remove('pressed');const r=el.getBoundingClientRect();if(!a.cancelled&&a.revision===layoutRevision&&!busy()&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom&&!el.disabled){inputCount++;fn();}});
 el.addEventListener('pointercancel',()=>{if(active?.el===el){active=null;el.classList.remove('pressed');}});
 el.addEventListener('click',e=>{if(e.detail===0&&ready&&!busy()&&!el.disabled){inputCount++;fn();}});
}
for(let i=0;i<64;i++){const b=document.createElement('button');b.type='button';b.className='cell';b.id='cell-'+i;tap(b,()=>play(i));$('board-input').append(b);cells.push(b);}
tap($('undo'),()=>{state=undo(state,solo);animation=null;aiDue=0;say('已退回上一回合');save();dirty=true;});tap($('new'),()=>confirm('new'));tap($('help'),()=>setModal('help'));tap($('mode'),()=>confirm('mode'));tap($('simple'),()=>{simple=!simple;save();dirty=true;});
function renderModal(){
 $('modal-title').textContent=modal==='help'?'落子 · 翻叶':'另起一庭？';
 const lines=modal==='help'?['以自己的棋子夹住对方，即可翻面。横、竖、斜八个方向都可以夹翻。','浅色圆环标出可落子的位置。无处落子时自动让行。','双方都无处落子时，棋子较多的一方获胜。','单人陪练：你执墨石先手；同屏双人轮流落子。','每手自动保存。悔一步退回你的上一回合。']:['当前棋局尚未结束。',pending==='mode'?'切换模式会开始一局新棋。':'新的一局将替换当前棋局。','也可以留下来，继续这一庭。'];
 $('modal-body').replaceChildren(...lines.map(s=>{const p=document.createElement('p');p.textContent=s;return p;}));
 const options=modal==='help'?[['close','知道了，继续',()=>setModal('')]]:[['cancel','继续本局',()=>setModal('')],['confirm','开始新局',reset]];
 $('modal-actions').replaceChildren(...options.map(([id,label,fn],i)=>{const b=document.createElement('button');b.type='button';b.id=id;b.textContent=label;if(i===0)b.className='green';tap(b,fn);return b;}));
}
document.addEventListener('keydown',e=>{if(modal&&e.key==='Escape'){e.preventDefault();setModal('');}if(modal&&e.key==='Tab'){const bs=[...$('modal-actions').querySelectorAll('button')],i=bs.indexOf(document.activeElement);e.preventDefault();bs[(i+(e.shiftKey?-1:1)+bs.length)%bs.length].focus();}});
function rect(el,r){Object.assign(el.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});}
function resize(){const r=$('viewport').getBoundingClientRect(),safeTop=r.top;layout=fitLayout(r.width,r.height,safeTop);layoutRevision++;if(active){active.el.classList.remove('pressed');active=null;}rect($('header'),layout.header);rect($('footer'),layout.footer);rect($('board-region'),{x:layout.board.x,y:layout.board.y,w:layout.board.size,h:layout.board.viewHeight||layout.board.size});$('board-art').style.height=layout.board.size+'px';$('board-input').style.height=layout.board.size+'px';
 $('header').classList.toggle('landscape',layout.landscape);$('header').style.setProperty('--title-size',layout.titleSize+'px');$('scores').style.marginTop=Math.max(8,layout.header.h-78)+'px';for(const b of document.querySelectorAll('nav button'))b.style.height=layout.controlH+'px';
 const d=Math.min(3,devicePixelRatio||1);board.width=Math.round(layout.board.size*d);board.height=board.width;ctx.setTransform(board.width/8,0,0,board.height/8,0,0);garden.width=Math.round(innerWidth*d);garden.height=Math.round(innerHeight*d);bg.setTransform(d,0,0,d,0,0);if(ready)drawGarden();dirty=true;
}
function drawGarden(){
 const img=images['paper-garden'],w=innerWidth,h=innerHeight;
 // Assemble the approved paper and botanical material at display time, without baking gameplay into the image.
 bg.fillStyle='#e8ddc4';bg.fillRect(0,0,w,h);
 const tile=document.createElement('canvas');tile.width=100;tile.height=100;tile.getContext('2d').drawImage(img,425,60,100,100,0,0,100,100);document.documentElement.style.setProperty('--paper-tile',`url("${tile.toDataURL()}")`);bg.fillStyle=bg.createPattern(tile,'repeat');bg.fillRect(0,0,w,h);
 const strip=Math.min(48,w*.085),scale=w/992;
 bg.drawImage(img,0,0,80,1586,0,0,strip,h);bg.drawImage(img,912,0,80,1586,w-strip,0,strip,h);
 bg.drawImage(img,0,0,992,184,0,0,w,Math.min(h*.16,184*scale));
 const bottomH=Math.min(126,h*.16);bg.drawImage(img,0,1495,992,91,0,h-bottomH,w,bottomH);
 const vr=$('viewport').getBoundingClientRect(),r=layout.board,border=12;
 bg.drawImage(img,63,331,866,866,vr.left+r.x-border,vr.top+r.y-border,r.size+border*2,(r.viewHeight||r.size)+border*2);
 const title=$('header').querySelector('h1').getBoundingClientRect(),score=$('scores').getBoundingClientRect();
 bg.drawImage(img,250,53,510,132,title.x-3,title.y-3,title.width+6,title.height+6);
 bg.drawImage(img,83,197,827,81,score.x,score.y,score.width,score.height);
 for(const button of document.querySelectorAll('nav button')){const b=button.getBoundingClientRect();const src=button.classList.contains('green')?[354,1308,291,90]:button.closest('#settings')?[84,1423,414,83]:[83,1311,247,86];bg.drawImage(img,...src,b.x,b.y,b.width,b.height);}
}
function ring(x,y,r,fill,width=.025){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle=fill;ctx.lineWidth=width;ctx.stroke();}
function token(i,value,now){const x=i%8+.5,y=Math.floor(i/8)+.5;ctx.fillStyle='#0a211c65';ctx.beginPath();ctx.arc(x,y+.035,.37,0,Math.PI*2);ctx.fill();let sx=1,sy=1,v=value;if(animation){const old=animation.before.board[i],elapsed=now-animation.start;if(old&&old!==value){const delay=Math.min(120,Math.hypot(i%8-state.last%8,Math.floor(i/8)-Math.floor(state.last/8))*18),t=Math.max(0,elapsed-delay);if(t<120){sx=Math.max(.04,1-t/120);v=old;sy=1+.04*t/120;}else sx=Math.min(1,.04+(t-120)/160);}else if(i===state.last){const t=Math.min(1,elapsed/200);sx=sy=.65+.35*(1-Math.pow(1-t,3));}}
 ctx.save();ctx.translate(x,y);ctx.scale(sx,sy);ctx.drawImage(images[v===1?'inkstone':'porcelain'],-.47,-.47,.94,.94);ctx.restore();if(i===state.last){ring(x,y,.425,'#f4d88c',.023);ctx.fillStyle='#c26b45';ctx.beginPath();ctx.arc(x+.31,y-.31,.055,0,Math.PI*2);ctx.fill();}}
function draw(now){
 ctx.drawImage(images['paper-garden'],86,354,822,819,0,0,8,8);ctx.strokeStyle='#e1d9b6d0';ctx.lineWidth=.014;ctx.beginPath();for(let i=0;i<=8;i++){ctx.moveTo(i,0);ctx.lineTo(i,8);ctx.moveTo(0,i);ctx.lineTo(8,i);}ctx.stroke();
 const available=legal(state);for(let i=0;i<64;i++){if(available.includes(i))ring(i%8+.5,Math.floor(i/8)+.5,.135,'#edddb6ed',.033);if(state.board[i])token(i,state.board[i],now);const mark=state.board[i]?names[state.board[i]-1]:available.includes(i)?'可落子':'空格';cells[i].setAttribute('aria-label',`${'abcdefgh'[i%8]}${Math.floor(i/8)+1} ${mark}`);cells[i].setAttribute('aria-pressed',String(i===state.last));}
 const a=state.board.filter(v=>v===1).length,b=state.board.filter(v=>v===2).length;$('ink-count').textContent='墨石 '+a;$('white-count').textContent='白瓷 '+b;$('move-count').textContent=state.winner?'终 局':`第 ${state.moves.length+1} 手`;$('ink-score').classList.toggle('active',!state.winner&&state.turn===1);$('white-score').classList.toggle('active',!state.winner&&state.turn===2);
 $('status-text').textContent=state.winner===3?'平分秋色':state.winner?names[state.winner-1]+`获胜 · ${a} : ${b}`:names[state.turn-1]+(solo&&state.turn===2?'思考中':'落子');$('status').classList.toggle('won',!!state.winner);$('turn-piece').src='./assets/'+((state.winner===1||state.winner===2?state.winner:state.turn)===1?'inkstone':'porcelain')+'.png';
 $('notice').textContent=saveError?'存储不可用，本局暂时无法保存':notice||'每手自动保存，随时接续';$('notice').classList.toggle('error',saveError);$('undo').disabled=!state.moves.length;$('mode-text').textContent=solo?'单人陪练':'同屏双人';$('simple-text').textContent=simple?'简动：开':'简动：关';$('simple').setAttribute('aria-pressed',String(simple));dirty=false;
}
function snapshot(){const box=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};const visibleButtons=[...(modal?$('modal'):document).querySelectorAll('button')].filter(b=>!b.closest('[hidden]')&&b.id!=='retry');return JSON.parse(JSON.stringify({ready,id:'moss-reversi',kind:'reversi',runtime:'web-canvas',source_sha256:document.querySelector('meta[name=source-sha256]')?.content,art:'paper-b-v2',state,solo,simple,busy:busy(),ai:aiDue>0,modal,notice,saveError,inputCount,legal:legal(state),layout,viewport:box($('viewport')),safeArea:{top:box($('viewport')).y,left:box($('viewport')).x,right:innerWidth-box($('viewport')).x-box($('viewport')).w,bottom:innerHeight-box($('viewport')).y-box($('viewport')).h},targets:visibleButtons.map(b=>({id:b.id,...box(b),css:box(b),enabled:!b.disabled})),board:box($('board-region')),background:{x:0,y:0,w:innerWidth,h:innerHeight}}));}
Object.defineProperty(window,'__owngameBoard',{configurable:false,writable:false,value:Object.freeze({snapshot})});
let hiddenAt=0;document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=performance.now();if(active){active.el.classList.remove('pressed');active=null;}}else{const elapsed=performance.now()-hiddenAt;if(animation)animation.start+=elapsed;if(busyUntil)busyUntil+=elapsed;aiDue=0;dirty=true;}});window.addEventListener('resize',resize);new ResizeObserver(resize).observe($('viewport'));
function tick(now){if(ready&&!document.hidden){if(notice&&now>=noticeUntil&&!modal){clearNotice();dirty=true;}if(animation&&now>=busyUntil){animation=null;dirty=true;}if(!busy()&&solo&&state.turn===2&&!state.winner&&!modal){if(!aiDue)aiDue=now+280;else if(now>=aiDue){play(choose(state),true);aiDue=0;}}else aiDue=0;if(dirty||animation)draw(now);}requestAnimationFrame(tick);}
$('retry').addEventListener('click',()=>location.reload());
try{await Promise.all(['paper-garden','inkstone','porcelain'].map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images[name]=img;resolve();};img.onerror=()=>reject(Error('Asset unavailable: '+name));img.src='./assets/'+name+'.png';})).concat([document.fonts.load('600 18px PaperGarden')]));restore();ready=true;resize();draw(performance.now());$('loading').hidden=true;requestAnimationFrame(tick);}catch(error){$('loading').querySelector('p').textContent='纸庭未能展开，请重新打开';$('retry').hidden=false;console.error(error);}

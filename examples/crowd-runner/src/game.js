import {levels,applyGate,newRun,parseSave,                  } from './rules.js';
const $=(id       )=>document.getElementById(id) ;
const canvas=$('scene')                     ,ctx=canvas.getContext('2d',{alpha:false}) ;
const atlas=new Image();atlas.src='./crowd-atlas.png';
const key='owngame:crowd-runner:v1';
let saved=(()=>{try{return parseSave(localStorage.getItem(key));}catch{return parseSave(null);}})();
let run    =saved.run?structuredClone(saved.run):newRun(0);
let phase                                           ='menu',target=run.x,w=480,h=854,time=0,last=0,acc=0,saveAt=0;
let battleStart=0,battleOwn=0,battleEnemy=0,battleClock=0,shake=0,flash=0,feedbackUntil=0;
let muted=!saved.sound,audio                       ,drag                                        =null;
const held=new Set        ();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const colors=['#1577fb','#288cff','#0863e2','#4b9bff'];
                                                                                         
const particles           =[];
function persist(){
 saved.run=(phase==='run'||phase==='pause')?structuredClone(run):null;saved.sound=!muted;
 try{localStorage.setItem(key,JSON.stringify(saved));}catch{$('save-status').textContent='当前浏览器无法保存进度，本次仍可正常游玩';}
}
function tone(freq       ,duration=.09,type               ='sine'){
 if(muted)return;
 try{audio??=new AudioContext();void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.72,audio.currentTime+duration);g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}
}
function tell(text       ,bad=false){$('feedback').textContent=text;$('feedback').style.color=bad?'#ff5267':'#136bf0';$('feedback').classList.add('show');feedbackUntil=time+1.25;}
function burst(count       ,color       ){for(let i=0;i<Math.min(count,45);i++)particles.push({x:run.x+(Math.random()-.5)*.55,z:Math.random()*16,up:Math.random()*26,vx:(Math.random()-.5)*.7,vz:Math.random()*22,life:.6+Math.random()*.6,color});}
function resize(){const dpr=Math.min(devicePixelRatio||1,2);w=canvas.clientWidth;h=canvas.clientHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(canvas);resize();
function button(id       ,text       ,action         ){const b=$(id)                     ;b.textContent=text;b.onclick=action;return b;}
function panel(kicker       ,title       ,copy       ,stats='',primary='开始奔跑',action=()=>start(false),secondary=''){
 document.body.classList.remove('running');$('panel').hidden=false;$('levels').hidden=true;
 $('panel-kicker').textContent=kicker;$('panel-title').textContent=title;$('panel-copy').innerHTML=copy;$('panel-stats').textContent=stats;
 button('primary',primary,action);const b=button('secondary',secondary,()=>start(true));b.hidden=!secondary;
 $('pause').setAttribute('aria-label',phase==='pause'?'继续游戏':'暂停游戏');
}
function intro(){
 const has=!!saved.run;phase='menu';
 panel('集结出发 / CROWD RUSH','人潮冲线','选对数字门，让十个人变成一支大队伍。<br>躲开障碍，一起冲过终点！','',has?'继续上次奔跑 →':'出发，冲向终点 →',()=>start(false),has?'重新开始本关':'');
 const subtitle=document.createElement('span');subtitle.textContent='越跑，越热闹。';$('panel-title').append(subtitle);
}
function start(restart=false){
 if(restart||!saved.run||phase==='won'||phase==='lost')run=newRun(run.level);
 else if(phase==='menu')run=structuredClone(saved.run);
 target=run.x;phase='run';held.clear();drag=null;document.body.classList.add('running');$('panel').hidden=true;$('levels').hidden=true;$('pause').setAttribute('aria-label','暂停游戏');
 tone(520);persist();
}
function pause(){if(phase!=='run'&&phase!=='battle')return;
 const wasBattle=phase==='battle';phase='pause';held.clear();drag=null;
 // Battles are brief and deterministic; resume them without a second reward.
 panel('歇一会儿 / PAUSED','等你一起出发','队伍会在这里等你。<br>继续时，从刚才的位置接着跑。','', '继续奔跑 →',()=>{phase=wasBattle?'battle':'run';document.body.classList.add('running');$('panel').hidden=true;$('pause').setAttribute('aria-label','暂停游戏');},'重新开始本关');
 if(!wasBattle)persist();
}
function finish(win        ){
 phase=win?'won':'lost';saved.run=null;held.clear();
 if(win){saved.best[run.level]=Math.max(saved.best[run.level]||0,battleStart);saved.unlocked=Math.max(saved.unlocked,Math.min(levels.length-1,run.level+1));burst(45,'#ffcc66');tone(880,.25);}
 else{tone(130,.3,'triangle');}
 persist();
 const lastLevel=run.level===levels.length-1;
 panel(win?'一起赢了 / FINISH':'再来一次 / TRY AGAIN',win?(lastLevel?'全关卡通关！':'漂亮，冲线成功！'):'差一点就冲过去了',win?'你的选择让队伍越跑越壮大。<br>继续下一程，试试新的数字门。':'乘法不一定总比加法划算。<br>看看当前人数，再选择下一道门。',win?`${battleStart} 人集结 · 剩余 ${run.count} 人`:'终点需要 '+levels[run.level].boss+' 人',win?(lastLevel?'重跑最后一程 →':'下一关卡 →'):'再试这一程 →',()=>{if(win&&!lastLevel)run=newRun(run.level+1);saved.run=null;start(true);});
}
function showLevels(){
 if(phase==='run'||phase==='battle')pause();$('panel').hidden=true;$('levels').hidden=false;document.body.classList.remove('running');
 $('level-grid').replaceChildren();
 levels.forEach((l,i)=>{const b=document.createElement('button');b.disabled=i>saved.unlocked;b.textContent=b.disabled?'·':String(i+1).padStart(2,'0');b.setAttribute('aria-label',`${i+1} ${l.name}${b.disabled?' 尚未解锁':''}`);const s=document.createElement('small');s.textContent=saved.best[i]?'已通关':b.disabled?'待解锁':'出发';b.append(s);b.onclick=()=>{saved.run=null;run=newRun(i);start(true);};$('level-grid').append(b);});
}
button('choose','选择关卡 · 8 关',showLevels);$('back').onclick=()=>{$('levels').hidden=true;$('panel').hidden=false;};
$('pause').onclick=()=>{if(phase==='run'||phase==='battle')pause();else if(phase==='pause')($('primary')                     ).click();};
function soundLabel(){$('sound').textContent=muted?'♩':'♪';$('sound').setAttribute('aria-label',muted?'开启音效':'关闭音效');$('sound').setAttribute('aria-pressed',String(!muted));}
$('sound').onclick=()=>{muted=!muted;soundLabel();persist();if(!muted)tone(660);};soundLabel();
function steer(value       ){if(phase==='run')target=Math.max(-.78,Math.min(.78,value));}
canvas.addEventListener('pointerdown',e=>{if(phase!=='run')return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,target};});
canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)steer(drag.target+(e.clientX-drag.x)/(w*.36));});
const release=()=>{drag=null;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
for(const [id,direction]of [['left',-1],['right',1]]         ){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();held.add(id);steer(direction*.69);b.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>held.delete(id));}
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','a','A','d','D',' ','Escape'].includes(e.key))e.preventDefault();if(e.repeat)return;if(e.key==='Escape'||e.key===' '){($('pause')                     ).click();return;}if(['ArrowLeft','a','A'].includes(e.key)){held.add('left');steer(-.69);}if(['ArrowRight','d','D'].includes(e.key)){held.add('right');steer(.69);}});
addEventListener('keyup',e=>{if(['ArrowLeft','a','A'].includes(e.key))held.delete('left');if(['ArrowRight','d','D'].includes(e.key))held.delete('right');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();last=0;acc=0;}});
addEventListener('pagehide',()=>{if(phase==='run')phase='pause';persist();});
function step(dt       ){
 time+=dt;shake=Math.max(0,shake-dt*12);flash=Math.max(0,flash-dt*3);
 if(time>feedbackUntil)$('feedback').classList.remove('show');
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.up+=dt*12;if(p.life<=0)particles.splice(i,1);}
 if(phase==='run'){
  const l=levels[run.level];if(held.has('left'))target=-.69;if(held.has('right'))target=.69;
  run.x+=(target-run.x)*Math.min(1,dt*14);run.distance+=l.speed*dt;
  while(run.passed<l.rows.length&&run.distance>=l.rows[run.passed].at){
   const lane=run.x<0?0:1,g=l.rows[run.passed].gates[lane],before=run.count;run.count=applyGate(run.count,g);run.choices.push(lane);run.passed++;
   const gain=run.count-before;tell((gain>=0?'+':'')+gain+' 位伙伴',gain<0);burst(Math.abs(gain),gain<0?'#ec7954':'#56c8c8');tone(gain<0?190:680,.14);flash=.5;persist();
  }
  l.hazards.forEach((hazard,i)=>{if(run.distance<hazard.at||run.hit.includes(i))return;run.hit.push(i);const lane=hazard.moving?Math.sin(time*1.7)*.6:hazard.lane;if(Math.abs(run.x-lane)<.35){const loss=Math.min(run.count,hazard.loss);run.count-=loss;tell('-'+loss+' 位伙伴',true);shake=5;burst(15,'#ec7954');tone(120,.14,'triangle');}});
  if(run.count<=0){battleStart=0;finish(false);}
  else if(run.distance>=l.length){phase='battle';battleStart=run.count;battleOwn=run.count;battleEnemy=l.boss;battleClock=0;tell('一起冲线！');saved.run=null;persist();}
  else if(time-saveAt>1.2){saveAt=time;persist();}
 }else if(phase==='battle'){
  battleClock+=dt;const spent=Math.min(battleStart,levels[run.level].boss,Math.floor(battleClock*levels[run.level].boss/1.9));
  battleOwn=Math.max(0,battleStart-spent);battleEnemy=Math.max(0,levels[run.level].boss-spent);run.count=battleOwn;
  if(battleClock>=2.1)finish(battleStart>levels[run.level].boss);
 }
}
function P(x       ,z       ){const scale=1/(1+Math.max(-18,z)/180);return{x:w/2+x*w*.445*scale,y:-h*.4+h*1.25*scale,s:scale};}
function poly(points                      ,color       ){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();}
function round(x       ,y       ,width       ,height       ,radius       ,color       ){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,width,height,radius);ctx.fill();}
function ellipse(x       ,y       ,rx       ,ry       ,color       ){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function text(t       ,x       ,y       ,size       ,color       ,weight=900){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${weight} ${size}px system-ui,-apple-system,"PingFang SC",sans-serif`;ctx.fillStyle=color;ctx.fillText(t,x,y);}
function outlined(t       ,x       ,y       ,size       ,color       ){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`950 ${size}px system-ui,-apple-system,"PingFang SC",sans-serif`;ctx.lineJoin='round';ctx.lineWidth=Math.max(2,size*.12);ctx.strokeStyle='#15366a';ctx.strokeText(t,x,y);ctx.fillStyle=color;ctx.fillText(t,x,y);}
function runner(x       ,z       ,index       ,color       ,enemy=false){
 const p=P(x,z),s=p.s*Math.min(w/430,1.4),bob=reduced?0:Math.sin(time*11+index*.7)*1.5*s;
 ellipse(p.x+3*s,p.y+1*s,10*s,4.5*s,'#24375029');
 if(atlas.complete&&atlas.naturalWidth>0){
  const moving=phase==='run'||phase==='battle',frame=moving?Math.floor(time*8+index*.37)%2:2;
  const cellW=atlas.naturalWidth/3,cellH=atlas.naturalHeight/2,height=66*s,width=height;
  ctx.drawImage(atlas,frame*cellW,enemy?cellH:0,cellW,cellH,p.x-width*.5,p.y-height*.92+bob,width,height);
 }else{
  const shine=ctx.createLinearGradient(p.x-9*s,0,p.x+8*s,0);shine.addColorStop(0,enemy?'#ff9a91':'#68b7ff');shine.addColorStop(.4,color);shine.addColorStop(1,enemy?'#c52d42':'#0845bb');
  round(p.x-7*s,p.y-25*s+bob,14*s,21*s,7*s,color);ctx.fillStyle=shine;ctx.fill();
  ellipse(p.x,p.y-32*s+bob,8*s,8*s,color);ellipse(p.x-2*s,p.y-35*s+bob,4*s,2*s,'#ffffff65');
  round(p.x-7*s,p.y-11*s+bob,5*s,13*s,3*s,color);round(p.x+2*s,p.y-11*s-bob,5*s,13*s,3*s,color);
 }
}
function crowd(count       ,x       ,z       ,enemy=false){
 const drawn=Math.min(count,125),columns=Math.max(3,Math.min(10,Math.ceil(Math.sqrt(drawn)*1.15))),spacing=Math.min(.15,.87/columns);
 const extent=columns*spacing*.55,center=Math.max(-.96+extent,Math.min(.96-extent,x));
 for(let i=drawn-1;i>=0;i--){const row=Math.floor(i/columns),col=i%columns;runner(center+(col-(Math.min(columns,drawn)-1)/2)*spacing+(row%2?spacing*.4:0),z+row*4.3,i,enemy?'#ff4c58':colors[i%4],enemy);}
}
function gate(at       ,lane       ,g     ){
 const z=at-run.distance;if(z<0||z>320)return;
 const p=P(lane===0?-.5:.5,z),s=p.s,left=P(lane===0?-.97:.03,z),right=P(lane===0?-.03:.97,z);
 const width=right.x-left.x,height=Math.min(w*.28,112)*s,multiply=g.op==='×',positive=multiply||g.op==='+';
 const color=multiply?'#994dff':positive?'#1696ff':'#ff6272',edge=multiply?'#5e21b5':positive?'#1359c1':'#bc2a49';
 const slab=ctx.createLinearGradient(0,p.y-height,0,p.y);slab.addColorStop(0,multiply?'#cb9cff':positive?'#7ccfff':'#ffb4ab');slab.addColorStop(1,color);
 poly([{x:left.x,y:p.y+3*s},{x:right.x,y:p.y+3*s},{x:right.x+9*s,y:p.y+12*s},{x:left.x+9*s,y:p.y+12*s}], '#172b4a22');
 round(left.x+3*s,p.y-height,width-6*s,height,7*s,color+'8f');
 ctx.fillStyle=slab;ctx.fill();
 round(left.x,p.y-height-6*s,width,12*s,4*s,edge);
 round(left.x+2*s,p.y-height-7*s,width-4*s,5*s,3*s,'#f4f7ff');
 round(left.x,p.y-height,9*s,height,3*s,edge);round(right.x-9*s,p.y-height,9*s,height,3*s,edge);
 round(left.x+2*s,p.y-height+3*s,3*s,height-5*s,2*s,'#ffffff9c');round(right.x-7*s,p.y-height+3*s,3*s,height-5*s,2*s,'#ffffff9c');
 round(left.x-3*s,p.y-4*s,width+6*s,10*s,3*s,edge);round(left.x,p.y-4*s,width,4*s,2*s,'#ccecff');
 outlined(g.op+g.value,p.x,p.y-height*.54,Math.max(14,Math.min(w*.105,44)*s),'#ffffff');
}
function saw(i       ){const hazard=levels[run.level].hazards[i],z=hazard.at-run.distance;if(z< -15||z>300)return;
 const x=hazard.moving?Math.sin(time*1.7)*.6:hazard.lane,p=P(x,z),s=p.s;
 ellipse(p.x+5*s,p.y+5*s,28*s,9*s,'#51392b35');round(p.x-20*s,p.y-7*s,40*s,12*s,5*s,'#314766');
 ctx.save();ctx.translate(p.x,p.y-19*s);ctx.rotate(time*3);const points=[];
 for(let j=0;j<24;j++){const r=(j%2?19:26)*s;points.push({x:Math.cos(j/24*Math.PI*2)*r,y:Math.sin(j/24*Math.PI*2)*r});}
 poly(points,'#d22a45');ellipse(0,0,18*s,18*s,'#ffcd42');ellipse(0,0,11*s,11*s,'#f57836');ellipse(-3*s,-4*s,5*s,5*s,'#ffe895');ellipse(0,0,4*s,4*s,'#2d4064');ctx.restore();
}
function rock(x       ,y       ,size       ){
 ellipse(x+size*.3,y+size*.3,size*.75,size*.24,'#9f6a3330');
 poly([{x:x-size*.6,y},{x:x-size*.5,y:y-size*.65},{x:x-size*.04,y:y-size*.96},{x:x+size*.44,y:y-size*.7},{x:x+size*.6,y:y-size*.06},{x:x+size*.1,y:y+size*.24}], '#d69d53');
 poly([{x:x-size*.6,y},{x:x-size*.5,y:y-size*.65},{x:x-size*.04,y:y-size*.96},{x:x+size*.08,y:y-size*.25},{x:x+size*.1,y:y+size*.24}], '#efc982');
 poly([{x:x-size*.5,y:y-size*.65},{x:x-size*.04,y:y-size*.96},{x:x+size*.44,y:y-size*.7},{x:x+size*.08,y:y-size*.25}], '#ffdf9e');
}
function cactus(x       ,y       ,size       ){
 ellipse(x+3,y+3,size*.3,size*.12,'#8a713c29');round(x-size*.11,y-size*.9,size*.23,size*.9,size*.12,'#5ea947');
 round(x-size*.4,y-size*.65,size*.22,size*.36,size*.1,'#7cbd48');round(x-size*.32,y-size*.4,size*.3,size*.14,size*.07,'#6bab43');
 round(x+size*.12,y-size*.6,size*.3,size*.14,size*.07,'#4e983f');round(x+size*.28,y-size*.83,size*.18,size*.35,size*.09,'#5eaa44');
 round(x-size*.04,y-size*.8,size*.04,size*.65,2,'#b9df6b');
}
function draw(){
 ctx.save();if(shake&&!reduced)ctx.translate(Math.sin(time*45)*shake,0);
 const sand=ctx.createLinearGradient(0,0,0,h);sand.addColorStop(0,'#f8dda4');sand.addColorStop(1,'#edc47e');ctx.fillStyle=sand;ctx.fillRect(0,0,w,h);
 // An original miniature canyon surrounds the battle lane; quiet terrain keeps
 // the blue/red units and gate values as the strongest visual information.
 for(let i=0;i<32;i++){
  const yy=(i/32*h+run.distance*1.2)%h,side=i%2?-1:1,xx=side<0?w*(.015+(i%4)*.04):w*(.84+(i%4)*.04);
  const size=(12+(i%5)*6)*Math.min(w/390,1.7)*(yy/h*.55+.5);
  if(i%3===0)cactus(xx,yy,size*1.15);else rock(xx,yy,size);
 }
 const nearL=P(-1,-13),nearR=P(1,-13),farL=P(-1,340),farR=P(1,340);
 poly([{x:nearL.x+12,y:nearL.y+20},{x:nearR.x+14,y:nearR.y+20},{x:farR.x+7,y:farR.y+6},{x:farL.x+5,y:farL.y+6}], '#8b653d32');
 poly([{x:nearL.x-5,y:nearL.y+13},{x:nearR.x+5,y:nearR.y+13},farR,farL],'#8090a2');
 poly([nearL,nearR,farR,farL],'#dce3ec');
 const offset=run.distance%26;
 for(let z=-offset;z<340;z+=26){poly([P(-.98,z),P(.98,z),P(.98,z+13),P(-.98,z+13)],'#e7edf3');}
 for(const edge of [-1,1]){
  const a=P(edge,-13),b=P(edge,340);ctx.strokeStyle='#ffffff';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  for(let z=18-run.distance%45;z<330;z+=45){const p=P(edge,z);round(p.x-2*p.s,p.y-14*p.s,4*p.s,14*p.s,2*p.s,'#ecb451');ellipse(p.x,p.y-14*p.s,3*p.s,3*p.s,'#fff5cc');}
 }
 for(let z=8-run.distance%34;z<320;z+=34){const p=P(0,z),q=P(0,z+9);ctx.strokeStyle='#ffffff';ctx.lineWidth=2*p.s;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
 const l=levels[run.level],finishZ=l.length-run.distance;
 if(finishZ<320){
  const padZ=Math.max(0,finishZ),rear=P(0,padZ+70),s=rear.s;
  round(rear.x-44*s,rear.y-36*s,88*s,40*s,8*s,'#9f2946');round(rear.x-44*s,rear.y-43*s,88*s,36*s,8*s,'#f85a69');round(rear.x-37*s,rear.y-40*s,74*s,6*s,3*s,'#ffadb2');
  const own=phase==='battle'?battleEnemy:l.boss;crowd(Math.max(0,own),0,padZ+21,true);
  const badge=P(0,padZ+68);round(badge.x-39*badge.s,badge.y-82*badge.s,78*badge.s,31*badge.s,10*badge.s,'#e63553');outlined(String(own),badge.x,badge.y-65*badge.s,23*badge.s,'#fff');
  for(let i=0;i<12;i++){const a=P(-1+i/6,finishZ),b=P(-1+(i+1)/6,finishZ-8);poly([a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}],i%2?'#fff':'#233d62');}
 }
 const scenery                    =[];
 l.rows.forEach(row=>row.gates.forEach((g,i)=>{if(row.at>run.distance)scenery.push([row.at-run.distance,()=>gate(row.at,i,g)]);}));
 l.hazards.forEach((v,i)=>{if(!run.hit.includes(i))scenery.push([v.at-run.distance,()=>saw(i)]);});
 scenery.sort((a,b)=>b[0]-a[0]).forEach(([,fn])=>fn());
 const count=phase==='battle'?battleOwn:run.count;
 const rally=P(run.x,10);ellipse(rally.x,rally.y+3,Math.min(66,22+count*.35)*rally.s,13*rally.s,'#0873ff17');
 crowd(count,run.x,phase==='battle'?8:3);
 const head=P(run.x,23+Math.ceil(Math.min(count,125)/Math.max(3,Math.min(10,Math.ceil(Math.sqrt(Math.min(count,125))*1.15))))*4.3);
 round(head.x-34,head.y-57,68,33,11,'#095ecf');round(head.x-32,head.y-57,64,5,3,'#8ccfff');outlined(String(count),head.x,head.y-39,24,'#fff');
 if(phase==='battle'){
  const fight=P(0,16),pulse=Math.sin(battleClock*30)*7;ellipse(fight.x,fight.y-25,28+pulse,12+pulse*.3,'#fff5b59a');
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2+battleClock*4;round(fight.x+Math.cos(a)*38,fight.y-25+Math.sin(a)*16,5,9,2,i%2?'#ff7b59':'#519bff');}
 }
 for(const p of particles){const loc=P(p.x,p.z);ctx.globalAlpha=Math.min(1,p.life);round(loc.x,loc.y-p.up,6*loc.s,8*loc.s,2,p.color);}ctx.globalAlpha=1;
 if(flash&&!reduced){ctx.fillStyle=`rgba(190,220,255,${flash*.2})`;ctx.fillRect(0,0,w,h);}
 ctx.restore();
 $('level-number').textContent=String(run.level+1).padStart(2,'0')+' / 08';$('level-name').textContent=l.name;
 $('progress').style.width=Math.min(100,run.distance/l.length*100)+'%';$('goal').textContent='敌方 '+l.boss;
}
function loop(stamp       ){if(!last)last=stamp;acc+=Math.min(.1,(stamp-last)/1000);last=stamp;while(acc>=1/60){step(1/60);acc-=1/60;}draw();requestAnimationFrame(loop);}
intro();requestAnimationFrame(loop);
// Read-only diagnostics for delivery checks; gameplay tests use real input.
Object.defineProperty(window,'__crowdRunner',{value:{snapshot:()=>({atlasReady:atlas.complete&&atlas.naturalWidth>0,phase,time,run:structuredClone(run),target,unlocked:saved.unlocked,best:[...saved.best],level:levels[run.level],viewport:{width:w,height:h},saved:!!saved.run})}});

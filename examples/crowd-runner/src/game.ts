import {levels,applyGate,newRun,parseSave,type Run,type Gate} from './rules.js';
const $=(id:string)=>document.getElementById(id)!;
const canvas=$('scene') as HTMLCanvasElement,ctx=canvas.getContext('2d',{alpha:false})!;
const atlas=makeTeamSprites();
const key='owngame:crowd-runner:v1';
let saved=(()=>{try{return parseSave(localStorage.getItem(key));}catch{return parseSave(null);}})();
let run:Run=saved.run?structuredClone(saved.run):newRun(0);
let phase:'menu'|'run'|'pause'|'battle'|'won'|'lost'='menu',target=run.x,w=480,h=854,time=0,last=0,acc=0,saveAt=0;
let battleStart=0,battleOwn=0,battleEnemy=0,battleClock=0,shake=0,flash=0,feedbackUntil=0;
let muted=!saved.sound,audio:AudioContext|undefined,drag:{id:number;x:number;target:number}|null=null;
const held=new Set<string>();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const colors=['#2465ab','#347dc3','#2465ab','#347dc3'];
type Particle={x:number;z:number;up:number;vx:number;vz:number;life:number;color:string};
const particles:Particle[]=[];
function persist(){
 saved.run=(phase==='run'||phase==='pause')?structuredClone(run):null;saved.sound=!muted;
 try{localStorage.setItem(key,JSON.stringify(saved));}catch{$('save-status').textContent='当前浏览器无法保存进度，本次仍可正常游玩';}
}
function tone(freq:number,duration=.09,type:OscillatorType='sine'){
 if(muted)return;
 try{audio??=new AudioContext();void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.72,audio.currentTime+duration);g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}
}
function tell(text:string,bad=false){$('feedback').textContent=text;$('feedback').style.color=bad?'#ed7259':'#f7cd42';$('feedback').classList.add('show');feedbackUntil=time+1.25;}
function burst(count:number,color:string){for(let i=0;i<Math.min(count,45);i++)particles.push({x:run.x+(Math.random()-.5)*.55,z:Math.random()*16,up:Math.random()*26,vx:(Math.random()-.5)*.7,vz:Math.random()*22,life:.6+Math.random()*.6,color});}
function resize(){const dpr=Math.min(devicePixelRatio||1,2);w=canvas.clientWidth;h=canvas.clientHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
new ResizeObserver(resize).observe(canvas);resize();
function button(id:string,text:string,action:()=>void){const b=$(id) as HTMLButtonElement;b.textContent=text;b.onclick=action;return b;}
function panel(kicker:string,title:string,copy:string,stats='',primary='开始奔跑',action=()=>start(false),secondary=''){
 document.body.classList.remove('running');$('panel').hidden=false;$('levels').hidden=true;
 $('panel-kicker').textContent=kicker;$('panel-title').textContent=title;$('panel-copy').innerHTML=copy;$('panel-stats').textContent=stats;
 button('primary',primary,action);const b=button('secondary',secondary,()=>start(true));b.hidden=!secondary;
 $('pause').setAttribute('aria-label',phase==='pause'?'继续游戏':'暂停游戏');
}
function intro(){
 const has=!!saved.run;phase='menu';
 panel('人群跑酷 · 8 关','人潮冲线','选门增加人数，避开旋转障碍。<br>人数超过对手，才能通过终点。','',has?'继续上次奔跑 →':'出发，冲向终点 →',()=>start(false),has?'重新开始本关':'');
 const subtitle=document.createElement('span');subtitle.textContent='选对门，带队冲线';$('panel-title').append(subtitle);
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
 panel('暂停','游戏已暂停','继续后从当前位置接着跑。','', '继续奔跑 →',()=>{phase=wasBattle?'battle':'run';document.body.classList.add('running');$('panel').hidden=true;$('pause').setAttribute('aria-label','暂停游戏');},'重新开始本关');
 if(!wasBattle)persist();
}
function finish(win:boolean){
 phase=win?'won':'lost';saved.run=null;held.clear();
 if(win){saved.best[run.level]=Math.max(saved.best[run.level]||0,battleStart);saved.unlocked=Math.max(saved.unlocked,Math.min(levels.length-1,run.level+1));burst(45,'#ffcc66');tone(880,.25);}
 else{tone(130,.3,'triangle');}
 persist();
 const lastLevel=run.level===levels.length-1;
 panel(win?'本关完成':'本关未通过',win?(lastLevel?'全关卡通关！':'冲线成功'):'人数不足',win?'本关已完成，可继续挑战下一关。':'乘法不一定总比加法划算。<br>看看当前人数，再选择下一道门。',win?`${battleStart} 人集结 · 剩余 ${run.count} 人`:'终点需要 '+levels[run.level].boss+' 人',win?(lastLevel?'重跑最后一程 →':'下一关卡 →'):'再试这一程 →',()=>{if(win&&!lastLevel)run=newRun(run.level+1);saved.run=null;start(true);});
}
function showLevels(){
 if(phase==='run'||phase==='battle')pause();$('panel').hidden=true;$('levels').hidden=false;document.body.classList.remove('running');
 $('level-grid').replaceChildren();
 levels.forEach((l,i)=>{const b=document.createElement('button');b.disabled=i>saved.unlocked;b.textContent=b.disabled?'·':String(i+1).padStart(2,'0');b.setAttribute('aria-label',`${i+1} ${l.name}${b.disabled?' 尚未解锁':''}`);const s=document.createElement('small');s.textContent=saved.best[i]?'已通关':b.disabled?'待解锁':'出发';b.append(s);b.onclick=()=>{saved.run=null;run=newRun(i);start(true);};$('level-grid').append(b);});
}
button('choose','选择关卡 · 8 关',showLevels);$('back').onclick=()=>{$('levels').hidden=true;$('panel').hidden=false;};
$('pause').onclick=()=>{if(phase==='run'||phase==='battle')pause();else if(phase==='pause')($('primary') as HTMLButtonElement).click();};
function soundLabel(){$('sound').textContent=muted?'♩':'♪';$('sound').setAttribute('aria-label',muted?'开启音效':'关闭音效');$('sound').setAttribute('aria-pressed',String(!muted));}
$('sound').onclick=()=>{muted=!muted;soundLabel();persist();if(!muted)tone(660);};soundLabel();
function steer(value:number){if(phase==='run')target=Math.max(-.78,Math.min(.78,value));}
canvas.addEventListener('pointerdown',e=>{if(phase!=='run')return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,target};});
canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)steer(drag.target+(e.clientX-drag.x)/(w*.36));});
const release=()=>{drag=null;};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
for(const [id,direction]of [['left',-1],['right',1]] as const){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();held.add(id);steer(direction*.69);b.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>held.delete(id));}
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','a','A','d','D',' ','Escape'].includes(e.key))e.preventDefault();if(e.repeat)return;if(e.key==='Escape'||e.key===' '){($('pause') as HTMLButtonElement).click();return;}if(['ArrowLeft','a','A'].includes(e.key)){held.add('left');steer(-.69);}if(['ArrowRight','d','D'].includes(e.key)){held.add('right');steer(.69);}});
addEventListener('keyup',e=>{if(['ArrowLeft','a','A'].includes(e.key))held.delete('left');if(['ArrowRight','d','D'].includes(e.key))held.delete('right');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();last=0;acc=0;}});
addEventListener('pagehide',()=>{if(phase==='run')phase='pause';persist();});
function step(dt:number){
 time+=dt;shake=Math.max(0,shake-dt*12);flash=Math.max(0,flash-dt*3);
 if(time>feedbackUntil)$('feedback').classList.remove('show');
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.up+=dt*12;if(p.life<=0)particles.splice(i,1);}
 if(phase==='run'){
  const l=levels[run.level];if(held.has('left'))target=-.69;if(held.has('right'))target=.69;
  run.x+=(target-run.x)*Math.min(1,dt*14);run.distance+=l.speed*dt;
  while(run.passed<l.rows.length&&run.distance>=l.rows[run.passed].at){
   const lane=run.x<0?0:1,g=l.rows[run.passed].gates[lane],before=run.count;run.count=applyGate(run.count,g);run.choices.push(lane);run.passed++;
   const gain=run.count-before;tell((gain>=0?'+':'')+gain+' 位伙伴',gain<0);burst(Math.abs(gain),gain<0?'#ec7954':'#f5ce43');tone(gain<0?190:680,.14);flash=.5;persist();
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
function makeTeamSprites(){
 const sheet=document.createElement('canvas');sheet.width=256;sheet.height=640;const c=sheet.getContext('2d')!;
 const ink='#192d3b',skins=['#f3bd91','#d79263','#9a6048','#e5a873'];
 for(let team=0;team<2;team++)for(let variant=0;variant<4;variant++)for(let pose=0;pose<4;pose++){
  c.save();c.translate(pose*64,(team*4+variant)*80);const stride=[-5,0,5,0][pose],shirt=team?'#e95842':variant%2?'#347dc3':'#2465ab';
  const line=(x:number,y:number,xx:number,yy:number,color:string,size:number)=>{c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.lineWidth=size;c.strokeStyle=color;c.lineCap='round';c.lineJoin='round';c.stroke();};
  // Four deliberately drawn running poses, with jerseys, skin and footwear.
  line(27,53,24+stride,69,ink,8);line(37,53,40-stride,69,ink,8);
  line(24+stride,69,20+stride,69,'#fffbeb',6);line(40-stride,69,44-stride,69,'#fffbeb',6);
  line(23,32,17-stride*.5,47-stride,ink,8);line(41,32,47+stride*.5,47+stride,ink,8);
  line(23,32,17-stride*.5,47-stride,skins[variant],5);line(41,32,47+stride*.5,47+stride,skins[variant],5);
  c.beginPath();c.moveTo(23,29);c.lineTo(41,29);c.lineTo(43,52);c.lineTo(21,52);c.closePath();c.fillStyle=shirt;c.fill();c.lineWidth=3;c.strokeStyle=ink;c.stroke();
  c.fillStyle=ink;c.fillRect(22,51,20,8);c.fillStyle='#fffbeb';c.fillRect(25,30,14,3);
  c.font='bold 14px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(String([7,9,11,3][variant]),32,43);
  c.beginPath();c.arc(32,20,9,0,Math.PI*2);c.fillStyle=skins[variant];c.fill();c.lineWidth=3;c.strokeStyle=ink;c.stroke();
  c.beginPath();c.arc(32,18,9,Math.PI,Math.PI*2);c.lineTo(41,19);c.lineTo(23,19);c.closePath();c.fillStyle=variant===2?'#5a362b':ink;c.fill();
  if(!team){c.fillStyle=shirt;c.fillRect(23,13,18,5);c.fillStyle='#fffbeb';c.fillRect(29,13,7,3);}else{c.fillStyle=ink;c.fillRect(28,21,2,2);c.fillRect(35,21,2,2);}
  c.restore();
 }
 return sheet;
}
function P(x:number,z:number){const scale=1/(1+Math.max(-18,z)/180);return{x:w/2+x*w*.445*scale,y:-h*.26+h*1.12*scale,s:scale};}
function poly(points:{x:number;y:number}[],color:string){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();}
function round(x:number,y:number,width:number,height:number,radius:number,color:string){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,width,height,radius);ctx.fill();}
function ellipse(x:number,y:number,rx:number,ry:number,color:string){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function text(t:string,x:number,y:number,size:number,color:string,weight=900){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${weight} ${size}px system-ui,-apple-system,"PingFang SC",sans-serif`;ctx.fillStyle=color;ctx.fillText(t,x,y);}
function outlined(t:string,x:number,y:number,size:number,color:string){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${size}px system-ui,-apple-system,"PingFang SC",sans-serif`;ctx.lineJoin='round';ctx.lineWidth=Math.max(2,size*.1);ctx.strokeStyle='#fff9e9';ctx.strokeText(t,x,y);ctx.fillStyle=color;ctx.fillText(t,x,y);}
function runner(x:number,z:number,index:number,color:string,enemy=false){
 const p=P(x,z),s=p.s*Math.min(w/430,1.4),moving=phase==='run'||phase==='battle',frame=moving&&!reduced?Math.floor(time*8+index*.5)%4:1;
 ellipse(p.x+2*s,p.y,9*s,3*s,'#172d3c30');
 const height=57*s,width=height*.8;
 ctx.drawImage(atlas,frame*64,((enemy?4:0)+index%4)*80,64,80,p.x-width/2,p.y-height*.9,width,height);
}
function crowd(count:number,x:number,z:number,enemy=false){
 const drawn=Math.min(count,125),columns=Math.max(3,Math.min(10,Math.ceil(Math.sqrt(drawn)*1.15))),spacing=Math.min(.15,.87/columns);
 const extent=columns*spacing*.55,center=Math.max(-.96+extent,Math.min(.96-extent,x));
 for(let i=drawn-1;i>=0;i--){const row=Math.floor(i/columns),col=i%columns;runner(center+(col-(Math.min(columns,drawn)-1)/2)*spacing+(row%2?spacing*.4:0),z+row*4.3,i,colors[i%4],enemy);}
}
function gate(at:number,lane:number,g:Gate){
 const z=at-run.distance;if(z<0||z>295)return;
 const p=P(lane===0?-.5:.5,z),s=p.s,left=P(lane===0?-.97:.03,z),right=P(lane===0?-.03:.97,z),width=right.x-left.x,height=Math.min(w*.25,104)*s;
 const fill=g.op==='×'?'#8bcbd8':g.op==='+'?'#f6ce42':'#ed8169';
 poly([{x:left.x+5*s,y:p.y+4*s},{x:right.x+5*s,y:p.y+4*s},{x:right.x+12*s,y:p.y+12*s},{x:left.x+12*s,y:p.y+12*s}],'#172d3c35');
 round(left.x-2*s,p.y-height-4*s,width+4*s,height+7*s,2*s,'#192d3b');
 round(left.x+3*s,p.y-height+1*s,width-6*s,height-6*s,0,fill);
 for(let i=0;i<8;i++)round(left.x+3*s+i*(width-6*s)/8,p.y-height+1*s,(width-6*s)/8,5*s,0,i%2?'#fff9e9':'#192d3b');
 round(left.x,p.y-height,6*s,height+6*s,0,'#fff9e9');round(right.x-6*s,p.y-height,6*s,height+6*s,0,'#fff9e9');
 ellipse(left.x+3*s,p.y-height+9*s,1.5*s,1.5*s,'#192d3b');ellipse(right.x-3*s,p.y-height+9*s,1.5*s,1.5*s,'#192d3b');
 text(g.op+g.value,p.x,p.y-height*.48,Math.max(15,Math.min(w*.1,42)*s),'#192d3b');
}
function saw(i:number){const hazard=levels[run.level].hazards[i],z=hazard.at-run.distance;if(z< -15||z>295)return;
 const x=hazard.moving?Math.sin(time*1.7)*.6:hazard.lane,p=P(x,z),s=p.s;ellipse(p.x+4*s,p.y+3*s,25*s,8*s,'#192d3b30');
 ctx.save();ctx.translate(p.x,p.y-18*s);ctx.rotate(time*3);const points=[];for(let j=0;j<20;j++){const r=(j%2?17:24)*s;points.push({x:Math.cos(j/20*Math.PI*2)*r,y:Math.sin(j/20*Math.PI*2)*r});}
 poly(points,'#192d3b');ellipse(0,0,17*s,17*s,'#f4c946');round(-3*s,-14*s,6*s,28*s,0,'#e85843');round(-14*s,-3*s,28*s,6*s,0,'#e85843');ellipse(0,0,5*s,5*s,'#fff9e9');ctx.restore();
}
function draw(){
 ctx.save();if(shake&&!reduced)ctx.translate(Math.sin(time*45)*shake,0);
 ctx.fillStyle='#28616a';ctx.fillRect(0,0,w,h);
 // A small outdoor athletics ground: flat ink, lane markings and pennants.
 for(const side of [-1,1]){
  poly([P(side*1.08,-13),P(side*1.8,-13),P(side*1.8,340),P(side*1.08,340)],'#214953');
  for(let z=28-run.distance%58;z<330;z+=58){const p=P(side*1.24,z),s=p.s;round(p.x-15*s,p.y-4*s,30*s,9*s,0,'#192f3c');round(p.x-12*s,p.y-13*s,24*s,9*s,0,'#7c9c91');round(p.x-12*s,p.y-16*s,24*s,3*s,0,'#c3c9a5');}
  for(let z=75-run.distance%105;z<320;z+=105){const p=P(side*1.17,z),s=p.s;round(p.x-1*s,p.y-39*s,2*s,39*s,0,'#fff9e9');poly([{x:p.x,y:p.y-39*s},{x:p.x+side*21*s,y:p.y-34*s},{x:p.x,y:p.y-28*s}],side<0?'#f6ce42':'#ee7458');}
 }
 const nearL=P(-1,-13),nearR=P(1,-13),farL=P(-1,340),farR=P(1,340);
 poly([{x:nearL.x+8,y:nearL.y+13},{x:nearR.x+8,y:nearR.y+13},farR,farL],'#172e3c');poly([nearL,nearR,farR,farL],'#d97d61');
 for(let z=-run.distance%36;z<340;z+=36)poly([P(-.98,z),P(.98,z),P(.98,z+18),P(-.98,z+18)],'#df876a');
 for(const lane of [-1,-.5,0,.5,1]){const a=P(lane,-13),b=P(lane,340);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='#fff3d7';ctx.lineWidth=Math.abs(lane)===1?5:1.5;ctx.stroke();}
 const l=levels[run.level],finishZ=l.length-run.distance;
 if(finishZ<260){
  const z=Math.max(0,finishZ),opponent=phase==='battle'?battleEnemy:l.boss;crowd(Math.max(0,opponent),0,z+24,true);
  const badge=P(0,z+70);round(badge.x-34*badge.s,badge.y-57*badge.s,68*badge.s,25*badge.s,2,'#192d3b');text(String(opponent),badge.x,badge.y-44*badge.s,20*badge.s,'#fff9e9');
  for(let i=0;i<16;i++){const a=P(-1+i/8,z),b=P(-1+(i+1)/8,z-9);poly([a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}],i%2?'#fff9e9':'#192d3b');}
 }
 const scenery:[number,()=>void][]=[];l.rows.forEach(row=>row.gates.forEach((g,i)=>{if(row.at>run.distance)scenery.push([row.at-run.distance,()=>gate(row.at,i,g)]);}));l.hazards.forEach((v,i)=>{if(!run.hit.includes(i))scenery.push([v.at-run.distance,()=>saw(i)]);});scenery.sort((a,b)=>b[0]-a[0]).forEach(([,fn])=>fn());
 const count=phase==='battle'?battleOwn:run.count;crowd(count,run.x,phase==='battle'?8:3);
 const shown=Math.min(count,125),columns=Math.max(3,Math.min(10,Math.ceil(Math.sqrt(shown)*1.15))),extent=columns*Math.min(.15,.87/columns)*.55;
 const head=P(Math.max(-.96+extent,Math.min(.96-extent,run.x)),(phase==='battle'?8:3)+(Math.ceil(shown/columns)-1)*4.3),labelY=head.y-57*head.s*Math.min(w/430,1.4)*.9-40;
 round(head.x-32,labelY,64,32,2,'#192d3b');round(head.x-29,labelY,58,27,1,'#f5ce43');text(String(count),head.x,labelY+14,24,'#192d3b');
 if(phase==='battle'){const p=P(0,14);text('VS',p.x,p.y-37,30,'#fff9e9');}
 for(const p of particles){const loc=P(p.x,p.z);ctx.globalAlpha=Math.min(1,p.life);round(loc.x,loc.y-p.up,5*loc.s,8*loc.s,0,p.color);}ctx.globalAlpha=1;
 if(flash&&!reduced){ctx.fillStyle=`rgba(255,245,215,${flash*.15})`;ctx.fillRect(0,0,w,h);}
 ctx.restore();$('level-number').textContent=String(run.level+1).padStart(2,'0')+' / 08';$('level-name').textContent=l.name;$('progress').style.width=Math.min(100,run.distance/l.length*100)+'%';$('goal').textContent='对手 '+l.boss;
}
function loop(stamp:number){if(!last)last=stamp;acc+=Math.min(.1,(stamp-last)/1000);last=stamp;while(acc>=1/60){step(1/60);acc-=1/60;}draw();requestAnimationFrame(loop);}
intro();requestAnimationFrame(loop);
// Read-only diagnostics for delivery checks; gameplay tests use real input.
Object.defineProperty(window,'__crowdRunner',{value:{snapshot:()=>({atlasReady:atlas.width>0,phase,time,run:structuredClone(run),target,unlocked:saved.unlocked,best:[...saved.best],level:levels[run.level],viewport:{width:w,height:h},saved:!!saved.run})}});

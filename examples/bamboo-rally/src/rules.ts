/** Original implementation from the documented numeric contract; no reference code/assets. */
export type Player=0|1;
export type Difficulty=0|1|2;
export type Vec={x:number;y:number;z:number};
export type Paddle={x:number;z:number;dx:number;spin:number;power:number;targetX:number;targetZ:number;held:boolean};
export type Flight={p:Vec[];time:number;duration:number};
export type State={schema:1;seed:number;difficulty:Difficulty;mode:'bot'|'duo';score:[number,number];server:Player;winner:Player|null;phase:'serve'|'rally'|'point'|'finished';wait:number;ball:Vec;flight:Flight|null;paddles:[Paddle,Paddle];last:Player|2;shooter:Player|null;ticks:number;hits:number;bounces:number;points:number;cpuSpeed:number;cpuOffset:{x:number;z:number};cpuSkill:number;lastPoint:Player|null};
export const RULES=Object.freeze({target:7,fixedMs:20,tableX:6.08,tableZ:10.96,ballRadius:.4,paddleRadius:1.67,paddleHeight:10,paddleOffset:.66,paddleY:2,boundX:9.241705894470215,baseDuration:.9,durationPower:.2,arc:6,direction:8,power:7,spin:.3,bounce:30,difficulty:[[.3,.5],[.4,.6],[.85,1]]});
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const v=(x=0,y=0,z=0):Vec=>({x,y,z});
const side=(p:Player)=>p===0?1:-1;
function random(s:State){s.seed^=s.seed<<13;s.seed^=s.seed>>>17;s.seed^=s.seed<<5;s.seed>>>=0;return s.seed/4294967296;}
const paddle=(p:Player):Paddle=>({x:0,z:-side(p)*12,dx:0,spin:0,power:0,targetX:0,targetZ:-side(p)*12,held:false});
export function initial(seed:number,difficulty:Difficulty=0,mode:'bot'|'duo'='bot'):State{
 const s:State={schema:1,seed:(seed>>>0)||1,difficulty,mode,score:[0,0],server:0,winner:null,phase:'serve',wait:0,ball:v(0,2,-8),flight:null,paddles:[paddle(0),paddle(1)],last:2,shooter:null,ticks:0,hits:0,bounces:0,points:0,cpuSpeed:.15,cpuOffset:{x:0,z:0},cpuSkill:0,lastPoint:null};
 const [a,b]=RULES.difficulty[difficulty];s.cpuSkill=a+random(s)*(b-a);return s;
}
export function control(s:State,p:Player,x:number,z:number,held=true):boolean{
 if(s.winner!==null||(p===1&&s.mode==='bot')||![x,z].every(Number.isFinite))return false;
 const a=s.paddles[p];a.targetX=clamp(x,-RULES.boundX,RULES.boundX);a.targetZ=p===0?clamp(z,-20,-5):clamp(z,5,20);a.held=held;
 if(!held){a.dx=0;a.spin=0;a.power=0;}return true;
}
export function release(s:State,p?:Player){for(const i of p===undefined?[0,1]:[p]){const a=s.paddles[i];a.held=false;a.dx=0;a.spin=0;a.power=0;}}
export function difficultyAfterPoint(s:State){const [a,b]=RULES.difficulty[s.difficulty];s.cpuSkill=a+(b-a)*(clamp(s.score[0]-s.score[1],-3,3)+3)/6;}
export function award(s:State,p:Player){
 if(s.winner!==null||s.phase==='point')return;
 s.score[p]++;s.points++;s.lastPoint=p;s.flight=null;release(s);difficultyAfterPoint(s);
 if(s.score[p]>=7){s.winner=p;s.phase='finished';s.wait=0;return;}
 if((s.score[0]+s.score[1])%2===0)s.server=(1-s.server) as Player;
 s.phase='point';s.wait=1000;
}
function serve(s:State){s.phase='serve';s.ball=v(0,2,-side(s.server)*8);s.last=2;s.shooter=null;s.flight=null;}
function arc(start:Vec,end:Vec,duration:number):Flight{return{p:[{...start},v(start.x+(end.x-start.x)*.2,6,start.z+(end.z-start.z)*.2),v(end.x,6,end.z),{...end}],time:0,duration};}
export function ease(t:number){t=clamp(t,0,1);return clamp((-2*t*t*t+3*t*t)+(t*t*t-2*t*t+t)*1.3626503944396973+(t*t*t-t*t)*.3367648124694824,0,1);}
export function bezier(f:Flight,t:number):Vec{const u=ease(t),w=1-u,k=[w*w*w,3*w*w*u,3*w*u*u,u*u*u];return v(...(['x','y','z'].map(a=>f.p.reduce((n,p,i)=>n+p[a as keyof Vec]*k[i],0)) as [number,number,number]));}
function cpuHit(s:State){const a=s.paddles[1];a.spin=-.8+1.6*random(s);a.power=s.cpuSkill;a.dx=0;s.cpuSpeed=.15+.05*random(s);s.cpuOffset={x:0,z:0};if(random(s)<.125){const angle=random(s)*Math.PI*2,r=Math.sqrt(random(s))*2;s.cpuOffset={x:Math.cos(angle)*r,z:Math.sin(angle)*r};}}
export function hit(s:State,p:Player):boolean{
 if(s.last!==2||s.winner!==null||s.phase==='point'||s.phase==='finished')return false;
 if(s.mode==='bot'&&p===1)cpuHit(s);
 const a=s.paddles[p],end=v(a.spin*8*(.7+.3*a.power),-6,side(p)*(5+7*a.power));
 s.flight=arc(s.ball,end,.9-.2*a.power);s.shooter=p;s.last=p;s.phase='rally';s.hits++;return true;
}
function bounce(s:State,d:Vec){
 const len=Math.hypot(d.x,d.y,d.z);if(len<1e-9)return;
 const end=v(s.ball.x+d.x/len*30,s.ball.y-6,s.ball.z+d.z/len*30);
 s.flight=arc(s.ball,end,s.flight!.duration);s.last=2;s.bounces++;
}
function collidePaddle(s:State,p:Player,b:Vec){const a=s.paddles[p],cx=a.x,cz=a.z+side(p)*.66,y=clamp(b.y,2-(5-1.67),2+(5-1.67));return Math.hypot(b.x-cx,b.y-y,b.z-cz)<=2.07;}
function movePaddles(s:State){
 for(const i of [0,1] as Player[]){const a=s.paddles[i];
  if(i===1&&s.mode==='bot'){
   const tx=clamp(s.ball.x+s.cpuOffset.x,-RULES.boundX,RULES.boundX),tz=(s.phase==='serve'?8:s.ball.z<0?15:clamp(s.ball.z+4,10,20))+s.cpuOffset.z,k=clamp(s.cpuSkill*s.cpuSpeed,0,1);
   a.x+=(tx-a.x)*k;a.z=clamp(a.z+(tz-a.z)*k,5,20);continue;
  }
  if(!a.held)continue;
  const dx=(a.targetX-a.x)*.5,dz=(a.targetZ-a.z)*.5;a.x+=dx;a.z+=dz;
  a.dx=clamp(dx,-1,1);a.spin=Math.hypot(dx,dz)>1e-6?dx/Math.hypot(dx,dz):0;a.power=clamp(dz*side(i),-.5,1);
 }
}
/** One 20ms simulation tick. UI owns pause and never catches up after long stalls. */
export function tick(s:State){
 if(s.winner!==null)return;s.ticks++;
 if(s.phase==='point'){s.wait-=20;if(s.wait<=0)serve(s);return;}
 movePaddles(s);
 if(s.phase==='serve'){if(collidePaddle(s,s.server,s.ball))hit(s,s.server);return;}
 const f=s.flight;if(!f)return;
 if(s.shooter!==null)f.p[3].x+=s.paddles[s.shooter].dx*.3;
 const old={...s.ball};f.time=Math.min(f.duration,f.time+.02);const next=bezier(f,f.time/f.duration),d=v(next.x-old.x,next.y-old.y,next.z-old.z);
 // Swept samples ensure a fast ball cannot jump over a paddle or the tabletop.
 const samples=Math.max(1,Math.ceil(Math.hypot(d.x,d.y,d.z)/.15));
 for(let i=1;i<=samples;i++){
  s.ball=v(old.x+d.x*i/samples,old.y+d.y*i/samples,old.z+d.z*i/samples);
  if(s.last===2){for(const p of [0,1] as Player[])if(collidePaddle(s,p,s.ball)&&hit(s,p))return;}
  if(s.last!==2&&d.y<0&&Math.hypot(Math.max(0,Math.abs(s.ball.x)-6.08),s.ball.y-clamp(s.ball.y,-1.2,0),Math.max(0,Math.abs(s.ball.z)-10.96))<=.4){bounce(s,d);return;}
 }
 if(f.time>=f.duration&&s.shooter!==null)award(s,(s.last===2?s.shooter:1-s.shooter) as Player);
}
function checksum(t:string){let n=2166136261;for(let i=0;i<t.length;i++){n^=t.charCodeAt(i);n=Math.imul(n,16777619);}return(n>>>0).toString(16);}
export function valid(s:any):s is State{
 if(!s||s.schema!==1||![0,1,2].includes(s.difficulty)||!['bot','duo'].includes(s.mode)||!['serve','rally','point','finished'].includes(s.phase))return false;
 const integer=(n:any,a:number,b:number)=>Number.isInteger(n)&&n>=a&&n<=b;
 const finite=(n:any,a=-100,b=100)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
 if(!integer(s.seed,1,4294967295)||!Array.isArray(s.score)||s.score.length!==2||!s.score.every((n:any)=>integer(n,0,7))||!integer(s.server,0,1)||![null,0,1].includes(s.winner)||![null,0,1].includes(s.shooter)||![null,0,1].includes(s.lastPoint)||![0,1,2].includes(s.last))return false;
 if(!['ticks','hits','bounces','points'].every(k=>integer(s[k],0,1e9))||s.points!==s.score[0]+s.score[1]||!finite(s.wait,0,1000))return false;
 const win=s.score.findIndex((n:number)=>n===7);if((s.winner===null)!==(win===-1)||s.winner!==null&&(s.winner!==win||s.phase!=='finished')||s.phase==='finished'&&s.winner===null||s.score.filter((n:number)=>n===7).length>1)return false;
 const vec=(v:any)=>v&&finite(v.x,-300,300)&&finite(v.y,-100,100)&&finite(v.z,-100,100);
 if(!vec(s.ball)||!Array.isArray(s.paddles)||s.paddles.length!==2||!s.paddles.every((a:any,i:number)=>a&&finite(a.x,-RULES.boundX,RULES.boundX)&&finite(a.z,i?5:-20,i?20:-5)&&finite(a.targetX,-RULES.boundX,RULES.boundX)&&finite(a.targetZ,i?5:-20,i?20:-5)&&finite(a.dx,-1,1)&&finite(a.spin,-1,1)&&finite(a.power,-.5,1)&&typeof a.held==='boolean'))return false;
 if(!finite(s.cpuSpeed,.15,.2)||!finite(s.cpuSkill,.3,1)||!s.cpuOffset||!finite(s.cpuOffset.x,-2,2)||!finite(s.cpuOffset.z,-2,2))return false;
 if(s.flight!==null){const f=s.flight;if(!f||!Array.isArray(f.p)||f.p.length!==4||!f.p.every(vec)||!finite(f.duration,.69,1.01)||!finite(f.time,0,f.duration)||s.phase!=='rally'||s.shooter===null)return false;}
 return (s.phase==='rally')===(s.flight!==null);
}
export function encode(s:State){const data=JSON.stringify(s);return{schema:1,data,checksum:checksum(data)};}
export function restore(raw:any):State|null{try{if(!raw||raw.schema!==1||typeof raw.data!=='string'||raw.data.length>20000||checksum(raw.data)!==raw.checksum)return null;const s=JSON.parse(raw.data);return valid(s)?s:null;}catch{return null;}}

export function advance(s:State,carry:number,elapsed:number,paused=false){
 if(paused)return{carry,steps:0,suspended:false};
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>250)return{carry:0,steps:0,suspended:true};
 carry+=elapsed;let steps=0;while(carry+1e-7>=20&&s.winner===null){tick(s);carry-=20;steps++;}
 return{carry:s.winner===null?Math.max(0,carry):0,steps,suspended:false};
}

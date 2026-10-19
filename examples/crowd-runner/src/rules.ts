export type Gate = {op:'+'|'×'|'-'|'÷'; value:number};
export type Row = {at:number; gates:[Gate,Gate]};
export type Hazard = {at:number; lane:number; moving?:boolean; loss:number};
export type Level = {name:string; start:number; speed:number; boss:number; rows:Row[]; hazards:Hazard[]; length:number};
const G=(op:Gate['op'],value:number):Gate=>({op,value});
const pairs = [
 [[G('+',12),G('×',2)],[G('×',2),G('+',10)],[G('+',18),G('×',2)],[G('×',2),G('+',24)]],
 [[G('×',2),G('+',18)],[G('+',15),G('×',2)],[G('×',2),G('+',30)],[G('+',32),G('×',2)]],
 [[G('+',22),G('×',2)],[G('×',2),G('+',12)],[G('-',12),G('÷',2)],[G('+',28),G('×',2)],[G('×',2),G('+',36)]],
 [[G('×',3),G('+',24)],[G('+',28),G('×',2)],[G('÷',2),G('-',18)],[G('×',2),G('+',38)],[G('+',50),G('×',2)]],
 [[G('+',24),G('×',3)],[G('×',2),G('+',28)],[G('-',22),G('÷',2)],[G('+',42),G('×',2)],[G('×',2),G('+',60)]],
 [[G('×',2),G('+',28)],[G('+',36),G('×',2)],[G('÷',2),G('-',24)],[G('×',2),G('+',44)],[G('+',60),G('×',2)]],
 [[G('+',30),G('×',3)],[G('×',2),G('+',40)],[G('-',28),G('÷',2)],[G('+',52),G('×',2)],[G('×',2),G('+',70)],[G('÷',2),G('-',36)]],
 [[G('×',3),G('+',36)],[G('+',45),G('×',2)],[G('÷',2),G('-',30)],[G('×',2),G('+',65)],[G('+',80),G('×',2)],[G('-',42),G('÷',2)]],
] as [Gate,Gate][][];
export const applyGate = (count:number,gate:Gate):number => Math.max(0,Math.min(999,
 gate.op==='+'?count+gate.value:gate.op==='×'?count*gate.value:gate.op==='-'?count-gate.value:Math.floor(count/gate.value)));
export const levels:Level[]=pairs.map((gates,i)=>({
 name:['热身起跑','队伍集结','聪明减法','加速跑道','双倍接力','路线选择','冲刺时刻','最后一圈'][i],
 start:10+i*2,speed:29+i*1.1,boss:[100,185,205,285,310,250,335,370][i],
 rows:gates.map((g,j)=>({at:85+j*85,gates:g})),
 hazards:i===0?[]:[{at:214,lane:i%2?-.52:.52,loss:7+i*2},...(i>2?[{at:384,lane:.45,moving:true,loss:10+i*2}]:[])],
 length:85+(gates.length-1)*85+105,
}));
export function routes(level:Level) {
 let all=[{count:level.start,path:[] as number[]}];
 for(const row of level.rows)all=all.flatMap(r=>row.gates.map((g,lane)=>({count:applyGate(r.count,g),path:[...r.path,lane]})));
 return all.sort((a,b)=>b.count-a.count);
}
export type Run={level:number;distance:number;count:number;x:number;passed:number;hit:number[];choices:number[]};
export const newRun=(level:number):Run=>({level,distance:0,count:levels[level].start,x:0,passed:0,hit:[],choices:[]});
export type Save={schema:1;unlocked:number;best:number[];sound:boolean;run:Run|null};
export function parseSave(raw:string|null):Save {
 const clean:Save={schema:1,unlocked:0,best:[],sound:true,run:null};
 try{
  const s=JSON.parse(raw||'null');if(s?.schema!==1)return clean;
  clean.unlocked=Number.isInteger(s.unlocked)?Math.max(0,Math.min(levels.length-1,s.unlocked)):0;
  clean.best=levels.map((_,i)=>Number.isInteger(s.best?.[i])?Math.max(0,Math.min(999,s.best[i])):0);
  clean.sound=s.sound!==false;
  const r=s.run;
  if(r&&Number.isInteger(r.level)&&r.level>=0&&r.level<=clean.unlocked&&Number.isFinite(r.distance)&&r.distance>=0&&r.distance<levels[r.level].length&&Number.isInteger(r.count)&&r.count>0&&r.count<=999&&Number.isFinite(r.x)&&Math.abs(r.x)<=.9&&Number.isInteger(r.passed)&&r.passed>=0&&r.passed<=levels[r.level].rows.length&&Array.isArray(r.choices)&&r.choices.length===r.passed&&r.choices.every((v:number)=>v===0||v===1)&&Array.isArray(r.hit)&&r.hit.every((v:number)=>Number.isInteger(v)&&v>=0&&v<levels[r.level].hazards.length))clean.run={...r};
 }catch{}
 return clean;
}

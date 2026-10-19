                                                      
                                                 
                                                                            
                                                                                                                        
const G=(op           ,value       )     =>({op,value});
const pairs = [
 [[G('+',12),G('×',2)],[G('×',2),G('+',10)],[G('+',18),G('×',2)],[G('×',2),G('+',24)]],
 [[G('×',2),G('+',18)],[G('+',15),G('×',2)],[G('×',2),G('+',30)],[G('+',32),G('×',2)]],
 [[G('+',22),G('×',2)],[G('×',2),G('+',12)],[G('-',12),G('÷',2)],[G('+',28),G('×',2)],[G('×',2),G('+',36)]],
 [[G('×',3),G('+',24)],[G('+',28),G('×',2)],[G('÷',2),G('-',18)],[G('×',2),G('+',38)],[G('+',50),G('×',2)]],
 [[G('+',24),G('×',3)],[G('×',2),G('+',28)],[G('-',22),G('÷',2)],[G('+',42),G('×',2)],[G('×',2),G('+',60)]],
 [[G('×',2),G('+',28)],[G('+',36),G('×',2)],[G('÷',2),G('-',24)],[G('×',2),G('+',44)],[G('+',60),G('×',2)]],
 [[G('+',30),G('×',3)],[G('×',2),G('+',40)],[G('-',28),G('÷',2)],[G('+',52),G('×',2)],[G('×',2),G('+',70)],[G('÷',2),G('-',36)]],
 [[G('×',3),G('+',36)],[G('+',45),G('×',2)],[G('÷',2),G('-',30)],[G('×',2),G('+',65)],[G('+',80),G('×',2)],[G('-',42),G('÷',2)]],
]                   ;
export const applyGate = (count       ,gate     )        => Math.max(0,Math.min(999,
 gate.op==='+'?count+gate.value:gate.op==='×'?count*gate.value:gate.op==='-'?count-gate.value:Math.floor(count/gate.value)));
export const levels        =pairs.map((gates,i)=>({
 name:['峡谷入口','人潮汇合','聪明的减法','乘风而行','倍增长桥','岔路抉择','勇气集结','一起到终点'][i],
 start:10+i*2,speed:29+i*1.1,boss:[100,185,205,285,310,250,335,370][i],
 rows:gates.map((g,j)=>({at:85+j*85,gates:g})),
 hazards:i===0?[]:[{at:214,lane:i%2?-.52:.52,loss:7+i*2},...(i>2?[{at:384,lane:.45,moving:true,loss:10+i*2}]:[])],
 length:85+(gates.length-1)*85+105,
}));
export function routes(level      ) {
 let all=[{count:level.start,path:[]            }];
 for(const row of level.rows)all=all.flatMap(r=>row.gates.map((g,lane)=>({count:applyGate(r.count,g),path:[...r.path,lane]})));
 return all.sort((a,b)=>b.count-a.count);
}
                                                                                                                 
export const newRun=(level       )    =>({level,distance:0,count:levels[level].start,x:0,passed:0,hit:[],choices:[]});
                                                                                     
export function parseSave(raw            )      {
 const clean     ={schema:1,unlocked:0,best:[],sound:true,run:null};
 try{
  const s=JSON.parse(raw||'null');if(s?.schema!==1)return clean;
  clean.unlocked=Number.isInteger(s.unlocked)?Math.max(0,Math.min(levels.length-1,s.unlocked)):0;
  clean.best=levels.map((_,i)=>Number.isInteger(s.best?.[i])?Math.max(0,Math.min(999,s.best[i])):0);
  clean.sound=s.sound!==false;
  const r=s.run;
  if(r&&Number.isInteger(r.level)&&r.level>=0&&r.level<=clean.unlocked&&Number.isFinite(r.distance)&&r.distance>=0&&r.distance<levels[r.level].length&&Number.isInteger(r.count)&&r.count>0&&r.count<=999&&Number.isFinite(r.x)&&Math.abs(r.x)<=.9&&Number.isInteger(r.passed)&&r.passed>=0&&r.passed<=levels[r.level].rows.length&&Array.isArray(r.choices)&&r.choices.length===r.passed&&r.choices.every((v       )=>v===0||v===1)&&Array.isArray(r.hit)&&r.hit.every((v       )=>Number.isInteger(v)&&v>=0&&v<levels[r.level].hazards.length))clean.run={...r};
 }catch{}
 return clean;
}

export type Difficulty=0|1|2;
export type Mode='bot'|'duo';
export type Event={kind:'flip';index:number}|{kind:'settle'|'plan'};
export interface State {schema:1;difficulty:Difficulty;mode:Mode;seed:number;rng:number;deck:number[];owners:number[];seen:boolean[];turn:0|1;scores:number[];open:number[];plan:number[];rounds:number;history:Event[];}
export const COUNTS=[14,22,30];
export const MEMORY_PROB=[Math.fround(.2),.5,Math.fround(.7)];
export const LOOK_SECONDS=Math.fround(1.8);
export function random(s:{rng:number}){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
function shuffled<T>(a:T[],s:{rng:number}){for(let i=a.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function initial(seed:number,difficulty:Difficulty=0,mode:Mode='bot'):State {
 const s:State={schema:1,difficulty,mode,seed:seed>>>0,rng:seed>>>0,deck:[],owners:[],seen:[],turn:0,scores:[0,0],open:[],plan:[],rounds:0,history:[]};
 const motifs=shuffled(Array.from({length:16},(_,i)=>i),s).slice(0,COUNTS[difficulty]/2);s.deck=shuffled(motifs.flatMap(i=>[i,i]),s);s.owners=s.deck.map(()=>-1);s.seen=s.deck.map(()=>false);return s;
}
export const finished=(s:State)=>s.owners.every(v=>v>=0);
export const winner=(s:State)=>!finished(s)?null:s.scores[0]===s.scores[1]?-1:s.scores[0]>s.scores[1]?0:1;
function copy(s:State,e:Event,record:boolean):State{return{...s,deck:[...s.deck],owners:[...s.owners],seen:[...s.seen],scores:[...s.scores],open:[...s.open],plan:[...s.plan],history:record?[...s.history,e]:[]};}
export function flip(s:State,index:number,record=true):State|null {
 if(!Number.isInteger(index)||index<0||index>=s.deck.length||finished(s)||s.open.length>=2||s.owners[index]>=0||s.open.includes(index))return null;
 if(s.mode==='bot'&&s.turn===1&&(s.plan.length!==2||s.plan[s.open.length]!==index))return null;
 const n=copy(s,{kind:'flip',index},record);n.open.push(index);n.seen[index]=true;return n;
}
export function settle(s:State,record=true):State|null {
 if(s.open.length!==2)return null;const n=copy(s,{kind:'settle'},record),[a,b]=n.open;
 if(n.deck[a]===n.deck[b]){n.owners[a]=n.owners[b]=n.turn;n.scores[n.turn]++;n.seen[a]=n.seen[b]=false;}
 else n.turn=n.turn===0?1:0;
 n.rounds++;n.open=[];n.plan=[];return n;
}
export function planBot(s:State,record=true):State|null {
 if(s.mode!=='bot'||s.turn!==1||finished(s)||s.open.length||s.plan.length)return null;
 const n=copy(s,{kind:'plan'},record),available=n.owners.map((v,i)=>v<0?i:-1).filter(i=>i>=0),known=available.filter(i=>n.seen[i]);
 const useMemory=random(n)<=MEMORY_PROB[n.difficulty];
 let a=-1,b=-1;
 if(useMemory){outer:for(let i=0;i<known.length;i++)for(let j=i+1;j<known.length;j++)if(n.deck[known[i]]===n.deck[known[j]]){a=known[i];b=known[j];break outer;}}
 if(a<0){a=available[Math.floor(random(n)*available.length)];if(useMemory)b=known.find(i=>i!==a&&n.deck[i]===n.deck[a])??-1;
 if(b<0){const rest=available.filter(i=>i!==a);b=rest[Math.floor(random(n)*rest.length)];}}
 n.plan=[a,b];return n;
}
export function restore(value:unknown):State|null {
 try {const v=value as State;if(!v||v.schema!==1||![0,1,2].includes(v.difficulty)||!['bot','duo'].includes(v.mode)||!Number.isInteger(v.seed)||v.seed<0||v.seed>0xffffffff||!Array.isArray(v.history)||v.history.length>100000)return null;
 let s=initial(v.seed,v.difficulty,v.mode);for(const e of v.history){if(!e||typeof e!=='object')return null;const n=e.kind==='flip'?flip(s,e.index,false):e.kind==='settle'?settle(s,false):e.kind==='plan'?planBot(s,false):null;if(!n)return null;s=n;}
 for(const k of ['rng','deck','owners','seen','turn','scores','open','plan','rounds'] as const)if(JSON.stringify(s[k])!==JSON.stringify(v[k]))return null;
 s.history=v.history.map(e=>e.kind==='flip'?{kind:'flip',index:e.index}:{kind:e.kind});return s;
 }catch{return null;}
}

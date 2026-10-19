/** Source numeric evidence: artifacts/batch-08/2026-10-18/simon-{profile,methods,callbacks}.json. */
export type Difficulty = 0 | 1 | 2;
export type Step = number[];
export type Phase = 'playing' | 'input' | 'lost';
export interface State { version:1; difficulty:Difficulty; seed:number; sequence:Step[]; score:number; position:number; phase:Phase }
export const RULES = Object.freeze({ tiles:[3,4,4], dualProbability:[0,0,Math.fround(.4)], playback:Math.fround(.85), after:4, speedStep:Math.fround(.025), speedLimit:Math.fround(1.15), dualMs:500, leadMs:1000 });
const f=Math.fround;
export function speed(length:number):number { return length<=4?1:f(1/Math.min(RULES.speedLimit,f(1+f((length-4)*RULES.speedStep)))); }
export function stepMs(length:number):number { return f(f(.75*RULES.playback)*speed(length))*1000; }
export function repeatChance(sequence:Step[],tile:number):number {
 if(!sequence.length||!sequence[sequence.length-1].includes(tile))return 0;
 let p=f(.5+f(sequence.length*f(-.07)));
 for(let i=sequence.length-2;i>=0&&sequence[i].includes(tile);i--)p=f(p+f(.14));
 return p;
}
/** Only one redraw: a repeat is still legal. Random must be finite in [0,1). */
export function nextStep(sequence:Step[],difficulty:Difficulty,random:()=>number):Step {
 const pick=()=>{const x=random();if(!Number.isFinite(x)||x<0||x>=1)throw Error('Invalid random');return x;};
 const n=RULES.tiles[difficulty],tile=()=>Math.floor(pick()*n);let first=tile();
 if(sequence.length&&sequence[sequence.length-1].includes(first)&&pick()<repeatChance(sequence,first))first=tile();
 if(difficulty===2&&pick()<RULES.dualProbability[2]){let second=tile();let tries=0;while(second===first){if(++tries>1024)throw Error('Random source stuck');second=tile();}return[first,second];}
 return[first];
}
function random(s:State):number { let x=s.seed;x^=x<<13;x^=x>>>17;x^=x<<5;s.seed=x>>>0;return s.seed/4294967296; }
export function append(s:State){s.sequence.push(nextStep(s.sequence,s.difficulty,()=>random(s)));s.position=0;s.phase='playing';}
export function initial(seed:number,difficulty:Difficulty=0):State {
 if(![0,1,2].includes(difficulty))throw Error('Invalid difficulty');
 const s:State={version:1,difficulty,seed:(seed>>>0)||1,sequence:[],score:0,position:0,phase:'playing'};append(s);return s;
}
export function restore(raw:unknown):State|null {
 try {const s=raw as State;if(!s||s.version!==1||![0,1,2].includes(s.difficulty)||!Number.isInteger(s.seed)||s.seed<=0||s.seed>0xffffffff||!['playing','input','lost'].includes(s.phase)||!Array.isArray(s.sequence)||!s.sequence.length||s.sequence.length>10000)return null;
 if(!Number.isInteger(s.score)||s.score!==s.sequence.length-1||!Number.isInteger(s.position)||s.position<0||s.position>=s.sequence.length||s.phase==='playing'&&s.position!==0)return null;
 const n=RULES.tiles[s.difficulty];if(s.sequence.some(a=>!Array.isArray(a)||a.length<1||a.length>(s.difficulty===2?2:1)||a.some(v=>!Number.isInteger(v)||v<0||v>=n)||new Set(a).size!==a.length))return null;
 return {version:1,difficulty:s.difficulty,seed:s.seed,sequence:s.sequence.map(a=>a.slice()),score:s.score,position:s.position,phase:s.phase};
 }catch{return null;}
}
export type Result='ignored'|'waiting'|'step'|'round'|'lost';
export class Session {
 state:State; private held=new Map<number,number>(); private first:{tile:number;pointer:number;time:number}|null=null;
 constructor(state:State){const copy=restore(state);if(!copy)throw Error('Invalid state');this.state=copy;}
 get pending(){return this.first?{...this.first}:null;}
 ready(){if(this.state.phase==='playing')this.state.phase='input';}
 resume(){this.held.clear();this.first=null;if(this.state.phase!=='lost'){this.state.position=0;this.state.phase='playing';}}
 private lose():Result{this.state.phase='lost';this.first=null;this.held.clear();return'lost';}
 down(tile:number,pointer:number,time:number):Result {
 const s=this.state;if(s.phase!=='input'||!Number.isInteger(tile)||tile<0||tile>=RULES.tiles[s.difficulty]||!Number.isFinite(time)||time<0||!Number.isInteger(pointer)||this.held.has(pointer))return'ignored';
 if(Array.from(this.held.values()).includes(tile))return'ignored';
 this.held.set(pointer,tile);const expected=s.sequence[s.position];
 if(!expected.includes(tile))return this.lose();
 if(expected.length===2){if(!this.first){this.first={tile,pointer,time};return'waiting';}if(tile===this.first.tile)return'ignored';if(time<this.first.time||time-this.first.time>RULES.dualMs)return this.lose();this.first=null;}
 s.position++;if(s.position===s.sequence.length){s.score=s.sequence.length;append(s);this.held.clear();return'round';}return'step';
 }
 up(pointer:number):Result {this.held.delete(pointer);if(this.first?.pointer===pointer)return this.lose();return'ignored';}
}

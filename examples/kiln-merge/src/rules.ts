export type Dir='left'|'right'|'up'|'down';
export type Frame={board:number[];score:number;rng:number;moves:number};
export type State=Frame&{seed:number;undos:number;previous:Frame|null;last:Dir|null};
export const dirs:Dir[]=['left','right','up','down'];
export const FOUR_PROB=Math.fround(.15);
export function shift(board:number[],dir:Dir){
 const next=board.slice();let gain=0;const merged:number[]=[];
 for(let k=0;k<4;k++){
  const ids=Array.from({length:4},(_,j)=>dir==='left'?k*4+j:dir==='right'?k*4+3-j:dir==='up'?j*4+k:(3-j)*4+k);
  const vals=ids.map(i=>board[i]).filter(Boolean),out:number[]=[];
  for(let j=0;j<vals.length;j++){if(j+1<vals.length&&vals[j]===vals[j+1]){out.push(vals[j]*2);gain+=vals[j]*2;merged.push(ids[out.length-1]);j++;}else out.push(vals[j]);}
  ids.forEach((i,j)=>next[i]=out[j]||0);
 }
 return {board:next,gain,merged,changed:next.some((v,i)=>v!==board[i])};
}
export function random(rng:number){const next=(Math.imul(rng,1664525)+1013904223)>>>0;return {rng:next,value:next/4294967296};}
export function spawn(f:Frame):Frame{const holes=f.board.flatMap((v,i)=>v?[]:[i]);if(!holes.length)return f;const value=random(f.rng),where=random(value.rng),board=f.board.slice();board[holes[Math.floor(where.value*holes.length)]]=value.value<FOUR_PROB?4:2;return {...f,board,rng:where.rng};}
export function initial(seed:number):State{let f:Frame={board:Array(16).fill(0),score:0,rng:seed>>>0,moves:0};f=spawn(spawn(f));return {...f,seed:seed>>>0,undos:1,previous:null,last:null};}
export function won(b:number[]){return b.some(v=>v>=2048);}
export function lost(b:number[]){return !dirs.some(d=>shift(b,d).changed);}
export function move(s:State,dir:Dir):State|null{if(!dirs.includes(dir)||won(s.board)||lost(s.board))return null;const r=shift(s.board,dir);if(!r.changed)return null;const f=spawn({board:r.board,score:s.score+r.gain,rng:s.rng,moves:s.moves+1});return {...f,seed:s.seed,undos:s.undos,previous:{board:s.board.slice(),score:s.score,rng:s.rng,moves:s.moves},last:dir};}
export function undo(s:State):State{if(!s.undos||!s.previous)return s;return {...s.previous,board:s.previous.board.slice(),seed:s.seed,undos:0,previous:null,last:null};}
function frame(v:any):boolean{return !!v&&Array.isArray(v.board)&&v.board.length===16&&v.board.every((n:any)=>Number.isInteger(n)&&n>=0&&n<=2048&&(n===0||(n>=2&&(n&(n-1))===0)))&&v.board.filter(Boolean).length>=2&&Number.isSafeInteger(v.score)&&v.score>=0&&v.score%4===0&&Number.isInteger(v.rng)&&v.rng>=0&&v.rng<=0xffffffff&&Number.isSafeInteger(v.moves)&&v.moves>=0&&v.moves<=1000000&&v.score<=v.moves*4096;}
export function restore(v:any):State|null{
 if(!frame(v)||!Number.isInteger(v.seed)||v.seed<0||v.seed>0xffffffff||![0,1].includes(v.undos))return null;
 if(v.previous!==null){if(!frame(v.previous)||!dirs.includes(v.last))return null;const test=move({...v.previous,seed:v.seed,undos:v.undos,previous:null,last:null},v.last);if(!test||JSON.stringify([test.board,test.score,test.rng,test.moves])!==JSON.stringify([v.board,v.score,v.rng,v.moves]))return null;}
 else if(v.last!==null||v.moves>0&&v.undos!==0)return null;
 if(v.moves===0){const start=initial(v.seed);if(JSON.stringify([v.board,v.rng,v.score])!==JSON.stringify([start.board,start.rng,start.score]))return null;}
 const total=v.board.reduce((a:number,b:number)=>a+b,0);if(total<4+2*v.moves||total>8+4*v.moves)return null;
 return {board:v.board.slice(),score:v.score,rng:v.rng,moves:v.moves,seed:v.seed,undos:v.undos,previous:v.previous?{...v.previous,board:v.previous.board.slice()}:null,last:v.last};
}

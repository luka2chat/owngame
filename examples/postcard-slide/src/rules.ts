export type Size=3|4|5;
export type State={n:Size;seed:number;board:number[];moves:number;history:number[][]};
export const sizes:Size[]=[3,4,5];
export function solved(n:Size){return Array.from({length:n*n},(_,i)=>(i+1)%(n*n));}
export function won(b:number[]){return b.every((v,i)=>v===(i+1)%b.length);}
export function legal(b:number[],n:number){const z=b.indexOf(0);return b.map((_,i)=>i).filter(i=>i!==z&&(i%n===z%n||Math.floor(i/n)===Math.floor(z/n)));}
export function slide(b:number[],n:number,at:number):number[]|null{
 if(!Number.isInteger(at)||!legal(b,n).includes(at))return null;
 const a=b.slice();let z=a.indexOf(0);const step=at%n===z%n?(at>z?n:-n):(at>z?1:-1);
 while(z!==at){a[z]=a[z+step];z+=step;}a[at]=0;return a;
}
export function puzzle(n:Size,seed:number){
 let x=seed>>>0,b=solved(n),previous=-1;const reverse:number[]=[];
 const rnd=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
 for(let k=0;k<({3:48,4:112,5:220}[n]);k++){
  const z=b.indexOf(0),options=legal(b,n).filter(i=>i!==previous),at=options[Math.floor(rnd()*options.length)];
  reverse.push(z);previous=z;b=slide(b,n,at)!;
 }
 if(won(b)){const z=b.indexOf(0);reverse.push(z);b=slide(b,n,z-1)!;}
 return {board:b,solution:reverse.reverse()};
}
export function initial(n:Size,seed:number):State{return {n,seed:seed>>>0,board:puzzle(n,seed).board,moves:0,history:[]};}
export function move(s:State,at:number):State|null{if(won(s.board))return null;const b=slide(s.board,s.n,at);return b?{...s,board:b,moves:s.moves+1,history:[...s.history,s.board].slice(-100)}:null;}
export function undo(s:State):State{return s.history.length?{...s,board:s.history[s.history.length-1],history:s.history.slice(0,-1),moves:s.moves-1}:s;}
export function validBoard(b:unknown,n:Size):b is number[]{
 if(!Array.isArray(b)||b.length!==n*n||new Set(b).size!==n*n||b.some(v=>!Number.isInteger(v)||v<0||v>=n*n))return false;
 const a=b.filter(Boolean);let inv=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i]>a[j])inv++;
 return n%2===1?inv%2===0:(inv+n-Math.floor(b.indexOf(0)/n))%2===1;
}
export function restore(v:any):State|null{
 if(!v||!sizes.includes(v.n)||!Number.isInteger(v.seed)||v.seed<0||v.seed>4294967295||!Number.isSafeInteger(v.moves)||v.moves<0||!validBoard(v.board,v.n)||!Array.isArray(v.history)||v.history.length>100||v.history.length>v.moves)return null;
 const chain=[...v.history,v.board];
 if(chain.some(b=>!validBoard(b,v.n)))return null;
 for(let i=1;i<chain.length;i++)if(won(chain[i-1])||JSON.stringify(slide(chain[i-1],v.n,chain[i].indexOf(0)))!==JSON.stringify(chain[i]))return null;
 if(v.moves===v.history.length&&JSON.stringify(chain[0])!==JSON.stringify(puzzle(v.n,v.seed).board))return null;
 return {n:v.n,seed:v.seed,board:v.board.slice(),moves:v.moves,history:v.history.map((b:number[])=>b.slice())};
}

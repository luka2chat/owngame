export type Kind = 'tris' | 'four' | 'reversi';
export type Player = 1 | 2;
export type State = { kind: Kind; board: number[]; turn: Player; moves: number[]; winner: number; last: number; passed: boolean; line: number[] };
export const shape = (k: Kind) => k === 'tris' ? [3, 3] : k === 'four' ? [7, 6] : [8, 8];
export function initial(kind: Kind): State {
  const [w,h] = shape(kind), board = Array(w*h).fill(0);
  if (kind === 'reversi') { board[27]=2;board[28]=1;board[35]=1;board[36]=2; }
  return {kind,board,turn:1,moves:[],winner:0,last:-1,passed:false,line:[]};
}
const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
export function flips(s:State, at:number, player=s.turn):number[] {
  if (at<0||at>=64||s.board[at]) return [];
  const result:number[]=[];
  for(const [dx,dy] of directions){
    let x=at%8+dx,y=Math.floor(at/8)+dy; const ray:number[]=[];
    while(x>=0&&x<8&&y>=0&&y<8&&s.board[y*8+x]===3-player){ray.push(y*8+x);x+=dx;y+=dy;}
    if(ray.length&&x>=0&&x<8&&y>=0&&y<8&&s.board[y*8+x]===player)result.push(...ray);
  } return result;
}
export function legal(s:State, player=s.turn):number[] {
  if(s.winner) return [];
  if(s.kind==='four')return Array.from({length:7},(_,i)=>i).filter(i=>s.board[i]===0);
  return s.board.flatMap((v,i)=>v===0&&(s.kind!=='reversi'||flips(s,i,player).length)?[i]:[]);
}
function line(s:State):number[] {
  const [w,h]=shape(s.kind),need=s.kind==='tris'?3:4;
  for(let i=0;i<s.board.length;i++)if(s.board[i])for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){
    const cells:number[]=[];for(let n=0;n<need;n++){
      const x=i%w+dx*n,y=Math.floor(i/w)+dy*n;
      if(x<0||x>=w||y<0||y>=h||s.board[y*w+x]!==s.board[i])break;cells.push(y*w+x);
    }if(cells.length===need)return cells;
  }return [];
}
export function move(s:State,at:number):State|null {
  if(!Number.isInteger(at)||!legal(s).includes(at))return null;
  const n:State={...s,board:[...s.board],moves:[...s.moves,at],turn:(3-s.turn) as Player,passed:false,line:[]};
  let cell=at;if(s.kind==='four'){for(let r=5;r>=0;r--)if(!s.board[r*7+at]){cell=r*7+at;break;}}
  if(s.kind==='reversi')for(const i of flips(s,at))n.board[i]=s.turn;
  n.board[cell]=s.turn;n.last=cell;
  if(s.kind==='reversi'){
    if(!legal(n).length){n.turn=s.turn;n.passed=true;if(!legal(n).length){
      const count=n.board.reduce((a,v)=>a+(v===1?1:v===2?-1:0),0);n.winner=count>0?1:count<0?2:3;
    }}
  }else{n.line=line(n);if(n.line.length)n.winner=s.turn;else if(!legal(n).length)n.winner=3;}
  return n;
}
export function replay(kind:Kind,moves:unknown):State|null {
  if(!Array.isArray(moves)||moves.length>64)return null;
  let s=initial(kind);for(const at of moves){const n=move(s,at);if(!n)return null;s=n;}return s;
}
export function undo(s:State,solo:boolean):State {
  let length=s.moves.length-1;
  if(solo)while(length>0&&replay(s.kind,s.moves.slice(0,length))!.turn!==1)length--;
  return replay(s.kind,s.moves.slice(0,Math.max(0,length)))!;
}
function score(s:State,p:Player):number {
  if(s.winner)return s.winner===3?0:s.winner===p?100000+s.board.filter(v=>!v).length:-100000-s.board.filter(v=>!v).length;
  if(s.kind==='tris')return 0;
  if(s.kind==='four'){
    let total=0;
    for(let i=0;i<42;i++)for(const [dx,dy]of [[1,0],[0,1],[1,1],[-1,1]]){
      let own=0,other=0,valid=true;for(let j=0;j<4;j++){
        const x=i%7+dx*j,y=Math.floor(i/7)+dy*j;if(x<0||x>=7||y>=6){valid=false;break;}
        own+=s.board[y*7+x]===p?1:0;other+=s.board[y*7+x]===3-p?1:0;
      }if(valid){if(!other)total+=[0,1,8,90,10000][own];if(!own)total-=[0,1,8,110,10000][other];}
    }return total;
  }
  let sum=0;for(let i=0;i<64;i++)if(s.board[i]){
    const x=i%8,y=Math.floor(i/8),edge=x===0||x===7||y===0||y===7;
    const corner=(x===0||x===7)&&(y===0||y===7),near=(x===1||x===6)&&(y===1||y===6);
    sum+=(s.board[i]===p?1:-1)*(corner?140:near?-30:edge?12:1);
  }return sum+8*(legal(s,p).length-legal(s,(3-p)as Player).length);
}
export function choose(s:State):number {
  const p=s.turn,depth=s.kind==='tris'?9:3;
  function search(n:State,d:number,alpha:number,beta:number):number {
    if(!d||n.winner)return score(n,p);
    const max=n.turn===p;let value=max?-Infinity:Infinity;
    for(const at of legal(n)){
      const v=search(move(n,at)!,d-1,alpha,beta);value=max?Math.max(value,v):Math.min(value,v);
      if(max)alpha=Math.max(alpha,value);else beta=Math.min(beta,value);if(beta<=alpha)break;
    }return value;
  }
  const choices=legal(s).sort((a,b)=>s.kind==='four'?Math.abs(a-3)-Math.abs(b-3):a-b);
  let best=-Infinity,at=choices[0]??-1;
  for(const i of choices){const v=search(move(s,i)!,depth-1,-Infinity,Infinity);if(v>best){best=v;at=i;}}
  return at;
}

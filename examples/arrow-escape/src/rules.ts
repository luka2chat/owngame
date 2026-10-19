export type Cell={x:number;y:number};
export type Arrow={id:number;cells:Cell[];dir:number};
export type Board={level:number;size:number;arrows:Arrow[]};
export const dirs=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];
export const COUNT=36;
export const key=(c:Cell)=>c.x+','+c.y;
export function blocker(board:Board,ids:number[],id:number):number|null{
 const a=board.arrows[id];if(!a||!ids.includes(id))return null;
 const occupied=new Map<string,number>();for(const other of ids)if(other!==id)for(const c of board.arrows[other].cells)occupied.set(key(c),other);
 const d=dirs[a.dir],head=a.cells.at(-1)!;let x=head.x+d.x,y=head.y+d.y;
 while(x>=0&&y>=0&&x<board.size&&y<board.size){const hit=occupied.get(key({x,y}));if(hit!==undefined)return hit;x+=d.x;y+=d.y;}
 return null;
}
export function available(board:Board,ids:number[]){return ids.filter(id=>blocker(board,ids,id)===null);}
function makeRandom(seed:number){let state=seed>>>0||1;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};}
export function generate(level:number):Board{
 if(!Number.isInteger(level)||level<0||level>=COUNT)throw Error('Unknown level');
 const tier=Math.floor(level/9),size=level<3?6:8+tier*2,target=level<3?5+level*2:12+tier*8+(level%9);
 const rand=makeRandom(Math.imul(level+7,1597334677)^0x74617272),arrows:Arrow[]=[],occupied=new Set<string>();
 const board={level,size,arrows};
 for(let i=0;i<target;i++){
  let best:Arrow|null=null,score=-Infinity;
  for(let attempt=0;attempt<100;attempt++){
   const dir=Math.floor(rand()*4),d=dirs[dir],head={x:Math.floor(rand()*size),y:Math.floor(rand()*size)};
   if(occupied.has(key(head)))continue;
   const ray=new Set<string>();let x=head.x+d.x,y=head.y+d.y,clear=true;
   while(x>=0&&y>=0&&x<size&&y<size){const k=key({x,y});if(occupied.has(k)){clear=false;break;}ray.add(k);x+=d.x;y+=d.y;}
   if(!clear)continue;
   const cells=[head],used=new Set([key(head)]),length=2+Math.floor(rand()*(level<2?2:4+tier));let direction=(dir+2)%4,turns=0;
   for(let j=1;j<length;j++){
    const turn=level>1&&j>1&&rand()<.45;
    if(turn){direction=(direction+(rand()<.5?1:3))%4;turns++;}
    const prev=cells.at(-1)!,step=dirs[direction],next={x:prev.x+step.x,y:prev.y+step.y},k=key(next);
    if(next.x<0||next.y<0||next.x>=size||next.y>=size||occupied.has(k)||used.has(k)||ray.has(k))break;
    cells.push(next);used.add(k);
   }
   if(cells.length<2)continue;
   const candidate={id:i,cells:cells.reverse(),dir};
   const temporary:Board={level,size,arrows:[...arrows,candidate]},ids=temporary.arrows.map(a=>a.id);
   const blocks=arrows.filter(a=>blocker(temporary,ids,a.id)===i).length;
   const merit=blocks*9+cells.length*.15+turns*.2+rand()*2;
   if(merit>score){score=merit;best=candidate;}
  }
  if(!best)break;
  for(const c of best.cells)occupied.add(key(c));arrows.push(best);
 }
 return board;
}
export type Checkpoint={ids:number[];hearts:number;moves:number;hints:number};
export type Progress={schema:1;level:number;unlocked:number;stars:number[];sound:boolean;current:Checkpoint|null};
export const fresh=(board:Board):Checkpoint=>({ids:board.arrows.map(a=>a.id),hearts:3,moves:0,hints:0});
export function parseSave(raw:string|null):Progress{
 const fallback:Progress={schema:1,level:0,unlocked:0,stars:Array(COUNT).fill(0),sound:true,current:null};
 try{
  const s=JSON.parse(raw||'null');if(s?.schema!==1)return fallback;
  const validLevel=(n:unknown):n is number=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<COUNT;
  if(!validLevel(s.unlocked)||!validLevel(s.level)||s.level>s.unlocked)return fallback;
  const p:Progress={schema:1,level:s.level,unlocked:s.unlocked,stars:Array.from({length:COUNT},(_,i)=>[1,2,3].includes(s.stars?.[i])?s.stars[i]:0),sound:s.sound!==false,current:null};
  const c=s.current,board=generate(p.level);
  if(c&&Array.isArray(c.ids)&&c.ids.length>0&&c.ids.length<=board.arrows.length&&new Set(c.ids).size===c.ids.length&&c.ids.every((id:unknown)=>Number.isInteger(id)&&Number(id)>=0&&Number(id)<board.arrows.length)&&Number.isInteger(c.hearts)&&c.hearts>0&&c.hearts<=3&&Number.isInteger(c.moves)&&c.moves>=0&&c.moves<100000&&Number.isInteger(c.hints)&&c.hints>=0&&c.hints<100000){
   // Removed arrows must form a legal extraction sequence, not just valid IDs.
   let remaining=board.arrows.map(a=>a.id);const removed=remaining.filter(id=>!c.ids.includes(id));
   while(removed.length){const index=removed.findIndex(id=>blocker(board,remaining,id)===null);if(index<0)return p;const id=removed.splice(index,1)[0];remaining=remaining.filter(n=>n!==id);}
   p.current={ids:[...c.ids],hearts:c.hearts,moves:c.moves,hints:c.hints};
  }
  return p;
 }catch{return fallback;}
}

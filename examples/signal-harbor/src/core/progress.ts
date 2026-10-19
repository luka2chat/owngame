import { State, Board, LEVELS, start, boardKey, transfer, won, capacities, copyBoard } from './rules';
export const SAVE_KEY = 'owngame.signal-harbor.v2';
// Content identity includes order and rules; incompatible saves are backed up by the UI.
export const CONTENT_ID = 'single-light-two-berths-v1:' + LEVELS.map(l=>[l.capacity,l.buoys,l.par,boardKey(l.board)].join(':')).join(';');
export type Progress = { version: 2; content: string; current: State; best: Record<string,number>; reduced: boolean };
export const freshProgress = (): Progress => ({version:2,content:CONTENT_ID,current:start(0),best:{},reduced:false});
export function decodeProgress(raw: string | null): Progress | null {
  if(!raw)return freshProgress();
  try {
    const p=JSON.parse(raw), s=p.current;
    if(p.version!==2||p.content!==CONTENT_ID||!s||!Number.isInteger(s.level)||s.level<0||s.level>=LEVELS.length||!Array.isArray(s.history)||s.moves!==s.history.length||typeof p.reduced!=='boolean'||!p.best||typeof p.best!=='object'||Array.isArray(p.best))return null;
    const caps=capacities(s.level);
    const valid=(b:unknown): b is Board => Array.isArray(b)&&b.length===caps.length&&b.every((stack,i)=>Array.isArray(stack)&&stack.length<=caps[i]&&stack.every(c=>c==='A'||c==='B'||c==='C'));
    if(!valid(s.board)||!s.history.every(valid))return null;
    let check=start(s.level);
    if(s.history.length && boardKey(s.history[0])!==boardKey(check.board))return null;
    if(!s.history.length && boardKey(s.board)!==boardKey(check.board))return null;
    // Validate each edge without repeatedly copying the entire history on load.
    for(const b of s.history.length ? [...s.history.slice(1),s.board] : []){
      const changed=check.board.map((stack,i)=>stack.join('')!==b[i].join('')?i:-1).filter(i=>i>=0);
      if(changed.length!==2)return null;
      const from=changed.find(i=>check.board[i].length===b[i].length+1),to=changed.find(i=>check.board[i].length===b[i].length-1);
      if(from===undefined||to===undefined)return null;
      const next=transfer(check,from,to);
      if(next.error||boardKey(next.state.board)!==boardKey(b))return null;
      check={...next.state,history:[]};
    }
    const best:Record<string,number>={};
    for(const [k,v] of Object.entries(p.best))if(/^(0|[1-9]\d*)$/.test(k)&&Number(k)<LEVELS.length&&Number.isSafeInteger(v)&&Number(v)>=LEVELS[Number(k)].par)best[k]=Number(v);
    return {version:2,content:CONTENT_ID,current:{...check,moves:s.moves,history:s.history.map(copyBoard)},best,reduced:p.reduced};
  } catch { return null; }
}
export function recordWin(p: Progress, state: State): Progress {
  if(!won(state.board,state.level))return {...p,current:state};
  return {...p,current:state,best:{...p.best,[state.level]:Math.min(p.best[state.level]??Infinity,state.moves)}};
}

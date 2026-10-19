/** Immutable single-light sorting rules. Stacks are bottom-to-top. */
import { LEVEL_DATA } from './levels';
export type Signal = 'A' | 'B' | 'C';
export type Board = Signal[][];
export type State = { board: Board; history: Board[]; moves: number; level: number };
export type Level = { name: string; chapter: number; capacity: number; buoys: number; board: Board; par: number; solution: number[][] };
export const LEVELS = LEVEL_DATA as unknown as readonly Level[];
export const CHAPTERS = ['初灯港', '双泊湾', '深潮灯域'];
export const LESSONS = ['借一个泊位，让顶灯先归位', '双泊轮换，为底灯留一条路', '先想底层，再安排靠岸次序'];
export const TARGETS: Signal[] = ['A', 'B', 'C'];
export const copyBoard = (b: Board): Board => b.map(s => [...s]);
export const capacities = (level: number): number[] => [LEVELS[level].capacity, LEVELS[level].capacity, LEVELS[level].capacity, ...Array(LEVELS[level].buoys).fill(2)];
export const start = (level: number): State => ({ board: copyBoard(LEVELS[level].board), history: [], moves: 0, level });
export function rejection(b: Board, from: number, to: number, level = 0): string | null {
  const caps = capacities(level);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= caps.length || to >= caps.length) return '请选择灯塔或泊位';
  if (from === to) return '请换一个落点';
  if (!b[from].length) return '这里还是空的，先选一盏顶灯';
  if (b[to].length >= caps[to]) return to >= 3 ? '泊位已满，只能停两盏灯' : '灯塔已满，先留一个空位';
  if (b[to].length && b[to][b[to].length - 1] !== b[from][b[from].length - 1]) return '只能叠在相同图案上，或放入空位';
  return null;
}
export function transfer(state: State, from: number, to: number): { state: State; error: string | null } {
  const error = rejection(state.board, from, to, state.level);
  if (error) return { state, error };
  const board = copyBoard(state.board);
  board[to].push(board[from].pop()!);
  return { state: { board, history: [...state.history, copyBoard(state.board)], moves: state.moves + 1, level: state.level }, error: null };
}
export function undo(state: State): State {
  if (!state.history.length) return state;
  return { ...state, board: copyBoard(state.history[state.history.length - 1]), history: state.history.slice(0, -1), moves: state.moves - 1 };
}
export function won(board: Board, level = 0): boolean {
  return board.slice(3).every(s => s.length === 0) && TARGETS.every((color, i) => board[i].length === LEVELS[level].capacity && board[i].every(s => s === color));
}
export const boardKey = (b: Board): string => b.map(s => s.join('')).join('|');
// A* with an admissible lower bound: displaced lights move once; a correct light
// above a wrong light must leave and return. Work yields so hints never freeze input.
export async function solve(board: Board, level: number, limit = 100000): Promise<{path: number[][] | null; status: 'solved' | 'dead-end' | 'limit'; visited: number}> {
  const caps = capacities(level), goal = TARGETS.map(c=>c.repeat(LEVELS[level].capacity)).concat(Array(LEVELS[level].buoys).fill('')).join('|');
  type Entry = { k: string; g: number; f: number; parent: Entry | null; move: number[] | null };
  const heuristic = (b: string[]) => b.reduce((n,s,i) => {
    let prefix = 0; if(i<3)while(s[prefix] === TARGETS[i])prefix++;
    for(let j=prefix;j<s.length;j++)n += i<3 && s[j]===TARGETS[i] ? 2 : 1;
    return n;
  }, 0);
  const heap: Entry[] = [];
  const push = (e: Entry) => {heap.push(e);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=e.f)break;heap[i]=heap[p];i=p;}heap[i]=e;};
  const pop = (): Entry => {const top=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};
  const initial=boardKey(board), seen=new Map([[initial,0]]);
  push({k:initial,g:0,f:heuristic(initial.split('|')),parent:null,move:null});
  let visited=0;
  while(heap.length && visited<limit){
    const e=pop();if(seen.get(e.k)!==e.g)continue;
    if(e.k===goal){const path:number[][]=[];let n=e;while(n.parent){path.push(n.move!);n=n.parent;}return {path:path.reverse(),status:'solved',visited};}
    visited++;if(visited%512===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
    const b=e.k.split('|');
    for(let a=0;a<b.length;a++)for(let z=0;z<b.length;z++){
      const c=b[a].slice(-1);if(a===z||!c||b[z].length>=caps[z]||(b[z]&&!b[z].endsWith(c)))continue;
      const next=[...b];next[a]=b[a].slice(0,-1);next[z]+=c;const k=next.join('|'),g=e.g+1;
      if((seen.get(k)??Infinity)<=g)continue;seen.set(k,g);push({k,g,f:g+heuristic(next),parent:e,move:[a,z]});
    }
  }
  return {path:null,status:heap.length?'limit':'dead-end',visited};
}

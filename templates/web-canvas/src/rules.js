export const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function initial() { return { moves: [] }; }
export function position(state) {
  const board = Array(9).fill(null);
  state.moves.forEach((cell, i) => { board[cell] = i % 2 === 0 ? 'star' : 'moon'; });
  const line = lines.find(([a,b,c]) => board[a] && board[a] === board[b] && board[b] === board[c]);
  return { board, winner: line ? board[line[0]] : null, line: line ?? [], draw: !line && state.moves.length === 9, turn: state.moves.length % 2 === 0 ? 'star' : 'moon' };
}
export function play(state, cell) {
  const p = position(state);
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || p.board[cell] || p.winner || p.draw) return state;
  return { moves: [...state.moves, cell] };
}
export function undo(state) { return { moves: state.moves.slice(0, -1) }; }
export function restore(raw) {
  const saved = JSON.parse(raw);
  if (saved?.schema !== 1 || !Array.isArray(saved.moves) || saved.moves.length > 9) throw Error('Unsupported save');
  let state = initial();
  for (const cell of saved.moves) {
    const next = play(state, cell);
    if (next === state) throw Error('Illegal saved move');
    state = next;
  }
  return state;
}
export function serialize(state) { return JSON.stringify({ schema: 1, moves: state.moves }); }

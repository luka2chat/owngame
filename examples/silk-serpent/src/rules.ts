export type Difficulty = 0 | 1 | 2;
export type Direction = 0 | 1 | 2 | 3; // right, up, left, down
export type Cell = { x: number; y: number };
export const CONFIG = [
  { width: 13, height: 21, baseSpeed: 5, foods: 3, avoidEdge: Math.fround(.8) },
  { width: 15, height: 23, baseSpeed: 7.5, foods: 2, avoidEdge: Math.fround(.4) },
  { width: 15, height: 23, baseSpeed: 10, foods: 2, avoidEdge: 0 },
] as const;
export const SPEED_MULTIPLIER = 1.0500000715255737;
export const INITIAL_LENGTH = 4;
export const COMBO_MS = 1600;
export interface State {
  schema: 1; difficulty: Difficulty; seed: number; rng: number;
  body: Cell[]; food: Cell[]; direction: Direction; queue: Direction[];
  pending: number; earned: number; eaten: number; combo: number;
  lastEatTick: number; ticks: number; status: 'alive' | 'crashed' | 'filled';
  crash: Cell | null;
}
const VECTORS: Cell[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const distance = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const speed = (d: Difficulty) => Math.fround(CONFIG[d].baseSpeed * SPEED_MULTIPLIER);
export const stepMs = (d: Difficulty) => 1000 / speed(d);
export const inside = (p: Cell, d: Difficulty) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < CONFIG[d].width && p.y >= 0 && p.y < CONFIG[d].height;
export const isEdge = (p: Cell, d: Difficulty) => p.x === 0 || p.y === 0 || p.x === CONFIG[d].width - 1 || p.y === CONFIG[d].height - 1;
export function random(s: { rng: number }): number {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
const clone = (s: State): State => ({ ...s, body: s.body.map(p => ({ ...p })), food: s.food.map(p => ({ ...p })), queue: [...s.queue], crash: s.crash && { ...s.crash } });
/** Bounded rejection follows the reference's placement preferences. A dense-board
 * fallback prevents an endless loop; it never places food on occupied cells. */
export function replenish(s: State): void {
  const c = CONFIG[s.difficulty];
  const free = () => {
    const cells: Cell[] = [];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const p = { x, y };
      if (!s.body.some(b => same(b, p)) && !s.food.some(f => same(f, p))) cells.push(p);
    }
    return cells;
  };
  while (s.food.length < c.foods) {
    const available = free();
    if (!available.length) break;
    let chosen: Cell | null = null;
    for (let attempt = 0; attempt < 2048; attempt++) {
      const p = { x: Math.floor(random(s) * c.width), y: Math.floor(random(s) * c.height) };
      if (isEdge(p, s.difficulty) && random(s) < c.avoidEdge) continue;
      if (s.body.some(b => same(b, p)) || s.food.some(f => same(f, p))) continue;
      if (attempt < 4 && s.food.some(f => distance(f, p) <= 1)) continue;
      chosen = p; break;
    }
    s.food.push(chosen ?? available[Math.floor(random(s) * available.length)]);
  }
}
export function initial(seed: number, difficulty: Difficulty = 0): State {
  const c = CONFIG[difficulty], head = { x: Math.floor(c.width / 2), y: Math.floor(c.height / 2) };
  const s: State = { schema: 1, difficulty, seed: seed >>> 0, rng: seed >>> 0,
    body: Array.from({ length: INITIAL_LENGTH }, (_, i) => ({ x: head.x - i, y: head.y })),
    food: [], direction: 0, queue: [], pending: 0, earned: 0, eaten: 0, combo: 0,
    lastEatTick: -1, ticks: 0, status: 'alive', crash: null };
  replenish(s); return s;
}
/** Immediate input acknowledgement, execution at the next movement boundary. */
export function turn(s: State, d: Direction): State | null {
  if (s.status !== 'alive' || ![0, 1, 2, 3].includes(d) || s.queue.length >= 2) return null;
  const last = s.queue.at(-1) ?? s.direction;
  if (last === d || (last + 2) % 4 === d) return null;
  const n = clone(s); n.queue.push(d); return n;
}
export function step(s: State): State {
  if (s.status !== 'alive') return s;
  const n = clone(s), d = n.queue.shift();
  if (d !== undefined) n.direction = d;
  n.ticks++;
  const v = VECTORS[n.direction], head = { x: n.body[0].x + v.x, y: n.body[0].y + v.y };
  const growing = n.pending > 0;
  // The tail vacates its cell on ordinary moves; during growth it stays occupied.
  const occupied = growing ? n.body : n.body.slice(0, -1);
  if (!inside(head, n.difficulty) || occupied.some(p => same(p, head))) {
    n.status = 'crashed'; n.crash = head; n.queue = []; return n;
  }
  n.body.unshift(head);
  if (growing) n.pending--; else n.body.pop();
  const found = n.food.findIndex(p => same(p, head));
  if (found >= 0) {
    n.food.splice(found, 1);
    const chained = n.lastEatTick >= 0 && (n.ticks - n.lastEatTick) * stepMs(n.difficulty) < COMBO_MS;
    n.combo = chained ? n.combo + 1 : 0;
    const gain = 2 + n.combo;
    n.pending += gain; n.earned += gain; n.eaten++; n.lastEatTick = n.ticks;
  }
  const c = CONFIG[n.difficulty];
  if (n.body.length === c.width * c.height) {
    n.status = 'filled'; n.food = []; n.queue = [];
  } else replenish(n);
  return n;
}
/** Simulation time is local active time. A long frame suspends instead of
 * catching up a hidden tab into a death. The UI must show an explicit resume. */
export function advance(s: State, carryMs: number, dtMs: number, paused: boolean): { state: State; carryMs: number; suspended: boolean } {
  if (paused || s.status !== 'alive') return { state: s, carryMs, suspended: false };
  if (!Number.isFinite(dtMs) || dtMs < 0 || dtMs > 250) return { state: s, carryMs, suspended: true };
  let n = s, carry = carryMs + dtMs;
  const period = stepMs(n.difficulty);
  while (carry + 1e-9 >= period && n.status === 'alive') { n = step(n); carry -= period; }
  return { state: n, carryMs: n.status === 'alive' ? Math.max(0, carry) : 0, suspended: false };
}
function checksum(text: string): string {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  return (n >>> 0).toString(16).padStart(8, '0');
}
export function encode(s: State): string {
  const payload = JSON.stringify(s);
  return JSON.stringify({ schema: 1, payload, checksum: checksum(payload) });
}
/** Structural validation + accidental corruption detection, not anti-cheat. */
export function restore(text: string): State | null {
  try {
    if (typeof text !== 'string' || text.length > 100000) return null;
    const envelope = JSON.parse(text);
    if (envelope.schema !== 1 || typeof envelope.payload !== 'string' || checksum(envelope.payload) !== envelope.checksum) return null;
    const s = JSON.parse(envelope.payload) as State;
    if (s.schema !== 1 || ![0, 1, 2].includes(s.difficulty) || ![0, 1, 2, 3].includes(s.direction) || !['alive', 'crashed', 'filled'].includes(s.status)) return null;
    const c = CONFIG[s.difficulty], area = c.width * c.height;
    for (const key of ['seed', 'rng', 'ticks', 'pending', 'earned', 'eaten', 'combo'] as const)
      if (!Number.isSafeInteger(s[key]) || s[key] < 0) return null;
    if (s.seed > 0xffffffff || s.rng > 0xffffffff || s.combo > Math.max(0, s.eaten - 1) || s.eaten > s.ticks || s.pending > s.earned) return null;
    if (s.earned < 2 * s.eaten || s.earned > 2 * s.eaten + s.eaten * (s.eaten - 1) / 2) return null;
    if (!Number.isSafeInteger(s.lastEatTick) || s.lastEatTick < -1 || s.lastEatTick > s.ticks || (s.eaten === 0) !== (s.lastEatTick === -1)) return null;
    if (!Array.isArray(s.body) || s.body.length < 4 || s.body.length > area || !Array.isArray(s.food) || s.food.length > c.foods || !Array.isArray(s.queue) || s.queue.length > 2) return null;
    if (s.body.length + s.pending !== INITIAL_LENGTH + s.earned) return null;
    const keys = new Set<string>();
    for (const p of [...s.body, ...s.food]) {
      if (!p || !inside(p, s.difficulty)) return null;
      const k = `${p.x},${p.y}`; if (keys.has(k)) return null; keys.add(k);
    }
    for (let i = 1; i < s.body.length; i++) if (distance(s.body[i - 1], s.body[i]) !== 1) return null;
    let d = s.direction;
    for (const q of s.queue) { if (![0, 1, 2, 3].includes(q) || q === d || q === (d + 2) % 4) return null; d = q; }
    if (s.status === 'filled' && (s.body.length !== area || s.food.length || s.queue.length || s.crash !== null)) return null;
    if (s.status === 'alive' && (s.body.length === area || s.food.length !== Math.min(c.foods, area - s.body.length) || s.crash !== null)) return null;
    if (s.status === 'crashed') {
      if (s.food.length !== Math.min(c.foods, area - s.body.length)) return null;
      if (!s.crash || !Number.isInteger(s.crash.x) || !Number.isInteger(s.crash.y) || distance(s.crash, s.body[0]) !== 1 || s.queue.length) return null;
      const v = VECTORS[s.direction];
      if (s.crash.x !== s.body[0].x + v.x || s.crash.y !== s.body[0].y + v.y) return null;
      const occupied = s.pending ? s.body : s.body.slice(0, -1);
      if (inside(s.crash, s.difficulty) && !occupied.some(p => same(p, s.crash!))) return null;
    }
    return clone(s);
  } catch { return null; }
}

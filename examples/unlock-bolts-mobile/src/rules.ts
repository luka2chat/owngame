/** Pure rules, versioned against design:unlock-bolts@1. Arrays are bottom-to-top. */
export type Board = Record<string, string[]>;
export type Level = {
  id: string;
  title: string;
  subtitle: string;
  capacity: number;
  target: string;
  extra: string;
  bolts: Board;
};
export type State = {
  bolts: Board;
  locked: string[];
  steps: number;
  won: boolean;
  unlocks: number;
};
export type Move = {
  accepted: boolean;
  reason: string;
  state: State;
  moved: number;
  unlocked: boolean;
  won: boolean;
};
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function isWon(
  bolts: Board,
  capacity: number,
  locked: string[],
): boolean {
  return Object.entries(bolts).every(([id, nuts]) =>
    locked.includes(id)
      ? nuts.length === 0
      : nuts.length === 0 ||
        (nuts.length === capacity && nuts.every((c) => c === nuts[0])),
  );
}
export function initialState(level: Level): State {
  return {
    bolts: copy(level.bolts),
    locked: [level.extra],
    steps: 0,
    won: false,
    unlocks: 0,
  };
}
export function validateLevel(level: Level): void {
  if (
    !Number.isInteger(level.capacity) ||
    level.capacity < 2 ||
    level.capacity > 5
  )
    throw new Error("Invalid capacity");
  if (!level.bolts[level.extra] || level.bolts[level.extra].length)
    throw new Error("Extra bolt must exist and start empty");
  const open = Object.entries(level.bolts).filter(([id]) => id !== level.extra);
  if (!open.some(([, b]) => b.length === 0))
    throw new Error("An open empty bolt is required");
  if (!open.some(([, b]) => b.includes(level.target)))
    throw new Error("Target color absent");
  if (
    open.some(
      ([, b]) =>
        b.length === level.capacity && b.every((c) => c === level.target),
    )
  )
    throw new Error("Target already complete");
  const counts: Record<string, number> = {};
  for (const b of Object.values(level.bolts)) {
    if (b.length > level.capacity) throw new Error("Overflow");
    for (const c of b) counts[c] = (counts[c] ?? 0) + 1;
  }
  if (Object.values(counts).some((n) => n % level.capacity !== 0))
    throw new Error("Color count cannot form full bolts");
}
export function pour(
  level: Level,
  before: State,
  from: string,
  to: string,
): Move {
  const reject = (reason: string): Move => ({
    accepted: false,
    reason,
    state: before,
    moved: 0,
    unlocked: false,
    won: false,
  });
  if (before.won) return reject("won");
  if (!Object.hasOwn(before.bolts, from) || !Object.hasOwn(before.bolts, to))
    return reject("unknown-bolt");
  if (from === to) return reject("same-bolt");
  if (before.locked.includes(from) || before.locked.includes(to))
    return reject("locked");
  const a = before.bolts[from],
    b = before.bolts[to];
  if (!a.length) return reject("empty-source");
  if (b.length >= level.capacity) return reject("full-target");
  const color = a[a.length - 1];
  if (b.length && b[b.length - 1] !== color) return reject("color-mismatch");
  let run = 1;
  while (run < a.length && a[a.length - 1 - run] === color) run++;
  const moved = Math.min(run, level.capacity - b.length),
    state = copy(before);
  state.bolts[to].push(...state.bolts[from].splice(-moved));
  state.steps++;
  const unlocked =
    state.locked.includes(level.extra) &&
    Object.entries(state.bolts).some(
      ([id, n]) =>
        id !== level.extra &&
        n.length === level.capacity &&
        n.every((c) => c === level.target),
    );
  if (unlocked) {
    state.locked = [];
    state.unlocks++;
  }
  state.won = isWon(state.bolts, level.capacity, state.locked);
  return {
    accepted: true,
    reason: "moved",
    state,
    moved,
    unlocked,
    won: state.won && !before.won,
  };
}
export class Session {
  state: State;
  history: State[] = [];
  constructor(public level: Level) {
    this.state = initialState(level);
  }
  move(from: string, to: string) {
    const move = pour(this.level, this.state, from, to);
    if (move.accepted) {
      this.history.push(copy(this.state));
      this.state = move.state;
    }
    return move;
  }
  undo() {
    if (!this.history.length) return false;
    this.state = this.history.pop()!;
    return true;
  }
  reset() {
    this.state = initialState(this.level);
    this.history = [];
  }
}

import { Session, Level, copy } from "./rules";
export type Action =
  | { type: "bolt"; id: string }
  | { type: "undo" }
  | { type: "reset" }
  | { type: "level"; index: number };
/** Owns animation exclusion. Completion callbacks may release a token, never write rule state. */
export class Controller {
  session: Session;
  index = 0;
  selected: string | null = null;
  busy = false;
  token = 0;
  deadline = 0;
  inputCount = 0;
  rejectedBusy = 0;
  timeouts = 0;
  staleCompletions = 0;
  feedback = "Choose a bolt, then its destination.";
  lastAction = "ready";
  events: { action: string; token: number; steps: number; reason?: string }[] =
    [];
  constructor(
    public levels: Level[],
    public animationMs = 280,
    public timeoutMs = 900,
  ) {
    this.session = new Session(levels[0]);
  }
  dispatch(action: Action, time: number) {
    this.inputCount++;
    if (this.busy) {
      this.rejectedBusy++;
      this.log("rejected", "busy");
      return { accepted: false, reason: "busy" };
    }
    if (action.type === "level") {
      if (!Number.isInteger(action.index) || !this.levels[action.index])
        return { accepted: false, reason: "unknown-level" };
      this.index = action.index;
      this.session = new Session(this.levels[this.index]);
      this.selected = null;
      this.token++;
      this.feedback = "Choose a bolt, then its destination.";
      this.log("level");
      return { accepted: true, reason: "level" };
    }
    if (action.type === "reset") {
      this.session.reset();
      this.selected = null;
      this.token++;
      this.feedback = "A fresh start. Every move is reversible.";
      this.log("reset");
      return { accepted: true, reason: "reset" };
    }
    if (action.type === "undo") {
      const accepted = this.session.undo();
      this.selected = null;
      this.token++;
      this.feedback = accepted
        ? "One move back. Locks restored, too."
        : "No moves to undo yet.";
      this.log("undo");
      return { accepted, reason: "undo" };
    }
    const state = this.session.state;
    if (state.won) {
      this.feedback = "Complete! Choose another level, undo, or restart.";
      this.log("rejected", "won");
      return { accepted: false, reason: "won" };
    }
    if (this.selected === null) {
      if (state.locked.includes(action.id) || !state.bolts[action.id]?.length) {
        const reason = state.locked.includes(action.id)
          ? "locked"
          : "empty-source";
        this.feedback =
          reason === "locked"
            ? "Complete the target color to open this bolt."
            : "Choose a bolt with nuts on it.";
        this.log("rejected", reason);
        return { accepted: false, reason };
      }
      this.selected = action.id;
      this.feedback = "Tap an empty bolt or the same top color.";
      this.log("select");
      return { accepted: true, reason: "selected" };
    }
    if (this.selected === action.id) {
      this.selected = null;
      this.feedback = "Selection cancelled.";
      this.log("cancel");
      return { accepted: true, reason: "cancelled" };
    }
    const from = this.selected,
      move = this.session.move(from, action.id);
    if (!move.accepted) {
      this.feedback =
        move.reason === "locked"
          ? "That bolt is locked. Complete the target color first."
          : move.reason === "full-target"
            ? "That bolt is full. Try another destination."
            : "Top colors must match. Try an empty bolt.";
      this.log("rejected", move.reason);
      return { accepted: false, reason: move.reason };
    }
    this.selected = null;
    this.busy = true;
    this.token++;
    this.deadline = time + this.timeoutMs;
    this.feedback = move.won
      ? "Beautifully sorted."
      : move.unlocked
        ? "Unlocked! The extra space is yours."
        : `Moved ${move.moved} ${move.moved === 1 ? "nut" : "nuts"}.`;
    this.log("move");
    if (move.unlocked) this.log("unlock");
    if (move.won) this.log("win");
    return {
      accepted: true,
      reason: "moved",
      token: this.token,
      from,
      to: action.id,
      moved: move.moved,
    };
  }
  complete(token: number) {
    if (!this.busy || token !== this.token) {
      this.staleCompletions++;
      this.log("ignored-animation-callback");
      return false;
    }
    this.busy = false;
    this.log("animation-complete");
    return true;
  }
  tick(time: number) {
    if (this.busy && time >= this.deadline) {
      this.busy = false;
      this.token++;
      this.timeouts++;
      this.log("animation-timeout");
      return true;
    }
    return false;
  }
  private log(action: string, reason?: string) {
    this.lastAction = action;
    this.events.push({
      action,
      token: this.token,
      steps: this.session.state.steps,
      ...(reason ? { reason } : {}),
    });
    if (this.events.length > 160) this.events.shift();
  }
  snapshot() {
    return copy({
      levelId: this.session.level.id,
      index: this.index,
      state: this.session.state,
      history: this.session.history,
      selected: this.selected,
      busy: this.busy,
      token: this.token,
      inputCount: this.inputCount,
      rejectedBusy: this.rejectedBusy,
      timeouts: this.timeouts,
      staleCompletions: this.staleCompletions,
      feedback: this.feedback,
      lastAction: this.lastAction,
      events: this.events,
    });
  }
}

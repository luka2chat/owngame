import Phaser from "phaser";
import { Controller, Action } from "./controller";
import { copy } from "./rules";
import { LEVELS } from "./levels";
import { load, save, SAVE_KEY, Pair } from "./storage";
import { fitLayout, Box } from "./layout";
import { WorkshopScene, Transfer } from "./scene";
declare const __SOURCE_SHA__: string;
declare global {
  interface Window {
    OwngameFeedback?: { tap: () => void };
  }
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const restored = load(() => localStorage);
const controller: Controller = restored.controller;
let moves: Pair[] = restored.moves,
  completed = restored.completed,
  notice = restored.notice,
  writable = restored.writable;
let ready = false,
  scene: WorkshopScene | null = null,
  modal = false,
  inputCount = 0,
  layoutEpoch = 0,
  lastReason = "",
  animation: ReturnType<typeof setTimeout> | undefined;
const registered = new Map<
  string,
  { element: HTMLButtonElement; action: () => void }
>();
const bolts: HTMLButtonElement[] = [],
  levelButtons: HTMLButtonElement[] = [];
let layout = fitLayout(
  innerWidth,
  innerHeight,
  0,
  0,
  Object.keys(controller.session.state.bolts).length,
  controller.session.level.capacity,
);
function box(element: HTMLElement, b: Box) {
  Object.assign(element.style, {
    left: b.x + "px",
    top: b.y + "px",
    width: b.w + "px",
    height: b.h + "px",
  });
}
function resize() {
  const r = $("viewport").getBoundingClientRect();
  if (!r.width || !r.height) return;
  layoutEpoch++;
  layout = fitLayout(
    r.width,
    r.height,
    r.top,
    r.left,
    Object.keys(controller.session.state.bolts).length,
    controller.session.level.capacity,
  );
  box($("subtitle"), layout.subtitle);
  box(document.querySelector("h1")!, layout.title);
  box($("goal"), layout.goal);
  box($("feedback"), layout.footer);
  levelButtons.forEach((b, i) => box(b, layout.levels[i]));
  for (const id of ["undo", "reset", "next"] as const)
    box($(id), layout.controls[id]);
  box($("progress"), layout.controls.next);
  bolts.forEach((b, i) => box(b, layout.bolts[i]));
  scene?.setLayout(layout);
  render();
}
function bind(element: HTMLButtonElement, id: string, action: () => void) {
  element.dataset.target = id;
  registered.set(id, { element, action });
  let start: { x: number; y: number; id: number; epoch: number } | null = null;
  const clear = () => {
    start = null;
    element.classList.remove("pressed");
  };
  element.addEventListener("pointerdown", (e) => {
    if (element.disabled || !ready || e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, epoch: layoutEpoch };
    element.setPointerCapture(e.pointerId);
    element.classList.add("pressed");
  });
  element.addEventListener("pointermove", (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12)
      clear();
  });
  element.addEventListener("pointercancel", clear);
  element.addEventListener("lostpointercapture", clear);
  element.addEventListener("pointerup", (e) => {
    const p = start;
    clear();
    if (
      !p ||
      p.id !== e.pointerId ||
      p.epoch !== layoutEpoch ||
      Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12 ||
      element.disabled
    )
      return;
    inputCount++;
    action();
  });
  element.addEventListener("click", (e) => {
    e.preventDefault();
    if (e.detail === 0 && !element.disabled && ready) {
      inputCount++;
      action();
    }
  });
}
function persist() {
  if (writable && !save(() => localStorage, controller, moves, completed)) {
    writable = false;
    notice = "存储暂不可用，本局仍可游玩";
  }
}
function render(transition?: Transfer) {
  const state = controller.session.state;
  $("subtitle").textContent =
    "— " +
    ["初见", "留一点空间", "备用钥匙", "解开回路", "最后的拼图"][
      controller.index
    ] +
    " —";
  $("goal").textContent = state.won
    ? "整理完成 · 每一色都恰到好处"
    : state.locked.length
      ? "集齐一柱红色，解锁 E"
      : "备用螺栓已解锁 · 继续整理";
  const error: Record<string, string> = {
    locked: "先集齐红色，解锁备用螺栓",
    "full-target": "这根已满，试试空位",
    "color-mismatch": "只能移到空柱或同色螺帽上",
    "empty-source": "先选有螺帽的一柱",
  };
  const message = !writable
    ? notice
    : state.won
      ? "整理完成，做得漂亮"
      : error[lastReason] ||
        (controller.selected
          ? `已选 ${controller.selected} · 点空柱或同色螺帽`
          : notice || "先点一柱，再点目标位置");
  $("feedback").textContent = state.steps + " 步 · " + message;
  $("progress").textContent = `${controller.index + 1} / 5`;
  $("progress").hidden = state.won;
  $("next").hidden = !state.won;
  $<HTMLButtonElement>("next").disabled = controller.busy;
  $("next").textContent = controller.index === 4 ? "再玩" : "下一关";
  $<HTMLButtonElement>("undo").disabled =
    !controller.session.history.length || controller.busy;
  $<HTMLButtonElement>("reset").disabled = controller.busy;
  levelButtons.forEach((b, i) => {
    b.setAttribute("aria-current", String(i === controller.index));
    b.disabled = controller.busy;
    b.setAttribute(
      "aria-label",
      `第${i + 1}关${completed.includes(LEVELS[i].id) ? "，已完成" : ""}`,
    );
  });
  const names: Record<string, string> = {
    R: "红",
    B: "蓝",
    G: "绿",
    Y: "黄",
    P: "紫",
  };
  Object.entries(state.bolts).forEach(([id, pile], i) => {
    const b = bolts[i];
    if (!b) return;
    b.setAttribute(
      "aria-label",
      `${id}柱，${state.locked.includes(id) ? "待解锁" : pile.length ? "从下到上 " + pile.map((c) => names[c]).join("、") : "空柱"}${controller.selected === id ? "，已选中" : ""}`,
    );
    b.setAttribute("aria-pressed", String(controller.selected === id));
    b.disabled = controller.busy || state.won;
  });
  scene?.renderState(
    state,
    controller.selected,
    controller.session.level.capacity,
    transition,
  );
}
function rebuildBolts() {
  bolts.forEach((b) => {
    registered.delete(b.dataset.target!);
    b.remove();
  });
  bolts.length = 0;
  for (const id of Object.keys(controller.session.state.bolts)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bolt";
    $("board-input").append(b);
    bolts.push(b);
    bind(b, "bolt-" + id, () => dispatch({ type: "bolt", id }));
  }
}
function dispatch(action: Action) {
  if (!ready || modal) return;
  const before = copy(controller.session.state),
    from = controller.selected;
  const outcome = controller.dispatch(action, Date.now());
  if (outcome.reason === "busy") return;
  lastReason = outcome.reason;
  if (writable) notice = "";
  if (["selected", "moved", "undo", "reset"].includes(outcome.reason))
    try {
      window.OwngameFeedback?.tap();
    } catch {}
  if (outcome.reason === "moved") {
    const result = outcome as { to: string; moved: number };
    moves.push([from!, result.to]);
    if (
      controller.session.state.won &&
      !completed.includes(controller.session.level.id)
    )
      completed.push(controller.session.level.id);
    persist();
    render({ from: from!, to: result.to, moved: result.moved, before });
    const token = controller.token;
    clearTimeout(animation);
    animation = setTimeout(() => {
      controller.complete(token);
      render();
    }, controller.animationMs);
  } else {
    if (action.type === "undo" && outcome.accepted) moves.pop();
    if (action.type === "reset" || action.type === "level") {
      moves = [];
      rebuildBolts();
      resize();
    }
    if (["undo", "reset", "level"].includes(outcome.reason)) persist();
    render();
  }
}
function closeModal() {
  modal = false;
  $("modal").hidden = true;
  $("play").inert = false;
  $("reset").focus({ preventScroll: true });
  render();
}
LEVELS.forEach((_, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "level plaque";
  b.textContent = String(i + 1);
  $("levels").append(b);
  levelButtons.push(b);
  bind(b, "level-" + i, () => dispatch({ type: "level", index: i }));
});
bind($("undo"), "undo", () => dispatch({ type: "undo" }));
bind($("reset"), "reset", () => {
  if (controller.busy) return;
  if (!controller.session.history.length) {
    dispatch({ type: "reset" });
    return;
  }
  modal = true;
  $("play").inert = true;
  $("modal").hidden = false;
  $("cancel").focus({ preventScroll: true });
});
bind($("next"), "next", () =>
  dispatch({ type: "level", index: (controller.index + 1) % 5 }),
);
bind($("cancel"), "cancel", closeModal);
bind($("confirm"), "confirm", () => {
  closeModal();
  dispatch({ type: "reset" });
});
$("retry").addEventListener("click", () => location.reload());
document.addEventListener("keydown", (e) => {
  if (!modal) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeModal();
  }
  if (e.key === "Tab") {
    e.preventDefault();
    (document.activeElement === $("cancel")
      ? $("confirm")
      : $("cancel")
    ).focus();
  }
});
new ResizeObserver(resize).observe($("viewport"));
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    persist();
    if (controller.busy) {
      clearTimeout(animation);
      controller.complete(controller.token);
      render();
    }
  }
});
window.addEventListener("pagehide", persist);
rebuildBolts();
resize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "scene",
  width: innerWidth * Math.min(devicePixelRatio || 1, 2),
  height: innerHeight * Math.min(devicePixelRatio || 1, 2),
  transparent: true,
  banner: false,
  audio: { noAudio: true },
  input: { mouse: false, touch: false, keyboard: false },
  render: { antialias: true },
  scale: { mode: Phaser.Scale.NONE },
  scene: new WorkshopScene(
    (s) => {
      scene = s;
      resize();
      ready = true;
      $("loading").hidden = true;
      render();
    },
    () => {
      ready = false;
      $("loading").querySelector("p")!.textContent =
        "工坊素材加载失败，请重新打开";
      $("retry").hidden = false;
    },
  ),
});
const api = Object.freeze({
  snapshot: () =>
    JSON.parse(
      JSON.stringify({
        ready,
        id: "unlock-bolts-mobile",
        projectId: "owngame-unlock-bolts",
        engine: "phaser",
        phaserVersion: Phaser.VERSION,
        source_sha256: __SOURCE_SHA__,
        artDirection: "A-original-enamel-workshop",
        ...controller.snapshot(),
        rendered: copy(controller.session.state),
        inputCount,
        modal,
        saveKey: SAVE_KEY,
        saveSchema: 1,
        saveWritable: writable,
        completed,
        notice,
        layout: {
          ...layout,
          viewport: (() => {
            const r = $("viewport").getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          })(),
          screen: { w: innerWidth, h: innerHeight },
        },
        targets: Array.from(registered, ([id, { element }]) => {
          const r = element.getBoundingClientRect();
          return {
            id,
            css: { x: r.x, y: r.y, w: r.width, h: r.height },
            enabled:
              !element.disabled &&
              !element.hidden &&
              (!modal
                ? !["cancel", "confirm"].includes(id)
                : ["cancel", "confirm"].includes(id)),
            label: element.getAttribute("aria-label") || element.textContent,
          };
        }).filter((t) => t.enabled && t.css.w > 0),
      }),
    ),
});
for (const name of ["__owngameBolts", "__owngame"])
  Object.defineProperty(window, name, {
    value: api,
    writable: false,
    configurable: false,
  });
void game;

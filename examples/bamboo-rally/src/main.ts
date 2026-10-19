import Phaser from "phaser";
import {
  initial,
  control,
  release,
  advance,
  Difficulty,
  Player,
} from "./rules";
import { load, persist, SAVE_KEY } from "./storage";
import { fitLayout, screenPoint, worldPoint } from "./layout";
import { RallyScene } from "./rally-scene";
declare const __SOURCE_SHA__: string;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const frame = $("frame"),
  play = $("play"),
  modal = $("modal"),
  court = $("court"),
  NAMES = ["拂风", "穿林", "追影"];
const storage = () => window.localStorage,
  restored = load(storage);
let state = restored.state,
  simple = restored.simple,
  muted = restored.muted,
  wins = restored.wins,
  counted = restored.counted;
let notice = restored.notice,
  saveError = restored.blocked,
  paused = true,
  ready = false,
  modalKind = "",
  carry = 0,
  lastSave = 0, lastFrame = 0;
let pendingD: Difficulty = state.difficulty,
  pendingMode: "bot" | "duo" = state.mode,
  scene: RallyScene | null = null;
let layout = fitLayout(720, 1280),
  epoch = 0,
  inputs = 0,
  accepted = 0,
  rejected = 0,
  returnFocus: HTMLElement | null = null;
const pointers = new Map<number, Player>(),
  heldKeys = new Set<string>();
let audio: AudioContext | null = null;
function save() {
  saveError = !persist(
    storage,
    state,
    { simple, muted, wins, counted },
    restored.blocked,
  );
}
function clearInput() {
  pointers.clear();
  heldKeys.clear();
  release(state);
}
function resize() {
  const r = $("viewport").getBoundingClientRect();
  if (!r.width || !r.height) return;
  if (ready && !paused) pause("画面已调整 · 点继续回珠");
  else clearInput();
  layout = fitLayout(r.width, r.height);
  epoch++;
  frame.style.left = layout.left + "px";
  frame.style.top = layout.top + "px";
  frame.style.height = layout.height + "px";
  frame.style.transform = `scale(${layout.scale})`;
  frame.style.setProperty("--control-height", layout.controlHeight + "px");
  court.style.top = layout.playTop + "px";
  court.style.height = layout.playBottom - layout.playTop + "px";
  $("status").style.top = layout.statusTop + "px";
  document.querySelector("nav")!.style.top = layout.buttonTop + "px";
  scene?.setLayout(layout);
  render();
}
function unlock() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {}
}
function sound(freq: number) {
  if (muted || !audio) return;
  try {
    const t = audio.currentTime,
      o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g);
    g.connect(audio.destination);
    o.start(t);
    o.stop(t + 0.1);
  } catch {}
}
function pause(message = "已暂停 · 点继续回珠") {
  paused = true;
  clearInput();
  carry = 0;
  notice = message;
  save();
  if (ready && !modalKind) openModal("pause");
  else render();
}
function resume() {
  if (!ready || state.winner !== null) return;
  unlock();
  closeModal();
  paused = false;
  carry = 0;
  notice = "";
  render();
  lastFrame = performance.now();
}
function bind(button: HTMLButtonElement, id: string, action: () => void) {
  button.dataset.target = id;
  let start: { id: number; x: number; y: number; epoch: number } | null = null;
  const clear = () => {
    start = null;
    button.classList.remove("pressed");
  };
  button.addEventListener("pointerdown", (e) => {
    if (!ready || button.disabled || e.button !== 0) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, epoch };
    button.setPointerCapture(e.pointerId);
    button.classList.add("pressed");
  });
  button.addEventListener("pointermove", (e) => {
    if (
      start &&
      Math.hypot(e.clientX - start.x, e.clientY - start.y) > 18 * layout.scale
    )
      clear();
  });
  button.addEventListener("pointercancel", clear);
  button.addEventListener("lostpointercapture", clear);
  button.addEventListener("pointerup", (e) => {
    const a = start;
    clear();
    if (
      a &&
      a.id === e.pointerId &&
      a.epoch === epoch &&
      Math.hypot(e.clientX - a.x, e.clientY - a.y) <= 18 * layout.scale &&
      !button.disabled
    ) {
      inputs++;
      action();
    }
  });
  button.addEventListener("click", (e) => {
    e.preventDefault();
    if (e.detail === 0 && ready && !button.disabled) {
      inputs++;
      action();
    }
  });
}
function dialogButton(
  id: string,
  label: string,
  action: () => void,
  classes = "",
) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "paper " + classes;
  b.textContent = label;
  $("dialog-actions").append(b);
  bind(b, id, action);
  return b;
}
function closeModal() {
  modalKind = "";
  modal.hidden = true;
  play.inert = false;
  returnFocus?.focus({ preventScroll: true });
}
function openModal(kind: string) {
  if (!ready) return;
  if (!modalKind) returnFocus = document.activeElement as HTMLElement;
  paused = true;
  clearInput();
  carry = 0;
  modalKind = kind;
  modal.hidden = false;
  play.inert = true;
  $("dialog-actions").replaceChildren();
  $("dialog-body").replaceChildren();
  if (kind === "pause") {
    $("dialog-title").textContent =
      state.winner !== null
        ? state.winner === 0
          ? "好一记回珠"
          : "再来一局，慢慢找到节奏"
        : state.ticks
          ? "庭间小憩"
          : "拖动球拍，接住回珠";
    $("dialog-body").innerHTML =
      state.winner !== null
        ? `<p>最终比分 ${state.score[0]} : ${state.score[1]}</p>`
        : "<p>手指可落在己方任意位置<br>向前推拍加速，横扫带旋转</p>";
    dialogButton(
      "start",
      state.winner !== null
        ? "再来一局"
        : state.ticks
          ? "继续回珠"
          : "开始回珠",
      () => (state.winner !== null ? newGame() : resume()),
    );
    dialogButton("pause-settings", "玩法与设置", openMenu);
  } else if (kind === "menu") {
    $("dialog-title").textContent = "庭间小憩";
    $("dialog-body").innerHTML =
      '<p class="quiet">改变难度或模式，在确认后新开一局</p>';
    NAMES.forEach((n, d) =>
      dialogButton(
        "difficulty-" + d,
        n,
        () => {
          pendingD = d as Difficulty;
          pendingMode = "bot";
          openModal("menu");
        },
        "third" + (pendingMode === "bot" && pendingD === d ? " selected" : ""),
      ),
    );
    dialogButton(
      "bot",
      "单人陪练",
      () => {
        pendingMode = "bot";
        openModal("menu");
      },
      "half" + (pendingMode === "bot" ? " selected" : ""),
    );
    dialogButton(
      "duo",
      "同屏对拍",
      () => {
        pendingMode = "duo";
        openModal("menu");
      },
      "half" + (pendingMode === "duo" ? " selected" : ""),
    );
    dialogButton("new", "按此设置新开一局", () => openModal("confirm"));
    dialogButton("help", "玩法说明", () => openModal("help"));
    dialogButton(
      "simple",
      "简动：" + (simple ? "开" : "关"),
      () => {
        simple = !simple;
        save();
        openModal("menu");
      },
      "half",
    );
    dialogButton(
      "sound",
      "声音：" + (muted ? "关" : "开"),
      () => {
        muted = !muted;
        unlock();
        save();
        openModal("menu");
      },
      "half",
    );
    dialogButton("return", "返回当前对局", () => openModal("pause"));
    const p = document.createElement("p");
    p.className = "quiet";
    p.textContent = `累计${state.mode === "duo" ? "完成" : "胜出"} ${wins[state.mode === "duo" ? 3 : state.difficulty]} 局`;
    $("dialog-actions").append(p);
  } else if (kind === "confirm") {
    $("dialog-title").textContent = "另开一局？";
    $("dialog-body").innerHTML =
      `<p>${pendingMode === "bot" ? NAMES[pendingD] + "陪练" : "同屏对拍"}</p><p class="quiet">确认后替换当前对局，累计成绩保留。</p>`;
    dialogButton("cancel", "保留当前对局", () => openModal("menu"));
    dialogButton("confirm", "确认新开一局", newGame);
  } else {
    $("dialog-title").textContent = "回珠小笺";
    $("dialog-body").innerHTML =
      '<div class="help-lines"><p>在己方半场拖动，球拍跟随手指。<br>不必先点中球拍；双人各拖各的半场。</p><p>向前推拍加快回珠，横扫改变球路。<br>来珠须先落台，再用球拍回击。</p><p>回珠落台后，对手漏接由你得分。<br>回珠没有落台，由对手得分。</p><p>先得7分结束，每两分轮换发球。<br>方向键 / WASD 可移动下方球拍。</p><p>后台、重开应用和长停顿会暂停。<br>进度自动保存，简动与静音不改规则。</p></div>';
    dialogButton("close", "回到设置", () => openModal("menu"));
  }
  render();
  $("dialog-actions").querySelector("button")?.focus({ preventScroll: true });
}
function openMenu() {
  pendingD = state.difficulty;
  pendingMode = state.mode;
  save();
  openModal("menu");
}
function newGame() {
  clearInput();
  state = initial(Date.now(), pendingD, pendingMode);
  counted = false;
  paused = true;
  carry = 0;
  notice = "新局已备好";
  save();
  openModal("pause");
}
function render() {
  const score = `${state.mode === "bot" ? "你" : "竹拍"} ${state.score[0]} : ${state.score[1]} ${state.mode === "bot" ? "陪练" : "青拍"}`;
  if ($("score").textContent !== score) $("score").textContent = score;
  const mode = `先得7分 · ${state.mode === "bot" ? NAMES[state.difficulty] + "陪练" : "同屏对拍"}`;
  if ($("mode").textContent !== mode) $("mode").textContent = mode;
  const status =
    state.phase === "finished"
      ? state.winner === 0
        ? "竹拍胜出"
        : "青拍胜出"
      : state.phase === "point"
        ? `${state.lastPoint === 0 ? "竹拍" : "青拍"}得分 · 即将发球`
        : state.phase === "serve"
          ? `${state.server === 0 ? "竹拍" : "青拍"}发球 · 向前轻推球拍`
          : "拖动接珠 · 横扫带旋转";
  const message = saveError ? "无法保存，请保持本页打开" : notice || status;
  if ($("status").textContent !== message) $("status").textContent = message;
  $("status").classList.toggle("error", saveError);
  $("dialog-error").textContent = saveError ? "无法保存，请保持本页打开" : "";
  $("pause").textContent = paused ? "继续" : "暂停";
  scene?.renderState(state, paused, simple);
}
function step(_phaserDelta: number) {
  const now = performance.now(), dt = lastFrame ? now - lastFrame : 0;
  lastFrame = now;
  if (!ready) return;
  if (!paused && !modalKind) {
    if (heldKeys.size) {
      const p = state.paddles[0],
        dx =
          Number(heldKeys.has("arrowright") || heldKeys.has("d")) -
          Number(heldKeys.has("arrowleft") || heldKeys.has("a")),
        dz =
          Number(heldKeys.has("arrowup") || heldKeys.has("w")) -
          Number(heldKeys.has("arrowdown") || heldKeys.has("s"));
      if (control(state, 0, p.x + dx * 0.9, p.z + dz * 0.9)) accepted++;
    }
    const hits = state.hits,
      points = state.points,
      result = advance(state, carry, dt);
    carry = result.carry;
    if (result.suspended) {
      pause("运行停顿，已暂停 · 点继续");
      return;
    }
    if (state.hits > hits) sound(520);
    if (state.points > points) {
      sound(state.lastPoint === 0 ? 820 : 330);
      save();
    }
    if (state.winner !== null) {
      if (!counted) {
        if (state.mode === "duo" || state.winner === 0)
          wins[state.mode === "duo" ? 3 : state.difficulty]++;
        counted = true;
      }
      pause("");
    }
    if (performance.now() - lastSave > 1000) {
      save();
      lastSave = performance.now();
    }
  }
  render();
}
function point(e: PointerEvent) {
  const r = frame.getBoundingClientRect();
  return worldPoint(
    layout,
    (e.clientX - r.x) / layout.scale,
    (e.clientY - r.y) / layout.scale,
  );
}
function drag(e: PointerEvent) {
  const p = pointers.get(e.pointerId);
  if (p === undefined || paused || modalKind) return;
  const v = point(e);
  if (control(state, p, v.x, v.z)) accepted++;
  else rejected++;
}
court.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  inputs++;
  if (paused || modalKind) {
    rejected++;
    return;
  }
  const v = point(e),
    p: Player = v.z < 0 ? 0 : 1;
  if ((p === 1 && state.mode === "bot") || [...pointers.values()].includes(p)) {
    rejected++;
    return;
  }
  pointers.set(e.pointerId, p);
  court.setPointerCapture(e.pointerId);
  drag(e);
  e.preventDefault();
});
court.addEventListener("pointermove", (e) => {
  drag(e);
  e.preventDefault();
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  court.addEventListener(type, (e) => {
    const p = pointers.get((e as PointerEvent).pointerId);
    if (p !== undefined) {
      release(state, p);
      pointers.delete((e as PointerEvent).pointerId);
      save();
    }
  });
bind($<HTMLButtonElement>("pause"), "pause", () =>
  paused ? resume() : pause(),
);
bind($<HTMLButtonElement>("menu"), "menu", openMenu);
$("retry").addEventListener("click", () => location.reload());
window.addEventListener("keydown", (e) => {
  if (modalKind) {
    if (e.key === "Escape") {
      e.preventDefault();
      openModal(
        modalKind === "help" || modalKind === "confirm" ? "menu" : "pause",
      );
    }
    if (e.key === "Tab") {
      const buttons = [...$("dialog-actions").querySelectorAll("button")];
      if (buttons.length) {
        e.preventDefault();
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[
          (at + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length
        ].focus();
      }
    }
    return;
  }
  if (
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "w",
      "a",
      "s",
      "d",
      "W",
      "A",
      "S",
      "D",
    ].includes(e.key)
  ) {
    e.preventDefault();
    heldKeys.add(e.key.toLowerCase());
    if (!e.repeat) inputs++;
  } else if (["Space", "Escape"].includes(e.code) && !e.repeat) {
    e.preventDefault();
    paused ? resume() : pause();
  }
});
window.addEventListener("keyup", (e) => {
  heldKeys.delete(e.key.toLowerCase());
  if (!heldKeys.size) release(state, 0);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause("已暂停 · 回来后点继续");
});
window.addEventListener("blur", () => pause("已暂停 · 点继续回珠"));
window.addEventListener("pagehide", () => pause());
resize();
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
new ResizeObserver(resize).observe($("viewport"));
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "scene",
  width: 720,
  height: layout.height,
  transparent: true,
  banner: false,
  scale: { mode: Phaser.Scale.NONE },
  audio: { noAudio: true },
  render: { antialias: true, roundPixels: false },
  input: { mouse: false, touch: false, keyboard: false },
  scene: new RallyScene(
    (s) => {
      scene = s;
      scene.setLayout(layout);
      ready = true;
      $("loading").hidden = true;
      openModal("pause");
    },
    (message) => {
      ready = false;
      $("loading").querySelector("p")!.textContent = message;
      $("retry").hidden = false;
    },
    step,
  ),
});
Object.defineProperty(window, "__owngameRally", {
  configurable: false,
  writable: false,
  value: Object.freeze({
    snapshot: () =>
      JSON.parse(
        JSON.stringify({
          id: "bamboo-rally",
          engine: "phaser",
          phaserVersion: Phaser.VERSION,
          source_sha256: __SOURCE_SHA__,
          ready,
          state,
          paused,
          carry,
          simple,
          muted,
          wins,
          counted,
          modal: modalKind,
          notice,
          saveError,
          inputCount: inputs,
          accepted,
          rejected,
          pointers: pointers.size,
          saveKey: SAVE_KEY,
          artVersion: "B-initial-web-v01",
          design: { width: layout.width, height: layout.height },
          geometry: layout,
          layout: {
            frame: rect(frame),
            viewport: rect($("viewport")),
            court: rect(court),
            title: rect(document.querySelector("h1")!),
            table: layout.table,
          },
          renderer: game.renderer?.type === Phaser.WEBGL ? "webgl" : "canvas",
          actors: state.paddles.map((p) => screenPoint(layout, p.x, p.z)),
          targets: [
            ...document.querySelectorAll<HTMLButtonElement>(
              "button[data-target]",
            ),
          ]
            .filter(
              (e) =>
                !e.disabled &&
                !e.closest("[hidden]") &&
                (modalKind ? !!e.closest("#modal") : !e.closest("#modal")),
            )
            .map((e) => ({
              id: e.dataset.target,
              css: rect(e),
              enabled: true,
            })),
        }),
      ),
  }),
});
function rect(e: Element) {
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

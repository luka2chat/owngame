// Production paper-art game: original Canvas renderer, TypeScript source.
import { initial, move, legal, undo, replay, choose } from "./rules";
import { fitLayout } from "./layout";
declare const __SOURCE_SHA__: string;
const W = 720,
  STEP = 88,
  KEY = "owngame:board:firefly-four:v1";
const INK = "#fff0bf",
  MUTED = "#bdcce7",
  AMBER = "#ffd375",
  JADE = "#a0edd3",
  NAMES = ["", "琥珀", "青瓷"];
const canvas = document.querySelector("canvas"),
  ctx = canvas.getContext("2d"),
  images: Record<string, HTMLImageElement> = {};
const frame = document.getElementById("frame"),
  viewport = document.getElementById("viewport"),
  controls = document.getElementById("controls");
let H = 1280,
  layout = fitLayout({ x: 0, y: 0, width: 720, height: 1280 }),
  layoutEpoch = 0;
const buttons = new Map<string, HTMLButtonElement>();
let state = initial("four"),
  solo = true,
  simple = matchMedia("(prefers-reduced-motion: reduce)").matches,
  modal = "",
  pending = "",
  notice = "",
  saveError = false,
  ready = false;
let targets: any[] = [],
  previewColumn = -1,
  inputs = 0,
  busyUntil = 0,
  botTimer = 0,
  drop: any = null,
  press: any = null,
  raf = 0;
const errors = [];
const crops: Record<string, number[]> = {
  amber: [0.055, 0.105, 0.4, 0.43],
  jade: [0.54, 0.105, 0.4, 0.43],
  goldButton: [0.018, 0.685, 0.474, 0.18],
  blueButton: [0.505, 0.685, 0.474, 0.18],
};
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const d = JSON.parse(raw),
      s = replay("four", d.moves);
    if (
      d.schema !== 1 ||
      d.kind !== "four" ||
      typeof d.solo !== "boolean" ||
      typeof d.simple !== "boolean" ||
      !s
    )
      throw Error("Invalid save");
    state = s;
    solo = d.solo;
    simple = d.simple;
  }
} catch {
  notice = "存档异常，已保留备份并开始新局";
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) localStorage.setItem(KEY + ":backup", raw);
  } catch {
    saveError = true;
  }
}
const save = () => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        schema: 1,
        kind: "four",
        solo,
        simple,
        moves: state.moves,
      }),
    );
    saveError = false;
  } catch {
    saveError = true;
  }
};
const busy = () => performance.now() < busyUntil;
const point = (i: number) => ({
  x: 360 + ((i % 7) - 3) * STEP,
  y: layout.boardY + (2.5 - Math.floor(i / 7)) * layout.rowStep,
});
function resize() {
  cancelPress();
  layoutEpoch++;
  const r = viewport.getBoundingClientRect();
  if (!r.width || !r.height) return;
  layout = fitLayout({ x: r.x, y: r.y, width: r.width, height: r.height });
  H = layout.height;
  frame.style.left = layout.left + "px";
  frame.style.top = layout.top + "px";
  frame.style.width = W + "px";
  frame.style.height = H + "px";
  frame.style.transform = `scale(${layout.scale})`;
  const pixelScale = layout.scale * Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * pixelScale);
  canvas.height = Math.round(H * pixelScale);
  render();
}
function box(x, y, w, h, fill, r = 18, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x - w / 2, H - y - h / 2, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function text(s, x, y, w, size = 30, color = INK, serif = false) {
  const family = serif
    ? '"Kaiti SC",STKaiti,"Noto Serif CJK SC",serif'
    : '"PingFang SC","Noto Sans CJK SC",sans-serif';
  ctx.font = `${size}px ${family}`;
  while (ctx.measureText(s).width > w && size > 14) {
    size--;
    ctx.font = `${size}px ${family}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, H - y);
}
function picture(key, x, y, w, h, alpha = 1) {
  const image = images[key] || images.atlas;
  if (!image) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const crop = crops[key];
  if (crop) {
    const [sx, sy, sw, sh] = crop;
    ctx.drawImage(
      image,
      sx * image.width,
      sy * image.height,
      sw * image.width,
      sh * image.height,
      x - w / 2,
      H - y - h / 2,
      w,
      h,
    );
  } else ctx.drawImage(image, x - w / 2, H - y - h / 2, w, h);
  ctx.restore();
}
function circle(x, y, r, fill, stroke = null, width = 1) {
  ctx.beginPath();
  ctx.arc(x, H - y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function glow(x, y, r, color) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.shadowBlur = 15;
  ctx.shadowColor = color;
  circle(x, y, r, color);
  ctx.restore();
}
function target(id, x, y, w, h, action, column = -1) {
  targets.push({ id, x, y, w, h, action, column });
}
function button(id, label, x, y, w, action, gold = false, active = true) {
  ctx.save();
  if (!active) ctx.globalAlpha = 0.55;
  if (press?.target.id === id && !simple) {
    ctx.translate(x, H - y);
    ctx.scale(0.97, 0.97);
    ctx.translate(-x, -(H - y));
  }
  picture(gold ? "goldButton" : "blueButton", x, y, w, 96);
  text(label, x, y + 2, w - 24, 31, gold ? "#342418" : INK, true);
  ctx.restore();
  target(id, x, y, w, layout.controlHeight, action);
}
function scheduleBot() {
  clearTimeout(botTimer);
  botTimer = 0;
  if (
    ready &&
    solo &&
    state.turn === 2 &&
    !state.winner &&
    !modal &&
    !document.hidden
  ) {
    botTimer = setTimeout(
      () => {
        botTimer = 0;
        if (
          !document.hidden &&
          solo &&
          state.turn === 2 &&
          !state.winner &&
          !modal
        )
          play(choose(state), true);
      },
      Math.max(0, busyUntil - performance.now()) + 120,
    );
  }
}
function reset() {
  clearTimeout(botTimer);
  botTimer = 0;
  if (pending === "mode") solo = !solo;
  state = initial("four");
  modal = "";
  pending = "";
  notice = "";
  busyUntil = 0;
  drop = null;
  previewColumn = -1;
  save();
  render();
}
function confirm(action) {
  if (modal || busy()) return;
  pending = action;
  if (state.moves.length && !state.winner) {
    modal = "confirm";
    scheduleBot();
    render();
  } else reset();
}
function play(at, bot = false) {
  if (!ready || modal || busy() || (!bot && solo && state.turn === 2)) return;
  const next = move(state, at);
  previewColumn = -1;
  if (!next) {
    notice = state.winner
      ? "本局已结束，可以开始新一局"
      : "这一列已满，换一列试试";
    render();
    return;
  }
  state = next;
  notice = "";
  busyUntil = simple ? 0 : performance.now() + 160;
  drop = simple ? null : { index: state.last, start: performance.now() };
  save();
  render();
  scheduleBot();
}
function render() {
  cancelAnimationFrame(raf);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.clearRect(0, 0, W, H);
  targets = [];
  if (!ready) return;
  picture(
    "title",
    layout.titleX,
    layout.titleY,
    layout.titleWidth,
    layout.titleHeight,
  );
  if (layout.subtitle)
    text("竹亭夜色  ·  四灯成线", 360, layout.subtitleY, 540, 21, MUTED);
  box(360, layout.scoreY, 480, 62, "#14213de0", 30, "#bd9e61");
  picture("amber", 164, layout.scoreY, 36, 42);
  picture("jade", 407, layout.scoreY, 36, 42);
  text(
    `琥珀 ${state.board.filter((v) => v === 1).length}`,
    264,
    layout.scoreY,
    150,
    30,
    AMBER,
    true,
  );
  text(
    `青瓷 ${state.board.filter((v) => v === 2).length}`,
    505,
    layout.scoreY,
    150,
    30,
    JADE,
    true,
  );
  picture("board", 360, layout.boardY, 720, layout.boardHeight);
  for (let i = 0; i < 42; i++) {
    const p = point(i);
    circle(p.x, p.y - 1, layout.radius + 1, "#47608d");
    circle(p.x, p.y + 1, layout.radius, "#101c33");
    circle(p.x, p.y - 3, layout.radius - 4, "#14223d");
    ctx.beginPath();
    ctx.arc(p.x, H - p.y, layout.radius - 2, Math.PI, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#080f2396";
    ctx.stroke();
  }
  if (state.line.length) {
    const a = point(state.line[0]),
      b = point(state.line.at(-1));
    for (const [width, alpha] of [
      [17, 0.1],
      [9, 0.26],
      [3, 1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(a.x, H - a.y);
      ctx.lineTo(b.x, H - b.y);
      ctx.strokeStyle = state.winner === 1 ? AMBER : JADE;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  let animating = false;
  for (let i = 0; i < 42; i++)
    if (state.board[i]) {
      const p = point(i),
        v = state.board[i],
        won = state.line.includes(i);
      let y = p.y;
      if (drop && drop.index === i && !simple) {
        const t = Math.min(1, (performance.now() - drop.start) / 160),
          from = point(i % 7).y + 40;
        y = from + (p.y - from) * t * t;
        animating = t < 1;
        if (!animating) drop = null;
      }
      if (won) glow(p.x, y, layout.radius - 2, v === 1 ? AMBER : JADE);
      picture(
        v === 1 ? "amber" : "jade",
        p.x,
        y,
        layout.radius * 2,
        (layout.radius * 2 * 80) / 73,
      );
      if (i === state.last || won)
        circle(
          p.x,
          y,
          layout.radius + 2,
          null,
          won ? "#ffe8a0" : v === 1 ? AMBER : JADE,
          won ? 2 : 1.5,
        );
    }
  for (let c = 0; c < 7; c++)
    target(
      "col-" + c,
      point(c).x,
      layout.boardY,
      STEP,
      layout.rowStep * 6,
      () => play(c),
      c,
    );
  if (previewColumn >= 0) {
    const c = previewColumn,
      color = state.turn === 1 ? AMBER : JADE,
      x = point(c).x;
    box(x, layout.boardY, STEP - 8, layout.rowStep * 6 - 4, color + "25", 30);
    let at = c;
    for (let r = 5; r >= 0; r--)
      if (!state.board[r * 7 + c]) {
        at = r * 7 + c;
        break;
      }
    const p = point(at);
    circle(p.x, p.y, layout.radius - 2, null, color, 3);
    picture(
      state.turn === 1 ? "amber" : "jade",
      p.x,
      p.y,
      layout.radius * 1.9,
      layout.radius * 2.08,
      0.45,
    );
  }
  const won = state.winner > 0,
    result =
      state.winner === 3
        ? "灯火相映 · 本局和棋"
        : won
          ? NAMES[state.winner] + "获胜"
          : NAMES[state.turn] +
            (solo && state.turn === 2 ? " · 陪练思考中" : "落子 · Ⅱ");
  box(
    360,
    312,
    540,
    72,
    won ? "#453325eb" : "#15213ceb",
    23,
    won ? "#f2c973" : "#7889b0",
  );
  text(
    result,
    360,
    314,
    500,
    won ? 39 : 32,
    won ? INK : state.turn === 1 ? AMBER : JADE,
    true,
  );
  if (!won)
    target("pause", 360, 312, 540, layout.controlHeight, () => {
      if (busy() || modal) return;
      modal = "pause";
      scheduleBot();
      render();
    });
  button(
    "undo",
    "悔一步",
    130,
    210,
    204,
    () => {
      if (modal || busy()) return;
      if (!state.moves.length) {
        notice = "还没有落子";
        render();
        return;
      }
      clearTimeout(botTimer);
      botTimer = 0;
      state = undo(state, solo);
      drop = null;
      notice = "已退回上一回合";
      save();
      render();
      scheduleBot();
    },
    false,
    !!state.moves.length,
  );
  button("new", "新一局", 360, 210, 224, () => confirm("new"), true);
  button("help", "玩法", 590, 210, 204, () => {
    if (!modal && !busy()) {
      modal = "help";
      scheduleBot();
      render();
    }
  });
  button("mode", solo ? "单人陪练 ↔" : "同屏双人 ↔", 190, 112, 304, () =>
    confirm("mode"),
  );
  button("simple", simple ? "简动：开" : "简动：关", 530, 112, 304, () => {
    if (modal || busy()) return;
    simple = !simple;
    drop = null;
    save();
    render();
  });
  text(
    saveError
      ? "存储不可用，本局暂时无法保存"
      : notice ||
          (won
            ? "再点一盏，开启下一局"
            : `第 ${state.moves.length + 1} 手 · 按住一列预览，滑开取消`),
    360,
    32,
    668,
    21,
    MUTED,
  );
  if (modal) {
    targets = [];
    box(360, H / 2, W, H, "#080f21d7", 0);
    box(360, H / 2 + 10, 644, 880, "#1c2d50", 32, "#c6a769");
    text(
      modal === "help"
        ? "竹亭里的四盏灯"
        : modal === "pause"
          ? "竹亭小憩"
          : "开启新的棋局？",
      360,
      H / 2 + 360,
      590,
      46,
      INK,
      true,
    );
    if (modal === "help") {
      const lines = [
        "点按任意一列，灯珠落到最下方空位。",
        "横、竖或斜向连成四盏同色灯，即获胜。",
        "按住一列可预览，滑开手指取消。",
        "单人陪练由你先手；双人模式轮流操作。",
        "每手自动保存，悔一步可退回上一回合。",
        "简动模式关闭落子动画。没有倒计时。",
      ];
      lines.forEach((s, i) =>
        text(s, 360, H / 2 + 239 - i * 83, 562, 27, i < 2 ? INK : MUTED),
      );
      button(
        "close",
        "知道了，继续",
        360,
        H / 2 - 335,
        540,
        () => {
          modal = "";
          render();
          scheduleBot();
        },
        true,
      );
    } else if (modal === "pause") {
      text("灯火替你守着这一局。", 360, H / 2 + 120, 550, 32);
      text("回来时，从这里继续。", 360, H / 2 + 55, 550, 29, MUTED);
      button(
        "resume",
        "继续点灯",
        360,
        H / 2 - 180,
        540,
        () => {
          modal = "";
          render();
          scheduleBot();
        },
        true,
      );
    } else {
      text(
        pending === "mode" ? "切换模式会开始新局。" : "新一局会替换当前棋局。",
        360,
        H / 2 + 190,
        558,
        31,
      );
      text("当前这局还没有结束，", 360, H / 2 + 80, 558, 29, MUTED);
      text("也可以留下来继续点灯。", 360, H / 2 + 33, 558, 29, MUTED);
      button("cancel", "继续本局", 360, H / 2 - 145, 540, () => {
        modal = "";
        pending = "";
        render();
        scheduleBot();
      });
      button("confirm", "开始新局", 360, H / 2 - 285, 540, reset, true);
    }
  }
  document.querySelector("#accessible").textContent =
    modal === "pause" ? "已暂停" : result;
  syncButtons();
  if (animating) raf = requestAnimationFrame(render);
}
function local(e: PointerEvent) {
  const r = frame.getBoundingClientRect();
  return {
    x: ((e.clientX - r.x) * W) / r.width,
    y: H - ((e.clientY - r.y) * H) / r.height,
  };
}
function cancelPress() {
  if (press) {
    const el = buttons.get(press.target.id);
    if (el?.hasPointerCapture(press.pointer))
      el.releasePointerCapture(press.pointer);
  }
  press = null;
  previewColumn = -1;
}
function syncButtons() {
  const present = new Set(targets.map((t) => t.id));
  for (const [id, b] of buttons) b.hidden = !present.has(id);
  controls.setAttribute("role", modal ? "dialog" : "group");
  controls.setAttribute(
    "aria-label",
    modal === "pause"
      ? "对局已暂停"
      : modal
        ? "棋局说明与确认"
        : "七列六行重力四连棋盘",
  );
  controls.setAttribute("aria-modal", String(!!modal));
  for (const t of targets) {
    let b = buttons.get(t.id);
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.className = "hit";
      b.dataset.target = t.id;
      controls.append(b);
      buttons.set(t.id, b);
    }
    b.hidden = false;
    Object.assign(b.style, {
      left: t.x - t.w / 2 + "px",
      top: H - t.y - t.h / 2 + "px",
      width: t.w + "px",
      height: t.h + "px",
    });
    b.disabled = t.id === "undo" && !state.moves.length;
    const labels = {
      undo: "悔一步",
      new: "新一局",
      help: "玩法",
      mode: solo ? "单人陪练，切换为双人" : "同屏双人，切换为单人",
      simple: simple ? "简动：开" : "简动：关",
      pause: "暂停对局",
      resume: "继续点灯",
      close: "知道了，继续",
      cancel: "继续本局",
      confirm: "开始新局",
    };
    b.setAttribute(
      "aria-label",
      t.column >= 0
        ? `第${t.column + 1}列，${legal(state).includes(t.column) ? "可放灯" : "不可放灯"}`
        : labels[t.id] || t.id,
    );
    if (t.id === "simple") b.setAttribute("aria-pressed", String(simple));
  }
}
controls.addEventListener("pointerdown", (e: PointerEvent) => {
  if (!ready || !e.isPrimary || e.button !== 0 || press) return;
  const el = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-target]",
  );
  if (!el || el.disabled) return;
  const t = targets.find((t) => t.id === el.dataset.target);
  if (!t) return;
  e.preventDefault();
  const p = local(e);
  press = {
    target: t,
    start: p,
    pointer: e.pointerId,
    epoch: layoutEpoch,
    cancelled: false,
  };
  el.setPointerCapture(e.pointerId);
  if (
    t.column >= 0 &&
    !modal &&
    !busy() &&
    !state.winner &&
    (!solo || state.turn === 1) &&
    legal(state).includes(t.column)
  )
    previewColumn = t.column;
  render();
});
controls.addEventListener("pointermove", (e: PointerEvent) => {
  if (!press || press.pointer !== e.pointerId) return;
  const p = local(e);
  if (Math.hypot(p.x - press.start.x, p.y - press.start.y) >= 18) {
    press.cancelled = true;
    previewColumn = -1;
    render();
  }
});
controls.addEventListener("pointerup", (e: PointerEvent) => {
  if (!press || press.pointer !== e.pointerId) return;
  const a = press,
    p = local(e);
  press = null;
  previewColumn = -1;
  const el = buttons.get(a.target.id);
  if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  if (
    !a.cancelled &&
    a.epoch === layoutEpoch &&
    Math.hypot(p.x - a.start.x, p.y - a.start.y) < 18
  ) {
    inputs++;
    a.target.action();
  }
  render();
});
controls.addEventListener("pointercancel", () => {
  cancelPress();
  render();
});
controls.addEventListener("lostpointercapture", () => {
  if (press) {
    cancelPress();
    render();
  }
});
controls.addEventListener("click", (e) => {
  e.preventDefault();
  const el = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-target]",
  );
  if (e.detail === 0 && ready && el && !el.disabled) {
    const t = targets.find((t) => t.id === el.dataset.target);
    if (t) {
      inputs++;
      t.action();
      render();
    }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal) {
    pending = "";
    modal = "";
    render();
    scheduleBot();
  }
});
document.addEventListener("visibilitychange", () => {
  cancelPress();
  if (document.hidden) {
    clearTimeout(botTimer);
    botTimer = 0;
    save();
  } else {
    render();
    scheduleBot();
  }
});
window.addEventListener("pagehide", () => {
  cancelPress();
  clearTimeout(botTimer);
  botTimer = 0;
  save();
});
window.addEventListener("pageshow", () => {
  if (ready) {
    render();
    scheduleBot();
  }
});
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
document
  .getElementById("retry")
  .addEventListener("click", () => location.reload());
Object.defineProperty(window, "__owngameBoard", {
  value: Object.freeze({
    snapshot: () =>
      JSON.parse(
        JSON.stringify({
          ready,
          id: "firefly-four",
          kind: "four",
          art: "C-paper-lanterns",
          engine: "canvas",
          source_sha256: __SOURCE_SHA__,
          state,
          solo,
          simple,
          busy: busy(),
          ai: !!botTimer,
          modal,
          notice,
          saveError,
          inputCount: inputs,
          targets: targets.map(({ action, ...t }) => {
            const b = buttons.get(t.id),
              r = b?.getBoundingClientRect();
            return {
              ...t,
              css: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
              enabled: !b?.disabled,
            };
          }),
          previewColumn,
          design: { width: W, height: H },
          layout: {
            ...layout,
            frame: {
              x: frame.getBoundingClientRect().x,
              y: frame.getBoundingClientRect().y,
              w: frame.getBoundingClientRect().width,
              h: frame.getBoundingClientRect().height,
            },
          },
          saveKey: KEY,
          legal: legal(state),
          assetErrors: errors,
        }),
      ),
  }),
});
Promise.all(
  ["bg", "board", "atlas", "title"].map(
    (name) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          images[name] = image;
          resolve();
        };
        image.onerror = () => {
          errors.push(name);
          resolve();
        };
        image.src = "art/" + name + ".png";
      }),
  ),
).then(() => {
  if (errors.length) {
    document.querySelector("#load p").textContent = "画面载入失败，请重新打开";
    document.getElementById("retry").hidden = false;
    return;
  }
  ready = true;
  document.getElementById("load").hidden = true;
  resize();
  scheduleBot();
});
resize();

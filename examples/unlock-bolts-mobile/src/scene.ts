import Phaser from "phaser";
import type { State } from "./rules";
import type { Layout } from "./layout";
export type Transfer = {
  from: string;
  to: string;
  moved: number;
  before: State;
};
const RECTS: Record<string, [number, number, number, number]> = {
  R: [45, 245, 370, 320],
  B: [445, 245, 370, 320],
  G: [845, 245, 370, 320],
  Y: [45, 695, 370, 320],
  P: [445, 695, 370, 320],
  lock: [900, 700, 250, 330],
};
export class WorkshopScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.Image;
  private tray!: Phaser.GameObjects.Image;
  private objects!: Phaser.GameObjects.Container;
  private layout!: Layout;
  private source!: HTMLImageElement;
  private backgroundKey = "";
  constructor(
    private done: (scene: WorkshopScene) => void,
    private failed: () => void,
  ) {
    super("enamel-workshop");
  }
  preload() {
    this.load.on("loaderror", this.failed);
    for (const name of ["workshop", "hardware", "shaft"])
      this.load.image(name, "./assets/" + name + ".png");
  }
  create() {
    if (
      !["workshop", "hardware", "shaft"].every((k) => this.textures.exists(k))
    )
      return;
    const hardware = this.textures.get("hardware");
    for (const [key, r] of Object.entries(RECTS)) hardware.add(key, 0, ...r);
    this.textures.get("workshop").add("tray", 0, 15, 518, 810, 850);
    this.source = this.textures
      .get("workshop")
      .getSourceImage() as HTMLImageElement;
    this.ground = this.add.image(0, 0, "workshop").setOrigin(0);
    this.tray = this.add.image(0, 0, "workshop", "tray").setOrigin(0);
    this.objects = this.add.container();
    this.done(this);
  }
  setLayout(layout: Layout) {
    this.layout = layout;
    const width = innerWidth,
      height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.scale.resize(Math.round(width * dpr), Math.round(height * dpr));
    this.cameras.main
      .setSize(Math.round(width * dpr), Math.round(height * dpr))
      .setOrigin(0, 0)
      .setZoom(dpr)
      .setScroll(0, 0);
    const key = `table-${width}-${height}-${dpr}`;
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(
        key,
        Math.round(width * dpr),
        Math.round(height * dpr),
      )!;
      const ctx = tex.context;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#eedab7";
      ctx.fillRect(0, 0, width, height);
      // Paint the selected original material at runtime. No new background art
      // or opaque safe-area band is introduced; the one canvas spans the screen.
      ctx.drawImage(this.source, 290, 300, 260, 160, 0, 0, width, height);
      const decorate = (
        sy: number,
        sh: number,
        y: number,
        h: number,
        fadeTop: boolean,
      ) => {
        const layer = document.createElement("canvas");
        layer.width = Math.round(width * dpr);
        layer.height = Math.ceil(h * dpr);
        const c = layer.getContext("2d")!;
        c.scale(dpr, dpr);
        c.drawImage(this.source, 0, sy, 841, sh, 0, 0, width, h);
        c.globalCompositeOperation = "destination-in";
        const gradient = c.createLinearGradient(0, 0, 0, h);
        if (fadeTop) {
          gradient.addColorStop(0, "transparent");
          gradient.addColorStop(0.3, "white");
          gradient.addColorStop(1, "white");
        } else {
          gradient.addColorStop(0, "white");
          gradient.addColorStop(0.65, "white");
          gradient.addColorStop(1, "transparent");
        }
        c.fillStyle = gradient;
        c.fillRect(0, 0, width, h);
        ctx.drawImage(layer, 0, y, width, h);
      };
      const decoW = Math.min(width, 650),
        topH = (decoW * 500) / 841,
        bottomH = (decoW * 430) / 841;
      decorate(0, 500, 0, topH, false);
      decorate(1440, 430, height - bottomH, bottomH, true);
      tex.refresh();
    }
    const old = this.backgroundKey;
    this.backgroundKey = key;
    this.ground.setTexture(key).setDisplaySize(width, height);
    if (old && old !== key) this.textures.remove(old);
    const b = layout.board;
    this.tray.setPosition(b.x, b.y).setDisplaySize(b.w, b.h);
  }
  renderState(
    state: State,
    selected: string | null,
    capacity: number,
    transition?: Transfer,
  ) {
    if (!this.layout) return;
    this.tweens.killAll();
    this.objects.removeAll(true);
    const l = this.layout,
      ids = Object.keys(state.bolts),
      size = l.nutWidth,
      pitch = l.pitch;
    const add = (o: Phaser.GameObjects.GameObject) => {
      this.objects.add(o);
      return o;
    };
    const image = (
      x: number,
      y: number,
      texture: string,
      frame: string | undefined,
      w: number,
      h: number,
    ) => {
      const o = this.add.image(x, y, texture, frame).setDisplaySize(w, h);
      add(o);
      return o;
    };
    const label = (
      x: number,
      y: number,
      text: string,
      size: number,
      color: string,
    ) => {
      const o = this.add
        .text(x, y, text, {
          fontFamily: "Georgia,serif",
          fontSize: size + "px",
          fontStyle: "bold",
          color,
          resolution: Math.min(devicePixelRatio, 2),
        })
        .setOrigin(0.5);
      add(o);
      return o;
    };
    const shaft = (x: number, top: number, bottom: number) => {
      if (bottom <= top) return;
      const h = bottom - top,
        full = l.bolts[0].base - l.bolts[0].shaftTop,
        key = "length-" + h.toFixed(3) + "-" + full.toFixed(3);
      const texture = this.textures.get("shaft");
      if (!texture.has(key))
        texture.add(key, 0, 420, 30, 185, Math.min(1480, (1480 * h) / full));
      image(x, (top + bottom) / 2, "shaft", key, size * 0.32, h);
    };
    const nut = (x: number, y: number, color: string) => {
      const group = this.add.container(x, y);
      add(group);
      const piece = this.add
        .image(0, 0, "hardware", color)
        .setDisplaySize(size, (size * 320) / 370);
      const mark = this.add
        .text(0, size * 0.22, color, {
          fontFamily: "Georgia,serif",
          fontSize: Math.max(10, size * 0.17) + "px",
          fontStyle: "bold",
          color: "#fff0d2",
          stroke: "#44270f",
          strokeThickness: 0.5,
          resolution: 2,
        })
        .setOrigin(0.5);
      group.add([piece, mark]);
      return group;
    };
    const centers: Record<string, { x: number; y: number }> = {};
    ids.forEach((id, index) => {
      const b = l.bolts[index],
        pile = state.bolts[id],
        locked = state.locked.includes(id),
        chosen = id === selected;
      const source = selected ? state.bolts[selected] : [];
      const available =
        !!selected &&
        !chosen &&
        !locked &&
        pile.length < capacity &&
        (!pile.length || pile.at(-1) === source.at(-1));
      const g = this.add.graphics();
      add(g);
      g.fillStyle(0x30170b, 0.35).fillEllipse(
        b.cx + 1,
        b.base + 4,
        size * 1.08,
        size * 0.32,
      );
      g.fillStyle(0x63391e).fillEllipse(b.cx, b.base, size * 1.04, size * 0.3);
      g.lineStyle(1, 0xc49459).strokeEllipse(
        b.cx,
        b.base,
        size * 1.04,
        size * 0.3,
      );
      g.fillStyle(0x3c291d).fillEllipse(
        b.cx,
        b.base - 1,
        size * 0.88,
        size * 0.23,
      );
      if (chosen || available) {
        for (const [w, a] of [
          [9, 0.05],
          [5, 0.17],
          [2, 0.96],
        ]) {
          g.lineStyle(w, 0xffd581, a);
          if (chosen)
            g.strokeRoundedRect(b.x + 3, b.y + 3, b.w - 6, b.h - 21, 15);
          else g.strokeEllipse(b.cx, b.base, size * 1.04, size * 0.32);
        }
      }
      shaft(b.cx, b.shaftTop, b.base - 1);
      centers[id] = { x: b.cx, y: b.base - size * 0.36 };
      pile.forEach((color, j) => {
        const moved =
          transition &&
          transition.to === id &&
          j >= pile.length - transition.moved;
        if (!moved)
          nut(
            b.cx,
            b.base -
              size * 0.36 -
              j * pitch -
              (chosen && j === pile.length - 1 ? Math.min(6, size * 0.1) : 0),
            color,
          );
      });
      if (pile.length) {
        const y =
          b.base -
          size * 0.36 -
          (pile.length - 1) * pitch -
          (chosen ? Math.min(6, size * 0.1) : 0);
        shaft(b.cx, b.shaftTop, y - size * 0.08);
      }
      g.fillStyle(0xe2ba7f).fillRoundedRect(b.cx - 20, b.base + 9, 40, 18, 8);
      g.lineStyle(1, 0xffe9b8).strokeRoundedRect(
        b.cx - 19,
        b.base + 10,
        38,
        16,
        7,
      );
      label(b.cx, b.base + 18, id, 13, "#48260e");
      if (locked)
        image(
          b.cx + size * 0.33,
          b.base - size * 0.12,
          "hardware",
          "lock",
          Math.max(20, size * 0.31),
          Math.max(26, size * 0.41),
        );
      if (pile.length === capacity && new Set(pile).size === 1)
        label(b.cx + size * 0.39, b.shaftTop + 7, "✓", 14, "#ffefd0");
    });
    if (transition) {
      const t = transition,
        a = centers[t.from],
        b = centers[t.to];
      const source = t.before.bolts[t.from],
        dest = t.before.bolts[t.to];
      source.slice(-t.moved).forEach((color, i) => {
        const y1 = a.y - (source.length - t.moved + i) * pitch,
          y2 = b.y - (dest.length + i) * pitch;
        const token = nut(a.x, y1, color),
          proxy = { progress: 0 };
        this.tweens.add({
          targets: proxy,
          progress: 1,
          duration: 280,
          onUpdate: () => {
            const q = proxy.progress,
              ease = q * q * (3 - 2 * q);
            token.setPosition(
              a.x + (b.x - a.x) * ease,
              y1 +
                (y2 - y1) * ease -
                Math.sin(Math.PI * q) * Math.min(65, l.board.h * 0.2),
            );
          },
        });
      });
    }
  }
}

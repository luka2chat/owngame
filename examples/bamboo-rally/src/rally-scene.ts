import Phaser from "phaser";
import { State } from "./rules";
import { fitLayout, Layout, screenPoint } from "./layout";

export class RallyScene extends Phaser.Scene {
  private layout: Layout = fitLayout(720, 1280);
  private table!: Phaser.GameObjects.Image;
  private rails!: Phaser.GameObjects.Graphics;
  private shadows!: Phaser.GameObjects.Graphics;
  private feedback!: Phaser.GameObjects.Graphics;
  private paddles: Phaser.GameObjects.Image[] = [];
  private pearl!: Phaser.GameObjects.Image;
  private loaded = false;
  private trail: { x: number; y: number }[] = [];
  private lastHits = 0;
  private lastBounces = 0;
  private hitUntil = 0;
  private bounceUntil = 0;
  private bounceAt = { x: 0, y: 0 };
  constructor(
    private readonly done: (scene: RallyScene) => void,
    private readonly failed: (message: string) => void,
    private readonly step: (delta: number) => void,
  ) {
    super("bamboo-courtyard");
  }
  preload() {
    this.load.on("loaderror", () => this.failed("竹庭载入失败，请重新打开"));
    for (const name of ["courtyard", "lacquer", "title", "paddles"])
      this.load.image(name, "./assets/" + name + ".png");
  }
  create() {
    if (
      !["courtyard", "lacquer", "title", "paddles"].every((k) =>
        this.textures.exists(k),
      )
    )
      return;
    const texture = this.textures.get("paddles");
    texture.add("bamboo", 0, 65, 15, 500, 720);
    texture.add("jade", 0, 690, 15, 500, 720);
    texture.add("pearl", 0, 145, 820, 330, 325);
    this.rails = this.add.graphics();
    this.table = this.add.image(360, 650, "lacquer");
    this.shadows = this.add.graphics();
    this.feedback = this.add.graphics();
    this.paddles = [
      this.add.image(0, 0, "paddles", "bamboo").setOrigin(0.5, 0.35),
      this.add
        .image(0, 0, "paddles", "jade")
        .setOrigin(0.5, 0.35)
        .setRotation(Math.PI),
    ];
    this.pearl = this.add.image(0, 0, "paddles", "pearl");
    this.loaded = true;
    this.setLayout(this.layout);
    this.done(this);
  }
  update(_time: number, delta: number) {
    if (this.loaded) this.step(delta);
  }
  setLayout(l: Layout) {
    this.layout = l;
    if (!this.loaded) return;
    this.scale.resize(l.width, l.height);
    this.cameras.main.setSize(l.width, l.height);
    this.trail = [];
    const t = l.table,
      g = this.rails;
    g.clear();
    g.fillStyle(0x07271f, 0.32).fillRoundedRect(
      t.x - 9,
      t.y - 4,
      t.w + 32,
      t.h + 35,
      5,
    );
    g.fillStyle(0x654c2a).fillRoundedRect(
      t.x - 13,
      t.y - 13,
      t.w + 26,
      t.h + 26,
      4,
    );
    g.fillStyle(0xc69c51).fillRoundedRect(
      t.x - 10,
      t.y - 11,
      t.w + 20,
      t.h + 20,
      3,
    );
    g.lineStyle(3, 0xf2d79b, 0.9).strokeRect(
      t.x - 8,
      t.y - 9,
      t.w + 15,
      t.h + 15,
    );
    g.lineStyle(1.5, 0x886730, 0.85).strokeRect(
      t.x - 4,
      t.y - 4,
      t.w + 8,
      t.h + 8,
    );
    for (const x of [t.x - 7, t.x + t.w + 7])
      for (let y = t.y + 38; y < t.y + t.h; y += 88) {
        g.lineStyle(2, 0x79592b, 0.9).lineBetween(x - 4, y, x + 4, y + 1);
        g.lineStyle(1, 0xf5dda3, 0.8).lineBetween(x - 4, y + 3, x + 4, y + 4);
      }
    for (const y of [t.y - 7, t.y + t.h + 7])
      for (let x = t.x + 44; x < t.x + t.w; x += 94)
        g.lineStyle(2, 0x826331, 0.8).lineBetween(x, y - 4, x + 1, y + 4);
    this.table.setPosition(l.cx, l.cy).setDisplaySize(t.w, t.h);
    // Court markings and the woven net belong above the texture; no later opaque fill covers them.
    this.drawCourt();
    for (const p of this.paddles)
      p.setDisplaySize(l.paddleWidth, l.paddleWidth * 1.44);
    this.pearl.setDisplaySize(30, 30);
  }
  private court!: Phaser.GameObjects.Graphics;
  private drawCourt() {
    if (!this.court) this.court = this.add.graphics().setDepth(0.5);
    const l = this.layout,
      t = l.table,
      g = this.court;
    g.clear();
    g.lineStyle(2.4, 0xf2e6be, 0.82)
      .strokeRect(t.x + 3, t.y + 3, t.w - 6, t.h - 6)
      .lineBetween(l.cx, t.y + 2, l.cx, t.y + t.h - 2);
    g.fillStyle(0x062821, 0.24).fillRect(t.x - 9, l.cy + 6, t.w + 18, 22);
    g.fillStyle(0x123c33, 0.86).fillRect(t.x - 9, l.cy - 11, t.w + 18, 23);
    g.lineStyle(1.2, 0xd8c38a, 0.9);
    for (let x = t.x - 8; x < t.x + t.w + 9; x += 7)
      g.lineBetween(x, l.cy - 11, x, l.cy + 12);
    for (let y = l.cy - 11; y <= l.cy + 12; y += 6)
      g.lineBetween(t.x - 9, y, t.x + t.w + 9, y);
    g.lineStyle(3, 0xf1e2b4, 1).lineBetween(
      t.x - 15,
      l.cy - 12,
      t.x + t.w + 15,
      l.cy - 12,
    );
    for (const x of [t.x - 15, t.x + t.w + 15]) {
      g.fillStyle(0x82602b).fillRoundedRect(x - 5, l.cy - 24, 10, 48, 4);
      g.fillStyle(0xd9b66a).fillRoundedRect(x - 3, l.cy - 22, 4, 44, 2);
      g.fillStyle(0xefd398).fillEllipse(x, l.cy - 24, 14, 8);
      g.lineStyle(1, 0x8a6a34, 1).strokeEllipse(x, l.cy - 24, 8, 4);
    }
    this.shadows?.setDepth(1);
    this.feedback?.setDepth(2);
    for (const p of this.paddles) p.setDepth(3);
    this.pearl?.setDepth(4);
  }
  renderState(s: State, paused: boolean, simple: boolean) {
    if (!this.loaded) return;
    const l = this.layout,
      g = this.shadows,
      f = this.feedback,
      now = performance.now();
    g.clear();
    f.clear();
    if (s.hits > this.lastHits) this.hitUntil = now + 240;
    if (s.bounces > this.lastBounces) {
      this.bounceUntil = now + 330;
      this.bounceAt = screenPoint(l, s.ball.x, s.ball.z);
    }
    this.lastHits = s.hits;
    this.lastBounces = s.bounces;
    for (let i = 0; i < 2; i++) {
      const a = s.paddles[i],
        p = screenPoint(l, a.x, a.z),
        r = l.paddleWidth * 0.48;
      g.fillStyle(0x021e16, 0.35).fillEllipse(p.x + 6, p.y + 9, r * 2, r * 1.7);
      if ((i === 0 || s.mode === "duo") && !paused) {
        f.lineStyle(a.held ? 3 : 2, 0xe5c880, a.held ? 0.95 : 0.6);
        f.beginPath();
        f.arc(p.x, p.y, r + 8, 0.2, 1.45);
        f.strokePath();
        f.beginPath();
        f.arc(p.x, p.y, r + 8, 3.35, 4.6);
        f.strokePath();
        if (a.held) {
          const dir = i === 0 ? -1 : 1;
          f.fillStyle(0xf5de9d, 1).fillTriangle(
            p.x,
            p.y + dir * (r + 18),
            p.x - 5,
            p.y + dir * (r + 10),
            p.x + 5,
            p.y + dir * (r + 10),
          );
        }
      }
      if (!simple && now < this.hitUntil && s.shooter === i)
        f.lineStyle(
          2,
          0xffe8af,
          ((this.hitUntil - now) / 240) * 0.7,
        ).strokeCircle(
          p.x,
          p.y,
          r + 10 + (1 - (this.hitUntil - now) / 240) * 18,
        );
      this.paddles[i].setPosition(p.x, p.y);
    }
    const b = screenPoint(l, s.ball.x, s.ball.z);
    if (!paused && s.phase === "rally") {
      this.trail.push(b);
      if (this.trail.length > 8) this.trail.shift();
    } else if (s.phase !== "rally") this.trail = [];
    if (!simple)
      for (let i = 1; i < this.trail.length; i++)
        f.lineStyle(1 + i * 0.38, 0xffedbc, 0.07 + i * 0.055).lineBetween(
          this.trail[i - 1].x,
          this.trail[i - 1].y,
          this.trail[i].x,
          this.trail[i].y,
        );
    if (!simple && now < this.bounceUntil) {
      const fade = (this.bounceUntil - now) / 330;
      f.lineStyle(2, 0xf6dda1, fade * 0.8).strokeEllipse(
        this.bounceAt.x,
        this.bounceAt.y,
        20 + (1 - fade) * 40,
        10 + (1 - fade) * 20,
      );
    }
    const active = s.phase !== "point" && s.phase !== "finished";
    if (active)
      g.fillStyle(0x03231b, 0.45).fillEllipse(
        b.x + Math.max(0, s.ball.y) * 4,
        b.y + 6,
        22,
        14,
      );
    const size = 30 * (1 + Math.max(0, s.ball.y) * 0.035);
    this.pearl
      .setVisible(active)
      .setPosition(b.x, b.y)
      .setDisplaySize(size, size);
  }
}

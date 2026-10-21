/**
 * HUD particle layer: a full-screen 2D canvas composited additively over the DOM HUD.
 * UI events (hitmarkers, style gains, rank-ups, shard pickups, wave banners, perk cards, menu
 * hovers) call burst()/streak()/trickle() so every interaction throws sparks. The pool is fixed
 * (no allocation per spark) and the canvas renders at ≤ 1.5× DPR to stay cheap.
 */
type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; r: number; g: number; b: number; drag: number; grav: number; kind: 0 | 1 | 2 }

export type SparkOpts = {
  count?: number
  color?: string
  speed?: number
  spread?: number
  angle?: number
  life?: number
  size?: number
  gravity?: number
  drag?: number
  kind?: 'spark' | 'ember' | 'glow'
}

const MAX = 900

function parse(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c)
  if (!m) return [255, 170, 60]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

export class Sparks {
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly pool: P[] = []
  private n = 0
  private dpr = 1
  private embers = 0
  enabled = true
  /** Global multiplier (reduced motion lowers it). */
  density = 1

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'sparks'
    parent.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
    for (let i = 0; i < MAX; i += 1) this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, r: 0, g: 0, b: 0, drag: 0, grav: 0, kind: 0 })
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(window.innerWidth * this.dpr)
    this.canvas.height = Math.round(window.innerHeight * this.dpr)
  }

  private spawn(): P | null {
    if (this.n >= MAX) return null
    return this.pool[this.n++]
  }

  burst(x: number, y: number, o: SparkOpts = {}): void {
    if (!this.enabled) return
    const count = Math.round((o.count ?? 18) * this.density)
    const [r, g, b] = parse(o.color ?? '#ffb040')
    const kind = o.kind === 'ember' ? 1 : o.kind === 'glow' ? 2 : 0
    for (let i = 0; i < count; i += 1) {
      const p = this.spawn()
      if (!p) return
      const a = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2)
      const s = (o.speed ?? 320) * (0.35 + Math.random() * 0.8)
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.max = p.life = (o.life ?? 0.55) * (0.6 + Math.random() * 0.7)
      p.size = (o.size ?? 2) * (0.6 + Math.random() * 0.8)
      p.r = r
      p.g = g
      p.b = b
      p.drag = o.drag ?? 3
      p.grav = o.gravity ?? 520
      p.kind = kind
    }
  }

  /** Sparks raining off a horizontal edge (wave banners, card borders). */
  streak(x0: number, x1: number, y: number, o: SparkOpts = {}): void {
    const count = Math.round((o.count ?? 40) * this.density)
    for (let i = 0; i < count; i += 1) {
      const x = x0 + Math.random() * (x1 - x0)
      const dir = x < (x0 + x1) / 2 ? Math.PI : 0
      this.burst(x, y + (Math.random() - 0.5) * 6, { ...o, count: 1, angle: dir + (Math.random() - 0.5) * 0.7, spread: 0.6 })
    }
  }

  /** Ambient embers drifting up the screen (title / loading screens). */
  trickle(rate: number): void {
    this.embers = rate
  }

  update(dt: number): void {
    const ctx = this.ctx
    const W = this.canvas.width
    const H = this.canvas.height
    if (this.embers > 0 && this.enabled) {
      const want = this.embers * dt * this.density
      let k = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0)
      while (k-- > 0) {
        const p = this.spawn()
        if (!p) break
        p.x = Math.random() * window.innerWidth
        p.y = window.innerHeight + 10
        p.vx = (Math.random() - 0.3) * 40
        p.vy = -60 - Math.random() * 110
        p.max = p.life = 3 + Math.random() * 4
        p.size = 1 + Math.random() * 2.2
        const hot = Math.random()
        p.r = 255
        p.g = 110 + hot * 110
        p.b = 30 + hot * 40
        p.drag = 0.2
        p.grav = -8
        p.kind = 1
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (!this.n) return
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    let i = 0
    while (i < this.n) {
      const p = this.pool[i]
      p.life -= dt
      if (p.life <= 0) {
        const last = this.pool[this.n - 1]
        this.pool[this.n - 1] = p
        this.pool[i] = last
        this.n -= 1
        continue
      }
      const d = Math.exp(-p.drag * dt)
      p.vx *= d
      p.vy = p.vy * d + p.grav * dt
      if (p.kind === 1) p.vx += Math.sin((p.life + i) * 3) * 20 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      const t = p.life / p.max
      const a = p.kind === 1 ? Math.min(1, t * 2) * Math.min(1, (1 - t) * 6) : t
      if (p.kind === 2) {
        const R = p.size * (3 + (1 - t) * 6)
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R)
        grd.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${0.5 * a})`)
        grd.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`)
        ctx.fillStyle = grd
        ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2)
      } else if (p.kind === 0) {
        // Motion-stretched spark with a hot white core.
        const len = Math.min(26, Math.hypot(p.vx, p.vy) * 0.028) + p.size
        const ang = Math.atan2(p.vy, p.vx)
        ctx.strokeStyle = `rgba(${p.r},${p.g},${p.b},${a})`
        ctx.lineWidth = p.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len)
        ctx.stroke()
        if (t > 0.5) {
          ctx.strokeStyle = `rgba(255,245,220,${(t - 0.5) * 1.6})`
          ctx.lineWidth = p.size * 0.45
          ctx.stroke()
        }
      } else {
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      i += 1
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  clear(): void {
    this.n = 0
  }
}

/**
 * 2.5D navigation grid for bots. Each cell stores a floor height (or blocked). Neighbouring cells
 * connect when their height difference is walkable (ramps, not ledges). A* finds paths; paths are
 * string-pulled with grid line checks so bots move in straight lines where they can.
 */
export const BLOCKED = -999

export class NavGrid {
  readonly heights: Float32Array
  /** Cells next to an obstacle: good cover candidates. */
  readonly edge: Uint8Array
  private readonly g: Float32Array
  private readonly f: Float32Array
  private readonly parent: Int32Array
  private readonly state: Uint8Array
  private readonly heap: number[] = []
  readonly maxStep = 0.55

  constructor(readonly cols: number, readonly rows: number, readonly cell: number, readonly originX: number, readonly originZ: number) {
    const n = cols * rows
    this.heights = new Float32Array(n).fill(BLOCKED)
    this.edge = new Uint8Array(n)
    this.g = new Float32Array(n)
    this.f = new Float32Array(n)
    this.parent = new Int32Array(n)
    this.state = new Uint8Array(n)
  }

  index(cx: number, cz: number): number {
    return cz * this.cols + cx
  }
  cellOf(x: number, z: number): [number, number] {
    return [Math.floor((x - this.originX) / this.cell), Math.floor((z - this.originZ) / this.cell)]
  }
  center(i: number): { x: number; z: number } {
    const cx = i % this.cols
    const cz = Math.floor(i / this.cols)
    return { x: this.originX + (cx + 0.5) * this.cell, z: this.originZ + (cz + 0.5) * this.cell }
  }
  inside(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows
  }
  walkableCell(cx: number, cz: number): boolean {
    return this.inside(cx, cz) && this.heights[this.index(cx, cz)] !== BLOCKED
  }
  walkable(x: number, z: number): boolean {
    const [cx, cz] = this.cellOf(x, z)
    return this.walkableCell(cx, cz)
  }
  heightAt(x: number, z: number): number {
    const [cx, cz] = this.cellOf(x, z)
    if (!this.inside(cx, cz)) return BLOCKED
    return this.heights[this.index(cx, cz)]
  }
  /** Mark cells that touch a blocked cell (cover spots). Call after heights are filled. */
  computeEdges(): void {
    for (let cz = 0; cz < this.rows; cz += 1) {
      for (let cx = 0; cx < this.cols; cx += 1) {
        const i = this.index(cx, cz)
        if (this.heights[i] === BLOCKED) continue
        let e = 0
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx
          const nz = cz + dz
          if (!this.walkableCell(nx, nz) || Math.abs(this.heights[this.index(nx, nz)] - this.heights[i]) > 1.2) e = 1
        }
        this.edge[i] = e
      }
    }
  }
  /** Nearest walkable cell index to a world position (spiral search). */
  nearest(x: number, z: number, maxRing = 8): number {
    const [cx, cz] = this.cellOf(x, z)
    for (let r = 0; r <= maxRing; r += 1) {
      let best = -1
      let bestD = Infinity
      for (let dz = -r; dz <= r; dz += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          if (!this.walkableCell(cx + dx, cz + dz)) continue
          const d = dx * dx + dz * dz
          if (d < bestD) {
            bestD = d
            best = this.index(cx + dx, cz + dz)
          }
        }
      }
      if (best >= 0) return best
    }
    return -1
  }
  private connected(a: number, b: number): boolean {
    const ha = this.heights[a]
    const hb = this.heights[b]
    return ha !== BLOCKED && hb !== BLOCKED && Math.abs(ha - hb) <= this.maxStep
  }
  /** A* from world position to world position. Returns world waypoints (excluding start) or null. */
  findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null {
    const start = this.nearest(sx, sz, 3)
    const goal = this.nearest(tx, tz, 4)
    if (start < 0 || goal < 0) return null
    if (start === goal) return [{ x: tx, z: tz }]
    const cols = this.cols
    this.state.fill(0)
    this.heap.length = 0
    const gc = this.center(goal)
    const h = (i: number) => {
      const c = this.center(i)
      const dx = Math.abs(c.x - gc.x)
      const dz = Math.abs(c.z - gc.z)
      return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz))
    }
    this.g[start] = 0
    this.f[start] = h(start)
    this.parent[start] = -1
    this.state[start] = 1
    this.push(start)
    let found = false
    let iterations = 0
    while (this.heap.length > 0 && iterations < 9000) {
      iterations += 1
      const cur = this.pop()
      if (cur === goal) {
        found = true
        break
      }
      if (this.state[cur] === 2) continue
      this.state[cur] = 2
      const cx = cur % cols
      const cz = (cur - cx) / cols
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dz === 0) continue
          const nx = cx + dx
          const nz = cz + dz
          if (!this.inside(nx, nz)) continue
          const ni = nz * cols + nx
          if (this.state[ni] === 2 || !this.connected(cur, ni)) continue
          if (dx !== 0 && dz !== 0 && (!this.connected(cur, cz * cols + nx) || !this.connected(cur, nz * cols + cx))) continue
          const step = (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) * this.cell
          // Hug-avoidance: cells next to walls cost a little more so paths keep clearance.
          const cost = this.g[cur] + step * (this.edge[ni] ? 1.35 : 1)
          if (this.state[ni] === 1 && cost >= this.g[ni]) continue
          this.g[ni] = cost
          this.f[ni] = cost + h(ni)
          this.parent[ni] = cur
          this.state[ni] = 1
          this.push(ni)
        }
      }
    }
    if (!found) return null
    const cells: number[] = []
    for (let i = goal; i !== -1; i = this.parent[i]) cells.push(i)
    cells.reverse()
    // String pulling: keep only waypoints needed to go around obstacles.
    const out: { x: number; z: number }[] = []
    let anchor = this.center(cells[0])
    for (let i = 1; i < cells.length; i += 1) {
      const next = this.center(cells[i])
      if (i + 1 < cells.length) {
        const after = this.center(cells[i + 1])
        if (this.clearLine(anchor.x, anchor.z, after.x, after.z)) continue
      }
      out.push(next)
      anchor = next
    }
    out[out.length - 1] = { x: tx, z: tz }
    if (!this.walkable(tx, tz)) out[out.length - 1] = this.center(goal)
    return out
  }
  /** True when a straight walk between two points stays on connected cells. */
  clearLine(ax: number, az: number, bx: number, bz: number): boolean {
    const dist = Math.hypot(bx - ax, bz - az)
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.35)))
    let prev = -1
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps
      const [cx, cz] = this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t)
      if (!this.walkableCell(cx, cz)) return false
      const i = this.index(cx, cz)
      if (prev >= 0 && i !== prev && !this.connected(prev, i)) return false
      if (this.edge[i] && s > 0 && s < steps) {
        // Allow edges but not squeezing between two obstacles diagonally.
      }
      prev = i
    }
    return true
  }
  private push(i: number): void {
    const heap = this.heap
    heap.push(i)
    let c = heap.length - 1
    while (c > 0) {
      const p = (c - 1) >> 1
      if (this.f[heap[p]] <= this.f[heap[c]]) break
      ;[heap[p], heap[c]] = [heap[c], heap[p]]
      c = p
    }
  }
  private pop(): number {
    const heap = this.heap
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let c = 0
      for (;;) {
        const l = c * 2 + 1
        const r = l + 1
        let m = c
        if (l < heap.length && this.f[heap[l]] < this.f[heap[m]]) m = l
        if (r < heap.length && this.f[heap[r]] < this.f[heap[m]]) m = r
        if (m === c) break
        ;[heap[m], heap[c]] = [heap[c], heap[m]]
        c = m
      }
    }
    return top
  }
}

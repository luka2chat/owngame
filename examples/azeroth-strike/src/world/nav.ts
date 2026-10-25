/**
 * Multi-layer navigation graph for bots.
 *
 * Built by flood fill from seed points (spawns, flags, nodes): from every walkable node we probe
 * the 8 neighbouring grid cells with a downward ray that starts a little above the current floor,
 * so walking under a roof or onto an upper floor yields separate layers in the same cell (the WSG
 * flag rooms sit inside buildings). Links require a walkable slope, head room and no wall between.
 * A* runs on the graph; paths are string-pulled with the same walkability test.
 */
export type Hit = { y: number; ny: number }

/** World queries the builder needs; backed by Rapier in game and by a fake in tests. */
export interface NavProbe {
  /** First floor hit casting down from (x, y, z) up to `max` distance. */
  down(x: number, y: number, z: number, max: number): Hit | null
  /** True when nothing blocks the straight segment a→b. */
  clear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean
}

export type NavBounds = { minX: number; minZ: number; maxX: number; maxZ: number }
export type Point = { x: number; y: number; z: number }

const BODY_HALF_WIDTH = 0.36
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
/** Index of the reverse of each DIRS entry; links[n * 8 + d] always targets the neighbour cell in DIRS[d]. */
const OPPOSITE = [1, 0, 3, 2, 7, 6, 5, 4]
/** 'NAV1' little-endian; bump NAV_VERSION when the layout or the build rules change. */
const NAV_MAGIC = 0x3156414e
const NAV_VERSION = 1
const NAV_HEADER = 40
const NO_LINK = 15

export class NavGraph {
  readonly cols: number
  readonly rows: number
  x = new Float32Array(0)
  y = new Float32Array(0)
  z = new Float32Array(0)
  cellOfNode = new Int32Array(0)
  /** 8 neighbour slots per node (index into DIRS), -1 when not linked. */
  links = new Int32Array(0)
  /** 1 when the node is close to a wall: paths prefer open ground. */
  tight = new Uint8Array(0)
  count = 0
  private layers = new Map<number, number[]>()
  private g = new Float32Array(0)
  private f = new Float32Array(0)
  private parent = new Int32Array(0)
  private stamp = new Uint32Array(0)
  private closed = new Uint32Array(0)
  private search = 0
  private heap: number[] = []

  constructor(
    readonly bounds: NavBounds,
    readonly cell: number,
    readonly maxStep = 0.9,
    readonly height = 1.8,
  ) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell)
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell)
  }

  cellIndex(x: number, z: number): number {
    const cx = Math.floor((x - this.bounds.minX) / this.cell)
    const cz = Math.floor((z - this.bounds.minZ) / this.cell)
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return -1
    return cz * this.cols + cx
  }

  private center(cell: number): [number, number] {
    const cx = cell % this.cols
    const cz = (cell - cx) / this.cols
    return [this.bounds.minX + (cx + 0.5) * this.cell, this.bounds.minZ + (cz + 0.5) * this.cell]
  }

  /** Flood fill the graph. `maxNodes` guards against runaway open terrain. */
  build(probe: NavProbe, seeds: Point[], maxNodes = 400000): void {
    const xs: number[] = [], ys: number[] = [], zs: number[] = [], cells: number[] = [], tight: number[] = []
    const links: number[] = []
    const queue: number[] = []
    const slope = Math.max(this.maxStep, this.cell * 1.15)
    const find = (cell: number, y: number): number => {
      const list = this.layers.get(cell)
      if (!list) return -1
      for (const n of list) if (Math.abs(ys[n] - y) < 1.2) return n
      return -1
    }
    const add = (cell: number, x: number, y: number, z: number): number => {
      const id = xs.length
      xs.push(x)
      ys.push(y)
      zs.push(z)
      cells.push(cell)
      let t = 0
      for (const [dx, dz] of DIRS.slice(0, 4)) if (!probe.clear(x, y + 0.9, z, x + dx * 0.55, y + 0.9, z + dz * 0.55)) t = 1
      tight.push(t)
      for (let k = 0; k < 8; k++) links.push(-1)
      const list = this.layers.get(cell)
      if (list) list.push(id)
      else this.layers.set(cell, [id])
      queue.push(id)
      return id
    }
    const standable = (x: number, top: number, z: number, max: number): Hit | null => {
      const hit = probe.down(x, top, z, max)
      if (!hit || hit.ny < 0.55) return null
      if (!probe.clear(x, hit.y + 0.15, z, x, hit.y + this.height, z)) return null
      return hit
    }
    for (const s of seeds) {
      const cell = this.cellIndex(s.x, s.z)
      if (cell < 0) continue
      const [cx, cz] = this.center(cell)
      const hit = standable(cx, s.y + 2, cz, 6)
      if (hit && find(cell, hit.y) < 0) add(cell, cx, hit.y, cz)
    }
    let head = 0
    while (head < queue.length && xs.length < maxNodes) {
      const n = queue[head++]
      const cell = cells[n]
      const ccx = cell % this.cols
      const ccz = (cell - ccx) / this.cols
      for (let d = 0; d < 8; d++) {
        if (links[n * 8 + d] >= 0) continue
        const [dx, dz] = DIRS[d]
        const nx = ccx + dx, nz = ccz + dz
        if (nx < 0 || nz < 0 || nx >= this.cols || nz >= this.rows) continue
        const ncell = nz * this.cols + nx
        const [px, pz] = this.center(ncell)
        const reach = slope * (d >= 4 ? Math.SQRT2 : 1)
        const hit = standable(px, ys[n] + reach + 0.3, pz, reach * 2 + 0.3)
        if (!hit || Math.abs(hit.y - ys[n]) > reach) continue
        if (!probe.clear(xs[n], ys[n] + 0.95, zs[n], px, hit.y + 0.95, pz)) continue
        // A body is ~0.8 wide: thin poles and trunks slip between a single ray.
        const len = Math.hypot(dx, dz)
        const ox = (-dz / len) * BODY_HALF_WIDTH, oz = (dx / len) * BODY_HALF_WIDTH
        if (!probe.clear(xs[n] + ox, ys[n] + 0.6, zs[n] + oz, px + ox, hit.y + 0.6, pz + oz)) continue
        if (!probe.clear(xs[n] - ox, ys[n] + 0.6, zs[n] - oz, px - ox, hit.y + 0.6, pz - oz)) continue
        let m = find(ncell, hit.y)
        if (m < 0) m = add(ncell, px, hit.y, pz)
        links[n * 8 + d] = m
        const back = OPPOSITE[d]
        if (links[m * 8 + back] < 0) links[m * 8 + back] = n
      }
    }
    this.count = xs.length
    this.x = Float32Array.from(xs)
    this.y = Float32Array.from(ys)
    this.z = Float32Array.from(zs)
    this.cellOfNode = Int32Array.from(cells)
    this.tight = Uint8Array.from(tight)
    this.links = Int32Array.from(links)
    this.allocateSearch()
  }

  private allocateSearch(): void {
    this.g = new Float32Array(this.count)
    this.f = new Float32Array(this.count)
    this.parent = new Int32Array(this.count)
    this.stamp = new Uint32Array(this.count)
    this.closed = new Uint32Array(this.count)
  }

  /**
   * Compact binary snapshot, 13 bytes per node: cell, floor height, the 8 links as the layer index
   * of the target inside the neighbouring cell (4 bits each), and the tight flag. Node x/z are the
   * cell centres and per-cell layer lists keep node order, so deserialize() restores the graph exactly.
   */
  serialize(): Uint8Array {
    const n = this.count
    const layerOf = new Uint8Array(n)
    for (const list of this.layers.values()) list.forEach((node, i) => (layerOf[node] = i))
    const packed = new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      let word = 0
      for (let d = 0; d < 8; d++) {
        const m = this.links[i * 8 + d]
        if (m >= 0 && layerOf[m] >= NO_LINK) throw new Error(`nav cell ${this.cellOfNode[m]} has more than ${NO_LINK} layers`)
        word |= (m < 0 ? NO_LINK : layerOf[m]) << (d * 4)
      }
      packed[i] = word >>> 0
    }
    const out = new ArrayBuffer(NAV_HEADER + n * 13)
    const dv = new DataView(out)
    ;[NAV_MAGIC, NAV_VERSION, n, this.cols, this.rows].forEach((v, i) => dv.setUint32(i * 4, v, true))
    ;[this.cell, this.bounds.minX, this.bounds.minZ, this.bounds.maxX, this.bounds.maxZ].forEach((v, i) => dv.setFloat32(20 + i * 4, v, true))
    new Int32Array(out, NAV_HEADER, n).set(this.cellOfNode)
    new Float32Array(out, NAV_HEADER + n * 4, n).set(this.y)
    new Uint32Array(out, NAV_HEADER + n * 8, n).set(packed)
    new Uint8Array(out, NAV_HEADER + n * 12, n).set(this.tight)
    return new Uint8Array(out)
  }

  /** Graph written by serialize(), or null when it was built for another grid (stale asset). */
  static deserialize(buf: ArrayBuffer, bounds: NavBounds, cell: number): NavGraph | null {
    if (buf.byteLength < NAV_HEADER) return null
    const dv = new DataView(buf)
    const nav = new NavGraph(bounds, cell)
    const n = dv.getUint32(8, true)
    const grid = [cell, bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ].every((v, i) => dv.getFloat32(20 + i * 4, true) === Math.fround(v))
    const valid = dv.getUint32(0, true) === NAV_MAGIC && dv.getUint32(4, true) === NAV_VERSION && dv.getUint32(12, true) === nav.cols && dv.getUint32(16, true) === nav.rows
    if (!valid || !grid || buf.byteLength < NAV_HEADER + n * 13) return null
    nav.count = n
    nav.cellOfNode = new Int32Array(buf.slice(NAV_HEADER, NAV_HEADER + n * 4))
    nav.y = new Float32Array(buf.slice(NAV_HEADER + n * 4, NAV_HEADER + n * 8))
    const packed = new Uint32Array(buf, NAV_HEADER + n * 8, n)
    nav.tight = new Uint8Array(buf.slice(NAV_HEADER + n * 12, NAV_HEADER + n * 13))
    nav.x = new Float32Array(n)
    nav.z = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const c = nav.cellOfNode[i]
      const [x, z] = nav.center(c)
      nav.x[i] = x
      nav.z[i] = z
      const list = nav.layers.get(c)
      if (list) list.push(i)
      else nav.layers.set(c, [i])
    }
    nav.links = new Int32Array(n * 8).fill(-1)
    for (let i = 0; i < n; i++) {
      const c = nav.cellOfNode[i]
      const cx = c % nav.cols
      const cz = (c - cx) / nav.cols
      for (let d = 0; d < 8; d++) {
        const layer = (packed[i] >>> (d * 4)) & 0xf
        if (layer === NO_LINK) continue
        const target = nav.layers.get((cz + DIRS[d][1]) * nav.cols + cx + DIRS[d][0])?.[layer]
        if (target === undefined) return null
        nav.links[i * 8 + d] = target
      }
    }
    nav.allocateSearch()
    return nav
  }

  /** Nearest node to a world point, preferring the layer closest in height. */
  nearest(p: Point, maxRing = 6): number {
    const cx = Math.floor((p.x - this.bounds.minX) / this.cell)
    const cz = Math.floor((p.z - this.bounds.minZ) / this.cell)
    for (let r = 0; r <= maxRing; r++) {
      let best = -1
      let bestScore = Infinity
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const x = cx + dx, z = cz + dz
          if (x < 0 || z < 0 || x >= this.cols || z >= this.rows) continue
          const list = this.layers.get(z * this.cols + x)
          if (!list) continue
          for (const n of list) {
            const dy = this.y[n] - p.y
            // Floors above the point count as much farther: we are probably standing below them.
            const score = Math.hypot(this.x[n] - p.x, this.z[n] - p.z) + (dy > 0.5 ? dy * 4 : Math.abs(dy) * 1.5)
            if (score < bestScore) {
              bestScore = score
              best = n
            }
          }
        }
      }
      if (best >= 0) return best
    }
    return -1
  }

  point(n: number): Point {
    return { x: this.x[n], y: this.y[n], z: this.z[n] }
  }

  neighbours(n: number): number[] {
    const out: number[] = []
    for (let d = 0; d < 8; d++) {
      const m = this.links[n * 8 + d]
      if (m >= 0) out.push(m)
    }
    return out
  }

  /** Random node within `radius` (walking distance not guaranteed) of a point; for spawn spread. */
  randomNear(p: Point, radius: number, rand = Math.random): number {
    for (let i = 0; i < 20; i++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * radius
      const n = this.nearest({ x: p.x + Math.cos(a) * r, y: p.y, z: p.z + Math.sin(a) * r }, 2)
      if (n >= 0 && !this.tight[n]) return n
    }
    return this.nearest(p, 12)
  }

  /** Nodes on every layer of the cells within `r` of (x, z). */
  nodesNear(x: number, z: number, r: number): number[] {
    const out: number[] = []
    const cr = Math.ceil(r / this.cell)
    const cx = Math.floor((x - this.bounds.minX) / this.cell)
    const cz = Math.floor((z - this.bounds.minZ) / this.cell)
    for (let dz = -cr; dz <= cr; dz++) {
      for (let dx = -cr; dx <= cr; dx++) {
        const gx = cx + dx, gz = cz + dz
        if (gx < 0 || gz < 0 || gx >= this.cols || gz >= this.rows) continue
        if ((dx * dx + dz * dz) * this.cell * this.cell > r * r) continue
        const list = this.layers.get(gz * this.cols + gx)
        if (list) out.push(...list)
      }
    }
    return out
  }

  /** A* between two world points; returns waypoints (excluding the start) or null. */
  findPath(from: Point, to: Point, maxIterations = 80000): Point[] | null {
    const nodes = this.findNodes(from, to, maxIterations)
    if (!nodes) return null
    if (nodes.length === 1) return [to]
    const out: Point[] = []
    let anchor = nodes[0]
    for (let i = 1; i < nodes.length; i++) {
      if (i + 1 < nodes.length && this.walkLine(anchor, nodes[i + 1])) continue
      out.push(this.point(nodes[i]))
      anchor = nodes[i]
    }
    return out
  }

  /**
   * A* node sequence from the node nearest `from` to the one nearest `to`, or null. `penalty`
   * scales the cost of entering each node by (1 + penalty[n]), which steers the search off ground
   * that other routes already use.
   */
  findNodes(from: Point, to: Point, maxIterations = 80000, penalty?: Float32Array): number[] | null {
    const start = this.nearest(from)
    const goal = this.nearest(to)
    if (start < 0 || goal < 0) return null
    if (start === goal) return [start]
    const s = ++this.search
    const heap = this.heap
    heap.length = 0
    const gx = this.x[goal], gy = this.y[goal], gz = this.z[goal]
    const h = (n: number) => Math.hypot(this.x[n] - gx, (this.y[n] - gy) * 0.5, this.z[n] - gz)
    this.g[start] = 0
    this.f[start] = h(start)
    this.parent[start] = -1
    this.stamp[start] = s
    this.push(start)
    let found = false
    let iterations = 0
    while (heap.length && iterations++ < maxIterations) {
      const cur = this.pop()
      if (cur === goal) {
        found = true
        break
      }
      if (this.closed[cur] === s) continue
      this.closed[cur] = s
      for (let d = 0; d < 8; d++) {
        const m = this.links[cur * 8 + d]
        if (m < 0 || this.closed[m] === s) continue
        let step = (d >= 4 ? Math.SQRT2 : 1) * this.cell * (this.tight[m] ? 1.6 : 1) + Math.abs(this.y[m] - this.y[cur]) * 0.5
        if (penalty) step *= 1 + penalty[m]
        const cost = this.g[cur] + step
        if (this.stamp[m] === s && cost >= this.g[m]) continue
        this.stamp[m] = s
        this.g[m] = cost
        this.f[m] = cost + h(m)
        this.parent[m] = cur
        this.push(m)
      }
    }
    if (!found) return null
    const nodes: number[] = []
    for (let n = goal; n !== -1; n = this.parent[n]) nodes.push(n)
    return nodes.reverse()
  }

  /** True when a straight walk a→b steps only between linked nodes. */
  walkLine(a: number, b: number): boolean {
    const ax = this.x[a], az = this.z[a], bx = this.x[b], bz = this.z[b]
    const dist = Math.hypot(bx - ax, bz - az)
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.4)))
    let cur = a
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const cell = this.cellIndex(ax + (bx - ax) * t, az + (bz - az) * t)
      if (cell === this.cellOfNode[cur]) continue
      let next = -1
      for (let d = 0; d < 8; d++) {
        const m = this.links[cur * 8 + d]
        if (m >= 0 && this.cellOfNode[m] === cell) {
          next = m
          break
        }
      }
      if (next < 0 || this.tight[next]) return false
      cur = next
    }
    return cur === b || this.cellOfNode[cur] === this.cellOfNode[b]
  }

  private push(n: number): void {
    const heap = this.heap
    heap.push(n)
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
    if (heap.length) {
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

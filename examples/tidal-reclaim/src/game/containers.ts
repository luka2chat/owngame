import * as THREE from 'three'

/**
 * Procedural ISO shipping containers for the Kestrel Terminal arena.
 *
 * Geometry is built once per size (20 ft / 40 ft) and then stamped into the arena's merged
 * per-material buffers, so dozens of containers cost a handful of draw calls:
 *  - `paint`: trapezoid-corrugated side/end walls, roof, rails and corner posts (one per colour)
 *  - `steel`: corner castings, door locking rods, cam keepers, handles, hinges (dark galvanised)
 *  - `decal`: stencilled owner codes, size/type codes and CSC/weight tables from a canvas atlas
 * Every piece carries world-scaled UVs so the shared materials' grime and wear stay consistent.
 */

export const CONT_W = 2.44
export const CONT_H = 2.59
export const CONT_L = { 20: 6.06, 40: 12.19 } as const
export type ContSize = keyof typeof CONT_L

export type ContainerParts = { paint: THREE.BufferGeometry; steel: THREE.BufferGeometry; decal: (cell: number) => THREE.BufferGeometry }

/** Trapezoidal corrugation profile: offsets (outward) for a run of `len` metres. */
function profile(len: number, period: number, depth: number): { u: number; d: number }[] {
  const pts: { u: number; d: number }[] = []
  const n = Math.max(1, Math.round(len / period))
  const p = len / n
  for (let i = 0; i < n; i += 1) {
    const u0 = i * p
    pts.push({ u: u0, d: 0 }, { u: u0 + p * 0.18, d: 0 }, { u: u0 + p * 0.32, d: depth }, { u: u0 + p * 0.68, d: depth }, { u: u0 + p * 0.82, d: 0 })
  }
  pts.push({ u: len, d: 0 })
  return pts
}

/**
 * Corrugated panel in local space: spans u ∈ [-len/2, len/2] along X, v ∈ [-h/2, h/2] along Y,
 * ribs bulging toward +Z by `depth`. Indexed so the rib edges get softly averaged normals.
 */
function corrugated(len: number, h: number, period: number, depth: number): THREE.BufferGeometry {
  const prof = profile(len, period, depth)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i < prof.length; i += 1) {
    const x = prof[i].u - len / 2
    const z = prof[i].d
    pos.push(x, -h / 2, z, x, h / 2, z)
    uv.push(prof[i].u / 2, 0, prof[i].u / 2, h / 2)
    if (i > 0) {
      const a = (i - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  // Roughly world-scaled UVs (good enough for noise-driven wear).
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * Math.max(w, d) * 0.5, uv.getY(i) * h * 0.5)
  return g
}

function cyl(r: number, h: number, seg = 8): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, h, seg)
}

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1))
  const out = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m)
  for (const name of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(name)) out.deleteAttribute(name)
  return out
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0
  for (const g of list) count += g.getAttribute('position').count
  const pos = new Float32Array(count * 3)
  const nor = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  let o = 0
  for (const g of list) {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const n = g.getAttribute('normal') as THREE.BufferAttribute
    const t = g.getAttribute('uv') as THREE.BufferAttribute
    pos.set(p.array as Float32Array, o * 3)
    nor.set(n.array as Float32Array, o * 3)
    if (t) uv.set(t.array as Float32Array, o * 2)
    o += p.count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

const cache = new Map<ContSize, ContainerParts>()

/**
 * Container centred on its footprint with the floor at y = 0, length along local +X, doors at +X.
 */
export function containerParts(size: ContSize): ContainerParts {
  const hit = cache.get(size)
  if (hit) return hit
  const L = CONT_L[size]
  const W = CONT_W
  const H = CONT_H
  const post = 0.16
  const rail = 0.15
  const paint: THREE.BufferGeometry[] = []
  const steel: THREE.BufferGeometry[] = []
  const inL = L - post * 2
  const inW = W - post * 2
  const inH = H - rail * 2
  const depth = 0.036
  // Long side walls: corrugation along the length, ribs outward.
  const side = corrugated(inL, inH, 0.278, depth)
  paint.push(place(side, 0, H / 2, W / 2 - depth - 0.012))
  paint.push(place(side, 0, H / 2, -W / 2 + depth + 0.012, Math.PI))
  // Front (blind) end at -X.
  const end = corrugated(inW, inH, 0.3, 0.03)
  paint.push(place(end, -L / 2 + 0.045, H / 2, 0, -Math.PI / 2))
  // Door end at +X: two leaves with shallow vertical ribs.
  const leafW = inW / 2 - 0.01
  const leaf = corrugated(leafW, inH, 0.28, 0.018)
  for (const s of [-1, 1]) paint.push(place(leaf, L / 2 - 0.05, H / 2, s * (leafW / 2 + 0.005), Math.PI / 2))
  // Roof: slightly domed corrugation running across the width.
  const roof = corrugated(inL, inW, 0.35, 0.012)
  paint.push(place(roof, 0, H - 0.03, 0, 0, -Math.PI / 2))
  // Bottom (rarely seen) + rails + posts.
  paint.push(place(box(L, 0.08, W), 0, 0.04, 0))
  for (const s of [-1, 1]) {
    paint.push(place(box(L, rail, 0.14), 0, rail / 2, s * (W / 2 - 0.07)))
    paint.push(place(box(L, 0.12, 0.12), 0, H - 0.06, s * (W / 2 - 0.06)))
    paint.push(place(box(0.14, rail, W), s * (L / 2 - 0.07), rail / 2, 0))
    paint.push(place(box(0.12, 0.2, W), s * (L / 2 - 0.06), H - 0.1, 0))
    for (const t of [-1, 1]) paint.push(place(box(post, H, post), s * (L / 2 - post / 2), H / 2, t * (W / 2 - post / 2)))
  }
  // Corner castings (8): slightly proud, dark galvanised with apertures implied by shape.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const top of [0, 1]) {
    steel.push(place(box(0.18, 0.12, 0.17), sx * (L / 2 - 0.09), top ? H - 0.06 : 0.06, sz * (W / 2 - 0.085)))
  }
  // Door gear: 4 locking rods, cam keepers top/bottom, handles, hinges.
  const rx = L / 2 + 0.02
  for (const z of [-0.88, -0.36, 0.36, 0.88]) {
    steel.push(place(cyl(0.017, H - 0.32), rx, H / 2, z))
    for (const y of [0.24, H - 0.24]) steel.push(place(box(0.05, 0.09, 0.07), rx, y, z))
    steel.push(place(box(0.035, 0.04, 0.32), rx + 0.02, 1.15, z + (z > 0 ? -0.12 : 0.12)))
  }
  for (const z of [-W / 2 + 0.17, W / 2 - 0.17]) for (const y of [0.45, 1.3, 2.15]) steel.push(place(box(0.06, 0.12, 0.08), rx - 0.01, y, z))
  // Forklift pockets on 20 ft boxes.
  if (size === 20) for (const x of [-1.05, 1.05]) for (const s of [-1, 1]) steel.push(place(box(0.36, 0.11, 0.02), x, 0.1, s * (W / 2 + 0.001)))
  const decal = (cell: number) => {
    const quads: THREE.BufferGeometry[] = []
    const q = (w: number, h: number, u0: number, v0: number, u1: number, v1: number, x: number, y: number, z: number, ry: number) => {
      const g = new THREE.PlaneGeometry(w, h)
      const uv = g.getAttribute('uv') as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i))
      quads.push(place(g, x, y, z, ry))
    }
    const [cu, cv] = atlasCell(cell)
    // Door end: the full cell (owner code, type code, weight table).
    q(1.7, 1.7, cu, cv, cu + CELL_U, cv + CELL_V, L / 2 + 0.035, H - 1.06, 0, Math.PI / 2)
    // Sides: owner-code strip near the top corner by the doors.
    for (const s of [-1, 1]) {
      const x = L / 2 - 1.15
      q(1.7, 0.425, cu, cv + CELL_V * 0.75, cu + CELL_U, cv + CELL_V, s > 0 ? x : x, H - 0.42, s * (W / 2 + 0.006), s > 0 ? 0 : Math.PI)
    }
    return merge(quads)
  }
  const parts = { paint: merge(paint), steel: merge(steel), decal }
  cache.set(size, parts)
  return parts
}

// ─── stencil atlas ─────────────────────────────────────────────────────────
const COLS = 4
const ROWS = 2
const CELL_U = 1 / COLS
const CELL_V = 1 / ROWS
export const DECAL_CELLS = COLS * ROWS

function atlasCell(i: number): [number, number] {
  const c = i % COLS
  const r = Math.floor(i / COLS) % ROWS
  return [c * CELL_U, 1 - (r + 1) * CELL_V]
}

/** Fictional, logo-free owner codes (ISO 6346 style: 3-letter owner + U, serial, check digit). */
const OWNERS = ['KRTU', 'MSLU', 'TGHU', 'OCEU', 'BLKU', 'HRZU', 'SKYU', 'NRDU']

/** Canvas atlas of stencilled container markings (white paint with wear, alpha = paint). */
export function containerDecalAtlas(): THREE.CanvasTexture {
  const cell = 512
  const c = document.createElement('canvas')
  c.width = cell * COLS
  c.height = cell * ROWS
  const g = c.getContext('2d')!
  g.clearRect(0, 0, c.width, c.height)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < DECAL_CELLS; i += 1) {
    const ox = (i % COLS) * cell
    const oy = Math.floor(i / COLS) * cell
    g.save()
    g.translate(ox, oy)
    g.fillStyle = i % 4 === 3 ? 'rgba(20,20,20,0.92)' : 'rgba(236,236,230,0.95)'
    g.strokeStyle = g.fillStyle
    g.textBaseline = 'top'
    const serial = String(Math.floor(100000 + rnd() * 899999))
    g.font = 'bold 76px "Arial Narrow", Arial, sans-serif'
    g.fillText(`${OWNERS[i]} ${serial}`, 18, 22)
    g.lineWidth = 5
    const w = g.measureText(`${OWNERS[i]} ${serial}`).width
    g.strokeRect(w + 30, 18, 58, 84)
    g.fillText(String(Math.floor(rnd() * 10)), w + 40, 22)
    g.font = 'bold 64px "Arial Narrow", Arial, sans-serif'
    g.fillText(i % 2 ? '45G1' : '22G1', 18, 120)
    // Weight table.
    g.font = 'bold 30px Arial, sans-serif'
    const rows = [['MAX GROSS', `${30 + Math.floor(rnd() * 3)},480 KG`], ['TARE', `${2 + Math.floor(rnd() * 2)},${Math.floor(100 + rnd() * 800)} KG`], ['NET', `${27 + Math.floor(rnd() * 2)},${Math.floor(100 + rnd() * 800)} KG`], ['CU.CAP.', `${i % 2 ? '76.3' : '33.2'} CU.M`]]
    rows.forEach(([k, v], r) => {
      g.fillText(k, 18, 230 + r * 44)
      g.fillText(v, 230, 230 + r * 44)
    })
    // CSC plate + hazard diamond on some.
    g.lineWidth = 3
    g.strokeRect(18, 420, 150, 70)
    g.font = 'bold 22px Arial, sans-serif'
    g.fillText('CSC SAFETY', 28, 432)
    g.fillText('APPROVAL', 28, 458)
    if (i % 3 === 0) {
      g.save()
      g.translate(400, 440)
      g.rotate(Math.PI / 4)
      g.strokeRect(-36, -36, 72, 72)
      g.restore()
    }
    // Wear: erase speckles and scrapes so the paint reads as stencilled and weathered.
    g.globalCompositeOperation = 'destination-out'
    for (let k = 0; k < 900; k += 1) {
      g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`
      g.fillRect(rnd() * cell, rnd() * cell, 1 + rnd() * 4, 1 + rnd() * 3)
    }
    for (let k = 0; k < 7; k += 1) {
      g.fillStyle = `rgba(0,0,0,${0.4 + rnd() * 0.5})`
      g.fillRect(rnd() * cell, rnd() * cell, 20 + rnd() * 90, 2 + rnd() * 5)
    }
    // Stencil bridges: thin vertical gaps every few characters.
    for (let x = 60; x < cell; x += 47 + rnd() * 10) g.fillRect(x, 20, 3, 90)
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Weathered ISO colours (desaturated, never neon): rust red, navy, olive, orange, grey, maroon, teal, cream. */
export const CONTAINER_COLORS = ['#7d3424', '#23435e', '#4a5a34', '#a65b22', '#6c6a64', '#5c2626', '#2f5d5a', '#a89f88']

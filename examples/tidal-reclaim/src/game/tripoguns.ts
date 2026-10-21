import * as THREE from 'three'
import { flashGroup, redDotTexture, viewmodelMaterial, type ViewModel } from './guns'

/**
 * First-person weapons built from Tripo-reconstructed PBR models (rifle, shotgun, launcher,
 * gloved forearms). Each GLB is baked to float geometry in its normalised frame (barrel −Z,
 * up +Y, right +X), scaled to real size and translated so its pistol grip lands where the
 * procedural viewmodels had theirs — the Arsenal's hip/ADS/recoil choreography is unchanged.
 * Moving parts (magazine, pump) are split out of the single scanned mesh by triangle region and
 * share its vertex buffers, so they cost one extra draw call each and no extra memory.
 */
export type VmAssets = Partial<Record<'rifle' | 'shotgun' | 'launcher' | 'rocket' | 'armR' | 'armL', THREE.Object3D>>

type V3 = [number, number, number]
type Baked = { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }

/** Copy every mesh under `root` into float32 geometry expressed in root space (dequantised). */
export function bakeMeshes(root: THREE.Object3D): Baked[] {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const out: Baked[] = []
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const src = m.geometry
    const g = new THREE.BufferGeometry()
    for (const name of ['position', 'normal', 'uv']) {
      const a = src.getAttribute(name) as THREE.BufferAttribute | undefined
      if (!a) continue
      const arr = new Float32Array(a.count * a.itemSize)
      for (let i = 0; i < a.count; i += 1) for (let k = 0; k < a.itemSize; k += 1) arr[i * a.itemSize + k] = a.getComponent(i, k)
      g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize))
    }
    if (src.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array as ArrayLike<number>), 1))
    else g.setIndex([...Array(g.getAttribute('position').count).keys()])
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
    out.push({ geo: g, mat: (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial })
  })
  return out
}

/** Split triangles by centroid predicate; both halves share the source vertex buffers. */
function split(g: THREE.BufferGeometry, pick: (c: THREE.Vector3) => boolean): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const idx = g.index!.array
  const pos = g.getAttribute('position')
  const keep: number[] = []
  const moved: number[] = []
  const c = new THREE.Vector3()
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i]
    const b = idx[i + 1]
    const d = idx[i + 2]
    c.set((pos.getX(a) + pos.getX(b) + pos.getX(d)) / 3, (pos.getY(a) + pos.getY(b) + pos.getY(d)) / 3, (pos.getZ(a) + pos.getZ(b) + pos.getZ(d)) / 3)
    ;(pick(c) ? moved : keep).push(a, b, d)
  }
  const mk = (list: number[]) => {
    const n = new THREE.BufferGeometry()
    for (const [name, attr] of Object.entries(g.attributes)) n.setAttribute(name, attr)
    n.setIndex(list)
    n.computeBoundingSphere()
    return n
  }
  return [mk(keep), mk(moved)]
}

const matCache = new Map<THREE.Material, THREE.MeshStandardMaterial>()
function vmMat(src: THREE.MeshStandardMaterial, env = 0.85): THREE.MeshStandardMaterial {
  let m = matCache.get(src)
  if (!m) {
    m = viewmodelMaterial(src.clone())
    m.envMapIntensity = env
    for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t) t.anisotropy = 8
    matCache.set(src, m)
  }
  return m
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.frustumCulled = false
  m.castShadow = false
  m.receiveShadow = false
  return m
}

/** Bake + scale + translate so normalised point `from` lands on viewmodel point `to`. */
function place(src: THREE.Object3D, s: number, from: V3, to: V3): { baked: Baked[]; X: (p: V3) => THREE.Vector3 } {
  const T = new THREE.Vector3(to[0] - s * from[0], to[1] - s * from[1], to[2] - s * from[2])
  const baked = bakeMeshes(src)
  for (const b of baked) {
    b.geo.scale(s, s, s)
    b.geo.translate(T.x, T.y, T.z)
  }
  return { baked, X: p => new THREE.Vector3(p[0] * s + T.x, p[1] * s + T.y, p[2] * s + T.z) }
}

// ─── arms ───────────────────────────────────────────────────────────────
/** Arm pose: `at` = where the hand's grip centre goes; rot = YXZ Euler (x pitches the elbow down,
 * y swings it outward, z rolls the forearm). */
export type ArmPose = { at: V3; rot: V3 }
const ARM_SCALE = 0.46
/** Grip-hole centres in the normalised arm models (hand toward −Z, sleeve cut at +Z). */
const HOLE: Record<'armR' | 'armL', V3> = { armR: [0.02, 0.0, -0.26], armL: [0.0, -0.02, -0.26] }

export function buildArm(src: THREE.Object3D, side: 'armR' | 'armL', pose: ArmPose): THREE.Group {
  const g = new THREE.Group()
  g.name = side
  const h = HOLE[side]
  for (const b of bakeMeshes(src)) {
    b.geo.translate(-h[0], -h[1], -h[2])
    b.geo.scale(ARM_SCALE, ARM_SCALE, ARM_SCALE)
    g.add(mesh(b.geo, vmMat(b.mat, 0.7)))
  }
  setArmPose(g, pose)
  return g
}
export function setArmPose(g: THREE.Object3D, pose: ArmPose): void {
  g.position.set(...pose.at)
  g.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2], 'YXZ')
}

/** Tunable arm poses per weapon (exposed so the lab page can iterate on them). */
export const ARM_POSES: Record<'rifle' | 'shotgun' | 'rocket', { right: ArmPose; left: ArmPose }> = {
  rifle: { right: { at: [0.005, -0.1, 0.06], rot: [0.75, 0.35, -0.6] }, left: { at: [-0.01, -0.045, -0.33], rot: [0.9, -0.55, 0.63] } },
  shotgun: { right: { at: [0.005, -0.09, 0.12], rot: [0.75, 0.35, -0.6] }, left: { at: [-0.005, -0.035, 0], rot: [0.9, -0.55, 0.63] } },
  rocket: { right: { at: [0.005, -0.15, 0.04], rot: [0.75, 0.35, -0.6] }, left: { at: [0.005, -0.14, -0.17], rot: [0.8, -0.35, -0.2] } },
}

// ─── weapons ────────────────────────────────────────────────────────────
function finish(root: THREE.Group, muzzlePos: THREE.Vector3, flashTex: THREE.Texture, flameTex: THREE.Texture, flashScale: number) {
  const muzzle = new THREE.Object3D()
  muzzle.position.copy(muzzlePos)
  root.add(muzzle)
  const flash = flashGroup(flashTex, flameTex, flashScale)
  flash.position.copy(muzzlePos)
  root.add(flash)
  return { muzzle, flash }
}

function addArms(root: THREE.Object3D, A: VmAssets, id: keyof typeof ARM_POSES, leftParent?: THREE.Object3D): void {
  const P = ARM_POSES[id]
  if (A.armR) root.add(buildArm(A.armR, 'armR', P.right))
  if (A.armL) (leftParent ?? root).add(buildArm(A.armL, 'armL', P.left))
}

export function buildTripoRifle(A: VmAssets, flashTex: THREE.Texture, flameTex: THREE.Texture): ViewModel {
  const root = new THREE.Group()
  const { baked, X } = place(A.rifle!, 0.86, [0, -0.088, 0.2], [0, -0.1, 0.06])
  const magPivot = X([0, -0.035, 0])
  let mag: THREE.Group | undefined
  for (const b of baked) {
    const mat = vmMat(b.mat)
    // Magazine: below the magwell lip, between the magwell front and the trigger guard.
    const zf = X([0, 0, -0.075]).z
    const zr = X([0, 0, 0.055]).z
    const [body, magGeo] = split(b.geo, c => c.y < magPivot.y && c.z > zf && c.z < zr)
    root.add(mesh(body, mat))
    mag = new THREE.Group()
    const mm = mesh(magGeo, mat)
    mm.position.copy(magPivot).negate()
    mag.add(mm)
    mag.position.copy(magPivot)
    root.add(mag)
  }
  // Red-dot optic: faintly tinted coated lens in the sight window plus an additive LED dot that
  // sits exactly on the sight line, so at ADS (right mouse) the dot is the aiming point.
  // +15 mm: centre of the scanned EOTech window (the old line grazed its lower frame and hid the dot).
  const sightY = X([0, 0.155, 0]).y + 0.015
  const lensZ = X([0, 0, 0.02]).z
  const lens = mesh(new THREE.PlaneGeometry(0.03, 0.026), viewmodelMaterial(new THREE.MeshBasicMaterial({ color: 0x6a8a7a, transparent: true, opacity: 0.12, depthWrite: false })))
  lens.position.set(0, sightY, lensZ - 0.001)
  lens.renderOrder = 4
  root.add(lens)
  const glass = mesh(new THREE.PlaneGeometry(0.03, 0.03), viewmodelMaterial(new THREE.MeshBasicMaterial({ map: redDotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(3.2, 1.1, 1), toneMapped: false })))
  glass.position.set(0, sightY, lensZ)
  glass.renderOrder = 5
  root.add(glass)
  const eject = new THREE.Object3D()
  eject.position.copy(X([0.045, 0.06, 0.03]))
  root.add(eject)
  const { muzzle, flash } = finish(root, X([0, 0.059, -0.49]), flashTex, flameTex, 1)
  addArms(root, A, 'rifle')
  return { root, muzzle, eject, mag, magRest: mag?.position.clone(), sightY, sightZ: glass.position.z, flash, hip: new THREE.Vector3(0.15, -0.175, -0.36), ads: { x: 0, z: -0.17 } }
}

export function buildTripoShotgun(A: VmAssets, flashTex: THREE.Texture, flameTex: THREE.Texture): ViewModel {
  const root = new THREE.Group()
  const { baked, X } = place(A.shotgun!, 0.97, [0, -0.066, 0.23], [0, -0.09, 0.12])
  const pivot = X([0, 0.005, -0.265])
  const z0 = X([0, 0, -0.375]).z
  const z1 = X([0, 0, -0.155]).z
  const y0 = X([0, -0.035, 0]).y
  const y1 = X([0, 0.045, 0]).y
  const pump = new THREE.Group()
  // The scanned sight bumps sit above the sight line and read as blobs at ADS: cut them out and
  // replace them with machined parts (see shotgunSights).
  const bump = (c: THREE.Vector3) => Math.abs(c.x) < 0.032 && ((c.z > -0.04 && c.z < 0.05 && c.y > 0.067) || (c.z > -0.552 && c.z < -0.508 && c.y > 0.058))
  for (const b of baked) {
    const mat = vmMat(b.mat)
    const [raw, pumpGeo] = split(b.geo, c => c.z > z0 && c.z < z1 && c.y > y0 && c.y < y1)
    const [body] = split(raw, c => bump(c))
    root.add(mesh(body, mat))
    const pm = mesh(pumpGeo, mat)
    pm.position.copy(pivot).negate()
    pump.add(pm)
  }
  pump.position.copy(pivot)
  root.add(pump)
  const eject = new THREE.Object3D()
  eject.position.copy(X([0.06, 0.05, 0.05]))
  root.add(eject)
  const { muzzle, flash } = finish(root, X([0, 0.059, -0.49]), flashTex, flameTex, 1.7)
  addArms(root, A, 'shotgun', pump)
  const sight = shotgunSights(root)
  return { root, muzzle, eject, pump, pumpRest: pump.position.clone(), sightY: sight.y, sightZ: sight.z, flash, hip: new THREE.Vector3(0.16, -0.18, -0.36), ads: { x: 0, z: -0.235 } }
}

/**
 * Machined combat sights for the shotgun (root space, metres; barrel along −Z):
 * - rear: ghost-ring aperture on a receiver base, flanked by protective wings;
 * - front: blade on a ramp at the muzzle with a green fiber-optic rod whose end sits exactly on
 *   the aperture centre, so at ADS the glowing dot lands dead-centre in the ring.
 * Receiver top ≈ 0.066, barrel top ≈ 0.056 (measured profile of the Tripo mesh).
 */
function shotgunSights(root: THREE.Object3D): { y: number; z: number } {
  const steel = viewmodelMaterial(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, metalness: 0.55, roughness: 0.5 }))
  steel.envMapIntensity = 0.5
  const edge = viewmodelMaterial(new THREE.MeshStandardMaterial({ color: 0x3a3b3d, metalness: 0.7, roughness: 0.32 }))
  edge.envMapIntensity = 0.5
  const fiber = viewmodelMaterial(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 0.55), toneMapped: false }))
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const o = mesh(g, m)
    o.position.set(x, y, z)
    o.rotation.x = rx
    o.renderOrder = 2
    root.add(o)
    return o
  }
  const RECV = 0.066, BARREL = 0.056
  const R = 0.0098, hole = 0.0058
  const Y = RECV + 0.0045 + R
  const ZR = 0.006, ZF = -0.532
  // Rear: base block, aperture disc with a bored hole, wings.
  add(new THREE.BoxGeometry(0.03, 0.0055, 0.032), steel, 0, RECV + 0.0026, ZR + 0.004)
  const ring = new THREE.Shape()
  ring.absarc(0, 0, R, 0, Math.PI * 2, false)
  const h = new THREE.Path()
  h.absarc(0, 0, hole, 0, Math.PI * 2, true)
  ring.holes.push(h)
  const disc = new THREE.ExtrudeGeometry(ring, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 1, curveSegments: 28 })
  disc.translate(0, 0, -0.002)
  add(disc, edge, 0, Y, ZR)
  add(new THREE.BoxGeometry(0.008, Y - RECV - 0.004, 0.006), steel, 0, (Y + RECV) / 2 - 0.004, ZR)
  for (const sx of [-1, 1]) {
    const wing = new THREE.BoxGeometry(0.0032, 0.03, 0.022)
    wing.translate(0, 0.015, 0)
    const w = add(wing, steel, sx * 0.0145, RECV + 0.004, ZR + 0.003)
    w.rotation.z = -sx * 0.06
  }
  // Front: ramp, blade, fiber-optic rod (its rear end is the aiming dot) and two guard ears.
  const ramp = new THREE.BoxGeometry(0.009, 0.006, 0.03)
  add(ramp, steel, 0, BARREL + 0.002, ZF)
  const bladeH = Y - BARREL - 0.002
  add(new THREE.BoxGeometry(0.0052, bladeH, 0.016), steel, 0, BARREL + 0.004 + bladeH / 2 - 0.002, ZF)
  const rod = new THREE.CylinderGeometry(0.0029, 0.0029, 0.014, 14)
  rod.rotateX(Math.PI / 2)
  add(rod, fiber, 0, Y, ZF)
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.0028, bladeH + 0.004, 0.012), steel, sx * 0.0095, BARREL + 0.004 + bladeH / 2 - 0.001, ZF + 0.002)
  return { y: Y, z: ZR }
}

export function buildTripoRocket(A: VmAssets, flashTex: THREE.Texture, flameTex: THREE.Texture): ViewModel {
  const root = new THREE.Group()
  const { baked, X } = place(A.launcher!, 1.12, [0, -0.12, 0.01], [0, -0.15, 0.04])
  for (const b of baked) root.add(mesh(b.geo, vmMat(b.mat)))
  const muzzlePos = X([0, -0.01, -0.47])
  const warhead = new THREE.Group()
  if (A.rocket) {
    // Rocket model: nose toward −Z, 0.98 normalised length → 0.66 m; tail sits inside the tube.
    const rs = 0.66
    for (const b of bakeMeshes(A.rocket)) {
      b.geo.scale(rs, rs, rs)
      warhead.add(mesh(b.geo, vmMat(b.mat)))
    }
    warhead.position.set(muzzlePos.x, muzzlePos.y, muzzlePos.z + 0.33 - 0.2)
  }
  root.add(warhead)
  const { muzzle, flash } = finish(root, muzzlePos, flashTex, flameTex, 2.4)
  addArms(root, A, 'rocket')
  return { root, muzzle, warhead, sightY: X([0, 0.125, 0]).y, sightZ: X([0, 0, 0.01]).z, flash, hip: new THREE.Vector3(0.26, -0.22, -0.22), ads: { x: -0.075, y: -0.075, z: -0.3 } }
}

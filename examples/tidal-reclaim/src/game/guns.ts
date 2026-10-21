import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { noiseTexture } from './library'

/**
 * Procedural first-person weapons. Parts are merged per material into a few meshes, with separate
 * animated sub-groups (magazine, pump, bolt, warhead). All viewmodel materials use a depth
 * compression hack so the gun never clips into walls while still self-occluding correctly.
 *
 * Local frame: barrel points -Z, up +Y, right +X, metres.
 */
export type ViewModel = {
  root: THREE.Group
  /** Muzzle tip (flash + tracer origin). */
  muzzle: THREE.Object3D
  /** Ejection port (shells). */
  eject?: THREE.Object3D
  mag?: THREE.Object3D
  /** Rest positions of animated pieces (reload / pump choreography offsets from these). */
  magRest?: THREE.Vector3
  pumpRest?: THREE.Vector3
  pump?: THREE.Object3D
  bolt?: THREE.Object3D
  warhead?: THREE.Object3D
  /** Height of the sight line above the gun origin (for aim-down-sights alignment). */
  sightY: number
  sightZ: number
  flash: THREE.Group
  /** Optional per-model hip pose (camera space) overriding the weapon default. */
  hip?: THREE.Vector3
  /** Optional ADS pose: x = lateral offset, y = height (default −sightY), z = distance in front of the eye. */
  ads?: { x: number; y?: number; z: number }
}

const loader = { noise: undefined as THREE.Texture | undefined }
function roughNoise(): THREE.Texture {
  loader.noise ??= noiseTexture(256, 7, 6, 1.6)
  return loader.noise
}

/** Compress depth so the viewmodel always renders in front of the world. */
export function viewmodelMaterial<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  gl_Position.z = mix(-gl_Position.w, gl_Position.z, 0.04);',
    )
  }
  m.customProgramCacheKey = () => 'viewmodel'
  return m
}

type Mats = Record<'gunmetal' | 'polymer' | 'tan' | 'steel' | 'dark' | 'olive' | 'glove' | 'sleeve' | 'brass' | 'red' | 'rubber', THREE.MeshStandardMaterial>
let mats: Mats | undefined
export function weaponMats(): Mats {
  if (mats) return mats
  const n = roughNoise()
  const mk = (color: string, metalness: number, roughness: number, env = 1) =>
    viewmodelMaterial(new THREE.MeshStandardMaterial({ color, metalness, roughness, roughnessMap: n, envMapIntensity: env }))
  mats = {
    gunmetal: mk('#34363a', 0.7, 0.52, 0.55),
    polymer: mk('#222326', 0.05, 0.72, 0.6),
    tan: mk('#8b7555', 0.1, 0.7, 0.6),
    steel: mk('#4a4c50', 0.85, 0.42, 0.6),
    dark: mk('#0d0d0e', 0.4, 0.6, 0.6),
    olive: mk('#4a5136', 0.04, 0.9, 0.45),
    glove: mk('#23221f', 0.0, 0.85, 0.7),
    sleeve: mk('#4a4a3c', 0.0, 0.95, 0.6),
    brass: mk('#c49a4c', 0.9, 0.38, 0.7),
    red: mk('#8a1a14', 0.1, 0.55, 0.8),
    rubber: mk('#141414', 0, 0.9, 0.5),
  }
  return mats
}

class Builder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
  add(mat: THREE.Material, geo: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)))
    const list = this.parts.get(mat) ?? []
    list.push(g)
    this.parts.set(mat, list)
    return this
  }
  box(mat: THREE.Material, w: number, h: number, d: number, pos: [number, number, number], rot?: [number, number, number], r = 0.006): this {
    return this.add(mat, r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d), pos, rot)
  }
  /** Cylinder along Z. */
  tube(mat: THREE.Material, r0: number, r1: number, len: number, pos: [number, number, number], seg = 16, rot: [number, number, number] = [Math.PI / 2, 0, 0]): this {
    return this.add(mat, new THREE.CylinderGeometry(r1, r0, len, seg), pos, rot)
  }
  build(group: THREE.Object3D): void {
    for (const [mat, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false)!, mat)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      group.add(mesh)
    }
    this.parts.clear()
  }
}

export function flashGroup(flashTex: THREE.Texture, flameTex: THREE.Texture, scale: number): THREE.Group {
  const g = new THREE.Group()
  const mk = (tex: THREE.Texture) =>
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, color: new THREE.Color(2.4, 1.7, 1.1), side: THREE.DoubleSide, toneMapped: false })
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * scale, 0.16 * scale), mk(flashTex))
  front.name = 'front'
  g.add(front)
  for (let i = 0; i < 3; i += 1) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.1 * scale, 0.26 * scale), mk(flameTex))
    side.geometry.translate(0, 0.13 * scale, 0)
    side.rotation.set(-Math.PI / 2, 0, 0)
    side.rotateY((i * Math.PI) / 3)
    g.add(side)
  }
  g.traverse(o => {
    o.renderOrder = 1000
    o.frustumCulled = false
  })
  g.visible = false
  return g
}

/**
 * Red-dot reticle: a small hard emitter core with a faint LED halo (≈2 MOA dot look at ADS).
 * Drawn on black-free transparent canvas and rendered additively so it reads as projected light.
 */
export function redDotTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const halo = ctx.createRadialGradient(128, 128, 0, 128, 128, 30)
  halo.addColorStop(0, 'rgba(255,40,24,0.7)')
  halo.addColorStop(0.35, 'rgba(255,20,10,0.2)')
  halo.addColorStop(1, 'rgba(255,0,0,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, 256, 256)
  const core = ctx.createRadialGradient(128, 128, 0, 128, 128, 9)
  core.addColorStop(0, 'rgba(255,235,225,1)')
  core.addColorStop(0.45, 'rgba(255,70,45,1)')
  core.addColorStop(1, 'rgba(255,30,20,0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(128, 128, 9, 0, Math.PI * 2)
  ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.generateMipmaps = true
  t.anisotropy = 4
  return t
}
export function reticleTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, 128, 128)
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 10)
  grad.addColorStop(0, 'rgba(255,60,40,1)')
  grad.addColorStop(0.35, 'rgba(255,40,30,0.9)')
  grad.addColorStop(1, 'rgba(255,0,0,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(64, 64, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,50,35,0.85)'
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.arc(64, 64, 34, 0, Math.PI * 2)
  ctx.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function picatinny(b: Builder, mat: THREE.Material, y: number, z0: number, z1: number, w = 0.022): void {
  const len = Math.abs(z1 - z0)
  b.box(mat, w, 0.008, len, [0, y, (z0 + z1) / 2], undefined, 0.002)
  for (let z = Math.min(z0, z1) + 0.005; z < Math.max(z0, z1) - 0.003; z += 0.01) b.box(mat, w + 0.004, 0.006, 0.005, [0, y + 0.006, z], undefined, 0)
}

export function buildRifle(flashTex: THREE.Texture, flameTex: THREE.Texture): ViewModel {
  const M = weaponMats()
  const root = new THREE.Group()
  const b = new Builder()
  // Upper receiver and lower.
  b.box(M.gunmetal, 0.056, 0.062, 0.3, [0, 0.022, -0.06], undefined, 0.008)
  b.box(M.gunmetal, 0.05, 0.05, 0.2, [0, -0.028, -0.01], undefined, 0.008)
  b.box(M.dark, 0.004, 0.022, 0.07, [0.029, 0.03, -0.04], undefined, 0.001) // ejection port
  b.box(M.gunmetal, 0.012, 0.014, 0.03, [0.031, 0.025, -0.002], undefined, 0.003) // forward assist
  b.box(M.steel, 0.036, 0.012, 0.03, [0, 0.05, 0.1], undefined, 0.003) // charging handle
  // Magwell.
  b.box(M.gunmetal, 0.046, 0.06, 0.085, [0, -0.07, -0.075], [0.08, 0, 0], 0.006)
  // Pistol grip + trigger guard + trigger.
  b.box(M.polymer, 0.034, 0.12, 0.05, [0, -0.1, 0.06], [-0.38, 0, 0], 0.012)
  b.box(M.gunmetal, 0.008, 0.006, 0.075, [0, -0.07, 0.012], undefined, 0.002)
  b.box(M.steel, 0.006, 0.022, 0.006, [0, -0.06, 0.005], [0.3, 0, 0], 0.001)
  // Buffer tube + stock.
  b.tube(M.gunmetal, 0.017, 0.017, 0.2, [0, 0.012, 0.18])
  b.box(M.tan, 0.046, 0.085, 0.17, [0, -0.012, 0.3], undefined, 0.014)
  b.box(M.tan, 0.04, 0.03, 0.12, [0, 0.04, 0.29], undefined, 0.01)
  b.box(M.rubber, 0.048, 0.12, 0.018, [0, -0.02, 0.39], undefined, 0.008)
  // Handguard (octagonal) with M-LOK slots.
  b.add(M.tan, new THREE.CylinderGeometry(0.034, 0.034, 0.32, 8), [0, 0.02, -0.37], [Math.PI / 2, Math.PI / 8, 0])
  for (let i = 0; i < 5; i += 1) {
    for (const s of [-1, 1]) b.box(M.dark, 0.004, 0.012, 0.035, [s * 0.032, 0.02, -0.25 - i * 0.055], undefined, 0.002)
    b.box(M.dark, 0.012, 0.004, 0.035, [0, -0.013, -0.25 - i * 0.055], undefined, 0.002)
  }
  picatinny(b, M.gunmetal, 0.057, 0.1, -0.52)
  // Vertical grip.
  b.tube(M.polymer, 0.017, 0.015, 0.085, [0, -0.045, -0.36], 12, [0, 0, 0])
  // Barrel, gas block and muzzle brake.
  b.tube(M.steel, 0.011, 0.011, 0.16, [0, 0.02, -0.6])
  b.box(M.gunmetal, 0.026, 0.03, 0.024, [0, 0.022, -0.54], undefined, 0.004)
  b.tube(M.gunmetal, 0.017, 0.017, 0.062, [0, 0.02, -0.71], 12)
  for (let i = 0; i < 3; i += 1) for (const s of [-1, 1]) b.box(M.dark, 0.006, 0.012, 0.008, [s * 0.015, 0.02, -0.69 - i * 0.017], undefined, 0)
  // Holographic sight.
  const sightY = 0.108
  b.box(M.gunmetal, 0.034, 0.012, 0.08, [0, 0.068, -0.05], undefined, 0.003)
  b.box(M.polymer, 0.05, 0.012, 0.085, [0, 0.078, -0.05], undefined, 0.004)
  for (const s of [-1, 1]) b.box(M.polymer, 0.006, 0.05, 0.085, [s * 0.024, 0.105, -0.05], undefined, 0.003)
  b.box(M.polymer, 0.054, 0.006, 0.085, [0, 0.133, -0.05], undefined, 0.003)
  b.box(M.polymer, 0.02, 0.016, 0.03, [0.032, 0.09, -0.04], undefined, 0.004)
  b.build(root)
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.042, 0.042),
    viewmodelMaterial(new THREE.MeshBasicMaterial({ map: redDotTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(2.2, 1, 1), toneMapped: false })),
  )
  glass.position.set(0, sightY, -0.03)
  glass.renderOrder = 5
  root.add(glass)
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.042), viewmodelMaterial(new THREE.MeshStandardMaterial({ color: '#3b6f6a', transparent: true, opacity: 0.16, metalness: 0.9, roughness: 0.05, depthWrite: false })))
  tint.position.set(0, sightY, -0.085)
  root.add(tint)
  // Magazine (animated).
  const mag = new THREE.Group()
  const mb = new Builder()
  mb.box(M.polymer, 0.028, 0.1, 0.07, [0, -0.05, 0], undefined, 0.006)
  mb.box(M.polymer, 0.028, 0.08, 0.068, [0, -0.13, -0.012], [0.28, 0, 0], 0.006)
  mb.box(M.dark, 0.032, 0.014, 0.075, [0, -0.175, -0.026], [0.28, 0, 0], 0.005)
  for (let i = 0; i < 4; i += 1) mb.box(M.dark, 0.03, 0.004, 0.05, [0, -0.02 - i * 0.022, 0], undefined, 0)
  mb.build(mag)
  mag.position.set(0, -0.09, -0.078)
  root.add(mag)
  const bolt = new THREE.Group()
  const bb = new Builder()
  bb.box(M.steel, 0.012, 0.016, 0.05, [0, 0, 0], undefined, 0.003)
  bb.build(bolt)
  bolt.position.set(0.024, 0.03, -0.04)
  root.add(bolt)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.02, -0.75)
  root.add(muzzle)
  const eject = new THREE.Object3D()
  eject.position.set(0.035, 0.03, -0.04)
  root.add(eject)
  const flash = flashGroup(flashTex, flameTex, 1)
  flash.position.copy(muzzle.position)
  root.add(flash)
  addArms(root, { right: [0, -0.1, 0.06], left: [0, -0.07, -0.36] })
  return { root, muzzle, eject, mag, bolt, sightY, sightZ: -0.05, flash }
}

export function buildShotgun(flashTex: THREE.Texture, flameTex: THREE.Texture): ViewModel {
  const M = weaponMats()
  const root = new THREE.Group()
  const b = new Builder()
  b.box(M.gunmetal, 0.054, 0.078, 0.26, [0, 0.005, -0.03], undefined, 0.01)
  b.box(M.dark, 0.004, 0.028, 0.08, [0.028, 0.018, -0.04], undefined, 0.001)
  // Side saddle shells.
  for (let i = 0; i < 4; i += 1) {
    b.tube(M.red, 0.0105, 0.0105, 0.05, [-0.034, 0.012, -0.08 + i * 0.024], 10, [0, 0, 0])
    b.tube(M.brass, 0.011, 0.011, 0.012, [-0.034, -0.018, -0.08 + i * 0.024], 10, [0, 0, 0])
  }
  b.box(M.polymer, 0.006, 0.07, 0.11, [-0.029, 0.0, -0.043], undefined, 0.002)
  // Barrel + magazine tube.
  b.tube(M.steel, 0.013, 0.013, 0.5, [0, 0.026, -0.4])
  b.tube(M.gunmetal, 0.012, 0.012, 0.4, [0, -0.006, -0.36])
  b.tube(M.gunmetal, 0.016, 0.016, 0.02, [0, -0.006, -0.56], 12)
  b.box(M.steel, 0.012, 0.03, 0.012, [0, 0.01, -0.56], undefined, 0.002)
  b.tube(M.brass, 0.003, 0.003, 0.006, [0, 0.043, -0.63], 8, [0, 0, 0])
  // Top rail and ghost ring.
  picatinny(b, M.gunmetal, 0.046, 0.08, -0.12, 0.02)
  b.box(M.gunmetal, 0.03, 0.03, 0.012, [0, 0.062, 0.06], undefined, 0.004)
  // Grip + stock.
  b.box(M.polymer, 0.036, 0.12, 0.052, [0, -0.09, 0.12], [-0.42, 0, 0], 0.012)
  b.box(M.gunmetal, 0.008, 0.006, 0.08, [0, -0.04, 0.055], undefined, 0.002)
  b.box(M.polymer, 0.045, 0.09, 0.2, [0, -0.03, 0.28], [0.1, 0, 0], 0.016)
  b.box(M.rubber, 0.047, 0.12, 0.02, [0, -0.045, 0.38], [0.1, 0, 0], 0.008)
  b.build(root)
  const pump = new THREE.Group()
  const pb = new Builder()
  pb.tube(M.polymer, 0.024, 0.024, 0.17, [0, 0, 0], 14)
  for (let i = 0; i < 7; i += 1) pb.tube(M.dark, 0.0255, 0.0255, 0.008, [0, 0, -0.07 + i * 0.023], 14)
  pb.build(pump)
  pump.position.set(0, -0.006, -0.33)
  root.add(pump)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.026, -0.66)
  root.add(muzzle)
  const eject = new THREE.Object3D()
  eject.position.set(0.036, 0.02, -0.04)
  root.add(eject)
  const flash = flashGroup(flashTex, flameTex, 1.7)
  flash.position.copy(muzzle.position)
  root.add(flash)
  addArms(root, { right: [0, -0.09, 0.12], left: [0, -0.03, -0.33] })
  return { root, muzzle, eject, pump, sightY: 0.047, sightZ: -0.6, flash }
}

export function buildRocket(flashTex: THREE.Texture, flameTex: THREE.Texture): ViewModel {
  const M = weaponMats()
  const root = new THREE.Group()
  const b = new Builder()
  b.tube(M.olive, 0.062, 0.062, 0.95, [0, 0, -0.15], 24)
  b.tube(M.gunmetal, 0.07, 0.066, 0.06, [0, 0, -0.63], 24)
  b.tube(M.gunmetal, 0.066, 0.09, 0.14, [0, 0, 0.38], 24)
  b.tube(M.dark, 0.05, 0.05, 0.02, [0, 0, 0.45], 20)
  for (const z of [-0.4, 0.1]) b.tube(M.gunmetal, 0.066, 0.066, 0.03, [0, 0, z], 24)
  // Heat shield + shoulder pad.
  b.box(M.olive, 0.1, 0.02, 0.4, [0, 0.066, -0.1], undefined, 0.008)
  b.box(M.rubber, 0.05, 0.03, 0.2, [0, -0.07, 0.18], undefined, 0.01)
  // Optic on the left.
  b.box(M.gunmetal, 0.04, 0.05, 0.14, [-0.08, 0.05, -0.08], undefined, 0.01)
  b.tube(M.dark, 0.018, 0.018, 0.02, [-0.08, 0.055, -0.155], 16)
  b.tube(M.dark, 0.014, 0.014, 0.02, [-0.08, 0.055, -0.005], 16)
  // Grips and trigger housing.
  b.box(M.polymer, 0.04, 0.05, 0.12, [0, -0.08, 0.0], undefined, 0.01)
  b.box(M.polymer, 0.036, 0.12, 0.05, [0, -0.15, 0.04], [-0.3, 0, 0], 0.012)
  b.box(M.polymer, 0.034, 0.11, 0.048, [0, -0.13, -0.3], [-0.15, 0, 0], 0.012)
  b.box(M.red, 0.02, 0.02, 0.02, [0.03, -0.07, 0.02], undefined, 0.004)
  b.build(root)
  const warhead = new THREE.Group()
  const wb = new Builder()
  wb.tube(M.olive, 0.045, 0.045, 0.1, [0, 0, 0], 16)
  wb.add(M.olive, new THREE.ConeGeometry(0.045, 0.14, 16), [0, 0, -0.12], [-Math.PI / 2, 0, 0])
  wb.tube(M.brass, 0.012, 0.012, 0.03, [0, 0, -0.2], 8)
  wb.build(warhead)
  warhead.position.set(0, 0, -0.65)
  root.add(warhead)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0, -0.72)
  root.add(muzzle)
  const flash = flashGroup(flashTex, flameTex, 2.4)
  flash.position.copy(muzzle.position)
  root.add(flash)
  addArms(root, { right: [0, -0.15, 0.04], left: [0, -0.13, -0.3] })
  return { root, muzzle, warhead, sightY: 0.055, sightZ: -0.08, flash }
}

/** Gloved hands wrapped around grip points with sleeves running off-screen. */
function addArms(root: THREE.Group, at: { right: [number, number, number]; left: [number, number, number] }): void {
  const M = weaponMats()
  const b = new Builder()
  const limb = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, mat: THREE.Material) => {
    const dir = new THREE.Vector3().subVectors(to, from)
    const len = dir.length()
    const g = new THREE.CylinderGeometry(r1, r0, len, 14)
    g.translate(0, len / 2, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    const e = new THREE.Euler().setFromQuaternion(q)
    b.add(mat, g, [from.x, from.y, from.z], [e.x, e.y, e.z])
  }
  const hand = (p: [number, number, number], side: number, grip: 'pistol' | 'fore') => {
    const [x, y, z] = p
    if (grip === 'pistol') {
      b.box(M.glove, 0.06, 0.075, 0.07, [x + 0.012 * side, y - 0.005, z + 0.03], [-0.35, 0, 0], 0.02)
      for (let i = 0; i < 3; i += 1) b.box(M.glove, 0.064, 0.02, 0.022, [x - 0.004 * side, y + 0.02 - i * 0.024, z - 0.012], [-0.35, 0, 0], 0.009)
      b.box(M.glove, 0.02, 0.022, 0.06, [x - 0.03 * side, y + 0.035, z - 0.01], [-0.2, 0.3 * side, 0], 0.009)
      limb(new THREE.Vector3(x + 0.03, y - 0.04, z + 0.07), new THREE.Vector3(x + 0.07, y - 0.36, z + 0.44), 0.036, 0.052, M.sleeve)
      b.box(M.glove, 0.07, 0.05, 0.05, [x + 0.034, y - 0.06, z + 0.09], [-0.9, 0, 0], 0.018)
    } else {
      b.box(M.glove, 0.07, 0.06, 0.08, [x - 0.012, y - 0.03, z], [0, 0, 0.3], 0.02)
      for (let i = 0; i < 4; i += 1) b.box(M.glove, 0.018, 0.05, 0.018, [x + 0.028, y + 0.006, z - 0.03 + i * 0.02], [0, 0, -0.25], 0.008)
      b.box(M.glove, 0.018, 0.018, 0.055, [x - 0.03, y + 0.02, z - 0.02], [0, 0, 0], 0.008)
      limb(new THREE.Vector3(x - 0.03, y - 0.06, z + 0.02), new THREE.Vector3(x - 0.2, y - 0.34, z + 0.3), 0.034, 0.05, M.sleeve)
    }
  }
  hand(at.right, 1, 'pistol')
  hand(at.left, -1, 'fore')
  b.build(root)
}

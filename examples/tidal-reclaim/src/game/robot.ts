import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { bakeMeshes, type VmAssets } from './tripoguns'
/**
 * V3 combatants: masked human operators and Unitree-style robots.
 *
 * Every walker is a Tripo-reconstructed PBR character auto-rigged by Meshy (skinned mesh + in-place
 * idle/walk/run mocap). Procedural layers on top of the mocap: the lower body turns toward travel
 * while the spine counter-twists to keep aim, analytic two-bone IK locks both hands to the held
 * weapon, recoil drives the weapon (and so the arms), hits spring the spine, and deaths topple the
 * body away from the killing blow. All procedural rotations are applied in world/root space, so
 * they do not depend on a rig's bone axes.
 */
export type RobotLook = 'operator' | 'breacher' | 'sentinel' | 'exo' | 'warden'
export type RobotAsset = { scene: THREE.Object3D; clips: THREE.AnimationClip[]; rig?: Rig }
export type HeldKind = 'rifle' | 'shotgun' | 'minigun' | 'cannon'
type BoneKey =
  | 'hips' | 'spine' | 'spine1' | 'spine2' | 'neck' | 'head'
  | 'lArm' | 'lFore' | 'lHand' | 'rArm' | 'rFore' | 'rHand'
  | 'lUp' | 'lLeg' | 'lFoot' | 'rUp' | 'rLeg' | 'rFoot'
export type Bones = Record<BoneKey, THREE.Bone>
export type RobotParts = {
  root: THREE.Group
  model: THREE.Object3D
  muzzle: THREE.Object3D
  head: THREE.Bone
  chest: THREE.Bone
  weak: THREE.Object3D
  weakRadius: number
  scale: number
  visor: THREE.MeshStandardMaterial
  core: THREE.MeshStandardMaterial
  armor: THREE.MeshStandardMaterial
  gibs: THREE.Mesh[]
  gun: THREE.Group
  bones: Bones
  grip: { right: THREE.Vector3; left: THREE.Vector3; offset: THREE.Vector3 }
  clips: THREE.AnimationClip[]
  look: RobotLook
  /** Hand orientation relative to a finger/palm basis, captured from the bind pose. */
  handRel: { l: THREE.Quaternion; r: THREE.Quaternion }
  human: boolean
  rig: Rig
}
/** Meshy auto-rig skeleton (no finger bones). */
const MESHY_BONES: Record<BoneKey, string> = {
  hips: 'Hips', spine: 'Spine02', spine1: 'Spine01', spine2: 'Spine', neck: 'neck', head: 'Head',
  lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand', rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand',
  lUp: 'LeftUpLeg', lLeg: 'LeftLeg', lFoot: 'LeftFoot', rUp: 'RightUpLeg', rLeg: 'RightLeg', rFoot: 'RightFoot',
}
type Rig = {
  /** Rotation taking the authored model's forward direction to game-local -Z. */
  yaw?: number
  /** Scan height (m) and in-game height (m). */
  native: number
  height: number
  human: boolean
  /** Nominal in-place clip speeds at in-game size (m/s). */
  walk: number
  run: number
  /** Weak point relative to the upper-chest bone (model units: +Z = front), radius in scale units. */
  weak?: { y: number; z: number; r: number }
  /** Recoil kick strength. */
  kick: number
}
export const RIGS: Record<RobotLook, Rig> = {
  operator: { native: 1.73, height: 1.8, human: true, walk: 1.25, run: 3.6, kick: 9 },
  breacher: { native: 1.81, height: 1.86, human: true, walk: 1.2, run: 3.4, kick: 11 },
  // V4: Unitree-scale humanoid robot (≈1.85 m), wave rifleman / DM rival.
  sentinel: { native: 1.97, height: 1.86, human: false, walk: 1.3, run: 3.8, kick: 6 },
  // V4: human in a powered exoskeleton (minigun heavy); the chest power cell is the weak point.
  exo: { native: 1.97, height: 2.25, human: false, walk: 1.3, run: 3.8, weak: { y: 0.02, z: -0.16, r: 0.13 }, kick: 4 },
  warden: { native: 2.98, height: 4.4, human: false, walk: 1.6, run: 3.2, weak: { y: 0.0, z: 0.34, r: 0.17 }, kick: 3 },
}
/** Legacy name kept for callers: in-game height relative to a 1.8 m human. */
export const ROBOT_SCALE: Record<RobotLook, number> = {
  operator: RIGS.operator.height / 1.8, breacher: RIGS.breacher.height / 1.8, sentinel: RIGS.sentinel.height / 1.8, exo: RIGS.exo.height / 1.8, warden: RIGS.warden.height / 1.8,
}
// ─── materials ────────────────────────────────────────────────────────────
const NOISE_GLSL = /* glsl */ `
varying vec3 vObj;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { return n3(p) * 0.5 + n3(p * 2.03) * 0.25 + n3(p * 4.1) * 0.125 + n3(p * 8.3) * 0.0625; }
`
type Wear = { chip: number; grime: number; scale: number; metal: string }

/** Worn industrial paint: chipped to bare steel along noise ridges, oily grime pooling low. */
export function wornPaint(color: THREE.ColorRepresentation, wear: Partial<Wear> = {}, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const w: Wear = { chip: 0.5, grime: 0.6, scale: 9, metal: '#8a8c8f', ...wear }
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.55, envMapIntensity: 0.9, ...extra })
  const bare = new THREE.Color(w.metal)
  mat.onBeforeCompile = shader => {
    shader.uniforms.uBare = { value: bare }
    shader.uniforms.uWear = { value: new THREE.Vector3(w.chip, w.grime, w.scale) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uBare;\nuniform vec3 uWear;\n${NOISE_GLSL}\nfloat gChip; float gGrime;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float n = fbm3(vObj * uWear.z);
          float edge = fbm3(vObj * uWear.z * 3.1 + 7.0);
          gChip = smoothstep(0.64 - uWear.x * 0.1, 0.68 - uWear.x * 0.1, n * 0.72 + edge * 0.42) * uWear.x;
          float low = 1.0 - smoothstep(0.05, 0.9, vObj.y);
          gGrime = clamp((fbm3(vObj * 4.0 + 3.0) * 0.8 + low * 0.5) * uWear.y, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uBare, gChip);
          diffuseColor.rgb *= mix(1.0, 0.5, gGrime * 0.7);
          diffuseColor.rgb *= 0.88 + n * 0.24;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + gGrime * 0.18 - gChip * 0.22, 0.25, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.8, gChip);')
  }
  mat.customProgramCacheKey = () => 'wornPaint'
  return mat
}

type Shared = { joint: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; rubber: THREE.MeshStandardMaterial; hazard: THREE.MeshStandardMaterial }
let shared: Shared | undefined
function sharedMats(): Shared {
  shared ??= {
    joint: wornPaint('#5a5d63', { chip: 0.3, grime: 0.8, scale: 14, metal: '#77797d' }, { metalness: 0.65, roughness: 0.48 }),
    dark: wornPaint('#303236', { chip: 0.2, grime: 0.7, scale: 12 }, { metalness: 0.5, roughness: 0.52 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9, metalness: 0, envMapIntensity: 0.3 }),
    hazard: hazardMaterial(),
  }
  return shared
}

function hazardMaterial(): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#c38f1f'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#171717'
  for (let i = -128; i < 256; i += 32) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + 16, 0)
    g.lineTo(i + 144, 128)
    g.lineTo(i + 128, 128)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return wornPaint('#ffffff', { chip: 0.55, grime: 0.7, scale: 11 }, { map: t, metalness: 0.3, roughness: 0.6 })
}

// ─── armour kit ───────────────────────────────────────────────────────────
const rbox = (w: number, h: number, d: number, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))
const cyl = (r0: number, r1: number, len: number, seg = 14) => new THREE.CylinderGeometry(r1, r0, len, seg)

/** Kit in bind-pose model coordinates (X Bot faces +Z, its left = +X, 1.8 m tall). */
// ─── held weapons ─────────────────────────────────────────────────────────
type HeldGun = { group: THREE.Group; muzzle: THREE.Vector3; right: THREE.Vector3; left: THREE.Vector3 }
/**
 * Tripo scans share the viewmodel frame (barrel −Z, up +Y, right +X, max dimension ≈ 1). The held
 * copy is scaled to real size with its pistol grip at the origin; grips/muzzle are the measured
 * landmarks. Geometry and material are shared by every bot holding that weapon.
 */
const TRIPO_HELD = {
  rifle: { s: 0.86, grip: [0, -0.088, 0.2], left: [0, 0.0, -0.13], muzzle: [0, 0.059, -0.485] },
  shotgun: { s: 0.97, grip: [0, -0.066, 0.23], left: [0, -0.005, -0.2], muzzle: [0, 0.059, -0.49] },
} as const
const tripoCache = new Map<THREE.Object3D, THREE.Mesh[]>()
function heldTripo(src: THREE.Object3D, kind: 'rifle' | 'shotgun'): HeldGun {
  const L = TRIPO_HELD[kind]
  let meshes = tripoCache.get(src)
  if (!meshes) {
    const m4 = new THREE.Matrix4().makeScale(L.s, L.s, L.s).premultiply(new THREE.Matrix4().makeTranslation(-L.grip[0] * L.s, -L.grip[1] * L.s, -L.grip[2] * L.s))
    meshes = bakeMeshes(src).map(({ geo, mat }) => {
      geo.applyMatrix4(m4)
      geo.computeBoundingSphere()
      const m = new THREE.Mesh(geo, mat)
      m.castShadow = true
      return m
    })
    tripoCache.set(src, meshes)
  }
  const group = new THREE.Group()
  for (const m of meshes) group.add(m.clone())
  const at = (p: readonly number[]) => new THREE.Vector3((p[0] - L.grip[0]) * L.s, (p[1] - L.grip[1]) * L.s, (p[2] - L.grip[2]) * L.s)
  return { group, muzzle: at(L.muzzle), right: new THREE.Vector3(0, 0.02, 0.01), left: at(L.left) }
}
const heldCache = new Map<string, THREE.Mesh[]>()
function heldProcedural(kind: 'minigun' | 'cannon'): HeldGun {
  const group = new THREE.Group()
  let meshes = heldCache.get(kind)
  if (!meshes) {
    const S = sharedMats()
    const parts: { mat: THREE.Material; geo: THREE.BufferGeometry }[] = []
    const add = (mat: THREE.Material, geo: THREE.BufferGeometry, p: [number, number, number], r: [number, number, number] = [0, 0, 0]) => {
      geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1)))
      parts.push({ mat, geo })
    }
    const Z: [number, number, number] = [Math.PI / 2, 0, 0]
    if (kind === 'minigun') {
      add(S.joint, rbox(0.16, 0.18, 0.4, 0.03), [0, 0.04, -0.05])
      add(S.dark, cyl(0.075, 0.075, 0.06, 18), [0, 0.04, -0.3], Z)
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2
        add(S.dark, cyl(0.016, 0.016, 0.62, 8), [Math.cos(a) * 0.045, 0.04 + Math.sin(a) * 0.045, -0.6], Z)
      }
      add(S.joint, cyl(0.07, 0.07, 0.03, 18), [0, 0.04, -0.86], Z)
      add(S.hazard, rbox(0.14, 0.2, 0.16, 0.03), [0.13, -0.05, 0.02])
      add(S.rubber, rbox(0.04, 0.12, 0.05, 0.015), [0, -0.1, 0.1], [-0.3, 0, 0])
      add(S.joint, rbox(0.04, 0.03, 0.2, 0.01), [0, 0.16, -0.08])
    } else {
      add(S.joint, rbox(0.22, 0.24, 0.5, 0.04), [0, 0.05, -0.1])
      add(S.dark, cyl(0.1, 0.12, 0.9, 20), [0, 0.05, -0.75], Z)
      add(S.joint, cyl(0.14, 0.14, 0.08, 20), [0, 0.05, -1.18], Z)
      for (let i = 0; i < 3; i += 1) add(S.hazard, cyl(0.13, 0.13, 0.03, 20), [0, 0.05, -0.45 - i * 0.18], Z)
      add(S.rubber, rbox(0.05, 0.14, 0.06, 0.02), [0, -0.12, 0.08], [-0.3, 0, 0])
      add(S.joint, rbox(0.05, 0.05, 0.24, 0.015), [0, 0.2, -0.1])
    }
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>()
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n)
      byMat.set(p.mat, [...(byMat.get(p.mat) ?? []), g])
    }
    meshes = []
    for (const [m, list] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false)!, m)
      mesh.castShadow = true
      meshes.push(mesh)
    }
    heldCache.set(kind, meshes)
  }
  for (const m of meshes) group.add(m.clone())
  return kind === 'minigun'
    ? { group, muzzle: new THREE.Vector3(0, 0.04, -0.92), right: new THREE.Vector3(0, -0.06, 0.1), left: new THREE.Vector3(0, 0.165, -0.12) }
    : { group, muzzle: new THREE.Vector3(0, 0.05, -1.24), right: new THREE.Vector3(0, -0.08, 0.08), left: new THREE.Vector3(0, 0.22, -0.18) }
}

// ─── build ────────────────────────────────────────────────────────────────
function findBones(model: THREE.Object3D): Bones {
  const byName = new Map<string, THREE.Bone>()
  model.traverse(o => {
    if ((o as THREE.Bone).isBone) byName.set(o.name.replace(/[^a-zA-Z0-9]/g,''), o as THREE.Bone)
  })
  const found = {} as Bones
  const mixamo = byName.has('mixamorigHips')
  const mixamoSpine:Partial<Record<BoneKey,string>>={spine:'Spine',spine1:'Spine1',spine2:'Spine2',neck:'Neck'}
  for (const [k, n] of Object.entries(MESHY_BONES)) {
    const b = byName.get(mixamo ? `mixamorig${mixamoSpine[k as BoneKey]??n}` : n)
    if (!b) throw new Error(`rig bone missing: ${n}`)
    found[k as BoneKey] = b
  }
  return found
}

/** Finger/palm basis: x = fingers, y = back of the hand (−palm), z = x × y. */
function handBasis(fingers: THREE.Vector3, palm: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const x = _a.copy(fingers).normalize()
  const y = _b.copy(palm).multiplyScalar(-1)
  y.addScaledVector(x, -y.dot(x)).normalize()
  const z = _c.crossVectors(x, y)
  _m.makeBasis(x, y, z)
  return out.setFromRotationMatrix(_m)
}

export function buildRobot(asset: RobotAsset, look: RobotLook, visorColor: string, held: HeldKind, vm: VmAssets): RobotParts {
  const rig = asset.rig ?? RIGS[look]
  const scale = rig.height / 1.8
  const root = new THREE.Group()
  const model = cloneSkinned(asset.scene)
  model.rotation.y = rig.yaw ?? Math.PI
  model.scale.setScalar(rig.height / rig.native)
  root.add(model)
  const bones = findBones(model)
  const visor = new THREE.MeshStandardMaterial({ color: '#111111', emissive: visorColor, emissiveIntensity: 2.2, roughness: 0.25, metalness: 0.2, envMapIntensity: 0.4 })
  const core = new THREE.MeshStandardMaterial({ color: '#221108', emissive: visorColor, emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.1, envMapIntensity: 0.3 })
  let armor: THREE.MeshStandardMaterial | undefined
  model.traverse(o => {
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    armor ??= m.material as THREE.MeshStandardMaterial
  })
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert()
  const bonePos = (b: THREE.Bone) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv)
  // Bind-pose hand frames (A-pose: fingers continue the forearm, palms face down and inward).
  const mq = model.getWorldQuaternion(new THREE.Quaternion())
  const handRel = { l: new THREE.Quaternion(), r: new THREE.Quaternion() }
  for (const side of ['l', 'r'] as const) {
    const hand = side === 'l' ? bones.lHand : bones.rHand
    const fore = side === 'l' ? bones.lFore : bones.rFore
    const f = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3()))
    const inward = new THREE.Vector3(side === 'l' ? -1 : 1, 0, 0).applyQuaternion(mq)
    const palm = inward.add(new THREE.Vector3(0, -1, 0))
    const basis = handBasis(f, palm, new THREE.Quaternion())
    handRel[side].copy(basis.invert()).multiply(hand.getWorldQuaternion(new THREE.Quaternion()))
  }
  const h = held === 'rifle' || held === 'shotgun' ? (vm[held] ? heldTripo(vm[held]!, held) : heldProcedural('minigun')) : heldProcedural(held)
  const gun = h.group
  gun.scale.setScalar(scale)
  root.add(gun)
  const muzzle = new THREE.Object3D()
  muzzle.position.copy(h.muzzle)
  gun.add(muzzle)
  // Weak point (robots): a glowing core on the chest bone; humans use the head as their weak spot.
  const weak = new THREE.Object3D()
  const chestBp = bonePos(bones.spine2)
  const unit = rig.native / 1.8
  if (rig.weak) {
    weak.position.set(0, rig.weak.y * unit, rig.weak.z * unit)
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.06 * unit, 20), core)
    glow.position.copy(weak.position)
    if (rig.weak.z < 0) glow.rotation.y = Math.PI
    bones.spine2.add(glow)
  }
  bones.spine2.add(weak)
  void chestBp
  const offset =
    held === 'minigun' ? new THREE.Vector3(0.15, -0.22, 0.3) : held === 'cannon' ? new THREE.Vector3(0.2, -0.18, 0.3) : new THREE.Vector3(0.1, -0.12, 0.24)
  return {
    root, model, muzzle, head: bones.head, chest: bones.spine2, weak, weakRadius: rig.weak?.r ?? 0.13, scale,
    visor, core, armor: armor ?? core, gibs: [], gun, bones, grip: { right: h.right, left: h.left, offset }, clips: asset.clips, look,
    handRel, human: rig.human, rig,
  }
}
/** Remove horizontal root motion so clips play in place (the AI owns translation). */
export function inPlaceClips(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  return clips.map(c => {
    const clip = c.clone()
    for (const t of clip.tracks) {
      if (/Hips\.position$/.test(t.name)) {
        const v = t.values
        const x0 = v[0]
        const z0 = v[2]
        for (let i = 0; i < v.length; i += 3) {
          v[i] = x0
          v[i + 2] = z0
        }
      }
    }
    return clip
  })
}

// ─── animation ────────────────────────────────────────────────────────────
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()
const _p = new THREE.Vector3()
const _el = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _q3 = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _ax = new THREE.Vector3()
const _fw = new THREE.Vector3()
/** Rotate `bone` in world space so the direction to `child` points at `target`. */
function aimBone(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3): void {
  bone.getWorldPosition(_a)
  child.getWorldPosition(_b)
  const from = _b.sub(_a).normalize()
  const to = _c.subVectors(target, _a).normalize()
  _q.setFromUnitVectors(from, to)
  bone.getWorldQuaternion(_q2)
  _q2.premultiply(_q)
  bone.parent!.getWorldQuaternion(_q)
  bone.quaternion.copy(_q.invert().multiply(_q2))
  bone.updateMatrixWorld(true)
}

function twoBoneIK(upper: THREE.Bone, lower: THREE.Bone, end: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3): void {
  const a = upper.getWorldPosition(new THREE.Vector3())
  const b = lower.getWorldPosition(new THREE.Vector3())
  const c = end.getWorldPosition(new THREE.Vector3())
  const l1 = a.distanceTo(b)
  const l2 = b.distanceTo(c)
  const dir = _d.subVectors(target, a)
  const dist = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.999)
  dir.normalize()
  const bend = _p.copy(pole).addScaledVector(dir, -pole.dot(dir))
  if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0)
  bend.normalize()
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1)
  const sinA = Math.sqrt(1 - cosA * cosA)
  _el.copy(a).addScaledVector(dir, cosA * l1).addScaledVector(bend, sinA * l1)
  aimBone(upper, lower, _el)
  aimBone(lower, end, target)
}

/** Apply a world-space rotation (axis, angle) to a bone, keeping its parent chain. */
function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  if (Math.abs(angle) < 1e-5) return
  bone.parent!.getWorldQuaternion(_q3)
  _q.setFromAxisAngle(axis, angle)
  // local' = P⁻¹ · R · P · local
  const pInv = _q2.copy(_q3).invert()
  bone.quaternion.premultiply(_q3).premultiply(_q).premultiply(pInv)
  bone.updateMatrixWorld(true)
}

/** Orient a hand so its captured bind frame follows the given finger and palm directions (world). */
function orientHand(hand: THREE.Bone, rel: THREE.Quaternion, fingers: THREE.Vector3, palm: THREE.Vector3): void {
  handBasis(fingers, palm, _q).multiply(rel)
  hand.parent!.getWorldQuaternion(_q2)
  hand.quaternion.copy(_q2.invert().multiply(_q))
  hand.updateMatrixWorld(true)
}

export class RobotAnimator {
  private readonly mixer: THREE.AnimationMixer
  private readonly idle: THREE.AnimationAction
  private readonly walk: THREE.AnimationAction
  private readonly run: THREE.AnimationAction
  private flinch = new THREE.Vector2()
  private flinchV = new THREE.Vector2()
  private recoil = 0
  private recoilV = 0
  private lowerYaw = 0
  private dying = -1
  private readonly deathDir = new THREE.Vector2()
  private stagger = 0
  private readonly gunQ = new THREE.Quaternion()
  private readonly rootQ = new THREE.Quaternion()
  private readonly v1 = new THREE.Vector3()
  private readonly v2 = new THREE.Vector3()
  private readonly v3 = new THREE.Vector3()
  private readonly v4 = new THREE.Vector3()
  private readonly frozenIdle: boolean

  constructor(private readonly p: RobotParts) {
    this.mixer = new THREE.AnimationMixer(p.model)
    const find = (n: string) => p.clips.find(c => c.name === n)
    const walk = find('walk') ?? p.clips[0]
    const idle = find('idle')
    const run = find('run')
    this.frozenIdle = !idle
    // Missing clips reuse the walk cycle: idle as a held mid-stride frame, run as a fast walk.
    this.idle = this.mixer.clipAction(idle ?? walk.clone())
    this.walk = this.mixer.clipAction(walk)
    this.run = this.mixer.clipAction(run ?? walk.clone())
    for (const a of [this.idle, this.walk, this.run]) {
      a.play()
      a.setEffectiveWeight(0)
      a.time = Math.random() * a.getClip().duration
    }
    if (this.frozenIdle) {
      this.idle.time = this.idle.getClip().duration * 0.02
      this.idle.timeScale = 0
    }
    this.idle.setEffectiveWeight(1)
  }
  get isDying(): boolean {
    return this.dying >= 0
  }
  get deathTime(): number {
    return this.dying
  }
  get staggered(): boolean {
    return this.stagger > 0
  }
  reset(): void {
    this.dying = -1
    this.stagger = 0
    this.flinch.set(0, 0)
    this.flinchV.set(0, 0)
    this.recoil = this.recoilV = 0
    this.p.model.position.set(0, 0, 0)
    this.p.model.rotation.set(0, this.p.rig.yaw ?? Math.PI, 0)
    this.p.gun.visible = true
    for (const g of this.p.gibs) g.visible = true
    this.p.head.scale.setScalar(1)
  }
  hit(dirX: number, dirZ: number, strength: number): void {
    this.flinchV.x += dirZ * strength * 9
    this.flinchV.y += dirX * strength * 9
  }
  fire(): void {
    this.recoilV += this.p.rig.kick
  }
  staggerFor(t: number): void {
    this.stagger = Math.max(this.stagger, t)
  }
  die(dirX: number, dirZ: number, headshot: boolean): void {
    this.dying = 0
    this.deathDir.set(dirX, dirZ)
    // Robots lose their head unit on a headshot; humans just drop.
    if (headshot && !this.p.human) this.p.head.scale.setScalar(0.001)
  }
  /** World-space right/forward axes of the root frame rotated by `yaw` (root-local radians). */
  private axes(yaw: number): void {
    this.p.root.getWorldQuaternion(this.rootQ)
    _ax.set(Math.cos(yaw), 0, -Math.sin(yaw)).applyQuaternion(this.rootQ)
    _fw.set(-Math.sin(yaw), 0, -Math.cos(yaw)).applyQuaternion(this.rootQ)
  }

  /**
   * @param speed ground speed m/s; forward/side = velocity in the root frame (m/s)
   * @param aimYaw upper-body yaw relative to the root; aimPitch radians (+ up)
   */
  update(dt: number, speed: number, forward: number, side: number, aimYaw: number, aimPitch: number, time: number): void {
    const p = this.p
    const B = p.bones
    const s = p.scale
    const R = p.rig
    if (this.dying >= 0) {
      this.updateDeath(dt)
      return
    }
    this.stagger = Math.max(0, this.stagger - dt)
    // Locomotion blend against the rig's nominal clip speeds.
    const wRun = THREE.MathUtils.clamp((speed - R.walk * 1.5) / (R.run - R.walk * 1.5), 0, 1)
    const wWalk = THREE.MathUtils.clamp(speed / (R.walk * 0.8), 0, 1) * (1 - wRun)
    const wIdle = 1 - Math.max(wWalk, wRun)
    const back = forward < -0.35
    this.idle.setEffectiveWeight(wIdle)
    this.walk.setEffectiveWeight(wWalk)
    this.run.setEffectiveWeight(wRun)
    this.walk.timeScale = THREE.MathUtils.clamp(speed / R.walk, 0.6, 1.8) * (back ? -1 : 1)
    this.run.timeScale = THREE.MathUtils.clamp(speed / R.run, 0.7, 1.5) * (back ? -1 : 1)
    this.mixer.update(dt * (this.stagger > 0 ? 0.3 : 1))
    // Lower body faces travel, upper body keeps aim.
    let want = 0
    if (speed > 0.4) {
      const ang = Math.atan2(-side, forward)
      want = back ? Math.atan2(Math.sin(ang - Math.PI), Math.cos(ang - Math.PI)) : ang
      want = THREE.MathUtils.clamp(want, -1.2, 1.2)
    }
    this.lowerYaw += (want - this.lowerYaw) * Math.min(1, dt * 8)
    p.model.rotation.set(0, (R.yaw ?? Math.PI) + this.lowerYaw, 0)
    // Springs: hit flinch and weapon recoil.
    this.flinchV.addScaledVector(this.flinch, -120 * dt)
    this.flinchV.multiplyScalar(Math.exp(-10 * dt))
    this.flinch.addScaledVector(this.flinchV, dt)
    this.recoilV += -this.recoil * 260 * dt
    this.recoilV *= Math.exp(-18 * dt)
    this.recoil += this.recoilV * dt
    p.root.updateMatrixWorld(true)
    // Spine counter-twist, aim pitch and flinch, spread over three bones (world-space axes).
    const twist = THREE.MathUtils.clamp(aimYaw - this.lowerYaw, -1.3, 1.3) / 3
    const pitch = THREE.MathUtils.clamp(aimPitch, -0.9, 0.9)
    const lean = this.flinch.x * 0.25 + (this.stagger > 0 ? 0.15 : 0)
    this.axes(aimYaw)
    const up = this.v4.set(0, 1, 0).applyQuaternion(this.rootQ)
    for (const b of [B.spine, B.spine1, B.spine2]) {
      rotateWorld(b, up, twist)
      rotateWorld(b, _ax, pitch * 0.12 - lean)
      rotateWorld(b, _fw, this.flinch.y * 0.2)
    }
    rotateWorld(B.head, _ax, pitch * 0.3)
    // Weapon pose in root space: from the chest along the aim, with recoil kick.
    const chest = B.spine2.getWorldPosition(this.v1)
    p.root.worldToLocal(chest)
    this.gunQ.setFromEuler(new THREE.Euler(pitch, aimYaw, 0, 'YXZ'))
    const off = this.v2.set(p.grip.offset.x, p.grip.offset.y, -(p.grip.offset.z - this.recoil * 0.05)).multiplyScalar(s).applyQuaternion(this.gunQ)
    p.gun.position.copy(chest).add(off)
    p.gun.quaternion.copy(this.gunQ)
    p.gun.rotateX(this.recoil * 0.12 + this.flinch.x * 0.1)
    p.gun.updateMatrixWorld(true)
    // Arm IK onto the grips, then hands from the bind-pose frames.
    const gq = p.gun.getWorldQuaternion(_q2)
    const gFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(gq)
    const gUp = new THREE.Vector3(0, 1, 0).applyQuaternion(gq)
    const gRight = new THREE.Vector3(1, 0, 0).applyQuaternion(gq)
    const right = p.gun.localToWorld(this.v3.copy(p.grip.right))
    const left = p.gun.localToWorld(new THREE.Vector3().copy(p.grip.left))
    twoBoneIK(B.rArm, B.rFore, B.rHand, right, gRight.clone().multiplyScalar(0.8).addScaledVector(gUp, -1).addScaledVector(gFwd, -0.3))
    twoBoneIK(B.lArm, B.lFore, B.lHand, left, gRight.clone().multiplyScalar(-1).addScaledVector(gUp, -0.8))
    orientHand(B.rHand, p.handRel.r, gFwd.clone().multiplyScalar(0.7).addScaledVector(gUp, -0.55).addScaledVector(gRight, -0.2), gRight.clone().negate())
    orientHand(B.lHand, p.handRel.l, gFwd.clone().multiplyScalar(0.75).addScaledVector(gRight, 0.45), gUp.clone().addScaledVector(gRight, -0.3))
    p.visor.emissiveIntensity = 4.0 + Math.sin(time * 7) * 0.6
    p.core.emissiveIntensity = 2.0 + Math.sin(time * 4) * 0.6
  }

  private updateDeath(dt: number): void {
    const p = this.p
    const B = p.bones
    this.dying += dt
    const t = this.dying
    const fall = THREE.MathUtils.smoothstep(t, 0.05, 0.8)
    const dx = this.deathDir.x
    const dz = this.deathDir.y
    this.mixer.update(dt * 0.2)
    // Topple away from the blow around the feet; knees buckle; arms go limp.
    p.model.rotation.set(dz * fall * 1.42, (p.rig.yaw ?? Math.PI) + this.lowerYaw, -dx * fall * 1.42, 'YXZ')
    p.model.position.y = -fall * 0.1 * p.scale
    p.root.updateMatrixWorld(true)
    this.axes(this.lowerYaw)
    const buckle = THREE.MathUtils.smoothstep(t, 0, 0.5)
    for (const [leg, upLeg] of [[B.lLeg, B.lUp], [B.rLeg, B.rUp]] as const) {
      rotateWorld(upLeg, _ax, 0.5 * buckle)
      rotateWorld(leg, _ax, -0.9 * buckle)
    }
    for (const b of [B.spine, B.spine1, B.spine2]) rotateWorld(b, _ax, -0.22 * buckle)
    rotateWorld(B.lArm, _fw, -0.6 * buckle)
    rotateWorld(B.rArm, _fw, 0.6 * buckle)
    if (p.gun.visible) {
      p.gun.position.y = Math.max(0.06 * p.scale, p.gun.position.y - dt * 4 * p.scale)
      p.gun.rotateZ(dt * 2.5)
    }
    if (t > 3) p.model.position.y -= 0.5 * p.scale * dt
    p.visor.emissiveIntensity = Math.max(0, 4 - t * 6)
    p.core.emissiveIntensity = Math.max(0, 1.4 - t * 2)
  }
}

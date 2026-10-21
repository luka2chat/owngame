import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import type { CombatWorld, DamageInfo, DamageResult } from './combat'
import { applyDamage } from './rules'
import { bakeMeshes } from './tripoguns'

/**
 * HOUND: quadruped assault robot with a back-mounted plasma turret (replaces the Hornet drone and
 * keeps its public API, so the game treats it exactly like one). It circles the player at 6–11 m,
 * hops over obstacles, telegraphs (optic flare + charge whine) and fires slow plasma bolts. Below
 * 30% health it sprints at the player and self-destructs. Destroyed hounds collapse and burst.
 *
 * The Tripo scan is one rigid mesh; at load it is skinned to a small procedural skeleton (torso,
 * turret, four hip→knee chains) with soft weights across the joints, and driven by analytic
 * two-bone leg IK with a diagonal trot. One draw call per hound, geometry shared by the pool.
 */
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const tA = new THREE.Vector3()
const tB = new THREE.Vector3()
const ss = THREE.MathUtils.smoothstep

/** Rig landmarks in the prepared scan's frame (faces −Z, feet on y=0, 0.85 m tall). */
const HIP_Y = 0.47
const KNEE_Y = 0.29
const TORSO = new THREE.Vector3(0, HIP_Y, 0)
const TURRET = new THREE.Vector3(0, 0.6, 0.02)
const MUZZLE = new THREE.Vector3(0, 0.625, -0.46)
const OPTIC = new THREE.Vector3(0, 0.66, -0.2)
type LegDef = { x: number; front: boolean; hip: THREE.Vector3; knee: THREE.Vector3; foot: THREE.Vector3 }
const LEGS: LegDef[] = []
for (const front of [true, false])
  for (const x of [-0.17, 0.17])
    LEGS.push({
      x,
      front,
      hip: new THREE.Vector3(x, HIP_Y, front ? -0.21 : 0.22),
      knee: new THREE.Vector3(x, KNEE_Y, front ? -0.09 : 0.37),
      foot: new THREE.Vector3(x, 0.03, front ? -0.23 : 0.27),
    })
/** Game scale on top of the scan (≈0.94 m tall). */
const SCALE = 1.1
/** Collider / `pos` centre height above the feet (m). */
const CENTER_H = 0.5 * SCALE

type Template = { parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] }
const templates = new WeakMap<THREE.Object3D, Template>()

/** Bone indices: 0 torso, 1 turret, 2+2i hip i, 3+2i knee i. */
function template(asset: THREE.Object3D): Template {
  let t = templates.get(asset)
  if (t) return t
  const parts = bakeMeshes(asset).map(({ geo, mat }) => {
    const pos = geo.getAttribute('position')
    const n = pos.count
    const idx = new Uint16Array(n * 4)
    const wt = new Float32Array(n * 4)
    for (let i = 0; i < n; i += 1) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const ax = Math.abs(x)
      // Leg share: everything below the belly, plus the hip housings outside the body sides.
      const leg = Math.max(1 - ss(y, 0.35, 0.39), ss(ax, 0.105, 0.13) * (1 - ss(y, 0.56, 0.6)))
      const turret = (1 - leg) * ss(y, 0.575, 0.61) * (1 - ss(ax, 0.13, 0.16))
      const torso = 1 - leg - turret
      const li = (z < 0.06 ? 0 : 2) + (x < 0 ? 0 : 1)
      const shin = 1 - ss(y, KNEE_Y - 0.025, KNEE_Y + 0.025)
      const o = i * 4
      idx[o] = 0
      wt[o] = torso
      idx[o + 1] = 1
      wt[o + 1] = turret
      idx[o + 2] = 2 + li * 2
      wt[o + 2] = leg * (1 - shin)
      idx[o + 3] = 3 + li * 2
      wt[o + 3] = leg * shin
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4))
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4))
    geo.computeBoundingSphere()
    return { geo, mat }
  })
  t = { parts }
  templates.set(asset, t)
  return t
}

type Leg = LegDef & { hipBone: THREE.Bone; kneeBone: THREE.Bone; l1: number; l2: number; a0: number; b0: number; phase: number; planted: boolean }
/** Angle of a sagittal (y,z) vector measured from straight down toward +Z (rearward). */
const sag = (dy: number, dz: number) => Math.atan2(dz, -dy)

function buildHound(asset: THREE.Object3D) {
  const T = template(asset)
  const root = new THREE.Group()
  const holder = new THREE.Group()
  root.add(holder)
  const torso = new THREE.Bone()
  torso.position.copy(TORSO)
  const turret = new THREE.Bone()
  turret.position.copy(TURRET).sub(TORSO)
  torso.add(turret)
  const bones: THREE.Bone[] = [torso, turret]
  const legs: Leg[] = []
  for (const d of LEGS) {
    const hipBone = new THREE.Bone()
    hipBone.position.copy(d.hip).sub(TORSO)
    const kneeBone = new THREE.Bone()
    kneeBone.position.copy(d.knee).sub(d.hip)
    hipBone.add(kneeBone)
    torso.add(hipBone)
    bones.push(hipBone, kneeBone)
    const a = tA.copy(d.knee).sub(d.hip)
    const b = tB.copy(d.foot).sub(d.knee)
    legs.push({ ...d, hipBone, kneeBone, l1: a.length(), l2: b.length(), a0: sag(a.y, a.z), b0: sag(b.y, b.z), phase: d.front === d.x < 0 ? 0 : Math.PI, planted: true })
  }
  const skeleton = new THREE.Skeleton(bones)
  const meshes: THREE.SkinnedMesh[] = []
  for (const p of T.parts) {
    const m = new THREE.SkinnedMesh(p.geo, p.mat)
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    meshes.push(m)
    holder.add(m)
  }
  meshes[0].add(torso)
  root.updateMatrixWorld(true)
  skeleton.calculateInverses()
  for (const m of meshes) m.bind(skeleton, m.matrixWorld)
  // Telegraph optic on the turret (per-instance material so each hound flares individually).
  const optic = new THREE.MeshStandardMaterial({ color: '#150505', emissive: '#ff3a24', emissiveIntensity: 2.2, roughness: 0.2 })
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), optic)
  eye.position.copy(OPTIC).sub(TURRET)
  turret.add(eye)
  const muzzle = new THREE.Object3D()
  muzzle.position.copy(MUZZLE).sub(TURRET)
  turret.add(muzzle)
  holder.scale.setScalar(SCALE)
  return { root, holder, torso, turret, legs, optic, muzzle }
}

export class Hound {
  readonly root: THREE.Group
  private readonly model: ReturnType<typeof buildHound>
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  /** Body centre (collider centre), CENTER_H above the feet. */
  readonly pos = new THREE.Vector3()
  readonly prevPos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  yaw = 0
  private prevYaw = 0
  health = 70
  readonly maxHealth = 70
  alive = false
  /** Destroyed and collapsing (still visible). */
  falling = false
  private fallT = 0
  private orbitA = 0
  private orbitDir = 1
  private orbitR = 8
  private fireT = 2
  private charge = 0
  private kamikaze = false
  private flipT = 3
  private smokeT = 0
  private grounded = true
  private blockedT = 0
  private gait = 0
  private turretYaw = 0
  private pitch = 0
  private roll = 0
  private beepT = 0
  private servo?: { set(p: THREE.Vector3): void; stop(): void }
  private readonly deathDir = new THREE.Vector2()

  constructor(readonly id: number, physics: Physics, private readonly world: CombatWorld, asset: THREE.Object3D) {
    this.model = buildHound(asset)
    this.root = this.model.root
    this.root.visible = false
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -60, 0))
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.ball(0.45), this.body)
  }

  get center(): THREE.Vector3 {
    return this.pos
  }

  spawn(at: THREE.Vector3): void {
    const g = this.world.groundAt(at.x, at.z, at.y + 1)
    this.pos.set(at.x, g + CENTER_H, at.z)
    this.prevPos.copy(this.pos)
    this.vel.set(0, 0, 0)
    this.health = this.maxHealth
    this.alive = true
    this.falling = false
    this.kamikaze = false
    this.charge = 0
    this.fireT = rand(1.6, 2.8)
    this.orbitA = Math.random() * Math.PI * 2
    this.orbitDir = Math.random() < 0.5 ? -1 : 1
    this.orbitR = rand(6, 11)
    this.grounded = true
    this.pitch = this.roll = 0
    this.root.visible = true
    this.model.torso.position.copy(TORSO)
    this.model.torso.rotation.set(0, 0, 0)
    this.model.optic.emissiveIntensity = 2.2
    this.body.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true)
    this.servo?.stop()
    this.servo = this.world.audio.loop('drone_loop', 0.4, this.pos)
  }

  hide(): void {
    this.alive = false
    this.falling = false
    this.root.visible = false
    this.servo?.stop()
    this.servo = undefined
    this.body.setTranslation({ x: 0, y: -60, z: 0 }, true)
    this.body.setNextKinematicTranslation({ x: 0, y: -60, z: 0 })
  }

  takeDamage(info: DamageInfo): DamageResult {
    if (!this.alive) return { dealt: 0, killed: false, armor: false }
    const r = applyDamage(this.health, 0, info.amount)
    const dealt = this.health - r.health
    this.health = r.health
    const d = tA.copy(this.pos).sub(info.from).setY(0).normalize()
    this.vel.addScaledVector(d, Math.min(5, info.amount * 0.08))
    this.roll += (Math.random() - 0.5) * 0.5
    this.pitch -= 0.15
    if (!this.kamikaze && this.health > 0 && this.health < this.maxHealth * 0.3) {
      this.kamikaze = true
      this.world.audio.play('drone_loop', { volume: 0.8, pos: this.pos, rate: 1.6 })
    }
    const killed = this.health <= 0
    if (killed) this.die(info)
    return { dealt, killed, armor: false }
  }

  private die(info: DamageInfo): void {
    this.alive = false
    this.falling = !info.splash
    this.fallT = 0
    const away = tA.copy(this.pos).sub(info.from).setY(0).normalize()
    // Death direction in the hound's frame: x = right, y = back.
    const c = Math.cos(this.yaw)
    const s = Math.sin(this.yaw)
    this.deathDir.set(away.x * c - away.z * s, away.x * s + away.z * c)
    this.body.setNextKinematicTranslation({ x: 0, y: -60, z: 0 })
    this.body.setTranslation({ x: 0, y: -60, z: 0 }, true)
    this.world.fx.sparks(this.pos.clone(), new THREE.Vector3(0, 1, 0), 10, 6)
    this.world.fx.debrisBurst(this.pos.clone(), 5, 5)
    this.world.audio.play('robot_death', { volume: 0.7, pos: this.pos, rate: 1.25 })
    if (!this.falling) this.burst()
  }

  private burst(): void {
    const at = this.pos.clone()
    this.world.explode(at, 3.2, this.kamikaze ? 45 : 12, -1, 'kamikaze')
    this.hide()
  }

  update(dt: number, target: { pos: THREE.Vector3; vel: THREE.Vector3; alive: boolean }, frozen: boolean): void {
    this.prevPos.copy(this.pos)
    this.prevYaw = this.yaw
    const W = this.world
    if (this.falling) {
      this.fallT += dt
      this.vel.multiplyScalar(Math.exp(-4 * dt))
      this.pos.addScaledVector(this.vel, dt)
      const g = W.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5)
      this.pos.y = Math.max(g + CENTER_H * (1 - 0.55 * ss(this.fallT, 0, 0.5)), this.pos.y - dt * 3)
      this.smokeT -= dt
      if (this.smokeT <= 0) {
        this.smokeT = 0.06
        W.fx.smokeTrail(this.pos.clone(), tA.set(0, 1.5, 0))
        if (Math.random() < 0.5) W.fx.sparks(this.pos.clone(), tB.set(0, 1, 0), 3, 4)
      }
      if (this.fallT > 1.15) this.burst()
      this.servo?.set(this.pos)
      return
    }
    if (!this.alive) return
    const t = W.time
    const toT = tA.set(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z)
    const dist = toT.length()
    let face = this.yaw
    if (frozen || !target.alive) {
      this.vel.x *= Math.exp(-4 * dt)
      this.vel.z *= Math.exp(-4 * dt)
    } else if (this.kamikaze) {
      // Sprint straight at the target, beeping faster as it closes.
      toT.divideScalar(Math.max(0.01, dist))
      this.vel.x += (toT.x * 9 - this.vel.x) * (1 - Math.exp(-dt * 4))
      this.vel.z += (toT.z * 9 - this.vel.z) * (1 - Math.exp(-dt * 4))
      this.beepT -= dt
      if (this.beepT <= 0) {
        this.beepT = THREE.MathUtils.clamp(dist / 20, 0.08, 0.4)
        W.audio.play('hitmarker', { volume: 0.35, pos: this.pos, rate: 2.2 })
        this.model.optic.emissiveIntensity = 12
      } else this.model.optic.emissiveIntensity = Math.max(2.2, this.model.optic.emissiveIntensity - dt * 40)
      if (dist < 1.4 && Math.abs(target.pos.y - this.pos.y) < 2.2) {
        this.health = 0
        this.alive = false
        this.burst()
        return
      }
    } else {
      // Circle and strafe on the ground.
      this.flipT -= dt
      if (this.flipT <= 0) {
        this.flipT = rand(2, 4.5)
        if (Math.random() < 0.45) this.orbitDir *= -1
        this.orbitR = rand(6, 11)
      }
      this.orbitA += this.orbitDir * dt * (5 / this.orbitR)
      const wx = THREE.MathUtils.clamp(target.pos.x + Math.cos(this.orbitA) * this.orbitR, -36, 36)
      const wz = THREE.MathUtils.clamp(target.pos.z + Math.sin(this.orbitA) * this.orbitR, -36, 36)
      const ax = (wx - this.pos.x) * 2.4 - this.vel.x * 1.7
      const az = (wz - this.pos.z) * 2.4 - this.vel.z * 1.7
      this.vel.x += ax * dt
      this.vel.z += az * dt
      // Attack: telegraph then fire.
      this.fireT -= dt
      const eyeTo = tB.copy(target.pos).setY(target.pos.y + 1.2)
      if (this.fireT <= 0 && this.charge <= 0 && W.lineOfSight(this.pos, eyeTo)) {
        this.charge = 0.45
        W.audio.play('plasma_shot', { volume: 0.3, pos: this.pos, rate: 0.5, jitter: 0.05 })
      }
      if (this.charge > 0) {
        this.charge -= dt
        this.model.optic.emissiveIntensity = 2 + (1 - this.charge / 0.45) * 9
        if (this.charge <= 0) {
          this.root.updateMatrixWorld(true)
          const m = this.model.muzzle.getWorldPosition(new THREE.Vector3())
          const lead = tB.copy(target.pos).addScaledVector(target.vel, (m.distanceTo(target.pos) / 30) * 0.7).setY(target.pos.y + 1.1)
          W.fireProjectile(-100 - this.id, m, lead.sub(m).normalize(), 'plasma')
          W.audio.play('plasma_shot', { volume: 0.9, pos: m, jitter: 0.08, ref: 5 })
          W.fx.flash(m, '#3fb8ff', 10, 0.08, 6)
          W.fx.muzzle(m, lead.normalize(), [1.2, 3.4, 6, 1], 0.7)
          this.fireT = rand(1.4, 2.2)
          this.model.optic.emissiveIntensity = 2.2
          this.pitch -= 0.06
        }
      }
    }
    // Speed cap, obstacles: slide along walls, hop low cover.
    const hs = Math.hypot(this.vel.x, this.vel.z)
    const cap = this.kamikaze ? 9 : 6.5
    if (hs > cap) {
      this.vel.x *= cap / hs
      this.vel.z *= cap / hs
    }
    if (hs > 0.4) {
      const dir = tB.set(this.vel.x / hs, 0, this.vel.z / hs)
      const hit = W.raycast(this.pos, dir, 1.2, this.collider.handle, true)
      if (hit) {
        const into = this.vel.x * hit.normal.x + this.vel.z * hit.normal.z
        if (into < 0) {
          this.vel.x -= hit.normal.x * into
          this.vel.z -= hit.normal.z * into
        }
        this.blockedT += dt
        if (this.grounded && this.blockedT > 0.15) {
          // Low obstacle ahead? Jump it; otherwise pick the other orbit direction.
          const over = W.raycast(tA.copy(this.pos).setY(this.pos.y + 1.1), dir, 1.4, this.collider.handle, true)
          if (!over) {
            this.vel.y = 6.2
            this.grounded = false
            W.audio.play('hound_step', { volume: 0.6, pos: this.pos, rate: 0.8 })
          } else this.orbitDir *= -1
          this.blockedT = 0
        }
      } else this.blockedT = 0
    }
    // Gravity and ground.
    this.vel.y -= 20 * dt
    this.pos.addScaledVector(this.vel, dt)
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -37, 37)
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -37, 37)
    const g = W.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3) + CENTER_H
    if (this.pos.y <= g) {
      if (!this.grounded && this.vel.y < -3) {
        W.audio.play('land', { volume: 0.5, pos: this.pos, rate: 1.3 })
        this.pitch += 0.12
      }
      this.pos.y = g
      this.vel.y = 0
      this.grounded = true
    } else if (this.pos.y > g + 0.08) this.grounded = false
    // Heading: travel direction when moving, the target when standing.
    const hs2 = Math.hypot(this.vel.x, this.vel.z)
    face = hs2 > 1.2 ? Math.atan2(-this.vel.x, -this.vel.z) : Math.atan2(-(target.pos.x - this.pos.x), -(target.pos.z - this.pos.z))
    let dy = face - this.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    const turn = dy * Math.min(1, dt * 6)
    this.yaw += turn
    this.roll += (-turn / Math.max(dt, 1e-3) * 0.03 * Math.min(1, hs2 / 4) - this.roll) * Math.min(1, dt * 6)
    this.pitch += (0 - this.pitch) * Math.min(1, dt * 5)
    // Turret tracks the target independently of the body.
    const aim = Math.atan2(-(target.pos.x - this.pos.x), -(target.pos.z - this.pos.z))
    let ty = aim - this.yaw
    ty = Math.atan2(Math.sin(ty), Math.cos(ty))
    this.turretYaw += (THREE.MathUtils.clamp(ty, -2.2, 2.2) - this.turretYaw) * Math.min(1, dt * 7)
    // Trot: step frequency and stride follow ground speed.
    const moving = Math.min(1, hs2 / 1.2)
    this.gait += dt * (4 + hs2 * 1.6) * (moving > 0.05 ? 1 : 0.3)
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z })
    this.servo?.set(this.pos)
    void t
  }

  render(alpha: number, dt: number): void {
    if (!this.root.visible) return
    const M = this.model
    this.root.position.lerpVectors(this.prevPos, this.pos, alpha)
    this.root.position.y -= CENTER_H
    let dy = this.yaw - this.prevYaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    this.root.rotation.y = this.prevYaw + dy * alpha
    const hs = Math.hypot(this.vel.x, this.vel.z)
    const moving = this.falling ? 0 : Math.min(1, hs / 1.2)
    const stride = Math.min(0.13, hs * 0.028)
    const lift = 0.07 * moving + (this.grounded || this.falling ? 0 : 0.1)
    const collapse = this.falling ? ss(this.fallT, 0, 0.45) : 0
    // Torso: trot bob, pitch/roll, collapse tilt away from the killing blow.
    M.torso.position.set(0, HIP_Y - Math.abs(Math.sin(this.gait)) * 0.012 * moving - collapse * 0.2, 0)
    M.torso.rotation.set(this.pitch + collapse * this.deathDir.y * 0.35, 0, this.roll - collapse * this.deathDir.x * 0.5)
    M.turret.rotation.set(0, this.turretYaw, 0)
    const hipDrop = collapse * 0.2
    for (const L of M.legs) {
      const ph = this.gait + L.phase
      const swing = Math.sin(ph) > 0
      // Foot target in the hip's sagittal plane (model units, relative to the hip).
      let fz = L.foot.z - L.hip.z - Math.cos(ph) * stride
      let fy = L.foot.y - L.hip.y + (swing ? Math.sin(ph) * lift : 0) + (this.grounded ? 0 : 0.08) + hipDrop
      if (this.falling) {
        fz += (L.front ? -0.12 : 0.12) * collapse
        fy += 0.05 * collapse
      }
      const d = THREE.MathUtils.clamp(Math.hypot(fy, fz), Math.abs(L.l1 - L.l2) + 0.01, (L.l1 + L.l2) * 0.999)
      const cosA = THREE.MathUtils.clamp((L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d), -1, 1)
      const thA = sag(fy, fz) + Math.acos(cosA)
      const kz = Math.sin(thA) * L.l1
      const ky = -Math.cos(thA) * L.l1
      const thB = sag(fy - ky, fz - kz)
      // Rotation about +X moves a down-pointing limb toward −Z, so rearward swing is negative.
      L.hipBone.rotation.x = -(thA - L.a0)
      L.kneeBone.rotation.x = -(thB - L.b0) + (thA - L.a0)
      // Footfall sound at touchdown.
      if (swing) L.planted = false
      else if (!L.planted) {
        L.planted = true
        if (moving > 0.3 && this.grounded) this.world.audio.play('hound_step', { volume: 0.22, pos: this.root.position, jitter: 0.12 })
      }
    }
    void dt
  }
}

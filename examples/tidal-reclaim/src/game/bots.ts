import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG, type BotKind } from './config'
import type { CombatWorld, DamageInfo, DamageResult, DamageSource } from './combat'
import { HEAD_Y } from './combat'
import type { NavGrid } from './nav'
import { buildRobot, RobotAnimator, type HeldKind, type RobotAsset, type RobotLook, type RobotParts } from './robot'
import type { VmAssets } from './tripoguns'
import { applyDamage } from './rules'

/** `h`: height scale of the target's body (crouching player ≈ 0.55); bots look/aim lower. */
export type Target = { id: number; pos: THREE.Vector3; vel: THREE.Vector3; alive: boolean; isPlayer: boolean; h?: number }
export type ItemInfo = { pos: THREE.Vector3; kind: 'health' | 'armor' | 'ammo' | 'rocket'; available: boolean }
export type BrainContext = {
  targets: Target[]
  items: ItemInfo[]
  hotspots: THREE.Vector3[]
  /** Player's eye position for near-miss flyby sounds. */
  playerEye: THREE.Vector3
  playerId: number
  frozen: boolean
}

type State = 'roam' | 'engage' | 'chase' | 'cover' | 'item'
type Weapon = 'rifle' | 'scatter' | 'minigun' | 'cannon'

const up = new THREE.Vector3(0, 1, 0)
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpC = new THREE.Vector3()
const tmpD = new THREE.Vector3()

const rand = (a: number, b: number) => a + Math.random() * (b - a)

type KindDef = {
  look: RobotLook
  weapon: Weapon
  range: [number, number]
  pellets: number
  damage: number
  spread: number
  interval: number
  burst: number
  mag: number
  health: number
  speed: number
  /** Seeks cover when hurt. */
  cover: boolean
  heavy: boolean
  /** Footstep weight for world.stomp (0 = light footsteps handled by the game). */
  stomp: number
  reaction: number
}

const HELD: Record<Weapon, HeldKind> = { rifle: 'rifle', scatter: 'shotgun', minigun: 'minigun', cannon: 'cannon' }
/** Health/speed/damage are multipliers on CONFIG.bots. */
const KIND: Record<BotKind, KindDef> = {
  striker: { look: 'operator', weapon: 'rifle', range: [9, 24], pellets: 1, damage: 1, spread: 1, interval: 1, burst: 1, mag: 30, health: 1, speed: 1, cover: true, heavy: false, stomp: 0, reaction: 1 },
  warden: { look: 'breacher', weapon: 'scatter', range: [3.5, 10], pellets: 7, damage: 0.72, spread: 1.9, interval: 7.5, burst: 0.2, mag: 6, health: 1.25, speed: 0.93, cover: true, heavy: false, stomp: 0, reaction: 1 },
  scrapper: { look: 'operator', weapon: 'rifle', range: [7, 20], pellets: 1, damage: 0.8, spread: 1.35, interval: 1.15, burst: 1, mag: 24, health: 0.75, speed: 0.96, cover: true, heavy: false, stomp: 0, reaction: 1.15 },
  breacher: { look: 'breacher', weapon: 'scatter', range: [3, 9], pellets: 7, damage: 0.62, spread: 1.9, interval: 7.5, burst: 0.2, mag: 6, health: 0.95, speed: 0.98, cover: true, heavy: false, stomp: 0, reaction: 1.1 },
  juggernaut: { look: 'exo', weapon: 'minigun', range: [6, 24], pellets: 1, damage: 0.36, spread: 1.7, interval: 0.46, burst: 1, mag: 60, health: 4.6, speed: 0.46, cover: false, heavy: true, stomp: 0.6, reaction: 1.4 },
  titan: { look: 'warden', weapon: 'cannon', range: [9, 30], pellets: 1, damage: 1, spread: 1, interval: 1, burst: 1, mag: 3, health: 36, speed: 0.44, cover: false, heavy: true, stomp: 1.5, reaction: 0.6 },
}

export class Bot {
  readonly parts: RobotParts
  readonly anim: RobotAnimator
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  readonly pos = new THREE.Vector3()
  readonly prevPos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  yaw = 0
  private prevYaw = 0
  readonly aimDir = new THREE.Vector3(0, 0, -1)
  health = 100
  armor = 0
  maxHealth = 100
  alive = false
  respawnIn = 0.1
  state: State = 'roam'
  target = -1
  /** Onslaught wave enemy (shares a team with other wave enemies). */
  wave = false
  /** Uniform model scale (1 = human-sized). */
  readonly scale: number
  /** Heavy enemies resist knockback and flinch. */
  readonly heavy: boolean
  /** Boss phase (1..3); 1 for everything else. */
  phase = 1
  private targetVisible = false
  private readonly lastSeen = new THREE.Vector3()
  private lastSeenAt = -99
  private reaction = 0
  private focus = 0
  private path: { x: number; z: number }[] = []
  private pathI = 0
  private readonly goal = new THREE.Vector3()
  private repath = 0
  private strafe = 1
  private strafeT = 0
  private burstLeft = 0
  private fireT = 0
  private mag = 30
  private reloadT = 0
  private stateT = 0
  private coverCd = 0
  private perceiveT = Math.random() * 0.15
  private stuckT = 0
  private readonly stuckRef = new THREE.Vector3()
  private flybyT = 0
  private attackedBy = -1
  private attackedAt = -99
  rockets = 0
  private rocketT = 0
  private readonly skill: number
  private readonly k: KindDef
  lastDamageFrom = new THREE.Vector3()
  readonly muzzleWorld = new THREE.Vector3()
  // Heavy / boss state.
  private spin = 0
  private sprayT = 0
  private volleyLeft = 0
  private slamT = 0
  private slamWind = -1
  private summonT = 0
  private phaseLock = 0
  private stepDist = 0
  // Death presentation (driven from render).
  private dyingT = -1
  private lastRender = 0
  private lastHeadshot = false
  private readonly deathFrom = new THREE.Vector3()

  constructor(
    readonly id: number,
    readonly name: string,
    readonly kind: BotKind,
    readonly color: string,
    readonly visor: string,
    physics: Physics,
    private readonly nav: NavGrid,
    private readonly world: CombatWorld,
    robot: RobotAsset,
    vm: VmAssets,
    look?: RobotLook,
  ) {
    this.k = look ? { ...KIND[kind], look } : KIND[kind]
    this.skill = rand(0.85, 1.2)
    this.parts = buildRobot(robot, this.k.look, visor, HELD[this.k.weapon], vm)
    this.scale = this.parts.scale
    this.heavy = this.k.heavy
    this.anim = new RobotAnimator(this.parts)
    this.parts.root.visible = false
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0))
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.55 * this.scale, 0.38 * Math.min(this.scale, 2.2)), this.body)
  }

  get eye(): THREE.Vector3 {
    return tmpC.copy(this.pos).setY(this.pos.y + 1.6 * this.scale)
  }

  get dying(): boolean {
    return this.dyingT >= 0
  }

  spawn(at: THREE.Vector3, yaw: number): void {
    this.pos.copy(at)
    this.prevPos.copy(at)
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.prevYaw = yaw
    this.aimDir.set(-Math.sin(yaw), 0, -Math.cos(yaw))
    this.maxHealth = CONFIG.bots.health * this.k.health
    this.health = this.maxHealth
    this.armor = this.kind === 'juggernaut' ? 60 : 0
    this.alive = true
    this.state = 'roam'
    this.target = -1
    this.targetVisible = false
    this.path = []
    this.mag = this.k.mag
    this.reloadT = 0
    this.rockets = 0
    this.burstLeft = 0
    this.attackedBy = -1
    this.phase = 1
    this.spin = 0
    this.sprayT = 0
    this.volleyLeft = 0
    this.slamT = 4
    this.slamWind = -1
    this.summonT = 6
    this.phaseLock = 0
    this.fireT = this.kind === 'titan' ? 2.5 : 0
    this.dyingT = -1
    this.anim.reset()
    this.parts.root.visible = true
    this.parts.root.scale.setScalar(1)
    const cy = at.y + 0.93 * this.scale
    this.body.setTranslation({ x: at.x, y: cy, z: at.z }, true)
    this.body.setNextKinematicTranslation({ x: at.x, y: cy, z: at.z })
  }

  /** Remove instantly (match reset). */
  hide(): void {
    this.alive = false
    this.dyingT = -1
    this.anim.reset()
    this.parts.root.visible = false
    this.park()
  }

  private park(): void {
    this.body.setNextKinematicTranslation({ x: 0, y: -50, z: 0 })
    this.body.setTranslation({ x: 0, y: -50, z: 0 }, true)
    this.vel.set(0, 0, 0)
  }

  isHead(point: THREE.Vector3): boolean {
    return point.y - this.pos.y > HEAD_Y * this.scale
  }

  /** Damage multiplier for a hit at `point` (exposed cores on heavies and the boss). */
  weakMultiplier(point: THREE.Vector3): number {
    if (!this.heavy || !this.alive) return 1
    const w = this.parts.weak.getWorldPosition(tmpD)
    if (w.distanceTo(point) > this.parts.weakRadius * this.scale * 1.7) return 1
    if (this.kind === 'titan') return this.phase >= 3 ? 3 : 1.35
    return 2.4
  }

  takeDamage(info: DamageInfo): DamageResult {
    if (!this.alive) return { dealt: 0, killed: false, armor: false }
    let amount = info.amount
    if (this.phaseLock > 0) amount *= 0.1
    // Friendly fire between wave enemies is off.
    if (this.wave && this.world.onslaught && info.attacker !== 0 && info.attacker >= 0) return { dealt: 0, killed: false, armor: false }
    const before = this.health + this.armor
    const hadArmor = this.armor > 0
    const r = applyDamage(this.health, this.armor, amount)
    this.health = r.health
    this.armor = r.armor
    const dealt = before - (r.health + r.armor)
    const dir = tmpA.copy(this.pos).sub(info.from).setY(0).normalize()
    const lx = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw)
    const lz = dir.x * Math.sin(this.yaw) + dir.z * Math.cos(this.yaw)
    this.anim.hit(lx, lz, Math.min(1.5, amount / (25 * (this.heavy ? this.scale * 2 : 1))))
    // Stagger: light enemies on heavy blows, heavies only on big weak-point / splash hits.
    if (!this.heavy && amount > 38) this.anim.staggerFor(0.32)
    else if (this.heavy && amount > 90 * this.scale) this.anim.staggerFor(0.4)
    if (info.attacker >= 0 && info.attacker !== this.id) {
      this.attackedBy = info.attacker
      this.attackedAt = this.world.time
      this.lastDamageFrom.copy(info.from)
      if (!this.targetVisible) {
        this.target = info.attacker
        this.lastSeen.copy(info.from).setY(info.from.y - 1.5)
        this.lastSeenAt = this.world.time
        this.state = 'chase'
        this.repath = 0
      }
    }
    if (info.splash) this.vel.addScaledVector(dir, Math.min(9, amount * 0.08) / (this.heavy ? this.scale * 3 : 1))
    this.lastHeadshot = !!info.headshot
    // Boss phases.
    if (this.kind === 'titan' && this.health > 0) {
      const frac = this.health / this.maxHealth
      const next = frac <= 0.33 ? 3 : frac <= 0.66 ? 2 : 1
      if (next > this.phase) {
        this.phase = next
        this.phaseLock = 1.4
        this.anim.staggerFor(1.2)
        this.world.bossPhase(next, this.pos.clone().setY(this.pos.y + 1))
        if (next === 2) this.world.summonDrones(this.eye.clone().setY(this.pos.y + 3), 3)
        this.summonT = 12
      }
    }
    const killed = this.health <= 0
    if (killed) this.alive = false
    return { dealt, killed, armor: hadArmor && r.armor > 0 }
  }

  hear(pos: THREE.Vector3, source: number): void {
    if (!this.alive || source === this.id || this.targetVisible) return
    if (this.state === 'cover' || this.state === 'item') return
    if (this.wave && source !== 0) return
    this.target = source
    this.lastSeen.copy(pos).setY(pos.y - 1.5)
    this.lastSeenAt = this.world.time
    this.state = 'chase'
    this.repath = 0
  }

  /**
   * Death: the rig topples away from the blow (animated in render). Explosive kills and heavy
   * machines also blow armour plates off as physical gibs.
   */
  shatter(from: THREE.Vector3, power: number): void {
    this.parts.root.updateMatrixWorld(true)
    const away = tmpA.copy(this.pos).sub(from).setY(0)
    if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 0, Math.random() - 0.5)
    away.normalize()
    const lx = away.x * Math.cos(this.yaw) - away.z * Math.sin(this.yaw)
    const lz = away.x * Math.sin(this.yaw) + away.z * Math.cos(this.yaw)
    this.anim.die(lx, lz, this.lastHeadshot)
    this.dyingT = 0
    this.lastRender = performance.now()
    this.deathFrom.copy(from)
    const gibAll = power > 1.4 || this.heavy
    const share = gibAll ? 1 : 0.35
    for (const g of this.parts.gibs) {
      if (Math.random() > share) continue
      const clone = g.clone(true)
      g.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale)
      clone.traverse(o => {
        o.castShadow = true
      })
      g.visible = false
      const v = away.clone().multiplyScalar(rand(2, 5) * power).add(new THREE.Vector3(rand(-2, 2), rand(3, 7), rand(-2, 2)))
      this.world.fx.gib(clone, v, new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), rand(3.5, 5), 0.18 * Math.min(2, this.scale))
    }
    // Corpses never block shots or movement.
    this.park()
  }

  private setPath(x: number, z: number): boolean {
    const p = this.nav.findPath(this.pos.x, this.pos.z, x, z)
    this.goal.set(x, 0, z)
    if (!p || p.length === 0) {
      this.path = []
      return false
    }
    this.path = p
    this.pathI = 0
    return true
  }

  private pickRoam(ctx: BrainContext): void {
    // Wave enemies hunt the player instead of roaming.
    if (this.wave) {
      const pl = ctx.targets.find(t => t.isPlayer && t.alive)
      if (pl) {
        this.target = pl.id
        this.lastSeen.copy(pl.pos)
        this.lastSeenAt = this.world.time
        this.state = 'chase'
        this.setPath(pl.pos.x + rand(-4, 4), pl.pos.z + rand(-4, 4))
        return
      }
    }
    const wants: ItemInfo['kind'][] = []
    if (this.health < this.maxHealth * 0.65) wants.push('health')
    if (this.armor < 40) wants.push('armor')
    if (this.rockets === 0) wants.push('rocket')
    let best: ItemInfo | undefined
    let bestD = 34
    for (const it of ctx.items) {
      if (!it.available || !wants.includes(it.kind)) continue
      const d = it.pos.distanceTo(this.pos) * (it.kind === 'health' && this.health < 45 ? 0.5 : 1)
      if (d < bestD) {
        bestD = d
        best = it
      }
    }
    if (best && this.setPath(best.pos.x, best.pos.z)) {
      this.state = 'item'
      return
    }
    const spots = ctx.hotspots
    for (let i = 0; i < 4; i += 1) {
      const s = spots[Math.floor(Math.random() * spots.length)]
      if (s.distanceTo(this.pos) < 8) continue
      if (this.setPath(s.x + rand(-3, 3), s.z + rand(-3, 3))) break
    }
    this.state = 'roam'
  }

  private findCover(threat: THREE.Vector3): boolean {
    const nav = this.nav
    let best: { x: number; z: number } | undefined
    let bestD = Infinity
    const eye = tmpB.copy(threat).setY(threat.y + 1.6)
    for (let i = 0; i < 22; i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = rand(3, 13)
      const x = this.pos.x + Math.cos(a) * r
      const z = this.pos.z + Math.sin(a) * r
      if (!nav.walkable(x, z)) continue
      const h = nav.heightAt(x, z)
      if (Math.hypot(x - threat.x, z - threat.z) < 7) continue
      if (this.world.lineOfSight(eye, tmpA.set(x, h + 1.3, z))) continue
      const d = Math.hypot(x - this.pos.x, z - this.pos.z)
      if (d < bestD) {
        bestD = d
        best = { x, z }
      }
    }
    return best ? this.setPath(best.x, best.z) : false
  }

  private perceive(ctx: BrainContext): void {
    const eye = this.eye.clone()
    const fwd = tmpA.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    let bestId = -1
    let bestScore = Infinity
    let bestPos: THREE.Vector3 | undefined
    for (const t of ctx.targets) {
      if (!t.alive || t.id === this.id) continue
      if (this.wave && !t.isPlayer) continue
      const d = t.pos.distanceTo(this.pos)
      if (d > CONFIG.bots.viewRange * (this.wave ? 1.3 : 1)) continue
      const to = tmpB.copy(t.pos).sub(this.pos).setY(0).normalize()
      const recentlyHit = this.attackedBy === t.id && this.world.time - this.attackedAt < 3
      const inFov = this.wave || fwd.dot(to) > -0.2 || d < 6 || recentlyHit || (this.target === t.id && this.targetVisible)
      if (!inFov) continue
      const chest = tmpB.copy(t.pos).setY(t.pos.y + 1.3 * (t.h ?? 1))
      if (!this.world.lineOfSight(eye, chest)) continue
      let score = d * (t.isPlayer ? 0.72 : 1)
      if (recentlyHit) score *= 0.45
      if (this.target === t.id) score *= 0.7
      if (score < bestScore) {
        bestScore = score
        bestId = t.id
        bestPos = t.pos
      }
    }
    if (bestId >= 0 && bestPos) {
      if (bestId !== this.target || !this.targetVisible) {
        this.reaction = CONFIG.bots.reaction * this.k.reaction * rand(0.75, 1.3) * (this.target === bestId && this.world.time - this.lastSeenAt < 1.5 ? 0.4 : 1)
        this.focus = 0
      }
      this.target = bestId
      this.targetVisible = true
      this.lastSeen.copy(bestPos)
      this.lastSeenAt = this.world.time
      if (this.state === 'roam' || this.state === 'chase' || (this.state === 'item' && this.health > this.maxHealth * 0.35)) {
        this.state = 'engage'
        this.path = []
      }
    } else {
      this.targetVisible = false
      if (this.state === 'engage') {
        this.state = 'chase'
        this.repath = 0
      }
    }
  }

  update(dt: number, ctx: BrainContext, others: Bot[]): void {
    this.prevPos.copy(this.pos)
    this.prevYaw = this.yaw
    if (!this.alive) return
    const time = this.world.time
    this.stateT += dt
    this.coverCd = Math.max(0, this.coverCd - dt)
    this.reaction = Math.max(0, this.reaction - dt)
    this.fireT = Math.max(0, this.fireT - dt)
    this.flybyT = Math.max(0, this.flybyT - dt)
    this.rocketT = Math.max(0, this.rocketT - dt)
    this.phaseLock = Math.max(0, this.phaseLock - dt)
    this.slamT = Math.max(0, this.slamT - dt)
    this.summonT = Math.max(0, this.summonT - dt)
    if (ctx.frozen) {
      this.anim.update(dt, 0, 0, 0, 0, 0, time)
      return
    }
    this.perceiveT -= dt
    if (this.perceiveT <= 0) {
      this.perceiveT = 0.12
      this.perceive(ctx)
    }
    const tgt = ctx.targets.find(t => t.id === this.target && t.alive)
    if (!tgt && this.state !== 'roam' && this.state !== 'item' && this.state !== 'cover') {
      this.target = -1
      this.targetVisible = false
      this.pickRoam(ctx)
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt
      if (this.reloadT <= 0) this.mag = this.k.mag
    }
    const staggered = this.anim.staggered
    // Decide movement.
    const desired = tmpA.set(0, 0, 0)
    let speed = CONFIG.bots.speed * this.k.speed * (this.kind === 'titan' && this.phase >= 2 ? 1.25 : 1)
    const distT = tgt ? tgt.pos.distanceTo(this.pos) : 0
    if (this.state === 'engage' && tgt) {
      if (this.k.cover && this.health < this.maxHealth * 0.4 && this.coverCd <= 0 && this.findCover(tgt.pos)) {
        this.state = 'cover'
        this.stateT = 0
        this.coverCd = 8
      } else {
        const [minR, maxR] = this.k.range
        const to = tmpB.copy(tgt.pos).sub(this.pos).setY(0)
        const dist = to.length()
        to.normalize()
        this.strafeT -= dt
        if (this.strafeT <= 0) {
          this.strafe = Math.random() < 0.5 ? -1 : 1
          this.strafeT = rand(0.45, 1.5) * (this.heavy ? 2 : 1)
        }
        const side = tmpC.crossVectors(to, up).multiplyScalar(this.strafe)
        desired.addScaledVector(side, this.heavy ? 0.35 : 0.85)
        if (dist > maxR) {
          this.repath -= dt
          if (this.repath <= 0 || this.path.length === 0) {
            this.setPath(tgt.pos.x, tgt.pos.z)
            this.repath = 0.7
          }
          const w = this.followPath()
          if (w) desired.multiplyScalar(0.35).add(w)
        } else if (dist < minR && this.kind !== 'titan') desired.addScaledVector(to, -0.8)
        else if (this.kind === 'titan') desired.addScaledVector(to, 0.45)
        speed *= 0.82
      }
    } else if (this.state === 'cover') {
      const w = this.followPath()
      if (w) desired.add(w)
      else if (this.mag < this.k.mag && this.reloadT <= 0) this.reloadT = 1.6
      if (this.stateT > 4.5 || (!w && this.stateT > 2)) {
        this.state = this.targetVisible ? 'engage' : 'chase'
        this.repath = 0
        if (this.health < this.maxHealth * 0.5) this.pickRoam(ctx)
      }
    } else if (this.state === 'chase') {
      this.repath -= dt
      if (this.repath <= 0) {
        // Wave enemies track the live player position even without sight.
        const pl = this.wave ? ctx.targets.find(t => t.isPlayer && t.alive) : undefined
        if (pl) this.lastSeen.copy(pl.pos)
        if (!this.setPath(this.lastSeen.x, this.lastSeen.z)) this.pickRoam(ctx)
        this.repath = this.wave ? 0.9 : 1.2
      }
      const w = this.followPath()
      if (w) desired.add(w)
      if (!this.wave && ((!w && this.path.length === 0) || time - this.lastSeenAt > 7)) {
        this.target = -1
        this.pickRoam(ctx)
      }
    } else {
      if (this.path.length === 0 || this.pathI >= this.path.length) this.pickRoam(ctx)
      const w = this.followPath()
      if (w) desired.add(w)
      if (this.state === 'item') {
        const still = ctx.items.some(it => it.available && it.pos.distanceTo(this.goal.clone().setY(it.pos.y)) < 1.5)
        if (!still) this.pickRoam(ctx)
      }
    }
    // Separation from other bots (scaled by size).
    for (const o of others) {
      if (o === this || !o.alive) continue
      const dx = this.pos.x - o.pos.x
      const dz = this.pos.z - o.pos.z
      const r = 0.75 * (this.scale + o.scale)
      const d2 = dx * dx + dz * dz
      if (d2 < r * r && d2 > 1e-4) {
        const d = Math.sqrt(d2)
        desired.x += (dx / d) * (r - d) * 1.2
        desired.z += (dz / d) * (r - d) * 1.2
      }
    }
    if (desired.lengthSq() > 1) desired.normalize()
    desired.multiplyScalar(staggered || this.slamWind >= 0 ? speed * 0.15 : speed)
    const acc = 1 - Math.exp(-dt * (this.heavy ? 4 : 9))
    this.vel.x += (desired.x - this.vel.x) * acc
    this.vel.z += (desired.z - this.vel.z) * acc
    const before = tmpD.copy(this.pos)
    this.move(dt)
    // Heavy footfalls.
    if (this.k.stomp > 0) {
      this.stepDist += Math.hypot(this.pos.x - before.x, this.pos.z - before.z)
      if (this.stepDist > 1.25 * this.scale) {
        this.stepDist = 0
        this.world.stomp(this.pos.clone(), this.k.stomp)
      }
    }
    // Stuck detection.
    this.stuckT += dt
    if (this.stuckT > 1.4) {
      if (this.pos.distanceTo(this.stuckRef) < 0.5 && desired.lengthSq() > 1) {
        this.path = []
        this.repath = 0
        if (this.state !== 'engage') this.pickRoam(ctx)
      }
      this.stuckRef.copy(this.pos)
      this.stuckT = 0
    }
    // Facing and aim.
    let faceYaw = this.yaw
    const aimH = 1.25 * (tgt?.h ?? 1)
    if (tgt && (this.targetVisible || time - this.lastSeenAt < 0.8)) {
      const aimPoint = tmpB.copy(this.targetVisible ? tgt.pos : this.lastSeen).setY((this.targetVisible ? tgt.pos.y : this.lastSeen.y) + aimH)
      const want = aimPoint.sub(this.eye).normalize()
      this.aimDir.lerp(want, 1 - Math.exp(-dt * (this.heavy ? 4.5 : 7.5))).normalize()
      faceYaw = Math.atan2(-want.x, -want.z)
    } else if (this.vel.lengthSq() > 0.5) {
      faceYaw = Math.atan2(-this.vel.x, -this.vel.z)
      const want = tmpB.set(-Math.sin(faceYaw), 0, -Math.cos(faceYaw))
      this.aimDir.lerp(want, 1 - Math.exp(-dt * 4)).normalize()
    }
    let dy = faceYaw - this.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    this.yaw += dy * (1 - Math.exp(-dt * (this.heavy ? 3.5 : 8)))
    // Combat.
    if (this.kind === 'titan') this.bossAttacks(dt, tgt, distT)
    if (tgt && this.targetVisible && this.reaction <= 0 && !staggered && this.slamWind < 0) {
      this.focus += dt
      const want = tmpB.copy(tgt.pos).setY(tgt.pos.y + aimH).sub(this.eye).normalize()
      if (this.aimDir.dot(want) > (this.heavy ? 0.93 : 0.97)) this.shoot(dt, tgt, distT, ctx)
      else this.spin = Math.max(0, this.spin - dt * 0.8)
    } else {
      this.focus = Math.max(0, this.focus - dt * 2)
      this.spin = Math.max(0, this.spin - dt * 0.8)
    }
    // Animation.
    const sp = Math.hypot(this.vel.x, this.vel.z)
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const fwd = sp > 0.1 ? (this.vel.x * fx + this.vel.z * fz) / sp : 0
    const side = sp > 0.1 ? (this.vel.x * -fz + this.vel.z * fx) / sp : 0
    const aimYaw = Math.atan2(-this.aimDir.x, -this.aimDir.z) - this.yaw
    this.anim.update(dt, sp, fwd, side, Math.atan2(Math.sin(aimYaw), Math.cos(aimYaw)), Math.asin(THREE.MathUtils.clamp(this.aimDir.y, -1, 1)), time)
  }

  /** The Warden's signature attacks: close-range ground slam and drone reinforcements. */
  private bossAttacks(dt: number, tgt: Target | undefined, dist: number): void {
    if (this.slamWind >= 0) {
      this.slamWind += dt
      if (this.slamWind > 0.75) {
        this.slamWind = -1
        this.world.bossSlam(this.pos.clone(), this.phase >= 3 ? 13 : 11, this.phase >= 3 ? 42 : 34, this.id)
      }
      return
    }
    if (tgt && dist < 9 && this.slamT <= 0 && this.phaseLock <= 0) {
      this.slamT = this.phase >= 3 ? 4 : 6
      this.slamWind = 0
      this.anim.staggerFor(0.8)
      this.world.audio.play('boss_roar', { volume: 0.7, pos: this.pos, rate: 1.25, ref: 10 })
      return
    }
    if (this.phase >= 2 && this.summonT <= 0) {
      this.summonT = this.phase >= 3 ? 10 : 14
      this.world.summonDrones(this.eye.clone(), this.phase >= 3 ? 3 : 2)
    }
  }

  private followPath(): THREE.Vector3 | null {
    while (this.pathI < this.path.length) {
      const w = this.path[this.pathI]
      const dx = w.x - this.pos.x
      const dz = w.z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.7 * Math.max(1, this.scale * 0.7)) {
        this.pathI += 1
        continue
      }
      const n = this.path[this.pathI + 1]
      if (n && this.nav.clearLine(this.pos.x, this.pos.z, n.x, n.z)) {
        this.pathI += 1
        continue
      }
      return new THREE.Vector3(dx / d, 0, dz / d)
    }
    if (this.path.length) this.path = []
    return null
  }

  private move(dt: number): void {
    const nav = this.nav
    let nx = this.pos.x + this.vel.x * dt
    let nz = this.pos.z + this.vel.z * dt
    const ok = (x: number, z: number) => nav.walkable(x, z) && Math.abs(nav.heightAt(x, z) - this.pos.y) < 0.8 * Math.max(1, this.scale * 0.6)
    if (!ok(nx, nz)) {
      if (ok(nx, this.pos.z)) {
        nz = this.pos.z
        this.vel.z = 0
      } else if (ok(this.pos.x, nz)) {
        nx = this.pos.x
        this.vel.x = 0
      } else {
        nx = this.pos.x
        nz = this.pos.z
        this.vel.x = 0
        this.vel.z = 0
        this.path = []
      }
    }
    const g = this.world.groundAt(nx, nz, this.pos.y + 1.1)
    const y = Math.abs(g - this.pos.y) < 0.9 ? g : nav.heightAt(nx, nz)
    this.pos.set(nx, this.pos.y + (y - this.pos.y) * Math.min(1, dt * 20), nz)
    this.body.setNextKinematicTranslation({ x: nx, y: this.pos.y + 0.93 * this.scale, z: nz })
  }

  private shoot(dt: number, tgt: Target, dist: number, ctx: BrainContext): void {
    const w = this.k.weapon
    if (w === 'cannon') return this.cannon(tgt, dist)
    if (w === 'minigun') {
      // Spin up, spray for a while, then cool down.
      this.spin = Math.min(1, this.spin + dt * 1.6)
      if (this.spin < 1) {
        if (this.fireT <= 0 && this.spin > 0.1 && this.spin < 0.2) this.world.audio.play('minigun', { volume: 0.25, pos: this.pos, rate: 0.6, ref: 8 })
        return
      }
      if (this.sprayT <= 0 && this.fireT <= 0) {
        this.sprayT = rand(2.0, 2.8)
        this.world.audio.play('minigun', { volume: 1.1, pos: this.pos, ref: 9, jitter: 0.04 })
      }
      if (this.sprayT > 0) {
        this.sprayT -= dt
        if (this.sprayT <= 0) {
          this.fireT = rand(1.4, 2.0)
          this.spin = 0.4
          return
        }
      } else return
      if (this.reloadT > 0) return
      // Fire at the minigun cadence within the fixed step.
      this.burstLeft -= dt
      while (this.burstLeft <= 0) {
        this.burstLeft += CONFIG.bots.fireInterval * this.k.interval
        this.hitscan(tgt, ctx, 'minigun', true)
      }
      return
    }
    // DM rockets at mid range when carried.
    if (this.rockets > 0 && dist > 7 && dist < 45 && this.rocketT <= 0) {
      this.rocketT = rand(1.6, 2.4)
      this.rockets -= 1
      const travel = dist / 44
      const aim = tmpB.copy(tgt.pos).addScaledVector(tgt.vel, travel * 0.7).setY(tgt.pos.y + 0.5)
      this.parts.muzzle.getWorldPosition(this.muzzleWorld)
      const dir = aim.sub(this.muzzleWorld).normalize()
      this.world.fireRocket(this.id, this.muzzleWorld.clone().addScaledVector(dir, 0.4), dir.clone(), this.collider.handle)
      this.world.audio.play('rocket_launch', { volume: 0.9, pos: this.muzzleWorld })
      this.anim.fire()
      return
    }
    if (this.reloadT > 0 || this.fireT > 0) return
    if (this.mag <= 0) {
      this.reloadT = 1.8
      return
    }
    if (this.burstLeft <= 0) this.burstLeft = Math.max(1, Math.round((CONFIG.bots.burst + rand(-1, 2)) * this.k.burst))
    this.burstLeft -= 1
    this.mag -= 1
    this.fireT = CONFIG.bots.fireInterval * this.k.interval * rand(0.9, 1.15)
    if (this.burstLeft <= 0) this.fireT += CONFIG.bots.burstPause * rand(0.7, 1.4) * (this.wave ? 1.3 : 1)
    this.hitscan(tgt, ctx, this.k.pellets > 1 ? 'scatter' : 'pulse', false)
  }

  /** One trigger pull of a hitscan weapon (rifle, scatter or a single minigun round). */
  private hitscan(tgt: Target, ctx: BrainContext, source: DamageSource, minigun: boolean): void {
    this.anim.fire()
    this.parts.muzzle.getWorldPosition(this.muzzleWorld)
    const muzzle = this.muzzleWorld
    const vis = new THREE.Color(this.visor)
    const col: [number, number, number, number] = [vis.r * 6, vis.g * 6, vis.b * 6, 1]
    this.world.fx.muzzle(muzzle.clone(), this.aimDir, col, minigun ? 1.1 : this.kind === 'warden' ? 1.4 : 0.8)
    if (!minigun || Math.random() < 0.35) this.world.fx.flash(muzzle.clone(), this.visor, minigun ? 9 : 7, 0.06, minigun ? 9 : 7)
    if (!minigun) this.world.audio.play('enemy_shot', { volume: this.kind === 'warden' ? 1.1 : 0.85, pos: muzzle, rate: this.kind === 'warden' ? 0.72 : 1, jitter: 0.06, ref: 5 })
    this.world.noise(muzzle, this.id, 30)
    const tgtSpeed = Math.hypot(tgt.vel.x, tgt.vel.z)
    const mySpeed = Math.hypot(this.vel.x, this.vel.z)
    const focusK = THREE.MathUtils.lerp(1.9, 1, Math.min(1, this.focus / 1.3))
    const err = CONFIG.bots.aimError * this.skill * this.k.spread * (1 + tgtSpeed * 0.07) * (1 + mySpeed * 0.04) * focusK
    const eye = this.eye.clone()
    const aimAt = tmpB.copy(tgt.pos).setY(tgt.pos.y + (Math.random() < 0.15 ? 1.6 : 1.2))
    const base = aimAt.sub(eye).normalize()
    for (let p = 0; p < this.k.pellets; p += 1) {
      const dir = jitter(base, err * (this.k.pellets > 1 ? 1 : Math.sqrt(Math.random()) * 1.4))
      const hit = this.world.raycast(eye, dir, 140, this.collider.handle)
      const end = hit ? hit.point : eye.clone().addScaledVector(dir, 140)
      if (p === 0 || p % 3 === 0) this.world.fx.tracer(muzzle, end, col, minigun ? 190 : 150, minigun ? 0.03 : 0.035)
      if (hit) {
        const tag = hit.tag
        const dmg = CONFIG.bots.damage * this.k.damage * (this.k.pellets > 1 ? Math.max(0.3, 1 - Math.max(0, hit.distance - 5) / 14) : 1)
        if (tag?.kind === 'player') this.world.damage(0, { attacker: this.id, amount: dmg, source, from: eye.clone(), point: hit.point.clone() })
        else if (tag?.kind === 'bot') {
          if (!this.world.onslaught) {
            const head = hit.point.y - this.world.groundAt(hit.point.x, hit.point.z, hit.point.y) > HEAD_Y
            this.world.damage(tag.id, { attacker: this.id, amount: dmg * (head ? 1.5 : 1), source, from: eye.clone(), point: hit.point.clone(), headshot: head })
          }
          if (this.world.isHuman(tag.id)) this.world.fx.humanHit(hit.point, hit.normal, false)
          else this.world.fx.robotHit(hit.point, hit.normal, false)
        } else if (tag?.kind === 'prop') this.world.damageProp(tag.index, { attacker: this.id, amount: dmg, source: 'pulse', from: eye.clone(), point: hit.point.clone() })
        else if (tag?.kind !== 'drone' && (p % 2 === 0 || minigun)) this.world.fx.impact(hit.point, hit.normal, tag?.kind === 'world' ? tag.surface : 'concrete')
      }
      // Near miss on the player: supersonic crack.
      if (tgt.isPlayer && this.flybyT <= 0 && (!hit || hit.tag?.kind !== 'player')) {
        const toEye = tmpC.copy(ctx.playerEye).sub(eye)
        const along = toEye.dot(dir)
        const len = hit ? hit.distance : 140
        if (along > 2 && along < len + 1) {
          const closest = eye.clone().addScaledVector(dir, along)
          if (closest.distanceTo(ctx.playerEye) < 1.6) {
            this.world.audio.play('bullet_flyby', { volume: 0.7, pos: closest, jitter: 0.1, ref: 2 })
            this.flybyT = minigun ? 0.12 : 0.25
          }
        }
      }
    }
  }

  /** Boss cannon: volleys of slow, dodgeable, explosive shells that lead the target. */
  private cannon(tgt: Target, dist: number): void {
    if (this.fireT > 0 || this.phaseLock > 0) return
    if (this.volleyLeft <= 0) this.volleyLeft = this.phase >= 3 ? 5 : this.phase >= 2 ? 4 : 3
    this.volleyLeft -= 1
    this.fireT = this.volleyLeft > 0 ? (this.phase >= 3 ? 0.26 : 0.34) : this.phase >= 3 ? 2.2 : 3.2
    this.anim.fire()
    this.parts.muzzle.getWorldPosition(this.muzzleWorld)
    const m = this.muzzleWorld
    const travel = dist / 34
    const aim = tmpB.copy(tgt.pos).addScaledVector(tgt.vel, travel * (0.4 + Math.random() * 0.5)).setY(tgt.pos.y + 0.6)
    aim.x += rand(-1.2, 1.2)
    aim.z += rand(-1.2, 1.2)
    const dir = aim.sub(m).normalize()
    this.world.fireProjectile(this.id, m.clone().addScaledVector(dir, 0.6), dir.clone(), 'cannon')
    this.world.fx.muzzle(m.clone(), dir, [6, 2.6, 0.8, 1], 2.6)
    this.world.fx.flash(m.clone(), '#ff8a3a', 16, 0.1, 14)
    this.world.audio.play('boss_cannon', { volume: 1.1, pos: m, jitter: 0.05, ref: 10 })
    this.world.noise(m, this.id, 40)
  }

  render(alpha: number): void {
    const root = this.parts.root
    if (this.dyingT >= 0) {
      const now = performance.now()
      const dt = Math.min(0.05, (now - this.lastRender) / 1000)
      this.lastRender = now
      this.dyingT += dt
      this.anim.update(dt, 0, 0, 0, 0, 0, this.world.time)
      if (this.dyingT > (this.kind === 'titan' ? 6 : 4.2)) {
        this.dyingT = -1
        root.visible = false
        this.anim.reset()
      }
      return
    }
    if (!this.alive) return
    root.position.lerpVectors(this.prevPos, this.pos, alpha)
    let dy = this.yaw - this.prevYaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    root.rotation.y = this.prevYaw + dy * alpha
  }
}

function jitter(dir: THREE.Vector3, cone: number): THREE.Vector3 {
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.random()) * cone
  const t1 = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const right = t1.cross(dir).normalize()
  const upv = new THREE.Vector3().crossVectors(dir, right)
  return dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(upv, Math.sin(a) * r).normalize()
}

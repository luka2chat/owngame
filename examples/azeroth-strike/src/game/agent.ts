import * as THREE from 'three'
import { BattlePowers, type PowerKind } from './rules/hyjal-powers'
import { GROUP_AGENT, GROUP_WORLD, groups, type Physics, RAPIER } from '../engine/physics'
import type { Avatar, Locomotion } from './characters'
import { MOUNT_BACK, MOUNT_CAST, MOUNT_RUN } from './mount'
import type { Team } from './teams'
import { LOADOUT, WEAPONS, type WeaponDef, type WeaponId } from './weapons'

/** Movement and body constants in yards (WoW units). */
export const BODY = {
  radius: 0.38,
  halfHeight: 0.55,
  eye: 1.68,
  head: 1.5,
  runSpeed: 7,
  backSpeed: 4.5,
  jumpSpeed: 7.6,
  gravity: 19.3,
} as const

/** Player health the settings slider can pick. Bots stay at 100. */
export const PLAYER_HP = { default: 1000, min: 100, max: 2000, step: 50 } as const

/** Battleground speed rune: run (and ride) this much faster for `seconds`. */
export const HASTE = { multiplier: 1.5, seconds: 10 } as const

export function clampPlayerHp(n: number): number {
  if (!Number.isFinite(n)) return PLAYER_HP.default
  const stepped = Math.round(n / PLAYER_HP.step) * PLAYER_HP.step
  return Math.min(PLAYER_HP.max, Math.max(PLAYER_HP.min, stepped))
}

export type Stats = { kills: number; deaths: number; damage: number; caps: number; returns: number; assaults: number; defends: number }
type Ammo = { ammo: number; reserve: number }

let nextId = 1

export class Agent {
  readonly id = nextId++
  bodyHeight: number | null = null
  hp = 100
  maxHp = 100
  alive = true
  readonly pos = new THREE.Vector3()
  readonly prevPos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  /** Heading: forward = (sin yaw, 0, cos yaw). */
  yaw = 0
  pitch = 0
  grounded = false
  readonly loadout: WeaponId[] = [...LOADOUT]
  weaponId: WeaponId = LOADOUT[0]
  /** Weapon we are switching away from while `switchTimer` runs (holster, then draw). */
  switchFrom: WeaponId | null = null
  switchTimer = 0
  lastWeapon: WeaponId = LOADOUT[1]
  private readonly ammoOf = new Map<WeaponId, Ammo>()
  reloadTimer = 0
  /** Total duration of the reload in progress. */
  reloadTotal = 0
  cooldown = 0
  bloom = 0
  /** Semi-automatic and bolt-action weapons need the trigger released between shots. */
  triggerReady = true
  /** Looking down the sights (player zoom, bots settling a scoped shot). */
  aiming = false
  /** Seconds of speed rune left. */
  haste = 0
  readonly powers = new BattlePowers()
  readonly stats: Stats = { kills: 0, deaths: 0, damage: 0, caps: 0, returns: 0, assaults: 0, defends: 0 }
  lastAttacker: Agent | null = null
  lastHurt = -999
  deathTime = 0
  readonly collider: RAPIER.Collider
  private readonly controller: RAPIER.KinematicCharacterController
  /** World-space horizontal velocity of the last step, for animation. */
  readonly moveVel = new THREE.Vector3()
  mounted = false
  /** Seconds left of the summon. 0 when not casting. */
  mountCast = 0

  constructor(
    readonly team: Team,
    /** Resolved at draw time so names follow the UI language. */
    private readonly nameOf: () => string,
    readonly isPlayer: boolean,
    private readonly physics: Physics,
    readonly avatar: Avatar | null,
    maxHp = 100,
  ) {
    this.maxHp = maxHp
    this.hp = maxHp
    for (const id of this.loadout) this.ammoOf.set(id, { ammo: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve })
    const world = physics.world
    // A parentless collider: its position changes immediately, which the character controller needs.
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(BODY.halfHeight, BODY.radius).setCollisionGroups(groups(GROUP_AGENT, 0xffff)))
    this.controller = world.createCharacterController(0.03)
    this.controller.enableAutostep(0.55, 0.25, true)
    this.controller.enableSnapToGround(0.6)
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180)
    this.controller.setMinSlopeSlideAngle((60 * Math.PI) / 180)
    this.controller.setApplyImpulsesToDynamicBodies(false)
    avatar?.setWeapon(this.weaponId, false)
  }

  get name(): string {
    return this.nameOf()
  }

  get weapon(): WeaponDef {
    return WEAPONS[this.weaponId]
  }

  get ammo(): number {
    return this.ammoOf.get(this.weaponId)!.ammo
  }
  set ammo(v: number) {
    this.ammoOf.get(this.weaponId)!.ammo = v
  }
  get reserve(): number {
    return this.ammoOf.get(this.weaponId)!.reserve
  }
  set reserve(v: number) {
    this.ammoOf.get(this.weaponId)!.reserve = v
  }
  ammoFor(id: WeaponId): Readonly<Ammo> {
    return this.ammoOf.get(id)!
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
  }

  get eyeHeight(): number {
    return this.bodyHeight ? this.bodyHeight * .85 : this.avatar?.eyeHeight ?? BODY.eye
  }

  get headHeight(): number {
    return this.bodyHeight ? this.bodyHeight * .8 : this.avatar?.headHeight ?? BODY.head
  }

  eye(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z)
  }

  aimDir(out = new THREE.Vector3()): THREE.Vector3 {
    const c = Math.cos(this.pitch)
    return out.set(Math.sin(this.yaw) * c, Math.sin(this.pitch), Math.cos(this.yaw) * c)
  }

  teleport(p: { x: number; y: number; z: number }): void {
    this.pos.set(p.x, p.y + 0.05, p.z)
    this.prevPos.copy(this.pos)
    this.vel.set(0, 0, 0)
    this.syncBody()
  }

  private syncBody(): void {
    // Bottom of the capsule stays on the ground. Mounted, it grows tall enough to cover the rider.
    const half = this.collider.halfHeight()
    this.collider.setTranslation({ x: this.pos.x, y: this.pos.y + half + this.collider.radius(), z: this.pos.z })
  }

  private setMountShape(mounted: boolean): void {
    this.collider.setHalfHeight(mounted ? 1.25 : BODY.halfHeight)
    this.syncBody()
  }

  /** Top speed with the current weapon out. A mount replaces that with the epic riding speed. */
  speed(back = false): number {
    const haste = Math.max(this.haste > 0 ? HASTE.multiplier : 1, this.powers.speed)
    if (this.mounted) return (back ? MOUNT_BACK : MOUNT_RUN) * haste
    return (back ? BODY.backSpeed : BODY.runSpeed) * this.weapon.speed * haste
  }

  /** Start the 1.5s summon. Movement, damage and firing cancel it. */
  beginMount(): void {
    if (this.mounted || this.mountCast > 0 || !this.alive || !this.grounded) return
    this.mountCast = MOUNT_CAST
  }

  /** Advance the summon. `moving` cancels it; standing still mounts when the cast ends. */
  tickMount(dt: number, moving: boolean): void {
    if (this.mountCast <= 0) return
    if (moving || !this.grounded || !this.alive) {
      this.mountCast = 0
      return
    }
    this.mountCast -= dt
    if (this.mountCast > 0) return
    this.mountCast = 0
    this.mounted = true
    this.avatar?.setMounted(true)
    this.setMountShape(true)
  }

  dismount(): void {
    this.mountCast = 0
    if (!this.mounted) return
    this.mounted = false
    this.avatar?.setMounted(false)
    this.setMountShape(false)
  }

  /** Move with collision. `wish` is the desired horizontal velocity in yards/s. */
  move(wish: THREE.Vector3, jump: boolean, dt: number): void {
    this.prevPos.copy(this.pos)
    if (!this.alive) return
    if (this.grounded && jump) {
      this.vel.y = BODY.jumpSpeed
      this.grounded = false
    }
    this.vel.y -= BODY.gravity * dt
    const desired = { x: wish.x * dt, y: this.vel.y * dt, z: wish.z * dt }
    this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groups(GROUP_AGENT, GROUP_WORLD))
    const m = this.controller.computedMovement()
    this.grounded = this.controller.computedGrounded()
    if (this.grounded && this.vel.y < 0) this.vel.y = -1
    // Hitting a ceiling stops the jump.
    if (this.vel.y > 0 && m.y < desired.y * 0.5) this.vel.y = 0
    this.pos.x += m.x
    this.pos.y += m.y
    this.pos.z += m.z
    this.moveVel.set(m.x / dt, 0, m.z / dt)
    this.syncBody()
  }

  setAlive(alive: boolean): void {
    this.alive = alive
    if (!alive) this.dismount()
    this.collider.setEnabled(alive)
    if (!alive) {
      this.vel.set(0, 0, 0)
      this.moveVel.set(0, 0, 0)
      this.haste = 0
      this.powers.clear()
      this.aiming = false
      this.reloadTimer = 0
      this.switchTimer = 0
      this.switchFrom = null
    }
  }

  /** Change the life cap. A full bar follows the new cap; a wounded bar only shrinks to fit. */
  setMaxHp(next: number): void {
    const full = this.hp >= this.maxHp
    this.maxHp = next
    this.hp = full ? next : Math.min(this.hp, next)
  }

  respawnLoadout(): void {
    this.hp = this.maxHp
    for (const id of this.loadout) this.ammoOf.set(id, { ammo: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve })
    this.reloadTimer = 0
    this.cooldown = 0.3
    this.bloom = 0
    this.switchTimer = 0
    this.switchFrom = null
    this.weaponId = this.loadout[0]
    this.lastWeapon = this.loadout[1]
    this.avatar?.setWeapon(this.weaponId, false)
  }

  /** Put the current weapon away and draw `id`. Cancels reloads, like CS. */
  switchTo(id: WeaponId): boolean {
    if (!this.alive || id === this.weaponId || !this.loadout.includes(id)) return false
    // Whatever is in the hands right now gets put away: the old gun mid-holster, else the one being drawn.
    const from = this.switchTimer > 0 && this.switchFrom && this.switchPhase().holster < 1 ? this.switchFrom : this.weaponId
    this.lastWeapon = this.weaponId
    this.switchFrom = from === id ? null : from
    this.weaponId = id
    this.reloadTimer = 0
    this.bloom = 0
    this.switchTimer = (this.switchFrom ? WEAPONS[this.switchFrom].holster : 0) + WEAPONS[id].draw
    this.avatar?.setWeapon(id, true)
    return true
  }

  cycleWeapon(step: number): void {
    const i = this.loadout.indexOf(this.weaponId)
    this.switchTo(this.loadout[(i + step + this.loadout.length) % this.loadout.length])
  }

  /** 0..1 progress of the holster phase (1 when done or no holster) and of the draw phase. */
  switchPhase(): { holster: number; draw: number } {
    if (this.switchTimer <= 0) return { holster: 1, draw: 1 }
    const draw = this.weapon.draw
    const holster = this.switchFrom ? WEAPONS[this.switchFrom].holster : 0
    const elapsed = holster + draw - this.switchTimer
    if (elapsed < holster) return { holster: elapsed / holster, draw: 0 }
    return { holster: 1, draw: Math.min(1, (elapsed - holster) / draw) }
  }

  /** Spread cone half-angle (radians) for the next shot. */
  spread(): number {
    const w = this.weapon
    const speed = Math.hypot(this.moveVel.x, this.moveVel.z)
    let s = (this.aiming && w.spreadAds !== undefined ? w.spreadAds : w.spreadBase) + this.bloom
    if (!this.grounded) s += w.spreadAir
    else s += w.spreadMove * Math.min(1, speed / BODY.runSpeed)
    return s
  }

  grantPower(kind:PowerKind):void {
    if(!this.alive)return
    this.powers.grant(kind)
    if(kind==='ammo')this.reloadTimer=0
  }
  consumeRound():void { if(!this.powers.infiniteAmmo)this.ammo-- }

  /** Collision-aware flight without gravity; keeps interpolation and hitbox in step. */
  fly(wish:THREE.Vector3,dt:number):void {
    this.prevPos.copy(this.pos)
    if(!this.alive)return
    this.controller.computeColliderMovement(this.collider,{x:wish.x*dt,y:wish.y*dt,z:wish.z*dt},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,groups(GROUP_AGENT,GROUP_WORLD))
    const m=this.controller.computedMovement()
    this.pos.add(new THREE.Vector3(m.x,m.y,m.z));this.moveVel.set(m.x/dt,m.y/dt,m.z/dt)
    this.grounded=false;this.syncBody()
  }

  updateWeapon(dt: number): void {
    this.powers.update(dt)
    const w = this.weapon
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.bloom = Math.max(0, this.bloom - w.bloomRecover * dt)
    if (this.switchTimer > 0) {
      this.switchTimer -= dt
      if (this.switchTimer <= 0) {
        this.switchTimer = 0
        this.switchFrom = null
      }
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0
        const want = w.magazine - this.ammo
        // Bots have bottomless reserves; only the player counts rounds.
        const take = this.isPlayer ? Math.min(want, this.reserve) : want
        this.ammo += take
        if (this.isPlayer) this.reserve -= take
      }
    }
  }

  get reloading(): boolean {
    return this.reloadTimer > 0
  }

  startReload(): void {
    const w = this.weapon
    if (w.mode === 'melee' || this.switchTimer > 0 || this.powers.infiniteAmmo) return
    if (this.reloadTimer > 0 || this.ammo >= w.magazine || (this.isPlayer && this.reserve <= 0)) return
    this.reloadTimer = this.reloadTotal = w.reload
    this.avatar?.reload()
  }

  canFire(): boolean {
    if (!this.alive || this.cooldown > 0 || this.switchTimer > 0) return false
    if (this.weapon.mode === 'melee') return true
    return (this.ammo > 0 || this.powers.infiniteAmmo) && this.reloadTimer <= 0
  }

  /** Give back rounds for a kill (looting the corpse), up to twice the starting reserve. */
  refill(): void {
    for (const id of this.loadout) {
      const w = WEAPONS[id]
      const a = this.ammoOf.get(id)!
      if (w.mode !== 'melee') a.reserve = Math.min(w.reserve * 2, a.reserve + w.magazine)
    }
  }

  /** Animation state from the last movement relative to facing. */
  locomotion(): Locomotion {
    if (!this.alive) return 'dead'
    if (!this.grounded && Math.abs(this.vel.y) > 2) return 'jump'
    const speed = Math.hypot(this.moveVel.x, this.moveVel.z)
    if (speed < 0.6) return 'stand'
    const f = (this.moveVel.x * Math.sin(this.yaw) + this.moveVel.z * Math.cos(this.yaw)) / speed
    const r = (this.moveVel.x * -Math.cos(this.yaw) + this.moveVel.z * Math.sin(this.yaw)) / speed
    if (f > 0.5) return 'run'
    if (f < -0.5) return 'back'
    return r > 0 ? 'right' : 'left'
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller)
    this.physics.world.removeCollider(this.collider, false)
  }
}

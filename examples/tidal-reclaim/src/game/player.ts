import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'
import { applyDamage } from './rules'

/** `slide`: C/Ctrl pressed this step (slides when moving fast); `crouch`: C/Ctrl held (crouch while held). */
export type MoveIntent = { x: number; y: number; jump: boolean; sprint: boolean; ads: boolean; slide?: boolean; crouch?: boolean }

const SLIDE_TIME = 0.72
const SLIDE_COOLDOWN = 0.35
/** How far the eye drops at full slide/crouch depth (metres): eye 1.62 → 1.04 m. */
const SLIDE_EYE_DROP = 0.58

/**
 * First-person body: Rapier kinematic character controller with ground acceleration, air
 * control, coyote time + jump buffering, rocket-jump knockback, a momentum slide (C while
 * moving fast), hold-C crouch with a shorter capsule for real cover, and landing events.
 */
export class Player {
  readonly collider: RAPIER.Collider
  readonly body: RAPIER.RigidBody
  private readonly controller: RAPIER.KinematicCharacterController
  readonly position = new THREE.Vector3()
  readonly prevPosition = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  yaw = 0
  pitch = 0
  grounded = true
  sprinting = false
  maxHealth: number = CONFIG.player.maxHealth
  maxArmor: number = CONFIG.player.maxArmor
  health: number = CONFIG.player.maxHealth
  /** Seconds of slide remaining (0 = not sliding). */
  sliding = 0
  private slideCd = 0
  private slideDir = new THREE.Vector3()
  /** Smoothed 0..1 slide/crouch depth for the camera. */
  crouch = 0
  /** True while the capsule is in its short (crouched/sliding) shape. */
  crouching = false
  private halfH: number = CONFIG.player.halfHeight
  private readonly world: RAPIER.World
  armor = 0
  /** Seconds since the last damage that got through spawn protection. */
  sinceHit = 99
  /** True while armor is actively recharging (HUD shimmer + audio). */
  regenerating = false
  alive = true
  protect = 0
  deadTime = 0
  /** Last landing impact speed (for camera dip), consumed by the view. */
  landImpact = 0
  airTime = 0
  private coyote = 0
  private jumpBuffer = 0
  private readonly tmp = new THREE.Vector3()

  constructor(physics: Physics) {
    const P = CONFIG.player
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0))
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.capsule(P.halfHeight, P.radius), this.body)
    this.world = physics.world
    this.controller = physics.world.createCharacterController(0.02)
    this.controller.setUp({ x: 0, y: 1, z: 0 })
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    this.controller.setMinSlopeSlideAngle((60 * Math.PI) / 180)
    this.controller.enableAutostep(0.42, 0.25, true)
    this.controller.enableSnapToGround(0.35)
    this.controller.setApplyImpulsesToDynamicBodies(false)
  }

  /** Feet height offset from the capsule centre. */
  private get centerOffset(): number {
    return this.halfH + CONFIG.player.radius
  }

  /** Switch capsule height keeping the feet planted. Standing up fails if there is no headroom. */
  private setLow(low: boolean): boolean {
    const P = CONFIG.player
    const h = low ? P.crouchHalfHeight : P.halfHeight
    if (h === this.halfH) return true
    const t = this.body.translation()
    const feetY = t.y - this.centerOffset
    if (!low) {
      const probe = new RAPIER.Capsule(P.halfHeight, P.radius - 0.03)
      const hit = this.world.intersectionWithShape(
        { x: t.x, y: feetY + P.halfHeight + P.radius + 0.06, z: t.z }, { x: 0, y: 0, z: 0, w: 1 }, probe,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider,
      )
      if (hit) return false
    }
    this.halfH = h
    this.collider.setHalfHeight(h)
    const c = { x: t.x, y: feetY + this.centerOffset, z: t.z }
    this.body.setTranslation(c, true)
    this.body.setNextKinematicTranslation(c)
    this.crouching = low
    return true
  }

  spawn(at: THREE.Vector3, yaw: number): void {
    const P = CONFIG.player
    this.position.copy(at)
    this.prevPosition.copy(at)
    this.velocity.set(0, 0, 0)
    this.yaw = yaw
    this.pitch = 0
    this.health = this.maxHealth
    this.sliding = 0
    this.crouch = 0
    this.halfH = P.halfHeight
    this.collider.setHalfHeight(P.halfHeight)
    this.crouching = false
    this.armor = this.maxArmor
    this.sinceHit = 99
    this.regenerating = false
    this.alive = true
    this.protect = P.spawnProtection
    this.grounded = true
    this.landImpact = 0
    this.body.setNextKinematicTranslation({ x: at.x, y: at.y + this.centerOffset + 0.02, z: at.z })
    this.body.setTranslation({ x: at.x, y: at.y + this.centerOffset + 0.02, z: at.z }, true)
  }

  eye(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prevPosition, this.position, alpha).setY(out.y + CONFIG.player.eyeHeight - this.crouch * SLIDE_EYE_DROP)
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch)
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp)
  }

  get speed2d(): number {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }

  impulse(v: THREE.Vector3): void {
    this.velocity.add(v)
    if (v.y > 1) this.grounded = false
  }

  damage(amount: number): { health: number; armor: number; dealt: number } {
    if (!this.alive || this.protect > 0) return { health: this.health, armor: this.armor, dealt: 0 }
    const before = this.health + this.armor
    const r = applyDamage(this.health, this.armor, amount)
    this.health = r.health
    this.armor = r.armor
    if (before - (r.health + r.armor) > 0) { this.sinceHit = 0; this.regenerating = false }
    return { ...r, dealt: before - (r.health + r.armor) }
  }

  step(dt: number, intent: MoveIntent): { jumped: boolean; landed: number; slid: boolean } {
    const P = CONFIG.player
    this.prevPosition.copy(this.position)
    this.protect = Math.max(0, this.protect - dt)
    this.sinceHit += dt
    if (this.alive && this.sinceHit >= P.armorRegenDelay && this.armor < this.maxArmor) {
      this.armor = Math.min(this.maxArmor, this.armor + P.armorRegenRate * dt)
      this.regenerating = this.armor < this.maxArmor
    } else this.regenerating = false
    if (this.armor > this.maxArmor) this.armor = this.maxArmor
    let jumped = false
    let landed = 0
    let slid = false
    this.slideCd = Math.max(0, this.slideCd - dt)
    this.crouch += ((this.crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * (this.crouching ? 14 : 9))
    if (!this.alive) {
      this.deadTime += dt
      this.sliding = 0
      return { jumped, landed, slid }
    }
    // Slide: crouch while moving fast on the ground -> burst of speed that bleeds off.
    if (intent.slide && this.grounded && this.sliding <= 0 && this.slideCd <= 0 && this.speed2d > P.walkSpeed * 0.75) {
      const sp = Math.max(this.speed2d, P.sprintSpeed) * 1.38
      this.slideDir.set(this.velocity.x, 0, this.velocity.z).normalize()
      this.velocity.x = this.slideDir.x * sp
      this.velocity.z = this.slideDir.z * sp
      this.sliding = SLIDE_TIME
      slid = true
    }
    // Crouch: short capsule while sliding or while C is held; stand up only with headroom.
    const wantLow = this.sliding > 0 || !!intent.crouch
    if (wantLow !== this.crouching) this.setLow(wantLow)
    // Wish direction relative to yaw.
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const wx = intent.x * cos - intent.y * sin
    const wz = -intent.x * sin - intent.y * cos
    const moving = Math.abs(intent.x) + Math.abs(intent.y) > 0.01
    if (this.sliding > 0) {
      this.sliding = Math.max(0, this.sliding - dt)
      if (this.sliding === 0 || !this.grounded) {
        if (this.sliding === 0) this.slideCd = SLIDE_COOLDOWN
      }
    }
    this.sprinting = intent.sprint && intent.y > 0.3 && !intent.ads && this.grounded && !this.crouching
    const speed = this.crouching && this.sliding <= 0 ? Math.min(P.crouchSpeed, intent.ads ? P.adsSpeed : P.crouchSpeed) : intent.ads ? P.adsSpeed : this.sprinting ? P.sprintSpeed : P.walkSpeed
    const tx = wx * speed
    const tz = wz * speed
    const slideK = this.sliding > 0 ? 0.06 + 0.2 * (1 - this.sliding / SLIDE_TIME) : 1
    const accel = (this.grounded ? P.acceleration : P.acceleration * P.airControl) * slideK
    const fric = this.grounded ? (moving ? 1 : 1.6) : 0.05
    const dx = tx - this.velocity.x
    const dz = tz - this.velocity.z
    const dl = Math.hypot(dx, dz)
    const maxDv = accel * dt * (moving ? 1 : fric)
    if (dl > 0) {
      const k = Math.min(1, maxDv / dl)
      if (this.grounded || moving) {
        this.velocity.x += dx * k
        this.velocity.z += dz * k
      }
    }
    // Jump with coyote time and buffer.
    this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt)
    this.jumpBuffer = intent.jump ? P.jumpBuffer : Math.max(0, this.jumpBuffer - dt)
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      // Slide-jump keeps the momentum (a classic movement-shooter tech).
      if (this.sliding > 0) {
        this.sliding = 0
        this.slideCd = SLIDE_COOLDOWN
      }
      this.velocity.y = P.jumpSpeed
      this.jumpBuffer = 0
      this.coyote = 0
      this.grounded = false
      jumped = true
    }
    this.velocity.y = Math.max(P.maxFall, this.velocity.y + P.gravity * dt)
    const desired = this.tmp.copy(this.velocity).multiplyScalar(dt)
    this.controller.computeColliderMovement(this.collider, { x: desired.x, y: desired.y, z: desired.z }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
    const m = this.controller.computedMovement()
    const wasGrounded = this.grounded
    this.grounded = this.controller.computedGrounded()
    const t = this.body.translation()
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z }
    this.body.setNextKinematicTranslation(next)
    // Collisions clip velocity (walls stop you, ceilings end jumps).
    if (dt > 0) {
      const ax = m.x / dt
      const az = m.z / dt
      if (Math.abs(ax) < Math.abs(this.velocity.x) - 0.01) this.velocity.x = ax
      if (Math.abs(az) < Math.abs(this.velocity.z) - 0.01) this.velocity.z = az
      if (this.velocity.y > 0 && m.y < desired.y * 0.5) this.velocity.y = 0
    }
    if (this.grounded) {
      if (!wasGrounded && this.velocity.y < -2) landed = -this.velocity.y
      if (this.velocity.y < 0) this.velocity.y = 0
      this.airTime = 0
    } else this.airTime += dt
    if (landed) this.landImpact = Math.max(this.landImpact, landed)
    this.position.set(next.x, next.y - this.centerOffset, next.z)
    // Fell out of the world somehow: put back on the floor.
    if (this.position.y < -10) {
      this.position.set(0, 2, 0)
      this.body.setNextKinematicTranslation({ x: 0, y: 2 + this.centerOffset, z: 0 })
    }
    return { jumped, landed, slid }
  }
}

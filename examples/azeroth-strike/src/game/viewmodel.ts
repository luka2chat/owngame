import * as THREE from 'three'
import { VIEW_LAYER } from '../engine/renderer'
import type { Agent } from './agent'
import { flashTexture } from './fx'
import { WEAPONS, type WeaponDef, type WeaponId } from './weapons'

type Slot = { holder: THREE.Group; model: THREE.Object3D; flash: THREE.Sprite; glow: THREE.Sprite | null }

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
/** 0 → 1 → 0 over [a, b] with smooth edges. */
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI))

/** Damped spring toward zero, integrated per frame. */
class Spring {
  readonly x = new THREE.Vector3()
  readonly v = new THREE.Vector3()
  constructor(
    private readonly k: number,
    private readonly damp: number,
  ) {}
  step(dt: number): void {
    // Sub-step so low frame rates stay stable with stiff springs.
    const n = Math.ceil(dt / (1 / 120))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      this.v.addScaledVector(this.x, -this.k * h)
      this.v.multiplyScalar(Math.exp(-this.damp * h))
      this.x.addScaledVector(this.v, h)
    }
  }
}

export type ViewFrame = {
  agent: Agent
  /** Mouse look this frame (radians), drives sway. */
  look: { x: number; y: number }
  ads: boolean
  time: number
}

/**
 * First-person weapon models attached to the camera. All motion is procedural and layered:
 * ADS blend, look sway, figure-8 walk bob, strafe roll, jump/land, breathing, recoil springs, and
 * per-weapon actions (mag swap, bolt cycle, wand recharge, knife slash/stab, holster/draw).
 */
export class ViewModel {
  readonly root = new THREE.Group()
  private slots = new Map<WeaponId, Slot>()
  /** Look sway (x: yaw, y: pitch) lagging behind the camera. */
  private sway = new Spring(120, 14)
  /** Recoil: x side, y up (rotation), z back (translation). */
  private recoil = new Spring(160, 16)
  /** Vertical offset from jumps and landings. */
  private vertical = new Spring(90, 10)
  adsT = 0
  private bobPhase = 0
  private bobAmount = 0
  private roll = 0
  private wasGrounded = true
  private flashLife = 0
  private actionT = 1
  private action: 'none' | 'bolt' | 'slash' | 'stab' | 'cast' = 'none'
  private actionLen = 1
  private slashSide = 1
  private lastReload = 0
  private drawSounded = false
  onSound: ((kind: 'draw' | 'slap' | 'rack' | 'bolt') => void) | null = null

  constructor(models: Map<WeaponId, THREE.Group>) {
    for (const [id, src] of models) {
      const w = WEAPONS[id]
      const holder = new THREE.Group()
      const model = src.clone()
      model.rotation.y = Math.PI / 2
      model.scale.setScalar(w.view.scale)
      model.traverse(o => (o.castShadow = false))
      holder.add(model)
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: w.tracer || 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      flash.position.set(...w.muzzle)
      flash.position.x += 0.04
      flash.scale.setScalar(w.mode === 'bolt' ? 0.38 : 0.24)
      flash.visible = false
      model.add(flash)
      let glow: THREE.Sprite | null = null
      if (id === 'wand') {
        glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }))
        glow.position.set(...w.muzzle)
        glow.scale.setScalar(0.07)
        model.add(glow)
      }
      holder.visible = false
      this.root.add(holder)
      this.slots.set(id, { holder, model, flash, glow })
    }
    this.root.traverse(o => o.layers.set(VIEW_LAYER))
  }

  /** Called on every shot or swing by the player. */
  fire(w: WeaponDef, heavy: boolean): void {
    if (w.mode === 'melee') {
      this.action = heavy ? 'stab' : 'slash'
      this.actionLen = heavy ? 0.55 : 0.32
      this.actionT = 0
      this.slashSide = -this.slashSide
      this.recoil.v.x += this.slashSide * 0.4
      return
    }
    this.flashLife = 0.045
    const slot = this.slots.get(w.id)!
    slot.flash.material.rotation = Math.random() * Math.PI * 2
    const ads = 1 - this.adsT * 0.55
    this.recoil.v.z += w.view.recoilBack * 22 * ads
    this.recoil.v.y += w.view.recoilUp * 22 * ads
    this.recoil.v.x += (Math.random() - 0.5) * w.view.recoilUp * 10 * ads
    if (w.mode === 'bolt') {
      this.action = 'bolt'
      this.actionLen = w.interval
      this.actionT = 0
    } else if (w.id === 'wand') {
      this.action = 'cast'
      this.actionLen = 0.2
      this.actionT = 0
    }
  }

  update(dt: number, f: ViewFrame): void {
    const a = f.agent
    const w = a.weapon
    const phase = a.switchPhase()
    const showing = phase.holster < 1 && a.switchFrom ? a.switchFrom : a.weaponId
    for (const [id, s] of this.slots) s.holder.visible = id === showing
    const slot = this.slots.get(showing)!
    const sw = WEAPONS[showing]

    // ADS blend: no aiming while switching, reloading (mags) or with the knife.
    const canAds = f.ads && !!w.view.ads && a.switchTimer <= 0 && !a.reloading
    this.adsT += ((canAds ? 1 : 0) - this.adsT) * Math.min(1, dt * 14)
    const ads = smooth(clamp01(this.adsT))

    // Sway: the gun lags the look direction, less when aiming.
    this.sway.v.x += f.look.x * 9
    this.sway.v.y += f.look.y * 9
    this.sway.step(dt)
    this.sway.x.clampScalar(-0.12, 0.12)

    // Walk bob: figure-8 tied to ground speed.
    const speed = Math.hypot(a.moveVel.x, a.moveVel.z)
    const moving = a.grounded ? clamp01(speed / 7) : 0
    this.bobAmount += (moving - this.bobAmount) * Math.min(1, dt * 8)
    this.bobPhase += dt * (4 + speed * 1.15)
    const bobScale = this.bobAmount * (1 - ads * 0.85)
    const bobX = Math.sin(this.bobPhase) * 0.011 * bobScale
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobScale

    // Strafe roll from lateral velocity relative to facing.
    const lateral = (a.moveVel.x * -Math.cos(a.yaw) + a.moveVel.z * Math.sin(a.yaw)) / 7
    this.roll += (lateral * 0.06 * (1 - ads * 0.7) - this.roll) * Math.min(1, dt * 8)

    // Jumps lift the gun; landings dip it.
    if (a.grounded && !this.wasGrounded) this.vertical.v.y -= Math.min(1.2, Math.abs(a.vel.y) * 0.12 + 0.3)
    if (!a.grounded && this.wasGrounded && a.vel.y > 0) this.vertical.v.y += 0.35
    this.wasGrounded = a.grounded
    this.vertical.step(dt)
    this.recoil.step(dt)

    const breathe = Math.sin(f.time * 1.7) * 0.0025 * (1 - ads * 0.8)
    const base = new THREE.Vector3(...sw.view.hip)
    if (sw.view.ads && showing === a.weaponId) base.lerp(new THREE.Vector3(...sw.view.ads), ads)
    const pos = base.clone()
    const rot = new THREE.Euler(...sw.view.rot)
    pos.x += bobX - this.sway.x.x * 0.06 * (1 - ads * 0.8)
    pos.y += bobY + breathe + this.vertical.x.y * 0.05 + this.sway.x.y * 0.04 * (1 - ads * 0.8)
    pos.z += this.recoil.x.z * 0.6
    rot.x += this.recoil.x.y * 0.9 + this.vertical.x.y * 0.05 - this.sway.x.y * 0.25 * (1 - ads * 0.7)
    rot.y += -this.sway.x.x * 0.35 * (1 - ads * 0.7) + this.recoil.x.x * 0.3
    rot.z += -this.roll + bobX * 1.5 - this.sway.x.x * 0.4 * (1 - ads * 0.7)

    // Holster: drop and tilt away; draw: rise in with a little overshoot.
    if (a.switchTimer > 0) {
      if (phase.holster < 1 && a.switchFrom) {
        const t = smooth(phase.holster)
        pos.y -= t * 0.32
        rot.x -= t * 0.9
        rot.z += t * 0.4
      } else {
        const t = phase.draw
        const e = 1 - Math.pow(1 - t, 3)
        const over = Math.sin(t * Math.PI) * 0.08
        pos.y -= (1 - e) * 0.32
        rot.x -= (1 - e) * 0.9 - over
        rot.z += (1 - e) * 0.5
        if (showing === 'dagger') rot.y += (1 - e) * 1.2
        if (t > 0.05 && !this.drawSounded) {
          this.drawSounded = true
          this.onSound?.('draw')
        }
      }
    } else this.drawSounded = false

    if (a.reloading && showing === a.weaponId) {
      const t = 1 - a.reloadTimer / Math.max(1e-3, a.reloadTotal)
      if (showing === 'wand') {
        // Recharge: lower the wand and spin it while the tip glows hot.
        const lower = bump(t, 0, 1)
        pos.y -= lower * 0.08
        rot.x += lower * 0.5
        rot.z += t * Math.PI * 2 * lower
      } else {
        // Magazine: tilt, pull the mag (drop), slap a new one in (jolt), rack.
        const down = smooth(clamp01(t / 0.18)) * (1 - smooth(clamp01((t - 0.82) / 0.18)))
        rot.z += down * 0.65
        rot.x += down * 0.25
        pos.y -= down * 0.07
        pos.x -= down * 0.04
        const slap = bump(t, 0.55, 0.62)
        pos.y += slap * 0.03
        rot.x += slap * 0.12
        const rack = bump(t, 0.84, 0.95)
        pos.z += rack * 0.04
        rot.y -= rack * 0.12
        if (t > 0.56 && this.lastReload < 1) {
          this.lastReload = 1
          this.onSound?.('slap')
        }
        if (t > 0.86 && this.lastReload < 2) {
          this.lastReload = 2
          this.onSound?.('rack')
        }
      }
    } else if (this.lastReload > 0) this.lastReload = 0

    // One-shot actions: bolt cycle, slash, stab, wand flick.
    if (this.actionT < 1) {
      this.actionT = Math.min(1, this.actionT + dt / this.actionLen)
      const t = this.actionT
      if (this.action === 'bolt') {
        // Roll the rifle onto its side, work the bolt back and forth, settle back on target.
        const roll = bump(t, 0.2, 0.85)
        const pull = bump(t, 0.35, 0.7)
        rot.z += roll * 0.35
        pos.y -= roll * 0.02
        pos.z += pull * 0.05
        if (t > 0.45 && t - dt / this.actionLen <= 0.45) this.onSound?.('bolt')
      } else if (this.action === 'slash') {
        // Sweep across the screen edge first. Swings alternate: forehand (s > 0) runs right to left,
        // backhand back again, and both stay on screen.
        const s = this.slashSide
        const env = smooth(clamp01(t / 0.12)) * (1 - smooth(clamp01((t - 0.62) / 0.38)))
        const u = smooth(clamp01((t - 0.06) / 0.42))
        const [x0, x1] = s > 0 ? [0.05, -0.32] : [-0.32, 0.05]
        const [y0, y1] = s > 0 ? [-0.6, 0.85] : [0.85, -0.6]
        pos.x += THREE.MathUtils.lerp(x0, x1, u) * env
        pos.y += 0.035 * env
        pos.z -= 0.07 * env
        rot.y += THREE.MathUtils.lerp(y0, y1, u) * env
        rot.x -= 0.3 * env
        rot.z -= 0.75 * s * env
      } else if (this.action === 'stab') {
        // Draw back, then drive the blade straight forward at the crosshair.
        const wind = smooth(clamp01(t / 0.3)) * (1 - smooth(clamp01((t - 0.3) / 0.12)))
        const thrust = smooth(clamp01((t - 0.3) / 0.15)) * (1 - smooth(clamp01((t - 0.62) / 0.38)))
        pos.z += wind * 0.08 - thrust * 0.26
        pos.x -= thrust * 0.14
        pos.y += thrust * 0.05 - wind * 0.02
        rot.x -= thrust * 0.4 - wind * 0.15
        rot.z += thrust * 0.5
      } else if (this.action === 'cast') {
        const flick = bump(t, 0, 1)
        rot.x += flick * 0.25
        pos.z -= flick * 0.03
      }
    }

    slot.holder.position.copy(pos)
    slot.holder.rotation.copy(rot)
    this.flashLife -= dt
    slot.flash.visible = this.flashLife > 0 && showing === a.weaponId
    if (slot.glow) {
      const hot = a.reloading ? 1.6 : 1
      slot.glow.scale.setScalar((0.06 + Math.sin(f.time * 6) * 0.012) * hot + (this.flashLife > 0 ? 0.05 : 0))
    }
  }
}

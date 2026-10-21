import * as THREE from 'three'
import { CONFIG, WEAPONS, WEAPON_ORDER, type WeaponDef, type WeaponId } from './config'
import type { CombatWorld, DamageResult } from './combat'
import { HEAD_Y } from './combat'
import { buildRifle, buildRocket, buildShotgun, type ViewModel } from './guns'
import { buildTripoRifle, buildTripoRocket, buildTripoShotgun, type VmAssets } from './tripoguns'
import type { Player } from './player'

type Slot = { owned: boolean; mag: number; reserve: number }
type Spring = { x: number; v: number }

export type HitKind = 'body' | 'head' | 'kill' | 'armor' | 'prop'

export type ArsenalEvents = {
  hit(kind: HitKind, damage: number, point: THREE.Vector3): void
  fired(id: WeaponId, shake: number): void
  message(key: string): void
}

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()

function spring(s: Spring, target: number, k: number, d: number, dt: number): number {
  s.v += (target - s.x) * k * dt
  s.v *= Math.exp(-d * dt)
  s.x += s.v * dt
  return s.x
}

/**
 * The player's weapons. Simulation (fire timing, ammo, reloads, spread and recoil) runs in fixed
 * steps; the viewmodel (position springs, sway, bob, reload choreography, muzzle flash) animates
 * per rendered frame.
 */
export class Arsenal {
  readonly slots: Record<WeaponId, Slot>
  current: WeaponId = 'rifle'
  previous: WeaponId = 'shotgun'
  /** 0..1 aim-down-sights blend. */
  ads = 0
  bloom = 0
  /** Visual recoil offset (springs back) added to the camera, radians. */
  readonly punch = { pitch: 0, yaw: 0, roll: 0 }
  reloading = 0
  reloadTotal = 0
  private shellsQueued = 0
  private shellClock = 0
  private cooldown = 0
  private switchT = 0
  private switchTo: WeaponId | null = null
  private pumpT = 0
  /** Shotgun pump cycle (s): short enough to unload the tube at the 0.3 s fire interval. */
  private static readonly PUMP = 0.24
  private flashT = 0
  private dryT = 0
  private lastShot = -10
  private readonly vms: Record<WeaponId, ViewModel>
  readonly holder = new THREE.Group()
  private readonly kickZ: Spring = { x: 0, v: 0 }
  private readonly kickRot: Spring = { x: 0, v: 0 }
  private readonly kickYaw: Spring = { x: 0, v: 0 }
  private readonly swayX: Spring = { x: 0, v: 0 }
  private readonly swayY: Spring = { x: 0, v: 0 }
  private readonly land: Spring = { x: 0, v: 0 }
  private sprintBlend = 0
  private bobPhase = 0
  private bobAmount = 0
  readonly muzzleLight: THREE.PointLight
  private readonly muzzleWorld = new THREE.Vector3()
  shotsThisStep = 0
  hitsThisStep = 0
  damageThisStep = 0
  private reloadSound?: AudioBufferSourceNode
  /** Perk + Overdrive modifiers (set by the game each run). reload > 1 = faster. */
  readonly mods = { damage: 1, rate: 1, infinite: false, rifleDamage: 1, reload: 1, shotgunSpread: 1, shotgunDamage: 1 }
  constructor(
    private readonly world: CombatWorld,
    private readonly player: Player,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly events: ArsenalEvents,
    private readonly vmAssets: () => VmAssets,
  ) {
    const fx = world.fx
    const A = vmAssets()
    const arms = !!(A.armR && A.armL)
    this.vms = {
      rifle: A.rifle && arms ? buildTripoRifle(A, fx.flashTexture, fx.flameTexture) : buildRifle(fx.flashTexture, fx.flameTexture),
      shotgun: A.shotgun && arms ? buildTripoShotgun(A, fx.flashTexture, fx.flameTexture) : buildShotgun(fx.flashTexture, fx.flameTexture),
      rocket: A.launcher && arms ? buildTripoRocket(A, fx.flashTexture, fx.flameTexture) : buildRocket(fx.flashTexture, fx.flameTexture),
    }
    this.tripoRocket = !!(A.launcher && arms)
    for (const vm of Object.values(this.vms)) {
      vm.magRest ??= vm.mag?.position.clone()
      vm.pumpRest ??= vm.pump?.position.clone()
    }
    for (const id of WEAPON_ORDER) {
      this.vms[id].root.visible = false
      this.holder.add(this.vms[id].root)
    }
    this.slots = {
      rifle: { owned: true, mag: 0, reserve: 0 },
      shotgun: { owned: true, mag: 0, reserve: 0 },
      rocket: { owned: false, mag: 0, reserve: 0 },
    }
    this.muzzleLight = new THREE.PointLight('#ffb35c', 0, 9, 1.8)
    this.muzzleLight.position.set(0.15, -0.05, -0.9)
    camera.add(this.holder)
    camera.add(this.muzzleLight)
    this.reset()
  }

  private tripoRocket = false
  /** Swap in the scanned launcher once stage 3 has streamed it (keeps the procedural stand-in until then). */
  upgradeRocket(): void {
    const A = this.vmAssets()
    if (this.tripoRocket || !A.launcher || !A.armR || !A.armL) return
    const old = this.vms.rocket
    const vm = buildTripoRocket(A, this.world.fx.flashTexture, this.world.fx.flameTexture)
    vm.root.visible = old.root.visible
    this.holder.remove(old.root)
    this.holder.add(vm.root)
    this.vms.rocket = vm
    this.tripoRocket = true
    this.showCurrent()
  }
  get def(): WeaponDef {
    return WEAPONS[this.current]
  }
  get slot(): Slot {
    return this.slots[this.current]
  }
  get switching(): boolean {
    return this.switchTo !== null || this.switchT > 0
  }
  /** Current spread cone radius in radians (for the crosshair). */
  get spread(): number {
    const d = this.def
    const move = Math.min(1, this.player.speed2d / CONFIG.player.walkSpeed)
    const air = this.player.grounded ? 0 : 1
    const base = (d.spread + (d.spreadAds - d.spread) * this.ads) * (this.current === 'shotgun' ? this.mods.shotgunSpread : 1)
    return base * (1 + move * 0.9 * (1 - this.ads * 0.7) + air * 1.6) + this.bloom * (1 - this.ads * 0.5)
  }

  reset(): void {
    for (const id of WEAPON_ORDER) {
      const d = WEAPONS[id]
      const s = this.slots[id]
      s.owned = id !== 'rocket'
      s.mag = s.owned ? d.mag : 0
      s.reserve = s.owned ? d.reserveStart : 0
    }
    this.current = 'rifle'
    this.previous = 'shotgun'
    this.reloading = 0
    this.cooldown = 0
    this.bloom = 0
    this.ads = 0
    this.switchTo = null
    this.switchT = 0.24
    this.pumpT = 0
    this.flashT = 0
    this.shellsQueued = 0
    this.reloadSound?.stop()
    this.showCurrent()
  }

  private showCurrent(): void {
    for (const id of WEAPON_ORDER) this.vms[id].root.visible = id === this.current
    const vm = this.vms.rocket
    if (vm.warhead) vm.warhead.visible = this.slots.rocket.mag > 0
  }

  give(id: WeaponId, equip = true): void {
    const s = this.slots[id]
    const d = WEAPONS[id]
    if (!s.owned) {
      s.owned = true
      s.mag = d.mag
      s.reserve = d.reserveStart
      if (equip) this.select(id)
    } else s.reserve = Math.min(d.reserveMax, s.reserve + d.mag * 2)
  }

  /** Ammo box: refill bullets and shells by a share of max reserve. Returns true if useful. */
  refill(): boolean {
    let useful = false
    for (const id of ['rifle', 'shotgun'] as WeaponId[]) {
      const s = this.slots[id]
      const d = WEAPONS[id]
      if (s.reserve < d.reserveMax) useful = true
      s.reserve = Math.min(d.reserveMax, s.reserve + Math.ceil(d.reserveMax * 0.5))
    }
    return useful
  }

  select(id: WeaponId): void {
    if (!this.slots[id].owned || (id === this.current && !this.switchTo)) return
    if (this.switchTo === id) return
    this.switchTo = id
    this.switchT = 0.16
    this.cancelReload()
  }

  /** Q: toggle to the last weapon. Mid-switch it flips back; falls back to any other owned gun. */
  quickSwitch(): void {
    const cur = this.switchTo ?? this.current
    let target: WeaponId = this.switchTo ? this.current : this.previous
    if (target === cur || !this.slots[target]?.owned) target = WEAPON_ORDER.find(id => id !== cur && this.slots[id].owned) ?? cur
    if (target !== cur) this.select(target)
  }

  cycle(dir: number): void {
    const owned = WEAPON_ORDER.filter(id => this.slots[id].owned)
    const from = owned.indexOf(this.switchTo ?? this.current)
    this.select(owned[(from + dir + owned.length) % owned.length])
  }

  private cancelReload(): void {
    if (this.reloading > 0) {
      this.reloading = 0
      this.shellsQueued = 0
      this.reloadSound?.stop()
    }
  }

  private get shellTime(): number {
    return this.def.reload / this.mods.reload
  }

  startReload(): void {
    const d = this.def
    const s = this.slot
    if (this.reloading > 0 || this.switching || s.mag >= d.mag || s.reserve <= 0) return
    this.ads = Math.min(this.ads, 0.3)
    if (d.perShell) {
      this.shellsQueued = Math.min(d.mag - s.mag, s.reserve)
      this.reloadTotal = 0.3 + this.shellsQueued * this.shellTime + 0.25
      this.reloading = this.reloadTotal
      this.shellClock = -0.3 + this.shellTime
    } else {
      this.reloadTotal = d.reload / this.mods.reload
      this.reloading = this.reloadTotal
      this.reloadSound = this.world.audio.play(this.current === 'rocket' ? 'rocket_reload' : 'rifle_reload', { volume: 0.9, jitter: 0.02 })
    }
  }

  step(dt: number, input: { fire: boolean; firePressed: boolean; ads: boolean; reload: boolean }, eye: THREE.Vector3, sprinting: boolean): void {
    this.shotsThisStep = 0
    this.hitsThisStep = 0
    this.damageThisStep = 0
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.dryT = Math.max(0, this.dryT - dt)
    const d = this.def
    const s = this.slot
    this.bloom = Math.max(0, this.bloom - dt * (this.world.time - this.lastShot > 0.12 ? 0.12 : 0.02))
    // Switching: lower old weapon, then raise the new one.
    if (this.switchTo) {
      this.switchT -= dt
      if (this.switchT <= 0) {
        if (this.switchTo !== this.current) this.previous = this.current
        this.current = this.switchTo
        this.switchTo = null
        this.switchT = 0.24
        this.showCurrent()
        this.world.audio.play('weapon_switch', { volume: 0.55 })
      }
      return
    }
    if (this.switchT > 0) {
      this.switchT = Math.max(0, this.switchT - dt)
      return
    }
    const wantAds = input.ads && !sprinting && this.reloading <= 0
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, dt * 14)
    if (input.reload) this.startReload()
    // Reload progress.
    if (this.reloading > 0) {
      const before = this.reloading
      this.reloading = Math.max(0, this.reloading - dt)
      if (d.perShell) {
        this.shellClock += dt
        while (this.shellsQueued > 0 && this.shellClock >= this.shellTime && s.reserve > 0) {
          this.shellClock -= this.shellTime
          s.mag += 1
          s.reserve -= 1
          this.shellsQueued -= 1
          this.world.audio.play('shell_insert', { volume: 0.85 })
          if (this.shellsQueued === 0) this.reloading = Math.min(this.reloading, 0.25)
        }
        // Firing interrupts a shell reload once at least one shell is in.
        if (input.firePressed && s.mag > 0 && this.shellsQueued > 0) {
          this.reloading = 0
          this.shellsQueued = 0
        }
        if (this.reloading === 0 && before > 0) {
          this.shellsQueued = 0
          this.pumpT = Arsenal.PUMP
          this.world.audio.play('shotgun_pump', { volume: 0.8 })
        }
      } else if (this.reloading === 0) {
        const take = Math.min(d.mag - s.mag, s.reserve)
        s.mag += take
        s.reserve -= take
        if (this.current === 'rocket') this.showCurrent()
      }
      if (this.reloading > 0) return
    }
    this.pumpT = Math.max(0, this.pumpT - dt)
    // Trigger.
    const wantsFire = d.auto ? input.fire : input.firePressed
    if (!wantsFire || this.cooldown > 0) return
    if (s.mag <= 0) {
      if (s.reserve > 0) this.startReload()
      else if (this.dryT <= 0) {
        this.world.audio.play('dry_fire', { volume: 0.9 })
        this.dryT = 0.35
        const alt = WEAPON_ORDER.find(id => id !== this.current && this.slots[id].owned && this.slots[id].mag + this.slots[id].reserve > 0)
        if (alt) this.select(alt)
        else this.events.message('msg.noAmmo')
      }
      return
    }
    this.fire(eye)
  }

  private fire(eye: THREE.Vector3): void {
    const d = this.def
    const s = this.slot
    if (!this.mods.infinite) s.mag -= 1
    this.cooldown = d.interval / this.mods.rate
    this.lastShot = this.world.time
    const forward = this.player.forward(tmp)
    const vm = this.vms[this.current]
    vm.muzzle.getWorldPosition(this.muzzleWorld)
    const muzzle = this.muzzleWorld
    // Sound + muzzle.
    const A = this.world.audio
    if (this.current === 'rifle') {
      A.play('rifle_shot', { volume: 0.95, jitter: 0.045 })
      if (s.mag <= 6 && s.mag > 0) A.cue('lowAmmo', 0.8)
    } else if (this.current === 'shotgun') {
      A.play('shotgun_shot', { volume: 1, jitter: 0.03 })
      this.pumpT = Arsenal.PUMP
      window.setTimeout(() => {
        if (this.current === 'shotgun') A.play('shotgun_pump', { volume: 0.6, rate: 1.15 })
      }, 90)
    } else {
      A.play('rocket_launch', { volume: 1, jitter: 0.03 })
    }
    this.world.noise(eye, 0, this.current === 'rocket' ? 40 : 34)
    this.flashT = this.current === 'shotgun' ? 0.06 : 0.045
    this.muzzleLight.intensity = this.current === 'rocket' ? 30 : this.current === 'shotgun' ? 26 : 16
    // Kick: aim recoil (partly permanent), visual punch, viewmodel spring.
    const adsK = 1 - this.ads * 0.45
    const pitchKick = d.recoilPitch * (0.8 + Math.random() * 0.4) * adsK
    const yawKick = (Math.random() * 2 - 1) * d.recoilYaw * adsK
    this.player.pitch = Math.min(1.45, this.player.pitch + pitchKick * 0.55)
    this.player.yaw -= yawKick * 0.55
    this.punch.pitch += pitchKick * 0.9
    this.punch.yaw += yawKick * 0.6
    this.punch.roll += (Math.random() * 2 - 1) * 0.012 * d.punch
    this.kickZ.v += 1.9 * d.punch * (1 - this.ads * 0.4)
    this.kickRot.v += 7 * d.punch * (1 - this.ads * 0.5)
    this.kickYaw.v += (Math.random() * 2 - 1) * 3 * d.punch
    this.bloom = Math.min(d.bloomMax, this.bloom + d.bloom)
    this.events.fired(this.current, d.shake)
    // Shell ejection (rifle immediately, shotgun on pump).
    if (vm.eject && this.current === 'rifle') this.ejectShell(vm, 1)
    if (vm.eject && this.current === 'shotgun') window.setTimeout(() => this.ejectShell(vm, 1.6), 120)
    if (this.current === 'rocket') {
      if (vm.warhead) vm.warhead.visible = false
      const dir = this.aimDirection(forward, this.spread)
      const origin = tmp2.copy(eye).addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.12, 0))
      this.world.fireRocket(0, origin.clone(), dir.clone(), this.player.collider.handle)
      this.world.fx.muzzle(muzzle.clone(), dir, [5, 3, 1.4, 1], 2.2)
      for (let i = 0; i < 6; i += 1) {
        const back = dir.clone().multiplyScalar(-2 - Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5))
        this.world.fx.alpha.emit({ pos: eye.clone().addScaledVector(dir, -0.5), vel: back, life: 1.2, size: 0.3, size1: 1.4, color: [0.6, 0.58, 0.55, 0.4], color1: [0.6, 0.58, 0.55, 0], drag: 2, frame: 1 })
      }
      if (s.mag <= 0 && s.reserve > 0) window.setTimeout(() => this.startReload(), 450)
      return
    }
    this.world.fx.muzzle(muzzle.clone(), forward, [4, 2.6, 1.2, 1], this.current === 'shotgun' ? 1.8 : 1)
    const pellets = d.pellets
    let anyHit = false
    let totalDamage = 0
    let killed = false
    let head = false
    let armorOnly = true
    let hitPoint: THREE.Vector3 | null = null
    const hitTargets = new Map<number, number>()
    for (let p = 0; p < pellets; p += 1) {
      const dir = this.aimDirection(forward, this.spread)
      const hit = this.world.raycast(eye, dir, d.range, this.player.collider.handle)
      const end = hit ? hit.point : tmp2.copy(eye).addScaledVector(dir, d.range)
      if (this.current === 'rifle' || p % 3 === 0) this.world.fx.tracer(muzzle, end, [5, 3.4, 1.6, 0.9], 340, this.current === 'rifle' ? 0.022 : 0.018)
      if (!hit) continue
      const tag = hit.tag
      if (tag?.kind === 'bot') {
        const isHead = this.isHead(tag.id, hit.point)
        const weak = this.weakMult(tag.id, hit.point)
        let dmg = this.baseDamage * (isHead ? d.headMultiplier : 1) * weak
        if (this.current === 'shotgun') dmg *= Math.max(0.25, 1 - Math.max(0, hit.distance - 6) / 22)
        if (this.current === 'rifle') dmg *= Math.max(0.6, 1 - Math.max(0, hit.distance - 30) / 80)
        const r: DamageResult = this.world.damage(tag.id, { attacker: 0, amount: dmg, source: this.current, from: eye.clone(), point: hit.point.clone(), normal: hit.normal.clone(), headshot: isHead })
        hitTargets.set(tag.id, (hitTargets.get(tag.id) ?? 0) + r.dealt)
        anyHit = anyHit || r.dealt > 0
        totalDamage += r.dealt
        killed = killed || r.killed
        head = head || isHead
        armorOnly = armorOnly && r.armor
        hitPoint = hit.point.clone()
        if (this.world.isHuman(tag.id)) {
          this.world.fx.humanHit(hit.point, hit.normal, this.current === 'shotgun' || isHead)
          this.world.audio.play('human_hit', { volume: 0.45, pos: hit.point, jitter: 0.12 })
        } else {
          this.world.fx.robotHit(hit.point, hit.normal, this.current === 'shotgun' || isHead || weak > 1)
          this.world.audio.play('impact_metal', { volume: 0.35, pos: hit.point, jitter: 0.12 })
        }
      } else if (tag?.kind === 'drone') {
        let dmg = this.baseDamage
        if (this.current === 'shotgun') dmg *= Math.max(0.3, 1 - Math.max(0, hit.distance - 8) / 24)
        const r = this.world.damageDrone(tag.id, { attacker: 0, amount: dmg, source: this.current, from: eye.clone(), point: hit.point.clone(), normal: hit.normal.clone() })
        hitTargets.set(-1 - tag.id, (hitTargets.get(-1 - tag.id) ?? 0) + r.dealt)
        anyHit = anyHit || r.dealt > 0
        totalDamage += r.dealt
        killed = killed || r.killed
        armorOnly = false
        hitPoint = hit.point.clone()
        this.world.fx.robotHit(hit.point, hit.normal, this.current === 'shotgun')
        this.world.audio.play('impact_metal', { volume: 0.3, pos: hit.point, jitter: 0.15 })
      } else if (tag?.kind === 'prop') {
        this.world.damageProp(tag.index, { attacker: 0, amount: d.damage, source: this.current, from: eye.clone(), point: hit.point.clone(), normal: hit.normal.clone() })
        this.world.fx.sparks(hit.point, hit.normal, 8, 7)
        this.world.audio.play('impact_metal', { volume: 0.5, pos: hit.point })
        if (p === 0) this.events.hit('prop', 0, hit.point)
      } else {
        const surface = tag?.kind === 'world' ? tag.surface : 'concrete'
        this.world.fx.impact(hit.point, hit.normal, surface)
        if (p % 3 === 0) this.world.audio.play(surface === 'metal' ? 'impact_metal' : 'impact_concrete', { volume: surface === 'metal' ? 0.4 : 0.7, pos: hit.point, jitter: 0.15, ref: 3 })
      }
    }
    this.shotsThisStep += 1
    if (anyHit) {
      this.hitsThisStep += 1
      this.damageThisStep += totalDamage
      this.events.hit(killed ? 'kill' : head ? 'head' : armorOnly ? 'armor' : 'body', totalDamage, hitPoint ?? eye)
    }
  }

  isHead: (id: number, point: THREE.Vector3) => boolean = (_id, p) => p.y > HEAD_Y
  /** Damage multiplier for exposed weak points (heavy/boss enemies); set by the game. */
  weakMult: (id: number, point: THREE.Vector3) => number = () => 1

  /** Per-pellet damage including perk and Overdrive modifiers. */
  private get baseDamage(): number {
    const m = this.mods
    return this.def.damage * m.damage * (this.current === 'rifle' ? m.rifleDamage : this.current === 'shotgun' ? m.shotgunDamage : 1)
  }

  private ejectShell(vm: ViewModel, power: number): void {
    if (!vm.eject) return
    const pos = vm.eject.getWorldPosition(new THREE.Vector3())
    const q = this.camera.getWorldQuaternion(tmpQ)
    const v = new THREE.Vector3(1.6 + Math.random() * 0.8, 1.4 + Math.random() * 0.8, 0.4).multiplyScalar(power).applyQuaternion(q)
    v.add(this.player.velocity)
    this.world.fx.shell(pos, v)
  }

  private aimDirection(forward: THREE.Vector3, spread: number): THREE.Vector3 {
    // Uniform-ish disc within the cone (sqrt for area).
    const r = Math.sqrt(Math.random()) * spread
    const a = Math.random() * Math.PI * 2
    const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw))
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    return forward.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize()
  }

  /** Per-frame viewmodel animation. `look` is this frame's mouse delta. */
  animate(dt: number, look: { x: number; y: number }, reducedMotion: boolean): void {
    const vm = this.vms[this.current]
    const P = this.player
    // Punch recovery.
    const rec = Math.exp(-dt * 9)
    this.punch.pitch *= rec
    this.punch.yaw *= rec
    this.punch.roll *= Math.exp(-dt * 7)
    spring(this.kickZ, 0, 260, 22, dt)
    spring(this.kickRot, 0, 240, 20, dt)
    spring(this.kickYaw, 0, 200, 18, dt)
    spring(this.swayX, THREE.MathUtils.clamp(-look.x * 1.6, -0.07, 0.07), 90, 14, dt)
    spring(this.swayY, THREE.MathUtils.clamp(-look.y * 1.6, -0.06, 0.06), 90, 14, dt)
    if (P.landImpact > 0) {
      this.land.v -= Math.min(1.2, P.landImpact * 0.09)
      P.landImpact = 0
    }
    spring(this.land, 0, 140, 12, dt)
    const sprint = P.sprinting && this.reloading <= 0 ? 1 : 0
    this.sprintBlend += (sprint - this.sprintBlend) * Math.min(1, dt * 9)
    const speed = P.grounded ? P.speed2d : 0
    this.bobAmount += (Math.min(1.4, speed / CONFIG.player.walkSpeed) - this.bobAmount) * Math.min(1, dt * 8)
    this.bobPhase += dt * (5 + speed * 1.1)
    const bobK = (reducedMotion ? 0.35 : 1) * CONFIG.camera.bob * (1 - this.ads * 0.85)
    const bx = Math.sin(this.bobPhase) * 0.011 * this.bobAmount * bobK
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.012 * this.bobAmount * bobK
    const breathe = Math.sin(this.world.time * 1.6) * 0.0022 * (1 - this.ads * 0.8)
    // Hip vs ADS pose.
    const hip = vm.hip ? tmp.copy(vm.hip) : this.current === 'rocket' ? new THREE.Vector3(0.22, -0.2, -0.36) : this.current === 'shotgun' ? new THREE.Vector3(0.17, -0.2, -0.38) : new THREE.Vector3(0.16, -0.19, -0.4)
    const ads = vm.ads
      ? tmp2.set(vm.ads.x, vm.ads.y ?? -vm.sightY, vm.ads.z)
      : new THREE.Vector3(this.current === 'rocket' ? 0.08 : 0, -vm.sightY, this.current === 'rocket' ? -0.2 : this.current === 'shotgun' ? -0.24 : -0.2)
    const pos = hip.lerp(ads, this.ads)
    const root = vm.root
    root.position.set(pos.x + bx + this.swayX.x * 0.3, pos.y + by + breathe + this.land.x * 0.05 + this.swayY.x * 0.25, pos.z + this.kickZ.x * 0.035)
    root.rotation.set(this.kickRot.x * 0.035 + this.swayY.x * 0.4 + this.land.x * 0.04, this.swayX.x * 0.6 + this.kickYaw.x * 0.01, this.swayX.x * 0.3 + bx * 1.8, 'YXZ')
    // Sprint pose.
    if (this.sprintBlend > 0.001) {
      root.position.x += 0.02 * this.sprintBlend
      root.position.y -= 0.045 * this.sprintBlend
      root.position.z += 0.04 * this.sprintBlend
      root.rotation.y += 0.55 * this.sprintBlend
      root.rotation.x -= 0.22 * this.sprintBlend
      root.rotation.z += 0.12 * this.sprintBlend
    }
    // Switching: drop the weapon down and back.
    const sw = this.switchTo ? 1 - this.switchT / 0.16 : this.switchT > 0 ? this.switchT / 0.24 : 0
    if (sw > 0) {
      root.position.y -= 0.28 * sw
      root.rotation.x -= 0.7 * sw
    }
    // Reload choreography.
    if (vm.mag) vm.mag.position.copy(vm.magRest ?? new THREE.Vector3(0, -0.09, -0.078))
    if (vm.bolt) vm.bolt.position.z = -0.04 + Math.max(0, this.kickZ.x) * 0.04
    if (this.reloading > 0) {
      const t = 1 - this.reloading / this.reloadTotal
      const inOut = Math.min(1, t * 6, (1 - t) * 5)
      if (this.current === 'rifle') {
        root.rotation.z += 0.55 * inOut
        root.rotation.x += 0.18 * inOut
        root.position.y -= 0.04 * inOut
        if (vm.mag) {
          const out = t < 0.18 ? 0 : t < 0.4 ? (t - 0.18) / 0.22 : t < 0.52 ? 1 : t < 0.7 ? 1 - (t - 0.52) / 0.18 : 0
          vm.mag.position.y -= out * 0.32
          vm.mag.position.z += out * 0.05
          vm.mag.rotation.x = out * 0.4
        }
        if (t > 0.8 && t < 0.9) root.position.z += Math.sin(((t - 0.8) / 0.1) * Math.PI) * 0.02
      } else if (this.current === 'shotgun') {
        root.rotation.z -= 0.45 * inOut
        root.rotation.x += 0.2 * inOut
        root.position.y -= 0.03 * inOut
        const cycle = ((this.reloadTotal - this.reloading - 0.3) / this.shellTime) % 1
        if (t > 0.1 && this.shellsQueued > 0) root.position.y += Math.sin(Math.max(0, cycle) * Math.PI) * 0.012
      } else {
        root.position.y -= 0.22 * inOut
        root.rotation.x -= 0.5 * inOut
        if (vm.warhead) vm.warhead.visible = t > 0.45
      }
    } else if (vm.mag) vm.mag.rotation.x = 0
    if (vm.pump) {
      const pt = this.pumpT > 0 ? 1 - this.pumpT / Arsenal.PUMP : 0
      const slide = this.pumpT > 0 && pt > 0.15 ? Math.sin(((pt - 0.15) / 0.85) * Math.PI) : 0
      vm.pump.position.z = (vm.pumpRest?.z ?? -0.33) + slide * 0.09
      if (slide > 0) root.rotation.x += slide * 0.05
    }
    // Muzzle flash + light.
    this.flashT = Math.max(0, this.flashT - dt)
    vm.flash.visible = this.flashT > 0
    if (vm.flash.visible) {
      vm.flash.rotation.z = Math.random() * Math.PI * 2
      vm.flash.scale.setScalar(0.8 + Math.random() * 0.5)
    }
    this.muzzleLight.intensity *= Math.exp(-dt * 40)
    this.holder.visible = P.alive
  }

  /** Viewmodel field-of-view target when aiming. */
  fovScale(): number {
    const d = this.def
    return 1 + (d.adsFov / 78 - 1) * this.ads
  }
}

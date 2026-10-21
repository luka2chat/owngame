import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import type { ColliderTag, PickupSpot, PropSpot } from './arena'
import type { CombatWorld, DamageInfo } from './combat'
import type { Library } from './library'
import { BLOCKED, type NavGrid } from './nav'

type Prop = {
  spot: PropSpot
  obj: THREE.Object3D
  collider?: RAPIER.Collider
  health: number
  burning: number
  alive: boolean
  respawn: number
  lastAttacker: number
  light?: THREE.PointLight
  blocked: number[]
}

/**
 * Burning props borrow from a fixed pool of lights that are created up front and never leave the
 * scene. three.js bakes the number of lights into every lit shader, so adding a light mid-match
 * (the old lazy per-prop light) recompiled every material in the arena on the first canister fire.
 */
const FIRE_LIGHTS = 2
const _top = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

const PROP = {
  barrel: { health: 40, radius: 5.5, damage: 115, height: 0.9, r: 0.31, scale: 1 },
  propane: { health: 25, radius: 4.8, damage: 90, height: 1.1, r: 0.2, scale: 1.25 },
}

export class Props {
  readonly list: Prop[] = []
  private readonly fireLights: THREE.PointLight[] = []
  constructor(
    scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly tags: Map<number, ColliderTag>,
    private readonly nav: NavGrid,
    lib: Library,
    spots: PropSpot[],
  ) {
    spots.forEach((spot, index) => {
      const src = spot.model === 'barrel' ? lib.models.barrel_03.scene : lib.models.propane_tank.scene
      const obj = src.clone(true)
      obj.scale.setScalar(PROP[spot.model].scale)
      if (spot.model === 'barrel') {
        // Tint barrels hazard red so they read as explosive.
        obj.traverse(o => {
          const m = o as THREE.Mesh
          if (m.isMesh) {
            const mat = (m.material as THREE.MeshStandardMaterial).clone()
            mat.color.set('#c8452e')
            m.material = mat
          }
        })
      }
      obj.traverse(o => {
        o.castShadow = true
        o.receiveShadow = true
      })
      obj.position.copy(spot.pos)
      obj.rotation.y = spot.rot
      scene.add(obj)
      const p: Prop = { spot, obj, health: PROP[spot.model].health, burning: 0, alive: true, respawn: 0, lastAttacker: -1, blocked: [] }
      this.list.push(p)
      this.enable(p, index)
    })
    for (let i = 0; i < FIRE_LIGHTS; i += 1) {
      const light = new THREE.PointLight('#ff7a2a', 0, 9, 1.6)
      light.castShadow = false
      scene.add(light)
      this.fireLights.push(light)
    }
  }

  private releaseLight(p: Prop): void {
    if (!p.light) return
    p.light.intensity = 0
    p.light = undefined
  }

  private enable(p: Prop, index: number): void {
    const d = PROP[p.spot.model]
    p.collider = this.physics.addStaticCylinder(new THREE.Vector3(p.spot.pos.x, p.spot.pos.y + d.height / 2, p.spot.pos.z), d.r, d.height)
    this.tags.set(p.collider.handle, { kind: 'prop', index })
    p.blocked = []
    const [cx, cz] = this.nav.cellOf(p.spot.pos.x, p.spot.pos.z)
    if (this.nav.inside(cx, cz)) {
      const i = this.nav.index(cx, cz)
      if (this.nav.heights[i] !== BLOCKED) {
        p.blocked.push(i, this.nav.heights[i])
        this.nav.heights[i] = BLOCKED
      }
    }
    p.obj.visible = true
    p.obj.scale.setScalar(d.scale)
    p.alive = true
    p.health = d.health
    p.burning = 0
  }

  damage(index: number, info: DamageInfo, world: CombatWorld): void {
    const p = this.list[index]
    if (!p || !p.alive) return
    p.health -= info.amount
    p.lastAttacker = info.attacker
    if (p.health <= 0) p.burning = Math.min(p.burning || 0.12, 0.12)
    else if (p.burning <= 0 && p.health < PROP[p.spot.model].health * 0.6) {
      p.burning = 2.4
      world.audio.play('impact_metal', { volume: 0.6, pos: p.spot.pos, rate: 0.7 })
    }
  }

  private explode(p: Prop, world: CombatWorld): void {
    const d = PROP[p.spot.model]
    p.alive = false
    p.obj.visible = false
    if (p.collider) {
      this.tags.delete(p.collider.handle)
      this.physics.world.removeCollider(p.collider, false)
      p.collider = undefined
    }
    for (let i = 0; i < p.blocked.length; i += 2) this.nav.heights[p.blocked[i]] = p.blocked[i + 1]
    p.blocked = []
    this.releaseLight(p)
    p.respawn = 35
    const at = p.spot.pos.clone().setY(p.spot.pos.y + d.height * 0.5)
    world.explode(at, d.radius, d.damage, p.lastAttacker, 'barrel', new THREE.Vector3(0, 1, 0))
  }

  update(dt: number, world: CombatWorld, occupied: (pos: THREE.Vector3) => boolean): void {
    this.list.forEach((p, index) => {
      if (!p.alive) {
        p.respawn -= dt
        if (p.respawn <= 0 && !occupied(p.spot.pos)) this.enable(p, index)
        return
      }
      if (p.burning > 0) {
        p.burning -= dt
        const top = _top.copy(p.spot.pos).setY(p.spot.pos.y + PROP[p.spot.model].height + 0.05)
        world.fx.fire(top, dt, 0.7)
        if (Math.random() < dt * 10) world.fx.sparks(top, _up, 2, 3)
        if (!p.light) {
          p.light = this.fireLights.find(l => !this.list.some(o => o.light === l))
          p.light?.position.copy(top)
        }
        if (p.light) p.light.intensity = 10 + Math.random() * 6
        p.obj.position.x = p.spot.pos.x + (Math.random() - 0.5) * 0.02
        if (p.burning <= 0) this.explode(p, world)
      }
    })
  }

  reset(): void {
    this.list.forEach((p, index) => {
      if (!p.alive) this.enable(p, index)
      p.burning = 0
      this.releaseLight(p)
      p.obj.position.copy(p.spot.pos)
    })
  }
}

export type PickupKind = PickupSpot['kind']
type Pickup = { spot: PickupSpot; item: THREE.Object3D; ring: THREE.Mesh; beam: THREE.Mesh; glow: THREE.Mesh; available: boolean; respawn: number }

const PICKUP_STYLE: Record<PickupKind, { color: string; respawn: number }> = {
  health: { color: '#4dff7a', respawn: 20 },
  armor: { color: '#3fb8ff', respawn: 28 },
  ammo: { color: '#ffc23f', respawn: 16 },
  rocket: { color: '#ff4a2a', respawn: 38 },
}

export class Pickups {
  readonly list: Pickup[] = []
  private readonly padGeo = new THREE.CylinderGeometry(0.72, 0.8, 0.08, 32)
  private readonly glowGeo = new THREE.PlaneGeometry(4.2, 4.2)
  constructor(scene: THREE.Scene, lib: Library, spots: PickupSpot[], rocketModel: THREE.Object3D) {
    const padMat = new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: 0.9, roughness: 0.35 })
    for (const spot of spots) {
      const st = PICKUP_STYLE[spot.kind]
      const group = new THREE.Group()
      group.position.copy(spot.pos)
      const pad = new THREE.Mesh(this.padGeo, padMat)
      pad.position.y = 0.04
      pad.receiveShadow = true
      group.add(pad)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 48), new THREE.MeshStandardMaterial({ color: '#000', emissive: st.color, emissiveIntensity: 5 }))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.09
      group.add(ring)
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.62, 2.4, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      beam.position.y = 1.25
      group.add(beam)
      let item: THREE.Object3D
      if (spot.kind === 'health') {
        item = lib.models.medical_box.scene.clone(true)
        item.scale.setScalar(1.5)
      } else if (spot.kind === 'ammo') {
        item = lib.models.ammo_box.scene.clone(true)
        item.scale.setScalar(1.6)
      } else if (spot.kind === 'armor') {
        // Tripo ballistic plate (faces ±X in the scan), turned to face the pad's front.
        item = lib.models.armor_plate.scene.clone(true)
        item.scale.setScalar(0.58)
        item.rotation.y = Math.PI / 2
      }
      else {
        item = rocketModel
        item.scale.setScalar(1)
      }
      // Centre the item over the pad.
      const box = new THREE.Box3().setFromObject(item)
      const c = box.getCenter(new THREE.Vector3())
      const holder = new THREE.Group()
      item.position.sub(c)
      holder.add(item)
      holder.position.y = 0.95
      holder.traverse(o => {
        o.castShadow = true
      })
      group.add(holder)
      // Coloured light pool faked with an unlit additive decal: eleven real point lights here used to
      // add per-pixel lighting cost to every lit surface in the arena, all match long.
      const glow = new THREE.Mesh(
        this.glowGeo,
        new THREE.MeshBasicMaterial({ map: glowTexture(), color: st.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      )
      glow.rotation.x = -Math.PI / 2
      glow.position.y = 0.02
      glow.renderOrder = 3
      group.add(glow)
      scene.add(group)
      this.list.push({ spot, item: holder, ring, beam, glow, available: true, respawn: 0 })
    }
  }

  update(dt: number, time: number): void {
    for (const p of this.list) {
      if (!p.available) {
        p.respawn -= dt
        if (p.respawn <= 0) p.available = true
      }
      const target = p.available ? 1 : 0
      const s = p.item.scale.x + (target - p.item.scale.x) * Math.min(1, dt * 8)
      p.item.scale.setScalar(Math.max(0.0001, s))
      p.item.visible = s > 0.02
      p.item.rotation.y = time * 1.3
      p.item.position.y = 0.95 + Math.sin(time * 2.2 + p.spot.pos.x) * 0.08
      ;(p.beam.material as THREE.MeshBasicMaterial).opacity = p.available ? 0.08 + Math.sin(time * 3) * 0.02 : 0.015
      ;(p.glow.material as THREE.MeshBasicMaterial).opacity = p.available ? 0.5 + Math.sin(time * 3) * 0.06 : 0.08
      ;(p.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = p.available ? 5 : 0.8
    }
  }

  take(p: Pickup): void {
    p.available = false
    p.respawn = PICKUP_STYLE[p.spot.kind].respawn
  }

  reset(): void {
    for (const p of this.list) {
      p.available = true
      p.respawn = 0
    }
  }
}


let glowTex: THREE.Texture | undefined
/** Soft radial falloff shared by every pickup light pool. */
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}

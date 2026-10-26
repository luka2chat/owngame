import * as THREE from 'three'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

export type WeaponId = 'rifle' | 'sniper' | 'wand' | 'dagger'
export type FireMode = 'auto' | 'semi' | 'bolt' | 'melee'
type V3 = [number, number, number]

/**
 * One weapon. Guns are hitscan with CS-like spread/bloom; the sniper is only accurate through its
 * scope; the dagger is a short ray with a heavy stab on the secondary button. View poses are
 * camera-space offsets for the first-person model (which faces -Z after the +90° yaw applied to
 * the item model's +X).
 */
export type WeaponDef = {
  id: WeaponId
  slot: number
  mode: FireMode
  /** WoW item the model and texture come from. */
  item: number
  model: { dir: string; file: string }
  /** Third-person muzzle / blade tip in item model space. */
  muzzle: V3
  damage: number
  headMultiplier: number
  pellets: number
  interval: number
  magazine: number
  reserve: number
  reload: number
  range: number
  falloffStart: number
  minFactor: number
  spreadBase: number
  /** Replaces `spreadBase` while aiming down the sights (the sniper's scope). */
  spreadAds?: number
  spreadMove: number
  spreadAir: number
  /** Extra cone each pellet gets around the aim when `pellets` > 1. */
  pelletSpread: number
  bloomPerShot: number
  bloomMax: number
  bloomRecover: number
  /** Camera pitch kick per shot (radians) and random yaw share. */
  kick: number
  kickYaw: number
  /** Movement speed multiplier while this weapon is out. */
  speed: number
  draw: number
  holster: number
  /** Secondary-button stab for melee. */
  heavy?: { damage: number; interval: number; range: number }
  /** Backstab multiplier for melee hits from behind. */
  backstab?: number
  view: {
    hip: V3
    ads: V3 | null
    /** Extra rotation applied on top of the forward-facing base pose (radians, XYZ). */
    rot: V3
    scale: number
    adsFov: number | null
    /** Aiming looks through a scope overlay instead of the iron sights. */
    scope?: boolean
    /** Scope magnification steps as fields of view, first one on scoping in; the wheel steps through them. */
    zoomFovs?: readonly number[]
    /** Recoil: backwards push and upward rotation per shot. */
    recoilBack: number
    recoilUp: number
  }
  tracer: number
  /** Third-person animation ids (WoW AnimationData). */
  anim: { ready: number; attack: number; reload: number | null }
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: 'rifle',
    slot: 1,
    mode: 'auto',
    item: 2508,
    model: { dir: 'rifle', file: 'firearm_2h_rifle_a_01' },
    muzzle: [0.88, 0.11, -0.01],
    damage: 30,
    headMultiplier: 3.6,
    pellets: 1,
    interval: 0.1,
    magazine: 30,
    reserve: 120,
    reload: 2.4,
    range: 300,
    falloffStart: 70,
    minFactor: 0.65,
    spreadBase: 0.004,
    spreadMove: 0.03,
    spreadAir: 0.08,
    pelletSpread: 0,
    bloomPerShot: 0.0045,
    bloomMax: 0.04,
    bloomRecover: 0.12,
    kick: 0.012,
    kickYaw: 0.6,
    speed: 0.96,
    draw: 0.55,
    holster: 0.25,
    view: { hip: [0.2, -0.235, -0.42], ads: [0, -0.155, -0.33], rot: [0, 0, 0], scale: 1, adsFov: 50, recoilBack: 0.045, recoilUp: 0.06 },
    tracer: 0xffe9a0,
    anim: { ready: 48, attack: 49, reload: 106 },
  },
  sniper: {
    id: 'sniper',
    slot: 2,
    mode: 'bolt',
    // No item carries this model; its texture is the silver scope variant.
    item: 0,
    model: { dir: 'sniper', file: 'firearm_2h_rifle_a_04scopesniper' },
    muzzle: [1.27, 0.045, 0],
    damage: 85,
    headMultiplier: 3,
    pellets: 1,
    interval: 1.3,
    magazine: 5,
    reserve: 25,
    reload: 3,
    range: 1000,
    falloffStart: 400,
    minFactor: 0.85,
    spreadBase: 0.045,
    spreadAds: 0.0006,
    spreadMove: 0.06,
    spreadAir: 0.12,
    pelletSpread: 0,
    bloomPerShot: 0.03,
    bloomMax: 0.03,
    bloomRecover: 0.035,
    kick: 0.07,
    kickYaw: 0.3,
    speed: 0.9,
    draw: 0.8,
    holster: 0.35,
    view: { hip: [0.2, -0.24, -0.44], ads: [0, -0.21, -0.3], rot: [0, 0, 0], scale: 0.85, adsFov: 18, scope: true, zoomFovs: [18, 7], recoilBack: 0.12, recoilUp: 0.14 },
    tracer: 0xfff2c4,
    anim: { ready: 48, attack: 49, reload: 106 },
  },
  wand: {
    id: 'wand',
    slot: 3,
    mode: 'semi',
    item: 5069,
    model: { dir: 'wand', file: 'wand_1h_standard_a_02' },
    muzzle: [0.44, 0.08, 0],
    damage: 34,
    headMultiplier: 3,
    pellets: 1,
    interval: 0.17,
    magazine: 12,
    reserve: 60,
    reload: 1.7,
    range: 200,
    falloffStart: 30,
    minFactor: 0.55,
    spreadBase: 0.005,
    spreadMove: 0.018,
    spreadAir: 0.06,
    pelletSpread: 0,
    bloomPerShot: 0.012,
    bloomMax: 0.035,
    bloomRecover: 0.15,
    kick: 0.02,
    kickYaw: 0.5,
    speed: 1.04,
    draw: 0.35,
    holster: 0.18,
    view: { hip: [0.17, -0.19, -0.34], ads: [0, -0.115, -0.3], rot: [0, 0, 0.12], scale: 1.15, adsFov: 62, recoilBack: 0.035, recoilUp: 0.12 },
    tracer: 0xff7a2a,
    // HoldRifle raises the wand to eye level like a pistol; the spell stances point it at the ground.
    anim: { ready: 110, attack: 110, reload: null },
  },
  dagger: {
    id: 'dagger',
    slot: 4,
    mode: 'melee',
    item: 2092,
    model: { dir: 'dagger', file: 'knife_1h_dagger_a_01' },
    muzzle: [0.52, 0, 0],
    damage: 34,
    headMultiplier: 1.5,
    pellets: 1,
    interval: 0.45,
    magazine: 0,
    reserve: 0,
    reload: 0,
    range: 2.4,
    falloffStart: 3,
    minFactor: 1,
    spreadBase: 0,
    spreadMove: 0,
    spreadAir: 0,
    pelletSpread: 0,
    bloomPerShot: 0,
    bloomMax: 0,
    bloomRecover: 1,
    kick: 0.004,
    kickYaw: 1,
    speed: 1.1,
    draw: 0.3,
    holster: 0.15,
    heavy: { damage: 70, interval: 1.05, range: 2.0 },
    backstab: 2.5,
    view: { hip: [0.2, -0.2, -0.34], ads: null, rot: [0.35, 0, -0.5], scale: 0.9, adsFov: null, recoilBack: 0, recoilUp: 0 },
    tracer: 0,
    anim: { ready: 26, attack: 17, reload: null },
  },
}

export const LOADOUT: WeaponId[] = ['rifle', 'sniper', 'wand', 'dagger']

export async function loadWeaponModels(base: string, onProgress: (f: number) => void): Promise<Map<WeaponId, THREE.Group>> {
  const out = new Map<WeaponId, THREE.Group>()
  let done = 0
  await Promise.all(
    LOADOUT.map(async id => {
      const { dir, file } = WEAPONS[id].model
      const path = `${base}weapons/${dir}/`
      const mtl = await new MTLLoader().setPath(path).loadAsync(`${file}.mtl`)
      mtl.preload()
      const group = await new OBJLoader().setMaterials(mtl).setPath(path).loadAsync(`${file}.obj`)
      group.traverse(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshPhongMaterial[]
        for (const m of mats) {
          // Particle anchor quads from the item model, rendered by the client as glows.
          if (m.name.includes('glowball')) m.visible = false
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace
          m.shininess = 24
          m.side = THREE.DoubleSide
        }
        mesh.castShadow = true
      })
      out.set(id, group)
      onProgress(++done / LOADOUT.length)
    }),
  )
  return out
}

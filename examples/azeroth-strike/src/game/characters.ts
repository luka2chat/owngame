import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { LoadTracker } from '../engine/loader'
import { HEROES, heroKey, MOUNTS } from './heroes'
import type { Team } from './teams'
import { loadWeaponModels, WEAPONS, type WeaponId } from './weapons'

const BASE = './assets/'

/** WoW AnimationData ids exported with the character GLBs (tools/export-characters.cjs). */
export const ANIM = {
  stand: 0,
  death: 1,
  walk: 4,
  run: 5,
  shuffleLeft: 11,
  shuffleRight: 12,
  walkBack: 13,
  jump: 38,
  sheath: 89,
  /** Full-body sit used while riding. */
  mount: 91,
  /** ChannelCastOmni: assaulting a banner. */
  channel: 125,
} as const

type Attachment = { id: number; bone: number; position: [number, number, number] }
type HeroMeta = {
  scale: number
  eye: number
  head: number
  attachments: Attachment[]
  seat?: { bone: string; local: [number, number, number]; height: number }
}
type CharacterAsset = { scene: THREE.Group; clips: Map<number, THREE.AnimationClip>; meta: HeroMeta }
type MountAsset = CharacterAsset & { meta: HeroMeta & { seat: NonNullable<HeroMeta['seat']> } }

/** Upper body = SpineLow and everything parented to it (arms, head, weapon bones). */
const UPPER_ROOT = 'bone_SpineLow'

const HERO_KEYS = [...HEROES.alliance, ...HEROES.horde]
const MOUNT_KEYS = [MOUNTS.alliance, MOUNTS.horde]

export class CharacterLibrary {
  private heroes = new Map<string, CharacterAsset>()
  private mounts = new Map<string, MountAsset>()
  weapons = new Map<WeaponId, THREE.Group>()

  async load(tracker: LoadTracker): Promise<void> {
    const gltf = new GLTFLoader()
    const files = [...HERO_KEYS, ...MOUNT_KEYS]
    let parsed = 0
    const loadOne = async (name: string): Promise<CharacterAsset> => {
      const [buf, meta] = await Promise.all([tracker.fetch(`${BASE}heroes/${name}.glb`), tracker.json<HeroMeta>(`${BASE}heroes/${name}.json`)])
      // Some creature exports currently ship meshes with no material. three refuses those.
      const g = await gltf.parseAsync(withMaterial(buf), `${BASE}heroes/`)
      const clips = new Map<number, THREE.AnimationClip>()
      for (const clip of g.animations) {
        const id = Number(/ID (\d+)/.exec(clip.name)?.[1] ?? -1)
        if (id >= 0) clips.set(id, clip)
      }
      prepare(g.scene)
      tracker.set('load.characters', 'characters', ++parsed / files.length)
      return { scene: g.scene, clips, meta }
    }
    await Promise.all([
      ...HERO_KEYS.map(async name => this.heroes.set(name, await loadOne(name))),
      ...MOUNT_KEYS.map(async name => this.mounts.set(name, (await loadOne(name)) as MountAsset)),
      loadWeaponModels(BASE, f => tracker.set('load.weapons', 'weapons', f)).then(m => (this.weapons = m)),
    ])
  }

  /** `slot` is the bot's index on its team, the same index `botName` uses. */
  create(team: Team, slot: number): Avatar {
    const asset = this.heroes.get(heroKey(team, slot))
    if (!asset) throw new Error(`hero ${heroKey(team, slot)} was not loaded`)
    return new Avatar(asset, this.weapons, this.mounts.get(MOUNTS[team])!)
  }
}

/** Give material-less primitives one plain material so GLTFLoader can parse the file. */
function withMaterial(buf: ArrayBuffer): ArrayBuffer {
  if (buf.byteLength < 28) return buf
  const view = new DataView(buf)
  if (view.getUint32(0, false) !== 0x46546c67) return buf
  const jsonLen = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as {
    materials?: unknown[]
    meshes?: { primitives: { material?: number }[] }[]
  }
  const meshes = json.meshes ?? []
  const broken = meshes.some(mesh => mesh.primitives.some(prim => json.materials?.[prim.material ?? -1] === undefined))
  if (!broken) return buf
  json.materials = [{ pbrMetallicRoughness: { baseColorFactor: [0.75, 0.62, 0.48, 1], metallicFactor: 0, roughnessFactor: 0.85 } }]
  for (const mesh of meshes) for (const prim of mesh.primitives) prim.material = 0
  const encoded = new TextEncoder().encode(JSON.stringify(json))
  const padded = (encoded.length + 3) & ~3
  const jsonChunk = new Uint8Array(padded)
  jsonChunk.set(encoded)
  jsonChunk.fill(0x20, encoded.length)
  const rest = new Uint8Array(buf, 20 + jsonLen)
  const out = new Uint8Array(12 + 8 + padded + rest.length)
  const header = new DataView(out.buffer)
  header.setUint32(0, 0x46546c67, false)
  header.setUint32(4, 2, false)
  header.setUint32(8, out.length, false)
  header.setUint32(12, padded, true)
  header.setUint32(16, 0x4e4f534a, true)
  out.set(jsonChunk, 20)
  out.set(rest, 20 + padded)
  return out.buffer
}

/** Bind-pose sphere so three does not CPU-skin every vertex on the first frame. */
function prepare(root: THREE.Object3D): void {
  const skinned: THREE.SkinnedMesh[] = []
  root.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh)
  })
  const body = new THREE.Box3()
  for (const mesh of skinned) {
    mesh.geometry.computeBoundingBox()
    body.union(mesh.geometry.boundingBox!)
  }
  const sphere = body.getBoundingSphere(new THREE.Sphere())
  sphere.radius = Math.max(sphere.radius * 1.6, 2.2)
    for (const mesh of skinned) {
      mesh.castShadow = true
      mesh.boundingSphere = sphere.clone()
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.metalness = 0
          mat.roughness = 0.9
        }
      }
    }
}

function filterClip(clip: THREE.AnimationClip, upper: Set<string>, keepUpper: boolean): THREE.AnimationClip {
  const tracks = clip.tracks.filter(t => upper.has(t.name.split('.')[0]) === keepUpper)
  return new THREE.AnimationClip(clip.name + (keepUpper ? '_upper' : '_lower'), clip.duration, tracks)
}

export type Locomotion = 'stand' | 'run' | 'back' | 'left' | 'right' | 'jump' | 'dead'

const MOUNT_CLIP: Record<Locomotion, number> = { stand: 0, run: 5, back: 13, left: 11, right: 12, jump: 38, dead: 0 }

/**
 * One animated WoW character holding its current weapon in the right hand. Legs play locomotion,
 * the upper body plays the weapon's ready/attack/reload clips, and swaps run the Sheath clip.
 */
export class Avatar {
  readonly root = new THREE.Group()
  readonly model: THREE.Object3D
  readonly mixer: THREE.AnimationMixer
  private lower = new Map<number, THREE.AnimationAction>()
  private upper = new Map<number, THREE.AnimationAction>()
  private full = new Map<number, THREE.AnimationAction>()
  private currentLower: THREE.AnimationAction | null = null
  private currentUpper: THREE.AnimationAction | null = null
  private state: Locomotion | null = null
  /** Seconds left of a one-shot upper-body clip (attack, reload, sheath) before returning to ready. */
  private upperTimer = 0
  readonly head: THREE.Object3D | null
  readonly muzzle = new THREE.Object3D()
  /** Standing eye / headshot height, and the saddle height once mounted. */
  readonly footEye: number
  readonly footHead: number
  readonly seatHeight: number
  mounted = false
  private readonly hand: THREE.Object3D | null
  private readonly handOffset = new THREE.Vector3()
  private readonly guns = new Map<WeaponId, THREE.Object3D>()
  private weapon: WeaponId = 'rifle'
  private readonly mountModel: THREE.Object3D | null
  private readonly mountMixer: THREE.AnimationMixer | null
  private readonly mountActions = new Map<number, THREE.AnimationAction>()
  private mountState: Locomotion | null = null
  private readonly seat: THREE.Object3D | null
  private readonly seatLocal = new THREE.Vector3()
  private riderAction: THREE.AnimationAction | null = null
  private channeling = false

  constructor(asset: CharacterAsset, weapons: Map<WeaponId, THREE.Group>, mount: MountAsset) {
    this.model = SkeletonUtils.clone(asset.scene)
    this.model.rotation.y = -Math.PI / 2
    this.model.scale.setScalar(asset.meta.scale || 1)
    this.root.add(this.model)
    this.footEye = asset.meta.eye
    this.footHead = asset.meta.head
    this.mixer = new THREE.AnimationMixer(this.model)
    this.mountModel = SkeletonUtils.clone(mount.scene)
    this.mountModel.rotation.y = -Math.PI / 2
    this.mountModel.visible = false
    this.root.add(this.mountModel)
    this.mountMixer = new THREE.AnimationMixer(this.mountModel)
    for (const [id, clip] of mount.clips) this.mountActions.set(id, this.mountMixer.clipAction(clip))
    this.seat = this.mountModel.getObjectByName(mount.meta.seat.bone) ?? null
    this.seatLocal.set(...mount.meta.seat.local)
    this.seatHeight = mount.meta.seat.height
    const upperNames = new Set<string>()
    this.model.getObjectByName(UPPER_ROOT)?.traverse(o => upperNames.add(o.name))
    for (const [id, clip] of asset.clips) {
      this.lower.set(id, this.mixer.clipAction(filterClip(clip, upperNames, false)))
      this.upper.set(id, this.mixer.clipAction(filterClip(clip, upperNames, true)))
      this.full.set(id, this.mixer.clipAction(clip))
    }
    let skinned: THREE.SkinnedMesh | null = null
    this.model.traverse(o => {
      if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh
    })
    const bones = (skinned as THREE.SkinnedMesh | null)?.skeleton.bones ?? []
    const hand = asset.meta.attachments.find(a => a.id === 1)
    this.hand = hand ? (bones[hand.bone] ?? null) : null
    if (hand) this.handOffset.set(...hand.position)
    for (const [id, group] of weapons) {
      const gun = group.clone()
      gun.position.copy(this.handOffset)
      gun.visible = false
      this.hand?.add(gun)
      this.guns.set(id, gun)
    }
    this.head = this.model.getObjectByName('bone_Head') ?? null
    this.setWeapon('rifle', false)
    this.setState('stand')
  }

  get weaponId(): WeaponId {
    return this.weapon
  }

  /** Standing pose: the weapon's ready stance, or the channel while assaulting a banner. */
  private get idle(): number {
    return this.channeling && this.upper.has(ANIM.channel) ? ANIM.channel : WEAPONS[this.weapon].anim.ready
  }

  /** Assaulting a banner: hands free for the channel, the gun comes back when it ends. */
  setChannel(on: boolean): void {
    if (on === this.channeling) return
    this.channeling = on
    for (const [gid, gun] of this.guns) gun.visible = gid === this.weapon && !on
    if (this.state === 'dead' || this.mounted) return
    if (this.upperTimer <= 0) this.currentUpper = this.play(this.upper, this.idle, this.currentUpper, 0.25)
    if (this.state === 'stand') this.currentLower = this.play(this.lower, this.idle, this.currentLower, 0.25)
  }

  /** Camera height. Sitting drops the head to about two thirds of standing height above the saddle. */
  get eyeHeight(): number {
    return this.mounted ? this.seatHeight + this.footEye * 0.62 : this.footEye
  }

  get headHeight(): number {
    return this.mounted ? this.seatHeight + this.footHead * 0.62 : this.footHead
  }

  setMounted(on: boolean): void {
    if (on === this.mounted || !this.seat) return
    this.mounted = on
    if (this.mountModel) this.mountModel.visible = on
    if (on) {
      this.currentLower?.stop()
      this.currentUpper?.stop()
      this.currentLower = this.currentUpper = null
      this.upperTimer = 0
      this.model.rotation.y = 0
      this.model.position.copy(this.seatLocal)
      this.seat.add(this.model)
      const ride = this.full.get(ANIM.mount) ?? this.full.get(ANIM.stand) ?? null
      if (ride) {
        ride.reset().setLoop(THREE.LoopRepeat, Infinity).play()
        this.riderAction = ride
      }
      this.mountState = null
      this.driveMount('stand')
      return
    }
    this.riderAction?.stop()
    this.riderAction = null
    this.mountMixer?.stopAllAction()
    this.mountState = null
    this.seat.remove(this.model)
    this.model.rotation.y = -Math.PI / 2
    this.model.position.set(0, 0, 0)
    this.root.add(this.model)
    this.state = null
  }

  private driveMount(state: Locomotion): void {
    if (state === this.mountState) return
    this.mountState = state
    const wanted = MOUNT_CLIP[state]
    const id = this.mountActions.has(wanted) ? wanted : this.mountActions.has(4) ? 4 : 0
    const action = this.mountActions.get(id)
    if (!action) return
    for (const other of this.mountActions.values()) if (other !== action) other.fadeOut(0.15)
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play()
  }

  /** Show `id` in the hand; `animate` plays the sheath/draw clip on the upper body. */
  setWeapon(id: WeaponId, animate: boolean): void {
    this.weapon = id
    for (const [gid, gun] of this.guns) gun.visible = gid === id
    const gun = this.guns.get(id)
    if (gun) {
      this.muzzle.removeFromParent()
      this.muzzle.position.set(...WEAPONS[id].muzzle)
      gun.add(this.muzzle)
    }
    if (this.state === 'dead' || this.mounted) return
    if (animate && this.upper.has(ANIM.sheath)) {
      this.currentUpper = this.play(this.upper, ANIM.sheath, this.currentUpper, 0.1, true)
      this.upperTimer = Math.min(0.5, this.upper.get(ANIM.sheath)!.getClip().duration)
    } else {
      this.upperTimer = 0
      this.currentUpper = this.play(this.upper, WEAPONS[id].anim.ready, this.currentUpper, 0.15)
    }
    if (this.state === 'stand') this.currentLower = this.play(this.lower, WEAPONS[id].anim.ready, this.currentLower)
  }

  private play(map: Map<number, THREE.AnimationAction>, id: number, prev: THREE.AnimationAction | null, fade = 0.15, once = false): THREE.AnimationAction | null {
    const action = map.get(id) ?? null
    if (!action) return prev
    if (action === prev && !once) return prev
    action.reset()
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    action.clampWhenFinished = once
    action.enabled = true
    action.setEffectiveWeight(1)
    if (prev && prev !== action) action.crossFadeFrom(prev, fade, false)
    action.play()
    return action
  }

  setState(state: Locomotion): void {
    if (this.mounted) {
      if (state !== 'dead') {
        this.driveMount(state)
        return
      }
      this.setMounted(false)
    }
    if (state === this.state) return
    const was = this.state
    this.state = state
    if (state === 'dead') {
      this.currentLower?.fadeOut(0.1)
      this.currentUpper?.fadeOut(0.1)
      this.currentLower = this.play(this.full, ANIM.death, null, 0.1, true)
      this.currentUpper = null
      return
    }
    if (was === 'dead') {
      this.mixer.stopAllAction()
      this.currentLower = this.currentUpper = null
      this.upperTimer = 0
    }
    const ready = WEAPONS[this.weapon].anim.ready
    const id = { stand: ready, run: ANIM.run, back: ANIM.walkBack, left: ANIM.shuffleLeft, right: ANIM.shuffleRight, jump: ANIM.jump }[state]
    this.currentLower = this.play(this.lower, id, this.currentLower)
    if (this.upperTimer <= 0) this.currentUpper = this.play(this.upper, ready, this.currentUpper)
  }

  fire(): void {
    if (this.state === 'dead' || this.mounted) return
    const w = WEAPONS[this.weapon]
    this.currentUpper = this.play(this.upper, w.anim.attack, this.currentUpper, 0.05, w.mode === 'melee' || w.mode === 'bolt')
    this.upperTimer = w.mode === 'melee' ? 0.45 : w.mode === 'bolt' ? 0.6 : 0.25
  }

  reload(): void {
    if (this.state === 'dead' || this.mounted) return
    const id = WEAPONS[this.weapon].anim.reload
    if (id === null || !this.upper.has(id)) return
    this.currentUpper = this.play(this.upper, id, this.currentUpper, 0.1, true)
    this.upperTimer = Math.min(WEAPONS[this.weapon].reload, this.upper.get(id)!.getClip().duration)
  }

  update(dt: number): void {
    if (this.upperTimer > 0) {
      this.upperTimer -= dt
      if (this.upperTimer <= 0 && this.state !== 'dead') this.currentUpper = this.play(this.upper, WEAPONS[this.weapon].anim.ready, this.currentUpper, 0.2)
    }
    this.mixer.update(dt)
    if (this.mounted) this.mountMixer?.update(dt)
  }
}

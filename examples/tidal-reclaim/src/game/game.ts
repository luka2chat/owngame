import { CHARGE_SECONDS, STATIONS, activateStation, newMission, stepMission, type Mission } from './tidal-mission'
import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import { translate } from '../engine/i18n'
import type { Input } from '../engine/input'
import { RAPIER, Physics } from '../engine/physics'
import type { Renderer } from '../engine/renderer'
import { Arena, type ColliderTag } from './arena'
import { Bot, type BrainContext, type ItemInfo, type Target } from './bots'
import type { CombatWorld, DamageInfo, DamageResult, DamageSource, Hit, ProjectileKind } from './combat'
import { BOT_ROSTER, CONFIG, WEAPONS, type BotKind, type WeaponId } from './config'
import { Effects } from './fx'
import { Hound } from './hound'
import type { Library } from './library'
import {
  awardStyle, decayStyle, hurtStyle, MAX_ALIVE, newStyle, perkEffects, RANK_MULT, RANKS, spawnOrder, WAVES, waveSize,
  type EnemyKind, type Perk, type PerkLevels, type StyleEvent, type StyleState,
} from './onslaught'
import { Player } from './player'
import { Pickups, Props } from './props'
import { wornPaint, type RobotLook } from './robot'
import { PlayerBody } from './playerbody'
import { computeScore, createMatch, leader, placement, recordShot, registerKill, splashDamage, standings, tick, type MatchState, type Medal } from './rules'
import type { Staged, StageId } from './stages'
import { tuning } from './tuning'
import { Arsenal, type HitKind } from './weapons'

export type Mode = 'attract' | 'countdown' | 'playing' | 'paused' | 'ended'
export type GameMode = 'onslaught' | 'deathmatch'

export type KillFeedEntry = { killer: string; victim: string; weapon: string; headshot: boolean; killerIsPlayer: boolean; victimIsPlayer: boolean; killerColor: string; victimColor: string }
export type StylePop = { label: string; points: number; rank: number; rankedUp: boolean }
export type WaveBanner = { title: string; subtitle: string; kind: 'intro' | 'clear' | 'boss' | 'phase' | 'victory' }
export type RunSummary = { mode: GameMode; won: boolean; wave: number; waves: number; score: number; kills: number; headshots: number; accuracy: number; bestRank: string; time: number; unranked: boolean }

export type GameEvents = {
  hitmarker(kind: HitKind, damage: number): void
  damage(angle: number, amount: number): void
  killfeed(e: KillFeedEntry): void
  medals(list: Medal[]): void
  message(text: string, tone?: 'info' | 'good' | 'warn'): void
  pickup(label: string, color: string): void
  died(killer: string, weapon: string): void
  respawned(): void
  countdown(n: number): void
  ended(match: MatchState, summary?: RunSummary): void
  style(p: StylePop): void
  wave(b: WaveBanner): void
  perks(offer: Perk[] | null): void
  overdrive(on: boolean): void
  shard(kind: ShardKind): void
  loading(text: string | null): void
  perkChosen?(i: number): void
}

export type HudState = {
  mission: Mission
  playerX: number
  playerZ: number
  playerYaw: number
  health: number
  maxHealth: number
  armor: number
  maxArmor: number
  /** Armor is actively recharging. */
  armorRegen: boolean
  /** 0..1 progress through the no-damage delay before recharge. */
  armorWait: number
  weapon: WeaponId
  weaponName: string
  mag: number
  magSize: number
  reserve: number
  owned: Record<WeaponId, boolean>
  spread: number
  ads: number
  reloading: number
  timeLeft: number
  kills: number
  fragLimit: number
  leaderName: string
  leaderKills: number
  place: number
  alive: boolean
  respawnIn: number
  streak: number
  sprinting: boolean
  lowAmmo: boolean
  protect: number
  // Onslaught
  gameMode: GameMode
  wave: number
  waves: number
  enemiesLeft: number
  nearbyThreats: {x:number;z:number}[]
  rank: number
  rankName: string
  rankFill: number
  mult: number
  score: number
  overdrive: number
  overdriveActive: number
  grenades: number
  grenadesUnlocked: boolean
  boss: { name: string; health: number; phase: number } | null
  sliding: boolean
  runTime: number
}

type Rocket = { pos: THREE.Vector3; vel: THREE.Vector3; owner: number; exclude: number; life: number; mesh: THREE.Group; loop?: { set(p: THREE.Vector3): void; stop(): void }; trail: number }
type Projectile = { pos: THREE.Vector3; vel: THREE.Vector3; owner: number; kind: ProjectileKind; life: number }
type Grenade = { pos: THREE.Vector3; vel: THREE.Vector3; fuse: number; mesh: THREE.Group; spin: THREE.Vector3; bounceCd: number }
export type ShardKind = 'health' | 'armor' | 'ammo'
type Shard = { kind: ShardKind; pos: THREE.Vector3; vel: THREE.Vector3; life: number; phase: number; grounded: boolean }
type PendingSpawn = { kind: EnemyKind; pos: THREE.Vector3; yaw: number; t: number }
type WavePhase = 'none' | 'loading' | 'intro' | 'fight' | 'clear' | 'perk' | 'next'

const SOURCE_LABEL: Record<DamageSource, string> = {
  rifle: 'M4', shotgun: 'M870', rocket: 'RPG-X', pulse: 'PULSE', scatter: 'SCATTER', barrel: 'BARREL', fall: 'FALL',
  grenade: 'FRAG', plasma: 'PLASMA', cannon: 'CANNON', minigun: 'MINIGUN', slam: 'SLAM', kamikaze: 'KAMIKAZE',
}
const SHARD_COLOR: Record<ShardKind, [number, number, number]> = { health: [0.4, 3.2, 0.9], armor: [0.5, 1.8, 4], ammo: [4, 2.6, 0.5] }
const PROJ = {
  plasma: { speed: 30, damage: 13, radius: 1.4, color: [1.2, 3.4, 6, 1] as [number, number, number, number], size: 0.14 },
  cannon: { speed: 34, damage: 30, radius: 4, color: [6, 2.6, 0.8, 1] as [number, number, number, number], size: 0.3 },
}
const ENEMY_NAME: Record<string, string> = { scrapper: 'WOLF', breacher: 'BOAR', juggernaut: 'EXO', titan: 'THE WARDEN', hornet: 'HOUND' }
const POOL = { scrapper: 10, juggernaut: 2, titan: 1, hornet: 8 }
/** Every third wave rifleman slot is a shotgun Breacher. */
const BREACHER_EVERY = 3
const WAVE_ID0 = 30
const KIND_LOOK: Record<BotKind, RobotLook> = { striker: 'operator', warden: 'breacher', scrapper: 'operator', breacher: 'breacher', juggernaut: 'exo', titan: 'warden' }
/** Sentinel robots join the Scrapper rotation once stage 2 is in. */
const SENTINEL_SCRAPPERS = 4

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const tmp3 = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

let rocketTemplate: THREE.Group | undefined
function rocketMesh(): THREE.Group {
  rocketTemplate ??= buildRocketMesh()
  return rocketTemplate.clone()
}
function buildRocketMesh(): THREE.Group {
  const g = new THREE.Group()
  const olive = wornPaint('#4d5438', { chip: 0.4, grime: 0.4, scale: 30 }, { metalness: 0.35, roughness: 0.55 })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 12), olive)
  body.rotation.x = Math.PI / 2
  g.add(body)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 12), olive)
  nose.rotation.x = -Math.PI / 2
  nose.position.z = -0.29
  g.add(nose)
  for (let i = 0; i < 4; i += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.07, 0.09), olive)
    fin.position.set(0, 0, 0.17)
    fin.rotation.z = (i * Math.PI) / 2
    fin.translateY(0.07)
    g.add(fin)
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.4, 0.8), toneMapped: false }))
  glow.position.z = 0.24
  g.add(glow)
  return g
}

let grenadeTemplate: THREE.Group | undefined
let grenadeScan: THREE.Object3D | undefined
function grenadeMesh(): THREE.Group {
  grenadeTemplate ??= grenadeScan ? buildTripoGrenade(grenadeScan) : buildGrenadeMesh()
  return grenadeTemplate.clone()
}
/** Tripo M67 scan scaled to 11 cm, centred, plus the armed-fuse LED the game blinks. */
function buildTripoGrenade(scan: THREE.Object3D): THREE.Group {
  const g = new THREE.Group()
  const m = scan.clone(true)
  const box = new THREE.Box3().setFromObject(m)
  const s = 0.11 / box.getSize(new THREE.Vector3()).y
  m.scale.setScalar(s)
  m.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-s))
  g.add(m)
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.2), toneMapped: false }))
  led.position.set(0, 0.045, 0.02)
  led.name = 'led'
  g.add(led)
  g.traverse(o => (o.castShadow = true))
  return g
}
function buildGrenadeMesh(): THREE.Group {
  const g = new THREE.Group()
  const olive = wornPaint('#3f4a2e', { chip: 0.5, grime: 0.5, scale: 40 }, { metalness: 0.3, roughness: 0.6 })
  const steel = new THREE.MeshStandardMaterial({ color: '#8a8c8f', metalness: 0.8, roughness: 0.35 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 12), olive)
  body.scale.y = 1.25
  g.add(body)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.03, 10), steel)
  top.position.y = 0.058
  g.add(top)
  const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.006), steel)
  spoon.position.set(0.028, 0.03, 0)
  spoon.rotation.z = -0.25
  g.add(spoon)
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.2), toneMapped: false }))
  led.position.set(0, 0.04, 0.036)
  led.name = 'led'
  g.add(led)
  g.traverse(o => (o.castShadow = true))
  return g
}

function launcherPickup(): THREE.Group {
  const g = new THREE.Group()
  const olive = wornPaint('#4d5438', { chip: 0.5, grime: 0.5, scale: 12 }, { metalness: 0.3, roughness: 0.58 })
  const metal = new THREE.MeshStandardMaterial({ color: '#2d2f33', metalness: 0.6, roughness: 0.45 })
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 20), olive)
  tube.rotation.z = Math.PI / 2
  g.add(tube)
  for (const x of [-0.6, 0.62]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 20), metal)
    ring.rotation.z = Math.PI / 2
    ring.position.x = x
    g.add(ring)
  }
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.06), metal)
  grip.position.set(0.1, -0.18, 0)
  g.add(grip)
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.07), metal)
  sight.position.set(-0.05, 0.14, 0.06)
  g.add(sight)
  return g
}

export type StageGate = { isReady(s: StageId): boolean; ensure(s: StageId): Promise<void>; onStageReady?: (s: StageId) => void }

/** Deathmatch roster slots (WRAITH, NOVA) played by Sentinel robots, and their bot ids (clear of the DM 1..7 and wave ranges). */
const DM_SENTINEL_SLOTS = [2, 4]
const DM_SENTINEL_ID0 = 900

export class Game implements CombatWorld {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly physics: Physics
  readonly arena: Arena
  readonly fx: Effects
  readonly player: Player
  readonly arsenal: Arsenal
  /** Every robot (deathmatch roster + Onslaught pool). */
  readonly bots: Bot[] = []
  private readonly dmBots: Bot[] = []
  private readonly waveBots: Record<'scrapper' | 'juggernaut' | 'titan', Bot[]> = { scrapper: [], juggernaut: [], titan: [] }
  private readonly botById = new Map<number, Bot>()
  readonly hornets: Hound[] = []
  readonly props: Props
  readonly pickups: Pickups
  private readonly tags: Map<number, ColliderTag>
  private rockets: Rocket[] = []
  private projectiles: Projectile[] = []
  private grenadesLive: Grenade[] = []
  private shards: Shard[] = []
  private readonly shardMesh: THREE.InstancedMesh
  private readonly rocketLight = new THREE.PointLight('#ff8a3a', 0, 12, 1.6)
  private readonly projLight = new THREE.PointLight('#5cc8ff', 0, 9, 1.6)
  mode: Mode = 'attract'
  mission = newMission()
  private reinforcementT = 18
  private missionLoad = false
  private missionSession = 0
  gameMode: GameMode = 'onslaught'
  match: MatchState = createMatch(BOT_ROSTER.slice(0, CONFIG.bots.count).map(b => b.name))
  time = 0
  private countdownT = 0
  private lastCount = 0
  private trauma = 0
  private slowmo = 1
  private slowmoT = 0
  private hitstop = 0
  private endT = 0
  private respawnT = 0
  private hurtT = 0
  private footDist = 0
  private botFoot = new Map<number, number>()
  private heartbeatT = 0
  private lowAmmoWarned = false
  private killerId = -1
  private deathYaw = 0
  private deathPitch = 0
  private attractT = 0
  private strafeTilt = 0
  private slideTilt = 0
  private lastLook = { x: 0, y: 0 }
  private readonly hotspots: THREE.Vector3[]
  reducedMotion = false
  fovSetting = 100
  private readonly eyePos = new THREE.Vector3()
  // Onslaught state.
  private wave = 0
  private wavePhase: WavePhase = 'none'
  private phaseT = 0
  private spawnQueue: EnemyKind[] = []
  private spawnT = 0
  private pending: PendingSpawn[] = []
  style: StyleState = newStyle()
  private perks: PerkLevels = {}
  private perkOffer: Perk[] | null = null
  private grenades = 2
  private grenadeCd = 0
  private overdriveT = 0
  private runTime = 0
  private kills = 0
  private headshots = 0
  private shots = 0
  private hits = 0
  private lastKillT = -9
  private lastKillWeapons: string[] = []
  private weakPopT = 0
  private boss: Bot | null = null
  private stageGate: StageGate
  private rocketUpgraded = false

  constructor(
    readonly renderer: Renderer,
    readonly input: Input,
    readonly audio: Audio,
    lib: Library,
    private readonly staged: Staged,
    gate: StageGate,
    private readonly events: GameEvents,
  ) {
    this.stageGate = gate
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 600)
    this.scene.add(this.camera)
    // Soft warm key from the player's view: keeps nearby enemies readable against the backlit sky
    // (a common FPS readability trick). Short range, so it never flattens the arena lighting.
    const fill = new THREE.PointLight('#ffd6b0', 5, 16, 2)
    fill.position.set(0.3, 0.4, 0.2)
    this.camera.add(fill)
    this.physics = new Physics(-22)
    const pmrem = new THREE.PMREMGenerator(renderer.gl)
    this.scene.environment = pmrem.fromEquirectangular(lib.envHdr).texture
    pmrem.dispose()
    this.arena = new Arena(this.scene, this.physics, lib)
    this.arena.attachCamera(this.camera, renderer.particleDensity)
    if (staged.sts) this.arena.attachSts(staged.sts)
    this.tags = this.arena.tags
    this.arena.sun.shadow.mapSize.set(renderer.shadowMapSize, renderer.shadowMapSize)
    grenadeScan = lib.models.frag_grenade.scene
    this.fx = new Effects((x, z, y) => this.arena.groundAt(x, z, y), this.scene.fog as THREE.FogExp2, staged.fx)
    this.renderer.setHalfResSmoke(this.fx.smokeMesh)
    // Every streamed stage can add materials (drones, heavies, the upgraded launcher, V3 characters):
    // compile them as soon as they land so the first spawn or shot never builds a shader mid-fight.
    const prevReady = gate.onStageReady
    gate.onStageReady = s => {
      prevReady?.(s)
      if (this.staged.sts) this.arena.attachSts(this.staged.sts)
      // Later enemy types arrive with their stage; build their pools as soon as the assets land.
      if (this.waveBots.scrapper.length) this.ensureStagePools()
      // Deathmatch started before the Sentinel rig landed: swap the robots in while the countdown runs.
      if (this.gameMode === 'deathmatch' && this.mode === 'countdown' && !this.dmRobots && this.staged.chars.sentinel) {
        this.ensureDmSentinels()
        for (const i of DM_SENTINEL_SLOTS) {
          const b = this.dmBots[i]
          if (!b || i >= CONFIG.bots.count) continue
          const bs = this.chooseSpawn(b.id)
          b.spawn(bs.pos, bs.yaw)
        }
      }
      window.clearTimeout(this.prewarmTimer)
      this.prewarmTimer = window.setTimeout(() => this.prewarm(), 50)
    }
    this.fx.density = renderer.particleDensity
    this.fx.onShellBounce = pos => {
      if (pos.distanceToSquared(this.eyePos) < 36) this.audio.play('shell_casing', { volume: 0.35, pos, jitter: 0.2 })
    }
    this.scene.add(this.fx.group)
    this.scene.add(this.rocketLight, this.projLight)
    this.player = new Player(this.physics)
    this.tags.set(this.player.collider.handle, { kind: 'player' })
    this.arsenal = new Arsenal(
      this,
      this.player,
      this.camera,
      {
        hit: (kind, damage) => this.events.hitmarker(kind, damage),
        fired: (_id, shake) => {
          this.trauma = Math.min(1, this.trauma + shake)
        },
        message: key => this.events.message(translate(key), 'warn'),
      },
      () => this.staged.vm,
    )
    this.arsenal.isHead = (id, point) => this.botById.get(id)?.isHead(point) ?? false
    this.arsenal.weakMult = (id, point) => {
      const b = this.botById.get(id)
      const m = b ? b.weakMultiplier(point) : 1
      if (m > 1 && this.weakPopT <= 0 && this.gameMode === 'onslaught') {
        this.weakPopT = 0.6
        this.awardStyle('weakpoint')
      }
      return m
    }
    BOT_ROSTER.forEach((r, i) => {
      const bot = this.makeBot(i + 1, r.name, r.kind, r.color, r.visor)
      this.dmBots.push(bot)
    })
    this.props = new Props(this.scene, this.physics, this.tags, this.arena.nav, lib, this.arena.props)
    this.pickups = new Pickups(this.scene, lib, this.arena.pickups, launcherPickup())
    this.hotspots = [...this.arena.spawns, ...this.arena.pickups.map(p => p.pos), new THREE.Vector3(0, 0, 0), new THREE.Vector3(-14, 0, 0), new THREE.Vector3(14, 0, 0)]
    // Rift shards: instanced crystals with HDR instance colours (bloom picks them up).
    const shardGeo = new THREE.OctahedronGeometry(0.11, 0)
    shardGeo.scale(0.7, 1.25, 0.7)
    this.shardMesh = new THREE.InstancedMesh(shardGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), 80)
    this.shardMesh.count = 0
    this.shardMesh.frustumCulled = false
    this.shardMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(80 * 3), 3)
    this.scene.add(this.shardMesh)
    this.physics.world.step()
    this.enterAttract()
  }

  private makeBot(id: number, name: string, kind: BotKind, color: string, visor: string, lookOverride?: RobotLook): Bot {
    const look = lookOverride ?? KIND_LOOK[kind]
    const bot = new Bot(id, name, kind, color, visor, this.physics, this.arena.nav, this, this.staged.chars[look]!, this.staged.vm, lookOverride)
    this.tags.set(bot.collider.handle, { kind: 'bot', id })
    this.scene.add(bot.parts.root)
    this.bots.push(bot)
    this.botById.set(id, bot)
    return bot
  }

  /** Build the Onslaught rifle pool once (after stage 1); later enemy pools follow their stages. */
  private ensurePool(): void {
    if (this.waveBots.scrapper.length) return
    let id = WAVE_ID0
    for (let i = 0; i < POOL.scrapper; i += 1) {
      const breacher = i % BREACHER_EVERY === BREACHER_EVERY - 1
      const b = breacher ? this.makeBot(id++, 'BOAR', 'breacher', '#3a3a3a', '#ff5a2a') : this.makeBot(id++, 'WOLF', 'scrapper', '#3a3a3a', '#ff4a2a')
      b.wave = true
      this.waveBots.scrapper.push(b)
    }
    this.nextWaveId = id
    this.ensureStagePools()
    this.prewarm()
  }
  private nextWaveId = WAVE_ID0
  private body?: PlayerBody
  private readonly bodyFeet = new THREE.Vector3()
  private sentinelsAdded = false
  private dmRobots = false
  /** Deathmatch: once the Sentinel rig is streamed in (stage 2), two of the five rivals become humanoid robots. */
  private ensureDmSentinels(): void {
    if (this.dmRobots || !this.staged.chars.sentinel) return
    this.dmRobots = true
    for (const i of DM_SENTINEL_SLOTS) {
      const old = this.dmBots[i]
      if (!old) continue
      const r = BOT_ROSTER[i]
      old.hide()
      const b = this.makeBot(DM_SENTINEL_ID0 + i, r.name, r.kind, '#3a3d42', r.visor, 'sentinel')
      b.hide()
      this.dmBots[i] = b
    }
  }
  /** Hounds + Sentinel robots (stage 2), Exo heavies (stage 3) and the Warden (stage 4), each built once its assets are in. */
  private ensureStagePools(): void {
    if (!this.hornets.length && this.staged.hound) {
      for (let i = 0; i < POOL.hornet; i += 1) {
        const h = new Hound(i, this.physics, this, this.staged.hound)
        this.tags.set(h.collider.handle, { kind: 'drone', id: i })
        this.scene.add(h.root)
        this.hornets.push(h)
      }
    }
    if (!this.sentinelsAdded && this.staged.chars.sentinel && this.waveBots.scrapper.length) {
      this.sentinelsAdded = true
      for (let i = 0; i < SENTINEL_SCRAPPERS; i += 1) {
        const b = this.makeBot(this.nextWaveId++, 'SENTINEL', 'scrapper', '#3a3d42', '#ff9a2e', 'sentinel')
        b.wave = true
        // Interleave so free-slot picks alternate masked operators and robots.
        this.waveBots.scrapper.splice(Math.min(this.waveBots.scrapper.length, 1 + i * 3), 0, b)
      }
    }
    if (!this.waveBots.juggernaut.length && this.staged.chars.exo) {
      for (let i = 0; i < POOL.juggernaut; i += 1) {
        const b = this.makeBot(this.nextWaveId++, 'EXO', 'juggernaut', '#3a3d42', '#ff9a2e')
        b.wave = true
        this.waveBots.juggernaut.push(b)
      }
    }
    if (!this.waveBots.titan.length && this.staged.chars.warden) {
      const t = this.makeBot(this.nextWaveId++, 'THE WARDEN', 'titan', '#3a3d42', '#ff3a1a')
      t.wave = true
      this.waveBots.titan.push(t)
    }
  }

  private prewarmTimer = 0
  /**
   * Compile every material in the scene, hidden ones included (three's compile walks invisible
   * objects: pooled bots and drones, inactive viewmodels, pickups, gibs), plus lazily created
   * projectiles. compileAsync links in parallel where KHR_parallel_shader_compile exists instead of
   * blocking the frame. Cheap to repeat: already-built programs are cache hits.
   */
  private prewarm(): void {
    const temps = [rocketMesh(), grenadeMesh()]
    for (const t of temps) {
      t.visible = false
      this.scene.add(t)
    }
    try {
      this.renderer.gl.compileAsync(this.scene, this.camera).catch(() => {})
    } catch {
      /* compile is an optimisation only */
    }
    for (const t of temps) this.scene.remove(t)
  }

  // ─── CombatWorld ──────────────────────────────────────────────────────
  get onslaught(): boolean {
    return this.gameMode === 'onslaught' && this.mode !== 'attract'
  }

  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, excludeHandle?: number, worldOnly = false): Hit | null {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z })
    const hit = this.physics.world.castRayAndGetNormal(ray, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, c => {
      if (c.handle === excludeHandle) return false
      const t = this.tags.get(c.handle)
      if (worldOnly) return t?.kind === 'world'
      if (t?.kind === 'bot' && !this.botById.get(t.id)?.alive) return false
      if (t?.kind === 'drone' && !this.hornets[t.id]?.alive) return false
      if (t?.kind === 'player' && !this.player.alive) return false
      return true
    })
    if (!hit) return null
    const d = hit.timeOfImpact
    return {
      point: new THREE.Vector3(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: d,
      tag: this.tags.get(hit.collider.handle),
      colliderHandle: hit.collider.handle,
    }
  }

  lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dir = tmp.subVectors(b, a)
    const len = dir.length()
    if (len < 1e-3) return true
    dir.divideScalar(len)
    const ray = new RAPIER.Ray({ x: a.x, y: a.y, z: a.z }, { x: dir.x, y: dir.y, z: dir.z })
    const hit = this.physics.world.castRay(ray, len, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, c => this.tags.get(c.handle)?.kind === 'world')
    return !hit
  }

  groundAt(x: number, z: number, fromY: number): number {
    return this.arena.groundAt(x, z, fromY)
  }

  noise(pos: THREE.Vector3, source: number, radius: number): void {
    for (const b of this.bots) if (b.alive && b.id !== source && b.pos.distanceTo(pos) < radius) b.hear(pos, source)
  }

  private get live(): boolean {
    return this.mode === 'playing' || this.mode === 'attract'
  }

  isHuman(target: number): boolean {
    return this.botById.get(target)?.parts.human ?? false
  }
  private nameOf(id: number): string {
    if (id === 0) return 'YOU'
    if (id <= -100) return 'HOUND'
    if (id > 0) return this.botById.get(id)?.name ?? '?'
    return 'WORLD'
  }
  private colorOf(id: number): string {
    if (id === 0) return '#ffffff'
    if (id <= -100) return '#3fb8ff'
    return id > 0 ? (this.botById.get(id)?.visor ?? '#ccc') : '#ccc'
  }

  damage(target: number, info: DamageInfo): DamageResult {
    if (!this.live) return { dealt: 0, killed: false, armor: false }
    if (target === 0) {
      if (this.mode !== 'playing' || !this.player.alive) return { dealt: 0, killed: false, armor: false }
      const hadArmor = this.player.armor > 0
      let amount = info.attacker === 0 ? info.amount * 0.5 : info.amount
      if (this.onslaught && info.attacker !== 0) amount *= 0.85
      const r = this.player.damage(amount)
      if (r.dealt <= 0) return { dealt: 0, killed: false, armor: false }
      const dx = info.from.x - this.player.position.x
      const dz = info.from.z - this.player.position.z
      const worldAngle = Math.atan2(-dx, -dz)
      this.events.damage(worldAngle - this.player.yaw, r.dealt)
      this.renderer.fx.damage = Math.min(1, this.renderer.fx.damage + r.dealt / 40)
      this.trauma = Math.min(1, this.trauma + r.dealt / 90)
      this.arsenal.punch.pitch += 0.012 * Math.min(2, r.dealt / 10)
      this.arsenal.punch.roll += (Math.random() - 0.5) * 0.04
      if (this.hurtT <= 0) {
        this.audio.play('player_hurt', { volume: 0.75 })
        this.hurtT = 0.45
      }
      if (hadArmor && this.player.armor <= 0) {
        this.audio.play('armor_break', { volume: 0.8 })
        this.events.message(translate('msg.armorBroken'), 'warn')
      } else if (hadArmor) this.audio.cue('armorHit', 0.6)
      if (this.onslaught && r.dealt >= 8) this.style = hurtStyle(this.style)
      const killed = this.player.health <= 0
      if (killed) this.playerDied(info)
      return { dealt: r.dealt, killed, armor: this.player.armor > 0 }
    }
    const bot = this.botById.get(target)
    if (!bot || !bot.alive) return { dealt: 0, killed: false, armor: false }
    if (info.attacker === 0) info = { ...info, amount: info.amount * CONFIG.player.damageScale }
    const r = bot.takeDamage(info)
    if (info.attacker === 0 && this.mode === 'playing' && !this.onslaught) this.match = recordShot(this.match, 0, 0, r.dealt)
    if (r.killed) this.botDied(bot, info)
    return r
  }

  damageDrone(id: number, info: DamageInfo): DamageResult {
    const h = this.hornets[id]
    if (!h || !h.alive || !this.live) return { dealt: 0, killed: false, armor: false }
    if (info.attacker === 0) info = { ...info, amount: info.amount * CONFIG.player.damageScale }
    const r = h.takeDamage(info)
    if (r.killed) this.enemyKilled(h.pos.clone(), 'hornet', info, 1)
    return r
  }

  damageProp(index: number, info: DamageInfo): void {
    this.props.damage(index, info, this)
  }

  explode(pos: THREE.Vector3, radius: number, damage: number, attacker: number, source: DamageSource, normal?: THREE.Vector3): void {
    const scale = radius / 6
    this.fx.explosion(pos, scale, normal ?? new THREE.Vector3(0, 1, 0))
    this.fx.debrisBurst(pos, 14 * scale, 8)
    this.audio.play('explosion', { volume: 1.25 * Math.min(1, 0.5 + scale), pos, jitter: 0.08, ref: 7 })
    const d = pos.distanceTo(this.eyePos)
    if (this.mode === 'playing' || this.mode === 'attract') {
      this.trauma = Math.min(1, this.trauma + Math.max(0, 1 - d / 28) * 0.9 * Math.min(1, scale * 1.4))
      if (d < radius * 1.7 && this.mode === 'playing') {
        this.audio.deafen(Math.min(1, 1.2 - d / (radius * 1.7)))
        this.renderer.fx.flash = Math.max(this.renderer.fx.flash, 0.35 * (1 - d / (radius * 1.7)))
      }
    }
    const hitOne = (id: number, feet: THREE.Vector3, h: number, heavy: boolean) => {
      const center = tmp2.copy(feet).setY(feet.y + h)
      const dist = Math.max(0, center.distanceTo(pos) - (heavy ? h * 0.5 : 0))
      if (dist > radius + 0.5) return
      if (dist > 1.5 && !this.lineOfSight(pos, center)) return
      const dmg = splashDamage(damage, radius + 0.5, dist)
      if (dmg <= 0) return
      this.damage(id, { attacker, amount: dmg, source, from: pos.clone(), point: center.clone(), splash: true })
      if (id === 0 && this.player.alive) {
        const push = center.clone().sub(pos).normalize().multiplyScalar(dmg * 0.14 + 2)
        push.y = Math.max(push.y, 0) + 3 + dmg * 0.05
        this.player.impulse(push)
      }
    }
    if (this.player.alive && this.mode === 'playing') hitOne(0, this.player.position, 0.9, false)
    const friendly = this.onslaught && attacker !== 0 && attacker !== -1
    for (const b of this.bots) if (b.alive && !(friendly && b.wave)) hitOne(b.id, b.pos, 0.9 * b.scale, b.heavy)
    for (const h of this.hornets) {
      if (!h.alive || friendly) continue
      const dist = h.pos.distanceTo(pos)
      if (dist < radius + 0.5) this.damageDrone(h.id, { attacker, amount: splashDamage(damage, radius + 0.5, dist), source, from: pos.clone(), splash: true })
    }
    this.props.list.forEach((p, i) => {
      if (!p.alive) return
      const dist = p.spot.pos.distanceTo(pos)
      if (dist < radius * 0.9) this.props.damage(i, { attacker, amount: 200, source, from: pos.clone() }, this)
    })
  }

  fireRocket(owner: number, origin: THREE.Vector3, dir: THREE.Vector3, excludeHandle: number): void {
    const mesh = rocketMesh()
    mesh.position.copy(origin)
    mesh.lookAt(origin.clone().add(dir))
    mesh.rotateY(Math.PI)
    this.scene.add(mesh)
    const speed = WEAPONS.rocket.projectileSpeed ?? 44
    this.rockets.push({ pos: origin.clone(), vel: dir.clone().multiplyScalar(owner === 0 ? speed : speed * 0.62), owner, exclude: excludeHandle, life: 5, mesh, loop: this.audio.loop('rocket_loop', 0.5, origin), trail: 0 })
  }

  fireProjectile(owner: number, origin: THREE.Vector3, dir: THREE.Vector3, kind: ProjectileKind): void {
    this.projectiles.push({ pos: origin.clone(), vel: dir.clone().multiplyScalar(PROJ[kind].speed), owner, kind, life: 4 })
  }

  bossPhase(phase: number, at: THREE.Vector3): void {
    this.slowmoT = 1.3
    this.trauma = Math.min(1, this.trauma + 0.6)
    this.audio.play('boss_roar', { volume: 1.2, pos: at, ref: 12 })
    this.fx.slamWave(at, 8)
    this.events.wave(phase === 2
      ? { title: translate('wave.phase2'), subtitle: translate('wave.phase2Sub'), kind: 'phase' }
      : { title: translate('wave.phase3'), subtitle: translate('wave.phase3Sub'), kind: 'phase' })
  }

  bossSlam(at: THREE.Vector3, radius: number, damage: number, attacker: number): void {
    this.fx.slamWave(at, radius)
    this.audio.play('boss_slam', { volume: 1.3, pos: at, ref: 10 })
    const d = this.player.position.distanceTo(at)
    this.trauma = Math.min(1, this.trauma + Math.max(0, 1 - d / 30))
    if (this.player.alive && this.mode === 'playing' && d < radius && this.player.grounded) {
      const dmg = damage * (1 - d / radius) + 8
      this.damage(0, { attacker, amount: dmg, source: 'slam', from: at.clone(), splash: true })
      const push = this.player.position.clone().sub(at).setY(0).normalize().multiplyScalar(9)
      push.y = 5
      this.player.impulse(push)
    }
  }

  summonDrones(at: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const h = this.hornets.find(x => !x.alive && !x.falling)
      if (!h) return
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 2, (Math.random() - 0.5) * 6))
      this.fx.spawnPortal(p, 0.6)
      h.spawn(p)
    }
    this.audio.play('spawn_in', { volume: 0.9, pos: at })
  }

  stomp(at: THREE.Vector3, weight: number): void {
    this.fx.stompDust(at, weight * 1.6)
    const d = at.distanceTo(this.player.position)
    if (d < 40) {
      this.audio.play('mech_stomp', { volume: 0.5 + weight * 0.6, pos: at, jitter: 0.08, ref: 6 })
      this.trauma = Math.min(1, this.trauma + Math.max(0, 1 - d / 26) * 0.18 * weight)
    }
  }

  // ─── match flow ───────────────────────────────────────────────────────
  private chooseSpawn(forId: number, minDist = 0): { pos: THREE.Vector3; yaw: number } {
    const enemies: THREE.Vector3[] = []
    if (forId !== 0 && this.player.alive && this.mode !== 'attract') enemies.push(this.player.position)
    for (const b of this.bots) if (b.alive && b.id !== forId) enemies.push(b.pos)
    for (const h of this.hornets) if (h.alive && forId === 0) enemies.push(h.pos)
    const scored = this.arena.spawns.map(s => {
      let min = Infinity
      for (const e of enemies) min = Math.min(min, e.distanceTo(s))
      let visible = false
      for (const e of enemies) {
        if (e.distanceTo(s) < 40 && this.lineOfSight(tmp.copy(s).setY(s.y + 1.6), tmp2.copy(e).setY(e.y + 1.5))) {
          visible = true
          break
        }
      }
      const tooClose = min < minDist ? -60 : 0
      return { s, score: min + (visible ? -25 : 0) + tooClose + Math.random() * 8 }
    })
    scored.sort((a, b) => b.score - a.score)
    const pos = scored[0].s.clone()
    return { pos, yaw: Math.atan2(pos.x, pos.z) }
  }

  /** Readable reinforcements: prefer reachable lanes about 20 m away; never on top of the player. */
  private waveSpawnPoint(): THREE.Vector3 {
    const pp = this.player.position
    const eye = tmp3.copy(pp).setY(pp.y + 1.6)
    const cands = this.arena.spawns.map(s => {
      const d = s.distanceTo(pp)
      const vis = d < 45 && this.lineOfSight(tmp.copy(s).setY(s.y + 1.4), eye)
      const taken = this.pending.some(p => p.pos.distanceTo(s) < 2.5) || this.bots.some(b => b.alive && b.pos.distanceTo(s) < 2.5)
      return { s, score: (d < 12 ? -120 : 0) - Math.abs(d - 20) * 2 + (vis ? -4 : 0) + (taken ? -100 : 0) + Math.random() * 5 }
    })
    cands.sort((a, b) => b.score - a.score)
    return cands[0].s.clone()
  }

  private enterAttract(): void {
    this.mode = 'attract'
    this.audio.restoreWorld()
    this.audio.setPaused(false)
    this.clearWorld()
    this.player.alive = false
    this.player.body.setNextKinematicTranslation({ x: 0, y: -80, z: 0 })
    this.player.body.setTranslation({ x: 0, y: -80, z: 0 }, true)
    this.arsenal.holder.visible = false
    for (const b of this.dmBots.slice(0, 6)) {
      const s = this.chooseSpawn(b.id)
      b.spawn(s.pos, s.yaw)
    }
  }

  private clearWorld(): void {
    this.missionSession += 1
    for (const r of this.rockets) {
      r.loop?.stop()
      this.scene.remove(r.mesh)
    }
    this.rockets = []
    this.projectiles = []
    for (const g of this.grenadesLive) this.scene.remove(g.mesh)
    this.grenadesLive = []
    this.shards = []
    this.pending = []
    this.spawnQueue = []
    this.fx.clear()
    this.fx.clearDecals()
    this.props.reset()
    this.pickups.reset()
    for (const b of this.bots) b.hide()
    for (const h of this.hornets) h.hide()
    this.boss = null
    this.endOverdrive(true)
  }

  start(mode: GameMode = this.gameMode): void {
    tuning.activate('run')
    this.audio.restoreWorld()
    this.audio.setPaused(false)
    this.clearWorld()
    this.gameMode = mode
    if (mode === 'deathmatch') this.ensureDmSentinels()
    const count = Math.min(CONFIG.bots.count, this.dmBots.length)
    this.match = { ...createMatch(this.dmBots.slice(0, count).map(b => b.name)), unranked: tuning.unranked }
    this.renderer.fx.damage = 0
    this.renderer.fx.lowHealth = 0
    this.perks = {}
    this.applyPerks()
    this.player.maxArmor = CONFIG.player.maxArmor
    this.arsenal.reset()
    this.style = newStyle()
    this.kills = this.headshots = this.shots = this.hits = 0
    this.mission = newMission()
    this.reinforcementT = 18
    this.missionLoad = false
    this.arena.missionState(this.mission)
    this.runTime = 0
    this.wave = 0
    this.wavePhase = 'none'
    this.lastKillWeapons = []
    this.grenades = 2
    if (mode === 'onslaught') {
      this.ensurePool()
      if (this.arsenal.slots.rocket.owned) this.arsenal.slots.rocket.owned = false
      this.player.spawn(new THREE.Vector3(0, 0, -30), Math.PI)
      this.player.armor = this.player.maxArmor
      // Two visible guards establish the threat before the first interaction.
      // They remain frozen during the deployment countdown like every other actor.
      for (const [x,z] of [[-6,-17],[7,-14]]) {
        this.materialize({kind:'scrapper',pos:new THREE.Vector3(x,0,z),yaw:0,t:0})
      }
    } else {
      if (this.stageGate.isReady(3)) this.upgradeRocket()
      const s = this.chooseSpawn(0)
      this.player.spawn(s.pos, s.yaw)
      for (const b of this.dmBots.slice(0, count)) {
        const bs = this.chooseSpawn(b.id)
        b.spawn(bs.pos, bs.yaw)
      }
    }
    this.player.protect = 0
    this.slowmo = 1
    this.mode = 'countdown'
    this.countdownT = 3.2
    this.lastCount = 4
    this.killerId = -1
    this.audio.startAmbience()
    this.audio.playMusic('combat', 2.5, true)
    // Current + next stage first; everything else streams in the background.
    void this.stageGate.ensure(2).catch(() => undefined)
  }

  private upgradeRocket(): void {
    if (this.rocketUpgraded) return
    this.arsenal.upgradeRocket()
    this.rocketUpgraded = true
  }

  pause(): void {
    if (this.mode === 'playing' || this.mode === 'countdown') {
      this.mode = 'paused'
      this.audio.setPaused(true)
    }
  }
  resume(): void {
    if (this.mode === 'paused') this.mode = this.countdownT > 0 ? 'countdown' : 'playing'
    this.audio.setPaused(false)
  }
  toTitle(): void {
    this.audio.stopAmbience()
    this.audio.playMusic('title', 1.5)
    this.events.perks(null)
    this.enterAttract()
  }

  private playerDied(info: DamageInfo): void {
    this.player.alive = false
    this.player.deadTime = 0
    this.killerId = info.attacker
    this.deathYaw = this.player.yaw
    this.deathPitch = this.player.pitch
    this.respawnT = CONFIG.player.respawnDelay
    this.player.body.setNextKinematicTranslation({ x: 0, y: -80, z: 0 })
    const killer = info.attacker === 0 ? 'YOURSELF' : this.nameOf(info.attacker)
    this.events.died(killer, SOURCE_LABEL[info.source])
    this.renderer.fx.damage = 1
    // Onslaught death is game over: cut the music and every world sound right away, then let
    // only the death sting (and later the defeat sting) play.
    if (this.onslaught) this.audio.silenceWorld(0.2)
    this.audio.play('robot_death', { volume: 0.5, rate: 0.6, force: true })
    this.slowmoT = 1.2
    if (this.onslaught) {
      this.events.killfeed(this.feedEntry(info.attacker, 0, info))
      window.setTimeout(() => {
        if (this.mode === 'playing') this.endMatch(false)
      }, 1800)
      return
    }
    this.recordKill(info.attacker, 0, info)
  }

  private botDied(bot: Bot, info: DamageInfo): void {
    const at = bot.pos.clone().setY(bot.pos.y + 1.1 * bot.scale)
    bot.shatter(info.from, info.splash ? 1.8 : 1)
    bot.respawnIn = bot.wave ? 1e9 : CONFIG.bots.respawnDelay
    const big = bot.kind === 'juggernaut' || bot.kind === 'titan'
    if (bot.parts.human) {
      // Soldiers drop; no detonation.
      this.fx.humanHit(at, tmp.copy(at).sub(info.from).setY(0).normalize(), true)
      this.audio.play('human_death', { volume: 0.9, pos: at, ref: 5, jitter: 0.08 })
    } else {
      this.fx.explosion(at, big ? (bot.kind === 'titan' ? 1.6 : 0.9) : 0.42, UP)
      this.fx.sparks(at, UP, big ? 80 : 40, 12)
      this.audio.play('robot_death', { volume: 1, pos: at, ref: 6 })
      this.audio.play('explosion', { volume: big ? 1.2 : 0.55, pos: at, rate: big ? 0.8 : 1.3 })
    }
    if (info.attacker === 0) {
      this.audio.cue(info.headshot ? 'head' : 'kill', 1)
      this.audio.play(info.headshot ? 'headshot' : 'kill_confirm', { volume: 0.8 })
      this.trauma = Math.min(1, this.trauma + (big ? 0.5 : 0.12))
    }
    if (bot.wave) {
      this.enemyKilled(at, (bot.kind === 'breacher' ? 'scrapper' : bot.kind) as EnemyKind, info, big ? (bot.kind === 'titan' ? 1 : 2.5) : 1, bot.name)
      if (bot === this.boss) this.bossDown(at)
      return
    }
    this.recordKill(info.attacker, bot.id, info)
  }

  /** Onslaught kill: style, shards, hit-stop, killfeed. */
  private enemyKilled(at: THREE.Vector3, kind: EnemyKind, info: DamageInfo, scale: number, name?: string): void {
    if (!this.onslaught || this.mode !== 'playing') return
    this.events.killfeed(this.feedEntry(info.attacker, -2, info, name ?? ENEMY_NAME[kind]))
    this.dropShards(at, kind, info)
    if (info.attacker !== 0) return
    this.kills += 1
    if (info.headshot) this.headshots += 1
    this.hitstop = kind === 'titan' ? 0.25 : scale > 1 ? 0.09 : 0.045
    const e = perkEffects(this.perks)
    if (e.vampire) this.player.health = Math.min(this.player.maxHealth, this.player.health + e.vampire)
    const evs: StyleEvent[] = kind === 'titan' ? ['boss'] : ['kill']
    const dist = at.distanceTo(this.player.position)
    if (info.headshot) evs.push('headshot')
    if (this.time - this.lastKillT < 1.3) evs.push('multi')
    if (!this.player.grounded && this.player.airTime > 0.25) evs.push('airborne')
    if (this.player.sliding > 0) evs.push('slide')
    if (info.source === 'grenade') evs.push('grenade')
    else if (info.source === 'rocket' || info.source === 'barrel') evs.push('explosive')
    if (info.source === 'shotgun' && dist < 3.2) evs.push('overkill')
    if (dist > 30) evs.push('longshot')
    const w = info.source
    if (this.lastKillWeapons.length >= 2 && !this.lastKillWeapons.includes(w)) evs.push('arsenal')
    this.lastKillWeapons = [w, ...this.lastKillWeapons].slice(0, 2)
    this.lastKillT = this.time
    for (const ev of evs) this.awardStyle(ev, ev === 'kill' ? scale : 1)
  }

  private awardStyle(ev: StyleEvent, scale = 1): void {
    const g = awardStyle(this.style, ev, perkEffects(this.perks).overclock * (this.overdriveT > 0 ? 0 : 1), scale * (this.overdriveT > 0 ? 1.5 : 1))
    const wasReady = this.style.overdrive >= 1
    this.style = g.state
    this.events.style({ label: g.label, points: Math.round(g.points * RANK_MULT[this.style.rank]), rank: this.style.rank, rankedUp: g.rankedUp })
    if (g.rankedUp) this.audio.play('rank_up', { volume: 0.7, rate: 0.9 + this.style.rank * 0.05, jitter: 0 })
    if (!wasReady && this.style.overdrive >= 1) this.events.message(translate('msg.overdriveReady'), 'good')
  }

  private bossDown(at: THREE.Vector3): void {
    this.slowmoT = 2.2
    this.boss = null
    this.renderer.fx.flash = 0.6
    for (let i = 0; i < 5; i += 1) {
      window.setTimeout(() => {
        const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5))
        this.fx.explosion(p, 0.9, UP)
        this.audio.play('explosion', { volume: 1, pos: p, rate: 0.8 + Math.random() * 0.4 })
        this.trauma = Math.min(1, this.trauma + 0.35)
      }, 180 + i * 260)
    }
    // Remaining minions collapse with their master.
    window.setTimeout(() => {
      for (const b of this.bots) if (b.alive && b.wave) this.damage(b.id, { attacker: -1, amount: 9999, source: 'slam', from: at.clone(), splash: true })
      for (const h of this.hornets) if (h.alive) this.damageDrone(h.id, { attacker: -1, amount: 9999, source: 'slam', from: at.clone() })
    }, 900)
  }

  private recordKill(killer: number, victim: number, info: DamageInfo): void {
    if (this.mode !== 'playing') {
      if (this.mode === 'attract') this.events.killfeed(this.feedEntry(killer, victim, info))
      return
    }
    const k = killer < 0 ? victim : killer
    const res = registerKill(this.match, { killer: k, victim, headshot: info.headshot, weapon: info.source })
    this.match = res.state
    this.events.killfeed(this.feedEntry(killer, victim, info))
    if (res.medals.length) {
      this.events.medals(res.medals)
      this.audio.cue('medal', 0.9)
    }
    if (this.match.phase !== 'playing') this.endMatch()
  }

  private feedEntry(killer: number, victim: number, info: DamageInfo, victimName?: string): KillFeedEntry {
    return {
      killer: killer < 0 && victim >= 0 ? this.nameOf(victim) : this.nameOf(killer),
      victim: victimName ?? this.nameOf(victim),
      weapon: SOURCE_LABEL[info.source],
      headshot: !!info.headshot,
      killerIsPlayer: killer === 0,
      victimIsPlayer: victim === 0,
      killerColor: this.colorOf(killer < 0 && victim >= 0 ? victim : killer),
      victimColor: victimName ? '#ff7a4a' : this.colorOf(victim),
    }
  }

  private endMatch(won?: boolean): void {
    if (this.mode === 'ended') return
    this.mode = 'ended'
    this.endT = 0
    this.slowmo = 0.25
    this.endOverdrive(true)
    this.events.perks(null)
    let summary: RunSummary | undefined
    if (this.gameMode === 'onslaught') {
      const w = !!won
      this.match = { ...this.match, phase: w ? 'won' : 'lost' }
      summary = {
        mode: 'onslaught', won: w, wave: this.mission.progress.filter(p => p >= CHARGE_SECONDS).length, waves: 3, score: this.style.score + (w ? 5000 : 0),
        kills: this.kills, headshots: this.headshots, accuracy: this.shots ? this.hits / this.shots : 0,
        bestRank: RANKS[this.style.best], time: this.runTime, unranked: tuning.unranked,
      }
    } else this.match = { ...this.match, score: computeScore(this.match) }
    // Results screen: no music, no lingering gunfire/explosions/footsteps from the slow-mo world.
    this.audio.silenceWorld(0.3)
    const victory = this.match.phase === 'won'
    this.audio.play(victory ? 'victory' : 'defeat', { volume: 1, jitter: 0, force: true })
    if (victory && this.gameMode === 'onslaught') this.events.wave({ title: translate('wave.victory'), subtitle: translate('wave.victorySub'), kind: 'victory' })
    this.input.unlockPointer()
    window.setTimeout(() => this.events.ended(this.match, summary), victory ? 2600 : 1600)
  }

  // ─── Onslaught director ───────────────────────────────────────────────
  private get plan() {
    return WAVES[Math.min(this.wave, WAVES.length - 1)]
  }

  private beginWave(i: number): void {
    this.wave = i
    const plan = this.plan
    if (!this.stageGate.isReady(plan.stage as StageId)) {
      this.wavePhase = 'loading'
      this.events.loading(translate('wave.loading'))
      void this.stageGate.ensure(plan.stage as StageId).catch(() => undefined)
      return
    }
    this.events.loading(null)
    this.wavePhase = 'intro'
    this.phaseT = plan.boss ? 3.4 : 2.6
    this.spawnQueue = spawnOrder(plan)
    this.spawnT = 1.4
    this.events.wave({ title: plan.title, subtitle: plan.subtitle, kind: plan.boss ? 'boss' : 'intro' })
    this.audio.play(plan.boss ? 'boss_roar' : 'wave_start', { volume: plan.boss ? 0.8 : 0.9, jitter: 0 })
    if (plan.boss) this.audio.playMusic('boss', 2, true)
    if (i === 1) this.events.message(translate('msg.fragsOnline'), 'good')
    if (plan.stage >= 3 && !this.arsenal.slots.rocket.owned) {
      this.upgradeRocket()
      this.arsenal.give('rocket', false)
      this.events.pickup(translate('msg.rocketOnline'), '#ff4a2a')
      this.audio.play('weapon_switch', { volume: 0.8 })
    }
    // Keep the next stage warm while this wave is still calm.
    const next = WAVES[i + 1]
    if (next) void this.stageGate.ensure(next.stage as StageId).catch(() => undefined)
  }

  private aliveEnemies(): number {
    let n = 0
    for (const b of this.bots) if (b.alive && b.wave) n += 1
    for (const h of this.hornets) if (h.alive) n += 1
    return n
  }

  get enemiesLeft(): number {
    return this.aliveEnemies() + this.pending.length + this.spawnQueue.length
  }

  private activateMissionStation(index: number): void {
    const {x,z} = this.player.position
    const next = activateStation(this.mission,index,x,z)
    if (next === this.mission) return
    this.mission = next
    this.beginWave(index)
    this.reinforcementT = 18
  }

  private stepDirector(dt: number): void {
    const pos = this.player.position
    if (this.input.consume('interact') && this.mission.active === null && !this.missionLoad && this.mission.phase === 'repair') {
      const index = STATIONS.findIndex((p,i) => this.mission.progress[i] < CHARGE_SECONDS && Math.hypot(pos.x-p.x,pos.z-p.z)<3.4)
      if (index >= 0) {
        const stage = WAVES[index].stage as StageId
        if (!this.stageGate.isReady(stage)) {
          this.missionLoad = true
          this.events.loading(translate('mission.loading'))
          const session = this.missionSession
          void this.stageGate.ensure(stage).then(() => {
            if (session !== this.missionSession) return
            // A single press is enough if the player is still at the console.
            if (this.mode === 'playing') this.activateMissionStation(index)
          }).catch(() => {
            if (session === this.missionSession) this.events.message(translate('mission.loadFailed'),'warn')
          }).finally(() => {
            if (session === this.missionSession) { this.missionLoad = false; this.events.loading(null) }
          })
        } else {
          this.activateMissionStation(index)
        }
      }
    }
    if (this.wavePhase === 'intro') { this.phaseT -= dt; if (this.phaseT <= 0) this.wavePhase = 'fight' }
    // Finish announced arrivals between stations too; portals must never freeze.
    this.stepSpawns(dt,true)
    if (this.mission.active !== null || this.mission.phase === 'extract') {
      this.reinforcementT -= dt
      if (this.reinforcementT <= 0 && this.enemiesLeft < 5) {
        this.spawnQueue.push('scrapper','scrapper')
        this.reinforcementT = 20
      }
    }
    const enemies = [...this.bots.filter(b=>b.alive && b.wave).map(b=>b.pos), ...this.hornets.filter(b=>b.alive).map(b=>b.pos)]
    const previous = this.mission
    this.mission = stepMission(previous,dt,{x:pos.x,z:pos.z,alive:this.player.alive},enemies)
    if (previous.active !== null && this.mission.active === null) {
      this.waveCleared()
      this.spawnQueue = []
      this.events.wave({title:translate('mission.complete',{n:previous.active+1}),subtitle:translate(this.mission.phase==='extract'?'mission.extractSub':'mission.next'),kind:'clear'})
      if (this.mission.phase === 'extract') { this.spawnQueue=['scrapper','scrapper','scrapper'];this.reinforcementT=18 }
    }
    this.arena.missionState(this.mission)
    if (this.mission.phase === 'won' || this.mission.phase === 'lost') this.endMatch(this.mission.phase === 'won')
  }

  get choosingPerk(): boolean {
    return this.wavePhase === 'perk'
  }

  choosePerk(i: number): void {
    if (this.wavePhase !== 'perk' || !this.perkOffer?.[i]) return
    const p = this.perkOffer[i]
    this.perks = { ...this.perks, [p.id]: (this.perks[p.id] ?? 0) + 1 }
    this.applyPerks()
    if (p.id === 'plated') this.player.armor = this.player.maxArmor
    if (p.id === 'demolitions') this.grenades = perkEffects(this.perks).grenades
    this.events.perkChosen?.(i)
    this.audio.play('perk_pick', { volume: 0.9, jitter: 0 })
    this.events.pickup(p.name, '#ffc23f')
    this.events.perks(null)
    this.perkOffer = null
    this.wavePhase = 'next'
    this.phaseT = 1.6
  }

  private applyPerks(): void {
    const e = perkEffects(this.perks)
    const m = this.arsenal.mods
    m.rifleDamage = e.rifleDamage
    m.reload = e.reloadSpeed
    m.shotgunSpread = e.shotgunSpread
    m.shotgunDamage = e.shotgunDamage
    this.player.maxArmor = e.maxArmor
  }

  private waveCleared(): void {
    this.wavePhase = 'clear'
    this.phaseT = 2.6
    this.awardStyle('wave')
    const final = this.wave >= WAVES.length - 1
    this.audio.play('wave_clear', { volume: 0.9, jitter: 0 })
    if (!final) this.events.wave({ title: translate('wave.cleared', { n: this.wave + 1 }), subtitle: translate('wave.resupply'), kind: 'clear' })
    this.player.health = Math.min(this.player.maxHealth, this.player.health + 25)
    this.grenades = Math.max(this.grenades, perkEffects(this.perks).grenades)
    for (const id of ['rifle', 'shotgun', 'rocket'] as WeaponId[]) {
      const s = this.arsenal.slots[id]
      if (s.owned) s.reserve = Math.min(WEAPONS[id].reserveMax, s.reserve + Math.ceil(WEAPONS[id].reserveMax * 0.3))
    }
    for (const s of this.shards) s.life = Math.min(s.life, 3)
    this.shardVacuum = 3
    const next = WAVES[this.wave + 1]
    if (next) void this.stageGate.ensure(next.stage as StageId).catch(() => undefined)
  }
  private shardVacuum = 0

  private stepSpawns(dt: number, allowed: boolean): void {
    this.spawnT -= dt
    const alive = this.aliveEnemies()
    if (allowed && this.spawnQueue.length && this.spawnT <= 0 && alive + this.pending.length < MAX_ALIVE) {
      const kind = this.spawnQueue.shift()!
      const pos = this.waveSpawnPoint()
      const air = kind === 'hornet'
      if (air) pos.y += 4 + Math.random() * 2
      const scale = kind === 'titan' ? 2.6 : kind === 'juggernaut' ? 1.6 : air ? 0.6 : 1
      this.fx.spawnPortal(air ? pos : pos.clone(), scale)
      this.audio.play('spawn_in', { volume: kind === 'titan' ? 1.3 : 0.8, pos, ref: 6 })
      this.pending.push({ kind, pos, yaw: Math.atan2(pos.x - this.player.position.x, pos.z - this.player.position.z), t: kind === 'titan' ? 1.8 : 0.85 })
      this.spawnT = kind === 'scrapper' ? 0.75 + Math.random() * 0.5 : 1.5
    }
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const p = this.pending[i]
      p.t -= dt
      if (Math.random() < 0.5) this.fx.spawnPortal(p.pos, 0.001 + (p.kind === 'titan' ? 0.5 : 0.2))
      if (p.t > 0) continue
      this.pending.splice(i, 1)
      if (!this.materialize(p)) this.spawnQueue.unshift(p.kind)
    }
  }

  private materialize(p: PendingSpawn): boolean {
    if (p.kind === 'hornet') {
      const h = this.hornets.find(x => !x.alive && !x.falling)
      if (!h) return false
      h.spawn(p.pos)
      this.fx.spawnPortal(p.pos, 0.7)
      return true
    }
    const free = this.waveBots[p.kind].find(x => !x.alive && !x.parts.root.visible) ?? this.waveBots[p.kind].find(x => !x.alive)
    if (!free) return false
    free.spawn(p.pos, p.yaw + Math.PI)
    this.fx.spawnPortal(p.pos, p.kind === 'titan' ? 2.8 : p.kind === 'juggernaut' ? 1.6 : 1)
    this.fx.slamWave(p.pos, p.kind === 'titan' ? 10 : 3)
    if (p.kind === 'titan') {
      this.boss = free
      this.trauma = Math.min(1, this.trauma + 0.8)
      this.audio.play('boss_roar', { volume: 1.3, pos: p.pos, ref: 14 })
      this.slowmoT = 1
    }
    return true
  }

  isBusy(): boolean {
    if (this.mode !== 'playing' && this.mode !== 'countdown') return false
    return this.aliveEnemies() > 5 || this.fx.particleCount > 1600 || this.rockets.length + this.projectiles.length > 6
  }

  // ─── player abilities ─────────────────────────────────────────────────
  get grenadesUnlocked(): boolean {
    return this.stageGate.isReady(2) && (!this.onslaught || this.wave >= 1 || this.mission.progress.slice(1).some(p=>p>=CHARGE_SECONDS))
  }

  private throwGrenade(): void {
    if (this.grenades <= 0 || this.grenadeCd > 0 || !this.grenadesUnlocked) return
    this.grenades -= 1
    this.grenadeCd = 0.7
    const eye = this.player.eye(1, tmp).clone()
    const fwd = this.player.forward(tmp2).clone()
    const mesh = grenadeMesh()
    const pos = eye.addScaledVector(fwd, 0.5).add(new THREE.Vector3(0, -0.12, 0))
    mesh.position.copy(pos)
    this.scene.add(mesh)
    const vel = fwd.multiplyScalar(17).add(new THREE.Vector3(0, 3.6, 0)).addScaledVector(this.player.velocity, 0.5)
    this.grenadesLive.push({ pos, vel, fuse: 1.6, mesh, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), bounceCd: 0 })
    this.audio.play('grenade_throw', { volume: 0.9 })
    this.arsenal.punch.pitch -= 0.02
    this.arsenal.punch.roll += 0.03
  }

  private activateOverdrive(): void {
    if (this.overdriveT > 0 || this.style.overdrive < 1) return
    this.overdriveT = 7
    this.style = { ...this.style, overdrive: 0 }
    const m = this.arsenal.mods
    m.damage = 1.5
    m.rate = 1.3
    m.infinite = true
    this.audio.play('overdrive_on', { volume: 1, jitter: 0 })
    this.events.overdrive(true)
    this.slowmoT = 0.5
    this.trauma = Math.min(1, this.trauma + 0.3)
    this.renderer.fx.flash = 0.35
    this.fx.slamWave(this.player.position.clone(), 6)
    this.awardStyle('overdrive')
  }

  private endOverdrive(silent = false): void {
    const m = this.arsenal.mods
    m.damage = 1
    m.rate = 1
    m.infinite = false
    if (this.overdriveT > 0 && !silent) this.events.overdrive(false)
    this.overdriveT = 0
    this.renderer.fx.overdrive = 0
  }

  // ─── simulation ───────────────────────────────────────────────────────
  step(rawDt: number): void {
    if (this.mode === 'paused') return
    let dt = rawDt
    if (this.mode === 'ended') {
      this.endT += dt
      this.slowmo = Math.min(1, this.slowmo + dt * 0.5)
      dt *= this.slowmo
    }
    // Juice: hit-stop on kills, slow-mo on big moments.
    if (this.hitstop > 0) {
      this.hitstop -= rawDt
      dt *= 0.12
    } else if (this.slowmoT > 0) {
      this.slowmoT -= rawDt
      dt *= 0.4
    }
    this.time += dt
    this.hurtT = Math.max(0, this.hurtT - dt)
    this.grenadeCd = Math.max(0, this.grenadeCd - dt)
    this.weakPopT = Math.max(0, this.weakPopT - dt)
    const input = this.input
    if (this.mode === 'countdown') {
      this.countdownT -= dt
      const n = Math.ceil(this.countdownT)
      if (n !== this.lastCount && n >= 0) {
        this.lastCount = n
        if (n > 0) {
          this.events.countdown(n)
          this.audio.cue('beep')
        }
      }
      if (this.countdownT <= 0) {
        this.mode = 'playing'
        this.events.countdown(0)
        this.audio.play('match_start', { volume: 0.9, jitter: 0 })
        this.audio.cue('go')
        if (this.gameMode === 'onslaught') this.events.wave({title:translate('mission.begin'),subtitle:translate('mission.beginSub'),kind:'intro'})
      }
    }
    const playing = this.mode === 'playing'
    const controllable = playing && this.player.alive
    if (this.mode !== 'attract') {
      const intent = {
        x: controllable ? input.move.x : 0,
        y: controllable ? input.move.y : 0,
        jump: controllable && input.consume('jump'),
        sprint: controllable && input.held('sprint'),
        ads: controllable && input.held('ads'),
        slide: controllable && input.consume('slide'),
        crouch: controllable && input.held('slide'),
      }
      const res = this.player.step(dt, intent)
      if (res.jumped) this.audio.play('footstep', { volume: 0.4, rate: 1.1 })
      if (res.landed > 3) {
        this.audio.play('land', { volume: Math.min(1, res.landed / 12), jitter: 0.08 })
        if (res.landed > 9) this.fx.stompDust(this.player.position, 0.5)
      }
      if (res.slid) {
        this.audio.play('slide', { volume: 0.8, jitter: 0.05 })
        this.fx.stompDust(this.player.position, 0.4)
      }
      if (this.player.sliding > 0 && Math.random() < 0.5) this.fx.stompDust(this.player.position, 0.2)
      if (this.player.grounded && this.player.alive && this.player.sliding <= 0) {
        this.footDist += this.player.speed2d * dt
        const stride = this.player.sprinting ? 2.7 : 2.1
        if (this.footDist > stride) {
          this.footDist = 0
          this.audio.play('footstep', { volume: this.player.sprinting ? 0.5 : 0.35, jitter: 0.12 })
        }
      }
    }
    if (controllable) {
      const perk = this.wavePhase === 'perk'
      if (!perk) {
        if (input.consume('slot1')) this.arsenal.select('rifle')
        if (input.consume('slot2')) this.arsenal.select('shotgun')
        if (input.consume('slot3')) this.arsenal.select('rocket')
      }
      if (input.consume('nextWeapon')) this.arsenal.cycle(1)
      if (input.consume('prevWeapon')) this.arsenal.cycle(-1)
      if (input.consume('lastWeapon')) this.arsenal.quickSwitch()
      if (input.consume('grenade')) this.throwGrenade()
      if (input.consume('overdrive')) this.activateOverdrive()
      const eye = this.player.eye(1, tmp).clone()
      this.arsenal.step(dt, { fire: input.held('fire'), firePressed: input.consume('fire'), ads: input.held('ads'), reload: input.consume('reload') }, eye, this.player.sprinting)
      if (this.arsenal.shotsThisStep) {
        this.shots += this.arsenal.shotsThisStep
        this.hits += this.arsenal.hitsThisStep
        if (!this.onslaught) this.match = recordShot(this.match, this.arsenal.shotsThisStep, this.arsenal.hitsThisStep)
      }
      const s = this.arsenal.slot
      const low = s.mag <= Math.ceil(this.arsenal.def.mag * 0.25)
      if (low && !this.lowAmmoWarned && s.reserve > 0) this.lowAmmoWarned = true
      if (!low) this.lowAmmoWarned = false
    } else {
      input.consume('fire')
      input.consume('reload')
      input.consume('grenade')
      input.consume('overdrive')
      if (this.mode === 'countdown' && this.player.alive) {
        this.arsenal.step(dt, { fire: false, firePressed: false, ads: false, reload: false }, this.player.eye(1, tmp).clone(), false)
      }
    }
    // Overdrive + style.
    if (this.overdriveT > 0) {
      this.overdriveT -= dt
      this.renderer.fx.overdrive = Math.min(1, this.overdriveT * 2) * (0.85 + Math.sin(this.time * 9) * 0.15)
      if (this.overdriveT <= 0) this.endOverdrive()
    }
    if (this.onslaught && playing) {
      this.runTime += dt
      if (this.overdriveT <= 0) this.style = decayStyle(this.style, dt)
      this.stepDirector(dt)
    }
    // Deathmatch respawn.
    if (playing && !this.player.alive && !this.onslaught) {
      this.respawnT -= dt
      if (this.respawnT <= 0) {
        const s = this.chooseSpawn(0)
        this.player.spawn(s.pos, s.yaw)
        this.arsenal.reset()
        this.renderer.fx.damage = 0
        this.events.respawned()
      }
    }
    // Robots.
    const targets: Target[] = []
    if (this.mode !== 'attract') targets.push({ id: 0, pos: this.player.position, vel: this.player.velocity, alive: this.player.alive && this.player.protect <= 0, isPlayer: true, h: 1 - this.player.crouch * 0.45 })
    if (!this.onslaught) for (const b of this.dmBots) targets.push({ id: b.id, pos: b.pos, vel: b.vel, alive: b.alive, isPlayer: false })
    const items: ItemInfo[] = this.onslaught ? [] : this.pickups.list.map(p => ({ pos: p.spot.pos, kind: p.spot.kind, available: p.available }))
    const ctx: BrainContext = { targets, items, hotspots: this.hotspots, playerEye: this.eyePos, playerId: 0, frozen: this.mode === 'countdown' || this.mode === 'ended' }
    const activeDm = this.mode === 'attract' ? 6 : this.onslaught ? 0 : Math.min(CONFIG.bots.count, this.dmBots.length)
    for (let i = 0; i < this.dmBots.length; i += 1) {
      const b = this.dmBots[i]
      if (i >= activeDm) continue
      if (!b.alive) {
        b.respawnIn -= dt
        if (b.respawnIn <= 0 && this.mode !== 'ended') {
          const s = this.chooseSpawn(b.id)
          b.spawn(s.pos, s.yaw)
          this.fx.spawnPortal(s.pos, 1)
        }
        continue
      }
      b.update(dt, ctx, this.dmBots)
      this.botFootsteps(b, dt)
    }
    if (this.onslaught) {
      const wave = this.bots.filter(b => b.wave)
      for (const b of wave) {
        if (!b.alive) continue
        b.update(dt, ctx, wave)
        if (b.kind === 'scrapper') this.botFootsteps(b, dt)
      }
      const pt = { pos: this.player.position, vel: this.player.velocity, alive: this.player.alive }
      for (const h of this.hornets) if (h.alive || h.falling) h.update(dt, pt, ctx.frozen)
    }
    this.stepRockets(dt)
    this.stepProjectiles(dt)
    this.stepGrenades(dt)
    this.stepShards(dt)
    this.props.update(dt, this, pos => {
      if (this.player.alive && this.player.position.distanceTo(pos) < 1.4) return true
      return this.bots.some(b => b.alive && b.pos.distanceTo(pos) < 1.4 * b.scale)
    })
    this.pickups.update(dt, this.time)
    this.collectPickups()
    if (playing && !this.onslaught) {
      this.match = tick(this.match, dt)
      if (this.match.phase !== 'playing') this.endMatch()
    }
    this.physics.step(dt)
  }

  private botFootsteps(b: Bot, dt: number): void {
    if (this.mode === 'attract') return
    const d = b.pos.distanceTo(this.player.position)
    if (d > 20) return
    const acc = (this.botFoot.get(b.id) ?? 0) + Math.hypot(b.vel.x, b.vel.z) * dt
    if (acc > 1.9) {
      this.audio.play(b.parts.human ? 'footstep' : 'robot_step', { volume: b.parts.human ? 0.4 : 0.55, pos: b.pos.clone().setY(b.pos.y + 0.1), jitter: 0.1, ref: 3 })
      this.botFoot.set(b.id, 0)
    } else this.botFoot.set(b.id, acc)
  }

  // ─── rift shards ──────────────────────────────────────────────────────
  private dropShards(at: THREE.Vector3, kind: EnemyKind, info: DamageInfo): void {
    const base = { scrapper: 3, hornet: 2, juggernaut: 8, titan: 26 }[kind]
    const missing = 1 - this.player.health / this.player.maxHealth
    const lowAmmo = this.arsenal.slot.reserve < this.arsenal.def.mag
    let n = base
    // Doom-style: a point-blank shotgun kill ("overkill") showers health.
    const glory = info.attacker === 0 && info.source === 'shotgun' && at.distanceTo(this.player.position) < 3.2
    if (glory) n += 3
    for (let i = 0; i < n; i += 1) {
      const r = Math.random()
      const hW = 0.25 + missing * 0.8 + (glory ? 0.5 : 0)
      const aW = 0.3
      const mW = lowAmmo ? 0.6 : 0.3
      const k: ShardKind = r * (hW + aW + mW) < hW ? 'health' : r * (hW + aW + mW) < hW + aW ? 'armor' : 'ammo'
      const a = Math.random() * Math.PI * 2
      this.shards.push({ kind: k, pos: at.clone(), vel: new THREE.Vector3(Math.cos(a) * (1.5 + Math.random() * 2.5), 4 + Math.random() * 3, Math.sin(a) * (1.5 + Math.random() * 2.5)), life: 14, phase: Math.random() * 6, grounded: false })
    }
    if (this.shards.length > 80) this.shards.splice(0, this.shards.length - 80)
  }

  private stepShards(dt: number): void {
    const e = perkEffects(this.perks)
    this.shardVacuum = Math.max(0, this.shardVacuum - dt)
    const chest = tmp3.copy(this.player.position).setY(this.player.position.y + 0.9)
    const magnet = 3.4 * e.magnet
    for (let i = this.shards.length - 1; i >= 0; i -= 1) {
      const s = this.shards[i]
      s.life -= dt
      s.phase += dt
      if (s.life <= 0) {
        this.shards.splice(i, 1)
        continue
      }
      const d = s.pos.distanceTo(chest)
      const pull = this.player.alive && (d < magnet || this.shardVacuum > 0) && s.phase > 0.45
      if (pull) {
        const dir = tmp.subVectors(chest, s.pos).normalize()
        const sp = Math.max(s.vel.length(), 6) + dt * 40
        s.vel.lerp(dir.multiplyScalar(sp), Math.min(1, dt * 10))
        s.grounded = false
      } else if (!s.grounded) {
        s.vel.y -= 16 * dt
        s.vel.multiplyScalar(Math.exp(-0.6 * dt))
      }
      s.pos.addScaledVector(s.vel, dt)
      const g = this.arena.groundAt(s.pos.x, s.pos.z, s.pos.y + 0.5) + 0.25
      if (!pull && s.pos.y < g) {
        s.pos.y = g
        if (Math.abs(s.vel.y) > 1.2) s.vel.y = -s.vel.y * 0.35
        else {
          s.vel.set(0, 0, 0)
          s.grounded = true
        }
        s.vel.x *= 0.6
        s.vel.z *= 0.6
      }
      if (this.player.alive && this.mode === 'playing' && d < 0.9) {
        if (this.collectShard(s.kind, e.shardValue)) this.shards.splice(i, 1)
      }
    }
  }

  private collectShard(kind: ShardKind, value: number): boolean {
    const p = this.player
    if (kind === 'health') {
      if (p.health >= p.maxHealth) return false
      p.health = Math.min(p.maxHealth, p.health + 5 * value)
    } else if (kind === 'armor') {
      if (p.armor >= p.maxArmor) return false
      p.armor = Math.min(p.maxArmor, p.armor + 5 * value)
    } else {
      let useful = false
      for (const id of ['rifle', 'shotgun', 'rocket'] as WeaponId[]) {
        const s = this.arsenal.slots[id]
        const d = WEAPONS[id]
        if (!s.owned || s.reserve >= d.reserveMax) continue
        useful = true
        s.reserve = Math.min(d.reserveMax, s.reserve + Math.max(1, Math.round(d.mag * 0.25 * value)))
      }
      if (!useful) return false
    }
    const c = SHARD_COLOR[kind]
    this.fx.shardBurst(tmp.copy(p.position).setY(p.position.y + 1), [c[0], c[1], c[2], 1])
    this.audio.play('shard_pickup', { volume: 0.55, rate: kind === 'health' ? 1 : kind === 'armor' ? 1.12 : 0.9, jitter: 0.05 })
    this.events.shard(kind)
    return true
  }

  // ─── grenades & projectiles ───────────────────────────────────────────
  private stepGrenades(dt: number): void {
    const blast = perkEffects(this.perks).blast
    for (let i = this.grenadesLive.length - 1; i >= 0; i -= 1) {
      const g = this.grenadesLive[i]
      g.fuse -= dt
      g.bounceCd = Math.max(0, g.bounceCd - dt)
      g.vel.y -= 20 * dt
      const sp = g.vel.length()
      const dir = tmp.copy(g.vel).divideScalar(sp || 1)
      const hit = sp > 0.01 ? this.raycast(g.pos, dir, sp * dt + 0.06, this.player.collider.handle) : null
      if (hit && (hit.tag?.kind === 'bot' || hit.tag?.kind === 'drone') && g.fuse < 1.45) g.fuse = 0
      else if (hit) {
        g.pos.copy(hit.point).addScaledVector(hit.normal, 0.06)
        const vn = hit.normal.clone().multiplyScalar(g.vel.dot(hit.normal))
        g.vel.sub(vn.multiplyScalar(1.45)).multiplyScalar(0.62)
        if (sp > 2.5 && g.bounceCd <= 0) {
          this.audio.play('grenade_bounce', { volume: Math.min(1, sp / 10), pos: g.pos, jitter: 0.1 })
          g.bounceCd = 0.08
        }
        g.spin.multiplyScalar(0.6)
      } else g.pos.addScaledVector(g.vel, dt)
      // Proximity fuse against Hounds.
      for (const h of this.hornets) if (h.alive && h.pos.distanceTo(g.pos) < 1.3) g.fuse = 0
      g.mesh.position.copy(g.pos)
      g.mesh.rotation.x += g.spin.x * dt
      g.mesh.rotation.z += g.spin.z * dt
      const blink = Math.sin(this.time * (g.fuse < 0.6 ? 40 : 16)) > 0
      const led = g.mesh.getObjectByName('led')
      if (led) led.visible = blink
      if (blink) this.fx.add.emit({ pos: g.pos.clone(), life: 0.05, size: 0.18, color: [4, 0.4, 0.2, 1], frame: 213 })
      if (g.fuse <= 0) {
        this.explode(g.pos.clone(), 5.2 * blast, 125, 0, 'grenade', UP)
        this.scene.remove(g.mesh)
        this.grenadesLive.splice(i, 1)
      }
    }
  }

  private stepProjectiles(dt: number): void {
    let nearest: Projectile | undefined
    let nd = Infinity
    const chest = tmp3.copy(this.player.position).setY(this.player.position.y + 1.1)
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i]
      const def = PROJ[p.kind]
      p.life -= dt
      const sp = p.vel.length()
      const dir = tmp.copy(p.vel).divideScalar(sp)
      const hit = this.raycast(p.pos, dir, sp * dt + 0.05, undefined, true)
      const next = tmp2.copy(p.pos).addScaledVector(p.vel, dt)
      const hitPlayer = this.player.alive && this.mode === 'playing' && next.distanceTo(chest) < 0.75 + def.size
      if (hit || hitPlayer || p.life <= 0) {
        const at = hitPlayer ? next.clone() : hit ? hit.point.clone() : p.pos.clone()
        const n = hit ? hit.normal : dir.clone().negate()
        if (p.kind === 'cannon') this.explode(at, def.radius, def.damage, p.owner, 'cannon', n.y > 0.6 ? n : undefined)
        else {
          if (hitPlayer) this.damage(0, { attacker: p.owner, amount: def.damage, source: 'plasma', from: p.pos.clone(), point: at })
          this.fx.energyBurst(at, n, def.color, 0.7)
          this.audio.play('impact_metal', { volume: 0.4, pos: at, rate: 1.4, jitter: 0.1 })
        }
        this.projectiles.splice(i, 1)
        continue
      }
      p.pos.copy(next)
      this.fx.bolt(p.pos, p.vel, def.color, def.size)
      const d = p.pos.distanceTo(chest)
      if (d < nd) {
        nd = d
        nearest = p
      }
    }
    if (nearest) {
      this.projLight.position.copy(nearest.pos)
      this.projLight.color.setRGB(nearest.kind === 'plasma' ? 0.36 : 1, nearest.kind === 'plasma' ? 0.78 : 0.55, nearest.kind === 'plasma' ? 1 : 0.2)
      this.projLight.intensity = 10
    } else this.projLight.intensity = 0
  }

  private collectPickups(): void {
    for (const p of this.pickups.list) {
      if (!p.available) continue
      if (p.spot.kind === 'rocket' && this.onslaught && !this.arsenal.slots.rocket.owned) continue
      const at = p.spot.pos
      if (this.mode === 'playing' && this.player.alive) {
        const pp = this.player.position
        if (Math.hypot(pp.x - at.x, pp.z - at.z) < 1.3 && Math.abs(pp.y - at.y) < 1.6) {
          let used = false
          let label = ''
          let color = '#fff'
          if (p.spot.kind === 'health' && this.player.health < this.player.maxHealth) {
            this.player.health = Math.min(this.player.maxHealth, this.player.health + 50)
            used = true
            label = translate('msg.health')
            color = '#4dff7a'
            this.audio.play('pickup_health', { volume: 0.9 })
          } else if (p.spot.kind === 'armor' && this.player.armor < this.player.maxArmor) {
            this.player.armor = Math.min(this.player.maxArmor, this.player.armor + 60)
            used = true
            label = translate('msg.armor')
            color = '#3fb8ff'
            this.audio.play('pickup_armor', { volume: 0.9 })
          } else if (p.spot.kind === 'ammo' && this.arsenal.refill()) {
            used = true
            label = translate('msg.ammo')
            color = '#ffc23f'
            this.audio.play('pickup_ammo', { volume: 0.9 })
          } else if (p.spot.kind === 'rocket' && this.stageGate.isReady(3)) {
            this.upgradeRocket()
            const had = this.arsenal.slots.rocket.owned
            this.arsenal.give('rocket')
            used = true
            label = had ? translate('msg.rocketAmmo') : translate('msg.rocket')
            color = '#ff4a2a'
            this.audio.play('pickup_ammo', { volume: 0.9, rate: 0.85 })
            this.audio.play('weapon_switch', { volume: 0.7 })
          }
          if (used) {
            this.pickups.take(p)
            this.events.pickup(label, color)
            const c = new THREE.Color(color)
            this.fx.shardBurst(at.clone().setY(at.y + 0.8), [c.r * 3, c.g * 3, c.b * 3, 1])
            continue
          }
        }
      }
      if (this.onslaught) continue
      for (const b of this.dmBots) {
        if (!b.alive) continue
        if (Math.hypot(b.pos.x - at.x, b.pos.z - at.z) > 1.3 || Math.abs(b.pos.y - at.y) > 1.6) continue
        let used = false
        if (p.spot.kind === 'health' && b.health < b.maxHealth) {
          b.health = Math.min(b.maxHealth, b.health + 50)
          used = true
        } else if (p.spot.kind === 'armor' && b.armor < 100) {
          b.armor = Math.min(100, b.armor + 60)
          used = true
        } else if (p.spot.kind === 'rocket' && this.stageGate.isReady(3)) {
          b.rockets = 3
          used = true
        }
        if (used) {
          this.pickups.take(p)
          this.audio.play(p.spot.kind === 'health' ? 'pickup_health' : p.spot.kind === 'armor' ? 'pickup_armor' : 'pickup_ammo', { volume: 0.6, pos: at })
          break
        }
      }
    }
  }

  private stepRockets(dt: number): void {
    let brightest: Rocket | undefined
    for (let i = this.rockets.length - 1; i >= 0; i -= 1) {
      const r = this.rockets[i]
      r.life -= dt
      const speed = r.vel.length()
      const dir = tmp.copy(r.vel).divideScalar(speed)
      const stepLen = speed * dt
      const hit = this.raycast(r.pos, dir, stepLen + 0.1, r.exclude)
      let boom: THREE.Vector3 | null = null
      let normal: THREE.Vector3 | undefined
      const friendlyTag = hit && this.onslaught && r.owner !== 0 && (hit.tag?.kind === 'bot' || hit.tag?.kind === 'drone')
      if (hit && !friendlyTag) {
        boom = hit.point.clone().addScaledVector(dir, -0.15)
        normal = hit.normal
      } else if (r.life <= 0) boom = r.pos.clone()
      else {
        const next = r.pos.clone().addScaledVector(dir, stepLen)
        if (r.owner === 0 || !this.onslaught) {
          for (const b of this.bots) {
            if (b.alive && b.id !== r.owner && tmp2.copy(b.pos).setY(b.pos.y + b.scale).distanceTo(next) < 0.9 * b.scale) boom = next
          }
          for (const h of this.hornets) if (h.alive && r.owner === 0 && h.pos.distanceTo(next) < 1.1) boom = next
        }
        if (!boom && this.player.alive && r.owner !== 0 && this.mode === 'playing' && tmp2.copy(this.player.position).setY(this.player.position.y + 1).distanceTo(next) < 0.9) boom = next
        r.pos.copy(next)
      }
      if (boom) {
        const hitTag = hit?.tag
        if (!friendlyTag && (hitTag?.kind === 'bot' || hitTag?.kind === 'player')) {
          this.damage(hitTag.kind === 'bot' ? hitTag.id : 0, { attacker: r.owner, amount: 35, source: 'rocket', from: r.pos.clone(), point: boom.clone() })
        }
        this.explode(boom, WEAPONS.rocket.splashRadius ?? 6.5, WEAPONS.rocket.damage, r.owner, 'rocket', normal && normal.y > 0.6 ? normal : undefined)
        r.loop?.stop()
        this.scene.remove(r.mesh)
        this.rockets.splice(i, 1)
        continue
      }
      r.mesh.position.copy(r.pos)
      r.loop?.set(r.pos)
      r.trail += dt
      while (r.trail > 1 / 90) {
        r.trail -= 1 / 90
        this.fx.smokeTrail(r.pos.clone().addScaledVector(dir, -0.3), r.vel)
      }
      if (!brightest || r.life > brightest.life) brightest = r
    }
    if (brightest) {
      this.rocketLight.position.copy(brightest.pos)
      this.rocketLight.intensity = 14 + Math.random() * 4
    } else this.rocketLight.intensity = 0
  }

  // ─── presentation ─────────────────────────────────────────────────────
  render(alpha: number, frameDt: number): void {
    const cam = this.camera
    const look = this.mode === 'playing' || this.mode === 'countdown' ? this.input.takeLook() : (this.input.takeLook(), { x: 0, y: 0 })
    if (this.player.alive && (this.mode === 'playing' || this.mode === 'countdown')) {
      const adsK = 1 - this.arsenal.ads * 0.35
      this.player.yaw -= look.x * adsK
      this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - look.y * adsK, -1.5, 1.5)
    }
    this.lastLook = look
    let dt = this.mode === 'paused' ? 0 : frameDt * (this.mode === 'ended' ? this.slowmo : 1)
    if (this.hitstop > 0) dt *= 0.12
    else if (this.slowmoT > 0) dt *= 0.4
    this.trauma = Math.max(0, this.trauma - frameDt * 1.5)
    const shakeK = CONFIG.camera.shake * (this.reducedMotion ? 0.3 : 1)
    const sh = this.trauma * this.trauma * shakeK
    const t = this.time * 22
    const shake = { x: (Math.sin(t * 1.3) + Math.sin(t * 2.9) * 0.5) * 0.035 * sh, y: (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.3) * 0.5) * 0.035 * sh, r: Math.sin(t * 1.1 + 2) * 0.03 * sh }
    for (const b of this.bots) if (b.alive || b.parts.root.visible) b.render(alpha)
    if (!this.body && this.staged.player) {
      this.body = new PlayerBody(this.staged.player, this.staged.vm)
      this.scene.add(this.body.parts.root)
    }
    if (this.body) {
      const on = this.player.alive && (this.mode === 'playing' || this.mode === 'countdown' || this.mode === 'paused')
      this.bodyFeet.lerpVectors(this.player.prevPosition, this.player.position, alpha)
      this.body.update(dt, on, this.bodyFeet, this.player.yaw, this.player.pitch, this.player.velocity, this.player.crouch)
    }
    for (const h of this.hornets) if (h.alive || h.falling || h.root.visible) h.render(alpha, dt)
    if (this.mode === 'attract') {
      this.attractT += frameDt
      const a = this.attractT * 0.05
      const R = 30
      cam.position.set(Math.cos(a) * R, 9 + Math.sin(this.attractT * 0.13) * 2.5, Math.sin(a) * R)
      cam.up.set(0, 1, 0)
      cam.lookAt(0, 1.5, 0)
      this.fov(62)
    } else if (this.player.alive) {
      const eye = this.player.eye(alpha, this.eyePos)
      const speed = this.player.grounded ? this.player.speed2d : 0
      const bobK = CONFIG.camera.bob * (this.reducedMotion ? 0.3 : 1) * (1 - this.arsenal.ads * 0.8) * (this.player.sliding > 0 ? 0.2 : 1)
      eye.y += Math.sin(this.time * (5 + speed * 1.1) * 2) * 0.012 * Math.min(1.4, speed / 6) * bobK
      cam.position.copy(eye)
      const strafe = this.mode === 'playing' ? this.input.move.x : 0
      this.strafeTilt += (-strafe * 0.018 - this.strafeTilt) * Math.min(1, frameDt * 8)
      this.slideTilt += ((this.player.sliding > 0 ? 0.075 : 0) - this.slideTilt) * Math.min(1, frameDt * 10)
      const P = this.arsenal.punch
      cam.rotation.set(this.player.pitch + P.pitch + shake.y, this.player.yaw + P.yaw + shake.x, this.strafeTilt + this.slideTilt + P.roll + shake.r, 'YXZ')
      const moveK = this.player.sliding > 0 ? 1.1 : this.player.sprinting ? 1.06 : 1
      this.fov(this.fovSetting, this.arsenal.fovScale() * moveK * (this.overdriveT > 0 ? 1.04 : 1))
      this.arsenal.animate(dt, this.lastLook, this.reducedMotion)
    } else {
      const d = Math.min(1, this.player.deadTime / 0.8)
      const base = tmp.copy(this.player.position)
      cam.position.set(base.x, base.y + 1.62 - d * 1.25, base.z)
      let yaw = this.deathYaw
      let pitch = this.deathPitch * (1 - d)
      const k = this.killerId > 0 ? this.botById.get(this.killerId) : undefined
      if (k && k.alive) {
        const dx = k.pos.x - base.x
        const dz = k.pos.z - base.z
        const want = Math.atan2(-dx, -dz)
        let dy = want - this.deathYaw
        dy = Math.atan2(Math.sin(dy), Math.cos(dy))
        yaw = this.deathYaw + dy * d
        pitch = THREE.MathUtils.lerp(this.deathPitch, Math.atan2(k.pos.y + 1.3 * k.scale - cam.position.y, Math.hypot(dx, dz)), d)
      }
      cam.rotation.set(pitch, yaw, d * 0.45, 'YXZ')
      this.fov(this.fovSetting, 0.9)
      this.arsenal.holder.visible = false
    }
    cam.updateMatrixWorld()
    const fwd = cam.getWorldDirection(tmp2)
    this.audio.setListener(cam.position, fwd)
    const lowH = this.player.alive && this.mode === 'playing' ? Math.max(0, 1 - this.player.health / 35) : 0
    this.renderer.fx.lowHealth += (lowH - this.renderer.fx.lowHealth) * Math.min(1, frameDt * 4)
    if (lowH > 0 && this.mode === 'playing') {
      this.heartbeatT -= frameDt
      if (this.heartbeatT <= 0) {
        this.audio.cue('heartbeat', 0.8 + lowH * 0.6)
        this.heartbeatT = 1.05 - lowH * 0.35
      }
    }
    // Music ducks a little between waves.
    if (this.onslaught) this.audio.setMusicCalm(this.wavePhase === 'fight' || this.wavePhase === 'intro' ? 0 : 0.5)
    this.renderer.fx.damage = Math.max(0, this.renderer.fx.damage - frameDt * 1.6)
    this.renderer.fx.flash = Math.max(0, this.renderer.fx.flash - frameDt * 2.5)
    this.renderShards(dt)
    this.fx.update(dt)
    this.arena.update(this.time)
    for (const f of this.arena.fires) this.fx.fire(f.pos, dt, 1)
    this.renderer.render(this.scene, cam, this.time)
    this.input.endFrame()
  }

  private readonly shardM = new THREE.Matrix4()
  private readonly shardQ = new THREE.Quaternion()
  private readonly shardE = new THREE.Euler()
  private readonly shardS = new THREE.Vector3()
  private renderShards(dt: number): void {
    const mesh = this.shardMesh
    const col = mesh.instanceColor!.array as Float32Array
    let n = 0
    for (const s of this.shards) {
      if (n >= 80) break
      const bob = s.grounded ? Math.sin(s.phase * 3) * 0.06 + 0.12 : 0
      const fade = s.life < 2 ? (Math.sin(s.life * 18) > 0 ? 1 : 0.25) : 1
      this.shardE.set(0.3, s.phase * 2.4, 0.2)
      this.shardQ.setFromEuler(this.shardE)
      const sc = fade * (s.phase < 0.2 ? s.phase / 0.2 : 1)
      this.shardS.setScalar(Math.max(0.01, sc))
      this.shardM.compose(tmp.copy(s.pos).setY(s.pos.y + bob), this.shardQ, this.shardS)
      mesh.setMatrixAt(n, this.shardM)
      const c = SHARD_COLOR[s.kind]
      col[n * 3] = c[0]
      col[n * 3 + 1] = c[1]
      col[n * 3 + 2] = c[2]
      if (dt > 0 && Math.random() < 0.5) this.fx.add.emit({ pos: tmp.clone(), life: 0.08, size: 0.5, color: [c[0] * 0.25, c[1] * 0.25, c[2] * 0.25, 1], frame: 213 })
      n += 1
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
  }

  private fov(horizontalDeg: number, scale = 1): void {
    const cam = this.camera
    const v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontalDeg) / 2) / (16 / 9))
    const target = THREE.MathUtils.radToDeg(v) * scale
    if (Math.abs(cam.fov - target) > 0.01) {
      cam.fov += (target - cam.fov) * 0.35
      cam.updateProjectionMatrix()
    }
  }

  hud(): HudState {
    const a = this.arsenal
    const s = a.slot
    const top = leader(this.match)
    const me = this.match.combatants[0]
    const boss = this.boss && this.boss.alive ? { name: 'THE WARDEN', health: this.boss.health / this.boss.maxHealth, phase: this.boss.phase } : null
    return {
      mission: this.mission,
      playerX: this.player.position.x, playerZ: this.player.position.z, playerYaw: this.player.yaw,
      health: Math.ceil(this.player.health),
      maxHealth: this.player.maxHealth,
      armor: Math.ceil(this.player.armor),
      maxArmor: this.player.maxArmor,
      armorRegen: this.player.regenerating,
      armorWait: Math.min(1, this.player.sinceHit / CONFIG.player.armorRegenDelay),
      weapon: a.current,
      weaponName: a.def.name,
      mag: s.mag,
      magSize: a.def.mag,
      reserve: s.reserve,
      owned: { rifle: a.slots.rifle.owned, shotgun: a.slots.shotgun.owned, rocket: a.slots.rocket.owned },
      spread: a.spread,
      ads: a.ads,
      reloading: a.reloading > 0 ? 1 - a.reloading / a.reloadTotal : 0,
      timeLeft: this.onslaught ? this.runTime : this.match.timeLeft,
      kills: this.onslaught ? this.kills : me.kills,
      fragLimit: this.match.fragLimit,
      leaderName: top.name,
      leaderKills: top.kills,
      place: placement(this.match),
      alive: this.player.alive,
      respawnIn: Math.max(0, this.respawnT),
      streak: me.streak,
      sprinting: this.player.sprinting,
      lowAmmo: s.mag <= Math.ceil(a.def.mag * 0.25),
      protect: this.player.protect,
      gameMode: this.gameMode,
      wave: this.wave + 1,
      waves: 3,
      enemiesLeft: this.onslaught ? this.enemiesLeft : 0,
      nearbyThreats: [...this.bots.filter(b=>b.alive&&b.wave).map(b=>b.pos), ...this.hornets.filter(h=>h.alive).map(h=>h.pos)].filter(p=>Math.hypot(p.x-this.player.position.x,p.z-this.player.position.z)<28).slice(0,MAX_ALIVE).map(p=>({x:p.x,z:p.z})),
      rank: this.style.rank,
      rankName: RANKS[this.style.rank],
      rankFill: this.style.fill / 100,
      mult: RANK_MULT[this.style.rank],
      score: this.style.score,
      overdrive: this.style.overdrive,
      overdriveActive: this.overdriveT > 0 ? this.overdriveT / 7 : 0,
      grenades: this.grenades,
      grenadesUnlocked: this.grenadesUnlocked,
      boss,
      sliding: this.player.sliding > 0,
      runTime: this.runTime,
    }
  }

  get waveTotal(): number {
    return WAVES.length
  }
  get plannedEnemies(): number {
    return waveSize(this.plan)
  }

  standings(): ReturnType<typeof standings> {
    return standings(this.match)
  }

  setQuality(): void {
    this.arena.sun.shadow.map?.dispose()
    this.arena.sun.shadow.map = null
    this.arena.sun.shadow.mapSize.set(this.renderer.shadowMapSize, this.renderer.shadowMapSize)
    this.fx.density = this.renderer.particleDensity
    this.arena.setRainDensity(this.renderer.particleDensity)
  }
}

export type { Perk }

import * as THREE from 'three'
import type { Input } from '../engine/input'
import { audio } from '../engine/audio'
import { type LoadState, LoadTracker, nextTask, Slicer } from '../engine/loader'
import { GROUP_AGENT, GROUP_WORLD, initPhysics, Physics } from '../engine/physics'
import type { Renderer } from '../engine/renderer'
import { botName, type Msg, t } from '../i18n'
import { NavGraph, type Point } from '../world/nav'
import { physicsProbe } from '../world/probe'
import { World } from '../world/world'
import { Agent, HASTE, PLAYER_HP } from './agent'
import { Bot, type BotIntent, type BotWorld, type Role, SKILLS } from './bots'
import { CharacterLibrary } from './characters'
import { type ShotResult, spreadDir, traceMelee, traceShot } from './combat'
import { Fx } from './fx'
import { TeamIntel } from './intel'
import { MAPS, type MapConfig, type MapKey, navSeeds } from './maps'
import { Props } from './props'
import { HyjalDefense } from './hyjal'
import { AB, AbMatch } from './rules/ab'
import { NodeFx } from './nodefx'
import { type BuffKind, Buffs } from './rules/buffs'
import { WsgMatch } from './rules/wsg'
import { findRoutes, type Route } from './routes'
import { MatchSounds, type Surface } from './sounds'
import { type MatchResult, TEAMS, type Team, other } from './teams'
import { Nameplates } from '../ui/nameplates'
import { ViewModel } from './viewmodel'
import { LOADOUT, type WeaponId } from './weapons'

export type Difficulty = keyof typeof SKILLS
export type View = 'first' | 'third'
export type GameOptions = { map: MapKey; team: Team; difficulty: Difficulty; teamSize?: number; autopilot?: boolean; view?: View; playerHp?: number }

export const SPIRIT_HEALER_WAVE = 5
const PREP_TIME = 5
const BASE_FOV = 74
/** How far the third-person crosshair ray looks for a target. */
const AIM_REACH = 1000
/** Seconds between repeats of the banner channel's cast sound (the clip's length). */
const CHANNEL_SOUND_REPEAT = 5
/** Over-the-shoulder camera offsets (yards): right, up, back. */
const SHOULDER = { right: 0.55, up: 0.25, back: 2.6 }
const DOWN = { x: 0, y: -1, z: 0 }
/** The rune models stand almost 3 yards tall; this brings them to about waist-high pickups. */
const RUNE_SCALE = 0.7

export type FeedItem = { attacker: Agent | null; victim: Agent; head: boolean; weapon: WeaponId | null; time: number; color: string }
export type Banner = { msg: Msg; time: number; color: string }

/** Everything that is expensive to rebuild and can be reused across matches on one map. */
type Level = { key: string; physics: Physics; world: World; nav: NavGraph; cfg: MapConfig; routes: Route[] }
const levels = new Map<string, Promise<Level>>()
let charactersP: Promise<CharacterLibrary> | null = null
let propsP: Promise<Props> | null = null
let creaturesP: Promise<Props> | null = null
let characters: CharacterLibrary | null = null
let props: Props | null = null

/** Share of the loading bar per step; downloads get the rest. */
const LOAD_STEPS = { characters: 0.04, weapons: 0.02, terrain: 0.08, models: 0.08, textures: 0.04, nav: 0.02, sounds: 0.03, avatars: 0.05, warmup: 0.06 }
const DOWNLOAD_SHARE = 0.58

/** Keeps a load promise cached for reuse, but forgets it if it fails so a retry starts over. */
function remember<T>(p: Promise<T>, forget: () => void): Promise<T> {
  p.catch(forget)
  return p
}

async function loadLevel(key: MapKey, renderer: Renderer, tracker: LoadTracker): Promise<Level> {
  const cfg = MAPS[key]
  const navP = tracker.fetch(`./assets/maps/${key}/nav.bin.gz`).catch(() => null)
  const physics = new Physics()
  const world = await World.load(key, renderer.renderer, physics, tracker)
  physics.refreshQueries()
  tracker.set('load.nav', 'nav', 0)
  const buf = await navP
  let nav = buf ? NavGraph.deserialize(buf, cfg.nav, cfg.nav.cell) : null
  if (!nav) {
    // Missing or stale asset (`pnpm nav` rebuilds it): flood fill here, which blocks for ~15 s.
    console.warn(`nav.bin.gz for ${key} is missing or out of date; building the nav graph at load time`)
    await nextTask()
    nav = new NavGraph(cfg.nav, cfg.nav.cell)
    nav.build(physicsProbe(physics), navSeeds(cfg))
  }
  tracker.set('load.nav', 'nav', 0.6)
  // Bot lanes between the flags, about 100 ms of search each.
  await nextTask()
  const routes = cfg.flags ? await findRoutes(nav, cfg.flags.alliance, cfg.flags.horde, { pause: nextTask }) : []
  tracker.set('load.nav', 'nav', 1)
  return { key, physics, world, nav, cfg, routes }
}

export class Game implements BotWorld {
  readonly agents: Agent[] = []
  readonly bots = new Map<number, Bot>()
  readonly byCollider = new Map<number, Agent>()
  player!: Agent
  playerBot: Bot | null = null
  time = 0
  phase: 'prep' | 'live' | 'over' = 'prep'
  prep = PREP_TIME
  wave = SPIRIT_HEALER_WAVE
  result: MatchResult | null = null
  wsg: WsgMatch | null = null
  ab: AbMatch | null = null
  defense: HyjalDefense | null = null
  buffs!: Buffs
  readonly feed: FeedItem[] = []
  banners: Banner[] = []
  readonly fx: Fx
  readonly sounds: MatchSounds
  hitMarker = 0
  hitHead = false
  damageFlash = 0
  zoom = false
  /** Looking through the sniper scope: the overlay replaces the gun and the crosshair. */
  scoped = false
  /** Sights toggled up with the mouse (gamepads hold the trigger instead). */
  private aimToggle = false
  /** Index into the weapon's `zoomFovs`. */
  scopeStep = 0
  /** How much bigger the view looks than at the normal field of view. */
  magnify = 1
  /** Yards to whatever is under the scope's cross, or null for open sky. */
  rangefinder: number | null = null
  view: View
  readonly viewmodel: ViewModel
  private lookFrame = { x: 0, y: 0 }
  private flagMeshes = new Map<Team, THREE.Group>()
  /** `since`: when the banner last changed, for the pop as the new one goes up. */
  private bannerMeshes = new Map<string, { state: string; mesh: THREE.Group | null; since: number }>()
  private nodeFx: NodeFx | null = null
  /** When each channeller's cast sound next repeats. */
  private channelSound = new Map<number, number>()
  private runeMeshes: Record<BuffKind, THREE.Group>[] = []
  private readonly matchRoot = new THREE.Group()
  private plates: Nameplates | null = null
  private camLook = { yaw: 0, pitch: 0 }
  /** Smoothed third-person boom length so wall pushes do not pop. */
  private boom = SHOULDER.back
  onEnd: ((game: Game) => void) | null = null
  private ended = false

  private constructor(
    readonly level: Level,
    readonly opts: GameOptions,
    private readonly renderer: Renderer,
    private readonly input: Input,
  ) {
    this.fx = new Fx(this.matchRoot)
    this.view = opts.view ?? 'first'
    this.sounds = new MatchSounds(opts.map === 'ab' ? 'ab' : 'wsg', () => this.player)
    this.viewmodel = new ViewModel(characters!.weapons)
    this.viewmodel.onSound = kind => this.sounds.weapon(kind, this.player.weaponId)
  }

  get nav(): NavGraph {
    return this.level.nav
  }
  get routes(): readonly Route[] {
    return this.level.routes
  }
  private readonly intels: Record<Team, TeamIntel> = { alliance: new TeamIntel(), horde: new TeamIntel() }
  intel(team: Team): TeamIntel {
    return this.intels[team]
  }
  get cfg(): MapConfig {
    return this.level.cfg
  }

  /**
   * Loads (or reuses) everything a match needs. Every download starts at once, CPU work runs in
   * time slices, and the first frame is rendered before returning, so the loading screen stays
   * live and the match starts without a hitch.
   */
  static async create(renderer: Renderer, input: Input, opts: GameOptions, onProgress: (state: LoadState) => void): Promise<Game> {
    const tracker = new LoadTracker(DOWNLOAD_SHARE, LOAD_STEPS, onProgress)
    if (charactersP) tracker.skip('characters', 'weapons')
    if (levels.has(opts.map)) tracker.skip('terrain', 'models', 'textures', 'nav')
    tracker.set('load.download')
    charactersP ??= remember(
      (async () => {
        const lib = new CharacterLibrary()
        await lib.load(tracker)
        return lib
      })(),
      () => (charactersP = null),
    )
    propsP ??= remember(Props.load(), () => (propsP = null))
    await initPhysics()
    let levelP = levels.get(opts.map)
    if (!levelP) {
      levelP = remember(loadLevel(opts.map, renderer, tracker), () => levels.delete(opts.map))
      levels.set(opts.map, levelP)
    }
    const soundsP = audio.load(tracker, [`amb_${opts.map === 'ab' ? 'ab' : 'wsg'}`, 'spirithealer'])
    const [lib, prp, level] = await Promise.all([charactersP, propsP, levelP, soundsP])
    characters = lib
    props = prp
    renderer.scene.background = new THREE.Color(level.cfg.sky)
    ;(renderer.scene.fog as THREE.Fog).color.set(level.cfg.sky)
    const game = new Game(level, opts, renderer, input)
    await game.setup(tracker)
    await game.warmup(tracker)
    tracker.set('load.ready', 'warmup', 1)
    return game
  }

  /** Shader compilation, texture upload and the first shadow/skinning frame, off the match clock. */
  private async warmup(tracker: LoadTracker): Promise<void> {
    tracker.set('load.shaders', 'warmup', 0)
    const gl = this.renderer.renderer
    await this.level.world.uploadTextures(gl)
    tracker.set('load.shaders', 'warmup', 0.3)
    await gl.compileAsync(this.renderer.scene, this.renderer.camera)
    tracker.set('load.shaders', 'warmup', 0.8)
    await nextTask()
    this.render(1, 0)
    await nextTask()
  }

  private async setup(tracker: LoadTracker): Promise<void> {
    const { scene } = this.renderer
    scene.add(this.level.world.root, this.matchRoot)
    this.renderer.camera.add(this.viewmodel.root)
    const ui = document.getElementById('ui')
    if (ui) this.plates = new Nameplates(ui, !!this.cfg.defense)
    const size = this.opts.teamSize ?? this.cfg.teamSize
    const skill = SKILLS[this.cfg.defense ? 'normal' : this.opts.difficulty]
    const slicer = new Slicer()
    tracker.set('load.avatars', 'avatars', 0)
    for (const team of (this.cfg.defense ? [this.opts.team] : TEAMS)) {
      for (let i = 0; i < size; i++) {
        await slicer.tick()
        tracker.set('load.avatars', 'avatars', (this.agents.length + 1) / (size * 2))
        const isPlayer = team === this.opts.team && i === 0
        // The player has a body too: it is drawn in third person and casts our shadow.
        const avatar = characters!.create(team, i)
        const nameOf = isPlayer ? () => t('name.you') : () => botName(team, i)
        const agent = new Agent(team, nameOf, isPlayer, this.level.physics, avatar, isPlayer ? (this.opts.playerHp ?? PLAYER_HP.default) : undefined)
        this.matchRoot.add(avatar.root)
        this.agents.push(agent)
        this.byCollider.set(agent.collider.handle, agent)
        const role: Role = i % 10 < 5 ? 'attack' : i % 10 < 7 ? 'defend' : 'mid'
        if (isPlayer) {
          this.player = agent
          if (this.opts.autopilot) this.playerBot = new Bot(agent, 'attack', skill)
        } else this.bots.set(agent.id, new Bot(agent, role, skill))
        this.spawnAt(agent, this.cfg.spawn[team], 10)
      }
    }
    if (this.cfg.mode === 'ctf') {
      this.wsg = new WsgMatch(this.cfg.flags!)
      for (const team of TEAMS) {
        const mesh = props!.create(team === 'alliance' ? 'flag_alliance' : 'flag_horde')
        this.flagMeshes.set(team, mesh)
        this.matchRoot.add(mesh)
      }
    } else if (this.cfg.defense) {
      this.defense = new HyjalDefense(this, this.matchRoot, await (creaturesP ??= remember(Props.load('./assets/hyjal/creatures'), () => { creaturesP = null })), props!)
    } else {
      this.ab = new AbMatch(this.cfg.nodes!)
      for (const node of this.ab.nodes) this.bannerMeshes.set(node.id, { state: '', mesh: null, since: -99 })
      this.nodeFx = new NodeFx(this.matchRoot, this.ab, (x, z, fromY) => this.level.physics.ray({ x, y: fromY, z }, DOWN, 12, GROUP_WORLD)?.point.y ?? null)
    }
    this.buffs = new Buffs(this.cfg.buffs)
    for (const spot of this.buffs.spots) {
      const meshes = { speed: props!.create('rune_speed'), heal: props!.create('rune_heal') }
      for (const m of Object.values(meshes)) {
        m.position.set(spot.pos.x, spot.pos.y, spot.pos.z)
        m.scale.setScalar(RUNE_SCALE)
        this.matchRoot.add(m)
      }
      this.runeMeshes.push(meshes)
    }
    const p = this.player
    this.camLook.yaw = p.yaw
    this.banner({ key: this.cfg.defense ? 'hyjal.intro' : this.cfg.mode === 'ctf' ? 'banner.intro.ctf' : 'banner.intro.dom', params: { map: this.opts.map } }, '#ffd76a', 6)
    this.sounds.begin()
  }

  /** What the agent stands on, for footsteps: terrain is grass, buildings are WSG wood or AB stone. */
  private surfaceUnder(a: Agent): Surface {
    const hit = this.level.physics.ray({ x: a.pos.x, y: a.pos.y + 0.4, z: a.pos.z }, DOWN, 1.5, GROUP_WORLD)
    if (!hit || this.level.world.terrainColliders.has(hit.collider.handle)) return 'grass'
    return this.cfg.key === 'wsg' ? 'wood' : 'stone'
  }

  private spawnAt(agent: Agent, center: Point, radius: number): void {
    const revived = !agent.alive
    const defense = this.cfg.defense
    const front = defense && agent.isPlayer ? new THREE.Vector3().subVectors(defense.entry, defense.core).setY(0).normalize().multiplyScalar(5.5).add(new THREE.Vector3().copy(defense.core)) : null
    const n = front ? this.nav.nearest(front) : this.nav.randomNear(center, radius)
    const p = n >= 0 ? this.nav.point(n) : center
    agent.teleport(p)
    if (revived) this.sounds.resurrect(agent)
    // Face the enemy side.
    const enemy = this.cfg.spawn[other(agent.team)]
    agent.yaw = Math.atan2(enemy.x - p.x, enemy.z - p.z)
    agent.pitch = 0
    agent.setAlive(true)
    agent.respawnLoadout()
    agent.avatar?.setState('stand')
    this.bots.get(agent.id)?.reset()
    if (agent === this.player) {
      this.camLook.yaw = agent.yaw
      this.camLook.pitch = 0
      this.playerBot?.reset()
    }
  }

  defenseGoal(agent: Agent): Point | null { return this.defense?.goal(agent) ?? null }

  // ---------- BotWorld ----------
  sees(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const d = new THREE.Vector3().subVectors(to, from)
    const len = d.length()
    if (len < 0.01) return true
    return this.level.physics.ray(from, d.divideScalar(len), len, GROUP_WORLD) === null
  }

  graveyardOf(team: Team): Point {
    return this.cfg.graveyards.find(g => g.team === team)!.pos
  }

  /** Graveyards a dead combatant may resurrect at (AB: base + nodes the team fully controls). */
  graveyards(team: Team) {
    return this.cfg.graveyards.filter(g => {
      if (g.team === team) return true
      if (!g.node || !this.ab) return false
      const node = this.ab.node(g.node)
      return node.owner === team && node.assaulter === null
    })
  }

  nearestGraveyard(agent: Agent) {
    let best = this.graveyards(agent.team)[0]
    let bestD = Infinity
    for (const g of this.graveyards(agent.team)) {
      const d = Math.hypot(g.pos.x - agent.pos.x, g.pos.z - agent.pos.z)
      if (d < bestD) {
        bestD = d
        best = g
      }
    }
    return best
  }

  // ---------- simulation ----------
  step(dt: number): void {
    if (this.phase === 'over') return
    this.time += dt
    const frozen = this.phase === 'prep'
    if (frozen) {
      this.prep -= dt
      this.sounds.countdown(this.prep)
      if (this.prep <= 0) {
        this.phase = 'live'
        this.banner({ key: 'banner.fight' }, '#ffd76a', 3)
        this.sounds.live()
      }
    }
    this.stepPlayer(dt, frozen)
    for (const bot of this.bots.values()) {
      const a = bot.agent
      if (frozen) {
        a.move(new THREE.Vector3(), false, dt)
        continue
      }
      this.applyIntent(a, bot.update(dt, this), dt)
    }
    for (const a of this.agents) {
      a.updateWeapon(dt)
      a.haste = Math.max(0, a.haste - dt)
    }
    // Refresh the broad phase so rays (bullets, sight) see agents where they now are.
    this.level.physics.step(dt)
    this.sounds.steps(this.agents, this.renderer.camera.position, a => this.surfaceUnder(a))
    if (frozen) return

    this.defense?.update(dt, this.input.held('interact') || !!this.playerBot)
    const people = this.agents.map(a => ({ id: a.id, team: a.team, pos: a.pos, alive: a.alive }))
    if (this.wsg) {
      this.wsg.update(dt, people)
      this.handleWsgEvents()
    }
    if (this.ab) {
      this.ab.update(dt, people)
      this.handleAbEvents()
    }
    this.buffs.update(dt, people, (id, kind) => {
      const a = this.agents.find(x => x.id === id)!
      return kind !== 'heal' || a.hp < a.maxHp
    })
    this.handleBuffEvents()

    this.wave -= dt
    if (this.wave <= 0) {
      this.wave += SPIRIT_HEALER_WAVE
      for (const a of this.agents) {
        if (a.alive || this.defense?.isMonster(a.id) || this.time - a.deathTime < 1) continue
        const gy = this.nearestGraveyard(a)
        this.spawnAt(a, gy.pos, 6)
      }
    }

    const result = this.wsg?.result ?? this.ab?.result ?? this.defense?.result ?? null
    if (result && !this.ended) this.finish(result)
  }

  private mayMount(a: Agent): boolean {
    return a.alive && a.grounded && !this.wsg?.carrying(a.id)
  }

  private applyIntent(a: Agent, intent: BotIntent, dt: number): void {
    if (intent.weapon && intent.weapon !== a.weaponId) a.switchTo(intent.weapon)
    if (intent.mount === 'off' || intent.channel) a.dismount()
    else if (intent.mount === 'on' && !a.mounted && a.mountCast <= 0 && this.mayMount(a)) a.beginMount()
    // The summon needs the rider standing still; moving cancels it.
    if (a.mountCast > 0) {
      a.move(new THREE.Vector3(), false, dt)
      a.tickMount(dt, false)
    } else a.move(intent.wish, intent.jump, dt)
    if (intent.fire && a.canFire()) this.fire(a, intent.heavy)
    if (intent.channel && this.ab) this.ab.startChannel({ id: a.id, team: a.team, pos: a.pos, alive: a.alive }, intent.channel)
  }

  setView(view: View): void {
    if (view === this.view) return
    this.view = view
    this.banner({ key: 'banner.view', params: { view } }, '#d8e6ff', 1.6)
  }

  toggleView(): void {
    this.setView(this.view === 'first' ? 'third' : 'first')
  }

  private stepPlayer(dt: number, frozen: boolean): void {
    const p = this.player
    const input = this.input
    if (input.consume('view')) this.toggleView()
    if (!frozen && p.alive && input.consume('mount')) {
      if (p.mounted || p.mountCast > 0) p.dismount()
      else if (this.mayMount(p)) p.beginMount()
    }
    if (this.playerBot) {
      if (frozen) p.move(new THREE.Vector3(), false, dt)
      else this.applyIntent(p, this.playerBot.update(dt, this), dt)
      this.camLook.yaw = p.yaw
      this.camLook.pitch = p.pitch
      this.lookFrame = { x: 0, y: 0 }
      return
    }
    const look = input.takeLook()
    const w = p.weapon
    // Scale sensitivity with the zoom so aiming keeps the same feel on screen.
    const sens = this.zoom ? Math.tan(((this.renderer.camera.fov * Math.PI) / 180) / 2) / Math.tan(((BASE_FOV * Math.PI) / 180) / 2) : 1
    this.lookFrame = { x: look.x * sens, y: look.y * sens }
    this.camLook.yaw -= look.x * sens
    this.camLook.pitch = THREE.MathUtils.clamp(this.camLook.pitch - look.y * sens, -1.45, 1.45)
    if (!p.alive) {
      this.aimToggle = false
      return
    }
    p.yaw = this.camLook.yaw
    p.pitch = this.camLook.pitch

    // Weapon selection: 1-4, gamepad bumpers, Q for the last weapon.
    const held = p.weaponId
    const slots = ['slot1', 'slot2', 'slot3', 'slot4'] as const
    slots.forEach((s, i) => {
      if (input.consume(s) && LOADOUT[i]) p.switchTo(LOADOUT[i])
    })
    // Right click toggles the sights; a gamepad trigger is held. The knife keeps the button for its heavy stab.
    const adsPress = input.consume('ads')
    // A single scope press gets the rider off the mount and raises the sights.
    if (!frozen && adsPress && p.weaponId === held && w.view.scope && (p.mounted || p.mountCast > 0)) {
      p.dismount()
      this.aimToggle = false
    }
    if (p.weaponId !== held || p.mounted || w.mode === 'melee' || !w.view.ads) this.aimToggle = false
    else if (adsPress && input.method !== 'gamepad') this.aimToggle = !this.aimToggle
    const wantAim = input.method === 'gamepad' ? input.held('ads') : this.aimToggle
    const zoomIn = input.consume('zoomIn')
    const zoomOut = input.consume('zoomOut')
    const steps = wantAim && p.switchTimer <= 0 ? w.view.zoomFovs : undefined
    if (steps && zoomIn) this.scopeStep = Math.min(steps.length - 1, this.scopeStep + 1)
    if (steps && zoomOut) this.scopeStep = Math.max(0, this.scopeStep - 1)
    if (input.consume('nextWeapon')) p.cycleWeapon(1)
    if (input.consume('prevWeapon')) p.cycleWeapon(-1)
    if (input.consume('lastWeapon')) p.switchTo(p.lastWeapon)
    if (p.weaponId !== held) this.sounds.weapon('holster', held)

    const melee = w.mode === 'melee'
    // Working a bolt takes the eye off the scope until the next round is nearly chambered.
    const cycling = w.mode === 'bolt' && p.cooldown > 0.25
    this.zoom = !p.mounted && wantAim && !!w.view.ads && p.switchTimer <= 0 && !p.reloading && !cycling
    p.aiming = this.zoom
    // The sights and magnification come back after bolt cycles and reloads; putting the scope down resets them.
    if (!wantAim || p.weaponId !== held) this.scopeStep = 0
    const wish = new THREE.Vector3()
    if (!frozen) {
      const f = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw))
      const r = new THREE.Vector3(-Math.cos(p.yaw), 0, Math.sin(p.yaw))
      wish.addScaledVector(f, input.move.y).addScaledVector(r, input.move.x)
      if (wish.lengthSq() > 1) wish.normalize()
      const back = input.move.y < 0
      const speed = p.speed(back) * (this.zoom ? 0.7 : 1) * (this.wsg?.speedMultiplier(p.id) ?? 1)
      wish.multiplyScalar(speed)
    }
    p.move(wish, !frozen && input.held('jump'), dt)
    if (!frozen) p.tickMount(dt, wish.lengthSq() > 0.04 || input.held('jump'))
    if (frozen) return
    if (input.consume('reload')) p.startReload()
    const firing = input.held('fire')
    const heavy = melee && input.held('ads') && !firing
    if (!firing && !heavy) p.triggerReady = true
    const triggerOk = w.mode === 'auto' || p.triggerReady
    if ((firing || heavy) && triggerOk && p.canFire()) this.fire(p, heavy)
    else if (firing && !melee && p.ammo === 0 && p.switchTimer <= 0 && !p.reloading) {
      if (p.triggerReady) this.sounds.dryFire()
      p.triggerReady = false
      p.startReload()
    }
    if (this.ab && input.held('interact')) {
      for (const node of this.ab.nodes) {
        if (Math.hypot(node.pos.x - p.pos.x, node.pos.z - p.pos.z) < AB.radius) this.ab.startChannel({ id: p.id, team: p.team, pos: p.pos, alive: true }, node.id)
      }
    }
  }

  /** Point under the crosshair in third person: what the camera ray hits, ignoring ourselves. */
  private thirdPersonAim(a: Agent): THREE.Vector3 {
    const cam = this.renderer.camera
    const origin = cam.getWorldPosition(new THREE.Vector3())
    const dir = a.aimDir()
    const hit = this.level.physics.ray(origin, dir, AIM_REACH, GROUP_WORLD | GROUP_AGENT, a.collider)
    return origin.addScaledVector(dir, hit ? hit.distance : AIM_REACH)
  }

  private fire(a: Agent, heavy = false): void {
    if (a.mounted || a.mountCast > 0) a.dismount()
    const w = a.weapon
    const isMe = a === this.player && !this.playerBot
    const third = a === this.player && this.view === 'third' && !this.scoped
    let aim = a.aimDir()
    if (third) {
      const eye = a.eye()
      const target = this.thirdPersonAim(a)
      // Ignore aim points behind or inside us (camera ray hitting something next to the shoulder).
      if (target.distanceTo(eye) > 1.5) aim = target.sub(eye).normalize()
    }
    a.triggerReady = false
    a.avatar?.fire()
    if (isMe) this.viewmodel.fire(w, heavy)
    const dist = a === this.player ? 0 : a.pos.distanceTo(this.player.pos)

    if (w.mode === 'melee') {
      a.cooldown = heavy && w.heavy ? w.heavy.interval : w.interval
      const shot = traceMelee(this.level.physics, a, aim, this.byCollider, w, heavy)
      this.sounds.shot(a, w, heavy, a.eye())
      if (shot.target) {
        this.fx.impact(shot.to, true)
        // Backstabs and head hits deal more than the plain swing: give them the critical sound.
        const crit = shot.head || shot.damage > (heavy && w.heavy ? w.heavy.damage : w.damage) * 1.01
        this.sounds.melee(a, shot.to, crit ? 'crit' : 'flesh')
        this.damage(shot.target, shot.damage, a, shot.head, w.id)
      } else if (shot.normal) {
        this.fx.impact(shot.to, false)
        this.sounds.melee(a, shot.to, 'wall')
      }
      return
    }

    a.consumeRound()
    // Bots cannot be held to trigger discipline, so semi-automatics get a human tapping cadence.
    a.cooldown = w.interval * (!a.isPlayer && w.mode === 'semi' ? 2 : 1)
    const center = spreadDir(aim, a.spread())
    a.bloom = Math.min(w.bloomMax, a.bloom + w.bloomPerShot)
    if (isMe) {
      const k = w.kick * (this.zoom ? 0.7 : 1)
      this.camLook.pitch = Math.min(1.45, this.camLook.pitch + k * (0.6 + Math.random() * 0.6))
      this.camLook.yaw += (Math.random() - 0.5) * k * w.kickYaw
    }
    const from = a.eye()
    const hits = new Map<Agent, { damage: number; head: boolean }>()
    const shots: ShotResult[] = []
    for (let i = 0; i < w.pellets; i++) {
      const dir = w.pellets > 1 ? spreadDir(center, w.pelletSpread) : center
      const shot = traceShot(this.level.physics, a, dir, this.byCollider, w, from)
      shots.push(shot)
      if (shot.target) {
        const h = hits.get(shot.target) ?? { damage: 0, head: false }
        h.damage += shot.damage
        h.head ||= shot.head
        hits.set(shot.target, h)
      }
    }
    const muzzle = this.muzzleOf(a)
    const close = dist < 90
    if (!(isMe && (this.view === 'first' || this.scoped)) && close) this.fx.flash(muzzle, w.tracer, w.mode === 'bolt' ? 0.7 : 0.45)
    shots.forEach((shot, i) => {
      // Multi-pellet guns draw a few tracers; bots only half of their bullets to keep it readable.
      const drawTracer = w.pellets > 1 ? i % 3 === 0 : a.isPlayer || w.mode === 'bolt' || Math.random() < 0.5
      if (drawTracer && (close || a.isPlayer)) this.fx.tracer(muzzle, shot.to, w.tracer)
      if (shot.target || shot.normal) this.fx.impact(shot.to, !!shot.target)
    })
    this.sounds.shot(a, w, false, muzzle)
    // One ricochet per trigger pull, even for nine pellets.
    const wall = shots.find(s => s.normal)
    if (wall) this.sounds.impact(wall.to)
    for (const [target, h] of hits) this.damage(target, h.damage, a, h.head, w.id)
  }

  /** Where tracers start: the first-person barrel tip, or the avatar's weapon muzzle. */
  private muzzleOf(a: Agent): THREE.Vector3 {
    if (a === this.player && (this.view === 'first' || this.scoped)) {
      const cam = this.renderer.camera
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(cam.quaternion)
      const fwd = a.aimDir()
      const k = this.scoped ? 0 : 1 - this.viewmodel.adsT
      return a.eye().addScaledVector(fwd, 0.9).addScaledVector(right, 0.2 * k).addScaledVector(down, 0.1 + 0.06 * k)
    }
    return a.avatar ? a.avatar.muzzle.getWorldPosition(new THREE.Vector3()) : a.eye()
  }

  damage(target: Agent, amount: number, attacker: Agent | null, head = false, weapon: WeaponId | null = null): void {
    if (!target.alive) return
    target.dismount()
    // Camp soldiers provide covering fire; the player remains the main source of damage.
    const support = this.defense?.isMonster(target.id) && attacker && !attacker.isPlayer ? 0.45 : 1
    const dealt = amount * support * (attacker?.powers.damage ?? 1) * target.powers.incoming * (this.wsg?.damageTakenMultiplier(target.id) ?? 1)
    target.hp -= dealt
    target.lastHurt = this.time
    target.lastAttacker = attacker
    if (attacker) {
      attacker.stats.damage += dealt
      // Shooting gives you away to the whole team you hit.
      this.intels[target.team].report(attacker.id, attacker.pos, this.time)
    }
    this.ab?.interrupt(target.id)
    this.bots.get(target.id)?.hurtBy(attacker)
    if (target === this.player) this.damageFlash = 1
    if (attacker === this.player) {
      this.hitMarker = 0.15
      this.hitHead = head
      if (weapon !== 'dagger') this.sounds.hitConfirm(head)
    }
    if (target.hp <= 0) this.kill(target, attacker, head, weapon)
    else this.sounds.hurt(target, this.time, head)
  }

  private kill(target: Agent, attacker: Agent | null, head: boolean, weapon: WeaponId | null): void {
    target.hp = 0
    target.setAlive(false)
    target.deathTime = this.time
    target.stats.deaths++
    this.defense?.killed(target)
    this.intels[other(target.team)].forget(target.id)
    target.avatar?.setState('dead')
    this.sounds.death(target)
    if (attacker) {
      attacker.stats.kills++
      attacker.refill()
    }
    this.wsg?.dropFrom(target.id, target.pos)
    this.handleWsgEvents()
    this.ab?.interrupt(target.id)
    this.feed.push({ attacker, victim: target, head, weapon, time: this.time, color: attacker ? teamColor(attacker.team) : '#ccc' })
    if (this.feed.length > 6) this.feed.shift()
    if (target === this.player) this.banner({ key: 'banner.killed', params: { name: attacker ? attacker.name : t('feed.world') } }, '#ff8a7a', 3)
  }

  private handleWsgEvents(): void {
    const m = this.wsg
    if (!m) return
    for (const e of m.events.splice(0)) {
      const nameOf = (id: number | null) => this.agents.find(a => a.id === id)?.name ?? ''
      if (e.type === 'pickup') {
        this.agents.find(a => a.id === e.by)?.dismount()
        this.banner({ key: 'banner.pickup', params: { name: nameOf(e.by), flag: e.flag } }, teamColor(other(e.flag)))
        this.sounds.flagTaken(e.flag)
      } else if (e.type === 'drop') {
        this.banner({ key: 'banner.drop', params: { flag: e.flag } }, teamColor(e.flag))
        this.sounds.warning(e.flag)
      } else if (e.type === 'return') {
        if (e.by) this.agents.find(a => a.id === e.by)!.stats.returns++
        this.banner(e.by ? { key: 'banner.returnBy', params: { name: nameOf(e.by), flag: e.flag } } : { key: 'banner.returnAuto', params: { flag: e.flag } }, teamColor(e.flag))
        this.sounds.warning(e.flag)
      } else if (e.type === 'capture') {
        this.agents.find(a => a.id === e.by)!.stats.caps++
        this.banner({ key: 'banner.capture', params: { name: nameOf(e.by), flag: other(e.team), team: e.team } }, teamColor(e.team), 5)
        this.sounds.flagCaptured(e.team)
      } else if (e.type === 'respawn') this.banner({ key: 'banner.flagsBack' }, '#ffd76a')
    }
  }

  private handleAbEvents(): void {
    const m = this.ab
    if (!m) return
    for (const e of m.events.splice(0)) {
      const nameOf = (id: number) => this.agents.find(a => a.id === id)?.name ?? ''
      if (e.type === 'end') continue
      const pos = m.node(e.node).pos
      if (e.type === 'assault') {
        this.agents.find(a => a.id === e.by)!.stats.assaults++
        this.banner({ key: 'banner.assault', params: { name: nameOf(e.by), node: e.node, team: e.team } }, teamColor(e.team))
        this.sounds.warning(e.team)
      } else if (e.type === 'defend') {
        this.agents.find(a => a.id === e.by)!.stats.defends++
        this.banner({ key: 'banner.defend', params: { name: nameOf(e.by), node: e.node } }, teamColor(e.team))
        this.sounds.warning(e.team)
      } else if (e.type === 'capture') {
        this.banner({ key: 'banner.nodeCaptured', params: { node: e.node, team: e.team } }, teamColor(e.team), 4)
        this.sounds.flagCaptured(e.team)
      }
      this.nodeFx?.burst(pos, e.team, e.type === 'capture')
      this.sounds.bannerChange(pos)
    }
    // The cast sound repeats for as long as someone keeps channelling.
    for (const id of this.channelSound.keys()) if (!m.channels.has(id)) this.channelSound.delete(id)
    for (const id of m.channels.keys()) {
      if ((this.channelSound.get(id) ?? 0) > this.time) continue
      const a = this.agents.find(x => x.id === id)
      if (a) this.sounds.channel(a)
      this.channelSound.set(id, this.time + CHANNEL_SOUND_REPEAT)
    }
  }

  private handleBuffEvents(): void {
    for (const e of this.buffs.events.splice(0)) {
      const spot = this.buffs.spots[e.spot]
      if (e.type === 'spawn') {
        this.sounds.buffSpawn(spot.pos)
        continue
      }
      const a = this.agents.find(x => x.id === e.by)!
      if (e.kind === 'heal') a.hp = a.maxHp
      else a.haste = HASTE.seconds
      this.sounds.buff(a, e.kind, spot.pos)
      if (a === this.player) this.banner({ key: e.kind === 'heal' ? 'banner.buffHeal' : 'banner.buffSpeed', params: { s: HASTE.seconds } }, e.kind === 'heal' ? '#8aff9a' : '#ffe27a', 2.5)
    }
  }

  private finish(result: MatchResult): void {
    this.ended = true
    this.result = result
    this.phase = 'over'
    this.sounds.victory(result.winner)
    this.input.unlockPointer()
    this.onEnd?.(this)
  }

  banner(msg: Msg, color: string, seconds = 3.5): void {
    this.banners.push({ msg, color, time: this.time + seconds })
    if (this.banners.length > 4) this.banners.shift()
  }

  // ---------- rendering ----------
  render(alpha: number, frameSeconds: number): void {
    const cam = this.renderer.camera
    const p = this.player
    const riding = p.mounted && p.alive
    // A scope is looked through from the eye, so the shoulder camera steps in while it is up.
    const scopeEye = this.view === 'third' && !riding && p.alive && this.zoom && !!p.weapon.view.scope
    const third = (this.view === 'third' || riding) && !scopeEye
    for (const a of this.agents) {
      const av = a.avatar
      if (!av) continue
      av.root.position.lerpVectors(a.prevPos, a.pos, alpha)
      av.root.rotation.y = a.yaw
      av.setState(a.locomotion())
      av.setChannel(!!this.ab?.channels.has(a.id))
      const far = av.root.position.distanceToSquared(cam.position) > (220 * this.magnify) ** 2
      if (a === p) {
        // Our own body: visible in third person (unless a wall pushed the camera into our head)
        // and while dead, when the orbit camera looks at it.
        av.root.visible = (third && this.boom > 0.7) || !p.alive
      } else {
        // Bodies overlap freely; hide anyone standing inside our own head.
        const inside = !third && p.alive && Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 0.9 && Math.abs(a.pos.y - p.pos.y) < 1.5
        av.root.visible = (!far || a.alive) && !inside
      }
      if (av.root.visible && !far) av.update(frameSeconds)
    }
    this.defense?.render(alpha)
    this.renderFlags()
    this.renderBanners(frameSeconds)
    this.renderRunes()
    this.fx.update(frameSeconds)
    this.hitMarker = Math.max(0, this.hitMarker - frameSeconds)
    this.damageFlash = Math.max(0, this.damageFlash - frameSeconds * 2)

    let fov = BASE_FOV
    if (p.alive) {
      const eye = new THREE.Vector3().lerpVectors(p.prevPos, p.pos, alpha)
      eye.y += p.eyeHeight
      cam.rotation.order = 'YXZ'
      cam.rotation.set(this.camLook.pitch, this.camLook.yaw + Math.PI, 0)
      if (third) {
        this.placeShoulderCamera(eye, frameSeconds, riding)
        if (this.zoom && !riding) fov = p.weapon.view.scope ? 32 : 58
      } else {
        cam.position.copy(eye)
        this.boom = SHOULDER.back
        const v = p.weapon.view
        if (this.zoom && v.adsFov) fov = v.zoomFovs?.[this.scopeStep] ?? v.adsFov
      }
      const firstPerson = this.view === 'first' && !riding
      cam.updateMatrixWorld()
      if (firstPerson) this.viewmodel.update(frameSeconds, { agent: p, look: this.lookFrame, ads: this.zoom, time: this.time })
      // The gun goes away once it is up against the eye.
      this.scoped = scopeEye || (firstPerson && this.zoom && !!p.weapon.view.scope && this.viewmodel.adsT > 0.8)
      this.viewmodel.root.visible = firstPerson && !this.scoped
      this.lookFrame = { x: 0, y: 0 }
      if (this.scoped) {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
        const hit = this.level.physics.ray(cam.position, dir, cam.far, GROUP_WORLD | GROUP_AGENT, p.collider)
        this.rangefinder = hit ? hit.distance : null
      }
    } else {
      this.scoped = false
      this.viewmodel.root.visible = false
      const orbit = this.time * 0.15
      const target = new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z)
      cam.position.set(target.x + Math.sin(orbit) * 8, target.y + 6, target.z + Math.cos(orbit) * 8)
      cam.lookAt(target)
    }
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov += (fov - cam.fov) * Math.min(1, frameSeconds * 14)
      cam.updateProjectionMatrix()
    }
    const halfTan = (deg: number) => Math.tan((deg * Math.PI) / 360)
    this.magnify = Math.max(1, halfTan(BASE_FOV) / halfTan(cam.fov))
    this.renderer.setMagnification(this.magnify)
    audio.setListener(cam)
    cam.updateMatrixWorld()
    this.plates?.update(this.agents, cam, (agent) => this.phase !== 'over' && agent.alive && (!!agent.avatar?.root.visible || !!this.defense?.isMonster(agent.id)), this.magnify)
    this.renderer.render(this.viewmodel.root.visible)
  }

  /**
   * Over-the-shoulder camera. The boom is cast from the head toward the shoulder position; walls
   * (world geometry only) pull the camera in so it never ends up inside or behind a wall.
   */
  private placeShoulderCamera(eye: THREE.Vector3, dt: number, mounted = false): void {
    const cam = this.renderer.camera
    const q = cam.quaternion
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    const up = new THREE.Vector3(0, 1, 0)
    const off = mounted ? { right: 0.9, up: 0.55, back: 5.4 } : SHOULDER
    // Head clearance, then the shoulder offset, then the boom backwards from there.
    const pivot = eye.clone().addScaledVector(up, this.castClear(eye, up, off.up))
    pivot.addScaledVector(right, this.castClear(pivot, right, off.right))
    const want = this.castClear(pivot, back, off.back)
    // Pull in instantly, ease back out.
    this.boom = want < this.boom ? want : this.boom + (want - this.boom) * Math.min(1, dt * 5)
    cam.position.copy(pivot).addScaledVector(back, this.boom)
  }

  /** Distance we can travel from `from` along `dir` (up to `len`) keeping a margin from world geometry. */
  private castClear(from: THREE.Vector3, dir: THREE.Vector3, len: number): number {
    const margin = 0.25
    const hit = this.level.physics.ray(from, dir, len + margin, GROUP_WORLD)
    return hit ? Math.max(0.05, hit.distance - margin) : len
  }

  private renderFlags(): void {
    if (!this.wsg) return
    for (const team of TEAMS) {
      const flag = this.wsg.flags[team]
      const mesh = this.flagMeshes.get(team)!
      const mine = flag.status === 'carried' && flag.carrier === this.player.id && this.player.alive && this.view === 'first'
      mesh.visible = flag.status !== 'respawning' && !mine
      if (flag.status === 'carried') {
        const carrier = this.agents.find(a => a.id === flag.carrier)!
        const root = carrier.avatar?.root.position ?? carrier.pos
        const lift = carrier.mounted ? (carrier.avatar?.seatHeight ?? 1.6) : 0.6
        mesh.position.set(root.x - Math.sin(carrier.yaw) * 0.35, root.y + lift, root.z - Math.cos(carrier.yaw) * 0.35)
        mesh.rotation.y = carrier.yaw
        mesh.scale.setScalar(0.7)
      } else {
        mesh.position.set(flag.pos.x, flag.pos.y, flag.pos.z)
        mesh.rotation.y += 0.01
        mesh.scale.setScalar(1)
      }
    }
  }

  private renderBanners(dt: number): void {
    if (!this.ab) return
    for (const node of this.ab.nodes) {
      const slot = this.bannerMeshes.get(node.id)!
      const state = node.assaulter ? `banner_${node.assaulter}_contested` : node.owner ? `banner_${node.owner}` : 'banner_neutral'
      if (slot.state !== state) {
        if (slot.mesh) this.matchRoot.remove(slot.mesh)
        slot.mesh = props!.create(state)
        slot.mesh.position.set(node.pos.x, node.pos.y, node.pos.z)
        this.matchRoot.add(slot.mesh)
        // The first banners of the match just stand there.
        if (slot.state) slot.since = this.time
        slot.state = state
      }
      // A new banner shoots up out of the ground and settles with a little overshoot.
      const k = (this.time - slot.since) / 0.5
      slot.mesh!.scale.setScalar(k >= 1 ? 1 : 0.3 + 0.7 * easeOutBack(k))
      // Contested banners sway while the clock runs, as if someone is still tugging at them.
      slot.mesh!.rotation.z = node.assaulter ? Math.sin(this.time * 2.4) * 0.035 : 0
    }
    this.nodeFx?.update(dt, this.time, this.ab, this.agents)
  }

  /** Runes hover and turn over their spot while they can be taken. */
  private renderRunes(): void {
    this.buffs.spots.forEach((spot, i) => {
      const ready = this.buffs.ready(spot)
      for (const [kind, mesh] of Object.entries(this.runeMeshes[i]) as [BuffKind, THREE.Group][]) {
        mesh.visible = ready && spot.kind === kind
        if (!mesh.visible) continue
        mesh.rotation.y = this.time * 1.4 + i
        mesh.position.y = spot.pos.y + 0.35 + Math.sin(this.time * 2.2 + i) * 0.12
      }
    })
  }

  /** Remove this match's objects so the next match can reuse the level. */
  dispose(): void {
    this.defense?.dispose()
    this.plates?.dispose()
    this.plates = null
    this.sounds.stop()
    this.renderer.scene.remove(this.matchRoot, this.level.world.root)
    this.renderer.camera.remove(this.viewmodel.root)
    for (const a of this.agents) a.dispose()
    this.level.physics.refreshQueries()
  }
}

const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2

export const teamColor = (team: Team): string => (team === 'alliance' ? '#5aa0ff' : '#ff5a4a')

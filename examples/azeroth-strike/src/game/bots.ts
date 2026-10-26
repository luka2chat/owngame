import * as THREE from 'three'
import type { NavGraph, Point } from '../world/nav'
import { type Agent } from './agent'
import type { TeamIntel } from './intel'
import type { AbMatch, NodeState } from './rules/ab'
import type { BuffSpot, Buffs } from './rules/buffs'
import type { WsgMatch } from './rules/wsg'
import { type Route, along, reversed } from './routes'
import { type Team, other } from './teams'
import { botWantsMount, type MountWish } from './mount'
import { WEAPONS, type WeaponId } from './weapons'

export type Role = 'attack' | 'defend' | 'mid'
export type Skill = { reaction: number; aimError: number; turnRate: number; headChance: number }

export const SKILLS: Record<'easy' | 'normal' | 'hard', Skill> = {
  easy: { reaction: 0.7, aimError: 0.07, turnRate: 3.2, headChance: 0.05 },
  normal: { reaction: 0.45, aimError: 0.04, turnRate: 5, headChance: 0.15 },
  hard: { reaction: 0.28, aimError: 0.022, turnRate: 7.5, headChance: 0.3 },
}

/** What a bot may ask the game to do this step. */
export type BotIntent = { wish: THREE.Vector3; jump: boolean; fire: boolean; heavy: boolean; channel: string | null; weapon: WeaponId | null; mount: MountWish }

/** World access the AI needs; implemented by Game. */
export interface BotWorld {
  defenseGoal?(agent: Agent): Point | null
  readonly defense?: {core: Point} | null
  readonly nav: NavGraph
  readonly agents: readonly Agent[]
  readonly time: number
  readonly wsg: WsgMatch | null
  readonly ab: AbMatch | null
  /** WSG lanes from the alliance flag to the horde flag; empty when the map has none. */
  readonly routes: readonly Route[]
  readonly buffs: Buffs
  /** Unobstructed line from eye to point (world geometry only). */
  sees(from: THREE.Vector3, to: THREE.Vector3): boolean
  graveyardOf(team: Team): Point
  intel(team: Team): TeamIntel
}

/** Fighting distance each gun is happiest at: closer backs off, farther closes in. */
const RANGE: Record<WeaponId, [number, number]> = { rifle: [14, 45], sniper: [25, 110], wand: [10, 35], dagger: [0, 2] }
/** Below this a sniper bot falls back to the wand: the bolt is too slow for a scrap. */
const SNIPER_MIN = 16
/** Seconds a bot spends bringing the scope up before its first sniper shot at a new target. */
const SCOPE_SETTLE = 0.5
/** Attackers regroup at the last lane waypoint at least this far from the enemy flag. */
const STAGE_DISTANCE = 60

/** Which Arathi node each bot is heading for, so teammates spread out. */
const abAssignment = new WeakMap<Agent, string>()
/** WSG lane (index into the routes) and the job a bot took it for, so teammates spread out. */
const laneOf = new WeakMap<Agent, { lane: number; job: string }>()
/** WSG defence post each defender holds. */
const postOf = new WeakMap<Agent, number>()
const flipped = new WeakMap<readonly Route[], Route[]>()
const homeward = new WeakMap<Route, Route>()
const stages = new WeakMap<Route, number>()
const postsOf = new WeakMap<readonly Route[], { at: Point; look: Point }[]>()
/** WSG attackers holding at their lane's staging point, and when each team last went in. */
const staging = new WeakSet<Agent>()
const pushAt = new WeakMap<BotWorld, Record<Team, number>>()

/** Cross-map path searches allowed per step, so a whole team retargeting at once does not hitch. */
const longSearches = new WeakMap<BotWorld, { time: number; left: number }>()
function takeLongSearch(w: BotWorld): boolean {
  let s = longSearches.get(w)
  if (!s) longSearches.set(w, (s = { time: -1, left: 0 }))
  if (s.time !== w.time) {
    s.time = w.time
    s.left = 1
  }
  return s.left-- > 0
}

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const tmp3 = new THREE.Vector3()

const flat = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)

/** Lanes as seen from `team`: from its own flag towards the enemy's. */
function teamRoutes(w: BotWorld, team: Team): readonly Route[] {
  if (team === 'alliance' || !w.routes.length) return w.routes
  let r = flipped.get(w.routes)
  if (!r) flipped.set(w.routes, (r = w.routes.map(reversed)))
  return r
}

function homewardOf(r: Route): Route {
  let h = homeward.get(r)
  if (!h) homeward.set(r, (h = reversed(r)))
  return h
}

function stageOf(r: Route): number {
  let s = stages.get(r)
  if (s === undefined) {
    const flag = r.points[r.points.length - 1]
    s = 0
    r.points.forEach((p, i) => {
      if (flat(p, flag) > STAGE_DISTANCE) s = i
    })
    stages.set(r, s)
  }
  return s
}

/** Yards from each waypoint of a route to its end. */
const remainingOf = new WeakMap<Route, Float32Array>()

/**
 * Where to get on a route from `p`, and roughly how far the whole trip is. The closest waypoint
 * can sit behind a wall or on another floor (a graveyard next to the base), so prefer the one
 * that leaves the least to go overall.
 */
function joinRoute(r: Route, p: Point): { idx: number; cost: number } {
  const pts = r.points
  let rem = remainingOf.get(r)
  if (!rem) {
    rem = new Float32Array(pts.length)
    for (let i = pts.length - 2; i >= 0; i--) rem[i] = rem[i + 1] + flat(pts[i], pts[i + 1])
    remainingOf.set(r, rem)
  }
  let nearest = Infinity
  for (const q of pts) nearest = Math.min(nearest, flat(q, p))
  let idx = 0
  let cost = Infinity
  for (let i = 0; i < pts.length; i++) {
    const d = flat(pts[i], p)
    if (d > nearest + 50) continue
    const c = d * 1.25 + Math.abs(pts[i].y - p.y) * 3 + rem[i]
    if (c < cost) {
      cost = c
      idx = i
    }
  }
  return { idx, cost }
}

/**
 * Where WSG defenders stand: the flag room, then where each lane enters the base (about 30 yards
 * out), each facing the way attackers come from.
 */
function defencePosts(routes: readonly Route[]): { at: Point; look: Point }[] {
  let posts = postsOf.get(routes)
  if (posts) return posts
  const stand = routes[0].points[0]
  posts = [{ at: stand, look: routes[0].points[Math.min(2, routes[0].points.length - 1)] }]
  for (const r of routes) {
    const j = r.points.findIndex(p => flat(p, stand) >= 30)
    if (j < 0) continue
    const at = r.points[j]
    if (posts.some(p => flat(p.at, at) < 12)) continue
    posts.push({ at, look: r.points[Math.min(j + 2, r.points.length - 1)] })
  }
  postsOf.set(routes, posts)
  return posts
}

export class Bot {
  goal: Point | null = null
  goalLabel = ''
  private path: Point[] = []
  private pathGoal: Point | null = null
  private repath = 0
  target: Agent | null = null
  private seenTimer = 0
  private thinkTimer = Math.random() * 0.3
  private perceiveTimer = Math.random() * 0.2
  private burst = 0
  private burstPause = 0
  private strafe = Math.random() < 0.5 ? 1 : -1
  private strafeTimer = 0
  private aimErr = new THREE.Vector2()
  private stuckTimer = 0
  private stuckPos = new THREE.Vector3()
  private jumpNext = false
  private stuckCount = 0
  private unstick = 0
  private unstickDir = new THREE.Vector3()
  private wander = 0
  private assignedNode: string | null = null
  /** Each bot favours one long gun; the wand and knife are situational. */
  readonly primary: WeaponId = Math.random() < 0.7 ? 'rifle' : 'sniper'
  private switchCooldown = 0
  /** Lane being followed and the index of its next waypoint. */
  private route: Route | null = null
  private routeIdx = 0
  private lane = -1
  private laneJob = ''
  private post = -1
  /** Regrouping before a push: done once per life. */
  private staged = false
  private stageWait = 0
  /** Arathi assault: the flank point to come in from, and whether we have been there. */
  private approach: Point | null = null
  private approached = false
  /** Each bot swings wide to one side when assaulting a node. */
  private readonly flank = (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.6)
  /** Where to face when holding still, and a nearby threat teammates reported. */
  private lookAt: Point | null = null
  private alert: Point | null = null
  private cover: Point | null = null
  private coverTimer = 0
  private visibleEnemies = 0
  /** In a fight close enough to stop for (see RANGE). */
  private engaged = false

  constructor(
    readonly agent: Agent,
    public role: Role,
    readonly skill: Skill,
  ) {}

  reset(): void {
    this.path = []
    this.pathGoal = null
    this.target = null
    this.seenTimer = 0
    this.goal = null
    this.route = null
    this.lane = -1
    this.laneJob = ''
    this.post = -1
    this.staged = false
    this.stageWait = 0
    this.approach = null
    this.approached = false
    this.lookAt = null
    this.alert = null
    this.cover = null
    laneOf.delete(this.agent)
    postOf.delete(this.agent)
    staging.delete(this.agent)
  }

  update(dt: number, w: BotWorld): BotIntent {
    const a = this.agent
    const intent: BotIntent = { wish: new THREE.Vector3(), jump: false, fire: false, heavy: false, channel: null, weapon: null, mount: null }
    a.aiming = false
    if (!a.alive) return intent
    this.switchCooldown -= dt

    this.perceiveTimer -= dt
    if (this.perceiveTimer <= 0) {
      this.perceiveTimer = 0.2
      this.perceive(w)
    }
    this.thinkTimer -= dt
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.5
      this.chooseGoal(w)
    }

    // Movement along the path.
    const urgent = this.isUrgent(w)
    let moveDir: THREE.Vector3 | null = null
    if (this.goal) {
      this.repath -= dt
      const goalMoved = !this.pathGoal || Math.hypot(this.goal.x - this.pathGoal.x, this.goal.z - this.pathGoal.z) > 4
      // Reaching a lane waypoint empties the path; plan the next leg straight away.
      const due = this.repath <= 0 || (!this.path.length && this.repath < 1)
      const far = flat(a.pos, this.goal)
      if ((goalMoved || !this.path.length) && due && (far < 120 || takeLongSearch(w))) {
        // Long searches are costly and their first legs stay good for a while; failures back off.
        const path = w.nav.findPath(a.pos, this.goal)
        this.repath = path ? 1.2 + Math.random() * 0.6 + Math.max(0, far - 60) / 50 : 4
        this.path = path ?? []
        this.pathGoal = { ...this.goal }
      }
      while (this.path.length && Math.hypot(this.path[0].x - a.pos.x, this.path[0].z - a.pos.z) < 1.1) this.path.shift()
      const next = this.path[0]
      if (next) {
        moveDir = tmp.set(next.x - a.pos.x, 0, next.z - a.pos.z)
        if (moveDir.lengthSq() > 1e-4) moveDir.normalize()
        else moveDir = null
      }
    }

    // Combat: face and shoot the target; manage range, strafe and take cover when not in a hurry.
    const t = this.target
    if (t && t.alive) {
      this.seenTimer += dt
      const aimPoint = tmp2.set(t.pos.x, t.pos.y + (Math.random() < this.skill.headChance ? t.headHeight : t.headHeight * 0.72), t.pos.z)
      const eye = a.eye(new THREE.Vector3())
      // Tracking lags a moving target, and the lag tells more the farther away it is.
      const lag = this.skill.reaction * 0.3 * Math.min(1, eye.distanceTo(aimPoint) / 60)
      aimPoint.addScaledVector(t.moveVel, -lag)
      const d = aimPoint.sub(eye)
      const dist = d.length()
      const wantYaw = Math.atan2(d.x, d.z) + this.aimErr.x
      const wantPitch = Math.asin(THREE.MathUtils.clamp(d.y / Math.max(dist, 1e-3), -1, 1)) + this.aimErr.y
      a.yaw = turnToward(a.yaw, wantYaw, this.skill.turnRate * dt)
      a.pitch += THREE.MathUtils.clamp(wantPitch - a.pitch, -this.skill.turnRate * dt, this.skill.turnRate * dt)
      this.aimErr.multiplyScalar(Math.max(0, 1 - dt * 1.5))
      const err = Math.abs(angleDiff(a.yaw, wantYaw)) + Math.abs(wantPitch - a.pitch)
      intent.weapon = this.pickWeapon(dist)
      const wd = WEAPONS[intent.weapon]
      const reach = wd.mode === 'melee' ? wd.range + 0.4 : wd.range * 0.8
      // Knife: rush in and stab from behind when we can.
      if (wd.mode === 'melee') {
        moveDir = dist > 1.2 ? d.clone().setY(0).normalize() : null
        const behind = Math.sin(t.yaw) * d.x + Math.cos(t.yaw) * d.z > 0
        intent.heavy = behind && t.hp / t.maxHp > 0.4
      }
      const [near, far] = RANGE[intent.weapon]
      // Far-off enemies get shot at on the move; only a fight within the gun's range stops us.
      // Riding down a lane, only someone right in the way is worth getting off for.
      const l = this.goalLabel
      const passing = a.mounted && (l === 'advance' || l === 'join' || l.startsWith('flank:'))
      this.engaged = dist < (passing ? 20 : far + 10) || !moveDir
      // Shooting dismounts, which is not worth it for a long shot.
      const riding = (a.mounted || a.mountCast > 0) && !this.engaged
      // A scoped shot waits for the scope to come up; hip shots with it are hopeless.
      const settle = wd.mode === 'bolt' ? SCOPE_SETTLE : 0
      if (!riding && this.seenTimer > this.skill.reaction + settle && err < 0.06 + (2 / Math.max(dist, 4)) * 0.05 + (wd.mode === 'melee' ? 0.3 : 0) && dist < reach) {
        if (this.burstPause > 0) this.burstPause -= dt
        else {
          intent.fire = true
          if (a.canFire()) {
            // Working the bolt throws the sight off the target; the next shot has to find it again.
            if (wd.mode === 'bolt') this.newAimError()
            this.burst++
            if (this.burst >= 3 + Math.floor(Math.random() * 5)) {
              this.burst = 0
              this.burstPause = dist > 40 ? 0.45 : 0.25
            }
          }
        }
      }
      if (!urgent && wd.mode !== 'melee' && this.engaged) {
        this.strafeTimer -= dt
        if (this.strafeTimer <= 0) {
          this.strafeTimer = 0.5 + Math.random() * 1.1
          this.strafe = -this.strafe
        }
        const right = new THREE.Vector3(-Math.cos(a.yaw), 0, Math.sin(a.yaw)).multiplyScalar(this.strafe)
        const toTarget = d.clone().setY(0).normalize()
        // Bots on their way somewhere zigzag on down the path, only stopping for fights up close.
        const pressing = moveDir && dist > 16 && (l === 'advance' || l === 'attack' || l === 'join' || l.startsWith('flank:') || l.startsWith('assault:'))
        if (dist < near) right.addScaledVector(toTarget, -0.8)
        else if (pressing) right.multiplyScalar(0.6).add(moveDir!)
        else if (dist > far) right.addScaledVector(moveDir ?? toTarget, 0.7)
        const probe = { x: a.pos.x + right.x * 1.5, y: a.pos.y, z: a.pos.z + right.z * 1.5 }
        if (w.nav.nearest(probe, 1) < 0) this.strafe = -this.strafe
        moveDir = right.lengthSq() > 0 ? right.normalize() : null
        // A scoped rifle only hits standing still: plant and look down the glass between bolts.
        if (wd.mode === 'bolt' && dist > near && a.weaponId === 'sniper') {
          moveDir = null
          a.aiming = this.seenTimer > this.skill.reaction + SCOPE_SETTLE * 0.5
        }
        // Reloading in the open, or hurt and outnumbered: duck behind something first.
        const exposed = a.reloadTimer > 0 || (a.hp < a.maxHp * 0.35 && this.visibleEnemies >= 2)
        if (exposed && dist > 6) {
          this.coverTimer -= dt
          if (this.coverTimer <= 0) {
            this.coverTimer = 0.8
            this.cover = this.findCover(w, t)
          }
          if (this.cover) {
            const c = tmp3.set(this.cover.x - a.pos.x, 0, this.cover.z - a.pos.z)
            moveDir = c.lengthSq() > 0.6 ? c.normalize() : null
          }
        } else this.cover = null
      }
      if (a.ammo === 0 && wd.mode !== 'melee') a.startReload()
    } else {
      this.seenTimer = 0
      this.engaged = false
      this.cover = null
      // Face a threat teammates just reported, else the way we walk, else the way trouble comes from.
      const face = this.alert ?? (moveDir ? null : this.lookAt)
      if (face) a.yaw = turnToward(a.yaw, Math.atan2(face.x - a.pos.x, face.z - a.pos.z), 6 * dt)
      else if (moveDir) a.yaw = turnToward(a.yaw, Math.atan2(moveDir.x, moveDir.z), 8 * dt)
      a.pitch *= 0.9
      if (a.weapon.mode !== 'melee' && a.ammo < a.weapon.magazine * 0.5) a.startReload()
      // Out of a fight: put the primary back in hand.
      if (a.weaponId !== this.primary && this.switchCooldown <= 0) {
        intent.weapon = this.primary
        this.switchCooldown = 1.5
      }
    }

    // Assaulting an Arathi node: stand still on the banner.
    if (w.ab && this.assignedNode) {
      const node = w.ab.node(this.assignedNode)
      const close = Math.hypot(node.pos.x - a.pos.x, node.pos.z - a.pos.z) < 3.5
      if (close && w.ab.canAssault(node, a.team) && !(t && t.alive && this.seenTimer > 0.2)) {
        intent.channel = node.id
        moveDir = null
      }
    }

    if (this.unstick > 0) {
      this.unstick -= dt
      moveDir = this.unstickDir
    }
    if (moveDir) {
      const speed = a.speed() * (this.isCarrier(w) ? (w.wsg?.speedMultiplier(a.id) ?? 1) : 1)
      intent.wish.copy(moveDir).multiplyScalar(speed)
    }

    // Stuck detection: hop and repath.
    this.stuckTimer += dt
    if (this.stuckTimer > 1.2) {
      const moved = this.stuckPos.distanceTo(a.pos)
      if (intent.wish.lengthSq() > 1 && moved < 0.8) {
        this.jumpNext = true
        this.repath = 0
        this.path = []
        this.cover = null
        // Repeatedly wedged: back off in a random direction before trying the path again.
        if (++this.stuckCount >= 2) {
          const ang = Math.random() * Math.PI * 2
          this.unstickDir.set(Math.sin(ang), 0, Math.cos(ang))
          this.unstick = 0.6 + Math.random() * 0.6
        }
      } else this.stuckCount = 0
      this.stuckTimer = 0
      this.stuckPos.copy(a.pos)
    }
    if (this.jumpNext && a.grounded) {
      intent.jump = true
      this.jumpNext = false
    }
    intent.mount = botWantsMount({
      goalDist: this.travelLeft(),
      fighting: this.engaged && this.seenTimer > 0.15,
      carrying: this.isCarrier(w),
      channeling: intent.channel !== null,
      urgent: this.isUrgent(w),
    })
    // The summon roots us for a second and a half: not with an enemy close by.
    const close = RANGE[a.weaponId][1] + 25
    if (intent.mount === 'on' && !a.mounted && this.target?.alive && this.target.pos.distanceTo(a.pos) < close) intent.mount = null
    return intent
  }

  /** How far we still have to go: to the end of this leg of the lane when following one, else to the goal. */
  private travelLeft(): number {
    if (!this.goal) return 0
    let left = flat(this.goal, this.agent.pos)
    const r = this.route
    const l = this.goalLabel
    if (!r || (l !== 'advance' && l !== 'attack' && l !== 'capture')) return left
    const end = l === 'advance' ? stageOf(r) : r.points.length - 1
    for (let i = this.routeIdx; i < end; i++) left += flat(r.points[i], r.points[i + 1])
    return left
  }

  /** Weapon for a fight at `dist` yards, with a cooldown so bots do not flicker between guns. */
  private pickWeapon(dist: number): WeaponId {
    const a = this.agent
    let want: WeaponId = this.primary
    if (dist < 2.2) want = 'dagger'
    else if (this.primary === 'sniper' && dist < SNIPER_MIN) want = 'wand'
    else if (a.weapon.mode !== 'melee' && a.ammo === 0 && dist < 25) want = a.weaponId === 'wand' ? this.primary : 'wand'
    if (want === a.weaponId) return want
    // Close-quarters swaps happen at once; others wait out the cooldown.
    if (this.switchCooldown > 0 && want !== 'dagger') return a.weaponId
    this.switchCooldown = 1.5
    return want
  }

  /** A nearby spot the target cannot see, to reload or wait for help behind. */
  private findCover(w: BotWorld, t: Agent): Point | null {
    const a = this.agent
    const nav = w.nav
    const eye = t.eye(new THREE.Vector3())
    const nodes = nav.nodesNear(a.pos.x, a.pos.z, 9)
    let best: Point | null = null
    let bestD = Infinity
    for (let i = 0; i < 14 && nodes.length; i++) {
      const n = nodes[(Math.random() * nodes.length) | 0]
      if (Math.abs(nav.y[n] - a.pos.y) > 2.5) continue
      const d = Math.hypot(nav.x[n] - a.pos.x, nav.z[n] - a.pos.z)
      if (d >= bestD || w.sees(eye, tmp3.set(nav.x[n], nav.y[n] + 1.3, nav.z[n]))) continue
      best = nav.point(n)
      bestD = d
    }
    return best
  }

  private isCarrier(w: BotWorld): boolean {
    return !!w.wsg?.carrying(this.agent.id)
  }

  /** Objectives that should not be abandoned to duel: carrying the flag or a flag return run. */
  private isUrgent(w: BotWorld): boolean {
    if (this.isCarrier(w)) return true
    const l = this.goalLabel
    if (l === 'return' || l === 'pickup' || l === 'capture' || l === 'hunt' || l === 'escort') return true
    // Attackers push through unless the fight is right in their face.
    if (l === 'attack' || l.startsWith('assault:')) return !this.target || this.target.pos.distanceTo(this.agent.pos) > 18
    return false
  }

  /** Called by the game when we take damage: turn toward the attacker. */
  hurtBy(attacker: Agent | null): void {
    if (!attacker || !attacker.alive) return
    if (!this.target || !this.target.alive) {
      this.target = attacker
      this.seenTimer = Math.min(this.seenTimer, 0)
      this.newAimError()
    }
  }

  private newAimError(): void {
    const e = this.skill.aimError
    this.aimErr.set((Math.random() * 2 - 1) * e * 3, (Math.random() * 2 - 1) * e * 1.5)
  }

  private perceive(w: BotWorld): void {
    const a = this.agent
    const eye = a.eye(new THREE.Vector3())
    const intel = w.intel(a.team)
    let best: Agent | null = null
    let bestScore = Infinity
    let visible = 0
    const carriedFlagOfMine = w.wsg?.flags[a.team]
    for (const e of w.agents) {
      if (e.team === a.team || !e.alive) continue
      const d = e.pos.distanceTo(a.pos)
      if (d > 140) continue
      const toE = tmp.set(e.pos.x - a.pos.x, 0, e.pos.z - a.pos.z).normalize()
      const facing = toE.x * Math.sin(a.yaw) + toE.z * Math.cos(a.yaw)
      // Peripheral vision is short range; anything close or recently shooting us is noticed.
      if (!w.defense && facing < 0.2 && d > 12 && e !== a.lastAttacker) continue
      if (!w.sees(eye, tmp2.set(e.pos.x, e.pos.y + 1.2, e.pos.z))) continue
      visible++
      intel.report(e.id, e.pos, w.time)
      // Finish off the wounded first.
      let score = d * (0.6 + (0.4 * e.hp) / e.maxHp)
      if (carriedFlagOfMine?.status === 'carried' && carriedFlagOfMine.carrier === e.id) score *= 0.3
      if (w.defense) {
        const nearCore = flat(e.pos, w.defense.core)
        score *= nearCore < 9 ? 0.12 : nearCore < 25 ? 0.5 : 1
      }
      if (e === this.target) score *= 0.7
      if (score < bestScore) {
        bestScore = score
        best = e
      }
    }
    this.visibleEnemies = visible
    if (best !== this.target) {
      this.target = best
      this.seenTimer = 0
      this.newAimError()
    }
  }

  private setGoal(p: Point | null, label: string): void {
    this.goal = p
    this.goalLabel = label
  }

  private chooseGoal(w: BotWorld): void {
    const a = this.agent
    const s = w.intel(a.team).nearest(a.pos, 40, w.time, 3)
    this.alert = s ? { x: s.x, y: s.y, z: s.z } : null
    const rune = this.runeWorthIt(w)
    if (rune) return this.setGoal(rune.pos, 'buff')
    const defense = w.defenseGoal?.(a)
    if (defense) { this.setGoal(defense, 'defend-camp'); return }
    if (w.wsg) this.chooseWsg(w, w.wsg)
    else if (w.ab) this.chooseAb(w, w.ab)
  }

  /**
   * A ready rune worth the detour: restoration when hurt, speed when carrying the flag or passing
   * close. Objective runs (flag returns, hunting the carrier) only stop for one right by the way.
   */
  private runeWorthIt(w: BotWorld): BuffSpot | null {
    const a = this.agent
    const l = this.goalLabel
    const busy = l === 'return' || l === 'pickup' || l === 'hunt' || l === 'escort' || l.startsWith('assault:')
    const carrier = this.isCarrier(w)
    const hurt = a.hp < a.maxHp * 0.6
    let best: BuffSpot | null = null
    let bestD = Infinity
    for (const spot of w.buffs.spots) {
      if (!w.buffs.ready(spot) || Math.abs(spot.pos.y - a.pos.y) > 6) continue
      const d = flat(spot.pos, a.pos)
      let reach = 0
      if (spot.kind === 'heal' && hurt) reach = carrier ? 30 : 40
      else if (spot.kind === 'speed') reach = carrier ? 35 : 18
      if (busy) reach = Math.min(reach, 15)
      if (d < reach && d < bestD) {
        best = spot
        bestD = d
      }
    }
    return best
  }

  private chooseWsg(w: BotWorld, m: WsgMatch): void {
    const a = this.agent
    const mine = m.flags[a.team]
    const theirs = m.flags[other(a.team)]
    const routes = teamRoutes(w, a.team)
    staging.delete(a)
    if (m.carrying(a.id)) return this.carry(w, mine.stand, routes)
    const distTo = (p: Point) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z)
    if (mine.status === 'dropped' && (this.role !== 'attack' || distTo(mine.pos) < 60)) return this.setGoal(mine.pos, 'return')
    if (theirs.status === 'dropped' && (this.role === 'attack' || distTo(theirs.pos) < 50)) return this.setGoal(theirs.pos, 'pickup')
    if (mine.status === 'carried' && this.role !== 'attack') {
      const carrier = w.agents.find(x => x.id === mine.carrier)
      if (carrier && (this.role === 'defend' || distTo(carrier.pos) < 90))
        return this.setGoal({ x: carrier.pos.x, y: carrier.pos.y, z: carrier.pos.z }, 'hunt')
    }
    if (theirs.status === 'carried' && theirs.carrier !== a.id && this.role !== 'defend') {
      const carrier = w.agents.find(x => x.id === theirs.carrier)
      if (carrier) {
        const ang = (a.id * 2.4) % (Math.PI * 2)
        return this.setGoal({ x: carrier.pos.x + Math.cos(ang) * 4, y: carrier.pos.y, z: carrier.pos.z + Math.sin(ang) * 4 }, 'escort')
      }
    }
    if (this.role === 'attack' && theirs.status === 'base') return this.attack(w, theirs.stand, routes)
    if (this.role === 'defend') return this.defend(w, mine.stand, routes)
    // The attackers just went in: midfield follows them up for a while.
    const pushed = w.time - (pushAt.get(w)?.[a.team] ?? -99) < 20
    if (pushed && theirs.status === 'base' && distTo(theirs.stand) < 400) return this.setGoal(theirs.stand, 'join')
    return this.holdMid(w, mine.stand, theirs.stand, routes)
  }

  /** Lane for a job, picked once per life: fewest teammates on the same job, fewest enemies seen, shortest. */
  private laneFor(w: BotWorld, routes: readonly Route[], job: string): Route {
    if (this.lane < 0 || this.laneJob !== job || this.lane >= routes.length) {
      const a = this.agent
      const intel = w.intel(a.team)
      let best = 0
      let bestScore = Infinity
      routes.forEach((r, i) => {
        let mates = 0
        for (const x of w.agents) {
          const l = x !== a && x.team === a.team ? laneOf.get(x) : undefined
          if (l && l.lane === i && l.job === job) mates++
        }
        const trip = joinRoute(r, a.pos).cost / routes[0].length
        const score = mates * 2 + intel.along(r.points, 15, w.time) * 0.8 + (trip - 1) * 3 + Math.random() * 1.5
        if (score < bestScore) {
          bestScore = score
          best = i
        }
      })
      this.lane = best
      this.laneJob = job
      laneOf.set(a, { lane: best, job })
    }
    return routes[this.lane]
  }

  /** Next waypoint of `route`, skipping the ones already reached. */
  private follow(route: Route): Point {
    const a = this.agent
    const pts = route.points
    if (this.route !== route) {
      this.route = route
      this.routeIdx = joinRoute(route, a.pos).idx
    }
    while (this.routeIdx < pts.length - 1) {
      const cur = flat(pts[this.routeIdx], a.pos)
      if (cur < 7 || (cur < 24 && flat(pts[this.routeIdx + 1], a.pos) < cur)) this.routeIdx++
      else break
    }
    return pts[this.routeIdx]
  }

  /**
   * Down a lane to just short of the enemy base, then wait there until enough attackers are
   * holding at the staging points of all lanes, so the base gets hit from several sides at once.
   */
  private attack(w: BotWorld, flag: Point, routes: readonly Route[]): void {
    if (!routes.length) return this.setGoal(flag, 'attack')
    const r = this.laneFor(w, routes, 'attack')
    const wp = this.follow(r)
    const stage = stageOf(r)
    if (this.routeIdx <= stage) return this.setGoal(wp, 'advance')
    if (!this.staged) {
      const a = this.agent
      let push = pushAt.get(w)
      if (!push) pushAt.set(w, (push = { alliance: -99, horde: -99 }))
      staging.add(a)
      this.stageWait += 0.5
      const waiting = w.agents.filter(x => x.alive && x.team === a.team && staging.has(x)).length
      const attackers = w.agents.filter(x => x.alive && x.team === a.team && laneOf.get(x)?.job === 'attack').length
      const go = waiting >= Math.min(3, attackers) || this.stageWait > 14 || w.time - push[a.team] < 4
      if (!go) {
        this.lookAt = flag
        return this.setGoal(r.points[stage], 'stage')
      }
      if (w.time - push[a.team] >= 4) push[a.team] = w.time
      staging.delete(a)
      this.staged = true
    }
    return this.setGoal(this.routeIdx >= r.points.length - 1 ? flag : wp, 'attack')
  }

  /** Flag carrier: home along the lane with the fewest enemies seen on it lately. */
  private carry(w: BotWorld, stand: Point, routes: readonly Route[]): void {
    if (!routes.length) return this.setGoal(stand, 'capture')
    if (this.laneJob !== 'carry') {
      const intel = w.intel(this.agent.team)
      let best = 0
      let bestScore = Infinity
      routes.forEach((r, i) => {
        const trip = joinRoute(homewardOf(r), this.agent.pos).cost / routes[0].length
        const score = intel.along(r.points, 18, w.time) * 2 + (trip - 1) * 10 + Math.random()
        if (score < bestScore) {
          bestScore = score
          best = i
        }
      })
      this.lane = best
      this.laneJob = 'carry'
      laneOf.set(this.agent, { lane: best, job: 'carry' })
    }
    const home = homewardOf(routes[this.lane])
    const wp = this.follow(home)
    return this.setGoal(this.routeIdx >= home.points.length - 1 ? stand : wp, 'capture')
  }

  /** Hold the flag room or a base entrance; everyone converges on the flag when enemies show up there. */
  private defend(w: BotWorld, stand: Point, routes: readonly Route[]): void {
    const a = this.agent
    const near = w.intel(a.team).nearest(stand, 45, w.time, 6)
    if (near || !routes.length) {
      if (near) this.lookAt = { x: near.x, y: near.y, z: near.z }
      return this.patrol(w, stand, 10, 'defend')
    }
    const posts = defencePosts(routes)
    if (this.post < 0 || this.post >= posts.length) {
      const taken = posts.map((_, i) => w.agents.filter(x => x !== a && x.alive && x.team === a.team && postOf.get(x) === i).length)
      this.post = taken.indexOf(Math.min(...taken))
      postOf.set(a, this.post)
    }
    const p = posts[this.post]
    this.lookAt = p.look
    return this.patrol(w, p.at, this.post === 0 ? 6 : 3, 'post')
  }

  /** Midfield: each midfielder watches a different lane a little past the middle. */
  private holdMid(w: BotWorld, mine: Point, theirs: Point, routes: readonly Route[]): void {
    if (!routes.length) {
      const mid = { x: (mine.x + theirs.x) / 2, y: (mine.y + theirs.y) / 2, z: (mine.z + theirs.z) / 2 }
      return this.patrol(w, { x: mid.x + (theirs.x - mid.x) * 0.25, y: mid.y, z: mid.z + (theirs.z - mid.z) * 0.25 }, 45, 'mid')
    }
    const r = this.laneFor(w, routes, 'mid')
    this.lookAt = along(r, 0.85)
    return this.patrol(w, along(r, 0.55), 10, 'mid')
  }

  private patrol(w: BotWorld, center: Point, radius: number, label: string): void {
    this.wander -= 0.5
    if (this.goal && this.goalLabel === label && this.wander > 0) return
    this.wander = 8 + Math.random() * 10
    const n = w.nav.randomNear(center, radius)
    this.setGoal(n >= 0 ? w.nav.point(n) : center, label)
  }

  private chooseAb(w: BotWorld, m: AbMatch): void {
    const a = this.agent
    // Keep the current assignment for a while unless it is done.
    if (this.assignedNode) {
      const node = m.node(this.assignedNode)
      const done = !m.canAssault(node, a.team)
      if (!done || (this.role === 'defend' && node.owner === a.team)) {
        if (done) return this.guard(w, node)
        return this.assault(w, node)
      }
    }
    const team = a.team
    const intel = w.intel(team)
    const assigned = (id: string) => w.agents.filter(x => x !== a && x.alive && x.team === team && abAssignment.get(x) === id).length
    const scored = m.nodes.map(node => {
      const d = Math.hypot(node.pos.x - a.pos.x, node.pos.z - a.pos.z)
      const need = m.canAssault(node, team)
      const n = assigned(node.id)
      let score: number
      if (node.owner === team && node.assaulter === other(team)) score = d - 120 + n * 20
      // Heavily held nodes need a crowd: do not trickle in alone.
      else if (need) score = d + n * 45 + Math.max(0, intel.count(node.pos, 40, w.time) - n) * 30
      // Leave a couple of guards on each node we hold.
      else score = d + (n < 2 ? 60 : 400 + n * 50)
      return { node, score }
    })
    scored.sort((x, y) => x.score - y.score)
    const pick = scored[0].node
    if (pick.id !== this.assignedNode) {
      this.approach = null
      this.approached = false
      this.stageWait = 0
    }
    this.assignedNode = pick.id
    abAssignment.set(a, pick.id)
    this.role = m.canAssault(pick, team) ? 'attack' : 'defend'
    if (this.role === 'defend') this.guard(w, pick)
    else this.assault(w, pick)
  }

  private guard(w: BotWorld, node: NodeState): void {
    this.lookAt = w.graveyardOf(other(this.agent.team))
    this.patrol(w, node.pos, 8, 'guard:' + node.id)
  }

  /** Swing out to a flank point, wait there for company if the node is defended, then take it. */
  private assault(w: BotWorld, node: NodeState): void {
    const a = this.agent
    if (!this.approached && flat(node.pos, a.pos) > 45) {
      if (!this.approach) {
        const ang = Math.atan2(a.pos.x - node.pos.x, a.pos.z - node.pos.z) + this.flank
        const n = w.nav.randomNear({ x: node.pos.x + Math.sin(ang) * 32, y: node.pos.y, z: node.pos.z + Math.cos(ang) * 32 }, 5)
        // Off the side of a cliff-top node (Lumber Mill) the spot could be far below it.
        this.approach = n >= 0 && Math.abs(w.nav.y[n] - node.pos.y) < 10 ? w.nav.point(n) : node.pos
      }
      if (flat(this.approach, a.pos) > 7) return this.setGoal(this.approach, 'flank:' + node.id)
    }
    if (!this.approached) {
      this.stageWait += 0.5
      const defenders = w.intel(a.team).count(node.pos, 35, w.time, 8)
      const mates = w.agents.filter(x => x !== a && x.alive && x.team === a.team && flat(x.pos, a.pos) < 25).length
      if (defenders >= 2 && mates < 2 && this.stageWait < 8) {
        this.lookAt = node.pos
        return this.setGoal(this.approach ?? { x: a.pos.x, y: a.pos.y, z: a.pos.z }, 'stage')
      }
      this.approached = true
    }
    return this.setGoal(node.pos, 'assault:' + node.id)
  }
}

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDiff(from, to)
  return from + THREE.MathUtils.clamp(d, -maxStep, maxStep)
}

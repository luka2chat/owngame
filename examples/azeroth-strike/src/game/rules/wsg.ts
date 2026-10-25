import { type Combatant, type MatchResult, type Team, type Vec3, TEAMS, dist, other } from '../teams'

/**
 * Warsong Gulch capture-the-flag rules, as on retail:
 * - first team to 3 captures wins; after 20 minutes the team with more captures wins, a tied
 *   score goes to the team that captured last, and 0-0 is a draw;
 * - you score by touching your own flag stand with the enemy flag while your flag is at home;
 * - a dropped flag is returned instantly by a defender touching it, can be picked up again by an
 *   attacker (not by the one who dropped it for 3 s) and returns by itself after 10 s;
 * - after a capture both flags respawn after 20 s;
 * - once both flags have been held for a minute, carriers take a stacking Focused Assault debuff
 *   (+10% damage taken per stack, one stack every 30 s, max 10) that turns into Brutal Assault
 *   (also slowed) from 6 stacks.
 */
export const WSG = {
  capturesToWin: 3,
  timeLimit: 20 * 60,
  touchRadius: 2.2,
  droppedReturn: 10,
  dropperLock: 3,
  respawnAfterCapture: 20,
  assaultDelay: 60,
  assaultInterval: 30,
  assaultMaxStacks: 10,
  brutalFrom: 6,
} as const

export type FlagStatus = 'base' | 'carried' | 'dropped' | 'respawning'
export type FlagState = {
  /** Team that owns (defends) this flag. */
  team: Team
  status: FlagStatus
  stand: Vec3
  pos: Vec3
  carrier: number | null
  timer: number
  lockedId: number | null
  lockTimer: number
}

export type WsgEvent =
  | { type: 'pickup'; flag: Team; by: number }
  | { type: 'drop'; flag: Team; by: number }
  | { type: 'return'; flag: Team; by: number | null }
  | { type: 'capture'; team: Team; by: number }
  | { type: 'respawn' }
  | { type: 'end'; result: MatchResult }

export class WsgMatch {
  readonly flags: Record<Team, FlagState>
  readonly score: Record<Team, number> = { alliance: 0, horde: 0 }
  timeLeft: number = WSG.timeLimit
  lastCapture: Team | null = null
  result: MatchResult | null = null
  bothHeld = 0
  readonly events: WsgEvent[] = []

  constructor(stands: Record<Team, Vec3>) {
    const flag = (team: Team): FlagState => ({
      team,
      status: 'base',
      stand: { ...stands[team] },
      pos: { ...stands[team] },
      carrier: null,
      timer: 0,
      lockedId: null,
      lockTimer: 0,
    })
    this.flags = { alliance: flag('alliance'), horde: flag('horde') }
  }

  /** Flag (enemy team's) carried by this combatant, if any. */
  carrying(id: number): Team | null {
    for (const team of TEAMS) if (this.flags[team].status === 'carried' && this.flags[team].carrier === id) return team
    return null
  }

  get assaultStacks(): number {
    if (this.bothHeld < WSG.assaultDelay) return 0
    return Math.min(WSG.assaultMaxStacks, 1 + Math.floor((this.bothHeld - WSG.assaultDelay) / WSG.assaultInterval))
  }
  /** Damage taken multiplier for a combatant (Focused / Brutal Assault on carriers). */
  damageTakenMultiplier(id: number): number {
    return this.carrying(id) ? 1 + 0.1 * this.assaultStacks : 1
  }
  speedMultiplier(id: number): number {
    return this.carrying(id) && this.assaultStacks >= WSG.brutalFrom ? 0.85 : 1
  }

  /** The carrier died (or left): the flag falls where they stand. */
  dropFrom(id: number, at: Vec3): void {
    const team = this.carrying(id)
    if (!team) return
    const flag = this.flags[team]
    flag.status = 'dropped'
    flag.carrier = null
    flag.pos = { ...at }
    flag.timer = WSG.droppedReturn
    flag.lockedId = id
    flag.lockTimer = WSG.dropperLock
    this.events.push({ type: 'drop', flag: team, by: id })
  }

  private returnFlag(team: Team, by: number | null): void {
    const flag = this.flags[team]
    flag.status = 'base'
    flag.carrier = null
    flag.pos = { ...flag.stand }
    flag.timer = 0
    this.events.push({ type: 'return', flag: team, by })
  }

  update(dt: number, people: readonly Combatant[]): void {
    if (this.result) return
    this.timeLeft = Math.max(0, this.timeLeft - dt)
    const byId = new Map(people.map(p => [p.id, p]))

    for (const team of TEAMS) {
      const flag = this.flags[team]
      if (flag.lockTimer > 0) {
        flag.lockTimer -= dt
        if (flag.lockTimer <= 0) flag.lockedId = null
      }
      if (flag.status === 'respawning') {
        flag.timer -= dt
        if (flag.timer <= 0) {
          flag.status = 'base'
          flag.pos = { ...flag.stand }
          this.events.push({ type: 'respawn' })
        }
        continue
      }
      if (flag.status === 'carried') {
        const carrier = flag.carrier === null ? undefined : byId.get(flag.carrier)
        if (!carrier || !carrier.alive) {
          this.dropFrom(flag.carrier!, carrier?.pos ?? flag.pos)
          continue
        }
        flag.pos = { ...carrier.pos }
        continue
      }
      if (flag.status === 'dropped') {
        flag.timer -= dt
        if (flag.timer <= 0) {
          this.returnFlag(team, null)
          continue
        }
      }
      // Base or dropped: someone may touch it. Defenders return a dropped flag first.
      const touching = people.filter(p => p.alive && dist(p.pos, flag.pos) <= WSG.touchRadius)
      if (flag.status === 'dropped') {
        const defender = touching.find(p => p.team === team)
        if (defender) {
          this.returnFlag(team, defender.id)
          continue
        }
      }
      const attacker = touching.find(p => p.team !== team && p.id !== flag.lockedId && !this.carrying(p.id))
      if (attacker) {
        flag.status = 'carried'
        flag.carrier = attacker.id
        flag.pos = { ...attacker.pos }
        this.events.push({ type: 'pickup', flag: team, by: attacker.id })
      }
    }

    // Captures: carrier of the enemy flag touches their own stand while their flag is home.
    for (const team of TEAMS) {
      const enemyFlag = this.flags[other(team)]
      if (enemyFlag.status !== 'carried' || this.flags[team].status !== 'base') continue
      const carrier = byId.get(enemyFlag.carrier!)
      if (!carrier || dist(carrier.pos, this.flags[team].stand) > WSG.touchRadius) continue
      this.score[team] += 1
      this.lastCapture = team
      this.events.push({ type: 'capture', team, by: carrier.id })
      for (const t of TEAMS) {
        const f = this.flags[t]
        f.status = 'respawning'
        f.carrier = null
        f.timer = WSG.respawnAfterCapture
        f.pos = { ...f.stand }
      }
      this.bothHeld = 0
      if (this.score[team] >= WSG.capturesToWin) this.finish({ winner: team, reason: { key: 'result.wsgCaps', params: { team, n: WSG.capturesToWin } } })
    }

    const both = this.flags.alliance.status === 'carried' && this.flags.horde.status === 'carried'
    const bothHome = this.flags.alliance.status === 'base' && this.flags.horde.status === 'base'
    if (both) this.bothHeld += dt
    else if (bothHome) this.bothHeld = 0

    if (!this.result && this.timeLeft <= 0) this.finish(this.timeoutResult())
  }

  timeoutResult(): MatchResult {
    const { alliance, horde } = this.score
    if (alliance !== horde) {
      const winner: Team = alliance > horde ? 'alliance' : 'horde'
      return { winner, reason: { key: 'result.wsgMore', params: { team: winner } } }
    }
    if (alliance === 0) return { winner: null, reason: { key: 'result.wsgNone' } }
    return { winner: this.lastCapture, reason: { key: 'result.wsgLast', params: { team: this.lastCapture } } }
  }

  private finish(result: MatchResult): void {
    this.result = result
    this.events.push({ type: 'end', result })
  }
}

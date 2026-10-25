import * as THREE from 'three'
import { audio, type LoopHandle } from '../engine/audio'
import type { Agent } from './agent'
import type { BuffKind } from './rules/buffs'
import type { Team, Vec3 } from './teams'
import type { WeaponDef, WeaponId } from './weapons'

export type Surface = 'grass' | 'dirt' | 'wood' | 'stone'

const race = (team: Team) => (team === 'alliance' ? 'human' : 'orc')
/** Yards between footfalls at a run. */
const STRIDE = 2.1
/** Bots farther than this make no footsteps (and cost no ray casts). */
const STEP_RANGE = 30

/**
 * Turns match events into WoW client sounds and owns the per-match loops: map ambience, the
 * spirit healer drone while dead, and battleground music. The player's own sounds play
 * non-positionally; everyone else's come from where they happen.
 */
export class MatchSounds {
  private ambience: LoopHandle | null = null
  private ghost: LoopHandle | null = null
  private lastVoice = new WeakMap<Agent, number>()
  private stride = new WeakMap<Agent, number>()
  private airborne = new WeakMap<Agent, number>()
  private countdownShown = -1
  private readonly tmp = new THREE.Vector3()

  constructor(
    private readonly map: 'wsg' | 'ab',
    private readonly me: () => Agent,
  ) {}

  private at(a: Agent, height = a.headHeight): THREE.Vector3 | null {
    return a === this.me() ? null : this.tmp.set(a.pos.x, a.pos.y + height, a.pos.z)
  }

  begin(): void {
    this.ambience = audio.loop(`amb_${this.map}`, { fade: 3 })
  }

  /** Last five seconds of the preparation phase tick like the client's battleground timer. */
  countdown(secondsLeft: number): void {
    const s = Math.ceil(secondsLeft)
    if (s >= 1 && s <= 5 && s !== this.countdownShown) {
      this.countdownShown = s
      audio.play('countdown')
    }
  }

  live(): void {
    audio.play('countdownend')
    audio.startMusic(8)
  }

  shot(a: Agent, w: WeaponDef, heavy: boolean, muzzle: THREE.Vector3): void {
    const at = a === this.me() ? null : muzzle
    if (w.id === 'rifle') audio.play('gunfire', { at })
    // The long barrel: a deeper, louder crack.
    else if (w.id === 'sniper') audio.play('gunfire', { at, rate: 0.62, gain: 1.5 })
    else if (w.id === 'wand') audio.play('wand', { at })
    else audio.play(heavy ? 'swingheavy' : 'swing', { at })
  }

  dryFire(): void {
    audio.play('click', { rate: 0.7 })
  }

  impact(at: THREE.Vector3): void {
    audio.play('impact', { at })
  }

  /** Knife connecting: flesh (crit for backstabs and heads) or a wall. */
  melee(a: Agent, at: THREE.Vector3, hit: 'flesh' | 'crit' | 'wall'): void {
    audio.play(hit === 'crit' ? 'stabcrit' : hit === 'flesh' ? 'stab' : 'stabwall', { at: a === this.me() ? null : at })
  }

  /** Our bullet landed: a short tick, or a crunch for headshots. */
  hitConfirm(head: boolean): void {
    if (head) audio.play('stabcrit', { gain: 0.7 })
    else audio.play('click', { rate: 1.8, gain: 0.8 })
  }

  hurt(target: Agent, time: number, crit: boolean): void {
    if (time - (this.lastVoice.get(target) ?? -9) < 0.7) return
    this.lastVoice.set(target, time)
    audio.play(`${race(target.team)}${crit ? 'crit' : 'wound'}`, { at: this.at(target) })
  }

  death(target: Agent): void {
    this.lastVoice.set(target, Infinity)
    audio.play(`${race(target.team)}death`, { at: this.at(target, 1) })
    if (target === this.me()) {
      this.ghost?.stop(0.2)
      this.ghost = audio.loop('spirithealer', { fade: 3 })
    }
  }

  resurrect(a: Agent): void {
    this.lastVoice.delete(a)
    if (a !== this.me()) return
    this.ghost?.stop(1.5)
    this.ghost = null
    audio.play('resurrect')
  }

  /** Our weapon handling, timed by the viewmodel animation. */
  weapon(kind: 'draw' | 'holster' | 'slap' | 'rack' | 'bolt', w: WeaponId): void {
    if (kind === 'draw') audio.play(w === 'wand' ? 'wanddraw' : 'draw')
    else if (kind === 'holster') audio.play(w === 'wand' ? 'wandholster' : 'holster')
    else if (kind === 'slap') audio.play('gunload', { variant: 0 })
    else if (kind === 'rack') audio.play('gunload', { variant: 1 })
    else audio.play('gunload', { variant: 2, rate: 0.9 })
  }

  /** Someone took a rune: everyone nearby hears it, the taker right in the ear. */
  buff(a: Agent, kind: BuffKind, at: Vec3): void {
    audio.play(kind === 'heal' ? 'buffheal' : 'buffspeed', { at: a === this.me() ? null : this.tmp.set(at.x, at.y, at.z) })
  }

  buffSpawn(at: Vec3): void {
    audio.play('buffspawn', { at: this.tmp.set(at.x, at.y, at.z), gain: 0.7 })
  }

  /** The holy precast hum of someone channelling a banner. */
  channel(a: Agent): void {
    audio.play('nodechannel', { at: this.at(a, a.headHeight * 0.7) })
  }

  /** A banner going up after an assault, defence or capture. */
  bannerChange(at: Vec3): void {
    audio.play('bannerup', { at: this.tmp.set(at.x, at.y + 2, at.z) })
  }

  /** Footfalls from distance actually walked; landings thump. */
  steps(agents: readonly Agent[], listener: THREE.Vector3, surface: (a: Agent) => Surface): void {
    for (const a of agents) {
      if (!a.alive) continue
      const mine = a === this.me()
      if (!mine && a.pos.distanceToSquared(listener) > STEP_RANGE * STEP_RANGE) continue
      if (!a.grounded) {
        this.airborne.set(a, Math.min(this.airborne.get(a) ?? 0, a.vel.y))
        continue
      }
      const fall = this.airborne.get(a)
      if (fall !== undefined) {
        this.airborne.delete(a)
        if (fall < -6) this.step(a, surface(a), mine, 1.4)
      }
      const moved = Math.hypot(a.pos.x - a.prevPos.x, a.pos.z - a.prevPos.z)
      const s = (this.stride.get(a) ?? 0) + moved
      if (s >= STRIDE) {
        this.step(a, surface(a), mine, 1)
        this.stride.set(a, 0)
      } else this.stride.set(a, s)
    }
  }

  private step(a: Agent, surface: Surface, mine: boolean, gain: number): void {
    audio.play(`step${surface}`, { at: mine ? null : this.tmp.set(a.pos.x, a.pos.y, a.pos.z), gain: mine ? gain * 0.7 : gain })
  }

  flagTaken(flag: Team): void {
    audio.play(`flagtaken_${flag}`)
  }

  flagCaptured(scorer: Team): void {
    audio.play(`flagcaptured_${scorer}`)
  }

  /** Drops, returns, assaults and defends: the faction's PvP warning. */
  warning(team: Team): void {
    audio.play(`warning_${team}`)
  }

  victory(winner: Team | null): void {
    audio.stopMusic(1.5)
    if (winner) audio.play(`victory_${winner}`)
  }

  stop(): void {
    this.ambience?.stop(1)
    this.ghost?.stop(0.5)
    this.ambience = this.ghost = null
    audio.stopMusic(1)
  }
}

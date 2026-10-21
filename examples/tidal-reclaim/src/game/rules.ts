import { CONFIG } from './config'

/**
 * Pure free-for-all deathmatch rules. Scene code reports kills and ticks the clock; these
 * functions own frags, streaks, medals, win/lose and the final score (unit tested).
 */
export type Combatant = {
  id: number
  name: string
  isPlayer: boolean
  kills: number
  deaths: number
  streak: number
}

export type Medal = 'first' | 'headshot' | 'double' | 'triple' | 'multi' | 'spree' | 'rampage' | 'unstoppable' | 'revenge' | 'rocket'

export type PlayerStats = {
  shots: number
  hits: number
  headshots: number
  multiKills: number
  bestStreak: number
  damageDealt: number
}

export type MatchState = {
  phase: 'playing' | 'won' | 'lost'
  endReason: '' | 'frags' | 'time'
  timeLeft: number
  elapsed: number
  fragLimit: number
  combatants: Combatant[]
  firstBlood: boolean
  /** Player multi-kill chain. */
  multiCount: number
  multiTimer: number
  lastKillerOfPlayer: number
  stats: PlayerStats
  score: number
  unranked: boolean
}

export const PLAYER_ID = 0
export const MULTI_WINDOW = 3.2

export function createMatch(botNames: string[], seconds = CONFIG.match.seconds, fragLimit = CONFIG.match.fragLimit): MatchState {
  const combatants: Combatant[] = [
    { id: PLAYER_ID, name: 'YOU', isPlayer: true, kills: 0, deaths: 0, streak: 0 },
    ...botNames.map((name, i) => ({ id: i + 1, name, isPlayer: false, kills: 0, deaths: 0, streak: 0 })),
  ]
  return {
    phase: 'playing', endReason: '', timeLeft: seconds, elapsed: 0, fragLimit, combatants,
    firstBlood: false, multiCount: 0, multiTimer: 0, lastKillerOfPlayer: -1,
    stats: { shots: 0, hits: 0, headshots: 0, multiKills: 0, bestStreak: 0, damageDealt: 0 },
    score: 0, unranked: false,
  }
}

export type KillInfo = { killer: number; victim: number; headshot?: boolean; weapon?: string }
export type KillResult = { state: MatchState; medals: Medal[] }

/** Standings: most kills, then fewest deaths, then the player wins ties against bots. */
export function standings(s: MatchState): Combatant[] {
  return [...s.combatants].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || Number(b.isPlayer) - Number(a.isPlayer) || a.id - b.id)
}

export function placement(s: MatchState): number {
  return standings(s).findIndex(c => c.isPlayer) + 1
}

export function registerKill(s: MatchState, k: KillInfo): KillResult {
  if (s.phase !== 'playing') return { state: s, medals: [] }
  const combatants = s.combatants.map(c => ({ ...c }))
  const victim = combatants.find(c => c.id === k.victim)
  const killer = combatants.find(c => c.id === k.killer)
  const medals: Medal[] = []
  const next: MatchState = { ...s, combatants, stats: { ...s.stats } }
  if (!victim) return { state: s, medals }
  victim.deaths += 1
  victim.streak = 0
  const suicide = !killer || killer.id === victim.id
  if (suicide) {
    victim.kills = Math.max(0, victim.kills - 1)
  } else {
    killer.kills += 1
    killer.streak += 1
    if (killer.isPlayer) {
      if (!s.firstBlood) medals.push('first')
      if (k.headshot) {
        medals.push('headshot')
        next.stats.headshots += 1
      }
      if (k.weapon === 'rocket') medals.push('rocket')
      next.multiCount = s.multiTimer > 0 ? s.multiCount + 1 : 1
      next.multiTimer = MULTI_WINDOW
      if (next.multiCount === 2) medals.push('double')
      else if (next.multiCount === 3) medals.push('triple')
      else if (next.multiCount > 3) medals.push('multi')
      if (next.multiCount >= 2) next.stats.multiKills += 1
      if (killer.streak === 5) medals.push('spree')
      else if (killer.streak === 10) medals.push('rampage')
      else if (killer.streak === 15) medals.push('unstoppable')
      if (victim.id === s.lastKillerOfPlayer) {
        medals.push('revenge')
        next.lastKillerOfPlayer = -1
      }
      next.stats.bestStreak = Math.max(next.stats.bestStreak, killer.streak)
    }
    next.firstBlood = true
  }
  if (victim.isPlayer) {
    next.multiCount = 0
    next.multiTimer = 0
    if (!suicide) next.lastKillerOfPlayer = killer.id
  }
  next.score = computeScore(next)
  if (!suicide && killer.kills >= s.fragLimit) return { state: finish(next, 'frags'), medals }
  return { state: next, medals }
}

function finish(s: MatchState, reason: 'frags' | 'time'): MatchState {
  const won = standings(s)[0].isPlayer
  const done: MatchState = { ...s, phase: won ? 'won' : 'lost', endReason: reason, multiTimer: 0 }
  done.score = computeScore(done)
  return done
}

export function tick(s: MatchState, dt: number): MatchState {
  if (s.phase !== 'playing') return s
  const next = { ...s, timeLeft: Math.max(0, s.timeLeft - dt), elapsed: s.elapsed + dt, multiTimer: Math.max(0, s.multiTimer - dt) }
  if (next.multiTimer === 0) next.multiCount = 0
  if (next.timeLeft <= 0) return finish(next, 'time')
  return next
}

export function recordShot(s: MatchState, shots: number, hits: number, damage = 0): MatchState {
  if (s.phase !== 'playing') return s
  return { ...s, stats: { ...s.stats, shots: s.stats.shots + shots, hits: s.stats.hits + hits, damageDealt: s.stats.damageDealt + damage } }
}

export function accuracy(s: MatchState): number {
  return s.stats.shots > 0 ? s.stats.hits / s.stats.shots : 0
}

/** Final score: frags, headshots and multi-kills, plus placement and a win bonus. */
export function computeScore(s: MatchState): number {
  const me = s.combatants.find(c => c.isPlayer)!
  const S = CONFIG.score
  let score = me.kills * S.kill + s.stats.headshots * S.headshot + s.stats.multiKills * S.multi
  if (s.phase !== 'playing') {
    const place = placement(s)
    score += Math.max(0, s.combatants.length - place) * S.placement
    if (s.phase === 'won') score += S.win
  }
  return Math.max(0, Math.round(score))
}

export function leader(s: MatchState): Combatant {
  return standings(s)[0]
}

export function formatClock(seconds: number): string {
  const t = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** Armor absorbs a share of damage until depleted. Returns new health/armor. */
export function applyDamage(health: number, armor: number, amount: number, absorb = CONFIG.player.armorAbsorb): { health: number; armor: number } {
  const soaked = Math.min(armor, amount * absorb)
  return { health: Math.max(0, health - (amount - soaked)), armor: armor - soaked }
}

/** Splash damage falloff for explosions. */
export function splashDamage(maxDamage: number, radius: number, distance: number): number {
  if (distance >= radius) return 0
  const k = 1 - distance / radius
  return maxDamage * (0.25 + 0.75 * k * k)
}

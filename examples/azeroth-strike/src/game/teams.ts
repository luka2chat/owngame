import type { Msg } from '../i18n'

export type Team = 'alliance' | 'horde'
export const TEAMS: readonly Team[] = ['alliance', 'horde']
export const other = (team: Team): Team => (team === 'alliance' ? 'horde' : 'alliance')
export const TEAM_COLOR: Record<Team, string> = { alliance: '#3b8cff', horde: '#e23a2e' }

export type Vec3 = { x: number; y: number; z: number }
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** What the rules need to know about every combatant each step. */
export type Combatant = { id: number; team: Team; pos: Vec3; alive: boolean }

export type MatchResult = { winner: Team | null; reason: Msg }

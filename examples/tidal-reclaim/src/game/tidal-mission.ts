/** Deterministic rules, shared by the live game and regression tests. Metres and seconds. */
export const STATIONS = [
  { id: 'intake', x: -22, z: -18, label: 'mission.intake' },
  { id: 'filter', x: 23, z: -10, label: 'mission.filter' },
  { id: 'relay', x: 0, z: 25, label: 'mission.relay' },
] as const
export const EXTRACTION = { x: 0, z: -33 }
export const MISSION_LIMIT = 600
export const CHARGE_SECONDS = 35
export const EXTRACTION_SECONDS = 8
export type Mission = {
  phase: 'repair' | 'extract' | 'won' | 'lost'
  progress: number[]
  active: number | null
  elapsed: number
  extractElapsed: number
  extraction: number
  blocked: 'none' | 'away' | 'enemy'
}
export const newMission = (): Mission => ({ phase: 'repair', progress: [0, 0, 0], active: null, elapsed: 0, extractElapsed: 0, extraction: 0, blocked: 'none' })
export function activateStation(s: Mission, index: number, x: number, z: number): Mission {
  const station = STATIONS[index]
  if (s.phase !== 'repair' || s.active !== null || !station || s.progress[index] >= CHARGE_SECONDS || Math.hypot(x - station.x, z - station.z) > 3.4) return s
  return { ...s, active: index, blocked: 'none' }
}
export function stepMission(s: Mission, dt: number, player: {x: number; z: number; alive: boolean}, enemies: readonly {x: number; z: number}[]): Mission {
  if (s.phase === 'won' || s.phase === 'lost' || !Number.isFinite(dt) || dt <= 0) return s
  dt = Math.min(dt, 1)
  const next = { ...s, progress: [...s.progress], elapsed: s.elapsed + dt }
  if (!player.alive || next.elapsed >= MISSION_LIMIT) return { ...next, phase: 'lost' }
  const contested = (x: number, z: number, r: number) => enemies.some(e => Math.hypot(e.x - x, e.z - z) < r)
  if (s.phase === 'repair' && s.active !== null) {
    const p = STATIONS[s.active]
    next.blocked = Math.hypot(player.x - p.x, player.z - p.z) > 7 ? 'away' : contested(p.x, p.z, 4.5) ? 'enemy' : 'none'
    if (next.blocked === 'none') next.progress[s.active] = Math.min(CHARGE_SECONDS, s.progress[s.active] + dt)
    if (next.progress[s.active] >= CHARGE_SECONDS) {
      next.active = null
      if (next.progress.every(v => v >= CHARGE_SECONDS)) next.phase = 'extract'
    }
  } else if (s.phase === 'extract') {
    next.extractElapsed += dt
    next.blocked = Math.hypot(player.x - EXTRACTION.x, player.z - EXTRACTION.z) > 4 ? 'away' : contested(EXTRACTION.x, EXTRACTION.z, 4.5) ? 'enemy' : 'none'
    next.extraction = next.blocked === 'none' ? s.extraction + dt : 0
    if (next.extractElapsed >= 100) next.phase = 'lost'
    else if (next.extraction >= EXTRACTION_SECONDS) next.phase = 'won'
  }
  return next
}

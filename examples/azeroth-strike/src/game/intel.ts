import type { Point } from '../world/nav'

export type Sighting = { id: number; x: number; y: number; z: number; t: number }

/** What one team knows about the enemy: where its bots last saw (or were shot by) each enemy. */
export class TeamIntel {
  private readonly seen = new Map<number, Sighting>()

  report(id: number, p: Point, time: number): void {
    const s = this.seen.get(id)
    if (s) Object.assign(s, { x: p.x, y: p.y, z: p.z, t: time })
    else this.seen.set(id, { id, x: p.x, y: p.y, z: p.z, t: time })
  }

  /** The enemy died: whatever we knew about it is stale. */
  forget(id: number): void {
    this.seen.delete(id)
  }

  /** Enemies seen within `r` of `p` in the last `maxAge` seconds. */
  count(p: Point, r: number, time: number, maxAge = 8): number {
    let n = 0
    for (const s of this.seen.values()) if (time - s.t <= maxAge && Math.hypot(s.x - p.x, s.z - p.z) <= r) n++
    return n
  }

  /** Closest recent sighting within `r` of `p`. */
  nearest(p: Point, r: number, time: number, maxAge = 4): Sighting | null {
    let best: Sighting | null = null
    let bestD = r
    for (const s of this.seen.values()) {
      if (time - s.t > maxAge) continue
      const d = Math.hypot(s.x - p.x, s.z - p.z)
      if (d <= bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  /** Recent sightings near any of `points` (each enemy counted once). */
  along(points: readonly Point[], r: number, time: number, maxAge = 10): number {
    let n = 0
    for (const s of this.seen.values()) {
      if (time - s.t > maxAge) continue
      if (points.some(p => Math.hypot(s.x - p.x, s.z - p.z) <= r)) n++
    }
    return n
  }
}

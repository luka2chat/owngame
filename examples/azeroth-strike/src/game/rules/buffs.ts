import { type Combatant, type Vec3, dist } from '../teams'

/**
 * Battleground power-up runes: touching one takes it, and the spot comes back a while later.
 * A restoration rune heals to full and is left alone by anyone already at full health; a speed
 * rune works for anyone. Spots with several kinds roll a new one each time they come back.
 */
export const BUFFS = {
  respawn: 60,
  touchRadius: 1.8,
} as const

export type BuffKind = 'speed' | 'heal'
export type BuffSpawn = { pos: Vec3; kinds: readonly BuffKind[] }
export type BuffSpot = { id: number; pos: Vec3; kinds: readonly BuffKind[]; kind: BuffKind; respawnIn: number }

export type BuffEvent = { type: 'take'; spot: number; kind: BuffKind; by: number } | { type: 'spawn'; spot: number; kind: BuffKind }

export class Buffs {
  readonly spots: BuffSpot[]
  readonly events: BuffEvent[] = []

  constructor(
    spawns: readonly BuffSpawn[],
    private readonly rand = Math.random,
  ) {
    this.spots = spawns.map((s, id) => ({ id, pos: s.pos, kinds: s.kinds, kind: this.roll(s.kinds), respawnIn: 0 }))
  }

  ready(spot: BuffSpot): boolean {
    return spot.respawnIn <= 0
  }

  /** `wants` says whether a combatant would take a rune of that kind (full health skips healing). */
  update(dt: number, people: readonly Combatant[], wants: (id: number, kind: BuffKind) => boolean): void {
    for (const spot of this.spots) {
      if (spot.respawnIn > 0) {
        spot.respawnIn -= dt
        if (spot.respawnIn <= 0) {
          spot.respawnIn = 0
          spot.kind = this.roll(spot.kinds)
          this.events.push({ type: 'spawn', spot: spot.id, kind: spot.kind })
        }
        continue
      }
      const taker = people.find(p => p.alive && dist(p.pos, spot.pos) < BUFFS.touchRadius && wants(p.id, spot.kind))
      if (!taker) continue
      spot.respawnIn = BUFFS.respawn
      this.events.push({ type: 'take', spot: spot.id, kind: spot.kind, by: taker.id })
    }
  }

  private roll(kinds: readonly BuffKind[]): BuffKind {
    return kinds[Math.floor(this.rand() * kinds.length) % kinds.length]
  }
}

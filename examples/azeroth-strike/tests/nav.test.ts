import { describe, expect, it } from 'vitest'
import { type NavProbe, NavGraph } from '../src/world/nav'

/**
 * Fake world: flat ground at y=0 with a wall along x=10 (z<18), plus a second floor
 * at y=4 spanning x in [0,6] that is only reachable by a ramp along z in [20,30].
 */
function probe(): NavProbe {
  const floorAt = (x: number, z: number, from: number): number | null => {
    const floors: number[] = [0]
    if (x >= 0 && x <= 6 && z >= 0 && z <= 20) floors.push(4)
    if (x >= 0 && x <= 6 && z > 20 && z <= 30) floors.push(4 - ((z - 20) / 10) * 4)
    const below = floors.filter(y => y <= from).sort((a, b) => b - a)
    return below.length ? below[0] : null
  }
  const wall = (ax: number, az: number, bx: number, bz: number) => (ax - 10) * (bx - 10) <= 0 && Math.min(az, bz) < 18 && ax !== bx
  return {
    down(x, y, z, max) {
      const f = floorAt(x, z, y)
      return f !== null && y - f <= max ? { y: f, ny: 1 } : null
    },
    clear(ax, ay, az, bx, by, bz) {
      if (wall(ax, az, bx, bz)) return false
      // The second floor blocks vertical clearance checks from the ground beneath it.
      if (ax >= 0 && ax <= 6 && az >= 0 && az <= 20 && Math.min(ay, by) < 4 && Math.max(ay, by) > 4) return false
      return true
    },
  }
}

describe('NavGraph', () => {
  const nav = new NavGraph({ minX: -20, minZ: -10, maxX: 30, maxZ: 40 }, 1)
  nav.build(probe(), [{ x: -5, y: 0, z: 0 }])

  it('flood fills both layers of a two-storey area', () => {
    expect(nav.count).toBeGreaterThan(1500)
    const upper = nav.nearest({ x: 3, y: 4, z: 10 })
    const lower = nav.nearest({ x: 3, y: 0, z: 10 })
    expect(upper).toBeGreaterThanOrEqual(0)
    expect(lower).toBeGreaterThanOrEqual(0)
    expect(nav.y[upper]).toBeCloseTo(4)
    expect(nav.y[lower]).toBeCloseTo(0)
  })

  it('paths around walls and up ramps', () => {
    const around = nav.findPath({ x: 5, y: 0, z: 0 }, { x: 15, y: 0, z: 0 })!
    expect(around).not.toBeNull()
    expect(Math.max(...around.map(p => p.z))).toBeGreaterThan(17)
    const up = nav.findPath({ x: 3, y: 0, z: 10 }, { x: 3, y: 4, z: 5 })!
    expect(up.at(-1)!.y).toBeCloseTo(4)
    expect(Math.max(...up.map(p => p.z))).toBeGreaterThan(20)
  })

  it('round-trips through its binary snapshot', () => {
    const back = NavGraph.deserialize(nav.serialize().buffer as ArrayBuffer, nav.bounds, nav.cell)
    expect(back).not.toBeNull()
    const from = { x: 5, y: 0, z: 0 }
    const to = { x: 15, y: 0, z: 0 }
    expect(back!.findPath(from, to)).toEqual(nav.findPath(from, to))
    expect(back!.count).toBe(nav.count)
  })
})

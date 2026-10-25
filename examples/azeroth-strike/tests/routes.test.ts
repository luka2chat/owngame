import { describe, expect, it } from 'vitest'
import { findRoutes } from '../src/game/routes'
import { type NavProbe, NavGraph } from '../src/world/nav'

/** Flat field with a solid block over x in (minX, maxX), z in (minZ, maxZ). */
function field(minX: number, maxX: number, minZ: number, maxZ: number): NavProbe {
  const inBlock = (x: number, z: number) => x > minX && x < maxX && z > minZ && z < maxZ
  return {
    down: (x, y, z, max) => (!inBlock(x, z) && y <= max ? { y: 0, ny: 1 } : null),
    clear: (ax, _ay, az, bx, _by, bz) => !inBlock(ax, az) && !inBlock(bx, bz),
  }
}

describe('findRoutes', () => {
  const from = { x: 0, y: 0, z: 2 }
  const to = { x: 0, y: 0, z: 98 }
  const bounds = { minX: -40, minZ: 0, maxX: 40, maxZ: 100 }

  it('finds a lane round each side of an obstacle', async () => {
    const nav = new NavGraph(bounds, 1)
    nav.build(field(-12, 12, 30, 70), [from])
    const routes = await findRoutes(nav, from, to, { width: 6 })
    expect(routes.length).toBeGreaterThanOrEqual(2)
    const sides = routes.map(r => Math.sign(r.points.reduce((s, p) => s + p.x, 0)))
    expect(new Set(sides)).toEqual(new Set([-1, 1]))
    for (const r of routes) {
      expect(Math.abs(r.points[0].z - from.z)).toBeLessThan(1)
      expect(Math.abs(r.points.at(-1)!.z - to.z)).toBeLessThan(1)
    }
  })

  it('gives a single corridor a single route', async () => {
    // Everything between the ends is wall but a narrow passage along the right edge.
    const nav = new NavGraph(bounds, 1)
    nav.build(field(-41, 35, 12, 88), [from])
    const routes = await findRoutes(nav, from, to, { width: 6 })
    expect(routes.length).toBe(1)
  })
})

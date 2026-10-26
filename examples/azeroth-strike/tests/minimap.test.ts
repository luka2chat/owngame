import { describe, expect, it } from 'vitest'
import { MAP_VOID, minimapTransform, rasterTerrain, terrainColor } from '../src/world/minimap'

describe('minimap', () => {
  it('keeps terrain colours light enough to read', () => {
    for (const t of [0, 0.35, 0.7, 1]) {
      const [r, g, b] = terrainColor(t, 0.4)
      expect(r + g + b).toBeGreaterThan(280)
    }
    expect(MAP_VOID[0] + MAP_VOID[1] + MAP_VOID[2]).toBeGreaterThan(400)
  })

  it('paints sampled ground and leaves the surround the void colour', () => {
    const positions = new Float32Array([10, 5, 10, 12, 8, 10, 10, 5, 12, 12, 9, 12])
    const map = rasterTerrain([positions], 0, 20, 0, 20)
    const land = (map.rgba[0] + map.rgba[1] + map.rgba[2]) > 0
    expect(land).toBe(true)
    const ix = Math.round(11 * map.ppm)
    const iy = Math.round((20 - 11) * map.ppm)
    const o = (iy * map.width + ix) * 4
    expect(map.rgba[o] + map.rgba[o + 1] + map.rgba[o + 2]).toBeGreaterThan(280)
  })

  it('pins the player to the centre and puts world north above them when facing north', () => {
    const ppm = 1
    const minX = 0
    const maxZ = 100
    const m = minimapTransform(50, 50, 0, 90, 80, 90, minX, maxZ, ppm)
    const at = (x: number, z: number) => {
      const ix = (x - minX) * ppm
      const iy = (maxZ - z) * ppm
      return { x: m.a * ix + m.c * iy + m.e, y: m.b * ix + m.d * iy + m.f }
    }
    const here = at(50, 50)
    expect(here.x).toBeCloseTo(90)
    expect(here.y).toBeCloseTo(90)
    expect(at(50, 60).y).toBeLessThan(here.y)
  })
})
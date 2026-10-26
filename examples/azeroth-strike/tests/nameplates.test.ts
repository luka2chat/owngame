import { describe, expect, it } from 'vitest'
import { PLATE_RANGE, plateFill, plateScreen } from '../src/ui/nameplates'

describe('head health bars', () => {
  it('projects a head in front of the camera onto the screen', () => {
    const screen = plateScreen(0, 0, 0.2, 800, 600, 10)
    expect(screen).toEqual({ x: 400, y: 300, scale: 1 })
  })

  it('hides bars behind the camera, off the edges, or past the draw distance', () => {
    expect(plateScreen(0, 0, 1.1, 800, 600, 10)).toBeNull()
    expect(plateScreen(0, 0, 0.2, 800, 600, PLATE_RANGE + 1)).toBeNull()
    expect(plateScreen(3, 0, 0.2, 800, 600, 10)).toBeNull()
  })

  it('shrinks with distance and turns red as health drops', () => {
    const far = plateScreen(0, 0.2, 0.4, 1000, 800, 80)
    expect(far!.scale).toBeLessThan(0.7)
    expect(plateFill(90)).not.toBe(plateFill(10))
    expect(plateFill(10)).toBe('#e24b3a')
  })
})
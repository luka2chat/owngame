import { GROUP_WORLD, type Physics } from '../engine/physics'
import type { Hit, NavProbe } from './nav'

/** NavProbe backed by Rapier rays against static world geometry. */
export function physicsProbe(physics: Physics): NavProbe {
  const down = { x: 0, y: -1, z: 0 }
  const dir = { x: 0, y: 0, z: 0 }
  return {
    down(x, y, z, max): Hit | null {
      const hit = physics.ray({ x, y, z }, down, max, GROUP_WORLD)
      if (!hit) return null
      // Trimesh normals face either way; a floor is whatever we hit from above.
      return { y: hit.point.y, ny: Math.abs(hit.normal.y) }
    },
    clear(ax, ay, az, bx, by, bz) {
      const dx = bx - ax, dy = by - ay, dz = bz - az
      const len = Math.hypot(dx, dy, dz)
      if (len < 1e-4) return true
      dir.x = dx / len
      dir.y = dy / len
      dir.z = dz / len
      return physics.ray({ x: ax, y: ay, z: az }, dir, len, GROUP_WORLD) === null
    },
  }
}

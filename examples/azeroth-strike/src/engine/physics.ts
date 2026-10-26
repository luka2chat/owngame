import RAPIER from '@dimforge/rapier3d-compat'

export { RAPIER }

let ready: Promise<void> | undefined
/** Initialise the Rapier WASM module once, before creating any `Physics`. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init()
  return ready
}

/** Collision groups: membership in the high 16 bits, filter in the low 16 bits. */
export const GROUP_WORLD = 0x0001
export const GROUP_AGENT = 0x0002
export const groups = (member: number, filter: number): number => (member << 16) | filter

export type RayHit = { distance: number; point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; collider: RAPIER.Collider }

/** Owner of the Rapier world: static level geometry plus agent capsules. */
export class Physics {
  readonly world: RAPIER.World

  constructor(gravity = -19.3) {
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 })
  }

  step(stepSeconds: number): void {
    this.world.timestep = stepSeconds
    this.world.step()
  }

  /** New colliders only become visible to ray casts after the world updates its broad phase. */
  refreshQueries(): void {
    this.world.timestep = 0
    this.world.step()
  }

  /** Static triangle mesh; returns null for degenerate meshes Rapier rejects. */
  addTrimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.Collider | null {
    if (indices.length < 3) return null
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
    if (!desc) return null
    desc.setCollisionGroups(groups(GROUP_WORLD, 0xffff)).setFriction(0.8)
    return this.world.createCollider(desc)
  }

  /**
   * Cast a ray; `mask` selects which groups can be hit. `exclude` skips one collider (the shooter).
   */
  ray(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxToi: number, mask = 0xffff, exclude?: RAPIER.Collider): RayHit | null {
    const ray = new RAPIER.Ray(origin, dir)
    const hit = this.world.castRayAndGetNormal(ray, maxToi, true, undefined, groups(0xffff, mask), exclude)
    if (!hit) return null
    const p = ray.pointAt(hit.timeOfImpact)
    return { distance: hit.timeOfImpact, point: { x: p.x, y: p.y, z: p.z }, normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }, collider: hit.collider }
  }

  dispose(): void {
    this.world.free()
  }
}

/** Shape of public/assets/maps/<key>/map.json written by tools/build-assets.mjs. */
export type TerrainTile = {
  id: string
  count: number
  position: number
  normal: number
  index: number
  indexCount: number
  /** minX, minY, minZ, maxX, maxY, maxZ */
  bounds: number[]
  tex: string
}

export type ModelGroup = { start: number; count: number; tex: string | null; blend: number; twoSided: boolean }

export type ModelCollision = { vertexCount: number; positions: number; indices: number; indexCount: number }

export type ModelEntry = {
  name: string
  type: 'm2' | 'wmo'
  hidden: boolean
  vertexCount: number
  /** Byte offset of interleaved [px py pz nx ny nz u v] float32 vertices. */
  vertices: number
  indices: number
  indexCount: number
  wideIndex: boolean
  groups: ModelGroup[]
  /** 'render' = collide with the render mesh (WMO); object = dedicated M2 collision mesh. */
  collision: 'render' | ModelCollision | null
  /** Column-major 4x4 matrices in terrain space. */
  instances: number[][]
}

export type MapData = { key: string; map: string; terrain: TerrainTile[]; models: ModelEntry[] }

export const TILE_SIZE = 533.3333

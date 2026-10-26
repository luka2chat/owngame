import * as THREE from 'three'
import type { Physics, RAPIER } from '../engine/physics'
import type { MapData, ModelEntry, TerrainTile } from './mapdata'

/** Static collider of one terrain tile. */
export function addTileCollision(tile: TerrainTile, buf: ArrayBuffer, physics: Physics): RAPIER.Collider | null {
  const positions = new Float32Array(buf, tile.position, tile.count * 3)
  const index = new Uint16Array(buf, tile.index, tile.indexCount)
  return physics.addTrimesh(positions, Uint32Array.from(index))
}

const matrix = new THREE.Matrix4()
const v = new THREE.Vector3()

/** One static collider per placement: WMOs collide with their render mesh, M2s with their collision mesh. */
export function addModelCollision(model: ModelEntry, buf: ArrayBuffer, physics: Physics): void {
  if (!model.collision) return
  let positions: Float32Array, stride: number, indices: Uint32Array
  if (model.collision === 'render') {
    positions = new Float32Array(buf, model.vertices, model.vertexCount * 8)
    stride = 8
    const index = model.wideIndex ? new Uint32Array(buf, model.indices, model.indexCount) : new Uint16Array(buf, model.indices, model.indexCount)
    indices = Uint32Array.from(index)
  } else {
    positions = new Float32Array(buf, model.collision.positions, model.collision.vertexCount * 3)
    stride = 3
    indices = new Uint32Array(buf, model.collision.indices, model.collision.indexCount)
  }
  const count = positions.length / stride
  for (const m of model.instances) {
    matrix.fromArray(m)
    const out = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      v.set(positions[i * stride], positions[i * stride + 1], positions[i * stride + 2]).applyMatrix4(matrix)
      out[i * 3] = v.x
      out[i * 3 + 1] = v.y
      out[i * 3 + 2] = v.z
    }
    physics.addTrimesh(out, indices)
  }
}

/** Every collider of a map, in the same order the game creates them (used by the offline nav build). */
export function addMapCollision(data: MapData, terrain: ArrayBuffer, models: ArrayBuffer, physics: Physics): void {
  for (const tile of data.terrain) addTileCollision(tile, terrain, physics)
  for (const model of data.models) addModelCollision(model, models, physics)
}

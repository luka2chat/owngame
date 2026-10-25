import * as THREE from 'three'
import { type LoadTracker, Slicer } from '../engine/loader'
import type { Physics } from '../engine/physics'
import { addModelCollision, addTileCollision } from './collision'
import { type MapData, type ModelEntry, TILE_SIZE } from './mapdata'
import { type MinimapBake, rasterTerrain } from './minimap'

const ASSETS = './assets/'

/** Shared texture cache: many models reuse the same WoW textures. */
class Textures {
  private cache = new Map<string, THREE.Texture>()
  private loader = new THREE.TextureLoader()
  private requested = 0
  private settled = 0
  private onSettle: (() => void) | null = null
  constructor(private readonly anisotropy: number) {}

  get(key: string, repeat = true): THREE.Texture {
    let tex = this.cache.get(key)
    if (tex) return tex
    this.requested++
    const settle = () => {
      this.settled++
      this.onSettle?.()
    }
    tex = this.loader.load(ASSETS + key, settle, undefined, settle)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = this.anisotropy
    tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
    this.cache.set(key, tex)
    return tex
  }

  /** Resolves when every requested image has loaded (or failed), reporting the fraction done. */
  ready(progress: (f: number) => void): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        progress(this.requested ? this.settled / this.requested : 1)
        if (this.settled >= this.requested) {
          this.onSettle = null
          resolve()
        }
      }
      this.onSettle = check
      check()
    })
  }

  all(): THREE.Texture[] {
    return [...this.cache.values()]
  }
}

function material(textures: Textures, tex: string | null, blend: number, twoSided: boolean): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ color: tex ? 0xffffff : 0x8a7f6e })
  if (tex) mat.map = textures.get('tex/' + tex)
  mat.side = twoSided ? THREE.DoubleSide : THREE.FrontSide
  if (blend === 1) {
    mat.alphaTest = 0.5
  } else if (blend >= 2) {
    mat.transparent = true
    mat.depthWrite = false
    if (blend === 3 || blend === 4) mat.blending = THREE.AdditiveBlending
  }
  return mat
}

/** Render + collision data of one battleground map. */
export class World {
  readonly root = new THREE.Group()
  readonly bounds = new THREE.Box3()
  /** Collider handles of the terrain tiles; everything else is buildings and doodads. */
  readonly terrainColliders = new Set<number>()
  private terrainTiles: { minX: number; minZ: number; maxX: number; maxZ: number; positions: Float32Array; index: Uint16Array }[] = []
  private textures: Textures | null = null
  private minimapBake: MinimapBake | null = null

  private constructor(readonly data: MapData) {}

  /** Fetches map.json and the gzipped geometry in parallel, then builds in time slices. */
  static async load(key: string, renderer: THREE.WebGLRenderer, physics: Physics, tracker: LoadTracker): Promise<World> {
    const dataP = tracker.json<MapData>(`${ASSETS}maps/${key}/map.json`)
    const terrainP = tracker.fetch(`${ASSETS}maps/${key}/terrain.bin.gz`)
    const modelsP = tracker.fetch(`${ASSETS}maps/${key}/models.bin.gz`)
    const world = new World(await dataP)
    const textures = (world.textures = new Textures(Math.min(8, renderer.capabilities.getMaxAnisotropy())))
    const slicer = new Slicer()
    const terrain = await terrainP
    tracker.set('load.terrain', 'terrain', 0)
    await world.buildTerrain(terrain, textures, physics, slicer, f => tracker.set('load.terrain', 'terrain', f))
    const models = await modelsP
    await world.buildModels(models, textures, physics, slicer, f => tracker.set('load.models', 'models', f))
    await textures.ready(f => tracker.set('load.textures', 'textures', f))
    return world
  }

  /** Upload every map texture to the GPU now instead of on the first rendered frame. */
  async uploadTextures(renderer: THREE.WebGLRenderer): Promise<void> {
    const slicer = new Slicer()
    for (const tex of this.textures?.all() ?? []) {
      if (tex.image) renderer.initTexture(tex)
      await slicer.tick()
    }
  }

  private async buildTerrain(buf: ArrayBuffer, textures: Textures, physics: Physics, slicer: Slicer, progress: (f: number) => void): Promise<void> {
    const tiles = this.data.terrain
    for (const [ti, tile] of tiles.entries()) {
      const positions = new Float32Array(buf, tile.position, tile.count * 3)
      const normals = new Int8Array(buf, tile.normal, tile.count * 4)
      const index = new Uint16Array(buf, tile.index, tile.indexCount)
      const [minX, , minZ, maxX, , maxZ] = tile.bounds
      const uv = new Float32Array(tile.count * 2)
      for (let i = 0; i < tile.count; i++) {
        uv[i * 2] = (maxX - positions[i * 3]) / TILE_SIZE
        uv[i * 2 + 1] = (positions[i * 3 + 2] - minZ) / TILE_SIZE
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(normals, 4), 3, 0, true))
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      geometry.setIndex(new THREE.BufferAttribute(index, 1))
      geometry.computeBoundingSphere()
      geometry.computeBoundingBox()
      this.bounds.union(geometry.boundingBox!)
      const mat = new THREE.MeshLambertMaterial({ map: textures.get(tile.tex, false) })
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.name = 'terrain_' + tile.id
      mesh.receiveShadow = true
      this.root.add(mesh)
      this.terrainTiles.push({ minX, minZ, maxX, maxZ, positions, index })
      await slicer.tick()
      const collider = addTileCollision(tile, buf, physics)
      if (collider) this.terrainColliders.add(collider.handle)
      progress((ti + 1) / tiles.length)
      await slicer.tick()
    }
  }

  private async buildModels(buf: ArrayBuffer, textures: Textures, physics: Physics, slicer: Slicer, progress: (f: number) => void): Promise<void> {
    const models = this.data.models
    for (const [mi, model] of models.entries()) {
      if (!model.hidden) {
        const verts = new Float32Array(buf, model.vertices, model.vertexCount * 8)
        const index = model.wideIndex ? new Uint32Array(buf, model.indices, model.indexCount) : new Uint16Array(buf, model.indices, model.indexCount)
        this.addInstanced(model, verts, index, textures)
      }
      addModelCollision(model, buf, physics)
      if (mi % 8 === 0) progress(mi / models.length)
      await slicer.tick()
    }
    progress(1)
  }

  private addInstanced(model: ModelEntry, verts: Float32Array, allIndex: Uint16Array | Uint32Array, textures: Textures): void {
    const interleaved = new THREE.InterleavedBuffer(verts, 8)
    const position = new THREE.InterleavedBufferAttribute(interleaved, 3, 0)
    const normal = new THREE.InterleavedBufferAttribute(interleaved, 3, 3)
    const uv = new THREE.InterleavedBufferAttribute(interleaved, 2, 6)
    const matrix = new THREE.Matrix4()
    for (const group of model.groups) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', position)
      geometry.setAttribute('normal', normal)
      geometry.setAttribute('uv', uv)
      geometry.setIndex(new THREE.BufferAttribute(allIndex.subarray(group.start, group.start + group.count), 1))
      const mesh = new THREE.InstancedMesh(geometry, material(textures, group.tex, group.blend, group.twoSided), model.instances.length)
      model.instances.forEach((m, i) => mesh.setMatrixAt(i, matrix.fromArray(m)))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.name = model.name
      mesh.castShadow = model.type === 'm2' && group.blend <= 1
      mesh.receiveShadow = true
      this.root.add(mesh)
    }
  }

  /** Light top-down image of this map, built once from the terrain meshes. */
  overview(): MinimapBake {
    if (this.minimapBake) return this.minimapBake
    const raster = rasterTerrain(
      this.terrainTiles.map(tile => tile.positions),
      this.bounds.min.x,
      this.bounds.max.x,
      this.bounds.min.z,
      this.bounds.max.z,
    )
    const canvas = document.createElement('canvas')
    canvas.width = raster.width
    canvas.height = raster.height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const image = ctx.createImageData(raster.width, raster.height)
      image.data.set(raster.rgba)
      ctx.putImageData(image, 0, 0)
    }
    this.minimapBake = { canvas, minX: this.bounds.min.x, maxZ: this.bounds.max.z, ppm: raster.ppm }
    return this.minimapBake
  }

  /** Terrain height under (x, z) from the terrain triangles (ignores buildings). */
  terrainHeight(x: number, z: number): number | null {
    for (const t of this.terrainTiles) {
      if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue
      const p = t.positions
      for (let i = 0; i < t.index.length; i += 3) {
        const a = t.index[i] * 3, b = t.index[i + 1] * 3, c = t.index[i + 2] * 3
        const x0 = p[a], z0 = p[a + 2], x1 = p[b], z1 = p[b + 2], x2 = p[c], z2 = p[c + 2]
        if (Math.max(x0, x1, x2) < x || Math.min(x0, x1, x2) > x || Math.max(z0, z1, z2) < z || Math.min(z0, z1, z2) > z) continue
        const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2)
        const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d
        const l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d
        const l2 = 1 - l0 - l1
        if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue
        return l0 * p[a + 1] + l1 * p[b + 1] + l2 * p[c + 1]
      }
    }
    return null
  }
}

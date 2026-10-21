import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Assets } from '../engine/assets'
import { PURIFIER_MODEL } from './tidal-assets'

/**
 * Asset library: CC0 Poly Haven PBR texture sets, HDRI sky and prop models, all loaded at boot
 * behind the progress bar (the whole arena is the first playable segment).
 */
export const TEXTURE_SETS = [
  'concrete_floor_03',
  'concrete_floor_worn_001',
  'concrete_wall_008',
  'rusty_metal_02',
  'corrugated_iron_02',
  'metal_plate',
] as const
export type TextureSet = (typeof TEXTURE_SETS)[number]

export const MODELS = ['barrel_03', 'old_military_crate', 'wooden_military_crate', 'medical_box', 'ammo_box', 'propane_tank', 'utility_box_02', 'security_light', 'armor_plate', 'jersey_barrier', 'sandbags', 'frag_grenade'] as const
export type ModelId = (typeof MODELS)[number]

export type PbrSet = { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }

export type Library = {
  sets: Record<TextureSet, PbrSet>
  models: Record<ModelId, GLTF>
  envHdr: THREE.DataTexture
  sky: THREE.Texture
  purifier: GLTF
}

export async function loadLibrary(assets: Assets, anisotropy: number, onProgress: (p: number) => void): Promise<Library> {
  const base = 'assets/'
  const jobs: Promise<unknown>[] = []
  let done = 0
  let total = 0
  const track = <T>(p: Promise<T>): Promise<T> => {
    total += 1
    jobs.push(p)
    return p.then(v => {
      done += 1
      onProgress(done / total)
      return v
    })
  }
  const sets = {} as Record<TextureSet, PbrSet>
  const setPromises = TEXTURE_SETS.map(async name => {
    const [map, normalMap, arm] = await Promise.all([
      track(assets.texture(`${base}tex/${name}_diff.webp`, { color: true })),
      track(assets.texture(`${base}tex/${name}_nor.webp`, { color: false })),
      track(assets.texture(`${base}tex/${name}_arm.webp`, { color: false })),
    ])
    for (const t of [map, normalMap, arm]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = anisotropy
    }
    sets[name] = { map, normalMap, arm }
  })
  const models = {} as Record<ModelId, GLTF>
  const modelPromises = MODELS.map(async id => {
    models[id] = await track(assets.gltf(`${base}models/${id}.glb`))
  })
  const envHdr = track(new HDRLoader().loadAsync(`${base}hdri/sky_1k.hdr`))
  const sky = track(assets.texture(`${base}hdri/sky_2k.webp`, { color: true }))
  const purifier = track(assets.gltf(PURIFIER_MODEL))
  await Promise.all([...setPromises, ...modelPromises, envHdr, sky, purifier])
  const skyTex = await sky
  skyTex.mapping = THREE.EquirectangularReflectionMapping
  const env = await envHdr
  env.mapping = THREE.EquirectangularReflectionMapping
  return { sets, models, envHdr: env, sky: skyTex, purifier: await purifier }
}

/** Re-scale a BoxGeometry's UVs so textures tile at `tile` metres on every face. */
export function worldBox(w: number, h: number, d: number, tile = 4): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f += 1) {
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile)
    }
  }
  uv.needsUpdate = true
  g.setAttribute('uv1', uv.clone())
  return g
}

export type MatOptions = {
  color?: THREE.ColorRepresentation
  roughness?: number
  metalness?: number
  normalScale?: number
  envMapIntensity?: number
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
}

/** Standard PBR material from a Poly Haven set (ARM = AO/roughness/metalness packed). */
export function pbr(set: PbrSet, o: MatOptions = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.arm,
    metalnessMap: set.arm,
    aoMap: set.arm,
    aoMapIntensity: 0.9,
    color: o.color ?? '#ffffff',
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 1,
    envMapIntensity: o.envMapIntensity ?? 0.45,
  })
  m.normalScale.setScalar(o.normalScale ?? 1)
  if (o.emissive) {
    m.emissive.set(o.emissive)
    m.emissiveIntensity = o.emissiveIntensity ?? 1
  }
  return m
}

/** Tileable value-noise canvas texture for procedural roughness / grime (weapons, robots). */
export function noiseTexture(size = 256, seed = 1, scale = 8, contrast = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  let s = seed * 9301 + 49297
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const layers = [scale, scale * 2, scale * 4, scale * 8]
  const grids = layers.map(n => Array.from({ length: n * n }, rand))
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = 0
      let amp = 0.5
      for (let l = 0; l < layers.length; l += 1) {
        const n = layers[l]
        const fx = (x / size) * n
        const fy = (y / size) * n
        const x0 = Math.floor(fx)
        const y0 = Math.floor(fy)
        const tx = fx - x0
        const ty = fy - y0
        const g = grids[l]
        const at = (a: number, b: number) => g[((b % n) * n + (a % n))]
        const sx = tx * tx * (3 - 2 * tx)
        const sy = ty * ty * (3 - 2 * ty)
        const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx
        const bot = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx
        v += (top * (1 - sy) + bot * sy) * amp
        amp *= 0.5
      }
      const c = Math.max(0, Math.min(255, (0.5 + (v / 0.9375 - 0.5) * contrast) * 255))
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export type GrimeOptions = {
  /** 0..1 strength of dark grime blotches. */
  amount?: number
  /** World-space frequency multiplier (higher = smaller blotches). */
  scale?: number
  /** 0..1 wet patches (lower roughness + slightly darker albedo); floors only. Kept subtle to avoid glare. */
  wet?: number
  /** 0..1 darkening toward the ground contact line (walls, props). */
  foot?: number
}

/**
 * Break up tiling with world-space grime, contact darkening and restrained wet patches, so
 * repeated PBR textures read as a lived-in industrial site. Pure shader patch: no extra textures.
 */
export function applyGrime(m: THREE.MeshStandardMaterial, o: GrimeOptions = {}): void {
  const amount = o.amount ?? 0.8
  const scale = o.scale ?? 1
  const wet = o.wet ?? 0
  const foot = o.foot ?? 1
  m.onBeforeCompile = shader => {
    shader.uniforms.uGrime = { value: new THREE.Vector4(amount, scale, wet, foot) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrimeW;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vGrimeW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vGrimeW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrimeW;
        uniform vec4 uGrime;
        float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float gNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float gFbm(vec3 p) { return gNoise(p) * 0.55 + gNoise(p * 2.13) * 0.28 + gNoise(p * 4.7) * 0.17; }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 gP = vGrimeW * 0.23 * uGrime.y;
        float gN = gFbm(gP);
        float grime = smoothstep(0.42, 0.78, gN) * uGrime.x;
        float footK = uGrime.w * (1.0 - smoothstep(0.0, 1.6, vGrimeW.y)) * (0.55 + 0.45 * gFbm(gP * 3.0));
        float puddle = uGrime.z * smoothstep(0.58, 0.72, gFbm(vGrimeW * 0.11 + 7.3));
        diffuseColor.rgb *= (1.0 - grime * 0.42) * (1.0 - footK * 0.35) * (1.0 - puddle * 0.22);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + grime * 0.12 - puddle * 0.42, 0.34, 1.0);`,
      )
  }
  m.customProgramCacheKey = () => `grime-${amount}-${scale}-${wet}-${foot}`
  m.needsUpdate = true
}

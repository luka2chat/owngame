import * as THREE from 'three'

/**
 * Visual effects. Everything is pooled: instanced billboard particles (additive + alpha) driven by
 * generated 4×4 flipbook atlases, bullet hole / scorch / oil decals, ejected shell casings,
 * tumbling debris (gibs), shockwave rings and a small pool of flash lights that always stay in
 * the scene (no shader recompiles).
 */
export type Ground = (x: number, z: number, y: number) => number

/** Generated VFX atlases (public/assets/fx, built by scripts/build-v2.py). */
export type FxTextures = { additive: THREE.Texture; smoke: THREE.Texture; decals: THREE.Texture }

type Emit = {
  pos: THREE.Vector3
  vel?: THREE.Vector3
  life: number
  size: number
  size1?: number
  color: [number, number, number, number]
  color1?: [number, number, number, number]
  drag?: number
  gravity?: number
  rot?: number
  spin?: number
  /** Logical frame (see F / SMOKE); remapped to the physical atlas cell. */
  frame?: number
  /** Flipbook: advance this many frames over the particle's life. */
  anim?: number
  stretch?: number
}

/** Logical additive frames (4×4 generated atlas layout). */
export const F = { fire: 0, muzzleFront: 8, muzzleSide: 10, streak: 12, glow: 13, ring: 14, burst: 15 } as const
/** Fallback 2×2 procedural atlas: glow, smoke, flame, flare. */
const FALLBACK_ADD = [2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2, 0, 0, 0, 3]

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iColor;
attribute vec4 iMisc; // size, rotation, frame, stretch
uniform float grid;
uniform float tintFrom;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
varying float vTint;
uniform float fogDensity;
uniform float maxScreen;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 corner = position.xy;
  float size = iMisc.x;
  float depth = -mv.z;
  // Overdraw guards. A sprite wider than maxScreen (NDC units, 2 = full height) is shrunk to it, and
  // sprites the camera is inside fade out and then collapse, so they are never rasterised: a few
  // full-screen smoke quads blended at full resolution were the main cost of an explosion up close.
  float ndc = size * projectionMatrix[1][1] / max(depth, 1e-3);
  size *= min(1.0, maxScreen / max(ndc, 1e-4));
  float nearFade = clamp((depth - 0.25) / (0.35 + iMisc.x * 0.45), 0.0, 1.0);
  if (nearFade <= 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0);
    vColor = vec4(0.0);
    vFog = 0.0;
    vTint = 0.0;
    return;
  }
  if (iMisc.w > 0.0) {
    // Velocity-aligned sprite: texture u runs along the motion (streaks, flame plumes).
    vec3 velView = (viewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 dir = velView.xy;
    float len = length(dir);
    dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float L = min(size + len * iMisc.w, size * 8.0 + 0.5);
    mv.xy += dir * corner.x * L + perp * corner.y * size;
  } else {
    float c = cos(iMisc.y);
    float s = sin(iMisc.y);
    mv.xy += mat2(c, -s, s, c) * corner * size;
  }
  gl_Position = projectionMatrix * mv;
  float f = iMisc.z;
  vec2 cell = vec2(mod(f, grid), floor(f / grid));
  vUv = (uv + cell) / grid;
  vTint = f >= tintFrom ? 1.0 : 0.0;
  vColor = vec4(iColor.rgb, iColor.a * nearFade);
  float d = depth;
  vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
}
`
const FRAG_ADD = /* glsl */ `
uniform sampler2D atlas;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
varying float vTint;
void main() {
  vec4 t = texture2D(atlas, vUv);
  float a = t.a * vColor.a * (1.0 - vFog);
  // Coloured cells (fire, muzzle) keep their painted colour; neutral cells take the emitter tint.
  float lum = max(t.r, max(t.g, t.b));
  vec3 base = mix(t.rgb, vec3(lum), vTint);
  gl_FragColor = vec4(vColor.rgb * base * a, a);
}
`
const FRAG_ALPHA = /* glsl */ `
#include <packing>
uniform sampler2D atlas;
uniform vec3 fogColor;
uniform sampler2D sceneDepth;
uniform vec2 depthRes;
uniform float camNear;
uniform float camFar;
uniform float offscreen;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
varying float vTint;
void main() {
  vec4 t = texture2D(atlas, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  if (offscreen > 0.5) {
    // Half-res pass: no depth buffer here, so test against the scene depth manually (soft edge).
    float sceneZ = -perspectiveDepthToViewZ(texture2D(sceneDepth, gl_FragCoord.xy / depthRes).x, camNear, camFar);
    float z = -perspectiveDepthToViewZ(gl_FragCoord.z, camNear, camFar);
    a *= clamp((sceneZ - z) / 0.7, 0.0, 1.0);
    if (a < 0.004) discard;
  }
  vec3 c = mix(vColor.rgb * t.rgb, fogColor, vFog);
  gl_FragColor = vec4(c, a);
}
`

class ParticleSystem {
  readonly mesh: THREE.Mesh
  private readonly max: number
  private n = 0
  // Simulation state (struct of arrays).
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly c0: Float32Array
  private readonly c1: Float32Array
  private readonly misc: Float32Array // life, maxLife, size0, size1
  private readonly misc2: Float32Array // drag, gravity, spin, rot
  private readonly misc3: Float32Array // frame, stretch, anim
  // GPU attributes.
  private readonly aPos: THREE.InstancedBufferAttribute
  private readonly aVel: THREE.InstancedBufferAttribute
  private readonly aColor: THREE.InstancedBufferAttribute
  private readonly aMisc: THREE.InstancedBufferAttribute
  private readonly geo: THREE.InstancedBufferGeometry

  /** `remap` maps logical frames to physical atlas cells (identity when omitted). */
  constructor(max: number, atlas: THREE.Texture, additive: boolean, fog: THREE.FogExp2, grid: number, private readonly remap?: number[]) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.c0 = new Float32Array(max * 4)
    this.c1 = new Float32Array(max * 4)
    this.misc = new Float32Array(max * 4)
    this.misc2 = new Float32Array(max * 4)
    this.misc3 = new Float32Array(max * 3)
    const quad = new THREE.PlaneGeometry(1, 1)
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = quad.index
    this.geo.setAttribute('position', quad.getAttribute('position'))
    this.geo.setAttribute('uv', quad.getAttribute('uv'))
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('iPos', this.aPos)
    this.geo.setAttribute('iVel', this.aVel)
    this.geo.setAttribute('iColor', this.aColor)
    this.geo.setAttribute('iMisc', this.aMisc)
    this.geo.instanceCount = 0
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_ADD : FRAG_ALPHA,
      uniforms: {
        atlas: { value: atlas }, fogDensity: { value: fog.density }, fogColor: { value: fog.color },
        grid: { value: grid }, tintFrom: { value: grid >= 4 ? 12 : 0 }, maxScreen: { value: additive ? 1.6 : 1.1 },
        sceneDepth: { value: null }, depthRes: { value: new THREE.Vector2(1, 1) }, camNear: { value: 0.1 }, camFar: { value: 1000 }, offscreen: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      // Alpha smoke uses "over" with alpha accumulation so it can also render into an empty (0,0,0,0)
      // half-res target and be composited premultiplied; on screen it matches NormalBlending.
      blending: additive ? THREE.AdditiveBlending : THREE.CustomBlending,
      ...(additive ? {} : {
        blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      }),
    })
    this.mesh = new THREE.Mesh(this.geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = additive ? 20 : 10
  }

  get count(): number {
    return this.n
  }

  /** Fraction of the pool in use. */
  get fill(): number {
    return this.n / this.max
  }

  emit(e: Emit): void {
    let i = this.n
    if (i >= this.max) i = Math.floor(Math.random() * this.max)
    else this.n += 1
    const i3 = i * 3
    const i4 = i * 4
    const { pos, vel, c0, c1, misc, misc2, misc3 } = this
    pos[i3] = e.pos.x
    pos[i3 + 1] = e.pos.y
    pos[i3 + 2] = e.pos.z
    const v = e.vel
    vel[i3] = v ? v.x : 0
    vel[i3 + 1] = v ? v.y : 0
    vel[i3 + 2] = v ? v.z : 0
    const c = e.color
    const d = e.color1
    for (let k = 0; k < 4; k += 1) {
      c0[i4 + k] = c[k]
      c1[i4 + k] = d ? d[k] : k === 3 ? 0 : c[k]
    }
    misc[i4] = e.life
    misc[i4 + 1] = e.life
    misc[i4 + 2] = e.size
    misc[i4 + 3] = e.size1 ?? e.size
    misc2[i4] = e.drag ?? 0
    misc2[i4 + 1] = e.gravity ?? 0
    misc2[i4 + 2] = e.spin ?? 0
    misc2[i4 + 3] = e.rot ?? Math.random() * Math.PI * 2
    misc3[i3] = e.frame ?? 0
    misc3[i3 + 1] = e.stretch ?? 0
    misc3[i3 + 2] = e.anim ?? 0
  }

  update(dt: number): void {
    const { pos, vel, c0, c1, misc, misc2, misc3, remap } = this
    const P = this.aPos.array as Float32Array
    const V = this.aVel.array as Float32Array
    const C = this.aColor.array as Float32Array
    const M = this.aMisc.array as Float32Array
    let i = 0
    while (i < this.n) {
      const life = misc[i * 4] - dt
      if (life <= 0) {
        // Swap-remove with the last particle.
        const last = this.n - 1
        if (i !== last) {
          pos.copyWithin(i * 3, last * 3, last * 3 + 3)
          vel.copyWithin(i * 3, last * 3, last * 3 + 3)
          c0.copyWithin(i * 4, last * 4, last * 4 + 4)
          c1.copyWithin(i * 4, last * 4, last * 4 + 4)
          misc.copyWithin(i * 4, last * 4, last * 4 + 4)
          misc2.copyWithin(i * 4, last * 4, last * 4 + 4)
          misc3.copyWithin(i * 3, last * 3, last * 3 + 3)
        }
        this.n -= 1
        continue
      }
      misc[i * 4] = life
      const t = 1 - life / misc[i * 4 + 1]
      const drag = Math.exp(-misc2[i * 4] * dt)
      vel[i * 3] *= drag
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag + misc2[i * 4 + 1] * dt
      vel[i * 3 + 2] *= drag
      pos[i * 3] += vel[i * 3] * dt
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt
      misc2[i * 4 + 3] += misc2[i * 4 + 2] * dt
      P[i * 3] = pos[i * 3]
      P[i * 3 + 1] = pos[i * 3 + 1]
      P[i * 3 + 2] = pos[i * 3 + 2]
      V[i * 3] = vel[i * 3]
      V[i * 3 + 1] = vel[i * 3 + 1]
      V[i * 3 + 2] = vel[i * 3 + 2]
      // Fade in quickly, then blend start → end colour.
      const fadeIn = Math.min(1, t * 12)
      for (let k = 0; k < 4; k += 1) C[i * 4 + k] = c0[i * 4 + k] + (c1[i * 4 + k] - c0[i * 4 + k]) * t
      C[i * 4 + 3] *= fadeIn
      M[i * 4] = misc[i * 4 + 2] + (misc[i * 4 + 3] - misc[i * 4 + 2]) * Math.sqrt(t)
      M[i * 4 + 1] = misc2[i * 4 + 3]
      const anim = misc3[i * 3 + 2]
      const logical = misc3[i * 3] + (anim > 0 ? Math.min(anim - 1, Math.floor(t * anim)) : 0)
      M[i * 4 + 2] = remap ? remap[logical % remap.length] : logical
      M[i * 4 + 3] = misc3[i * 3 + 1]
      i += 1
    }
    this.geo.instanceCount = this.n
    for (const a of [this.aPos, this.aVel, this.aColor, this.aMisc]) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, this.n * a.itemSize)
      a.needsUpdate = true
    }
  }

  clear(): void {
    this.n = 0
    this.geo.instanceCount = 0
  }
}

type Flash = { light: THREE.PointLight; life: number; max: number; intensity: number }
type Ring = { mesh: THREE.Mesh; life: number; max: number; size: number }
type Body = { obj: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; life: number; max: number; radius: number; baseScale: number; bounced: boolean; onBounce?: () => void }
type Shell = { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number; bounces: number }

const tmpV = new THREE.Vector3()
// Scratch vectors for composite emitters (emit() copies values, so these never escape).
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _v4 = new THREE.Vector3()
const _v5 = new THREE.Vector3()
const _exp = new THREE.Vector3()
const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const UP = new THREE.Vector3(0, 0, 1)

export class Effects {
  readonly group = new THREE.Group()
  readonly add: ParticleSystem
  readonly alpha: ParticleSystem
  private readonly flashes: Flash[] = []
  private readonly rings: Ring[] = []
  private readonly bodies: Body[] = []
  /** Decal kinds: 0 concrete hole, 1 metal hole, 2 scorch, 3 oil splat. */
  private readonly decalSets: { mesh: THREE.InstancedMesh; next: number; max: number }[] = []
  private readonly shellMesh: THREE.InstancedMesh
  private readonly shells: Shell[] = []
  private readonly debrisMesh: THREE.InstancedMesh
  private readonly debris: Shell[] = []
  /** Procedural muzzle textures used by the first-person viewmodels. */
  readonly flashTexture: THREE.Texture
  readonly flameTexture: THREE.Texture
  onShellBounce?: (pos: THREE.Vector3) => void
  /** Scales particle counts (quality). */
  density = 1
  /**
   * 0 = frame budget met, 1 = badly over budget. Fed from measured frame time; bulk emitters shed
   * particles (and big smoke shortens its life) under load so a chain of explosions cannot snowball.
   */
  pressure = 0
  private frameMs = 16.7
  /** Generated atlases in use (false = procedural fallback). */
  readonly atlased: boolean

  /** The alpha smoke mesh, routed through the renderer's half-resolution pass. */
  get smokeMesh(): THREE.Mesh {
    return this.alpha.mesh
  }
  constructor(private readonly ground: Ground, fog: THREE.FogExp2, tex?: FxTextures) {
    this.atlased = !!tex
    if (tex) {
      this.add = new ParticleSystem(4000, tex.additive, true, fog, 4)
      this.alpha = new ParticleSystem(2400, tex.smoke, false, fog, 4)
    } else {
      const atlas = makeAtlas()
      this.add = new ParticleSystem(4000, atlas, true, fog, 2, FALLBACK_ADD)
      this.alpha = new ParticleSystem(2400, atlas, false, fog, 2, [1])
    }
    this.flashTexture = makeFlashTexture()
    this.flameTexture = makeFlameTexture()
    this.group.add(this.alpha.mesh, this.add.mesh)
    // 3 pooled flash lights (fixed count: a changing light count recompiles every lit shader).
    for (let i = 0; i < 3; i += 1) {
      const light = new THREE.PointLight('#ff9a3c', 0, 26, 1.6)
      light.castShadow = false
      this.group.add(light)
      this.flashes.push({ light, life: 0, max: 1, intensity: 0 })
    }
    const ringTex = makeRingTexture()
    for (let i = 0; i < 6; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#ffb46b', fog: true }),
      )
      mesh.rotation.x = -Math.PI / 2
      mesh.visible = false
      mesh.renderOrder = 15
      this.group.add(mesh)
      this.rings.push({ mesh, life: 0, max: 1, size: 1 })
    }
    // Decals: one instanced mesh per atlas cell (generated atlas) or per procedural texture.
    const decalMax = [220, 120, 28, 24]
    const procedural = [makeHoleTexture(), makeHoleTexture(), makeScorchTexture(), makeScorchTexture()]
    for (let k = 0; k < 4; k += 1) {
      const geo = new THREE.PlaneGeometry(1, 1)
      if (tex) {
        // decals.webp is a 2×2 grid laid out top-left origin: 0 TL, 1 TR, 2 BL, 3 BR (texture flipY).
        const uv = geo.getAttribute('uv') as THREE.BufferAttribute
        const u0 = (k % 2) * 0.5
        const v0 = k < 2 ? 0.5 : 0
        for (let i = 0; i < uv.count; i += 1) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5)
      }
      const mat = new THREE.MeshStandardMaterial({
        map: tex ? tex.decals : procedural[k], transparent: true, depthWrite: false, polygonOffset: true,
        polygonOffsetFactor: k >= 2 ? -2 : -4, polygonOffsetUnits: k >= 2 ? -2 : -4, roughness: k === 3 ? 0.25 : 0.95, metalness: 0,
        envMapIntensity: k === 3 ? 0.5 : 0.2,
      })
      const mesh = new THREE.InstancedMesh(geo, mat, decalMax[k])
      mesh.count = 0
      mesh.frustumCulled = false
      mesh.renderOrder = k >= 2 ? 1 : 2
      this.group.add(mesh)
      this.decalSets.push({ mesh, next: 0, max: decalMax[k] })
    }
    const brass = new THREE.MeshStandardMaterial({ color: '#b8893e', metalness: 1, roughness: 0.34, envMapIntensity: 0.6 })
    const shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8)
    shellGeo.rotateX(Math.PI / 2)
    this.shellMesh = new THREE.InstancedMesh(shellGeo, brass, 80)
    this.shellMesh.count = 0
    this.shellMesh.frustumCulled = false
    this.shellMesh.castShadow = false
    const debrisGeo = new THREE.DodecahedronGeometry(0.07, 0)
    this.debrisMesh = new THREE.InstancedMesh(debrisGeo, new THREE.MeshStandardMaterial({ color: '#2f2a25', roughness: 0.95, envMapIntensity: 0.2 }), 200)
    this.debrisMesh.count = 0
    this.debrisMesh.frustumCulled = false
    this.debrisMesh.castShadow = true
    this.group.add(this.shellMesh, this.debrisMesh)
  }

  /** Live particle count (used to pause background streaming when the screen is busy). */
  get particleCount(): number {
    return this.add.count + this.alpha.count
  }

  // ─── primitives ────────────────────────────────────────────────────────
  /** Bulk emission count after quality, frame-time pressure and pool headroom. */
  private n(count: number, pool: ParticleSystem = this.add): number {
    const headroom = THREE.MathUtils.clamp((1 - pool.fill) / 0.5, 0.2, 1)
    return Math.max(1, Math.round(count * this.density * (1 - 0.55 * this.pressure) * headroom))
  }

  /** Report the real (unscaled) frame time in ms once per rendered frame. */
  frameTime(ms: number): void {
    if (!(ms > 0) || ms > 250) return // tab switches / breakpoints are not load
    this.frameMs += (ms - this.frameMs) * (ms > this.frameMs ? 0.25 : 0.05)
    // 60 Hz budget with headroom: start shedding at ~19 ms, fully by ~33 ms (30 FPS).
    this.pressure = THREE.MathUtils.clamp((this.frameMs - 19) / 14, 0, 1)
  }

  private smokeFrame(): number {
    return Math.floor(Math.random() * 16)
  }

  private fireFrame(): number {
    return Math.floor(Math.random() * 8)
  }

  flash(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, life: number, distance = 26): void {
    // Chained blasts: merge into a live flash nearby instead of claiming another light.
    let f = this.flashes.find(x => x.life > 0 && x.light.position.distanceToSquared(pos) < 25)
    if (f) {
      f.light.position.lerp(pos, 0.5)
      f.light.distance = Math.max(f.light.distance, distance)
      f.intensity = Math.min(Math.max(f.intensity, intensity) * 1.15, Math.max(f.intensity, intensity) + intensity * 0.3)
      f.life = f.max = Math.max(f.life, life)
      f.light.intensity = f.intensity
      return
    }
    f = this.flashes.find(x => x.life <= 0)
    if (!f) f = this.flashes.reduce((a, b) => (a.life / a.max < b.life / b.max ? a : b))
    f.light.position.copy(pos)
    f.light.color.set(color)
    f.light.distance = distance
    f.intensity = intensity
    f.life = f.max = life
    f.light.intensity = intensity
  }

  ring(pos: THREE.Vector3, size: number, life = 0.45, color: THREE.ColorRepresentation = '#ffb46b'): void {
    const r = this.rings.find(x => x.life <= 0) ?? this.rings.reduce((a, b) => (a.life < b.life ? a : b))
    r.mesh.position.copy(pos).setY(pos.y + 0.08)
    r.mesh.visible = true
    ;(r.mesh.material as THREE.MeshBasicMaterial).color.set(color)
    r.life = r.max = life
    r.size = size
  }

  private placeDecal(kind: number, pos: THREE.Vector3, normal: THREE.Vector3, size: number, lift: number): void {
    const set = this.decalSets[kind]
    tmpQ.setFromUnitVectors(UP, normal)
    tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI * 2))
    tmpV.copy(pos).addScaledVector(normal, lift)
    tmpS.setScalar(size)
    tmpM.compose(tmpV, tmpQ, tmpS)
    set.mesh.setMatrixAt(set.next, tmpM)
    set.next = (set.next + 1) % set.max
    set.mesh.count = Math.min(set.max, set.mesh.count + 1)
    set.mesh.instanceMatrix.needsUpdate = true
  }

  /** Bullet hole decal oriented to a surface normal. */
  decal(pos: THREE.Vector3, normal: THREE.Vector3, size = 0.11, metal = false): void {
    this.placeDecal(metal ? 1 : 0, pos, normal, size * (0.8 + Math.random() * 0.5) * (this.atlased ? 1.25 : 1), 0.004)
  }

  scorchMark(pos: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    this.placeDecal(2, pos, normal, size, 0.01)
  }

  oilSplat(pos: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    this.placeDecal(3, pos, normal, size, 0.008)
  }

  shell(pos: THREE.Vector3, vel: THREE.Vector3): void {
    if (this.shells.length >= 80) this.shells.shift()
    this.shells.push({ pos: pos.clone(), vel: vel.clone(), rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0), spin: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), life: 2.6, bounces: 0 })
  }

  /** Tumbling mesh piece (robot parts, barrel shards). The object must already be in a scene. */
  gib(obj: THREE.Object3D, vel: THREE.Vector3, spin: THREE.Vector3, life = 4, radius = 0.15): void {
    if (obj.parent !== this.group) this.group.add(obj)
    this.bodies.push({ obj, vel, spin, life, max: life, radius, baseScale: obj.scale.x, bounced: false })
  }

  // ─── composites ────────────────────────────────────────────────────────
  sparks(pos: THREE.Vector3, normal: THREE.Vector3, count: number, speed = 7, color: [number, number, number, number] = [4, 2.4, 1.0, 1]): void {
    const color1: [number, number, number, number] = [color[0] * 0.8, color[1] * 0.4, color[2] * 0.2, 0]
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      const dir = _v1.copy(normal).multiplyScalar(0.7).add(randUnitTo(_v2).multiplyScalar(0.8)).normalize()
      this.add.emit({ pos, vel: dir.multiplyScalar(speed * (0.35 + Math.random())), life: 0.18 + Math.random() * 0.35, size: 0.026, color, color1, gravity: -14, drag: 2, frame: F.streak, stretch: 0.05 })
    }
  }

  /** Bullet impact on world geometry. */
  impact(pos: THREE.Vector3, normal: THREE.Vector3, surface: 'concrete' | 'metal' | 'wood'): void {
    this.decal(pos, normal, 0.11, surface === 'metal')
    this.add.emit({ pos: pos.clone().addScaledVector(normal, 0.03), life: 0.07, size: 0.42, color: [2.4, 1.8, 1.2, 1], frame: F.burst })
    this.add.emit({ pos: pos.clone().addScaledVector(normal, 0.03), life: 0.05, size: 0.3, color: [3, 2.2, 1.4, 1], frame: F.glow })
    if (surface === 'metal') {
      this.sparks(pos, normal, 14, 9)
    } else {
      this.sparks(pos, normal, 5, 6)
    }
    const dust: [number, number, number, number] = surface === 'wood' ? [0.62, 0.5, 0.38, 0.6] : surface === 'metal' ? [0.5, 0.48, 0.46, 0.35] : [0.78, 0.74, 0.68, 0.62]
    for (let i = 0; i < this.n(3); i += 1) {
      this.alpha.emit({ pos: pos.clone().addScaledVector(normal, 0.05), vel: normal.clone().multiplyScalar(0.8 + Math.random() * 1.6).add(randUnit().multiplyScalar(0.4)), life: 0.8 + Math.random() * 0.9, size: 0.14, size1: 0.8 + Math.random() * 0.45, color: dust, color1: [dust[0], dust[1], dust[2], 0], drag: 3.5, gravity: 0.2, spin: (Math.random() - 0.5) * 2, frame: this.smokeFrame() })
    }
    for (let i = 0; i < this.n(surface === 'metal' ? 0 : 5); i += 1) {
      this.alpha.emit({ pos, vel: normal.clone().multiplyScalar(2 + Math.random() * 3).add(randUnit().multiplyScalar(2)), life: 0.5 + Math.random() * 0.4, size: 0.03, color: [0.25, 0.23, 0.2, 1], color1: [0.25, 0.23, 0.2, 1], gravity: -16, frame: this.smokeFrame() })
    }
  }

  /** Hit on a robot: bright sparks, hot flash and a puff of burning-oil smoke. */
  robotHit(pos: THREE.Vector3, normal: THREE.Vector3, heavy: boolean): void {
    this.sparks(pos, normal, heavy ? 24 : 12, heavy ? 11 : 8, [5, 3.2, 1.4, 1])
    this.add.emit({ pos: pos.clone(), life: 0.09, size: heavy ? 1.0 : 0.6, color: [2.6, 2, 1.4, 1], frame: F.burst })
    this.add.emit({ pos: pos.clone(), life: 0.06, size: heavy ? 0.7 : 0.4, color: [3, 2.4, 1.6, 1], frame: F.glow })
    this.alpha.emit({ pos: pos.clone(), vel: normal.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.6, 0)), life: 1, size: 0.22, size1: 1, color: [0.12, 0.11, 0.1, 0.6], color1: [0.16, 0.15, 0.14, 0], drag: 2, gravity: 0.6, frame: this.smokeFrame() })
  }

  /** Hit on a human soldier: a short dark-red mist and a few falling droplets (no glow). */
  humanHit(pos: THREE.Vector3, normal: THREE.Vector3, heavy: boolean): void {
    const n = this.n(heavy ? 7 : 4, this.alpha)
    for (let i = 0; i < n; i += 1) {
      const v = new THREE.Vector3(normal.x + (Math.random() - 0.5) * 1.2, normal.y + Math.random() * 0.8, normal.z + (Math.random() - 0.5) * 1.2).multiplyScalar(1.5 + Math.random() * 2.5)
      this.alpha.emit({ pos: pos.clone(), vel: v, life: 0.35 + Math.random() * 0.25, size: 0.035, size1: 0.02, color: [0.16, 0.01, 0.01, 0.95], color1: [0.1, 0.0, 0.0, 0], drag: 1.2, gravity: 9, frame: this.smokeFrame() })
    }
    this.alpha.emit({ pos: pos.clone(), vel: normal.clone().multiplyScalar(0.5), life: 0.45, size: heavy ? 0.28 : 0.18, size1: heavy ? 0.7 : 0.45, color: [0.22, 0.02, 0.02, 0.55], color1: [0.14, 0.01, 0.01, 0], drag: 3, gravity: 0.3, frame: this.smokeFrame() })
  }
  /** Muzzle flash: front star, side plume along the barrel, hot glow and a drifting smoke wisp. */
  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, color: [number, number, number, number] = [4, 2.6, 1.2, 1], scale = 1): void {
    const k = this.atlased ? 0.42 : 1
    const tint: [number, number, number, number] = [color[0] * k, color[1] * k, color[2] * k, color[3]]
    this.add.emit({ pos, life: 0.05, size: 0.5 * scale, color: tint, frame: F.muzzleFront + (Math.random() < 0.5 ? 0 : 1), rot: Math.random() * 6 })
    const plume = pos.clone().addScaledVector(dir, 0.22 * scale)
    this.add.emit({ pos: plume, vel: dir.clone().multiplyScalar(2), life: 0.045, size: 0.2 * scale, color: tint, frame: F.muzzleSide + (Math.random() < 0.5 ? 0 : 1), stretch: 0.22 * scale })
    this.add.emit({ pos, life: 0.06, size: 0.9 * scale, color: [color[0] * 0.35, color[1] * 0.3, color[2] * 0.3, 1], frame: F.glow })
    this.alpha.emit({ pos: pos.clone().addScaledVector(dir, 0.1), vel: dir.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.3, 0)), life: 0.7, size: 0.08 * scale, size1: 0.5 * scale, color: [0.7, 0.68, 0.65, 0.2], color1: [0.7, 0.68, 0.65, 0], drag: 3, gravity: 0.5, frame: this.smokeFrame() })
  }

  /** Fast glowing tracer from `from` to `to`. */
  tracer(from: THREE.Vector3, to: THREE.Vector3, color: [number, number, number, number] = [5, 3.2, 1.4, 1], speed = 320, width = 0.03): void {
    const dir = tmpV.subVectors(to, from)
    const dist = dir.length()
    if (dist < 0.5) return
    dir.divideScalar(dist)
    const start = from.clone().addScaledVector(dir, Math.min(1.2, dist * 0.3))
    const life = Math.max(0.02, (dist - 1.2) / speed)
    this.add.emit({ pos: start, vel: dir.clone().multiplyScalar(speed), life, size: width * 1.6, color, color1: color, frame: F.streak, stretch: 0.014 })
  }

  smokeTrail(pos: THREE.Vector3, vel: THREE.Vector3): void {
    this.alpha.emit({ pos: _v1.copy(pos).add(randUnitTo(_v3).multiplyScalar(0.05)), vel: _v2.copy(vel).multiplyScalar(0.05).add(randUnitTo(_v3).multiplyScalar(0.3)), life: 1.4 + Math.random() * 0.8, size: 0.2, size1: 1.4, color: [0.78, 0.76, 0.74, 0.4], color1: [0.6, 0.6, 0.6, 0], drag: 1.5, gravity: 0.4, spin: (Math.random() - 0.5), frame: this.smokeFrame() })
    this.add.emit({ pos, vel: _v2.copy(vel).multiplyScalar(-0.1), life: 0.09, size: 0.4, color: [2.2, 1.6, 1.1, 1], frame: this.fireFrame() })
    this.add.emit({ pos, life: 0.05, size: 0.6, color: [3, 1.6, 0.6, 1], frame: F.glow })
  }

  /** Full explosion: flash, animated fireball, smoke column, sparks, embers, debris, shockwave, light. */
  explosion(pos: THREE.Vector3, scale = 1, groundNormal?: THREE.Vector3): void {
    // emit() copies positions/velocities, so scratch vectors are safe here (no per-particle garbage).
    const p = _exp.copy(pos)
    const at = _v1
    const v = _v2
    // Under frame pressure big smoke also dies sooner, which is what keeps overdraw from stacking.
    const smokeLife = 1 - 0.4 * this.pressure
    this.flash(at.copy(p).setY(p.y + 0.6), '#ff9440', 140 * scale, 0.55, 32 * scale)
    this.add.emit({ pos: p, life: 0.14, size: 7 * scale, color: [3, 2.2, 1.5, 1], color1: [2.4, 1, 0.3, 0], frame: F.glow })
    this.add.emit({ pos: p, life: 0.1, size: 4.5 * scale, color: [2.4, 2, 1.6, 1], frame: F.burst })
    // Fireball: flipbook fire sprites that billow out and cool.
    for (let i = 0, n = this.n(24 * scale); i < n; i += 1) {
      randUnitTo(v).multiplyScalar(2 + Math.random() * 7 * scale)
      v.y = Math.abs(v.y) * 0.9 + 1.2
      this.add.emit({ pos: at.copy(p).add(randUnitTo(_v3).multiplyScalar(0.4 * scale)), vel: v, life: 0.5 + Math.random() * 0.6, size: 1.1 * scale, size1: 3.2 * scale, color: [1.9, 1.5, 1.2, 1], color1: [0.8, 0.3, 0.1, 0], drag: 3.2, gravity: 1.5, spin: (Math.random() - 0.5) * 3, frame: F.fire, anim: 8 })
    }
    // Smoke column: fewer, slightly denser puffs than before (overdraw scales with count × area × life).
    for (let i = 0, n = this.n(16 * scale, this.alpha); i < n; i += 1) {
      randUnitTo(v).multiplyScalar(1 + Math.random() * 4 * scale)
      v.y = Math.abs(v.y) + 1 + Math.random() * 2
      const shade = 0.12 + Math.random() * 0.12
      this.alpha.emit({ pos: at.copy(p).add(randUnitTo(_v3).multiplyScalar(0.6 * scale)), vel: v, life: (2.4 + Math.random() * 2.4) * smokeLife, size: 1.3 * scale, size1: (5 + Math.random() * 3) * scale, color: [shade, shade * 0.95, shade * 0.9, 0.9], color1: [shade * 1.7, shade * 1.65, shade * 1.6, 0], drag: 1.8, gravity: 0.9, spin: (Math.random() - 0.5) * 0.8, frame: this.smokeFrame() })
    }
    for (let i = 0, n = this.n(70 * scale); i < n; i += 1) {
      randUnitTo(v).multiplyScalar(8 + Math.random() * 16 * scale)
      v.y = Math.abs(v.y) * 0.8 + 2
      this.add.emit({ pos: p, vel: v, life: 0.5 + Math.random() * 1.1, size: 0.04, color: [6, 3, 1, 1], color1: [3, 0.8, 0.1, 0], gravity: -12, drag: 1.2, frame: F.streak, stretch: 0.035 })
    }
    for (let i = 0, n = this.n(18 * scale); i < n; i += 1) {
      randUnitTo(v).multiplyScalar(1.5 + Math.random() * 3)
      v.y = Math.abs(v.y) * 2 + 2
      this.add.emit({ pos: p, vel: v, life: 2 + Math.random() * 2, size: 0.06, color: [4, 1.6, 0.4, 1], color1: [2, 0.4, 0.05, 0], gravity: -1.2, drag: 0.8, frame: F.glow })
    }
    this.debrisBurst(p, 18 * scale, 5 + 9 * scale)
    const g = _v4.copy(p).setY(this.ground(p.x, p.z, p.y + 0.5))
    this.ring(g, 11 * scale)
    this.add.emit({ pos: at.copy(g).setY(g.y + 0.2), life: 0.35, size: 2 * scale, size1: 12 * scale, color: [2.2, 1.2, 0.5, 0.8], color1: [1, 0.3, 0.1, 0], frame: F.ring })
    if (groundNormal) this.scorchMark(g, groundNormal, 3.4 * scale)
  }
  /** Rock/metal chunks thrown out of an impact, with a dust puff. */
  debrisBurst(pos: THREE.Vector3, count: number, speed: number): void {
    for (let i = 0, n = this.n(count); i < n; i += 1) {
      // Recycle the oldest chunk's objects instead of allocating a fresh Vector3/Euler set.
      const d = this.debris.length >= 200 ? this.debris.shift()! : { pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, bounces: 0 }
      randUnitTo(d.vel).multiplyScalar(speed * (0.4 + Math.random() * 0.8))
      d.vel.y = Math.abs(d.vel.y) + 3
      d.pos.copy(pos).setY(pos.y + 0.3)
      d.rot.set(Math.random() * 3, Math.random() * 3, 0)
      randUnitTo(d.spin).multiplyScalar(14)
      d.life = 3 + Math.random() * 2
      d.bounces = 0
      this.debris.push(d)
    }
    for (let i = 0, n = this.n(Math.min(8, count * 0.4), this.alpha); i < n; i += 1) {
      const v = randUnitTo(_v5).multiplyScalar(2 + Math.random() * 3)
      v.y = Math.abs(v.y) * 0.5
      this.alpha.emit({ pos, vel: v, life: 1.4 + Math.random(), size: 0.5, size1: 2.4, color: [0.5, 0.46, 0.42, 0.5], color1: [0.55, 0.5, 0.46, 0], drag: 2.4, gravity: 0.3, frame: this.smokeFrame() })
    }
  }

  /** Ground-level shockwave: expanding ring, radial dust wall and a low flash. */
  slamWave(at: THREE.Vector3, radius: number): void {
    const g = at.clone().setY(this.ground(at.x, at.z, at.y + 1))
    this.ring(g, radius * 2, 0.6, '#ffc48a')
    this.add.emit({ pos: g.clone().setY(g.y + 0.3), life: 0.45, size: radius * 0.4, size1: radius * 2.2, color: [2, 1.2, 0.6, 0.7], color1: [0.8, 0.3, 0.1, 0], frame: F.ring })
    this.flash(g.clone().setY(g.y + 0.5), '#ffb070', 30 + radius * 6, 0.35, radius * 3)
    const n = this.n(Math.min(48, 10 + radius * 4))
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
      const sp = radius * (1.6 + Math.random() * 0.8)
      this.alpha.emit({ pos: g.clone().addScaledVector(dir, 0.4).setY(g.y + 0.25), vel: dir.multiplyScalar(sp).setY(0.5 + Math.random()), life: 0.9 + Math.random() * 0.7, size: 0.5, size1: 1.8 + radius * 0.18, color: [0.58, 0.52, 0.46, 0.6], color1: [0.6, 0.55, 0.5, 0], drag: 3.2, gravity: 0.2, spin: (Math.random() - 0.5), frame: this.smokeFrame() })
    }
    this.sparks(g, new THREE.Vector3(0, 1, 0), Math.min(30, radius * 3), 6 + radius)
  }

  /**
   * Rift spawn portal. Small scales (< 0.55) are per-frame ambient motes while a spawn charges;
   * larger scales are the one-shot arrival burst (column of light, ring, sparks, flash).
   */
  spawnPortal(pos: THREE.Vector3, scale: number): void {
    const g = pos.clone()
    if (scale < 0.55) {
      const count = this.n(1 + scale * 6)
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2
        const r = (0.4 + Math.random() * 0.8) * (1 + scale * 2)
        const p = g.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.random() * 0.3, Math.sin(a) * r))
        this.add.emit({ pos: p, vel: new THREE.Vector3(-Math.cos(a) * r * 0.6, 1.8 + Math.random() * 2.5, -Math.sin(a) * r * 0.6), life: 0.6 + Math.random() * 0.5, size: 0.05, color: [4, 1.2, 0.35, 1], color1: [3, 0.5, 0.1, 0], drag: 1, frame: F.glow })
      }
      if (Math.random() < 0.3) this.add.emit({ pos: g.clone().setY(g.y + 0.1), life: 0.4, size: 1.4 * (1 + scale * 3), color: [1.4, 0.4, 0.12, 0.6], frame: F.glow })
      return
    }
    this.flash(g.clone().setY(g.y + 1), '#ff5a24', 40 * scale, 0.5, 14 * scale)
    this.ring(g, 3.6 * scale, 0.55, '#ff6a2a')
    this.add.emit({ pos: g.clone().setY(g.y + 1 * scale), life: 0.35, size: 3 * scale, size1: 1.2 * scale, color: [3.2, 1.2, 0.4, 1], frame: F.glow })
    this.add.emit({ pos: g.clone().setY(g.y + 0.2), life: 0.45, size: 0.6 * scale, size1: 4.5 * scale, color: [2.6, 0.9, 0.3, 0.9], color1: [1.2, 0.2, 0.05, 0], frame: F.ring })
    // Vertical column of light: stacked stretched streaks rising fast.
    for (let i = 0; i < this.n(10 * scale); i += 1) {
      const off = randUnit().multiplyScalar(0.35 * scale).setY(0)
      this.add.emit({ pos: g.clone().add(off), vel: new THREE.Vector3(0, 8 + Math.random() * 10, 0), life: 0.3 + Math.random() * 0.25, size: 0.08 * scale, color: [4, 1.5, 0.5, 1], color1: [3, 0.6, 0.1, 0], frame: F.streak, stretch: 0.06 })
    }
    this.sparks(g.clone().setY(g.y + 0.2), new THREE.Vector3(0, 1, 0), 26 * scale, 7 * scale, [4, 1.4, 0.4, 1])
    for (let i = 0; i < this.n(6 * scale); i += 1) {
      const v = randUnit().multiplyScalar(1.5)
      v.y = Math.abs(v.y) + 0.5
      this.alpha.emit({ pos: g.clone(), vel: v, life: 1.4 + Math.random(), size: 0.6 * scale, size1: 2.2 * scale, color: [0.2, 0.14, 0.12, 0.55], color1: [0.3, 0.25, 0.22, 0], drag: 2, gravity: 0.5, frame: this.smokeFrame() })
    }
  }

  /** Heavy footstep / slide dust kicked up at ground level. */
  stompDust(at: THREE.Vector3, amount: number): void {
    const g = at.clone().setY(this.ground(at.x, at.z, at.y + 0.6) + 0.1)
    const n = this.n(Math.max(1, amount * 5))
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
      this.alpha.emit({ pos: g.clone().addScaledVector(dir, 0.2 + Math.random() * 0.3 * amount), vel: dir.multiplyScalar(0.8 + amount * 1.4).setY(0.3 + Math.random() * 0.5), life: 0.8 + Math.random() * 0.6 + amount * 0.2, size: 0.25 + amount * 0.15, size1: 0.9 + amount * 0.7, color: [0.6, 0.55, 0.5, 0.45], color1: [0.62, 0.57, 0.52, 0], drag: 3, gravity: 0.12, spin: (Math.random() - 0.5), frame: this.smokeFrame() })
    }
    if (amount > 1.2) this.debrisBurst(g, Math.round(amount * 2), 3)
  }

  /** Rift shard / pickup collection: coloured sparkle burst, glow and a small ring. */
  shardBurst(pos: THREE.Vector3, color: [number, number, number, number]): void {
    this.add.emit({ pos: pos.clone(), life: 0.25, size: 1.2, size1: 0.2, color, frame: F.glow })
    this.add.emit({ pos: pos.clone(), life: 0.3, size: 0.2, size1: 1.6, color: [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6, 0.9], color1: [color[0] * 0.3, color[1] * 0.3, color[2] * 0.3, 0], frame: F.ring })
    for (let i = 0; i < this.n(18); i += 1) {
      this.add.emit({ pos: pos.clone(), vel: randUnit().multiplyScalar(2 + Math.random() * 3), life: 0.35 + Math.random() * 0.35, size: 0.035, color, color1: [color[0], color[1], color[2], 0], drag: 3, gravity: 2, frame: F.streak, stretch: 0.04 })
    }
  }

  /** Energy projectile impact (plasma bolts). */
  energyBurst(pos: THREE.Vector3, normal: THREE.Vector3, color: [number, number, number, number], scale = 1): void {
    this.add.emit({ pos: pos.clone(), life: 0.14, size: 1.4 * scale, size1: 0.3, color, frame: F.glow })
    this.add.emit({ pos: pos.clone(), life: 0.2, size: 0.3 * scale, size1: 1.8 * scale, color: [color[0] * 0.5, color[1] * 0.5, color[2] * 0.5, 0.9], color1: [0, 0, 0, 0], frame: F.ring })
    this.sparks(pos, normal, 14 * scale, 6, color)
    this.flash(pos.clone().addScaledVector(normal, 0.3), new THREE.Color(color[0], color[1], color[2]).multiplyScalar(0.25), 8 * scale, 0.12, 6)
    this.placeDecal(2, pos, normal, 0.35 * scale, 0.01)
  }

  /** Per-frame look of a slow energy projectile: hot core, velocity streak, shed motes. */
  bolt(pos: THREE.Vector3, vel: THREE.Vector3, color: [number, number, number, number], size: number): void {
    this.add.emit({ pos: pos.clone(), life: 0.035, size: size * 3.2, color, frame: F.glow })
    this.add.emit({ pos: pos.clone(), vel: vel.clone().multiplyScalar(0.02), life: 0.035, size: size * 1.2, color: [color[0] * 1.3, color[1] * 1.3, color[2] * 1.3, 1], frame: F.streak, stretch: 12 * size })
    if (Math.random() < 0.5) this.add.emit({ pos: pos.clone(), vel: randUnit().multiplyScalar(0.6), life: 0.3 + Math.random() * 0.2, size: size * 0.4, color, color1: [color[0], color[1], color[2], 0], drag: 2, frame: F.glow })
  }

  /** Continuous emitters: burning barrels, drifting embers. Call per frame with dt. */
  fire(pos: THREE.Vector3, dt: number, strength = 1): void {
    const rate = 30 * strength * this.density
    let k = rate * dt
    while (k > 0) {
      if (Math.random() < k) {
        this.add.emit({ pos: _v1.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y, pos.z + (Math.random() - 0.5) * 0.5), vel: _v2.set((Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.4), life: 0.55 + Math.random() * 0.4, size: 0.7, size1: 0.2, color: [1.8, 1.4, 1.1, 1], color1: [0.9, 0.35, 0.1, 0], drag: 1, gravity: 0.5, spin: (Math.random() - 0.5) * 3, frame: F.fire, anim: 8 })
        if (Math.random() < 0.3 * (1 - 0.5 * this.pressure)) this.alpha.emit({ pos: _v1.set(pos.x, pos.y + 1, pos.z), vel: _v2.set((Math.random() - 0.5) * 0.4, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4), life: 3 + Math.random() * 2, size: 0.6, size1: 3.2, color: [0.1, 0.09, 0.08, 0.55], color1: [0.18, 0.17, 0.16, 0], drag: 0.6, gravity: 0.25, spin: (Math.random() - 0.5) * 0.6, frame: this.smokeFrame() })
        if (Math.random() < 0.08) this.add.emit({ pos, vel: _v2.set((Math.random() - 0.5) * 1.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.5), life: 1.5 + Math.random() * 1.5, size: 0.05, color: [5, 1.8, 0.4, 1], color1: [3, 0.6, 0.1, 0], gravity: -0.6, drag: 0.5, frame: F.glow })
      }
      k -= 1
    }
  }

  ember(pos: THREE.Vector3, vel: THREE.Vector3): void {
    this.add.emit({ pos, vel, life: 4 + Math.random() * 3, size: 0.04 + Math.random() * 0.03, color: [4, 1.4, 0.3, 0.9], color1: [3, 0.6, 0.1, 0], drag: 0.2, gravity: 0.15, frame: F.glow })
  }

  update(dt: number): void {
    this.add.update(dt)
    this.alpha.update(dt)
    for (const f of this.flashes) {
      if (f.life <= 0) continue
      f.life -= dt
      const t = Math.max(0, f.life / f.max)
      f.light.intensity = f.intensity * t * t * (0.85 + Math.random() * 0.3)
      if (f.life <= 0) f.light.intensity = 0
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue
      r.life -= dt
      const t = 1 - Math.max(0, r.life / r.max)
      const s = r.size * (0.15 + 0.85 * Math.sqrt(t))
      r.mesh.scale.set(s, s, s)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9
      if (r.life <= 0) r.mesh.visible = false
    }
    this.stepPieces(this.shells, this.shellMesh, dt, 0.35, true)
    this.stepPieces(this.debris, this.debrisMesh, dt, 0.3, false)
    for (let i = this.bodies.length - 1; i >= 0; i -= 1) {
      const b = this.bodies[i]
      b.life -= dt
      b.vel.y -= 18 * dt
      b.obj.position.addScaledVector(b.vel, dt)
      b.obj.rotation.x += b.spin.x * dt
      b.obj.rotation.y += b.spin.y * dt
      b.obj.rotation.z += b.spin.z * dt
      const g = this.ground(b.obj.position.x, b.obj.position.z, b.obj.position.y + 0.5) + b.radius
      if (b.obj.position.y < g) {
        b.obj.position.y = g
        if (b.vel.y < -1.5) {
          b.vel.y *= -0.32
          b.vel.x *= 0.6
          b.vel.z *= 0.6
          b.spin.multiplyScalar(0.55)
          if (!b.bounced) {
            this.alpha.emit({ pos: b.obj.position.clone(), vel: new THREE.Vector3(0, 0.6, 0), life: 1, size: 0.3, size1: 1, color: [0.55, 0.52, 0.48, 0.4], color1: [0.55, 0.52, 0.48, 0], drag: 2, frame: this.smokeFrame() })
            if (Math.random() < 0.5) this.oilSplat(tmpV.set(b.obj.position.x, g - b.radius, b.obj.position.z), new THREE.Vector3(0, 1, 0), 0.5 + Math.random() * 0.5)
          }
          b.bounced = true
        } else {
          b.vel.set(b.vel.x * 0.9, 0, b.vel.z * 0.9)
          b.spin.multiplyScalar(0.9)
        }
      }
      if (b.life < 0.8) b.obj.scale.setScalar(b.baseScale * Math.max(0.01, b.life / 0.8))
      if (b.life <= 0) {
        b.obj.removeFromParent()
        this.bodies.splice(i, 1)
      }
    }
  }

  private stepPieces(list: Shell[], mesh: THREE.InstancedMesh, dt: number, bounce: number, isShell: boolean): void {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const s = list[i]
      s.life -= dt
      if (s.life <= 0) {
        list.splice(i, 1)
        continue
      }
      s.vel.y -= 16 * dt
      s.pos.addScaledVector(s.vel, dt)
      s.rot.x += s.spin.x * dt
      s.rot.y += s.spin.y * dt
      s.rot.z += s.spin.z * dt
      const g = this.ground(s.pos.x, s.pos.z, s.pos.y + 0.3) + (isShell ? 0.006 : 0.05)
      if (s.pos.y < g) {
        s.pos.y = g
        if (s.vel.y < -1) {
          s.vel.y *= -bounce
          s.vel.x *= 0.55
          s.vel.z *= 0.55
          s.spin.multiplyScalar(0.5)
          if (isShell && s.bounces === 0) this.onShellBounce?.(s.pos)
          s.bounces += 1
        } else {
          s.vel.set(s.vel.x * 0.85, 0, s.vel.z * 0.85)
          s.spin.multiplyScalar(0.85)
        }
      }
    }
    for (let i = 0; i < list.length; i += 1) {
      const s = list[i]
      tmpQ.setFromEuler(s.rot)
      tmpS.setScalar(Math.min(1, s.life * 2))
      tmpM.compose(s.pos, tmpQ, tmpS)
      mesh.setMatrixAt(i, tmpM)
    }
    mesh.count = list.length
    mesh.instanceMatrix.needsUpdate = true
  }

  clear(): void {
    this.add.clear()
    this.alpha.clear()
    this.shells.length = 0
    this.debris.length = 0
    for (const b of this.bodies) b.obj.removeFromParent()
    this.bodies.length = 0
    for (const f of this.flashes) {
      f.life = 0
      f.light.intensity = 0
    }
    for (const r of this.rings) {
      r.life = 0
      r.mesh.visible = false
    }
  }

  clearDecals(): void {
    for (const d of this.decalSets) {
      d.mesh.count = 0
      d.next = 0
    }
  }
}

/** Random unit vector written into `out` (allocation-free variant of randUnit). */
export function randUnitTo(out: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - u * u)
  return out.set(r * Math.cos(a), u, r * Math.sin(a))
}

export function randUnit(): THREE.Vector3 {
  const u = Math.random() * 2 - 1
  const t = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - u * u)
  return new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t))
}

// ─── procedural textures ─────────────────────────────────────────────────

function valueNoise(seed: number) {
  const perm = new Uint8Array(512)
  let s = seed
  for (let i = 0; i < 256; i += 1) perm[i] = i
  for (let i = 255; i > 0; i -= 1) {
    s = (s * 16807) % 2147483647
    const j = s % (i + 1)
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  for (let i = 0; i < 256; i += 1) perm[i + 256] = perm[i]
  const grad = (h: number) => perm[h] / 255
  return (x: number, y: number) => {
    const xi = Math.floor(x) & 255
    const yi = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = grad(perm[xi] + yi)
    const b = grad(perm[xi + 1] + yi)
    const c = grad(perm[xi] + yi + 1)
    const d = grad(perm[xi + 1] + yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, oct = 4): number {
  let v = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < oct; i += 1) {
    v += noise(x * f, y * f) * amp
    f *= 2
    amp *= 0.5
  }
  return v / (1 - Math.pow(0.5, oct))
}

/** 2×2 atlas: glow, smoke puff, flame, star flare. */
function makeAtlas(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size * 2
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size * 2, size * 2)
  const noise = valueNoise(1337)
  const put = (cx: number, cy: number, fn: (u: number, v: number) => [number, number, number, number]) => {
    // UV cell (cx, cy) → canvas quadrant with flipY: canvas row origin top.
    const ox = cx * size
    const oy = (1 - cy) * size
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = (x + 0.5) / size
        const v = (y + 0.5) / size
        const [r, g, b, a] = fn(u, v)
        const i = ((oy + y) * size * 2 + ox + x) * 4
        img.data[i] = r * 255
        img.data[i + 1] = g * 255
        img.data[i + 2] = b * 255
        img.data[i + 3] = Math.max(0, Math.min(1, a)) * 255
      }
    }
  }
  put(0, 0, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2
    const a = Math.pow(Math.max(0, 1 - d), 2.2)
    return [1, 1, 1, a]
  })
  put(1, 0, (u, v) => {
    const dx = u - 0.5
    const dy = v - 0.5
    const d = Math.hypot(dx, dy) * 2
    const n = fbm(noise, u * 5 + 3, v * 5 + 7, 5)
    const edge = Math.max(0, 1 - d * (0.75 + n * 0.55))
    const a = Math.pow(edge, 1.3) * (0.55 + n * 0.6)
    const shade = 0.72 + n * 0.35 - dy * 0.25
    return [shade, shade, shade, a]
  })
  put(0, 1, (u, v) => {
    const dx = u - 0.5
    const dy = v - 0.5
    const d = Math.hypot(dx, dy) * 2
    const n = fbm(noise, u * 6 + 11, v * 6 + 2, 5)
    const edge = Math.max(0, 1 - d * (0.8 + (1 - n) * 0.6))
    const a = Math.pow(edge, 1.1)
    const core = Math.pow(Math.max(0, 1 - d * 1.4), 2)
    return [1, 0.75 + core * 0.25, 0.45 + core * 0.55, a]
  })
  put(1, 1, (u, v) => {
    const dx = u - 0.5
    const dy = v - 0.5
    const d = Math.hypot(dx, dy) * 2
    const ang = Math.atan2(dy, dx)
    const rays = Math.pow(Math.abs(Math.cos(ang * 3)), 18) * Math.max(0, 1 - d) * 0.9
    const core = Math.pow(Math.max(0, 1 - d * 1.6), 2)
    const glow = Math.pow(Math.max(0, 1 - d), 3) * 0.6
    const a = Math.min(1, core + rays + glow)
    return [1, 0.92, 0.8, a]
  })
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Front-view muzzle flash: jagged star petals. */
function makeFlashTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const noise = valueNoise(99)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const d = Math.hypot(dx, dy) * 2
      const ang = Math.atan2(dy, dx)
      const petals = 0.45 + 0.55 * Math.pow(Math.abs(Math.cos(ang * 2.5)), 3)
      const n = fbm(noise, Math.cos(ang) * 3 + 5, Math.sin(ang) * 3 + d * 4, 4)
      const reach = petals * (0.6 + n * 0.5)
      const a = Math.pow(Math.max(0, 1 - d / reach), 1.4)
      const core = Math.pow(Math.max(0, 1 - d * 2.5), 2)
      const i = (y * size + x) * 4
      img.data[i] = 255
      img.data[i + 1] = (0.62 + core * 0.38) * 255
      img.data[i + 2] = (0.25 + core * 0.7) * 255
      img.data[i + 3] = Math.min(1, a) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Side-view muzzle flame: tapered plume along +v. */
function makeFlameTexture(): THREE.Texture {
  const w = 128
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const noise = valueNoise(7)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = (x + 0.5) / w - 0.5
      const v = 1 - (y + 0.5) / h
      const n = fbm(noise, u * 6 + 3, v * 9, 4)
      const width = (0.12 + 0.3 * Math.sin(Math.min(1, v * 1.3) * Math.PI) * (0.6 + n * 0.6)) * (1 - v * 0.5)
      const a = Math.max(0, 1 - Math.abs(u) / width) * Math.pow(Math.max(0, 1 - v), 0.7) * (v < 0.04 ? v / 0.04 : 1)
      const core = Math.max(0, 1 - Math.abs(u) / (width * 0.35)) * (1 - v)
      const i = (y * w + x) * 4
      img.data[i] = 255
      img.data[i + 1] = (0.55 + core * 0.45) * 255
      img.data[i + 2] = (0.2 + core * 0.7) * 255
      img.data[i + 3] = Math.min(1, a * 1.3) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeHoleTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const noise = valueNoise(5)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const d = Math.hypot(dx, dy) * 2
      const ang = Math.atan2(dy, dx)
      const n = fbm(noise, Math.cos(ang) * 4 + 9, Math.sin(ang) * 4 + d * 6, 4)
      const hole = d < 0.2 + n * 0.08 ? 1 : 0
      const ring = Math.max(0, 1 - Math.abs(d - 0.34 - n * 0.1) / 0.12) * 0.55
      const soot = Math.max(0, 1 - d / (0.9 + n * 0.2)) * 0.45
      const cracks = Math.pow(Math.abs(Math.cos(ang * 4 + n * 3)), 40) * Math.max(0, 1 - d) * 0.6
      const a = Math.min(1, hole + ring + soot + cracks)
      const shade = hole ? 0.02 : 0.08 + ring * 0.25
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = shade * 255
      img.data[i + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeScorchTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const noise = valueNoise(21)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const d = Math.hypot(u - 0.5, v - 0.5) * 2
      const n = fbm(noise, u * 8, v * 8, 5)
      const a = Math.max(0, 1 - d * (0.8 + n * 0.6)) * 0.95
      const i = (y * size + x) * 4
      img.data[i] = 12
      img.data[i + 1] = 10
      img.data[i + 2] = 9
      img.data[i + 3] = Math.min(1, a * 1.4) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeRingTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.75, 'rgba(255,220,180,0.9)')
  g.addColorStop(0.9, 'rgba(255,200,150,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

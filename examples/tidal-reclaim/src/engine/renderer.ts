import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; samples: number; particles: number }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 0.85, shadows: false, shadowMap: 1024, bloom: false, samples: 0, particles: 0.5 },
  medium: { pixelRatio: 1, shadows: true, shadowMap: 2048, bloom: true, samples: 2, particles: 0.8 },
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 4096, bloom: true, samples: 4, particles: 1 },
}

export function suggestQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4
  if (cores <= 4) return 'medium'
  return 'high'
}

/** Final grade in display space: contrast, warm/teal split, vignette, grain, damage tint (no chromatic aberration). */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    damage: { value: 0 },
    lowHealth: { value: 0 },
    flash: { value: 0 },
    overdrive: { value: 0 },
    vignette: { value: 0.18 },
    grain: { value: 0.008 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, damage, lowHealth, flash, vignette, grain, overdrive;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // Single crisp sample: no chromatic aberration / RGB split (it read as double vision in heavy fights).
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // Gentle S-curve contrast + split tone (warm highlights, cool shadows).
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += (vec3(0.03, 0.012, -0.02) * luma - vec3(0.004, -0.002, -0.012) * (1.0 - luma)) ;
      // Low health: only a slight desaturation; the warning is the bloody vignette below.
      col = mix(col, vec3(luma), lowHealth * 0.12);
      float edge = smoothstep(0.08, 0.5, r2 * 2.0);
      // Overdrive: hot amber grade, crushed blues, pulsing molten edge glow.
      vec3 hot = vec3(luma) * vec3(1.35, 0.92, 0.55) + col * 0.35;
      col = mix(col, hot, overdrive * 0.6);
      col += vec3(1.0, 0.42, 0.08) * overdrive * edge * (0.22 + 0.08 * sin(time * 9.0));
      col = mix(col, vec3(0.55, 0.02, 0.01), clamp(damage * 0.6 * edge, 0.0, 0.8));
      // Bloody vignette: an irregular, slowly creeping blood rim that pulses with the heartbeat
      // and closes in as health drops. Sharp-edged (no blur): multiplied to deep red + darkened.
      if (lowHealth > 0.001) {
        vec2 e = c * vec2(1.0, 1.3);
        float rim = length(e) * 1.55;
        float n = vnoise(e * 6.0 + vec2(0.0, time * 0.05)) * 0.3 + vnoise(e * 17.0 - time * 0.03) * 0.12 + vnoise(e * 41.0) * 0.05;
        float beat = 0.5 + 0.5 * sin(time * 6.0);
        float reach = 0.98 - lowHealth * (0.3 + 0.06 * beat);
        float blood = smoothstep(reach, reach + 0.1, rim + n);
        float core = smoothstep(reach + 0.12, reach + 0.35, rim + n);
        vec3 bloodCol = mix(col * vec3(0.62, 0.08, 0.06) + vec3(0.2, 0.0, 0.0), vec3(0.16, 0.0, 0.0), core * 0.7);
        col = mix(col, bloodCol, clamp(blood * lowHealth * (1.15 + 0.15 * beat), 0.0, 0.92));
      }
      col += vec3(1.0, 0.85, 0.7) * flash;
      col *= 1.0 - vignette * smoothstep(0.1, 0.75, r2 * 1.6);
      col += (hash(vUv * resolution + fract(time) * 91.7) - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

/** Objects on this layer are skipped by the main scene pass and drawn by HalfResSmokePass. */
export const HALF_RES_LAYER = 3
/**
 * Draws the alpha smoke at half resolution (a quarter of the pixels) and composites it over the scene.
 * Smoke is soft and low-frequency, so the upsample is invisible, while its overdraw — the dominant
 * GPU cost in explosion storms on integrated graphics — drops ~4x. The smoke shader depth-tests
 * against the resolved scene depth itself, which also gives soft edges where smoke meets geometry.
 */
class HalfResSmokePass extends Pass {
  private readonly rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  private readonly quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, tSmoke: { value: this.rt.texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tScene; uniform sampler2D tSmoke; varying vec2 vUv;
void main() { vec4 s = texture2D(tScene, vUv); vec4 p = texture2D(tSmoke, vUv); gl_FragColor = vec4(p.rgb + s.rgb * (1.0 - p.a), s.a); }`,
    depthTest: false,
    depthWrite: false,
  }))
  private readonly clearColor = new THREE.Color()
  constructor(private readonly mesh: THREE.Mesh, private readonly camera: THREE.PerspectiveCamera) {
    super()
    this.needsSwap = true
    mesh.layers.set(HALF_RES_LAYER)
  }
  setSize(w: number, h: number): void {
    this.rt.setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)))
  }
  render(gl: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms
    u.sceneDepth.value = readBuffer.depthTexture
    u.depthRes.value.set(this.rt.width, this.rt.height)
    u.camNear.value = this.camera.near
    u.camFar.value = this.camera.far
    u.offscreen.value = 1
    gl.getClearColor(this.clearColor)
    const clearAlpha = gl.getClearAlpha()
    const autoClear = gl.autoClear
    const mask = this.camera.layers.mask
    gl.setClearColor(0x000000, 0)
    gl.setRenderTarget(this.rt)
    gl.clear(true, false, false)
    gl.autoClear = false
    this.camera.layers.set(HALF_RES_LAYER)
    gl.render(this.mesh, this.camera)
    this.camera.layers.mask = mask
    gl.autoClear = autoClear
    gl.setClearColor(this.clearColor, clearAlpha)
    u.offscreen.value = 0
    ;(this.quad.material as THREE.ShaderMaterial).uniforms.tScene.value = readBuffer.texture
    gl.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(gl)
  }
  dispose(): void {
    this.rt.dispose()
    this.quad.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }
}
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private grade?: ShaderPass
  private smoke?: THREE.Mesh
  private preset: Preset
  private scene?: THREE.Scene
  private camera?: THREE.PerspectiveCamera
  /** Gameplay-driven grade values. */
  readonly fx = { damage: 0, lowHealth: 0, flash: 0, overdrive: 0 }

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.preset = QUALITY_PRESETS[quality]
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1.05
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize())
  }

  get shadowMapSize(): number {
    return this.preset.shadowMap
  }
  get particleDensity(): number {
    return this.preset.particles
  }
  get shadowsEnabled(): boolean {
    return this.preset.shadows
  }

  applyQuality(quality: Quality): void {
    this.preset = QUALITY_PRESETS[quality]
    this.gl.shadowMap.enabled = this.preset.shadows
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio))
    this.composer?.dispose()
    this.bloom?.dispose()
    this.composer = undefined
    this.bloom = undefined
    this.grade = undefined
    this.resize()
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer {
    if (this.composer && this.scene === scene && this.camera === camera) return this.composer
    this.composer?.dispose()
    this.scene = scene
    this.camera = camera
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.preset.samples })
    if (this.smoke) target.depthTexture = new THREE.DepthTexture(size.x, size.y)
    this.composer = new EffectComposer(this.gl, target)
    this.composer.addPass(new RenderPass(scene, camera))
    if (this.smoke) this.composer.addPass(new HalfResSmokePass(this.smoke, camera))
    if (this.preset.bloom) {
      const css = this.gl.getSize(new THREE.Vector2())
      this.bloom = new UnrealBloomPass(css, 0.55, 0.55, 0.92)
      this.composer.addPass(this.bloom)
    }
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GradeShader)
    this.composer.addPass(this.grade)
    const css = this.gl.getSize(new THREE.Vector2())
    this.composer.setPixelRatio(this.gl.getPixelRatio())
    this.composer.setSize(css.x, css.y)
    return this.composer
  }

  /** Route the alpha smoke system through the half-resolution pass (rebuilds the pipeline). */
  setHalfResSmoke(mesh: THREE.Mesh): void {
    if (this.smoke === mesh) return
    this.smoke = mesh
    this.composer?.dispose()
    this.composer = undefined
  }
  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setSize(w, h, false)
    if (this.composer) {
      this.composer.setPixelRatio(this.gl.getPixelRatio())
      this.composer.setSize(w, h)
    }
    if (this.camera) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const composer = this.ensureComposer(scene, camera)
    if (this.grade) {
      const u = this.grade.uniforms
      u.time.value = time
      u.damage.value = this.fx.damage
      u.lowHealth.value = this.fx.lowHealth
      u.flash.value = this.fx.flash
      u.overdrive.value = this.fx.overdrive
      u.resolution.value.set(w, h)
    }
    composer.render()
  }
}

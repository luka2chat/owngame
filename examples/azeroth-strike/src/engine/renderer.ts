import * as THREE from 'three'

/** First-person weapons live on this layer and are drawn after the world over a cleared depth buffer. */
export const VIEW_LAYER = 1

/** Distance fog at normal zoom; a scope pushes it out by its magnification. */
const FOG = { near: 180, far: 900 }

/** WebGL renderer, scene, first-person camera, sky, fog and a sun with a player-following shadow. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly sun: THREE.DirectionalLight
  private readonly sunOffset = new THREE.Vector3(-120, 220, -80)

  constructor(canvas: HTMLCanvasElement, sky = 0x9cc3e6) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // Refreshed once per frame in render(), not again for the weapon pass.
    this.renderer.shadowMap.autoUpdate = false
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.08, 1600)
    this.scene.background = new THREE.Color(sky)
    this.scene.fog = new THREE.Fog(sky, FOG.near, FOG.far)
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x5a4a32, 1.35)
    hemi.layers.enable(VIEW_LAYER)
    this.scene.add(hemi)
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.1)
    this.sun.layers.enable(VIEW_LAYER)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const s = this.sun.shadow.camera
    s.left = s.bottom = -70
    s.right = s.top = 70
    s.near = 10
    s.far = 600
    this.sun.shadow.bias = -0.0006
    this.scene.add(this.sun, this.sun.target)
    this.scene.add(this.camera)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  /** Looking through `magnify`× optics: the fog keeps the same look at the apparent distance. */
  setMagnification(magnify: number): void {
    const fog = this.scene.fog as THREE.Fog
    const far = this.camera.far * 0.95
    fog.far = Math.min(FOG.far * magnify, far)
    fog.near = Math.min(FOG.near * magnify, fog.far * 0.6)
  }

  resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** `weapons` adds the first-person weapon pass, which can never be hidden inside a wall. */
  render(weapons = false): void {
    const { renderer, scene, camera } = this
    const p = camera.position
    this.sun.target.position.copy(p)
    this.sun.position.copy(p).add(this.sunOffset)
    renderer.shadowMap.needsUpdate = true
    renderer.render(scene, camera)
    if (!weapons) return
    // A colour background forces a clear, and the scene matrices are already current.
    const background = scene.background
    scene.background = null
    scene.matrixWorldAutoUpdate = false
    renderer.autoClear = false
    renderer.clearDepth()
    camera.layers.set(VIEW_LAYER)
    renderer.render(scene, camera)
    camera.layers.set(0)
    renderer.autoClear = true
    scene.matrixWorldAutoUpdate = true
    scene.background = background
  }
}

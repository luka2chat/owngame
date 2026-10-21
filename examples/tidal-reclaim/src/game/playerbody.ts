import * as THREE from 'three'
import { buildRobot, RobotAnimator, type RobotAsset, type RobotParts } from './robot'
import type { VmAssets } from './tripoguns'

/**
 * Kai's full body, rendered only into the shadow map: the player sees their own silhouette (helmet,
 * plate carrier, carbine) stride across the floor and walls, which sells presence in first person
 * without the classic "camera inside the neck" artefacts of drawing the body itself.
 */
export class PlayerBody {
  readonly parts: RobotParts
  private readonly anim: RobotAnimator
  private readonly prev = new THREE.Vector3()
  private time = 0
  constructor(asset: RobotAsset, vm: VmAssets) {
    this.parts = buildRobot(asset, 'operator', '#ff7a2a', 'rifle', vm)
    this.anim = new RobotAnimator(this.parts)
    this.parts.root.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = false
      m.frustumCulled = false
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      const hidden = mats.map(src => {
        const c = (src as THREE.Material).clone()
        c.colorWrite = false
        c.depthWrite = false
        return c
      })
      m.material = Array.isArray(m.material) ? hidden : hidden[0]
    })
    this.parts.root.visible = false
  }
  /** feet: interpolated feet position; yaw/pitch: view angles; vel: world velocity. */
  update(dt: number, visible: boolean, feet: THREE.Vector3, yaw: number, pitch: number, vel: THREE.Vector3, crouch = 0): void {
    const root = this.parts.root
    root.visible = visible
    if (!visible) return
    this.time += dt
    // Sit the body slightly behind the eye so the head never pokes through the near plane in shadow.
    root.position.set(feet.x + Math.sin(yaw) * 0.12, feet.y, feet.z + Math.cos(yaw) * 0.12)
    root.rotation.y = yaw
    // Crouch/slide: squash the shadow-casting body so its shadow drops with the camera.
    root.scale.y = 1 - crouch * 0.34
    const sp = Math.hypot(vel.x, vel.z)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw)
    const fwd = sp > 0.1 ? (vel.x * fx + vel.z * fz) / sp : 0
    const side = sp > 0.1 ? (vel.x * -fz + vel.z * fx) / sp : 0
    this.anim.update(dt, sp, fwd, side, 0, pitch, this.time)
    this.prev.copy(feet)
  }
}

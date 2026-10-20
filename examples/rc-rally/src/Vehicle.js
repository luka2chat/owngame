import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// `?url` tells Vite to serve the file and give us its URL, both in dev and build
import baseModelUrl from './assets/base.glb?url'
import wheelFrontLeftUrl from './assets/front-left.glb?url'
import wheelFrontRightUrl from './assets/front-right.glb?url'
import wheelBackLeftUrl from './assets/back-left.glb?url'
import wheelBackRightUrl from './assets/back-right.glb?url'

/**
 * Physics-driven car built on cannon-es RaycastVehicle — the same technique
 * used by Bruno Simon's portfolio and swift502/Sketchbook. The chassis is a
 * rigid body; each wheel is a raycast suspension that applies engine,
 * brake and steering forces.
 *
 * All tunable values live in `DEFAULT_PARAMS` and can be changed live
 * through `vehicle.params` (see the lil-gui panel wired up in main.js).
 */

const CHASSIS_SIZE = { x: 1.8, y: 0.6, z: 4.0 } // visual body size
const PHYSICS_HALF = { x: 0.9, y: 0.3, z: 1.55 } // physics box (shorter than visuals so wheels meet ramps first)
// Physics box sits this far above the body origin: lowers the center of mass
const CHASSIS_LIFT = 0.5

const WHEEL_RADIUS = 0.42
const WHEEL_WIDTH = 0.32
// Wheels attach at the corners, slightly up the chassis so the suspension
// rays start high and can't get submerged by ramps at speed
const WHEEL_CONNECTION = { x: 0.95, y: 0.35, z: 1.55 }

export const DEFAULT_PARAMS = {
  // engine
  engineForce: 1400,
  boostMultiplier: 1.8,
  cruiseSpeedKmh: 90, // top speed on W alone
  maxSpeedKmh: 140, // top speed while holding Shift (boost)
  reverseFactor: 0.6,
  // steering
  maxSteer: 0.55,
  steerSpeed: 6,
  // brakes
  brakeForce: 18,
  handbrakeForce: 32,
  // jump
  jumpImpulse: 2000,
  jumpCooldown: 0.5,
  jumpBufferTime: 0.18,
  // Extra gravity while airborne (1 = realistic). Higher values make jump
  // arcs snappier and less floaty without changing grounded handling.
  airborneGravityScale: 2.0,
  // suspension / tires
  suspensionStiffness: 70,
  suspensionRestLength: 0.55,
  maxSuspensionTravel: 0.42,
  frictionSlip: 7.8,
  dampingRelaxation: 3.5,
  dampingCompression: 4.4,
  // chassis
  mass: 250,
  angularDamping: 0.12,
  // pitch/roll inertia multiplier: higher = harder to flip, yaw unaffected
  inertiaScale: 3,
  // assists
  antiWheelie: true,
  tiltClampAirborne: 4, // max pitch/roll spin (rad/s) while airborne
  uprightAssist: true,
  wallSlideAssist: true,
  wallSlideMaxSpeedKmh: 18,
  wallSlideStrength: 5,
  // pitch/roll spin multiplier per frame while a wheel is off the ground
  // (1 = off, lower = settles harder). Kills corner-lift from clipping boxes.
  cornerLiftDamping: 0.7,
  // Tire load sensitivity: lateral grip is capped at this multiple of the
  // static wheel load, so suspension spikes (landings, ramp compressions)
  // can't produce an instant unnatural yank sideways.
  gripLoadCap: 2,
  // After landing a jump, grip fades back in over this many seconds
  landingGripTime: 0.35,
  landingGripFactor: 0.4, // grip fraction at the moment of touchdown
}

export const DEFAULT_BODY_MODEL_PARAMS = {
  scale: 0.98,
  offsetX: 0,
  offsetY: 0.75,
  offsetZ: -0.17,
  rotationY: -180, // degrees
}

export const DEFAULT_WHEEL_MODEL_PARAMS = {
  frontScale: 1.1,
  frontTrackOffset: 0,
  frontOffsetX: 0,
  frontOffsetY: 0.16,
  frontOffsetZ: -0.24,
  frontRotationY: 180,
  frontSpinDirection: -1,
  backScale: 1.4,
  backTrackOffset: 0.12,
  backOffsetX: 0,
  backOffsetY: 0.24,
  backOffsetZ: -0.06,
  backRotationY: 0,
  backSpinDirection: -1,
}

export const DEFAULT_REFLECTION_PARAMS = {
  glbReflectionIntensity: 0.47,
}

export const DEFAULT_TIRE_MARK_PARAMS = {
  enabled: true,
  drawWhileMoving: false,
  minSpeedKmh: 91,
  minSteer: 0.01,
  frontWidth: 0.5,
  backWidth: 0.65,
  backSpacing: 0.22,
  backForwardOffset: 0.28,
  opacity: 0.40,
  capOpacity: 0,
  fadeLength: 1.1,
  surfaceOffset: 0.05,
  contactGraceTime: 0.18,
  maxPointGap: 6,
  maxMarks: 700,
}

const clamp = THREE.MathUtils.clamp

export class Vehicle {
  constructor(scene, physicsWorld, glbReflectionMap = null, getTireMarkSurfaceY = null) {
    this.scene = scene
    this.physicsWorld = physicsWorld
    this.glbReflectionMap = glbReflectionMap
    this.getTireMarkSurfaceY = getTireMarkSurfaceY
    this.params = { ...DEFAULT_PARAMS }

    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      boost: false,
      gamepadBoost: false,
      handbrake: false,
      throttleAxis: 0,
      steerAxis: 0,
    }
    this.currentSteer = 0

    // Visual-only tweaks for the loaded body model (adjustable in the GUI).
    // Scale is a multiplier on top of the automatic fit-to-chassis scale.
    this.bodyModelParams = { ...DEFAULT_BODY_MODEL_PARAMS }
    this.wheelModelParams = { ...DEFAULT_WHEEL_MODEL_PARAMS }
    this.reflectionParams = { ...DEFAULT_REFLECTION_PARAMS }
    this.tireMarkParams = { ...DEFAULT_TIRE_MARK_PARAMS }
    this._bodyModelHolder = null
    this._bodyModelFitScale = 1
    this._glbMaterials = []
    this.debugParams = { physics: false }

    this.spawnPosition = new CANNON.Vec3(0, 10, 0)
    this.spawnQuaternion = new CANNON.Quaternion()

    this._tmpVec = new CANNON.Vec3()
    this._tmpVec2 = new CANNON.Vec3()
    this._tmpQuat = new CANNON.Quaternion()
    this._tmpForward = new CANNON.Vec3()
    this._tmpRight = new CANNON.Vec3()
    this._tmpWallNormal = new CANNON.Vec3()
    this._tmpWallTangent = new CANNON.Vec3()
    this._tmpMarkPosition = new THREE.Vector3()
    this._tmpMarkLeft = new THREE.Vector3()
    this._tmpMarkRight = new THREE.Vector3()

    this._airborneTime = 0
    this._gripRecoveryT = Infinity // seconds since last landing
    this._jumpCooldown = 0
    this._jumpBuffer = 0
    this._wheelSpin = [0, 0, 0, 0] // visual wheel roll angle (rad), see _syncVisuals
    this._tireMarks = []
    this._activeTireMarkStreaks = [null, null, null, null]
    this._lastTireMarkPositions = Array.from({ length: 4 }, () => new THREE.Vector3())
    this._lastTireMarkDirections = Array.from({ length: 4 }, () => new THREE.Vector3(0, 0, 1))
    this._hasLastTireMark = [false, false, false, false]
    this._tireMarkStarted = [false, false, false, false]
    this._tireMarkMissTime = [0, 0, 0, 0]

    this._createPhysics()
    this._createVisuals()
    this._createTireMarks()
    this.ready = this._loadModels()
    this._bindKeys()
  }

  _createPhysics() {
    const p = this.params

    // Low-friction chassis material: when the body itself scrapes ground or
    // ramps it slides instead of grabbing and pole-vaulting the car
    this.chassisMaterial = new CANNON.Material('chassis')
    this.physicsWorld.addContactMaterial(
      new CANNON.ContactMaterial(this.chassisMaterial, this.physicsWorld.defaultMaterial, {
        friction: 0.01,
        restitution: 0,
      })
    )

    const chassisShape = new CANNON.Box(
      new CANNON.Vec3(PHYSICS_HALF.x, PHYSICS_HALF.y, PHYSICS_HALF.z)
    )

    this.chassisBody = new CANNON.Body({ mass: p.mass, material: this.chassisMaterial })
    this.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, CHASSIS_LIFT, 0))

    // cannon-es Trimesh (the level collider) only produces contacts against
    // spheres, not boxes. These corner spheres sit flush inside the chassis
    // box so the body still collides with trimesh walls and ramps.
    const cornerRadius = PHYSICS_HALF.y
    const cornerX = PHYSICS_HALF.x - cornerRadius
    const cornerZ = PHYSICS_HALF.z - cornerRadius
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.chassisBody.addShape(
          new CANNON.Sphere(cornerRadius),
          new CANNON.Vec3(sx * cornerX, CHASSIS_LIFT, sz * cornerZ)
        )
      }
    }
    this.chassisBody.position.copy(this.spawnPosition)
    this.chassisBody.quaternion.copy(this.spawnQuaternion)
    // Keep this low: high angular damping kills steering response
    this.chassisBody.angularDamping = p.angularDamping
    // Never let the physics engine put the car to sleep, or it stops responding
    this.chassisBody.allowSleep = false

    this.raycastVehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    })

    const wheelOptions = {
      radius: WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: p.suspensionStiffness,
      suspensionRestLength: p.suspensionRestLength,
      frictionSlip: p.frictionSlip,
      dampingRelaxation: p.dampingRelaxation,
      dampingCompression: p.dampingCompression,
      maxSuspensionForce: 100000,
      rollInfluence: 0.008,
      axleLocal: new CANNON.Vec3(1, 0, 0),
      maxSuspensionTravel: p.maxSuspensionTravel,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    }

    const { x, y, z } = WHEEL_CONNECTION
    // Order: front-left, front-right, back-left, back-right
    const connectionPoints = [
      new CANNON.Vec3(-x, y, z),
      new CANNON.Vec3(x, y, z),
      new CANNON.Vec3(-x, y, -z),
      new CANNON.Vec3(x, y, -z),
    ]

    for (const point of connectionPoints) {
      this.raycastVehicle.addWheel({
        ...wheelOptions,
        chassisConnectionPointLocal: point,
      })
    }

    this.raycastVehicle.addToWorld(this.physicsWorld)
    this.applyChassisParams()
  }

  /** Push mass / damping / inertia params to the physics body. */
  applyChassisParams() {
    const p = this.params
    const body = this.chassisBody
    body.mass = p.mass
    body.angularDamping = p.angularDamping
    body.updateMassProperties()
    // Scale pitch (x) and roll (z) inertia so collisions can't flip the car
    // easily; yaw (y) stays stock so steering feel is unchanged
    body.inertia.x *= p.inertiaScale
    body.inertia.z *= p.inertiaScale
    body.invInertia.set(
      body.inertia.x > 0 ? 1 / body.inertia.x : 0,
      body.inertia.y > 0 ? 1 / body.inertia.y : 0,
      body.inertia.z > 0 ? 1 / body.inertia.z : 0
    )
    body.updateInertiaWorld(true)
  }

  /** Push suspension / tire params to all four wheels. */
  applyWheelParams() {
    const p = this.params
    for (const wheel of this.raycastVehicle.wheelInfos) {
      wheel.suspensionStiffness = p.suspensionStiffness
      wheel.suspensionRestLength = p.suspensionRestLength
      wheel.maxSuspensionTravel = p.maxSuspensionTravel
      wheel.frictionSlip = p.frictionSlip
      wheel.dampingRelaxation = p.dampingRelaxation
      wheel.dampingCompression = p.dampingCompression
    }
  }

  _createVisuals() {
    this.group = new THREE.Group()
    this.scene.add(this.group)

    // --- Chassis: a simple stylized car out of boxes ---
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.15 })
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 })
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.1, metalness: 0.4 })

    // Body parts live in a subgroup lifted to match the physics shape offset
    const bodyGroup = new THREE.Group()
    bodyGroup.position.y = CHASSIS_LIFT
    this.group.add(bodyGroup)
    this.bodyGroup = bodyGroup

    // Everything placeholder goes in one group so the loaded GLB can replace
    // it with a single removal
    this.placeholderBody = new THREE.Group()
    bodyGroup.add(this.placeholderBody)

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(CHASSIS_SIZE.x, CHASSIS_SIZE.y, CHASSIS_SIZE.z),
      bodyMaterial
    )
    base.castShadow = true

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_SIZE.x * 0.82, 0.55, 1.8), glassMaterial)
    cabin.position.set(0, 0.5, -0.35)
    cabin.castShadow = true

    const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_SIZE.x * 0.95, 0.25, 0.3), darkMaterial)
    bumperFront.position.set(0, -0.2, CHASSIS_SIZE.z / 2)

    const bumperBack = bumperFront.clone()
    bumperBack.position.z = -CHASSIS_SIZE.z / 2

    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff7cc,
      emissive: 0xfff2b0,
      emissiveIntensity: 0.9,
    })
    const headlightL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), headlightMaterial)
    headlightL.position.set(-0.55, 0.08, CHASSIS_SIZE.z / 2 + 0.01)
    const headlightR = headlightL.clone()
    headlightR.position.x = 0.55

    this.placeholderBody.add(base, cabin, bumperFront, bumperBack, headlightL, headlightR)

    // --- Wheels ---
    const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 24)
    wheelGeometry.rotateZ(Math.PI / 2) // cylinder axis -> x (axle)
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 })
    const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.3, metalness: 0.6 })

    this.wheelMeshes = []
    this.wheelVisualRoots = []
    for (let i = 0; i < 4; i++) {
      const wheel = new THREE.Group()
      const visualRoot = new THREE.Group()
      const tire = new THREE.Mesh(wheelGeometry, wheelMaterial)
      tire.castShadow = true
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS * 0.55, WHEEL_RADIUS * 0.55, WHEEL_WIDTH + 0.02, 12).rotateZ(Math.PI / 2),
        hubMaterial
      )
      visualRoot.add(tire, hub)
      wheel.add(visualRoot)
      // Parented to the car group: wheels are positioned in chassis-local
      // space so they can't visually lag behind the interpolated body.
      this.group.add(wheel)
      this.wheelMeshes.push(wheel)
      this.wheelVisualRoots.push(visualRoot)
    }
    this.applyWheelModelParams()
  }

  _createTireMarks() {
    this.tireMarkGroup = new THREE.Group()
    this.scene.add(this.tireMarkGroup)

    this.tireMarkAlphaMap = this._createTireMarkAlphaMap(false)
    this.tireMarkCapAlphaMap = this._createTireMarkAlphaMap(true)
    this.tireMarkMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: this.tireMarkParams.opacity,
      alphaMap: this.tireMarkAlphaMap,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide,
    })
    this.tireMarkCapMaterial = this.tireMarkMaterial.clone()
    this.tireMarkCapMaterial.alphaMap = this.tireMarkCapAlphaMap
    this.applyTireMarkParams()
  }

  _createTireMarkAlphaMap(fadeAlongLength) {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    const imageData = context.createImageData(size, size)
    const minCapAlpha = clamp(
      this.tireMarkParams.capOpacity / Math.max(this.tireMarkParams.opacity, 0.001),
      0,
      1
    )

    for (let y = 0; y < size; y++) {
      const v = y / (size - 1)
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1)
        const edge = Math.sin(Math.PI * u) ** 0.55
        const lengthFade = fadeAlongLength ? minCapAlpha + (1 - minCapAlpha) * v : 1
        const alpha = Math.round(255 * edge * lengthFade)
        const index = (y * size + x) * 4
        imageData.data[index] = 255
        imageData.data[index + 1] = 255
        imageData.data[index + 2] = 255
        imageData.data[index + 3] = alpha
      }
    }

    context.putImageData(imageData, 0, 0)
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

  clearTireMarks() {
    for (const mark of this._tireMarks) {
      mark.removeFromParent()
      mark.geometry.dispose()
      if (mark.userData.ownsMaterial) mark.material.dispose()
    }
    this._tireMarks.length = 0
    this._activeTireMarkStreaks.fill(null)
    this._hasLastTireMark.fill(false)
    this._tireMarkStarted.fill(false)
  }

  applyTireMarkParams() {
    if (this.tireMarkMaterial) {
      this.tireMarkAlphaMap.dispose()
      this.tireMarkCapAlphaMap.dispose()
      this.tireMarkAlphaMap = this._createTireMarkAlphaMap(false)
      this.tireMarkCapAlphaMap = this._createTireMarkAlphaMap(true)
      this.tireMarkMaterial.color.set(0x000000)
      this.tireMarkMaterial.opacity = this.tireMarkParams.opacity
      this.tireMarkMaterial.alphaMap = this.tireMarkAlphaMap
      this.tireMarkMaterial.transparent = true
      this.tireMarkMaterial.depthTest = true
      this.tireMarkMaterial.needsUpdate = true
      this.tireMarkCapMaterial.color.set(0x000000)
      this.tireMarkCapMaterial.opacity = this.tireMarkParams.opacity
      this.tireMarkCapMaterial.alphaMap = this.tireMarkCapAlphaMap
      this.tireMarkCapMaterial.transparent = true
      this.tireMarkCapMaterial.depthTest = true
      this.tireMarkCapMaterial.needsUpdate = true
    }
    while (this._tireMarks.length > this.tireMarkParams.maxMarks) {
      const oldMark = this._tireMarks.shift()
      oldMark.removeFromParent()
      oldMark.geometry.dispose()
      if (oldMark.userData.ownsMaterial) oldMark.material.dispose()
    }
  }

  _createTireMarkStreak(index, start, width) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.tireMarkMaterial)
    mesh.renderOrder = 3
    this.tireMarkGroup.add(mesh)
    this._tireMarks.push(mesh)

    const streak = {
      index,
      width,
      points: [start.clone()],
      mesh,
    }
    this._activeTireMarkStreaks[index] = streak
    return streak
  }

  _rebuildTireMarkStreak(streak) {
    const { points, width, mesh } = streak
    if (points.length < 2) return

    const positions = []
    const uvs = []
    const indices = []
    let distance = 0

    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      const previous = points[Math.max(0, i - 1)]
      const next = points[Math.min(points.length - 1, i + 1)]
      const tangent = next.clone().sub(previous)
      if (tangent.lengthSq() < 0.0001) tangent.copy(this._lastTireMarkDirections[streak.index])
      tangent.normalize()

      this._tmpMarkLeft.set(-tangent.z, 0, tangent.x).multiplyScalar(width * 0.5)
      this._tmpMarkRight.copy(this._tmpMarkLeft).multiplyScalar(-1)

      const left = point.clone().add(this._tmpMarkLeft)
      const right = point.clone().add(this._tmpMarkRight)
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z)

      if (i > 0) distance += points[i - 1].distanceTo(point)
      uvs.push(0, distance, 1, distance)

      if (i < points.length - 1) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
      }
    }

    mesh.geometry.dispose()
    mesh.geometry = new THREE.BufferGeometry()
    mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    mesh.geometry.setIndex(indices)
    mesh.geometry.computeVertexNormals()
  }

  _addTireMarkSegment(start, end, width, startScale = 1, endScale = 1, capMode = null, opacityScale = 1) {
    const direction = end.clone().sub(start)
    const length = direction.length()
    if (length < 0.05) return

    direction.divideScalar(length)
    const overlap = capMode ? 0 : 0.015
    const segmentStart = start.clone().addScaledVector(direction, -overlap)
    const segmentEnd = end.clone().addScaledVector(direction, overlap)
    this._tmpMarkLeft.set(-direction.z, 0, direction.x).multiplyScalar(width * 0.5)
    this._tmpMarkRight.copy(this._tmpMarkLeft).multiplyScalar(-1)

    const startLeft = segmentStart.clone().add(this._tmpMarkLeft.clone().multiplyScalar(startScale))
    const startRight = segmentStart.clone().add(this._tmpMarkRight.clone().multiplyScalar(startScale))
    const endLeft = segmentEnd.clone().add(this._tmpMarkLeft.clone().multiplyScalar(endScale))
    const endRight = segmentEnd.clone().add(this._tmpMarkRight.clone().multiplyScalar(endScale))

    const geometry = new THREE.BufferGeometry().setFromPoints([
      startLeft,
      startRight,
      endLeft,
      endRight,
    ])
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        capMode === 'end'
          ? [0, 1, 1, 1, 0, 0, 1, 0]
          : [0, 0, 1, 0, 0, 1, 1, 1],
        2
      )
    )
    geometry.setIndex([0, 1, 2, 2, 1, 3])
    geometry.computeVertexNormals()

    let material = capMode ? this.tireMarkCapMaterial : this.tireMarkMaterial
    if (opacityScale !== 1) {
      material = material.clone()
      material.opacity *= opacityScale
      material.needsUpdate = true
    }
    const mark = new THREE.Mesh(geometry, material)
    mark.userData.ownsMaterial = opacityScale !== 1
    mark.renderOrder = 3
    this.tireMarkGroup.add(mark)
    this._tireMarks.push(mark)
  }

  _addTireMarkFade(start, direction, width, mode) {
    const steps = 4
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps
      const t1 = (i + 1) / steps
      const a = start.clone().addScaledVector(direction, this.tireMarkParams.fadeLength * t0)
      const b = start.clone().addScaledVector(direction, this.tireMarkParams.fadeLength * t1)
      const fade = mode === 'start' ? t1 : 1 - t0
      const minFade = this.tireMarkParams.capOpacity / Math.max(this.tireMarkParams.opacity, 0.001)
      const opacityScale = minFade + (1 - minFade) * fade
      this._addTireMarkSegment(a, b, width, 1, 1, mode, opacityScale)
    }
  }

  _endTireMarkStreak(index) {
    if (!this._hasLastTireMark[index] || !this._tireMarkStarted[index]) {
      this._hasLastTireMark[index] = false
      this._tireMarkStarted[index] = false
      return
    }

    const p = this.tireMarkParams
    const width = index < 2 ? p.frontWidth : p.backWidth
    const start = this._lastTireMarkPositions[index]
    this._addTireMarkFade(start, this._lastTireMarkDirections[index], width, 'end')
    this._activeTireMarkStreaks[index] = null
    this._hasLastTireMark[index] = false
    this._tireMarkStarted[index] = false
  }

  /** Push visual-only wheel scale params to the wheel groups. */
  applyWheelModelParams() {
    if (!this.wheelVisualRoots) return
    const p = this.wheelModelParams
    this.wheelVisualRoots.forEach((root, index) => {
      const scale = index < 2 ? p.frontScale : p.backScale
      root.scale.setScalar(scale)
      root.position.set(0, 0, 0)
      root.rotation.set(0, 0, 0)

      if (index < 2) {
        root.rotation.y = THREE.MathUtils.degToRad(p.frontRotationY)
      } else {
        root.rotation.y = THREE.MathUtils.degToRad(p.backRotationY)
      }
    })
  }

  /** Push reflection settings to all loaded GLB materials. */
  applyReflectionParams() {
    for (const material of this._glbMaterials) {
      if (this.glbReflectionMap) material.envMap = this.glbReflectionMap
      material.envMapIntensity = this.reflectionParams.glbReflectionIntensity
      material.needsUpdate = true
    }
  }

  /** Push the GUI transform tweaks to the loaded body model (no-op until it loads). */
  applyBodyModelParams() {
    const holder = this._bodyModelHolder
    if (!holder) return
    const p = this.bodyModelParams
    holder.scale.setScalar(this._bodyModelFitScale * p.scale)
    holder.position.set(p.offsetX, p.offsetY, p.offsetZ)
    holder.rotation.y = THREE.MathUtils.degToRad(p.rotationY)
  }

  /**
   * Swap the placeholder boxes/cylinders for the GLB models in src/assets.
   * Runs async: the placeholders stay visible until each model is ready, and
   * they stay permanently if a file is missing or empty (with a console
   * warning), so the car is always drivable.
   */
  async _loadModels() {
    const loader = new GLTFLoader()

    // Returns the model root, or null if the file contains no visible mesh
    const loadScene = async (url) => {
      const gltf = await loader.loadAsync(url)
      let hasMesh = false
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          hasMesh = true
          child.castShadow = true
          child.receiveShadow = true
          if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            materials.forEach((material) => {
              if (!this._glbMaterials.includes(material)) this._glbMaterials.push(material)
            })
            this.applyReflectionParams()
          }
        }
      })
      return hasMesh ? gltf.scene : null
    }

    /**
     * Centers a model on its own origin and scales it uniformly so
     * `sourceSize` (its current extent on some axis) becomes `targetSize`.
     * Keeping visuals sized off the physics constants means the model always
     * matches the collision shape, whatever scale it was exported at.
     */
    const fitModel = (root, sourceSize, targetSize) => {
      const box = new THREE.Box3().setFromObject(root)
      const center = box.getCenter(new THREE.Vector3())
      root.position.sub(center)
      const holder = new THREE.Group()
      holder.add(root)
      holder.scale.setScalar(targetSize / sourceSize)
      return holder
    }

    // --- Chassis body ---
    try {
      const bodyRoot = await loadScene(baseModelUrl)
      if (bodyRoot) {
        const size = new THREE.Box3().setFromObject(bodyRoot).getSize(new THREE.Vector3())
        // Scale so the model's length matches the physics chassis length
        const fitted = fitModel(bodyRoot, size.z, CHASSIS_SIZE.z)
        this.placeholderBody.removeFromParent()
        this.bodyGroup.add(fitted)
        // Remember the auto-fit scale so the GUI multiplier stacks on top
        this._bodyModelHolder = fitted
        this._bodyModelFitScale = fitted.scale.x
        this.applyBodyModelParams()
      } else {
        console.warn('base.glb contains no meshes — keeping placeholder body')
      }
    } catch (error) {
      console.warn('Could not load base.glb — keeping placeholder body', error)
    }

    // --- Wheels (same order as the physics wheels: FL, FR, BL, BR) ---
    const wheelUrls = [wheelFrontLeftUrl, wheelFrontRightUrl, wheelBackLeftUrl, wheelBackRightUrl]
    for (let i = 0; i < 4; i++) {
      try {
        const wheelRoot = await loadScene(wheelUrls[i])
        if (!wheelRoot) {
          console.warn(`Wheel model ${i} contains no meshes — keeping placeholder`)
          continue
        }
        const size = new THREE.Box3().setFromObject(wheelRoot).getSize(new THREE.Vector3())
        // The tire is round in y/z (the x axis is the axle), so the larger of
        // the two is the wheel diameter
        const fitted = fitModel(wheelRoot, Math.max(size.y, size.z), WHEEL_RADIUS * 2)
        this.wheelVisualRoots[i].clear()
        this.wheelVisualRoots[i].add(fitted)
        this.applyWheelModelParams()
      } catch (error) {
        console.warn(`Could not load wheel model ${i} — keeping placeholder`, error)
      }
    }
  }

  _bindKeys() {
    const map = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      ShiftLeft: 'boost',
      ShiftRight: 'boost',
      Space: 'handbrake',
    }

    window.addEventListener('keydown', (event) => {
      const action = map[event.code]
      if (action) {
        this.input[action] = true
        event.preventDefault()
      }
      if (event.code === 'Space' && !event.repeat) this.requestJump()
      if (event.code === 'KeyR') this.respawn()
    })

    window.addEventListener('keyup', (event) => {
      const action = map[event.code]
      if (action) this.input[action] = false
    })
  }

  requestJump() {
    this._jumpBuffer = this.params.jumpBufferTime
  }

  respawn() {
    this.chassisBody.position.copy(this.spawnPosition)
    this.chassisBody.quaternion.copy(this.spawnQuaternion)
    this.chassisBody.velocity.setZero()
    this.chassisBody.angularVelocity.setZero()
  }

  get speedKmh() {
    return this.chassisBody.velocity.length() * 3.6
  }

  update(delta) {
    this._jumpCooldown = Math.max(0, this._jumpCooldown - delta)
    this._jumpBuffer = Math.max(0, this._jumpBuffer - delta)
    this._tryJump()
    this._applyControls(delta)
    this._applyAssists(delta)
    this._updateTireMarks(delta)
    this._syncVisuals(delta)
  }

  _tryJump() {
    const p = this.params
    if (this._jumpBuffer <= 0) return
    if (this._jumpCooldown > 0) return

    const grounded = this.raycastVehicle.wheelInfos.some((wheel) => wheel.isInContact)
    if (!grounded) return

    this.chassisBody.applyImpulse(
      new CANNON.Vec3(0, p.jumpImpulse, 0),
      new CANNON.Vec3(0, 0, 0)
    )
    this.chassisBody.velocity.y = Math.max(this.chassisBody.velocity.y, p.jumpImpulse / p.mass)
    this._jumpCooldown = p.jumpCooldown
    this._jumpBuffer = 0
  }

  _applyControls(delta) {
    const p = this.params
    const vehicle = this.raycastVehicle
    const wheels = vehicle.wheelInfos
    const { forward, backward, left, right, boost, gamepadBoost, handbrake, throttleAxis, steerAxis } = this.input

    // --- Steering with smoothing ---
    const steerInput = Math.abs(steerAxis) > 0.05
      ? steerAxis
      : (right ? 1 : 0) + (left ? -1 : 0)
    // The car faces local +Z. With +Y up, the driver's right is -X;
    // Cannon's positive steering turns toward +X (the driver's left).
    const targetSteer = -steerInput * p.maxSteer
    const steerDelta = p.steerSpeed * delta
    this.currentSteer = clamp(
      targetSteer,
      this.currentSteer - steerDelta,
      this.currentSteer + steerDelta
    )
    vehicle.setSteeringValue(this.currentSteer, 0)
    vehicle.setSteeringValue(this.currentSteer, 1)

    // --- Engine ---
    // W alone tops out at cruise speed; holding boost raises the cap
    const speed = this.speedKmh
    const boosting = boost || gamepadBoost
    const speedCap = boosting ? p.maxSpeedKmh : p.cruiseSpeedKmh
    const throttleInput = Math.abs(throttleAxis) > 0.05
      ? throttleAxis
      : (forward ? 1 : 0) + (backward ? -1 : 0)
    const forwardInput = throttleInput > 0.05
    const backwardInput = throttleInput < -0.05
    const throttleAmount = Math.min(1, Math.abs(throttleInput))
    let force = 0
    if (forwardInput && speed < speedCap) {
      force = -p.engineForce * (boosting ? p.boostMultiplier : 1) * throttleAmount
    } else if (backwardInput) {
      // Moving forward + pressing back = brake; otherwise reverse
      const movingForward = this.chassisBody.velocity.dot(this._forwardDir()) > 0.5
      force = movingForward ? 0 : p.engineForce * p.reverseFactor * throttleAmount
    }

    // Anti-wheelie: forward force scales with front axle load, so the car
    // can't torque itself onto its rear bumper. Floor keeps ramps climbable.
    if (force < 0 && p.antiWheelie) {
      const frontLoad = wheels[0].suspensionForce + wheels[1].suspensionForce
      const nominalAxleLoad = (p.mass * 9.82) / 2
      force *= clamp(frontLoad / (nominalAxleLoad * 0.4), 0.35, 1)
    }

    // Rear-wheel drive
    vehicle.applyEngineForce(force, 2)
    vehicle.applyEngineForce(force, 3)

    // --- Brakes ---
    let brake = 0
    if (backwardInput && this.chassisBody.velocity.dot(this._forwardDir()) > 0.5) {
      brake = p.brakeForce
    }
    if (!forwardInput && !backwardInput) {
      brake = 1.2 // gentle engine braking so the car coasts to a stop
    }

    for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i)
    if (handbrake) {
      vehicle.setBrake(p.handbrakeForce, 2)
      vehicle.setBrake(p.handbrakeForce, 3)
    }

    // Auto-respawn if we fall off the world
    if (this.chassisBody.position.y < -20) this.respawn()
  }

  _applyAssists(delta) {
    const p = this.params
    const body = this.chassisBody
    const wheels = this.raycastVehicle.wheelInfos
    const groundedCount = wheels.reduce((n, w) => n + (w.isInContact ? 1 : 0), 0)
    const grounded = groundedCount > 0

    // --- Landing detection for the grip fade-in ---
    if (!grounded) {
      this._airborneTime += delta
    } else {
      if (this._airborneTime > 0.15) this._gripRecoveryT = 0 // just landed
      this._airborneTime = 0
      this._gripRecoveryT += delta
    }

    // --- Natural grip: load cap + landing fade-in ---
    // Without this, suspension force spikes (landings, ramp compressions)
    // multiply straight into lateral grip and the car snaps to the wheel
    // direction the instant it touches down.
    const staticLoad = (p.mass * 9.82) / 4
    const landingBlend = clamp(this._gripRecoveryT / p.landingGripTime, 0, 1)
    const landingScale = p.landingGripFactor + (1 - p.landingGripFactor) * landingBlend
    for (const wheel of wheels) {
      const load = Math.max(wheel.suspensionForce, staticLoad)
      const loadScale = Math.min(1, (p.gripLoadCap * staticLoad) / load)
      wheel.frictionSlip = p.frictionSlip * loadScale * landingScale
    }

    this._applyWallSlideAssist(delta)

    // Extra gravity while fully airborne so jumps don't feel floaty. Applied
    // as a force (cleared each physics step) so it never affects ground driving.
    if (!grounded && p.airborneGravityScale > 1) {
      this._tmpVec.set(0, -(p.airborneGravityScale - 1) * 9.82 * p.mass, 0)
      body.applyForce(this._tmpVec)
    }

    // Airborne tilt clamp: limits pitch/roll spin only when no wheel touches
    // anything, so it never fights the car rotating to follow ramps.
    if (!grounded && p.tiltClampAirborne > 0) {
      this._clampLocalTilt(p.tiltClampAirborne)
    }

    // Corner-lift damping: some wheels grounded, some lifted means an
    // obstacle is levering the car up — bleed off pitch/roll spin so the
    // lifted corner settles instead of climbing. Never fires on flat ground
    // (all four wheels stay in contact).
    if (groundedCount > 0 && groundedCount < 4 && p.cornerLiftDamping < 1) {
      const body = this.chassisBody
      body.quaternion.conjugate(this._tmpQuat)
      this._tmpQuat.vmult(body.angularVelocity, this._tmpVec)
      this._tmpVec.x *= p.cornerLiftDamping
      this._tmpVec.z *= p.cornerLiftDamping
      body.quaternion.vmult(this._tmpVec, body.angularVelocity)
    }

    // Upright assist: past ~40° of tilt, bleed off pitch/roll spin so the car
    // settles back down instead of flipping over, and gently torque it back
    // toward flat so it doesn't hang on its side for seconds.
    if (p.uprightAssist) {
      body.quaternion.vmult(UP, this._tmpVec)
      const bodyUpY = this._tmpVec.y
      if (bodyUpY < 0.75) {
        // Righting torque only at low speed, so it never fights intentional
        // driving on steep ramps or quarter-pipes.
        const speedFade = clamp(1 - (this.speedKmh - 15) / 15, 0, 1)
        if (speedFade > 0) {
          // Axis that rotates the roof back toward world-up. The cross
          // product's length is sin(tilt), so the torque naturally peaks
          // when fully sideways and eases off as the car flattens out.
          this._tmpVec.cross(UP, this._tmpVec2)
          this._tmpVec2.scale(p.mass * 55 * speedFade, this._tmpVec2)
          body.torque.vadd(this._tmpVec2, body.torque)
        }

        body.quaternion.conjugate(this._tmpQuat)
        this._tmpQuat.vmult(body.angularVelocity, this._tmpVec)
        this._tmpVec.x *= 0.88
        this._tmpVec.z *= 0.88
        body.quaternion.vmult(this._tmpVec, body.angularVelocity)
      }
    }
  }

  _applyWallSlideAssist(delta) {
    const p = this.params
    const driveInput = Math.abs(this.input.throttleAxis) > 0.05
      ? this.input.throttleAxis
      : (this.input.forward ? 1 : 0) + (this.input.backward ? -1 : 0)
    if (!p.wallSlideAssist || driveInput === 0 || this.speedKmh > p.wallSlideMaxSpeedKmh) return

    const contacts = this.physicsWorld.contacts
    if (!contacts?.length) return

    const body = this.chassisBody
    body.quaternion.vmult(FORWARD, this._tmpForward)
    this._tmpForward.y = 0
    if (driveInput < 0) this._tmpForward.scale(-1, this._tmpForward)
    if (this._tmpForward.lengthSquared() <= 0.0001) return
    this._tmpForward.normalize()

    for (const contact of contacts) {
      let otherBody = null
      let otherContactOffset = null

      if (contact.bi === body) {
        this._tmpWallNormal.copy(contact.ni)
        otherBody = contact.bj
        otherContactOffset = contact.rj
      } else if (contact.bj === body) {
        contact.ni.scale(-1, this._tmpWallNormal)
        otherBody = contact.bi
        otherContactOffset = contact.ri
      } else {
        continue
      }

      if (!otherBody || otherBody.mass > 0) continue

      otherBody.position.vadd(otherContactOffset, this._tmpVec)
      body.position.vsub(this._tmpVec, this._tmpVec)
      if (this._tmpWallNormal.dot(this._tmpVec) < 0) {
        this._tmpWallNormal.scale(-1, this._tmpWallNormal)
      }

      // Only help against wall-like contacts; floors and ramps should keep their normal behavior.
      if (Math.abs(this._tmpWallNormal.y) > 0.45) continue
      this._tmpWallNormal.y = 0
      if (this._tmpWallNormal.lengthSquared() <= 0.0001) continue
      this._tmpWallNormal.normalize()

      const intoWallSpeed = body.velocity.dot(this._tmpWallNormal)
      if (intoWallSpeed < 0) {
        this._tmpWallNormal.scale(-intoWallSpeed * 0.85, this._tmpVec)
        body.velocity.vadd(this._tmpVec, body.velocity)
      }

      this._tmpWallTangent.copy(this._tmpForward)
      this._tmpWallNormal.scale(-this._tmpWallTangent.dot(this._tmpWallNormal), this._tmpVec)
      this._tmpWallTangent.vadd(this._tmpVec, this._tmpWallTangent)
      this._tmpWallTangent.y = 0
      if (this._tmpWallTangent.lengthSquared() <= 0.02) continue
      this._tmpWallTangent.normalize()

      const tangentSpeed = body.velocity.dot(this._tmpWallTangent)
      if (tangentSpeed < 3) {
        this._tmpWallTangent.scale(p.wallSlideStrength * delta, this._tmpVec)
        body.velocity.vadd(this._tmpVec, body.velocity)
      }
    }
  }

  _clampLocalTilt(limit) {
    const body = this.chassisBody
    body.quaternion.conjugate(this._tmpQuat)
    this._tmpQuat.vmult(body.angularVelocity, this._tmpVec)
    this._tmpVec.x = clamp(this._tmpVec.x, -limit, limit)
    this._tmpVec.z = clamp(this._tmpVec.z, -limit, limit)
    body.quaternion.vmult(this._tmpVec, body.angularVelocity)
  }

  _forwardDir() {
    // The car travels toward local +z (headlight side) when accelerating
    const dir = new CANNON.Vec3()
    this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, 1), dir)
    return dir
  }

  _updateTireMarks(delta) {
    const p = this.tireMarkParams
    const anyActive = this._tireMarkStarted.some(Boolean)
    const minSteer = anyActive ? p.minSteer * 0.45 : p.minSteer
    const isTurning = p.drawWhileMoving || Math.abs(this.currentSteer) > minSteer || this.input.handbrake
    if (!p.enabled || this.speedKmh < p.minSpeedKmh) {
      for (let i = 0; i < 4; i++) this._endTireMarkStreak(i)
      return
    }
    if (!isTurning) {
      for (let i = 0; i < 4; i++) {
        this._tireMarkMissTime[i] += delta
        if (this._tireMarkMissTime[i] >= p.contactGraceTime) this._endTireMarkStreak(i)
      }
      return
    }

    for (let i = 0; i < 4; i++) {
      const wheel = this.raycastVehicle.wheelInfos[i]
      if (!wheel.isInContact || !wheel.raycastResult.hasHit) {
        this._tireMarkMissTime[i] += delta
        if (this._tireMarkMissTime[i] >= p.contactGraceTime) this._endTireMarkStreak(i)
        continue
      }
      this._tireMarkMissTime[i] = 0

      const hit = wheel.raycastResult.hitPointWorld
      const visualSurfaceY = this.getTireMarkSurfaceY?.()
      const markY = Number.isFinite(visualSurfaceY)
        ? Math.max(hit.y + 0.018, visualSurfaceY + p.surfaceOffset)
        : hit.y + 0.018
      this._tmpMarkPosition.set(hit.x, markY, hit.z)
      if (i >= 2 && p.backSpacing !== 0) {
        const side = i === 2 ? -1 : 1
        this.chassisBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0), this._tmpRight)
        this._tmpMarkPosition.x += this._tmpRight.x * side * p.backSpacing
        this._tmpMarkPosition.z += this._tmpRight.z * side * p.backSpacing
      }
      if (i >= 2 && p.backForwardOffset !== 0) {
        this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, 1), this._tmpForward)
        this._tmpMarkPosition.x += this._tmpForward.x * p.backForwardOffset
        this._tmpMarkPosition.z += this._tmpForward.z * p.backForwardOffset
      }

      const lastPosition = this._lastTireMarkPositions[i]
      const hasLast = this._hasLastTireMark[i]
      if (hasLast && lastPosition.distanceToSquared(this._tmpMarkPosition) < 0.01) {
        continue
      }

      if (!hasLast || lastPosition.distanceToSquared(this._tmpMarkPosition) > p.maxPointGap * p.maxPointGap) {
        this._endTireMarkStreak(i)
        lastPosition.copy(this._tmpMarkPosition)
        this._hasLastTireMark[i] = true
        continue
      }

      this._lastTireMarkDirections[i]
        .copy(this._tmpMarkPosition)
        .sub(lastPosition)
        .normalize()

      const width = i < 2 ? p.frontWidth : p.backWidth
      if (!this._tireMarkStarted[i]) {
        const capStart = lastPosition
          .clone()
          .addScaledVector(this._lastTireMarkDirections[i], -p.fadeLength)
        this._addTireMarkFade(capStart, this._lastTireMarkDirections[i], width, 'start')
        const streak = this._createTireMarkStreak(i, lastPosition, width)
        streak.points.push(this._tmpMarkPosition.clone())
        this._rebuildTireMarkStreak(streak)
        this._tireMarkStarted[i] = true
      } else {
        let streak = this._activeTireMarkStreaks[i]
        if (!streak) streak = this._createTireMarkStreak(i, lastPosition, width)
        streak.width = width
        streak.points.push(this._tmpMarkPosition.clone())
        this._rebuildTireMarkStreak(streak)
      }

      lastPosition.copy(this._tmpMarkPosition)
      this._hasLastTireMark[i] = true
    }

    while (this._tireMarks.length > p.maxMarks) {
      const oldMark = this._tireMarks.shift()
      oldMark.removeFromParent()
      oldMark.geometry.dispose()
      if (oldMark.userData.ownsMaterial) oldMark.material.dispose()
    }
  }

  _syncVisuals(delta) {
    // Interpolated transforms remove the visual stutter that shows up when
    // the render rate (e.g. 120 Hz) doesn't match the fixed physics rate.
    this.group.position.copy(this.chassisBody.interpolatedPosition)
    this.group.quaternion.copy(this.chassisBody.interpolatedQuaternion)

    // Roll speed from ground speed along the car's forward axis. We track
    // this ourselves because cannon-es zeroes wheel rotation whenever
    // brake > engineForce, which our always-on coast brake triggers — that's
    // why wheels would only spin while accelerating.
    const forwardSpeed = this.chassisBody.velocity.dot(this._forwardDir())

    // Wheels: convert the physics world transform into chassis-local space,
    // then let the (interpolated) group place them in the world.
    for (let i = 0; i < 4; i++) {
      // Overwrite cannon's rotation with ours before it builds the transform.
      // Negative: matches cannon's sign convention for a y-up vehicle.
      this._wheelSpin[i] -= (forwardSpeed * delta) / this.raycastVehicle.wheelInfos[i].radius
      const spinDirection = i >= 2
        ? this.wheelModelParams.backSpinDirection
        : this.wheelModelParams.frontSpinDirection
      this.raycastVehicle.wheelInfos[i].rotation = this._wheelSpin[i] * spinDirection

      this.raycastVehicle.updateWheelTransform(i)
      const wheelInfo = this.raycastVehicle.wheelInfos[i]
      const transform = wheelInfo.worldTransform

      this.chassisBody.pointToLocalFrame(transform.position, this._tmpVec)
      if (!wheelInfo.isInContact) {
        // Cannon extends the visual wheel to the raycast's current suspension
        // length while airborne. For this model that makes the wheels appear
        // to drift away from the car, so render them at the normal rest pose
        // until suspension contact resumes.
        this._tmpVec.copy(wheelInfo.chassisConnectionPointLocal)
        this._tmpVec.vadd(wheelInfo.directionLocal.scale(wheelInfo.suspensionRestLength), this._tmpVec)
      }
      const p = this.wheelModelParams
      if (i < 2) {
        const side = i === 0 ? -1 : 1
        this._tmpVec.x += p.frontOffsetX + side * p.frontTrackOffset
        this._tmpVec.y += p.frontOffsetY
        this._tmpVec.z += p.frontOffsetZ
      } else {
        const side = i === 2 ? -1 : 1
        // Apply rear wheel offsets to the wheel center, not to the mesh child.
        // That lets Y/track tweaks move the GLB without making it orbit while rolling.
        this._tmpVec.x += p.backOffsetX + side * p.backTrackOffset
        this._tmpVec.y += p.backOffsetY
        this._tmpVec.z += p.backOffsetZ
      }
      this.chassisBody.quaternion.conjugate(this._tmpQuat)
      this._tmpQuat.mult(transform.quaternion, this._tmpQuat)

      this.wheelMeshes[i].position.copy(this._tmpVec)
      this.wheelMeshes[i].quaternion.copy(this._tmpQuat)
    }
  }
}

const UP = new CANNON.Vec3(0, 1, 0)
const FORWARD = new CANNON.Vec3(0, 0, 1)

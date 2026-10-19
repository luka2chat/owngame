import { Race } from './Race.js'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import GUI from 'lil-gui'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import {
  Vehicle,
  DEFAULT_PARAMS,
  DEFAULT_BODY_MODEL_PARAMS,
  DEFAULT_WHEEL_MODEL_PARAMS,
  DEFAULT_REFLECTION_PARAMS,
  DEFAULT_TIRE_MARK_PARAMS,
} from './Vehicle.js'
import { World, DEFAULT_ENVIRONMENT_PARAMS } from './World.js'
import houseReflectionUrl from './assets/reflection.jpg?url'

// --- Renderer & scene -------------------------------------------------------

const container = document.getElementById('app')
const viewport = document.getElementById('viewport')
const mobileDevice = matchMedia('(pointer:coarse)').matches

// MSAA on the default framebuffer only applies when post-processing is off;
// the composer path gets its own multisampled render targets below.
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(viewport.clientWidth, viewport.clientHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileDevice ? 1.25 : 2))
renderer.shadowMap.enabled = true
// Plain PCF so sun.shadow.radius (the "Shadow softness" slider) applies
renderer.shadowMap.type = THREE.PCFShadowMap
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()

function createSoftOutdoorEnvironmentMaps(renderer) {
  const makeFace = (topColor, bottomColor) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, topColor)
    gradient.addColorStop(0.55, '#9fc2d4')
    gradient.addColorStop(1, bottomColor)
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas
  }

  const cubeTexture = new THREE.CubeTexture([
    makeFace('#6687a0', '#586446'), // +x
    makeFace('#6c8ca4', '#515d3f'), // -x
    makeFace('#8daec5', '#708b9c'), // +y
    makeFace('#4f5a3d', '#303629'), // -y
    makeFace('#6689a1', '#586443'), // +z
    makeFace('#607f96', '#4f5b3d'), // -z
  ])
  cubeTexture.colorSpace = THREE.SRGBColorSpace
  cubeTexture.needsUpdate = true

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  const reflectionMap = pmremGenerator.fromCubemap(cubeTexture).texture
  pmremGenerator.dispose()
  return {
    backgroundMap: cubeTexture,
    reflectionMap,
  }
}

async function createImageReflectionMap(renderer, url) {
  const texture = await new THREE.TextureLoader().loadAsync(url)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  const reflectionMap = pmremGenerator.fromEquirectangular(texture).texture
  pmremGenerator.dispose()
  texture.dispose()
  return reflectionMap
}

// Generated reflection map for GLB materials only. Keeping it off
// scene.environment prevents the whole world from looking over-lit/washed out.
const { backgroundMap: outdoorBackgroundMap, reflectionMap: glbReflectionMap } =
  createSoftOutdoorEnvironmentMaps(renderer)
const houseReflectionMap = await createImageReflectionMap(renderer, houseReflectionUrl)
scene.background = outdoorBackgroundMap
// Warm horizon and distant haze give the model course depth without a mobile post-process.
scene.fog = new THREE.Fog(0xc8d9d7, 150, 540)

const DEFAULT_CAMERA_PARAMS = {
  fov: 60,
  far: 10000,
}
const cameraParams = { ...DEFAULT_CAMERA_PARAMS }
let cameraBoostBlend = 0
const camera = new THREE.PerspectiveCamera(
  cameraParams.fov,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  cameraParams.far
)
camera.position.set(0, 6, -10)

const DEFAULT_POST_PARAMS = {
  enabled: !mobileDevice,
  aoEnabled: false,
  aoIntensity: 1.5,
  aoRadius: 2,
  // When on, scales the AO kernel with on-screen size instead of a fixed
  // world-space distance (helps when object scales vary wildly).
  aoScreenSpaceRadius: false,
  exposure: 1,
  contrast: 1,
  brightness: 0,
  saturation: 1.1,
  vignetteStrength: 1,
  vignetteRadius: 0.24,
  noiseAmount: 0,
  chromaticAberration: 0.0014,
  windLinesStrength: 0.35,
  windLinesMinSpeedKmh: 110,
}
const BOOST_POST_PARAMS = {
  vignetteStrength: 1.35,
  chromaticAberration: 0.012,
}
const postParams = { ...DEFAULT_POST_PARAMS }
let postBoostBlend = 0
let windLinesBlend = 0
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = postParams.exposure

const colorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(viewport.clientWidth, viewport.clientHeight) },
    time: { value: 0 },
    contrast: { value: postParams.contrast },
    brightness: { value: postParams.brightness },
    saturation: { value: postParams.saturation },
    vignetteStrength: { value: postParams.vignetteStrength },
    vignetteRadius: { value: postParams.vignetteRadius },
    noiseAmount: { value: postParams.noiseAmount },
    chromaticAberration: { value: postParams.chromaticAberration },
    windLines: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float contrast;
    uniform float brightness;
    uniform float saturation;
    uniform float vignetteStrength;
    uniform float vignetteRadius;
    uniform float noiseAmount;
    uniform float chromaticAberration;
    uniform float windLines;
    varying vec2 vUv;

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233)) + time) * 43758.5453123);
    }

    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
    }

    // Thin radial streaks near the screen edges, racing toward the center.
    float windStreaks(vec2 uv) {
      vec2 dir = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
      float radius = length(dir);
      float angle = atan(dir.y, dir.x);

      const float LINE_COUNT = 90.0;
      float slot = angle / 6.2831853 * LINE_COUNT;
      float bin = floor(slot);

      // Only a sparse, changing subset of angular slots carries a streak
      float seed = hash(bin * 7.13 + floor(time * 9.0) * 131.7);
      float streakOn = step(0.82, seed);

      // Thin soft line inside the slot
      float linePos = abs(fract(slot) - 0.5);
      float lineMask = smoothstep(0.10, 0.02, linePos);

      // Streak races outward (past the camera) over its lifetime
      float lifetime = fract(time * 9.0);
      float head = mix(0.42, 1.05, lifetime * (0.5 + 0.5 * hash(bin * 3.7)));
      float trail = smoothstep(head - 0.28, head - 0.05, radius) * smoothstep(head + 0.08, head, radius);

      // Keep the middle of the screen clear
      float edgeMask = smoothstep(0.38, 0.75, radius);

      return streakOn * lineMask * trail * edgeMask;
    }

    void main() {
      vec2 center = vec2(0.5);
      vec2 direction = vUv - center;
      vec2 aberrationOffset = direction * chromaticAberration;

      vec4 color = texture2D(tDiffuse, vUv);
      color.r = texture2D(tDiffuse, vUv + aberrationOffset).r;
      color.b = texture2D(tDiffuse, vUv - aberrationOffset).b;

      color.rgb += brightness;
      color.rgb = (color.rgb - 0.5) * contrast + 0.5;

      float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(luminance), color.rgb, saturation);

      float dist = distance(vUv, center);
      float vignette = smoothstep(vignetteRadius, 0.98, dist);
      color.rgb *= 1.0 - vignette * vignetteStrength;

      float noise = random(vUv * resolution) - 0.5;
      color.rgb += noise * noiseAmount;

      if (windLines > 0.001) {
        color.rgb += windStreaks(vUv) * windLines;
      }

      gl_FragColor = vec4(color.rgb, color.a);
    }
  `,
}

const composer = new EffectComposer(renderer)
// 4x MSAA for the post-processing chain — without this the composer renders
// into non-multisampled buffers and all geometry edges alias.
composer.renderTarget1.samples = 4
composer.renderTarget2.samples = 4
const renderPass = new RenderPass(scene, camera)
const gtaoPass = new GTAOPass(scene, camera, viewport.clientWidth, viewport.clientHeight)
gtaoPass.output = GTAOPass.OUTPUT.Default
const colorGradePass = new ShaderPass(colorGradeShader)
const outputPass = new OutputPass()
composer.addPass(renderPass)
composer.addPass(gtaoPass)
composer.addPass(colorGradePass)
composer.addPass(outputPass)

function applyCameraParams(fovOverride = cameraParams.fov) {
  camera.fov = fovOverride
  camera.far = cameraParams.far
  camera.updateProjectionMatrix()
}

function applyPostParams() {
  const boostedVignette = THREE.MathUtils.lerp(
    postParams.vignetteStrength,
    BOOST_POST_PARAMS.vignetteStrength,
    postBoostBlend
  )
  const boostedChromatic = THREE.MathUtils.lerp(
    postParams.chromaticAberration,
    BOOST_POST_PARAMS.chromaticAberration,
    postBoostBlend
  )

  renderer.toneMappingExposure = postParams.exposure
  gtaoPass.enabled = postParams.enabled && postParams.aoEnabled
  gtaoPass.blendIntensity = postParams.aoIntensity
  gtaoPass.updateGtaoMaterial({
    radius: postParams.aoRadius,
    screenSpaceRadius: postParams.aoScreenSpaceRadius,
  })
  colorGradePass.enabled = postParams.enabled
  colorGradePass.uniforms.contrast.value = postParams.contrast
  colorGradePass.uniforms.brightness.value = postParams.brightness
  colorGradePass.uniforms.saturation.value = postParams.saturation
  colorGradePass.uniforms.vignetteStrength.value = boostedVignette
  colorGradePass.uniforms.vignetteRadius.value = postParams.vignetteRadius
  colorGradePass.uniforms.noiseAmount.value = postParams.noiseAmount
  colorGradePass.uniforms.chromaticAberration.value = boostedChromatic
}
applyPostParams()

new ResizeObserver(() => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(viewport.clientWidth, viewport.clientHeight)
  composer.setSize(viewport.clientWidth, viewport.clientHeight)
  colorGradePass.uniforms.resolution.value.set(viewport.clientWidth, viewport.clientHeight)
}).observe(viewport)

// --- Physics -----------------------------------------------------------------

const physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld)
physicsWorld.allowSleep = true
physicsWorld.defaultContactMaterial.friction = 0.3

// --- Game objects ------------------------------------------------------------

const world = new World(scene, physicsWorld, houseReflectionMap)
await world.ready
if (!world.house || !world.colliderBody) throw new Error('赛场加载失败')
const vehicle = new Vehicle(scene, physicsWorld, glbReflectionMap)
await vehicle.ready
const DEFAULT_LIGHTING_PARAMS = {
  ambientIntensity: world.hemi.intensity,
  sunIntensity: world.sun.intensity,
}

const shadowParams = {
  sunX: world.sun.position.x,
  sunY: world.sun.position.y,
  sunZ: world.sun.position.z,
  shadowMapSize: world.sun.shadow.mapSize.x,
  shadowCameraSize: 80,
  shadowBias: world.sun.shadow.bias,
  shadowNormalBias: world.sun.shadow.normalBias,
  shadowRadius: world.sun.shadow.radius,
}
const DEFAULT_SHADOW_PARAMS = { ...shadowParams }
applyShadowParams()

function applyShadowParams() {
  world.sun.position.set(shadowParams.sunX, shadowParams.sunY, shadowParams.sunZ)
  world.sun.shadow.camera.left = -shadowParams.shadowCameraSize
  world.sun.shadow.camera.right = shadowParams.shadowCameraSize
  world.sun.shadow.camera.top = shadowParams.shadowCameraSize
  world.sun.shadow.camera.bottom = -shadowParams.shadowCameraSize
  world.sun.shadow.bias = shadowParams.shadowBias
  world.sun.shadow.normalBias = shadowParams.shadowNormalBias
  world.sun.shadow.radius = shadowParams.shadowRadius
  world.sun.shadow.camera.updateProjectionMatrix()

  if (world.sun.shadow.mapSize.x !== shadowParams.shadowMapSize) {
    world.sun.shadow.mapSize.set(shadowParams.shadowMapSize, shadowParams.shadowMapSize)
    world.sun.shadow.map?.dispose()
    world.sun.shadow.map = null
  }
}

function createPhysicsDebug(scene, physicsWorld, vehicle) {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)

  const colliderMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
  })
  const rayMaterial = new THREE.LineBasicMaterial({
    color: 0xff00ff,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  })

  const colliders = []
  const rayLines = []

  const getGeometry = (shape) => {
    if (shape instanceof CANNON.Box) {
      const h = shape.halfExtents
      return new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2)
    }
    if (shape instanceof CANNON.Sphere) {
      return new THREE.SphereGeometry(shape.radius, 16, 8)
    }
    if (shape instanceof CANNON.Cylinder) {
      return new THREE.CylinderGeometry(
        shape.radiusTop,
        shape.radiusBottom,
        shape.height,
        shape.numSegments
      )
    }
    if (shape instanceof CANNON.Trimesh) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(shape.vertices), 3)
      )
      geometry.setIndex(Array.from(shape.indices))
      geometry.computeVertexNormals()
      return geometry
    }
    return null
  }

  const rebuild = () => {
    colliders.length = 0
    rayLines.length = 0
    group.clear()

    for (const body of physicsWorld.bodies) {
      body.shapes.forEach((shape, shapeIndex) => {
        const geometry = getGeometry(shape)
        if (!geometry) return
        const mesh = new THREE.Mesh(geometry, colliderMaterial)
        mesh.renderOrder = 1000
        group.add(mesh)
        colliders.push({ body, shapeIndex, mesh })
      })
    }

    for (let i = 0; i < vehicle.raycastVehicle.wheelInfos.length; i++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        rayMaterial
      )
      line.renderOrder = 1001
      group.add(line)
      rayLines.push(line)
    }
  }

  const sync = () => {
    if (!group.visible) return

    colliders.forEach(({ body, shapeIndex, mesh }) => {
      const offset = body.shapeOffsets[shapeIndex]
      const orientation = body.shapeOrientations[shapeIndex]
      const rotatedOffset = body.quaternion.vmult(offset)

      mesh.position.set(
        body.position.x + rotatedOffset.x,
        body.position.y + rotatedOffset.y,
        body.position.z + rotatedOffset.z
      )
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
      mesh.quaternion.multiply(
        new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w)
      )
    })

    vehicle.raycastVehicle.wheelInfos.forEach((wheel, index) => {
      const line = rayLines[index]
      if (!line) return

      const start = wheel.chassisConnectionPointWorld
      const end = wheel.raycastResult.hasHit
        ? wheel.raycastResult.hitPointWorld
        : start.vadd(wheel.directionWorld.scale(wheel.suspensionRestLength + wheel.radius))

      const positions = line.geometry.attributes.position
      positions.setXYZ(0, start.x, start.y, start.z)
      positions.setXYZ(1, end.x, end.y, end.z)
      positions.needsUpdate = true
      line.geometry.computeBoundingSphere()
    })
  }

  rebuild()

  return {
    setVisible(visible) {
      if (visible && colliders.length !== physicsWorld.bodies.reduce((n, body) => n + body.shapes.length, 0)) {
        rebuild()
      }
      group.visible = visible
      sync()
    },
    update: sync,
  }
}

const physicsDebug = createPhysicsDebug(scene, physicsWorld, vehicle)
physicsDebug.setVisible(vehicle.debugParams.physics)

// --- Chase camera ------------------------------------------------------------

const cameraOffset = new THREE.Vector3(22, 32, -32) // higher angle so more of the car is visible
const cameraLookOffset = new THREE.Vector3(0, 1.2, 11) // look slightly ahead
const airborneCameraOffset = new THREE.Vector3(24, 35, -36)
const airborneCameraLookOffset = new THREE.Vector3(0, 0.6, 9.5)
const cameraOrbitPivotOffset = new THREE.Vector3(0, 1.2, 0) // center of the car for mouse orbit
const cameraOrbitLocalOffset = new THREE.Vector3()
const blendedCameraOffset = new THREE.Vector3()
const blendedCameraLookOffset = new THREE.Vector3()
const cameraPivot = new THREE.Vector3()
const normalTarget = new THREE.Vector3()
const orbitTarget = new THREE.Vector3()
const desiredPosition = new THREE.Vector3()
const desiredTarget = new THREE.Vector3()
const currentTarget = new THREE.Vector3()
const orbitOffset = new THREE.Vector3()
const localXAxis = new THREE.Vector3(1, 0, 0)
const localYAxis = new THREE.Vector3(0, 1, 0)
const CAMERA_ZOOM_MIN = 0.4
const CAMERA_ZOOM_MAX = 1.5
let airborneCameraBlend = 0
const cameraOrbit = {
  yaw: 0,
  pitch: 0,
  targetYaw: 0,
  targetPitch: 0,
  zoom: 1,
  targetZoom: 1,
  dragging: false,
  lastX: 0,
  lastY: 0,
}

function normalizeAngleRadians(angle) {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  cameraOrbit.dragging = true
  cameraOrbit.lastX = event.clientX
  cameraOrbit.lastY = event.clientY
  renderer.domElement.setPointerCapture(event.pointerId)
})

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!cameraOrbit.dragging) return

  const dx = event.clientX - cameraOrbit.lastX
  const dy = event.clientY - cameraOrbit.lastY
  cameraOrbit.lastX = event.clientX
  cameraOrbit.lastY = event.clientY

  // Low sensitivity plus smoothing in updateCamera makes the orbit easier to control.
  cameraOrbit.targetYaw -= dx * 0.0035
  cameraOrbit.targetPitch = THREE.MathUtils.clamp(cameraOrbit.targetPitch - dy * 0.0028, -0.5, 0.35)
})

renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault()
  cameraOrbit.targetZoom = THREE.MathUtils.clamp(
    cameraOrbit.targetZoom + event.deltaY * 0.001,
    CAMERA_ZOOM_MIN,
    CAMERA_ZOOM_MAX
  )
}, { passive: false })

function stopCameraDrag(event) {
  cameraOrbit.dragging = false
  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId)
  }
}

renderer.domElement.addEventListener('pointerup', stopCameraDrag)
renderer.domElement.addEventListener('pointercancel', stopCameraDrag)

function updateCamera(delta) {
  const chassis = vehicle.group
  const accelerating =
    vehicle.input.forward ||
    vehicle.input.backward ||
    Math.abs(vehicle.input.throttleAxis) > 0.05
  if (accelerating) {
    cameraOrbit.dragging = false
    cameraOrbit.yaw = normalizeAngleRadians(cameraOrbit.yaw)
    cameraOrbit.targetYaw = normalizeAngleRadians(cameraOrbit.targetYaw)
    const resetLerp = 1 - Math.exp(-8 * delta)
    cameraOrbit.targetYaw = THREE.MathUtils.lerp(cameraOrbit.targetYaw, 0, resetLerp)
    cameraOrbit.targetPitch = THREE.MathUtils.lerp(cameraOrbit.targetPitch, 0, resetLerp)
  }

  const orbitLerp = 1 - Math.exp(-14 * delta)
  cameraOrbit.yaw = THREE.MathUtils.lerp(cameraOrbit.yaw, cameraOrbit.targetYaw, orbitLerp)
  cameraOrbit.pitch = THREE.MathUtils.lerp(cameraOrbit.pitch, cameraOrbit.targetPitch, orbitLerp)
  cameraOrbit.zoom = THREE.MathUtils.lerp(cameraOrbit.zoom, cameraOrbit.targetZoom, orbitLerp)

  const grounded = vehicle.raycastVehicle.wheelInfos.some((wheel) => wheel.isInContact)
  const upwardSpeed = Math.max(0, vehicle.chassisBody.velocity.y)
  const airborneTarget = grounded ? 0 : THREE.MathUtils.clamp(0.45 + upwardSpeed / 12, 0.45, 1)
  airborneCameraBlend = THREE.MathUtils.lerp(
    airborneCameraBlend,
    airborneTarget,
    1 - Math.exp(-(grounded ? 5 : 3) * delta)
  )

  blendedCameraLookOffset
    .copy(cameraLookOffset)
    .lerp(airborneCameraLookOffset, airborneCameraBlend)
  normalTarget.copy(blendedCameraLookOffset).applyQuaternion(chassis.quaternion).add(chassis.position)
  orbitTarget.copy(cameraOrbitPivotOffset).applyQuaternion(chassis.quaternion).add(chassis.position)
  const orbitAmount = THREE.MathUtils.clamp(
    Math.abs(cameraOrbit.yaw) * 1.5 + Math.abs(cameraOrbit.pitch) * 2 + (cameraOrbit.dragging ? 1 : 0),
    0,
    1
  )

  cameraPivot.copy(orbitTarget)
  blendedCameraOffset.copy(cameraOffset).lerp(airborneCameraOffset, airborneCameraBlend)
  // Subtle dolly-out while boosting: paired with the FOV increase it sells speed
  const boostPullBack = 1 + 0.08 * cameraBoostBlend
  cameraOrbitLocalOffset
    .copy(blendedCameraOffset)
    .sub(cameraOrbitPivotOffset)
    .multiplyScalar(cameraOrbit.zoom * boostPullBack)
  orbitOffset
    .copy(cameraOrbitLocalOffset)
    .applyAxisAngle(localXAxis, cameraOrbit.pitch)
    .applyAxisAngle(localYAxis, cameraOrbit.yaw)

  desiredPosition.copy(orbitOffset).applyQuaternion(chassis.quaternion).add(cameraPivot)
  // Keep the camera from clipping under the ground when the car flips
  desiredPosition.y = Math.max(desiredPosition.y, chassis.position.y + 1.5, 1.2)

  desiredTarget.copy(normalTarget).lerp(orbitTarget, orbitAmount)

  const positionLerp = 1 - Math.exp(-6 * delta)
  const targetLerp = 1 - Math.exp(-10 * delta)
  camera.position.lerp(desiredPosition, positionLerp)
  currentTarget.lerp(desiredTarget, targetLerp)
  camera.lookAt(currentTarget)
}

currentTarget.copy(vehicle.group.position)

// --- Transporter --------------------------------------------------------------

const DEFAULT_TRANSPORTER_PARAMS = {
  enabled: true,
  radius: 4,
  cooldown: 3.6,
  opacity: 0.55,
  ax: -37.7,
  ay: 15.6,
  az: 103.7,
  bx: -25,
  by: 39.1,
  bz: 111.5,
}
const transporterParams = { ...DEFAULT_TRANSPORTER_PARAMS }
let transporterCooldown = 0

const transporterMaterialA = new THREE.MeshBasicMaterial({
  color: 0x38bdf8,
  transparent: true,
  opacity: transporterParams.opacity,
  depthWrite: false,
})
const transporterMaterialB = new THREE.MeshBasicMaterial({
  color: 0xf472b6,
  transparent: true,
  opacity: transporterParams.opacity,
  depthWrite: false,
})
const transporterA = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 64), transporterMaterialA)
const transporterB = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 64), transporterMaterialB)
transporterA.rotation.x = -Math.PI / 2
transporterB.rotation.x = -Math.PI / 2
scene.add(transporterA, transporterB)

function applyTransporterParams() {
  transporterA.visible = transporterParams.enabled
  transporterB.visible = transporterParams.enabled
  transporterA.position.set(transporterParams.ax, transporterParams.ay, transporterParams.az)
  transporterB.position.set(transporterParams.bx, transporterParams.by, transporterParams.bz)
  transporterA.scale.setScalar(transporterParams.radius)
  transporterB.scale.setScalar(transporterParams.radius)
  transporterMaterialA.opacity = transporterParams.opacity
  transporterMaterialB.opacity = transporterParams.opacity
}

function teleportVehicleTo(x, y, z) {
  vehicle.chassisBody.position.set(x, y, z)
  vehicle.chassisBody.interpolatedPosition.set(x, y, z)
  vehicle.chassisBody.velocity.setZero()
  vehicle.chassisBody.angularVelocity.setZero()
  vehicle.clearTireMarks()
}

function updateTransporter(delta) {
  transporterCooldown = Math.max(0, transporterCooldown - delta)
  if (!transporterParams.enabled || transporterCooldown > 0) return

  const body = vehicle.chassisBody
  const radiusSq = transporterParams.radius * transporterParams.radius
  const dxA = body.position.x - transporterParams.ax
  const dyA = body.position.y - transporterParams.ay
  const dzA = body.position.z - transporterParams.az
  const dxB = body.position.x - transporterParams.bx
  const dyB = body.position.y - transporterParams.by
  const dzB = body.position.z - transporterParams.bz

  if (dxA * dxA + dyA * dyA + dzA * dzA <= radiusSq) {
    teleportVehicleTo(transporterParams.bx, transporterParams.by, transporterParams.bz)
    transporterCooldown = transporterParams.cooldown
  } else if (dxB * dxB + dyB * dyB + dzB * dzB <= radiusSq) {
    teleportVehicleTo(transporterParams.ax, transporterParams.ay, transporterParams.az)
    transporterCooldown = transporterParams.cooldown
  }
}

applyTransporterParams()

// --- Tuning GUI ---------------------------------------------------------------

const gui = new GUI({ title: 'Vehicle Tuning' })
const p = vehicle.params
const rp = vehicle.reflectionParams
const tm = vehicle.tireMarkParams
const ep = world.environmentParams
const performanceParams = { fps: 0 }

// Top-level sections, created first so they appear in this order
const vehicleFolder = gui.addFolder('Vehicle')
const cameraFolder = gui.addFolder('Camera')
const worldFolder = gui.addFolder('World')
const effectsFolder = gui.addFolder('Effects')
const modelsFolder = gui.addFolder('Models')
const debugFolder = gui.addFolder('Debug')

const fpsController = debugFolder.add(performanceParams, 'fps').name('FPS').listen()

let guiVisible = true
window.addEventListener('keydown', (event) => {
  const target = event.target
  const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
  if (event.code !== 'Period' || event.repeat || isTyping) return

  guiVisible = !guiVisible
  gui.domElement.style.display = guiVisible ? '' : 'none'
  event.preventDefault()
})

worldFolder
  .add(ep, 'offsetY', -20, 50, 0.1)
  .name('Environment height')
  .onChange(() => world.applyEnvironmentParams())

cameraFolder
  .add(cameraParams, 'fov', 30, 100, 1)
  .name('FOV')
  .onChange(applyCameraParams)
cameraFolder
  .add(cameraParams, 'far', 500, 20000, 100)
  .name('Far clipping')
  .onChange(applyCameraParams)

const transporterFolder = worldFolder.addFolder('Transporter')
transporterFolder.close()
transporterFolder
  .add(transporterParams, 'enabled')
  .name('Enabled')
  .onChange(applyTransporterParams)
transporterFolder
  .add(transporterParams, 'radius', 1, 30, 0.1)
  .name('Radius')
  .onChange(applyTransporterParams)
transporterFolder
  .add(transporterParams, 'cooldown', 0.1, 5, 0.1)
  .name('Cooldown')
transporterFolder
  .add(transporterParams, 'opacity', 0, 1, 0.01)
  .name('Ring opacity')
  .onChange(applyTransporterParams)
transporterFolder
  .add(transporterParams, 'ax', -300, 300, 0.1)
  .name('A X')
  .onChange(applyTransporterParams)
transporterFolder
  .add(transporterParams, 'ay', -50, 100, 0.1)
  .name('A Y')
  .onChange(applyTransporterParams)
transporterFolder
  .add(transporterParams, 'az', -300, 300, 0.1)
  .name('A Z')
  .onChange(applyTransporterParams)
transporterFolder
  .add(transporterParams, 'bx', -300, 300, 0.1)
  .name('B X')
  .onChange(applyTransporterParams)
transporterFolder
  .add(transporterParams, 'by', -50, 100, 0.1)
  .name('B Y')
  .onChange(applyTransporterParams)
transporterFolder
  .add(transporterParams, 'bz', -300, 300, 0.1)
  .name('B Z')
  .onChange(applyTransporterParams)

const lightingFolder = worldFolder.addFolder('Lighting & Shadows')
lightingFolder.close()
lightingFolder
  .add(world.hemi, 'intensity', 0, 2, 0.01)
  .name('Ambient light')
lightingFolder
  .add(world.sun, 'intensity', 0, 5, 0.01)
  .name('Sun light')
lightingFolder
  .add(shadowParams, 'sunX', -100, 100, 1)
  .name('Sun X')
  .onChange(applyShadowParams)
lightingFolder
  .add(shadowParams, 'sunY', 5, 120, 1)
  .name('Sun Y')
  .onChange(applyShadowParams)
lightingFolder
  .add(shadowParams, 'sunZ', -100, 100, 1)
  .name('Sun Z')
  .onChange(applyShadowParams)
lightingFolder
  .add(shadowParams, 'shadowMapSize', [512, 1024, 2048, 4096])
  .name('Shadow map')
  .onChange((value) => {
    shadowParams.shadowMapSize = Number(value)
    applyShadowParams()
  })
lightingFolder
  .add(shadowParams, 'shadowCameraSize', 20, 140, 1)
  .name('Shadow area')
  .onChange(applyShadowParams)
lightingFolder
  .add(shadowParams, 'shadowBias', -0.01, 0.01, 0.0001)
  .name('Shadow bias')
  .onChange(applyShadowParams)
lightingFolder
  .add(shadowParams, 'shadowNormalBias', 0, 0.1, 0.001)
  .name('Normal bias')
  .onChange(applyShadowParams)
lightingFolder
  .add(shadowParams, 'shadowRadius', 0, 10, 0.1)
  .name('Shadow softness')
  .onChange(applyShadowParams)
lightingFolder
  .add(rp, 'glbReflectionIntensity', 0, 1, 0.01)
  .name('GLB reflection')
  .onChange(() => vehicle.applyReflectionParams())

const postFolder = effectsFolder.addFolder('Post Processing')
postFolder.close()
postFolder
  .add(postParams, 'enabled')
  .name('Enabled')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'aoEnabled')
  .name('Ambient occlusion (GTAO)')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'aoIntensity', 0, 3, 0.01)
  .name('AO intensity')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'aoRadius', 0.05, 5, 0.01)
  .name('AO radius')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'aoScreenSpaceRadius')
  .name('AO screen-space radius')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'exposure', 0.1, 3, 0.01)
  .name('Exposure')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'contrast', 0, 2, 0.01)
  .name('Contrast')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'brightness', -0.5, 0.5, 0.01)
  .name('Brightness')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'saturation', 0, 2, 0.01)
  .name('Saturation')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'vignetteStrength', 0, 2, 0.01)
  .name('Vignette')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'vignetteRadius', 0.1, 1, 0.01)
  .name('Vignette radius')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'noiseAmount', 0, 0.15, 0.001)
  .name('Noise')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'chromaticAberration', 0, 0.02, 0.0001)
  .name('Chromatic aberration')
  .onChange(applyPostParams)
postFolder
  .add(postParams, 'windLinesStrength', 0, 1, 0.01)
  .name('Wind lines strength')
postFolder
  .add(postParams, 'windLinesMinSpeedKmh', 0, 200, 5)
  .name('Wind lines min speed')

const bm = vehicle.bodyModelParams
const bodyModelFolder = modelsFolder.addFolder('Body GLB Transform')
bodyModelFolder.close()
bodyModelFolder
  .add(bm, 'scale', 0.1, 4, 0.01)
  .name('Scale ×')
  .onChange(() => vehicle.applyBodyModelParams())
bodyModelFolder
  .add(bm, 'offsetX', -3, 3, 0.01)
  .name('Offset X')
  .onChange(() => vehicle.applyBodyModelParams())
bodyModelFolder
  .add(bm, 'offsetY', -3, 3, 0.01)
  .name('Offset Y')
  .onChange(() => vehicle.applyBodyModelParams())
bodyModelFolder
  .add(bm, 'offsetZ', -3, 3, 0.01)
  .name('Offset Z')
  .onChange(() => vehicle.applyBodyModelParams())
bodyModelFolder
  .add(bm, 'rotationY', -180, 180, 1)
  .name('Rotate Y (°)')
  .onChange(() => vehicle.applyBodyModelParams())

const wm = vehicle.wheelModelParams
const wheelModelFolder = modelsFolder.addFolder('Wheel GLB Transform')
wheelModelFolder.close()
wheelModelFolder
  .add(wm, 'frontScale', 0.1, 4, 0.01)
  .name('Front scale ×')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'frontTrackOffset', -1, 1, 0.01)
  .name('Front push out/in')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'frontOffsetX', -2, 2, 0.01)
  .name('Front offset X')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'frontOffsetY', -2, 2, 0.01)
  .name('Front offset Y')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'frontOffsetZ', -2, 2, 0.01)
  .name('Front offset Z')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'frontRotationY', -180, 180, 1)
  .name('Front rotate Y (°)')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'frontSpinDirection', { Normal: 1, Reversed: -1 })
  .name('Front spin')
wheelModelFolder
  .add(wm, 'backScale', 0.1, 4, 0.01)
  .name('Back scale ×')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'backTrackOffset', -1, 1, 0.01)
  .name('Back push out/in')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'backOffsetX', -2, 2, 0.01)
  .name('Back offset X')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'backOffsetY', -2, 2, 0.01)
  .name('Back offset Y')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'backOffsetZ', -2, 2, 0.01)
  .name('Back offset Z')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'backRotationY', -180, 180, 1)
  .name('Back rotate Y (°)')
  .onChange(() => vehicle.applyWheelModelParams())
wheelModelFolder
  .add(wm, 'backSpinDirection', { Normal: 1, Reversed: -1 })
  .name('Back spin')

const tireMarkFolder = effectsFolder.addFolder('Tire Marks')
tireMarkFolder
  .add(tm, 'enabled')
  .name('Enabled')
  .onChange(() => vehicle.applyTireMarkParams())
tireMarkFolder
  .add(tm, 'drawWhileMoving')
  .name('Draw while moving')
tireMarkFolder
  .add(tm, 'minSpeedKmh', 0, 120, 1)
  .name('Min speed')
tireMarkFolder
  .add(tm, 'minSteer', 0, 0.6, 0.01)
  .name('Turn amount')
tireMarkFolder
  .add(tm, 'frontWidth', 0.1, 1.2, 0.01)
  .name('Front width')
tireMarkFolder
  .add(tm, 'backWidth', 0.1, 1.2, 0.01)
  .name('Back width')
tireMarkFolder
  .add(tm, 'backSpacing', -1, 1, 0.01)
  .name('Back spacing')
tireMarkFolder
  .add(tm, 'backForwardOffset', -1, 1, 0.01)
  .name('Back forward offset')
tireMarkFolder
  .add(tm, 'opacity', 0, 1, 0.01)
  .name('Opacity')
  .onChange(() => vehicle.applyTireMarkParams())
tireMarkFolder
  .add(tm, 'capOpacity', 0, 1, 0.01)
  .name('Fade opacity')
  .onChange(() => vehicle.applyTireMarkParams())
tireMarkFolder
  .add(tm, 'surfaceOffset', 0, 0.2, 0.001)
  .name('Surface offset')
tireMarkFolder
  .add(tm, 'contactGraceTime', 0, 1, 0.01)
  .name('Contact grace')
tireMarkFolder
  .add(tm, 'maxPointGap', 0.5, 20, 0.1)
  .name('Max point gap')
tireMarkFolder
  .add(tm, 'fadeLength', 0.1, 3, 0.05)
  .name('Fade length')
tireMarkFolder
  .add(tm, 'maxMarks', 50, 2000, 10)
  .name('Max marks')
  .onChange(() => vehicle.applyTireMarkParams())
tireMarkFolder
  .add({ clear: () => vehicle.clearTireMarks() }, 'clear')
  .name('Clear marks')
tireMarkFolder.close()

const engineFolder = vehicleFolder.addFolder('Engine')
engineFolder.add(p, 'engineForce', 200, 4000, 50).name('Engine force')
engineFolder.add(p, 'boostMultiplier', 1, 3, 0.1).name('Boost ×')
engineFolder.add(p, 'cruiseSpeedKmh', 30, 200, 5).name('Top speed (km/h)')
engineFolder.add(p, 'maxSpeedKmh', 40, 300, 5).name('Boost top speed (km/h)')
engineFolder.add(p, 'reverseFactor', 0.1, 1, 0.05).name('Reverse power')
engineFolder.close()

const steerFolder = vehicleFolder.addFolder('Steering')
steerFolder.add(p, 'maxSteer', 0.1, 0.9, 0.01).name('Max steer angle')
steerFolder.add(p, 'steerSpeed', 1, 15, 0.5).name('Steer speed')
steerFolder.close()

const brakesFolder = vehicleFolder.addFolder('Brakes')
brakesFolder.add(p, 'brakeForce', 2, 60, 1).name('Brake force')
brakesFolder.add(p, 'handbrakeForce', 5, 80, 1).name('Handbrake force')
brakesFolder.close()

const suspensionFolder = vehicleFolder.addFolder('Suspension & Tires')
suspensionFolder
  .add(p, 'suspensionStiffness', 10, 120, 1)
  .name('Stiffness')
  .onChange(() => vehicle.applyWheelParams())
suspensionFolder
  .add(p, 'suspensionRestLength', 0.2, 0.9, 0.01)
  .name('Rest length')
  .onChange(() => vehicle.applyWheelParams())
suspensionFolder
  .add(p, 'maxSuspensionTravel', 0.1, 0.7, 0.01)
  .name('Max travel')
  .onChange(() => vehicle.applyWheelParams())
suspensionFolder
  .add(p, 'frictionSlip', 0.5, 10, 0.1)
  .name('Grip (frictionSlip)')
  .onChange(() => vehicle.applyWheelParams())
suspensionFolder
  .add(p, 'dampingRelaxation', 1, 8, 0.1)
  .name('Damping (rebound)')
  .onChange(() => vehicle.applyWheelParams())
suspensionFolder
  .add(p, 'dampingCompression', 1, 8, 0.1)
  .name('Damping (compress)')
  .onChange(() => vehicle.applyWheelParams())
suspensionFolder.close()

const chassisFolder = vehicleFolder.addFolder('Chassis')
chassisFolder
  .add(p, 'mass', 80, 800, 10)
  .name('Mass (kg)')
  .onChange(() => vehicle.applyChassisParams())
chassisFolder
  .add(p, 'angularDamping', 0, 0.9, 0.01)
  .name('Angular damping')
  .onChange(() => vehicle.applyChassisParams())
chassisFolder
  .add(p, 'inertiaScale', 1, 6, 0.1)
  .name('Anti-flip inertia ×')
  .onChange(() => vehicle.applyChassisParams())
chassisFolder.close()

const assistsFolder = vehicleFolder.addFolder('Assists')
assistsFolder.add(p, 'antiWheelie').name('Anti-wheelie')
assistsFolder.add(p, 'tiltClampAirborne', 0, 10, 0.5).name('Air tilt clamp (rad/s)')
assistsFolder.add(p, 'uprightAssist').name('Upright assist')
assistsFolder.add(p, 'wallSlideAssist').name('Wall slide assist')
assistsFolder.add(p, 'wallSlideMaxSpeedKmh', 1, 40, 1).name('Wall slide max speed')
assistsFolder.add(p, 'wallSlideStrength', 0, 14, 0.5).name('Wall slide strength')
assistsFolder.add(p, 'cornerLiftDamping', 0.7, 1, 0.01).name('Corner-lift damping')
assistsFolder.add(p, 'gripLoadCap', 1, 6, 0.1).name('Grip load cap ×')
assistsFolder.add(p, 'landingGripTime', 0, 1, 0.05).name('Landing grip time (s)')
assistsFolder.add(p, 'landingGripFactor', 0.1, 1, 0.05).name('Landing grip start')
assistsFolder.close()

const jumpFolder = vehicleFolder.addFolder('Jump')
jumpFolder.add(p, 'jumpImpulse', 0, 8000, 100).name('Jump force')
jumpFolder.add(p, 'jumpCooldown', 0, 2, 0.05).name('Cooldown')
jumpFolder.add(p, 'jumpBufferTime', 0, 0.5, 0.01).name('Input buffer')
jumpFolder.add(p, 'airborneGravityScale', 1, 3, 0.05).name('Air gravity ×')
jumpFolder.close()

debugFolder
  .add(vehicle.debugParams, 'physics')
  .name('Show physics colliders')
  .onChange((visible) => physicsDebug.setVisible(visible))

const actions = {
  respawn: () => vehicle.respawn(),
  resetParams: () => {
    Object.assign(p, DEFAULT_PARAMS)
    Object.assign(bm, DEFAULT_BODY_MODEL_PARAMS)
    Object.assign(wm, DEFAULT_WHEEL_MODEL_PARAMS)
    Object.assign(rp, DEFAULT_REFLECTION_PARAMS)
    Object.assign(tm, DEFAULT_TIRE_MARK_PARAMS)
    Object.assign(ep, DEFAULT_ENVIRONMENT_PARAMS)
    Object.assign(postParams, DEFAULT_POST_PARAMS)
    Object.assign(cameraParams, DEFAULT_CAMERA_PARAMS)
    Object.assign(transporterParams, DEFAULT_TRANSPORTER_PARAMS)
    Object.assign(shadowParams, DEFAULT_SHADOW_PARAMS)
    world.hemi.intensity = DEFAULT_LIGHTING_PARAMS.ambientIntensity
    world.sun.intensity = DEFAULT_LIGHTING_PARAMS.sunIntensity
    world.applyEnvironmentParams()
    postBoostBlend = 0
    cameraBoostBlend = 0
    windLinesBlend = 0
    colorGradePass.uniforms.windLines.value = 0
    applyPostParams()
    applyCameraParams()
    applyTransporterParams()
    applyShadowParams()
    vehicle.applyWheelParams()
    vehicle.applyChassisParams()
    vehicle.applyBodyModelParams()
    vehicle.applyWheelModelParams()
    vehicle.applyReflectionParams()
    vehicle.applyTireMarkParams()
    vehicle.clearTireMarks()
    physicsDebug.setVisible(vehicle.debugParams.physics)
    gui.controllersRecursive().forEach((c) => c.updateDisplay())
  },
}
gui.add(actions, 'respawn').name('Respawn car (R)')
gui.add(actions, 'resetParams').name('Reset to defaults')

// Start with every section collapsed and the panel itself closed
gui.foldersRecursive().forEach((folder) => folder.close())
gui.close()
gui.hide()

// --- HUD -----------------------------------------------------------------------

const speedElement = document.querySelector('#speed .value')

const helpPanel = document.getElementById('help')
const helpToggle = document.getElementById('help-toggle')
const fullscreenToggle = document.getElementById('fullscreen-toggle')

helpToggle.addEventListener('click', () => {
  helpPanel.classList.toggle('open')
  helpToggle.blur() // keep Space/Enter presses driving the car, not the button
})

fullscreenToggle.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    document.documentElement.requestFullscreen()
  }
  fullscreenToggle.blur()
})

// Covers Esc and other ways of leaving fullscreen, not just our button
document.addEventListener('fullscreenchange', () => {
  fullscreenToggle.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement))
})

// --- Mobile controls -----------------------------------------------------------

const mobileJoystick = document.querySelector('#mobile-joystick')
const mobileBoost = document.querySelector('#mobile-boost')
const mobileReset = document.querySelector('#mobile-reset')
let mobileJoystickActive = false

function shapeMobileAxis(value) {
  const sign = Math.sign(value)
  return sign * Math.pow(Math.abs(value), 1.7)
}

function setMobileJoystickInput(x, y) {
  const deadzone = 0.2
  const steer = Math.abs(x) < deadzone ? 0 : shapeMobileAxis(x) * 0.76
  const throttle = Math.abs(y) < deadzone ? 0 : shapeMobileAxis(y) * 0.9

  vehicle.input.steerAxis = steer
  vehicle.input.throttleAxis = throttle
  vehicle.input.left = steer < -0.25
  vehicle.input.right = steer > 0.25
  vehicle.input.forward = throttle > 0.25
  vehicle.input.backward = throttle < -0.25
}

function resetMobileJoystick() {
  mobileJoystick?.style.setProperty('--stick-x', '0px')
  mobileJoystick?.style.setProperty('--stick-y', '0px')
  setMobileJoystickInput(0, 0)
}

if (mobileJoystick) {
  let joystickPointerId = null
  const updateJoystick = (event) => {
    if (joystickPointerId !== event.pointerId) return
    event.preventDefault()

    const rect = mobileJoystick.getBoundingClientRect()
    const maxDistance = rect.width * 0.38
    let dx = event.clientX - (rect.left + rect.width / 2)
    let dy = event.clientY - (rect.top + rect.height / 2)
    const distance = Math.hypot(dx, dy)
    if (distance > maxDistance) {
      dx = (dx / distance) * maxDistance
      dy = (dy / distance) * maxDistance
    }

    mobileJoystick.style.setProperty('--stick-x', `${dx}px`)
    mobileJoystick.style.setProperty('--stick-y', `${dy}px`)
    setMobileJoystickInput(dx / maxDistance, -dy / maxDistance)
  }

  mobileJoystick.addEventListener('pointerdown', (event) => {
    joystickPointerId = event.pointerId
    mobileJoystickActive = true
    mobileJoystick.setPointerCapture(event.pointerId)
    updateJoystick(event)
  })
  mobileJoystick.addEventListener('pointermove', updateJoystick)

  const stopJoystick = (event) => {
    if (joystickPointerId !== event.pointerId) return
    joystickPointerId = null
    mobileJoystickActive = false
    if (mobileJoystick.hasPointerCapture(event.pointerId)) {
      mobileJoystick.releasePointerCapture(event.pointerId)
    }
    resetMobileJoystick()
  }
  mobileJoystick.addEventListener('pointerup', stopJoystick)
  mobileJoystick.addEventListener('pointercancel', stopJoystick)
}

if (mobileBoost) {
  const setBoost = (active) => {
    vehicle.input.boost = active
    mobileBoost.classList.toggle('is-active', active)
  }

  mobileBoost.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    mobileBoost.setPointerCapture(event.pointerId)
    setBoost(true)
  })
  mobileBoost.addEventListener('pointerup', (event) => {
    if (mobileBoost.hasPointerCapture(event.pointerId)) {
      mobileBoost.releasePointerCapture(event.pointerId)
    }
    setBoost(false)
  })
  mobileBoost.addEventListener('pointercancel', () => setBoost(false))
}

if (mobileReset) {
  mobileReset.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    vehicle.respawn()
    resetMobileJoystick()
    mobileReset.blur()
  })
}

// --- Gamepad controls ----------------------------------------------------------

let gamepadJumpWasPressed = false

function gamepadButtonPressed(gamepad, index, threshold = 0.5) {
  const button = gamepad.buttons[index]
  return Boolean(button?.pressed || button?.value > threshold)
}

function gamepadButtonValue(gamepad, index) {
  return gamepad.buttons[index]?.value ?? 0
}

function updateGamepadControls() {
  const gamepads = navigator.getGamepads?.() ?? []
  const gamepad = gamepads.find(Boolean)
  if (!gamepad) {
    if (!mobileJoystickActive) {
      vehicle.input.steerAxis = 0
      vehicle.input.throttleAxis = 0
    }
    vehicle.input.gamepadBoost = false
    gamepadJumpWasPressed = false
    return
  }

  const dpadX = (gamepadButtonPressed(gamepad, 15) ? 1 : 0) - (gamepadButtonPressed(gamepad, 14) ? 1 : 0)
  const dpadY = (gamepadButtonPressed(gamepad, 12) ? 1 : 0) - (gamepadButtonPressed(gamepad, 13) ? 1 : 0)
  const steer = Math.abs(gamepad.axes[0] ?? 0) > 0.12 ? shapeMobileAxis(gamepad.axes[0]) : dpadX
  const gas = gamepadButtonValue(gamepad, 7)
  const reverse = gamepadButtonValue(gamepad, 6)
  const triggerThrottle = gas - reverse
  const throttle = Math.abs(triggerThrottle) > 0.05 ? triggerThrottle : dpadY

  if (!mobileJoystickActive) {
    vehicle.input.steerAxis = steer
    vehicle.input.throttleAxis = throttle
  }
  vehicle.input.gamepadBoost =
    gamepadButtonPressed(gamepad, 1) ||
    gamepadButtonPressed(gamepad, 5)

  const jumpPressed = gamepadButtonPressed(gamepad, 0)
  if (jumpPressed && !gamepadJumpWasPressed) vehicle.requestJump()
  gamepadJumpWasPressed = jumpPressed
}

// --- Loop ----------------------------------------------------------------------

const race = new Race(scene, vehicle)
transporterParams.enabled=false
applyTransporterParams()
const FIXED_STEP = 1 / 60
let lastTime = performance.now()
let fpsElapsed = 0
let fpsFrames = 0

function tick() {
  const now = performance.now()
  const delta = Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now
  fpsElapsed += delta
  fpsFrames += 1
  if (fpsElapsed >= 0.25) {
    performanceParams.fps = Math.round(fpsFrames / fpsElapsed)
    fpsController.updateDisplay()
    fpsElapsed = 0
    fpsFrames = 0
  }

  if (race.phase === 'running') {
    physicsWorld.step(FIXED_STEP, delta, 3)
    updateGamepadControls()
    vehicle.update(delta)
  } else { race.clear(); vehicle._syncVisuals(delta) }
  race.update(delta)
  world.update()
  updateCamera(delta)
  updateTransporter(delta)
  physicsDebug.update()

  // Keep the shadow camera centered on the car so shadows follow it.
  // Snap the follow point to shadow-map texel increments: moving the shadow
  // camera by sub-texel amounts re-rasterizes every edge each frame, which
  // shows up as crawling/shimmering shadow edges while driving.
  const shadowTexelWorld = (shadowParams.shadowCameraSize * 2) / shadowParams.shadowMapSize
  const shadowFollowX = Math.round(vehicle.group.position.x / shadowTexelWorld) * shadowTexelWorld
  const shadowFollowZ = Math.round(vehicle.group.position.z / shadowTexelWorld) * shadowTexelWorld
  world.sun.position.set(
    shadowFollowX + shadowParams.sunX,
    shadowParams.sunY,
    shadowFollowZ + shadowParams.sunZ
  )
  world.sun.target.position.set(shadowFollowX, 0, shadowFollowZ)
  world.sun.target.updateMatrixWorld()

  speedElement.textContent = Math.round(vehicle.speedKmh)
  const boosting = vehicle.input.boost || vehicle.input.gamepadBoost
  const boostTarget = boosting ? 1 : 0
  postBoostBlend = THREE.MathUtils.lerp(postBoostBlend, boostTarget, 1 - Math.exp(-8 * delta))
  cameraBoostBlend = THREE.MathUtils.lerp(cameraBoostBlend, boostTarget, 1 - Math.exp(-7 * delta))
  const windLinesTarget = boosting && vehicle.speedKmh > postParams.windLinesMinSpeedKmh ? 1 : 0
  windLinesBlend = THREE.MathUtils.lerp(windLinesBlend, windLinesTarget, 1 - Math.exp(-5 * delta))
  colorGradePass.uniforms.windLines.value = windLinesBlend * postParams.windLinesStrength
  const boostedFov = THREE.MathUtils.lerp(cameraParams.fov, 72, cameraBoostBlend)
  applyCameraParams(boostedFov)
  applyPostParams()
  colorGradePass.uniforms.time.value = now * 0.001

  if (postParams.enabled) {
    composer.render()
  } else {
    renderer.render(scene, camera)
  }
  requestAnimationFrame(tick)
}

tick()

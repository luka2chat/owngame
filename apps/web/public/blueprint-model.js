import { safeMediaUrl } from "./blueprint-media-policy.js";
import { t } from "./i18n.js";
import * as THREE from "./vendor/three-0.186.1/viewer.js";
const {GLTFLoader, OrbitControls, MeshoptDecoder} = THREE;

const query = new URLSearchParams(location.search),
  file = query.get("file"),
  interactive = query.has("interactive");
let renderer,
  controls,
  scene,
  observer,
  closed = false;
function dispose() {
  closed = true;
  observer?.disconnect();
  controls?.dispose();
  scene?.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
  renderer?.dispose();
  renderer?.forceContextLoss();
}
addEventListener("pagehide", dispose, { once: true });
try {
  if (!safeMediaUrl(file, true)) throw Error("Invalid model URL");
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: !interactive,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#e8ede5");
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight("#fff7e9", "#718c87", 3));
  const light = new THREE.DirectionalLight("#fff5dd", 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  const rim = new THREE.DirectionalLight("#b9e6e0", 2);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  const manager = new THREE.LoadingManager();
  let failed = false;
  manager.onError = () => {
    failed = true;
  };
  const model = await new GLTFLoader(manager)
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(file);
  scene.add(model.scene);
  if (closed) {
    dispose();
  } else {
    if (failed) throw Error("Missing texture");
    model.scene.rotation.y = -Math.PI / 2;
    if (model.animations.length) {
      const mixer = new THREE.AnimationMixer(model.scene);
      mixer
        .clipAction(
          model.animations.find((c) => c.name === "idle") ||
            model.animations[0],
        )
        .play();
      mixer.update(0.01);
    }
    const box = new THREE.Box3().setFromObject(model.scene),
      size = box.getSize(new THREE.Vector3()),
      center = box.getCenter(new THREE.Vector3());
    model.scene.position.sub(center);
    const group = new THREE.Group();
    group.add(model.scene);
    group.scale.setScalar(2 / Math.max(size.x, size.y, size.z, 0.001));
    scene.add(group);
    camera.position.set(2.6, 1.65, 3.8);
    camera.lookAt(0, 0, 0);
    const draw = () => renderer.render(scene, camera);
    const resize = () => {
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      draw();
    };
    document.body.replaceChildren(renderer.domElement);
    resize();
    if (interactive) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.minDistance = 1;
      controls.maxDistance = 10;
      controls.addEventListener("change", draw);
      controls.update();
      observer = new ResizeObserver(resize);
      observer.observe(document.body);
    } else {
      const image = new Image();
      image.alt = t("3D 模型");
      image.src = renderer.domElement.toDataURL();
      image.style.cssText = "width:100%;height:100%;object-fit:contain";
      document.body.replaceChildren(image);
      dispose();
    }
    document.body.dataset.previewState = "ready";
  }
} catch {
  dispose();
  document.body.replaceChildren(
    Object.assign(document.createElement("p"), {
      textContent: t("模型预览暂不可用，可查看源素材。"),
    }),
  );
  document.body.dataset.previewState = "error";
}

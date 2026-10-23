const modules = new Map();
async function rendererModules(projectId) {
  if(!modules.has(projectId)) {
    const base=`/api/three/${encodeURIComponent(projectId)}/`;
    modules.set(projectId,Promise.all([
      import(`${base}build/three.module.js`),
      import(`${base}examples/jsm/loaders/GLTFLoader.js`),
      import(`${base}examples/jsm/controls/OrbitControls.js`),
      import(`${base}examples/jsm/libs/meshopt_decoder.module.js`),
    ]).catch(error=>{modules.delete(projectId);throw error;}));
  }
  return modules.get(projectId);
}
export async function mountModel(host, projectId, url, interactive=false) {
  let renderer,controls,observer,scene;
  const dispose=()=>{
    observer?.disconnect();controls?.dispose();
    scene?.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[])){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});
    renderer?.dispose();renderer?.forceContextLoss();
  };
  try {
    const [THREE,{GLTFLoader},{OrbitControls},{MeshoptDecoder}]=await rendererModules(projectId);
    if(!host.isConnected)return dispose;
    renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:!interactive});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
    scene=new THREE.Scene();scene.background=new THREE.Color('#e5ede7');
    const camera=new THREE.PerspectiveCamera(35,1,.01,100);
    scene.add(new THREE.HemisphereLight('#fff7e9','#718c87',3));
    const light=new THREE.DirectionalLight('#fff5dd',3);light.position.set(3,5,4);scene.add(light);
    const rim=new THREE.DirectionalLight('#b9e6e0',2);rim.position.set(-3,2,-3);scene.add(rim);
    let failedResource=false;
    const manager=new THREE.LoadingManager();manager.onError=()=>failedResource=true;
    const model=await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    scene.add(model.scene);
    if(failedResource)throw Error('模型贴图加载失败。');
    if(!host.isConnected||(interactive&&!host.closest('dialog')?.open)){dispose();return dispose;}
    model.scene.rotation.y=-Math.PI/2;
    if(model.animations.length){const mixer=new THREE.AnimationMixer(model.scene);mixer.clipAction(model.animations.find(c=>c.name==='idle')||model.animations[0]).play();mixer.update(.01);}
    const box=new THREE.Box3().setFromObject(model.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const scale=2/Math.max(size.x,size.y,size.z,.001);
    model.scene.position.sub(center);const group=new THREE.Group();group.add(model.scene);group.scale.setScalar(scale);scene.add(group);
    camera.position.set(2.6,1.65,3.8);camera.lookAt(0,0,0);
    const draw=()=>renderer.render(scene,camera);
    const resize=()=>{const w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();draw();};
    resize();
    if(interactive) {
      host.replaceChildren(renderer.domElement);
      controls=new OrbitControls(camera,renderer.domElement);controls.minDistance=1;controls.maxDistance=10;controls.addEventListener('change',draw);controls.update();
      observer=new ResizeObserver(resize);observer.observe(host);draw();
    } else {
      const image=new Image();image.alt='从项目 GLB 源文件实时渲染的模型预览';image.src=renderer.domElement.toDataURL('image/png');image.draggable=false;host.replaceChildren(image);dispose();
    }
    host.dataset.previewState='ready';
    return dispose;
  } catch {
    dispose();if(host.isConnected){host.textContent='源模型暂不可用 · 检查文件、NAS 或项目 Three.js';host.dataset.previewState='error';}
    return ()=>{};
  }
}
export function mountModelCards(projectId) {
  document.querySelectorAll('[data-model-url]:not([data-mounted])').forEach(host=>{host.dataset.mounted='true';mountModel(host,projectId,host.dataset.modelUrl);});
}

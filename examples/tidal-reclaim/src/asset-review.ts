import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const assets = [
  {id:'purifier', url:new URL('../generated-assets/purifier.glb',import.meta.url).href, height:2.6},
  {id:'robot', url:new URL('../generated-assets/patrol-robot.glb',import.meta.url).href, height:1.8},
]
const disposers: (()=>void)[]=[]
for(const asset of assets){
 const host=document.getElementById(asset.id)!
 const scene=new THREE.Scene();scene.background=new THREE.Color('#91b6ad')
 const camera=new THREE.PerspectiveCamera(36,1,.01,100)
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;host.append(renderer.domElement)
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.6;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.49
 scene.add(new THREE.HemisphereLight('#f0ffef','#3c5d62',2.7))
 const sun=new THREE.DirectionalLight('#fff0d3',3);sun.position.set(-3,6,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.015;scene.add(sun)
 const rim=new THREE.DirectionalLight('#98dfdb',2);rim.position.set(3,4,-3);scene.add(rim)
 const floor=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.5,.16,64),new THREE.MeshStandardMaterial({color:'#496c67',roughness:.8}));floor.position.y=-.08;floor.receiveShadow=true;scene.add(floor)
 let mixer:THREE.AnimationMixer|undefined
 const reset=()=>{camera.position.set(asset.height*1.5,asset.height*.95,asset.height*2.25);controls.target.set(0,asset.height*.48,0);controls.update()};reset()
 document.querySelector(`[data-reset="${asset.id}"]`)!.addEventListener('click',reset)
 const resize=()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()};const observer=new ResizeObserver(resize);observer.observe(host);resize()
 new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(asset.url,g=>{
  g.scene.rotation.y=-Math.PI/2
  const box=new THREE.Box3().setFromObject(g.scene);const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());const scale=asset.height/size.y
  const root=new THREE.Group();g.scene.position.set(-center.x,-box.min.y,-center.z);root.add(g.scene);root.scale.setScalar(scale);scene.add(root)
  let triangles=0,meshes=0,skins=0;g.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.castShadow=m.receiveShadow=true;meshes++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;if((m as THREE.SkinnedMesh).isSkinnedMesh)skins++}})
  if(g.animations.length){
   mixer=new THREE.AnimationMixer(g.scene);const labels:Record<string,string>={idle:'待机',walk:'行走',run:'奔跑'}
   const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-top:12px'
   host.parentElement!.querySelector('.copy')!.append(actions)
   const play=(clip:THREE.AnimationClip)=>{mixer!.stopAllAction();mixer!.clipAction(clip).reset().play();host.dataset.animation=clip.name}
   for(const clip of g.animations){const button=document.createElement('button');button.textContent=labels[clip.name]??clip.name;button.addEventListener('click',()=>play(clip));actions.append(button)}
   play(g.animations.find(c=>c.name==='idle')??g.animations[0])
  }
  document.getElementById(asset.id+'-meta')!.textContent=`${Math.round(triangles).toLocaleString()} 三角面 · ${meshes} 网格 · ${skins?'已绑骨':'静态模型'} · 展示高度 ${asset.height} 米`
  host.querySelector('.status')!.textContent='模型已加载';host.dataset.loaded='true'
 },undefined,error=>{host.querySelector('.status')!.textContent='加载失败，请检查模型文件';host.dataset.loaded='error';console.error(error)})
 const clock=new THREE.Clock();renderer.setAnimationLoop(()=>{mixer?.update(Math.min(clock.getDelta(),.1));controls.update();renderer.render(scene,camera)})
 disposers.push(()=>{renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();renderer.dispose()})
}
window.addEventListener('pagehide',()=>disposers.forEach(dispose=>dispose()))

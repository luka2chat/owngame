import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { RADIUS, tangent, surfaceRadius } from './math.js';
import { createQuest, advanceQuest, questText, STAR_COUNT } from './quest.js';
import './style.css';

const $ = id => document.getElementById(id);
const canvas = $('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
} catch(error) {
  $('error').hidden=false;
  $('error-copy').textContent='无法启动 WebGL 2。请在 Chrome / Edge 中开启硬件加速后重新加载。';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.3;
const scene=new THREE.Scene();scene.background=new THREE.Color('#101e30');
const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,250);
camera.position.set(19,16,25);
const hemi=new THREE.HemisphereLight('#d5e9ed','#364647',2.6);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffe3ad',3.2);sun.position.set(-8,18,12);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.camera.near=1;sun.shadow.camera.far=55;sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun);
const rim=new THREE.DirectionalLight('#a6c8e8',1.7);rim.position.set(5,4,-12);scene.add(rim);
const world=createWorld(scene);
const player=createPlayer(scene);
const orbit=new OrbitControls(camera,canvas);orbit.enabled=false;orbit.enablePan=false;orbit.minDistance=10;orbit.maxDistance=35;orbit.target.set(0,0,0);orbit.enableDamping=true;
const quest=createQuest();
const input=new Set();
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();
const clock=new THREE.Clock();
const cameraTarget=new THREE.Vector3(-3,0,0);
let cameraBack=tangent(new THREE.Vector3(0,0,1),player.normal);
let started=false,labOpen=false,orbiting=false,time=0,near=null,toastTimer,frames=0,statsTime=0,hidden=false;
let zoom=1,pointerDown=null,dragged=false,activeLesson='scene';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight','Space','KeyE']);

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3300);}
function showStory(title,copy,label='来自星球的声音'){
  input.clear();player.cancel();$('dialog-title').textContent=title;$('dialog-copy').textContent=copy;$('dialog-label').textContent=label;$('story-dialog').showModal();
}
function updateQuestUI(){
  const [title,hint]=questText(quest);$('quest-title').textContent=title;$('quest-hint').textContent=hint;
  $('star-count').textContent=quest.stage==='collect'?`${quest.collected.size} / ${STAR_COUNT}`:quest.completed?'✧':'3 / 3';
  $('quest-progress').style.width=`${quest.collected.size/STAR_COUNT*100}%`;
  document.querySelectorAll('[data-star]').forEach(button=>{const id=Number(button.dataset.star);button.classList.toggle('visited',quest.collected.has(id));button.textContent=quest.collected.has(id)?`✓ 星光 ${id+1}`:`✦ 星光 ${id+1}`;});
  renderLesson(activeLesson);
}

function start(){
  if(started)return;
  started=true;$('intro').hidden=true;$('hud').hidden=false;document.body.classList.add('playing');
  if(matchMedia('(pointer: coarse)').matches)$('touch-controls').hidden=false;
  canvas.focus({preventScroll:true});toast('WASD 自由散步，或点击下方目的地开始探索');
}
function toggleLab(value=!labOpen){
  start();labOpen=value;$('lab').hidden=!value;$('learn-button').setAttribute('aria-expanded',String(value));document.body.classList.toggle('lab-open',value);
  if(value)renderLesson(activeLesson);
  else canvas.focus({preventScroll:true});
}
function renderLesson(kind){
  activeLesson=kind;
  document.querySelectorAll('[data-lesson]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.lesson===kind)));
  const content={
    scene:['一个世界，从三角形开始','地面由球体顶点向外起伏而成。小屋、树与花都是几何体组合；3400 株草用实例化绘制，复用同一份网格。试着打开线框，再调一调日照。','Scene → Mesh → Geometry + Material\n每帧：renderer.render(scene, camera)'],
    motion:['在球上，“向上”会一直变化','角色的向上方向，是星球中心指向脚下的方向。移动先投影到切平面，再沿球面前进。打开局部坐标，走几步就能看见青色箭头的变化。','up = normalize(position − center)\ntangent = direction − up × dot(direction, up)\nposition = newUp × surfaceRadius(newUp)'],
    story:['交互，本质是状态改变','靠近星光自动拾取。收集齐后与花交谈，再靠近信标按 E。状态机决定哪些操作有效，场景和界面只负责呈现结果。',`collect → rose → beacon → complete\n当前状态：${quest.stage}\n已收集：${quest.collected.size} / ${STAR_COUNT}`],
  }[kind];
  $('lesson-copy').replaceChildren();
  for(const [tag,text] of [['h3',content[0]],['p',content[1]],['code',content[2]]]){const element=document.createElement(tag);element.textContent=text;$('lesson-copy').append(element);}
}

function interact(){
  if(!started||orbiting||$('story-dialog').open||!near)return;
  if(near==='rose'){
    if(quest.stage==='collect')showStory('花想借一点星光','“今夜，我想写一封信。你能替我找来三枚星光吗？”\n\n花轻轻晃了晃，指向小屋旁的草地。');
    else if(quest.stage==='rose'){
      advanceQuest(quest,'rose');updateQuestUI();
      showStory('替我告诉远方','“谢谢你。星光暖暖的，像有人认真听我说话。”\n\n“请把它放进信标。告诉远方：这颗星球上，有一朵花正在好好长大。”');
    } else showStory('你回来啦','花认出了你的脚步。\n\n“有些旅程很远，有些只要围着家走一圈。”');
  } else if(near==='beacon'){
    if(quest.stage==='beacon'){
      advanceQuest(quest,'beacon');updateQuestUI();
      showStory('信，已经寄往星海','一束温柔的光，越过了这颗小小的星球。\n\n你没有改变整个宇宙，但你让一朵花的心愿被看见了。\n\n第一章完成。继续散步，或打开「拆解工作台」看看这个世界如何运转。','CHAPTER 01 · 完成');
    }else if(quest.completed)showStory('远方也有了回音','信标安静地亮着。\n\n如果还想再散一会儿步，就留下来吧。');
    else showStory('还没有寄出的信','信标静静地等待着。\n\n先拾齐星光，再去听听玻璃罩里那朵花的心愿。');
  }
}

const destinations=[...world.stars.map(star=>({name:`✦ 星光 ${star.id+1}`,normal:star.normal,id:star.id})),{name:'花',normal:world.landmarks.rose.normal},{name:'信标',normal:world.landmarks.beacon.normal}];
for(const point of destinations){
  const button=document.createElement('button');button.textContent=point.name;button.type='button';button.setAttribute('aria-label',`前往${point.name.replace('✦ ','')}`);if(point.id!==undefined)button.dataset.star=point.id;
  button.addEventListener('click',()=>{start();if(orbiting){$('orbit-mode').checked=false;setOrbit(false);}player.goTo(point.normal);toast(`正在前往${point.name.replace('✦ ','')} · 按方向键可随时接管`);canvas.focus({preventScroll:true});});
  $('waypoint-buttons').append(button);
}
$('start-button').addEventListener('click',start);
$('intro-learn').addEventListener('click',()=>toggleLab(true));
$('learn-button').addEventListener('click',()=>toggleLab());
$('close-lab').addEventListener('click',()=>toggleLab(false));
$('interact').addEventListener('click',interact);
$('dialog-close').addEventListener('click',()=>$('story-dialog').close());
$('story-dialog').addEventListener('close',()=>{input.clear();canvas.focus({preventScroll:true});});
document.querySelectorAll('[data-lesson]').forEach(button=>button.addEventListener('click',()=>renderLesson(button.dataset.lesson)));
$('wireframe').addEventListener('change',event=>world.setWireframe(event.target.checked));
$('helpers').addEventListener('change',event=>world.helper.visible=event.target.checked);
function setOrbit(enabled){orbiting=enabled;input.clear();player.cancel();orbit.enabled=enabled;camera.up.set(0,1,0);orbit.target.set(0,0,0);if(enabled){camera.position.set(16,14,19);orbit.update();}else cameraBack=tangent(camera.position.clone().sub(player.root.position),player.normal);}
$('orbit-mode').addEventListener('change',event=>setOrbit(event.target.checked));
$('sun').addEventListener('input',event=>{const value=Number(event.target.value);sun.intensity=value/25;hemi.intensity=.8+value*.0225;$('sun-output').textContent=`${value}%`;});
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'&&labOpen&&!$('story-dialog').open){toggleLab(false);return;}
  if(!started||orbiting||$('story-dialog').open||event.target.matches('input,button,a'))return;
  if(movementKeys.has(event.code))event.preventDefault();
  if(event.code==='KeyE'&&!event.repeat)interact();
  if(event.code==='Space'&&!event.repeat)player.jump();
  input.add(event.code);
});
window.addEventListener('keyup',event=>input.delete(event.code));
window.addEventListener('blur',()=>{input.clear();pointerDown=null;});
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;input.clear();clock.getDelta();});
document.querySelectorAll('[data-move]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{event.preventDefault();input.add(button.dataset.move);button.setPointerCapture(event.pointerId);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>input.delete(button.dataset.move));
});
canvas.addEventListener('pointerdown',event=>{if(!started||orbiting||event.button!==0)return;pointerDown={x:event.clientX,y:event.clientY,lastX:event.clientX};dragged=false;canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});});
canvas.addEventListener('pointermove',event=>{
  if(!pointerDown||orbiting)return;
  if(Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y)>5)dragged=true;
  if(dragged)cameraBack.applyAxisAngle(player.normal,-(event.clientX-pointerDown.lastX)*.006);
  pointerDown.lastX=event.clientX;
});
canvas.addEventListener('pointerup',event=>{
  if(!pointerDown)return;
  if(!dragged){pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(world.terrain)[0];if(hit)player.goTo(hit.point.normalize());}
  pointerDown=null;
});
canvas.addEventListener('pointercancel',()=>pointerDown=null);
canvas.addEventListener('wheel',event=>{if(!started||orbiting)return;event.preventDefault();zoom=THREE.MathUtils.clamp(zoom+event.deltaY*.0005,.7,1.55);},{passive:false});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();$('error').hidden=false;$('error-copy').textContent='显卡上下文已丢失。关闭其他占用显卡的页面后，点击重新加载。';});

const desiredCamera=new THREE.Vector3(),desiredTarget=new THREE.Vector3(),desiredUp=new THREE.Vector3();
function updateCamera(dt){
  if(orbiting){orbit.update();return;}
  if(!started){
    const angle=reducedMotion?.58:.58+Math.sin(time*.055)*.07;
    const distance=innerWidth<650?33:33;
    desiredCamera.set(Math.sin(angle)*distance,16,Math.cos(angle)*distance);
    desiredTarget.set(innerWidth<650?-1:-4,innerWidth<650?-2.3:0,0);
    desiredUp.set(0,1,0);
  }else{
    cameraBack=tangent(cameraBack,player.normal);
    desiredTarget.copy(player.normal).multiplyScalar(surfaceRadius(player.normal)+.6);
    desiredCamera.copy(player.normal).multiplyScalar(RADIUS+5.6*zoom).addScaledVector(cameraBack,8.5*zoom);
    desiredUp.copy(player.normal);
  }
  const smooth=1-Math.exp(-dt*3.5);
  camera.position.lerp(desiredCamera,smooth);cameraTarget.lerp(desiredTarget,smooth);camera.up.lerp(desiredUp,smooth).normalize();camera.lookAt(cameraTarget);
}
function frame(){
  requestAnimationFrame(frame);
  const dt=Math.min(clock.getDelta(),.04);
  if(hidden)return;
  time+=dt;
  const active=started&&!orbiting&&!$('story-dialog').open;
  player.update(dt,time,input,camera,world.objects,active);
  if(active){
    for(const star of world.stars){
      if(!quest.collected.has(star.id)&&player.normal.angleTo(star.normal)*RADIUS<.65){advanceQuest(quest,'collect',star.id);star.root.visible=false;updateQuestUI();toast(quest.stage==='rose'?'星光收齐了 · 去听听花的心愿':`拾起一枚星光 · ${quest.collected.size} / 3`);}
    }
    near=null;
    for(const id of ['rose','beacon']){
      if(player.normal.angleTo(world.landmarks[id].normal)*RADIUS<1.45){near=id;if(player.target?.angleTo(world.landmarks[id].normal)<.01)player.cancel();}
    }
  }else near=null;
  $('interact').hidden=!near;
  if(near)$('interact').querySelector('span').textContent=near==='rose'?'与花交谈':quest.completed?'查看信标':'点亮信标';
  world.arrow.position.copy(player.root.position);world.arrow.setDirection(player.normal);
  world.update(time,dt,quest.completed);
  updateCamera(dt);
  renderer.render(scene,camera);
  frames++;statsTime+=dt;
  if(statsTime>.6){$('fps').textContent=Math.round(frames/statsTime);$('draws').textContent=renderer.info.render.calls;$('triangles').textContent=`${(renderer.info.render.triangles/1000).toFixed(1)}k`;frames=0;statsTime=0;}
}
updateQuestUI();
$('start-button').disabled=false;$('start-button').innerHTML='走进这颗星球 <span>↗</span>';
frame();

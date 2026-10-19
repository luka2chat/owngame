import * as THREE from 'three'
const KEY='owngame:rc-rally:v1'
const POINTS=[[0,60],[96,60],[96,-60],[0,-65],[0,0]]
const $=id=>document.getElementById(id)
export class Race {
 constructor(scene,vehicle){
  this.vehicle=vehicle;this.phase='ready';this.next=0;this.lap=1;this.seconds=0;this.best=null;this.saved=null;this.lastSave=0
  try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s?.schema===1){this.best=s.best;const a=s.attempt;if(a&&a.next>=0&&a.next<POINTS.length&&[1,2].includes(a.lap)&&Number.isFinite(a.seconds)&&Array.isArray(a.position)&&a.position.length===3&&a.position.every(Number.isFinite)&&Array.isArray(a.quaternion)&&a.quaternion.length===4&&a.quaternion.every(Number.isFinite))this.saved=a}}catch{$('save-warning').hidden=false}
  this.markers=POINTS.map(([x,z],i)=>{const g=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(4,0.22,8,48),new THREE.MeshBasicMaterial({color:0xffdc72,transparent:true,opacity:0.7}));ring.rotation.x=Math.PI/2;ring.position.y=2.2;g.add(ring);const light=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,12,8),new THREE.MeshBasicMaterial({color:0xffdc72}));light.position.y=8;g.add(light);g.position.set(x,0,z);const badge=document.createElement('canvas');badge.width=128;badge.height=128;const c=badge.getContext('2d');c.fillStyle='#183b47';c.beginPath();c.roundRect(10,10,108,108,16);c.fill();c.strokeStyle='#ffe4a0';c.lineWidth=5;c.stroke();c.fillStyle='#fff3cb';c.font='bold 70px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(String(i+1),64,66);const texture=new THREE.CanvasTexture(badge);texture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true}));sign.position.y=15;sign.scale.set(4,4,1);g.add(sign);scene.add(g);return g})
  const reset=vehicle.respawn.bind(vehicle);this.reset=reset
  vehicle.respawn=()=>{if(this.phase==='running'){reset();this.seconds+=5;this.save()}}
  $('race-start').addEventListener('click',()=>this.start(false))
  $('race-resume').addEventListener('click',()=>this.phase==='paused'?this.resume():this.start(true))
  $('race-pause').addEventListener('click',()=>this.pause())
  $('race-credits').addEventListener('click',()=>$('credits').showModal())
  $('close-credits').addEventListener('click',()=>$('credits').close())
  window.addEventListener('blur',()=>this.pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause()});window.addEventListener('pagehide',()=>this.save())
  this.show('遥控冲线','跟随金色光柱，依次通过五个检查点，完成两圈。右侧摇杆前推加速、左右转向，后拉刹车或倒车；左侧闪电加速。')
  window.__owngameRace=Object.freeze({snapshot:()=>JSON.parse(JSON.stringify({ready:true,phase:this.phase,next:this.next,lap:this.lap,seconds:this.seconds,best:this.best,target:POINTS[this.next],position:vehicle.chassisBody.position,quaternion:vehicle.chassisBody.quaternion,speed:vehicle.speedKmh,saved:!!this.saved}))})
  $('race-start').disabled=false;this.updateHUD()
 }
 clear(){for(const k of Object.keys(this.vehicle.input))this.vehicle.input[k]=typeof this.vehicle.input[k]==='boolean'?false:0}
 show(title,description){$('race-modal').hidden=false;$('race-title').textContent=title;$('race-description').textContent=description;$('race-best').textContent=this.best?`最佳 ${this.best.toFixed(2)} 秒`:'完成两圈，留下你的最快纪录';$('race-resume').hidden=!this.saved&&this.phase!=='paused';$('race-start').textContent=this.phase==='finished'?'再跑一次':'开始计时';$('race-start').hidden=this.phase==='paused'}
 start(restore){
  this.clear();this.reset();this.seconds=0;this.next=0;this.lap=1
  if(restore&&this.saved){const a=this.saved;this.seconds=a.seconds;this.next=a.next;this.lap=a.lap;this.vehicle.chassisBody.position.set(...a.position);this.vehicle.chassisBody.quaternion.set(...a.quaternion)}
  this.phase='running';$('race-modal').hidden=true;this.save();this.updateHUD()
 }
 pause(){this.clear();if(this.phase!=='running')return;this.phase='paused';this.save();this.show('比赛已暂停','计时已停止，进度保存在此设备。');$('race-resume').textContent='继续比赛'}
 resume(){this.clear();this.phase='running';$('race-modal').hidden=true}
 save(){try{const b=this.vehicle.chassisBody;const attempt=['running','paused'].includes(this.phase)?{seconds:this.seconds,next:this.next,lap:this.lap,position:[b.position.x,b.position.y,b.position.z],quaternion:[b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w]}:this.phase==='finished'?null:this.saved;localStorage.setItem(KEY,JSON.stringify({schema:1,best:this.best,attempt}));this.saved=attempt;$('save-warning').hidden=true}catch{$('save-warning').hidden=false}}
 update(dt){
  if(this.phase==='running'){
   this.seconds+=dt;this.lastSave+=dt;const p=this.vehicle.chassisBody.position,[x,z]=POINTS[this.next]
   if(Math.hypot(p.x-x,p.z-z)<4&&p.y<12){this.next++;if(this.next===POINTS.length){this.next=0;this.lap++;if(this.lap===3){this.phase='finished';this.lap=2;this.best=this.best===null?this.seconds:Math.min(this.best,this.seconds);this.clear();this.save();this.show('两圈完成',`本次用时 ${this.seconds.toFixed(2)} 秒。试着在弯前松开油门，下一次会更快。`)}}}
   if(this.lastSave>2){this.save();this.lastSave=0}
  }
  this.markers.forEach((g,i)=>{g.visible=this.phase!=='finished'&&i===this.next;g.children.forEach(m=>{m.material.color.setHex(i===this.next?0xffdc72:0x80b7c9);m.material.opacity=i===this.next?1:.25})})
  this.updateHUD()
 }
 updateHUD(){
  $('race-progress').textContent=`第 ${this.lap} / 2 圈 · 检查点 ${this.next+1} / 5`;$('race-time').textContent=this.seconds.toFixed(1)+' 秒'
  const p=this.vehicle.chassisBody.position,[x,z]=POINTS[this.next];$('race-distance').textContent=`目标 ${Math.round(Math.hypot(x-p.x,z-p.z))} 米`
  const ctx=$('minimap').getContext('2d'),scale=.72,px=v=>22+v*scale,pz=v=>65-v*scale;ctx.clearRect(0,0,110,130);ctx.strokeStyle='#397675aa';ctx.lineWidth=2;ctx.beginPath();POINTS.forEach(([x,z],i)=>i?ctx.lineTo(px(x),pz(z)):ctx.moveTo(px(x),pz(z)));ctx.closePath();ctx.stroke();POINTS.forEach(([x,z],i)=>{ctx.fillStyle=i===this.next?'#ffda72':'#71919a';ctx.beginPath();ctx.arc(px(x),pz(z),i===this.next?5:3,0,Math.PI*2);ctx.fill()});ctx.fillStyle='#b66d36';ctx.beginPath();ctx.arc(px(p.x),pz(p.z),3,0,Math.PI*2);ctx.fill()
 }
}

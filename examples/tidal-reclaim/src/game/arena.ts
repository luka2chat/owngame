import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { pbr, worldBox, type Library } from './library'
import { BLOCKED, NavGrid } from './nav'
import { CHARGE_SECONDS, EXTRACTION, STATIONS, type Mission } from './tidal-mission'

export type Surface = 'concrete' | 'metal' | 'wood'
export type ColliderTag = {kind:'world'; surface:Surface} | {kind:'bot';id:number} | {kind:'drone';id:number} | {kind:'player'} | {kind:'prop';index:number}
export const HALF = 40
export type PropSpot = {pos:THREE.Vector3;model:'barrel'|'propane';rot:number}
export type PickupSpot = {pos:THREE.Vector3;kind:'health'|'armor'|'ammo'|'rocket'}

/** Tide station: shared collision/render dimensions; walkable routes baked from real colliders. */
export class Arena {
  readonly group = new THREE.Group()
  readonly tags = new Map<number, ColliderTag>()
  readonly nav: NavGrid
  readonly sun: THREE.DirectionalLight
  readonly spawns: THREE.Vector3[] = []
  readonly props: PropSpot[] = []
  readonly pickups: PickupSpot[] = []
  readonly fires: {pos:THREE.Vector3;glow:THREE.MeshBasicMaterial}[] = []
  readonly lamps: THREE.PointLight[] = []
  private readonly rotors: THREE.Group[] = []
  private readonly indicators: THREE.MeshStandardMaterial[] = []
  private readonly rings: THREE.Mesh[] = []
  private readonly water: THREE.Mesh
  private readonly waterNormal: THREE.CanvasTexture
  private readonly extractionMat = new THREE.MeshBasicMaterial({color:'#f4b75a',transparent:true,opacity:0.6,side:THREE.DoubleSide})

  constructor(readonly scene:THREE.Scene, private readonly physics:Physics, lib:Library) {
    const steel = pbr(lib.sets.metal_plate,{color:'#8cafaa',normalScale:.4})
    const rust = pbr(lib.sets.rusty_metal_02,{color:'#b55239'})
    const deck = pbr(lib.sets.concrete_floor_03,{color:'#94afaa',normalScale:.6})
    const dark = new THREE.MeshStandardMaterial({color:'#233f43',roughness:.58,metalness:.55})
    const cream = new THREE.MeshStandardMaterial({color:'#d8d1b4',roughness:.62,metalness:.25})
    const amber = new THREE.MeshStandardMaterial({color:'#f4b75a',emissive:'#bd7426',emissiveIntensity:.2,roughness:.6})
    scene.background = new THREE.Color('#96bdba')
    scene.fog = new THREE.FogExp2('#96bdba',.006)
    scene.environmentIntensity = .38
    this.sun = new THREE.DirectionalLight('#ffe4b8',3.1)
    this.sun.position.set(-35,55,-30);this.sun.castShadow=true
    Object.assign(this.sun.shadow.camera,{left:-58,right:58,top:58,bottom:-58,near:1,far:180})
    this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.035
    scene.add(this.sun,new THREE.HemisphereLight('#ccfff3','#334953',1.3))
    this.box(deck,0,-.65,0,80,1.3,80)
    // Sea surrounds a real raised deck. Rail colliders protect the perimeter from accidental falls.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128
    const ctx=canvas.getContext('2d')!;const pixels=ctx.createImageData(128,128)
    for(let i=0;i<128*128;i++){const x=i%128,y=Math.floor(i/128);pixels.data[i*4]=128+Math.sin(x*.4+y*.2)*18;pixels.data[i*4+1]=128+Math.cos(y*.3-x*.1)*18;pixels.data[i*4+2]=250;pixels.data[i*4+3]=255}
    ctx.putImageData(pixels,0,0);this.waterNormal=new THREE.CanvasTexture(canvas);this.waterNormal.wrapS=this.waterNormal.wrapT=THREE.RepeatWrapping;this.waterNormal.repeat.set(35,35)
    this.water=new THREE.Mesh(new THREE.PlaneGeometry(900,900),new THREE.MeshStandardMaterial({color:'#237e7d',normalMap:this.waterNormal,normalScale:new THREE.Vector2(.45,.45),roughness:.25,metalness:.22}))
    this.water.rotation.x=-Math.PI/2;this.water.position.y=-1.2;this.water.receiveShadow=true;this.group.add(this.water)
    for(const side of [-1,1]){
      this.box(rust,side*39.5,.45,0,.7,.9,80);this.box(rust,0,.45,side*39.5,80,.9,.7)
      for(let n=-36;n<=36;n+=6){this.box(cream,side*39.5,1.2,n,.12,1.6,.12,false);this.box(cream,n,1.2,side*39.5,.12,1.6,.12,false)}
      this.box(amber,side*39.5,1.7,0,.12,.13,80,false);this.box(amber,0,1.7,side*39.5,80,.13,.12,false)
    }
    // Central filtration island, broad flanking lanes, no invisible level geometry.
    this.box(rust,0,1.1,1,11,2.2,7)
    for(const x of [-3.5,3.5]){this.cylinder(cream,x,5,1,2.1,7.6);this.ring(amber,x,7,1,2.2);this.ring(steel,x,3.3,1,2.2);for(let y=2;y<8;y+=1.3)this.ring(rust,x,y,1,2.13)}
    this.box(steel,0,9.5,1,13,.4,1.2,false)
    // Overhead intake pipes, ladders and repeated service rails make the silhouette readable.
    for(const x of [-6.5,6.5]){
      this.box(rust,x,4.4,1,.26,8.8,.26,false)
      this.box(rust,x+1,4.4,1,.26,8.8,.26,false)
      for(let y=.5;y<9;y+=.45)this.box(steel,x+.5,y,.95,1,.09,.16,false)
    }
    for(const z of [-8,8]){this.box(rust,0,3,z,17,.3,.3,false);for(const x of [-8,8])this.box(steel,x,1.5,z,.16,3,.16,false)}
    // Low flanking cover leaves sightlines to the objective beacons.
    for(const [x,z,turn] of [[-12,-5,0],[13,12,1],[-25,10,0],[24,18,0],[12,-25,1],[-13,26,1]]){
      this.box(rust,x,1.05,z,turn?3:6,2.1,turn?6:3)
      for(let n=-2;n<=2;n++)this.box(steel,x+(turn?1.51:n),1.1,z+(turn?n:1.51),turn?.08:.12,1.8,turn?.12:.08,false)
      this.box(cream,x,2.18,z,turn?3.1:6.1,.15,turn?6.1:3.1,false)
    }
    // Reusable, authored purifier assemblies: console, rotor, pipes, tank and luminous state ring.
    STATIONS.forEach((p,i)=>{
      const model=lib.purifier.scene.clone(true)
      model.rotation.y=Math.PI/2
      const bounds=new THREE.Box3().setFromObject(model), size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3())
      const scale=2.6/size.y
      model.position.set(-center.x,-bounds.min.y,-center.z)
      const unit=new THREE.Group();unit.add(model);unit.scale.setScalar(scale);unit.position.set(p.x,0,p.z+2.4)
      unit.name=`tidal-purifier-${i+1}`
      unit.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh)mesh.castShadow=mesh.receiveShadow=true})
      this.group.add(unit)
      const c=this.physics.addStaticBox(new THREE.Vector3(p.x,1.3,p.z+2.4),size.multiplyScalar(scale));this.tags.set(c.handle,{kind:'world',surface:'metal'})
      const indicator=new THREE.MeshStandardMaterial({color:'#e4a84b',emissive:'#f5aa39',emissiveIntensity:.6})
      this.indicators.push(indicator)
      this.cylinder(cream,p.x-3.8,2.5,p.z+3.8,1.3,5)
      this.ring(rust,p.x-3.8,4.4,p.z+3.8,1.4);this.ring(steel,p.x-3.8,1.2,p.z+3.8,1.4)
      this.box(rust,p.x-1.6,.35,p.z+3.8,3.1,.5,.5,false)
      const rotor=new THREE.Group();rotor.position.set(p.x-3.8,5.2,p.z+3.8)
      for(let j=0;j<4;j++){const b=new THREE.Mesh(new THREE.BoxGeometry(.3,.15,2.7),steel);b.rotation.y=j*Math.PI/2;b.position.set(Math.sin(j*Math.PI/2)*1.1,0,Math.cos(j*Math.PI/2)*1.1);rotor.add(b)}
      this.rotors.push(rotor);this.group.add(rotor)
      const ring=this.ring(indicator,p.x,.06,p.z,7);this.rings.push(ring)
      this.sign(String(i+1).padStart(2,'0'),p.x,4,p.z+2.4,Math.PI)
      // Light columns are geometry, not expensive dynamic lights.
      const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,7,8),indicator);beacon.position.set(p.x+1.4,4,p.z+2.4);this.group.add(beacon)
      this.pickups.push({pos:new THREE.Vector3(p.x+3,0,p.z+3),kind:'ammo'},{pos:new THREE.Vector3(p.x+3,0,p.z-2),kind:'health'})
    })
    this.ring(this.extractionMat,EXTRACTION.x,.08,EXTRACTION.z,4)
    this.sign('EXIT',0,3.6,-37)
    for(const x of [-6,6])this.box(amber,x,1.4,-37,.3,2.8,.3)
    // Small utility launch beside the extraction dock and wind farm on the horizon.
    this.box(rust,0,-.35,-47,8,1.4,14,false);this.box(cream,0,1.4,-48,5,2.2,5,false);this.box(dark,0,1.8,-45.45,4,.8,.1,false)
    for(const [x,z] of [[-65,-80],[-100,-25],[75,60],[110,0]]){
      this.cylinder(cream,x,15,z,.8,32,false)
      const rotor=new THREE.Group();rotor.position.set(x,31,z)
      for(let j=0;j<3;j++){const b=new THREE.Mesh(new THREE.BoxGeometry(.7,14,.2),cream);b.rotation.z=j*Math.PI*2/3;b.position.set(-Math.sin(b.rotation.z)*7,Math.cos(b.rotation.z)*7,0);rotor.add(b)}
      rotor.userData.wind=true;this.rotors.push(rotor);this.group.add(rotor)
    }
    // Shallow flooded service trays reflect the theme without creating unwalkable traps.
    for(const x of [-33,33]){
      const tray=new THREE.Mesh(new THREE.PlaneGeometry(6,35),new THREE.MeshStandardMaterial({color:'#3c9291',normalMap:this.waterNormal,roughness:.16,metalness:.2,transparent:true,opacity:.65}))
      tray.rotation.x=-Math.PI/2;tray.position.set(x,.018,0);this.group.add(tray)
    }
    for(const [x,z] of [[-33,-30],[33,-30],[-32,28],[32,28],[-33,0],[33,4],[0,36],[18,33],[-14,-33],[-10,-18],[8,-14],[-20,2],[22,4],[-12,18],[13,30]])this.spawns.push(new THREE.Vector3(x,0,z))
    for(const [x,z] of [[-9,-18],[13,22],[-27,22],[30,-23]])this.props.push({pos:new THREE.Vector3(x,0,z),model:'barrel',rot:0})
    this.pickups.push({pos:new THREE.Vector3(0,0,-29),kind:'armor'})
    scene.add(this.group);physics.world.step();this.nav=this.bakeNav()
  }
  private box(mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,solid=true):THREE.Mesh{
    const mesh=new THREE.Mesh(worldBox(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;this.group.add(mesh)
    if(solid){const c=this.physics.addStaticBox(mesh.position,new THREE.Vector3(w,h,d));this.tags.set(c.handle,{kind:'world',surface:'metal'})}return mesh
  }
  private cylinder(mat:THREE.Material,x:number,y:number,z:number,r:number,h:number,solid=true):void{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;this.group.add(mesh)
    if(solid){const c=this.physics.addStaticBox(mesh.position,new THREE.Vector3(r*1.8,h,r*1.8));this.tags.set(c.handle,{kind:"world",surface:"metal"})}
  }
  private ring(mat:THREE.Material,x:number,y:number,z:number,r:number):THREE.Mesh{
    const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,.06,6,64),mat);mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);this.group.add(mesh);return mesh
  }
  private sign(text:string,x:number,y:number,z:number,yaw=0):void{
    const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d')!
    ctx.fillStyle='#133d43';ctx.fillRect(0,0,256,128);ctx.strokeStyle='#a5e3d3';ctx.lineWidth=5;ctx.strokeRect(5,5,246,118);ctx.fillStyle='#f4e5bf';ctx.font='bold 72px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,90)
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace
    const m=new THREE.Mesh(new THREE.PlaneGeometry(3,1.5),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.y=yaw;this.group.add(m)
  }
  private bakeNav():NavGrid{
    const nav=new NavGrid(80,80,1,-HALF,-HALF);const ray=new RAPIER.Ray({x:0,y:4.5,z:0},{x:0,y:-1,z:0})
    for(let z=0;z<80;z++)for(let x=0;x<80;x++){
      const wx=x-39.5,wz=z-39.5;let ok=Math.abs(wx)<38&&Math.abs(wz)<38
      for(const [dx,dz] of [[0,0],[.6,0],[-.6,0],[0,.6],[0,-.6]]){ray.origin={x:wx+dx,y:4.5,z:wz+dz};const hit=this.physics.world.castRayAndGetNormal(ray,6,true);if(!hit||Math.abs(4.5-hit.timeOfImpact)>.15)ok=false}
      nav.heights[nav.index(x,z)]=ok?0:BLOCKED
    }nav.computeEdges();return nav
  }
  groundAt(x:number,z:number,fromY:number):number{
    const hit=this.physics.world.castRay(new RAPIER.Ray({x,y:fromY,z},{x:0,y:-1,z:0}),12,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,undefined,c=>this.tags.get(c.handle)?.kind==='world');return hit?fromY-hit.timeOfImpact:0
  }
  missionState(s:Mission):void{
    this.indicators.forEach((m,i)=>{const color=s.progress[i]>=CHARGE_SECONDS?'#72f9c7':s.active===i?'#54dcf3':'#e8ac52';m.color.set(color);m.emissive.set(color);m.emissiveIntensity=s.active===i?1:.45;this.rings[i].visible=s.progress[i]<CHARGE_SECONDS})
    this.extractionMat.color.set(s.phase==='extract'?'#72f9c7':'#b7a67f')
  }
  update(time:number):void{this.waterNormal.offset.set(time*.003,time*.005);for(const r of this.rotors)if(r.userData.wind)r.rotation.z=time*.14;else r.rotation.y=time*.9}
  attachCamera(_camera:THREE.Camera,_density:number):void{}
  setRainDensity(_density:number):void{}
  attachSts(_scene:THREE.Object3D):void{} // Original port skyline intentionally replaced by offshore wind turbines.
}

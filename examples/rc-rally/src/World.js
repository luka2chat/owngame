import * as THREE from 'three'
import * as CANNON from 'cannon-es'
export const DEFAULT_ENVIRONMENT_PARAMS={offsetY:2}

// Coastal diorama. Visible solid objects and physical surfaces share coordinates.
export class World {
 constructor(scene,physicsWorld,reflectionMap=null){
  this.scene=scene;this.physicsWorld=physicsWorld;this.reflectionMap=reflectionMap
  this.environmentParams={...DEFAULT_ENVIRONMENT_PARAMS};this.dynamicPairs=[]
  this.house=new THREE.Group();scene.add(this.house)
  this.colliderBody=new CANNON.Body({mass:0,material:physicsWorld.defaultMaterial});physicsWorld.addBody(this.colliderBody)
  this.hemi=new THREE.HemisphereLight(0xc6e9f3,0x87805a,1.6);scene.add(this.hemi)
  this.sun=new THREE.DirectionalLight(0xffe4b7,2.6);this.sun.position.set(-35,110,40);this.sun.target.position.set(48,0,0);scene.add(this.sun,this.sun.target)
  this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-130,right:130,top:130,bottom:-130,far:300});this.sun.shadow.normalBias=.04;this.sun.shadow.bias=-.0002
  this.ready=this.build()
 }
 material(color,extra={}){return new THREE.MeshStandardMaterial({color,roughness:.86,...extra})}
 mesh(geometry,material,x,y,z,shadow=true){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;this.house.add(m);return m}
 box(x,y,z,w,h,d,material,solid=false){const m=this.mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z);if(solid)this.colliderBody.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)),new CANNON.Vec3(x,y,z));return m}
 async build(){
  const loader=new THREE.TextureLoader(),[sky,asphalt,foliage,water,materials]=await Promise.all([loader.loadAsync('art/race-sky.png'),loader.loadAsync('art/race-asphalt.png'),loader.loadAsync('art/race-foliage.png'),loader.loadAsync('art/race-water.png'),loader.loadAsync('art/race-materials.png')]);sky.colorSpace=asphalt.colorSpace=foliage.colorSpace=water.colorSpace=THREE.SRGBColorSpace
  sky.mapping=THREE.EquirectangularReflectionMapping;this.scene.background=sky;this.scene.backgroundIntensity=.9;this.scene.fog=new THREE.Fog(0xc5e0df,220,700)
  asphalt.wrapS=asphalt.wrapT=THREE.RepeatWrapping;asphalt.repeat.set(.12,.12);asphalt.anisotropy=4
  const surfaces=[]
  for(let i=0;i<4;i++){
   const c=document.createElement('canvas');c.width=c.height=512;const context=c.getContext('2d');context.imageSmoothingQuality='high';const img=materials.image,w=Math.floor(img.width/2),h=Math.floor(img.height/2)
   context.drawImage(img,(i%2)*w,Math.floor(i/2)*h,w,h,0,0,512,512);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4
   if(i>1){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(i===2?3:14,i===2?2:18)}surfaces.push(t)
  }
  const facade=this.material(0xffffff,{map:surfaces[0]}),sidewall=this.material(0xffffff,{map:surfaces[1]})
  const sand=this.material(0xd6c69a),grass=this.material(0xbec79e,{map:surfaces[3]}),stone=this.material(0xd3cbb5),cream=this.material(0xffeed0),roof=this.material(0xf2c5a1,{map:surfaces[2]}),wood=this.material(0x6c5e42),teal=this.material(0x3a7271)
  this.box(48,-4,-2.5,166,8,202,sand,true)
  // A grass island surrounded by shallow sand; previous saves remain on solid terrain.
  this.box(48,.005,-2.5,142,.02,176,grass)
  water.wrapS=water.wrapT=THREE.RepeatWrapping;water.repeat.set(130,130);water.anisotropy=4;this.water=water
  const sea=this.mesh(new THREE.PlaneGeometry(2600,2600),this.material(0xffffff,{map:water,roughness:.35,metalness:.05}),48,-4.3,0,false);sea.rotation.x=-Math.PI/2
  const road=this.material(0xc7c5b5,{map:asphalt,roughness:.95})
  const rounded=(x,y,w,h,r)=>{const s=new THREE.Shape();s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s}
  const outer=rounded(-13,-73,122,151,19),inner=rounded(13,-47,70,99,8);outer.holes.push(new THREE.Path(inner.getPoints(64)))
  const track=this.mesh(new THREE.ShapeGeometry(outer,32),road,0,.05,0,false);track.rotation.x=-Math.PI/2
  // Geometry's second coordinate is -Z; the symmetric course covers all legacy gates.
  const curbRed=this.material(0xc55f45),curbWhite=this.material(0xf5e8c8)
  const curbs=[]
  for(let z=-54;z<=54;z+=4){curbs.push([-12,z,1.4,3.9],[108,z,1.4,3.9]);if(z>-45&&z<45)curbs.push([13,z,1.1,3.9],[83,z,1.1,3.9])}
  for(let x=8;x<90;x+=4){curbs.push([x,73,3.9,1.4],[x,-78,3.9,1.4]);if(x>20&&x<78)curbs.push([x,47,3.9,1.1],[x,-52,3.9,1.1])}
  curbs.forEach(([x,z,w,d],i)=>this.box(x,.09,z,w,.12,d,Math.floor(i/2)%2?curbWhite:curbRed))
  // Checkered start line, lane direction arrows and restrained road furniture.
  for(let x=-10;x<10;x+=2)for(let z=-2;z<2;z+=2)this.box(x+1,.072,z+1,2,.025,2,((x+z)/2)%2?cream:this.material(0x344f50))
  const mark=this.material(0xf7eccc)
  for(let z=-40;z<=42;z+=14){this.box(-6,.068,z,.25,.02,4,mark);this.box(102,.068,z,.25,.02,4,mark)}
  for(let x=23;x<80;x+=14){this.box(x,.068,66,4,.02,.25,mark);this.box(x,.068,-66,4,.02,.25,mark)}
  const trunk=this.material(0x92744a),leaf=this.material(0x3f7958)
  const sprites=[]
  for(let i=0;i<4;i++){
   // Unequal top/bottom artwork bounds are recorded explicitly, never guessed at draw time.
   const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high'
   const img=foliage.image,split=Math.round(img.height*.57),sx=(i%2)*img.width/2,sy=i<2?0:split,sh=i<2?split:img.height-split
   ctx.drawImage(img,sx,sy,img.width/2,sh,0,0,512,512)
   const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace
   sprites.push(new THREE.SpriteMaterial({map:t,alphaTest:.15,depthWrite:true,color:0xffffff}))
  }
  const decoration=(frame,x,z,w,h)=>{const s=new THREE.Sprite(sprites[frame]);s.center.set(.5,.04);s.position.set(x,.15,z);s.scale.set(w,h,1);this.house.add(s);return s}
  const tree=(x,z,scale=1)=>{
   decoration(Math.round(x+z)%3===0?1:0,x,z,12*scale,13*scale)
   this.colliderBody.addShape(new CANNON.Cylinder(.65,.65,6*scale,8),new CANNON.Vec3(x,3*scale,z))
  }
  for(let i=0;i<12;i++)tree(i%2?-31:127,-68+i*12,.8+(i%3)*.15)
  for(const [x,z]of [[22,-35],[75,-28],[23,32],[75,34]])tree(x,z,1.1)
  const cottage=(x,z,w=10,d=9)=>{
   this.box(x,3,z,w,6,d,[sidewall,sidewall,cream,cream,facade,sidewall],true);this.box(x,.45,z,w+.5,.9,d+.5,stone)
   const g=new THREE.CylinderGeometry(0,w*.8,3.8,4,1);g.rotateY(Math.PI/4);const r=this.mesh(g,roof,x,7.8,z);r.scale.z=d/w
   this.box(x-2,7,z-1,1.2,4,1.2,cream)
   for(const dx of [-w/2,w/2])for(const dz of [-d/2,d/2])this.box(x+dx,3,z+dz,.18,6,.18,wood)
  }
  cottage(-24,28,10,8);cottage(-24,48,9,8);cottage(119,24,9,8);cottage(119,-38,9,8);
  cottage(37,-27);cottage(61,-22,12,10);cottage(36,24,11,10);cottage(65,27)
  for(const [x,z]of [[-18,20],[-18,39],[19,15],[19,36],[76,-18],[76,19],[115,-27],[115,34]])decoration(3,x,z,4,4)
  for(let i=0;i<15;i++)decoration(2,i%2?-34:130,-87+i*12,9,6)
  // Central village square and fountain.
  this.box(48,.03,0,38,.04,28,stone)
  this.mesh(new THREE.CylinderGeometry(5,5.4,.65,32),cream,48,.4,0)
  this.mesh(new THREE.CylinderGeometry(4.5,4.5,.12,32),this.material(0x65c3c5,{roughness:.2}),48,.8,0)
  this.mesh(new THREE.CylinderGeometry(.6,.8,3,12),stone,48,2,0);this.mesh(new THREE.SphereGeometry(1.2,12,8),stone,48,3.7,0)
  this.colliderBody.addShape(new CANNON.Box(new CANNON.Vec3(5,.7,5)),new CANNON.Vec3(48,.7,0))
  // Lighthouse by the outer shore, outside the racing line.
  this.mesh(new THREE.CylinderGeometry(2.8,4,20,16),cream,117,10,-90)
  this.mesh(new THREE.CylinderGeometry(3.1,3.3,2,16),curbRed,117,14,-90)
  this.mesh(new THREE.CylinderGeometry(4.2,4.2,.6,16),stone,117,20,-90)
  this.mesh(new THREE.CylinderGeometry(2.6,2.6,3,12),teal,117,22,-90)
  this.mesh(new THREE.ConeGeometry(4,3,12),roof,117,25,-90)
  this.colliderBody.addShape(new CANNON.Box(new CANNON.Vec3(4,10,4)),new CANNON.Vec3(117,10,-90))
  for(let i=0;i<24;i++){const side=i%2?1:-1,x=side>0?137:-40,z=-108+Math.floor(i/2)*19;const rock=this.mesh(new THREE.DodecahedronGeometry(4+(i%3),0),stone,x,-1,z);rock.scale.set(1,.8,1.4)}
  // Finish gantry is open over the driving lane.
  this.box(-11,6,-36,.55,12,.55,teal,true);this.box(11,6,-36,.55,12,.55,teal,true)
  const bannerCanvas=document.createElement('canvas');bannerCanvas.width=1024;bannerCanvas.height=128;const c=bannerCanvas.getContext('2d');c.fillStyle='#f6e8c9';c.fillRect(0,0,1024,128);c.fillStyle='#2d6566';c.font='bold 54px system-ui';c.textAlign='center';c.fillText('COASTAL  •  RC CLUB',512,83);const bannerTexture=new THREE.CanvasTexture(bannerCanvas);bannerTexture.colorSpace=THREE.SRGBColorSpace
  this.box(0,11.5,-36,23,1.8,.2,this.material(0xffffff,{map:bannerTexture}))
  this.applyEnvironmentParams()
 }
 applyEnvironmentParams(){this.house.position.y=this.environmentParams.offsetY;this.colliderBody.position.y=this.environmentParams.offsetY;this.colliderBody.updateAABB()}
 update(){if(this.water){this.water.offset.x=(performance.now()*.000004)%1;this.water.offset.y=(performance.now()*.000002)%1}}
}

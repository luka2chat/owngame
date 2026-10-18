import * as THREE from 'three';
import { RADIUS, UP, normalAt, surfaceRadius, seededRandom } from './math.js';

const random = seededRandom(612);
const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .86, flatShading: true, ...options });
const palette = {
  stone: mat('#a59c8b'), bark: mat('#74634c'), leaf: mat('#688365'), darkLeaf: mat('#415f54'),
  cream: mat('#e9d4ab'), roof: mat('#a4654f'), dark: mat('#243a37'), gold: mat('#c8a76b', { metalness: .45 }),
  glow: mat('#fbe0a1', { emissive: '#ffb939', emissiveIntensity: 2.2 }), pink: mat('#de867b'),
};

function mesh(geometry, material, parent, position = [0,0,0], scale) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  if (scale) object.scale.set(...scale);
  object.castShadow = true; object.receiveShadow = true;
  parent.add(object); return object;
}
const sphere = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const cylinder = (top, bottom, height, segments = 10) => new THREE.CylinderGeometry(top, bottom, height, segments);
function anchored(parent, normal, lift = 0) {
  const group = new THREE.Group();
  group.quaternion.setFromUnitVectors(UP, normal);
  group.position.copy(normal).multiplyScalar(surfaceRadius(normal) + lift);
  parent.add(group); return group;
}

export function createWorld(scene) {
  const planet = new THREE.Group(); scene.add(planet);
  const terrainGeo = new THREE.IcosahedronGeometry(RADIUS, 4);
  const pos = terrainGeo.attributes.position;
  const colors = [];
  const n = new THREE.Vector3();
  for (let i=0; i<pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    pos.setXYZ(i, n.x * surfaceRadius(n), n.y * surfaceRadius(n), n.z * surfaceRadius(n));
    const c = new THREE.Color();
    const noise = Math.sin(n.x*17+n.z*13)*.035 + Math.sin(n.z*30)*.015;
    if (n.y > .08) c.setHSL(.22 + noise * .4, .22, .38 + n.y * .08 + noise);
    else c.setHSL(.10 + noise*.5, .12, .34 + n.y * .1 + noise);
    colors.push(c.r,c.g,c.b);
  }
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  terrainGeo.computeVertexNormals();
  const terrain = mesh(terrainGeo, mat('#ffffff', {vertexColors:true}), planet);
  terrain.name = 'walkable planet';
  // Landmarks use positions in the same spherical coordinate frame as the player.
  const landmarks = {
    home: { normal:normalAt(-2.7,-2.5), radius:1.1 },
    rose: { normal:normalAt(2.35,2.55), radius:.45 },
    beacon: { normal:normalAt(-4.7,-.25), radius:.45 },
    tree: { normal:normalAt(3.5,-2.6), radius:.5 },
  };
  const starNormals = [normalAt(-.8,3.25),normalAt(-3.8,1.3),normalAt(1.4,-1.6)];
  const occupied = [...Object.values(landmarks).map(x=>x.normal), ...starNormals, normalAt(0,5.4)];

  // The house is made from primitives, ready to be replaced by a GLB asset.
  const house = anchored(planet, landmarks.home.normal);
  mesh(cylinder(.9,1.08,1.45,16),palette.cream,house,[0,.7,0]);
  mesh(new THREE.ConeGeometry(1.39,1.05,16),palette.roof,house,[0,1.88,0]);
  mesh(new THREE.BoxGeometry(.3,.8,.3),palette.cream,house,[.55,2.02,-.2]);
  mesh(new THREE.BoxGeometry(.42,.12,.42),palette.stone,house,[.55,2.43,-.2]);
  const door = mesh(cylinder(.32,.32,.07,12),palette.dark,house,[0,.62,1.02],[1,1,1.7]);
  door.rotation.x = Math.PI/2;
  mesh(new THREE.BoxGeometry(.63,.61,.07),palette.dark,house,[0,.32,1.02]);
  mesh(new THREE.BoxGeometry(.85,.12,.45),palette.stone,house,[0,.02,1.13]);
  const window = mesh(cylinder(.22,.22,.09,16),palette.glow,house,[.74,.86,.65]);
  window.rotation.set(Math.PI/2,0,-.65);
  mesh(new THREE.BoxGeometry(.43,.045,.1),palette.bark,house,[.73,.86,.71]);
  mesh(new THREE.BoxGeometry(.045,.43,.1),palette.bark,house,[.73,.86,.71]);
  // Gentle chimney smoke is shared geometry and animated independently of physics.
  const smoke = [];
  for(let i=0;i<6;i++){
    const puff=mesh(sphere(.18,1),mat('#dfd7bf',{transparent:true,opacity:.18,depthWrite:false}),house,[.55,2.65+i*.32,-.2]);
    puff.castShadow=false;smoke.push(puff);
  }

  // Flowers beneath a glass cloche.
  const rose = anchored(planet,landmarks.rose.normal);
  mesh(cylinder(.68,.75,.16,24),palette.stone,rose,[0,.08,0]);
  mesh(cylinder(.055,.07,.74,8),palette.darkLeaf,rose,[0,.52,0]);
  for(let i=0;i<3;i++){
    const leaf=mesh(sphere(.19),palette.leaf,rose,[i%2?.13:-.13,.35+i*.15,0],[1.2,.35,.6]);
    leaf.rotation.z=(i%2?1:-1)*.5;
  }
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    mesh(sphere(.16),palette.pink,rose,[Math.cos(a)*.16,.99+(i%2)*.07,Math.sin(a)*.16],[1,.75,1]);
  }
  const heart=mesh(sphere(.17),mat('#efb1a2'),rose,[0,1.07,0]);
  const glassMaterial = new THREE.MeshPhysicalMaterial({color:'#b9e4dc',transparent:true,opacity:.17,roughness:.12,metalness:.12,side:THREE.DoubleSide,depthWrite:false});
  const glass=mesh(new THREE.SphereGeometry(.59,24,16,0,Math.PI*2,0,Math.PI/2),glassMaterial,rose,[0,.8,0]);
  glass.castShadow=false;
  const glassWall=mesh(new THREE.CylinderGeometry(.59,.59,.65,24,1,true),glassMaterial,rose,[0,.475,0]);
  glassWall.castShadow=false;
  const rim=mesh(new THREE.TorusGeometry(.60,.024,6,40),palette.gold,rose,[0,.16,0]);rim.rotation.x=Math.PI/2;
  mesh(sphere(.06),palette.gold,rose,[0,1.44,0]);

  // Beacon: a little astronomical instrument.
  const beacon = anchored(planet,landmarks.beacon.normal);
  mesh(cylinder(.7,.8,.15,8),palette.stone,beacon,[0,.075,0]);
  mesh(cylinder(.22,.34,.75,8),palette.cream,beacon,[0,.48,0]);
  const beaconGlow=mat('#93b9ad',{emissive:'#94d6bc',emissiveIntensity:.35});
  mesh(sphere(.28,1),beaconGlow,beacon,[0,1.16,0]);
  const rings=new THREE.Group();rings.position.y=1.16;beacon.add(rings);
  mesh(new THREE.TorusGeometry(.53,.035,8,48),palette.gold,rings);
  const ring2=mesh(new THREE.TorusGeometry(.53,.025,8,48),palette.gold,rings);ring2.rotation.y=Math.PI/2;
  const beaconLight=new THREE.PointLight('#efdca3',0,12);beaconLight.position.y=1.4;beacon.add(beaconLight);
  const beam=mesh(new THREE.CylinderGeometry(.05,.3,15,24,1,true),new THREE.MeshBasicMaterial({color:'#e5dcab',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),beacon,[0,8.5,0]);beam.castShadow=false;

  function createTree(normal, size=1) {
    const tree=anchored(planet,normal);tree.scale.setScalar(size);
    mesh(cylinder(.13,.27,1.7,7),palette.bark,tree,[0,.85,0]);
    for(let i=0;i<8;i++) {
      const a=i*2.4;
      const f=mesh(new THREE.DodecahedronGeometry(.8,1),i%3?palette.leaf:palette.darkLeaf,tree,[Math.cos(a)*.65,1.85+random()*.8,Math.sin(a)*.65],[1,.85,1]);
      f.rotation.set(random(),random(),random());
    }
  }
  createTree(landmarks.tree.normal,1.1);
  createTree(normalAt(5,-.4),.7);
  createTree(normalAt(-4.3,-3.9),.68);
  createTree(normalAt(.6,-5.5),.7);

  // A cairn, small crater and a path give the eye readable landmarks.
  const volcano=anchored(planet,normalAt(.5,-3.9));
  mesh(cylinder(.36,1.1,1.6,9),mat('#8c8c78'),volcano,[0,.65,0]);
  mesh(cylinder(.31,.3,.04,9),palette.dark,volcano,[0,1.46,0]);
  const craterRim=mesh(new THREE.TorusGeometry(.37,.08,5,9),palette.stone,volcano,[0,1.44,0]);craterRim.rotation.x=Math.PI/2;
  for(let i=0;i<11;i++){
    const t=i/10;
    const pathNormal=normalAt(-2.7*(1-t)+2.35*t,-1.15*(1-t)+2.55*t);
    const path=anchored(planet,pathNormal,.025);
    const step=mesh(sphere(.3),mat('#c5bc91'),path,[0,0,0],[1.1,.14,.72]);step.rotation.y=random()*2;
  }

  const rockGeo=sphere(1,0);
  const rocks=new THREE.InstancedMesh(rockGeo,palette.stone,80);
  const temp=new THREE.Object3D(); let rockIndex=0;
  for(let i=0;i<1000 && rockIndex<80;i++){
    const rn=new THREE.Vector3(random()*2-1,random()*1.8-.65,random()*2-1).normalize();
    if(occupied.some(p=>p.angleTo(rn)<.18))continue;
    temp.position.copy(rn).multiplyScalar(surfaceRadius(rn)-.03);temp.quaternion.setFromUnitVectors(UP,rn);
    const scale=.13+random()*.35;temp.scale.set(scale,scale*.65,scale*.85);temp.updateMatrix();rocks.setMatrixAt(rockIndex++,temp.matrix);
  }
  rocks.count=rockIndex;rocks.castShadow=true;rocks.receiveShadow=true;planet.add(rocks);

  // One instanced draw for thousands of grass blades; wind runs on the GPU.
  const blade=new THREE.BufferGeometry();
  blade.setAttribute('position',new THREE.Float32BufferAttribute([-.035,0,0,.035,0,0,0,.27,0],3));
  blade.computeVertexNormals();
  const grassMaterial=mat('#a3ab75',{side:THREE.DoubleSide});
  const wind={value:0};
  grassMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uTime=wind;
    shader.vertexShader='uniform float uTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(uTime * 1.4 + instanceMatrix[3].x * 2.0 + instanceMatrix[3].z) * position.y * 0.22;');
  };
  const grass=new THREE.InstancedMesh(blade,grassMaterial,3400);let gi=0;
  const grassColor=new THREE.Color();
  for(let i=0;i<10000 && gi<3400;i++){
    const rn=new THREE.Vector3(random()*2-1,random()*.9+.15,random()*2-1).normalize();
    if(occupied.some(p=>p.angleTo(rn)<.14))continue;
    temp.position.copy(rn).multiplyScalar(surfaceRadius(rn));temp.quaternion.setFromUnitVectors(UP,rn);temp.rotateY(random()*Math.PI*2);
    temp.scale.setScalar(.65+random()*1.1);temp.updateMatrix();grass.setMatrixAt(gi,temp.matrix);
    grassColor.setHSL(.18+random()*.08,.20+random()*.16,.39+random()*.18);grass.setColorAt(gi,grassColor);gi++;
  }
  grass.count=gi;grass.receiveShadow=true;planet.add(grass);
  const flowers=new THREE.InstancedMesh(sphere(.075,0),mat('#f2dfb1'),160);let fi=0;
  while(fi<160){
    const rn=new THREE.Vector3(random()*2-1,random()+.3,random()*2-1).normalize();
    if(occupied.some(p=>p.angleTo(rn)<.15))continue;
    temp.position.copy(rn).multiplyScalar(surfaceRadius(rn)+.15);temp.quaternion.setFromUnitVectors(UP,rn);temp.scale.set(1,.45,1);temp.updateMatrix();flowers.setMatrixAt(fi,temp.matrix);
    flowers.setColorAt(fi,new THREE.Color(fi%4===0?'#d5a4ac':'#f3dfac'));fi++;
  }planet.add(flowers);

  // Collectibles are normal scene objects; the quest only stores their IDs.
  const stars=starNormals.map((normal,id)=>{
    const root=anchored(planet,normal);
    const gem=mesh(new THREE.OctahedronGeometry(.19),palette.glow,root,[0,.73,0]);
    const ring=mesh(new THREE.TorusGeometry(.34,.014,5,32),palette.gold,root,[0,.75,0]);ring.rotation.x=.5;
    return {id,normal,root,gem,ring};
  });
  // Galaxy: static points, so stars cost one draw rather than many DOM nodes.
  const starPositions=[],starColors=[];
  for(let i=0;i<1600;i++){
    const dir=new THREE.Vector3(random()*2-1,random()*2-1,random()*2-1).normalize().multiplyScalar(90+random()*70);
    starPositions.push(dir.x,dir.y,dir.z);
    const c=new THREE.Color(i%4===0?'#c8b58c':'#7194a8').multiplyScalar(.45+random()*.65);starColors.push(c.r,c.g,c.b);
  }
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));starGeo.setAttribute('color',new THREE.Float32BufferAttribute(starColors,3));
  const sky=new THREE.Points(starGeo,new THREE.PointsMaterial({size:.18,vertexColors:true,transparent:true,opacity:.85,sizeAttenuation:true}));scene.add(sky);
  // A distant crescent-like body, a visual anchor in the empty sky.
  const moon=mesh(sphere(2.3,3),mat('#8f9d9e'),scene,[-28,15,-40]);moon.castShadow=false;
  const orbitRing=mesh(new THREE.TorusGeometry(9.6,.012,3,180),new THREE.MeshBasicMaterial({color:'#8aabac',transparent:true,opacity:.16}),planet);
  orbitRing.rotation.set(1.3,.35,.15);

  const helper=new THREE.Group();helper.visible=false;scene.add(helper);
  const arrow=new THREE.ArrowHelper(UP,new THREE.Vector3(0,RADIUS,0),2,0x83e0c2,.3,.14);helper.add(arrow);
  const collisionRings=[];
  for (const item of Object.values(landmarks)){
    const root=anchored(helper,item.normal,.04);
    const ring=mesh(new THREE.TorusGeometry(item.radius+.25,.02,4,40),new THREE.MeshBasicMaterial({color:'#83e0c2',depthTest:false}),root);ring.rotation.x=Math.PI/2;collisionRings.push(ring);
  }
  const objects=[...Object.values(landmarks),{normal:normalAt(.5,-3.9),radius:1.08},{normal:normalAt(5,-.4),radius:.23},{normal:normalAt(-4.3,-3.9),radius:.23},{normal:normalAt(.6,-5.5),radius:.23}];
  const materials=new Set();planet.traverse(o=>{if(o.isMesh && o.material && !Array.isArray(o.material) && 'wireframe' in o.material)materials.add(o.material);});
  return {
    planet,terrain,stars,landmarks,objects,helper,arrow,
    setWireframe(value){for(const material of materials)material.wireframe=value;},
    update(time, dt, complete){
      wind.value=time;
      stars.forEach(s=>{s.gem.rotation.y=time*.8;s.gem.position.y=.8+Math.sin(time*2+s.id)*.12;s.ring.rotation.y=time*.5;});
      smoke.forEach((p,i)=>{const t=(time*.14+i/6)%1;p.position.set(.55+Math.sin(t*4)*.3,2.5+t*2.2,-.2);p.scale.setScalar(.6+t*1.6);p.material.opacity=(1-t)*.17;});
      rings.rotation.y=time*.35;rings.rotation.z=.35+Math.sin(time*.4)*.1;
      heart.scale.setScalar(1+Math.sin(time*1.7)*.03);
      if(complete){beaconGlow.emissiveIntensity=2.5;beaconLight.intensity=5;beam.material.opacity=THREE.MathUtils.damp(beam.material.opacity,.18,2,dt);}
    },
  };
}

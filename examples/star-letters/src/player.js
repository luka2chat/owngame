import * as THREE from 'three';
import { UP, RADIUS, normalAt, surfaceRadius, tangent, stepOnSphere } from './math.js';

function material(color){return new THREE.MeshStandardMaterial({color,roughness:.9,flatShading:true});}
function add(geo,mat,parent,pos,scale){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function createPlayer(scene) {
  const root=new THREE.Group();scene.add(root);
  const body=new THREE.Group();root.add(body);
  const sage=material('#a7b5a0'), red=material('#b9634b'), skin=material('#eac99d'), cream=material('#e9dfbd'), boots=material('#514d42');
  add(new THREE.CylinderGeometry(.16,.23,.46,8),sage,body,[0,.58,0]);
  add(new THREE.IcosahedronGeometry(.21,2),skin,body,[0,.99,.015],[1,1.06,1]);
  add(new THREE.SphereGeometry(.228,12,8,0,Math.PI*2,0,Math.PI*.55),cream,body,[0,1.05,0]);
  add(new THREE.IcosahedronGeometry(.085,1),cream,body,[.015,1.3,0]);
  add(new THREE.TorusGeometry(.2,.045,6,16),cream,body,[0,1.035,0]).rotation.x=Math.PI/2;
  for(const x of [-.075,.075])add(new THREE.SphereGeometry(.019,6,4),boots,body,[x,1.005,.203]);
  add(new THREE.CylinderGeometry(.19,.22,.11,10),red,body,[0,.81,0]);
  const scarf=[];
  for(let i=0;i<4;i++){const segment=add(new THREE.BoxGeometry(.15,.035,.16),red,body,[0,.8-i*.025,-.2-i*.13]);scarf.push(segment);}
  const arms=[],legs=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.22,.75,0);body.add(arm);
    add(new THREE.CylinderGeometry(.06,.055,.3,6),sage,arm,[0,-.13,0]);add(new THREE.IcosahedronGeometry(.065,1),skin,arm,[0,-.3,0]);arms.push(arm);
    const leg=new THREE.Group();leg.position.set(side*.105,.4,0);body.add(leg);
    add(new THREE.CylinderGeometry(.065,.06,.28,6),boots,leg,[0,-.12,0]);add(new THREE.BoxGeometry(.14,.10,.23),boots,leg,[0,-.29,.035]);legs.push(leg);
  }
  // A simple visible backpack reinforces orientation from a distant camera.
  add(new THREE.BoxGeometry(.26,.28,.13),red,body,[0,.62,-.19]);
  let normal=normalAt(0,5.1), facing=tangent(new THREE.Vector3(0,0,-1),normal), velocity=0, jumpHeight=0;
  let target=null, phase=0;
  const basis=new THREE.Matrix4(),rotation=new THREE.Quaternion();
  const position=new THREE.Vector3();
  function place(){root.position.copy(normal).multiplyScalar(surfaceRadius(normal)+jumpHeight+.07);const right=new THREE.Vector3().crossVectors(normal,facing).normalize();basis.makeBasis(right,normal,facing);rotation.setFromRotationMatrix(basis);root.quaternion.copy(rotation);}
  place();
  return {
    root,
    get normal(){return normal;},
    get target(){return target;},
    goTo(n){target=n.clone();},
    cancel(){target=null;},
    jump(){if(jumpHeight<.001)velocity=3.4;},
    update(dt,time,input,camera,obstacles,active){
      let moving=false;
      if(active){
        const forward=tangent(root.position.clone().sub(camera.position),normal);
        const right=new THREE.Vector3().crossVectors(forward,normal).normalize();
        const direction=new THREE.Vector3();
        if(input.has('KeyW')||input.has('ArrowUp'))direction.add(forward);
        if(input.has('KeyS')||input.has('ArrowDown'))direction.sub(forward);
        if(input.has('KeyD')||input.has('ArrowRight'))direction.add(right);
        if(input.has('KeyA')||input.has('ArrowLeft'))direction.sub(right);
        if(direction.lengthSq()>.01)target=null;
        else if(target){if(normal.angleTo(target)*RADIUS<.18)target=null;else direction.copy(tangent(target,normal));}
        if(direction.lengthSq()>.01){
          direction.normalize();
          let candidate=stepOnSphere(normal,direction,(input.has('ShiftLeft')||input.has('ShiftRight')?3.7:2.25)*dt);
          // Analytic circular colliders on the sphere, with a tangent slide around props.
          for(const obstacle of obstacles){
            const min=(obstacle.radius+.22)/RADIUS;
            if(candidate.angleTo(obstacle.normal)<min){
              const away=tangent(candidate,obstacle.normal);
              if(away.lengthSq()<.01)away.copy(tangent(facing,obstacle.normal));
              candidate=stepOnSphere(obstacle.normal,away,min*RADIUS);
            }
          }
          moving=normal.angleTo(candidate)>0.0001;
          normal=candidate;
          facing.lerp(tangent(direction,normal),1-Math.exp(-dt*12));facing=tangent(facing,normal);
        } else facing=tangent(facing,normal);
        velocity-=9*dt;jumpHeight+=velocity*dt;
        if(jumpHeight<0){jumpHeight=0;velocity=0;}
      }
      phase+=dt*(moving?10:1.7);
      legs.forEach((l,i)=>{l.rotation.x=THREE.MathUtils.damp(l.rotation.x,moving?Math.sin(phase+i*Math.PI)*.6:0,12,dt);});
      arms.forEach((a,i)=>{a.rotation.x=THREE.MathUtils.damp(a.rotation.x,moving?-Math.sin(phase+i*Math.PI)*.5:Math.sin(time*1.6)*.04,12,dt);});
      body.position.y=moving?Math.abs(Math.sin(phase))*.035:Math.sin(time*1.6)*.015;
      scarf.forEach((s,i)=>{s.position.x=Math.sin(time*3-i*.6)*(.015+i*.025);s.rotation.y=Math.sin(time*3-i*.6)*.15;});
      place();position.copy(root.position);
      return moving;
    },
  };
}

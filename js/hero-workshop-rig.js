/* Actual model components are transported in workshop space, then handed off
 * to their original tank meshes at an identical pose. No simulated stock props. */
function makeWorkshopComponents(tank,root){
  tank.position.y=.66;tank.rotation.y=Math.PI;tank.updateMatrixWorld(true);
  const batches=new Map(),parts=[];
  tank.traverse(mesh=>{
    if(!mesh.isMesh)return;
    let node=mesh,order=null,stage=4,name='升级模组';
    while(node&&node!==tank){
      if(node.name==='英雄武器模组'){order=10;name=node.name;break;}
      if(Number.isInteger(node.userData.assemblyOrder)&&order===null){order=node.userData.assemblyOrder;name=node.name;}
      if(Number.isInteger(node.userData.assemblyStage))stage=node.userData.assemblyStage;
      node=node.parent;
    }
    if(order===null)order=10;
    if(!batches.has(order))batches.set(order,{name,order,stage,originals:[]});
    batches.get(order).originals.push(mesh);parts.push({mesh,stage,base:mesh.position.clone()});
  });
  const components=[...batches.values()].sort((a,b)=>a.order-b.order);
  for(const item of components){
    const box=new THREE.Box3();for(const mesh of item.originals){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    item.center=center.toArray();item.size=size.toArray();item.side=Math.abs(center.x)>.1?Math.sign(center.x):item.order%2?1:-1;
    item.cargo=new THREE.Group();item.cargo.name='夹取部件：'+item.name;root.add(item.cargo);
    for(const mesh of item.originals){
      const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).translate(-center.x,-center.y,-center.z);
      const copy=new THREE.Mesh(geometry,mesh.material);copy.castShadow=true;copy.receiveShadow=true;item.cargo.add(copy);
    }
    // Pick a point on a real outer face, not the centre of an empty bounding box.
    const faces=[];let extreme=-Infinity;
    for(const mesh of item.cargo.children){const geometry=mesh.geometry,vertices=geometry.attributes.position,index=geometry.index;
      for(let i=0;i<(index?index.count:vertices.count);i+=3){const ids=[0,1,2].map(n=>index?index.getX(i+n):i+n);
        const xs=ids.map(n=>vertices.getX(n));if(Math.max(...xs)-Math.min(...xs)>.001)continue;
        const x=xs[0],score=x*item.side,point=[x,ids.reduce((s,n)=>s+vertices.getY(n),0)/3,ids.reduce((s,n)=>s+vertices.getZ(n),0)/3];
        if(score>extreme+.001){extreme=score;faces.length=0;}if(Math.abs(score-extreme)<.001)faces.push(point);
      }
    }
    if(faces.length){const average=faces.reduce((a,b)=>a.map((v,i)=>v+b[i]/faces.length),[0,0,0]);
      faces.sort((a,b)=>Math.hypot(a[1]-average[1],a[2]-average[2])-Math.hypot(b[1]-average[1],b[2]-average[2]));item.contact=faces[0];
    }
  }
  return {components,parts};
}
function makeWorkshopHatches(root){
  const hatches=[];
  for(const side of [-1,1]){
    const group=new THREE.Group();group.position.set(side*2.65,0,.25);root.add(group);const kit=heroModelKit(group);
    const dark=new THREE.MeshBasicMaterial({color:0x020508});
    kit.box(1.18,.025,5.3,0,.8,0,dark);
    for(const x of [-.64,.64]){kit.box(.08,.15,5.5,x,.84,0,kit.edge);kit.box(.025,.03,5.2,x,.93,0,kit.glow);}
    for(const z of [-2.73,2.73])kit.box(1.35,.15,.12,0,.84,z,kit.brass);
    const doors=[-1,1].map(sign=>({sign,mesh:kit.box(.59,.07,5.25,sign*.3,.92,0,kit.steel)}));
    hatches.push({side,doors});
  }
  return hatches;
}
function poseWorkshopBeam(mesh,a,b){
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=a.distanceTo(b);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
}
function driveWorkshopArm(arm,pose,time){
  const target=new THREE.Vector3(...pose.tool).sub(arm.root.position);
  // Keep the elbow outside the tank envelope; the final wrist approaches from above.
  const elbow=new THREE.Vector3(arm.side*.35,Math.max(5.8,target.y+.9),.4);
  poseWorkshopBeam(arm.lower,new THREE.Vector3(0,.9,0),elbow);
  poseWorkshopBeam(arm.upper,elbow,target);
  poseWorkshopBeam(arm.piston,new THREE.Vector3(-arm.side*.18,1,0),elbow.clone().add(new THREE.Vector3(0,-.18,0)));
  arm.joint.position.copy(elbow);arm.claw.position.copy(target);arm.claw.rotation.z=pose.toolAngle||0;
  arm.toolBar.scale.x=1;
  arm.fingers.forEach((finger,i)=>{finger.position.set((i?1:-1)*(pose.gripped?.17:.28),-.13,0);finger.scale.y=.32;finger.rotation.z=0;});
  arm.spark.visible=pose.welding;arm.spark.scale.setScalar(.7+Math.abs(Math.sin(time*31)));
  arm.sparks.visible=pose.welding;
  if(pose.welding){const points=arm.sparks.geometry.attributes.position;
    for(let i=0;i<points.count;i++){const life=(time*2.7+i/points.count)%1,angle=i*2.399+arm.side;
      points.setXYZ(i,target.x+Math.cos(angle)*life*.65,target.y-.35+life*.4-life*life*1.1,target.z+Math.sin(angle)*life*.65);}
    points.needsUpdate=true;
  }
}
function updateWorkshopRig(w,progress){
  // Reserve the last 3% for both arms and hatch covers to clear the departure lane.
  const sequence=Math.min(1,Math.max(0,progress)/.97)*w.components.length;
  const active=Math.min(w.components.length-1,Math.floor(sequence));
  const item=w.components[active],phase=Math.min(1,sequence-active);
  let activePose;
  for(let i=0;i<w.components.length;i++){
    const component=w.components[i],pose=HeroAssemblyMotion.sample(component,i<active?1:i===active?phase:0);
    component.originals.forEach(mesh=>{mesh.visible=i<active||(i===active&&pose.installed);});
    component.cargo.visible=i===active&&pose.visible;
    component.cargo.position.fromArray(pose.position);component.cargo.rotation.z=pose.angle;
    if(i===active)activePose=pose;
  }
  for(const arm of w.arms){
    const selected=arm.side===item.side&&sequence<w.components.length;
    const pose=selected?activePose:{tool:[arm.side*2.8,4.6,-3],halfWidth:.22,gripped:false,welding:false};
    driveWorkshopArm(arm,pose,w.time);
  }
  w.hatches.forEach(hatch=>{const open=hatch.side===item.side?activePose.hatch:0;
    hatch.doors.forEach(({mesh,sign})=>{mesh.position.x=sign*(.3+open*.63);mesh.position.y=.92-open*.16;});});
  w.rigState={component:item.name,index:active,count:w.components.length,phase,gripped:activePose.gripped,installed:activePose.installed};
}

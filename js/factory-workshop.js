/* Open production line: components emerge through the lift floor, then drive out. */
const factoryWorkshops=new Map();
function makeFactoryWorkshopModel(){
  const root=new THREE.Group();root.name='升降装甲流水线';const k=heroModelKit(root);k.steel.color.setHex(0x3d5055);k.brass.color.setHex(0xd99c40);
  k.box(7.4,.28,6.7,0,.17,0,k.steel);k.box(3.7,.12,5.7,0,.38,0,k.edge);
  for(const side of [-1,1]){
    k.box(1.25,1.5,5.6,side*2.85,1,0,k.steel);k.box(1.35,.16,5.8,side*2.85,1.8,0,k.brass);
    for(const z of [-2.7,2.7]){k.box(.35,4.4,.35,side*3.1,2.5,z,k.edge);k.box(.18,.5,.2,side*3.1,3.2,z+.2,k.glow);}
    k.box(.3,.26,5.9,side*3.1,4.8,0,k.steel);
    for(let i=0;i<6;i++){k.box(.65,.1,.27,side*2.8,1.96,-2+i*.8,k.edge);const stripe=k.box(.25,.02,.7,side*1.9,.34,-2+i*.8,k.brass);stripe.rotation.y=.5;}
    k.box(.12,.08,5.7,side*1.55,.5,0,k.glow);
  }
  // The opening remains unobstructed from the normal gameplay camera.
  k.box(6.5,.35,.45,0,4.8,-2.7,k.brass);k.box(1.1,1.7,.55,-2.75,1.3,-2.4,k.steel);k.box(.9,.5,.06,-2.75,2.1,-2.08,k.glow);
  for(let i=0;i<9;i++){const roller=k.cyl(.1,3.1,0,.48,-2.5+i*.6,k.steel);roller.rotation.z=Math.PI/2;}
  for(const z of [-3.65,3.65]){const ramp=k.box(3.5,.1,1.4,0,.2,z,k.edge);ramp.rotation.x=Math.sign(z)*.22;}
  mergeBuildingSurfaces(root);return root;
}
function clearFactoryWorkshop(factory){const w=factoryWorkshops.get(factory);if(w){removeHeroVisual(w.root);factoryWorkshops.delete(factory);}}
function clearFactoryWorkshops(){for(const f of [...factoryWorkshops.keys()])clearFactoryWorkshop(f);}
function factoryPreviewModel(type){const palette={light:[0xb58a45,0xe0c478],medium:[0x496343,0x82906a],heavy:[0x713c36,0x343b40]},p=palette[type];return makeTank(p[0],p[1],SurvivalSystem.FRIENDLY_UNIT_TYPES[type].scale,type);}
function updateFactoryWorkshop(factory,item,progress){
  if(!item){clearFactoryWorkshop(factory);return;}
  let w=factoryWorkshops.get(factory);
  if(w?.item!==item){clearFactoryWorkshop(factory);const root=new THREE.Group();scene.add(root);const tank=factoryPreviewModel(item.typeId);root.add(tank);const parts=[];tank.updateMatrixWorld(true);
    tank.traverse(mesh=>{if(!mesh.isMesh)return;let node=mesh,turret=false;while(node&&node!==tank){turret||=node===tank.userData.turret;node=node.parent;}mesh.geometry.computeBoundingBox();const y=mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).y+mesh.position.y;parts.push({mesh,base:mesh.position.clone(),stage:turret?3:y<.65?0:y<1?1:2});});
    const k=heroModelKit(root),lift=k.box(3.2,.15,4.5,0,.43,0,k.edge);w={root,tank,parts,lift,item};factoryWorkshops.set(factory,w);
  }
  w.root.position.copy(factory.group.position);w.lift.position.y=.4;
  for(const p of w.parts){const local=Math.max(0,Math.min(1,progress*4-p.stage));p.mesh.visible=local>0;p.mesh.position.copy(p.base);p.mesh.position.y-=(1-local)*2.8;}
  const d=item.deployment||factory.group.position,dist=Math.hypot(d.x-factory.group.position.x,d.z-factory.group.position.z);
  w.tank.position.set(d.x-factory.group.position.x,heightAt(d.x,d.z)-factory.group.position.y+.5*Math.max(0,Math.min(1,(5-dist)/1.5)),d.z-factory.group.position.z);w.tank.rotation.y=item.deployment?.heading??Math.PI;
}
function factoryDeparture(factory,item){
  const from=item.deployment||factory.group.position,radius=1.35*SurvivalSystem.FRIENDLY_UNIT_TYPES[item.typeId].scale,own=new Set(factory.footprintCells||[]);
  for(const sign of [1,-1]){const exit={x:factory.group.position.x,z:factory.group.position.z+sign*TILE*2.6};
    if(!navigationSegmentClear(from,exit,radius,own)||!navigationPositionClear(exit,radius))continue;
    const dx=exit.x-from.x,dz=exit.z-from.z,len=dx*dx+dz*dz;
    if(friendlyBodies().some(b=>{const t=len?Math.max(0,Math.min(1,((b.x-from.x)*dx+(b.z-from.z)*dz)/len)):0;return Math.hypot(from.x+t*dx-b.x,from.z+t*dz-b.z)<radius+b.radius+.12;}))continue;
    return exit;
  }return null;
}
function tickFactoryProduction(factory,item,dt){
  item.remaining=Math.max(0,item.remaining-dt);factory.progress=1-item.remaining/item.total;updateFactoryWorkshop(factory,item,factory.progress);
  if(item.remaining>0)return;
  const exit=factoryDeparture(factory,item);factory.exitBlocked=!exit;if(!exit)return;
  item.deployment||={x:factory.group.position.x,z:factory.group.position.z,heading:Math.PI};const d=item.deployment,dx=exit.x-d.x,dz=exit.z-d.z,length=Math.hypot(dx,dz),step=Math.min(length,dt*3);
  d.x+=dx/Math.max(.001,length)*step;d.z+=dz/Math.max(.001,length)*step;d.heading=Math.atan2(dx,dz)+Math.PI;updateFactoryWorkshop(factory,item,1);
  if(length>step+.01)return;
  const unit=createFriendlyUnit(item.typeId,d);unit.group.rotation.y=d.heading;factory.queue.shift();factory.progress=0;clearFactoryWorkshop(factory);
  setFriendlyMoveTarget(unit,factory.rally||exit,true);unit.command='move';
}

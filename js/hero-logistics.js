/* Hero workshop and paid component delivery. Simulation advances only with game time. */
let heroWorkshop=null,heroCourier=null;
function removeHeroVisual(object){if(object){object.parent?.remove(object);disposeTransientObject3D(object);}}
function clearHeroLogistics(){
  if(heroWorkshop){removeHeroVisual(heroWorkshop.root);heroWorkshop=null;}
  if(heroCourier){removeHeroVisual(heroCourier.root);heroCourier=null;}
}
function workshopArm(parent,side){
  const root=new THREE.Group();root.position.set(side*2.8,0,-3);parent.add(root);const k=heroModelKit(root);
  k.cyl(.35,.35,0,.7,0,k.brass);
  const lower=k.box(.25,1,.3,0,1.2,0),upper=k.box(.2,1,.24,0,2.1,0,k.edge);
  const joint=k.cyl(.24,.27,0,2.1,0,k.brass),claw=new THREE.Group();root.add(claw);
  const tool=heroModelKit(claw),toolBar=tool.box(.4,.2,.4,0,0,0,tool.brass);
  tool.cyl(.14,.12,0,-.16,0,tool.brass);
  const fingers=[-1,1].map(sign=>tool.box(.08,.48,.13,sign*.22,-.23,0,tool.edge));
  const piston=k.box(.09,1,.09,.1,1,0,k.brass);
  const particles=new Float32Array(18*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(particles,3));
  const sparks=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xffd68a,size:.065,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));sparks.frustumCulled=false;root.add(sparks);
  const spark=tool.cyl(.1,.12,0,-.5,0,tool.glow);spark.visible=false;
  return {root,lower,upper,joint,claw,spark,side,fingers,piston,sparks,toolBar};
}
function updateHeroWorkshop(h,progress,dt){
  if(!h){if(heroWorkshop){removeHeroVisual(heroWorkshop.root);heroWorkshop=null;}return;}
  if(heroWorkshop?.hub!==h){
    if(heroWorkshop)removeHeroVisual(heroWorkshop.root);
    const root=new THREE.Group();root.name='英雄组装动画';scene.add(root);const workLight=new THREE.PointLight(0xd6f0ff,1.6,15,2);workLight.position.set(0,5,1);root.add(workLight);
    const arms=[workshopArm(root,-1),workshopArm(root,1)];
    const tank=makeHeroTankModel();tank.name='台内组装英雄';root.add(tank);
    const preview={group:tank};rebuildHeroModules(preview);
    const {components,parts}=makeWorkshopComponents(tank,root),hatches=makeWorkshopHatches(root);
    const k=heroModelKit(root),lights=[];for(let i=0;i<5;i++)lights.push(k.box(.35,.08,.18,-.9+i*.45,.8,2.4,k.glow));
    const clamps=[];
    for(const side of [-1,1])for(const z of [-1.65,1.65]){
      const clamp=new THREE.Group();clamp.position.set(side*1.7,.76,z);root.add(clamp);const kit=heroModelKit(clamp);
      kit.box(.24,.22,.42,0,0,0,kit.brass);kit.box(.42,.1,.22,-side*.2,.14,0,kit.edge);clamps.push({mesh:clamp,side});
      k.cyl(.11,.5,side*1.25,.28,z,k.brass);
    }
    heroWorkshop={hub:h,root,tank,arms,parts,components,hatches,lights,clamps,time:0};
  }
  const w=heroWorkshop,a=heroArchive();w.time+=dt;w.root.position.copy(h.group.position);
  updateWorkshopRig(w,progress);
  w.lights.forEach((light,i)=>{light.visible=progress*5>i;});
  const release=Math.max(0,Math.min(1,(progress-.96)/.04));
  w.clamps.forEach(({mesh,side})=>{mesh.position.x=side*(1.7+release*.55);mesh.rotation.z=-side*release*.6;});
  const p=a.deployment||h.group.position,dist=Math.hypot(p.x-h.group.position.x,p.z-h.group.position.z);
  w.tank.position.set(p.x-h.group.position.x,heightAt(p.x,p.z)-h.group.position.y+.66*Math.max(0,Math.min(1,(5-dist)/1.5)),p.z-h.group.position.z);
  w.tank.rotation.y=a.deployment?.heading||Math.PI;
}
function ensureHeroCourier(){
  if(heroCourier)return heroCourier;
  const root=new THREE.Group();root.name='英雄部件运输无人机';const k=heroModelKit(root);
  k.box(.85,.3,1,0,0,0,k.steel);k.box(.5,.14,.6,0,.2,0,k.brass);k.box(.3,.1,.12,0,.05,-.52,k.glow);
  const rotors=[];for(const x of [-.7,.7])for(const z of [-.65,.65]){
    const beam=k.box(.9,.08,.12,x*.55,0,z*.55,k.edge);beam.rotation.y=-Math.atan2(z,x);
    k.cyl(.12,.18,x,.12,z,k.brass);const rotor=k.box(.85,.025,.1,x,.25,z,k.steel);rotors.push(rotor);
  }
  const cargo=new THREE.Group();cargo.position.y=-1;cargo.scale.setScalar(.55);root.add(cargo);scene.add(root);
  heroCourier={root,rotors,cargo,signature:''};return heroCourier;
}
function updateHeroLogistics(dt){
  const a=heroArchive(),h=heroHub(),alive=heroTank?.alive&&heroTank.hp>0;
  if(!h){if(heroCourier)heroCourier.root.visible=false;return;}
  const dock=h.group.position.clone().add(new THREE.Vector3(0,4,-1));
  if(!a.delivery){if(!alive||!a.orders.length){if(heroCourier)heroCourier.root.visible=false;return;}a.delivery={phase:'outbound',installed:false,elapsed:0,x:dock.x,y:dock.y,z:dock.z,progress:0,flightDistance:Math.max(1,dock.distanceTo(heroTank.group.position))};}
  const d=a.delivery,c=ensureHeroCourier();c.root.visible=true;
  const order=a.orders[0],signature=d.phase==='return'&&d.installed?'empty':order?order.skill+order.level:'empty';
  if(c.signature!==signature){for(const child of [...c.cargo.children])removeHeroVisual(child);c.signature=signature;
    if(signature!=='empty'){const levels=Object.fromEntries(Object.keys(HeroSystem.SKILLS).map(k=>[k,k===order.skill?order.level:0]));const model={group:new THREE.Group()};rebuildHeroModules(model,levels);model.group.position.y=1;c.cargo.add(model.group);}
  }
  if(!alive&&d.phase!=='return'){d.phase='return';d.elapsed=0;}
  const destination=d.phase==='return'?dock:heroTank.group.position.clone().add(new THREE.Vector3(0,d.phase==='install'?3:4,0));
  const position=new THREE.Vector3(d.x,d.y,d.z),delta=destination.clone().sub(position),distance=delta.length();
  const speed=dt*24*(1+.12*doctrineLevel('delivery'));if(d.phase==='outbound')d.progress=Math.min(.79,(d.progress||0)+speed/Math.max(1,d.flightDistance||12)*.8);if(distance>0)position.addScaledVector(delta,Math.min(1,speed/distance));
  // Cruise above all intervening terrain. Descent only takes place over the destination.
  if(d.phase!=='install'&&distance>4)position.y=Math.max(position.y,heightAt(position.x,position.z)+5);
  d.x=position.x;d.y=position.y;d.z=position.z;c.root.position.copy(position);
  if(Math.hypot(delta.x,delta.z)>.1)c.root.rotation.y=Math.atan2(delta.x,delta.z);
  c.rotors.forEach((r,i)=>r.rotation.y+=dt*(i%2?60:-60));
  if(position.distanceTo(destination)>.35){if(d.phase==='install')d.elapsed=0;return;}
  if(d.phase==='outbound'){d.phase='install';d.elapsed=0;}
  else if(d.phase==='install'){
    d.elapsed+=dt;c.cargo.position.y=-1-Math.min(1,d.elapsed/1.2)*.8;
    if(d.elapsed>=1.2&&order&&alive){a.skills[order.skill]=Math.max(a.skills[order.skill],order.level);a.orders.shift();rebuildHeroModules(heroTank);sfx.levelup();d.installed=true;d.phase='return';d.elapsed=0;c.cargo.position.y=-1;refreshHeroUI();}
  }else{a.delivery=null;c.root.visible=false;}
}

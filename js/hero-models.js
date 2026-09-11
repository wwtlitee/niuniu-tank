function heroModelKit(root){
  const steel=new THREE.MeshStandardMaterial({color:0x34454d,metalness:.7,roughness:.43});
  const edge=new THREE.MeshStandardMaterial({color:0xa0a99b,metalness:.55,roughness:.5});
  const brass=new THREE.MeshStandardMaterial({color:0xc6a45c,metalness:.6,roughness:.4});
  const glow=new THREE.MeshStandardMaterial({color:0x67cfd0,emissive:0x368e99,emissiveIntensity:.65,metalness:.4,roughness:.4});
  function box(w,h,d,x,y,z,mat=steel){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
  function cyl(r,h,x,y,z,mat=edge){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,8),mat);m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;}
  return {steel,edge,brass,glow,box,cyl};
}
function makeHeroTankModel(){
  const g=new THREE.Group();g.name='赤金英雄坦克';const k=heroModelKit(g);
  const red=new THREE.MeshStandardMaterial({color:0xb62632,emissive:0x68121a,emissiveIntensity:.22,metalness:.5,roughness:.32});
  const gold=new THREE.MeshStandardMaterial({color:0xe2ba67,emissive:0x604719,emissiveIntensity:.1,metalness:.6,roughness:.32});
  const dark=new THREE.MeshStandardMaterial({color:0x172027,metalness:.6,roughness:.5});
  function stage(name,index){const part=new THREE.Group();part.name=name;part.userData.assemblyStage=index;g.add(part);return part;}
  function plate(part,w,h,d,x,y,z,mat,bevel=true){const m=new THREE.Mesh(bevel?chamferedBox(w,h,d):new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);part.add(m);return m;}
  function wheel(part,r,length,x,y,z,mat){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,16),mat);m.position.set(x,y,z);part.add(m);return m;}
  function assembly(parent,name,order){const group=new THREE.Group();group.name=name;group.userData.assemblyOrder=order;parent.add(group);return group;}
  const chassis=stage('承力底盘',0);chassis.userData.assemblyOrder=0;plate(chassis,1.9,.36,3.25,0,.62,0,dark);plate(chassis,1.5,.12,2.6,0,.83,0,gold);
  const trackStage=stage('独立履带总成',1);for(const side of [-1,1]){
    const tracks=assembly(trackStage,side<0?'左履带':'右履带',side<0?1:2);
    plate(tracks,.62,.66,3.5,side*1.16,.4,0,dark);
    for(let i=0;i<6;i++){const w=wheel(tracks,.245,.67,side*1.16,.38,-1.3+i*.52,k.edge);w.rotation.z=Math.PI/2;const cap=wheel(tracks,.11,.69,side*1.16,.38,-1.3+i*.52,gold);cap.rotation.z=Math.PI/2;}
    for(let i=0;i<14;i++)plate(tracks,.67,.065,.12,side*1.16,.75,-1.56+i*.24,k.steel,false);
  }
  const armorStage=stage('赤红复合装甲',2),armor=assembly(armorStage,'承力上装甲',3);plate(armor,1.85,.48,2.9,0,1.08,0,red);const nose=plate(armor,1.72,.2,1.18,0,1.22,-1.26,gold);nose.rotation.x=-.28;
  for(const side of [-1,1]){
    const armor=assembly(armorStage,side<0?'左侧装甲':'右侧装甲',side<0?4:5);
    plate(armor,.78,.16,3.55,side*1.15,.91,0,red);
    for(let i=0;i<3;i++){plate(armor,.16,.42,.91,side*1.51,.67,-1+i*.97,red);plate(armor,.18,.06,.55,side*1.53,.79,-1+i*.97,gold,false);}
    plate(armor,.23,.1,.08,side*.66,1.3,-1.77,k.glow);
    for(let i=0;i<5;i++)plate(armor,.5,.06,.06,side*.45,1.36,.75+i*.14,dark,false);
  }
  const turret=stage('主炮与炮塔',3);turret.position.y=1.48;turret.userData.assemblyOrder=8;
  plate(turret,1.85,.24,1.85,0,.03,0,dark);plate(turret,1.64,.52,1.65,0,.28,0,red);const crown=wheel(turret,.62,.12,0,.57,0,gold);crown.scale.z=1.1;
  for(const side of [-1,1])plate(turret,.18,.25,1.16,side*.86,.32,0,gold);
  plate(turret,.54,.42,.52,0,.28,-.97,gold);plate(turret,.24,.23,1.85,0,.28,-1.98,red);plate(turret,.3,.27,.52,0,.28,-1.75,gold);plate(turret,.33,.29,.25,0,.28,-2.94,dark);
  const systemsStage=stage('反应堆与火控',4),systems=assembly(systemsStage,'反应堆核心',9);const ring=new THREE.Mesh(new THREE.TorusGeometry(.27,.065,8,24),gold);ring.rotation.x=-Math.PI/2;ring.position.set(0,2.18,0);systems.add(ring);wheel(systems,.2,.035,0,2.185,0,k.glow);
  for(const side of [-1,1]){const systems=assembly(systemsStage,side<0?'左能源组':'右能源组',side<0?6:7);plate(systems,.08,.06,1.1,side*.86,1.34,-.25,k.glow,false);const exhaust=wheel(systems,.19,.36,side*.58,1.16,1.62,gold);exhaust.rotation.x=Math.PI/2;const core=wheel(systems,.12,.025,side*.58,1.16,1.82,k.glow);core.rotation.x=Math.PI/2;}
  g.traverse(part=>{if(Number.isInteger(part.userData.assemblyOrder))mergeDirectMeshesByMaterial(part);});
  const muzzle=new THREE.Object3D();muzzle.position.set(0,.28,-3.1);turret.add(muzzle);turret.userData.muzzleMarker=muzzle;g.userData.turret=turret;
  g.scale.setScalar(SurvivalSystem.FRIENDLY_UNIT_TYPES.hero.scale);g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return g;
}
function makeHeroHubModel(){
  const g=new THREE.Group();g.name='英雄枢纽';g.userData.handcraftedKind='heroHub';const k=heroModelKit(g);
  k.steel.color.setHex(0x202a31);k.edge.color.setHex(0x83949e);k.brass.color.setHex(0xc9a86a);k.glow.emissiveIntensity=1.2;
  const disk=(r,h,y,mat)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,48),mat);m.position.y=y;g.add(m);return m;};
  disk(3.85,.22,.13,k.steel);disk(3.55,.16,.31,k.edge);disk(3.35,.13,.45,k.steel);
  for(const radius of [2.9,3.53]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.045,6,64),k.edge);ring.rotation.x=-Math.PI/2;ring.position.y=.54;g.add(ring);}
  k.box(3.35,.16,4.7,0,.58,0,k.steel);
  for(const side of [-1,1]){
    k.box(.16,.12,4.65,side*1.57,.72,0,k.edge);k.box(.045,.035,4.45,side*1.43,.73,0,k.glow);
    k.cyl(.52,.38,side*2.8,.68,-3,k.steel);k.cyl(.38,.12,side*2.8,.92,-3,k.brass);
    const column=k.box(.22,2.8,.26,side*3.05,2.12,-3.2,k.edge);column.rotation.z=side*.08;
    k.box(.6,.2,1.5,side*2.8,3.45,-3.2,k.steel);k.box(.44,.055,1.2,side*2.8,3.32,-3.2,k.glow);

  }
  for(const angle of [0,Math.PI/2,-Math.PI/2]){const ramp=new THREE.Group();ramp.rotation.y=angle;const kit=heroModelKit(ramp);const deck=kit.box(2.8,.1,1.5,0,.24,3.65,kit.edge);deck.rotation.x=.31;g.add(ramp);}
  k.box(2.1,.75,.7,0,.95,-2.7,k.steel);const screen=k.box(1.55,.48,.08,0,1.48,-2.47,k.glow);screen.rotation.x=-.25;
  for(let i=0;i<5;i++)k.box(.18,.07,.04,-.5+i*.25,1.08,-2.32,k.brass);
  for(let i=0;i<12;i++){const angle=i*Math.PI/6;const lamp=k.box(.3,.045,.075,Math.sin(angle)*3.65,.27,Math.cos(angle)*3.65,k.glow);lamp.rotation.y=angle;}
  mergeBuildingSurfaces(g);return g;
}
function rebuildHeroModules(unit,skills=heroArchive().skills){
  const signature=Object.values(skills).map(l=>l?1+Math.floor(l/10):0).join(',');
  if(unit._moduleSignature===signature)return;unit._moduleSignature=signature;
  const mount=unit.group.userData.turret||unit.group;const old=mount.getObjectByName('英雄武器模组');if(old){mount.remove(old);disposeTransientObject3D(old);}
  const root=new THREE.Group();root.name='英雄武器模组';buildHeroModuleDetails(root,skills);
  mergeBuildingSurfaces(root);root.position.y=-1.5;mount.add(root);
}

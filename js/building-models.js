function makeFortificationWall(cx,cz,level){
  const canyon=ACTIVE_MODE.canyon;
  const root=new THREE.Group(),center=cellCenter(cx,cz),inValley=canyon&&cx>=canyon.x0&&cx<=canyon.x1&&cz>=canyon.z0&&cz<=canyon.z1;
  let north=TILE*.5,south=TILE*.5;
  if(inValley){
    const extent=sign=>{for(let d=TILE*.5;d<TILE*2;d+=.1)if(heightAt(center.x,center.z+sign*d)>=PH-.03)return d+.35;return TILE*.6;};
    north=extent(-1);south=extent(1);
  }
  const floor=inValley?Math.max(0,heightAt(center.x-.45,center.z)-.5):heightAt(center.x,center.z);
  const height=inValley?Math.max(.65,PH-floor-.07):1.8;
  root.position.set(center.x,floor,center.z);
  const stone=new THREE.MeshStandardMaterial({color:0x92958e,roughness:.94,metalness:.05});
  const steel=new THREE.MeshStandardMaterial({color:0x465661,roughness:.6,metalness:.65});
  const inset=new THREE.MeshStandardMaterial({color:0x202d34,roughness:.74,metalness:.4});
  const brass=new THREE.MeshStandardMaterial({color:0xb59b53,roughness:.65,metalness:.45});
  const lamp=new THREE.MeshStandardMaterial({color:0xffd996,emissive:0xffb647,emissiveIntensity:1.3,roughness:.4});
  const add=(w,h,d,x,y,z,material)=>{const m=new THREE.Mesh(chamferedBox(w,h,d),material);m.position.set(x,y,z);root.add(m);};
  const span=north+south,mid=(south-north)/2;
  const pier=.94,opening=span-pier*2,doorHeight=height*.78;
  // 两端承重墩伸进山体，门体后缩，形成完整的堡垒式封口。
  for(const z of [-north+pier*.5,south-pier*.5]){
    add(1.85,height,pier,0,height*.5,z,stone);
    add(2.05,.16,pier+.18,0,height-.08,z,stone);
    add(2.1,.2,pier+.22,0,.1,z,inset);
    add(.12,height*.55,pier*.52,1.0,height*.48,z,steel);
    add(.15,.13,.3,1.075,height*.78,z,inset);
    add(.04,.065,.19,1.16,height*.78,z,lamp);
    for(const y of [.35,height*.62])add(.08,.045,pier*.7,.96,y,z,inset);
  }
  add(1.22,.22,opening+.2,-.1,.11,mid,stone);
  add(.86,doorHeight,opening,-.15,doorHeight*.5+.12,mid,inset);
  for(const side of [-1,1]){
    const z=mid+side*opening*.25,panel=opening*.5-.09;
    add(.22,doorHeight-.16,panel,.36,doorHeight*.5+.12,z,steel);
    add(.16,.12,panel-.16,.54,doorHeight*.37,z,brass);
    add(.12,.1,panel-.16,.52,doorHeight*.75,z,inset);
    for(const dz of [-panel*.38,panel*.38]){
      add(.12,doorHeight*.7,.1,.51,doorHeight*.5+.13,z+dz,inset);
      for(const y of [.33,doorHeight*.77])add(.08,.065,.065,.6,y,z+dz,brass);
    }
    add(.09,.24,.08,.62,doorHeight*.53,z-side*panel*.35,brass);
  }
  add(1.45,.2,opening+.22,-.15,height-.18,mid,steel);
  for(const side of [-1,1]){
    const z=mid+side*opening*.25;
    add(.86,.1,opening*.5-.15,-.08,height-.13,z,stone);
    add(.06,.035,opening*.5-.3,.4,height-.065,z,brass);
    add(.24,.09,.38,-.1,height-.04,z,inset);
    for(const dz of [-.16,.16])add(.15,.02,.03,-.1,height+.01,z+dz,brass);
    const ram=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,opening*.38,8),inset);
    ram.rotation.x=Math.PI/2;ram.position.set(-.63,height-.07,z);root.add(ram);
  }
  for(let i=-2;i<=2;i++)add(.05,.12,.14,.5,.25,mid+i*.26,brass);
  mergeBuildingSurfaces(root); // 合并后恢复本地坐标，避免根节点平移重复应用。
  for(const m of root.children)m.geometry.translate(-center.x,-floor,-center.z);
  root.userData.assetName='handcrafted-cliff-wall';root.userData.wallVisual='cliff-bulkhead';root.userData.reinforcementLevel=level;
  root.userData.wallCell={x:cx,z:cz};root.userData.wallTop=floor+height;root.userData.wallSpan=span;
  return root;
}
function makeGoldmineVisual(){
const g=new THREE.Group(),visualRoot=new THREE.Group();g.add(visualRoot);
    /* 生存金矿：只保留工业套装矿井本体；收益由头顶飘字表达。 */
    let baseM=null;
    if(ACTIVE_MODE.key==="survival"&&ASSETS["industrial-building-s"]){
      baseM=placeModel(visualRoot,"industrial-building-s",0,0,TILE*.78,-Math.PI/2,0,0xffffff,2.4,2.45);
      if(baseM){baseM.position.y=0;baseM.scale.x*=.46;applyGoldMinePalette(baseM);}
    }else{
      const base=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.5,.6,8),
        new THREE.MeshStandardMaterial({color:0x3a4a60,roughness:.7,metalness:.3}));
      base.position.y=.3;visualRoot.add(base);
    }

g.userData.visualRoot=visualRoot;finishIndustrialFacade(g,"goldmine");return g;
}

function makeHouseVisual(){
const g=new THREE.Group();
      /* 人口房：与基地、研究院、重工厂共享工业建筑语言。 */
      if(ACTIVE_MODE.key==="survival"&&ASSETS["industrial-building-i"]){
        const body=placeModel(g,"industrial-building-i",0,0,TILE*.72,-Math.PI/2,0,0xffffff,2.8,2.8);
        if(body)body.position.y=0;
      }else{
        const body=new THREE.Mesh(new THREE.BoxGeometry(2.8,2,2.8),
          new THREE.MeshStandardMaterial({color:0x8a6b4f,roughness:.85}));
        body.position.y=1;g.add(body);
        const roof=new THREE.Mesh(new THREE.ConeGeometry(2.2,1.4,4),
          new THREE.MeshStandardMaterial({color:0xb04a3a,roughness:.7}));
        roof.position.y=2.7;roof.rotation.y=Math.PI/4;g.add(roof);
      }
      addWarmWindow(g,-.48,.95,TILE*.37,.42,.34,.08);
      addWarmWindow(g,.48,.95,TILE*.37,.42,.34,.08);

finishIndustrialFacade(g,"house");return g;
}

function makeBeaconVisual(){
const g=new THREE.Group();g.userData.assetName="medical-watch-beacon";
      const frame=new THREE.Group();g.add(frame);
      const steel=new THREE.MeshStandardMaterial({color:0x52636a,roughness:.65,metalness:.5});
      const dark=new THREE.MeshStandardMaterial({color:0x29383c,roughness:.8,metalness:.35});
      const add=(geometry,y,material)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;frame.add(mesh);return mesh;};
      add(new THREE.CylinderGeometry(.86,1.08,.3,12),.15,dark);
      add(new THREE.CylinderGeometry(.32,.54,3.65,12),2.1,steel);
      for(const y of [.65,1.85,3.25])add(new THREE.CylinderGeometry(y<1?.58:.4,y<1?.58:.4,.1,12),y,dark);
      for(let i=0;i<4;i++){
        const angle=i*Math.PI/2,brace=new THREE.Mesh(new THREE.CylinderGeometry(.055,.085,3.25,6),dark);
        brace.position.set(Math.cos(angle)*.48,1.85,Math.sin(angle)*.48);frame.add(brace);
      }
      const ladder=new THREE.Mesh(new THREE.BoxGeometry(.34,3.5,.08),dark);ladder.position.set(0,2,.52);frame.add(ladder);
      for(let i=0;i<11;i++){const rung=new THREE.Mesh(new THREE.BoxGeometry(.42,.045,.12),steel);rung.position.set(0,.45+i*.3,.58);frame.add(rung);}
      add(new THREE.CylinderGeometry(.78,.58,.24,12),4.22,dark);
      // 灯塔在施工完成时可能临场生成；保留少量独立部件，避免同步合并几十个几何体造成长帧。
      frame.traverse((object)=>{if(object.isMesh){object.castShadow=false;object.receiveShadow=true;}});
      const lantern=new THREE.Mesh(new THREE.CylinderGeometry(.36,.44,.78,10),warmEmissiveMaterial(0xffc56a,2.25));
      lantern.position.y=4.78;lantern.userData.nightGlow=true;g.add(lantern);
      const cap=new THREE.Mesh(new THREE.ConeGeometry(.72,.55,8),new THREE.MeshStandardMaterial({color:0x252b30,roughness:.68,metalness:.42}));
      cap.position.y=5.43;g.add(cap);
      const railMaterial=new THREE.MeshStandardMaterial({color:0x2b3033,roughness:.62,metalness:.55});
      for(let index=0;index<8;index++){
        const angle=index*Math.PI/4,rail=new THREE.Mesh(new THREE.BoxGeometry(.07,.62,.07),railMaterial);
        rail.position.set(Math.cos(angle)*.7,4.72,Math.sin(angle)*.7);g.add(rail);
      }
      const pool=new THREE.Mesh(new THREE.CircleGeometry(1.35,24),makeLightPoolMaterial());pool.rotation.x=-Math.PI/2;pool.position.y=.06;pool.renderOrder=3;pool.raycast=()=>{};g.add(pool);

g.userData.lantern=lantern;g.userData.pool=pool;return g;
}

/* 本项目独立制作的军用建筑，静态面按材质合并以控制绘制次数。 */
function mergeBuildingSurfaces(root){
  root.updateMatrixWorld(true);const groups=new Map();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const key=mesh.material.uuid;
    if(!groups.has(key))groups.set(key,{material:mesh.material,positions:[],normals:[]});
    const item=groups.get(key),geometry=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone());
    geometry.applyMatrix4(mesh.matrixWorld);
    item.positions.push(...geometry.attributes.position.array);item.normals.push(...geometry.attributes.normal.array);geometry.dispose();mesh.geometry.dispose();
  });
  root.clear();
  for(const item of groups.values()){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(item.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(item.normals,3));geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,item.material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
}
function chamferedBox(w,h,d){
  const bevel=Math.min(.09,w*.12,h*.12,d*.12),shape=new THREE.Shape();
  shape.moveTo(-w/2+bevel,-h/2+bevel);shape.lineTo(w/2-bevel,-h/2+bevel);
  shape.lineTo(w/2-bevel,h/2-bevel);shape.lineTo(-w/2+bevel,h/2-bevel);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:d-2*bevel,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:1});
  geometry.translate(0,0,-d/2+bevel);return geometry;
}
function makeBuildingModel(kind){
  if(kind==='house')return makeHouseVisual();if(kind==='goldmine')return makeGoldmineVisual();if(kind==='beacon')return makeBeaconVisual();
  const root=new THREE.Group();root.name={base:'自建主基地',research:'自建研究院',factory:'自建重工厂'}[kind];root.userData.handcraftedKind=kind;
  const mat=(color,metalness=.2,roughness=.72)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const concrete=mat(0x8a918b,.08,.92),armor=mat(0x394953,.55),edge=mat(0xadb6b7,.55,.48),dark=mat(0x19262c,.45),brass=mat(0xc39948,.5),glass=mat(0x507d8c,.5,.32);
  const add=(geo,x,y,z,m)=>{const mesh=new THREE.Mesh(geo,m);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
  const box=(w,h,d,x,y,z,m)=>add(chamferedBox(w,h,d),x,y,z,m);
  const cylinder=(r,h,x,y,z,m,n=12)=>add(new THREE.CylinderGeometry(r,r,h,n),x,y,z,m);
  const vent=(x,y,z)=>{box(1.0,.35,.8,x,y,z,dark);for(let i=0;i<5;i++)box(.1,.1,.72,x-.38+i*.19,y+.22,z,edge);};
  const door=(x,z,w=2)=>{box(w,2.15,.12,x,1.5,z,dark);for(let i=0;i<7;i++)box(w-.1,.14,.15,x,.55+i*.29,z+.05,armor);box(w+.3,.15,.4,x,2.7,z+.12,brass);};
  box(7.2,.38,6.5,0,.19,0,concrete);
  if(kind==='base'){
    box(5.8,2.2,4.9,0,1.48,-.25,armor);
    for(const x of [-2.9,2.9])for(const z of [-2.25,2.25]){box(.68,2.65,.72,x,1.66,z,concrete);box(.82,.18,.88,x,3.08,z,edge);}
    box(4.4,1.55,3.25,-.3,3.35,-.45,concrete);
    box(4.5,.64,.08,-.3,3.65,1.2,glass);box(.08,.64,3.1,1.94,3.65,-.4,glass);
    for(let i=0;i<6;i++)box(.07,.7,.12,-2.4+i*.8,3.65,1.25,edge);
    box(4.8,.22,3.65,-.3,4.23,-.45,armor);box(1.0,.1,1.0,-.3,4.4,-.45,brass);
    box(.18,2.1,2.15,3.02,1.46,.1,dark);for(let i=0;i<7;i++)box(.22,.13,1.95,3.12,.62+i*.27,.1,edge);
    box(.65,.18,2.65,3.1,2.68,.1,brass);box(.72,.18,2.65,3.15,.48,.1,concrete);
    vent(-1.7,4.48,-.85);cylinder(.08,2.0,1.35,5.25,-1.15,edge,8);
    const dish=add(new THREE.SphereGeometry(.72,12,6,0,Math.PI*2,0,Math.PI*.48),1.35,6.1,-1.15,armor);dish.rotation.z=-.65;
    cylinder(.08,.9,1.35,6.25,-1.15,brass,8);
  }else if(kind==='research'){
    box(6.4,2.35,4.8,0,1.55,0,concrete);
    for(const x of [-2.25,2.25]){box(1.4,1.4,4.95,x,3.25,0,armor);box(1.25,.45,.1,x,3.55,2.5,glass);vent(x,4.12,-1.45);}
    cylinder(1.58,1.4,0,3.45,-.3,armor,12);cylinder(1.76,.18,0,4.16,-.3,edge,12);
    add(new THREE.SphereGeometry(1.48,16,10,0,Math.PI*2,0,Math.PI/2),0,4.24,-.3,glass);
    for(const angle of [0,Math.PI/2]){const ring=add(new THREE.TorusGeometry(1.51,.065,5,24,Math.PI),0,4.24,-.3,brass);ring.rotation.y=angle;}
    door(0,2.46,1.7);for(const x of [-2.4,2.4])box(1.1,.58,.08,x,1.95,2.46,glass);
    cylinder(.055,1.25,-2.6,4.6,-1.8,edge,8);cylinder(.16,.14,-2.6,5.22,-1.8,brass,8);
  }else if(kind==='factory'){
    box(6.6,2.95,5.7,0,1.9,0,armor);
    for(const x of [-2.2,0,2.2]){
      const shape=new THREE.Shape();shape.moveTo(-1.1,0);shape.lineTo(1.1,0);shape.lineTo(1.1,.25);shape.lineTo(-1.1,1.0);shape.closePath();
      add(new THREE.ExtrudeGeometry(shape,{depth:5.85,bevelEnabled:false}),x,3.38,-2.925,edge);
      box(.08,.5,5.5,x-1.1,3.95,0,glass);
    }
    door(-1.68,2.9,2.5);door(1.68,2.9,2.5);
    box(6.8,.22,.9,0,3.0,3.0,dark);
    for(const x of [-3.1,-.2,.2,3.1]){box(.13,2.45,.17,x,1.6,3.02,brass);for(let i=0;i<4;i++)box(.16,.12,.2,x,.8+i*.48,3.04,dark);}
    for(const z of [-1.65,-.5]){cylinder(.23,3.5,-3,4.0,z,dark);cylinder(.34,.18,-3,5.73,z,edge);}
    vent(2.15,4.5,-1.7);
  }
  // 接缝、门灯、铆钉与侧面通风板使用既有材质合批，细化不增加材质批次。
  for(const side of [-1,1]){
    for(let i=0;i<5;i++){
      box(.1,1.35,.1,side*3.24,1.45,-2+i*.85,edge);
      box(.13,.13,.13,side*3.3,2.3,-2+i*.85,brass);
    }
    for(let i=0;i<6;i++)box(.1,.08,1.2,side*3.31,.75+i*.19,-.5,dark);
  }
  for(const x of [-2.7,2.7]){box(.42,.26,.28,x,2.8,2.95,dark);box(.31,.12,.04,x,2.78,3.11,brass);}
  mergeBuildingSurfaces(root);return root;
}
function makeConstructionPreview(job){
  let model;
  if(job.build.kind==='wall'){
    const holder=new THREE.Group();model=buildWallTile(holder,job.anchor.x,job.anchor.z,1);
    holder.remove(model);const center=footprintCenter(job.anchor,job.build);model.position.sub(new THREE.Vector3(center.x,heightAt(center.x,center.z),center.z));
    const health=model.getObjectByName('damage-health-bar');if(health){model.remove(health);disposeTransientObject3D(health);}
  }else if(job.build.kind==='turret')model=makeTurretMesh(job.build.turret||'turret');
  else model=makeBuildingModel(job.build.id);
  model.visible=false;
  model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);
  job.previewBottom=bounds.min.y;job.previewHeight=Math.max(.1,bounds.max.y-bounds.min.y);
  job.clipPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),0);
  model.traverse(object=>{if(!object.isMesh)return;const clone=source=>{const m=source.clone();m.clippingPlanes=[job.clipPlane];m.clipShadows=true;return m;};object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);});
  return model;
}
function updateConstructionStage(job){
  job.stage=Math.min(3,Math.max(0,Math.floor(job.elapsed/job.duration*3)));
  job.preview.visible=job.stage>0;
  job.clipPlane.constant=job.site.position.y+job.previewBottom+job.previewHeight*job.stage/3;
}
function aimTurretAt(group,target,dt){
  const yaw=group.userData.turret,pitch=yaw?.userData.pitchPivot;if(!yaw||!pitch)return;
  const pivot=pitch.getWorldPosition(new THREE.Vector3()),dx=target.x-pivot.x,dz=target.z-pivot.z;
  const turn=Math.min(1,dt*7);
  yaw.rotation.y+=shortAngle(Math.atan2(dx,dz)-yaw.rotation.y)*turn;
  // 炮口位于俯仰轴前方，轴到目标和炮口到目标具有同一直线。
  pitch.rotation.x+=(-Math.atan2(target.y-pivot.y,Math.hypot(dx,dz))-pitch.rotation.x)*turn;
  const muzzle=yaw.userData.muzzleMarker.getWorldPosition(new THREE.Vector3());
  const forward=pitch.getWorldDirection(new THREE.Vector3());
  yaw.userData.aimReady=forward.dot(target.clone().sub(muzzle).normalize())>.995;
}

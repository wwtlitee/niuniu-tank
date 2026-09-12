/* Kenney 成品巨物；动画共享比赛时间，模型文件保持原样。 */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory;
 else root.RacingSpectacle=factory(root.THREE,root.RacingRules);
})(typeof window==='object'?window:globalThis,function(T,R){
 'use strict';
 const CATALOG={cow:'pets/animal-cow.glb',flagship:'space/craft_cargoB.glb',escort:'space/craft_speederD.glb',sentinel:'space/astronautB.glb',dish:'space/satelliteDish_detailed.glb',burger:'food/burger-cheese-double.glb',donut:'food/donut-sprinkles.glb'};
 const sites=[{id:'cow',s:160,radius:94,title:'01 / 巨兽牧场'},
  {id:'fleet',s:410,radius:60,title:'02 / 低空舰队'},
  {id:'sentinel',s:650,radius:75,title:'03 / 巨人观察站'},
  {id:'burger',s:820,radius:65,title:'04 / 谁的午餐？'},
  {id:'dish',s:1040,radius:85,title:'05 / 深空监听站'}].map(v=>({...v,...R.sample(v.s)}));
 function reserved(x,z,padding=0){return sites.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+padding);}
 function timeline(time){const t=Number.isFinite(time)?Math.max(0,time):0;return {cowX:Math.sin(t*.045)*12,fleetAngle:t*.024,dishAngle:Math.sin(t*.04)*.28,headAngle:Math.sin(t*.065)*.18};}
 function normalize(object,size){object.updateMatrixWorld(true);const box=new T.Box3().setFromObject(object),dimensions=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),extent=Math.max(dimensions.x,dimensions.y,dimensions.z);if(!Number.isFinite(extent)||extent<=0)throw new Error('巨物模型尺寸无效');object.position.sub(new T.Vector3(center.x,box.min.y,center.z));const group=new T.Group();group.add(object);group.scale.setScalar(size/extent);return group;}
 // Quantized attributes must become floats before CPU transforms. Integer writes
 // otherwise overflow positions and truncate normals; WebGL normally decodes them.
 function floatGeometry(source){
  const g=source.clone();
  for(const name of ['position','normal','color','uv']){
   const a=g.attributes[name];if(!a)continue;
   const storage=a.array||a.data?.array,kind=storage.constructor.name;
   const divisor=a.normalized?({Int8Array:127,Uint8Array:255,Int16Array:32767,Uint16Array:65535,Int32Array:2147483647,Uint32Array:4294967295}[kind]||1):1;
   const values=new Float32Array(a.count*a.itemSize),get=['getX','getY','getZ','getW'];
   for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)values[i*a.itemSize+j]=Math.max(a.normalized?-1:-Infinity,a[get[j]](i)/divisor);
   g.setAttribute(name,new T.BufferAttribute(values,a.itemSize));
  }
  // This bundled Three.js cannot deindex interleaved buffers correctly. Expand
  // via accessors first, preserving byte stride/offset, then remove the index.
  if(g.index){const expanded=g.toNonIndexed();g.dispose();return expanded;}
  return g;
 }
 // 静态素材合并为一个绘制批次；保留原色与原始贴图 UV。
 function bakeStatic(object){
  object.updateMatrixWorld(true);const parts=[],maps=new Set();object.traverse(o=>{if(o.isMesh){if(o.isSkinnedMesh)throw new Error('静态合批不能用于骨骼模型');const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{if(m.map)maps.add(m.map);});parts.push({o,materials});}});
  if(maps.size>1)return object;
  const positions=[],normals=[],colors=[],uvs=[];
  for(const {o,materials} of parts){const g=floatGeometry(o.geometry).applyMatrix4(o.matrixWorld),a=g.attributes;
   for(let i=0;i<a.position.count;i++){const group=g.groups.find(v=>i>=v.start&&i<v.start+v.count),m=materials[group?.materialIndex||0]||materials[0],c=m.color||new T.Color(1,1,1);positions.push(a.position.getX(i),a.position.getY(i),a.position.getZ(i));normals.push(a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i));colors.push(c.r*(a.color?a.color.getX(i):1),c.g*(a.color?a.color.getY(i):1),c.b*(a.color?a.color.getZ(i):1));uvs.push(a.uv?a.uv.getX(i):0,a.uv?a.uv.getY(i):0);}g.dispose();
  }
  const geometry=new T.BufferGeometry();for(const [name,values,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['uv',uvs,2]])geometry.setAttribute(name,new T.Float32BufferAttribute(values,size));geometry.computeBoundingSphere();return new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,map:[...maps][0]||null,roughness:.66,metalness:.14}));
 }
 async function create(scene){
  const loader=new T.GLTFLoader(),assets={},roots=[],resources={geometries:new Set(),materials:new Set(),textures:new Set()},failures=[];
  function track(object){object.traverse(o=>{if(!o.isMesh)return;resources.geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.materials.add(m);for(const value of Object.values(m))if(value?.isTexture)resources.textures.add(value);}o.castShadow=true;o.receiveShadow=true;});}
  const outcomes=await Promise.allSettled(Object.entries(CATALOG).map(async([key,path])=>{const gltf=await new Promise((resolve,reject)=>loader.load('assets/racing-kenney/'+path,resolve,undefined,reject));assets[key]=gltf;track(gltf.scene);}));
  outcomes.forEach(v=>{if(v.status==='rejected')failures.push(v.reason);});
  function dispose(){for(const root of roots)scene.remove(root);for(const g of resources.geometries)g.dispose();for(const m of resources.materials)m.dispose();for(const t of resources.textures)t.dispose();}
  if(failures.length){dispose();throw new Error('Kenney 模型加载失败，请刷新重试');}
  function siteRoot(id){const p=sites.find(v=>v.id===id),g=new T.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=p.heading;scene.add(g);roots.push(g);return g;}
  function model(key,size){const object=key==='cow'?assets[key].scene:bakeStatic(assets[key].scene);track(object);const g=normalize(object,size);g.userData.asset=CATALOG[key];return g;}
  const pasture=siteRoot('cow'),cow=model('cow',80);cow.rotation.y=Math.PI*.62;pasture.add(cow);
  const mixer=new T.AnimationMixer(assets.cow.scene),walk=T.AnimationClip.findByName(assets.cow.animations,'walk');if(!walk){dispose();throw new Error('奶牛原生行走动画缺失');}mixer.clipAction(walk).play();
  const fleet=siteRoot('fleet'),flagship=model('flagship',170),escortBase=model('escort',29),ships=[flagship];fleet.add(flagship);
  for(let i=0;i<7;i++){const ship=escortBase.clone(true);fleet.add(ship);ships.push(ship);}
  const lookout=siteRoot('sentinel'),sentinel=model('sentinel',108);sentinel.position.x=52;sentinel.rotation.y=-Math.PI*.65;lookout.add(sentinel);
  const lunch=siteRoot('burger'),burger=model('burger',80),donut=model('donut',70);burger.position.set(57,0,0);lunch.add(burger);donut.position.set(-35,58,20);donut.rotation.x=Math.PI/2;lunch.add(donut);
  const observatory=siteRoot('dish'),dish=model('dish',110);dish.position.x=65;observatory.add(dish);
  function update(time,viewer){const t=Number.isFinite(time)?Math.max(0,time):0,state=timeline(t);mixer.setTime(t*.62);cow.position.x=state.cowX;
   ships.forEach((ship,i)=>{ship.position.set(Math.sin(state.fleetAngle)*145+(i===0?0:((i-1)%3-1)*30),i===0?125:48+Math.floor((i-1)/3)*9,70+(i===0?65:Math.floor((i-1)/3)*28));ship.rotation.y=-state.fleetAngle;ship.rotation.z=Math.sin(state.fleetAngle)*.04;});
   sentinel.rotation.y=-Math.PI*.65+state.headAngle;dish.rotation.y=state.dishAngle;donut.rotation.y=t*.035;
   let near=null,distance=130;for(const site of sites){const d=Math.hypot(viewer.x-site.x,viewer.z-site.z);if(d<distance){distance=d;near=site;}}
   return {site:near?.id||null,title:near?.title||'',cowX:state.cowX,objects:5,ships:8,source:'Kenney',loaded:Object.keys(assets).length,cowAnimation:'walk'};
  }
  return {update,sites,dispose(){mixer.stopAllAction();mixer.uncacheRoot(assets.cow.scene);dispose();}};
 }
 return {CATALOG,create,timeline,reserved,sites,bakeStatic};
});

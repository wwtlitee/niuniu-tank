/* Kenney city circuit: authored road surfaces warped along the shared racing route. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.RacingCity=factory(root.THREE,root.RacingRules,root.RacingSpectacle,root.RacingModels);})(typeof window==='object'?window:globalThis,function(T,R,S,M){
 'use strict';
 function roadBounds(g){
  g.computeBoundingBox();const a=g.attributes;let lo=Infinity,hi=-Infinity,y=-Infinity;
  for(let i=0;i<a.position.count;i++){const c=a.color;if(c&&Math.abs(c.getX(i)-c.getY(i))<.02&&c.getX(i)<.4){lo=Math.min(lo,a.position.getX(i));hi=Math.max(hi,a.position.getX(i));y=Math.max(y,a.position.getY(i));}}
  if(!(hi>lo)){lo=g.boundingBox.min.x;hi=g.boundingBox.max.x;y=g.boundingBox.max.y;}
  return {lo,hi,y,z0:g.boundingBox.min.z,z1:g.boundingBox.max.z};
 }
 function warpRoad(g,start=0,end=R.track.length){
  const b=roadBounds(g),a=g.attributes,positions=[],colors=[],uvs=[],count=Math.ceil((end-start)/5),tile=(end-start)/count;
  for(let k=0;k<count;k++)for(let i=0;i<a.position.count;i++){
   const along=(a.position.getZ(i)-b.z0)/(b.z1-b.z0),p=R.sample(start+(k+along)*tile),side=(a.position.getX(i)-(b.lo+b.hi)/2)/(b.hi-b.lo)*R.track.width;
   positions.push(p.x+Math.cos(p.heading)*side,p.y+(a.position.getY(i)-b.y)*3,p.z-Math.sin(p.heading)*side);
   colors.push(a.color?.getX(i)??1,a.color?.getY(i)??1,a.color?.getZ(i)??1);uvs.push(a.uv?.getX(i)??0,a.uv?.getY(i)??0);
  }
  const out=new T.BufferGeometry();out.setAttribute('position',new T.Float32BufferAttribute(positions,3));out.setAttribute('color',new T.Float32BufferAttribute(colors,3));out.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));out.computeVertexNormals();out.computeBoundingSphere();return out;
 }
 async function create(scene){
  const manifest=await fetch('assets/racing-city/manifest.json').then(r=>{if(!r.ok)throw new Error('城市素材清单载入失败');return r.json();}),loader=new T.GLTFLoader(),templates=new Map(),root=new T.Group();root.name='Kenney city circuit';
  const outcomes=await Promise.allSettled(manifest.assets.map(async a=>{const asset=await new Promise((resolve,reject)=>loader.load('assets/racing-city/'+a.file,resolve,undefined,reject));const mesh=S.bakeStatic(asset.scene);if(!mesh.isMesh)throw new Error('城市模型无法合批：'+a.key);if(a.key.startsWith('racing-kit/')&&!mesh.material.map){const c=mesh.geometry.attributes.color,color=new T.Color();for(let i=0;i<c.count;i++){color.setRGB(c.getX(i),c.getY(i),c.getZ(i)).convertSRGBToLinear();c.setXYZ(i,color.r,color.g,color.b);}}mesh.geometry.computeBoundingBox();templates.set(a.key,mesh);}));
  if(outcomes.some(r=>r.status==='rejected'))throw new Error('城市模型加载失败，请重新载入');
  const stats={source:'Kenney',loaded:templates.size,roadTiles:0,buildings:0,lamps:0,pillars:0,barriers:0,drawBatches:0};
  function add(mesh){mesh.receiveShadow=true;root.add(mesh);stats.drawBatches++;return mesh;}
  // Keep road top and simulation heights identical. Bridge deck has its own underside.
  const normal=templates.get('racing-kit/roadStraight'),bridge=templates.get('racing-kit/roadStraightBridge');
  const groups=[[],[]];let current=null;
  for(let s=0;s<R.track.length;s+=5){const kind=R.height(s+2.5)>8?1:0;if(!current||current.kind!==kind){current={start:s,end:Math.min(s+5,R.track.length),kind};groups[kind].push(current);}else current.end=Math.min(s+5,R.track.length);}
  for(const [kind,ranges] of groups.entries())for(const range of ranges){const source=kind?bridge:normal,geo=warpRoad(source.geometry,range.start,range.end);const road=add(new T.Mesh(geo,source.material));road.name='Kenney road / '+(kind?'bridge':'street');road.castShadow=!!kind;stats.roadTiles+=Math.ceil((range.end-range.start)/5);}
  const dummy=new T.Object3D();
  function batch(key,records){if(!records.length)return;const source=templates.get(key),mesh=new T.InstancedMesh(source.geometry,source.material,records.length);for(let i=0;i<records.length;i++){const p=records[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.heading||0,0);dummy.scale.set(p.sx||p.scale||1,p.sy||p.scale||1,p.sz||p.scale||1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.name=key;add(mesh);}
  function fit(key,width){const mesh=templates.get(key),b=mesh.geometry.boundingBox,center=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3());mesh.geometry.translate(-center.x,-b.min.y,-center.z);mesh.geometry.computeBoundingBox();return width/Math.max(size.x,size.z);}
  const buildingKeys=[...templates.keys()].filter(k=>k.startsWith('city-kit-commercial/')||k.startsWith('city-kit-industrial/')),buildingRecords=new Map(buildingKeys.map(k=>[k,[]]));
  const plaza=M.builder();
  let seed=931;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const sizes=new Map(buildingKeys.map(k=>[k,fit(k,k.includes('skyscraper')?36:28)]));
  for(let x=-340;x<=420;x+=54)for(let z=-365;z<=365;z+=54){
   const px=x+(random()-.5)*8,pz=z+(random()-.5)*8,q=R.locate(px,pz);if(q.distance<43||q.distance>190)continue;
   const key=buildingKeys[Math.floor(random()*buildingKeys.length)],scale=sizes.get(key),rotation=Math.floor(random()*4)*Math.PI/2;
   buildingRecords.get(key).push({x:px,y:-.35,z:pz,scale,heading:rotation});plaza.box(42,.28,42,0x9aa5a4,px,-.24,pz);stats.buildings++;
  }
  for(const [key,records] of buildingRecords)batch(key,records);
  add(new T.Mesh(plaza.finish(),new T.MeshStandardMaterial({vertexColors:true,roughness:1})));
  const barriers=[],lamps=[],pillars=[],signs=M.builder(),pillarScale=fit('city-kit-roads/bridge-pillar',4),lampScale=fit('city-kit-roads/light-curved',3.3),barrierScale=fit('racing-kit/barrierRed',4.9);
  const pillarBox=templates.get('city-kit-roads/bridge-pillar').geometry.boundingBox,pillarHeight=pillarBox.max.y;
  const shortcut=R.track.shortcut;
  function shortcutClear(x,z){const a=shortcut.a,b=shortcut.b,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a.x-dx*t,z-a.z-dz*t)>8;}
  for(let s=0;s<R.track.length;s+=5){const p=R.sample(s),bend=R.angle(R.sample(s+12).heading-R.sample(s-12).heading);
   const verge=p.y>8?14.2:26.2,lampVerge=verge+3.8;for(const side of [-1,1]){const x=p.x+Math.cos(p.heading)*verge*side,z=p.z-Math.sin(p.heading)*verge*side;
    if(shortcutClear(x,z))barriers.push({x,y:p.y,z,scale:barrierScale,heading:p.heading+Math.PI/2});
    if(Math.floor(s/5)%9===0&&shortcutClear(x,z))lamps.push({x:p.x+Math.cos(p.heading)*lampVerge*side,y:p.y,z:p.z-Math.sin(p.heading)*lampVerge*side,scale:lampScale,heading:p.heading+(side>0?Math.PI/2:-Math.PI/2)});
   }
   if(p.y>9&&Math.floor(s/5)%6===0){for(const side of [-1,1]){const x=p.x+Math.cos(p.heading)*9*side,z=p.z-Math.sin(p.heading)*9*side,below=R.locate(x,z,true,1.2);if(below.distance<18&&R.height(below.s)<5)continue;pillars.push({x,y:-.4,z,sx:pillarScale,sy:(p.y-.9)/pillarHeight,sz:pillarScale,heading:p.heading});}}
   if(Math.abs(bend)>.3&&Math.floor(s/5)%6===0){const side=bend>0?-1:1,x=p.x+Math.cos(p.heading)*(verge+2.8)*side,z=p.z-Math.sin(p.heading)*(verge+2.8)*side;if(shortcutClear(x,z)){signs.box(.22,3,.22,0x424f59,x,p.y+1.5,z);signs.add(new T.BoxGeometry(3,1.5,.15),0xefb83e,x,p.y+3,z,0,p.heading);
     // Two black chevrons on each face remain legible from either approach.
     for(const face of [-1,1])for(const offset of [-.7,.6]){const shape=new T.Shape(),direction=-Math.sign(bend);shape.moveTo(-.42*direction,-.5);shape.lineTo(.04*direction,-.5);shape.lineTo(.58*direction,0);shape.lineTo(.04*direction,.5);shape.lineTo(-.42*direction,.5);shape.lineTo(.12*direction,0);shape.closePath();const geo=new T.ShapeGeometry(shape);geo.translate(offset,0,.09*face);signs.add(geo,0x202b32,x,p.y+3,z,0,p.heading+(face<0?Math.PI:0));}}}
  }
  batch('racing-kit/barrierRed',barriers);batch('city-kit-roads/light-curved',lamps);batch('city-kit-roads/bridge-pillar',pillars);add(new T.Mesh(signs.finish(),new T.MeshStandardMaterial({vertexColors:true})));Object.assign(stats,{barriers:barriers.length,lamps:lamps.length,pillars:pillars.length});
  const pitKeys=['racing-kit/pitsGarage','racing-kit/pitsOffice'];pitKeys.forEach((key,i)=>{const scale=fit(key,22),p=R.sample(-55-i*27);batch(key,[{x:p.x+Math.cos(p.heading)*34,y:p.y,z:p.z-Math.sin(p.heading)*34,scale,heading:p.heading}]);});
  // A Kenney corner and ramp form a closed service access outside the race boundary.
  for(const [i,key] of ['racing-kit/roadCornerLarge','racing-kit/roadRampLong'].entries()){const scale=fit(key,23);batch(key,[{x:390,y:-.3,z:-320+i*26,scale}]);}
  scene.add(root);
  return {stats,root,update(time,viewer){const q=R.locate(viewer.x,viewer.z,true,viewer.y),elevated=R.height(q.s)>9;return {source:'Kenney',loaded:templates.size,site:elevated?'skyway':'city',title:elevated?'02 / 云环高架':'01 / 都市连弯',objects:stats.buildings,ships:0,cowX:0};}};
 }
 return {warpRoad,create};
});

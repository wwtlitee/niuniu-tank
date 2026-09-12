/* 峡谷赛道路肩与赛事设施；仅渲染，沿用规则中心线与捷径。 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.RacingTrack=factory(root.THREE,root.RacingModels,root.RacingRules);})(typeof window==='object'?window:globalThis,function(T,M,R){
 'use strict';
 const shortcut=R.track.shortcut;
 const shortcutDirection={x:(shortcut.b.x-shortcut.a.x)/shortcut.length,z:(shortcut.b.z-shortcut.a.z)/shortcut.length};
 const open=s=>Math.abs(s-shortcut.start)<=25||Math.abs(s-shortcut.end)<=25;
 function offset(s,lateral){const p=R.sample(s);return {...p,x:p.x+Math.cos(p.heading)*lateral,z:p.z-Math.sin(p.heading)*lateral};}
 function clearsShortcut(x,z,padding=0){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(padding))return false;
  const along=Math.max(0,Math.min(shortcut.length,(x-shortcut.a.x)*shortcutDirection.x+(z-shortcut.a.z)*shortcutDirection.z));
  return Math.hypot(x-shortcut.a.x-shortcutDirection.x*along,z-shortcut.a.z-shortcutDirection.z*along)>=shortcut.width/2+Math.max(0,padding);
 }
 function roadside(p,width,length,margin=.3){
  for(const across of [-width/2,0,width/2])for(const along of [-length/2,0,length/2]){
   const x=p.x+Math.cos(p.heading)*across+Math.sin(p.heading)*along,z=p.z-Math.sin(p.heading)*across+Math.cos(p.heading)*along,q=R.locate(x,z);
   if(q.distance<q.width/2+margin||!clearsShortcut(x,z,.6))return false;
  }
  return true;
 }
 function layout(){
  const curbs=[],chevrons=[],reflectors=[],guardrails=[],shortcutMarkers=[];
  for(let s=0;s<R.track.length;s+=3.5){
   if(open(s))continue;
   const bend=R.angle(R.sample(s+16).heading-R.sample(s-16).heading);
   for(const side of [-1,1]){
    if(Math.abs(bend)>.12||s<60||s>R.track.length-70)curbs.push({...offset(s,side*12.25),s,color:Math.floor(s/3.5)%2?0xe5dfc9:0xa84131});
    if(Math.floor(s/3.5)%6===0)reflectors.push({...offset(s,side*14),s});
   }
   if(Math.abs(bend)>.22&&Math.floor(s/3.5)%7===0){const side=bend>0?-1:1;chevrons.push({...offset(s,side*16),s,side});}
   if(Math.abs(bend)>.1&&Math.floor(s/3.5)%2===0){const side=bend>0?-1:1;guardrails.push({...offset(s,side*14.45),s,side,width:.45,length:6.6});}
  }
  const heading=Math.atan2(shortcutDirection.x,shortcutDirection.z);
  for(const t of [.2,.29,.73,.83])for(const side of [-1,1]){
   const s=shortcut.start+(shortcut.end-shortcut.start)*t,p={x:shortcut.a.x+shortcutDirection.x*shortcut.length*t+shortcutDirection.z*side*7.2,z:shortcut.a.z+shortcutDirection.z*shortcut.length*t-shortcutDirection.x*side*7.2,y:R.height(s),heading,s,width:.65,length:1.8,side};
   if(roadside(p,p.width,p.length,.6))shortcutMarkers.push(p);
  }
  return {curbs:curbs.filter(p=>R.locate(p.x,p.z).distance>=11.8&&clearsShortcut(p.x,p.z,2)),chevrons:chevrons.filter(p=>R.locate(p.x,p.z).distance>=15&&roadside(p,2.7,.2)),reflectors:reflectors.filter(p=>roadside(p,.16,.16)),guardrails:guardrails.filter(p=>roadside(p,p.width,p.length)),shortcutMarkers};
 }
 // Subtract the shortcut corridor from each shoulder triangle in the ground plane.
 // Intersections interpolate elevation and colour, keeping the cut edge watertight.
 function outsideShortcut(triangle){
  const along=p=>(p.x-shortcut.a.x)*shortcutDirection.x+(p.z-shortcut.a.z)*shortcutDirection.z;
  const across=p=>(p.x-shortcut.a.x)*shortcutDirection.z-(p.z-shortcut.a.z)*shortcutDirection.x;
  const planes=[p=>along(p)+8,p=>shortcut.length+8-along(p),p=>6.3+across(p),p=>6.3-across(p)];
  const outside=[];let remainder=triangle;
  function split(polygon,distance,positive){
   const result=[];
   for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b),keepA=positive?da>=0:da<=0,keepB=positive?db>=0:db<=0;
    if(keepA)result.push(a);
    if(keepA!==keepB){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,c:a.c+(b.c-a.c)*t});}
   }
   return result;
  }
  for(const plane of planes){
   if(remainder.length<3)break;
   const piece=split(remainder,plane,false);if(piece.length>=3)outside.push(piece);
   remainder=split(remainder,plane,true);
  }
  return outside;
 }
 function shoulderGeometry(){
  const positions=[],indices=[],colors=[],steps=Math.ceil(R.track.length/3);
  let shortcutBankTriangles=0;
  function writeTriangle(triangle){
   const base=positions.length/3;
   for(const p of triangle){positions.push(p.x,p.y,p.z);colors.push(p.c,p.c*.85,p.c*.65);}
   indices.push(base,base+1,base+2);
  }
  function append(triangle){
   for(const polygon of outsideShortcut(triangle))for(let i=1;i<polygon.length-1;i++)writeTriangle([polygon[0],polygon[i],polygon[i+1]]);
  }
  // The road edge falls into compacted gravel and then the canyon floor.
  for(const side of [-1,1]){
   let previous;
   for(let i=0;i<=steps;i++){
    const s=i/steps*R.track.length,p=R.sample(s),row=[[12,p.y-.035,.66],[16,p.y-.2,.59],[26,-.39,.49]].map(([width,y,c])=>({...offset(s,side*width),y,c}));
    if(previous)for(let j=0;j<2;j++){
     const triangles=[[previous[j],row[j],previous[j+1]],[previous[j+1],row[j],row[j+1]]];
     for(const triangle of triangles)append(side>0?triangle:triangle.reverse());
    }
    previous=row;
   }
  }
  // Support the shortcut's existing six-metre half-width shoulder without crossing the main road.
  const shortSteps=Math.ceil(shortcut.length/3);
  for(const side of [-1,1]){
   let previous;
   for(let i=0;i<=shortSteps;i++){
    const t=i/shortSteps,s=shortcut.start+(shortcut.end-shortcut.start)*t,row=[[6,R.height(s)-.17,.59],[10,-.39,.49]].map(([width,y,c])=>({x:shortcut.a.x+shortcutDirection.x*shortcut.length*t+shortcutDirection.z*side*width,z:shortcut.a.z+shortcutDirection.z*shortcut.length*t-shortcutDirection.x*side*width,y,c}));
    if(previous)for(const triangle of [[previous[0],row[0],previous[1]],[previous[1],row[0],row[1]]]){
     const points=[...triangle,...triangle.map((p,j)=>({x:(p.x+triangle[(j+1)%3].x)/2,z:(p.z+triangle[(j+1)%3].z)/2}))];
     if(points.every(p=>{const q=R.locate(p.x,p.z);return q.distance>=q.width/2+1;})){writeTriangle(side>0?triangle:triangle.reverse());shortcutBankTriangles++;}
    }
    previous=row;
   }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.userData.shortcutBankTriangles=shortcutBankTriangles;return g;
 }
 function create(scene){
  const data=layout(),roots=[],steel=new T.MeshStandardMaterial({color:0x47535a,roughness:.65,metalness:.4});
  const shoulder=new T.Mesh(shoulderGeometry(),new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));shoulder.receiveShadow=true;scene.add(shoulder);roots.push(shoulder);
  function batch(geometry,material,records,scale,lift){
   const mesh=new T.InstancedMesh(geometry,material,records.length),dummy=new T.Object3D();
   records.forEach((p,i)=>{dummy.position.set(p.x,p.y+lift,p.z);dummy.rotation.set(0,p.heading,0);dummy.scale.set(...scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(p.color)mesh.setColorAt(i,new T.Color(p.color).convertSRGBToLinear());});
   mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;scene.add(mesh);roots.push(mesh);
  }
  batch(M.bevelBox(1,1,1,.03),new T.MeshStandardMaterial({roughness:.9}),data.curbs,[.95,.16,3.25],.035);
  batch(new T.BoxGeometry(1,1,1),steel,data.reflectors,[.1,1.45,.1],1);
  batch(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:0xffd892}),data.reflectors,[.15,.22,.16],1.7);
  const boards=M.builder();
  for(const p of data.chevrons){
   const b=M.builder();b.box(2.7,1.3,.13,0x202b30,0,1.8,0);
   for(const x of [-.7,.55])for(const sign of [-1,1])b.add(new T.BoxGeometry(.72,.13,.035),0xffd078,x,1.8+sign*.24,.085,0,0,-sign*p.side*.65);
   for(const x of [-1,1])b.box(.1,1.8,.1,0x66716c,x,.9,0);
   boards.add(b.finish(),0xffffff,p.x,p.y,p.z,0,p.heading+Math.PI);
  }
  const mesh=new T.Mesh(boards.finish(),new T.MeshStandardMaterial({vertexColors:true,roughness:.7}));scene.add(mesh);roots.push(mesh);
  // Rails extend the existing concrete barriers upward for a readable chase view.
  const fixtures=M.builder();
  for(const p of data.guardrails){
   const rail=M.builder();
   for(const y of [1.4,1.92])rail.box(.18,.14,p.length,0x8b9896,0,y,0);
   for(const z of [-2.8,2.8]){rail.box(.15,1.9,.15,0x4c5a5e,0,.97,z);rail.box(.36,.2,.23,0xe2be75,0,1.91,z);}
   fixtures.add(rail.finish(),0xffffff,p.x,p.y,p.z,0,p.heading);
  }
  for(const p of data.shortcutMarkers){
   const marker=M.builder();marker.box(.65,.3,1.8,0x394b4c,0,.05,0);marker.box(.2,2.7,.2,0x475b5d,0,1.3,0);marker.box(.4,1.05,.32,0x6cc7bc,0,2.25,0);
   for(const y of [1.93,2.28,2.63])marker.box(.44,.11,.37,0xc7e5d4,0,y,0);
   fixtures.add(marker.finish(),0xffffff,p.x,p.y,p.z,0,p.heading);
  }
  // Recessed signal housings sit below the existing start gantry, above vehicle height.
  const start=R.sample(2),signals=M.builder();signals.box(10,.14,.18,0x596768,0,5.55,-.65);
  for(let i=0;i<5;i++){
   const x=(i-2)*1.65;signals.box(.15,.55,.15,0x73827c,x,5.95,-.65);signals.box(1.05,.8,.55,0x263338,x,5.3,-.65);signals.box(.61,.37,.045,0xffc765,x,5.31,-.95);signals.box(1.12,.08,.74,0x45565b,x,5.72,-.77);
  }
  fixtures.add(signals.finish(),0xffffff,start.x,start.y,start.z,0,start.heading);
  const facilities=new T.Mesh(fixtures.finish(),new T.MeshStandardMaterial({vertexColors:true,roughness:.56,metalness:.32}));facilities.receiveShadow=true;scene.add(facilities);roots.push(facilities);
  // Pit lane machinery and start-grid markings share one static surface.
  const pit=M.builder();
  for(let i=0;i<6;i++){
   const s=R.track.length-8-i*7,p=offset(s,i%2?-5:5),mark=M.builder();
   for(const x of [-1.8,1.8])mark.box(.1,.025,3.5,0xe6ddc8,x,.055,0);mark.box(3.6,.025,.13,0xe6ddc8,0,.055,1.75);
   pit.add(mark.finish(),0xffffff,p.x,p.y,p.z,0,p.heading);
  }
  for(let i=0;i<4;i++){
   const p=offset(R.track.length-40-i*15,22),bay=M.builder();
   bay.box(4,.35,7,0x5f6865,0,0,0);bay.box(3.4,1.4,2.3,0x34424a,0,.85,-2);bay.box(3.5,.2,2.4,0xc1a778,0,1.65,-2);
   for(const x of [-1.45,1.45]){bay.box(.12,3.3,.12,0x85918a,x,1.7,-2);bay.box(.24,.08,1.1,0xffe4ac,x,3.35,-1.65);}
   pit.add(bay.finish(),0xffffff,p.x,p.y,p.z,0,p.heading);
  }
  const pits=new T.Mesh(pit.finish(),new T.MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:.2}));pits.receiveShadow=true;scene.add(pits);roots.push(pits);
  return {curbs:data.curbs.length,chevrons:data.chevrons.length,guardrails:data.guardrails.length,shortcutMarkers:data.shortcutMarkers.length,startLights:5,shoulderTriangles:shoulder.geometry.index.count/3,shortcutBankTriangles:shoulder.geometry.userData.shortcutBankTriangles,drawBatches:roots.length};
 }
 return {layout,shoulderGeometry,clearsShortcut,create};
});

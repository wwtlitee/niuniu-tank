'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../js/racing/racing-rules.js');
const T=require('../lib/three.min.js'),M=require('../js/racing/racing-models.js')(T),track=require('../js/racing/racing-track.js')(T,M,R);

test('shortcut clearance includes object radius and the junction end caps',()=>{
 const sc=R.track.shortcut,h=Math.atan2(sc.b.x-sc.a.x,sc.b.z-sc.a.z);
 assert.equal(typeof track.clearsShortcut,'function');
 for(const t of [0,.5,1]){
  const x=sc.a.x+(sc.b.x-sc.a.x)*t,z=sc.a.z+(sc.b.z-sc.a.z)*t;
  assert.equal(track.clearsShortcut(x,z,2),false);
  assert.equal(track.clearsShortcut(x+Math.cos(h)*6,z-Math.sin(h)*6,2),false);
  assert.equal(track.clearsShortcut(x+Math.cos(h)*7,z-Math.sin(h)*7,2),true);
 }
 assert.equal(track.clearsShortcut(sc.a.x-Math.sin(h)*6,sc.a.z-Math.cos(h)*6,2),false);
});

test('shoulder triangles leave the full shortcut driving surface exposed',()=>{
 const geometry=track.shoulderGeometry(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),mesh=new T.Mesh(geometry,material),ray=new T.Raycaster();
 mesh.updateMatrixWorld();
 const sc=R.track.shortcut,h=Math.atan2(sc.b.x-sc.a.x,sc.b.z-sc.a.z),obstructions=[];
 for(let i=0;i<=200;i++)for(const lane of [-4.4,-2.2,0,2.2,4.4]){
  const t=i/200,s=sc.start+(sc.end-sc.start)*t,x=sc.a.x+(sc.b.x-sc.a.x)*t+Math.cos(h)*lane,z=sc.a.z+(sc.b.z-sc.a.z)*t-Math.sin(h)*lane;
  ray.set(new T.Vector3(x,20,z),new T.Vector3(0,-1,0));
  const hit=ray.intersectObject(mesh).find(hit=>hit.point.y>R.height(s)+.015);
  if(hit)obstructions.push({t,lane,aboveRoad:hit.point.y-R.height(s)});
 }
 geometry.dispose();material.dispose();
 assert.equal(obstructions.length,0,JSON.stringify(obstructions.slice(0,4)));
});

test('shortcut side banks support the elevated ribbon down to the canyon floor',()=>{
 const geometry=track.shoulderGeometry(),material=new T.MeshBasicMaterial({side:T.DoubleSide}),mesh=new T.Mesh(geometry,material),ray=new T.Raycaster(),sc=R.track.shortcut,h=Math.atan2(sc.b.x-sc.a.x,sc.b.z-sc.a.z);
 mesh.updateMatrixWorld();
 for(const t of [.45,.55,.65])for(const side of [-1,1]){
  const s=sc.start+(sc.end-sc.start)*t,x=sc.a.x+(sc.b.x-sc.a.x)*t+Math.cos(h)*side*7.5,z=sc.a.z+(sc.b.z-sc.a.z)*t-Math.sin(h)*side*7.5;
  ray.set(new T.Vector3(x,20,z),new T.Vector3(0,-1,0));
  const supports=ray.intersectObject(mesh).filter(hit=>hit.point.y>-.38&&hit.point.y<R.height(s)-.1);
  assert.ok(supports.length>0,`floating shortcut side at ${t}, ${side}`);
 }
 geometry.dispose();material.dispose();
});

test('actual roadside meshes do not enter the tank driving volume',()=>{
 const scene=new T.Scene(),ray=new T.Raycaster();track.create(scene);scene.updateMatrixWorld(true);
 for(let s=0;s<R.track.length;s+=6)for(const lane of [-11.65,0,11.65]){
  const p=R.sample(s),x=p.x+Math.cos(p.heading)*lane,z=p.z-Math.sin(p.heading)*lane;
  ray.set(new T.Vector3(x,p.y+4.3,z),new T.Vector3(0,-1,0));ray.far=3.9;
  assert.equal(ray.intersectObjects(scene.children).length,0,`solid prop enters main route at ${s}, ${lane}`);
 }
 const sc=R.track.shortcut,h=Math.atan2(sc.b.x-sc.a.x,sc.b.z-sc.a.z);
 for(let i=0;i<=70;i++)for(const lane of [-4.4,0,4.4]){
  const t=i/70,s=sc.start+(sc.end-sc.start)*t,x=sc.a.x+(sc.b.x-sc.a.x)*t+Math.cos(h)*lane,z=sc.a.z+(sc.b.z-sc.a.z)*t-Math.sin(h)*lane;
  ray.set(new T.Vector3(x,R.height(s)+4.3,z),new T.Vector3(0,-1,0));ray.far=3.9;
  assert.equal(ray.intersectObjects(scene.children).length,0,`solid prop enters shortcut at ${t}, ${lane}`);
 }
 for(const child of scene.children){child.geometry.dispose();child.material.dispose();}
});

test('guardrail footprints and shortcut markers clear both driving routes',()=>{
 const data=track.layout();
 assert.ok(data.guardrails?.length>40,'outer bends need elevated guardrails');
 assert.ok(data.shortcutMarkers?.length>=4,'both shortcut junctions need visible roadside markers');
 const sc=R.track.shortcut,dx=sc.b.x-sc.a.x,dz=sc.b.z-sc.a.z;
 for(const p of [...data.guardrails,...data.shortcutMarkers])for(const across of [-p.width/2,0,p.width/2])for(const along of [-p.length/2,0,p.length/2]){
  const x=p.x+Math.cos(p.heading)*across+Math.sin(p.heading)*along,z=p.z-Math.sin(p.heading)*across+Math.cos(p.heading)*along,q=R.locate(x,z),t=Math.max(0,Math.min(1,((x-sc.a.x)*dx+(z-sc.a.z)*dz)/(dx*dx+dz*dz)));
  assert.ok(q.distance>=q.width/2+.3,`road obstruction at ${p.s}`);
  assert.ok(Math.hypot(x-sc.a.x-dx*t,z-sc.a.z-dz*t)>=sc.width/2+.6,`shortcut obstruction at ${p.s}`);
 }
});

test('new track facilities remain finite and use a bounded static draw budget',()=>{
 const scene=new T.Scene(),metrics=track.create(scene);
 assert.ok(metrics.guardrails>40);
 assert.ok(metrics.shortcutMarkers>=4);
 assert.ok(metrics.startLights===5);
 assert.ok(metrics.drawBatches<=10);
 for(const child of scene.children){
  assert.ok([...child.geometry.attributes.position.array].every(Number.isFinite));
  if(child.instanceMatrix)assert.ok([...child.instanceMatrix.array].every(Number.isFinite));
  child.geometry.dispose();child.material.dispose();
 }
});

test('track refinement keeps shortcut entries open and markings out of the driving lane',()=>{
 let factory;try{factory=require('../js/racing/racing-track.js');}catch{}
 assert.equal(typeof factory,'function');
 const T=require('../lib/three.min.js'),M=require('../js/racing/racing-models.js')(T),track=factory(T,M,R),layout=track.layout();
 assert.ok(layout.curbs.length>100);assert.ok(layout.chevrons.length>10);
 for(const p of [...layout.curbs,...layout.chevrons]){
  assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
  assert.ok(Math.abs(p.s-R.track.shortcut.start)>25&&Math.abs(p.s-R.track.shortcut.end)>25);
  assert.ok(R.locate(p.x,p.z).distance>=11.8);
 }
 const g=track.shoulderGeometry();assert.ok([...g.attributes.position.array].every(Number.isFinite));
 g.computeBoundingBox();assert.ok(g.boundingBox.min.y<=-.389);assert.ok(g.boundingBox.max.y>1);
 assert.ok(g.attributes.position.count<12000);g.dispose();
});

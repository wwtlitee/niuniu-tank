'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),T=require('../lib/three.min.js'),R=require('../js/racing/racing-rules.js'),M=require('../js/racing/racing-models.js')(T),L=require('../js/racing/racing-legacy-models.js')(T,M);
test('camera fades rear vehicles between the lens and player without fading opponents ahead',()=>{
 const C=require('../js/racing/racing-camera.js')(R),player={x:0,z:0},eye={x:0,z:-12};
 assert.equal(typeof C.occluderOpacity,'function');
 assert.ok(C.occluderOpacity(player,{x:0,z:-7},eye)<.2);
 assert.ok(C.occluderOpacity(player,{x:4,z:-7},eye)<.3);
 assert.equal(C.occluderOpacity(player,{x:0,z:5},eye),1);
 assert.equal(C.occluderOpacity(player,{x:9,z:-7},eye),1);
 assert.equal(C.occluderOpacity(player,{x:0,z:-25},eye),1);
 assert.equal(C.occluderOpacity(player,{x:0,z:-7},player),1);
 assert.equal(C.occluderOpacity(player,{x:NaN,z:0},eye),1);
 assert.ok(C.occluderOpacity(player,{x:7,z:0},{x:12,z:0})<.2,'works after turning');
});
test('camera supports stable third person behind the vehicle and first person switching',()=>{
 let C;try{C=require('../js/racing/racing-camera.js')(R);}catch{}
 assert.ok(C,'camera module exists');const c=R.create().cars[0];c.heading=0;c.speed=35;
 const third=C.desired(c,'third'),first=C.desired(c,'first');
 assert.ok(third.eye.z<c.z-8);assert.ok(third.eye.y>c.y+5);assert.ok(third.target.z>c.z);
 assert.ok(Math.abs(first.eye.x-c.x)<.01);assert.ok(Math.abs(first.eye.z-c.z)<1);assert.ok(first.eye.y>c.y+2.5);
 const step=C.smooth(third,C.desired({...c,heading:Math.PI/2},'third'),1/60);
 assert.ok(step.eye.x!==third.eye.x);assert.ok(Math.abs(step.eye.x-third.eye.x)<3);
 assert.deepEqual(C.smooth(null,first,1/60),first);
});
test('first person uses each actual tank barrel, preserves paint, and places pivot below the eye',()=>{
 assert.equal(typeof M.cockpitFromTank,'function');const signatures=new Set();
 for(let id=0;id<7;id++){
  const source=id?L.tank('#cf493e',id):M.tank('#cf493e');const before=source.turret.attributes.position.array.slice();
  const view=M.cockpitFromTank(source);assert.deepEqual(source.turret.attributes.position.array,before);
  assert.ok(view.pivot.y<-1.3&&view.pivot.z<=0);view.gun.computeBoundingBox();
  assert.ok(view.gun.boundingBox.max.z<-.7);assert.ok(view.gun.boundingBox.min.z<-3);
  assert.ok([...view.gun.attributes.position.array].every(Number.isFinite));
  signatures.add(view.gun.attributes.position.count+':'+view.gun.boundingBox.min.z+':'+view.gun.boundingBox.max.x);
  const color=Array.from(view.gun.attributes.color.array);M.paint(view.gun,'#4b91bb');assert.equal(view.gun.attributes.color.array.some((v,i)=>v!==color[i]),id!==0,'paintable barrels change; original steel barrel stays steel');
  source.body.dispose();source.turret.dispose();view.body.dispose();view.gun.dispose();
 }
 assert.ok(signatures.size>=6,'source geometry must replace the common placeholder barrel');
});

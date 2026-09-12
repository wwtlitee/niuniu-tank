'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../js/racing/racing-rules.js'),N=require('../js/racing/racing-network.js');
test('garage offers original, classic, survival variants and hero; cosmetics never change physics',()=>{
 assert.ok(Array.isArray(R.BODIES),'body catalog must exist');
 assert.equal(R.BODIES.length,7);
 const a=R.create(),b=R.create();b.cars[0].body=6;b.cars[0].color=4;
 for(let i=0;i<300;i++){R.step(a,1/60,{throttle:1});R.step(b,1/60,{throttle:1});}
 for(const key of ['x','z','speed','progress'])assert.equal(a.cars[0][key],b.cars[0][key]);
});
test('snapshot roundtrip retains every body and rejects malformed body ids',()=>{
 const g=R.create();g.cars.forEach((c,i)=>c.body=i+1);
 assert.deepEqual(N.unpack(N.pack(g)).cars.map(c=>c.body),[1,2,3,4,5,6]);
 for(const value of [-1,7,1.5]){g.cars[0].body=value;assert.equal(N.unpack(N.pack(g)),null);}
});
test('ported models are finite, bounded, distinct, and repaintable without painting hardware',()=>{
 let L;try{L=require('../js/racing/racing-legacy-models.js');}catch{}
 assert.equal(typeof L,'function','original model adapter must exist');
 const T=require('../lib/three.min.js'),M=require('../js/racing/racing-models.js')(T),legacy=L(T,M),signatures=new Set();
 for(let id=1;id<7;id++){
  const model=legacy.tank('#cf493e',id);assert.ok(model.turretHeight>0&&model.turretHeight<3);
  for(const g of [model.body,model.turret]){
   assert.ok(g.attributes.position.count<45000);assert.ok(Array.from(g.attributes.position.array).every(Number.isFinite));
   g.computeBoundingBox();assert.ok(g.boundingBox.max.length()<10);
   const before=Array.from(g.attributes.color.array);M.paint(g,'#4b91bb');const after=Array.from(g.attributes.color.array);
   assert.notDeepEqual(before,after);assert.ok(before.some((v,i)=>v===after[i]),'hardware must keep its finish');
  }
  signatures.add(model.body.attributes.position.count+':'+model.turret.attributes.position.count+':'+model.turret.boundingBox.max.z);
  model.body.dispose();model.turret.dispose();
 }
 assert.equal(signatures.size,6);
});

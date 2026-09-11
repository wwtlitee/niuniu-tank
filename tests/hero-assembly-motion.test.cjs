const test=require('node:test'),assert=require('node:assert/strict');
const motion=require('../js/hero-assembly-motion.js');
const piece={center:[0,1.4,0],size:[2.3,.5,4],side:-1};
test('cargo stays gripped throughout extraction and only becomes installed at release',()=>{
 for(let i=0;i<=1000;i++){const p=i/1000,s=motion.sample(piece,p);assert.equal(s.installed,p>=.86);if(s.visible&&!s.installed)assert.equal(s.gripped,true);}
});
test('crossing deck happens only after part clears completed vehicle',()=>{
 for(let i=400;i<=660;i++){const s=motion.sample(piece,i/1000);assert.ok(s.bottom>=4.1,'overhead clearance');}
});
test('pose has no jumps at grasp lift rotate align release or retract boundaries',()=>{
 for(const p of [.12,.4,.66,.86,.93]){const a=motion.sample(piece,p-1e-7),b=motion.sample(piece,p+1e-7);assert.ok(Math.hypot(...a.position.map((v,i)=>v-b.position[i]))<.001);}
 assert.deepEqual(motion.sample(piece,.86).position,piece.center);
});
test('reload uses absolute production progress and never a previous-frame attachment',()=>{assert.deepEqual(motion.sample(piece,.54),motion.sample(piece,.54));assert.equal(motion.sample(piece,-1).visible,false);assert.equal(motion.sample(piece,2).installed,true);});

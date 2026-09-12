const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),T=require('../lib/three.min.js'),R=require('../js/racing/racing-rules.js').forTrack('city');
test('Kenney city asset manifest points to complete local GLB files',()=>{
 const manifest=require('../assets/racing-city/manifest.json');assert.ok(manifest.assets.length>=12);
 for(const a of manifest.assets){const b=fs.readFileSync(require('node:path').join(__dirname,'../assets/racing-city',a.file));assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);}
});
test('city surface follows the selected circuit rather than bridging over its corners',()=>{
 let city;try{city=require('../js/racing/racing-city.js')(T,R);}catch{}assert.ok(city,'city scene module');
 const g=new T.PlaneGeometry(1,1).rotateX(-Math.PI/2).toNonIndexed();const colors=new Float32Array(g.attributes.position.count*3).fill(.26);g.setAttribute('color',new T.BufferAttribute(colors,3));
 const warped=city.warpRoad(g,0,80);const p=warped.attributes.position;assert.ok(p.count>g.attributes.position.count);
 for(let i=0;i<p.count;i++){const q=R.locate(p.getX(i),p.getZ(i),true,p.getY(i));assert.ok(Math.abs(p.getY(i)-R.height(q.s))<.6);assert.ok(q.distance<13);}
 g.dispose();warped.dispose();
});

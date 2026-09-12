'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),T=require('../lib/three.min.js'),R=require('../js/racing/racing-rules.js'),S=require('../js/racing/racing-spectacle.js')(T,R);
test('quantized scenery retains positions, normals, colors and UVs when merged',()=>{
 assert.equal(typeof S.bakeStatic,'function');
 const g=new T.BufferGeometry();
 g.setIndex([0,1,2]);
 g.setAttribute('position',new T.InterleavedBufferAttribute(new T.InterleavedBuffer(new Int16Array([0,0,0,777,32767,0,0,777,0,32767,0,777]),4),3,0,true));
 g.setAttribute('normal',new T.BufferAttribute(new Int8Array([0,0,127,0,0,127,0,0,127]),3,true));
 g.setAttribute('color',new T.BufferAttribute(new Uint8Array([255,128,64,255,128,64,255,128,64]),3,true));
 g.setAttribute('uv',new T.BufferAttribute(new Uint16Array([0,0,65535,0,0,65535]),2,true));
 const material=new T.MeshStandardMaterial({color:0xffffff}),mesh=new T.Mesh(g,material);mesh.position.set(5,2,0);mesh.scale.setScalar(2);
 const baked=S.bakeStatic(mesh),a=baked.geometry.attributes;
 assert.deepEqual(Array.from(a.position.array),[5,2,0,7,2,0,5,4,0]);
 assert.equal(a.normal.getZ(1),1);assert.ok(Math.abs(a.color.getY(0)-128/255)<1e-6);assert.equal(a.uv.getX(1),1);
 assert.ok(a.normal.array instanceof Float32Array);baked.geometry.dispose();baked.material.dispose();g.dispose();material.dispose();
});

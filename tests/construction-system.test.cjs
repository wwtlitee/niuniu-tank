const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../js/construction-system.js');
test('工人沿可达格绕过建筑，不穿墙或切角',()=>{
 const path=C.findPath({x:0,z:0},[{x:2,z:0}],3,3,(x,z)=>!(x===1&&z<2));
 assert.ok(path.length>=7);assert.deepEqual(path.at(-1),{x:2,z:0});
 assert.equal(C.findPath({x:0,z:0},[{x:2,z:0}],3,3,(x)=>x!==1),null);
});
test('施工耗时有建筑差异，行走和暂停不推进施工',()=>{
 assert.ok(C.duration('factory')>C.duration('house'));
 const job={phase:'outbound',elapsed:0,duration:10};
 assert.equal(C.advance(job,5),false);assert.equal(job.elapsed,0);
 job.phase='building';assert.equal(C.advance(job,4),false);assert.equal(job.elapsed,4);
 assert.equal(C.advance(job,NaN),false);assert.equal(job.elapsed,4);
 assert.equal(C.advance(job,6),true);assert.equal(job.elapsed,10);
});

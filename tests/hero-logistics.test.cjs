const {test}=require('node:test'),assert=require('node:assert/strict'),H=require('../js/hero-system.js');
test('purchased levels remain pending until installation and survive archive',()=>{
 const a=H.archive({skills:{rail:2},orders:[{skill:'rail',level:3},{skill:'rail',level:4}],delivery:{phase:'outbound',elapsed:1,x:4,y:12,z:8}});
 assert.equal(a.skills.rail,2);assert.equal(H.orderedLevel(a,'rail'),4);assert.equal(a.orders.length,2);
 assert.deepEqual(H.archive(JSON.parse(JSON.stringify(a))),a);
});
test('invalid or duplicate orders cannot grant extra levels',()=>{
 const a=H.archive({skills:{rail:2},orders:[{skill:'rail',level:2},{skill:'unknown',level:1},{skill:'rail',level:3},{skill:'rail',level:3}]});
 assert.deepEqual(a.orders,[{skill:'rail',level:3}]);
 assert.equal(H.orderedLevel(a,'rail'),3);
});

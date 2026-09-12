'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),base=require('../js/racing/racing-rules.js'),network=require('../js/racing/racing-network.js');
function city(){assert.equal(typeof base.forTrack,'function','isolated track rules factory');return base.forTrack('city');}
test('city start grid leads into a forgiving straight before the first drift section',()=>{
 const C=city(),heading=C.sample(-10).heading;assert.ok(Math.abs(C.angle(C.sample(65).heading-heading))<.12);
});
test('city and canyon have isolated routes and games',()=>{
 const C=city();assert.equal(base.track.id,'canyon');assert.equal(C.track.id,'city');assert.equal(C.create().trackId,'city');assert.ok(C.track.length>1500);assert.ok(Math.abs(base.track.length-1229.73)<.01);assert.notDeepEqual(C.track.points,base.track.points);assert.throws(()=>base.forTrack('missing'));
});
test('city overpass chooses the correct road layer and continuous progress',()=>{
 const C=city(),low=C.locate(0,0,true,1.2),high=C.locate(0,0,true,18);
 assert.ok(Math.abs(low.s-high.s)>300);assert.ok(Math.abs(C.height(low.s)-1.2)<1);assert.ok(C.height(high.s)>16);
 for(const q of [low,high]){const g=C.create({humans:[0,1,2,3,4,5]}),c=g.cars[0],p=C.sample(q.s-8);Object.assign(c,{x:p.x,y:p.y,z:p.z,heading:p.heading,lastS:p.s,safe:p.s,progress:p.s,seg:-1,speed:25});g.phase='racing';for(let i=0;i<45;i++)C.step(g,1/60,{players:{0:C.autopilot(c,g)}});assert.ok(c.progress>p.s+5);assert.ok(Math.abs(c.y-C.height(q.s))<2);}
});
test('city has repeated alternating bends and a real elevated section',()=>{
 const C=city();let signs=[],maxY=0;for(let s=0;s<C.track.length;s+=10){maxY=Math.max(maxY,C.height(s));const bend=C.angle(C.sample(s+8).heading-C.sample(s-8).heading);if(Math.abs(bend)>.09){const sign=Math.sign(bend);if(signs.at(-1)!==sign)signs.push(sign);}}
 assert.ok(signs.length>=10,`alternating corner groups: ${signs.length}`);assert.ok(maxY>=17);assert.ok(C.track.shortcut.length>0);
});
test('city AI can finish three physical laps without progress resets',()=>{
 const C=city(),g=C.create({humans:[0,1,2,3,4,5]}),c=g.cars[0];let recovers=0,lastId=0;
 for(let i=0;i<60*420&&!c.finished;i++){C.step(g,1/60,{players:{0:C.autopilot(c,g)}});for(const e of g.events)if(e.id>lastId){if(e.type==='recover'&&e.car===0)recovers++;lastId=Math.max(lastId,e.id);}}
 assert.equal(c.finished,true,`progress ${c.progress}/${C.track.length*3}`);assert.equal(c.lap,3);assert.equal(recovers,0);
});
test('network snapshots identify the circuit and reject different maps',()=>{
 const C=city();assert.equal(typeof network.forTrack,'function');const N=network.forTrack('city'),p=N.pack(C.create());assert.equal(p.trackId,'city');assert.equal(N.unpack(p).trackId,'city');assert.equal(network.unpack(p),null);assert.equal(N.unpack({...p,trackId:'missing'}),null);
});

test('city mines cannot detonate on tanks on the other deck',()=>{
 const C=city();for(const layer of [1.2,18]){const g=C.create({humans:[0,1,2,3,4,5]}),c=g.cars[0],q=C.locate(0,0,true,layer),p=C.sample(q.s);g.phase='racing';Object.assign(c,{x:p.x,y:p.y,z:p.z,lastS:p.s,safe:p.s,progress:p.s,heading:p.heading,seg:q.index,speed:0,invulnerable:0});g.mines=[{id:99,owner:1,x:p.x,z:p.z,y:1.35,ttl:18,arm:0}];C.step(g,1/60,{players:{}});assert.equal(c.stun>0,layer===1.2);assert.equal(g.mines.length,layer===1.2?0:1);}
});

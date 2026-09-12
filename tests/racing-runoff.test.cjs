'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),base=require('../js/racing/racing-rules');
function race(id,offset,s=45){const R=base.forTrack(id),g=R.create({humans:[0,1,2,3,4,5]}),c=g.cars[0],p=R.sample(s);g.phase='racing';g.cars.slice(1).forEach(c=>{c.finished=true;});g.pickups.forEach(p=>p.cooldown=999);Object.assign(c,{x:p.x+Math.cos(p.heading)*offset,y:p.y,z:p.z-Math.sin(p.heading)*offset,heading:p.heading,lastS:p.s,safe:p.s,progress:p.s,seg:-1,invulnerable:10});return {R,g,c};}
for(const id of ['canyon','city']){
 test(id+' runoff gives a small mistake time to steer back, without a two-second reset',()=>{const {R,g,c}=race(id,20);for(let i=0;i<240;i++)R.step(g,1/60,{players:{}});assert.ok(c.offroad>3.9);assert.ok(R.locate(c.x,c.z,true,c.y).distance>18);});
 test(id+' deep runoff is slow but does not instantly teleport at the old ten-metre boundary',()=>{const {R,g,c}=race(id,27);c.speed=25;const before=c.progress;R.step(g,1/60,{players:{0:{throttle:1}}});assert.ok(c.speed>0&&c.speed<25.4);assert.ok(c.offroad>0);assert.ok(c.progress>=before);});
 test(id+' physical return from runoff keeps progress continuous',()=>{const {R,g,c}=race(id,20);c.speed=15;let resets=0,last=0;for(let i=0;i<480;i++){R.step(g,1/60,{players:{0:R.autopilot(c,g)}});for(const e of g.events)if(e.id>last){if(e.type==='recover')resets++;last=e.id;}}assert.equal(resets,0);assert.equal(c.offroad,0);assert.ok(c.progress>80);});
 test(id+' very distant ground departure still recovers safely',()=>{const {R,g,c}=race(id,60);R.step(g,1/60,{players:{}});assert.ok(g.events.some(e=>e.type==='recover'));assert.equal(c.speed,0);assert.equal(c.progress,c.safe);});
}
test('elevated city deck retains a bounded rescue zone',()=>{const R=base.forTrack('city'),q=R.locate(0,0,true,18),{g,c}=race('city',26,q.s);R.step(g,1/60,{players:{}});assert.ok(g.events.some(e=>e.type==='recover'));assert.ok(c.y>16);});

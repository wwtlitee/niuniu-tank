const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../js/racing/racing-rules.js');
test('竞速规则模块可独立加载', () => assert.ok(fs.existsSync(file), '缺少竞速规则'));
if (fs.existsSync(file)) {
 const R = require(file);
 const tick = (g, seconds, input = {}) => { for (let i=0;i<seconds*60;i++) R.step(g,1/60,input); };
 test('六辆车倒计时禁止抢跑，暂停冻结时间',()=>{
  const g=R.create(); assert.equal(g.cars.length,6); const x=g.cars[0].x;
  tick(g,2,{throttle:1}); assert.equal(g.cars[0].x,x); assert.equal(g.phase,'countdown');
  tick(g,2); assert.equal(g.phase,'racing'); R.pause(g); const t=g.time; tick(g,3,{throttle:1}); assert.equal(g.time,t);
 });
 test('路线闭合、捷径缩短路线且接点连续',()=>{
  const t=R.track; assert.ok(t.length>900); const a=R.sample(0),b=R.sample(t.length);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.001); assert.ok(t.shortcut.length<t.shortcut.end-t.shortcut.start);
 });
 test('AI 正常驾驶完成三圈，玩家也使用同一套规则完成',()=>{
  const g=R.create(); for(let i=0;i<60*300&&g.phase!=='finished';i++) R.step(g,1/60,R.autopilot(g.cars[0],g));
  assert.equal(g.phase,'finished'); assert.equal(g.cars[0].lap,3); assert.ok(g.results.length>=1);
  assert.ok(g.cars.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.progress)));
 });
 test('倒车越过起点不能刷圈，出界复位不增加进度',()=>{
  const g=R.create(); tick(g,4); const c=g.cars[0]; tick(g,2,{throttle:-1}); assert.equal(c.lap,0);
  const progress=c.progress; c.x=10000;c.z=10000;tick(g,2);assert.ok(c.progress<=progress+1);assert.ok(Math.abs(c.x)<1000);
 });
 test('护盾抵挡攻击，减速不会无限叠加，四种道具可消耗',()=>{
  const g=R.create();tick(g,4); const c=g.cars[0];c.invulnerable=0;c.speed=20;c.item='shield';R.useItem(g,c);R.hit(g,c);assert.equal(c.speed,20);
  c.shield=0;R.hit(g,c);assert.ok(c.speed<20);assert.ok(c.stun<=.8);
  for(const item of ['boost','mine','missile']) {c.item=item;R.useItem(g,c);assert.equal(c.item,null);}
  assert.ok(g.mines.length>0);assert.ok(c.boost>0);
 });
 test('高速道具拾取走线段检测、子弹和效果有上限',()=>{
  const g=R.create();tick(g,4);const c=g.cars[0],p=g.pickups[0];
  const s=R.sample(p.s-1);Object.assign(c,{x:s.x,z:s.z,heading:s.heading,speed:42,item:null});R.step(g,1/60,{throttle:1});assert.ok(c.item);
  for(let i=0;i<500;i++){c.cooldown=0;R.fire(g,c);R.hit(g,c);}assert.ok(g.shots.length<=R.LIMITS.shots);assert.ok(g.events.length<=R.LIMITS.events);
 });
 test('大时间步与非数值输入不会破坏状态',()=>{
  const g=R.create();R.step(g,NaN,{throttle:NaN});R.step(g,Infinity);R.step(g,200,{steer:Infinity});
  assert.ok(g.cars.every(c=>Number.isFinite(c.x)));assert.ok(g.time<1);
 });
 test('AI 分道行驶，避免全部挤在赛道中心',()=>{
  const g=R.create();tick(g,12);const lanes=g.cars.slice(1).map(c=>{const q=R.sample(c.lastS);return (c.x-q.x)*Math.cos(q.heading)-(c.z-q.z)*Math.sin(q.heading);});
  assert.ok(Math.max(...lanes)-Math.min(...lanes)>5,'AI 应使用多个车道');
 });
 test('捷径可以连续驶入驶出并保留比赛进度',()=>{
  const g=R.create();tick(g,4);const c=g.cars[0],s=R.track.shortcut,a=s.a,b=s.b;
  Object.assign(c,{x:a.x,z:a.z,progress:s.start,lastS:s.start,safe:s.start,heading:Math.atan2(b.x-a.x,b.z-a.z),speed:30,invulnerable:20});
  for(let i=0;i<60*10&&Math.hypot(c.x-b.x,c.z-b.z)>3;i++)R.step(g,1/60,{throttle:1});
  assert.ok(Math.hypot(c.x-b.x,c.z-b.z)<4,'捷径出口可达');assert.ok(c.progress>s.end-8,'捷径应正确计入进度');
 });
 test('捷径中复位退回安全点进度，不能重复刷同一段',()=>{
  const g=R.create();tick(g,4);const c=g.cars[0];c.safe=R.track.shortcut.start;c.progress=c.safe+60;R.recover(g,c);assert.equal(c.progress,c.safe);
 });
}

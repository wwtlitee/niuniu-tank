const test=require('node:test'),assert=require('node:assert/strict'),R=require('../js/racing/racing-rules.js');
test('多人独立输入：第二位玩家不受 AI 接管，输入不改变其他玩家',()=>{
 const g=R.create({humans:[0,1]});g.phase='racing';
 for(let i=0;i<60;i++)R.step(g,1/60,{players:{0:{},1:{throttle:1,aimYaw:1}}});
 assert.equal(g.cars[0].speed,0);assert.ok(g.cars[1].speed>10);assert.equal(g.cars[1].aim,.75);
});
test('房主先完赛不结束其他人的比赛；全部人类完成后结算',()=>{
 const g=R.create({humans:[0,1]});g.phase='racing';g.cars[0].progress=R.track.length*3;
 R.step(g,1/60,{players:{}});assert.equal(g.cars[0].finished,true);assert.equal(g.phase,'racing');
 g.cars[1].progress=R.track.length*3;R.step(g,1/60,{players:{}});assert.equal(g.phase,'finished');
});
test('多人赛事有完赛宽限和最长时间，掉队不会锁住房间',()=>{
 const g=R.create({humans:[0,1]});g.phase='racing';g.cars[0].finished=true;g.cars[0].finishTime=1;g.time=47;
 R.step(g,1/60,{players:{}});assert.equal(g.phase,'finished');
});
test('客户端预测不修改权威比赛、拾取和弹药',()=>{
 const g=R.create({humans:[0,1]});g.phase='racing';const before=JSON.stringify(g);
 assert.equal(typeof R.predictCar,'function');const c=R.predictCar(g,g.cars[1],1/60,{throttle:1});
 assert.ok(c.speed>0);assert.equal(JSON.stringify(g),before);
});
test('六个人类槽使用相同规则完整跑完三圈，名次无重复',()=>{
 const g=R.create({humans:[0,1,2,3,4,5]});
 for(let i=0;i<300*60&&g.phase!=='finished';i++)R.step(g,1/60,{players:Object.fromEntries(g.cars.map(c=>[c.id,R.autopilot(c,g)]))});
 assert.equal(g.phase,'finished');assert.equal(g.results.length,6);assert.equal(new Set(g.results).size,6);assert.ok(g.cars.every(c=>c.lap===3));
});

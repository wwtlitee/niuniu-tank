const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/racing/racing-rules.js');
const N = require('../js/racing/racing-network.js');

function race(s = 60, lane = 0) {
 const g = R.create();
 g.phase = 'racing';
 g.pickups = [];
 g.cars.slice(1).forEach(c => { c.finished = true; c.finishTime = 1000 + c.id; });
 const c = g.cars[0], p = R.sample(s);
 Object.assign(c, { x: p.x + Math.cos(p.heading) * lane, z: p.z - Math.sin(p.heading) * lane, y: p.y, heading: p.heading, lastS: p.s, progress: s, safe: s, speed: 30 });
 return g;
}

test('主路内侧正常走线连续三圈，捷径重叠区不能漏记进度', () => {
 const g = race(-10, -9), c = g.cars[0], finish = R.track.length * 3;
 // 将车辆按实际相邻位置送入物理步，覆盖主路和捷径中心线归属跳变。
 for (let s = -10; s < finish + 1 && !c.finished; s += .5) {
  const p = R.sample(s);
  Object.assign(c, { x: p.x - Math.cos(p.heading) * 9, z: p.z + Math.sin(p.heading) * 9, heading: p.heading, speed: 30 });
  R.step(g, 1 / 60, { throttle: 1 });
  assert.ok(Math.abs(c.progress - (s + .5)) < 5, `actual=${s.toFixed(2)}, credited=${c.progress.toFixed(2)}`);
 }
 assert.equal(c.finished, true);
 assert.equal(c.lap, 3);
});

test('被拒绝的道路跳点回到安全点，后续合法行驶继续计圈', () => {
 const g = race(60), c = g.cars[0], jumped = R.sample(250);
 Object.assign(c, { x: jumped.x, z: jumped.z, heading: jumped.heading });
 R.step(g, 1 / 60, { throttle: 1 });
 assert.ok(c.progress <= 61, '跳点不能凭空增加进度');
 assert.ok(Math.hypot(c.x - R.sample(60).x, c.z - R.sample(60).z) < 1, '无效位置应退回安全点');
 for (let i = 0; i < 180; i++) R.step(g, 1 / 60, R.autopilot(c, g));
 assert.ok(c.progress > 100, '不能停留在 lastS 拒绝循环');
});

test('起跑位置为负数，第一次经过起点不计完成圈', () => {
 const g = race(-1), c = g.cars[0];
 for (let i = 0; i < 5; i++) R.step(g, 1 / 60, { throttle: 1 });
 assert.ok(c.progress > 0 && c.progress < 5);
 assert.equal(c.lap, 0);
});

test('同一物理步冲线按实际过线时刻排名，不按车辆数组顺序', () => {
 const g = R.create({ humans: [0, 1] });
 g.phase = 'racing'; g.time = 120; g.pickups = [];
 g.cars.slice(2).forEach(c => { c.finished = true; c.finishTime = 130 + c.id; });
 const line = R.track.length * 3;
 for (const [id, gap, lane] of [[0, .6, -4], [1, .1, 4]]) {
  const c = g.cars[id], p = R.sample(line - gap);
  Object.assign(c, { x: p.x + Math.cos(p.heading) * lane, z: p.z - Math.sin(p.heading) * lane, heading: p.heading, speed: 42, progress: line - gap, lastS: p.s, safe: line - gap });
 }
 R.step(g, 1 / 60, { players: { 0: { throttle: 1 }, 1: { throttle: 1 } } });
 assert.ok(g.cars[0].finished && g.cars[1].finished);
 assert.ok(g.cars[1].finishTime < g.cars[0].finishTime);
 assert.deepEqual(R.ranking(g).slice(0, 2).map(c => c.id), [1, 0]);
 assert.deepEqual(g.results, [1, 0]);
});

test('排名比较总路程，跨起点超车和被飞碟倒退均保留圈差', () => {
 const g = R.create();
 const L = R.track.length;
 g.cars.forEach((c, i) => { c.progress = L - 100 - i; });
 g.cars[0].progress = L + 2;
 g.cars[1].progress = L - 1;
 assert.equal(R.ranking(g)[0].id, 0);
 g.cars[0].progress -= 40;
 assert.equal(R.ranking(g)[0].id, 1);
});

test('不到一毫秒的冲线差经过联机快照仍保留同一名次', () => {
 const g = R.create({ humans: [0, 1] });
 g.cars[0].finished = g.cars[1].finished = true;
 g.cars[0].finishTime = 100.12349;
 g.cars[1].finishTime = 100.12341;
 g.results = [1, 0];
 const restored = N.unpack(N.pack(g));
 assert.ok(restored);
 assert.deepEqual(R.ranking(restored).map(c => c.id), R.ranking(g).map(c => c.id));
 assert.equal(restored.cars[1].finishTime, g.cars[1].finishTime);
});

test('内侧、中线、外侧五种真实转向走线均无复位完成三圈', () => {
 for (const lane of [-9, -6, 0, 6, 9]) {
  const g = race(-10), c = g.cars[0], recoveries = new Set();
  c.speed = 0;
  for (let i = 0; i < 240 * 60 && !c.finished; i++) {
   const road = R.locate(c.x, c.z, true), p = R.sample(road.s + 10 + Math.max(0, c.speed) * .4);
   p.x += Math.cos(p.heading) * lane; p.z -= Math.sin(p.heading) * lane;
   const turn = R.angle(Math.atan2(p.x - c.x, p.z - c.z) - c.heading);
   R.step(g, 1 / 60, { throttle: c.speed > 36 - Math.min(14, Math.abs(turn) * 10) ? 0 : 1, steer: Math.max(-1, Math.min(1, turn * 1.7)), brake: Math.abs(turn) > .95 });
   for (const e of g.events) if (e.type === 'recover') recoveries.add(e.id);
  }
  assert.equal(c.finished, true, `lane=${lane}`);
  assert.equal(c.lap, 3);
  assert.equal(recoveries.size, 0, `lane=${lane}`);
 }
});

test('真实驾驶每圈走一次捷径，三次汇入主路后圈数完整', () => {
 const g = race(-10), c = g.cars[0], shortcut = R.track.shortcut, recoveries = new Set();
 c.speed = 0;
 let passes = 0, wasShort = false;
 for (let i = 0; i < 240 * 60 && !c.finished; i++) {
  let input = R.autopilot(c, g);
  if (c.lastS > shortcut.start - 18 && c.lastS < shortcut.end - 5) {
   const turn = R.angle(Math.atan2(shortcut.b.x - c.x, shortcut.b.z - c.z) - c.heading);
   input = { throttle: 1, steer: Math.max(-1, Math.min(1, turn * 1.7)), brake: Math.abs(turn) > 1 };
  }
  R.step(g, 1 / 60, input);
  const onShort = c.seg === -1;
  if (onShort && !wasShort) passes++;
  wasShort = onShort;
  for (const e of g.events) if (e.type === 'recover') recoveries.add(e.id);
 }
 assert.equal(c.finished, true);
 assert.equal(c.lap, 3);
 assert.equal(passes, 3);
 assert.equal(recoveries.size, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/racing/racing-rules.js');
const N = require('../js/racing/racing-network.js');

function charged(charge = .8, lane = 0) {
 const g = R.create(); g.phase = 'racing'; g.pickups = [];
 g.cars.slice(1).forEach(c => { c.finished = true; c.finishTime = 1000 + c.id; });
 const c = g.cars[0], p = R.sample(90);
 Object.assign(c, { x: p.x + Math.cos(p.heading) * lane, z: p.z - Math.sin(p.heading) * lane, heading: p.heading, lastS: p.s, progress: p.s, safe: p.s, speed: 32, steering: .05, slip: .35, drifting: true, driftCharge: charge });
 return g;
}

test('按住漂移反打或回正时保持蓄力，不自动兑现推进', () => {
 const g = charged(), c = g.cars[0];
 R.step(g, 1 / 60, { throttle: 1, drift: true, steer: -.1 });
 assert.equal(c.drifting, true);
 assert.ok(c.driftCharge >= .8);
 assert.equal(c.boost, 0);
});

test('三档漂移松键奖励递增，只松一次只领一次', () => {
 const boosts = [];
 for (const charge of [.35, .7, 1]) {
  const g = charged(charge), c = g.cars[0];
  R.step(g, 1 / 60, { throttle: 1 });
  assert.ok(c.boost > 0, `charge=${charge}`);
  boosts.push(c.boost);
  assert.equal(c.driftCharge, 0);
  const first = c.boost;
  R.step(g, 1 / 60, { throttle: 1 });
  assert.ok(c.boost < first);
  assert.equal(g.events.filter(e => e.type === 'driftboost').length, 1);
 }
 assert.ok(boosts[0] < boosts[1] && boosts[1] < boosts[2]);
});

test('松键当帧越出路缘取消蓄力，不能在草地领取奖励', () => {
 const g = charged(.8, -11.99), c = g.cars[0];
 // 左偏侧滑本帧使车体越过 -12 米路缘，上一帧 offroad 仍为 0。
 R.step(g, 1 / 60, { throttle: 1 });
 assert.ok(c.offroad > 0);
 assert.equal(c.boost, 0);
 assert.equal(c.driftCharge, 0);
 assert.equal(c.drifting, false);
});

test('受击、刹车、倒车、低速终止漂移不会赠送出弯奖励', () => {
 for (const change of [{ stun: .4 }, { speed: 10 }, { input: { brake: true } }, { input: { throttle: -1 } }]) {
  const g = charged(), c = g.cars[0], { input, ...state } = change;
  Object.assign(c, state);
  R.step(g, 1 / 60, { throttle: 1, ...input });
  assert.equal(c.boost, 0, JSON.stringify(change));
  assert.equal(c.driftCharge, 0);
 }
});

test('三级漂移 API 和联机快照保持归一化蓄力与奖励', () => {
 assert.equal(typeof R.driftTier, 'function');
 assert.equal(R.DRIFT_TIERS.length, 3);
 assert.deepEqual([0, .35, .7, 1].map(R.driftTier), [0, 1, 2, 3]);
 const g = charged(.7); g.pickups = R.create().pickups;
 const restored = N.unpack(N.pack(g));
 assert.ok(restored);
 R.step(restored, 1 / 60, { throttle: 1 });
 assert.equal(R.driftTier(g.cars[0].driftCharge), 2);
 assert.equal(restored.cars[0].boost, R.DRIFT_TIERS[1].boost);
});

test('联机压缩不能把临界蓄力提前升级为下一档奖励', () => {
 for (const charge of [.2996, .6496, .9996]) {
  const g = charged(charge); g.pickups = R.create().pickups;
  const restored = N.unpack(N.pack(g));
  assert.ok(restored);
  assert.equal(R.driftTier(restored.cars[0].driftCharge), R.driftTier(charge));
 }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../js/research-rules.js");

test("墙 Lv1→50 理论净耗时 156 秒", () => {
  let total = 0;
  for (let lv = 1; lv <= 49; lv++) total += R.wallDuration(lv);
  assert.equal(total, 156);
  assert.equal(R.wallDuration(1), 2);
  assert.equal(R.wallDuration(10), 2);
  assert.equal(R.wallDuration(11), 3);
  assert.equal(R.wallDuration(30), 3);
  assert.equal(R.wallDuration(31), 4);
  assert.equal(R.wallDuration(50), 4);
});

test("金矿 Lv1→6 五次升级依次 4/6/8/10/12 共 40 秒", () => {
  const seq = [1, 2, 3, 4, 5].map((lv) => R.mineDuration(lv));
  assert.deepEqual(seq, [4, 6, 8, 10, 12]);
  assert.equal(seq.reduce((a, b) => a + b, 0), 40);
});

test("炮台/人口房/医疗灯塔耗时 min(6,2+等级)，改装分支固定 3 秒", () => {
  assert.equal(R.structureDuration(0), 2);
  assert.equal(R.structureDuration(3), 5);
  assert.equal(R.structureDuration(4), 6);
  assert.equal(R.structureDuration(9), 6);
  assert.equal(R.upgradeDuration("branch", 0), 3);
});

test("普通科研 Lv0→10 共 42 秒", () => {
  let total = 0;
  for (let lv = 0; lv <= 9; lv++) total += R.techDuration(lv);
  assert.equal(total, 42);
  assert.equal(R.techDuration(0), 3);
  assert.equal(R.techDuration(3), 4);
  assert.equal(R.techDuration(6), 5);
  assert.equal(R.techDuration(9), 6);
});

test("四项专属科研 Lv0→5 共 40 秒", () => {
  let total = 0;
  for (let lv = 0; lv <= 4; lv++) total += R.doctrineDuration(lv);
  assert.equal(total, 40);
  assert.equal(R.doctrineDuration(0), 6);
  assert.equal(R.doctrineDuration(4), 10);
});

test("无尽突破 min(10,6+等级)，基地改建 10 秒，高级研究院 8 秒", () => {
  assert.equal(R.breakthroughDuration(0), 6);
  assert.equal(R.breakthroughDuration(4), 10);
  assert.equal(R.breakthroughDuration(9), 10);
  assert.equal(R.upgradeDuration("base", 0), 10);
  assert.equal(R.upgradeDuration("academy", 0), 8);
});

test("去重键含目标等级：同设施同项目不同目标等级并存", () => {
  const base = { type: "wall", id: "", ownerKind: "wall", ownerX: 5, ownerZ: 7 };
  const a = R.dedupKey({ ...base, targetLevel: 2 });
  const b = R.dedupKey({ ...base, targetLevel: 3 });
  assert.notEqual(a, b, "不同目标等级必须产生不同键");
  const dup = R.dedupKey({ ...base, targetLevel: 2 });
  assert.equal(a, dup, "完全重复订单必须同键");
});

test("实例 id 优先于坐标参与去重键", () => {
  const coord = { type: "turret", id: "", ownerKind: "turret", ownerX: 3, ownerZ: 4, targetLevel: 1 };
  const withInstance = { ...coord, ownerInstanceId: "abc123" };
  assert.notEqual(R.dedupKey(coord), R.dedupKey(withInstance));
});

test("下一目标等级 = 已完成 + 待完成数 + 1，超上限返回 null", () => {
  assert.equal(R.nextTargetLevel(1, 0, 50), 2);
  assert.equal(R.nextTargetLevel(1, 3, 50), 5);
  assert.equal(R.nextTargetLevel(49, 0, 50), 50);
  assert.equal(R.nextTargetLevel(50, 0, 50), null);
  assert.equal(R.nextTargetLevel(49, 1, 50), null);
});

test("退款比例：研究 100%、工厂 75%、英雄 100%", () => {
  assert.equal(R.refundRate("tech"), 1);
  assert.equal(R.refundRate("wall"), 1);
  assert.equal(R.refundRate("factory"), 0.75);
  assert.equal(R.refundRate("hero"), 1);
});

test("队列容量为 20", () => {
  assert.equal(R.QUEUE_CAPACITY, 20);
});

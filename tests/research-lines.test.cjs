const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/survival-system.js");

test("公共研究 defense/economy 为 tier0 且无流派路线", () => {
  assert.equal(S.RESEARCH_LINES.defense.tier, 0);
  assert.equal(S.RESEARCH_LINES.economy.tier, 0);
  assert.equal(S.RESEARCH_LINES.defense.route, null);
  assert.equal(S.RESEARCH_LINES.economy.route, null);
});

test("流派基础科技 turret/tank/heroCore 为 tier1 并绑定对应路线", () => {
  assert.equal(S.RESEARCH_LINES.turret.tier, 1);
  assert.equal(S.RESEARCH_LINES.tank.tier, 1);
  assert.equal(S.RESEARCH_LINES.heroCore.tier, 1);
  assert.equal(S.RESEARCH_LINES.turret.route, "tower");
  assert.equal(S.RESEARCH_LINES.tank.route, "tank");
  assert.equal(S.RESEARCH_LINES.heroCore.route, "hero");
});

test("heroCore 存在且首级 120、上限 10、每级英雄伤害 +4%", () => {
  const line = S.RESEARCH_LINES.heroCore;
  assert.ok(line, "heroCore 必须存在");
  assert.equal(line.baseCost, 120);
  assert.equal(line.maxLevel, 10);
  assert.equal(line.effect.heroDamagePct, 0.04);
});

test("heroCore 费用遵循 ceil(120×1.42^level)", () => {
  assert.equal(S.researchCost("heroCore", 0, 10), 120);
  assert.equal(S.researchCost("heroCore", 1, 10), Math.ceil(120 * 1.42));
  assert.equal(S.researchCost("heroCore", 2, 10), Math.ceil(120 * 1.42 * 1.42));
  assert.equal(S.researchCost("heroCore", 10, 10), null);
});

test("heroCore 只加英雄伤害，不含生命/治疗/光环字段", () => {
  const effect = S.RESEARCH_LINES.heroCore.effect;
  assert.deepEqual(Object.keys(effect), ["heroDamagePct"]);
});

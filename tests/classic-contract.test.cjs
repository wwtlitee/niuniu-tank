const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const Config = require("../js/classic/classic-config.js");
const Rules = require("../js/classic/classic-rules.js");
const Upgrades = require("../js/classic/classic-upgrades.js");
test('经典坦克绕钢墙并可规划破砖路线',()=>{
 const grid=Array.from({length:13},()=>Array(13).fill(Config.T.EMPTY));
 grid[1][1]=Config.T.STEEL;
 const route=Rules.routeTo(grid,{col:1,row:0},{col:1,row:2});
 assert.ok(route.length>2);assert.ok(route.every(p=>grid[p.row][p.col]!==Config.T.STEEL));
 grid[1].fill(Config.T.BRICK);assert.ok(Rules.routeTo(grid,{col:1,row:0},{col:1,row:2}).length);
});

test("经典 HTML 不加载生存引擎与生存规则", () => {
  const html = read("classic.html");
  assert.match(html, /js\/classic\/classic-engine\.js/);
  assert.doesNotMatch(html, /js\/engine\.js/);
  assert.doesNotMatch(html, /js\/survival-system\.js/);
  assert.doesNotMatch(html, /js\/survival-assets\.js/);
  assert.doesNotMatch(html, /wc3dock/);
  assert.match(html, /classicHud/);
});

test("菜单经典巷战入口指向独立 classic.html 且文案是坦克肉鸽融合", () => {
  const home = read("js/home.js");
  assert.match(home, /classic\.html/);
  assert.match(home, /坦克肉鸽|三选一/);
  assert.doesNotMatch(home, /31 格经典小地图/);
  assert.match(home, /无丧尸/);
});

test("经典脚本不引用生存模块或魔兽底栏", () => {
  for (const file of ["js/classic/classic-config.js", "js/classic/classic-rules.js", "js/classic/classic-upgrades.js", "js/classic/classic-engine.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /survival-system/);
    assert.doesNotMatch(source, /survival-assets/);
    assert.doesNotMatch(source, /wc3dock/);
    assert.doesNotMatch(source, /js\/engine\.js/);
  }
});

test("解码 13x13 地图并在底部放置老鹰", () => {
  const map = Rules.decodeMap(Config.MAPS[0]);
  assert.equal(map.tiles.length, 13);
  assert.equal(map.tiles[0].length, 13);
  assert.equal(map.eagle.row, 12);
  assert.equal(map.tiles[map.eagle.row][map.eagle.col], Config.T.BASE);
  assert.ok(map.spawnCols.length >= 1);
});

test("砖可摧毁钢不可摧毁", () => {
  const brick = Rules.resolveShotTile(Config.T.BRICK);
  const steel = Rules.resolveShotTile(Config.T.STEEL);
  assert.equal(brick.destroy, true);
  assert.equal(brick.stop, true);
  assert.equal(steel.destroy, false);
  assert.equal(steel.stop, true);
  assert.equal(Rules.resolveShotTile(Config.T.TREE).stop, false);
});

test("老鹰被毁或命数耗尽都会失败", () => {
  assert.deepEqual(Rules.loseState({ eagleHp: 0, lives: 3 }), { lost: true, reason: "eagle" });
  assert.deepEqual(Rules.loseState({ eagleHp: 4, lives: 0 }), { lost: true, reason: "lives" });
  assert.equal(Rules.loseState({ eagleHp: 4, lives: 2 }).lost, false);
});

test("三选一卡池不含建造经济卡", () => {
  const ids = Upgrades.eligibleCards({}).map((card) => card.id);
  assert.ok(ids.includes("dmg"));
  assert.ok(ids.includes("baseRepair"));
  assert.equal(ids.includes("income"), false);
  assert.equal(ids.includes("builder"), false);
  assert.equal(ids.includes("netmaster"), false);
  assert.equal(Upgrades.isBuildEconomyCard({ id: "income" }), true);
  const picks = Upgrades.pickThree({}, () => 0);
  assert.equal(picks.length, 3);
  assert.ok(picks.every((card) => !Upgrades.isBuildEconomyCard(card)));
});

test("锁定全局镜头在 WASD 与滚轮输入下位置不变", () => {
  const base = Rules.lockedCameraPose();
  const after = Rules.applyCameraInput({
    lookAt: { x: 9, y: 0, z: 9 },
    distance: 12,
    input: { wasd: [1, 0, 0, 1], wheel: -3, arrows: [0, 1, 0, 0] },
  });
  assert.deepEqual(after.lookAt, base.lookAt);
  assert.equal(after.distance, base.distance);
  assert.deepEqual(after.position, base.position);
});

test("波次只刷坦克兵种不含丧尸", () => {
  const allowed = new Set(Object.keys(Config.ENEMY_TYPES));
  for (let wave = 1; wave <= 10; wave++) {
    const composed = Rules.composeWave(wave);
    assert.ok(composed.count >= 5);
    assert.equal(composed.types.length, composed.count);
    assert.ok(composed.types.every((id) => allowed.has(id)));
    assert.equal(composed.types.includes("zombie"), false);
    assert.equal(composed.types.includes("normal") || composed.types.includes("fast") || composed.types.includes("heavy") || composed.types.includes("sniper"), true);
  }
});

test("经典脚本在无 require 的浏览器沙箱里可执行", () => {
  const sandbox = { window: {}, globalThis: null, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of ["js/classic/classic-config.js", "js/classic/classic-upgrades.js", "js/classic/classic-rules.js"]) {
    vm.runInContext(read(file), sandbox, { filename: file });
  }
  assert.equal(sandbox.ClassicConfig.GRID, 13);
  assert.equal(typeof sandbox.ClassicRules.resolveShotTile, "function");
  assert.ok(Array.isArray(sandbox.ClassicUpgrades.CARDS));
});

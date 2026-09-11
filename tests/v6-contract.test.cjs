const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("页面在配置和引擎之前加载生存规则模块", () => {
  const html = read("index.html");
  const scripts=Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g),match=>match[1].split(/[?#]/)[0]);
  const system = scripts.indexOf('js/survival-system.js');
  const config = scripts.indexOf('js/config.js');
  const engine = scripts.indexOf('js/engine.js');
  assert.ok(system >= 0, "缺少 survival-system.js 脚本");
  assert.ok(system < config && config < engine, "生存规则必须先于配置和引擎加载");
});

test("生存开场镜头配置兼顾中部基地与谷口", () => {
  const source = read("js/config.js");
  assert.match(source, /startFocus:\s*\{\s*col:\s*8,\s*row:\s*17\s*\}/);
  const engine = read("js/engine.js");
  assert.match(engine, /startFocus/);
  assert.doesNotMatch(engine, /camFocus\.set\(f\.x\+TILE\*4/);
});

test("生存配置以十波结算且只使用金币与人口", () => {
  const source = read("js/config.js");
  assert.match(source, /victoryWave:\s*10/);
  assert.doesNotMatch(source, /techPoints|techPerSec|techCost/);
  assert.match(source, /id:\s*"research"/);
  assert.match(source, /id:\s*"factory"/);
});

test("生存商店只提供一个标准炮台入口", () => {
  const source = read("js/config.js");
  const survival = source.slice(source.indexOf("SURVIVAL_BUILDS:"), source.indexOf("/* ---- 塔防模式"));
  const turretBuilds = [...survival.matchAll(/kind:\s*"turret"/g)];
  assert.equal(turretBuilds.length, 1);
  assert.match(survival, /id:\s*"turret"/);
});

test("引擎不再维护科技塔或科技点资源", () => {
  const source = read("js/engine.js");
  assert.doesNotMatch(source, /techTowers|techPoints/);
  assert.match(source, /researchInstitutes/);
  assert.match(source, /heavyFactories/);
  assert.match(source, /friendlyUnits/);
});

test("命令卡空槽按子节点数量补满而不是按按钮数量死循环", () => {
  const source = read("js/engine.js");
  assert.doesNotMatch(source, /while\s*\(\s*wrap\.querySelectorAll\(\s*["']\.cmdBtn["']\s*\)\.length\s*<\s*12\s*\)/);
  assert.match(source, /for\s*\(\s*let n=wrap\.children\.length;n<12;n\+\+\)/);
});

test("墙体运行时以五十级为基础上限并允许突破扩展且不创建升级附件", () => {
  const source = read("js/engine.js");
  assert.match(source, /WALL_BASE_MAX_LEVEL\s*=\s*50/);
  assert.match(source, /wallUnlockedMaxLevel/);
  assert.doesNotMatch(source, /boulder-iron-belt/);
  assert.doesNotMatch(source, /boulder-armor-plate/);
  assert.doesNotMatch(source, /boulder-spike/);
  assert.doesNotMatch(source, /boulder-cap/);
});

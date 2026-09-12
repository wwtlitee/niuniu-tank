const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('../lib/three.min.js');
const ZombieDeathEffects = require('../js/zombie-death-effects.js');
const source = fs.readFileSync(require('node:path').resolve(__dirname, '../js/engine.js'), 'utf8');
function engineFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `engine function ${name}`);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}

test('600只尸潮的普通命中仍喷血，沿入射方向且使用高地高度，不创建旧尸块对象', () => {
  const scene = new THREE.Scene(), enemy = { alive: true, group: new THREE.Group(), _lodHeight: 1.2 };
  enemy.group.position.set(2, 3.4, 4);
  const ctx = vm.createContext({ THREE, ZombieDeathEffects, scene, enemy, enemies: Array(600).fill(enemy),
    ACTIVE_MODE: { key: 'survival' }, zombieDeathEffects: null, heightAt: () => 3.4,
    performance: { now: () => 5000 } });
  vm.runInContext(engineFunction('spawnGoreBurst'), ctx);
  vm.runInContext('spawnGoreBurst(enemy,null,new THREE.Vector3(1,0,0));', ctx);
  assert.ok(ctx.zombieDeathEffects, 'dense crowds must use the bounded hit pool');
  const stats = ctx.zombieDeathEffects.inspect();
  assert.equal(stats.hitBursts, 1);
  assert.equal(stats.spawnedByCause.kinetic, 0);
  const drops = ctx.zombieDeathEffects.sample(64).filter(p => p.kind === 'blood');
  assert.ok(drops.length >= 2);
  assert.ok(drops.every(p => p.y > 3.4));
  assert.ok(drops.reduce((sum, p) => sum + p.vx, 0) > 0);
  enemy.alive = false;
  vm.runInContext('spawnGoreBurst(enemy,null,new THREE.Vector3(1,0,0));', ctx);
  assert.equal(ctx.zombieDeathEffects.inspect().hitBursts, 1, 'dead units do not emit a second hit burst');
  assert.equal(scene.children.length, 8);
  ctx.zombieDeathEffects.dispose();
});

test('僵尸换色保留脸部贴图与源材质，裸材质和尸块共用肤色', () => {
  const ctx = vm.createContext({ THREE, ZombieDeathEffects });
  vm.runInContext(engineFunction('createZombieMaterial'), ctx);
  const original = new THREE.MeshStandardMaterial({ color: 0xffffff, map: new THREE.Texture() });
  const variant = new THREE.Texture();
  const face = ctx.createZombieMaterial(original, { texture: variant, skin: true });
  const bare = ctx.createZombieMaterial(new THREE.MeshStandardMaterial(), { skin: true });
  assert.equal(face.map, variant, 'eyes, mouth, hair and wounds survive recoloring');
  assert.equal(original.color.getHex(), 0xffffff, 'shared source is not mutated');
  assert.notEqual(original.map, variant);
  assert.equal(bare.color.getHex(), ZombieDeathEffects.PALETTE.skin);
  assert.ok(face.color.g > bare.color.g, 'textured skin compensates for the baked texture tint');
  assert.equal(face.emissiveIntensity, 0, 'ordinary zombies do not glow');
});

test('非致死血喷从实际弹丸命中点产生，调用方位置不被修改', () => {
  const fx = ZombieDeathEffects.create({ THREE, scene: new THREE.Scene(), heightAt: () => 3.4, random: () => .5 });
  const enemy = { group: new THREE.Group(), _lodHeight: 1.2 };
  enemy.group.position.set(2, 3.4, 4);
  const hitPoint = new THREE.Vector3(2.2, 4.35, 4.1);
  fx.hit(enemy, { hitPoint, hitDirection: new THREE.Vector3(1, 0, 0) });
  const drops = fx.sample(64).filter(p => p.kind === 'blood');
  assert.ok(drops.every(p => Math.abs(p.y - hitPoint.y) < .08));
  assert.deepEqual(hitPoint.toArray(), [2.2, 4.35, 4.1]);
  fx.dispose();
});

test('重新选中建筑退出放置模式，清掉旧建造预览', () => {
  const ctx = vm.createContext({ wc3Sel: { kind: 'base' }, wc3Selection: [], wc3BuildMode: true,
    buildSel: 7, ghost: { visible: true }, wc3CommandPage: 'root', wc3ExtraRings: [],
    wc3ClearSel() {}, wc3UpdateSelectionRing() {}, $: () => null,
    closeWc3Build() { ctx.wc3BuildMode = false; ctx.buildSel = null; ctx.ghost = null; } });
  vm.runInContext(engineFunction('wc3SetSelection'), ctx);
  ctx.wc3SetSelection([{ kind: 'turret', ref: { group: new THREE.Group() } }]);
  assert.equal(ctx.wc3Sel.kind, 'turret');
  assert.equal(ctx.wc3BuildMode, false);
  assert.equal(ctx.buildSel, null);
  assert.equal(ctx.ghost, null);
});

test('命令卡替换按钮时立即清除旧悬浮说明', () => {
  const tip = { style: { display: 'block' } }, wrap = { dataset: {}, addEventListener() {}, innerHTML: '', children: [], childElementCount: 0 };
  const ctx = vm.createContext({ $: id => id === 'wc3tip' ? tip : wrap,
    activateCmdCardItem() {}, activateCmdCardProgrammaticClick() {},
    decorateUpgradeCommands: items => items, commandItemsForSelection: () => [],
    wc3Sel: null, _cmdCardSignature: 'previous' });
  vm.runInContext(engineFunction('renderCmdCard'), ctx);
  ctx.renderCmdCard();
  assert.equal(tip.style.display, 'none');
});

test('同一帧基地被前排摧毁后，后排寻路不再读取已释放基地', () => {
  const ctx = vm.createContext({ baseGroup: null, THREE, TILE: 4,
    cellOf: () => ({ x: 2, z: 2 }), inMap: () => true, flowField: null });
  vm.runInContext(engineFunction('baseContactDistance'), ctx);
  vm.runInContext(engineFunction('flowDirFor'), ctx);
  const enemy = { group: new THREE.Group(), radius: .3 };
  assert.equal(ctx.baseContactDistance(enemy), Infinity);
  const result = ctx.flowDirFor(enemy);
  assert.equal(result.best, null);
  assert.equal(result.atGate, false);
});

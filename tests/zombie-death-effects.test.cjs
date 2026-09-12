const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('../lib/three.min.js');
const DeathEffects = require('../js/zombie-death-effects.js');

function setup() {
  let seed = 19;
  const scene = new THREE.Scene();
  const effects = DeathEffects.create({ THREE, scene, heightAt: () => 3.4,
    random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) });
  const enemy = { group: new THREE.Group(), radius: .3, _lodHeight: 1.6 };
  enemy.group.position.set(4, 3.4, 2);
  return { effects, scene, enemy };
}

test('死亡归因来自实际武器，不把普通减速或灼烧中的动能击杀误判为冰火', () => {
  for (const weapon of ['frost', 'ice', 'freeze']) assert.equal(DeathEffects.resolveCause({ projectileType: weapon }), 'freeze');
  for (const weapon of ['incendiary', 'flame', 'burn']) assert.equal(DeathEffects.resolveCause({ weapon }), 'burn');
  for (const weapon of ['grenade', 'mortar', 'missile', 'cannon', 'bomb']) assert.equal(DeathEffects.resolveCause({ projectileType: weapon }), 'explosive');
  for (const weapon of ['laser', 'rail', 'arc', 'emp']) assert.equal(DeathEffects.resolveCause({ damageType: weapon }), 'energy');
  assert.equal(DeathEffects.resolveCause({ projectileType: 'shotgun' }, { slowMult: .5, burnRemaining: 3 }), 'kinetic');
});

test('冰碎、焦尸余烬、爆炸断肢使用不同批次，爆炸沿入射方向飞散', () => {
  const { effects, enemy } = setup();
  effects.spawn(enemy, { projectileType: 'frost' });
  assert.ok(effects.inspect().pools.ice.active > 0);
  assert.equal(effects.inspect().pools.blood.active, 0);
  effects.clear();
  effects.spawn(enemy, { projectileType: 'incendiary' });
  assert.ok(effects.inspect().pools.char.active > 0);
  assert.ok(effects.inspect().pools.ember.active > 0);
  assert.equal(effects.inspect().pools.blood.active, 0);
  effects.clear();
  effects.spawn(enemy, { projectileType: 'grenade', hitDirection: new THREE.Vector3(1, 0, 0) });
  const pieces = effects.sample(128).filter(p => p.kind === 'limb' || p.kind === 'head');
  assert.ok(pieces.length >= 4);
  assert.ok(pieces.reduce((sum, p) => sum + p.vx, 0) / pieces.length > 2);
  assert.ok(effects.inspect().pools.blood.active > 0);
  effects.dispose();
});

test('4000只同时死亡不增长场景节点、材质或粒子上限，清空可重用', () => {
  const { effects, scene, enemy } = setup();
  const objects = scene.children.slice(), geometries = objects.map(o => o.geometry), materials = objects.map(o => o.material);
  for (const mesh of objects) assert.equal(mesh.instanceColor.count, mesh.instanceMatrix.count, 'idle r128 batches retain full color capacity');
  for (let i = 0; i < 4000; i++) effects.spawn(enemy, { projectileType: ['frost', 'incendiary', 'grenade', 'rail'][i % 4] });
  const full = effects.inspect();
  assert.ok(full.activePieces <= full.maxPieces);
  assert.ok(full.maxPieces <= 1600);
  assert.ok(full.droppedPieces > 0);
  assert.deepEqual(scene.children, objects);
  assert.deepEqual(scene.children.map(o => o.geometry), geometries);
  assert.deepEqual(scene.children.map(o => o.material), materials);
  for (let i = 0; i < 900; i++) effects.update(1 / 60);
  assert.equal(effects.inspect().activePieces, 0);
  assert.equal(effects.inspect().drawCalls, 0);
  effects.spawn(enemy, { projectileType: 'cannon' });
  assert.ok(effects.inspect().activePieces > 0);
  effects.clear();
  assert.equal(effects.inspect().activePieces, 0);
  effects.dispose();
  assert.equal(scene.children.length, 0);
});

test('远景减少碎块而保持武器语义，碎块落在实际高地且无非法数值', () => {
  const near = setup(), far = setup();
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 1000);
  camera.position.set(4, 20, 15);
  near.effects.update(0, camera, 900);
  near.effects.spawn(near.enemy, { projectileType: 'grenade' });
  camera.position.set(4, 180, 160);
  far.effects.update(0, camera, 900);
  far.effects.spawn(far.enemy, { projectileType: 'grenade' });
  assert.ok(far.effects.inspect().activePieces < near.effects.inspect().activePieces);
  assert.equal(far.effects.inspect().lastCause, 'explosive');
  for (let i = 0; i < 180; i++) far.effects.update(1 / 60);
  for (const piece of far.effects.sample(128)) {
    assert.ok(piece.y >= 3.39, JSON.stringify(piece));
    assert.ok(Number.isFinite(piece.x + piece.y + piece.z));
  }
  far.effects.update(NaN); far.effects.update(-1);
  assert.equal(far.effects.spawn(null), false);
  const invalid = { group: { position: { x: NaN, y: 0, z: 0 } } };
  assert.equal(far.effects.spawn(invalid), false);
  near.effects.dispose(); far.effects.dispose();
});

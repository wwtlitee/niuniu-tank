const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('../lib/three.min.js');
const DeathEffects = require('../js/zombie-death-effects.js');

function setup() {
  let seed = 17;
  const scene = new THREE.Scene();
  const effects = DeathEffects.create({ THREE, scene, heightAt: () => 0,
    random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) });
  const enemy = { group: new THREE.Group(), _lodHeight: 1.6 };
  return { scene, effects, enemy };
}

test('尸块外皮与活体共用暗绿调色，血肉拥有可读撕裂面且血滴是拉长喷射', () => {
  const { scene, effects, enemy } = setup();
  assert.ok(DeathEffects.PALETTE && Object.isFrozen(DeathEffects.PALETTE));
  const mesh = scene.getObjectByName('zombie-death-limb');
  const colors = mesh.geometry.getAttribute('color');
  const skin = new THREE.Color(DeathEffects.PALETTE.skin);
  let skinVertices = 0;
  for (let i = 0; i < colors.count; i++) {
    if (Math.abs(colors.getX(i) - skin.r) < 1e-6 && Math.abs(colors.getY(i) - skin.g) < 1e-6 && Math.abs(colors.getZ(i) - skin.b) < 1e-6) skinVertices++;
  }
  assert.ok(skinVertices > 0, 'baked remains use the exported live-skin palette');
  effects.spawn(enemy, { projectileType: 'cannon', hitDirection: new THREE.Vector3(1, 0, 0) });
  const drops = effects.sample(128).filter(piece => piece.kind === 'blood');
  assert.ok(drops.length >= 12, 'explosive spray reads as a burst rather than two pinpoints');
  assert.ok(drops.every(piece => piece.stretch > 1.5 && piece.tint !== 0xffffff));
  assert.ok(drops.reduce((sum, piece) => sum + piece.vx, 0) / drops.length > 2);
  effects.dispose();
});

test('远景非致死受击保留两滴可读血喷且全局预算限制持续弹幕', () => {
  const { scene, effects, enemy } = setup();
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 1000);
  camera.position.set(0, 180, 160);
  effects.update(0, camera, 900);
  assert.equal(effects.hit(enemy, { projectileType: 'bullet', hitDirection: new THREE.Vector3(1, 0, 0) }), true);
  assert.equal(effects.inspect().pools.blood.active, 2);
  assert.equal(effects.inspect().spawnedByCause.kinetic, 0, 'hits must not increment kill metrics');
  const nodes = scene.children.slice();
  for (let i = 0; i < 2000; i++) effects.hit({ group: enemy.group, _lodHeight: 1.6 }, { projectileType: 'bullet' });
  assert.ok(effects.inspect().pools.blood.active <= 24, 'same-frame global hit budget');
  assert.ok(effects.inspect().droppedHitBursts > 0);
  assert.deepEqual(scene.children, nodes);
  effects.update(.1, camera, 900);
  assert.equal(effects.hit(enemy, { projectileType: 'bullet' }), true, 'budget replenishes during simulation');
  effects.clear();
  assert.equal(effects.hit(enemy, { projectileType: 'bullet' }), true, 'clear resets the per-unit throttle too');
  effects.dispose();
});

test('冰火与能量受击没有红血，死亡形态和非致死喷射保持分离', () => {
  const { effects, enemy } = setup();
  for (const projectileType of ['frost', 'incendiary', 'rail']) {
    assert.equal(effects.hit(enemy, { projectileType }), false);
    effects.spawn(enemy, { projectileType });
    assert.equal(effects.inspect().pools.blood.active, 0);
    effects.clear();
  }
  assert.equal(effects.hit(null), false);
  assert.equal(effects.hit({ group: { position: { x: 0, y: Infinity, z: 0 } } }), false);
  effects.dispose();
  assert.equal(effects.hit(enemy, { projectileType: 'bullet' }), false);
});

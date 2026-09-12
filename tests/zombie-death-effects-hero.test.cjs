const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('../lib/three.min.js');

test('英雄霜冻、火焰持续伤害和导弹溅射保留实际致死来源', () => {
  const hits = [], enemy = { alive: true, group: new THREE.Group() };
  const ctx = vm.createContext({ THREE, performance: { now: () => 1e6 }, enemies: [enemy],
    isEnemyCombatTarget: e => !!e?.alive, damageEnemy: (e, damage, options) => hits.push({ e, damage, options }),
    spawnParticles: () => {}, scene: new THREE.Scene(), disposeTransientObject3D: () => {}, enemyAimPoint: e => e.group.position.clone() });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js/hero-runtime.js'), 'utf8'), ctx);
  ctx.enemy = enemy;
  vm.runInContext("heroHit(enemy,3,.2,{projectileType:'frost',hitDirection:new THREE.Vector3(1,0,0)});heroBurns.set(enemy,{t:2,damage:4});updateHeroEffects(.25);heroSplash(new THREE.Vector3(),5,3,'missile');", ctx);
  assert.equal(hits[0].options.projectileType, 'frost');
  assert.equal(hits[0].options.armorPierce, .2);
  assert.equal(hits[0].options.source, 'hero');
  assert.equal(hits[1].options.projectileType, 'flame');
  assert.equal(hits[1].damage, 1);
  assert.equal(hits[2].options.projectileType, 'missile');
  assert.equal(hits[2].options.explosionOrigin.x, 0);
});

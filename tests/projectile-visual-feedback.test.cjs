const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('../lib/three.min.js');
const SurvivalSystem = require('../js/survival-system.js');
const engine = fs.readFileSync(path.resolve(__dirname, '../js/engine.js'), 'utf8');
function engineFunction(name) {
  const start = engine.indexOf(`function ${name}(`), end = engine.indexOf('\n}', start + 1);
  assert.ok(start >= 0 && end > start, name);
  return engine.slice(start, end + 2);
}
function setup() {
  const hits = [];
  const ctx = vm.createContext({ THREE, SurvivalSystem, performance: { now: () => 1e6 },
    ACTIVE_MODE: { key: 'survival' }, window: {}, scene: new THREE.Scene(),
    particles: [], particlePool: [], PARTICLE_LIMIT: 1400, bullets: [], TURRET_PROJECTILE_SPEED: 27,
    game: { stats: { critChance: 0 } }, enemies: [], friendlyUnits: [], player: null,
    baseAlive: false, baseGroup: null, HALF: 100, heightAt: () => 0,
    cellOf: () => ({ x: 0, z: 0 }), inMap: () => true, grid: [[0]],
    T_BRICK: 1, T_STEEL: 2, T_BUILDING: 3, T_WATER: 4, camShake: 0,
    sfx: { hit() {}, shoot() {}, levelup() {}, boom() {} }, spawnGoreBurst() {}, applyIncendiaryHit() {},
    destroyBricksAround() {}, disposeTransientObject3D() {},
    damageEnemy: (enemy, damage, options) => { enemy.hp -= damage; hits.push({ damage, options }); },
  });
  for (const name of ['makeProjectileMesh', 'spawnParticles', 'projectileImpactFx', 'shoot', 'bulletCollide', 'updateBullets']) vm.runInContext(engineFunction(name), ctx);
  function shot() {
    ctx.owner = { group: new THREE.Group(), dmg: 3, blast: 0 };
    vm.runInContext("shoot(owner,new THREE.Vector3(1,0,0),true,{origin:new THREE.Vector3(0,1,0),thruWall:true,source:'turret',projectileType:'tank'})", ctx);
    const bullet = ctx.bullets[0];bullet._trailT = 10;ctx.particles.length = 0;
    return bullet;
  }
  return { ctx, hits, shot };
}

test('标准弹丸使用细窄实体弹壳，视觉改动保持发射速度、伤害和寿命', () => {
  const { ctx, shot } = setup();
  const bullet = shot(), size = new THREE.Box3().setFromObject(bullet.mesh).getSize(new THREE.Vector3());
  assert.ok(size.x <= .6 && size.y <= .16 && size.z <= .16, `rendered shell bounds ${size.toArray()}`);
  const solids = [];bullet.mesh.traverse(mesh => { if (mesh.material?.isMeshStandardMaterial) solids.push(mesh.material); });
  assert.ok(solids.length >= 2, 'shell casing and tip are separately readable surfaces');
  assert.ok(solids.every(material => Math.max(material.emissive.r, material.emissive.g, material.emissive.b) * material.emissiveIntensity < .2));
  assert.equal(bullet.vel.length(), 27);assert.equal(bullet.dmg, 3);assert.equal(bullet.life, 3);assert.equal(bullet.blast, 0);
  assert.equal(ctx.bullets.length, 1);
});

test('同一标准弹实际命中人体取消两层火星，命中钢墙保留短促火星', () => {
  const flesh = setup(), target = { group: new THREE.Group(), alive: true, radius: .3, hp: 100, spawnFlash: 0 };
  target.group.position.set(.8, 1, 0);flesh.ctx.enemies.push(target);
  const bullet = flesh.shot();
  vm.runInContext('updateBullets(.02)', flesh.ctx);
  assert.equal(target.hp, 97);assert.equal(flesh.hits.length, 1);
  assert.equal(bullet.impactSurface, 'flesh');
  assert.equal(flesh.ctx.bullets.length, 0);
  assert.equal(flesh.ctx.particles.length, 0, 'flesh impact is rendered by blood, without either legacy warm-white cloud');
  const armor = setup(), armorBullet = armor.shot();armorBullet.thruWall = false;armor.ctx.grid[0][0] = 2;
  vm.runInContext('updateBullets(.02)', armor.ctx);
  assert.equal(armorBullet.impactSurface, 'armor');
  assert.ok(armor.ctx.particles.length > 0 && armor.ctx.particles.length <= 3);
  assert.ok(armor.ctx.particles.every(p => p.total <= .2 && p.size <= .18));
});

test('穿透人体后的弹体不会把上次人体标记错误带到后续钢墙碰撞', () => {
  const { ctx, hits, shot } = setup(), target = { group: new THREE.Group(), alive: true, radius: .3, hp: 100, spawnFlash: 0 };
  target.group.position.set(.8, 1, 0);ctx.enemies.push(target);
  const bullet = shot();bullet.pierceLeft = 1;
  vm.runInContext('updateBullets(.02)', ctx);
  assert.equal(hits.length, 1);assert.equal(ctx.bullets.length, 1);
  bullet.thruWall = false;ctx.grid[0][0] = 2;
  vm.runInContext('updateBullets(.02)', ctx);
  assert.equal(bullet.impactSurface, 'armor');assert.equal(ctx.bullets.length, 0);
  assert.ok(ctx.particles.length > 0 && ctx.particles.length <= 3);
});

test('冰火与爆炸仍有武器命中反馈，短火星寿命不改变其他粒子的生命周期', () => {
  const { ctx } = setup();
  for (const type of ['emp', 'incendiary', 'cannon']) {
    ctx.type = type;ctx.particles.length = 0;
    vm.runInContext("projectileImpactFx(type,new THREE.Vector3(),'flesh')", ctx);
    assert.ok(ctx.particles.length > 3, type);
  }
  ctx.particles.length = 0;
  vm.runInContext('spawnParticles(new THREE.Vector3(),0xffcc66,1,1,.1,.14)', ctx);
  assert.equal(ctx.particles[0].total, .14);
  vm.runInContext('spawnParticles(new THREE.Vector3(),0xffcc66,1,1,.1)', ctx);
  assert.ok(ctx.particles[1].total >= .5 && ctx.particles[1].total <= .9);
});

test('霜冻命中使用冷色冰屑，不回退为普通炮弹的黄色火星', () => {
  const { ctx } = setup();
  vm.runInContext("projectileImpactFx('frost',new THREE.Vector3(),'flesh')", ctx);
  assert.ok(ctx.particles.length > 3);
  assert.ok(ctx.particles.every(p => p.color.b > p.color.r));
  assert.ok(ctx.particles.every(p => p.total <= .35 && p.size <= .35));
});

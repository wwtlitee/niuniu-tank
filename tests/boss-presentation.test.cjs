'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { chromium } = require('playwright'),
  { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');
test('第五波 Boss 被真实炮弹击杀后停止锁定，周围尸群和后续同皮肤敌人保留模型', async () => {
  const server = await createStaticServer(path.resolve(__dirname, '..')),
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=d3d11'],
    });
  const errors = [];
  try {
    const p = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
    await p.waitForFunction(() => typeof state !== 'undefined' && state === 7);
    await p.evaluate(() => {
      state = STATE.PAUSED;
      game.wave = 5;
      game.gold = 1e6;
      game.gateHp = 1e8;
      game.stats.empLv = game.stats.mortarLv = 0;
      updateCamera = () => {};
      document.getElementById('hud').style.display = 'none';
      spawnEnemy(null, true, 5);
      window.testBoss = enemies.at(-1);
      const c = cellCenter(15, 16);
      testBoss.group.position.set(c.x, 0, c.z);
      testBoss.spawnFlash = 0;
      testBoss.hp = testBoss.maxHp = 30;
      testBoss.stunUntil = Infinity;
      if (testBoss.beam) {
        scene.remove(testBoss.beam);
        testBoss.beam = null;
      }
      for (let i = 0; i < 240; i++) {
        spawnEnemy('normal', false, 5);
        const e = enemies.at(-1),
          q = cellCenter(16 + (i % 3), 3 + Math.floor(i / 36));
        e.group.position.set(q.x + (i % 5) * 0.4, 0, q.z + Math.floor((i % 12) / 3) * 0.4);
        e.spawnFlash = 0;
        e.stunUntil = Infinity;
        if (e.beam) {
          scene.remove(e.beam);
          e.beam = null;
        }
      }
      const g = makeTurretMesh('rapid');
      g.position.set(c.x - 12, 2.2, c.z);
      scene.add(g);
      const t = {
        group: g,
        turretKey: 'rapid',
        kind: 'rapid',
        level: 4,
        cd: 0,
        fireCd: 0.2,
        dmg: 5,
        range: 40,
        lockTarget: testBoss,
      };
      builtTurrets.push(t);
      applyTurretLevelVisual(t);
      _visionSourceCache = [{ x: c.x, z: c.z, radius: 100 }];
      camFocus.set(c.x, 0, c.z);
      camera.position.set(c.x - 8, 32, c.z + 30);
      camera.lookAt(c.x - 4, 2, c.z);
      updateCrowdLod();
      renderer.render(scene, camera);
    });
    fs.mkdirSync('output/combat-controls', { recursive: true });
    await p.screenshot({ path: 'output/combat-controls/boss-alive.png' });
    const result = await p.evaluate(() => {
      let bossShots = 0,
        invalidShots = 0;
      const original = shoot;
      shoot = (...args) => {
        const target = builtTurrets[0].lockTarget;
        if (target === testBoss) bossShots++;
        if (!target?.alive || target.group.parent !== scene) invalidShots++;
        return original(...args);
      };
      for (let i = 0; i < 1200 && testBoss.alive; i++) {
        _animFrame++;
        updateEnemies(0.025);
        updateBuiltTurrets(0.025);
        updateBullets(0.025);
      }
      const shotsAtDeath = bossShots,
        dead = !testBoss.alive;
      for (let i = 0; i < 160; i++) {
        _animFrame++;
        updateEnemies(0.025);
        updateBuiltTurrets(0.025);
        updateBullets(0.025);
        updateCrowdLod();
      }
      const targetsDeadBoss = builtTurrets.some((t) => t.lockTarget === testBoss),
        afterDeathShots = bossShots - shotsAtDeath;
      spawnEnemy('normal', false, 5);
      const fresh = enemies.at(-1),
        c = cellCenter(15, 16);
      fresh.group.position.set(c.x, heightAt(c.x, c.z), c.z);
      fresh.spawnFlash = 0;
      if (fresh.beam) {
        scene.remove(fresh.beam);
        fresh.beam = null;
      }
      _animFrame++;
      updateCrowdLod();
      renderer.render(scene, camera);
      const living = enemies.filter((e) => e.alive),
        detail = living.filter((e) => !e._crowdLod && e.group.visible).length,
        batch = crowdLodMesh.count;
      return {
        dead,
        bossShots: shotsAtDeath,
        afterDeathShots,
        invalidShots,
        targetsDeadBoss,
        removed: !testBoss.group.parent,
        released: testBoss._resourcesReleased,
        living: living.length,
        detail,
        batch,
        allAttached: living.every((e) => e.group.parent === scene && !e._resourcesReleased),
        freshVisible: fresh.group.visible || fresh._crowdLod,
      };
    });
    await p.screenshot({ path: 'output/combat-controls/boss-after-death.png' });
    fs.writeFileSync(
      'output/combat-controls/boss-death.json',
      JSON.stringify({ ...result, errors }, null, 2),
    );
    assert.ok(result.dead && result.bossShots > 0, '必须由真实炮弹击杀');
    assert.equal(result.afterDeathShots, 0);
    assert.equal(result.invalidShots, 0);
    assert.equal(result.targetsDeadBoss, false);
    assert.ok(result.removed && result.released && result.allAttached && result.freshVisible);
    assert.equal(result.detail + result.batch, result.living);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

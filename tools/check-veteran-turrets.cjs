'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createStaticServer } = require('./asset-runtime-catalog.cjs');
(async () => {
  const root = path.resolve(__dirname, '..'),
    out = path.join(root, 'output/combat-controls');
  fs.mkdirSync(out, { recursive: true });
  const server = await createStaticServer(root),
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=d3d11'],
    });
  const report = { errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`,
    );
    await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
    await page.evaluate(() => {
      game.prepTime = 10000;
      game.gold = 100000;
      questActive = false;
      hideQuestPanel();
      updateGoldUI();
      updateResUI();
      updateDockRes();
    });
    await page.keyboard.press('g');
    await page.screenshot({ path: path.join(out, 'base-shortcuts.png') });
    report.repair = await page.evaluate(() => {
      state = STATE.PAUSED;
      updateCamera = () => {};
      document.getElementById('hud').style.display = 'none';
      let origin;
      for (let z = 4; z < GRID - 4 && !origin; z++)
        for (let x = 2; x < 10; x++) {
          const p = cellCenter(x, z),
            q = { x: p.x + 12, z: p.z };
          if (
            heightAt(p.x, p.z) > PH - 0.1 &&
            heightAt(q.x, q.z) > PH - 0.1 &&
            !blockedForTank(p.x, p.z, 1.2, PH, false, true) &&
            !blockedForTank(q.x, q.z, 1.2, PH, false, true)
          ) {
            origin = p;
            break;
          }
        }
      if (!origin) throw new Error('No support fixture floor');
      const unit = createFriendlyUnit('repair', origin),
        target = createFriendlyUnit('heavy', { x: origin.x + 12, z: origin.z });
      target.hp -= 100;
      updateMedicalBeacons(0.4);
      updateFriendlyUnits(0.4);
      const p = unit.group.position;
      camera.position.set(p.x + 12, p.y + 15, p.z + 23);
      camera.lookAt(p.x + 6, p.y, p.z);
      renderer.render(scene, camera);
      return {
        range: unit.range,
        healed: 100 - (target.maxHp - target.hp),
        links: medicalHealingLinks.filter((l) => l.visible).length,
      };
    });
    await page.screenshot({ path: path.join(out, 'remote-repair.png') });
    report.models = await page.evaluate(() => {
      state = STATE.PAUSED;
      updateCamera = () => {};
      document.getElementById('hud').style.display = 'none';
      for (const c of scene.children) c.visible = !!c.isLight;
      scene.fog = null;
      scene.background = new THREE.Color(0x182126);
      const light = new THREE.HemisphereLight(0xd8e7ed, 0x586572, 1.4);
      scene.add(light);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x303c40, roughness: 0.9 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.02;
      scene.add(floor);
      const rows = [];
      window.showcaseModels = [];
      for (const [i, key] of ['rapid', 'cannon', 'antitank', 'emp'].entries()) {
        for (const level of [0, 4]) {
          const group = makeTurretMesh(key);
          applyTurretLevelVisual({ group, turretKey: key, level });
          group.position.set((i - 1.5) * 7, 0, level === 4 ? 5 : -5);
          scene.add(group);
          showcaseModels.push(group);
          let meshes = 0,
            triangles = 0;
          group.traverse((o) => {
            if (o.isMesh) {
              meshes++;
              triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
            }
          });
          rows.push({ key, level: level + 1, meshes, triangles });
        }
      }
      camera.position.set(0, 23, 32);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      const label = document.createElement('div');
      label.style.cssText =
        'position:fixed;top:30px;left:0;width:100%;text-align:center;color:#d4e3df;font:18px sans-serif;letter-spacing:3px';
      label.textContent = '后排 Lv1 / 前排 Lv5　　速射机炮 · 范围火炮 · 反装甲炮 · 激光炮';
      document.body.append(label);
      return rows;
    });
    await page.screenshot({ path: path.join(out, 'veteran-models.png') });
    report.mines = await page.evaluate(() => {
      for (const g of showcaseModels) g.visible = false;
      document.body.lastElementChild.textContent = '金库等级体量　Lv1 → Lv6';
      const rows = [];
      for (let level = 1; level <= 6; level++) {
        const group = makeGoldmineVisual(),
          mine = { group, visualRoot: group.userData.visualRoot, level };
        upgradeGoldMineVisual(mine);
        group.position.set((level - 3.5) * 4, 0, 0);
        scene.add(group);
        const box = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
        rows.push({ level, size: box.toArray() });
      }
      camera.position.set(0, 12, 24);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      return rows;
    });
    await page.screenshot({ path: path.join(out, 'mine-growth.png') });
    assert.ok(report.models.every((m) => m.meshes < 38 && m.triangles < 18000));
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'veteran-models.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

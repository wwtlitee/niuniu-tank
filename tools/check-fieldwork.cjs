'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright'),
  { createStaticServer } = require('./asset-runtime-catalog.cjs');
(async () => {
  const root = path.resolve(__dirname, '..'),
    out = path.join(root, 'output/fieldwork');
  fs.mkdirSync(out, { recursive: true });
  const server = await createStaticServer(root),
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
  const report = { errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
    await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
    report.frameLoaded = await page.evaluate(async () => {
      const i = new Image();
      i.src = 'assets/ui/field-frame.svg';
      await i.decode();
      return i.naturalWidth === 96;
    });
    await page.evaluate(() => {
      state = STATE.PAUSED;
      questActive = false;
      hideQuestPanel();
      game.gold = 100000;
      game.popMax = 100;
      wc3Select('base', baseSelectionRef());
      wc3RenderSel();
      renderCmdCard();
      updateResUI();
      updateGoldUI();updateDockRes();
    });
    await page.screenshot({ path: out + '/hud.png' });
    await page.evaluate(() => {
      document.getElementById('hud').style.display = 'none';
      updateCamera = () => {};
      wc3Selection.length = 0;
      wc3Sel = null;
      wc3RenderSel();
      const p = baseGroup.position;
      camera.position.set(p.x + 9, p.y + 10, p.z + 17);
      camera.lookAt(p.x, p.y + 2, p.z + 0.5);
      renderer.render(scene, camera);
      const b = shopList().find((b) => b.id === 'house');
      const origin = cellOf(p.x, p.z);
      for (let dz = 2; dz < 6 && !constructionJobs.length; dz++)
        for (let dx = 2; dx < 6; dx++)
          if (
            footprintPlaceable({ x: origin.x + dx, z: origin.z + dz }, b) &&
            queueConstruction(b, { x: origin.x + dx, z: origin.z + dz })
          )
            break;
      if (!constructionJobs.length) throw new Error('Missing reachable construction');
      updateConstruction(0.2);
      renderer.render(scene, camera);
    });
    await page.screenshot({ path: out + '/base-departure.png' });
    await page.evaluate(() => {
      const j = constructionJobs[0];
      for (let i = 0; i < 500 && j.phase !== 'building'; i++) updateConstruction(0.04);
      j.elapsed = j.duration * 0.4;
      updateConstruction(0.01);
      const p = j.site.position;
      camera.position.set(p.x + 7, p.y + 7, p.z + 12);
      camera.lookAt(p.x, p.y + 1.5, p.z);
      renderer.render(scene, camera);
    });
    await page.screenshot({ path: out + '/worker-construction.png' });
    report.promotion = await page.evaluate(() => {
      const j = constructionJobs[0],
        model = j.preview;
      j.elapsed = j.duration - 0.001;
      updateConstruction(0.01);
      const retained = builtHouses.some((h) => h.group === model);
      for (let i = 0; i < 1000 && !j.portal; i++) updateConstruction(0.03);
      if (!j.portal) throw new Error('No return portal');
      for (let i = 0; i < 15; i++) updateConstruction(0.03);
      const p = baseGroup.position;
      camera.position.set(p.x + 9, p.y + 10, p.z + 17);
      camera.lookAt(p.x, p.y + 2, p.z + 0.5);
      renderer.render(scene, camera);
      return { retained, returning: j.portal?.direction === 'in' };
    });
    await page.screenshot({ path: out + '/base-return.png' });
    report.models = await page.evaluate(() => {
      clearConstruction();
      baseGroup.visible = false;
      const display = new THREE.Group();
      scene.add(display);
      const p = baseGroup.position;
      const counts = [];
      for (const [kind, x] of [
        ['base', -9],
        ['research', 0],
        ['factory', 9],
      ]) {
        const m = makeBuildingModel(kind);
        m.position.set(p.x + x, p.y, p.z);
        display.add(m);
        let meshes = 0,
          triangles = 0;
        m.traverse((o) => {
          if (o.isMesh) {
            meshes++;
            triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
          }
        });
        counts.push({ kind, meshes, triangles });
      }
      camera.position.set(p.x + 9, p.y + 16, p.z + 34);
      camera.lookAt(p.x, p.y + 2, p.z);
      renderer.render(scene, camera);
      window.fieldDisplay = display;
      return counts;
    });
    await page.screenshot({ path: out + '/buildings.png' });
    report.worker = await page.evaluate(() => {
      fieldDisplay.visible = false;
      const worker = makeConstructionWorker();
      const p = baseGroup.position;
      worker.position.copy(p);
      worker.scale.setScalar(3);
      scene.add(worker);
      camera.position.set(p.x + 4, p.y + 4, p.z + 8);
      camera.lookAt(p.x, p.y + 3, p.z);
      renderer.render(scene, camera);
      let meshes = 0,
        triangles = 0;
      worker.traverse((o) => {
        if (o.isMesh) {
          meshes++;
          triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
        }
      });
      return { meshes, triangles };
    });
    await page.screenshot({ path: out + '/worker-detail.png' });
    assert.ok(report.frameLoaded && report.promotion.retained && report.promotion.returning);
    assert.ok(report.models.every((m) => m.meshes <= 8 && m.triangles < 22000));
    assert.equal(report.worker.meshes, 3);
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

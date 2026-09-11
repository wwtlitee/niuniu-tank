const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright'),
  { createStaticServer } = require('./asset-runtime-catalog.cjs');
(async () => {
  const root = path.resolve(__dirname, '..'),
    out = path.join(root, 'output/human-workers');
  fs.mkdirSync(out, { recursive: true });
  const server = await createStaticServer(root),
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 760 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
    await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
    const report = await page.evaluate(() => {
      state = STATE.PAUSED;
      questActive = false;
      hideQuestPanel();
      document.getElementById('hud').style.display = 'none';
      updateCamera = () => {};
      const p = baseGroup.position,
        workers = [],
        gl = renderer.getContext(),
        create = [];
      for (let i = 0; i < 12; i++) {
        const t = performance.now(),
          w = makeConstructionWorker();
        w.position.set(p.x + (i % 4) * 1.1, p.y, p.z + 5 + Math.floor(i / 4) * 1.1);
        scene.add(w);
        updateConstructionWorker(w, 'walk', 0.1);
        const logic = performance.now() - t;
        const r = performance.now();
        renderer.render(scene, camera);
        gl.finish();
        create.push({ logic, draw: performance.now() - r });
        workers.push(w);
      }
      const samples = [];
      for (let i = 0; i < 180; i++) {
        const t = performance.now();
        workers.forEach((w, n) => updateConstructionWorker(w, n % 2 ? 'walk' : 'work', 1 / 60, i / 60));
        samples.push(performance.now() - t);
      }
      samples.sort((a, b) => a - b);
      const result = {
        variants: workers.slice(0, 8).map((w) => w.userData.variantId),
        create,
        animation12: { p50: samples[90], p95: samples[171], max: samples.at(-1) },
        contextLost: gl.isContextLost(),
      };
      workers.forEach((w) => {
        scene.remove(w);
        disposeConstructionWorker(w);
      });
      // Neutral lit contact sheet for examining the original human textures; gameplay lighting is unchanged.
      scene.children.forEach((o) => (o.visible = false));
      scene.background = new THREE.Color(0x142329);
      scene.fog = null;
      const ambient = new THREE.HemisphereLight(0xe5f3ef, 0x71828b, 1.5),
        key = new THREE.DirectionalLight(0xffe8d0, 1.3);
      key.position.set(-4, 8, 8);
      scene.add(ambient, key);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(28, 13),
        new THREE.MeshStandardMaterial({ color: 0x293a3e, roughness: 1 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.02;
      scene.add(floor);
      window.roster = [];
      CONSTRUCTION_WORKER_VARIANTS.forEach((id, i) => {
        const w = makeConstructionWorker(id);
        w.position.set((i - 3.5) * 2.25, 0, 0);
        w.scale.setScalar(1.35);
        scene.add(w);
        updateConstructionWorker(w, 'idle', 0.5 + i * 0.07);
        roster.push(w);
      });
      camera.position.set(0, 3.4, 14);
      camera.lookAt(0, 1.15, 0);
      renderer.render(scene, camera);
      return result;
    });
    await page.setViewportSize({width:1600,height:460});
    await page.evaluate(()=>{camera.fov=22;camera.position.set(0,2.7,14);camera.lookAt(0,1.1,0);camera.updateProjectionMatrix();renderer.render(scene,camera);});
    await page.screenshot({ path: out + '/roster.png' });
    await page.evaluate(() => {
      roster.forEach((w, i) => updateConstructionWorker(w, 'work', 0.12, 0.18 + i * 0.08));
      renderer.render(scene, camera);
    });
    await page.screenshot({ path: out + '/construction-poses.png' });
    assert.equal(new Set(report.variants).size, 8);
    assert.equal(report.contextLost, false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(out + '/verification.json', JSON.stringify({ ...report, errors }, null, 2));
    console.log(JSON.stringify({ ...report, errors }));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

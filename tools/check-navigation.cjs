'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright'),
  { createStaticServer } = require('./asset-runtime-catalog.cjs');
(async () => {
  const root = path.resolve(__dirname, '..'),
    out = path.join(root, 'output/navigation');
  fs.mkdirSync(out, { recursive: true });
  const server = await createStaticServer(root),
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'],
    });
  const report = { errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`,
    );
    await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
    report.worker = await page.evaluate(() => {
      state = STATE.PAUSED;
      game.gold = 100000;
      game.popMax = 100;
      questActive = false;
      hideQuestPanel();
      document.getElementById('hud').style.display = 'none';
      updateCamera = () => {};
      const b = shopList().find((b) => b.id === 'beacon');
      if (!queueConstruction(b, { x: 13, z: 16 })) throw Error('Unable to create site');
      const job = constructionJobs.at(-1),
        trace = [];
      for (let i = 0; i < 2000 && job.phase !== 'building'; i++) {
        updateConstruction(0.025);
        trace.push(job.worker.position.clone());
      }
      if (job.phase !== 'building') throw Error('Worker did not reach the site');
      const route = new THREE.CurvePath();
      for (let i = 1; i < trace.length; i++)
        route.add(
          new THREE.LineCurve3(
            trace[i - 1].clone().add(new THREE.Vector3(0, 0.14, 0)),
            trace[i].clone().add(new THREE.Vector3(0, 0.14, 0)),
          ),
        );
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(route, trace.length, 0.055, 4, false),
        new THREE.MeshBasicMaterial({ color: 0x8ddb83 }),
      );
      scene.add(mesh);
      const p = baseGroup.position;
      camera.position.set(p.x + 6, p.y + 38, p.z + 37);
      camera.lookAt(p.x + 9, p.y, p.z + 1);
      renderer.render(scene, camera);
      return {
        phase: job.phase,
        points: trace.length,
        distance: route.getLength(),
        version: GAME_VERSION,
      };
    });
    await page.screenshot({ path: path.join(out, 'worker-near-route.png') });
    report.audio = await page.evaluate(async () => {
      updateSurvivalSoundscape = () => {};
      const ac = new AudioContext();
      await ac.resume();
      const meter = ac.createAnalyser();
      meter.connect(ac.destination);
      meter.fftSize = 2048;
      SurvivalSoundBank.bind(ac, meter);
      SurvivalSoundBank.setPaused(false);
      await SurvivalSoundBank.preload();
      const started = SurvivalSoundBank.play('groan'),
        overlap = SurvivalSoundBank.play('zombie');
      const samples = new Float32Array(meter.fftSize);
      let peak = 0;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 30; i++) {
        await wait(25);
        meter.getFloatTimeDomainData(samples);
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      }
      await wait(2250);
      const released = SurvivalSoundBank.getStatus().voices === 0,
        quietGapBlocked = !SurvivalSoundBank.play('zombie');
      await wait(4100);
      const next = SurvivalSoundBank.play('zombie');
      const status = SurvivalSoundBank.getStatus();
      SurvivalSoundBank.setPaused(true);
      await ac.close();
      return { started, overlap, peak, released, quietGapBlocked, next, status };
    });
    assert.equal(report.audio.started, true);
    assert.equal(report.audio.overlap, false);
    assert.ok(report.audio.peak > 0.0001, 'Real recording must reach the analyser');
    assert.ok(report.audio.released && report.audio.quietGapBlocked && report.audio.next);
    assert.equal(report.audio.status.ready, 21);
    assert.equal(report.audio.status.failed, 0);
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'visual-audio.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

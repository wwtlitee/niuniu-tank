'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright'),
  { createStaticServer } = require('./asset-runtime-catalog.cjs');
async function main() {
  const root = path.resolve(__dirname, '..'),
    out = path.join(root, 'output/overhaul'),
    server = await createStaticServer(root);
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
  });
  const report = { errors: [], audioRequests: [], layouts: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', (e) => report.errors.push(e.message));
    page.on('response', (r) => {
      if (r.url().includes('/audio/'))
        report.audioRequests.push({ file: r.url().split('/audio/')[1], status: r.status() });
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url + '/index.html');
    await page.waitForFunction(() => assetsReady(), null, { timeout: 60000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: out + '/menu.png' });
    await page.locator('.modeCard').nth(1).click();
    await page.waitForSelector('#difficultySelect:not(.hidden)');
    await page.screenshot({ path: out + '/difficulty.png' });
    await page.locator('[data-difficulty=normal]').click();
    await page.waitForFunction(() => state === 7);
    await page.waitForFunction(() => SurvivalSoundBank.getStatus().ready === 21, null, { timeout: 30000 });
    await page.waitForFunction(() => BGMSystem.getStatus().usingSample, null, { timeout: 15000 });
    await page.screenshot({ path: out + '/survival-idle.png' });
    await page.evaluate(() => {
      questActive = false;
      hideQuestPanel();
      game.gold = 10000;
      wc3Select('base', baseSelectionRef());
      wc3RenderSel();
      renderCmdCard();
    });
    for (const size of [
      { width: 1600, height: 900 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(200);
      const layout = await page.evaluate(() => {
        const boxes = {};
        for (const id of ['topLeft', 'waveInfo', 'resDock', 'mmDock', 'selPanel', 'cmdcard']) {
          const r = document.getElementById(id).getBoundingClientRect();
          boxes[id] = { x: r.x, y: r.y, w: r.width, h: r.height };
        }
        return {
          width: innerWidth,
          height: innerHeight,
          boxes,
          icons: document.querySelectorAll('#cmdcard svg').length,
          emoji: /\p{Extended_Pictographic}/u.test(document.body.innerText),
        };
      });
      report.layouts.push(layout);
      await page.screenshot({ path: out + '/survival-' + size.width + '.png' });
      for (const [id, b] of Object.entries(layout.boxes)) {
        assert.ok(
          b.x >= 0 && b.y >= 0 && b.x + b.w <= size.width + 1 && b.y + b.h <= size.height + 1,
          id + ' within viewport',
        );
      }
      assert.ok(layout.icons > 0);
      assert.equal(layout.emoji, false);
    }
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.keyboard.press('F1');
    await page.waitForSelector('#helpOverlay:not(.hidden)');
    assert.equal(await page.evaluate(() => state), 3);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => state), 3);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => state), 7);
    await page.evaluate(() => setPause(true));
    await page.locator('#pauseSettingsBtn').click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: out + '/settings.png' });
    await page.locator('[data-track-id=prep]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => state), 3);
    assert.equal(await page.evaluate(() => BGMSystem.getStatus().wantPlaying), false);
    await page.locator('#resumeBtn').click();
    assert.equal(await page.evaluate(() => state), 7);
    await page.evaluate(() => BGMSystem.setManualTrack(null));
    report.audio = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      questActive = false;
      game.wave = 1;
      state = STATE.PLAYING;
      game.enemiesToSpawn = 0;
      const enemy = spawnEnemy('normal', false, 1) || enemies.at(-1);
      enemy.group.position.set(camFocus.x + 28, 2, camFocus.z);
      enemy.speed = 0;
      soundscape.nextGroan = 0;
      const before = SurvivalSoundBank.getStatus().played.groan || 0;
      await sleep(1800);
      const heard = (SurvivalSoundBank.getStatus().played.groan || 0) > before;
      const analyser = AC.createAnalyser();
      analyser.fftSize = 2048;
      AudioMixer.bus('master').connect(analyser);
      const data = new Float32Array(2048),
        peaks = [];
      const dest = AC.createMediaStreamDestination();
      AudioMixer.bus('master').connect(dest);
      const chunks = [],
        rec = new MediaRecorder(dest.stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      const finished = new Promise(
        (resolve) =>
          (rec.onstop = async () =>
            resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())))),
      );
      rec.start();
      const events = [
        'small',
        'medium',
        'large',
        'laser',
        'incendiary',
        'grenade',
        'explosion',
        'gate',
        'groan',
        'upgrade',
      ];
      for (const key of events) {
        SurvivalSoundBank.play(key);
        for (let n = 0; n < 6; n++) {
          await sleep(100);
          analyser.getFloatTimeDomainData(data);
          peaks.push(Math.max(...data.map(Math.abs)));
        }
      }
      const upgradeBefore = SurvivalSoundBank.getStatus().played.upgrade || 0;
      for (let i = 0; i < 100; i++) sfx.levelup();
      const upgradeBurst = (SurvivalSoundBank.getStatus().played.upgrade || 0) - upgradeBefore;
      rec.stop();
      const recording = await finished;
      AudioMixer.bus('master').disconnect(dest);
      AudioMixer.setMuted(true);
      await sleep(500);
      analyser.getFloatTimeDomainData(data);
      const mutePeak = Math.max(...data.map(Math.abs));
      AudioMixer.setMuted(false);
      AudioMixer.bus('master').disconnect(analyser);
      return {
        heard,
        upgradeBurst,
        peak: Math.max(...peaks),
        mutePeak,
        bank: SurvivalSoundBank.getStatus(),
        music: BGMSystem.getStatus(),
        recording,
      };
    });
    fs.writeFileSync(out + '/battle-audio.webm', Buffer.from(report.audio.recording));
    delete report.audio.recording;
    assert.equal(report.audio.heard, true, 'recorded groan audible outside old 12-unit radius');
    assert.ok(report.audio.upgradeBurst <= 1);
    assert.ok(report.audio.peak > 0.01 && report.audio.peak < 0.98);
    assert.ok(report.audio.mutePeak < 0.001);
    assert.equal(report.audio.bank.failed, 0);
    await page.evaluate(() => setPause(true));
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => BGMSystem.getStatus().usingSample), false);
    assert.equal(await page.evaluate(() => SurvivalSoundBank.getStatus().voices), 0);
    await page.goto(url + '/classic.html?autotest=1');
    await page.waitForFunction(() => window.classicReady);
    await page.screenshot({ path: out + '/classic.png' });
    await page.evaluate(() => ClassicGame.testClearWave());
    await page.waitForSelector('#classicUpgrade:not(.hidden)');
    await page.screenshot({ path: out + '/classic-upgrade.png' });
    assert.ok(await page.locator('#classicCards svg').count());
    assert.deepEqual(report.errors, []);
    assert.ok(report.audioRequests.every((r) => r.status === 200 || r.status === 206));
    fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

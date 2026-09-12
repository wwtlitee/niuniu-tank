"use strict";

// Real normal-difficulty UI playthrough. The only simulation control is the
// supported advanceTime hook; resources, combat and construction remain native.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return [arg.slice(2, index < 0 ? undefined : index), index < 0 ? true : arg.slice(index + 1)];
}));
const output = path.resolve(__dirname, '../output', String(args.out || 'visual-playthrough-before'));
const url = String(args.url || 'http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival');
const limitSeconds = Number(args.seconds || 900);
assert.ok(Number.isFinite(limitSeconds) && limitSeconds > 0 && limitSeconds <= 3600);
fs.mkdirSync(output, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(), url,
  method: 'Isolated headless browser, normal difficulty, real mouse/keyboard commands, native advanceTime only.',
  viewport: { width: 1600, height: 1000 }, actions: [], captures: [], consoleErrors: [], pageErrors: [],
};
let browser, page;
const saveReport = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));

async function readState() {
  return page.evaluate(() => {
    const data = JSON.parse(window.render_game_to_text());
    const deaths = data.hordePresentation?.deaths?.spawnedByCause || {};
    return { ...data, score: game.score,
      observedKills: Object.values(deaths).reduce((sum, value) => sum + value, 0),
      over: state === STATE.OVER, settled: state === STATE.SETTLE,
      commands: [...document.querySelectorAll('.cmdBtn')].map(button => ({
        label: button.querySelector('.cn')?.textContent, disabled: button.getAttribute('aria-disabled') === 'true',
      })),
      finalText: document.getElementById('gameover')?.classList.contains('hidden') ? null : document.getElementById('finalStats')?.innerText,
      turrets: builtTurrets.map(t => ({ x: t.cx, z: t.cz, branch: t.turretKey, level: t.level })),
    };
  });
}

async function capture(name, note) {
  await page.mouse.move(1450, 450);
  await page.waitForTimeout(100);
  const data = await readState();
  const screenshot = path.join(output, name + '.png');
  await page.screenshot({ path: screenshot });
  fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(data, null, 2));
  report.captures.push({ name, note, screenshot, wave: data.wave, gold: data.resources.gold,
    baseHP: data.gate.hp, kills: data.observedKills, elapsed: data.timeDifficulty.elapsed,
    activeEnemies: data.waveCounts.active, cameraDistance: data.hordePresentation.cameraDistance });
  saveReport();
  process.stdout.write(JSON.stringify({ capture: name, wave: data.wave, kills: data.observedKills, hp: data.gate.hp, elapsed: data.timeDifficulty.elapsed }) + '\n');
  return data;
}

async function advance(seconds) {
  await page.evaluate(ms => window.advanceTime(ms), seconds * 1000);
  return readState();
}

async function cellScreen(x, z, height = .1) {
  return page.evaluate(({ x, z, height }) => {
    const world = cellCenter(x, z);
    const p = new THREE.Vector3(world.x, heightAt(world.x, world.z) + height, world.z).project(camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  }, { x, z, height });
}

async function clickPoint(point) {
  assert.ok(point.x > 0 && point.x < 1600 && point.y > 0 && point.y < 800, 'World target must remain above command UI: ' + JSON.stringify(point));
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(220);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(140);
}

async function command(name) {
  const button = page.locator('.cmdBtn').filter({ has: page.locator('.cn', { hasText: new RegExp('^' + name + '$') }) }).first();
  await button.waitFor({ state: 'visible' });
  assert.equal(await button.getAttribute('aria-disabled'), 'false', name + ' must be affordable and unlocked');
  await button.click();
  await page.waitForTimeout(140);
}

async function build(name, x, z) {
  await page.keyboard.press('b');
  await page.waitForTimeout(160);
  await command(name);
  const before = await readState();
  await clickPoint(await cellScreen(x, z));
  const after = await readState();
  assert.ok(after.resources.gold < before.resources.gold, name + ' placement must spend earned resources');
  report.actions.push({ action: 'build', name, x, z, beforeGold: before.resources.gold, afterGold: after.resources.gold });
}

async function selectTurret(x, z) {
  const point = await page.evaluate(({ x, z }) => {
    const t = builtTurrets.find(item => item.cx === x && item.cz === z);
    if (!t) return null;
    const p = new THREE.Box3().setFromObject(t.group).getCenter(new THREE.Vector3()).project(camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  }, { x, z });
  assert.ok(point, 'Completed turret exists');
  await clickPoint(point);
  assert.equal((await readState()).selected?.kind, 'turret');
}

async function centerGateAndZoom() {
  const gate = await cellScreen(13, 18, 1);
  await page.mouse.move(gate.x, gate.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 470, { steps: 16 });
  await page.mouse.up({ button: 'right' });
  await page.mouse.move(800, 470);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(110);
  }
  await page.waitForTimeout(300);
}

(async () => {
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
    const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof assetsReady === 'function' && assetsReady(), { timeout: 90000 });
    await page.locator('[data-difficulty="normal"]').click();
    await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && state !== STATE.MENU);
    const opening = await capture('01-opening-overview', 'Normal difficulty, untouched starting resources, complete interface visible.');
    report.version = opening.version;
    report.gpu = await page.evaluate(() => {
      const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
      return { vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    });
    assert.equal(opening.difficulty, 'normal');

    await build('金矿', 4, 16);
    await build('标准炮台', 12, 16);
    await build('标准炮台', 12, 20);
    await build('闸门墙', 13, 18);
    await page.keyboard.press('b');
    await capture('02-construction-orders', 'Four mouse placements paid from ordinary starting gold.');

    for (let i = 0; i < 35; i++) {
      const state = await advance(1);
      if (state.structures.turrets >= 2 && state.structures.mines.length >= 1) break;
    }
    assert.equal((await readState()).structures.turrets, 2, 'Both real construction jobs must complete');
    await selectTurret(12, 16);
    await capture('03-legal-specialization-menu', 'Actual completed turret selected; branch prices and available gold visible.');
    await command('范围火炮');
    report.actions.push({ action: 'specialize', turret: [12, 16], branch: 'cannon' });
    await capture('04-specialization-progress', 'Paid cannon specialization through command card.');
    await advance(9);
    await selectTurret(12, 20);
    const machinegun = page.locator('.cmdBtn[data-branch="mg"]');
    if (await machinegun.count() && await machinegun.getAttribute('aria-disabled') === 'false') {
      await machinegun.click();
      report.actions.push({ action: 'specialize', turret: [12, 20], branch: 'mg' });
      await advance(9);
    }
    await capture('05-defense-completed', 'Real income and completed upgrades; no stats or unlocks modified.');
    await centerGateAndZoom();
    await capture('06-gate-close', 'Right-drag camera and six wheel increments.');

    let contact = false, casualties = false, battle = false, wave = 0, nextOverview = 120;
    for (let i = 0; i < limitSeconds / 2; i++) {
      const data = await advance(2);
      if (!contact && data.vision.visibleEnemies > 0) { contact = true; await capture('07-first-contact', 'First naturally spawned visible attackers.'); }
      if (!casualties && data.observedKills > 0) { casualties = true; await capture('08-first-casualties', 'Native projectiles have killed real enemies.'); }
      if (!battle && data.observedKills >= 25) { battle = true; await capture('09-sustained-combat', 'At least 25 native kills; active weapon death pools visible.'); }
      if (data.wave !== wave && data.wave > 1) { wave = data.wave; await capture('wave-' + String(wave).padStart(2, '0'), 'Natural wave transition.'); }
      if (data.timeDifficulty.elapsed >= nextOverview) {
        await capture('battle-' + String(nextOverview).padStart(3, '0') + 's', 'Periodic unmodified combat observation.');
        nextOverview += 120;
      }
      if (data.over || data.settled) break;
    }
    const end = await capture('10-final-result', 'Finished native run or documented observation limit.');
    report.completed = end.over || end.settled;
    report.result = { state: end.state, completed: report.completed, finalText: end.finalText,
      wave: end.wave, kills: end.observedKills, score: end.score, baseHP: end.gate.hp,
      gold: end.resources.gold, elapsed: end.timeDifficulty.elapsed, activeEnemies: end.waveCounts.active };
    assert.equal(report.pageErrors.length, 0, 'No runtime page exceptions');
    saveReport();
    process.stdout.write(JSON.stringify({ result: report.result, report: path.join(output, 'report.json') }) + '\n');
  } catch (error) {
    report.failure = error.stack;
    if (page) { try { await capture('failure', error.message); } catch {} }
    saveReport();
    process.stderr.write(error.stack + '\n');
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();

"use strict";

// Isolated runtime acceptance. Example: node tools/check-epic-horde.cjs --counts=400 --frames=8 --baseline
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createStaticServer } = require('./asset-runtime-catalog.cjs');

const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const counts = String(args.get('counts') || '1000,2000,4000').split(',').map(Number);
const frames = Number(args.get('frames') || 24);
assert.ok(counts.every(count => Number.isInteger(count) && count > 0 && count <= 4000), 'Counts must be whole numbers from 1 to 4000');
assert.ok(Number.isInteger(frames) && frames > 0 && frames <= 2400, 'Frames must be a whole number from 1 to 2400');
const baseline = args.has('baseline');
const output = path.resolve(__dirname, '../output', String(args.get('output') || 'epic-horde'));
const projectRoot = path.resolve(__dirname, '..');
const report = { generatedAt: new Date().toISOString(), version: null, scenarios: [], errors: [] };

async function installHarness(page) {
  return page.evaluate(() => {
    state = STATE.PAUSED;
    const cameraUpdate = updateCamera;
    updateCamera = () => {};
    game.wave = 1;
    game.gateHp = game.gateMaxHp = 1e9;
    game.enemiesToSpawn = 0;
    game.stats.empLv = game.stats.mortarLv = 0;
    mouse.x = innerWidth / 2;
    mouse.y = innerHeight / 2;
    document.getElementById('hud').style.display = 'none';
    let seed = 9262026;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

    const phaseTotals = {};
    function timed(name, original) {
      return function (...values) {
        const started = performance.now();
        try { return original.apply(this, values); }
        finally {
          const phase = phaseTotals[name] || (phaseTotals[name] = { ms: 0, calls: 0 });
          phase.ms += performance.now() - started;
          phase.calls++;
        }
      };
    }
    applyHordeSeparation = timed('separation', applyHordeSeparation);
    resolveHordeMovement = timed('movementContact', resolveHordeMovement);
    updateHordeClimbing = timed('climbing', updateHordeClimbing);
    hordeLaneBlocked = timed('laneBlocked', hordeLaneBlocked);
    hordeLaneDetour = timed('laneDetourInclusive', hordeLaneDetour);
    flowDirFor = timed('flowField', flowDirFor);

    function clearEnemies() {
      for (const e of enemies.splice(0)) {
        scene.remove(e.group);
        releaseEnemyResources(e);
        if (e.beam) { scene.remove(e.beam); disposeTransientObject3D(e.beam); }
      }
      if (window.epicHarness?.cleanupWall) { window.epicHarness.cleanupWall(); window.epicHarness.cleanupWall = null; }
      _gateAttackerFrame = _wallAttackerFrame = -1;
      _enemySerial = 0;
      for (const key of Object.keys(phaseTotals)) delete phaseTotals[key];
    }
    function stats() {
      const lod = typeof getCrowdLodStats === 'function' ? getCrowdLodStats() : null;
      const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjection);
      const center = new THREE.Vector3();
      const bodies = enemies.filter(e => e.alive && !e.dying);
      return {
        alive: bodies.length,
        bodySizes: { maxRadius: Math.max(0, ...bodies.map(e => e.radius)), ordinaryMaxRadius: Math.max(0, ...bodies.filter(e => !e.boss && !e.giant).map(e => e.radius)),
          giantCount: bodies.filter(e => e.giant).length, giantMaxRadius: Math.max(0, ...bodies.filter(e => e.giant).map(e => e.radius)),
          largeCount: bodies.filter(e => e.radius > 1).length,
          bosses: bodies.filter(e => e.boss).map(e => ({ type: e.type, radius: e.radius, hullVertices: e.collisionHull?.length || 0 })) },
        centersOnScreen: enemies.filter(e => e.alive && !e.dying && frustum.containsPoint(center.copy(e.group.position).add(new THREE.Vector3(0, .7, 0)))).length,
        renderedUniqueCount: lod?.renderedUniqueCount ?? enemies.filter(e => e.alive && e.group.visible).length + (crowdLodMesh?.count || 0),
        lod,
        renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
      };
    }
    function cameraAt(distance, focus) {
      camHeight = distance;
      camFocus.set(focus.x, 0, focus.z);
      cameraUpdate(0);
      camera.updateMatrixWorld(true);
    }
    function collisionMetrics() {
      const alive = enemies.filter(e => e.alive && !e.dying);
      const buckets = new Map(), cell = 1.5;
      const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
      let maxRadius = 0, solid = 0, maxPenetration = 0, overlappingPairs = 0, testedPairs = 0;
      const solidExamples = [];
      for (const e of alive) {
        const p = e.group.position;
        maxRadius = Math.max(maxRadius, e.radius);
        if (blockedForTank(p.x, p.z, enemyNavigationRadius(e), heightAt(p.x, p.z))) {
          solid++;
          if (solidExamples.length < 4) solidExamples.push({ id: e.hordeId, position: p.toArray(), radius: e.radius, navigationRadius: enemyNavigationRadius(e), cell: cellOf(p.x, p.z) });
        }
        const k = key(p.x, p.z);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(e);
      }
      for (const e of alive) {
        const p = e.group.position, reach = e.radius + maxRadius;
        for (let z = Math.floor((p.z - reach) / cell); z <= Math.floor((p.z + reach) / cell); z++) {
          for (let x = Math.floor((p.x - reach) / cell); x <= Math.floor((p.x + reach) / cell); x++) {
            for (const other of buckets.get(`${x},${z}`) || []) {
              if (other.hordeId <= e.hordeId) continue;
              testedPairs++;
              const hit = zombieBodyContact(e, other);
              if (hit) { maxPenetration = Math.max(maxPenetration, hit.depth); if (hit.depth > .025) overlappingPairs++; }
            }
          }
        }
      }
      return { alive: alive.length, solid, solidExamples, maxPenetration, overlappingPairs, testedPairs };
    }
    const wall = { x: ACTIVE_MODE.canyon.x1, z: ACTIVE_MODE.canyon.z0 };
    const wallCenter = cellCenter(wall.x, wall.z);
    window.epicHarness = {
      clearEnemies, stats, cameraAt, collisionMetrics, phaseTotals, wallCenter, wall,
      cameraInitial: { distance: camHeight, focus: camFocus.toArray(), position: camera.position.toArray() },
      points: [], spawnMs: 0, simulationStep: 0,
      prepare(count, wallScene = false) {
        clearEnemies();
        this.spawnMs = 0;
        this.simulationStep = 0;
        if (wallScene) {
          const cellKey = idx(wall.x, wall.z), original = grid[wall.z][wall.x];
          const model = buildWallTile(mapGroup, wall.x, wall.z, 1);
          grid[wall.z][wall.x] = T_STEEL;
          steelHP.set(cellKey, 1e9); wallMeta.set(cellKey, { lv: 1, hp: 1e9, anchor: wall });
          structCells.add(cellKey); tileMeshes[cellKey] = model; computeFlowField();
          this.cleanupWall = () => {
            grid[wall.z][wall.x] = original; steelHP.delete(cellKey); wallMeta.delete(cellKey);
            structCells.delete(cellKey); delete tileMeshes[cellKey]; scene.remove(model); model.parent?.remove(model);
            disposeTransientObject3D(model); computeFlowField();
          };
        }
        this.points = [];
        const spacing = .74;
        for (let x = wallCenter.x + 2; x < HALF - 3; x += spacing) {
          for (let z = -HALF + 3; z < HALF - 3; z += spacing) {
            const y = heightAt(x, z);
            if (y > .02 || blockedForTank(x, z, .36, y)) continue;
            this.points.push({ x, z, y });
          }
        }
        // Fill the mouth first, then spread along the approach; every seed retains its own legal cell.
        this.points.sort((a, b) => ((a.x - wallCenter.x) ** 2 + (a.z - wallCenter.z) ** 2) - ((b.x - wallCenter.x) ** 2 + (b.z - wallCenter.z) ** 2));
        if (this.points.length < count) throw new Error(`Only ${this.points.length} legal crowd seed positions for ${count}`);
        cameraAt(190, { x: (wallCenter.x + HALF - 3) * .5, z: wallCenter.z });
        return { legalPositions: this.points.length, half: HALF, wallCenter };
      },
      spawnUntil(target) {
        const start = performance.now();
        while (enemies.length < target) {
          const p = this.points[enemies.length];
          seed = (9262026 + Math.imul(enemies.length, 2654435761)) >>> 0;
          const admitted = spawnEnemy('normal', false);
          if (admitted === false) throw new Error(`Manual fixture could not admit enemy ${enemies.length + 1}; natural spawn entrances are occupied`);
          const e = enemies.at(-1);
          if (e.beam) { scene.remove(e.beam); disposeTransientObject3D(e.beam); e.beam = null; }
          e.spawnFlash = 0; e.hp = e.maxHp = 1e9;
          e.group.position.set(p.x, p.y, p.z);
          e.group.rotation.y = -Math.PI * .5;
          e.dir.set(-1, 0, 0);
        }
        this.spawnMs += performance.now() - start;
        return { spawned: enemies.length, spawnMs: this.spawnMs };
      },
      frame(simulate = true, syncGpu = false) {
        const start = performance.now();
        if (simulate) this.step();
        const afterSimulation = performance.now();
        updateCrowdLod();
        const afterLod = performance.now();
        renderer.render(scene, camera);
        if (syncGpu) renderer.getContext().finish();
        const end = performance.now();
        return { simulationMs: afterSimulation - start, lodMs: afterLod - afterSimulation, renderMs: end - afterLod, totalMs: end - start };
      },
      step(dt = 1 / 60) {
        _animFrame = ++this.simulationStep;
        seed = (9262026 + Math.imul(this.simulationStep, 1597334677)) >>> 0;
        updateEnemies(dt);
      },
      resetPhases() { for (const key of Object.keys(phaseTotals)) delete phaseTotals[key]; },
      deathStats() {
        return typeof zombieDeathEffects !== 'undefined' && zombieDeathEffects ? zombieDeathEffects.inspect() : null;
      },
    };
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { version: GAME_VERSION, camera: epicHarness.cameraInitial, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
}

function summarize(rows, property) {
  const values = rows.map(row => row[property]).sort((a, b) => a - b);
  return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, p50: values[Math.floor(values.length / 2)], p95: values[Math.min(values.length - 1, Math.floor(values.length * .95))], max: values.at(-1) };
}

async function warmLod(page, iterations) {
  for (let i = 0; i < iterations; i += 10) {
    await page.evaluate(() => { for (let j = 0; j < 10; j++) epicHarness.frame(false); });
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    const pending = await page.evaluate(() => {
      if (typeof getCrowdLodStats !== 'function') return false;
      const stats = getCrowdLodStats(); return stats.transitionCount > 0 || stats.pendingBuilds > 0;
    });
    if (!pending) break;
    await page.waitForTimeout(20);
    await page.evaluate(() => { for (let j = 0; j < 10; j++) epicHarness.frame(false); });
  }
}

async function profileScenario(page, count) {
  const layout = await page.evaluate(count => epicHarness.prepare(count), count);
  for (let target = 100; target < count + 100; target += 100) {
    await page.evaluate(target => epicHarness.spawnUntil(target), Math.min(count, target));
  }
  await warmLod(page, baseline ? 10 : 80);
  const initial = await page.evaluate(() => epicHarness.collisionMetrics());
  if (!baseline) {
    for (let i = 0; i < 12; i++) await page.evaluate(() => epicHarness.frame(true, true));
    await page.evaluate(() => epicHarness.resetPhases());
  }
  const rows = [];
  for (let i = 0; i < frames; i++) rows.push(await page.evaluate(() => epicHarness.frame(true, true)));
  const result = await page.evaluate(() => ({ ...epicHarness.stats(), phases: epicHarness.phaseTotals, collision: epicHarness.collisionMetrics(), spawnMs: epicHarness.spawnMs }));
  result.count = count; result.layout = layout; result.initialCollision = initial;
  result.timings = Object.fromEntries(['simulationMs', 'lodMs', 'renderMs', 'totalMs'].map(key => [key, summarize(rows, key)]));
  await page.screenshot({ path: path.join(output, `${count}-far.png`) });
  if (!baseline) {
    result.zoom = [];
    for (const distance of [110, 55, 24]) {
      await page.evaluate(distance => epicHarness.cameraAt(distance, { x: epicHarness.wallCenter.x + 10, z: epicHarness.wallCenter.z }), distance);
      await warmLod(page, 80);
      const zoom = await page.evaluate(() => epicHarness.stats());
      if (args.has('profile-zoom')) {
        const zoomRows = [];
        for (let i = 0; i < 8; i++) zoomRows.push(await page.evaluate(() => epicHarness.frame(true, true)));
        zoom.timings = Object.fromEntries(['simulationMs', 'lodMs', 'renderMs', 'totalMs'].map(key => [key, summarize(zoomRows, key)]));
      }
      zoom.distance = distance; result.zoom.push(zoom);
      await page.screenshot({ path: path.join(output, `${count}-zoom-${distance}.png`) });
    }
  }
  console.log(JSON.stringify({ scenario: count, timings: result.timings, phases: result.phases, collision: result.collision, lod: result.lod }));
  assert.equal(result.alive, count);
  assert.equal(result.renderedUniqueCount, count);
  if (result.lod) assert.equal(result.lod.pendingBuilds, 0, 'LOD geometry must be ready before profiling');
  assert.equal(result.centersOnScreen, count, 'The far screenshot must actually frame every living center');
  assert.equal(result.collision.overlappingPairs, 0, JSON.stringify(result.collision));
  assert.equal(result.collision.solid, 0, JSON.stringify(result.collision));
  for (const zoom of result.zoom || []) {
    assert.equal(zoom.renderedUniqueCount, count);
    if (zoom.lod) { assert.equal(zoom.lod.pendingBuilds, 0); assert.equal(zoom.lod.transitionCount, 0); }
  }
  return result;
}

async function contactScenario(page) {
  await page.evaluate(() => epicHarness.prepare(400, true));
  for (let target = 100; target <= 400; target += 100) await page.evaluate(target => epicHarness.spawnUntil(target), target);
  await page.evaluate(() => {
    const c = epicHarness.wallCenter;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i], x = c.x + 2 + Math.floor(i / 20) * .35, z = c.z + (i % 20 - 9.5) * .25;
      e.group.position.set(x, heightAt(x, z), z);
    }
    epicHarness.cameraAt(48, { x: c.x + 6, z: c.z });
    epicHarness.passedWallIds = new Set();
    epicHarness.resetPhases();
  });
  await warmLod(page, 80);
  const contactFrames = Number(args.get('contact-frames') || 360);
  for (let i = 0; i < contactFrames; i += 10) {
    await page.evaluate(() => {
      for (let j = 0; j < 10; j++) {
        epicHarness.step(); updateCrowdLod();
        for (const e of enemies) if (e.group.position.x < epicHarness.wallCenter.x - 1.2) epicHarness.passedWallIds.add(e.hordeId);
      }
    });
  }
  const result = await page.evaluate(() => {
    renderer.render(scene, camera);
    return { frames: _animFrame, collision: epicHarness.collisionMetrics(), crossed: epicHarness.passedWallIds.size,
      hp: steelHP.get(idx(epicHarness.wall.x, epicHarness.wall.z)), ...epicHarness.stats(), phases: epicHarness.phaseTotals };
  });
  await page.screenshot({ path: path.join(output, '400-wall-contact.png') });
  console.log(JSON.stringify({ wallContact: result }));
  assert.equal(result.collision.overlappingPairs, 0, JSON.stringify(result.collision));
  assert.equal(result.crossed, 0);
  assert.equal(result.alive, 400);
  assert.equal(result.renderedUniqueCount, 400);
  assert.ok(result.hp > 0 && result.hp < 1e9);
  return result;
}

async function naturalSpawnScenario(page, wave) {
  const before = await page.evaluate(wave => {
    epicHarness.clearEnemies(); game.wave = 0; game.spawnPlans = []; game.enemiesToSpawn = 0;
    game.gateHp = game.gateMaxHp = 1e9; baseAlive = true;
    state = STATE.PLAYING; startWave(wave); state = STATE.PAUSED;
    epicHarness.naturalSpawn = { frames: 0, unchangedFrames: 0, lastCount: 0, ms: 0 };
    return { expected: game.enemiesToSpawn, wave, profile: SurvivalSystem.waveProfile(wave) };
  }, wave);
  let progress;
  do {
    progress = await page.evaluate(moving => {
      const progress = epicHarness.naturalSpawn, start = performance.now();
      state = STATE.PLAYING;
      try {
        for (let i = 0; i < (moving ? 20 : 120) && game.enemiesToSpawn > 0; i++) {
          _animFrame++;
          if (moving) { updateEnemies(1 / 30); updateCrowdLod(); }
          else spawnPendingSurvivalEnemies(1 / 60);
          progress.frames++;
          if (enemies.length === progress.lastCount) progress.unchangedFrames++;
          else { progress.lastCount = enemies.length; progress.unchangedFrames = 0; }
          if (progress.unchangedFrames > 240) break;
        }
      } finally { state = STATE.PAUSED; }
      progress.ms += performance.now() - start;
      return { ...progress, pending: game.enemiesToSpawn, count: enemies.length };
    }, !args.has('stationary-spawn'));
    if (!args.has('stationary-spawn') && progress.frames % 200 === 0) console.log(JSON.stringify({ spawnProgress: progress }));
  } while (progress.pending > 0 && progress.frames < 15000 && progress.unchangedFrames <= 240);
  await warmLod(page, 80);
  const result = await page.evaluate(() => ({ ...epicHarness.naturalSpawn, pending: game.enemiesToSpawn,
    collision: epicHarness.collisionMetrics(), countsByType: enemies.reduce((result, e) => (result[e.type] = (result[e.type] || 0) + 1, result), {}),
    bosses: enemies.filter(e => e.boss).length, ...epicHarness.stats() }));
  result.wave = wave; result.expected = before.expected;
  result.moving = !args.has('stationary-spawn');
  const settleSeconds = Number(args.get('natural-settle-seconds') || 0);
  assert.ok(Number.isFinite(settleSeconds) && settleSeconds >= 0 && settleSeconds <= 120, 'Natural settling must be between 0 and 120 seconds');
  if (settleSeconds > 0) {
    await page.evaluate(() => {
      epicHarness.cameraAt(145, { x: 0, z: 0 });
      epicHarness.settle = { frames: 0, simulationMs: 0,
        startingWallStates: [...wallMeta].map(([key]) => ({ key, hp: steelHP.get(key) || 0 })) };
    });
    await warmLod(page, 80);
    const targetFrames = Math.ceil(settleSeconds * 30);
    const progressSamples = [];
    for (let offset = 0; offset < targetFrames; offset += 10) {
      const progress = await page.evaluate(count => {
        const start = performance.now();
        for (let i = 0; i < count; i++) {
          epicHarness.step(1 / 30); updateCrowdLod(); epicHarness.settle.frames++;
        }
        epicHarness.settle.simulationMs += performance.now() - start;
        return { frames: epicHarness.settle.frames, elapsedSeconds: epicHarness.settle.frames / 30,
          alive: enemies.filter(e => e.alive).length, atGate: enemies.filter(e => e.alive && e.atGate).length,
          gateHp: game.gateHp, simulationMs: epicHarness.settle.simulationMs };
      }, Math.min(10, targetFrames - offset));
      if (progress.frames % 150 === 0 || progress.frames === targetFrames) {
        const previous = progressSamples.at(-1) || { frames: 0, simulationMs: 0 };
        progress.intervalMeanMs = (progress.simulationMs - previous.simulationMs) / (progress.frames - previous.frames);
        progressSamples.push(progress);
        console.log(JSON.stringify({ settling: progress }));
      }
    }
    result.settled = await page.evaluate(() => ({ ...epicHarness.settle, ...epicHarness.stats(),
      collision: epicHarness.collisionMetrics(), atGate: enemies.filter(e => e.alive && e.atGate).length,
      gateHp: game.gateHp, baseAlive,
      endingWallStates: [...wallMeta].map(([key]) => ({ key, hp: steelHP.get(key) || 0 })) }));
    result.settled.totalSimulatedSeconds = result.frames / 30 + targetFrames / 30;
    result.settled.progressSamples = progressSamples;
    report.settledNatural = result.settled;
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    assert.equal(result.settled.collision.overlappingPairs, 0, JSON.stringify(result.settled.collision));
    assert.equal(result.settled.collision.solid, 0, JSON.stringify(result.settled.collision));
    assert.equal(result.settled.baseAlive, true);
  }
  if (args.has('profile-natural')) {
    await page.evaluate(() => epicHarness.cameraAt(145, { x: 0, z: 0 }));
    await warmLod(page, 80);
    for (let i = 0; i < 8; i++) await page.evaluate(() => epicHarness.frame(true, true));
    await page.evaluate(() => epicHarness.resetPhases());
    const rows = [];
    for (let i = 0; i < 16; i++) rows.push(await page.evaluate(() => epicHarness.frame(true, true)));
    result.steady = await page.evaluate(() => ({ ...epicHarness.stats(), collision: epicHarness.collisionMetrics(), phases: epicHarness.phaseTotals }));
    result.steady.timings = Object.fromEntries(['simulationMs', 'lodMs', 'renderMs', 'totalMs'].map(key => [key, summarize(rows, key)]));
    await page.screenshot({ path: path.join(output, `natural-wave-${wave}.png`) });
    if (settleSeconds > 0) {
      await page.evaluate(() => epicHarness.cameraAt(28, { x: epicHarness.wallCenter.x + 6, z: epicHarness.wallCenter.z }));
      await warmLod(page, 80);
      result.near = await page.evaluate(() => ({ ...epicHarness.stats(), collision: epicHarness.collisionMetrics() }));
      await page.screenshot({ path: path.join(output, `natural-wave-${wave}-near-ramp.png`) });
    }
  }
  report.naturalSpawns ||= []; report.naturalSpawns.push(result);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ naturalSpawn: result }));
  assert.equal(result.alive, before.expected, 'Natural spawner must admit the complete wave into legal independent positions');
  assert.equal(result.pending, 0);
  assert.equal(result.collision.overlappingPairs, 0, JSON.stringify(result.collision));
  assert.equal(result.collision.solid, 0, JSON.stringify(result.collision));
  return result;
}

async function deathScenario(page) {
  const available = await page.evaluate(() => typeof ZombieDeathEffects !== 'undefined');
  assert.ok(available, 'ZombieDeathEffects must be loaded by the real game entry');
  const causes = ['frost', 'incendiary', 'grenade'];
  const scenarios = [];
  for (const projectileType of causes) {
    await page.evaluate(projectileType => {
      epicHarness.prepare(12);
      zombieDeathEffects?.clear();
      epicHarness.spawnUntil(12);
      const c = epicHarness.wallCenter;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i], x = c.x + 7 + (i % 4) * 1.7, z = c.z - 2 + Math.floor(i / 4) * 1.7;
        e.group.position.set(x, heightAt(x, z), z);
        e.hp = e.maxHp = 30;
      }
      epicHarness.cameraAt(24, { x: c.x + 9, z: c.z });
    }, projectileType);
    await warmLod(page, 80);
    const result = await page.evaluate(projectileType => {
      zombieDeathEffects?.update(0, camera, innerHeight);
      const before = zombieDeathEffects?.inspect() || { spawnedByCause: { freeze: 0, burn: 0, explosive: 0, energy: 0, kinetic: 0 } };
      for (const e of enemies.slice(0, 8)) damageEnemy(e, 100, { source: 'turret', projectileType, direction: { x: 1, y: .2, z: 0 } });
      for (let i = 0; i < 8; i++) {
        zombieDeathEffects.update(1 / 60, camera, innerHeight);
        updateParticles(1 / 60); updateCorpseDecals(1 / 60);
      }
      updateCrowdLod(); renderer.render(scene, camera);
      return { projectileType, before, after: zombieDeathEffects.inspect(), alive: enemies.filter(e => e.alive).length };
    }, projectileType);
    await page.screenshot({ path: path.join(output, `death-${projectileType}.png`) });
    const cause = projectileType === 'frost' ? 'freeze' : projectileType === 'incendiary' ? 'burn' : 'explosive';
    assert.equal(result.alive, 4);
    assert.equal(result.after.spawnedByCause[cause] - result.before.spawnedByCause[cause], 8, JSON.stringify(result));
    assert.ok(result.after.activePieces > 0);
    scenarios.push(result);
  }
  await page.evaluate(() => { epicHarness.prepare(4000); zombieDeathEffects.clear(); });
  for (let target = 100; target <= 4000; target += 100) await page.evaluate(target => epicHarness.spawnUntil(target), target);
  await warmLod(page, 80);
  const mass = await page.evaluate(() => {
    zombieDeathEffects.update(0, camera, innerHeight);
    const before = zombieDeathEffects.inspect(), start = performance.now();
    for (const e of [...enemies]) damageEnemy(e, 1e12, { source: 'turret', projectileType: 'grenade', direction: { x: 1, y: .4, z: 0 } });
    const killMs = performance.now() - start;
    _animFrame++; updateEnemies(1 / 60); updateCrowdLod(); zombieDeathEffects.update(.12, camera, innerHeight); renderer.render(scene, camera);
    return { before, after: zombieDeathEffects.inspect(), killMs, survivors: enemies.filter(e => e.alive).length,
      disposalQueue: pendingEnemyDisposals.length,
      particles: particles.length, corpseDecals: corpseDecals.length, renderer: renderer.info.render };
  });
  await page.screenshot({ path: path.join(output, 'death-4000-explosive.png') });
  assert.equal(mass.survivors, 0);
  assert.equal(mass.after.spawnedByCause.explosive - mass.before.spawnedByCause.explosive, 4000);
  assert.ok(mass.after.activePieces <= mass.after.maxPieces);
  assert.ok(mass.after.drawCalls <= 8);
  const cleanup = await page.evaluate(() => {
    const timings = []; let frames = 0;
    // Run the actual game step; the production per-frame disposal/UI budgets must drain the queue.
    const beforeState = state; state = STATE.BUILD; game.wave = 0; game.enemiesToSpawn = 0; game.spawnPlans = []; game.waveTransition = null;
    try {
      while (pendingEnemyDisposals.length && frames < 180) {
        const started = performance.now(); stepGame(1 / 60); timings.push(performance.now() - started); frames++;
      }
    } finally { state = beforeState; }
    return { frames, remaining: pendingEnemyDisposals.length, worstStepMs: Math.max(0, ...timings), uiPending: hordeKillUiDirty };
  });
  assert.equal(cleanup.remaining, 0);
  assert.equal(cleanup.uiPending, false);
  const settled = await page.evaluate(() => {
    for (let i = 0; i < 120; i++) {
      zombieDeathEffects.update(.1, camera, innerHeight); updateParticles(.1); updateCorpseDecals(.1);
    }
    return zombieDeathEffects.inspect();
  });
  console.log(JSON.stringify({ deaths: scenarios, mass, cleanup, settled }));
  return { scenarios, mass, cleanup, settled };
}

async function projectileScenario(page) {
  const rows = [];
  for (const projectileType of ['tank', 'frost', 'incendiary', 'grenade', 'emp']) {
    const result = await page.evaluate(projectileType => {
      epicHarness.prepare(1); epicHarness.spawnUntil(1); zombieDeathEffects?.clear();
      particles.length=0;particleGeometry.setDrawRange(0,0);camShake=0;
      const e = enemies[0], c = epicHarness.wallCenter;
      e.group.position.set(c.x + 10, 0, c.z); e.hp = e.maxHp = 1; e.spawnFlash = 0;
      epicHarness.cameraAt(12, { x: c.x + 10, z: c.z });
      zombieDeathEffects?.update(0,camera,innerHeight);
      const group = new THREE.Group(); group.position.set(c.x + 4, 0, c.z); scene.add(group);
      const target = enemyAimPoint(e), origin = group.position.clone().setY(target.y);
      const direction = target.clone().sub(origin).normalize();
      shoot({ group, dmg: 100, blast: 0 }, direction, true, { source: 'turret', projectileType, origin, thruWall: true });
      const emitted = bullets.filter(b => b.projectileType === projectileType).length;
      let hitAt = null;
      for (let i = 0; i < 180 && e.alive; i++) {
        _animFrame++; updateBullets(1 / 60);
        if (!e.alive) hitAt = (i + 1) / 60;
      }
      scene.remove(group);
      const result = { projectileType, emitted, hitAt, alive: e.alive, effects: zombieDeathEffects?.inspect() || null };
      for (const b of bullets.splice(0)) { scene.remove(b.mesh); disposeTransientObject3D(b.mesh); }
      return result;
    }, projectileType);
    rows.push(result);
    assert.ok(result.emitted > 0);
    assert.notEqual(result.hitAt, null, JSON.stringify(result));
    const expected = { tank: 'kinetic', frost: 'freeze', incendiary: 'burn', grenade: 'explosive', emp: 'energy' }[projectileType];
    assert.equal(result.effects?.lastCause, expected);
    await page.evaluate(() => {
      const c = epicHarness.wallCenter;
      epicHarness.cameraAt(12, { x: c.x + 10, z: c.z });
      zombieDeathEffects.update(.1, camera, innerHeight);updateParticles(.1);updateCrowdLod();renderer.render(scene,camera);
    });
    await page.screenshot({ path: path.join(output, `projectile-${projectileType}.png`) });
  }
  console.log(JSON.stringify({ realProjectiles: rows }));
  return rows;
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await createStaticServer(projectRoot);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
    await page.waitForFunction(() => typeof state !== 'undefined' && state === 7, null, { timeout: 90000 });
    Object.assign(report, await installHarness(page));
    await page.screenshot({ path: path.join(output, 'initial-highland.png') });
    console.log(JSON.stringify({ started: true, ...report }));
    for (const count of args.has('contact-only') || args.has('deaths-only') || args.has('spawn-only') || args.has('projectiles-only') ? [] : counts) {
      const result = await profileScenario(page, count);
      report.scenarios.push(result);
      fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    }
    if (!baseline && !args.has('skip-contact') && !args.has('deaths-only') && !args.has('spawn-only') && !args.has('projectiles-only')) report.wall = await contactScenario(page);
    if (!baseline && !args.has('skip-deaths') && !args.has('contact-only') && !args.has('spawn-only')) {
      report.projectiles = await projectileScenario(page);
      if (!args.has('projectiles-only')) report.deaths = await deathScenario(page);
    }
    if (!baseline && !args.has('skip-spawn') && !args.has('contact-only') && !args.has('deaths-only') && !args.has('projectiles-only')) {
      const waves = String(args.get('natural-waves') || '1,10').split(',').map(Number);
      assert.ok(waves.every(wave => Number.isInteger(wave) && wave >= 1 && wave <= 10));
      for (const wave of waves) await naturalSpawnScenario(page, wave);
    }
    assert.deepEqual(report.errors, []);
  } catch (error) {
    report.failure = error.stack || String(error);
    console.error(report.failure);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})();

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');

test('工程师经过正门出入，取消和读档保持路线，门前留出通道', async () => {
  const server = await createStaticServer(path.resolve(__dirname, '..'));
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
    await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
    const result = await page.evaluate(() => {
      state = STATE.PAUSED;
      game.gold = 100000;
      game.popMax = 100;
      const entrance = baseGroup.userData.workerEntrance;
      if (!entrance) return { missingEntrance: true };
      const b = shopList().find((b) => b.id === 'house');
      const home = constructionHome(),
        p = baseGroup.position;
      const front = cellCenter(home.x, home.z);
      const protectedCells = constructionEntranceCells().every((c) => !footprintPlaceable(c, b));
      const create = () => {
        for (let z = 2; z < GRID - 2; z++)
          for (let x = 2; x < GRID - 2; x++)
            if (footprintPlaceable({ x, z }, b) && queueConstruction(b, { x, z }))
              return constructionJobs.at(-1);
        throw new Error('No site');
      };
      const j = create(),
        start = j.worker.position.clone(),
        inside = entrance[0];
      let meshCount = 0;
      j.worker.traverse((o) => {
        if (o.isMesh) meshCount++;
      });
      const spawnedInside =
        Math.abs(start.x - p.x - inside.x) < 0.01 && Math.abs(start.z - p.z - inside.z) < 0.01;
      updateConstruction(0.08);
      const movedDown = j.worker.position.z > start.z;
      const savedVariant = j.worker.userData.variantId;
      const saved = serializeConstruction();
      clearConstruction();
      restoreConstruction(saved);
      const restored = constructionJobs[0];
      const preparedModel = restored.preview;
      const restoredPortal = restored.portal?.direction === 'out';
      const savedAppearance = restored.worker.userData.variantId === savedVariant;
      const traces = [];
      let sawBuilding = false,
        sawEntering = false;
      for (let i = 0; i < 6000 && constructionJobs.includes(restored); i++) {
        updateConstruction(0.025);
        sawBuilding ||= restored.phase === 'building';
        sawEntering ||= restored.portal?.direction === 'in';
        if (restored.portal)
          traces.push({ x: restored.worker.position.x - p.x, z: restored.worker.position.z - p.z });
      }
      const returnedInside = restored.worker.position.distanceTo(start) < 0.05;
      const finished = !constructionJobs.includes(restored);
      const cancel = create();
      updateConstruction(0.12);
      cancelConstruction(cancel);
      for (let i = 0; i < 300 && constructionJobs.includes(cancel); i++) updateConstruction(0.025);
      const cancelledInside =
        cancel.worker.position.distanceTo(start) < 0.05 && !constructionJobs.includes(cancel);
      const reusedModel = builtHouses.some((h) => h.group === preparedModel);
      saveSurvivalSnapshot();
      const legacy = readSurvivalSnapshot(),
        oldFront = constructionEntranceCells()[0];
      legacy.version = '6.37.0';
      legacy.construction = [];
      legacy.structures.houses.push({ ...oldFront, level: 2, hp: 80 });
      restoreSurvivalSnapshot(legacy);
      const legacyBuildingRetained = builtHouses.some(
        (h) => h.x === oldFront.x && h.z === oldFront.z && h.level === 2 && h.hp === 80,
      );
      return {
        frontDown: front.z > p.z + TILE,
        protectedCells,
        spawnedInside,
        movedDown,
        restoredPortal,
        savedAppearance,
        sawBuilding,
        sawEntering,
        returnedInside,
        finished,
        cancelledInside,
        meshCount,
        reusedModel,
        legacyBuildingRetained,
        doorwayAligned: traces.filter((t) => t.z < 3.8).every((t) => Math.abs(t.x) < 0.05),
      };
    });
    assert.equal(result.missingEntrance, undefined, '基地需要与真实门厅对齐的出入路线');
    for (const [key, value] of Object.entries(result))
      if (key !== 'meshCount') assert.equal(value, true, key);
    assert.ok(result.meshCount <= 8, `工人绘制预算: ${result.meshCount}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

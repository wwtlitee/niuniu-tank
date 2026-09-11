'use strict';
const { test, before, after } = require('node:test'),
  assert = require('node:assert/strict');
const path = require('node:path'),
  fs = require('node:fs'),
  { chromium } = require('playwright');
const { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');
let server, browser, page;
const errors = [];
before(async () => {
  server = await createStaticServer(path.resolve(__dirname, '..'));
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=d3d11'],
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
  await page.evaluate(() => {
    state = STATE.PAUSED;
    game.gold = 100000;
    game.popMax = 200;
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
});
test('工人从正门走右侧近路施工再返回，不绕基地背面', async () => {
  const result = await page.evaluate(() => {
    const b = shopList().find((item) => item.id === 'beacon'),
      anchor = { x: 13, z: 16 };
    if (!queueConstruction(b, anchor)) throw Error('Unable to queue fixture');
    const job = constructionJobs.at(-1),
      trace = [],
      base = baseGroup.position.clone(),
      target = footprintCenter(anchor, b);
    let traveled = 0,
      previous = job.worker.position.clone(),
      arrived = false;
    for (let i = 0; i < 4000 && constructionJobs.includes(job); i++) {
      updateConstruction(0.025);
      const p = job.worker.position;
      if (job.phase === 'outbound' || !arrived)
        traveled += Math.hypot(p.x - previous.x, p.z - previous.z);
      arrived ||= job.phase === 'building';
      previous.copy(p);
      if (i % 8 === 0) trace.push({ x: p.x, z: p.z, phase: job.phase });
    }
    return {
      traveled,
      direct: Math.hypot(target.x - base.x, target.z - base.z),
      arrived,
      returned: !constructionJobs.includes(job),
      minZ: Math.min(...trace.map((p) => p.z)),
      baseZ: base.z,
      trace,
    };
  });
  fs.mkdirSync('output/navigation', { recursive: true });
  fs.writeFileSync('output/navigation/worker.json', JSON.stringify(result, null, 2));
  assert.ok(result.arrived && result.returned);
  assert.ok(
    result.traveled < result.direct * 1.4,
    `绕远：${result.traveled.toFixed(1)}，直线 ${result.direct.toFixed(1)}`,
  );
  assert.ok(result.minZ >= result.baseZ - 1, '东侧工地不能绕到基地背后');
});
test('坦克路线避开实际建筑占地，坡口的半格平地不被当成整格钢墙', async () => {
  const data = await page.evaluate(() => {
    const center = cellCenter(8, 17),
      clear = !blockedForTank(center.x, center.z, 0.4, heightAt(center.x, center.z), false, true);
    const p = cellCenter(5, 14),
      unit = createFriendlyUnit('light', p),
      block = { x: 8, z: 14 },
      destination = cellCenter(11, 14);
    const record = {};
    reserveFootprint(record, [block]);
    computeFlowField();
    setFriendlyMoveTarget(unit, destination, true);
    const route = unit.routeWaypoints.map((p) => cellOf(p.x, p.z));
    let reached = false;
    for (let i = 0; i < 2400; i++) {
      moveFriendlyUnit(unit, 0.025);
      if (
        unit.group.position.distanceTo(
          new THREE.Vector3(destination.x, heightAt(destination.x, destination.z), destination.z),
        ) < 1
      ) {
        reached = true;
        break;
      }
    }
    releaseFootprint(record);
    scene.remove(unit.group);
    friendlyUnits.splice(friendlyUnits.indexOf(unit), 1);
    computeFlowField();
    return { clear, route, reached, blockedCell: friendlyCellPassable(block.x, block.z) };
  });
  assert.ok(data.clear, '平坦的半格地皮应允许通行，同时继续禁止建造');
  assert.ok(!data.route.some((c) => c.x === 8 && c.z === 14), '坦克规划不能经过建筑占地');
  assert.ok(data.reached, '绕开建筑后应实际到达');
  assert.deepEqual(errors, []);
});

test('路线遇到新工地后重新规划，空地路线不会每经过一格就停车', async () => {
  const data = await page.evaluate(() => {
    const unit = createFriendlyUnit('light', cellCenter(4, 20)),
      destination = cellCenter(11, 20);
    setFriendlyMoveTarget(unit, destination, true);
    const openPoints = unit.routeWaypoints.length;
    const blocker = {};
    reserveFootprint(blocker, [{ x: 7, z: 20 }]);
    let hit = false,
      reached = false;
    for (let i = 0; i < 2200; i++) {
      moveFriendlyUnit(unit, 0.025);
      const c = cellOf(unit.group.position.x, unit.group.position.z);
      hit ||= c.x === 7 && c.z === 20;
      if (
        Math.hypot(unit.group.position.x - destination.x, unit.group.position.z - destination.z) < 1
      ) {
        reached = true;
        break;
      }
    }
    releaseFootprint(blocker);
    scene.remove(unit.group);
    friendlyUnits.splice(friendlyUnits.indexOf(unit), 1);
    computeFlowField();
    return { openPoints, hit, reached };
  });
  assert.ok(data.openPoints <= 2, '空地应合并成连续路线，而不是七次格心停顿');
  assert.equal(data.hit, false);
  assert.equal(data.reached, true, '新增占地后不能反复复用旧路线');
});

test('轻中重三种坦克均沿台阶往返高低地，路线平滑不能切过悬崖', async () => {
  const results = await page.evaluate(() => {
    const ramp = ACTIVE_MODE.ramp,
      top = cellCenter(ramp.col - 5, ramp.row),
      bottom = cellCenter(ramp.col + 5, ramp.row);
    const cliffs = { top: cellCenter(12, 15), bottom: cellCenter(17, 15) };
    const rows = [];
    for (const type of ['light', 'medium', 'heavy']) {
      const unit = createFriendlyUnit(type, top),
        row = { type, trips: [] };
      for (const destination of [bottom, top]) {
        setFriendlyMoveTarget(unit, destination, true);
        let reached = false,
          nearStairs = false;
        const c = cellCenter(ramp.col, ramp.row);
        for (let i = 0; i < 2600; i++) {
          moveFriendlyUnit(unit, 0.025);
          const p = unit.group.position;
          nearStairs ||= Math.hypot(p.x - c.x, p.z - c.z) < 3;
          if (Math.hypot(p.x - destination.x, p.z - destination.z) < 1) {
            reached = true;
            break;
          }
        }
        row.trips.push({ reached, nearStairs });
      }
      scene.remove(unit.group);
      friendlyUnits.splice(friendlyUnits.indexOf(unit), 1);
      rows.push(row);
    }
    return {
      rows,
      cliffBlocked: !navigationSegmentClear(cliffs.top, cliffs.bottom, 0.35),
      heights: [heightAt(cliffs.top.x, cliffs.top.z), heightAt(cliffs.bottom.x, cliffs.bottom.z)],
    };
  });
  assert.ok(results.heights[0] > 2 && results.heights[1] < 0.1, '悬崖样例需要真实跨越高低地');
  assert.ok(results.cliffBlocked, '平滑路线不能直接跳崖');
  for (const row of results.rows)
    for (const trip of row.trips) assert.ok(trip.reached && trip.nearStairs, JSON.stringify(row));
});

test('工人途中遇到新占地会绕开，完成施工后仍能回到正门', async () => {
  const result = await page.evaluate(() => {
    const build = shopList().find((b) => b.id === 'beacon');
    if (!queueConstruction(build, { x: 12, z: 15 })) throw Error('New site unavailable');
    const job = constructionJobs.at(-1);
    for (let i = 0; i < 500 && job.portal; i++) updateConstruction(0.025);
    const blocker = {};
    reserveFootprint(blocker, [{ x: 9, z: 17 }]);
    let hit = false,
      worked = false;
    for (let i = 0; i < 5000 && constructionJobs.includes(job); i++) {
      updateConstruction(0.025);
      const c = cellOf(job.worker.position.x, job.worker.position.z);
      hit ||= c.x === 9 && c.z === 17;
      worked ||= job.phase === 'building';
    }
    releaseFootprint(blocker);
    return { hit, worked, returned: !constructionJobs.includes(job) };
  });
  assert.equal(result.hit, false);
  assert.ok(result.worked && result.returned, JSON.stringify(result));
  assert.deepEqual(errors, []);
});

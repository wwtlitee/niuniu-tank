'use strict';
const fs = require('node:fs'),
  { chromium } = require('playwright');
const { createStaticServer } = require('./asset-runtime-catalog.cjs');
(async () => {
  const server = await createStaticServer(process.cwd());
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=d3d11'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(
      'http://127.0.0.1:' + server.address().port + '/index.html?mode=survival&autotest=1',
    );
    await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
    const result = await page.evaluate(() => {
      state = STATE.PAUSED;
      const B = ACTIVE_MODE.base,
        home = constructionHome(),
        rows = [];
      for (let z = B.row - 5; z < B.row + 7; z++) {
        const row = [];
        for (let x = B.col - 5; x < B.col + 13; x++) {
          const p = cellCenter(x, z);
          row.push({
            x,
            z,
            t: grid[z]?.[x],
            h: heightAt(p.x, p.z),
            pass: constructionPassable(x, z),
            east: inMap(x + 1, z) && flowCanStep(x, z, x + 1, z),
            south: inMap(x, z + 1) && flowCanStep(x, z, x, z + 1),
          });
        }
        rows.push(row);
      }
      const routes = [];
      for (let z = B.row - 2; z < B.row + 4; z++) {
        const goal = { x: B.col + 8, z };
        if (!constructionPassable(goal.x, goal.z)) continue;
        routes.push({
          goal,
          path: ConstructionSystem.findPath(
            home,
            [goal],
            GRID,
            GRID,
            constructionPassable,
            flowCanStep,
          ),
        });
      }
      return { TILE, PH, base: B, home, rows, routes };
    });
    fs.mkdirSync('output/navigation', { recursive: true });
    fs.writeFileSync('output/navigation/baseline.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ base: result.base, home: result.home, routes: result.routes }));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

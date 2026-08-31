/* 流场诊断：敌人生成格的 flowDist 与周围地形 —— 定位卡死根因 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[flow]", ...a);
const T_NAME = t => ({0:"EMPTY",1:"BRICK",2:"STEEL",3:"TREE",4:"WATER",5:"BRIDGE",6:"RAMP",7:"PLATEAU",8:"BASE",9:"ROAD",10:"BUILDING"}[t] ?? t);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));

  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 30000 });

  // 不放任何建筑，直接跳过 prep
  await page.evaluate(() => { game.prepTime = 0; });
  await page.waitForFunction(() => typeof state !== "undefined" && state === 1, { timeout: 8000 });
  await page.waitForTimeout(6000);

  const r = await page.evaluate(() => {
    const T_NAME = t => ({0:"EMPTY",1:"BRICK",2:"STEEL",3:"TREE",4:"WATER",5:"BRIDGE",6:"RAMP",7:"PLATEAU",8:"BASE",9:"ROAD",10:"BUILDING"}[t] ?? t);
    const out = { base: ACTIVE_MODE.base, spawns: ACTIVE_MODE.spawns, enemies: [] };
    // 出生点邻域 flowDist 热力（各出生点 5x5）
    out.spawnMap = ACTIVE_MODE.spawns.map(s => {
      const rows = [];
      for (let z = s.z - 2; z <= s.z + 2; z++) {
        const row = [];
        for (let x = s.x - 2; x <= s.x + 2; x++) {
          if (!inMap(x, z)) { row.push(" X "); continue; }
          const d = flowDist[z * GRID + x];
          row.push((d < 0 ? " -" : String(d).padStart(2, " ")) + T_NAME(grid[z][x]).slice(0, 1));
        }
        rows.push(row.join(" "));
      }
      return { spawn: s, rows };
    });
    for (const e of enemies) {
      const p = e.group.position, c = cellOf(p.x, p.z);
      out.enemies.push({
        cell: [c.x, c.z], pos: [+p.x.toFixed(1), +p.z.toFixed(1)],
        hp: e.hp, flowHere: e.flowHere, dir: [+e.dir.x.toFixed(2), +e.dir.z.toFixed(2)],
        gridHere: T_NAME(grid[c.z]?.[c.x]),
      });
    }
    return out;
  });
  log("base:", JSON.stringify(r.base), "spawns:", JSON.stringify(r.spawns));
  for (const sm of r.spawnMap) {
    log(`spawn ${sm.spawn.x},${sm.spawn.z} 5x5 (flowDist+地形首字母):`);
    sm.rows.forEach(row => log("   " + row));
  }
  for (const e of r.enemies) log("enemy:", JSON.stringify(e));

  await browser.close();
  log("done");
})();

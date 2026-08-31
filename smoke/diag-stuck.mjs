/* 卡死定位：采样敌人位置 / 流场值 / 是否移动，判断敌人是否到达大门 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[stuck]", ...a);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });

  // 先给出地图结构信息
  const info = await page.evaluate(() => {
    const B = ACTIVE_MODE.base;
    const c = cellCenter(B.gateCol, B.gateRow);
    return {
      TILE, GRID, base: B,
      baseWorld: { x: +c.x.toFixed(1), z: +c.z.toFixed(1) },
      baseCellType: grid[B.gateRow]?.[B.gateCol],
      T_BASE, T_PLATEAU, T_RAMP, T_STEEL,
    };
  });
  log("地图信息:", JSON.stringify(info));

  // 采样流场：大门周围 7x7 的 flowDist
  await page.waitForTimeout(15000);
  const flow = await page.evaluate(() => {
    const B = ACTIVE_MODE.base;
    const rows = [];
    for (let z = B.gateRow - 4; z <= B.gateRow + 4; z++) {
      let r = `z=${String(z).padStart(2)}: `;
      for (let x = B.gateCol - 4; x <= B.gateCol + 4; x++) {
        if (!inMap(x, z)) { r += "  .. "; continue; }
        const d = flowDist[z * GRID + x];
        r += (d < 0 ? "  -1" : String(d).padStart(4)) + " ";
      }
      rows.push(r);
    }
    return rows;
  });
  log("大门周边 flowDist（中心 col8 row37，值-1=不可达）:");
  flow.forEach(r => log("  " + r));

  // 连续采样敌人位置，看是否在原地打转
  log("敌人轨迹采样（每 2s 一次，共 10 次）:");
  for (let i = 0; i < 10; i++) {
    const s = await page.evaluate(() => {
      const B = ACTIVE_MODE.base;
      const bc = cellCenter(B.gateCol, B.gateRow);
      return enemies.filter(e => e.alive && !e.dying).map(e => {
        const c = cellOf(e.group.position.x, e.group.position.z);
        return {
          cell: `${c.x},${c.z}`,
          hereD: flowDist[c.z * GRID + c.x],
          distToGate: +Math.hypot(e.group.position.x - bc.x, e.group.position.z - bc.z).toFixed(1),
          dir: `${e.dir.x},${e.dir.z}`,
          wallCd: +(e.wallCd || 0).toFixed(2),
        };
      });
    });
    log(`  #${i} ` + JSON.stringify(s));
    await page.waitForTimeout(2000);
  }

  const fin = await page.evaluate(() => ({
    gateHp: Math.round(game.gateHp), gateMax: game.gateMaxHp,
    wave: game.wave, score: game.score, lives: game.lives,
    n: enemies.length, toSpawn: game.enemiesToSpawn,
  }));
  log("终局:", JSON.stringify(fin));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

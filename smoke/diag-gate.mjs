/* 门伤害溯源：包一层 damageGate 记录来源 + dump 门周边地形 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1&ff=5";
const log = (...a) => console.log("[gate]", ...a);

setTimeout(() => { console.error("[gate] WATCHDOG: 3min timeout, force exit"); process.exit(3); }, 180000).unref();

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
  await page.waitForTimeout(3000);

  // 1) dump 门周边地形 + 基地位置 + 伤害溯源包装
  const info = await page.evaluate(() => {
    // 找 T_BASE 门格
    const bases = [];
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++)
      if (grid[z][x] === T_BASE) bases.push([x, z]);
    // 包装 damageGate 记录来源
    window.__gateHits = [];
    const orig = damageGate;
    window.damageGate = function (raw, pos) {
      const st = new Error().stack.split("\n").slice(2, 4).map(s => s.trim().slice(0, 90)).join(" <- ");
      window.__gateHits.push({ raw, pos: pos ? [pos.x?.toFixed?.(1), pos.z?.toFixed?.(1)].join(",") : "?" , via: st });
      return orig(raw, pos);
    };
    // 敌人出生点周边流场
    const dump = [];
    for (let z = 33; z <= 38; z++) {
      const row = [];
      for (let x = 14; x <= 19; x++) {
        const t = grid[z][x];
        row.push(t === T_EMPTY ? ".." : t === T_BRICK ? "Br" : t === T_STEEL ? "St" : t === T_RAMP ? "Rp" : t === T_BASE ? "BA" : t === T_TREE ? "Tr" : t === T_WATER ? "Wa" : String(t));
      }
      const hs = [];
      for (let x = 14; x <= 19; x++) hs.push(heightAt(cellCenter(x, z).x, cellCenter(x, z).z).toFixed(2));
      const fd = [];
      for (let x = 14; x <= 19; x++) fd.push(String(flowDist[z * GRID + x]).padStart(3));
      dump.push(`z=${z} [14..19] ${row.join(" ")} | h: ${hs.join(" ")} | fd: ${fd.join(" ")}`);
    }
    return { bases, basePos: baseGroup ? [+baseGroup.position.x.toFixed(1), +baseGroup.position.z.toFixed(1)] : null, dump };
  });
  log("T_BASE 格:", JSON.stringify(info.bases), "基地物体位置:", JSON.stringify(info.basePos));
  for (const l of info.dump) log(l);

  // 2) 手动刷 1 只 normal 敌人放 S3 出生点
  const sp = await page.evaluate(() => {
    game.enemiesToSpawn = 0;
    spawnEnemy("normal");
    const e = enemies[enemies.length - 1];
    const cc = cellCenter(45, 33);
    e.group.position.set(cc.x, 0, cc.z);
    return cellOf(e.group.position.x, e.group.position.z);
  });
  log("刷敌@", JSON.stringify(sp));

  // 3) 跑 20 秒，观察伤害来源
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    const s = await Promise.race([
      page.evaluate(() => {
        const e = enemies.find(e => e.alive && !e.dying);
        const hits = window.__gateHits.splice(0, window.__gateHits.length);
        return {
          cell: e ? `${cellOf(e.group.position.x, e.group.position.z).x},${cellOf(e.group.position.x, e.group.position.z).z}` : "gone",
          atGate: e ? !!e.atGate : null,
          gateHp: Math.round(game.gateHp), hits,
        };
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate timeout")), 15000)),
    ]);
    log(JSON.stringify(s));
    if (s.gateHp <= 0 || s.cell === "gone") break;
  }
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

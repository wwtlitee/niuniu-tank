/* 单敌追踪：只让 1 只敌人出生，逐秒看它卡在哪 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1&ff=5";
const log = (...a) => console.log("[trace]", ...a);

/* ★ 全局看门狗：任何原因挂死都在 3 分钟内退出 */
setTimeout(() => { console.error("[trace] WATCHDOG: 3min timeout, force exit"); process.exit(3); }, 180000).unref();

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

  // 直接手动刷 1 只 normal 敌人，挪到 S3 出生点 (45,33) 附近
  await page.waitForTimeout(3000);
  const sp = await page.evaluate(() => {
    // 禁掉自然刷怪
    game.enemiesToSpawn = 0;
    spawnEnemy("normal");
    const e = enemies[enemies.length - 1];
    const cc = cellCenter(45, 33);
    e.group.position.set(cc.x, 0, cc.z);
    return {
      pos: { x: +e.group.position.x.toFixed(1), z: +e.group.position.z.toFixed(1) },
      cell: cellOf(e.group.position.x, e.group.position.z),
      radius: e.radius, speed: e.speed,
      flowD: flowDist[cellOf(e.group.position.x, e.group.position.z).z * GRID + cellOf(e.group.position.x, e.group.position.z).x],
    };
  });
  log("手动刷敌:", JSON.stringify(sp));

  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(2000);
    const s = await Promise.race([
      page.evaluate(() => {
        const e = enemies.find(e => e.alive && !e.dying);
        if (!e) return { gone: true };
        const c = cellOf(e.group.position.x, e.group.position.z);
        const f = flowDirFor(e);
        const hereH = heightAt(e.group.position.x, e.group.position.z);
        // 试探：如果沿 dir 走一步会不会被挡
        const nx = e.group.position.x + e.dir.x * 2, nz = e.group.position.z + e.dir.z * 2;
        const blocked = blockedForTank(nx, nz, e.radius, hereH);
        return {
          cell: `${c.x},${c.z}`, pos: `${e.group.position.x.toFixed(1)},${e.group.position.z.toFixed(1)}`,
          h: +hereH.toFixed(2), hereD: f.hereD, best: f.best, atGate: !!f.atGate,
          dir: `${e.dir.x},${e.dir.z}`, nextBlocked: blocked,
          wallCd: +(e.wallCd || 0).toFixed(2), gateHp: Math.round(game.gateHp),
          state, wave: game.wave, toSpawn: game.enemiesToSpawn,
        };
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate timeout (game main loop likely frozen)")), 15000)),
    ]);
    log(JSON.stringify(s));
    if (s.gone || s.state === 4) break;
  }
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

/* P3 视觉验证：近景看敌我单位。敌人角色近战围门、坦克炮台、单格坡道。 */
import { chromium } from "playwright";
const log = (...a) => console.log("[p3]", ...a);
const OUT = "E:/坦克大战3D/smoke/out";
setTimeout(() => { console.error("[p3] WATCHDOG"); process.exit(3); }, 300000).unref();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto("http://127.0.0.1:8001/?mode=survival&autotest=1&ff=10", { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => state === 7, { timeout: 40000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => state !== 5 && state !== 7, { timeout: 8000 });
  await page.evaluate(() => { game.prepTime = 0; });
  // 等敌人走近大门（挂机不布防）
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => ({ n: enemies.filter(e => e.alive).length, gate: Math.round(game.gateHp), wave: game.wave }));
    if (s.gate < 560) break;
  }
  // 相机拉近坡道/大门
  await page.evaluate(() => {
    const f = baseGroup.position;
    camera.position.set(f.x + 18, 10, f.z + 22);
    camera.lookAt(f.x, 2, f.z);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/p3-melee-near.png` });
  const st = await page.evaluate(() => ({
    enemies: enemies.filter(e => e.alive).length,
    gate: Math.round(game.gateHp),
    wave: game.wave,
    // 每类敌人模型抽样
    models: enemies.slice(0, 5).map(e => ({ t: e.type, boss: !!e.boss, hasMixer: !!e.mixer, y: +e.group.position.y.toFixed(2) })),
  }));
  log("状态:", JSON.stringify(st));
  log("pageErrs:", errs.length);
  await browser.close();
  log("RESULT:", errs.length === 0 ? "OK" : "ERR");
})().catch(e => { console.error("FATAL", e); process.exit(2); });

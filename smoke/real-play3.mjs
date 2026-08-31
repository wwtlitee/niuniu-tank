/* FPS 实测 + 经典模式真实流程（健壮版：分段容错）*/
import { chromium } from "playwright";
const URL = process.argv[2] || "http://127.0.0.1:8030/";
const log = (...a) => console.log("[t3]", ...a);
const errs = [];
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

async function fps(page) {
  return page.evaluate(() => new Promise(res => {
    let f = 0; const t0 = performance.now();
    const tick = () => { f++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(+(f / ((performance.now() - t0) / 1000)).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
}
async function enterCard(page, kw) {
  await page.evaluate(k => { const cs = [...document.querySelectorAll(".modeCard")]; const c = cs.find(x => x.textContent.includes(k)); c && c.click(); }, kw);
}

try {
  /* ---------- 生存 FPS ---------- */
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => errs.push("PAGEERROR: " + String(e?.message || e)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
  log("素材就绪，等待菜单卡…");
  await page.waitForFunction(() => document.querySelectorAll(".modeCard").length === 3, { timeout: 20000 });
  await enterCard(page, "生存");
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 60000 });
  log("已进入 PREP(7)");
  await page.evaluate(() => { game.gold = 99999; game.prepTime = 0.3; });
  await page.waitForFunction(() => typeof state !== "undefined" && state === 1, { timeout: 30000 });
  await page.waitForTimeout(6000);
  const fpsSurv = await fps();
  const sceneSurv = await page.evaluate(() => ({
    enemies: enemies.filter(e => e.alive).length,
    calls: (renderer && renderer.info) ? renderer.info.render.calls : "?",
    tris: (renderer && renderer.info) ? renderer.info.render.triangles : "?",
  }));
  log(`生存 FPS=${fpsSurv} (swiftshader软渲染)`, JSON.stringify(sceneSurv));
  await page.close();
} catch (e) { log("生存段异常:", String(e).split("\n")[0]); }

try {
  /* ---------- 经典模式 ---------- */
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => errs.push("PAGEERROR: " + String(e?.message || e)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll(".modeCard").length === 3, { timeout: 20000 });
  await enterCard(page, "经典");
  await page.waitForFunction(() => typeof state !== "undefined" && (state === 1 || state === 7), { timeout: 60000 });
  log("经典进入 state=", await page.evaluate(() => state));
  const p0 = await page.evaluate(() => (typeof player !== "undefined" && player && player.group) ? { x: +player.group.position.x.toFixed(2), z: +player.group.position.z.toFixed(2) } : null);
  await page.mouse.move(640, 400);
  await page.keyboard.down("KeyW"); await page.waitForTimeout(1500); await page.keyboard.up("KeyW");
  const p1 = await page.evaluate(() => (typeof player !== "undefined" && player && player.group) ? { x: +player.group.position.x.toFixed(2), z: +player.group.position.z.toFixed(2) } : null);
  const moved = p0 && p1 && (Math.abs(p0.x - p1.x) > 0.3 || Math.abs(p0.z - p1.z) > 0.3);
  await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  const bullets = await page.evaluate(() => (typeof bullets !== "undefined") ? bullets.length : "?");
  log(`经典 玩家 before=${JSON.stringify(p0)} after=${JSON.stringify(p1)}`, moved ? "可移动✅" : "无法移动❌", "| 开火子弹:", bullets);
  const fpsCls = await fps(page);
  log("经典 FPS=", fpsCls);
  await page.screenshot({ path: "E:/GameHub/games/tank3d/smoke/out/t3-classic.png" });
  await page.close();
} catch (e) { log("经典段异常:", String(e).split("\n")[0]); }

log("错误数:", errs.length); [...new Set(errs)].slice(0, 10).forEach(e => log("  ", e));
await browser.close();

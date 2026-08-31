/* A/B 渲染对照 v3：每侧独立浏览器 + ctxLost 检测重试(≤3)。
   健康判定：无 CONTEXT_LOST 且菜单场景 draw calls>50（崖壁/铺板已建）。 */
import { chromium } from "playwright";
const log = (...a) => console.log("[ab]", ...a);
setTimeout(() => { console.error("[ab] WATCHDOG timeout"); process.exit(3); }, 420000).unref();
const OUT = "E:/坦克大战3D/smoke/out";

async function shotOnce(url, out) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    let ctxLost = false;
    page.on("console", m => { if (/CONTEXT_LOST/i.test(m.text())) ctxLost = true; });
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
    await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      camera.position.set(-10, 60, 130);
      camera.lookAt(-60, 2, 60);
    });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({
      calls: renderer.info.render.calls,
      meshes: mapGroup ? mapGroup.children.length : -1
    }));
    await page.screenshot({ path: out });
    return { calls: info.calls, meshes: info.meshes, ctxLost };
  } finally { await browser.close(); }
}

async function shot(url, out, tag) {
  for (let i = 1; i <= 3; i++) {
    const r = await shotOnce(url, out);
    log(`[${tag}] try${i}: calls=${r.calls} meshes=${r.meshes} ctxLost=${r.ctxLost}`);
    if (!r.ctxLost && r.calls > 50) { log(`[${tag}] healthy`); return r; }
    log(`[${tag}] unhealthy, relaunching...`);
  }
  return null;
}

(async () => {
  const b = await shot("http://127.0.0.1:8001/?mode=survival&autotest=1", `${OUT}/ab3-batch.png`, "batch");
  const c = await shot("http://127.0.0.1:8001/?mode=survival&autotest=1&nobatch=1", `${OUT}/ab3-clone.png`, "clone");
  if (!b || !c) { log("RESULT: FAILED — no healthy run after retries"); process.exit(4); }
  log("———————————————");
  log(`draw calls: batch=${b.calls} clone=${c.calls} 降幅=${(100 * (1 - b.calls / c.calls)).toFixed(0)}%`);
  log(`context lost: batch=${b.ctxLost} clone=${c.ctxLost}`);
  log("RESULT: OK");
})().catch(e => { console.error("FATAL", e); process.exit(2); });

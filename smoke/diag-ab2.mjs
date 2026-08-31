/* A/B 渲染对照 v2：每侧独立浏览器实例（防 swiftshader context lost 串联），
   等待首帧渲染完成再截图。 */
import { chromium } from "playwright";
const log = (...a) => console.log("[ab]", ...a);
setTimeout(() => { console.error("[ab] WATCHDOG timeout"); process.exit(3); }, 300000).unref();
const OUT = "E:/坦克大战3D/smoke/out";

async function shot(url, out) {
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
    const info = await page.evaluate(() => ({ calls: renderer.info.render.calls, prog: renderer.info.programs?.length ?? -1 }));
    await page.screenshot({ path: out });
    log(`${out.split("/").pop()} calls=${info.calls} ctxLost=${ctxLost}`);
    return { calls: info.calls, ctxLost };
  } finally { await browser.close(); }
}

(async () => {
  const b = await shot("http://127.0.0.1:8001/?mode=survival&autotest=1", `${OUT}/ab2-batch.png`);
  const c = await shot("http://127.0.0.1:8001/?mode=survival&autotest=1&nobatch=1", `${OUT}/ab2-clone.png`);
  log("———————————————");
  log(`draw calls: batch=${b.calls} clone=${c.calls} 降幅=${(100 * (1 - b.calls / c.calls)).toFixed(0)}%`);
  log(`context lost: batch=${b.ctxLost} clone=${c.ctxLost}`);
})().catch(e => { console.error("FATAL", e); process.exit(2); });

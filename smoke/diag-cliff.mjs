/* 崖壁近景 A/B：低机位正对高地边缘，验证崖壁岩块渲染。复用重试逻辑。 */
import { chromium } from "playwright";
const log = (...a) => console.log("[cliff]", ...a);
setTimeout(() => { console.error("[cliff] WATCHDOG timeout"); process.exit(3); }, 420000).unref();
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
    // 找一块高地边缘：从地图数据取第一个高地格的世界坐标
    const cam = await page.evaluate(() => {
      let px = null, pz = null;
      if (typeof MAP !== "undefined" && MAP) {
        for (let r = 0; r < MAP.length && px === null; r++)
          for (let c = 0; c < MAP[r].length; c++)
            if (MAP[r][c] === "P") { px = (c - GRID / 2 + .5) * TILE; pz = (r - GRID / 2 + .5) * TILE; break; }
      }
      if (px === null) { px = -60; pz = 60; }
      return { px, pz };
    });
    await page.evaluate(({ px, pz }) => {
      camera.position.set(px, 4.5, pz + 14);
      camera.lookAt(px, 2.5, pz - 4);
    }, cam);
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({ calls: renderer.info.render.calls }));
    await page.screenshot({ path: out });
    return { calls: info.calls, ctxLost };
  } finally { await browser.close(); }
}

async function shot(url, out, tag) {
  for (let i = 1; i <= 3; i++) {
    const r = await shotOnce(url, out);
    log(`[${tag}] try${i}: calls=${r.calls} ctxLost=${r.ctxLost}`);
    if (!r.ctxLost) { log(`[${tag}] healthy`); return r; }
  }
  return null;
}

(async () => {
  const b = await shot("http://127.0.0.1:8001/?mode=survival&autotest=1", `${OUT}/cliff-batch.png`, "batch");
  const c = await shot("http://127.0.0.1:8001/?mode=survival&autotest=1&nobatch=1", `${OUT}/cliff-clone.png`, "clone");
  log(b && c ? "RESULT: OK" : "RESULT: PARTIAL (check pngs)");
})().catch(e => { console.error("FATAL", e); process.exit(2); });

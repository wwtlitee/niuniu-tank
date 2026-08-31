/* P2-2 显存泄漏验证：
   连续 resetGame 5 局（每次完整 genMap 重建全部地图装饰），
   对比 renderer.info.memory.geometrys/textures 首尾计数。
   通过标准：geometry 计数不再随局数线性增长（首局后增量 < 每局 10）。 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[mem]", ...a);
setTimeout(() => { console.error("[mem] WATCHDOG timeout"); process.exit(3); }, 180000).unref();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.waitForTimeout(2000);

  const snap = () => page.evaluate(() => {
    const m = renderer.info.memory;
    /* 强制释放一次渲染端未用资源，让计数反映"仍在被引用"的真实情况 */
    renderer.renderLists.dispose();
    return { g: m.geometries, t: m.textures, p: m.programs?.length ?? -1, dc: renderer.info.render.calls };
  });

  const samples = [await snap()];
  log(`局0(初始): geoms=${samples[0].g} tex=${samples[0].t}`);
  for (let i = 1; i <= 5; i++) {
    await page.evaluate(() => { resetGame(); genMap(1); });
    await page.waitForTimeout(1500);
    const s = await snap();
    samples.push(s);
    log(`局${i}: geoms=${s.g} tex=${s.t}`);
  }
  const per = [];
  for (let i = 2; i <= 5; i++) per.push(samples[i].g - samples[i - 1].g);
  const stable = per.every(d => Math.abs(d) < 10);
  log("———————————————");
  log(`局2→5 每局 geometry 增量: [${per.join(", ")}]`);
  log(`判定 计数稳定(不随重开线性增长): ${stable ? "✅ PASS" : "❌ FAIL"}`);
  await browser.close();
  process.exit(stable ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });

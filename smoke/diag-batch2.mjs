/* 直接调用 _batchCollect/_batchFlush 验证行为 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
setTimeout(() => { console.error("[t] WATCHDOG timeout"); process.exit(3); }, 120000).unref();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => console.log("[t] PAGEERROR:", String(e).slice(0, 150)));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") console.log("[t] console:", m.text().slice(0, 150)); });
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const out = {};
    try {
      // 手动收集 1 个 tile-high + 1 个 cliff_block_rock 并 flush 到独立组
      const g = new THREE.Group(); scene.add(g);
      _batchCollect("tile-high", _mT(0, 0, 0));
      _batchCollect("cliff_block_rock", _mT(20, 0, 20));
      _batchFlush(g);
      out.flushed = [];
      g.traverse(o => {
        if (o.isInstancedMesh) out.flushed.push({ count: o.count, mat: (Array.isArray(o.material) ? o.material[0] : o.material)?.name, geoVerts: o.geometry.attributes?.position?.count });
        else if (o.isMesh) out.flushed.push({ plainMesh: true, mat: o.material?.name });
      });
      scene.remove(g);
      // ASSETS 状态
      out.hasTile = !!ASSETS["tile-high"];
      out.hasCliff = !!ASSETS["cliff_block_rock"];
    } catch (e) { out.err = String(e?.stack || e).slice(0, 300); }
    return out;
  });
  writeFileSync("E:/坦克大战3D/smoke/out/batch-manual.json", JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

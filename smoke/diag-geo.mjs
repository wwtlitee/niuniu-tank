/* dump 静态装饰源模型的子 mesh 结构，为 InstancedMesh 化做准备 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[geo]", ...a);
setTimeout(() => { console.error("[geo] WATCHDOG timeout"); process.exit(3); }, 120000).unref();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const dump = {};
    for (const name of ["tile-high", "cliff_block_rock", "tile-slant", "cliff_blockSlope_rock", "tree_default"]) {
      const src = ASSETS[name];
      if (!src) { dump[name] = "MISSING"; continue; }
      const meshes = [];
      src.traverse(o => {
        if (o.isMesh) meshes.push({
          geoVerts: o.geometry.attributes?.position?.count ?? 0,
          mats: Array.isArray(o.material) ? o.material.length : 1,
          matNames: (Array.isArray(o.material) ? o.material : [o.material]).map(m => m?.name || m?.type || "?").slice(0, 4),
        });
      });
      dump[name] = { meshCount: meshes.length, meshes: meshes.slice(0, 6) };
    }
    const info = renderer.info.render;
    const mem = renderer.info.memory;
    return { dump, scene: { calls: info.calls, geoms: mem.geometries, tex: mem.textures } };
  });
  log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

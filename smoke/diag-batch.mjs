/* 调试 batch 崖壁消失 v2：dump mapGroup 里的 InstancedMesh 状态 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[dbg]", ...a);
setTimeout(() => { console.error("[dbg] WATCHDOG timeout"); process.exit(3); }, 120000).unref();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const out = { instanced: [], groups: 0, srcInfo: null, err: null };
    try {
      mapGroup.traverse(o => {
        if (o.isInstancedMesh) {
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          const M = new THREE.Matrix4();
          o.getMatrixAt(0, M);
          const p = new THREE.Vector3(), sc = new THREE.Vector3();
          M.extractPosition(p);
          M.extractScale(sc);
          out.instanced.push({
            count: o.count, cast: o.castShadow, recv: o.receiveShadow, visible: o.visible,
            mat: m?.name || m?.type || "?",
            firstPos: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)],
            firstScale: [+sc.x.toFixed(2), +sc.y.toFixed(2), +sc.z.toFixed(2)],
          });
        } else if (o.isGroup && o.parent === mapGroup) out.groups++;
      });
      const src = ASSETS["cliff_block_rock"];
      const si = { meshes: [] };
      src.updateMatrixWorld(true);
      src.traverse(o => {
        if (o.isMesh) {
          const p = new THREE.Vector3();
          o.matrixWorld.extractPosition(p);
          si.meshes.push({ mat: (Array.isArray(o.material) ? o.material : [o.material])[0]?.name, mw: [p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)] });
        }
      });
      out.srcInfo = si;
    } catch (e) { out.err = String(e); }
    return out;
  });
  writeFileSync("E:/坦克大战3D/smoke/out/diag-batch-dump.json", JSON.stringify(r, null, 1));
  log("dump written");
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

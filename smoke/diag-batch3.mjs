/* dump mapGroup 全部子对象类型计数 + genMap 重放验证 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
setTimeout(() => { console.error("[t] WATCHDOG timeout"); process.exit(3); }, 120000).unref();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => console.log("[t] PAGEERROR:", String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const out = { children: {}, instanced: 0, url: location.search };
    for (const c of mapGroup.children) {
      const k = c.type || c.constructor?.name || "?";
      out.children[k] = (out.children[k] || 0) + 1;
      if (c.isInstancedMesh) out.instanced++;
    }
    // 重放一次 genMap 看新 mapGroup
    genMap(1);
    out.after = { instanced: 0, children: {} };
    for (const c of mapGroup.children) {
      const k = c.type || c.constructor?.name || "?";
      out.after.children[k] = (out.after.children[k] || 0) + 1;
      if (c.isInstancedMesh) out.after.instanced++;
    }
    return out;
  });
  writeFileSync("E:/坦克大战3D/smoke/out/children-dump.json", JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

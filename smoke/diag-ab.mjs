/* A/B 渲染对照：同机位分别截「实例化批处理」与「逐格 clone」两种路径。
   clone 路径通过 URL 参数 ?nobatch=1 触发（engine.js 已加该开关）。 */
import { chromium } from "playwright";
const log = (...a) => console.log("[ab]", ...a);
setTimeout(() => { console.error("[ab] WATCHDOG timeout"); process.exit(3); }, 240000).unref();
const OUT = "E:/坦克大战3D/smoke/out";

async function shot(browser, url, out) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    /* 统一机位：高台要塞东南角俯视（能同时看到台面、崖壁、坡道、大门方向） */
    camera.position.set(-10, 60, 130);
    camera.lookAt(-60, 2, 60);
  });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({ calls: renderer.info.render.calls }));
  await page.screenshot({ path: out });
  log(`${out} calls=${info.calls}`);
  await page.close();
  return info.calls;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const cBatch = await shot(browser, "http://127.0.0.1:8001/?mode=survival&autotest=1", `${OUT}/ab-batch.png`);
  const cClone = await shot(browser, "http://127.0.0.1:8001/?mode=survival&autotest=1&nobatch=1", `${OUT}/ab-clone.png`);
  log("———————————————");
  log(`draw calls: batch=${cBatch} clone=${cClone} 降幅=${(100 * (1 - cBatch / cClone)).toFixed(0)}%`);
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

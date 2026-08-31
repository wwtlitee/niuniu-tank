/* P5c-R7 验证：拍台面草块侧壁 + 全景，确认去红效果 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("console", m => console.log("[pg]", m.text()));
p.on("pageerror", e => console.log("[pgerr]", e.message));
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1", { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(1200);

/* Shot 1: 台面俯视——检查草块网格侧壁颜色 */
await p.evaluate(() => { camFocus.set(0, 0, 38); camHeight = 28; camBack = 8; });
await p.waitForTimeout(800);
await p.screenshot({ path: "smoke/out/r7-plateau-top.png" });

/* Shot 2: 台面侧视角——看崖壁/边缘草块侧面 */
await p.evaluate(() => { camFocus.set(-18, 6, 32); camHeight = 14; camBack = 22; });
await p.waitForTimeout(800);
await p.screenshot({ path: "smoke/out/r7-cliff-side.png" });

/* Shot 3: 近距离特写——单个草块接缝处 */
await p.evaluate(() => { camFocus.set(2, 2, 36); camHeight = 5; camBack = 10; });
await p.waitForTimeout(800);
await p.screenshot({ path: "smoke/out/r7-closeup-seam.png" });

/* Shot 4: 全景 */
await p.evaluate(() => { camFocus.set(0, 0, 24); camHeight = 34; camBack = 26; });
await p.waitForTimeout(800);
await p.screenshot({ path: "smoke/out/r7-panorama.png" });

console.log("R7 verify shots done, 4 images captured");
process.exit(0);

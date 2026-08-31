/* P5c 纯场景多机位截图：与 shot-audit 同机位，但注入 #hud{display:none} 隐藏全部 2D UI，
   输出 c1-pure.png … c7-pure.png，供 scan-red-pixel 做无 UI 干扰的权威红色像素审计。 */
import { chromium } from "playwright";
const OUT = "smoke/out";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&t=" + Date.now(), { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(2000);

await p.addStyleTag({ content: "#hud{display:none!important}" });
await p.waitForTimeout(300);

await p.screenshot({ path: `${OUT}/c1-pure.png` });

await p.evaluate(() => { camFocus.set(cellCenter(9, 36).x, 0, cellCenter(9, 36).z); camHeight = 34; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c2-pure.png` });

await p.evaluate(() => { camFocus.set(cellCenter(9, 29).x, 0, cellCenter(9, 27).z); camHeight = 26; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c3-pure.png` });

await p.evaluate(() => { camFocus.set(cellCenter(18, 36).x, 0, cellCenter(18, 36).z); camHeight = 30; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c4-pure.png` });

await p.evaluate(() => { camFocus.set(cellCenter(9, 38).x, 0, cellCenter(9, 38).z); camHeight = 26; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c5-pure.png` });

await p.evaluate(() => { camFocus.set(cellCenter(40, 33).x, 0, cellCenter(40, 33).z); camHeight = 40; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c6-pure.png` });

await p.waitForTimeout(10000);
await p.evaluate(() => { camFocus.set(cellCenter(14, 36).x, 0, cellCenter(14, 36).z); camHeight = 36; });
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/c7-pure.png` });

process.exit(0);
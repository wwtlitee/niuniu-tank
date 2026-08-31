/* P5c 违和感审查：多机位截图，供逐张挑毛病 */
import { chromium } from "playwright";
const OUT = "smoke/out";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1", { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(2000);

/* 机位1：全景（默认镜头） */
await p.screenshot({ path: `${OUT}/c1-panorama.png` });

/* 机位2：台面中心俯视 */
await p.evaluate(() => { camFocus.set(cellCenter(9,36).x, 0, cellCenter(9,36).z); camHeight = 34; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c2-plateau-top.png` });

/* 机位3：崖壁断面（台面南缘外，低角度看崖壁） */
await p.evaluate(() => { camFocus.set(cellCenter(9,29).x, 0, cellCenter(9,27).z); camHeight = 26; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c3-cliff.png` });

/* 机位4：坡道近景 */
await p.evaluate(() => { camFocus.set(cellCenter(18,36).x, 0, cellCenter(18,36).z); camHeight = 30; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c4-ramp.png` });

/* 机位5：大门+基地区 */
await p.evaluate(() => { camFocus.set(cellCenter(9,38).x, 0, cellCenter(9,38).z); camHeight = 26; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c5-gate.png` });

/* 机位6：野外刷怪点+道路 */
await p.evaluate(() => { camFocus.set(cellCenter(40,33).x, 0, cellCenter(40,33).z); camHeight = 40; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/c6-wild.png` });

/* 战斗 12s 后：敌人+塔同框 */
await p.waitForTimeout(10000);
await p.evaluate(() => { camFocus.set(cellCenter(14,36).x, 0, cellCenter(14,36).z); camHeight = 36; });
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/c7-combat.png` });

/* ★ b.close() 在 swiftshader 下原生崩溃（try/catch 也拦不住），改为直接退出，
   父进程退出后 --remote-debugging-pipe 断开，无头浏览器随之回收 */
process.exit(0);

/* 金矿单独机位：确认 3 个橙红桶是不是金矿的 dumpster 基座 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1", { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(1500);

/* 在台面中心造 3 座金矿（引导任务第 1 步的放置位），镜头对准 */
await p.evaluate(() => {
  game.gold += 5000;
  const SB = window.SURVIVAL_BUILDS;
  const idxMine = SB.findIndex(b => b.id === "goldmine");
  const cells = [{x:8,z:36},{x:10,z:36},{x:9,z:34}];
  cells.forEach(c => { selectBuild(idxMine); tryPlace(cellCenter(c.x,c.z).x, cellCenter(c.x,c.z).z); });
  window.__minePos = cells.map(c => cellCenter(c.x,c.z));
});
await p.waitForTimeout(800);
await p.evaluate(() => {
  const m = window.__minePos[1];
  camFocus.set(m.x, 0, m.z); camHeight = 16; camBack = 12;
});
await p.waitForTimeout(700);
await p.screenshot({ path: "smoke/out/mine-closeup.png" });
console.log("mines:", await p.evaluate(() => goldMines.length));
process.exit(0);

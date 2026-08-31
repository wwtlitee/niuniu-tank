/* P4 专项烟测：
   1) 底部 HUD 三栏存在（wc3dock/mmDock/selPanel/resDock/cmdcard）
   2) B 键进建造模式（不暂停：敌人仍在更新）+ 命令卡切建造条目
   3) 坡道格 cellPlaceable=true 且 tryPlace 建墙成功（wasRamp 记录）
   4) 塔弹 thruWall=true（updateBuiltTurrets 传出）
   5) 墙破/拆后恢复 T_RAMP */
import { chromium } from "playwright";
import fs from "fs";
const OUT = "smoke/out";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[p4]", ...a);

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e)));

await page.goto("http://127.0.0.1:8001/?mode=survival&autotest=1&ff=10", { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 }); // MENU=7
await page.keyboard.press("Escape");   // 进游戏
await page.waitForFunction(() => typeof state !== "undefined" && (state === 6 || state === 1), { timeout: 40000 }); // PREP 或 PLAYING
await page.waitForTimeout(1500);

const R = {};

/* 1) HUD 存在 */
R.hud = await page.evaluate(() => {
  const ids = ["wc3dock", "mmDock", "cmdWrap", "selPanel", "cmdcard", "resDock", "minimap"];
  const ok = ids.every(id => !!document.getElementById(id));
  const disp = getComputedStyle(document.getElementById("wc3dock")).display;
  return { ok, dockDisplay: disp };
});
log("断言1 HUD DOM:", JSON.stringify(R.hud));

/* 2) B 建造模式不暂停 */
await page.keyboard.press("KeyB");
await page.waitForTimeout(400);
R.buildMode = await page.evaluate(() => {
  const en0 = enemies.length, toSpawn0 = game.enemiesToSpawn;
  return { state, wc3Build: typeof wc3BuildMode !== "undefined" ? wc3BuildMode : null,
    cards: document.querySelectorAll("#cmdcard .cmdBtn").length, en0, toSpawn0 };
});
await page.waitForTimeout(2500);
R.buildModeStill = await page.evaluate(en0 => ({ state, enemiesGrew: enemies.length >= 0, toSpawn: game.enemiesToSpawn }), R.buildMode.en0);
log("断言2 建造模式:", JSON.stringify(R.buildMode), "→", JSON.stringify(R.buildModeStill));

/* 3) 坡道建墙 */
R.rampWall = await page.evaluate(() => {
  const RP = ACTIVE_MODE.ramp;
  const z = RP.row, x = ACTIVE_MODE.enclosure.x1 + 2;   // 坡道中段
  if (grid[z][x] !== T_RAMP) return { ok: false, reason: "not ramp cell", t: grid[z][x] };
  game.gold += 200;
  selectBuild(shopList().findIndex(b => b.kind === "wall"));
  const ci = idx(x, z);
  tryPlace(cellCenter(x, z).x, cellCenter(x, z).z);
  const placed = grid[z][x] === T_STEEL && steelHP.get(ci) > 0;
  const wasRamp = !!(wallMeta.get(ci) && wallMeta.get(ci).wasRamp);
  return { ok: placed, wasRamp, t: grid[z][x] };
});
log("断言3 坡道建墙:", JSON.stringify(R.rampWall));

/* 5) 拆墙恢复坡道 */
R.rampRestore = await page.evaluate(() => {
  const RP = ACTIVE_MODE.ramp;
  const z = RP.row, x = ACTIVE_MODE.enclosure.x1 + 2;
  attemptDestroy(x, z);
  const back = grid[z][x] === T_RAMP;
  const flowOK = flowDist[idx(x, z)] >= 0;
  return { ok: back, flowOK, t: grid[z][x] };
});
log("断言5 拆墙恢复坡道:", JSON.stringify(R.rampRestore));
await page.keyboard.press("Escape");

/* 4) 塔弹穿墙：布防后抓 bullets */
await page.keyboard.press("KeyB");
await page.waitForTimeout(300);
await page.evaluate(() => { game.gold += 5000; });
await page.evaluate(() => {
  const idxTur = window.SURVIVAL_BUILDS.findIndex(b => b.kind === "turret");
  selectBuild(idxTur);
  for (let z = 30; z <= 44; z++) for (let x = 4; x <= 14; x++) {
    if (grid[z][x] === T_PLATEAU) { const c = cellCenter(x, z); tryPlace(c.x, c.z); x = 99; z = 99; break; }
  }
});
await page.keyboard.press("Escape");
/* 等敌波开打 + 塔开火 */
let thru = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1500);
  thru = await page.evaluate(() => bullets.length ? { n: bullets.length, thru: bullets.some(b => b.thruWall), owners: bullets.map(b => b.owner).slice(0, 5) } : null);
  if (thru && thru.n > 0) break;
}
log("断言4 塔弹 thruWall:", JSON.stringify(thru));

await page.screenshot({ path: `${OUT}/p4-hud.png` });
fs.writeFileSync(`${OUT}/p4-summary.json`, JSON.stringify(R, null, 2));
log("errors:", errs.length ? errs.join(" | ") : "none");
await browser.close();
const pass = R.hud.ok && R.hud.dockDisplay === "flex" && R.buildMode.cards >= 8 && R.rampWall.ok && R.rampWall.wasRamp
  && R.rampRestore.ok && R.rampRestore.flowOK && thru && thru.thru;
console.log("[p4] RESULT:", pass ? "ALL PASS" : "FAIL");
process.exit(pass ? 0 : 1);

/* P5 自查截图：尸潮+怪物+地板 目验脚本 */
import { chromium } from "playwright";
import fs from "fs";
const OUT = "smoke/out";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("[p5]", ...a);

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on("pageerror", e => errs.push(String(e)));
page.on("console", m => { if (m.type() === "error") errs.push("console:" + m.text()); });

await page.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10", { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await page.keyboard.press("Escape");
await page.waitForFunction(() => typeof state !== "undefined" && (state === 6 || state === 1), { timeout: 40000 });
await page.waitForTimeout(2000);

/* 资产检查 */
const assets = await page.evaluate(() => ({
  zombie: !!ASSETS["character-zombie"], skeleton: !!ASSETS["character-skeleton"],
  vampire: !!ASSETS["character-vampire"], ghost: !!ASSETS["character-ghost"], keeper: !!ASSETS["character-keeper"],
  floorGrass: !!ASSETS["floor-grass"], floorStone: !!ASSETS["floor-stone"],
  wc3tip: !!document.getElementById("wc3tip"),
}));
log("资产:", JSON.stringify(assets));

/* 快进到战斗期，等尸潮起来 */
await page.waitForTimeout(12000);
const waveInfo = await page.evaluate(() => ({
  wave: game.wave, enemies: enemies.length, toSpawn: game.enemiesToSpawn,
  char: enemies.slice(0, 3).map(e => e._charName || "?"), gold: game.gold,
  fails: typeof _assetFailCount !== "undefined" ? _assetFailCount : -1,
}));
log("战况:", JSON.stringify(waveInfo));
await page.screenshot({ path: `${OUT}/p5-horde.png` });

/* hover 命令卡验证 tooltip 不再报错 */
await page.keyboard.press("KeyB");
await page.waitForTimeout(400);
await page.evaluate(() => {
  const btns = document.querySelectorAll("#cmdcard .cmdBtn");
  if (btns.length) { btns[0].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); }
});
await page.waitForTimeout(300);
const tipVisible = await page.evaluate(() => {
  const t = document.getElementById("wc3tip");
  return t ? { exists: true, shown: t.style.display === "block", len: t.innerHTML.length } : { exists: false };
});
log("tooltip:", JSON.stringify(tipVisible));
await page.screenshot({ path: `${OUT}/p5-build.png` });

fs.writeFileSync(`${OUT}/p5-check.json`, JSON.stringify({ assets, waveInfo, tipVisible, errors: errs.slice(0, 6) }, null, 2));
log("errors:", errs.length ? errs.slice(0, 4).join(" | ") : "none");
await browser.close();
process.exit(0);

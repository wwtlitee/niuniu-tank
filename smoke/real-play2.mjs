/* 完整真实对局实测（无 autotest / 无 ff）：PREP→造塔→开波→战斗→观察 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "E:/GameHub/games/tank3d/smoke/out";
mkdirSync(OUT, { recursive: true });
const URL = process.argv[2] || "http://127.0.0.1:8030/";
const log = (...a) => console.log("[play]", ...a);
const errs = [];
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on("pageerror", e => errs.push("PAGEERROR: " + String(e?.message || e)));
page.on("console", m => { if (m.type() === "error") errs.push("[err] " + m.text()); });

await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const cs = [...document.querySelectorAll(".modeCard")];
  const surv = cs.find(c => c.textContent.includes("生存") || c.textContent.includes("高台"));
  surv && surv.click();
});
await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
log("已进入 PREP(7)");

// 快照：生存模式关键全局是否存在
const snap = await page.evaluate(() => ({
  mode: typeof ACTIVE_MODE !== "undefined" ? ACTIVE_MODE.key : "?",
  gateHp: typeof game !== "undefined" ? game.gateHp : "?",
  gold: typeof game !== "undefined" ? Math.round(game.gold) : "?",
  wave: typeof game !== "undefined" ? game.wave : "?",
  prepTime: typeof game !== "undefined" ? Math.round(game.prepTime) : "?",
  hasSelectBuild: typeof selectBuild === "function",
  hasTryPlace: typeof tryPlace === "function",
  builtTurrets: typeof builtTurrets !== "undefined" ? builtTurrets.length : "?",
  enemies: typeof enemies !== "undefined" ? enemies.length : "?",
}));
log("PREP 快照:", JSON.stringify(snap));

// 造塔：B 开商店 → 选炮塔 → 在坡口附近空地放置
await page.keyboard.press("KeyB");
await page.waitForTimeout(800);
const shopState = await page.evaluate(() => ({ state, shopVisible: !document.getElementById("build").classList.contains("hidden") }));
log("按 B 后:", JSON.stringify(shopState));
const placeRes = await page.evaluate(() => {
  try {
    const idx = window.SURVIVAL_BUILDS ? SURVIVAL_BUILDS.findIndex(b => b.kind === "turret") : -1;
    if (idx < 0) return { err: "no turret build", builds: typeof SURVIVAL_BUILDS !== "undefined" ? SURVIVAL_BUILDS.map(b => b.kind) : "?" };
    selectBuild(idx);
    game.gold = 9999;
    let placed = 0;
    for (let z = 30; z <= 42 && placed < 3; z++) for (let x = 18; x <= 28 && placed < 3; x++) {
      if (typeof grid !== "undefined" && grid[z] && grid[z][x] === T_EMPTY) {
        const c = cellCenter(x, z); tryPlace(c.x, c.z);
        if (builtTurrets.length > placed) placed = builtTurrets.length;
      }
    }
    return { placed, turrets: builtTurrets.length };
  } catch (e) { return { threw: String(e) }; }
});
log("造塔结果:", JSON.stringify(placeRes));
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 加速发育期结束：直接把 prepTime 归零（模拟等待），观察是否进入 PLAYING 并开波
await page.evaluate(() => { if (typeof game !== "undefined") game.prepTime = 0.5; });
let playing = false;
for (let i = 0; i < 20; i++) {
  const s = await page.evaluate(() => ({ state, wave: game.wave, enemies: enemies.length }));
  if (s.state === 1) { playing = true; log(`进入 PLAYING(1) @${i}s wave=${s.wave} enemies=${s.enemies}`); break; }
  await page.waitForTimeout(1000);
}
log("是否进入 PLAYING:", playing);

// 观察 60s 战斗：敌人是否推进、是否打门、塔是否杀人
let sawEnemy = false, gateDrop = false, scoreUp = false;
const g0 = await page.evaluate(() => game.gateHp);
const s0 = await page.evaluate(() => game.score);
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => ({
    state, wave: game.wave, n: enemies.filter(e => e.alive && !e.dying).length,
    gate: Math.round(game.gateHp), score: game.score, turrets: builtTurrets.length,
  }));
  if (s.n > 0) sawEnemy = true;
  if (s.gate < g0) gateDrop = true;
  if (s.score > s0) scoreUp = true;
  if (i % 4 === 0) log(`  t=${(i + 1) * 2}s state=${s.state} wave=${s.wave} 敌=${s.n} 门=${s.gate} 分=${s.score} 塔=${s.turrets}`);
  if (s.state === 4) { log(`  GAME OVER @${(i + 1) * 2}s`); break; }
}
await page.screenshot({ path: `${OUT}/play-combat.png` });
log("———————————————");
log("敌人出现:", sawEnemy ? "✅" : "❌", "| 门掉血:", gateDrop ? "✅" : "❌", "| 塔杀人(分↑):", scoreUp ? "✅" : "❌");
log("错误数:", errs.length);
[...new Set(errs)].slice(0, 20).forEach(e => log("  ", e));
await browser.close();

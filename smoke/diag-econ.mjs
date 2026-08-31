/* 真实经济平衡采样：不注入金币，模拟玩家正常攒钱节奏
   开局 250 金 → 立即买金矿(70) → 50s 内每秒采样 gold/mines/塔数，观察能否攒出第一座塔(60)防住第一波 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[econ]", ...a);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));

  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 30000 });

  // 立即买一个金矿放台面(不注入金币)
  const setup = await page.evaluate(() => {
    const SB = window.SURVIVAL_BUILDS;
    const gi = SB.findIndex(b => b.id === "goldmine");
    selectBuild(gi);
    const cc = cellCenter(5, 40);
    tryPlace(cc.x, cc.z);
    return { gold: game.gold, goldMines: goldMines.length };
  });
  log(`开局买金矿后: gold=${setup.gold} mines=${setup.goldMines}`);

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });

  // 模拟玩家在 PREP/PREP 结束后持续攒钱：第一波敌人到来时看经济
  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => ({
      gold: +game.gold.toFixed(1), mines: goldMines.length, turrets: builtTurrets.length,
      score: game.score, n: enemies.length, lives: game.lives, wave: game.wave,
    }));
    log(`t=${i * 5}s gold=${s.gold} mines=${s.mines} turb=${s.turrets} wave=${s.wave} score=${s.score} n=${s.n} lives=${s.lives}`);
  }
  await browser.close();
})();

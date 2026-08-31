/* 60s 端到端：在坡口正对敌人流场路径放 3 座机枪塔，验证击杀闭环 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[e2e]", ...a);

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

  // 沿 z=33 行（南侧出生点（45,33）主路径）布 3 座 mg
  const setup = await page.evaluate(() => {
    const SB = window.SURVIVAL_BUILDS;
    const i = SB.findIndex(b => b.id === "mg");
    selectBuild(i);
    game.gold += 9000;
    const cells = [[18, 33], [16, 33], [14, 33]];
    for (const [x, z] of cells) {
      const cc = cellCenter(x, z);
      tryPlace(cc.x, cc.z);
    }
    return builtTurrets.map(t => ({ cx: t.cx, cz: t.cz, range: t.range, dmg: t.dmg, fireCd: t.fireCd }));
  });
  log("turrets:", JSON.stringify(setup));

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });

  for (let i = 1; i <= 12; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => {
      let nearD = Infinity, nearHP = 0;
      for (const e of enemies) {
        const c = cellOf(e.group.position.x, e.group.position.z);
        if (c.z === 33 || c.z === 34) {
          const d = Math.hypot(e.group.position.x - 0, 0); // dist to z=33 row
          if (d < nearD) { nearD = d; nearHP = e.hp; }
        }
      }
      return { score: game.score, lives: game.lives, n: enemies.length, bullets: bullets.length, nearD: +nearD.toFixed(1), nearHP };
    });
    log(`t=${i * 5}s score=${s.score} lives=${s.lives} n=${s.n} bullets=${s.bullets} nearEnemy(distance,hp)=${s.nearD === Infinity ? "-" : s.nearD + "," + s.nearHP}`);
    if (s.score > 0) { log(`★ 端到端击杀验证通过 @${i * 5}s score=${s.score}`); break; }
  }
  await browser.close();
})();

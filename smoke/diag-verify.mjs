/* 最终定位：塔是否在射 + 子弹是否命中 + 敌人流场方向 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[v]", ...a);

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

  await page.evaluate(() => {
    const SB = window.SURVIVAL_BUILDS;
    game.gold += 8000;
    const i = SB.findIndex(b => b.id === "mg");
    selectBuild(i);
    const cc = cellCenter(14, 35);
    tryPlace(cc.x, cc.z);
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });
  await page.waitForFunction(async () => {
    if (typeof enemies === "undefined") return false;
    for (const e of enemies) {
      const c = cellOf(e.group.position.x, e.group.position.z);
      if (Math.abs(c.x - 18) <= 3 && Math.abs(c.z - 34) <= 3) return true;
    }
    return false;
  }, { timeout: 60000 }).catch(() => log("!! 敌人未进入塔旁区"));

  for (let i = 0; i < 4; i++) {
    const s = await page.evaluate(() => {
      const t0 = builtTurrets[0];
      return {
        bullets: bullets.length,
        turrets: builtTurrets.map(t => ({ kind: t.kind, cx: t.cx, cz: t.cz, range: t.range, cd: +t.cd.toFixed(3) })),
        enemies: enemies.slice(0, 8).map(e => {
          const c = cellOf(e.group.position.x, e.group.position.z);
          return {
            cell: [c.x, c.z], hp: e.hp, alive: e.alive,
            dir: [+e.dir.x.toFixed(2), +e.dir.z.toFixed(2)],
            flowHere: e.flowHere,
            grid: grid[c.z] && grid[c.z][c.x],
          };
        }),
      };
    });
    log(`--- sample ${i} ---`);
    log("bullets=" + s.bullets, "turrets=" + JSON.stringify(s.turrets));
    for (const e of s.enemies) log("  enemy", JSON.stringify(e));
    await page.waitForTimeout(2500);
  }

  await browser.close();
  log("done");
})();

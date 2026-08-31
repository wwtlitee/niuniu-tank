/* 命中闭环诊断：读塔世界坐标 + 敌人到塔距离，验证最终击杀 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[hit]", ...a);

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

  // 放两座机枪塔：一座在坡口内(14,35)，一座在基地正前(8,36)
  const setup = await page.evaluate(() => {
    const SB = window.SURVIVAL_BUILDS;
    const place = (id, cx, cz) => {
      const i = SB.findIndex(b => b.id === id);
      if (i < 0) return false;
      selectBuild(i);
      const cc = cellCenter(cx, cz);
      tryPlace(cc.x, cc.z);
      return true;
    };
    game.gold += 8000;
    place("mg", 14, 35);
    place("mg", 8, 36);
    return {
      base: ACTIVE_MODE.base,
      turrets: builtTurrets.map(t => ({
        cx: t.cx, cz: t.cz, range: t.range,
        pos: [+t.group.position.x.toFixed(1), +t.group.position.z.toFixed(1)],
      })),
      basePos: baseGroup ? [+baseGroup.position.x.toFixed(1), +baseGroup.position.z.toFixed(1)] : null,
    };
  });
  log("setup:", JSON.stringify(setup));

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });

  const snap = () => page.evaluate(() => {
    const t0 = builtTurrets[0] && builtTurrets[0].group.position;
    const t1 = builtTurrets[1] && builtTurrets[1].group.position;
    return {
      score: game.score, lives: game.lives, wave: game.wave, n: enemies.length,
      enemies: enemies.slice(0, 8).map(e => {
        const p = e.group.position;
        const d0 = t0 ? Math.hypot(p.x - t0.x, p.z - t0.z) : -1;
        const d1 = t1 ? Math.hypot(p.x - t1.x, p.z - t1.z) : -1;
        const c = cellOf(p.x, p.z);
        return { cell: [c.x, c.z], hp: e.hp, d0: +d0.toFixed(1), d1: +d1.toFixed(1) };
      }),
    };
  });

  let firstKill = -1;
  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(5000);
    const s = await snap();
    const minD0 = Math.min(...s.enemies.map(e => e.d0), Infinity);
    log(`t=${i * 5}s score=${s.score} n=${s.n} minD0(tower@14,35)=${
      minD0 === Infinity ? "—" : minD0.toFixed(1)
    }`);
    log("   enemies=" + JSON.stringify(s.enemies));
    if (s.score > 0 && firstKill < 0) { firstKill = i * 5; log(`★ 首次击杀 @${firstKill}s`); break; }
  }
  if (firstKill < 0) log("!! 60s 内未见击杀，存在问题");
  await browser.close();
  log("done");
})();

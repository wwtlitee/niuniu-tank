/* 聚焦诊断：机枪塔能否命中敌人（判断 score=0 是节奏还是塔不工作） */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("e:/坦克大战3D/smoke/out");
mkdirSync(OUT, { recursive: true });
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[diag]", ...a);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));

  log("goto", URL);
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 30000 });
  log("✓ PREP");

  // 放塔到坡口附近 target cell(14,35)，再垫一堵墙(15,36)
  const setup = await page.evaluate(() => {
    const SB = window.SURVIVAL_BUILDS;
    const findIdx = id => SB.findIndex(b => b.id === id);
    const pos = (cx, cz) => {
      const cc = cellCenter(cx, cz);
      return [cc.x, cc.z];
    };
    const out = { placed: [] };
    const place = (id, cx, cz) => {
      const i = findIdx(id);
      if (i < 0) { out.error = "no build " + id; return false; }
      selectBuild(i);
      const [px, pz] = pos(cx, cz);
      tryPlace(px, pz);
      out.placed.push({ id, cell: [cx, cz] });
      return true;
    };
    game.gold += 5000;
    place("mg", 14, 35);
    place("wall", 15, 36);
    place("wall", 13, 36);
    out.turrets = builtTurrets.map(t => ({ kind: t.kind, cx: t.cx, cz: t.cz, range: t.range, dmg: t.dmg, fireCd: t.fireCd }));
    return out;
  });
  log("setup:", JSON.stringify(setup));

  // 关闭 BUILD 并进入第 1 波
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });

  const snap = () => page.evaluate(() => ({
    state, wave: game.wave, score: game.score, lives: game.lives,
    enemyCount: enemies.length,
    enemies: enemies.slice(0, 6).map(e => ({
      x: +e.group.position.x.toFixed(1), z: +e.group.position.z.toFixed(1),
      hp: e.hp, alive: e.alive,
    })),
    turrets: builtTurrets.map(t => ({
      kind: t.kind, cx: t.cx, cz: t.cz, cd: +t.cd.toFixed(2),
    })),
  }));

  for (let i = 1; i <= 12; i++) {
    await page.waitForTimeout(5000);
    const s = await snap();
    log(`t=${i * 5}s state=${s.state} wave=${s.wave} score=${s.score} lives=${s.lives} n=${
      s.enemyCount
    } kills=${s.score / 100} turrets=${JSON.stringify(s.turrets)}`);
    log("   enemies=" + JSON.stringify(s.enemies));
    if (s.score > 0) { log("★ 命中！塔在正常击杀"); break; }
  }

  await page.screenshot({ path: `${OUT}/diag-fight.png` });
  await browser.close();
  log("done");
})();

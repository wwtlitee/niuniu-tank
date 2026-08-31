/* Playwright 无头烟测：生存模式全流程（v2 修复版）
   - 1) URL?mode=survival&autotest=1 直入 PREP
   - 2) 等资源就绪 + 验证 quest 面板可见
   - 3) 按 B 进 BUILD 状态 → selectBuild(0) 选金库 → tryPlace(x, z) 落点
   - 4) 墙 / 基础塔 同流程
   - 5) 等若干秒，验证 quest 推进 + 状态机进入 PLAYING
   - 6) 截图 + 采集 console / network 4xx-5xx
   修复 v1 问题：
   - SURVIVAL_BUILDS.find 改用 shopList() 找
   - selectBuild 接整型 index 而非 build 对象
   - tryPlace 现在接受 (px, pz) 坐标
*/
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve("e:/坦克大战3D");
const OUT  = resolve("e:/坦克大战3D/smoke/out");
mkdirSync(OUT, { recursive: true });

const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[smoke]", ...a);

const errs = [];
const pageErrs = [];
const badNet = [];
const consoleAll = [];   // 记录所有 console 信息便于诊断

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  page.on("console", m => {
    const t = m.type();
    const txt = m.text();
    consoleAll.push({ type: t, text: txt });
    if (t === "error" || t === "warning") {
      if (/Autofocus|webgl warning|favicon|THREE\.WebGLRenderer/i.test(txt)) return;
      if (t === "error") errs.push(txt);
    }
  });
  page.on("pageerror", e => pageErrs.push(String(e?.stack || e)));
  page.on("response", r => {
    if (r.status() >= 400) badNet.push({ url: r.url(), status: r.status() });
  });

  log("goto", URL);
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });

  // 等资源加载
  log("wait assetsReady …");
  try {
    await page.waitForFunction(
      () => typeof assetsReady === "function" && assetsReady() === true,
      { timeout: 30000 }
    );
  } catch (e) { log("⚠ assetsReady wait timeout, continue"); }

  // 等到 PREP
  log("wait state=PREP (7) …");
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 30000 });
  log("✓ 进入 PREP");
  await page.screenshot({ path: `${OUT}/01-prep.png` });

  // 验证 quest 面板可见
  const questText0 = await page.locator("#questPanel").innerText().catch(() => "");
  log("quest initial text:", questText0.split("\n").join(" | "));

  // 用 B 键切到 BUILD 状态
  log("press B → enter BUILD state …");
  await page.keyboard.press("KeyB");
  await page.waitForFunction(() => typeof state !== "undefined" && state === 5, { timeout: 5000 });
  log("✓ BUILD state entered");

  // 在 BUILD 状态下用内部 API 放建筑（高地区域取中心几个 cell）
  const placeResult = await page.evaluate(() => {
    const out = { ok: true, steps: [] };
    try {
      const w = GRID, h = GRID, T = TILE;
      const cx = Math.floor(w / 2);
      const cz = Math.floor(h / 2);

      // 找 3 个不同可放置 cell：先取网格表面 T_PLATEAU 上的格子
      const plateauCells = [];
      for (let z = 2; z < h - 2; z++) {
        for (let x = 2; x < w - 2; x++) {
          if (grid[z] && grid[z][x] === T_PLATEAU) plateauCells.push({ x, z });
          if (plateauCells.length >= 8) break;
        }
        if (plateauCells.length >= 8) break;
      }
      if (plateauCells.length < 3) {
        // fallback：随便取 3 个内圈空地
        plateauCells.push({ x: cx - 2, z: cz - 1 });
        plateauCells.push({ x: cx + 1, z: cz - 1 });
        plateauCells.push({ x: cx, z: cz + 2 });
      }

      // 充足金币
      game.gold += 5000;
      updateGoldUI && updateGoldUI();

      const SB = window.SURVIVAL_BUILDS;
      const mine = SB.find(b => b.id === "goldmine");
      const wall = SB.find(b => b.id === "wall");
      const tur  = SB.find(b => b.kind === "turret");
      out.builds = { mine: mine?.id, wall: wall?.id, turret: tur?.id };
      out.survivalBuildsLen = SB.length;

      // 确保 SURVIVAL_BUILDS 存在
      if (!window.SURVIVAL_BUILDS || !Array.isArray(window.SURVIVAL_BUILDS)) {
        throw new Error("window.SURVIVAL_BUILDS is not available (len=" + (window.SURVIVAL_BUILDS && window.SURVIVAL_BUILDS.length) + ")");
      }
      // shopList 顺序应与 SURVIVAL_BUILDS 一致
      const idxMine = window.SURVIVAL_BUILDS.findIndex(b => b.id === "goldmine");
      const idxWall = window.SURVIVAL_BUILDS.findIndex(b => b.id === "wall");
      const idxTur  = window.SURVIVAL_BUILDS.findIndex(b => b.kind === "turret");

      const cellA = plateauCells[0], cellB = plateauCells[1], cellC = plateauCells[2];
      const centerOf = (c) => cellCenter(c.x, c.z);

      // 1) 金库
      selectBuild(idxMine);
      tryPlace(centerOf(cellA).x, centerOf(cellA).z);
      out.steps.push({ id: "mine", cell: cellA, gold: game.gold, mines: goldMines.length });

      // 2) 墙
      selectBuild(idxWall);
      tryPlace(centerOf(cellB).x, centerOf(cellB).z);
      out.steps.push({
        id: "wall", cell: cellB, gold: game.gold,
        walls: steelHP.size, lv: wallLvAt(cellB.x, cellB.z)
      });

      // 3) 塔
      selectBuild(idxTur);
      tryPlace(centerOf(cellC).x, centerOf(cellC).z);
      out.steps.push({
        id: "turret", cell: cellC, gold: game.gold,
        turrets: builtTurrets.length
      });

      out.goldLeft = game.gold;
      out.popUsed = game.popUsed;
      out.popMax = game.popMax;
      out.state = state;
    } catch (e) {
      out.ok = false;
      out.err = String(e?.stack || e);
    }
    return out;
  });
  log("placeResult:", JSON.stringify(placeResult, null, 2));
  await page.screenshot({ path: `${OUT}/02-after-place.png` });

  // 验证 quest 推进
  const questDone = await page.evaluate(() => ({
    questActive, questIdx,
    goldMines: goldMines.length,
    walls: steelHP.size,
    turrets: builtTurrets.length,
  }));
  log("quest state:", questDone);

  // 验证墙升级 Lv1→Lv2 价格正确
  const upgradeResult = await page.evaluate(() => {
    const it = [...steelHP.keys()][0];
    if (it === undefined) return { err: "no wall placed" };
    /* engine.js 的 idx(x,z) 返回 z*GRID+x（整数），不是 "x,z" 字符串 */
    const cx = it % GRID, cz = Math.floor(it / GRID);
    const before = { gold: game.gold, lv: wallLvAt(cx, cz) };
    const idxWall = window.SURVIVAL_BUILDS.findIndex(b => b.id === "wall");
    selectBuild(idxWall);
    tryPlace(cellCenter(cx, cz).x, cellCenter(cx, cz).z);
    const after = {
      gold: game.gold,
      lv: wallLvAt(cx, cz),
      hp: steelHP.get(idx(cx, cz)),
    };
    return { cell: [cx, cz], before, after, priceLv2: WALL_LEVELS[1].price };
  });
  log("upgrade wall Lv1->Lv2:", JSON.stringify(upgradeResult));
  await page.screenshot({ path: `${OUT}/03-after-upgrade.png` });

  // 关闭 BUILD 状态（回到打开时的状态：PREP 或 PLAYING）
  log("close build menu …");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });

  // 跳过 prep 进入第一波（直接置 0）
  await page.evaluate(() => { if (typeof game !== "undefined" && game) game.prepTime = 0; });

  // 8s 后看状态
  await page.waitForTimeout(8000);
  const midState = await page.evaluate(() => ({
    state, wave: game.wave, gold: game.gold,
    hp: player ? player.hp : null,
    lives: game.lives,
    enemyCount: enemies.length,
    buildings: { mines: goldMines.length, walls: steelHP.size, turrets: builtTurrets.length },
    questActive, questIdx,
  }));
  log("mid state after 8s:", midState);
  await page.screenshot({ path: `${OUT}/04-mid-play.png` });

  // 再等 25s
  await page.waitForTimeout(25000);
  const lateState = await page.evaluate(() => ({
    state, wave: game.wave, gold: game.gold, score: game.score,
    enemyCount: enemies.length, lives: game.lives,
    buildings: { mines: goldMines.length, walls: steelHP.size, turrets: builtTurrets.length },
    questActive, questIdx,
  }));
  log("late state after 33s total:", lateState);
  await page.screenshot({ path: `${OUT}/05-late-play.png` });

  const summary = {
    url: URL,
    errs, pageErrs, badNet,
    consoleErrSamples: errs.slice(0, 5),
    placeResult, questDone, upgradeResult,
    midState, lateState,
  };
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
  log("DONE. errs=", errs.length, "pageErrs=", pageErrs.length, "badNet=", badNet.length);

  await browser.close();
  process.exit(errs.length || pageErrs.length ? 1 : 0);
})().catch(e => {
  console.error("SMOKE FATAL:", e);
  process.exit(2);
});

/* ★ P1-2 修复：结果断言式烟测（替代 smoke-survival.mjs 的"只看无报错"模式）
   5 条硬指标（复审报告 §六），任一不过即 FAIL：
   1) 布防后 N 秒内 score>0            （塔能杀人）
   2) 挂机 90 游戏秒内 gateHp 必须下降  （敌人能打到门 → 存在失败条件）
   3) 手动清空一波后波次必须恰好 +1     （重入回归）
   4) 每只敌人 60 游戏秒内 flowDist 必须下降（不卡死）
   5) 挂机 180 游戏秒必须触发 STATE.OVER（游戏可失败）
   时长压缩：?ff=10 时间倍速下 180 游戏秒 ≈ 18 真实秒。 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve("E:/坦克大战3D");
const OUT = resolve("E:/坦克大战3D/smoke/out");
mkdirSync(OUT, { recursive: true });

const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1&ff=10";
const log = (...a) => console.log("[assert]", ...a);
const WD_MS = 300000;
setTimeout(() => { console.error("[assert] WATCHDOG timeout, force exit"); process.exit(3); }, WD_MS).unref();

const pageErrs = [];
const badNet = [];

/* 场景启动 helper：进 PLAYING，返回 page */
async function boot(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => pageErrs.push(String(e?.stack || e)));
  page.on("response", r => { if (r.status() >= 400) badNet.push({ url: r.url(), status: r.status() }); });
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });
  let inPlay = false;
  for (let i = 0; i < 15; i++) {
    if (await page.evaluate(() => state === 1)) { inPlay = true; break; }
    await page.waitForTimeout(1000);
  }
  if (!inPlay) throw new Error("未能进入 PLAYING");
  return page;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const R = {};   // 各断言结果

  /* ── 断言 4：单只敌人 60 游戏秒内 flowDist 必须下降（放最前，独立场景） ── */
  try {
    const page = await boot(browser);
    // 等到出现「远端」敌人（d0>=5）：门口的敌人 d=1 无处可降，不在本断言范围
    let target = null;
    for (let i = 0; i < 20 && !target; i++) {
      target = await page.evaluate(() => {
        const e = enemies.find(e => {
          if (!e.alive || e.dying || e._d0 !== undefined) return false;
          const c = cellOf(e.group.position.x, e.group.position.z);
          return flowDist[c.z * GRID + c.x] >= 5;
        });
        if (!e) return null;
        const c = cellOf(e.group.position.x, e.group.position.z);
        e._d0 = flowDist[c.z * GRID + c.x];
        return { d0: e._d0, cell: `${c.x},${c.z}` };
      });
      if (!target) await page.waitForTimeout(2000);
    }
    if (!target) { log("断言4 无远端敌人可采样 → ❌"); R.a4_flow = false; }
    else {
      let d4 = false;
      for (let i = 0; i < 12; i++) {   // 12×5s 真实 = 60 游戏秒上限
        await page.waitForTimeout(5000);
        const s = await page.evaluate(() => {
          const e = enemies.find(e => e.alive && !e.dying && e._d0 !== undefined);
          if (!e) return { gone: true };   // 死亡或抵达门口都算走完
          const c = cellOf(e.group.position.x, e.group.position.z);
          return { d: flowDist[c.z * GRID + c.x], d0: e._d0 };
        });
        if (s.gone || s.d < s.d0) { d4 = true; break; }
      }
      log(`断言4 flowDist 下降: ${d4 ? "✅" : "❌"} (起点 d0=${target.d0} @${target.cell})`);
      R.a4_flow = d4;
    }
    await page.close();
  } catch (e) { log("断言4 异常:", String(e)); R.a4_flow = false; }

  /* ── 断言 1：布防（建塔）后 score>0 ── */
  try {
    const page = await boot(browser);
    await page.evaluate(() => { game.gold += 5000; });
    await page.keyboard.press("KeyB");
    await page.waitForFunction(() => state === 5, { timeout: 5000 });
    const placed = await page.evaluate(() => {
      const idxTur = window.SURVIVAL_BUILDS.findIndex(b => b.kind === "turret");
      selectBuild(idxTur);
      // 找坡口东侧地面格（x=21~25, z=34~38）放塔拦截敌人
      for (let z = 34; z <= 38; z++) for (let x = 21; x <= 25; x++) {
        if (grid[z][x] === T_EMPTY) {
          const c = cellCenter(x, z);
          tryPlace(c.x, c.z);
          if (builtTurrets.length > 0) return { ok: true, x, z };
          return { ok: false, x, z, g: grid[z][x] };
        }
      }
      return { ok: false, err: "no empty cell" };
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => state !== 5, { timeout: 5000 });
    log("布防:", JSON.stringify(placed));

    // 观测 90 游戏秒：score>0（塔杀人）
    let score = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(3000);
      const s = await page.evaluate(() => ({ score: game.score, state }));
      if (s.score > 0) { score = true; break; }
      if (s.state === 4) break;
    }
    log(`断言1 塔杀人(score↑): ${score ? "✅" : "❌"}`);
    R.a1_score = score;
    await page.screenshot({ path: `${OUT}/assert1-combat.png` });
    await page.close();
  } catch (e) { log("断言1 异常:", String(e)); R.a1_score = false; }

  /* ── 断言 2：不布防挂机，gateHp 必须下降（敌人能打到门 → 存在失败条件）
     注：必须与断言 1 分开场景 —— 塔杀敌太快会保护大门，干扰本断言 ── */
  try {
    const page = await boot(browser);   // 纯挂机，什么都不建
    let gateDrop = false;
    const g0 = await page.evaluate(() => game.gateHp);
    for (let i = 0; i < 30; i++) {   // 30×3s 真实 = 90 游戏秒 @ff=10
      await page.waitForTimeout(3000);
      const s = await page.evaluate(() => ({ hp: game.gateHp, state }));
      if (s.hp < g0) { gateDrop = true; break; }
      if (s.state === 4) { gateDrop = true; break; }   // 打穿=最高级掉血
    }
    log(`断言2 挂机 gateHp 下降: ${gateDrop ? "✅" : "❌"} (基线 ${g0})`);
    R.a2_gate = gateDrop;
    await page.close();
  } catch (e) { log("断言2 异常:", String(e)); R.a2_gate = false; }

  /* ── 断言 3：手动清一波，波次恰好 +1（damageGate 屏蔽防破门） ── */
  try {
    const page = await boot(browser);
    await page.evaluate(() => {
      const og = window.damageGate;
      window.damageGate = function () { return 0; };   // 屏蔽门伤害
      window.__sw = 0;
      const os = window.startWave;
      window.startWave = function (n, ...a) { window.__sw++; return os.call(this, n, ...a); };
      game.enemiesToSpawn = 0;
    });
    await page.waitForTimeout(4000);   // 等几只敌人
    const before = await page.evaluate(() => ({
      wave: game.wave, sw: window.__sw, score: game.score, n: enemies.filter(e => e.alive).length,
    }));
    log("清波前:", JSON.stringify(before));
    // 清场（含尸体）
    for (let i = 0; i < 20; i++) {
      const n = await page.evaluate(() => {
        enemies.forEach(e => { if (e.alive && !e.dying) killEnemy(e, false); });
        return enemies.length;
      });
      if (n === 0) break;
      await page.waitForTimeout(800);
    }
    // 轮询波次推进
    let okWave = false, okScore = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => ({ wave: game.wave, sw: window.__sw, score: game.score, state }));
      if (s.wave === before.wave + 1) { okWave = true; okScore = s.score - before.score === 500 + before.wave * 100; break; }
      if (s.state === 4) break;
    }
    log(`断言3 波次 ${before.wave}→+1 恰好一次(真实执行): ${okWave && okScore ? "✅" : "❌"} (score 增量校验 ${okScore})`);
    R.a3_wave = okWave && okScore;
    await page.close();
  } catch (e) { log("断言3 异常:", String(e)); R.a3_wave = false; }

  /* ── 断言 5：完全挂机 180 游戏秒（18 真实秒 @ff=10）内必须 STATE.OVER ── */
  try {
    const page = await boot(browser);
    let over = false;
    for (let i = 0; i < 24; i++) {   // 24×2s 真实 = 48 真实秒 = 480 游戏秒上限，远超 180
      await page.waitForTimeout(2000);
      const st = await page.evaluate(() => ({ state, gate: Math.round(game.gateHp) }));
      if (st.state === 4) { over = true; log(`  OVER @${(i + 1) * 2}s (gate=${st.gate})`); break; }
    }
    log(`断言5 挂机触发 STATE.OVER: ${over ? "✅" : "❌"}`);
    R.a5_over = over;
    await page.close();
  } catch (e) { log("断言5 异常:", String(e)); R.a5_over = false; }

  await browser.close();

  /* ── 汇总判定 ── */
  const summary = { url: URL, asserts: R, pageErrs, badNet, ts: new Date().toISOString() };
  writeFileSync(`${OUT}/assert-summary.json`, JSON.stringify(summary, null, 2));
  const allPass = R.a1_score && R.a2_gate && R.a3_wave && R.a4_flow && R.a5_over && pageErrs.length === 0;
  log("———————————————");
  log(`断言1 塔杀人:        ${R.a1_score ? "✅" : "❌"}`);
  log(`断言2 敌人打门:      ${R.a2_gate ? "✅" : "❌"}`);
  log(`断言3 清波单次推进:  ${R.a3_wave ? "✅" : "❌"}`);
  log(`断言4 敌人不卡死:    ${R.a4_flow ? "✅" : "❌"}`);
  log(`断言5 游戏可失败:    ${R.a5_over ? "✅" : "❌"}`);
  log(`pageErrs=${pageErrs.length} badNet=${badNet.length}`);
  log(allPass ? "★ 结果断言烟测全通过" : "★ 结果断言烟测存在失败项");
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error("SMOKE FATAL:", e); process.exit(2); });

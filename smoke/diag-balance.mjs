/* 平衡性重采样（修复后基线，旧数据全部作废）
   Run A 难度下限：完全不布防，测被打穿时间/波次。
   Run B 参考策略：自然经济（不注入金币），金矿×N + 机枪塔×N 的最笨策略，测能守到第几波。
   每波输出遥测行；结果写 smoke/out/balance-*.json。
   ff=10 时间倍速；ctxLost 自动重开浏览器重试(≤2)。 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const log = (...a) => console.log("[bal]", ...a);
const OUT = "E:/坦克大战3D/smoke/out";
setTimeout(() => { console.error("[bal] WATCHDOG timeout"); process.exit(3); }, 900000).unref();
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1&ff=10";

async function boot(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  let ctxLostN = 0, pageErr = null;
  page.on("console", m => { if (/CONTEXT_LOST/i.test(m.text())) ctxLostN++; });
  page.on("pageerror", e => { pageErr = String(e?.stack || e); });
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });
  for (let i = 0; i < 15; i++) {
    if (await page.evaluate(() => state === 1)) break;
    await page.waitForTimeout(1000);
  }
  // ctxLost 不致命：引擎已带 webglcontextrestored 强制重传，lost+restore 后游戏照常
  // 只有 pageerror 或僵死（60s 无任何状态变化）才判失败
  return {
    page, lostN: () => ctxLostN, getErr: () => pageErr,
    async stalled(prevSig, lastChangeMs) { return Date.now() - lastChangeMs > 60000; },
  };
}

const snap = p => p.evaluate(() => ({
  state, wave: game.wave, gold: +game.gold.toFixed(1), gateHp: Math.round(game.gateHp),
  lives: game.lives, score: game.score,
  mines: goldMines.length, turrets: builtTurrets.length, n: enemies.length,
}));

/* 建造：开商店→选建筑→扫描空格放置→关商店。返回是否成功。 */
async function build(page, id, range) {
  await page.keyboard.press("KeyB");
  try { await page.waitForFunction(() => state === 5, { timeout: 4000 }); } catch { await page.keyboard.press("Escape"); return false; }
  const ok = await page.evaluate(({ id, range }) => {
    const SB = window.SURVIVAL_BUILDS;
    const gi = SB.findIndex(b => b.id === id);
    if (gi < 0 || game.gold < SB[gi].price) return false;
    const before = id === "goldmine" ? goldMines.length : builtTurrets.length;
    selectBuild(gi);
    const OK = new Set([T_EMPTY, T_ROAD, T_PLATEAU]);   // 与 cellPlaceable 同判据
    for (let z = range.z0; z <= range.z1; z++) for (let x = range.x0; x <= range.x1; x++) {
      if (grid[z] && grid[z][x] !== undefined && OK.has(grid[z][x])) {
        const c = cellCenter(x, z);
        tryPlace(c.x, c.z);
        const after = id === "goldmine" ? goldMines.length : builtTurrets.length;
        if (after > before) return true;
      }
    }
    return false;
  }, { id, range });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => state !== 5, { timeout: 4000 }).catch(() => {});
  return ok;
}

/* 三选一卡：出现即点第一张 */
async function pickCard(page) {
  const clicked = await page.evaluate(() => {
    const wrap = document.getElementById("upgrade");
    if (!wrap || wrap.classList.contains("hidden")) return false;
    const c = wrap.querySelector(".card");
    if (!c) return false;
    c.click(); return true;
  });
  return clicked;
}

const MINE_R = { x0: 3, x1: 14, z0: 30, z1: 43 };    // 台面矿区
const TUR_R  = { x0: 20, x1: 26, z0: 33, z1: 39 };   // 坡口东侧拦截带

/* Run A：无防守 */
async function runA() {
  for (let tr = 1; tr <= 2; tr++) {
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
    try {
      const { page, lostN, getErr } = await boot(browser);
      const rows = []; const t0 = Date.now();
      let last = await snap(page); last.t = 0; rows.push(last);
      let lastChange = Date.now();
      log(`A try${tr}: 进战斗 wave=${last.wave} gate=${last.gateHp}`);
      while (Date.now() - t0 < 240000) {
        await page.waitForTimeout(2000);
        const s = await snap(page); s.t = (Date.now() - t0) / 1000;
        if (s.wave !== last.wave || s.gateHp !== last.gateHp || s.state !== last.state) { rows.push(s); lastChange = Date.now(); }
        if (s.state === 4) { log(`A: OVER @${s.t.toFixed(0)}s wave=${s.wave} gate=${s.gateHp} (ctxLost×${lostN()})`); break; }
        if (getErr()) throw new Error("pageerror: " + getErr());
        if (Date.now() - lastChange > 60000) throw new Error("stalled 60s no change");
        last = s;
      }
      if (last.state !== 4) log(`A 240s 未终局: wave=${last.wave} state=${last.state} (ctxLost×${lostN()})`);
      writeFileSync(`${OUT}/balance-A-nodefense.json`, JSON.stringify({ run: "A 无防守", rows, ctxLostN: lostN(), err: getErr() }, null, 1));
      log(`A 完成: ${rows.length} 行, 终态 wave=${last.wave} state=${last.state}`);
      return last;
    } catch (e) { log(`A try${tr} 失败: ${e.message}`); }
    finally { await browser.close(); }
  }
  return null;
}

/* Run B：参考策略 */
async function runB() {
  for (let tr = 1; tr <= 2; tr++) {
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
    try {
      const { page, lostN, getErr } = await boot(browser);
      const rows = []; const t0 = Date.now();
      let last = await snap(page); last.t = 0; rows.push(last);
      let waveT = Date.now(); let lastProg = Date.now(); let lastSig = "";
      while (Date.now() - t0 < 480000) {
        await page.waitForTimeout(800);
        const s = await snap(page); s.t = (Date.now() - t0) / 1000;
        const sig = `${s.wave}|${s.gold}|${s.turrets}|${s.mines}|${s.n}`;
        if (sig !== lastSig) { lastProg = Date.now(); lastSig = sig; }
        if (s.wave !== last.wave) {
          s.waveDur = (Date.now() - waveT) / 1000; waveT = Date.now();
          rows.push(s);
          log(`B: WAVE ${s.wave} | 历时${s.waveDur.toFixed(1)}s | gold=${s.gold} gate=${s.gateHp} lives=${s.lives} 矿${s.mines} 塔${s.turrets} score=${s.score}`);
        }
        if (s.state === 4) { log(`B 终局: wave=${s.wave} score=${s.score} lives=${s.lives} gate=${s.gateHp} @${s.t.toFixed(0)}s (ctxLost×${lostN()})`); break; }
        if (getErr()) throw new Error("pageerror: " + getErr());
        if (Date.now() - lastProg > 90000) throw new Error("stalled 90s no progress");
        // 决策：优先矿(至6)→塔(至 wave+2 上限10)→扩矿已有逻辑
        let did = false;
        if (s.mines < 3 && s.gold >= 70) did = await build(page, "goldmine", MINE_R);
        else if (s.turrets < Math.min(s.wave + 2, 10) && s.gold >= 60) did = await build(page, "mg", TUR_R);
        else if (s.mines < 6 && s.gold >= 140) did = await build(page, "goldmine", MINE_R);
        if (!did) await pickCard(page);
        last = s;
      }
      if (last.state !== 4) log(`B 超时未终局: wave=${last.wave} state=${last.state} (ctxLost×${lostN()})`);
      writeFileSync(`${OUT}/balance-B-strategy.json`, JSON.stringify({ run: "B 参考策略(矿+机枪)", rows, ctxLostN: lostN(), err: getErr() }, null, 1));
      return last;
    } catch (e) { log(`B try${tr} 失败: ${e.message}`); }
    finally { await browser.close(); }
  }
  return null;
}

(async () => {
  const a = await runA();
  const b = await runB();
  const sum = {
    ts: new Date().toISOString(),
    A: a ? { overAtSec: a.t, wave: a.wave, gateHp: a.gateHp, state: a.state } : "FAILED",
    B: b ? { endWave: b.wave, endState: b.state, score: b.score, lives: b.lives, mines: b.mines, turrets: b.turrets } : "FAILED",
  };
  writeFileSync(`${OUT}/balance-summary.json`, JSON.stringify(sum, null, 2));
  log("=== 平衡重采样汇总 ===");
  log(`A 无防守: ${JSON.stringify(sum.A)}`);
  log(`B 参考策略: ${JSON.stringify(sum.B)}`);
})().catch(e => { console.error("FATAL", e); process.exit(2); });

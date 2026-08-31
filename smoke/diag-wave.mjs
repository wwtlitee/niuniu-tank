/* 波次推进验证（P0-1 回归 v3）：
   核心断言：清场后 waveCleared 恰好 1 次（非 28 次重入）、波次恰好 +1。
   注意：敌人不朽（damageGate 屏蔽）时 spawnCap 会让 toSpawn 卡在上限下方，
   因此不等待"刷满全波"，直接置空 toSpawn + 清场即可覆盖 P0-1 的回归面。 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1&ff=5";
const log = (...a) => console.log("[wave]", ...a);

setTimeout(() => { console.error("[wave] WATCHDOG: 3min timeout, force exit"); process.exit(3); }, 180000).unref();

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", e => log("PAGEERROR:", String(e?.stack || e)));
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

  await page.evaluate(() => {
    window.__c = { wc: 0, sw: 0, waveLog: [], gateHits: 0 };
    const ow = window.waveCleared, os = window.startWave, og = window.damageGate;
    window.waveCleared = function (...a) { window.__c.wc++; return ow.apply(this, a); };
    window.startWave = function (n, ...a) { window.__c.sw++; window.__c.waveLog.push(n); return os.call(this, n, ...a); };
    window.damageGate = function (raw, pos) { window.__c.gateHits++; return 0; };  // 屏蔽门伤害，防止测试中被破门
  });

  await page.evaluate(() => { game.gold += 5000; });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });

  // 显式等待进入 PLAYING
  let inPlay = false;
  for (let i = 0; i < 15; i++) {
    const st = await page.evaluate(() => ({ state, wave: game.wave }));
    if (st.state === 1) { inPlay = true; break; }
    await page.waitForTimeout(1000);
  }
  if (!inPlay) { log("❌ 未能进入 PLAYING"); await browser.close(); process.exit(1); }

  // 等几只敌人出生（有活体即可，不必刷满）
  await page.waitForTimeout(6000);
  // 清波前：记录 score 作为「真实执行次数」的对照（每次真实 waveCleared +600）
  const before = await page.evaluate(() => {
    game.enemiesToSpawn = 0;                       // 停止后续刷怪
    return { wave: game.wave, wc: window.__c.wc, sw: window.__c.sw, score: game.score, n: enemies.filter(e => e.alive).length };
  });
  log("清波前:", JSON.stringify(before));
  if (before.n === 0) { log("❌ 场上无敌人，测试中止"); await browser.close(); process.exit(1); }

  // 清场：杀光存活 + 等尸体移除（enemies.length 归零，waveCleared 以 length 判定）
  log("清场中 …");
  for (let i = 0; i < 20; i++) {
    const n = await page.evaluate(() => {
      enemies.forEach(e => { if (e.alive && !e.dying) killEnemy(e, false); });
      return enemies.length;
    });
    if (n === 0) { log(`  场上已全清（含尸体，第 ${i + 1} 次）`); break; }
    await page.waitForTimeout(800);
  }

  // 轮询等待波次推进（waveCleared 内部 0.9s 延迟 + startWave）
  let fin = null;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ wc: window.__c.wc, sw: window.__c.sw, wave: game.wave, n: enemies.length, score: game.score, state }));
    fin = s;
    if (s.wc >= 1 && s.wave === before.wave + 1) break;
    if (s.state === 4) { log("  ⚠ 游戏意外结束"); break; }
  }
  log("结果:", JSON.stringify(fin));

  /* ★ 断言用「真实执行」证据，不用包装计数：
     包装函数在闸门检查之前计数，_waveClearing 吞掉的重复进入也会 +1（伪影）。
     真实执行证据链：score 增量 =600(500+1*100) 且 startWave 恰好 2 次 且波次恰好 +1。
     反例对照：P0-1 bug 存在时 score 会 +28*600=16800、波次连跳。 */
  const dScore = fin.score - before.score;
  const okReal = dScore === 600;
  const okSw = fin && fin.sw === 2;
  const okWave = fin && fin.wave === before.wave + 1;
  const gateHits = await page.evaluate(() => window.__c.gateHits);
  log("———————————————");
  log(`判定 score 增量: ${dScore} （期望 600，证明真实执行 1 次） → ${okReal ? "✅ PASS" : "❌ FAIL"}`);
  log(`判定 startWave 次数: ${fin.sw} （期望 2） → ${okSw ? "✅ PASS" : "❌ FAIL"}`);
  log(`判定 波次: ${before.wave} → ${fin.wave} （期望 +1） → ${okWave ? "✅ PASS" : "❌ FAIL"}`);
  log(`包装计数 wc（含被闸门吞掉的伪影）: ${fin.wc}`);
  log(`门受击次数（应持续>0，证明屏蔽在工作）: ${gateHits}`);
  const pass = okReal && okSw && okWave;
  log(pass ? "★ P0-1 回归通过" : "★ P0-1 回归失败");
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });

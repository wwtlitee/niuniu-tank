/* P1-1 波次看门狗专项验证（v2 无进展语义）：
   前置清场 → 只构造 1 只被钢墙包围的敌人（任何寻路/滑移都出不去，无攻击目标）
   → 置 _wdStallT=88 快进 → 断言：n 1→0（看门狗收割）→ 尸体清空 → 波次 +1。
   注：n 下降是看门狗触发的唯一证据（无玩家/炮塔干预）；wd 采样可能错过 90 瞬间
   （触发即被 _wdProgress 归零），故不按 wd>=90 断言。 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[wd]", ...a);

setTimeout(() => { console.error("[wd] WATCHDOG: 3min timeout, force exit"); process.exit(3); }, 180000).unref();

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
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });

  // 等 PLAYING + 波 1 开始刷怪
  let inPlay = false;
  for (let i = 0; i < 15; i++) {
    const st = await page.evaluate(() => ({ state, wave: game.wave }));
    if (st.state === 1 && st.wave >= 1) { inPlay = true; break; }
    await page.waitForTimeout(1000);
  }
  if (!inPlay) { log("❌ 未能进入 PLAYING"); await browser.close(); process.exit(1); }

  // 前置清场：杀光自然刷的敌人并等尸体移除，再构造孤立卡死局
  for (let i = 0; i < 15; i++) {
    const n = await page.evaluate(() => {
      enemies.forEach(e => { if (e.alive && !e.dying) killEnemy(e, false); });
      return enemies.length;
    });
    if (n === 0) break;
    await page.waitForTimeout(800);
  }
  const setup = await page.evaluate(() => {
    game.enemiesToSpawn = 0;                     // 停止自然刷怪
    _wdStallT = 0;                               // 清场击杀已喂过进度，从零起算
    spawnEnemy("normal");
    const e = enemies[enemies.length - 1];
    const cc = cellCenter(40, 8);
    e.group.position.set(cc.x, 0, cc.z);
    // 围一圈钢墙（数据层直接焊死，敌人无路可走、无墙可拆目标错位——墙在四邻，拆完仍困）
    const around = [[39,7],[40,7],[41,7],[39,8],[41,8],[39,9],[40,9],[41,9]];
    for (const [x, z] of around) if (grid[z][x] === T_EMPTY || grid[z][x] === T_ROAD) grid[z][x] = T_STEEL;
    _wdStallT = 88;                              // 快进到阈值前 2 游戏秒
    return { wave: game.wave, n: enemies.length, wd: _wdStallT };
  });
  log("卡死局构造:", JSON.stringify(setup));

  /* 断言链：n 1→0（看门狗收割）→ 波次 +1（清波条件满足后 waveCleared→startWave） */
  let killed = false, waveAdvanced = false;
  const wave0 = setup.wave;
  for (let i = 0; i < 45; i++) {                 // 45×2s=90s 真实 ≈ 45+ 游戏秒，足够 wd 2→90
    await page.waitForTimeout(2000);
    const s = await Promise.race([
      page.evaluate(() => ({
        n: enemies.filter(e => e.alive).length, len: enemies.length,
        wave: game.wave, wd: Math.round(_wdStallT), state,
      })),
      new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate timeout")), 15000)),
    ]);
    log(`+${(i + 1) * 2}s n=${s.n} len=${s.len} wave=${s.wave} wd=${s.wd} state=${s.state}`);
    if (s.n === 0 && !killed && s.len === 0) killed = true;
    if (s.wave === wave0 + 1) { waveAdvanced = true; break; }
    if (s.state === 4) break;
  }
  log("———————————————");
  log(`判定 卡死敌人被看门狗收割(n 1→0): ${killed ? "✅" : "❌"}`);
  log(`判定 波次推进 +1: ${waveAdvanced ? "✅" : "❌"}`);
  const pass = killed && waveAdvanced;
  log(pass ? "★ P1-1 看门狗验证通过" : "★ P1-1 看门狗验证失败");
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });

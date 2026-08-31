/* 长时对局诊断：验证 ①能否战败 ②波次推进 ③渲染开销 ④帧率
   场景 A = 纯挂机(不建任何塔)，观察大门掉血/掉命/波次
   场景 B = 建 6 座 mg 塔，观察能否守住 + 帧率与 draw call
*/
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const RUN_SEC = Number(process.argv[3] || 150);
const SCENARIO = process.argv[2] || "afk";   // afk | defend
const log = (...a) => console.log(`[${SCENARIO}]`, ...a);

const launch = () => chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
});

(async () => {
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e?.stack || e)));
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });

  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

  // 秒表：在主循环里插桩统计真实 FPS
  await page.evaluate(() => {
    window.__fps = { frames: 0, t0: performance.now(), min: 999, samples: [] };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => {
      window.__fps.frames++;
      cb(t);
    });
  });

  if (SCENARIO === "defend") {
    const r = await page.evaluate(() => {
      game.gold += 3000;
      const SB = window.SURVIVAL_BUILDS;
      const ti = SB.findIndex(b => b.id === "mg");
      selectBuild(ti);
      // 坡口内侧一排 6 座（col 14-19 × row 33-36 一带）
      const spots = [[13, 32], [14, 34], [15, 36], [12, 35], [11, 33], [13, 38]];
      let ok = 0;
      for (const [cx, cz] of spots) {
        const c = cellCenter(cx, cz);
        tryPlace(c.x, c.z);
        if (builtTurrets.length > ok) ok = builtTurrets.length;
      }
      return { turrets: builtTurrets.length, gold: game.gold };
    });
    log("布防:", JSON.stringify(r));
  }

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => typeof state !== "undefined" && state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });

  const snap = () => page.evaluate(() => {
    const f = window.__fps;
    const now = performance.now();
    const fps = f.frames / ((now - f.t0) / 1000);
    f.frames = 0; f.t0 = now;
    let info = null;
    try { info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, prog: renderer.info.programs?.length ?? -1 }; } catch (e) {}
    return {
      state, wave: game.wave, score: game.score, lives: game.lives,
      gateHp: Math.round(game.gateHp ?? -1), gateMax: game.gateMaxHp ?? -1,
      n: enemies.length, toSpawn: game.enemiesToSpawn,
      gold: +game.gold.toFixed(0), turrets: builtTurrets.length,
      bullets: typeof bullets !== "undefined" ? bullets.length : -1,
      fps: +fps.toFixed(1), info,
      over: state === STATE.OVER,
    };
  });

  log(`开始 ${RUN_SEC}s 长跑 …`);
  let last = null;
  for (let i = 1; i * 10 <= RUN_SEC; i++) {
    await page.waitForTimeout(10000);
    const s = await snap();
    log(`t=${i * 10}s wave=${s.wave} n=${s.n} toSpawn=${s.toSpawn} gate=${s.gateHp}/${s.gateMax} lives=${s.lives} score=${s.score} gold=${s.gold} fps=${s.fps} calls=${s.info?.calls} tris=${s.info?.tris}`);
    last = s;
    if (s.over) { log("★ GAME OVER @", i * 10, "s"); break; }
  }

  const fin = await snap();
  log("—— 终局 ——");
  log(JSON.stringify(fin, null, 2));
  log("错误数:", errs.length, errs.slice(0, 5));
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(2); });

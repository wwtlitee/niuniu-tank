/* P2-1 渲染优化验证：
   1) renderer.info.render.calls 对比（改造基线 412）
   2) 真实截图 ×3（全景 / 高台俯视 / 坡道近景）—— 渲染改动必须像素级目验
   3) 敌人爬坡对局中截图，验证战斗画面正常 */
import { chromium } from "playwright";
const URL = "http://127.0.0.1:8001/?mode=survival&autotest=1";
const log = (...a) => console.log("[rd]", ...a);
setTimeout(() => { console.error("[rd] WATCHDOG timeout"); process.exit(3); }, 240000).unref();
const OUT = "E:/坦克大战3D/smoke/out";

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [];
  page.on("pageerror", e => { errs.push(String(e?.stack || e)); log("PAGEERROR:", String(e).slice(0, 200)); });
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await page.waitForTimeout(2500);

  /* 相机控制辅助：对准某世界坐标 */
  const aimAt = (x, y, z, dist, pitch) => page.evaluate(([x, y, z, dist, pitch]) => {
    camera.position.set(x + dist * Math.sin(pitch), y + dist * Math.cos(pitch) * .9, z + dist * Math.cos(pitch) * .45);
    camera.lookAt(x, y, z);
  }, [x, y, z, dist, pitch]);

  const info = await page.evaluate(() => ({
    calls: renderer.info.render.calls,
    geoms: renderer.info.memory.geometries,
  }));
  log(`菜单背景 draw calls: ${info.calls} (改造基线 412)`);

  // 1) 全景
  await aimAt(0, 0, 0, 150, 1.1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/rd-1-panorama.png` });

  // 2) 高台俯视（要塞中心 (-72,0,84) 附近）
  await aimAt(-72, 2, 84, 55, 1.15);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/rd-2-plateau.png` });

  // 3) 坡道近景（坡道走廊 col16-19 row34-38 → 世界 x≈-32..-16, z≈-4..12）
  await aimAt(-24, 1, 4, 30, 1.0);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/rd-3-ramp.png` });

  // 4) 进入战斗 20 真实秒（ff=10 → 200 游戏秒）后全景：验证敌人/子弹/特效 + 战斗 draw call
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => state !== 5, { timeout: 5000 });
  await page.evaluate(() => { game.prepTime = 0; });
  await page.waitForTimeout(3000);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => ({ state, n: enemies.length }));
    if (st.state === 4) break;
  }
  const battle = await page.evaluate(() => ({
    calls: renderer.info.render.calls, enemies: enemies.length, state,
    wave: game.wave, gate: Math.round(game.gateHp),
  }));
  log(`战斗中 draw calls: ${battle.calls} enemies=${battle.enemies} wave=${battle.wave} gate=${battle.gate} state=${battle.state}`);
  await aimAt(0, 0, 0, 150, 1.1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/rd-4-battle.png` });

  const okDraw = info.calls < 200;   // 412 → 预期 <100
  log("———————————————");
  log(`判定 菜单 draw calls ${info.calls} < 200: ${okDraw ? "✅" : "❌"}`);
  log(`判定 无页面错误: ${errs.length === 0 ? "✅" : "❌"} (${errs.length})`);
  log("截图: rd-1-panorama / rd-2-plateau / rd-3-ramp / rd-4-battle (smoke/out/)");
  await browser.close();
  process.exit(okDraw && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });

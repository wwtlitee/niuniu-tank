import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto("http://127.0.0.1:8001/?mode=survival&autotest=1&ff=10", { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 40000 }).catch(() => {});
  await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => typeof state !== "undefined" && state !== 5 && state !== 7, { timeout: 8000 });
  await p.evaluate(() => { game.prepTime = 0; });
  for (let i = 0; i < 25; i++) {
    await p.waitForTimeout(2000);
    const s = await p.evaluate(() => ({ g: Math.round(game.gateHp) }));
    if (s.g < 560) break;
  }
  await p.evaluate(() => {
    const f = baseGroup.position;
    camera.position.set(f.x + 14, 7, f.z + 16);
    camera.lookAt(f.x, 2.5, f.z);
  });
  await p.waitForTimeout(600);
  await p.screenshot({ path: "E:/坦克大战3D/smoke/out/p3-gate-close.png" });
  await b.close();
  console.log("done");
})().catch(e => { console.error("FATAL", e); process.exit(2); });

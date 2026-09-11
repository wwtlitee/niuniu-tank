"use strict";

const path = require("node:path");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const outDir = path.join(projectRoot, "pdoc", "report");
  const server = await createStaticServer(projectRoot);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
    await page.waitForFunction(() => typeof state !== "undefined" && state === 7, null, { timeout: 40_000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const dump = await page.evaluate(() => {
      const announce = document.getElementById("announce"); if (announce) announce.style.display = "none";
      const fog = document.getElementById("survivalFogCanvas"); if (fog) fog.style.display = "none";
      enemies.splice(0).forEach((enemy) => { scene.remove(enemy.group); if (enemy.beam) scene.remove(enemy.beam); });
      game.wave = 1; game.enemiesToSpawn = 0; state = STATE.PLAYING;
      const C = ACTIVE_MODE.canyon;
      const origin = cellCenter(C.x1 + 2, C.z0);
      const fill = new THREE.PointLight(0xffe2b8, 3.2, 48);
      fill.position.set(origin.x, 7, origin.z + 2); scene.add(fill);
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Vector3(origin.x + (i % 3) * 1.4 - 1.4, 0, origin.z + Math.floor(i / 3) * 1.6 - .6);
        spawnCorpseRemains(p, i === 0);
      }
      for (let i = 0; i < 80; i++) updateCorpseDecals(1 / 60);
      const look = () => {
        camera.position.set(origin.x + 4.2, 4.8, origin.z + 6.4);
        camera.lookAt(origin.x, 0.2, origin.z);
        renderer.render(scene, camera);
      };
      updateCamera = look;
      window.__poseRaf = true;
      const tick = () => { if (window.__poseRaf) { look(); requestAnimationFrame(tick); } };
      tick();
      const last = corpseDecals[corpseDecals.length - 1];
      let flesh = 0, blood = 0;
      last.root.traverse((object) => { if (object.isMesh) { if (object.userData.blood) blood++; else flesh++; } });
      return { groups: corpseDecals.length, blood, flesh, drops: last.pieces.length };
    });
    await page.waitForTimeout(220);
    const gameCanvas = page.locator("#game canvas").first();
    await gameCanvas.screenshot({ path: path.join(outDir, "REPORT_喷溅血迹_v6.16.7.png") });
    process.stdout.write(`${JSON.stringify(dump)}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

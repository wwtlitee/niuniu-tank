"use strict";

const fs = require("node:fs");
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
      const fill = new THREE.PointLight(0xffe2b8, 3.4, 48);
      fill.position.set(origin.x, 7, origin.z + 2); scene.add(fill);

      const spawnOne = (zOffset) => {
        spawnEnemy("normal", false);
        const enemy = enemies[enemies.length - 1];
        if (enemy.beam) { scene.remove(enemy.beam); enemy.beam = null; }
        enemy.spawnFlash = 0; enemy.thinkTimer = 999; enemy.speed = 0; enemy.maxSpeed = 0;
        enemy.group.position.set(origin.x, heightAt(origin.x, origin.z), origin.z + zOffset);
        enemy.dir.set(1, 0, 0); enemy.heading = Math.PI / 2; enemy.group.rotation.y = Math.PI / 2;
        enemy.actions.idle?.stop(); enemy.actions.walk?.reset().setEffectiveWeight(1).play();
        enemy.mixer?.update(0.2);
        return enemy;
      };
      const a = spawnOne(-1.4), b = spawnOne(0.6), c = spawnOne(2.6);
      a._attackedNow = true; a.attackPose = 0.5; applyZombieReachPose(a);
      b._attackedNow = true; b.attackPose = 0.5; applyZombieReachPose(b);
      killEnemy(c, false);
      for (let i = 0; i < 18; i++) updateEnemies(1 / 30);
      a.attackPose = 0.5; applyZombieReachPose(a);
      b.attackPose = 0.5; applyZombieReachPose(b);

      const look = () => {
        camera.position.set(origin.x + 5.8, 3.0, origin.z + 5.8);
        camera.lookAt(origin.x, 1.4, origin.z);
        renderer.render(scene, camera);
      };
      updateCamera = look;
      window.__poseRaf = true;
      const tick = () => { if (window.__poseRaf) { look(); requestAnimationFrame(tick); } };
      tick();
      const blood = corpseDecals[corpseDecals.length - 1];
      return {
        attackPose: a.attackPose,
        dying: c.dying,
        fallX: c.visualRoot ? +c.visualRoot.rotation.x.toFixed(3) : null,
        fallZ: c.visualRoot ? +c.visualRoot.rotation.z.toFixed(3) : null,
        bloodChildren: blood ? blood.root.children.length : 0,
        bloodPieces: blood ? blood.pieces.length : 0,
      };
    });

    await page.waitForTimeout(220);
    const gameCanvas = page.locator("#game canvas").first();
    if (await gameCanvas.count()) await gameCanvas.screenshot({ path: path.join(outDir, "REPORT_丧尸攻击与死亡_v6.16.6.png") });
    else await page.screenshot({ path: path.join(outDir, "REPORT_丧尸攻击与死亡_v6.16.6.png") });
    fs.writeFileSync(path.join(outDir, "REPORT_丧尸攻击与死亡诊断_v6.16.6.json"), JSON.stringify(dump, null, 2));
    process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

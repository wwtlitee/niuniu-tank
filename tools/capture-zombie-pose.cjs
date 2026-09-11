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
      if (window.__poseFill) { scene.remove(window.__poseFill); window.__poseFill = null; }
      const fill = new THREE.PointLight(0xffe2b8, 3.4, 48);
      fill.position.set(origin.x, 7, origin.z + 2);
      scene.add(fill); window.__poseFill = fill;

      for (let i = 0; i < 4; i++) {
        spawnEnemy("normal", false);
        const enemy = enemies[i];
        if (enemy.beam) { scene.remove(enemy.beam); enemy.beam = null; }
        enemy.spawnFlash = 0;
        enemy.thinkTimer = 999;
        enemy.group.position.set(origin.x, heightAt(origin.x, origin.z), origin.z + (i - 1.5) * 2.05);
        enemy.dir.set(1, 0, 0);
        enemy.heading = Math.PI / 2;
        enemy.group.rotation.y = Math.PI / 2;
        enemy.speed = 0;
        enemy.maxSpeed = 0;
        enemy.actions.idle?.stop();
        enemy.actions.walk?.reset().setEffectiveWeight(1).play();
        enemy.currentAnim = "walk";
        enemy.mixer?.update(0.22);
        applyZombieReachPose(enemy);
      }

      const sample = enemies[0];
      const along = (from, to) => {
        if (!from || !to) return null;
        const v = new THREE.Vector3().subVectors(to.getWorldPosition(new THREE.Vector3()), from.getWorldPosition(new THREE.Vector3())).normalize();
        return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
      };
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(sample.group.getWorldQuaternion(new THREE.Quaternion()));
      const leftAlong = along(sample.poseBones.LeftArm, sample.poseBones.LeftForeArm);
      const forwardDot = leftAlong ? leftAlong.x * facing.x + leftAlong.y * facing.y + leftAlong.z * facing.z : null;

      window.__poseOrigin = origin;
      window.__poseLook = function (kind) {
        const o = window.__poseOrigin;
        if (kind === "side") {
          camera.position.set(o.x, 2.55, o.z - 8.6);
          camera.lookAt(o.x, 1.4, o.z);
        } else if (kind === "front") {
          camera.position.set(o.x + 7.6, 2.6, o.z);
          camera.lookAt(o.x, 1.45, o.z);
        } else {
          camera.position.set(o.x + 5.8, 3.0, o.z + 5.8);
          camera.lookAt(o.x, 1.4, o.z);
        }
        renderer.render(scene, camera);
      };
      updateCamera = function () { if (window.__poseKind) window.__poseLook(window.__poseKind); };
      window.__poseKind = "side";
      window.__poseLook("side");
      return {
        poseKeys: Object.keys(sample.poseBones || {}),
        facing: { x: +facing.x.toFixed(3), y: +facing.y.toFixed(3), z: +facing.z.toFixed(3) },
        leftAlong, forwardDot,
        origin,
      };
    });

    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(outDir, "REPORT_丧尸奔跑侧面_v6.16.4.png") });
    await page.evaluate(() => { window.__poseKind = "front"; window.__poseLook("front"); });
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(outDir, "REPORT_丧尸奔跑正面_v6.16.4.png") });
    await page.evaluate(() => { window.__poseKind = "threeQuarter"; window.__poseLook("threeQuarter"); });
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(outDir, "REPORT_丧尸奔跑斜侧_v6.16.4.png") });
    fs.writeFileSync(path.join(outDir, "REPORT_丧尸奔跑骨骼诊断_v6.16.4.json"), JSON.stringify(dump, null, 2));
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

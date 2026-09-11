"use strict";

const path = require("node:path");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const output = path.join(projectRoot, "pdoc", "report", "REPORT_十二种实体尸潮与血雾_v6.10.0.png");
  const server = await createStaticServer(projectRoot);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(`${originFor(server)}/index.html?mode=survival&autotest=1`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
    await page.waitForFunction(() => typeof state !== "undefined" && state === 7, null, { timeout: 30_000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    const stateSnapshot = await page.evaluate(() => {
      enemies.splice(0).forEach((enemy) => { scene.remove(enemy.group); if (enemy.beam) scene.remove(enemy.beam); });
      game.wave = 21;
      game.enemiesToSpawn = 0;
      state = STATE.PLAYING;
      const rows = [];
      for (let index = 0; index < 48; index++) {
        spawnEnemy(index % 11 === 0 ? "heavy" : index % 7 === 0 ? "fast" : "normal", false);
        const enemy = enemies[enemies.length - 1];
        const cell = cellCenter(17 + index % 8, 30 + Math.floor(index / 8));
        enemy.group.position.set(cell.x + (index % 2) * 0.42, heightAt(cell.x, cell.z), cell.z + (index % 3) * 0.32);
        enemy.spawnFlash = 0;
        enemy.speed = 0;
        enemy.actions.idle?.stop();
        enemy.actions.walk?.reset().play();
        enemy.mixer?.update(0.17 + (index % 4) * 0.07);
        rows.push({ variant: enemy.variantId, pack: enemy.variantPack });
      }
      enemies.forEach((enemy)=>{enemy.group.visible=true;});
      updateBloodMist(4);
      const focus = cellCenter(20, 33);
      camFocus.set(focus.x, 1.1, focus.z);
      camHeight = 31;
      updateCamera(0);
      document.getElementById("waveInfo").childNodes[0].nodeValue = "WAVE 21 · 尸潮视觉验收";
      updateEnemyLeftUI();
      renderer.render(scene, camera);
      return { rows, variants:[...new Set(rows.map((row)=>row.variant))],packs:[...new Set(rows.map((row)=>row.pack))],
        wave: game.wave, remaining: enemies.length,bloodMist:bloodMistSurfaces.map((surface)=>surface.material.opacity) };
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: output });
    process.stdout.write(`${JSON.stringify({ output, consoleErrors, stateSnapshot }, null, 2)}\n`);
    if (consoleErrors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function originFor(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

"use strict";

const path = require("node:path");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
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
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      game.gold = 9999;
      const factory = { group: new THREE.Group(), hp: 760, maxHp: 760, queue: [
        { typeId: "light", remaining: 3, total: 7 },
        { typeId: "light", remaining: 7, total: 7 },
        { typeId: "medium", remaining: 11, total: 11 },
        { typeId: "light", remaining: 7, total: 7 },
        { typeId: "heavy", remaining: 17, total: 17 },
      ], progress: .51, rally: { x: 4, z: 10 }, x: 6, z: 14 };
      scene.add(factory.group);
      heavyFactories.push(factory);
      renderFactoryQueueDock();
      wc3Select("factory", factory);
      wc3RenderSel();
      renderCmdCard();
      updateGoldUI();
    });
    await page.waitForTimeout(200);
    await page.locator("#wc3dock").screenshot({ path: path.join(projectRoot, "pdoc", "report", "REPORT_魔兽底栏命令格_v6.16.8.png") });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

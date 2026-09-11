"use strict";

const path = require("node:path");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const server = await createStaticServer(projectRoot);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/index.html?mode=survival`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60000 });
    await page.waitForSelector("#difficultySelect:not(.hidden)", { timeout: 30000 });
    await page.screenshot({ path: path.join(projectRoot, "output", "difficulty-ui-6.34.0.png"), fullPage: true });
    const cards = await page.locator("#difficultyOptions [data-difficulty]").count();
    const labels = await page.locator("#difficultyOptions strong").allTextContents();
    if (cards !== 4 || labels.join(",") !== "简单,普通,困难,地狱") throw new Error(`difficulty cards invalid: ${cards}/${labels.join(",")}`);
    if ((await page.locator("#difficultySelect").innerText()).includes("×")) throw new Error("difficulty multiplier leaked into picker");
    await page.locator('[data-difficulty="hard"]').click();
    await page.waitForFunction(() => document.getElementById("difficultySelect")?.classList.contains("hidden"), null, { timeout: 5000 });
    await page.waitForFunction(() => typeof state !== "undefined" && state === 7, null, { timeout: 10000 });
    const selected = await page.evaluate(() => ({ id: game.difficultyId, multiplier: game.difficultyMultiplier, prep: game.prepTime }));
    if (selected.id !== "hard" || selected.multiplier !== 1 || !(selected.prep > 0)) throw new Error(`selection invalid: ${JSON.stringify(selected)}`);
    if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
    console.log(JSON.stringify({ ok: true, cards, labels, selected }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

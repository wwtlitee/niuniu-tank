"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

const OUT = path.resolve(__dirname, "..", ".tmp", "ui-v635b");
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const p = path.join(OUT, name + ".png");
  await page.screenshot({ path: p });
  return p;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const server = await createStaticServer(projectRoot);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));

    // 1) 主菜单
    await page.goto(`${origin}/index.html?autotest=1`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shot(page, "01-menu");

    // 2) 设置面板
    await page.click("#settingsMenuBtn");
    await page.waitForTimeout(450);
    await shot(page, "02-settings");

    // 3) 进入生存模式 + 暂停：直接调 setPause(true) 触发（更可靠，避免 let state 不在 window 上）
    await page.goto(`${origin}/index.html?mode=survival&autotest=1`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
    await page.waitForTimeout(2500);
    const forcedState = await page.evaluate(() => {
      try { if (typeof questActive !== "undefined" && questActive) questActive = false; } catch (_) {}
      try { if (typeof questHide === "function") questHide(); } catch (_) {}
      try { if (typeof setPause === "function") setPause(true); } catch (_) {}
      return { paused: !!document.getElementById("pause").classList.contains("hidden") };
    });
    console.log("[pause-prep]", JSON.stringify(forcedState));
    await page.waitForTimeout(500);
    await shot(page, "03-pause");

    // 4) 暂停 → 设置
    await page.click("#pauseSettingsBtn");
    await page.waitForTimeout(450);
    await shot(page, "04-pause-settings");

    // 5) 关闭 → 重开确认
    await page.click("#settingsCloseBtn");
    await page.waitForTimeout(250);
    await page.click("#pauseRestartBtn");
    await page.waitForTimeout(350);
    await shot(page, "05-confirm-restart");

    console.log("OK");
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");
const { createStaticServer } = require("../tools/asset-runtime-catalog.cjs");
const { UNUSABLE_PREVIEW_ASSETS } = require("../tools/generate-asset-contact-sheets.cjs");

test("unreadable asset is explicitly quarantined and next castle sheet contains model pixels", async () => {
  assert.ok(UNUSABLE_PREVIEW_ASSETS.has("castle/bridge-straight-pillar.glb"));
  const projectRoot = path.resolve(__dirname, "..");
  const server = await createStaticServer(projectRoot);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async (src) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let y = 8; y < 200; y += 4) {
        for (let x = 8; x < canvas.width - 8; x += 4) {
          const offset = (y * canvas.width + x) * 4;
          const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
          if (Math.max(r, g, b) - Math.min(r, g, b) > 15 || Math.max(r, g, b) > 65) colored++;
        }
      }
      return { colored };
    }, `${origin}/pdoc/material/MAT_%E8%B5%84%E4%BA%A7%E8%AF%81%E4%BB%B6%E7%85%A7_02_v5.0.0.png`);
    assert.ok(result.colored > 500, `expected visible model pixels, got ${result.colored}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

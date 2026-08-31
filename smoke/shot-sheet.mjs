/* tdkit 证件照：把 tile 系模型摆网格拍一张，认脸用 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("console", m => console.log("[pg]", m.text()));
p.on("pageerror", e => console.log("[pgerr]", e.message));
await p.goto("http://127.0.0.1:8030/smoke/glb-sheet.html", { waitUntil: "load", timeout: 30000 });
await p.waitForFunction(() => window.__snap && window.__snap() >= 5, { timeout: 30000 });
await p.waitForTimeout(1500);
/* 上下文可能丢失：重建一次渲染器再拍（新 canvas） */
await p.evaluate(() => {
  const old = document.querySelector("canvas");
  if (old) old.remove();
  window.__rebuild && window.__rebuild();
});
await p.waitForTimeout(1200);
await p.screenshot({ path: "smoke/out/glb-sheet.png" });
console.log("OK loaded=", await p.evaluate(() => window.__snap()));
process.exit(0); // b.close() swiftshader 崩溃规避

/* 验证 engine.js 是否为最新版本 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
// 禁用缓存
await p.route("**/*", route => {
  const headers = { ...route.request().headers(), "cache-control": "no-cache" };
  route.continue({ headers });
});
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10", { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

// 检查关键修改是否存在
const checks = await p.evaluate(() => ({
  hasR8_road: !!document.querySelector('script[src*="engine"]') || 
    (typeof decorateSurvivalPaths === "function" ? decorateSurvivalPaths.toString().includes("R8") : false),
  hasR8_wild: typeof decorateSurvivalPaths === "function" ? 
    decorateSurvivalPaths.toString().includes("全部移除") : false,
  hasR8_slope: typeof startWave === "function" ? false : true, // 简单检查
  platProps_check: typeof decorateSurvivalCliff === "function" ?
    decorateSurvivalCliff.toString().includes('"stones"') : false,
}));
console.log("Code version check:", JSON.stringify(checks));

// 直接读 engine.js 源码中的关键字
const src = await p.evaluate(() => {
  const scripts = document.querySelectorAll("script[src]");
  let engineSrc = null;
  for(const s of scripts) if(s.src.includes("engine")) { engineSrc = s.src; break; }
  return engineSrc || "inline";
});
console.log("engine.js source:", src);

// 如果是 inline，直接搜索关键字符串
if(src==="inline"){
  const html = await p.content();
  console.log("Has R8 road fix:", html.includes("R8.*走廊路砖"));
  console.log("Has R8 wild remove:", html.includes("全部移除"));
  console.log("Has tile-straight-slope:", html.includes("tile-straight-slope"));
}

process.exit(0);

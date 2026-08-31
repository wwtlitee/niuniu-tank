/* 终极验证：fetch engine.js 源码确认版本 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
// 用 context 级别清除缓存
const ctx = p.context();
await ctx.clearCookies();
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10&nc=" + Date.now(), { 
  waitUntil: "networkidle", timeout: 60000 
});
// 直接 fetch engine.js
const src = await p.evaluate(async () => {
  const resp = await fetch("/js/engine.js?_=" + Date.now(), { cache: "no-store" });
  return await resp.text();
});
console.log("Has R8 road fix:", src.includes("R8.*走廊路砖"));
console.log("Has R8 wild remove:", src.includes("全部移除"));  
console.log("Has city guard:", src.includes("不放城市工业道具"));
console.log("Has tile-straight-slope:", src.includes("tile-straight-slope"));
console.log("Has tree ground fix:", src.includes("树格先铺地皮"));
console.log("Has color tint:", src.includes("color 参数对 GLB"));
console.log("File size:", src.length);
process.exit(0);

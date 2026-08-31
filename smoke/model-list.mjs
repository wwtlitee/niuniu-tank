/* 精确识别：哪些模型有红色纹理 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

// 列出 mapGroup 下所有 Group 的名称及其子 mesh 数
const groups = await p.evaluate(() => {
  const result = [];
  if(!mapGroup) return result;
  mapGroup.traverse(o => {
    if(o.isGroup && o.children.length > 0) {
      const meshCount = o.children.filter(c => c.isMesh).length;
      // 只报告有 mesh 子级的 Group（即放置的模型）
      if(meshCount > 0){
        result.push({ name: o.name || "(unnamed group)", childMeshes: meshCount, pos: [+o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1)] });
      }
    }
  });
  return result;
});
// 按名称分组统计
const byName = {};
groups.forEach(g => { byName[g.name] = (byName[g.name]||0) + 1; });
console.log("Model instances:", JSON.stringify(byName));
console.log("Total model groups:", groups.length);
process.exit(0);

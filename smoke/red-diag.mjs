/* 诊断红色装饰物来源 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10&_v=" + Date.now(), { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

/* 统计 mapGroup 下所有子物体的名称和颜色 */
const info = await p.evaluate(() => {
  const result = { total: 0, byName: {}, redMeshes: [] };
  if(!mapGroup) return result;
  mapGroup.traverse(o => {
    if(!o.isMesh) return;
    result.total++;
    const name = o.name || o.parent?.name || "unnamed";
    result.byName[name] = (result.byName[name]||0) + 1;
    // 检测偏红材质
    if(o.material && o.material.color) {
      const c = o.material.color;
      const r = Math.round(c.r * 255), g = Math.round(c.g * 255), bb = Math.round(c.b * 255);
      if(r > 150 && r > g * 1.3 && r > bb * 1.3) {
        result.redMeshes.push({ name, pos: [+o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1)], color: `rgb(${r},${g},${bb})` });
      }
    }
  });
  return result;
});
console.log("Total meshes:", info.total);
console.log("By name:", JSON.stringify(info.byName).slice(0,500));
console.log("Red meshes count:", info.redMeshes.length);
if(info.redMeshes.length > 0) console.log("Red samples:", JSON.stringify(info.redMeshes.slice(0,5)));

/* 也检查是否调用了 decorateSurvivalPaths 的 placeModel */
const pathSrc = await p.evaluate(() => typeof decorateSurvivalPaths === "function" ? decorateSurvivalPaths.toString().slice(0,300) : "N/A");
console.log("\ndecorateSurvivalPaths preview:", pathSrc.slice(0,200));

process.exit(0);

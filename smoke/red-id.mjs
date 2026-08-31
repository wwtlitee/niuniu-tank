/* 精确识别红色装饰物的模型名称 v2：利用 engine.js 新增的 userData.assetName 标签 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.route("**/*", route => route.continue({ headers: { ...route.request().headers(), "cache-control": "no-store", pragma: "no-cache" } }));
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10&t=" + Date.now(), { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

const info = await p.evaluate(() => {
  const results = [];
  if(!mapGroup) return results;
  const colorStr = c => c ? `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})` : null;
  // 1) 批处理实例：InstancedMesh 挂在 mapGroup 直属
  mapGroup.children.forEach(o => {
    if(o.isInstancedMesh){
      results.push({ kind:"instanced", assetName:o.userData.assetName||o.name||"(unnamed)", count:o.count||o.instanceMatrix?.count||0, hasMap:!!o.material?.map, matColor:colorStr(o.material?.color) });
    } else if(o.isGroup){
      results.push({ kind:"placed-group", assetName:o.userData.assetName||"(unnamed)", childMesh:o.children.filter(c=>c.isMesh).length });
    }
  });
  // 2) 查找所有携带 assetName 的 Group，递归
  mapGroup.traverse(o => {
    if(o.userData && o.userData.assetName){
      const found = results.find(r => r.assetName===o.userData.assetName);
      if(found){ found.count = (found.count||0)+1; }
    }
  });
  // 3) 逐 mesh 采样，报告材质颜色 + 贴图名 + 离屏上的实际可见颜色（用一组已知绿色对照）
  const redish = [];
  mapGroup.traverse(o => {
    if(!o.isMesh) return;
    const an = (o.userData && o.userData.assetName) || "";
    const parentAN = (o.parent?.userData && o.parent.userData.assetName) || "";
    const n = an || parentAN || o.name || "(none)";
    const mc = o.material?.color;
    const r = mc?.r, g = mc?.g, b2 = mc?.b;
    if(mc && (r>0.55 && r > g*1.3 && r > b2*1.3)){
      redish.push({ mesh:n, parent:o.parent?.userData?.assetName||"", matColor:colorStr(mc), hasMap:!!o.material?.map });
    }
  });
  return { nodes:results, redish };
});
console.log("=== mapGroup nodes ===");
console.log(JSON.stringify(info.nodes, null, 2));
console.log("=== reddish meshes ===");
console.log(JSON.stringify(info.redish, null, 2));
process.exit(0);

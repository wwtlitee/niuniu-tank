/* 检查树材质是否有纹理贴图，以及红色物体的真实身份 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });

await p.goto(URL, { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(1500);

const info = await p.evaluate(() => {
  const result = { trees: [], reddish: [], whiteBoxes: [] };
  scene.traverse(o => {
    if (!o.isMesh) return;
    const mat = o.material;
    if (!mat) return;
    const name = o.name || "";
    const c = mat.color;
    const hex = "#" + c.getHexString();
    const r = parseInt(hex.slice(1, 3), 16);
    const hasMap = !!(mat.map);

    // 树
    if (name.toLowerCase().includes("tree")) {
      result.trees.push({ name, color: hex, r, hasMap, mapImage: mat.map?.image ? "yes" : "no" });
    }

    // 红色候选
    if (r > 180 && !name.includes("block-grass") && !name.includes("tile-")) {
      result.reddish.push({ name, color: hex, hasMap, pos: [o.position.x.toFixed(1), o.position.y.toFixed(1), o.position.z.toFixed(1)] });
    }

    // 白色方块候选（BoxGeometry + 纯白）
    if ((o.geometry?.type === "BoxGeometry") && r > 240) {
      const g = parseInt(hex.slice(3, 5), 16), bb = parseInt(hex.slice(5, 7), 16);
      if (g > 240 && bb > 240) result.whiteBoxes.push({ name, color: hex, pos: [o.position.x.toFixed(1), o.position.y.toFixed(1), o.position.z.toFixed(1)] });
    }
  });
  return result;
});

console.log("=== 树（有纹理？）===");
info.trees.slice(0, 5).forEach(t => console.log(`  ${t.name} | ${t.color} | map=${t.hasMap} | img=${t.mapImage}`));
console.log(`  ... 共 ${info.trees.length} 个`);

console.log("\n=== 红色物体（R>180，非地面）===");
info.reddish.forEach(r => console.log(`  ${r.name} | ${r.color} | map=${r.hasMap} @ [${r.pos}]`));

console.log("\n=== 白色 BoxGeometry ===");
info.whiteBoxes.forEach(w => console.log(`  ${w.name} | ${w.color} @ [${w.pos}]`));

process.exit(0);

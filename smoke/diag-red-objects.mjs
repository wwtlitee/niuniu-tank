/* 诊断：列出场景中所有非地面/非树 mesh 的名称和颜色 */
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
  const items = [];
  scene.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const mat = o.material;
    let color = null;
    if (mat) {
      if (Array.isArray(mat)) color = mat[0]?.color?.getHexString();
      else color = mat.color?.getHexString();
    }
    /* 只收集非地面系统的物体（排除 block-grass / tile- / floor / ground 等） */
    const name = o.name || "";
    const geo = o.geometry?.type || "";
    const isGround = name.includes("block-grass") || name.includes("tile-") ||
                    name.includes("floor") || name.includes("ground") ||
                    geo === "PlaneGeometry";
    if (isGround) return;

    items.push({
      type: o.isInstancedMesh ? "inst" : "mesh",
      name: name || "(unnamed)",
      geo,
      color: color || "?",
      pos: o.position ? [o.position.x.toFixed(1), o.position.y.toFixed(1), o.position.z.toFixed(1)] : [],
    });
  });
  return items;
});

/* 按名称分组统计 */
const byName = {};
for (const it of info) {
  const k = it.name + "|" + it.geo + "|" + it.color;
  byName[k] = (byName[k] || 0) + 1;
}

console.log("=== 非地面物体清单（按 名称|几何|颜色 分组）===");
Object.entries(byName)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, c]) => console.log(`  x${c}  ${k}`));

console.log("\n=== 红色/暖色候选（R > 180）===");
const reddish = info.filter(it => {
  if (!it.color || it.color === "?") return false;
  const r = parseInt(it.color.slice(0, 2), 16);
  return r > 180;
});
reddish.forEach(it => console.log(`  ${it.name} | ${it.geo} | #${it.color} @ [${it.pos}]`));

process.exit(0);

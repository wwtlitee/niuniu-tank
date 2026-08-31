/* 彻底场景清单：所有非地面物体的名称、颜色、位置、类型 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });

await p.goto(URL, { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(1500);

const all = await p.evaluate(() => {
  const items = [];
  scene.traverse(o => {
    // 跳过非渲染对象
    if (!o.isMesh && !o.isInstancedMesh && !o.isSprite) return;

    const mat = o.material;
    let color = null, hasMap = false;
    if (mat) {
      if (Array.isArray(mat)) {
        color = "#" + mat[0]?.color?.getHexString();
        hasMap = !!mat[0]?.map;
      } else {
        color = "#" + mat.color?.getHexString();
        hasMap = !!mat.map;
      }
    }

    const name = o.name || "(unnamed)";
    const geo = o.geometry?.type || "";
    const type = o.isInstancedMesh ? "inst" : o.isSprite ? "sprite" : "mesh";

    // 排除地面系统
    const isGround = name.includes("block-grass") || name.includes("tile-") ||
      name.includes("floor") || geo === "PlaneGeometry" ||
      name.includes("ground");

    // 排除相机/灯光/辅助对象
    if (isGround || o.isCamera || o.isLight || o.type.includes("Helper") ||
        o.type.includes("Light")) return;

    items.push({
      type, name, geo, color, hasMap,
      pos: [+(o.position.x||0).toFixed(1), +(o.position.y||0).toFixed(1), +(o.position.z||0).toFixed(1)],
      visible: o.visible,
      instCount: o.isInstancedMesh ? o.count : null,
    });
  });

  // 按 (name, color) 分组统计
  const groups = {};
  for (const it of items) {
    const k = `${it.name}|${it.color}`;
    if (!groups[k]) groups[k] = { ...it, count: 0 };
    groups[k].count++;
  }

  return { total: items.length, groups: Object.values(groups).sort((a,b) => b.count - a.count), raw: items.slice(0, 30) };
});

console.log("=== 场景非地面物体：共 " + all.total + " 个 ===");
console.log("【按 名称|颜色 分组】（前 30 组）:");
all.groups.slice(0, 30).forEach(g => {
  const extra = g.instCount ? ` inst×${g.instCount}` : g.hasMap ? " +tex" : "";
  console.log(`  ×${g.count}  ${g.type.padEnd(6)} ${g.name.padEnd(28)} ${g.color || "?".padEnd(8)} ${extra}`);
});

console.log("\n【原始数据前 20 条】（含位置）:");
all.raw.forEach(r => {
  console.log(`  ${r.type.padEnd(6)} ${r.name.padEnd(28)} ${r.color || "?".padEnd(10)} @ [${r.pos}] vis=${r.visible}`);
});

process.exit(0);

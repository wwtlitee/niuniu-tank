/* P5c-R9：用玩家真实 URL（8001 GameHub）截图 + 场景诊断 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1";
const OUT = "smoke/out/";

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });

const errs = [];
p.on("console", m => { if (m.type() === "error") errs.push("[err] " + m.text()); });
p.on("pageerror", e => errs.push("[pageerror] " + e.message));
p.on("requestfailed", r => errs.push("[reqfail] " + r.url() + " :: " + (r.failure()?.errorText || "")));

await p.goto(URL, { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined", { timeout: 40000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(1500);

console.log("=== 页面错误 / 请求失败 ===");
console.log(errs.length ? errs.join("\n") : "(无)");

/* ---- 诊断 1：资产加载情况 ---- */
const diag = await p.evaluate(() => {
  const keys = Object.keys(ASSETS || {});
  const empty = keys.filter(k => !ASSETS[k]);
  const loaded = keys.filter(k => ASSETS[k]);
  /* 统计场景里的 mesh 数量与材质颜色 */
  let meshCount = 0, instCount = 0, whiteMat = 0;
  const whiteNames = new Set();
  scene.traverse(o => {
    if (o.isInstancedMesh) {
      instCount++;
      const m = o.material;
      if (m && m.color && m.color.r > 0.9 && m.color.g > 0.9 && m.color.b > 0.9) {
        whiteMat++;
        whiteNames.add(o.name || "(unnamed-inst)");
      }
    } else if (o.isMesh) {
      meshCount++;
      const m = o.material;
      if (m && m.color && m.color.r > 0.9 && m.color.g > 0.9 && m.color.b > 0.9) {
        whiteMat++;
        whiteNames.add(o.name || (o.geometry?.type || "(unnamed)"));
      }
    }
  });
  return {
    total: keys.length, loaded: loaded.length, empty,
    hasTileSlope: !!ASSETS["tile-straight-slope"],
    meshCount, instCount, whiteMat,
    whiteNames: [...whiteNames].slice(0, 25),
    state: typeof state !== "undefined" ? state : null,
    enemies: typeof enemies !== "undefined" ? enemies.length : null,
    wave: typeof wave !== "undefined" ? wave : null,
  };
});

console.log("\n=== 资产 / 场景诊断 ===");
console.log("ASSETS 总数:", diag.total, " 已加载:", diag.loaded, " 空:", diag.empty.length);
if (diag.empty.length) console.log("  空资产:", diag.empty.join(", "));
console.log("tile-straight-slope 已加载:", diag.hasTileSlope);
console.log("Mesh 数:", diag.meshCount, " InstancedMesh 数:", diag.instCount);
console.log("纯白材质对象数:", diag.whiteMat);
if (diag.whiteNames.length) console.log("  白模候选:", diag.whiteNames.join(" | "));
console.log("state:", diag.state, " enemies:", diag.enemies, " wave:", diag.wave);

/* ---- 截图：多角度 ---- */
const shots = [
  ["r9-panorama", 0, 0, 24, 34, 26],
  ["r9-plateau-top", 0, 0, 38, 28, 8],
  ["r9-cliff-side", -18, 6, 32, 14, 22],
  ["r9-close-slope", 2, 2, 36, 5, 10],
];
for (const [name, fx, fy, fz, h, back] of shots) {
  await p.evaluate(([fx, fy, fz, h, back]) => {
    camFocus.set(fx, fy, fz); camHeight = h; camBack = back;
  }, [fx, fy, fz, h, back]);
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + name + ".png" });
  console.log("shot:", name);
}

/* ---- 强制进入战斗，看敌人 ---- */
await p.evaluate(() => {
  if (typeof state !== "undefined") state = 1;
  if (typeof startWave === "function") startWave(1);
});
await p.waitForTimeout(3000);
const spawnInfo = await p.evaluate(() => ({
  state: typeof state !== "undefined" ? state : null,
  enemies: typeof enemies !== "undefined" ? enemies.length : null,
  alive: typeof enemies !== "undefined" ? enemies.filter(e => e.alive).length : null,
  toSpawn: typeof toSpawn !== "undefined" ? toSpawn : null,
}));
console.log("\n=== 刷怪 ===");
console.log(JSON.stringify(spawnInfo));

await p.evaluate(() => { camFocus.set(0, 0, 10); camHeight = 18; camBack = 20; });
await p.waitForTimeout(1200);
await p.screenshot({ path: OUT + "r9-battle.png" });
console.log("shot: r9-battle");

console.log("\n=== 后期错误 ===");
console.log(errs.length ? errs.slice(-15).join("\n") : "(无)");
process.exit(0);

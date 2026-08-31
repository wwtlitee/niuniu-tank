/* 试玩诊断：真实跑一局，dump 刷怪状态 + 多机位截图找视觉问题 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pgerr]", e.message));
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1", { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await p.keyboard.press("Escape");
await p.waitForTimeout(1500);

console.log("=== 初始状态 ===");
console.log(await p.evaluate(() => JSON.stringify({
  state, wave: game.wave, toSpawn: game.enemiesToSpawn,
  enemies: enemies.length, alive: enemies.filter(e=>e.alive).length,
  spawns: window.__spawnProbe||null
})));

/* 强制开第1波，跳过 prepTime */
await p.evaluate(() => { if(typeof startWave==="function") startWave(1); });
await p.waitForTimeout(3000);
const s1 = await p.evaluate(() => ({ wave:game.wave, toSpawn:game.enemiesToSpawn, alive:enemies.filter(e=>e.alive).length, spawnT:game.spawnTimer }));
console.log("开波+3s:", JSON.stringify(s1));

/* 再等 12s，看是否持续刷出 */
await p.waitForTimeout(12000);
const s2 = await p.evaluate(() => ({ wave:game.wave, toSpawn:game.enemiesToSpawn, alive:enemies.filter(e=>e.alive).length, total:enemies.length }));
console.log("开波+15s:", JSON.stringify(s2));

/* 敌人位置采样（看是否卡住/越界） */
const pos = await p.evaluate(() => enemies.filter(e=>e.alive).slice(0,8).map(e=>({
  x:+e.group.position.x.toFixed(1), z:+e.group.position.z.toFixed(1), hp:e.hp
})));
console.log("敌人位置:", JSON.stringify(pos));

/* 截图：全景看围栏 */
await p.evaluate(() => { camFocus.set(0,0,24); camHeight=40; camBack=30; });
await p.waitForTimeout(900);
await p.screenshot({ path: "smoke/out/t1-panorama.png" });

/* 截图：台面俯视看地皮分离 */
await p.evaluate(() => { camFocus.set(8,0,36); camHeight=26; camBack=6; });
await p.waitForTimeout(900);
await p.screenshot({ path: "smoke/out/t2-plateau.png" });

/* 截图：坡道特写 */
await p.evaluate(() => { camFocus.set(17,3,40); camHeight=8; camBack=14; });
await p.waitForTimeout(900);
await p.screenshot({ path: "smoke/out/t3-ramp.png" });

/* 截图：地图边界看围栏 */
await p.evaluate(() => { camFocus.set(0,2,2); camHeight=12; camBack=16; });
await p.waitForTimeout(900);
await p.screenshot({ path: "smoke/out/t4-border.png" });

console.log("done");
process.exit(0);

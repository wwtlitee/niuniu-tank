/* R8 综合验证：围栏/红装饰/树地皮/斜坡 修复后截图 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pgerr]", e.message));
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10", { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

/* 跳引导 + 强制开波 */
await p.evaluate(() => {
  questSkip();
  game.prepTime = 0;
  state = STATE.PLAYING;
  startWave(1);
});
await p.waitForTimeout(3000);

const shots = [
  ["r8-panorama", () => { camFocus.set(0,0,24); camHeight=38; camBack=28; }],
  ["r8-plateau",  () => { camFocus.set(8,0,36); camHeight=24; camBack=6; }],
  ["r8-ramp",     () => { camFocus.set(17,3,40); camHeight=10; camBack=14; }],
  ["r8-border",   () => { camFocus.set(0,2,2);  camHeight=14; camBack=18; }],
  ["r8-trees",    () => { camFocus.set(20,0,15);camHeight=16; camBack=16; }],
  ["r8-combat",   () => { camFocus.set(8,2,30); camHeight=18; camBack=18; }],
];

for(const [name, setCam] of shots){
  await p.evaluate(setCam);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `smoke/out/${name}.png` });
}

// dump 状态
console.log(await p.evaluate(()=>({
  state,wave:game.wave,toSpawn:game.enemiesToSpawn,
  alive:enemies.filter(e=>e.alive).length
})));

console.log("R8 verify done");
process.exit(0);

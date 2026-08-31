/* 刷怪实测：ff=10 倍速，跳过引导，等 PREP→PLAYING 转换，观察刷怪 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pgerr]", e.message));
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10", { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

/* 跳过新手引导 */
await p.evaluate(() => { if(typeof questSkip==="function")questSkip(); });
await p.waitForTimeout(200);

/* dump 初始 */
console.log("初始:", await p.evaluate(() => ({state, wave:game.wave, prepT:game.prepTime, toSpawn:game.enemiesToSpawn})));

/* 等 PREP 结束（30s / ff=10 ≈ 3s 实际）+ 额外 5s 看刷怪 */
for(let i=0;i<8;i++){
  await p.waitForTimeout(1000);
  const s=await p.evaluate(()=>({state, wave:game.wave, prepT:+game.prepTime.toFixed(1), toSpawn:game.enemiesToSpawn, alive:enemies.filter(e=>e.alive).length}));
  console.log(`t=${(i+1)}s:`, JSON.stringify(s));
}

/* 最终截图看敌人 */
await p.evaluate(()=>{camFocus.set(8,2,36);camHeight=18;camBack=12;});
await p.waitForTimeout(800);
await p.screenshot({path:"smoke/out/spawn-test.png"});

console.log("done");
process.exit(0);

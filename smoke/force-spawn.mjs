/* 快速验证：强制 state=PLAYING + startWave，看是否刷出敌人 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pgerr]", e.message));
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10", { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

/* 直接强制进入 PLAYING + 开波 */
await p.evaluate(() => {
  questSkip(); // 跳引导
  game.prepTime = 0;
  state = STATE.PLAYING;
  if(typeof startWave==="function")startWave(1);
});
console.log("强制后:", await p.evaluate(()=>({state,wave:game.wave,toSpawn:game.enemiesToSpawn})));

/* 等 20s 游戏时间（ff=10 下约 2s 实际）*/
for(let i=0;i<25;i++){
  await p.waitForTimeout(800);
  const s=await p.evaluate(()=>({state,toSpawn:game.enemiesToSpawn,alive:enemies.filter(e=>e.alive).length,total:enemies.length}));
  if(s.alive>0||i%5===0)console.log(`t=${i*0.8}s:`,JSON.stringify(s));
}

/* 截图 */
await p.evaluate(()=>{camFocus.set(8,2,36);camHeight=18;camBack=12;});
await p.waitForTimeout(800);
await p.screenshot({path:"smoke/out/spawn-force.png"});
console.log("done");
process.exit(0);

/* R8 最终验证：全部修复后截图 */
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pgerr]", e.message));
// 强制不缓存
await p.route("**/*", route => {
  route.continue({ headers: { ...route.request().headers(), "cache-control": "no-cache", "pragma": "no-cache" } });
});
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&ff=10&_v=" + Date.now(), { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

await p.evaluate(() => { questSkip(); game.prepTime=0; state=STATE.PLAYING; startWave(1); });
await p.waitForTimeout(4000);

// 检查红色 mesh 数量
const redCount = await p.evaluate(() => {
  let n=0; if(mapGroup) mapGroup.traverse(o=>{ if(o.isMesh&&o.material?.color){ const c=o.material.color; if(c.r>0.6&&c.r>c.g*1.2&&c.r>c.b*1.2)n++; }});
  return n;
});
console.log("Red meshes:", redCount);

const shots = [
  ["final-panorama", () => { camFocus.set(0,0,24); camHeight=38; camBack=28; }],
  ["final-plateau",  () => { camFocus.set(8,0,36); camHeight=24; camBack=6; }],
  ["final-ramp",     () => { camFocus.set(17,3,40); camHeight=10; camBack=14; }],
  ["final-border",   () => { camFocus.set(0,2,2);  camHeight=14; camBack=18; }],
  ["final-trees",    () => { camFocus.set(20,0,15);camHeight=16; camBack=16; }],
  ["final-combat",   () => { camFocus.set(8,2,30); camHeight=18; camBack=18; }],
];
for(const [name, setCam] of shots){
  await p.evaluate(setCam);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `smoke/out/${name}.png` });
}

console.log("Final verify done, redCount=", redCount);
process.exit(0);

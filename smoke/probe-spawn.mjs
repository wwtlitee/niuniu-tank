/* 最小验证：强制开战，不建造，看刷怪/wave 推进是否正常 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1&ff=8";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pgerr]", e.message));
p.on("console", m => { if (m.type()==="error") console.log("[err]", m.text()); });

await p.goto(URL, { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
console.log("[probe] PREP 达成，检查全局 API");
const apis = await p.evaluate(() => ({
  hasSelectBuild: typeof selectBuild === "function",
  hasTryPlace: typeof tryPlace === "function",
  hasShopList: typeof shopList === "function",
  hasPriceOf: typeof priceOf === "function",
  hasCellCenter: typeof cellCenter === "function",
  hasSkipPrep: typeof skipPrep === "function",
  shopLen: (typeof shopList==="function")?shopList().length:-1,
  STATE_P: STATE.PREP, STATE_PLAY: STATE.PLAYING,
}));
console.log("[probe] API:", JSON.stringify(apis));

// 强制开战
await p.evaluate(() => { state = STATE.PLAYING; startWave(1); });

for (let i = 0; i < 20; i++) {
  await p.waitForTimeout(1500);
  const s = await p.evaluate(() => ({
    wave: game.wave, alive: enemies.filter(e=>e.alive).length,
    toSpawn: game.enemiesToSpawn, gate: game.gateHp, over: state===STATE.OVER,
    spawnTimer: game.spawnTimer,
  }));
  console.log(`[probe] t=${(i*1.5).toFixed(1)}s wave=${s.wave} alive=${s.alive} toSpawn=${s.toSpawn} gate=${s.gate?.toFixed(0)} spawnT=${s.spawnTimer?.toFixed(2)} over=${s.over}`);
  if (s.over) { console.log("[probe] 阵亡"); break; }
}
process.exit(0);

/* 自动机器人 v2：生存模式 —— 经济+炮塔防线，玩家坦克自动锁敌开火，跑波次记录进度 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1&ff=8";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pgerr]", e.message));

await p.goto(URL, { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
console.log("[bot] PREP 达成，注入机器人");

await p.evaluate(() => {
  window.__bot = {
    placed: new Set(),
    goldMines: 0,
    buildTick() {
      try {
        if (state !== STATE.PLAYING && state !== STATE.PREP && state !== STATE.BUILD) return;
        const list = shopList();
        const idxOf = id => list.findIndex(x => x.id === id);
        const gold = game.gold;
        // 1) 经济：铺到 5 座金矿
        if (this.goldMines < 5) {
          const mines = [[10,31],[11,31],[10,32],[11,32],[12,32]];
          const c = mines[this.goldMines];
          if (c) {
            const i = idxOf("goldmine");
            if (i >= 0) { selectBuild(i); const cc = cellCenter(c[0], c[1]); tryPlace(cc.x, cc.z); }
            this.goldMines++;
          }
        }
        // 2) 坡口西侧布塔（近→远）
        const cells = [
          [16,36],[16,35],[16,37],[15,36],[15,35],[15,37],
          [14,36],[14,35],[14,37],[13,36],[13,35],[13,37],
          [12,36],[12,35],[12,37],[11,36],[11,35],[11,37],[10,36],[10,35],[10,37],
        ];
        for (const c of cells) {
          const key = c[0] + "," + c[1];
          if (this.placed.has(key)) continue;
          const order = ["sniper", "cannon", "mg"];
          let done = false;
          for (const tid of order) {
            const i = idxOf(tid);
            if (i < 0) continue;
            if (gold >= priceOf(list[i])) {
              selectBuild(i); const cc = cellCenter(c[0], c[1]); tryPlace(cc.x, cc.z);
              this.placed.add(key); done = true; break;
            }
          }
          if (done) break;
        }
        // 3) 玩家坦克锁最近敌人开火
        if (player && player.alive && enemies.length) {
          let best = null, bd = 1e9;
          for (const e of enemies) {
            if (!e.alive) continue;
            const d = player.group.position.distanceTo(e.group.position);
            if (d < bd) { bd = d; best = e; }
          }
          if (best) player.attackTarget = best;
        }
      } catch (err) { /* 忽略单次建造异常 */ }
    }
  };
  if (window.__botTick) clearInterval(window.__botTick);
  window.__botTick = setInterval(() => window.__bot.buildTick(), 300);
});

let lastWave = 0, dead = false, victory = false, lastGate = 600;
const t0 = Date.now();
while (Date.now() - t0 < 200000) {
  await p.waitForTimeout(2000);
  const s = await p.evaluate(() => ({
    state, wave: game.wave, gate: game.gateHp, gateMax: game.gateMaxHp,
    gold: game.gold, alive: enemies.filter(e => e.alive).length,
    toSpawn: game.enemiesToSpawn, over: state === STATE.OVER,
    towers: builtTurrets.length, mines: goldMines.length,
  }));
  if (s.wave !== lastWave) {
    lastWave = s.wave;
    console.log(`[bot] 波次=${s.wave} 大门=${s.gate?.toFixed(0)}/${s.gateMax} 塔=${s.towers} 矿=${s.mines} 金币=${s.gold?.toFixed(0)} 在场敌=${s.alive} 余敌=${s.toSpawn}`);
  }
  if (Date.now() - t0 < 40000 && s.wave === 1) {
    const dbg = await p.evaluate(() => ({ st: state, spawnT: +game.spawnTimer?.toFixed(2), toSpawn: game.enemiesToSpawn, alive: enemies.filter(e=>e.alive).length, prep: game.prepTime?.toFixed(1) }));
    console.log(`[dbg] st=${dbg.st} prep=${dbg.prep} spawnT=${dbg.spawnT} toSpawn=${dbg.toSpawn} alive=${dbg.alive}`);
  }
  lastGate = Math.max(lastGate, s.gate || 0);
  if (s.over) { dead = true; console.log(`[bot] ★阵亡 @波次 ${s.wave} 大门=${s.gate?.toFixed(0)}`); break; }
  const settled = await p.evaluate(() => {
    const el = document.querySelector("#settle");
    return el && !el.classList.contains("hidden");
  });
  if (settled) { victory = true; console.log(`[bot] ★胜利结算 @波次 ${s.wave}`); break; }
}
const final = await p.evaluate(() => ({ state, wave: game.wave, gate: game.gateHp, gateMax: game.gateMaxHp, over: state === STATE.OVER, score: game.score, towers: builtTurrets.length }));
console.log("[bot] 最终:", JSON.stringify(final));
console.log("[bot] 结论:", victory ? "通关(到达15波结算)" : dead ? "未通关-阵亡" : "未决(超时)");
process.exit(0);

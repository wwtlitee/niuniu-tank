/* 深度诊断：敌人为什么不被击杀。检查炮塔射程内是否有敌人、敌人位置 vs 坡道路径、子弹是否发射 */
import { chromium } from "playwright";

const URL = "http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1&ff=8";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pgerr]", e.message));

await p.goto(URL, { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });

await p.evaluate(() => { state = STATE.PLAYING; startWave(1); });

for (let i = 0; i < 10; i++) {
  await p.waitForTimeout(2000);
  const s = await p.evaluate(() => {
    const TILES = TILE;
    const alive = enemies.filter(e => e.alive).map(e => ({
      x: +e.group.position.x.toFixed(1), z: +e.group.position.z.toFixed(1),
      cell: cellOf(e.group.position.x, e.group.position.z),
      dir: e.dir, hp: e.hp, slow: e.slowMult || 1,
    }));
    // 每个塔到最近敌人的距离
    const tDists = builtTurrets.map(t => {
      let bd = 1e9;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = t.group.position.distanceTo(e.group.position);
        if (d < bd) bd = d;
      }
      return { kind: t.kind, range: +(t.range / TILE).toFixed(1), nearest: +(bd / TILE).toFixed(1), cd: +t.cd.toFixed(2) };
    });
    return {
      wave: game.wave, aliveN: alive.length, toSpawn: game.enemiesToSpawn,
      gate: game.gateHp, sample: alive.slice(0, 3), tDists: tDists.slice(0, 6),
      bullets: bullets.length,
    };
  });
  console.log(`--- t=${(i * 2).toFixed(0)}s alive=${s.aliveN} toSpawn=${s.toSpawn} gate=${s.gate} bullets=${s.bullets}`);
  if (s.sample.length) console.log("  敌例:", JSON.stringify(s.sample));
  if (s.tDists.length) console.log("  塔距:", JSON.stringify(s.tDists));
  if (s.aliveN === 0 && s.toSpawn <= 0) { console.log("  ★ 第1波清空"); break; }
}
process.exit(0);

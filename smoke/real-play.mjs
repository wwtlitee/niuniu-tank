/* 真实用户流程实测：不加 autotest/ff，点菜单卡进生存，验证能否开局+操控 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "E:/GameHub/games/tank3d/smoke/out";
mkdirSync(OUT, { recursive: true });
const URL = process.argv[2] || "http://127.0.0.1:8030/";
const log = (...a) => console.log("[real]", ...a);

const consoleMsgs = [];
const pageErrs = [];
const failedReq = [];

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on("console", m => { const t = m.text(); if (/error|fail|warn|异常|失败|缺失/i.test(t) || m.type() === "error") consoleMsgs.push(`[${m.type()}] ${t}`); });
page.on("pageerror", e => pageErrs.push(String(e?.stack || e)));
page.on("requestfailed", r => failedReq.push(`${r.url()} :: ${r.failure()?.errorText}`));
page.on("response", r => { if (r.status() >= 400) failedReq.push(`HTTP ${r.status()} ${r.url()}`); });

log("goto", URL);
await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2000);

// 素材进度
const prog = await page.evaluate(() => (typeof assetsProgress === "function" ? assetsProgress() : "n/a"));
log("assetsProgress @2s:", JSON.stringify(prog));

// 点生存卡（第二张）
const cards = await page.$$(".modeCard");
log("modeCard 数量:", cards.length);
await page.evaluate(() => {
  const cs = [...document.querySelectorAll(".modeCard")];
  const surv = cs.find(c => c.textContent.includes("生存") || c.textContent.includes("高台"));
  if (surv) surv.click();
});
await page.waitForTimeout(1500);

// 等待进入 PREP(7) 或 PLAYING(1)
let reached = null;
for (let i = 0; i < 30; i++) {
  const s = await page.evaluate(() => ({ state: typeof state !== "undefined" ? state : -999, ready: typeof assetsReady === "function" ? assetsReady() : null, prog: typeof assetsProgress === "function" ? assetsProgress() : null }));
  if (s.state === 7 || s.state === 1) { reached = s; break; }
  if (i % 5 === 0) log(`  等待中 state=${s.state} ready=${s.ready} prog=${JSON.stringify(s.prog)}`);
  await page.waitForTimeout(1000);
}
log("进入状态:", JSON.stringify(reached));
await page.screenshot({ path: `${OUT}/real-1-started.png` });

// 尝试操控玩家坦克
const pos0 = await page.evaluate(() => (typeof player !== "undefined" && player && player.group) ? { x: +player.group.position.x.toFixed(2), z: +player.group.position.z.toFixed(2) } : null);
await page.mouse.move(640, 400);
await page.keyboard.down("KeyW");
await page.waitForTimeout(1500);
await page.keyboard.up("KeyW");
const pos1 = await page.evaluate(() => (typeof player !== "undefined" && player && player.group) ? { x: +player.group.position.x.toFixed(2), z: +player.group.position.z.toFixed(2) } : null);
const moved = pos0 && pos1 && (Math.abs(pos0.x - pos1.x) > 0.3 || Math.abs(pos0.z - pos1.z) > 0.3);
log("玩家位置 before:", JSON.stringify(pos0), "after:", JSON.stringify(pos1), moved ? "可移动✅" : "无法移动❌");

// 检查 HUD 是否显示、prep 倒计时
const hud = await page.evaluate(() => {
  const h = document.getElementById("hud");
  const pb = document.getElementById("prepBar");
  return { hudHidden: h ? h.classList.contains("hidden") : "no-hud", prepText: pb ? pb.textContent : "none", prepDisplay: pb ? getComputedStyle(pb).display : "none" };
});
log("HUD:", JSON.stringify(hud));
await page.screenshot({ path: `${OUT}/real-2-after-move.png` });

log("———————————————");
log("pageErrs:", pageErrs.length);
pageErrs.slice(0, 10).forEach(e => log("  PAGEERR:", e.split("\n").slice(0, 3).join(" | ")));
log("failedReq:", failedReq.length);
[...new Set(failedReq)].slice(0, 30).forEach(e => log("  REQ:", e));
log("console 关键信息:", consoleMsgs.length);
[...new Set(consoleMsgs)].slice(0, 30).forEach(e => log("  ", e));

await browser.close();

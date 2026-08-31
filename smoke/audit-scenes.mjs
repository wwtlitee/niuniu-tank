/* 三场景（建造 / 战斗 / 通关）真实截图 + 像素级色彩健康度审计。
   自带独立静态服务器（端口 8040，脚本退出自动关闭），不碰 8001(牛牛游戏厅) / 8030(在用)。
   审计维度：色相分布、亮度分布、白模嫌疑(高亮低饱和)、黑剪影(极暗)、量化唯一色数。 */
import http from "http";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = path.resolve(".");
const PORT = 8040;
const OUT = path.join(ROOT, "smoke", "out");
const STAMP = new Date().toISOString().slice(11, 19).replace(/:/g, "");
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".glb": "model/gltf-binary", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".json": "application/json",
  ".svg": "image/svg+xml", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end("404"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));
console.log(`[serve] http://127.0.0.1:${PORT} ready`);

const watchdog = setTimeout(() => { console.log("!! WATCHDOG TIMEOUT"); process.exit(2); }, 300000);

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", e => errs.push("PAGEERROR: " + e.message));
p.on("console", m => { if (m.type() === "error") errs.push("CONSOLE: " + m.text().slice(0, 160)); });

/* ---------- 像素审计（在页面内跑 canvas） ---------- */
const AUDIT = async (data) => {
  const img = new Image();
  img.src = "data:image/png;base64," + data;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { width: w, height: h, data: px } = ctx.getImageData(0, 0, img.width, img.height);
  const hue = new Array(12).fill(0);
  const lumHist = new Array(8).fill(0);
  let lumSum = 0, white = 0, dark = 0, total = 0;
  const colors = new Set();
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], bl = px[i + 2];
      total++;
      const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
      const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
      lumSum += lum;
      lumHist[Math.min(7, Math.floor(lum / 32))]++;
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (lum > 200 && sat < 0.12) white++;
      if (lum < 26) dark++;
      if (sat > 0.15 && mx > 40) {
        const d = mx - mn;
        let hh;
        if (mx === r) hh = ((g - bl) / d + 6) % 6;
        else if (mx === g) hh = (bl - r) / d + 2;
        else hh = (r - g) / d + 4;
        hue[Math.min(11, Math.floor(hh * 60 / 30))]++;
      }
      colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (bl >> 3));
    }
  }
  return { w, h, total, hue, lumAvg: lumSum / total, lumHist, whiteFrac: white / total, darkFrac: dark / total, uniq: colors.size };
};

const shots = [];
async function snap(name, note) {
  const f = `${name}-${STAMP}.png`;
  await p.screenshot({ path: path.join(OUT, f) });
  const b64 = fs.readFileSync(path.join(OUT, f)).toString("base64");
  const a = await p.evaluate(AUDIT, b64);
  shots.push({ f, note, ...a });
  return a;
}

const HUE_NAMES = ["红", "橙", "黄", "黄绿", "绿", "青绿", "青", "天蓝", "蓝", "紫", "品红", "粉红"];
function fmtHue(hue, total) {
  const idx = hue.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).slice(0, 5)
    .filter(([v]) => v / total > 0.01);
  return idx.map(([v, i]) => `${HUE_NAMES[i]}${(v / total * 100).toFixed(1)}%`).join(" ");
}

/* ---------- 场景 A：建造 ---------- */
console.log("\n=== 场景 A 建造 ===");
await p.goto(`http://127.0.0.1:${PORT}/?mode=survival&autotest=1&t=${Date.now()}`, { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 90000 });
console.log("assets ready");
await p.waitForFunction(() => typeof state !== "undefined" && (state === 7 || state === 5), { timeout: 60000 });
await p.waitForTimeout(1500);

const preState = await p.evaluate(() => ({ state, gold: game.gold, wave: game.wave }));
console.log("PREP/BUILD:", JSON.stringify(preState));

await snap("A1-build-overview", "建造-全景(默认机位)");
await p.keyboard.press("KeyB");
await p.waitForTimeout(900);
await snap("A2-build-panel", "建造-B键建造面板");
await p.evaluate(() => { try { camFocus.set(cellCenter(9, 36).x, 0, cellCenter(9, 36).z); camHeight = 26; } catch (e) {} });
await p.waitForTimeout(700);
await snap("A3-build-near", "建造-近景(台面/坡道)");

/* ---------- 场景 B：战斗 ---------- */
console.log("\n=== 场景 B 战斗 ===");
await p.keyboard.press("Escape");
/* PREP 倒计时慢，直接驱动开波：切 PLAYING + startWave(1) */
await p.evaluate(() => { try { state = STATE.PLAYING; startWave(1); } catch (e) { console.log("startWave err " + e.message); } });
await p.waitForTimeout(15000); /* 真实时钟推进，敌人 spawn + 逼近 */
const cstat = await p.evaluate(() => ({ state, wave: game.wave, enemies: enemies.length, score: game.score, toSpawn: game.enemiesToSpawn }));
console.log("combat:", JSON.stringify(cstat));
await snap("B1-combat-overview", "战斗-全景(敌人逼近)");
await p.evaluate(() => { try { camFocus.set(cellCenter(14, 36).x, 0, cellCenter(14, 36).z); camHeight = 24; } catch (e) {} });
await p.waitForTimeout(900);
await snap("B2-combat-near", "战斗-近景(敌人/塔)");
await p.evaluate(() => { try { camFocus.set(cellCenter(18, 36).x, 0, cellCenter(18, 36).z); camHeight = 30; } catch (e) {} });
await p.waitForTimeout(900);
await snap("B3-combat-ramp", "战斗-坡道机位");

/* ---------- 场景 C：通关 ---------- */
console.log("\n=== 场景 C 通关 ===");
/* C1 胜利结算：清场第 15 波 → showSettle() */
await p.evaluate(() => {
  try {
    game.wave = ACTIVE_MODE.victoryWave;
    enemies.forEach(e => { try { scene.remove(e.group); } catch (x) {} });
    enemies.length = 0;
    game.enemiesToSpawn = 0;
    state = STATE.PLAYING;
    waveCleared();
  } catch (e) { console.log("settle err " + e.message); }
});
await p.waitForTimeout(1600);
await snap("C1-victory", "通关-胜利结算");
/* C2 失败画面：关掉结算弹窗后干净触发 gameover */
await p.evaluate(() => {
  try {
    const s = document.getElementById("settle"); if (s) s.classList.add("hidden");
    endGame(false, true);
  } catch (e) { console.log("defeat err " + e.message); }
});
await p.waitForTimeout(1600);
await snap("C2-defeat", "通关-失败画面");

/* ---------- 汇总 ---------- */
console.log("\n========== 像素审计汇总 ==========");
for (const s of shots) {
  console.log(`\n■ ${s.f}  [${s.note}]  ${s.w}x${s.h}`);
  console.log(`  亮度均值=${s.lumAvg.toFixed(1)}  唯一色=${s.uniq}  白模嫌疑=${(s.whiteFrac * 100).toFixed(2)}%  黑剪影=${(s.darkFrac * 100).toFixed(2)}%`);
  console.log(`  主色相: ${fmtHue(s.hue, s.total)}`);
  const lh = s.lumHist.map(v => (v / s.total * 100).toFixed(0)).join("/");
  console.log(`  亮度分布(暗→亮 8档): ${lh}`);
}
console.log(`\n=== 错误 (${errs.length}) ===`);
const uniqErr = [...new Set(errs)];
uniqErr.slice(0, 12).forEach(e => console.log("  " + e));

fs.writeFileSync(path.join(OUT, `audit-scenes-${STAMP}.json`), JSON.stringify({ stamp: STAMP, shots, errors: uniqErr }, null, 2));
console.log(`\nJSON -> smoke/out/audit-scenes-${STAMP}.json`);

clearTimeout(watchdog);
await b.close();
server.close();
process.exit(0);

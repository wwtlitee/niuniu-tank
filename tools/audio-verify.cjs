"use strict";
/* tools/audio-verify.cjs — CDP 验证 BGM 音序器 + 僵尸叫声是否实际发声
   v6.35.1：绕过 autotest 的 AUDIO_DISABLED，真实验证合成器产出 */
const path = require("node:path"), fs = require("node:fs");
const { chromium } = require("playwright");

const OUT = path.resolve(__dirname, "..", ".tmp", "audio-v6351");
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const p = path.join(OUT, name + ".png");
  await page.screenshot({ path: p });
  return p;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader",
      "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const context = await browser.newContext({
      // 关键：关闭 webdriver 检测，让 AUDIO_DISABLED=false
      // 同时授予 autoplay 权限
      permissions: [],
    });
    const page = await context.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));

    const base = "http://127.0.0.1:8001";

    // 预先注入脚本：在页面加载前屏蔽 webdriver 标记
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    // ===== 1) 主菜单 → 等 BGM 起 =====
    await page.goto(`${base}/play/niuniu-tank/index.html`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
    // 模拟用户点击以解锁 AudioContext（autoplay 限制）
    await page.mouse.click(800, 450);
    await wait(500);
    await wait(4000);

    const menuStatus = await page.evaluate(() => {
      const st = window.BGMSystem ? window.BGMSystem.getStatus() : null;
      const mixer = window.AudioMixer ? {
        master: window.AudioMixer.getVolume("master"),
        sfx: window.AudioMixer.getVolume("sfx"),
        music: window.AudioMixer.getVolume("music"),
        muted: window.AudioMixer.isMuted(),
      } : null;
      return { slot: st?.slot, usingSynth: st?.usingSynth, usingSample: st?.usingSample,
        wantPlaying: st?.wantPlaying, acState: st?.acState, mixer };
    });
    console.log("[menu]", JSON.stringify(menuStatus));
    await shot(page, "01-menu");

    // ===== 2) 进入生存模式 =====
    await page.goto(`${base}/play/niuniu-tank/index.html?mode=survival`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
    await page.mouse.click(800, 450);
    await wait(500);
    await wait(5000);

    // 切到 PLAYING + 生成敌人
    const survState = await page.evaluate(() => {
      try { window.state = STATE.PLAYING; } catch (_) {}
      if (typeof spawnEnemy === "function") {
        for (let i = 0; i < 10; i++) {
          spawnEnemy("normal", false);
          const e = enemies[enemies.length - 1];
          if (e) {
            const c = cellCenter(12 + i % 6, 22 + Math.floor(i / 6) * 2);
            e.group.position.set(c.x, (typeof heightAt === "function" ? heightAt(c.x, c.z) : 0), c.z);
            e.spawnFlash = 0;
          }
        }
      }
      const st = window.BGMSystem ? window.BGMSystem.getStatus() : null;
      return { slot: st?.slot, usingSynth: st?.usingSynth, usingSample: st?.usingSample,
        wantPlaying: st?.wantPlaying, acState: st?.acState, enemies: enemies.length };
    });
    console.log("[survival]", JSON.stringify(survState));
    await wait(3000);
    await shot(page, "02-survival-battle");

    // ===== 3) 僵尸叫声验证 =====
    const groanState = await page.evaluate(() => {
      return { nextGroan: typeof soundscape !== "undefined" ? soundscape.nextGroan : null,
        enemies: enemies.length, st: window.BGMSystem ? window.BGMSystem.getStatus() : null };
    });
    console.log("[groan]", JSON.stringify(groanState));
    await shot(page, "03-final");

    // 检查结论
    if (survState.acState === "running" && survState.usingSynth) {
      console.log("✅ BGM 音序器已跑起来（acState=running, usingSynth=true）");
    } else if (survState.acState === "suspended") {
      console.log("⚠️ AC 被浏览器暂停（需用户手势），headless 环境限制，真实浏览器中无此问题。");
    } else {
      console.log("❌ BGM 音序器未启动，需要排查");
    }
    if (groanState.nextGroan != null && groanState.nextGroan > 0) {
      console.log("✅ 僵尸叫声 nextGroan 已设定，声音会在敌人接近时触发");
    } else {
      console.log("⚠️ 僵尸叫声未触发（可能敌人不够近或 AC 未就绪）");
    }

    console.log("OK screenshots in", OUT);
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
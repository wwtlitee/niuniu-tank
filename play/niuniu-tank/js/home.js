/* =====================================================================
   js/home.js —— 主菜单 / 模式选择
   依赖 config.js（GAME_MODES / setActiveMode）与 engine.js（applyModeConfig、
   resetGame、genMap、playIntro 等全局函数）
   ===================================================================== */
"use strict";

const MODE_CARDS = [
  {
    key: "classic",
    ...GAME_MODES.classic,
    desc: "经典巷战防守：守护鹰旗，一波波击退敌军，每波肃清后三选一强化。小地图、高密度掩体，回归纯粹的坦克肉鸽。",
    features: ["31 格经典小地图", "无构筑 · 纯三选一强化", "五型敌军 + 精英词缀", "BOSS 每 5 波来袭"],
    state: "ready",
  },
  {
    key: "survival",
    ...GAME_MODES.survival,
    desc: "高台生存：单点咽喉 + 金矿每秒产金 + 科技树投资。30 秒发育期布局，撑过 15 波击杀最终 Boss，可选择【胜利】收官或【无尽】继续滚雪球。",
    features: ["47 格高台 + 单坡口", "金矿每秒产金 · 6 级升级", "7 分支科技树 · 即时生效", "15 波胜利 · 无尽分支"],
    state: "ready",
  },
  {
    key: "td",
    ...GAME_MODES.td,
    desc: "固定路径刷怪，沿途布置塔防炮台与坦克火力位，规划你的死亡走廊。",
    features: ["固定进攻路线", "多种防御塔", "坦克位升级", "规划式塔防"],
    state: "soon",
  },
];

function hexToRgba(hex, a) {
  const v = hex.replace("#", "");
  const n = parseInt(v, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function buildHome() {
  const wrap = document.getElementById("modeCards");
  if (!wrap) return;
  wrap.innerHTML = "";
  MODE_CARDS.forEach(m => {
    const card = document.createElement("div");
    card.className = "modeCard" + (m.state === "soon" ? " soon" : "");
    card.style.setProperty("--mc", m.color);
    card.style.setProperty("--mcGlow", hexToRgba(m.color, 0.18));
    const feats = m.features.map(f => `<li>${f}</li>`).join("");
    card.innerHTML = `
      <div class="mcIcon">${m.icon}</div>
      <div class="mcName">${m.name}</div>
      <div class="mcTag">${m.tagline}</div>
      <ul class="mcFeats">${feats}</ul>
      ${m.state === "soon"
        ? `<div class="mcBtn soonBtn">即将上线</div>`
        : `<div class="mcBtn">进入战场 →</div>`}
    `;
    card.addEventListener("click", () => {
      if (m.state === "soon") {
        const b = card.querySelector(".mcBtn");
        b.textContent = "开发中，敬请期待";
        b.classList.add("shake");
        setTimeout(() => { b.textContent = "即将上线"; b.classList.remove("shake"); }, 1200);
        return;
      }
      enterMode(m.key);
    });
    wrap.appendChild(card);
  });
}

function enterMode(key) {
  const m = setActiveMode(key);
  applyModeConfig(m);
  /* 经典/塔防无金币系统：隐藏 HUD 金币行 */
  const goldRow = document.getElementById("goldRow");
  if (goldRow) goldRow.style.display = m.buildEnabled ? "" : "none";
  audio();
  playIntro();
  document.getElementById("menu").classList.add("hidden");
  /* 模型未就绪时先等加载完成再开局，避免整局灰盒 */
  if (!assetsReady()) {
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;" +
      "justify-content:center;background:rgba(6,8,18,.82);color:#cfe6ff;" +
      "font-size:20px;letter-spacing:2px";
    document.body.appendChild(el);
    const tick = setInterval(() => {
      if (assetsReady()) {
        clearInterval(tick);
        el.remove();
        resetGame();
        return;
      }
      const [d, t] = assetsProgress();
      el.textContent = `⚔️ 战场素材加载中… ${d}/${t}`;
    }, 100);
    return;
  }
  resetGame();
}

/* 返回主菜单（游戏结束/暂停时） */
function backToMenu() {
  /* 清空场上实体，回到菜单背景 */
  [...enemies].forEach(e => { scene.remove(e.group); if (e.beam) scene.remove(e.beam); });
  enemies.length = 0;
  [...bullets].forEach(b => scene.remove(b.mesh)); bullets.length = 0;
  [...particles].forEach(p => scene.remove(p.mesh)); particles.length = 0;
  [...powerups].forEach(p => scene.remove(p.group)); powerups.length = 0;
  builtTurrets.forEach(t => scene.remove(t.group)); builtTurrets.length = 0;
  builtMines.forEach(m => scene.remove(m.group)); builtMines.length = 0;

  ["gameover", "pause", "upgrade", "build"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById("hud").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
  state = STATE.MENU;
  genMap(1);
  camera.position.set(0, 52, 38);
  camera.lookAt(0, 0, 0);
}

/* 绑定游戏内按钮（engine 只绑了 restart/resume，这里补返回菜单） */
function bindHome() {
  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn) menuBtn.addEventListener("click", backToMenu);
  const pauseMenuBtn = document.getElementById("pauseMenuBtn");
  if (pauseMenuBtn) pauseMenuBtn.addEventListener("click", backToMenu);
}

/* 给菜单 SVG 背景加随机闪烁的战场光点/火花 */
function buildMenuBackground() {
  const svg = document.querySelector(".menuBg");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg";
  // 清空旧光点（避免重复调用时累积）
  svg.querySelectorAll(".menuStar").forEach(el => el.remove());
  for (let i = 0; i < 45; i++) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("class", "menuStar");
    c.setAttribute("cx", Math.random() * 1920);
    c.setAttribute("cy", Math.random() * 1080);
    c.setAttribute("r", Math.random() * 1.4 + .4);
    c.setAttribute("fill", Math.random() > .65 ? "#ffd75e" : "#7ec8ff");
    c.setAttribute("opacity", Math.random() * .35 + .08);
    c.style.animation = `twinkle ${2 + Math.random() * 3}s ease-in-out infinite alternate`;
    c.style.animationDelay = `${Math.random() * 4}s`;
    svg.appendChild(c);
  }
}

/* 脚本位于 body 末尾，DOM 已就绪，直接初始化 */
buildHome();
buildMenuBackground();
bindHome();

/* 兼容 ?mode=xxx&autotest=1 调试入口 */
(function () {
  const q = new URLSearchParams(location.search);
  const mode = q.get("mode");
  if (mode && GAME_MODES[mode]) {
    setTimeout(() => {
      buildHome();
      enterMode(mode);
    }, 500);
  }
})();

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
    desc: "经典坦克大战融合肉鸽：你开坦克打坦克，砖墙老鹰还在，清波三选一。镜头锁定看全图。",
    features: ["13×13 砖钢水林 + 老鹰", "玩家坦克 WASD + 鼠标开火", "敌方坦克波次 · 无丧尸", "清波三选一 + 星铲炸弹命"],
    state: "ready",
  },
  {
    key: "survival",
    ...GAME_MODES.survival,
    desc: "在山崖高地建设防线，指挥坦克守住峡谷。利用准备期布局经济与火力，抵挡十波尸潮和最终首领，胜利后可继续挑战无尽。",
    features: ["峡谷防线 · 工程师施工", "金矿发展 · 科技突破", "专精炮塔 · 坦克协同", "十波战役 · 无尽挑战"],
    state: "ready",
  },
  {
    key: "td",
    ...GAME_MODES.td,
    name: "装甲竞速",
    tagline: "第一人称 · 六车三圈 · 战术道具",
    desc: "高速赛道上的装甲竞逐：抢道具、打干扰、在弯道和火力中争夺第一。",
    features: ["峡谷试验场与捷径", "四种战术道具", "第一人称坦克炮击", "六车三圈争夺排名"],
    state: "ready",
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
    card.innerHTML = `
      <div class="mcPreview" data-preview="${m.key}"></div>
      <div class="mcName">${m.key === "classic" ? "经典" : m.key === "survival" ? "生存" : "竞速"}</div>
      ${m.state === "soon"
        ? `<div class="mcBtn soonBtn">敬请期待</div>`
        : `<div class="mcBtn">${m.key === "classic" ? "进入游戏" : "进入战场"} →</div>`}
    `;
    card.addEventListener("click", () => {
      if (m.state === "soon") {
        const b = card.querySelector(".mcBtn");
        b.textContent = "开发中，敬请期待";
        b.classList.add("shake");
        setTimeout(() => { b.textContent = "即将上线"; b.classList.remove("shake"); }, 1200);
        return;
      }
      if (m.key === "classic") { location.href = "classic.html"; return; }
      if (m.key === "td") { location.href = "racing.html"; return; }
      enterMode(m.key);
    });
    wrap.appendChild(card);
  });
}

function refreshSaveButton(){
  const continueBtn=document.getElementById("continueBtn"),has=!!readSurvivalSnapshot();
  if(continueBtn)continueBtn.disabled=!has;
  const hint=document.getElementById("saveHint");if(hint)hint.textContent=has?"已有生存进度":"暂无生存存档";
}

const SURVIVAL_DIFFICULTIES=Object.freeze({easy:{label:"简单",multiplier:.5},normal:{label:"普通",multiplier:.75},hard:{label:"困难",multiplier:1},hell:{label:"地狱",multiplier:1.5}});
function chooseSurvivalDifficulty(continueGame,onDone){
  const panel=document.getElementById("difficultySelect"),options=document.querySelectorAll("#difficultyOptions [data-difficulty]");
  if(!panel||!options.length){onDone("normal");return;}
  panel.classList.remove("hidden");
  const finish=(key)=>{panel.classList.add("hidden");options.forEach(button=>button.removeEventListener("click",button._difficultyHandler));onDone(key);};
  options.forEach(button=>{const handler=()=>finish(button.dataset.difficulty);button._difficultyHandler=handler;button.addEventListener("click",handler);});
  if(new URLSearchParams(location.search).get("autotest")==="1")setTimeout(()=>finish("normal"),0);
}

function enterMode(key, continueGame = false) {
  const m = setActiveMode(key);
  applyModeConfig(m);
  /* 经典/塔防无金币系统：隐藏 HUD 金币行 */
  const goldRow = document.getElementById("goldRow");
  if (goldRow) goldRow.style.display = m.buildEnabled ? "" : "none";
  audio();
  playIntro();
  document.getElementById("menu").classList.add("hidden");
  const launch=()=>{
    if(key==="survival"&&!continueGame&&!window.__autoTestDifficulty){
      chooseSurvivalDifficulty(false,(difficulty)=>{game.difficultyMultiplier=SURVIVAL_DIFFICULTIES[difficulty].multiplier;game.difficultyId=difficulty;resetGame();});
      return;
    }
    if(key==="survival"&&continueGame){game.difficultyMultiplier=1;game.difficultyId="normal";}
    resetGame();
    if(continueGame&&key==="survival"){
      const snapshot=readSurvivalSnapshot();
      if(snapshot?.game?.difficultyMultiplier){game.difficultyMultiplier=snapshot.game.difficultyMultiplier;game.difficultyId=snapshot.game.difficultyId||"normal";}
      if(!restoreSurvivalSnapshot(snapshot))toast("没有可继续的生存存档");
    }
  };
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
        launch();
        return;
      }
      const [d, t] = assetsProgress();
      el.textContent = ` 战场素材加载中… ${d}/${t}`;
    }, 100);
    return;
  }
  launch();
}

/* 返回主菜单（游戏结束/暂停时） */
function backToMenu() {
  /* 清空场上实体，回到菜单背景 */
  clearCrowdLod();
  if (zombieDeathEffects) zombieDeathEffects.clear();
  clearHeroEffects();
  clearHeroLogistics();
  flushEnemyDisposals(true);
  hordeKillUiDirty = false;
  // Release only enemy-owned resources through the same guarded path as resetGame.
  [...enemies].forEach(e => { scene.remove(e.group); releaseEnemyResources(e); if (e.beam) { scene.remove(e.beam); disposeTransientObject3D(e.beam); e.beam = null; } });
  enemies.length = 0;
  [...bullets].forEach(b => { scene.remove(b.mesh); disposeTransientObject3D(b.mesh); }); bullets.length = 0;
  [...particles].forEach(p => scene.remove(p.mesh)); particles.length = 0;
  [...powerups].forEach(p => scene.remove(p.group)); powerups.length = 0;
  builtTurrets.forEach(t => scene.remove(t.group)); builtTurrets.length = 0;
  builtMines.forEach(m => scene.remove(m.group)); builtMines.length = 0;

  ["gameover", "pause", "upgrade", "build"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById("hud").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
  refreshSaveButton();
  state = STATE.MENU;
  genMap(1);
  camera.position.set(0, 52, 38);
  camera.lookAt(0, 0, 0);
  /*  v6.35.0：返回主菜单时立即切回 menu 主题，不必等 state tick */
  if (window.BGMBridge) window.BGMBridge.forceMenu();
}
/* 把 backToMenu 暴露给 settings-ui.js 用做二次确认后的真正跳转 */
if (typeof window !== "undefined") window.backToMenu = backToMenu;

/* 绑定游戏内按钮（engine 只绑了 restart/resume，这里补返回菜单） */
function bindHome() {
  //  v6.35.0：menuBtn / pauseMenuBtn 已改由 settings-ui.js 接管（带二次确认），
  // 这里只保留存档相关入口。
  const newGameBtn=document.getElementById("newGameBtn");
  if(newGameBtn)newGameBtn.addEventListener("click",()=>{clearSurvivalSnapshot();enterMode("survival",false);});
  const continueBtn=document.getElementById("continueBtn");
  if(continueBtn){continueBtn.addEventListener("click",()=>{if(!continueBtn.disabled)enterMode("survival",true);});refreshSaveButton();}
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
if (typeof window.initMenuShowcase === "function") window.initMenuShowcase();
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

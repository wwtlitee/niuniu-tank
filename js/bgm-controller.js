/* =====================================================================
   js/bgm-controller.js —— 把 BGMSystem 与游戏状态绑定
   - 由 engine.js 的 loop() 每帧调用 tick(state, modeKey)
   - 根据 state 映射到 BGM slot（menu/prep/battle/boss/victory）
   - BGMSystem 对同主题去重；战时菜单保留战斗主题
   ===================================================================== */
"use strict";

const BGMBridge = (() => {
  function _resolve(state, modeKey) {
    if (!modeKey || modeKey === "menu" || state === 0) return "menu"; // STATE.MENU = 0
    if (state === 3) return null;          // STATE.PAUSED 由 tick 统一暂停
    if (state === 4) return "defeat";
    if (state === 8) return "victory";      // STATE.SETTLE = 8：胜利结算
    if (state === 7 || state === 5 || state === 6 || state === 9) return "prep"; // PREP/BUILD/TECH/GATE
    if (state === 2) return "prep";         // UPGRADE 也算备战态
    if (state === 1) return "battle";       // PLAYING
    return null;
  }

  let paused=false;
  function tick(state, modeKey, context={}) {
    if (!window.BGMSystem||!BGMSystem.getStatus().acState) return;
    if(state===3||context.hidden){if(!paused)BGMSystem.pause();paused=true;return;}
    paused=false;
    const combat=context.wave>0&&[1,2,5,6,9].includes(state);
    const slot=combat?(context.bossAlive?'boss':'battle'):_resolve(state,modeKey);
    if(!slot)return;
    BGMSystem.setContext({mode:slot==='menu'?'menu':modeKey||'survival',sub:slot,intensity:context.intensity||0});
  }

  function forceMenu() {
    if (!window.BGMSystem) return;
    BGMSystem.setContext({ mode: "menu", sub: "menu" });
  }

  return { tick, forceMenu };
})();

if (typeof window !== "undefined") window.BGMBridge = BGMBridge;

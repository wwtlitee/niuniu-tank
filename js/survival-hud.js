/* =====================================================================
   js/survival-hud.js —— 生存模式 HUD 顶部新增的「波次进度 / 战斗压力」驱动
   引擎 loop() 每帧调用 window.SurvivalHUD.update()
   依赖：game.wave / enemies / SurvivalSystem.createWaveTransition / boss 判断
   ===================================================================== */
"use strict";

const SurvivalHUD = (() => {
  let _lastUpdate = 0;
  const UPDATE_INTERVAL_MS = 200; // 每 200ms 更新一次，避免每帧操作 DOM
  const PRESSURE_MAX = 100;        // 敌人密度归一化的上限

  function _setProgress(pct, labelText, isBoss) {
    const fg = _$_or("waveProgressFg"); if (!fg) return;
    fg.style.width = Math.max(0, Math.min(100, pct)) + "%";
    fg.classList.toggle("boss", !!isBoss);
    const txt = _$_or("waveProgressText"); if (txt && labelText != null) txt.textContent = labelText;
  }
  function _setPressure(pct) {
    const fg = _$_or("wavePressureFg"); if (!fg) return;
    fg.style.width = Math.max(0, Math.min(100, pct)) + "%";
    const txt = _$_or("wavePressureText"); if (txt) txt.textContent = Math.round(pct) + "%";
  }
  function _$_or(id) { return document.getElementById(id); }

  function update() {
    const now = performance.now();
    if (now - _lastUpdate < UPDATE_INTERVAL_MS) return;
    _lastUpdate = now;
    if (typeof ACTIVE_MODE==='undefined' || ACTIVE_MODE.key !== "survival") return;
    const wave = game && game.wave || 0,active=activeEnemyCount();
    const victoryWave = ACTIVE_MODE.victoryWave || 10;

    // —— 波次进度 ——
    // 波次间过渡时（waveTransition.remaining > 0）显示倒计时
    let pct = 0, label = "—", isBoss = false;
    if (game.waveTransition && game.waveTransition.remaining > 0) {
      const total = (game.waveTransition.total != null) ? game.waveTransition.total : 1.8;
      pct = (1 - game.waveTransition.remaining / total) * 100;
      label = `下一波 ${Math.ceil(game.waveTransition.remaining)}s`;
    } else if (wave > 0) {
      const basePct = Math.min(1, (wave-1) / victoryWave) * 100;
      // 用敌人剩余 / 估算总敌数 估算波内进度
      const totalEnemies = Math.max(1,SurvivalSystem.waveProfile(wave).count||0,active+(game.enemiesToSpawn||0));
      const remaining = totalEnemies > 0 ? (active + (game.enemiesToSpawn || 0)) / totalEnemies : 0;
      const intraWave = totalEnemies > 0 ? (1 - remaining) * 100 * (1 / victoryWave) : 0;
      pct = Math.min(100, basePct + intraWave);
      isBoss = (wave % 5 === 0) && wave <= victoryWave;
      label = wave>victoryWave?`无尽 · 第 ${wave} 波`:`第 ${wave} / ${victoryWave} 波`;
    } else {
      pct = 0; label = "等待开始";
    }
    _setProgress(pct, label, isBoss);

    // —— 战斗压力（敌人密度 + Boss 加成） ——
    let pressure = 0;
    if (active) {
      pressure = Math.min(1, active / PRESSURE_MAX);
      if (enemies.some(e=>e.boss&&e.alive&&!e.dying)) pressure = Math.min(1, pressure + 0.25);
    }
    if (game && game.wave > victoryWave) pressure = Math.min(1, pressure + 0.1); // 无尽阶段
    _setPressure(pressure * 100);
  }

  return { update };
})();

if (typeof window !== "undefined") window.SurvivalHUD = SurvivalHUD;

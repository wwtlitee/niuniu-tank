// 战局压力不依赖波次：伤害实时读取，生命仅在跨档或出生时调整。
function survivalPressureMultiplier(){
  if(ACTIVE_MODE.key!=='survival')return 1;
  const tier=Math.floor(Math.max(0,Number(game.survivalElapsed)||0)/30);
  return (1+.05*tier)*(1+Math.min(1e6,game.overflowPressure||0));
}
function applyEnemyHealthPressure(enemy,multiplier=survivalPressureMultiplier()){
  if(ACTIVE_MODE.key!=='survival'||!enemy||!enemy.alive||enemy.hp<=0||
    !Number.isFinite(enemy.maxHp)||enemy.maxHp<=0)return;
  const previous=enemy._pressureHealthMultiplier||1;
  if(previous===multiplier)return;
  const ratio=Math.max(0,Math.min(1,enemy.hp/enemy.maxHp));
  enemy.maxHp*=multiplier/previous;
  enemy.hp=enemy.maxHp*ratio;
  enemy._pressureHealthMultiplier=multiplier;
}
function updateSurvivalPressure(dt){
  if(ACTIVE_MODE.key!=='survival'||!baseAlive||!Number.isFinite(dt)||dt<=0||
    ![STATE.PREP,STATE.PLAYING,STATE.BUILD,STATE.TECH,STATE.GATE,STATE.UPGRADE].includes(state))return;
  const previous=Math.floor(game.survivalElapsed||0);
  const oldMultiplier=survivalPressureMultiplier();
  game.survivalElapsed=(game.survivalElapsed||0)+dt;
  const multiplier=survivalPressureMultiplier();
  if(multiplier!==oldMultiplier)for(const enemy of enemies)applyEnemyHealthPressure(enemy,multiplier);
  if(Math.floor(game.survivalElapsed)!==previous)updateEnemyLeftUI();
}
const SURVIVAL_WAVE_SECONDS=120;
const SURVIVAL_ACTIVE_LIMIT=4000;
const SURVIVAL_PENDING_LIMIT=8000;
function enqueueSurvivalWave(wave,preservePending){
  if(!preservePending){game.spawnPlans=[];game.pendingBossWave=0;}
  if(!Array.isArray(game.spawnPlans))game.spawnPlans=[];
  const profile=SurvivalSystem.waveProfile(wave),queued=game.spawnPlans.reduce((n,p)=>n+p.remaining,0);
  const admitted=Math.max(0,Math.min(profile.count,SURVIVAL_PENDING_LIMIT-queued));
  const overflow=profile.count-admitted;
  if(overflow>0){game.overflowPressure=Math.min(1e6,(game.overflowPressure||0)+.05*overflow/1000);for(const e of enemies)applyEnemyHealthPressure(e);}
  if(profile.isBoss){game.pendingBossWave=Math.max(game.pendingBossWave||0,wave);}
  if(admitted>0)game.spawnPlans.push({wave,remaining:admitted,bossSpawned:!!profile.isBoss});
  game.enemiesToSpawn=game.spawnPlans.reduce((sum,plan)=>sum+plan.remaining,0);
  game.waveElapsed=0;
}
function survivalHasNextWave(){
  return game.endless||game.wave<ACTIVE_MODE.victoryWave;
}
function survivalWaveStatus(){
  if(!survivalHasNextWave())return game.waveTransition?'战役肃清 · 即将结算':'最终波 · 清场通关';
  if(game.waveTransition&&!game.waveTransition.consumed)return `下一波 ${Math.max(0,Math.ceil(game.waveTransition.remaining))}s`;
  return `超时增援 ${Math.max(0,Math.ceil(SURVIVAL_WAVE_SECONDS-(game.waveElapsed||0)))}s`;
}
function updateWaveDeadline(dt){
  if(ACTIVE_MODE.key!=='survival'||!survivalCombatRunning()||game.wave<=0||_waveClearing||!baseAlive||!Number.isFinite(dt)||dt<=0)return;
  // 清场优先，避免最后一名敌人死亡当帧恰好到点时误刷下一波。
  if(!survivalHasNextWave()||(game.enemiesToSpawn<=0&&activeEnemyCount()===0))return;
  const previous=Math.floor(game.waveElapsed||0);
  game.waveElapsed=(game.waveElapsed||0)+dt;
  if(Math.floor(game.waveElapsed)!==previous)updateEnemyLeftUI();
  if(game.waveElapsed>=SURVIVAL_WAVE_SECONDS){
    startWave(game.wave+1,true);
    toast('两分钟已到，下一波进场 · 残敌继续保留');
  }
}
function spawnPendingSurvivalEnemies(dt){
  if(!survivalCombatRunning()||game.enemiesToSpawn<=0)return;
  const sum=(game.spawnPlans||[]).reduce((n,p)=>n+p.remaining,0);
  // Legacy save and diagnostic callers still expose the aggregate counter.
  if(sum!==game.enemiesToSpawn)game.spawnPlans=[{wave:game.wave,remaining:game.enemiesToSpawn,bossSpawned:!!game._bossDone}];
  game.spawnTimer=(Number.isFinite(game.spawnTimer)?game.spawnTimer:0)-dt;
  if(game.spawnTimer>0)return;
  const slots=Math.max(0,SURVIVAL_ACTIVE_LIMIT-enemies.length);
  if(!slots){game.spawnTimer=.2;return;}
  if(game.pendingBossWave){if(spawnEnemy(null,true,game.pendingBossWave)===false){game.spawnTimer=.2;return;}game.pendingBossWave=0;const first=game.spawnPlans.find(p=>p.remaining>0);if(first){first.remaining--;game.enemiesToSpawn--;}game.spawnTimer=.05;return;}
  const plan=game.spawnPlans.find(p=>p.remaining>0);if(!plan)return;
  const profile=SurvivalSystem.waveProfile(plan.wave);
  game.spawnTimer=(ACTIVE_MODE.spawnInterval||(()=>.5))(plan.wave);
  const count=Math.min(profile.spawnBatch||1,plan.remaining,slots);
  const started=performance.now();
  for(let i=0;i<count;i++){
    const boss=profile.isBoss&&!plan.bossSpawned;
    if(spawnEnemy(boss?null:pickEnemyType(plan.wave),boss,plan.wave)===false){game.spawnTimer=.1;break;}
    if(boss){plan.bossSpawned=true;game._bossDone=true;}
    plan.remaining--;game.enemiesToSpawn--;
    if(performance.now()-started>=4)break;
  }
  game.spawnPlans=game.spawnPlans.filter(p=>p.remaining>0);
  updateEnemyLeftUI();
}

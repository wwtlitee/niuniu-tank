/* Non-stacking mobile healing budget and production gates. */
let mobileHealingTick = 0;
let mobileHealingLedger = new WeakMap();

function beginMobileHealingTick() {
  mobileHealingTick++;
}

function allocateMobileHealing(target, requested, dt) {
  if (!target || !Number.isFinite(requested) || requested <= 0 ||
      !Number.isFinite(dt) || dt <= 0 || !(target.hp > 0) || !Number.isFinite(target.maxHp)) return 0;
  const owner = target.repairBudgetOwner || target;
  let entry = mobileHealingLedger.get(owner);
  if (!entry || entry.tick !== mobileHealingTick) {
    entry = { tick: mobileHealingTick, used: 0 };
    mobileHealingLedger.set(owner, entry);
  }
  const rules = SurvivalSystem.MEDICAL_SUPPORT_RULES;
  const cap = Math.min(rules.maxTargetRepairPerSecond, target.maxHp * rules.maxTargetRepairPercent) * dt;
  const amount = Math.max(0, Math.min(requested, target.maxHp - target.hp, cap - entry.used));
  entry.used += amount;
  return amount;
}

function repairProductionStatus() {
  const rules = SurvivalSystem.MEDICAL_SUPPORT_RULES;
  const count = friendlyUnits.filter(u => u.type === 'repair' && u.alive && u.hp > 0).length +
    heavyFactories.reduce((sum, f) => sum + (f.queue || []).filter(q => q.typeId === 'repair').length, 0);
  const requirements = `第${rules.unlockWave}波 · 防御工程${rules.researchLevel}级 · 装甲工程${rules.researchLevel}级`;
  const unlocked = game.wave >= rules.unlockWave &&
    researchInstitutes.some(r => r.hp > 0 && r.group?.parent) &&
    (game.tech.defense || 0) >= rules.researchLevel && (game.tech.tank || 0) >= rules.researchLevel;
  return { count, max: rules.maxUnits, unlocked, allowed: unlocked && count < rules.maxUnits,
    reason: !unlocked ? `解锁：${requirements}` : count >= rules.maxUnits ? `医疗车已达上限 ${count}/${rules.maxUnits}（含生产队列）` : `医疗车 ${count}/${rules.maxUnits}（含生产队列）` };
}

const test = require("node:test");
const assert = require("node:assert/strict");

test('近战波次线性成长以第十波减甲后800伤害每秒为锚点',()=>{
  const system=require('../js/survival-system.js'),r=system.WALL_ASSAULT_REFERENCE;
  const values=Array.from({length:10},(_,i)=>system.meleeWaveMultiplier(i+1));
  assert.equal(values[0],1);
  for(let i=2;i<10;i++)assert.ok(Math.abs(values[i]-values[i-1]-(values[1]-values[0]))<1e-10);
  const dps=values[9]*system.ZOMBIE_COMBAT_SCALE*4*r.typeWeight*r.contacts/r.interval*r.timeMultiplier*(1-r.armor);
  assert.ok(Math.abs(dps-800)<1e-8);assert.equal(system.structureAttackCapacity(1,system.ZOMBIE_COMBAT_SCALE),6);
});

const {
  WALL_TIERS,
  RESEARCH_LINES,
  FRIENDLY_UNIT_TYPES,
  TURRET_BRANCHES,
  wallProgress,
  wallUpgradeCost,
  researchCost,
  waveProfile,
  bossProfile,
  repairQuote,
  formationSlots,
  turretPressureMultiplier,
  NIGHT_VISUALS,
  VISION_RULES,
  createWaveTransition,
  tickWaveTransition,
  rangeAtResearchLevel,
  friendlyRangeAtResearchLevel,
  isPointVisible,
  MINE_ECONOMY,
  mineBuildCost,
  mineUpgradeCost,
  mineIncome,
  BREAKTHROUGH_RESEARCH,
  breakthroughCost,
  mineBuildLimit,
  researchLevelCap,
  wallLevelCap,
  turretLevelCap,
  predictInterceptPoint,
  separateHordeCircles,
  resolveSolidCircles,
  formationSlotsForRadii,
  turretVisualScale,
  wallVisualScale,
  PROJECTILE_VISUALS,
  hordeCollisionRadius,
  bloodMistOpacity,
  ENEMY_MOVEMENT,
  enemyMoveSpeed,
  enemyRunTimeScale,
  structureAttackCapacity,
  ZOMBIE_COMBAT_SCALE,
} = require("../js/survival-system.js");

test("墙体攻击位按占地限制前排数量", () => {
  assert.equal(structureAttackCapacity(1), 2);
  assert.equal(structureAttackCapacity(2), 4);
  assert.equal(structureAttackCapacity(9), 6);
  assert.equal(structureAttackCapacity(1, ZOMBIE_COMBAT_SCALE), 6);
});

test("奔跑尸群显著缩短进场等待且保留兵种速度层级", () => {
  const normal = enemyMoveSpeed("normal", waveProfile(1).speedMultiplier);
  const fast = enemyMoveSpeed("fast", 1);
  const siege = enemyMoveSpeed("siege", 1);
  assert.ok(normal >= 3.8 && normal <= 4.5, `普通尸群比例移速异常：${normal}`);
  assert.ok(160 / normal <= 75, "缩小后的普通怪穿越 160 世界单位不应无限拖慢");
  assert.ok(fast >= normal * 1.3, "快速怪需要与普通怪拉开明显差异");
  assert.ok(siege >= normal * 0.55, "攻城怪不能慢到继续拖长整波时间");
  assert.ok(ENEMY_MOVEMENT.boss.base >= 5, "Boss 基础移速不能低于可接受下限");
});

test("高速增益有碰撞安全上限且奔跑动画跟随实际速度", () => {
  const capped = enemyMoveSpeed("fast", 1.42, 1.8);
  assert.equal(capped, ENEMY_MOVEMENT.fast.max * ZOMBIE_COMBAT_SCALE);
  assert.ok(enemyRunTimeScale(14) > enemyRunTimeScale(10));
  assert.ok(enemyRunTimeScale(99) <= 1.75, "动画倍率必须有稳定上限");
});

test("尸潮碰撞体积收缩以允许人形单位自然挤压", () => {
  assert.equal(hordeCollisionRadius(1.5), .87);
  assert.equal(hordeCollisionRadius(3, true), 2.16);
  assert.ok(hordeCollisionRadius(1.5) >= .7, "普通僵尸仍需保留最小实体体积");
  assert.ok(hordeCollisionRadius(1.5) < 1, "普通僵尸不可再使用接近坦克宽度的碰撞半径");
});

test("暗红血雾随波次和可见尸群增强但不会遮住地图", () => {
  assert.equal(bloodMistOpacity(0, 0), 0);
  assert.ok(bloodMistOpacity(15, 40) > bloodMistOpacity(1, 4));
  assert.ok(bloodMistOpacity(30, 200) <= 0.22, "血雾透明度必须保持可读性上限");
});

test("实体圆碰撞会分离重叠单位且固定实体不会被推动", () => {
  const resolved = resolveSolidCircles([
    { id: 1, x: 0, z: 0, radius: 2, movable: true },
    { id: 2, x: 0, z: 0, radius: 1.5, movable: true },
    { id: 3, x: 5, z: 0, radius: 2, movable: false },
  ], { iterations: 8, compression: 1 });
  const [a, b, fixed] = resolved;
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 3.49, "友军实体不得重叠");
  assert.equal(fixed.x, 5, "固定建筑不能被动态单位推走");
  assert.equal(fixed.z, 0);
  assert.ok(Math.hypot(b.x - fixed.x, b.z - fixed.z) >= 3.49, "动态单位不得穿进固定建筑");
});

test("编队落点按最大实体直径留出坦克间距", () => {
  const slots = formationSlotsForRadii([1.35, 1.7, 2.05, 1.5], { x: 10, z: 20 }, { padding: 0.35 });
  assert.equal(slots.length, 4);
  let minimum = Infinity;
  for (let left = 0; left < slots.length; left++) for (let right = left + 1; right < slots.length; right++) {
    minimum = Math.min(minimum, Math.hypot(slots[left].x - slots[right].x, slots[left].z - slots[right].z));
  }
  assert.ok(minimum >= 4.44, `编队最小间距不足，实际 ${minimum}`);
});

test("墙体 1 到 50 级每十级切换一次材质阶段", () => {
  assert.deepEqual(WALL_TIERS.map((tier) => tier.name), ["石头", "铁", "金", "钻石", "黑曜石"]);
  assert.deepEqual([1, 10, 11, 20, 21, 30, 31, 40, 41, 50].map(wallProgress), [
    { level: 1, tier: 0, minor: 1, name: "石头" },
    { level: 10, tier: 0, minor: 10, name: "石头" },
    { level: 11, tier: 1, minor: 1, name: "铁" },
    { level: 20, tier: 1, minor: 10, name: "铁" },
    { level: 21, tier: 2, minor: 1, name: "金" },
    { level: 30, tier: 2, minor: 10, name: "金" },
    { level: 31, tier: 3, minor: 1, name: "钻石" },
    { level: 40, tier: 3, minor: 10, name: "钻石" },
    { level: 41, tier: 4, minor: 1, name: "黑曜石" },
    { level: 50, tier: 4, minor: 10, name: "黑曜石" },
  ]);
  assert.deepEqual(wallProgress(-10), wallProgress(1));
  assert.deepEqual(wallProgress(999), { level: 999, tier: 4, minor: 9, name: "黑曜石" });
  assert.ok(wallUpgradeCost(49) > wallUpgradeCost(1));
  assert.ok(wallUpgradeCost(50) > wallUpgradeCost(49));
});

test("研究院五条金币科技包含英雄作战学", () => {
  assert.deepEqual(Object.keys(RESEARCH_LINES), ["defense", "turret", "tank", "economy", "heroCore"]);
  for (const line of Object.values(RESEARCH_LINES)) {
    assert.equal(line.maxLevel, 10);
    assert.ok(line.baseCost > 0);
    assert.equal("techPoints" in line, false);
  }
  assert.ok(researchCost("defense", 9) > researchCost("defense", 0));
  assert.equal(researchCost("defense", 10), null);
  assert.ok(researchCost("defense", 10, 20) > researchCost("defense", 9, 20));
  assert.throws(() => researchCost("unknown", 0), /unknown research line/);
});

test("无限突破提高数量或等级上限且价格指数增长", () => {
  assert.deepEqual(Object.keys(BREAKTHROUGH_RESEARCH), ["mining", "science", "wall", "turret"]);
  assert.equal(mineBuildLimit(0), 5);
  assert.equal(mineBuildLimit(12), 17);
  assert.equal(researchLevelCap(0), 10);
  assert.equal(researchLevelCap(3), 40);
  assert.equal(wallLevelCap(0), 50);
  assert.equal(wallLevelCap(4), 90);
  assert.equal(turretLevelCap(0), 5);
  assert.equal(turretLevelCap(4), 25);
  for (const id of Object.keys(BREAKTHROUGH_RESEARCH)) {
    assert.ok(breakthroughCost(id, 1) > breakthroughCost(id, 0));
    assert.ok(breakthroughCost(id, 8) > breakthroughCost(id, 7) * 1.5);
    assert.ok(Number.isFinite(breakthroughCost(id, 60)), `${id} 高阶价格必须保持可显示`);
  }
});

test("炮台弹道提前量能够拦截横向移动目标", () => {
  const point = predictInterceptPoint({
    shooter: { x: 0, z: 0 },
    target: { x: 10, z: 0 },
    velocity: { x: 0, z: 2 },
    projectileSpeed: 10,
  });
  assert.ok(Math.abs(point.x - 10) < 0.001);
  assert.ok(point.z > 2 && point.z < 2.1, `预期横向提前约2.04，实际 ${point.z}`);
  assert.ok(point.time > 1 && point.time < 1.1);
  assert.deepEqual(predictInterceptPoint({shooter:{x:0,z:0},target:{x:10,z:0},velocity:{x:20,z:0},projectileSpeed:10}), {x:10,z:0,time:0});
});

test("标准炮台只有四个不可互换分支", () => {
  assert.deepEqual(Object.keys(TURRET_BRANCHES), ["rapid", "cannon", "antitank", "emp"]);
  assert.ok(TURRET_BRANCHES.rapid.stats.fireRate > TURRET_BRANCHES.cannon.stats.fireRate);
  assert.ok(TURRET_BRANCHES.cannon.stats.splash > 0);
  assert.ok(TURRET_BRANCHES.antitank.stats.armorPierce > 0);
  assert.equal(TURRET_BRANCHES.emp.name,'贯穿激光炮');
  assert.equal(TURRET_BRANCHES.emp.stats.slow,0);
  assert.ok(TURRET_BRANCHES.rapid.stats.damage * TURRET_BRANCHES.rapid.stats.fireRate <= 14, "速射炮台不可单塔形成退化解");
  assert.ok(TURRET_BRANCHES.cannon.stats.damage * TURRET_BRANCHES.cannon.stats.fireRate <= 11, "范围炮台必须用溅射换取单体输出");
  assert.ok(TURRET_BRANCHES.antitank.stats.damage * TURRET_BRANCHES.antitank.stats.fireRate <= 13, "反装甲炮必须依赖穿甲职责");
});

test("静态炮台面对重装与 Boss 必须依赖反装甲职责", () => {
  assert.equal(typeof turretPressureMultiplier, "function");
  assert.ok(turretPressureMultiplier("normal", false) < 1);
  assert.ok(turretPressureMultiplier("heavy", false) <= 0.6);
  assert.ok(turretPressureMultiplier("siege", false) <= 0.52);
  assert.ok(turretPressureMultiplier("normal", true) <= 0.46);
});

test("单位定义包含独立英雄及旧医疗存档兼容记录", () => {
  assert.deepEqual(Object.keys(FRIENDLY_UNIT_TYPES), ["light", "medium", "heavy", "hero", "repair"]);
  for (const unit of Object.values(FRIENDLY_UNIT_TYPES)) {
    assert.ok(unit.cost > 0);
    assert.ok(unit.population > 0);
    assert.ok(unit.buildTime > 0);
  }
  assert.equal(FRIENDLY_UNIT_TYPES.repair.damage, 0);
  assert.ok(FRIENDLY_UNIT_TYPES.light.speed > FRIENDLY_UNIT_TYPES.heavy.speed);
  assert.ok(FRIENDLY_UNIT_TYPES.heavy.maxHp > FRIENDLY_UNIT_TYPES.light.maxHp);
});

test("坦克与炮台射程统一使用地图格单位并落在同一战术区间", () => {
  assert.deepEqual(["light", "medium", "heavy"].map((id) => friendlyRangeAtResearchLevel(id, 0)), [9, 10, 11]);
  assert.deepEqual(["light", "medium", "heavy"].map((id) => friendlyRangeAtResearchLevel(id, 10)), [13, 14, 15]);
  assert.deepEqual(["rapid", "cannon", "antitank", "emp"].map((id) => rangeAtResearchLevel(id, 0)), [8, 10, 13, 9]);
  assert.deepEqual(["rapid", "cannon", "antitank", "emp"].map((id) => rangeAtResearchLevel(id, 10)), [11, 13, 16, 12]);
  for (const id of ["light", "medium", "heavy"]) {
    assert.ok(FRIENDLY_UNIT_TYPES[id].damage >= 1.6, `${id} 基础炮伤不得继续处于挠痒区间`);
  }
  assert.ok(TURRET_BRANCHES.rapid.stats.damage * TURRET_BRANCHES.rapid.stats.fireRate <= 4.5,
    "一级速射炮台不得继续用六点以上裸 DPS 压倒坦克");
});

test("一级专精炮台与作战坦克不再普遍秒杀首波普通僵尸", () => {
  const waveOneHp = 2 * waveProfile(1).hpMultiplier;
  for (const [id, branch] of Object.entries(TURRET_BRANCHES)) {
    const effectiveDamage = branch.stats.damage * turretPressureMultiplier("normal", false);
    assert.ok(Math.ceil(waveOneHp / effectiveDamage) >= 2, `${id} 一级不应一发击杀首波普通僵尸`);
  }
  for (const id of ["light", "medium", "heavy"]) {
    assert.ok(Math.ceil(waveOneHp / FRIENDLY_UNIT_TYPES[id].damage) >= 2, `${id} 不应一发击杀首波普通僵尸`);
  }
});

test("维修不能自修、可互修且金币不足时只修得起对应生命", () => {
  assert.deepEqual(repairQuote({ missingHp: 100, availableGold: 99, self: false }), { hp: 100, gold: 10 });
  assert.deepEqual(repairQuote({ missingHp: 100, availableGold: 3, self: false }), { hp: 30, gold: 3 });
  assert.deepEqual(repairQuote({ missingHp: 100, availableGold: 99, self: true }), { hp: 0, gold: 0 });
  assert.deepEqual(repairQuote({ missingHp: 0, availableGold: 99, self: false }), { hp: 0, gold: 0 });
});

test("金矿保持固定建造价并采用五次四倍价格、五倍收益升级", () => {
  assert.deepEqual(MINE_ECONOMY, {
    baseCost: 70,
    upgradeCosts: [280, 1120, 4480, 17920, 71680],
    incomeTiers: [1, 5, 25, 125, 625, 3125],
    maxLevel: 6,
  });
  assert.equal(mineBuildCost(), 70);
  assert.deepEqual([1, 2, 3, 4, 5].map(mineUpgradeCost), [280, 1120, 4480, 17920, 71680]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(mineIncome), [1, 5, 25, 125, 625, 3125]);
  assert.equal(mineUpgradeCost(6), null);
});

test("十波战役数量递增且打完进入无尽", () => {
  const waves = Array.from({ length: 10 }, (_, index) => waveProfile(index + 1));
  assert.deepEqual(waves.map((wave) => wave.count), [600, 1000, 1400, 2000, 2400, 2800, 3200, 3600, 4000, 4000]);
  assert.deepEqual(waves.filter((wave) => wave.isBoss).map((wave) => wave.wave), [5, 10]);
  assert.equal(waves[0].archetype, "normal");
  assert.equal(waves[1].archetype, "fast");
  assert.equal(waves[2].archetype, "heavy");
  assert.equal(bossProfile(5).id, "corpse_king");
  assert.equal(bossProfile(10).id, "doom_keeper");
  assert.equal(waveProfile(1).giantChance, 0);
  assert.equal(waveProfile(3).giantChance, 0);
  assert.ok(waveProfile(4).giantChance >= 0.12, "第四波起必须出现巨型丧尸");
  assert.ok(waveProfile(10).giantChance >= 0.4, "终焉波必须大量巨型丧尸");
  const pressure = (wave) => wave.count * wave.hpMultiplier * wave.densityBudgetScale * wave.damageMultiplier;
  assert.ok(pressure(waveProfile(4)) > pressure(waveProfile(3)), "第四波总体压力必须高于第三波");
  assert.ok(waveProfile(4).damageMultiplier > waveProfile(3).damageMultiplier, "第四波攻击必须高于第三波");
  assert.ok(waveProfile(10).hpMultiplier > waveProfile(4).hpMultiplier);
  assert.equal(waveProfile(11).isEndless, true);
  assert.equal(waveProfile(11).count, 4000);
  assert.ok(Math.abs(waveProfile(11).hpMultiplier / waveProfile(10).hpMultiplier - 1.1) < 1e-9);
  assert.ok(Math.abs(waveProfile(11).damageMultiplier / waveProfile(10).damageMultiplier - 1.1) < 1e-9);
  assert.ok(Math.abs(waveProfile(12).count / waveProfile(11).count - 1) < 1e-9);
  assert.equal(bossProfile(15).id, "corrupted_colossus");
  assert.equal(waveProfile(1).activeCap,4000);
  assert.equal(waveProfile(10).activeCap,4000);
});

test("史诗尸潮连续入场并限制单帧创建批次", () => {
  for(let wave=1;wave<=10;wave++){
    assert.equal(waveProfile(wave).spawnBatch,24);
    assert.equal(waveProfile(wave).spawnInterval,0);
  }
  assert.ok(Math.ceil(waveProfile(10).count/24)<180);
});

test("多单位目标槽位围绕目标点分散且数量精确", () => {
  assert.deepEqual(formationSlots(0, { x: 10, z: 20 }), []);
  const slots = formationSlots(9, { x: 10, z: 20 });
  assert.equal(slots.length, 9);
  assert.equal(new Set(slots.map((slot) => `${slot.x}:${slot.z}`)).size, 9);
  assert.ok(slots.every((slot) => Math.hypot(slot.x - 10, slot.z - 20) <= 6));
});

test("波间倒计时不因建造或研究界面丢失且只触发一次", () => {
  let transition = createWaveTransition(3, 1.8);
  transition = tickWaveTransition(transition, 0.9, "BUILD");
  assert.equal(transition.ready, false);
  transition = tickWaveTransition(transition, 0.9, "TECH");
  assert.deepEqual(transition, { nextWave: 3, remaining: 0, ready: true, consumed: false });
  transition = tickWaveTransition(transition, 0.5, "PLAYING");
  assert.equal(transition.ready, true, "倒计时完成后不得被重复推进或复位");
});

test("夜景保持冷色环境与暖色功能灯的层次且限制真实光源", () => {
  assert.ok(NIGHT_VISUALS.background <= 0x18202c);
  assert.ok(NIGHT_VISUALS.moonIntensity > 0 && NIGHT_VISUALS.moonIntensity < 0.8);
  assert.ok(NIGHT_VISUALS.ambientIntensity > 0.1 && NIGHT_VISUALS.ambientIntensity < 0.6, "柔和填充光保留夜景而非压黑角色");
  assert.ok((NIGHT_VISUALS.ambientColor & 255) > (NIGHT_VISUALS.ambientColor >>> 16), "环境填充仍为冷色");
  assert.equal(NIGHT_VISUALS.lampColor, 0xffc56a);
  assert.ok(NIGHT_VISUALS.maxDynamicLights <= 10, "真实动态光源必须有硬上限");
  assert.ok(NIGHT_VISUALS.fogOpacity >= 0.72 && NIGHT_VISUALS.fogOpacity <= 0.92);
});

test("巨岩所有材质阶段均不自发光", () => {
  assert.ok(WALL_TIERS.every((tier) => tier.emissive === 0));
});

test("共享视野支持基地、单位、炮台、路灯和警戒灯塔", () => {
  assert.ok(VISION_RULES.beaconRadius > VISION_RULES.lampRadius);
  assert.ok(VISION_RULES.beaconRadius >= VISION_RULES.turretRadius);
  const sources = [{ x: 0, z: 0, radius: 8 }, { x: 30, z: 0, radius: 12 }];
  assert.equal(isPointVisible({ x: 7.9, z: 0 }, sources), true);
  assert.equal(isPointVisible({ x: 18, z: 0 }, sources), true);
  assert.equal(isPointVisible({ x: 15, z: 15 }, sources), false);
});

test("医疗灯塔占两人口并按最大生命百分比治疗且多塔封顶十个百分点", () => {
  const rules=SurvivalSystem.MEDICAL_BEACON_RULES;
  assert.ok(rules,"必须提供医疗灯塔成长规则");
  assert.deepEqual(rules.visionRadius,[44,48,52,56,60]);
  assert.deepEqual(rules.repairRadius,[18,20,22,24,26]);
  assert.deepEqual(rules.repairPercentPerSecond,[0.02,0.0275,0.035,0.0425,0.05]);
  assert.deepEqual(rules.upgradeCosts,[120,240,480,960]);
  assert.equal(rules.population,2);
  assert.equal(rules.maxStackedRepairPercentPerSecond,0.1);
});

test("尸潮实体碰撞按半径分离重叠单位",()=>{
  const agents=[{x:0,z:0,radius:1,id:1},{x:.2,z:0,radius:1.2,id:2},{x:0,z:.1,radius:.8,id:3}];
  const resolved=separateHordeCircles(agents,{iterations:4,compression:.92,maxStep:4});
  for(let i=0;i<resolved.length;i++)for(let j=i+1;j<resolved.length;j++){
    const distance=Math.hypot(resolved[i].x-resolved[j].x,resolved[i].z-resolved[j].z);
    assert.ok(distance>=(resolved[i].radius+resolved[j].radius)*.9,`单位 ${i}/${j} 仍穿模：${distance}`);
  }
});

test("炮台和巨岩随等级温和增大且存在上限",()=>{
  assert.equal(turretVisualScale(1),1);
  assert.ok(turretVisualScale(5)>=1.14&&turretVisualScale(5)<=1.18);
  assert.ok(turretVisualScale(50)<=1.28);
  assert.equal(wallVisualScale(1),1);
  assert.ok(wallVisualScale(50)>=1.1&&wallVisualScale(50)<=1.13);
  assert.ok(wallVisualScale(500)<=1.18);
});

test("机枪炮弹穿甲弹冰弹和坦克弹使用不同弹体合同",()=>{
  const keys=["machinegun","cannon","antitank","emp","tank"];
  assert.deepEqual(Object.keys(PROJECTILE_VISUALS).sort(),[...keys,'shotgun','incendiary','grenade'].sort());
  assert.equal(new Set(keys.map((key)=>PROJECTILE_VISUALS[key].shape)).size,keys.length);
  assert.ok(PROJECTILE_VISUALS.cannon.radius>PROJECTILE_VISUALS.machinegun.radius);
  assert.equal(PROJECTILE_VISUALS.emp.trail,"frost");
});

test("炮台一级射程收敛且十级科技提供明确成长", () => {
  const expectedMax = { turret: 11, rapid: 11, cannon: 13, antitank: 16, emp: 12 };
  for (const [type, maxRange] of Object.entries(expectedMax)) {
    const baseRange = rangeAtResearchLevel(type, 0);
    assert.ok(maxRange-baseRange>=3, `${type} 科技满级必须至少增加三格射程`);
    assert.equal(rangeAtResearchLevel(type, 10), maxRange);
    assert.ok(rangeAtResearchLevel(type, 5) > baseRange);
  }
});

test("坦克一级射程与炮台重叠且十级科技提供四格成长", () => {
  const expectedMax = { light: 13, medium: 14, heavy: 15 };
  for (const [type, maxRange] of Object.entries(expectedMax)) {
    assert.equal(expectedMax[type]-friendlyRangeAtResearchLevel(type,0),4);
    assert.equal(friendlyRangeAtResearchLevel(type, 10), maxRange);
  }
});

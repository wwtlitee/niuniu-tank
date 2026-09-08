(function survivalSystemFactory(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SurvivalSystem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSurvivalSystem() {
  "use strict";

  const freezeTable = (table) => Object.freeze(Object.fromEntries(
    Object.entries(table).map(([key, value]) => [key, Object.freeze(value)]),
  ));

  const WALL_TIERS = Object.freeze([
    Object.freeze({ id: "stone", name: "石头", color: 0x68645b, emissive: 0x000000, metalness: 0.05, roughness: 0.92 }),
    Object.freeze({ id: "iron", name: "铁", color: 0x62676b, emissive: 0x000000, metalness: 0.72, roughness: 0.48 }),
    Object.freeze({ id: "gold", name: "金", color: 0xb58a32, emissive: 0x000000, metalness: 0.78, roughness: 0.36 }),
    Object.freeze({ id: "diamond", name: "钻石", color: 0x83d9e8, emissive: 0x000000, metalness: 0.32, roughness: 0.2 }),
    Object.freeze({ id: "obsidian", name: "黑曜石", color: 0x17151d, emissive: 0x000000, metalness: 0.2, roughness: 0.3 }),
  ]);

  const NIGHT_VISUALS = Object.freeze({
    background: 0x0b1019,
    fog: 0x1d2938,
    fogNear: 38,
    fogFar: 126,
    exposure: 0.9,
    moonColor: 0x9db7d7,
    moonIntensity: 0.7,
    ambientColor: 0x344258,
    ambientIntensity: 0.36,
    hemisphereSky: 0x6681a6,
    hemisphereGround: 0x15191c,
    hemisphereIntensity: 0.52,
    lampColor: 0xffc56a,
    fogOpacity: 0.74,
    maxDynamicLights: 8,
  });

  const VISION_RULES = Object.freeze({
    baseRadius: 34,
    lampRadius: 18,
    beaconRadius: 44,
    turretRadius: 36,
    lightTankRadius: 34,
    mediumTankRadius: 38,
    heavyTankRadius: 40,
    repairRadius: 30,
    fogTextureSize: 256,
    beaconMaxCount: 4,
  });

  /* 尸群使用奔跑动画，基础移速按“从出生区到防线约 15 秒”校准。
     max 同时是高速词缀的碰撞安全上限，避免大步长穿过窄墙或友军实体。 */
  const ENEMY_MOVEMENT = freezeTable({
    normal: { base: 10.5, max: 19 },
    fast: { base: 15, max: 23 },
    heavy: { base: 8, max: 16 },
    sniper: { base: 9.5, max: 18 },
    ghost: { base: 13.5, max: 22 },
    lifesteal: { base: 10, max: 19 },
    siege: { base: 7, max: 15 },
    elite: { base: 9, max: 17 },
    boss: { base: 6.5, max: 14 },
  });

  /* 人形尸潮已经按约四分之一的坦克尺度渲染；战斗参数必须共用同一比例，
     否则小模型会以坦克级伤害和速度冲刺。 */
  const ZOMBIE_COMBAT_SCALE = 0.375;

  // 第10波六个接触位，兵种平均权重46/18；20分钟×3、25%护甲后800 HP/s。
  const WALL_ASSAULT_REFERENCE=Object.freeze({dps:800,contacts:6,timeMultiplier:3,armor:.25,typeWeight:46/18,interval:.9});
  function meleeWaveMultiplier(wave){
    const r=WALL_ASSAULT_REFERENCE;
    const end=r.dps*r.interval/(r.contacts*r.timeMultiplier*(1-r.armor)*r.typeWeight*4*ZOMBIE_COMBAT_SCALE);
    const safe=clampInt(wave,1,1000);
    return 1+(end-1)*(Math.min(10,safe)-1)/9+Math.max(0,safe-10)*(end-1)/9;
  }

  function enemyMoveSpeed(type, waveMultiplier = 1, modifier = 1) {
    const movement = ENEMY_MOVEMENT[type] || ENEMY_MOVEMENT.normal;
    const waveScale = Math.max(0, Number(waveMultiplier) || 0);
    const extraScale = Math.max(0, Number(modifier) || 0);
    return Math.min(movement.max * ZOMBIE_COMBAT_SCALE,
      movement.base * waveScale * extraScale * ZOMBIE_COMBAT_SCALE);
  }

  function enemyRunTimeScale(speed) {
    const safeSpeed = Math.max(0, Number(speed) || 0);
    return Math.max(1.05, Math.min(1.75, 0.85 + safeSpeed / 18));
  }

  function structureAttackCapacity(cellCount = 1, unitScale = 1) {
    const cells = Math.max(1, Number(cellCount) || 1);
    const scale = Math.max(0.25, Number(unitScale) || 1);
    const baseCapacity = Math.ceil(Math.sqrt(cells)) * 2;
    return Math.min(24, Math.max(2, Math.ceil(baseCapacity / scale)));
  }

  const MEDICAL_BEACON_RULES = Object.freeze({
    maxLevel: 5,
    visionRadius: Object.freeze([44, 48, 52, 56, 60]),
    repairRadius: Object.freeze([18, 20, 22, 24, 26]),
    repairPercentPerSecond: Object.freeze([0.02, 0.0275, 0.035, 0.0425, 0.05]),
    upgradeCosts: Object.freeze([120, 240, 480, 960]),
    population: 2,
    maxStackedRepairPercentPerSecond: 0.1,
  });

  const PROJECTILE_VISUALS = freezeTable({
    machinegun: { shape: "tracer", radius: 0.09, length: 0.72, color: 0xffcf72, trail: "spark" },
    cannon: { shape: "round-shell", radius: 0.25, length: 0.72, color: 0xd68b42, trail: "smoke" },
    antitank: { shape: "sabot-dart", radius: 0.11, length: 1.15, color: 0xf1dfbb, trail: "streak" },
    emp: { shape: "crystal-orb", radius: 0.38, length: 0.55, color: 0xa7e9ff, trail: "frost" },
    shotgun: { shape: "pellet", radius: 0.075, length: 0.3, color: 0xffd677, trail: "spark" },
    incendiary: { shape: "fire-shell", radius: 0.2, length: 0.65, color: 0xff682e, trail: "fire" },
    grenade: { shape: "round-shell", radius: 0.27, length: 0.6, color: 0xd8aa58, trail: "smoke" },
    tank: { shape: "tank-shell", radius: 0.18, length: 0.82, color: 0xc7d5d7, trail: "smoke-light" },
  });

  const TURRET_RANGE_CURVES = Object.freeze({
    turret: Object.freeze({ base: 8, max: 11 }),
    rapid: Object.freeze({ base: 8, max: 11 }),
    cannon: Object.freeze({ base: 10, max: 13 }),
    antitank: Object.freeze({ base: 13, max: 16 }),
    emp: Object.freeze({ base: 9, max: 12 }),
  });

  const FRIENDLY_RANGE_CURVES = Object.freeze({
    light: Object.freeze({ base: 9, max: 13 }),
    medium: Object.freeze({ base: 10, max: 14 }),
    heavy: Object.freeze({ base: 11, max: 15 }),
    repair: Object.freeze({ base: 4.5, max: 4.5 }),
  });

  const RESEARCH_LINES = freezeTable({
    defense: { id: "defense", name: "防御工程", maxLevel: 10, baseCost: 90, effect: { structureHpPct: 0.1, structureArmorPct: 0.025 } },
    turret: { id: "turret", name: "火力工程", maxLevel: 10, baseCost: 120, effect: { damagePct: 0.05, fireRatePct: 0.03, rangePct: 0.02 } },
    tank: { id: "tank", name: "装甲工程", maxLevel: 10, baseCost: 120, effect: { damagePct: 0.07, hpPct: 0.08, speedPct: 0.025 } },
    economy: { id: "economy", name: "后勤工程", maxLevel: 10, baseCost: 110, effect: { incomePct: 0.055, buildCostPct: -0.015, population: 1 } },
  });

  const BREAKTHROUGH_RESEARCH = freezeTable({
    mining: { id: "mining", name: "采矿扩张", baseCost: 125000, growth: 3, increment: 1, target: "mine-count" },
    science: { id: "science", name: "科技突破", baseCost: 240000, growth: 3.5, increment: 10, target: "research-cap" },
    wall: { id: "wall", name: "巨岩突破", baseCost: 90000, growth: 3, increment: 10, target: "wall-cap" },
    turret: { id: "turret", name: "炮台突破", baseCost: 160000, growth: 3.25, increment: 5, target: "turret-cap" },
  });

  const MINE_ECONOMY = Object.freeze({
    baseCost: 70,
    upgradeCosts: Object.freeze([280, 1120, 4480, 17920, 71680]),
    incomeTiers: Object.freeze([1, 5, 25, 125, 625, 3125]),
    maxLevel: 6,
  });

  function mineBuildCost() {
    return MINE_ECONOMY.baseCost;
  }

  function mineUpgradeCost(currentLevel) {
    const level = clampInt(currentLevel, 1, MINE_ECONOMY.maxLevel);
    return level >= MINE_ECONOMY.maxLevel ? null : MINE_ECONOMY.upgradeCosts[level - 1];
  }

  function mineIncome(level) {
    const safeLevel = clampInt(level, 1, MINE_ECONOMY.maxLevel);
    return MINE_ECONOMY.incomeTiers[safeLevel - 1];
  }

  const TURRET_BRANCHES = freezeTable({
    rapid: { id: "rapid", name: "速射机枪", color: 0xc7a45a, stats: Object.freeze({ damage: 1.2, fireRate: 3.5, range: 11, splash: 0, armorPierce: 0, slow: 0, stun: 0 }) },
    cannon: { id: "cannon", name: "范围火炮", color: 0xb85b35, stats: Object.freeze({ damage: 1.8, fireRate: 0.55, range: 13, splash: 4.2, armorPierce: 0, slow: 0, stun: 0 }) },
    antitank: { id: "antitank", name: "反装甲炮", color: 0x9a9b91, stats: Object.freeze({ damage: 1.8, fireRate: 0.38, range: 16, splash: 0, armorPierce: 0.65, slow: 0, stun: 0 }) },
    emp: { id: "emp", name: "贯穿激光炮", color: 0x66b8c7, stats: Object.freeze({ damage: 1.2, fireRate: 0.8, range: 12, splash: 0, armorPierce: 0, slow: 0, stun: 0 }) },
  });

  const FRIENDLY_UNIT_TYPES = freezeTable({
    light: { id: "light", name: "轻型坦克", cost: 85, population: 2, buildTime: 7, maxHp: 150, armor: 0.08, damage: 1.6, fireRate: 1.8, range: 13, speed: 8.2, scale: 0.78 },
    medium: { id: "medium", name: "中型坦克", cost: 145, population: 3, buildTime: 11, maxHp: 280, armor: 0.18, damage: 1.8, fireRate: 1.35, range: 14, speed: 6.3, scale: 0.92 },
    heavy: { id: "heavy", name: "重型坦克", cost: 240, population: 5, buildTime: 17, maxHp: 520, armor: 0.32, damage: 1.95, fireRate: 0.8, range: 15, speed: 4.4, scale: 1.12 },
    repair: { id: "repair", name: "维修车", cost: 115, population: 2, buildTime: 9, maxHp: 190, armor: 0.1, damage: 0, fireRate: 0, range: 4.5, speed: 6.8, scale: 0.82, repairPerSecond: 36 },
  });

  const CAMPAIGN_WAVES = 10;
  const CAMPAIGN_COUNTS = Object.freeze([10, 44, 78, 160, 280, 420, 580, 740, 880, 1000]);
  const BOSS_PROFILES = Object.freeze([
    Object.freeze({ wave: 5, id: "corpse_king", name: "尸王", enemyType: "zombie", mechanic: "summon", color: 0x4f6d3d, hpMultiplier: 6.3 }),
    Object.freeze({ wave: 10, id: "doom_keeper", name: "末日守卫", enemyType: "keeper", mechanic: "doom", color: 0x241b20, hpMultiplier: 18 }),
    Object.freeze({ wave: 15, id: "corrupted_colossus", name: "腐化巨像", enemyType: "keeper", mechanic: "siege", color: 0x655040, hpMultiplier: 10.5 }),
    Object.freeze({ wave: 20, id: "ghost_queen", name: "幽灵女王", enemyType: "ghost", mechanic: "phase", color: 0x7995a8, hpMultiplier: 13.2 }),
    Object.freeze({ wave: 25, id: "vampire_lord", name: "吸血领主", enemyType: "vampire", mechanic: "lifesteal", color: 0x682b35, hpMultiplier: 16.5 }),
    Object.freeze({ wave: 30, id: "swift_lord", name: "迅捷领主", enemyType: "skeleton", mechanic: "dash", color: 0x897557, hpMultiplier: 8.1 }),
  ]);

  const WAVE_ARCHETYPES = Object.freeze([
    "normal", "fast", "heavy", "mixed", "boss",
    "siege", "elite", "heavy", "lifesteal", "finale",
  ]);

  function clampInt(value, min, max) {
    const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min;
    return Math.max(min, Math.min(max, number));
  }

  function wallProgress(level) {
    const safeLevel = clampInt(level, 1, Number.MAX_SAFE_INTEGER);
    const tier = Math.min(WALL_TIERS.length - 1, Math.floor((safeLevel - 1) / 10));
    return { level: safeLevel, tier, minor: ((safeLevel - 1) % 10) + 1, name: WALL_TIERS[tier].name };
  }

  function wallUpgradeCost(level) {
    const progress = wallProgress(level);
    const base = 10 + progress.level * 2.4 + progress.tier * 18;
    if (progress.level < 50) return Math.ceil(base);
    const obsidianBase = 10 + 49 * 2.4 + (WALL_TIERS.length - 1) * 18;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(obsidianBase * Math.pow(1.55, progress.level - 49)));
  }

  function researchCost(lineId, currentLevel, levelCap) {
    const line = RESEARCH_LINES[lineId];
    if (!line) throw new RangeError(`unknown research line: ${lineId}`);
    const cap = clampInt(levelCap == null ? line.maxLevel : levelCap, line.maxLevel, Number.MAX_SAFE_INTEGER);
    const level = clampInt(currentLevel, 0, cap);
    return level >= cap ? null : Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(line.baseCost * Math.pow(1.42, level)));
  }

  function breakthroughCost(id, currentLevel) {
    const research = BREAKTHROUGH_RESEARCH[id];
    if (!research) throw new RangeError(`unknown breakthrough: ${id}`);
    const level = clampInt(currentLevel, 0, Number.MAX_SAFE_INTEGER);
    return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(research.baseCost * Math.pow(research.growth, level)));
  }

  function mineBuildLimit(level) {
    return 5 + clampInt(level, 0, Number.MAX_SAFE_INTEGER);
  }

  function researchLevelCap(level) {
    return 10 + clampInt(level, 0, Number.MAX_SAFE_INTEGER) * 10;
  }

  function wallLevelCap(level) {
    return 50 + clampInt(level, 0, Number.MAX_SAFE_INTEGER) * 10;
  }

  function turretLevelCap(level) {
    return 5 + clampInt(level, 0, Number.MAX_SAFE_INTEGER) * 5;
  }

  function predictInterceptPoint({ shooter, target, velocity, projectileSpeed, maxLeadTime = 3 }) {
    const sx = Number(shooter && shooter.x) || 0, sz = Number(shooter && shooter.z) || 0;
    const tx = Number(target && target.x) || 0, tz = Number(target && target.z) || 0;
    const vx = Number(velocity && velocity.x) || 0, vz = Number(velocity && velocity.z) || 0;
    const speed = Math.max(0, Number(projectileSpeed) || 0);
    if (speed <= 0) return { x: tx, z: tz, time: 0 };
    const rx = tx - sx, rz = tz - sz;
    const a = vx * vx + vz * vz - speed * speed;
    const b = 2 * (rx * vx + rz * vz);
    const c = rx * rx + rz * rz;
    let time = 0;
    if (Math.abs(a) < 1e-8) {
      if (Math.abs(b) > 1e-8) time = -c / b;
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        const first = (-b - root) / (2 * a), second = (-b + root) / (2 * a);
        const candidates = [first, second].filter((value) => value > 0);
        if (candidates.length) time = Math.min(...candidates);
      }
    }
    if (!(time > 0)) return { x: tx, z: tz, time: 0 };
    time = Math.min(time, Math.max(0, Number(maxLeadTime) || 0));
    return { x: tx + vx * time, z: tz + vz * time, time };
  }

  function bossProfile(wave) {
    const safeWave = clampInt(wave, 1, Number.MAX_SAFE_INTEGER);
    if (safeWave === 5 || safeWave === 10) return BOSS_PROFILES.find((boss) => boss.wave === safeWave) || null;
    if (safeWave <= CAMPAIGN_WAVES || safeWave % 5 !== 0) return null;
    const cycle = Math.floor((safeWave - 5) / 5) % BOSS_PROFILES.length;
    const extra = Math.pow(1.1, safeWave - CAMPAIGN_WAVES);
    return Object.freeze({ ...BOSS_PROFILES[cycle], wave: safeWave, hpMultiplier: BOSS_PROFILES[cycle].hpMultiplier * extra });
  }

  function waveProfile(wave) {
    const safeWave = clampInt(wave, 1, Number.MAX_SAFE_INTEGER);
    const isEndless = safeWave > CAMPAIGN_WAVES;
    const campaignIndex = Math.min(CAMPAIGN_WAVES, safeWave) - 1;
    const archetype = isEndless
      ? (safeWave % 5 === 0 ? "finale" : WAVE_ARCHETYPES[(safeWave - 1) % CAMPAIGN_WAVES])
      : WAVE_ARCHETYPES[campaignIndex];
    const tuning = {
      normal: [1, 1, 1.05, 0], fast: [1.45, 0.58, 1.35, 0], heavy: [0.43, 2.45, 0.9, 0.24],
      ranged: [0.78, 1.05, 1, 0.06], ghost: [0.82, 0.92, 1.18, 0.12], lifesteal: [0.72, 1.28, 1.05, 0.14],
      siege: [0.58, 1.3, 0.88, 0.3], mixed: [1.12, 1.08, 1.05, 0.08], elite: [0.68, 1.75, 0.98, 0.22],
      boss: [0.78, 1.7, 0.95, 0.2], finale: [0.7, 1.85, 0.92, 0.26],
    }[archetype] || [1, 1, 1, 0];
    const campaignWave = Math.min(CAMPAIGN_WAVES, safeWave);
    const endlessScale = isEndless ? Math.pow(1.1, safeWave - CAMPAIGN_WAVES) : 1;
    const hpStage = campaignWave <= 3 ? 1 : Math.pow(1.22, campaignWave - 3);
    const damageStage = campaignWave <= 3 ? 1 : Math.pow(1.16, campaignWave - 3);
    const count = Math.max(1, Math.round(CAMPAIGN_COUNTS[campaignIndex] * endlessScale));
    const giantChance = campaignWave <= 3 ? 0
      : campaignWave <= 6 ? 0.14
      : campaignWave <= 9 ? 0.26
      : 0.42;
    const finaleHp = 1.85 * Math.pow(1.025, CAMPAIGN_WAVES - 1) * Math.pow(1.22, CAMPAIGN_WAVES - 3);
    const finaleDamage = (1 + (CAMPAIGN_WAVES - 1) * 0.015) * Math.pow(1.16, CAMPAIGN_WAVES - 3);
    return Object.freeze({
      wave: safeWave,
      archetype,
      label: ({ normal: "尸潮", fast: "疾行", heavy: "重装", ranged: "远程", ghost: "幽灵", lifesteal: "吸血", siege: "攻城", mixed: "混合", elite: "精英", boss: "首领", finale: "终焉" })[archetype],
      count,
      hpMultiplier: isEndless
        ? finaleHp * endlessScale
        : tuning[1] * Math.pow(1.025, campaignWave - 1) * hpStage,
      damageMultiplier: isEndless
        ? finaleDamage * endlessScale
        : (1 + (campaignWave - 1) * 0.015) * damageStage,
      speedMultiplier: tuning[2] * Math.min(1.15, 1 + (campaignWave - 1) * 0.005),
      armor: tuning[3],
      spawnInterval: 0,
      spawnBatch: campaignWave <= 3 ? count : (campaignWave >= 10 || isEndless ? 48 : 36),
      activeCap: Number.MAX_SAFE_INTEGER,
      giantChance,
      isBoss: archetype === "boss" || archetype === "finale",
      isEndless,
      boss: (archetype === "boss" || archetype === "finale") ? bossProfile(safeWave) : null,
    });
  }

  function repairQuote({ missingHp, availableGold, self }) {
    if (self) return { hp: 0, gold: 0 };
    const missing = Math.max(0, Number(missingHp) || 0);
    const gold = Math.max(0, Math.floor(Number(availableGold) || 0));
    const hp = Math.min(missing, gold * 10);
    return { hp, gold: Math.ceil(hp / 10) };
  }

  function turretPressureMultiplier(type, isBoss = false) {
    if (isBoss) return 0.45;
    return ({ normal: 0.82, fast: 0.9, heavy: 0.58, sniper: 0.76, ghost: 0.74,
      lifesteal: 0.66, siege: 0.5, elite: 0.6 })[type] || 0.72;
  }

  function formationSlots(count, target, spacing = 2.4) {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    if (!total) return [];
    const columns = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / columns);
    const slots = [];
    for (let index = 0; index < total; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      slots.push({
        x: target.x + (column - (columns - 1) / 2) * spacing,
        z: target.z + (row - (rows - 1) / 2) * spacing,
      });
    }
    return slots;
  }

  function formationSlotsForRadii(radii, target, options = {}) {
    const safeRadii = (Array.isArray(radii) ? radii : [])
      .map((radius) => Math.max(0.1, Number(radius) || 0.1));
    if (!safeRadii.length) return [];
    const padding = Math.max(0, Number(options.padding) || 0);
    const spacing = Math.max(...safeRadii) * 2 + padding;
    return formationSlots(safeRadii.length, target, spacing);
  }

  function resolveSolidCircles(agents, options = {}) {
    const result = (Array.isArray(agents) ? agents : []).map((agent, index) => ({
      ...agent,
      x: Number(agent && agent.x) || 0,
      z: Number(agent && agent.z) || 0,
      radius: Math.max(0.1, Number(agent && agent.radius) || 0.1),
      id: Number(agent && agent.id) || index + 1,
      movable: agent && agent.movable !== false,
    }));
    const iterations = clampInt(options.iterations == null ? 5 : options.iterations, 1, 16);
    const compression = Math.max(0.85, Math.min(1, Number(options.compression) || 1));
    const maxStep = Math.max(0.05, Number(options.maxStep) || 4);
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let left = 0; left < result.length; left++) for (let right = left + 1; right < result.length; right++) {
        const a = result[left], b = result[right];
        if (!a.movable && !b.movable) continue;
        const desired = (a.radius + b.radius) * compression;
        let dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
        if (distance >= desired) continue;
        if (distance < 1e-6) {
          const angle = ((a.id * 47 + b.id * 113) % 360) * Math.PI / 180;
          dx = Math.cos(angle); dz = Math.sin(angle); distance = 1;
        }
        const correction = Math.min(maxStep, desired - distance);
        const nx = dx / distance, nz = dz / distance;
        const aShare = a.movable ? (b.movable ? 0.5 : 1) : 0;
        const bShare = b.movable ? (a.movable ? 0.5 : 1) : 0;
        a.x -= nx * correction * aShare; a.z -= nz * correction * aShare;
        b.x += nx * correction * bShare; b.z += nz * correction * bShare;
      }
    }
    return result;
  }

  function separateHordeCircles(agents, options = {}) {
    const result = (Array.isArray(agents) ? agents : []).map((agent, index) => ({
      ...agent,
      x: Number(agent && agent.x) || 0,
      z: Number(agent && agent.z) || 0,
      radius: Math.max(0.1, Number(agent && agent.radius) || 0.1),
      id: Number(agent && agent.id) || index + 1,
    }));
    const iterations = clampInt(options.iterations == null ? 3 : options.iterations, 1, 8);
    const compression = Math.max(0.75, Math.min(1, Number(options.compression) || 0.92));
    const maxStep = Math.max(0.05, Number(options.maxStep) || 1.5);
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let left = 0; left < result.length; left++) for (let right = left + 1; right < result.length; right++) {
        const a = result[left], b = result[right], desired = (a.radius + b.radius) * compression;
        let dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
        if (distance >= desired) continue;
        if (distance < 1e-6) {
          const angle = ((a.id * 37 + b.id * 101) % 360) * Math.PI / 180;
          dx = Math.cos(angle); dz = Math.sin(angle); distance = 1;
        }
        const correction = Math.min(maxStep, (desired - distance) * 0.5), nx = dx / distance, nz = dz / distance;
        a.x -= nx * correction; a.z -= nz * correction;
        b.x += nx * correction; b.z += nz * correction;
      }
    }
    return result;
  }

  function turretVisualScale(level) {
    const safe = Math.max(1, Number(level) || 1);
    return Math.min(1.28, 1 + Math.min(4, safe - 1) * 0.04 + Math.sqrt(Math.max(0, safe - 5)) * 0.012);
  }

  function wallVisualScale(level) {
    const safe = Math.max(1, Number(level) || 1), tierProgress = Math.min(49, safe - 1) / 49;
    return Math.min(1.18, 1 + tierProgress * 0.12 + Math.sqrt(Math.max(0, safe - 50)) * 0.004);
  }

  function hordeCollisionRadius(visualRadius, isBoss = false) {
    const radius = Math.max(0.1, Number(visualRadius) || 0.1);
    /* 人形尸潮按肩宽而非整块模型包围盒碰撞；Boss 保留更大的压迫边界。 */
    return Number((radius * (isBoss ? 0.72 : 0.58)).toFixed(3));
  }

  function bloodMistOpacity(wave, visibleEnemies) {
    const safeWave = Math.max(0, Number(wave) || 0);
    const crowd = Math.max(0, Number(visibleEnemies) || 0);
    if (safeWave <= 0 || crowd <= 0) return 0;
    return Math.min(0.22, 0.035 + Math.min(0.075, safeWave * 0.003) + Math.min(0.11, crowd * 0.0022));
  }

  function createWaveTransition(nextWave, durationSeconds = 1.8) {
    return Object.freeze({
      nextWave: clampInt(nextWave, 1, Number.MAX_SAFE_INTEGER),
      remaining: Math.max(0, Number(durationSeconds) || 0),
      ready: !(Number(durationSeconds) > 0),
      consumed: false,
    });
  }

  function tickWaveTransition(transition, deltaSeconds) {
    if (!transition || transition.consumed || transition.ready) return transition;
    const remaining = Math.max(0, transition.remaining - Math.max(0, Number(deltaSeconds) || 0));
    return Object.freeze({ ...transition, remaining, ready: remaining <= 0 });
  }

  function rangeFromCurve(curve, level) {
    if (!curve) throw new RangeError("unknown range curve");
    const progress = clampInt(level, 0, 10) / 10;
    return curve.base + (curve.max - curve.base) * progress;
  }

  function rangeAtResearchLevel(type, level) {
    const curve = TURRET_RANGE_CURVES[type];
    if (!curve) throw new RangeError(`unknown turret range: ${type}`);
    return rangeFromCurve(curve, level);
  }

  function friendlyRangeAtResearchLevel(type, level) {
    const curve = FRIENDLY_RANGE_CURVES[type];
    if (!curve) throw new RangeError(`unknown friendly range: ${type}`);
    return rangeFromCurve(curve, level);
  }

  function isPointVisible(point, sources) {
    if (!point || !Array.isArray(sources)) return false;
    return sources.some((source) => {
      const radius = Math.max(0, Number(source && source.radius) || 0);
      const dx = Number(point.x) - Number(source && source.x);
      const dz = Number(point.z) - Number(source && source.z);
      return Number.isFinite(dx) && Number.isFinite(dz) && dx * dx + dz * dz <= radius * radius;
    });
  }

  return Object.freeze({
    WALL_TIERS,
    NIGHT_VISUALS,
    VISION_RULES,
    MEDICAL_BEACON_RULES,
    PROJECTILE_VISUALS,
    TURRET_RANGE_CURVES,
    FRIENDLY_RANGE_CURVES,
    RESEARCH_LINES,
    BREAKTHROUGH_RESEARCH,
    MINE_ECONOMY,
    FRIENDLY_UNIT_TYPES,
    TURRET_BRANCHES,
    CAMPAIGN_WAVES,
    CAMPAIGN_COUNTS,
    BOSS_PROFILES,
    WAVE_ARCHETYPES,
    ENEMY_MOVEMENT,
    enemyMoveSpeed,
    enemyRunTimeScale,
    structureAttackCapacity,
    ZOMBIE_COMBAT_SCALE,
    WALL_ASSAULT_REFERENCE,
    meleeWaveMultiplier,
    wallProgress,
    wallUpgradeCost,
    researchCost,
    breakthroughCost,
    mineBuildLimit,
    researchLevelCap,
    wallLevelCap,
    turretLevelCap,
    predictInterceptPoint,
    mineBuildCost,
    mineUpgradeCost,
    mineIncome,
    bossProfile,
    waveProfile,
    repairQuote,
    turretPressureMultiplier,
    formationSlots,
    formationSlotsForRadii,
    resolveSolidCircles,
    separateHordeCircles,
    turretVisualScale,
    wallVisualScale,
    hordeCollisionRadius,
    bloodMistOpacity,
    createWaveTransition,
    tickWaveTransition,
    rangeAtResearchLevel,
    friendlyRangeAtResearchLevel,
    isPointVisible,
  });
});

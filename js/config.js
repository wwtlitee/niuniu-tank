/* =====================================================================
   js/config.js —— 游戏模式配置（经典 / 高台生存 / 塔防）
   在 engine.js 之前加载，提供 window.GAME_MODES / window.TURRET_TYPES
   与当前激活模式 ACTIVE_MODE
   ===================================================================== */
"use strict";

/* ---------------------------------------------------------------------
 * 炮台类型表（数据驱动，生存 + 塔防模式共用）
 * ------------------------------------------------------------------- */
const TURRET_MAX_LEVEL = 5;
const TURRET_UPGRADE_COST_GROWTH = 1.6;
const TURRET_TYPES = {
  turret: {
    id: "turret", name: "标准炮台", desc: "常规炮台，可选择四个专精分支。", cost: 70, color: 0x8b8170,
    stats: { dmg: 1.1, fireRate: 1.4, range: SurvivalSystem.rangeAtResearchLevel("turret",0), splash: 0, slow: 0, pierce: 0 }, upgrade: [],
  },
};
function turretBranchUpgradeSteps(id, stats) {
  const steps = {
    rapid: [
      { dmg: 1.38, fireRate: 3.9 },
      { dmg: 1.56, fireRate: 4.3 },
      { dmg: 1.78, fireRate: 4.8 },
      { dmg: 2.1, fireRate: 5.65 },
    ],
    cannon: [
      { dmg: 2.15, fireRate: .59, splash: 4.7 },
      { dmg: 2.55, fireRate: .63, splash: 5.2 },
      { dmg: 3.1, fireRate: .67, splash: 5.7 },
      { dmg: 4, fireRate: .72, splash: 6.3 },
    ],
    antitank: [
      { dmg: 2.2, fireRate: .41, pierce: .7 },
      { dmg: 2.7, fireRate: .44, pierce: .75 },
      { dmg: 3.3, fireRate: .47, pierce: .81 },
      { dmg: 4.2, fireRate: .5, pierce: .88 },
    ],
    emp: [
      { dmg: 1.45, fireRate: .85 },
      { dmg: 1.75, fireRate: .9 },
      { dmg: 2.15, fireRate: .95 },
      { dmg: 2.65, fireRate: 1 },
    ],
  };
  return steps[id] || [
    { dmg: Math.round(stats.damage * 1.2), fireRate: stats.fireRate * 1.08 },
    { dmg: Math.round(stats.damage * 1.45), fireRate: stats.fireRate * 1.16 },
    { dmg: Math.round(stats.damage * 1.75), fireRate: stats.fireRate * 1.25 },
    { dmg: Math.round(stats.damage * 2.1), fireRate: stats.fireRate * 1.35 },
  ];
}
for (const [id, branch] of Object.entries(SurvivalSystem.TURRET_BRANCHES)) {
  const stats = branch.stats;
  TURRET_TYPES[id] = {
    id, name: branch.name, desc: id==="antitank"?"远程单体 · 基础忽略65%护甲 · 对重甲(≥18%护甲)/Boss命中伤害×2.8":id==="emp"?"贯穿射线 · 命中射线沿途所有敌人":id==="cannon"?"低射速范围爆炸 · 压制密集尸群":"高速单体射击 · 持续输出", cost: 70, color: branch.color,
    stats: { dmg: stats.damage, fireRate: stats.fireRate, range: SurvivalSystem.rangeAtResearchLevel(id,0), splash: stats.splash,
      slow: stats.slow, stun: stats.stun, pierce: stats.armorPierce },
    upgrade: turretBranchUpgradeSteps(id, stats),
  };
}

/* ---------------------------------------------------------------------
 * 科技树配置（生存模式专属，金币分支投资）
 *  - branches：分支表，level 表示当前档位（0 = 未解锁）
 *  - baseCost × growth^level 即下一档成本
 *  - requires：前置依赖（其它分支需达到的最低档位）
 * ------------------------------------------------------------------- */
const TECH_ICONS = { defense: "shield", turret: "turret", tank: "tank", economy: "coin" };
const TECH_DESCRIPTIONS = {
  defense: "墙体与大门生命、护甲", turret: "炮台伤害、射速与射程",
  tank: "坦克伤害、生命与移速", economy: "金矿收入、建造折扣与人口",
};
const TECH_TREE = Object.fromEntries(Object.entries(SurvivalSystem.RESEARCH_LINES).map(([id, line]) => [id, {
  ...line, icon: TECH_ICONS[id], desc: TECH_DESCRIPTIONS[id], growth: 1.42, requires: {},
}]));

/* ---------------------------------------------------------------------
 * 经典模式：Battle City 风格 1:1 复刻地图池（随机选用一张）
 *  - 每张 13×13，字符：'.'=空 'B'=砖 'S'=钢 'W'=水 'T'=树 'E'=鹰旗(玩家基地)
 *  - 首行留空作敌军入口；末两行固定鹰旗砖堡（E 用可破砖墙包裹，符合原版可战败）
 * ------------------------------------------------------------------- */
const CLASSIC_MAPS = [
  /* 1 初阵：开阔 + 稀疏砖点 */
  [
    ".............",
    ".............",
    "..B.......B..",
    ".............",
    "....B...B....",
    ".B..B.B.B..B.",
    ".....B.B.....",
    ".B..B.B.B..B.",
    "....B...B....",
    ".............",
    "..B.......B..",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 2 双子铜墙：砖块阵列 + 钢翼 */
  [
    ".............",
    ".SS.....SS...",
    ".BB.....BB...",
    ".............",
    "..S.....S....",
    ".....BBB.....",
    "..B.......B..",
    ".....BBB.....",
    "..S.....S....",
    ".............",
    ".BB.....BB...",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 3 钢铁丛林：钢格迷宫，空行作通路 */
  [
    ".............",
    "..S.S.S.S.S..",
    ".............",
    ".B.B.B.B.B.B.",
    ".............",
    ".S.S.S.S.S.S.",
    ".............",
    ".B.B.B.B.B.B.",
    ".............",
    ".S.S.S.S.S.S.",
    ".............",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 4 河岸防线：中央水道逼敌军绕行侧翼 */
  [
    ".............",
    ".....BBB.....",
    "..B.......B..",
    ".....WWW.....",
    "..B.......B..",
    ".....WWW.....",
    "..B.......B..",
    ".....WWW.....",
    "..B.......B..",
    ".....BBB.....",
    ".............",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 5 密林游击：树丛伪装 + 砖墙掩体 */
  [
    ".............",
    ".T.T.T.T.T.T.",
    ".............",
    ".T.B.B.B.B.T.",
    ".T........T..",
    ".T.BB.BB.B.T.",
    ".T.BB.BB.B.T.",
    ".T.BB.BB.B.T.",
    ".T........T..",
    ".T.B.B.B.B.T.",
    ".T.T.T.T.T.T.",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 6 回廊迷宫：砖柱廊 + 竖缝通路 */
  [
    ".............",
    ".BB.BB.BB.BB.",
    ".............",
    ".BB.BB.BB.BB.",
    ".............",
    ".BB.BB.BB.BB.",
    ".............",
    ".BB.BB.BB.BB.",
    ".............",
    ".BB.BB.BB.BB.",
    ".............",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 7 十字堡垒：砖堡 + 钢芯 + 侧翼通路 */
  [
    ".............",
    ".....BBB.....",
    ".....B.B.....",
    ".....B.B.....",
    ".BB.B...B.BB.",
    ".B.......B...",
    ".B...S...B...",
    ".B.......B...",
    ".BB.B...B.BB.",
    ".....B.B.....",
    ".....B.B.....",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 8 工事交错：钢砖棋盘格 + 平层通路 */
  [
    ".............",
    ".S.B.S.B.S.B.",
    ".B.S.B.S.B.S.",
    ".............",
    ".S.B.S.B.S.B.",
    ".B.S.B.S.B.S.",
    ".....S.S.....",
    ".B.S.B.S.B.S.",
    ".S.B.S.B.S.B.",
    ".............",
    ".B.S.B.S.B.S.",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 9 水池庭院：中央水院 + 左翼通路 */
  [
    ".............",
    "..B.....B....",
    "..B.WWW.B....",
    "..B.W.W.B....",
    "....W.W......",
    "..B.WWW.B....",
    "..B.....B....",
    ".....BBB.....",
    "..B.B.B.B.B..",
    ".............",
    "..B.....B....",
    ".....BBB.....",
    ".....BEB.....",
  ],
  /* 10 终极防线：密集钢砖混合 */
  [
    ".............",
    ".SS.BB.SS.BB.",
    ".BB.SS.BB.SS.",
    ".............",
    ".SS.BB.SS.BB.",
    ".BB.SS.BB.SS.",
    ".....BBB.....",
    ".BB.SS.BB.SS.",
    ".SS.BB.SS.BB.",
    ".............",
    ".SS.BB.SS.BB.",
    ".....BBB.....",
    ".....BEB.....",
  ],
];

const GAME_MODES = {
  /* ---- 经典模式：小地图 + 高密度障碍 + 无构筑，纯波次防守肉鸽 ---- */
  classic: {
    key: "classic",
    name: "经典巷战",
    tagline: "坦克肉鸽 · 全局俯视 · 守护鹰旗",
    icon: "base",
    color: "#ffd75e",
    mapType: "city",
    GRID: 15,                       /* BC 原版 13×13 布局 + 1 格钢边框，1:1 复刻 */
    streets: [3, 7, 11],
    density: null,                  /* 经典走固定 BC 地图，不再程序化生成 */
    buildEnabled: false,
    cameraY: 26, cameraZ: 18,
    fogFar: 140,
    prepTime: 0,
    victoryWave: 0,
    enemiesPerWave: n => 4 + n,
    spawnCap: wave => Math.min(4 + Math.floor(wave / 2), 7),
    spawnInterval: wave => Math.max(1.4, 3.4 - wave * .12),
    hpScale: 1,
    difficultyScale: wave => 1 + wave * .08,
    goldStart: 0,
    buildTimer: 0,
  },

  /* ---- 基地防守 RTS（v3 重做）：无英雄坦克 · 基地左下 · 单门大门 · 多口汇流 ---- */
  survival: {
    key: "survival",
    name: "基地防守",
    tagline: "RTS 建造 · 单门死守 · 科技解锁",
    icon: "base",
    color: "#7ec8ff",
    mapType: "survival",
    GRID: 24,
    buildEnabled: true,
    cameraY: 36, cameraZ: 28,
    /* 开场看向高台东沿/谷口，基地在画面左上，不贴着司令部。 */
    startFocus: { col: 8, row: 17 },
    fogFar: 110,
    prepTime: 30,
    victoryWave: 10,
    enemiesPerWave: wave => SurvivalSystem.waveProfile(wave).count,
    spawnCap: () => Number.MAX_SAFE_INTEGER,
    spawnInterval: wave => SurvivalSystem.waveProfile(wave).spawnInterval,
    hpScale: 1,
    difficultyScale: wave => SurvivalSystem.waveProfile(wave).hpMultiplier,
    endlessScale: wave => wave <= 10 ? 1 : Math.pow(1.1, wave - 10),
    goldStart: 460,
    buildTimer: 0,
    // GRID=24。峡谷只切进高台 1 格宽 × 3 格长；外面是平地。尸潮统一从上方进入。
    base: { col: 6, row: 15, gateCol: 6, gateRow: 15 },
    ramp: { col: 10, row: 18 },
    enclosure: { x0: 1, x1: 13, z0: 11, z1: 22 },
    canyon: { x0: 11, x1: 13, z0: 18, z1: 18 },
    spawns: [ {x: 3, z: 3}, {x: 20, z: 3} ],
    economy: {
      /* v6.2.2：基础矿固定70；五次升级价格×4、收益×5。 */
      mineCost: SurvivalSystem.MINE_ECONOMY.baseCost,
      mineIncomeTiers: SurvivalSystem.MINE_ECONOMY.incomeTiers,
      mineMaxLevel: SurvivalSystem.MINE_ECONOMY.maxLevel,
      waveClearBonus: wave => 14 + wave * 2,
      houseCost: 60, housePop: 6,                   // 人口房：+人口上限
      startPop: 12,                                   // 初始人口上限
      killGold: 0.65,                                 // 高密尸潮按小额残骸回收，防止后期经济失效
      bossGold: 45,
      repairHpPerGold: 10,
    },
    // 大门成长树（唯一入口：血量/护甲 + 反伤/恢复/闪避 被动）
    gate: {
      hp: 600, hpPerLv: 220, maxHpLv: 6,
      armorPerLv: 0.06, maxArmorLv: 5,               // 每级减伤 6%
      thornsPerLv: 0.12, maxThornsLv: 5,             // 每级反伤 12%
      regenPerLv: 10, maxRegenLv: 5,                 // 每级每秒回血 10
      dodgePerLv: 0.04, maxDodgeLv: 5,               // 每级 4% 闪避
    },
    turretTypes: ["turret"],
    techTree: ["defense", "turret", "tank", "economy"],

    /* ---- 生存模式建筑表（WAR3 式建造面板）：金币建造，人口限制部队规模 ---- */
    // kind: econ / wall / turret / research / factory；pop 为占用人口。
    SURVIVAL_BUILDS: [
      {id:"goldmine",  icon:"mine", name:"金矿",   price:70,  pop:0, kind:"econ", footprint:[1,1], desc:"每秒产金 · 可升级 Lv1~6"},
      {id:"house",     icon:"house", name:"人口房", price:50,  pop:0, kind:"econ", footprint:[1,1], desc:"+6 人口上限"},
      {id:"research",  icon:"research", name:"研究院", price:180, pop:0, kind:"research", footprint:[2,2], maxCount:1, desc:"集中升级防御、炮台、坦克和经济科技"},
      {id:"heroHub", icon:"base", name:"英雄枢纽",price:800,pop:0,kind:"heroHub",footprint:[2,2],maxCount:1,desc:"生产唯一英雄，学习九种自动武器与支援技能"},
      {id:"factory",   icon:"factory", name:"重工厂", price:240, pop:0, kind:"factory", footprint:[2,2], maxCount:1, desc:"生产轻型、中型、重型常规坦克"},
      {id:"beacon",    icon:"health", name:"医疗灯塔", price:45,  pop:2, kind:"beacon", footprint:[1,1], desc:"占2人口 · 修复范围内所有友方建筑、坦克、英雄和基地 · 多塔叠加封顶10%/秒 · 可升至Lv5"},
      {id:"turret",    icon:"turret", name:"标准炮台", price:90, pop:2, kind:"turret", footprint:[1,1], turret:"turret", desc:"阵地支援火力 · 需与坦克和巨岩墙协同"},
      {id:"wall",      icon:"wall", name:"闸门墙", price:12, pop:0, kind:"wall", footprint:[1,1], desc:"共50级 · 门模型拉宽堵住 1 格峡谷口"},
    ],
  },

  /* ---- 塔防模式：固定路径刷怪 + 摆塔 + 坦克位升级（占位） ---- */
  td: {
    key: "td",
    name: "塔防阵地",
    tagline: "固定路径 · 摆塔设伏 · 坦克位升级",
    icon: "turret",
    color: "#39d98a",
    mapType: "td",
    GRID: 31,
    streets: [5, 15, 25],
    density: null,
    buildEnabled: false,
    cameraY: 44, cameraZ: 32,
    fogFar: 140,
    prepTime: 0,
    victoryWave: 0,
    enemiesPerWave: n => 6 + n * 2,
    spawnCap: () => 10,
    spawnInterval: () => 1.6,
    hpScale: 1,
    goldStart: 200,
    buildTimer: 0,
    turretTypes: ["turret", "rapid", "cannon", "antitank", "emp"],
  },
};

/* 当前激活模式（由 home.js 在进入模式前设置） */
let ACTIVE_MODE = GAME_MODES.classic;

function setActiveMode(key) {
  ACTIVE_MODE = GAME_MODES[key] || GAME_MODES.classic;
  return ACTIVE_MODE;
}

/* 暴露给 engine.js / home.js */
window.GAME_MODES = GAME_MODES;
window.TURRET_TYPES = TURRET_TYPES;
window.TECH_TREE = TECH_TREE;
window.CLASSIC_MAPS = CLASSIC_MAPS;
window.SURVIVAL_BUILDS = GAME_MODES.survival.SURVIVAL_BUILDS;
window.setActiveMode = setActiveMode;

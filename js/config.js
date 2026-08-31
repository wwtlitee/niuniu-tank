/* =====================================================================
   js/config.js —— 游戏模式配置（经典 / 高台生存 / 塔防）
   在 engine.js 之前加载，提供 window.GAME_MODES / window.TURRET_TYPES
   与当前激活模式 ACTIVE_MODE
   ===================================================================== */
"use strict";

/* ---------------------------------------------------------------------
 * 炮台类型表（数据驱动，生存 + 塔防模式共用）
 * ------------------------------------------------------------------- */
const TURRET_TYPES = {
  mg: {
    id: "mg",
    name: "机枪塔",
    desc: "廉价单体持续 DPS，开局主力。",
    cost: 50,
    color: 0xffd166,
    stats: { dmg: 6, fireRate: 5, range: 14, splash: 0, slow: 0, pierce: 0 },
    upgrade: [
      { dmg: 9, fireRate: 7, range: 14 },
      { dmg: 13, fireRate: 9, range: 16, pierce: 1 },
    ],
  },
  cannon: {
    id: "cannon",
    name: "加农炮塔",
    desc: "AoE 溅射，清群利器。",
    cost: 90,
    color: 0xff8b3d,
    stats: { dmg: 18, fireRate: 1, range: 16, splash: 4, slow: 0, pierce: 0 },
    upgrade: [
      { dmg: 26, fireRate: 1.1, range: 18, splash: 5 },
      { dmg: 36, fireRate: 1.2, range: 20, splash: 6 },
    ],
  },
  frost: {
    id: "frost",
    name: "冰冻塔",
    desc: "范围减速，控制敌军推进节奏。",
    cost: 80,
    color: 0x6ad7ff,
    stats: { dmg: 3, fireRate: 2, range: 13, splash: 0, slow: 0.35, pierce: 0 },
    upgrade: [
      { dmg: 5, fireRate: 2.5, range: 15, slow: 0.5 },
      { dmg: 8, fireRate: 3, range: 17, slow: 0.65, splash: 3 },
    ],
  },
  sniper: {
    id: "sniper",
    name: "狙击塔",
    desc: "超远射程、高单体，打重装/精英。",
    cost: 120,
    color: 0xf2f2f2,
    stats: { dmg: 40, fireRate: 0.6, range: 30, splash: 0, slow: 0, pierce: 0 },
    upgrade: [
      { dmg: 60, fireRate: 0.7, range: 34 },
      { dmg: 90, fireRate: 0.85, range: 38, pierce: 1 },
    ],
  },
  pulse: {
    id: "pulse",
    name: "脉冲塔",
    desc: "AoE 眩晕，打断敌军阵型。",
    cost: 140,
    color: 0xc084fc,
    stats: { dmg: 10, fireRate: 0.5, range: 12, splash: 0, slow: 0, stun: 1.2, pierce: 0 },
    upgrade: [
      { dmg: 14, fireRate: 0.6, range: 14, stun: 1.6, splash: 3 },
      { dmg: 20, fireRate: 0.7, range: 16, stun: 2.0, splash: 4 },
    ],
  },
  tesla: {
    id: "tesla",
    name: "电磁塔",
    desc: "连锁闪电，多目标压制。",
    cost: 130,
    color: 0x8be9fd,
    stats: { dmg: 14, fireRate: 1.5, range: 15, splash: 0, slow: 0, chain: 3, pierce: 0 },
    upgrade: [
      { dmg: 20, fireRate: 1.7, range: 17, chain: 4 },
      { dmg: 28, fireRate: 1.9, range: 19, chain: 5 },
    ],
  },
};

/* ---------------------------------------------------------------------
 * 科技树配置（生存模式专属，金币分支投资）
 *  - branches：分支表，level 表示当前档位（0 = 未解锁）
 *  - baseCost × growth^level 即下一档成本
 *  - requires：前置依赖（其它分支需达到的最低档位）
 * ------------------------------------------------------------------- */
const TECH_TREE = {
  A: {
    id: "A",
    name: "经济工程",
    desc: "金矿产金效率 / 造价优惠",
    icon: "💰",
    maxLevel: 5,
    baseCost: 80,
    growth: 1.55,
    effect: { goldIncomePct: 0.12, buildCostPct: -0.08 },
    requires: {},
  },
  B: {
    id: "B",
    name: "武器研发",
    desc: "全体炮台伤害加成",
    icon: "⚔️",
    maxLevel: 5,
    baseCost: 100,
    growth: 1.6,
    effect: { turretDmgPct: 0.10 },
    requires: {},
  },
  C: {
    id: "C",
    name: "精准制导",
    desc: "全体炮台射程加成",
    icon: "🎯",
    maxLevel: 4,
    baseCost: 90,
    growth: 1.55,
    effect: { turretRangePct: 0.08 },
    requires: { B: 1 },
  },
  D: {
    id: "D",
    name: "弹药供给",
    desc: "全体炮台射速加成",
    icon: "📦",
    maxLevel: 4,
    baseCost: 90,
    growth: 1.55,
    effect: { turretFireRatePct: 0.09 },
    requires: { B: 2 },
  },
  E: {
    id: "E",
    name: "寒冰科技",
    desc: "冰冻塔减速 / 冰伤强化",
    icon: "❄️",
    maxLevel: 3,
    baseCost: 110,
    growth: 1.5,
    effect: { frostSlowPct: 0.10, frostDmgPct: 0.08 },
    requires: {},
  },
  F: {
    id: "F",
    name: "装甲强化",
    desc: "玩家坦克血量 / 核心血量",
    icon: "🛡",
    maxLevel: 4,
    baseCost: 100,
    growth: 1.6,
    effect: { playerHpPct: 0.10, coreHpPct: 0.10 },
    requires: {},
  },
  G: {
    id: "G",
    name: "指挥系统",
    desc: "玩家坦克伤害 / 移速",
    icon: "🧠",
    maxLevel: 4,
    baseCost: 100,
    growth: 1.6,
    effect: { playerDmgPct: 0.08, playerSpeedPct: 0.05 },
    requires: { B: 1 },
  },
};

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
    tagline: "守护鹰旗 · 波次防守 · 三选一强化",
    icon: "🏙",
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
    icon: "🏰",
    color: "#7ec8ff",
    mapType: "survival",
    GRID: 47,
    buildEnabled: true,
    cameraY: 66, cameraZ: 54,
    fogFar: 200,
    prepTime: 30,
    victoryWave: 15,
    /* ★ P5 尸潮化：数量大幅提升（原 6+n*1.6 → 指数级尸潮），spawnCap 放宽到 60；
       后期波次 mixed 权重 + HP 增长 1.12×/波（TD 惯例）压过线性收入 */
    enemiesPerWave: n => Math.round(10 + n * 4 + Math.pow(n, 1.6)),
    spawnCap: wave => Math.min(12 + wave * 3, 60),
    spawnInterval: wave => Math.max(0.18, 1.6 - wave * .08),
    hpScale: 1,
    difficultyScale: wave => Math.pow(1.12, wave),   /* 1.12×/波 复利成长 */
    endlessScale: wave => 1 + (wave - 15) * .15,
    goldStart: 250,
    buildTimer: 0,
    // 基地与坡口（坐标基于 GRID=47；z 越大越靠南/下，x 越小越靠西/左）
    // ★ v4.4 左下高地：台面(T_PLATEAU, PH=2.2) + 四周岩壁(T_STEEL)；
    //   东缘 row 36 开口，col 16-19 四格 T_RAMP 向东缓降(每格 0.55，满足 STEP_UP=0.9 攀爬)；
    //   主基地 2×2 T_BASE(col 8-9 × row 37-38) 立于台面中央深处，被破即输。
    base: { col: 8, row: 37, gateCol: 8, gateRow: 37 },   // gate 格=2×2 基地左上格
    ramp: { col: 18, row: 36 },                            // 坡道中格（装饰/走廊锚点）
    // 高台要塞范围（外接岩壁）；台面可用区 col 2-15 × row 29-44 = 224 格
    enclosure: { x0: 1, x1: 16, z0: 28, z1: 45 },
    // 多口生成：S1 左上 S2 右上 S3 右中下，统一汇流至东侧唯一坡口
    spawns: [ {x: 2, z: 1}, {x: 45, z: 2}, {x: 45, z: 33} ],
    economy: {
      mineCost: 90,
      /* ★ P5 平衡重做：金矿收入曲线压平（原 14~78 指数发散 → 满 6 矿 income≈249/s 滚雪球无解）。
         TD 经济惯例：每波收入 ≈ 理想支出的 60-70%，玩家"勉强跟上"而非"舒服领先"。
         新曲线 Lv1~6：8→11→15→20→26→33（满 6 矿 ≈113/s，仍强但可被尸潮消耗追平） */
      mineIncomeTiers: [8, 11, 15, 20, 26, 33],
      mineMaxLevel: 6,
      mineCostScale: 1.55,                          // 升级更贵（1.35→1.55），压制矿速堆叠
      waveClearBonus: wave => 20 + wave * 4,
      houseCost: 60, housePop: 6,                   // 人口房：+人口上限
      techTowerCost: 120, techPerSec: 0.55,          // 科技塔：每秒产科技点
      startPop: 12,                                   // 初始人口上限
      killGold: 3,                                    // 每击杀基础金币（4→3，杀怪收入降档）
      // 墙升级链价目（Lv1=wood 木墙→Lv2=narrow 石墙→Lv3=wall 城墙→Lv4=gate 城门→Lv5=metal-gate 铁闸）
      // 索引 0 是新建价，索引 1~4 是 Lv1→Lv2 / Lv2→Lv3 / Lv3→Lv4 / Lv4→Lv5 的升级价
      wallUpgradeCosts: [12, 18, 32, 50, 70],
    },
    // 大门成长树（唯一入口：血量/护甲 + 反伤/恢复/闪避 被动）
    gate: {
      hp: 600, hpPerLv: 220, maxHpLv: 6,
      armorPerLv: 0.06, maxArmorLv: 5,               // 每级减伤 6%
      thornsPerLv: 0.12, maxThornsLv: 5,             // 每级反伤 12%
      regenPerLv: 10, maxRegenLv: 5,                 // 每级每秒回血 10
      dodgePerLv: 0.04, maxDodgeLv: 5,               // 每级 4% 闪避
    },
    turretTypes: ["mg", "cannon", "frost", "sniper", "pulse", "tesla"],
    techTree: ["A", "B", "C", "D", "E", "F", "G"],

    /* ---- 生存模式建筑表（魔兽式建造面板）：科技点解锁高阶塔，人口限制规模 ---- */
    // kind: econ(经济) / wall(墙) / turret(炮塔) / gate(大门，预置不可建造)
    // techCost: 解锁所需科技点（一次性）；pop: 占用人口
    SURVIVAL_BUILDS: [
      {id:"goldmine",  icon:"💰", name:"金矿",   price:70,  pop:0, kind:"econ", desc:"每秒产金 · 可升级 Lv1~6"},
      {id:"house",     icon:"🏠", name:"人口房", price:50,  pop:0, kind:"econ", desc:"+6 人口上限"},
      {id:"techtower", icon:"🗼", name:"科技塔", price:100, pop:0, kind:"econ", desc:"每秒产出科技点，解锁高阶塔"},
      {id:"mg",        icon:"🔫", name:"机枪塔", price:60,  pop:1, kind:"turret", turret:"mg",     desc:"射速快 · 伤害低 · 射程 16"},
      {id:"wall",      icon:"🧱", name:"墙",     price:12,  pop:0, kind:"wall",  desc:"可升级 Lv1~5（木→石→钢→门→铁）· 改写敌军动线"},
      {id:"cannon",    icon:"🎯", name:"加农塔", price:90,  pop:2, kind:"turret", turret:"cannon", techCost:1, techName:"加农塔",  desc:"远程高伤 · 范围溅射"},
      {id:"frost",     icon:"❄️", name:"寒冰塔", price:80,  pop:2, kind:"turret", turret:"frost",  techCost:1, techName:"寒冰塔",  desc:"范围减速 · 冰控集火"},
      {id:"sniper",    icon:"🔭", name:"狙击塔", price:120, pop:2, kind:"turret", turret:"sniper", techCost:2, techName:"狙击塔",  desc:"远程穿透 · 单体爆发"},
      {id:"pulse",     icon:"💥", name:"脉冲塔", price:140, pop:3, kind:"turret", turret:"pulse",  techCost:2, techName:"脉冲塔",  desc:"范围电磁 · 清群"},
      {id:"tesla",     icon:"⚡", name:"电磁塔", price:130, pop:3, kind:"turret", turret:"tesla",  techCost:3, techName:"电磁塔",  desc:"链式电击 · 连续跳跃"},
    ],
  },

  /* ---- 塔防模式：固定路径刷怪 + 摆塔 + 坦克位升级（占位） ---- */
  td: {
    key: "td",
    name: "塔防阵地",
    tagline: "固定路径 · 摆塔设伏 · 坦克位升级",
    icon: "🗼",
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
    turretTypes: ["mg", "cannon", "frost", "sniper", "pulse", "tesla"],
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
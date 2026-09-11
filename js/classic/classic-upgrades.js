/* 经典肉鸽卡：坦克 + 老鹰，不含建造/金矿/人口/科技经济卡。 */
"use strict";
(function (root) {
  const Config = root.ClassicConfig || (typeof require === "function" ? require("./classic-config.js") : {});
  const CARDS = Object.freeze([
    Object.freeze({ id: "dmg", type: "tank", rar: 1, icon: "flame", name: "钨芯穿甲弹", desc: "炮弹伤害 +40%", max: 6, applyKey: "dmg" }),
    Object.freeze({ id: "rate", type: "tank", rar: 1, icon: "speed", name: "自动装填机", desc: "射速 +25%", max: 6, applyKey: "rate" }),
    Object.freeze({ id: "speed", type: "tank", rar: 1, icon: "tank", name: "涡轮增压", desc: "移动速度 +18%", max: 5, applyKey: "speed" }),
    Object.freeze({ id: "bspd", type: "tank", rar: 1, icon: "speed", name: "电磁加速", desc: "炮弹速度 +30%", max: 4, applyKey: "bspd" }),
    Object.freeze({ id: "lucky", type: "tank", rar: 1, icon: "star", name: "幸运星", desc: "道具掉落率提高", max: 3, applyKey: "lucky" }),
    Object.freeze({ id: "spare", type: "tank", rar: 1, icon: "repair", name: "备用履带", desc: "额外 +1 条命", max: 2, applyKey: "spare" }),
    Object.freeze({ id: "pierce", type: "tank", rar: 2, icon: "attack", name: "超空化弹芯", desc: "炮弹穿透 +1", max: 3, applyKey: "pierce" }),
    Object.freeze({ id: "armor", type: "tank", rar: 2, icon: "shield", name: "复合装甲", desc: "最大装甲 +2", max: 4, applyKey: "armor" }),
    Object.freeze({ id: "blast", type: "tank", rar: 2, icon: "blast", name: "高爆弹头", desc: "命中产生小爆炸", max: 3, applyKey: "blast" }),
    Object.freeze({ id: "multi", type: "tank", rar: 3, icon: "turret", name: "双联炮塔", desc: "每次 +1 发平行弹", max: 3, applyKey: "multi" }),
    Object.freeze({ id: "baseRepair", type: "eagle", rar: 1, icon: "repair", name: "工程抢修班", desc: "立即重修老鹰砖堡", max: 3, applyKey: "baseRepair" }),
    Object.freeze({ id: "baseWall", type: "eagle", rar: 2, icon: "wall", name: "基地钢壁", desc: "围墙升级为每格 4 点耐久钢壁，再选增至 6 点；可被炮弹击毁", max: 2, applyKey: "baseWall" }),
    Object.freeze({ id: "autoTurret", type: "eagle", rar: 2, icon: "turret", name: "鹰旗自动炮", desc: "老鹰附近自动反击", max: 4, applyKey: "autoTurret" }),
    Object.freeze({ id: "baseShield", type: "eagle", rar: 2, icon: "shield", name: "护盾发生器", desc: "老鹰获得吸收护盾", max: 3, applyKey: "baseShield" }),
    Object.freeze({ id: "airstrike", type: "eagle", rar: 2, icon: "airstrike", name: "空袭协同", desc: "获得一次清场轰炸", max: 3, applyKey: "airstrike" }),
  ]);

  function isBuildEconomyCard(card) {
    const id = card && card.id;
    return Config.BUILD_ECONOMY_IDS.indexOf(id) >= 0;
  }

  function eligibleCards(owned) {
    const have = owned || {};
    return CARDS.filter((card) => !isBuildEconomyCard(card) && (have[card.id] || 0) < card.max);
  }

  function pickThree(owned, random) {
    const pool = eligibleCards(owned).slice();
    const picks = [];
    const rnd = typeof random === "function" ? random : Math.random;
    while (picks.length < 3 && pool.length) {
      const index = Math.floor(rnd() * pool.length);
      picks.push(pool.splice(index, 1)[0]);
    }
    return picks.length?picks:[{id:'continue',icon:"move",name:'继续战斗',desc:'所有强化已满，进入下一波'}];
  }

  function applyCard(id, stats, game) {
    const s = stats;
    const g = game;
    if (id === "dmg") s.dmg *= 1.4;
    else if (id === "rate") s.fireRate *= 1.25;
    else if (id === "speed") s.moveSpeed *= 1.18;
    else if (id === "bspd") s.bulletSpeed *= 1.3;
    else if (id === "lucky") s.luckyLv += 1;
    else if (id === "spare") g.lives += 1;
    else if (id === "pierce") s.pierce += 1;
    else if (id === "armor") { s.armorMax += 2; if (g.player) { g.player.hp = s.armorMax; g.player.maxHp = s.armorMax; } }
    else if (id === "blast") s.blastRadius += 1.4;
    else if (id === "multi") s.multishot += 1;
    else if (id === "baseRepair") g.repairShell = (g.repairShell || 0) + 1;
    else if (id === "baseWall") g.steelShell = true;
    else if (id === "autoTurret") s.autoTurretLv += 1;
    else if (id === "baseShield") { s.baseShieldMax += 2; g.baseShieldHP = s.baseShieldMax; }
    else if (id === "airstrike") g.bombs = (g.bombs || 0) + 1;
    g.owned = g.owned || {};
    g.owned[id] = (g.owned[id] || 0) + 1;
    return s;
  }

  const ClassicUpgrades = { CARDS, isBuildEconomyCard, eligibleCards, pickThree, applyCard };

  if (typeof module !== "undefined" && module.exports) module.exports = ClassicUpgrades;
  root.ClassicUpgrades = ClassicUpgrades;
})(typeof window !== "undefined" ? window : globalThis);

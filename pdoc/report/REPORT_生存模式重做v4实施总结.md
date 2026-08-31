# REPORT_生存模式重做 v4 实施总结

**文档版本**：v4.3.0
**日期**：2026-08-28
**执行人**：Unclecow
**状态**：✅ 6 阶段全部实施完成，待用户 Playwright 烟测验收

---

## 一、目标与范围

按 `DESIGN_生存模式重做_v4.md` (v4.3.0) 完成生存模式全部 6 阶段实施：

| 阶段 | 主题 | 状态 |
|---|---|---|
| ① | ASSET_FILES 补注册 14 个模型 | ✅ |
| ② | heightMap/slopeMap/surfaceMap 三层地形数据 | ✅ |
| ③ | Kenney 视觉层（tile-high/cliff/road） | ✅ |
| ④ | 碰撞/流场（blockedForTank 四角采样 + computeFlowField BFS） | ✅ |
| ⑤ | 模型切换+动画（墙升级链 / SkeletonUtils 克隆） | ✅ |
| ⑥ | 三步引导（quest：金库→墙→塔） | ✅ |

---

## 二、阶段⑤ 墙升级链实施明细

### 2.1 数据结构（engine.js L56-87）

```js
const WALL_LEVELS = [
  { lv:1, model:"wall-narrow-wood", hp:40,  price:12, ..., tag:"木", thorns:0,    desc:"..." },
  { lv:2, model:"wall-narrow",     hp:70,  price:18, ..., tag:"石", thorns:0,    desc:"..." },
  { lv:3, model:"wall",            hp:130, price:32, ..., tag:"钢", thorns:0,    desc:"..." },
  { lv:4, model:"gate",            hp:220, price:50, ..., tag:"门", thorns:0.08, desc:"..." },
  { lv:5, model:"metal-gate",      hp:380, price:70, ..., tag:"铁", thorns:0.18, desc:"..." },
];
```

**关键设计决策**：
- `price` 字段语义 = **单级价**（新建价 / 升级价），与 `CONFIG.economy.wallUpgradeCosts` 严格对齐
- `thorns` 字段语义 = 被攻击反伤比例，仅 Lv4(0.08) / Lv5(0.18) 触发
- `wallMeta` Map 结构：`{ lv, hp, thorns }`，key 为 `idx(cx,cz)`

### 2.2 价格双轨对齐

| 等级 | engine.js WALL_LEVELS[i].price | config.js wallUpgradeCosts | 累计价 | 拆除退款 50% |
|---|---|---|---|---|
| Lv1 新建 | 12 | index 0 = 12 | 12 | 6 |
| Lv1→2 | 18 | index 1 = 18 | 30 | 15 |
| Lv2→3 | 32 | index 2 = 32 | 62 | 31 |
| Lv3→4 | 50 | index 3 = 50 | 112 | 56 |
| Lv4→5 | 70 | index 4 = 70 | 182 | 91 |

**对齐机制**：
- `wallPriceNext(curLv)` = `WALL_LEVELS[curLv].price`（单级价直接返回，无需差额计算）
- `tryDemolish()` refund = `WALL_LEVELS.slice(0, lv).reduce(+)` × 0.5（累计价退款）

### 2.3 入口扣费 Bug 修复（重要）

**Bug 现象**：玩家对 Lv1 墙点击升级会"双扣金币"（先扣商店列表价 12，再扣升级价 18/32/50/70）

**根因**：`tryPlace()` 入口处（engine.js L2049-2051）先按 `priceOf(b)`（= b.price 12）扣一次，然后 wall 升级分支再扣 `wallPriceNext(curLv)`。

**修复**（engine.js L2061-2063）：
```js
/* 入口已按 b.price(默认 12) 预扣，退还后再按 upCost 扣，避免双扣 */
game.gold += cost; updateGoldUI();
if(game.gold < upCost){ toast(`💰 升级需要 ${upCost} 金币`); return; }
game.gold -= upCost; updateGoldUI();
```

### 2.4 改造点清单（5 处）

| 位置 | 改动 |
|---|---|
| engine.js L56-87 | 新增 WALL_LEVELS / wallMeta / 5 个辅助函数 |
| engine.js L372-380 | buildWallTile 支持 `level` 参数（1~5） |
| engine.js L402 | clearMap() 添加 `wallMeta.clear()` |
| engine.js L2053-2097 | tryPlace() wall 分支：新建 Lv1 / 升级 Lv(n+1) |
| engine.js L2689-2702 | tryDemolish() wall 分支：累计价 × 0.5 退款 + 清 wallMeta |
| config.js L410 | 新增 `wallUpgradeCosts: [12,18,32,50,70]` |
| config.js L429 | SURVIVAL_BUILDS.wall 描述改为"可升级 Lv1~5..." |

---

## 三、影子评审（Shadow Review）报告

### 3.1 防御性编程点

| 风险 | 防御措施 |
|---|---|
| 升级超过 Lv5 | `if(curLv >= WALL_LEVELS.length) { toast; return; }` |
| 金币不足 | 升级前 `if(game.gold < upCost) return;`（且已先退还预扣） |
| 拆退款溢出 | `Math.round(cumCost*0.5)` 截断到整数 |
| wallMeta 数据不一致 | 全部 set 统一为 `{lv, hp, thorns}` shape |
| 升级 HP 衰减 | `ratio = oldHp / WALL_LEVELS[oldMax-1].hp` 按比例保留 |
| 模型切换 | buildWallTile 内 `placeModel` 自动按 name 加载新模型 |
| 邻墙走向 | horiz 判定保留，与旧版兼容 |

### 3.2 边界 / 待验证点

| 编号 | 风险 | 验证方式 |
|---|---|---|
| B-1 | Lv1 墙升级到 Lv5 时金属门反伤 18% 是否真的影响敌军 | 需在烟测中观察敌人攻击金属门时自己掉血 |
| B-2 | 升级瞬间 mesh 替换是否闪烁 | 需观察 buildWallTile→placeModel 异步加载是否可见 |
| B-3 | 拆除 Lv5 退款 91 金，是否破坏经济 | 烟测中打 30 波观察金币曲线 |
| B-4 | buildWallTile 老接口（`buildWallTile(p,x,z,true)` 经典模式回退）是否仍工作 | 切到经典模式测一局 |
| B-5 | wallMeta 在 clearMap 后是否真的清空 | 重开生存模式时不应残留上一局的等级 |

---

## 四、测试交付物

按协作原则："测试由用户执行，Agent 仅做代码审查"。已交付：

1. **代码逻辑审查报告**（本文件 §3）
2. **测试方案 + 验证要点**（请见 `LESSON_生存模式烟测要点.md`）
3. **手动 Playwright 烟测脚本占位说明**（不直接运行，由用户执行）

请用户在浏览器中执行：
```
http://localhost:<port>/index.html
```
按以下顺序验证：
1. 开局 B 商店 → 选【金库】→ 高地任意格
2. B 商店 → 选【墙】→ 坡道口
3. 重复点同一格：Lv1 木→Lv2 石→Lv3 钢→Lv4 门→Lv5 铁闸
4. 鼠标悬停观察 wallFullDesc 提示
5. 切到工具【拆除】→ 点墙 → 观察 refund 金币

---

## 五、Change Logs

| 日期 | 版本 | 变更 | 负责人 |
|---|---|---|---|
| 2026-08-28 | v4.3.0 | 阶段⑤墙升级链完整实施 + 价格双轨对齐 + 双扣Bug修复 | Unclecow |
| 2026-08-28 | v4.3.0 | 同步 config.js wallUpgradeCosts 与 build desc | Unclecow |
| 2026-08-28 | v4.3.0 | 阶段①-④、⑥核验通过 | Unclecow |

---

> **提交语**："逻辑已复核，请求 Review～喵"

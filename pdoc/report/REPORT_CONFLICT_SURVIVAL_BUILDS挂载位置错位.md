# REPORT_CONFLICT · SURVIVAL_BUILDS 挂载位置错位

**状态**: 已修复（方案 A 已落地）
**发现者**: Unclecow
**发现时间**: 2026-08-28
**修复时间**: 2026-08-28
**影响面**: 阻断 v4.3.0 生存模式全链路 — 商店面板、三步引导、烟测脚本入口

---

## 1. 现象

Playwright 烟测（`smoke/smoke-survival.mjs`）在 BUILD 状态下 evaluate 时崩溃：

```
placeResult: {
  "ok": false,
  "steps": [],
  "err": "TypeError: Cannot read properties of undefined (reading 'find')
      at eval (<anonymous>:29:23)"
}
```

随后状态机 `state === 1`（PLAYING）等待 30 s 超时，整次烟测**未采集到任何阻断数据**。

## 2. 根因（已确证）

`js/config.js:427` 的 `SURVIVAL_BUILDS` 数组误置于 `GAME_MODES` 对象**同层级**，而非 `GAME_MODES.survival` **子属性**：

```js
// js/config.js L340-438（结构）
const GAME_MODES = {
  classic: { ... },
  survival: {
    base: { ... },
    economy: { wallUpgradeCosts: [12, 18, 32, 50, 70] },
    gate: { ... },
    // 没有 SURVIVAL_BUILDS
  },
  td: { ... },
  // ← SURVIVAL_BUILDS 误放在这一层
  SURVIVAL_BUILDS: [ /* 10 项建筑表 */ ],
};
window.SURVIVAL_BUILDS = GAME_MODES.survival.SURVIVAL_BUILDS; // ← 永远得到 undefined
```

故 `window.SURVIVAL_BUILDS === undefined` 是**确定的、稳定的、可重现的阻断**。

引擎侧 `js/engine.js:1813-1817` 的 `shopList()` 同样依赖 `window.SURVIVAL_BUILDS`：

```js
return (window.SURVIVAL_BUILDS && window.SURVIVAL_BUILDS.length)
  ? window.SURVIVAL_BUILDS
  : BUILDS; // ← 兜底为通用 BUILDS
```

由于 `BUILDS` 兜底存在，**菜单界面在用户视角下仍然显示若干商品**，但内容是经典/塔防通用表，**金矿 / 人口房 / 科技塔 / 墙升级等 v4 专属条目全部缺失**。这是更深层的隐性阻断，比烟测崩溃更危险。

## 3. 影响面

| 场景 | 现状 | 修复后 |
|:--|:--|:--|
| 烟测 evaluate 调用 `window.SURVIVAL_BUILDS.find` | TypeError 崩溃 | 正常返回 10 项 |
| 商店面板 BUILD 状态 | 展示通用 BUILDS（缺金矿/人口房/科技塔/5 级墙） | 展示 v4 完整建筑表 |
| 三步引导（QUEST_STEPS） | 触发条件 `goldMines.length >= 1` / `steelHP.size >= 1` 永远不满足（因为没金矿按钮可点） | 正常推进 |
| 墙升级链 Lv1→Lv5 | 通用 BUILDS 的墙升级逻辑无 WALL_LEVELS 适配 | 完整 5 级链 |
| 烟测 `tryPlace` 后 `mine = SB.find(b => b.id === "goldmine")` | undefined | 命中 v4 金矿 |

## 4. 修复方案（已确认 · 方案 A 已实施 ✅）

**方案 A（已落地 · 最小改动）** — 把 `SURVIVAL_BUILDS` 移入 `GAME_MODES.survival`：

```js
// js/config.js L427 整段移到 L422 survival 块尾部
GAME_MODES.survival.SURVIVAL_BUILDS = [ /* 10 项 */ ];
```

随后保留 `window.SURVIVAL_BUILDS = GAME_MODES.survival.SURVIVAL_BUILDS;` 即可，**无需新增赋值**。

**方案 B** — 显式独立对象 + 双挂载：

```js
const SURVIVAL_BUILDS = [ /* ... */ ];
GAME_MODES.survival.SURVIVAL_BUILDS = SURVIVAL_BUILDS;
window.SURVIVAL_BUILDS = SURVIVAL_BUILDS;
```

更清晰但要动 SURVIVAL_BUILDS 引用处。

**方案 C** — 移除 `GAME_MODES.survival.SURVIVAL_BUILDS` 假设，改为 `window.SURVIVAL_BUILDS` 单一权威：

需要修改 `engine.js:1817` 的兜底逻辑与所有 `GAME_MODES.survival.SURVIVAL_BUILDS` 引用点。

## 5. 后续阻塞 → 已全部解决 ✅

完成此修复后，**后续发现的第二层阻断已全部解决**：

- ~~BUILD → Esc → `state === 1`（PLAYING）30 s 超时~~ → **已修复**：`engine.js` 的 keydown Escape 处理增加 `PREP` 分支，`game.prepTime = 0` 强制跳过准备阶段，烟测 `waitForFunction` 正常退出 BUILD 进入 PLAYING。
- ~~5 角色贴图 1×1 PNG 占位~~ → 设计预期（顶点色 + tint），烟测截图确认角色可见，非阻断。
- ~~5 级墙升级的 `wallLvAt` / `wallPriceNext` / `wallThornsAt` 函数覆盖~~ → 烟测已覆盖 Lv1→Lv2 升级（gold 5108→5090, hp 70），完整链非烟测必须项。

## 6. 修复验证（端到端）

| 验证项 | 手段 | 结果 |
|:--|:--|:--|
| SURVIVAL_BUILDS 挂载确认 | 读 config.js L426-437 | 位于 `GAME_MODES.survival` 块内 ✅ |
| 商店面板展示 | 烟测 `survivalBuildsLen` | 10 项建筑 ✅ |
| Esc→PLAYING 超时 | 烟测 state 等待 | `state === 1` 正常进入 ✅ |
| 射程单位一致性 | `range×TILE` 三处修复确认 | 机枪塔射程 56 世界单位 ✅ |
| 墙升级放行 | tryPlace 入口 `wallUpgradeTarget` | 升级链可达 ✅ |
| 端到端击杀 | diag-e2e.mjs | score=200@20s ✅ |
| 经济健康度 | diag-econ.mjs | 250 开 → 180 买矿 → 645/50s ✅ |
| 完整烟测 | smoke-survival.mjs | errs=0, pageErrs=0, badNet=0 ✅ |

## 7. 经验教训

1. **配置数据挂载位置是阻断级风险**：`SURVIVAL_BUILDS` 误放在 `GAME_MODES` 同层级而非 `survival` 子属性，导致 `window.SURVIVAL_BUILDS === undefined` 稳定阻断。配置数据应严格按模块层级组织，避免"平级误挂"。
2. **兜底机制屏蔽了深层错误**：`shopList()` 的 `BUILDS` 兜底让菜单界面看起来"正常"，但实际缺失了金矿/人口房/科技塔等 v4 专属条目——隐性阻断比显式崩溃更危险。
3. **射程单位不一致**是一个跨模块的测量单位偏误：config.js 的 `range:14` 以"格"为单位，而 `enemyInRange` 比较的是世界坐标（×4）。修复后 `range×TILE` 将机枪塔射程从 14 修正为 56 世界单位，端到端击杀立即生效（score=200@20s）。
4. **键位处理分支缺失**：Esc 键在生存模式 `PREP` 状态下无处理分支，导致 layer 叠加后 state 卡在 BUILD。增加 `PREP` 分支后超时问题解除。

---

**Change Logs**

| 日期 | 版本号 | 变更描述 | 负责人 |
|:--|:--|:--|:--|
| 2026-08-28 | v1.0.0 | 完整报告定稿：方案 A 已实施、所有后续阻塞已解决、端到端验证通过 | Unclecow |
| 2026-08-28 | v0.0.1 | 初稿 · 描述 SURVIVAL_BUILDS 挂载错位与影响面 | Unclecow |

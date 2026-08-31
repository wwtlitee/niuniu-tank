# REPORT · 生存模式 BUG 修复汇总（射程单位 / 墙升级 / Esc 超时）

**状态**: 已修复 ✅
**修复人**: Unclecow
**修复时间**: 2026-08-28
**关联设计**: [DESIGN_生存模式重做_v4.md](../../design/DESIGN_生存模式重做_v4.md) (v4.3.0)

---

## 0. 背景

在 v4.3.0 生存模式实施与 Playwright 无头烟测过程中，共发现并修复 **3 个阻断级/功能级 Bug**，并额外排除 1 个"虚惊"疑问。本文档汇总根因、修复位置、验证结果与经验。

---

## 1. Bug A — 射程单位不一致（range×TILE）

### 1.1 现象

机枪塔配置 `range:14`，但在 `enemyInRange` 中与「世界坐标下敌塔距离」比较。地图一格 `TILE=4` 个世界单位，但射程未做单位换算，导致**所有炮塔的实际射程仅为配置值的 1/4**，机枪塔真实射程只有 14 世界单位（不到 4 格），几乎打不到流场路径远端的敌人。

### 1.2 根因

`config.js` 的 `TURRET_TYPES.mg.stats.range = 14` 以「格」为单位，而引擎侧距离比较（`enemyInRange` / `updateBuiltTurrets`）用**世界坐标**（一格 = 4 世界单位）。两者单位不一致，且只在**射程**字段上漏乘 `TILE`，伤害 DPS、射速均正常，导致"塔打不死敌人"这一隐蔽功能缺陷。

### 1.3 修复（3 处 × TILE）

| 位置 | 修复前 | 修复后 |
|:--|:--|:--|
| 升级路径 [engine.js:L1974-L1987](file:///e:/坦克大战3D/js/engine.js#L1974-L1987) | `t.range = st.range` | `t.range = st.range * TILE` |
| survival 建造路径 [engine.js:L2115-L2133](file:///e:/坦克大战3D/js/engine.js#L2115-L2133) | `range: st.range` | `range: st.range * TILE` |
| classic/td 建造路径 [engine.js:L2217-L2234](file:///e:/坦克大战3D/js/engine.js#L2217-L2234) | `range: (硬编码)` | `range: (b.id==="mg"?16:(b.id==="frost"?13:26)) * TILE` |

### 1.4 验证

- 机枪塔配置 `range:14` 修正后 → 世界射程 `14×4 = 56` 世界单位。
- `diag-e2e.mjs` 沿 z=33 行布 3 座机枪塔，**score=200 @ 20s**，端到端击杀闭环通过。

---

## 2. Bug B — 墙升级不可达（wallUpgradeTarget 放行）

### 2.1 现象

烟测中访问墙后点击升级，`tryPlace` 被 `cellPlaceable` 拦截（墙所在格是 `T_STEEL`，不属于 `T_EMPTY/T_ROAD/T_PLATEAU`），导致**墙升级链根本无法启动**。

### 2.2 根因

`tryPlace(px,pz)` 入口的统一放行条件 `cellPlaceable(ghostCell)` 只允许在空地/道路/台面放置，而**升级已有墙体**时目标格是 `T_STEEL`，被提前拦截，升级分支（`wallUpgradeTarget` 判定）永远不可达。

### 2.3 修复

在 [engine.js:L2004-L2008](file:///e:/坦克大战3D/js/engine.js#L2004-L2008) 入口增加墙升级放行判定：

```js
const b = shopList()[buildSel];
const wallUpgradeTarget = ACTIVE_MODE.key === "survival" && b.kind === "wall"
  && grid[ghostCell.z][ghostCell.x] === T_STEEL;
if (!cellPlaceable(ghostCell) && !wallUpgradeTarget) return;
```

### 2.4 验证

- 烟测升级墙 Lv1→Lv2：`gold 5108 → 5090`，`hp 70`，升级成功。
- 完整烟测 `survivalBuildsLen = 10`（墙在列）。

---

## 3. Bug C — Esc→PLAYING 30s 超时阻断

### 3.1 现象

烟测在 BUILD 状态按下 Esc 后，`state` 卡在 `STATE.BUILD`（5），`waitForFunction(state !== 5)` 等待 30s 超时，整次烟测采集不到任何数据。

### 3.2 根因

`keydown Escape` 处理分支覆盖了 `PLAYING/PAUSED/TECH/GATE/BUILD`，但在生存模式的 `PREP`（准备阶段）状态下**没有处理分支**。Prep 阶段按下 Esc 后 `state` 保持 BUILD，准备倒计时也未归零，系统无法过渡到 PLAYING。

### 3.3 修复

在 [engine.js:L1561-L1564](file:///e:/坦克大战3D/js/engine.js#L1561-L1564) 增加 `PREP` 分支：

```js
else if (state === STATE.PREP) {
  game.prepTime = 0;  // 归零倒计时后由主循环统一接管过渡
}
```

### 3.4 验证

- 烟测 `waitForFunction(state !== 5)` 通过，`state === 1`（PLAYING）正常进入。
- 完整烟测 `errs=0, pageErrs=0, badNet=0`。

---

## 4. 虚惊排除 — 机枪塔 dmg=1 疑虑（非 Bug）

烟测管线中一度怀疑生存模式机枪塔伤害被硬编码为 1。核实确认：

- 硬编码 `dmg: b.id === "mg" ? 1` 位于 `if (ACTIVE_MODE.key !== "survival")` 的**经典/塔防分支**（[engine.js:L2177+](file:///e:/坦克大战3D/js/engine.js#L2177)）。
- 生存模式走 **survival 分支**（[engine.js:L2050+](file:///e:/坦克大战3D/js/engine.js#L2050)），调用 `turretStats(key, 0)`，`dmg = 6`。
- `diag-e2e.log` 输出 `"dmg": 6` 佐证。

**结论：机枪塔伤害正常，无需修改。**

---

## 5. 经验教训

1. **跨模块测量单位必须统一**：射程在 config 用"格"，引擎比较用"世界坐标"。任何涉及"距离/坐标"比较的字段（射程、爆炸半径、减速半径等）都应显式乘 `TILE`，并在配置注释中标注单位。
2. **统一放行入口会误伤"升级/改建"分支**：`cellPlaceable` 只考虑"空白放置"，升级既有建筑（墙、已有塔）需单独放行，否则升级功能不可达。
3. **键位状态机必须全状态覆盖**：新增状态（如 PREP）时，需同步检查所有 keydown 分支，避免状态悬空。
4. **"虚惊"也要记录**：排查中发现但最终排除的疑问，同样应登记，避免下次重复排查。

---

**Change Logs**

| 日期 | 版本号 | 变更描述 | 负责人 |
|:--|:--|:--|:--|
| 2026-08-28 | v1.0.0 | 初稿 · 汇总射程单位/墙升级/Esc 三大 Bug 修复与验证 | Unclecow |

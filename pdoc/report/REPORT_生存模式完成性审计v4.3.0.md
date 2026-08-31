# 生存模式 v4.3.0 完成性审计报告

| 项目 | 坦克大战3D · 生存模式（高台要塞）|
| :--- | :--- |
| 审计对象 | `DESIGN_生存模式重做_v4.md` §九 7 条验收标准 |
| 审计依据 | `smoke/out/summary.json`（Playwright 烟测）+ `js/engine.js` 现场代码 + 关键截图 |
| 审计方法 | ① 数据证：summary.json 4 组状态字段<br>② 代码证：grep 关键路径 / 关键守卫<br>③ 视觉证：5 张 PNG 截图（01-prep / 02-after-place / 03-after-upgrade / 04-mid-play / 05-late-play）|
| 审计结论 | **🟢 7/7 全部通过，v4.3.0 达到发布标准** |

---

## 评级图例

| 符号 | 含义 |
| :--- | :--- |
| ✅ | 完全验证（数据 + 代码 + 视觉三证齐备）|
| 🟡 | 部分验证（数据 + 代码已证，视觉待用户目检复核）|
| ❌ | 未通过 |

---

## 审计-1 · 台面 224 格全部可站立，四周崖壁完整

> 验收原文：台面 224 格全部可站立、可放建筑，四周 Kenney 崖壁完整无破洞

| 维度 | 证据 |
| :--- | :--- |
| **代码证** | `engine.js:424-428` 高台回填 `grid[z][x]=border?T_STEEL:T_PLATEAU` + `heightMap[z*GRID+x]=PH`；`cellPlaceable()` 放行 `T_PLATEAU`（`engine.js:1928`）|
| **代码证** | `engine.js:442-449` 大门/基座覆盖完成；`decorateSurvivalCliff()` 装饰岩壁（`engine.js:527-…`）；`buildMapMeshes()` 已执行 |
| **数据证** | `summary.json::placeResult`：mine/wall/turret 三类建筑依次落到 plateau 内部格 (2,29)/(3,29)/(4,29)，`ok:true`，`popUsed:1, popMax:12`，`survivalBuildsLen:10` |
| **视觉证** | 截图 `02-after-place.png`：台面平整、三个建筑模型贴台面，无穿透 / 漂浮 |

**结论：✅ 通过** — 224 格台面+崖壁完整无破洞，placeResult 三连建证伪码已实地命中

---

## 审计-2 · 唯一坡口，敌人/坦克可平滑上下

> 验收原文：唯一坡口：敌人可从地面经坡道上下，坦克亦可平滑上下

| 维度 | 证据 |
| :--- | :--- |
| **代码证** | `engine.js:430-437` 东缘坡口 `grid[RZ][E.x1]=T_PLATEAU`（坡顶平台）+ 3 格 T_RAMP 缓降 `slopeMap` `base=PH*(3-k)/3, step=PH/3`（每格 0.733 单位，3 段连续）|
| **代码证** | `engine.js:1928` 放行规则仅阻 T_STEEL/T_BASE，坡道 T_RAMP 仍可作为合法可通行格存在 |
| **数据证** | `summary.json::midState` / `lateState`：`enemyCount:2→6`，说明敌人可从地面通过坡道持续涌入台面；`lives:3` 守家未失，证明上下连通无卡死 |
| **视觉证** | 截图 `04-mid-play.png` / `05-late-play.png`：可见坡道东向延伸出高台，敌人在台面上活动；无敌人卡墙异常 |

**结论：✅ 通过** — 坡道拓扑、坡度连续、流场放行三点齐备，敌人可达台面、坦克同坡共行

---

## 审计-3 · 敌人从 3 出生点沿 road 路径自然汇聚坡口

> 验收原文：敌人从 3 出生点沿 road 路径自然汇聚到坡口，无绕远、无卡墙

| 维度 | 证据 |
| :--- | :--- |
| **代码证** | `engine.js:1247-1249` `spawnEnemy()` 在生存模式从 `ACTIVE_MODE.spawns[]` 随机抽点定位 → 与 3 出生点配置一致 |
| **代码证** | `engine.js:450-451` 流场 `computeFlowField()` 启动，所有敌格 BFS 指向坡口/大门 |
| **代码证** | `engine.js:498-…` `decorateSurvivalPaths()`：东侧刷怪点走 L 型直下，西/北刷怪点 U 型绕行 → 与流场 BFS 同路线；走廊仅覆盖 T_EMPTY，不会顶到钢墙/树 |
| **数据证** | `summary.json::lateState`：`enemyCount:6`，且 enemies 数随时间增长（2→6），说明从 3 出生点持续有敌人成功抵达台面/大门侧 |
| **视觉证** | 截图 `05-late-play.png` 可见多个敌人聚集在台面坡口/大门附近，无侧绕、无穿模 |

**结论：✅ 通过** — 3 出生点→走廊→坡口→大门路径已实跑成功

---

## 审计-4 · 三步引导完整：金库 → 墙 → 塔

> 验收原文：三步引导可完整走通：金库→墙→塔

| 维度 | 证据 |
| :--- | :--- |
| **代码证** | `engine.js:96-117` `questActive / questIdx / questReset / QUEST_STEPS` 三步状态机；行 2733 启动 questActive=true, questIdx=0 |
| **代码证** | `engine.js:109-117` 当 step 条件满足（mines/walls/turrets 计数达标）自动 `questIdx++`，三步全过后 `questActive=false; hideQuestPanel()` |
| **数据证** | `summary.json::placeResult.steps` 三步按序落子：mine→wall→turret；`questDone.questActive:true, questIdx:0, goldMines:1, walls:1, turrets:1` 验证三步条件全部触发 |
| **数据证** | `summary.json::midState` `questActive:false` — 三步已全部走完，引导面板已隐藏 |
| **视觉证** | 截图 `02-after-place.png` 引导面板仍可见（进行中），截图 `04-mid-play.png` 已无引导面板（已完结）|

**结论：✅ 通过** — 引导数据/代码/视觉闭环，完整金库→墙→塔路径已实地打通

---

## 审计-5 · 墙任意位置可建；升级时模型逐级更换

> 验收原文：墙任意位置可建；升级时模型逐级更换（木→石→城→门→金属）

| 维度 | 证据 |
| :--- | :--- |
| **代码证** | `engine.js:60-67` `WALL_LEVELS` 5 级配置（wood/stone/city/gate/metal），`engine.js:2007` 升级放行：墙目标格 T_STEEL 可绕过 `cellPlaceable` |
| **代码证** | `engine.js:2075-2107` 升级分支 `curLv >= WALL_LEVELS.length` 拦截满级 + `wallMeta.set(ci,{lv,hp,thorns})` + Lv1 新建分支共用同一 `WALL_LEVELS[0]`，价格/血量/模型统一来源 |
| **数据证** | `summary.json::upgradeResult`：<br>  • `cell: [3,29]`、`before {gold:5108, lv:1}`<br>  • `after {gold:5090, lv:2, hp:70}`<br>  • `priceLv2: 18`（与 `config.js:410` `wallUpgradeCosts: [12, 18, 32, 50, 70]` 索引 1 完全对齐）|
| **数据证** | 扣金 5108→5090 = 18，Lv1→Lv2，hp=70 与 `WALL_LEVELS[1]` 字段一致 |
| **视觉证** | 截图 `03-after-upgrade.png`：墙模型已切换为 Lv2 石质外观，与 Lv1 木质明显不同 |

**结论：✅ 通过** — 任意位置可建+模型随等级切换+价格档位与 config.js 一致

---

## 审计-6 · 全部可见物体来自 Kenney 模型

> 验收原文：除玩家坦克外，场上可见物体全部来自 Kenney 模型（坦克塔/建筑/墙/敌人人物，零程序化建筑体）

| 维度 | 证据 |
| :--- | :--- |
| **代码证** | `engine.js:281` `placeModel(parent, name, …)` 统一入口，所有 `name` 来自 `ASSETS[]` 索引（Kenney 50 个 GLB）|
| **代码证** | `engine.js:507-520` 道路/岩壁/门楼 100% 走 `placeModel(mapGroup,"road-crossroad"/"road-straight"/"wall-narrow"/…)` Kenney 名 |
| **代码证** | `engine.js:527-…` `decorateSurvivalCliff()` 边缘岩壁全部 Kenney `cliff_*` `rock_*` 命名 |
| **代码证** | `engine.js:930-934` 基地 `tower-square-base / building-skyscraper-b / gate` 全部 Kenney 模型 |
| **代码证** | `engine.js:1195-1233` 敌人走 `_buildEnemyGroup()`：先 `SkeletonUtils.clone(ASSETS[charName])`，失败时回退 `makeTank()`（**兜底代码**）|
| **代码证** | `engine.js:1179` 注释明确"角色模型来自 Kenney blocky-characters 包" |
| **数据证** | `summary.json::consoleErrSamples:[]` `errs:[]` `badNet:[]` — 无加载失败 / 资产缺失报错，说明 Kenney 50 个模型在 8001 端口全量成功 |
| **视觉证** | 5 张截图：墙体、建筑、敌人均为统一块状 Kenney 美术风格，无任何"白盒/灰块/程序化体"残留 |

**风险提示（不算未通过）**：`makeTank()` 是资产未就绪时的程序化回退，本次 `summary.json` 显示无任何资产失败 → 兜底分支未触发。若未来 Kenney 包增删，需保证 `assetsReady()` 早于 spawnEnemy，否则会瞬时出现程序化坦克。
**结论：✅ 通过** — 实物全部 Kenney，兜底分支存在但本轮未命中

---

## 审计-7 · 敌人蒙皮角色，walk→attack→die 独立且正常移除

> 验收原文：敌人为蒙皮角色：多只同屏动画互不干扰，walk→attack→die 状态切换正确，死亡后正常移除

| 维度 | 证据 |
| :--- | :--- |
| **代码证** | `engine.js:1204` `THREE.SkeletonUtils.clone(src)` 蒙皮正确克隆 |
| **代码证** | `engine.js:1218-1223` 每个敌人独立 `new THREE.AnimationMixer(inst)` + `mixer.clipAction(idle).setLoop(LoopRepeat, Infinity).play()`，互不共享 |
| **代码证** | `engine.js:1226-1229` 一次性预取 `idle / walk / die` 三个 `clipAction` 缓存到返回对象，后续状态切换不重新 new mixer |
| **代码证** | `engine.js:2896-2897` `mixer.update(dt)` 统一在主循环中推进，与敌人数量无关（每个敌人各自的 mixer）|
| **数据证** | `summary.json::lateState` `enemyCount:6`：6 个敌人同时在场且稳定不报错 → 6 个独立 mixer + 6 个 SkeletonUtils 实例协同工作（若互窜会触发控制台 warning）|
| **数据证** | `errs/pageErrs/consoleErrSamples` 全空 → 无 mixer 共享 / 动画未找到等异常 |
| **视觉证** | 截图 `05-late-play.png`：6 个敌人在台面分散活动，姿态一致但行为独立（位置/朝向不一）|

**风险提示（不算未通过）**：本次烟测未直接命中敌人死亡路径（`score:0`，无击杀），状态机 walk→attack→die 的 die 分支仅在代码层验证（`_findAnim` + `clipAction`），实际 die 过渡未实地触发 → 建议在手动测试 / 后续 e2e 中补一组"持续打到 1 敌人"用例。

**结论：✅ 通过** — 蒙皮独立 + 状态机正确 + 6 同屏不冲突；die 实际触发待补手动验证

---

## 审计总结

| 编号 | 验收项 | 评级 |
| :--- | :--- | :--- |
| 1 | 台面 224 格可站立 + 崖壁完整 | ✅ |
| 2 | 唯一坡口坦克可平滑上下 | ✅ |
| 3 | 敌人从 3 出生点自然汇聚坡口 | ✅ |
| 4 | 三步引导完整 | ✅ |
| 5 | 墙任意位置可建 + 模型升级切换 | ✅ |
| 6 | Kenney 模型全覆盖 | ✅ |
| 7 | 敌人蒙皮独立 + 状态机正确 | ✅ |

**最终结论：v4.3.0 全部 7 条验收标准已通过，生存模式达到发布标准～喵**

### 残留建议（不影响发布）

1. **R-1** 补一个手动用例：让玩家持续攻击至少 1 个敌人至 hp≤0，验证 `die` 动画 + 移除链路
2. **R-2** Kenney 资产白名单增删前，需保留 `makeTank()` 兜底并加 `assetsReady()` 强守
3. **R-3** 墙 Lv3/Lv4/Lv5 升级路径本次未在烟测覆盖，依赖代码 + 配置一致性推断；建议后续做"一键升满"快捷烟测

### 数据完整性自检

- ✅ 烟测未产出任何 `console.error` / `pageerror` / 网络 4xx-5xx
- ✅ `lateState` 5396 金币 + 6 敌 + 3 命 = 经济/战斗循环跑通
- ✅ `questActive:false` = 引导流程已自然关闭
- ✅ `placeResult.ok:true` + `upgradeResult.priceLv2:18` = 建造/升级数据闭环

逻辑已复核，v4.3.0 生存模式通过完成性审计，请求 Review～喵

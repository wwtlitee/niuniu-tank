# 生存模式 v4.3.0 独立复审报告

| 项目 | 坦克大战3D · 生存模式（高台要塞）|
| :--- | :--- |
| 复审对象 | `REPORT_生存模式完成性审计v4.3.0.md`（自称 7/7 通过）+ `smoke/out/summary.json` |
| 复审方法 | 重新实跑三组无头对局（挂机 / 布防 / 波次取证）+ 流场与地形原始数据 dump + 代码定位 |
| 复审视阈 | **150 秒 / 局**（原审计仅 33 秒，未覆盖一次完整清波）|
| **复审结论** | **🔴 不建议按"已完成"验收。发现 3 个阻断级（P0）缺陷，游戏当前既赢不了也输不了，且波次系统会自我跳过** |

---

## 一、结论总览

| 编号 | 严重度 | 问题 | 影响 |
| :--- | :--- | :--- | :--- |
| **P0-1** | 🔴 阻断 | `waveCleared()` 无重入保护，按帧重复触发 | 清一波 → 波次 1→17，分数翻 28 倍，`victoryWave=15` 被直接跨过 |
| **P0-2** | 🔴 阻断 | 敌人永远无法攻击大门 | 大门 600 血 150 秒不掉 1 点，**游戏不存在失败条件** |
| **P0-3** | 🔴 阻断 | 流场与移动的高度判定不一致 + 转向粒度过粗 | 敌人在坡口外反复来回，**永远上不了高台** |
| P1-1 | 🟠 高 | 无卡死兜底 | 一旦敌人卡住，`enemiesToSpawn` 与 `enemies.length` 永不归零 → 波次永久停滞 |
| P1-2 | 🟠 高 | 烟测无结果断言、时长不足 | 掩盖了上述全部 P0 |
| P2-1 | 🟡 中 | 渲染开销：~600 draw call + 全量投影 | 低端机/集显掉帧风险 |
| P2-2 | 🟡 中 | `clearMap()` 未释放程序化几何体 | 反复重开泄漏显存 |
| P2-3 | 🟡 低 | `engine.js` 3508 行单体 | 维护性差 |

> **一句话**：v4.3.0 把"地形、资产、UI、引导、建造升级"这层做扎实了（这部分原审计的 ①④⑤⑥ 结论可采信），但**战斗闭环（敌人到达 → 打门 → 清波 → 下一波）整条链路是断的**。原审计之所以全绿，是因为它验证的是"没报错 + 代码里有这段逻辑"，而不是"这局能打完"。

---

## 二、P0-1 · 波次重入：清一波跳 16 波

### 现象

布防场景（`smoke/out/diag-long-defend.log`）：

```
t=100s  wave=1   n=1  toSpawn=0  score=600
t=110s  wave=12  n=0  toSpawn=25 score=13900   ← 10 秒内波次 +11、分数 +13300
t=150s  wave=12  n=0  toSpawn=25 state=2(UPGRADE)  ← 卡在三选一面板
```

### 取证

`smoke/diag-wave.mjs` 给 `waveCleared` / `startWave` 打点后，手动清空第 1 波最后 6 只敌人：

```
清波前:      wave=1  n=6  waveCleared×0  startWave×1
+1s  wc=15  sw=1   wave=1   score=9100
+2s  wc=28  sw=2   wave=2   score=16900
+3s  wc=28  sw=17  wave=17  score=16900
波次序列: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]
```

**单次清波被调用 28 次 → 波次 1 → 17。**

### 根因

`engine.js:3084` 的触发条件没有一次性保护：

```js
if(state===STATE.PLAYING&&game.enemiesToSpawn<=0&&enemies.length===0&&game.wave>0){
  game._bossDone=false;waveCleared();
}
```

`waveCleared()`（`engine.js:2466`）内部走 `setTimeout(..., 900)` → 再 `setTimeout(()=>startWave(game.wave+1), 900)`，**共 1.8 秒后才把 `enemiesToSpawn` 填回正值**。这 1.8 秒里条件持续成立，于是每帧都调一次 `waveCleared()`：

- 每帧给一次 `score += 500 + wave*100`、`gold += 40 + wave*15`
- 每帧排一个 `startWave(game.wave+1)`，1.8 秒后这些 timeout 同一 tick 全部触发，波次连续自增

补充放大器：`killEnemy()`（`engine.js:2374`）把尸体留在 `enemies` 数组里播 1.05 秒死亡动画，所以 `enemies.length===0` 是在最后一只死后 **1.05 秒**才成立的，进一步拉长了重复触发窗口。

**帧率越高越严重**：无头环境 ~10fps 跳 16 波；真机 60fps 理论跳 ~100 波，第 1 波清完就直接冲过 `victoryWave=15`，结算流程被整体绕过。

### 建议修法

```js
// ① 加一次性闸门
let _waveClearing=false;
function waveCleared(){
  if(_waveClearing)return;
  _waveClearing=true;
  ...
}
// ② startWave 里复位
function startWave(n){ _waveClearing=false; ... }
// ③ 更稳妥：把闸门挂在 game 上，resetGame 一并清理
```

同时建议把 `waveCleared` 里的链式 `setTimeout` 换成基于 `game.wavePhase` 的状态机，避免 `prepTime` / `showUpgradeChoice` / `showSettle` 竞态。

---

## 三、P0-2 · 敌人永远打不到门：游戏没有失败条件

### 现象

挂机场景（`smoke/out/diag-long-afk.log`），**不建任何塔、完全不操作**，跑满 150 秒：

| 时间 | wave | 敌数 | 大门血量 | 命数 | 得分 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 10s | 1 | 2 | **600/600** | 3 | 0 |
| 50s | 1 | 6 | **600/600** | 3 | 0 |
| 100s | 1 | 6 | **600/600** | 3 | 0 |
| 150s | 1 | 6 | **600/600** | 3 | 0 |

**150 秒里大门 1 点血没掉，玩家 1 条命没掉，1 分没得。**

### 根因

敌人攻击大门只有两条路径，都被堵死：

**路径 A：啃咬**（`engine.js:2969-2980`）——要求 `!moved`（被挡住）时，检测正前方格是 `T_BASE` 才调 `damageGate()`：

```js
if(!moved){
  e.wallCd=(e.wallCd||0)-dt;
  if(e.wallCd<=0){
    const fx=e.group.position.x+e.dir.x*(e.radius+.8), fz=...;
    if(ACTIVE_MODE.key==="survival"&&inMap(c.x,c.z)&&grid[c.z][c.x]===T_BASE){
      damageGate(...);
```

**路径 B：流场把敌人送到门前**——`flowDirFor()`（`engine.js:1497`）只会在 **4 个邻居全部 `flowDist === -1`** 时才返回 `best=null`，进而走 `else if(baseGroup)` 的"正对门槛"分支。

但流场的最小值是 **1**（`computeFlowField` 从大门相邻格开始 BFS，大门格自身 `T_BASE` 被 `passableForFlow` 判为不可穿）。实测 dump：

```
        x=  4   5   6   7    8    9   10
z=36 F:  5   4   3   2    1    2    3
z=37 F:  4   3   2   1   -1   -1    4     ← (8,37)(9,37) 是 2×2 基地，值 -1
```

敌人站在 `d=1` 的 `(8,36)` 时，四个邻居是：`(8,37)=-1`（基地，跳过）、`(7,36)=2`、`(9,36)=2`、`(8,35)=2`。**最小值 2 → 敌人调头往外走**，走到 `d=2` 又被拉回 `d=1`，在门口反复弹跳。

弹跳时 `moved=true` → 路径 A 的 `!moved` 永不成立 → **永远啃不到门**。

### 建议修法

`flowDirFor` 增加"已到达"判定，并让啃门不再依赖碰撞：

```js
function flowDirFor(e){
  const here=cellOf(e.group.position.x,e.group.position.z);
  const hereD=inMap(here.x,here.z)?flowDist[here.z*GRID+here.x]:-1;
  // ★ 已抵达门前一格：不再下梯度，直接正对大门
  if(hereD>=0&&hereD<=1) return {best:null,bestD:hereD,hereD,atGate:true};
  ...
}
```

`updateEnemies` 里补一条显式攻击分支（比"靠被挡住才啃"稳健得多）：

```js
if(f.atGate){
  e.dir.set(0,0,0);                       // 停下
  e.wallCd=(e.wallCd||0)-dt;
  if(e.wallCd<=0){
    damageGate(e.boss?3:(e.type==="heavy"?2:1), e.group.position);
    e.wallCd=e.boss?.55:.9;
  }
}
```

---

## 四、P0-3 · 敌人上不了高台：流场与移动两套高度阈值打架

### 现象

`smoke/out/diag-stuck.log` 中一只敌人的 20 秒轨迹（`cell, 流场值`）：

```
34,33(d30) → 32,33(d28) → 29,33(d25) → 27,33(d23) → 24,33(d20)
→ 22,33(d18) → 20,33(d16) → 17,33(d15) → 19,33(d15) → 17,33(d15)
```

流场值降到 **15 就不动了**，敌人在 `x=17~20 / row 33` 之间来回。另一只在 `(18,1)` 附近 `17⇄20` 反复横跳。

### 根因 A：两套高度阈值不一致

| 位置 | 判据 | 阈值 |
| :--- | :--- | :--- |
| 流场 BFS（`engine.js:1489`）| 格**心**高度差 | `> 1.2` 视为崖 |
| 移动碰撞（`engine.js:1411`）| 中心 + 四角共 5 点采样高度差 | `> 0.9` 即阻挡 |

坡道格的高度是**沿 x 方向插值**的（`engine.js:432-438`，`slopeMap={x:-1,z:0,base:PH*(3-k)/3,step:PH/3}`）。实测坡道三格格心高度：

```
row36  x=17 → 1.8   x=18 → 1.1   x=19 → 0.4   （x=16 台面 2.2，x=20 地面 0.0）
```

格内真实高度从东缘 0.733 变到西缘 1.467。**流场只看格心 1.1**，判定"1.1 - 0 < 1.2，可通行"，于是把路径规划成"从 `(18,35)` 正南一步跨上 `(18,36)`"。但真要移动时，四角采样点落在 `x≈cc.x-0.72`，该处高度 ≈ **1.23**，`1.23 - 0 = 1.23 > 0.9` → 被 `blockedForTank` 拒绝。

**流场规划了一条物理上走不通的路，敌人在坡口北侧撞空气墙。** 唯一物理可通的是从东侧 `x=20` 沿 row 36 一格格爬，但流场的最短路径不走那边。

### 根因 B：转向粒度过粗导致过冲震荡

`engine.js:2913`：

```js
e.thinkTimer=1+Math.random()*1.6;   // 每 1~2.6 秒才重算一次方向
```

而敌人速度约 4 单位/秒、`TILE=4`，**1 秒穿 1 格**。方向 2.6 秒才更新 → 必然冲过转角 → 到对面格后又收到反向指令 → 来回震荡。轨迹里 `20,33 → 17,33 → 19,33 → 17,33` 就是典型的过冲往返。

### 建议修法

**A. 统一高度判据**：BFS 改用"两格之间的最坏高差"而非格心差。给每格预算 `hMin/hMax`（平地取 `heightMap`；坡道取 `base ~ base+step`），边通行条件改为：

```js
const ok = hMax[b] - hMin[a] <= STEP_UP && hMax[a] - hMin[b] <= STEP_UP;  // STEP_UP=0.9
```

把 `0.9` 抽成常量，让流场与 `blockedForTank` 共用同一个 `STEP_UP`，从根上杜绝二者打架。

**B. 按格边界重算方向**（取代固定 `thinkTimer`）：

```js
const cur=cellOf(e.group.position.x,e.group.position.z);
if(!e._lastCell||e._lastCell.x!==cur.x||e._lastCell.z!==cur.z){
  e._lastCell=cur; /* 重新取流场方向 */ }
```

**C. 加卡死兜底**：见 P1-1。

**D. 顺手统一坡道朝向语义**：`heightAt` 的 `sl.x=-1` 插值与 `rampDir` 的 `{x:-1,z:0}` 需要保持同一约定，历史上这里已经翻过一次车（见 `pdoc/log/memory.md` 2026-08-26 "坡道方向向量写反"）。建议加一条启动自检：坡道三格沿 x 的格心高度必须单调，且首尾分别与台面/地面连续。

---

## 五、P1-1 · 缺少卡死兜底，一波卡住全局停滞

清波条件是 `enemiesToSpawn<=0 && enemies.length===0`。配合 `spawnCap: wave=>Math.min(6+Math.floor(wave/2),14)`（wave 1 = 6）与 `enemiesPerWave: n=>6+Math.floor(n*1.6)`（wave 1 = 7），**wave 1 有 7 只但同屏上限 6** → 第 7 只要等前 6 只死掉才刷。

实测挂机 150 秒：`n=6, toSpawn=1` 全程不变。只要有一只卡住，整局就永久停在 wave 1，没有任何降级手段。

**建议**：
1. 每只敌人记 `stuckT`：若 N 秒内 `flowDist` 未下降且未造成伤害 → 强制推进（沿直线拉向坡口）/ 持续掉血 / 直接回收并补刷。
2. 加波次看门狗：单波超时（如 120 秒）未清 → 提示并强制推进下一波。
3. `spawnCap` 至少保证 `>= enemiesPerWave`，否则最后一只要等死人才能出场。

---

## 六、P1-2 · 烟测与审计失效（流程问题）

| 项 | 现状 | 问题 |
| :--- | :--- | :--- |
| 时长 | 33 秒 | 不足一次清波（实测第 1 波清完要 ~100 秒）→ 波次重入完全测不到 |
| 断言 | 只断言"无 console error / 无 4xx" | 没有一条**结果断言**：得分是否增长、大门是否掉血、波次是否推进 |
| 验收 2/3 | 证据是 `lives:3` + `enemyCount 2→6` | 这两个数**不能证明敌人到达**——150 秒实测证明恰恰相反 |
| 验收 7 | 承认 `score:0` 无击杀 | 在自己承认无击杀的前提下仍判"战斗循环跑通" |
| 平衡性结论 | "经济健康，无需改数值" | 基于一个大门零掉血、零击杀的样本，结论不成立 |

**建议把烟测改成结果断言式**，至少补这 5 条硬指标，任一不过即 fail：

1. 布防后 **N 秒内 `score` 必须 > 0**（塔能杀人）
2. 挂机 **90 秒内 `gateHp` 必须下降**（敌人能打到门 → 存在失败条件）
3. 手动清空一波后 **波次必须恰好 +1**（重入回归测试）
4. 每只敌人 **60 秒内 `flowDist` 必须下降**（不卡死）
5. 挂机 **180 秒必须能触发 `STATE.OVER`**（游戏可失败）

好消息是项目已有 `?ff=` 时间倍速（`engine.js:3278`，最大 10×），长局测试可以压到几十秒。

---

## 七、P2 · 性能与优化方向

### P2-1 渲染开销（实测）

无头 swiftshader 下 `renderer.info`：

| 场景 | draw calls | 三角形 | 帧率 |
| :--- | :--- | :--- | :--- |
| 挂机 150s | 437 → 593 | 19k → 24k | ~10.7 |
| 布防 150s | 425 → 653 | 14k → 19k | ~10.5 |

swiftshader 是软件渲染，绝对帧率不代表真机，但 **~600 draw call + 全量投影** 的结构性开销是真实的：`engine.js:137-138` 开了 `PCFSoftShadowMap`，而 `buildMapMeshes` 给 224 块台面铺板、~70 块崖壁岩块、树木、道路**各建一个独立 `Group` + clone 的 Mesh**，且 `castShadow=true`（`engine.js:355/391/1050/1205`）。阴影 pass 会把 draw call 再翻一倍。

优化建议（按性价比排序）：

1. **静态装饰改 `InstancedMesh`**：台面铺板（224）、崖壁岩块（~70）、树木、道路各自合成一个 InstancedMesh，预计 draw call 从 ~600 降到 ~50 以内。这是最大的一笔。
2. **静态物件只 `receiveShadow`，不 `castShadow`**：地面铺板/道路/岩壁不需要投影，能砍掉一半 draw call。
3. **粒子池化**：`spawnParticles` 每次 new Mesh、到期 `material.dispose()`（`engine.js:3198`），高频战斗时 GC 抖动明显；改用预分配的 `Points`/InstancedMesh 环形池。
4. **子弹/敌人对象池**：`shoot` / `spawnEnemy` 频繁增删，池化后能削掉大部分分配。
5. **`computeFlowField` 去抖**：每建/升一次墙就跑一次 2209 格全图 BFS（`engine.js:2095/2111`），连续点击时建议合并到下一帧执行一次。

### P2-2 `clearMap()` 显存泄漏

`engine.js:396` 只做了 `scene.remove(mapGroup)`，只额外 dispose 了 `tileMeshes`。水面 `PlaneGeometry`、回落用的 `BoxGeometry` 等**程序化几何体没有释放**，反复重开会累积。建议遍历 `mapGroup`，凡不在 `_sharedGeoms` 里的 geometry 与 clone 出来的 material 一律 dispose。

### P2-3 代码组织

`js/engine.js` 3508 行 / 161KB 单体，地图生成、敌人 AI、炮塔、经济、科技树、UI、引导全挤在一个文件，也是这次三个 P0 能同时潜伏的原因之一。建议按 `map / enemy / turret / economy / ui / quest` 拆模块，并给"流场—移动—攻击门"这条链路补单元测试（这条链路纯逻辑，完全可以在 Node 里脱离渲染直接测）。

---

## 八、建议修复顺序

| 顺序 | 项 | 理由 |
| :--- | :--- | :--- |
| 1 | P0-1 波次重入 | 改动最小（加一个闸门），收益最大 —— 不修的话其它平衡性测试全部没有意义 |
| 2 | P0-2 到达判定 | 让游戏重新"可输"，是所有平衡工作的前提 |
| 3 | P0-3 高度判据统一 + 按格重算方向 | 让敌人真正能上台，前两项才能被观测到 |
| 4 | P1-1 卡死兜底 | 防止偶发卡顿演变成整局停滞 |
| 5 | 烟测改结果断言 | 把上述 4 条固化成回归测试，防止再次"审计全绿但游戏不通" |
| 6 | 平衡性调参 | **放在最后** —— 现在所有平衡数据都是在"敌人到不了、波次会跳"的状态下采的，全部作废 |
| 7 | P2 性能与拆分 | 功能正确后再优化 |

---

## 九、复审数据与产物

| 文件 | 内容 |
| :--- | :--- |
| `smoke/diag-long.mjs` | 长时对局诊断（挂机 / 布防两个场景） |
| `smoke/out/diag-long-afk.log` | 挂机 150s：大门零掉血 |
| `smoke/out/diag-long-defend.log` | 布防 150s：波次 1→12 跳变 |
| `smoke/diag-stuck.mjs` / `out/diag-stuck.log` | 敌人轨迹 + 门口流场，定位震荡 |
| `smoke/diag-dump2.mjs` / `out/diag-dump2.log` | 流场 / 地形 / 高度 / 可通行原始 dump |
| `smoke/diag-wave.mjs` / `out/diag-wave.log` | `waveCleared` 打点取证：单次清波调用 28 次 |

**环境备注**：`E:\坦克大战3D` 是 `E:\GameHub\games\tank3d` 的符号链接，两者是同一份实体目录，不存在双份不同步的风险。

---

**复审结论：v4.3.0 的"地形 / 资产 / UI / 引导 / 建造升级"层可采信；但战斗闭环断裂，3 个 P0 未修复前不应按"已完成"验收。建议按第八节顺序修复，并把烟测改为结果断言式后再重新出平衡性报告～喵**

---

## 十、修复验收（2026-08-29 追加）

以上 P0/P1 全部修复并通过端到端验证，证据如下：

| 缺陷 | 修法（engine.js） | 验证 |
| :--- | :--- | :--- |
| P0-1 波次重入 | `_waveClearing` 闸门 + `startWave`/`resetGame` 复位 | diag-wave.mjs：score 增量恰 600（真实执行 1 次）、startWave 恰 2 次、波次 1→2 ✅ |
| P0-2 敌人打不到门 | `flowDirFor` 增加 `atGate`（hereD≤1 或距基地≤7.5）+ `updateEnemies` 显式啃门分支 | diag-trace8：敌人上台→抵门 atGate=true→gateHp 600→0→STATE.OVER ✅ |
| P0-3 高度判据打架 | ① 坡道 3 格→4 格（每格 0.55<STEP_UP 0.9）② STEP_DOWN=1.7（>坡缘最大落差 1.65、<台面 2.2）③ 单轴被挡时向格心滑移脱困（仅生存，正前方可啃墙时不滑） | trace8：敌人沿坡道走廊 rows34-38 全程无卡顿登台 ✅ |
| P1-1 卡死无兜底 | `updateWatchdog`（无进展语义）：90s（boss 波 130s）内无「敌人死亡/门掉血/墙被拆」任一推进事实 → 每 0.8s 收割一只 | diag-watchdog7：wd89→90 触发、n 1→0、波次 +1 ✅ |
| P1-2 烟测无结果断言 | 新增 `smoke/smoke-assert.mjs`：5 条硬指标全部结果断言（score↑/gateHp↓/波次恰+1/flowDist↓/STATE.OVER） | 5/5 ✅（smoke-assert3.log） |

**验证过程中的关键发现（对后续维护有用）：**
- 测试包装 `waveCleared` 计数会把被闸门吞掉的重复调用也计入（伪影 wc=24），**断言必须用真实执行证据**（score 增量 / startWave 次数 / 波次），不要用包装计数。
- `damageGate` 屏蔽（测试防破门）+ 敌人不死 + `spawnCap` 上限 → `toSpawn` 永卡 1，烟测**不能等待"刷满全波"**，应置空 toSpawn 直接清场。
- P0-2 修复后回归脚本必须屏蔽门伤害，否则 30s 内门就被打穿、游戏失败、尸体冻结（`enemies.length` 永不归零）——这正是旧烟测"7/7 全绿"掩盖 P0 的反向印证。
- 看门狗不能用"敌人位移"当进度信号：被围死的敌人在包围圈内仍会抖动滑动；只有死亡/门掉血/墙被拆才是波次推进事实。
- `_wdStallT` 等模块级 `let` 声明必须在 `resetGame` 首次调用之前（TDZ），放在 `_waveClearing` 附近。

**遗留优化方向（P2，未处理）**：§七 渲染开销（InstancedMesh 化）、`clearMap()` 显存释放、`engine.js` 拆分。平衡性调参建议基于 `smoke-assert.mjs` 重新采样。

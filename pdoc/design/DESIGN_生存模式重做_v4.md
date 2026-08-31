# DESIGN_生存模式重做 v4

> 版本：v4.1.0 ｜ 负责人：Unclecow ｜ 状态：待确认（主框架）

## 一、背景与决策

### 1.1 为什么重做

v3 及之前的生存模式在**玩法理念上没有问题**（WAR3 生存图：经济发育 + 防守一个墙），
但**实现层面全面崩坏**：地形系统脆、悬崖隐形、坡道方向曾反转封死唯一入口，
游戏在系统之上越堆越多，底层却根本没法玩。

本次原则：**理念不变，实现推倒重写，从最底层双层地形开始**。

### 1.2 已确认决策

| 项 | 决策 | 说明 |
|---|---|---|
| 玩法理念 | WAR3 生存图 | 经济发育 + 防守墙，理念沿用 |
| 墙 | **玩家自建** | 不设系统固定门；玩家自己选位置（正常人都懂堵路口） |
| 新手引导 | **三步引导** | 金库 → 墙 → 基础塔，进游戏按 B 逐步指引 |
| 台面高度 | PH = 2.2 | 高地压迫感更强 |
| 坡道 | 3 格长 × 1 格宽 | 每格爬升 0.733，平滑不卡坦克 |
| 地图 | 左下高地 + 唯一坡口 | GRID=47 不变 |
| 视觉资源 | **Kenney 优先，全量接入** | 除坦克保留外，地形/坡道/建筑/塔/墙全部用 Kenney 模型，尽量零程序化 mesh |

## 二、Kenney 全量模型盘点与角色映射

> 已核对磁盘 50 个 .glb 全部有效。下表为每个模型的生存模式职责分配。
> 「已注册」= 已存在于 engine.js ASSET_FILES；「新接入」= 本次需补注册。

### 2.1 地形素材（地板 / 坡道 / 崖壁）

| 模型 | 目录 | 状态 | 生存模式角色 |
|---|---|---|---|
| tile-low | roads | 已注册 | 地面铺装：敌人行军路径路面 |
| tile-high | roads | 已注册 | **台面顶地板**：高地平台铺面（224 格） |
| tile-slant | roads | 已注册 | **坡道**：3 格缓坡（每格 0.733） |
| tile-slantHigh | roads | 已注册 | 备用陡坡（暂不启用） |
| cliff_block_rock | nature | 已注册 | **崖壁主体**：垂直崖壁块 |
| cliff_half_rock | nature | **新接入** | 崖壁矮块：低崖/压顶收边 |
| cliff_blockSlope_rock | nature | 已注册 | 崖壁斜面块：坡口收边 |
| cliff_large_rock | nature | 已注册 | 崖顶大石 / 坡口守卫石 |
| rocks-large | castle | **新接入** | 崖下散石装饰 |
| rocks-small | castle | 已注册 | 崖下散石装饰 |
| detail-rocks | td | 已注册 | 细碎岩石点缀 |
| tree_default/oak/cone/detailed/fat/palm | nature | 5 注册 + palm **新接入** | 台面与地面绿化 |

### 2.2 建筑素材（墙 / 塔 / 房屋）

| 模型 | 目录 | 状态 | 生存模式角色 |
|---|---|---|---|
| wall-narrow-wood | castle | **新接入** | **墙 Lv1 木墙** |
| wall-narrow | castle | 已注册 | **墙 Lv2 石墙** |
| wall | castle | 已注册 | **墙 Lv3 城墙** |
| gate | castle | **新接入** | **墙 Lv4 城门** |
| metal-gate | castle | **新接入** | **墙 Lv5 金属门（终极）** |
| wall-half | castle | 已注册 | 矮墙护栏 / 台面边缘装饰 |
| tower-square-base | castle | **新接入** | **主基地底座**（金库/基地基座） |
| weapon-cannon | td | 已注册 | 备用炮件（坦克塔造型后退役，留作装饰） |
| building-a ~ building-f | commercial | 已注册 | **住房**：6 级升级逐级换模型（平房→大楼） |
| building-skyscraper-a/b | commercial | 已注册 | 科技塔 / 主基地主楼 |
| dumpster | roads | 已注册 | 金矿改型 / 场地杂物 |
| construction-barrier/cone | roads | 已注册 | 可破坏路障 / 杂物 |
| traffic-light / light-square / electricity-pole-single | roads | 已注册 | 台面装饰 |

### 2.3 道路素材（敌人行军路线视觉）

| 模型 | 目录 | 状态 | 生存模式角色 |
|---|---|---|---|
| road-straight / road-curve / road-crossroad / road-side | roads | 已注册 | 地面敌军路径拼接 |
| road-bridge | roads | 已注册 | 备用 |
| bridge-straight / bridge-straight-pillar | castle | **新接入** | 备用桥体 / 桥墩 |
| bridge_center_wood | nature | 已注册 | 备用木桥 |

### 2.4 ASSET_FILES 补注册清单（14 个）

```
["castle/","wall-narrow-wood"],["castle/","gate"],["castle/","metal-gate"],
["castle/","rocks-large"],["castle/","tower-square-base"],
["castle/","bridge-straight"],["castle/","bridge-straight-pillar"],
["nature/","cliff_half_rock"],["nature/","tree_palm"],
["characters/","character-l"],["characters/","character-r"],
["characters/","character-o"],["characters/","character-j"],["characters/","character-g"],
```

> 全量 50 模型 + 5 角色一次性注册。加载失败时 placeModel 自动回退灰盒（现有机制），不阻塞。

### 2.5 敌方角色素材（blocky-characters 包，v4.3.0 新增）

> 来源：`E:\kenny\raw\blocky-characters\Models\GLB format\`（CC0），已复制 5 个至项目 `assets/characters/`。
> 单文件约 110KB，蒙皮绑定 + 内嵌完整动画库：`idle / walk / sprint / die / attack-melee-* / holding-*-shoot / sit / drive` 等。

| 敌型 | 模型 | 形象 | 动画方案 | 缩放 |
|---|---|---|---|---|
| normal | character-l | 科学怪人（绿皮） | walk 循环 / attack-melee 啃墙 / die 死亡 | ×1.0 |
| fast | character-r | 黑忍者 | sprint 循环 / die | ×0.9 |
| heavy | character-o | 兽人（獠牙壮汉） | walk 循环 / attack-melee / die | ×1.3 |
| sniper | character-j | 警察 | walk 循环 / holding-left-shoot 射击 / die | ×1.05 |
| boss | character-g | 战斗机器人（红纹灰甲） | walk 慢放 / attack-melee / die | ×2.2 |

技术要点：
1. **蒙皮多实例克隆必须走 `THREE.SkeletonUtils.clone`**（新增本地 `js/lib/SkeletonUtils.js`，Three r128 官方 examples 工具），直接 `.clone()` 会共享骨架导致全体敌人动画互串
2. 每个敌人实例持独立 `AnimationMixer`，主循环统一 `mixer.update(dt)`
3. 动画状态机：`walk/sprint`（移动）→ `attack-melee / holding-left-shoot`（攻击/射击）→ `die`（死亡后 2s 淡出移除）
4. 素材已验证：本地 GLB 内嵌 animations: True（解析 JSON chunk 确认），无需 FBX 转换

## 三、地形三层解耦（最底层架构）

> 本次重构的根基，上层建筑/寻路/碰撞全部依赖它。

### 3.1 数据层：三正交数组

```js
heightMap[i]   // 每格绝对高度：0 或 PH(2.2)
slopeMap[i]    // 坡道数据：null 或 {from:0, to:PH, dir:{x,z}}  // dir 为从低到高方向
surfaceMap[i]  // 表面类型：EMPTY/BRICK/STEEL/WATER/TREE/GOLD/... 只管表面放了什么
```

- **弃用** 旧版 tile 类型推导高度 + 散装 `rampDir[]`
- `heightAt(px,pz)` = 查 heightMap + slopeMap 线性插值，**零特判链**
- 新地图定义：直接声明三种数组，代码可读、可配置

### 3.2 几何层：全 Kenney 拼装（所见即所得）

**取代** 旧版"程序化侧壁 + 石头装饰"的混合方案，全部使用模型：

- **台面铺面**：`tile-high` 铺满 224 格（placeModel 按格宽缩放）
- **坡道**：3 格 `tile-slant`，方向由 slopeMap 数据决定（视觉自带坡度）
- **崖壁**：`cliff_block_rock`（垂直块）+ `cliff_half_rock`（低崖）沿台面边界排布；
  `cliff_blockSlope_rock` 在坡口收边；`rocks-large/small`、`detail-rocks`、`cliff_large_rock` 散落压景
- **敌军路径**：`road-straight/curve/crossroad` 从 3 出生点拼接至坡口
- **视觉边界 = 碰撞边界**：高度差 =PH 的格子边界必然生成崖壁模型，玩家一眼看懂

> 实现期校验点：实测各模型缩放后高度与 PH=2.2 匹配（tile-high 缩放到格宽 4 后高度约 2.0±，
> 由 maxH 参数收敛到 2.2，缝隙用 cliff_half_rock 收口）。此步骤在实施时逐个目检模型。

### 3.3 通行层：高度感知统一

- `blockedForTank`：**四角 + 中心**高度采样，最大高差 > 0.9 才阻挡
  - 坡道 3 格每格 0.733 → 坦克可平滑跨格上下坡
- `computeFlowField`：BFS 带**层约束**，仅坡道格可作为"换层"通道
  - 敌人路径：出生点 → 地面汇聚 → 唯一坡口 → 破墙 → 上台面
- 炮弹高度判定：崖壁为实体，地面打台面被挡 → 台面形成天然防护

## 四、地图布局（左下高地）

### 4.1 平面图（GRID=47）

```
列→ 0             16  17 18 19               46
行 0 ┌─────────────────────────────────────┐
↓    │       敌人出生区（地面）S1           │
 27  │  S3                          S2     │
 28  │ ╔═══════════════╗ ──────────────── │
     │ ║  高地台面      ║ ▓▓▓ 坡道(col17-19)│
     │ ║ 主基地·金矿    ║ ▓▓▓  ↓ 每格0.733  │
 36  │ ║ 住房·科技·炮位 ║ ←坡口宽1格        │
     │ ╚═══════════════╝ ──────────────── │
 45  └─────────────────────────────────────┘
```

### 4.2 关键坐标

| 元素 | 范围/位置 | 说明 |
|---|---|---|
| 高地范围 | col 1-16 × row 28-45 | 含崖壁格 |
| 台面可用区 | col 2-15 × row 29-44 | 14×16 = 224 格 |
| 坡口 | col 17-19 × row 36 | 3 格长，1 格宽，向东降 |
| 主基地(T_BASE) | col 8-9 × row 37-38 | 台面中央深处，2×2 |
| 金矿点位 | base 周围 4-5 个 | 玩家可加购/再放 |
| 敌人出生点 | S1(左上) S2(右上) S3(右中下) | 地面层边缘 |

### 4.3 台面容量

224 格，可容纳：主基地(4) + 金矿(5~8) + 住房(若干) + 科技塔(1~2) + 炮位(8~12) + 墙。
台面布局留给玩家自由度，不强制格子。

## 五、建筑与墙（Kenney 模型映射）

### 5.1 墙：升级 = 换模型（用户核心创意）

| 等级 | 模型 | 语义 |
|---|---|---|
| Lv1 | wall-narrow-wood | 木栅栏（廉价，HP 低） |
| Lv2 | wall-narrow | 石墙 |
| Lv3 | wall | 城墙（厚实） |
| Lv4 | gate | 城门（带门洞造型） |
| Lv5 | metal-gate | 金属门（终极，HP/反伤最高） |

> 升级时同格销毁旧模型换新模型，粒子效果过渡。模型即等级，一眼可读。

### 5.2 防御塔

- **统一底座**：`tower-square-base`（城堡塔基）
- **炮身**：`weapon-cannon`（沿用现用法）
- 不同塔型靠染色/高度区分；升级时炮身换色 + 底座微调

### 5.3 住房 / 科技塔 / 金矿

- 住房：`building-a`（Lv1）→ `building-f`（Lv6）逐级换模型，人口成长可视化
- 科技塔：`building-skyscraper-a/b` + 发光材质
- 金矿：`dumpster`/`rocks-large` 基座 + 小型水晶配件（保留程序化水晶作发光点，非主体）
- 主基地：`building-skyscraper-b` + `tower-square-base` 组合

## 六、新手引导三步（quest 系统）

> 用户决策：引导代替说明文档，三步即够。

| 步骤 | 引导内容 | 完成检测 |
|---|---|---|
| 1 | 按 B 打开建造 → 选金库 → 放置在高地上 | 第一个金库放置成功 |
| 2 | 放置一个墙 | 第一个墙放置成功（提示"堵住路口"） |
| 3 | 放置一个基础塔 | 第一个塔放置成功 |

- 引导 UI：目标高亮 + 箭头/文字提示，不阻断操作
- 完成三步后自动消失，进入自由发展
- quest 状态机独立模块，可复用、可跳过（右键/ESC 跳过）

## 七、上层系统接缝（下一层细化，本版只定边界）

| 系统 | 本版边界 | 待细化 |
|---|---|---|
| 建筑系统 | 金库/墙/塔为正式建筑，有 HP/功能 | 建造菜单、升级、放置合法性 |
| 经济 | 金库产金，金币来源 | 数值、产出曲线 |
| 敌人/波次 | 地面出生 → 汇聚坡口；模型=blocky-characters 人物/生物（见 2.5） | 波次表、强度曲线 |
| 科技 | 保留理念 | 分支、数值全部重定 |
| 胜负判定 | 待定（建议：基地被破=失败） | 确认后定 |

## 八、风险与规避

| 风险 | 规避 |
|---|---|
| 坡道方向反转封死入口 | slopeMap 结构化 {from,to,dir}，生成后自检：坡口两端可通行 |
| 坦克卡坡 | 3 格坡(0.733/格) + 四角采样 |
| 悬崖隐形 | Kenney 崖壁模型全覆盖，视觉=碰撞 |
| 模型缩放后高度与 PH 不匹配 | 实施期逐模型目检，maxH 收敛 + cliff_half_rock 收口 |
| 224 格 tile-high 性能 | 每格单 mesh 可接受（旧地图同等规模）；必要时合并同材质几何 |
| 寻路抖动 | flow field 层约束 |
| 引导繁琐 | 三步即止，可跳过 |
| 模型加载失败 | placeModel 现有灰盒回退机制，不阻塞 |
| 蒙皮敌人共享骨架动画互串 | 强制 SkeletonUtils.clone；首个敌人入场时目检两只敌人动画独立 |

## 九、验收标准

1. 台面 224 格全部可站立、可放建筑，四周 Kenney 崖壁完整无破洞
2. 唯一坡口：敌人可从地面经坡道上下，坦克亦可平滑上下
3. 敌人从 3 出生点沿 road 路径自然汇聚到坡口，无绕远、无卡墙
4. 三步引导可完整走通：金库→墙→塔
5. 墙任意位置可建；升级时模型逐级更换（木→石→城→门→金属）
6. 除玩家坦克外，场上可见物体全部来自 Kenney 模型（坦克塔/建筑/墙/敌人人物，零程序化建筑体）
7. 敌人为蒙皮角色：多只同屏动画互不干扰，walk→attack→die 状态切换正确，死亡后正常移除

## Change Logs

| 日期 | 版本 | 变更描述 | 负责人 |
|:--|:--|:--|:--|
| 2026-08-28 | v4.3.0 | 敌方改用 Kenney blocky-characters 人物/生物（l科学怪人/r忍者/o兽人/j警察/g战斗机器人），SkeletonUtils+AnimationMixer 动画链路，补注册至 14 个 | Unclecow |
| 2026-08-28 | v4.2.0 | 防御塔改为固定坦克塔（makeTank 复用+涂装缩放映射能力），tower-square-base 转主基地底座 | Unclecow |
| 2026-08-28 | v4.1.0 | 按用户指令改为 Kenney 优先：全量盘点 50 模型、补注册 9 个、墙升级换模型、塔用 tower-square-base 底座、住房逐级换模型 | Unclecow |
| 2026-08-28 | v4.0.0 | 生存模式推倒重建，确立双层地形三层解耦架构、左下高地+唯一坡口布局、PH2.2+3格坡、玩家自建墙+三步引导 | Unclecow |

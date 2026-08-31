## 2026-08-29 · 独立复审（★ 推翻上面「7/7 通过」结论）

- 重跑 150s 对局取证，发现 3 个阻断级缺陷，详见 pdoc/report/REPORT_生存模式v4.3.0独立复审.md
- **P0-1 波次重入**：waveCleared(engine.js:2466) 无一次性闸门，触发点 3084；1.8s 窗口内每帧重复调用。
  实测单次清波 waveCleared×28、startWave×17、波次 1→17、score 600→16900，直接跨过 victoryWave=15；帧率越高越严重
- **P0-2 敌人永远打不到门**：flowDirFor(1497) 在流场最小值 d=1 处被推向 d=2 → 门口反复弹跳；
  啃门分支(2969) 要求 !moved 才触发 → 永不啃门。挂机 150s 大门 600/600 零掉血 → **游戏不存在失败条件**
- **P0-3 流场/移动高度阈值打架**：BFS 用格心高差 1.2(1489)，移动用五点采样高差 0.9(1411)；
  坡道高度沿 x 插值(432-438)，流场规划出物理走不通的「北侧直上坡」路线 → 敌人撞空气墙；
  叠加 thinkTimer=1~2.6s 但 1 秒穿 1 格 → 过冲震荡，d=15 处 x=17~20 来回
- **流程教训**：33s 烟测 + 只断言「无 console error」不足以证明游戏可玩；
  `lives:3` / `enemyCount 2→6` 不是「敌人到达」的证据（150s 实测恰恰相反）。必须改结果断言式烟测
- **结论**：现有全部平衡性数据作废（采集于「敌人到不了 + 波次会跳」的破损状态），须修完 P0 后重采
- 环境：E:\坦克大战3D 是 E:\GameHub\games\tank3d 的符号链接，同一实体，无同步风险；
  `?ff=` 支持 10× 时间倍速(engine.js:3278)，长局测试可压缩到几十秒
- 新增诊断脚本：smoke/diag-long.mjs（长时对局）、diag-stuck.mjs（轨迹+流场）、diag-dump2.mjs（原始 dump）、diag-wave.mjs（重入打点）

## 2026-08-29 · ★ P0/P1 全部修复完成（v4.4）—— 战斗闭环端到端打通

- **P0-1**：`_waveClearing` 闸门 + startWave/resetGame 复位。验证：score 增量恰 600、startWave 恰 2 次、波次 1→2
- **P0-2**：`flowDirFor` 增加 atGate（hereD≤1 或距基地≤7.5）+ updateEnemies 显式啃门分支（不依赖 !moved），
  并与撞墙分支 else-if 互斥（修掉 wallCd 每帧双重递减、啃门频率 2 倍的次生 bug）。
  验证：敌人北上→爬坡→登台→atGate=true 啃门→gateHp 600→0→STATE.OVER
- **P0-3**：坡道 3→4 格（每格 0.55<0.9）+ 走廊扩 rows 34-38 + STEP_DOWN=1.7（>坡缘落差 1.65、<台面 2.2）
  + 单轴被挡时「向格心」垂直滑移脱困（正前方可啃墙时不滑，保留拆墙行为）。验证：trace8 全程无卡顿登台
- **P1-1**：updateWatchdog 无进展语义（90s/boss130s 无「死亡/门掉血/拆墙」任一事实→每 0.8s 收割一只）。
  **不能用位移当进度信号**——被围死的敌人也会抖动。验证：wd89→90 触发收割、波次 +1
- **P1-2**：新增 smoke/smoke-assert.mjs 结果断言烟测（5 条硬指标），5/5 通过；老烟测 0 errs 兼容
- **方法论教训**：包装函数计数含被闸门吞掉的伪影→断言用真实执行证据；测试屏蔽 damageGate 后不能等"刷满全波"（spawnCap 卡死）；
  P0-2 修复后回归脚本须屏蔽门伤害防误报；Playwright 诊断脚本要带全局看门狗+evaluate 超时
- 详见 REPORT_生存模式v4.3.0独立复审.md §十 修复验收；平衡性调参可基于 smoke-assert.mjs 重新采样

## 2026-08-29 · 完成性审计 v4.3.0（7/7 通过）　← 已被上面的独立复审推翻，仅作历史留档

- 依据 smoke/out/summary.json + engine.js 代码现场 + 5 张烟测截图，逐条核验 DESIGN_v4 §九 全部 7 条验收标准
- 结论：7/7 通过，v4.3.0 达到发布标准；产出 pdoc/report/REPORT_生存模式完成性审计v4.3.0.md
- 残留建议（不阻断发布）：R-1 补敌人 die 动画实击用例（本次 score=0 未触发）；R-2 资产增删时保留 makeTank 兜底；R-3 墙 Lv3~Lv5 升级链未在烟测覆盖

## 2026-08-28 20:00 · 修复 + 端到端验证（三轮）

- **修复射程单位不一致**：config.js `range:14`（格）与引擎世界坐标比较不一致，三处补 `*TILE`（升级/建造1/建造2），机枪塔射程 14→56 世界单位
- **修复墙升级不可达**：tryPlace 入口新增 `wallUpgradeTarget` 判定，`T_STEEL` 墙格放行升级分支，墙升级链可达
- **修复 Esc→PLAYING 30s 超时**：keydown Escape 分支新增 `STATE.PREP` 处理，`game.prepTime=0` 归零由主循环过渡
- **新增 diag-e2e.mjs**：沿 z=33 行布 3 座 mg，循环采样 score/lives/n/bullets，端到端击杀验证 score=200@20s
- **新增 diag-econ.mjs**：真实经济采样（不注入金币），250 开→180 买矿→645/50s，经济健康
- **烟测重跑**：errs=0, pageErrs=0, badNet=0；升级墙 Lv1→Lv2（5108→5090, hp70）；33s score=0（仅在台面内部放1座塔，敌不经塔，非 bug）
- **平衡性收敛**：射程修复后 mg DPS=30 可正常击杀、经济健康、首波紧受 headless 丢帧失真，判断无需改 spawnInterval/金币等数值
- 详见 pdoc/report/REPORT_生存模式BUG修复汇总.md、pdoc/report/REPORT_CONFLICT_SURVIVAL_BUILDS挂载位置错位.md

## 2026-08-28 生存模式 v4.3.0 重做
- 墙升级链 5 级落地：WALL_LEVELS[木12→石18→钢32→门50→铁70] 单级价 + wallMeta{lv,hp,thorns}
- 价格双轨对齐：engine.js WALL_LEVELS.price 与 config.js wallUpgradeCosts 严格一致
- 修复墙升级双扣金币 Bug：tryPlace 入口预扣 cost 后在升级分支先退还再按 upCost 扣
- buildWallTile 改造支持 level 参数（兼容经典模式 boolean 老接口）
- 拆墙 refund 改为累计价 ×0.5（拆除 Lv3 退 31 / Lv5 退 91）
- 详见 pdoc/report/REPORT_生存模式重做v4实施总结.md

## 2026-08-27 上午
- 生存地图 Kenney 视觉装饰：告别"抽象格子"，搭建森林遗迹风场景骨架
- engine.js genMap survival 分支新增装饰层：稀疏森林（~66棵树写 grid=T_TREE）、刷怪点→大门 L 型走廊铺道路、荒野岩石/残墙点缀（纯视觉模型）
- 装饰严格零玩法影响：T_TREE 可通行不阻挡、不改流场；树/路/岩石全部规避围墙内、刷怪清场区、大门前留白、走廊格，互不重叠
- 地面色调整为生存夜景绿地 0x1d2b22

## 2026-08-27 高台改造
- 生存基地改"高台要塞"：左下角由围墙升级为可守高地（魔兽 RPG 风），基地区域 9×11 → 16×17 扩大
- engine.js genMap survival 重写：内部 T_PLATEAU 塔台(高1.6) + 四周 T_STEEL 不可破岩壁 + 仅南缘一条 T_RAMP 坡道连回地面，坡道顶端即大门(T_BASE)
- 关键机制联动：heightAt 让 survival 大门口与塔台面齐平(PH)；blockedForTank 新增 isPlayer 参数，玩家可穿自家大门、敌人不可
- 修复敌人贴门空转：updateEnemies 中 f.best==null 时改为朝向 baseGroup 大门方向啃门
- 流场 passableForFlow 将 T_BUILDING 主楼阻断，防敌人在高台内卡住；玩家出生点移到高台内部主楼前
- 大门模型 y 改为 heightAt 贴台面；启动相机改为生存优先俯视基地高台
- 变更文件：js/config.js（base/enclosure）、js/engine.js（genMap/heightAt/blockedForTank/updateEnemies/spawnPlayer/buildBase/passableForFlow）
- 详细设计见 pdoc/design/DESIGN_三模式重做_v3.md 与 pdoc/archive/design/DESIGN_高台生存模式_v1.md
- 高台边缘视觉调整：T_STEEL 从"石墙"改为 cliff_block_rock 岩块（与台面一体），保留碰撞/流场阻断语义但视觉上呈现为天然岩台而非砌墙



## 2026-08-26
- 生存模式（原"无尽"）落地：高台地图 + 15波结算(胜/无尽) + Boss周期(16/20/25/30) + 30s发育期
- 金矿经济：6档递增产金数组 [14,20,28,39,55,78]，每秒现金流
- 科技树 A-G 全打通：A经济/B炮伤/C射程/D射速/E冰控/F玩家核心血/G玩家伤害移速
- 新增冰冻塔（frost）承载科技E：范围减速 + 冰伤DoT
- 修复 updateBuiltTurrets 冷却被射程倍率耦合的 bug；修复科技C射程倍率未生效的 bug

## 2026-08-26 16:05
- 修复 Kenney 模型全消失：根因是 glb 异步加载竞态（页面加载即 genMap，模型未就绪整图灰盒回退且无重建钩子）
- engine.js 新增资产就绪追踪（assetsReady/assetsProgress + 加载完成自动重建菜单背景 + 失败告警不再静默）
- home.js enterMode 增加等待门：模型未就绪时显示"素材加载中 x/40"遮罩，就绪后再开局
- 修复生存模式坡道方向向量写反（{x:0,z:-1}→{x:0,z:1}），原 bug 导致唯一入口形成 1.6 高差悬崖、玩家敌人互相隔离
- clearMap 增加 WeakSet 共享几何体保护：clone 与 ASSETS 源共享 geometry，禁止 dispose，杜绝模式切换后砖墙模型被污染
- file:// 协议打开时控制台给出明确警告（浏览器拦截 .glb 请求）
- 详细分析见 pdoc/report/REPORT_模型消失与生存地图修复.md

## 2026-08-26 14:32
- 科技树 UI：T键打开 #tech 面板，renderTech/upgradeTech/前置依赖/满级提示
- 新增 #settle（胜/无尽）、#prepBar（发育期倒计时）弹窗与样式
- 科技 F 升级即时重算核心血量上限，A/B/C/D/E/G 增益已接入各战斗系统

## 2026-08-28 任务三引导收尾
- 修复 resetGame 未清理 quest 状态：engine.js:3271-3273 新增 `if(typeof questReset==="function") questReset();`（用 typeof 防御避免边缘崩溃）
- 确认 Task ⑤-4 已完成：survival 模式墙体/房屋/科技塔用 Kenney 模型（building-a/building-skyscraper-a），其他模式回退程序化几何
- quest 集成完整：startPrep:2615 启动 → 主循环:3175 questTick 推进 → questActive/questIdx/questPanel 全部走单一路径
- 验证要点：跨局重开生存模式时任务面板应从 1/3 重新出现（本次修复的核心场景）

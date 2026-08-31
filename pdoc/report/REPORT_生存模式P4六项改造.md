# 报告：P4 用户 6 项改造（生存模式 v4.4）

日期：2026-08-30　备份链：`js/engine.js.bak-P0 → bak-P2 → bak-P3 → bak-P4（本次改造前）`
对照文档：`pdoc/design/DESIGN_生存模式重做_v4.md`（v4.3.0）
烟测：`smoke/diag-p4.mjs`　产物：`smoke/out/p4-hud.png`、`smoke/out/p4-summary.json`

## 需求 → 实装对照

| # | 用户需求 | 实装 | 位置（engine.js） |
|---|---------|------|------------------|
| 1 | 敌人目标=只攻击墙（不追玩家、不打塔） | 删 holdFire 炮台仇恨块 + meleeTargets（turret/player 择近撕咬）整段；敌人只走流场 → 撞墙啃咬 / atGate 啃门 | updateEnemies |
| 2 | 坡道上可建墙 | cellPlaceable 加 T_RAMP；wallMeta.wasRamp 标记；破墙/拆墙恢复 T_RAMP + buildRampTile 重铺坡道板 | cellPlaceable / tryPlace / 墙破分支 / 拆除分支 |
| 3 | 塔弹穿墙（不被悬崖/自家建筑挡） | shoot() 加 opts.thruWall；updateBuiltTurrets 两处传 thruWall:true；bulletCollide 对 thruWall 弹跳过 T_BRICK/T_STEEL/T_BUILDING | shoot / bulletCollide / updateBuiltTurrets |
| 4 | 屏幕移动=标准平移 | PITCH 固定 60°，camera = camFocus + 方向×DIST 直接赋值无 lerp；WASD/边缘滚动平移 camFocus；滚轮只改 DIST；无摇晃 | 主循环镜头段 |
| 5 | 底部常驻 HUD（魔兽式） | #wc3dock 三栏：左小地图（视野框+点击跳转）/ 中选中面板↔命令卡双态 / 右资源速览（4Hz） | WC3 HUD 区块 |
| 6 | B 进建造 HUD，选中建筑/人物出状态+操作面板 | B 键 openWc3Build/closeWc3Build（不暂停，战斗照常）；wc3PickAt 左键 raycast 反查敌人/塔/矿/墙；wc3RenderSel 0.2s 刷新；命令卡 11 格 | 输入区 + HUD 区块 |

## 烟测断言（diag-p4.mjs，本轮复跑）

1. HUD DOM：7 个 id 全在，wc3dock display:flex ✅
2. B 建造模式：state=5(BUILD)、wc3Build=true、命令卡 11 格、敌人仍在更新（不暂停）✅
3. 坡道建墙：placed=true、wasRamp=true ✅
4. 塔弹 thruWall： bullets 全部 thruWall=true、owner=player ✅
5. 拆墙恢复坡道：grid 回 T_RAMP(9)、flowDist≥0 ✅

已知脚本坑（与既往一致）：node 经 bash 管道退出码不可信（Exit 1 但 RESULT 未打出/产物齐全），
**以产物时间戳 + 断言行输出为准**。本轮复跑产物时间戳 01:03:26，5 条断言全过、page errors: none。

## 截图目验（p4-hud.png）

- 底部三栏 HUD 完整：小地图（含镜头视野框白框）、命令卡（移动/攻击/停止/建造B/科技T/大门G）、资源速览（金币/人口/科技/大门HP）。
- 建造模式提示行、WAVE 信息、防御塔（坦克造型）可见。

## 遗留 / 建议

- 平衡性：金矿收入指数发散问题沿用 P2 结论（未在 P4 范围内调参）。
- 敌人 attack 动画已接（P4-1 hook），Boss 特殊近战表现未做（用户如再提再做）。

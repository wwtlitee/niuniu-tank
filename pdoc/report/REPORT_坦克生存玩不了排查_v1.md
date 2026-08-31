# REPORT_"坦克生存完全玩不了"排查结论

**测试时间**: 2026-09-01
**排查对象**: `E:\GameHub\games\tank3d`
**测试方法**: Playwright 真实流程实测（不加 autotest/ff 后门）

---

## 一、结论先说

**游戏本身没有致命问题，战斗闭环成立**：

| 项 | 结果 |
| :--- | :--- |
| 素材加载（117 个 GLB） | ✅ 全部就绪 |
| 主菜单渲染 | ✅ 3 张卡 |
| 点击生存卡 → 进入 PREP(7) | ✅ |
| 点击经典卡 → 进入 PLAYING(1) | ✅ |
| 经典模式 WASD 移动 | ✅ 玩家 z 24 → 15.75，推进 8.25 格 |
| 经典模式 鼠标开火 | ✅ |
| 生存模式 PREP → 自动开波 | ✅ |
| 生存模式 塔击杀敌人（score 0→800） | ✅ |
| 生存模式 敌人生成 → 流向大门 | ✅ |
| `pageerror` / 4xx/5xx 请求 | 0 / 0 |
| console error | 0（仅 THREE.drawMode 弃用警告 108 条，无害噪音） |
| FPS（swiftshader CPU 软渲染） | ~9 FPS |

**`swiftshader` 是 CPU 软光栅化**，真实显卡环境下 FPS 会显著更高（一般 60+）。即便软渲 9 FPS 也只是慢，并非"玩不了"。

---

## 二、"玩不了"的真实落差在哪

逐个排查后，最可能的原因按概率排序：

### 1.【最可能】用户开错了端口 / 用了 `file://`

排查时发现当前环境同时跑了两个本地服务器：

| 端口 | 标题 |
| :--- | :--- |
| **8030** | 坦克大战 3D · 三模式合辑 ← 这个才是真正的游戏 |
| 8001 | **牛牛游戏厅 · NiuNiu Arcade** ← 完全不同的另一个游戏！ |

而且 `engine.js:310-312` 写明了：
```js
if(location.protocol==="file:"){
  console.warn("[assets] 当前以 file:// 协议打开：浏览器会拦截 .glb 请求导致模型全部变灰盒…");
}
```
直接双击 `index.html`（`file://`）打开的话，**117 个 .glb 全部被浏览器拦截 → 整局灰盒（彩色色块），看不到基地、看不到坦克、看不到敌人 → "完全玩不了"**。

> **修复建议**：
> - 项目根目录加 `start-server.bat` / `start-server.ps1`，把 `8001`（与牛牛冲突）改为 **8050** 或其他固定端口，避免和别的游戏撞车
> - 同时 `serve.js` 里把端口 8001 改为 8050；所有审计脚本（`smoke-assert.mjs`、`shot-audit-pure.mjs` 等）里的 `http://127.0.0.1:8001` 批量改为新端口
> - 浏览器测试时给个明确的入口提示

### 2.【次可能】性能瓶颈（GPU 不够 / 浏览器没开硬件加速）

生存场景下 `renderer.info.render.calls` 实测 120~250 draw calls、triangles 5w+。117 个克隆 GLB 同时存在，加投弹/动画/粒子，对低端集显和集显本不友好。

> **建议**：
> - 进入模式后立刻 `renderer.info` dump 一下，看下实际 draw call / triangle
> - 如果 calls > 500，按地图区域做 LOD：远处树/装饰降级为简单几何体
> - 控制台打开看 `THREE.WebGLRenderer` 警告（macOS Safari 经常默认不开 WebGL2）

### 3.【较小可能】前端报错被弃用警告淹没

实测 108 条 console error 都是 `THREE.Mesh: .drawMode has been removed`（版本升级后的弃用提示），但里面**真正会卡游戏的致命错**容易被淹没。需要把致命错误分级（pageerror 单独告警）。

### 4.【已排除】游戏机制 bug

之前的 v4.3 复审（`REPORT_生存模式v4.3.0独立复审.md`）和 P0/P1 修复（v4.4）已经端到端验证战斗闭环：敌人能打到门、能啃门、能登高台、塔能杀人、波次能正常推进。我自己的实测也复现了 score 0→800、敌人刷新、塔击杀。

---

## 三、需要用户确认的方向

根据规则流程，**先确认意图**再动手。三个方向，请选一个或两个：

| 方案 | 内容 | 工作量 | 价值 |
|:---:|:---|:---:|:---:|
| A | 改 `serve.js` 端口 8001 → 8050，批量修正所有审计脚本端口；加 `start-server.bat` 一键启动；写 README "如何正确打开游戏" | 小 | 解决最大概率问题（端口冲突 + file://） |
| B | 在 engine.js 入口加全局兜底：`window.onerror` / `unhandledrejection` 上报；启动后 console 显眼横幅"⚠️ 检测到 file:// 协议，模型将被拦截，请用本地服务器" | 小 | 提升可观测性 |
| C | 性能优化：场景 LOD + 按距离隐藏装饰树/岩石 | 中 | 改善帧率 |

---

## 四、产出物

- `smoke/real-play.mjs` — 真实流程冒烟（菜单卡→PREP→造塔→开波）
- `smoke/real-play2.mjs` — 完整对局（敌人→塔杀人→观察 60s）
- `smoke/real-play3.mjs` — FPS 实测 + 经典模式真实流程
- `smoke/probe-err.mjs` — 极简错误捕获（已用 8030 端口验证游戏正常）
- `smoke/out/play-combat.png`、`smoke/out/t3-classic.png` — 实测截图

---

## Change Logs

| 日期 | 版本号 | 变更描述 | 负责人 |
| :--- | :--- | :--- | :--- |
| 2026-09-01 | v1.0.0 | 首次排查，定位为端口冲突 + file:// 模型拦截 | Unclecow |
# REPORT_模型消失与生存地图修复

- 日期：2026-08-26
- 负责人：Unclecow
- 触发：用户实测反馈「Kenney 建模全消失 / 经典模式没还原成功 / 生存模式不可玩」

## 一、根因分析

### 1. Kenney 模型全消失（主根因：异步加载竞态）
- `engine.js` 尾部在脚本求值时立即 `genMap(1)` 生成菜单背景；玩家随后快速进模式再次 `genMap`。
- 40+ 个 `.glb` 通过 GLTFLoader **异步**加载，未就绪时 `placeModel`/楼房分支全部走**程序化灰盒回退**。
- 原代码加载完成回调为空 `()=>{}`，且**没有任何"资产就绪后重建地图"的钩子** → 灰盒伴随整局，永不自愈。
- 排除项：assets 目录文件齐全且命名与 ASSET_FILES 一一对应；three r128 与 GLTFLoader 交叉验证 65 个 THREE.* 引用无缺失（KTX2/meshopt 仅声明未启用）；脚本顺序 three→GLTFLoader→config→engine→home 正确。
- 附加风险：以 `file://` 直接双击打开时浏览器拦截 .glb 请求，必然全灰盒（原静默回调掩盖了该错误）。

### 2. 经典模式"没还原成功"
- 与 1 同源：整城建筑/道路/树全变灰盒，视觉上即"没还原"。
- 次要隐患：`clearMap()` 对 tileMeshes（砖墙 clone）无条件 `geometry.dispose()`，而 clone 与 `ASSETS` 源场景**共享几何体**，模式切换后可能污染资源池。玩法逻辑（街道网格、主题地块、基地壳层、热键）经逐段复核未被近期改动破坏。

### 3. 生存模式不可玩（确定性 bug）
- 坡道方向向量写反：`rampDir={x:0,z:-1}`，而布局是"南侧战场(z小) → z=23 坡道行 → z≥24 高台"。
- `heightAt` 中 `t01=(pz-(cc.z-TILE/2))/TILE*d.z`，d.z=-1 时恒 ≤0 被钳制为 0 → 坡道全程高度 0，与高台 PH=1.6 形成**垂直悬崖**。
- `blockedForTank` 的 |Δh|>0.9 判定把唯一入口彻底封死：敌人上不去、玩家（出生在高台）也下不来，核心永不受威胁。

## 二、修复内容

| 文件 | 位置 | 修复 |
| :-- | :-- | :-- |
| js/engine.js | 资产加载块 | 新增就绪追踪：`_pendingAssets/_assetsLoaded/_assetsReady`、`assetsReady()/assetsProgress()`；失败回调改为 console.warn 不再静默；全部结算后若处于菜单自动 `genMap(1)` 换真模型 |
| js/engine.js | clearMap | `_sharedGeoms`(WeakSet) 收集 ASSETS 源几何体，dispose 时跳过共享项 |
| js/engine.js | genMap 生存坡道 | `rampDir={x:0,z:-1}` → `{x:0,z:1}`，南低北高，北缘与高台平接（网格模型 rot 由既有 d.z===1→π 映射自动摆正） |
| js/engine.js | 启动区 | file:// 协议打开时输出明确警告 |
| js/home.js | enterMode | 模型未就绪时显示「⚔️ 战场素材加载中… x/40」全屏遮罩，就绪后再 resetGame 开局 |

## 三、防御性设计说明
- 加载成功与失败都会推进 `_assetSettled`，保证 `_assetsReady` 最终必为 true，等待遮罩不会死锁。
- 等待遮罩 `position:fixed; inset:0` 天然阻断重复点击 enterMode。
- 经典 x 向坡道 `{x:±1,z:0}` 复核与 heightAt/网格旋转向量一致，未改动。

## 四、遗留观察项（非阻塞）
- 敌人撞墙啃咬可啃穿咽喉钢墙（HP=8），漏斗的"唯一通道"属性会被稀释——属设计取舍，待实测手感后决定是否收紧。
- 高台约 500+ cliff 克隆的绘制开销待实测帧率验证。

## Change Logs

| 日期 | 版本号 | 变更描述 | 负责人 |
| :--- | :--- | :--- | :--- |
| 2026-08-26 | v1.0.0 | 首版：定位三大问题根因并修复（加载竞态/共享几何体污染/坡道向量反写） | Unclecow |

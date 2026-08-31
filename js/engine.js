/* =====================================================================
   坦克大战 3D —— 城市巷战 · 肉鸽强化版
   素材：Kenney City Kit（CC0 协议）
   ===================================================================== */
"use strict";

window.addEventListener("error",e=>{
  document.title="ERR:"+e.message;
  let d=document.getElementById("errbox");
  if(!d){d=document.createElement("div");d.id="errbox";
    d.style.cssText="position:absolute;bottom:40px;left:10px;color:#ff5d5d;font-size:14px;z-index:99;white-space:pre-wrap;max-width:80vw;";
    document.body.appendChild(d);}
  d.textContent+="⚠ "+e.message+"\n";
});

/* ---------------- 基础常量 ---------------- */
let GRID = 47;                     // 由激活模式动态设置（默认大地图）
const TILE = 4;
let HALF = GRID*TILE/2;
const PH = 2.2;                       // 高地高度（v4.3：坡道 3 格每格 0.733）

/* 应用模式配置（home.js 进入模式前调用） */
function applyModeConfig(m){
  GRID = m.GRID;
  HALF = GRID*TILE/2;
  if(m.fogFar)scene.fog.far=m.fogFar;
  // 重建地面与网格以匹配当前模式地图尺寸
  scene.remove(ground); ground.geometry.dispose();
  ground=new THREE.Mesh(
    new THREE.PlaneGeometry(GRID*TILE+24,GRID*TILE+24),
    new THREE.MeshStandardMaterial({color:0x1a2632,roughness:.95}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.03; ground.receiveShadow=true;
  scene.add(ground);
  scene.remove(gridHelper); gridHelper.dispose&&gridHelper.dispose();
  gridHelper=new THREE.GridHelper(GRID*TILE,GRID,0x27394c,0x20303f);
  gridHelper.position.y=.01; scene.add(gridHelper);
  // 同步阴影相机范围
  sun.shadow.camera.left=-HALF-10; sun.shadow.camera.right=HALF+10;
  sun.shadow.camera.top=HALF+10; sun.shadow.camera.bottom=-HALF-10;
}

const T_EMPTY=0,T_BRICK=1,T_STEEL=2,T_WATER=3,T_TREE=4,T_BASE=5,
      T_ROAD=6,T_BUILDING=7,T_PLATEAU=8,T_RAMP=9,T_BRIDGE=10;

const STATE={MENU:0,PLAYING:1,UPGRADE:2,PAUSED:3,OVER:4,BUILD:5,TECH:6,PREP:7,SETTLE:8,GATE:9};

/* ★ 生存模式墙升级链（5 级）—— 对应 DESIGN_生存模式重做_v4 §5.1
   - model     : Kenney 城堡资源名
   - hp        : 钢墙耐久（流场视为可破，敌军会啃）
   - price     : 建造价（升级价 = next.price - current.price，差额模式）
   - scale     : 模型缩放（相对 TILE）
   - metalness : 金属度（0=木, 1=金属）
   - tint      : 颜色染色
   - tag       : 提示图标
*/
/* 墙升级链：5 级（Lv1=wood 木→Lv2=narrow 石→Lv3=wall 钢→Lv4=gate 门→Lv5=metal-gate 铁闸）
   price 语义：单级价（与 CONFIG.economy.wallUpgradeCosts 一一对应，索引 0 = 新建价，1~4 = 升级价）
   hp     语义：该级满血量；升级时会叠加一个 baseHp 折算（保持累计血量曲线）
   thorns 语义：被攻击时的反伤比例（0/0/0/0.08/0.18） */
const WALL_LEVELS=[
  {lv:1, model:"wall-narrow-wood", hp:40,  price:12, scale:.85, metalness:0,  roughness:.92, tint:0xc89a6a, tag:"木", thorns:0,    desc:"便宜速堵 · 1 级"},
  {lv:2, model:"wall-narrow",     hp:70,  price:18, scale:.95, metalness:0,  roughness:.82, tint:0xb6a890, tag:"石", thorns:0,    desc:"基础石墙 · 2 级"},
  {lv:3, model:"wall",            hp:130, price:32, scale:1.0, metalness:.65,roughness:.35, tint:0x9db1c7, tag:"钢", thorns:0,    desc:"钢蓝城墙 · 3 级"},
  {lv:4, model:"gate",            hp:220, price:50, scale:1.15, metalness:.4, roughness:.55, tint:0x7a8a5a, tag:"门", thorns:0.08, desc:"城门 · 反伤 8%"},
  {lv:5, model:"metal-gate",      hp:380, price:70, scale:1.3, metalness:.85,roughness:.22, tint:0xc9d2dc, tag:"铁", thorns:0.18, desc:"金属门 · 反伤 18% · 最高"},
];
const WALL_LV_BY_MODEL=Object.fromEntries(WALL_LEVELS.map(w=>[w.model,w.lv]));
/* 单元墙上挂的扩展元数据（升级链查询用） */
const wallMeta=new Map();  // key=idx(cx,cz) -> {lv, hp, thorns}

function wallLvAt(x,z){
  const m=wallMeta.get(idx(x,z));return m?m.lv:0;
}
function wallThornsAt(x,z){
  const m=wallMeta.get(idx(x,z));return m?(m.thorns||0):0;
}
/* 当前等级 curLv 下，再次操作的价（curLv=0 新建，1~4 升级，5 已满） */
function wallPriceNext(curLv){
  if(curLv<1)return WALL_LEVELS[0].price;
  if(curLv>=WALL_LEVELS.length)return Infinity;
  return WALL_LEVELS[curLv].price;
}
function wallPriceNew(){return WALL_LEVELS[0].price;}
function wallFullDesc(lv){
  const w=WALL_LEVELS[lv-1];if(!w)return "";
  const next=lv<WALL_LEVELS.length?`→ Lv${lv+1} 价 ${wallPriceNext(lv)}`:`已满级`;
  return `${w.tag}·Lv${lv} · ❤${w.hp}${w.thorns>0?` · ⚔${Math.round(w.thorns*100)}%`:""} · ${next}`;
}

/* ★ 任务（新手指引）：三步走——金库→墙→塔，仅生存模式开局触发 */
const QUEST_STEPS=[
  {id:"mine",label:"1/3 按 B 键打开商店，选【金库】放到高地上",check:()=>goldMines.length>=1},
  {id:"wall",label:"2/3 选【墙】堵住坡道口（重要：先堵门）",check:()=>steelHP.size>=1},
  {id:"turret",label:"3/3 选一座基础塔保护高台",check:()=>builtTurrets.length>=1},
];
let questIdx=0,questActive=false;
function questReset(){questIdx=0;questActive=false;hideQuestPanel();}
function questShow(){
  if(!questActive)return;
  const step=QUEST_STEPS[questIdx];if(!step)return;
  const el=$("questPanel");
  if(el){
    el.style.display="block";
    el.innerHTML=`<div class="qpTitle">📜 新手引导</div><div class="qpStep">${step.label}</div><div class="qpHint">右键 / ESC 跳过</div>`;
  }
  toast(`📜 ${step.label}`);
}
function questTick(){
  if(!questActive)return;
  const step=QUEST_STEPS[questIdx];
  if(step&&step.check()){
    if(player&&player.group){
      spawnParticles(new THREE.Vector3(player.group.position.x,1.6,player.group.position.z),0x7ec8ff,18,6,1);
    }
    sfx.levelup&&sfx.levelup();
    questIdx++;
    if(questIdx>=QUEST_STEPS.length){
      questActive=false;hideQuestPanel();
      toast("✅ 三步引导完成！自由发展吧");
      return;
    }
    questShow();
  }
}
function hideQuestPanel(){const el=$("questPanel");if(el)el.style.display="none";}
function questSkip(){
  if(!questActive)return;
  questActive=false;hideQuestPanel();
  toast("⏭ 已跳过新手引导");
}
let state=STATE.MENU;

/* ---------------- 场景 ---------------- */
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.getElementById("game").appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0a1018);
scene.fog=new THREE.Fog(0x0a1018,90,200);

const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,400);

scene.add(new THREE.HemisphereLight(0xbfd8ff,0x2a3848,.95));
scene.add(new THREE.AmbientLight(0x4a5568,.55));
const sun=new THREE.DirectionalLight(0xfff2d8,1.05);
sun.position.set(35,60,-25);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-HALF-10; sun.shadow.camera.right=HALF+10;
sun.shadow.camera.top=HALF+10;   sun.shadow.camera.bottom=-HALF-10;
sun.shadow.camera.far=200;
scene.add(sun);

// 地面（尺寸随模式动态重建）
let ground=new THREE.Mesh(
  new THREE.PlaneGeometry(GRID*TILE+24,GRID*TILE+24),
  new THREE.MeshStandardMaterial({color:0x1a2632,roughness:.95}));
ground.rotation.x=-Math.PI/2; ground.position.y=-.03; ground.receiveShadow=true;
scene.add(ground);
let gridHelper=new THREE.GridHelper(GRID*TILE,GRID,0x27394c,0x20303f);
gridHelper.position.y=.01; scene.add(gridHelper);

addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

/* WebGL context 恢复后强制全量纹理重传（共享材质纹理 version 不变不会自动重传） */
renderer.domElement.addEventListener("webglcontextrestored",()=>{
  let n=0;
  scene.traverse(o=>{
    const mats=Array.isArray(o.material)?o.material:(o.material?[o.material]:[]);
    mats.forEach(m=>{m.needsUpdate=true;n++;});
  });
  console.log("[engine] webglcontextrestored: refreshed",n,"materials");
});

/* ---------------- 音效 ---------------- */
let AC=null;
function audio(){ if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)(); return AC; }
function beep(freq,dur,type="square",vol=.15,slide=0,when=0){
  try{
    const ac=audio(),o=ac.createOscillator(),g=ac.createGain();
    o.type=type;o.frequency.value=freq;
    const t0=ac.currentTime+when;
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),t0+dur);
    g.gain.setValueAtTime(vol,t0);
    g.gain.exponentialRampToValueAtTime(.001,t0+dur);
    o.connect(g);g.connect(ac.destination);
    o.start(t0);o.stop(t0+dur+.02);
  }catch(e){}
}
const sfx={
  shoot : ()=>beep(720,.08,"square",.08,-400),
  eshoot: ()=>beep(360,.08,"square",.05,-180),
  boom  : ()=>beep(90,.35,"sawtooth",.22,-60),
  bigboom:()=>beep(60,.6,"sawtooth",.3,-40),
  hit   : ()=>beep(240,.06,"triangle",.1,-100),
  pickup: ()=>{beep(660,.09,"sine",.14);setTimeout(()=>beep(990,.12,"sine",.14),90);},
  levelup:()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,.14,"sine",.14),i*90));},
  hurt  : ()=>beep(140,.2,"sawtooth",.18,-60),
};
/* 经典开场号角（致敬 Battle City 开局曲，8-bit 合成） */
function playIntro(){
  const seq=[ // [频率, 起拍, 时长]
    [98.0,0.00,.22],[98.0,.30,.22],[98.0,.60,.32],
    [130.8,1.04,.15],[146.8,1.21,.15],[164.8,1.38,.15],[196.0,1.55,.16],
    [164.8,1.82,.15],[146.8,1.99,.15],[130.8,2.16,.15],[123.5,2.33,.30],
    [98.0,2.72,.22],[130.8,2.96,.22],[164.8,3.20,.22],[196.0,3.44,.55],
  ];
  seq.forEach(([f,t,d])=>{
    beep(f,d,"square",.12,0,t);
    beep(f*.5,d,"triangle",.10,0,t);       // 低八度和声
    beep(f*1.005,d,"square",.04,0,t);      // 微失谐厚度
  });
}

/* ---------------- Kenney 素材系统（GLTF + 失败回退）---------------- */
const ASSETS={}, ASSET_BOX={}, ASSET_ANIMS={};
let gltfLoader=(window.THREE&&THREE.GLTFLoader)?new THREE.GLTFLoader():null;

const ASSET_FILES=[
  ["commercial/","building-a"],["commercial/","building-b"],["commercial/","building-c"],
  ["commercial/","building-d"],["commercial/","building-e"],["commercial/","building-f"],
  ["commercial/","building-skyscraper-a"],["commercial/","building-skyscraper-b"],
  ["roads/","road-straight"],["roads/","road-crossroad"],["roads/","road-curve"],["roads/","road-side"],
  ["roads/","tile-high"],["roads/","tile-low"],["roads/","tile-slant"],["roads/","tile-slantHigh"],
  ["roads/","road-bridge"],["roads/","construction-barrier"],["roads/","construction-cone"],
  ["roads/","dumpster"],["roads/","traffic-light"],["roads/","light-square"],["roads/","electricity-pole-single"],
  /* 城堡包：砖墙 / 钢墙 */
  ["castle/","wall-narrow"],["castle/","wall"],["castle/","wall-half"],["castle/","rocks-small"],
  /* 城堡包：墙升级链 / 大门 / 主基地底座 / 岩石 / 桥 */
  ["castle/","wall-narrow-wood"],["castle/","gate"],["castle/","metal-gate"],
  ["castle/","rocks-large"],["castle/","tower-square-base"],
  ["castle/","bridge-straight"],["castle/","bridge-straight-pillar"],
  /* 塔防包：基地防御炮台 / 岩石装饰 */
  ["td/","weapon-cannon"],["td/","detail-rocks"],
  /* 自然包：树 / 悬崖（高地与坡道）/ 木桥 */
  ["nature/","tree_default"],["nature/","tree_oak"],["nature/","tree_cone"],
  ["nature/","tree_detailed"],["nature/","tree_fat"],["nature/","tree_palm"],
  ["nature/","cliff_block_rock"],["nature/","cliff_blockSlope_rock"],["nature/","cliff_large_rock"],
  ["nature/","cliff_half_rock"],
  ["nature/","bridge_center_wood"],
  /* 角色包：敌方单位（blocky-characters，含骨骼动画） */
  ["characters/","character-l"],["characters/","character-r"],["characters/","character-o"],
  ["characters/","character-j"],["characters/","character-g"],
  /* ★ P5 怪物包（graveyard-kit）：丧尸/骷髅/吸血鬼/幽灵/守墓人 —— 尸潮敌方主力 */
  ["monsters/","character-zombie"],["monsters/","character-skeleton"],
  ["monsters/","character-vampire"],["monsters/","character-ghost"],["monsters/","character-keeper"],
  /* ★ P5 地板铺装（3d-road-tiles 方砖转制）：一层草地/石板地，消除"纯色空地"粗糙感 */
  ["floors/","floor-grass"],["floors/","floor-grassB"],["floors/","floor-grassC"],
  ["floors/","floor-stone"],["floors/","floor-stoneB"],
  /* ★ P5b tower-defense-kit：带 colormap 质感的草皮方砖（一层地面主力） */
  ["tdkit/","tile"],["tdkit/","tile-bump"],["tdkit/","tile-dirt"],["tdkit/","tile-rock"],
  ["tdkit/","tile-hill"],["tdkit/","tile-tree"],["tdkit/","tile-straight"],["tdkit/","tile-crossing"],
  ["tdkit/","tile-corner-inner"],["tdkit/","tile-corner-outer"],["tdkit/","tile-end"],["tdkit/","tile-split"],
  ["tdkit/","tile-wide-straight"],["tdkit/","tile-wide-corner"],["tdkit/","tile-straight-slope"],["tdkit/","spawn-square"],
  /* ★ P5b platformer-kit：圆角草块地形系（台面/坡道/边缘）+ 装饰 */
  ["platformer/","block-grass"],["platformer/","block-grass-edge"],["platformer/","block-grass-corner"],
  ["platformer/","block-grass-corner-low"],["platformer/","block-grass-curve"],["platformer/","block-grass-curve-half"],
  ["platformer/","block-grass-curve-low"],["platformer/","block-grass-large"],["platformer/","block-grass-large-slope"],
  ["platformer/","block-grass-large-slope-steep"],["platformer/","block-grass-low"],["platformer/","block-grass-low-large"],
  ["platformer/","block-grass-low-long"],["platformer/","block-grass-long"],["platformer/","block-grass-narrow"],
  ["platformer/","tree"],["platformer/","tree-pine"],["platformer/","tree-pine-small"],
  ["platformer/","rocks"],["platformer/","stones"],["platformer/","flowers"],["platformer/","flowers-tall"],
  ["platformer/","grass"],["platformer/","hedge"],["platformer/","hedge-corner"],
  ["platformer/","fence-straight"],["platformer/","fence-corner"],["platformer/","fence-broken"],
  ["platformer/","chest"],["platformer/","crate"],["platformer/","crate-strong"],["platformer/","coin-gold"],
  ["platformer/","barrel"],["platformer/","sign"],["platformer/","flag"],["platformer/","ladder"],
  ["platformer/","pipe"],["platformer/","plant"],["platformer/","mushrooms"],
];
/* 资产就绪追踪：genMap 若在加载完成前执行会整图灰盒回退；
   全部结算后自动重建菜单背景，并暴露 assetsReady()/assetsProgress()
   供 home.js 在进模式前等待，杜绝"整局灰盒"竞态 */
let _pendingAssets=0,_assetsLoaded=0,_assetFailCount=0,_assetsReady=false;
const _sharedGeoms=new WeakSet();   /* ASSETS 源场景几何体（clone 与源共享），严禁 dispose */
function assetsReady(){return _assetsReady;}
function assetsProgress(){return [_assetsLoaded,ASSET_FILES.length];}
function _assetSettled(){
  _assetsLoaded++;
  if(_pendingAssets>0&&_assetsLoaded<_pendingAssets)return;
  _assetsReady=true;
  if(_assetFailCount>0)console.warn(`[assets] ${_assetFailCount} 个模型加载失败，对应地块已回退程序化盒子`);
  else console.info(`[assets] 全部 ${ASSET_FILES.length} 个模型就绪`);
  if(state===STATE.MENU)genMap(1);   /* 菜单背景立即换上真模型 */
}
if(gltfLoader){
  _pendingAssets=ASSET_FILES.length;
  ASSET_FILES.forEach(([dir,name])=>{
    gltfLoader.load("assets/"+dir+name+".glb",g=>{
      ASSETS[name]=g.scene;
      ASSET_BOX[name]=new THREE.Box3().setFromObject(g.scene);
      if(g.animations&&g.animations.length)ASSET_ANIMS[name]=g.animations;
      g.scene.traverse(o=>{if(o.isMesh&&o.geometry)_sharedGeoms.add(o.geometry);});
      _assetSettled();
    },undefined,err=>{
      _assetFailCount++;
      console.warn(`[assets] 加载失败: ${dir}${name}.glb`,(err&&err.message)||err||"");
      _assetSettled();
    });
  });
}else{
  _assetsReady=true;
  console.warn("[assets] THREE.GLTFLoader 缺失，全部走程序化盒子回退");
}
if(location.protocol==="file:"){
  console.warn("[assets] 当前以 file:// 协议打开：浏览器会拦截 .glb 请求导致模型全部变灰盒，请改用本地服务器访问（如 VSCode Live Server / npx serve）。");
}
/* 放置模型：宽度缩放到 w，底面贴在 y0；加载失败时回退程序化盒子 */
const _tmpBox=new THREE.Box3(),_tmpSize=new THREE.Vector3();
function placeModel(parent,name,x,z,w,rotY,y0,color,hint_h,maxH){
  const src=ASSETS[name];
  const obj=new THREE.Group();
  obj.userData.assetName=name;   /* ★诊断：独立放置组携带资产名，便于运行时违和点定位 */
  if(src){
    const inst=src.clone(true);
    _tmpBox.setFromObject(inst); _tmpBox.getSize(_tmpSize);
    let s=w/Math.max(.001,Math.max(_tmpSize.x,_tmpSize.z));   // 按最大水平维度缩放
    if(maxH&&_tmpSize.y*s>maxH)s=maxH/_tmpSize.y;             // 细高模型限高
    inst.scale.setScalar(s);
    /* ★ P5c-R7：block-grass 系直接放置路径也去红（placeModel 绕过批次系统） */
    if(name.startsWith("block-grass")){
      inst.traverse(o=>{if(o.isMesh&&o.material){o.material=o.material.clone();o.material.color=new THREE.Color(0.58,0.68,0.52);o.material.roughness=.96;}});
    }
    /* ★P5c-R8：color 参数对 GLB 模型也生效——作为乘数染色（树干去红等） */
    if(color&&color!==0xffffff){
      const tint=new THREE.Color(color);
      inst.traverse(o=>{if(o.isMesh&&o.material){o.material=o.material.clone();o.material.color.multiply(tint);}});
    }
    // 重算缩放后的包围盒做居中
    _tmpBox.setFromObject(inst);
    const c=_tmpBox.getCenter(new THREE.Vector3());
    inst.position.sub(c); inst.position.y+=(_tmpBox.max.y-_tmpBox.min.y)/2;
    obj.add(inst);
  }else{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,hint_h||w,w),
      new THREE.MeshStandardMaterial({color:color||0x8899aa,roughness:.8}));
    m.position.y=(hint_h||w)/2;
    obj.add(m);
  }
  obj.position.set(x,y0,z);
  obj.rotation.y=rotY||0;
  parent.add(obj);
  return obj;
}

/* ---------------- 材质（程序化部分保留）---------------- */
const matBrick=new THREE.MeshStandardMaterial({color:0x9c422c,roughness:.95});
const matBrickTop=new THREE.MeshStandardMaterial({color:0xc05f3e,roughness:.9});
const matSteel=new THREE.MeshStandardMaterial({color:0x64707e,roughness:.45,metalness:.5});
const matWater=new THREE.MeshStandardMaterial({color:0x1c4d7a,roughness:.15,metalness:.3,
  transparent:true,opacity:.85});
const matTreeTrunk=new THREE.MeshStandardMaterial({color:0x5d4030});
const matTreeCrown=new THREE.MeshStandardMaterial({color:0x2e7d3a,roughness:1});

/* ---------------- 地图数据 ---------------- */
let grid=[],rampDir=[];        // rampDir[i]={x,z} 上坡方向（视觉朝向用）
/* ★ v4.3 地形数据层：grid=表面语义（碰撞/建造），heightMap=格台面高，slopeMap=坡道插值描述。
   三层正交：高度查询不再依赖 tile 类型分支，任意地图（生存/城市/经典）统一走同一公式。 */
let heightMap=new Float32Array(0),slopeMap=[];
let mapGroup=null;             // 静态装饰总组
const tileMeshes=[];           // 可破坏物（砖）mesh 映射
let baseGroup=null,baseAlive=true,autoTurretObj=null;
let baseShellCells=[],baseOuterCells=[];

const idx=(x,z)=>z*GRID+x;
const inMap=(x,z)=>x>=0&&x<GRID&&z>=0&&z<GRID;
const cellOf=(px,pz)=>({x:Math.floor((px+HALF)/TILE),z:Math.floor((pz+HALF)/TILE)});
const cellCenter=(cx,cz)=>({x:cx*TILE-HALF+TILE/2,z:cz*TILE-HALF+TILE/2});

/* 高度场（v4.3：数据层驱动，与 tile 类型解耦） */
function heightAt(px,pz){
  const c=cellOf(px,pz);
  if(!inMap(c.x,c.z))return 0;
  const i=c.z*GRID+c.x;
  const sl=slopeMap[i];
  if(sl){   // 坡道格：沿上坡方向 base→base+step 线性插值（多格坡每格只抬 step，保证格边界高度连续）
    const cc=cellCenter(c.x,c.z);
    let t01;
    if(sl.x>0)t01=(px-(cc.x-TILE/2))/TILE;
    else if(sl.x<0)t01=((cc.x+TILE/2)-px)/TILE;
    else if(sl.z>0)t01=(pz-(cc.z-TILE/2))/TILE;
    else t01=((cc.z+TILE/2)-pz)/TILE;
    const base=sl.base||0,step=(sl.step!==undefined)?sl.step:PH;
    return base+Math.max(0,Math.min(1,t01))*step;
  }
  return heightMap[i]||0;
}

function buildBrickMesh(cx,cz){
  const c=cellCenter(cx,cz);
  const m=new THREE.Mesh(new THREE.BoxGeometry(TILE*.96,2.6,TILE*.96),
    [matSteel,matSteel,matBrickTop,matSteel,matBrick,matBrick]);
  m.position.set(c.x,1.3,c.z);
  m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return m;
}

/* Kenney 城堡墙地块：按邻接自动转向拼成连续城墙；lv=1~5（生存墙升级链）
   ★ 经典模式调用：buildWallTile(p,x,z,steelFlag) → 回退为 2 档（钢墙/石墙），保证兼容
   ★ 生存模式调用：buildWallTile(p,x,z,lv)  → 使用 WALL_LEVELS[lv-1] 全部参数
*/
function buildWallTile(parent,cx,cz,steelOrLv){
  const c=cellCenter(cx,cz);
  const wallish=t=>t===T_BRICK||t===T_STEEL;
  const nb=(dx,dz)=>inMap(cx+dx,cz+dz)&&wallish(grid[cz+dz][cx+dx]);
  const horiz=nb(1,0)||nb(-1,0);           // 左右有邻墙 → 墙体沿 X 走向
  const rot=horiz?Math.PI/2:0;

  /* 解析等级：若参数是 number 且 1~5 → 升级链；否则按老接口（true=钢墙、false=石墙）回退 */
  let lv,name,tint,metalness,roughness,scale;
  if(typeof steelOrLv==="number"&&steelOrLv>=1&&steelOrLv<=WALL_LEVELS.length){
    const w=WALL_LEVELS[steelOrLv-1];
    lv=steelOrLv;name=w.model;tint=w.tint;metalness=w.metalness;roughness=w.roughness;scale=w.scale;
  }else{
    const steel=!!steelOrLv;
    name=steel?"wall":"wall-narrow";tint=steel?0x9db1c7:0xffffff;
    metalness=steel?.65:0;roughness=steel?.35:.85;scale=steel?1.0:.95;
    lv=steel?3:2;
  }

  const g=placeModel(parent,name,c.x,c.z,TILE*1.04*scale,rot,heightAt(c.x,c.z),tint,scale*3.6);
  g.traverse(o=>{
    if(o.isMesh&&o.material){
      o.material=o.material.clone();
      o.material.color.setHex(tint);
      o.material.metalness=metalness;
      o.material.roughness=roughness;
    }
  });
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return g;
}

/* ★ P2-2：程序化资源深度释放。
   遍历一棵子树，dispose 掉所有「非共享」geometry 与「非共享材质池」里的 material。
   - geometry：clone(true) 与 ASSETS 源共享（_sharedGeoms 登记），严禁 dispose；
     仅 dispose 程序化新建的（台面基座 BoxGeometry、水面 PlaneGeometry、回退盒子等）。
   - material：GLB 模型的材质被同模式多 clone 共享，dispose 会连带毁掉源 ——
     只 dispose 程序化新建材质（不在 _sharedMats 登记表里的）。 */
const _sharedMats=new WeakSet();   /* GLB 源材质（clone 共享），严禁 dispose */
{
  /* 加载完成时把全部 GLB 材质登记为共享 */
  const _regMats=()=>{for(const k in ASSETS){ASSETS[k].traverse(o=>{
    if(o.isMesh){const ms=Array.isArray(o.material)?o.material:[o.material];
      ms.forEach(m=>m&&_sharedMats.add(m));}
  });}};
  if(_assetsReady)_regMats();
  else{const _old=_assetSettled;_assetSettled=()=>{_regMats();_old();};}
}
function _disposeDeep(root){
  root.traverse(o=>{
    if(o.isMesh){
      if(o.geometry&&!_sharedGeoms.has(o.geometry))o.geometry.dispose();
      const ms=Array.isArray(o.material)?o.material:(o.material?[o.material]:[]);
      ms.forEach(m=>{
        if(!m||_sharedMats.has(m))return;
        /* 程序化材质可能带贴图，一并释放（GLB 共享材质已排除） */
        if(m.map)m.map.dispose(); if(m.normalMap)m.normalMap.dispose();
        if(m.roughnessMap)m.roughnessMap.dispose(); if(m.emissiveMap)m.emissiveMap.dispose();
        m.dispose();
      });
    }
  });
}
/* ★ P2-1：静态装饰实例化批处理。
   原实现每格 clone 一个完整 GLB 子树（台面铺板 ~212 个 Group、崖壁岩块 ~70 个），
   主 pass + 阴影 pass 合计 ~560 draw call，软件渲染/集显掉帧主因。
   改为「收集变换 → 统一实例化」：同源模型每子 mesh 只建 1 个 InstancedMesh，
   draw call 从数百降到个位数。矩阵合成与原 clone 逐格定位逐项等价：
   world = T(格中心) · R(随机朝向) · T(居中/埋地偏移) · S(缩放)。 */
const _instBatch=new Map();    // 资产名 -> {subs:[{geo,mat,mw}], records:[Matrix4]}
function _batchCollect(name,M){
  let b=_instBatch.get(name);
  if(!b){
    const src=ASSETS[name];if(!src)return;
    src.updateMatrixWorld(true);
    const subs=[];
    src.traverse(o=>{if(o.isMesh&&o.geometry)subs.push({geo:o.geometry,mat:o.material,mw:o.matrixWorld.clone()});});
    if(!subs.length)return;
    b={subs,records:[]};_instBatch.set(name,b);
  }
  b.records.push(M);
}
function _batchFlush(parent){
  for(const [name,b] of _instBatch){
    for(let si=0;si<b.subs.length;si++){
      const s=b.subs[si];
      /* ★ P5：地板砖压暗染色（夜景草地），克隆材质避免污染共享源 */
      let mat=s.mat;
      if(name.startsWith("floor-")){
        mat=s.mat.clone();
        mat.color=new THREE.Color(0x9db77a).multiply(new THREE.Color(0.55,0.62,0.5));
        if(name.includes("stone"))mat.color.set(0x6f7a6e);
        mat.roughness=.95;
      }
      /* ★ P5c-R7：block-grass 系侧壁去红——colormap 侧面像素是高饱和红棕(R≈0.85,G≈0.35,B≈0.20)，
         旧 R6 用(0.78,0.92,0.80)太亮太淡，乘积后仍是暖橙。
         R7 改用橄榄灰乘数：R 压到 0.58（砍掉 42% 红），G/B 拉到 0.66/0.52（冷绿偏移），
         红棕纹理 × 橄榄灰 ≈ 暗橄榄土，在纯绿世界读作"草块间隙的暗土缝"而非"红圈描边" */
      if(name.startsWith("block-grass")){
        mat=s.mat.clone();
        mat.color=new THREE.Color(0.58,0.68,0.52);
        mat.roughness=.96;
      }
      /* ★P5c-R10：tdkit tile-straight-slope（生存坡道唯一活体橙红源）colormap 实测 avg rgb(135,101,50)，
         几何是完美 1×1 楔形（与地面 tile 同族），故保留几何、仅换色。
         乘数 (0.36,1.45,0.62) 离屏渲染实测 avg rgb(51,144,32)、R 峰值仅 103，
         与平台草地 tile rgb(30,169,78) 同色系，无任何可读作"红条"的残留 */
      if(name==="tile-straight-slope"){
        mat=s.mat.clone();
        mat.color=new THREE.Color(0.36,1.45,0.62);
        mat.roughness=.95;
      }
      /* ★P5c-R11：tile-rock（生存空地 3% 点缀）colormap 实测 avg rgb(89,131,62) 但 redFrac=0.32，
         即 32% 像素为红花瓣/花环细节，离屏采样仍可见红花簇违和。
         与 tile-straight-slope 同款乘数 (0.36,1.45,0.62)：
         红瓣 (0.85,0.35,0.20) → (0.31,0.51,0.12) 暗橄榄；绿底 (0.20,0.51,0.24) → (0.07,0.74,0.15) 鲜草，
         红花簇→绿石堆，几何保留，色彩融入主草坪 */
      if(name==="tile-rock"){
        mat=s.mat.clone();
        mat.color=new THREE.Color(0.36,1.45,0.62);
        mat.roughness=.95;
      }
      const im=new THREE.InstancedMesh(s.geo,mat,b.records.length);
      im.name=name; im.userData.assetName=name;   /* ★诊断：批处理实例携带资产名，便于运行时违和点定位 */
      const m=new THREE.Matrix4();
      for(let r=0;r<b.records.length;r++){
        m.copy(b.records[r]).multiply(s.mw);
        im.setMatrixAt(r,m);
      }
      im.instanceMatrix.needsUpdate=true;
      im.castShadow=!(name==="tile-high"||name.startsWith("floor-"));   /* 薄铺板投影落在正下方基座上不可见 → 关投影省一半阴影 pass */
      im.receiveShadow=true;
      im.frustumCulled=false;             /* r128 实例包围球不可靠，实例分布全图，禁剔除防整批消失 */
      parent.add(im);
    }
  }
  _instBatch.clear();
}
const _mT=(x,y,z)=>new THREE.Matrix4().makeTranslation(x,y,z);
const _mR=y=>new THREE.Matrix4().makeRotationY(y);
const _mS=(x,y,z)=>new THREE.Matrix4().makeScale(x,y,z);

function clearMap(){
  if(mapGroup){
    _disposeDeep(mapGroup);            /* ★ P2-2：先深度释放再 remove，防反复重开泄漏显存 */
    scene.remove(mapGroup);
  }
  mapGroup=new THREE.Group(); scene.add(mapGroup);
  /* clone 与 ASSETS 源共享 geometry，只允许 dispose 程序化几何体 */
  tileMeshes.forEach(m=>{if(m)m.traverse(o=>{if(o.isMesh&&o.geometry&&!_sharedGeoms.has(o.geometry))o.geometry.dispose();});});
  tileMeshes.length=0;
  baseGroup=null;autoTurretObj=null;baseAlive=true;
  wallMeta.clear();   // ★ 清空墙等级元数据（生存模式重开一局）
}

/* ---------------- 城市地图生成 ---------------- */
function genMap(wave){
  clearMap();
  steelHP.clear(); /* ★ 重开一局时清空钢墙耐久表 */
  grid=Array.from({length:GRID},()=>Array(GRID).fill(T_EMPTY));
  rampDir=new Array(GRID*GRID).fill(null);
  heightMap=new Float32Array(GRID*GRID);   // ★ 数据层：默认全 0（平地）
  slopeMap=new Array(GRID*GRID).fill(null);
  genMap.applyShell=applyShell;   /* ★ 提前绑定，确保经典/生存提前 return 也可调用 */

  // 边框钢墙
  for(let i=0;i<GRID;i++){grid[0][i]=grid[GRID-1][i]=T_STEEL;grid[i][0]=grid[i][GRID-1]=T_STEEL;}

  // ---- survival 专用地图：左下高台要塞 + 四周不可破岩壁 + 单坡道 + 顶门 ----
  if(ACTIVE_MODE.mapType==="survival"){
    const B=ACTIVE_MODE.base, E=ACTIVE_MODE.enclosure;
    /* ★ 高台要塞（魔兽 RPG 高地防守）：
       内部=T_PLATEAU 台面(高 PH)；四周=T_STEEL 不可破岩壁(阻断流场+高度差攀爬)；
       仅东缘坡口行开 1 格 T_RAMP 缓坡连回地面；台面深处 2×2 T_BASE 大门(可破，朝东)。
       ★ P3-1 台面不规则化：不再整块矩形，按边缘噪声内缩出凹凸轮廓（缺角/凹湾），
       数据层 heightMap 照常写 PH，渲染时岩壁贴着实际轮廓生成。 */
    /* 边缘内缩伪噪声：以格坐标 hash 生成 0~1，凹口概率沿边缘变化，保证每局不同但成块 */
    const _hash=(x,z)=>{let h=Math.sin(x*127.1+z*311.7)*43758.5453;return h-Math.floor(h);};
    /* 决定格子是否属于台面：外框按噪声内缩（四角必缺、各边随机凹进 0~3 格） */
    const inset=(E.x1-E.x0>=16)?3:2;                       // 凹进最大深度
    const plateauAt=(x,z)=>{
      if(x<E.x0||x>E.x1||z<E.z0||z>E.z1)return false;
      // 距每条边的距离
      const dW=x-E.x0,dE=E.x1-x,dN=z-E.z0,dS=E.z1-z;
      // 四角必缺大块（斜切角）
      if(dW+dN<3||dE+dN<3||dW+dS<3||dE+dS<3)return false;
      // 每条边按行/列 hash 决定该行内缩量 0~inset
      const iW=Math.floor(_hash(0,z)*(inset+1)), iE=Math.floor(_hash(7.3,z)*(inset+1));
      const iN=Math.floor(_hash(x,3.1)*(inset+1)), iS=Math.floor(_hash(x,9.7)*(inset+1));
      return dW>=iW&&dE>=iE&&dN>=iN&&dS>=iS;
    };
    for(let z=E.z0;z<=E.z1;z++)for(let x=E.x0;x<=E.x1;x++){
      if(plateauAt(x,z)){
        grid[z][x]=T_PLATEAU;
        heightMap[z*GRID+x]=PH;                            // ★ 台面高写入数据层
      }
    }
    // 2. 东缘坡口：单格宽 T_RAMP（4 格长缓坡 col16-19 × 1 行）
    /* ★ P3-4 坡道收窄为单格：此前 rows 34-38 × col16-19 五行宽走廊，用户要求 WC3 式单格坡道。
       单格宽(4 世界单位)对敌人半径 1.5 而言，格中心 ±2 内南北无实体墙 → 可通行。
       坡度保持 P0-3 验证过的 4 格剖面（每格抬 PH/4=0.55 < STEP_UP 0.9）。 */
    const RP=ACTIVE_MODE.ramp, RZ=RP.row;
    for(let k=0;k<4;k++){                                   // col 16-19：西高东低，每格抬升 PH/4
      const x=E.x1+k;
      if(!inMap(x,RZ))continue;
      grid[RZ][x]=T_RAMP; rampDir[RZ*GRID+x]={x:-1,z:0};
      /* col16(k=0) base=PH*3/4（西缘=3*0.55=1.65，与台面 2.2 差 0.55 可攀）；
         col17 base=PH/2; col18 base=PH/4; col19 base=0（东缘=0，与地面齐平） */
      slopeMap[RZ*GRID+x]={x:-1,z:0,base:PH*(3-k)/4,step:PH/4};
    }
    // 3. 主基地 2×2 T_BASE（唯一失败判定物，台面中央深处）
    for(let z=B.row;z<=B.row+1;z++)for(let x=B.col;x<=B.col+1;x++){
      grid[z][x]=T_BASE; heightMap[z*GRID+x]=PH;
    }
    baseShellCells=[]; baseOuterCells=[];
    // 3.5 Kenney 地形装饰（纯视觉）：先铺树（写 grid，走既有渲染），再铺道路/岩石/遗迹（网格保持 T_EMPTY）
    ground.material.color.set(0x3d5a3a);        // ★ P5b：生存地面改自然草色（与 TD 草砖同系，暗绿）
    decorateSurvivalGrid();
    buildMapMeshes();
    buildBase(B.gateCol,B.gateRow);     // 大门模型（survival 走 gate 分支）
    decorateSurvivalPaths();
    decorateSurvivalCliff();         // 高台边缘天然化（纯装饰）
    // 4. 流场（敌人 BFS 寻路至大门，自动绕开不可破围墙）
    computeFlowField();
    return;

    /* ---- 生存地图装饰：全部纯视觉，不占用碰撞 / 不改流场（T_TREE/道路格均通行） ---- */
    function inEnclosure(x,z){return x>=E.x0&&x<=E.x1&&z>=E.z0&&z<=E.z1;}
    /* 刷怪点→坡道东口 的走廊格，供铺路与避让共用
       东侧刷怪点 L 型直下；西/北刷怪点绕高台北缘 U 型（与流场 BFS 绕崖路线一致） */
    function survivalCorridor(){
      const spawns=ACTIVE_MODE.spawns||[], set=new Set();
      const RP=ACTIVE_MODE.ramp, gz=RP.row, gx=RP.col+2;      // 坡道正东地面入口
      const north=E.z0-1;                                     // 高台北侧外围行
      spawns.forEach(sp=>{
        if(sp.x>gx){                                          // 东侧刷怪点：L 型直下坡道口
          for(let z=Math.min(sp.z,gz);z<=Math.max(sp.z,gz);z++)set.add(idx(sp.x,z));
          for(let x=gx;x<=sp.x;x++)set.add(idx(x,gz));
        }else{                                                // 西/北刷怪点：U 型绕行
          for(let z=Math.min(sp.z,north);z<=Math.max(sp.z,north);z++)set.add(idx(sp.x,z));
          for(let x=sp.x;x<=gx;x++)set.add(idx(x,north));
          for(let z=north;z<=gz;z++)set.add(idx(gx,z));
        }
      });
      return set;
    }
    function decorateSurvivalGrid(){
      const spawns=ACTIVE_MODE.spawns||[], avoid=new Set();
      spawns.forEach(sp=>{                                   // 刷怪清场区 5×5
        for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
          const x=sp.x+dx,z=sp.z+dz;
          if(inMap(x,z))avoid.add(idx(x,z));
        }
      });
      const RPa=ACTIVE_MODE.ramp;                            // 坡道口周围留白
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        const x=RPa.col+2+dx,z=RPa.row+dz;
        if(inMap(x,z))avoid.add(idx(x,z));
      }
      survivalCorridor().forEach(k=>avoid.add(k));
      const names=["tree_default","tree_oak","tree_cone","tree_detailed","tree_fat"];
      const want=Math.round(GRID*1.4);                       // 47 图 ≈66 棵稀疏森林
      let placed=0,guard=0;
      while(placed<want&&guard<want*10){
        guard++;
        const x=1+Math.floor(Math.random()*(GRID-2)),z=1+Math.floor(Math.random()*(GRID-2));
        if(grid[z][x]!==T_EMPTY||avoid.has(idx(x,z))||inEnclosure(x,z))continue;
        grid[z][x]=T_TREE;placed++;
      }
    }
    function decorateSurvivalPaths(){
      const corridor=survivalCorridor();
      /* ★ P5c：道路砖。证件照审查发现 TD kit 的 tile-straight/crossing 实为「橙红凹坑」
         （塔防修塔坑位），铺在路上就是满地红坑的违和源——全部弃用。
         改用 platformer 的 block-grass-long（2.08×1.08×0.5 长条实心草砖）沿走向铺路，
         与台面/崖壁同族同色，横段竖铺、竖段横铺形成砖缝节奏。y=0.02 微凸区分路面。
         铺路格记入 _roadCells，让 buildMapMeshes 的 T_EMPTY 分支跳过草砖（防 z-fight）。 */
      if(!window._roadCells)window._roadCells=new Set();
      window._roadCells.clear();
      const has=(x,z)=>inMap(x,z)&&corridor.has(idx(x,z));
      /* ★ P5c-R8：走廊路砖视觉移除——block-grass-long 在纯绿世界里形成"绿墙/围栏"感，
         且走廊沿地图边缘走时特别刺眼。保留 _roadCells 数据标记（防 z-fight），不再渲染路砖。
         荒野 TD 不需要人造道路；敌人寻路自有 BFS 流场。 */
      /*
      corridor.forEach(k=>{
        const x=k%GRID,z=(k/GRID)|0;
        if(grid[z][x]!==T_EMPTY)return;
        window._roadCells.add(idx(x,z));
        const c=cellCenter(x,z);
        const horizN=has(x-1,z)||has(x+1,z);
        const vertN=has(x,z-1)||has(x,z+1);
        if(horizN&&vertN)placeModel(mapGroup,"block-grass",c.x,c.z,TILE*1.06,0,0.0,0xffffff,.3);
        else if(vertN)placeModel(mapGroup,"block-grass-long",c.x,c.z,TILE*1.02,Math.PI/2,0.0,0xffffff,.3);
        else placeModel(mapGroup,"block-grass-long",c.x,c.z,TILE*1.02,0,0.0,0xffffff,.3);
      });
      */
      // 荒野点缀：★P5c-R8 全部移除——stones=紫灰尚可但 flowers=红花在纯绿世界刺眼，
      // plant/grass 与地面草砖重复。荒野 TD 地面保持干净统一，不做零散点缀。
      // 如需日后恢复，只保留 stones 并压暗颜色。
    }
    /* 高台边缘天然化：台面外圈长出大岩石，外侧贴墙堆碎石，坡道口留白
       —— 纯装饰：不写 grid、不改流场、不影响任何玩法
       ★ P3-1：台面不规则后改为「贴实际轮廓」检测——相邻格是台面/坡道/大门即视为边缘 */
    function decorateSurvivalCliff(){
      /* ★P5c-R6：rocks 数组已弃用（detail-rocks/rocks-small 为橙红岩，红簇违和源） */
      const isPlat=(x,z)=>inMap(x,z)&&(grid[z][x]===T_PLATEAU||grid[z][x]===T_BASE||grid[z][x]===T_RAMP);
      /* ★ P5b：台面装饰 platformer-kit 同族。★P5c-R7 点名照认脸：rocks/crate/barrel/sign
         均为橙红系全部剔除；台面只留 stones（紫灰石）/flowers（蓝花）/plant/grass */
      const platProps=[];                                   /* ★R8-final：stones 纹理含红斑，全去掉 */
      const platBig=[];                                      /* ★R8：去 chest（橙红箱） */
      // 1) 高台外侧"贴墙"堆碎石：紧贴台面轮廓外 1 格，避让坡道口/走廊
      const sideAvoid=survivalCorridor();
      for(let z=E.z0-1;z<=E.z1+1;z++)for(let x=E.x0-1;x<=E.x1+1;x++){
        if(!inMap(x,z))continue;
        if(grid[z][x]!==T_EMPTY)continue;                   // 坡道/台面/围墙格：绝不堆石
        if(sideAvoid.has(idx(x,z)))continue;                // 走廊：空
        // 四邻中任一是台面 → 紧贴轮廓
        const onSide=isPlat(x-1,z)||isPlat(x+1,z)||isPlat(x,z-1)||isPlat(x,z+1);
        if(!onSide)continue;
        if(Math.random()<.55){
          const c=cellCenter(x,z);
          /* ★P5c-R9：platProps 为空时跳过（R8 清空了数组但未加守卫，
             导致 platProps[undefined] → placeModel(undefined) → 白色方块） */
          if(!platProps.length)continue;
          const name=platProps[(Math.random()*platProps.length)|0];
          const w=Math.random()<.5?TILE*.6:TILE*.85;
          const ang=Math.random()*6.28;
          placeModel(mapGroup,name,c.x,c.z,w,ang,0,0xffffff,1.4,1.6);
        }
      }
      // 2) 台面外圈"长"装饰：贴实际轮廓的台面格顶面；坡道口让空
      for(let z=E.z0;z<=E.z1;z++)for(let x=E.x0;x<=E.x1;x++){
        if(grid[z][x]!==T_PLATEAU)continue;
        const onEdge=!isPlat(x-1,z)||!isPlat(x+1,z)||!isPlat(x,z-1)||!isPlat(x,z+1);
        if(!onEdge)continue;
        if(x===E.x1&&Math.abs(z-ACTIVE_MODE.ramp.row)<=1)continue; // 东坡道口台面让空
        // 45% 概率摆物：大件（箱/桶/牌）20% + 小件 25%
        const r=Math.random();
        if(r>.45)continue;
        const c=cellCenter(x,z);
        if(r<.18){
          /* ★P5c-R9：platBig 为空时跳过 */
          if(!platBig.length)continue;
          placeModel(mapGroup,platBig[(Math.random()*platBig.length)|0],
            c.x,c.z,TILE*.72,Math.random()*6.28,PH,0xffffff,1.3,1.7);
        }else{
          /* ★P5c-R9：platProps 为空时跳过 */
          if(!platProps.length)continue;
          const w=TILE*(.4+Math.random()*.3);
          placeModel(mapGroup,platProps[(Math.random()*platProps.length)|0],
            c.x,c.z,w,Math.random()*6.28,PH,0xffffff,.8,1.2);
        }
      }
    }
  }

  // ---- 经典模式：Battle City 1:1 固定地图随机选用 ----
  if(ACTIVE_MODE.mapType==="city"){
    renderClassicLayout();
    return;
  }

  function renderClassicLayout(){
    const layout=CLASSIC_MAPS[(Math.random()*CLASSIC_MAPS.length)|0];
    const offX=Math.floor((GRID-13)/2),offZ=Math.floor((GRID-13)/2);
    let ex=offX+6,ez=offZ+12;                 // 默认鹰旗：底行中央（防无 E 的兜底）
    for(let r=0;r<13;r++)for(let c=0;c<13;c++){
      const ch=layout[r][c],gx=offX+c,gz=offZ+r;
      switch(ch){
        case "B":grid[gz][gx]=T_BRICK;break;
        case "S":grid[gz][gx]=T_STEEL;break;
        case "W":grid[gz][gx]=T_WATER;break;
        case "T":grid[gz][gx]=T_TREE;break;
        case "E":grid[gz][gx]=T_BASE;ex=gx;ez=gz;break;
        default:grid[gz][gx]=T_EMPTY;
      }
    }
    grid[ez][ex]=T_BASE;
    /* ★ 防御性兜底：不管地图字符串如何，鹰旗四周恒为可破砖墙（保证可战败） */
    [[ez,ex-1],[ez,ex+1],[ez-1,ex-1],[ez-1,ex],[ez-1,ex+1]].forEach(([z,x])=>{
      if(inMap(x,z)&&grid[z][x]!==T_BASE)grid[z][x]=T_BRICK;
    });
    const bx=ex,bz=ez;
    baseShellCells=[[bz,bx-1],[bz,bx+1],[bz-1,bx-1],[bz-1,bx],[bz-1,bx+1]];
    baseOuterCells=[];
    /* ★ 强制清空玩家出生格（与 spawnPlayer 公式对齐）：避免出生即嵌墙 */
    const psx=Math.floor(GRID/2)-2, psz=GRID-2;
    if(inMap(psx,psz)&&grid[psz][psx]!==T_BASE&&!baseShellCells.some(([a,b])=>a===psz&&b===psx))
      grid[psz][psx]=T_EMPTY;
    buildMapMeshes();
    buildBase(bx,bz);
  }

  // ---- 经典/td 城区网格：由街道线自动推导（每块约10x10）----
  const MID=Math.floor(GRID/2);          // 23
  const bx=MID,bz=GRID-2;                // 基地 (23,45)

  // ---- 街道网格（由模式配置决定）----
  const M = ACTIVE_MODE;
  const streets = (M && M.streets) ? M.streets : [6,17,29,40];
  const D = (M && M.density) ? M.density : null;
  const isStreet=(x,z)=>streets.includes(x)||streets.includes(z);

  // ---- 城区地块：由街道线自动推导（每块约10x10）----
  const bands=[];
  for(let i=0;i<streets.length-1;i++)bands.push([streets[i]+1,streets[i+1]-1]);
  const blocks=[];
  bands.forEach(([x0,x1])=>bands.forEach(([z0,z1])=>blocks.push([x0,x1,z0,z1])));
  // 主题池：楼房区 / 公园 / 高地区 / 巷战废墟 / 开阔广场 —— 打乱抽4个，保证每局地图不同
  const themes=["buildings","park","plateau","ruins","plaza"].sort(()=>Math.random()-.5);
  blocks.forEach((b,i)=>fillBlock(b,themes[i%themes.length]));

  function fillBlock([x0,x1,z0,z1],theme){
    const w=x1-x0+1,d=z1-z0+1,cx=(x0+x1)>>1,cz=(z0+z1)>>1;
    if(theme==="buildings"){
      // 四角楼房(2x2)，中央广场留空
      const spots=[[x0+1,z0+1],[x1-2,z0+1],[x0+1,z1-2],[x1-2,z1-2]];
      const pB=D?D.building:.38;
      spots.forEach(([sx,sz],si)=>{
        if(Math.random()<pB||si===0)stampBuilding(sx,sz,2,2);
      });
      // 中央花坛两棵树
      grid[cz][cx]=T_TREE;grid[cz][cx-1]=T_TREE;
    }else if(theme==="plaza"){
      // 开阔广场：仅少量掩体与树点缀
      const p1=D?D.plazaBrick:.03,p2=D?D.plazaSteel:.045,p3=D?D.plazaTree:.08;
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
        const r=Math.random();
        if(r<p1)grid[z][x]=T_BRICK;
        else if(r<p2)grid[z][x]=T_STEEL;
        else if(r<p3)grid[z][x]=T_TREE;
      }
      grid[cz][cx]=T_EMPTY;grid[cz][cx-1]=T_EMPTY;
      grid[cz-1][cx]=T_EMPTY;grid[cz-1][cx-1]=T_EMPTY;
    }else if(theme==="park"){
      const pTree=D?D.parkTree:.08;
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
        if(Math.random()<pTree)grid[z][x]=T_TREE;
      }
      // 中央水池 2x2 + 一条板桥
      const px=cx-1,pz=cz-1;
      for(let z=pz;z<pz+2;z++)for(let x=px;x<px+2;x++)grid[z][x]=T_WATER;
      grid[cz][px]=T_BRIDGE;grid[cz][px+1]=T_BRIDGE;
    }else if(theme==="plateau"){
      // 内部高地 + 两侧坡道（对面各一条，形成环路）
      for(let z=z0+2;z<=z1-2;z++)for(let x=x0+2;x<=x1-2;x++){grid[z][x]=T_PLATEAU;heightMap[z*GRID+x]=PH;}
      const rz=cz;
      grid[rz][x0]=T_RAMP;   rampDir[rz*GRID+x0]={x: 1,z:0}; slopeMap[rz*GRID+x0]={x: 1,z:0};   // 从西边向东上坡
      grid[rz][x1]=T_RAMP;   rampDir[rz*GRID+x1]={x:-1,z:0}; slopeMap[rz*GRID+x1]={x:-1,z:0};   // 从东边向西上坡
      // 高地上放个掩体
      grid[z0+2][cx]=T_BRICK;grid[z0+2][cx+1]=T_BRICK;
    }else{ // ruins 巷战废墟：稀疏砖墙 + 钢障，十字通路保证连通
      const r1=D?D.ruinsBrick:.05,r2=D?D.ruinsSteel:.07,r3=D?D.ruinsTree:.10;
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
        const r=Math.random();
        if(r<r1)grid[z][x]=T_BRICK;
        else if(r<r2)grid[z][x]=T_STEEL;
        else if(r<r3)grid[z][x]=T_TREE;
      }
      // 十字清出通路
      for(let x=x0;x<=x1;x++){grid[cz][x]=grid[cz][x]===T_WATER?T_WATER:T_EMPTY;}
      for(let z=z0;z<=z1;z++){if(grid[z][cx]!==T_WATER)grid[z][cx]=T_EMPTY;}
    }
  }

  function stampBuilding(sx,sz,w,d){
    for(let z=sz;z<sz+d&&z<GRID-1;z++)for(let x=sx;x<sx+w&&x<GRID-1;x++){
      if(z>1&&z<GRID-2&&x>0&&x<GRID-1)grid[z][x]=T_BUILDING;
    }
  }

  // ---- 基地 + 围墙 ----
  grid[bz][bx]=T_BASE;
  baseShellCells=[[bz,bx-1],[bz,bx+1],[bz-1,bx-1],[bz-1,bx],[bz-1,bx+1]];
  baseOuterCells=[[bz-2,bx-1],[bz-2,bx],[bz-2,bx+1],[bz,bx-2],[bz-1,bx-2],[bz,bx+2],[bz-1,bx+2]];
  applyShell();

  // ---- 出生点清空（不破坏边界钢墙）----
  const spawnCols=[1,MID,GRID-2];
  spawnCols.forEach(x=>{
    for(let z=1;z<=3;z++)for(let dx=-1;dx<=1;dx++){
      const cx=x+dx;
      if(cx>0&&cx<GRID-1&&inMap(cx,z)&&grid[z][cx]!==T_BASE)grid[z][cx]=T_EMPTY;
    }
  });
  for(let z=GRID-3;z<=GRID-2;z++)for(let x=bx-4;x<=bx+3;x++){
    if(inMap(x,z)&&grid[z][x]!==T_BASE&&!isShell(x,z))grid[z][x]=T_EMPTY;
  }
  function isShell(x,z){return baseShellCells.some(([a,b])=>a===z&&b===x);}

  // ---- 街道标记（避开已占用格）----
  for(let z=1;z<GRID-1;z++)for(let x=1;x<GRID-1;x++){
    if(grid[z][x]!==T_EMPTY)continue;
    if(isStreet(x,z))grid[z][x]=T_ROAD;
  }

  buildMapMeshes();
  buildBase(bx,bz);

  /* ---- 静态网格渲染 ---- */
  function buildMapMeshes(){
    const bKeys=["building-a","building-b","building-c","building-d","building-e","building-f"];
    const sKeys=["building-skyscraper-a","building-skyscraper-b"];
    const doneFootprint=new Set();
    /* 崖壁 v2（P5b）：platformer-kit block-grass 大草块（与台面同族，土色柱身+草帽）。
       等比缩放埋地到顶面=PH，柱身自然形成崖壁；边缘细节由装饰层收口。 */
    function addCliffRock(c){
      const src=ASSETS["block-grass-low"]||ASSETS["cliff_block_rock"];
      if(src){
        _tmpBox.setFromObject(src);_tmpBox.getSize(_tmpSize);
        const s=TILE*1.04/Math.max(.01,Math.max(_tmpSize.x,_tmpSize.z));
        const h=_tmpSize.y*s;
        const rot=((Math.random()*4)|0)*Math.PI/2;
        /* 顶面对齐 PH，超出埋地 */
        const M=_mT(c.x,0,c.z).multiply(_mR(rot))
          .multiply(_mT(0,PH-_tmpBox.max.y*s,-0))
          .multiply(_mS(s,s,s));
        _batchCollect(ASSETS["block-grass-low"]?"block-grass-low":"cliff_block_rock",M);
      }else placeModel(mapGroup,"tile-high",c.x,c.z,TILE*1.02,0,0,0x6a7684,PH);
    }
    /* 台面铺面 v2（P5b）：platformer-kit block-grass 圆角草块，等比缩放顶面精确对齐 PH。
       草块原始 1×1×1（foot 1.08 微出角），等比缩放到格宽，超高部分下沉埋地；
       边缘格视觉由 decorateSurvivalCliff 的 corner/curve 收边（P5b 后续）。 */
    function addPlateauTile(c){
      const src=ASSETS["block-grass"];
      if(!src){ /* 回退旧薄板 */
        const old=ASSETS["tile-high"],TH=.55;
        if(old){
          _tmpBox.setFromObject(old);_tmpBox.getSize(_tmpSize);
          const sx=TILE*1.02/Math.max(.01,_tmpSize.x),sy=TH/Math.max(.01,_tmpSize.y),sz=TILE*1.02/Math.max(.01,_tmpSize.z);
          const M=_mT(c.x,PH-_tmpBox.max.y*sy,c.z).multiply(_mS(sx,sy,sz));
          _batchCollect("tile-high",M);
        }
        return;
      }
      _tmpBox.setFromObject(src);_tmpBox.getSize(_tmpSize);
      const s=TILE*1.04/Math.max(.01,Math.max(_tmpSize.x,_tmpSize.z));
      const M=_mT(c.x,PH-_tmpBox.max.y*s,c.z).multiply(_mS(s,s,s));
      _batchCollect("block-grass",M);
    }
    /* 台面基座：整块箱体从地面垫到铺面下方，防止薄板下方穿帮
       ★ P3-1：拆成逐格基座箱（每格一个 2×2×PH 的方墩，跨格连续成台），
       不规则轮廓下外缘格自然缺块，基座贴合轮廓。基座方块以网格合并去重绘制代价可控：
       用 InstancedMesh 批渲染。 */
    function addPlateauFoundation(){
      const E=ACTIVE_MODE.enclosure;if(!E)return;
      /* ★P5c-R4：顶面 PH-0.5→PH-0.08（凹缝不再黑洞），但 R5 复盘：土棕 0x8a6b4f 太亮
         成米色网纹更违和——改深土棕（草块柱身同系压暗），缝隙读作"阴影"而非"亮线" */
      const h=PH-.08;
      const cells=[];
      for(let z=E.z0;z<=E.z1;z++)for(let x=E.x0;x<=E.x1;x++){
        const t=grid[z][x];
        if(t!==T_PLATEAU&&t!==T_BASE)continue;
        cells.push(cellCenter(x,z));
      }
      const geo=new THREE.BoxGeometry(TILE,h,TILE);
      const mat=new THREE.MeshStandardMaterial({color:0x4a3a28,roughness:.98});
      const im=new THREE.InstancedMesh(geo,mat,cells.length);
      const M=new THREE.Matrix4();
      cells.forEach((c,i)=>{
        M.makeTranslation(c.x,h/2,c.z);
        im.setMatrixAt(i,M);
      });
      im.receiveShadow=true;
      mapGroup.add(im);
    }
    /* ★ P5b-地画 v2：一层空地铺 tower-defense-kit tile 系方砖（带 colormap 质感的草皮砖），
       主体 tile + 少量 bump/hill/rock/dirt/tree 变体点缀；批实例化，纯视觉不影响玩法。
       tile 原始 1×1×0.2、以格中心为原点。 */
    function addGroundFloorTile(c,x,z){
      const h=((x*73856093)^(z*19349663))>>>0;          // 格子坐标哈希（确定性伪随机）
      const r=(h%1000)/1000;
      let name;
      if(r<.94)name="tile";                // 基础草砖（主力，证件照确认是唯一纯绿平板）
      else if(r<.97)name="tile-rock";      // 绿底石堆
      else if(r<.99)name="tile-hill";      // 绿底小丘
      else name="tile-tree";               // 绿底小树砖
      /* ★P5c-R3 证件照复盘：tile-bump/dirt/straight/crossing 全是橙红凹坑（修塔坑位），
         一律弃用；混铺只留四个纯绿变体 */
      const src=ASSETS[name];
      if(!src)return;
      _tmpBox.setFromObject(src);_tmpBox.getSize(_tmpSize);
      const s=TILE*1.02/Math.max(.01,Math.max(_tmpSize.x,_tmpSize.z));
      const rot=(((h>>3)%4)|0)*Math.PI/2;
      const M=_mT(c.x,-0.01,c.z).multiply(_mR(rot)).multiply(_mS(s,s,s));
      _batchCollect(name,M);
    }
    if(ACTIVE_MODE.mapType==="survival")addPlateauFoundation();

    for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++){
      const t=grid[z][x],c=cellCenter(x,z);
      switch(t){
        case T_EMPTY:
          /* ★ P5：生存模式空地铺地板（一层草地/石板）；★ P5c：道路格跳过（已铺土路砖） */
          if(ACTIVE_MODE.mapType==="survival"&&!(window._roadCells&&window._roadCells.has(idx(x,z))))addGroundFloorTile(c,x,z);
          break;
        case T_BRICK:
          tileMeshes[idx(x,z)]=buildWallTile(mapGroup,x,z,false);
          mapGroup.add(tileMeshes[idx(x,z)]);
          break;
        case T_STEEL:{
          /* ★ 生存高台边缘：天然岩台边缘（岩块，与台面一体），保留阻断语义 */
          if(ACTIVE_MODE.mapType==="survival"){ addCliffRock(c); }
          else{ const g=buildWallTile(mapGroup,x,z,true); mapGroup.add(g); }
          break;}
        case T_WATER:{
          const m=new THREE.Mesh(new THREE.PlaneGeometry(TILE,TILE),matWater);
          m.rotation.x=-Math.PI/2;m.position.set(c.x,.1,c.z);
          mapGroup.add(m);break;}
        case T_TREE:{
          /* ★P5c-R8：树格先铺地皮再放树，防止树下出现方形空洞 */
          if(ACTIVE_MODE.mapType==="survival")addGroundFloorTile(c,x,z);
          const names=["tree_default","tree_oak","tree_cone","tree_detailed","tree_fat"];
          /* ★P5c-R9：树去红去黑——Kenney nature 包树材质底色为 #e18357（橙棕），
             在纯绿世界显红。旧方案 0x2e5d2e 深绿乘法→纯黑；0xffffff 不染→橙红。
             新方案：placeModel 先不放色，返回后遍历覆盖材质为森林绿系。 */
          const inst=placeModel(mapGroup,names[(Math.random()*names.length)|0],
            c.x,c.z,TILE*.92,Math.random()*6.28,0,0xffffff,3.4,6.5);
          if(inst)inst.traverse(o=>{
            if(!o.isMesh||!o.material)return;
            o.material=o.material.clone();
            /* 树干偏深绿，叶簇偏亮绿——根据原始亮度分流 */
            const b=o.material.color.r*0.299+o.material.color.g*0.587+o.material.color.b*0.114;
            o.material.color.setHex(b>0.5?0x6db86d:0x3a703a);
            o.material.roughness=.85;
          });
          break;}
        case T_ROAD:{
          // 路面：路口用 crossroad，直路按走向
          const v=isStreetCol(x),h=isStreetRow(z);
          if(v&&h)placeModel(mapGroup,"road-crossroad",c.x,c.z,TILE,0,0,0x555f6a,.2);
          else if(v)placeModel(mapGroup,"road-straight",c.x,c.z,TILE,0,0,0x555f6a,.2);
          else if(h)placeModel(mapGroup,"road-straight",c.x,c.z,TILE,Math.PI/2,0,0x555f6a,.2);
          break;}
        case T_BUILDING:{
          const key=idx(x,z);
          if(doneFootprint.has(key))break;
          // 找到 footprint 尺寸
          let fw=1;while(x+fw<GRID&&grid[z][x+fw]===T_BUILDING&&!doneFootprint.has(idx(x+fw,z)))fw++;
          let fd=1;outer:while(z+fd<GRID){
            for(let k=x;k<x+fw;k++)if(grid[z+fd][k]!==T_BUILDING||doneFootprint.has(idx(k,z+fd)))break outer;
            fd++;
          }
          for(let dz=0;dz<fd;dz++)for(let dx=0;dx<fw;dx++)doneFootprint.add(idx(x+dx,z+dz));
          const wx=fw*TILE*1.04,wz=fd*TILE*1.04;
          const pool=(fw>=3||fd>=3)?sKeys:bKeys;
          const name=pool[Math.floor(Math.random()*pool.length)];
          const cxw=(x+fw/2)*TILE-HALF,czw=(z+fd/2)*TILE-HALF;
          const srcB=ASSETS[name];
          if(srcB){
            const inst=srcB.clone(true);
            _tmpBox.setFromObject(inst);_tmpBox.getSize(_tmpSize);
            const s=Math.max(wx/Math.max(.001,_tmpSize.x),wz/Math.max(.001,_tmpSize.z));
            inst.scale.setScalar(s);
            _tmpBox.setFromObject(inst);
            const ctr=_tmpBox.getCenter(new THREE.Vector3());
            inst.position.set(-ctr.x,-_tmpBox.min.y,-ctr.z);
            const g=new THREE.Group();g.add(inst);
            g.position.set(cxw,heightAt(cxw,czw),czw);
            mapGroup.add(g);
          }else{
            placeModel(mapGroup,name,cxw,czw,wx,0,heightAt(cxw,czw),0x77828f,12);
          }
          break;}
        case T_PLATEAU:
          if(ACTIVE_MODE.mapType==="survival")addPlateauTile(c);
          else addCliffRock(c);
          break;
        case T_RAMP:{
          const ci=z*GRID+x,d=rampDir[ci],sl=slopeMap[ci]||{};
          const base=sl.base||0,step=(sl.step!==undefined)?sl.step:PH;
          /* ★ P5b：生存坡道换 platformer-kit block-grass-large-slope（圆角草坡，与草块同族）。
             原始 foot 2.08 / h 0.759，等比缩放：先按格宽缩放，再校验坡高≈step（不足则补一层薄草块底座）。 */
          /* ★P5c-R8：生存坡道换 tdkit tile-straight-slope（单格 1×1 斜坡，与地面 tile 系同族）。
             旧 block-grass-large-slope 是 2.08 格宽的草坡，强缩到 1 格 → 变形严重。 */
          const singleSlope=ASSETS["tile-straight-slope"];
          if(ACTIVE_MODE.mapType==="survival"&&singleSlope){
            _tmpBox.setFromObject(singleSlope);_tmpBox.getSize(_tmpSize);
            /* tile-straight-slope 默认西低东高(+X)，等比缩放到格宽 */
            const s=TILE*1.02/Math.max(.01,Math.max(_tmpSize.x,_tmpSize.z));
            const hSlope=_tmpSize.y*s;
            /* 上坡方向→旋转 */
            const rot=d?(d.x===-1?Math.PI:d.z===1?-Math.PI/2:d.z===-1?Math.PI/2:0):0;
            const yOff=base;                                   // 低缘贴 base
            const M=_mT(c.x,yOff-_tmpBox.min.y*s,c.z).multiply(_mR(rot)).multiply(_mS(s,s,s));
            _batchCollect("tile-straight-slope",M);
            break;
          }
          const pSrc=ASSETS["block-grass-large-slope"];       // 回退：非生存或素材缺失时用旧方案
          if(ACTIVE_MODE.mapType==="survival"&&pSrc){
            _tmpBox.setFromObject(pSrc);_tmpBox.getSize(_tmpSize);
            const s=TILE*1.04/Math.max(.01,Math.max(_tmpSize.x,_tmpSize.z));
            const hSlope=_tmpSize.y*s;                       // 缩放后坡高
            const yOff=base+Math.max(0,step-hSlope);         // 不足 step 时整体抬高（下方垫底座）
            /* 上坡方向→旋转：slope 模型默认西低东高(+X)。d=行进方向（-1 = 向西上坡 → 转 180°） */
            const rot=d?(d.x===-1?Math.PI:d.z===1?-Math.PI/2:d.z===-1?Math.PI/2:0):0;
            const M=_mT(c.x,yOff-_tmpBox.min.y*s,c.z).multiply(_mR(rot)).multiply(_mS(s,s,s));
            _batchCollect("block-grass-large-slope",M);
            /* 坡高不足时垫 block-grass-low 薄块补齐高差 */
            if(hSlope<step-.02){
              const low=ASSETS["block-grass-low"];
              if(low){
                _tmpBox.setFromObject(low);_tmpBox.getSize(_tmpSize);
                const s2=TILE*1.04/Math.max(.01,Math.max(_tmpSize.x,_tmpSize.z));
                const h2=_tmpSize.y*s2;
                const M2=_mT(c.x,base,c.z).multiply(_mS(s2,Math.min(1,(step-hSlope)/h2),s2));
                _batchCollect("block-grass-low",M2);
              }
            }
            break;
          }
          const name=ACTIVE_MODE.mapType==="survival"?"tile-slant":"cliff_blockSlope_rock";
          /* 上坡方向→旋转：tile-slant 默认西低东高(+X)；cliff 斜坡默认北低南高(+Z) */
          let rot=0;
          if(d){
            if(name==="tile-slant")rot=d.x===-1?Math.PI:d.z===1?-Math.PI/2:d.z===-1?Math.PI/2:0;
            else rot=d.x===1?Math.PI/2:d.x===-1?-Math.PI/2:d.z===-1?Math.PI:0;
          }
          const srcR=ASSETS[name];
          if(srcR){
            const inst=srcR.clone(true);
            _tmpBox.setFromObject(inst);_tmpBox.getSize(_tmpSize);
            inst.scale.set(TILE*1.02/Math.max(.01,_tmpSize.x),step/Math.max(.01,_tmpSize.y),TILE*1.02/Math.max(.01,_tmpSize.z));
            _tmpBox.setFromObject(inst);
            const ctr=_tmpBox.getCenter(new THREE.Vector3());
            inst.position.set(-ctr.x,base-_tmpBox.min.y,-ctr.z);   // 低缘贴 base，高缘=base+step
            const gg=new THREE.Group();gg.add(inst);
            gg.rotation.y=rot;gg.position.set(c.x,0,c.z);
            mapGroup.add(gg);
          }else{
            const g=new THREE.Group();
            placeModel(g,name,0,0,TILE*1.02,rot,base,0x6a7684,step);
            g.position.set(c.x,0,c.z);
            mapGroup.add(g);
          }
          break;}
        case T_BRIDGE:
          placeModel(mapGroup,"bridge_center_wood",c.x,c.z,TILE*1.05,Math.PI/2,.02,0x8a6a3a,.5);
          break;
        case T_BASE:
          if(ACTIVE_MODE.mapType==="survival")addPlateauTile(c);  // 2×2 基地格也铺台面，大门模型坐于铺面之上
          break;
      }
    }
    function isStreetCol(x){return streets.includes(x);}
    function isStreetRow(z){return streets.includes(z);}

    // ---- 街边小道具（纯装饰不阻挡；经典 13×13 小图少放，避免杂乱）----
    // ★P5c-R8：survival 模式不放城市工业道具（dumpster/traffic-light 等 colormap 含橙红，
    //   在纯绿荒野世界严重违和）。只对 classic/city 模式生效。
    if(ACTIVE_MODE.mapType==="city"||ACTIVE_MODE.key==="classic"){
    const props=["construction-cone","dumpster","light-square","traffic-light","electricity-pole-single"];
    const propN=(ACTIVE_MODE.mapType==="city")?6:26;
    for(let i=0;i<propN;i++){
      const x=1+Math.floor(Math.random()*(GRID-2)),z=1+Math.floor(Math.random()*(GRID-2));
      if(grid[z][x]!==T_EMPTY)continue;
      const c=cellCenter(x,z);
      placeModel(mapGroup,props[Math.floor(Math.random()*props.length)],
        c.x+(Math.random()-.5)*2,c.z+(Math.random()-.5)*2,1.8,Math.random()*6.28,0,0x777777,1.5,3.2);
    }
    } // end if city/classic only

    _batchFlush(mapGroup);   /* ★ P2-1：批量实例化收尾（铺板/崖壁 → 个位数 draw call） */
  }

  function applyShell(){
    // 内圈基地墙：经典用可破砖墙（还原 BC 可战败），其余模式用钢墙（子弹穿不透）
    const innerWant=(ACTIVE_MODE.key==="classic")?T_BRICK:T_STEEL;
    baseShellCells.forEach(([z,x])=>{
      grid[z][x]=innerWant;
      if(tileMeshes[idx(x,z)])mapGroup.remove(tileMeshes[idx(x,z)]);
      const g=buildWallTile(mapGroup,x,z,innerWant===T_STEEL);
      tileMeshes[idx(x,z)]=g;
    });
    baseOuterCells.forEach(([z,x])=>{
      if(grid[z][x]!==T_EMPTY)return;
      grid[z][x]=T_BRICK;
      if(tileMeshes[idx(x,z)])mapGroup.remove(tileMeshes[idx(x,z)]);
      const m=buildWallTile(mapGroup,x,z,false);
      tileMeshes[idx(x,z)]=m;
    });
  }
  genMap.applyShell=applyShell;
}

/* 重建被毁的基地围墙（工程抢修班） */
function repairBaseShell(){
  let fixed=0;
  const innerWant=(ACTIVE_MODE.key==="classic")?T_BRICK:T_STEEL;
  baseShellCells.concat(game.stats.baseRepairLv>=2?baseOuterCells:[]).forEach(([z,x])=>{
    const isInner=baseShellCells.some(([a,b])=>a===z&&b===x);
    const want=isInner?innerWant:T_BRICK;
    if(grid[z][x]!==want){
      grid[z][x]=want;
      if(tileMeshes[idx(x,z)])mapGroup.remove(tileMeshes[idx(x,z)]);
      const m=buildWallTile(mapGroup,x,z,want===T_STEEL);
      tileMeshes[idx(x,z)]=m;
      spawnParticles(new THREE.Vector3(cellCenter(x,z).x,1.5,cellCenter(x,z).z),0x6fd3ff,6,4,.7);
      fixed++;
    }
  });
  if(fixed){toast("🔧 工程班修复了基地围墙 ×"+fixed);sfx.pickup();}
}

/* ---------------- 基地 ---------------- */
function buildBase(cx,cz){
  const c=cellCenter(cx,cz);
  baseGroup=new THREE.Group();
  /* ★ 生存模式：2×2 台地大门（门脸朝东侧坡道，可破，破即输） */
  if(ACTIVE_MODE.key==="survival"){
    const c2=cellCenter(cx+.5,cz+.5);                     // 2×2 基地几何中心
    /* ★ Kenney 化：tower-square-base（底座）+ building-skyscraper-b（主楼）+ gate（门脸） */
    const baseTower=placeModel(baseGroup,"tower-square-base",0,0,TILE*1.9,0,0,0x6b7280,2.2,2.2);
    if(baseTower)baseTower.position.y=0;
    const mainTower=placeModel(baseGroup,"building-skyscraper-b",0,0,TILE*1.4,-Math.PI/2,0,0x9aa6b4,3.6,3.6);
    if(mainTower)mainTower.position.y=2.1;
    const gateObj=placeModel(baseGroup,"gate",0,TILE*.9,TILE*1.1,-Math.PI/2,0,0x8a5a3a,3.2,3.4);
    if(gateObj)gateObj.position.y=0;
    /* ★ 兼容附件（护盾隐藏 / 星旋转 / autoturret 占位不发射） */
    const star=new THREE.Mesh(new THREE.OctahedronGeometry(.5),
      new THREE.MeshStandardMaterial({color:0x7ec8ff,emissive:0x224466}));
    star.position.set(0,5.6,0);baseGroup.add(star);
    const shield=new THREE.Mesh(new THREE.SphereGeometry(4.6,20,14),
      new THREE.MeshBasicMaterial({color:0x4da3ff,transparent:true,opacity:.16,
        blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    shield.position.y=1.8;shield.name="shield";shield.visible=false;baseGroup.add(shield);
    const tur=new THREE.Group();tur.name="autoturret";tur.visible=false;baseGroup.add(tur);
    autoTurretObj=tur;
    baseGroup.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    baseGroup.position.set(c2.x,heightAt(c2.x,c2.z),c2.z); // 贴台面顶
    scene.add(baseGroup);
    baseGroup.userData.star=star;baseGroup.userData.shield=shield;
    return;
  }
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.8,.5,10),
    new THREE.MeshStandardMaterial({color:0x3a4a60,roughness:.7}));
  pedestal.position.y=.25;
  const flagPole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,4.4,8),
    new THREE.MeshStandardMaterial({color:0xcfd8e6,metalness:.8,roughness:.3}));
  flagPole.position.y=2.4;
  const flag=new THREE.Mesh(new THREE.BoxGeometry(1.6,1,.08),
    new THREE.MeshStandardMaterial({color:0xffc93c,emissive:0x664400}));
  flag.position.set(.85,4.1,0);
  const star=new THREE.Mesh(new THREE.OctahedronGeometry(.55),
    new THREE.MeshStandardMaterial({color:0xff5d5d,emissive:0x881111}));
  star.position.set(-.9,3.6,0);
  baseGroup.add(pedestal,flagPole,flag,star);
  // 护盾罩
  const shield=new THREE.Mesh(new THREE.SphereGeometry(3.4,20,14),
    new THREE.MeshBasicMaterial({color:0x4da3ff,transparent:true,opacity:.16,
      blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  shield.position.y=1.6;shield.name="shield";shield.visible=false;
  baseGroup.add(shield);
  // 防御炮台：Kenney 塔防武器炮模型（回退程序化）
  const tur=new THREE.Group();
  const srcC=ASSETS["weapon-cannon"];
  if(srcC){
    const inst=srcC.clone(true);
    _tmpBox.setFromObject(inst);_tmpBox.getSize(_tmpSize);
    const s=2.6/Math.max(.01,Math.max(_tmpSize.x,_tmpSize.z));
    inst.scale.setScalar(s);
    _tmpBox.setFromObject(inst);
    const ctr=_tmpBox.getCenter(new THREE.Vector3());
    inst.position.set(-ctr.x,-_tmpBox.min.y+.15,-ctr.z);
    tur.add(inst);
  }else{
    const dome=new THREE.Mesh(new THREE.CylinderGeometry(.6,.75,.5,10),
      new THREE.MeshStandardMaterial({color:0x39d98a,roughness:.5,metalness:.3}));
    dome.position.y=.25;
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.11,.13,1.8,8),
      new THREE.MeshStandardMaterial({color:0x2a6a4a}));
    barrel.rotation.x=Math.PI/2;barrel.position.set(0,.28,-1.05);
    tur.add(dome,barrel);
  }
  tur.position.y=1.1;tur.visible=false;tur.name="autoturret";
  baseGroup.add(tur);
  autoTurretObj=tur;
  baseGroup.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  baseGroup.position.set(c.x,0,c.z);
  scene.add(baseGroup);
  baseGroup.userData.star=star;
  baseGroup.userData.shield=shield;
}

/* ---------------- 坦克工厂 ---------------- */
function makeTank(bodyColor,turretColor,scale=1){
  const g=new THREE.Group();
  const M=(c,r,m)=>new THREE.MeshStandardMaterial({color:c,roughness:r??.6,metalness:m??.3});
  const trackMat=M(0x1b2126,.95,.05),wheelMat=M(0x2c333a,.8),
        bodyMat=M(bodyColor,.5,.35),darkMat=M(new THREE.Color(bodyColor).multiplyScalar(.72).getHex(),.55,.3),
        turMat=M(turretColor,.45,.4);
  /* 履带总成：外壳 + 挡泥板 + 负重轮 */
  [-1,1].forEach(s=>{
    const tr=new THREE.Mesh(new THREE.BoxGeometry(.66,.74,3.5),trackMat);
    tr.position.set(s*1.06,.44,0);g.add(tr);
    const fender=new THREE.Mesh(new THREE.BoxGeometry(.8,.1,3.62),darkMat);
    fender.position.set(s*1.06,.86,0);g.add(fender);
    for(let i=0;i<4;i++){
      const w=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.7,10),wheelMat);
      w.rotation.z=Math.PI/2;w.position.set(s*1.06,.38,-1.26+i*.84);g.add(w);
    }
  });
  /* 车体：主甲板 + 前斜甲 + 尾板 + 排气筒 */
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.62,.6,3.1),bodyMat);
  body.position.y=1.12;g.add(body);
  const glacis=new THREE.Mesh(new THREE.BoxGeometry(1.56,.16,1.4),darkMat);
  glacis.position.set(0,1.3,-1.3);glacis.rotation.x=-.42;g.add(glacis);
  const rear=new THREE.Mesh(new THREE.BoxGeometry(1.56,.48,.5),darkMat);
  rear.position.set(0,1.0,1.5);g.add(rear);
  [-.45,.45].forEach(px=>{
    const ex=new THREE.Mesh(new THREE.BoxGeometry(.26,.28,.5),trackMat);
    ex.position.set(px,1.26,1.42);g.add(ex);
  });
  /* 炮塔：壳 + 侧裙 + 炮盾 + 炮管 + 抽烟器 + 制退器 + 舱盖 + 天线 */
  const turret=new THREE.Group();
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(.72,.92,.54,10),turMat);
  shell.position.y=.3;turret.add(shell);
  const skirt=new THREE.Mesh(new THREE.BoxGeometry(1.88,.32,1.9),turMat);
  skirt.position.y=.08;turret.add(skirt);
  const mantlet=new THREE.Mesh(new THREE.BoxGeometry(.5,.42,.42),darkMat);
  mantlet.position.set(0,.3,-1.04);turret.add(mantlet);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.11,.14,2.0,10),turMat);
  barrel.rotation.x=Math.PI/2;barrel.position.set(0,.3,-1.9);turret.add(barrel);
  const extractor=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.46,10),turMat);
  extractor.rotation.x=Math.PI/2;extractor.position.set(0,.3,-1.66);turret.add(extractor);
  const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.34,10),M(0x111418,.6));
  muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.3,-2.72);turret.add(muzzle);
  const hatch=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.1,8),darkMat);
  hatch.position.set(-.25,.6,.3);turret.add(hatch);
  const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.015,.008,1.15,4),trackMat);
  antenna.position.set(.55,1.14,.45);antenna.rotation.z=.16;turret.add(antenna);
  turret.position.y=1.5;g.add(turret);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  g.scale.setScalar(scale);
  g.userData.turret=turret;
  return g;
}

/* ---------------- 实体 ---------------- */
let player=null;
const enemies=[],bullets=[],particles=[],powerups=[],lightningBeams=[];
/* ★ 玩家构筑物：波间商店布置的炮台与地雷（跨波次持续存在） */
const builtTurrets=[],builtMines=[],goldMines=[],techTowers=[],builtHouses=[];
const structCells=new Set();   // 生存：所有已放置构筑物（墙/炮塔/住房/科技塔/金矿）占用的格子 idx
let camShake=0;
/* ★ 生存 RTS 自由镜头：焦点（lookAt 中心）+ 高度/后撤距离，WASD/方向键平移、滚轮缩放 */
const camFocus=new THREE.Vector3(0,0,0);
let camHeight=66,camBack=54;

const game={
  score:0,lives:3,wave:0,enemiesToSpawn:0,spawnTimer:0,
  upgrades:{},
  stats:{dmg:1,fireRate:1,moveSpeed:1,bulletSpeed:1,multishot:0,pierce:0,
    blastRadius:0,magnet:false,luckyLv:0,armorMax:5,
    critChance:0,vampLv:0,regenLv:0,
    baseWallLv:0,baseRepairLv:0,autoTurretLv:0,baseShieldMax:0,airstrikeLv:0,overloadLv:0},
  buffs:{shieldUntil:0,rapidUntil:0},
  bombs:0,respawnTimer:0,baseShieldHP:0,buildTimer:0,
  tech:{},gateHp:0,gateMaxHp:0,gateHpLv:0,gateArmorLv:0,gateThornsLv:0,gateRegenLv:0,gateDodgeLv:0,
  popUsed:0,popMax:12,techPoints:0,prepTime:0,
};
const keys={};
let mouse={x:innerWidth/2,y:innerHeight/2,down:false};
const raycaster=new THREE.Raycaster();
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);

/* ---------------- 升级卡池（自身系 + 基地系，带稀有度）---------------- */
/* rar: 1=普通 2=稀有 3=史诗 —— 稀有度越高越强、抽中权重越低 */
const UPGRADES=[
  // 🛞 自身系
  {id:"dmg",type:"tank",rar:1,icon:"🔥",name:"钨芯穿甲弹",desc:"炮弹伤害 +40%",max:6,apply:s=>s.dmg*=1.4},
  {id:"rate",type:"tank",rar:1,icon:"⚡",name:"自动装填机",desc:"射速 +25%",max:6,apply:s=>s.fireRate*=1.25},
  {id:"speed",type:"tank",rar:1,icon:"🛞",name:"涡轮增压引擎",desc:"移动速度 +18%",max:5,apply:s=>s.moveSpeed*=1.18},
  {id:"bspd",type:"tank",rar:1,icon:"💨",name:"电磁加速轨道",desc:"炮弹飞行速度 +30%",max:4,apply:s=>s.bulletSpeed*=1.3},
  {id:"lucky",type:"tank",rar:1,icon:"🍀",name:"幸运星",desc:"道具掉落率 +25%，掉落更多",max:3,apply:s=>s.luckyLv+=1},
  {id:"regen",type:"tank",rar:1,icon:"🧰",name:"战地维修",desc:"每波开始修复 2×Lv 点装甲",max:2,
    apply:s=>{s.regenLv++;if(player){player.hp=Math.min(s.armorMax,player.hp+2);updateHpUI();}}},
  {id:"spare",type:"tank",rar:1,icon:"🛠",name:"备用履带",desc:"额外 +1 条生命",max:2,
    apply:s=>{game.lives++;updateHpUI();}},
  {id:"magnet",type:"tank",rar:1,icon:"🧲",name:"补给磁铁",desc:"自动吸取附近道具",max:1,apply:s=>s.magnet=true},
  {id:"pierce",type:"tank",rar:2,icon:"🎯",name:"超空化弹芯",desc:"炮弹穿透 +1 个目标",max:3,apply:s=>s.pierce+=1},
  {id:"armor",type:"tank",rar:2,icon:"🛡",name:"复合装甲",desc:"最大装甲 +2 并完全修复",max:4,
    apply:s=>{s.armorMax+=2;if(player){player.hp=s.armorMax;player.maxHp=s.armorMax;}}},
  {id:"blast",type:"tank",rar:2,icon:"💥",name:"高爆弹头",desc:"炮弹命中产生范围爆炸",max:3,apply:s=>s.blastRadius+=1.6},
  {id:"crit",type:"tank",rar:2,icon:"🔍",name:"弱点分析",desc:"18% 几率造成双倍伤害（可叠加）",max:3,
    apply:s=>{s.critChance=Math.min(.9,s.critChance+.18);}},
  {id:"multi",type:"tank",rar:3,icon:"🔱",name:"双联炮塔",desc:"每次开火 +1 发平行炮弹",max:3,apply:s=>s.multishot+=1},
  {id:"vamp",type:"tank",rar:3,icon:"🩸",name:"收割装置",desc:"击杀敌人修复 1 点装甲",max:2,apply:s=>s.vampLv++},
  {id:"ricochet",type:"tank",rar:2,icon:"🔄",name:"弹射装甲弹",desc:"炮弹碰钢墙/楼房反弹一次（可叠两次）",max:2,apply:s=>s.bounce+=1},
  {id:"sprint",type:"tank",rar:1,icon:"🏃",name:"猎杀冲锋",desc:"击杀敌人后 3 秒内移速 +35%",max:2,
    apply:s=>{s.sprintLv++;if(s.sprintLv===2)s.sprintDur=4500;}},
  {id:"pshield",type:"tank",rar:2,icon:"💠",name:"单兵力场",desc:"每波获得护盾，抵挡 2×Lv 次攻击",max:3,
    apply:s=>{s.playerShieldLv++;game.playerShieldHP=s.playerShieldLv*2;}},
  // 🏰 基地系
  {id:"baseRepair",type:"base",rar:1,icon:"🔧",name:"工程抢修班",desc:"每波开始重建基地围墙（Lv2+ 加筑外圈）",max:3,
    apply:s=>{s.baseRepairLv++;genMap.applyShell&&genMap.applyShell();}},
  {id:"airstrike",type:"base",rar:2,icon:"✈",name:"空袭协同",desc:"每波开始获得 1 次空投轰炸充能",max:3,
    apply:s=>{s.airstrikeLv++;game.bombs+=1;}},
  {id:"baseWall",type:"base",rar:2,icon:"🧱",name:"基地工事加固",desc:"基地围墙换装钢制掩体（永久）",max:2,
    apply:s=>{s.baseWallLv++;genMap.applyShell&&genMap.applyShell();}},
  {id:"autoTurret",type:"base",rar:2,icon:"🗼",name:"基地防御炮台",desc:"鹰旗自动炮台反击周围敌人，射速随级提升",max:4,
    apply:s=>{s.autoTurretLv++;if(autoTurretObj)autoTurretObj.visible=true;}},
  {id:"baseShield",type:"base",rar:2,icon:"🔵",name:"护盾发生器",desc:"基地获得能量护盾，每波补满，吸收敌方炮火",max:3,
    apply:s=>{s.baseShieldMax+=2;game.baseShieldHP=s.baseShieldMax;}},
  {id:"overload",type:"base",rar:3,icon:"☢",name:"超载协议",desc:"防御炮台射程 +40%、伤害 +1、射速大幅提升",max:2,apply:s=>s.overloadLv++},
  {id:"emp",type:"base",rar:3,icon:"📡",name:"EMP 脉冲塔",desc:"基地每 9 秒释放脉冲：眩晕并伤害周围敌人",max:2,
    apply:s=>{s.empLv++;game._empTimer=Math.min(game._empTimer,2);}},
  {id:"mortar",type:"base",rar:3,icon:"💣",name:"迫击炮阵地",desc:"基地定期炮击敌群，造成范围伤害",max:2,
    apply:s=>{s.mortarLv++;if(s.mortarLv===1)game._mortarTimer=4;}},
  {id:"evolve",type:"base",rar:3,icon:"🧬",name:"连锁进化",desc:"每波开始随机强化一张已拥有卡 +1 级",max:2,apply:s=>s.evolveLv+=1},
  {id:"income",type:"base",rar:1,icon:"💰",name:"战利品回收",desc:"击杀金币收益 +30%",max:3,apply:s=>s.incomeLv+=1},
  {id:"builder",type:"base",rar:2,icon:"🏗",name:"工程承包商",desc:"构筑商店全部价格 -15%",max:2,apply:s=>s.builderLv+=1},
  {id:"netmaster",type:"base",rar:2,icon:"🕸",name:"火力网络",desc:"你布置的炮台伤害 +40%、射速 +25%",max:3,apply:s=>s.netmasterLv+=1},
];

/* ---------------- 玩家 ---------------- */
function spawnPlayer(){
  if(player)scene.remove(player.group);
  const group=makeTank(0x3f8f46,0x57b564);
  /* ★ 生存模式：出生在高台内部（主楼正前方），便于上台布防；其余模式沿用原地 */
  const c=ACTIVE_MODE.key==="survival"
    ?cellCenter((ACTIVE_MODE.base&&ACTIVE_MODE.base.col)||6,((ACTIVE_MODE.base&&ACTIVE_MODE.base.row)||41)-1)
    :cellCenter(Math.floor(GRID/2)-2,GRID-2);
  group.position.set(c.x,heightAt(c.x,c.z),c.z);
  scene.add(group);
  /* ★ 科技树增益：F 生命加成 / G 移速加成 */
  const fLv=(game.tech&&game.tech.F)||0;
  const gLv=(game.tech&&game.tech.G)||0;
  const pHp=Math.round(game.stats.armorMax*(1+(TECH_TREE.F.effect.playerHpPct||0.1)*fLv));
  const pSpd=11*(1+(TECH_TREE.G.effect.playerSpeedPct||0.05)*gLv);
  player={group,hp:pHp,maxHp:pHp,speed:pSpd,cd:0,heading:Math.PI,aim:Math.PI,
    invulnUntil:performance.now()+2500,alive:true,radius:1.5,
    /* ★ P3-9 WC3 指令层 */
    moveTarget:null,attackTarget:null,attackMove:false};
  updateHpUI();
}

/* ---------------- 敌人 ---------------- */
const ENEMY_TYPES={
  normal:{color:0x8a94a2,turret:0xa8b2c0,hp:2,speed:6.5,fireCd:1.6,dmg:1,scale:1,score:100},
  fast:{color:0x2f8f4e,turret:0x53c077,hp:1,speed:11,fireCd:1.9,dmg:1,scale:.88,score:150},
  heavy:{color:0xa03c34,turret:0xcc5a4c,hp:6,speed:4.6,fireCd:2.0,dmg:2,scale:1.22,score:300},
  sniper:{color:0x6a4fa0,turret:0x8f74cc,hp:2,speed:6,fireCd:2.4,dmg:1,scale:.95,score:250},
};
const BOSS_TYPE={color:0x1f1f26,turret:0xffb02e,hp:40,speed:3.6,fireCd:1.1,dmg:2,scale:1.7,score:2000};

/* ★ P5 敌人类型 → Kenney graveyard-kit 怪物模型映射（用户拍板：敌人=怪物，丧尸尸潮风）
   动画库与 blocky-characters 同构（idle/walk/sprint/die/attack-melee-*），直接复用动画状态机。
   normal=丧尸（主力，尸潮感）/ fast=幽灵（飘速快）/ heavy=吸血鬼（壮硕精英）
   sniper=守墓人（远程）/ boss=骷髅王（大体型） */
const ENEMY_CHAR_MAP={
  normal:"character-zombie",
  fast:"character-ghost",
  heavy:"character-vampire",
  sniper:"character-keeper",
  boss:"character-skeleton",
};
const ENEMY_CHAR_SCALE={
  normal:1.05,
  fast:1.0,
  heavy:1.32,
  sniper:1.05,
  boss:2.0,
};
/* ★ 角色动画名（Kenney blocky-characters 包：实际 GLB 字段为小写 idle/walk/die/sprint） */
const _ANIM_IDLE="idle",_ANIM_WALK="walk",_ANIM_DEATH="die",_ANIM_SPRINT="sprint";
function _findAnim(anims,name){
  if(!anims)return null;
  /* 兼容大小写：先精确匹配，再 case-insensitive 兜底 */
  for(let i=0;i<anims.length;i++){
    const a=anims[i];
    if(a&&a.name===name)return a;
  }
  const lname=String(name).toLowerCase();
  for(let i=0;i<anims.length;i++){
    const a=anims[i];
    if(a&&a.name&&a.name.toLowerCase()===lname)return a;
  }
  return null;
}
/* 用角色模型构建敌人 group；失败回退 makeTank() */
function _buildEnemyGroup(typeKey,isBoss,t){
  const charName=ENEMY_CHAR_MAP[typeKey]||ENEMY_CHAR_MAP.normal;
  const src=ASSETS[charName];
  if(!src||!THREE.SkeletonUtils){
    /* 模型未就绪或 SkeletonUtils 缺失 → 回退程序化坦克 */
    return {group:makeTank(t.color,t.turret,t.scale),mixer:null,fallback:true};
  }
  try{
    const inst=THREE.SkeletonUtils.clone(src);
    inst.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    /* ★ 缩放：按枚举的目标 scale 等比放大（角色模型原高约 2.4 单位） */
    const sBase=ENEMY_CHAR_SCALE[typeKey]||1;
    const sElite=isBoss?sBase:t.scale*sBase;
    inst.scale.setScalar(sElite);
    /* 居中：把模型底面贴到 y=0；box 检测 */
    const box=new THREE.Box3().setFromObject(inst);
    const c=box.getCenter(new THREE.Vector3());
    inst.position.sub(c); inst.position.y-=box.min.y;
    /* 启动 AnimationMixer + Idle */
    let mixer=null,idle=null;
    const anims=ASSET_ANIMS[charName];
    if(anims){
      mixer=new THREE.AnimationMixer(inst);
      idle=_findAnim(anims,_ANIM_IDLE);
      if(idle){
        const act=mixer.clipAction(idle);
        act.setLoop(THREE.LoopRepeat,Infinity);
        act.play();
      }
    }
    const walk=_findAnim(anims,_ANIM_WALK),die=_findAnim(anims,_ANIM_DEATH);
    const actIdle=idle?mixer.clipAction(idle):null,actWalk=walk?mixer.clipAction(walk):null,actDie=die?mixer.clipAction(die):null;
    return {group:inst,mixer,fallback:false,
      actions:{idle:actIdle,walk:actWalk,die:actDie}};
  }catch(err){
    console.warn("[spawnEnemy] character clone failed, fallback to makeTank:",err);
    return {group:makeTank(t.color,t.turret,t.scale),mixer:null,fallback:true,actions:{}};
  }
}

function spawnEnemy(typeKey,isBoss=false){
  /* ★ BOSS 成长：血量随波次递增；幸存者模式额外应用难度系数 */
  const diff=(ACTIVE_MODE.difficultyScale||(w=>1))(game.wave);
  let t=isBoss?Object.assign({},BOSS_TYPE,{hp:Math.ceil((BOSS_TYPE.hp+Math.max(0,game.wave-5)*4)*diff)})
              :ENEMY_TYPES[typeKey];
  t=Object.assign({},t,{hp:Math.ceil(t.hp*diff),dmg:t.dmg*diff});
  /* ★ 角色模型克隆（含 AnimationMixer 启动）；模型未就绪时回退 makeTank() */
  const built=_buildEnemyGroup(typeKey,isBoss,t);
  const group=built.group;
  const mixer=built.mixer;
  let c;
  if(ACTIVE_MODE.key==="survival"&&ACTIVE_MODE.spawns){
    const sp=ACTIVE_MODE.spawns[Math.floor(Math.random()*ACTIVE_MODE.spawns.length)];
    c=cellCenter(sp.x,sp.z);
  }else{
    const spots=[1,Math.floor(GRID/2),GRID-2];
    const sx=spots[Math.floor(Math.random()*spots.length)];
    c=cellCenter(sx,1);
  }
  group.position.set(c.x+(Math.random()*2-1)*.6,0,c.z);
  /* ★ 精英词缀：第3波起 12% 概率 —— 血量×2.5 / 分数×3 / 必掉道具 / 金色涂装 */
  let elite=false,frenzy=false;
  if(!isBoss&&game.wave>=3&&Math.random()<.12){
    elite=true;
    t=Object.assign({},t,{hp:Math.ceil(t.hp*2.5),speed:t.speed*.92,score:t.score*3});
    group.scale.multiplyScalar(1.22);
    const gold=new THREE.Color(0xffd75e);
    group.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){
      o.material=o.material.clone();o.material.color.lerp(gold,.45);}});
    /* ★ 狂暴词缀：第6波起精英有概率狂暴（移速大增、红纹） */
    if(game.wave>=6&&Math.random()<.45){
      frenzy=true;t=Object.assign(t,{speed:t.speed*1.32});
      group.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){
        o.material.color.lerp(new THREE.Color(0xff4444),.4);}});
    }
    if(!game._eliteToast){game._eliteToast=true;toast("⚠ 检测到精英敌军！");}
  }
  scene.add(group);
  /* ★ 角色模型需要面向镜头（默认朝 +Z），转向 +X 朝向战场内侧 */
  group.rotation.y=-Math.PI/2;
  const e={group,type:typeKey,boss:isBoss,elite,frenzy,hp:t.hp,maxHp:t.hp,speed:t.speed,
    fireCd:t.fireCd,dmg:t.dmg,radius:1.5*t.scale*(elite?1.1:1),heading:Math.PI,
    cd:1+Math.random()*1.5,thinkTimer:0,dir:new THREE.Vector3(0,0,1),
    score:t.score,alive:true,spawnFlash:performance.now()+(elite?1100:700),beam:null,
    slowMult:1,slowUntil:0,
    mixer,characterModel:!built.fallback,currentAnim:_ANIM_IDLE,actions:built.actions||{},
    dying:false,dyingT:0};
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(e.radius*.9,e.radius*.9,14,12,1,true),
    new THREE.MeshBasicMaterial({color:isBoss?0xffb02e:(elite?0xffd75e:0x7ec8ff),transparent:true,opacity:.4,
      side:THREE.DoubleSide}));
  beam.position.set(group.position.x,7,group.position.z);
  scene.add(beam);e.beam=beam;
  enemies.push(e);
  game.aliveThisWave++;
}

/* ---------------- 子弹 ---------------- */
const bulletGeo=new THREE.SphereGeometry(.28,8,8);
function shoot(owner,dirVec,friendly=false,opts={}){
  const isPlayer=owner==="player";
  const speed=isPlayer?34*game.stats.bulletSpeed:(friendly?27:22);
  const dmg=isPlayer?game.stats.dmg*(1+(TECH_TREE.G.effect.playerDmgPct||0.08)*(game.tech.G||0)):owner.dmg;
  const color=isPlayer?0x8fffc8:(friendly?0x9fd4ff:0xff9a5d);
  const grp=isPlayer?player.group:owner.group;
  const origin=new THREE.Vector3().copy(grp.position);
  origin.y+=1.7;
  /* ★ 防穿墙：出膛点沿炮管逐步外推，遇墙截停
     （P4-3：塔弹 opts.thruWall=true → 跳过此检查，塔可隔墙/隔崖/隔自家建筑开火） */
  const testSolid=(pt)=>{
    const c=cellOf(pt.x,pt.z);
    if(!inMap(c.x,c.z))return true;
    const t=grid[c.z][c.x];
    return t===T_BRICK||t===T_STEEL||t===T_BUILDING||t===T_WATER;
  };
  if(!opts.thruWall){
    let off=1.2;
    const maxOff=2.6*(grp.scale.x||1);
    while(off<maxOff){
      if(testSolid(origin.clone().addScaledVector(dirVec,off+.7)))break;
      off+=.7;
    }
    origin.addScaledVector(dirVec,off);
  }
  const shots=isPlayer?1+game.stats.multishot:1;
  for(let i=0;i<shots;i++){
    const lateral=(i-(shots-1)/2)*.9;
    const side=new THREE.Vector3(dirVec.z,0,-dirVec.x);
    const p=origin.clone().addScaledVector(side,lateral);
    const m=new THREE.Mesh(bulletGeo,new THREE.MeshBasicMaterial({color}));
    m.position.copy(p);
    scene.add(m);
    bullets.push({mesh:m,vel:dirVec.clone().multiplyScalar(speed),dmg,
      owner:(isPlayer||friendly)?"player":"enemy",life:3,
      thruWall:!!opts.thruWall,
      pierceLeft:isPlayer?game.stats.pierce:(friendly?(opts.pierce||0):0),
      bounce:isPlayer?game.stats.bounce:0,
      blast:isPlayer?game.stats.blastRadius:(friendly?(opts.blast||owner.blast||0):0),
      hitSet:new Set()});
    spawnParticles(p,color,4,3,.12);
  }
  if(isPlayer||friendly)sfx.shoot();else sfx.eshoot();
}

/* ---------------- 粒子 ---------------- */
const partGeo=new THREE.BoxGeometry(.3,.3,.3);
function spawnParticles(pos,color,count,power,size=1){
  for(let i=0;i<count;i++){
    const m=new THREE.Mesh(partGeo,new THREE.MeshBasicMaterial({color,transparent:true}));
    m.position.copy(pos);m.scale.setScalar(size*(.5+Math.random()));
    scene.add(m);
    particles.push({mesh:m,life:.5+Math.random()*.4,
      vel:new THREE.Vector3((Math.random()-.5)*power,(Math.random()*.8+.2)*power,(Math.random()-.5)*power)});
  }
}
function explode(pos,big=false){
  spawnParticles(pos,0xffb02e,big?26:12,big?14:9,big?1.4:1);
  spawnParticles(pos,0xff5d2e,big?18:8,big?11:7,big?1.1:.8);
  spawnParticles(pos,0x777777,big?10:5,5,.9);
  camShake=Math.max(camShake,big?.9:.4);
  (big?sfx.bigboom:sfx.boom)();
}
/* ★ 电磁塔连锁闪电视觉：两点间一次性闪光线段，随粒子循环衰减 */
function lightningBeam(from,to,color){
  const geo=new THREE.BufferGeometry().setFromPoints([from,to]);
  const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.9}));
  scene.add(line);
  lightningBeams.push({line,life:.18});
}

/* ---------------- 道具 ---------------- */
const POWERS=["heal","shield","rapid","bomb"];
function dropPowerup(pos,force=false){
  if(!force&&Math.random()>.18+game.stats.luckyLv*.05)return;
  const key=POWERS[Math.floor(Math.random()*POWERS.length)];
  const colors={heal:0x39d98a,shield:0x4da3ff,rapid:0xffd75e,bomb:0xff5d5d};
  const g=new THREE.Group();
  const cube=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),
    new THREE.MeshStandardMaterial({color:colors[key],emissive:colors[key],emissiveIntensity:.45,
      transparent:true,opacity:.92}));
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.05,.09,8,24),
    new THREE.MeshBasicMaterial({color:colors[key]}));
  ring.rotation.x=Math.PI/2;
  g.add(cube,ring);
  g.position.copy(pos);g.position.y+=1.1;
  scene.add(g);
  powerups.push({group:g,key,life:14,spin:Math.random()*6,baseY:g.position.y});
}
function applyPowerup(key){
  sfx.pickup();
  if(key==="heal"){player.hp=Math.min(player.maxHp,player.hp+2);toast("装甲修复 +2");}
  else if(key==="shield"){game.buffs.shieldUntil=performance.now()+6000;toast("能量护盾 6s");}
  else if(key==="rapid"){game.buffs.rapidUntil=performance.now()+8000;toast("极速装填 8s");}
  else if(key==="bomb"){game.bombs++;toast("💣 空袭轰炸 ×1（按 P 释放）");}
  updateBuffUI();updateHpUI();
}

/* ---------------- 碰撞 ---------------- */
function solidForTank(t,isBullet){
  if(t===T_EMPTY||t===T_TREE||t===T_ROAD||t===T_PLATEAU||t===T_RAMP||t===T_BRIDGE)return false;
  if(isBullet&&t===T_WATER)return false;
  return true;   // BRICK STEEL WATER BUILDING BASE
}
/* ★ P0-3：攀爬容差统一常量
   原缺陷：流场 BFS 用「格心高差 > 1.2 视为崖」，移动碰撞用「五点采样高差 > 0.9 即阻挡」，
   两套判据不一致 → 流场规划出物理走不通的坡道路线，敌人对着空气墙撞。
   修复 1：坡道延长为 4 格（每格 0.55 < 0.9），沿轴攀爬可行。
   修复 2（非对称高差判据）：五点采样改「上坡 0.9 / 下坡 1.3」——
   下坡放行是必要的：坡道侧缘与紧贴平地的高差 (0.55~1.65) 必然 > 0.9，
   若下坡也拦，敌人贴坡道边缘走就被横向采样卡死（实测 trace2~trace5 三连卡，
   路肩铺到 ±2 行仍挡不住 z 方向漂移）。安全依据：台面边缘全是 T_STEEL 实体格，
   高度判据只是双保险；唯一非实体高差断层就是坡道区，下坡 1.3 < 台面高 2.2，
   不可能凭此跳崖 —— 只允许沿坡道下行与贴坡道侧缘通行。
   修复 3（trace7 实测）：下坡容差 1.3 → 1.7。
   坡道走廊 rows 34-38 的北缘行 34：敌人贴行缘时北角点落进 (·,33) 平地 h=0，
   与脚下最大落差 = col17 西缘 h=1.65（1.38 处实测即被 1.3 拦死）→ x 轴移动被拒；
   1.7 > 1.65 放行贴缘通行；台面跳崖落差 2.2 仍 > 1.7 继续拦 —— 上下界之间取值安全。 */
const STEP_UP=0.9;
const STEP_DOWN=1.7;
function blockedForTank(px,pz,radius,curH,isBullet=false,isPlayer=false){
  const minC=cellOf(px-radius,pz-radius),maxC=cellOf(px+radius,pz+radius);
  for(let cz=minC.z;cz<=maxC.z;cz++)for(let cx=minC.x;cx<=maxC.x;cx++){
    if(!inMap(cx,cz))return true;
    const t=grid[cz][cx];
    /* ★ 守军可自由出入自家大门（仅生存），敌人不可 */
    if(isPlayer&&ACTIVE_MODE.key==="survival"&&t===T_BASE)continue;
    if(solidForTank(t,isBullet)){
      const c=cellCenter(cx,cz);
      if(Math.abs(px-c.x)<TILE/2+radius*.5&&Math.abs(pz-c.z)<TILE/2+radius*.5)return true;
    }
  }
  // 高度差：四角+中心采样；上坡 >STEP_UP 拦、下坡 >STEP_DOWN 拦（非对称，见上注释）
  if(!isBullet&&curH!==undefined){
    const r=radius*.6;
    const pts=[[px,pz],[px-r,pz-r],[px+r,pz-r],[px-r,pz+r],[px+r,pz+r]];
    for(const s of pts){
      const dh=heightAt(s[0],s[1])-curH;
      if(dh>STEP_UP||dh<-STEP_DOWN)return true;
    }
  }
  return false;
}
function destroyBricksAround(px,pz,radius){
  const minC=cellOf(px-radius,pz-radius),maxC=cellOf(px+radius,pz+radius);
  let broke=false;
  for(let cz=minC.z;cz<=maxC.z;cz++)for(let cx=minC.x;cx<=maxC.x;cx++){
    if(!inMap(cx,cz))continue;
    if(grid[cz][cx]!==T_BRICK)continue;
    const c=cellCenter(cx,cz);
    if(Math.abs(px-c.x)<TILE/2+radius*.6&&Math.abs(pz-c.z)<TILE/2+radius*.6){
      grid[cz][cx]=T_EMPTY;
      if(tileMeshes[idx(cx,cz)]){mapGroup.remove(tileMeshes[idx(cx,cz)]);tileMeshes[idx(cx,cz)]=null;}
      spawnParticles(new THREE.Vector3(c.x,1.2,c.z),0xb5543a,8,6,.8);
      broke=true;
    }
  }
  if(broke)sfx.hit();
}
/* ★ 构筑墙可被敌人拆毁：玩家放置的钢墙有耐久（8 点），地图原生钢墙不可破坏 */
const steelHP=new Map();
/* ★ P4-2：重建单格坡道板。场景：坡道格建墙→墙破/拆后恢复通行。
   ★P5c-R10：生存改与初始 buildMapMeshes 同源 tile-straight-slope（原用 roads/tile-slant 蓝灰坡板），
   并与批次系统同色染色，避免"绿坡道里一块蓝灰补丁"。 */
function buildRampTile(parent,cx,cz){
  const ci=cz*GRID+cx,d=rampDir[ci],sl=slopeMap[ci]||{};
  const base=sl.base||0,step=(sl.step!==undefined)?sl.step:PH;
  const name=ACTIVE_MODE.mapType==="survival"?"tile-straight-slope":"cliff_blockSlope_rock";
  let rot=0;
  if(d){
    if(name==="tile-straight-slope")rot=d.x===-1?Math.PI:d.z===1?-Math.PI/2:d.z===-1?Math.PI/2:0;
    else rot=d.x===1?Math.PI/2:d.x===-1?-Math.PI/2:d.z===-1?Math.PI:0;
  }
  const srcR=ASSETS[name];
  const c=cellCenter(cx,cz);
  if(srcR){
    const inst=srcR.clone(true);
    if(name==="tile-straight-slope"){
      inst.traverse(o=>{if(o.isMesh&&o.material){o.material=o.material.clone();o.material.color=new THREE.Color(0.36,1.45,0.62);o.material.roughness=.95;}});
    }
    _tmpBox.setFromObject(inst);_tmpBox.getSize(_tmpSize);
    inst.scale.set(TILE*1.02/Math.max(.01,_tmpSize.x),step/Math.max(.01,_tmpSize.y),TILE*1.02/Math.max(.01,_tmpSize.z));
    _tmpBox.setFromObject(inst);
    const ctr=_tmpBox.getCenter(new THREE.Vector3());
    inst.position.set(-ctr.x,base-_tmpBox.min.y,-ctr.z);
    const gg=new THREE.Group();gg.add(inst);
    gg.rotation.y=rot;gg.position.set(c.x,0,c.z);
    parent.add(gg);
    return gg;
  }
  const g=new THREE.Group();
  placeModel(g,name,0,0,TILE*1.02,rot,base,0x6a7684,step);
  g.position.set(c.x,0,c.z);
  parent.add(g);
  return g;
}
function damageWallCell(cx,cz,dmg){
  const t=grid[cz][cx];
  const c=cellCenter(cx,cz);
  if(t===T_BRICK){
    destroyBricksAround(c.x,c.z,.6);return true;
  }
  if(t===T_STEEL){
    const key=idx(cx,cz);
    if(!steelHP.has(key))return false;
    spawnParticles(new THREE.Vector3(c.x,1.4,c.z),0xcfd8e6,4,5,.6);
    const hp=steelHP.get(key)-dmg;
    if(hp<=0){
      steelHP.delete(key);
      const wasRamp=wallMeta.get(key)&&wallMeta.get(key).wasRamp;
      /* ★ P4-2：坡道格上的墙被砸破 → 恢复 T_RAMP + 重铺坡道板，不留隐形断崖 */
      if(wasRamp){
        const rd=rampDir&&rampDir[key];
        grid[cz][cx]=T_RAMP;
        wallMeta.delete(key);
        if(tileMeshes[key]){mapGroup.remove(tileMeshes[key]);tileMeshes[key]=null;}
        buildRampTile(mapGroup,cx,cz);
      }else{
        grid[cz][cx]=T_EMPTY;
        wallMeta.delete(key);
        if(tileMeshes[key]){mapGroup.remove(tileMeshes[key]);tileMeshes[key]=null;}
      }
      spawnParticles(new THREE.Vector3(c.x,1.2,c.z),0x8b98a8,10,7,.9);
      sfx.hit();
      computeFlowField();
    }else steelHP.set(key,hp);
    return true;
  }
  return false;
}

/* ---------------- 流场寻路（生存 RTS：敌人 BFS 汇流至唯一大门） ---------------- */
let flowDist=null;
/* 某格是否可被流场穿过：不可破钢墙（无 steelHP 的 T_STEEL）阻断；其余可穿（砖/玩家钢墙敌人会啃） */
function passableForFlow(cx,cz){
  const t=grid[cz][cx];
  if(t===T_BASE)return false;                         // 大门/基地不可穿（仅作目标）
  if(t===T_BUILDING)return false;                     // 主楼实体：流场绕开，防敌人卡住
  if(t===T_STEEL&&!steelHP.has(idx(cx,cz)))return false; // 原生/围墙钢墙不可破
  return true;
}
/* 从大门相邻格 BFS，填 flowDist（到门步数）；-1 表示不可达
   ★ 爬坡约束：相邻格心高差 >1.2 视为崖壁不可越（台地 2.2 阻断、坡道格心 ≤1.1 可越，
   兼容城市图整格坡 1.1 高差）→ 敌人只能沿坡道上下台地 */
/* ★ P0-3：相邻两格之间的真实攀爬高差
   沿 A→B 的连线采样，并在垂直于行进方向 ±(敌人半径*0.6) 处补采样（复刻 blockedForTank 的五点采样语义），
   取区间内 max-min 作为该条边的高差。这样「沿坡道插值轴爬升」得到 0.733（可攀），
   而「垂直于插值轴从北侧跨上坡道」得到 ~1.23（不可攀），与实际移动判定一致。 */
function flowStepRise(ax,az,bx,bz){
  const A=cellCenter(ax,az), B=cellCenter(bx,bz);
  const dx=B.x-A.x, dz=B.z-A.z;
  const r=0.72;                                  /* ≈ 敌人半径*0.6，与 blockedForTank 对齐 */
  const L=Math.hypot(dx,dz)||1;
  const ox=-dz/L*r, oz=dx/L*r;                   /* 横向偏移单位向量 */
  let mn=Infinity, mx=-Infinity;
  for(let t=0;t<=1.0001;t+=0.25){
    const cx=A.x+dx*t, cz=A.z+dz*t;
    for(let s=-1;s<=1;s++){
      const h=heightAt(cx+ox*s,cz+oz*s);
      if(h<mn)mn=h; if(h>mx)mx=h;
    }
  }
  return mx-mn;
}
function computeFlowField(){
  const N=GRID*GRID;
  if(!flowDist||flowDist.length!==N)flowDist=new Int32Array(N);
  flowDist.fill(-1);
  const B=ACTIVE_MODE.base, dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  const sx=B.gateCol, sz=B.gateRow, q=[];
  let head=0;
  for(const [dx,dz] of dirs){
    const x=sx+dx, z=sz+dz;
    /* ★ P0-3：改用 flowStepRise + STEP_UP，与 blockedForTank 同一判据 */
    if(inMap(x,z)&&passableForFlow(x,z)&&flowStepRise(sx,sz,x,z)<=STEP_UP){flowDist[z*GRID+x]=1;q.push(z*GRID+x);}
  }
  while(head<q.length){
    const cur=q[head++], cz=(cur/GRID)|0, cx=cur%GRID, d=flowDist[cur];
    for(const [dx,dz] of dirs){
      const x=cx+dx, z=cz+dz;
      if(!inMap(x,z))continue;
      const k=z*GRID+x;
      if(flowDist[k]!==-1||!passableForFlow(x,z))continue;
      if(flowStepRise(cx,cz,x,z)>STEP_UP)continue;   /* ★ P0-3：统一阈值，崖壁不可越、坡道沿轴可攀 */
      flowDist[k]=d+1; q.push(k);
    }
  }
}
/* 依据流场为敌人选向下一格方向（仅 survival 使用）
   ★ P0-2：流场最小值是 1（大门格 T_BASE 被 passableForFlow 判为不可穿），
   敌人站在 d=1 时四个邻居全 ≥2，原逻辑会顺着「最小邻居」把它推离大门 → 门口反复弹跳、永不啃门。
   这里显式判定「已抵达」，并额外用世界距离兜底（玩家用墙围门改道时仍能正确啃门）。 */
const GATE_ARRIVE_D=1;        /* 流场抵达阈值：BFS 从大门相邻格起算，最小值即 1 */
const GATE_ARRIVE_DIST=7.5;   /* 世界坐标兜底：距基地中心 < 7.5（约 2 格）视为抵达 */
function flowDirFor(e){
  const p=e.group.position, here=cellOf(p.x,p.z);
  if(!inMap(here.x,here.z))return {best:null,bestD:Infinity,hereD:-1,atGate:false};
  const hereD=flowDist[here.z*GRID+here.x];
  let bd=Infinity;
  if(baseGroup)bd=Math.hypot(p.x-baseGroup.position.x,p.z-baseGroup.position.z);
  if((hereD>=0&&hereD<=GATE_ARRIVE_D)||bd<=GATE_ARRIVE_DIST)
    return {best:null,bestD:hereD,hereD,atGate:true};   /* ★ 已抵达：不再下梯度 */
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  let best=null, bestD=Infinity;
  for(const [dx,dz] of dirs){
    const x=here.x+dx, z=here.z+dz;
    if(!inMap(x,z))continue;
    const d=flowDist[z*GRID+x];
    if(d>=0&&d<bestD){bestD=d;best=[dx,dz];}
  }
  return {best,bestD,hereD,atGate:false};
}
/* 大门血上限：基础 + HP等级 + F科技百分比加成（设计 §2.8） */
function computeGateMaxHp(){
  const g=ACTIVE_MODE.gate||{};
  const lv=game.gateHpLv||0;
  const fLv=(game.tech&&game.tech.F)||0;
  const base=(g.hp||600)+(g.hpPerLv||0)*lv;
  return Math.round(base*(1+(TECH_TREE.F.effect.coreHpPct||0.1)*fLv));
}

/* ---------------- 大门受击（唯一入口：血/甲/反伤/恢复/闪避） ---------------- */
function damageGate(rawDmg, attackerPos){
  if(!baseAlive||!baseGroup)return;
  const g=ACTIVE_MODE.gate||{};
  /* ★ 闪避：概率免疫一次伤害（不触发受击） */
  const dvLv=game.gateDodgeLv||0, dodge=(g.dodgePerLv||0)*dvLv;
  if(dodge>0&&Math.random()<dodge){
    spawnParticles(baseGroup.position.clone().setY(2),0x9fe8ff,6,5,.7);
    return;
  }
  /* ★ 护甲：按等级减伤 */
  const arLv=game.gateArmorLv||0, armor=Math.min(.6,(g.armorPerLv||0)*arLv);
  const dmg=Math.max(1,Math.round(rawDmg*(1-armor)));
  game.gateHp-=dmg;
  spawnParticles(baseGroup.position.clone().setY(1.8),0xff8080,8,6,.8);sfx.hit();
  /* ★ 反伤：反弹给攻击者 */
  const thLv=game.gateThornsLv||0, thorns=(g.thornsPerLv||0)*thLv;
  if(thorns>0&&attackerPos){
    // 反伤以落点附近敌人结算（攻击者为子弹/啃咬来源，用坐标就近找敌）
    let near=null,nd=Infinity;
    for(const en of enemies){
      if(!en.alive)continue;
      const dd=en.group.position.distanceToSquared(attackerPos);
      if(dd<nd){nd=dd;near=en;}
    }
    if(near&&nd<64){near.hp-=dmg*thorns;spawnParticles(near.group.position.clone().setY(1.6),0xffd75e,6,5,.7);
      if(near.hp<=0)killEnemy(near);}
  }
  updateHpUI();
  if(game.gateHp<=0){game.gateHp=0;baseDestroyed();}
}

/* ---------------- 输入 ---------------- */
addEventListener("keydown",e=>{
  keys[e.code]=true;
  if(e.code==="Space")e.preventDefault();
  /* ★ P3-9 WC3：空格 = 跳转镜头到基地/大门（事件点跳转） */
  if(e.code==="Space"&&ACTIVE_MODE.key==="survival"&&baseGroup&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD)){
    const f=baseGroup.position;
    camFocus.x=f.x;camFocus.z=f.z;
  }
  if(e.code==="Escape"){
    /* ★ 新手引导 ESC 优先跳过 */
    if(questActive){questSkip();return;}
    if(state===STATE.PLAYING)setPause(true);
    else if(state===STATE.PAUSED)setPause(false);
    else if(state===STATE.TECH)closeTechMenu();
    else if(state===STATE.GATE)closeGateUp();
    else if(state===STATE.BUILD&&ACTIVE_MODE.key==="survival"&&wc3BuildMode)closeWc3Build();
    else if(state===STATE.BUILD&&ACTIVE_MODE.key==="survival")closeBuildMenu();
    else if(state===STATE.PREP){
      /* ★ 修复 Esc→PLAYING 30s 超时阻断：归零倒计时后由主循环统一接管过渡 */
      game.prepTime=0;
    }
  }
  if(e.code==="KeyP"&&state===STATE.PLAYING)useBomb();
  /* ★ P4-5：B = 建造模式开关（不暂停，命令卡二态） */
  if(e.code==="KeyB"&&ACTIVE_MODE.key==="survival"&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD&&wc3BuildMode)){
    if(wc3BuildMode)closeWc3Build();
    else openWc3Build();
    return;
  }
  if(e.code==="KeyB"&&ACTIVE_MODE.key!=="survival"&&(state===STATE.PLAYING||state===STATE.PREP))openBuildMenu();
  if(e.code==="KeyT"&&ACTIVE_MODE.key==="survival"&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD))openTechMenu();
  if(e.code==="KeyG"&&ACTIVE_MODE.key==="survival"&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD))openGateUp();
});
addEventListener("keyup",e=>keys[e.code]=false);
addEventListener("mousemove",e=>{mouse.x=e.clientX;mouse.y=e.clientY;});
/* ★ P3-9 WC3 式操作（生存模式）：
   右键点地 → 移动指令（绿色点击标记）；右键点敌 → 攻击指令（红色标记）；
   A 键 → 攻击移动（下次左键点地，路径上自动交战）；
   玩家坦克有 moveTarget/attackTarget，由 updatePlayer 消费。
   经典/塔防模式保持原 WASD 直接操控不变。 */
let wc3MoveMark=null;   // 点击标记 mesh
function wc3Mark(pos,color){
  if(wc3MoveMark){scene.remove(wc3MoveMark);wc3MoveMark=null;}
  const m=new THREE.Mesh(new THREE.RingGeometry(.55,.85,24),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,side:THREE.DoubleSide}));
  m.rotation.x=-Math.PI/2;
  m.position.set(pos.x,heightAt(pos.x,pos.z)+.12,pos.z);
  scene.add(m);wc3MoveMark=m;
  setTimeout(()=>{if(wc3MoveMark===m){scene.remove(m);wc3MoveMark=null;}},700);
}
function screenToWorld(px,py){
  _ndc.x=(px/innerWidth)*2-1;_ndc.y=-(py/innerHeight)*2+1;
  _ray.setFromCamera(_ndc,camera);
  const hit=new THREE.Vector3();
  if(!_ray.ray.intersectPlane(groundPlane,hit))return null;
  hit.x=Math.max(-HALF+TILE,Math.min(HALF-TILE,hit.x));
  hit.z=Math.max(-HALF+TILE,Math.min(HALF-TILE,hit.z));
  return hit;
}
addEventListener("mousedown",e=>{
  if(e.button===0){mouse.down=true;
    if(state===STATE.BUILD){
      if(destroyMode){
        const c=pickCell();
        if(c)attemptDestroy(c.x,c.z);
      }else if(buildSel!==null){
        tryPlace();
      }
      /* ★ P4-5：建造模式无选中条目时点击 = 点选 */
      else if(wc3BuildMode){
        const hit=wc3PickAt(e.clientX,e.clientY);
        if(hit)wc3Select(hit.kind,hit.ref);else wc3ClearSel();
        wc3RenderSel();
      }
    }
    else if(ACTIVE_MODE.key==="survival"&&player&&player.alive&&wc3AttackMove){
      /* ★ WC3：A 攻击移动确认（生存） */
      const w=screenToWorld(e.clientX,e.clientY);
      if(w){player.moveTarget={x:w.x,z:w.z};player.attackMove=true;wc3Mark(w,0xff5d5d);}
      wc3AttackMove=false;
    }
    else if(ACTIVE_MODE.key==="survival"){
      /* ★ P4-5：WC3 左键点选单位/建筑 */
      const hit=wc3PickAt(e.clientX,e.clientY);
      if(hit)wc3Select(hit.kind,hit.ref);else wc3ClearSel();
      wc3RenderSel();
    }
  }
  /* ★ WC3：右键指令（生存，非建造态） */
  if(e.button===2&&ACTIVE_MODE.key==="survival"&&player&&player.alive
     &&(state===STATE.PLAYING||state===STATE.PREP)){
    /* ★ P4-5：建造模式右键 = 取消当前条目；再无条目则收起建造模式 */
    if(state===STATE.BUILD&&wc3BuildMode){
      if(buildSel!==null)selectBuild(null);
      else closeWc3Build();
    }
    else if(buildSel!==null){selectBuild(null);}        // 建造中右键=取消（保留原语义）
    else{
      const w=screenToWorld(e.clientX,e.clientY);
      if(w){
        /* 点敌=攻击目标，点地=移动 */
        let tgt=null,bd=3.4*3.4;
        for(const en of enemies){
          if(!en.alive)continue;
          const dx=en.group.position.x-w.x,dz=en.group.position.z-w.z;
          const dd=dx*dx+dz*dz;
          if(dd<bd){bd=dd;tgt=en;}
        }
        if(tgt){player.attackTarget=tgt;player.moveTarget=null;player.attackMove=false;wc3Mark(tgt.group.position,0xff5d5d);}
        else{player.moveTarget={x:w.x,z:w.z};player.attackTarget=null;player.attackMove=false;wc3Mark(w,0x39d98a);}
      }
    }
  }
  else if(e.button===2&&state===STATE.BUILD)selectBuild(null);
  /* ★ 新手引导：右键跳过 */
  if(e.button===2&&questActive)questSkip();
});
addEventListener("mouseup",e=>{if(e.button===0)mouse.down=false;});
addEventListener("contextmenu",e=>{e.preventDefault();});   /* ★ WC3：全局禁右键菜单 */
/* ★ WC3：A 键攻击移动预备 */
let wc3AttackMove=false;
addEventListener("keydown",e=>{
  if(e.code==="KeyA"&&ACTIVE_MODE.key==="survival"&&player&&player.alive&&state===STATE.PLAYING){
    wc3AttackMove=true;
    toast("⚔ 攻击移动：左键点击目标位置");
  }
  if(e.code==="KeyS"&&ACTIVE_MODE.key==="survival"&&player&&player.alive){
    /* S = 停止：清空所有指令 */
    player.moveTarget=null;player.attackTarget=null;player.attackMove=false;
  }
  if(state===STATE.BUILD){
    const n="123456789".indexOf(e.key);
    if(n>=0){selectBuild(buildSel===n?null:n);if(wc3BuildMode)renderCmdCard();}
    if(e.key==="Escape"){
      if(ACTIVE_MODE.key==="survival")closeBuildMenu();
      else selectBuild(null);
    }
  }
});
/* ★ 生存 RTS：滚轮缩放 —— P4-4 只改镜头距离（camHeight 复用为 dist），俯仰角固定 */
addEventListener("wheel",e=>{
  if(ACTIVE_MODE.key!=="survival")return;
  if(!(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD))return;
  e.preventDefault();
  const step=e.deltaY>0?1:-1;
  camHeight=Math.max(24,Math.min(120,camHeight+step*7));
},{passive:false});
function useBomb(){
  if(game.bombs<=0)return;
  game.bombs--;toast("💣 空袭轰炸！");sfx.bigboom();camShake=1.2;
  [...enemies].forEach(e=>{if(performance.now()>=e.spawnFlash)killEnemy(e,false);});
  updateBuffUI();
}

/* ---------------- UI ---------------- */
const $=id=>document.getElementById(id);
function updateHpUI(){
  /* ★ 英雄相关（经典/塔防）：仅存在英雄时显示装甲与命数 */
  if(player){
    $("hpText").textContent=`${player.hp} / ${player.maxHp}`;
    $("hpBar").style.width=(player.hp/player.maxHp*100)+"%";
    $("hpBar").style.background=player.hp/player.maxHp>.4
      ?"linear-gradient(90deg,#39d98a,#7cf7c0)":"linear-gradient(90deg,#ff5d5d,#ffa26d)";
    $("lives").textContent=game.lives;
  }
  // 大门血量（生存模式）优先；其余模式显示基地护盾
  if(ACTIVE_MODE.key==="survival"&&game.gateMaxHp>0){
    $("baseBarWrap").style.display="block";
    $("baseShieldText").textContent=`💎 ${Math.max(0,Math.ceil(game.gateHp))} / ${game.gateMaxHp}`;
    $("baseBar").style.width=(game.gateHp/game.gateMaxHp*100)+"%";
    $("baseBar").style.background=game.gateHp/game.gateMaxHp>.35
      ?"linear-gradient(90deg,#7ec8ff,#cfd8e6)":"linear-gradient(90deg,#ff5d5d,#ffa26d)";
  }else if(game.stats.baseShieldMax>0){
    $("baseBarWrap").style.display="block";
    $("baseShieldText").textContent=`${game.baseShieldHP} / ${game.baseShieldMax}`;
    $("baseBar").style.width=(game.baseShieldHP/game.baseShieldMax*100)+"%";
  }else{$("baseShieldText").textContent="未装备";}
}
function updateBuffUI(){
  const el=$("buffs");el.innerHTML="";
  const now=performance.now();
  if(now<game.buffs.shieldUntil)
    el.insertAdjacentHTML("beforeend",`<span class="buff">🛡 护盾 ${((game.buffs.shieldUntil-now)/1000)|0}s</span>`);
  if(now<game.buffs.rapidUntil)
    el.insertAdjacentHTML("beforeend",`<span class="buff">⚡ 速射 ${((game.buffs.rapidUntil-now)/1000)|0}s</span>`);
  if(game.bombs>0)
    el.insertAdjacentHTML("beforeend",`<span class="buff">💣 空袭 ×${game.bombs}</span>`);
  Object.entries(game.upgrades).forEach(([id,lv])=>{
    const u=UPGRADES.find(u=>u.id===id);
    el.insertAdjacentHTML("beforeend",
      `<span class="buff">${u.type==="base"?"🏰":""}${u.icon} ${u.name} Lv${lv}</span>`);
  });
}
let toastTimer=null;
function toast(msg){
  const a=$("announce");a.textContent=msg;a.style.opacity=1;a.style.fontSize="30px";
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>a.style.opacity=0,1400);
}
function announce(msg){
  const a=$("announce");a.textContent=msg;a.style.fontSize="52px";a.style.opacity=1;
  setTimeout(()=>a.style.opacity=0,1600);
}

const mmCtx=$("minimap").getContext("2d");
function drawMinimap(){
  const S=168/GRID;
  mmCtx.fillStyle="#0a1018";mmCtx.fillRect(0,0,168,168);
  for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++){
    const t=grid[z][x];if(t===T_EMPTY)continue;
    mmCtx.fillStyle=
      t===T_BRICK?"#b5543a":t===T_STEEL?"#8b98a8":t===T_WATER?"#2a6aa8":
      t===T_TREE?"#2e7d3a":t===T_BASE?"#ffc93c":t===T_ROAD?"#232f3c":
      t===T_BUILDING?"#4a5462":t===T_PLATEAU?"#33465a":t===T_RAMP?"#41607a":
      t===T_BRIDGE?"#9a7440":"#333";
    mmCtx.fillRect(x*S,z*S,S,S);
  }
  enemies.forEach(e=>{
    if(performance.now()<e.spawnFlash)return;
    mmCtx.fillStyle=e.boss?"#ffb02e":"#ff6d5d";
    mmCtx.beginPath();
    mmCtx.arc((e.group.position.x+HALF)/TILE*S,(e.group.position.z+HALF)/TILE*S,e.boss?4:2.6,0,7);
    mmCtx.fill();
  });
  if(player&&player.alive){
    mmCtx.fillStyle="#5df08a";
    mmCtx.beginPath();
    mmCtx.arc((player.group.position.x+HALF)/TILE*S,(player.group.position.z+HALF)/TILE*S,3,0,7);
    mmCtx.fill();
  }
  powerups.forEach(p=>{
    mmCtx.fillStyle="#ffd75e";
    mmCtx.fillRect((p.group.position.x+HALF)/TILE*S-1.5,(p.group.position.z+HALF)/TILE*S-1.5,3,3);
  });
  /* ★ P4-5：镜头视野框（WC3 小地图惯例） */
  if(ACTIVE_MODE.key==="survival"){
    const d=camHeight;
    const vw=Math.min(GRID, d*1.2/TILE*S), vh=Math.min(GRID, d*.8/TILE*S);
    mmCtx.strokeStyle="rgba(255,255,255,.85)";mmCtx.lineWidth=1.5;
    mmCtx.strokeRect((camFocus.x+HALF)/TILE*S-vw/2,(camFocus.z+HALF)/TILE*S-vh/2,vw,vh);
  }
}
/* ★ P4-5：小地图点击 → 跳转镜头焦点 */
{
  const mm=$("minimap");
  if(mm){
    const mmJump=e=>{
      if(ACTIVE_MODE.key!=="survival")return;
      const r=mm.getBoundingClientRect();
      const gx=(e.clientX-r.left)/r.width*GRID, gz=(e.clientY-r.top)/r.height*GRID;
      camFocus.x=Math.max(-HALF,Math.min(HALF,gx*TILE-HALF));
      camFocus.z=Math.max(-HALF,Math.min(HALF,gz*TILE-HALF));
    };
    mm.addEventListener("mousedown",mmJump);
  }
}
/* ★ P4-5：右下资源速览刷新（4Hz，与 goldUI 同步） */
function updateDockRes(){
  if($("dockGold"))$("dockGold").textContent=Math.floor(game.gold);
  if($("dockPop"))$("dockPop").textContent=`${game.popUsed}/${game.popMax}`;
  if($("dockTech"))$("dockTech").textContent=Math.floor(game.techPoints);
  if($("dockGate")){
    const g=$("dockGate");
    if(game.gateMaxHp>0){
      g.textContent=`${Math.max(0,Math.ceil(game.gateHp))}/${game.gateMaxHp}`;
      g.style.color=game.gateHp/game.gateMaxHp>.4?"#7ec8ff":"#ff7d6d";
    }else{g.textContent="—";}
  }
}

/* ---------------- 波次 ---------------- */
/* ★ Boss 节奏：第 16 波首现，其后每 5 波（20/25/30…）；无尽阶段沿用 */
function isBossWave(n){
  if(n===16)return true;
  if(n>=20&&n%5===0)return true;
  return false;
}
function startWave(n){
  _waveClearing=false;                    /* ★ P0-1：清波闸门复位，允许下一次 waveCleared */
  _wdStallT=0;_wdKillTimer=0;             /* ★ P1-1：新波开始，看门狗进度清零 */
  game.wave=n;
  /* ★ 敌量曲线由模式配置决定 */
  game.enemiesToSpawn=(ACTIVE_MODE.enemiesPerWave||(x=>4+x))(n);
  game.spawnTimer=1.2;game.aliveThisWave=0;
  const boss=isBossWave(n);
  announce(boss?`第 ${n} 波 · BOSS 来袭！`:`第 ${n} 波`);
  $("waveInfo").firstChild.textContent=boss?`WAVE ${n} · BOSS`:`WAVE ${n}`;
  // 基地系波次效果
  if(game.stats.baseRepairLv>0)repairBaseShell();
  /* ★ 战地维修：每波开始修复装甲 */
  if(game.stats.regenLv>0&&player&&player.alive&&player.hp<player.maxHp){
    player.hp=Math.min(player.maxHp,player.hp+2*game.stats.regenLv);
    toast(`🧰 战地维修 +${2*game.stats.regenLv} 装甲`);
  }
  /* ★ 空袭协同：每波开始获得轰炸充能 */
  if(game.stats.airstrikeLv>0){game.bombs+=game.stats.airstrikeLv;}
  if(game.stats.baseShieldMax>0){
    game.baseShieldHP=game.stats.baseShieldMax;
    toast("🔵 基地护盾已充能");
  }
  /* ★ 单兵力场：每波充能 */
  if(game.stats.playerShieldLv>0){
    game.playerShieldHP=game.stats.playerShieldLv*2;
    toast(`💠 单兵力场充能 ×${game.playerShieldHP}`);
  }
  /* ★ 连锁进化：随机强化已拥有卡 */
  if(game.stats.evolveLv>0){
    for(let k=0;k<game.stats.evolveLv;k++){
      const owned=UPGRADES.filter(u=>(game.upgrades[u.id]||0)>0&&(game.upgrades[u.id]||0)<u.max);
      if(owned.length){
        const u=owned[Math.floor(Math.random()*owned.length)];
        game.upgrades[u.id]++;u.apply(game.stats);
        toast(`🧬 ${u.name} 进化到 Lv${game.upgrades[u.id]}`);
      }
    }
  }
  updateHpUI();updateEnemyLeftUI();
}
function updateEnemyLeftUI(){
  const remain=game.enemiesToSpawn+enemies.filter(e=>e.alive).length;
  $("enemyLeft").textContent=`剩余敌人 ${remain}`;
}
function pickEnemyType(){
  /* ★ P5 尸潮权重：normal（丧尸）永远主力且随波增长 —— "尸潮来袭"主体；
     fast/snak/heavy 为调味。normal 权重不衰减，保底 60%+ 丧尸。 */
  const w=game.wave,bag=[["normal",Math.max(10,10+w*2)]];
  if(w>=2)bag.push(["fast",3+w*.6]);
  if(w>=3)bag.push(["sniper",2+w*.35]);
  if(w>=4)bag.push(["heavy",2+w*.5]);
  let total=bag.reduce((a,[,v])=>a+v,0),r=Math.random()*total;
  for(const[k,v]of bag){r-=v;if(r<=0)return k;}
  return "normal";
}

/* ---------------- 肉鸽三选一（稀有度加权）---------------- */
const RAR_NAME={1:"普通",2:"稀有",3:"史诗"};
const RAR_W={1:100,2:42,3:14};   // 稀有度抽取权重
function showUpgradeChoice(){
  state=STATE.UPGRADE;
  /* ★ 经典模式过滤构筑联动卡（无金币/构筑系统） */
  const BUILD_LINKED=["income","builder","netmaster"];
  let pool=UPGRADES.filter(u=>(game.upgrades[u.id]||0)<u.max);
  if(!ACTIVE_MODE.buildEnabled)pool=pool.filter(u=>!BUILD_LINKED.includes(u.id));
  const picks=[];
  const wOf=u=>RAR_W[u.rar]||50;
  const drawOne=(arr)=>{
    let tot=0;arr.forEach(u=>tot+=wOf(u));
    let r=Math.random()*tot;
    for(const u of arr){r-=wOf(u);if(r<=0)return arr.indexOf(u);}
    return arr.length-1;
  };
  // 保证至少一张基地卡出现（若还有）
  const basePool=pool.filter(u=>u.type==="base"),tankPool=pool.filter(u=>u.type==="tank");
  if(basePool.length&&Math.random()<.75)picks.push(basePool.splice(drawOne(basePool),1)[0]);
  const rest=pool.filter(u=>!picks.includes(u));
  while(picks.length<3&&rest.length)picks.push(rest.splice(drawOne(rest),1)[0]);
  const wrap=$("cards");wrap.innerHTML="";
  picks.forEach(u=>{
    const lv=game.upgrades[u.id]||0;
    const card=document.createElement("div");
    card.className="card rar"+u.rar+(u.type==="base"?" base-card":"");
    card.innerHTML=`<span class="rtag r${u.rar}">${RAR_NAME[u.rar]}</span>
      <div class="icon">${u.icon}</div><div class="name">${u.name}</div>
      <div class="desc">${u.desc}</div>
      <span class="lv">Lv ${lv} → ${lv+1}${lv+1>=u.max?" · MAX":""}</span>`;
    card.onclick=()=>{
      game.upgrades[u.id]=(game.upgrades[u.id]||0)+1;
      u.apply(game.stats);
      sfx.levelup();
      $("upgrade").classList.add("hidden");
      updateBuffUI();updateHpUI();
      state=STATE.PLAYING;lastT=performance.now();
      startWave(game.wave+1);
    };
    wrap.appendChild(card);
  });
  $("upgrade").classList.remove("hidden");
}

/* =====================================================================
   ★ 波间构筑系统（金币商店 + 防线布置）
   每波肃清后进入构筑阶段：花金币在地图上放置炮台/墙/地雷，
   构筑物跨波次永久存在，与肉鸽卡「战利品回收/工程承包商/火力网络」联动
   ===================================================================== */
const BUILDS=[
  {id:"mg",    icon:"🔫", name:"机枪炮台", price:60,  desc:"自动索敌 · 射速快 / 伤害低 · 射程 16"},
  {id:"cannon",icon:"🎯", name:"重炮炮台", price:110, desc:"远程高伤 · 范围溅射 · 射程 26"},
  {id:"frost", icon:"❄️", name:"冰冻塔",   price:80,  desc:"范围减速 · 冰控集火 · 射程 13"},
  {id:"wallS", icon:"🧱", name:"钢墙块",   price:18,  desc:"不可摧毁掩体，改写敌军进攻动线"},
  {id:"wallB", icon:"🟫", name:"砖墙块",   price:8,   desc:"廉价路障，可被炮火炸毁"},
  {id:"mine",  icon:"💣", name:"地雷",     price:30,  desc:"敌军踩中即爆（范围 6 伤害）· 一次性"},
  {id:"goldmine",icon:"💰", name:"金矿",   price:70,  desc:"每秒产金 · 可升级（Lv1~6）"},
];
/* ★ 生存模式专属商店：全量 SURVIVAL_BUILDS（科技点门槛在渲染时灰显），经典沿用 BUILDS
   注意：SURVIVAL_BUILDS 在 config.js 中通过 window.SURVIVAL_BUILDS 挂载，engine.js 顶层
   不可见（script-block 隔离），必须经 window 访问；找不到则回退 BUILDS 防止 UI 整盘炸 */
function shopList(){
  if(ACTIVE_MODE.key==="survival"){
    return (window.SURVIVAL_BUILDS&&window.SURVIVAL_BUILDS.length)?window.SURVIVAL_BUILDS:BUILDS;
  }
  return BUILDS;
}
let buildSel=null,ghost=null,ghostCell=null;
/* ★ 金矿造价：基础价 × 数量系数^已建数 × 科技 A 造价优惠 */
function goldMineCost(forLevel){
  const ec=ACTIVE_MODE.economy||{};
  const base=ec.mineCost||70,scale=ec.mineCostScale||1.35;
  let cost=base*Math.pow(scale,forLevel);
  const aLv=(game.tech&&game.tech.A)||0;
  cost*=1+(TECH_TREE.A.effect.buildCostPct||0)*aLv;
  return Math.round(cost);
}
/* ★ 金矿升级造价：以当前等级为幂（等级越高越贵） */
function goldMineUpCost(level){
  const ec=ACTIVE_MODE.economy||{};
  const base=ec.mineCost||70,scale=ec.mineCostScale||1.35;
  let cost=base*Math.pow(scale,level);
  const aLv=(game.tech&&game.tech.A)||0;
  cost*=1+(TECH_TREE.A.effect.buildCostPct||0)*aLv;
  return Math.max(1,Math.round(cost));
}
/* ★ 金矿升级视觉：水晶更大更亮、底座加粗（等级越高越醒目） */
function upgradeGoldMineVisual(ex){
  const lv=ex.level||1;
  if(ex.crystal){
    ex.crystal.geometry.dispose();
    ex.crystal.geometry=new THREE.OctahedronGeometry(.95+lv*.1);
    ex.crystal.material.color.setHex(0xffd75e);
    ex.crystal.material.emissive.setHex(0x1a0a00+Math.min(0x660000,lv*0x100000));
    ex.crystal.scale.setScalar(1+lv*.06);
  }
  if(ex.group&&ex.group.children[0]){
    ex.group.children[0].scale.setScalar(1+.08*(lv-1));
  }
}
const priceOf=b=>{
  if(b.id==="goldmine")return goldMineCost(goldMines.length);
  /* ★ 科技 A：构筑造价优惠 */
  const aLv=(game.tech&&game.tech.A)||0;
  const techMult=1+(TECH_TREE.A.effect.buildCostPct||0)*aLv;
  return Math.round(b.price*Math.pow(.85,game.stats.builderLv||0)*techMult);
};
function updateGoldUI(){
  if($("gold"))$("gold").textContent=Math.floor(game.gold);
  if($("goldBig"))$("goldBig").textContent=Math.floor(game.gold);
  const list=shopList();
  document.querySelectorAll(".shopItem").forEach((el,i)=>{
    const b=list[i];
    if(!b)return;
    const locked=ACTIVE_MODE.key==="survival"&&b.techCost&&game.techPoints<b.techCost;
    const poor=game.gold<priceOf(b)||(b.pop>0&&game.popUsed+b.pop>game.popMax);
    el.classList.toggle("poor",poor&&!locked);
    el.classList.toggle("locked",!!locked);
  });
  updateResUI();
}
/* ★ 生存资源条刷新：人口 / 科技点（波次与大门血量分别由 startWave / updateHpUI 负责） */
function updateResUI(){
  if(ACTIVE_MODE.key!=="survival")return;
  if($("popText"))$("popText").textContent=`${game.popUsed}/${game.popMax}`;
  if($("techText"))$("techText").textContent=Math.floor(game.techPoints);
}
function renderShop(){
  const wrap=$("shop");wrap.innerHTML="";
  shopList().forEach((b,i)=>{
    const d=document.createElement("div");
    const locked=ACTIVE_MODE.key==="survival"&&b.techCost&&game.techPoints<b.techCost;
    const poor=game.gold<priceOf(b)||(b.pop>0&&game.popUsed+b.pop>game.popMax);
    d.className="shopItem"+(buildSel===i?" sel":"")+(locked?" locked":"")+(poor?" poor":"");
    let tags=`<div class="pr">💰 ${priceOf(b)}</div>`;
    if(b.pop>0)tags+=`<div class="pop">👥 ${b.pop}</div>`;
    if(b.techCost)tags+=`<div class="tc">🔒科技 ${b.techCost}</div>`;
    d.innerHTML=`<span class="hk">${i+1}</span><div class="ic">${b.icon}</div>
      <div class="nm">${b.name}</div>${tags}
      <div class="ds">${b.desc}</div>`;
    d.onclick=()=>selectBuild(buildSel===i?null:i);
    wrap.appendChild(d);
  });
}
function selectBuild(i){
  buildSel=i;
  renderShop();
  if(ghost){scene.remove(ghost);ghost=null;}
  if(i!==null){
    const tall=shopList()[i].id.startsWith("wall");
    ghost=new THREE.Mesh(
      new THREE.BoxGeometry(TILE*.96,tall?2.4:1.2,TILE*.96),
      new THREE.MeshBasicMaterial({color:0x39d98a,transparent:true,opacity:.35}));
    ghost.visible=false;scene.add(ghost);
  }
}
/* 屏幕坐标 → 地面格子 */
const _ray=new THREE.Raycaster(),_ndc=new THREE.Vector2();
function pickCell(){
  _ndc.x=(mouse.x/innerWidth)*2-1;_ndc.y=-(mouse.y/innerHeight)*2+1;
  _ray.setFromCamera(_ndc,camera);
  if(Math.abs(_ray.ray.direction.y)<1e-5)return null;
  const t=-_ray.ray.origin.y/_ray.ray.direction.y;
  if(t<0)return null;
  const pt=_ray.ray.origin.clone().addScaledVector(_ray.ray.direction,t);
  const c=cellOf(pt.x,pt.z);
  return inMap(c.x,c.z)?c:null;
}
function cellPlaceable(c){
  /* ★ P4-2：T_RAMP 坡道格允许建墙（WC3 式堵坡口战术）；
     破坏/拆除后由 buildWallTile 恢复坡道，不会隐形封死 */
  const t=grid[c.z][c.x];
  return (t===T_EMPTY||t===T_ROAD||t===T_PLATEAU||t===T_RAMP)&&c.x>0&&c.x<GRID-1&&c.z>0&&c.z<GRID-1;
}
function updateGhost(){
  if(!ghost||buildSel===null)return;
  ghostCell=pickCell();
  if(!ghostCell){ghost.visible=false;return;}
  const cc=cellCenter(ghostCell.x,ghostCell.z);
  const tall=shopList()[buildSel].id.startsWith("wall");
  ghost.position.set(cc.x,heightAt(cc.x,cc.z)+(tall?1.2:.6),cc.z);
  const ok=cellPlaceable(ghostCell)&&game.gold>=priceOf(shopList()[buildSel]);
  ghost.material.color.setHex(ok?0x39d98a:0xff5d5d);
  ghost.visible=true;
}
/* ★ 生存炮塔：取某等级的当前属性（基础 + N 阶升级覆盖） */
function turretStats(key,lvl){
  const t=TURRET_TYPES[key];
  if(!t)return null;
  const s=Object.assign({},t.stats);
  for(let k=0;k<lvl;k++){const up=t.upgrade[k];if(up)for(const p in up)s[p]=up[p];}
  return s;
}
/* ★ 生存炮塔：程序化生成塔体（基础 + 彩色塔身），无外部模型依赖 */
/* ★ P3-3：炮台固定坦克化 —— WC3 式"固定防御坦克"造型：
   坦克底盘(履带+车体)固定在格内不可移动，炮塔可旋转索敌。
   tint 参数区分塔种（mg 黄 / cannon 橙 / frost 蓝 / sniper 白 / pulse 紫 / tesla 青）。 */
function makeTurretMesh(key){
  const tt=TURRET_TYPES[key]||{color:0x88aacc};
  const g=new THREE.Group();
  const M=(c,r,m)=>new THREE.MeshStandardMaterial({color:c,roughness:r??.6,metalness:m??.35});
  /* --- 履带 ×2 --- */
  const trackGeo=new THREE.BoxGeometry(.7,.62,3.0);
  const trackMat=M(0x232a33,.85,.2);
  const tl=new THREE.Mesh(trackGeo,trackMat);tl.position.set(-1.05,.31,0);
  const tr=new THREE.Mesh(trackGeo,trackMat);tr.position.set(1.05,.31,0);
  g.add(tl,tr);
  /* --- 车体 --- */
  const hull=new THREE.Mesh(new THREE.BoxGeometry(1.7,.62,2.6),M(tt.color,.55,.45));
  hull.position.y=.93;g.add(hull);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(1.5,.4,.7),M(tt.color,.55,.45));
  nose.position.set(0,.86,-1.45);g.add(nose);
  /* --- 炮塔（userData.turret 供索敌旋转） --- */
  const tur=new THREE.Group();
  const dome=new THREE.Mesh(new THREE.CylinderGeometry(.78,.95,.55,10),M(tt.color,.5,.5));
  dome.position.y=.28;tur.add(dome);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.14,.17,2.3,8),M(0x222a33,.5,.55));
  barrel.rotation.x=Math.PI/2;barrel.position.set(0,.34,-1.35);tur.add(barrel);
  tur.position.y=1.55;
  tur.name="turret";g.userData.turret=tur;
  g.add(tur);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return g;
}
/* ★ 生存炮塔升级：同格已存在同类炮塔时，点击该格即升级（level 0→1→2） */
function upgradeTurretAt(x,z){
  const t=builtTurrets.find(t=>t.cx===x&&t.cz===z);
  if(!t){toast("⚠ 该位置没有可升级的炮塔");return;}
  if(t.level>=2){toast("⚠ 炮塔已达最高等级");return;}
  const tt=TURRET_TYPES[t.turretKey];
  if(!tt||!tt.upgrade[t.level]){toast("⚠ 暂无可应用升级");return;}
  const st=turretStats(t.turretKey,t.level+1);
  if(st.dmg!=null)t.dmg=st.dmg;
  if(st.fireRate!=null)t.fireCd=1/st.fireRate;
  if(st.range!=null)t.range=st.range*TILE;
  if(st.splash!=null)t.blast=st.splash;
  if(st.slow!=null)t.slow=st.slow;
  if(st.pierce!=null)t.pierce=st.pierce;
  if(st.stun!=null)t.stun=st.stun;
  if(st.chain!=null)t.chain=st.chain;
  t.level++;
  /* 升级视觉：炮塔(坦克顶塔)微微发光 */
  const col=t.group.userData.turret?t.group.userData.turret.children[0]:t.group.children[1];
  if(col&&col.material){
    col.material.emissive=new THREE.Color(tt.color).multiplyScalar(.18);
    col.material.emissiveIntensity=.6;
  }
  sfx.levelup();
  spawnParticles(t.group.position.clone().setY(2),0x9fd4ff,10,6,.8);
  toast(`🔧 ${tt.name} 升至 ${t.level+1} 级`);
  updateResUI();
}
function tryPlace(px,pz){
  /* ★ 烟测/外部 API：允许直接传入世界坐标触发放置（优先于光标 ghostCell） */
  if(px!=null&&pz!=null){
    ghostCell=cellOf(px,pz);
    if(ghost&&ghostCell){ghost.position.set(px,0,pz);ghost.visible=true;}
  }
  if(buildSel===null||!ghostCell||!ghost.visible)return;
  const b=shopList()[buildSel];
  /* ★ 墙升级放行：目标格已是墙时允许进入升级分支，否则被 cellPlaceable 拦截导致升级不可达 */
  const wallUpgradeTarget=ACTIVE_MODE.key==="survival"&&b.kind==="wall"&&grid[ghostCell.z][ghostCell.x]===T_STEEL;
  if(!cellPlaceable(ghostCell)&&!wallUpgradeTarget)return;
  const cc=cellCenter(ghostCell.x,ghostCell.z);
  /* 避免把玩家困死 */
  if(player&&player.alive&&Math.hypot(player.group.position.x-cc.x,player.group.position.z-cc.z)<3.2)return;
  const gy=heightAt(cc.x,cc.z);
  /* ---- 金矿：点已有矿→升级，否则新建 ---- */
  if(b.id==="goldmine"){
    const ec=ACTIVE_MODE.economy||{},maxLv=ec.mineMaxLevel||6;
    const ex=goldMines.find(m=>m.x===ghostCell.x&&m.z===ghostCell.z);
    if(ex){
      if(ex.level>=maxLv){toast("⚠ 金矿已达最高等级");return;}
      const upCost=goldMineUpCost(ex.level);
      if(game.gold<upCost){toast("💰 金币不足，无法升级");return;}
      game.gold-=upCost;updateGoldUI();
      ex.level++;
      upgradeGoldMineVisual(ex);
      toast(`💰 金矿升到 Lv${ex.level}`);
      spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xffd75e,8,6,.8);
      return;
    }
    const cost=priceOf(b);
    if(game.gold<cost)return;
    game.gold-=cost;updateGoldUI();
    const g=new THREE.Group();
    /* ★ Kenney 化：survival 模式用 dumpster 基座 + 保留程序化发光水晶（视觉点缀） */
    if(ACTIVE_MODE.key==="survival"&&ASSETS["dumpster"]){
      const baseM=placeModel(g,"dumpster",0,0,TILE*.95,0,0,0x3a4a60,1.4,1.4);
      if(baseM)baseM.position.y=0;
    }else{
      const base=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.5,.6,8),
        new THREE.MeshStandardMaterial({color:0x3a4a60,roughness:.7,metalness:.3}));
      base.position.y=.3;g.add(base);
    }
    const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.95),
      new THREE.MeshStandardMaterial({color:0xffd75e,emissive:0x664400,roughness:.25,metalness:.6}));
    crystal.position.y=1.25;g.add(crystal);
    g.position.set(cc.x,gy,cc.z);scene.add(g);
    goldMines.push({group:g,crystal,x:ghostCell.x,z:ghostCell.z,level:1});
    sfx.levelup();
    spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xffd75e,8,6,.8);
    return;
  }
  /* ---- 生存模式：数据驱动建造分发 ---- */
  if(ACTIVE_MODE.key==="survival"){
    /* 同格已有同类炮塔 → 升级而非新建 */
    if(b.kind==="turret"){
      const ex=builtTurrets.find(t=>t.cx===ghostCell.x&&t.cz===ghostCell.z&&t.turretKey===b.turret);
      if(ex){upgradeTurretAt(ghostCell.x,ghostCell.z);return;}
    }
    const needPop=b.pop||0;
    if(needPop>0&&game.popUsed+needPop>game.popMax){
      toast(`👥 人口不足（${game.popUsed}/${game.popMax}），请先建住房`);return;
    }
    if(b.techCost&&game.techPoints<b.techCost){
      toast(`🔒 科技点不足（${Math.floor(game.techPoints)}/${b.techCost}）`);return;
    }
    const cost=priceOf(b);
    if(game.gold<cost){toast("💰 金币不足");return;}
    game.gold-=cost;updateGoldUI();

    if(b.kind==="wall"){
      const ci=idx(ghostCell.x,ghostCell.z);
      const curLv=wallLvAt(ghostCell.x,ghostCell.z);
      const isExistingWall=curLv>0&&grid[ghostCell.z][ghostCell.x]===T_STEEL;

      if(isExistingWall){
        /* ---- 升级：当前等级 < 5 且金币足够，按差额付费 ---- */
        if(curLv>=WALL_LEVELS.length){toast("⚠ 墙体已达最高等级 Lv5");return;}
        const upCost=wallPriceNext(curLv);
        /* 入口已按 b.price(默认 12) 预扣，退还后再按 upCost 扣，避免双扣 */
        game.gold+=cost;updateGoldUI();
        if(game.gold<upCost){toast(`💰 升级需要 ${upCost} 金币`);return;}
        game.gold-=upCost;updateGoldUI();
        const nextLv=curLv+1;
        const w=WALL_LEVELS[nextLv-1];
        /* 重建 mesh：先移除旧 tile mesh，再创建新等级；保留 steelHP 比例 */
        const oldHp=steelHP.get(ci)||w.hp;
        const oldMax=wallLvAt(ghostCell.x,ghostCell.z);  // 用于按比例换算
        const ratio=oldMax>0?(oldHp/(WALL_LEVELS[oldMax-1].hp||1)):1;
        const old=tileMeshes[ci];
        if(old){mapGroup.remove(old);tileMeshes[ci]=null;}
        const m=buildWallTile(mapGroup,ghostCell.x,ghostCell.z,nextLv);
        tileMeshes[ci]=m;mapGroup.add(m);
        structCells.add(ci);
        const newHp=Math.max(1,Math.round(w.hp*ratio));
        steelHP.set(ci,newHp);
        const wasR=wallMeta.get(ci)&&wallMeta.get(ci).wasRamp;   /* ★ P4-2：升级保留坡道标记 */
        wallMeta.set(ci,{lv:nextLv,hp:newHp,thorns:w.thorns||0,wasRamp:!!wasR});
        computeFlowField();
        sfx.levelup();
        spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0x9fd4ff,12,7,.9);
        toast(`🧱 墙升至 Lv${nextLv}（${w.tag}·❤${w.hp}${w.thorns>0?` · ⚔${Math.round(w.thorns*100)}%`:""}）`);
        updateResUI();
        return;
      }

      /* ---- 新建：放 Lv1 墙（★ P4-2：坡道格也可建墙，wasRamp 记录以便破墙后恢复坡道） ---- */
      const w0=WALL_LEVELS[0];
      const wasRampHere=grid[ghostCell.z][ghostCell.x]===T_RAMP;   /* ★ P4-2：坡道格建墙标记 */
      grid[ghostCell.z][ghostCell.x]=T_STEEL;
      steelHP.set(ci,w0.hp);
      wallMeta.set(ci,{lv:1,hp:w0.hp,thorns:w0.thorns||0,wasRamp:wasRampHere});
      const m=buildWallTile(mapGroup,ghostCell.x,ghostCell.z,1);
      tileMeshes[ci]=m;mapGroup.add(m);
      structCells.add(ci);
      computeFlowField();   // 墙体会改变通行，重算流场
      sfx.hit();
      spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xc89a6a,6,5,.7);
      toast(`🧱 建墙 Lv1（${w0.tag}·❤${w0.hp}）`);
    }else if(b.kind==="turret"){
      const key=b.turret, st=turretStats(key,0), g=makeTurretMesh(key);
      g.position.set(cc.x,gy,cc.z);scene.add(g);
      const bar=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.3),
        new THREE.MeshBasicMaterial({color:0x1c1410,transparent:true,opacity:.7,depthWrite:false}));
      const barFg=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.2),
        new THREE.MeshBasicMaterial({color:0x39d98a,depthWrite:false}));
      bar.position.y=3.6;barFg.position.y=3.6;bar.visible=barFg.visible=false;
      g.add(bar);g.add(barFg);
      builtTurrets.push({group:g,kind:key,turretKey:key,level:0,cx:ghostCell.x,cz:ghostCell.z,
        /* ★ range 以"格"配置，转世界单位参与距离比较（TILE=4） */
        range:st.range*TILE,cd:0,fireCd:1/st.fireRate,dmg:st.dmg,blast:st.splash||0,
        pierce:st.pierce||0,slow:st.slow||0,stun:st.stun||0,chain:st.chain||0,
        popUsed:needPop||0,
        hp:40,maxHp:40,bar,barFg});
      structCells.add(idx(ghostCell.x,ghostCell.z));
      if(needPop>0)game.popUsed+=needPop;
      updateResUI();
      sfx.levelup();
    }else if(b.id==="house"){
      const g=new THREE.Group();
      /* ★ Kenney 化：survival 模式用 building-a（Lv1 平房）；保留其他模式原程序化 */
      if(ACTIVE_MODE.key==="survival"&&ASSETS["building-a"]){
        const body=placeModel(g,"building-a",0,0,TILE*.9,Math.PI/4,0,0x8a6b4f,2.2,2.2);
        if(body)body.position.y=0;
      }else{
        const body=new THREE.Mesh(new THREE.BoxGeometry(2.8,2,2.8),
          new THREE.MeshStandardMaterial({color:0x8a6b4f,roughness:.85}));
        body.position.y=1;g.add(body);
        const roof=new THREE.Mesh(new THREE.ConeGeometry(2.2,1.4,4),
          new THREE.MeshStandardMaterial({color:0xb04a3a,roughness:.7}));
        roof.position.y=2.7;roof.rotation.y=Math.PI/4;g.add(roof);
      }
      g.position.set(cc.x,gy,cc.z);scene.add(g);
      game.popMax+=(ACTIVE_MODE.economy&&ACTIVE_MODE.economy.housePop)||6;
      structCells.add(idx(ghostCell.x,ghostCell.z));
      builtHouses.push({group:g,x:ghostCell.x,z:ghostCell.z,level:1});
      updateResUI();
      sfx.hit();
    }else if(b.id==="techtower"){
      const g=new THREE.Group();
      /* ★ Kenney 化：survival 模式用 building-skyscraper-a（主楼）+ 发光球（程序化） */
      if(ACTIVE_MODE.key==="survival"&&ASSETS["building-skyscraper-a"]){
        const tower=placeModel(g,"building-skyscraper-a",0,0,TILE*1.1,Math.PI/4,0,0x446080,3.6,3.6);
        if(tower)tower.position.y=0;
      }else{
        const base=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.6,.8,8),
          new THREE.MeshStandardMaterial({color:0x37475c,roughness:.6,metalness:.35}));
        base.position.y=.4;g.add(base);
      }
      const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.9,0),
        new THREE.MeshStandardMaterial({color:0x8be0ff,emissive:0x224488,emissiveIntensity:.6,roughness:.2,metalness:.3}));
      orb.position.y=3.2;g.add(orb);
      g.position.set(cc.x,gy,cc.z);scene.add(g);
      techTowers.push({group:g,orb,x:ghostCell.x,z:ghostCell.z});
      structCells.add(idx(ghostCell.x,ghostCell.z));
      sfx.hit();
    }
    spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xffd75e,8,6,.8);
    return;
  }

  /* ---- 经典/塔防：沿用原 id 分支 ---- */
  const cost=priceOf(b);
  if(game.gold<cost)return;
  game.gold-=cost;updateGoldUI();
  if(b.id==="wallS"||b.id==="wallB"){
    grid[ghostCell.z][ghostCell.x]=b.id==="wallS"?T_STEEL:T_BRICK;
    if(b.id==="wallS")steelHP.set(idx(ghostCell.x,ghostCell.z),8); /* ★ 玩家钢墙耐久 8 点 */
    const m=buildWallTile(mapGroup,ghostCell.x,ghostCell.z,b.id==="wallS");
    tileMeshes[idx(ghostCell.x,ghostCell.z)]=m;
    mapGroup.add(m);
    sfx.hit();
  }else if(b.id==="mine"){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.1,.55,10),
      new THREE.MeshStandardMaterial({color:0x50332a,roughness:.6}));
    body.position.y=.28;g.add(body);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.24,8,8),
      new THREE.MeshBasicMaterial({color:0xff4444}));
    lamp.position.set(0,.62,0);g.add(lamp);
    g.position.set(cc.x,gy,cc.z);
    scene.add(g);
    builtMines.push({group:g,lamp,radius:2.6});
    sfx.shoot();
  }else{ /* mg / cannon 炮台 —— 优先用 Kenney 塔防炮模型 */
    const g=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.45,1,12),
      new THREE.MeshStandardMaterial({color:0x46586e,roughness:.5,metalness:.4}));
    base.position.y=.5;g.add(base);
    if(ASSETS["weapon-cannon"]){
      const inst=ASSETS["weapon-cannon"].clone(true);
      const bs=new THREE.Box3().setFromObject(inst).getSize(new THREE.Vector3());
      inst.scale.setScalar(2.6/Math.max(.001,Math.max(bs.x,bs.z)));
      const bc=new THREE.Box3().setFromObject(inst).getCenter(new THREE.Vector3());
      inst.position.sub(bc);inst.position.y+=1.1;
      g.add(inst);
    }else{
      const tur=new THREE.Mesh(new THREE.BoxGeometry(.7,.7,2.4),
      new THREE.MeshStandardMaterial({color:b.id==="mg"?0x6a94c8:b.id==="frost"?0x4aa8d8:0xa06a4a,roughness:.45,metalness:.5}));
    tur.position.set(0,1.6,-.6);g.add(tur);
    }
    g.position.set(cc.x,gy,cc.z);
    /* ★ 炮台血条（受击后显示） */
    const hpMax=b.id==="mg"?14:b.id==="frost"?16:22;
    const bar=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.3),
      new THREE.MeshBasicMaterial({color:0x1c1410,transparent:true,opacity:.7,depthWrite:false}));
    const barFg=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.2),
      new THREE.MeshBasicMaterial({color:0x39d98a,depthWrite:false}));
    bar.position.y=3.2;barFg.position.y=3.2;
    bar.visible=barFg.visible=false;
    g.add(bar);g.add(barFg);
    scene.add(g);
    builtTurrets.push({group:g,kind:b.id,
      range:(b.id==="mg"?16:(b.id==="frost"?13:26))*TILE,cd:0,
      fireCd:b.id==="mg"?.55:(b.id==="frost"?2.0:2.0),dmg:b.id==="mg"?1:(b.id==="frost"?3:4),
      blast:b.id==="mg"?0:(b.id==="frost"?0:2.2),
      hp:hpMax,maxHp:hpMax,bar,barFg});
    sfx.levelup();
  }
  spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xffd75e,8,6,.8);
}
/* ★ 构筑物运行时：炮台索敌开火 + 地雷触发 */
function updateStructBars(t){
  const r=Math.max(0,t.hp/t.maxHp);
  t.bar.visible=t.barFg.visible=r<1;
  t.barFg.scale.x=r;
  t.barFg.position.x=-(1-r)*1.1;
}
function destroyTurret(t){
  explode(t.group.position.clone().setY(1.4),false);
  scene.remove(t.group);
  const i=builtTurrets.indexOf(t);
  if(i>=0)builtTurrets.splice(i,1);
  camShake=Math.max(camShake,.4);
}
function updateBuiltTurrets(dt){
  const now=performance.now();
  /* ★ 科技树全局增益：B伤害 / C射程 / D射速 */
  const dMult=(1+.4*(game.stats.netmasterLv||0))*(1+(TECH_TREE.B.effect.turretDmgPct||0.1)*(game.tech.B||0));
  const rMult=(1+.25*(game.stats.netmasterLv||0))*(1+(TECH_TREE.C.effect.turretRangePct||0.08)*(game.tech.C||0));
  const fMult=1+(TECH_TREE.D.effect.turretFireRatePct||0.09)*(game.tech.D||0);
  for(const t of builtTurrets){
    t.cd-=dt;
    if(t.bar.visible){t.bar.lookAt(camera.position);t.barFg.lookAt(camera.position);}
    /* ★ 冰冻塔：范围内持续减速 + 科技 E 冰伤，不发射子弹 */
    if(t.kind==="frost"){
      const eLv=(game.tech&&game.tech.E)||0;
      const slowPct=Math.min(.75,.35*(1+(TECH_TREE.E.effect.frostSlowPct||0.10)*eLv));
      const dotPerSec=eLv>0?(TECH_TREE.E.effect.frostDmgPct||0.08)*eLv*3:0;
      const fr=t.range*rMult;
      for(const en of enemies){
        if(!en.alive||now<en.spawnFlash)continue;
        const dx=en.group.position.x-t.group.position.x,dz=en.group.position.z-t.group.position.z;
        if(dx*dx+dz*dz<fr*fr){
          en.slowMult=1-slowPct;en.slowUntil=now+450;
          if(dotPerSec>0){en.hp-=dotPerSec*dt;if(en.hp<=0)killEnemy(en);}
        }
      }
      continue;
    }
    let tgt=null,best=(t.range*rMult)*(t.range*rMult);
    for(const e of enemies){
      if(!e.alive||now<e.spawnFlash)continue;
      const dx=e.group.position.x-t.group.position.x,dz=e.group.position.z-t.group.position.z;
      const d2=dx*dx+dz*dz;
      if(d2<best){best=d2;tgt=e;}
    }
    if(tgt){
      const dx=tgt.group.position.x-t.group.position.x,dz=tgt.group.position.z-t.group.position.z;
      const want=Math.atan2(dx,dz)+Math.PI;
      /* ★ P3-3 固定坦克炮台：车体不动，仅炮塔旋转索敌 */
      const tur=t.group.userData.turret;
      if(tur)tur.rotation.y+=shortAngle(want-tur.rotation.y)*Math.min(1,dt*7);
      else t.group.rotation.y+=shortAngle(want-t.group.rotation.y)*Math.min(1,dt*7);
      if(t.cd<=0){
        t.cd=t.fireCd/fMult;
        const dir=new THREE.Vector3(dx,0,dz).normalize();
        if(t.kind==="sniper"){
          /* 狙击：超远高伤，可穿透（升级后） */
          shoot({group:t.group,dmg:t.dmg*dMult,blast:t.blast},dir,true,{pierce:t.pierce,thruWall:true});
        }else if(t.kind==="pulse"){
          /* 脉冲：范围眩晕 + 伤害 */
          const R=t.range*rMult,dmg=t.dmg*dMult;
          for(const e of enemies){
            if(!e.alive||now<e.spawnFlash)continue;
            const ex=e.group.position.x-t.group.position.x,ez=e.group.position.z-t.group.position.z;
            if(ex*ex+ez*ez<R*R){
              e.hp-=dmg;
              e.stunUntil=now+(t.stun||0)*1000;
              spawnParticles(e.group.position.clone().setY(2.2),0xc084fc,3,4,.6);
              if(e.hp<=0)killEnemy(e);
            }
          }
          spawnParticles(t.group.position.clone().setY(1.6),0xc084fc,12,7,1);
        }else if(t.kind==="tesla"){
          /* 电磁：主目标 + 最近 N 个敌人连锁闪电 */
          const R=t.range*rMult,dmg=t.dmg*dMult;
          const hitList=[tgt];
          let cur=tgt;
          for(let c=0;c<(t.chain||0);c++){
            let bestD=1e9,nb=null;
            for(const e of enemies){
              if(!e.alive||now<e.spawnFlash||hitList.indexOf(e)>=0)continue;
              const ex=e.group.position.x-cur.group.position.x,ez=e.group.position.z-cur.group.position.z;
              const d2=ex*ex+ez*ez;
              if(d2<bestD&&d2<(R*1.4)*(R*1.4)){bestD=d2;nb=e;}
            }
            if(!nb)break;
            hitList.push(nb);cur=nb;
          }
          hitList.forEach((e,i)=>{
            const f=1-i*0.15;
            e.hp-=dmg*f;
            lightningBeam(t.group.position.clone().setY(1.8),e.group.position.clone().setY(1.6),0x8be9fd);
            if(e.hp<=0)killEnemy(e);
          });
        }else{
          /* mg / cannon / 经典：标准发射（★ P4-3：塔弹穿墙，不被悬崖/自家建筑挡炮） */
          shoot({group:t.group,dmg:t.dmg*dMult,blast:t.blast},dir,true,{thruWall:true});
        }
      }
    }
  }
  for(let i=builtMines.length-1;i>=0;i--){
    const mn=builtMines[i];
    mn.lamp.material.color.setHex((now%800)<400?0xff4444:0x661111);
    let boom=false;
    for(const e of enemies){
      if(!e.alive||now<e.spawnFlash)continue;
      const dx=e.group.position.x-mn.group.position.x,dz=e.group.position.z-mn.group.position.z;
      if(dx*dx+dz*dz<mn.radius*mn.radius){boom=true;break;}
    }
    if(boom){
      const pos=mn.group.position.clone().setY(1);
      explode(pos,false);
      enemies.forEach(e=>{
        if(!e.alive)return;
        const dx=e.group.position.x-pos.x,dz=e.group.position.z-pos.z;
        if(dx*dx+dz*dz<36){e.hp-=6;if(e.hp<=0)killEnemy(e);}
      });
      destroyBricksAround(pos.x,pos.z,1.8);
      scene.remove(mn.group);
      builtMines.splice(i,1);
    }
  }
}
/* ★ 构筑完成（按钮或倒计时归零共用） */
function finishBuild(){
  /* 幸存者模式：商店只是暂停界面，关闭后继续战斗 */
  if(ACTIVE_MODE.key==="survival"){
    closeBuildMenu();
    return;
  }
  $("build").classList.add("hidden");
  selectBuild(null);
  lastT=performance.now();
  showUpgradeChoice();
}
$("buildDoneBtn").onclick=finishBuild;

/* ---------------- 击杀/死亡/结算 ---------------- */
function killEnemy(e,giveScore=true){
  if(!e.alive)return;
  e.alive=false;
  if(typeof _wdProgress==="function")_wdProgress();   /* ★ P1-1：敌人死亡=波次推进事实 */
  explode(e.group.position.clone().setY(1.4),e.boss);
  /* ★ 角色模型：保留 mesh 播放 die 骨骼动画，1.05s 后由 updateEnemies 真正清理 */
  if(e.characterModel&&e.actions&&e.actions.die){
    e.dying=true;
    e.dyingT=0;
    e.currentAnim=_ANIM_DEATH;
    const die=e.actions.die;
    die.reset();
    die.setLoop(THREE.LoopOnce,1);
    die.clampWhenFinished=true;
    die.setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    /* fadeOut 旧动作 */
    if(e.actions.idle)e.actions.idle.stop();
    if(e.actions.walk)e.actions.walk.stop();
    /* ★ beam 变红：视觉提示"濒死"——1s 内会被一起清理 */
    if(e.beam){e.beam.material.color.setHex(0xff5d5d);e.beam.material.opacity=.55;}
  }else{
    scene.remove(e.group);
    if(e.beam)scene.remove(e.beam);
  }
  if(giveScore){
    game.score+=e.score;$("score").textContent=game.score;
    dropPowerup(e.group.position,!!e.elite);
    /* ★ 金币掉落：仅构筑模式生效（经典/塔防不产金币） */
    if(ACTIVE_MODE.buildEnabled){
      let g;
      if(ACTIVE_MODE.key==="survival"){
        /* ★ 生存：统一击杀金币 economy.killGold，保留精英/狂暴加成 */
        const ec=ACTIVE_MODE.economy||{};
        g=e.boss?130:((ec.killGold||4)*(e.elite?3:1));
        if(e.frenzy)g+=8;
      }else{
        const GBASE={normal:10,fast:12,sniper:14,heavy:22};
        g=e.boss?130:(GBASE[e.type]||10);
        if(e.elite)g*=3;
        if(e.frenzy)g+=8;
      }
      g=Math.round(g*(1+.3*(game.stats.incomeLv||0)));
      game.gold+=g;updateGoldUI();
      spawnParticles(e.group.position.clone().setY(2),0xffd75e,4,5,.5);
    }
    /* ★ 猎杀冲锋：击杀后短时提速 */
    if(game.stats.sprintLv>0)game.sprintUntil=performance.now()+game.stats.sprintDur;
    /* ★ 收割装置：击杀修复装甲 */
    if(game.stats.vampLv>0&&player&&player.alive&&player.hp<player.maxHp){
      player.hp=Math.min(player.maxHp,player.hp+game.stats.vampLv);
      updateHpUI();
      spawnParticles(player.group.position.clone().setY(1.8),0x39d98a,6,4,.7);
    }
  }
  updateEnemyLeftUI();
}
function damagePlayer(dmg){
  const now=performance.now();
  if(!player||!player.alive||now<player.invulnUntil)return;
  if(now<game.buffs.shieldUntil){sfx.hit();return;}
  /* ★ 单兵力场：优先消耗护盾抵挡 */
  if(game.playerShieldHP>0){
    game.playerShieldHP--;sfx.hit();
    spawnParticles(player.group.position.clone().setY(1.8),0x7ec8ff,8,6,.8);
    player.invulnUntil=now+600;
    toast(`💠 力场抵消伤害（剩余 ${game.playerShieldHP}）`);
    return;
  }
  player.hp-=dmg;sfx.hurt();camShake=Math.max(camShake,.5);
  spawnParticles(player.group.position.clone().setY(1.5),0xff5d5d,8,7);
  updateHpUI();
  if(player.hp<=0)playerDie();
  else player.invulnUntil=now+800;
}
function playerDie(){
  if(!player.alive)return;
  player.alive=false;
  explode(player.group.position.clone().setY(1.4),true);
  scene.remove(player.group);
  game.lives--;updateHpUI();
  if(game.lives<=0){endGame(false,true);return;}
  toast(`剩余生命 ${game.lives}`);
  game.respawnTimer=1.5;
}
function baseDestroyed(){
  if(!baseAlive)return;
  baseAlive=false;
  if(baseGroup){
    explode(baseGroup.position.clone().setY(1.5),true);
    scene.remove(baseGroup);baseGroup=null;
  }
  endGame(false,true);
}
/* ★ P0-1 修复：清波一次性闸门
   原缺陷：waveCleared 内部 setTimeout(900)+setTimeout(900) 共 1.8s 才把 enemiesToSpawn 填回正值，
   这段时间里触发条件持续成立 → 每帧重复调用 → 波次连续自增（实测单次清波 +16 波、分数翻 28 倍）。
   闸门在 startWave 时复位，在 resetGame 时清理。 */
let _waveClearing=false;
let _wdStallT=0;                         /* ★ P1-1：无推进事实秒数（声明须在 resetGame 首次调用之前） */
let _wdKillTimer=0;                      /* ★ P1-1：看门狗逐个击杀计时器 */
function waveCleared(){
  if(_waveClearing)return;              /* ★ 重复进入直接吞掉 */
  _waveClearing=true;
  game.score+=500+game.wave*100;$("score").textContent=game.score;
  /* ★ 肃清金币奖励 */
  const bonus=40+game.wave*15;
  game.gold+=bonus;updateGoldUI();
  announce(`第 ${game.wave} 波 肃清！　+${bonus} 金币`);
  setTimeout(()=>{
    if(state!==STATE.PLAYING){_waveClearing=false;return;}   /* ★ 异常分支也要复位，否则永久卡住推进 */
    /* ★ 模式分支：
       - 经典模式：直接三选一强化
       - 幸存者模式：每 3 波三选一，其余波次无缝衔接下一波
       - 塔防：占位 */
    if(ACTIVE_MODE.key==="classic"){
      showUpgradeChoice();
    }else if(ACTIVE_MODE.key==="survival"){
      /* ★ 第 15 波清空后：弹出【胜利 / 无尽】结算选择 */
      if(game.wave>=ACTIVE_MODE.victoryWave&&!game.endless){
        showSettle();
        return;
      }
      if(game.wave%3===0){
        showUpgradeChoice();
      }else{
        announce(`第 ${game.wave+1} 波 来袭！`);
        setTimeout(()=>startWave(game.wave+1),900);
      }
    }else{
      showUpgradeChoice();
    }
  },900);
}
/* ★ 进入波间构筑阶段（倒计时由模式配置决定） */
function showBuildPhase(){
  state=STATE.BUILD;
  game.buildTimer=ACTIVE_MODE.buildTimer||45;
  $("build").classList.remove("hidden");
  renderShop();updateGoldUI();selectBuild(null);
}
/* ★ 幸存者模式：B 键随时打开构筑商店（暂停游戏，无倒计时） */
let buildReturnState=STATE.PLAYING; /* 记录打开商店前状态，关闭后恢复 */
function openBuildMenu(){
  if(state!==STATE.PLAYING&&state!==STATE.BUILD&&state!==STATE.PREP)return;
  buildReturnState=state; /* 记住是 PLAYING 还是 PREP */
  state=STATE.BUILD;
  $("build").classList.remove("hidden");
  renderShop();updateGoldUI();updateResUI();selectBuild(null);
  const timerEl=$("buildTimer");
  timerEl.textContent="∞";
  timerEl.style.color="#7ec8ff";
  $("buildDoneBtn").textContent="关闭商店并继续";
}
function closeBuildMenu(){
  $("build").classList.add("hidden");
  destroyMode=false;
  if($("destroyToggle"))$("destroyToggle").classList.remove("on");
  selectBuild(null);
  lastT=performance.now();
  state=buildReturnState===STATE.PREP?STATE.PREP:STATE.PLAYING;
}
/* ★ 幸存者模式科技树：T 键随时打开，暂停游戏升级全局科技 */
let techReturnState=STATE.PLAYING;

/* ---------------- P4-5 WC3 底部常驻 HUD（三栏） ----------------
   左=小地图（点击跳镜头）｜中=选中状态面板 ↔ 命令卡 双态｜右=资源速览。
   B 键 = 进入建造模式（不暂停）：命令卡切成建造条目，1-9 选择，左键放置，右键/B 取消。 */
let _cmdT=0;
let wc3BuildMode=false;   /* ★ P4-5：建造模式（命令卡二态） */

/* ---- 选中系统：selKind(sel/enemy/wall/turret/goldmine/house/tech) + 引用 ---- */
let wc3Sel=null;
function wc3ClearSel(){
  wc3Sel=null;
  const hud=$("hud");if(hud)hud.classList.remove("hasSel");
  const sp=$("selPanel");if(sp)sp.classList.remove("show");
}
function wc3Select(kind,ref){
  wc3Sel={kind,ref};
  const hud=$("hud");if(hud)hud.classList.add("hasSel");
  const sp=$("selPanel");if(sp)sp.classList.add("show");
}
function wc3RenderSel(){
  const sp=$("selPanel");if(!sp)return;
  if(!wc3Sel){sp.classList.remove("show");return;}
  const ic=$("spIcon"),nm=$("spName"),st=$("spStat"),bw=$("spBarWrap"),fg=$("spBarFg"),acts=$("spActs");
  const s=wc3Sel.ref,k=wc3Sel.kind;
  let html="",hp=-1,hpMax=1,btns="";
  if(k==="enemy"&&s&&s.alive){
    ic.textContent=s.boss?"👹":"🧟";
    nm.textContent=(s.boss?"BOSS · ":"")+(ENEMY_TYPES[s.type]?ENEMY_TYPES[s.type].name||s.type:s.type);
    hp=s.hp;hpMax=ENEMY_TYPES[s.type]&&ENEMY_TYPES[s.type].hp?ENEMY_TYPES[s.type].hp:s.hp;
    html=`伤害 <b>${s.dmg}</b> · 速度 <b>${s.speed.toFixed(1)}</b>`;
  }else if(k==="turret"&&s&&builtTurrets.indexOf(s)>=0){
    ic.textContent=TURRET_TYPES[s.turretKey]?"🔫":"🚫";
    nm.textContent=TURRET_TYPES[s.turretKey]?TURRET_TYPES[s.turretKey].name:"炮塔";
    hp=s.hp;hpMax=s.maxHp;
    html=`等级 <b>Lv${s.level+1}</b> · 伤害 <b>${s.dmg}</b> · 射程 <b>${Math.round(s.range/TILE)}</b>`;
    btns=`<button class="spBtn warn" id="spSell">🧹 拆除</button>`;
  }else if(k==="wall"&&s&&grid[s.z][s.x]===T_STEEL){
    const lv=wallLvAt(s.x,s.z)||1,w=WALL_LEVELS[lv-1];
    ic.textContent="🧱";
    nm.textContent=w?`${w.tag}墙 Lv${lv}`:"墙";
    hp=steelHP.get(idx(s.x,s.z))||0;hpMax=w?w.hp:hp;
    html=w?`❤ <b>${hp}</b>${w.thorns>0?` · 反伤 <b>${Math.round(w.thorns*100)}%</b>`:""} · 坐标 <b>${s.x},${s.z}</b>`:"";
    btns=`<button class="spBtn warn" id="spSell">🧹 拆除</button>`;
  }else if(k==="goldmine"&&s&&goldMines.indexOf(s)>=0){
    ic.textContent="💰";nm.textContent=`金矿 Lv${s.level}`;
    html=`产出 <b>${(ACTIVE_MODE.economy&&ACTIVE_MODE.economy.mineIncomeTiers?ACTIVE_MODE.economy.mineIncomeTiers[Math.min(s.level-1,5)]:"?")}</b> 金/秒`;
    btns=`<button class="spBtn warn" id="spSell">🧹 拆除</button>`;
  }else{wc3ClearSel();return;}
  nm.textContent=nm.textContent||"";
  st.innerHTML=html;
  if(hp>=0&&bw){bw.style.display="block";fg.style.width=Math.max(0,Math.min(100,hp/hpMax*100))+"%";
    fg.style.background=hp/hpMax>.5?"linear-gradient(90deg,#39d98a,#7cf7c0)":"linear-gradient(90deg,#ff5d5d,#ffa26d)";}
  else if(bw)bw.style.display="none";
  acts.innerHTML=btns;
  const sell=$("spSell");
  if(sell)sell.onclick=()=>{
    if(wc3Sel&&wc3Sel.kind==="turret")attemptDestroy(wc3Sel.ref.cx,wc3Sel.ref.cz);
    else if(wc3Sel&&wc3Sel.ref&&wc3Sel.ref.x!=null)attemptDestroy(wc3Sel.ref.x,wc3Sel.ref.z);
    wc3ClearSel();
  };
}

/* ---- 左键点选（raycast 场景对象 → 反查数据结构） ---- */
const _selRay=new THREE.Raycaster(),_selNdc=new THREE.Vector2();
function wc3PickAt(px,py){
  _selNdc.x=(px/innerWidth)*2-1;_selNdc.y=-(py/innerHeight)*2+1;
  _selRay.setFromCamera(_selNdc,camera);
  const hits=_selRay.intersectObjects(scene.children,true);
  for(const h of hits){
    let o=h.object;
    while(o){
      /* 敌人：Character 模型根挂 e.group */
      const en=enemies.find(e=>e.group===o&&e.alive&&!e.dying);
      if(en)return{kind:"enemy",ref:en};
      const tr=builtTurrets.find(t=>t.group===o);
      if(tr)return{kind:"turret",ref:tr};
      const mn=goldMines.find(m=>m.group===o);
      if(mn)return{kind:"goldmine",ref:mn};
      o=o.parent;
    }
    /* 墙：按命中点格子反查（tileMeshes 归 mapGroup，爬 parent 不可靠） */
    if(h.object&&h.object.parent===mapGroup&&h.point){
      const cx=Math.round((h.point.x+HALF)/TILE-.5),cz=Math.round((h.point.z+HALF)/TILE-.5);
      if(inMap(cx,cz)&&grid[cz][cx]===T_STEEL&&steelHP.get(idx(cx,cz))>0)
        return{kind:"wall",ref:{x:cx,z:cz}};
    }
    /* 命中玩家坦克 → 视为点空地 */
    if(player&&o===player.group)break;
    break;
  }
  return null;
}

/* ---- 命令卡：常态 6 格 / 建造模式 10 格（SURVIVAL_BUILDS 顺序） ---- */
function renderCmdCard(){
  const wrap=$("cmdcard");if(!wrap)return;
  let items;
  if(wc3BuildMode){
    const list=shopList();
    items=list.map((b,i)=>({
      k:String(i+1),icon:b.icon,name:b.name,price:priceOf(b),
      tip:`${b.desc}<br>造价 💰${priceOf(b)}${b.pop?` · 人口 ${b.pop}`:""}${b.techCost?` · 需科技点 ${b.techCost}`:""}`,
      hot:String(i+1),act:()=>{
        if(ACTIVE_MODE.key==="survival"&&b.techCost&&game.techPoints<b.techCost){toast(`🔒 科技点不足（${b.techCost}）`);return;}
        selectBuild(i);
      },
      sel:buildSel===i,
      dim:(game.gold<priceOf(b))||(b.pop>0&&game.popUsed+b.pop>game.popMax)||(ACTIVE_MODE.key==="survival"&&b.techCost&&game.techPoints<b.techCost),
    }));
    items.push({k:"X",icon:"✖",name:"收起",hot:"B",tip:"退出建造模式",act:()=>{closeWc3Build();},sel:false,dim:false});
  }else{
    items=[
      {k:"M",icon:"🚩",name:"移动",tip:"右键点击地面<br>指挥坦克移动到目标位置",hot:"右键"},
      {k:"A",icon:"⚔️",name:"攻击",tip:"按 A 后左键点地<br>沿途自动与敌军交战",hot:"A"},
      {k:"S",icon:"✋",name:"停止",tip:"停止移动<br>原地自动还击",hot:"S"},
      {sep:true},
      {k:"B",icon:"🏗",name:"建造",tip:"进入建造模式（不暂停）<br>选择炮台/墙/金矿/住房放置",hot:"B",act:()=>{openWc3Build();}},
      {k:"T",icon:"🧪",name:"科技",tip:"打开科技树<br>消耗金币升级全局科技",hot:"T",act:()=>{openTechMenu();}},
      {k:"G",icon:"🚪",name:"大门",tip:"升级大门血量/护甲<br>反伤/恢复/闪避",hot:"G",act:()=>{openGateUp();}},
    ];
  }
  wrap.innerHTML="";
  items.forEach(it=>{
    if(it.sep){
      const d=document.createElement("div");
      d.style.cssText="width:1px;background:rgba(110,170,255,.3);margin:4px 2px;";
      wrap.appendChild(d);return;
    }
    const d=document.createElement("div");
    d.className="cmdBtn"+(it.sel?" active":"")+(it.dim?" disabled":"")
      +(it.hot==="A"&&wc3AttackMove?" active":"");
    d.innerHTML=`<span class="ck">${it.hot}</span><span class="ci">${it.icon}</span><span class="cn">${it.name}</span>`
      +(it.price!=null?`<span class="cp">${it.price}</span>`:"");
    d.onmouseenter=()=>{
      const tip=$("wc3tip");if(!tip)return;
      tip.innerHTML=`<div class="t">${it.icon} ${it.name}</div><div>${it.tip}</div><div class="k">快捷键：${it.hot}</div>`;
      tip.style.display="block";
    };
    d.onmouseleave=()=>{const tip=$("wc3tip");if(tip)tip.style.display="none";};
    d.onclick=()=>{
      if(it.dim&&!it.sel){return;}
      if(it.act)it.act();
    };
    wrap.appendChild(d);
  });
}
/* ★ P4-5：B 键建造模式（不暂停，命令卡二态） */
function openWc3Build(){
  wc3BuildMode=true;buildReturnState=state;   /* 兼容旧 tryPlace 状态机：BUILD 态下左键放置 */
  if(state===STATE.PLAYING||state===STATE.PREP)state=STATE.BUILD;
  renderCmdCard();updateGoldUI();
  toast("🏗 建造模式：1-9 选择 · 左键放置 · 右键/B 收起");
}
function closeWc3Build(){
  wc3BuildMode=false;
  selectBuild(null);
  if(state===STATE.BUILD)state=buildReturnState===STATE.PREP?STATE.PREP:STATE.PLAYING;
  renderCmdCard();
}
function openTechMenu(){
  if(state!==STATE.PLAYING&&state!==STATE.PREP&&state!==STATE.BUILD)return;
  techReturnState=state;
  if(state===STATE.BUILD)$("build").classList.add("hidden");
  state=STATE.TECH;
  $("tech").classList.remove("hidden");
  renderTech();updateGoldUI();
}
function closeTechMenu(){
  $("tech").classList.add("hidden");
  lastT=performance.now();
  if(techReturnState===STATE.BUILD){state=STATE.BUILD;$("build").classList.remove("hidden");renderShop();selectBuild(null);updateGoldUI();}
  else state=techReturnState===STATE.PREP?STATE.PREP:STATE.PLAYING;
}
function techCost(branch){
  const t=TECH_TREE[branch],lv=game.tech[branch]||0;
  if(lv>=t.maxLevel)return null;
  return Math.round(t.baseCost*Math.pow(t.growth,lv));
}
function techUnlocked(branch){
  const req=TECH_TREE[branch].requires||{};
  for(const k in req)if((game.tech[k]||0)<req[k])return false;
  return true;
}
function renderTech(){
  const wrap=$("techBranches");if(!wrap)return;
  wrap.innerHTML="";
  Object.values(TECH_TREE).forEach(t=>{
    const lv=game.tech[t.id]||0,maxed=lv>=t.maxLevel,unlocked=techUnlocked(t.id);
    const cost=techCost(t.id),poor=!maxed&&unlocked&&game.gold<cost;
    const card=document.createElement("div");
    card.className="techCard"+(maxed?" maxed":unlocked?"":" locked")+(poor?" poor":"");
    const pips=Array.from({length:t.maxLevel},(_,i)=>`<span class="pip${i<lv?" on":""}"></span>`).join("");
    let reqTxt="";
    if(!unlocked){
      const req=[];for(const k in t.requires)req.push(`${TECH_TREE[k].icon}${TECH_TREE[k].name} Lv.${t.requires[k]}`);
      reqTxt=`<div class="req">🔒 需先解锁：${req.join(" · ")}</div>`;
    }
    card.innerHTML=`<div class="ic">${t.icon}</div>
      <div class="nm">${t.name}</div>
      <div class="ds">${t.desc}</div>
      <div class="pips">${pips}</div>
      <div class="lv">Lv.${lv}/${t.maxLevel}</div>
      ${maxed?`<div class="maxedTag">✅ 已满级</div>`:`<div class="cost">💰 ${cost}</div>`}
      ${reqTxt}`;
    card.onclick=()=>upgradeTech(t.id);
    wrap.appendChild(card);
  });
  updateGoldUI();
}
function upgradeTech(branch){
  const t=TECH_TREE[branch],lv=game.tech[branch]||0;
  if(lv>=t.maxLevel){toast(`${t.icon} ${t.name} 已满级`);return;}
  if(!techUnlocked(branch)){toast("前置科技未解锁，需先强化前置分支");return;}
  const cost=techCost(branch);
  if(game.gold<cost){toast("金币不足，升级失败");return;}
  game.gold-=cost;
  game.tech[branch]=lv+1;
  if(sfx&&sfx.levelup)sfx.levelup();
  toast(`${t.icon} ${t.name} 升至 Lv.${game.tech[branch]}！`);
  /* F：大门血量，立即按新加成重算上限（设计 §2.8） */
  if(branch==="F"){
    const newMax=computeGateMaxHp();
    const ratio=game.gateMaxHp>0?game.gateHp/game.gateMaxHp:1;
    game.gateMaxHp=newMax;
    game.gateHp=Math.round(newMax*ratio);
    updateHpUI();
  }
  renderTech();updateGoldUI();
}

/* ---------------- 生存：大门成长树 + 拆除模式 ---------------- */
let gateReturnState=STATE.PLAYING;
const GATE_UP_COST={hp:120,armor:160,thorns:150,regen:140,dodge:180};
const GATE_UP_FIELD={hp:["gateHpLv","maxHpLv"],armor:["gateArmorLv","maxArmorLv"],
  thorns:["gateThornsLv","maxThornsLv"],regen:["gateRegenLv","maxRegenLv"],dodge:["gateDodgeLv","maxDodgeLv"]};
const GATE_UP_NAME={hp:"大门耐久",armor:"钢铁护甲",thorns:"荆棘反伤",regen:"自动修复",dodge:"闪避机率"};
const GATE_UP_DESC={hp:"提升大门血量上限（跨波次保留）",armor:"降低敌人造成的伤害",thorns:"按比例反弹伤害给攻击者",regen:"每秒恢复大门血量",dodge:"概率闪避一次攻击"};
function gateUpCost(kind){
  const lv=game[GATE_UP_FIELD[kind][0]]||0;
  return Math.round((GATE_UP_COST[kind]||120)*Math.pow(1.45,lv));
}
function openGateUp(){
  if(ACTIVE_MODE.key!=="survival")return;
  if(state!==STATE.PLAYING&&state!==STATE.PREP&&state!==STATE.BUILD&&state!==STATE.GATE)return;
  gateReturnState=state;
  if(state===STATE.BUILD)$("build").classList.add("hidden");
  state=STATE.GATE;
  $("gateUp").classList.remove("hidden");
  renderGateUp();
}
function closeGateUp(){
  $("gateUp").classList.add("hidden");
  lastT=performance.now();
  if(gateReturnState===STATE.BUILD){state=STATE.BUILD;$("build").classList.remove("hidden");renderShop();selectBuild(null);updateGoldUI();}
  else state=gateReturnState===STATE.PREP?STATE.PREP:STATE.PLAYING;
}
function renderGateUp(){
  const wrap=$("gateUpList");if(!wrap)return;
  wrap.innerHTML="";
  const g=ACTIVE_MODE.gate||{};
  Object.keys(GATE_UP_FIELD).forEach(kind=>{
    const lv=game[GATE_UP_FIELD[kind][0]]||0;
    const max=Math.max(lv,g[GATE_UP_FIELD[kind][1]]||5);
    const maxed=lv>=max,cost=gateUpCost(kind),poor=!maxed&&game.gold<cost;
    const row=document.createElement("div");
    row.className="gateUpRow";
    row.innerHTML=`<div class="gname">${GATE_UP_NAME[kind]}</div>
      <div class="gdesc">${GATE_UP_DESC[kind]}</div>
      <div class="glv">Lv.${lv}/${max}</div>
      ${maxed?`<div class="gcost" style="color:#39d98a">✅ 满级</div>`:`<div class="gcost">💰 ${cost}</div>`}
      <button ${maxed?"disabled":""}>${maxed?"已满级":"升级"}</button>`;
    if(!maxed)row.querySelector("button").onclick=()=>upgradeGate(kind);
    wrap.appendChild(row);
  });
  updateGoldUI();
}
function upgradeGate(kind){
  const f=GATE_UP_FIELD[kind];
  const lv=game[f[0]]||0,g=ACTIVE_MODE.gate||{};
  const max=Math.max(lv,g[f[1]]||5);
  if(lv>=max){toast(`${GATE_UP_NAME[kind]} 已满级`);return;}
  const cost=gateUpCost(kind);
  if(game.gold<cost){toast("💰 金币不足");return;}
  game.gold-=cost;
  game[f[0]]=lv+1;
  sfx.levelup();
  /* 耐久升级：立即重算上限并保持当前比例 */
  if(kind==="hp"){
    const newMax=computeGateMaxHp();
    const ratio=game.gateMaxHp>0?game.gateHp/game.gateMaxHp:1;
    game.gateMaxHp=newMax;
    game.gateHp=Math.min(newMax,Math.round(newMax*ratio));
    updateHpUI();
  }
  toast(`${GATE_UP_NAME[kind]} 升至 Lv.${game[f[0]]}`);
  renderGateUp();
}
/* ★ 拆除模式：勾选后点击已建建筑回收 50% 金币并移除 */
let destroyMode=false;
function attemptDestroy(x,z){
  const ci=idx(x,z);
  /* 金矿 / 科技塔 / 住房 */
  const mine=goldMines.find(m=>m.x===x&&m.z===z);
  if(mine){
    const refund=Math.round((goldMineCost(0)*0.5));
    scene.remove(mine.group);goldMines.splice(goldMines.indexOf(mine),1);
    game.gold+=refund;updateGoldUI();
    spawnParticles(mine.group.position.clone().setY(1.6),0xffd75e,8,6,.8);
    toast(`🧹 拆除金矿，回收 ${refund} 金币`);return true;
  }
  const tt=techTowers.find(t=>t.x===x&&t.z===z);
  if(tt){
    const refund=Math.round((priceOf(shopList().find(b=>b.id==="techtower"))||100)*0.5);
    scene.remove(tt.group);techTowers.splice(techTowers.indexOf(tt),1);
    game.gold+=refund;updateGoldUI();
    toast(`🧹 拆除科技塔，回收 ${refund} 金币`);return true;
  }
  const tur=builtTurrets.find(t=>t.cx===x&&t.cz===z);
  if(tur){
    const refund=Math.round((priceOf(shopList().find(b=>b.kind==="turret"&&b.turret===tur.turretKey))||60)*0.5);
    const popBack=tur.popUsed||0;
    scene.remove(tur.group);builtTurrets.splice(builtTurrets.indexOf(tur),1);
    game.gold+=refund;game.popUsed=Math.max(0,game.popUsed-popBack);
    updateGoldUI();updateResUI();
    spawnParticles(tur.group.position.clone().setY(1.6),0xffd75e,8,6,.8);
    toast(`🧹 拆除炮塔，回收 ${refund} 金币`);return true;
  }
  /* 住房：人口上限回收（-6），不退款（金币已转化为人口） */
  const house=builtHouses.find(h=>h.x===x&&h.z===z);
  if(house){
    const popBack=(ACTIVE_MODE.economy&&ACTIVE_MODE.economy.housePop)||6;
    scene.remove(house.group);builtHouses.splice(builtHouses.indexOf(house),1);
    game.popMax=Math.max(0,game.popMax-popBack);game.popUsed=Math.min(game.popUsed,game.popMax);
    structCells.delete(idx(x,z));
    updateResUI();
    spawnParticles(house.group.position.clone().setY(2),0xffd75e,10,7,.9);
    toast(`🧹 拆除住房，人口上限 -${popBack}`);return true;
  }
  /* 墙体：T_STEEL + steelHP */
  if(grid[z][x]===T_STEEL&&steelHP.get(ci)>0){
    const lv=wallLvAt(x,z)||1;
    /* 拆除 refund = 累计建造/升级成本 × 0.5（与设计稿一致：鼓励谨慎升级） */
    const cumCost=WALL_LEVELS.slice(0,lv).reduce((s,w)=>s+(w.price||0),0);
    const refund=Math.round(cumCost*0.5);
    const m=tileMeshes[ci];
    if(m){mapGroup.remove(m);tileMeshes[ci]=null;}
    /* ★ P4-2：坡道格墙拆除 → 恢复 T_RAMP + 重铺坡道板 */
    if(wallMeta.get(ci)&&wallMeta.get(ci).wasRamp){
      grid[z][x]=T_RAMP;
      wallMeta.delete(ci);
      buildRampTile(mapGroup,x,z);
    }else{
      grid[z][x]=T_EMPTY;
      wallMeta.delete(ci);
    }
    steelHP.set(ci,0);
    game.gold+=refund;updateGoldUI();
    structCells.delete(ci);
    computeFlowField();
    spawnParticles(new THREE.Vector3(cellCenter(x,z).x,heightAt(x,z)+1,cellCenter(x,z).z),0xffd75e,8,6,.8);
    toast(`🧹 拆除 Lv${lv} 墙，回收 ${refund} 金币`);return true;
  }
  return false;
}
/* ★ 生存模式：首波来临前的 30 秒发育期（B 键可随时开商店，倒计时归零自动开波） */
function startPrep(){
  state=STATE.PREP;
  game.endless=false;
  game.prepTime=ACTIVE_MODE.prepTime||30;
  announce(`⚙ 准备阶段 ${game.prepTime} 秒 · 按 B 键展开商店`);
  const el=$("prepBar");
  if(el){el.style.display="block";el.textContent=`⏱ 准备阶段 ${game.prepTime}s · B 键打开商店`;}
  /* ★ 启动三步新手指引（仅生存模式） */
  questActive=true;questIdx=0;questShow();
}
/* ★ 第 15 波肃清后：弹出【胜利结算 / 无尽模式】选择 */
function showSettle(){
  state=STATE.SETTLE;
  $("settle").classList.remove("hidden");
}
function endGame(win=false,baseDown=false){
  state=STATE.OVER;
  const title=$("gameover").querySelector("h1");
  if(title)title.textContent=win?"🏆 胜 利":"GAME OVER";
  $("finalStats").innerHTML=
    `${baseDown?(win?"":"基地鹰旗陷落……"):""}${win?"🎉 你守住了核心，第 "+game.wave+" 波荣耀肃清！":""}<br>最终得分 <b>${game.score}</b><br>${win?"战绩":"坚持"}到第 <b>${game.wave}</b> 波`;
  $("gameover").classList.remove("hidden");
}
function setPause(p){
  if(p){state=STATE.PAUSED;$("pause").classList.remove("hidden");}
  else{state=STATE.PLAYING;$("pause").classList.add("hidden");lastT=performance.now();}
}

/* ---------------- 更新逻辑 ---------------- */
function shortAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}

function updatePlayer(dt){
  const now=performance.now();
  if(!player.alive){
    if(game.respawnTimer>0){
      game.respawnTimer-=dt;
      if(game.respawnTimer<=0)spawnPlayer();
    }
    return;
  }
  let mx=0,mz=0;
  /* ★ P3-9 WC3 指令层（仅生存）：右键移动/攻击、A 攻击移动、S 停止。
     生存模式下 WASD 已被镜头占用（RTS 惯例），玩家移动完全由指令驱动；
     经典/塔防保留 WASD 直接操控。 */
  const wc3=ACTIVE_MODE.key==="survival";
  let wc3Moving=false;
  if(wc3&&player.moveTarget){
    const dx=player.moveTarget.x-g.position.x,dz=player.moveTarget.z-g.position.z;
    const d=Math.hypot(dx,dz);
    if(d<.8){player.moveTarget=null;}
    else{mx=dx/d;mz=dz/d;wc3Moving=true;}
  }
  if(wc3&&player.attackTarget){
    if(!player.attackTarget.alive){player.attackTarget=null;}
    else{
      /* 追击目标，进入射程(14)停下自动开火（炮塔自动索敌） */
      const dx=player.attackTarget.group.position.x-g.position.x,
            dz=player.attackTarget.group.position.z-g.position.z;
      const d=Math.hypot(dx,dz);
      if(d>13){mx=dx/d;mz=dz/d;wc3Moving=true;}
      else{player.moveTarget=null;}
    }
  }
  if(!wc3){
    if(keys.KeyW||keys.ArrowUp)mz-=1;
    if(keys.KeyS||keys.ArrowDown)mz+=1;
    if(keys.KeyA||keys.ArrowLeft)mx-=1;
    if(keys.KeyD||keys.ArrowRight)mx+=1;
  }
  const g=player.group;
  const curH=heightAt(g.position.x,g.position.z);
  if(mx||mz){
    const len=Math.hypot(mx,mz);mx/=len;mz/=len;
    /* ★ 猎杀冲锋：击杀后短时移速加成 */
    const sprintMult=(performance.now()<game.sprintUntil)?1+.35*game.stats.sprintLv:1;
    const spd=player.speed*game.stats.moveSpeed*sprintMult*dt;
    const nx=g.position.x+mx*spd,nz=g.position.z+mz*spd;
    if(!blockedForTank(nx,g.position.z,player.radius,curH,false,true))g.position.x=nx;
    if(!blockedForTank(g.position.x,nz,player.radius,curH,false,true))g.position.z=nz;
    player.heading=Math.atan2(mx,mz)+Math.PI;
    g.rotation.y+=shortAngle(player.heading-g.rotation.y)*Math.min(1,dt*12);
  }
  // 贴合地形高度
  g.position.y+=(heightAt(g.position.x,g.position.z)-g.position.y)*Math.min(1,dt*10);

  // 鼠标瞄准
  raycaster.setFromCamera({x:(mouse.x/innerWidth)*2-1,y:-(mouse.y/innerHeight)*2+1},camera);
  const hitPt=new THREE.Vector3();
  if(raycaster.ray.intersectPlane(groundPlane,hitPt)){
    const dx=hitPt.x-g.position.x,dz=hitPt.z-g.position.z;
    player.aim=Math.atan2(dx,dz)+Math.PI;
  }
  /* ★ 修复：炮塔角度是相对车体的，必须减去车体朝向 */
  const tur=g.userData.turret;
  tur.rotation.y+=shortAngle(player.aim-g.rotation.y-tur.rotation.y)*Math.min(1,dt*18);

  player.cd-=dt;
  const rapid=now<game.buffs.rapidUntil;
  const interval=.42/(game.stats.fireRate*(rapid?2:1));
  /* ★ P3-9：生存=RTS，自动开火（炮塔自索敌+攻击目标追击自动交战）；
     经典/塔防保留左键/空格手动开火 */
  const autoFire=wc3;
  const wantFire=autoFire
    ?(player.attackTarget&&player.attackTarget.alive)
    :(mouse.down||keys.Space);
  if(wantFire&&player.cd<=0){
    player.cd=interval;
    if(autoFire&&player.attackTarget&&player.attackTarget.alive){
      const t2=player.attackTarget.group.position;
      player.aim=Math.atan2(t2.x-g.position.x,t2.z-g.position.z)+Math.PI;
    }
    shoot("player",new THREE.Vector3(Math.sin(player.aim+Math.PI),0,Math.cos(player.aim+Math.PI)));
  }
  g.visible=now<player.invulnUntil?(Math.sin(now*.02)>-.3):true;
}

let _turAim=0;
function updateAutoTurret(dt){
  if(!baseAlive||!baseGroup||game.stats.autoTurretLv<=0||!autoTurretObj)return;
  const bp=baseGroup.position;
  const olv=game.stats.overloadLv||0;   // ★ 超载协议
  // 找最近敌人（超载后射程 +40%/级）
  let best=null,bd=36*(1+.4*olv);
  enemies.forEach(e=>{
    if(!e.alive||performance.now()<e.spawnFlash)return;
    const d=e.group.position.distanceTo(bp);
    if(d<bd){bd=d;best=e;}
  });
  if(best){
    const dx=best.group.position.x-bp.x,dz=best.group.position.z-bp.z;
    const want=Math.atan2(dx,dz)+Math.PI;
    _turAim+=shortAngle(want-_turAim)*Math.min(1,dt*6);
    autoTurretObj.rotation.y=_turAim;
    autoTurretObj.userData.cd=(autoTurretObj.userData.cd||0)-dt;
    if(autoTurretObj.userData.cd<=0){
      autoTurretObj.userData.cd=Math.max(.28,(1.3-game.stats.autoTurretLv*.22)*(olv>0?.6:1));
      const dir=new THREE.Vector3(Math.sin(_turAim+Math.PI),0,Math.cos(_turAim+Math.PI));
      shoot({group:baseGroup,dmg:1+game.stats.autoTurretLv*.5+olv},dir);
    }
  }
}

/* ★ 基地装置：EMP 脉冲塔 + 迫击炮阵地 */
function updateBaseGadgets(dt){
  if(!baseGroup||!baseAlive)return;
  const now=performance.now();
  /* EMP 脉冲：周期性眩晕并伤害基地周围敌人 */
  if(game.stats.empLv>0){
    game._empTimer-=dt;
    if(game._empTimer<=0){
      game._empTimer=9;
      const bp=baseGroup.position,R=14+3*game.stats.empLv;
      let hitAny=false;
      enemies.forEach(e=>{
        if(!e.alive||performance.now()<e.spawnFlash)return;
        const dx=e.group.position.x-bp.x,dz=e.group.position.z-bp.z;
        if(dx*dx+dz*dz<R*R){
          e.stunUntil=now+1500;e.hp-=1;hitAny=true;
          if(e.hp<=0)killEnemy(e);
        }
      });
      if(hitAny){
        spawnParticles(bp.clone().setY(2.5),0x7ec8ff,22,13,1.2);
        sfx.levelup();camShake=Math.max(camShake,.3);
        toast("📡 EMP 脉冲释放");
      }
    }
  }
  /* 迫击炮阵地：定期炮击随机敌群（范围伤害） */
  if(game.stats.mortarLv>0){
    game._mortarTimer-=dt;
    if(game._mortarTimer<=0){
      game._mortarTimer=Math.max(5,9-game.stats.mortarLv*2);
      const alive=enemies.filter(e=>e.alive&&performance.now()>=e.spawnFlash);
      if(alive.length){
        const tgt=alive[Math.floor(Math.random()*alive.length)];
        const tp=tgt.group.position.clone();
        explode(tp.setY(1.4),false);
        const R=4.5+game.stats.mortarLv*1.2,dmg=2+game.stats.mortarLv;
        alive.forEach(e=>{
          const dx=e.group.position.x-tp.x,dz=e.group.position.z-tp.z;
          if(dx*dx+dz*dz<R*R){e.hp-=dmg;if(e.hp<=0)killEnemy(e);}
        });
        destroyBricksAround(tp.x,tp.z,1.8);
      }
    }
  }
}

function updateEnemies(dt){
  const now=performance.now();
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    /* ★ dying 状态：保留在数组里播完死亡动画，到达时长后真正清理 */
    if(e.dying){
      e.dyingT+=dt;
      if(e.dyingT>=1.05){
        if(e.mixer){try{e.mixer.stop();}catch(_){}}
        scene.remove(e.group);
        if(e.beam)scene.remove(e.beam);
        enemies.splice(i,1);
      }
      continue;
    }
    if(!e.alive){enemies.splice(i,1);continue;}
    /* ★ AnimationMixer tick（仅 character 模型的 enemy 有 mixer） */
    if(e.mixer){e.mixer.update(dt);}
    /* ★ 冰冻减速失效恢复 */
    if(e.slowUntil&&now>e.slowUntil){e.slowMult=1;e.slowUntil=0;}
    if(e.beam){
      e.beam.material.opacity-=dt*.6;
      if(now>e.spawnFlash||e.beam.material.opacity<=0){scene.remove(e.beam);e.beam=null;}
      continue;
    }
    /* ★ EMP 眩晕：被脉冲命中的敌人短时瘫痪 */
    if(e.stunUntil&&now<e.stunUntil){
      if(Math.random()<dt*8)spawnParticles(e.group.position.clone().setY(2.2),0x7ec8ff,1,3,.5);
      e.cd=Math.max(e.cd,.5);
      continue;
    }
    e.thinkTimer-=dt;
    /* ★ P0-3：转向改为「按格边界重算」为主 + 短 thinkTimer 保底
       原缺陷：thinkTimer 1~2.6s 才重算一次方向，而敌人约 1 秒穿 1 格（速度 ~4 / TILE 4），
       必然冲过转角 → 到对面格又收到反向指令 → 在坡口前反复来回（实测 d=15 处 x=17~20 震荡）。 */
    const curCell=cellOf(e.group.position.x,e.group.position.z);
    const cellChanged=!e._cell||e._cell.x!==curCell.x||e._cell.z!==curCell.z;
    if(ACTIVE_MODE.key==="survival"&&(cellChanged||e.thinkTimer<=0)){
      if(cellChanged)e._cell=curCell;
      e.thinkTimer=.25+Math.random()*.15;          // 同格内保底刷新，避免长时间不更新
      /* ★ 流场寻路：朝大门梯度移动（自动绕开不可破围墙） */
      const f=flowDirFor(e);
      e.flowHere=f.hereD;
      e.atGate=!!f.atGate;
      if(f.best)e.dir.set(f.best[0],0,f.best[1]);
      else if(f.atGate)e.dir.set(0,0,0);           // 已抵达：停下，交给下面的啃门分支
      else if(baseGroup)e.dir.set(baseGroup.position.x-e.group.position.x,0,
        baseGroup.position.z-e.group.position.z).normalize();   // 流场缺失:直奔大门
      else e.dir.set(0,0,0);   // 卡住兜底
    }else if(e.thinkTimer<=0){
      /* 非生存模式：沿用原随机游走（保持原有节奏） */
      e.thinkTimer=1+Math.random()*1.6;
      const targets=[];
      if(player&&player.alive)targets.push(player.group.position);
      if(baseAlive&&baseGroup)targets.push(baseGroup.position);
      const tgt=(targets.length&&Math.random()<.7)
        ?targets[Math.floor(Math.random()*targets.length)]:null;
      if(tgt){
        const dx=tgt.x-e.group.position.x,dz=tgt.z-e.group.position.z;
        if(Math.abs(dx)>Math.abs(dz))e.dir.set(Math.sign(dx),0,0);
        else e.dir.set(0,0,Math.sign(dz));
        if(Math.random()<.3)e.dir.set(Math.sign(dx),0,Math.sign(dz)).normalize();
      }else{
        const dirs=[[1,0],[-1,0],[0,1],[0,-1]][Math.floor(Math.random()*4)];
        e.dir.set(dirs[0],0,dirs[1]);
      }
    }
    let moved=false;
    /* ★ P0-2：已抵达大门 → 停下正对门槛啃门
       原缺陷：啃门依赖「被挡住才啃」的碰撞判定（要求 !moved），但敌人在流场最小值 d=1 处
       会被梯度推离大门、一直 moved=true，于是啃门分支永不触发 —— 实测大门 600 血 150 秒零掉血，
       游戏不存在失败条件。现在改为显式攻击：抵达即啃，不再依赖是否被挡住。
       ★ trace7/gate1 实测修复：atGate 分支与 !moved 撞墙分支会双重递减 wallCd（每帧 -2dt）
       且空啃分支把 wallCd 重置为 0.35 → 实际啃门频率约为设计值的 2 倍。
       改为 else-if 互斥：atGate 已判定时跳过撞墙分支，wallCd 只递减一次，节奏回到设计值。 */
    if(ACTIVE_MODE.key==="survival"&&e.atGate&&baseAlive&&baseGroup){
      e.dir.set(0,0,0);
      const bp=baseGroup.position;
      const want=Math.atan2(bp.x-e.group.position.x,bp.z-e.group.position.z)+Math.PI;
      e.heading=want;
      e.group.rotation.y+=shortAngle(want-e.group.rotation.y)*Math.min(1,dt*6);
      e.wallCd=(e.wallCd||0)-dt;
      if(e.wallCd<=0){
        damageGate(e.boss?3:(e.type==="heavy"?2:1),e.group.position);
        e.wallCd=e.boss?.55:.9;
        e._attackedNow=true;   /* ★ P4-1：驱动 attack-melee 动画 */
        _wdProgress();      /* ★ P1-1：啃门=波次在推进 */
        spawnParticles(new THREE.Vector3(e.group.position.x,1.4,e.group.position.z),0xff8080,5,5,.6);
      }
    }
    else{
      const spd=e.speed*(e.slowMult||1)*dt;
      const curH=heightAt(e.group.position.x,e.group.position.z);
      const nx=e.group.position.x+e.dir.x*spd,nz=e.group.position.z+e.dir.z*spd;
      if(e.dir.x&&!blockedForTank(nx,e.group.position.z,e.radius,curH)){e.group.position.x=nx;moved=true;}
      if(e.dir.z&&!blockedForTank(e.group.position.x,nz,e.radius,curH)){e.group.position.z=nz;moved=true;}
      /* ★ P0-3 终修（trace7 实测）：单轴推进被挡时沿垂直轴「向本格格心」滑移脱困（仅生存）。
         楔死场景：敌人贴坡道走廊 row34 行缘（pz=42.0 恰为行边界），南向角点采样落进 (·,33) 平地
         h=0，高差 -1.38 曾超 STEP_DOWN(1.3) → x 轴移动被判挡；且流场方向 [-1,0] 无 z 分量，
         敌人永远滑不回行中心 → 永久冻结。进 col16 时还可能擦到 (16,33) 钢墙实体格，同理被挡。
         滑移目标取「朝本格格心」：走廊内即自动回到走廊中线，不引入离路漂移；
         正前方是可啃墙（砖/钢/大门）时不滑移，完整保留撞墙啃咬拆墙行为。 */
      if(ACTIVE_MODE.key==="survival"&&!moved&&((e.dir.x&&!e.dir.z)||(e.dir.z&&!e.dir.x))){
        const wx=e.group.position.x+e.dir.x*(e.radius+.8),wz=e.group.position.z+e.dir.z*(e.radius+.8);
        const wc=cellOf(wx,wz);
        const frontChew=inMap(wc.x,wc.z)&&(grid[wc.z][wc.x]===T_BRICK||grid[wc.z][wc.x]===T_STEEL||grid[wc.z][wc.x]===T_BASE);
        if(!frontChew){
          const cc=cellCenter(cellOf(e.group.position.x,e.group.position.z).x,cellOf(e.group.position.x,e.group.position.z).z);
          const sx=e.dir.x?0:(cc.x>e.group.position.x?1:-1);
          const sz=e.dir.z?0:(cc.z>e.group.position.z?1:-1);
          if(sz!==0&&!blockedForTank(e.group.position.x,e.group.position.z+sz*spd,e.radius,curH)){e.group.position.z+=sz*spd;moved=true;}
          else if(sx!==0&&!blockedForTank(e.group.position.x+sx*spd,e.group.position.z,e.radius,curH)){e.group.position.x+=sx*spd;moved=true;}
        }
      }
      /* ★ 撞墙啃咬：被墙挡住时原地持续攻击直至破开（BOSS/重装拆得更快） */
      let attacked=false;
      if(!moved){
        e.wallCd=(e.wallCd||0)-dt;
        if(e.wallCd<=0){
          const fx=e.group.position.x+e.dir.x*(e.radius+.8),fz=e.group.position.z+e.dir.z*(e.radius+.8);
          const c=cellOf(fx,fz);
          /* ★ 生存模式：正前方是大门 → 啃咬大门（唯一入口） */
          if(ACTIVE_MODE.key==="survival"&&inMap(c.x,c.z)&&grid[c.z][c.x]===T_BASE){
            damageGate(e.boss?3:(e.type==="heavy"?2:1),e.group.position);
            attacked=true;e.wallCd=e.boss?.55:.9;
            e._attackedNow=true;   /* ★ P4-1：驱动 attack-melee 动画 */
            _wdProgress();   /* ★ P1-1：啃门=波次在推进 */
            spawnParticles(new THREE.Vector3(fx,1.4,fz),0xff8080,5,5,.6);
          }else if(inMap(c.x,c.z)&&(grid[c.z][c.x]===T_BRICK||grid[c.z][c.x]===T_STEEL)
            &&damageWallCell(c.x,c.z,e.boss?3:(e.type==="heavy"?2:1))){
            attacked=true;e.wallCd=e.boss?.55:.9;
            e._attackedNow=true;   /* ★ P4-1：驱动 attack-melee 动画 */
            _wdProgress();   /* ★ P1-1：拆墙=波次在推进 */
            spawnParticles(new THREE.Vector3(fx,1.4,fz),0xffcf7a,4,4,.5);
          }else e.wallCd=.35;
        }
      }
      if(!moved&&!attacked)e.thinkTimer=0;
    }
    e.group.position.y+=(heightAt(e.group.position.x,e.group.position.z)-e.group.position.y)*Math.min(1,dt*10);
    if(e.dir.x||e.dir.z){
      const want=Math.atan2(e.dir.x,e.dir.z)+Math.PI;
      e.heading=want;
      e.group.rotation.y+=shortAngle(want-e.group.rotation.y)*Math.min(1,dt*8);
    }
    /* ★ 角色动画（P4-1）：移动→Walk / 攻击→attack-melee / 待机→Idle
       Kenney GLB 动画名按「含关键字」模糊匹配（attack-melee-up/down/stab 等变体）。 */
    {
      const atk=(e.atGate||(!moved&&e._attackedNow));
      const wantAnim=atk?"@attack":(moved?_ANIM_WALK:_ANIM_IDLE);
      if(e.currentAnim!==wantAnim){
        let a=null;
        if(atk){
          for(const k in e.actions){if(k.indexOf("attack")>=0&&e.actions[k]){a=e.actions[k];break;}}
        }else a=e.actions[wantAnim];
        if(a){
          a.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(.12).play();
          if(e.currentAnim){
            const prev=e.currentAnim==="@attack"
              ?(function(){for(const k in e.actions){if(k.indexOf("attack")>=0&&e.actions[k])return e.actions[k];}})()
              :e.actions[e.currentAnim];
            if(prev)prev.fadeOut(.12);
          }
          e.currentAnim=wantAnim;
        }
      }
      e._attackedNow=false;
    }
    /* ★ 炮塔瞄准（P4-1 删）：敌人不再瞄玩家/炮台，目标只有墙与大门 */

    e.cd-=dt;
    /* ★ P4-1：敌人目标=墙+大门。近战咬门逻辑已并入上方 atGate/撞墙啃咬分支，
       原 meleeTargets（turret/player/gate 择近）整体删除 —— 敌人不追玩家、不打塔。 */
  }
  if(state===STATE.PLAYING&&game.enemiesToSpawn>0){
    game.spawnTimer-=dt;
    const cap=(ACTIVE_MODE.spawnCap||(w=>Math.min(4+Math.floor(w/2),8)))(game.wave);
    if(game.spawnTimer<=0&&enemies.filter(e=>e.alive).length<cap){
      game.spawnTimer=(ACTIVE_MODE.spawnInterval||(w=>Math.max(1.2,3.2-w*.12)))(game.wave);
      const bossWave=isBossWave(game.wave);
      if(bossWave&&!enemies.some(e=>e.boss)&&!game._bossDone){
        game._bossDone=true;spawnEnemy(null,true);
      }else{
        if(!bossWave)game._bossDone=false;
        spawnEnemy(pickEnemyType());
      }
      game.enemiesToSpawn--;updateEnemyLeftUI();
    }
  }
  if(state===STATE.PLAYING&&game.enemiesToSpawn<=0&&enemies.length===0&&game.wave>0){
    game._bossDone=false;waveCleared();
  }
}
/* ★ P1-1 波次看门狗（无进展语义）：单波 N 秒内无任何「推进事实」→ 强制收割残敌（仅生存模式）。
   推进事实 = 任一敌人死亡 / 大门掉血 / 墙被拆 —— 只有这些才真正让波次向前走。
   场景：敌人被物理几何卡进不可达死角、或寻路目标永久不可达时，
   波次条件 `enemiesToSpawn<=0 && enemies.length===0` 永不成立，整局停滞。
   注意不能用「敌人位移」当进度信号：被围死的敌人在包围圈内仍会抖动滑动。
   超时后每 0.8s 收割一只（逐个消散，避免同帧齐爆）。
   变量声明在 _waveClearing 附近（resetGame 首次调用之前），避免 TDZ。 */
function _wdProgress(){
  _wdStallT=0;
}
function updateWatchdog(dt){
  if(ACTIVE_MODE.key!=="survival"||state!==STATE.PLAYING||game.enemiesToSpawn>0||game.wave<=0)return;
  _wdStallT+=dt;
  const LIMIT=isBossWave(game.wave)?130:90;
  if(_wdStallT>=LIMIT){
    _wdKillTimer-=dt;
    if(_wdKillTimer<=0){
      const v=enemies.find(e=>e.alive);
      if(v){killEnemy(v,true);_wdKillTimer=.8;_wdProgress();}
      if(!enemies.some(e=>e.alive))
        announce(`⏱ 第 ${game.wave} 波超时，残敌已被战场收割`);
    }
  }
}

/* 单颗子弹在某位置的碰撞判定：返回 true 表示子弹被消耗 */
function bulletCollide(b,p){
  // 墙体（★ P4-3：塔弹 thruWall → 穿透玩家墙/原生钢墙/建筑，不被悬崖和自家构筑挡炮）
  const c=cellOf(p.x,p.z);
  if(inMap(c.x,c.z)){
    const t=grid[c.z][c.x];
    if(b.thruWall&&(t===T_BRICK||t===T_STEEL||t===T_BUILDING)){/* 穿墙：跳过 */}
    else if(t===T_BRICK){destroyBricksAround(p.x,p.z,.5);return true;}
    else if(t===T_STEEL||t===T_BUILDING){
      /* ★ 弹射装甲弹：玩家炮弹碰钢墙/楼房反弹 */
      if(b.owner==="player"&&b.bounce>0){
        b.bounce--;
        const prev=p.clone().addScaledVector(b.vel,-1);
        const pc=cellOf(prev.x,prev.z);
        if(pc.x!==c.x)b.vel.x*=-1;else b.vel.z*=-1;
        p.addScaledVector(b.vel,1.4);
        b.hitSet.clear();
        spawnParticles(p.clone(),0xbfe8ff,6,6,.7);sfx.hit();
        return false;
      }
      spawnParticles(p.clone(),0xcfd8e6,5,5,.7);sfx.hit();return true;
    }
  }
  // 基地（仅敌方）
  if(b.owner==="enemy"&&baseAlive&&baseGroup){
    const bp=baseGroup.position;
    if(Math.hypot(p.x-bp.x,p.z-bp.z)<2.2){
      if(game.baseShieldHP>0){
        game.baseShieldHP-=1;sfx.hit();
        spawnParticles(p.clone(),0x4da3ff,8,6,.8);
        updateHpUI();
        if(game.baseShieldHP<=0)toast("⚠ 基地护盾耗尽！");
      }else if(ACTIVE_MODE.key==="survival"&&game.gateHp>0){
        /* ★ 生存模式：子弹命中大门 → 统一走 damageGate（含闪避/护甲/反伤） */
        damageGate(Math.max(1,Math.round(b.dmg)),new THREE.Vector3(p.x,0,p.z));
        if(game.gateHp>0)toast(`💎 大门受创 ${Math.max(0,Math.ceil(game.gateHp))}/${game.gateMaxHp}`);
        return true;
      }else baseDestroyed();
      return true;
    }
  }
  const hitR2=(pos,r)=>{const dx=p.x-pos.x,dz=p.z-pos.z;return dx*dx+dz*dz<r*r;};
  if(b.owner==="player"){
    for(const e of enemies){
      if(!e.alive||performance.now()<e.spawnFlash||b.hitSet.has(e))continue;
      if(hitR2(e.group.position,e.radius+.6)){
        b.hitSet.add(e);
        /* ★ 弱点分析：暴击双倍伤害 */
        let dmg=b.dmg;
        if(Math.random()<game.stats.critChance){
          dmg*=2;spawnParticles(p.clone(),0xffd75e,9,7,.9);sfx.levelup();
        }
        e.hp-=dmg;
        spawnParticles(p.clone(),0xfff2b0,5,5,.7);
        sfx.hit();
        if(e.hp<=0)killEnemy(e);
        if(b.pierceLeft>0){b.pierceLeft--;return false;}
        return true;
      }
    }
  }else if(player&&player.alive&&hitR2(player.group.position,player.radius+.6)){
    damagePlayer(b.dmg);return true;
  }
  return false;
}

function updateBullets(dt){
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    b.life-=dt;
    /* ★ 子步进移动：每步 ≤1.2 单位，杜绝高速穿墙/穿人 */
    const dist=b.vel.length()*dt;
    const steps=Math.max(1,Math.ceil(dist/1.2));
    const inc=b.vel.clone().multiplyScalar(dt/steps);
    let dead=b.life<=0;
    for(let s=0;s<steps&&!dead;s++){
      b.mesh.position.add(inc);
      const p=b.mesh.position;
      if(Math.abs(p.x)>HALF||Math.abs(p.z)>HALF){dead=true;break;}
      if(bulletCollide(b,p))dead=true;
    }
    // 子弹贴合地形飞行（视觉）
    const p=b.mesh.position;
    const gy=heightAt(p.x,p.z)+1.55;
    p.y+=(gy-p.y)*Math.min(1,dt*8);
    if(dead){
      if(b.blast>0){
        spawnParticles(p.clone(),0xffa02e,14,10,1.1);
        const R=b.blast;
        enemies.forEach(e=>{
          if(!e.alive)return;
          const dx=e.group.position.x-p.x,dz=e.group.position.z-p.z;
          if(dx*dx+dz*dz<(R+e.radius)*(R+e.radius)){
            e.hp-=b.dmg*.6;if(e.hp<=0)killEnemy(e);
          }
        });
        destroyBricksAround(p.x,p.z,R*.7);
        sfx.boom();camShake=Math.max(camShake,.35);
      }
      scene.remove(b.mesh);bullets.splice(i,1);
    }
  }
}

function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const pt=particles[i];
    pt.life-=dt;pt.vel.y-=25*dt;
    pt.mesh.position.addScaledVector(pt.vel,dt);
    pt.mesh.material.opacity=Math.max(0,pt.life*2);
    pt.mesh.rotation.x+=dt*6;pt.mesh.rotation.y+=dt*4;
    if(pt.life<=0){scene.remove(pt.mesh);pt.mesh.material.dispose();particles.splice(i,1);}
  }
  /* ★ 电磁连锁闪电视觉衰减 */
  for(let i=lightningBeams.length-1;i>=0;i--){
    const lb=lightningBeams[i];
    lb.life-=dt;
    lb.line.material.opacity=Math.max(0,lb.life/.18);
    if(lb.life<=0){scene.remove(lb.line);lb.line.geometry.dispose();lb.line.material.dispose();lightningBeams.splice(i,1);}
  }
}

function updatePowerups(dt){
  const now=performance.now();
  for(let i=powerups.length-1;i>=0;i--){
    const pu=powerups[i];
    pu.life-=dt;pu.spin+=dt*2.4;
    pu.group.rotation.y=pu.spin;
    pu.group.children[1].rotation.z=pu.spin*1.5;
    pu.group.position.y=pu.baseY+Math.sin(pu.spin*2)*.25;
    pu.group.visible=pu.life<4?(Math.sin(now*.015)>0):true;
    if(player&&player.alive){
      const d=pu.group.position.distanceTo(player.group.position);
      if(game.stats.magnet&&d<9){
        const dir=player.group.position.clone().sub(pu.group.position).normalize();
        pu.group.position.addScaledVector(dir,dt*14);
      }
      if(d<2.2){
        applyPowerup(pu.key);
        scene.remove(pu.group);powerups.splice(i,1);continue;
      }
    }
    if(pu.life<=0){scene.remove(pu.group);powerups.splice(i,1);}
  }
}

const camView=new URLSearchParams(location.search).get("view");
function updateCamera(dt){
  const f=(player&&player.alive)?player.group.position:
    (baseGroup?baseGroup.position:new THREE.Vector3());
  if(camView==="low"){
    // 调试：贴地近景，检查楼体/贴地是否下陷
    const a=performance.now()*.0004;
    camera.position.set(f.x+Math.cos(a)*14,2.2,f.z+Math.sin(a)*14);
    camera.lookAt(new THREE.Vector3(f.x,1.2,f.z));
    return;
  }
  const rts=ACTIVE_MODE.key==="survival";
  let tx,tz,cy,cz;
  if(rts){
    /* ★ P4-4 标准 RTS 镜头：固定俯仰角（60°），位置 = 焦点 + 方向 * dist，直接赋值无 lerp。
       WASD/边缘滚动平移 camFocus（沿镜头朝向，上=北）；
       滚轮只改 dist（镜头与地面焦点距离），不再同时拉高+后撤产生"扭动感"。 */
    const PITCH=60*Math.PI/180;                 // 固定俯仰
    const DIST=Math.max(24,Math.min(120,camHeight));   // camHeight 复用为距离
    const sp=42*dt;
    let dx=0,dz=0;
    if(keys.KeyW||keys.ArrowUp)dz-=1;
    if(keys.KeyS||keys.ArrowDown)dz+=1;
    if(keys.KeyA||keys.ArrowLeft)dx-=1;
    if(keys.KeyD||keys.ArrowRight)dx+=1;
    if(state!==STATE.BUILD&&document.hasFocus()){
      const EDGE=24;
      let ex=0,ez=0;
      if(mouse.x<EDGE)ex-=1; else if(mouse.x>innerWidth-EDGE)ex+=1;
      if(mouse.y<EDGE)ez-=1; else if(mouse.y>innerHeight-EDGE)ez+=1;
      if(ex||ez){
        camFocus.x+=ex*60*dt;camFocus.z+=ez*60*dt;
      }
    }
    if(dx||dz){
      const L=Math.hypot(dx,dz)||1;
      camFocus.x+=dx/L*sp;camFocus.z+=dz/L*sp;
      const lim=HALF-4;
      camFocus.x=Math.max(-lim,Math.min(lim,camFocus.x));
      camFocus.z=Math.max(-lim,Math.min(lim,camFocus.z));
    }
    tx=camFocus.x;tz=camFocus.z;
    cy=DIST*Math.sin(PITCH);
    cz=DIST*Math.cos(PITCH);
    camera.position.set(tx,cy,tz+cz);
    camera.lookAt(new THREE.Vector3(tx,0,tz));
    if(camShake>0){
      camShake*=Math.pow(.001,dt);
      if(camShake<.01)camShake=0;
      camera.position.x+=(Math.random()-.5)*camShake;
      camera.position.z+=(Math.random()-.5)*camShake;
    }
    return;
  }
  tx=f.x*.55;tz=f.z*.55;
  cy=ACTIVE_MODE.cameraY||60;cz=ACTIVE_MODE.cameraZ||46;
  camera.position.lerp(new THREE.Vector3(tx,cy,tz+cz),Math.min(1,dt*4));
  camera.lookAt(new THREE.Vector3(tx,0,tz));
  if(camShake>0){
    camShake*=Math.pow(.001,dt);
    if(camShake<.01)camShake=0;
    camera.position.x+=(Math.random()-.5)*camShake;
    camera.position.z+=(Math.random()-.5)*camShake;
  }
}

/* ---------------- 主循环 ---------------- */
let lastT=performance.now(),_buffT=0,_goldT=0;
const FF=Math.min(10,parseFloat(new URLSearchParams(location.search).get("ff"))||1); // 调试用时间倍速
function loop(){
  requestAnimationFrame(loop);
  const now=performance.now();
  let dt=(now-lastT)/1000;lastT=now;
  dt=Math.min(dt,.05)*FF;
  if(state===STATE.PLAYING||state===STATE.UPGRADE||state===STATE.BUILD||state===STATE.PREP){
    /* ★ P4-5：survival 建造模式（B 键命令卡）不暂停战场 —— WC3 惯例 */
    if(state===STATE.PLAYING||state===STATE.PREP
      ||(ACTIVE_MODE.key==="survival"&&state===STATE.BUILD&&wc3BuildMode)){
      if(player)updatePlayer(dt);
      updateEnemies(dt);
      updateWatchdog(dt);   /* ★ P1-1：波次看门狗（无进展超时收割） */
      updateAutoTurret(dt);
      updateBaseGadgets(dt);
      updateBuiltTurrets(dt);
      updateBullets(dt);
      updatePowerups(dt);
      questTick();   /* ★ 三步引导进度推进（仅 survival 在 startPrep 时启动） */
      /* ★ 金矿每秒产金（生存模式：科技 A 增产，约 4Hz 刷新 UI） */
      if(ACTIVE_MODE.key==="survival"&&goldMines.length){
        const ec=ACTIVE_MODE.economy||{};
        const tiers=ec.mineIncomeTiers||[14,20,28,39,55,78];
        const aLv=(game.tech&&game.tech.A)||0;
        const incomeMult=1+(TECH_TREE.A.effect.goldIncomePct||0.12)*aLv;
        let total=0;
        goldMines.forEach(m=>{total+=(tiers[Math.min(m.level-1,tiers.length-1)]||0);});
        game.gold+=total*incomeMult*dt;
        if(now-_goldT>250){_goldT=now;updateGoldUI();}
      }
      /* ★ 科技塔每秒产出科技点（生存专属资源，约 4Hz 刷新 UI） */
      if(ACTIVE_MODE.key==="survival"&&techTowers.length){
        const ec=ACTIVE_MODE.economy||{};
        game.techPoints+=(ec.techPerSec||0.55)*techTowers.length*dt;
        if(now-_goldT>250){_goldT=now;updateResUI();}
      }
      if(baseGroup){
        const sh=baseGroup.userData.shield,st=baseGroup.userData.star;
        sh.visible=game.baseShieldHP>0;
        if(sh.visible)sh.material.opacity=.12+.06*Math.sin(now*.004);
        st.rotation.y+=dt*2;
      }
      if(now-_buffT>500){_buffT=now;updateBuffUI();}
    }
    /* ★ 生存模式：首波发育期倒计时，归零自动开波
       ★ P4-5：PREP 下进入 B 建造模式（state=BUILD）也照常倒计时 */
    if(state===STATE.PREP||(state===STATE.BUILD&&wc3BuildMode&&game.prepTime>0)){
      game.prepTime-=dt;
      const s=Math.max(0,Math.ceil(game.prepTime));
      const el=$("prepBar");
      if(el)el.textContent=`⏱ 准备阶段 ${s}s · B 键打开商店`;
      if(game.prepTime<=0){
        if(el)el.style.display="none";
        state=STATE.PLAYING;
        announce("第 1 波 来袭！");
        startWave(1);
      }
    }
    updateParticles(dt);
    if(state===STATE.BUILD){
      /* 幸存者模式商店无倒计时；传统构筑模式倒计时归零自动开波 */
      if(ACTIVE_MODE.key!=="survival"){
        game.buildTimer-=dt;
        const s=Math.max(0,Math.ceil(game.buildTimer));
        const el=$("buildTimer");
        el.textContent=s;
        el.style.color=s<=10?"#ff5d5d":"#ffd75e";
        if(game.buildTimer<=0)finishBuild();
      }
    }
    if(state===STATE.BUILD&&buildSel!==null)updateGhost();
    drawMinimap();
    /* ★ P4-5：底部 HUD 低频刷新（0.2s）——命令卡/选中面板/资源速览 */
    if(ACTIVE_MODE.key==="survival"){
      _cmdT=( _cmdT||0)+dt;
      if(_cmdT>.2){_cmdT=0;renderCmdCard();wc3RenderSel();updateDockRes();}
    }
  }
  updateCamera(dt);
  renderer.render(scene,camera);
  if(location.search.includes("inspect")){
    let acc=[];
    let minY=1e9,maxY=-1e9,sunk=0,total=0;
    mapGroup.children.forEach(o=>{
      const b=new THREE.Box3().setFromObject(o);
      const mn=b.min.y,mx=b.max.y;
      if(!isFinite(mn)||!isFinite(mx))return;
      total++;minY=Math.min(minY,mn);maxY=Math.max(maxY,mx);
      if(mn<-0.5)sunk++;
      acc.push({name:o.children[0]?.name||"?",min:mn.toFixed(2),max:mx.toFixed(2),h:(mx-mn).toFixed(2)});
    });
    acc.sort((a,b)=>a.min-b.min);
    let d=document.getElementById("dbg");
    if(!d){d=document.createElement("div");d.id="dbg";
      d.style.cssText="position:absolute;top:60px;right:14px;color:#0f0;font-size:15px;z-index:99;font-family:monospace;max-width:460px;white-space:pre;background:rgba(0,0,0,.6);padding:6px;";
      document.body.appendChild(d);}
    d.textContent=`∈objects=${total} sink(${sunk}) minY=${minY.toFixed(2)} maxY=${maxY.toFixed(1)}\n`+
      acc.slice(0,22).map(a=>`${a.min} → ${a.max}  h=${a.h}  ${a.name}`).join("\n");
  }
  if(location.search.includes("debug")){
    let d=document.getElementById("dbg");
    if(!d){d=document.createElement("div");d.id="dbg";
      d.style.cssText="position:absolute;top:110px;left:14px;color:#0f0;font-size:13px;z-index:99;font-family:monospace;";
      document.body.appendChild(d);}
    const w=window.__warpStats;
    d.textContent=`state=${state} enemies=${enemies.length} toSpawn=${game.enemiesToSpawn} bullets=${bullets.length} wave=${game.wave} spawnT=${game.spawnTimer?.toFixed(2)} lives=${game.lives} over=${state===STATE.OVER}`+
      (w?`\nWARP: steps=${w.steps} baseAlive=${w.baseAlive} killedAt=${w.baseKilledAt?w.baseKilledAt.toFixed(0):"NO"} peakEn=${w.peakEnemies} peakBul=${w.peakBullets} endState=${w.endedState??"-"}`:"");
  }
}

/* ---------------- 开始/重开 ---------------- */
function resetGame(){
  [...bullets].forEach(b=>scene.remove(b.mesh));bullets.length=0;
  [...particles].forEach(p=>scene.remove(p.mesh));particles.length=0;
  [...powerups].forEach(p=>scene.remove(p.group));powerups.length=0;
  [...enemies].forEach(e=>{scene.remove(e.group);if(e.beam)scene.remove(e.beam);});enemies.length=0;
  /* ★ 清空玩家构筑物 */
  builtTurrets.forEach(t=>scene.remove(t.group));builtTurrets.length=0;
  builtMines.forEach(m=>scene.remove(m.group));builtMines.length=0;
  goldMines.forEach(m=>scene.remove(m.group));goldMines.length=0;

  /* ★ 重置任务三引导状态，避免跨局残留 */
  if(typeof questReset==="function") questReset();
  _waveClearing=false;                 /* ★ P0-1：跨局重开时清理清波闸门 */
  _wdStallT=0;_wdKillTimer=0;          /* ★ P1-1：跨局重开时清零波次看门狗 */

  Object.assign(game,{score:0,lives:3,wave:0,bombs:0,upgrades:{},_bossDone:false,_eliteToast:false,
    baseShieldHP:0,enemiesToSpawn:0,spawnTimer:0,respawnTimer:0,
    playerShieldHP:0,sprintUntil:0,_empTimer:0,_mortarTimer:0,
    tech:{},gateHp:0,gateMaxHp:0,gateHpLv:0,gateArmorLv:0,gateThornsLv:0,gateRegenLv:0,gateDodgeLv:0,
    popUsed:0,popMax:(ACTIVE_MODE.economy&&ACTIVE_MODE.economy.startPop)||12,techPoints:0,prepTime:0,endless:false,
    gold:ACTIVE_MODE.goldStart||0});
  game.buffs={shieldUntil:0,rapidUntil:0};
  game.stats={dmg:1,fireRate:1,moveSpeed:1,bulletSpeed:1,multishot:0,pierce:0,
    blastRadius:0,magnet:false,luckyLv:0,armorMax:5,
    critChance:0,vampLv:0,regenLv:0,
    bounce:0,sprintLv:0,sprintDur:3000,playerShieldLv:0,
    baseWallLv:0,baseRepairLv:0,autoTurretLv:0,baseShieldMax:0,airstrikeLv:0,overloadLv:0,
    empLv:0,mortarLv:0,evolveLv:0,incomeLv:0,builderLv:0,netmasterLv:0};

  genMap(1);
  if(ACTIVE_MODE.key!=="survival")spawnPlayer();
  /* ★ 大门血量（生存模式）：由 computeGateMaxHp 统一公式，初始满血 */
  if(ACTIVE_MODE.key==="survival"){
    game.gateMaxHp=computeGateMaxHp();
    game.gateHp=game.gateMaxHp;
    toast(`💎 大门血量 ${game.gateHp}`);
  }
  // 按当前模式立即归位相机，避免从菜单视角长过渡
  if(ACTIVE_MODE.key==="survival"&&baseGroup){
    /* ★ 生存 RTS：相机默认俯视基地/大门，并归位自由镜头焦点 */
    const f=baseGroup.position;
    camHeight=ACTIVE_MODE.cameraY||66;camBack=ACTIVE_MODE.cameraZ||54;
    camFocus.set(f.x*.5,0,f.z*.5);
    camera.position.set(f.x*.5, camHeight, f.z*.5+camBack);
    camera.lookAt(camFocus.clone().setY(0));
  }else if(player&&player.group){
    const f=player.group.position;
    const cy=ACTIVE_MODE.cameraY||60,cz=ACTIVE_MODE.cameraZ||46;
    camera.position.set(f.x*.55, cy, f.z*.55+cz);
    camera.lookAt(new THREE.Vector3(f.x*.55,0,f.z*.55));
  }
  $("score").textContent=0;
  if($("modeName"))$("modeName").textContent=ACTIVE_MODE.name||"巷战";
  updateHpUI();updateBuffUI();updateGoldUI();
  $("hud").classList.remove("hidden");
  $("hud").classList.toggle("survival",ACTIVE_MODE.key==="survival");
  $("build").classList.add("hidden");
  $("tech").classList.add("hidden");
  $("gateUp").classList.add("hidden");
  if(ACTIVE_MODE.key==="survival"){
    state=STATE.PREP;
    startPrep();
  }else{
    state=STATE.PLAYING;
    startWave(1);
  }
}

$("restartBtn").onclick=()=>{$("gameover").classList.add("hidden");resetGame();};
$("resumeBtn").onclick=()=>setPause(false);
/* ★ 科技树弹窗：完成按钮关闭并回到原状态 */
$("techDoneBtn").onclick=closeTechMenu;
/* ★ 结算弹窗：胜利收尾 / 进入无尽 */
const settleWinBtn=$("settleWinBtn"),settleEndlessBtn=$("settleEndlessBtn");
if(settleWinBtn)settleWinBtn.onclick=()=>{ $("settle").classList.add("hidden"); endGame(true); };
if(settleEndlessBtn)settleEndlessBtn.onclick=()=>{
  $("settle").classList.add("hidden");
  game.endless=true;
  state=STATE.PLAYING;
  announce("♾️ 无尽模式开启！Boss 将周期性降临");
  setTimeout(()=>startWave(game.wave+1),900);
};

/* 暴露关键状态给调试/验证脚本（不影响游戏逻辑） */
Object.assign(window,{get state(){return state;},get game(){return game;},
  get enemies(){return enemies;},get baseAlive(){return baseAlive;}});

/* ---- warp：零依赖真实战斗验证钩子（?warp=秒数&seed=x）----
   以固定步长同步快进战斗，量化验证"基地是否被穿墙打死"。
   复用现有 updatePlayer/updateEnemies/updateBullets 等真实逻辑，
   只额外前移 performance.now() 以驱动出生无敌计时。 */
if(location.search.includes("warp")){
  const warpMs=parseFloat(new URLSearchParams(location.search).get("warp")||"30")*1000;
  let simNow=performance.now();
  const SALT=(+new URLSearchParams(location.search).get("seed")||1);
  let baseAliveStart=null,baseKilledAt=null,peakEnemies=0,peakBullets=0,shootEvents=0;
  window.__warp=()=>{
    // 等游戏真正开始
    if(state!==STATE.PLAYING)return;
    const STEP=1/60;
    const steps=Math.floor(warpMs/1000/STEP);
    // 备份 performance.now 并前移
    const origNow=window.performance.now.bind(window.performance);
    let virtualNow=simNow;
    window.performance.now=()=>virtualNow;
    const stats=window.__warpStats={steps,baseAliveStart:true,baseKilledAt:null,
      peakEnemies:0,peakBullets:0,shootEvents:0,endedState:null};
    stats.baseAlive=null;
    for(let s=0;s<steps;s++){
      if(state!==STATE.PLAYING){stats.endedState=state;break;}
      simNow+=STEP*1000;virtualNow=simNow;
      updatePlayer(STEP);updateEnemies(STEP);updateAutoTurret(STEP);updateBullets(STEP);updatePowerups(STEP);
      if(enemies.length>stats.peakEnemies)stats.peakEnemies=enemies.length;
      if(bullets.length>stats.peakBullets)stats.peakBullets=bullets.length;
      if(state!==STATE.PLAYING){stats.endedState=state;break;}
      if(!baseAlive&&stats.baseKilledAt===null)stats.baseKilledAt=simNow;
    }
    window.performance.now=origNow;
    stats.baseAlive=baseAlive;
    stats.baseKilledAt=stats.baseKilledAt;
    stats.baseAliveStart=true;
  };
  // 在 autotest 自动开局后运行一次
  setTimeout(()=>{window.__warp&&window.__warp();},9000);
}

/* 菜单背景展示 */
genMap(1);
camera.position.set(0,52,38);
camera.lookAt(0,0,0);
loop();

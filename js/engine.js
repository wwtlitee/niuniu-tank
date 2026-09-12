/* =====================================================================
   坦克大战 3D —— 城市巷战 · 肉鸽强化版
   素材：Kenney City Kit（CC0 协议）
   ===================================================================== */
"use strict";

const SEED_PARAM=new URLSearchParams(location.search).get("seed");
if(SEED_PARAM!==null){
  const _seedVal=(+SEED_PARAM>>>0)||1;
  const _origRandom=Math.random;
  let _rngState=_seedVal;
  Math.random=function(){
    _rngState|=0;_rngState=_rngState+0x6D2B79F5|0;
    let t=Math.imul(_rngState^_rngState>>>15,1|_rngState);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
  Math._origRandom=_origRandom;
  Math._seedVal=_seedVal;
}

const RUNTIME_ERROR_DEBUG=new URLSearchParams(location.search).get("debug")==="1";
const _shownRuntimeErrors=new Set();
window.addEventListener("error",e=>{
  if(!RUNTIME_ERROR_DEBUG)return;
  const source=e.filename||"";
  if(source&&!source.startsWith(location.origin))return;
  const key=`${e.message}|${source}|${e.lineno||0}|${e.colno||0}`;
  if(_shownRuntimeErrors.has(key))return;
  _shownRuntimeErrors.add(key);
  document.title="ERR:"+e.message;
  let d=document.getElementById("errbox");
  if(!d){d=document.createElement("div");d.id="errbox";
    d.style.cssText="position:absolute;bottom:40px;left:10px;color:#ff5d5d;font-size:14px;z-index:99;white-space:pre-wrap;max-width:80vw;";
    document.body.appendChild(d);}
  if(_shownRuntimeErrors.size<=5)d.textContent+=" "+e.message+"\n";
});

/* ---------------- 基础常量 ---------------- */
const GAME_VERSION="8.10.0";
const DEFAULT_SURVIVAL_BASE=Object.freeze({...GAME_MODES.survival.base});
let GRID = 47;                     // 由激活模式动态设置（默认大地图）
const TILE = 4;
let HALF = GRID*TILE/2;
let PH = 2.2; // 经典地图保留原高度，生存高台在模式切换时设置。

function makeSurvivalGroundMaterial(){
  const texture=makeSurvivalPlateauTexture();
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(12,12);
  return new THREE.MeshStandardMaterial({color:0x959387,map:texture,roughness:1});
}

function makeSurvivalPlateauTexture(){
  const canvas=document.createElement("canvas");canvas.width=canvas.height=512;
  const context=canvas.getContext("2d");
  let seed=0x5a17c9e3;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;};
  context.fillStyle="#69675e";context.fillRect(0,0,512,512);
  /* 大尺度灰土色差：使用半透明软斑而非逐像素白噪声，远景不会出现摩尔纹。 */
  for(let i=0;i<95;i++){
    const x=random()*512,y=random()*512,r=12+random()*64,light=random()>.48;
    const gradient=context.createRadialGradient(x,y,0,x,y,r);
    gradient.addColorStop(0,light?`rgba(151,146,132,${.025+random()*.045})`:`rgba(41,40,37,${.025+random()*.055})`);
    gradient.addColorStop(1,"rgba(70,68,62,0)");context.fillStyle=gradient;
    context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fill();
  }
  /* 压实土磨痕：低对比、无文字、无碰撞，避免重新变成干净塑料板。 */
  for(let i=0;i<28;i++){
    const x=random()*512,y=random()*512,rx=28+random()*72,ry=7+random()*21;
    context.save();context.translate(x,y);context.rotate(random()*Math.PI);
    context.fillStyle=`rgba(47,44,39,${.025+random()*.04})`;
    context.beginPath();context.ellipse(0,0,rx,ry,0,0,Math.PI*2);context.fill();context.restore();
  }
  /* 细碎裂纹只承担近看质感，控制线宽和透明度，远景不会读成道路。 */
  context.lineCap="round";
  for(let i=0;i<24;i++){
    let x=random()*512,y=random()*512;context.beginPath();context.moveTo(x,y);
    for(let segment=0;segment<3+Math.floor(random()*4);segment++){
      x+=-14+random()*28;y+=5+random()*22;context.lineTo(x,y);
    }
    context.strokeStyle=`rgba(35,33,30,${.12+random()*.08})`;context.lineWidth=.8+random()*1.1;context.stroke();
  }
  for(let i=0;i<720;i++){
    const value=random()>.5?145:52,alpha=.06+random()*.11,size=random()>.9?2:1;
    context.fillStyle=`rgba(${value},${value-3},${Math.max(30,value-10)},${alpha})`;
    context.fillRect(Math.floor(random()*512),Math.floor(random()*512),size,size);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  if(renderer&&renderer.capabilities)texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return texture;
}

/* 应用模式配置（home.js 进入模式前调用） */
function applyModeConfig(m){
  PH=m.mapType==="survival"?3.4:2.2;
  GRID = m.GRID;
  HALF = GRID*TILE/2;
  configureModeAtmosphere(m);
  // 重建地面与网格以匹配当前模式地图尺寸
  scene.remove(ground); ground.geometry.dispose();ground.material.map?.dispose();ground.material.dispose();
  if(m.mapType==="survival"){
    ground=new THREE.Mesh(
      new THREE.BoxGeometry(GRID*TILE+24,2.4,GRID*TILE+24),
      makeSurvivalGroundMaterial());
    ground.position.y=-1.2;
    ground.userData.surfaceVolume=true;
  }else{
    ground=new THREE.Mesh(
      new THREE.PlaneGeometry(GRID*TILE+24,GRID*TILE+24),
      new THREE.MeshStandardMaterial({color:0x1a2632,roughness:.95}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-.03;
  }
  ground.receiveShadow=true;
  scene.add(ground);
  scene.remove(gridHelper); gridHelper.dispose&&gridHelper.dispose();
  gridHelper=new THREE.GridHelper(GRID*TILE,GRID,0x27394c,0x20303f);
  gridHelper.position.y=.01;gridHelper.visible=m.mapType!=="survival";scene.add(gridHelper);
  // 同步阴影相机范围
  const shadowSize=m.mapType==="survival"?1024:2048;
  sun.shadow.mapSize.set(shadowSize,shadowSize);
  sun.shadow.camera.left=-HALF-10; sun.shadow.camera.right=HALF+10;
  sun.shadow.camera.top=HALF+10; sun.shadow.camera.bottom=-HALF-10;
}

const T_EMPTY=0,T_BRICK=1,T_STEEL=2,T_WATER=3,T_TREE=4,T_BASE=5,
      T_ROAD=6,T_BUILDING=7,T_PLATEAU=8,T_RAMP=9,T_BRIDGE=10;

const STATE={MENU:0,PLAYING:1,UPGRADE:2,PAUSED:3,OVER:4,BUILD:5,TECH:6,PREP:7,SETTLE:8,GATE:9};

/*  生存模式墙升级链（5 级）—— 对应 DESIGN_生存模式重做_v4 §5.1
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
const WALL_BASE_MAX_LEVEL=50;
function createWallLevel(lv){
  const index=lv-1,progress=SurvivalSystem.wallProgress(lv),tier=SurvivalSystem.WALL_TIERS[progress.tier];
  return {lv,model:"castle-gate-wall",hp:180+index*26+progress.tier*90,
    price:SurvivalSystem.wallUpgradeCost(Math.max(0,lv-1))||0,scale:.96,
    metalness:tier.metalness,roughness:tier.roughness,tint:tier.color,
    emissive:tier.emissive,tag:tier.name,thorns:0,desc:`${tier.name}巨岩 · ${progress.minor}/10`};
}
const WALL_LEVELS=Array.from({length:WALL_BASE_MAX_LEVEL},(_,index)=>createWallLevel(index+1));
function wallDefinition(level){
  const safe=Math.max(1,Math.floor(Number(level)||1));
  while(WALL_LEVELS.length<safe)WALL_LEVELS.push(createWallLevel(WALL_LEVELS.length+1));
  return WALL_LEVELS[safe-1];
}
function breakthroughLevel(id){return Math.max(0,Math.floor(game&&game.breakthroughs&&game.breakthroughs[id]||0));}
function wallUnlockedMaxLevel(){return SurvivalSystem.wallLevelCap(breakthroughLevel("wall"));}
function turretUnlockedMaxLevel(){return SurvivalSystem.turretLevelCap(breakthroughLevel("turret"));}
function researchUnlockedMaxLevel(){return SurvivalSystem.researchLevelCap(breakthroughLevel("science"));}
function mineUnlockedCount(){return SurvivalSystem.mineBuildLimit(breakthroughLevel("mining"));}
function researchPowerLevel(level){const value=Math.max(0,Number(level)||0);return value<=10?value:10+Math.sqrt(value-10)*2.5;}
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
  if(curLv>=wallUnlockedMaxLevel())return Infinity;
  return wallDefinition(curLv+1).price;
}
function wallPriceNew(){return WALL_LEVELS[0].price;}
function wallMaxHp(lv){
  const wall=wallDefinition(lv);if(!wall)return 0;
  const defenseLv=researchPowerLevel((game.tech&&game.tech.defense)||0);
  return Math.round(wall.hp*(1+(TECH_TREE.defense.effect.structureHpPct||0.1)*defenseLv));
}
function wallFullDesc(lv){
  const w=wallDefinition(lv);if(!w)return "";
  const next=lv<wallUnlockedMaxLevel()?`→ Lv${lv+1} 价 ${wallPriceNext(lv)}`:`当前突破上限`;
  return `${w.tag}·Lv${lv} · ${wallMaxHp(lv)}${w.thorns>0?` · ${Math.round(w.thorns*100)}%`:""} · ${next}`;
}

/*  任务（新手指引）：三步走——金库→墙→塔，仅生存模式开局触发 */
const QUEST_STEPS=[
  {id:"mine",label:"1/3 按 B 键打开商店，选【金矿】放到高地上",check:()=>goldMines.length>=1},
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
    el.innerHTML=`<div class="qpTitle"> 新手引导</div><div class="qpStep">${step.label}</div><div class="qpHint">ESC 跳过</div>`;
  }
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
      toast(" 三步引导完成！自由发展吧");
      return;
    }
    questShow();
  }
}
function hideQuestPanel(){const el=$("questPanel");if(el)el.style.display="none";}
function questSkip(){
  if(!questActive)return;
  questActive=false;hideQuestPanel();
  toast(" 已跳过新手引导");
}
let state=STATE.MENU;

/* ---------------- 场景 ---------------- */
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:!!navigator.webdriver});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.getElementById("game").appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0a1018);
scene.fog=new THREE.Fog(0x0a1018,90,200);

const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,400);

const hemi=new THREE.HemisphereLight(0xbfd8ff,0x2a3848,.95);scene.add(hemi);
const ambient=new THREE.AmbientLight(0x4a5568,.55);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xfff2d8,1.05);
sun.position.set(35,60,-25);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-HALF-10; sun.shadow.camera.right=HALF+10;
sun.shadow.camera.top=HALF+10;   sun.shadow.camera.bottom=-HALF-10;
sun.shadow.camera.far=200;
scene.add(sun);

let ashWindGroup=null,atmosphereOverlay=null;
function ensureAshWind(){
  if(ashWindGroup)return ashWindGroup;
  const atmosphere=(window.SURVIVAL_ASSETS&&SURVIVAL_ASSETS.atmosphere)||{dustParticles:64};
  const count=atmosphere.dustParticles||64,positions=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const hash=((i+1)*2654435761)>>>0;
    positions[i*3]=((hash&1023)/1023-.5)*GRID*TILE;
    positions[i*3+1]=.35+(((hash>>>10)&255)/255)*8;
    positions[i*3+2]=((((hash>>>18)&1023)/1023)-.5)*GRID*TILE;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const dustCanvas=document.createElement("canvas");dustCanvas.width=dustCanvas.height=32;
  const dc=dustCanvas.getContext("2d"),gradient=dc.createRadialGradient(16,16,1,16,16,15);
  gradient.addColorStop(0,"rgba(204,214,220,.64)");gradient.addColorStop(.35,"rgba(155,166,172,.28)");gradient.addColorStop(1,"rgba(105,112,118,0)");
  dc.fillStyle=gradient;dc.fillRect(0,0,32,32);
  const texture=new THREE.CanvasTexture(dustCanvas);
  const material=new THREE.PointsMaterial({color:0x9aa4a8,map:texture,size:.72,transparent:true,opacity:.24,depthWrite:false,sizeAttenuation:true});
  ashWindGroup=new THREE.Points(geometry,material);ashWindGroup.name="ash-wind-single-batch";ashWindGroup.frustumCulled=false;
  scene.add(ashWindGroup);
  atmosphereOverlay=document.createElement("div");atmosphereOverlay.id="ashAtmosphereOverlay";
  atmosphereOverlay.style.cssText="position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at 48% 42%,transparent 38%,rgba(5,12,20,.34) 100%),linear-gradient(125deg,rgba(61,100,124,.08),transparent 45%,rgba(167,91,35,.075));";
  document.getElementById("game").appendChild(atmosphereOverlay);
  return ashWindGroup;
}
function configureModeAtmosphere(mode){
  const survival=mode.mapType==="survival";
  if(survival){
    const night=SurvivalSystem.NIGHT_VISUALS;
    const a=(window.SURVIVAL_ASSETS&&SURVIVAL_ASSETS.atmosphere)||{background:night.background,fog:night.fog,fogNear:night.fogNear,fogFar:night.fogFar,exposure:night.exposure};
    scene.background.setHex(a.background);scene.fog=null;
    // This material palette was authored for linear output in the bundled Three.js.
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=a.exposure;renderer.outputEncoding=THREE.LinearEncoding;
    hemi.color.setHex(night.hemisphereSky);hemi.groundColor.setHex(night.hemisphereGround);hemi.intensity=night.hemisphereIntensity;
    ambient.color.setHex(night.ambientColor);ambient.intensity=night.ambientIntensity;
    sun.color.setHex(night.moonColor);sun.intensity=night.moonIntensity;sun.position.set(-42,58,-30);
    ensureAshWind().visible=!window.Settings||Settings.isParticles();if(atmosphereOverlay)atmosphereOverlay.style.display="block";
  }else{
    if(!scene.fog)scene.fog=new THREE.Fog(0x0a1018,90,mode.fogFar||200);
    scene.background.setHex(0x0a1018);scene.fog.color.setHex(0x0a1018);scene.fog.near=90;scene.fog.far=mode.fogFar||200;
    renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;
    hemi.color.setHex(0xbfd8ff);hemi.groundColor.setHex(0x2a3848);hemi.intensity=.95;
    ambient.color.setHex(0x4a5568);ambient.intensity=.55;sun.color.setHex(0xfff2d8);sun.intensity=1.05;
    if(ashWindGroup)ashWindGroup.visible=false;if(atmosphereOverlay)atmosphereOverlay.style.display="none";
  }
}
function updateAshWind(dt){
  if(!ashWindGroup||!ashWindGroup.visible)return;
  const attr=ashWindGroup.geometry.getAttribute("position"),p=attr.array,span=GRID*TILE;
  for(let i=0;i<p.length;i+=3){p[i]+=dt*5.4;p[i+2]+=dt*1.15;if(p[i]>HALF)p[i]-=span;if(p[i+2]>HALF)p[i+2]-=span;}
  attr.needsUpdate=true;
}

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
  if(window.Settings)applyPresentationSettings();
});
function applyPresentationSettings(){
  if(!window.Settings)return;
  const quality=Settings.getQuality(),cap=quality==='low'?.85:quality==='high'?2:1.5;
  const ratio=Math.min(devicePixelRatio||1,cap);
  if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
  renderer.shadowMap.enabled=Settings.isShadows()&&quality!=='low';
  renderer.shadowMap.needsUpdate=true;
  if(ashWindGroup)ashWindGroup.visible=ACTIVE_MODE.key==='survival'&&Settings.isParticles();
  if(!Settings.isParticles()){particlePool.push(...particles);particles.length=0;particleFx.commit(0);}
  if(!Settings.isShake())camShake=0;
}

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
const AUDIO_DISABLED=new URLSearchParams(location.search).has("autotest")&&navigator.webdriver;
function audio(){
  if(AUDIO_DISABLED)return null;
  if(!AC){const Constructor=window.AudioContext||window.webkitAudioContext;if(!Constructor)return null;try{AC=new Constructor();}catch(_){return null;}}
  //  v6.35.0：把 AC 注入 AudioMixer，初始化 master/sfx/music 三总线与 limiter。
  if(window.AudioMixer&&!window.AudioMixer.bus("master"))window.AudioMixer.init(AC);
  if(window.BGMSystem&&window.AudioMixer&&window.AudioMixer.bus("master"))window.BGMSystem.bind(AC);
  if(window.SurvivalSoundBank)SurvivalSoundBank.bind(AC,combatOutput(AC));
  return AC;
}
/* 旧 combatOutput(ac) 入口：直接返回 AudioMixer 的 sfx 总线。
   limiter 已内置到 mixer 内部（sfx → limiter → master → destination）。 */
const combatSfxLast=new Map();
function combatOutput(ac){
  return (window.AudioMixer&&window.AudioMixer.sfxOutput(ac))||(ac&&ac.destination);
}
function combatNoiseBurst(ac,{when=ac.currentTime,duration=.12,volume=.12,highpass=120,lowpass=6500}={}){
  const buffer=AudioMixer.noiseBuffer(ac,duration);
  const source=ac.createBufferSource(),hp=ac.createBiquadFilter(),lp=ac.createBiquadFilter(),gain=ac.createGain();
  hp.type="highpass";hp.frequency.value=highpass;lp.type="lowpass";lp.frequency.value=lowpass;
  gain.gain.setValueAtTime(Math.max(.0001,volume),when);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
  source.buffer=buffer;source.connect(hp);hp.connect(lp);lp.connect(gain);gain.connect(combatOutput(ac));source.start(when);
  source.onended=()=>{source.disconnect();hp.disconnect();lp.disconnect();gain.disconnect();};
}
function playCannonReport(caliber='medium'){return SurvivalSoundBank.play(caliber);}
function playArmorImpact(weight='medium'){return SurvivalSoundBank.play(weight==='heavy'?'gate':'impact');}
function playZombieGroan(enemy){
  if(!enemy?.group||!isPositionVisible(enemy.group.position)||Math.random()>.12)return false;
  const p=enemy.group.position,distance=Math.hypot(p.x-camFocus.x,p.z-camFocus.z);
  return distance<50&&SurvivalSoundBank.play('zombie',{distance,pan:(p.x-camFocus.x)/45});
}
function playGateBash(){return SurvivalSoundBank.play('gate');}
function beep(){return SurvivalSoundBank.play('select');}
const sfx={profile:Object.freeze({calibers:['small','medium','large','huge'],layers:['recording','impact','tail'],source:'recorded'}),shoot:playCannonReport,eshoot:()=>playCannonReport('small'),boom:()=>SurvivalSoundBank.play('explosion'),bigboom:()=>SurvivalSoundBank.play('bigboom'),hit:()=>playArmorImpact(),zombie:playZombieGroan,gate:playGateBash,pickup:()=>SurvivalSoundBank.play('pickup'),levelup:()=>SurvivalSoundBank.play('upgrade'),hurt:()=>playArmorImpact('heavy'),build:()=>SurvivalSoundBank.play('build'),complete:()=>SurvivalSoundBank.play('complete'),cancel:()=>SurvivalSoundBank.play('cancel')};
function playIntro(){SurvivalSoundBank.play('select');}

/* ---------------- Kenney 素材系统（GLTF + 失败回退）---------------- */
const ASSETS={}, ASSET_BOX={}, ASSET_ANIMS={},ASSET_TEXTURES={};
let gltfLoader=(window.THREE&&THREE.GLTFLoader)?new THREE.GLTFLoader():null;
let textureLoader=(window.THREE&&THREE.TextureLoader)?new THREE.TextureLoader():null;

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
  /* 三套 Kenney 原生骨骼尸潮：Survivors / Retro 的模型与动作分离。 */
  ["survivors/","survivor-zombie"],["survivors/","survivor-idle"],["survivors/","survivor-run"],
  ["retro/","retro-zombie"],["retro/","retro-idle"],["retro/","retro-run"],
  /*  P5 怪物包（graveyard-kit）：丧尸/骷髅/吸血鬼/幽灵/守墓人 —— 尸潮敌方主力 */
  ["monsters/","character-zombie"],["monsters/","character-skeleton"],
  ["monsters/","character-vampire"],["monsters/","character-ghost"],["monsters/","character-keeper"],
  /*  P5 地板铺装（3d-road-tiles 方砖转制）：一层草地/石板地，消除"纯色空地"粗糙感 */
  ["floors/","floor-grass"],["floors/","floor-grassB"],["floors/","floor-grassC"],
  ["floors/","floor-stone"],["floors/","floor-stoneB"],
  /*  P5b tower-defense-kit：带 colormap 质感的草皮方砖（一层地面主力） */
  ["tdkit/","tile"],["tdkit/","tile-bump"],["tdkit/","tile-dirt"],["tdkit/","tile-rock"],
  ["tdkit/","tile-hill"],["tdkit/","tile-tree"],["tdkit/","tile-straight"],["tdkit/","tile-crossing"],
  ["tdkit/","tile-corner-inner"],["tdkit/","tile-corner-outer"],["tdkit/","tile-end"],["tdkit/","tile-split"],
  ["tdkit/","tile-wide-straight"],["tdkit/","tile-wide-corner"],["tdkit/","tile-straight-slope"],["tdkit/","spawn-square"],
  /*  P5b platformer-kit：圆角草块地形系（台面/坡道/边缘）+ 装饰 */
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
  ["graveyard/","lightpost-single"],["graveyard/","lightpost-double"],
  /* 城市工业套装：第三列为运行时别名，避免与商业包同名覆盖。 */
  ["industrial/","building-c","industrial-building-c"],["industrial/","building-d","industrial-building-d"],
  ["industrial/","building-g","industrial-building-g"],["industrial/","building-i","industrial-building-i"],
  ["industrial/","building-m","industrial-building-m"],["industrial/","building-s","industrial-building-s"],
  ["industrial/","building-t","industrial-building-t"],["industrial/","chimney-basic","industrial-chimney-basic"],
  /* 已退役但保留在本地候选库；生存白名单不会加载。 */
  ["industrial/","building-a","industrial-building-a-archive"],["industrial/","building-h","industrial-building-h-archive"],
  ["industrial/","building-k","industrial-building-k-archive"],["industrial/","building-n","industrial-building-n-archive"],
  ["industrial/","building-p","industrial-building-p-archive"],
];
const REQUESTED_MODE=new URLSearchParams(location.search).get("mode");
const ASSET_LOAD_FILES=REQUESTED_MODE==="survival"&&window.SURVIVAL_ASSETS
  ?ASSET_FILES.filter(([directory,name])=>SURVIVAL_ASSETS.runtimeAllowlist.includes(`${directory}${name}.glb`))
  :ASSET_FILES;
/* 角色贴图必须在主菜单阶段也加载：玩家通常从无 query 的菜单进入生存模式，
   若按 URL 参数条件加载会导致 _survivalZombieVariant() 永远拿不到贴图，
   最终显示灰色占位人形。 */
const ASSET_TEXTURE_FILES=[
  ["survivors/","zombie-a"],["survivors/","zombie-c"],
  ["survivors/","survivor-female-a"],["survivors/","survivor-male-b"],
  ["retro/","zombie-female-a"],["retro/","zombie-male-a"],
  ["retro/","human-female-a"],["retro/","human-male-a"],
  ["protagonists/","criminal-male-a"],["protagonists/","cyborg-female-a"],
  ["protagonists/","skater-female-a"],["protagonists/","skater-male-a"],
];
/* 资产就绪追踪：genMap 若在加载完成前执行会整图灰盒回退；
   全部结算后自动重建菜单背景，并暴露 assetsReady()/assetsProgress()
   供 home.js 在进模式前等待，杜绝"整局灰盒"竞态 */
let _pendingAssets=0,_assetsLoaded=0,_assetFailCount=0,_assetsReady=false;
const _sharedGeoms=new WeakSet();   /* ASSETS 源场景几何体（clone 与源共享），严禁 dispose */
function assetsReady(){return _assetsReady;}
function assetsProgress(){return [_assetsLoaded,ASSET_LOAD_FILES.length+ASSET_TEXTURE_FILES.length];}
function _assetSettled(){
  _assetsLoaded++;
  if(_pendingAssets>0&&_assetsLoaded<_pendingAssets)return;
  _assetsReady=true;
  if(_assetFailCount>0)console.warn(`[assets] ${_assetFailCount} 个模型加载失败，对应地块已回退程序化盒子`);
  else console.info(`[assets] 全部 ${ASSET_LOAD_FILES.length} 个模型就绪`);
  if(state===STATE.MENU)genMap(1);   /* 菜单背景立即换上真模型 */
}
if(gltfLoader){
  _pendingAssets=ASSET_LOAD_FILES.length+ASSET_TEXTURE_FILES.length;
  ASSET_LOAD_FILES.forEach(([dir,name,alias])=>{
    gltfLoader.load("assets/"+dir+name+".glb",g=>{
      const key=alias||name;
      ASSETS[key]=g.scene;
      ASSET_BOX[key]=new THREE.Box3().setFromObject(g.scene);
      if(g.animations&&g.animations.length)ASSET_ANIMS[key]=g.animations;
      g.scene.traverse(o=>{if(o.isMesh&&o.geometry)_sharedGeoms.add(o.geometry);});
      _assetSettled();
    },undefined,err=>{
      _assetFailCount++;
      console.warn(`[assets] 加载失败: ${dir}${name}.glb`,(err&&err.message)||err||"");
      _assetSettled();
    });
  });
  ASSET_TEXTURE_FILES.forEach(([dir,name])=>{
    textureLoader.load("assets/"+dir+name+".png",texture=>{
      texture.flipY=false;
      if(THREE.sRGBEncoding!=null)texture.encoding=THREE.sRGBEncoding;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      ASSET_TEXTURES[name]=texture;_assetSettled();
    },undefined,err=>{
      _assetFailCount++;
      console.warn(`[assets] 贴图加载失败: ${dir}${name}.png`,(err&&err.message)||err||"");
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
  obj.userData.assetName=name;   /* 诊断：独立放置组携带资产名，便于运行时违和点定位 */
  if(src){
    const inst=src.clone(true);
    _tmpBox.setFromObject(inst); _tmpBox.getSize(_tmpSize);
    let s=w/Math.max(.001,Math.max(_tmpSize.x,_tmpSize.z));   // 按最大水平维度缩放
    if(maxH&&_tmpSize.y*s>maxH)s=maxH/_tmpSize.y;             // 细高模型限高
    inst.scale.setScalar(s);
    /*  P5c-R7：block-grass 系直接放置路径也去红（placeModel 绕过批次系统） */
    if(name.startsWith("block-grass")){
      inst.traverse(o=>{if(o.isMesh&&o.material){o.material=o.material.clone();o.material.color=new THREE.Color(0.58,0.68,0.52);o.material.roughness=.96;}});
    }
    /* P5c-R8：color 参数对 GLB 模型也生效——作为乘数染色（树干去红等） */
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
function replaceModelMaterial(root,color,{roughness=.9,metalness=0}={}){
  if(!root)return;
  root.traverse(o=>{
    if(!o.isMesh||!o.material)return;
    const materials=Array.isArray(o.material)?o.material:[o.material];
    const replaced=materials.map(material=>{
      const next=material.clone();next.map=null;next.color.setHex(color);
      next.roughness=roughness;next.metalness=metalness;
      if(next.emissive)next.emissive.setHex(0x000000);next.emissiveIntensity=0;next.emissiveMap=null;return next;
    });
    o.material=Array.isArray(o.material)?replaced:replaced[0];
  });
}
function applyGoldMinePalette(root){
  if(!root)return;
  root.traverse(o=>{
    if(!o.isMesh||!o.material)return;
    const source=Array.isArray(o.material)?o.material:[o.material];
    const tinted=source.map(material=>{
      const next=material.clone();
      next.color.setHex(0xc49a3f);next.roughness=.54;next.metalness=.46;
      if(next.emissive){next.emissive.setHex(0x6b400b);next.emissiveIntensity=.46;}
      return next;
    });
    o.material=Array.isArray(o.material)?tinted:tinted[0];
    o.userData.goldMineRecolored=true;
  });
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
/* v5.0.0：唯一地形真值层。视觉放置、移动、敌人、拾取和建造均只允许经由
   TerrainSurface 查询高度；不再维护会相互漂移的 heightMap/slopeMap 副本。 */
let terrainSurface=null;
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
  return terrainSurface?terrainSurface.heightAt(px,pz):0;
}

function buildBrickMesh(cx,cz){
  const c=cellCenter(cx,cz);
  const m=new THREE.Mesh(new THREE.BoxGeometry(TILE*.96,2.6,TILE*.96),
    [matSteel,matSteel,matBrickTop,matSteel,matBrick,matBrick]);
  m.position.set(c.x,1.3,c.z);
  m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return m;
}

/* WAR3 式世界血条：满血隐藏，受伤后出现；深色细框在夜景中保持可读但不抢画面。 */
function attachWorldHealthBar(owner,y,width=2.6){
  if(!owner)return null;
  const root=new THREE.Group();root.name="damage-health-bar";root.position.y=y;root.visible=false;
  const background=new THREE.Mesh(new THREE.PlaneGeometry(width,.3),
    new THREE.MeshBasicMaterial({color:0x111418,transparent:true,opacity:.94,depthWrite:false,depthTest:false}));
  const fillWidth=Math.max(.2,width-.18),fill=new THREE.Mesh(new THREE.PlaneGeometry(fillWidth,.16),
    new THREE.MeshBasicMaterial({color:0x62d56f,transparent:true,opacity:1,depthWrite:false,depthTest:false}));
  background.renderOrder=30;fill.renderOrder=31;fill.position.z=.02;root.add(background,fill);root.renderOrder=30;
  root.userData.fill=fill;root.userData.fillWidth=fillWidth;
  owner.add(root);owner.userData.healthBar=root;
  return {bar:root,barFg:fill};
}
function syncWorldHealthBar(bar,hp,maxHp){
  if(!bar||!Number.isFinite(hp)||!Number.isFinite(maxHp)||maxHp<=0)return;
  const ratio=Math.max(0,Math.min(1,hp/maxHp)),visible=ratio>0&&ratio<.9999;
  bar.visible=visible&&!bar.userData.panelOnly;if(!bar.visible)return;
  const fill=bar.userData&&bar.userData.fill;if(fill){
    const width=bar.userData.fillWidth||1;
    fill.scale.x=Math.max(.001,ratio);fill.position.x=-(1-ratio)*width*.5;
    fill.material.color.setHex(ratio>.6?0x62d56f:(ratio>.3?0xe0b95f:0xd85a4f));
  }
  if(bar.lookAt)bar.lookAt(camera.position);
}

/* Kenney 城堡墙地块：按邻接自动转向拼成连续城墙；lv=1~5（生存墙升级链）
    经典模式调用：buildWallTile(p,x,z,steelFlag) → 回退为 2 档（钢墙/石墙），保证兼容
    生存模式调用：buildWallTile(p,x,z,lv)  → 使用 WALL_LEVELS[lv-1] 全部参数
*/
function buildWallTile(parent,cx,cz,steelOrLv){
  const c=cellCenter(cx,cz);
  const wallish=t=>t===T_BRICK||t===T_STEEL;
  const nb=(dx,dz)=>inMap(cx+dx,cz+dz)&&wallish(grid[cz+dz][cx+dx]);
  const horiz=nb(1,0)||nb(-1,0);           // 左右有邻墙 → 墙体沿 X 走向
  const rot=horiz?Math.PI/2:0;

  /* 解析等级：生存墙可通过突破无限扩展；超过五种材质后继续使用黑曜石阶段。 */
  let lv,name,tint,metalness,roughness,scale;
  if(typeof steelOrLv==="number"&&steelOrLv>=1){
    const w=wallDefinition(steelOrLv);
    lv=steelOrLv;name=w.model;tint=w.tint;metalness=w.metalness;roughness=w.roughness;scale=w.scale;
  }else{
    const steel=!!steelOrLv;
    name=steel?"wall":"wall-narrow";tint=steel?0x9db1c7:0xffffff;
    metalness=steel?.65:0;roughness=steel?.35:.85;scale=steel?1.0:.95;
    lv=steel?3:2;
  }

  const isSurvivalWall=ACTIVE_MODE.key==="survival"&&typeof steelOrLv==="number";
  const visualScale=isSurvivalWall?SurvivalSystem.wallVisualScale(lv):1;
  const wallBuild=isSurvivalWall&&typeof shopList==="function"?shopList().find((item)=>item.id==="wall"):null;
  const footprint=(wallBuild&&wallBuild.footprint)||[1,1];
  const center=isSurvivalWall?footprintCenter({x:cx,z:cz},{footprint}):c;
  let g;
  if(isSurvivalWall){
    g=makeFortificationWall(cx,cz,lv);parent.add(g);
    g.userData.materialTier=SurvivalSystem.wallProgress(lv).tier;
  }else{
    g=placeModel(parent,name,c.x,c.z,TILE*.94*scale,rot,heightAt(c.x,c.z),0xffffff,scale*3.4);
    g.traverse(o=>{
      if(o.isMesh&&o.material){
        o.material=o.material.clone();
        o.material.map=null;
        o.material.color.setHex(tint);
        o.material.metalness=metalness;
        o.material.roughness=roughness;
      }
    });
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  if(isSurvivalWall)attachWorldHealthBar(g,g.userData.wallTop-g.position.y+.35,2.9);
  return g;
}

/*  P2-2：程序化资源深度释放。
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
/*  P2-1：静态装饰实例化批处理。
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
      /*  P5：地板砖压暗染色（夜景草地），克隆材质避免污染共享源 */
      let mat=s.mat;
      if(name.startsWith("floor-")){
        mat=s.mat.clone();
        mat.color=new THREE.Color(0x9db77a).multiply(new THREE.Color(0.55,0.62,0.5));
        if(name.includes("stone"))mat.color.set(0x6f7a6e);
        mat.roughness=.95;
      }
      /*  P5c-R7：block-grass 系侧壁去红——colormap 侧面像素是高饱和红棕(R≈0.85,G≈0.35,B≈0.20)，
         旧 R6 用(0.78,0.92,0.80)太亮太淡，乘积后仍是暖橙。
         R7 改用橄榄灰乘数：R 压到 0.58（砍掉 42% 红），G/B 拉到 0.66/0.52（冷绿偏移），
         红棕纹理 × 橄榄灰 ≈ 暗橄榄土，在纯绿世界读作"草块间隙的暗土缝"而非"红圈描边" */
      if(name.startsWith("block-grass")){
        mat=s.mat.clone();
        mat.map=null;mat.color=new THREE.Color(0x4b4b40);
        mat.roughness=1;
      }
      /* P5c-R10：tdkit tile-straight-slope（生存坡道唯一活体橙红源）colormap 实测 avg rgb(135,101,50)，
         几何是完美 1×1 楔形（与地面 tile 同族），故保留几何、仅换色。
         乘数 (0.36,1.45,0.62) 离屏渲染实测 avg rgb(51,144,32)、R 峰值仅 103，
         与平台草地 tile rgb(30,169,78) 同色系，无任何可读作"红条"的残留 */
      if(name==="tile-straight-slope"){
        mat=s.mat.clone();
        mat.color=new THREE.Color(0.36,1.45,0.62);
        mat.roughness=.95;
      }
      /* P5c-R11：tile-rock（生存空地 3% 点缀）colormap 实测 avg rgb(89,131,62) 但 redFrac=0.32，
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
      im.name=name; im.userData.assetName=name;   /* 诊断：批处理实例携带资产名，便于运行时违和点定位 */
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
  if(typeof clearFixedNightLighting==="function")clearFixedNightLighting();
  /* 基地不属于 mapGroup；模式预览/重开时必须显式清理，避免旗台和炮塔残留在场外。 */
  scene.children.filter(object=>object.userData&&object.userData.sceneRole==="base").forEach(object=>{
    _disposeDeep(object);scene.remove(object);
  });
  if(mapGroup){
    _disposeDeep(mapGroup);            /*  P2-2：先深度释放再 remove，防反复重开泄漏显存 */
    scene.remove(mapGroup);
  }
  mapGroup=new THREE.Group(); scene.add(mapGroup);
  /* clone 与 ASSETS 源共享 geometry，只允许 dispose 程序化几何体 */
  tileMeshes.forEach(m=>{if(m)m.traverse(o=>{if(o.isMesh&&o.geometry&&!_sharedGeoms.has(o.geometry))o.geometry.dispose();});});
  tileMeshes.length=0;
  baseGroup=null;autoTurretObj=null;baseAlive=true;
  wallMeta.clear();   //  清空墙等级元数据（生存模式重开一局）
}

function inSurvivalCanyon(x,z){
  const C=ACTIVE_MODE&&ACTIVE_MODE.canyon;
  return !!(C&&x>=C.x0&&x<=C.x1&&z>=C.z0&&z<=C.z1);
}

function placeFixedNightLighting(){
  if(ACTIVE_MODE.key!=="survival")return;
  const ramp=ACTIVE_MODE.ramp,enclosure=ACTIVE_MODE.enclosure,canyon=ACTIVE_MODE.canyon;
  const northRoad=enclosure.z0-2,eastRoad=ramp.col+2;
  /* 路灯只放在低地道路外侧，贴着 1×3 谷口和北缘道路，不得再沿一条假峡谷往外铺。 */
  const anchors=[];
  if(canyon){
    const mouthX=canyon.x1+1,roadZ=canyon.z0;
    anchors.push(
      {x:mouthX+2,z:canyon.z0-2,roadX:mouthX,roadZ,label:"mouth-n"},
      {x:mouthX+2,z:canyon.z0+2,roadX:mouthX,roadZ,label:"mouth-s"},
    );
  }else{
    anchors.push(
      {x:eastRoad+1,z:ramp.row+1,roadX:eastRoad,roadZ:ramp.row,label:"gate-lower"},
      {x:eastRoad+1,z:ramp.row-5,roadX:eastRoad,roadZ:ramp.row-5,label:"east-road"},
      {x:6,z:northRoad-1,roadX:6,roadZ:northRoad,label:"north-road-west"},
      {x:13,z:northRoad-1,roadX:13,roadZ:northRoad,label:"north-road-east"},
    );
  }
  anchors.forEach((anchor)=>{
    if(!inMap(anchor.x,anchor.z))return;
    const point=cellCenter(anchor.x,anchor.z),roadPoint=cellCenter(anchor.roadX,anchor.roadZ),groundY=heightAt(point.x,point.z);
    if(groundY>=PH*.5)return;
    const heading=Math.atan2(roadPoint.x-point.x,roadPoint.z-point.z);
    const post=placeModel(mapGroup,"lightpost-single",point.x,point.z,TILE*.82,heading,groundY,0xffffff,1.6,6.4);
    replaceModelMaterial(post,0x4f5653,{roughness:.72,metalness:.42});
    post.userData.fixedNightLight=anchor.label;
    post.userData.roadTarget={x:roadPoint.x,z:roadPoint.z};
    const pool=new THREE.Mesh(new THREE.CircleGeometry(1.35,24),makeLightPoolMaterial());
    pool.rotation.x=-Math.PI/2;pool.position.set(0,.065,0);pool.renderOrder=3;pool.raycast=()=>{};post.add(pool);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.17,10,8),warmEmissiveMaterial(0xffc56a,2.15));
    bulb.position.set(0,5.15,0);post.add(bulb);
    const light=registerSurvivalPointLight(point.x,groundY+4.8,point.z,1.42,25);
    if(light)light.userData.fixedLight=anchor.label;
    fixedVisionLights.push({x:point.x,z:point.z,radius:SurvivalSystem.VISION_RULES.lampRadius,
      collisionRadius:.72,group:post,label:anchor.label});
  });
  ensureVisionFog();redrawVisionFog();
}

/* ---------------- 城市地图生成 ---------------- */
function genMap(wave){
  clearMap();
  steelHP.clear(); /*  重开一局时清空钢墙耐久表 */
  grid=Array.from({length:GRID},()=>Array(GRID).fill(T_EMPTY));
  rampDir=new Array(GRID*GRID).fill(null);
  terrainSurface=new TerrainSurface({width:GRID,gridSize:TILE,originX:-HALF,originZ:-HALF});
  genMap.applyShell=applyShell;   /*  提前绑定，确保经典/生存提前 return 也可调用 */

  // 边框钢墙
  for(let i=0;i<GRID;i++){grid[0][i]=grid[GRID-1][i]=T_STEEL;grid[i][0]=grid[i][GRID-1]=T_STEEL;}

  // ---- survival 专用地图：左下高台要塞 + 四周不可破岩壁 + 单坡道 + 顶门 ----
  if(ACTIVE_MODE.mapType==="survival"){
    const B=ACTIVE_MODE.base, E=ACTIVE_MODE.enclosure;
    /*  高台要塞（魔兽 RPG 高地防守）：
       内部=T_PLATEAU 台面(高 PH)；四周=T_STEEL 不可破岩壁(阻断流场+高度差攀爬)；
       仅东缘坡口行开 1 格 T_RAMP 陡坡连回地面；台面深处 2×2 T_BASE 大门(可破，朝东)。
       v5.0.1 台面使用稳定削角轮廓，避免逐格噪声制造梳齿、断口和孤立凸柱。 */
    const chamfer=2;
    const plateauAt=(x,z)=>{
      if(x<E.x0||x>E.x1||z<E.z0||z>E.z1)return false;
      const dW=x-E.x0,dE=E.x1-x,dN=z-E.z0,dS=E.z1-z;
      return dW+dN>=chamfer&&dE+dN>=chamfer&&dW+dS>=chamfer&&dE+dS>=chamfer;
    };
    for(let z=E.z0;z<=E.z1;z++)for(let x=E.x0;x<=E.x1;x++){
      if(inSurvivalCanyon(x,z))continue;
      if(plateauAt(x,z)){
        grid[z][x]=T_PLATEAU;
        terrainSurface.setHeight(x,z,PH);
      }
    }
    const RP=ACTIVE_MODE.ramp, RZ=RP.row, rampX=RP.col;
    /* 峡谷切入高台后，坡顶西邻必须仍是台面。 */
    if(inMap(rampX-1,RZ)){
      grid[RZ][rampX-1]=T_PLATEAU;
      terrainSurface.setHeight(rampX-1,RZ,PH);
    }
    const cliffRing=new Set(),cardinal=[[1,0],[-1,0],[0,1],[0,-1]];
    for(let z=E.z0;z<=E.z1;z++)for(let x=E.x0;x<=E.x1;x++){
      if(grid[z][x]!==T_PLATEAU)continue;
      for(const [dx,dz] of cardinal){
        const nx=x+dx,nz=z+dz;
        if(!inMap(nx,nz)||grid[nz][nx]!==T_EMPTY)continue;
        if(inSurvivalCanyon(nx,nz))continue;
        cliffRing.add(idx(nx,nz));
      }
    }
    cliffRing.forEach(cellIndex=>{const x=cellIndex%GRID,z=(cellIndex/GRID)|0;grid[z][x]=T_STEEL;});
    /* 坡口后移到峡谷西端：1×1 陡坡，西高东低。 */
    grid[RZ][rampX]=T_RAMP;
    rampDir[RZ*GRID+rampX]={x:-1,z:0};
    terrainSurface.setRamp(rampX,RZ,{uphillX:-1,uphillZ:0,base:0,rise:PH});
    if(inMap(rampX+1,RZ)){
      grid[RZ][rampX+1]=T_EMPTY;
      terrainSurface.setHeight(rampX+1,RZ,0);
    }
    // 3. 主基地 2×2 T_BASE（唯一失败判定物，台面中央深处）
    for(let z=B.row;z<=B.row+1;z++)for(let x=B.col;x<=B.col+1;x++){
      grid[z][x]=T_BASE; terrainSurface.setHeight(x,z,PH);
    }
    baseShellCells=[]; baseOuterCells=[];
    // 3.5 Kenney 地形装饰（纯视觉）：先铺树（写 grid，走既有渲染），再铺道路/岩石/遗迹（网格保持 T_EMPTY）
    ground.material.color.set(0x959387);
    installNaturalTerrain();
    decorateSurvivalGrid();
    buildMapMeshes();
    buildBase(B.gateCol,B.gateRow);     // 大门模型（survival 走 gate 分支）
    decorateSurvivalPaths();
    decorateSurvivalCliff();         // 高台边缘天然化（纯装饰）
    placeFixedNightLighting();
    // 4. 流场（敌人 BFS 寻路至大门，自动绕开不可破围墙）
    computeFlowField();
    return;

    /* ---- 生存地图装饰：全部纯视觉，不占用碰撞 / 不改流场（T_TREE/道路格均通行） ---- */
    function inEnclosure(x,z){return x>=E.x0&&x<=E.x1&&z>=E.z0&&z<=E.z1;}
    /* 刷怪点→坡道东口 的走廊格，供铺路与避让共用
       东侧刷怪点 L 型直下；西/北刷怪点绕高台北缘 U 型（与流场 BFS 绕崖路线一致） */
    function survivalCorridor(){
      const set=new Set();
      const C=ACTIVE_MODE.canyon, RP=ACTIVE_MODE.ramp;
      if(C){
        for(let z=C.z0;z<=C.z1;z++)for(let x=C.x0;x<=C.x1;x++)if(inMap(x,z))set.add(idx(x,z));
        if(inMap(RP.col+1,RP.row))set.add(idx(RP.col+1,RP.row));
      }
      const spawns=ACTIVE_MODE.spawns||[];
      const gz=RP.row, entryX=C?C.x1:RP.col+1;
      const laneX=entryX+2;
      const north=E.z0-2;
      spawns.forEach(sp=>{
        if(sp.x>laneX){
          for(let z=Math.min(sp.z,gz);z<=Math.max(sp.z,gz);z++)if(inMap(sp.x,z))set.add(idx(sp.x,z));
          for(let x=laneX;x<=sp.x;x++)if(inMap(x,gz))set.add(idx(x,gz));
        }else{
          for(let z=Math.min(sp.z,north);z<=Math.max(sp.z,north);z++)if(inMap(sp.x,z))set.add(idx(sp.x,z));
          for(let x=sp.x;x<=laneX;x++)if(inMap(x,north))set.add(idx(x,north));
          for(let z=north;z<=gz;z++)if(inMap(laneX,z))set.add(idx(laneX,z));
        }
      });
      for(let x=entryX;x<=laneX;x++)if(inMap(x,gz))set.add(idx(x,gz));
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
        const x=RPa.col+1+dx,z=RPa.row+dz;
        if(inMap(x,z))avoid.add(idx(x,z));
      }
      survivalCorridor().forEach(k=>avoid.add(k));
      if(survivalRestoreEnvironment){
        for(const ci of survivalRestoreEnvironment.occupied)avoid.add(ci);
        if(survivalRestoreEnvironment.trees){for(const ci of survivalRestoreEnvironment.trees){const x=ci%GRID,z=Math.floor(ci/GRID);if(inMap(x,z)&&grid[z][x]===T_EMPTY&&!avoid.has(ci))grid[z][x]=T_TREE;}return;}
      }
      const want=Math.round(GRID*.28);
      let placed=0,guard=0;
      while(placed<want&&guard<want*10){
        guard++;
        const x=1+Math.floor(Math.random()*(GRID-2)),z=1+Math.floor(Math.random()*(GRID-2));
        if(grid[z][x]!==T_EMPTY||avoid.has(idx(x,z))||inEnclosure(x,z)||inSurvivalCanyon(x,z))continue;
        grid[z][x]=T_TREE;placed++;
      }
    }
    function decorateSurvivalPaths(){
      const corridor=survivalCorridor();
      const pathCells=[];
      corridor.forEach(k=>{
        const x=k%GRID,z=(k/GRID)|0;
        if(inMap(x,z)&&grid[z][x]===T_EMPTY)pathCells.push(cellCenter(x,z));
      });
      if(pathCells.length){
        const roadCanvas=document.createElement("canvas");roadCanvas.width=roadCanvas.height=64;
        const rc=roadCanvas.getContext("2d"),roadFade=rc.createRadialGradient(32,32,4,32,32,32);
        roadFade.addColorStop(0,"rgba(78,70,58,.96)");roadFade.addColorStop(.72,"rgba(66,59,50,.78)");roadFade.addColorStop(1,"rgba(54,50,44,0)");
        rc.fillStyle=roadFade;rc.fillRect(0,0,64,64);
        rc.globalCompositeOperation='source-atop';
        for(let i=0;i<70;i++){
          const h=((i+7)*2654435761)>>>0,x=h&63,y=(h>>>8)&63,r=1+((h>>>16)&3);
          rc.fillStyle=`rgba(70,61,50,${.08+((h>>>20)&7)*.015})`;rc.fillRect(x,y,r,r);
        }
        const roadTexture=new THREE.CanvasTexture(roadCanvas);roadTexture.colorSpace=THREE.SRGBColorSpace;
        const geometry=new THREE.PlaneGeometry(TILE*1.12,TILE*1.12);
        const material=new THREE.MeshStandardMaterial({color:0xffffff,map:roadTexture,transparent:true,depthWrite:false,roughness:1});
        const pathMesh=new THREE.InstancedMesh(geometry,material,pathCells.length);
        const matrix=new THREE.Matrix4();
        pathCells.forEach((point,index)=>{
          const rampPoint=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row),travel=(point.x-rampPoint.x+TILE*.5)/TILE;
          if(inSurvivalCanyon(cellOf(point.x,point.z).x,cellOf(point.x,point.z).z)){
            const t=Math.max(0,Math.min(1,(travel-1)/1.6)),opening=t*t*(3-2*t);
            point.z+=TILE*(.28*Math.sin(travel*1.3)+.13*Math.sin(travel*2.4))*opening;
          }
          matrix.makeRotationX(-Math.PI/2);matrix.setPosition(point.x,.035,point.z);pathMesh.setMatrixAt(index,matrix);
        });
        pathMesh.userData.assetName="survival-path";
        pathMesh.receiveShadow=true;mapGroup.add(pathMesh);
      }
      /*  P5c：道路砖。证件照审查发现 TD kit 的 tile-straight/crossing 实为「橙红凹坑」
         （塔防修塔坑位），铺在路上就是满地红坑的违和源——全部弃用。
         改用 platformer 的 block-grass-long（2.08×1.08×0.5 长条实心草砖）沿走向铺路，
         与台面/崖壁同族同色，横段竖铺、竖段横铺形成砖缝节奏。y=0.02 微凸区分路面。
         铺路格记入 _roadCells，让 buildMapMeshes 的 T_EMPTY 分支跳过草砖（防 z-fight）。 */
      if(!window._roadCells)window._roadCells=new Set();
      window._roadCells.clear();
      const has=(x,z)=>inMap(x,z)&&corridor.has(idx(x,z));
      /*  P5c-R8：走廊路砖视觉移除——block-grass-long 在纯绿世界里形成"绿墙/围栏"感，
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
      // 荒野点缀：P5c-R8 全部移除——stones=紫灰尚可但 flowers=红花在纯绿世界刺眼，
      // plant/grass 与地面草砖重复。荒野 TD 地面保持干净统一，不做零散点缀。
      // 如需日后恢复，只保留 stones 并压暗颜色。
    }
    /* 高台边缘天然化：台面外圈长出大岩石，外侧贴墙堆碎石，坡道口留白
       —— 纯装饰：不写 grid、不改流场、不影响任何玩法
        P3-1：台面不规则后改为「贴实际轮廓」检测——相邻格是台面/坡道/大门即视为边缘 */
    function decorateSurvivalCliff(){
      /* P5c-R6：rocks 数组已弃用（detail-rocks/rocks-small 为橙红岩，红簇违和源） */
      const isPlat=(x,z)=>inMap(x,z)&&(grid[z][x]===T_PLATEAU||grid[z][x]===T_BASE||grid[z][x]===T_RAMP);
      /*  P5b：台面装饰 platformer-kit 同族。P5c-R7 点名照认脸：rocks/crate/barrel/sign
         均为橙红系全部剔除；台面只留 stones（紫灰石）/flowers（蓝花）/plant/grass */
      const platProps=[];                                   /* R8-final：stones 纹理含红斑，全去掉 */
      const platBig=[];                                      /* R8：去 chest（橙红箱） */
      /* v5.2.0：大型岩堆承担轮廓，断栅栏承担废墟叙事；固定锚点保证每局视觉语义稳定。 */
      const heroDecor=[
        {name:"rocks-large",x:E.x0+2,z:E.z0+2,w:TILE*1.08,color:0x51514d,y:PH},
        {name:"rocks-large",x:E.x1-2,z:E.z1-2,w:TILE*.96,color:0x494b48,y:PH},
        {name:"rocks-small",x:E.x0+4,z:E.z1-1,w:TILE*.72,color:0x555550,y:PH},
        {name:"fence-broken",x:E.x1-4,z:E.z0+1,w:TILE*.72,color:0x5a4a3c,y:PH},
      ];
      heroDecor.forEach((item,index)=>{
        if(!inMap(item.x,item.z)||inSurvivalCanyon(item.x,item.z))return;
        const c=cellCenter(item.x,item.z),object=placeModel(mapGroup,item.name,c.x,c.z,item.w,index*.83,item.y||0,0xffffff,1.8,3.2);
        replaceModelMaterial(object,item.color,{roughness:.98,metalness:0});
      });
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
          /* P5c-R9：platProps 为空时跳过（R8 清空了数组但未加守卫，
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
          /* P5c-R9：platBig 为空时跳过 */
          if(!platBig.length)continue;
          placeModel(mapGroup,platBig[(Math.random()*platBig.length)|0],
            c.x,c.z,TILE*.72,Math.random()*6.28,PH,0xffffff,1.3,1.7);
        }else{
          /* P5c-R9：platProps 为空时跳过 */
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
    /*  防御性兜底：不管地图字符串如何，鹰旗四周恒为可破砖墙（保证可战败） */
    [[ez,ex-1],[ez,ex+1],[ez-1,ex-1],[ez-1,ex],[ez-1,ex+1]].forEach(([z,x])=>{
      if(inMap(x,z)&&grid[z][x]!==T_BASE)grid[z][x]=T_BRICK;
    });
    const bx=ex,bz=ez;
    baseShellCells=[[bz,bx-1],[bz,bx+1],[bz-1,bx-1],[bz-1,bx],[bz-1,bx+1]];
    baseOuterCells=[];
    /*  强制清空玩家出生格（与 spawnPlayer 公式对齐）：避免出生即嵌墙 */
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
      for(let z=z0+2;z<=z1-2;z++)for(let x=x0+2;x<=x1-2;x++){grid[z][x]=T_PLATEAU;terrainSurface.setHeight(x,z,PH);}
      const rz=cz;
      grid[rz][x0]=T_RAMP;   rampDir[rz*GRID+x0]={x: 1,z:0}; terrainSurface.setRamp(x0,rz,{uphillX:1,uphillZ:0,base:0,rise:PH});
      grid[rz][x1]=T_RAMP;   rampDir[rz*GRID+x1]={x:-1,z:0}; terrainSurface.setRamp(x1,rz,{uphillX:-1,uphillZ:0,base:0,rise:PH});
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
        P3-1：拆成逐格基座箱（每格一个 2×2×PH 的方墩，跨格连续成台），
       不规则轮廓下外缘格自然缺块，基座贴合轮廓。基座方块以网格合并去重绘制代价可控：
       用 InstancedMesh 批渲染。 */
    function addPlateauFoundation(){
      const E=ACTIVE_MODE.enclosure;if(!E)return;
      /* P5c-R4：顶面 PH-0.5→PH-0.08（凹缝不再黑洞），但 R5 复盘：土棕 0x8a6b4f 太亮
         成米色网纹更违和——改深土棕（草块柱身同系压暗），缝隙读作"阴影"而非"亮线" */
      const h=PH-.08;
      const cells=[];
      for(let z=E.z0;z<=E.z1;z++)for(let x=E.x0;x<=E.x1;x++){
        const t=grid[z][x];
        if(t!==T_PLATEAU&&t!==T_BASE)continue;
        cells.push(cellCenter(x,z));
      }
      const geo=new THREE.BoxGeometry(TILE,h,TILE);
      const soil=new THREE.MeshStandardMaterial({color:0x3e372e,roughness:1});
      const plateauTexture=makeSurvivalPlateauTexture();
      const grass=new THREE.MeshStandardMaterial({color:0x8f8c82,map:plateauTexture,roughness:.96,metalness:0});
      const im=new THREE.InstancedMesh(geo,[soil,soil,grass,soil,soil,soil],cells.length);
      const M=new THREE.Matrix4();
      cells.forEach((c,i)=>{
        M.makeTranslation(c.x,h/2,c.z);
        im.setMatrixAt(i,M);
      });
      im.receiveShadow=true;
      im.userData.assetName="ash-plateau-foundation";
      im.userData.surfaceVariations=4;
      mapGroup.add(im);

      /* 质感只附着现有 T_PLATEAU/T_BASE 承重格；禁止再创建跨格顶层几何，
         否则会改变原高台轮廓并盖住唯一 1×1 坡道。 */
    }
    /* v5.0.0：生存平地统一使用 platformer 大草块。模型厚度全部埋在 TerrainSurface
       承重面以下，地面不再混入 tdkit 的塔防槽、凸丘或自带树木。 */
    function addGroundFloorTile(c,x,z){
      const h=((x*73856093)^(z*19349663))>>>0;          // 格子坐标哈希（确定性伪随机）
      const name="block-grass-large";
      const src=ASSETS[name];
      if(!src)return;
      _tmpBox.setFromObject(src);_tmpBox.getSize(_tmpSize);
      const s=TILE*1.02/Math.max(.01,Math.max(_tmpSize.x,_tmpSize.z));
      const rot=(((h>>3)%4)|0)*Math.PI/2;
      const surfaceY=heightAt(c.x,c.z);
      const originY=terrainSurface.visualOriginY({boundsMaxY:_tmpBox.max.y,scale:s,surfaceY});
      const M=_mT(c.x,originY,c.z).multiply(_mR(rot)).multiply(_mS(s,s,s));
      _batchCollect(name,M);
    }
    if(ACTIVE_MODE.mapType==="survival")mapGroup.add(makeNaturalPlateauMesh());
    function addCanyonWallVisuals(){
      const C=ACTIVE_MODE.canyon;if(!C)return;
      const cells=[];
      for(let z=C.z0-1;z<=C.z1+1;z++)for(let x=C.x0;x<=C.x1;x++){
        if(!inMap(x,z)||grid[z][x]!==T_STEEL)continue;
        const beside=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>inMap(x+dx,z+dz)&&inSurvivalCanyon(x+dx,z+dz));
        if(beside)cells.push(cellCenter(x,z));
      }
      if(!cells.length)return;
      const h=PH+.2,geo=new THREE.BoxGeometry(TILE*.98,h,TILE*.98);
      const mat=new THREE.MeshStandardMaterial({color:0x3a362f,roughness:.98,metalness:0});
      const im=new THREE.InstancedMesh(geo,mat,cells.length),M=new THREE.Matrix4();
      cells.forEach((point,index)=>{M.makeTranslation(point.x,h/2,point.z);im.setMatrixAt(index,M);});
      im.castShadow=true;im.receiveShadow=true;im.userData.assetName="canyon-wall";mapGroup.add(im);
    }

    for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++){
      const t=grid[z][x],c=cellCenter(x,z);
      switch(t){
        case T_EMPTY:
          break;
        case T_BRICK:
          tileMeshes[idx(x,z)]=buildWallTile(mapGroup,x,z,false);
          mapGroup.add(tileMeshes[idx(x,z)]);
          break;
        case T_STEEL:{
          /* 生存高台阻挡环只负责碰撞/寻路；视觉由连续土石基座侧壁承担。 */
          if(ACTIVE_MODE.mapType==="survival"){ /* 不渲染圆角草块 */ }
          else{ const g=buildWallTile(mapGroup,x,z,true); mapGroup.add(g); }
          break;}
        case T_WATER:{
          const m=new THREE.Mesh(new THREE.PlaneGeometry(TILE,TILE),matWater);
          m.rotation.x=-Math.PI/2;m.position.set(c.x,.1,c.z);
          mapGroup.add(m);break;}
        case T_TREE:{
          const names=["tree-pine-small","tree-pine","tree"];
          /* P5c-R9：树去红去黑——Kenney nature 包树材质底色为 #e18357（橙棕），
             在纯绿世界显红。旧方案 0x2e5d2e 深绿乘法→纯黑；0xffffff 不染→橙红。
             新方案：placeModel 先不放色，返回后遍历覆盖材质为森林绿系。 */
          const inst=placeModel(mapGroup,names[(Math.random()*names.length)|0],
            c.x,c.z,TILE*.92,Math.random()*6.28,0,0xffffff,3.4,6.5);
          if(inst)inst.traverse(o=>{
            if(!o.isMesh||!o.material)return;
            o.material=o.material.clone();
            /* 灰烬荒原：树干与叶簇统一压成低饱和枯木色，不再出现鲜绿森林。 */
            const b=o.material.color.r*0.299+o.material.color.g*0.587+o.material.color.b*0.114;
            o.material.map=null;o.material.color.setHex(b>0.5?0x4b5044:0x3b342d);
            o.material.roughness=.96;
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
          if(ACTIVE_MODE.mapType!=="survival")addCliffRock(c);
          break;
        case T_RAMP:{
          const ci=z*GRID+x,d=rampDir[ci],sl=terrainSurface.ramps[ci]||{};
          const base=sl.base||0,step=(sl.step!==undefined)?sl.step:PH;
          /* v5.0.1：生存坡道严格占一个逻辑格，使用原生比例接近 1×1 的 steep 变体。 */
          if(ACTIVE_MODE.mapType==="survival"){
            break; // 生存坡面已包含在连续高程网格内。
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
          break;
      }
    }
    function isStreetCol(x){return streets.includes(x);}
    function isStreetRow(z){return streets.includes(z);}

    // ---- 街边小道具（纯装饰不阻挡；经典 13×13 小图少放，避免杂乱）----
    // P5c-R8：survival 模式不放城市工业道具（dumpster/traffic-light 等 colormap 含橙红，
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

    _batchFlush(mapGroup);   /*  P2-1：批量实例化收尾（铺板/崖壁 → 个位数 draw call） */
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
  if(fixed){toast(" 工程班修复了基地围墙 ×"+fixed);sfx.pickup();}
}

/* ---------------- 基地 ---------------- */
function buildBase(cx,cz){
  const c=cellCenter(cx,cz);
  baseGroup=new THREE.Group();
  baseGroup.userData.sceneRole="base";
  /* 生存模式：2×2 指挥基地，正门朝默认镜头下方（+Z）。 */
  if(ACTIVE_MODE.key==="survival"){
    const c2=cellCenter(cx+.5,cz+.5);                     // 2×2 基地几何中心
    const core=makeBuildingModel("base");baseGroup.add(core);
    /*  兼容附件（护盾隐藏 / 星旋转 / autoturret 占位不发射） */
    const star=new THREE.Mesh(new THREE.OctahedronGeometry(.5),
      new THREE.MeshStandardMaterial({color:0x83b8dc,emissive:0x183f62,emissiveIntensity:.85}));
    star.position.set(0,6.15,0);star.visible=false;baseGroup.add(star);
    const shield=new THREE.Mesh(new THREE.SphereGeometry(4.6,20,14),
      new THREE.MeshBasicMaterial({color:0x4da3ff,transparent:true,opacity:.16,
        blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    shield.position.y=1.8;shield.name="shield";shield.visible=false;baseGroup.add(shield);
    const tur=new THREE.Group();tur.name="autoturret";tur.visible=false;baseGroup.add(tur);
    autoTurretObj=tur;
    baseGroup.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    baseGroup.userData.workerEntrance=core.userData.workerEntrance;
    const doorLocalPoint=new THREE.Vector3(0,0,2.7);
    baseGroup.position.set(c2.x,heightAt(c2.x,c2.z),c2.z); // 贴台面顶
    baseGroup.userData.gateCollider={localPoint:doorLocalPoint,radius:GATE_MODEL_COLLISION_RADIUS};
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
function mergeDirectMeshesByMaterial(root){
  const meshes=root.children.filter(child=>child.isMesh);
  if(meshes.length<2)return;
  const groups=new Map();
  for(const mesh of meshes){
    mesh.updateMatrix();
    const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    const key=mesh.material.uuid;
    if(!groups.has(key))groups.set(key,{material:mesh.material,positions:[],normals:[]});
    const target=groups.get(key),positions=geometry.attributes.position.array,normals=geometry.attributes.normal&&geometry.attributes.normal.array;
    for(let i=0;i<positions.length;i++)target.positions.push(positions[i]);
    if(normals)for(let i=0;i<normals.length;i++)target.normals.push(normals[i]);
    geometry.dispose();root.remove(mesh);mesh.geometry.dispose();
  }
  for(const group of groups.values()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(group.positions,3));
    if(group.normals.length===group.positions.length)geometry.setAttribute("normal",new THREE.Float32BufferAttribute(group.normals,3));
    else geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,group.material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.mergedTankPart=true;root.add(mesh);
  }
}
function makeTank(bodyColor,turretColor,scale=1,weapon='tank'){
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
  if(ACTIVE_MODE.key==="survival"){
    const trim=M(0xc9c3a3,.8,.12);
    for(const side of [-1,1]){
      const marking=new THREE.Mesh(new THREE.BoxGeometry(.09,.025,.72),trim);
      marking.position.set(side*.58,.57,-.35);turret.add(marking);
      const headlamp=new THREE.Mesh(new THREE.BoxGeometry(.22,.14,.06),darkMat);
      headlamp.position.set(side*.58,1.28,-1.57);g.add(headlamp);
      for(let i=0;i<12;i++){
        const tread=new THREE.Mesh(new THREE.BoxGeometry(.69,.06,.12),wheelMat);tread.position.set(side*1.06,.83,-1.57+i*.285);g.add(tread);
      }
      for(let i=0;i<3;i++){
        const panel=new THREE.Mesh(chamferedBox(.12,.42,.82),bodyMat);panel.position.set(side*1.46,.69,-.95+i*.94);g.add(panel);
      }
    }
    for(let i=0;i<7;i++){
      const vent=new THREE.Mesh(new THREE.BoxGeometry(.9,.045,.05),trackMat);vent.position.set(0,1.44,.82+i*.095);g.add(vent);
    }
    if(weapon==='light'){
      barrel.scale.set(1.8,.68,1.8);barrel.position.z=-1.58;muzzle.position.z=-2.22;muzzle.scale.set(1.9,1,1.9);
    }else if(weapon==='medium'){
      for(const side of [-1,1]){const fuel=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,1.02,12),darkMat);fuel.rotation.x=Math.PI/2;fuel.position.set(side*.84,1.42,1.05);g.add(fuel);}
    }else if(weapon==='heavy'){
      barrel.scale.set(2.3,.75,2.3);barrel.position.z=-1.65;muzzle.position.z=-2.43;muzzle.scale.set(2.5,1.2,2.5);
    }
  }
  turret.position.y=1.5;g.add(turret);
  mergeDirectMeshesByMaterial(turret);
  mergeDirectMeshesByMaterial(g);
  const muzzleMarker=new THREE.Object3D();muzzleMarker.position.set(0,.3,weapon==='light'?-2.45:weapon==='heavy'?-2.7:-3.1);turret.add(muzzleMarker);turret.userData.muzzleMarker=muzzleMarker;
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  g.scale.setScalar(scale);
  g.userData.turret=turret;
  g.userData.originalTank=true;
  return g;
}
/* 生存模式批量部队使用低绘制坦克：保留车体、履带、炮塔和炮管轮廓，将单车 Mesh 数压至 6。 */
function makeRtsTank(bodyColor,turretColor,scale=1){
  const material=(color,roughness,metalness)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const group=new THREE.Group(),bodyMat=material(bodyColor,.62,.38),trackMat=material(0x1f2528,.78,.18),turretMat=material(turretColor,.48,.42);
  const addBox=(w,h,d,x,y,z,material,parent=group)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
  };
  addBox(2.5,.68,3.5,0,.78,0,bodyMat);
  addBox(.42,.58,3.75,-1.38,.58,0,trackMat);addBox(.42,.58,3.75,1.38,.58,0,trackMat);
  const turret=new THREE.Group();turret.position.y=1.28;group.add(turret);
  addBox(1.65,.62,1.85,0,.3,-.15,turretMat,turret);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,2.45,8),turretMat);
  barrel.rotation.x=Math.PI/2;barrel.position.set(0,.35,-1.85);barrel.castShadow=true;turret.add(barrel);
  const hatch=new THREE.Mesh(new THREE.CylinderGeometry(.35,.42,.18,10),trackMat);hatch.position.set(0,.7,0);turret.add(hatch);
  const headlight=new THREE.Mesh(new THREE.BoxGeometry(1.15,.16,.08),warmEmissiveMaterial(0xffd08a,1.65));
  headlight.position.set(0,.84,-1.79);headlight.userData.nightGlow=true;group.add(headlight);
  group.scale.setScalar(scale);group.userData.turret=turret;group.userData.rtsTank=true;
  return group;
}

/* ---------------- 实体 ---------------- */
let player=null;
const enemies=[],bullets=[],particles=[],powerups=[],lightningBeams=[],corpseDecals=[];
let _enemySerial=0,_friendlySerial=0;
/*  玩家构筑物：波间商店布置的炮台与地雷（跨波次持续存在） */
const builtTurrets=[],builtMines=[],goldMines=[],researchInstitutes=[],heroHubs=[],heavyFactories=[],friendlyUnits=[],builtHouses=[],visionBeacons=[];
/* 兼容旧存档字段；v6.16.0 起重工厂按人口生产多辆坦克。 */
let heroTank=null;
let navigationStamp=0,friendlyRouteComputeCount=0,friendlyFlowCache={key:"",field:null},_animFrame=0;
let _stepCache=null,_stepW=0,_stepStamp=-1,_corpseShared=null;
const mineIncomePopups=[];
const fixedVisionLights=[],survivalDynamicLights=[],visionFogSurfaces=[],medicalHealingLinks=[],bloodMistSurfaces=[];
const gameplayCollisionStats={overlaps:0,minimumClearance:0,blockedFrames:0};
let _visionFogTimer=0;
let _visionSourceCache=[];
const structCells=new Set();   // 生存：所有已放置构筑物（墙/炮塔/住房/科技塔/金矿）占用的格子 idx
let camShake=0;
/*  生存 RTS 自由镜头：焦点（lookAt 中心）+ 高度/后撤距离，WASD/方向键平移、滚轮缩放 */
const camFocus=new THREE.Vector3(0,0,0);
let camHeight=66,camBack=54;

function warmEmissiveMaterial(color=SurvivalSystem.NIGHT_VISUALS.lampColor,intensity=1.8){
  return new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.28,metalness:.12});
}
function makeLightPoolMaterial(){
  const canvas=document.createElement("canvas");canvas.width=canvas.height=96;
  const context=canvas.getContext("2d"),gradient=context.createRadialGradient(48,48,2,48,48,47);
  gradient.addColorStop(0,"rgba(255,199,112,.28)");gradient.addColorStop(.35,"rgba(231,158,66,.16)");gradient.addColorStop(.72,"rgba(176,105,34,.055)");gradient.addColorStop(1,"rgba(120,70,25,0)");
  context.fillStyle=gradient;context.fillRect(0,0,96,96);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
}
function addWarmWindow(parent,x,y,z,sx=.5,sy=.45,sz=.08,color=0xd98b38){
  const windowMesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),warmEmissiveMaterial(color,.82));
  windowMesh.position.set(x,y,z);windowMesh.userData.nightGlow=true;parent.add(windowMesh);return windowMesh;
}
// Keep the shader's point-light count fixed. Adding/removing a lamp used to
// recompile every lit material mid-battle, causing a 0.5 s completion stall.
const survivalLightPool=[];
function ensureSurvivalLightPool(){
  if(survivalLightPool.length)return;
  for(let i=0;i<SurvivalSystem.NIGHT_VISUALS.maxDynamicLights;i++){
    const light=new THREE.PointLight(SurvivalSystem.NIGHT_VISUALS.lampColor,0,24,2);
    light.castShadow=false;light.userData.survivalLight=true;light.userData.allocated=false;
    scene.add(light);survivalLightPool.push(light);
  }
}
function registerSurvivalPointLight(x,y,z,intensity=1.15,distance=24){
  if(ACTIVE_MODE.key!=="survival"||survivalDynamicLights.length>=SurvivalSystem.NIGHT_VISUALS.maxDynamicLights)return null;
  ensureSurvivalLightPool();
  const light=survivalLightPool.find(item=>!item.userData.allocated);if(!light)return null;
  light.userData.allocated=true;light.intensity=intensity;light.distance=distance;light.position.set(x,y,z);
  survivalDynamicLights.push(light);return light;
}
function removeSurvivalPointLight(light){
  if(!light)return;
  light.intensity=0;light.userData.allocated=false;delete light.userData.beaconLight;delete light.userData.fixedLight;
  const index=survivalDynamicLights.indexOf(light);if(index>=0)survivalDynamicLights.splice(index,1);
}
function clearFixedNightLighting(){
  fixedVisionLights.length=0;
  _visionSourceCache=[];_visionFogTimer=0;
  survivalDynamicLights.slice().forEach((light)=>{
    if(!light.userData.beaconLight)removeSurvivalPointLight(light);
  });
  visionFogSurfaces.splice(0).forEach((surface)=>{
    scene.remove(surface.mesh);surface.mesh.geometry.dispose();surface.material.dispose();surface.texture.dispose();
    if(surface.canvas.parentNode)surface.canvas.parentNode.removeChild(surface.canvas);
  });
  bloodMistSurfaces.splice(0).forEach((surface)=>{
    scene.remove(surface.mesh);surface.mesh.geometry.dispose();surface.material.dispose();surface.texture.dispose();
  });
}

function createBloodMistSurface({width,depth,x=0,z=0,y=.16,seed=1}){
  const canvas=document.createElement("canvas");canvas.width=canvas.height=256;
  let randomState=(seed>>>0)||1;
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const context=canvas.getContext("2d");
  context.clearRect(0,0,256,256);
  for(let index=0;index<72;index++){
    const px=random()*256,pz=random()*256,radius=10+random()*34;
    const gradient=context.createRadialGradient(px,pz,0,px,pz,radius);
    gradient.addColorStop(0,`rgba(${74+Math.floor(random()*32)},5,8,${.11+random()*.12})`);
    gradient.addColorStop(.55,"rgba(66,4,7,.055)");gradient.addColorStop(1,"rgba(38,2,5,0)");
    context.fillStyle=gradient;context.beginPath();context.arc(px,pz,radius,0,Math.PI*2);context.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1,width/64),Math.max(1,depth/64));texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,color:0x6b1016,transparent:true,opacity:0,
    depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.NormalBlending});
  const conform=y>PH&&terrainSurface?.natural;
  const mesh=new THREE.Mesh(conform?naturalOverlayGeometry(.13):new THREE.PlaneGeometry(width,depth),material);
  if(!conform){mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);}
  mesh.userData.conformsTerrain=!!conform;mesh.renderOrder=3;mesh.userData.bloodMist=true;scene.add(mesh);
  const surface={mesh,material,texture,targetOpacity:0,drift:(seed%7+2)*.0007};bloodMistSurfaces.push(surface);return surface;
}
function ensureBloodMist(){
  if(ACTIVE_MODE.key!=="survival"||bloodMistSurfaces.length)return;
  createBloodMistSurface({width:GRID*TILE,depth:GRID*TILE,y:.12,seed:197});
  const enclosure=ACTIVE_MODE.enclosure;
  if(enclosure){
    const width=(enclosure.x1-enclosure.x0+1)*TILE,depth=(enclosure.z1-enclosure.z0+1)*TILE;
    const a=cellCenter(enclosure.x0,enclosure.z0),b=cellCenter(enclosure.x1,enclosure.z1);
    createBloodMistSurface({width:GRID*TILE,depth:GRID*TILE,y:PH+.13,seed:431});
  }
}
function updateBloodMist(dt){
  if(ACTIVE_MODE.key!=="survival")return;
  ensureBloodMist();
  const visible=enemies.filter((enemy)=>enemy.alive&&enemy.group.visible).length;
  const target=SurvivalSystem.bloodMistOpacity(game.wave,visible);
  bloodMistSurfaces.forEach((surface,index)=>{
    surface.targetOpacity=target*(index?0.72:1);
    surface.material.opacity+=(surface.targetOpacity-surface.material.opacity)*Math.min(1,dt*.75);
    surface.texture.offset.x=(surface.texture.offset.x+dt*surface.drift)%1;
    surface.texture.offset.y=(surface.texture.offset.y+dt*surface.drift*.63)%1;
  });
}
function createVisionFogSurface({id,width,depth,x=0,z=0,y=.09}){
  const size=SurvivalSystem.VISION_RULES.fogTextureSize,canvas=document.createElement("canvas");
  canvas.width=canvas.height=size;canvas.id=id;canvas.style.display="none";document.body.appendChild(canvas);
  const texture=new THREE.CanvasTexture(canvas);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true,toneMapped:false});
  const conform=y>PH&&terrainSurface?.natural;
  const mesh=new THREE.Mesh(conform?naturalOverlayGeometry(.085):new THREE.PlaneGeometry(width,depth),material);
  if(!conform){mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);}
  mesh.userData.conformsTerrain=!!conform;
  mesh.renderOrder=4;mesh.userData.visionFog=true;scene.add(mesh);
  const surface={canvas,context:canvas.getContext("2d"),texture,material,mesh,width,depth,x,z};visionFogSurfaces.push(surface);return surface;
}
function ensureVisionFog(){
  if(ACTIVE_MODE.key!=="survival"||visionFogSurfaces.length)return;
  createVisionFogSurface({id:"survivalFogCanvas",width:GRID*TILE,depth:GRID*TILE,y:.075});
  const enclosure=ACTIVE_MODE.enclosure;
  if(enclosure){
    const width=(enclosure.x1-enclosure.x0+1)*TILE,depth=(enclosure.z1-enclosure.z0+1)*TILE;
    const a=cellCenter(enclosure.x0,enclosure.z0),b=cellCenter(enclosure.x1,enclosure.z1);
    createVisionFogSurface({id:"survivalFogPlateauCanvas",width:GRID*TILE,depth:GRID*TILE,y:PH+.085});
  }
}
function currentVisionSources(){
  if(ACTIVE_MODE.key!=="survival")return [];
  const rules=SurvivalSystem.VISION_RULES,sources=[];
  const add=(object,radius)=>{if(object&&object.position)sources.push({x:object.position.x,z:object.position.z,radius});};
  if(baseAlive&&baseGroup)add(baseGroup,rules.baseRadius);
  fixedVisionLights.forEach((source)=>sources.push({x:source.x,z:source.z,radius:source.radius}));
  visionBeacons.forEach((beacon)=>add(beacon.group,medicalBeaconVisionRadius(beacon)));
  builtTurrets.forEach((turret)=>add(turret.group,rules.turretRadius));
  heroHubs.forEach((building)=>add(building.group,22));researchInstitutes.forEach((building)=>add(building.group,22));heavyFactories.forEach((building)=>add(building.group,24));
  goldMines.forEach((building)=>add(building.group,14));builtHouses.forEach((building)=>add(building.group,14));
  friendlyUnits.forEach((unit)=>{
    const key=unit.type==="light"?"lightTankRadius":unit.type==="medium"?"mediumTankRadius":unit.type==="heavy"?"heavyTankRadius":"repairRadius";
    if(unit.alive)add(unit.group,rules[key]);
  });
  if(player&&player.alive)add(player.group,rules.mediumTankRadius);
  return sources;
}
function medicalBeaconLevel(beacon){
  return Math.max(1,Math.min(SurvivalSystem.MEDICAL_BEACON_RULES.visionRadius.length,Math.round(beacon&&beacon.level||1)));
}
function medicalBeaconVisionRadius(beacon){return SurvivalSystem.MEDICAL_BEACON_RULES.visionRadius[medicalBeaconLevel(beacon)-1];}
function medicalBeaconRepairRadius(beacon){return SurvivalSystem.MEDICAL_BEACON_RULES.repairRadius[medicalBeaconLevel(beacon)-1];}
function medicalBeaconRepairPercentPerSecond(beacon){return SurvivalSystem.MEDICAL_BEACON_RULES.repairPercentPerSecond[medicalBeaconLevel(beacon)-1];}
function medicalBeaconUpgradeCost(beacon){
  return SurvivalSystem.MEDICAL_BEACON_RULES.upgradeCosts[medicalBeaconLevel(beacon)-1]??null;
}
function applyMedicalBeaconVisual(beacon){
  if(!beacon||!beacon.group)return;
  const level=medicalBeaconLevel(beacon),growth=level-1;
  if(beacon.lantern){
    beacon.lantern.scale.setScalar(1+growth*.09);
    if(beacon.lantern.material)beacon.lantern.material.emissiveIntensity=2.25+growth*.42;
  }
  if(beacon.pool)beacon.pool.scale.setScalar(1+growth*.07);
  if(beacon.light){beacon.light.intensity=1.18+growth*.12;beacon.light.distance=medicalBeaconVisionRadius(beacon)*.64;}
  beacon.group.userData.medicalBeaconLevel=level;
}
function upgradeMedicalBeacon(beacon){
  if(!beacon||!visionBeacons.includes(beacon))return false;
  const owner=upgradeOwner('beacon',beacon),target=nextProjectTargetLevel('beacon','',owner,medicalBeaconLevel(beacon),5);
  if(target==null){toast(" 医疗灯塔升级队列已满");return false;}
  /* P2 §6.2: price by target — upgradeCosts index is from-level-1 = target-2. */
  const cost=paidUpgradeCost(SurvivalSystem.MEDICAL_BEACON_RULES.upgradeCosts[target-2]??null);
  if(cost==null){toast(" 医疗灯塔已达 Lv5");return false;}
  if(game.gold<cost){toast(` 升级需要 ${cost} 金币`);return false;}
  if(deferUpgrade('beacon','',owner,cost,target-1,target))return true;
  game.gold-=cost;beacon.level=medicalBeaconLevel(beacon)+1;
  applyMedicalBeaconVisual(beacon);updateGoldUI();queueVisionFogRedraw();sfx.levelup();
  toast(` 医疗灯塔升至 Lv${beacon.level}`);wc3RenderSel();renderCmdCard();return true;
}
function hideMedicalHealingLinks(kind){
  for(const link of medicalHealingLinks)if(link.userData.healerKind===kind)link.visible=false;
}
/* 灯塔与医疗车共用有界射线池，顶点缓冲只创建一次。 */
function showMedicalHealingLink(source,target,kind){
  let link=medicalHealingLinks.find(item=>!item.visible);
  if(!link){
    if(medicalHealingLinks.length>=64)return;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(9,3));
    link=new THREE.Line(geometry,new THREE.LineBasicMaterial({
      color:0xf2e7cf,transparent:true,opacity:.58,depthWrite:false,blending:THREE.AdditiveBlending,
    }));
    link.userData.medicalHealingLink=true;link.renderOrder=8;link.frustumCulled=false;
    scene.add(link);medicalHealingLinks.push(link);
  }
  const start=source.group.position,end=target.group?.position||target;
  const startY=start.y+(kind==='beacon'?4.3:1.55);
  const endY=(Number.isFinite(end.y)?end.y:heightAt(end.x,end.z))+(target.type?1.1:2.35);
  const phase=performance.now()*.006+source.group.id;
  const positions=link.geometry.attributes.position;
  positions.setXYZ(0,start.x,startY,start.z);
  positions.setXYZ(1,(start.x+end.x)/2,(startY+endY)/2+.35+Math.sin(phase)*.12,(start.z+end.z)/2);
  positions.setXYZ(2,end.x,endY,end.z);positions.needsUpdate=true;
  link.userData.healerKind=kind;link.material.opacity=.48+.12*Math.sin(phase);link.visible=true;
}
function updateMedicalBeacons(dt){
  hideMedicalHealingLinks('beacon');
  if(ACTIVE_MODE.key!=="survival"||!visionBeacons.length||dt<=0)return;
  const cap=SurvivalSystem.MEDICAL_BEACON_RULES.maxStackedRepairPercentPerSecond;
  function heal(target,current,max,set){
    if(!(current>0&&max>current))return;
    const position=target.group?.position||target;let rate=0;
    for(const beacon of visionBeacons){if(beacon.hp<=0||!beacon.group?.parent)continue;const radius=medicalBeaconRepairRadius(beacon);if(Math.hypot(position.x-beacon.group.position.x,position.z-beacon.group.position.z)>radius)continue;rate+=medicalBeaconRepairPercentPerSecond(beacon);showMedicalHealingLink(beacon,target,'beacon');}
    if(rate)set(Math.min(max,current+max*Math.min(cap,rate)*dt));
  }
  for(const [ci,meta] of wallMeta){const x=ci%GRID,z=Math.floor(ci/GRID);if(grid[z]?.[x]===T_STEEL)heal(cellCenter(x,z),steelHP.get(ci)||0,wallMaxHp(meta.lv),hp=>{steelHP.set(ci,hp);meta.hp=hp;});}
  for(const target of new Set([...friendlyUnits,...builtTurrets,...goldMines,...builtHouses,...heroHubs,...heavyFactories,...researchInstitutes,...visionBeacons])){
    if(target.alive===false||!target.group?.parent)continue;heal(target,target.hp,target.maxHp,hp=>target.hp=hp);
  }
  for(const job of constructionJobs){if(job.phase==='returning'||!job.site)continue;heal({group:job.site},job.hp,job.maxHp,hp=>job.hp=hp);}
  if(baseAlive&&baseGroup)heal({group:baseGroup},game.gateHp,game.gateMaxHp,hp=>{game.gateHp=hp;updateHpUI();});
}

function isPositionVisible(position){
  if(ACTIVE_MODE.key!=="survival")return true;
  return SurvivalSystem.isPointVisible(position,_visionSourceCache.length?_visionSourceCache:currentVisionSources());
}
function redrawVisionFog(){
  if(ACTIVE_MODE.key!=="survival")return;
  ensureVisionFog();
  const sources=currentVisionSources(),opacity=SurvivalSystem.NIGHT_VISUALS.fogOpacity;_visionSourceCache=sources;
  visionFogSurfaces.forEach((surface)=>{
    const {context,width,depth,canvas}=surface,size=canvas.width;
    context.globalCompositeOperation="source-over";context.clearRect(0,0,size,size);
    context.fillStyle=`rgba(4,7,12,${opacity})`;context.fillRect(0,0,size,size);
    context.globalCompositeOperation="destination-out";
    sources.forEach((source)=>{
      const px=((source.x-(surface.x-width/2))/width)*size,pz=((source.z-(surface.z-depth/2))/depth)*size;
      const radius=source.radius/Math.max(width,depth)*size;
      if(px+radius<0||pz+radius<0||px-radius>size||pz-radius>size)return;
      const gradient=context.createRadialGradient(px,pz,radius*.48,px,pz,radius);
      gradient.addColorStop(0,"rgba(0,0,0,1)");gradient.addColorStop(.72,"rgba(0,0,0,.94)");gradient.addColorStop(1,"rgba(0,0,0,0)");
      context.fillStyle=gradient;context.beginPath();context.arc(px,pz,radius,0,Math.PI*2);context.fill();
    });
    context.globalCompositeOperation="source-over";surface.texture.needsUpdate=true;
  });
  enemies.forEach((enemy)=>{if(enemy.alive)enemy.group.visible=isPositionVisible(enemy.group.position);});
}
let _visionFogRedrawQueued=false;
function queueVisionFogRedraw(){
  if(_visionFogRedrawQueued)return;
  _visionFogRedrawQueued=true;
  const run=()=>{_visionFogRedrawQueued=false;redrawVisionFog();};
  if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:180});else setTimeout(run,0);
}
function updateVisionSystem(dt){
  if(ACTIVE_MODE.key!=="survival")return;
  _visionFogTimer-=dt;if(_visionFogTimer>0)return;_visionFogTimer=.12;redrawVisionFog();
}

const game={
  score:0,lives:3,wave:0,enemiesToSpawn:0,spawnTimer:0,waveTransition:null,
  upgrades:{},
  stats:{dmg:1,fireRate:1,moveSpeed:1,bulletSpeed:1,multishot:0,pierce:0,
    blastRadius:0,magnet:false,luckyLv:0,armorMax:5,
    critChance:0,vampLv:0,regenLv:0,
    baseWallLv:0,baseRepairLv:0,autoTurretLv:0,baseShieldMax:0,airstrikeLv:0,overloadLv:0},
  buffs:{shieldUntil:0,rapidUntil:0},
  bombs:0,respawnTimer:0,baseShieldHP:0,buildTimer:0,
  tech:{},breakthroughs:{mining:0,science:0,wall:0,turret:0},researchTier:0,legacyDefense:0,gateHp:0,gateMaxHp:0,gateHpLv:0,gateArmorLv:0,gateThornsLv:0,gateRegenLv:0,gateDodgeLv:0,
  popUsed:0,popMax:12,prepTime:0,
};
const SURVIVAL_SAVE_KEY="tank3d-survival-save-v1";
function saveSurvivalSnapshot(){
  if(ACTIVE_MODE.key!=="survival")return false;
  try{
    const structures={
      walls:[...wallMeta].map(([cell,meta])=>({x:cell%GRID,z:Math.floor(cell/GRID),lv:meta.lv,hp:steelHP.get(cell)||meta.hp||0})),
      mines:goldMines.map((m)=>({x:m.x,z:m.z,level:m.level,hp:m.hp,maxHp:m.maxHp})),
      turrets:builtTurrets.map((t)=>({x:t.cx,z:t.cz,turretKey:t.turretKey,level:t.level,hp:t.hp,maxHp:t.maxHp})),
      houses:builtHouses.map((h)=>({x:h.x,z:h.z,level:h.level,popProvided:h.popProvided,hp:h.hp,maxHp:h.maxHp})),
      heroHubs:heroHubs.map(h=>({x:h.x,z:h.z,hp:h.hp})),
      research:researchInstitutes.map((r)=>({x:r.x,z:r.z,hp:r.hp,maxHp:r.maxHp})),
      factories:heavyFactories.map((f)=>({x:f.x,z:f.z,hp:f.hp,maxHp:f.maxHp,rally:f.rally,progress:f.progress,autoType:f.autoType||null,queue:(f.queue||[]).map((q)=>({typeId:q.typeId,remaining:q.remaining,total:q.total,paidCost:q.paidCost,deployment:q.deployment||null}))})),
      beacons:visionBeacons.map((b)=>({x:b.x,z:b.z,level:b.level,hp:b.hp,maxHp:b.maxHp})),
      units:friendlyUnits.filter((u)=>u.alive).map((u)=>({type:u.type,repairBranch:u.repairBranch||null,heroTank:!!u.heroTank,x:u.group.position.x,z:u.group.position.z,hp:u.hp,maxHp:u.maxHp,moveTarget:u.moveTarget,command:u.command})),
    };
    const snapshot={legacyDefense:game.legacyDefense||0,terrainTrees:grid.flatMap((row,z)=>row.flatMap((t,x)=>t===T_TREE?[idx(x,z)]:[])),upgradeJobs:game.upgradeJobs||[],hero:heroArchive(),doctrine:game.doctrine||null,doctrineTech:game.doctrineTech||{},endless:!!game.endless,overflowPressure:game.overflowPressure||0,version:GAME_VERSION,naturalTerrainVersion:2,terrainPads:terrainSurface.natural?.supportPads||[],savedAt:Date.now(),mode:"survival",structures,construction:serializeConstruction(),baseLayout:{...ACTIVE_MODE.base},game:{survivalElapsed:game.survivalElapsed||0,wave:game.wave,gold:game.gold,score:game.score,popUsed:game.popUsed,popMax:game.popMax,difficultyMultiplier:game.difficultyMultiplier||1,difficultyId:game.difficultyId||"normal",
      gateHp:game.gateHp,gateMaxHp:game.gateMaxHp,gateHpLv:game.gateHpLv,gateArmorLv:game.gateArmorLv,gateThornsLv:game.gateThornsLv,
      gateRegenLv:game.gateRegenLv,gateDodgeLv:game.gateDodgeLv,tech:{...game.tech},breakthroughs:{...game.breakthroughs},researchTier:game.researchTier===1?1:0}};
    localStorage.setItem(SURVIVAL_SAVE_KEY,JSON.stringify(snapshot));
    return true;
  }catch(_){return false;}
}
function readSurvivalSnapshot(){
  try{
    const raw=localStorage.getItem(SURVIVAL_SAVE_KEY);if(!raw)return null;
    const snapshot=JSON.parse(raw);
    if(snapshot?.version!==GAME_VERSION){localStorage.removeItem(SURVIVAL_SAVE_KEY);return null;}
    return snapshot;
  }catch(_){try{localStorage.removeItem(SURVIVAL_SAVE_KEY);}catch{}return null;}
}
function clearSurvivalSnapshot(){try{localStorage.removeItem(SURVIVAL_SAVE_KEY);}catch(_){} }
function restoreSurvivalStructures(data,legacyRepair=false){
  if(!data||ACTIVE_MODE.key!=="survival")return;
  const retired=HeroSystem.retireMedical(data,legacyRepair);data=retired.data;let legacyRefund=retired.refund;
  const savedGold=game.gold,savedPopMax=game.popMax,savedPopUsed=game.popUsed;game.gold=Number.MAX_SAFE_INTEGER;game.popMax=Number.MAX_SAFE_INTEGER;
  const place=(id,x,z)=>{const index=shopList().findIndex((build)=>build.id===id);if(index<0)return null;selectBuild(index);ghostCell={x,z};if(ghost)ghost.visible=true;placeBuildingImmediately(null,null,null,true);selectBuild(null);return true;};
  for(const wall of data.walls||[]){
    place("wall",wall.x,wall.z);const ci=idx(wall.x,wall.z);
    if(!wallMeta.has(ci))continue;
    while(wallMeta.get(ci).lv<wall.lv&&upgradeWallAt(wall.x,wall.z)){}
    const meta=wallMeta.get(ci);steelHP.set(ci,Math.max(1,Math.min(wallMaxHp(meta.lv),wall.hp||wallMaxHp(meta.lv))));meta.hp=steelHP.get(ci);
  }
  for(const mine of data.mines||[]){place("goldmine",mine.x,mine.z);const ref=goldMines.find((m)=>m.x===mine.x&&m.z===mine.z);if(ref){while(ref.level<(mine.level||1)&&upgradeGoldMine(ref)){}ref.hp=Math.min(ref.maxHp,mine.hp||ref.maxHp);}}
  for(const turret of data.turrets||[]){
    const id=Object.prototype.hasOwnProperty.call(TURRET_TYPES,turret.turretKey)?turret.turretKey:null;
    if(!id)continue;
    place("turret",turret.x,turret.z);
    const ref=builtTurrets.find((t)=>t.cx===turret.x&&t.cz===turret.z);
    if(ref){if(id!=="turret")chooseTurretBranch(ref,id);while(ref.level<(turret.level||0)&&upgradeTurretAt(turret.x,turret.z)){}ref.hp=Math.min(ref.maxHp,turret.hp||ref.maxHp);}
  }
  for(const house of data.houses||[]){place("house",house.x,house.z);const ref=builtHouses.find((h)=>h.x===house.x&&h.z===house.z);if(ref){while(ref.level<(house.level||1)&&upgradeHouse(ref)){}ref.hp=Math.min(ref.maxHp,house.hp||ref.maxHp);}}
  for(const h of data.heroHubs||[]){place("heroHub",h.x,h.z);const ref=heroHubs.find(r=>r.x===h.x&&r.z===h.z);if(ref)ref.hp=Math.max(1,Math.min(ref.maxHp,h.hp));}
  for(const research of data.research||[])place("research",research.x,research.z);
  for(const factory of data.factories||[]){place("factory",factory.x,factory.z);const ref=heavyFactories.find((f)=>f.x===factory.x&&f.z===factory.z);if(ref){if(factory.rally)ref.rally={...factory.rally};ref.autoType=["light","medium","heavy"].includes(factory.autoType)?factory.autoType:null;for(const item of factory.queue||[]){if(item.typeId==='repair'){legacyRefund+=item.paidCost??(legacyRepair?115:2400);continue;}if(queueFactoryUnit(ref,item.typeId,true)){const q=ref.queue[ref.queue.length-1];q.remaining=Math.max(0,Number(item.remaining)||0);q.total=Math.max(.1,Number(item.total)||1);q.remaining=Math.min(q.total,q.remaining);if(item.deployment&&Number.isFinite(item.deployment.x)&&Number.isFinite(item.deployment.z)&&Math.hypot(item.deployment.x-ref.group.position.x,item.deployment.z-ref.group.position.z)<=TILE*3)q.deployment={x:item.deployment.x,z:item.deployment.z,heading:Number.isFinite(item.deployment.heading)?item.deployment.heading:Math.PI};q.paidCost=item.paidCost??(legacyRepair&&item.typeId==='repair'?115:SurvivalSystem.FRIENDLY_UNIT_TYPES[item.typeId].cost);}}ref.progress=factory.progress||0;ref.hp=Math.min(ref.maxHp,factory.hp||ref.maxHp);}}
  for(const beacon of data.beacons||[]){place("beacon",beacon.x,beacon.z);const ref=visionBeacons.find((b)=>b.x===beacon.x&&b.z===beacon.z);if(ref){while(ref.level<(beacon.level||1)&&upgradeMedicalBeacon(ref)){}ref.hp=Math.min(ref.maxHp,beacon.hp||ref.maxHp);}}
  for(const unit of data.units||[]){
    if(unit.type==='repair'){legacyRefund+=unit.paidCost??(legacyRepair?115:2400);if(unit.repairBranch)legacyRefund+=unit.repairBranch==='speed'?120:150;continue;}
    if(unit.type==='hero'&&friendlyUnits.some(u=>u.type==='hero'))continue;
    if(!SurvivalSystem.FRIENDLY_UNIT_TYPES[unit.type])continue;
    const ref=createFriendlyUnit(unit.type,{x:Number(unit.x)||0,z:Number(unit.z)||0});
    if(unit.repairBranch)upgradeRepairUnit(ref,unit.repairBranch,true);
    if(unit.type==='hero'){ref.heroTank=true;heroTank=ref;heroArchive().status='alive';rebuildHeroModules(ref);}
    ref.hp=Math.min(ref.maxHp,Number(unit.hp)||ref.maxHp);
    if(unit.moveTarget)setFriendlyMoveTarget(ref,unit.moveTarget,true);
    ref.command=unit.command||"stop";
  }
  /* 存档中的人口字段只作旧版本兼容输入，最终人口必须由已恢复实体重算。
     这样升级住房、取消队列、拆除建筑不会留下“幽灵人口”。 */
  game.gold=savedGold+legacyRefund;
  game.popMax=Math.max(1,((ACTIVE_MODE.economy&&ACTIVE_MODE.economy.startPop)||12)+
    builtHouses.reduce((sum,house)=>sum+Math.max(0,Number(house.popProvided)||0),0));
  game.popUsed=builtTurrets.reduce((sum,t)=>sum+Math.max(0,Number(t.popUsed)||0),0)
    +visionBeacons.reduce((sum,b)=>sum+Math.max(0,Number(b.popUsed)||0),0)
    +heavyFactories.reduce((sum,f)=>sum+(f.queue||[]).reduce((q,item)=>q+Math.max(0,Number(SurvivalSystem.FRIENDLY_UNIT_TYPES[item.typeId]?.population)||0),0),0)
    +friendlyUnits.reduce((sum,u)=>sum+Math.max(0,Number(u.population)||0),0);
  /* 兼容极旧存档：若实体缺少人口字段，保留不超过存档值的安全上界。 */
  if(savedPopUsed>game.popUsed&&(!data.turrets&&!data.beacons&&!data.factories&&!data.units))game.popUsed=savedPopUsed;
  updateGoldUI();updateResUI();computeFlowField();wc3ClearSel();renderCmdCard();
}
function restoreSurvivalSnapshot(snapshot){
  if(!snapshot||snapshot.mode!=="survival"||!snapshot.game)return false;
  snapshot=migrateStairWalls(snapshot);
  const saved=snapshot.game;
  const layout=snapshot.baseLayout||{col:3,row:13,gateCol:3,gateRow:13};
  const enclosure=ACTIVE_MODE.enclosure;
  const validLayout=Number.isInteger(layout.col)&&Number.isInteger(layout.row)&&layout.col>=enclosure.x0&&layout.col+1<=enclosure.x1&&layout.row>=enclosure.z0&&layout.row+1<=enclosure.z1;
  const targetLayout=validLayout?{col:layout.col,row:layout.row,gateCol:layout.col,gateRow:layout.row}:DEFAULT_SURVIVAL_BASE;
  survivalRestoreEnvironment=savedSurvivalEnvironment(snapshot);
  try{resetGame(targetLayout,naturalPadsFromSnapshot(snapshot));}finally{survivalRestoreEnvironment=null;}
  game.survivalElapsed=Number.isFinite(saved.survivalElapsed)?Math.max(0,saved.survivalElapsed):Math.max(0,(Number(saved.wave)||1)-1)*120;
  game.wave=Math.max(0,Number(saved.wave)||0);game.gold=Math.max(0,Number(saved.gold)||0);game.score=Math.max(0,Number(saved.score)||0);
  game.difficultyMultiplier=Math.max(.1,Number(saved.difficultyMultiplier)||1);game.difficultyId=saved.difficultyId||"normal";
  if(Number.isFinite(Number(saved.popUsed)))game.popUsed=Math.max(0,Number(saved.popUsed));
  if(Number.isFinite(Number(saved.popMax)))game.popMax=Math.max(1,Number(saved.popMax));
  ["gateHp","gateMaxHp","gateHpLv","gateArmorLv","gateThornsLv","gateRegenLv","gateDodgeLv"].forEach((key)=>{
    if(Number.isFinite(Number(saved[key])))game[key]=Number(saved[key]);
  });
  const savedVersion=String(snapshot.version||'0.0.0').split('.').map(Number);
  game.tech={...(saved.tech||{})};game.breakthroughs={...(saved.breakthroughs||{})};game.legacyDefense=Number.isFinite(Number(snapshot.legacyDefense))?Math.max(0,Number(snapshot.legacyDefense)):((savedVersion[0]||0)<9?Math.max(0,Number(game.tech.defense)||0):0);game.researchTier=saved.researchTier===1?1:0;
  game.hero=HeroSystem.archive(snapshot.hero);game.doctrine=['tower','tank','hero'].includes(snapshot.doctrine)?snapshot.doctrine:null;game.doctrineTech=Object.fromEntries(Object.keys(HeroSystem.TECH).map(k=>[k,HeroSystem.level(snapshot.doctrineTech?.[k],5)]));game.endless=!!snapshot.endless;game.overflowPressure=Math.max(0,Number(snapshot.overflowPressure)||0);game._restoring=true;
  restoreSurvivalStructures(snapshot.structures,savedVersion[0]<6||(savedVersion[0]===6&&savedVersion[1]<44));
  game._restoring=false;if(heroArchive().status==='alive'&&!heroTank)heroArchive().status='dead';if(heroArchive().status==='producing')game.popUsed+=6;
  restoreConstruction(snapshot.construction);restoreUpgradeJobs(snapshot.upgradeJobs);updateBaseDoctrineVisual();
  updateGoldUI();updateResUI();updateHpUI();
  if(game.wave>0){game._resumeWave=game.wave;state=STATE.PREP;game.prepTime=ACTIVE_MODE.prepTime||30;const el=$("prepBar");if(el){el.style.display="block";el.textContent=` 继续第 ${game.wave} 波 · B 键打开商店`;}}
  return true;
}
const keys={};
let mouse={x:innerWidth/2,y:innerHeight/2,down:false};
const raycaster=new THREE.Raycaster();
function intersectTerrainRay(ray,target){
  if(!terrainSurface)return null;
  const hit=terrainSurface.intersectRay(ray.origin,ray.direction,{maxDistance:500});
  if(!hit)return null;
  target.set(hit.x,hit.y,hit.z);
  return target;
}

function createFriendlyUnit(typeId,position){
  const spec=SurvivalSystem.FRIENDLY_UNIT_TYPES[typeId];
  if(!spec)throw new RangeError(`unknown friendly unit: ${typeId}`);
  const palette={
    light:[0xb58a45,0xe0c478],       // 沙黄：高速侦察
    medium:[0x496343,0x82906a],     // 军绿：通用主战
    heavy:[0x713c36,0x343b40],      // 暗红 + 炮钢：重装火力
    hero:[0x394b55,0xc7ae72],
    repair:[0xc99b31,0xe3d7ad],     // 工程黄 + 象牙白：后勤维修
  };
  if(typeId==='hero'&&friendlyUnits.some(u=>u.type==='hero'))throw new Error('只能拥有一个英雄');
  const colors=palette[typeId],group=typeId==='hero'?makeHeroTankModel():makeTank(colors[0],colors[1],spec.scale,typeId);
  if(typeId==="repair"&&group.userData.turret){
    group.userData.turret.scale.z=.55;
    const crane=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,2.2),
      new THREE.MeshStandardMaterial({color:0xd1aa4d,roughness:.55,metalness:.45}));
    crane.position.set(.55,.9,.2);crane.rotation.x=-.35;group.add(crane);
  }
  const tankLv=researchPowerLevel((game.tech&&game.tech.tank)||0);
  const maxHp=Math.round(spec.maxHp*(1+(TECH_TREE.tank.effect.hpPct||0.08)*tankLv));
  const unit={group,type:typeId,name:spec.name,hp:maxHp,maxHp,armor:spec.armor,
    dmg:spec.damage*(1+(TECH_TREE.tank.effect.damagePct||0.07)*tankLv),fireRate:spec.fireRate,
    range:SurvivalSystem.friendlyRangeAtResearchLevel(typeId,tankLv)*TILE,speed:spec.speed*(1+(TECH_TREE.tank.effect.speedPct||0.025)*tankLv),
    population:spec.population,repairPerSecond:spec.repairPerSecond||0,radius:1.35*spec.scale,
    collisionId:++_friendlySerial,
    alive:true,cd:0,moveTarget:null,routeWaypoints:[],routeGoal:null,routeAvailable:false,routeReplan:0,stuckTime:0,
    attackTarget:null,repairTarget:null,command:"stop",patrolPoints:[],patrolIndex:0};
  const x=position.x,z=position.z;
  group.position.set(x,heightAt(x,z),z);group.userData.friendlyUnit=unit;scene.add(group);friendlyUnits.push(unit);applyDoctrineStats(unit);
  return unit;
}

function queueFactoryUnit(factory,typeId,restoring=false){
  const spec=SurvivalSystem.FRIENDLY_UNIT_TYPES[typeId];
  if(typeId==='repair'||typeId==='hero')return false;
  if(!factory||heavyFactories.indexOf(factory)<0||!spec||factory.queue.length>=20)return false;
  if(!restoring&&typeId==='repair'&&!repairProductionStatus().allowed)return false;
  const cost=Math.ceil(spec.cost*(1-.03*doctrineLevel('supply'))),time=spec.buildTime*(1-.04*doctrineLevel('supply'));
  if(game.gold<cost||game.popUsed+spec.population>game.popMax)return false;
  game.gold-=cost;game.popUsed+=spec.population;
  factory.queue.push({typeId,heroTank:false,remaining:time,total:time,paidCost:cost});
  updateGoldUI();updateResUI();return true;
}
function toggleFactoryAuto(factory,typeId){
  if(!["light","medium","heavy"].includes(typeId))return false;
  if(typeId==='repair'&&factory?.autoType!==typeId&&!repairProductionStatus().allowed){toast(repairProductionStatus().reason);return false;}
  if(!factory||heavyFactories.indexOf(factory)<0)return false;
  factory.autoType=factory.autoType===typeId?null:typeId;
  toast(factory.autoType?` 已开启${SurvivalSystem.FRIENDLY_UNIT_TYPES[typeId].name}自动生产`:` 已关闭自动生产`);
  renderCmdCard();return true;
}

function cancelFactoryQueue(factory,index=(factory&&factory.queue?factory.queue.length:0)-1){
  if(!factory||heavyFactories.indexOf(factory)<0||!Number.isInteger(index)||index<0||index>=factory.queue.length)return false;
  const [cancelled]=factory.queue.splice(index,1),spec=SurvivalSystem.FRIENDLY_UNIT_TYPES[cancelled.typeId];
  if(spec){game.gold+=Math.round((cancelled.paidCost??spec.cost)*.75);game.popUsed=Math.max(0,game.popUsed-spec.population);}
  if(index===0)factory.progress=0;
  updateGoldUI();updateResUI();wc3RenderSel();return true;
}

function setFactoryRallyPoint(factory,target){
  if(!factory||heavyFactories.indexOf(factory)<0||!target||!Number.isFinite(target.x)||!Number.isFinite(target.z))return false;
  factory.rally={
    x:Math.max(-HALF+TILE,Math.min(HALF-TILE,target.x)),
    z:Math.max(-HALF+TILE,Math.min(HALF-TILE,target.z)),
  };
  return true;
}

function updateFactories(dt){
  updateUpgradeJobs(dt);updateHeroProduction(dt);
  for(const f of [...factoryWorkshops.keys()])if(!heavyFactories.includes(f)||!f.queue.length)clearFactoryWorkshop(f);
  for(const factory of heavyFactories){
    if(factory.autoType&&factory.queue.length<20)queueFactoryUnit(factory,factory.autoType);
    const item=factory.queue[0];if(!item)continue;
    tickFactoryProduction(factory,item,dt);
  }
  renderFactoryQueueDock();renderUpgradeDock();
}

function renderFactoryQueueDock(){
  const dock=$("factoryQueueDock");if(!dock)return;
  if(!heavyFactories.length){dock.hidden=true;dock.innerHTML="";return;}
  dock.hidden=false;
  dock.innerHTML=`<div class="globalQueueTitle"> 生产队列</div>`+heavyFactories.map((factory,index)=>{
    const queue=factory.queue||[],current=queue[0],pct=Math.round((factory.progress||0)*100);
    const labels=queue.map((item,itemIndex)=>`<span class="${itemIndex===0?"current":""}">${itemIndex===0?" ":""}${SurvivalSystem.FRIENDLY_UNIT_TYPES[item.typeId]?.name||item.typeId}</span>`).join("")||"<span>空闲</span>";
    return `<div class="globalQueueFactory"><div class="globalQueueName">重工厂 ${index+1} · ${queue.length}/20 · ${factory.exitBlocked?"出口受阻":current?.remaining===0?"正在驶出":"装配生产"}</div><div class="globalQueueItems">${labels}</div>${current?`<div class="globalQueueBar"><i style="width:${pct}%"></i></div>`:""}</div>`;
  }).join("");
}

function validRepairTarget(target){
  if(!target?.group?.parent||target.alive===false||target.dying)return false;
  return Number.isFinite(target.hp)&&Number.isFinite(target.maxHp)&&target.hp>0&&target.hp<target.maxHp;
}

function gateRepairTarget(){
  if(!baseAlive||!baseGroup)return null;
  return {kind:"gate",group:baseGroup,repairBudgetOwner:baseGroup,get hp(){return game.gateHp;},set hp(value){game.gateHp=value;updateHpUI();},get maxHp(){return game.gateMaxHp;}};
}

function wallRepairTarget(ref){
  if(!ref||ref.x==null||ref.z==null)return null;
  const ci=idx(ref.x,ref.z),meta=wallMeta.get(ci),group=tileMeshes[ci];
  if(!meta||!group)return null;
  return {kind:"wall",group,repairBudgetOwner:meta,get hp(){return steelHP.get(ci)||0;},set hp(value){steelHP.set(ci,value);meta.hp=value;},get maxHp(){return wallMaxHp(meta.lv);}};
}

function normalizeRepairTarget(entry){
  if(!entry)return null;
  if(entry.kind==="wall")return wallRepairTarget(entry.ref);
  if(entry.kind==="gate"||entry.kind==="base")return gateRepairTarget();
  if(["player","unit","turret","research","heroHub","factory","goldmine","house","beacon"].includes(entry.kind))return entry.ref;
  return null;
}

function nearestRepairTarget(unit){
  const targets=[player,...friendlyUnits,...builtTurrets,...researchInstitutes,...heroHubs,...heavyFactories,...goldMines,...builtHouses,...visionBeacons,gateRepairTarget()];
  for(const [ci] of wallMeta){const ref={x:ci%GRID,z:Math.floor(ci/GRID)},target=wallRepairTarget(ref);if(target)targets.push(target);}
  let best=null,bestD=unit.range*unit.range;
  for(const target of targets){
    if(target===unit||!validRepairTarget(target)||!target.group)continue;
    const d=unit.group.position.distanceToSquared(target.group.position);
    if(d<bestD){bestD=d;best=target;}
  }
  return best;
}

function friendlyCellPassable(cx,cz){
  if(!inMap(cx,cz))return false;
  const t=grid[cz][cx];
  if(t===T_BASE||t===T_WATER||structCells.has(idx(cx,cz)))return false;
  if(isNaturalBoundaryCell(cx,cz)){
    const p=cellCenter(cx,cz);return naturalGroundClear(p.x,p.z,.4);
  }
  return !solidForTank(t,false);
}
function nearestFriendlyGoalCell(target,radius=0,from=null){
  const origin=cellOf(target.x,target.z);
  const clear=(x,z)=>friendlyCellPassable(x,z)&&(!radius||navigationPositionClear(cellCenter(x,z),radius));
  if(inMap(origin.x,origin.z)&&clear(origin.x,origin.z))return origin;
  let best=null,bestScore=Infinity;
  for(let ring=1;ring<=6;ring++)for(let dz=-ring;dz<=ring;dz++)for(let dx=-ring;dx<=ring;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
    const x=origin.x+dx,z=origin.z+dz;
    if(!inMap(x,z)||!clear(x,z))continue;
    const p=cellCenter(x,z),score=Math.hypot(p.x-target.x,p.z-target.z)+(from?Math.hypot(p.x-from.x,p.z-from.z)*.15:0);
    if(score<bestScore){bestScore=score;best={x,z};}
  }
  return best;
}
function planFriendlyRoute(unit,target){
  if(!unit||!target)return false;
  const radius=Math.min(unit.radius,TILE*.38);
  const start=cellOf(unit.group.position.x,unit.group.position.z),goal=nearestFriendlyGoalCell(target,radius,unit.group.position);
  unit.routeWaypoints=[];unit.routeGoal={x:target.x,z:target.z};unit.routeGoalCell=goal;unit.routeAvailable=false;unit.routeReplan=.65;unit.stuckTime=0;
  unit.routeRevision=navigationStamp;
  if(!goal||!inMap(start.x,start.z))return false;
  const passable=(x,z)=>friendlyCellPassable(x,z)&&navigationPositionClear(cellCenter(x,z),radius);
  const key=`${goal.x},${goal.z}:${radius}:${navigationStamp}:${GRID}`;
  if(friendlyFlowCache.key!==key||!friendlyFlowCache.field||friendlyFlowCache.field.width!==GRID){
    if(!friendlyFlowCache.field||friendlyFlowCache.field.width!==GRID)friendlyFlowCache.field=new FlowField(GRID,GRID);
    friendlyFlowCache.field.compute([goal],{passable,canStep:flowCanStep});
    friendlyFlowCache.key=key;
    friendlyRouteComputeCount++;
  }
  const field=friendlyFlowCache.field;
  if(!Number.isFinite(field.distanceAt(start.x,start.z)))return false;
  unit.routeAvailable=true;
  let x=start.x,z=start.z;
  for(let guard=0;guard<GRID*GRID&&(x!==goal.x||z!==goal.z);guard++){
    const direction=field.directionAt(x,z);
    if(!direction.x&&!direction.z)break;
    x+=Math.round(direction.x);z+=Math.round(direction.z);
    const point=cellCenter(x,z);
    unit.routeWaypoints.push({x:point.x,z:point.z});
  }
  const goalCenter=cellCenter(goal.x,goal.z);
  if(Math.hypot(target.x-goalCenter.x,target.z-goalCenter.z)<TILE*.7&&navigationSegmentClear(goalCenter,target,radius))
    unit.routeWaypoints.push({x:target.x,z:target.z});
  unit.routeWaypoints=smoothNavigationRoute([{x:unit.group.position.x,z:unit.group.position.z},...unit.routeWaypoints],radius).slice(1);
  unit.routeDestination=unit.routeWaypoints.at(-1)||goalCenter;
  unit.routeRevision=navigationStamp;
  return unit.routeWaypoints.length>0||(start.x===goal.x&&start.z===goal.z);
}
function clearFriendlyRoute(unit){unit.moveTarget=null;unit.routeWaypoints=[];unit.routeGoal=null;unit.routeGoalCell=null;unit.routeAvailable=false;unit.stuckTime=0;}
function setFriendlyMoveTarget(unit,target,force=false,fieldTarget=null){
  if(!unit||!target)return false;
  const radius=Math.min(unit.radius,TILE*.38),goal=nearestFriendlyGoalCell(fieldTarget||target,radius,unit.group.position);
  const cellChanged=!unit.routeGoalCell||!goal||unit.routeGoalCell.x!==goal.x||unit.routeGoalCell.z!==goal.z;
  unit.moveTarget={x:target.x,z:target.z};
  if(force||cellChanged||!unit.routeWaypoints.length){
    planFriendlyRoute(unit,fieldTarget||unit.moveTarget);
    if(unit.routeWaypoints.length&&(target.x!==(fieldTarget||target).x||target.z!==(fieldTarget||target).z)
      &&navigationSegmentClear(unit.routeWaypoints.at(-1),target,radius)){
      unit.routeWaypoints.push({x:target.x,z:target.z});
      unit.routeDestination=unit.routeWaypoints.at(-1);
    }
    unit.moveTarget={x:target.x,z:target.z};
  }else if(unit.routeWaypoints.length){
    const last=unit.routeWaypoints[unit.routeWaypoints.length-1];
    const previous=unit.routeWaypoints.at(-2)||unit.group.position;
    if(navigationSegmentClear(previous,target,radius)){last.x=target.x;last.z=target.z;unit.routeDestination=last;}
  }
  return true;
}
function moveFriendlyUnit(unit,dt){
  if(!unit.moveTarget)return;
  unit.routeReplan=Math.max(0,(unit.routeReplan||0)-dt);
  if(unit.routeRevision!==navigationStamp||(!unit.routeWaypoints.length&&unit.routeReplan<=0))planFriendlyRoute(unit,unit.moveTarget);
  if(!unit.routeAvailable)return;
  const waypoint=unit.routeWaypoints[0]||unit.routeDestination||unit.moveTarget;
  const g=unit.group,oldX=g.position.x,oldZ=g.position.z;
  const dx=waypoint.x-g.position.x,dz=waypoint.z-g.position.z,d=Math.hypot(dx,dz);
  if(d<.7){
    if(unit.routeWaypoints.length){unit.routeWaypoints.shift();return;}
    if(unit.command==="patrol"&&unit.patrolPoints.length===2){
      unit.patrolIndex=1-unit.patrolIndex;setFriendlyMoveTarget(unit,unit.patrolPoints[unit.patrolIndex],true);
    }else clearFriendlyRoute(unit);
    return;
  }
  const step=Math.min(d,unit.speed*dt),nx=g.position.x+dx/d*step,nz=g.position.z+dz/d*step;
  const radius=Math.min(unit.radius,TILE*.38);
  if(!blockedForTank(nx,g.position.z,radius,heightAt(g.position.x,g.position.z),false,true))g.position.x=nx;
  if(!blockedForTank(g.position.x,nz,radius,heightAt(g.position.x,g.position.z),false,true))g.position.z=nz;
  const want=Math.atan2(dx,dz)+Math.PI;g.rotation.y+=shortAngle(want-g.rotation.y)*Math.min(1,dt*9);
  g.position.y=heightAt(g.position.x,g.position.z);
  const moved=Math.hypot(g.position.x-oldX,g.position.z-oldZ);
  unit.stuckTime=moved<Math.max(.003,unit.speed*dt*.08)?(unit.stuckTime||0)+dt:0;
  /* 边缘/不可达目标时禁止每帧重算流场：多辆坦克同时卡住会把 CPU 打满。
     重新规划至少间隔 0.65 秒，并在失败时保留目标等待下一次节流重试。 */
  if(unit.stuckTime>.75&&unit.routeGoal&&unit.routeReplan<=0)planFriendlyRoute(unit,unit.routeGoal);
}

function blockedByFixedCollider(px,pz,radius,exclude=null){
  for(const collider of fixedVisionLights){
    if(collider===exclude||!Number.isFinite(collider.x)||!Number.isFinite(collider.z))continue;
    const desired=radius+(collider.collisionRadius||.7);
    const dx=px-collider.x,dz=pz-collider.z;
    if(Math.abs(dx)<desired&&Math.abs(dz)<desired&&dx*dx+dz*dz<desired*desired)return true;
  }
  return false;
}

function friendlyBodies(){
  const bodies=[];
  if(player&&player.alive)bodies.push({ref:player,id:-1,x:player.group.position.x,z:player.group.position.z,radius:player.radius,movable:true});
  for(const unit of friendlyUnits)if(unit.alive)bodies.push({ref:unit,id:unit.collisionId||1,x:unit.group.position.x,z:unit.group.position.z,radius:unit.radius,movable:true});
  return bodies;
}

function canPlaceBody(ref,x,z){
  const p=ref.group.position,navRadius=ref.type?Math.min(ref.radius,TILE*.38):ref.radius;
  return !blockedForTank(x,z,navRadius,heightAt(p.x,p.z),false,true)&&!blockedByFixedCollider(x,z,navRadius);
}

function findFriendlySpawnPoint(origin,radius){
  const occupied=friendlyBodies();
  for(let ring=0;ring<=7;ring++){
    const points=ring===0?1:ring*8;
    for(let index=0;index<points;index++){
      const angle=(index/points)*Math.PI*2,distance=ring*(radius*1.15+.35);
      const x=origin.x+Math.cos(angle)*distance,z=origin.z+Math.sin(angle)*distance;
      if(blockedForTank(x,z,Math.min(radius,TILE*.38),heightAt(origin.x,origin.z),false,true)||blockedByFixedCollider(x,z,radius))continue;
      if(occupied.every(body=>Math.hypot(x-body.x,z-body.z)>=radius+body.radius+.12))return {x,z};
    }
  }
  return {...origin};
}

function damageFriendlyFromContact(enemy,target,dt){
  enemy.bodyAttackCd=(enemy.bodyAttackCd||0)-dt;
  if(enemy.bodyAttackCd>0)return;
  const damage=enemyMeleeDamage(enemy);
  if(target===player)damagePlayer(damage);
  else{
    target.hp-=damage*(1-Math.min(.65,target.armor||0));
    spawnParticles(target.group.position.clone().setY(1.2),0xff8a6a,4,4,.45);
  }
  enemy.bodyAttackCd=enemy.boss?.55:.9;enemy._attackedNow=true;
  sfx.zombie(enemy);
}

function applyGameplayCollisions(dt){
  if(ACTIVE_MODE.key!=="survival")return;
  const bodies=friendlyBodies();
  if(bodies.length){
    const resolved=SurvivalSystem.resolveSolidCircles(bodies,{iterations:5,compression:1,maxStep:TILE*.45});
    for(let index=0;index<bodies.length;index++){
      const body=bodies[index],next=resolved[index],p=body.ref.group.position;
      if(canPlaceBody(body.ref,next.x,p.z))p.x=next.x;
      if(canPlaceBody(body.ref,p.x,next.z))p.z=next.z;
      p.y=heightAt(p.x,p.z);
    }
  }
  const now=performance.now(),activeEnemies=enemies.filter(enemy=>enemy.alive&&!enemy.dying&&now>=enemy.spawnFlash);
  for(const body of bodies)for(const enemy of activeEnemies){
    const fp=body.ref.group.position,ep=enemy.group.position,desired=(body.radius+enemy.radius)*.96;
    let dx=ep.x-fp.x,dz=ep.z-fp.z,distance=Math.hypot(dx,dz);
    if(distance>=desired)continue;
    let nx,nz;
    if(distance<1e-5){const angle=((body.id*61+enemy.hordeId*97)%360)*Math.PI/180;nx=Math.cos(angle);nz=Math.sin(angle);distance=0;}
    else{nx=dx/distance;nz=dz/distance;}
    const overlap=desired-distance;
    const friendlyPush=Math.min(overlap*.42,TILE*.35),enemyPush=Math.min(overlap*.58,TILE*.45);
    if(canPlaceBody(body.ref,fp.x-nx*friendlyPush,fp.z-nz*friendlyPush)){
      fp.x-=nx*friendlyPush;fp.z-=nz*friendlyPush;fp.y=heightAt(fp.x,fp.z);
    }
    const er=enemyNavigationRadius(enemy),eh=heightAt(ep.x,ep.z);
    if(!blockedForTank(ep.x+nx*enemyPush,ep.z+nz*enemyPush,er,eh)){
      ep.x+=nx*enemyPush;ep.z+=nz*enemyPush;ep.y=heightAt(ep.x,ep.z);
    }
    damageFriendlyFromContact(enemy,body.ref,dt);
  }
  let overlaps=0,minimum=Infinity;
  const audit=friendlyBodies();
  for(let left=0;left<audit.length;left++)for(let right=left+1;right<audit.length;right++){
    const clearance=Math.hypot(audit[left].x-audit[right].x,audit[left].z-audit[right].z)-audit[left].radius-audit[right].radius;
    minimum=Math.min(minimum,clearance);if(clearance<-.08)overlaps++;
  }
  gameplayCollisionStats.overlaps=overlaps;
  gameplayCollisionStats.minimumClearance=Number.isFinite(minimum)?minimum:0;
  gameplayCollisionStats.blockedFrames=overlaps?gameplayCollisionStats.blockedFrames+1:0;
}

function updateRepairUnit(unit,dt){
  let target=unit.repairTarget;
  if(target===unit){unit.repairTarget=null;unit.autoRepairBlocked=true;return;}
  if(target)unit.autoRepairBlocked=false;
  if(unit.autoRepairBlocked||dt<=0)return;
  const manual=unit.command==='repair';
  const inRange=t=>unit.group.position.distanceToSquared(t.group.position)<=unit.range*unit.range;
  if(!validRepairTarget(target)||(!manual&&!inRange(target))){
    if(manual){clearFriendlyRoute(unit);unit.command='stop';}
    target=nearestRepairTarget(unit);
  }
  unit.repairTarget=target;
  if(!target)return;
  if(!inRange(target)){
    // Only an explicit repair order chases a target outside the support radius.
    if(unit.command==='repair')setFriendlyMoveTarget(unit,target.group.position);
    return;
  }
  if(unit.command==='repair')clearFriendlyRoute(unit);
  const repairedHp=allocateMobileHealing(target,Math.min(unit.repairPerSecond*dt,game.gold*10),dt);
  if(repairedHp<=0)return;
  target.hp=Math.min(target.maxHp,target.hp+repairedHp);game.gold=Math.max(0,game.gold-repairedHp/10);
  showMedicalHealingLink(unit,target,'tank');
}
function updateFriendlyUnits(dt){
  beginMobileHealingTick();
  hideMedicalHealingLinks('tank');
  const now=performance.now();
  for(let index=friendlyUnits.length-1;index>=0;index--){
    const unit=friendlyUnits[index];
    if(!unit.alive||unit.hp<=0){
      heroDied(unit);scene.remove(unit.group);disposeTransientObject3D(unit.group);friendlyUnits.splice(index,1);game.popUsed=Math.max(0,game.popUsed-unit.population);if(heroTank===unit)heroTank=null;continue;
    }
    if(unit.type==='hero'){updateHeroCombat(unit,dt);continue;}
    if(unit.type==="repair"){
      updateRepairUnit(unit,dt);
      moveFriendlyUnit(unit,dt);continue;
    }
    const mayAutoAcquire=!unit.moveTarget||unit.command==="attackMove";
    if(mayAutoAcquire&&!isEnemyCombatTarget(unit.attackTarget)){
      let best=null,bestD=unit.range*unit.range;
      for(const enemy of enemies){if(!isEnemyCombatTarget(enemy)||!isPositionVisible(enemy.group.position))continue;const d=unit.group.position.distanceToSquared(enemy.group.position);if(d<bestD){bestD=d;best=enemy;}}
      unit.attackTarget=best;
    }
    if(unit.attackTarget&&(!isEnemyCombatTarget(unit.attackTarget)||!isPositionVisible(unit.attackTarget.group.position)))unit.attackTarget=null;
    if(unit.attackTarget&&unit.attackTarget.alive){
        const target=enemyAimPoint(unit.attackTarget),d=unit.group.position.distanceTo(target);
      if(d>unit.range){setFriendlyMoveTarget(unit,target);}
      else{
        clearFriendlyRoute(unit);unit.cd-=dt;
        const turret=unit.group.userData.turret,dx=target.x-unit.group.position.x,dz=target.z-unit.group.position.z;
        if(turret){const want=Math.atan2(dx,dz)+Math.PI-unit.group.rotation.y;turret.rotation.y+=shortAngle(want-turret.rotation.y)*Math.min(1,dt*10);}
        if(unit.cd<=0){unit.cd=1/Math.max(.01,unit.fireRate*(unit._speedAura||1));fireFriendlyWeapon(unit,unit.attackTarget);}
      }
    }
    moveFriendlyUnit(unit,dt);
    unit.group.visible=now>=0;
  }
}

/* ---------------- 升级卡池（自身系 + 基地系，带稀有度）---------------- */
/* rar: 1=普通 2=稀有 3=史诗 —— 稀有度越高越强、抽中权重越低 */
const UPGRADES=[
  //  自身系
  {id:"dmg",type:"tank",rar:1,icon:"flame",name:"钨芯穿甲弹",desc:"炮弹伤害 +40%",max:6,apply:s=>s.dmg*=1.4},
  {id:"rate",type:"tank",rar:1,icon:"speed",name:"自动装填机",desc:"射速 +25%",max:6,apply:s=>s.fireRate*=1.25},
  {id:"speed",type:"tank",rar:1,icon:"tank",name:"涡轮增压引擎",desc:"移动速度 +18%",max:5,apply:s=>s.moveSpeed*=1.18},
  {id:"bspd",type:"tank",rar:1,icon:"speed",name:"电磁加速轨道",desc:"炮弹飞行速度 +30%",max:4,apply:s=>s.bulletSpeed*=1.3},
  {id:"lucky",type:"tank",rar:1,icon:"star",name:"幸运星",desc:"道具掉落率 +25%，掉落更多",max:3,apply:s=>s.luckyLv+=1},
  {id:"regen",type:"tank",rar:1,icon:"repair",name:"战地维修",desc:"每波开始修复 2×Lv 点装甲",max:2,
    apply:s=>{s.regenLv++;if(player){player.hp=Math.min(s.armorMax,player.hp+2);updateHpUI();}}},
  {id:"spare",type:"tank",rar:1,icon:"repair",name:"备用履带",desc:"额外 +1 条生命",max:2,
    apply:s=>{game.lives++;updateHpUI();}},
  {id:"magnet",type:"tank",rar:1,icon:"coin",name:"补给磁铁",desc:"自动吸取附近道具",max:1,apply:s=>s.magnet=true},
  {id:"pierce",type:"tank",rar:2,icon:"attack",name:"超空化弹芯",desc:"炮弹穿透 +1 个目标",max:3,apply:s=>s.pierce+=1},
  {id:"armor",type:"tank",rar:2,icon:"shield",name:"复合装甲",desc:"最大装甲 +2 并完全修复",max:4,
    apply:s=>{s.armorMax+=2;if(player){player.hp=s.armorMax;player.maxHp=s.armorMax;}}},
  {id:"blast",type:"tank",rar:2,icon:"blast",name:"高爆弹头",desc:"炮弹命中产生范围爆炸",max:3,apply:s=>s.blastRadius+=1.6},
  {id:"crit",type:"tank",rar:2,icon:"research",name:"弱点分析",desc:"18% 几率造成双倍伤害（可叠加）",max:3,
    apply:s=>{s.critChance=Math.min(.9,s.critChance+.18);}},
  {id:"multi",type:"tank",rar:3,icon:"turret",name:"双联炮塔",desc:"每次开火 +1 发平行炮弹",max:3,apply:s=>s.multishot+=1},
  {id:"vamp",type:"tank",rar:3,icon:"health",name:"收割装置",desc:"击杀敌人修复 1 点装甲",max:2,apply:s=>s.vampLv++},
  {id:"ricochet",type:"tank",rar:2,icon:"patrol",name:"弹射装甲弹",desc:"炮弹碰钢墙/楼房反弹一次（可叠两次）",max:2,apply:s=>s.bounce+=1},
  {id:"sprint",type:"tank",rar:1,icon:"move",name:"猎杀冲锋",desc:"击杀敌人后 3 秒内移速 +35%",max:2,
    apply:s=>{s.sprintLv++;if(s.sprintLv===2)s.sprintDur=4500;}},
  {id:"pshield",type:"tank",rar:2,icon:"shield",name:"单兵力场",desc:"每波获得护盾，抵挡 2×Lv 次攻击",max:3,
    apply:s=>{s.playerShieldLv++;game.playerShieldHP=s.playerShieldLv*2;}},
  //  基地系
  {id:"baseRepair",type:"base",rar:1,icon:"repair",name:"工程抢修班",desc:"每波开始重建基地围墙（Lv2+ 加筑外圈）",max:3,
    apply:s=>{s.baseRepairLv++;genMap.applyShell&&genMap.applyShell();}},
  {id:"airstrike",type:"base",rar:2,icon:"airstrike",name:"空袭协同",desc:"每波开始获得 1 次空投轰炸充能",max:3,
    apply:s=>{s.airstrikeLv++;game.bombs+=1;}},
  {id:"baseWall",type:"base",rar:2,icon:"wall",name:"基地工事加固",desc:"基地围墙换装钢制掩体（永久）",max:2,
    apply:s=>{s.baseWallLv++;genMap.applyShell&&genMap.applyShell();}},
  {id:"autoTurret",type:"base",rar:2,icon:"turret",name:"基地防御炮台",desc:"鹰旗自动炮台反击周围敌人，射速随级提升",max:4,
    apply:s=>{s.autoTurretLv++;if(autoTurretObj)autoTurretObj.visible=true;}},
  {id:"baseShield",type:"base",rar:2,icon:"shield",name:"护盾发生器",desc:"基地获得能量护盾，每波补满，吸收敌方炮火",max:3,
    apply:s=>{s.baseShieldMax+=2;game.baseShieldHP=s.baseShieldMax;}},
  {id:"overload",type:"base",rar:3,icon:"blast",name:"超载协议",desc:"防御炮台射程 +40%、伤害 +1、射速大幅提升",max:2,apply:s=>s.overloadLv++},
  {id:"emp",type:"base",rar:3,icon:"research",name:"EMP 脉冲塔",desc:"基地每 9 秒释放脉冲：眩晕并伤害周围敌人",max:2,
    apply:s=>{s.empLv++;game._empTimer=Math.min(game._empTimer,2);}},
  {id:"mortar",type:"base",rar:3,icon:"blast",name:"迫击炮阵地",desc:"基地定期炮击敌群，造成范围伤害",max:2,
    apply:s=>{s.mortarLv++;if(s.mortarLv===1)game._mortarTimer=4;}},
  {id:"evolve",type:"base",rar:3,icon:"research",name:"连锁进化",desc:"每波开始随机强化一张已拥有卡 +1 级",max:2,apply:s=>s.evolveLv+=1},
  {id:"income",type:"base",rar:1,icon:"coin",name:"战利品回收",desc:"击杀金币收益 +30%",max:3,apply:s=>s.incomeLv+=1},
  {id:"builder",type:"base",rar:2,icon:"build",name:"工程承包商",desc:"构筑商店全部价格 -15%",max:2,apply:s=>s.builderLv+=1},
  {id:"netmaster",type:"base",rar:2,icon:"laser",name:"火力网络",desc:"你布置的炮台伤害 +40%、射速 +25%",max:3,apply:s=>s.netmasterLv+=1},
];

/* ---------------- 玩家 ---------------- */
function spawnPlayer(){
  if(player)scene.remove(player.group);
  const group=makeTank(0x3f8f46,0x57b564);
  /*  生存模式：出生在高台内部（主楼正前方），便于上台布防；其余模式沿用原地 */
  const c=ACTIVE_MODE.key==="survival"
    ?cellCenter((ACTIVE_MODE.base&&ACTIVE_MODE.base.col)||6,((ACTIVE_MODE.base&&ACTIVE_MODE.base.row)||41)-1)
    :cellCenter(Math.floor(GRID/2)-2,GRID-2);
  group.position.set(c.x,heightAt(c.x,c.z),c.z);
  scene.add(group);
  const tankLv=researchPowerLevel((game.tech&&game.tech.tank)||0);
  const pHp=Math.round(game.stats.armorMax*(1+(TECH_TREE.tank.effect.hpPct||0.08)*tankLv));
  const pSpd=11*(1+(TECH_TREE.tank.effect.speedPct||0.025)*tankLv);
  player={group,hp:pHp,maxHp:pHp,speed:pSpd,cd:0,heading:Math.PI,aim:Math.PI,
    invulnUntil:performance.now()+2500,alive:true,radius:1.5,
    /*  P3-9 WC3 指令层 */
    moveTarget:null,attackTarget:null,attackMove:false};
  updateHpUI();
}

/* ---------------- 敌人 ---------------- */
const ENEMY_TYPES={
  normal:{color:0x8a94a2,turret:0xa8b2c0,hp:2,speed:SurvivalSystem.ENEMY_MOVEMENT.normal.base,fireCd:1.6,dmg:1,scale:1,score:100},
  fast:{color:0x2f8f4e,turret:0x53c077,hp:1,speed:SurvivalSystem.ENEMY_MOVEMENT.fast.base,fireCd:1.9,dmg:1,scale:.88,score:150},
  heavy:{color:0xa03c34,turret:0xcc5a4c,hp:6,speed:SurvivalSystem.ENEMY_MOVEMENT.heavy.base,fireCd:2.0,dmg:2,scale:1.22,score:300,armor:.24},
  sniper:{color:0x6a4fa0,turret:0x8f74cc,hp:2,speed:SurvivalSystem.ENEMY_MOVEMENT.sniper.base,fireCd:2.4,dmg:1,scale:.95,score:250,ranged:true},
  ghost:{color:0x7199aa,turret:0xa1d8e8,hp:1.6,speed:SurvivalSystem.ENEMY_MOVEMENT.ghost.base,fireCd:1.7,dmg:1,scale:.92,score:190,phase:true},
  lifesteal:{color:0x752f3b,turret:0xa94d5d,hp:4.2,speed:SurvivalSystem.ENEMY_MOVEMENT.lifesteal.base,fireCd:1.5,dmg:1.5,scale:1.08,score:260,lifesteal:.35},
  siege:{color:0x665747,turret:0x8c765d,hp:8,speed:SurvivalSystem.ENEMY_MOVEMENT.siege.base,fireCd:2.4,dmg:3,scale:1.3,score:340,armor:.3,siege:true},
  elite:{color:0x8f7844,turret:0xc7a65a,hp:7,speed:SurvivalSystem.ENEMY_MOVEMENT.elite.base,fireCd:1.4,dmg:2.2,scale:1.25,score:420,armor:.22},
};
const BOSS_TYPE={color:0x1f1f26,turret:0xffb02e,hp:40,speed:SurvivalSystem.ENEMY_MOVEMENT.boss.base,fireCd:1.1,dmg:2,scale:1.7,score:2000};

/*  P5 敌人类型 → Kenney graveyard-kit 怪物模型映射（用户拍板：敌人=怪物，丧尸尸潮风）
   动画库与 blocky-characters 同构（idle/walk/sprint/die/attack-melee-*），直接复用动画状态机。
   normal=丧尸（主力，尸潮感）/ fast=幽灵（飘速快）/ heavy=吸血鬼（壮硕精英）
   sniper=守墓人（远程）/ boss=骷髅王（大体型） */
const ENEMY_CHAR_MAP={
  normal:"character-zombie",
  fast:"character-ghost",
  heavy:"character-vampire",
  sniper:"character-keeper",
  ghost:"character-ghost",lifesteal:"character-vampire",siege:"character-keeper",elite:"character-zombie",
  corpse_king:"character-zombie",swift_lord:"character-skeleton",corrupted_colossus:"character-keeper",
  ghost_queen:"character-ghost",vampire_lord:"character-vampire",doom_keeper:"character-keeper",
};
const SURVIVAL_ZOMBIE_VARIANTS=Object.freeze([
  {id:"survivors-zombie-a",texture:"zombie-a",heightScale:.96,pack:"survivors",tint:0xd7dfd8},
  {id:"survivors-zombie-c",texture:"zombie-c",heightScale:1.04,pack:"survivors",tint:0xc7d1c8},
  {id:"retro-zombie-female",texture:"zombie-female-a",heightScale:.95,pack:"retro",tint:0xcbd5cc},
  {id:"retro-zombie-male",texture:"zombie-male-a",heightScale:1.03,pack:"retro",tint:0xb8c5ba},
].map((variant)=>Object.freeze({...variant,model:"survivor-zombie",idle:"survivor-idle",walk:"survivor-run"})));
const SURVIVAL_MONSTER_TINTS=Object.freeze({
  heavy:0x56756f,lifesteal:0x416b72,siege:0x4c666d,elite:0x5e7d76,sniper:0x4f7075,
});
const SURVIVAL_ZOMBIE_TINT=0x607d73;
const ENEMY_CHAR_TARGET_HEIGHT={
  /* 坦克车体高度约 2.5；普通人形僵尸按人类比例控制在坦克的约三分之一，
     不再用原先 3.2 的巨人尺寸堆进窄路。 */
  normal:1.2,
  fast:1.08,
  heavy:1.35,
  sniper:1.2,
  ghost:1.1,lifesteal:1.3,siege:1.45,elite:1.4,
  corpse_king:1.9,swift_lord:1.8,corrupted_colossus:2.1,ghost_queen:1.85,vampire_lord:2,doom_keeper:2.2,
};
/*  角色动画名（Kenney blocky-characters 包：实际 GLB 字段为小写 idle/walk/die/sprint） */
const _ANIM_IDLE="idle",_ANIM_WALK="walk",_ANIM_DEATH="die",_ANIM_SPRINT="sprint";
const _IN_PLACE_ANIMS={};
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
function _inPlaceAnimations(charName){
  if(_IN_PLACE_ANIMS[charName])return _IN_PLACE_ANIMS[charName];
  const source=ASSET_ANIMS[charName]||[];
  _IN_PLACE_ANIMS[charName]=source.map(clip=>{
    const copy=clip.clone();
    copy.tracks=copy.tracks.filter(track=>!/^root\.position$/i.test(track.name)
      &&!/(left|right)?(arm|forearm|hand|chest|spine)/i.test(track.name));
    return copy;
  });
  return _IN_PLACE_ANIMS[charName];
}
function _survivalZombieVariant(typeKey,serial){
  /* 普通尸潮使用 Survivors / Retro / Protagonists 三套同骨架角色皮肤；特殊类型通过体型与血污色区分。
     Graveyard 的大头块状角色只留给 Boss，避免普通尸潮重新退化成可爱玩具比例。 */
  const start=(Math.max(1,serial)-1)%SURVIVAL_ZOMBIE_VARIANTS.length;
  for(let offset=0;offset<SURVIVAL_ZOMBIE_VARIANTS.length;offset++){
    const variant=SURVIVAL_ZOMBIE_VARIANTS[(start+offset)%SURVIVAL_ZOMBIE_VARIANTS.length];
    if(_survivalZombieVariantReady(variant))return variant;
  }
  return null;
}
function _survivalZombieVariantReady(variant){
  if(!variant||!ASSETS[variant.model])return false;
  if(variant.texture&&!ASSET_TEXTURES[variant.texture])return false;
  if(variant.idle&&!(ASSET_ANIMS[variant.idle]||[]).length)return false;
  if(variant.walk&&!(ASSET_ANIMS[variant.walk]||[]).length)return false;
  if(!variant.idle&&!variant.walk&&!(ASSET_ANIMS[variant.model]||[]).length)return false;
  return true;
}
function _variantAnimations(variant){
  if(!variant)return [];
  if(!variant.idle&&!variant.walk)return _inPlaceAnimations(variant.model);
  const clips=[];
  const add=(assetName,canonicalName)=>{
    const source=ASSET_ANIMS[assetName]||[];
    if(!source.length)return;
    const expected=canonicalName===_ANIM_WALK?"run":canonicalName;
    const selected=source.find((clip)=>String(clip&&clip.name||"").toLowerCase().includes(expected))
      ||source.reduce((longest,clip)=>!longest||clip.duration>longest.duration?clip:longest,null);
    const copy=selected.clone();copy.name=canonicalName;
    /* 生存模式双臂由固定前举姿态接管，Walk 只保留腿部动作，避免每次 mixer 更新把手臂放下。 */
    copy.tracks=copy.tracks.filter(track=>!/(^|[.:])root\.position$/i.test(track.name)
      &&!/(left|right)?(arm|forearm|hand|chest|spine)/i.test(track.name));
    clips.push(copy);
  };
  add(variant.idle,_ANIM_IDLE);add(variant.walk,_ANIM_WALK);
  return clips;
}
/* 用角色模型构建敌人 group；失败回退 makeTank() */
function _buildEnemyGroup(typeKey,isBoss,t){
  const survivalCharacter=ACTIVE_MODE.key==="survival";
  const variant=survivalCharacter?_survivalZombieVariant(typeKey,_enemySerial+1):null;
  /* 生存模式所有敌人（含 Boss）统一使用新 Survivors 骨架，避免普通尸潮与巨型僵尸风格割裂。 */
  const charName=variant?variant.model:(survivalCharacter?"survivor-zombie":(ENEMY_CHAR_MAP[typeKey]||ENEMY_CHAR_MAP.normal));
  const src=ASSETS[charName];
  if(!src||!THREE.SkeletonUtils){
    /* 模型未就绪或 SkeletonUtils 缺失 → 回退程序化坦克 */
    return {group:makeTank(t.color,t.turret,t.scale),mixer:null,fallback:true};
  }
  try{
    const inst=THREE.SkeletonUtils.clone(src);
    inst.userData.assetName=charName;
    /* Kenney 角色正面与游戏 +Z 前向一致；局部反转会让僵尸全程背对目标。 */
    inst.rotation.y=0;
    const variantTexture=variant&&ASSET_TEXTURES[variant.texture];
    inst.traverse(o=>{if(o.isMesh){
      o.castShadow=!!isBoss;o.receiveShadow=false;o.frustumCulled=true;
      if(o.material&&(variantTexture||SURVIVAL_MONSTER_TINTS[typeKey]||survivalCharacter)){
        const meshName=String(o.name||"").toLowerCase();
        const zombieSkinMesh=survivalCharacter&&(meshName==="head"||meshName.includes("arm"));
        const applyMaterial=material=>{const copy=material.clone();if(variantTexture)copy.map=variantTexture;
          const zombieTint=isBoss?0x4b3032:0x294b43;
          /* 头部与手臂包含肤色像素，去掉共享 colormap 后才能真正压住人类肤色；
             躯干、腿部继续保留贴图，确保衣物、裤子和头发细节不丢失。 */
          if(zombieSkinMesh)copy.map=null;
          copy.color&&copy.color.setHex(zombieTint);
          if(isBoss&&copy.emissive){copy.emissive.setHex(0x3a0808);copy.emissiveIntensity=.28;}
          copy.roughness=.92;copy.metalness=0;
          if(copy.emissive){copy.emissive.setHex(0x000000);copy.emissiveIntensity=0;}
          if(!variant&&copy.emissive){copy.emissive.setHex(0x120707);copy.emissiveIntensity=.16;}
          copy.needsUpdate=true;return copy;};
        o.material=Array.isArray(o.material)?o.material.map(applyMaterial):applyMaterial(o.material);
      }
    }});
    /* 角色包原始单位完全不同，必须按实际包围盒归一化，禁止倍率与源尺寸直接叠乘。 */
    inst.scale.setScalar(1);inst.updateMatrixWorld(true);
    const naturalBox=new THREE.Box3().setFromObject(inst);
    const naturalHeight=Math.max(.001,naturalBox.max.y-naturalBox.min.y);
    const targetHeight=(ENEMY_CHAR_TARGET_HEIGHT[typeKey]||3.2)*(variant?.heightScale||1)*(isBoss?(survivalCharacter?5.2:2.4):1);
    inst.scale.set(targetHeight/naturalHeight*.9,targetHeight/naturalHeight,targetHeight/naturalHeight*.9);
    const poseBones={};
    inst.traverse((object)=>{
      if(!object.isBone)return;
      if(object.name==="Head")object.scale.multiplyScalar(.84);
      const boneName=String(object.name||"").toLowerCase().replace(/[^a-z]/g,"");
      /* 必须先匹配 ForeArm：leftforearm 包含 leftarm，否则前臂会盖掉大臂。 */
      if(boneName.includes("leftforearm")||boneName.includes("lowerarml")||boneName.includes("leftlowerarm"))poseBones.LeftForeArm=object;
      else if(boneName.includes("rightforearm")||boneName.includes("lowerarmr")||boneName.includes("rightlowerarm"))poseBones.RightForeArm=object;
      else if(boneName==="lefthand")poseBones.LeftHand=object;
      else if(boneName==="righthand")poseBones.RightHand=object;
      else if(boneName.includes("leftarm")||boneName.includes("upperarml")||boneName.includes("leftupperarm"))poseBones.LeftArm=object;
      else if(boneName.includes("rightarm")||boneName.includes("upperarmr")||boneName.includes("rightupperarm"))poseBones.RightArm=object;
      else if(boneName.includes("chest")||boneName.includes("spine2"))poseBones.Chest=object;
      else if(boneName.includes("hips")||boneName.includes("pelvis"))poseBones.Hips=object;
    });
    const baseBoneRotations={};
    Object.entries(poseBones).forEach(([name,bone])=>{baseBoneRotations[name]=bone.rotation.clone();});
    /* 世界移动、视觉贴地和骨骼动画分层，避免 root.position 覆盖世界坐标。 */
    const box=new THREE.Box3().setFromObject(inst);
    const c=box.getCenter(new THREE.Vector3());
    const worldRoot=new THREE.Group(),visualRoot=new THREE.Group();
    visualRoot.position.set(-c.x,-box.min.y,-c.z);
    visualRoot.add(inst);worldRoot.add(visualRoot);
    /* 启动 AnimationMixer + Idle */
    let mixer=null,idle=null;
    const anims=variant?_variantAnimations(variant):_inPlaceAnimations(charName);
    if(anims.length){
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
    const actions={idle:actIdle,walk:actWalk,die:actDie};
    for(const clip of anims){
      const key=String(clip&&clip.name||"").toLowerCase();
      if(key.includes("attack")&&!actions[key])actions[key]=mixer.clipAction(clip);
    }
    worldRoot.userData.giantZombieScale=isBoss?(survivalCharacter?5.2:2.4):1;
    return {group:worldRoot,visualRoot,animationRoot:inst,mixer,fallback:false,
      lodHeight:targetHeight,variantId:variant&&variant.id,variantPack:variant&&variant.pack,actions,poseBones,baseBoneRotations};
  }catch(err){
    console.warn("[spawnEnemy] character clone failed, fallback to makeTank:",err);
    return {group:makeTank(t.color,t.turret,t.scale),mixer:null,fallback:true,actions:{}};
  }
}

function _spreadEnemySpawn(origin,index){
  const ang=index*2.399963229728653+(Math.random()-.5)*.35;
  const ring=.85+(index%7)*.5;
  for(const scale of [1,.6,.3]){
    const x=origin.x+Math.cos(ang)*ring*scale,z=origin.z+Math.sin(ang)*ring*scale;
    if(!blockedForTank(x,z,TILE*.16,heightAt(origin.x,origin.z)))return {x,z};
  }
  return {x:origin.x+(Math.random()*2-1)*.5,z:origin.z+(Math.random()*2-1)*.5};
}
function spawnEnemy(typeKey,isBoss=false,sourceWave=game.wave){
  const waveSpec=SurvivalSystem.waveProfile(Math.max(1,sourceWave));
  const bossSpec=isBoss?SurvivalSystem.bossProfile(Math.max(1,sourceWave)):null;
  if(bossSpec)typeKey=bossSpec.id;
  const diff=(ACTIVE_MODE.difficultyScale||(w=>1))(sourceWave);
  const damageDiff=ACTIVE_MODE.key==="survival"?waveSpec.damageMultiplier:diff;
  let t=isBoss?Object.assign({},BOSS_TYPE,{color:bossSpec?bossSpec.color:BOSS_TYPE.color,
                hp:(BOSS_TYPE.hp+Math.max(0,sourceWave-5)*4)*(bossSpec?bossSpec.hpMultiplier/4:1)})
              :ENEMY_TYPES[typeKey];
  const movementType=isBoss?"boss":(SurvivalSystem.ENEMY_MOVEMENT[typeKey]?typeKey:"normal");
  const selectedDifficulty=ACTIVE_MODE.key==="survival"?Math.max(.1,Number(game.difficultyMultiplier)||1):1;
  t=Object.assign({},t,{hp:Math.ceil(t.hp*diff*selectedDifficulty),dmg:t.dmg*damageDiff*selectedDifficulty,
    speed:SurvivalSystem.enemyMoveSpeed(movementType,waveSpec.speedMultiplier)});
  /*  角色模型克隆（含 AnimationMixer 启动）；模型未就绪时回退 makeTank() */
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
  const spread=_spreadEnemySpawn(c,enemies.length);
  group.position.set(spread.x,heightAt(spread.x,spread.z),spread.z);
  /*  巨型丧尸：第4波起按波次概率放大，终焉波大量出现。 */
  let giant=false,elite=false,frenzy=false;
  let bodyScale=1;
  if(!isBoss&&Math.random()<(waveSpec.giantChance||0)){
    giant=true;
    bodyScale=sourceWave>=10?2.05:1.85;
    t=Object.assign({},t,{hp:Math.ceil(t.hp*2.35),dmg:t.dmg*1.28,score:t.score*2});
    group.scale.multiplyScalar(bodyScale);
  }
  if(!isBoss&&!giant&&sourceWave>=3&&Math.random()<.12){
    elite=true;
    t=Object.assign({},t,{hp:Math.ceil(t.hp*2.5),
      speed:Math.min(SurvivalSystem.ENEMY_MOVEMENT[movementType].max,t.speed*.92),score:t.score*3});
    group.scale.multiplyScalar(1.22);
    const gold=new THREE.Color(0xffd75e);
    group.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){
      o.material=o.material.clone();o.material.color.lerp(gold,.45);}});
    /*  狂暴词缀：第6波起精英有概率狂暴（移速大增、红纹） */
    if(sourceWave>=6&&Math.random()<.45){
      frenzy=true;t=Object.assign(t,{speed:Math.min(SurvivalSystem.ENEMY_MOVEMENT[movementType].max,t.speed*1.32)});
      group.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){
        o.material.color.lerp(new THREE.Color(0xff4444),.4);}});
    }
    if(!game._eliteToast){game._eliteToast=true;toast(" 检测到精英敌军！");}
    bodyScale*=1.22;
  }
  /* 同类尸潮保留体型区间差异，避免刷出整齐的复制人队列。 */
  if(!isBoss){
    const crowdSize=.88+Math.random()*.24;
    group.scale.multiplyScalar(crowdSize);bodyScale*=crowdSize;
  }
  scene.add(group);
  /*  角色模型需要面向镜头（默认朝 +Z），转向 +X 朝向战场内侧 */
  group.rotation.y=-Math.PI/2;
  /* 视觉尺寸只供表现使用，躯干碰撞从实际网格单独提取。 */
  const visualRadius=.65*t.scale*bodyScale;
  /* 手臂不撑开躯干碰撞；外接半径只负责邻域粗筛，接触使用凸轮廓。 */
  const collisionHull=zombieBodyHull(built.animationRoot||group,group);
  const modelRadius=collisionHull.length>=3?Math.max(...collisionHull.map(p=>Math.hypot(p.x,p.z))):modelFootprintRadius(built.visualRoot||group,visualRadius*.58);
  const e={sourceWave,group,visualRoot:built.visualRoot||group,animationRoot:built.animationRoot||group,
    _lodHeight:(built.lodHeight||3.2)*bodyScale,hordeId:++_enemySerial,variantId:built.variantId||null,variantPack:built.variantPack||null,
    type:typeKey,boss:isBoss,bossId:bossSpec&&bossSpec.id,bossName:bossSpec&&bossSpec.name,bossMechanic:bossSpec&&bossSpec.mechanic,
    elite,giant,frenzy,hp:t.hp,maxHp:t.hp,speed:t.speed,maxSpeed:SurvivalSystem.ENEMY_MOVEMENT[movementType].max,
    armor:Math.max(t.armor||0,waveSpec.armor||0),
    lifesteal:(bossSpec&&bossSpec.mechanic==="lifesteal") ? .45 : (t.lifesteal||0),siege:!!t.siege,
    fireCd:t.fireCd,dmg:t.dmg,visualRadius,
    radius:modelRadius,collisionHull,collisionHullRadius:modelRadius,heading:Math.PI,
    cd:1+Math.random()*1.5,thinkTimer:0,dir:new THREE.Vector3(0,0,1),
    score:t.score,alive:true,spawnFlash:performance.now()+(isBoss||elite?700:0),beam:null,objectiveKind:"base",objectiveCell:null,
    slowMult:1,slowUntil:0,velocity:new THREE.Vector3(),
    mixer,characterModel:!built.fallback,currentAnim:_ANIM_IDLE,actions:built.actions||{},poseBones:built.poseBones||{},baseBoneRotations:built.baseBoneRotations||{},attackPose:0,poseDirty:true,
    dying:false,dyingT:0,specialCd:isBoss?7:0,hasteUntil:0,phaseUntil:0};
  if(isBoss||elite){
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(e.radius*.9,e.radius*.9,14,12,1,true),
      new THREE.MeshBasicMaterial({color:isBoss?0xffb02e:0xffd75e,transparent:true,opacity:.4,
        side:THREE.DoubleSide}));
    beam.position.set(group.position.x,7,group.position.z);
    scene.add(beam);e.beam=beam;
  }else e.beam=null;
  applyEnemyHealthPressure(e);
  enemies.push(e);
  game.aliveThisWave++;
}

/* 释放仅由运行时临时创建、且不与资产源共享的对象（弹体、出生光柱等）。 */
function clearEnemyTargetReferences(enemy){
  for(const turret of builtTurrets)if(turret.lockTarget===enemy)turret.lockTarget=null;
  for(const unit of friendlyUnits)if(unit.attackTarget===enemy)unit.attackTarget=null;
  if(player?.attackTarget===enemy)player.attackTarget=null;
}
function releaseEnemyResources(enemy){
  if(!enemy||enemy._resourcesReleased)return;
  enemy.alive=false;clearEnemyTargetReferences(enemy);
  enemy._resourcesReleased=true;
  if(enemy.mixer){enemy.mixer.stopAllAction();enemy.mixer.uncacheRoot(enemy.animationRoot||enemy.group);}
  const skeletons=new Set(),materials=new Set();
  enemy.group.traverse(object=>{
    if(object.skeleton&&!skeletons.has(object.skeleton)){skeletons.add(object.skeleton);object.skeleton.dispose();}
    if(object.geometry&&!enemy.characterModel&&!_sharedGeoms.has(object.geometry))object.geometry.dispose();
    for(const material of (Array.isArray(object.material)?object.material:[object.material])){
      if(material&&!_sharedMats.has(material)&&!materials.has(material)){materials.add(material);material.dispose();}
    }
  });
}
function disposeTransientObject3D(root){
  if(!root)return;
  root.traverse((object)=>{
    if(object.geometry&&typeof object.geometry.dispose==="function")object.geometry.dispose();
    if(!object.material)return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    materials.forEach((material)=>{if(material&&typeof material.dispose==="function")material.dispose();});
  });
}

/* ---------------- 子弹 ---------------- */
const TURRET_PROJECTILE_SPEED=27;
function makeProjectileMesh(type,dirVec){
  const spec=SurvivalSystem.PROJECTILE_VISUALS[type]||SurvivalSystem.PROJECTILE_VISUALS.tank;
  const root=new THREE.Group(),axis=new THREE.Vector3(0,0,1),dir=dirVec.clone().normalize();
  const capsule=(radius,length,radial, tubular)=>typeof THREE.CapsuleGeometry==="function"?new THREE.CapsuleGeometry(radius,length,radial,tubular):new THREE.CylinderGeometry(radius,radius,length+radius*2,radial);
  const material=(emissive=.16,roughness=.42,metalness=.55)=>new THREE.MeshStandardMaterial({color:spec.color,emissive:new THREE.Color(spec.color).multiplyScalar(emissive),emissiveIntensity:emissive>1?emissive:1,roughness,metalness});
  let body;
  if(spec.shape==="tracer"){
    body=new THREE.Mesh(capsule(spec.radius,Math.max(.1,spec.length-.12),4,8),material(1.8,.3,.25));
    body.rotation.x=Math.PI/2;root.add(body);
    const core=new THREE.Mesh(new THREE.BoxGeometry(spec.radius*.35,spec.radius*.35,spec.length*1.18),material(3,.2,.05));root.add(core);
  }else if(spec.shape==="sabot-dart"){
    body=new THREE.Mesh(new THREE.ConeGeometry(spec.radius,spec.length,8),material(1.1,.26,.7));body.rotation.x=-Math.PI/2;root.add(body);
    const fin=new THREE.Mesh(new THREE.BoxGeometry(spec.radius*.8,spec.radius*.08,spec.length*.45),material(.6,.35,.8));fin.position.z=spec.length*.22;root.add(fin);
  }else if(spec.shape==="crystal-orb"){
    body=new THREE.Mesh(new THREE.IcosahedronGeometry(spec.radius,1),material(2.4,.12,.2));root.add(body);
    for(const scale of [1.35,1.7]){const ring=new THREE.Mesh(new THREE.TorusGeometry(spec.radius*scale,.025,6,18),material(2.8,.12,.1));ring.rotation.y=Math.PI/2;root.add(ring);}
  }else if(spec.shape==="round-shell"){
    body=new THREE.Mesh(new THREE.SphereGeometry(spec.radius,12,10),material(.7,.32,.75));root.add(body);
    const band=new THREE.Mesh(new THREE.TorusGeometry(spec.radius*.92,spec.radius*.08,6,16),material(1.4,.25,.6));band.rotation.y=Math.PI/2;root.add(band);
  }else if(spec.shape==="fire-shell"){
    body=new THREE.Mesh(new THREE.ConeGeometry(spec.radius,spec.length,8),material(2.2,.22,.35));body.rotation.x=-Math.PI/2;root.add(body);
    const glow=new THREE.Mesh(new THREE.SphereGeometry(spec.radius*.72,8,6),new THREE.MeshBasicMaterial({color:0xffd36a,transparent:true,opacity:.8}));glow.position.z=-spec.length*.22;root.add(glow);
  }else{
    body=new THREE.Mesh(capsule(spec.radius,Math.max(.08,spec.length-spec.radius*2),6,10),material(.9,.3,.65));body.rotation.x=Math.PI/2;root.add(body);
  }
  root.quaternion.setFromUnitVectors(axis,dir);
  root.userData.projectileType=type;root.userData.projectileShape=spec.shape;root.userData.trail=spec.trail;
  return root;
}
function shoot(owner,dirVec,friendly=false,opts={}){
  const isPlayer=owner==="player";
  const speed=isPlayer?34*game.stats.bulletSpeed:(friendly?TURRET_PROJECTILE_SPEED:22);
  const dmg=isPlayer?game.stats.dmg*(1+(TECH_TREE.tank.effect.damagePct||0.07)*researchPowerLevel(game.tech.tank||0)):owner.dmg*(friendly?1:survivalPressureMultiplier());
  const projectileType=opts.projectileType||(isPlayer?"tank":(friendly?"tank":"cannon"));
  const projectileSpec=SurvivalSystem.PROJECTILE_VISUALS[projectileType]||SurvivalSystem.PROJECTILE_VISUALS.tank;
  const color=projectileSpec.color;
  const grp=isPlayer?player.group:owner.group;
  const origin=opts.origin?new THREE.Vector3().copy(opts.origin):new THREE.Vector3().copy(grp.position);
  if(!opts.origin)origin.y+=1.7;
  /*  防穿墙：出膛点沿炮管逐步外推，遇墙截停
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
    const m=makeProjectileMesh(projectileType,dirVec);
    m.position.copy(p);
    scene.add(m);
    bullets.push({mesh:m,vel:opts.velocity?opts.velocity.clone():dirVec.clone().multiplyScalar(speed),gravity:opts.gravity||0,burnDamage:opts.burnDamage||0,burnDuration:opts.burnDuration||0,flightY:!opts.gravity&&Math.abs(dirVec.y)<.001?p.y:null,dmg,source:opts.source||null,
      owner:(isPlayer||friendly)?"player":"enemy",life:3,projectileType,trail:projectileSpec.trail,
      thruWall:!!opts.thruWall,
      pierceLeft:isPlayer?game.stats.pierce:(friendly?(opts.pierce||0):0),
      armorPierce:friendly?Math.max(0,Math.min(1,opts.armorPierce??opts.pierce??0)):0,
      bounce:isPlayer?game.stats.bounce:0,
      blast:isPlayer?game.stats.blastRadius:(friendly?(opts.blast||owner.blast||0):0),
      hitSet:new Set()});
    spawnParticles(p,color,4,3,.12);
  }
  if(isPlayer||friendly){
    const caliber=projectileType==="machinegun"?"small":projectileType==="antitank"||projectileType==="cannon"?"large":owner&&owner.type==="heavy"?"large":"medium";
    if(projectileType==='incendiary'||projectileType==='grenade')playSpecialWeapon(projectileType);else sfx.shoot(caliber);
  }else sfx.eshoot();
}

/* ---------------- 粒子：单 Points 合批，避免每粒子一个 Mesh/材质 ---------------- */
const PARTICLE_LIMIT=1400;
const particleFx=BattleEffects.createBatch(PARTICLE_LIMIT),particleBatch=particleFx.mesh,particleGeometry=particleBatch.geometry;
const particlePool=[];
scene.add(particleBatch);
function spawnParticles(pos,color,count,power,size=1){
  if(window.Settings&&!Settings.isParticles())return;
  for(let i=0;i<count;i++){
    if(particles.length>=PARTICLE_LIMIT)break;
    const p=particlePool.pop()||{position:new THREE.Vector3(),color:new THREE.Color(),vel:new THREE.Vector3()};
    p.position.copy(pos);p.color.setHex(color);p.size=size;p.life=p.total=.5+Math.random()*.4;
    p.vel.set((Math.random()-.5)*power,(Math.random()*.8+.2)*power,(Math.random()-.5)*power);particles.push(p);
  }
}
function explode(pos,big=false){
  spawnParticles(pos,0xffb02e,big?26:12,big?14:9,big?1.4:1);
  spawnParticles(pos,0xff5d2e,big?18:8,big?11:7,big?1.1:.8);
  spawnParticles(pos,0x777777,big?10:5,5,.9);
  camShake=Math.max(camShake,big?.9:.4);
  (big?sfx.bigboom:sfx.boom)();
}
function corpseSharedAssets(){
  if(_corpseShared)return _corpseShared;
  const head=new THREE.SphereGeometry(.22,8,6);
  const limb=new THREE.CylinderGeometry(.11,.11,.5,6);
  const drop=new THREE.SphereGeometry(.06,5,4);
  const splat=new THREE.CircleGeometry(1,11);
  const flesh=new THREE.MeshStandardMaterial({color:0x26333a,roughness:.95,metalness:.05});
  const bloods=Array.from({length:8},(_,i)=>{
    const t=i/7;
    return new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.12+.42*(1-t),.008+.025*(1-t),.012+.035*(1-t)),transparent:true,opacity:.88,depthWrite:false});
  });
  [head,limb,drop,splat].forEach((geo)=>_sharedGeoms.add(geo));
  _sharedMats.add(flesh);bloods.forEach((mat)=>_sharedMats.add(mat));
  _corpseShared={head,limb,drop,splat,flesh,bloods};
  return _corpseShared;
}
function spawnCorpseRemains(pos,big=false,scale=1){
  const shared=corpseSharedAssets(),root=new THREE.Group();
  const denseHorde=enemies.length>120;
  root.scale.setScalar(Math.max(.25,Math.min(1.2,Number(scale)||1)));
  const infection=Math.random(),bloodMat=shared.bloods[Math.min(7,Math.floor(infection*8))];
  const splat=(radius,opacity=.78,offsetX=0,offsetZ=0)=>{
    const mat=bloodMat.clone();mat.opacity=opacity;
    const mesh=new THREE.Mesh(shared.splat,mat);
    mesh.rotation.set(-Math.PI/2,0,Math.random()*Math.PI*2);
    mesh.position.set(offsetX,.035,offsetZ);
    mesh.scale.set(radius*(.7+Math.random()*.5),radius*(.55+Math.random()*.55),1);
    mesh.renderOrder=1;mesh.raycast=()=>{};mesh.userData.blood=true;root.add(mesh);
  };
  splat(big?1.65:.82,.78);
  for(let i=0;i<(big?7:(denseHorde?1:4));i++){
    const a=Math.random()*Math.PI*2,d=(big?1.2:.7)+Math.random()*(big?2.8:1.6);
    splat(big?.34:.2,.52,Math.cos(a)*d,Math.sin(a)*d);
  }
  root.position.copy(pos);scene.add(root);corpseDecals.push({root,pieces:[],life:Infinity,settle:0});
  while(corpseDecals.length>180){const old=corpseDecals.shift();if(old){scene.remove(old.root);disposeTransientObject3D(old.root);}}
}
function spawnGoreBurst(enemy,hitPoint,hitDirection,intensity=1){
  if(!enemy||enemies.length>260)return;
  const now=performance.now();if(now<(enemy._goreCooldown||0))return;
  enemy._goreCooldown=now+(enemy.boss?90:135);
  const shared=corpseSharedAssets(),root=new THREE.Group(),pieces=[];
  const origin=hitPoint?.clone?.()||enemy.group.position.clone().setY(1.1);
  const forward=hitDirection?.clone?.()||new THREE.Vector3((Math.random()-.5),.3,(Math.random()-.5));
  if(forward.lengthSq()<1e-5)forward.set(0,.3,1);forward.normalize();
  const count=enemy.boss?7:3+Math.floor(Math.random()*3),mats=[shared.flesh,shared.bloods[1],shared.bloods[3]];
  for(let i=0;i<count;i++){
    const mesh=new THREE.Mesh(i===0&&Math.random()<.35?shared.head:(i%3===0?shared.limb:shared.drop),mats[i%3]);
    mesh.scale.setScalar((.65+Math.random()*.7)*Math.min(1.3,enemy.radius/.35));
    mesh.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);mesh.userData.gore=true;root.add(mesh);
    const spread=new THREE.Vector3((Math.random()-.5)*1.8,(Math.random()*.8+.35)*1.5,(Math.random()-.5)*1.8);
    pieces.push({mesh,velocity:forward.clone().multiplyScalar((3.5+Math.random()*4.5)*intensity).add(spread),spin:new THREE.Vector3((Math.random()-.5)*14,(Math.random()-.5)*14,(Math.random()-.5)*14),blood:i%3===1});
  }
  root.position.copy(origin);scene.add(root);corpseDecals.push({root,pieces,life:.9+Math.random()*.45,settle:.9});
  spawnParticles(origin,0x8f1d25,Math.ceil(8*intensity),8*intensity,.55);
  while(corpseDecals.length>180){const old=corpseDecals.shift();if(old){scene.remove(old.root);disposeTransientObject3D(old.root);}}
}
/*  电磁塔连锁闪电视觉：两点间一次性闪光线段，随粒子循环衰减 */
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
  else if(key==="bomb"){game.bombs++;toast(" 空袭轰炸 ×1（按 P 释放）");}
  updateBuffUI();updateHpUI();
}

/* ---------------- 碰撞 ---------------- */
function solidForTank(t,isBullet){
  if(t===T_EMPTY||t===T_ROAD||t===T_PLATEAU||t===T_RAMP||t===T_BRIDGE)return false;
  if(isBullet&&t===T_WATER)return false;
  return true;   // BRICK STEEL WATER BUILDING BASE
}
/*  P0-3：攀爬容差统一常量
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
// Mixed-height cells describe a build restriction, not a solid square cliff collider.
function isNaturalBoundaryCell(x,z){
  const key=idx(x,z);
  return ACTIVE_MODE.key==='survival'&&terrainSurface?.natural?.wholeCells[key]===-1
    &&grid[z]?.[x]===T_STEEL&&!structCells.has(key)&&!steelHP.has(key);
}
function naturalGroundClear(x,z,radius){
  if(!terrainSurface?.natural)return true;
  const r=radius*.6;
  for(const [dx,dz] of [[0,0],[-r,-r],[r,-r],[-r,r],[r,r]]){
    const px=x+dx,pz=z+dz,cell=cellOf(px,pz);
    if(!inMap(cell.x,cell.z))return false;
    if(naturalStairHeight(px,pz)!==null)continue;
    const h=heightAt(px,pz);
    if(h>.08&&h<PH-.08)return false;
  }
  return true;
}
function blockedForTank(px,pz,radius,curH,isBullet=false,isPlayer=false,ignoredCells=null){
  if(!isBullet&&ACTIVE_MODE.key==='survival'){
    const seen=new Set();
    for(const [key] of wallMeta){
      const wall=tileMeshes[key];
      if(!wall?.userData.wallCollisionParts||seen.has(wall)||!(steelHP.get(key)>0)||ignoredCells?.has(key))continue;
      seen.add(wall);
      const x=px-wall.position.x,z=pz-wall.position.z;
      for(const part of wall.userData.wallCollisionParts){
        const dx=Math.max(part.minX-x,0,x-part.maxX),dz=Math.max(part.minZ-z,0,z-part.maxZ);
        if(dx*dx+dz*dz<radius*radius)return true;
      }
    }
  }
  let touchesBoundary=false;
  const minC=cellOf(px-radius,pz-radius),maxC=cellOf(px+radius,pz+radius);
  for(let cz=minC.z;cz<=maxC.z;cz++)for(let cx=minC.x;cx<=maxC.x;cx++){
    if(!inMap(cx,cz))return true;
    const t=grid[cz][cx],cellIndex=idx(cx,cz);
    if(!isBullet&&steelHP.get(cellIndex)>0&&tileMeshes[cellIndex]?.userData.wallCollisionParts)continue;
    if(!isBullet&&t===T_STEEL&&isNaturalBoundaryCell(cx,cz)){touchesBoundary=true;continue;}
    /*  守军可自由出入自家大门（仅生存），敌人不可 */
    if(isPlayer&&ACTIVE_MODE.key==="survival"&&t===T_BASE)continue;
    if(solidForTank(t,isBullet)||(!isBullet&&structCells.has(cellIndex)&&!ignoredCells?.has(cellIndex))){
      const c=cellCenter(cx,cz);
      if(Math.abs(px-c.x)<TILE/2+radius*.5&&Math.abs(pz-c.z)<TILE/2+radius*.5)return true;
    }
  }
  if(!isBullet&&((touchesBoundary&&!naturalGroundClear(px,pz,radius))||blockedByFixedCollider(px,pz,radius)))return true;
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
function navigationPositionClear(point,radius,ignoredCells=null){
  // Workers and vehicle routes go around the actual base footprint; the door animation is a separate portal.
  const min=cellOf(point.x-radius*.5,point.z-radius*.5),max=cellOf(point.x+radius*.5,point.z+radius*.5);
  for(let z=min.z;z<=max.z;z++)for(let x=min.x;x<=max.x;x++)if(!inMap(x,z)||grid[z][x]===T_BASE)return false;
  return !blockedForTank(point.x,point.z,radius,heightAt(point.x,point.z),false,true,ignoredCells);
}
function navigationSegmentClear(from,to,radius,ignoredCells=null){
  const distance=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.max(1,Math.ceil(distance/.4));
  let previous=heightAt(from.x,from.z);
  for(let i=1;i<=steps;i++){
    const point={x:from.x+(to.x-from.x)*i/steps,z:from.z+(to.z-from.z)*i/steps};
    if(!navigationPositionClear(point,radius,ignoredCells)||blockedForTank(point.x,point.z,radius,previous,false,true,ignoredCells))return false;
    previous=heightAt(point.x,point.z);
  }
  return true;
}
function smoothNavigationRoute(points,radius){
  if(points.length<3)return points;
  const result=[points[0]];let anchor=0;
  while(anchor<points.length-1){
    let next=points.length-1;
    while(next>anchor+1&&!navigationSegmentClear(points[anchor],points[next],radius))next--;
    result.push(points[next]);anchor=next;
  }
  return result;
}
function invalidateNavigation(){
  navigationStamp++;
  friendlyFlowCache.key='';
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
/*  构筑墙可被敌人拆毁：玩家放置的钢墙有耐久（8 点），地图原生钢墙不可破坏 */
const steelHP=new Map();
/* 恢复坡道通行。生存地图始终复用唯一连续坡体，其他模式才允许生成单格坡道。 */
function buildRampTile(parent,cx,cz){
  if(ACTIVE_MODE.mapType==="survival"){
    let continuousRamp=null;
    parent.traverse(object=>{
      if(!continuousRamp&&object.userData&&object.userData.assetName==="natural-plateau")continuousRamp=object;
    });
    return continuousRamp;
  }
  const ci=cz*GRID+cx,d=rampDir[ci],sl=terrainSurface.ramps[ci]||{};
  const base=sl.base||0,step=(sl.step!==undefined)?sl.step:PH;
  const name="cliff_blockSlope_rock";
  let rot=0;
  if(d){
    if(name==="tile-straight-slope")rot=d.x===-1?Math.PI:d.z===1?-Math.PI/2:d.z===-1?Math.PI/2:0;
    else rot=d.x===1?Math.PI/2:d.x===-1?-Math.PI/2:d.z===-1?Math.PI:0;
  }
  const srcR=ASSETS[name];
  const c=cellCenter(cx,cz);
  if(srcR){
    const inst=srcR.clone(true);
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
    const defenseLv=researchPowerLevel((game.tech&&game.tech.defense)||0),armor=Math.min(.65,(TECH_TREE.defense.effect.structureArmorPct||0.025)*defenseLv);
    const hp=steelHP.get(key)-dmg*(1-armor);
    if(hp<=0){
      steelHP.delete(key);
      structCells.delete(key);
      const wasRamp=wallMeta.get(key)&&wallMeta.get(key).wasRamp;
      /* 坡道格上的墙被砸破：逻辑恢复通行，连续坡体始终保留。 */
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
let flowField=null,flowDist=null;
/* 某格是否可被流场穿过：不可破钢墙（无 steelHP 的 T_STEEL）阻断；其余可穿（砖/玩家钢墙敌人会啃） */
function passableForFlow(cx,cz){
  if(!inMap(cx,cz))return false;
  const t=grid[cz][cx];
  const point=cellCenter(cx,cz);
  if(blockedByFixedCollider(point.x,point.z,.6))return false;
  if(isNaturalBoundaryCell(cx,cz)){
    const p=cellCenter(cx,cz);return naturalGroundClear(p.x,p.z,.4);
  }
  if(t===T_WATER)return false;
  if(t===T_TREE)return false;                         // 树干是实体，尸潮与坦克均需绕行
  if(t===T_BASE)return false;                         // 大门/基地不可穿（仅作目标）
  if(t===T_BUILDING)return false;                     // 主楼实体：流场绕开，防敌人卡住
  if(t===T_STEEL&&!steelHP.has(idx(cx,cz)))return false; // 原生/围墙钢墙不可破
  return true;
}
/* 从大门相邻格 BFS，填 flowDist（到门步数）；-1 表示不可达
    爬坡约束：相邻格心高差 >1.2 视为崖壁不可越（台地 2.2 阻断、坡道格心 ≤1.1 可越，
   兼容城市图整格坡 1.1 高差）→ 敌人只能沿坡道上下台地 */
/*  P0-3：相邻两格之间的真实攀爬高差
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
function flowCanStep(ax,az,bx,bz){
  const preservesRamp=(x,z)=>grid[z][x]===T_RAMP||wallMeta.get(idx(x,z))?.wasRamp===true;
  const touchesRamp=preservesRamp(ax,az)||preservesRamp(bx,bz);
  const limit=touchesRamp?PH/2+.15:STEP_UP;
  if(_stepStamp!==navigationStamp||_stepW!==GRID||!_stepCache){
    _stepCache=new Uint8Array(GRID*GRID*8);_stepCache.fill(255);_stepStamp=navigationStamp;_stepW=GRID;
  }
  const dx=bx-ax,dz=bz-az;
  let dir=-1;
  if(dx===1&&dz===0)dir=0;else if(dx===-1&&dz===0)dir=1;
  else if(dx===0&&dz===1)dir=2;else if(dx===0&&dz===-1)dir=3;
  else if(dx===1&&dz===1)dir=4;else if(dx===1&&dz===-1)dir=5;
  else if(dx===-1&&dz===1)dir=6;else if(dx===-1&&dz===-1)dir=7;
  if(dir<0)return flowStepRise(ax,az,bx,bz)<=limit;
  const slot=(az*GRID+ax)*8+dir,cached=_stepCache[slot];
  if(cached!==255)return cached===1;
  const ok=flowStepRise(ax,az,bx,bz)<=limit;
  _stepCache[slot]=ok?1:0;
  return ok;
}
function computeFlowField(){
  invalidateNavigation();
  const B=ACTIVE_MODE.base, dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  const targets=[];
  const survival=ACTIVE_MODE.key==='survival',startX=survival?B.col:B.gateCol,startZ=survival?B.row:B.gateRow,size=survival?2:1;
  for(let sz=startZ;sz<startZ+size;sz++)for(let sx=startX;sx<startX+size;sx++)for(const [dx,dz] of dirs){
    const x=sx+dx,z=sz+dz;
    if(inMap(x,z)&&passableForFlow(x,z)&&flowCanStep(sx,sz,x,z)&&!targets.some(t=>t.x===x&&t.z===z))targets.push({x,z});
  }
  flowField=new FlowField(GRID,GRID).compute(targets,{
    passable:passableForFlow,
    canStep:flowCanStep,
  });
  flowDist=flowField.distances;
  invalidateMinimapTerrain();
}
/* 依据流场为敌人选向下一格方向（仅 survival 使用）
    P0-2：流场最小值是 1（大门格 T_BASE 被 passableForFlow 判为不可穿），
   敌人站在 d=1 时四个邻居全 ≥2，原逻辑会顺着「最小邻居」把它推离大门 → 门口反复弹跳、永不啃门。
   这里显式判定「已抵达」，并额外用世界距离兜底（玩家用墙围门改道时仍能正确啃门）。 */
const GATE_ARRIVE_D=.05;      /* Dijkstra 目标格距离为 0 */
const GATE_MODEL_COLLISION_RADIUS=.35;
const GATE_ARRIVE_DIST=GATE_MODEL_COLLISION_RADIUS;   /* 门模型前沿的接触缓冲，不再使用基地中心空气半径 */
function gateCollisionPoint(){
  if(!baseGroup)return null;
  const collider=baseGroup.userData?.gateCollider;
  return collider?.localPoint?baseGroup.localToWorld(collider.localPoint.clone()):baseGroup.position;
}
function baseContactPoint(position){
  const p=baseGroup.position;
  return new THREE.Vector3(Math.max(p.x-TILE,Math.min(p.x+TILE,position.x)),p.y,Math.max(p.z-TILE,Math.min(p.z+TILE,position.z)));
}
function baseContactDistance(enemy){
  const p=enemy.group.position,b=baseGroup.position;
  return Math.hypot(Math.max(0,Math.abs(p.x-b.x)-TILE),Math.max(0,Math.abs(p.z-b.z)-TILE));
}
function flowDirFor(e){
  const p=e.group.position, here=cellOf(p.x,p.z);
  if(!inMap(here.x,here.z))return {best:null,bestD:Infinity,hereD:-1,atGate:false};
  const hereD=flowField?flowField.distanceAt(here.x,here.z):Infinity;
  if(baseContactDistance(e)<=.55+(e.radius||0))
    return {best:null,bestD:hereD,hereD,atGate:true};   /*  已抵达：不再下梯度 */
  if(hereD>=0&&hereD<=GATE_ARRIVE_D){const q=baseContactPoint(p),dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz)||1;return {best:[dx/d,dz/d],bestD:0,hereD,atGate:false};}
  const direction=flowField?flowField.directionAt(here.x,here.z):{x:0,z:0};
  let best=null;
  if(direction.x||direction.z){
    const next=cellCenter(here.x+Math.round(direction.x),here.z+Math.round(direction.z));
    const dx=next.x-p.x,dz=next.z-p.z,length=Math.hypot(dx,dz)||1;
    best=[dx/length,dz/length];
  }
  const bestD=best?hereD:Infinity;
  return {best,bestD,hereD,atGate:false};
}
function updateEnemyObjective(enemy){
  if(!enemy||!enemy.group||!enemy.dir)return "base";
  enemy.objectiveKind="base";enemy.objectiveCell=null;
  const p=enemy.group.position;
  /* 玩家巨岩在流场中视为可破通路：敌人沿合法道路接近基地，只有巨岩真正挡在
     当前行进方向上才切换攻击目标。禁止按欧氏距离直线追逐远处巨岩，否则隔着
     高台/悬崖也会撞向它，形成视野外永久卡波。 */
  const fx=p.x+enemy.dir.x*(enemy.radius+.8),fz=p.z+enemy.dir.z*(enemy.radius+.8);
  const cell=cellOf(fx,fz);
  if(inMap(cell.x,cell.z)&&((grid[cell.z][cell.x]===T_BRICK||steelHP.has(idx(cell.x,cell.z)))||ownedStructureAtCell(idx(cell.x,cell.z)))){
    enemy.objectiveKind="wall";enemy.objectiveCell={x:cell.x,z:cell.z};
  }
  return enemy.objectiveKind;
}
/* 大门血上限：基础 + HP等级 + 防御科技百分比加成。 */
function computeGateMaxHp(){
  const g=ACTIVE_MODE.gate||{};
  const lv=game.gateHpLv||0;
  const defenseLv=researchPowerLevel((game.tech&&game.tech.defense)||0);
  const base=(g.hp||600)+(g.hpPerLv||0)*lv;
  return Math.round(base*(1+(TECH_TREE.defense.effect.structureHpPct||0.1)*defenseLv));
}

/* ---------------- 大门受击（唯一入口：血/甲/反伤/恢复/闪避） ---------------- */
function damageGate(rawDmg, attackerPos){
  if(!baseAlive||!baseGroup)return;
  const g=ACTIVE_MODE.gate||{};
  /*  闪避：概率免疫一次伤害（不触发受击） */
  const dvLv=game.gateDodgeLv||0, dodge=(g.dodgePerLv||0)*dvLv;
  if(dodge>0&&Math.random()<dodge){
    spawnParticles(baseGroup.position.clone().setY(2),0x9fe8ff,6,5,.7);
    return;
  }
  /*  护甲：按等级减伤 */
  const arLv=game.gateArmorLv||0,defenseLv=researchPowerLevel((game.tech&&game.tech.defense)||0);
  const armor=Math.min(.7,(g.armorPerLv||0)*arLv+(TECH_TREE.defense.effect.structureArmorPct||0.025)*defenseLv);
  const dmg=ACTIVE_MODE.key==="survival"
    ?Math.max(.05,rawDmg*(1-armor))
    :Math.max(1,Math.round(rawDmg*(1-armor)));
  game.gateHp-=dmg;
  spawnParticles(baseGroup.position.clone().setY(1.8),0xff8080,8,6,.8);sfx.gate();sfx.hit();
  /*  反伤：反弹给攻击者 */
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
addEventListener('mobile-select-player',()=>{
 if(ACTIVE_MODE.key!=='survival'||![STATE.PLAYING,STATE.PREP,STATE.BUILD].includes(state))return;
 if(wc3BuildMode)closeWc3Build();
 const entries=[...(player?.alive?[{kind:'player',ref:player}]:[]),...friendlyUnits.filter(u=>u.alive).map(ref=>({kind:'unit',ref}))];
 if(!entries.length){toast('暂无部队，请先在重工厂生产');return;}
 wc3SetSelection(entries);wc3RenderSel();renderCmdCard();
 camFocus.x=entries[0].ref.group.position.x;camFocus.z=entries[0].ref.group.position.z;
});
addEventListener("keydown",e=>{
  keys[e.code]=true;
  if(e.code==="Space")e.preventDefault();
  /*  P3-9 WC3：空格 = 跳转镜头到基地/大门（事件点跳转） */
  if(e.code==="Space"&&ACTIVE_MODE.key==="survival"&&baseGroup&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD)){
    const f=baseGroup.position;
    camFocus.x=f.x;camFocus.z=f.z;
  }
  if(e.code==="Escape"){
    /*  新手引导 ESC 优先跳过 */
    if(questActive){questSkip();return;}
    if(state===STATE.PLAYING)setPause(true);
    else if(state===STATE.PAUSED)setPause(false);
    else if(state===STATE.TECH)closeTechMenu();
    else if(state===STATE.GATE)closeGateUp();
    else if(state===STATE.BUILD&&ACTIVE_MODE.key==="survival"&&wc3BuildMode)closeWc3Build();
    else if(state===STATE.BUILD&&ACTIVE_MODE.key==="survival")closeBuildMenu();
    else if(state===STATE.PREP)setPause(true);
  }
  if(e.code==="KeyQ"&&state===STATE.PLAYING)useBomb();
  if(!e.repeat&&ACTIVE_MODE.key==="survival"&&
     (state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD||state===STATE.TECH||state===STATE.GATE)){
    if(e.code==="BracketLeft"||e.key==="["){
      e.preventDefault();debugAddSurvivalGold();return;
    }
    if(e.code==="BracketRight"||e.key==="]"){
      e.preventDefault();debugSkipToNextSurvivalWave();return;
    }
  }
  /* v6.4.0：WAR3 上下文快捷键只选择对应建筑，不再打开平行弹窗。 */
  if(e.code==="KeyB"&&ACTIVE_MODE.key==="survival"&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD&&wc3BuildMode)){
    selectBaseForCommand(true);
    return;
  }
  if(e.code==="KeyB"&&ACTIVE_MODE.key!=="survival"&&(state===STATE.PLAYING||state===STATE.PREP))openBuildMenu();
  if(e.code==="KeyT"&&ACTIVE_MODE.key==="survival"&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD))selectResearchForCommand();
  if(e.code==="KeyG"&&ACTIVE_MODE.key==="survival"&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD))selectBaseForCommand(false,"root");
});
addEventListener("keyup",e=>keys[e.code]=false);
let wc3DragStart=null,wc3DragBox=null,rightCameraDrag=null;
function clearRightCameraDrag(){rightCameraDrag=null;renderer.domElement.style.cursor='';}
function updateRightCameraDrag(event){
  const drag=rightCameraDrag;if(!drag)return;
  if(!(event.buttons&2)||![STATE.PLAYING,STATE.PREP,STATE.BUILD].includes(state)){clearRightCameraDrag();return;}
  if(!drag.dragged&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;
  drag.dragged=true;renderer.domElement.style.cursor='grabbing';
  const scale=2*Math.tan(camera.fov*Math.PI/360)*Math.max(24,Math.min(120,camHeight))/innerHeight;
  const limit=HALF-4;
  camFocus.x=Math.max(-limit,Math.min(limit,camFocus.x-(event.clientX-drag.lastX)*scale));
  camFocus.z=Math.max(-limit,Math.min(limit,camFocus.z-(event.clientY-drag.lastY)*scale/Math.sin(Math.PI/3)));
  drag.lastX=event.clientX;drag.lastY=event.clientY;
}
addEventListener('blur',()=>{clearRightCameraDrag();mouse.down=false;for(const key of Object.keys(keys))keys[key]=false;});
function issueRightClickCommand(e){
    /*  P4-5：建造模式右键 = 取消当前条目；再无条目则收起建造模式 */
    if(state===STATE.BUILD&&wc3BuildMode){
      if(buildSel!==null)selectBuild(null);
      else closeWc3Build();
    }
    else if(buildSel!==null){selectBuild(null);}        // 建造中右键=取消（保留原语义）
    else if(wc3Sel&&wc3Sel.kind==="factory"){
      const w=screenToWorld(e.clientX,e.clientY);
      if(w){setFactoryRallyPoint(wc3Sel.ref,w);wc3Mark(w,0xc69a45);toast(" 重工厂集结点已更新");wc3RenderSel();}
    }
    else if(wc3Selection.some((entry)=>entry.kind==="player"||entry.kind==="unit")){
      const w=screenToWorld(e.clientX,e.clientY);
      if(w){
        const clicked=wc3PickAt(e.clientX,e.clientY),repairTarget=normalizeRepairTarget(clicked);
        const repairers=wc3Selection.filter((entry)=>entry.kind==="unit"&&entry.ref.type==="repair").map((entry)=>entry.ref);
        if(repairTarget&&repairers.length){
          repairers.forEach((unit)=>{if(repairTarget!==unit){unit.repairTarget=repairTarget;unit.autoRepairBlocked=false;unit.command="repair";}});
          wc3Mark(repairTarget.group.position,0xc69a45);return;
        }
        /* 点敌=攻击目标，点地=移动 */
        let tgt=null,bd=3.4*3.4;
        for(const en of enemies){
          if(!isEnemyCombatTarget(en)||!isPositionVisible(en.group.position))continue;
          const dx=en.group.position.x-w.x,dz=en.group.position.z-w.z;
          const dd=dx*dx+dz*dz;
          if(dd<bd){bd=dd;tgt=en;}
        }
        if(tgt){
          wc3Selection.filter((entry)=>entry.kind==="player"||entry.kind==="unit").forEach((entry)=>{entry.ref.attackTarget=tgt;entry.ref.moveTarget=null;entry.ref.attackMove=false;entry.ref.command="attack";});
          wc3Mark(tgt.group.position,0xff5d5d);
        }else{issueSelectionCommand("move",w);wc3Mark(w,0x39d98a);}
      }
    }
}

function updateWc3DragBox(event){
  if(!wc3DragStart)return;
  if(!wc3DragBox){wc3DragBox=document.createElement("div");wc3DragBox.style.cssText="position:fixed;border:1px solid #68df78;background:rgba(70,170,85,.14);pointer-events:none;z-index:80";document.body.appendChild(wc3DragBox);}
  const left=Math.min(wc3DragStart.x,event.clientX),top=Math.min(wc3DragStart.y,event.clientY);
  wc3DragBox.style.left=`${left}px`;wc3DragBox.style.top=`${top}px`;wc3DragBox.style.width=`${Math.abs(event.clientX-wc3DragStart.x)}px`;wc3DragBox.style.height=`${Math.abs(event.clientY-wc3DragStart.y)}px`;
}
addEventListener("mousemove",e=>{mouse.x=e.clientX;mouse.y=e.clientY;updateWc3DragBox(e);updateRightCameraDrag(e);});
/*  P3-9 WC3 式操作（生存模式）：
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
  if(!intersectTerrainRay(_ray.ray,hit))return null;
  hit.x=Math.max(-HALF+TILE,Math.min(HALF-TILE,hit.x));
  hit.z=Math.max(-HALF+TILE,Math.min(HALF-TILE,hit.z));
  return hit;
}
function isInteractiveUiPointer(e){
  const target=e&&e.target;
  return !!(target&&target.closest&&target.closest("button,.cmdBtn,.shopItem,.techCard,#wc3dock,#resDock,#minimap,.overlay"));
}
addEventListener("mousedown",e=>{
  if(isInteractiveUiPointer(e))return;
  if(e.button===0){mouse.down=true;
    if(state===STATE.BUILD){
      if(destroyMode){
        const c=pickCell();
        if(c)attemptDestroy(c.x,c.z);
      }else if(buildSel!==null){
        /* 只有点到可经营建筑/单位才打断放置；地形、幽灵、崖壁一律按当前蓝图格建造。 */
        const hit=wc3PickAt(e.clientX,e.clientY);
        const selectable=hit&&["goldmine","house","research","heroHub","factory","beacon","turret","unit","player","base"].includes(hit.kind);
        if(selectable){
          const entries=e.detail>=2?wc3VisibleSameTypeEntries(hit):[hit];
          wc3SetSelection(entries);
          if(e.detail>=2)selectBuild(null);
          wc3RenderSel();renderCmdCard();
        }else if(!e.mobileTouch&&ghost&&ghost.visible&&ghostCell){
          tryPlace();
        }else{
          const c=pickCell();
          if(c){ghostCell=c;if(ghost)ghost.visible=true;tryPlace();}
        }
      }
      /*  P4-5：建造模式无选中条目时点击 = 点选 */
      else if(wc3BuildMode){
        const hit=wc3PickAt(e.clientX,e.clientY);
        if(hit){
          const entries=e.detail>=2?wc3VisibleSameTypeEntries(hit):[hit];
          wc3SetSelection(entries);
        }else wc3ClearSel();
        wc3RenderSel();renderCmdCard();
      }
    }
    else if(ACTIVE_MODE.key==="survival"&&wc3AttackMove){
      const w=screenToWorld(e.clientX,e.clientY);
      if(w&&wc3AttackMove==="rally"&&wc3Sel&&wc3Sel.kind==="factory"){
        setFactoryRallyPoint(wc3Sel.ref,w);wc3Mark(w,0xc69a45);toast(" 重工厂集结点已更新");wc3RenderSel();
      }else if(w){issueSelectionCommand(wc3AttackMove==="patrol"?"patrol":"attackMove",w);wc3Mark(w,wc3AttackMove==="patrol"?0x68d88a:0xff5d5d);}
      wc3AttackMove=false;
    }
    else if(ACTIVE_MODE.key==="survival"){
      wc3DragStart={x:e.clientX,y:e.clientY,shift:e.shiftKey};
    }
  }
  if(e.button===2&&ACTIVE_MODE.key==='survival'&&[STATE.PLAYING,STATE.PREP,STATE.BUILD].includes(state)){
    rightCameraDrag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,dragged:false};
    e.preventDefault();
  }else if(e.button===2&&state===STATE.BUILD)selectBuild(null);
});
addEventListener("mouseup",e=>{
  if(e.button===2&&rightCameraDrag){
    const gesture=rightCameraDrag;clearRightCameraDrag();
    if(!gesture.dragged&&!isInteractiveUiPointer(e)&&[STATE.PLAYING,STATE.PREP,STATE.BUILD].includes(state))issueRightClickCommand(e);
    return;
  }
  if(e.button!==0)return;mouse.down=false;
  if(!wc3DragStart)return;
  const start=wc3DragStart;wc3DragStart=null;if(wc3DragBox){wc3DragBox.remove();wc3DragBox=null;}
  const distance=Math.hypot(e.clientX-start.x,e.clientY-start.y);
  let entries=[];
  if(distance<6){
    const hit=wc3PickAt(e.clientX,e.clientY);
    if(hit)entries=e.detail>=2?wc3VisibleSameTypeEntries(hit):[hit];
  }
  else{
    const left=Math.min(start.x,e.clientX),right=Math.max(start.x,e.clientX),top=Math.min(start.y,e.clientY),bottom=Math.max(start.y,e.clientY);
    const candidates=[...(player&&player.alive?[{kind:"player",ref:player}]:[]),...friendlyUnits.filter((unit)=>unit.alive).map((unit)=>({kind:"unit",ref:unit}))];
    entries=candidates.filter((entry)=>{const point=entry.ref.group.position.clone().project(camera),x=(point.x+1)*innerWidth/2,y=(-point.y+1)*innerHeight/2;return x>=left&&x<=right&&y>=top&&y<=bottom;});
  }
  if(start.shift&&entries.length){
    const merged=[...wc3Selection];for(const entry of entries){const index=merged.findIndex((old)=>old.ref===entry.ref);if(index>=0)merged.splice(index,1);else merged.push(entry);}entries=merged;
  }
  if(entries.length)wc3SetSelection(entries);else wc3ClearSel();wc3RenderSel();renderCmdCard();
});
addEventListener("contextmenu",e=>{e.preventDefault();});   /*  WC3：全局禁右键菜单 */
/*  WC3：A 键攻击移动预备 */
let wc3AttackMove=false;
addEventListener("keydown",e=>{
  if(e.repeat)return;
  if(e.code==="F1"&&ACTIVE_MODE.key==="survival"&&player&&player.alive){
    e.preventDefault();wc3Select("player",player);wc3RenderSel();
  }
  if(e.code==="Escape"&&wc3AttackMove){wc3AttackMove=false;renderCmdCard();}
  if(e.code==="KeyA"&&ACTIVE_MODE.key==="survival"&&wc3Selection.some((entry)=>entry.kind==="player"||entry.kind==="unit")&&(state===STATE.PLAYING||state===STATE.PREP)){
    wc3AttackMove=true;
    toast(" 攻击移动：左键点击目标位置");
  }
  if(e.code==="KeyS"&&ACTIVE_MODE.key==="survival")issueSelectionCommand("stop");
  if(e.code==="KeyP"&&ACTIVE_MODE.key==="survival"&&wc3Selection.some((entry)=>entry.kind==="player"||entry.kind==="unit")){
    wc3AttackMove="patrol";toast(" 巡逻：左键点击另一端");
  }
  if(e.code==="KeyU"&&!e.repeat&&ACTIVE_MODE.key==="survival"&&wc3Sel&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD)){
    const upgrade=commandItemsForSelection().find((item)=>item.hot==="U");
    if(upgrade){
      e.preventDefault();
      if(upgrade.dim)toast(" 当前选择没有可支付的升级");
      else if(upgrade.act)upgrade.act();
    }
  }
  if(!e.repeat&&ACTIVE_MODE.key==="survival"&&wc3Sel&&(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD)){
    const hot=e.code&&e.code.startsWith("Key")&&e.code.length===4?e.code.slice(3):e.code&&e.code.startsWith("Digit")?e.code.slice(5):/^[0-9]$/.test(e.key)?e.key:null;
    if(hot&&hot!=="A"&&hot!=="S"&&hot!=="P"&&hot!=="U"&&hot!=="B"&&hot!=="T"&&hot!=="G"){
      const matches=commandItemsForSelection().filter((item)=>String(item.hot)===hot&&item.act);
      if(matches.length===1){e.preventDefault();if(!matches[0].dim)matches[0].act();return;}
    }
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
/*  生存 RTS：滚轮缩放 —— P4-4 只改镜头距离（camHeight 复用为 dist），俯仰角固定 */
addEventListener("wheel",e=>{
  if(ACTIVE_MODE.key!=="survival")return;
  if(!(state===STATE.PLAYING||state===STATE.PREP||state===STATE.BUILD))return;
  e.preventDefault();
  const step=e.deltaY>0?1:-1;
  camHeight=Math.max(24,Math.min(120,camHeight+step*7));
},{passive:false});
function useBomb(){
  if(game.bombs<=0)return;
  game.bombs--;toast(" 空袭轰炸！");sfx.bigboom();camShake=1.2;
  [...enemies].forEach(e=>{if(performance.now()>=e.spawnFlash)killEnemy(e,false);});
  updateBuffUI();
}

/* ---------------- UI ---------------- */
const $=id=>document.getElementById(id);
function updateHpUI(){
  /*  英雄相关（经典/塔防）：仅存在英雄时显示装甲与命数 */
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
    $("baseShieldText").textContent=` ${Math.max(0,Math.ceil(game.gateHp))} / ${game.gateMaxHp}`;
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
    el.insertAdjacentHTML("beforeend",`<span class="buff"> 护盾 ${((game.buffs.shieldUntil-now)/1000)|0}s</span>`);
  if(now<game.buffs.rapidUntil)
    el.insertAdjacentHTML("beforeend",`<span class="buff"> 速射 ${((game.buffs.rapidUntil-now)/1000)|0}s</span>`);
  if(game.bombs>0)
    el.insertAdjacentHTML("beforeend",`<span class="buff"> 空袭 ×${game.bombs}</span>`);
  Object.entries(game.upgrades).forEach(([id,lv])=>{
    const u=UPGRADES.find(u=>u.id===id);
    el.insertAdjacentHTML("beforeend",
      `<span class="buff">${u.type==="base"?"":""}${UIIcons.svg(u.icon)} ${u.name} Lv${lv}</span>`);
  });
}
let toastTimer=null;
function toast(msg){
  const a=$("announce");a.textContent=msg.trim();a.style.opacity=1;a.style.fontSize="18px";
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>a.style.opacity=0,1400);
}
function announce(msg){
  const a=$("announce");a.textContent=msg;a.style.fontSize="32px";a.style.opacity=1;
  setTimeout(()=>a.style.opacity=0,1600);
}

const mmCtx=$("minimap").getContext("2d"),mmTerrain=document.createElement("canvas");
mmTerrain.width=168;mmTerrain.height=168;
const mmTerrainCtx=mmTerrain.getContext("2d");
let mmTerrainDirty=true,mmLastDraw=0;
function invalidateMinimapTerrain(){mmTerrainDirty=true;}
function drawMinimap(force=false){
  const now=performance.now();
  if(!force&&now-mmLastDraw<100)return;
  mmLastDraw=now;
  const S=168/GRID;
  if(mmTerrainDirty){
    mmTerrainDirty=false;mmTerrainCtx.fillStyle="#0a1018";mmTerrainCtx.fillRect(0,0,168,168);
    for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++){
      const t=grid[z][x];if(t===T_EMPTY)continue;
      mmTerrainCtx.fillStyle=
        t===T_BRICK?"#b5543a":t===T_STEEL?"#8b98a8":t===T_WATER?"#2a6aa8":
        t===T_TREE?"#2e7d3a":t===T_BASE?"#ffc93c":t===T_ROAD?"#232f3c":
        t===T_BUILDING?"#4a5462":t===T_PLATEAU?"#33465a":t===T_RAMP?"#41607a":
        t===T_BRIDGE?"#9a7440":"#333";
      mmTerrainCtx.fillRect(x*S,z*S,S,S);
    }
  }
  mmCtx.clearRect(0,0,168,168);mmCtx.drawImage(mmTerrain,0,0);
  enemies.forEach(e=>{
    if(performance.now()<e.spawnFlash||!isPositionVisible(e.group.position))return;
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
  /*  P4-5：镜头视野框（WC3 小地图惯例） */
  if(ACTIVE_MODE.key==="survival"){
    const d=camHeight;
    const vw=Math.min(GRID, d*1.2/TILE*S), vh=Math.min(GRID, d*.8/TILE*S);
    mmCtx.strokeStyle="rgba(255,255,255,.85)";mmCtx.lineWidth=1.5;
    mmCtx.strokeRect((camFocus.x+HALF)/TILE*S-vw/2,(camFocus.z+HALF)/TILE*S-vh/2,vw,vh);
  }
}
/*  P4-5：小地图点击 → 跳转镜头焦点 */
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
/* 左上资源与指挥状态刷新：复用节点，只在显示值变化时写入。 */
function updateDockRes(){
  const setText=(id,value)=>{const el=$(id),text=String(value);if(el&&el.textContent!==text)el.textContent=text;};
  setText("dockGold",Math.floor(game.gold));
  setText("dockPop",`${game.popUsed}/${game.popMax}`);
  const available=Math.max(0,game.popMax-game.popUsed);
  setText("dockPopStatus",available>0?`可用 ${available}`:"已满");
  $("dockPopRow")?.classList.toggle("isFull",available===0);
  setText("dockTech",researchInstitutes.length?"在线":"未建");
  if($("dockGate")){
    const g=$("dockGate");
    if(game.gateMaxHp>0){
      setText("dockGate",`${Math.max(0,Math.ceil(game.gateHp))}/${game.gateMaxHp}`);
      g.style.color=game.gateHp/game.gateMaxHp>.4?"#7ec8ff":"#ff7d6d";
    }else{setText("dockGate","—");}
  }
}

/* ---------------- 波次 ---------------- */
function isBossWave(n){return SurvivalSystem.waveProfile(n).isBoss;}
function startWave(n,preservePending=false){
  const wave=Math.max(1,Math.trunc(Number(n)||1));
  /* 准备期开过商店后关卡会误回 PREP，绝不能把已经打到的波次打回 1。 */
  if(ACTIVE_MODE.key==="survival"&&game.wave>0&&wave<game.wave)return;
  _waveClearing=false;                    /*  P0-1：清波闸门复位，允许下一次 waveCleared */
  game.waveTransition=null;
  _wdStallT=0;_wdKillTimer=0;_wdHarvesting=false;_wdRerouted=false; /*  新波开始，看门狗进度清零 */
  game.wave=wave;
  /*  敌量曲线由模式配置决定 */
  game.enemiesToSpawn=(ACTIVE_MODE.enemiesPerWave||(x=>4+x))(wave);
  if(ACTIVE_MODE.key==="survival")enqueueSurvivalWave(wave,preservePending);
  const waveSpec=SurvivalSystem.waveProfile(wave);
  game.spawnTimer=0;game.aliveThisWave=0;
  const boss=isBossWave(wave);
  const bossSpec=waveSpec.boss;
  announce(boss?`第 ${wave} 波 · ${bossSpec.name} 来袭！`:`第 ${wave} 波 · ${waveSpec.label}`);
  $("waveInfo").firstChild.textContent=boss?`WAVE ${wave} · ${bossSpec.name}`:`WAVE ${wave} · ${waveSpec.label}`;
  // 基地系波次效果
  if(game.stats.baseRepairLv>0)repairBaseShell();
  /*  战地维修：每波开始修复装甲 */
  if(game.stats.regenLv>0&&player&&player.alive&&player.hp<player.maxHp){
    player.hp=Math.min(player.maxHp,player.hp+2*game.stats.regenLv);
    toast(` 战地维修 +${2*game.stats.regenLv} 装甲`);
  }
  /*  空袭协同：每波开始获得轰炸充能 */
  if(game.stats.airstrikeLv>0){game.bombs+=game.stats.airstrikeLv;}
  if(game.stats.baseShieldMax>0){
    game.baseShieldHP=game.stats.baseShieldMax;
    toast(" 基地护盾已充能");
  }
  /*  单兵力场：每波充能 */
  if(game.stats.playerShieldLv>0){
    game.playerShieldHP=game.stats.playerShieldLv*2;
    toast(` 单兵力场充能 ×${game.playerShieldHP}`);
  }
  /*  连锁进化：随机强化已拥有卡 */
  if(game.stats.evolveLv>0){
    for(let k=0;k<game.stats.evolveLv;k++){
      const owned=UPGRADES.filter(u=>(game.upgrades[u.id]||0)>0&&(game.upgrades[u.id]||0)<u.max);
      if(owned.length){
        const u=owned[Math.floor(Math.random()*owned.length)];
        game.upgrades[u.id]++;u.apply(game.stats);
        toast(` ${u.name} 进化到 Lv${game.upgrades[u.id]}`);
      }
    }
  }
  updateHpUI();updateEnemyLeftUI();
}
function debugAddSurvivalGold(){
  if(ACTIVE_MODE.key!=="survival")return false;
  game.gold+=10000;
  updateGoldUI();
  toast("测试：+10000 金币");
  return true;
}
function debugSkipToNextSurvivalWave(){
  if(ACTIVE_MODE.key!=="survival")return false;
  [...enemies].forEach(e=>{
    scene.remove(e.group);releaseEnemyResources(e);
    if(e.beam){scene.remove(e.beam);disposeTransientObject3D(e.beam);}
  });
  enemies.length=0;
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    if(b.owner!=="enemy")continue;
    scene.remove(b.mesh);disposeTransientObject3D(b.mesh);bullets.splice(i,1);
  }
  state=STATE.PLAYING;
  startWave(Math.max(1,game.wave+1));
  updateEnemyLeftUI();
  toast(`测试：跳至第 ${game.wave} 波`);
  return true;
}
function updateEnemyLeftUI(){
  const active=activeEnemyCount(),queued=Math.max(0,game.enemiesToSpawn||0),remain=queued+active;
  $("enemyLeft").textContent=`剩余 ${remain} · 场上 ${active} / 待出 ${queued}${ACTIVE_MODE.key==="survival"&&game.wave>0?` · ${survivalWaveStatus()} · 敌伤/血 ×${survivalPressureMultiplier().toFixed(2)}`:""}`;
}
function activeEnemyCount(){
  return enemies.reduce((count,enemy)=>count+(enemy&&enemy.alive?1:0),0);
}
function pickEnemyType(wave=game.wave){
  const archetype=SurvivalSystem.waveProfile(Math.max(1,wave)).archetype;
  const bags={
    normal:[["normal",8],["fast",1],["heavy",1]],fast:[["fast",9],["normal",2]],heavy:[["heavy",8],["siege",2],["normal",1]],
    ranged:[["sniper",8],["normal",3]],ghost:[["ghost",9],["fast",2]],lifesteal:[["lifesteal",8],["normal",2]],
    siege:[["siege",8],["heavy",3]],elite:[["elite",7],["heavy",2],["sniper",2]],
    mixed:[["normal",3],["fast",2],["heavy",3],["siege",2],["elite",1],["sniper",1]],
    boss:[["heavy",4],["siege",3],["elite",3],["normal",2]],
    finale:[["siege",6],["heavy",5],["elite",5],["lifesteal",2]],
  };
  const bag=bags[archetype]||bags.normal;
  let total=bag.reduce((a,[,v])=>a+v,0),r=Math.random()*total;
  for(const[k,v]of bag){r-=v;if(r<=0)return k;}
  return "normal";
}

/* ---------------- 肉鸽三选一（稀有度加权）---------------- */
const RAR_NAME={1:"普通",2:"稀有",3:"史诗"};
const RAR_W={1:100,2:42,3:14};   // 稀有度抽取权重
function showUpgradeChoice(){
  state=STATE.UPGRADE;
  /*  经典模式过滤构筑联动卡（无金币/构筑系统） */
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
      <div class="icon">${UIIcons.svg(u.icon)}</div><div class="name">${u.name}</div>
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
    波间构筑系统（金币商店 + 防线布置）
   每波肃清后进入构筑阶段：花金币在地图上放置炮台/墙/地雷，
   构筑物跨波次永久存在，与肉鸽卡「战利品回收/工程承包商/火力网络」联动
   ===================================================================== */
const BUILDS=[
  {id:"mg",    icon:"turret", name:"机枪炮台", price:60,  desc:"自动索敌 · 射速快 / 伤害低 · 射程 16"},
  {id:"cannon",icon:"attack", name:"重炮炮台", price:110, desc:"远程高伤 · 范围溅射 · 射程 26"},
  {id:"frost", icon:"laser", name:"冰冻塔",   price:80,  desc:"范围减速 · 冰控集火 · 射程 13"},
  {id:"wallS", icon:"wall", name:"钢墙块",   price:18,  desc:"不可摧毁掩体，改写敌军进攻动线"},
  {id:"wallB", icon:"wall", name:"砖墙块",   price:8,   desc:"廉价路障，可被炮火炸毁"},
  {id:"mine",  icon:"blast", name:"地雷",     price:30,  desc:"敌军踩中即爆（范围 6 伤害）· 一次性"},
  {id:"goldmine",icon:"coin", name:"金矿",   price:70,  desc:"每秒产金 · 可升级（Lv1~6）"},
];
/*  生存模式专属商店：全量 SURVIVAL_BUILDS（科技点门槛在渲染时灰显），经典沿用 BUILDS
   注意：SURVIVAL_BUILDS 在 config.js 中通过 window.SURVIVAL_BUILDS 挂载，engine.js 顶层
   不可见（script-block 隔离），必须经 window 访问；找不到则回退 BUILDS 防止 UI 整盘炸 */
function shopList(){
  if(ACTIVE_MODE.key==="survival"){
    return (window.SURVIVAL_BUILDS&&window.SURVIVAL_BUILDS.length)?window.SURVIVAL_BUILDS:BUILDS;
  }
  return BUILDS;
}
let buildSel=null,ghost=null,ghostCell=null;
/* 金矿新建价固定；后勤科技仅应用统一建造折扣。 */
function goldMineCost(){
  let cost=SurvivalSystem.mineBuildCost();
  const economyLv=researchPowerLevel((game.tech&&game.tech.economy)||0);
  cost*=Math.max(.35,1+(TECH_TREE.economy.effect.buildCostPct||0)*economyLv);
  return Math.max(1,Math.round(cost));
}
/*  基础矿之后共五次升级：280→1120→4480→17920→71680。 */
function goldMineUpCost(level){
  let cost=SurvivalSystem.mineUpgradeCost(level);
  if(cost==null)return null;
  const economyLv=researchPowerLevel((game.tech&&game.tech.economy)||0);
  cost*=Math.max(.35,1+(TECH_TREE.economy.effect.buildCostPct||0)*economyLv);
  return Math.max(1,Math.round(cost));
}
function houseUpgradeCost(level){return level>=5?null:Math.round(100*Math.pow(2,Math.max(0,level-1)));}
function upgradeHouse(house){
  if(!house||builtHouses.indexOf(house)<0)return false;
  const owner=upgradeOwner('house',house),target=nextProjectTargetLevel('house','',owner,house.level||1,5);
  if(target==null){toast(" 人口房升级队列已满");return false;}
  /* P2 §6.2: price by target — cost at from-level (target-1). */
  const cost=paidUpgradeCost(houseUpgradeCost(target-1));if(cost==null){toast(" 人口房已达 Lv5");return false;}
  if(game.gold<cost){toast(` 升级需要 ${cost} 金币`);return false;}
  if(deferUpgrade('house','',owner,cost,target-1,target))return true;
  game.gold-=cost;const old=house.popProvided||6;house.level=(house.level||1)+1;house.popProvided=old+4;game.popMax+=4;
  const visual=house.visualRoot||house.group;visual.scale.setScalar(1+.06*(house.level-1));updateGoldUI();updateResUI();wc3RenderSel();renderCmdCard();toast(` 人口房升至 Lv${house.level} · 人口上限 +4`);return true;
}
function mineIncomeText(amount){
  const rounded=Math.round(Math.max(0,amount)*10)/10;
  return `+${Number.isInteger(rounded)?rounded:rounded.toFixed(1)}`;
}
function mineIncomeLayer(){
  let layer=document.getElementById("mineIncomeLayer");
  if(!layer){layer=document.createElement("div");layer.id="mineIncomeLayer";($('hud')||document.body).appendChild(layer);}
  return layer;
}
function spawnMineIncomePopup(mine,amount){
  if(window.Settings&&!Settings.isDamageText())return;
  if(!mine||!mine.group||amount<=0)return null;
  while(mineIncomePopups.length>=160){
    const stale=mineIncomePopups.shift();if(stale&&stale.element)stale.element.remove();
  }
  const element=document.createElement("div");element.className="mineIncomePopup";element.textContent=mineIncomeText(amount);
  mineIncomeLayer().appendChild(element);
  const level=Math.max(1,mine.level||1),position=mine.group.position.clone();position.y+=2.7+level*.12;
  const popup={element,position,age:0,life:1.15};mineIncomePopups.push(popup);return popup;
}
function updateMineIncomePopups(dt){
  const dock=$('wc3dock'),gameplayBottom=dock?dock.getBoundingClientRect().top:innerHeight;
  for(let index=mineIncomePopups.length-1;index>=0;index--){
    const popup=mineIncomePopups[index];popup.age+=dt;
    if(popup.age>=popup.life){popup.element.remove();mineIncomePopups.splice(index,1);continue;}
    const point=popup.position.clone();point.y+=popup.age*1.25;point.project(camera);
    const x=(point.x+1)*innerWidth/2,y=(-point.y+1)*innerHeight/2;
    const visible=point.z>=-1&&point.z<=1&&x>=0&&x<=innerWidth&&y>=0&&y<gameplayBottom;
    popup.element.style.display=visible?"block":"none";
    if(!visible)continue;
    const fadeIn=Math.min(1,popup.age/.12),fadeOut=Math.min(1,(popup.life-popup.age)/.38);
    popup.element.style.opacity=String(Math.max(0,Math.min(fadeIn,fadeOut)));
    popup.element.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;
  }
}
/* Lv1 保留原尺寸，Lv6 达旧顶级 1.25 的 150%，中间线性递增。 */
function upgradeGoldMineVisual(ex){
  if(!ex||!ex.group)return;
  const lv=Math.max(1,Math.min(6,ex.level||1)),visual=ex.visualRoot||ex.group.children[0];
  if(!visual)return;
  if(!ex.visualBaseScale)ex.visualBaseScale=visual.scale.clone();
  visual.scale.copy(ex.visualBaseScale).multiplyScalar(1+.175*(lv-1));
  ex.group.userData.goldMineVisualLevel=lv;
}
function upgradeGoldMine(mine){
  if(!mine||goldMines.indexOf(mine)<0)return false;
  const maxLevel=(ACTIVE_MODE.economy&&ACTIVE_MODE.economy.mineMaxLevel)||SurvivalSystem.MINE_ECONOMY.maxLevel;
  if(mine.level>=maxLevel){toast(" 金矿已完成五次升级");return false;}
  const owner=upgradeOwner('goldmine',mine),target=nextProjectTargetLevel('goldmine','',owner,mine.level,maxLevel);
  if(target==null){toast(" 金矿升级队列已满");return false;}
  /* P2 §6.2: price by target — cost at from-level (target-1). */
  const cost=paidUpgradeCost(goldMineUpCost(target-1));
  if(cost==null||game.gold<cost){toast(` 升级需要 ${cost||0} 金币`);return false;}
  if(deferUpgrade('goldmine','',owner,cost,target-1,target))return true;
  game.gold-=cost;
  mine.level++;
  upgradeGoldMineVisual(mine);
  updateGoldUI();
  sfx.levelup();
  if(mine.group&&mine.group.position){
    const position=mine.group.position.clone();
    spawnParticles(position.setY(heightAt(position.x,position.z)+1),0xffd75e,8,6,.8);
  }
  toast(` 金矿升至 Lv${mine.level} · ${SurvivalSystem.mineIncome(mine.level)} 金/秒`);
  wc3RenderSel();
  return true;
}
const priceOf=b=>{
  if(b.id==="goldmine")return goldMineCost();
  const economyLv=researchPowerLevel((game.tech&&game.tech.economy)||0);
  const techMult=Math.max(.35,1+(TECH_TREE.economy.effect.buildCostPct||0)*economyLv);
  return Math.max(1,Math.round(b.price*Math.pow(.85,game.stats.builderLv||0)*techMult));
};
function turretUpgradeCost(turret){
  if(!turret||turret.level>=turretUnlockedMaxLevel()-1)return null;
  const build=shopList().find(item=>item.kind==="turret");
  if(!build)return null;
  return Math.max(1,Math.round(priceOf(build)*.85*Math.pow(TURRET_UPGRADE_COST_GROWTH,turret.level)));
}
function updateGoldUI(){
  if($("gold"))$("gold").textContent=Math.floor(game.gold);
  if($("goldBig"))$("goldBig").textContent=Math.floor(game.gold);
  const list=shopList();
  document.querySelectorAll(".shopItem").forEach((el,i)=>{
    const b=list[i];
    if(!b)return;
    const poor=game.gold<priceOf(b)||(b.pop>0&&game.popUsed+b.pop>game.popMax);
    el.classList.toggle("poor",poor);
    el.classList.remove("locked");
  });
  updateResUI();
  if(ACTIVE_MODE.key==="survival"&&state===STATE.BUILD&&wc3BuildMode){
    renderCmdCard();
  }
  if(ACTIVE_MODE.key==="survival"&&wc3Sel){
    if(["turret","wall","goldmine","beacon"].includes(wc3Sel.kind))wc3RenderSel();
    renderCmdCard();
  }
}
/* 生存资源条刷新：只保留金币与人口。 */
function updateResUI(){
  if(ACTIVE_MODE.key!=="survival")return;
  if($("popText"))$("popText").textContent=`${game.popUsed}/${game.popMax}`;
}
function renderShop(){
  const wrap=$("shop");wrap.innerHTML="";
  shopList().forEach((b,i)=>{
    const d=document.createElement("div");
    const poor=game.gold<priceOf(b)||(b.pop>0&&game.popUsed+b.pop>game.popMax);
    d.className="shopItem"+(buildSel===i?" sel":"")+(poor?" poor":"");
    let tags=`<div class="pr"> ${priceOf(b)}</div>`;
    if(b.pop>0)tags+=`<div class="pop"> ${b.pop}</div>`;
    d.innerHTML=`<span class="hk">${i+1}</span><div class="ic">${UIIcons.svg(b.icon)}</div>
      <div class="nm">${b.name}</div>${tags}
      <div class="ds">${b.desc}</div>`;
    d.onclick=()=>selectBuild(buildSel===i?null:i);
    wrap.appendChild(d);
  });
}
function selectBuild(i){
  /* 选择任意建造项即退出拆除工具。此前 destroyMode 会悄悄常驻，
     导致地块虽然已经释放，下一次左键仍被 attemptDestroy 截走。 */
  if(i!==null&&destroyMode){
    destroyMode=false;
    if($("destroyToggle"))$("destroyToggle").classList.remove("on");
  }
  buildSel=i;
  renderShop();
  if(ghost){scene.remove(ghost);disposeTransientObject3D(ghost);ghost=null;}
  if(i!==null){
    const build=shopList()[i],tall=build.id.startsWith("wall");
    const footprint=build.footprint||[1,1];
    ghost=new THREE.Mesh(
      new THREE.BoxGeometry(TILE*footprint[0]-.16,tall?2.4:1.2,TILE*footprint[1]-.16),
      new THREE.MeshBasicMaterial({color:0x39d98a,transparent:true,opacity:.35}));
    ghost.visible=false;scene.add(ghost);
  }
  if(wc3BuildMode)renderCmdCard();
}
/* 屏幕坐标 → 地面格子 */
const _ray=new THREE.Raycaster(),_ndc=new THREE.Vector2();
function pickCell(){
  _ndc.x=(mouse.x/innerWidth)*2-1;_ndc.y=-(mouse.y/innerHeight)*2+1;
  _ray.setFromCamera(_ndc,camera);
  if(ACTIVE_MODE.key==='survival'&&terrainSurface?.natural){
    const point=intersectTerrainRay(_ray.ray,new THREE.Vector3());
    if(!point)return null;const cell=cellOf(point.x,point.z);return inMap(cell.x,cell.z)?cell:null;
  }
  const origin=_ray.ray.origin,dir=_ray.ray.direction;
  const planeHit=(y)=>{
    if(Math.abs(dir.y)<1e-5)return null;
    const t=(y-origin.y)/dir.y;if(t<0.05)return null;
    return {x:origin.x+dir.x*t,z:origin.z+dir.z*t};
  };
  /* 侧视时射线会先打到高台崖壁（T_STEEL），看起来像点在台顶却无法建造。
     先用 Y=PH 平面取高台格，再用 Y=0 取峡谷/平地。 */
  const high=planeHit(PH);
  if(high){
    const c=cellOf(high.x,high.z);
    if(inMap(c.x,c.z)){
      const t=grid[c.z][c.x];
      if(t===T_PLATEAU||t===T_BASE||t===T_RAMP)return c;
    }
  }
  const low=planeHit(.04);
  if(low){
    const c=cellOf(low.x,low.z);
    if(inMap(c.x,c.z))return c;
  }
  const pt=new THREE.Vector3();
  if(!intersectTerrainRay(_ray.ray,pt))return null;
  const c=cellOf(pt.x,pt.z);
  return inMap(c.x,c.z)?c:null;
}
function snapBuildAnchor(cell,build){
  if(!cell||!build)return cell;
  const C=ACTIVE_MODE.canyon,foot=build.footprint||[1,1];
  if(build.id==="wall"&&C&&foot[1]>=2&&cell.z>=C.z0&&cell.z<=C.z1&&cell.x>=C.x0&&cell.x<=C.x1){
    return {x:cell.x,z:C.z0};
  }
  return cell;
}
function cellPlaceable(c){
  /*  P4-2：T_RAMP 坡道格允许建墙（WC3 式堵坡口战术）；
     破坏/拆除后由 buildWallTile 恢复坡道，不会隐形封死 */
  const t=grid[c.z][c.x];
  return (t===T_EMPTY||t===T_ROAD||t===T_PLATEAU||t===T_RAMP)
    &&c.x>0&&c.x<GRID-1&&c.z>0&&c.z<GRID-1&&!structCells.has(idx(c.x,c.z));
}
function footprintCells(anchor,build){
  const footprint=(build&&build.footprint)||[1,1],cells=[];
  for(let dz=0;dz<footprint[1];dz++)for(let dx=0;dx<footprint[0];dx++)cells.push({x:anchor.x+dx,z:anchor.z+dz});
  return cells;
}
function footprintPlaceable(anchor,build,restoring=false){
  const cells=footprintCells(anchor,build);
  if(build.id==='heroHub'&&ACTIVE_MODE.key==='survival'&&terrainSurface?.natural&&cells.some(c=>!inMap(c.x,c.z)||terrainSurface.natural.wholeCells[idx(c.x,c.z)]!==1))return false;
  if(!restoring&&ACTIVE_MODE.key==='survival'&&typeof constructionEntranceCells==='function'){
    const entrance=constructionEntranceCells();
    if(cells.some(c=>entrance.some(e=>e.x===c.x&&e.z===c.z)))return false;
  }
  return cells.every(cell=>inMap(cell.x,cell.z)&&cellPlaceable(cell))&&
    (ACTIVE_MODE.key!=="survival"||naturalFootprintSupported(cells,build));
}
function footprintCenter(anchor,build){
  const footprint=(build&&build.footprint)||[1,1];
  return {
    x:(anchor.x+footprint[0]/2)*TILE-HALF,
    z:(anchor.z+footprint[1]/2)*TILE-HALF,
  };
}
function reserveFootprint(record,cells){
  record.footprintCells=cells.map(cell=>idx(cell.x,cell.z));
  record.footprintCells.forEach(cellIndex=>structCells.add(cellIndex));
  invalidateNavigation();
}
function releaseFootprint(record){
  (record&&record.footprintCells||[]).forEach(cellIndex=>structCells.delete(cellIndex));
  invalidateNavigation();
}
function releaseDestroyedFootprint(record){
  if(!record)return;
  releaseFootprint(record);
  /* 销毁路径统一清掉选择引用与当前悬浮状态，杜绝“模型没了但旧引用仍拦截点击”。 */
  wc3Selection=wc3Selection.filter((entry)=>entry&&entry.ref!==record);
  wc3Sel=wc3Selection[0]||null;
  if(record.group&&record.group.userData)record.group.userData.destroyed=true;
  ghostCell=null;
  computeFlowField();
}
function ownedStructurePools(){
  return [[builtTurrets,"turret"],[goldMines,"goldmine"],[researchInstitutes,"research"],
    [heroHubs,"heroHub"],[heavyFactories,"factory"],[builtHouses,"house"],[visionBeacons,"beacon"]];
}
function ownedStructureAtCell(cellIndex){
  const job=constructionJobs.find(j=>j.phase!=='returning'&&(j.footprintCells||[]).includes(cellIndex));
  if(job)return {record:job,records:constructionJobs,kind:'construction'};
  for(const [records,kind] of ownedStructurePools()){
    const record=records.find((item)=>(item.footprintCells||[]).includes(cellIndex));
    if(record)return {record,records,kind};
  }
  return null;
}
function destroyOwnedStructure(record,records,kind){
  if(!record||!records)return false;
  explode(record.group.position.clone().setY(1.2),false);scene.remove(record.group);releaseDestroyedFootprint(record);
  const position=records.indexOf(record);if(position>=0)records.splice(position,1);
  if(kind==="turret"||kind==="beacon")game.popUsed=Math.max(0,game.popUsed-(record.popUsed||0));
  if(kind==="house")game.popMax=Math.max(0,game.popMax-(record.popProvided||0));
  if(kind==="factory")for(const queued of record.queue||[]){
    const spec=SurvivalSystem.FRIENDLY_UNIT_TYPES[queued.typeId];if(spec)game.popUsed=Math.max(0,game.popUsed-spec.population);
  }
  if(kind==="beacon"){removeSurvivalPointLight(record.light);redrawVisionFog();}
  wc3Selection=wc3Selection.filter((entry)=>entry&&entry.ref!==record);wc3Sel=wc3Selection[0]||null;
  updateResUI();renderCmdCard();return true;
}
function damageOwnedStructureAtCell(cellIndex,damage){
  const hit=ownedStructureAtCell(cellIndex);if(!hit)return false;
  if(hit.kind==='construction')return damageConstruction(hit.record,damage);
  if(!Number.isFinite(hit.record.maxHp)){hit.record.maxHp=180;hit.record.hp=180;}
  hit.record.hp=Math.max(0,hit.record.hp-Math.max(0,damage||0));
  if(hit.record.hp<=0)destroyOwnedStructure(hit.record,hit.records,hit.kind);
  return true;
}
function updateGhost(){
  if(!ghost||buildSel===null)return;
  const picked=pickCell();
  if(!picked){ghost.visible=false;return;}
  const build=shopList()[buildSel];
  ghostCell=snapBuildAnchor(picked,build);
  const cc=footprintCenter(ghostCell,build);
  const tall=build.id.startsWith("wall");
  ghost.position.set(cc.x,heightAt(cc.x,cc.z)+(tall?1.2:.6),cc.z);
  const ok=footprintPlaceable(ghostCell,build)&&game.gold>=priceOf(build);
  ghost.material.color.setHex(ok?0x39d98a:0xff5d5d);
  ghost.visible=true;
}
/*  生存炮塔：取某等级的当前属性（基础 + N 阶升级覆盖） */
function turretStats(key,lvl){
  const t=TURRET_TYPES[key];
  if(!t)return null;
  const s=Object.assign({},t.stats);
  for(let k=0;k<lvl;k++){const up=t.upgrade[k];if(up)for(const p in up)s[p]=up[p];}
  const extra=Math.max(0,lvl-t.upgrade.length);
  if(extra>0){
    const growth=key==="rapid"?{dmg:1.08,fireRate:1.04}:key==="cannon"?{dmg:1.1,fireRate:1.02,splash:1.025}
      :key==="antitank"?{dmg:1.11,fireRate:1.018}:key==="emp"?{dmg:1.07,fireRate:1.02,splash:1.02}:{};
    for(const [stat,multiplier] of Object.entries(growth))if(Number.isFinite(s[stat]))s[stat]*=Math.pow(multiplier,extra);
    if(key==="antitank")s.pierce=Math.min(.95,(s.pierce||0)+extra*.008);
    if(key==="emp"){s.slow=Math.min(.7,(s.slow||0)+extra*.008);s.stun=Math.min(.5,(s.stun||0)+extra*.005);}
  }
  return s;
}
function populateTurretWeapon(tur,key,M){
  while(tur.children.length){const child=tur.children[tur.children.length-1];tur.remove(child);disposeTransientObject3D(child);}
  tur.userData.muzzleMarker=null;
  const addBox=(w,h,d,x,y,z,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);tur.add(mesh);return mesh;};
  const addBarrel=(radius,length,x,y,z,mat)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*.82,radius,length,10),mat);mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);tur.add(mesh);return mesh;};
  const addRing=(radius,tube,x,y,z,mat)=>{const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,6,14),mat);mesh.position.set(x,y,z);tur.add(mesh);return mesh;};
  const color=(TURRET_TYPES[key]||TURRET_TYPES.turret).color,main=M(color,.46,.58),dark=M(0x20262b,.62,.5),steel=M(0x66727a,.4,.72),accent=M(new THREE.Color(color).lerp(new THREE.Color(0xffffff),.28),.34,.66);
  let muzzleZ=2.85,muzzleY=.34;
  if(key==="rapid"){
    addBox(1.42,.54,1.34,0,.3,0,main);addBox(1.05,.18,.54,0,.61,.12,accent);
    addBarrel(.09,2.45,-.22,.38,1.65,dark);addBarrel(.09,2.45,.22,.38,1.65,dark);
    addRing(.15,.045,-.22,.38,2.88,steel);addRing(.15,.045,.22,.38,2.88,steel);
    addBox(.16,.16,.8,-.22,.38,1.28,steel);addBox(.16,.16,.8,.22,.38,1.28,steel);
    const magazine=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.42,10),dark);magazine.rotation.z=Math.PI/2;magazine.position.set(.72,.2,0);tur.add(magazine);
    const magazineCap=magazine.clone();magazineCap.material=accent;magazineCap.scale.set(.76,1.08,.76);magazineCap.position.x=.75;tur.add(magazineCap);
    muzzleZ=2.94;muzzleY=.38;
  }else if(key==="cannon"){
    addBox(1.58,.72,1.58,0,.36,0,main);addBox(1.2,.26,.46,0,.72,.22,accent);
    addBarrel(.22,2.75,0,.44,1.85,dark);addBarrel(.3,.38,0,.44,3.18,steel);
    addRing(.34,.065,0,.44,3.39,dark);
    addBarrel(.08,1.02,-.37,.16,.56,steel);addBarrel(.08,1.02,.37,.16,.56,steel);
    addBox(.9,.42,.48,0,.3,-.92,dark);
    muzzleZ=3.47;muzzleY=.44;
  }else if(key==="antitank"){
    addBox(1.42,.5,1.78,0,.28,.05,main);addBox(1.68,.66,.18,0,.39,.62,accent);
    addBarrel(.105,3.65,0,.36,2.3,dark);addBox(.62,.12,.32,0,.36,4.05,steel);addBox(.12,.52,.28,0,.36,4.05,steel);
    addBox(.1,.24,1.2,-.48,.12,.72,steel);addBox(.1,.24,1.2,.48,.12,.72,steel);
    const optic=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.48,8),dark);optic.rotation.x=Math.PI/2;optic.position.set(.4,.7,.36);tur.add(optic);
    addRing(.15,.035,.4,.7,.61,accent);
    muzzleZ=4.25;muzzleY=.36;
  }else if(key==="emp"){
    addBox(1.42,.5,1.38,0,.25,.05,main);addBox(1.05,.16,.82,0,.55,.02,steel);
    addBarrel(.24,2.4,0,.42,1.45,dark);
    for(const x of [-.36,.36]){addBox(.16,.28,2.1,x,.42,1.25,steel);for(let i=0;i<5;i++)addBox(.2,.44,.09,x,.42,.35+i*.32,accent);}
    addRing(.32,.09,0,.42,2.7,steel);
    const lens=new THREE.Mesh(new THREE.CircleGeometry(.22,16),warmEmissiveMaterial(0x78ffe3,1.5));lens.position.set(0,.42,2.72);tur.add(lens);
    muzzleZ=2.74;muzzleY=.42;
  }else{
    addBox(1.42,.56,1.5,0,.29,0,main);addBox(1.05,.18,.5,0,.61,.18,accent);
    addBarrel(.14,2.4,0,.36,1.55,dark);addRing(.2,.05,0,.36,2.73,steel);
    addBox(.28,.22,.52,-.55,.19,-.15,dark);addBox(.28,.22,.52,.55,.19,-.15,dark);
    muzzleZ=2.81;muzzleY=.36;
  }
  const muzzleMarker=new THREE.Object3D();muzzleMarker.name="muzzle";muzzleMarker.position.set(0,muzzleY,muzzleZ);tur.add(muzzleMarker);tur.userData.muzzleMarker=muzzleMarker;
  const pitchPivot=new THREE.Group();pitchPivot.name='炮管俯仰轴';pitchPivot.position.y=muzzleY;
  for(const part of [...tur.children]){part.position.y-=muzzleY;pitchPivot.add(part);}
  tur.add(pitchPivot);tur.userData.pitchPivot=pitchPivot;
  tur.userData.weaponKind=key;
}
/* 标准炮台：固定石铁底座；四个专精拥有独立、可一眼辨认的炮身。 */
function makeTurretMesh(key){
  const tt=TURRET_TYPES[key]||{color:0x88aacc};
  const g=new THREE.Group();
  const M=(c,r,m)=>new THREE.MeshStandardMaterial({color:c,roughness:r??.6,metalness:m??.35});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.65,.85,12),M(0x4b4942,.86,.18));base.position.y=.43;g.add(base);
  const mount=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.05,.62,12),M(tt.color,.48,.55));mount.position.y=1.05;g.add(mount);
  const tur=new THREE.Group();
  populateTurretWeapon(tur,key,M);
  tur.position.y=1.45;
  tur.name="turret";g.userData.turret=tur;
  g.add(tur);
  const statusLight=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),warmEmissiveMaterial(0xffbd68,1.7));
  statusLight.position.set(.68,1.42,-.18);statusLight.userData.nightGlow=true;g.add(statusLight);
  g.userData.base=base;g.userData.mount=mount;g.userData.statusLight=statusLight;
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  if(ACTIVE_MODE.key==="survival")g.scale.setScalar(.75);
  return g;
}
/* 前四级渐进强化轮廓，五级换装分支重型炮身。 */
function applyTurretLevelVisual(turret){
  if(!turret||!turret.group)return;
  const visualLevel=Math.max(1,(turret.level||0)+1);
  if(visualLevel>=5&&turret.turretKey!=="turret")promoteVeteranTurret(turret.group,turret.turretKey);
  const step=visualLevel-1,g=turret.group,mount=g.userData.mount,tur=g.userData.turret,statusLight=g.userData.statusLight;
  const overall=SurvivalSystem.turretVisualScale(visualLevel);
  if(mount){
    mount.scale.setScalar(overall);
    if(mount.material){
      mount.material.roughness=Math.max(.28,.48-step*.04);
      mount.material.metalness=Math.min(.78,.55+step*.05);
      mount.material.emissive=new THREE.Color((TURRET_TYPES[turret.turretKey]||TURRET_TYPES.turret).color).multiplyScalar(.035*step);
      mount.material.emissiveIntensity=.45+step*.1;
    }
  }
  if(tur)tur.scale.set(overall,overall,Math.min(1.34,overall+step*.008));
  if(statusLight){
    statusLight.scale.setScalar(1+step*.08);
    statusLight.position.set(.68*(1+step*.04),1.42+step*.04,-.18);
    if(statusLight.material)statusLight.material.emissiveIntensity=1.7+step*.35;
  }
  g.userData.turretVisualLevel=visualLevel;
}
function chooseTurretBranch(turret,branchId){
  if(!turret||turret.turretKey!=="turret"||!SurvivalSystem.TURRET_BRANCHES[branchId])return false;
  const cost=paidUpgradeCost(turretBranchCost());
  if(game.gold<cost){toast(` 专精需要 ${cost} 金币`);return false;}
  if(deferUpgrade('branch',branchId,upgradeOwner('turret',turret),cost))return true;
  game.gold-=cost;turret.turretKey=branchId;turret.kind=branchId;turret.level=0;
  const stats=turretStats(branchId,0);Object.assign(turret,{dmg:stats.dmg,fireCd:1/stats.fireRate,range:stats.range*TILE,
    blast:stats.splash||0,pierce:stats.pierce||0,slow:stats.slow||0,stun:stats.stun||0,chain:stats.chain||0});
  const color=TURRET_TYPES[branchId].color,M=(c,r,m)=>new THREE.MeshStandardMaterial({color:c,roughness:r??.6,metalness:m??.35});
  populateTurretWeapon(turret.group.userData.turret,branchId,M);
  turret.group.traverse((object)=>{if(object.isMesh&&object.material&&object!==turret.bar&&object!==turret.barFg){object.material=object.material.clone();object.material.color.lerp(new THREE.Color(color),.18);}});
  applyTurretLevelVisual(turret);
  updateGoldUI();sfx.levelup();toast(` 炮台专精：${TURRET_TYPES[branchId].name}`);wc3RenderSel();return true;
}
/* 专属炮台：基础五级后由炮台突破继续开放，属性进入递减成长。 */
function upgradeTurretAt(x,z){
  const t=builtTurrets.find(t=>t.cx===x&&t.cz===z);
  if(!t){toast(" 该位置没有可升级的炮塔");return false;}
  if(!doctrineAllows('tower',t.level+1)){toast("高阶炮台需要炮台专精");return false;}
  if(t.turretKey==="turret"){toast("请先在选中面板选择炮台专精");return false;}
  if(t.level>=turretUnlockedMaxLevel()-1){toast(` 炮塔已达当前上限 Lv${turretUnlockedMaxLevel()}，请研究炮台突破`);return false;}
  const tt=TURRET_TYPES[t.turretKey];
  if(!tt){toast(" 暂无可应用升级");return false;}
  const owner=upgradeOwner('turret',t),target=nextProjectTargetLevel('turret','',owner,t.level,turretUnlockedMaxLevel()-1);
  if(target==null){toast(` 炮塔队列已排至上限 Lv${turretUnlockedMaxLevel()}`);return false;}
  /* P2 §6.2: price by target — cost at from-level (target-1). */
  const cost=paidUpgradeCost(turretUpgradeCost({level:target-1,turretKey:t.turretKey}));
  if(cost==null||game.gold<cost){toast(` 升级需要 ${cost||0} 金币`);return false;}
  if(deferUpgrade('turret','',owner,cost,target-1,target))return true;
  game.gold-=cost;updateGoldUI();
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
  applyTurretLevelVisual(t);
  sfx.levelup();
  spawnParticles(t.group.position.clone().setY(2),0x9fd4ff,10,6,.8);
  toast(` ${tt.name} 升至 ${t.level+1} 级`);
  updateResUI();
  wc3RenderSel();
  return true;
}
function turretBranchCost(){
  const build=shopList().find((item)=>item.kind==="turret");
  return build?Math.max(1,Math.round(priceOf(build)*.85)):0;
}
function upgradeWallAt(x,z){
  if(!inMap(x,z))return false;
  const ci=idx(x,z),meta=wallMeta.get(ci),curLv=meta&&meta.lv||0;
  if(curLv<1||grid[z][x]!==T_STEEL||!steelHP.has(ci)){toast(" 该位置没有可升级的巨岩墙");return false;}
  if(curLv>=wallUnlockedMaxLevel()){toast(` 墙体已达当前上限 Lv${wallUnlockedMaxLevel()}，请研究巨岩突破`);return false;}
  const owner=upgradeOwner('wall',{x,z}),target=nextProjectTargetLevel('wall','',owner,curLv,wallUnlockedMaxLevel());
  if(target==null){toast(` 墙体队列已排至上限 Lv${wallUnlockedMaxLevel()}`);return false;}
  /* P2 §6.2: price by target — wallPriceNext(target-1) is the cost of Lv(target-1)→Lv(target). */
  const cost=paidUpgradeCost(wallPriceNext(target-1));
  if(game.gold<cost){toast(` 升级需要 ${cost} 金币`);return false;}
  if(deferUpgrade('wall','',owner,cost,target-1,target))return true;
  game.gold-=cost;updateGoldUI();
  const nextLv=curLv+1,w=wallDefinition(nextLv),oldHp=steelHP.get(ci),oldMax=wallMaxHp(curLv);
  const ratio=oldMax>0?Math.max(0,Math.min(1,oldHp/oldMax)):1,wasRamp=!!meta.wasRamp;
  const old=tileMeshes[ci];if(old){mapGroup.remove(old);tileMeshes[ci]=null;}
  const mesh=buildWallTile(mapGroup,x,z,nextLv);tileMeshes[ci]=mesh;structCells.add(ci);
  const newHp=Math.max(1,Math.round(wallMaxHp(nextLv)*ratio));steelHP.set(ci,newHp);
  wallMeta.set(ci,{lv:nextLv,hp:newHp,thorns:w.thorns||0,wasRamp});
  computeFlowField();sfx.levelup();
  const center=cellCenter(x,z);spawnParticles(new THREE.Vector3(center.x,heightAt(center.x,center.z)+1,center.z),0x9fd4ff,12,7,.9);
  toast(` 墙升至 Lv${nextLv}（${w.tag}·${wallMaxHp(nextLv)}）`);updateResUI();
  return true;
}
function tryPlace(px,pz){
  if(ACTIVE_MODE.key!=="survival")return placeBuildingImmediately(px,pz);
  if(px!=null&&pz!=null){ghostCell=cellOf(px,pz);if(ghost)ghost.visible=true;}
  if(buildSel===null||!ghostCell||!ghost||!ghost.visible)return;
  const build=shopList()[buildSel];if(!build)return;
  const anchor=snapBuildAnchor(ghostCell,build);
  if(!inMap(anchor.x,anchor.z))return false;
  if((build.id==="goldmine"&&goldMines.some(m=>m.x===anchor.x&&m.z===anchor.z))||
    (build.kind==="turret"&&builtTurrets.some(t=>t.cx===anchor.x&&t.cz===anchor.z))||
    (build.kind==="wall"&&wallLvAt(anchor.x,anchor.z)>0))return placeBuildingImmediately(px,pz);
  return queueConstruction(build,anchor);
}
function placeBuildingImmediately(px,pz,constructionJob=null,restoring=false){
  /*  烟测/外部 API：允许直接传入世界坐标触发放置（优先于光标 ghostCell） */
  if(px!=null&&pz!=null){
    ghostCell=cellOf(px,pz);
    if(ghost&&ghostCell){ghost.position.set(px,0,pz);ghost.visible=true;}
  }
  if(buildSel===null||!ghostCell||!ghost.visible)return;
  const b=shopList()[buildSel];
  ghostCell=snapBuildAnchor(ghostCell,b);
  const existingMine=b.id==="goldmine"&&goldMines.find(m=>m.x===ghostCell.x&&m.z===ghostCell.z);
  if(existingMine){
    if(wc3BuildMode)closeWc3Build();else selectBuild(null);
    wc3Select("goldmine",existingMine);wc3RenderSel();renderCmdCard();
    return;
  }
  const existingTurret=b.kind==="turret"&&builtTurrets.find(t=>t.cx===ghostCell.x&&t.cz===ghostCell.z);
  const wallUpgradeTarget=ACTIVE_MODE.key==="survival"&&b.kind==="wall"&&grid[ghostCell.z][ghostCell.x]===T_STEEL;
  const upgradeTarget=!!(existingTurret||wallUpgradeTarget);
  if(!upgradeTarget&&!footprintPlaceable(ghostCell,b,restoring)){
    const now=performance.now();
    if(now-(tryPlace._lastBlockedToast||0)>650){
      tryPlace._lastBlockedToast=now;
      toast(" 这里不能建造");
    }
    return;
  }
  const buildCells=footprintCells(ghostCell,b);
  const cc=footprintCenter(ghostCell,b);
  /* 避免把玩家困死 */
  if(!constructionJob&&player&&player.alive&&Math.hypot(player.group.position.x-cc.x,player.group.position.z-cc.z)<3.2)return;
  const gy=heightAt(cc.x,cc.z);
  /* ---- 金矿：这里只负责新建；已有矿必须先选中，再由面板按钮升级。 ---- */
  if(b.id==="goldmine"){
    if(goldMines.length>=mineUnlockedCount()){toast(` 金矿数量已达 ${mineUnlockedCount()}，请在研究院升级采矿扩张`);return;}
    const cost=constructionJob?constructionJob.cost:priceOf(b);
    if(game.gold<cost)return;
    game.gold-=cost;updateGoldUI();
    const g=takeConstructionModel(constructionJob,makeGoldmineVisual),visualRoot=g.userData.visualRoot;
    g.position.set(cc.x,gy,cc.z);scene.add(g);
    const mineMaxHp=Math.round(220*(1+(TECH_TREE.defense.effect.structureHpPct||0.1)*researchPowerLevel(game.legacyDefense||0)));
    const mineHealth=attachWorldHealthBar(g,4.5,2.7);
    mineHealth.bar.userData.panelOnly=true;
    const record={group:g,visualRoot,visualBaseScale:visualRoot.scale.clone(),crystal:null,x:ghostCell.x,z:ghostCell.z,
      level:1,incomePulse:0,hp:mineMaxHp,maxHp:mineMaxHp,kind:"goldmine",...mineHealth};
    upgradeGoldMineVisual(record);
    finishIndustrialFacade(g,"goldmine");reserveFootprint(record,buildCells);goldMines.push(record);
    sfx.complete();
    spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xffd75e,8,6,.8);
    return;
  }
  /* ---- 生存模式：数据驱动建造分发 ---- */
  if(ACTIVE_MODE.key==="survival"){
    /* 同格已有同类炮塔 → 升级而非新建 */
    if(b.kind==="turret"){
      const ex=existingTurret;
      if(ex){upgradeTurretAt(ghostCell.x,ghostCell.z);return;}
    }
    if(b.id==="house"&&builtHouses.length>=5){toast(" 人口房最多建造 5 座");return;}
    if(b.kind==="heroHub"&&heroHubs.length){toast("英雄枢纽最多一座");return;}
    if(b.kind==="research"&&researchInstitutes.length){toast(" 研究院最多建造一座");return;}
    if(b.kind==="factory"&&heavyFactories.length){toast(" 重工厂最多建造一座");return;}
    const needPop=b.pop||0;
    if(!constructionJob&&needPop>0&&game.popUsed+needPop>game.popMax){
      toast(` 人口不足（${game.popUsed}/${game.popMax}），请先建住房`);return;
    }
    const cost=constructionJob?constructionJob.cost:priceOf(b);
    if(game.gold<cost){toast(" 金币不足");return;}
    game.gold-=cost;updateGoldUI();

    if(b.kind==="wall"){
      const ci=idx(ghostCell.x,ghostCell.z);
      const curLv=wallLvAt(ghostCell.x,ghostCell.z);
      const isExistingWall=curLv>0&&grid[ghostCell.z][ghostCell.x]===T_STEEL;

      if(isExistingWall){
        /* 入口已按建造价预扣；退回后统一走选中面板共用的升级函数。 */
        game.gold+=cost;updateGoldUI();
        upgradeWallAt(ghostCell.x,ghostCell.z);
        return;
      }

      const w0=WALL_LEVELS[0];
      const initialHp=wallMaxHp(1);
      const m=buildWallTile(mapGroup,ghostCell.x,ghostCell.z,1);
      if(m.parent!==mapGroup)mapGroup.add(m);
      for(const cell of buildCells){
        const cellIndex=idx(cell.x,cell.z),wasRampHere=grid[cell.z][cell.x]===T_RAMP;
        grid[cell.z][cell.x]=T_STEEL;
        steelHP.set(cellIndex,initialHp);
        wallMeta.set(cellIndex,{lv:1,hp:initialHp,thorns:w0.thorns||0,wasRamp:wasRampHere,span:buildCells,anchor:{x:ghostCell.x,z:ghostCell.z}});
        tileMeshes[cellIndex]=m;structCells.add(cellIndex);
      }
      computeFlowField();
      sfx.complete();
      spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xc89a6a,6,5,.7);
      toast(` 建墙 Lv1（${w0.tag}·${initialHp}）`);
    }else if(b.kind==="turret"){
      const key=b.turret, st=turretStats(key,0), g=takeConstructionModel(constructionJob,()=>makeTurretMesh(key));
      g.position.set(cc.x,gy,cc.z);scene.add(g);
      const bar=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.3),
        new THREE.MeshBasicMaterial({color:0x1c1410,transparent:true,opacity:.7,depthWrite:false}));
      const barFg=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.2),
        new THREE.MeshBasicMaterial({color:0x39d98a,depthWrite:false}));
      bar.position.y=3.6;barFg.position.y=3.6;bar.visible=barFg.visible=false;
      g.add(bar);g.add(barFg);
      const structureMult=1+(TECH_TREE.defense.effect.structureHpPct||0.1)*researchPowerLevel(game.legacyDefense||0),turretHp=Math.round(40*structureMult);
      const record={group:g,kind:key,turretKey:key,level:0,cx:ghostCell.x,cz:ghostCell.z,x:ghostCell.x,z:ghostCell.z,
        /*  range 以"格"配置，转世界单位参与距离比较（TILE=4） */
        range:st.range*TILE,cd:0,fireCd:1/st.fireRate,dmg:st.dmg,blast:st.splash||0,
        pierce:st.pierce||0,slow:st.slow||0,stun:st.stun||0,chain:st.chain||0,
        popUsed:needPop||0,
        hp:turretHp,maxHp:turretHp,bar,barFg};
      reserveFootprint(record,buildCells);builtTurrets.push(record);
      if(needPop>0)game.popUsed+=needPop;
      updateResUI();
      sfx.complete();
    }else if(b.id==="house"){
      const g=takeConstructionModel(constructionJob,makeHouseVisual);
      g.position.set(cc.x,gy,cc.z);scene.add(g);
      game.popMax+=(ACTIVE_MODE.economy&&ACTIVE_MODE.economy.housePop)||6;
      const houseMaxHp=Math.round(160*(1+(TECH_TREE.defense.effect.structureHpPct||0.1)*researchPowerLevel(game.legacyDefense||0)));
      const houseHealth=attachWorldHealthBar(g,3.35,2.5);
      const record={group:g,visualRoot:g,x:ghostCell.x,z:ghostCell.z,level:1,hp:houseMaxHp,maxHp:houseMaxHp,
        kind:"house",popProvided:(ACTIVE_MODE.economy&&ACTIVE_MODE.economy.housePop)||6,...houseHealth};
      finishIndustrialFacade(g,"house");reserveFootprint(record,buildCells);builtHouses.push(record);
      updateResUI();
      sfx.complete();
    }else if(b.id==="heroHub"){
      const g=takeConstructionModel(constructionJob,makeHeroHubModel);g.position.set(cc.x,gy,cc.z);scene.add(g);
      const maxHp=620*(1+(TECH_TREE.defense.effect.structureHpPct||.1)*researchPowerLevel(game.legacyDefense||0)),health=attachWorldHealthBar(g,4.1,4);const record={group:g,x:ghostCell.x,z:ghostCell.z,hp:maxHp,maxHp,kind:"heroHub",...health};reserveFootprint(record,buildCells);heroHubs.push(record);sfx.complete();
    }else if(b.id==="research"){
      const g=takeConstructionModel(constructionJob,()=>makeBuildingModel("research")),orb=g.userData.orb;
      g.position.set(cc.x,gy,cc.z);scene.add(g);
      const maxHp=Math.round(520*(1+(TECH_TREE.defense.effect.structureHpPct||0.1)*researchPowerLevel(game.legacyDefense||0)));
      const health=attachWorldHealthBar(g,7.25,4.2);
      const record={group:g,orb,x:ghostCell.x,z:ghostCell.z,hp:maxHp,maxHp,kind:"research",...health};
      finishIndustrialFacade(g,"research");reserveFootprint(record,buildCells);researchInstitutes.push(record);
      sfx.complete();
    }else if(b.id==="factory"){
      const g=takeConstructionModel(constructionJob,()=>makeBuildingModel("factory"));
      g.position.set(cc.x,gy,cc.z);scene.add(g);
      const maxHp=Math.round(760*(1+(TECH_TREE.defense.effect.structureHpPct||0.1)*researchPowerLevel(game.legacyDefense||0)));
      const health=attachWorldHealthBar(g,7.15,5.2);
      const record={group:g,x:ghostCell.x,z:ghostCell.z,hp:maxHp,maxHp,kind:"factory",queue:[],progress:0,autoType:null,
        rally:{x:cc.x+TILE*2.8,z:cc.z},...health};
      finishIndustrialFacade(g,"factory");reserveFootprint(record,buildCells);heavyFactories.push(record);
      sfx.complete();
    }else if(b.id==="beacon"){
      const g=takeConstructionModel(constructionJob,makeBeaconVisual),lantern=g.userData.lantern,pool=g.userData.pool;
      g.position.set(cc.x,gy,cc.z);g.traverse((object)=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
      pool.castShadow=false;pool.receiveShadow=false;pool.raycast=()=>{};
      scene.add(g);
      const light=registerSurvivalPointLight(cc.x,gy+4.85,cc.z,1.18,28);if(light)light.userData.beaconLight=true;
      const maxHp=Math.round(180*(1+(TECH_TREE.defense.effect.structureHpPct||0.1)*researchPowerLevel(game.legacyDefense||0)));
      const health=attachWorldHealthBar(g,6.15,2.8);
      const record={group:g,light,lantern,pool,x:ghostCell.x,z:ghostCell.z,level:1,hp:maxHp,maxHp,kind:"beacon",popUsed:needPop||0,...health};
      reserveFootprint(record,buildCells);visionBeacons.push(record);game.popUsed+=needPop;updateResUI();applyMedicalBeaconVisual(record);queueVisionFogRedraw();sfx.complete();
    }
    spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xffd75e,8,6,.8);
    return;
  }

  /* ---- 经典/塔防：沿用原 id 分支 ---- */
  const cost=constructionJob?constructionJob.cost:priceOf(b);
  if(game.gold<cost)return;
  game.gold-=cost;updateGoldUI();
  if(b.id==="wallS"||b.id==="wallB"){
    grid[ghostCell.z][ghostCell.x]=b.id==="wallS"?T_STEEL:T_BRICK;
    if(b.id==="wallS")steelHP.set(idx(ghostCell.x,ghostCell.z),8); /*  玩家钢墙耐久 8 点 */
    const m=buildWallTile(mapGroup,ghostCell.x,ghostCell.z,b.id==="wallS");
    tileMeshes[idx(ghostCell.x,ghostCell.z)]=m;
    mapGroup.add(m);
    sfx.complete();
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
    sfx.complete();
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
    /*  炮台血条（受击后显示） */
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
    sfx.complete();
  }
  spawnParticles(new THREE.Vector3(cc.x,gy+1,cc.z),0xffd75e,8,6,.8);
}
/*  构筑物运行时：炮台索敌开火 + 地雷触发 */
function updateStructBars(t){
  if(!t||!t.bar||!t.barFg)return;
  if(t.bar.userData&&t.bar.userData.fill===t.barFg){syncWorldHealthBar(t.bar,t.hp,t.maxHp);return;}
  const r=Math.max(0,t.hp/t.maxHp);
  t.bar.visible=t.barFg.visible=r>0&&r<.9999;
  t.barFg.scale.x=r;
  t.barFg.position.x=-(1-r)*1.1;
  if(t.bar.visible){
    if(t.bar.lookAt)t.bar.lookAt(camera.position);
    if(t.barFg.lookAt)t.barFg.lookAt(camera.position);
    if(t.barFg.material&&t.barFg.material.color)t.barFg.material.color.setHex(r>.6?0x62d56f:(r>.3?0xe0b95f:0xd85a4f));
  }
}
function updateDamageHealthBars(){
  for(const structure of [...builtTurrets,...goldMines,...researchInstitutes,...heroHubs,...heavyFactories,...builtHouses,...visionBeacons])updateStructBars(structure);
  for(const [cellKey,meta] of wallMeta){
    const group=tileMeshes[cellKey];if(!group||!meta)continue;
    syncWorldHealthBar(group.userData.healthBar,steelHP.get(cellKey)||0,wallMaxHp(meta.lv));
  }
}
function destroyTurret(t){
  explode(t.group.position.clone().setY(1.4),false);
  scene.remove(t.group);disposeTransientObject3D(t.group);releaseDestroyedFootprint(t);game.popUsed=Math.max(0,game.popUsed-(t.popUsed||0));
  const i=builtTurrets.indexOf(t);
  if(i>=0)builtTurrets.splice(i,1);
  camShake=Math.max(camShake,.4);
}
function isEnemyCombatTarget(enemy){
  return !!(enemy&&enemy.alive&&!enemy.dying&&enemy.hp>0&&enemy.group?.parent===scene&&
    !enemy._resourcesReleased&&Number.isFinite(enemy.group.position.x)&&Number.isFinite(enemy.group.position.z));
}
function updateBuiltTurrets(dt){
  const now=performance.now();
  /*  科技树全局增益：B伤害 / C射程 / D射速 */
  const turretLv=researchPowerLevel((game.tech&&game.tech.turret)||0);
  const dMult=(1+.4*(game.stats.netmasterLv||0))*(1+(TECH_TREE.turret.effect.damagePct||0.08)*turretLv);
  const rMult=ACTIVE_MODE.key==="survival"?1:(1+.25*(game.stats.netmasterLv||0))*(1+(TECH_TREE.turret.effect.rangePct||0.025)*turretLv);
  const fMult=1+(TECH_TREE.turret.effect.fireRatePct||0.045)*turretLv;
  for(const t of builtTurrets){
    t.cd-=dt;

    const effectiveRange=(ACTIVE_MODE.key==="survival"?SurvivalSystem.rangeAtResearchLevel(t.turretKey||t.kind,turretLv)*TILE:t.range*rMult)*(1+.03*doctrineLevel('range'));
    const rangeSq=effectiveRange*effectiveRange;
    const muzzle=t.group.userData.turret?.userData.muzzleMarker;
    const sightOrigin=muzzle?muzzle.getWorldPosition(new THREE.Vector3()):t.group.position.clone().add(new THREE.Vector3(0,1.5,0));
    const validTarget=(enemy)=>{
      if(!isEnemyCombatTarget(enemy)||now<enemy.spawnFlash||!isPositionVisible(enemy.group.position))return false;
      const dx=enemy.group.position.x-t.group.position.x,dz=enemy.group.position.z-t.group.position.z;
      return dx*dx+dz*dz<=rangeSq&&(ACTIVE_MODE.key!=="survival"||terrainFireLineClear(sightOrigin,enemyAimPoint(enemy)));
    };
    let tgt=validTarget(t.lockTarget)?t.lockTarget:null;
    if(!tgt){
      let best=rangeSq;
      for(const e of enemies){
        const dx=e.group.position.x-t.group.position.x,dz=e.group.position.z-t.group.position.z;
        const d2=dx*dx+dz*dz;
        if(d2<best&&validTarget(e)){best=d2;tgt=e;}
      }
      t.lockTarget=tgt;
    }
    if(!tgt){t._sustainTime=0;t._sustainTarget=null;t._sustainMultiplier=1;}
    if(tgt){
      if(t._sustainTarget!==tgt){t._sustainTarget=tgt;t._sustainTime=0;}t._sustainTime=(t._sustainTime||0)+dt;
      t._sustainMultiplier=1+Math.min(5,Math.floor(t._sustainTime/2))*.01*doctrineLevel('sustained');
      const lead=SurvivalSystem.predictInterceptPoint({shooter:t.group.position,target:tgt.group.position,
        velocity:tgt.velocity||{x:0,z:0},projectileSpeed:TURRET_PROJECTILE_SPEED,maxLeadTime:2.5});
      const aimPoint=enemyAimPoint(tgt);
      if(t.kind!=="emp"){aimPoint.x=lead.x;aimPoint.z=lead.z;}
      const dx=aimPoint.x-t.group.position.x,dz=aimPoint.z-t.group.position.z;
      const want=Math.atan2(dx,dz);
      /*  P3-3 固定坦克炮台：车体不动，仅炮塔旋转索敌 */
      const tur=t.group.userData.turret;
      if(tur)aimTurretAt(t.group,aimPoint,dt);
      else t.group.rotation.y+=shortAngle(want-t.group.rotation.y)*Math.min(1,dt*7);
      if(t.cd<=0&&(!tur||tur.userData.aimReady)){
        t.cd=t.fireCd/(fMult*(t._speedAura||1)*(1+.02*doctrineLevel('feed')));
        const muzzleMarker=tur&&tur.userData.muzzleMarker;
        const shotOrigin=muzzleMarker?muzzleMarker.getWorldPosition(new THREE.Vector3()):null;
        const origin=shotOrigin||t.group.position;
        const dir=aimPoint.clone().sub(origin).normalize();
        if(t.kind==="emp"){
          fireLaserTurret(t,origin,enemyAimPoint(tgt),effectiveRange,t.dmg*dMult*(t._damageAura||1)*(t._sustainMultiplier||1));
        }else if(t.kind==="antitank"){
          /* 狙击：超远高伤，可穿透（升级后） */
          shoot({group:t.group,dmg:t.dmg*dMult*(t._damageAura||1)*(t._sustainMultiplier||1),blast:t.blast},dir,true,{armorPierce:t.pierce,pierce:0,thruWall:true,source:"turret",projectileType:"antitank",origin:shotOrigin});
        }else if(t.kind==="pulse"){
          /* 脉冲：范围眩晕 + 伤害 */
          const R=effectiveRange,dmg=t.dmg*dMult*(t._damageAura||1)*(t._sustainMultiplier||1);
          for(const e of enemies){
            if(!e.alive||now<e.spawnFlash||!isPositionVisible(e.group.position))continue;
            const ex=e.group.position.x-t.group.position.x,ez=e.group.position.z-t.group.position.z;
            if(ex*ex+ez*ez<R*R){
              damageEnemy(e,dmg,{source:"turret",armorPierce:t.pierce});
              e.stunUntil=now+(t.stun||0)*1000;
              spawnParticles(e.group.position.clone().setY(2.2),0xc084fc,3,4,.6);
              if(e.hp<=0)killEnemy(e);
            }
          }
          spawnParticles(t.group.position.clone().setY(1.6),0xc084fc,12,7,1);
        }else if(t.kind==="tesla"){
          /* 电磁：主目标 + 最近 N 个敌人连锁闪电 */
          const R=effectiveRange,dmg=t.dmg*dMult*(t._damageAura||1)*(t._sustainMultiplier||1);
          const hitList=[tgt];
          let cur=tgt;
          for(let c=0;c<(t.chain||0);c++){
            let bestD=1e9,nb=null;
            for(const e of enemies){
              if(!e.alive||now<e.spawnFlash||hitList.indexOf(e)>=0||!isPositionVisible(e.group.position))continue;
              const ex=e.group.position.x-cur.group.position.x,ez=e.group.position.z-cur.group.position.z;
              const d2=ex*ex+ez*ez;
              if(d2<bestD&&d2<(R*1.4)*(R*1.4)){bestD=d2;nb=e;}
            }
            if(!nb)break;
            hitList.push(nb);cur=nb;
          }
          hitList.forEach((e,i)=>{
            const f=1-i*0.15;
            damageEnemy(e,dmg*f,{source:"turret",armorPierce:t.pierce});
            lightningBeam(t.group.position.clone().setY(1.8),e.group.position.clone().setY(1.6),0x8be9fd);
            if(e.hp<=0)killEnemy(e);
          });
        }else{
          /* mg / cannon / 经典：标准发射（ P4-3：塔弹穿墙，不被悬崖/自家建筑挡炮） */
          const projectileType=t.kind==="rapid"?"machinegun":t.kind==="cannon"?"cannon":t.kind==="emp"?"emp":"tank";
          shoot({group:t.group,dmg:t.dmg*dMult*(t._damageAura||1)*(t._sustainMultiplier||1),blast:t.blast},dir,true,{thruWall:true,source:"turret",projectileType,origin:shotOrigin});
        }
      }
    }else t.lockTarget=null;
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
        if(dx*dx+dz*dz<36)damageEnemy(e,6,{source:"turret"});
      });
      destroyBricksAround(pos.x,pos.z,1.8);
      scene.remove(mn.group);
      builtMines.splice(i,1);
    }
  }
}
/*  构筑完成（按钮或倒计时归零共用） */
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
  clearEnemyTargetReferences(e);
  if(typeof _wdProgress==="function")_wdProgress();   /*  P1-1：敌人死亡=波次推进事实 */
  const horde=enemies.length;
  const skipDeathAnim=!e.boss&&!e.giant&&horde>220;
  if(ACTIVE_MODE.key==="survival"&&(e.boss||e.giant||e.elite||horde<180||Math.random()<.18))
    spawnCorpseRemains(e.group.position.clone().setY(0),e.boss||e.elite,(e.visualRadius||1.5)/1.5);
  if(!skipDeathAnim||e.boss)explode(e.group.position.clone().setY(1.4),e.boss);
  /*  角色模型：保留 mesh 播放 die 骨骼动画，1.05s 后由 updateEnemies 真正清理 */
  if(skipDeathAnim){
    if(e.mixer){try{e.mixer.stop();}catch(_){}}
    scene.remove(e.group);releaseEnemyResources(e);
    if(e.beam){scene.remove(e.beam);disposeTransientObject3D(e.beam);e.beam=null;}
  }else if(e.characterModel&&e.actions&&e.actions.die){
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
    /*  beam 变红：视觉提示"濒死"——1s 内会被一起清理 */
    if(e.beam){e.beam.material.color.setHex(0xff5d5d);e.beam.material.opacity=.55;}
  }else if(e.characterModel){
    e.dying=true;e.dyingT=0;e.currentAnim=_ANIM_DEATH;
    if(e.mixer)e.mixer.stopAllAction();
    if(e.beam){e.beam.material.color.setHex(0x7a1118);e.beam.material.opacity=.35;}
  }else{
    scene.remove(e.group);releaseEnemyResources(e);
    if(e.beam)scene.remove(e.beam);
  }
  if(giveScore){
    game.score+=e.score;$("score").textContent=game.score;
    /* 生存模式与经典玩法完全隔离：生存不生成经典道具掉落。 */
    if(ACTIVE_MODE.key!=="survival")dropPowerup(e.group.position,!!e.elite);
    /*  金币掉落：仅构筑模式生效（经典/塔防不产金币） */
    if(ACTIVE_MODE.buildEnabled){
      let g;
      if(ACTIVE_MODE.key==="survival"){
        /*  生存：统一击杀金币 economy.killGold，保留精英/狂暴加成 */
        const ec=ACTIVE_MODE.economy||{};
        g=e.boss?(ec.bossGold||70):((ec.killGold||1)*(e.elite?3:1));
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
    /*  猎杀冲锋：击杀后短时提速 */
    if(game.stats.sprintLv>0)game.sprintUntil=performance.now()+game.stats.sprintDur;
    /*  收割装置：击杀修复装甲 */
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
  /*  单兵力场：优先消耗护盾抵挡 */
  if(game.playerShieldHP>0){
    game.playerShieldHP--;sfx.hit();
    spawnParticles(player.group.position.clone().setY(1.8),0x7ec8ff,8,6,.8);
    player.invulnUntil=now+600;
    toast(` 力场抵消伤害（剩余 ${game.playerShieldHP}）`);
    return;
  }
  player.hp-=dmg;sfx.hurt();camShake=Math.max(camShake,.5);
  spawnParticles(player.group.position.clone().setY(1.5),0xff5d5d,8,7);
  updateHpUI();
  if(player.hp<=0)playerDie();
  else player.invulnUntil=now+800;
}
/* 敌人伤害唯一入口：所有直击、持续、溅射和连锁伤害先经过同一套护甲规则。 */
function damageEnemy(enemy,rawDamage,options={}){
  if(!enemy||!enemy.alive)return 0;
  const raw=Math.max(0,Number(rawDamage)||0);
  const armor=Math.min(.72,Math.max(0,Number(enemy.armor)||0));
  const pierce=Math.min(1,Math.max(0,Number(options.armorPierce)||0)+(options.source==='turret'?.03*doctrineLevel('penetration'):0));
  const armorFactor=1-armor*(1-pierce);
  const pressure=options.source==="turret"?SurvivalSystem.turretPressureMultiplier(enemy.type,enemy.boss):1;
  const pressurePierce=pressure+(1-pressure)*pierce;
  const amount=raw*armorFactor*pressurePierce*Math.max(0,Number(options.multiplier)||1);
  enemy.hp-=amount;
  if(amount>0){enemy.hitReaction=Math.min(1,.25+amount/Math.max(1,enemy.maxHp)*3);enemy.poseDirty=true;}
  if(enemy.hp<=0){if(options.source==='hero')heroArchive().kills++;killEnemy(enemy);}
  return amount;
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
/* 波间推进使用正式游戏时钟，不依赖浏览器定时器和 UI 状态。
   建造、研究与大门面板只改变交互层，不得取消已经排队的下一波。 */
let _waveClearing=false;
let _wdStallT=0;                         /*  P1-1：无推进事实秒数（声明须在 resetGame 首次调用之前） */
let _wdKillTimer=0;                      /*  P1-1：看门狗逐个击杀计时器 */
let _wdHarvesting=false;                 /* v5.1.0：超时后保持收割态 */
let _wdRerouted=false;                   /* 一次无进展周期只重算一次寻路 */
function waveCleared(){
  if(_waveClearing)return;              /*  重复进入直接吞掉 */
  _waveClearing=true;
  game.score+=500+game.wave*100;$("score").textContent=game.score;
  /*  肃清金币奖励 */
  const economy=ACTIVE_MODE.economy||{};
  const bonus=typeof economy.waveClearBonus==="function"
    ?economy.waveClearBonus(game.wave)
    :40+game.wave*15;
  game.gold+=bonus;updateGoldUI();
  announce(`第 ${game.wave} 波 肃清！　+${bonus} 金币`);
  game.waveTransition=SurvivalSystem.createWaveTransition(game.wave+1,1.8);
  updateEnemyLeftUI();
}
function updateWaveTransition(dt){
  const current=game.waveTransition;
  if(!current||current.consumed)return;
  game.waveTransition=SurvivalSystem.tickWaveTransition(current,dt,state);
  if(Math.ceil(current.remaining)!==Math.ceil(game.waveTransition.remaining))updateEnemyLeftUI();
  if(!game.waveTransition.ready)return;
  game.waveTransition=Object.freeze({...game.waveTransition,consumed:true});
  if(ACTIVE_MODE.key==="survival"){
    if(game.wave>=ACTIVE_MODE.victoryWave&&!game.endless){showSettle();return;}
    announce(`第 ${game.waveTransition.nextWave} 波 来袭！`);
    startWave(game.waveTransition.nextWave);
  }else{
    showUpgradeChoice();
  }
}
/*  进入波间构筑阶段（倒计时由模式配置决定） */
function showBuildPhase(){
  state=STATE.BUILD;
  game.buildTimer=ACTIVE_MODE.buildTimer||45;
  $("build").classList.remove("hidden");
  renderShop();updateGoldUI();selectBuild(null);
}
/*  幸存者模式：B 键随时打开构筑商店（暂停游戏，无倒计时） */
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
/*  幸存者模式科技树：T 键随时打开，暂停游戏升级全局科技 */
let techReturnState=STATE.PLAYING;

/* ---------------- P4-5 WC3 底部常驻 HUD（三栏） ----------------
   命令居中，资源位于左上；左侧显示选中对象，右侧显示生产，小地图独立锚定。
   B 键 = 进入建造模式（不暂停）：命令卡切成建造条目，1-9 选择，左键放置，右键/B 取消。 */
let _cmdT=0;
let wc3BuildMode=false;   /*  P4-5：建造模式（命令卡二态） */

/* ---- 选中系统：selKind(sel/enemy/wall/turret/goldmine/house/tech) + 引用 ---- */
let wc3Sel=null;
let wc3Selection=[];
let wc3SelectionRing=null;
let wc3CommandPage="root";
const wc3ExtraRings=[];
let portraitSignature="";
function selectionPortraitIcon(entry){
 if(!entry)return 'shield';
 if(entry.kind==='unit')return entry.ref.type==='repair'?'repair':'tank';
 return {base:'base',player:'tank',factory:'factory',research:'research',enemy:'zombie',turret:entry.ref.turretKey==='emp'?'laser':'turret',wall:'wall',goldmine:'mine',beacon:'health',house:'house',construction:'build'}[entry.kind]||'shield';
}
function renderModelPortrait(ref,icon){
 const fallback=$('spIcon'),canvas=$('spPortraitCanvas');
 if(canvas)canvas.style.display='none';if(fallback){fallback.style.display='flex';fallback.innerHTML=UIIcons.svg(icon);}
}
function updateSelectionPortrait(){
  const grid=$("spPortraitGrid"),canvas=$("spPortraitCanvas"),fallback=$("spIcon");if(!grid||!canvas)return;
  if(wc3Selection.length>1){
    portraitSignature="";canvas.style.display="none";if(fallback)fallback.style.display="none";grid.style.display="grid";grid.innerHTML="";
    wc3Selection.slice(0,8).forEach((entry)=>{const mini=document.createElement("div");mini.className="portraitMini";mini.innerHTML=UIIcons.svg(entry.kind);mini.title=entry.ref.name||entry.kind;grid.appendChild(mini);});
    return;
  }
  grid.style.display="none";grid.innerHTML="";
  const entry=wc3Sel;if(!entry)return;
  const signature=`${entry.kind}:${entry.ref.type||entry.ref.turretKey||entry.ref.level||"1"}`;
  if(signature!==portraitSignature){portraitSignature=signature;renderModelPortrait(entry.ref,selectionPortraitIcon(entry));}
}
function wc3UpdateSelectionRing(){
  if(!wc3Sel)return;
  const ref=wc3Sel.kind==="construction"?{group:wc3Sel.ref.site||wc3Sel.ref.worker}:wc3Sel.ref;
  let x,z,y,radius=1.7;
  if(ref&&ref.group){x=ref.group.position.x;z=ref.group.position.z;y=heightAt(x,z);radius=ref.radius||radius;}
  else if(ref&&ref.x!=null){const c=cellCenter(ref.x,ref.z);x=c.x;z=c.z;y=heightAt(x,z);radius=TILE*.46;}
  else return;
  if(!wc3SelectionRing){
    wc3SelectionRing=new THREE.Mesh(new THREE.RingGeometry(.72,1,40),
      new THREE.MeshBasicMaterial({color:0x48e06f,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));
    wc3SelectionRing.rotation.x=-Math.PI/2;
  }
  wc3SelectionRing.material.color.setHex(wc3Sel.kind==="enemy"?0xd9443e:0x48e06f);
  wc3SelectionRing.scale.setScalar(Math.max(.8,radius));
  wc3SelectionRing.position.set(x,y+.08,z);
  wc3SelectionRing.visible=true;
  if(wc3SelectionRing.parent!==scene)scene.add(wc3SelectionRing);
}
function wc3ClearSel(){
  wc3Sel=null;
  wc3Selection=[];
  wc3CommandPage="root";
  if(wc3SelectionRing)wc3SelectionRing.visible=false;
  wc3ExtraRings.forEach((ring)=>ring.visible=false);
  const hud=$("hud");if(hud)hud.classList.remove("hasSel");
  const sp=$("selPanel");if(sp)sp.classList.remove("show");
}
function wc3Select(kind,ref){
  wc3SetSelection([{kind,ref}]);
}
function wc3SetSelection(entries){
  const previousKind=wc3Sel&&wc3Sel.kind;
  wc3Selection=(entries||[]).filter((entry)=>entry&&entry.ref);
  wc3Sel=wc3Selection[0]||null;
  if(!wc3Sel){wc3ClearSel();return;}
  if(wc3Sel.kind!==previousKind)wc3CommandPage="root";
  wc3UpdateSelectionRing();
  wc3ExtraRings.forEach((ring)=>ring.visible=false);
  wc3Selection.slice(1).forEach((entry,index)=>{
    if(!entry.ref.group)return;
    let ring=wc3ExtraRings[index];
    if(!ring){
      ring=new THREE.Mesh(new THREE.RingGeometry(.72,1,32),new THREE.MeshBasicMaterial({color:0x74f0a0,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;scene.add(ring);wc3ExtraRings.push(ring);
    }
    const p=entry.ref.group.position;ring.position.set(p.x,heightAt(p.x,p.z)+.08,p.z);ring.scale.setScalar((entry.ref.radius||1.3)*(1+.06*Math.sin(performance.now()*.004+index)));ring.material.opacity=.58+.18*Math.sin(performance.now()*.004+index);ring.visible=true;
  });
  const hud=$("hud");if(hud)hud.classList.add("hasSel");
  const sp=$("selPanel");if(sp){sp.classList.add("show");sp.classList.toggle("multi",wc3Selection.length>1);}
}
function baseSelectionRef(){
  return {group:baseGroup,kind:"base",get hp(){return game.gateHp;},get maxHp(){return game.gateMaxHp;}};
}
function focusSelectedStructure(kind,ref,moveCamera=true){
  if(!ref||!ref.group)return false;
  wc3Select(kind,ref);
  if(moveCamera){camFocus.x=ref.group.position.x;camFocus.z=ref.group.position.z;}
  wc3RenderSel();renderCmdCard();return true;
}
function selectBaseForCommand(openBuild=false,page="root"){
  if(!baseAlive||!baseGroup)return false;
  if(wc3BuildMode&&!openBuild)closeWc3Build();
  focusSelectedStructure("base",baseSelectionRef(),!openBuild);wc3CommandPage=page;
  if(openBuild)openWc3Build();else renderCmdCard();
  return true;
}
function selectResearchForCommand(){
  if(wc3BuildMode)closeWc3Build();
  const institute=researchInstitutes[0];
  if(!institute){toast(" 请先建造研究院");return false;}
  return focusSelectedStructure("research",institute);
}
function issueSelectionCommand(command,target=null){
  const controllable=wc3Selection.filter((entry)=>entry.kind==="player"||entry.kind==="unit").map((entry)=>entry.ref).filter((ref)=>ref&&ref.alive);
  if(!controllable.length)return false;
  const slots=target?SurvivalSystem.formationSlotsForRadii(controllable.map((unit)=>unit.radius||1.5),target,{padding:.45}):[];
  controllable.forEach((unit,index)=>{
    unit.autoRepairBlocked=false;
    if(command==="stop"){
      clearFriendlyRoute(unit);unit.attackTarget=null;unit.repairTarget=null;unit.attackMove=false;unit.command="stop";unit.patrolPoints=[];return;
    }
    const point=slots[index]||target;
    if(command==="patrol"){
      unit.patrolPoints=[{x:unit.group.position.x,z:unit.group.position.z},{x:point.x,z:point.z}];unit.patrolIndex=1;
      setFriendlyMoveTarget(unit,unit.patrolPoints[1],true);unit.command="patrol";return;
    }
    setFriendlyMoveTarget(unit,point,true,target);unit.attackTarget=null;unit.repairTarget=null;
    unit.attackMove=command==="attackMove";unit.command=command;
  });
  return true;
}
function wc3RenderSel(){
  const sp=$("selPanel");if(!sp)return;
  if(!wc3Sel){sp.classList.remove("show","multi");return;}
  wc3UpdateSelectionRing();
  const ic=$("spIcon"),nm=$("spName"),st=$("spStat"),bw=$("spBarWrap"),fg=$("spBarFg"),acts=$("spActs");
  const s=wc3Sel.ref,k=wc3Sel.kind;
  let html="",hp=-1,hpMax=1,btns="";
  if(wc3Selection.length>1){
    ic.innerHTML=UIIcons.svg("shield");nm.textContent=`已选择 ${wc3Selection.length} 个单位`;
    const kindNames={wall:"巨岩墙",goldmine:"金矿",turret:"炮台",beacon:"医疗灯塔",factory:"重工厂",research:"研究院",base:"基地"};
    const counts={};wc3Selection.forEach((entry)=>{const name=entry.kind==="player"?"指挥车":entry.ref.name||kindNames[entry.kind]||"单位";counts[name]=(counts[name]||0)+1;});
    html=`批量控制 · ${Object.entries(counts).map(([name,count])=>`${name} ×${count}`).join(" · ")}<br>右键地面移动 · A 攻击移动 · S 停止`;
  }else if(k==="construction"&&constructionJobs.includes(s)){
    ic.innerHTML=UIIcons.svg("build");nm.textContent=s.build.name;
    const phase=s.phase==="building"?`施工中 · ${Math.ceil(s.duration-s.elapsed)} 秒`:s.phase==="returning"?"工程师返回基地":s.route?"工程师赶往工地":"道路受阻，等待通行";
    html=phase+` · 已付 ${s.cost} 金币`;hp=s.elapsed;hpMax=s.duration;
  }else if(k==="base"&&s&&baseAlive&&baseGroup){
    ic.innerHTML=UIIcons.svg("base");nm.textContent=BASE_ROUTES[game.doctrine]?.name||"基础指挥基地";hp=game.gateHp;hpMax=game.gateMaxHp;
    html=game.doctrine?`<b>${BASE_ROUTES[game.doctrine].name}</b> · 底部四格研究专属科技`:`选择高级基地流派 · 改建完成后解锁四项专属科技`;
  }else if(k==="player"&&s&&s.alive){
    ic.innerHTML=UIIcons.svg("shield");
    nm.textContent="装甲指挥车";
    hp=s.hp;hpMax=s.maxHp;
    html=`伤害 <b>${game.stats.dmg.toFixed(1)}</b> · 射速 <b>${game.stats.fireRate.toFixed(2)}</b> · 移速 <b>${(s.speed*game.stats.moveSpeed).toFixed(1)}</b>`;
  }else if(k==="unit"&&s&&s.alive){
    ic.innerHTML=UIIcons.svg(s.type==="repair"?"repair":"shield");nm.textContent=s.name;
    hp=s.hp;hpMax=s.maxHp;html=`${friendlyWeaponDescription(s)}<br>伤害 <b>${s.dmg.toFixed(1)}</b> · 移速 <b>${s.speed.toFixed(1)}</b> · 人口 <b>${s.population}</b>`;
  }else if(k==="factory"&&s&&heavyFactories.includes(s)){
    ic.innerHTML=UIIcons.svg("factory");nm.textContent="重工厂";hp=s.hp;hpMax=s.maxHp;
    html=s.queue[0]?`生产中 <b>${SurvivalSystem.FRIENDLY_UNIT_TYPES[s.queue[0].typeId].name}</b> · <b>${Math.round(s.progress*100)}%</b> · 队列 <b>${s.queue.length}/20</b>`:`队列空闲 · <b>0/20</b>`;
  }else if(k==="heroHub"&&s){ic.innerHTML=UIIcons.svg("base");nm.textContent="英雄枢纽";hp=s.hp;hpMax=s.maxHp;html=`英雄 ${{unbuilt:'待生产',producing:'整备中',alive:'已出战',dead:'等待复活'}[heroArchive().status]} · 击杀 ${heroArchive().kills} · 攻击成长 ×${HeroSystem.growth(heroArchive().kills).toFixed(2)}`;
  }else if(k==="research"&&s&&researchInstitutes.includes(s)){
    ic.innerHTML=UIIcons.svg("research");
    const cap=researchUnlockedMaxLevel();
    let tierName="初级研究院";
    if(game.researchTier>=1)tierName=`高级研究院 · ${BASE_ROUTES[game.doctrine]?.name||""}`;
    else if(game.doctrine)tierName="初级研究院 · 可升阶高级";
    nm.textContent=tierName;hp=s.hp;hpMax=s.maxHp;
    const lines=Object.values(TECH_TREE).filter((tech)=>tech.tier===0||(tech.tier===1&&tech.route===game.doctrine)).map((tech)=>`${tech.name} ${game.tech[tech.id]||0}/${cap}`);
    html=lines.join(" · ")+(game.doctrine?` · 专属 ${Object.keys(game.doctrineTech||{}).filter(k=>game.doctrineTech[k]>0).length}`:"")+`<br>金矿 ${goldMines.length}/${mineUnlockedCount()} · 墙上限 ${wallUnlockedMaxLevel()} · 炮台上限 ${turretUnlockedMaxLevel()}`;
  }else if(k==="house"&&s&&builtHouses.includes(s)){
    ic.innerHTML=UIIcons.svg("house");nm.textContent=`人口房 Lv${s.level||1}`;hp=s.hp;hpMax=s.maxHp;
    html=`人口上限 +${s.popProvided||6} · 建造上限 5 座`;
  }else if(k==="enemy"&&s&&s.alive){
    ic.innerHTML=UIIcons.svg(s.boss?"zombie":"zombie");
    nm.textContent=(s.boss?"BOSS · ":"")+(s.bossName||ENEMY_TYPES[s.type]?.name||s.type||"僵尸");
    /* Boss 的 type 可能是 null（由 bossProfile 只提供 bossId），
       不能再从 ENEMY_TYPES 推断最大生命，否则 hpMax 会退化为当前 hp，血条永远满格。 */
    hp=Math.max(0,Number(s.hp)||0);hpMax=Math.max(1,Number(s.maxHp)||hp);
    html=`近战伤害 <b>${enemyMeleeDamage(s).toFixed(2)}</b> · 速度 <b>${s.speed.toFixed(1)}</b> · 时间伤害/血量 ×${survivalPressureMultiplier().toFixed(2)}`;
  }else if(k==="turret"&&s&&builtTurrets.indexOf(s)>=0){
    ic.innerHTML=UIIcons.svg(TURRET_TYPES[s.turretKey]?"turret":"stop");
    nm.textContent=TURRET_TYPES[s.turretKey]?TURRET_TYPES[s.turretKey].name:"炮塔";
    hp=s.hp;hpMax=s.maxHp;
    html=`等级 <b>Lv${s.level+1}</b> · 伤害 <b>${s.dmg}</b> · 射程 <b>${Math.round(s.range/TILE)}</b><br>${TURRET_TYPES[s.turretKey]?.desc||''}`;
    const branchCost=turretBranchCost();
    const turretCost=turretUpgradeCost(s);
  }else if(k==="wall"&&s&&grid[s.z][s.x]===T_STEEL){
    const lv=wallLvAt(s.x,s.z)||1,w=wallDefinition(lv);
    const progress=SurvivalSystem.wallProgress(lv),nextCost=lv<wallUnlockedMaxLevel()?wallPriceNext(lv):null;
    ic.innerHTML=UIIcons.svg("wall");
    nm.textContent=w?`${w.tag}墙 Lv${lv}`:"墙";
    hp=steelHP.get(idx(s.x,s.z))||0;hpMax=w?wallMaxHp(lv):hp;
    html=w?`${progress.name}大阶 · 小等级 <b>${progress.minor}/10</b> ·  <b>${Math.ceil(hp)}/${hpMax}</b>${w.thorns>0?` · 反伤 <b>${Math.round(w.thorns*100)}%</b>`:""}`:"";
  }else if(k==="goldmine"&&s&&goldMines.indexOf(s)>=0){
    ic.innerHTML=UIIcons.svg("coin");nm.textContent=`金矿 Lv${s.level}`;
    const currentIncome=SurvivalSystem.mineIncome(s.level),nextCost=goldMineUpCost(s.level),nextIncome=nextCost==null?null:SurvivalSystem.mineIncome(s.level+1);
    html=`产出 <b>${currentIncome}</b> 金/秒${nextIncome==null?" · <b>五次升级完成</b>":` · 下级 <b>${nextIncome}</b> 金/秒`}`;
  }else if(k==="beacon"&&s&&visionBeacons.includes(s)){
    ic.innerHTML=UIIcons.svg("health");nm.textContent=`医疗灯塔 Lv${s.level||1}`;hp=s.hp;hpMax=s.maxHp;
    html=`视野 <b>${medicalBeaconVisionRadius(s)}</b> · 修补 <b>${(medicalBeaconRepairPercentPerSecond(s)*100).toFixed(2)}%</b>最大生命/秒 · 范围 <b>${medicalBeaconRepairRadius(s)}</b> · 多塔封顶 <b>10%</b>/秒`;
  }else{wc3ClearSel();return;}
  nm.textContent=nm.textContent||"";
  st.innerHTML=html;
  if(hp>=0&&bw){bw.style.display="block";fg.style.width=Math.max(0,Math.min(100,hp/hpMax*100))+"%";
    fg.style.background=hp/hpMax>.5?"linear-gradient(90deg,#39d98a,#7cf7c0)":"linear-gradient(90deg,#ff5d5d,#ffa26d)";}
  else if(bw)bw.style.display="none";
  acts.dataset.signature="";acts.innerHTML="";
  updateSelectionPortrait();
}

/* ---- 左键点选（raycast 场景对象 → 反查数据结构） ---- */
const _selRay=new THREE.Raycaster(),_selNdc=new THREE.Vector2();
function wallSelectionFromObject(object){
  let cursor=object;
  while(cursor){
    const cell=cursor.userData&&cursor.userData.wallCell;
    if(cell&&inMap(cell.x,cell.z)&&grid[cell.z][cell.x]===T_STEEL&&steelHP.get(idx(cell.x,cell.z))>0)
      return {kind:"wall",ref:{x:cell.x,z:cell.z}};
    cursor=cursor.parent;
  }
  return null;
}
function wc3PickAt(px,py){
  _selNdc.x=(px/innerWidth)*2-1;_selNdc.y=-(py/innerHeight)*2+1;
  _selRay.setFromCamera(_selNdc,camera);
  const hits=_selRay.intersectObjects(scene.children,true);
  for(const h of hits){
    let o=h.object;
    while(o){
      const construction=constructionJobs.find(j=>j.site===o||j.worker===o);
      if(construction)return {kind:"construction",ref:construction};
      if(player&&player.alive&&player.group===o)return{kind:"player",ref:player};
      if(baseAlive&&baseGroup===o)return{kind:"base",ref:baseSelectionRef()};
      const unit=friendlyUnits.find((candidate)=>candidate.group===o&&candidate.alive);
      if(unit)return{kind:"unit",ref:unit};
      /* 敌人：Character 模型根挂 e.group */
      const en=enemies.find(e=>e.group===o&&e.alive&&!e.dying);
      if(en)return{kind:"enemy",ref:en};
      const tr=builtTurrets.find(t=>t.group===o);
      if(tr)return{kind:"turret",ref:tr};
      const mn=goldMines.find(m=>m.group===o);
      if(mn)return{kind:"goldmine",ref:mn};
      const hub=heroHubs.find(item=>item.group===o);if(hub)return {kind:"heroHub",ref:hub};
      const institute=researchInstitutes.find((item)=>item.group===o);
      if(institute)return{kind:"research",ref:institute};
      const factory=heavyFactories.find((item)=>item.group===o);
      if(factory)return{kind:"factory",ref:factory};
      const house=builtHouses.find((item)=>item.group===o);
      if(house)return{kind:"house",ref:house};
      const beacon=visionBeacons.find((item)=>item.group===o);
      if(beacon)return{kind:"beacon",ref:beacon};
      o=o.parent;
    }
    /* 墙：优先沿多层模型向上查 wallCell；点位反查作为程序化几何兜底。 */
    const wallSelection=wallSelectionFromObject(h.object);if(wallSelection)return wallSelection;
    if(h.point){
      const cx=Math.round((h.point.x+HALF)/TILE-.5),cz=Math.round((h.point.z+HALF)/TILE-.5);
      if(inMap(cx,cz)&&grid[cz][cx]===T_STEEL&&steelHP.get(idx(cx,cz))>0)
        return{kind:"wall",ref:{x:cx,z:cz}};
    }
  }
  /* 模型可能只有子网格或被特效遮挡；用屏幕空间命中半径兜底，保证英雄和小型单位可点选。 */
  const candidates=[];
  for(const entry of wc3SelectableEntriesFor({kind:'unit'}))candidates.push(entry);
  if(player&&player.alive)candidates.push({kind:'player',ref:player});
  for(const entry of [{kind:'heroHub',ref:heroHubs[0]},{kind:'factory',ref:heavyFactories[0]}])if(entry.ref)candidates.push(entry);
  let closest=null,best=Infinity;
  for(const entry of candidates){
    const position=wc3SelectionWorldPosition(entry);if(!position)continue;
    const projected=position.clone().project(camera);if(projected.z<-1||projected.z>1)continue;
    const sx=(projected.x+1)*innerWidth/2,sy=(-projected.y+1)*innerHeight/2;
    const radius=entry.kind==='player'||entry.ref.type==='hero'?58:entry.kind==='unit'?42:48;
    const distance=Math.hypot(px-sx,py-sy);if(distance<=radius&&distance<best){best=distance;closest=entry;}
  }
  if(closest)return closest;
  return null;
}
function projectileImpactFx(type,pos){
  const fx={
    machinegun:[0xffd56b,4,4,.22],cannon:[0xff8d42,18,11,.65],antitank:[0xf7e5b7,11,10,.42],
    emp:[0x8deaff,22,6,.82],shotgun:[0xffe2a0,9,8,.28],incendiary:[0xff5428,24,12,.75],
    grenade:[0xd6a15e,20,10,.7],tank:[0xffc27c,13,9,.5]
  }[type]||[0xffc27c,10,8,.4];
  spawnParticles(pos,fx[0],fx[1],fx[2],fx[3]);
  if(type==='emp'){spawnParticles(pos,0xe3fbff,12,4,.35);camShake=Math.max(camShake,.22);}
  else if(type==='incendiary'){spawnParticles(pos,0xffd36a,12,7,.6);camShake=Math.max(camShake,.3);}
  else if(type==='cannon'||type==='grenade'||type==='tank'){camShake=Math.max(camShake,.18);}
}

function wc3SelectionWorldPosition(entry){
  if(!entry||!entry.ref)return null;
  if(entry.ref.group)return entry.ref.group.position;
  if(entry.ref.x!=null&&entry.ref.z!=null){
    const center=cellCenter(entry.ref.x,entry.ref.z);
    return new THREE.Vector3(center.x,heightAt(center.x,center.z),center.z);
  }
  return null;
}
function wc3EntryInViewport(entry){
  const position=wc3SelectionWorldPosition(entry);if(!position)return false;
  const projected=position.clone().project(camera);
  if(projected.z<-1||projected.z>1||projected.x<-1||projected.x>1||projected.y<-1||projected.y>1)return false;
  const screenY=(-projected.y+1)*innerHeight/2,dock=$('wc3dock');
  const gameplayBottom=dock?dock.getBoundingClientRect().top:innerHeight;
  return screenY>=0&&screenY<gameplayBottom;
}
function wc3SameSelectionType(entry,seed){
  if(!entry||!seed||entry.kind!==seed.kind)return false;
  if(entry.kind==='unit')return entry.ref.type===seed.ref.type;
  if(entry.kind==='enemy')return entry.ref.type===seed.ref.type&&!!entry.ref.boss===!!seed.ref.boss;
  if(entry.kind==='turret')return entry.ref.turretKey===seed.ref.turretKey;
  return true;
}
function wc3SelectableEntriesFor(seed){
  if(!seed)return [];
  if(seed.kind==='player')return player&&player.alive?[{kind:'player',ref:player}]:[];
  if(seed.kind==='unit')return friendlyUnits.filter((unit)=>unit.alive).map((ref)=>({kind:'unit',ref}));
  if(seed.kind==='enemy')return enemies.filter((enemy)=>enemy.alive&&!enemy.dying&&isPositionVisible(enemy.group.position)).map((ref)=>({kind:'enemy',ref}));
  if(seed.kind==='turret')return builtTurrets.map((ref)=>({kind:'turret',ref}));
  if(seed.kind==='goldmine')return goldMines.map((ref)=>({kind:'goldmine',ref}));
  if(seed.kind==='beacon')return visionBeacons.map((ref)=>({kind:'beacon',ref}));
  if(seed.kind==='research')return researchInstitutes.map((ref)=>({kind:'research',ref}));
  if(seed.kind==='factory')return heavyFactories.map((ref)=>({kind:'factory',ref}));
  if(seed.kind==='house')return builtHouses.map((ref)=>({kind:'house',ref}));
  if(seed.kind==='base')return baseAlive?[{kind:'base',ref:baseSelectionRef()}]:[];
  if(seed.kind==='wall'){
    const entries=[];
    for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++)if(grid[z][x]===T_STEEL&&steelHP.get(idx(x,z))>0)entries.push({kind:'wall',ref:{x,z}});
    return entries;
  }
  return [seed];
}
function wc3VisibleSameTypeEntries(seed){
  return wc3SelectableEntriesFor(seed).filter((entry)=>wc3SameSelectionType(entry,seed)&&wc3EntryInViewport(entry));
}

/* ---- 命令卡：常态 6 格 / 建造模式 10 格（SURVIVAL_BUILDS 顺序） ---- */
let _cmdCardSignature="";
function activateCmdCardItem(event){
  if(event.button!==0)return;
  const button=event.target.closest?.(".cmdBtn");
  const wrap=$("cmdcard");
  if(!button||!wrap||!wrap.contains(button))return;
  const item=button._cmdCardItem;
  if(!item||(item.dim&&!item.sel))return;
  event.preventDefault();
  if(item.act)item.act();
}
function activateCmdCardProgrammaticClick(event){
  if(event.detail!==0)return;
  activateCmdCardItem(event);
}
function selectedEntriesOfKind(kind){return wc3Selection.filter((entry)=>entry.kind===kind&&entry.ref);}
function selectedRecordCell(kind,ref){
  if(!ref)return null;
  if(kind==="turret")return {x:ref.cx,z:ref.cz!=null?ref.cz:ref.z};
  if(ref.x!=null&&ref.z!=null)return {x:ref.x,z:ref.z};
  if(ref.cx!=null&&ref.cz!=null)return {x:ref.cx,z:ref.cz};
  const cells=ref.footprintCells;
  if(cells&&cells.length){const cellIndex=cells[0];return {x:cellIndex%GRID,z:(cellIndex/GRID)|0};}
  return null;
}
function sellSelectedSingle(){
  if(!wc3Sel)return false;
  const {kind,ref}=wc3Sel;
  if(kind==="unit"&&friendlyUnits.includes(ref)){
    if(ref.type==='hero'){toast("唯一英雄不能出售");return false;}
    const refund=Math.round((SurvivalSystem.FRIENDLY_UNIT_TYPES[ref.type]?.cost||0)*.5);
    scene.remove(ref.group);disposeTransientObject3D(ref.group);friendlyUnits.splice(friendlyUnits.indexOf(ref),1);game.popUsed=Math.max(0,game.popUsed-(ref.population||0));if(heroTank===ref)heroTank=null;
    game.gold+=refund;updateGoldUI();updateResUI();toast(` 拆除${ref.name||"单位"}，回收 ${refund} 金币`);wc3ClearSel();wc3RenderSel();renderCmdCard();return true;
  }
  const cell=selectedRecordCell(kind,ref);
  if(!cell||cell.x==null||cell.z==null||!attemptDestroy(cell.x,cell.z))return false;
  wc3ClearSel();wc3RenderSel();renderCmdCard();return true;
}
function batchUpgradeSelected(kind){
  let upgraded=0;const selected=selectedEntriesOfKind(kind),beforeGold=game.gold;
  for(const {ref} of selected){
    const cost=kind==="wall"?(wallLvAt(ref.x,ref.z)<wallUnlockedMaxLevel()?wallPriceNext(wallLvAt(ref.x,ref.z)):null)
      :kind==="goldmine"?goldMineUpCost(ref.level):kind==="beacon"?medicalBeaconUpgradeCost(ref):kind==="turret"?turretUpgradeCost(ref):kind==="house"?houseUpgradeCost(ref.level):null;
    if(cost==null)continue;
    if(game.gold<cost)break;
    const ok=kind==="wall"?upgradeWallAt(ref.x,ref.z):kind==="goldmine"?upgradeGoldMine(ref)
      :kind==="beacon"?upgradeMedicalBeacon(ref):kind==="turret"?upgradeTurretAt(ref.cx,ref.cz):kind==="house"?upgradeHouse(ref):false;
    if(ok)upgraded++;
  }
  const spent=Math.round(beforeGold-game.gold),notUpgraded=Math.max(0,selected.length-upgraded);
  toast(upgraded?` 批量升级 ${upgraded} 个 · 花费 ${spent} · 未升级 ${notUpgraded}`:` 没有可升级的目标 · 未升级 ${notUpgraded}`);
  wc3RenderSel();renderCmdCard();return upgraded;
}
function structureUpgradeItem(kind,ref,multi){
  let cost=null,level=1,act;
  if(kind==="wall"){level=wallLvAt(ref.x,ref.z)||1;cost=level<wallUnlockedMaxLevel()?wallPriceNext(level):null;act=()=>upgradeWallAt(ref.x,ref.z);}
  if(kind==="goldmine"){level=ref.level;cost=goldMineUpCost(level);act=()=>upgradeGoldMine(ref);}
  if(kind==="beacon"){level=medicalBeaconLevel(ref);cost=medicalBeaconUpgradeCost(ref);act=()=>upgradeMedicalBeacon(ref);}
  if(kind==="turret"){level=(ref.level||0)+1;cost=turretUpgradeCost(ref);act=()=>upgradeTurretAt(ref.cx,ref.cz);}
  if(kind==="house"){level=ref.level||1;cost=houseUpgradeCost(level);act=()=>upgradeHouse(ref);}
  if(multi){
    const costs=selectedEntriesOfKind(kind).map(({ref:item})=>kind==="wall"?(wallLvAt(item.x,item.z)<wallUnlockedMaxLevel()?wallPriceNext(wallLvAt(item.x,item.z)):null)
      :kind==="goldmine"?goldMineUpCost(item.level):kind==="beacon"?medicalBeaconUpgradeCost(item):kind==="turret"?turretUpgradeCost(item):kind==="house"?houseUpgradeCost(item.level):null).filter((value)=>value!=null);
    const total=costs.reduce((sum,value)=>sum+value,0),minimum=costs.length?Math.min(...costs):Infinity;
    return {upgradeType:kind,upgradeId:'',upgradeOwner:upgradeOwner(kind,ref),batchUpgrade:true,k:"U",commandId:`${kind}-up`,icon:"upgrade",name:costs.length?"批量升级":"全部满级",price:costs.length?total:null,hot:"U",tip:`选中 ${selectedEntriesOfKind(kind).length} 个 · 可升级 ${costs.length} 个`,dim:!costs.length||game.gold<minimum||(kind==="turret"&&ref.turretKey==="turret"),act:()=>batchUpgradeSelected(kind)};
  }
  return {upgradeType:kind,upgradeId:'',upgradeOwner:upgradeOwner(kind,ref),k:"U",commandId:`${kind}-up`,icon:"upgrade",name:cost==null?`已满级 Lv${level}`:`升级 Lv${level+1}`,price:cost,hot:"U",tip:`当前 Lv${level}${kind==="turret"&&!doctrineAllows('tower',level)?" · 需要炮台专精":""}`,dim:cost==null||game.gold<cost||(kind==="turret"&&(ref.turretKey==="turret"||!doctrineAllows('tower',level))),act};
}
function commandItemsForSelection(){
  if(!wc3Sel)return [];
  const kinds=new Set(wc3Selection.map((entry)=>entry.kind));
  if([...kinds].every((kind)=>kind==="player"||kind==="unit"))return [
    {k:"M",icon:"move",name:"移动",tip:"右键点击地面移动",hot:"右键"},
    {k:"A",icon:"attack",name:"攻击",tip:"攻击移动",hot:"A",act:()=>{wc3AttackMove=true;toast(" 攻击移动：左键点击目标位置");}},
    {k:"S",icon:"stop",name:"停止",tip:"停止当前指令",hot:"S",act:()=>issueSelectionCommand("stop")},
    {k:"P",icon:"patrol",name:"巡逻",tip:"在两点间往返警戒",hot:"P",act:()=>{wc3AttackMove="patrol";toast(" 巡逻：左键点击另一端");}},
    ...repairUpgradeCommands(),
    ...(wc3Selection.length===1&&wc3Sel.ref.type==='hero'?[{k:'H',hot:'H',icon:'base',name:'英雄枢纽',tip:'前往枢纽学习和升级被动武器',dim:!heroHub(),act:()=>{const h=heroHub();if(h)focusSelectedStructure('heroHub',h);}}]:[]),
    ...(wc3Selection.length===1&&wc3Sel.kind==="unit"&&wc3Sel.ref.type!=='hero'?[{k:"X",icon:"demolish",name:"拆除",tip:"拆除该单位并回收部分金币",hot:"X",act:sellSelectedSingle}]:[]),
  ];
  if(kinds.size!==1||wc3Sel.kind==="enemy")return [];
  const kind=wc3Sel.kind,ref=wc3Sel.ref,multi=wc3Selection.length>1;
  if(kind==="construction")return ref.phase==="returning"?[]:[{k:"X",icon:"close",name:"取消施工",hot:"X",tip:"退回全部建造费用，工人返回基地",act:()=>{cancelConstruction(ref);renderCmdCard();wc3RenderSel();}}];
  if(kind==="base")return baseDoctrineCommands();
  if(kind==="heroHub")return heroCommands();
  if(kind==="research"){
    const cap=researchUnlockedMaxLevel();
    const normal=Object.values(TECH_TREE).filter((tech)=>tech.tier===0||(tech.tier===1&&tech.route===game.doctrine)).map((tech,index)=>{
      const lv=game.tech[tech.id]||0,cost=techCost(tech.id),maxed=lv>=cap,unlocked=techUnlocked(tech.id);
      return {upgradeType:'tech',upgradeId:tech.id,upgradeOwner:upgradeOwner('research',ref),k:String(index+1),icon:tech.icon,name:tech.name,price:maxed?null:cost,hot:String(index+1),tip:`${tech.desc}<br>Lv${lv}/${cap}`,dim:maxed||!unlocked||game.gold<cost,allowQueue:true,act:()=>upgradeTech(tech.id)};
    });
    const academy=game.researchTier<1?[{upgradeType:'academy',upgradeId:'',upgradeOwner:upgradeOwner('research',ref),k:"A",hot:"A",icon:"research",name:"高级研究院",price:600,tip:game.doctrine?"600金币 · 升级8秒 · 原地升级不新增占地":"基地改建完成后开放 · 600金币/8秒",dim:!game.doctrine||game.gold<600,act:()=>upgradeAcademy()}]:[];
    const doctrine=game.doctrine&&game.researchTier>=1?doctrineCommands():[];
    const icons={mining:"mine",science:"research",wall:"wall",turret:"turret"};
    const breakthrough=game.endless&&game.researchTier>=1?Object.values(SurvivalSystem.BREAKTHROUGH_RESEARCH).map((item,index)=>{
      const lv=breakthroughLevel(item.id),cost=breakthroughCost(item.id);
      const target=item.id==="mining"?`金矿上限 ${mineUnlockedCount()}`:item.id==="science"?`科技上限 ${researchUnlockedMaxLevel()}`:item.id==="wall"?`巨岩上限 ${wallUnlockedMaxLevel()}`:`炮台上限 ${turretUnlockedMaxLevel()}`;
      return {upgradeType:'breakthrough',upgradeId:item.id,upgradeOwner:upgradeOwner('research',ref),k:String(index+5),icon:icons[item.id],name:item.name,price:cost,hot:String(index+5),tip:`无限研究 · Lv${lv}<br>${target}`,dim:game.gold<cost,allowQueue:true,act:()=>upgradeBreakthrough(item.id)};
    }):[];
    return [...normal,...academy,...doctrine,...breakthrough,{k:"X",icon:"demolish",name:"拆除",hot:"X",tip:"拆除并回收部分金币",act:sellSelectedSingle}];
  }
  if(kind==="factory")return [...Object.entries(SurvivalSystem.FRIENDLY_UNIT_TYPES).filter(([id])=>["light","medium","heavy"].includes(id)).map(([typeId,spec],index)=>{spec={...spec,cost:Math.ceil(spec.cost*(1-.03*doctrineLevel('supply'))),buildTime:spec.buildTime*(1-.04*doctrineLevel('supply'))};const medical=typeId==='repair'?repairProductionStatus():null;return {k:String(index+1),icon:typeId==="repair"?"repair":"tank",name:medical?`${spec.name} ${medical.count}/${medical.max}`:spec.name,price:spec.cost,hot:String(index+1),autoType:typeId,tip:`人口 ${spec.population} · 生产 ${spec.buildTime}秒 · 右键切换自动生产${medical?`<br>${medical.reason}<br>医疗车同目标不叠加；与灯塔独立补充`:""}`,dim:(medical&&!medical.allowed)||ref.queue.length>=20||game.gold<spec.cost||game.popUsed+spec.population>game.popMax,act:()=>{if(queueFactoryUnit(ref,typeId)){toast(` ${spec.name} 已加入生产队列`);wc3RenderSel();renderCmdCard();}}};}),
    {k:"R",icon:"flag",name:"集结点",hot:"R",tip:"设置新的出厂集结点",act:()=>{wc3AttackMove="rally";toast(" 左键点击设置集结点");}},
    {k:"C",icon:"close",name:"取消生产",hot:"C",tip:"取消队尾单位并返还 75% 金币",dim:!ref.queue.length,act:()=>cancelFactoryQueue(ref)},
    {k:"X",icon:"demolish",name:"拆除",hot:"X",tip:"拆除重工厂",act:sellSelectedSingle}];
  if(["wall","goldmine","beacon","turret","house"].includes(kind)){
    if(kind==="turret"&&multi&&new Set(wc3Selection.map((entry)=>entry.ref.turretKey)).size>1)return [];
    const items=[structureUpgradeItem(kind,ref,multi)];
    if(kind==="turret"&&ref.turretKey==="turret"&&!multi)Object.entries(SurvivalSystem.TURRET_BRANCHES).forEach(([branchId,branch],index)=>{
      const hot=String(index+1),cost=turretBranchCost();
      items.push({upgradeType:'branch',upgradeId:branchId,upgradeOwner:upgradeOwner('turret',ref),k:hot,branchId,icon:branchId==="emp"?"laser":branchId==="cannon"?"blast":branchId==="antitank"?"attack":"turret",name:branch.name||TURRET_TYPES[branchId]?.name||branchId,price:cost,hot,tip:TURRET_TYPES[branchId].desc,dim:game.gold<cost,act:()=>chooseTurretBranch(ref,branchId)});
    });
    if(!multi)items.push({k:"X",icon:"demolish",name:"拆除",hot:"X",tip:"拆除并回收部分金币",act:sellSelectedSingle});
    return items;
  }
  return [];
}
function renderCmdCard(){
  const wrap=$("cmdcard");if(!wrap)return;
  if(!wrap.dataset.pointerActivationBound){
    wrap.addEventListener("pointerdown",activateCmdCardItem);
    wrap.addEventListener("click",activateCmdCardProgrammaticClick);
    wrap.dataset.pointerActivationBound="true";
  }
  const items=decorateUpgradeCommands(commandItemsForSelection().filter((item)=>!item.sep));
  const factoryRef=wc3Sel&&wc3Sel.kind==="factory"?wc3Sel.ref:null;
  const factoryQueue=factoryRef?{progress:+(factoryRef.progress||0).toFixed(3),queue:(factoryRef.queue||[]).map((q)=>q.typeId)}:null;
  const signature=JSON.stringify([items.map((it)=>[it.k,it.name,it.price,it.sel,it.dim,it.progress,it.progressLabel,it.hot==="A"&&!!wc3AttackMove,it.heroSkill&&!!game.autoHeroSkills?.[it.heroSkill],it.upgradeType&&(it.batchUpgrade?selectedEntriesOfKind(it.upgradeType).map(({ref})=>isAutoUpgrade(it.upgradeType,it.upgradeId||'',upgradeOwner(it.upgradeType,ref))).every(Boolean):isAutoUpgrade(it.upgradeType,it.upgradeId||'',it.upgradeOwner))]),factoryQueue]);
  if(signature===_cmdCardSignature&&wrap.childElementCount)return;
  _cmdCardSignature=signature;wrap.innerHTML="";
  items.forEach(it=>{
    if(it.empty){const slot=document.createElement("div");slot.className="cmdSlot";wrap.appendChild(slot);return;}
    const d=document.createElement("div");
    d._cmdCardItem=it;d.setAttribute('role','button');d.tabIndex=it.dim?-1:0;d.setAttribute('aria-label',it.name+(it.price!=null?' · '+it.price+' 金币':'')+' · '+it.hot);d.addEventListener('keydown',event=>{if(event.code==='Enter'||event.code==='Space'){event.preventDefault();event.stopPropagation();d.click();}});
    if(it.branchId)d.dataset.branch=it.branchId;
    if(it.commandId)d.dataset.commandId=it.commandId;
    d.setAttribute("aria-disabled",it.dim?"true":"false");
    const autoOwners=it.batchUpgrade?selectedEntriesOfKind(it.upgradeType).map(({ref})=>upgradeOwner(it.upgradeType,ref)):[];
    const autoEnabled=it.upgradeType&&AUTO_UPGRADE_TYPES.has(it.upgradeType)&&it.upgradeOwner&&(it.batchUpgrade?autoOwners.length>0&&autoOwners.every(owner=>isAutoUpgrade(it.upgradeType,it.upgradeId||'',owner)):isAutoUpgrade(it.upgradeType,it.upgradeId||'',it.upgradeOwner));
    d.className="cmdBtn"+(it.category?" category-"+it.category:"")+(it.sel?" active":"")+(autoEnabled?" auto-upgrade":"")+(it.dim?" disabled":"")
      +(it.hot==="A"&&wc3AttackMove?" active":"");
    const queued=it.autoType&&factoryRef?(factoryRef.queue||[]).filter((q)=>q.typeId===it.autoType).length:0;
    const producing=it.autoType&&factoryRef&&factoryRef.queue[0]&&factoryRef.queue[0].typeId===it.autoType;
    d.innerHTML=`<span class="ck">${it.hot||""}</span><span class="ci">${UIIcons.svg(it.icon)}</span><span class="cn">${it.name||""}</span>`
      +(it.price!=null?`<span class="cp">${it.price}</span>`:"")
      +(queued?`<span class="cq">${queued}</span>`:"")
      +(autoEnabled?`<span class="autoBadge">自动</span>`:"")
      +(it.progress!=null?`<i class="cprog researchProgress" style="width:${Math.round(it.progress*100)}%"></i><span class="researchStatus">${it.progressLabel}</span>`:"")
      +(producing?`<i class="cprog" style="width:${Math.round((factoryRef.progress||0)*100)}%"></i>`:"");
    if(it.autoType){d.oncontextmenu=(event)=>{event.preventDefault();toggleFactoryAuto(wc3Sel.ref,it.autoType);};if(wc3Sel.ref.autoType===it.autoType)d.classList.add("active");}
    if(it.heroSkill){if(it.heroAuto)d.classList.add("auto-upgrade");d.oncontextmenu=(event)=>{event.preventDefault();if(startAutoHeroSkill(it.heroSkill)&&!it.dim)it.act?.();toast(" 已启动无人机自动配送");};}
    if(it.upgradeType&&AUTO_UPGRADE_TYPES.has(it.upgradeType)&&it.upgradeOwner){d.oncontextmenu=(event)=>{event.preventDefault();if(it.batchUpgrade){const selected=selectedEntriesOfKind(it.upgradeType);selected.forEach(({ref})=>startAutoUpgrade(it.upgradeType,it.upgradeId||'',upgradeOwner(it.upgradeType,ref)));if(!it.dim)it.act?.();}else if(startAutoUpgrade(it.upgradeType,it.upgradeId||'',it.upgradeOwner)&&!it.dim){it.act?.();}toast(" 已启动全部目标的自动逐级升级");};}
    d.onmouseenter=()=>{
      const tip=$("wc3tip");if(!tip)return;
      tip.innerHTML=`<div class="t">${UIIcons.svg(it.icon)} ${it.name}</div><div>${it.tip}</div><div class="k">快捷键：${it.hot}</div>`;
      tip.style.display="block";
    };
    d.onmouseleave=()=>{const tip=$("wc3tip");if(tip)tip.style.display="none";};
    wrap.appendChild(d);
  });
  /* 空槽是 .cmdSlot 不是 .cmdBtn；按按钮数量补格会永远进不了 12，B 打开建造卡会卡死页面。 */
  if(items.length){
    for(let n=wrap.children.length;n<12;n++){
      const empty=document.createElement("div");empty.className="cmdSlot";wrap.appendChild(empty);
    }
  }
}
/*  P4-5：B 键建造模式（不暂停，命令卡二态） */
function openWc3Build(){
  if(!wc3Sel||wc3Sel.kind!=="base"){
    if(!baseAlive||!baseGroup)return;
    wc3Select("base",baseSelectionRef());wc3CommandPage="root";wc3RenderSel();
  }
  if(!wc3BuildMode)buildReturnState=state;
  wc3BuildMode=true;   /* 兼容旧 tryPlace 状态机：BUILD 态下左键放置 */
  if(gridHelper)gridHelper.visible=true;
  if(state===STATE.PLAYING||state===STATE.PREP)state=STATE.BUILD;
  renderCmdCard();updateGoldUI();
  toast(" 建造模式：1-9 选择 · 左键放置 · 右键/B 收起");
}
function closeWc3Build(){
  wc3BuildMode=false;
  if(gridHelper)gridHelper.visible=false;
  selectBuild(null);
  if(state===STATE.BUILD){
    const stayPrep=buildReturnState===STATE.PREP&&game.wave<=0&&game.prepTime>0;
    state=stayPrep?STATE.PREP:STATE.PLAYING;
  }
  renderCmdCard();
}
function openTechMenu(){
  if(ACTIVE_MODE.key==='survival'){selectResearchForCommand();return;}
  if(state!==STATE.PLAYING&&state!==STATE.PREP&&state!==STATE.BUILD)return;
  if(ACTIVE_MODE.key==="survival"&&!researchInstitutes.length){toast(" 请先建造研究院");return;}
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
function techCost(branch){return SurvivalSystem.researchCost(branch,game.tech[branch]||0,researchUnlockedMaxLevel());}
function breakthroughCost(id){return SurvivalSystem.breakthroughCost(id,breakthroughLevel(id));}
function upgradeBreakthrough(id){
  if(id==='turret'&&!doctrineAllows('tower',3)){toast("需要炮台专精");return false;}
  const item=SurvivalSystem.BREAKTHROUGH_RESEARCH[id];
  if(!item){toast(" 未知突破研究");return false;}
  const owner=upgradeOwner('research',researchInstitutes[0]),target=nextProjectTargetLevel('breakthrough',id,owner,breakthroughLevel(id),null);
  if(target==null){toast(`${item.name} 已在队列中`);return false;}
  /* P2 §6.2: price by target — breakthroughCost at from-level (target-1). */
  const cost=paidUpgradeCost(SurvivalSystem.breakthroughCost(id,target-1));
  if(game.gold<cost){toast(` ${item.name}需要 ${cost} 金币`);return false;}
  if(deferUpgrade('breakthrough',id,owner,cost,target-1,target))return true;
  game.gold-=cost;game.breakthroughs[id]=breakthroughLevel(id)+1;
  const result=id==="mining"?`金矿上限 ${mineUnlockedCount()}`:id==="science"?`科技上限 ${researchUnlockedMaxLevel()}`:id==="wall"?`巨岩上限 ${wallUnlockedMaxLevel()}`:`炮台上限 ${turretUnlockedMaxLevel()}`;
  sfx.levelup();toast(`${item.name} Lv${game.breakthroughs[id]} · ${result}`);updateGoldUI();wc3RenderSel();renderCmdCard();return true;
}
function techUnlocked(branch){
  const t=TECH_TREE[branch];
  if(t.tier===1&&game.researchTier<1)return false;
  if(t.route&&!doctrineAllows(t.route,game.tech[branch]||0))return false;
  const req=t.requires||{};
  for(const k in req)if((game.tech[k]||0)<req[k])return false;
  return true;
}
function renderTech(){
  const wrap=$("techBranches");if(!wrap)return;
  wrap.innerHTML="";
  Object.values(TECH_TREE).forEach(t=>{
    const cap=researchUnlockedMaxLevel(),lv=game.tech[t.id]||0,maxed=lv>=cap,unlocked=techUnlocked(t.id);
    const cost=techCost(t.id),poor=!maxed&&unlocked&&game.gold<cost;
    const card=document.createElement("div");
    card.className="techCard"+(maxed?" maxed":unlocked?"":" locked")+(poor?" poor":"");
    const pips=Array.from({length:Math.min(cap,20)},(_,i)=>`<span class="pip${i<Math.min(lv,20)?" on":""}"></span>`).join("");
    let reqTxt="";
    if(!unlocked){
      const req=[];for(const k in t.requires)req.push(`${TECH_TREE[k].name} Lv.${t.requires[k]}`);
      reqTxt=`<div class="req"> 需先解锁：${req.join(" · ")}</div>`;
    }
    card.innerHTML=`<div class="ic">${UIIcons.svg(t.icon)}</div>
      <div class="nm">${t.name}</div>
      <div class="ds">${t.desc}</div>
      <div class="pips">${pips}</div>
      <div class="lv">Lv.${lv}/${cap}</div>
      ${maxed?`<div class="maxedTag"> 已满级</div>`:`<div class="cost"> ${cost}</div>`}
      ${reqTxt}`;
    card.onclick=()=>upgradeTech(t.id);
    wrap.appendChild(card);
  });
  updateGoldUI();
}
function upgradeTech(branch){
  const line=TECH_TREE[branch];
  if(line.tier===1&&game.researchTier<1){toast("需要先升级高级研究院");return false;}
  if(line.route&&!doctrineAllows(line.route,game.tech[branch]||0)){toast("高阶科技需要对应主战专精");return false;}
  const t=TECH_TREE[branch],lv=game.tech[branch]||0;
  const cap=researchUnlockedMaxLevel();
  if(lv>=cap){toast(`${t.name} 已达当前上限，请先研究科技突破`);return;}
  if(!techUnlocked(branch)){toast("前置科技未解锁，需先强化前置分支");return;}
  const owner=upgradeOwner('research',researchInstitutes[0]),target=nextProjectTargetLevel('tech',branch,owner,lv,cap);
  if(target==null){toast(`${t.name} 队列已排至上限 Lv${cap}`);return;}
  /* P2 §6.2: price by target — researchCost at from-level (target-1). */
  const cost=paidUpgradeCost(SurvivalSystem.researchCost(branch,target-1,cap));
  if(game.gold<cost){toast("金币不足，升级失败");return;}
  if(deferUpgrade('tech',branch,owner,cost,target-1,target))return true;
  game.gold-=cost;
  game.tech[branch]=lv+1;
  if(sfx&&sfx.levelup)sfx.levelup();
  toast(`${t.name} 升至 Lv.${game.tech[branch]}！`);
  if(branch==="defense"){
    const oldMultiplier=1+(TECH_TREE.defense.effect.structureHpPct||0.1)*researchPowerLevel(lv);
    const newMultiplier=1+(TECH_TREE.defense.effect.structureHpPct||0.1)*researchPowerLevel(game.tech.defense);
    for(const [ci,meta] of wallMeta){
      const ratio=(steelHP.get(ci)||0)/Math.max(1,wallDefinition(meta.lv).hp*oldMultiplier);
      const next=Math.max(1,Math.round(wallMaxHp(meta.lv)*ratio));steelHP.set(ci,next);meta.hp=next;
    }
    const newMax=computeGateMaxHp();
    const ratio=game.gateMaxHp>0?game.gateHp/game.gateMaxHp:1;
    game.gateMaxHp=newMax;
    game.gateHp=Math.round(newMax*ratio);
    updateHpUI();
  }
  if(branch==="economy"){
    game.popMax+=TECH_TREE.economy.effect.population||1;
    updateResUI();
  }
  if(branch==="tank"&&player&&player.alive){
    const power=researchPowerLevel(game.tech.tank);
    const ratio=player.hp/player.maxHp;
    player.maxHp=Math.round(game.stats.armorMax*(1+(TECH_TREE.tank.effect.hpPct||0.08)*power));
    player.hp=Math.max(1,Math.round(player.maxHp*ratio));
    player.speed=11*(1+(TECH_TREE.tank.effect.speedPct||0.025)*power);
    updateHpUI();
  }
  if(branch==="tank")for(const unit of friendlyUnits){
    if(unit.type==='hero')continue;
    const spec=SurvivalSystem.FRIENDLY_UNIT_TYPES[unit.type],ratio=unit.hp/unit.maxHp,power=researchPowerLevel(game.tech.tank);
    unit.maxHp=Math.round(spec.maxHp*(1+(TECH_TREE.tank.effect.hpPct||0.08)*power));unit.hp=Math.max(1,Math.round(unit.maxHp*ratio));
    unit.dmg=spec.damage*(1+(TECH_TREE.tank.effect.damagePct||0.07)*power);unit.speed=spec.speed*(1+(TECH_TREE.tank.effect.speedPct||0.025)*power);
    unit.range=SurvivalSystem.friendlyRangeAtResearchLevel(unit.type,game.tech.tank)*TILE;applyDoctrineStats(unit);
  }
  renderTech();updateGoldUI();wc3RenderSel();renderCmdCard();
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
  if(ACTIVE_MODE.key==='survival'){selectBaseForCommand(false,'root');return;}
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
      ${maxed?`<div class="gcost" style="color:#39d98a"> 满级</div>`:`<div class="gcost"> ${cost}</div>`}
      <button ${maxed?"disabled":""}>${maxed?"已满级":"升级"}</button>`;
    if(!maxed)row.querySelector("button").onclick=()=>upgradeGate(kind);
    wrap.appendChild(row);
  });
  updateGoldUI();
}
function upgradeGate(kind){
  if(ACTIVE_MODE.key==='survival')return false;
  const f=GATE_UP_FIELD[kind];
  const lv=game[f[0]]||0,g=ACTIVE_MODE.gate||{};
  const max=Math.max(lv,g[f[1]]||5);
  if(lv>=max){toast(`${GATE_UP_NAME[kind]} 已满级`);return;}
  const cost=gateUpCost(kind);
  if(game.gold<cost){toast(" 金币不足");return;}
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
  renderGateUp();wc3RenderSel();renderCmdCard();
}
/*  拆除模式：勾选后点击已建建筑回收 50% 金币并移除 */
let destroyMode=false;
function attemptDestroy(x,z){
  const pending=constructionJobs.find(j=>j.phase!=="returning"&&(j.footprintCells||[]).includes(idx(x,z)));
  if(pending)return cancelConstruction(pending);
  const ci=idx(x,z);
  const ownsCell=record=>record&&(record.footprintCells||[]).includes(ci);
  /* 金矿 / 科技塔 / 住房 */
  const mine=goldMines.find(m=>ownsCell(m));
  if(mine){
    const refund=Math.round((goldMineCost(0)*0.5));
    scene.remove(mine.group);releaseDestroyedFootprint(mine);goldMines.splice(goldMines.indexOf(mine),1);
    game.gold+=refund;updateGoldUI();
    spawnParticles(mine.group.position.clone().setY(1.6),0xffd75e,8,6,.8);
    toast(` 拆除金矿，回收 ${refund} 金币`);return true;
  }
  const institute=researchInstitutes.find(t=>ownsCell(t));
  if(institute){
    const refund=Math.round((priceOf(shopList().find(b=>b.id==="research"))||180)*0.5);
    scene.remove(institute.group);releaseDestroyedFootprint(institute);researchInstitutes.splice(researchInstitutes.indexOf(institute),1);
    game.gold+=refund;updateGoldUI();
    toast(` 拆除研究院，回收 ${refund} 金币`);return true;
  }
  const factory=heavyFactories.find(t=>ownsCell(t));
  if(factory){
    const refund=Math.round((priceOf(shopList().find(b=>b.id==="factory"))||240)*0.5);
    for(const queued of factory.queue){
      const spec=SurvivalSystem.FRIENDLY_UNIT_TYPES[queued.typeId];
      if(spec){game.gold+=Math.round(spec.cost*.5);game.popUsed=Math.max(0,game.popUsed-spec.population);}
    }
    scene.remove(factory.group);releaseDestroyedFootprint(factory);heavyFactories.splice(heavyFactories.indexOf(factory),1);
    game.gold+=refund;updateGoldUI();updateResUI();
    toast(` 拆除重工厂，回收 ${refund} 金币`);return true;
  }
  const beacon=visionBeacons.find((item)=>ownsCell(item));
  if(beacon){
    const refund=Math.round((priceOf(shopList().find((build)=>build.id==="beacon"))||45)*.5);
    scene.remove(beacon.group);removeSurvivalPointLight(beacon.light);releaseDestroyedFootprint(beacon);visionBeacons.splice(visionBeacons.indexOf(beacon),1);
    game.gold+=refund;game.popUsed=Math.max(0,game.popUsed-(beacon.popUsed||0));updateGoldUI();updateResUI();redrawVisionFog();toast(` 拆除医疗灯塔，回收 ${refund} 金币`);return true;
  }
  const tur=builtTurrets.find(t=>ownsCell(t)||(t.cx===x&&t.cz===z));
  if(tur){
    const refund=Math.round((priceOf(shopList().find(b=>b.kind==="turret"&&b.turret===tur.turretKey))||60)*0.5);
    const popBack=tur.popUsed||0;
    scene.remove(tur.group);releaseDestroyedFootprint(tur);builtTurrets.splice(builtTurrets.indexOf(tur),1);
    game.gold+=refund;game.popUsed=Math.max(0,game.popUsed-popBack);
    updateGoldUI();updateResUI();
    spawnParticles(tur.group.position.clone().setY(1.6),0xffd75e,8,6,.8);
    toast(` 拆除炮塔，回收 ${refund} 金币`);return true;
  }
  /* 住房：人口上限回收（-6），不退款（金币已转化为人口） */
  const house=builtHouses.find(h=>ownsCell(h));
  if(house){
    scene.remove(house.group);releaseDestroyedFootprint(house);builtHouses.splice(builtHouses.indexOf(house),1);
    const popBack=Number(house.popProvided)||((ACTIVE_MODE.economy&&ACTIVE_MODE.economy.housePop)||6);
    game.popMax=Math.max(0,game.popMax-popBack);game.popUsed=Math.min(game.popUsed,game.popMax);
    updateResUI();
    spawnParticles(house.group.position.clone().setY(2),0xffd75e,10,7,.9);
    toast(` 拆除住房，人口上限 -${popBack}`);return true;
  }
  /* 墙体：T_STEEL + steelHP */
  if(grid[z][x]===T_STEEL&&steelHP.get(ci)>0){
    const lv=wallLvAt(x,z)||1;
    /* 拆除 refund = 累计建造/升级成本 × 0.5（与设计稿一致：鼓励谨慎升级） */
    const cumCost=WALL_LEVELS.slice(0,lv).reduce((s,w)=>s+(w.price||0),0);
    const refund=Math.round(cumCost*0.5);
    const m=tileMeshes[ci];
    if(m){mapGroup.remove(m);tileMeshes[ci]=null;}
    /* 坡道格墙拆除：逻辑恢复通行，连续坡体无需重建。 */
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
    toast(` 拆除 Lv${lv} 墙，回收 ${refund} 金币`);return true;
  }
  return false;
}
/*  生存模式：首波来临前的 30 秒发育期（B 键可随时开商店，倒计时归零自动开波） */
function startPrep(){
  state=STATE.PREP;
  game.endless=false;
  game.prepTime=ACTIVE_MODE.prepTime||30;
  const el=$("prepBar");
  if(el){el.style.display="block";el.textContent=` 准备阶段 ${game.prepTime}s · B 键打开商店`;}
  /*  启动三步新手指引（仅生存模式） */
  questActive=true;questIdx=0;questShow();
}
/* 战役最终波肃清后：弹出【胜利结算 / 无尽模式】选择。 */
function showSettle(){
  state=STATE.SETTLE;
  $("settle").querySelector("h2").textContent=` 第 ${game.wave} 波 荣耀肃清！`;
  $("settle").classList.remove("hidden");
}
function endGame(win=false,baseDown=false){
  state=STATE.OVER;
  const title=$("gameover").querySelector("h1");
  if(title)title.textContent=win?" 胜 利":"GAME OVER";
  $("finalStats").innerHTML=
    `${baseDown?(win?"":"基地鹰旗陷落……"):""}${win?" 你守住了核心，第 "+game.wave+" 波荣耀肃清！":""}<br>最终得分 <b>${game.score}</b><br>${win?"战绩":"坚持"}到第 <b>${game.wave}</b> 波`;
  $("gameover").classList.remove("hidden");
}
let pauseReturnState=STATE.PLAYING;
function setPause(p){
  if(p){if(state!==STATE.PAUSED)pauseReturnState=state;if(ACTIVE_MODE.key==="survival")saveSurvivalSnapshot();state=STATE.PAUSED;$("pause").classList.remove("hidden");}
  else{state=pauseReturnState;$("pause").classList.add("hidden");lastT=performance.now();}
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
  /* v5.0.0：WAR3 指令分支会在解析 moveTarget/attackTarget 时立即读取玩家位置，
     必须先绑定 group；旧声明位于分支之后，会触发 const 暂时性死区。 */
  const g=player.group;
  let mx=0,mz=0;
  /*  P3-9 WC3 指令层（仅生存）：右键移动/攻击、A 攻击移动、S 停止。
     生存模式下 WASD 已被镜头占用（RTS 惯例），玩家移动完全由指令驱动；
     经典/塔防保留 WASD 直接操控。 */
  const wc3=ACTIVE_MODE.key==="survival";
  let wc3Moving=false;
  if(wc3&&player.attackMove&&(!player.attackTarget||!player.attackTarget.alive)){
    player.attackTarget=null;
    let nearest=null,nearestD2=15*15;
    for(const enemy of enemies){
      if(!enemy.alive||enemy.dying||!isPositionVisible(enemy.group.position))continue;
      const dx=enemy.group.position.x-g.position.x,dz=enemy.group.position.z-g.position.z;
      const distance2=dx*dx+dz*dz;
      if(distance2<nearestD2){nearestD2=distance2;nearest=enemy;}
    }
    if(nearest)player.attackTarget=nearest;
  }
  if(wc3&&player.moveTarget){
    const dx=player.moveTarget.x-g.position.x,dz=player.moveTarget.z-g.position.z;
    const d=Math.hypot(dx,dz);
    if(d<.8){
      if(player.command==="patrol"&&player.patrolPoints&&player.patrolPoints.length===2){
        player.patrolIndex=1-(player.patrolIndex||0);player.moveTarget={...player.patrolPoints[player.patrolIndex]};
      }else{player.moveTarget=null;player.attackMove=false;}
    }
    else{mx=dx/d;mz=dz/d;wc3Moving=true;}
  }
  if(wc3&&player.attackTarget){
    if(!player.attackTarget.alive||!isPositionVisible(player.attackTarget.group.position)){player.attackTarget=null;}
    else{
      /* 追击目标，进入射程(14)停下自动开火（炮塔自动索敌） */
      const dx=player.attackTarget.group.position.x-g.position.x,
            dz=player.attackTarget.group.position.z-g.position.z;
      const d=Math.hypot(dx,dz);
      if(d>13){mx=dx/d;mz=dz/d;wc3Moving=true;}
      else{
        if(!player.attackMove)player.moveTarget=null;
        mx=0;mz=0;wc3Moving=false;
      }
    }
  }
  if(!wc3){
    if(keys.KeyW||keys.ArrowUp)mz-=1;
    if(keys.KeyS||keys.ArrowDown)mz+=1;
    if(keys.KeyA||keys.ArrowLeft)mx-=1;
    if(keys.KeyD||keys.ArrowRight)mx+=1;
  }
  const curH=heightAt(g.position.x,g.position.z);
  if(mx||mz){
    const len=Math.hypot(mx,mz);mx/=len;mz/=len;
    /*  猎杀冲锋：击杀后短时移速加成 */
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
  if(intersectTerrainRay(raycaster.ray,hitPt)){
    const dx=hitPt.x-g.position.x,dz=hitPt.z-g.position.z;
    player.aim=Math.atan2(dx,dz)+Math.PI;
  }
  /*  修复：炮塔角度是相对车体的，必须减去车体朝向 */
  const tur=g.userData.turret;
  tur.rotation.y+=shortAngle(player.aim-g.rotation.y-tur.rotation.y)*Math.min(1,dt*18);

  player.cd-=dt;
  const rapid=now<game.buffs.rapidUntil;
  const interval=.42/(game.stats.fireRate*(rapid?2:1));
  /*  P3-9：生存=RTS，自动开火（炮塔自索敌+攻击目标追击自动交战）；
     经典/塔防保留左键/空格手动开火 */
  const autoFire=wc3;
  const wantFire=autoFire
    ?(player.attackTarget&&player.attackTarget.alive)
    :(mouse.down||keys.Space);
  if(wantFire&&player.cd<=0){
    player.cd=interval;
    if(autoFire&&player.attackTarget&&player.attackTarget.alive){
      const t2=enemyAimPoint(player.attackTarget);
      player.aim=Math.atan2(t2.x-g.position.x,t2.z-g.position.z)+Math.PI;
      const shotOrigin=new THREE.Vector3(g.position.x,g.position.y+1.7,g.position.z);
      shoot("player",t2.sub(shotOrigin).normalize());
    }else shoot("player",new THREE.Vector3(Math.sin(player.aim+Math.PI),0,Math.cos(player.aim+Math.PI)));
  }
  g.visible=now<player.invulnUntil?(Math.sin(now*.02)>-.3):true;
}

let _turAim=0;
function updateAutoTurret(dt){
  if(!baseAlive||!baseGroup||game.stats.autoTurretLv<=0||!autoTurretObj)return;
  const bp=baseGroup.position;
  const olv=game.stats.overloadLv||0;   //  超载协议
  // 找最近敌人（超载后射程 +40%/级）
  let best=null,bd=36*(1+.4*olv);
  enemies.forEach(e=>{
    if(!e.alive||performance.now()<e.spawnFlash||!isPositionVisible(e.group.position))return;
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
      shoot({group:baseGroup,dmg:1+game.stats.autoTurretLv*.5+olv},dir,true);
    }
  }
}

/*  基地装置：EMP 脉冲塔 + 迫击炮阵地 */
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
        if(!e.alive||performance.now()<e.spawnFlash||!isPositionVisible(e.group.position))return;
        const dx=e.group.position.x-bp.x,dz=e.group.position.z-bp.z;
        if(dx*dx+dz*dz<R*R){
          e.stunUntil=now+1500;damageEnemy(e,1,{source:"turret"});hitAny=true;
        }
      });
      if(hitAny){
        spawnParticles(bp.clone().setY(2.5),0x7ec8ff,22,13,1.2);
        sfx.levelup();camShake=Math.max(camShake,.3);
        toast(" EMP 脉冲释放");
      }
    }
  }
  /* 迫击炮阵地：定期炮击随机敌群（范围伤害） */
  if(game.stats.mortarLv>0){
    game._mortarTimer-=dt;
    if(game._mortarTimer<=0){
      game._mortarTimer=Math.max(5,9-game.stats.mortarLv*2);
      const alive=enemies.filter(e=>e.alive&&performance.now()>=e.spawnFlash&&isPositionVisible(e.group.position));
      if(alive.length){
        const tgt=alive[Math.floor(Math.random()*alive.length)];
        const tp=tgt.group.position.clone();
        explode(tp.setY(1.4),false);
        const R=4.5+game.stats.mortarLv*1.2,dmg=2+game.stats.mortarLv;
        alive.forEach(e=>{
          const dx=e.group.position.x-tp.x,dz=e.group.position.z-tp.z;
          if(dx*dx+dz*dz<R*R)damageEnemy(e,dmg,{source:"turret"});
        });
        destroyBricksAround(tp.x,tp.z,1.8);
      }
    }
  }
}

function applyHordeSeparation(dt){
  if(ACTIVE_MODE.key!=="survival"||!Number.isFinite(dt)||dt<=0)return;
  const now=performance.now();
  // Waiting, attacking and recovering units all retain their bodies.
  const active=enemies.filter(e=>e.alive&&!e.dying&&now>=e.spawnFlash);
  for(const e of active){e.crowdSpeedScale=1;e.crowdContact=false;}
  if(active.length<2)return;
  const CELL=2,buckets=new Map();
  const maxRadius=active.reduce((radius,e)=>Math.max(radius,e.radius),0);
  const key=(x,z)=>Math.floor(x/CELL)+Math.floor(z/CELL)*512;
  for(const e of active)e.hordeMass=e.boss||e.giant?3:1;
  // Two bounded projections allow a rear rank to yield without a per-frame teleport.
  for(let iteration=0;iteration<3;iteration++){
    buckets.clear();
    for(const e of active){
      const k=key(e.group.position.x,e.group.position.z);
      if(!buckets.has(k))buckets.set(k,[]);
      buckets.get(k).push(e);
      e.hordePushX=0;e.hordePushZ=0;
      e.hordeX=e.group.position.x;e.hordeZ=e.group.position.z;
    }
    for(const e of active){
      const p=e.group.position,bx=Math.floor(p.x/CELL),bz=Math.floor(p.z/CELL);
      const reach=Math.max(1,Math.ceil((e.radius+maxRadius+.18)/CELL));
      for(let oz=-reach;oz<=reach;oz++)for(let ox=-reach;ox<=reach;ox++){
        const neighbors=buckets.get(bx+ox+(bz+oz)*512);
        if(!neighbors)continue;
        for(const other of neighbors){
          if(other.hordeId<=e.hordeId)continue;
          let dx=e.hordeX-other.hordeX,dz=e.hordeZ-other.hordeZ;
          if(dx*dx+dz*dz>(e.radius+other.radius)**2)continue;
          const contact=zombieBodyContact(e,other);
          if(!contact)continue;
          dx=contact.x;dz=contact.z;
          const force=contact.depth/(e.hordeMass+other.hordeMass);
          e.hordePushX+=dx*force*other.hordeMass;e.hordePushZ+=dz*force*other.hordeMass;
          other.hordePushX-=dx*force*e.hordeMass;other.hordePushZ-=dz*force*e.hordeMass;
          e.crowdContact=other.crowdContact=true;
        }
      }
    }
    for(const e of active){
      const length=Math.hypot(e.hordePushX,e.hordePushZ);
      if(length<1e-6)continue;
      const step=Math.min(4*Math.min(dt,.025),length*.9),scale=step/length;
      const p=e.group.position,curH=heightAt(p.x,p.z),probe=enemyNavigationRadius(e);
      const dx=e.hordePushX*scale,dz=e.hordePushZ*scale;
      // Terrain remains solid. Allow backward movement as well as movement along a wall.
      if(!blockedForTank(p.x+dx,p.z,probe,curH))p.x+=dx;
      else if(!blockedForTank(p.x+dx*.5,p.z,probe,curH))p.x+=dx*.5;
      if(!blockedForTank(p.x,p.z+dz,probe,curH))p.z+=dz;
      else if(!blockedForTank(p.x,p.z+dz*.5,probe,curH))p.z+=dz*.5;
      p.y=heightAt(p.x,p.z);
    }
  }
}

/* 坡口的支撑层只改变垂直姿态；水平寻路、墙体和攻击槽位继续使用实体规则。
   支撑按固定层序求解，禁止循环互相抬高；同伴离开/死亡后平滑落回坡面。 */
function updateHordeClimbing(dt){
  if(ACTIVE_MODE.key!=="survival")return;
  const ramp=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row),buckets=new Map(),cellSize=2;
  const live=enemies.filter(e=>e.alive&&!e.dying);
  for(const e of live){
    const p=e.group.position,key=`${Math.floor(p.x/cellSize)},${Math.floor(p.z/cellSize)}`;
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(e);
  }
  for(const e of live){
    const p=e.group.position,ground=heightAt(p.x,p.z);
    let support=0,contacts=0;
    const nearRamp=Math.abs(p.z-ramp.z)<TILE*.8&&p.x>ramp.x-TILE&&p.x<ramp.x+TILE*2;
    if(nearRamp&&!e.boss&&e.hordeId%3===0){
      const cx=Math.floor(p.x/cellSize),cz=Math.floor(p.z/cellSize);
      for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++){
        for(const other of buckets.get(`${x},${z}`)||[]){
          if(other===e||other.hordeId%3===0)continue;
          const q=other.group.position,d=Math.hypot(p.x-q.x,p.z-q.z),reach=(e.radius+other.radius)*1.5;
          if(d>reach)continue;
          const groundOther=heightAt(q.x,q.z);
          if(Math.abs(groundOther-ground)>.8)continue;
          contacts++;
          support=Math.max(support,Math.min(.85,Math.max(.22,other._lodHeight*.6)));
        }
      }
    }
    const target=contacts>=2?support:0;
    e.hordeLift=(e.hordeLift||0)+(target-(e.hordeLift||0))*Math.min(1,dt*(target?4:7));
    if(e.hordeLift<.001)e.hordeLift=0;
    p.y=ground+e.hordeLift;
    const climb=nearRamp?Math.max(0,Math.min(.5,(heightAt(p.x-.35,p.z)-ground)*.7)):0;
    e.group.rotation.x+=(-climb-(e.hordeLift>0?.16:0)-e.group.rotation.x)*Math.min(1,dt*7);
  }
}

function terrainFireLineClear(from,to){
  const distance=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.max(1,Math.ceil(distance/.25));
  for(let i=1;i<steps;i++){
    const t=i/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
    if(from.y+(to.y-from.y)*t<heightAt(x,z)+.025)return false;
  }
  return true;
}

function enemyNavigationRadius(enemy){
  /* 尸群分离仍使用完整实体半径，保留满屏拥挤和大体型压迫感；
     地形导航半径限制在约三分之一格，避免重装单位被同伴挤到单格道路边缘后永久楔死。 */
  return Math.min(enemy.radius,TILE*.34);
}

/* 尸群遇到前排实体时切换到相邻车道，后排保持自身速度继续推进。 */
function hordeLaneBlocked(enemy,dir){
  if(ACTIVE_MODE.key!=="survival"||!dir)return false;
  const p=enemy.group.position;
  for(const other of enemies){
    if(!other||other===enemy||!other.alive||other.dying)continue;
    const dx=other.group.position.x-p.x,dz=other.group.position.z-p.z;
    const forward=dx*dir.x+dz*dir.z;
    if(forward<=0||forward>enemy.radius+other.radius+.16)continue;
    const lateral=Math.abs(dx*dir.z-dz*dir.x);
    if(lateral<enemy.radius+other.radius*.54)return true;
  }
  return false;
}
function hordeLaneDetour(enemy,dir,spd,curH,radius){
  if(!(spd>0)||!hordeLaneBlocked(enemy,dir))return false;
  const length=Math.hypot(dir.x,dir.z);if(length<1e-6)return false;
  const fx=dir.x/length,fz=dir.z/length,p=enemy.group.position;
  const preferred=enemy.hordeLaneSide||(enemy.hordeId%2?1:-1);
  for(const side of [preferred,-preferred]){
    // 斜向前进只消耗本帧移动距离，减速和帧率不会被横移保底绕过。
    const dx=(fx*.4-fz*side*.9165)*spd,dz=(fz*.4+fx*side*.9165)*spd;
    const nx=p.x+dx,nz=p.z+dz;
    if(blockedForTank(nx,nz,radius,curH))continue;
    let occupied=false;
    for(const other of enemies){
      if(other===enemy||!other.alive||other.dying)continue;
      const q=other.group.position,min=(enemy.radius+other.radius)*.9;
      const before=Math.hypot(p.x-q.x,p.z-q.z),after=Math.hypot(nx-q.x,nz-q.z);
      if(after<min&&after<before-1e-5){occupied=true;break;}
    }
    if(occupied)continue;
    p.x=nx;p.z=nz;enemy.hordeLaneSide=side;enemy.thinkTimer=.08;return true;
  }
  return false;
}

/* 丧尸是矮模型，射击目标必须取模型包围盒内部的身体点，不能继续用根节点的地面坐标。 */
function enemyModelBounds(enemy){
  const visual=enemy.animationRoot||enemy.visualRoot||enemy.group,p=enemy.group.position;
  if(!enemy._modelBounds)enemy._modelBounds=new THREE.Box3();
  if(enemy._modelBoundsFrame!==_animFrame||enemy._modelBoundsX!==p.x||enemy._modelBoundsZ!==p.z||enemy._modelBoundsY!==p.y){
    visual.updateWorldMatrix(true,true);enemy._modelBounds.setFromObject(visual);
    enemy._modelBoundsFrame=_animFrame;enemy._modelBoundsX=p.x;enemy._modelBoundsZ=p.z;enemy._modelBoundsY=p.y;
  }
  return enemy._modelBounds;
}
/* 用受躯干骨骼驱动的实际网格顶点建立水平轮廓，不把伸展手臂计为一圈空气。
   轮廓按模型朝向旋转，圆形半径仅用于快速排除不相邻单位。 */
function zombieBodyHull(visual,group){
  group.updateMatrixWorld(true);
  const origin=group.position,angle=-group.rotation.y,c=Math.cos(angle),s=Math.sin(angle),points=[];
  const v=new THREE.Vector3();
  visual.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!mesh.geometry?.attributes.skinIndex)return;
    const a=mesh.geometry.attributes,torso=new Set();
    mesh.skeleton.bones.forEach((bone,i)=>{if(/hips|pelvis|spine|chest/i.test(bone.name))torso.add(i);});
    mesh.skeleton.update();
    for(let i=0;i<a.position.count;i++){
      let weight=0;
      for(const getter of ['getX','getY','getZ','getW'])if(torso.has(a.skinIndex[getter](i)))weight+=a.skinWeight[getter](i);
      if(weight<.5)continue;
      v.fromBufferAttribute(a.position,i);
      if(mesh.applyBoneTransform)mesh.applyBoneTransform(i,v);else mesh.boneTransform(i,v);
      v.applyMatrix4(mesh.matrixWorld).sub(origin);
      points.push({x:v.x*c+v.z*s,z:-v.x*s+v.z*c});
    }
  });
  points.sort((a,b)=>a.x-b.x||a.z-b.z);
  const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  const lower=[],upper=[];
  for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function zombieWorldHull(enemy){
  const p=enemy.group.position,angle=enemy.group.rotation.y,c=Math.cos(angle),s=Math.sin(angle);
  const cached=enemy._collisionWorld;
  if(cached&&cached.x===p.x&&cached.z===p.z&&cached.angle===angle&&cached.radius===enemy.radius)return cached.points;
  const scale=enemy.radius/(enemy.collisionHullRadius||enemy.radius);
  const points=enemy.collisionHull.map(v=>({x:p.x+(v.x*c+v.z*s)*scale,z:p.z+(-v.x*s+v.z*c)*scale}));
  enemy._collisionWorld={x:p.x,z:p.z,angle,radius:enemy.radius,points};return points;
}
function zombieBodyContact(a,b){
  const dx=a.group.position.x-b.group.position.x,dz=a.group.position.z-b.group.position.z;
  if(dx*dx+dz*dz>=(a.radius+b.radius)**2)return null;
  if(a.collisionHull?.length>=3&&b.collisionHull?.length>=3){
    const first=zombieWorldHull(a),second=zombieWorldHull(b);
    let depth=Infinity,nx=0,nz=0;
    for(const hull of [first,second])for(let i=0;i<hull.length;i++){
      const p=hull[i],q=hull[(i+1)%hull.length],length=Math.hypot(q.x-p.x,q.z-p.z);
      if(length<1e-8)continue;
      let x=-(q.z-p.z)/length,z=(q.x-p.x)/length;
      let lowA=Infinity,highA=-Infinity,lowB=Infinity,highB=-Infinity;
      for(const v of first){const n=v.x*x+v.z*z;lowA=Math.min(lowA,n);highA=Math.max(highA,n);}
      for(const v of second){const n=v.x*x+v.z*z;lowB=Math.min(lowB,n);highB=Math.max(highB,n);}
      const overlap=Math.min(highA-lowB,highB-lowA);
      if(overlap<=0)return null;
      if(overlap<depth){if(x*dx+z*dz<0){x=-x;z=-z;}depth=overlap;nx=x;nz=z;}
    }
    return Number.isFinite(depth)?{depth,x:nx,z:nz}:null;
  }
  const distance=Math.hypot(dx,dz),angle=((a.hordeId*37+b.hordeId*101)%360)*Math.PI/180;
  return {depth:a.radius+b.radius-distance,x:distance>1e-6?dx/distance:Math.cos(angle),z:distance>1e-6?dz/distance:Math.sin(angle)};
}
function modelFootprintRadius(visual,fallback=.35){
  if(!visual)return fallback;
  const bounds=new THREE.Box3();visual.updateWorldMatrix(true,true);bounds.setFromObject(visual);
  if(bounds.isEmpty())return fallback;
  const width=Math.max(0,bounds.max.x-bounds.min.x),depth=Math.max(0,bounds.max.z-bounds.min.z);
  return Math.max(.12,Math.min(1.8,Math.max(width,depth)*.5+.025));
}
function enemyAimPoint(enemy,target=new THREE.Vector3()){
  if(!enemy||!enemy.group)return target.set(0,0,0);
  const bounds=enemyModelBounds(enemy);
  if(!bounds.isEmpty()&&Number.isFinite(bounds.min.y)&&Number.isFinite(bounds.max.y)){
    target.set((bounds.min.x+bounds.max.x)*.5,
      bounds.min.y+(bounds.max.y-bounds.min.y)*.46,
      (bounds.min.z+bounds.max.z)*.5);
    return target;
  }
  return target.copy(enemy.group.position).setY(enemy.group.position.y+Math.max(.25,(enemy.radius||.4)*1.4));
}

let _gateAttackerFrame=-1,_gateAttackerSet=null;
let _wallAttackerFrame=-1,_wallAttackerSets=new Map();
function enemyGateAttackSlot(enemy){
  if(!enemy||!baseGroup)return false;
  if(_gateAttackerFrame!==_animFrame){
    _gateAttackerFrame=_animFrame;
    _gateAttackerSet=new Set(enemies.filter((other)=>other&&other.alive&&!other.dying&&other.atGate&&
      baseContactDistance(other)<=.55+(other.radius||0))
      .sort((left,right)=>baseContactDistance(left)-baseContactDistance(right))
      .slice(0,Math.ceil(3/SurvivalSystem.ZOMBIE_COMBAT_SCALE)));
  }
  return _gateAttackerSet.has(enemy);
}

function enemyWallAttackSlot(enemy,targetWall){
  if(!enemy||!targetWall)return false;
  const cellKey=idx(targetWall.x,targetWall.z);
  if(_wallAttackerFrame!==_animFrame){_wallAttackerFrame=_animFrame;_wallAttackerSets=new Map();}
  let attackers=_wallAttackerSets.get(cellKey);
  if(!attackers){
    const structure=ownedStructureAtCell(cellKey);
    const capacity=SurvivalSystem.structureAttackCapacity(
      structure?.record?.footprintCells?.length||1,SurvivalSystem.ZOMBIE_COMBAT_SCALE);
    const candidates=enemies.filter((other)=>other&&other.alive&&!other.dying&&other.objectiveKind==="wall"&&
      other.objectiveCell&&idx(other.objectiveCell.x,other.objectiveCell.z)===cellKey&&
      Math.hypot(other.group.position.x-targetWall.center.x,other.group.position.z-targetWall.center.z)<=other.radius+TILE*.72)
      .sort((left,right)=>Math.hypot(left.group.position.x-targetWall.center.x,left.group.position.z-targetWall.center.z)-
        Math.hypot(right.group.position.x-targetWall.center.x,right.group.position.z-targetWall.center.z));
    attackers=new Set(candidates.slice(0,capacity));
    _wallAttackerSets.set(cellKey,attackers);
  }
  return attackers.has(enemy);
}

function enemyMeleeDamage(enemy){
  const base=enemy.boss?(enemy.bossMechanic==="siege"||enemy.bossMechanic==="doom"?5:3)
    :(enemy.siege?4:(enemy.type==="heavy"||enemy.type==="elite"?2:1));
  return ACTIVE_MODE.key==="survival"?base*SurvivalSystem.ZOMBIE_COMBAT_SCALE*SurvivalSystem.meleeWaveMultiplier(enemy.sourceWave||game.wave)*survivalPressureMultiplier()*(Number(game.difficultyMultiplier)||1):base;
}
function enemyWallDamage(enemy){
  // 第十波仍以800 DPS为锚点；前期给墙体一个逐波展开的承伤缓冲，避免第五波前发育尚未完成就被打穿。
  const wave=Math.max(1,Number(enemy?.sourceWave)||game.wave||1),grace=.65+.35*(Math.min(10,wave)-1)/9;
  return enemyMeleeDamage(enemy)*4*grace*(enemy.boss?1.8:1);
}
function enemyWallTouching(enemy,wall){
  const model=tileMeshes[idx(wall.x,wall.z)],parts=model?.userData.wallCollisionParts;
  if(!parts)return Math.hypot(wall.center.x-enemy.group.position.x,wall.center.z-enemy.group.position.z)<=enemy.radius+TILE*.72;
  const x=enemy.group.position.x-model.position.x,z=enemy.group.position.z-model.position.z;
  return parts.some(part=>Math.hypot(Math.max(part.minX-x,0,x-part.maxX),Math.max(part.minZ-z,0,z-part.maxZ))<=enemy.radius+.045);
}
function applyEnemyLifesteal(enemy,damage){
  if(enemy.lifesteal>0)enemy.hp=Math.min(enemy.maxHp,enemy.hp+damage*enemy.lifesteal);
}
function updateBossMechanic(enemy,dt,now){
  if(!enemy.boss||!enemy.bossMechanic)return;
  enemy.specialCd-=dt;if(enemy.specialCd>0)return;
  const aliveNow=enemies.filter((item)=>item.alive).length;
  if(enemy.bossMechanic==="summon"&&aliveNow<64){
    spawnEnemy("normal",false);spawnEnemy("normal",false);toast(" 尸王召唤了援军");enemy.specialCd=12;
  }else if(enemy.bossMechanic==="dash"){
    enemy.hasteUntil=now+2600;enemy.specialCd=8;
  }else if(enemy.bossMechanic==="phase"){
    enemy.phaseUntil=now+2200;enemy.specialCd=9;
  }else if(enemy.bossMechanic==="doom"){
    if(baseGroup&&enemy.group.position.distanceTo(baseGroup.position)<18)damageGate(12*survivalPressureMultiplier(),enemy.group.position);
    if(aliveNow<80)spawnEnemy("elite",false);
    enemy.specialCd=10;
  }else enemy.specialCd=10;
}

function survivalCombatRunning(){
  return state===STATE.PLAYING||(ACTIVE_MODE.key==="survival"&&game.wave>0&&
    (state===STATE.BUILD||state===STATE.TECH||state===STATE.GATE||state===STATE.UPGRADE));
}
const _aimFrom=new THREE.Vector3(),_aimTo=new THREE.Vector3(),_aimQ=new THREE.Quaternion(),_aimWorldQ=new THREE.Quaternion(),_aimParentQ=new THREE.Quaternion(),_aimPosA=new THREE.Vector3(),_aimPosB=new THREE.Vector3(),_aimForward=new THREE.Vector3(),_aimRight=new THREE.Vector3(),_aimTarget=new THREE.Vector3(),_aimUp=new THREE.Vector3(0,1,0);
function _aimBoneToward(bone, child, worldDir){
  if(!bone||!worldDir)return;
  bone.updateWorldMatrix(true,false);
  if(child){
    _aimFrom.subVectors(child.getWorldPosition(_aimPosB),bone.getWorldPosition(_aimPosA));
  }else{
    _aimFrom.set(1,0,0).transformDirection(bone.matrixWorld);
  }
  if(_aimFrom.lengthSq()<1e-8)return;
  _aimFrom.normalize();
  _aimTo.copy(worldDir).normalize();
  _aimQ.setFromUnitVectors(_aimFrom,_aimTo);
  bone.getWorldQuaternion(_aimWorldQ).premultiply(_aimQ);
  if(bone.parent){
    bone.parent.getWorldQuaternion(_aimParentQ).invert();
    bone.quaternion.copy(_aimParentQ).multiply(_aimWorldQ);
  }else bone.quaternion.copy(_aimWorldQ);
  bone.updateMatrix();
  bone.updateWorldMatrix(true,false);
}
function applyZombieReachPose(e){
  const bones=e.poseBones;if(!bones)return;
  const base=e.baseBoneRotations||{};
  const reset=(bone,key)=>{if(bone&&base[key])bone.rotation.copy(base[key]);};
  reset(bones.LeftArm,"LeftArm");reset(bones.RightArm,"RightArm");
  reset(bones.LeftForeArm,"LeftForeArm");reset(bones.RightForeArm,"RightForeArm");
  reset(bones.Chest,"Chest");
  /* 在原生腿部动画上叠加交替摆臂、攀爬抬手和短促攻击；所有偏移从
     基准姿态计算，避免逐帧累积。远景烘焙也复用此函数。 */
  const attackProgress=Math.max(0,Math.min(1,Number(e.attackPose)||0));
  const punch=attackProgress>0?Math.sin((1-attackProgress)*Math.PI):0;
  e.group.getWorldQuaternion(_aimParentQ);
  _aimForward.set(0,0,1).applyQuaternion(_aimParentQ);_aimForward.y=0;
  if(_aimForward.lengthSq()<1e-6)_aimForward.set(0,0,1);
  _aimForward.normalize();
  _aimRight.crossVectors(_aimUp,_aimForward).normalize();
  const phase=(e.poseTime||0)*(e.type==='fast'?10:7)+(e.hordeId||0)*2.399;
  const moving=e.currentAnim===_ANIM_WALK;
  const climb=Math.min(1,(e.hordeLift||0)/.6);
  const stride=moving?Math.sin(phase)*.18:Math.sin(phase*.35)*.025;
  const lift=-.4-punch*.08+climb*.65,spread=.05;
  _aimTarget.copy(_aimForward).addScaledVector(_aimRight,spread);_aimTarget.y+=lift+stride;_aimTarget.normalize();
  _aimBoneToward(bones.LeftArm,bones.LeftForeArm||bones.LeftHand,_aimTarget);
  _aimTarget.copy(_aimForward).addScaledVector(_aimRight,-spread);_aimTarget.y+=lift-stride;_aimTarget.normalize();
  _aimBoneToward(bones.RightArm,bones.RightForeArm||bones.RightHand,_aimTarget);
  _aimTarget.copy(_aimForward).multiplyScalar(1+punch*.18);_aimTarget.y+=-.2-punch*.38;_aimTarget.addScaledVector(_aimRight,.5);_aimTarget.normalize();
  _aimBoneToward(bones.LeftForeArm,bones.LeftHand,_aimTarget);
  _aimTarget.copy(_aimForward).multiplyScalar(1+punch*.18);_aimTarget.y+=-.2-punch*.38;_aimTarget.addScaledVector(_aimRight,-.5);_aimTarget.normalize();
  _aimBoneToward(bones.RightForeArm,bones.RightHand,_aimTarget);
  /* 方向目标对短骨骼的角度变化不够稳定，再叠加一段局部前臂推力，
     确保攻击帧肉眼可见且只影响前臂，不会把整个人物扭倒。 */
  if(bones.LeftForeArm&&base.LeftForeArm)bones.LeftForeArm.rotation.x=base.LeftForeArm.x+punch*.42;
  if(bones.RightForeArm&&base.RightForeArm)bones.RightForeArm.rotation.x=base.RightForeArm.x+punch*.42;
  if(e.visualRoot&&!e.dying){
    e.visualRoot.rotation.x=(moving?.06:0)+punch*.12-(e.hitReaction||0)*.22;
    e.visualRoot.rotation.z=(moving?Math.sin(phase)*.035:0)+(e.hitReaction||0)*.08*((e.hordeId||0)%2?1:-1);
  }
}
function updateEnemies(dt){
  const now=performance.now();
  const cam=camera.position;
  const crowd=enemies.length,animationStride=crowd>300?16:4,poseStride=crowd>300?8:crowd>120?2:1;
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    e.poseTime=(e.poseTime||0)+dt;
    e.hitReaction=Math.max(0,(e.hitReaction||0)-dt*3.5);
    const previousX=e.group.position.x,previousZ=e.group.position.z;
    const nearDx=previousX-cam.x,nearDz=previousZ-cam.z;
    const near=!e._crowdLod&&nearDx*nearDx+nearDz*nearDz<48*48;
    /* 远处尸潮渲染预算：战斗逻辑仍逐个运行，只对超大尸潮的远景模型抽样绘制。 */
    const renderStride=crowd>800?3:crowd>500?2:1;
    const farForRender=renderStride>1&&nearDx*nearDx+nearDz*nearDz>58*58;
    e.group.visible=!e._crowdLod;
    if(e.velocity)e.velocity.set(0,0,0);
    /*  dying 状态：保留在数组里播完死亡动画，到达时长后真正清理 */
    if(e.dying){
      e.dyingT+=dt;
      if(e.mixer)e.mixer.update(dt);
      const dieClip=e.actions&&e.actions.die,dieDuration=dieClip&&dieClip.getClip?Math.max(1.05,dieClip.getClip().duration||1.05):1.28;
      if(e.characterModel&&e.visualRoot&&!dieClip){
        const progress=Math.min(1,e.dyingT/dieDuration),eased=progress*progress*(3-2*progress);
        const side=e.hordeId%2?1:-1;
        e.visualRoot.rotation.x=eased*Math.PI*.62;
        e.visualRoot.rotation.z=side*eased*Math.PI*.58;
        e.visualRoot.position.y=-eased*.72;
        if(e.poseBones){
          const bones=e.poseBones,base=e.baseBoneRotations||{};
          const reset=(bone,key)=>{if(bone&&base[key])bone.rotation.copy(base[key]);};
          reset(bones.LeftArm,"LeftArm");reset(bones.RightArm,"RightArm");
          reset(bones.LeftForeArm,"LeftForeArm");reset(bones.RightForeArm,"RightForeArm");
          _aimTarget.set(0,-1,0);
          _aimBoneToward(bones.LeftArm,bones.LeftForeArm||bones.LeftHand,_aimTarget);
          _aimBoneToward(bones.RightArm,bones.RightForeArm||bones.RightHand,_aimTarget);
        }
      }
      if(e.dyingT>=dieDuration+.12){
        if(e.mixer){try{e.mixer.stop();}catch(_){}}
        scene.remove(e.group);releaseEnemyResources(e);
        if(e.beam){scene.remove(e.beam);disposeTransientObject3D(e.beam);}
        enemies.splice(i,1);
      }
      continue;
    }
    updateBossMechanic(e,dt,now);
    if(!e.alive){enemies.splice(i,1);continue;}
    /*  AnimationMixer：近处/首领/巨人全量，千人尸潮远处隔 16 帧；固定前举姿态另按 8 帧分摊。 */
    if(e.mixer&&!e._crowdLod){
      if(e.boss||e.giant||near)e.mixer.update(dt);
      else if(((_animFrame+e.hordeId)&(animationStride-1))===0)e.mixer.update(dt*animationStride);
    }
    /*  冰冻减速失效恢复 */
    if(e.slowUntil&&now>e.slowUntil){e.slowMult=1;e.slowUntil=0;}
    if(e.beam){
      e.beam.material.opacity-=dt*.6;
      if(now>e.spawnFlash||e.beam.material.opacity<=0){scene.remove(e.beam);disposeTransientObject3D(e.beam);e.beam=null;}
      continue;
    }
    /*  EMP 眩晕：被脉冲命中的敌人短时瘫痪 */
    if(e.stunUntil&&now<e.stunUntil){
      if(Math.random()<dt*8)spawnParticles(e.group.position.clone().setY(2.2),0x7ec8ff,1,3,.5);
      e.cd=Math.max(e.cd,.5);
      continue;
    }
    e.thinkTimer-=dt;
    /*  P0-3：转向改为「按格边界重算」为主 + 短 thinkTimer 保底
       原缺陷：thinkTimer 1~2.6s 才重算一次方向，而敌人约 1 秒穿 1 格（速度 ~4 / TILE 4），
       必然冲过转角 → 到对面格又收到反向指令 → 在坡口前反复来回（实测 d=15 处 x=17~20 震荡）。 */
    const curCell=cellOf(e.group.position.x,e.group.position.z);
    const cellChanged=!e._cell||e._cell.x!==curCell.x||e._cell.z!==curCell.z;
    if(ACTIVE_MODE.key==="survival"&&(cellChanged||e.thinkTimer<=0)){
      if(cellChanged)e._cell=curCell;
      e.thinkTimer=.25+Math.random()*.15;          // 同格内保底刷新，避免长时间不更新
      /*  流场寻路：朝大门梯度移动（自动绕开不可破围墙） */
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
    /*  P0-2：已抵达大门 → 停下正对门槛啃门
       原缺陷：啃门依赖「被挡住才啃」的碰撞判定（要求 !moved），但敌人在流场最小值 d=1 处
       会被梯度推离大门、一直 moved=true，于是啃门分支永不触发 —— 实测大门 600 血 150 秒零掉血，
       游戏不存在失败条件。现在改为显式攻击：抵达即啃，不再依赖是否被挡住。
        trace7/gate1 实测修复：atGate 分支与 !moved 撞墙分支会双重递减 wallCd（每帧 -2dt）
       且空啃分支把 wallCd 重置为 0.35 → 实际啃门频率约为设计值的 2 倍。
       改为 else-if 互斥：atGate 已判定时跳过撞墙分支，wallCd 只递减一次，节奏回到设计值。 */
    const gateSlot=ACTIVE_MODE.key==="survival"&&e.atGate&&baseAlive&&baseGroup&&enemyGateAttackSlot(e);
    e._gateAttackSlot=!!gateSlot;
    if(gateSlot){
      e.objectiveKind="base";
      e.dir.set(0,0,0);
      const bp=baseContactPoint(e.group.position);
      const want=Math.atan2(bp.x-e.group.position.x,bp.z-e.group.position.z);
      e.heading=want;
      e.group.rotation.y+=shortAngle(want-e.group.rotation.y)*Math.min(1,dt*6);
      e.wallCd=(e.wallCd||0)-dt;
      if(e.wallCd<=0){
        const bite=enemyMeleeDamage(e);damageGate(bite,e.group.position);applyEnemyLifesteal(e,bite);
        e.wallCd=e.boss?.55:.9;
        e._attackedNow=true;   /*  P4-1：驱动 attack-melee 动画 */
        _wdProgress();      /*  P1-1：啃门=波次在推进 */
        spawnParticles(new THREE.Vector3(e.group.position.x,1.4,e.group.position.z),0xff8080,5,5,.6);
      }
    }
    else{
      if(ACTIVE_MODE.key==="survival")updateEnemyObjective(e);
      const effectiveSpeed=Math.min(e.maxSpeed||Infinity,e.speed*(now<e.hasteUntil?1.8:1))*(e.slowMult||1);
      const spd=effectiveSpeed*dt*(ACTIVE_MODE.key==="survival"?(e.crowdSpeedScale??1):1);
      const curH=heightAt(e.group.position.x,e.group.position.z);
      const targetWall=e.objectiveKind==="wall"&&e.objectiveCell
        ?{...e.objectiveCell,center:cellCenter(e.objectiveCell.x,e.objectiveCell.z)}:null;
      const wallInReach=!!(targetWall&&(steelHP.get(idx(targetWall.x,targetWall.z))>0||ownedStructureAtCell(idx(targetWall.x,targetWall.z)))
        &&enemyWallTouching(e,targetWall));
      const wallAttackSlot=wallInReach&&enemyWallAttackSlot(e,targetWall);
      const nx=e.group.position.x+e.dir.x*spd,nz=e.group.position.z+e.dir.z*spd;
      const navigationRadius=enemyNavigationRadius(e);
      if(!wallInReach&&!hordeLaneDetour(e,e.dir,spd,curH,navigationRadius)){
        if(e.dir.x&&!blockedForTank(nx,e.group.position.z,navigationRadius,curH)){e.group.position.x=nx;moved=true;}
        if(e.dir.z&&!blockedForTank(e.group.position.x,nz,navigationRadius,curH)){e.group.position.z=nz;moved=true;}
      }else if(!wallInReach)moved=true;
      /* 前方被尸群占住时，不降低后排速度；尝试沿流向法线换到相邻空位。 */
      if(ACTIVE_MODE.key==="survival"&&!wallInReach&&!moved&&(e.dir.x||e.dir.z)){
        const side=e.hordeId%2?1:-1,sx=-e.dir.z*side,sz=e.dir.x*side;
        if(!blockedForTank(e.group.position.x+sx*spd*1.35,e.group.position.z+sz*spd*1.35,navigationRadius,curH)){
          e.group.position.x+=sx*spd*1.35;e.group.position.z+=sz*spd*1.35;moved=true;e.thinkTimer=.08;
        }
      }
      /*  P0-3 终修（trace7 实测）：单轴推进被挡时沿垂直轴「向本格格心」滑移脱困（仅生存）。
         楔死场景：敌人贴坡道走廊 row34 行缘（pz=42.0 恰为行边界），南向角点采样落进 (·,33) 平地
         h=0，高差 -1.38 曾超 STEP_DOWN(1.3) → x 轴移动被判挡；且流场方向 [-1,0] 无 z 分量，
         敌人永远滑不回行中心 → 永久冻结。进 col16 时还可能擦到 (16,33) 钢墙实体格，同理被挡。
         滑移目标取「朝本格格心」：走廊内即自动回到走廊中线，不引入离路漂移；
         正前方是可啃墙（砖/钢/大门）时不滑移，完整保留撞墙啃咬拆墙行为。 */
      if(ACTIVE_MODE.key==="survival"&&!moved&&((e.dir.x&&!e.dir.z)||(e.dir.z&&!e.dir.x))){
        const wx=e.group.position.x+e.dir.x*(e.radius+.8),wz=e.group.position.z+e.dir.z*(e.radius+.8);
        const wc=cellOf(wx,wz);
        const frontChew=inMap(wc.x,wc.z)&&(grid[wc.z][wc.x]===T_BRICK||grid[wc.z][wc.x]===T_STEEL||
          grid[wc.z][wc.x]===T_BASE||structCells.has(idx(wc.x,wc.z)));
        if(!frontChew){
          const cc=cellCenter(cellOf(e.group.position.x,e.group.position.z).x,cellOf(e.group.position.x,e.group.position.z).z);
          const sx=e.dir.x?0:(cc.x>e.group.position.x?1:-1);
          const sz=e.dir.z?0:(cc.z>e.group.position.z?1:-1);
          if(sz!==0&&!blockedForTank(e.group.position.x,e.group.position.z+sz*spd,navigationRadius,curH)){e.group.position.z+=sz*spd;moved=true;}
          else if(sx!==0&&!blockedForTank(e.group.position.x+sx*spd,e.group.position.z,navigationRadius,curH)){e.group.position.x+=sx*spd;moved=true;}
        }
      }
      /*  撞墙啃咬：被墙挡住时原地持续攻击直至破开（BOSS/重装拆得更快） */
      let attacked=false;
      if(wallInReach||!moved){
        e.wallCd=(e.wallCd||0)-dt;
        if(e.wallCd<=0){
          if(wallInReach&&!wallAttackSlot){e.wallCd=.18;continue;}
          const fx=e.group.position.x+e.dir.x*(e.radius+.8),fz=e.group.position.z+e.dir.z*(e.radius+.8);
          const c=wallInReach?targetWall:cellOf(fx,fz);
          /*  生存模式：正前方是大门 → 啃咬大门（唯一入口） */
          if(ACTIVE_MODE.key==="survival"&&inMap(c.x,c.z)&&grid[c.z][c.x]===T_BASE){
            if(!enemyGateAttackSlot(e)){e.wallCd=.18;continue;}
            const bite=enemyMeleeDamage(e);damageGate(bite,e.group.position);applyEnemyLifesteal(e,bite);
            attacked=true;e.wallCd=e.boss?.55:.9;
            e._attackedNow=true;   /*  P4-1：驱动 attack-melee 动画 */
            _wdProgress();   /*  P1-1：啃门=波次在推进 */
            spawnParticles(new THREE.Vector3(fx,1.4,fz),0xff8080,5,5,.6);
          }else if(inMap(c.x,c.z)&&damageOwnedStructureAtCell(idx(c.x,c.z),enemyWallDamage(e))){
            attacked=true;e.wallCd=e.boss?.55:.9;e._attackedNow=true;_wdProgress();
            spawnParticles(new THREE.Vector3(fx,1.4,fz),0xb55a4a,5,4,.55);
          }else if(inMap(c.x,c.z)&&(grid[c.z][c.x]===T_BRICK||grid[c.z][c.x]===T_STEEL)
            &&damageWallCell(c.x,c.z,enemyWallDamage(e))){
            attacked=true;e.wallCd=e.boss?.55:.9;
            e._attackedNow=true;   /*  P4-1：驱动 attack-melee 动画 */
            _wdProgress();   /*  P1-1：拆墙=波次在推进 */
            spawnParticles(new THREE.Vector3(fx,1.4,fz),0xffcf7a,4,4,.5);
          }else e.wallCd=.35;
        }
      }
      if(attacked){sfx.zombie(e);sfx.gate();}
      if(!moved&&!attacked)e.thinkTimer=0;
    }
    /* 转角长时间没有推进且前方没有同伴排队时，检查地形后柔和回到当前格中线。
       排队、攻击和脱困期间始终保留实体碰撞，不能把等待的后排拉进前排身体内。 */
    if(ACTIVE_MODE.key==="survival"&&!e.atGate&&e.objectiveKind!=="wall"&&Number.isFinite(e.flowHere)){
      if(!Number.isFinite(e.bestFlowDistance)||e.flowHere<e.bestFlowDistance-.01){
        e.bestFlowDistance=e.flowHere;e.flowStallTime=0;
      }else e.flowStallTime=(e.flowStallTime||0)+dt;
      if(e.flowStallTime>=2.4&&(e.crowdSpeedScale??1)>.95){
        const recoveryCell=cellOf(e.group.position.x,e.group.position.z);
        if(inMap(recoveryCell.x,recoveryCell.z)&&passableForFlow(recoveryCell.x,recoveryCell.z)){
          const center=cellCenter(recoveryCell.x,recoveryCell.z),pull=Math.min(1,dt*7);
          const rx=pull*(center.x-e.group.position.x),rz=pull*(center.z-e.group.position.z);
          const h=heightAt(e.group.position.x,e.group.position.z),r=enemyNavigationRadius(e);
          if(!blockedForTank(e.group.position.x+rx,e.group.position.z,r,h))e.group.position.x+=rx;
          if(!blockedForTank(e.group.position.x,e.group.position.z+rz,r,h))e.group.position.z+=rz;
          e.thinkTimer=0;
        }
        e.flowStallTime=0;
      }
    }
    if(e.velocity&&dt>0)e.velocity.set((e.group.position.x-previousX)/dt,0,(e.group.position.z-previousZ)/dt);
    e.group.position.y+=(heightAt(e.group.position.x,e.group.position.z)-e.group.position.y)*Math.min(1,dt*10);
    if(e.dir.x||e.dir.z){
      const want=Math.atan2(e.dir.x,e.dir.z);
      e.heading=want;
      e.group.rotation.y+=shortAngle(want-e.group.rotation.y)*Math.min(1,dt*8);
    }
    /*  角色动画（P4-1）：移动→Walk / 攻击→attack-melee / 待机→Idle
       Kenney GLB 动画名按「含关键字」模糊匹配（attack-melee-up/down/stab 等变体）。 */
    {
      const atk=(e._gateAttackSlot||(!moved&&e._attackedNow));
      if(e._attackedNow)e.attackPose=1;
      else e.attackPose=Math.max(0,(e.attackPose||0)-dt*1.85);
      const wantAnim=atk?"@attack":(moved?_ANIM_WALK:_ANIM_IDLE);
      if(e.currentAnim!==wantAnim){
        let a=null;
        if(atk){
          for(const k in e.actions){if(k.indexOf("attack")>=0&&e.actions[k]){a=e.actions[k];break;}}
          /* Survivors / Retro 只提供 Idle 与 Run：攻击阶段保持原生 Idle，
             不再用程序化扭身伪造攻击。Blocky 会走原生 attack clip。 */
          if(!a)a=e.actions.idle||null;
        }else a=e.actions[wantAnim];
        if(a){
          a.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(.12).play();
          if(!atk&&wantAnim===_ANIM_WALK)a.time=a.getClip().duration*((e.hordeId*.61803398875)%1);
          if(e.currentAnim){
            const prev=e.currentAnim==="@attack"
              ?(function(){for(const k in e.actions){if(k.indexOf("attack")>=0&&e.actions[k])return e.actions[k];}})()
              :e.actions[e.currentAnim];
            if(prev)prev.fadeOut(.12);
          }
          e.currentAnim=wantAnim;e.poseDirty=true;
        }
      }
      if(wantAnim===_ANIM_WALK&&e.actions.walk){
        const actualSpeed=dt>0?Math.hypot(e.group.position.x-previousX,e.group.position.z-previousZ)/dt:e.speed;
        e.actions.walk.setEffectiveTimeScale(SurvivalSystem.enemyRunTimeScale(actualSpeed));
      }
      e._attackedNow=false;
    }
    if(!e._crowdLod&&e.characterModel&&e.poseBones&&
      (e.poseDirty||poseStride===1||((_animFrame+e.hordeId)&(poseStride-1))===0||e.attackPose>0)){
      applyZombieReachPose(e);e.poseDirty=false;
    }

    /*  炮塔瞄准（P4-1 删）：敌人不再瞄玩家/炮台，目标只有墙与大门 */

    e.cd-=dt;
    if((e.type==="sniper"||e.bossMechanic==="phase")&&e.atGate&&baseAlive&&baseGroup&&e.cd<=0){
      const direction=baseGroup.position.clone().sub(e.group.position).setY(0),distance=direction.length();
      if(distance<34){e.cd=e.fireCd;shoot(e,direction.normalize(),false);}
    }
  }
  applyHordeSeparation(dt);
  updateHordeClimbing(dt);
  if(ACTIVE_MODE.key==="survival")spawnPendingSurvivalEnemies(dt);
  else if(survivalCombatRunning()&&game.enemiesToSpawn>0){
    if(!Number.isFinite(game.spawnTimer))game.spawnTimer=0;
    game.spawnTimer-=dt;
    if(game.spawnTimer<=0){
      const profile=SurvivalSystem.waveProfile(game.wave);
      game.spawnTimer=(ACTIVE_MODE.spawnInterval||(w=>Math.max(1.2,3.2-w*.12)))(game.wave);
      const count=Math.min(profile.spawnBatch||1,game.enemiesToSpawn),bossWave=isBossWave(game.wave);
      for(let spawned=0;spawned<count;spawned++){
        if(bossWave&&!enemies.some(e=>e.boss)&&!game._bossDone){game._bossDone=true;spawnEnemy(null,true);}
        else{if(!bossWave)game._bossDone=false;spawnEnemy(pickEnemyType());}
        game.enemiesToSpawn--;
      }
      updateEnemyLeftUI();
    }
  }
  /* UI 和状态机必须使用同一个“存活敌人”口径。死亡动画对象仍可留在
     enemies 数组中收尾，但不能阻塞休整倒计时。 */
  if(survivalCombatRunning()&&game.enemiesToSpawn<=0&&activeEnemyCount()===0&&game.wave>0){
    game._bossDone=false;waveCleared();
  }
}
/*  波次看门狗（无进展语义）：单波 N 秒内无任何「推进事实」→ 重新寻路并提示。
   推进事实 = 任一敌人死亡 / 大门掉血 / 墙被拆 —— 只有这些才真正让波次向前走。
   场景：敌人被物理几何卡进不可达死角、或寻路目标永久不可达时，
   波次条件 `enemiesToSpawn<=0 && enemies.length===0` 永不成立，整局停滞。
   注意不能用「敌人位移」当进度信号：被围死的敌人在包围圈内仍会抖动滑动。
   看门狗绝不代替战斗杀敌，避免正常慢磨和 Boss 被误判后发放奖励。
   变量声明在 _waveClearing 附近（resetGame 首次调用之前），避免 TDZ。 */
function _wdProgress(){
  if(!_wdHarvesting){_wdStallT=0;_wdRerouted=false;}
}
function updateWatchdog(dt){
  if(ACTIVE_MODE.key!=="survival"||!survivalCombatRunning()||game.wave<=0)return;
  if(game.enemiesToSpawn>0&&!_wdHarvesting){_wdStallT=0;return;}
  _wdStallT+=dt;
  const REROUTE_AT=isBossWave(game.wave)?38:20;
  if(!_wdRerouted&&_wdStallT>=REROUTE_AT){
    _wdRerouted=true;computeFlowField();
    enemies.forEach(enemy=>{if(enemy.alive){enemy.thinkTimer=0;enemy.objectiveCell=null;}});
    announce(" 尸潮路径重新校准");
  }
  const LIMIT=isBossWave(game.wave)?75:42;
  if(!_wdHarvesting&&_wdStallT>=LIMIT){
    _wdHarvesting=true;
    _wdKillTimer=0;
    computeFlowField();
    enemies.forEach(enemy=>{if(enemy.alive){enemy.thinkTimer=0;enemy.objectiveCell=null;}});
    announce(` 第 ${game.wave} 波检测到寻路停滞，请继续战斗；不会自动清除敌人`);
  }
}

/* 单颗子弹在某位置的碰撞判定：返回 true 表示子弹被消耗 */
function bulletCollide(b,p){
  if(ACTIVE_MODE.key==="survival"&&p.y<heightAt(p.x,p.z))return true;
  // 墙体（ P4-3：塔弹 thruWall → 穿透玩家墙/原生钢墙/建筑，不被悬崖和自家构筑挡炮）
  const c=cellOf(p.x,p.z);
  if(inMap(c.x,c.z)){
    const t=grid[c.z][c.x];
    if(b.thruWall&&(t===T_BRICK||t===T_STEEL||t===T_BUILDING)){/* 穿墙：跳过 */}
    else if(t===T_BRICK){destroyBricksAround(p.x,p.z,.5);return true;}
    else if(t===T_STEEL||t===T_BUILDING){
      /*  弹射装甲弹：玩家炮弹碰钢墙/楼房反弹 */
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
        if(game.baseShieldHP<=0)toast(" 基地护盾耗尽！");
      }else if(ACTIVE_MODE.key==="survival"&&game.gateHp>0){
        /*  生存模式：子弹命中大门 → 统一走 damageGate（含闪避/护甲/反伤） */
        damageGate(Math.max(1,Math.round(b.dmg)),new THREE.Vector3(p.x,0,p.z));
        if(game.gateHp>0)toast(` 大门受创 ${Math.max(0,Math.ceil(game.gateHp))}/${game.gateMaxHp}`);
        return true;
      }else baseDestroyed();
      return true;
    }
  }
  const hitR2=(pos,r)=>{const dx=p.x-pos.x,dz=p.z-pos.z;return dx*dx+dz*dz<r*r;};
  const hitEnemyModel=(enemy)=>{
    const visual=enemy.animationRoot||enemy.visualRoot;
    if(!visual)return hitR2(enemy.group.position,enemy.radius+.6);
    const broadRadius=Math.max(3,(enemy.radius||1)*4,(enemy._lodHeight||0)*1.5);
    if(!hitR2(enemy.group.position,broadRadius))return false;
    const bounds=enemyModelBounds(enemy);
    if(bounds.isEmpty())return hitR2(enemy.group.position,enemy.radius+.6);
    return p.x>=bounds.min.x-.06&&p.x<=bounds.max.x+.06&&p.y>=bounds.min.y-.06&&p.y<=bounds.max.y+.06&&p.z>=bounds.min.z-.06&&p.z<=bounds.max.z+.06;
  };
  if(b.owner==="player"){
    for(const e of enemies){
      if(!e.alive||performance.now()<e.spawnFlash||performance.now()<(e.phaseUntil||0)||b.hitSet.has(e))continue;
      if(hitEnemyModel(e)){
        b.hitSet.add(e);
        /*  弱点分析：暴击双倍伤害 */
        let dmg=b.dmg;
        if(Math.random()<game.stats.critChance){
          dmg*=2;spawnParticles(p.clone(),0xffd75e,9,7,.9);sfx.levelup();
        }
        if(b.source==="turret"){
          /* 反装甲炮基础伤害被压到不再秒杀普通怪；命中真正的厚甲/首领时再获得职责倍率，
             保证它不会被高射速机枪在重装目标上全面替代。 */
          if(b.projectileType==="antitank"&&((e.armor||0)>=.18||e.boss))dmg*=2.8;
        }
        damageEnemy(e,dmg,{source:b.source,armorPierce:b.armorPierce,projectileType:b.projectileType,
          hitDirection:b.vel,hitPoint:p});
        spawnGoreBurst(e,p,b.vel,b.projectileType==='cannon'||b.projectileType==='antitank'?1.35:1);
        applyIncendiaryHit(e,b);
        spawnParticles(p.clone(),0xfff2b0,5,5,.7);
        sfx.hit();
        if(b.pierceLeft>0){b.pierceLeft--;return false;}
        return true;
      }
    }
  }else{
    for(const unit of friendlyUnits){
      if(!unit.alive||!hitR2(unit.group.position,unit.radius+.6))continue;
      unit.hp-=b.dmg*(1-Math.min(.65,unit.armor||0));spawnParticles(p.clone(),0xff8a6a,5,5,.7);return true;
    }
    const occupiedHit=inMap(c.x,c.z)?ownedStructureAtCell(idx(c.x,c.z)):null;
    if(occupiedHit?.kind==='construction')return damageConstruction(occupiedHit.record,b.dmg);
    for(const [records,kind] of ownedStructurePools()){
      const structure=(occupiedHit&&occupiedHit.records===records&&occupiedHit.record.hp>0?occupiedHit.record:null)
        ||records.find((item)=>item.hp>0&&hitR2(item.group.position,3));
      if(!structure)continue;
      structure.hp-=b.dmg;
      if(structure.hp<=0){
        destroyOwnedStructure(structure,records,kind);
      }
      return true;
    }
    if(player&&player.alive&&hitR2(player.group.position,player.radius+.6)){damagePlayer(b.dmg);return true;}
  }
  return false;
}

function updateBullets(dt){
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    b.life-=dt;
    b._trailT=(b._trailT||0)-dt;
    if(b._trailT<=0){
      const trail={machinegun:[0xffd56b,2.4,.11,.07],cannon:[0x8b7b6b,2.2,.22,.09],antitank:[0xf7e5b7,3.2,.16,.045],emp:[0x9cecff,.8,.9,.1],shotgun:[0xffe2a0,2.8,.15,.1],incendiary:[0xff6b2e,3.8,.45,.065],grenade:[0xc99b59,2.1,.3,.09],tank:[0xffc27c,2.4,.2,.08]}[b.projectileType]||[0xc7d5d7,1.25,.18,.06];
      spawnParticles(b.mesh.position.clone(),trail[0],b.projectileType==="incendiary"?3:2,trail[1],trail[2]);
      b._trailT=trail[3];
    }
    /*  子步进移动：每步 ≤1.2 单位，杜绝高速穿墙/穿人 */
    if(b.gravity)b.vel.y-=b.gravity*dt;
    const dist=b.vel.length()*dt;
    const steps=Math.max(1,Math.ceil(dist/1.2));
    const inc=b.vel.clone().multiplyScalar(dt/steps);
    let dead=b.life<=0;
    for(let s=0;s<steps&&!dead;s++){
      b.mesh.position.add(inc);
      const p=b.mesh.position;
      if(Math.abs(p.x)>HALF||Math.abs(p.z)>HALF){dead=true;break;}
      if(bulletCollide(b,p))dead=true;
      if(b.gravity&&b.vel.y<0&&p.y<=heightAt(p.x,p.z)+.1)dead=true;
    }
    // 子弹贴合地形飞行（视觉）
    const p=b.mesh.position;
    /* 弹道高度锁定在出膛高度，不能随高台地形采样下沉再抬升。 */
    if(Number.isFinite(b.flightY))p.y=b.flightY;
    if(dead){
      projectileImpactFx(b.projectileType,p.clone());
      if(b.blast>0){
        spawnParticles(p.clone(),0xffa02e,14,10,1.1);
        const R=b.blast;
        enemies.forEach(e=>{
          if(!e.alive)return;
          const dx=e.group.position.x-p.x,dz=e.group.position.z-p.z;
          if(dx*dx+dz*dz<(R+e.radius)*(R+e.radius)){
            damageEnemy(e,b.dmg*.6,{source:b.source,armorPierce:b.armorPierce,projectileType:b.projectileType});
          }
        });
        destroyBricksAround(p.x,p.z,R*.7);
        sfx.boom();camShake=Math.max(camShake,.35);
      }
      scene.remove(b.mesh);disposeTransientObject3D(b.mesh);bullets.splice(i,1);
    }
  }
}

function updateParticles(dt){
  updateAshWind(dt);
  for(let i=particles.length-1;i>=0;i--){
    const pt=particles[i];
    pt.life-=dt;pt.vel.y-=25*dt;
    pt.position.addScaledVector(pt.vel,dt);
    if(pt.life<=0){particlePool.push(pt);particles[i]=particles[particles.length-1];particles.pop();}
  }
  const count=Math.min(particles.length,PARTICLE_LIMIT);
  for(let i=0;i<count;i++){
    const pt=particles[i],fade=Math.max(0,Math.min(1,pt.life*2));
    particleFx.set(i,pt.position,pt.color,Math.max(.12,pt.size)*(.5+(1-pt.life/pt.total)*.6),fade*.9);
  }
  particleFx.commit(count);
  /*  电磁连锁闪电视觉衰减 */
  for(let i=lightningBeams.length-1;i>=0;i--){
    const lb=lightningBeams[i];
    lb.life-=dt;
    lb.line.material.opacity=Math.max(0,lb.life/.18);
    if(lb.life<=0){scene.remove(lb.line);lb.line.geometry.dispose();lb.line.material.dispose();lightningBeams.splice(i,1);}
  }
}
function updateCorpseDecals(dt){
  for(let i=corpseDecals.length-1;i>=0;i--){const item=corpseDecals[i];
    if(item.pieces&&item.settle>0){item.settle-=dt;for(const piece of item.pieces){if(!piece.mesh||piece.blood&&piece.mesh.position.y<=.06)continue;piece.velocity.y-=12*dt;piece.mesh.position.addScaledVector(piece.velocity,dt);piece.mesh.rotation.x+=piece.spin.x*dt;piece.mesh.rotation.y+=piece.spin.y*dt;piece.mesh.rotation.z+=piece.spin.z*dt;if(piece.mesh.position.y<.06){piece.mesh.position.y=.06;piece.velocity.set(0,0,0);}}}
    if(Number.isFinite(item.life)){item.life-=dt;if(item.life<=0){scene.remove(item.root);corpseDecals.splice(i,1);disposeTransientObject3D(item.root);}}
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
  if(window.Settings&&!Settings.isShake())camShake=0;
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
    /*  P4-4 标准 RTS 镜头：固定俯仰角（60°），位置 = 焦点 + 方向 * dist，直接赋值无 lerp。
       方向键/边缘滚动平移 camFocus（沿镜头朝向，上=北）；WASD 保留给 WAR3 指令热键；
       滚轮只改 dist（镜头与地面焦点距离），不再同时拉高+后撤产生"扭动感"。 */
    const PITCH=60*Math.PI/180;                 // 固定俯仰
    const DIST=Math.max(24,Math.min(120,camHeight));   // camHeight 复用为距离
    const sp=42*dt;
    let dx=0,dz=0;
    if(keys.ArrowUp)dz-=1;
    if(keys.ArrowDown)dz+=1;
    if(keys.ArrowLeft)dx-=1;
    if(keys.ArrowRight)dx+=1;
    if(!rightCameraDrag&&state!==STATE.BUILD&&document.hasFocus()){
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
/* v5.0.0：唯一状态步进入口。正常 RAF 与自动化 advanceTime 共享这条路径。 */
function stepGame(dt,now=performance.now()){
  _animFrame++;
  if(state!==STATE.MENU&&state!==STATE.PAUSED&&state!==STATE.OVER&&state!==STATE.SETTLE)
    updateWaveTransition(dt);
  if(state!==STATE.MENU&&state!==STATE.OVER){updateVisionSystem(dt);updateBloodMist(dt);}
  const survivalUiState=ACTIVE_MODE.key==="survival"&&
    (state===STATE.BUILD||state===STATE.TECH||state===STATE.GATE||state===STATE.UPGRADE);
  if(state===STATE.PLAYING||state===STATE.UPGRADE||state===STATE.BUILD||state===STATE.PREP||state===STATE.TECH||state===STATE.GATE){
    if(state===STATE.PLAYING||state===STATE.PREP||survivalUiState){
      updateSurvivalPressure(dt);
      updateSupportAuras();
      updateIncendiaryDamage(dt);
      if(player)updatePlayer(dt);
      updateEnemies(dt);
      updateWatchdog(dt);
      updateAutoTurret(dt);
      updateBaseGadgets(dt);
      updateBuiltTurrets(dt);
      updateFactories(dt);
      updateConstruction(dt);
      updateMedicalBeacons(dt);
      updateFriendlyUnits(dt);
      applyGameplayCollisions(dt);
      updateBullets(dt);
      updateWaveDeadline(dt);
      updateDamageHealthBars();
      updatePowerups(dt);
      questTick();
      if(ACTIVE_MODE.key==="survival"&&goldMines.length){
        const ec=ACTIVE_MODE.economy||{};
        const tiers=ec.mineIncomeTiers||[14,20,28,39,55,78];
        const economyLv=researchPowerLevel((game.tech&&game.tech.economy)||0);
        const incomeMult=1+(TECH_TREE.economy.effect.incomePct||0.08)*economyLv;
        let total=0;
        goldMines.forEach(m=>{
          const rate=(tiers[Math.min(m.level-1,tiers.length-1)]||0)*incomeMult;
          total+=rate;m.incomePulse=(m.incomePulse||0)+dt;
          while(m.incomePulse>=1){m.incomePulse-=1;spawnMineIncomePopup(m,rate);}
        });
        game.gold+=total*dt;
        if(now-_goldT>250){_goldT=now;updateGoldUI();}
      }
      updateMineIncomePopups(dt);
      if(baseGroup){
        const sh=baseGroup.userData.shield,st=baseGroup.userData.star;
        sh.visible=game.baseShieldHP>0;
        if(sh.visible)sh.material.opacity=.12+.06*Math.sin(now*.004);
        st.rotation.y+=dt*2;
      }
      if(now-_buffT>500){_buffT=now;updateBuffUI();}
    }
    if(state===STATE.PREP||(state===STATE.BUILD&&wc3BuildMode&&game.prepTime>0)){
      game.prepTime-=dt;
      const s=Math.max(0,Math.ceil(game.prepTime));
      const el=$("prepBar");
      if(el)el.textContent=` 准备阶段 ${s}s · B 键打开商店`;
      if(game.prepTime<=0){
        if(el)el.style.display="none";
        if(buildReturnState===STATE.PREP)buildReturnState=STATE.PLAYING;
        const resumeWave=Math.max(1,Number(game._resumeWave)||1);
        const shouldStart=!!game._resumeWave||game.wave<=0;
        game._resumeWave=0;
        if(state===STATE.PREP)state=STATE.PLAYING;
        if(shouldStart){
          announce(`第 ${resumeWave} 波 来袭！`);
          startWave(resumeWave);
        }
      }
    }
    updateParticles(dt);updateCorpseDecals(dt);
    if(state===STATE.BUILD&&ACTIVE_MODE.key!=="survival"){
      game.buildTimer-=dt;
      const s=Math.max(0,Math.ceil(game.buildTimer));
      const el=$("buildTimer");
      el.textContent=s;
      el.style.color=s<=10?"#ff5d5d":"#ffd75e";
      if(game.buildTimer<=0)finishBuild();
    }
    if(state===STATE.BUILD&&buildSel!==null)updateGhost();
    drawMinimap();
    if(ACTIVE_MODE.key==="survival"){
      _cmdT=(_cmdT||0)+dt;
      if(_cmdT>.2){_cmdT=0;renderCmdCard();wc3RenderSel();updateDockRes();}
    }
  }
}
function loop(){
  requestAnimationFrame(loop);
  updateSurvivalSoundscape();
  const now=performance.now();
  let dt=(now-lastT)/1000;lastT=now;
  dt=Math.min(dt,.05)*FF;
  stepGame(dt,now);
  updateCamera(dt);
  updateCrowdLod();
  if(window.BGMBridge)BGMBridge.tick(state, ACTIVE_MODE&&ACTIVE_MODE.key,{wave:game.wave,bossAlive:enemies.some(e=>e.boss&&e.alive&&!e.dying),intensity:Math.min(1,enemies.length/150),hidden:document.hidden});
  if(window.SurvivalHUD&&ACTIVE_MODE&&ACTIVE_MODE.key==="survival")SurvivalHUD.update(); /*  v6.35.0：生存 HUD 顶部进度/压力条 */
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
function resetGame(baseLayout=null,terrainPads=[]){
  mobileHealingLedger=new WeakMap();
  naturalSupportPads=terrainPads;
  if(ACTIVE_MODE.key==="survival")ACTIVE_MODE.base={...(baseLayout||DEFAULT_SURVIVAL_BASE)};
  clearConstruction();
  clearCrowdLod();
  [...bullets].forEach(b=>{scene.remove(b.mesh);disposeTransientObject3D(b.mesh);});bullets.length=0;
  particles.length=0;particleGeometry.setDrawRange(0,0);
  corpseDecals.splice(0).forEach((item)=>{scene.remove(item.root);disposeTransientObject3D(item.root);});
  [...powerups].forEach(p=>scene.remove(p.group));powerups.length=0;
  [...enemies].forEach(e=>{scene.remove(e.group);releaseEnemyResources(e);if(e.beam){scene.remove(e.beam);disposeTransientObject3D(e.beam);}});enemies.length=0;
  /*  清空玩家构筑物 */
  builtTurrets.forEach(t=>{scene.remove(t.group);disposeTransientObject3D(t.group);});builtTurrets.length=0;
  builtMines.forEach(m=>scene.remove(m.group));builtMines.length=0;
  goldMines.forEach(m=>scene.remove(m.group));goldMines.length=0;
  mineIncomePopups.splice(0).forEach((popup)=>popup.element.remove());
  researchInstitutes.forEach(t=>scene.remove(t.group));researchInstitutes.length=0;
  heavyFactories.forEach(t=>scene.remove(t.group));heavyFactories.length=0;
  friendlyUnits.forEach(t=>{scene.remove(t.group);disposeTransientObject3D(t.group);});friendlyUnits.length=0;
  heroTank=null;clearHeroEffects();clearHeroLogistics();clearFactoryWorkshops();game.upgradeJobs=[];heroHubs.forEach(h=>{scene.remove(h.group);disposeTransientObject3D(h.group);});heroHubs.length=0;
  builtHouses.forEach(h=>scene.remove(h.group));builtHouses.length=0;
  visionBeacons.forEach((beacon)=>{scene.remove(beacon.group);removeSurvivalPointLight(beacon.light);});visionBeacons.length=0;
  medicalHealingLinks.splice(0).forEach((link)=>{scene.remove(link);link.geometry.dispose();link.material.dispose();});
  structCells.clear();

  /*  重置任务三引导状态，避免跨局残留 */
  if(typeof questReset==="function") questReset();
  _waveClearing=false;                 /*  P0-1：跨局重开时清理清波闸门 */
  _wdStallT=0;_wdKillTimer=0;_wdHarvesting=false;_wdRerouted=false; /*  跨局重开时清零波次看门狗 */

  Object.assign(game,{score:0,lives:3,wave:0,bombs:0,upgrades:{},hero:HeroSystem.archive(),doctrine:null,doctrineTech:{},upgradeJobs:[],_bossDone:false,_eliteToast:false,
    baseShieldHP:0,enemiesToSpawn:0,spawnTimer:0,respawnTimer:0,waveTransition:null,_resumeWave:0,spawnPlans:[],waveElapsed:0,survivalElapsed:0,
    playerShieldHP:0,sprintUntil:0,_empTimer:0,_mortarTimer:0,
    tech:{},breakthroughs:{mining:0,science:0,wall:0,turret:0},researchTier:0,legacyDefense:0,gateHp:0,gateMaxHp:0,gateHpLv:0,gateArmorLv:0,gateThornsLv:0,gateRegenLv:0,gateDodgeLv:0,
    popUsed:0,popMax:(ACTIVE_MODE.economy&&ACTIVE_MODE.economy.startPop)||12,prepTime:0,endless:false,
    gold:ACTIVE_MODE.goldStart||0});
  game.buffs={shieldUntil:0,rapidUntil:0};
  game.stats={dmg:1,fireRate:1,moveSpeed:1,bulletSpeed:1,multishot:0,pierce:0,
    blastRadius:0,magnet:false,luckyLv:0,armorMax:5,
    critChance:0,vampLv:0,regenLv:0,
    bounce:0,sprintLv:0,sprintDur:3000,playerShieldLv:0,
    baseWallLv:0,baseRepairLv:0,autoTurretLv:0,baseShieldMax:0,airstrikeLv:0,overloadLv:0,
    empLv:0,mortarLv:0,evolveLv:0,incomeLv:0,builderLv:0,netmasterLv:0};

  genMap(1);
  if(ACTIVE_MODE.key==="survival"){
    if(player&&player.group)scene.remove(player.group);
    player=null;wc3ClearSel();wc3RenderSel();
  }else spawnPlayer();
  /*  大门血量（生存模式）：由 computeGateMaxHp 统一公式，初始满血 */
  if(ACTIVE_MODE.key==="survival"){
    game.gateMaxHp=computeGateMaxHp();
    game.gateHp=game.gateMaxHp;
  }
  // 按当前模式立即归位相机，避免从菜单视角长过渡
  if(ACTIVE_MODE.key==="survival"&&baseGroup){
    /* 开场俯视高台东沿和谷口，不把镜头怼在司令部上。 */
    const start=ACTIVE_MODE.startFocus||{col:(ACTIVE_MODE.ramp&&ACTIVE_MODE.ramp.col||10)-2,row:(ACTIVE_MODE.ramp&&ACTIVE_MODE.ramp.row||18)-2};
    const c=cellCenter(start.col,start.row);
    camHeight=ACTIVE_MODE.cameraY||66;camBack=ACTIVE_MODE.cameraZ||54;
    const pitch=60*Math.PI/180,dist=Math.max(24,Math.min(120,camHeight));
    camFocus.set(c.x,0,c.z);
    camera.position.set(camFocus.x,dist*Math.sin(pitch),camFocus.z+dist*Math.cos(pitch));
    camera.lookAt(new THREE.Vector3(c.x,0,c.z));
  }else if(player&&player.group){
    const f=player.group.position;
    const cy=ACTIVE_MODE.cameraY||60,cz=ACTIVE_MODE.cameraZ||46;
    camera.position.set(f.x*.55, cy, f.z*.55+cz);
    camera.lookAt(new THREE.Vector3(f.x*.55,0,f.z*.55));
  }
  $("score").textContent=0;
  if($("modeName")){
    const difficultyNames={easy:"简单",normal:"普通",hard:"困难",hell:"地狱"};
    $("modeName").textContent=ACTIVE_MODE.key==="survival"?`${ACTIVE_MODE.name||"生存"} · ${difficultyNames[game.difficultyId||"normal"]||"普通"}`:(ACTIVE_MODE.name||"巷战");
  }
  updateHpUI();updateBuffUI();updateGoldUI();
  $("hud").classList.remove("hidden");
  $("hud").classList.toggle("survival",ACTIVE_MODE.key==="survival");
  $("build").classList.add("hidden");
  $("tech").classList.add("hidden");
  $("gateUp").classList.add("hidden");
  if(ACTIVE_MODE.key==="survival"){
    // Prepare the human skinning shader/textures before the preparation clock starts.
    warmConstructionWorkers();lastT=performance.now();
    state=STATE.PREP;
    startPrep();
  }else{
    state=STATE.PLAYING;
    startWave(1);
  }
}

$("restartBtn").onclick=()=>{$("gameover").classList.add("hidden");resetGame();};
$("resumeBtn").onclick=()=>setPause(false);
/*  科技树弹窗：完成按钮关闭并回到原状态 */
$("techDoneBtn").onclick=closeTechMenu;
/*  结算弹窗：胜利收尾 / 进入无尽 */
const settleWinBtn=$("settleWinBtn"),settleEndlessBtn=$("settleEndlessBtn");
if(settleWinBtn)settleWinBtn.onclick=()=>{ $("settle").classList.add("hidden"); endGame(true); };
if(settleEndlessBtn)settleEndlessBtn.onclick=()=>{
  $("settle").classList.add("hidden");
  game.endless=true;
  state=STATE.PLAYING;
  announce(" 无尽模式开启！Boss 将周期性降临");
  setTimeout(()=>startWave(game.wave+1),900);
};

/* 暴露关键状态给调试/验证脚本（不影响游戏逻辑） */
Object.assign(window,{get state(){return state;},get game(){return game;},
  get enemies(){return enemies;},get baseAlive(){return baseAlive;},saveSurvivalSnapshot,readSurvivalSnapshot,clearSurvivalSnapshot,restoreSurvivalSnapshot});

/* v5.0.0：自动化、无障碍与诊断共用的权威状态出口。 */
window.render_game_to_text=()=>JSON.stringify({
  version:GAME_VERSION,
  construction:serializeConstruction(),
  coordinateSystem:"origin at map center; +x east/right; +z south/down; +y up; world units",
  mode:ACTIVE_MODE.key,
  state,
  wave:game.wave,difficulty:game.difficultyId||"normal",difficultyMultiplier:game.difficultyMultiplier||1,
  timeDifficulty:{elapsed:game.survivalElapsed||0,damage:survivalPressureMultiplier(),health:survivalPressureMultiplier()},
  waveDeadline:{elapsed:game.waveElapsed||0,remaining:Math.max(0,120-(game.waveElapsed||0)),activeLimit:SURVIVAL_ACTIVE_LIMIT},
  waveCounts:{remaining:Math.max(0,game.enemiesToSpawn||0)+activeEnemyCount(),active:activeEnemyCount(),queued:Math.max(0,game.enemiesToSpawn||0)},
  waveTransition:game.waveTransition?{nextWave:game.waveTransition.nextWave,remaining:+game.waveTransition.remaining.toFixed(3),ready:game.waveTransition.ready}:null,
  waveProfile:game.wave>0?SurvivalSystem.waveProfile(game.wave):null,
  resources:{gold:+game.gold.toFixed(2),population:[game.popUsed,game.popMax]},
  gate:{alive:baseAlive,hp:+game.gateHp.toFixed(2),maxHp:+game.gateMaxHp.toFixed(2)},
  player:player?{
    present:true,alive:player.alive,hp:player.hp,maxHp:player.maxHp,
    x:+player.group.position.x.toFixed(3),y:+player.group.position.y.toFixed(3),z:+player.group.position.z.toFixed(3),
    moveTarget:player.moveTarget?{x:+player.moveTarget.x.toFixed(3),z:+player.moveTarget.z.toFixed(3)}:null,
    attackTarget:!!(player.attackTarget&&player.attackTarget.alive),
  }:null,
  enemies:enemies.filter(e=>e.alive&&isPositionVisible(e.group.position)).slice(0,80).map(e=>({
    type:e.type,boss:e.boss,hp:+e.hp.toFixed(2),maxHp:+e.maxHp.toFixed(2),
    x:+e.group.position.x.toFixed(3),y:+e.group.position.y.toFixed(3),z:+e.group.position.z.toFixed(3),
  })),
  friendlyUnits:friendlyUnits.filter(unit=>unit.alive).map(unit=>({type:unit.type,hp:+unit.hp.toFixed(2),maxHp:unit.maxHp,
    command:unit.command,x:+unit.group.position.x.toFixed(3),y:+unit.group.position.y.toFixed(3),z:+unit.group.position.z.toFixed(3),
    moveTarget:unit.moveTarget?{x:+unit.moveTarget.x.toFixed(3),z:+unit.moveTarget.z.toFixed(3)}:null,
    route:{available:!!unit.routeAvailable,remaining:(unit.routeWaypoints||[]).length}})),
  upgradeJobs:game.upgradeJobs||[],heroArchive:heroArchive(),doctrine:game.doctrine||null,doctrineTech:game.doctrineTech||{},heroHubs:heroHubs.map(h=>({x:h.x,z:h.z,hp:h.hp})),
  heroTank:heroTank&&heroTank.alive?{type:heroTank.type,hp:+heroTank.hp.toFixed(2),maxHp:heroTank.maxHp}:null,
  structures:{research:researchInstitutes.length,factories:heavyFactories.map(factory=>({queue:factory.queue.map(item=>item.typeId),progress:+factory.progress.toFixed(3)})),turrets:builtTurrets.length,beacons:visionBeacons.length,walls:wallMeta.size,
    mines:goldMines.map((mine)=>({level:mine.level,income:SurvivalSystem.mineIncome(mine.level)})),incomePopups:mineIncomePopups.map((popup)=>popup.element.textContent)},
  vision:{sources:currentVisionSources().length,visibleEnemies:enemies.filter(e=>e.alive&&isPositionVisible(e.group.position)).length,fogActive:ACTIVE_MODE.key==="survival"&&visionFogSurfaces.length>0},
  atmosphere:{bloodMist:bloodMistSurfaces.map((surface)=>+surface.material.opacity.toFixed(3)),distanceFog:!!scene.fog},
  research:{...game.tech},breakthroughs:{...game.breakthroughs},researchTier:game.researchTier||0,mineLimit:mineUnlockedCount(),
  selected:wc3Sel?{kind:wc3Sel.kind,count:wc3Selection.length}:null,
  terrain:player?{height:+heightAt(player.group.position.x,player.group.position.z).toFixed(3)}:null,
  performance:{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles},
  collision:{...gameplayCollisionStats},
});

/* 固定 60Hz 推进，复用正式 stepGame；同步执行期间 RAF 不会插入额外帧。 */
window.advanceTime=(ms)=>{
  const steps=Math.max(1,Math.round(Math.max(0,ms)/(1000/60)));
  const dt=1/60;
  const realNow=performance.now.bind(performance);
  const originalNow=performance.now;
  let virtualNow=realNow();
  /* 自动化快进必须让所有基于时钟的战斗逻辑看到同一游戏时间，
     不能只给 stepGame 传虚拟 now 而让 spawnFlash/EMP/无敌帧仍读现实时间。 */
  performance.now=()=>virtualNow;
  try{
    for(let i=0;i<steps;i++){
      virtualNow+=1000/60;
      stepGame(dt,virtualNow);
    }
  }finally{performance.now=originalNow;}
  updateCamera(dt);
  renderer.render(scene,camera);
  lastT=realNow();
};

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

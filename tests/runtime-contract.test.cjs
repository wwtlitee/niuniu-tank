// Completed-building fixtures use the factory directly; construction-runtime covers issued orders.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const SurvivalSystemForTests = require("../js/survival-system.js");

const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
};

let server;
let browser;
let baseUrl;

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(ROOT, relative);
    if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code || "error");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openSurvival() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${baseUrl}/?mode=survival&autotest=1`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, null, { timeout: 40_000 });
  return page;
}

test("正式游玩不把钱包扩展注入异常显示在游戏画面", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error",{
      message:"Uncaught TypeError: r is not a function",
      filename:"solana.js",
      error:new TypeError("r is not a function"),
    }));
    return {errorBox:document.getElementById("errbox")?.textContent||null,title:document.title};
  });
  await page.close();
  assert.equal(result.errorBox,null,"扩展注入异常只能进入开发者控制台，不能覆盖游戏画面");
  assert.doesNotMatch(result.title,/^ERR:/,"扩展注入异常不能篡改游戏标题");
});

test("重工厂生产队列显示在独立生产栏而不挤入命令卡", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const dock=document.getElementById("wc3dock");
    const queue=document.getElementById("factoryQueueDock");
    return {exists:!!queue,order:queue&&[...dock.children].indexOf(queue),minimap:[...dock.children].indexOf(document.getElementById("mmDock")),cmd:[...dock.children].indexOf(document.getElementById("cmdWrap"))};
  });
  await page.close();
  assert.equal(result.exists,true,"底部 HUD 必须提供独立生产队列栏");
  assert.ok(result.order>=0&&result.order!==result.cmd,"生产队列应独立于命令卡容器");
});

test("生存模式血迹常驻且不再生成头颅肢体尸块", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    state=STATE.PLAYING;game.wave=10;
    spawnCorpseRemains(new THREE.Vector3(0,0,0),false,.5);
    const before=corpseDecals[corpseDecals.length-1];
    const childCount=before?.root?.children?.length||0;
    let flesh=0,blood=0;
    before?.root?.traverse((object)=>{
      if(!object.isMesh)return;
      if(object.userData&&object.userData.blood)blood++;
      else flesh++;
    });
    for(let i=0;i<3600;i++)updateCorpseDecals(1/60);
    return {alive:corpseDecals.includes(before),childCount,flesh,blood,drops:before?.pieces?.length||0,scale:before?.root?.scale?.x||0};
  });
  await page.close();
  assert.equal(result.alive,true,"门口血迹不能按几十秒自动消失");
  assert.ok(result.blood>=3,"死亡应留下基础地面血迹");
  assert.equal(result.flesh,0,"不得再生成头颅和肢体");
  assert.equal(result.drops,0,"不得生成空中喷血或散落血滴");
  assert.equal(result.scale,.5,"血迹尺寸必须跟随尸体比例缩放");
});

test("受击不再生成空中喷血", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    particles.splice(0);
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    spawnEnemy("normal",false);
    const enemy=enemies[0],before=particles.length;
    damageEnemy(enemy,1,{source:"turret",hitDirection:new THREE.Vector3(1,0,0),hitPoint:enemy.group.position.clone()});
    const drops=particles.slice(before).filter((particle)=>particle.color.r>particle.color.g*2&&particle.color.r>particle.color.b*2);
    return {count:drops.length};
  });
  await page.close();
  assert.equal(result.count,0,"受击只保留死亡后的地面血迹");
});

test("受击血效不创建独立血线绘制对象", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    spawnEnemy("normal",false);
    const enemy=enemies[0];
    for(let i=0;i<120;i++)damageEnemy(enemy,0.01,{hitDirection:new THREE.Vector3(1,0,0)});
    return {bloodParticles:particles.filter((particle)=>particle.blood).length,batches:scene.children.filter((child)=>child.userData?.bloodStreakBatch).length};
  });
  await page.close();
  assert.equal(result.bloodParticles,0,"受击不能生成血液粒子");
  assert.equal(result.batches,0,"不再创建血线批次");
});

test("生存模式隐藏测试键可加金并跳转下一波", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;game.gold=123;game.wave=2;game.enemiesToSpawn=0;
    spawnEnemy("normal",false);
    window.dispatchEvent(new KeyboardEvent("keydown",{code:"BracketLeft"}));
    const gold=game.gold;
    window.dispatchEvent(new KeyboardEvent("keydown",{code:"BracketRight"}));
    return {gold,wave:game.wave,enemies:enemies.length,queued:game.enemiesToSpawn};
  });
  await page.close();
  assert.equal(result.gold,10123,"[ 必须增加 10000 金币");
  assert.equal(result.wave,3,"] 必须进入下一波");
  assert.equal(result.enemies,0,"] 跳波时必须清除当前波残敌");
  assert.ok(result.queued>0,"跳转后的新波必须按正式波次入口排入敌人");
});

test("高密度尸潮的死亡残骸有上限且会降低单体细节", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;enemies.length=130;
    for(let i=0;i<240;i++)spawnCorpseRemains(new THREE.Vector3(i%12,0,Math.floor(i/12)),false,.5);
    return {roots:corpseDecals.length,children:corpseDecals.reduce((sum,item)=>sum+item.root.children.length,0)};
  });
  await page.close();
  assert.ok(result.roots<=180,`死亡残骸根节点不能无限累积：${result.roots}`);
  assert.ok(result.children<=720,`高密度尸潮应使用低细节残骸：${result.children}`);
});

test("超大尸潮仅对远景模型启用渲染预算且不减少敌人数", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;game.enemiesToSpawn=0;
    for(let i=0;i<740;i++){
      spawnEnemy("normal",false);
      const enemy=enemies.at(-1);enemy.spawnFlash=0;
      enemy.group.position.set((i%24-12)*3,0,(Math.floor(i/24)-12)*3);
    }
    updateEnemies(1/60);
    updateCrowdLod();return {total:enemies.length,visible:enemies.filter((enemy)=>enemy.group.visible).length};
  });
  await page.close();
  assert.equal(result.total,740,"渲染预算不能删除或减少敌人实体");
  assert.ok(result.visible<result.total,`740 只尸潮应降低远景绘制量：${result.visible}/${result.total}`);
});

test("生存模式重工厂可连续生产多辆坦克并占用人口", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const factory={queue:[]};heavyFactories.push(factory);game.gold=9999;game.popMax=99;game.popUsed=0;
    const first=queueFactoryUnit(factory,"light");
    const second=queueFactoryUnit(factory,"heavy");
    const queuedPop=game.popUsed;
    heavyFactories.pop();
    return {first,second,queuedPop,queue:factory.queue.length};
  });
  await page.close();
  assert.deepEqual(result,{first:true,second:true,queuedPop:7,queue:2});
});

test("选中建筑后命令卡 X 和键盘 X 都能拆除", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    game.gold=9999;openWc3Build();
    const turretIndex=shopList().findIndex((item)=>item.id==="turret"),turretBuild=shopList()[turretIndex];
    const mineIndex=shopList().findIndex((item)=>item.id==="goldmine"),mineBuild=shopList()[mineIndex];
    const E=ACTIVE_MODE.enclosure;
    const firstCell=(build)=>{for(let z=E.z0+1;z<E.z1-2;z++)for(let x=E.x0+1;x<E.x1-2;x++)if(footprintPlaceable({x,z},build))return {x,z};return null;};
    const turretCell=firstCell(turretBuild);
    selectBuild(turretIndex);ghost.visible=true;const turretCenter=footprintCenter(turretCell,turretBuild);placeBuildingImmediately(turretCenter.x,turretCenter.z);
    const turret=builtTurrets[0];
    wc3Select("turret",turret);wc3RenderSel();renderCmdCard();
    const xButton=[...document.querySelectorAll("#cmdcard .cmdBtn")].find((node)=>node.textContent.includes("拆除"));
    xButton?.dispatchEvent(new MouseEvent("pointerdown",{bubbles:true,button:0}));
    const turretGone=!builtTurrets.includes(turret);
    const mineCell=firstCell(mineBuild);
    selectBuild(mineIndex);ghost.visible=true;const mineCenter=footprintCenter(mineCell,mineBuild);placeBuildingImmediately(mineCenter.x,mineCenter.z);
    const mine=goldMines[0];
    wc3Select("goldmine",mine);wc3RenderSel();renderCmdCard();
    window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyX",key:"x",bubbles:true}));
    return {xButton:!!xButton,turretGone,mineGone:!goldMines.includes(mine),turretCell:{cx:turret.cx,cz:turret.cz,x:turret.x,z:turret.z}};
  });
  await page.close();
  assert.equal(result.xButton,true,"选中建筑必须出现拆除命令");
  assert.equal(result.turretGone,true,`点击命令卡 X 必须拆掉炮台：${JSON.stringify(result.turretCell)}`);
  assert.equal(result.mineGone,true,"键盘 X 必须拆掉当前选中建筑");
});

test("坦克可拆除并释放人口", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const unit={alive:true,type:"light",name:"轻型坦克",population:2,hp:40,maxHp:100,group:new THREE.Group(),x:0,z:0};
    scene.add(unit.group);friendlyUnits.push(unit);game.popUsed=2;wc3Selection=[{kind:"unit",ref:unit}];wc3Sel=wc3Selection[0];
    const ok=sellSelectedSingle();
    return {ok,removed:!friendlyUnits.includes(unit),popUsed:game.popUsed};
  });
  await page.close();
  assert.deepEqual(result,{ok:true,removed:true,popUsed:0});
});

test("生存地图为 24 格并保留 1 格宽峡谷进攻道", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const C=ACTIVE_MODE.canyon,E=ACTIVE_MODE.enclosure,R=ACTIVE_MODE.ramp,width=C.z1-C.z0+1;
    let canyonEmpty=0,flankWall=0,plateau=0,carved=0;
    for(let z=C.z0;z<=C.z1;z++)for(let x=C.x0;x<=C.x1;x++)if(grid[z][x]===T_EMPTY||grid[z][x]===T_RAMP)canyonEmpty++;
    for(let x=C.x0;x<=C.x1;x++){
      const north=inMap(x,C.z0-1)?grid[C.z0-1][x]:null,south=inMap(x,C.z1+1)?grid[C.z1+1][x]:null;
      if(north===T_STEEL||north===T_PLATEAU)flankWall++;
      if(south===T_STEEL||south===T_PLATEAU)flankWall++;
    }
    for(let z=E.z0;z<=E.z1;z++)for(let x=E.x0;x<=E.x1;x++){
      if(grid[z][x]===T_PLATEAU||grid[z][x]===T_BASE)plateau++;
      if(x>=C.x0&&z>=C.z0&&z<=C.z1&&(grid[z][x]===T_EMPTY||grid[z][x]===T_RAMP))carved++;
    }
    const eastX=C.x1+2,openEast=inMap(eastX,C.z0)&&grid[C.z0][eastX]===T_EMPTY;
    return {grid:GRID,width,canyonEmpty,flankWall,plateau,carved,ramp:R,canyon:C,openEast,span:C.x1-C.x0+1,spawns:ACTIVE_MODE.spawns,rampHeight:terrainSurface.heightAt(cellCenter(R.col,R.row).x,cellCenter(R.col,R.row).z)};
  });
  await page.close();
  assert.equal(result.grid,24);
  assert.equal(result.width,1,"峡谷宽度必须是 1 格");
  assert.equal(result.span,3,"峡谷只允许切进高台 3 格，外面不得再拉长廊");
  assert.equal(result.openEast,true,"谷口外面必须是平地，不能继续封成钢墙高台");
  assert.equal(result.spawns.length,2);
  assert.ok(result.canyonEmpty>=3,"峡谷必须贯通到坡口");
  assert.ok(result.flankWall>=result.width*2,"峡谷两侧必须是高台或崖壁");
  assert.ok(result.ramp.col<result.canyon.x0,"坡口必须后移到峡谷西端，不能贴在高台外沿");
  assert.ok(result.carved>=3&&result.carved<=4,"峡谷必须按 1×3 切入高台");
  assert.ok(result.plateau>=55&&result.plateau<=160,"高台面积应约为旧台面的一半");
});

test("多辆坦克同目标移动只计算一次友军流场", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const start=cellCenter(ACTIVE_MODE.base.col,ACTIVE_MODE.base.row-2);
    const target=cellCenter(ACTIVE_MODE.ramp.col+3,ACTIVE_MODE.ramp.row);
    const before=friendlyRouteComputeCount;
    const units=[];
    for(let i=0;i<12;i++){
      units.push(createFriendlyUnit("light",{x:start.x+(i%4)*1.1,z:start.z+Math.floor(i/4)*1.1}));
    }
    wc3SetSelection(units.map((ref)=>({kind:"unit",ref})));
    issueSelectionCommand("move",target);
    return {computes:friendlyRouteComputeCount-before,routed:units.filter((unit)=>unit.routeWaypoints.length).length};
  });
  await page.close();
  assert.ok(result.computes<=2,`12 辆同目标不应各算一遍全图流场，实际 ${result.computes} 次`);
  assert.equal(result.routed,12);
});

test("丧尸皮肤统一青绿色且移动动画不再驱动上肢乱摆", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const built=_buildEnemyGroup("normal",false,ENEMY_TYPES.normal),colors={},walkTracks=built.actions.walk?built.actions.walk.getClip().tracks.map((track)=>track.name):[];
    built.animationRoot?.traverse((object)=>{if(object.isMesh&&object.name)colors[object.name.toLowerCase()]=object.material?.color?.getHexString?.()||null;});
    let textured=false,headTextured=false,armsTextured=false;built.animationRoot?.traverse((object)=>{if(object.isMesh&&object.material?.map){textured=true;const meshName=object.name.toLowerCase();if(meshName==="head")headTextured=true;if(meshName.includes("arm"))armsTextured=true;}});
    return {colors,head:colors.head||null,torso:colors.torso||null,upperBodyAnimated:walkTracks.some((name)=>/(arm|forearm|chest|spine)/i.test(name)),textured,headTextured,armsTextured};
  });
  await page.close();
  assert.notEqual(result.head,"ffffff","丧尸头部不能继续使用人类白色材质");
  assert.equal(result.upperBodyAnimated,false,"奔跑时上肢轨道必须移除，双手由固定前举姿态持续接管");
  assert.equal(result.textured,true,"丧尸必须保留原始衣物与头发贴图");
  assert.equal(result.headTextured,false,"丧尸头部不能继续挂人类肤色贴图");
  assert.equal(result.armsTextured,false,"丧尸手臂不能继续挂人类肤色贴图");
  assert.ok(Object.values(result.colors||{}).some((value)=>/^[0-9a-f]{6}$/i.test(value||"")),"丧尸需要可验证的染色材质");
  assert.ok(Object.values(result.colors||{}).every((value)=>value==="294b43"),`尸潮材质必须统一为压暗青绿色：${JSON.stringify(result.colors)}`);
});

test("同类尸潮生成时拥有受控体型随机区间", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
    game.wave = 1;
    for (let index = 0; index < 24; index++) spawnEnemy("normal", false);
    return enemies.map((enemy) => enemy.visualRadius);
  });
  await page.close();
  assert.ok(result.every((radius) => radius >= .65*.88 && radius <= .65*1.12), `体型随机必须在 0.88—1.12 区间：${JSON.stringify(result)}`);
  assert.ok(Math.max(...result) - Math.min(...result) > 0.05, `同批尸潮不能全部同尺寸：${JSON.stringify(result)}`);
});

test("人口房多选时使用统一批量升级逻辑", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const a={level:1},b={level:1};
    wc3Selection=[{kind:"house",ref:a},{kind:"house",ref:b}];wc3Sel=wc3Selection[0];game.gold=999999;
    const item=structureUpgradeItem("house",a,true);
    return {name:item.name,price:item.price};
  });
  await page.close();
  assert.equal(result.name,"批量升级");
  assert.ok(result.price>0,"人口房多选应生成批量升级命令");
});

test("瞬时弹体清理必须释放独立几何体和材质", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    let geometryDisposed = false;
    let materialDisposed = false;
    mesh.geometry.dispose = () => { geometryDisposed = true; };
    mesh.material.dispose = () => { materialDisposed = true; };
    disposeTransientObject3D(mesh);
    return { geometryDisposed, materialDisposed };
  });
  await page.close();
  assert.deepEqual(result, { geometryDisposed: true, materialDisposed: true });
});

test("生存模式普通僵尸始终使用 Survivors 模型而不回退旧怪物模型", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    state = STATE.PLAYING;
    game.wave = 3;
    const types = ["normal", "fast", "heavy", "sniper", "lifesteal", "siege", "elite"];
    types.forEach((type) => spawnEnemy(type, false));
    spawnEnemy(null, true);
    return enemies.slice(-types.length-1).map((enemy) => ({
      type: enemy.type,
      boss: !!enemy.boss,
      asset: enemy.animationRoot?.userData?.assetName || null,
      variant: enemy.variantId || null,
      giantScale: enemy.group?.userData?.giantZombieScale || 1,
    }));
  });
  await page.close();
  assert.ok(result.every((row) => row.asset === "survivor-zombie"), JSON.stringify(result));
  const boss=result.find((row)=>row.boss);
  assert.ok(boss&&boss.giantScale>=2.3,"Boss 未达到巨型体型: "+JSON.stringify(boss));
});

test("主菜单提供新游戏和继续游戏入口且无存档时禁用继续", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    clearSurvivalSnapshot();
    backToMenu();
    const continueButton=document.getElementById("continueBtn");
    return {newGame:!!document.getElementById("newGameBtn"),continueGame:!!continueButton,disabled:!!continueButton?.disabled};
  });
  await page.close();
  assert.deepEqual(result,{newGame:true,continueGame:true,disabled:true});
});

test("WAR3 右键移动命令执行时不抛异常", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    if (!player) spawnPlayer();
    player.moveTarget = {
      x: player.group.position.x + TILE,
      z: player.group.position.z,
    };
    try {
      updatePlayer(1 / 60);
      return { error: null };
    } catch (error) {
      return { error: String(error && (error.message || error)) };
    } finally {
      player.moveTarget = null;
    }
  });
  await page.close();
  assert.equal(result.error, null, `右键移动不应崩溃，实际错误：${result.error}`);
});

test("生存模式初始金币提供首波建造缓冲且不改变人口", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const payload = JSON.parse(window.render_game_to_text());
    return { gold: payload.resources.gold, population: payload.resources.population };
  });
  await page.close();
  assert.equal(result.gold, 460);
  assert.deepEqual(result.population, [0, 12]);
});

test("友军坦克同点出生后会按实体半径分离且不再重叠", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    friendlyUnits.splice(0).forEach((unit) => scene.remove(unit.group));
    const origin = cellCenter(ACTIVE_MODE.canyon.x0+4, ACTIVE_MODE.canyon.z0);
    const units = [
      createFriendlyUnit("light", origin),
      createFriendlyUnit("medium", origin),
      createFriendlyUnit("heavy", origin),
    ];
    for (let frame = 0; frame < 180; frame++) applyGameplayCollisions(1 / 60);
    let minimumClearance = Infinity;
    for (let left = 0; left < units.length; left++) for (let right = left + 1; right < units.length; right++) {
      const distance = units[left].group.position.distanceTo(units[right].group.position);
      minimumClearance = Math.min(minimumClearance, distance - units[left].radius - units[right].radius);
    }
    return { minimumClearance, overlaps: gameplayCollisionStats.overlaps };
  });
  await page.close();
  assert.ok(result.minimumClearance >= -0.08, `友军仍重叠 ${result.minimumClearance}`);
  assert.equal(result.overlaps, 0);
});

test("坦克不能穿过建筑占地、树木和实体路灯", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const cell = { x: 2, z: 2 }, center = cellCenter(2, 2), key = idx(2, 2);
    structCells.add(key);
    const buildingBlocked = blockedForTank(center.x, center.z, 1.35, heightAt(center.x, center.z), false, true);
    structCells.delete(key);
    const previous = grid[cell.z][cell.x]; grid[cell.z][cell.x] = T_TREE;
    const treeBlocked = blockedForTank(center.x, center.z, 1.35, heightAt(center.x, center.z), false, true);
    const treeFlowBlocked = !passableForFlow(cell.x, cell.z);
    grid[cell.z][cell.x] = previous;
    const lamp = fixedVisionLights[0];
    const lampBlocked = lamp ? blockedByFixedCollider(lamp.x, lamp.z, 1.2) : false;
    return { buildingBlocked, treeBlocked, treeFlowBlocked, lampBlocked };
  });
  await page.close();
  assert.deepEqual(result, { buildingBlocked: true, treeBlocked: true, treeFlowBlocked: true, lampBlocked: true });
});

test("僵尸与友军接触后不会穿模并按攻击间隔造成伤害", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const origin=cellCenter(ACTIVE_MODE.canyon.x0+4,ACTIVE_MODE.canyon.z0),unit=createFriendlyUnit("medium",origin);
    game.wave=1;spawnEnemy("normal",false);const enemy=enemies[enemies.length-1];
    enemy.group.position.copy(unit.group.position);enemy.spawnFlash=0;enemy.bodyAttackCd=0;
    const before=unit.hp;applyGameplayCollisions(1/60);
    return {damage:before-unit.hp,distance:Math.hypot(enemy.group.position.x-unit.group.position.x,
      enemy.group.position.z-unit.group.position.z),desired:(enemy.radius+unit.radius)*.96};
  });
  await page.close();
  assert.ok(result.damage>0,JSON.stringify(result));
  assert.ok(result.distance>0&&result.distance>=result.desired*.7,JSON.stringify(result));
});

test("僵尸拆毁阻路建筑后释放占地和住房人口", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const cell={x:2,z:2},cellIndex=idx(cell.x,cell.z),group=new THREE.Group();
    group.position.set(cellCenter(cell.x,cell.z).x,0,cellCenter(cell.x,cell.z).z);scene.add(group);
    const record={group,kind:"house",hp:6,maxHp:6,popProvided:6};reserveFootprint(record,[cell]);
    builtHouses.push(record);game.popMax+=6;
    const before=game.popMax,hit=damageOwnedStructureAtCell(cellIndex,10);
    return {hit,removed:!builtHouses.includes(record),released:!structCells.has(cellIndex),popDelta:before-game.popMax};
  });
  await page.close();
  assert.deepEqual(result,{hit:true,removed:true,released:true,popDelta:6});
});

test("战斗音效使用按口径区分的录音声库", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => ({
    profile: sfx.profile,
    hasNoiseLayer: typeof combatNoiseBurst === "function",
    hasCannonLayer: typeof playCannonReport === "function",
  }));
  await page.close();
  assert.deepEqual(result.profile.calibers, ["small", "medium", "large", "huge"]);
  assert.deepEqual(result.profile.layers, ["recording", "impact", "tail"]);
  assert.equal(result.hasNoiseLayer, true);
  assert.equal(result.hasCannonLayer, true);
});

test("尸潮近战和砸门使用独立音效入口", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => ({
    zombie: typeof sfx.zombie === "function",
    gate: typeof sfx.gate === "function",
  }));
  await page.close();
  assert.deepEqual(result, { zombie: true, gate: true });
});

test("生存模式开局不赠送坦克，显示部署提示并隐藏空命令板", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => ({
    playerPresent: !!(player && player.alive && player.group),
    selectionKind: wc3Sel && wc3Sel.kind,
    commandCardVisible: getComputedStyle(document.getElementById("cmdcard")).display !== "none",
    idleVisible: getComputedStyle(document.getElementById("selectionIdle")).display !== "none",
  }));
  await page.close();
  assert.equal(result.playerPresent, false);
  assert.equal(result.selectionKind, null);
  assert.equal(result.commandCardVisible, false);
  assert.equal(result.idleVisible, true);
});

test("B 选中基地后可用鼠标选择具体建筑", async () => {
  const page = await openSurvival();
  await page.keyboard.press("b");
  const goldMineButton = page.locator(".cmdBtn").filter({ hasText: "金矿" });
  await goldMineButton.click();
  const result = await page.evaluate(() => ({
    buildMode: wc3BuildMode,
    state,
    selectedBuild: shopList()[buildSel] && shopList()[buildSel].id,
    ghostReady: !!ghost,
  }));
  await page.close();
  assert.equal(result.buildMode, true);
  assert.equal(result.state, 5);
  assert.equal(result.selectedBuild, "goldmine");
  assert.equal(result.ghostReady, true);
});

test("生存开场镜头兼顾居中基地与谷口高台", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const base=baseGroup.position;
    const ramp=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row);
    const start=ACTIVE_MODE.startFocus;
    const expected=cellCenter(start.col,start.row);
    return {
      focus:{x:+camFocus.x.toFixed(2),z:+camFocus.z.toFixed(2)},
      expected:{x:+expected.x.toFixed(2),z:+expected.z.toFixed(2)},
      fromBase:Math.hypot(camFocus.x-base.x,camFocus.z-base.z),
      fromRamp:Math.hypot(camFocus.x-ramp.x,camFocus.z-ramp.z),
    };
  });
  await page.close();
  assert.equal(result.focus.x,result.expected.x);
  assert.equal(result.focus.z,result.expected.z);
  assert.ok(result.fromBase>=6&&result.fromBase<=16,`开场应兼顾中部基地：${JSON.stringify(result)}`);
  assert.ok(result.fromRamp<16,`开场应落在谷口附近：${JSON.stringify(result)}`);
});

test("准备期开商店后关闭不会把已进行的波次打回第一波", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    selectBaseForCommand(true);
    const duringPrep={state,build:wc3BuildMode,wave:game.wave};
    game.prepTime=0.05;
    window.advanceTime(200);
    const afterPrep={state,wave:game.wave,build:wc3BuildMode};
    game.wave=5;game.enemiesToSpawn=12;
    $("waveInfo").firstChild.textContent="WAVE 5 · 首领";
    closeWc3Build();
    window.advanceTime(200);
    return {duringPrep,afterPrep,closed:{state,wave:game.wave,toSpawn:game.enemiesToSpawn,label:$("waveInfo").firstChild.textContent}};
  });
  await page.close();
  assert.equal(result.duringPrep.build,true);
  assert.equal(result.afterPrep.wave,1);
  assert.equal(result.closed.wave,5,"关商店不得把第 5 波打回第 1 波");
  assert.notEqual(result.closed.state,7,"战斗开始后关商店不得回到准备期");
  assert.match(result.closed.label,/WAVE 5/);
});

test("startWave 拒绝把生存模式波次回退", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    startWave(4);
    const before=game.wave;
    startWave(1);
    return {before,after:game.wave,label:$("waveInfo").firstChild.textContent};
  });
  await page.close();
  assert.equal(result.before,4);
  assert.equal(result.after,4);
  assert.match(result.label,/WAVE 4/);
});

test("B 只打开基地建造命令卡且不改变当前镜头", async () => {
  const page = await openSurvival();
  const before = await page.evaluate(() => {
    camFocus.set(18, 0, -22);
    return {x:camFocus.x,z:camFocus.z};
  });
  await page.keyboard.press("b");
  const result = await page.evaluate(() => ({after:{x:camFocus.x,z:camFocus.z},buildMode:wc3BuildMode,kind:wc3Sel&&wc3Sel.kind}));
  await page.close();
  assert.deepEqual(result.after,before,"B 不能再承担寻找或聚焦基地的功能");
  assert.equal(result.buildMode,true);
  assert.equal(result.kind,"base");
});

test("生存模式删除距离雾但继续保留战争迷雾", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => ({
    distanceFog:scene.fog,
    fogCanvas:!!document.getElementById("survivalFogCanvas"),
    fogPlanes:scene.children.filter((child)=>child.userData&&child.userData.visionFog).length,
  }));
  await page.close();
  assert.equal(result.distanceFog,null,"最大缩放时不得再由 Three.js 距离雾遮住地图");
  assert.equal(result.fogCanvas,true);
  assert.ok(result.fogPlanes>=1,"战争迷雾仍需存在");
});

test("炮台持续锁定有效目标并向移动方向预判射击", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    builtTurrets.splice(0).forEach((item)=>scene.remove(item.group));
    enemies.splice(0).forEach((item)=>scene.remove(item.group));
    bullets.splice(0).forEach((item)=>scene.remove(item.mesh));
    const group=makeTurretMesh("rapid");group.position.set(0,heightAt(0,0),0);scene.add(group);
    const turret={group,kind:"rapid",turretKey:"rapid",level:0,cx:24,cz:24,range:60,cd:0,fireCd:.5,dmg:3,blast:0,hp:40,maxHp:40};
    builtTurrets.push(turret);
    game.wave=1;spawnEnemy("normal",false);spawnEnemy("normal",false);
    const first=enemies[0],second=enemies[1];
    first.spawnFlash=0;second.spawnFlash=0;
    first.group.position.set(8,0,0);second.group.position.set(12,0,0);
    first.velocity=new THREE.Vector3(0,0,4);second.velocity=new THREE.Vector3();
    _visionSourceCache=[];redrawVisionFog();
    updateBuiltTurrets(.1);
    const initialLock=turret.lockTarget===first,leadZ=bullets[0]&&bullets[0].vel.z;
    second.group.position.set(2,0,0);turret.cd=1;updateBuiltTurrets(.1);
    const retained=turret.lockTarget===first;
    first.alive=false;updateBuiltTurrets(.1);
    return {initialLock,retained,reacquired:turret.lockTarget===second,leadZ};
  });
  await page.close();
  assert.equal(result.initialLock,true);
  assert.equal(result.retained,true,"出现更近敌人时不得跳目标");
  assert.equal(result.reacquired,true,"锁定目标失效后必须重新索敌");
  assert.notEqual(result.leadZ,0,"移动目标的炮弹必须保留有效的三维预判方向");
});

test("移动中的远程丧尸不得向基地误开火", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    bullets.splice(0).forEach((bullet)=>scene.remove(bullet.mesh));
    game.wave=1;state=STATE.PLAYING;
    spawnEnemy("sniper",false);
    const enemy=enemies[0];
    enemy.spawnFlash=0;enemy.cd=0;enemy.atGate=false;enemy.objectiveKind="base";
    enemy.group.position.set(8,0,0);
    updateEnemies(.1);
    return {bullets:bullets.filter((bullet)=>bullet.owner==="enemy").length,atGate:enemy.atGate};
  });
  await page.close();
  assert.equal(result.atGate,false,"测试敌人必须仍处于行进态");
  assert.equal(result.bullets,0,"远程丧尸只有抵达门前攻击位后才能开火");
});

test("研究院提供无限突破并实际提高金矿与升级上限", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const group=new THREE.Group();scene.add(group);
    const institute={group,hp:100,maxHp:100};researchInstitutes.push(institute);
    game.breakthroughs={mining:0,science:0,wall:0,turret:0};game.gold=1e9;
    wc3Select("research",institute);wc3RenderSel();renderCmdCard();
    const breakthroughNames=[...document.querySelectorAll("#cmdcard .cmdBtn .cn")].map((node)=>node.textContent).filter((name)=>name.includes("突破")||name.includes("扩张"));
    const miningCost=breakthroughCost("mining");upgradeBreakthrough("mining");
    const afterMining={level:game.breakthroughs.mining,limit:mineUnlockedCount(),spent:miningCost};
    game.breakthroughs.science=1;game.tech.defense=10;
    const extendedTechCost=techCost("defense");
    game.breakthroughs.wall=2;game.breakthroughs.turret=2;
    return {breakthroughNames,afterMining,extendedTechCost,wallCap:wallUnlockedMaxLevel(),turretCap:turretUnlockedMaxLevel()};
  });
  await page.close();
  assert.deepEqual(result.breakthroughNames,["采矿扩张","科技突破","巨岩突破","炮台突破"]);
  assert.deepEqual(result.afterMining,{level:1,limit:6,spent:125000});
  assert.ok(result.extendedTechCost>0,"科技突破后第11级必须仍可研究");
  assert.equal(result.wallCap,70);
  assert.equal(result.turretCap,15);
});

test("五座金矿达到初始上限后建造按钮禁用", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    game.breakthroughs={mining:0,science:0,wall:0,turret:0};
    goldMines.length=0;
    for(let index=0;index<5;index++)goldMines.push({group:new THREE.Group(),x:index,z:1,level:1});
    wc3Select("base",baseSelectionRef());wc3RenderSel();openWc3Build();renderCmdCard();
    const mine=[...document.querySelectorAll("#cmdcard .cmdBtn")].find((button)=>button.textContent.includes("金矿"));
    return {limit:mineUnlockedCount(),count:goldMines.length,disabled:mine&&mine.classList.contains("disabled")};
  });
  await page.close();
  assert.deepEqual(result,{limit:5,count:5,disabled:true});
});

test("建墙后金币恢复时无需重开菜单即可直接选择炮台", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    game.gold=20;openWc3Build();
    const wallIndex=shopList().findIndex((item)=>item.id==="wall"),wall=shopList()[wallIndex];
    selectBuild(wallIndex);ghost.visible=true;
    const C=ACTIVE_MODE.canyon,anchor={x:C.x0+2,z:C.z0},center=footprintCenter(anchor,wall);
    placeBuildingImmediately(center.x,center.z);
    game.gold=100;updateGoldUI();
    const turretButton=[...document.querySelectorAll("#cmdcard .cmdBtn")].find((button)=>button.textContent.includes("标准炮台"));
    turretButton?.click();
    return {buildMode:wc3BuildMode,state,gold:game.gold,selected:shopList()[buildSel]?.id||null,disabled:turretButton?.classList.contains("disabled")};
  });
  await page.close();
  assert.equal(result.buildMode,true);
  assert.equal(result.state,5);
  assert.equal(result.gold,100);
  assert.equal(result.disabled,false,"金币足够后炮台按钮必须立即解除灰态");
  assert.equal(result.selected,"turret","建墙后应保持建造面板并可直接改选炮台");
});

test("持续采矿刷新金币时命令卡按钮节点保持稳定并可完成真实点击", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    game.gold=100;openWc3Build();
    const findTurret=()=>[...document.querySelectorAll("#cmdcard .cmdBtn")]
      .find((button)=>button.textContent.includes("标准炮台"));
    const before=findTurret();
    for(let tick=0;tick<8;tick++){game.gold+=.2;updateGoldUI();}
    const after=findTurret();
    after?.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));
    after?.dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));
    after?.click();
    return {sameNode:before===after,selected:shopList()[buildSel]?.id||null,disabled:after?.classList.contains("disabled")};
  });
  await page.close();
  assert.equal(result.sameNode,true,"金币小数变化不得反复销毁正在点击的按钮节点");
  assert.equal(result.disabled,false);
  assert.equal(result.selected,"turret");
});

test("建墙后命令卡刷新发生在真实鼠标按压期间仍可选择炮台", async () => {
  const page = await openSurvival();
  await page.evaluate(() => {
    game.gold=120;openWc3Build();
    const wallIndex=shopList().findIndex((item)=>item.id==="wall"),wall=shopList()[wallIndex];
    selectBuild(wallIndex);ghost.visible=true;
    const C=ACTIVE_MODE.canyon,anchor={x:C.x0+2,z:C.z0},center=footprintCenter(anchor,wall);
    placeBuildingImmediately(center.x,center.z);
    game.gold=100;updateGoldUI();
  });
  const turretButton=page.locator("#cmdcard .cmdBtn").filter({hasText:"标准炮台"});
  const box=await turretButton.boundingBox();
  assert.ok(box,"标准炮台按钮应存在");
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.evaluate(() => {
    _cmdCardSignature="";
    renderCmdCard();
  });
  await page.mouse.up();
  const result=await page.evaluate(() => ({
    selected:shopList()[buildSel]?.id||null,
    buildMode:wc3BuildMode,
  }));
  await page.close();
  assert.equal(result.buildMode,true);
  assert.equal(result.selected,"turret","按钮在按压期间被刷新时也必须响应本次选择");
});

test("一级标准炮台击杀首波普通僵尸需要二到三发", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const hp=ENEMY_TYPES.normal.hp*SurvivalSystem.waveProfile(1).hpMultiplier;
    const perShot=TURRET_TYPES.turret.stats.dmg*SurvivalSystem.turretPressureMultiplier("normal",false);
    return {hp,perShot,shots:Math.ceil(hp/perShot)};
  });
  await page.close();
  assert.ok(result.shots>=2&&result.shots<=3,`首波普通僵尸应承受 2~3 发，当前 ${result.shots} 发（HP ${result.hp} / 单发 ${result.perShot}）`);
});

test("A 攻击移动会临时索敌且保留最终移动目标", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    if (!player) spawnPlayer();
    enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
    spawnEnemy("normal", false);
    const enemy = enemies[0];
    enemy.beam && scene.remove(enemy.beam);enemy.beam=null;
    enemy.group.position.set(player.group.position.x+5,player.group.position.y,player.group.position.z);
    const destination={x:player.group.position.x+30,z:player.group.position.z};
    player.moveTarget={...destination};player.attackMove=true;player.attackTarget=null;
    updatePlayer(1/60);
    return {
      acquired:player.attackTarget===enemy,
      destinationKept:!!player.moveTarget&&player.moveTarget.x===destination.x&&player.moveTarget.z===destination.z,
    };
  });
  await page.close();
  assert.equal(result.acquired,true);
  assert.equal(result.destinationKept,true);
});

test("重工厂命令卡按钮互不覆盖且不含内嵌队列条", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const factory={group:new THREE.Group(),hp:760,maxHp:760,queue:[{typeId:"light",remaining:3,total:7},{typeId:"light",remaining:7,total:7},{typeId:"medium",remaining:11,total:11}],progress:.51,rally:{x:4,z:10}};
    heavyFactories.push(factory);wc3Select("factory",factory);wc3RenderSel();renderCmdCard();
    const card=document.getElementById("cmdcard");
    const buttons=[...card.querySelectorAll(".cmdBtn")];
    const boxes=buttons.map((button)=>button.getBoundingClientRect());
    let overlap=false;
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];
      if(a.width<2||b.width<2)continue;
      if(a.right>b.left+1&&a.left<b.right-1&&a.bottom>b.top+1&&a.top<b.bottom-1)overlap=true;
    }
    heavyFactories.pop();
    return {
      overlap,
      inlineQueue:!!card.querySelector(".factoryQueue"),
      columns:getComputedStyle(card).gridTemplateColumns.split(" ").length,
      slots:card.querySelectorAll(".cmdBtn,.cmdSlot").length,
      buttons:buttons.length,
    };
  });
  await page.close();
  assert.equal(result.inlineQueue,false,"命令卡内不得再塞一条生产队列");
  assert.equal(result.columns,4);
  assert.equal(result.slots,12,"命令卡必须铺满 4×3 空槽");
  assert.equal(result.overlap,false,"命令按钮不得互相覆盖");
  assert.ok(result.buttons>=7);
});

test("B 打开建造命令卡用空槽补满且不会卡死", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    selectBaseForCommand(true);
    const card=document.getElementById("cmdcard");
    return {
      buttons:card.querySelectorAll(".cmdBtn").length,
      pads:card.querySelectorAll(".cmdSlot").length,
      total:card.children.length,
      buildMode:!!wc3BuildMode,
    };
  });
  await page.close();
  assert.equal(result.buildMode,true);
  assert.ok(result.buttons>=6,"建造卡应列出商店按钮");
  assert.equal(result.total,12,"必须正好 12 格，不能靠按钮数量死循环补槽");
  assert.equal(result.buttons+result.pads,12);
});

test("WAR3 底栏同时显示选中状态与四列命令卡", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    if (!player) spawnPlayer();
    wc3Select("player",player);wc3RenderSel();renderCmdCard();
    const commandStyle=getComputedStyle(document.getElementById("cmdcard"));
    const selectionStyle=getComputedStyle(document.getElementById("selPanel"));
    return {
      commandDisplay:commandStyle.display,
      commandColumns:commandStyle.gridTemplateColumns.split(" ").length,
      selectionDisplay:selectionStyle.display,
    };
  });
  await page.close();
  assert.equal(result.commandDisplay,"grid");
  assert.equal(result.commandColumns,4);
  assert.equal(result.selectionDisplay,"flex");
});

test("生存模式 WASD 不移动镜头而方向键继续平移镜头", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(() => {
    camFocus.set(4,0,6);
    const start={x:camFocus.x,z:camFocus.z};
    keys.KeyW=true;keys.KeyA=true;updateCamera(1);keys.KeyW=false;keys.KeyA=false;
    const afterWasd={x:camFocus.x,z:camFocus.z};
    keys.ArrowUp=true;updateCamera(1);keys.ArrowUp=false;
    return {start,afterWasd,afterArrow:{x:camFocus.x,z:camFocus.z}};
  });
  await page.close();
  assert.deepEqual(result.afterWasd,result.start,"WASD 必须完全退出生存模式镜头移动");
  assert.notDeepEqual(result.afterArrow,result.afterWasd,"方向键仍应允许平移镜头");
});

test("命令卡内容只由当前选中对象决定", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(() => {
    const texts=()=>[...document.querySelectorAll("#cmdcard .cmdBtn")].map((node)=>node.textContent.replace(/\s+/g,""));
    wc3ClearSel();renderCmdCard();const none=texts();
    wc3Select("base",{group:baseGroup,get hp(){return game.gateHp;},get maxHp(){return game.gateMaxHp;}});wc3RenderSel();renderCmdCard();const base=texts();
    const research={group:new THREE.Group(),hp:300,maxHp:300};researchInstitutes.push(research);
    wc3Select("research",research);wc3RenderSel();renderCmdCard();const institute=texts();
    const factory={group:new THREE.Group(),hp:760,maxHp:760,queue:[],progress:0,rally:{x:0,z:0}};heavyFactories.push(factory);
    wc3Select("factory",factory);wc3RenderSel();renderCmdCard();const factoryCard=texts();
    researchInstitutes.pop();heavyFactories.pop();
    return {none,base,institute,factoryCard,selected:wc3Sel&&wc3Sel.kind};
  });
  await page.close();
  assert.equal(result.none.length,0,"未选中时不得常驻基地建造内容");
  assert.ok(result.base.some((text)=>text.includes("标准炮台"))&&result.base.some((text)=>text.includes("研究院")),"主基地命令卡应承载建造");
  assert.ok(result.institute.some((text)=>text.includes("防御工程"))&&result.institute.some((text)=>text.includes("后勤工程")),"研究院命令卡应直接承载四线研究");
  assert.ok(result.factoryCard.some((text)=>text.includes("轻型坦克"))&&result.factoryCard.some((text)=>text.includes("维修车")),"重工厂命令卡应直接承载生产");
});

test("B T G 快捷键只选择对应建筑并切换上下文命令卡", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(() => {
    const dispatch=(code,key)=>window.dispatchEvent(new KeyboardEvent("keydown",{code,key,bubbles:true}));
    wc3ClearSel();dispatch("KeyB","b");const afterB={kind:wc3Sel&&wc3Sel.kind,state,buildMode:wc3BuildMode};
    closeWc3Build();
    const research={group:new THREE.Group(),hp:300,maxHp:300};researchInstitutes.push(research);
    dispatch("KeyT","t");const afterT={kind:wc3Sel&&wc3Sel.kind,state,techHidden:document.getElementById("tech").classList.contains("hidden")};
    dispatch("KeyG","g");const afterG={kind:wc3Sel&&wc3Sel.kind,state,page:typeof wc3CommandPage==="string"?wc3CommandPage:null};
    researchInstitutes.pop();
    return {afterB,afterT,afterG};
  });
  await page.close();
  assert.equal(result.afterB.kind,"base");
  assert.equal(result.afterB.buildMode,true);
  assert.equal(result.afterT.kind,"research");
  assert.equal(result.afterT.techHidden,true,"T 不得再打开独立科技弹窗");
  assert.equal(result.afterG.kind,"base");
  assert.equal(result.afterG.page,"gate");
});

test("同类巨岩墙多选后可按实际价格批量升级", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(() => {
    game.gold=10000;openWc3Build();
    const wallIndex=shopList().findIndex((item)=>item.id==="wall"),wall=shopList()[wallIndex];
    const C=ACTIVE_MODE.canyon,cells=[{x:C.x0+1,z:C.z0},{x:C.x0+2,z:C.z0}];
    for(const anchor of cells){selectBuild(wallIndex);ghost.visible=true;const center=footprintCenter(anchor,wall);placeBuildingImmediately(center.x,center.z);}
    const entries=cells.map((cell)=>({kind:"wall",ref:{x:cell.x,z:cell.z}}));
    wc3SetSelection(entries);wc3RenderSel();renderCmdCard();
    const beforeGold=game.gold;
    const button=[...document.querySelectorAll("#cmdcard .cmdBtn")].find((node)=>node.textContent.includes("批量升级"));
    button?.click();
    return {button:!!button,levels:cells.map((cell)=>wallLvAt(cell.x,cell.z)),spent:beforeGold-game.gold,count:wc3Selection.length};
  });
  await page.close();
  assert.equal(result.button,true,"多选同类墙必须出现批量升级命令");
  assert.deepEqual(result.levels,[2,2]);
  assert.ok(result.spent>0,"批量升级必须按成功目标逐个扣费");
  assert.equal(result.count,2);
});

test("双击金矿选择当前镜头内全部同类金矿而不选择镜头外目标", async () => {
  const page=await openSurvival();
  const clickPoint=await page.evaluate(() => {
    goldMines.splice(0).forEach((mine)=>scene.remove(mine.group));
    wc3ClearSel();camFocus.set(0,0,0);updateCamera(0);camera.updateMatrixWorld(true);
    const makeMine=(x,z)=>{
      const group=new THREE.Group();
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.6,2.6),new THREE.MeshStandardMaterial({color:0xd9ad32}));
      group.add(mesh);group.position.set(x,10,z);scene.add(group);
      const mine={group,x:Math.round((x+HALF)/TILE-.5),z:Math.round((z+HALF)/TILE-.5),level:1};goldMines.push(mine);return mine;
    };
    const visible=[makeMine(-5,0),makeMine(0,0),makeMine(5,0)];
    makeMine(500,500);
    scene.updateMatrixWorld(true);
    renderer.render(scene,camera);
    const projected=visible[1].group.position.clone().project(camera);
    const point={x:(projected.x+1)*innerWidth/2,y:(-projected.y+1)*innerHeight/2};
    return {...point,directKind:wc3PickAt(point.x,point.y)?.kind||null};
  });
  assert.equal(clickPoint.directKind,"goldmine",`测试点击点必须命中金矿：${JSON.stringify(clickPoint)}`);
  await page.mouse.dblclick(clickPoint.x,clickPoint.y,{delay:60});
  const result=await page.evaluate(() => ({
    count:wc3Selection.length,
    kinds:[...new Set(wc3Selection.map((entry)=>entry.kind))],
    selectedVisible:wc3Selection.every((entry)=>Math.abs(entry.ref.group.position.x)<=5),
    command:[...document.querySelectorAll("#cmdcard .cmdBtn")].map((node)=>node.textContent).find((text)=>text.includes("批量升级"))||null,
  }));
  await page.close();
  assert.deepEqual(result.kinds,["goldmine"]);
  assert.equal(result.count,3,"双击应选择当前镜头内三个金矿");
  assert.equal(result.selectedVisible,true,"镜头外金矿不得被双击选择");
  assert.match(result.command||"",/批量升级/);
});

test("建造面板打开且仍持有蓝图时双击金矿恢复同类全选", async () => {
  const page=await openSurvival();
  const clickPoint=await page.evaluate(()=>{
    goldMines.splice(0).forEach((mine)=>scene.remove(mine.group));wc3ClearSel();
    camFocus.set(0,0,0);updateCamera(0);camera.updateMatrixWorld(true);
    const makeMine=(x)=>{
      const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.6,2.6),new THREE.MeshStandardMaterial({color:0xd9ad32}));
      group.add(mesh);group.position.set(x,10,0);scene.add(group);
      const cell=cellOf(x,0),mine={group,x:cell.x,z:cell.z,level:1,footprintCells:[idx(cell.x,cell.z)]};
      goldMines.push(mine);structCells.add(mine.footprintCells[0]);return mine;
    };
    const mines=[makeMine(-5),makeMine(0),makeMine(5)];
    state=STATE.BUILD;wc3BuildMode=true;selectBuild(shopList().findIndex((item)=>item.kind==="wall"));
    scene.updateMatrixWorld(true);renderer.render(scene,camera);
    const projected=mines[1].group.position.clone().project(camera);
    return {x:(projected.x+1)*innerWidth/2,y:(-projected.y+1)*innerHeight/2};
  });
  await page.mouse.dblclick(clickPoint.x,clickPoint.y,{delay:60});
  const result=await page.evaluate(()=>({count:wc3Selection.length,kinds:[...new Set(wc3Selection.map((entry)=>entry.kind))],buildSel,buildMode:wc3BuildMode}));
  await page.close();
  assert.deepEqual(result.kinds,["goldmine"]);
  assert.equal(result.count,3);
  assert.equal(result.buildSel,null,"双击已有对象时应退出当前放置项");
  assert.equal(result.buildMode,true,"只退出蓝图，不关闭建造面板");
});

test("多选金矿按 U 各升级一级并反馈花费与未升级数量", async () => {
  const page=await openSurvival();
  const before=await page.evaluate(() => {
    goldMines.splice(0).forEach((mine)=>scene.remove(mine.group));
    const levels=[1,2,6];
    const mines=levels.map((level,index)=>{
      const group=new THREE.Group();group.position.set(index*3,0,0);scene.add(group);
      const mine={group,x:index,z:2,level};goldMines.push(mine);return mine;
    });
    state=STATE.BUILD;game.gold=10000;wc3SetSelection(mines.map((ref)=>({kind:"goldmine",ref})));wc3RenderSel();renderCmdCard();
    return {levels:mines.map((mine)=>mine.level),gold:game.gold};
  });
  await page.keyboard.press("u");
  const result=await page.evaluate(() => ({
    levels:goldMines.map((mine)=>mine.level),gold:game.gold,
    message:document.getElementById("announce").textContent,
  }));
  await page.close();
  assert.deepEqual(before.levels,[1,2,6]);
  assert.deepEqual(result.levels,[2,3,6],"U 应让两座可升级金矿各提升一级");
  assert.ok(before.gold-result.gold>0&&before.gold-result.gold<=1400,"批升扣费期间采矿应继续运行，但不得倒赚金币");
  assert.match(result.message,/升级 2/);
  assert.match(result.message,/花费 1400/);
  assert.match(result.message,/未升级 1/);
});

test("医疗灯塔按等级提供受控视野和远程修墙", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(() => {
    if(typeof updateMedicalBeacons!=="function"||typeof medicalBeaconVisionRadius!=="function"||typeof medicalBeaconRepairPercentPerSecond!=="function")
      return {available:false};
    game.gold=10000;openWc3Build();
    const C=ACTIVE_MODE.canyon,wallCell={x:C.x0+2,z:C.z0},key=idx(wallCell.x,wallCell.z),max=wallMaxHp(1);
    grid[wallCell.z][wallCell.x]=T_STEEL;wallMeta.set(key,{lv:1,hp:max-20});steelHP.set(key,max-20);
    const beaconIndex=shopList().findIndex((item)=>item.id==="beacon"),beaconBuild=shopList()[beaconIndex];
    const beaconCell={x:C.x0+1,z:C.z0};
    selectBuild(beaconIndex);ghost.visible=true;const center=footprintCenter(beaconCell,beaconBuild);placeBuildingImmediately(center.x,center.z);
    const beacon=visionBeacons[0];if(beacon&&beacon.level==null)beacon.level=1;
    const before=steelHP.get(key);updateMedicalBeacons(1);const after=steelHP.get(key);
    wc3Select("beacon",beacon);wc3RenderSel();renderCmdCard();
    const upgrade=[...document.querySelectorAll("#cmdcard .cmdBtn")].find((node)=>node.textContent.includes("升级"));upgrade?.click();
    return {available:true,level:beacon.level,before,after,max,vision:medicalBeaconVisionRadius(beacon),repair:medicalBeaconRepairPercentPerSecond(beacon),upgrade:!!upgrade};
  });
  await page.close();
  assert.equal(result.available,true,"必须提供医疗灯塔升级与修墙运行逻辑");
  assert.ok(Math.abs((result.after-result.before)-result.max*.02)<1e-5,"一级医疗灯塔每秒修复墙体最大生命的2%");
  assert.equal(result.upgrade,true);
  assert.equal(result.level,2);
  assert.equal(result.vision,48);
  assert.equal(result.repair,.0275);
});

test("1080p 指挥面板增高并提供单选头像与多选头像矩阵", async () => {
  const page=await openSurvival();
  await page.setViewportSize({width:1920,height:1080});
  const result=await page.evaluate(() => {
    if(!player)spawnPlayer();
    wc3Select("player",player);wc3RenderSel();
    const single={height:document.getElementById("selPanel").getBoundingClientRect().height,portrait:!!document.getElementById("spPortraitCanvas")};
    const units=[player,...friendlyUnits].filter(Boolean).slice(0,2).map((ref,index)=>({kind:index===0?"player":"unit",ref}));
    if(units.length===1)units.push({kind:"unit",ref:{...player,name:"测试单位",alive:true,group:player.group}});
    wc3SetSelection(units);wc3RenderSel();
    return {...single,multiPortraitCount:document.querySelectorAll("#spPortraitGrid .portraitMini").length};
  });
  await page.close();
  assert.ok(result.height>=210&&result.height<=224,`1080p 状态面板应约 218px，实际 ${result.height}`);
  assert.equal(result.portrait,true,"单选信息区必须提供模型头像画布");
  assert.ok(result.multiPortraitCount>=2,"多选时必须显示头像矩阵");
});

test("1x1 人口房占用完整足迹并阻止重叠", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const house=shopList().find((item)=>item.id==="house");
    const anchor={x:20,z:20};
    const cells=footprintCells(anchor,house);
    cells.forEach((cell)=>structCells.add(idx(cell.x,cell.z)));
    const overlaps=footprintPlaceable(anchor,house);
    cells.forEach((cell)=>structCells.delete(idx(cell.x,cell.z)));
    return {count:cells.length,unique:new Set(cells.map((cell)=>idx(cell.x,cell.z))).size,overlaps};
  });
  await page.close();
  assert.equal(result.count,1);
  assert.equal(result.unique,1);
  assert.equal(result.overlaps,false);
});

test("生存核心建筑组合原素材与自建模型且释放完整足迹", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    game.gold=9999;
    const place=(id)=>{
      const index=shopList().findIndex((item)=>item.id===id);
      const build=shopList()[index];let anchor=null;
      const E=ACTIVE_MODE.enclosure;
      for(let z=E.z0+1;z<E.z1-2&&!anchor;z++)for(let x=E.x0+1;x<E.x1-2;x++){
        const candidate={x,z};if(footprintPlaceable(candidate,build)){anchor=candidate;break;}
      }
      if(!anchor)throw new Error(`no placeable footprint for ${id}`);
      selectBuild(index);
      ghost.visible=true;
      const center=cellCenter(anchor.x,anchor.z);
      placeBuildingImmediately(center.x,center.z);
    };
    place("goldmine");place("house");place("research");place("factory");
    const records=[...goldMines,...builtHouses,...researchInstitutes,...heavyFactories];
    const assets=[];
    records.forEach((record)=>record.group.traverse((object)=>{
      if(object.userData&&object.userData.assetName)assets.push(object.userData.assetName);
    }));
    const footprints=records.map((record)=>record.footprintCells&&record.footprintCells.length);
    const forbidden=assets.filter((name)=>name==="dumpster"||name.startsWith("building-"));
    const house=builtHouses[0],houseCells=[...house.footprintCells];
    attemptDestroy(house.x,house.z);
    const released=houseCells.every((cellIndex)=>!structCells.has(cellIndex));
    return {assets,footprints,forbidden,released,handcrafted:records.map(r=>r.group.userData.handcraftedKind).filter(Boolean)};
  });
  await page.close();
  assert.deepEqual(result.forbidden,[]);
  for(const asset of ["industrial-building-s","industrial-building-i"])
    assert.ok(result.assets.includes(asset),`核心建筑缺少 ${asset}`);
  assert.deepEqual(result.footprints.sort((a,b)=>a-b),[1,1,4,4]);
  assert.equal(result.released,true);
  assert.deepEqual(result.handcrafted.sort(),['factory','research']);
});

test("基地使用独立自建指挥建筑且移除旧工业组件", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const assets=[];
    baseGroup.traverse((object)=>{
      if(object.userData&&object.userData.assetName)assets.push(object.userData.assetName);
    });
    return {
      handcrafted:!!baseGroup.getObjectByName('自建主基地'),
      commandAssets:assets.filter((name)=>["industrial-building-d","industrial-building-t","industrial-building-c","industrial-chimney-basic"].includes(name)),
      legacyCastle:assets.filter((name)=>name==="tower-square-base"||name==="wall-narrow-wood"||name==="gate").length,
    };
  });
  await page.close();
  assert.deepEqual(result.commandAssets,[]);assert.equal(result.handcrafted,true);
  assert.equal(result.legacyCastle,0,"基地不得残留城堡拼装部件");
});

test("金矿使用建筑 S 的暗金变色版且不再悬挂金色晶体", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;
    const index=shopList().findIndex((item)=>item.id==="goldmine"),build=shopList()[index];
    let anchor=null;
    for(let z=3;z<GRID-3&&!anchor;z++)for(let x=18;x<GRID-3;x++)if(footprintPlaceable({x,z},build)){anchor={x,z};break;}
    selectBuild(index);ghost.visible=true;const center=cellCenter(anchor.x,anchor.z);placeBuildingImmediately(center.x,center.z);
    const mine=goldMines[0],assets=[];let recolored=false,warm=false,crystalCount=0;
    mine.group.traverse((object)=>{
      if(object.userData&&object.userData.assetName)assets.push(object.userData.assetName);
      if(object.isMesh&&object.userData&&object.userData.goldMineRecolored)recolored=true;
      if(object.isMesh&&object.userData&&object.userData.nightGlow)warm=true;
      if(object.isMesh&&object.geometry&&object.geometry.type==="OctahedronGeometry")crystalCount++;
    });
    return {assets,recolored,warm,crystalCount,crystal:mine.crystal};
  });
  await page.close();
  assert.deepEqual(result.assets,["industrial-building-s"]);
  assert.equal(result.recolored,true);
  assert.equal(result.warm,false);
  assert.equal(result.crystalCount,0);
  assert.equal(result.crystal,null);
});

test("金矿每秒按实际收益在建筑头顶显示一次飘字", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    goldMines.splice(0).forEach((mine)=>scene.remove(mine.group));
    const group=new THREE.Group();group.position.set(0,heightAt(0,0),0);scene.add(group);
    const mine={group,visualRoot:group,visualBaseScale:new THREE.Vector3(1,1,1),x:30,z:30,level:1,incomePulse:0};
    goldMines.push(mine);game.gold=0;game.tech.economy=0;state=STATE.PLAYING;
    window.advanceTime(1050);
    const popup=document.querySelector(".mineIncomePopup");
    return {text:popup&&popup.textContent,count:mineIncomePopups.length,gold:game.gold};
  });
  await page.close();
  assert.equal(result.text,"+1");
  assert.equal(result.count,1);
  assert.ok(result.gold>=1&&result.gold<1.2);
});

test("金矿升级从一级线性增大至旧六级的一点五倍且逻辑根节点保持", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const group=new THREE.Group(),visualRoot=new THREE.Group();group.add(visualRoot);scene.add(group);
    const mine={group,visualRoot,visualBaseScale:new THREE.Vector3(2,2,2),x:6,z:6,level:1,footprintCells:[]};
    goldMines.push(mine);const scales=[];
    for(let level=1;level<=6;level++){mine.level=level;upgradeGoldMineVisual(mine);scales.push(visualRoot.scale.x/2);}
    return {scales,groupScale:group.scale.x};
  });
  await page.close();
  assert.deepEqual(result.scales.map((value)=>+value.toFixed(3)),[1,1.175,1.35,1.525,1.7,1.875]);
  assert.equal(result.groupScale,1,"只能放大模型，不得改变逻辑根节点");
});

test("生存平地是连续有体积的承重层且顶面误差不超过 0.02", async () => {
  const page = await openSurvival();
  const sample = await page.evaluate(() => {
    if(!ground.userData.surfaceVolume)return {error:"ground is not a surface volume"};
    ground.geometry.computeBoundingBox();ground.updateMatrixWorld(true);
    const bounds=ground.geometry.boundingBox.clone().applyMatrix4(ground.matrixWorld);
    const origin=cellCenter(ACTIVE_MODE.canyon.x1-1,ACTIVE_MODE.canyon.z0);
    const logicalY=heightAt(origin.x,origin.z);
    return {
      error: null,
      visualTopY: bounds.max.y,
      logicalY,
      errorY: Math.abs(bounds.max.y - logicalY),
      depth:bounds.max.y-bounds.min.y,
    };
  });
  await page.close();
  assert.equal(sample.error, null, sample.error);
  assert.ok(
    sample.errorY <= 0.02,
    `平地视觉顶面 ${sample.visualTopY.toFixed(3)} 与逻辑面 ${sample.logicalY.toFixed(3)} 误差 ${sample.errorY.toFixed(3)}`,
  );
  assert.ok(sample.depth>=1,"平地必须有真实体积");
});

test("三路刷怪走廊具有不参与碰撞的连续土路视觉", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const path=mapGroup.children.find((child)=>child.isInstancedMesh&&child.userData.assetName==="survival-path");
    return {exists:!!path,count:path&&path.count};
  });
  await page.close();
  assert.equal(result.exists,true);
  assert.ok(result.count>=8,"峡谷进攻道必须铺有连续土路视觉");
});

test("两处上方刷怪点的土路都连续连接到坡底", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const path=mapGroup.children.find((child)=>child.isInstancedMesh&&child.userData.assetName==="survival-path");
    const cells=new Set(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
    for(let i=0;i<path.count;i++){
      path.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
      const cell=cellOf(point.x,point.z);cells.add(idx(cell.x,cell.z));
    }
    const goal={x:ACTIVE_MODE.ramp.col+1,z:ACTIVE_MODE.ramp.row};
    const reaches=(spawn)=>{
      const queue=[spawn],seen=new Set([idx(spawn.x,spawn.z)]);
      while(queue.length){
        const current=queue.shift();if(current.x===goal.x&&current.z===goal.z)return true;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const next={x:current.x+dx,z:current.z+dz},key=idx(next.x,next.z);
          if(cells.has(key)&&!seen.has(key)){seen.add(key);queue.push(next);}
        }
      }
      return false;
    };
    return ACTIVE_MODE.spawns.map((spawn)=>({spawn,hasStart:cells.has(idx(spawn.x,spawn.z)),reaches:reaches(spawn)}));
  });
  await page.close();
  result.forEach((row)=>{
    assert.equal(row.hasStart,true,`刷怪点缺少路面：${JSON.stringify(row.spawn)}`);
    assert.equal(row.reaches,true,`土路在途中断开：${JSON.stringify(row.spawn)}`);
  });
});

test("生存场景只保留基地且不残留菜单旗台或赠送坦克", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => ({
    tankRoots:scene.children.filter((object)=>object.userData&&object.userData.turret).length,
    shieldNodes:scene.children.reduce((total,root)=>{
      let count=0;root.traverse((object)=>{if(object.name==="shield")count++;});return total+count;
    },0),
    currentPlayerAttached:!!(player&&player.group&&player.group.parent===scene),
    currentBaseAttached:!!(baseGroup&&baseGroup.parent===scene),
  }));
  await page.close();
  assert.equal(result.tankRoots,0,"生存模式不得残留菜单坦克或赠送初始坦克");
  assert.equal(result.shieldNodes,1,"场景外不得残留旧旗台/基地");
  assert.equal(result.currentPlayerAttached,false);
  assert.equal(result.currentBaseAttached,true);
});

test("直达生存模式只加载白名单素材", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => ({
    loaded:assetsProgress()[0],total:assetsProgress()[1],allowlist:SURVIVAL_ASSETS.runtimeAllowlist.length+SURVIVAL_ASSETS.textureAllowlist.length,
    modernLoaded:!!ASSETS["building-a"],tdkitLoaded:!!ASSETS["tile-straight-slope"],
  }));
  await page.close();
  assert.equal(result.total,result.allowlist);
  assert.equal(result.loaded,result.allowlist);
  assert.equal(result.modernLoaded,false);
  assert.equal(result.tdkitLoaded,false);
});

test("60 单位十秒逻辑压力测试保持预算内", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    for(let index=0;index<60;index++){
      spawnEnemy(index%4===0?"fast":"normal",false);
      const enemy=enemies[enemies.length-1];
      if(enemy.beam)scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;enemy.hp=enemy.maxHp=1e9;
      const spawn=ACTIVE_MODE.spawns[index%ACTIVE_MODE.spawns.length],center=cellCenter(spawn.x,spawn.z);
      enemy.group.position.set(center.x+(index%5)*.18,heightAt(center.x,center.z),center.z+((index/5)|0)*.08);
    }
    const started=performance.now();
    for(let frame=0;frame<600;frame++)updateEnemies(1/60);
    const logicMs=performance.now()-started;
    const alive=enemies.filter(e=>e.alive);
    const center=alive.reduce((sum,e)=>sum.add(e.group.position),new THREE.Vector3()).multiplyScalar(1/alive.length);
    camera.position.set(center.x+34,58,center.z+44);camera.lookAt(center);renderer.render(scene,camera);
    return {logicMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,alive:alive.length};
  });
  await page.close();
  assert.ok(result.logicMs<1500,`60 单位十秒逻辑耗时 ${result.logicMs.toFixed(1)}ms`);
  assert.ok(result.drawCalls<260,`尸潮进入镜头后的绘制调用 ${result.drawCalls}`);
  assert.equal(result.alive,60);
});

test("220敌人12友军10炮台和85粒子终局场景保持受控绘制调用", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    friendlyUnits.splice(0).forEach((unit)=>scene.remove(unit.group));
    builtTurrets.splice(0).forEach((turret)=>scene.remove(turret.group));
    game.gold=1e6;game.popMax=200;game.popUsed=0;state=STATE.PLAYING;game.wave=30;
    for(let index=0;index<220;index++){
      spawnEnemy(index%5===0?"heavy":"normal",false);
      const enemy=enemies[enemies.length-1];enemy.spawnFlash=0;
    }
    for(let index=0;index<12;index++)createFriendlyUnit(index%4===0?"heavy":"medium",cellCenter(8+index%4,34+Math.floor(index/4)));
    for(let index=0;index<10;index++){
      const group=makeTurretMesh("turret");group.position.copy(cellCenter(5+index,40));scene.add(group);
      builtTurrets.push({group,kind:"turret",turretKey:"turret",level:0,cx:5+index,cz:40,range:40,cd:1,fireCd:1,dmg:3,blast:0,hp:40,maxHp:40,bar:group.children.at(-2),barFg:group.children.at(-1)});
    }
    spawnParticles(new THREE.Vector3(0,3,0),0xffb02e,85,8,1);
    updateParticles(1/60);renderer.render(scene,camera);
    return {drawCalls:renderer.info.render.calls,particles:particles.length,friendlyMeshes:friendlyUnits[0].group.children.length};
  });
  await page.close();
  assert.ok(result.drawCalls<=430,`终局密集场景绘制调用 ${result.drawCalls} 超过430预算`);
  assert.equal(result.particles,85);
  assert.ok(result.friendlyMeshes<=5,"低绘制坦克根节点子对象过多");
});

test("1000 个存活丧尸单帧逻辑与分离保持可控", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    for(let index=0;index<1000;index++){
      spawnEnemy("normal",false);
      const enemy=enemies[enemies.length-1];enemy.spawnFlash=0;enemy.hp=enemy.maxHp=1e9;
      const center=cellCenter(ACTIVE_MODE.spawns[index%ACTIVE_MODE.spawns.length].x,ACTIVE_MODE.spawns[index%ACTIVE_MODE.spawns.length].z);
      enemy.group.position.set(center.x+(index%20)*.12,heightAt(center.x,center.z),center.z+Math.floor(index/20)*.12);
    }
    const separationStart=performance.now();
    for(let frame=0;frame<6;frame++)applyHordeSeparation(1/60);
    const separationMs=performance.now()-separationStart;
    const updateStart=performance.now();
    for(let frame=0;frame<6;frame++){_animFrame++;updateCrowdLod();updateEnemies(1/60);}
    const updateMs=performance.now()-updateStart;
    return {separationMs,updateMs,alive:enemies.filter((enemy)=>enemy.alive).length};
  });
  await page.close();
  assert.equal(result.alive,1000);
  assert.ok(result.separationMs<700,`1000 丧尸分离 6 帧耗时 ${result.separationMs.toFixed(1)}ms`);
  assert.ok(result.updateMs<150,`1000 丧尸更新 6 帧耗时 ${result.updateMs.toFixed(1)}ms`);
});

test("尸潮局部分离使重叠怪群展开为有宽度的队列", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    if(typeof applyHordeSeparation!=="function")return {exists:false};
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    const center=cellCenter(ACTIVE_MODE.canyon.x0+4,ACTIVE_MODE.canyon.z0);
    for(let index=0;index<36;index++){
      spawnEnemy("normal",false);const enemy=enemies[enemies.length-1];
      enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
      enemy.group.position.set(center.x,heightAt(center.x,center.z),center.z);
    }
    for(let frame=0;frame<180;frame++)applyHordeSeparation(1/60);
    const occupied=new Set(enemies.map((enemy)=>`${Math.round(enemy.group.position.x*2)},${Math.round(enemy.group.position.z*2)}`));
    const radius=Math.max(...enemies.map((enemy)=>Math.hypot(enemy.group.position.x-center.x,enemy.group.position.z-center.z)));
    return {exists:true,occupied:occupied.size,radius};
  });
  await page.close();
  assert.equal(result.exists,true,"必须提供尸潮局部分离系统");
  assert.ok(result.occupied>=20,`36 只怪至少应占据 20 个半格位置，实际 ${result.occupied}`);
  assert.ok(result.radius>=1.5,`当前人形碰撞半径下怪群应展开至少 1.5 个世界单位，实际 ${result.radius}`);
});

test("高密度尸潮分离位移受限不会产生抽搐", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    const center=cellCenter(ACTIVE_MODE.canyon.x0+4,ACTIVE_MODE.canyon.z0);
    for(let index=0;index<180;index++){
      spawnEnemy("normal",false);const enemy=enemies[enemies.length-1];
      enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
      enemy.group.position.set(center.x,heightAt(center.x,center.z),center.z);
    }
    let maxStep=0;
    for(let frame=0;frame<90;frame++){
      const before=enemies.map((enemy)=>enemy.group.position.clone());
      applyHordeSeparation(1/60);
      enemies.forEach((enemy,index)=>{maxStep=Math.max(maxStep,enemy.group.position.distanceTo(before[index]));});
    }
    return {maxStep};
  });
  await page.close();
  assert.ok(result.maxStep<=.2,`高密度分离单帧位移过大，容易与寻路互相抢位置：${result.maxStep}`);
});

test("啃墙尸潮仍保留横向碰撞分离", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    const center=cellCenter(ACTIVE_MODE.canyon.x0+4,ACTIVE_MODE.canyon.z0);
    const targetCell={x:ACTIVE_MODE.canyon.x0+5,z:ACTIVE_MODE.canyon.z0};
    for(let index=0;index<36;index++){
      spawnEnemy("normal",false);const enemy=enemies[enemies.length-1];
      enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
      enemy.objectiveKind="wall";enemy.objectiveCell=targetCell;
      enemy.group.position.set(center.x,heightAt(center.x,center.z),center.z);
    }
    for(let frame=0;frame<120;frame++)applyHordeSeparation(1/60);
    const occupied=new Set(enemies.map((enemy)=>`${Math.round(enemy.group.position.x*2)},${Math.round(enemy.group.position.z*2)}`));
    return {occupied:occupied.size};
  });
  await page.close();
  assert.ok(result.occupied>=16,`墙前尸群不能全部重叠，实际仅占据 ${result.occupied} 个半格位置`);
});

test("运行时高度查询由 TerrainSurface 提供且坡道严格只占一格", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    if (typeof terrainSurface === "undefined" || !terrainSurface) return { exists: false };
    const rampCells=[];
    for(let z=0;z<GRID;z++)for(let x=0;x<GRID;x++)if(grid[z][x]===T_RAMP)rampCells.push({x,z});
    const ramp=rampCells[0],center=cellCenter(ramp.x,ramp.z);
    const west=center.x-TILE/2,east=center.x+TILE/2;
    return {
      exists: true,
      rampCells,
      delegated: Math.abs(heightAt(center.x,center.z)-terrainSurface.heightAt(center.x,center.z))<1e-9,
      highEdge:terrainSurface.heightAt(west+0.0001,center.z),
      lowEdge:terrainSurface.heightAt(east+0.0001,center.z),
    };
  });
  await page.close();
  assert.equal(result.exists, true, "必须建立运行时 terrainSurface");
  assert.equal(result.delegated, true, "heightAt 必须委托 TerrainSurface");
  assert.equal(result.rampCells.length,1,"坡道逻辑足迹必须严格为 1×1 格");
  assert.ok(Math.abs(result.highEdge-2.2)<0.001,`坡顶必须接高台，实际 ${result.highEdge}`);
  assert.ok(Math.abs(result.lowEdge)<0.001,`坡底必须接平地，实际 ${result.lowEdge}`);
});

test("坡道合入连续自然地形且无旧块状承重模型", async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{let natural=0,legacy=0;mapGroup.traverse(o=>{if(o.userData?.assetName==='natural-plateau')natural++;if(['block-grass-large-slope-steep','block-grass-low','tile-straight-slope'].includes(o.userData?.assetName)||o.userData?.sceneRole==='ramp-volume-backing')legacy++;});return {natural,legacy};});await page.close();assert.deepEqual(result,{natural:1,legacy:0});
});

test("炮台专精快捷键逐项唯一且数字键能触发对应分支",async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  game.gold=99999;const build=shopList().find(b=>b.kind==='turret'),E=ACTIVE_MODE.enclosure;let anchor=null;
  for(let z=E.z0+1;z<E.z1-1&&!anchor;z++)for(let x=E.x0+1;x<E.x1-1&&!anchor;x++)if(footprintPlaceable({x,z},build))anchor={x,z};
  selectBuild(shopList().indexOf(build));ghostCell=anchor;ghost.visible=true;placeBuildingImmediately();selectBuild(null);
  const turret=builtTurrets.at(-1);wc3Select('turret',turret);const items=commandItemsForSelection().filter(i=>i.branchId);const hots=items.map(i=>i.hot);
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit1',key:'1'}));
  return {hots,unique:new Set(hots).size===hots.length,selected:turret.turretKey};
 });await page.close();assert.deepEqual(result.hots,['1','2','3','4']);assert.equal(result.unique,true);assert.equal(result.selected,'rapid');
});

test("坡道与高坡共用灰烬纹理且颜色有限",async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{const m=mapGroup.getObjectByName('自然侵蚀高坡'),c=m.geometry.attributes.color;return {textured:!!m.material.map,finite:Array.from(c.array).every(Number.isFinite),green:Array.from({length:c.count},(_,i)=>c.getY(i)-Math.max(c.getX(i),c.getZ(i))).reduce((a,b)=>Math.max(a,b),0)};});await page.close();assert.ok(result.textured&&result.finite);assert.ok(result.green<.05);
});

test("连续坡道西高东低且查询高度与渲染顶点一致",async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{const p=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row);return {west:heightAt(p.x-TILE*.49,p.z),east:heightAt(p.x+TILE*.49,p.z)};});await page.close();assert.ok(result.west>result.east+1.5);
});

test("不规则山崖高地保持主体连通，不生成孤立高台", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const E=ACTIVE_MODE.enclosure;
    const high=(x,z)=>{
      const t=grid[z][x];
      return t===T_PLATEAU||t===T_BASE;
    };
    const segments=(values)=>{
      let count=0,inside=false;
      for(const value of values){
        if(value&&!inside){count++;inside=true;}
        else if(!value)inside=false;
      }
      return count;
    };
    const rowSegments=[];
    for(let z=E.z0;z<=E.z1;z++)rowSegments.push(segments(Array.from({length:E.x1-E.x0+1},(_,i)=>high(E.x0+i,z))));
    const colSegments=[];
    const C=ACTIVE_MODE.canyon;
    for(let x=E.x0;x<=E.x1;x++){
      if(x===ACTIVE_MODE.ramp.col)continue;
      if(C&&x>=C.x0&&x<=C.x1)continue; // 峡谷合法把该列切成南北两段高台
      colSegments.push(segments(Array.from({length:E.z1-E.z0+1},(_,i)=>high(x,E.z0+i))));
    }
    const remaining=new Set();for(let z=1;z<GRID-1;z++)for(let x=1;x<GRID-1;x++)if(high(x,z))remaining.add(idx(x,z));
    const components=[];while(remaining.size){const queue=[remaining.values().next().value];remaining.delete(queue[0]);for(let i=0;i<queue.length;i++){const x=queue[i]%GRID,z=Math.floor(queue[i]/GRID);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const key=idx(x+dx,z+dz);if(remaining.delete(key))queue.push(key);}}components.push(queue.length);}
    return {components};
  });
  await page.close();
  assert.equal(result.components.length,1,`山崖可以弯曲，但不能留下孤立高地：${JSON.stringify(result)}`);
});

test("重开生存模式会释放全部建筑足迹与跨局集合", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const makeRecord = (cellIndex) => {
      const group = new THREE.Group();
      scene.add(group);
      structCells.add(cellIndex);
      return { group, footprintCells: [cellIndex] };
    };
    builtHouses.push(makeRecord(idx(20, 20)));
    researchInstitutes.push(makeRecord(idx(21, 20)));
    heavyFactories.push(makeRecord(idx(22, 20)));
    builtTurrets.push(makeRecord(idx(23, 20)));
    goldMines.push(makeRecord(idx(24, 20)));
    resetGame();
    return {
      houses: builtHouses.length,
      research: researchInstitutes.length,
      factories: heavyFactories.length,
      turrets: builtTurrets.length,
      mines: goldMines.length,
      occupied: structCells.size,
    };
  });
  await page.close();
  assert.deepEqual(result, { houses: 0, research: 0, factories: 0, turrets: 0, mines: 0, occupied: 0 });
});

test("恢复坡道通行时复用连续自然地形而不补旧模型", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const count = (name) => {
      let total = 0;
      mapGroup.traverse((object) => {
        if (object.userData && object.userData.assetName === name) total++;
      });
      return total;
    };
    const before = {
      continuous: count("natural-plateau"),
      legacy: count("tile-straight-slope"),
      children: mapGroup.children.length,
    };
    const row = ACTIVE_MODE.ramp.row;
    const restored = buildRampTile(mapGroup, ACTIVE_MODE.ramp.col, row);
    return {
      before,
      after: {
        continuous: count("natural-plateau"),
        legacy: count("tile-straight-slope"),
        children: mapGroup.children.length,
      },
      reused: !!(restored && restored.userData && restored.userData.assetName === "natural-plateau"),
    };
  });
  await page.close();
  assert.equal(result.before.continuous, 1);
  assert.deepEqual(result.after, result.before);
  assert.equal(result.reused, true);
});

test("敌人模型底面始终贴合 TerrainSurface，不再埋入地下", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
    spawnEnemy("normal", false);
    const enemy = enemies[0];
    enemy.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(enemy.group);
    const surfaceY = heightAt(enemy.group.position.x, enemy.group.position.z);
    return { bottomY: bounds.min.y, surfaceY, errorY: Math.abs(bounds.min.y - surfaceY), height: bounds.max.y - bounds.min.y };
  });
  await page.close();
  assert.ok(result.errorY <= 0.05, `敌人底面 ${result.bottomY} 与地形 ${result.surfaceY} 相差 ${result.errorY}`);
  assert.ok(result.height >= 1 && result.height <= 1.5, `普通敌人视觉高度 ${result.height} 过小`);
});

test("敌人只攻击实际挡路巨岩而不会直线追逐隔着高地的远处巨岩", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
    spawnEnemy("normal", false);
    const enemy = enemies[0];
    if(enemy.beam)scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
    const spawn=[...ACTIVE_MODE.spawns].sort((a,b)=>b.x-a.x)[0],start=cellCenter(spawn.x,spawn.z);
    enemy.group.position.set(start.x,heightAt(start.x,start.z),start.z);
    const ramp=ACTIVE_MODE.ramp,key=idx(ramp.col,ramp.row);
    grid[ramp.row][ramp.col]=T_STEEL;steelHP.set(key,1e9);
    wallMeta.set(key,{lv:1,hp:1e9,thorns:0,wasRamp:true});computeFlowField();
    const initial=enemy.group.position.distanceTo(baseGroup.position);
    for(let frame=0;frame<3600;frame++)updateEnemies(1/60);
    return {objective:enemy.objectiveKind,initial,final:enemy.group.position.distanceTo(baseGroup.position),
      cell:cellOf(enemy.group.position.x,enemy.group.position.z),ramp};
  });
  await page.close();
  assert.ok(result.final<result.initial-18,`敌人必须沿道路接近基地/挡路巨岩：${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.cell.z-result.ramp.row)<=2,"抵达巨岩目标时必须位于巨岩邻近道路，而不是撞死在远处高地侧面");
});

test("巨岩与可受击建筑满血隐藏血条且受伤后立即显示", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;game.gold=99999;openWc3Build();
    const wallIndex=shopList().findIndex((item)=>item.id==="wall"),wall=shopList()[wallIndex];
    const firstCell=(build)=>{const E=ACTIVE_MODE.enclosure,C=ACTIVE_MODE.canyon;
      if(build.id==="wall"&&C){for(let z=C.z0;z<=C.z1;z++)for(let x=C.x0;x<=C.x1;x++)if(footprintPlaceable({x,z},build))return {x,z};}
      for(let z=E.z0+1;z<E.z1-1;z++)for(let x=E.x0+1;x<E.x1-1;x++)if(footprintPlaceable({x,z},build))return {x,z};
      return null;
    };
    const wallCell=firstCell(wall),wallCenter=footprintCenter(wallCell,wall);
    selectBuild(wallIndex);ghost.visible=true;placeBuildingImmediately(wallCenter.x,wallCenter.z);
    const wallKey=idx(wallCell.x,wallCell.z),wallGroup=tileMeshes[wallKey];
    const wallFullHidden=wallGroup?.userData?.healthBar?.visible===false;
    damageWallCell(wallCell.x,wallCell.z,1);stepGame(1/60,performance.now());
    const wallDamagedVisible=wallGroup?.userData?.healthBar?.visible===true;

    const researchIndex=shopList().findIndex((item)=>item.id==="research"),research=shopList()[researchIndex];
    const researchCell=firstCell(research),researchCenter=footprintCenter(researchCell,research);
    selectBuild(researchIndex);ghost.visible=true;placeBuildingImmediately(researchCenter.x,researchCenter.z);
    const building=researchInstitutes[0],buildingFullHidden=building?.bar?.visible===false;
    building.hp-=1;stepGame(1/60,performance.now());
    return {wallFullHidden,wallDamagedVisible,buildingFullHidden,buildingDamagedVisible:building?.bar?.visible===true};
  });
  await page.close();
  assert.deepEqual(result,{wallFullHidden:true,wallDamagedVisible:true,buildingFullHidden:true,buildingDamagedVisible:true});
});

test("敌人抵达目标巨岩后停止穿行并持续扣除墙体耐久", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => { scene.remove(enemy.group); if (enemy.beam) scene.remove(enemy.beam); });
    const wall = { x: ACTIVE_MODE.ramp.col, z: ACTIVE_MODE.ramp.row }, wallCenter = cellCenter(wall.x, wall.z), wallKey = idx(wall.x, wall.z);
    grid[wall.z][wall.x] = T_STEEL; steelHP.set(wallKey, 1000); wallMeta.set(wallKey, { lv: 1, hp: 1000, thorns: 0, wasRamp: true });
    computeFlowField(); spawnEnemy("normal", false);
    const enemy = enemies[0];
    if (enemy.beam) scene.remove(enemy.beam); enemy.beam = null; enemy.spawnFlash = 0;
    const approach=cellCenter(wall.x+2,wall.z);
    enemy.group.position.set(approach.x,heightAt(approach.x,approach.z),approach.z);
    enemy.thinkTimer=0;
    updateEnemies(1 / 60);
    const initialObjective = enemy.objectiveKind;
    let crossed = false, sawAttack = false;
    for (let frame = 0; frame < 720; frame++) {
      updateEnemies(1 / 60);
      if (enemy.group.position.x < wallCenter.x - TILE * .5) crossed = true;
      if (enemy.currentAnim === "@attack") sawAttack = true;
    }
    return { hp: steelHP.get(wallKey) || 0, crossed, sawAttack,
      hasAttack: Object.keys(enemy.actions || {}).some((key) => key.includes("attack")), initialObjective, objective: enemy.objectiveKind,
      distance: Math.hypot(enemy.group.position.x - wallCenter.x, enemy.group.position.z - wallCenter.z) };
  });
  await page.close();
  assert.equal(result.crossed, false, "敌人不得穿过巨岩格");
  assert.equal(result.initialObjective, "base", "远处敌人必须先沿合法流场接近，不得直线锁岩");
  assert.ok(result.hp < 1000, `敌人抵达巨岩后必须攻击，实际耐久仍为 ${result.hp}`);
  assert.equal(result.hasAttack||result.sawAttack, true, "有攻击剪辑时必须使用；仅含 Idle/Run 的包必须进入原生 Idle 攻击态");
  assert.equal(result.sawAttack, true, "撞岩时必须从 Walk 切换为攻击动作");
  assert.equal(result.objective, "wall");
  assert.ok(result.distance <= 4.5, `敌人应停在巨岩攻击距离内，实际距离 ${result.distance}`);
});

test("同一单格墙只允许最前排两个僵尸同时攻击", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => { scene.remove(enemy.group); if (enemy.beam) scene.remove(enemy.beam); });
    const target = { x: 20, z: 20, center: cellCenter(20, 20) };
    for (let index = 0; index < 6; index++) {
      const group = new THREE.Group();
      group.position.set(target.center.x + (index + 1) * 0.55, 0, target.center.z);
      enemies.push({ group, alive: true, dying: false, hordeId: index + 1, radius: .9,
        objectiveKind: "wall", objectiveCell: { x: target.x, z: target.z } });
    }
    return enemies.filter((enemy) => enemyWallAttackSlot(enemy, target)).length;
  });
  await page.close();
  assert.equal(result, 6, `按缩小比例扩容后的单格墙攻击位应为 6，实际 ${result}`);
});

test("敌人脸部与炮台炮口都朝向各自的逻辑目标", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => { scene.remove(enemy.group); if (enemy.beam) scene.remove(enemy.beam); });
    builtTurrets.splice(0).forEach((turret) => scene.remove(turret.group));
    spawnEnemy("normal", false);
    const enemy = enemies[0]; if (enemy.beam) scene.remove(enemy.beam); enemy.beam = null; enemy.spawnFlash = 0;
    const ec = cellCenter(20, 20); enemy.group.position.set(ec.x, heightAt(ec.x, ec.z), ec.z);
    const aimWall = { x: 28, z: 20 }, aimKey = idx(aimWall.x, aimWall.z);
    grid[aimWall.z][aimWall.x] = T_STEEL; steelHP.set(aimKey, 1e9); wallMeta.set(aimKey, { lv: 1, hp: 1e9, thorns: 0 });
    enemy.dir.set(1, 0, 0); enemy._cell = cellOf(ec.x, ec.z); enemy.thinkTimer = 999;
    for (let frame = 0; frame < 90; frame++) updateEnemies(1 / 60);
    enemy.group.updateMatrixWorld(true);
    const enemyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.group.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const enemyDirection = enemy.dir.clone().normalize();

    const turretGroup = makeTurretMesh("turret"), tc = cellCenter(16, 20);
    turretGroup.position.set(tc.x, heightAt(tc.x, tc.z), tc.z); scene.add(turretGroup);
    const turret = { group: turretGroup, kind: "turret", turretKey: "turret", level: 0, range: 80, cd: 999,
      fireCd: 1, dmg: 1, blast: 0, hp: 40, maxHp: 40, bar: { visible: false }, barFg: { visible: false } };
    builtTurrets.push(turret); enemy.group.position.set(tc.x + 16, heightAt(tc.x + 16, tc.z), tc.z);
    _visionSourceCache=[{x:tc.x,z:tc.z,radius:100}];
    for (let frame = 0; frame < 90; frame++) updateBuiltTurrets(1 / 60);
    const turretNode = turretGroup.userData.turret; turretNode.updateMatrixWorld(true);
    const turretForward = new THREE.Vector3(0, 0, 1).applyQuaternion(turretNode.getWorldQuaternion(new THREE.Quaternion())).normalize();
    return { enemyDot: enemyForward.dot(enemyDirection), turretDot: turretForward.dot(new THREE.Vector3(1, 0, 0)) };
  });
  await page.close();
  assert.ok(result.enemyDot > .8, `僵尸正面与移动方向相反，点积 ${result.enemyDot}`);
  assert.ok(result.turretDot > .8, `炮口与目标方向相反，点积 ${result.turretDot}`);
});

test("所有密度的僵尸都播放原生步行动作且保持平行前举", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => { scene.remove(enemy.group); if (enemy.beam) scene.remove(enemy.beam); });
    spawnEnemy("normal", false);
    const animated = enemies[0]; if (animated.beam) scene.remove(animated.beam); animated.beam = null; animated.spawnFlash = 0;
    animated._cell = cellOf(animated.group.position.x, animated.group.position.z); animated.thinkTimer = 999;
    updateEnemies(1 / 60);
    animated.animationRoot.updateMatrixWorld(true);
    const point = (name) => animated.animationRoot.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
    const leftHand = point("LeftHand"), rightHand = point("RightHand");
    const leftArm = point("LeftArm"), rightArm = point("RightArm");
    const leftVector = leftHand && leftArm ? leftHand.sub(leftArm).normalize() : null;
    const rightVector = rightHand && rightArm ? rightHand.sub(rightArm).normalize() : null;
    for (let index = 1; index < 50; index++) spawnEnemy("normal", false);
    const lod = enemies[enemies.length - 1]; if (lod.beam) scene.remove(lod.beam); lod.beam = null; lod.spawnFlash = 0;
    lod._cell = cellOf(lod.group.position.x, lod.group.position.z); lod.thinkTimer = 999; lod.dir.set(1, 0, 0);
    const beforeY = lod.visualRoot.position.y, beforeRot = lod.visualRoot.rotation.z;
    for (let frame = 0; frame < 20; frame++) updateEnemies(1 / 60);
    return { hasWalk: !!animated.actions.walk, walkRunning: !!(animated.actions.walk && animated.actions.walk.isRunning()),
      walkTimeScale:animated.actions.walk&&animated.actions.walk.timeScale,
      runPoseParallel:leftVector&&rightVector?leftVector.dot(rightVector):0,
      runPoseSeparation:leftHand&&rightHand?leftHand.distanceTo(rightHand):0,
      current: animated.currentAnim, lod: lod.crowdLod, lodMoved: Math.abs(lod.visualRoot.position.y - beforeY) + Math.abs(lod.visualRoot.rotation.z - beforeRot) };
  });
  await page.close();
  assert.equal(result.hasWalk, true, "僵尸素材必须包含 Walk 剪辑");
  assert.equal(result.walkRunning, true, "移动中的真实僵尸必须播放 Walk");
  assert.ok(result.walkTimeScale>=1.05&&result.walkTimeScale<=1.3,`低速尸潮奔跑动画必须跟随实际位移：${result.walkTimeScale}`);
  assert.equal(result.current, "walk");
  assert.ok(result.runPoseParallel>.9,`奔跑时双臂必须保持平行前举：${result.runPoseParallel}`);
  assert.ok(result.runPoseSeparation>.2,`奔跑时双手必须保持分开：${result.runPoseSeparation}`);
  assert.equal(result.lod,undefined,"高密度尸潮不得切换程序化简化体");
  assert.ok(result.lodMoved < .001,"视觉根节点不得用上下跳动和左右扭转伪造步态");
});

test("非攻击状态的僵尸保持固定向前举臂姿态", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
    spawnEnemy("normal", false);
    const enemy = enemies[0];
    enemy.beam && scene.remove(enemy.beam); enemy.beam = null; enemy.spawnFlash = 0;
    enemy.attackPose = 0;
    applyZombieReachPose(enemy);
    let maxDelta = 0;
    for (const [name, base] of Object.entries(enemy.baseBoneRotations || {})) {
      const bone = enemy.poseBones && enemy.poseBones[name];
      if (bone && base) maxDelta = Math.max(maxDelta,
        Math.abs(bone.rotation.x-base.x)+Math.abs(bone.rotation.y-base.y)+Math.abs(bone.rotation.z-base.z));
    }
    return { hasPose: !!enemy.poseBones, maxDelta };
  });
  await page.close();
  assert.equal(result.hasPose, true, "测试需要加载带骨骼的生存角色");
  assert.ok(result.maxDelta > 0.05, `非攻击状态必须保持向前举臂，最大骨骼偏差 ${result.maxDelta}`);
});

test("僵尸攻击时只做前臂前伸回收而不扭转身体", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    spawnEnemy("normal",false);const enemy=enemies[0],fore=enemy.poseBones.LeftForeArm;
    enemy.attackPose=0;applyZombieReachPose(enemy);const idle=fore.quaternion.clone();
    enemy.attackPose=.5;applyZombieReachPose(enemy);const punch=1-Math.abs(idle.dot(fore.quaternion));
    return {punch,bodyRotation:enemy.visualRoot.rotation.x};
  });
  await page.close();
  assert.ok(result.punch>.01,`攻击时前臂必须有前伸动作：${result.punch}`);
  assert.equal(result.bodyRotation,0,"攻击动作不能扭转整个身体");
});

test("僵尸双臂前举保持平行且左右分开", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    spawnEnemy("normal",false);const enemy=enemies[0];enemy.attackPose=0;applyZombieReachPose(enemy);
    enemy.animationRoot.updateMatrixWorld(true);
    const point=(name)=>enemy.animationRoot.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
    const la=point("LeftArm"),ra=point("RightArm"),lh=point("LeftHand"),rh=point("RightHand");
    const left=lh&&la?lh.sub(la).normalize():null,right=rh&&ra?rh.sub(ra).normalize():null;
    return {parallel:left&&right?left.dot(right):0,separation:lh&&rh?lh.distanceTo(rh):0};
  });
  await page.close();
  assert.ok(result.parallel>.9,`左右前臂必须保持平行，点积 ${result.parallel}`);
  assert.ok(result.separation>.2,`左右双手必须保持分开，距离 ${result.separation}`);
});

test("人口房属于可双击批量选择的同类建筑", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const a = { group: new THREE.Group(), type: "house" };
    const b = { group: new THREE.Group(), type: "house" };
    builtHouses.push(a, b);
    const seed = { kind: "house", ref: a };
    const entries = wc3SelectableEntriesFor(seed);
    const same = entries.filter((entry) => wc3SameSelectionType(entry, seed));
    builtHouses.splice(builtHouses.indexOf(a), 1); builtHouses.splice(builtHouses.indexOf(b), 1);
    return { entries: entries.length, same: same.length };
  });
  await page.close();
  assert.equal(result.entries, 2, `人口房应进入批量候选列表，实际 ${result.entries}`);
  assert.equal(result.same, 2, `人口房应被判定为同类，实际 ${result.same}`);
});

test("两处上方刷怪点均可沿八方向流场持续接近大门", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const rows = [];
    for (const spawn of ACTIVE_MODE.spawns) {
      enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
      spawnEnemy("normal", false);
      const enemy = enemies[0];
      const center = cellCenter(spawn.x, spawn.z);
      enemy.group.position.set(center.x, heightAt(center.x, center.z), center.z);
      enemy.beam && scene.remove(enemy.beam);
      enemy.beam = null;
      enemy.spawnFlash = 0;
      enemy.hp = enemy.maxHp = 1e9;
      const initial = flowField.distanceAt(spawn.x,spawn.z);
      for (let frame = 0; frame < 1200; frame++) updateEnemies(1 / 60);
      const cell=cellOf(enemy.group.position.x,enemy.group.position.z);const final = flowField.distanceAt(cell.x,cell.z);
      rows.push({ spawn, field: flowField.distanceAt(spawn.x, spawn.z), initial, final });
    }
    return rows;
  });
  await page.close();
  for (const row of result) {
    assert.ok(Number.isFinite(row.field), `刷怪点 ${JSON.stringify(row.spawn)} 不可达`);
    assert.ok(row.final < row.initial - 2, `刷怪点 ${JSON.stringify(row.spawn)} 20 秒内未持续接近大门`);
  }
});

test("坡道上的可破坏巨岩仍保留坡面导航属性", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const ramp=ACTIVE_MODE.ramp,key=idx(ramp.col,ramp.row);
    grid[ramp.row][ramp.col]=T_STEEL;
    steelHP.set(key,180);
    wallMeta.set(key,{lv:1,hp:180,thorns:0,wasRamp:true});
    computeFlowField();
    return ACTIVE_MODE.spawns.map((spawn)=>({spawn,distance:flowField.distanceAt(spawn.x,spawn.z)}));
  });
  await page.close();
  for(const row of result)
    assert.ok(Number.isFinite(row.distance),`坡道放置巨岩后刷怪点 ${JSON.stringify(row.spawn)} 必须仍可导航到巨岩`);
});

test("敌人动画只驱动视觉子节点，不覆盖世界坐标", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy) => scene.remove(enemy.group));
    spawnEnemy("normal", false);
    const enemy = enemies[0];
    enemy.beam && scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
    const spawn=ACTIVE_MODE.spawns[0],center=cellCenter(spawn.x,spawn.z);
    enemy.group.position.set(center.x,heightAt(center.x,center.z),center.z);
    const before=enemy.group.position.clone();
    if(enemy.mixer)enemy.mixer.update(1);
    return {
      visualChild:!!(enemy.visualRoot&&enemy.visualRoot.parent===enemy.group),
      animationChild:!!(enemy.animationRoot&&enemy.animationRoot.parent===enemy.visualRoot),
      mixerOnAnimation:!!(enemy.mixer&&enemy.mixer.getRoot()===enemy.animationRoot),
      rootPositionTracks:Object.values(enemy.actions||{}).flatMap((action)=>action?action.getClip().tracks:[])
        .filter((track)=>/^root\.position$/i.test(track.name)).length,
      displacement:enemy.group.position.distanceTo(before),
    };
  });
  await page.close();
  assert.equal(result.visualChild,true,"动画模型必须是世界移动根节点的子节点");
  assert.equal(result.animationChild,true,"动画根节点必须挂在视觉锚点下");
  assert.equal(result.mixerOnAnimation,true,"AnimationMixer 必须只绑定动画根节点");
  assert.equal(result.rootPositionTracks,0,"世界移动必须由 worldRoot 控制，动画需转换为原地动作");
  assert.ok(result.displacement<0.001,`动画不应改写世界坐标，实际位移 ${result.displacement}`);
});

test("两处上方刷怪点的敌人都能完整抵达大门", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const rows=[];
    for(const spawn of ACTIVE_MODE.spawns){
      enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
      spawnEnemy("normal",false);
      const enemy=enemies[0],center=cellCenter(spawn.x,spawn.z);
      enemy.group.position.set(center.x,heightAt(center.x,center.z),center.z);
      enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
      enemy.hp=enemy.maxHp=1e9;
      const originalNow=performance.now.bind(performance);let now=originalNow();
      performance.now=()=>now;
      let reached=false,minDistance=Infinity,frames=0;
      for(let frame=0;frame<60*90;frame++){
        frames=frame+1;
        now+=1000/60;updateEnemies(1/60);
        minDistance=Math.min(minDistance,enemy.group.position.distanceTo(baseGroup.position));
        if(enemy.atGate||minDistance<=GATE_ARRIVE_DIST){reached=true;break;}
      }
      performance.now=originalNow;
      rows.push({spawn,reached,minDistance,seconds:frames/60});
    }
    return rows;
  });
  await page.close();
  for(const row of result)
    assert.equal(row.reached,true,`刷怪点 ${JSON.stringify(row.spawn)} 90 秒内未抵达大门，最近 ${row.minDistance}`);
  assert.ok(Math.max(...result.map((row)=>row.seconds))<=40,`普通尸群最远出生点抵达仍过慢：${JSON.stringify(result)}`);
});

test("僵尸门前停靠点落在可见大门模型前沿", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const collider=baseGroup.userData.gateCollider;
    const point=collider?.localPoint?baseGroup.localToWorld(collider.localPoint.clone()):null;
    const door=baseGroup.getObjectByName('自建主基地');
    const box=door?new THREE.Box3().setFromObject(door):null;
    return {hasPoint:!!point,point:point&&point.toArray(),distance:point&&box?box.distanceToPoint(point):Infinity,radius:collider?.radius||0};
  });
  await page.close();
  assert.equal(result.hasPoint,true,"大门必须提供模型前沿碰撞点");
  assert.ok(result.distance<=.05,`门前碰撞点必须落在门模型边界上：${JSON.stringify(result)}`);
  assert.ok(result.radius<=.6,"门体前沿不能再使用数个单位的空气半径");
});

test("重装与攻城僵尸的碰撞体积不得堵死刷怪走廊", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const rows=[];
    for(const type of ["heavy","siege"]){
      for(const spawn of ACTIVE_MODE.spawns){
        enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
        spawnEnemy(type,false);
        const enemy=enemies[0],center=cellCenter(spawn.x,spawn.z);
        enemy.group.position.set(center.x,heightAt(center.x,center.z),center.z);
        enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
        enemy.hp=enemy.maxHp=1e9;
        const originalNow=performance.now.bind(performance);let now=originalNow();
        performance.now=()=>now;
        let reached=false,minDistance=Infinity,frames=0;
        for(let frame=0;frame<60*90;frame++){
          frames=frame+1;
          now+=1000/60;updateEnemies(1/60);
          minDistance=Math.min(minDistance,enemy.group.position.distanceTo(baseGroup.position));
          if(enemy.atGate||minDistance<=GATE_ARRIVE_DIST){reached=true;break;}
        }
        performance.now=originalNow;
        rows.push({type,spawn,reached,minDistance,radius:enemy.radius,seconds:frames/60});
      }
    }
    return rows;
  });
  await page.close();
  for(const row of result)
    assert.equal(row.reached,true,`${row.type} 从 ${JSON.stringify(row.spawn)} 出发被碰撞体积堵死，最近 ${row.minDistance}，半径 ${row.radius}`);
  assert.ok(Math.max(...result.map((row)=>row.seconds))<=60,`慢速尸种抵达仍会拖长整波：${JSON.stringify(result)}`);
});

test("同点堆叠的尸潮会被碰撞半径撑开而不是穿模", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    state=STATE.PLAYING;game.wave=1;game.enemiesToSpawn=0;
    const spawn=ACTIVE_MODE.spawns[0],c=cellCenter(spawn.x,spawn.z);
    for(let i=0;i<8;i++){
      spawnEnemy("normal",false);
      const enemy=enemies[enemies.length-1];
      enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
      enemy.group.position.set(c.x,heightAt(c.x,c.z),c.z);
    }
    for(let frame=0;frame<48;frame++)updateEnemies(1/60);
    let min=Infinity;
    for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){
      const a=enemies[i],b=enemies[j];
      if(!a.alive||!b.alive)continue;
      min=Math.min(min,Math.hypot(a.group.position.x-b.group.position.x,a.group.position.z-b.group.position.z));
    }
    return {min,radius:enemies[0]&&enemies[0].radius,count:enemies.length};
  });
  await page.close();
  assert.equal(result.count,8);
  assert.ok(result.min>=result.radius*1.15,`尸潮仍穿模：最近 ${result.min} 半径 ${result.radius}`);
});

test("成群重甲尸潮启用实体分离后不会永久堵在远端", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    game.gateHp=game.gateMaxHp=1e9;baseAlive=true;state=STATE.PLAYING;
    for(let index=0;index<42;index++){
      spawnEnemy(index%5===0?"siege":"heavy",false);
      const enemy=enemies.at(-1);
      enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
      enemy.hp=enemy.maxHp=1e9;
    }
    const originalNow=performance.now.bind(performance);let now=originalNow();
    performance.now=()=>now;
    for(let frame=0;frame<60*190;frame++){
      now+=1000/60;updateEnemies(1/60);
      if(enemies.every((enemy)=>enemy.atGate))break;
    }
    performance.now=originalNow;
    return enemies.map((enemy)=>({
      type:enemy.type,atGate:enemy.atGate,
      distance:enemy.group.position.distanceTo(baseGroup.position),
      x:enemy.group.position.x,z:enemy.group.position.z,radius:enemy.radius,
    }));
  });
  await page.close();
  const stalled=result.filter((enemy)=>enemy.distance>18);
  assert.equal(stalled.length,0,`仍有 ${stalled.length} 只重甲尸潮堵在远端：${JSON.stringify(stalled.slice(0,5))}`);
  assert.ok(result.some((enemy)=>enemy.atGate),"尸群必须有人实际抵达大门并开始攻击");
});

test("门前队列解开重叠后保持稳定，不反复推搡", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    for(let i=0;i<8;i++){
      spawnEnemy("normal",false);
      const enemy=enemies.at(-1);enemy.spawnFlash=0;enemy.atGate=true;enemy._gateAttackSlot=false;
      const b=baseGroup.position;
      enemy.group.position.set(b.x+i*.12,heightAt(b.x,b.z+5),b.z+5);
    }
    for(let i=0;i<180;i++)applyHordeSeparation(1/60);
    const before=enemies.map(e=>e.group.position.clone());
    for(let i=0;i<120;i++)applyHordeSeparation(1/60);
    let min=Infinity;
    for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){
      const a=enemies[i],b=enemies[j];
      min=Math.min(min,a.group.position.distanceTo(b.group.position)/(a.radius+b.radius));
    }
    return {min,drift:Math.max(...enemies.map((e,i)=>e.group.position.distanceTo(before[i])))};
  });
  await page.close();
  assert.ok(result.min>.89,"等待队列仍需分离重叠身体");
  assert.ok(result.drift<.025,"队列稳定后不得持续抖动："+result.drift);
});

test("波次看门狗识别停滞后只重算寻路且不自动击杀残敌", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    for(let index=0;index<4;index++){
      spawnEnemy("normal",false);
      const enemy=enemies[enemies.length-1];
      enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
    }
    state=STATE.PLAYING;game.wave=1;game.enemiesToSpawn=0;
    _wdStallT=90;_wdKillTimer=0;
    for(let frame=0;frame<60*3;frame++)updateWatchdog(1/60);
    return {alive:enemies.filter((enemy)=>enemy.alive).length,stall:_wdStallT};
  });
  await page.close();
  assert.equal(result.alive,4,"正常慢磨或 Boss 停滞不得被看门狗代杀");
  assert.ok(result.stall>=90,"看门狗提示后仍应保留停滞诊断时间");
});

test("仍有待生成敌人时看门狗不得提前收割", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    state=STATE.PLAYING;game.wave=1;game.enemiesToSpawn=12;
    spawnEnemy("normal",false);
    const enemy=enemies[enemies.length-1];enemy.spawnFlash=0;enemy.hp=enemy.maxHp=1e9;
    _wdStallT=90;_wdKillTimer=0;_wdHarvesting=false;
    for(let frame=0;frame<60*3;frame++)updateWatchdog(1/60);
    return {alive:enemies.filter((item)=>item.alive).length,harvesting:_wdHarvesting,stall:_wdStallT,queued:game.enemiesToSpawn};
  });
  await page.close();
  assert.equal(result.harvesting,false,"出怪未完成时不得收割");
  assert.equal(result.alive,1);
  assert.equal(result.stall,0);
  assert.equal(result.queued,12);
});

test("战斗粒子使用单一合批渲染对象", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const before=scene.children.length;
    spawnParticles(new THREE.Vector3(0,2,0),0xffb02e,100,8,1);
    return {added:scene.children.length-before,particles:particles.length};
  });
  await page.close();
  assert.equal(result.particles,100);
  assert.ok(result.added<=1,`100个粒子新增了${result.added}个独立渲染对象`);
});

test("基地自动炮台发射玩家阵营子弹", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    bullets.splice(0).forEach((bullet)=>scene.remove(bullet.mesh));
    spawnEnemy("normal",false);const enemy=enemies[0];
    enemy.beam&&scene.remove(enemy.beam);enemy.beam=null;enemy.spawnFlash=0;
    enemy.group.position.copy(baseGroup.position).add(new THREE.Vector3(8,0,0));
    game.stats.autoTurretLv=1;autoTurretObj.userData.cd=0;
    updateAutoTurret(1/60);
    return {count:bullets.length,owner:bullets[0]&&bullets[0].owner};
  });
  await page.close();
  assert.ok(result.count>0,"自动炮台必须发射子弹");
  assert.equal(result.owner,"player","基地防御火力不得伤害玩家");
});

test("十波战役只在第五波和第十波设置 Boss", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>({
    regular:[1,2,3,4,6,7,8,9,11,12,13,14].some(isBossWave),
    bosses:[5,10,15].map(isBossWave),
  }));
  await page.close();
  assert.equal(result.regular,false,"普通波次不应误标 Boss");
  assert.deepEqual(result.bosses,[true,true,true]);
});

test("标准炮台专精和后续升级均必须支付金币", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    if(typeof turretUpgradeCost!=="function")return {exists:false};
    game.gold=999;
    const buildIndex=shopList().findIndex((item)=>item.id==="turret"),build=shopList()[buildIndex];
    const C=ACTIVE_MODE.canyon,anchor={x:C.x0+2,z:C.z0},center=footprintCenter(anchor,build);
    selectBuild(buildIndex);ghost.visible=true;placeBuildingImmediately(center.x,center.z);
    const turret=builtTurrets.find((item)=>item.cx===anchor.x&&item.cz===anchor.z);
    const branchCost=Math.round(priceOf(build)*.85);
    game.gold=branchCost-1;const blockedBranch=chooseTurretBranch(turret,"rapid");
    game.gold=branchCost;const paidBranch=chooseTurretBranch(turret,"rapid");
    const upgradeCost=turretUpgradeCost(turret);
    game.gold=upgradeCost-1;upgradeTurretAt(anchor.x,anchor.z);const blockedLevel=turret.level;
    game.gold=upgradeCost;upgradeTurretAt(anchor.x,anchor.z);
    return {exists:true,branchCost,upgradeCost,blockedBranch,paidBranch,key:turret.turretKey,blockedLevel,paidLevel:turret.level,gold:game.gold};
  });
  await page.close();
  assert.equal(result.exists,true);
  assert.ok(result.branchCost>0&&result.upgradeCost>0);
  assert.equal(result.blockedBranch,false,"金币不足时不得免费选择专精");
  assert.equal(result.paidBranch,true);
  assert.equal(result.key,"rapid");
  assert.equal(result.blockedLevel,0,"金币不足时不得免费升级");
  assert.equal(result.paidLevel,1);
  assert.equal(result.gold,0,"升级必须扣除全部金币");
});

test("四种专属炮台均提供五级选中升级链且价格逐级递增", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const branchSteps=Object.fromEntries(["rapid","cannon","antitank","emp"].map((key)=>[key,TURRET_TYPES[key].upgrade.length]));
    game.gold=999999;
    const buildIndex=shopList().findIndex((item)=>item.id==="turret"),build=shopList()[buildIndex];
    const C=ACTIVE_MODE.canyon,anchor={x:C.x0+2,z:C.z0},center=footprintCenter(anchor,build);
    selectBuild(buildIndex);ghost.visible=true;placeBuildingImmediately(center.x,center.z);
    const turret=builtTurrets.find((item)=>item.cx===anchor.x&&item.cz===anchor.z);
    chooseTurretBranch(turret,"rapid");
    const costs=[];
    for(let level=0;level<4;level++){
      costs.push(turretUpgradeCost(turret));
      upgradeTurretAt(anchor.x,anchor.z);
    }
    wc3Select("turret",turret);wc3RenderSel();renderCmdCard();
    const maxText=document.getElementById("cmdcard").textContent;
    const goldBefore=game.gold;
    upgradeTurretAt(anchor.x,anchor.z);
    return {
      branchSteps,costs,level:turret.level,displayLevel:turret.level+1,maxText,
      goldBefore,goldAfter:game.gold,visualLevel:turret.group.userData.turretVisualLevel,
    };
  });
  await page.close();
  assert.deepEqual(result.branchSteps,{rapid:4,cannon:4,antitank:4,emp:4},"每个专精必须有 Lv2-Lv5 四次升级");
  assert.equal(result.displayLevel,5);
  assert.ok(result.costs.every((cost,index)=>cost>0&&(index===0||cost>result.costs[index-1])),`升级价格必须严格递增：${result.costs.join(",")}`);
  assert.match(result.maxText,/已满级\s*Lv5/);
  assert.equal(result.goldAfter,result.goldBefore,"满级后不得继续扣款");
  assert.equal(result.visualLevel,5,"模型视觉等级必须同步到 Lv5");
});

test("专属炮台五级成长保持速射溅射穿甲贯穿四种职责", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const endpoint=(key)=>turretStats(key,4);
    return {
      rapidBase:TURRET_TYPES.rapid.stats,rapidMax:endpoint("rapid"),
      cannonBase:TURRET_TYPES.cannon.stats,cannonMax:endpoint("cannon"),
      antitankBase:TURRET_TYPES.antitank.stats,antitankMax:endpoint("antitank"),
      empBase:TURRET_TYPES.emp.stats,empMax:endpoint("emp"),
    };
  });
  await page.close();
  assert.ok(result.rapidMax.fireRate>=result.rapidBase.fireRate*1.6,"速射炮台满级必须主要提升射速");
  assert.ok(result.cannonMax.splash>=result.cannonBase.splash*1.45,"范围火炮满级必须扩大溅射");
  assert.ok(result.antitankMax.pierce>result.antitankBase.pierce,"反装甲炮满级必须提高穿甲");
  assert.ok(result.empMax.dmg>result.empBase.dmg,"激光满级提高贯穿伤害");
  assert.equal(result.empMax.slow||0,0,"激光不再附带旧减速光环");
});

test("标准炮台四个专精按钮显示动态金币价格", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;
    const buildIndex=shopList().findIndex((item)=>item.id==="turret"),build=shopList()[buildIndex];
    const C=ACTIVE_MODE.canyon,anchor={x:C.x0+2,z:C.z0},center=footprintCenter(anchor,build);
    selectBuild(buildIndex);ghost.visible=true;placeBuildingImmediately(center.x,center.z);
    const turret=builtTurrets.find((item)=>item.cx===anchor.x&&item.cz===anchor.z);
    wc3Select("turret",turret);wc3RenderSel();renderCmdCard();
    const expected=Math.round(priceOf(build)*.85);
    const buttons=[...document.querySelectorAll("#cmdcard [data-branch]")];
    return {expected,count:buttons.length,prices:buttons.map((button)=>button.querySelector(".cp")?.textContent.trim()),disabled:buttons.map((button)=>button.getAttribute("aria-disabled")==="true")};
  });
  await page.close();
  assert.equal(result.count,4);
  assert.deepEqual(result.prices,Array(4).fill(String(result.expected)),"四个专精按钮都必须单独标明当前价格");
  assert.deepEqual(result.disabled,[false,false,false,false]);
});

test("选中炮台或巨岩后金币增长会即时解锁升级按钮", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;
    const turretIndex=shopList().findIndex((item)=>item.id==="turret"),turretBuild=shopList()[turretIndex];
    const C=ACTIVE_MODE.canyon,turretAnchor={x:C.x0+1,z:C.z0},turretCenter=footprintCenter(turretAnchor,turretBuild);
    selectBuild(turretIndex);ghost.visible=true;placeBuildingImmediately(turretCenter.x,turretCenter.z);
    const turret=builtTurrets.find((item)=>item.cx===turretAnchor.x&&item.cz===turretAnchor.z);
    game.gold=0;wc3Select("turret",turret);wc3RenderSel();renderCmdCard();
    const turretBefore=document.querySelector("#cmdcard [data-branch]")?.getAttribute("aria-disabled")==="true";
    game.gold=turretBranchCost();updateGoldUI();
    const turretAfter=document.querySelector("#cmdcard [data-branch]")?.getAttribute("aria-disabled")==="true";

    game.gold=9999;const wallIndex=shopList().findIndex((item)=>item.id==="wall"),wallBuild=shopList()[wallIndex],wallAnchor={x:C.x0+2,z:C.z0};
    selectBuild(wallIndex);ghost.visible=true;const wallCenter=footprintCenter(wallAnchor,wallBuild);placeBuildingImmediately(wallCenter.x,wallCenter.z);
    game.gold=0;wc3Select("wall",wallAnchor);wc3RenderSel();renderCmdCard();
    const wallBefore=document.querySelector('#cmdcard [data-command-id="wall-up"]')?.getAttribute("aria-disabled")==="true";
    game.gold=wallPriceNext(1);updateGoldUI();
    const wallAfter=document.querySelector('#cmdcard [data-command-id="wall-up"]')?.getAttribute("aria-disabled")==="true";
    return {turretBefore,turretAfter,wallBefore,wallAfter};
  });
  await page.close();
  assert.deepEqual(result,{turretBefore:true,turretAfter:false,wallBefore:true,wallAfter:false});
});

test("单只普通僵尸按当前难度和前期减伤持续拆墙，不依赖收割兜底", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;state=STATE.PLAYING;game.wave=1;game.enemiesToSpawn=0;
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    const wallIndex=shopList().findIndex((item)=>item.id==="wall"),wall=shopList()[wallIndex],anchor={x:ACTIVE_MODE.canyon.x0,z:ACTIVE_MODE.canyon.z0};
    selectBuild(wallIndex);ghost.visible=true;const center=footprintCenter(anchor,wall);placeBuildingImmediately(center.x,center.z);
    spawnEnemy("normal",false);const enemy=enemies[0],approach=cellCenter(anchor.x+1,anchor.z);
    enemy.spawnFlash=0;enemy.group.position.set(approach.x,heightAt(approach.x,approach.z),approach.z);enemy.thinkTimer=0;
    const key=idx(anchor.x,anchor.z),initialHp=steelHP.get(key);
    // 普通难度为 0.75，第一波墙体伤害还应用 0.65 缓冲；固定 150 秒是旧平衡预期。
    const damage=enemyWallDamage(enemy),deadline=Math.ceil(initialHp/damage)*.9+10;
    for(let frame=0;frame<60*deadline&&steelHP.has(key)&&baseAlive;frame++){_animFrame++;updateEnemies(1/60);}
    return {initialHp,deadline,remainingHp:steelHP.get(key)||0,wallGone:!steelHP.has(key),enemyAlive:enemy.alive,watchdogHarvesting:_wdHarvesting};
  });
  await page.close();
  assert.equal(result.wallGone,true,`一级墙在预期 ${result.deadline} 秒持续攻击后仍剩 ${result.remainingHp}/${result.initialHp}`);
  assert.equal(result.enemyAlive,true,"修复必须依靠真实拆墙推进，不能删除残敌");
  assert.equal(result.watchdogHarvesting,false,"正常拆墙不能依赖超时收割兜底");
});

test("多层巨岩模型可反查为墙体选择对象", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;
    const wallIndex=shopList().findIndex((item)=>item.id==="wall"),wall=shopList()[wallIndex],C=ACTIVE_MODE.canyon,anchor={x:C.x0+2,z:C.z0};
    selectBuild(wallIndex);ghost.visible=true;const center=footprintCenter(anchor,wall);placeBuildingImmediately(center.x,center.z);
    const root=tileMeshes[idx(anchor.x,anchor.z)];let nested=null;
    root&&root.traverse((object)=>{if(!nested&&object.isMesh)nested=object;});
    const picked=typeof wallSelectionFromObject==="function"?wallSelectionFromObject(nested):null;
    return {nested:!!nested,picked,anchor};
  });
  await page.close();
  assert.equal(result.nested,true);
  assert.deepEqual(result.picked,{kind:"wall",ref:result.anchor});
});

test("选中巨岩墙可显示价格并逐级升级到五十级", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=1e9;
    const wallIndex=shopList().findIndex((item)=>item.id==="wall"),wall=shopList()[wallIndex],C=ACTIVE_MODE.canyon,anchor={x:C.x0+2,z:C.z0};
    selectBuild(wallIndex);ghost.visible=true;const center=footprintCenter(anchor,wall);placeBuildingImmediately(center.x,center.z);
    wc3Select("wall",anchor);wc3RenderSel();renderCmdCard();
    const firstButton=document.querySelector('#cmdcard [data-command-id="wall-up"]'),firstText=firstButton?.querySelector('.cn')?.textContent,displayedCost=firstButton?.querySelector('.cp')?.textContent,firstCost=wallPriceNext(1);
    firstButton&&firstButton.click();
    const afterFirst=wallLvAt(anchor.x,anchor.z);
    for(let level=afterFirst;level<50;level++){
      wc3RenderSel();renderCmdCard();document.querySelector('#cmdcard [data-command-id="wall-up"]')?.click();
    }
    wc3RenderSel();
    renderCmdCard();return {firstText,displayedCost,firstCost,afterFirst,finalLevel:wallLvAt(anchor.x,anchor.z),maxText:document.getElementById("cmdcard").textContent};
  });
  await page.close();
  assert.match(result.firstText||'',/升级 Lv2/);
  assert.equal(Number(result.displayedCost),result.firstCost);
  assert.equal(result.afterFirst,2);
  assert.equal(result.finalLevel,50);
  assert.match(result.maxText,/已满级/);
});

test("金矿首级回本时间保持在 45 到 90 秒", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const economy=ACTIVE_MODE.economy;
    return {seconds:economy.mineCost/economy.mineIncomeTiers[0]};
  });
  await page.close();
  assert.ok(result.seconds>=45&&result.seconds<=90,`金矿首级回本 ${result.seconds.toFixed(1)} 秒`);
});

test("新建金矿始终保持基础价格且点击已有金矿只进入选中状态", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;
    const buildIndex=shopList().findIndex((item)=>item.id==="goldmine"),build=shopList()[buildIndex];
    const anchor=(()=>{for(let z=2;z<GRID-3;z++)for(let x=2;x<GRID-3;x++){const point={x,z};if(footprintPlaceable(point,build))return point;}return null;})();
    const center=footprintCenter(anchor,build);
    const firstPrice=priceOf(build);
    selectBuild(buildIndex);ghost.visible=true;placeBuildingImmediately(center.x,center.z);
    const mine=goldMines.find((item)=>item.x===anchor.x&&item.z===anchor.z);
    const goldBeforeClick=game.gold;
    const priceAfterBuild=priceOf(build);
    ghost.visible=true;placeBuildingImmediately(center.x,center.z);
    return {
      firstPrice,priceAfterBuild,goldBeforeClick,goldAfterClick:game.gold,
      level:mine&&mine.level,selected:wc3Sel&&wc3Sel.kind,
      hasUpgradeButton:!!document.querySelector('#cmdcard [data-command-id="goldmine-up"]'),
    };
  });
  await page.close();
  assert.equal(result.firstPrice,70);
  assert.equal(result.priceAfterBuild,70,"继续新建一级金矿不得随已有数量涨价");
  assert.equal(result.goldAfterClick,result.goldBeforeClick,"点击已有金矿不得直接扣钱升级");
  assert.equal(result.level,1,"点击已有金矿不得再走覆盖升级");
  assert.equal(result.selected,"goldmine");
  assert.equal(result.hasUpgradeButton,true,"选中金矿后必须显示升级按钮");
});

test("金矿升级按钮按当前等级扣费并刷新收益", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const mine={x:7,z:7,level:1,group:new THREE.Group(),crystal:null,footprintCells:[]};
    goldMines.push(mine);game.gold=280;
    wc3Select("goldmine",mine);wc3RenderSel();renderCmdCard();
    const beforeText=document.getElementById("spStat").textContent;
    document.querySelector('#cmdcard [data-command-id="goldmine-up"]').click();
    return {
      beforeText,level:mine.level,gold:game.gold,
      afterText:document.getElementById("spStat").textContent,
      nextCost:goldMineUpCost(mine.level),
    };
  });
  await page.close();
  assert.match(result.beforeText,/1(?:\.0+)?\s*金\/秒/);
  assert.equal(result.level,2);
  assert.equal(result.gold,0);
  assert.match(result.afterText,/5(?:\.0+)?\s*金\/秒/);
  assert.equal(result.nextCost,1120);
});

test("生存清波奖励使用 economy.waveClearBonus 配置", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;game.wave=1;game.gold=0;_waveClearing=false;
    const expected=ACTIVE_MODE.economy.waveClearBonus(game.wave);
    waveCleared();
    return {expected,actual:game.gold};
  });
  await page.close();
  assert.equal(result.actual,result.expected);
});

test("生存模式每三波不再弹旧强化卡且直接进入下一波", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;game.wave=3;game.enemiesToSpawn=0;enemies.length=0;_waveClearing=false;
    waveCleared();
    window.advanceTime(2000);
    return {state,wave:game.wave,upgradeVisible:!document.getElementById("upgrade").classList.contains("hidden")};
  });
  await page.close();
  assert.equal(result.state,1);
  assert.equal(result.wave,4);
  assert.equal(result.upgradeVisible,false);
});

test("Boss 难度系数只应用一次", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    game.wave=15;spawnEnemy(null,true);
    const profile=SurvivalSystem.bossProfile(game.wave);
    const expected=Math.ceil((BOSS_TYPE.hp+(game.wave-5)*4)*(profile.hpMultiplier/4)*ACTIVE_MODE.difficultyScale(game.wave)*game.difficultyMultiplier);
    return {expected,actual:enemies[0].maxHp,bossId:enemies[0].bossId};
  });
  await page.close();
  assert.equal(result.actual,result.expected);
  assert.equal(result.bossId,"corrupted_colossus");
});

test("十波尸潮压低击杀经济并取消同屏上限", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>({
    killGold:ACTIVE_MODE.economy.killGold,
    earlyInterval:ACTIVE_MODE.spawnInterval(1),
    lateInterval:ACTIVE_MODE.spawnInterval(10),
    lateDifficulty:ACTIVE_MODE.difficultyScale(10),
    finalCount:ACTIVE_MODE.enemiesPerWave(10),
    firstCount:ACTIVE_MODE.enemiesPerWave(1),
    activeCap:ACTIVE_MODE.spawnCap(10),
    endlessCount:ACTIVE_MODE.enemiesPerWave(11),
  }));
  await page.close();
  assert.ok(result.killGold<=1.5,`单怪金币 ${result.killGold} 会随尸潮数量膨胀`);
  assert.equal(result.earlyInterval,0);
  assert.equal(result.lateInterval,0);
  assert.equal(result.firstCount,10);
  assert.equal(result.finalCount,1000);
  assert.equal(result.endlessCount,1100);
  assert.ok(result.lateDifficulty>1,`第 10 波难度系数 ${result.lateDifficulty}`);
  assert.ok(result.activeCap>1e6,`终局不得再设同屏上限，实际 ${result.activeCap}`);
});

test("第十波终局压力显著高于第五波 Boss", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>({
    count:ACTIVE_MODE.enemiesPerWave(10),
    wave5:ACTIVE_MODE.enemiesPerWave(5),
    difficulty:ACTIVE_MODE.difficultyScale(10),
    midDifficulty:ACTIVE_MODE.difficultyScale(5),
    giants:SurvivalSystem.waveProfile(10).giantChance,
  }));
  await page.close();
  assert.ok(result.count>=result.wave5*3,"第 10 波总量必须显著高于第 5 波");
  assert.ok(result.difficulty>result.midDifficulty,"终局属性压力必须高于中盘");
  assert.ok(result.giants>=0.4,"终焉波必须大量巨型丧尸");
});

test("标准炮台与四种专精形成清晰且有边界的火力职责", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>({
    base:TURRET_TYPES.turret.stats.dmg*TURRET_TYPES.turret.stats.fireRate,
    rapid:TURRET_TYPES.rapid.stats.dmg*TURRET_TYPES.rapid.stats.fireRate,
    cannonSplash:TURRET_TYPES.cannon.stats.splash,
    antitankPierce:TURRET_TYPES.antitank.stats.pierce,
    empControl:TURRET_TYPES.emp.stats.slow+TURRET_TYPES.emp.stats.stun,
  }));
  await page.close();
  assert.ok(result.base>=1.4&&result.base<=2,`标准炮台基础 DPS ${result.base}`);
  assert.ok(result.rapid>result.base,"速射分支必须提升持续输出");
  assert.ok(result.cannonSplash>0,"范围火炮必须具备溅射");
  assert.ok(result.antitankPierce>=.5,"反装甲炮必须具备高穿甲");
  assert.equal(result.empControl,0,"激光分支移除旧的区域减速控制");
});

test("炮台炮口的实际世界方向与锁定目标同向且子弹从炮口出膛", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const group=makeTurretMesh("cannon");
    group.position.set(0,0,0);scene.add(group);
    const turret=group.userData.turret;
    const target=new THREE.Vector3(0,0,20);
    turret.rotation.y=Math.atan2(target.x-group.position.x,target.z-group.position.z);
    const marker=turret.userData.muzzleMarker;
    if(!marker)return {hasMarker:false};
    scene.updateMatrixWorld(true);
    const muzzle=marker.getWorldPosition(new THREE.Vector3());
    const forward=muzzle.clone().sub(group.position).setY(0).normalize();
    const targetDir=target.clone().sub(group.position).setY(0).normalize();
    const before=bullets.length;
    shoot({group,dmg:1},targetDir,true,{thruWall:true,source:"turret",projectileType:"cannon",origin:muzzle});
    const projectile=bullets[before];
    const spawnDistance=projectile?projectile.mesh.position.distanceTo(muzzle):Infinity;
    scene.remove(group);
    return {hasMarker:true,dot:forward.dot(targetDir),spawnDistance};
  });
  await page.close();
  assert.equal(result.hasMarker,true,"炮塔必须声明可验证的炮口节点");
  assert.ok(result.dot>.96,`炮口朝向目标的点积仅 ${result.dot}`);
  assert.ok(result.spawnDistance<.01,`子弹距炮口 ${result.spawnDistance}`);
});

test("炮塔射击锁定丧尸模型的真实身体高度", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    bullets.splice(0).forEach((bullet)=>scene.remove(bullet.mesh));
    spawnEnemy("normal",false);
    const enemy=enemies[0];enemy.group.position.set(8,0,0);enemy.spawnFlash=0;
    const target=enemyAimPoint(enemy),muzzle=new THREE.Vector3(0,1.7,0);
    const direction=target.clone().sub(muzzle).normalize();
    const group=new THREE.Group();group.position.set(0,0,0);scene.add(group);
    shoot({group,dmg:1},direction,true,{origin:muzzle,thruWall:true,source:"turret",projectileType:"tank"});
    const projectile=bullets[bullets.length-1],beforeHp=enemy.hp;
    for(let frame=0;frame<30&&bullets.length;frame++)updateBullets(1/60);
    scene.remove(group);
    return {targetY:target.y,muzzleY:muzzle.y,velocityY:projectile?.vel.y||0,hasAimPoint:typeof enemyAimPoint==="function",damaged:enemy.hp<beforeHp};
  });
  await page.close();
  assert.equal(result.hasAimPoint,true,"必须提供丧尸模型命中点");
  assert.ok(result.targetY<result.muzzleY-.1,`命中点必须落在炮口以下：${result.targetY}`);
  assert.ok(result.velocityY<-.01,`子弹必须沿真实命中点下压：${result.velocityY}`);
  assert.equal(result.damaged,true,"子弹必须实际命中丧尸模型并造成伤害");
});

test("SkeletonUtils 不再读写已移除的 drawMode", () => {
  const source=fs.readFileSync(path.join(ROOT,"js","lib","SkeletonUtils.js"),"utf8");
  assert.doesNotMatch(source,/\.drawMode\b/);
});

test("render_game_to_text 暴露当前可玩状态和坐标系", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== "function") return { exists: false };
    return { exists: true, payload: JSON.parse(window.render_game_to_text()) };
  });
  await page.close();
  assert.equal(result.exists, true, "必须暴露 window.render_game_to_text");
  assert.equal(result.payload.version, require('../package.json').version);
  assert.equal(result.payload.mode, "survival");
  assert.match(result.payload.coordinateSystem, /origin/i);
  assert.equal(result.payload.player, null);
  assert.ok(Array.isArray(result.payload.enemies));
});

test("advanceTime 以固定 60Hz 步进一秒准备倒计时", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    if (typeof window.advanceTime !== "function") return { exists: false };
    game.prepTime = 10;
    window.advanceTime(1000);
    return { exists: true, prepTime: game.prepTime };
  });
  await page.close();
  assert.equal(result.exists, true, "必须暴露 window.advanceTime");
  assert.ok(Math.abs(result.prepTime - 9) < 0.001, `固定步进后应为 9，实际 ${result.prepTime}`);
});

test("菜单显示当前发布版本", async () => {
  const page = await openSurvival();
  const text = await page.locator("#menu .foot").innerText();
  await page.close();
  assert.ok(text.includes('v'+require('../package.json').version));
});

test("五级防线使用自建低矮封口墙", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const parent=new THREE.Group();scene.add(parent);
    const models=[],visuals=[],reinforcements=[],sizes=[];
    for(let lv=1;lv<=5;lv++){
      const wall=buildWallTile(parent,8+lv,8,lv);
      models.push(wall.userData.assetName);
      visuals.push(wall.userData.wallVisual);
      reinforcements.push(wall.userData.reinforcementLevel);
      const size=new THREE.Box3().setFromObject(wall).getSize(new THREE.Vector3());
      sizes.push({width:Math.max(size.x,size.z),height:size.y});
    }
    scene.remove(parent);
    return {models,visuals,reinforcements,sizes};
  });
  await page.close();
  assert.deepEqual(new Set(result.models),new Set(["handcrafted-cliff-wall"]));
  assert.ok(result.visuals.every((value)=>value==="cliff-bulkhead"));
  assert.deepEqual(result.reinforcements,[1,2,3,4,5]);
  assert.ok(result.sizes.every(({width})=>width>=3.5&&width<=5.5),`闸门应拉宽堵住 1 格路口：${JSON.stringify(result.sizes)}`);
  assert.ok(result.sizes.every(({height})=>height<2.6),`封口墙应为低矮防线：${JSON.stringify(result.sizes)}`);
});

test("生存场景移除距离雾并保留夜色、电影调色与单批次风沙", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => ({
    background:scene.background.getHex(),
    distanceFog:scene.fog,
    toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,
    dustPresent:!!(ashWindGroup&&ashWindGroup.parent===scene),
    dustCount:ashWindGroup&&ashWindGroup.geometry&&ashWindGroup.geometry.getAttribute("position").count,
    dustDrawObjects:scene.children.filter((child)=>child===ashWindGroup).length,
  }));
  await page.close();
  assert.equal(result.background,0x0b1019);
  assert.equal(result.distanceFog,null);
  assert.equal(result.toneMapping,4,"必须使用 ACESFilmicToneMapping");
  assert.ok(result.exposure>=0.78&&result.exposure<=0.9);
  assert.equal(result.dustPresent,true);
  assert.ok(result.dustCount>=48&&result.dustCount<=96);
  assert.equal(result.dustDrawObjects,1,"风沙必须合并为单个 Points 批次");
});

test("灰烬荒原装饰只保留岩堆与破损设施，不使用鲜花蘑菇和旗帜", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const names=[];mapGroup.traverse((object)=>{const name=object.userData&&object.userData.assetName;if(name)names.push(name);});
    return {names};
  });
  await page.close();
  for(const forbidden of ["flowers","mushrooms","flag","hedge","hedge-corner"])
    assert.ok(!result.names.includes(forbidden),`不得使用明快装饰 ${forbidden}`);
  assert.ok(result.names.includes("rocks-large"),"地图必须用大型岩堆建立末日轮廓");
  assert.ok(result.names.includes("fence-broken"),"地图必须使用断栅栏表达废墟叙事");
});

test("灰烬高台保持可建造区域亮度而不是压成黑块", async () => {
  const page = await openSurvival();
  const result = await page.evaluate(() => {
    const plateau=mapGroup.children.find((object)=>object.userData&&object.userData.assetName==="natural-plateau");
    const top=plateau&&plateau.material;
    const luminance=top&&top.color?top.color.r*.2126+top.color.g*.7152+top.color.b*.0722:0;
    let textureLuminance=0;
    if(top&&top.map&&top.map.image&&top.map.image.getContext){
      const data=top.map.image.getContext("2d").getImageData(0,0,top.map.image.width,top.map.image.height).data;
      let total=0;for(let i=0;i<data.length;i+=4)total+=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
      textureLuminance=total/(data.length/4);
    }
    return {exists:!!plateau,luminance,textureLuminance,variations:plateau&&plateau.userData.surfaceVariations||0,
      hasTexture:!!(top&&top.map),exposure:renderer.toneMappingExposure};
  });
  await page.close();
  assert.equal(result.exists,true);
  assert.equal(result.hasTexture,true,"高台顶面必须有碎石、压实土与磨损纹理，不能只显示纯色灰板");
  assert.ok(result.textureLuminance>=.3&&result.textureLuminance<=.55,`高台纹理亮度超出可读范围：${result.textureLuminance}`);
  assert.ok(result.variations>=4,"自然高坡保留多种碎石纹理变化");
  assert.ok(result.exposure>=.78&&result.exposure<=.9,`夜间调色必须保持可玩亮度：${result.exposure}`);
});

test("自然坡面在峡谷与坡口匹配实际高度，不悬空覆盖通道",async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{const p=mapGroup.getObjectByName('自然侵蚀高坡').geometry.attributes.position;let error=0;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),r=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row);if(Math.abs(x-r.x)<=TILE*.5+.001&&Math.abs(z-r.z)<=TILE*.5+.001)continue;error=Math.max(error,Math.abs(p.getY(i)+.015-heightAt(x,z)));}return {error,ramp:grid[ACTIVE_MODE.ramp.row][ACTIVE_MODE.ramp.col]===T_RAMP};});await page.close();assert.ok(result.error<.001);assert.ok(result.ramp);
});

test("研究院与重工厂均可建造且各自最多一座", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;
    const place=(id,anchor)=>{
      const index=shopList().findIndex((item)=>item.id===id),build=shopList()[index];
      selectBuild(index);ghost.visible=true;placeBuildingImmediately(...Object.values(footprintCenter(anchor,build)));
    };
    const next=(id)=>{const build=shopList().find((item)=>item.id===id),E=ACTIVE_MODE.enclosure;
      for(let z=E.z0+1;z<=E.z1-2;z++)for(let x=E.x0+1;x<=E.x1-2;x++)if(footprintPlaceable({x,z},build))return {x,z};
      return {x:E.x0+1,z:E.z0+1};};
    place("research",next("research"));
    place("factory",next("factory"));
    const goldBefore=game.gold;
    place("research",next("research"));
    place("factory",next("factory"));
    return {research:researchInstitutes.length,factories:heavyFactories.length,goldBefore,goldAfter:game.gold};
  });
  await page.close();
  assert.equal(result.research,1);
  assert.equal(result.factories,1);
  assert.equal(result.goldAfter,result.goldBefore,"第二座建筑被拒绝时不得扣金币");
});

test("重工厂队列生产四类友军并正确预留人口", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;game.popMax=99;
    const index=shopList().findIndex((item)=>item.id==="factory"),build=shopList()[index];
    const cell=(()=>{const E=ACTIVE_MODE.enclosure;for(let z=E.z0+1;z<E.z1-2;z++)for(let x=E.x0+1;x<E.x1-2;x++)if(footprintPlaceable({x,z},build))return {x,z};return null;})();
    selectBuild(index);ghost.visible=true;const center=footprintCenter(cell,build);placeBuildingImmediately(center.x,center.z);
    const factory=heavyFactories[0];
    const queued=["light","medium","heavy","repair"].map((id)=>queueFactoryUnit(factory,id));
    for(let frame=0;frame<60*50;frame++)updateFactories(1/60);
    return {queued,types:friendlyUnits.map((unit)=>unit.type).sort(),popUsed:game.popUsed,queue:factory.queue.length};
  });
  await page.close();
  assert.deepEqual(result.queued,[true,true,true,true]);
  assert.deepEqual(result.types,["heavy","light","medium","repair"]);
  assert.equal(result.popUsed,12);
  assert.equal(result.queue,0);
});

test("重工厂集结点会传递给新生产的单位", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;game.popMax=99;
    const index=shopList().findIndex((item)=>item.id==="factory"),build=shopList()[index];
    const cell=(()=>{const E=ACTIVE_MODE.enclosure;for(let z=E.z0+1;z<E.z1-2;z++)for(let x=E.x0+1;x<E.x1-2;x++)if(footprintPlaceable({x,z},build))return {x,z};return null;})();
    selectBuild(index);ghost.visible=true;const center=footprintCenter(cell,build);placeBuildingImmediately(center.x,center.z);
    const factory=heavyFactories[0],rally={x:42,z:18};
    const set=typeof setFactoryRallyPoint==="function"&&setFactoryRallyPoint(factory,rally);
    queueFactoryUnit(factory,"light");
    for(let frame=0;frame<60*8;frame++)updateFactories(1/60);
    const unit=friendlyUnits[0];
    return {set,rally:factory.rally,target:unit&&unit.moveTarget,command:unit&&unit.command};
  });
  await page.close();
  assert.equal(result.set,true);
  assert.deepEqual(result.rally,{x:42,z:18});
  assert.deepEqual(result.target,{x:42,z:18});
  assert.equal(result.command,"move");
});

test("取消重工厂队列会释放预留人口并返还四分之三金币", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=1000;game.popMax=99;
    const index=shopList().findIndex((item)=>item.id==="factory"),build=shopList()[index];
    const cell=(()=>{const E=ACTIVE_MODE.enclosure;for(let z=E.z0+1;z<E.z1-2;z++)for(let x=E.x0+1;x<E.x1-2;x++)if(footprintPlaceable({x,z},build))return {x,z};return null;})();
    selectBuild(index);ghost.visible=true;const center=footprintCenter(cell,build);placeBuildingImmediately(center.x,center.z);
    const factory=heavyFactories[0],before=game.gold;
    queueFactoryUnit(factory,"heavy");const afterQueue={gold:game.gold,pop:game.popUsed};
    const cancelled=typeof cancelFactoryQueue==="function"&&cancelFactoryQueue(factory);
    return {before,afterQueue,cancelled,gold:game.gold,pop:game.popUsed,queue:factory.queue.length};
  });
  await page.close();
  assert.equal(result.cancelled,true);
  assert.equal(result.queue,0);
  assert.equal(result.pop,0);
  assert.equal(result.afterQueue.pop,5,"重型坦克应按人口预占 5");
  assert.equal(result.gold,result.afterQueue.gold+Math.round(SurvivalSystemForTests.FRIENDLY_UNIT_TYPES.heavy.cost*.75));
});

test("维修车消耗金币维修其他目标但不能自修", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=100;
    const repair=createFriendlyUnit("repair",{x:0,z:0});
    const other=createFriendlyUnit("light",{x:1,z:0});
    repair.hp=80;other.hp=other.maxHp-100;
    repair.repairTarget=other;
    for(let frame=0;frame<60;frame++)updateFriendlyUnits(1/60);
    const afterOther={hp:other.hp,gold:game.gold};
    repair.repairTarget=repair;
    for(let frame=0;frame<60;frame++)updateFriendlyUnits(1/60);
    return {afterOther,repairHp:repair.hp,gold:game.gold};
  });
  await page.close();
  assert.ok(result.afterOther.hp>50,"维修目标应恢复生命");
  assert.ok(result.afterOther.gold<100,"维修必须消耗金币");
  assert.equal(result.repairHp,80,"维修车不能维修自己");
  assert.equal(result.gold,result.afterOther.gold,"自修不得扣金币");
});

test("多选移动、停止和巡逻命令作用于全部友军", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const a=createFriendlyUnit("light",{x:0,z:0}),b=createFriendlyUnit("medium",{x:2,z:0});
    wc3SetSelection([{kind:"unit",ref:a},{kind:"unit",ref:b}]);
    issueSelectionCommand("move",{x:12,z:12});
    const moved=[a,b].every((unit)=>unit.moveTarget&&unit.moveTarget.x!=null);
    issueSelectionCommand("patrol",{x:18,z:12});
    const patrol=[a,b].every((unit)=>unit.command==="patrol"&&unit.patrolPoints.length===2);
    issueSelectionCommand("stop");
    return {count:wc3Selection.length,moved,patrol,stopped:[a,b].every((unit)=>!unit.moveTarget&&unit.command==="stop")};
  });
  await page.close();
  assert.deepEqual(result,{count:2,moved:true,patrol:true,stopped:true});
});

test("运行态十波谱系与战役 Boss 配置一致", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>({
    victory:ACTIVE_MODE.victoryWave,
    bosses:[5,10].map((wave)=>SurvivalSystem.bossProfile(wave).id),
    endlessBoss:SurvivalSystem.bossProfile(15).id,
    profiles:[1,2,3,4,6,7,8,9,10].map((wave)=>SurvivalSystem.waveProfile(wave).archetype),
    isBoss4:isBossWave(4),
    isEndless:SurvivalSystem.waveProfile(11).isEndless,
  }));
  await page.close();
  assert.equal(result.victory,10);
  assert.deepEqual(result.bosses,["corpse_king","doom_keeper"]);
  assert.equal(result.endlessBoss,"corrupted_colossus");
  assert.deepEqual(result.profiles,["normal","fast","heavy","mixed","siege","elite","heavy","lifesteal","finale"]);
  assert.equal(result.isBoss4,false);
  assert.equal(result.isEndless,true);
});

test("波间打开建造界面不会吞掉下一波", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;game.wave=2;game.enemiesToSpawn=0;
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    waveCleared();
    openWc3Build();
    window.advanceTime(2100);
    return {state,wave:game.wave,toSpawn:game.enemiesToSpawn,active:activeEnemyCount(),transition:game.waveTransition||null};
  });
  await page.close();
  assert.equal(result.state,5,"建造命令卡应保持打开");
  assert.equal(result.wave,3,`下一波必须在建造界面打开期间可靠启动：${JSON.stringify(result)}`);
  assert.ok(result.toSpawn>0||result.active>0,"第3波必须产生待生成敌人或已倾泻上场");
});

test("剩余存活敌人为零时立即进入休整且不等待死亡动画对象清理", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;game.wave=1;game.enemiesToSpawn=0;game.gold=0;_waveClearing=false;
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    const corpse={alive:false,dying:true,dyingT:0,group:new THREE.Group(),score:0};
    scene.add(corpse.group);enemies.push(corpse);
    updateEnemies(.016);
    return {
      corpseRetained:enemies.includes(corpse),
      clearing:_waveClearing,
      hasTransition:!!game.waveTransition,
      nextWave:game.waveTransition&&game.waveTransition.nextWave,
    };
  });
  await page.close();
  assert.equal(result.corpseRetained,true,"死亡动画对象应可继续留在场景中播放");
  assert.equal(result.clearing,true,"存活敌人归零必须立即锁定清波状态");
  assert.equal(result.hasTransition,true,"必须立即创建休整/下一波倒计时");
  assert.equal(result.nextWave,2);
});

test("第一波场上十八只全部死亡后可靠进入第二波而不会卡在 WAVE 1", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    state=STATE.PLAYING;game.wave=1;game.enemiesToSpawn=0;_waveClearing=false;
    for(let index=0;index<18;index++)spawnEnemy("normal",false);
    updateEnemyLeftUI();const before=document.getElementById("enemyLeft").textContent;
    enemies.slice().forEach((enemy)=>killEnemy(enemy,false));
    updateEnemies(.016);const zero=document.getElementById("enemyLeft").textContent;
    window.advanceTime(2000);
    return {before,zero,wave:game.wave,toSpawn:game.enemiesToSpawn,active:enemies.filter((enemy)=>enemy.alive).length,transition:game.waveTransition};
  });
  await page.close();
  assert.match(result.before,/剩余 18 · 场上 18 \/ 待出 0/);
  assert.match(result.zero,/剩余 0 · 场上 0 \/ 待出 0/);
  assert.equal(result.wave,2,JSON.stringify(result));
  assert.ok(result.toSpawn>0||result.active>0,"第二波启动后应有待生成或已进入战场的敌人");
});

test("建筑拆除后完整释放原足迹并可在同一位置重新建造", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=999999;
    const build=shopList().find((item)=>item.id==="house");
    const buildIndex=shopList().findIndex((item)=>item.id==="house");
    let anchor=null;
    for(let z=3;z<GRID-3&&!anchor;z++)for(let x=18;x<GRID-3;x++){
      const candidate={x,z};if(footprintPlaceable(candidate,build)){anchor=candidate;break;}
    }
    selectBuild(buildIndex);ghost.visible=true;
    const anchorWorld=cellCenter(anchor.x,anchor.z);placeBuildingImmediately(anchorWorld.x,anchorWorld.z);
    const first=builtHouses.find((item)=>item.x===anchor.x&&item.z===anchor.z);
    const occupiedBefore=first.footprintCells.every((cellIndex)=>structCells.has(cellIndex));
    attemptDestroy(anchor.x,anchor.z);
    const released=first.footprintCells.every((cellIndex)=>!structCells.has(cellIndex));
    const placeableAgain=footprintPlaceable(anchor,build);
    destroyMode=true;selectBuild(buildIndex);
    const destroyToolExited=!destroyMode;
    ghost.visible=true;placeBuildingImmediately(anchorWorld.x,anchorWorld.z);
    const rebuilt=builtHouses.some((item)=>item.x===anchor.x&&item.z===anchor.z);
    return {occupiedBefore,released,placeableAgain,destroyToolExited,rebuilt};
  });
  await page.close();
  assert.deepEqual(result,{occupiedBefore:true,released:true,placeableAgain:true,destroyToolExited:true,rebuilt:true});
});

test("巨岩被僵尸砸毁后原格立即恢复建造资格", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    let target=null;
    for(const [cellIndex,meta] of wallMeta){
      const x=cellIndex%GRID,z=Math.floor(cellIndex/GRID);
      if(meta&&cellPlaceable({x,z})===false){target={x,z,cellIndex};break;}
    }
    if(!target){
      const build=shopList().find((item)=>item.kind==="wall");
      for(let z=3;z<GRID-3&&!target;z++)for(let x=18;x<GRID-3;x++)if(footprintPlaceable({x,z},build)){
        game.gold=9999;const buildIndex=shopList().indexOf(build);selectBuild(buildIndex);ghost.visible=true;
        const center=cellCenter(x,z);placeBuildingImmediately(center.x,center.z);target={x,z,cellIndex:idx(x,z)};break;
      }
    }
    const occupied=structCells.has(target.cellIndex);
    damageWallCell(target.x,target.z,999999);
    return {occupied,released:!structCells.has(target.cellIndex),placeable:cellPlaceable({x:target.x,z:target.z})};
  });
  await page.close();
  assert.deepEqual(result,{occupied:true,released:true,placeable:true});
});

test("人口房研究院和重工厂使用紧凑占地", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>Object.fromEntries(shopList()
    .filter((item)=>["house","research","factory"].includes(item.id))
    .map((item)=>[item.id,item.footprint])));
  await page.close();
  assert.deepEqual(result,{house:[1,1],research:[2,2],factory:[2,2]});
});

test("重装吸血攻城与精英尸潮使用三套非方块人模型并保留骨骼动画", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    game.wave=13;
    for(const type of ["heavy","lifesteal","siege","elite"])spawnEnemy(type,false);
    return enemies.map((enemy)=>({type:enemy.type,variant:enemy.variantId||null,
      model:enemy.animationRoot&&enemy.animationRoot.userData&&enemy.animationRoot.userData.assetName||null,
      animated:!!(enemy.mixer&&enemy.actions.walk)}));
  });
  await page.close();
  assert.ok(result.every((row)=>row.variant!==null),JSON.stringify(result));
  assert.ok(result.every((row)=>["survivors","retro","protagonists"].includes(row.variant.split("-")[0])),JSON.stringify(result));
  assert.ok(result.every((row)=>row.animated),JSON.stringify(result));
});

test("非方块人混合尸潮在高数量时不退化为乱扭几何体", async () => {
  const required=[
    "assets/survivors/survivor-zombie.glb","assets/survivors/survivor-idle.glb","assets/survivors/survivor-run.glb",
    "assets/survivors/zombie-a.png","assets/survivors/zombie-c.png",
    "assets/retro/retro-zombie.glb","assets/retro/retro-idle.glb","assets/retro/retro-run.glb",
    "assets/retro/zombie-female-a.png","assets/retro/zombie-male-a.png",
    "assets/survivors/survivor-female-a.png","assets/survivors/survivor-male-b.png",
    "assets/retro/human-female-a.png","assets/retro/human-male-a.png",
    "assets/protagonists/criminal-male-a.png","assets/protagonists/cyborg-female-a.png",
    "assets/protagonists/skater-female-a.png","assets/protagonists/skater-male-a.png",
  ];
  for(const relative of required)assert.equal(fs.existsSync(path.join(ROOT,relative)),true,`${relative} 缺失`);
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    game.wave=1;
    for(let index=0;index<60;index++)spawnEnemy(["normal","fast","heavy","sniper"][index%4],false);
    return {
      variants:[...new Set(enemies.map((enemy)=>enemy.variantId).filter(Boolean))],
      packs:[...new Set(enemies.map((enemy)=>enemy.variantPack).filter(Boolean))],
      animated:enemies.filter((enemy)=>enemy.characterModel&&enemy.mixer&&enemy.actions.walk).length,
      procedural:enemies.filter((enemy)=>enemy.crowdLod).length,
      textures:Object.keys(ASSET_TEXTURES).sort(),
    };
  });
  await page.close();
  assert.equal(result.variants.length,4,JSON.stringify(result));
  assert.deepEqual(result.packs.sort(),["retro","survivors"],"尸潮候选只能使用已验收的两套僵尸角色包");
  assert.equal(result.animated,60,"所有尸潮单位都必须使用原生骨骼移动动画");
  assert.equal(result.procedural,0,"高密度尸潮不得回退成程序化乱扭几何体");
  assert.deepEqual(result.textures,["criminal-male-a","cyborg-female-a","human-female-a","human-male-a","skater-female-a","skater-male-a","survivor-female-a","survivor-male-b","zombie-a","zombie-c","zombie-female-a","zombie-male-a"]);
});

test("四种合格尸潮骨骼变体均可进入正式渲染管线", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    game.wave=1;const rows=[];
    for(let index=0;index<4;index++){
      spawnEnemy("normal",false);const enemy=enemies[enemies.length-1];
      const broken=[];enemy.group.traverse((object)=>{if(object.isSkinnedMesh&&!object.skeleton)broken.push(object.name||"unnamed");});
      let error=null;try{renderer.render(scene,camera);}catch(caught){error=String(caught&&caught.message||caught);}
      rows.push({variant:enemy.variantId,broken,error});
    }
    return {rows,sources:["survivor-zombie","retro-zombie"].map((name)=>{const broken=[];ASSETS[name].traverse((object)=>{if(object.isSkinnedMesh&&!object.skeleton)broken.push(object.name||"unnamed");});return {name,broken};})};
  });
  await page.close();
  assert.deepEqual(result.sources,[{name:"survivor-zombie",broken:[]},{name:"retro-zombie",broken:[]}]);
  for(const row of result.rows){
    assert.deepEqual(row.broken,[],`${row.variant} 含未绑定骨架：${JSON.stringify(row)}`);
    assert.equal(row.error,null,`${row.variant} 无法渲染：${JSON.stringify(row)}`);
  }
});

test("四种普通僵尸尺寸贴图和动画绑定满足实战视觉门禁", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    game.wave=1;const rows=[];
    for(let index=0;index<4;index++){
      spawnEnemy("normal",false);const enemy=enemies[enemies.length-1];
      const clip=enemy.actions.walk&&enemy.actions.walk.getClip();
      const trackedObjects=[];
      for(const track of clip?.tracks||[]){
        const parsed=THREE.PropertyBinding.parseTrackName(track.name);
        const object=THREE.PropertyBinding.findNode(enemy.animationRoot,parsed.nodeName);
        if(object&&!trackedObjects.includes(object))trackedObjects.push(object);
      }
      const transforms=trackedObjects.map((object)=>({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()}));
      if(enemy.actions.walk){enemy.actions.idle?.stop();enemy.actions.walk.reset().play();enemy.mixer.update(.17);}
      const changedTargets=transforms.filter(({object,position,quaternion,scale})=>object.position.distanceToSquared(position)>1e-8||1-Math.abs(object.quaternion.dot(quaternion))>1e-8||object.scale.distanceToSquared(scale)>1e-8).length;
      enemy.group.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(enemy.group),size=box.getSize(new THREE.Vector3());
      let meshes=0,mapped=0,finiteBones=true;
      enemy.animationRoot.traverse((object)=>{
        if(object.isMesh){meshes++;const materials=Array.isArray(object.material)?object.material:[object.material];if(materials.some((material)=>material&&material.map))mapped++;}
        if(object.isBone&&!object.matrixWorld.elements.every(Number.isFinite))finiteBones=false;
      });
      const unresolved=[];
      for(const track of clip?.tracks||[]){
        const parsed=THREE.PropertyBinding.parseTrackName(track.name);
        if(!THREE.PropertyBinding.findNode(enemy.animationRoot,parsed.nodeName))unresolved.push(parsed.nodeName);
      }
      rows.push({variant:enemy.variantId,pack:enemy.variantPack,height:size.y,width:size.x,depth:size.z,meshes,mapped,finiteBones,unresolved:[...new Set(unresolved)],changedTargets,clipDuration:clip?.duration||0,localYaw:enemy.animationRoot.rotation.y});
    }
    let renderError=null;try{renderer.render(scene,camera);}catch(error){renderError=String(error&&error.message||error);}
    return {rows,renderError};
  });
  await page.close();
  assert.equal(result.renderError,null,JSON.stringify(result));
  assert.equal(new Set(result.rows.map((row)=>row.variant)).size,4);
  for(const row of result.rows){
    assert.ok(row.height>=.55&&row.height<=1.35,`${row.variant} 普通僵尸高度异常：${JSON.stringify(row)}`);
    assert.ok(Math.max(row.width,row.depth)<=1.8,`${row.variant} 普通僵尸横向尺寸异常：${JSON.stringify(row)}`);
    assert.ok(row.meshes>0&&row.mapped>0,`${row.variant} 不得以无贴图灰模进入战场：${JSON.stringify(row)}`);
    assert.equal(row.finiteBones,true,`${row.variant} 骨骼矩阵存在非有限值`);
    assert.deepEqual(row.unresolved,[],`${row.variant} 动画轨道未绑定：${JSON.stringify(row)}`);
    assert.ok(row.clipDuration>=.4,`${row.variant} 行走片段被错误截成单帧：${JSON.stringify(row)}`);
    assert.ok(row.changedTargets>0,`${row.variant} 播放行走动作后模型姿态没有变化：${JSON.stringify(row)}`);
    assert.ok(Math.abs(row.localYaw)<1e-6,`${row.variant} 模型局部前向被反转：${JSON.stringify(row)}`);
  }
});

test("无官方攻击死亡片段的角色使用受控骨骼前扑与倒地过渡", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    game.wave=1;spawnEnemy("normal",false);const enemy=enemies[0];
    if(enemy.beam){scene.remove(enemy.beam);disposeTransientObject3D(enemy.beam);enemy.beam=null;}enemy.spawnFlash=0;
    const arm=enemy.poseBones.LeftArm,fore=enemy.poseBones.LeftForeArm,before=arm.quaternion.clone();
    enemy.dir.set(0,0,1);enemy.group.rotation.y=0;enemy._attackedNow=false;updateEnemies(.04);
    const along=fore
      ?new THREE.Vector3().subVectors(fore.getWorldPosition(new THREE.Vector3()),arm.getWorldPosition(new THREE.Vector3())).normalize()
      :new THREE.Vector3(1,0,0).transformDirection(arm.matrixWorld).normalize();
    const forwardDot=along.dot(new THREE.Vector3(0,0,1));
    enemy._attackedNow=true;updateEnemies(.04);updateEnemies(.08);
    const armMoved=1-Math.abs(before.dot(arm.quaternion));
    killEnemy(enemy,false);updateEnemies(.42);
    return {poseBones:Object.keys(enemy.poseBones).sort(),armMoved,forwardDot,dying:enemy.dying,
      fall:Math.abs(enemy.visualRoot.rotation.z),stillPresent:enemies.includes(enemy)};
  });
  await page.close();
  assert.ok(result.poseBones.includes("LeftArm")&&result.poseBones.includes("RightArm")&&result.poseBones.includes("Chest"),JSON.stringify(result));
  assert.ok(result.forwardDot>0.55,`手臂必须朝奔跑前方举起，前向点积 ${result.forwardDot}`);
  assert.ok(result.armMoved>1e-5,"攻击姿态必须落在手臂骨骼而不是旋转整个人物");
  assert.equal(result.dying,true);assert.equal(result.stillPresent,true);
  assert.ok(result.fall>.1,"死亡后必须先播放受控倒地过渡再清理模型");
});

test("尸群密度驱动低透明暗红血雾且不恢复远距雾", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.wave=20;
    for(let index=0;index<24;index++)spawnEnemy("normal",false);
    enemies.forEach((enemy)=>{enemy.group.visible=true;enemy.spawnFlash=0;});
    updateBloodMist(3);
    return {distanceFog:scene.fog,count:bloodMistSurfaces.length,
      rows:bloodMistSurfaces.map((surface)=>({tag:surface.mesh.userData.bloodMist,opacity:surface.material.opacity,
        depthWrite:surface.material.depthWrite,renderOrder:surface.mesh.renderOrder}))};
  });
  await page.close();
  assert.equal(result.distanceFog,null,"最大视距不得重新出现距离雾");
  assert.ok(result.count>=2,JSON.stringify(result));
  for(const row of result.rows){
    assert.equal(row.tag,true);assert.equal(row.depthWrite,false);assert.ok(row.opacity>0&&row.opacity<=.22,JSON.stringify(row));
    assert.ok(row.renderOrder<4,"血雾必须位于战争迷雾层下方");
  }
});

test("生存模式运行态提供夜景、战争迷雾与受控光源", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>({
    background:scene.background.getHex(),distanceFog:scene.fog,
    hemi:hemi.intensity,ambient:ambient.intensity,sun:sun.intensity,
    fogCanvas:!!document.getElementById("survivalFogCanvas"),
    fogPlanes:scene.children.filter((child)=>child.userData&&child.userData.visionFog).length,
    dynamicLights:scene.children.filter((child)=>child.isPointLight&&child.userData&&child.userData.survivalLight).length,
  }));
  await page.close();
  assert.ok(result.background<=0x18202c);
  assert.equal(result.distanceFog,null);
  assert.ok(result.hemi<0.65&&result.ambient<0.45&&result.sun<0.8);
  assert.equal(result.fogCanvas,true);
  assert.ok(result.fogPlanes>=1);
  assert.ok(result.dynamicLights>=2&&result.dynamicLights<=8);
});

test("灯光启用、拆除和重开复用固定槽位，不改变场景灯光数量", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PAUSED;const count=()=>scene.children.filter(o=>o.isPointLight).length;
    const before=count(),active=survivalDynamicLights.length,light=registerSurvivalPointLight(0,5,0,1,20);
    const allocated=light?.intensity===1&&survivalDynamicLights.length===active+1;
    const enabled=count();removeSurvivalPointLight(light);const removed=count();
    const released=light.intensity===0&&survivalDynamicLights.length===active;
    const reused=registerSurvivalPointLight(2,5,2,1,20)===light;
    removeSurvivalPointLight(light);resetGame();return {before,enabled,removed,restarted:count(),allocated,released,reused};
  });
  await page.close();assert.deepEqual(result,{before:8,enabled:8,removed:8,restarted:8,allocated:true,released:true,reused:true});
});

test("固定路灯只在低地道路外侧并让灯头朝向路面", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const corridor=new Set(),ramp=ACTIVE_MODE.ramp,enclosure=ACTIVE_MODE.enclosure,canyon=ACTIVE_MODE.canyon;
    if(canyon){
      for(let z=canyon.z0;z<=canyon.z1;z++)for(let x=canyon.x0;x<=canyon.x1;x++)corridor.add(idx(x,z));
      if(inMap(ramp.col+1,ramp.row))corridor.add(idx(ramp.col+1,ramp.row));
    }else{
      const entryX=ramp.col+1,laneX=entryX+1,north=enclosure.z0-2,gz=ramp.row;
      (ACTIVE_MODE.spawns||[]).forEach((spawn)=>{
        if(spawn.x>laneX){
          for(let z=Math.min(spawn.z,gz);z<=Math.max(spawn.z,gz);z++)corridor.add(idx(spawn.x,z));
          for(let x=laneX;x<=spawn.x;x++)corridor.add(idx(x,gz));
        }else{
          for(let z=Math.min(spawn.z,north);z<=Math.max(spawn.z,north);z++)corridor.add(idx(spawn.x,z));
          for(let x=spawn.x;x<=laneX;x++)corridor.add(idx(x,north));
          for(let z=north;z<=gz;z++)corridor.add(idx(laneX,z));
        }
      });
      for(let x=entryX;x<=laneX;x++)corridor.add(idx(x,gz));
    }
    return {tile:TILE,lamps:mapGroup.children
      .filter((child)=>child.userData&&child.userData.fixedNightLight)
      .map((post)=>{
      const target=post.userData.roadTarget;
      const cell=cellOf(post.position.x,post.position.z);
      const forward=new THREE.Vector3(0,0,1).applyQuaternion(post.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const toward=target?new THREE.Vector3(target.x-post.position.x,0,target.z-post.position.z).normalize():new THREE.Vector3();
      return {label:post.userData.fixedNightLight,ground:heightAt(post.position.x,post.position.z),
        cell,onRoad:corridor.has(idx(cell.x,cell.z)),
        target:!!target,distance:target?Math.hypot(target.x-post.position.x,target.z-post.position.z):0,
        facing:target?forward.dot(toward):0};
      })};
  });
  await page.close();
  assert.ok(result.lamps.length===2,"入口两侧保留两处照明，移除挡进路的第三盏");
  for(const lamp of result.lamps){
    assert.ok(lamp.ground<1,`路灯 ${lamp.label} 不得放在高地上`);
    assert.equal(lamp.onRoad,false,`路灯 ${lamp.label} 的格子 (${lamp.cell.x},${lamp.cell.z}) 不得占用完整尸潮道路`);
    assert.equal(lamp.target,true,`路灯 ${lamp.label} 必须记录所照道路方向`);
    assert.ok(lamp.distance>=result.tile*2&&lamp.distance<=result.tile*3,`路灯 ${lamp.label} 必须位于路边而非路中央`);
    assert.ok(lamp.facing>.8,`路灯 ${lamp.label} 的灯头必须朝向道路`);
  }
});

test("医疗灯塔邻格可以正常放下 1 格建筑", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;openWc3Build();
    const beaconIndex=shopList().findIndex((item)=>item.id==="beacon"),beaconBuild=shopList()[beaconIndex];
    const houseIndex=shopList().findIndex((item)=>item.id==="house"),houseBuild=shopList()[houseIndex];
    const E=ACTIVE_MODE.enclosure;let beaconCell=null;
    for(let z=E.z0+1;z<E.z1-2&&!beaconCell;z++)for(let x=E.x0+1;x<E.x1-2;x++)if(footprintPlaceable({x,z},beaconBuild)){beaconCell={x,z};break;}
    selectBuild(beaconIndex);ghost.visible=true;const beaconCenter=footprintCenter(beaconCell,beaconBuild);placeBuildingImmediately(beaconCenter.x,beaconCenter.z);
    const neighbors=[{x:beaconCell.x+1,z:beaconCell.z},{x:beaconCell.x-1,z:beaconCell.z},{x:beaconCell.x,z:beaconCell.z+1},{x:beaconCell.x,z:beaconCell.z-1}];
    const neighbor=neighbors.find((cell)=>footprintPlaceable(cell,houseBuild));
    if(!neighbor)return {beacon:true,neighbor:null,placed:false,poolRadius:null};
    selectBuild(houseIndex);ghost.visible=true;ghostCell=neighbor;const houseCenter=footprintCenter(neighbor,houseBuild);placeBuildingImmediately(houseCenter.x,houseCenter.z);
    const beacon=visionBeacons[0],pool=beacon&&beacon.pool,poolRadius=pool&&pool.geometry&&pool.geometry.parameters&&pool.geometry.parameters.radius;
    return {beacon:!!beacon,neighbor,placed:builtHouses.some((house)=>house.x===neighbor.x&&house.z===neighbor.z),poolRadius};
  });
  await page.close();
  assert.equal(result.beacon,true);
  assert.ok(result.neighbor,`灯塔邻格必须可建造：${JSON.stringify(result)}`);
  assert.equal(result.placed,true,"邻格点击必须真正放下人口房，不能被灯塔光斑吸走");
  assert.ok(result.poolRadius>0&&result.poolRadius<=1.6,`灯塔光斑半径过大：${result.poolRadius}`);
});

test("警戒灯塔可建造并让视野外敌人进入共享视野", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    game.gold=9999;
    const index=shopList().findIndex((item)=>item.id==="beacon"),build=shopList()[index];
    const before=isPositionVisible({x:-38,z:-38});
    const cell=(()=>{const E=ACTIVE_MODE.enclosure;for(let z=E.z0+1;z<E.z1-1;z++)for(let x=E.x0+1;x<E.x1-1;x++)if(footprintPlaceable({x,z},build))return {x,z};return null;})();
    selectBuild(index);ghost.visible=true;const center=footprintCenter(cell,build);placeBuildingImmediately(center.x,center.z);
    const beacon=visionBeacons[0];
    const bx=beacon&&beacon.group.position.x,bz=beacon&&beacon.group.position.z;
    return {index,before,count:visionBeacons.length,asset:beacon&&beacon.group.userData.assetName,
      visible:beacon?isPositionVisible({x:bx+SurvivalSystem.VISION_RULES.beaconRadius-.2,z:bz}):false};
  });
  await page.close();
  assert.ok(result.index>=0);
  assert.equal(result.before,false);
  assert.equal(result.count,1);
  assert.match(result.asset,/watch-beacon/);
  assert.equal(result.visible,true);
});

test("满级炮台只能攻击共享视野内的远距离敌人", async () => {
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;game.tech.turret=10;
    builtTurrets.splice(0).forEach((turret)=>scene.remove(turret.group));
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    bullets.splice(0).forEach((bullet)=>scene.remove(bullet.mesh));
    const group=makeTurretMesh("turret");group.position.set(0,0,0);scene.add(group);
    const bar={visible:false},barFg={visible:false};
    const turret={group,kind:"turret",turretKey:"turret",range:SurvivalSystem.rangeAtResearchLevel("turret",0)*TILE,
      cd:0,fireCd:.5,dmg:3,blast:0,pierce:0,slow:0,stun:0,chain:0,hp:40,maxHp:40,bar,barFg};
    builtTurrets.push(turret);
    spawnEnemy("normal",false);const enemy=enemies[0];enemy.spawnFlash=-1;enemy.group.position.set(40,0,0);
    _visionSourceCache=[{x:0,z:0,radius:SurvivalSystem.VISION_RULES.turretRadius}];
    updateBuiltTurrets(1);const outsideVisionBullets=bullets.length;
    _visionSourceCache.push({x:40,z:0,radius:2});turret.cd=0;updateBuiltTurrets(1);
    return {outsideVisionBullets,insideVisionBullets:bullets.length,visible:isPositionVisible(enemy.group.position)};
  });
  await page.close();
  assert.equal(result.outsideVisionBullets,0);
  assert.ok(result.insideVisionBullets>0);
  assert.equal(result.visible,true);
});

test("建造研究和基地界面不再暂停刷兵世界",async()=>{
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const results=[];
    for(const targetState of [STATE.BUILD,STATE.TECH,STATE.GATE]){
      enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
      state=targetState;wc3BuildMode=false;game.wave=1;game.enemiesToSpawn=1;game.spawnTimer=0;
      stepGame(.2,performance.now()+1000);
      results.push({state:targetState,queued:game.enemiesToSpawn,active:activeEnemyCount()});
    }
    return results;
  });
  await page.close();
  for(const row of result){assert.equal(row.queued,0,JSON.stringify(result));assert.equal(row.active,1,JSON.stringify(result));}
});

test("待刷敌人计时器异常时无需玩家操作即可自恢复",async()=>{
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    state=STATE.PLAYING;game.wave=3;game.enemiesToSpawn=3;game.spawnTimer=Number.NaN;
    for(let tick=0;tick<360;tick++)stepGame(1/60,performance.now()+tick*1000/60);
    return {queued:game.enemiesToSpawn,active:activeEnemyCount(),timer:game.spawnTimer};
  });
  await page.close();
  assert.ok(Number.isFinite(result.timer),JSON.stringify(result));
  assert.ok(result.queued<3&&result.active>0,JSON.stringify(result));
});

test("医疗灯塔按墙体最大生命百分比治疗并显示米白链接",async()=>{
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const x=ACTIVE_MODE.canyon.x0+2,z=ACTIVE_MODE.canyon.z0,cell=idx(x,z),max=wallMaxHp(50),start=max*.5;
    grid[z][x]=T_STEEL;wallMeta.set(cell,{lv:50,hp:start});steelHP.set(cell,start);
    const group=new THREE.Group(),center=cellCenter(x,z);group.position.set(center.x+4,0,center.z);scene.add(group);
    visionBeacons.push({group,hp:100,maxHp:100,level:5});
    updateMedicalBeacons(1);
    const links=scene.children.filter((object)=>object.userData&&object.userData.medicalHealingLink);
    return {healed:steelHP.get(cell)-start,max,links:links.length,color:links[0]&&links[0].material.color.getHex()};
  });
  await page.close();
  assert.ok(Math.abs(result.healed-result.max*.05)<.01,JSON.stringify(result));
  assert.ok(result.links>0,"治疗时必须显示链接");
  assert.equal(result.color,0xf2e7cf);
});

test("生产坦克复用原版坦克并在停止状态自动警戒开火",async()=>{
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    state=STATE.PLAYING;friendlyUnits.splice(0).forEach((unit)=>scene.remove(unit.group));
    enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
    bullets.splice(0).forEach((bullet)=>scene.remove(bullet.mesh));
    const unit=createFriendlyUnit("light",{x:0,z:0});spawnEnemy("normal",false);
    const enemy=enemies[0];enemy.spawnFlash=-1;enemy.group.position.set(5,0,0);_visionSourceCache=[{x:0,z:0,radius:30}];
    updateFriendlyUnits(1);
    return {original:unit.group.userData.originalTank===true,rts:unit.group.userData.rtsTank===true,targeted:unit.attackTarget===enemy,bullets:bullets.length};
  });
  await page.close();
  assert.deepEqual(result,{original:true,rts:false,targeted:true,bullets:5});
});

test("高台坦克接到低地命令后必须绕行唯一坡道而不是撞悬崖",async()=>{
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const ramp=ACTIVE_MODE.ramp;
    const start=cellCenter(ramp.col-5,ramp.row),target=cellCenter(ramp.col+5,ramp.row);
    const unit=createFriendlyUnit("medium",start);
    wc3SetSelection([{kind:"unit",ref:unit}]);
    issueSelectionCommand("move",target);
    const startHeight=heightAt(start.x,start.z),targetHeight=heightAt(target.x,target.z);
    let lowest=unit.group.position.y,nearestRamp=Infinity;
    for(let frame=0;frame<60*35;frame++){
      updateFriendlyUnits(1/60);
      lowest=Math.min(lowest,unit.group.position.y);
      const rampCenter=cellCenter(ramp.col,ramp.row);
      nearestRamp=Math.min(nearestRamp,Math.hypot(unit.group.position.x-rampCenter.x,unit.group.position.z-rampCenter.z));
    }
    return {startHeight,targetHeight,lowest,nearestRamp,finalDistance:Math.hypot(unit.group.position.x-target.x,unit.group.position.z-target.z),
      finalHeight:unit.group.position.y,routeLength:(unit.routeWaypoints||[]).length,
      startCell:cellOf(start.x,start.z),targetCell:cellOf(target.x,target.z),finalCell:cellOf(unit.group.position.x,unit.group.position.z),
      targetType:grid[cellOf(target.x,target.z).z][cellOf(target.x,target.z).x],targetOccupied:structCells.has(idx(cellOf(target.x,target.z).x,cellOf(target.x,target.z).z))};
  });
  await page.close();
  assert.ok(result.startHeight>1.5&&result.targetHeight<.5,`测试必须跨越高低地：${JSON.stringify(result)}`);
  assert.ok(result.nearestRamp<4.5,`坦克没有经过坡道：${JSON.stringify(result)}`);
  assert.ok(result.lowest<.5&&result.finalHeight<.5,`坦克没有下到低地：${JSON.stringify(result)}`);
  assert.ok(result.finalDistance<2.5,`坦克未抵达目标：${JSON.stringify(result)}`);
});

test("反装甲弹模型长轴始终朝向实际飞行方向",async()=>{
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    const direction=new THREE.Vector3(.8,0,.6).normalize();
    const mesh=makeProjectileMesh("antitank",direction);
    const forward=new THREE.Vector3(0,1,0).applyQuaternion(mesh.quaternion).normalize();
    return {dot:forward.dot(direction),shape:mesh.userData.projectileShape};
  });
  await page.close();
  assert.equal(result.shape,"sabot-dart");
  assert.ok(result.dot>.995,`反装甲弹朝向与速度不一致：${JSON.stringify(result)}`);
});

test("尸潮单次刷新按波段批量生成而不是逐只排队",async()=>{
  const page=await openSurvival();
  const result=await page.evaluate(()=>{
    enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
    state=STATE.PLAYING;game.wave=4;game.enemiesToSpawn=8;game.spawnTimer=0;game._bossDone=false;
    updateEnemies(1/60);
    return {active:activeEnemyCount(),queued:game.enemiesToSpawn,batch:SurvivalSystem.waveProfile(4).spawnBatch};
  });
  await page.close();
  assert.equal(result.batch,36);
  assert.equal(result.active,8,`第四波应一次把待出队列倾泻完：${JSON.stringify(result)}`);
  assert.equal(result.queued,0);
});

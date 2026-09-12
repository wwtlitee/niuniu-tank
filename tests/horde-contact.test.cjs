const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');
let server, browser, page;
const errors = [];
const output = path.resolve(__dirname, '../output/horde-contact');
before(async () => {
  fs.mkdirSync(output, { recursive: true });
  server = await createStaticServer(path.resolve(__dirname, '..'));
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
  await page.evaluate(() => {
    state = STATE.PAUSED;
    updateCamera = () => {};
    game.wave = 1;
    game.gateHp = 1e9;
    game.stats.empLv = game.stats.mortarLv = 0;
    document.getElementById('hud').style.display = 'none';
    window.seedContactCrowd = (count, stacked) => {
      for (const e of enemies.splice(0)) { scene.remove(e.group); releaseEnemyResources(e); if(e.beam)scene.remove(e.beam); }
      _gateAttackerFrame = -1;
      const b = baseGroup.position;
      for (let i = 0; i < count; i++) {
        spawnEnemy('normal', false);
        const e = enemies.at(-1);
        if (e.beam) scene.remove(e.beam);
        e.beam = null; e.spawnFlash = 0; e.hp = e.maxHp = 1e9;
        e.atGate = stacked; e._gateAttackSlot = false;
        const x = b.x + (stacked ? 0 : (i % 8 - 3.5) * 0.7);
        const z = b.z + TILE + (stacked ? 0.75 : 2 + Math.floor(i / 8) * 0.8);
        e.group.position.set(x, heightAt(x, z), z);
      }
      camera.position.set(b.x + 7, b.y + 14, b.z + 22);
      camera.lookAt(b.x, b.y + 1, b.z + 3);
    };
    window.contactMetrics = () => {
      let minRatio = Infinity, severe = 0, solid = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i], p = e.group.position;
        if(blockedForTank(p.x,p.z,enemyNavigationRadius(e),heightAt(p.x,p.z))) solid++;
        for (let j = i + 1; j < enemies.length; j++) {
          const o = enemies[j], q = o.group.position;
          const contact=zombieBodyContact(e,o);
          const ratio = contact?1-contact.depth/(e.radius+o.radius):1;
          minRatio = Math.min(minRatio, ratio);
          if (ratio < .7) severe++;
        }
      }
      return { minRatio, severe, solid, count: enemies.length, radius: enemies[0]?.radius,
        attackers: enemies.filter(e => e._gateAttackSlot).length, hp: game.gateHp };
    };
  });
});
after(async () => {
  if(browser)await browser.close();
  if(server)await new Promise(r => server.close(r));
});

test('加高坡口的200只尸群形成支撑层，散开落地，俯射遵守实际地形', async () => {
  const initial=await page.evaluate(()=>{
    seedContactCrowd(0,false);game.enemiesToSpawn=0;
    const r=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row);
    for(let i=0;i<200;i++){
      spawnEnemy('normal',false);const e=enemies.at(-1);
      if(e.beam)scene.remove(e.beam);e.beam=null;e.spawnFlash=0;e.hp=e.maxHp=1e9;
      const x=r.x-1+(i%25)*.22,z=r.z+(Math.floor(i/25)-3.5)*.20;
      e.group.position.set(x,heightAt(x,z),z);e.dir.set(-1,0,0);
    }
    for(let i=0;i<90;i++){_animFrame++;applyHordeSeparation(1/60);updateHordeClimbing(1/60);}
    camera.position.set(r.x+15,PH+13,r.z+15);camera.lookAt(r.x-1,PH*.5,r.z);
    renderer.toneMappingExposure=1.25;renderer.render(scene,camera);
    const origin=new THREE.Vector3(r.x-2,PH+2,r.z),target=new THREE.Vector3(r.x+5,1,r.z);
    return {height:PH,raised:enemies.filter(e=>e.hordeLift>.15).length,
      peak:Math.max(...enemies.map(e=>e.hordeLift)),clear:terrainFireLineClear(origin,target),
      blocked:terrainFireLineClear(new THREE.Vector3(r.x-2,.5,r.z),target),
      underground:bulletCollide({thruWall:true},new THREE.Vector3(r.x-2,.1,r.z))};
  });
  await page.screenshot({path:path.join(output,'ramp-pile.png')});
  fs.writeFileSync(path.join(output,'ramp-pile.json'),JSON.stringify(initial,null,2));
  assert.equal(initial.height,3.4);assert.ok(initial.raised>=5,JSON.stringify(initial));
  assert.ok(initial.peak<=.85);assert.equal(initial.clear,true);assert.equal(initial.blocked,false);assert.equal(initial.underground,true);
  const settled=await page.evaluate(()=>{
    const e=enemies.find(e=>e.hordeLift>.15),before=enemyAimPoint(e).y;
    for(const other of enemies)if(other!==e)other.alive=false;
    for(let i=0;i<180;i++)updateHordeClimbing(1/60);
    const after=enemyAimPoint(e).y;
    return {lift:e.hordeLift,drop:before-after};
  });
  assert.equal(settled.lift,0);assert.ok(settled.drop>.1,JSON.stringify(settled));
  const advancing=await page.evaluate(()=>{
    for(const e of enemies)e.alive=true;
    const r=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row);
    let raised=0;
    for(let i=0;i<360;i++){
      _animFrame++;updateEnemies(1/60);
      raised=Math.max(raised,enemies.filter(e=>e.hordeLift>.15).length);
    }
    for(const e of enemies){if(e.mixer)e.mixer.update(.1);applyZombieReachPose(e);e.group.updateWorldMatrix(true,true);}
    renderer.render(scene,camera);
    return {raised,crossed:enemies.filter(e=>e.group.position.x<r.x-TILE*.5).length};
  });
  await page.screenshot({path:path.join(output,'ramp-assault-live.png')});
  fs.writeFileSync(path.join(output,'ramp-assault-live.json'),JSON.stringify(advancing,null,2));
  assert.ok(advancing.raised>0,JSON.stringify(advancing));assert.ok(advancing.crossed>0,JSON.stringify(advancing));
  assert.deepEqual(errors,[]);
});

test('基地前等待攻击的尸群仍然占据空间，完全重叠可以恢复', async () => {
  const result = await page.evaluate(() => {
    seedContactCrowd(48, true);
    for(let i=0;i<240;i++){_animFrame++;applyHordeSeparation(1/60);}
    renderer.render(scene,camera);
    return contactMetrics();
  });
  fs.writeFileSync(path.join(output,'waiting.json'),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(output,'waiting.png')});
  assert.equal(result.severe,0,JSON.stringify(result));
  assert.ok(result.minRatio>=.89,JSON.stringify(result));
  assert.equal(result.solid,0);
});

test('绕行遵守移动预算、尝试另一侧，死亡单位不再挡路',async()=>{
  const result=await page.evaluate(()=>{
    seedContactCrowd(2,false);
    const [rear,front]=enemies,p=rear.group.position;
    rear.radius=front.radius=.3;rear.hordeLaneSide=1;rear.dir.set(0,0,-1);
    front.group.position.copy(p);front.group.position.z-=.65;front.atGate=true;_animFrame++;
    const original=blockedForTank,start=p.clone();
    try{
      blockedForTank=(x)=>x>start.x;
      const stopped=hordeLaneDetour(rear,rear.dir,0,0,.3);
      const moved=hordeLaneDetour(rear,rear.dir,.02,0,.3),distance=p.distanceTo(start);
      const opposite=p.x<start.x;
      front.alive=false;const deadBlocks=hordeLaneBlocked(rear,rear.dir);
      front.alive=true;front.dying=true;const dyingBlocks=hordeLaneBlocked(rear,rear.dir);front.dying=false;
      return {stopped,moved,distance,opposite,deadBlocks,dyingBlocks};
    }finally{blockedForTank=original;}
  });
  assert.equal(result.stopped,false);assert.equal(result.moved,true);
  assert.ok(result.distance<=.020001,JSON.stringify(result));assert.equal(result.opposite,true);
  assert.equal(result.deadBlocks,false);assert.equal(result.dyingBlocks,false);
});

test('奔跑攀爬与受击姿态有区别且受击后能恢复',async()=>{
  const result=await page.evaluate(()=>{
    seedContactCrowd(3,false);
    const b=baseGroup.position;
    for(let i=0;i<3;i++){
      const e=enemies[i];e.group.position.set(b.x+(i-1)*2.2,b.y,b.z+10);
      e.group.rotation.set(0,0,0);e.currentAnim=_ANIM_WALK;e.poseTime=i*.15;
      if(e.actions.walk){e.actions.walk.reset().play();e.mixer.update(i*.1+.1);}
    }
    enemies[1].hordeLift=.6;enemies[2].maxHp=100;enemies[2].hp=100;
    damageEnemy(enemies[2],10);
    for(const e of enemies)applyZombieReachPose(e);
    const injured=enemies[2],kick=injured.visualRoot.rotation.x;
    const arms=enemies.map(e=>e.poseBones.LeftArm.quaternion.toArray());
    camera.position.set(b.x+3,b.y+4,b.z+17);camera.lookAt(b.x,b.y+1,b.z+10);renderer.render(scene,camera);
    window.behaviorRecovery=()=>{injured.hitReaction=0;applyZombieReachPose(injured);return injured.visualRoot.rotation.x;};
    return {kick,arms};
  });
  await page.screenshot({path:path.join(output,'behavior-poses.png')});
  assert.notDeepEqual(result.arms[0],result.arms[1]);
  assert.ok(result.kick<0,JSON.stringify(result));
  assert.ok(await page.evaluate(()=>behaviorRecovery())>result.kick);
  assert.deepEqual(errors,[]);
});

test('坡顶炮台真实俯射能命中坡下敌人',async()=>{
  const result=await page.evaluate(()=>{
    seedContactCrowd(0,false);
    const r=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row);
    spawnEnemy('normal',false);const e=enemies.at(-1);e.spawnFlash=0;e.hp=e.maxHp=100;
    e.group.position.set(r.x+5,heightAt(r.x+5,r.z),r.z);
    const group=makeTurretMesh('rapid');group.position.set(r.x-2,PH,r.z);scene.add(group);
    const t={group,turretKey:'rapid',kind:'rapid',level:0,cd:0,fireCd:.1,dmg:1,range:40,lockTarget:e};
    builtTurrets.push(t);_visionSourceCache=[{x:r.x,z:r.z,radius:100}];
    for(let i=0;i<180;i++){_animFrame++;updateBuiltTurrets(1/60);updateBullets(1/60);}
    const result={damage:100-e.hp,locked:t.lockTarget===e,pitch:group.userData.turret.userData.pitchPivot.rotation.x};
    builtTurrets.splice(builtTurrets.indexOf(t),1);scene.remove(group);disposeTransientObject3D(group);
    return result;
  });
  fs.writeFileSync(path.join(output,'ramp-fire.json'),JSON.stringify(result,null,2));
  assert.ok(result.damage>0,JSON.stringify(result));assert.ok(result.pitch>0,JSON.stringify(result));assert.deepEqual(errors,[]);
});

test('脱困状态的小半径敌人也不能相互穿透', async () => {
  const result = await page.evaluate(() => {
    seedContactCrowd(2,true);
    for(const e of enemies){e.atGate=false;e.separationSuppressedUntil=Infinity;e.radius=.2;}
    for(let i=0;i<60;i++){_animFrame++;applyHordeSeparation(1/60);}
    return contactMetrics();
  });
  assert.ok(result.minRatio>=.89,JSON.stringify(result));
});

test('小于一个单位的碰撞直径在精确同点时仍向外分离', async () => {
  const result = await page.evaluate(() => {
    seedContactCrowd(2,true);
    for(const e of enemies){e.atGate=false;e.radius=.2;}
    for(let i=0;i<60;i++){_animFrame++;applyHordeSeparation(1/60);}
    return contactMetrics();
  });
  assert.ok(result.minRatio>=.89,JSON.stringify(result));
});

test('持续进攻基地的96只尸群形成前后排，攻击上限和建筑碰撞保持', async () => {
  const result = await page.evaluate(() => {
    seedContactCrowd(96,false);
    const before = game.gateHp, started = performance.now();
    let peakAttackers = 0;
    for(let i=0;i<720;i++){
      _animFrame++;updateEnemies(1/60);
      peakAttackers = Math.max(peakAttackers,enemies.filter(e=>e._gateAttackSlot).length);
    }
    for(const e of enemies){e.group.updateMatrixWorld(true);applyZombieReachPose(e);}
    renderer.render(scene,camera);
    return {...contactMetrics(),damage:before-game.gateHp,peakAttackers,logicMs:performance.now()-started};
  });
  fs.writeFileSync(path.join(output,'assault.json'),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(output,'assault.png')});
  assert.equal(result.count,96);
  assert.equal(result.severe,0,JSON.stringify(result));
  assert.ok(result.minRatio>=.78,JSON.stringify(result));
  assert.equal(result.solid,0);
  assert.ok(result.damage>0,'接触的前排继续造成伤害');
  assert.ok(result.peakAttackers<=32);
  assert.deepEqual(errors,[]);
});

test('前排死亡后最后一只排队敌人会恢复前进', async () => {
  const result = await page.evaluate(() => {
    seedContactCrowd(2,false);
    const rear=enemies[1],front=enemies[0],b=baseGroup.position;
    rear.group.position.set(b.x,heightAt(b.x,b.z+12),b.z+12);
    front.group.position.copy(rear.group.position);front.group.position.z-=rear.radius+front.radius;
    rear.dir.set(0,0,-1);front.dir.set(0,0,0);
    applyHordeSeparation(1/60);
    const slowed=rear.crowdSpeedScale;
    scene.remove(front.group);releaseEnemyResources(front);enemies.splice(0,1);
    const before=rear.group.position.clone();
    for(let i=0;i<120;i++){_animFrame++;updateEnemies(1/60);}
    return {slowed,moved:rear.group.position.distanceTo(before),scale:rear.crowdSpeedScale};
  });
  assert.equal(result.slowed,1,'前排接触不得把减速传播给后排');
  assert.ok(result.moved>1,JSON.stringify(result));
  assert.equal(result.scale,1);
});

test('第十波Boss拆掉峡谷墙后穿过缺口继续接近基地', async () => {
  const result = await page.evaluate(() => {
    seedContactCrowd(0,false);
    game.wave=10;game.gateHp=game.gateMaxHp=1e9;baseAlive=true;
    const wall={x:ACTIVE_MODE.canyon.x0+1,z:ACTIVE_MODE.canyon.z0};
    const key=idx(wall.x,wall.z),center=cellCenter(wall.x,wall.z),original=grid[wall.z][wall.x];
    grid[wall.z][wall.x]=T_STEEL;steelHP.set(key,120);wallMeta.set(key,{lv:1,hp:120,thorns:0});
    buildWallTile(mapGroup,wall.x,wall.z);computeFlowField();
    spawnEnemy('normal',true,10);const boss=enemies.at(-1);
    if(boss.beam)scene.remove(boss.beam);boss.beam=null;boss.spawnFlash=0;boss.hp=boss.maxHp=1e9;
    const start=cellCenter(wall.x+2,wall.z);
    boss.group.position.set(start.x,heightAt(start.x,start.z),start.z);
    const nowOriginal=performance.now.bind(performance);let now=nowOriginal();performance.now=()=>now;
    let brokenAt=null,crossedAt=null,gateAt=null,hpBefore=120,ownBites=0;
    try{
      for(let i=0;i<5400;i++){
        _animFrame++;now+=1000/60;updateEnemies(1/60);
        const hp=steelHP.get(key)||0;
        if(hp<hpBefore){ownBites++;hpBefore=hp;}
        if(!steelHP.has(key)&&brokenAt===null)brokenAt=i/60;
        if(brokenAt!==null&&boss.group.position.x<center.x-TILE*.5&&crossedAt===null)crossedAt=i/60;
        if(boss.atGate){gateAt=i/60;break;}
      }
    }finally{performance.now=nowOriginal;grid[wall.z][wall.x]=original;steelHP.delete(key);wallMeta.delete(key);computeFlowField();}
    return {boss:boss.bossId,ownBites,brokenAt,crossedAt,gateAt,x:boss.group.position.x,z:boss.group.position.z};
  });
  fs.writeFileSync(path.join(output,'boss-wall.json'),JSON.stringify(result,null,2));
  assert.equal(result.boss,'doom_keeper');
  assert.ok(result.ownBites>0,JSON.stringify(result));
  assert.notEqual(result.brokenAt,null,JSON.stringify(result));
  assert.notEqual(result.crossedAt,null,JSON.stringify(result));
  assert.notEqual(result.gateAt,null,JSON.stringify(result));
  assert.deepEqual(errors,[]);
});

test('400只尸群堵住完整堡垒时不得重叠或穿墙',async()=>{
  const result=await page.evaluate(()=>{
    seedContactCrowd(0,false);game.enemiesToSpawn=0;game.wave=1;
    const wall={x:ACTIVE_MODE.canyon.x1,z:ACTIVE_MODE.canyon.z0},key=idx(wall.x,wall.z),c=cellCenter(wall.x,wall.z);
    const original=grid[wall.z][wall.x];
    const model=buildWallTile(mapGroup,wall.x,wall.z,1);
    grid[wall.z][wall.x]=T_STEEL;steelHP.set(key,1e9);wallMeta.set(key,{lv:1,hp:1e9,anchor:wall});structCells.add(key);tileMeshes[key]=model;computeFlowField();
    let crossed=0;
    try{
      for(let i=0;i<400;i++){
        spawnEnemy('normal',false);const e=enemies.at(-1);e.spawnFlash=0;
        if(e.beam)scene.remove(e.beam);e.beam=null;
        const x=c.x+2+Math.floor(i/20)*.35,z=c.z+(i%20-9.5)*.25;
        e.group.position.set(x,heightAt(x,z),z);
      }
      updateCrowdLod();
      const passed=new Set(),started=performance.now();
      for(let i=0;i<600;i++){
        _animFrame++;updateEnemies(1/60);updateCrowdLod();
        for(const e of enemies)if(e.group.position.x<c.x-1.2)passed.add(e.hordeId);
      }
      crossed=passed.size;
      camera.position.set(c.x+11,PH+18,c.z+16);camera.lookAt(c.x-2,1,c.z);renderer.render(scene,camera);
      let maxPenetration=0,overlappingPairs=0;
      for(let a=0;a<enemies.length;a++)for(let b=a+1;b<enemies.length;b++){const hit=zombieBodyContact(enemies[a],enemies[b]);if(hit){maxPenetration=Math.max(maxPenetration,hit.depth);if(hit.depth>.025)overlappingPairs++;}}
      return {rendered:enemies.filter(e=>e.group.visible).length+(crowdLodMesh?.count||0),maxPenetration,overlappingPairs,simulationMs:performance.now()-started,crossed,hp:steelHP.get(key),count:enemies.length,radius:enemies[0].radius,hull:enemies[0].collisionHull,nearest:Math.min(...enemies.map(e=>e.group.position.x-c.x))};
    }finally{
      window.cleanupSealedWall=()=>{grid[wall.z][wall.x]=original;steelHP.delete(key);wallMeta.delete(key);structCells.delete(key);delete tileMeshes[key];if(model.parent)model.parent.remove(model);disposeTransientObject3D(model);computeFlowField();};
    }
  });
  await page.screenshot({path:path.join(output,'sealed-wall.png')});
  await page.evaluate(()=>cleanupSealedWall());
  fs.writeFileSync(path.join(output,'sealed-wall.json'),JSON.stringify(result,null,2));
  assert.equal(result.overlappingPairs,0,JSON.stringify(result));assert.equal(result.count,400);assert.equal(result.rendered,400);
  assert.equal(result.crossed,0,JSON.stringify(result));assert.ok(result.hp>0&&result.hp<1e9,JSON.stringify(result));
});

test('头部与躯干轮廓来自模型且尺寸有限',async()=>{
  const result=await page.evaluate(()=>{
    seedContactCrowd(1,false);const e=enemies[0],box=enemyModelBounds(e);
    return {radius:e.radius,hull:e.collisionHull,box:box.getSize(new THREE.Vector3()).toArray()};
  });
  fs.writeFileSync(path.join(output,'body-hull.json'),JSON.stringify(result,null,2));
  assert.ok(result.radius<1,JSON.stringify(result));assert.ok(result.hull.length>=3);
  assert.ok(result.radius<Math.max(result.box[0],result.box[2])*.3,'伸展手臂不能撑大躯干碰撞');
});


test('四倍接触位抵消普通僵尸降伤且Boss占用加权槽位',async()=>{
  const result=await page.evaluate(()=>{
    seedContactCrowd(0,false);game.wave=10;
    const normal={boss:false,type:'normal',sourceWave:10},boss={boss:true,bossMechanic:'doom',sourceWave:10};
    const damage=[];
    for(const difficulty of [.5,.75,1,1.5]){
      game.difficultyMultiplier=difficulty;
      const baseline=SurvivalSystem.ZOMBIE_COMBAT_SCALE*SurvivalSystem.meleeWaveMultiplier(10)*survivalPressureMultiplier()*difficulty;
      damage.push({baseline:baseline*6,actual:enemyMeleeDamage(normal)*24,boss:enemyMeleeDamage(boss),expectedBoss:baseline*5});
    }
    const candidates=[boss,...Array.from({length:40},()=>({...normal}))];
    const slots=selectHordeContactSlots(candidates,6);
    return {damage,slots:slots.length,weighted:slots.reduce((sum,e)=>sum+(e.boss?4:1),0)};
  });
  for(const row of result.damage){assert.ok(Math.abs(row.actual-row.baseline)<1e-8);assert.ok(Math.abs(row.boss-row.expectedBoss)<1e-8);}
  assert.equal(result.slots,21);assert.equal(result.weighted,24);
});

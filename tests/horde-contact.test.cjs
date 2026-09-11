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
          const ratio = Math.hypot(p.x-q.x,p.z-q.z)/(e.radius+o.radius);
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
  assert.ok(result.peakAttackers<=8);
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
  assert.ok(result.slowed<.5,JSON.stringify(result));
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

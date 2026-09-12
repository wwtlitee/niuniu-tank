'use strict';
const { test, before, after } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path');
const { chromium } = require('playwright'),
  { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');
let server, browser, page;
before(async () => {
  server = await createStaticServer(path.resolve(__dirname, '..'));
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=d3d11'],
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
});
async function fresh() {
  await page?.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
  await page.evaluate(() => {
    game.gold = 100000;
    game.prepTime = 10000;
    questActive = false;
    hideQuestPanel();
  });
}
test('基地流派通过键盘下单，长按不重复付款，改建后专属科技迁入研究院且仅高级研究院可研究', async () => {
  await fresh();await page.keyboard.press('g');
  assert.equal(await page.evaluate(()=>wc3Sel.kind),'base');
  assert.deepEqual(await page.evaluate(()=>commandItemsForSelection().filter(i=>i.upgradeType==='base').map(i=>i.hot)),['U','J','K']);
  const before=await page.evaluate(()=>game.gold);await page.keyboard.down('u');await page.keyboard.down('u');await page.keyboard.up('u');
  assert.deepEqual(await page.evaluate(()=>[game.doctrine,game.upgradeJobs.length,game.gold]),[null,1,before-1500]);
  await page.evaluate(()=>{for(let i=0;i<31*60;i++)updateUpgradeJobs(1/60);renderCmdCard();});
  assert.equal(await page.evaluate(()=>game.doctrine),'tower');
  // 基地面板不再承载专属科技按钮（已迁入研究院）
  assert.equal(await page.evaluate(()=>commandItemsForSelection().filter(i=>i.upgradeType==='doctrine').length),0);
  // 初级研究院面板只有经济/墙与升阶入口，无专属科技
  await page.evaluate(()=>{
    const research={x:1,z:1,group:new THREE.Group(),hp:300,maxHp:300};research.group.parent=scene;researchInstitutes.push(research);
    wc3SetSelection([{kind:'research',ref:research}]);wc3RenderSel();renderCmdCard();
  });
  assert.equal(await page.evaluate(()=>commandItemsForSelection().filter(i=>i.upgradeType==='academy').length),1);
  assert.equal(await page.evaluate(()=>commandItemsForSelection().filter(i=>i.upgradeType==='doctrine').length),0);
  // 升阶高级研究院
  await page.evaluate(()=>{upgradeAcademy();for(let i=0;i<9*60;i++)updateUpgradeJobs(1/60);renderCmdCard();});
  assert.equal(await page.evaluate(()=>game.researchTier),1);
  // 高级研究院出现四项专属科技且可下单
  assert.equal(await page.evaluate(()=>commandItemsForSelection().filter(i=>i.upgradeType==='doctrine').length),4);
  await page.evaluate(()=>{const item=commandItemsForSelection().find(i=>i.upgradeType==='doctrine');item.act();});
  assert.equal(await page.evaluate(()=>game.upgradeJobs.length),1);
  assert.equal(await page.evaluate(()=>Object.values(game.doctrineTech).reduce((s,n)=>s+n,0)),0);
});

test('右键拖动镜头不下移动令，右键轻点仍能下令，拖动不取消蓝图', async () => {
  await fresh();
  await page.mouse.move(710, 370);
  await page.evaluate(() => {
    const u = createFriendlyUnit('light', cellCenter(8, 15));
    wc3SetSelection([{ kind: 'unit', ref: u }]);
  });
  const before = await page.evaluate(() => ({ x: camFocus.x, z: camFocus.z }));
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(220);
  await page.mouse.move(870, 440, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  const after = await page.evaluate(() => ({
    x: camFocus.x,
    z: camFocus.z,
    target: friendlyUnits[0].moveTarget,
  }));
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 2, '拖动必须平移镜头');
  assert.equal(after.target, null, '拖动不能误下令');
  await page.mouse.click(700, 410, { button: 'right' });
  assert.ok(await page.evaluate(() => friendlyUnits[0].moveTarget));
  await page.keyboard.press('b');
  await page.keyboard.press('1');
  const blueprint = await page.evaluate(() => buildSel);
  assert.notEqual(blueprint, null);
  await page.mouse.move(700, 420);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(210);
  await page.mouse.move(810, 480, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  assert.equal(await page.evaluate(() => buildSel), blueprint);
  await page.mouse.click(720, 430, { button: 'right' });
  assert.equal(await page.evaluate(() => buildSel), null);
});
test('五级四种炮台更换可辨识的重型外观，重复刷新不叠模型且炮口俯仰仍正确', async () => {
  await fresh();
  const rows = await page.evaluate(() =>
    Object.keys(SurvivalSystem.TURRET_BRANCHES).map((key) => {
      const group = makeTurretMesh(key);
      scene.add(group);
      const t = { group, turretKey: key, level: 3 };
      applyTurretLevelVisual(t);
      const before = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
      t.level = 4;
      applyTurretLevelVisual(t);
      const after = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()),
        meshes = [];
      group.traverse((o) => {
        if (o.isMesh) meshes.push(o);
      });
      const count = meshes.length;
      applyTurretLevelVisual(t);
      const again = [];
      group.traverse((o) => {
        if (o.isMesh) again.push(o);
      });
      const target = new THREE.Vector3(10, -1, 12);
      for (let i = 0; i < 200; i++) aimTurretAt(group, target, 0.025);
      const muzzle = group.userData.turret.userData.muzzleMarker,
        forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
          muzzle.getWorldQuaternion(new THREE.Quaternion()),
        ),
        direction = target.clone().sub(muzzle.getWorldPosition(new THREE.Vector3())).normalize();
      return {
        key,
        before: before.toArray(),
        after: after.toArray(),
        tier: group.userData.turretVisualTier,
        count,
        stable: again.length === count,
        dot: forward.dot(direction),
      };
    }),
  );
  for (const row of rows) {
    assert.equal(row.tier, 'veteran');
    assert.ok(row.after[0] > row.before[0] * 1.2, JSON.stringify(row));
    assert.ok(row.stable && row.dot > 0.98, JSON.stringify(row));
    assert.ok(row.count < 38, '重型炮台不能堆过多绘制对象');
  }
});
test('已从场景移除的 Boss 不能被旧锁定继续射击，死亡 Boss 清除炮台和坦克目标', async () => {
  await fresh();
  const r = await page.evaluate(() => {
    state = STATE.PAUSED;
    spawnEnemy(null, true, 10);
    const e = enemies.at(-1),
      c = cellCenter(14, 16);
    e.group.position.set(c.x, 0, c.z);
    e.spawnFlash = 0;
    _visionSourceCache = [{ x: c.x, z: c.z, radius: 100 }];
    const group = makeTurretMesh('rapid');
    group.position.set(c.x - 10, 2.2, c.z);
    scene.add(group);
    const t = {
      group,
      turretKey: 'rapid',
      kind: 'rapid',
      level: 4,
      cd: 0,
      fireCd: 0.1,
      dmg: 1,
      range: 40,
      lockTarget: e,
    };
    builtTurrets.push(t);
    scene.remove(e.group);
    for (let i = 0; i < 80; i++) updateBuiltTurrets(0.025);
    const detachedShots = bullets.length,
      detachedTarget = !!t.lockTarget;
    scene.add(e.group);
    const u = createFriendlyUnit('light', cellCenter(10, 16));
    u.attackTarget = e;
    t.lockTarget = e;
    killEnemy(e, false);
    updateBuiltTurrets(0.025);
    updateFriendlyUnits(0.025);
    return { detachedShots, detachedTarget, deadTarget: !!t.lockTarget || !!u.attackTarget };
  });
  assert.equal(r.detachedShots, 0);
  assert.equal(r.detachedTarget, false);
  assert.equal(r.deadTarget, false);
});

test('清理 Boss 资源时立即作废残留锁定，不等待攻击单位下一帧才发现', async () => {
  await fresh();
  const stale = await page.evaluate(() => {
    spawnEnemy(null, true, 5);
    const e = enemies.at(-1),
      u = createFriendlyUnit('light', cellCenter(9, 15));
    u.attackTarget = e;
    const t = { lockTarget: e };
    builtTurrets.push(t);
    scene.remove(e.group);
    releaseEnemyResources(e);
    return { alive: e.alive, unit: !!u.attackTarget, turret: !!t.lockTarget };
  });
  assert.deepEqual(stale, { alive: false, unit: false, turret: false });
});

test('四种五级炮台通过实际购买升级并读档后保留外观、属性和金币', async () => {
  await fresh();
  const result = await page.evaluate(() => {
    state = STATE.PAUSED;
    game.popMax = 100;
    game.doctrine='tower';
    const buildIndex = shopList().findIndex((b) => b.id === 'turret'),
      build = shopList()[buildIndex];
    for (const key of ['rapid', 'cannon', 'antitank', 'emp']) {
      let anchor;
      for (let z = 5; z < GRID - 5 && !anchor; z++)
        for (let x = 2; x < GRID - 5; x++)
          if (footprintPlaceable({ x, z }, build)) {
            anchor = { x, z };
            break;
          }
      if (!anchor) throw new Error('No tower footprint');
      selectBuild(buildIndex);
      ghostCell = anchor;
      ghost.visible = true;
      placeBuildingImmediately(null, null, null, true);
      selectBuild(null);
      const t = builtTurrets.at(-1);
      chooseTurretBranch(t, key);
      for(let frame=0;frame<1200;frame++)updateUpgradeJobs(1/60);
      for (let i = 0; i < 4; i++) {upgradeTurretAt(t.cx, t.cz);for(let frame=0;frame<1800;frame++)updateUpgradeJobs(1/60);}
    }
    const describe = () =>
      builtTurrets.map((t) => ({
        key: t.turretKey,
        level: t.level,
        tier: t.group.userData.turretVisualTier,
        hp: t.hp,
        maxHp: t.maxHp,
        dmg: t.dmg,
        range: t.range,
        fireCd: t.fireCd,
      }));
    const before = describe(),
      gold = game.gold;
    let releasedGeometry = 0;
    const oldGeometry = new Set();
    for (const t of builtTurrets) t.group.traverse(o => {if(o.isMesh)oldGeometry.add(o.geometry);});
    for(const geometry of oldGeometry)geometry.addEventListener('dispose',()=>releasedGeometry++);
    if (!saveSurvivalSnapshot()) throw new Error('Save failed');
    const restored = restoreSurvivalSnapshot(readSurvivalSnapshot());
    return { before, after: describe(), restored, gold, goldAfter: game.gold, releasedGeometry, expectedGeometry:oldGeometry.size };
  });
  assert.ok(result.restored);
  assert.ok(result.releasedGeometry >= result.expectedGeometry, '读档替换旧炮台时必须释放旧模型显存');
  assert.equal(result.before.length, 4);
  assert.ok(result.before.every((t) => t.level === 4 && t.tier === 'veteran'));
  assert.deepEqual(result.after, result.before);
  assert.equal(result.goldAfter, result.gold);
});

test('所有炮台再放大百分之五十，金库从一级到六级线性增大至旧顶级的一点五倍', async () => {
  await fresh();
  const r = await page.evaluate(() => {
    const scales = ['turret', 'rapid', 'cannon', 'antitank', 'emp'].map(
      (k) => makeTurretMesh(k).scale.x,
    );
    const group = makeGoldmineVisual(),
      mine = { group, visualRoot: group.userData.visualRoot, level: 1 };
    const initial = mine.visualRoot.scale.x,
      levels = [];
    for (let level = 1; level <= 6; level++) {
      mine.level = level;
      upgradeGoldMineVisual(mine);
      levels.push(mine.visualRoot.scale.x / initial);
    }
    return {
      scales,
      levels,
      facadeGrows: group.getObjectByName('工业建筑入口').parent === mine.visualRoot,
    };
  });
  assert.deepEqual(r.scales, [0.75, 0.75, 0.75, 0.75, 0.75]);
  assert.ok(r.facadeGrows, '金库门廊及细节必须与建筑本体同步放大');
  assert.ok(Math.abs(r.levels[0] - 1) < 1e-8 && Math.abs(r.levels[5] - 1.875) < 1e-8);
  for (let i = 1; i < 6; i++) assert.ok(Math.abs(r.levels[i] - r.levels[i - 1] - 0.175) < 1e-8);
});

test('医疗车在远处自动治疗，复用灯塔射线且不抢玩家移动命令', async () => {
  await fresh();
  const r = await page.evaluate(() => {
    state = STATE.PAUSED;
    game.gold = 100;
    const center = cellCenter(6, 15),
      unit = createFriendlyUnit('repair', center),
      target = createFriendlyUnit('light', { x: center.x + 12, z: center.z });
    target.hp = target.maxHp - 100;
    const start = target.hp;
    const origin = unit.group.position.clone();
    updateMedicalBeacons(1);
    updateFriendlyUnits(1);
    const links = medicalHealingLinks.filter((l) => l.visible),
      first = {
        hp: target.hp - start,
        gold: 100 - game.gold,
        moved: unit.group.position.distanceTo(origin),
        links: links.length,
        color: links[0]?.material.color.getHex(),
      };
    wc3SetSelection([{ kind: 'unit', ref: unit }]);
    issueSelectionCommand('move', { x: center.x - 4, z: center.z });
    const goal = { ...unit.routeGoal };
    updateMedicalBeacons(0.01);
    updateFriendlyUnits(0.01);
    const moving =
      unit.command === 'move' &&
      !!unit.moveTarget &&
      unit.routeGoal.x === goal.x &&
      unit.routeGoal.z === goal.z;
    target.hp = target.maxHp;
    updateMedicalBeacons(0.01);
    updateFriendlyUnits(0.01);
    return { first, moving, ended: medicalHealingLinks.every((l) => !l.visible) };
  });
  assert.ok(
    Math.abs(r.first.hp - 15) < 1e-7 && Math.abs(r.first.gold - 1.5) < 1e-7,
    JSON.stringify(r),
  );
  assert.ok(r.first.moved < 0.01);
  assert.equal(r.first.links, 1);
  assert.equal(r.first.color, 0xf2e7cf);
  assert.ok(r.moving && r.ended);
});

test('医疗车不治疗死亡、脱离场景或范围外目标，缺钱时不产生假射线', async () => {
  await fresh();
  const r = await page.evaluate(() => {
    state = STATE.PAUSED;
    const c = cellCenter(6, 15),
      unit = createFriendlyUnit('repair', c),
      target = createFriendlyUnit('light', { x: c.x + 12, z: c.z });
    target.hp = 0;
    const dead = validRepairTarget(target);
    target.hp = 10;
    scene.remove(target.group);
    const detached = validRepairTarget(target);
    scene.add(target.group);
    target.group.position.x = c.x + unit.range + 5;
    const outside = nearestRepairTarget(unit);
    target.group.position.x = c.x + 12;
    game.gold = 0;
    updateMedicalBeacons(0.1);
    updateFriendlyUnits(0.1);
    return {
      dead,
      detached,
      outside: !!outside,
      hp: target.hp,
      links: medicalHealingLinks.some((l) => l.visible),
    };
  });
  assert.deepEqual(r, { dead: false, detached: false, outside: false, hp: 10, links: false });
});

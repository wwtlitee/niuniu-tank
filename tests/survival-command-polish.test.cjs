'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createStaticServer}=require('../tools/asset-runtime-catalog.cjs');
let server,browser,page;const errors=[];
before(async()=>{
  server=await createStaticServer(path.resolve(__dirname,'..'));
  browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
  page=await browser.newPage({viewport:{width:1440,height:950}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(()=>typeof state!=='undefined'&&state===7);
  await page.evaluate(()=>{
    state=STATE.PAUSED;questActive=false;hideQuestPanel();game.gold=100000;game.popMax=200;
    window.placeFixture=id=>{
      const spec=shopList().find(b=>b.id===id);
      for(let z=3;z<GRID-4;z++)for(let x=3;x<GRID-4;x++)if(footprintPlaceable({x,z},spec)){
        const previous=state;state=STATE.PREP;selectBuild(shopList().indexOf(spec));ghostCell={x,z};ghost.visible=true;placeBuildingImmediately(null,null,null,true);selectBuild(null);state=previous;return;
      }
      throw Error('No site: '+id);
    };
  });
  fs.mkdirSync('output/command-polish',{recursive:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
test('基地选流派后初级科技列表不提前泄露；升阶完成才切换模型和专属科技',async()=>{
  const before=await page.evaluate(()=>{
    placeFixture('research');game.doctrine='hero';game.researchTier=0;
    wc3SetSelection([{kind:'research',ref:researchInstitutes[0]}]);wc3RenderSel();renderCmdCard();
    const p=researchInstitutes[0].group.position;survivalOverview=false;camFocus.copy(p);camHeight=27;updateCamera(1);renderer.render(scene,camera);
    return commandItemsForSelection().filter(i=>i.upgradeType==='tech').map(i=>i.upgradeId);
  });
  await page.screenshot({path:'output/command-polish/academy-basic.png'});
  const r=await page.evaluate(()=>{
    const techs=()=>commandItemsForSelection().filter(i=>i.upgradeType==='tech').map(i=>i.upgradeId);
    upgradeAcademy();updateUpgradeJobs(4);const during=techs();
    const oldModel=!!researchInstitutes[0].group.getObjectByName('advanced-academy');
    updateUpgradeJobs(5);const after=techs(),model=researchInstitutes[0].group.getObjectByName('advanced-academy');
    wc3RenderSel();renderCmdCard();renderer.render(scene,camera);
    return {during,oldModel,after,model:!!model,tier:game.researchTier};
  });
  r.before=before;
  await page.screenshot({path:'output/command-polish/academy-advanced.png'});
  assert.deepEqual(r.before.sort(),['defense','economy']);assert.deepEqual(r.during.sort(),['defense','economy']);
  assert.equal(r.oldModel,false);assert.equal(r.tier,1);assert.ok(r.model);assert.ok(r.after.length>2);
});
test('批量右键开关自动：取消只停止续单，当前订单照常完成',async()=>{
  const r=await page.evaluate(()=>{
    placeFixture('house');placeFixture('house');const units=builtHouses.slice(-2),levels=units.map(u=>u.level);
    wc3SetSelection(units.map(ref=>({kind:'house',ref})));renderCmdCard();
    const click=()=>{const cards=commandItemsForSelection(),i=cards.findIndex(c=>c.upgradeType==='house');document.querySelectorAll('#cmdcard .cmdBtn')[i].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}));};
    click();const enabled=units.map(u=>isAutoUpgrade('house','',upgradeOwner('house',u)));
    click();const disabled=units.map(u=>isAutoUpgrade('house','',upgradeOwner('house',u)));
    for(let i=0;i<60;i++)updateUpgradeJobs(1);
    return {enabled,disabled,deltas:units.map((u,i)=>u.level-levels[i]),pending:game.upgradeJobs.length};
  });
  assert.deepEqual(r.enabled,[true,true]);assert.deepEqual(r.disabled,[false,false]);assert.deepEqual(r.deltas,[1,1]);assert.equal(r.pending,0);
});
test('Shift空地框选保留原选择，Esc取消攻击指令而不暂停',async()=>{
  await page.evaluate(()=>{state=STATE.PREP;game.prepTime=10000;wc3AttackMove=false;wc3SetSelection([{kind:'research',ref:researchInstitutes[0]}]);});
  await page.keyboard.down('Shift');await page.mouse.move(5,150);await page.mouse.down();await page.mouse.move(20,170);await page.mouse.up();await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(()=>wc3Selection.length),1);
  await page.evaluate(()=>{wc3AttackMove=true;});await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>state),7);assert.equal(await page.evaluate(()=>wc3AttackMove),false);
  await page.evaluate(()=>{state=STATE.PAUSED;});
});
test('旧玩家坦克消费实际绕障路径，不朝最终目标直撞建筑',async()=>{
  const r=await page.evaluate(()=>{
    if(!player?.alive)spawnPlayer();
    const saved=player.group.position.clone(),origin=cellCenter(8,15);player.group.position.set(origin.x,heightAt(origin.x,origin.z),origin.z);
    player.moveTarget={x:origin.x+15,z:origin.z};player.routeWaypoints=[{x:origin.x,z:origin.z+8},{...player.moveTarget}];
    player.routeAvailable=true;player.routeRevision=navigationStamp;player.routeReplan=1;player.attackTarget=null;player.attackMove=false;
    updatePlayer(.05);const dx=player.group.position.x-origin.x,dz=player.group.position.z-origin.z;
    player.group.position.copy(saved);clearFriendlyRoute(player);return {dx,dz};
  });
  assert.ok(r.dz>0&&Math.abs(r.dx)<.001,JSON.stringify(r));
});
test('攻击移动杀敌后继续原始目的地',async()=>{
  const r=await page.evaluate(()=>{
    const unit=createFriendlyUnit('light',cellCenter(8,15)),goal=cellCenter(10,15);
    wc3SetSelection([{kind:'unit',ref:unit}]);issueSelectionCommand('attackMove',goal);
    clearFriendlyRoute(unit);unit.attackTarget=null;updateFriendlyUnits(.016);
    return {target:unit.moveTarget,goal};
  });
  assert.ok(r.target);assert.deepEqual(r.target,r.goal);
});
test('Ctrl数字编队，数字召回，双击数字聚焦；编队不受选择顺序影响',async()=>{
  await page.evaluate(()=>{state=STATE.PREP;game.prepTime=10000;if(!friendlyUnits.length)createFriendlyUnit('light',cellCenter(8,15));wc3SetSelection(friendlyUnits.filter(u=>u.alive).map(ref=>({kind:'unit',ref})));});
  await page.mouse.move(720,450);
  const count=await page.evaluate(()=>wc3Selection.length);
  await page.keyboard.press('Control+2');await page.evaluate(()=>wc3ClearSel());await page.keyboard.press('2');
  assert.equal(await page.evaluate(()=>wc3Selection.length),count);
  await page.keyboard.press('2');
  const focus=await page.evaluate(()=>Math.hypot(camFocus.x-wc3Selection[0].ref.group.position.x,camFocus.z-wc3Selection[0].ref.group.position.z));
  assert.ok(focus<1);
  await page.evaluate(()=>{state=STATE.PAUSED;});
});

test('缺钱自动等待、来钱续单；混合批选统一开启',async()=>{
  const result=await page.evaluate(()=>{
    const units=builtHouses.slice(-2),owners=units.map(u=>upgradeOwner('house',u));
    game.autoUpgrades={};game.upgradeJobs=[];game.gold=0;
    startAutoUpgrade('house','',owners[0]);
    const enabled=toggleAutoUpgrades('house','',owners);resumeAutoUpgrades();
    const waiting=game.upgradeJobs.length===0&&owners.every(o=>isAutoUpgrade('house','',o));
    game.gold=10000;resumeAutoUpgrades();const jobs=game.upgradeJobs.length;
    toggleAutoUpgrades('house','',owners);return {enabled,waiting,jobs};
  });
  assert.deepEqual(result,{enabled:true,waiting:true,jobs:2});
});
test('无人机按钮右键可关闭，已付费配送单不被取消或重复收费',async()=>{
  const result=await page.evaluate(()=>{
    game.gold=100000;placeFixture('heroHub');wc3SetSelection([{kind:'heroHub',ref:heroHubs[0]}]);renderCmdCard();
    const click=()=>{const button=[...document.querySelectorAll('#cmdcard .cmdBtn')].find(b=>b._cmdCardItem.heroSkill==='heal');button.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));};
    click();const enabled=!!game.autoHeroSkills.heal,gold=game.gold,count=heroArchive().orders.length;
    click();return {enabled,disabled:!game.autoHeroSkills.heal,sameGold:game.gold===gold,count,sameOrders:count===heroArchive().orders.length};
  });
  assert.deepEqual(result,{enabled:true,disabled:true,sameGold:true,count:1,sameOrders:true});
});
test('运行中无页面异常',()=>assert.deepEqual(errors,[]));

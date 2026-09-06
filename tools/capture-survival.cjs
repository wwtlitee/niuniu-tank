"use strict";

const path = require("node:path");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const server = await createStaticServer(projectRoot);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${origin}/index.html?mode=survival&autotest=1`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
    await page.waitForFunction(() => typeof state !== "undefined" && state === 7, null, { timeout: 30_000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
      game.gold=9999;game.popMax=99;
      const place=(id,anchor)=>{const index=shopList().findIndex((item)=>item.id===id),build=shopList()[index];selectBuild(index);ghost.visible=true;const center=footprintCenter(anchor,build);tryPlace(center.x,center.z);selectBuild(null);};
      place("research",{x:3,z:31});place("factory",{x:11,z:30});place("beacon",{x:12,z:41});place("turret",{x:14,z:35});
      chooseTurretBranch(builtTurrets[0],"cannon");
      const units=[createFriendlyUnit("light",cellCenter(9,37)),createFriendlyUnit("medium",cellCenter(11,37)),createFriendlyUnit("heavy",cellCenter(13,39)),createFriendlyUnit("repair",cellCenter(9,40))];
      enemies.splice(0).forEach((enemy)=>scene.remove(enemy.group));
      game.wave=21;game.enemiesToSpawn=0;state=STATE.PLAYING;
      for(let index=0;index<70;index++){
        spawnEnemy(index%9===0?"heavy":index%5===0?"fast":"normal",false);
        const enemy=enemies[enemies.length-1],cell=cellCenter(18+index%10,29+Math.floor(index/10)*2);
        enemy.group.position.set(cell.x+(index%2)*.7,heightAt(cell.x,cell.z),cell.z);enemy.spawnFlash=0;
      }
      document.getElementById("waveInfo").childNodes[0].nodeValue="WAVE 21";updateEnemyLeftUI();
      wc3SetSelection(units.map((unit)=>({kind:"unit",ref:unit})));wc3RenderSel();renderCmdCard();updateGoldUI();renderer.render(scene,camera);
    });
    const output = path.join(projectRoot, "pdoc", "report", "REPORT_夜幕尸潮运行态_v6.2.0.png");
    await page.screenshot({ path: output });
    const rampOutput = path.join(projectRoot, "pdoc", "report", "REPORT_坡道无遮挡_v6.3.1.png");
    await page.evaluate(() => {
      enemies.forEach((enemy)=>{enemy.group.userData.captureParent=enemy.group.parent;if(enemy.group.parent)enemy.group.parent.remove(enemy.group);});
      const rampCaptureObjects=[baseGroup,...researchInstitutes.map((item)=>item.group),...heavyFactories.map((item)=>item.group),
        ...visionBeacons.map((item)=>item.group),...builtTurrets.map((item)=>item.group),...friendlyUnits.map((item)=>item.group)].filter(Boolean);
      rampCaptureObjects.forEach((object)=>{object.userData.rampCaptureVisible=object.visible;object.visible=false;});
      window.__rampCaptureObjects=rampCaptureObjects;
      if(wc3SelectionRing)wc3SelectionRing.visible=false;
      const ramp=ACTIVE_MODE.ramp;
      const point=cellCenter(ramp.col,ramp.row);
      camFocus.set(point.x,1.1,point.z);
      camHeight=20;
      updateCamera(0);
      renderer.render(scene,camera);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: rampOutput });
    const wallOutput = path.join(projectRoot, "pdoc", "report", "REPORT_夜幕巨岩零发光_v6.2.0.png");
    await page.evaluate(() => {
      (window.__rampCaptureObjects||[]).forEach((object)=>{object.visible=object.userData.rampCaptureVisible;delete object.userData.rampCaptureVisible;});
      window.__rampCaptureObjects=null;
      enemies.forEach((enemy)=>{const parent=enemy.group.userData.captureParent;if(parent)parent.add(enemy.group);delete enemy.group.userData.captureParent;});
      const cells=[4,6,8,10,12];
      window.__captureWallStage=new THREE.Group();
      mapGroup.add(window.__captureWallStage);
      cells.forEach((x,index)=>buildWallTile(window.__captureWallStage,x,43,(index+1)*10));
      const center=cellCenter(8,43);
      camFocus.set(center.x,1.35,center.z);
      camHeight=28;
      updateCamera(0);
      renderer.render(scene,camera);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: wallOutput });
    const baseOutput = path.join(projectRoot, "pdoc", "report", "REPORT_夜幕建筑照明近景_v6.2.0.png");
    await page.evaluate(() => {
      if(window.__captureWallStage){
        mapGroup.remove(window.__captureWallStage);
        window.__captureWallStage=null;
      }
      if(player&&player.group){
        player.group.visible=false;
        player.group.position.set(HALF+100,0,HALF+100);
      }
      if(wc3SelectionRing)wc3SelectionRing.visible=false;
      const research=researchInstitutes[0],factory=heavyFactories[0];
      const point=research&&factory
        ?research.group.position.clone().add(factory.group.position).multiplyScalar(.5)
        :new THREE.Box3().setFromObject(baseGroup).getCenter(new THREE.Vector3());
      camFocus.copy(point);
      camHeight=40;
      updateCamera(0);
      renderer.render(scene,camera);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: baseOutput });
    const beaconOutput = path.join(projectRoot, "pdoc", "report", "REPORT_警戒灯塔与共享视野_v6.2.0.png");
    await page.evaluate(() => {
      enemies.forEach((enemy)=>{enemy.group.userData.captureVisible=enemy.group.visible;enemy.group.visible=false;});
      const beacon=visionBeacons[0];
      if(beacon){
        camFocus.set(beacon.group.position.x,1.1,beacon.group.position.z);
        camHeight=19;
        updateCamera(0);
        renderer.render(scene,camera);
      }
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: beaconOutput });
    const turretLevelOneOutput = path.join(projectRoot, "pdoc", "report", "REPORT_专属炮台Lv1价格_v6.3.0.png");
    const turretLevelFiveOutput = path.join(projectRoot, "pdoc", "report", "REPORT_专属炮台Lv5模型_v6.3.0.png");
    await page.evaluate(() => {
      enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
      state=STATE.BUILD;game.wave=0;game.enemiesToSpawn=0;
      if(baseGroup)baseGroup.visible=false;
      researchInstitutes.forEach((building)=>building.group.visible=false);
      heavyFactories.forEach((building)=>building.group.visible=false);
      visionBeacons.forEach((building)=>building.group.visible=false);
      builtTurrets.splice(0).forEach((turret)=>scene.remove(turret.group));
      game.gold=999999;
      const makeCaptureTurret=(cx,cz)=>{
        const group=makeTurretMesh("turret"),position=cellCenter(cx,cz),stats=turretStats("turret",0);
        group.position.set(position.x,heightAt(position.x,position.z),position.z);scene.add(group);
        const turret={group,kind:"turret",turretKey:"turret",level:0,cx,cz,range:stats.range*TILE,cd:0,
          fireCd:1/stats.fireRate,dmg:stats.dmg,blast:0,pierce:0,slow:0,stun:0,chain:0,
          hp:40,maxHp:40,bar:{visible:false},barFg:{visible:false}};
        builtTurrets.push(turret);chooseTurretBranch(turret,"rapid");return turret;
      };
      window.__captureTurretLv1=makeCaptureTurret(13,35);
      window.__captureTurretLv5=makeCaptureTurret(16,35);
      document.getElementById("announce").style.opacity=0;
      wc3Select("turret",window.__captureTurretLv1);wc3RenderSel();
      const left=window.__captureTurretLv1.group.position,right=window.__captureTurretLv5.group.position;
      camFocus.set((left.x+right.x)*.5,1.15,(left.z+right.z)*.5);camHeight=17;updateCamera(0);renderer.render(scene,camera);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: turretLevelOneOutput });
    await page.evaluate(() => {
      const turret=window.__captureTurretLv5;
      for(let step=0;step<4;step++)upgradeTurretAt(turret.cx,turret.cz);
      document.getElementById("announce").style.opacity=0;
      wc3Select("turret",turret);wc3RenderSel();renderer.render(scene,camera);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: turretLevelFiveOutput });
    const facingOutput = path.join(projectRoot, "pdoc", "report", "REPORT_夜幕共享视野战斗_v6.2.0.png");
    await page.evaluate(() => {
      if(baseGroup)baseGroup.visible=true;
      researchInstitutes.forEach((building)=>building.group.visible=true);
      heavyFactories.forEach((building)=>building.group.visible=true);
      visionBeacons.forEach((building)=>building.group.visible=true);
      enemies.forEach((enemy)=>{enemy.group.visible=enemy.group.userData.captureVisible!==false;delete enemy.group.userData.captureVisible;});
      enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
      builtTurrets.splice(0).forEach((turret)=>scene.remove(turret.group));
      const wall={x:24,z:26},wallKey=idx(wall.x,wall.z),wallCenter=cellCenter(wall.x,wall.z);
      grid[wall.z][wall.x]=T_STEEL;steelHP.set(wallKey,1000);wallMeta.set(wallKey,{lv:1,hp:1000,thorns:0});
      const wallMesh=buildWallTile(mapGroup,wall.x,wall.z,1);tileMeshes[wallKey]=wallMesh;structCells.add(wallKey);computeFlowField();
      game.wave=1;state=STATE.PLAYING;
      for(let index=0;index<4;index++){
        spawnEnemy("normal",false);const enemy=enemies[enemies.length-1],start=cellCenter(17+index,25+index%2);
        enemy.group.position.set(start.x,heightAt(start.x,start.z),start.z);enemy.spawnFlash=0;
        if(enemy.beam){scene.remove(enemy.beam);enemy.beam=null;}
      }
      for(let frame=0;frame<300;frame++)updateEnemies(1/60);
      const turretGroup=makeTurretMesh("turret"),turretCell=cellCenter(16,26);
      turretGroup.position.set(turretCell.x,heightAt(turretCell.x,turretCell.z),turretCell.z);scene.add(turretGroup);
      builtTurrets.push({group:turretGroup,kind:"turret",turretKey:"turret",level:0,range:80,cd:999,fireCd:1,dmg:1,blast:0,
        hp:40,maxHp:40,bar:{visible:false},barFg:{visible:false}});
      for(let frame=0;frame<120;frame++){updateEnemies(1/60);updateBuiltTurrets(1/60);}
      document.getElementById("waveInfo").childNodes[0].nodeValue="WAVE 1";updateEnemyLeftUI();wc3ClearSel();wc3RenderSel();renderCmdCard();
      camFocus.set((wallCenter.x+turretCell.x)*.5,1.2,(wallCenter.z+turretCell.z)*.5);
      camHeight=27;updateCamera(0);renderer.render(scene,camera);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: facingOutput });
    process.stdout.write(`${output}\n${rampOutput}\n${wallOutput}\n${baseOutput}\n${beaconOutput}\n${turretLevelOneOutput}\n${turretLevelFiveOutput}\n${facingOutput}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const outputDir = path.join(projectRoot, "output", "zombie-visual-v6.5.1");
  fs.mkdirSync(outputDir, { recursive: true });
  const server = await createStaticServer(projectRoot);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => consoleErrors.push(String(error && (error.stack || error.message || error))));
    await page.goto(`${origin}/index.html?mode=survival&autotest=1`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
    await page.waitForFunction(() => typeof state !== "undefined" && state === 7, null, { timeout: 40_000 });
    const rows = await page.evaluate(() => {
      if(questActive)questSkip();
      state=STATE.BUILD;game.wave=1;game.enemiesToSpawn=0;
      updateCamera=()=>{};isPositionVisible=()=>true;redrawVisionFog=()=>{};
      enemies.splice(0).forEach((enemy)=>{scene.remove(enemy.group);if(enemy.beam)scene.remove(enemy.beam);});
      mapGroup.visible=false;
      if(baseGroup)baseGroup.visible=false;
      builtTurrets.forEach((item)=>item.group.visible=false);
      researchInstitutes.forEach((item)=>item.group.visible=false);
      heavyFactories.forEach((item)=>item.group.visible=false);
      visionBeacons.forEach((item)=>item.group.visible=false);
      friendlyUnits.forEach((item)=>item.group.visible=false);
      if(wc3SelectionRing)wc3SelectionRing.visible=false;
      document.getElementById("survivalFogCanvas").style.display="none";
      scene.children.filter((child)=>child.userData&&child.userData.visionFog).forEach((child)=>child.visible=false);
      const stage=new THREE.Mesh(new THREE.PlaneGeometry(34,18),new THREE.MeshStandardMaterial({color:0x242a30,roughness:.98}));
      stage.rotation.x=-Math.PI/2;stage.position.y=-.03;stage.receiveShadow=true;scene.add(stage);
      const inspectionLight=new THREE.DirectionalLight(0xffffff,.8);inspectionLight.position.set(5,9,8);scene.add(inspectionLight);
      ambient.intensity=Math.max(ambient.intensity,.38);
      const positions=[[-10,0],[-6,0],[-2,0],[2,0],[6,0],[10,0]];
      const rows=[];
      for(let index=0;index<6;index++){
        spawnEnemy("normal",false);const enemy=enemies[enemies.length-1],position=positions[index];
        enemy.group.position.set(position[0],0,position[1]);enemy.group.rotation.y=0;enemy.group.visible=true;enemy.spawnFlash=0;
        if(enemy.beam){scene.remove(enemy.beam);enemy.beam=null;}
        const bones=[];enemy.animationRoot.traverse((object)=>{if(object.isBone)bones.push({object,before:object.quaternion.clone()});});
        enemy.actions.idle?.stop();enemy.actions.walk?.reset().play();enemy.mixer?.update(.22+index*.04);
        const changedBones=bones.filter(({object,before})=>1-Math.abs(object.quaternion.dot(before))>1e-6).length;
        enemy.group.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(enemy.group),size=box.getSize(new THREE.Vector3());
        const clip=enemy.actions.walk?.getClip();
        const center=box.getCenter(new THREE.Vector3());
        rows.push({variant:enemy.variantId,pack:enemy.variantPack,height:Number(size.y.toFixed(2)),width:Number(size.x.toFixed(2)),depth:Number(size.z.toFixed(2)),center:center.toArray().map((value)=>Number(value.toFixed(2))),changedBones,clipDuration:clip?.duration||0,trackSample:(clip?.tracks||[]).slice(0,5).map((track)=>track.name)});
      }
      camera.position.set(0,7,18);camera.lookAt(new THREE.Vector3(0,1.5,0));camera.updateMatrixWorld(true);
      window.__captureRender=renderer.render.bind(renderer);window.__captureRender(scene,camera);renderer.render=()=>{};
      window.__visualEnemies=[...enemies];
      return rows;
    });
    await page.waitForTimeout(250);
    await page.evaluate(()=>{window.__visualEnemies.forEach((enemy)=>enemy.group.visible=true);window.__captureRender(scene,camera);});
    await page.screenshot({ path: path.join(outputDir, "lineup.png") });
    for (let index = 0; index < rows.length; index++) {
      await page.evaluate((activeIndex) => {
        window.__visualEnemies.forEach((enemy,index)=>enemy.group.visible=index===activeIndex);
        const enemy=window.__visualEnemies[activeIndex],position=enemy.group.position;
        camera.position.set(position.x,3.7,position.z+7);camera.lookAt(new THREE.Vector3(position.x,1.45,position.z));camera.updateMatrixWorld(true);window.__captureRender(scene,camera);
      }, index);
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(outputDir, `${index+1}-${rows[index].variant}.png`) });
    }
    fs.writeFileSync(path.join(outputDir, "visual-state.json"), JSON.stringify({ rows, consoleErrors }, null, 2), "utf8");
    process.stdout.write(`${JSON.stringify({ outputDir, rows, consoleErrors }, null, 2)}\n`);
    if (consoleErrors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

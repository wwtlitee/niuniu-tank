const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'output/combat-6.31.0');fs.mkdirSync(dir,{recursive:true});
 const server=await createStaticServer(root),browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7);
  await page.evaluate(()=>{
   state=STATE.PAUSED;game.gold=1000;
   for(const id of ['questPanel','prepBar','announce','toast']){const e=document.getElementById(id);if(e)e.style.display='none';}
   const center=cellCenter(7,17);let index=0;
   for(const type of ['light','medium','heavy','repair','repair']){
    const unit=createFriendlyUnit(type,{x:center.x+(index-2)*4,z:center.z});unit.group.rotation.y=Math.PI;
    if(type==='repair')upgradeRepairUnit(unit,index===3?'speed':'attack');index++;
   }
   camFocus.set(center.x,heightAt(center.x,center.z),center.z);camHeight=22;updateCamera(0);renderer.render(scene,camera);
  });await page.screenshot({path:path.join(dir,'tank-types.png')});
  const laser=await page.evaluate(()=>{
   const p=cellCenter(15,12),g=makeTurretMesh('emp');g.position.set(p.x,heightAt(p.x,p.z),p.z);scene.add(g);
   const victims=[];for(let i=0;i<6;i++){spawnEnemy('normal',false);const e=enemies.at(-1);e.group.position.set(p.x,p.y||0,p.z+5+i*2);e.spawnFlash=0;e.hp=e.maxHp=100;victims.push(e);}
   aimTurretAt(g,enemyAimPoint(victims[0]),1);g.updateMatrixWorld(true);const origin=g.userData.turret.userData.muzzleMarker.getWorldPosition(new THREE.Vector3());
   fireLaserTurret({dmg:2},origin,enemyAimPoint(victims[0]),20,2);
   camFocus.copy(g.position).add(new THREE.Vector3(0,0,6));camHeight=22;updateCamera(0);updateVisionSystem(1);renderer.render(scene,camera);
   return {hits:victims.filter(e=>e.hp<100).length};
  });await page.screenshot({path:path.join(dir,'laser.png')});
  await page.evaluate(()=>{const p=cellCenter(7,16);camFocus.set(p.x,0,p.z);camHeight=65;updateCamera(0);renderer.render(scene,camera);});await page.screenshot({path:path.join(dir,'terrain.png')});
  fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({errors,laser},null,2));console.log(JSON.stringify({errors,laser}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

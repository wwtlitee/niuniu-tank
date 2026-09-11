const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{const server=await createStaticServer(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11']});
try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7);
const result=await page.evaluate(()=>{
 state=STATE.PAUSED;game.wave=10;game.survivalElapsed=1200;game.tech.defense=10;
 const x=ACTIVE_MODE.ramp.col,z=ACTIVE_MODE.ramp.row,ci=idx(x,z),center=cellCenter(x,z);
 grid[z][x]=T_STEEL;wallMeta.set(ci,{lv:50,hp:7200,wasRamp:true});steelHP.set(ci,7200);structCells.add(ci);
 const wall={x,z,center};
 for(let i=0;i<18;i++){spawnEnemy(['siege','heavy','elite'][i%3],false);const e=enemies.at(-1),angle=(i-9)*.08;e.group.position.set(center.x+Math.cos(angle)*2.55,heightAt(center.x+2.55,center.z),center.z+Math.sin(angle)*2.55);e.objectiveKind='wall';e.objectiveCell={x,z};e.spawnFlash=0;}
 _animFrame++;const slots=enemies.filter(e=>enemyWallAttackSlot(e,wall));
 const maxHp=wallMaxHp(50),rawDps=slots.reduce((a,e)=>a+enemyWallDamage(e)/.9,0),actualDps=rawDps*.75;
 const frames=600,dt=1/60;steelHP.set(ci,1e7);const initial=steelHP.get(ci);
 for(let i=0;i<frames;i++)for(const e of slots){e.wallCd=(e.wallCd||0)-dt;if(e.wallCd<=0){damageWallCell(x,z,enemyWallDamage(e));e.wallCd=.9;}}
 const measured=(initial-steelHP.get(ci))/(frames*dt);
 spawnEnemy('normal',true,10);const boss=enemies.at(-1);const bossFrontRaw=rawDps-enemyWallDamage(slots[0])/.9+enemyWallDamage(boss)/.55;
 const techCases=[0,10,26].map(tech=>{game.tech.defense=tech;const hp=wallMaxHp(50),armor=Math.min(.65,.025*researchPowerLevel(tech));const loss=rawDps*(1-armor),healing=hp*.1+36,bossLoss=bossFrontRaw*(1-armor);return {tech,hp,beaconHealing:hp*.1,withOneRepair:healing,wallDamage:loss,bossFrontDamage:bossLoss,netDamage:loss-healing,threeWallsSeconds:loss>healing?3*hp/(loss-healing):null};});
 const curve=Array.from({length:10},(_,i)=>({wave:i+1,multiplier:SurvivalSystem.meleeWaveMultiplier(i+1)}));
 const target=cellCenter(ACTIVE_MODE.ramp.col+1,ACTIVE_MODE.ramp.row);camFocus.set(target.x,0,target.z);camHeight=42;updateCamera(0);for(const e of enemies)e.group.visible=false;
 for(const id of ['questPanel','prepBar','announce','toast']){const el=document.getElementById(id);if(el)el.style.display='none';}renderer.render(scene,camera);
 return {slots:slots.length,slotTypes:slots.map(e=>e.type),maxHp,rawDps,actualDps,measured,techCases,curve};
});await page.screenshot({path:'output/canyon-latest.png'});fs.writeFileSync('output/wall-assault-6.31.0.json',JSON.stringify(result,null,2));console.log(result);assert.equal(result.slots,6);assert.ok(Math.abs(result.measured-result.actualDps)/result.actualDps<.12);
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

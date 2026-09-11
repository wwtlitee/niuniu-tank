'use strict';
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const server=await createStaticServer(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=d3d11']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);await page.waitForFunction(()=>typeof state!=='undefined'&&state===7);
 const result=await page.evaluate(()=>{
  state=STATE.PAUSED;const rows=[];
  for(const towerCount of [0,1,3])for(const cars of [0,2,12]){
   resetGame();state=STATE.PAUSED;game.gold=1e6;
   const x=ACTIVE_MODE.canyon.x0+1,z=ACTIVE_MODE.canyon.z0,ci=idx(x,z),center=cellCenter(x,z),max=wallMaxHp(50);
   grid[z][x]=T_STEEL;wallMeta.set(ci,{lv:50,hp:max*.1});steelHP.set(ci,max*.1);tileMeshes[ci]=buildWallTile(mapGroup,x,z,50);
   for(let i=0;i<towerCount;i++){const group=new THREE.Group();group.position.set(center.x-6,PH,center.z);scene.add(group);visionBeacons.push({group,hp:100,maxHp:100,level:5});}
   for(let i=0;i<cars;i++){const u=createFriendlyUnit('repair',{x:center.x-8,z:center.z});u.repairTarget=wallRepairTarget({x,z});u.command='repair';}
   const before=steelHP.get(ci),gold=game.gold;
   for(let t=0;t<60;t++){_animFrame++;updateMedicalBeacons(1/60);updateFriendlyUnits(1/60);}
   rows.push({towers:towerCount,cars,max,healing:steelHP.get(ci)-before,cost:gold-game.gold});
  }
  const pressure=[];
  for(const difficulty of [1,1.5])for(const wave of [3,5,10]){
   game.difficultyMultiplier=difficulty;game.survivalElapsed=wave*60;
   const normal={type:'normal',sourceWave:wave,boss:false};const boss={sourceWave:wave,boss:true,bossMechanic:wave===10?'doom':'siege'};
   const dps=enemyWallDamage(normal)*8/.9,bossDps=enemyWallDamage(boss)/.55+enemyWallDamage(normal)*7/.9;
   pressure.push({difficulty,wave,elapsed:game.survivalElapsed,normal8Dps:dps,bossAnd7Dps:bossDps});
  }
  const techCost=['tank','defense'].reduce((sum,k)=>sum+Array.from({length:5},(_,i)=>SurvivalSystem.researchCost(k,i,10)).reduce((a,b)=>a+b,0),0);
  return {version:GAME_VERSION,rows,pressure,techCost,repair:SurvivalSystem.FRIENDLY_UNIT_TYPES.repair};
 });
 fs.mkdirSync('output/medical-balance',{recursive:true});fs.writeFileSync(`output/medical-balance/${process.argv[2]||'latest'}.json`,JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result));if(errors.length)throw new Error(errors.join('\n'));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

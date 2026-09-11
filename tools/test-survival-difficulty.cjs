const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=await createStaticServer(root);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11']});
 const output={version:'6.31.0',method:'50ms simulation steps; normal resources/construction/damage; simulated monotonic clock; automated strategy, not human play',runs:[]};
 try{
  for(const strategy of (process.argv[2]?[process.argv[2]]:['three-healers','economy-defense'])){
   const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
   await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7,null,{timeout:90000});
   await page.evaluate(({strategy,pressure})=>{
    if(pressure==='linear')survivalPressureMultiplier=()=>ACTIVE_MODE.key==='survival'?1+.05*Math.floor(Math.max(0,Number(game.survivalElapsed)||0)/30):1;
    else survivalPressureMultiplier=()=>ACTIVE_MODE.key==='survival'?Math.min(1e6,Math.pow(1.05,Math.min(300,Math.floor(Math.max(0,Number(game.survivalElapsed)||0)/30)))):1;
    window.probe={strategy,time:0,clock:performance.now(),realNow:performance.now.bind(performance),samples:[],waves:[],peak:0,actions:[],resume:state};
    performance.now=()=>probe.clock;state=STATE.PAUSED;
    const p=cellCenter(9,18);camFocus.set(p.x,0,p.z);camHeight=65;updateCamera(0);
    probe.order=(id,x,z)=>{const b=shopList().find(b=>b.id===id);if(queueConstruction(b,{x,z})){probe.actions.push({t:Math.round(probe.time),id,x,z});return true;}return false;};
    probe.count=id=>({beacon:visionBeacons.length,goldmine:goldMines.length,turret:builtTurrets.length,house:builtHouses.length,research:researchInstitutes.length}[id]||0)+constructionJobs.filter(j=>j.build.id===id&&j.phase!=='returning').length;
    probe.build=id=>{const b=shopList().find(b=>b.id===id);if(game.gold<priceOf(b)||game.popUsed+(b.pop||0)>game.popMax)return false;
      const cells=[];for(let z=12;z<22;z++)for(let x=2;x<=9;x++)cells.push({x,z});
      cells.sort((a,b)=>((a.x-9)**2+(a.z-18)**2)-((b.x-9)**2+(b.z-18)**2));
      for(const c of cells)if(footprintPlaceable(c,b)&&probe.order(id,c.x,c.z))return true;return false;};
    probe.order('wall',10,18);
    if(strategy==='economy-balanced'||strategy==='economy-laser'||strategy==='economy-active'){probe.order('beacon',7,17);probe.order('beacon',7,18);probe.order('beacon',7,19);}else{probe.build('beacon');probe.build('beacon');probe.build('beacon');}
    if(strategy!=='three-healers')probe.build('goldmine');
    probe.act=()=>{
      if(player?.alive&&strategy!=='three-healers'){player.attackMove=true;if(!player.moveTarget&&!player.attackTarget){const target=cellCenter(9,18);player.moveTarget={x:target.x,z:target.z};}}
      if(strategy==='economy-active'||strategy==='economy-laser'){
        const level=wallLvAt(10,18),mine=goldMines[0];
        if(level>0&&level<12){if(game.gold>=wallPriceNext(level))upgradeWallAt(10,18);return;}
        if(!mine)return;
        if(mine.level<2){if(game.gold>=goldMineUpCost(mine.level))upgradeGoldMine(mine);return;}
        const basic=builtTurrets.find(t=>t.turretKey==='turret');
        if(basic){if(game.gold>=turretBranchCost())chooseTurretBranch(basic,strategy==='economy-laser'?'emp':'cannon');return;}
        if(probe.count('turret')<4){if(game.popUsed+2>game.popMax)probe.build('house');else probe.build('turret');return;}
        const weak=builtTurrets.find(t=>t.level<2);
        if(weak){if(game.gold>=turretUpgradeCost(weak))upgradeTurretAt(weak.cx,weak.cz);return;}
        if(mine.level<3){if(game.gold>=goldMineUpCost(mine.level))upgradeGoldMine(mine);return;}
      }
      if(strategy==='economy-balanced'){
        const level=wallLvAt(10,18);
        if(level>0&&level<12){if(game.gold>=wallPriceNext(level))upgradeWallAt(10,18);return;}
        if(!goldMines.length)return;
        const target=goldMines.find(m=>m.level<3);
        if(target){if(game.gold>=goldMineUpCost(target.level))upgradeGoldMine(target);return;}
        if(probe.count('goldmine')<3){probe.build('goldmine');return;}
      }
      if(strategy==='economy-growth'){
        const level=wallLvAt(10,18);
        if(level>0&&level<8&&game.gold>=wallPriceNext(level))upgradeWallAt(10,18);
        if(probe.count('goldmine')<3){probe.build('goldmine');return;}
        const target=goldMines.find(m=>m.level<3);
        if(target){if(game.gold>=goldMineUpCost(target.level))upgradeGoldMine(target);return;}
      }
      if(wallLvAt(10,18)>0&&wallLvAt(10,18)<wallUnlockedMaxLevel()&&game.gold>=wallPriceNext(wallLvAt(10,18)))upgradeWallAt(10,18);
      if(strategy==='three-healers')return;
      const mine=goldMines[0];if(mine&&mine.level<4&&game.gold>=goldMineUpCost(mine.level)+100)upgradeGoldMine(mine);
      if(probe.count('turret')<8){if(game.popUsed+2>game.popMax&&probe.count('house')<5)probe.build('house');else probe.build('turret');}
      for(const t of builtTurrets){if(t.turretKey==='turret'&&game.gold>=turretBranchCost())chooseTurretBranch(t,strategy==='economy-laser'?['emp','emp','cannon','antitank'][builtTurrets.indexOf(t)%4]:'cannon');else if(t.level<turretUnlockedMaxLevel()-1&&game.gold>=turretUpgradeCost(t))upgradeTurretAt(t.cx,t.cz);}
      if(strategy==='economy-laser'&&builtTurrets.length>=6){if(!researchInstitutes.length)probe.build('research');else if(game.tech.turret<10&&game.gold>=techCost('turret'))upgradeTech('turret');}
      for(const b of visionBeacons){const cost=medicalBeaconUpgradeCost(b);if(cost&&game.gold>=cost+100)upgradeMedicalBeacon(b);}
    };
   },{strategy,pressure:process.argv[3]||'compound'});
   let snapshot;
   for(let chunk=0;chunk<100;chunk++){
    snapshot=await page.evaluate(()=>{
      state=probe.resume;
      for(let f=0;f<400&&state!==STATE.OVER&&state!==STATE.SETTLE;f++){
       if(f%20===0)probe.act();probe.clock+=50;probe.time+=.05;
       const start=probe.realNow();stepGame(.05,probe.clock);const elapsed=probe.realNow()-start;
       if(f%10===0){updateCrowdLod();renderer.render(scene,camera);probe.samples.push(elapsed);}
       probe.peak=Math.max(probe.peak,enemies.length);
       if(probe.waves.at(-1)?.wave!==game.wave)probe.waves.push({wave:game.wave,t:+probe.time.toFixed(1),active:activeEnemyCount(),gold:Math.round(game.gold)});
      }
      probe.resume=state;state=STATE.PAUSED;
      return {seconds:Math.round(probe.time),wave:game.wave,pressure:survivalPressureMultiplier(),state:probe.resume,peak:probe.peak,active:activeEnemyCount(),queued:game.enemiesToSpawn,gold:Math.round(game.gold),base:game.gateHp,wall:steelHP.get(idx(10,18))||0,turrets:builtTurrets.length,healers:visionBeacons.length,mine:goldMines[0]?.level||0,done:probe.resume===STATE.OVER||probe.resume===STATE.SETTLE};
    });
    console.log(strategy,JSON.stringify(snapshot));
    if(snapshot.done)break;
   }
   const detail=await page.evaluate(()=>{const s=probe.samples.sort((a,b)=>a-b),gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {waves:probe.waves,actions:probe.actions,stepMs:{median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)},gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',contextLost:gl.isContextLost()};});
   await page.screenshot({path:path.join(root,`output/difficulty-${strategy}-6.31.0.png`)});
   output.runs.push({strategy,pressureMode:process.argv[3]||'compound',...snapshot,...detail,errors});fs.writeFileSync(path.join(root,`output/difficulty-${process.argv[2]||'baseline'}-${process.argv[3]||'compound'}-6.31.0.json`),JSON.stringify(output,null,2));await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,v]=a.replace(/^--/,'').split('=');return[k,v||true];}));
(async()=>{
 const out=path.resolve('output',args.out||'realtime-baseline');fs.mkdirSync(out,{recursive:true});
 const server=await createStaticServer(process.cwd());const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);await page.waitForFunction(()=>typeof state!=='undefined'&&state===7);
  await page.evaluate(({count,combat})=>{
   state=STATE.PAUSED;questActive=false;hideQuestPanel();game.enemiesToSpawn=0;game.wave=15;game.gateHp=game.gateMaxHp=1e9;
   const wall={x:ACTIVE_MODE.canyon.x1,z:ACTIVE_MODE.canyon.z0},c=cellCenter(wall.x,wall.z),key=idx(wall.x,wall.z);
   const model=buildWallTile(mapGroup,wall.x,wall.z,1);grid[wall.z][wall.x]=T_STEEL;steelHP.set(key,1e9);wallMeta.set(key,{lv:1,hp:1e9,anchor:wall});structCells.add(key);tileMeshes[key]=model;computeFlowField();
   const points=[];for(let x=c.x+2;x<HALF-3;x+=.74)for(let z=-HALF+3;z<HALF-3;z+=.74){const y=heightAt(x,z);if(y<=.02&&!blockedForTank(x,z,.36,y))points.push({x,y,z});}
   points.sort((a,b)=>(a.x-c.x)**2+(a.z-c.z)**2-((b.x-c.x)**2+(b.z-c.z)**2));
   for(let i=0;i<count;i++){if(!points[i])throw Error('Insufficient legal positions');spawnEnemy('normal',false);const e=enemies.at(-1),p=points[i];if(e.beam){scene.remove(e.beam);disposeTransientObject3D(e.beam);e.beam=null;}e.spawnFlash=0;e.hp=e.maxHp=combat?10:1e9;e.group.position.set(p.x,p.y,p.z);e.group.rotation.y=-Math.PI/2;e.dir.set(-1,0,0);}
   if(combat){game.popMax=200;const hero=createFriendlyUnit('hero',{x:c.x-4,z:c.z});heroTank=hero;heroArchive().status='alive';for(const id of Object.keys(HeroSystem.SKILLS))heroArchive().skills[id]=1;hero.range=24;hero.command='hold';rebuildHeroModules(hero);}
   survivalOverview=false;camHeight=80;camFocus.set(-8,0,20);mouse.x=innerWidth/2;mouse.y=innerHeight/2;updateCamera(1);updateHpUI();
  },{count:Number(args.count||3400),combat:!!args.combat});
  await page.waitForTimeout(2500);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  const result=await page.evaluate(seconds=>new Promise(resolve=>{
   const phases={};for(const name of ['updateVisionSystem','updateEnemies','updateBuiltTurrets','updateFriendlyUnits','applyGameplayCollisions','updateBullets','updateParticles','updateCrowdLod','resolveHordeMovement','applyHordeSeparation','updateDamageHealthBars','drawMinimap']){const original=window[name];window[name]=function(...a){const t=performance.now();try{return original(...a);}finally{const p=phases[name]||(phases[name]={ms:0,calls:0});p.ms+=performance.now()-t;p.calls++;}};}
   state=STATE.PLAYING;game.prepTime=0;document.getElementById('prepBar').style.display='none';document.getElementById('waveInfo').firstChild.textContent='尸潮压力测试';lastT=performance.now();survivalFrameMeter.reset();
   const start=performance.now(),deltas=[],samples=[];let previous=start,checkpoint=start;
   function sample(now){deltas.push(now-previous);previous=now;if(now-checkpoint>=1000){samples.push({seconds:(now-start)/1000,fps:survivalFrameStats.fps,alive:activeEnemyCount()});checkpoint=now;}if(now-start<seconds*1000)requestAnimationFrame(sample);else{const sorted=deltas.slice().sort((a,b)=>a-b);resolve({version:GAME_VERSION,seconds:(now-start)/1000,frames:deltas.length,fps:deltas.length*1000/(now-start),p95FrameMs:sorted[Math.floor(sorted.length*.95)],samples,phases,kills:heroArchive().kills,effects:zombieDeathEffects?.inspect()||null,lod:getCrowdLodStats(),hud:document.getElementById('performanceHud').textContent});}}
   requestAnimationFrame(sample);
  }),Number(args.seconds||30));
  const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(out,'cpu.cpuprofile'),JSON.stringify(profile));
  await page.screenshot({path:path.join(out,'realtime.png')});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({...result,errors,method:`${args.count||3400} legal fixture entities and durable gate; hero combat ${!!args.combat}; uninterrupted native RAF, no advanceTime or manual simulation during measurement`},null,2));console.log(JSON.stringify(result));assert.ok(result.fps>=Number(args['min-fps']||0),`Average FPS ${result.fps} below required ${args['min-fps']}`);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

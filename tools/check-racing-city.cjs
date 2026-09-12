'use strict';
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const server=await createStaticServer(process.cwd()),browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']}),out='output/racing-v10.0.0';fs.mkdirSync(out,{recursive:true});
 const errors=[],report={checks:[],errors};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  const state=async()=>JSON.parse(await page.evaluate(()=>render_game_to_text()));
  await page.goto(`http://127.0.0.1:${server.address().port}/racing.html?autotest=1`);await page.waitForFunction(()=>window.racingReady);assert.equal((await state()).circuit.id,'canyon');
  await page.click('[data-track="city"]');await page.waitForFunction(()=>window.racingReady);assert.equal((await state()).circuit.id,'city');assert.equal(await page.locator('[data-track="city"]').getAttribute('aria-current'),'page');
  await page.click('#menuBodies [data-body="6"]');await page.screenshot({path:out+'/city-lobby.png'});report.lobby=await state();
  await page.click('#start');await page.evaluate(()=>advanceTime(3100));await page.keyboard.down('w');await page.evaluate(()=>advanceTime(2200));await page.keyboard.up('w');report.driving=await state();assert.ok(report.driving.player.speed>10,JSON.stringify(report.driving.player));await page.screenshot({path:out+'/city-driving.png'});
  await page.keyboard.press('v');await page.evaluate(()=>advanceTime(0));assert.equal((await state()).camera.mode,'first');await page.screenshot({path:out+'/city-first.png'});await page.keyboard.press('v');
  report.roadSurface=await page.evaluate(()=>RacingTest.probeRoads());assert.ok(report.roadSurface.every(p=>p.actual!==null&&Math.abs(p.actual-p.expected)<.35),JSON.stringify(report.roadSurface.filter(p=>p.actual===null||Math.abs(p.actual-p.expected)>=.35)));report.locations=[];
  for(const [name,progress] of [['street-s',380],['hairpin',770],['bridge',1300],['lower-crossing',180],['sky-crossing',-1]]){
   await page.evaluate(s=>{const R=RacingRules,g=RacingTest.game,c=g.cars[0];if(s<0)s=R.locate(0,0,true,18).s;const p=R.sample(s);Object.assign(c,{x:p.x,y:p.y,z:p.z,heading:p.heading,lastS:p.s,safe:s,progress:s,seg:-1,speed:0,aim:0,pitch:0,slip:0,boost:0,shield:0});advanceTime(0);},progress);
   await page.screenshot({path:out+'/city-'+name+'.png'});const value=await state();assert.ok(value.camera.eye[1]>value.player.y+2.8,name+' camera must stay above this road layer');report.locations.push({name,state:value});
  }
  report.runoff=await page.evaluate(()=>{RacingTest.start();advanceTime(3100);const R=RacingRules,g=RacingTest.game,c=g.cars[0],p=R.sample(45);g.humans=[0,1,2,3,4,5];g.cars.slice(1).forEach(c=>{c.finished=true;});Object.assign(c,{x:p.x+Math.cos(p.heading)*20,y:p.y,z:p.z-Math.sin(p.heading)*20,heading:p.heading,lastS:p.s,safe:p.s,progress:p.s,seg:-1,speed:0});advanceTime(4000);return {offroad:c.offroad,distance:R.locate(c.x,c.z,true,c.y).distance};});assert.ok(report.runoff.offroad>3.9);assert.ok(report.runoff.distance>18);await page.screenshot({path:out+'/city-runoff.png'});
  report.drift=[];
  for(const [tier,chunks] of [[1,3],[2,5],[3,6]]){
   await page.evaluate(()=>{RacingTest.start();advanceTime(3100);const g=RacingTest.game,R=RacingRules,c=g.cars[0],p=R.sample(620);g.humans=[0,1,2,3,4,5];g.cars.slice(1).forEach(c=>{c.x=900;c.z=900;});g.pickups.forEach(p=>p.cooldown=999);Object.assign(c,{x:p.x,y:p.y,z:p.z,heading:p.heading,speed:30,lastS:p.s,progress:p.s,safe:p.s,seg:-1,invulnerable:10});advanceTime(0);});
   await page.keyboard.down('w');await page.keyboard.down('Shift');
   for(let chunk=0;chunk<chunks;chunk++){if(chunk%2===0)await page.keyboard.down('a');else await page.keyboard.up('a');await page.evaluate(()=>advanceTime(300));}
   await page.keyboard.up('a');const charged=await state();assert.equal(await page.evaluate(()=>RacingRules.driftTier(RacingTest.game.cars[0].driftCharge)),tier);assert.equal(charged.player.offroad,0);
   await page.screenshot({path:out+'/city-drift-'+tier+'.png'});await page.keyboard.up('Shift');await page.evaluate(()=>advanceTime(1000/60));await page.keyboard.up('w');const released=await state();assert.equal(released.player.boost,[0,.8,1.4,2.1][tier]);report.drift.push({tier,charged:charged.player,released:released.player});
  }
  await page.evaluate(()=>{RacingTest.start();RacingTest.autodrive(410);});report.finish=await state();assert.equal(report.finish.phase,'finished');assert.equal(report.finish.player.lap,3);await page.screenshot({path:out+'/city-finish.png'});
  await page.click('#again');assert.equal((await state()).circuit.id,'city');assert.equal((await state()).phase,'countdown');
  await page.setViewportSize({width:960,height:540});await page.evaluate(()=>advanceTime(3200));await page.screenshot({path:out+'/city-small.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),960);
  await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>{RacingTest.start();advanceTime(4000);RacingTest.realtime(true);});
  report.perf=await page.evaluate(()=>new Promise(resolve=>{const times=[];let last=performance.now();function frame(t){times.push(t-last);last=t;if(times.length<180)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');resolve({median:times[90],p95:times[171],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown'});}}requestAnimationFrame(frame);}));
  report.inspect=await page.evaluate(()=>RacingTest.inspect());assert.deepEqual(errors,[]);report.passed=true;fs.writeFileSync(out+'/city-runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,circuit:report.finish.circuit,details:report.lobby.trackDetails,inspect:report.inspect,errors}));
 }catch(e){report.failure=e.stack;fs.writeFileSync(out+'/city-runtime.json',JSON.stringify(report,null,2));throw e;}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

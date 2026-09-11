const {chromium}=require('playwright');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const server=await createStaticServer(process.cwd()),browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 const output='output/racing-v6.48.0';fs.mkdirSync(output,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`http://127.0.0.1:${server.address().port}/racing.html?autotest=1`);await page.waitForFunction(()=>window.racingReady);await page.screenshot({path:output+'/lobby.png'});
  await page.click('#start');await page.evaluate(()=>advanceTime(3100));
  await page.keyboard.down('w');await page.evaluate(()=>advanceTime(2000));await page.keyboard.up('w');
  const driving=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.ok(driving.player.speed>2&&driving.player.progress>0,'驾驶输入必须移动车辆越过起点（允许 AI 攻击减速）');
  await page.keyboard.down('Space');await page.evaluate(()=>advanceTime(50));await page.keyboard.up('Space');const shot=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.ok(shot.shots>0,'空格开炮应发射炮弹');
  const heading=driving.player.heading;await page.keyboard.down('d');await page.evaluate(()=>advanceTime(300));await page.keyboard.up('d');assert.ok(JSON.parse(await page.evaluate(()=>render_game_to_text())).player.heading<heading,'D 向画面右侧转弯');
  await page.keyboard.press('Escape');const paused=JSON.parse(await page.evaluate(()=>render_game_to_text()));await page.evaluate(()=>advanceTime(2000));assert.equal(JSON.parse(await page.evaluate(()=>render_game_to_text())).time,paused.time);
  await page.selectOption('#quality','low');await page.uncheck('#shake');await page.screenshot({path:output+'/pause.png'});await page.click('#resume');
  await page.keyboard.down('w');await page.evaluate(()=>advanceTime(500));await page.keyboard.up('w');assert.ok(JSON.parse(await page.evaluate(()=>render_game_to_text())).player.speed>0,'继续按钮不能吞键');
  await page.evaluate(()=>{RacingTest.start();RacingTest.autodrive(15);});await page.screenshot({path:output+'/race.png'});
  const race=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.ok(race.time>10);
  for(const item of ['boost','shield','mine','missile']){
   await page.evaluate(item=>{const g=RacingTest.game,c=g.cars[0];c.item=item;c.cooldown=0;if(item==='missile'){const target=g.cars[1],p=RacingRules.sample(c.lastS+30);Object.assign(target,{x:p.x,z:p.z,progress:c.progress+30,finished:false});}},item);
   await page.keyboard.press('e');const state=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(state.item,null,item+' 应消耗');
   await page.evaluate(()=>advanceTime(150));await page.screenshot({path:output+'/'+item+'.png'});
  }
  await page.evaluate(()=>{RacingTest.start();RacingTest.autodrive(260);});assert.equal(JSON.parse(await page.evaluate(()=>render_game_to_text())).phase,'finished');assert.ok(await page.locator('#results').isVisible());await page.screenshot({path:output+'/finish.png'});
  await page.click('#again');const fresh=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(fresh.phase,'countdown');assert.equal(fresh.shots,0);assert.equal(fresh.mines,0);
  await page.setViewportSize({width:960,height:540});await page.evaluate(()=>advanceTime(4000));await page.screenshot({path:output+'/small.png'});
  assert.ok(await page.locator('#pauseButton').isVisible());const sizing=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,...RacingTest.inspect()}));assert.equal(sizing.scroll,sizing.width);
  // 完成重赛后取样真实 RAF，不以 advanceTime 的规则速度代替渲染帧率。
  await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>{RacingTest.start();advanceTime(4000);RacingTest.realtime();});
  const perf=await page.evaluate(()=>new Promise(resolve=>{const times=[];let last=performance.now();function frame(t){times.push(t-last);last=t;if(times.length<180)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);const gl=document.querySelector('canvas').getContext('webgl2')||document.querySelector('canvas').getContext('webgl'),ext=gl.getExtension('WEBGL_debug_renderer_info');resolve({median:times[90],p95:times[171],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',...RacingTest.inspect()});}}requestAnimationFrame(frame);}));
  assert.deepEqual(errors,[]);const report={driving,race,sizing,perf,errors};fs.writeFileSync(output+'/runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'output/racing-v9.2.0');fs.mkdirSync(out,{recursive:true});
 const server=await createStaticServer(root),browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],models=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}/racing.html?autotest=1`);await page.waitForFunction(()=>window.racingReady,{timeout:60000});
  for(let body=0;body<7;body++){
   await page.click(`#menuBodies [data-body="${body}"]`);await page.click(`#menuColors [data-color="${body%6}"]`);
   await page.waitForFunction(id=>JSON.parse(render_game_to_text()).garage.models[0]===id,body);
   await page.screenshot({path:path.join(out,`body-${body}.png`)});
   models.push(await page.evaluate(()=>({state:JSON.parse(render_game_to_text()).garage,...RacingTest.inspect()})));
  }
  const memoryBefore=await page.evaluate(()=>RacingTest.inspect().memory.geometries);
  for(let i=0;i<21;i++){await page.click(`#menuBodies [data-body="${i%7}"]`);await page.evaluate(()=>advanceTime(0));}
  const memoryAfter=await page.evaluate(()=>RacingTest.inspect().memory.geometries);assert.ok(memoryAfter<=memoryBefore+2,'switching must dispose replaced geometry');
  await page.click('#menuBodies [data-body="6"]');await page.click('#menuColors [data-color="3"]');
  await page.reload();await page.waitForFunction(()=>window.racingReady);assert.equal(await page.getAttribute('#menuBodies [data-body="6"]','aria-pressed'),'true');
  await page.click('#start');await page.evaluate(()=>advanceTime(3100));let state=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(state.player.body,6);assert.equal(state.player.color,3);
  await page.keyboard.down('w');await page.evaluate(()=>advanceTime(1200));await page.keyboard.up('w');state=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.ok(state.player.speed>0);
  await page.screenshot({path:path.join(out,'driving.png')});
  await page.evaluate(()=>{RacingTest.autodrive(25);});await page.screenshot({path:path.join(out,'canyon.png')});
  await page.keyboard.press('Escape');await page.click('#restart');state=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(state.player.body,6);assert.equal(state.player.color,3);
  const sizes=[];
  for(const [width,height] of [[960,540],[390,844]]){
   await page.setViewportSize({width,height});await page.reload();await page.waitForFunction(()=>window.racingReady);
   await page.locator('#menuBodies [data-body="4"]').click();await page.locator('#start').scrollIntoViewIfNeeded();
   sizes.push(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})));assert.equal(sizes.at(-1).width,sizes.at(-1).scroll);
   await page.screenshot({path:path.join(out,`garage-${width}.png`)});
  }
  assert.deepEqual(errors,[]);const report={models,memoryBefore,memoryAfter,sizes,errors};fs.writeFileSync(path.join(out,'garage.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

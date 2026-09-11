"use strict";
const {chromium}=require('playwright');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
const fs=require('node:fs');
(async()=>{
 const server=await createStaticServer(process.cwd()),browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/classic.html?autotest=1`);
 await page.waitForFunction(()=>window.classicReady,{timeout:30000});
 await page.evaluate(()=>ClassicGame.reset(0));
 const output=`output/classic-v${require('../package.json').version}`;
 fs.mkdirSync(output,{recursive:true});
 await page.screenshot({path:`${output}/battlefield.png`});
 const assert=require('node:assert/strict');
 const start=await page.evaluate(()=>JSON.parse(render_game_to_text()));
 await page.keyboard.down('KeyA');await page.evaluate(()=>advanceTime(180));await page.keyboard.up('KeyA');
 const moved=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert.ok(moved.player.x<start.player.x,'movement must change position');
 await page.keyboard.press('Escape');const frozen=await page.evaluate(()=>render_game_to_text());await page.evaluate(()=>advanceTime(500));assert.equal(await page.evaluate(()=>render_game_to_text()),frozen);
 await page.click('#classicResume');
 await page.mouse.move(720,220);await page.mouse.down();await page.evaluate(()=>advanceTime(400));await page.mouse.up();
 assert.ok(await page.evaluate(()=>ClassicGame.inspect().shots>0));
 await page.evaluate(()=>ClassicGame.testClearWave());
 await page.locator('#classicCards button').first().waitFor();
 await page.screenshot({path:`${output}/upgrades.png`});
 await page.locator('#classicCards button').first().click();assert.equal(await page.evaluate(()=>ClassicGame.game.wave),2);
 await page.evaluate(()=>ClassicGame.testLose());await page.click('#classicRestart');assert.equal(await page.evaluate(()=>ClassicGame.game.wave),1);
 for(const layout of [3,4,7]){await page.evaluate(i=>ClassicGame.reset(i),layout);await page.screenshot({path:`${output}/layout-${layout}.png`});}
 await page.setViewportSize({width:900,height:700});await page.screenshot({path:`${output}/compact.png`});
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>ClassicGame.reset(0));
 await page.mouse.move(710,250);await page.mouse.down();await page.evaluate(()=>advanceTime(18000));await page.mouse.up();
 console.log('18s live combat',await page.evaluate(()=>render_game_to_text()));
 await page.screenshot({path:`${output}/combat.png`});
 console.log(JSON.stringify(await page.evaluate(()=>({loaded:ClassicVisuals.loaded,failures:ClassicVisuals.failures,render:ClassicGame.renderNow(),survivalLoaded:!!window.SurvivalSystem}))),errors);
 if(errors.length)throw new Error(errors.join('\n'));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const {chromium}=require('playwright');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const server=await createStaticServer(process.cwd()),browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/classic.html?autotest=1`);await page.waitForFunction(()=>window.classicReady);
await page.evaluate(()=>ClassicGame.reset(0));
fs.mkdirSync('output/classic-v6.20.0',{recursive:true});await page.screenshot({path:'output/classic-v6.20.0/battle.png'});
await page.keyboard.press('Escape');
await page.evaluate(()=>{document.getElementById('classicPause').classList.add('hidden');const p=ClassicGame.testBasePosition();ClassicGame.camera.position.set(p[0]+6,9,p[2]+11);ClassicGame.camera.lookAt(p[0],1,p[2]-1);});
await page.screenshot({path:'output/classic-v6.20.0/eagle.png'});
for(const kind of ['hit','destroy']){
 await page.evaluate(kind=>{ClassicGame.camera.position.set(7,9,24);ClassicGame.camera.lookAt(0,1,12);ClassicGame.testEffect(kind);},kind);
 await page.evaluate(()=>ClassicGame.testEffectAdvance(.12));
 await page.screenshot({path:`output/classic-v6.20.0/${kind}.png`});
}
await page.evaluate(()=>{for(let i=0;i<50;i++)ClassicGame.testEffect('destroy');});
const capped=await page.evaluate(()=>ClassicGame.inspect());assert.ok(capped.effects<=capped.effectLimit);assert.ok(capped.effects>0);
await page.keyboard.press('Escape');await page.evaluate(()=>advanceTime(2300));assert.equal(await page.evaluate(()=>ClassicGame.inspect().effects),0);
await page.evaluate(()=>ClassicGame.reset(1));assert.equal(await page.evaluate(()=>ClassicGame.inspect().effects),0);
assert.deepEqual(errors,[]);console.log(JSON.stringify({capped,errors,cleanup:true}));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

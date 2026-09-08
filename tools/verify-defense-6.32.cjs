const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{const server=await createStaticServer(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11']});
try{const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7);
const wall=await page.evaluate(()=>{
 state=STATE.PAUSED;const {x0:x,z0:z}=ACTIVE_MODE.canyon,g=buildWallTile(mapGroup,x,z,1),bar=g.getObjectByName('damage-health-bar');if(bar)g.remove(bar);
 const box=new THREE.Box3().setFromObject(g),p=cellCenter(x,z);camFocus.set(p.x,1,p.z);camHeight=24;updateCamera(0);for(const id of ['questPanel','prepBar','announce','toast']){const el=document.getElementById(id);if(el)el.style.display='none';}renderer.render(scene,camera);
 return {top:box.max.y,high:PH,span:box.max.z-box.min.z,metadata:g.userData.wallSpan};
});fs.mkdirSync('output/defense-6.32.0',{recursive:true});await page.screenshot({path:'output/defense-6.32.0/wall.png'});
const result=await page.evaluate(()=>{
 resetGame();game.gold=10000;game.gateHp=game.gateMaxHp=1e6;state=STATE.PLAYING;
 const b=shopList().find(b=>b.id==='goldmine'),B=ACTIVE_MODE.base;
 for(const anchor of [{x:ACTIVE_MODE.ramp.col+1,z:ACTIVE_MODE.ramp.row},{x:B.col-1,z:B.row},{x:B.col,z:B.row-1}]){if(!footprintPlaceable(anchor,b))continue;selectBuild(shopList().indexOf(b));ghostCell=anchor;ghost.visible=true;placeBuildingImmediately(null,null);}
 const initialMines=goldMines.length;startWave(1);const realNow=performance.now.bind(performance);let stamp=realNow();performance.now=()=>stamp;
 for(let i=0;i<3600;i++){stamp+=50;stepGame(.05,stamp);}
 const second=enemies.filter(e=>e.sourceWave===2),moved=second.filter(e=>{const sp=ACTIVE_MODE.spawns.map(p=>cellCenter(p.x,p.z));return sp.every(p=>Math.hypot(p.x-e.group.position.x,p.z-e.group.position.z)>5);}).length;
 performance.now=realNow;state=STATE.PAUSED;
 return {initialMines,minesRemaining:goldMines.length,baseDamage:1e6-game.gateHp,wave:game.wave,secondWaveAlive:second.length,secondWaveMoved:moved,queued:game.enemiesToSpawn};
});console.log({wall,result,errors});fs.writeFileSync('output/defense-6.32.0/result.json',JSON.stringify({wall,result,errors},null,2));assert.ok(wall.top<=wall.high+.02&&wall.span>4.5);assert.ok(result.minesRemaining<result.initialMines&&result.baseDamage>0&&result.secondWaveMoved>0);assert.deepEqual(errors,[]);
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

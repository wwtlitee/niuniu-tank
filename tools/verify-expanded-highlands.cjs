const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{const server=await createStaticServer(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11']});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/index.html?mode=survival&autotest=1');await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7);
const result=await page.evaluate(()=>{
state=STATE.PAUSED;game.gold=100000;game.popMax=100;const b=shopList().find(b=>b.id==='turret'),cells=[];
for(let z=12;z<=22;z++)for(let x=10;x<=14;x++)if(footprintPlaceable({x,z},b)&&terrainSurface.natural.wholeCells[idx(x,z)]===1)cells.push({x,z});
const north=cells.filter(c=>c.z<18),south=cells.filter(c=>c.z>18);
const upperSquare=[];for(let z=14;z<=16;z++)for(let x=11;x<=13;x++)upperSquare.push({x,z});
const squareBuildable=upperSquare.every(c=>footprintPlaceable(c,b));
for(const anchor of [...upperSquare,...south]){selectBuild(shopList().indexOf(b));ghostCell=anchor;ghost.visible=true;placeBuildingImmediately();}selectBuild(null);
const p=cellCenter(10,17);camFocus.set(p.x,1,p.z);camHeight=43;updateCamera(0);renderer.render(scene,camera);
return {north,south,squareBuildable,towers:builtTurrets.length,canyon:[11,12,13].map(x=>grid[18][x]),empty:T_EMPTY};
});fs.mkdirSync('output/expanded-6.33.0',{recursive:true});await page.screenshot({path:'output/expanded-6.33.0/highlands.png'});fs.writeFileSync('output/expanded-6.33.0/result.json',JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));
assert.ok(result.squareBuildable&&result.south.length>=6);assert.equal(result.towers,9+result.south.length);assert.ok(result.canyon.every(t=>t===result.empty));assert.deepEqual(errors,[]);
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

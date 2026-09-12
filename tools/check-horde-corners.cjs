const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const server=await createStaticServer(path.resolve(__dirname,'..'));
 const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
 await page.waitForFunction(()=>typeof state!=='undefined'&&state===7);
 const result=await page.evaluate(()=>{
   state=STATE.PAUSED;game.wave=1;game.gateHp=1e9;spawnEnemy('normal',false);
   const e=enemies.at(-1);e.spawnFlash=0;if(e.beam)scene.remove(e.beam);e.beam=null;
   const trapped=[];computeFlowField();
   for(let z=3;z<GRID-3;z++)for(let x=3;x<GRID-3;x++){
     const c=cellCenter(x,z);if(!isNaturalBoundaryCell(x,z))continue;
     for(const [dx,dz] of [[-.42,-.42],[.42,-.42],[-.42,.42],[.42,.42]]){
       const px=c.x+dx*TILE,pz=c.z+dz*TILE,h=heightAt(px,pz),r=enemyNavigationRadius(e);
       if(blockedForTank(px,pz,r,h))continue;
       e.group.position.set(px,h,pz);const f=flowDirFor(e);
       if(!Number.isFinite(flowField.distanceAt(x,z))&&!f.atGate)trapped.push({x:px,z:pz,flow:f.hereD});
     }
   }
   const traces=[];
   for(const start of trapped){
     e.group.position.set(start.x,heightAt(start.x,start.z),start.z);e.thinkTimer=0;e._cell=null;e.flowStallTime=0;e.bestFlowDistance=Infinity;
     for(let i=0;i<600;i++){_animFrame++;updateEnemies(1/60);}
     const p=e.group.position,cell=cellOf(p.x,p.z);
     traces.push({...start,end:{x:p.x,z:p.z},distance:Math.hypot(p.x-start.x,p.z-start.z),reachable:Number.isFinite(flowField.distanceAt(cell.x,cell.z)),progress:start.flow-flowField.distanceAt(cell.x,cell.z),solid:blockedForTank(p.x,p.z,enemyNavigationRadius(e),heightAt(p.x,p.z))});
   }
   return {trapped:trapped.length,traces,canyon:ACTIVE_MODE.canyon};
 });
 const out='output/command-polish';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/corners-${process.argv.includes('--before')?'before':'after'}.json`,JSON.stringify({...result,errors},null,2));
 console.log(JSON.stringify({...result,errors}));
 if(!process.argv.includes('--before')&&(errors.length||result.traces.some(t=>t.solid||!t.reachable)))process.exitCode=1;
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

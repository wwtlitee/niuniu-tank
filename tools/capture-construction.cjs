const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=await createStaticServer(root);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11','--enable-unsafe-swiftshader']});
 const output=path.join(root,'output/construction-6.31.0');fs.mkdirSync(output,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7,null,{timeout:90000});
  await page.evaluate(()=>{
   state=STATE.PAUSED;document.querySelectorAll('#pause,#prep,#menu,#questPanel,#toast,#announce').forEach(e=>e.classList.add('hidden'));game.gold=10000;
   const b=shopList().find(b=>b.id==='house'),home=constructionHome(),candidates=[];
   for(let z=1;z<GRID-1;z++)for(let x=1;x<GRID-1;x++)if(footprintPlaceable({x,z},b))candidates.push({x,z});
   candidates.sort((a,b)=>Math.hypot(a.x-home.x,a.z-home.z)-Math.hypot(b.x-home.x,b.z-home.z));
   const anchor=candidates.find(c=>Math.hypot(c.x-home.x,c.z-home.z)>3&&ConstructionSystem.findPath(home,constructionGoals(c,b),GRID,GRID,constructionPassable,flowCanStep));
   if(!queueConstruction(b,anchor))throw Error('无法派工');
   const job=constructionJobs[0];window.captureJob=job;
   camFocus.copy(job.site.position);camHeight=26;updateCamera(0);wc3Select('construction',job);renderer.render(scene,camera);
  });
  await page.screenshot({path:path.join(output,'01-outbound.png')});
  await page.evaluate(()=>{for(let i=0;i<2000&&captureJob.phase==='outbound';i++)updateConstruction(.05);updateConstruction(6);wc3RenderSel();renderer.render(scene,camera);});
  await page.screenshot({path:path.join(output,'02-building.png')});
  await page.evaluate(()=>{for(let i=0;i<1000&&captureJob.phase==='building';i++)updateConstruction(.05);wc3RenderSel();renderer.render(scene,camera);});
  await page.screenshot({path:path.join(output,'03-complete.png')});
  await page.evaluate(()=>{
   for(let i=0;i<2000&&constructionJobs.length;i++)updateConstruction(.05);
   const point=cellCenter(9,17);camFocus.set(point.x,0,point.z);camHeight=44;mouse.x=innerWidth/2;mouse.y=innerHeight/2;updateCamera(0);wc3ClearSel();updateDockRes();renderer.render(scene,camera);
  });
  await page.screenshot({path:path.join(output,'04-base-and-entry.png')});
  await page.evaluate(()=>{
   for(let i=0;i<1000;i++){spawnEnemy('normal',false);const e=enemies.at(-1),point={x:8+(i%40)*1.05,z:-20+Math.floor(i/40)*1.05};e.group.position.set(point.x,heightAt(point.x,point.z),point.z);e.spawnFlash=0;}
   const point=cellCenter(16,13);camFocus.set(point.x,0,point.z);camHeight=45;updateCamera(0);updateCrowdLod();renderer.render(scene,camera);
  });
  await page.screenshot({path:path.join(output,'05-thousand-crowd.png')});
  const result=await page.evaluate(()=>{const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {state:JSON.parse(render_game_to_text()),contextLost:gl.isContextLost(),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,calls:renderer.info.render.calls};});
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({result,errors},null,2));console.log(JSON.stringify({contextLost:result.contextLost,gpu:result.gpu,calls:result.calls,errors}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

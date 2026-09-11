const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const server=await createStaticServer(path.resolve(__dirname,'..'));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7,null,{timeout:120000});
  const result=await page.evaluate(()=>{
   state=STATE.PAUSED;game.gold=100000;game.popMax=1000;
   const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
   const gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';
   const measure=(fn,n=24)=>{const times=[];for(let i=0;i<n;i++){const t=performance.now();fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {p50:times[Math.floor(n*.5)],p95:times[Math.floor(n*.95)]};};
   const results=[];
   for(const count of [100,500,1000]){
    while(enemies.length<count){spawnEnemy('normal',false);const e=enemies.at(-1);e.spawnFlash=0;if(e.beam){scene.remove(e.beam);e.beam=null;}}
    updateCrowdLod();
    const render=measure(()=>renderer.render(scene,camera),4);
    const legacyBounds=measure(()=>{for(let j=0;j<12;j++)for(const e of enemies){const visual=e.animationRoot||e.visualRoot;visual.updateWorldMatrix(true,true);new THREE.Box3().setFromObject(visual).expandByScalar(.06).containsPoint(new THREE.Vector3(0,12,0));}},3);
    const bulletsTime=measure(()=>{for(let j=0;j<12;j++)bulletCollide({thruWall:true,owner:'player',pos:new THREE.Vector3(0,12,0),mesh:{position:new THREE.Vector3(0,12,0)},hitSet:new Set(),dmg:1,vel:new THREE.Vector3(),source:'test'},new THREE.Vector3(0,12,0));},4);
    results.push({count,render,legacyBounds,bulletsTime,lod:crowdLodMesh?.count||0,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
   }
   for(let i=0;i<enemies.length;i++){
    const e=enemies[i],point=cellCenter(14+i%8,8+Math.floor(i/8)%8);
    e.group.position.set(point.x,heightAt(point.x,point.z),point.z);e.giant=false;e.boss=false;
   }
   const focus=cellCenter(17,11);camFocus.set(focus.x,0,focus.z);camHeight=45;updateCamera(0);updateCrowdLod();
   for(let i=0;i<10;i++)renderer.render(scene,camera);
   const nearRender=measure(()=>{renderer.render(scene,camera);gl.finish();},20);
   const nearLogic=measure(()=>{_animFrame++;updateEnemies(1/60);},20);
   const near={render:nearRender,logic:nearLogic,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,lod:crowdLodMesh.count};
   return {gpu,contextLost:gl.isContextLost(),results,near};
  });
  fs.mkdirSync(path.resolve(__dirname,'../output'),{recursive:true});
  fs.writeFileSync(path.resolve(__dirname,`../output/profile-${process.argv[2]||'baseline'}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


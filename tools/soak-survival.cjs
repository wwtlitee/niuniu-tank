const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=await createStaticServer(root);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7,null,{timeout:90000});
  const result=await page.evaluate(()=>{
   state=STATE.PAUSED;const rows=[];const view=cellCenter(12,3);camFocus.set(view.x,0,view.z);camHeight=80;updateCamera(0);
   for(let cycle=0;cycle<5;cycle++){
    for(let i=0;i<240;i++)spawnEnemy('normal',false);
    updateCrowdLod();renderer.render(scene,camera);
    for(const e of [...enemies])killEnemy(e,false);
    for(let frame=0;frame<150;frame++){_animFrame++;updateEnemies(1/60);updateParticles(1/60);updateCorpseDecals(1/60);}
    updateCrowdLod();renderer.render(scene,camera);
    rows.push({cycle,enemies:enemies.length,corpses:corpseDecals.length,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
   }
   return {rows,contextLost:renderer.getContext().isContextLost()};
  });
  fs.writeFileSync(path.join(root,`output/soak-v${require('../package.json').version}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  if(result.contextLost||result.rows.some(r=>r.enemies!==0||r.corpses>180))throw Error('资源清理或残骸上限失败');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),server=await createStaticServer(root);
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=d3d11','--enable-unsafe-swiftshader']});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);await page.waitForFunction(()=>typeof state!=='undefined'&&state===7);
  const construction=await page.evaluate(()=>{
   state=STATE.PAUSED;game.gold=100000;game.popMax=1000;
   const gl=renderer.getContext(),b=shopList().find(b=>b.id==='beacon'),samples=[];
   for(let n=0;n<4;n++){
    let anchor;
    for(let z=4;z<GRID-4&&!anchor;z++)for(let x=3;x<GRID-4;x++)if(footprintPlaceable({x,z},b)&&queueConstruction(b,{x,z})){anchor={x,z};break;}
    if(!anchor)throw new Error('No reachable medical tower site');
    const job=constructionJobs.at(-1);job.phase='building';job.elapsed=job.duration*.68;updateConstruction(.01);
    renderer.render(scene,camera);gl.finish();
    const lightCount=()=>scene.children.filter(child=>child.isPointLight).length,beforeLights=lightCount();
    job.elapsed=job.duration-.001;const t=performance.now();updateConstruction(.01);const logic=performance.now()-t;
    const before=performance.now();renderer.render(scene,camera);gl.finish();const draw=performance.now()-before;
    samples.push({logic,draw,beforeLights,afterLights:lightCount(),complete:job.phase==='returning',registered:!!ownedStructureAtCell(idx(anchor.x,anchor.z)),stage:job.stage});
   }
   return {samples,contextLost:gl.isContextLost()};
  });
  console.log(JSON.stringify(construction));
  for(const sample of construction.samples){assert.ok(sample.complete&&sample.registered);assert.equal(sample.beforeLights,sample.afterLights,'Finishing a tower must not change shader light count');}
  assert.equal(construction.contextLost,false);await page.close();
  const classic=await browser.newPage();classic.on('pageerror',e=>errors.push(e.message));
  await classic.goto(`http://127.0.0.1:${server.address().port}/classic.html?autotest=1`);await classic.waitForFunction(()=>window.classicReady);
  const batches=await classic.evaluate(()=>{
   const parent=new THREE.Group(),field=ClassicFeedback.createObstacleField(parent,4),matrix=new THREE.Matrix4();
   const at=(x)=>new THREE.Vector3(x,0,0),sample=()=>{const xs=[];for(const child of parent.children)for(let i=0;i<child.count;i++){child.getMatrixAt(i,matrix);xs.push(Math.round(matrix.elements[12]/20)*20);}return [...new Set(xs)].sort((a,b)=>a-b);};
   field.set(0,false,0,at(0));field.set(1,false,1,at(20));field.set(2,false,2,at(40));
   const before=sample();field.clear(1);const after=sample();field.set(0,true,1,at(0));const replace=sample();field.clear(2);field.clear(0);const empty=sample();
   for(const child of parent.children)child.dispose();
   return {before,after,replace,empty,count:field.count};
  });
  assert.deepEqual(batches,{before:[0,20,40],after:[0,40],replace:[0,40],empty:[],count:0});
  assert.deepEqual(errors,[]);const report={construction,batches,errors};
  fs.mkdirSync(path.join(root,'output/av-polish'),{recursive:true});fs.writeFileSync(path.join(root,'output/av-polish/construction-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');
let server, browser, page;
const errors = [], output = path.resolve(__dirname, '../output/crowd-lod');
before(async () => {
  fs.mkdirSync(output, { recursive: true });
  server = await createStaticServer(path.resolve(__dirname, '..'));
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if(e.type()==='error')errors.push(e.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
  await page.evaluate(() => {
    state=STATE.PAUSED;updateCamera=()=>{};
    for(const enemy of enemies.splice(0)){scene.remove(enemy.group);releaseEnemyResources(enemy);}
    clearCrowdLod();for(let i=0;i<60;i++)updateCrowdLod();
    const c=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row);
    window.lodFocus=new THREE.Vector3(c.x+14,0,c.z);
    for(let i=0;i<800;i++){
      if(spawnEnemy('normal',false)===false)throw new Error('spawn denied during isolated LOD test');
      const e=enemies.at(-1),x=c.x+3+(i%40)*.6,z=c.z+(Math.floor(i/40)-10)*.6;
      e.group.position.set(x,heightAt(x,z),z);e.group.rotation.y=-Math.PI/2;
      e.spawnFlash=0;e.currentAnim=_ANIM_WALK;e.poseTime=i*.11;
    }
    document.getElementById('hud').style.display='none';
  });
});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});

async function captureZoom(distance,name){
  await page.evaluate(distance=>{
    camera.position.copy(lodFocus).add(new THREE.Vector3(0,distance*.8,distance*.6));camera.lookAt(lodFocus);camera.updateMatrixWorld(true);
    for(let i=0;i<60;i++)updateCrowdLod();
  },distance);
  await page.waitForTimeout(220);
  const result=await page.evaluate(()=>{updateCrowdLod();renderer.render(scene,camera);return getCrowdLodStats();});
  await page.screenshot({path:path.join(output,name+'.png')});
  return result;
}

test('800实体从远景逐级切换到清晰模型，实际面数下降且无数量丢失',async()=>{
  const results=[];
  for(const [distance,name] of [[190,'far'],[96,'eighth'],[58,'quarter'],[22,'detail']])results.push(await captureZoom(distance,name));
  fs.writeFileSync(path.join(output,'zoom-stats.json'),JSON.stringify(results,null,2));
  for(const result of results){assert.equal(result.logicalCount,800);assert.equal(result.renderedUniqueCount,800);assert.equal(result.tierCounts.reduce((a,b)=>a+b),800);assert.equal(result.pendingBuilds,0);}
  assert.ok(results[0].tierCounts[3]>700);
  assert.ok(results[1].tierCounts[2]>500);
  assert.ok(results[2].tierCounts[1]>500);
  assert.ok(results[3].tierCounts[0]>500);
  assert.ok(results[3].detailCount<=192,'full geometry beyond the live skeleton budget must be instanced');
  assert.ok(results[0].triangles<results[3].triangles*.1);
  const colorFaults=await page.evaluate(()=>{
    const failures=[];
    for(const [id,batch] of crowdLodBatches)for(const tier of batch.tiers)if(tier)for(const pose of tier.poses)if(pose)for(const mesh of pose.meshes){
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      if(!materials.some(material=>material.vertexColors))continue;
      const color=mesh.geometry.attributes.color;
      if(!color||color.count!==mesh.geometry.attributes.position.count||!color.array.some(value=>value>0))failures.push(id);
    }
    return failures;
  });
  assert.deepEqual(colorFaults,[],'all poses and LOD tiers retain the actual model vertex colors');
  assert.deepEqual(errors,[]);
});

test('屏幕精度依据CSS像素，DPR和resize后按视口正确更新',async()=>{
  const result=await page.evaluate(()=>{
    camera.position.copy(lodFocus).add(new THREE.Vector3(0,76.8,57.6));camera.lookAt(lodFocus);
    const sample=ratio=>{renderer.setPixelRatio(ratio);renderer.setSize(1440,900);for(const e of enemies)e._crowdLodState=null;updateCrowdLod();return getCrowdLodStats().tierCounts;};
    const small=sample(.75),large=sample(1.5);renderer.setPixelRatio(1);return{small,large};
  });
  assert.deepEqual(result.small,result.large);
  await page.setViewportSize({width:960,height:600});
  const resized=await captureZoom(96,'resize');
  assert.equal(resized.logicalCount,800);assert.equal(resized.renderedUniqueCount,800);
  assert.ok(resized.tierCounts[3]>0);
  assert.deepEqual(errors,[]);
});

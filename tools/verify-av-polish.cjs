"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createStaticServer}=require('./asset-runtime-catalog.cjs');
const baseline=process.argv.includes('--baseline'),label=baseline?'before':'after';
async function main(){
  const root=path.resolve(__dirname,'..'),out=path.join(root,'output','av-polish');fs.mkdirSync(out,{recursive:true});
  const server=await createStaticServer(root),browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=d3d11','--enable-unsafe-swiftshader']});
  const errors=[],report={};
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/classic.html?autotest=1`);await page.waitForFunction(()=>window.classicReady);
    await page.evaluate(()=>ClassicGame.reset(0));
    await page.keyboard.press('Escape');
    report.classic=await page.evaluate(()=>{
      const measure=(fn,n=40)=>{const times=[];for(let i=0;i<n;i++){const t=performance.now();fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {p50:times[n>>1],p95:times[Math.floor(n*.95)],max:times[n-1]};};
      const start=ClassicGame.renderNow(),idle=measure(()=>ClassicGame.renderNow());
      for(let i=0;i<12;i++)ClassicGame.testEffect('destroy');ClassicGame.testEffectAdvance(.12);
      const effects=ClassicGame.renderNow(),busy=measure(()=>ClassicGame.renderNow());
      const t=performance.now();ClassicAudio.renderCue('music');const synthMs=performance.now()-t;
      document.getElementById('classicPause').classList.add('hidden');
      return {start,idle,effects,busy,synthMs,inspect:ClassicGame.inspect()};
    });
    await page.screenshot({path:path.join(out,`classic-${label}.png`)});
    await page.close();
    const survival=await browser.newPage({viewport:{width:1440,height:900}});survival.on('pageerror',e=>errors.push(e.message));
    await survival.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival`);await survival.waitForSelector('#difficultySelect:not(.hidden)',{timeout:60000});
    await survival.locator('[data-difficulty="normal"]').click();await survival.waitForFunction(()=>state===7);
    await survival.keyboard.press('Escape');
    report.survival=await survival.evaluate(()=>{
      const measure=(fn,n=40)=>{const times=[];for(let i=0;i<n;i++){const t=performance.now();fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {p50:times[n>>1],p95:times[Math.floor(n*.95)],max:times[n-1]};};
      state=STATE.PAUSED;game.wave=10;game.enemiesToSpawn=0;game.gateHp=game.gateMaxHp=1e7;
      const C=ACTIVE_MODE.canyon;
      for(let i=0;i<120;i++){spawnEnemy('normal',i===0,10);const e=enemies.at(-1);e.spawnFlash=0;const p=cellCenter(C.x1+2+i%8,C.z0-2+Math.floor(i/8)%8);e.group.position.set(p.x,heightAt(p.x,p.z),p.z);}
      const focus=cellCenter(C.x0,C.z0);camFocus.set(focus.x,0,focus.z);camHeight=58;updateCamera(0);updateCrowdLod();
      let boundsCalls=0;const original=THREE.Box3.prototype.setFromObject;THREE.Box3.prototype.setFromObject=function(...args){boundsCalls++;return original.apply(this,args);};
      _animFrame++;
      const aims=measure(()=>{for(let i=0;i<10;i++)for(const e of enemies)enemyAimPoint(e);},15);
      THREE.Box3.prototype.setFromObject=original;
      const logic=measure(()=>{_animFrame++;updateEnemies(1/60);},80);
      const particlePoint=new THREE.Vector3(focus.x,1.8,focus.z);spawnParticles(particlePoint,0xffb752,160,9,1.2);updateParticles(.08);
      document.getElementById('waveInfo').firstChild.textContent='WAVE 10 · 终焉尸潮';updateDockRes();drawMinimap(true);updateEnemyLeftUI();
      for(const id of ['pause','announce','questPanel','prepBar'])document.getElementById(id)?.classList.add('hidden');
      renderer.render(scene,camera);const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',boundsCalls,aims,logic,render:renderer.info.render.calls,contextLost:gl.isContextLost(),audio:BGMSystem.getStatus(),groanDeadline:soundscape.nextGroan,settings:Settings.getVideo()};
    });
    await survival.screenshot({path:path.join(out,`survival-${label}.png`)});
    report.errors=errors;fs.writeFileSync(path.join(out,`${label}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
    if(!baseline){assert.deepEqual(errors,[]);assert.ok(report.survival.boundsCalls<=120,'aim bounds should be shared within a frame');assert.ok(report.classic.effects.calls-report.classic.start.calls<=4,'effects must be batched');assert.ok(report.classic.start.calls<180,'classic static scenery must be batched');}
    await survival.close();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

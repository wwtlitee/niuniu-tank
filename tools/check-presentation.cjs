'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
async function main(){
 const root=path.resolve(__dirname,'..'),server=await createStaticServer(root),browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=d3d11','--enable-unsafe-swiftshader']});
 const errors=[],report={};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1.5});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival`);await page.waitForSelector('#difficultySelect:not(.hidden)',{timeout:60000});
  await page.locator('[data-difficulty="normal"]').click();await page.waitForFunction(()=>state===7);await page.waitForFunction(()=>BGMSystem.getStatus().usingSample);
  await page.evaluate(()=>AC.suspend());await page.mouse.click(720,360);await page.waitForFunction(()=>AC.state==='running',null,{timeout:4000});
  report.settings=await page.evaluate(()=>{
   Settings.setVideo({quality:'low',shadows:false,particles:false,shake:false});
   spawnParticles(new THREE.Vector3(),0xffaa44,25,6,1);camShake=1;updateCamera(0);
   const off={dpr:renderer.getPixelRatio(),shadows:renderer.shadowMap.enabled,particles:particles.length,shake:camShake};
   Settings.setVideo({...Settings.VIDEO_DEFAULTS,quality:'high'});
   return {off,on:{dpr:renderer.getPixelRatio(),shadows:renderer.shadowMap.enabled}};
  });
  assert.deepEqual(report.settings.off,{dpr:.85,shadows:false,particles:0,shake:0});assert.equal(report.settings.on.dpr,1.5);assert.equal(report.settings.on.shadows,true);
  await page.evaluate(()=>{questActive=false;game.wave=10;game.enemiesToSpawn=0;state=STATE.PLAYING;spawnEnemy('normal',true,10);});
  await page.waitForFunction(()=>BGMSystem.getStatus().slot==='boss');
  await page.evaluate(()=>{state=STATE.BUILD;});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>BGMSystem.getStatus().slot),'boss');
  await page.evaluate(()=>setPause(true));await page.waitForFunction(()=>!BGMSystem.getStatus().wantPlaying);await page.evaluate(()=>setPause(false));await page.waitForFunction(()=>BGMSystem.getStatus().slot==='boss');
  await page.evaluate(()=>BGMSystem.setManualTrack('prep'));await page.waitForFunction(()=>BGMSystem.getStatus().trackId==='prep');await page.evaluate(()=>BGMSystem.setManualTrack(null));await page.waitForFunction(()=>BGMSystem.getStatus().trackId==='boss');
  report.audio=await page.evaluate(async()=>{
   const analyser=AC.createAnalyser();analyser.fftSize=2048;AudioMixer.bus('master').connect(analyser);const data=new Float32Array(analyser.fftSize),peaks=[];
   const destination=AC.createMediaStreamDestination();AudioMixer.bus('master').connect(destination);const chunks=[],recorder=new MediaRecorder(destination.stream);
   recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>{recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));});recorder.start();
   for(let i=0;i<30;i++){if(i%8===0)playSpecialWeapon(['laser','incendiary','grenade'][Math.floor(i/8)%3]);await new Promise(r=>setTimeout(r,100));analyser.getFloatTimeDomainData(data);peaks.push(Math.max(...data.map(Math.abs)));}
   recorder.stop();const recording=await done;AudioMixer.bus('master').disconnect(destination);AudioMixer.bus('master').disconnect(analyser);
   const current=BGMSystem.getStatus();AudioMixer.setMuted(true);await new Promise(r=>setTimeout(r,450));const check=AC.createAnalyser();AudioMixer.bus('master').connect(check);await new Promise(r=>setTimeout(r,100));check.getFloatTimeDomainData(data);const mutedPeak=Math.max(...data.map(Math.abs));AudioMixer.bus('master').disconnect(check);AudioMixer.setMuted(false);
   return {current,peak:Math.max(...peaks),nonSilent:peaks.filter(p=>p>.001).length,mutedPeak,groanDeadline:soundscape.nextGroan,recording};
  });
  fs.writeFileSync(path.join(root,'output/av-polish/battle-audio.webm'),Buffer.from(report.audio.recording));delete report.audio.recording;
  assert.ok(report.audio.peak>.005&&report.audio.peak<.99);assert.ok(report.audio.mutedPeak<.001);assert.ok(Number.isFinite(report.audio.groanDeadline));
  await page.waitForTimeout(250);assert.ok((await page.locator('#waveProgressText').innerText()).includes('10'));
  await page.close();
  for(const dpr of [.75,1.5]){
   const p=await browser.newPage({viewport:{width:1000,height:720},deviceScaleFactor:dpr});p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}/classic.html?autotest=1`);await p.waitForFunction(()=>window.classicReady);
   for(const size of [{width:1000,height:720},{width:780,height:640}]){await p.setViewportSize(size);await p.waitForFunction(size=>ClassicGame.canvas.getBoundingClientRect().width===size.width&&ClassicGame.canvas.getBoundingClientRect().height===size.height,size);const geometry=await p.evaluate(()=>{const c=ClassicGame.canvas,r=c.getBoundingClientRect();return {css:[r.width,r.height],drawing:[c.width,c.height],projection:ClassicGame.camera.aspect};});assert.deepEqual(geometry.css,[size.width,size.height]);assert.deepEqual(geometry.drawing,[Math.floor(size.width*dpr),Math.floor(size.height*dpr)]);assert.equal(geometry.projection,size.width/size.height);}
   await p.close();
  }
  const noAudio=await browser.newPage();noAudio.on('pageerror',e=>errors.push(e.message));await noAudio.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});await noAudio.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival`);await noAudio.waitForSelector('#difficultySelect:not(.hidden)',{timeout:60000});await noAudio.locator('[data-difficulty="normal"]').click();await noAudio.waitForFunction(()=>state===7);await noAudio.close();
  report.errors=errors;assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'output/av-polish/presentation-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

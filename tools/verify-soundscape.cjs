const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{const server=await createStaticServer(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=d3d11']});
try{const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7);
const result=await page.evaluate(async()=>{
 state=STATE.PAUSED;const offline=new OfflineAudioContext(1,44100*7,44100);AC=offline;audio=()=>offline;combatBus=null;combatLimiter=null;combatSfxLast.clear();
 let tones=0;const original=offline.createOscillator.bind(offline);offline.createOscillator=()=>{tones++;return original();};
 for(let i=0;i<100;i++)sfx.levelup();const upgradeTones=tones;
 playSpecialWeapon('laser');playSpecialWeapon('incendiary');playSpecialWeapon('grenade');playZombieGroan();playGateBash();
 soundTone(offline,combatOutput(offline),55,55,3,.035,1,'triangle');
 const rendered=await offline.startRendering(),samples=rendered.getChannelData(0);let peak=0,sum=0;for(const v of samples){peak=Math.max(peak,Math.abs(v));sum+=v*v;}
 const wav=Array.from(samples);
 AC=null;combatBus=null;combatLimiter=null;audio=()=>null;
 const p=cellCenter(16,12);spawnEnemy('normal',false);const normal=enemies.at(-1);spawnEnemy('normal',true);const boss=enemies.at(-1);
 normal.group.position.set(p.x-5,0,p.z);boss.group.position.set(p.x+3,0,p.z);normal.group.visible=boss.group.visible=true;normal.spawnFlash=boss.spawnFlash=0;
 const beacon=makeBeaconVisual();beacon.position.set(p.x-9,0,p.z);scene.add(beacon);
 camFocus.set(p.x,2,p.z);camHeight=35;updateCamera(0);updateVisionSystem(1);renderer.render(scene,camera);
 const height=o=>new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y;
 return {upgradeTones,peak,rms:Math.sqrt(sum/samples.length),normalHeight:height(normal.visualRoot||normal.group),bossHeight:height(boss.visualRoot||boss.group),wav};
});
fs.mkdirSync('output/soundscape-6.31.0',{recursive:true});await page.screenshot({path:'output/soundscape-6.31.0/boss-beacon.png'});
const samples=result.wav;delete result.wav;const buf=Buffer.alloc(44+samples.length*2);buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(44100,24);buf.writeUInt32LE(88200,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(samples.length*2,40);samples.forEach((v,i)=>buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));fs.writeFileSync('output/soundscape-6.31.0/mix.wav',buf);
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival`);await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7);
await page.mouse.click(1000,400);await page.waitForTimeout(1100);const playing=await page.evaluate(()=>({beat:soundscape.beat,context:AC?.state}));
await page.evaluate(()=>{state=STATE.PAUSED;});await page.waitForTimeout(100);const pausedBeat=await page.evaluate(()=>soundscape.beat);await page.waitForTimeout(1000);const pauseStable=await page.evaluate(b=>soundscape.beat===b,pausedBeat);
await page.evaluate(()=>{state=STATE.PREP;});await page.waitForTimeout(1000);const resumed=await page.evaluate(b=>soundscape.beat>b,pausedBeat);await page.keyboard.press('m');const muted=await page.evaluate(()=>soundscape.muted);
Object.assign(result,{playing,pauseStable,resumed,muted,errors});fs.writeFileSync('output/soundscape-6.31.0/result.json',JSON.stringify(result,null,2));console.log(result);assert.equal(result.upgradeTones,4);assert.ok(result.peak<.95&&result.rms>.001);assert.ok(result.bossHeight>result.normalHeight*4);assert.ok(playing.beat>0&&playing.context==='running'&&pauseStable&&resumed&&muted);assert.deepEqual(errors,[]);
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

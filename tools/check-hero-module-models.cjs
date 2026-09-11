const {chromium}=require('playwright'),fs=require('fs');
const out='output/hero-assembly-v8.2.0/modules';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});try{const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1');await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7,null,{timeout:120000});
console.log(await page.evaluate(async()=>{
 state=STATE.PAUSED;game.gold=100000;game.popMax=100;questActive=false;hideQuestPanel();
 const spec=shopList().find(b=>b.id==='heroHub');for(let z=9;z<GRID-4&&!heroHubs.length;z++)for(let x=3;x<GRID-4;x++){if(!footprintPlaceable({x,z},spec))continue;selectBuild(shopList().indexOf(spec));ghostCell={x,z};ghost.visible=true;placeBuildingImmediately(null,null,null,true);selectBuild(null);if(heroHubs.length)break;}
 const h=heroHub();if(!h||!findHeroDeployment(h))throw Error('No connected workshop exit');
 for(const el of document.body.children)if(!el.contains(renderer.domElement)&&el.tagName!=='SCRIPT'&&el.tagName!=='STYLE')el.style.display='none';
 renderer.setPixelRatio(1);renderer.setSize(1920,816,false);renderer.domElement.style.cssText='position:fixed;left:0;top:132px;width:1920px;height:816px';document.body.style.background='#000';camera.aspect=1920/816;camera.fov=42;camera.updateProjectionMatrix();
 hemi.intensity=.7;ambient.intensity=.28;scene.fog=new THREE.Fog(0x18232b,22,65);scene.background=new THREE.Color(0x18232b);const key=new THREE.DirectionalLight(0xffe2b0,.9);key.position.set(h.group.position.x+8,18,h.group.position.z+10);scene.add(key);const rim=new THREE.DirectionalLight(0x74bcff,.75);rim.position.set(h.group.position.x-9,8,h.group.position.z-5);scene.add(rim);
 mapGroup.traverse(o=>{if(o.userData.assetName&&!['natural-plateau','survival-path','ash-plateau-foundation','canyon-wall'].includes(o.userData.assetName))o.visible=false;});
 if(wc3SelectionRing)wc3SelectionRing.visible=false;camFocus.copy(h.group.position);
 AC=new AudioContext();AudioMixer.init(AC);BGMSystem.bind(AC);SurvivalSoundBank.bind(AC,AudioMixer.bus('sfx'));await AC.resume();await SurvivalSoundBank.preload();AudioMixer.setVolume('master',.65);AudioMixer.setVolume('music',.28);AudioMixer.setVolume('sfx',.8);BGMBridge.tick=()=>{};updateSurvivalSoundscape=()=>{};SurvivalSoundBank.setPaused(false);
 BGMSystem.setContext({mode:'survival',sub:'battle',intensity:.4});BGMSystem.resume();
 window.film={active:false,time:0,last:0,started:false,lastStage:-1,exited:false,events:[]};
 updateCamera=function(){const f=window.film,now=performance.now();if(f.active){const dt=Math.min(.05,(now-f.last)/1000);f.last=now;f.time+=dt;if(f.time>=1.5&&!f.started){produceHero();f.started=true;f.events.push({at:f.time,event:'production-start'});}if(f.started){updateHeroProduction(dt);const stage=Math.min(4,Math.floor((1-heroArchive().remaining/25)*5));if(stage!==f.lastStage&&heroArchive().status==='producing'&&heroArchive().remaining>0){f.lastStage=stage;SurvivalSoundBank.play('build');f.events.push({at:f.time,event:'assembly-stage',stage});}if(heroTank&&!f.exited){f.exited=true;SurvivalSoundBank.play('complete');f.events.push({at:f.time,event:'exit-complete',position:heroTank.group.position.toArray()});}}}
 const t=f.time,smooth=v=>v*v*(3-2*v),lerp=(a,b,p)=>a+(b-a)*smooth(p);let angle,radius,height,offset=new THREE.Vector3(0,1.9,0),fov=42;
 if(t<5){const p=t/5;angle=lerp(-.8,-.48,p);radius=lerp(19,14,p);height=lerp(11,8,p);}
 else if(t<10){const p=(t-5)/5;angle=lerp(-1.05,-.65,p);radius=lerp(9.5,8.6,p);height=3.8;offset.set(-.6,1.2,.7);fov=44;}
 else if(t<15){const p=(t-10)/5;angle=lerp(.9,.52,p);radius=9.3;height=lerp(6.8,5.6,p);offset.set(.7,1.7,0);fov=46;}
 else if(t<20){const p=(t-15)/5;angle=lerp(-.55,-.12,p);radius=lerp(12,10,p);height=6.8;offset.set(0,2,0);}
 else if(t<24){const p=(t-20)/4;angle=lerp(.3,.7,p);radius=9;height=8;offset.set(0,2.3,0);fov=45;}
 else if(t<27){const p=(t-24)/3;angle=lerp(-.3,.22,p);radius=12.5;height=5;offset.set(0,2,0);}
 else{const p=Math.min(1,(t-27)/10);angle=lerp(.55,1.05,p);radius=lerp(17,12,p);height=lerp(9,5,p);}
 const target=h.group.position.clone().add(offset);
 if(t>=27){const pos=heroTank?.group.position||(heroArchive().deployment?new THREE.Vector3(heroArchive().deployment.x,h.group.position.y,heroArchive().deployment.z):h.group.position);target.copy(pos).add(new THREE.Vector3(0,1.7,0));}
 camera.fov=fov;camera.updateProjectionMatrix();camera.position.set(target.x+Math.sin(angle)*radius,target.y+height,target.z+Math.cos(angle)*radius);camera.lookAt(target);
 };updateCamera();renderer.render(scene,camera);
 return {hub:h.group.position.toArray(),route:findHeroDeployment(h),video:[1920,816],music:BGMSystem.getStatus()};
}));


const result=await page.evaluate(()=>{produceHero();for(let i=0;i<2100;i++)updateHeroProduction(1/60);const all=Object.fromEntries(Object.keys(HeroSystem.SKILLS).map(k=>[k,1]));rebuildHeroModules(heroTank,all);const root=heroTank.group.getObjectByName('英雄武器模组');if(root.userData.moduleBounds?.length!==9)throw Error('Missing nine independently specified module envelopes');let triangles=0,meshes=0;root.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;meshes++;}});if(triangles>25000||meshes>20)throw Error('Hero module budget exceeded');const origin=heroTank.group.position;camera.position.copy(origin).add(new THREE.Vector3(7,6,9));camera.lookAt(origin.clone().add(new THREE.Vector3(0,1.8,0)));updateCamera=()=>{};renderer.render(scene,camera);return {version:GAME_VERSION,modules:root.userData.moduleBounds,triangles,meshes};});
await page.screenshot({path:out+'/complete.png'});if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(out+'/result.json',JSON.stringify({...result,errors},null,2));console.log(result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

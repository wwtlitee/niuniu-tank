const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createStaticServer}=require('./asset-runtime-catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'output','hero-system');fs.mkdirSync(out,{recursive:true});
 const server=await createStaticServer(root),browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=d3d11']});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
  await page.waitForFunction(()=>typeof assetsReady==='function'&&assetsReady()&&state===7,null,{timeout:120000});
  const results=await page.evaluate(()=>{
   const checks=[];const check=(name,ok)=>{checks.push({name,ok:!!ok});if(!ok)throw Error(name);};
   state=STATE.PAUSED;game.gold=1e9;game.popMax=100;
   function place(id){const b=shopList().find(b=>b.id===id);for(let z=1;z<GRID-3;z++)for(let x=1;x<GRID-3;x++){if(!footprintPlaceable({x,z},b))continue;if(id==='heroHub'){if(!queueConstruction(b,{x,z}))continue;check('duplicate hub construction rejected',!queueConstruction(b,{x:x+3,z}));for(let i=0;i<3600&&!heroHubs.length;i++)updateConstruction(1/30);check('worker completes hub',heroHubs.length===1);return {x,z};}selectBuild(shopList().indexOf(b));ghostCell={x,z};ghost.visible=true;placeBuildingImmediately(null,null,null,true);selectBuild(null);return {x,z};}throw Error('no site '+id);}
   const h=place('heroHub');check('hub has full plateau footprint',heroHubs[0].footprintCells.every(c=>terrainSurface.natural.wholeCells[c]===1));check('hub can be built and targeted',heroHubs.length===1&&ownedStructureAtCell(idx(h.x,h.z)).kind==='heroHub');
   place('research');check('select hero doctrine',chooseDoctrine('hero'));check('doctrine cannot change',!chooseDoctrine('tank'));
   check('produce unique hero',produceHero());check('duplicate queue rejected',!produceHero());
   for(let i=0;i<3600&&!heroTank;i++)updateHeroProduction(1/60);
   check('hero exits hub',heroTank?.type==='hero');check('plain hero has no learned weapons',Object.values(heroArchive().skills).every(l=>l===0));
   const u=heroTank;clearFriendlyRoute(u);u.command='stop';for(const k of Object.keys(HeroSystem.SKILLS))check('learn '+k,buyHeroSkill(k));
   for(let i=0;i<18000&&heroArchive().orders.length;i++)updateHeroProduction(1/60);check('delivery finished',heroArchive().orders.length===0);
   check('all modules present',u.group.getObjectByName('英雄武器模组').children.filter(m=>m.isMesh).length<=4 && u._moduleSignature==='1,1,1,1,1,1,1,1,1');
   check('offensive research leaves health unchanged',buyDoctrineTech('cannon')&&u.maxHp===480);
   spawnEnemy('normal',false);const e=enemies.at(-1);e.spawnFlash=0;e.hp=.01;e.group.position.copy(u.group.position).add(new THREE.Vector3(0,0,5));
   const kills=heroArchive().kills;heroHit(e,10);heroHit(e,10);check('kill credit once',heroArchive().kills===kills+1);
   const beforeHp=u.hp;u.hp=u.maxHp*.5;const ally=createFriendlyUnit('heavy',{x:u.group.position.x+3,z:u.group.position.z});ally.hp=100;
   u.attackTarget=null;updateHeroCombat(u,1);check('automatic healing',ally.hp>100);check('no self healing',u.hp===u.maxHp*.5);
   for(let i=0;i<8;i++){spawnEnemy('normal',false);const foe=enemies.at(-1);foe.spawnFlash=0;foe.hp=foe.maxHp=1e5;foe.group.position.copy(u.group.position).add(new THREE.Vector3(i*.4,0,-6));}
   u.attackTarget=enemies.at(-1);const healed=ally.hp;
   for(let i=0;i<360;i++){updateHeroEffects(1/60);updateHeroCombat(u,1/60);updateParticles(1/60);}
   check('combat stops healing',ally.hp===healed);check('all six weapons trigger',Object.keys(u.heroCooldowns).length===6);check('projectiles bounded',heroProjectiles.length<=24);u.hp=beforeHp;
   const before=heroArchive().skills.rail;saveSurvivalSnapshot();const saved=readSurvivalSnapshot();check('archive saved',saved.hero.skills.rail===before&&saved.structures.heroHubs.length===1);
   check('restore',restoreSurvivalSnapshot(saved));state=STATE.PAUSED;check('restored unique hero',friendlyUnits.filter(u=>u.type==='hero').length===1&&heroHubs.length===1&&heroArchive().kills===kills+1);
   heroTank.hp=0;updateFriendlyUnits(1/60);check('death retains skills',heroArchive().status==='dead'&&heroArchive().skills.rail===before);check('revive can queue',produceHero());
   const hub=heroHubs[0];destroyOwnedStructure(hub,heroHubs,'heroHub');const remaining=heroArchive().remaining;updateHeroProduction(10);check('destroyed hub pauses revive',heroArchive().remaining===remaining);place('heroHub');
   for(let i=0;i<3600&&!heroTank;i++)updateHeroProduction(1/60);check('revive after rebuild',!!heroTank);
   game.endless=true;game.spawnPlans=[];for(let w=11;w<100;w++)enqueueSurvivalWave(w,true);check('bounded pending',game.enemiesToSpawn<=1000&&game.spawnPlans.length<=1000);check('overflow raises pressure',game.overflowPressure>0);
   check('factory rejects hero and repair',!queueFactoryUnit({},'hero')&&!queueFactoryUnit({},'repair'));
   for(const route of ['tower','tank','hero']){game.doctrine=route;for(const [id,spec] of Object.entries(HeroSystem.TECH)){if(spec.route!==route)continue;for(let lv=doctrineLevel(id);lv<5;lv++)check('technology '+id+' '+(lv+1),buyDoctrineTech(id));check('technology cap '+id,!buyDoctrineTech(id));}}
   check('hero health is not a research sink',heroTank.maxHp===480);check('hero range research',Math.abs(heroTank.range-8.8*TILE)<.0001);check('wrong doctrine rejected',!buyDoctrineTech('munitions'));
   const baseline=saveSurvivalSnapshot()&&readSurvivalSnapshot();baseline.version='6.43.0';baseline.structures.units.push({type:'repair',repairBranch:'speed',x:0,z:0,hp:50});const goldBefore=baseline.game.gold;
   check('legacy medical migration',restoreSurvivalSnapshot(baseline));state=STATE.PAUSED;check('legacy paid refund',game.gold===goldBefore+235);check('legacy leaves one hero',friendlyUnits.filter(u=>u.type==='hero').length===1&&!friendlyUnits.some(u=>u.type==='repair'));
   const p=heroTank.group.position;camFocus.set(p.x,0,p.z);camHeight=35;updateCamera(1);wc3Select('heroHub',heroHubs[0]);check('hero skill hotkeys unique',new Set(commandItemsForSelection().map(c=>c.hot)).size===10);updateDockRes();wc3RenderSel();renderCmdCard();renderer.render(scene,camera);
   return {checks,hero:heroArchive(),commands:commandItemsForSelection().map(c=>({key:c.hot,name:c.name})),drawCalls:renderer.info.render.calls};
  });
  await page.evaluate(()=>{state=STATE.PREP;game.wave=0;game.prepTime=10000;});
  await page.keyboard.press('4');assert.equal(await page.evaluate(()=>HeroSystem.orderedLevel(heroArchive(),'rail')),2,'keyboard queues exactly one rail level');
  await page.locator('#cmdcard .cmdBtn').filter({hasText:'冰冻射线'}).click();assert.equal(await page.evaluate(()=>HeroSystem.orderedLevel(heroArchive(),'frost')),2,'pointer queues frost level');
  await page.screenshot({path:path.join(out,'hero-hub.png')});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});



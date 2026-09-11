const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),path=require('path');
const {chromium}=require('playwright'),{createStaticServer}=require('../tools/asset-runtime-catalog.cjs');
let server,browser,page;
before(async()=>{server=await createStaticServer(path.resolve(__dirname,'..'));browser=await chromium.launch({headless:true});page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);await page.waitForFunction(()=>typeof state!=='undefined'&&state===7);});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
test('灯塔满额后医疗车仍独立补充，但12辆旧车也只能增加36生命每秒',async()=>{
 const r=await page.evaluate(()=>{resetGame();state=STATE.PAUSED;game.gold=10000;
 const x=ACTIVE_MODE.canyon.x0+1,z=ACTIVE_MODE.canyon.z0,ci=idx(x,z),c=cellCenter(x,z),max=wallMaxHp(50);
 grid[z][x]=T_STEEL;wallMeta.set(ci,{lv:50,hp:max*.1});steelHP.set(ci,max*.1);tileMeshes[ci]=buildWallTile(mapGroup,x,z,50);
 for(let i=0;i<3;i++){const group=new THREE.Group();group.position.set(c.x-6,PH,c.z);scene.add(group);visionBeacons.push({group,level:5,hp:100,maxHp:100});}
 for(let i=0;i<12;i++){const u=createFriendlyUnit('repair',{x:c.x-8,z:c.z});u.repairTarget=wallRepairTarget({x,z});u.command='repair';}
 const before=steelHP.get(ci);for(let i=0;i<60;i++){updateMedicalBeacons(1/60);updateFriendlyUnits(1/60);}return{healed:steelHP.get(ci)-before,max,gold:game.gold};});
 assert.ok(Math.abs(r.healed-r.max*.1-36)<.001,JSON.stringify(r));assert.ok(Math.abs(r.gold-9996.4)<.001);
});
test('旧医疗生产入口即使解锁条件满足也不能再生产',async()=>{const r=await page.evaluate(()=>{resetGame();state=STATE.PAUSED;game.gold=20000;game.popMax=100;game.wave=10;game.tech.tank=10;game.tech.defense=10;const g=new THREE.Group();scene.add(g);const f={group:g,hp:100,queue:[]};heavyFactories.push(f);researchInstitutes.push({group:g,hp:100});return [queueFactoryUnit(f,'repair'),toggleFactoryAuto(f,'repair'),queueFactoryUnit(f,'hero'),f.queue.length,game.gold];});assert.deepEqual(r,[false,false,false,0,20000]);});
test('两辆医疗车不能互相超限回血，单车每秒最多恢复目标10%生命',async()=>{
 const r=await page.evaluate(()=>{resetGame();state=STATE.PAUSED;game.gold=10000;const c=cellCenter(6,15),a=createFriendlyUnit('repair',c),b=createFriendlyUnit('repair',{x:c.x+4,z:c.z});a.hp=b.hp=20;
 for(let i=0;i<60;i++)updateFriendlyUnits(1/60);return{a:a.hp,b:b.hp,max:a.maxHp,gold:game.gold};});
 assert.ok(Math.abs(r.a-20-r.max*.1)<.001&&Math.abs(r.b-20-r.max*.1)<.001,JSON.stringify(r));
});

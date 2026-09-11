const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const SurvivalSystemForTests = require("../js/survival-system.js");

const ROOT = path.resolve(__dirname, "..");

test('入口石阶禁建且前方三格可建墙，旧墙迁移保留等级耐久',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  const r=ACTIVE_MODE.ramp,C=ACTIVE_MODE.canyon,wall=shopList().find(b=>b.id==='wall'),p=cellCenter(r.col,r.row);
  const forbidden=!footprintPlaceable({x:r.col,z:r.row},wall),allowed=[];
  for(let x=C.x0;x<=C.x1;x++)allowed.push(footprintPlaceable({x,z:C.z0},wall));
  const steps=[];for(let i=0;i<12;i++){const x=p.x-TILE*.5+(i+.5)*TILE/12;steps.push([heightAt(x-.05,p.z),heightAt(x+.05,p.z)]);}
  saveSurvivalSnapshot();const snapshot=readSurvivalSnapshot();snapshot.structures.walls=[{x:r.col,z:r.row,lv:3,hp:123}];restoreSurvivalSnapshot(snapshot);
  const moved=wallMeta.get(idx(C.x0,C.z0));
  return {forbidden,allowed,steps,level:moved?.lv,hp:steelHP.get(idx(C.x0,C.z0)),moved:!!moved&&moved.lv===3&&steelHP.get(idx(C.x0,C.z0))===123,ramp:grid[r.row][r.col]===T_RAMP};
 });await page.close();assert.ok(result.forbidden);assert.deepEqual(result.allowed,[true,true,true]);assert.ok(result.moved&&result.ramp,JSON.stringify(result));assert.equal(new Set(result.steps.map(s=>s[0])).size,12);for(const [a,b] of result.steps)assert.equal(a,b);
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
};

let server;
let browser;
let baseUrl;

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(ROOT, relative);
    if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code || "error");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openSurvival() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${baseUrl}/?mode=survival&autotest=1`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => typeof assetsReady === "function" && assetsReady(), null, { timeout: 60_000 });
  await page.waitForFunction(() => typeof state !== "undefined" && state === 7, null, { timeout: 40_000 });
  return page;
}

test('施工从零段开始且工地可受损摧毁，不退款并释放占地',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;game.gold=10000;const b=shopList().find(b=>b.id==='house');let anchor;
  for(let z=12;z<20&&!anchor;z++)for(let x=3;x<10;x++)if(footprintPlaceable({x,z},b)){anchor={x,z};break;}
  queueConstruction(b,anchor);const job=constructionJobs.at(-1),gold=game.gold;job.phase='building';updateConstruction(.01);
  const stage=job.stage,ci=idx(anchor.x,anchor.z);const hit=damageOwnedStructureAtCell(ci,100000);
  return {stage,hit,removed:!job.site,returning:job.phase==='returning',released:!structCells.has(ci),noRefund:game.gold===gold};
 });await page.close();assert.deepEqual(result,{stage:0,hit:true,removed:true,returning:true,released:true,noRefund:true});
});

test('僵尸从基地四面接近都能持续造成伤害而非停在流场终点',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;game.wave=1;const losses=[];
  for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){
   for(const e of enemies){e.alive=false;scene.remove(e.group);}enemies.length=0;
   game.gateHp=600;spawnEnemy('normal',false);const e=enemies.at(-1);e.spawnFlash=0;if(e.beam){scene.remove(e.beam);e.beam=null;}
   e.group.position.copy(baseGroup.position).add(new THREE.Vector3(dx*6,0,dz*6));
   for(let i=0;i<600;i++){_animFrame++;updateEnemies(1/60);}
   losses.push(600-game.gateHp);
  }return losses;
 });await page.close();assert.ok(result.every(v=>v>0),JSON.stringify(result));
});

test('施工受损完工保留生命比例，真实僵尸会攻击挡路工地',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;game.gold=10000;const b=shopList().find(b=>b.id==='goldmine'),anchor={x:ACTIVE_MODE.ramp.col+1,z:ACTIVE_MODE.ramp.row};
  queueConstruction(b,anchor);const job=constructionJobs.at(-1);job.phase='building';
  spawnEnemy('normal',false);const enemy=enemies.at(-1);enemy.spawnFlash=0;if(enemy.beam){scene.remove(enemy.beam);enemy.beam=null;}
  const p=cellCenter(anchor.x+1,anchor.z);enemy.group.position.set(p.x,heightAt(p.x,p.z),p.z);
  for(let i=0;i<420;i++){_animFrame++;updateEnemies(1/60);}
  const damaged=job.hp<job.maxHp&&job.hp>0,ratio=job.hp/job.maxHp;
  job.elapsed=job.duration-.001;updateConstruction(.01);
  const mine=goldMines.find(m=>m.x===anchor.x&&m.z===anchor.z);
  return {damaged,completed:!!mine,ratio,mineRatio:mine?.hp/mine?.maxHp};
 });await page.close();assert.ok(result.damaged&&result.completed,JSON.stringify(result));assert.ok(Math.abs(result.ratio-result.mineRatio)<1e-6);
});

test('敌方弹丸命中施工占地会扣除工地耐久',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;game.gold=10000;const b=shopList().find(b=>b.id==='goldmine'),anchor={x:ACTIVE_MODE.ramp.col+1,z:ACTIVE_MODE.ramp.row};queueConstruction(b,anchor);
  const job=constructionJobs.at(-1),before=job.hp,p=job.site.position.clone().add(new THREE.Vector3(0,.5,0));
  const hit=bulletCollide({owner:'enemy',thruWall:true,dmg:12,hitSet:new Set()},p);return {hit,loss:before-job.hp};
 });await page.close();assert.deepEqual(result,{hit:true,loss:12});
});
test('施工订单经过出门、施工、完工、返回；扣费一次且可取消、存档',async()=>{
 const page=await openSurvival();
 const result=await page.evaluate(()=>{
  state=STATE.PAUSED;game.gold=10000;
  const initial=builtHouses.length,pop=game.popMax;
  const b=shopList().find(b=>b.id==='house');
  let anchor;
  for(let z=1;z<GRID-1&&!anchor;z++)for(let x=1;x<GRID-1&&!anchor;x++)if(footprintPlaceable({x,z},b)&&ConstructionSystem.findPath(constructionHome(),constructionGoals({x,z},b),GRID,GRID,constructionPassable,flowCanStep))anchor={x,z};
  selectBuild(shopList().indexOf(b));ghostCell=anchor;ghost.visible=true;tryPlace();
  const immediate=builtHouses.length;
  if(typeof constructionJobs==='undefined')return {immediate,initial,missing:true};
  const job=constructionJobs[0],gold=game.gold;
  if(!job)throw new Error(JSON.stringify({anchor,home:constructionHome(),base:baseGroup.position,goals:constructionGoals(anchor,b),toast:document.body.innerText.slice(-800),sel:buildSel}));
  const start=job.worker.position.clone();
  updateConstruction(.1);
  const moved=start.distanceTo(job.worker.position)>0;
  saveSurvivalSnapshot();const saved=readSurvivalSnapshot();
  const savedElapsed=job.elapsed;
  resetGame();restoreSurvivalSnapshot(saved);state=STATE.PAUSED;
  const restored=constructionJobs.length===1&&constructionJobs[0].elapsed===savedElapsed;
  let reached=false;
  for(let i=0;i<2000&&constructionJobs.length;i++){updateConstruction(.05);if(constructionJobs[0]?.phase==='building')reached=true;}
  const finished=builtHouses.length===initial+1&&constructionJobs.length===0;
  const facade=!!builtHouses.at(-1)?.group.getObjectByName('工业建筑入口');
  const chargedOnce=game.gold===gold,population=game.popMax===pop+6;
  let next;
  for(let z=1;z<GRID-1&&!next;z++)for(let x=1;x<GRID-1&&!next;x++)if(footprintPlaceable({x,z},b)&&ConstructionSystem.findPath(constructionHome(),constructionGoals({x,z},b),GRID,GRID,constructionPassable,flowCanStep))next={x,z};
  selectBuild(shopList().indexOf(b));ghostCell=next;ghost.visible=true;tryPlace();
  const pending=constructionJobs.find(j=>j.phase!=='returning');
  const cancelled=!!pending&&attemptDestroy(next.x,next.z);
  return {initial,immediate,moved,restored,reached,finished,facade,chargedOnce,population,cancelled,refund:game.gold===gold};
 });
 await page.close();
 assert.equal(result.immediate,result.initial,'下令不能立即生成可用建筑');
 for(const key of ['moved','restored','reached','finished','facade','chargedOnce','population','cancelled','refund'])assert.equal(result[key],true,key);
});
test('远离炮弹的敌人不逐弹重算模型包围盒',async()=>{
 const page=await openSurvival();
 const result=await page.evaluate(()=>{
  state=STATE.PAUSED;spawnEnemy('normal',false);const e=enemies.at(-1);e.spawnFlash=0;
  const p=e.group.position.clone();p.x+=50;p.y+=20;
  let calls=0;const original=THREE.Box3.prototype.setFromObject;
  THREE.Box3.prototype.setFromObject=function(...args){calls++;return original.apply(this,args);};
  try{for(let i=0;i<10;i++)bulletCollide({owner:'player',thruWall:true,hitSet:new Set()},p);}finally{THREE.Box3.prototype.setFromObject=original;}
  return calls;
 });
 await page.close();assert.equal(result,0);
});
test('密集尸潮远景使用连续可见的批量模型',async()=>{
 const page=await openSurvival();
 const result=await page.evaluate(()=>{
  state=STATE.PAUSED;
  for(let i=0;i<130;i++){spawnEnemy('normal',false);const e=enemies.at(-1);e.spawnFlash=0;e.group.position.set(70+i%10,0,-70);}
  if(typeof updateCrowdLod!=='function')return {missing:true};
  updateCrowdLod();const count=crowdLodMesh.count;
  updateCrowdLod();return {count,stable:crowdLodMesh.count===count,instances:crowdLodMesh.children.some(m=>m.isInstancedMesh)};
 });
 await page.close();assert.ok(result.count>0);assert.equal(result.stable,true);assert.equal(result.instances,true);
});
test('死亡角色释放独占骨骼和材质，保留共享模型几何',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;spawnEnemy('normal',false);const e=enemies.at(-1);
  if(typeof releaseEnemyResources!=='function')return null;
  let skeleton=0,geometry=0;const skeletons=new Set();
  e.group.traverse(o=>{if(o.skeleton&&!skeletons.has(o.skeleton)){skeletons.add(o.skeleton);o.skeleton.dispose=()=>skeleton++;}if(o.geometry)o.geometry.addEventListener('dispose',()=>geometry++);});
  releaseEnemyResources(e);return {skeleton,expected:skeletons.size,geometry};
 });await page.close();assert.ok(result);assert.equal(result.skeleton,result.expected);assert.equal(result.geometry,0);
});
test('镜头正对密集尸潮时详细角色也有预算，全部敌人仍有模型',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;for(let i=0;i<130;i++){spawnEnemy('normal',false);const e=enemies.at(-1);e.group.position.set(camFocus.x+i*.01,0,camFocus.z);e.giant=false;e.boss=false;}
  updateCrowdLod();return {detailed:enemies.filter(e=>e.group.visible).length,lod:crowdLodMesh.count,total:enemies.length};
 });await page.close();assert.ok(result.detailed<=80);assert.equal(result.detailed+result.lod,result.total);
});
test('重复指令不重复扣费，在建研究院占用唯一名额，暂停不计时',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;game.gold=10000;const b=shopList().find(b=>b.id==='research'),home=constructionHome();
  const candidates=[];for(let z=1;z<GRID-1;z++)for(let x=1;x<GRID-1;x++)if(footprintPlaceable({x,z},b))candidates.push({x,z});
  const anchor=candidates.find(c=>ConstructionSystem.findPath(home,constructionGoals(c,b),GRID,GRID,constructionPassable,flowCanStep));
  const queued=queueConstruction(b,anchor),gold=game.gold,pop=game.popUsed;
  const repeat=queueConstruction(b,anchor),next=candidates.find(c=>footprintPlaceable(c,b));
  const extra=next?queueConstruction(b,next):false,job=constructionJobs[0];
  const p=job.worker.position.clone();stepGame(5);
  const paused=job.worker.position.equals(p)&&job.elapsed===0;
  cancelConstruction(job);const refunded=game.gold===10000;cancelConstruction(job);
  return {queued,repeat,extra,paused,refunded,doubleRefund:game.gold===10000,count:researchInstitutes.length,popReleased:game.popUsed<=pop};
 });await page.close();assert.equal(result.queued,true);assert.equal(result.repeat,false);assert.equal(result.extra,false);assert.equal(result.count,0);
 for(const k of ['paused','refunded','doubleRefund','popReleased'])assert.equal(result[k],true,k);
});
test('低细节敌人不再逐帧遍历隐藏骨骼层级',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;for(let i=0;i<130;i++){spawnEnemy('normal',false);enemies.at(-1).group.position.set(80,0,-80);}
  updateCrowdLod();const e=enemies.find(e=>e._crowdLod);let calls=0;
  const node=e.group.children[0],original=node.updateMatrixWorld;node.updateMatrixWorld=function(...args){calls++;return original.apply(this,args);};
  scene.updateMatrixWorld(true);return calls;
 });await page.close();assert.equal(result,0);
});
test('基地移到高台中后部并保留坡口布防空间，旧存档布局保留',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  const current={...ACTIVE_MODE.base},clearance=ACTIVE_MODE.ramp.col-(current.col+2);
  saveSurvivalSnapshot();const snapshot=readSurvivalSnapshot();
  delete snapshot.baseLayout;snapshot.version='6.29.35';restoreSurvivalSnapshot(snapshot);
  const legacy=ACTIVE_MODE.base.col===3&&ACTIVE_MODE.base.row===13;
  resetGame();const fresh=ACTIVE_MODE.base.col===6&&ACTIVE_MODE.base.row===15;
  return {current,clearance,legacy,fresh};
 });await page.close();assert.equal(result.current.col,6);assert.equal(result.current.row,15);assert.ok(result.clearance>=2);assert.equal(result.legacy,true);assert.equal(result.fresh,true);
});
test('120秒开启下一波保留残敌与待刷队列，暂停不计时',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PLAYING;startWave(1);spawnEnemy('normal',false);const old=enemies.at(-1),hp=old.hp;
  if(typeof updateWaveDeadline!=='function')return null;
  updateWaveDeadline(119);const before=game.wave;state=STATE.PAUSED;updateWaveDeadline(10);const paused=game.wave;
  state=STATE.PLAYING;updateWaveDeadline(1);
  return {before,paused,wave:game.wave,retained:enemies.includes(old)&&old.alive&&old.hp===hp,queued:game.enemiesToSpawn,expected:SurvivalSystem.waveProfile(1).count+SurvivalSystem.waveProfile(2).count};
 });await page.close();assert.ok(result);assert.equal(result.before,1);assert.equal(result.paused,1);assert.equal(result.wave,2);assert.equal(result.retained,true);assert.equal(result.queued,result.expected);
});
test('路灯退出入口通道，两侧至少留出两格距离',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>({count:fixedVisionLights.length,clear:fixedVisionLights.every(l=>Math.abs(cellOf(l.x,l.z).z-ACTIVE_MODE.canyon.z0)>=2)}));
 await page.close();assert.equal(result.count,2);assert.equal(result.clear,true);
});
test('在场上限保留待刷量，腾出空间按原波次刷出且不覆盖旧Boss',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PLAYING;startWave(5);
  const originalSpawn=spawnEnemy,original=enemies.splice(0),calls=[];
  spawnEnemy=(type,boss,wave)=>{calls.push({type,boss,wave});enemies.push({alive:true,boss});};
  try{
    for(let i=0;i<SURVIVAL_ACTIVE_LIMIT;i++)enemies.push({alive:true,boss:i===0});
    const queued=game.enemiesToSpawn;spawnPendingSurvivalEnemies(1);const capped=calls.length===0&&game.enemiesToSpawn===queued;
    startWave(6,true);enemies.pop();spawnPendingSurvivalEnemies(1);
    return {capped,count:enemies.length,call:calls[0],pending:game.enemiesToSpawn,expected:queued+SurvivalSystem.waveProfile(6).count-1};
  }finally{spawnEnemy=originalSpawn;enemies.splice(0);enemies.push(...original);}
 });await page.close();assert.equal(result.capped,true);assert.equal(result.count,600);assert.equal(result.call.wave,5);assert.equal(result.call.boss,true);assert.equal(result.pending,result.expected);
});

test('清波优先于超时，短暂休息后开波，最终波等待清场通关',async()=>{
 const page=await openSurvival();
 const result=await page.evaluate(()=>{
  state=STATE.PLAYING;startWave(1);game.enemiesToSpawn=0;game.spawnPlans=[];game.waveElapsed=119.99;
  updateWaveDeadline(.02);
  const emptyDidNotForce=game.wave===1;
  updateEnemies(0);const clearing=!!game.waveTransition;
  updateWaveTransition(1);const waiting=game.wave===1&&$("enemyLeft").textContent.includes("下一波 1s");
  updateWaveTransition(.81);const next=game.wave===2&&game.waveElapsed===0;
  game.enemiesToSpawn=0;game.spawnPlans=[];startWave(10);game.waveElapsed=119.99;
  updateWaveDeadline(.02);const finalDidNotOverflow=game.wave===10;
  game.enemiesToSpawn=0;game.spawnPlans=[];updateEnemies(0);updateWaveTransition(1.81);
  return {emptyDidNotForce,clearing,waiting,next,finalDidNotOverflow,settled:state===STATE.SETTLE,correctVictoryTitle:$("settle").querySelector("h2").textContent.includes("第 10 波")};
 });await page.close();for(const [key,value] of Object.entries(result))assert.equal(value,true,key);
});

test('施工朝向地基，金矿耐久留在面板而不浮在建筑上',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;game.gold=10000;const b=shopList().find(b=>b.id==='goldmine');
  let job;for(let z=12;z<22&&!job;z++)for(let x=2;x<10&&!job;x++)if(queueConstruction(b,{x,z}))job=constructionJobs.at(-1);
  for(let i=0;i<1000&&job.phase!=='building';i++)updateConstruction(.05);
  job.worker.rotation.y=2.5;updateConstruction(.05);
  const c=footprintCenter(job.anchor,b),p=job.worker.position;
  const facing=Math.cos(job.worker.rotation.y-Math.atan2(c.x-p.x,c.z-p.z))>.999;
  for(let i=0;i<1000&&job.phase==='building';i++)updateConstruction(.05);
  const mine=goldMines.at(-1);mine.hp-=10;updateDamageHealthBars();
  return {facing,hidden:!mine.bar.visible,hasDurability:mine.hp>0&&mine.maxHp>mine.hp};
 });await page.close();assert.deepEqual(result,{facing:true,hidden:true,hasDurability:true});
});
test('每30秒压力增强旧怪，暂停不计时且读档不重置',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  if(typeof updateSurvivalPressure!=='function')return {missing:true};
  state=STATE.PLAYING;startWave(1);spawnEnemy('normal',false);const e=enemies.at(-1);
  const initial=enemyWallDamage(e);game.survivalElapsed=29.9;updateSurvivalPressure(.1);
  const raised=enemyWallDamage(e)/initial;state=STATE.PAUSED;updateSurvivalPressure(60);const paused=game.survivalElapsed;
  saveSurvivalSnapshot();const saved=readSurvivalSnapshot();resetGame();restoreSurvivalSnapshot(saved);
  return {raised,paused,restored:game.survivalElapsed};
 });await page.close();assert.ok(Math.abs(result.raised-1.05)<1e-8);assert.ok(Math.abs(result.paused-30)<1e-8);assert.ok(Math.abs(result.restored-30)<1e-8);
});
test('时间压力同时提升新旧敌人的生命，保留受伤比例且不复活尸体',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PLAYING;game.survivalElapsed=0;spawnEnemy('normal',false);
  const old=enemies.at(-1),initial=old.maxHp;old.hp=initial*.4;
  spawnEnemy('normal',false);const dead=enemies.at(-1);dead.alive=false;dead.hp=0;const deadMax=dead.maxHp;
  updateSurvivalPressure(30);const first={max:old.maxHp/initial,hp:old.hp/old.maxHp};
  updateSurvivalPressure(60);const third=old.maxHp/initial;
  spawnEnemy('normal',false);const fresh=enemies.at(-1);
  const factor=fresh._pressureHealthMultiplier;
  updateSurvivalPressure(.1);const stable=old.maxHp/initial;
  state=STATE.PAUSED;updateSurvivalPressure(30);
  return {first,third,stable,factor,full:fresh.hp===fresh.maxHp,dead:dead.hp===0&&dead.maxHp===deadMax,paused:old.maxHp/initial};
 });await page.close();
 assert.ok(Math.abs(result.first.max-1.05)<1e-9);assert.ok(Math.abs(result.first.hp-.4)<1e-9);
 for(const key of ['third','stable','factor','paused'])assert.ok(Math.abs(result[key]-1.15)<1e-9,key);
 assert.equal(result.full,true);assert.equal(result.dead,true);
});

test('远景保持原僵尸几何与材质，没有方块替身',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;for(let i=0;i<130;i++)spawnEnemy('normal',false);updateCrowdLod();
  const meshes=[];crowdLodMesh.traverse(o=>{if(o.isInstancedMesh)meshes.push(o);});
  return {original:meshes.length>0&&meshes.every(m=>m.geometry.userData.sourceZombieMesh),textured:meshes.some(m=>m.material.map),nonbox:meshes.every(m=>m.geometry.attributes.position.count>100)};
 });await page.close();assert.deepEqual(result,{original:true,textured:true,nonbox:true});
});

test('建筑分三段施工且新主楼使用独立自建模型',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  if(typeof makeBuildingModel!=='function')return {missing:true};
  state=STATE.PAUSED;game.gold=10000;
  const b=shopList().find(b=>b.id==='research');let job;
  for(let z=12;z<20&&!job;z++)for(let x=2;x<9&&!job;x++)if(queueConstruction(b,{x,z}))job=constructionJobs.at(-1);
  for(let i=0;i<1000&&job.phase!=='building';i++)updateConstruction(.05);
  updateConstruction(.01);const one=job.stage,firstHeight=job.clipPlane.constant;
  job.elapsed=job.duration*.4;updateConstruction(.01);const two=job.stage,secondHeight=job.clipPlane.constant;
  job.elapsed=job.duration*.8;updateConstruction(.01);const three=job.stage;
  return {one,two,three,rising:secondHeight>firstHeight,inactive:researchInstitutes.length===0,model:job.preview.userData.handcraftedKind,base:baseGroup.getObjectByName('自建主基地')!==undefined};
 });await page.close();assert.deepEqual(result,{one:0,two:1,three:2,rising:true,inactive:true,model:'research',base:true});
});
test('激光贯穿共线目标，三种坦克使用不同弹道，维修光环互斥升级',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  if(typeof fireLaserTurret!=='function')return {missing:true};
  state=STATE.PAUSED;game.gold=1000;game.survivalElapsed=0;
  const origin=new THREE.Vector3(0,1,0),target=new THREE.Vector3(0,1,20);
  const victims=[];for(const p of [[0,8],[0,14],[4,10]]){spawnEnemy('normal',false);const e=enemies.at(-1);e.group.position.set(p[0],0,p[1]);e.spawnFlash=0;e.hp=e.maxHp=100;e.armor=0;victims.push(e);}
  const aim=enemyAimPoint(victims[0]);origin.y=aim.y;target.y=aim.y;
  fireLaserTurret({dmg:2},origin,target,25,2);
  const laser=victims.map(e=>e.hp<100);
  const attacks={};for(const type of ['light','medium','heavy']){
   const unit=createFriendlyUnit(type,new THREE.Vector3(0,0,0));const n=bullets.length;fireFriendlyWeapon(unit,victims[0]);
   attacks[type]=bullets.slice(n).map(b=>({type:b.projectileType,burn:b.burnDamage||0,gravity:b.gravity||0,blast:b.blast}));
  }
  const repair=createFriendlyUnit('repair',new THREE.Vector3(0,0,0));const upgraded=upgradeRepairUnit(repair,'speed');
  const gold=game.gold,denied=!upgradeRepairUnit(repair,'attack')&&game.gold===gold;
  updateSupportAuras();const speed=friendlyUnits.find(u=>u.type==='light')._speedAura;
  return {laser,attacks,upgraded,denied,speed};
 });await page.close();assert.deepEqual(result.laser,[true,true,false]);assert.equal(result.attacks.light.length,5);
 assert.ok(result.attacks.medium[0].burn>0);assert.ok(result.attacks.heavy[0].gravity>0);assert.ok(result.attacks.heavy[0].blast>0);
 assert.equal(result.upgraded,true);assert.equal(result.denied,true);assert.equal(result.speed,1.2);
});

test('灼烧限时不叠伤害，旧光环不叠加且旧医疗车读档后退役',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;game.gold=1000;spawnEnemy('normal',false);const e=enemies.at(-1);e.hp=e.maxHp=100;e.armor=0;e.spawnFlash=0;
  applyIncendiaryHit(e,{burnDamage:2,burnDuration:4});applyIncendiaryHit(e,{burnDamage:1,burnDuration:4});
  updateIncendiaryDamage(2);const middle=e.hp;updateIncendiaryDamage(10);const end=e.hp;updateIncendiaryDamage(1);
  const unit=createFriendlyUnit('light',{x:0,z:0});
  for(const branch of ['speed','speed','attack']){const repair=createFriendlyUnit('repair',{x:0,z:0});upgradeRepairUnit(repair,branch);}
  updateSupportAuras();const aura=[unit._speedAura,unit._damageAura];
  for(const repair of friendlyUnits.filter(u=>u.type==='repair'))repair.group.position.x=30;
  updateSupportAuras();const left=[unit._speedAura,unit._damageAura];
  saveSurvivalSnapshot();const snapshot=readSurvivalSnapshot();resetGame();restoreSurvivalSnapshot(snapshot);
  return {middle,end,expired:e.hp===end,aura,left,branches:friendlyUnits.filter(u=>u.type==='repair').map(u=>u.repairBranch).sort()};
 });await page.close();assert.equal(result.middle,96);assert.equal(result.end,92);assert.equal(result.expired,true);
 assert.deepEqual(result.aura,[1.2,1.25]);assert.deepEqual(result.left,[1,1]);assert.deepEqual(result.branches,[]);
});

test('自然高坡高程连续且保留唯一坡口，全部新模型顶点有效',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  const mesh=mapGroup.getObjectByName('自然侵蚀高坡'),r=ACTIVE_MODE.ramp,p=cellCenter(r.col,r.row);
  let finite=true;for(const kind of ['base','research','factory']){const g=makeBuildingModel(kind);g.updateMatrixWorld(true);g.traverse(o=>{if(o.isMesh)finite=finite&&Array.from(o.geometry.attributes.position.array).every(Number.isFinite);});disposeTransientObject3D(g);}
  const heights=terrainSurface.natural.elevations,intermediate=heights.filter(h=>h>.01&&h<PH-.01).length;
  return {exists:!!mesh,indexed:!!mesh.geometry.index,intermediate,finite,ramp:heightAt(p.x,p.z),expected:PH/2};
 });await page.close();assert.equal(result.exists,true);assert.equal(result.indexed,true);assert.ok(result.intermediate>100);assert.equal(result.finite,true);assert.ok(Math.abs(result.ramp-result.expected)<.001);
});

test('自然轮廓独立于方格，缺角整格与跨高差足迹拒绝建造',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  const data=terrainSurface.natural;if(!data.contour||!data.wholeCells)return {missing:true};
  const build=shopList().find(b=>b.id==='house'),partial=[],flat=[];
  for(let z=1;z<GRID-1;z++)for(let x=1;x<GRID-1;x++){
   const mask=data.wholeCells[idx(x,z)];if(mask<0)partial.push({x,z});else if(mask===1&&grid[z][x]===T_PLATEAU)flat.push({x,z});
  }
  const edgeBlocked=partial.length>0&&partial.every(c=>!footprintPlaceable(c,build));
  const interior=flat.some(c=>footprintPlaceable(c,build));
  const diagonal=data.contour.filter((p,i)=>{const q=data.contour[(i+1)%data.contour.length];return Math.abs(q.x-p.x)>.01&&Math.abs(q.z-p.z)>.01;}).length;
  return {edgeBlocked,interior,diagonal,total:data.contour.length,partial:partial.length};
 });await page.close();assert.equal(result.edgeBlocked,true);assert.equal(result.interior,true);assert.ok(result.diagonal>result.total*.85);assert.ok(result.partial>20);
});

test('高台迷雾和血雾贴合地形而不悬空越界，旧存档建筑保留地基',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;ensureVisionFog();ensureBloodMist();
  const overlays=[...visionFogSurfaces,...bloodMistSurfaces].filter(s=>s.mesh.userData.conformsTerrain);
  const baseGeometry=naturalSurfaceGeometry(0),basePositions=baseGeometry.attributes.position;let maximum=0;for(const overlay of overlays){const g=overlay.mesh.geometry,p=g.attributes.position;for(const i of new Set(g.index.array))maximum=Math.max(maximum,Math.abs(p.getY(i)-basePositions.getY(i)));}
  saveSurvivalSnapshot();const snapshot=readSurvivalSnapshot();delete snapshot.naturalTerrainVersion;
  snapshot.structures.mines=[{x:2,z:12,level:1,hp:50,maxHp:100}];restoreSurvivalSnapshot(snapshot);
  const mine=goldMines.find(m=>m.x===2&&m.z===12);const mask=terrainSurface.natural.wholeCells[idx(2,12)];
  return {overlays:overlays.length,maximum,preserved:!!mine,whole:mask===1};
 });await page.close();assert.equal(result.overlays,2);assert.ok(result.maximum<.14);assert.equal(result.preserved,true,JSON.stringify(result));assert.equal(result.whole,true,JSON.stringify(result));
});

test('炮台放大到原始模型四分之三且炮管俯仰与炮口方向一致',async()=>{
 const page=await openSurvival();const result=await page.evaluate(()=>{
  state=STATE.PAUSED;const g=makeTurretMesh('turret'),tur=g.userData.turret;
  if(!tur.userData.pitchPivot)return {missing:true};
  g.position.set(0,8,0);scene.add(g);const target=new THREE.Vector3(8,1,12);
  aimTurretAt(g,target,1);g.updateMatrixWorld(true);
  const muzzle=tur.userData.muzzleMarker.getWorldPosition(new THREE.Vector3());
  const forward=tur.userData.pitchPivot.getWorldDirection(new THREE.Vector3());
  return {scale:g.scale.x,down:tur.userData.pitchPivot.rotation.x>0,aligned:forward.dot(target.clone().sub(muzzle).normalize())>.995};
 });await page.close();assert.deepEqual(result,{scale:.75,down:true,aligned:true});
});

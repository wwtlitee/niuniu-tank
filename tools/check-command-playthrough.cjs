'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 const out='output/command-polish/interaction';fs.mkdirSync(out,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TANK3D_TEST_URL||'http://127.0.0.1:8001/play/niuniu-tank/index.html?mode=survival&autotest=1');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state===7);
  await page.evaluate(()=>{
    questActive=false;hideQuestPanel();game.prepTime=10000;game.popMax=200;
    // Controlled army fixture; all subsequent selection and orders use real input.
    for(let i=0;i<6;i++)createFriendlyUnit(i===0?'hero':i%2?'light':'medium',cellCenter(8,12));
    heroTank=friendlyUnits.find(u=>u.type==='hero');game.hero.status='alive';
    survivalOverview=false;camHeight=55;camFocus.copy(heroTank.group.position);updateCamera(1);
    window.fixtureStart=friendlyUnits.map(u=>({x:u.group.position.x,z:u.group.position.z}));
    wc3ClearSel();renderer.render(scene,camera);
  });
  await page.waitForFunction(()=>/\d+ FPS/.test(document.getElementById('performanceHud').textContent));
  await page.mouse.move(720,450);await page.keyboard.press('F1');
  assert.equal(await page.evaluate(()=>wc3Sel?.ref===heroTank),true,'F1 selects hero');
  await page.screenshot({path:`${out}/hero-selected.png`});
  const box=await page.evaluate(()=>{
    const points=friendlyUnits.map(u=>{const p=u.group.position.clone().add(new THREE.Vector3(0,1.2,0)).project(camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
    return {left:Math.min(...points.map(p=>p.x))-16,right:Math.max(...points.map(p=>p.x))+16,top:Math.min(...points.map(p=>p.y))-16,bottom:Math.max(...points.map(p=>p.y))+16};
  });
  await page.mouse.move(box.left,box.top);await page.mouse.down();await page.mouse.move(box.right,box.bottom,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>wc3Selection.length),6,'Box selects all six bodies');
  await page.keyboard.press('Control+3');await page.keyboard.press('m');
  const target=await page.evaluate(()=>{const p=cellCenter(10,14),q=new THREE.Vector3(p.x,heightAt(p.x,p.z),p.z).project(camera);return {x:(q.x+1)*innerWidth/2,y:(1-q.y)*innerHeight/2};});
  await page.mouse.click(target.x,target.y);
  assert.equal(await page.evaluate(()=>friendlyUnits.filter(u=>u.command==='move'&&u.moveTarget).length),6);
  for(let i=0;i<20;i++)await page.evaluate(()=>advanceTime(500));
  const rings=await page.evaluate(()=>wc3Selection.slice(1).every((entry,i)=>wc3ExtraRings[i].position.distanceTo(entry.ref.group.position)<.2));
  assert.ok(rings,'Selection rings follow moving units');
  await page.screenshot({path:`${out}/formation-arrival.png`});
  await page.keyboard.press('h');
  assert.equal(await page.evaluate(()=>friendlyUnits.every(u=>u.command==='hold'&&!u.moveTarget)),true);
  await page.keyboard.press('a');await page.mouse.click(710,400,{button:'right'});
  assert.equal(await page.evaluate(()=>wc3AttackMove),false,'Right click cancels armed command');
  const result=await page.evaluate(()=>({version:GAME_VERSION,selected:wc3Selection.length,units:friendlyUnits.map((u,i)=>({type:u.type,moved:Math.hypot(u.group.position.x-fixtureStart[i].x,u.group.position.z-fixtureStart[i].z),command:u.command,target:u.moveTarget})),state:JSON.parse(render_game_to_text())}));
  assert.ok(result.units.every(u=>u.moved>2),JSON.stringify(result.units));assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/result.json`,JSON.stringify({...result,errors,fixture:'Six spawned units; native mouse/keyboard orders and full game updates'},null,2));console.log(JSON.stringify({version:result.version,selected:result.selected,units:result.units,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

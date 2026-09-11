'use strict';
const {chromium}=require('playwright'),{PeerServer}=require('peer'),{createStaticServer}=require('./asset-runtime-catalog.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const out='output/racing-v7.0.0';fs.mkdirSync(out,{recursive:true});
 const staticServer=await createStaticServer(process.cwd());let signal;
 PeerServer({port:0,host:'127.0.0.1',path:'/race'},s=>signal=s);
 while(!signal?.listening)await new Promise(r=>setTimeout(r,10));
 const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});const errors=[],pages=[];
 try{
  async function page(){const context=await browser.newContext({viewport:{width:1280,height:800}});await context.addInitScript(port=>{window.RACING_NETWORK_CONFIG={peerOptions:{host:'127.0.0.1',port,path:'/race',secure:false,config:{iceServers:[]}}};},signal.address().port);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${staticServer.address().port}/racing.html?autotest=1`);await p.waitForFunction(()=>window.racingReady);pages.push(p);return p;}
  const host=await page(),client=await page();await host.fill('#playerName','房主');await host.click('#createRoom');await host.waitForFunction(()=>RacingTest.net.opened);const code=await host.evaluate(()=>RacingTest.net.code);
  await client.fill('#playerName','挑战者');await client.fill('#roomInput',code);await client.click('#joinRoom');await client.waitForFunction(()=>RacingTest.net.opened);assert.equal(await host.locator('#roomStart').isDisabled(),true);
  await client.click('#readyRoom');await host.waitForFunction(()=>RacingTest.net.members[1]?.ready);
  await client.fill('#roomName','星际车手');await client.click('#roomColors [data-color="4"]');await host.waitForFunction(()=>RacingTest.net.members[1]?.color===4&&RacingTest.net.members[1]?.name==='星际车手');assert.equal(await host.evaluate(()=>RacingTest.net.members[1].ready),false);
  await client.click('#readyRoom');await host.waitForFunction(()=>RacingTest.net.members[1]?.ready);await host.screenshot({path:out+'/room.png'});await client.screenshot({path:out+'/room-client.png'});await host.click('#roomStart');await client.waitForFunction(()=>RacingTest.game.phase==='racing');assert.equal(await host.evaluate(()=>RacingTest.game.cars[1].color),4);
  await client.keyboard.down('w');await client.keyboard.down('ArrowRight');await client.keyboard.down('Space');await client.waitForTimeout(1000);await client.keyboard.up('ArrowRight');await client.keyboard.up('Space');
  const remote=await host.evaluate(()=>({...RacingTest.game.cars[1]}));assert.ok(remote.speed>10);assert.ok(remote.aim<-.5);assert.equal(await host.evaluate(()=>RacingTest.game.cars[0].speed),0);
  const view=JSON.parse(await client.evaluate(()=>render_game_to_text()));assert.equal(view.player.id,1);assert.ok(view.player.speed>10);await client.screenshot({path:out+'/client-race.png'});
  await client.keyboard.up('w');await host.evaluate(()=>{RacingTest.game.cars[1].inventory=['boost','shield'];});await client.waitForTimeout(150);await client.keyboard.press('q');await client.waitForTimeout(100);await client.keyboard.press('e');await host.waitForFunction(()=>RacingTest.game.cars[1].shield>0);
  await client.keyboard.press('e');await host.waitForFunction(()=>RacingTest.game.cars[1].boost>0);
  await host.evaluate(()=>{const g=RacingTest.game,c=g.cars[1],p=RacingRules.sample(g.pickups[0].s);Object.assign(c,{x:p.x+Math.cos(p.heading)*2,z:p.z-Math.sin(p.heading)*2,y:p.y,heading:p.heading,lastS:p.s,progress:p.s,speed:0,boost:0,inventory:[null,null],supplyPass:-999,supplyCount:0});g.pickups.forEach(p=>p.cooldown=0);});
  await client.waitForFunction(()=>RacingTest.game.cars[1].supplyCount===2&&RacingTest.game.pickups.length===25);assert.equal(await host.evaluate(()=>RacingTest.game.cars[1].supplyCount),2);
  await host.evaluate(()=>{RacingRules.pause(RacingTest.game);RacingTest.net.snapshot();});await client.waitForFunction(()=>RacingTest.game.phase==='paused');await client.waitForTimeout(150);
  const hostTime=await host.evaluate(()=>RacingTest.game.time),clientTime=await client.evaluate(()=>RacingTest.game.time);assert.ok(Math.abs(hostTime-clientTime)<.002);const cowHost=await host.evaluate(()=>JSON.parse(render_game_to_text()).spectacle.cowX),cowClient=await client.evaluate(()=>JSON.parse(render_game_to_text()).spectacle.cowX);assert.ok(Math.abs(cowHost-cowClient)<.01);
  await host.evaluate(()=>{RacingRules.pause(RacingTest.game);RacingTest.net.snapshot();});await client.waitForFunction(()=>RacingTest.game.phase==='racing');
  await host.evaluate(()=>{
   const g=RacingTest.game,R=RacingRules;
   for(const [id,s] of [[1,100],[0,118]]){const p=R.sample(s);Object.assign(g.cars[id],{x:p.x,y:p.y,z:p.z,lastS:s,safe:s,progress:s,speed:0,boost:0,heading:p.heading,aim:0,pitch:0,invulnerable:0,shield:0,cooldown:0});}
   const a=g.cars[1],b=g.cars[0];a.heading=Math.atan2(b.x-a.x,b.z-a.z);a.pitch=Math.atan2(b.y-a.y-.5,Math.hypot(b.x-a.x,b.z-a.z));g.shots=[];
  });
  await client.waitForTimeout(150);await client.keyboard.down('Space');await host.waitForFunction(()=>RacingTest.game.events.some(e=>e.type==='hit'&&e.car===0));await client.keyboard.up('Space');
  await host.evaluate(()=>{const c=RacingTest.game.cars[1];c.cooldown=0;c.inventory=['missile',null];c.slot=0;});await client.keyboard.press('e');await host.waitForFunction(()=>RacingTest.game.events.some(e=>e.type==='missile'&&e.car===1));
  await host.evaluate(()=>{const c=RacingTest.game.cars[1];c.inventory=['mine',null];c.slot=0;});await client.keyboard.press('e');await host.waitForFunction(()=>RacingTest.game.mines.some(m=>m.owner===1));
  await host.evaluate(()=>{const c=RacingTest.game.cars[1],p=RacingRules.sample(70);Object.assign(c,{x:p.x,y:p.y,z:p.z,heading:p.heading,lastS:70,safe:70,progress:70,speed:30,offroad:0,stun:0});});
  await client.keyboard.down('w');await client.keyboard.down('d');await client.keyboard.down('Shift');await host.waitForFunction(()=>RacingTest.game.cars[1].drifting);await client.keyboard.up('Shift');await client.keyboard.up('d');await client.keyboard.up('w');await host.waitForFunction(()=>{const input=RacingTest.net.controls()[1];return input&&input.throttle===0&&input.steer===0&&!input.drift;});await client.keyboard.press('r');await host.waitForFunction(()=>RacingTest.game.cars[1].speed===0);
  await client.keyboard.press('Escape');const before=await host.evaluate(()=>RacingTest.game.time);await client.waitForTimeout(150);assert.ok(await host.evaluate(()=>RacingTest.game.time)>before);await client.click('#resume');
  await host.keyboard.press('Escape');await client.waitForFunction(()=>RacingTest.game.phase==='paused');await host.click('#resume');await client.waitForFunction(()=>RacingTest.game.phase==='racing');
  await host.evaluate(()=>{const g=RacingTest.game;g.cars.slice(2).forEach(c=>c.finished=true);for(const [id,s] of [[0,400],[1,350]]){const p=RacingRules.sample(s);Object.assign(g.cars[id],{x:p.x,y:p.y,z:p.z,heading:p.heading,progress:s,lastS:s,safe:s,speed:0,invulnerable:0,shield:0,threatGuard:0});}g.cars[1].inventory=['ufo','leader'];g.cars[1].slot=0;});
  await client.keyboard.press('e');await host.waitForFunction(()=>RacingTest.game.cars[0].lift>0);await client.waitForFunction(()=>RacingTest.game.threats.some(t=>t.kind==='ufo')&&RacingTest.game.cars[0].lift>0);await host.screenshot({path:out+'/ufo-host.png'});await client.screenshot({path:out+'/ufo-client.png'});await host.waitForFunction(()=>RacingTest.game.threats.length===0);assert.ok(await host.evaluate(()=>RacingTest.game.cars[0].progress)<370);assert.deepEqual(await host.evaluate(()=>RacingTest.game.cars[1].inventory),['leader',null]);
  await host.evaluate(()=>{RacingTest.game.cars[0].progress=RacingRules.track.length*3;});await host.waitForFunction(()=>RacingTest.game.cars[0].finished);assert.equal(await host.evaluate(()=>RacingTest.game.phase),'racing');
  await host.evaluate(()=>{RacingTest.game.cars[1].progress=RacingRules.track.length*3;});await client.waitForFunction(()=>RacingTest.game.phase==='finished');await client.screenshot({path:out+'/network-results.png'});
  await host.click('#again');await client.waitForFunction(()=>!RacingTest.net.game);await client.click('#readyRoom');await host.waitForFunction(()=>RacingTest.net.members[1]?.ready);await host.click('#roomStart');await client.waitForFunction(()=>RacingTest.net.match===2);
  await client.click('#pauseButton');await client.click('#leaveRace');await host.waitForFunction(()=>RacingTest.net.members[1]===null);assert.deepEqual(await host.evaluate(()=>RacingTest.game.humans),[0]);
  await host.evaluate(()=>RacingTest.net.leave());await host.click('#start');await host.waitForFunction(()=>RacingTest.game.phase==='countdown');
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/network.json',JSON.stringify({transport:'real PeerJS + WebRTC, separate browser contexts, local signaling',code,remote,view,errors,passed:true},null,2));console.log('Real WebRTC room / independent input / combat / pause / finish / rematch / disconnect / solo PASS');
 }finally{await browser.close();staticServer.close();signal.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});

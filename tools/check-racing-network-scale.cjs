'use strict';
const {chromium}=require('playwright'),{PeerServer}=require('peer'),{createStaticServer}=require('./asset-runtime-catalog.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const publicSignal=process.argv.includes('--public'),count=publicSignal?2:6,out='output/racing-v6.48.0';fs.mkdirSync(out,{recursive:true});
 const server=await createStaticServer(process.cwd());let signal,browser;const pages=[],errors=[];
 try{
  if(!publicSignal){PeerServer({port:0,host:'127.0.0.1',path:'/race'},s=>signal=s);while(!signal?.listening)await new Promise(r=>setTimeout(r,10));}
  browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
  for(let i=0;i<count;i++){
   const context=await browser.newContext({viewport:{width:800,height:600}});if(!publicSignal)await context.addInitScript(port=>{window.RACING_NETWORK_CONFIG={peerOptions:{host:'127.0.0.1',port,path:'/race',secure:false,config:{iceServers:[]}}};},signal.address().port);
   const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}/racing.html?autotest=1`);await p.waitForFunction(()=>window.racingReady);await p.fill('#playerName','车手'+(i+1));
   if(i===0)await p.click('#createRoom');else{await p.fill('#roomInput',await pages[0].evaluate(()=>RacingTest.net.code));await p.click('#joinRoom');}
   await p.waitForFunction(()=>RacingTest.net.opened,{},{timeout:20000});if(i>0)await p.click('#readyRoom');
  }
  const host=pages[0];await host.waitForFunction(n=>RacingTest.net.members.filter(Boolean).length===n&&RacingTest.net.members.every(m=>!m||m.ready),count);
  if(!publicSignal){await host.setViewportSize({width:1280,height:800});await host.screenshot({path:out+'/six-room.png'});}
  await host.click('#roomStart');for(const p of pages){await p.waitForFunction(()=>RacingTest.game.phase==='racing');await p.evaluate(()=>RacingTest.realtime(true));}
  // Controlled 100ms per-direction message delay; actual WebRTC transports the messages.
  if(!publicSignal)for(const p of [host,pages[1]])await p.evaluate(()=>{const n=RacingTest.net,send=n.send.bind(n);n.send=(c,m)=>{setTimeout(()=>send(c,m),100);return true;};});
  const before=await host.evaluate(async()=>{const result=[];for(const c of RacingTest.net.links.keys()){const stats=await c.peerConnection.getStats();result.push([...stats.values()].filter(s=>s.type==='data-channel').map(s=>s.bytesSent||0).reduce((a,b)=>a+b,0));}return result;});
  const wall=Date.now();const frames=await host.evaluate(()=>new Promise(resolve=>{const samples=[];let last=performance.now();function step(now){samples.push(now-last);last=now;if(samples.length<300)requestAnimationFrame(step);else resolve(samples);}requestAnimationFrame(step);}));
  const states=[];for(const p of pages)states.push(JSON.parse(await p.evaluate(()=>render_game_to_text())));
  assert.ok(states.every((s,i)=>s.player.id===i&&s.player.progress>0));assert.ok(states.every(s=>s.network.members.filter(Boolean).length===count));assert.ok(states.every(s=>Math.abs(s.time-states[0].time)<1));
  const after=await host.evaluate(async()=>{const result=[];for(const c of RacingTest.net.links.keys()){const stats=await c.peerConnection.getStats();result.push([...stats.values()].filter(s=>s.type==='data-channel').map(s=>s.bytesSent||0).reduce((a,b)=>a+b,0));}return result;});
  const elapsed=(Date.now()-wall)/1000,bytesPerSecond=after.map((v,i)=>Math.round((v-before[i])/elapsed));frames.sort((a,b)=>a-b);
  await host.evaluate(()=>RacingTest.net.leave());for(const p of pages.slice(1))await p.waitForFunction(()=>RacingTest.net.role==='off');assert.deepEqual(errors,[]);
  const result={passed:true,publicSignal,count,simulatedDelayEachDirectionMs:publicSignal?0:100,elapsed,hostFrames:{median:frames[150],p95:frames[285]},bytesPerSecondPerGuest:bytesPerSecond,states,errors};fs.writeFileSync(out+(publicSignal?'/public-signal.json':'/six-player.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,count,publicSignal,frames:result.hostFrames,bytesPerSecond}));
 }catch(e){const states=[];for(const p of pages)try{states.push(await p.evaluate(()=>window.RacingTest?.net.status));}catch{}fs.writeFileSync(out+(publicSignal?'/public-signal.json':'/six-player.json'),JSON.stringify({passed:false,error:e.message,states,errors},null,2));throw e;
 }finally{await browser?.close();server.close();signal?.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});

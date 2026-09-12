/* 装甲竞速 v10.1.0 — 纯规则模块，浏览器与 Node 共用。 */
(function(root,factory){const node=typeof module==='object'&&module.exports,catalog=node?require('./racing-circuits.js'):root.RacingCircuits,cache=new Map();
 function forTrack(id='canyon'){catalog.get(id);if(!cache.has(id)){const api=factory(catalog.get(id));api.forTrack=forTrack;cache.set(id,api);}return cache.get(id);}
 let selected='canyon';if(!node){const id=new URLSearchParams(root.location.search).get('track');if(catalog.list().some(t=>t.id===id))selected=id;}
 if(node)module.exports=forTrack();else root.RacingRules=forTrack(selected);
})(typeof window==='object'?window:globalThis,function(definition){
 'use strict';
 const TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), wrap=(v,n)=>(v%n+n)%n;
 const angle=v=>wrap(v+Math.PI,TAU)-Math.PI;
 const LIMITS=Object.freeze({shots:48,mines:24,events:64,pickups:25,supplyRows:5});
 const ITEMS=['boost','missile','mine','shield','leader','ufo','emp'];
 const ITEM_NAMES={boost:'加速推进',missile:'追踪导弹',mine:'反坦克地雷',shield:'装甲护盾',leader:'猎首导弹',ufo:'飞碟牵引',emp:'电磁脉冲'};
 const DRIFT_TIERS=Object.freeze([{charge:.3,boost:.8,kick:4,name:'蓝焰',color:'#63dfff'},{charge:.65,boost:1.4,kick:6,name:'橙焰',color:'#ffa542'},{charge:1,boost:2.1,kick:8,name:'紫焰',color:'#d989ff'}].map(Object.freeze));
 function driftTier(charge){return Number.isFinite(charge)?DRIFT_TIERS.reduce((tier,reward,index)=>charge>=reward.charge?index+1:tier,0):0;}
 const BODIES=Object.freeze([{id:0,name:'峡谷先锋',origin:'竞速原型',detail:'楔形装甲 / 长身主炮'},{id:1,name:'经典游骑',origin:'经典巷战',detail:'圆顶炮塔 / 紧凑车体'},{id:2,name:'突击轻坦',origin:'生存防守',detail:'短管突击 / 侧裙装甲'},{id:3,name:'远征中坦',origin:'生存防守',detail:'长炮管 / 双后置油箱'},{id:4,name:'重锤重坦',origin:'生存防守',detail:'粗径重炮 / 厚重炮盾'},{id:5,name:'守备主战',origin:'生存部队',detail:'宽体底盘 / 方形炮塔'},{id:6,name:'赤金英雄',origin:'生存英雄',detail:'金属包边 / 能源核心'}]);
 const bodyOf=v=>Number.isInteger(v)&&v>=0&&v<BODIES.length?v:0;
 const PALETTE=['#cf493e','#d6a544','#55a890','#4b91bb','#a184ca','#c1c8bb'];
 // 顺时针闭合试验场；弯道半径允许履带车辆以街机速度通过。
 const anchors=definition.anchors;
 function cat(a,b,c,d,t){return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);}
 const points=[];
 for(let i=0;i<anchors.length;i++)for(let j=0;j<48;j++){
  const a=anchors[wrap(i-1,anchors.length)],b=anchors[i],c=anchors[(i+1)%anchors.length],d=anchors[(i+2)%anchors.length],t=j/48;
  points.push({x:cat(a[0],b[0],c[0],d[0],t),z:cat(a[1],b[1],c[1],d[1],t),y:definition.theme==='city'?clamp(cat(a[2],b[2],c[2],d[2],t),1.2,18):0,s:0});
 }
 points.push({...points[0]});
 for(let i=1;i<points.length;i++)points[i].s=points[i-1].s+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z);
 const length=points.at(-1).s;
 function sample(s){
  s=wrap(s,length);let lo=0,hi=points.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(points[m].s<=s)lo=m;else hi=m;}
  const a=points[lo],b=points[hi],t=(s-a.s)/(b.s-a.s);
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:height(s),heading:Math.atan2(b.x-a.x,b.z-a.z),s};
 }
 function height(s){if(definition.theme!=='city')return 1.2+5*Math.pow(Math.sin(wrap(s,length)/length*Math.PI*2),4);s=wrap(s,length);let lo=0,hi=points.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(points[m].s<=s)lo=m;else hi=m;}const a=points[lo],b=points[hi];return a.y+(b.y-a.y)*(s-a.s)/(b.s-a.s);}
 const shortStart=points[48*definition.shortcut[0]].s,shortEnd=points[48*definition.shortcut[1]].s,sa=sample(shortStart),sb=sample(shortEnd);
 const shortcut={start:shortStart,end:shortEnd,a:sa,b:sb,length:Math.hypot(sb.x-sa.x,sb.z-sa.z),width:9};
 const track={...definition,points,length,shortcut};
 function segment(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);return {t,x:a.x+dx*t,z:a.z+dz*t};}
 const LOCATE_WINDOW=16;
 const RUNOFF=Object.freeze({ground:Object.freeze({soft:12,hard:32,seconds:8}),bridge:Object.freeze({soft:4,hard:10,seconds:4})});
 function runoff(s){return definition.theme==='city'&&height(s)>8?RUNOFF.bridge:RUNOFF.ground;}
 function nearestOnMain(x,z,from,to,best,y){
  for(let i=from;i<=to;i++){
   const a=points[i],b=points[i+1],q=segment(x,z,a,b),dist=Math.hypot(x-q.x,z-q.z);
   const s=a.s+(b.s-a.s)*q.t,score=Number.isFinite(y)?Math.hypot(dist,(height(s)-y)*4):dist;if(score<(best.score??best.distance))best={...q,distance:dist,score,s,width:track.width,shortcut:false,index:i};
  }
  return best;
 }
 function includeShortcut(x,z,best,preferMain,y){
  const q=segment(x,z,sa,sb),distance=Math.hypot(x-q.x,z-q.z);
  // 铺装主路覆盖交汇区时继续按主路计程，避免内侧走线在两条中心线之间反复跳转。
  if((!Number.isFinite(y)||Math.abs(height(shortStart+(shortEnd-shortStart)*q.t)-y)<3)&&(!preferMain||best.distance>track.width/2)&&distance<shortcut.width/2&&distance<best.distance)return {...q,distance,s:shortStart+(shortEnd-shortStart)*q.t,width:shortcut.width,shortcut:true,index:-1};
  return best;
 }
 function locate(x,z,preferMain=false,y){
  let best={distance:Infinity,index:-1};
  best=nearestOnMain(x,z,0,points.length-2,best,y);
  return includeShortcut(x,z,best,preferMain,y);
 }
  // 连续行驶的车辆只在上一帧段索引附近搜索；捷径段始终参与判定，出界复位后回退全扫描。
  function locateNear(x,z,hint,y){
   if(!(Number.isInteger(hint)&&hint>=0&&hint<=points.length-2))return locate(x,z,true,y);
   let best={distance:Infinity,index:-1};
   for(let k=-LOCATE_WINDOW;k<=LOCATE_WINDOW;k++){const i=wrap(hint+k,points.length-1);best=nearestOnMain(x,z,i,i,best,y);}
   // 命中搜索窗口边界也说明提示可能过旧，不能把错误路段当成真实最近段。
   if(best.distance>track.width*2||best.index===wrap(hint-LOCATE_WINDOW,points.length-1)||best.index===wrap(hint+LOCATE_WINDOW,points.length-1))return locate(x,z,true,y);
   return includeShortcut(x,z,best,true,y);
  }
 function supplyPosition(p){const q=sample(p.s),lane=p.lane||0;return {...q,x:q.x+Math.cos(q.heading)*lane,z:q.z-Math.sin(q.heading)*lane};}
 const carNames=['你','猎隼','灰狼','铁骑','游隼','赤狐'];
 function create(options={}){
  const cars=carNames.map((name,id)=>{
   const s=-(Math.floor(id/2)*8+10),p=sample(s),lane=id%2?3.8:-3.8;
   const car={id,name,color:id,body:id,lift:0,threatGuard:0,supplyPass:-999,supplyCount:0,x:p.x+Math.cos(p.heading)*lane,z:p.z-Math.sin(p.heading)*lane,y:p.y,heading:p.heading,speed:0,progress:s,lastS:wrap(s,length),safe:s,lap:0,inventory:[null,null],slot:0,shield:0,boost:0,stun:0,cooldown:0,offroad:0,finished:false,finishTime:null,aiUse:4+id,aiFire:3+id,aim:0,pitch:0,invulnerable:1.5,steering:0,slip:0,drifting:false,driftCharge:0,seg:-1};
   Object.defineProperty(car,'item',{enumerable:true,get(){return this.inventory[this.slot];},set(value){this.inventory[this.slot]=value;}});
   return car;
  });
  return {trackId:track.id,trackRevision:track.revision,multiplayer:Array.isArray(options.humans),humans:Array.isArray(options.humans)?[...new Set(options.humans.filter(id=>Number.isInteger(id)&&id>=0&&id<6))]:[0],phase:'countdown',beforePause:null,countdown:3,time:0,cars,shots:[],mines:[],threats:[],events:[],results:[],seed:1234567,
   pickups:Array.from({length:LIMITS.pickups},(_,i)=>({id:i,row:Math.floor(i/5),lane:[0,-4,4,-8,8][i%5],s:65+Math.floor(i/5)*length/5,cooldown:0})),message:'准备发车',messageTime:0,serial:0};
 }
 function random(g){g.seed=(Math.imul(g.seed,1664525)+1013904223)>>>0;return g.seed/4294967296;}
 function event(g,type,c){g.events.push({id:++g.serial,type,x:c.x,y:c.y||height(c.s||0),z:c.z,car:c.id,ttl:.65});if(g.events.length>LIMITS.events)g.events.shift();}
 function say(g,text){g.message=text;g.messageTime=2;}
 function pause(g){if(g.phase==='paused'){g.phase=g.beforePause;g.beforePause=null;}else if(g.phase==='racing'||g.phase==='countdown'){g.beforePause=g.phase;g.phase='paused';}}
 function recover(g,c){
  if(c.lift>0)return false;
   const p=sample(c.safe);Object.assign(c,{x:p.x,z:p.z,y:p.y,heading:p.heading,speed:0,offroad:0,lastS:p.s,progress:c.safe,lap:clamp(Math.floor(Math.max(0,c.safe)/length),0,3),invulnerable:2,slip:0,steering:0,drifting:false,driftCharge:0,seg:-1});
  if(c.id===0)say(g,'已回到赛道');event(g,'recover',c);
 }
 function hit(g,c){
  if(c.invulnerable>0||c.finished||c.lift>0)return false;
  if(c.shield>0){c.shield=0;event(g,'shield',c);if(c.id===0)say(g,'护盾挡住攻击');return false;}
  if(c.stun>0)return false;
  c.speed*=.72;c.stun=.4;c.invulnerable=1.5;event(g,'hit',c);if(c.id===0)say(g,'装甲受击 · 短暂减速');return true;
 }
 function fire(g,c,target=null,fromItem=false){
  if(g.phase!=='racing'||c.finished||c.lift>0||(!fromItem&&c.cooldown>0)||g.shots.length>=LIMITS.shots)return false;
  if(!fromItem)c.cooldown=target===null?1.1:1.6;
  const heading=c.heading+(c.aim||0);
  g.shots.push({id:++g.serial,owner:c.id,x:c.x+Math.sin(heading)*4,z:c.z+Math.cos(heading)*4,y:c.y+1.9,heading,pitch:c.pitch,ttl:target===null?1.3:3.5,target,speed:target===null?110:65});event(g,'fire',c);return true;
 }
 function switchItem(g,c){if(g.phase!=='racing'||c.finished)return false;c.slot=(c.slot+1)%2;if(c.id===0)say(g,'切换至道具槽 '+(c.slot+1));return true;}
 function useItem(g,c){
  if(g.phase!=='racing'||!ITEMS.includes(c.item)||c.finished||c.lift>0)return false;
  const item=c.item;
  if(item==='missile'){
   const targets=g.cars.filter(o=>o!==c&&!o.finished&&Math.hypot(o.x-c.x,o.z-c.z)<160&&o.progress>c.progress).sort((a,b)=>a.progress-b.progress);
   if(!targets.length){if(c.id===0)say(g,'前方没有可锁定目标');return false;}
   if(!fire(g,c,targets[0].id,true))return false;
   }else if(item==='leader'||item==='ufo'){
   const target=ranking(g).find(o=>!o.finished);
   if(!target||target===c||target.threatGuard>0||g.threats.some(t=>t.target===target.id)||g.threats.length>=3){if(c.id===0)say(g,'领跑者暂时无法锁定');return false;}
   g.threats.push({id:++g.serial,kind:item,owner:c.id,target:target.id,age:0,grabbed:false,origin:target.progress});event(g,item+'warning',target);
  }else if(item==='emp'){
   for(const o of g.cars)if(o!==c&&Math.hypot(o.x-c.x,o.z-c.z)<30&&hit(g,o)){o.speed*=.65;o.stun=.85;o.boost=0;}
  }else if(item==='boost')c.boost=Math.min(6,c.boost+3);
  else if(item==='shield')c.shield=7;
  else if(item==='mine'){
   if(g.mines.length>=LIMITS.mines)g.mines.shift();
   g.mines.push({id:++g.serial,owner:c.id,x:c.x-Math.sin(c.heading)*5,z:c.z-Math.cos(c.heading)*5,y:c.y+.15,ttl:18,arm:.5});
  }
  c.item=null;c.inventory=c.inventory.filter(Boolean);while(c.inventory.length<2)c.inventory.push(null);c.slot=0;event(g,item,c);if(c.id===0)say(g,ITEM_NAMES[item]+' · 已使用');return true;
 }
 function rollItem(g,c){
  const order=ranking(g).filter(o=>!o.finished),rank=order.indexOf(c),gap=(order[0]?.progress||0)-c.progress;
  const pool=rank===0?['mine','mine','shield','shield','boost','emp']:rank<3&&gap<90?['boost','boost','missile','missile','shield','mine','emp','leader']:['boost','boost','boost','missile','shield','emp','leader','leader','ufo',...(gap>130?['leader','ufo']:[])];
  return pool[Math.floor(random(g)*pool.length)];
 }
 function updateThreats(g,dt){
  for(const t of g.threats){const c=g.cars[t.target];if(!c||c.finished){t.done=true;continue;}t.age+=dt;
   if(!t.grabbed&&t.age>=1.2){
    if(c.shield>0){c.shield=0;c.threatGuard=5;event(g,'shield',c);t.done=true;continue;}
    if(c.invulnerable>0||c.lift>0){t.done=true;continue;}
    if(t.kind==='leader'){c.speed*=.35;c.stun=1;c.boost=0;c.invulnerable=3;c.threatGuard=8;event(g,'leaderhit',c);t.done=true;continue;}
    t.grabbed=true;t.origin=c.progress;const originPoint=sample(c.progress);t.laneX=c.x-originPoint.x;t.laneZ=c.z-originPoint.z;c.speed=0;c.driftCharge=0;c.drifting=false;c.boost=0;event(g,'abduct',c);
   }
   if(t.grabbed){const f=Math.min(1,(t.age-1.2)/1.8),progress=Math.max(-10,t.origin-40*f*f*(3-2*f)),p=sample(progress);Object.assign(c,{x:p.x+(t.laneX||0)*(1-f),z:p.z+(t.laneZ||0)*(1-f),y:p.y,heading:p.heading,progress,safe:progress,lastS:p.s,seg:-1,lap:clamp(Math.floor(Math.max(0,progress)/length),0,3)});c.lift=Math.max(.01,6*Math.sin(f*Math.PI));
    if(t.age>=3){const progress=Math.max(-10,t.origin-40),p=sample(progress);Object.assign(c,{x:p.x,y:p.y,z:p.z,heading:p.heading,progress,safe:progress,lastS:p.s,lap:clamp(Math.floor(Math.max(0,progress)/length),0,3),speed:0,slip:0,steering:0,offroad:0,lift:0,invulnerable:3,threatGuard:9});t.done=true;event(g,'release',c);}
   }
  }
  g.threats=g.threats.filter(t=>!t.done);
 }
 function autopilot(c,g){
  const p=sample(c.lastS+12+Math.max(0,c.speed)*.7),lane=c.id===0?0:(c.id%3-1)*5;
  p.x+=Math.cos(p.heading)*lane;p.z-=Math.sin(p.heading)*lane;
  const desired=Math.atan2(p.x-c.x,p.z-c.z),turn=angle(desired-c.heading);
  const steer=clamp(turn*1.65,-1,1),target=34+(c.id%3)*1.7;
  return {throttle:c.speed>target-Math.min(18,Math.abs(turn)*15)?0:1,steer,brake:Math.abs(turn)>.9};
 }
 function move(g,c,dt,input){
  const throttle=Number.isFinite(input.throttle)?clamp(input.throttle,-1,1):0,steer=Number.isFinite(input.steer)?clamp(input.steer,-1,1):0;
  for(const key of ['cooldown','stun','shield','boost','invulnerable','threatGuard'])c[key]=Math.max(0,c[key]-dt);
  if(c.lift>0){c.speed=0;return;}
  const oldX=c.x,oldZ=c.z,oldProgress=c.progress,oldSeg=c.seg;
  const finiteAxis=v=>Number.isFinite(v)?clamp(v,-1,1):0;
  c.aim=clamp(c.aim+finiteAxis(input.aimYaw)*1.15*dt,-.75,.75);
  c.pitch=clamp(c.pitch+finiteAxis(input.aimPitch)*.65*dt,-.18,.3);
  c.steering+=(steer-c.steering)*(1-Math.exp(-9*dt));
  const wasDrifting=c.drifting;
  const driftEligible=c.speed>13&&c.offroad===0&&c.stun===0&&!input.brake&&throttle>=0;
  // 起漂需要方向输入；起漂后允许反打、回正修正走线，只有松键才兑现蓄力。
  c.drifting=!!input.drift&&driftEligible&&(wasDrifting||Math.abs(c.steering)>.2);
  const maxSpeed=c.boost>0?58:42,accel=c.stun>0?7:23;
  const acceleration=throttle<0&&c.speed>1?-36:throttle*accel;
  c.speed+=acceleration*dt;
  c.speed*=Math.exp(-(input.brake||input.drift&&!c.drifting?2.1:throttle===0?.32:.09)*dt);
  c.speed=clamp(c.speed,-9,maxSpeed);
  const motionHeading=c.heading-c.slip;
  c.heading=angle(c.heading+c.steering*(.4+Math.min(Math.abs(c.speed),32)*.029)*(c.drifting?1.5:1)*dt*(c.speed<-.1?-1:1));
  const grip=c.drifting?1.65:11;
  c.slip=clamp(angle(c.heading-motionHeading)*Math.exp(-grip*dt),-.7,.7);
  c.speed*=Math.exp(-Math.abs(c.slip)*(c.drifting?.14:.07)*dt);
  const travelHeading=c.heading-c.slip;
  c.x+=Math.sin(travelHeading)*c.speed*dt;c.z+=Math.cos(travelHeading)*c.speed*dt;
   const q=locateNear(c.x,c.z,c.seg,c.y);c.y=height(q.s);c.seg=q.index;
  let delta=angle((q.s-c.lastS)/length*TAU)/TAU*length;
  const junction=[shortStart,shortEnd].some(s=>Math.abs(q.s-s)<45&&Math.abs(c.lastS-s)<45);
  const switchedRoute=q.shortcut!==(oldSeg===-1)&&junction&&Math.abs(delta)<32;
  // 捷径用主路等效里程；真实分流/汇流允许有限投影差，其他跳点立即安全复位。
  // 拒绝后不能保留位置却冻结 lastS，否则后续整圈都会落入重复拒绝。
  const continuous=Math.abs(delta)<Math.abs(c.speed)*dt*5+3||switchedRoute,buffer=runoff(q.s);
  if(!continuous&&q.distance<q.width/2+4){recover(g,c);return;}
  if(continuous&&q.distance<q.width/2+buffer.hard){
   c.progress+=delta;c.lastS=q.s;
   if(q.distance<q.width/2-1&&!q.shortcut)c.safe=c.progress;
  }
  c.lap=clamp(Math.floor(Math.max(0,c.progress)/length),0,3);
  if(q.distance>q.width/2){
   const outside=q.distance-q.width/2;
   c.speed*=Math.exp(-(.55+1.45*clamp(outside/buffer.hard,0,1))*dt);
   if(c.offroad===0&&c.id===0)say(g,'缓冲区减速 · 转回赛道继续比赛');c.offroad+=dt;
   if(outside>buffer.hard||(outside>buffer.soft&&c.offroad>buffer.seconds))recover(g,c);
  }else c.offroad=0;
  if(c.offroad>0||!driftEligible){c.drifting=false;c.driftCharge=0;}
  else if(c.drifting){if(Math.abs(c.slip)>.12)c.driftCharge=clamp(c.driftCharge+dt*Math.abs(c.slip)*1.4,0,1);}
  else if(wasDrifting){
   const tier=driftTier(c.driftCharge),reward=DRIFT_TIERS[tier-1];
   if(!input.drift&&reward){c.boost=Math.max(c.boost,reward.boost);c.speed=Math.min(58,c.speed+reward.kick);event(g,'driftboost',c);g.events.at(-1).tier=tier;if(c.id===0)say(g,reward.name+'漂移 · 出弯推进！');}
   c.driftCharge=0;
  }
  for(const p of g.pickups){if(p.cooldown>0||c.inventory.every(Boolean))continue;const pos=supplyPosition(p),near=segment(pos.x,pos.z,{x:oldX,z:oldZ},{x:c.x+1e-8,z:c.z});
   if(Math.hypot(pos.x-near.x,pos.z-near.z)<2.15){const pass=Math.round((c.progress-p.s)/length)*LIMITS.supplyRows+p.row;if(c.supplyPass!==pass){c.supplyPass=pass;c.supplyCount=0;}if(c.supplyCount>=2)continue;c.supplyCount++;const slot=c.item?1-c.slot:c.slot,item=rollItem(g,c);c.inventory[slot]=item;p.cooldown=6;event(g,'pickup',c);if(c.id===0)say(g,'获得 '+ITEM_NAMES[item]);}
  }
  if(c.progress>=length*3&&!c.finished){const fraction=c.progress>oldProgress?clamp((length*3-oldProgress)/(c.progress-oldProgress),0,1):1;c.finished=true;c.finishTime=g.time-dt+dt*fraction;g.results.push(c.id);g.results.sort((a,b)=>g.cars[a].finishTime-g.cars[b].finishTime);event(g,'finish',c);if(!g.multiplayer&&c.id===0)g.phase='finished';}
 }
 function step(g,dt,input={}){
  if(!Number.isFinite(dt)||dt<=0||g.phase==='paused'||g.phase==='finished')return;
  dt=Math.min(dt,1/30);
  if(g.phase==='countdown'){g.countdown=Math.max(0,g.countdown-dt);if(g.countdown<1e-8){g.phase='racing';say(g,'出发！');}return;}
  g.time+=dt;updateThreats(g,dt);g.messageTime=Math.max(0,g.messageTime-dt);
  for(const p of g.pickups)p.cooldown=Math.max(0,p.cooldown-dt);
  for(const c of g.cars){if(c.finished)continue;const human=g.humans.includes(c.id),control=human?(g.multiplayer?input.players?.[c.id]||{}:input):autopilot(c,g);move(g,c,dt,control);
   if(human&&control.fire)fire(g,c);
    if(!human){c.aiUse-=dt;c.aiFire-=dt;if(c.aiUse<=0){if(!c.item)switchItem(g,c);if(c.item!=='boost'||Math.abs(c.steering)<.35)useItem(g,c);c.aiUse=2+random(g)*3;}const target=g.cars.find(o=>o!==c&&!o.finished&&Math.hypot(o.x-c.x,o.z-c.z)<65&&Math.abs(angle(Math.atan2(o.x-c.x,o.z-c.z)-c.heading))<.12);if(target&&c.aiFire<=0){c.pitch=Math.atan2(target.y-c.y,Math.hypot(target.x-c.x,target.z-c.z));if(fire(g,c))c.aiFire=3+random(g)*2;}}
  }
  for(let i=0;i<g.cars.length;i++)for(let j=i+1;j<g.cars.length;j++){
   const a=g.cars[i],b=g.cars[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(Math.abs(a.y-b.y)>3||d>=3.6||d<.001||a.finished||b.finished||a.lift>0||b.lift>0)continue;
   const push=(3.6-d)*.5;a.x-=dx/d*push;a.z-=dz/d*push;b.x+=dx/d*push;b.z+=dz/d*push;a.speed*=.985;b.speed*=.985;
  }
  for(const s of g.shots){
   if(s.target!==null){const c=g.cars[s.target];if(c&&!c.finished){s.heading+=clamp(angle(Math.atan2(c.x-s.x,c.z-s.z)-s.heading),-2.5*dt,2.5*dt);s.pitch=Math.atan2(c.y+1.4-s.y,Math.hypot(c.x-s.x,c.z-s.z));}}
   const old={x:s.x,z:s.z};s.x+=Math.sin(s.heading)*Math.cos(s.pitch)*s.speed*dt;s.z+=Math.cos(s.heading)*Math.cos(s.pitch)*s.speed*dt;s.y+=Math.sin(s.pitch)*s.speed*dt;s.ttl-=dt;
   for(const c of g.cars){if(c.id===s.owner||c.finished)continue;const q=segment(c.x,c.z,old,s);if(Math.hypot(c.x-q.x,c.z-q.z)<2.4&&Math.abs(s.y-(c.y+1.4))<1.7){hit(g,c);s.ttl=0;break;}}
  }
  g.shots=g.shots.filter(s=>s.ttl>0);
  for(const m of g.mines){m.ttl-=dt;m.arm-=dt;for(const c of g.cars)if(m.arm<=0&&c.id!==m.owner&&Math.abs(c.y-m.y)<2&&Math.hypot(c.x-m.x,c.z-m.z)<3.2){hit(g,c);m.ttl=0;break;}}
  g.mines=g.mines.filter(m=>m.ttl>0);for(const e of g.events)e.ttl-=dt;g.events=g.events.filter(e=>e.ttl>0);
  if(g.multiplayer){const first=Math.min(...g.cars.filter(c=>c.finished).map(c=>c.finishTime));if(g.humans.every(id=>g.cars[id].finished)||g.time-first>=45||g.time>=480)g.phase='finished';}
 }
 function predictCar(g,car,dt,input){
  const c={...car,inventory:[...car.inventory]};
  if(g.phase!=='racing'||car.finished||!Number.isFinite(dt)||dt<=0)return c;
  const isolated={...g,cars:[c],pickups:[],events:[],results:[]};
  move(isolated,c,Math.min(dt,1/30),input||{});return c;
 }
 function ranking(g){return [...g.cars].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress);}
 return {RUNOFF,runoff,BODIES,bodyOf,DRIFT_TIERS,driftTier,create,step,rollItem,ITEMS,ITEM_NAMES,PALETTE,predictCar,pause,track,sample,supplyPosition,locate,height,autopilot,hit,fire,useItem,switchItem,recover,ranking,LIMITS,angle};
});

/* 装甲竞速 v8.2.0 — 房主权威规则，PeerJS 仅负责浏览器间连接。 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./racing-rules.js'));else root.RacingNetwork=factory(root.RacingRules);})(typeof window==='object'?window:globalThis,function(R){
 'use strict';
 const PROTOCOL=3,PREFIX='niuniu-race-1-',MAX=6;
 const FIELDS=['x','y','z','heading','speed','progress','lastS','safe','lap','slot','shield','boost','stun','cooldown','offroad','aim','pitch','invulnerable','steering','slip','driftCharge','finishTime','lift','threatGuard','color','supplyPass','supplyCount'];
 const ITEMS=[null,...R.ITEMS];
 const colorOf=v=>Number.isInteger(v)&&v>=0&&v<R.PALETTE.length?v:0;
 const nameOf=v=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,16)||'车手':'车手';
 const codeOf=v=>typeof v==='string'?v.trim().toUpperCase():'';
 const axis=v=>Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;
 const cleanInput=v=>({throttle:axis(v?.throttle),steer:axis(v?.steer),aimYaw:axis(v?.aimYaw),aimPitch:axis(v?.aimPitch),fire:v?.fire===true,drift:v?.drift===true,brake:v?.brake===true});
 const round=v=>typeof v==='number'?Math.round(v*1000)/1000:v;
 function pack(g){return {phase:g.phase,time:round(g.time),countdown:round(g.countdown),humans:g.humans,
  cars:g.cars.map(c=>[...FIELDS.map(k=>round(c[k])),c.finished,c.drifting,c.inventory[0],c.inventory[1],c.name]),
  threats:g.threats.map(t=>({...t})),shots:g.shots.map(s=>({...s})),mines:g.mines.map(m=>({...m})),events:g.events.map(e=>({...e})),pickups:g.pickups.map(p=>round(p.cooldown)),results:[...g.results]};}
 function unpack(p){
  if(!p||!['countdown','racing','paused','finished'].includes(p.phase)||!Number.isFinite(p.time)||p.time<0||p.time>481||!Number.isFinite(p.countdown)||p.countdown<0||p.countdown>3)return null;
  if(!Array.isArray(p.cars)||p.cars.length!==MAX||!Array.isArray(p.humans)||p.humans.some(id=>!Number.isInteger(id)||id<0||id>=MAX))return null;
  if(!Array.isArray(p.pickups)||p.pickups.length!==R.LIMITS.pickups||p.pickups.some(v=>!Number.isFinite(v)||v<0||v>6))return null;
  for(const [key,max] of [['shots',48],['mines',24],['events',64]]){if(!Array.isArray(p[key])||p[key].length>max||p[key].some(o=>!o||typeof o!=='object'||Object.values(o).some(v=>typeof v==='number'&&!Number.isFinite(v))||!['x','y','z'].every(k=>Number.isFinite(o[k]))))return null;}
  if(!Array.isArray(p.results)||p.results.length>6||p.results.some(id=>!Number.isInteger(id)||id<0||id>5))return null;
  if(!Array.isArray(p.threats)||p.threats.length>3||p.threats.some(t=>!t||!['leader','ufo'].includes(t.kind)||!Number.isInteger(t.target)||t.target<0||t.target>5||!Number.isFinite(t.age)||!Number.isFinite(t.origin)))return null;
  const g=R.create({humans:p.humans});
  for(let i=0;i<MAX;i++){
   const row=p.cars[i];if(!Array.isArray(row)||row.length!==FIELDS.length+5)return null;
   if(FIELDS.some((k,j)=>k==='finishTime'?row[j]!==null&&!Number.isFinite(row[j]):!Number.isFinite(row[j])))return null;
   if(![0,1].includes(row[9])||!ITEMS.includes(row[FIELDS.length+2])||!ITEMS.includes(row[FIELDS.length+3]))return null;
   FIELDS.forEach((k,j)=>g.cars[i][k]=row[j]);Object.assign(g.cars[i],{finished:row[FIELDS.length]===true,drifting:row[FIELDS.length+1]===true,inventory:row.slice(FIELDS.length+2,FIELDS.length+4),name:nameOf(row[FIELDS.length+4])});
  }
  if(g.cars.some(c=>!Number.isInteger(c.supplyPass)||!Number.isInteger(c.supplyCount)||c.supplyCount<0||c.supplyCount>2))return null;
  Object.assign(g,{phase:p.phase,time:p.time,countdown:p.countdown,threats:p.threats,shots:p.shots,mines:p.mines,events:p.events,results:p.results});g.pickups.forEach((v,i)=>v.cooldown=p.pickups[i]);return g;
 }
 function roomCode(){const bytes=new Uint8Array(6);globalThis.crypto.getRandomValues(bytes);return Array.from(bytes,b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join('');}
 class Session{
  constructor({Peer,peerOptions={},now=()=>performance.now(),onChange=()=>{},onStart=()=>{},onSnapshot=()=>{},onExit=()=>{}}={}){
   Object.assign(this,{Peer,peerOptions,now,onChange,onStart,onSnapshot,onExit,role:'off',slot:0,code:'',members:Array(MAX).fill(null),links:new Map(),game:null,match:0,status:'',seq:0,actionSeq:0,rtt:0,epoch:0});
  }
  changed(status){if(status!==undefined)this.status=status;this.onChange(this);}
  send(conn,message){if(!conn?.open)return false;if(conn.dataChannel?.bufferedAmount>131072)return false;try{conn.send(message);return true;}catch{return false;}}
  broadcast(message){for(const c of this.links.keys())this.send(c,message);}
  announce(){this.broadcast({type:'room',members:this.members,code:this.code});this.changed();}
  connectPeer(id){
   const epoch=this.epoch;this.peer=new this.Peer(id,this.peerOptions);const peer=this.peer;
   peer.on('error',e=>{if(epoch!==this.epoch)return;if(e.type==='peer-unavailable'){this.leave('房间不存在或房主已离开');return;}
    if(this.role==='host'&&e.type==='unavailable-id'&&this.attempts++<4){peer.destroy();this.code=roomCode();this.connectPeer(PREFIX+this.code);return;}
    this.leave('连接未成功，请检查网络后重试（'+(e.type||'网络异常')+'）');});
   peer.on('disconnected',()=>{if(epoch!==this.epoch)return;this.changed('房间服务暂时断开，正在重连');try{peer.reconnect();}catch{}});
   peer.on('connection',c=>{if(epoch!==this.epoch||this.role!=='host'){c.close();return;}this.accept(c);});
   peer.on('open',()=>{if(epoch!==this.epoch)return;this.lastSeen=this.now();if(this.role==='host'){this.opened=true;this.changed('房间已创建，邀请朋友加入');}
    else{const c=peer.connect(PREFIX+this.code,{reliable:true,serialization:'json'});this.connection=c;c.on('open',()=>this.send(c,{type:'hello',protocol:PROTOCOL,name:this.name,color:this.color}));c.on('data',m=>{if(epoch===this.epoch)this.receive(m);});c.on('close',()=>{if(epoch===this.epoch&&this.role==='client')this.leave('与房主的连接已断开');});c.on('error',()=>{if(epoch===this.epoch)this.leave('无法连接房主，请检查双方网络或稍后重试');});}});
  }
  setup(role,name,code,color=0){this.leave();this.role=role;this.name=nameOf(name);this.color=colorOf(color);this.code=code;this.slot=0;this.members=Array(MAX).fill(null);this.lastSeen=this.now();this.lastPing=0;this.lastSend=0;this.lastSnapshot=0;this.seq=0;this.actionSeq=0;this.attempts=0;this.match=0;this.opened=false;this.changed('正在连接房间服务…');
   if(!this.Peer){this.leave('联机文件未加载，请刷新页面');return false;}return true;}
  host(name,color=0){if(!this.setup('host',name,roomCode(),color))return;this.members[0]={name:this.name,color:this.color,ready:true};try{this.connectPeer(PREFIX+this.code);}catch{this.leave('浏览器暂不支持联机连接');}}
  join(code,name,color=0){code=codeOf(code);if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){this.changed('请输入六位房间码');return;}if(!this.setup('client',name,code,color))return;try{this.connectPeer();}catch{this.leave('浏览器暂不支持联机连接');}}
  accept(c){
   if(this.links.size>=12){c.on('open',()=>{this.send(c,{type:'reject',reason:'房间已满'});setTimeout(()=>c.close(),100);});return;}
   const entry={slot:null,last:this.now(),input:{},inputAt:0,seq:-1,actionSeq:-1,budget:0,window:this.now()};this.links.set(c,entry);
   c.on('data',m=>{if(!this.links.has(c)||!m||typeof m!=='object')return;const now=this.now();if(now-entry.window>=1000){entry.window=now;entry.budget=0;}if(++entry.budget>100){c.close();return;}entry.last=now;
    if(m.type==='hello'&&entry.slot===null){let reason='';if(m.protocol!==PROTOCOL)reason='游戏版本不同，请双方刷新页面';else if(this.game)reason='比赛已开始，请等待下一场';const slot=this.members.findIndex((v,i)=>i>0&&!v);if(slot<0)reason='房间已满（最多六人）';
     if(reason){this.send(c,{type:'reject',reason});setTimeout(()=>c.close(),100);return;}entry.slot=slot;this.members[slot]={name:nameOf(m.name),color:colorOf(m.color),ready:false};this.send(c,{type:'welcome',protocol:PROTOCOL,slot,code:this.code,members:this.members});this.announce();return;}
    if(entry.slot===null)return;
    if(m.type==='ping'){this.send(c,{type:'pong',time:m.time});return;}
    if(m.type==='profile'&&!this.game){this.members[entry.slot]={name:nameOf(m.name),color:colorOf(m.color),ready:false};this.announce();return;}
    if(m.type==='ready'&&!this.game){this.members[entry.slot].ready=m.ready===true;this.announce();return;}
    if(m.type==='leave'){c.close();return;}
    if(m.match!==this.match||!this.game)return;
    if(m.type==='input'&&Number.isSafeInteger(m.seq)&&m.seq>entry.seq){entry.seq=m.seq;entry.input=cleanInput(m.input);entry.inputAt=now;}
    if(m.type==='action'&&Number.isSafeInteger(m.seq)&&m.seq>entry.actionSeq){entry.actionSeq=m.seq;this.applyAction(entry.slot,m.action);}
   });
   const remove=()=>{if(!this.links.delete(c))return;if(entry.slot!==null){this.members[entry.slot]=null;if(this.game){this.game.humans=this.game.humans.filter(id=>id!==entry.slot);this.game.cars[entry.slot].name+=' · AI';}this.announce();}};c.on('close',remove);c.on('error',()=>{remove();c.close();});
  }
  validMembers(m){return Array.isArray(m)&&m.length===6&&m.every(v=>v===null||v&&typeof v.name==='string'&&typeof v.ready==='boolean'&&Number.isInteger(v.color)&&v.color>=0&&v.color<R.PALETTE.length);}
  receive(m){
   if(this.role!=='client'||!m||typeof m!=='object')return;this.lastSeen=this.now();
   if(m.type==='reject'||m.type==='closed'){this.leave(typeof m.reason==='string'?m.reason.slice(0,150):'房主已关闭房间');return;}
   if(m.type==='welcome'){if(m.protocol!==PROTOCOL||!Number.isInteger(m.slot)||m.slot<1||m.slot>5||!this.validMembers(m.members)){this.leave('房间数据不兼容，请刷新');return;}this.slot=m.slot;this.members=m.members;this.opened=true;this.changed('已加入房间，准备后等待房主发车');return;}
   if(!this.opened)return;
   if(m.type==='room'&&this.validMembers(m.members)){this.members=m.members;this.changed();}
   if(m.type==='pong'&&Number.isFinite(m.time)){this.rtt=Math.max(0,Math.min(10000,this.now()-m.time));}
   if(m.type==='lobby'){this.game=null;this.changed('已返回等候室');}
   if(m.type==='start'&&Number.isSafeInteger(m.match)&&m.match>this.match){const g=unpack(m.state);if(!g)return;this.match=m.match;this.game=g;this.snapshotSeq=-1;this.onStart(g,this.slot);this.changed('比赛进行中');}
   if(m.type==='snapshot'&&m.match===this.match&&Number.isSafeInteger(m.seq)&&m.seq>this.snapshotSeq){const g=unpack(m.state);if(!g)return;this.snapshotSeq=m.seq;this.game=g;this.onSnapshot(g);}
  }
  profile(name,color){if(this.game||!this.opened)return;this.name=nameOf(name);this.color=colorOf(color);if(this.role==='host'){this.members[0]={name:this.name,color:this.color,ready:true};this.announce();}else if(this.role==='client')this.send(this.connection,{type:'profile',name:this.name,color:this.color});}
  ready(value){if(this.role==='client')this.send(this.connection,{type:'ready',ready:value===true});}
  start(){if(this.role!=='host'||!this.opened||this.game||this.members.some(m=>m&&!m.ready))return false;
   this.game=R.create({humans:this.members.flatMap((m,i)=>m?[i]:[])});this.members.forEach((m,i)=>{if(m){this.game.cars[i].name=m.name;this.game.cars[i].color=m.color;}});this.match++;this.snapshotSeq=0;
   for(const e of this.links.values()){e.input={};e.seq=-1;e.actionSeq=-1;e.inputAt=0;}this.broadcast({type:'start',match:this.match,state:pack(this.game)});this.onStart(this.game,0);this.changed('比赛进行中');return true;
  }
  returnLobby(){if(this.role!=='host'||this.game?.phase!=='finished')return false;this.game=null;this.members.forEach((m,i)=>{if(m)m.ready=i===0;});this.broadcast({type:'lobby'});this.announce();return true;}
  controls(){const result={};for(const e of this.links.values())if(e.slot!==null)result[e.slot]=this.now()-e.inputAt<=500?e.input:{};return result;}
  applyAction(slot,action){const g=this.game;if(!g||g.phase!=='racing'||!g.humans.includes(slot))return;const c=g.cars[slot];if(c.finished)return;if(action==='use')R.useItem(g,c);if(action==='switch')R.switchItem(g,c);if(action==='recover')R.recover(g,c);}
  action(action){if(this.role==='host')this.applyAction(0,action);else if(this.game)this.send(this.connection,{type:'action',match:this.match,seq:++this.actionSeq,action});}
  sendInput(input){if(this.role==='client'&&this.game)this.send(this.connection,{type:'input',match:this.match,seq:++this.seq,input:cleanInput(input)});}
  pause(){if(this.role==='host'&&this.game){R.pause(this.game);this.snapshot();}}
  snapshot(){if(!this.game)return;this.broadcast({type:'snapshot',match:this.match,seq:++this.snapshotSeq,state:pack(this.game)});this.lastSnapshot=this.now();}
  tick(dt,input){
   if(this.role==='off')return;const now=this.now();
   if(!this.opened&&now-this.lastSeen>15000){this.leave('连接超时，请检查网络；可更换房主或网络重试');return;}
   if(this.role==='host'){
    for(const [c,e] of this.links)if(now-e.last>15000)c.close();
    if(this.game){R.step(this.game,dt,{players:{...this.controls(),0:cleanInput(input)}});if(now-this.lastSnapshot>=1000/15)this.snapshot();}
   }else{
    if(now-this.lastSeen>15000){this.leave('房主长时间无响应，已退出房间');return;}
    if(now-this.lastSend>=1000/30){this.sendInput(input);this.lastSend=now;}
    if(now-this.lastPing>=1000){this.send(this.connection,{type:'ping',time:now});this.lastPing=now;}
   }
  }
  leave(reason=''){
   const active=this.role!=='off';this.epoch++;if(this.role==='host')this.broadcast({type:'closed',reason:reason||'房主已关闭房间'});else this.send(this.connection,{type:'leave'});
   this.role='off';for(const c of this.links.keys())c.close();this.links.clear();this.connection?.close();this.peer?.destroy();this.peer=null;this.connection=null;this.game=null;this.opened=false;this.members=Array(MAX).fill(null);this.status=reason;if(active){this.onExit(reason);this.changed();}
  }
 }
 return {Session,pack,unpack,cleanInput,PROTOCOL};
});

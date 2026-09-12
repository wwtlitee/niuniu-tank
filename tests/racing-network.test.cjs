const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),R=require('../js/racing/racing-rules.js');
let N;try{N=require('../js/racing/racing-network.js');}catch{}
// In-memory signaling/transport only; match lifecycle and rules are production code.
const peers=new Map();let serial=0;
class Peer extends EventEmitter{
 constructor(id){super();this.id=id||'guest-'+(++serial);peers.set(this.id,this);queueMicrotask(()=>this.emit('open',this.id));}
 connect(id){const a=new EventEmitter(),b=new EventEmitter();a.open=b.open=false;a.peer=id;b.peer=this.id;
 a.send=m=>queueMicrotask(()=>b.emit('data',structuredClone(m)));b.send=m=>queueMicrotask(()=>a.emit('data',structuredClone(m)));
 a.close=b.close=()=>{if(!a.open)return;a.open=b.open=false;a.emit('close');b.emit('close');};
 queueMicrotask(()=>{const p=peers.get(id);if(!p){this.emit('error',{type:'peer-unavailable'});return;}p.emit('connection',b);a.open=b.open=true;b.emit('open');a.emit('open');});return a;
 }
 destroy(){peers.delete(this.id);}
}
const flush=()=>new Promise(r=>setImmediate(r));
async function room(count=2){assert.ok(N,'network module exists');let time=0;const all=Array.from({length:count},()=>new N.Session({Peer,now:()=>time}));all[0].host('房主');await flush();for(const c of all.slice(1)){c.join(all[0].code,'车手');await flush();}return {all,host:all[0],advance(ms){time+=ms;for(const n of all)n.tick(1/60,{});}};}
test('创建加入、准备、六人上限、进行中拒绝加入',async()=>{
 const {all,host}=await room(7);assert.equal(host.members.filter(Boolean).length,6);assert.equal(all[6].role,'off');
 assert.equal(host.start(),false);for(const c of all.slice(1,6))c.ready(true);await flush();assert.equal(host.start(),true);await flush();
 assert.equal(all[1].game.phase,'countdown');assert.equal(all[1].slot,1);
 const late=new N.Session({Peer});late.join(host.code,'迟到');await flush();assert.equal(late.role,'off');all.forEach(n=>n.leave());
});
test('槽位绑定连接，不能伪造进度；输入过期自动归零，离开由 AI 接管',async()=>{
 const {all,host,advance}=await room();all[1].ready(true);await flush();host.start();await flush();host.game.phase='racing';
 all[1].sendInput({throttle:1,steer:Infinity,progress:999999,slot:0});await flush();advance(10);
 assert.ok(host.game.cars[1].speed>0);assert.equal(host.game.cars[0].speed,0);assert.ok(host.game.cars[1].progress<0);
 assert.equal(host.controls()[1].throttle,1);advance(600);assert.equal(host.controls()[1].throttle,undefined);
 all[1].leave();await flush();assert.deepEqual(host.game.humans,[0]);assert.equal(host.members[1],null);host.leave();
});
test('动作去重与比赛隔离；同一 E 不可消耗下场道具',async()=>{
 const {all,host}=await room();all[1].ready(true);await flush();host.start();await flush();host.game.phase='racing';host.game.cars[1].item='shield';
 const message={type:'action',match:host.match,seq:1,action:'use'};all[1].connection.send(message);all[1].connection.send(message);await flush();
 assert.equal(host.game.cars[1].item,null);host.game.cars[1].item='boost';all[1].connection.send(message);await flush();assert.equal(host.game.cars[1].item,'boost');
 host.game.phase='finished';host.returnLobby();await flush();all[1].ready(true);await flush();host.start();await flush();host.game.phase='racing';host.game.cars[1].item='mine';all[1].connection.send(message);await flush();assert.equal(host.game.cars[1].item,'mine');all.forEach(n=>n.leave());
});
test('快照编解码保留道具访问器，拒绝超限和非有限字段',()=>{
 assert.ok(N);const g=R.create({humans:[0,1]});g.cars[1].item='boost';const packet=N.pack(g);const decoded=N.unpack(packet);
 assert.equal(decoded.cars[1].item,'boost');decoded.cars[1].slot=1;assert.equal(decoded.cars[1].item,null);
 assert.ok(JSON.stringify(packet).length<6000);packet.cars[1][0]=Infinity;assert.equal(N.unpack(packet),null);
});
test('房主退出与心跳超时回到入口，不保留幽灵房间',async()=>{
 const {all,host}=await room();host.leave();await flush();assert.equal(all[1].role,'off');
 const r=await room();r.advance(16000);await flush();assert.equal(r.all[1].role,'off');r.host.leave();
});
test('加入新的房主时清除旧房间的比赛编号',async()=>{
 const {all,host}=await room();all[1].match=5;all[1].leave();await flush();all[1].join(host.code,'重新加入');await flush();all[1].ready(true);await flush();host.start();await flush();assert.ok(all[1].game);all.forEach(n=>n.leave());
});
test('过期快照不能倒退计时；断开的慢客人不能积压无限发送队列',async()=>{
 const {all,host}=await room();all[1].ready(true);await flush();host.start();await flush();host.game.time=5;host.snapshot();await flush();
 all[1].receive({type:'snapshot',match:host.match,seq:0,state:N.pack(R.create({humans:[0,1]}))});assert.equal(all[1].game.time,5);
 assert.equal(host.send({open:true,dataChannel:{bufferedAmount:200000},send(){throw Error('must not send');}},{type:'snapshot'}),false);all.forEach(n=>n.leave());
});
test('等候室改昵称与颜色会取消准备，资料随比赛同步',async()=>{
 const {all,host}=await room();all[1].ready(true);await flush();assert.equal(host.members[1].ready,true);
 assert.equal(typeof all[1].profile,'function');all[1].profile('新昵称',4);await flush();assert.equal(host.members[1].name,'新昵称');assert.equal(host.members[1].color,4);assert.equal(host.members[1].ready,false);
 all[1].ready(true);await flush();host.start();await flush();assert.equal(all[1].game.cars[1].color,4);assert.equal(all[1].game.cars[1].name,'新昵称');all[1].profile('作弊',2);await flush();assert.equal(host.game.cars[1].name,'新昵称');all.forEach(n=>n.leave());
});
test('飞碟威胁与浮空、新道具队列能通过快照传给客人',()=>{
 const g=R.create({humans:[0,1]});g.phase='racing';g.cars[0].inventory=['ufo','leader'];g.cars[0].lift=4;g.cars[0].color=3;g.threats=[{id:1,kind:'ufo',owner:1,target:0,age:2,grabbed:true,origin:100}];const decoded=N.unpack(N.pack(g));assert.ok(decoded);assert.equal(decoded.cars[0].item,'ufo');assert.equal(decoded.cars[0].lift,4);assert.equal(decoded.cars[0].color,3);assert.equal(decoded.threats[0].target,0);
});

test('外形在创建、加入、换装、开赛与重赛间保持，准备状态随换装重置',async()=>{
 const host=new N.Session({Peer}),guest=new N.Session({Peer});
 try{
  host.host('英雄',5,6);await flush();guest.join(host.code,'经典',3,1);await flush();
  assert.equal(host.members[0].body,6);assert.equal(host.members[1].body,1);guest.ready(true);await flush();
  guest.profile('重锤',4,4);await flush();assert.equal(host.members[1].body,4);assert.equal(host.members[1].ready,false);
  guest.ready(true);await flush();host.start();await flush();assert.equal(guest.game.cars[0].body,6);assert.equal(guest.game.cars[1].body,4);
  guest.profile('作弊换装',0,2);await flush();assert.equal(host.game.cars[1].body,4);
  host.game.phase='finished';host.returnLobby();await flush();guest.ready(true);await flush();host.start();await flush();assert.equal(guest.game.cars[1].body,4);
 }finally{guest.leave();host.leave();}
});

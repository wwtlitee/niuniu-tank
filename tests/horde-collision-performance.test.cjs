'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/engine.js'),'utf8');
const code=source.slice(source.indexOf('function zombieCollisionShape('),source.indexOf('function modelFootprintRadius('));
const context=vm.createContext({});vm.runInContext(code,context);
function body(id,angle=0){const hull=Array.from({length:20},(_,i)=>({x:.14*Math.cos(i*Math.PI/10),z:.2*Math.sin(i*Math.PI/10)}));return {hordeId:id,radius:.25,collisionHullRadius:.25,collisionHull:hull,group:{position:{x:0,z:0},rotation:{y:angle}}};}
test('碰撞旋转回退复用前一姿态几何，不重复旋转全部轮廓',()=>{
 const a=body(1),first=context.zombieCollisionShape(a);a.group.rotation.y=.73;const second=context.zombieCollisionShape(a);assert.notEqual(first,second);a.group.rotation.y=0;assert.equal(context.zombieCollisionShape(a),first);a.group.rotation.y=.73;assert.equal(context.zombieCollisionShape(a),second);
});
test('移动快速碰撞与完整SAT的两万组旋转位移结果一致',()=>{
 let seed=97;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const a=body(1),b=body(2);
 for(let i=0;i<20000;i++){a.group.rotation.y=rand()*Math.PI*2;b.group.rotation.y=rand()*Math.PI*2;b.group.position.x=(rand()-.5)*.9;b.group.position.z=(rand()-.5)*.9;const full=context.zombieBodyContact(a,b);assert.equal(context.zombieBodiesPenetrate(a,b),!!full&&full.depth>.0005,`case ${i}`);}
});
const hordeRestCode=source.slice(source.indexOf('function hordeRestContactValid('),source.indexOf('function resolveHordeMovement('));
vm.runInContext(hordeRestCode,context);context.navigationStamp=3;
test('堵塞休眠在邻居移动、死亡、转身或地形变化时立即失效',()=>{
 const e=body(1),b=body(2),old={x:0,z:0,angle:0};
 const reset=()=>{b.alive=true;b.dying=false;b.group.position.x=0;b.group.rotation.y=0;context.navigationStamp=3;e._hordeRest={...old,radius:e.radius,revision:3,remaining:.16,blockers:[{ref:b,x:0,z:0,angle:0,radius:b.radius}]};};
 reset();assert.equal(context.hordeRestContactValid(e,old,.016),true);
 reset();b.group.position.x=.00001;assert.equal(context.hordeRestContactValid(e,old,.016),false);
 reset();b.alive=false;assert.equal(context.hordeRestContactValid(e,old,.016),false);
 reset();b.group.rotation.y=.01;assert.equal(context.hordeRestContactValid(e,old,.016),false);
 reset();context.navigationStamp++;assert.equal(context.hordeRestContactValid(e,old,.016),false);
 reset();assert.equal(context.hordeRestContactValid(e,{...old,x:.01},.016),false);
 reset();assert.equal(context.hordeRestContactValid(e,old,.17),false);
});
test('碰撞唤醒只看已接受位置，不被本帧尚未通过碰撞的移动提案误唤醒',()=>{
 const e=body(1),b=body(2),old={x:0,z:0,angle:0};b.alive=true;context.navigationStamp=3;
 e._hordeRest={...old,radius:e.radius,revision:3,remaining:.16,blockers:[{ref:b,x:0,z:0,angle:0,radius:b.radius}]};
 b.group.position.x=.2;b.group.rotation.y=.5;
 assert.equal(context.hordeRestContactValid(e,old,.016,new Map([[b,{x:0,z:0,angle:0}]])),true);
 assert.equal(context.hordeRestContactValid(e,old,.016,new Map([[b,{x:.1,z:0,angle:0}]])),false);
});

test('凸轮廓快速判定覆盖不等尺寸及接触容差边界',()=>{
 const a=body(1),b=body(2);a.radius*=3.5;
 for(const angle of [0,.01,.7,Math.PI/2,Math.PI])for(const z of [-.5,-.2,0,.1,.5])for(let x=-1;x<1;x+=.003){b.group.rotation.y=angle;b.group.position.x=x;b.group.position.z=z;const full=context.zombieBodyContact(a,b);assert.equal(context.zombieBodiesPenetrate(a,b),!!full&&full.depth>.0005);}
});

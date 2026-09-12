const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('../lib/three.min.js');
const DeathEffects = require('../js/zombie-death-effects.js');
const engine = fs.readFileSync(path.resolve(__dirname, '../js/engine.js'), 'utf8');
function engineFunction(name) {
  const start = engine.indexOf(`function ${name}(`), end = engine.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0, name);
  return engine.slice(start, end < 0 ? undefined : end);
}

test('返回菜单清空死亡与英雄队列，释放敌人但保留共享资源', () => {
  const scene = new THREE.Scene(), shared = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry();
  let disposedShared = 0, disposedGeometry = 0, lodCleared = 0;
  shared.addEventListener('dispose', () => disposedShared++);geometry.addEventListener('dispose', () => disposedGeometry++);
  const makeEnemy = () => {const group = new THREE.Group();group.add(new THREE.Mesh(geometry, shared));scene.add(group);return {group,alive:true,characterModel:true};};
  const alive = makeEnemy(), pending = makeEnemy();scene.remove(pending.group);pending.alive=false;
  const effects = DeathEffects.create({ THREE, scene });effects.spawn(alive,{projectileType:'grenade'});
  const menuNode = {classList:{add(){},remove(){}}};
  const ctx = vm.createContext({THREE, scene, enemies:[alive], pendingEnemyDisposals:[pending], zombieDeathEffects:effects,
    hordeKillUiDirty:true,clearCrowdLod(){lodCleared++;}, clearHeroLogistics(){},clearEnemyTargetReferences(){},
    _sharedMats:new Set([shared]),_sharedGeoms:new Set([geometry]),performance:{now:()=>1},
    bullets:[],particles:[],powerups:[],builtTurrets:[],builtMines:[],
    disposeTransientObject3D(){},GAME_MODES:{classic:{},survival:{},td:{}},window:{},
    document:{getElementById:()=>menuNode},refreshSaveButton(){},state:1,STATE:{MENU:0},genMap(){},camera:new THREE.PerspectiveCamera()});
  vm.runInContext(engineFunction('releaseEnemyResources'),ctx);
  vm.runInContext(engineFunction('flushEnemyDisposals'),ctx);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../js/hero-runtime.js'),'utf8'),ctx);
  const home = fs.readFileSync(path.resolve(__dirname,'../js/home.js'),'utf8').split('/* 脚本位于 body 末尾')[0];
  vm.runInContext(home,ctx);
  ctx.refreshSaveButton=()=>{};
  vm.runInContext('heroBurns.set(enemies[0],{t:2,damage:3});heroProjectiles.push({mesh:new THREE.Group()});backToMenu();',ctx);
  assert.equal(effects.inspect().activePieces,0,'menu must not freeze particles indefinitely');
  assert.equal(ctx.pendingEnemyDisposals.length,0);
  assert.equal(alive._resourcesReleased,true);assert.equal(pending._resourcesReleased,true);
  assert.equal(vm.runInContext('heroBurns.size+heroProjectiles.length',ctx),0);
  assert.equal(lodCleared,1);assert.equal(ctx.hordeKillUiDirty,false);
  assert.equal(disposedShared,0);assert.equal(disposedGeometry,0);
  effects.dispose();geometry.dispose();shared.dispose();
});

test('已死或正在死亡的Boss不得继续触发末日伤门或召唤', () => {
  const actions=[];
  const ctx=vm.createContext({enemies:[],spawnEnemy:(...args)=>actions.push(args),toast(){},
    baseGroup:{position:new THREE.Vector3()},damageGate:()=>actions.push('damage'),survivalPressureMultiplier:()=>1});
  vm.runInContext(engineFunction('updateBossMechanic'),ctx);
  for(const alive of [false,true])for(const mechanic of ['summon','doom']){
    ctx.enemy={boss:true,bossMechanic:mechanic,specialCd:0,alive,dying:alive,group:{position:new THREE.Vector3()}};
    vm.runInContext('updateBossMechanic(enemy,.1,1000)',ctx);
  }
  assert.deepEqual(actions,[]);
  ctx.enemy={boss:true,bossMechanic:'summon',specialCd:0,alive:true,dying:false,group:{position:new THREE.Vector3()}};
  vm.runInContext('updateBossMechanic(enemy,.1,1000)',ctx);
  assert.equal(actions.length,2,'living bosses still retain their mechanics');
});

test('基地EMP和迫击炮伤害透传实际武器及爆心', () => {
  const hits=[],enemy={alive:true,spawnFlash:0,group:{position:new THREE.Vector3(1,0,1)}};
  const ctx=vm.createContext({enemies:[enemy],baseGroup:{position:new THREE.Vector3()},baseAlive:true,
    game:{stats:{empLv:1,mortarLv:1},_empTimer:0,_mortarTimer:0},performance:{now:()=>10000},
    isPositionVisible:()=>true,damageEnemy:(e,d,options)=>hits.push(options),spawnParticles(){},
    sfx:{levelup(){}},camShake:0,toast(){},explode(){},destroyBricksAround(){}});
  vm.runInContext(engineFunction('updateBaseGadgets'),ctx);
  vm.runInContext('updateBaseGadgets(.1)',ctx);
  assert.equal(hits[0].projectileType,'emp');
  assert.equal(hits[1].projectileType,'mortar');
  assert.equal(hits[1].explosionOrigin.x,1);assert.equal(hits[1].explosionOrigin.z,1);
});

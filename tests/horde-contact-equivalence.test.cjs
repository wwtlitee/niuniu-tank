const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8');
const context = vm.createContext({ ACTIVE_MODE: { key: 'survival' } });
vm.runInContext(source.slice(source.indexOf('function zombieCollisionShape('), source.indexOf('function modelFootprintRadius(')), context);
vm.runInContext(source.slice(source.indexOf('function hordeLaneBlocked('), source.indexOf('/* 丧尸是矮模型')), context);
vm.runInContext(source.slice(source.indexOf('function resolveHordeMovement('), source.indexOf('function updateEnemies(')), context);

function randomGenerator(seed) {
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; };
}
function makeBody(random, id) {
  const n = 6 + 2 * Math.floor(random() * 5), width = .14 + random() * .24, depth = .12 + random() * .17;
  const collisionHull = Array.from({ length: n }, (_, i) => ({ x: Math.cos(i * Math.PI * 2 / n) * width, z: Math.sin(i * Math.PI * 2 / n) * depth }));
  const collisionHullRadius = Math.max(...collisionHull.map(p => Math.hypot(p.x, p.z)));
  return { collisionHull, collisionHullRadius, radius: collisionHullRadius * (.6 + random() * 5), hordeId: id, alive: true, dying: false,
    group: { position: { x: random() * 4 - 2, z: random() * 4 - 2 }, rotation: { y: random() * Math.PI * 2 } } };
}
function worldPolygon(body) {
  const c = Math.cos(body.group.rotation.y), s = Math.sin(body.group.rotation.y), scale = body.radius / body.collisionHullRadius;
  return body.collisionHull.map(v => ({ x: body.group.position.x + (v.x * c + v.z * s) * scale, z: body.group.position.z + (-v.x * s + v.z * c) * scale }));
}
// Independent unaccelerated SAT: no bounding circles, AABB, cached axes or projections.
function bruteContact(a, b) {
  const first = worldPolygon(a), second = worldPolygon(b); let depth = Infinity;
  for (const polygon of [first, second]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], length = Math.hypot(q.x - p.x, q.z - p.z);
    const x = -(q.z - p.z) / length, z = (q.x - p.x) / length;
    const left = first.map(v => v.x * x + v.z * z), right = second.map(v => v.x * x + v.z * z);
    const overlap = Math.min(Math.max(...left) - Math.min(...right), Math.max(...right) - Math.min(...left));
    if (overlap <= 0) return null;
    depth = Math.min(depth, overlap);
  }
  return { depth };
}
function compareContact(a, b, label) {
  const expected = bruteContact(a, b), actual = context.zombieBodyContact(a, b);
  assert.equal(!!actual, !!expected, label + ': contact classification');
  if (expected) {
    assert.ok(Math.abs(actual.depth - expected.depth) < 2e-9, label + ': penetration ' + JSON.stringify({ expected, actual }));
    assert.ok(Math.abs(Math.hypot(actual.x, actual.z) - 1) < 1e-10, label + ': unit response');
    assert.ok(actual.x * (a.group.position.x - b.group.position.x) + actual.z * (a.group.position.z - b.group.position.z) >= -1e-10, label + ': outward response');
  }
}

test('缓存SAT与直接SAT对3000组旋转平移缩放凸轮廓结果一致', () => {
  const random = randomGenerator(4902751);
  for (let i = 0; i < 3000; i++) {
    const a = makeBody(random, i * 2), b = makeBody(random, i * 2 + 1);
    if (i % 2) { b.group.position.x = a.group.position.x + (random() - .5); b.group.position.z = a.group.position.z + (random() - .5); }
    compareContact(a, b, 'pair ' + i);
  }
});

test('同一实体的位置朝向半径变化和轮廓替换均使SAT缓存正确更新', () => {
  const random = randomGenerator(8304109), a = makeBody(random, 1), b = makeBody(random, 2);
  for (let i = 0; i < 600; i++) {
    a.group.position.x = random() * 2 - 1; b.group.position.z = random() * 2 - 1;
    if (i % 3 === 0) a.group.rotation.y += random() * .5;
    if (i % 3 === 1) b.radius = b.collisionHullRadius * (.5 + random() * 4);
    if (i % 13 === 0) { const replacement = makeBody(random, 3); a.collisionHull = replacement.collisionHull; a.collisionHullRadius = replacement.collisionHullRadius; a.radius = replacement.radius; }
    compareContact(a, b, 'mutation ' + i);
  }
});

function legacyDetour(enemy, dir, spd, curH, radius, neighbors, blocked) {
  if (!(spd > 0)) return false;
  const p = enemy.group.position;
  const obstructed = neighbors.some(other => {
    if (!other || other === enemy || !other.alive || other.dying) return false;
    const dx = other.group.position.x - p.x, dz = other.group.position.z - p.z, forward = dx * dir.x + dz * dir.z;
    return forward > 0 && forward <= enemy.radius + other.radius + .16 && Math.abs(dx * dir.z - dz * dir.x) < enemy.radius + other.radius * .54;
  });
  if (!obstructed) return false;
  const length = Math.hypot(dir.x, dir.z); if (length < 1e-6) return false;
  const fx = dir.x / length, fz = dir.z / length, preferred = enemy.hordeLaneSide || (enemy.hordeId % 2 ? 1 : -1);
  for (const side of [preferred, -preferred]) {
    const nx = p.x + (fx * .4 - fz * side * .9165) * spd, nz = p.z + (fz * .4 + fx * side * .9165) * spd;
    if (blocked(nx, nz, radius, curH)) continue;
    if (neighbors.some(other => {
      if (other === enemy || !other.alive || other.dying) return false;
      const q = other.group.position, min = (enemy.radius + other.radius) * .9;
      const before = Math.hypot(p.x - q.x, p.z - q.z), after = Math.hypot(nx - q.x, nz - q.z);
      return after < min && after < before - 1e-5;
    })) continue;
    p.x = nx; p.z = nz; enemy.hordeLaneSide = side; enemy.thinkTimer = .08; return true;
  }
  return false;
}

test('单次邻域查询避让与旧距离公式在3000组拥堵减速地形条件下等价', () => {
  const random = randomGenerator(190368);
  for (let i = 0; i < 3000; i++) {
    const original = makeBody(random, i), optimized = structuredClone(original);
    const neighbors = Array.from({ length: 4 + i % 25 }, (_, j) => {
      const body = makeBody(random, j + 4000); body.radius = .15 + random() * (j % 10 ? .25 : 3);
      body.group.position.x = original.group.position.x + random() * 3 - 1.5;
      body.group.position.z = original.group.position.z + random() * 3 - 1.5;
      body.alive = j % 17 !== 0; body.dying = j % 19 === 0; return body;
    });
    const angle = random() * Math.PI * 2, dir = { x: Math.cos(angle), z: Math.sin(angle) }, spd = i % 50 ? .005 + random() * .3 : 0;
    const terrainCutoff=original.group.position.x+original.group.position.z+.02;
    const terrain = (x, z) => i % 4 === 0 && x + z > terrainCutoff;
    let calls = 0; context.hordeNeighbors = () => { calls++; return neighbors; }; context.blockedForTank = terrain;
    const expected = legacyDetour(original, dir, spd, 0, original.radius, neighbors, terrain);
    const actual = context.hordeLaneDetour(optimized, dir, spd, 0, optimized.radius);
    assert.equal(actual, expected, 'detour ' + i);
    assert.ok(Math.abs(original.group.position.x - optimized.group.position.x) + Math.abs(original.group.position.z - optimized.group.position.z) < 1e-9, 'position ' + i);
    assert.equal(optimized.hordeLaneSide, original.hordeLaneSide, 'side ' + i);
    assert.ok(calls <= 1, 'single neighbor query ' + i);
  }
});

test('合并邻域覆盖两侧原查询的所有候选，包含大体型独立索引', () => {
  const random=randomGenerator(130417),bodies=Array.from({length:700},(_,i)=>{
    const body=makeBody(random,i);body.group.position.x=random()*30-15;body.group.position.z=random()*30-15;
    body.radius=i%31===0?2+random()*3:.15+random()*.35;return body;
  });
  const spatial=vm.createContext({enemies:bodies,_animFrame:1});
  vm.runInContext(source.slice(source.indexOf('let hordeSpatialFrame='),source.indexOf('function hordeLaneBlocked(')),spatial);
  for(let i=0;i<800;i++){
    const p={x:random()*20-10,z:random()*20-10},radius=.15+random()*3,spd=random()*.6,angle=random()*Math.PI*2;
    const fx=Math.cos(angle),fz=Math.sin(angle);
    const combined=new Set(spatial.hordeNeighbors(p.x,p.z,radius+.3+spd).map(e=>e.hordeId));
    for(const side of [-1,0,1]){
      const x=p.x+(side?(fx*.4-fz*side*.9165)*spd:0),z=p.z+(side?(fz*.4+fx*side*.9165)*spd:0);
      for(const body of spatial.hordeNeighbors(x,z,radius+.3))assert.ok(combined.has(body.hordeId),'missing swept candidate '+i+':'+body.hordeId);
    }
  }
});

function cachedBody(id,x,z){
  const hull=[{x:-.05,z:-.05},{x:.05,z:-.05},{x:.05,z:.05},{x:-.05,z:.05}],radius=Math.hypot(.05,.05);
  return {alive:true,dying:false,boss:false,hordeId:id,radius,collisionHull:hull,collisionHullRadius:radius,group:{position:{x,y:0,z},rotation:{y:0}},
    _crowdLod:true,_crowdScreenPixels:8,_simulationDt:1/60,_avoidRemaining:.16,_avoidForwardX:1,_avoidForwardZ:0,_avoidSideStep:true,_avoidStepX:.4,_avoidStepZ:.9165};
}

test('缓存避让复用仍检查地形和同伴占位，不能通过单轴回退进入墙内',()=>{
  const enemy=cachedBody(1,0,0),blocker=cachedBody(2,0,.17),old={x:0,z:0,angle:0};
  let terrainChecks=0;
  context.HORDE_LARGE_RADIUS=1;context.heightAt=()=>0;context.enemyNavigationRadius=e=>e.radius;
  context.enemies=[enemy,blocker];context.hordeNeighbors=()=>{throw new Error('cached decision should not recompute neighbors');};
  context.blockedForTank=(x,z)=>{terrainChecks++;return x>.02&&z<.03;};
  assert.equal(context.hordeLaneDetour(enemy,{x:1,z:0},.1,0,enemy.radius),true);
  assert.equal(terrainChecks,1,'cached candidate must still query terrain');
  context.resolveHordeMovement(new Map([[enemy,old],[blocker,{x:0,z:.17,angle:0}]]));
  assert.ok((context.zombieBodyContact(enemy,blocker)?.depth||0)<=.0005,'cached move cannot deepen body contact');
  assert.equal(context.blockedForTank(enemy.group.position.x,enemy.group.position.z,enemy.radius,0),false,'collision fallback must not enter terrain rejected by the original movement rule');
});

test('缓存到期及行进方向改变后重新选择路线，新减速仍按本帧距离移动',()=>{
  const enemy=cachedBody(1,0,0);let queries=0,terrainChecks=0;
  context.hordeNeighbors=()=>{queries++;return [];};context.blockedForTank=()=>{terrainChecks++;return false;};
  context.hordeLaneDetour(enemy,{x:1,z:0},.025,0,enemy.radius);
  assert.equal(queries,0);assert.equal(terrainChecks,1);
  assert.ok(Math.abs(Math.hypot(enemy.group.position.x,enemy.group.position.z)-.025)<1e-6,'cached step must preserve reduced current movement budget');
  enemy._avoidRemaining=.001;
  assert.equal(context.hordeLaneDetour(enemy,{x:1,z:0},.025,0,enemy.radius),false);assert.equal(queries,1,'expired decision recomputes');
  enemy._avoidRemaining=.16;
  assert.equal(context.hordeLaneDetour(enemy,{x:0,z:1},.025,0,enemy.radius),false);assert.equal(queries,2,'turn invalidates cached forward direction');
});

test('阈值布尔SAT与独立参考穿透深度一致，贴合边界及LOD不改变实体占位',()=>{
  assert.equal(typeof context.zombieBodiesPenetrate,'function','missing exact threshold SAT path');
  const random=randomGenerator(518370);
  for(let i=0;i<3000;i++){
    const a=makeBody(random,i*2),b=makeBody(random,i*2+1),tolerance=i%3===0?.0005:i%3===1?0:.03;
    if(i%2){b.group.position.x=a.group.position.x+random()-.5;b.group.position.z=a.group.position.z+random()-.5;}
    const expected=(bruteContact(a,b)?.depth||0)>tolerance;
    assert.equal(context.zombieBodiesPenetrate(a,b,tolerance),expected,'threshold pair '+i);
    a._crowdLod=i%4!==0;a._crowdLodState={tier:i%4};
    assert.equal(context.zombieBodiesPenetrate(a,b,tolerance),expected,'LOD collision invariance '+i);
  }
  for(const penetration of [-.0001,0,.0001,.00049,.00051,.001]){
    const a=cachedBody(1,0,0),b=cachedBody(2,.1-penetration,0),expected=(bruteContact(a,b)?.depth||0)>.0005;
    assert.equal(context.zombieBodiesPenetrate(a,b),expected,'default tolerance near contact '+penetration);
  }
  const a=cachedBody(1,0,0),b=cachedBody(2,0,0),tolerance=1/2048;
  a.collisionHull=[{x:-.5,z:-.5},{x:.5,z:-.5},{x:.5,z:.5},{x:-.5,z:.5}];
  b.collisionHull=a.collisionHull.map(v=>({...v}));
  a.radius=b.radius=a.collisionHullRadius=b.collisionHullRadius=Math.SQRT1_2;
  b.group.position.x=1-tolerance;
  assert.equal(bruteContact(a,b).depth,tolerance);
  assert.equal(context.zombieBodiesPenetrate(a,b,tolerance),false,'exact threshold permits contact, no accumulating penetration');
});

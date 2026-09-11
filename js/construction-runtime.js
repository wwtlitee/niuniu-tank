/* Worker orders own reserved resources until completion or cancellation. */
const constructionJobs = [];
let constructionSequence = 0;
function constructionPassable(x, z) {
  return friendlyCellPassable(x, z) && navigationPositionClear(cellCenter(x, z), 0.35);
}
function constructionEntranceCells() {
  if (!baseGroup?.userData.workerEntrance) return [];
  const p = baseGroup.position;
  return [-TILE * 0.5, TILE * 0.5].map((dx) => cellOf(p.x + dx, p.z + TILE * 1.5));
}
function constructionHome(target = null) {
  const candidates = constructionEntranceCells().filter(
    (c) => inMap(c.x, c.z) && constructionPassable(c.x, c.z),
  );
  if (target)
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z),
    );
  return candidates[0] || null;
}
function smoothConstructionRoute(path, position = null) {
  if (!path) return null;
  const points = path.map((c) => ({ ...cellCenter(c.x, c.z), cell: c }));
  if (position) points[0] = { x: position.x, z: position.z, cell: path[0] };
  return smoothNavigationRoute(points, 0.35).map((point) => point.cell);
}
function constructionEntrancePath(home) {
  const p = baseGroup.position;
  return [
    ...baseGroup.userData.workerEntrance.map((point) => ({
      x: p.x + point.x,
      z: p.z + point.z,
      lift: point.lift || 0,
    })),
    { ...cellCenter(home.x, home.z), lift: 0 },
  ];
}
function moveConstructionWorker(job, target, dt) {
  const p = job.worker.position,
    dx = target.x - p.x,
    dz = target.z - p.z,
    distance = Math.hypot(dx, dz),
    step = Math.min(distance, dt * 5.2);
  if (distance > 0.001) {
    const beforeGround = heightAt(p.x, p.z),
      lift = p.y - beforeGround;
    p.x += (dx / distance) * step;
    p.z += (dz / distance) * step;
    p.y = heightAt(p.x, p.z) + lift + ((target.lift || 0) - lift) * (step / distance);
    job.worker.rotation.y = Math.atan2(dx, dz);
  }
  job.walkTime = (job.walkTime || 0) + dt;
  updateConstructionWorker(job.worker, 'walk', dt);
  return distance <= step + 0.001;
}
function constructionGoals(anchor, build) {
  const [w, d] = build.footprint || [1, 1],
    goals = [];
  for (let x = anchor.x; x < anchor.x + w; x++) {
    goals.push({ x, z: anchor.z - 1 }, { x, z: anchor.z + d });
  }
  for (let z = anchor.z; z < anchor.z + d; z++) {
    goals.push({ x: anchor.x - 1, z }, { x: anchor.x + w, z });
  }
  return goals;
}
function makeConstructionSite(job) {
  const g = new THREE.Group(),
    [w, d] = job.build.footprint || [1, 1];
  const material = new THREE.MeshStandardMaterial({ color: 0x7e8990, roughness: 0.9 });
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w * TILE - 0.25, 0.16, d * TILE - 0.25),
    material,
  );
  slab.position.y = 0.08;
  g.add(slab);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w * TILE - 0.45, 2.7, d * TILE - 0.45)),
    new THREE.LineBasicMaterial({ color: 0xe8b85c }),
  );
  frame.position.y = 1.5;
  g.add(frame);
  job.frame = frame;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(w * TILE, 4), 0.3, 0.15),
    new THREE.MeshBasicMaterial({ color: 0x25313a }),
  );
  board.position.set(0, 3.3, 0);
  g.add(board);
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(w * TILE, 4) - 0.12, 0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xf1b84b }),
  );
  bar.position.set(0, 3.3, 0.04);
  bar.scale.x = 0.01;
  g.add(bar);
  job.progressBar = bar;
  job.preview = makeConstructionPreview(job);
  g.add(job.preview);
  renderer.localClippingEnabled = true;
  attachWorldHealthBar(g, 2.95, 2.6);
  const cc = footprintCenter(job.anchor, job.build);
  g.position.set(cc.x, heightAt(cc.x, cc.z), cc.z);
  g.userData.constructionId = job.id;
  return g;
}
function addConstructionJob(build, anchor, cost, path, saved) {
  const job = {
    id: ++constructionSequence,
    build,
    anchor: { ...anchor },
    cost,
    pop: build.pop || 0,
    phase: 'outbound',
    elapsed: 0,
    duration: ConstructionSystem.duration(build.id),
    route: path,
    routeIndex: 1,
    retry: 0,
    home: path[0],
    ...saved,
  };
  job.maxHp =
    build.id === 'wall'
      ? wallMaxHp(1)
      : 180 * (build.footprint?.[0] || 1) * (build.footprint?.[1] || 1);
  job.hp = Math.max(1, Math.min(job.maxHp, Number(saved?.hp) || job.maxHp));
  job.worker = makeConstructionWorker(saved?.workerVariant);
  const points = constructionEntrancePath(job.home),
    first = points[0];
  job.worker.position.set(first.x, heightAt(first.x, first.z) + first.lift, first.z);
  job.portal = saved ? saved.portal || null : { direction: 'out', points, index: 1 };
  if (saved?.position)
    job.worker.position.set(
      saved.position.x,
      heightAt(saved.position.x, saved.position.z) + (saved.position.lift || 0),
      saved.position.z,
    );
  scene.add(job.worker);
  if (job.phase !== 'returning') {
    reserveFootprint(job, footprintCells(anchor, build));
    job.site = makeConstructionSite(job);
    scene.add(job.site);
  }
  // Include this new site's footprint when checking shortcuts; saved orders replan from their current position.
  if (job.route) job.route = smoothConstructionRoute(job.route);
  job.routeRevision = navigationStamp;
  constructionJobs.push(job);
  return job;
}
function damageConstruction(job, damage) {
  if (!job || job.phase === 'returning' || !Number.isFinite(damage) || damage <= 0) return false;
  job.hp = Math.max(0, job.hp - damage);
  if (job.site) syncWorldHealthBar(job.site.userData.healthBar, job.hp, job.maxHp);
  if (job.hp <= 0) {
    releaseFootprint(job);
    game.popUsed = Math.max(0, game.popUsed - job.pop);
    constructionReturn(job);
    computeFlowField();
    updateResUI();
    toast('工地被摧毁，工程师返回基地');
  }
  return true;
}
function queueConstruction(build, anchor) {
  if (!constructionWorkersReady()) {
    toast('工程师模型尚未就绪，请稍后重试');
    return false;
  }
  if (!baseAlive || !baseGroup || !footprintPlaceable(anchor, build)) return false;
  const pending = constructionJobs.filter((j) => j.phase !== 'returning');
  const owned = {
    house: builtHouses.length,
    heroHub: heroHubs.length,
    research: researchInstitutes.length,
    factory: heavyFactories.length,
    goldmine: goldMines.length,
  };
  const limit = { heroHub:1, house: 5, research: 1, factory: 1, goldmine: mineUnlockedCount() }[build.id];
  if (limit && owned[build.id] + pending.filter((j) => j.build.id === build.id).length >= limit) {
    toast('该建筑数量已达上限（含施工中）');
    return false;
  }
  if (constructionJobs.length >= 12) {
    toast('工程队正在忙碌，请等待工人返回');
    return false;
  }
  const cost = priceOf(build),
    pop = build.pop || 0;
  if (game.gold < cost) {
    toast('金币不足');
    return false;
  }
  if (game.popUsed + pop > game.popMax) {
    toast('人口不足，请先建住房');
    return false;
  }
  const home = constructionHome(anchor);
  const blocked = new Set(footprintCells(anchor, build).map((c) => idx(c.x, c.z)));
  const path =
    home &&
    ConstructionSystem.findPath(
      home,
      constructionGoals(anchor, build),
      GRID,
      GRID,
      (x, z) => constructionPassable(x, z) && !blocked.has(idx(x, z)),
      flowCanStep,
    );
  if (!path) {
    toast('工程师无法到达工地，请保留施工通道');
    return false;
  }
  game.gold -= cost;
  game.popUsed += pop;
  addConstructionJob(build, anchor, cost, path);
  if (typeof SurvivalSoundBank !== 'undefined') SurvivalSoundBank.play('build');
  updateResUI();
  updateGoldUI();
  toast(`工程师出发 · ${build.name} · 施工 ${ConstructionSystem.duration(build.id)} 秒`);
  return true;
}
function constructionReturn(job) {
  if (job.site) {
    scene.remove(job.site);
    disposeTransientObject3D(job.site);
    job.site = null;
  }
  // A cancelled departure turns around inside the doorway, without taking a grid shortcut through the building.
  if (job.portal?.direction === 'out')
    job.portal = {
      direction: 'in',
      points: job.portal.points.slice(0, job.portal.index).reverse(),
      index: 0,
    };
  job.phase = 'returning';
  job.retry = 0;
  job.route = null;
  job.footprintCells = [];
  renderCmdCard();
}
function cancelConstruction(job) {
  if (!job || job.phase === 'returning') return false;
  releaseFootprint(job);
  game.gold += job.cost;
  game.popUsed = Math.max(0, game.popUsed - job.pop);
  constructionReturn(job);
  updateResUI();
  updateGoldUI();
  toast('施工已取消，费用已退回，工程师返回基地');
  if (typeof SurvivalSoundBank !== 'undefined') SurvivalSoundBank.play('cancel');
  return true;
}
function completeConstruction(job) {
  releaseFootprint(job);
  job.footprintCells = [];
  // The existing factory is the single owner of completed building effects.
  const selected = buildSel,
    cell = ghostCell,
    visible = ghost && ghost.visible;
  game.gold += job.cost;
  game.popUsed = Math.max(0, game.popUsed - job.pop);
  buildSel = shopList().findIndex((b) => b.id === job.build.id);
  ghostCell = { ...job.anchor };
  const oldGhost = ghost;
  if (!ghost) ghost = { visible: true };
  else ghost.visible = true;
  try {
    placeBuildingImmediately(null, null, job);
    const ci = idx(job.anchor.x, job.anchor.z),
      ratio = job.hp / job.maxHp;
    if (job.build.id === 'wall' && wallMeta.has(ci)) {
      const hp = Math.max(1, wallMaxHp(1) * ratio);
      steelHP.set(ci, hp);
      wallMeta.get(ci).hp = hp;
    } else {
      const finished = ownedStructureAtCell(ci);
      if (finished && finished.record !== job)
        finished.record.hp = Math.max(1, finished.record.maxHp * ratio);
    }
  } finally {
    buildSel = selected;
    ghostCell = cell;
    ghost = oldGhost;
    if (ghost) ghost.visible = visible;
  }
  constructionReturn(job);
}
function updateConstruction(dt) {
  if (ACTIVE_MODE.key !== 'survival' || !Number.isFinite(dt) || dt <= 0) return;
  for (let i = constructionJobs.length - 1; i >= 0; i--) {
    const job = constructionJobs[i];
    if (!baseAlive) {
      cancelConstruction(job);
      scene.remove(job.worker);
      disposeConstructionWorker(job.worker);
      constructionJobs.splice(i, 1);
      continue;
    }
    if (job.portal && job.phase !== 'building') {
      const portal = job.portal,
        target = portal.points[portal.index];
      if (
        target &&
        portal.direction === 'out' &&
        portal.index === portal.points.length - 1 &&
        !constructionPassable(job.home.x, job.home.z)
      )
        continue;
      if (target && moveConstructionWorker(job, target, dt)) portal.index++;
      if (portal.index >= portal.points.length) {
        job.portal = null;
        if (portal.direction === 'in') {
          scene.remove(job.worker);
          disposeConstructionWorker(job.worker);
          constructionJobs.splice(i, 1);
        }
      }
      continue;
    }
    const working = job.phase === 'building';
    if (working) {
      job.portal = null;
      const center = footprintCenter(job.anchor, job.build),
        position = job.worker.position;
      job.worker.rotation.y = Math.atan2(center.x - position.x, center.z - position.z);

      const done = ConstructionSystem.advance(job, dt),
        progress = job.elapsed / job.duration;
      updateConstructionStage(job);
      job.progressBar.scale.x = Math.max(0.01, progress);
      job.frame.scale.y = 0.2 + progress * 0.8;
      updateConstructionWorker(job.worker, 'work', dt, job.elapsed);
      if (done) completeConstruction(job);
      continue;
    }
    job.retry -= dt;
    if (job.routeRevision !== navigationStamp) {
      job.route = null;
      job.retry = 0;
    }
    if (!job.route) {
      if (job.retry > 0) continue;
      if (job.phase === 'returning')
        job.home =
          constructionHome(cellOf(job.worker.position.x, job.worker.position.z)) || job.home;
      const start = cellOf(job.worker.position.x, job.worker.position.z),
        goals = job.phase === 'returning' ? [job.home] : constructionGoals(job.anchor, job.build);
      job.route = smoothConstructionRoute(
        ConstructionSystem.findPath(start, goals, GRID, GRID, constructionPassable, flowCanStep),
        job.worker.position,
      );
      job.routeIndex = 1;
      job.routeRevision = navigationStamp;
      job.retry = 1;
      if (!job.route) continue;
    }
    const next = job.route[job.routeIndex];
    if (!next) {
      if (job.phase === 'returning')
        job.portal = {
          direction: 'in',
          points: constructionEntrancePath(job.home).reverse(),
          index: 0,
        };
      else {
        const c = footprintCenter(job.anchor, job.build),
          [w, d] = job.build.footprint || [1, 1],
          p = job.worker.position;
        const goal = {
          x: Math.max(c.x - (w * TILE) / 2 - 0.55, Math.min(c.x + (w * TILE) / 2 + 0.55, p.x)),
          z: Math.max(c.z - (d * TILE) / 2 - 0.55, Math.min(c.z + (d * TILE) / 2 + 0.55, p.z)),
        };
        if (moveConstructionWorker(job, goal, dt)) {
          job.phase = 'building';
          job.portal = null;
        }
      }
      continue;
    }
    if (!constructionPassable(next.x, next.z)) {
      job.route = null;
      continue;
    }
    if (moveConstructionWorker(job, cellCenter(next.x, next.z), dt)) job.routeIndex++;
  }
}
function clearConstruction() {
  for (const job of constructionJobs) {
    releaseFootprint(job);
    if (job.site) {
      scene.remove(job.site);
      disposeTransientObject3D(job.site);
    }
    scene.remove(job.worker);
    disposeConstructionWorker(job.worker);
  }
  constructionJobs.length = 0;
}
function serializeConstruction() {
  return constructionJobs.map((j) => ({
    buildId: j.build.id,
    workerVariant: j.worker.userData.variantId,
    anchor: j.anchor,
    cost: j.cost,
    hp: j.hp,
    phase: j.phase,
    elapsed: j.elapsed,
    duration: j.duration,
    home: j.home,
    portal: j.portal ? JSON.parse(JSON.stringify(j.portal)) : null,
    position: {
      x: j.worker.position.x,
      z: j.worker.position.z,
      lift: j.worker.position.y - heightAt(j.worker.position.x, j.worker.position.z),
    },
  }));
}
function restoreConstruction(data) {
  clearConstruction();
  for (const item of (Array.isArray(data) ? data : []).slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const build = shopList().find((b) => b.id === item.buildId);
    if (
      !build ||
      !item.anchor ||
      !Number.isInteger(item.anchor.x) ||
      !Number.isInteger(item.anchor.z) ||
      !inMap(item.anchor.x, item.anchor.z) ||
      !item.home ||
      !Number.isInteger(item.home.x) ||
      !Number.isInteger(item.home.z) ||
      !inMap(item.home.x, item.home.z)
    )
      continue;
    const phase = ['outbound', 'building', 'returning'].includes(item.phase)
      ? item.phase
      : 'outbound';
    if (phase !== 'returning' && !footprintPlaceable(item.anchor, build, true)) continue;
    const duration = ConstructionSystem.duration(build.id),
      elapsed = Math.max(0, Math.min(duration, Number(item.elapsed) || 0));
    const position =
      item.position && Number.isFinite(item.position.x) && Number.isFinite(item.position.z)
        ? { ...item.position, lift: Math.max(0, Math.min(0.4, Number(item.position.lift) || 0)) }
        : null;
    const home = constructionHome() || constructionEntranceCells()[0];
    if (!home) continue;
    const input = item.portal;
    const validPortal =
      input &&
      ['in', 'out'].includes(input.direction) &&
      Array.isArray(input.points) &&
      input.points.length > 0 &&
      input.points.length <= 6 &&
      Number.isInteger(input.index) &&
      input.index >= 0 &&
      input.index <= input.points.length &&
      input.points.every(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.z) &&
          Math.abs(p.x - baseGroup.position.x) <= TILE &&
          p.z - baseGroup.position.z >= 1 &&
          p.z - baseGroup.position.z <= TILE * 2 &&
          Number.isFinite(p.lift) &&
          p.lift >= 0 &&
          p.lift <= 0.4,
      );
    const portal = validPortal ? JSON.parse(JSON.stringify(input)) : null;
    addConstructionJob(build, item.anchor, Math.max(0, Number(item.cost) || 0), [home], {
      phase,
      elapsed,
      duration,
      hp: item.hp,
      workerVariant: item.workerVariant,
      home,
      position,
      portal,
      route: null,
    });
    if (phase !== 'returning') game.popUsed += build.pop || 0;
  }
}
function finishIndustrialFacade(group, kind) {
  if (!group || group.userData.handcraftedKind || group.getObjectByName('工业建筑入口')) return;
  const accents = { house: 0xc7a55f, research: 0x79bcc1, factory: 0xd49a54, goldmine: 0xb5a348 };
  if (!accents[kind]) return;
  const bounds = new THREE.Box3().setFromObject(group),
    size = bounds.getSize(new THREE.Vector3());
  const width = Math.max(1.2, Math.min(4, size.x * 0.72)),
    depth = Math.max(0.5, Math.min(1.8, size.z * 0.3));
  const entrance = new THREE.Group();
  entrance.name = '工业建筑入口';
  const concrete = new THREE.MeshStandardMaterial({ color: 0xadb2aa, roughness: 0.92 });
  const metal = new THREE.MeshStandardMaterial({
    color: accents[kind],
    roughness: 0.72,
    metalness: 0.18,
    emissive: accents[kind],
    emissiveIntensity: 0.08,
  });
  const box = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    entrance.add(mesh);
  };
  const front = Math.min(size.z * 0.48, 3);
  box(width, 0.15, depth, 0, 0.12, front, concrete);
  box(width, 0.12, 0.4, 0, Math.min(2.3, size.y * 0.68), front, metal);
  box(0.1, 1.2, 0.1, -width * 0.43, 0.8, front, metal);
  box(0.1, 1.2, 0.1, width * 0.43, 0.8, front, metal);
  const dark = new THREE.MeshStandardMaterial({
    color: 0x303c38,
    roughness: 0.76,
    metalness: 0.35,
  });
  box(width * 0.9, 0.08, 0.22, 0, 0.22, front + depth * 0.35, dark);
  for (const side of [-1, 1]) {
    box(0.28, 0.45, 0.22, side * width * 0.4, 0.47, front, dark);
    for (let i = 0; i < 3; i++)
      box(0.21, 0.035, 0.035, side * width * 0.4, 0.37 + i * 0.1, front + 0.13, metal);
    box(0.23, 0.12, 0.18, side * width * 0.34, Math.min(2.0, size.y * 0.6), front, metal);
  }
  if (kind === 'goldmine') {
    box(0.44, 0.7, 0.36, width * 0.33, 0.8, front - 0.3, dark);
    for (let i = 0; i < 4; i++)
      box(0.06, 0.055, 0.37, width * 0.18 + i * 0.1, 1.18, front - 0.3, metal);
  }
  mergeBuildingSurfaces(entrance);
  group.add(entrance);
}

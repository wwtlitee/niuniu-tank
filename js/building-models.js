function makeFortificationWall(cx, cz, level) {
  const canyon = ACTIVE_MODE.canyon;
  const root = new THREE.Group(),
    center = cellCenter(cx, cz),
    inValley = canyon && cx >= canyon.x0 && cx <= canyon.x1 && cz >= canyon.z0 && cz <= canyon.z1;
  let north = TILE * 0.5,
    south = TILE * 0.5;
  if (inValley) {
    const extent = (sign) => {
      for (let d = TILE * 0.5; d < TILE * 2; d += 0.1)
        if (heightAt(center.x, center.z + sign * d) >= PH - 0.03) return d + 0.35;
      return TILE * 0.6;
    };
    north = extent(-1);
    south = extent(1);
  }
  const floor = inValley
    ? Math.max(0, heightAt(center.x - 0.45, center.z) - 0.5)
    : heightAt(center.x, center.z);
  const height = inValley ? Math.max(0.65, PH - floor - 0.07) : 1.8;
  root.position.set(center.x, floor, center.z);
  root.userData.wallCollisionParts=[];
  const stone = new THREE.MeshStandardMaterial({ color: 0x92958e, roughness: 0.94, metalness: 0.05 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x465661, roughness: 0.6, metalness: 0.65 });
  const inset = new THREE.MeshStandardMaterial({ color: 0x202d34, roughness: 0.74, metalness: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb59b53, roughness: 0.65, metalness: 0.45 });
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xffd996,
    emissive: 0xffb647,
    emissiveIntensity: 1.3,
    roughness: 0.4,
  });
  const add = (w, h, d, x, y, z, material) => {
    // 与门板/承重构件使用同一组尺寸，不能再用一个地块代替整堵长墙。
    if(h>=.5)root.userData.wallCollisionParts.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y-h/2,maxY:y+h/2});
    const m = new THREE.Mesh(chamferedBox(w, h, d), material);
    m.position.set(x, y, z);
    root.add(m);
  };
  const span = north + south,
    mid = (south - north) / 2;
  const pier = 0.94,
    opening = span - pier * 2,
    doorHeight = height * 0.78;
  // 两端承重墩伸进山体，门体后缩，形成完整的堡垒式封口。
  for (const z of [-north + pier * 0.5, south - pier * 0.5]) {
    add(1.85, height, pier, 0, height * 0.5, z, stone);
    add(2.05, 0.16, pier + 0.18, 0, height - 0.08, z, stone);
    add(2.1, 0.2, pier + 0.22, 0, 0.1, z, inset);
    add(0.12, height * 0.55, pier * 0.52, 1.0, height * 0.48, z, steel);
    add(0.15, 0.13, 0.3, 1.075, height * 0.78, z, inset);
    add(0.04, 0.065, 0.19, 1.16, height * 0.78, z, lamp);
    for (const y of [0.35, height * 0.62]) add(0.08, 0.045, pier * 0.7, 0.96, y, z, inset);
  }
  add(1.22, 0.22, opening + 0.2, -0.1, 0.11, mid, stone);
  add(0.86, doorHeight, opening, -0.15, doorHeight * 0.5 + 0.12, mid, inset);
  for (const side of [-1, 1]) {
    const z = mid + side * opening * 0.25,
      panel = opening * 0.5 - 0.09;
    add(0.22, doorHeight - 0.16, panel, 0.36, doorHeight * 0.5 + 0.12, z, steel);
    add(0.16, 0.12, panel - 0.16, 0.54, doorHeight * 0.37, z, brass);
    add(0.12, 0.1, panel - 0.16, 0.52, doorHeight * 0.75, z, inset);
    for (const dz of [-panel * 0.38, panel * 0.38]) {
      add(0.12, doorHeight * 0.7, 0.1, 0.51, doorHeight * 0.5 + 0.13, z + dz, inset);
      for (const y of [0.33, doorHeight * 0.77]) add(0.08, 0.065, 0.065, 0.6, y, z + dz, brass);
    }
    add(0.09, 0.24, 0.08, 0.62, doorHeight * 0.53, z - side * panel * 0.35, brass);
  }
  add(1.45, 0.2, opening + 0.22, -0.15, height - 0.18, mid, steel);
  for (const side of [-1, 1]) {
    const z = mid + side * opening * 0.25;
    add(0.86, 0.1, opening * 0.5 - 0.15, -0.08, height - 0.13, z, stone);
    add(0.06, 0.035, opening * 0.5 - 0.3, 0.4, height - 0.065, z, brass);
    add(0.24, 0.09, 0.38, -0.1, height - 0.04, z, inset);
    for (const dz of [-0.16, 0.16]) add(0.15, 0.02, 0.03, -0.1, height + 0.01, z + dz, brass);
    const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, opening * 0.38, 8), inset);
    ram.rotation.x = Math.PI / 2;
    ram.position.set(-0.63, height - 0.07, z);
    root.add(ram);
  }
  for (let i = -2; i <= 2; i++) add(0.05, 0.12, 0.14, 0.5, 0.25, mid + i * 0.26, brass);
  mergeBuildingSurfaces(root); // 合并后恢复本地坐标，避免根节点平移重复应用。
  for (const m of root.children) m.geometry.translate(-center.x, -floor, -center.z);
  root.userData.assetName = 'handcrafted-cliff-wall';
  root.userData.wallVisual = 'cliff-bulkhead';
  root.userData.reinforcementLevel = level;
  root.userData.wallCell = { x: cx, z: cz };
  root.userData.wallTop = floor + height;
  root.userData.wallSpan = span;
  return root;
}
function makeGoldmineVisual() {
  const g = new THREE.Group(),
    visualRoot = new THREE.Group();
  g.add(visualRoot);
  /* 生存金矿：只保留工业套装矿井本体；收益由头顶飘字表达。 */
  let baseM = null;
  if (ACTIVE_MODE.key === 'survival' && ASSETS['industrial-building-s']) {
    baseM = placeModel(
      visualRoot,
      'industrial-building-s',
      0,
      0,
      TILE * 0.78,
      -Math.PI / 2,
      0,
      0xffffff,
      2.4,
      2.45,
    );
    if (baseM) {
      baseM.position.y = 0;
      baseM.scale.x *= 0.46;
      applyGoldMinePalette(baseM);
    }
  } else {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.5, 0.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a4a60, roughness: 0.7, metalness: 0.3 }),
    );
    base.position.y = 0.3;
    visualRoot.add(base);
  }

  g.userData.visualRoot = visualRoot;
  finishIndustrialFacade(visualRoot, 'goldmine');
  return g;
}

function makeHouseVisual() {
  const g = new THREE.Group();
  /* 人口房：与基地、研究院、重工厂共享工业建筑语言。 */
  if (ACTIVE_MODE.key === 'survival' && ASSETS['industrial-building-i']) {
    const body = placeModel(
      g,
      'industrial-building-i',
      0,
      0,
      TILE * 0.72,
      -Math.PI / 2,
      0,
      0xffffff,
      2.8,
      2.8,
    );
    if (body) body.position.y = 0;
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2, 2.8),
      new THREE.MeshStandardMaterial({ color: 0x8a6b4f, roughness: 0.85 }),
    );
    body.position.y = 1;
    g.add(body);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1.4, 4),
      new THREE.MeshStandardMaterial({ color: 0xb04a3a, roughness: 0.7 }),
    );
    roof.position.y = 2.7;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
  }
  addWarmWindow(g, -0.48, 0.95, TILE * 0.37, 0.42, 0.34, 0.08);
  addWarmWindow(g, 0.48, 0.95, TILE * 0.37, 0.42, 0.34, 0.08);

  finishIndustrialFacade(g, 'house');
  return g;
}

function makeBeaconVisual() {
  const g = new THREE.Group();
  g.userData.assetName = 'medical-watch-beacon';
  const frame = new THREE.Group();
  g.add(frame);
  const steel = new THREE.MeshStandardMaterial({ color: 0x52636a, roughness: 0.65, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x29383c, roughness: 0.8, metalness: 0.35 });
  const add = (geometry, y, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    frame.add(mesh);
    return mesh;
  };
  add(new THREE.CylinderGeometry(0.86, 1.08, 0.3, 12), 0.15, dark);
  add(new THREE.CylinderGeometry(0.32, 0.54, 3.65, 12), 2.1, steel);
  for (const y of [0.65, 1.85, 3.25])
    add(new THREE.CylinderGeometry(y < 1 ? 0.58 : 0.4, y < 1 ? 0.58 : 0.4, 0.1, 12), y, dark);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2,
      brace = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 3.25, 6), dark);
    brace.position.set(Math.cos(angle) * 0.48, 1.85, Math.sin(angle) * 0.48);
    frame.add(brace);
  }
  const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.5, 0.08), dark);
  ladder.position.set(0, 2, 0.52);
  frame.add(ladder);
  for (let i = 0; i < 11; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.12), steel);
    rung.position.set(0, 0.45 + i * 0.3, 0.58);
    frame.add(rung);
  }
  add(new THREE.CylinderGeometry(0.78, 0.58, 0.24, 12), 4.22, dark);
  const control = new THREE.Mesh(chamferedBox(0.62, 0.8, 0.32), dark);
  control.position.set(0, 0.73, 0.58);
  frame.add(control);
  for (const [w, h] of [
    [0.32, 0.07],
    [0.07, 0.32],
  ]) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), steel);
    cross.position.set(0, 0.77, 0.758);
    frame.add(cross);
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4,
      bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 6), steel);
    bolt.position.set(Math.cos(angle) * 0.87, 0.34, Math.sin(angle) * 0.87);
    frame.add(bolt);
  }
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.44, 0.78, 10),
    warmEmissiveMaterial(0xffc56a, 2.25),
  );
  lantern.position.y = 4.78;
  lantern.userData.nightGlow = true;
  g.add(lantern);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.72, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x252b30, roughness: 0.68, metalness: 0.42 }),
  );
  cap.material.dispose();
  cap.material = dark;
  cap.position.y = 5.43;
  frame.add(cap);
  const railMaterial = dark;
  for (let index = 0; index < 8; index++) {
    const angle = (index * Math.PI) / 4,
      rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), railMaterial);
    rail.position.set(Math.cos(angle) * 0.7, 4.72, Math.sin(angle) * 0.7);
    frame.add(rail);
  }
  for (const y of [4.48, 5.04]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 5, 16), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    frame.add(ring);
  }
  // Prepared during dispatch; completion adopts this exact mesh and does not rebuild the cage.
  mergeBuildingSurfaces(frame);
  frame.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = true;
    }
  });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), makeLightPoolMaterial());
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  pool.renderOrder = 3;
  pool.raycast = () => {};
  g.add(pool);

  g.userData.lantern = lantern;
  g.userData.pool = pool;
  return g;
}

/* 本项目独立制作的军用建筑，静态面按材质合并以控制绘制次数。 */
function mergeBuildingSurfaces(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const key = mesh.material.uuid;
    if (!groups.has(key)) groups.set(key, { material: mesh.material, positions: [], normals: [] });
    const item = groups.get(key),
      geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    item.positions.push(...geometry.attributes.position.array);
    item.normals.push(...geometry.attributes.normal.array);
    geometry.dispose();
    mesh.geometry.dispose();
  });
  root.clear();
  for (const item of groups.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(item.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(item.normals, 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, item.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}
function chamferedBox(w, h, d) {
  const bevel = Math.min(0.09, w * 0.12, h * 0.12, d * 0.12),
    shape = new THREE.Shape();
  shape.moveTo(-w / 2 + bevel, -h / 2 + bevel);
  shape.lineTo(w / 2 - bevel, -h / 2 + bevel);
  shape.lineTo(w / 2 - bevel, h / 2 - bevel);
  shape.lineTo(-w / 2 + bevel, h / 2 - bevel);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * bevel,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -d / 2 + bevel);
  return geometry;
}
function makeBuildingModel(kind) {
  if(kind==='factory')return makeFactoryWorkshopModel();
  if(kind==='heroHub')return makeHeroHubModel();
  if (kind === 'house') return makeHouseVisual();
  if (kind === 'goldmine') return makeGoldmineVisual();
  if (kind === 'beacon') return makeBeaconVisual();
  const root = new THREE.Group();
  root.name = { base: '自建主基地', research: '自建研究院', factory: '自建重工厂' }[kind];
  root.userData.handcraftedKind = kind;
  const mat = (color, metalness = 0.2, roughness = 0.72) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const concrete = mat(0x92978a, 0.08, 0.92),
    armor = mat(0x445958, 0.38),
    edge = mat(0xa5aca1, 0.45, 0.48),
    dark = mat(0x202b2d, 0.35),
    brass = mat(0xb99a54, 0.4),
    glass = mat(0x789f9c, 0.3, 0.32);
  glass.emissive.setHex(0x385c52);
  glass.emissiveIntensity = 0.32;
  const add = (geo, x, y, z, m) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, x, y, z, m) => add(chamferedBox(w, h, d), x, y, z, m);
  const cylinder = (r, h, x, y, z, m, n = 12) => add(new THREE.CylinderGeometry(r, r, h, n), x, y, z, m);
  const vent = (x, y, z) => {
    box(1.0, 0.35, 0.8, x, y, z, dark);
    for (let i = 0; i < 5; i++) box(0.1, 0.1, 0.72, x - 0.38 + i * 0.19, y + 0.22, z, edge);
  };
  const door = (x, z, w = 2) => {
    box(w, 2.15, 0.12, x, 1.5, z, dark);
    for (let i = 0; i < 7; i++) box(w - 0.1, 0.14, 0.15, x, 0.55 + i * 0.29, z + 0.05, armor);
    box(w + 0.3, 0.15, 0.4, x, 2.7, z + 0.12, brass);
  };
  box(7.2, 0.38, 6.5, 0, 0.19, 0, concrete);
  if (kind === 'base') {
    // An actual open vestibule: the front wall has a clear 1.9 m opening, not a door painted over a solid box.
    box(5.8, 2.2, 3.6, 0, 1.48, -0.9, armor);
    for (const side of [-1, 1]) box(1.9, 2.2, 1.35, side * 1.95, 1.48, 1.65, armor);
    box(1.98, 2.18, 0.12, 0, 1.48, 1.03, dark);
    box(2.0, 0.2, 1.55, 0, 2.54, 1.77, dark);
    for (let i = 0; i < 4; i++) box(1.87, 0.04, 0.08, 0, 2.48 + i * 0.055, 2.58, edge);
    for (const x of [-2.9, 2.9])
      for (const z of [-2.25, 2.25]) {
        box(0.68, 2.65, 0.72, x, 1.66, z, concrete);
        box(0.82, 0.18, 0.88, x, 3.08, z, edge);
      }
    box(4.4, 1.55, 3.25, -0.3, 3.35, -0.45, concrete);
    box(4.5, 0.64, 0.08, -0.3, 3.65, 1.2, glass);
    box(0.08, 0.64, 3.1, 1.94, 3.65, -0.4, glass);
    for (let i = 0; i < 6; i++) box(0.07, 0.7, 0.12, -2.4 + i * 0.8, 3.65, 1.25, edge);
    box(4.8, 0.22, 3.65, -0.3, 4.23, -0.45, armor);
    // Reinforced front jambs, canopy, rolling door cassette and two shallow treads.
    for (const side of [-1, 1]) {
      box(0.21, 2.12, 0.32, side * 1.02, 1.45, 2.51, edge);
      box(0.3, 0.15, 0.45, side * 1.06, 0.45, 2.6, dark);
      for (let i = 0; i < 3; i++) box(0.22, 0.13, 0.07, side * 1.025, 0.7 + i * 0.28, 2.7, brass);
      box(0.32, 0.44, 0.08, side * 1.53, 1.53, 2.39, dark);
      box(0.16, 0.2, 0.04, side * 1.53, 1.58, 2.45, glass);
    }
    box(3.05, 0.24, 0.88, 0, 2.72, 2.61, armor);
    box(2.94, 0.055, 0.16, 0, 2.62, 3.04, brass);
    box(2.6, 0.24, 0.65, 0, 0.12, 3.48, concrete);
    box(2.85, 0.11, 0.36, 0, 0.055, 3.98, dark);
    for (let i = 0; i < 9; i++) box(0.025, 0.012, 0.56, -1.05 + i * 0.26, 0.247, 3.46, edge);
    for (const side of [-1, 1]) box(0.075, 0.32, 0.1, side * 1.44, 0.26, 3.9, brass);
    root.userData.workerEntrance = [
      { x: 0, z: 1.38, lift: 0.38 },
      { x: 0, z: 2.74, lift: 0.38 },
      { x: 0, z: 3.48, lift: 0.24 },
      { x: 0, z: 4.18, lift: 0 },
    ];
    // Recessed roof hatch and standing seams, service access, protected equipment.
    box(1.38, 0.09, 1.38, -0.1, 4.4, -0.5, dark);
    box(1.2, 0.06, 1.2, -0.1, 4.46, -0.5, edge);
    for (let i = 0; i < 5; i++) box(0.032, 0.04, 3.2, -2.25 + i * 1.0, 4.36, -0.45, edge);
    for (const side of [-1, 1]) {
      box(0.13, 0.25, 3.7, -0.3 + side * 2.35, 4.44, -0.45, edge);
      box(0.27, 0.7, 0.07, side * 2.05, 1.43, 2.42, dark);
    }
    vent(-1.7, 4.48, -0.85);
    cylinder(0.08, 2.0, 1.35, 5.25, -1.15, edge, 8);
    const dish = add(
      new THREE.SphereGeometry(0.72, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.48),
      1.35,
      6.1,
      -1.15,
      armor,
    );
    dish.rotation.z = -0.65;
    cylinder(0.08, 0.9, 1.35, 6.25, -1.15, brass, 8);
  } else if (kind === 'research') {
    box(6.4, 2.35, 4.8, 0, 1.55, 0, concrete);
    for (const x of [-2.25, 2.25]) {
      box(1.4, 1.4, 4.95, x, 3.25, 0, armor);
      box(1.25, 0.45, 0.1, x, 3.55, 2.5, glass);
      vent(x, 4.12, -1.45);
    }
    cylinder(1.58, 1.4, 0, 3.45, -0.3, armor, 12);
    cylinder(1.76, 0.18, 0, 4.16, -0.3, edge, 12);
    add(new THREE.SphereGeometry(1.48, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 4.24, -0.3, glass);
    for (const angle of [0, Math.PI / 2]) {
      const ring = add(new THREE.TorusGeometry(1.51, 0.065, 5, 24, Math.PI), 0, 4.24, -0.3, brass);
      ring.rotation.y = angle;
    }
    door(0, 2.46, 1.7);
    for (const x of [-2.4, 2.4]) box(1.1, 0.58, 0.08, x, 1.95, 2.46, glass);
    cylinder(0.055, 1.25, -2.6, 4.6, -1.8, edge, 8);
    cylinder(0.16, 0.14, -2.6, 5.22, -1.8, brass, 8);
    // Lab containment ribs and roof service piping distinguish it from the command building.
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      box(0.08, 0.8, 0.08, Math.cos(a) * 1.63, 3.62, -0.3 + Math.sin(a) * 1.63, edge);
    }
    for (const side of [-1, 1]) {
      box(1.24, 0.1, 4.65, side * 2.25, 4.05, 0, edge);
      cylinder(0.12, 2.0, side * 3.1, 2.3, -1.85, brass, 10);
      for (let i = 0; i < 3; i++) {
        box(1.18, 0.12, 0.14, side * 2.26, 3.05 + i * 0.22, 2.6, edge);
        box(0.04, 0.8, 0.12, side * 2.7, 1.67, 2.5, armor);
      }
    }
  } else if (kind === 'factory') {
    box(6.6, 2.95, 5.7, 0, 1.9, 0, armor);
    for (const x of [-2.2, 0, 2.2]) {
      const shape = new THREE.Shape();
      shape.moveTo(-1.1, 0);
      shape.lineTo(1.1, 0);
      shape.lineTo(1.1, 0.25);
      shape.lineTo(-1.1, 1.0);
      shape.closePath();
      add(new THREE.ExtrudeGeometry(shape, { depth: 5.85, bevelEnabled: false }), x, 3.38, -2.925, edge);
      box(0.08, 0.5, 5.5, x - 1.1, 3.95, 0, glass);
    }
    door(-1.68, 2.9, 2.5);
    door(1.68, 2.9, 2.5);
    box(6.8, 0.22, 0.9, 0, 3.0, 3.0, dark);
    for (const x of [-3.1, -0.2, 0.2, 3.1]) {
      box(0.13, 2.45, 0.17, x, 1.6, 3.02, brass);
      for (let i = 0; i < 4; i++) box(0.16, 0.12, 0.2, x, 0.8 + i * 0.48, 3.04, dark);
    }
    for (const z of [-1.65, -0.5]) {
      cylinder(0.23, 3.5, -3, 4.0, z, dark);
      cylinder(0.34, 0.18, -3, 5.73, z, edge);
    }
    vent(2.15, 4.5, -1.7);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) box(0.07, 0.13, 0.45, side * 3.39, 2.8, -2.3 + i * 0.9, edge);
      box(0.18, 0.15, 5.6, side * 3.38, 3.05, 0, brass);
    }
    // Overhead crane rail, folded hoist and loading apron markings.
    box(5.85, 0.24, 0.2, 0, 3.45, 3.05, brass);
    box(0.5, 0.32, 0.47, 0.65, 3.4, 3.05, dark);
    cylinder(0.03, 0.7, 0.65, 2.95, 3.1, edge, 6);
    for (const x of [-2.6, -0.8, 0.8, 2.6]) box(0.2, 0.025, 0.7, x, 0.395, 2.85, brass);
    for (let i = 0; i < 7; i++) box(0.05, 0.05, 5.55, -3.05 + i * 1.03, 4.04, 0, dark);
  }
  // 接缝、门灯、铆钉与侧面通风板使用既有材质合批，细化不增加材质批次。
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      box(0.1, 1.35, 0.1, side * 3.24, 1.45, -2 + i * 0.85, edge);
      box(0.13, 0.13, 0.13, side * 3.3, 2.3, -2 + i * 0.85, brass);
    }
    for (let i = 0; i < 6; i++) box(0.1, 0.08, 1.2, side * 3.31, 0.75 + i * 0.19, -0.5, dark);
  }
  for (const x of [-2.7, 2.7]) {
    box(0.42, 0.26, 0.28, x, 2.8, 2.95, dark);
    box(0.31, 0.12, 0.04, x, 2.78, 3.11, brass);
  }
  mergeBuildingSurfaces(root);
  addBuildingIdentification(root, kind);
  return root;
}
const buildingIdentificationTextures = new Map();
function addBuildingIdentification(root, kind) {
  const label = {
    base: ['OUTPOST', 'HQ / 01'],
    research: ['CONTAINMENT', 'LAB / 02'],
    factory: ['ENGINEERING', 'WRK / 03'],
  }[kind];
  if (!label) return;
  let texture = buildingIdentificationTextures.get(kind);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#303d3d';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#c5ccb9';
    ctx.font = '600 18px Arial';
    ctx.fillText(label[0], 24, 29);
    ctx.font = 'bold 59px Arial';
    ctx.fillText(label[1], 20, 96);
    ctx.fillStyle = '#a4894e';
    ctx.fillRect(460, 18, 26, 88);
    ctx.fillStyle = '#293637';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(460, 28 + i * 23);
      ctx.lineTo(486, 14 + i * 23);
      ctx.lineTo(486, 23 + i * 23);
      ctx.lineTo(460, 37 + i * 23);
      ctx.fill();
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    buildingIdentificationTextures.set(kind, texture);
  }
  const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xc2c7b9 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(kind === 'base' ? 1.7 : 1.5, 0.425), material);
  sign.position.set(
    kind === 'base' ? 0 : kind === 'research' ? -2.25 : 0,
    kind === 'base' ? 2.88 : kind === 'research' ? 3.36 : 3.15,
    kind === 'base' ? 3.066 : kind === 'research' ? 2.63 : 3.47,
  );
  sign.name = '建筑蚀刻铭牌';
  root.add(sign);
}
function takeConstructionModel(job, create) {
  const model = job?.preview;
  if (!model) return create();
  if (model.parent) model.parent.remove(model);
  model.visible = true;
  model.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.clippingPlanes = null;
      material.clipShadows = false;
      material.needsUpdate = true;
    }
  });
  job.preview = null;
  return model;
}
function makeConstructionPreview(job) {
  let model;
  if (job.build.kind === 'wall') {
    const holder = new THREE.Group();
    model = buildWallTile(holder, job.anchor.x, job.anchor.z, 1);
    holder.remove(model);
    const center = footprintCenter(job.anchor, job.build);
    model.position.sub(new THREE.Vector3(center.x, heightAt(center.x, center.z), center.z));
    const health = model.getObjectByName('damage-health-bar');
    if (health) {
      model.remove(health);
      disposeTransientObject3D(health);
    }
  } else if (job.build.kind === 'turret') model = makeTurretMesh(job.build.turret || 'turret');
  else model = makeBuildingModel(job.build.id);
  model.visible = false;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  job.previewBottom = bounds.min.y;
  job.previewHeight = Math.max(0.1, bounds.max.y - bounds.min.y);
  job.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  model.traverse((object) => {
    if (!object.isMesh) return;
    const clone = (source) => {
      const m = source.clone();
      m.clippingPlanes = [job.clipPlane];
      m.clipShadows = true;
      return m;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  return model;
}
function updateConstructionStage(job) {
  job.stage = Math.min(3, Math.max(0, Math.floor((job.elapsed / job.duration) * 3)));
  job.preview.visible = job.stage > 0;
  job.clipPlane.constant = job.site.position.y + job.previewBottom + (job.previewHeight * job.stage) / 3;
}
function aimTurretAt(group, target, dt) {
  const yaw = group.userData.turret,
    pitch = yaw?.userData.pitchPivot;
  if (!yaw || !pitch) return;
  const pivot = pitch.getWorldPosition(new THREE.Vector3()),
    dx = target.x - pivot.x,
    dz = target.z - pivot.z;
  const turn = Math.min(1, dt * 7);
  yaw.rotation.y += shortAngle(Math.atan2(dx, dz) - yaw.rotation.y) * turn;
  // 炮口位于俯仰轴前方，轴到目标和炮口到目标具有同一直线。
  pitch.rotation.x += (-Math.atan2(target.y - pivot.y, Math.hypot(dx, dz)) - pitch.rotation.x) * turn;
  const muzzle = yaw.userData.muzzleMarker.getWorldPosition(new THREE.Vector3());
  const forward = pitch.getWorldDirection(new THREE.Vector3());
  yaw.userData.aimReady = forward.dot(target.clone().sub(muzzle).normalize()) > 0.995;
}

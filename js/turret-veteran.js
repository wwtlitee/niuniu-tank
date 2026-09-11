/* Level-five visual promotion. Weapon stats and building footprints stay in the game rules. */
function promoteVeteranTurret(group, key) {
  if (group.userData.turretVisualTier === 'veteran') return;
  const yaw = group.userData.turret;
  for (const child of [...yaw.children]) {
    yaw.remove(child);
    disposeTransientObject3D(child);
  }
  const color = TURRET_TYPES[key].color;
  const mat = (c, metal = 0.6) =>
    new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: 0.42 });
  const armor = mat(color),
    dark = mat(0x202c33),
    steel = mat(0x87999e, 0.78),
    trim = mat(0xcfb770),
    glow = warmEmissiveMaterial(key === 'emp' ? 0x62ffdc : 0xffc176, 1.5);
  const parts = new THREE.Group(),
    foot = new THREE.Group();
  const add = (root, geometry, m, x, y, z) => {
    const o = new THREE.Mesh(geometry, m);
    o.position.set(x, y, z);
    root.add(o);
    return o;
  };
  const box = (root, w, h, d, x, y, z, m) => add(root, chamferedBox(w, h, d), m, x, y, z);
  const barrel = (r, len, x, y, z, m) => {
    const o = add(parts, new THREE.CylinderGeometry(r, r, len, 12), m, x, y, z);
    o.rotation.x = Math.PI / 2;
    return o;
  };
  const ring = (r, t, x, y, z, m) => add(parts, new THREE.TorusGeometry(r, t, 6, 16), m, x, y, z);
  add(foot, new THREE.CylinderGeometry(2.05, 2.3, 0.3, 8), dark, 0, 0.15, 0);
  for (const side of [-1, 1])
    for (const end of [-1, 1]) {
      box(foot, 0.7, 0.42, 1.35, side * 1.98, 0.3, end * 1.18, steel);
      box(foot, 0.46, 0.07, 0.82, side * 1.98, 0.55, end * 1.18, trim);
    }
  mergeBuildingSurfaces(foot);
  group.add(foot);
  const oldBase = group.userData.base;
  oldBase.scale.set(1.22, 1, 1.22);
  const height = 0.48;
  box(parts, 2.2, 0.84, 1.75, 0, 0.38, -0.15, armor);
  box(parts, 1.5, 0.17, 1.25, 0, 0.87, -0.26, steel);
  for (const side of [-1, 1]) {
    const cheek = box(parts, 0.35, 0.78, 1.48, side * 1.1, 0.32, 0.2, armor);
    cheek.rotation.z = -side * 0.17;
    box(parts, 0.36, 0.13, 1.22, side * 1.16, 0.58, 0.2, trim);
    for (let i = 0; i < 5; i++)
      box(parts, 0.08, 0.34, 0.075, side * 1.29, 0.27, -0.45 + i * 0.21, dark);
    box(parts, 0.13, 0.12, 0.38, side * 0.72, 0.99, -0.25, glow);
  }
  let muzzleZ;
  if (key === 'rapid') {
    barrel(0.46, 1.2, 0, height, 0.9, steel);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3,
        x = Math.cos(a) * 0.29,
        y = height + Math.sin(a) * 0.29;
      barrel(0.085, 2.6, x, y, 2.55, dark);
      ring(0.11, 0.035, x, y, 3.88, steel);
    }
    for (const z of [1.6, 3.25]) ring(0.48, 0.095, 0, height, z, steel);
    for (const side of [-1, 1]) {
      const drum = add(
        parts,
        new THREE.CylinderGeometry(0.48, 0.48, 0.6, 12),
        dark,
        side * 1.3,
        0.25,
        -0.25,
      );
      drum.rotation.z = Math.PI / 2;
    }
    muzzleZ = 3.94;
  } else if (key === 'cannon') {
    barrel(0.4, 2.4, 0, height, 1.75, dark);
    barrel(0.51, 0.7, 0, height, 3.12, steel);
    ring(0.5, 0.11, 0, height, 3.52, dark);
    for (const side of [-1, 1]) {
      barrel(0.12, 1.8, side * 0.65, 0.2, 0.95, steel);
      box(parts, 0.4, 0.5, 0.6, side * 0.76, 0.3, -0.85, dark);
    }
    box(parts, 1.32, 0.3, 0.8, 0, 0.87, -0.72, armor);
    muzzleZ = 3.66;
  } else if (key === 'antitank') {
    barrel(0.15, 4.5, 0, height, 2.7, dark);
    for (const side of [-1, 1]) {
      box(parts, 0.19, 0.32, 3.9, side * 0.29, height, 2.62, steel);
      for (let i = 0; i < 4; i++)
        box(parts, 0.1, 0.15, 0.42, side * 0.4, height, 1.15 + i * 0.82, glow);
    }
    box(parts, 0.91, 0.48, 0.32, 0, height, 4.95, steel);
    box(parts, 0.25, 0.27, 0.04, 0, height, 5.13, dark);
    box(parts, 0.5, 0.33, 0.66, 0.55, 1.04, 0.2, dark);
    box(parts, 0.32, 0.18, 0.03, 0.55, 1.06, 0.55, glow);
    muzzleZ = 5.17;
  } else {
    barrel(0.52, 2.65, 0, height, 1.58, dark);
    for (const z of [0.58, 1.25, 1.92, 2.59]) ring(0.57, 0.085, 0, height, z, steel);
    for (const side of [-1, 1]) {
      box(parts, 0.24, 0.6, 2.8, side * 0.67, height, 1.6, armor);
      for (let i = 0; i < 6; i++)
        box(parts, 0.31, 0.75, 0.08, side * 0.7, height, 0.5 + i * 0.39, steel);
      box(parts, 0.12, 0.15, 2.05, side * 0.83, 0.7, 1.55, glow);
    }
    ring(0.55, 0.12, 0, height, 3.0, steel);
    add(parts, new THREE.CircleGeometry(0.42, 24), glow, 0, height, 3.025);
    muzzleZ = 3.08;
  }
  // Bake only static parts before attaching them to the rotating, pitching weapon.
  mergeBuildingSurfaces(parts);
  const pitch = new THREE.Group();
  pitch.name = '重型炮管俯仰轴';
  pitch.position.y = height;
  parts.position.y = -height;
  pitch.add(parts);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, muzzleZ);
  pitch.add(muzzle);
  yaw.add(pitch);
  yaw.userData.pitchPivot = pitch;
  yaw.userData.muzzleMarker = muzzle;
  yaw.userData.weaponKind = key;
  group.userData.turretVisualTier = 'veteran';
}

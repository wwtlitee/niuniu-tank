/* 经典巷战独立循环。禁止加载 engine.js / survival-* 。 */
"use strict";
(function (root) {
  if (typeof THREE === "undefined") return;

  const C = root.ClassicConfig;
  const R = root.ClassicRules;
  const U = root.ClassicUpgrades;
  const audio = root.ClassicAudio.create();
  const T = C.T;
  const TILE = C.TILE;
  const GRID = C.GRID;

  const STATE = { PLAYING: 1, UPGRADE: 2, PAUSED: 3, OVER: 4 };
  let state = STATE.PLAYING;
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };
  let grid = [];
  let tileMeshes = [];
  let decoded = null;
  let player = null;
  const enemies = [];
  const bullets = [];
  const powerups = [];
  let firedShots=0;
  let eagle = { hp: C.eagleHp, maxHp: C.eagleHp, group: null };
  let mapGroup = null;
  let lastT = 0;
  let respawnIn=0;
  const aimRay=new THREE.Raycaster(),aimPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),aimPoint=new THREE.Vector3();
  const shotGeo=new THREE.SphereGeometry(.18,8,6);
  const shotMaterials=[new THREE.MeshBasicMaterial({color:0xffe5a4}),new THREE.MeshBasicMaterial({color:0xee804b})];
  const game = {
    time: 0,
    wave: 0, score: 0, lives: C.playerLives, enemiesToSpawn: 0, spawnTimer: 0, bombs: 0,
    owned: {}, steelShell: false, repairShell: 0, baseShieldHP: 0,
    stats: { dmg: 1, fireRate: 1, moveSpeed: 1, bulletSpeed: 1, pierce: 0, blastRadius: 0, multishot: 0, luckyLv: 0, armorMax: 5, autoTurretLv: 0, baseShieldMax: 0 },
    buffs: { rapidUntil: 0, shieldUntil: 0, shovelUntil: 0 },
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(root.innerWidth, root.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;
  renderer.setClearColor(0x243044, 1);
  const canvasHost = document.getElementById("game") || document.body;
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const effects=root.ClassicFeedback.createEffects(scene);
  scene.background = new THREE.Color(0x343b39);
  const camera = new THREE.PerspectiveCamera(50, root.innerWidth / Math.max(1, root.innerHeight), 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x2a3848, 0.95));
  scene.add(new THREE.AmbientLight(0x4a5568, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.05);
  sun.position.set(35, 60, -25); scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:140});
  sun.shadow.bias=-.0008;

  function applyLockedCamera() {
    const pose = R.applyCameraInput({ input: { wasd: true, wheel: 1, arrows: true } });
    camera.aspect = root.innerWidth / Math.max(1, root.innerHeight);
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    const framing=Math.max(1.18,1.55/camera.aspect);
    camera.position.multiplyScalar(framing);
    camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    return pose;
  }

  function makeTank(bodyColor, turretColor, scale) {
    const g = new THREE.Group();
    const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.15 });
    const trackMat = M(0x1b2126, 0.95, 0.05), bodyMat = M(bodyColor, 0.5, 0.35), turMat = M(turretColor, 0.45, 0.4);
    [-1, 1].forEach((s) => {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.74, 3.5), trackMat);
      tr.position.set(s * 1.06, 0.44, 0); tr.castShadow = true; g.add(tr);
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.6, 3.1), bodyMat);
    body.position.y = 1.12; body.castShadow = true; g.add(body);
    const turret = new THREE.Group();
    // Restore the P2 tank's fenders, wheels, sloped armour and exhausts.
    const dark=M(new THREE.Color(bodyColor).multiplyScalar(.62));
    for(const s of [-1,1]){
      const fender=new THREE.Mesh(new THREE.BoxGeometry(.8,.1,3.62),dark);fender.position.set(s*1.06,.86,0);g.add(fender);
      for(let i=0;i<4;i++){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.7,10),trackMat);wheel.rotation.z=Math.PI/2;wheel.position.set(s*1.06,.38,-1.26+i*.84);g.add(wheel);}
    }
    const glacis=new THREE.Mesh(new THREE.BoxGeometry(1.56,.16,1.4),dark);glacis.position.set(0,1.3,-1.3);glacis.rotation.x=-.42;g.add(glacis);
    for(const x of [-.45,.45]){const exhaust=new THREE.Mesh(new THREE.BoxGeometry(.26,.28,.5),trackMat);exhaust.position.set(x,1.26,1.42);g.add(exhaust);}
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.92, 0.54, 10), turMat);
    shell.position.y = 0.3; turret.add(shell);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.0, 10), turMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.3, -1.9); turret.add(barrel);
    turret.position.y = 1.5; g.add(turret);
    const hatch=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.1,8),dark);hatch.position.set(-.25,.6,.3);turret.add(hatch);
    const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.3,10),trackMat);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.3,-2.72);turret.add(muzzle);
    g.userData.turret = turret;
    g.scale.setScalar(scale || 1);
    return g;
  }

  function tileColor(tile) {
    if (tile === T.BRICK) return 0xb85c38;
    if (tile === T.STEEL) return 0x8a96a8;
    if (tile === T.WATER) return 0x2a6aa0;
    if (tile === T.TREE) return 0x2f7a3a;
    if (tile === T.BASE) return 0xe8c547;
    return 0x243040;
  }

  function rebuildTile(col, row) {
    const index = row * GRID + col;
    if (tileMeshes[index]) { mapGroup.remove(tileMeshes[index]);root.ClassicVisuals.dispose(tileMeshes[index]); tileMeshes[index] = null; }
    const tile = grid[row][col];
    if (tile === T.EMPTY) return;
    const c = R.cellCenter(col, row);
    if([T.BASE,T.BRICK,T.STEEL].includes(tile)){
      const built=tile===T.BASE?root.ClassicFeedback.eagleBase():root.ClassicFeedback.obstacle(tile===T.STEEL,col+row);
      built.position.set(c.x,0,c.z);mapGroup.add(built);tileMeshes[index]=built;if(tile===T.BASE)eagle.group=built;return;
    }
    let mesh;
    if (tile === T.TREE) {
      mesh = new THREE.Mesh(new THREE.ConeGeometry(TILE * 0.35, 2.4, 8), new THREE.MeshBasicMaterial({ color: tileColor(tile) }));
      mesh.position.set(c.x, 1.2, c.z);
    } else if (tile === T.WATER) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.96, 0.35, TILE * 0.96), new THREE.MeshBasicMaterial({ color: tileColor(tile) }));
      mesh.position.set(c.x, 0.1, c.z);
    } else if (tile === T.BASE) {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.7, 1.6, TILE * 0.7), new THREE.MeshBasicMaterial({ color: 0xe8c547 }));
      body.position.y = 0.9;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      flag.position.y = 2.1;
      mesh.add(body, flag);
      mesh.position.set(c.x, 0, c.z);
      eagle.group = mesh;
    } else {
      const h = tile === T.STEEL ? 1.8 : 1.35;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.94, h, TILE * 0.94), new THREE.MeshBasicMaterial({ color: tileColor(tile) }));
      mesh.position.set(c.x, h / 2, c.z);
      mesh.castShadow = true;
    }
    const assetKey=({[T.BRICK]:'brick',[T.STEEL]:'steel',[T.TREE]:'tree',[T.BASE]:'base'})[tile];
    const dressing=assetKey&&root.ClassicVisuals.model(assetKey,TILE*.92,tile===T.TREE?3.1:tile===T.BASE?2.6:1.8,TILE*.92);
    if(dressing){root.ClassicVisuals.dispose(mesh);mesh=dressing;mesh.position.set(c.x,0,c.z);if(tile===T.BASE)eagle.group=mesh;}
    if(dressing&&(tile===T.BRICK||tile===T.STEEL)){
      const beside=[col-1,col+1].some(x=>R.inMap(x,row)&&[T.BRICK,T.STEEL].includes(grid[row][x]));
      mesh.rotation.y=beside?Math.PI/2:0;
    }
    mesh.receiveShadow = true;
    mapGroup.add(mesh);
    tileMeshes[index] = mesh;
  }

  function buildMap(layout) {
    if (mapGroup) {scene.remove(mapGroup);root.ClassicVisuals.dispose(mapGroup);}
    mapGroup = new THREE.Group();
    scene.add(mapGroup);
    decoded = R.decodeMap(layout);
    grid = decoded.tiles.map((row) => row.slice());
    tileMeshes = new Array(GRID * GRID);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(C.MAP_SIZE + 40, C.MAP_SIZE + 40), new THREE.MeshStandardMaterial({ color: 0x454c42,roughness:1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.04; mapGroup.add(ground);
    ground.position.y=-.3;ground.receiveShadow=true;
    root.ClassicVisuals.dress(mapGroup,C);
    for (let row = 0; row < GRID; row++) for (let col = 0; col < GRID; col++) rebuildTile(col, row);
    applyShell();
  }

  function applyShell() {
    decoded.shell.forEach(([row, col]) => {
      if (!R.inMap(col, row) || grid[row][col] === T.BASE) return;
      grid[row][col] = game.steelShell ? T.STEEL : T.BRICK;
      rebuildTile(col, row);
    });
  }

  function blockedAt(x, z, radius) {
    const min = R.cellOf(x - radius, z - radius), max = R.cellOf(x + radius, z + radius);
    for (let row = min.row; row <= max.row; row++) for (let col = min.col; col <= max.col; col++) {
      if (!R.inMap(col, row)) return true;
      if (R.blocksTank(grid[row][col])) {
        const c = R.cellCenter(col, row);
        if (Math.abs(x - c.x) < TILE / 2 + radius * 0.55 && Math.abs(z - c.z) < TILE / 2 + radius * 0.55) return true;
      }
    }
    return false;
  }

  function spawnPlayer() {
    if (player && player.group) {scene.remove(player.group);root.ClassicVisuals.dispose(player.group);}
    const group = makeTank(0x3f8f46, 0x57b564, 1);
    const c = R.cellCenter(decoded.playerSpawn.col, decoded.playerSpawn.row);
    group.position.set(c.x, 0, c.z);
    scene.add(group);
    player = { group, hp: game.stats.armorMax, maxHp: game.stats.armorMax, speed: 11, cd: 0, heading: Math.PI, aim: Math.PI, radius: 1.35, alive: true, invulnUntil: game.time + 1800 };
  }

  function shootFrom(owner, origin, dir, dmg, opts) {
    if(opts.player)audio.play('shoot');
    firedShots++;
    const speed = (opts.player ? 34 * game.stats.bulletSpeed : 22);
    const mesh = new THREE.Mesh(shotGeo,shotMaterials[opts.player?0:1]);
    const p = origin.clone().addScaledVector(dir, 2.1);
    p.y = 1.55;
    mesh.position.copy(p);
    scene.add(mesh);
    bullets.push({ mesh, vel: dir.clone().multiplyScalar(speed), dmg, owner: opts.player ? "player" : "enemy", life: 2.4, pierceLeft: opts.player ? game.stats.pierce : 0, blast: opts.player ? game.stats.blastRadius : 0, hitSet: new Set() });
  }

  function spawnEnemy(typeId) {
    const spec = C.ENEMY_TYPES[typeId] || C.ENEMY_TYPES.normal;
    const col = decoded.spawnCols[enemies.length % decoded.spawnCols.length];
    const group = makeTank(spec.color, spec.turret, spec.scale);
    const c = R.cellCenter(col, 0);
    group.position.set(c.x + (Math.random() - 0.5) * 0.4, 0, c.z);
    scene.add(group);
    enemies.push({ group, type: spec.id, hp: spec.hp, maxHp: spec.hp, speed: spec.speed, dmg: spec.dmg, fireCd: spec.fireCd, cd: 0.6 + Math.random(), radius: 1.25 * spec.scale, alive: true, score: spec.score });
  }

  function startWave(n) {
    audio.setMode('playing');
    game.wave = n;
    const wave = R.composeWave(n);
    game.enemiesToSpawn = wave.count;
    game._waveTypes = wave.types;
    game.spawnTimer = 0.2;
    if (game.stats.baseShieldMax) game.baseShieldHP = game.stats.baseShieldMax;
    if (game.repairShell) applyShell();
    hud();
  }

  function killEnemy(e,allowDrop=true) {
    if (!e.alive) return;
    effects.emit(e.group.position.clone().setY(1.2),'destroy');
    audio.play('explode');
    e.alive = false;
    scene.remove(e.group);
    root.ClassicVisuals.dispose(e.group);
    game.score += e.score;
    const drop = R.dropPickupRoll(Math.random(), game.stats.luckyLv);
    if (drop&&allowDrop) spawnPickup(e.group.position, drop);
  }

  function spawnPickup(pos, key) {
    const colors = { star: 0xffd75e, shovel: 0x8a96a8, bomb: 0xff5d5d, life: 0x39d98a };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshBasicMaterial({ color: colors[key] }));
    mesh.position.set(pos.x, 1.1, pos.z);
    scene.add(mesh);
    powerups.push({ mesh, key, life: 12 });
  }

  function applyPickup(key) {
    audio.play('pickup');
    if (key === "star") game.buffs.rapidUntil = game.time + 8000;
    else if (key === "shovel") { game.buffs.shovelUntil = game.time + 12000; game.steelShell = true; applyShell(); }
    else if (key === "bomb") { enemies.forEach(e=>killEnemy(e,false)); }
    else if (key === "life") game.lives += 1;
    hud();
  }

  function damageEagle(amount) {
    if (game.baseShieldHP > 0) { game.baseShieldHP -= 1; return; }
    eagle.hp -= amount;
    if (eagle.hp <= 0) { eagle.hp = 0;effects.emit(eagle.group.position.clone().setY(1),'destroy');eagle.group.visible=false; lose("eagle"); }
    hud();
  }

  function lose(reason) {
    if(state===STATE.OVER)return;
    state = STATE.OVER;
    audio.setMode('over');
    const el = document.getElementById("classicOver");
    if (el) {
      el.classList.remove("hidden");
      const t = document.getElementById("classicOverText");
      if (t) t.textContent = reason === "eagle" ? "老鹰被摧毁" : "坦克全灭";
      const s = document.getElementById("classicOverScore");
      if (s) s.textContent = "得分 " + game.score + " · 波次 " + game.wave;
    }
  }

  function playerDie() {
    if(!player.alive)return;
    audio.play('explode');audio.setMoving(false);
    effects.emit(player.group.position.clone().setY(1.2),'destroy');
    player.alive = false;
    scene.remove(player.group);
    game.lives -= 1;
    const lost = R.loseState({ eagleHp: eagle.hp, lives: game.lives });
    if (lost.lost) lose(lost.reason);
    else respawnIn=.9;
    hud();
  }

  function hud() {
    const set = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = v; };
    set("classicWave", "WAVE " + game.wave);
    set("classicRemaining","敌军 "+(game.enemiesToSpawn+enemies.filter(e=>e.alive).length));
    set("classicLives", "命 " + game.lives);
    set("classicScore", "分 " + game.score);
    set("classicEagle", "老鹰 " + Math.max(0, eagle.hp) + " / " + eagle.maxHp);
    set("classicHp", player && player.alive ? ("装甲 " + Math.ceil(player.hp) + " / " + player.maxHp) : "装甲 —");
    const bar = document.getElementById("classicHpBar");
    if (bar && player) bar.style.width = Math.max(0, (player.hp / player.maxHp) * 100) + "%";
  }

  function showCards() {
    state = STATE.UPGRADE;
    audio.setMode('upgrade');
    bullets.splice(0).forEach(b=>scene.remove(b.mesh));
    if(player&&!player.alive&&game.lives>0){respawnIn=0;spawnPlayer();}
    const wrap = document.getElementById("classicCards");
    const overlay = document.getElementById("classicUpgrade");
    if (!wrap || !overlay) { startWave(game.wave + 1); state = STATE.PLAYING; return; }
    wrap.innerHTML = "";
    U.pickThree(game.owned).forEach((card) => {
      const div = document.createElement("button");
      div.className = "classicCard";
      div.innerHTML = "<div class='ci'>" + card.icon + "</div><div class='cn'>" + card.name + "</div><div class='cd'>" + card.desc + "</div>";
      div.onclick = () => {
        game.player = player;
        U.applyCard(card.id, game.stats, game);
        if (card.id === "armor" && player && player.alive) { player.maxHp = game.stats.armorMax; player.hp = player.maxHp; }
        if (card.id === "baseRepair" || card.id === "baseWall") applyShell();
        overlay.classList.add("hidden");
        state = STATE.PLAYING;
        startWave(game.wave + 1);
      };
      wrap.appendChild(div);
    });
    overlay.classList.remove("hidden");
  }

  function updatePlayer(dt, now) {
    if (!player || !player.alive) {audio.setMoving(false);return;}
    const g = player.group;
    const oldX=g.position.x,oldZ=g.position.z;
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (mx || mz) {
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      const spd = player.speed * game.stats.moveSpeed * dt;
      const nx = g.position.x + mx * spd, nz = g.position.z + mz * spd;
      if (!blockedAt(nx, g.position.z, player.radius)) g.position.x = nx;
      if (!blockedAt(g.position.x, nz, player.radius)) g.position.z = nz;
      player.heading = Math.atan2(mx, mz) + Math.PI;
      g.rotation.y += shortAngle(player.heading - g.rotation.y) * Math.min(1, dt * 12);
    }
    audio.setMoving(Math.hypot(g.position.x-oldX,g.position.z-oldZ)>.001);
    const ndc = { x: (mouse.x / innerWidth) * 2 - 1, y: -(mouse.y / innerHeight) * 2 + 1 };
    const ray = aimRay;
    ray.setFromCamera(ndc, camera);
    const plane = aimPlane;
    const hit = aimPoint;
    if (ray.ray.intersectPlane(plane, hit)) player.aim = Math.atan2(hit.x - g.position.x, hit.z - g.position.z) + Math.PI;
    const tur = g.userData.turret;
    if (tur) tur.rotation.y += shortAngle(player.aim - g.rotation.y - tur.rotation.y) * Math.min(1, dt * 18);
    player.cd -= dt;
    const rapid = now < game.buffs.rapidUntil;
    const interval = 0.42 / (game.stats.fireRate * (rapid ? 2 : 1));
    if ((mouse.down || keys.Space) && player.cd <= 0) {
      player.cd = interval;
      const dir = new THREE.Vector3(Math.sin(player.aim + Math.PI), 0, Math.cos(player.aim + Math.PI));
      const shots = 1 + game.stats.multishot;
      for (let i = 0; i < shots; i++) {
        const side = new THREE.Vector3(dir.z, 0, -dir.x);
        const origin = g.position.clone().addScaledVector(side, (i - (shots - 1) / 2) * 0.7);
        shootFrom(player, origin, dir, game.stats.dmg, { player: true });
      }
    }
    g.visible = now < player.invulnUntil ? (Math.sin(now * 0.02) > -0.3) : true;
  }

  function shortAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  function updateEnemies(dt) {
    const eaglePos = R.cellCenter(decoded.eagle.col, decoded.eagle.row);
    for (const e of enemies) {
      if (!e.alive) continue;
      const g = e.group;
      let tx = eaglePos.x - g.position.x, tz = eaglePos.z - g.position.z;
      if (player && player.alive) {
        const px = player.group.position.x - g.position.x, pz = player.group.position.z - g.position.z;
        if (px * px + pz * pz < 220) { tx = px; tz = pz; }
      }
      const len = Math.hypot(tx, tz) || 1;
      e.pathTimer=(e.pathTimer||0)-dt;
      if(e.pathTimer<=0){e.path=R.routeTo(grid,R.cellOf(g.position.x,g.position.z),decoded.eagle);e.pathTimer=.8;}
      if(e.path&&e.path.length){
        let waypoint=R.cellCenter(e.path[0].col,e.path[0].row);
        if(Math.hypot(waypoint.x-g.position.x,waypoint.z-g.position.z)<.35){e.path.shift();if(e.path.length)waypoint=R.cellCenter(e.path[0].col,e.path[0].row);}
        tx=waypoint.x-g.position.x;tz=waypoint.z-g.position.z;
      }
      const travelLength=Math.hypot(tx,tz)||1;
      const spd = e.speed * dt;
      const nx = g.position.x + (tx / travelLength) * Math.min(spd,travelLength), nz = g.position.z + (tz / travelLength) * Math.min(spd,travelLength);
      if (!blockedAt(nx, g.position.z, e.radius)) g.position.x = nx;
      if (!blockedAt(g.position.x, nz, e.radius)) g.position.z = nz;
      g.rotation.y = Math.atan2(tx, tz) + Math.PI;
      e.cd -= dt;
      if (e.cd <= 0 && player && player.alive) {
        const nearby=Math.hypot(player.group.position.x-g.position.x,player.group.position.z-g.position.z)<12;
        const dx = nearby?player.group.position.x-g.position.x:tx, dz = nearby?player.group.position.z-g.position.z:tz;
        if (Math.hypot(dx,dz)>.01) {
          e.cd = e.fireCd;
          g.userData.turret.rotation.y=Math.atan2(dx,dz)+Math.PI-g.rotation.y;
          shootFrom(e, g.position, new THREE.Vector3(dx, 0, dz).normalize(), e.dmg, { player: false });
        }
      }
    }
    if (game.stats.autoTurretLv > 0 && player) {
      game._turCd = (game._turCd || 0) - dt;
      if (game._turCd <= 0) {
        const alive = enemies.find((e) => e.alive);
        if (alive) {
          game._turCd = 0.7 / game.stats.autoTurretLv;
          const p = R.cellCenter(decoded.eagle.col, decoded.eagle.row);
          const dir = new THREE.Vector3(alive.group.position.x - p.x, 0, alive.group.position.z - p.z).normalize();
          shootFrom(null, new THREE.Vector3(p.x, 0, p.z), dir, 1.2, { player: true });
        }
      }
    }
  }

  function updateBullets(dt) {
    const speed=bullets.reduce((max,b)=>Math.max(max,b.vel.length()),0);
    const steps=R.shotSteps(speed,dt);
    for(let i=0;i<steps&&state===STATE.PLAYING;i++)updateBulletSlice(dt/steps);
  }

  function updateBulletSlice(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;
      const cell = R.cellOf(p.x, p.z);
      let gone = b.life <= 0 || !R.inMap(cell.col, cell.row);
      if (!gone) {
        const tile = grid[cell.row][cell.col];
        const hit = R.resolveShotTile(tile);
        if (hit.hitsEagle && b.owner === "enemy") { effects.emit(p);damageEagle(b.dmg); gone = true; }
        else if (hit.destroy) { audio.play('brick');effects.emit(p,'destroy');grid[cell.row][cell.col] = T.EMPTY; rebuildTile(cell.col, cell.row); gone = true; }
        else if (hit.stop && hit.kind === "steel") {audio.play('steel');effects.emit(p);gone = true;}
      }
      if (!gone && b.owner === "player") {
        for (const e of enemies) {
          if (!e.alive || b.hitSet.has(e)) continue;
          if (Math.hypot(p.x - e.group.position.x, p.z - e.group.position.z) < e.radius + 0.5) {
            b.hitSet.add(e); e.hp -= b.dmg;audio.play('hit');effects.emit(p); if (e.hp <= 0) killEnemy(e);
            if (b.blast) enemies.forEach((o) => { if (o.alive && Math.hypot(o.group.position.x - p.x, o.group.position.z - p.z) < b.blast) { o.hp -= b.dmg * 0.5; if (o.hp <= 0) killEnemy(o); } });
            if (b.pierceLeft > 0) b.pierceLeft -= 1; else gone = true;
            break;
          }
        }
      } else if (!gone && b.owner === "enemy" && player && player.alive) {
        if (Math.hypot(p.x - player.group.position.x, p.z - player.group.position.z) < player.radius + 0.5) {
          if (game.time >= player.invulnUntil && game.time >= game.buffs.shieldUntil) {
            audio.play('hit');
            effects.emit(p);
            player.hp -= b.dmg; if (player.hp <= 0) playerDie(); hud();
          }
          gone = true;
        }
      }
      if (gone) { scene.remove(b.mesh); bullets.splice(i, 1); }
    }
  }

  function updatePickups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.life -= dt; p.mesh.rotation.y += dt * 2;
      if (p.life <= 0) { scene.remove(p.mesh);root.ClassicVisuals.dispose(p.mesh); powerups.splice(i, 1); continue; }
      if (player&&player.alive&&Math.hypot(p.mesh.position.x - player.group.position.x, p.mesh.position.z - player.group.position.z) < 2.2) {
        applyPickup(p.key); scene.remove(p.mesh);root.ClassicVisuals.dispose(p.mesh); powerups.splice(i, 1);
      }
    }
    if (game.buffs.shovelUntil && game.time > game.buffs.shovelUntil && !game.owned.baseWall) {
      game.buffs.shovelUntil = 0; game.steelShell = false; applyShell();
    }
  }

  function step(dt, now) {
    if(!Number.isFinite(dt)||dt<0)return;
    if(state!==STATE.PAUSED)effects.update(dt);
    if (state === STATE.PAUSED || state === STATE.OVER || state === STATE.UPGRADE) return;
    game.time+=dt*1000;now=game.time;
    if(respawnIn>0){respawnIn-=dt;if(respawnIn<=0)spawnPlayer();}
    if (game.enemiesToSpawn > 0) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        const type = (game._waveTypes && game._waveTypes[game._waveTypes.length - game.enemiesToSpawn]) || "normal";
        spawnEnemy(type);
        game.enemiesToSpawn -= 1;
        game.spawnTimer = R.composeWave(game.wave).interval;
      }
    }
    updatePlayer(dt, now);
    updateEnemies(dt);
    updateBullets(dt);
    if(state===STATE.OVER)return;
    updatePickups(dt);
    hud();
    if (game.enemiesToSpawn <= 0 && enemies.every((e) => !e.alive) && game.wave > 0) {
      enemies.length = 0;
      showCards();
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    step(dt, now);
    renderer.render(scene, camera);
  }

  function reset(layoutIndex) {
    audio.reset();game.time=0;game._turCd=0;firedShots=0;
    effects.clear();
    respawnIn=0;mouse.down=false;for(const key in keys)delete keys[key];
    game.buffs={rapidUntil:0,shieldUntil:0,shovelUntil:0};
    enemies.splice(0).forEach((e) => {scene.remove(e.group);root.ClassicVisuals.dispose(e.group);});
    bullets.splice(0).forEach((b) => scene.remove(b.mesh));
    powerups.splice(0).forEach((p) => {scene.remove(p.mesh);root.ClassicVisuals.dispose(p.mesh);});
    Object.assign(game, { wave: 0, score: 0, lives: C.playerLives, enemiesToSpawn: 0, bombs: 0, owned: {}, steelShell: false, repairShell: 0, baseShieldHP: 0,
      stats: { dmg: 1, fireRate: 1, moveSpeed: 1, bulletSpeed: 1, pierce: 0, blastRadius: 0, multishot: 0, luckyLv: 0, armorMax: 5, autoTurretLv: 0, baseShieldMax: 0 } });
    eagle.hp = C.eagleHp; eagle.maxHp = C.eagleHp;
    buildMap(C.MAPS[Number.isInteger(layoutIndex)?Math.max(0,Math.min(C.MAPS.length-1,layoutIndex)):Math.floor(Math.random() * C.MAPS.length)]);
    spawnPlayer();
    state = STATE.PLAYING;
    const over = document.getElementById("classicOver"); if (over) over.classList.add("hidden");
    const up = document.getElementById("classicUpgrade"); if (up) up.classList.add("hidden");
    document.getElementById('classicPause').classList.add('hidden');
    startWave(1);
    applyLockedCamera();
    renderer.render(scene, camera);
  }

  addEventListener("keydown", (e) => {
    audio.unlock();
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&e.target.tagName!=='BUTTON')e.preventDefault();
    if(e.code==='KeyM'&&!e.repeat){audio.setMuted(!audio.inspect().muted);updateAudioButtons();return;}
    keys[e.code] = true;
    if (e.code === "Escape"&&!e.repeat) {
      if (state === STATE.PLAYING) state = STATE.PAUSED;
      else if (state === STATE.PAUSED) state = STATE.PLAYING;
      document.getElementById('classicPause').classList.toggle('hidden',state!==STATE.PAUSED);
      audio.setPaused(state===STATE.PAUSED);
    }
    if (e.code === "KeyP" && !e.repeat&&state===STATE.PLAYING&&game.bombs > 0) { game.bombs -= 1; enemies.forEach(en=>killEnemy(en,false)); }
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  addEventListener('pointerdown',()=>audio.unlock());
  renderer.domElement.addEventListener("mousedown", (e) => { if(e.button===0&&state===STATE.PLAYING)mouse.down = true; });
  addEventListener("mouseup", () => { mouse.down = false; });
  function backgroundPause(){mouse.down=false;for(const k in keys)delete keys[k];if(state===STATE.PLAYING){state=STATE.PAUSED;document.getElementById('classicPause').classList.remove('hidden');}audio.setPaused(true);}
  addEventListener('blur',backgroundPause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();else audio.setPaused(state===STATE.PAUSED);});
  addEventListener('focus',()=>audio.setPaused(state===STATE.PAUSED));
  addEventListener('pagehide',()=>audio.setPaused(true));
  addEventListener('pageshow',()=>audio.setPaused(state===STATE.PAUSED));
  addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  addEventListener("wheel", (e) => { e.preventDefault(); }, { passive: false });
  addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); applyLockedCamera(); });

  root.ClassicGame = {
    audio,
    inspect:()=>({shots:firedShots,enemies:enemies.filter(e=>e.alive).length,effects:effects.count,effectLimit:effects.limit}),
    reset, applyLockedCamera, step,
    renderNow() {
      applyLockedCamera();
      renderer.render(scene, camera);
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    get camera() { return camera; }, get game() { return game; }, get state() { return state; },
    get scene() { return scene; },
    get canvas() { return renderer.domElement; },
    debugCam() {
      camera.updateMatrixWorld(true);
      return {
        pos: camera.position.toArray(),
        proj: Array.from(camera.projectionMatrix.elements),
        world: Array.from(camera.matrixWorld.elements),
      };
    },
    resolveShotTile: R.resolveShotTile, loseState: R.loseState,
  };
  if(new URLSearchParams(location.search).has('autotest')){
    root.ClassicGame.testEffect=(kind)=>effects.emit(new THREE.Vector3(0,1,12),kind);
    root.ClassicGame.testEffectAdvance=(dt)=>effects.update(Math.max(0,Math.min(2,dt)));
    root.ClassicGame.testBasePosition=()=>eagle.group.position.toArray();
    root.ClassicGame.testClearWave=()=>{enemies.forEach(e=>killEnemy(e));game.enemiesToSpawn=0;step(0,performance.now());};
    root.ClassicGame.testLose=()=>lose('eagle');
  }
  root.render_game_to_text=()=>JSON.stringify({mode:'classic',state,wave:game.wave,remaining:game.enemiesToSpawn+enemies.filter(e=>e.alive).length,score:game.score,lives:game.lives,eagleHp:eagle.hp,player:player&&{x:player.group.position.x,z:player.group.position.z,hp:player.hp},coordinates:'x east, z south, ground y=0'});
  root.advanceTime=ms=>{if(!Number.isFinite(ms)||ms<0)return;for(let t=0;t<ms;t+=1000/60)step(Math.min(1000/60,ms-t)/1000);renderer.render(scene,camera);};

  async function boot(){await root.ClassicVisuals.ready;reset();lastT=performance.now();loop();root.classicReady=true;}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  const restart = document.getElementById("classicRestart");
  document.getElementById('classicResume').onclick=()=>{state=STATE.PLAYING;audio.setPaused(false);mouse.down=false;document.getElementById('classicPause').classList.add('hidden');};
  function updateAudioButtons(){const a=audio.inspect();const s=document.getElementById('classicSound'),m=document.getElementById('classicMusic');s.textContent=a.muted?'声音关闭 · M':'声音开启 · M';s.setAttribute('aria-pressed',String(a.muted));m.textContent=a.music?'配乐开启':'配乐关闭';m.setAttribute('aria-pressed',String(a.music));}
  document.getElementById('classicSound').onclick=()=>{audio.setMuted(!audio.inspect().muted);audio.unlock();updateAudioButtons();};
  document.getElementById('classicMusic').onclick=()=>{audio.setMusic(!audio.inspect().music);audio.unlock();updateAudioButtons();};
  updateAudioButtons();
  if (restart) restart.onclick = () => { reset(); lastT = performance.now(); };
  const menu = document.getElementById("classicMenu");
  if (menu) menu.onclick = () => { location.href = "index.html"; };
})(typeof window !== "undefined" ? window : globalThis);

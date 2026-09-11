/* 经典玩法纯函数：地图解码、弹 vs 瓦片、胜负、镜头锁、波次兵种。 */
"use strict";
(function (root) {
  const Config = root.ClassicConfig || (typeof require === "function" ? require("./classic-config.js") : {});
  const T = Config.T;
  const TILE = Config.TILE;
  const GRID = Config.GRID;
  const HALF = Config.HALF;

  function decodeMap(layout) {
    const rows = layout || Config.MAPS[0];
    const tiles = [];
    let eagle = { col: 6, row: 12 };
    for (let row = 0; row < GRID; row++) {
      tiles[row] = [];
      const line = rows[row] || ".............";
      for (let col = 0; col < GRID; col++) {
        const ch = line[col] || ".";
        const tile = Config.CHAR_TO_TILE[ch] != null ? Config.CHAR_TO_TILE[ch] : T.EMPTY;
        tiles[row][col] = tile;
        if (ch === "E") eagle = { col, row };
      }
    }
    tiles[eagle.row][eagle.col] = T.BASE;
    const shell = [
      [eagle.row, eagle.col - 1], [eagle.row, eagle.col + 1],
      [eagle.row - 1, eagle.col - 1], [eagle.row - 1, eagle.col], [eagle.row - 1, eagle.col + 1],
    ];
    shell.forEach(([r, c]) => {
      if (r >= 0 && r < GRID && c >= 0 && c < GRID && tiles[r][c] !== T.BASE) tiles[r][c] = T.BRICK;
    });
    const spawnCols = [];
    for (let col = 0; col < GRID; col++) if (tiles[0][col] === T.EMPTY) spawnCols.push(col);
    if (!spawnCols.length) spawnCols.push(1, 6, 11);
    let playerCol = eagle.col - 2;
    if (playerCol < 1) playerCol = eagle.col + 2;
    if (tiles[GRID - 2][playerCol] === T.BASE) playerCol = Math.max(1, eagle.col - 3);
    tiles[GRID - 2][playerCol] = T.EMPTY;
    return {
      tiles,
      eagle,
      playerSpawn: { col: playerCol, row: GRID - 2 },
      spawnCols,
      shell,
    };
  }

  function cellCenter(col, row) {
    return { x: col * TILE - HALF + TILE / 2, z: row * TILE - HALF + TILE / 2 };
  }

  function cellOf(x, z) {
    return { col: Math.floor((x + HALF) / TILE), row: Math.floor((z + HALF) / TILE) };
  }

  function inMap(col, row) {
    return col >= 0 && row >= 0 && col < GRID && row < GRID;
  }

  function resolveShotTile(tile) {
    if (tile === T.BRICK) return { destroy: true, stop: true, kind: "brick" };
    if (tile === T.STEEL) return { destroy: false, stop: true, kind: "steel" };
    if (tile === T.BASE) return { destroy: false, stop: true, kind: "eagle", hitsEagle: true };
    if (tile === T.WATER) return { destroy: false, stop: false, kind: "water" };
    if (tile === T.TREE) return { destroy: false, stop: false, kind: "tree" };
    return { destroy: false, stop: false, kind: "empty" };
  }

  function blocksTank(tile) {
    return tile === T.BRICK || tile === T.STEEL || tile === T.WATER || tile === T.BASE;
  }

  function loseState({ eagleHp, lives }) {
    if (eagleHp <= 0) return { lost: true, reason: "eagle" };
    if (lives <= 0) return { lost: true, reason: "lives" };
    return { lost: false, reason: null };
  }

  function lockedCameraPose() {
    const lookAt = { x: Config.CAMERA.lookAt.x, y: Config.CAMERA.lookAt.y, z: Config.CAMERA.lookAt.z };
    const position = { x: lookAt.x, y: Config.CAMERA.height, z: lookAt.z + Config.CAMERA.back };
    return {
      lookAt,
      position,
      distance: Math.hypot(position.x - lookAt.x, position.y - lookAt.y, position.z - lookAt.z),
    };
  }

  function applyCameraInput(pose) {
    const locked = lockedCameraPose();
    return {
      lookAt: { x: locked.lookAt.x, y: locked.lookAt.y, z: locked.lookAt.z },
      position: { x: locked.position.x, y: locked.position.y, z: locked.position.z },
      distance: locked.distance,
      ignored: pose && pose.input ? Object.keys(pose.input) : [],
    };
  }

  function composeWave(wave) {
    const count = Config.enemiesPerWave(wave);
    const bag = wave >= 6
      ? [["heavy", 3], ["sniper", 2], ["normal", 3], ["fast", 2]]
      : wave >= 3
        ? [["normal", 4], ["fast", 3], ["heavy", 2], ["sniper", 1]]
        : [["normal", 6], ["fast", 2]];
    const types = [];
    const total = bag.reduce((sum, [, w]) => sum + w, 0);
    for (let i = 0; i < count; i++) {
      let roll = ((i * 17 + wave * 13) % total) + 1;
      let picked = "normal";
      for (const [id, w] of bag) {
        roll -= w;
        if (roll <= 0) { picked = id; break; }
      }
      types.push(picked);
    }
    return { count, types, interval: Config.spawnInterval(wave) };
  }

  function dropPickupRoll(random, luckyLv) {
    const chance = 0.16 + (luckyLv || 0) * 0.05;
    if ((random == null ? Math.random() : random) > chance) return null;
    const list = Config.POWERUPS;
    const index = Math.floor(((random == null ? Math.random() : random * 7) % 1) * list.length);
    return list[Math.max(0, Math.min(list.length - 1, index))];
  }

  function baseShellMaxHp(reinforced,level=0){
    return reinforced ? (Number(level)>=2?6:4) : 1;
  }

  function routeTo(grid,start,goal,breakableSteel=null){
    if(!inMap(start.col,start.row)||!inMap(goal.col,goal.row))return [];
    const key=p=>p.row*GRID+p.col,queue=[start],parents=new Map([[key(start),null]]);
    for(let i=0;i<queue.length;i++){
      const p=queue[i];if(key(p)===key(goal))break;
      for(const [dx,dz] of [[0,1],[1,0],[-1,0],[0,-1]]){
        const q={col:p.col+dx,row:p.row+dz};if(!inMap(q.col,q.row)||parents.has(key(q)))continue;
        const tile=grid[q.row][q.col];
        if(tile===T.WATER||(tile===T.STEEL&&!breakableSteel?.has(key(q))))continue;
        parents.set(key(q),p);queue.push(q);
      }
    }
    if(!parents.has(key(goal)))return [];
    const path=[];for(let p=goal;parents.get(key(p));p=parents.get(key(p)))path.push(p);
    return path.reverse();
  }
  /** Keep each projectile collision sample at most half a world unit apart. */
  function shotSteps(speed,dt){
    if(!Number.isFinite(speed)||!Number.isFinite(dt)||speed<0||dt<0)return 1;
    return Math.max(1,Math.ceil(speed*dt/.5));
  }
  const ClassicRules = {
    baseShellMaxHp,
    shotSteps,
    routeTo,
    decodeMap, cellCenter, cellOf, inMap, resolveShotTile, blocksTank, loseState,
    lockedCameraPose, applyCameraInput, composeWave, dropPickupRoll, T, TILE, GRID,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = ClassicRules;
  root.ClassicRules = ClassicRules;
})(typeof window !== "undefined" ? window : globalThis);

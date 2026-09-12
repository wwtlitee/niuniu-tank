/* 经典模式数据。禁止引用 survival-* 。浏览器 <script> 与 Node require 双通道。 */
"use strict";
(function (root) {
  const TILE = 4;
  const GRID = 13;
  const MAP_SIZE = GRID * TILE;
  const HALF = MAP_SIZE / 2;

  const T = Object.freeze({ EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, TREE: 4, BASE: 5 });
  const CHAR_TO_TILE = Object.freeze({ ".": T.EMPTY, B: T.BRICK, S: T.STEEL, W: T.WATER, T: T.TREE, E: T.BASE });

  const MAPS = Object.freeze([
    Object.freeze([".............", ".............", "..B.......B..", ".............", "....B...B....", ".B..B.B.B..B.", ".....B.B.....", ".B..B.B.B..B.", "....B...B....", ".............", "..B.......B..", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", ".SS.....SS...", ".BB.....BB...", ".............", "..S.....S....", ".....BBB.....", "..B.......B..", ".....BBB.....", "..S.....S....", ".............", ".BB.....BB...", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", "..S.S.S.S.S..", ".............", ".B.B.B.B.B.B.", ".............", ".S.S.S.S.S.S.", ".............", ".B.B.B.B.B.B.", ".............", ".S.S.S.S.S.S.", ".............", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", ".....BBB.....", "..B.......B..", ".....WWW.....", "..B.......B..", ".....WWW.....", "..B.......B..", ".....WWW.....", "..B.......B..", ".....BBB.....", ".............", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", ".T.T.T.T.T.T.", ".............", ".T.B.B.B.B.T.", ".T........T..", ".T.BB.BB.B.T.", ".T.BB.BB.B.T.", ".T.BB.BB.B.T.", ".T........T..", ".T.B.B.B.B.T.", ".T.T.T.T.T.T.", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", ".BB.BB.BB.BB.", ".............", ".BB.BB.BB.BB.", ".............", ".BB.BB.BB.BB.", ".............", ".BB.BB.BB.BB.", ".............", ".BB.BB.BB.BB.", ".............", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", ".....BBB.....", ".....B.B.....", ".....B.B.....", ".BB.B...B.BB.", ".B.......B...", ".B...S...B...", ".B.......B...", ".BB.B...B.BB.", ".....B.B.....", ".....B.B.....", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", ".S.B.S.B.S.B.", ".B.S.B.S.B.S.", ".............", ".S.B.S.B.S.B.", ".B.S.B.S.B.S.", ".....S.S.....", ".B.S.B.S.B.S.", ".S.B.S.B.S.B.", ".............", ".B.S.B.S.B.S.", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", "..B.....B....", "..B.WWW.B....", "..B.W.W.B....", "....W.W......", "..B.WWW.B....", "..B.....B....", ".....BBB.....", "..B.B.B.B.B..", ".............", "..B.....B....", ".....BBB.....", ".....BEB....."]),
    Object.freeze([".............", ".SS.BB.SS.BB.", ".BB.SS.BB.SS.", ".............", ".SS.BB.SS.BB.", ".BB.SS.BB.SS.", ".....BBB.....", ".BB.SS.BB.SS.", ".SS.BB.SS.BB.", ".............", ".SS.BB.SS.BB.", ".....BBB.....", ".....BEB....."]),
  ]);

  const ENEMY_TYPES = Object.freeze({
    normal: Object.freeze({ id: "normal", hp: 2, speed: 5.2, fireCd: 1.7, dmg: 1, scale: 1, color: 0x8a94a2, turret: 0xa8b2c0, score: 100 }),
    fast: Object.freeze({ id: "fast", hp: 1, speed: 7.4, fireCd: 1.9, dmg: 1, scale: 0.88, color: 0x2f8f4e, turret: 0x53c077, score: 150 }),
    heavy: Object.freeze({ id: "heavy", hp: 6, speed: 3.6, fireCd: 2.1, dmg: 2, scale: 1.22, color: 0xa03c34, turret: 0xcc5a4c, score: 300 }),
    sniper: Object.freeze({ id: "sniper", hp: 2, speed: 4.6, fireCd: 2.5, dmg: 1, scale: 0.95, color: 0x6a4fa0, turret: 0x8f74cc, score: 250 }),
  });

  const POWERUPS = Object.freeze(["star", "shovel", "bomb", "life"]);
  const BUILD_ECONOMY_IDS = Object.freeze(["income", "builder", "netmaster", "goldmine", "house", "research", "factory"]);

  const CAMERA = Object.freeze({
    lookAt: Object.freeze({ x: 0, y: 0, z: 0 }),
    height: 48,
    back: 36,
  });

  const ClassicConfig = Object.freeze({
    TILE, GRID, MAP_SIZE, HALF, T, CHAR_TO_TILE, MAPS, ENEMY_TYPES, POWERUPS, BUILD_ECONOMY_IDS, CAMERA,
    enemiesPerWave: (wave) => 4 + Math.max(1, wave),
    spawnInterval: (wave) => Math.max(1.15, 2.8 - wave * 0.12),
    playerLives: 3,
    eagleHp: 8,
    version: "10.1.0",
  });

  if (typeof module !== "undefined" && module.exports) module.exports = ClassicConfig;
  root.ClassicConfig = ClassicConfig;
})(typeof window !== "undefined" ? window : globalThis);

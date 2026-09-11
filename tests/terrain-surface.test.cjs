"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { TerrainSurface } = require("../js/terrain-surface.js");

test("平地、高台和坡道共享连续高度查询", () => {
  const terrain = new TerrainSurface({ width: 8, gridSize: 4, originX: -16, originZ: -16 });
  terrain.setHeight(1, 1, 2.2);
  terrain.setRamp(2, 1, { uphillX: 1, uphillZ: 0, base: 0, rise: 2.2 });
  assert.ok(Math.abs(terrain.heightAt(-10, -10) - 2.2) < 1e-5);
  assert.equal(terrain.heightAt(-8, -10), 0);
  assert.equal(terrain.heightAt(-6, -10), 1.1);
  assert.equal(terrain.heightAt(-4.000001, -10).toFixed(5), "2.20000");
});

test("坡道法线和表面类型由同一真值层返回", () => {
  const terrain = new TerrainSurface({ width: 4, gridSize: 4, originX: 0, originZ: 0 });
  terrain.setRamp(1, 1, { uphillX: 0, uphillZ: -1, base: 0, rise: 1 });
  const sample = terrain.sample(6, 6);
  assert.equal(sample.kind, "ramp");
  assert.ok(sample.normal.y > 0.9);
  assert.ok(sample.normal.z > 0);
});

test("模型顶面按逻辑表面埋入，不再用模型原点冒充地面", () => {
  const terrain = new TerrainSurface({ width: 2, gridSize: 4, originX: 0, originZ: 0 });
  assert.equal(terrain.visualOriginY({ boundsMaxY: 0.2, scale: 4, surfaceY: 0 }), -0.8);
  assert.ok(Math.abs(terrain.visualOriginY({ boundsMaxY: 0.2, scale: 4, surfaceY: 2.2 }) - 1.4) < 1e-9);
});

test("鼠标射线命中真实高台而不是固定 Y=0 平面", () => {
  const terrain = new TerrainSurface({ width: 4, gridSize: 4, originX: -8, originZ: -8 });
  terrain.setHeight(1, 1, 2.2);
  const hit = terrain.intersectRay(
    { x: -2, y: 12, z: -2 },
    { x: 0, y: -1, z: 0 },
    { maxDistance: 30 },
  );
  assert.ok(hit);
  assert.ok(Math.abs(hit.y - 2.2) < 0.001);
});

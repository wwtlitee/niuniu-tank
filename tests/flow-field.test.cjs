"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { FlowField } = require("../js/flow-field.js");

test("八方向流场能绕过围墙并通过唯一缺口", () => {
  const blocked = new Set(["3,0", "3,1", "3,2", "3,4", "3,5", "3,6"]);
  const field = new FlowField(7, 7);
  field.compute([{ x: 6, z: 3 }], {
    passable: (x, z) => !blocked.has(`${x},${z}`),
  });
  assert.ok(Number.isFinite(field.distanceAt(0, 3)));
  const direction = field.directionAt(2, 2);
  assert.ok(direction.z > 0, "应先转向缺口而非撞墙");
});

test("对角移动禁止从两个实体墙角之间穿越", () => {
  const blocked = new Set(["1,0", "0,1"]);
  const field = new FlowField(3, 3);
  field.compute([{ x: 2, z: 2 }], {
    passable: (x, z) => !blocked.has(`${x},${z}`),
  });
  assert.equal(field.distanceAt(0, 0), Infinity);
});

test("开阔地返回归一化对角方向以减少直角抖动", () => {
  const field = new FlowField(5, 5);
  field.compute([{ x: 4, z: 4 }], { passable: () => true });
  const direction = field.directionAt(0, 0);
  assert.ok(Math.abs(direction.x - Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(direction.z - Math.SQRT1_2) < 1e-6);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../lib/three.min.js');
const context = vm.createContext({ THREE, performance });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/crowd-lod.js'), 'utf8'), context);

test('屏幕像素决定四档模型精度，不依赖尸群数量', () => {
  assert.equal(typeof context.crowdLodTierForPixels, 'function');
  assert.deepEqual([60, 30, 18, 8].map(px => context.crowdLodTierForPixels(px)), [0, 1, 2, 3]);
});

test('缩放阈值带滞回，边缘不会反复切换', () => {
  assert.equal(context.crowdLodTierForPixels(39, 0), 0);
  assert.equal(context.crowdLodTierForPixels(42, 1), 1);
  assert.equal(context.crowdLodTierForPixels(50, 1), 0);
  assert.equal(context.crowdLodTierForPixels(9, 2), 3);
});

test('远景模型实际减少三角面，保持完整外形与有限坐标', () => {
  const source = new THREE.SphereGeometry(1, 32, 24);
  const original = source.index.count / 3;
  const counts = [];
  for (const ratio of [1 / 4, 1 / 8, 1 / 16]) {
    const mesh = context.simplifyCrowdGeometry(source, ratio);
    counts.push(mesh.index.count / 3);
    assert.ok(mesh.index.count / 3 <= original * ratio * 1.25);
    mesh.computeBoundingBox();
    const size = mesh.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x > 1.6 && size.y > 1.6 && size.z > 1.6);
    assert.ok([...mesh.attributes.position.array].every(Number.isFinite));
  }
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2]);
});

test('共享模型批次容量覆盖4000实体', () => {
  assert.ok(vm.runInContext('crowdLodCapacity', context) >= 4000);
});

test('四分之一到十六分之一模型保留源顶点颜色，换姿态沿用同一颜色簇', () => {
  const source = new THREE.SphereGeometry(1, 24, 20);
  const colors = new Float32Array(source.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = .45; colors[i + 1] = .7; colors[i + 2] = .55; }
  source.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  for (const ratio of [.25, .125, .0625]) {
    const simplified = context.simplifyCrowdGeometry(source, ratio);
    assert.ok(simplified.attributes.color, 'vertexColors material must receive a real color buffer');
    assert.equal(simplified.attributes.color.count, simplified.attributes.position.count);
    for (const mesh of [simplified, context.simplifyCrowdGeometry(source, ratio, simplified)]) {
      for (let i = 0; i < mesh.attributes.color.count; i++) {
        assert.ok(Math.abs(mesh.attributes.color.getX(i) - .45) < 1e-6);
        assert.ok(Math.abs(mesh.attributes.color.getY(i) - .7) < 1e-6);
        assert.ok(Math.abs(mesh.attributes.color.getZ(i) - .55) < 1e-6);
      }
    }
  }
});

test('量化RGBA顶点颜色恢复到零至一区间，透明度不丢失', () => {
  const source = new THREE.SphereGeometry(1, 24, 20);
  const colors = new Uint8Array(source.attributes.position.count * 4);
  for (let i = 0; i < colors.length; i += 4) { colors[i] = 64; colors[i + 1] = 128; colors[i + 2] = 192; colors[i + 3] = 255; }
  source.setAttribute('color', new THREE.BufferAttribute(colors, 4, true));
  const simplified = context.simplifyCrowdGeometry(source, .25), color = simplified.attributes.color;
  assert.equal(color.itemSize, 4);
  assert.ok(Math.abs(color.getX(0) - 64 / 255) < 1e-6);
  assert.ok(Math.abs(color.getY(0) - 128 / 255) < 1e-6);
  assert.ok(Math.abs(color.getZ(0) - 192 / 255) < 1e-6);
  assert.equal(color.getW(0), 1);
});

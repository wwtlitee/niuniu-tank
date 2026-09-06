const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

test("资产审计模块提供正式素材扫描入口", () => {
  let audit = null;
  try {
    audit = require("../tools/asset-audit.cjs");
  } catch (error) {
    assert.fail(`无法加载资产审计模块：${error.message}`);
  }
  assert.equal(typeof audit.scanCanonicalAssets, "function");
  const result = audit.scanCanonicalAssets(path.resolve(__dirname, "../assets"));
  assert.equal(result.files.length, 175);
  assert.equal(result.glbs.length, 145);
  assert.ok(result.files.every((file) => !file.relative.startsWith("assets/")));
});

test("资产审计识别注册、缺失和未注册 GLB", () => {
  const audit = require("../tools/asset-audit.cjs");
  assert.equal(typeof audit.auditAssets, "function");
  const result = audit.auditAssets({
    assetRoot: path.resolve(__dirname, "../assets"),
    engineFile: path.resolve(__dirname, "../js/engine.js"),
  });
  assert.equal(result.registry.length, 138);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.duplicateRegistryKeys, []);
  assert.deepEqual(result.unregistered, [
    "tdkit/tile-corner-round.glb",
    "tdkit/tile-corner-square.glb",
    "tdkit/tile-crystal.glb",
    "tdkit/tile-river-corner.glb",
    "tdkit/tile-river-straight.glb",
    "tdkit/tile-transition.glb",
    "tdkit/tile-tree-double.glb",
  ]);
});

test("运行态资产台账读取模型包围盒和网格信息", async () => {
  let catalog = null;
  try {
    catalog = require("../tools/asset-runtime-catalog.cjs");
  } catch (error) {
    assert.fail(`无法加载运行态资产台账模块：${error.message}`);
  }
  assert.equal(typeof catalog.collectRuntimeCatalog, "function");
  const rows = await catalog.collectRuntimeCatalog({
    projectRoot: path.resolve(__dirname, ".."),
    relativeFiles: [
      "tdkit/tile.glb",
      "platformer/block-grass-large-slope.glb",
    ],
  });
  assert.deepEqual(rows.map((row) => row.relative), [
    "tdkit/tile.glb",
    "platformer/block-grass-large-slope.glb",
  ]);
  assert.deepEqual(rows[0].size, [1, 0.2, 1]);
  assert.ok(rows[1].meshes >= 1);
  assert.ok(rows[1].vertices > 0);
});

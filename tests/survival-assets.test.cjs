"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("生存模式素材契约只允许统一的十一个职责包", () => {
  const contract = require("../js/survival-assets.js");
  assert.deepEqual(contract.allowedFamilies, ["platformer", "castle", "monsters", "td", "nature", "graveyard", "survivors", "retro", "protagonists", "characters", "industrial"]);
  assert.equal(contract.primaryTerrainFamily, "platformer");
  assert.equal(contract.roles.terrain.ramp.asset, "platformer/block-grass-large-slope-steep.glb");
  assert.equal(contract.roles.terrain.ramp.segmentsPerRamp, 1);
  assert.deepEqual(contract.roles.terrain.ramp.footprint, [1, 1]);
  assert.equal(contract.placement.minRampRun, 1);
});

test("发布副本包含夜幕路灯模型与贴图", () => {
  const root=path.resolve(__dirname,"..");
  for(const relative of ["assets/graveyard/lightpost-single.glb","assets/graveyard/lightpost-double.glb","assets/graveyard/Textures/colormap.png"]){
    const source=path.join(root,relative),published=path.join(root,"play","niuniu-tank",relative);
    assert.ok(fs.existsSync(published),`发布副本缺少 ${relative}`);
    assert.deepEqual(fs.readFileSync(published),fs.readFileSync(source),`发布副本素材不一致 ${relative}`);
  }
});

test("生存模式明确隔离不兼容和不可见素材", () => {
  const contract = require("../js/survival-assets.js");
  for (const family of ["commercial", "roads", "floors", "tdkit"]) {
    assert.ok(contract.excludedFamilies[family], `${family} must have an exclusion reason`);
  }
  assert.ok(contract.quarantinedAssets["castle/bridge-straight-pillar.glb"]);
  assert.ok(!contract.runtimeAllowlist.includes("castle/bridge-straight-pillar.glb"));
  assert.ok(!contract.runtimeAllowlist.includes("platformer/block-grass-large-slope.glb"));
  assert.ok(!contract.runtimeAllowlist.includes("platformer/block-grass-low.glb"));
  assert.ok(contract.runtimeAllowlist.includes("characters/character-l.glb"));
  assert.ok(contract.runtimeAllowlist.includes("survivors/survivor-run.glb"));
  assert.ok(contract.runtimeAllowlist.includes("retro/retro-run.glb"));
});

test("所有允许素材均有唯一职责且建筑包含占地和材质策略", () => {
  const contract = require("../js/survival-assets.js");
  assert.equal(new Set(contract.runtimeAllowlist).size, contract.runtimeAllowlist.length);
  assert.deepEqual(contract.roles.buildings.gate.footprint, [1, 2]);
  assert.equal(contract.roles.buildings.gate.materialPolicy, "replace");
  assert.deepEqual(contract.roles.buildings.command.footprint, [3, 3]);
  assert.equal(contract.roles.buildings.beacon.generator,"medical-watch-beacon");
  assert.deepEqual(contract.roles.buildings.beacon.components,["command","lightpostSingle"]);
  assert.ok(contract.placement.terrainBurialDepth > 0);
  assert.ok(contract.placement.decorClearance > 0);
});

test("灰烬荒原使用单体巨岩墙与末日环境职责", () => {
  const contract = require("../js/survival-assets.js");
  assert.equal(contract.version, require('../package.json').version);
  assert.ok(contract.allowedFamilies.includes("nature"));
  assert.equal(contract.roles.buildings.wall.asset, null);
  assert.equal(contract.roles.buildings.wall.generator, "gate-stretch");
  assert.equal(contract.roles.buildings.wall.visual, "gate");
  assert.equal(contract.roles.buildings.wall.visualAsset, "castle/gate.glb");
  assert.deepEqual(contract.roles.buildings.wall.footprint, [1, 1]);
  assert.equal(contract.roles.props.rubbleLarge.asset, "castle/rocks-large.glb");
  assert.equal(contract.roles.props.brokenFence.asset, "platformer/fence-broken.glb");
  assert.ok(contract.atmosphere.fogNear <= 56);
  assert.ok(contract.atmosphere.fogFar <= 145);
  assert.ok(contract.atmosphere.dustParticles >= 48 && contract.atmosphere.dustParticles <= 96);
  assert.ok(contract.palette.grass < 0x596a45, "草地必须降低亮度与饱和度");
});

test("基地经济与科技建筑统一采用工业建筑套装",()=>{
  const contract=require("../js/survival-assets.js"),root=path.resolve(__dirname,"..");
  const expected={research:"industrial/building-g.glb",factory:"industrial/building-m.glb",mine:"industrial/building-s.glb",house:"industrial/building-i.glb"};
  for(const [role,asset] of Object.entries(expected)){
    assert.equal(contract.roles.buildings[role].asset,asset);
    assert.ok(fs.existsSync(path.join(root,"assets",asset)),`${asset} 必须导入正式素材库`);
  }
  assert.deepEqual(contract.roles.buildings.command.assets,[
    "industrial/building-d.glb","industrial/building-t.glb","industrial/building-c.glb","industrial/chimney-basic.glb",
  ]);
  for(const asset of contract.roles.buildings.command.assets)
    assert.ok(fs.existsSync(path.join(root,"assets",asset)),`${asset} 必须导入正式素材库`);
  assert.equal(contract.roles.buildings.command.materialPolicy,"composite");
  assert.ok(contract.allowedFamilies.includes("industrial"));
});

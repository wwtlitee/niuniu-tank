(function survivalAssetContractFactory(root, factory) {
  "use strict";
  const contract = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = contract;
  if (root) root.SURVIVAL_ASSETS = contract;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildSurvivalAssetContract() {
  "use strict";

  const roles = {
    terrain: {
      ramp: { asset: "platformer/block-grass-large-slope-steep.glb", footprint: [1, 1], collision: "ramp", materialPolicy: "palette", segmentsPerRamp: 1 },
    },
    buildings: {
      command: { assets: ["industrial/building-d.glb", "industrial/building-t.glb", "industrial/building-c.glb", "industrial/chimney-basic.glb"], footprint: [3, 3], materialPolicy: "composite", collision: "solid" },
      research: { asset: "industrial/building-g.glb", footprint: [2, 2], materialPolicy: "native", collision: "solid" },
      factory: { asset: "industrial/building-m.glb", footprint: [2, 2], materialPolicy: "native", collision: "solid" },
      mine: { asset: "industrial/building-s.glb", footprint: [1, 1], materialPolicy: "gold-tint", collision: "solid" },
      house: { asset: "industrial/building-i.glb", footprint: [1, 1], materialPolicy: "native", collision: "solid" },
      wall: { asset: null, generator: "gate-stretch", footprint: [1, 1], materialPolicy: "replace", collision: "solid", visual: "gate", visualAsset: "castle/gate.glb" },
      wallHalf: { asset: "castle/wall-half.glb", footprint: [1, 1], materialPolicy: "palette", collision: "solid" },
      wallNarrow: { asset: "castle/wall-narrow.glb", footprint: [1, 1], materialPolicy: "palette", collision: "solid" },
      woodWall: { asset: "castle/wall-narrow-wood.glb", footprint: [1, 1], materialPolicy: "palette", collision: "solid" },
      gate: { asset: "castle/gate.glb", footprint: [1, 2], materialPolicy: "replace", collision: "gate" },
      metalGate: { asset: "castle/metal-gate.glb", footprint: [1, 2], materialPolicy: "replace", collision: "gate" },
      bridge: { asset: "castle/bridge-straight.glb", footprint: [1, 2], materialPolicy: "replace", collision: "surface" },
      cannon: { asset: "td/weapon-cannon.glb", footprint: [2, 2], materialPolicy: "palette", collision: "solid" },
      beacon: { asset: null, generator: "medical-watch-beacon", components: ["command", "lightpostSingle"], footprint: [1, 1], materialPolicy: "composite", collision: "solid" },
    },
    units: {
      survivorZombieA: { asset: "survivors/survivor-zombie.glb", texture: "survivors/zombie-a.png", animationAssets: ["survivors/survivor-idle.glb", "survivors/survivor-run.glb"], materialPolicy: "native-texture" },
      survivorZombieC: { asset: "survivors/survivor-zombie.glb", texture: "survivors/zombie-c.png", animationAssets: ["survivors/survivor-idle.glb", "survivors/survivor-run.glb"], materialPolicy: "native-texture" },
      survivorFemale: { asset: "survivors/survivor-zombie.glb", texture: "survivors/survivor-female-a.png", animationAssets: ["survivors/survivor-idle.glb", "survivors/survivor-run.glb"], materialPolicy: "zombie-tint" },
      survivorMale: { asset: "survivors/survivor-zombie.glb", texture: "survivors/survivor-male-b.png", animationAssets: ["survivors/survivor-idle.glb", "survivors/survivor-run.glb"], materialPolicy: "zombie-tint" },
      retroZombieFemale: { asset: "retro/retro-zombie.glb", texture: "retro/zombie-female-a.png", animationAssets: ["retro/retro-idle.glb", "retro/retro-run.glb"], materialPolicy: "native-texture" },
      retroZombieMale: { asset: "retro/retro-zombie.glb", texture: "retro/zombie-male-a.png", animationAssets: ["retro/retro-idle.glb", "retro/retro-run.glb"], materialPolicy: "native-texture" },
      retroHumanFemale: { asset: "retro/retro-zombie.glb", texture: "retro/human-female-a.png", animationAssets: ["retro/retro-idle.glb", "retro/retro-run.glb"], materialPolicy: "zombie-tint" },
      retroHumanMale: { asset: "retro/retro-zombie.glb", texture: "retro/human-male-a.png", animationAssets: ["retro/retro-idle.glb", "retro/retro-run.glb"], materialPolicy: "zombie-tint" },
      protagonistCriminal: { asset: "survivors/survivor-zombie.glb", texture: "protagonists/criminal-male-a.png", animationAssets: ["survivors/survivor-idle.glb", "survivors/survivor-run.glb"], materialPolicy: "zombie-tint" },
      protagonistCyborg: { asset: "survivors/survivor-zombie.glb", texture: "protagonists/cyborg-female-a.png", animationAssets: ["survivors/survivor-idle.glb", "survivors/survivor-run.glb"], materialPolicy: "zombie-tint" },
      protagonistSkaterFemale: { asset: "survivors/survivor-zombie.glb", texture: "protagonists/skater-female-a.png", animationAssets: ["survivors/survivor-idle.glb", "survivors/survivor-run.glb"], materialPolicy: "zombie-tint" },
      protagonistSkaterMale: { asset: "survivors/survivor-zombie.glb", texture: "protagonists/skater-male-a.png", animationAssets: ["survivors/survivor-idle.glb", "survivors/survivor-run.glb"], materialPolicy: "zombie-tint" },
      blockyZombieL: { asset: "characters/character-l.glb", materialPolicy: "native" },
      blockyZombieO: { asset: "characters/character-o.glb", materialPolicy: "native" },
      zombie: { asset: "monsters/character-zombie.glb", materialPolicy: "native" },
      skeleton: { asset: "monsters/character-skeleton.glb", materialPolicy: "native" },
      vampire: { asset: "monsters/character-vampire.glb", materialPolicy: "native" },
      ghost: { asset: "monsters/character-ghost.glb", materialPolicy: "native" },
      keeper: { asset: "monsters/character-keeper.glb", materialPolicy: "native" },
    },
    props: {
      tree: { asset: "platformer/tree.glb", collision: "decor-solid", materialPolicy: "palette" },
      pine: { asset: "platformer/tree-pine.glb", collision: "decor-solid", materialPolicy: "palette" },
      pineSmall: { asset: "platformer/tree-pine-small.glb", collision: "decor-solid", materialPolicy: "palette" },
      rocks: { asset: "platformer/rocks.glb", collision: "decor-solid", materialPolicy: "palette" },
      rubbleLarge: { asset: "castle/rocks-large.glb", collision: "decor-solid", materialPolicy: "replace" },
      rubbleSmall: { asset: "castle/rocks-small.glb", collision: "none", materialPolicy: "replace" },
      stones: { asset: "platformer/stones.glb", collision: "none", materialPolicy: "palette" },
      grass: { asset: "platformer/grass.glb", collision: "none", materialPolicy: "palette" },
      flowers: { asset: "platformer/flowers.glb", collision: "none", materialPolicy: "palette" },
      mushrooms: { asset: "platformer/mushrooms.glb", collision: "none", materialPolicy: "palette" },
      fence: { asset: "platformer/fence-straight.glb", collision: "decor-solid", materialPolicy: "palette" },
      fenceCorner: { asset: "platformer/fence-corner.glb", collision: "decor-solid", materialPolicy: "palette" },
      brokenFence: { asset: "platformer/fence-broken.glb", collision: "none", materialPolicy: "replace" },
      hedge: { asset: "platformer/hedge.glb", collision: "decor-solid", materialPolicy: "palette" },
      hedgeCorner: { asset: "platformer/hedge-corner.glb", collision: "decor-solid", materialPolicy: "palette" },
      chest: { asset: "platformer/chest.glb", collision: "interactable", materialPolicy: "palette" },
      crate: { asset: "platformer/crate.glb", collision: "decor-solid", materialPolicy: "palette" },
      strongCrate: { asset: "platformer/crate-strong.glb", collision: "decor-solid", materialPolicy: "palette" },
      barrel: { asset: "platformer/barrel.glb", collision: "decor-solid", materialPolicy: "palette" },
      sign: { asset: "platformer/sign.glb", collision: "none", materialPolicy: "palette" },
      flag: { asset: "platformer/flag.glb", collision: "none", materialPolicy: "palette" },
      lightpostSingle: { asset: "graveyard/lightpost-single.glb", collision: "none", materialPolicy: "night-emissive" },
      lightpostDouble: { asset: "graveyard/lightpost-double.glb", collision: "none", materialPolicy: "night-emissive" },
    },
  };

  const runtimeAllowlist = [];
  const textureAllowlist = [];
  for (const category of Object.values(roles)) {
    for (const role of Object.values(category)) {
      if (role.asset) runtimeAllowlist.push(role.asset);
      if (Array.isArray(role.assets)) runtimeAllowlist.push(...role.assets);
      if (Array.isArray(role.animationAssets)) runtimeAllowlist.push(...role.animationAssets);
      if (role.texture) textureAllowlist.push(role.texture);
    }
  }

  return Object.freeze({
    version: "8.8.0",
    primaryTerrainFamily: "platformer",
    allowedFamilies: Object.freeze(["platformer", "castle", "monsters", "td", "nature", "graveyard", "survivors", "retro", "protagonists", "characters", "industrial"]),
    excludedFamilies: Object.freeze({
      commercial: "现代城市建筑破坏中古工业生存语义",
      roads: "现代道路与交通设施不属于荒原据点",
      floors: "厚块地板与 TerrainSurface 重复且顶面难对齐",
      tdkit: "橙色塔防槽位语义过强，不作为通用地形",
    }),
    quarantinedAssets: Object.freeze({
      "castle/bridge-straight-pillar.glb": "隔离渲染仍不可见，禁止运行时加载",
    }),
    palette: Object.freeze({
      grass: 0x44483a,
      soil: 0x4a4032,
      stone: 0x68665f,
      iron: 0x4b4e4e,
      wood: 0x554638,
      brass: 0x9a7842,
      selection: 0x48e06f,
      danger: 0xb63a32,
    }),
    atmosphere: Object.freeze({
      background: 0x0b1019,
      fog: 0x1d2938,
      fogNear: 38,
      fogFar: 126,
      exposure: 0.90,
      dustParticles: 64,
    }),
    placement: Object.freeze({
      gridSize: 4,
      terrainBurialDepth: 0.06,
      decorClearance: 0.35,
      buildingPadding: 0.25,
      spawnLaneHalfWidth: 3,
      minRampRun: 1,
      maxWalkableSlopeDegrees: 30,
    }),
    roles: Object.freeze(roles),
    runtimeAllowlist: Object.freeze([...new Set(runtimeAllowlist)]),
    textureAllowlist: Object.freeze([...new Set(textureAllowlist)]),
  });
});

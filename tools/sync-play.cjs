"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const PUBLISH_ROOT = path.join(ROOT, "play", "niuniu-tank");
const FILES = [
  "index.html",
  "classic.html",
  "js/classic/classic-ui.css",
  "js/classic/classic-visuals.js",
  "js/classic/classic-feedback.js",
  "js/classic/classic-audio.js",
  "lib/GLTFLoader.js",
  "assets/castle/wall.glb",
  "assets/castle/wall-narrow.glb",
  "assets/commercial/building-c.glb",
  "assets/commercial/building-a.glb",
  "assets/commercial/Textures/colormap.png",
  "assets/castle/metal-gate.glb",
  "assets/nature/tree_oak.glb",
  "js/classic/classic-config.js",
  "js/classic/classic-rules.js",
  "js/classic/classic-upgrades.js",
  "js/classic/classic-engine.js",
  "lib/three.min.js",
  "js/config.js",
  "js/engine.js",
  "js/wave-pressure.js",
  "js/crowd-lod.js",
  "js/construction-system.js",
  "js/construction-runtime.js",
  "js/building-models.js",
  "js/combat-specializations.js",
  "js/survival-audio.js",
  "js/natural-terrain.js",
  "js/home.js",
  "js/survival-assets.js",
  "js/survival-system.js",
  "js/terrain-surface.js",
  "js/flow-field.js",
  "js/lib/SkeletonUtils.js",
  "assets/graveyard/lightpost-single.glb",
  "assets/graveyard/lightpost-double.glb",
  "assets/graveyard/Textures/colormap.png",
  "assets/survivors/survivor-zombie.glb",
  "assets/survivors/survivor-idle.glb",
  "assets/survivors/survivor-run.glb",
  "assets/survivors/zombie-a.png",
  "assets/survivors/zombie-c.png",
  "assets/survivors/survivor-female-a.png",
  "assets/survivors/survivor-male-b.png",
  "assets/survivors/LICENSE.txt",
  "assets/retro/retro-zombie.glb",
  "assets/retro/retro-idle.glb",
  "assets/retro/retro-run.glb",
  "assets/retro/zombie-female-a.png",
  "assets/retro/zombie-male-a.png",
  "assets/retro/human-female-a.png",
  "assets/retro/human-male-a.png",
  "assets/retro/LICENSE.txt",
  "assets/protagonists/criminal-male-a.png",
  "assets/protagonists/cyborg-female-a.png",
  "assets/protagonists/skater-female-a.png",
  "assets/protagonists/skater-male-a.png",
  "assets/protagonists/LICENSE.txt",
  "assets/industrial/building-c.glb",
  "assets/industrial/building-d.glb",
  "assets/industrial/building-g.glb",
  "assets/industrial/building-i.glb",
  "assets/industrial/building-m.glb",
  "assets/industrial/building-s.glb",
  "assets/industrial/building-t.glb",
  "assets/industrial/chimney-basic.glb",
  "assets/industrial/Textures/colormap.png",
  "assets/castle/gate.glb",
  "assets/castle/Textures/colormap.png",
];

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const checkOnly = process.argv.includes("--check");
const mismatches = [];

for (const relative of FILES) {
  const source = path.join(ROOT, relative);
  const destination = path.join(PUBLISH_ROOT, relative);
  if (!fs.existsSync(source)) throw new Error(`缺少源码文件：${relative}`);
  if (checkOnly) {
    if (!fs.existsSync(destination) || digest(source) !== digest(destination)) mismatches.push(relative);
    continue;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

if (checkOnly && mismatches.length) {
  throw new Error(`发布副本与源码不一致：${mismatches.join(", ")}`);
}

console.log(checkOnly ? `发布副本一致：${FILES.length} 个文件` : `发布副本已同步：${FILES.length} 个文件`);

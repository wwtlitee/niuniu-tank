"use strict";

const fs = require("node:fs");
const path = require("node:path");

function scanCanonicalAssets(assetRoot) {
  const root = path.resolve(assetRoot);
  const files = [];
  const categories = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "assets")
    .sort((a, b) => a.name.localeCompare(b.name));

  const walk = (directory, category) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, category);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(absolute);
      files.push({
        category,
        relative: path.relative(root, absolute).split(path.sep).join("/"),
        absolute,
        extension: path.extname(entry.name).toLowerCase(),
        bytes: stat.size,
      });
    }
  };

  for (const category of categories) walk(path.join(root, category.name), category.name);
  return { root, files, glbs: files.filter((file) => file.extension === ".glb") };
}

function readAssetRegistry(engineFile) {
  const source = fs.readFileSync(engineFile, "utf8");
  const start = source.indexOf("const ASSET_FILES=[");
  if (start < 0) throw new Error(`ASSET_FILES not found in ${engineFile}`);
  const end = source.indexOf("];", start);
  if (end < 0) throw new Error(`ASSET_FILES is not terminated in ${engineFile}`);
  const block = source.slice(start, end + 2);
  return [...block.matchAll(/\[\s*["']([^"']+\/)["']\s*,\s*["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?\s*\]/g)]
    .map((match) => ({
      directory: match[1],
      name: match[2],
      key: match[3]||match[2],
      relative: `${match[1]}${match[2]}.glb`,
    }));
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function auditAssets({ assetRoot, engineFile }) {
  const inventory = scanCanonicalAssets(assetRoot);
  const registry = readAssetRegistry(engineFile);
  const available = new Set(inventory.glbs.map((file) => file.relative));
  const registered = new Set(registry.map((entry) => entry.relative));
  const missing = registry.map((entry) => entry.relative)
    .filter((relative) => !available.has(relative))
    .sort();
  const unregistered = inventory.glbs.map((file) => file.relative)
    .filter((relative) => !registered.has(relative))
    .sort();
  const categorySummary = Object.values(inventory.files.reduce((summary, file) => {
    const row = summary[file.category] || (summary[file.category] = {
      category: file.category,
      files: 0,
      glbs: 0,
      bytes: 0,
    });
    row.files++;
    row.bytes += file.bytes;
    if (file.extension === ".glb") row.glbs++;
    return summary;
  }, {})).sort((a, b) => a.category.localeCompare(b.category));

  return {
    generatedAt: new Date().toISOString(),
    assetRoot: inventory.root,
    totals: {
      files: inventory.files.length,
      glbs: inventory.glbs.length,
      registered: registry.length,
      bytes: inventory.files.reduce((sum, file) => sum + file.bytes, 0),
    },
    categorySummary,
    registry,
    missing,
    unregistered,
    duplicateRegistryKeys: findDuplicates(registry.map((entry) => entry.key)),
  };
}

module.exports = { scanCanonicalAssets, readAssetRegistry, auditAssets };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  process.stdout.write(`${JSON.stringify(auditAssets({
    assetRoot: path.join(root, "assets"),
    engineFile: path.join(root, "js", "engine.js"),
  }), null, 2)}\n`);
}

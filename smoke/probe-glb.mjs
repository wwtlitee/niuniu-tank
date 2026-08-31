/* 解析 tdkit/platformer GLB 的 JSON chunk：mesh 名 + 材质名 + baseColorFactor，认脸用 */
import fs from "fs";
import path from "path";

function glbJson(p) {
  const buf = fs.readFileSync(p);
  if (buf.readUInt32LE(0) !== 0x46546C67) return null; // 'glTF'
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
}

const dirs = ["assets/tdkit", "assets/platformer"];
for (const dir of dirs) {
  console.log("=== " + dir + " ===");
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".glb")).sort()) {
    const p = path.join(dir, f);
    try {
      const j = glbJson(p);
      const meshes = (j.meshes || []).map(m => m.name).join(",");
      const mats = (j.materials || []).map(m => {
        const c = (m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) || [1,1,1,1];
        const col = c.map(v => Math.round(v * 255));
        return `${m.name || "?"}rgb(${col[0]},${col[1]},${col[2]})`;
      }).join(" | ");
      console.log(`${f.replace(".glb","").padEnd(24)} mesh[${meshes}] mat[${mats}]`);
    } catch (e) { console.log(`${f} ERROR ${e.message}`); }
  }
}

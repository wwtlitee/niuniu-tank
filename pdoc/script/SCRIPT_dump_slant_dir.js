// 采样 tile-slant 四条边的 y 范围，确定默认高边朝向
// 用法: node pdoc/script/SCRIPT_dump_slant_dir.js
const fs = require("fs");
function edgeProfile(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const out = [];
  for (const mesh of json.meshes || []) {
    for (const p of mesh.primitives) {
      const acc = json.accessors[p.attributes.POSITION];
      const bv = json.bufferViews[acc.bufferView];
      const off = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const cs = 4, n = 3;
      const e = { north: [1e9, -1e9], south: [1e9, -1e9], west: [1e9, -1e9], east: [1e9, -1e9] };
      for (let i = 0; i < acc.count; i++) {
        const q = off + i * cs * n;
        const x = b.readFloatLE(q), y = b.readFloatLE(q + cs), z = b.readFloatLE(q + 2 * cs);
        const put = (k) => { if (y < e[k][0]) e[k][0] = y; if (y > e[k][1]) e[k][1] = y; };
        if (z < -0.49) put("north");
        if (z > 0.49) put("south");
        if (x < -0.49) put("west");
        if (x > 0.49) put("east");
      }
      const f = (a) => "[" + a.map(v => +v.toFixed(3)).join("~") + "]";
      out.push(`N${f(e.north)} S${f(e.south)} W${f(e.west)} E${f(e.east)}`);
    }
  }
  return out;
}
for (const f of ["assets/roads/tile-slant.glb"]) {
  try {
    console.log(f, edgeProfile(f).join(" | "));
  } catch (e) {
    console.log(f, "ERR", e.message);
  }
}

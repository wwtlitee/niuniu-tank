// 解析 GLB JSON chunk，输出 POSITION accessor 的包围盒（用于确定模型真实尺寸）
// 用法: node pdoc/script/SCRIPT_dump_bbox.js
const fs = require("fs");
const files = [
  "assets/roads/tile-high.glb",
  "assets/roads/tile-low.glb",
  "assets/roads/tile-slant.glb",
  "assets/roads/tile-slantHigh.glb",
  "assets/nature/cliff_block_rock.glb",
  "assets/nature/cliff_blockSlope_rock.glb",
  "assets/nature/cliff_half_rock.glb",
  "assets/castle/rocks-large.glb",
  "assets/castle/tower-square-base.glb",
];
for (const f of files) {
  try {
    const b = fs.readFileSync(f);
    const jsonLen = b.readUInt32LE(12);
    const json = JSON.parse(b.slice(20, 20 + jsonLen).toString("utf8"));
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const mesh of json.meshes || []) {
      for (const p of mesh.primitives) {
        const acc = json.accessors[p.attributes.POSITION];
        if (acc && acc.min && acc.max) {
          for (let i = 0; i < 3; i++) {
            mn[i] = Math.min(mn[i], acc.min[i]);
            mx[i] = Math.max(mx[i], acc.max[i]);
          }
        }
      }
    }
    const size = mx.map((v, i) => +(v - mn[i]).toFixed(3));
    console.log(
      f.replace("assets/", "").padEnd(38),
      "size(x,y,z)=", size.join(" x ").padEnd(22),
      " min=(", mn.map(v => +v.toFixed(2)).join(","), ")",
      " max=(", mx.map(v => +v.toFixed(2)).join(","), ")"
    );
  } catch (e) {
    console.log(f, "ERR", e.message);
  }
}

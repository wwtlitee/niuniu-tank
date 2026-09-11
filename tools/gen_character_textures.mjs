// 给 blocky-characters 5 个 GLB 生成占位贴图（无原始 KTX2 时的灰白回退）
// 最小 PNG：8x8 RGB 同色，写入 assets/characters/Textures/texture-{l,r,o,j,g}.png
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../assets/characters/Textures");
mkdirSync(OUT_DIR, { recursive: true });

// 各角色主色（与 ENEMY_KINDS 染色对齐：normal=蓝灰, fast=橙, heavy=绿, sniper=紫, boss=红）
const COLORS = {
  l: [0x6b, 0x7a, 0x8a], // 蓝灰
  r: [0xd9, 0x6a, 0x3a], // 橙
  o: [0x4a, 0xa6, 0x55], // 绿
  j: [0x9b, 0x6c, 0xc4], // 紫
  g: [0xc4, 0x3a, 0x3a], // 红
};

/* 最小 1x1 PNG 编码（标准 PNG + IDAT 已压缩） */
function pngBuffer(r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([t, data]);
    const crcTable = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      return t;
    })();
    let c = 0xffffffff;
    for (let i = 0; i < crcInput.length; i++) c = crcTable[(c ^ crcInput[i]) & 0xff] ^ (c >>> 8);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw image data: filter byte + 3 bytes RGB
  const raw = Buffer.from([0, r, g, b]);
  // zlib header + uncompressed deflate + adler32
  const adler = (() => {
    let a = 1, b2 = 0;
    for (const v of raw) { a = (a + v) % 65521; b2 = (b2 + a) % 65521; }
    const out = Buffer.alloc(4);
    out.writeUInt32BE((b2 << 16) | a, 0);
    return out;
  })();
  const zlibBody = Buffer.concat([Buffer.from([0x78, 0x01]), raw, adler]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibBody),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [k, [r, g, b]] of Object.entries(COLORS)) {
  const buf = pngBuffer(r, g, b);
  const out = resolve(OUT_DIR, `texture-${k}.png`);
  writeFileSync(out, buf);
  console.log(`✓ ${out} (${buf.length} bytes, RGB ${r},${g},${b})`);
}

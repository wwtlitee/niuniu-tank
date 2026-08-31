/* 权威资产配色审计：把每个候选 GLB 单独离屏渲染，采样非背景像素平均 RGB，
   判定哪些素材本质上是橙红（R 明显 > G,B）。baseColorFactor 全是白，颜色来自 colormap 纹理，
   所以必须真实渲染采样才可信。 */
import { chromium } from "playwright";

const NAMES = [
  "tile", "tile-bump", "tile-dirt", "tile-rock", "tile-hill", "tile-tree",
  "tile-straight", "tile-crossing", "tile-corner-inner", "tile-corner-outer",
  "tile-end", "tile-split", "tile-wide-straight", "tile-wide-corner",
  "tile-straight-slope", "spawn-square",
  "block-grass", "block-grass-large-slope", "block-grass-low", "block-grass-long",
  "block-grass-large", "block-grass-corner", "block-grass-edge",
  "flowers", "flowers-tall", "plant", "grass", "mushrooms", "stones", "rocks", "tree",
  "tile-high", "tile-low", "tile-slant", "tile-slantHigh",
  "cliff_block_rock", "cliff_blockSlope_rock", "cliff_large_rock", "cliff_half_rock",
  "rocks-small", "rocks-large",
];

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&t=" + Date.now(), { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });

const result = await p.evaluate((names) => {
  const size = 160;
  const r2 = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  r2.setSize(size, size);
  const sc2 = new THREE.Scene();
  sc2.background = new THREE.Color(0x000000);
  const amb = new THREE.AmbientLight(0xffffff, 0.85); sc2.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.7); dir.position.set(1, 2, 1.4); sc2.add(dir);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
  const gl = r2.getContext();
  const buf = new Uint8Array(size * size * 4);
  const out = {};
  for (const n of names) {
    const src = ASSETS[n];
    if (!src) { out[n] = "MISSING"; continue; }
    const obj = src.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const ctr = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1;
    obj.position.sub(ctr);
    const g = new THREE.Group(); g.add(obj); sc2.add(g);
    const dist = maxd * 1.7;
    cam.position.set(dist, dist * 0.85, dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    r2.render(sc2, cam);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let rs = 0, gs = 0, bs = 0, cnt = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      if (R + G + B < 24) continue;            // 跳过近黑背景
      rs += R; gs += G; bs += B; cnt++;
    }
    sc2.remove(g);
    obj.traverse(o => { if (o.isMesh && !_sharedGeoms.has(o.geometry)) o.geometry.dispose(); });
    out[n] = cnt ? { avg: [Math.round(rs / cnt), Math.round(gs / cnt), Math.round(bs / cnt)], cov: +(cnt / (size * size)).toFixed(2) } : "blank";
  }
  r2.dispose();
  return out;
}, NAMES);

const verdict = (a) => {
  if (typeof a === "string") return a;
  const [r, g, bb] = a.avg;
  const red = r > g + 25 && r > bb + 25;
  const green = g > r + 10 && g > bb + 10;
  return `${red ? "★RED" : green ? "green" : "neutral"} rgb(${r},${g},${bb}) cov=${a.cov}`;
};
console.log("=== 资产渲染平均色审计 ===");
for (const n of NAMES) console.log(`  ${n.padEnd(24)} ${verdict(result[n])}`);
process.exit(0);

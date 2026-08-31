/* 重点关注资产配色采样：树族 / spawn-square / flowers / plant / mushrooms / 装饰
   —— 判定哪些在真实渲染下仍呈橙红（R 明显 > G,B），定位 c6-wild 红花瓶/盆栽违和源。 */
import { chromium } from "playwright";

const NAMES = [
  "tree_default", "tree_oak", "tree_cone", "tree_detailed", "tree_fat", "tree_palm",
  "spawn-square",
  "flowers", "flowers-tall", "plant", "grass", "mushrooms", "rocks", "stones",
  "tree",
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
    let rs = 0, gs = 0, bs = 0, cnt = 0, maxR = 0, redCnt = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      if (R + G + B < 24) continue;
      rs += R; gs += G; bs += B; cnt++;
      if (R > G + 25 && R > B + 25) redCnt++;
      if (R > maxR) maxR = R;
    }
    sc2.remove(g);
    obj.traverse(o => { if (o.isMesh && !_sharedGeoms.has(o.geometry)) o.geometry.dispose(); });
    out[n] = cnt ? { avg: [Math.round(rs / cnt), Math.round(gs / cnt), Math.round(bs / cnt)], cov: +(cnt / (size * size)).toFixed(2), maxR, redFrac: +(redCnt / cnt).toFixed(3) } : "blank";
  }
  r2.dispose();
  return out;
}, NAMES);

const verdict = (a) => {
  if (typeof a === "string") return a;
  const [r, g, bb] = a.avg;
  const red = r > g + 25 && r > bb + 25;
  const green = g > r + 10 && g > bb + 10;
  return `${red ? "★RED" : green ? "green" : "neutral"} avg rgb(${r},${g},${bb}) maxR=${a.maxR} redFrac=${a.redFrac}`;
};
console.log("=== 重点资产渲染平均色审计 ===");
for (const n of NAMES) console.log(`  ${n.padEnd(20)} ${verdict(result[n])}`);
process.exit(0);

/* 全资产离屏渲染采样：穷举 ASSETS 下每个资产克隆后渲染到小画布，
   统计平均色 + 红色像素占比，作为"3D 场景权威色卡"。
   完全绕开 UI/HUD，输出可被最终报告直接引用。 */
import { chromium } from "playwright";

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&t=" + Date.now(), { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });
await p.waitForFunction(() => typeof state !== "undefined" && state === 7, { timeout: 40000 });
await p.waitForTimeout(800);

const result = await p.evaluate(() => {
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
  for (const n of Object.keys(ASSETS)) {
    const src = ASSETS[n];
    if (!src) { out[n] = "MISSING"; continue; }
    const obj = src.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const ctr = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1;
    if (!isFinite(maxd) || maxd <= 0) { out[n] = "EMPTY"; continue; }
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
    obj.traverse(o => { if (o.isMesh) o.geometry.dispose && o.geometry.dispose(); });
    out[n] = cnt ? {
      avg: [Math.round(rs / cnt), Math.round(gs / cnt), Math.round(bs / cnt)],
      cov: +(cnt / (size * size)).toFixed(2),
      maxR, redFrac: +(redCnt / cnt).toFixed(3),
    } : "blank";
  }
  r2.dispose();
  return out;
});

const verdict = (a) => {
  if (typeof a === "string") return a;
  const [r, g, bb] = a.avg;
  const red = r > g + 25 && r > bb + 25;
  const green = g > r + 10 && g > bb + 10;
  return `${red ? "★RED " : green ? "green" : "neutral"}  avg rgb(${r},${g},${bb}) maxR=${a.maxR} redFrac=${a.redFrac} cov=${a.cov}`;
};

const entries = Object.entries(result).sort((a, b) => {
  const ar = typeof a[1] === "string" ? 0 : a[1].redFrac;
  const br = typeof b[1] === "string" ? 0 : b[1].redFrac;
  return br - ar;
});

console.log("=== 全 ASSETS 离屏渲染色卡（按 redFrac 倒序）===");
for (const [n, v] of entries) console.log(`  ${n.padEnd(24)} ${verdict(v)}`);
console.log(`\n  共 ${entries.length} 项`);
process.exit(0);
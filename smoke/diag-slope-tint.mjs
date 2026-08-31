/* 验证：把 tile-straight-slope 的橙色 colormap 用不同绿色乘数染色后，实际渲染是否可读作"绿草坡"，
   并检测是否仍有暖色残留/斑驳。 */
import { chromium } from "playwright";

const TINTS = [
  [0.3, 1.2, 0.5],
  [0.32, 1.3, 0.55],
  [0.36, 1.45, 0.62],
  [0.42, 1.7, 0.72],
];

const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
await p.goto("http://127.0.0.1:8030/?mode=survival&autotest=1&t=" + Date.now(), { waitUntil: "load", timeout: 60000 });
await p.waitForFunction(() => typeof assetsReady === "function" && assetsReady() === true, { timeout: 60000 });

const result = await p.evaluate((tints) => {
  const size = 160;
  const r2 = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  r2.setSize(size, size);
  const sc2 = new THREE.Scene();
  sc2.background = new THREE.Color(0x000000);
  sc2.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7); dir.position.set(1, 2, 1.4); sc2.add(dir);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
  const gl = r2.getContext();
  const buf = new Uint8Array(size * size * 4);
  const src = ASSETS["tile-straight-slope"];
  const out = {};
  for (const t of tints) {
    const obj = src.clone(true);
    obj.traverse(o => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.color = new THREE.Color(t[0], t[1], t[2]);
        o.material.roughness = 0.95;
      }
    });
    const box = new THREE.Box3().setFromObject(obj);
    const ctr = box.getCenter(new THREE.Vector3());
    obj.position.sub(ctr);
    const g = new THREE.Group(); g.add(obj); sc2.add(g);
    const maxd = Math.max(...box.getSize(new THREE.Vector3()).toArray()) || 1;
    const dist = maxd * 1.7;
    cam.position.set(dist, dist * 0.85, dist);
    cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    r2.render(sc2, cam);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let rs = 0, gs = 0, bs = 0, cnt = 0, rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      if (R + G + B < 24) continue;
      rs += R; gs += G; bs += B; cnt++;
      rmin = Math.min(rmin, R); rmax = Math.max(rmax, R);
      gmin = Math.min(gmin, G); gmax = Math.max(gmax, G);
      bmin = Math.min(bmin, B); bmax = Math.max(bmax, B);
    }
    sc2.remove(g);
    out[`(${t.join(",")})`] = cnt ? {
      avg: [Math.round(rs / cnt), Math.round(gs / cnt), Math.round(bs / cnt)],
      rRange: [rmin, rmax], gRange: [gmin, gmax], bRange: [bmin, bmax],
      red: rs / cnt > gs / cnt + 25 && rs / cnt > bs / cnt + 25,
    } : "blank";
  }
  r2.dispose();
  return out;
}, TINTS);

console.log("=== tile-straight-slope 染色验证 ===");
for (const k of Object.keys(result)) {
  const v = result[k];
  if (typeof v === "string") { console.log(`  ${k} ${v}`); continue; }
  console.log(`  tint ${k}`);
  console.log(`    avg rgb(${v.avg[0]},${v.avg[1]},${v.avg[2]}) ${v.red ? "★仍偏红" : "green OK"}`);
  console.log(`    R[${v.rRange}] G[${v.gRange}] B[${v.bRange}]`);
}
process.exit(0);

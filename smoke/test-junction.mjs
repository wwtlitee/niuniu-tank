import fs from 'fs';
const p = 'E:/GameHub/games/tank3d/play/niuniu-tank/assets/platformer/block-grass.glb';
try { const s = fs.statSync(p); console.log('size:', s.size); }
catch(e) { console.log('err:', e.code); }

// 也测试 readFile
try {
  const data = fs.readFileSync(p);
  console.log('readFile ok, length:', data.length);
} catch(e) {
  console.log('readFile err:', e.code);
}

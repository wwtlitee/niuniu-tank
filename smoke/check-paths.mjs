import path from 'path';
import fs from 'fs';
const ROOT = path.resolve('E:/GameHub/games/tank3d/.tmp', '..');
console.log('ROOT:', ROOT);
const urls = [
  '/play/niuniu-tank/index.html',
  '/play/niuniu-tank/js/engine.js',
  '/play/niuniu-tank/assets/platformer/block-grass.glb',
  '/play/niuniu-tank/assets/tdkit/tile-straight-slope.glb',
  '/play/niuniu-tank/assets/nature/tree_default.glb',
  '/assets/platformer/block-grass.glb',
  '/assets/tdkit/tile-straight-slope.glb',
];
for(const u of urls){
  const safe = path.normalize(u).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(ROOT, safe);
  let size = 0;
  try { const s = fs.statSync(file); size = s.size; } catch(e) {}
  console.log(size > 0 ? 'OK' : 'MISS', size.toString().padStart(8), u);
}

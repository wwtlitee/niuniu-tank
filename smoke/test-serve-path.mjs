import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('E:/GameHub/games/tank3d/.tmp', '..');
const urlPath = '/play/niuniu-tank/assets/platformer/block-grass.glb';
const safe = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
const file = path.join(ROOT, safe);

console.log('ROOT:', ROOT);
console.log('file:', file);

try {
  const stat = fs.statSync(file);
  console.log('stat size:', stat.size);
} catch(e) {
  console.log('stat err:', e.code);
}

try {
  const data = fs.readFileSync(file);
  console.log('readFile length:', data.length);
} catch(e) {
  console.log('readFile err:', e.code);
}

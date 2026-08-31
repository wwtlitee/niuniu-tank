const fs = require("fs");
const t = fs.readFileSync("lib/three.min.js", "utf8");
console.log("three size KB:", (t.length / 1024).toFixed(0));
const g = fs.readFileSync("lib/GLTFLoader.js", "utf8");
console.log("loader size KB:", (g.length / 1024).toFixed(0));
const ids = [...new Set(g.match(/\bTHREE\.[A-Za-z0-9_]+/g) || [])].sort();
console.log("THREE.* refs in loader:", ids.length);
const missing = ids.filter(k => {
  const name = k.slice(6);
  return !new RegExp("[.:\\[\\s,(]" + name + "\\s*[:=(]").test(t) && !t.includes(name);
});
console.log("MISSING in r128:", missing.length ? missing.join(", ") : "(none)");
/* 常见版本错配高危点 */
["SRGBColorSpace", "LinearSRGBColorSpace", "colorSpace", "KTX2Loader", "meshopt"].forEach(k =>
  console.log("loader uses", k + ":", g.includes(k), "| r128 has:", t.includes(k)));
console.log("GLTFLoader HEAD:", g.slice(0, 260).replace(/\n/g, " | "));
console.log("GLTFLoader UMD wrap:", /module\.exports|define\(/.test(g.slice(0, 800)));
console.log("GLTFLoader size KB:", (g.length / 1024).toFixed(0));

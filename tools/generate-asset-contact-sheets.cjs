"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

const GEOMETRY_PREVIEW_ASSETS = new Set([
  "castle/bridge-straight.glb",
  "castle/gate.glb",
  "castle/metal-gate.glb",
]);
const UNUSABLE_PREVIEW_ASSETS = new Set(["castle/bridge-straight-pillar.glb"]);

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const catalogFile = path.join(projectRoot, "pdoc", "material", "MAT_全量模型运行态台账_v5.0.0.json");
  const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
  const files = catalog.models.map((model) => model.relative);
  const pageSize = 16;
  const chunks = [];
  /* Keep texture families on the same sheet, but never mix two source packs.
     Besides making visual comparison meaningful, this avoids exhausting a
     software WebGL context when unrelated packs each bring their own atlas. */
  const families = new Map();
  for (const relative of files) {
    const family = relative.split("/")[0];
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(relative);
  }
  for (const familyFiles of families.values()) {
    const familyPageSize = familyFiles[0].startsWith("castle/") ? 1 : pageSize;
    for (let i = 0; i < familyFiles.length; i += familyPageSize) chunks.push(familyFiles.slice(i, i + familyPageSize));
  }

  const server = await createStaticServer(projectRoot);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const outputDir = path.join(projectRoot, "pdoc", "material");
  try {
    for (let pageIndex = 0; pageIndex < chunks.length; pageIndex++) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html><head><style>
        *{box-sizing:border-box}body{margin:0;background:#201d19;color:#f2e8cf;font-family:Consolas,"Microsoft YaHei",sans-serif;overflow:hidden}
        #labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(4,1fr);pointer-events:none}
        .cell{border:1px solid #665d4c;position:relative;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(0,0,0,.08))}
        .name{position:absolute;left:8px;right:8px;bottom:7px;padding:5px 7px;background:rgba(12,10,8,.78);font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:3px solid #d6a84b}
        canvas{position:absolute;inset:0}
      </style></head><body><script src="${origin}/lib/three.min.js"></script><script src="${origin}/lib/GLTFLoader.js"></script><div id="labels"></div></body></html>`);
      await page.waitForFunction(() => typeof THREE !== "undefined" && typeof THREE.GLTFLoader === "function");
      await page.evaluate(async ({ origin, files, geometryPreviewAssets }) => {
        const width = 1600, height = 1000, cols = 4, rows = 4;
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
        renderer.setPixelRatio(1); renderer.setSize(width, height); renderer.setScissorTest(true);
        document.body.prepend(renderer.domElement);
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xfff3d5, 0x3b4650, 1.15));
        const light = new THREE.DirectionalLight(0xffffff, 1.1); light.position.set(4, 7, 5); scene.add(light);
        const camera = new THREE.PerspectiveCamera(34, (width / cols) / (height / rows), .01, 100);
        camera.position.set(2.8, 2.25, 2.8); camera.lookAt(0, 0, 0);
        const loader = new THREE.GLTFLoader();
        const load = (relative) => new Promise((resolve, reject) => loader.load(`${origin}/assets/${relative}`, resolve, undefined, reject));
        const loaded = [];
        for (const relative of files) loaded.push({ relative, gltf: await load(relative) });
        const labels = document.getElementById("labels");
        for (let index = 0; index < 16; index++) {
          const cell = document.createElement("div"); cell.className = "cell";
          if (loaded[index]) {
            const marker = unusablePreviewAssets.includes(loaded[index].relative)
              ? " [不可见禁用]"
              : geometryPreviewAssets.includes(loaded[index].relative) ? " [材质待修]" : "";
            cell.innerHTML = `<div class="name">${loaded[index].relative}${marker}</div>`;
          }
          labels.appendChild(cell);
        }
        renderer.setClearColor(0x2b2822, 1);
        for (let index = 0; index < loaded.length; index++) {
          const object = loaded[index].gltf.scene;
          if (geometryPreviewAssets.includes(loaded[index].relative)) {
            object.traverse((child) => {
              if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: 0x91a0ad, roughness: .82, metalness: .08 });
            });
          }
          const box = new THREE.Box3().setFromObject(object);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const scale = 1.9 / Math.max(size.x, size.y, size.z, .001);
          object.scale.setScalar(scale);
          const scaledBox = new THREE.Box3().setFromObject(object);
          const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
          object.position.sub(scaledCenter);
          object.rotation.y = -.42;
          scene.add(object);
          const col = index % cols, row = Math.floor(index / cols);
          const cellW = width / cols, cellH = height / rows;
          const x = col * cellW, y = height - (row + 1) * cellH;
          renderer.setViewport(x, y, cellW, cellH);
          renderer.setScissor(x, y, cellW, cellH);
          renderer.render(scene, camera);
          scene.remove(object);
        }
        /* Chromium occasionally loses the first WebGL canvas while taking a full-page
           screenshot. Freeze the completed framebuffer into a normal image first so
           every sheet is a stable, auditable artifact rather than a GPU timing result. */
        renderer.setScissorTest(false);
        const frozen = document.createElement("img");
        frozen.id = "frozen-render";
        frozen.alt = "asset contact sheet render";
        frozen.src = renderer.domElement.toDataURL("image/png");
        frozen.style.cssText = "position:absolute;inset:0;width:1600px;height:1000px";
        document.body.insertBefore(frozen, labels);
        await frozen.decode();
        renderer.dispose();
        renderer.domElement.remove();
      }, {
        origin,
        files: chunks[pageIndex],
        geometryPreviewAssets: [...GEOMETRY_PREVIEW_ASSETS],
        unusablePreviewAssets: [...UNUSABLE_PREVIEW_ASSETS],
      });
      await page.waitForTimeout(250);
      const number = String(pageIndex + 1).padStart(2, "0");
      await page.screenshot({ path: path.join(outputDir, `MAT_资产证件照_${number}_v5.0.0.png`) });
      await page.close();
      process.stdout.write(`sheet ${number}/${String(chunks.length).padStart(2, "0")} models=${chunks[pageIndex].length}\n`);
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { GEOMETRY_PREVIEW_ASSETS, UNUSABLE_PREVIEW_ASSETS };

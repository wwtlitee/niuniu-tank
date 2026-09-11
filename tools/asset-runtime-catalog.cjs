"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
};

async function createStaticServer(projectRoot) {
  const root = path.resolve(projectRoot);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname.replace(/^\/+/, "");
    const absolute = path.resolve(root, relative);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(absolute, (error, data) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code || "error");
        return;
      }
      response.writeHead(200, {
        "content-type": MIME[path.extname(absolute).toLowerCase()] || "application/octet-stream",
        "access-control-allow-origin": "*",
      });
      response.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function collectRuntimeCatalog({ projectRoot, relativeFiles }) {
  const root = path.resolve(projectRoot);
  const server = await createStaticServer(root);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><script src="${origin}/lib/three.min.js"></script><script src="${origin}/lib/GLTFLoader.js"></script>`);
    await page.waitForFunction(() => typeof THREE !== "undefined" && typeof THREE.GLTFLoader === "function");
    return await page.evaluate(async ({ origin, relativeFiles }) => {
      const loader = new THREE.GLTFLoader();
      const round = (value) => Number(value.toFixed(4));
      const load = (relative) => new Promise((resolve, reject) => {
        loader.load(`${origin}/assets/${relative}`, resolve, undefined, reject);
      });
      const rows = [];
      for (const relative of relativeFiles) {
        const gltf = await load(relative);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        let meshes = 0;
        let vertices = 0;
        let materials = 0;
        let skinnedMeshes = 0;
        gltf.scene.traverse((object) => {
          if (!object.isMesh) return;
          meshes++;
          if (object.isSkinnedMesh) skinnedMeshes++;
          vertices += object.geometry && object.geometry.attributes && object.geometry.attributes.position
            ? object.geometry.attributes.position.count
            : 0;
          materials += Array.isArray(object.material) ? object.material.length : 1;
        });
        rows.push({
          relative,
          min: box.min.toArray().map(round),
          max: box.max.toArray().map(round),
          size: size.toArray().map(round),
          meshes,
          skinnedMeshes,
          vertices,
          materials,
          animations: (gltf.animations || []).map((animation) => animation.name),
        });
      }
      return rows;
    }, { origin, relativeFiles });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = { collectRuntimeCatalog, createStaticServer };

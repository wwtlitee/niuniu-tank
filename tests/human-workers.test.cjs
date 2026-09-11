const { test } = require('node:test');
const assert = require('node:assert/strict'),
  path = require('node:path');
const { chromium } = require('playwright');
const { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');
test('Kenney 人类工程队轮换外观、播放完整跑步动作，并安全释放独占资源', async () => {
  const server = await createStaticServer(path.resolve(__dirname, '..'));
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mode=survival&autotest=1`);
    await page.waitForFunction(() => typeof state !== 'undefined' && state === 7);
    const result = await page.evaluate(() => {
      state = STATE.PAUSED;
      if (typeof CONSTRUCTION_WORKER_VARIANTS === 'undefined') return { missing: true };
      const workers = Array.from({ length: 8 }, () => makeConstructionWorker());
      const variants = workers.map((w) => w.userData.variantId);
      let sharedGeometryDisposals = 0,
        skeletonDisposals = 0;
      const geometries = new Set(),
        skeletons = new Set();
      const shape = workers.map((w) => {
        let skin = 0,
          meshes = 0;
        w.traverse((o) => {
          if (o.isMesh) meshes++;
          if (o.isSkinnedMesh) {
            skin++;
            geometries.add(o.geometry);
            skeletons.add(o.skeleton);
          }
        });
        return {
          skin,
          meshes,
          skinning: w.userData.humanMaterial?.skinning === true,
          source: w.userData.assetName,
          map: w.userData.humanMaterial?.map === ASSET_TEXTURES[w.userData.variantId],
          naturalColor: w.userData.humanMaterial?.color.getHex() === 0xffffff,
        };
      });
      for (const g of geometries) g.addEventListener('dispose', () => sharedGeometryDisposals++);
      for (const s of skeletons) s.dispose = () => skeletonDisposals++;
      const worker = workers[0],
        arm = worker.userData.poseBones.RightArm;
      updateConstructionWorker(worker, 'walk', 0.05);
      const a = arm.quaternion.clone();
      updateConstructionWorker(worker, 'walk', 0.25);
      const animated = a.angleTo(arm.quaternion) > 0.01;
      updateConstructionWorker(worker, 'work', 0.05, 0.1);
      const b = worker.userData.poseBones.RightHand.getWorldPosition(new THREE.Vector3());
      updateConstructionWorker(worker, 'work', 0.1, 0.32);
      const c = worker.userData.poseBones.RightHand.getWorldPosition(new THREE.Vector3());
      const hammerMoves = b.distanceTo(c) > 0.05;
      const restored = makeConstructionWorker(variants[3]),
        retained = restored.userData.variantId === variants[3];
      disposeConstructionWorker(restored);
      workers.forEach(disposeConstructionWorker);
      const after = makeConstructionWorker();
      updateConstructionWorker(after, 'walk', 0.1);
      const stillUsable = !!after.userData.humanMaterial.map;
      disposeConstructionWorker(after);
      return {
        variants,
        shape,
        animated,
        hammerMoves,
        retained,
        stillUsable,
        sharedGeometryDisposals,
        skeletonDisposals,
        skeletons: skeletons.size,
        prewarmed: typeof constructionWorkerWarmState !== 'undefined' && constructionWorkerWarmState.ready,
      };
    });
    assert.equal(result.missing, undefined, '接入原生人类角色');
    assert.equal(new Set(result.variants).size, 8);
    for (const s of result.shape) {
      assert.equal(s.skin, 1);
      assert.ok(s.meshes <= 4);
      assert.equal(s.source, 'kenney-survivors-human');
      assert.ok(s.map && s.naturalColor && s.skinning);
    }
    for (const key of ['animated', 'hammerMoves', 'retained', 'stillUsable', 'prewarmed'])
      assert.equal(result[key], true, key);
    assert.equal(result.sharedGeometryDisposals, 0);
    assert.equal(result.skeletonDisposals, result.skeletons);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

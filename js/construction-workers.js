/* Kenney Animated Characters. Human appearance/animation is independent of zombie presentation. */
const CONSTRUCTION_WORKER_VARIANTS = Object.freeze([
  'survivor-female-a',
  'survivor-male-b',
  'human-female-a',
  'human-male-a',
  'criminal-male-a',
  'cyborg-female-a',
  'skater-female-a',
  'skater-male-a',
]);
let constructionWorkerLookIndex = Math.floor(Math.random() * CONSTRUCTION_WORKER_VARIANTS.length);
const constructionHumanClips = new Map();
const constructionHumanMaterials = new Map();
const constructionWorkerWarmState = { ready: false, key: null };
function constructionWorkersReady() {
  return !!(
    THREE.SkeletonUtils &&
    ASSETS['survivor-zombie'] &&
    ASSET_ANIMS['survivor-idle']?.length &&
    ASSET_ANIMS['survivor-run']?.length &&
    CONSTRUCTION_WORKER_VARIANTS.some((id) => ASSET_TEXTURES[id])
  );
}
function constructionHumanClip(name) {
  if (constructionHumanClips.has(name)) return constructionHumanClips.get(name);
  const clips = ASSET_ANIMS[name === 'walk' ? 'survivor-run' : 'survivor-idle'] || [];
  const match = name === 'walk' ? 'run' : 'idle';
  const source = clips.find((c) => c.name.toLowerCase().includes(match));
  if (!source) throw new Error(`Missing human ${name} animation`);
  const clip = source.clone();
  clip.name = `engineer-${name}`;
  // Only remove world locomotion; unlike zombies, human arms, spine and hands keep their authored motion.
  clip.tracks = clip.tracks.filter((t) => !/(^|[.:])root\.position$/i.test(t.name));
  constructionHumanClips.set(name, clip);
  return clip;
}
function makeConstructionWorker(savedVariant) {
  if (!constructionWorkersReady()) throw new Error('Kenney engineer assets are not ready');
  const available = CONSTRUCTION_WORKER_VARIANTS.filter((id) => ASSET_TEXTURES[id]);
  const variant = available.includes(savedVariant)
    ? savedVariant
    : available[constructionWorkerLookIndex++ % available.length];
  const root = new THREE.Group(),
    visual = new THREE.Group(),
    actor = THREE.SkeletonUtils.clone(ASSETS['survivor-zombie']);
  root.name = 'Kenney 基地工程师';
  root.add(visual);
  visual.add(actor);
  let material = constructionHumanMaterials.get(variant);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      map: ASSET_TEXTURES[variant],
      color: 0xffffff,
      skinning: true,
      roughness: 0.88,
      metalness: 0,
    });
    material.userData.constructionShared = true;
    constructionHumanMaterials.set(variant, material);
  }
  const bones = {};
  actor.traverse((o) => {
    if (o.isMesh) {
      o.material = material;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
    if (o.isBone) bones[o.name] = o;
  });
  actor.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(actor),
    scale = 1.72 / Math.max(0.001, box.max.y - box.min.y);
  actor.scale.setScalar(scale);
  actor.updateMatrixWorld(true);
  box.setFromObject(actor);
  const center = box.getCenter(new THREE.Vector3());
  visual.position.set(-center.x, -box.min.y, -center.z);
  const mixer = new THREE.AnimationMixer(actor),
    actions = {};
  for (const name of ['idle', 'walk']) {
    actions[name] = mixer.clipAction(constructionHumanClip(name));
    actions[name].setLoop(THREE.LoopRepeat, Infinity);
  }
  actions.idle.play();
  mixer.update(0);
  const tool = new THREE.Group();
  tool.name = '施工锤';
  root.add(tool);
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.28, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x86673d, roughness: 0.87 }),
  );
  handle.position.y = 0.045;
  tool.add(handle);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.075, 0.075),
    new THREE.MeshStandardMaterial({ color: 0x899a9b, metalness: 0.55, roughness: 0.62 }),
  );
  head.position.y = 0.2;
  tool.add(head);
  const data = root.userData;
  Object.assign(data, {
    assetName: 'kenney-survivors-human',
    variantId: variant,
    animationRoot: actor,
    humanMaterial: material,
    mixer,
    actions,
    poseBones: bones,
    tool,
    animationMode: 'idle',
    animationTime: Math.random(),
    legs: [bones.LeftUpLeg, bones.RightUpLeg],
    arms: [bones.LeftArm, bones.RightArm],
    scratch: {
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      bend: new THREE.Vector3(),
      elbow: new THREE.Vector3(),
      target: new THREE.Vector3(),
      localTarget: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      p: new THREE.Quaternion(),
      delta: new THREE.Quaternion(),
    },
  });
  updateConstructionWorker(root, 'idle', 0);
  return root;
}
function aimConstructionBone(bone, child, target, scratch) {
  bone.getWorldPosition(scratch.a);
  child.getWorldPosition(scratch.b);
  scratch.b.sub(scratch.a).normalize();
  scratch.c.copy(target).sub(scratch.a).normalize();
  scratch.delta.setFromUnitVectors(scratch.b, scratch.c);
  bone.getWorldQuaternion(scratch.q).premultiply(scratch.delta);
  bone.parent.getWorldQuaternion(scratch.p).invert();
  bone.quaternion.copy(scratch.p.multiply(scratch.q));
  bone.updateMatrixWorld(true);
}
function poseConstructionArm(worker, time) {
  const data = worker.userData,
    bones = data.poseBones,
    s = data.scratch;
  const upper = bones.RightArm,
    lower = bones.RightForeArm,
    hand = bones.RightHand;
  if (!upper || !lower || !hand) return;
  worker.updateMatrixWorld(true);
  upper.getWorldPosition(s.a);
  lower.getWorldPosition(s.b);
  hand.getWorldPosition(s.c);
  const length1 = s.a.distanceTo(s.b),
    length2 = s.b.distanceTo(s.c),
    lift = (1 + Math.sin(time * 10)) * 0.5;
  // Aim at the work side in worker-local +Z. The mesh's native rolls are retained by delta rotations.
  s.localTarget.set(0.26, 1.02 + lift * 0.3, 0.3 + (1 - lift) * 0.27);
  s.target.copy(s.localTarget);
  worker.localToWorld(s.target);
  s.direction.copy(s.target).sub(s.a);
  const distance = Math.min(length1 + length2 - 0.002, Math.max(0.01, s.direction.length()));
  s.direction.normalize();
  s.target.copy(s.a).addScaledVector(s.direction, distance);
  s.bend.set(1, 0, 0).transformDirection(worker.matrixWorld);
  s.bend.addScaledVector(s.direction, -s.bend.dot(s.direction)).normalize();
  const along = (length1 * length1 - length2 * length2 + distance * distance) / (2 * distance),
    height = Math.sqrt(Math.max(0, length1 * length1 - along * along));
  s.elbow.copy(s.a).addScaledVector(s.direction, along).addScaledVector(s.bend, height);
  aimConstructionBone(upper, lower, s.elbow, s);
  aimConstructionBone(lower, hand, s.target, s);
  data.tool.rotation.x = 1.05 - lift * 1.45;
}
function updateConstructionWorker(worker, mode, dt, time) {
  const data = worker?.userData;
  if (!data?.mixer) return;
  dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const next = mode === 'walk' ? 'walk' : 'idle';
  if (data.animationMode !== next) {
    data.actions[data.animationMode].fadeOut(0.12);
    data.actions[next].reset().fadeIn(0.12).play();
    data.animationMode = next;
  }
  data.animationTime += Math.max(0, dt);
  data.mixer.update(Math.max(0, dt));
  if (mode === 'work') poseConstructionArm(worker, Number.isFinite(time) ? time : data.animationTime);
  else data.tool.rotation.set(0.12, 0, 0);
  worker.updateMatrixWorld(true);
  const hand = data.poseBones.RightHand;
  if (hand) {
    hand.getWorldPosition(data.scratch.a);
    worker.worldToLocal(data.scratch.a);
    data.tool.position.copy(data.scratch.a);
  }
}
function disposeConstructionWorker(worker) {
  if (!worker || worker.userData.released) return;
  worker.userData.released = true;
  const data = worker.userData;
  data.mixer?.stopAllAction();
  data.mixer?.uncacheRoot(data.animationRoot);
  const skeletons = new Set(),
    materials = new Set(),
    geometries = new Set();
  worker.traverse((o) => {
    if (o.skeleton && !skeletons.has(o.skeleton)) {
      skeletons.add(o.skeleton);
      o.skeleton.dispose();
    }
    if (o.geometry && !_sharedGeoms.has(o.geometry) && !geometries.has(o.geometry)) {
      geometries.add(o.geometry);
      o.geometry.dispose();
    }
    for (const material of Array.isArray(o.material) ? o.material : [o.material])
      if (material && !material.userData.constructionShared && !materials.has(material)) {
        materials.add(material);
        material.dispose();
      }
  });
}
function warmConstructionWorkers() {
  if (!constructionWorkersReady()) return false;
  const key = `${renderer.shadowMap.enabled}/${renderer.shadowMap.type}`;
  if (constructionWorkerWarmState.ready && constructionWorkerWarmState.key === key) return true;
  const target = new THREE.WebGLRenderTarget(1, 1),
    previous = renderer.getRenderTarget(),
    workers = [];
  try {
    for (const id of CONSTRUCTION_WORKER_VARIANTS) {
      if (!ASSET_TEXTURES[id]) continue;
      const worker = makeConstructionWorker(id);
      worker.position.copy(baseGroup.position);
      scene.add(worker);
      workers.push(worker);
      updateConstructionWorker(worker, 'walk', 0.1);
    }
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.getContext().finish();
    constructionWorkerWarmState.ready = true;
    constructionWorkerWarmState.key = key;
    return true;
  } finally {
    renderer.setRenderTarget(previous);
    workers.forEach((w) => {
      scene.remove(w);
      disposeConstructionWorker(w);
    });
    target.dispose();
  }
}

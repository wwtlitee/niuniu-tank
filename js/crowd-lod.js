/* 远景复用原僵尸网格/UV/材质，只把骨骼动画烘焙为四帧并批量绘制。 */
let crowdLodMesh=null,crowdLodCapacity=1200;
const crowdLodTransform=new THREE.Object3D(),crowdLodBatches=new Map();
function clearCrowdLod(){
  for(const batch of crowdLodBatches.values())for(const pose of batch.poses)for(const mesh of pose.meshes){mesh.geometry.dispose();if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());else mesh.material.dispose();}
  crowdLodBatches.clear();if(crowdLodMesh)scene.remove(crowdLodMesh);crowdLodMesh=null;
}
function makeOriginalCrowdBatch(enemy){
  if(!enemy.animationRoot)return null;
  const root=THREE.SkeletonUtils.clone(enemy.group);
  root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.setScalar(1);root.visible=true;
  const animationRoot=root.children[0]?.children[0];if(!animationRoot)return null;
  const mixer=new THREE.AnimationMixer(animationRoot),clip=enemy.actions?.walk?.getClip();
  if(clip)mixer.clipAction(clip).play();
  const bones={};for(const [key,bone] of Object.entries(enemy.poseBones||{}))bones[key]=root.getObjectByName(bone.name);
  const proxy={group:root,poseBones:bones,baseBoneRotations:enemy.baseBoneRotations,visualRoot:root.children[0],attackPose:0};
  const poses=[],vertex=new THREE.Vector3();
  for(let frame=0;frame<4;frame++){
    if(clip)mixer.setTime(clip.duration*frame/4);
    applyZombieReachPose(proxy);root.updateMatrixWorld(true);
    root.traverse(o=>{if(o.skeleton)o.skeleton.update();});
    const meshes=[];
    animationRoot.traverse(source=>{
      if(!source.isMesh||!source.geometry?.attributes.position)return;
      const geometry=source.geometry.clone(),position=geometry.attributes.position;
      for(let i=0;i<position.count;i++){
        vertex.fromBufferAttribute(source.geometry.attributes.position,i);
        if(source.isSkinnedMesh){if(source.applyBoneTransform)source.applyBoneTransform(i,vertex);else source.boneTransform(i,vertex);}
        vertex.applyMatrix4(source.matrixWorld);position.setXYZ(i,vertex.x,vertex.y,vertex.z);
      }
      geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();geometry.computeBoundingSphere();
      geometry.userData.sourceZombieMesh=source.name||'original-zombie';
      const copy=m=>{const material=m.clone();material.skinning=false;return material;};
      const material=Array.isArray(source.material)?source.material.map(copy):copy(source.material);
      const mesh=new THREE.InstancedMesh(geometry,material,crowdLodCapacity);mesh.count=0;mesh.visible=false;
      mesh.frustumCulled=false;mesh.castShadow=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.raycast=()=>{};
      crowdLodMesh.add(mesh);meshes.push(mesh);
    });
    poses.push({meshes,count:0});
  }
  mixer.stopAllAction();mixer.uncacheRoot(animationRoot);
  const skeletons=new Set();root.traverse(o=>{if(o.skeleton&&!skeletons.has(o.skeleton)){skeletons.add(o.skeleton);o.skeleton.dispose();}});
  return {poses};
}
function updateCrowdLod(){
  if(ACTIVE_MODE.key!=='survival'){if(crowdLodMesh)crowdLodMesh.visible=false;return;}
  const useLod=enemies.length>120;
  if(useLod&&!crowdLodMesh){crowdLodMesh=new THREE.Group();crowdLodMesh.name='原模型批量尸潮';crowdLodMesh.count=0;scene.add(crowdLodMesh);}
  for(const batch of crowdLodBatches.values())for(const pose of batch.poses)pose.count=0;
  const detailIds=new Set(useLod?enemies.filter(e=>e.alive&&!e.dying&&!e.boss)
    .map(e=>({id:e.hordeId,d:(e.group.position.x-camFocus.x)**2+(e.group.position.z-camFocus.z)**2}))
    .filter(e=>e.d<=42*42).sort((a,b)=>a.d-b.d||a.id-b.id).slice(0,80).map(e=>e.id):[]);
  let count=0;
  for(const enemy of enemies){
    let far=useLod&&!enemy.boss&&!enemy.dying&&enemy.alive&&!detailIds.has(enemy.hordeId);
    let batch;
    if(far){
      const key=`${enemy.variantId||enemy.animationRoot?.userData.assetName||'normal'}:${enemy.type}`;
      batch=crowdLodBatches.get(key);
      if(!batch){
        enemy.group.userData.crowdLodHidden=false;
        batch=makeOriginalCrowdBatch(enemy);if(batch)crowdLodBatches.set(key,batch);
      }
      if(!batch)far=false;
    }
    if(!enemy.group.userData.lodMatrixGuard){
      const updateWorld=enemy.group.updateMatrixWorld;
      enemy.group.updateMatrixWorld=function(force){if(this.userData.crowdLodHidden)return;return updateWorld.call(this,force);};
      enemy.group.userData.lodMatrixGuard=true;
    }
    enemy.group.userData.crowdLodHidden=far;enemy.group.visible=!far;enemy._crowdLod=far;
    if(!far)continue;
    const moving=enemy.currentAnim===_ANIM_WALK;
    const phase=moving?(Math.floor(performance.now()/125)+enemy.hordeId)%4:0;
    const pose=batch.poses[phase];
    crowdLodTransform.position.copy(enemy.group.position);crowdLodTransform.rotation.copy(enemy.group.rotation);crowdLodTransform.scale.copy(enemy.group.scale);crowdLodTransform.updateMatrix();
    for(const mesh of pose.meshes)mesh.setMatrixAt(pose.count,crowdLodTransform.matrix);
    pose.count++;count++;
  }
  for(const batch of crowdLodBatches.values())for(const pose of batch.poses)for(const mesh of pose.meshes){mesh.count=pose.count;mesh.visible=pose.count>0;mesh.instanceMatrix.needsUpdate=true;}
  if(crowdLodMesh){crowdLodMesh.count=count;crowdLodMesh.visible=count>0;}
}

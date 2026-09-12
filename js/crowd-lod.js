/* Screen-size LOD keeps independent entities and collision at every zoom. */
let crowdLodMesh=null,crowdLodCapacity=4096,crowdLodPrewarmIndex=0;
const crowdLodTransform=new THREE.Object3D(),crowdLodBatches=new Map(),crowdLodBuildQueue=[];
// Mode 4 uses the complete original mesh with shared poses when the 192 live
// skeleton budget is full. It is reported as quality tier 0, not a fifth quality.
const CROWD_LOD_PIXELS=[40,22,12],CROWD_LOD_RATIOS=[1,.25,.125,.0625,1],CROWD_DETAIL_BUDGET=192;
const crowdLodView=new THREE.Vector3();
let crowdLodStats={logicalCount:0,renderedUniqueCount:0,detailCount:0,tierCounts:[0,0,0,0],transitionCount:0,pendingBuilds:0,drawCalls:0,triangles:0,capacity:crowdLodCapacity};
function crowdLodTierForPixels(pixels,previous){
  if(!Number.isFinite(pixels))return 3;
  let tier=previous;
  if(!Number.isInteger(tier)||tier<0||tier>3){tier=0;while(tier<3&&pixels<CROWD_LOD_PIXELS[tier])tier++;return tier;}
  while(tier>0&&pixels>CROWD_LOD_PIXELS[tier-1]*1.15)tier--;
  while(tier<3&&pixels<CROWD_LOD_PIXELS[tier]*.85)tier++;
  return tier;
}
/* Clustering retains whole triangles. Later animation poses reuse the first
   pose's source memberships and topology, preventing silhouette jitter. */
function simplifyCrowdGeometry(source,ratio,template){
  const position=source.attributes.position,uv=source.attributes.uv,sourceColors=source.attributes.color;
  const sourceIndices=source.index?source.index.array:Array.from({length:position.count},(_,i)=>i);
  const target=Math.max(24,Math.floor(sourceIndices.length/3*ratio));
  source.computeBoundingBox();
  const box=source.boundingBox,size=box.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,.001);
  let chosen=template&&{groups:template.userData.crowdVertexGroups,indices:Array.from(template.index.array),materialGroups:template.groups};
  if(!chosen){
    const cluster=resolution=>{
      const groups=[],lookup=new Map(),remap=new Uint32Array(position.count),step=span/resolution;
      for(let i=0;i<position.count;i++){
        const key=[Math.floor((position.getX(i)-box.min.x)/step),Math.floor((position.getY(i)-box.min.y)/step),Math.floor((position.getZ(i)-box.min.z)/step)].join(',');
        let group=lookup.get(key);if(group===undefined){group=groups.length;lookup.set(key,group);groups.push([]);}
        groups[group].push(i);remap[i]=group;
      }
      const indices=[],materialGroups=[],seen=new Set();
      const ranges=source.groups.length?source.groups:[{start:0,count:sourceIndices.length,materialIndex:0}];
      for(const range of ranges){
        const start=indices.length;
        for(let i=range.start;i<Math.min(sourceIndices.length,range.start+range.count);i+=3){
          const a=remap[sourceIndices[i]],b=remap[sourceIndices[i+1]],c=remap[sourceIndices[i+2]];
          if(a===b||a===c||b===c)continue;
          const key=[a,b,c].sort((x,y)=>x-y).join(',')+':'+range.materialIndex;
          if(seen.has(key))continue;seen.add(key);indices.push(a,b,c);
        }
        materialGroups.push({start,count:indices.length-start,materialIndex:range.materialIndex});
      }
      return {groups,indices,materialGroups};
    };
    let low=2,high=64,best=null,closest=null;
    for(let i=0;i<9;i++){
      const resolution=(low+high)/2,result=cluster(resolution),count=result.indices.length/3;
      if(count>0&&(!closest||Math.abs(count-target)<Math.abs(closest.indices.length/3-target)))closest=result;
      if(count<=target*1.12&&count>=12){if(!best||count>best.indices.length/3)best=result;low=resolution;}else high=resolution;
    }
    chosen=best||closest;
  }
  if(!chosen?.indices.length)return source.clone();
  const output=new THREE.BufferGeometry(),coords=new Float32Array(chosen.groups.length*3),tex=uv?new Float32Array(chosen.groups.length*2):null;
  const colorSize=sourceColors?.itemSize||0,colors=sourceColors?new Float32Array(chosen.groups.length*colorSize):null;
  // glTF colors may be float or normalized unsigned bytes/shorts. Keep RGB/RGBA
  // when simplifying: a vertexColors material with no color buffer renders black.
  const colorScale=sourceColors?.normalized?(sourceColors.array.BYTES_PER_ELEMENT===1?1/255:1/65535):1;
  chosen.groups.forEach((members,index)=>{
    for(const vertex of members){
      coords[index*3]+=position.getX(vertex);coords[index*3+1]+=position.getY(vertex);coords[index*3+2]+=position.getZ(vertex);
      if(tex){tex[index*2]+=uv.getX(vertex);tex[index*2+1]+=uv.getY(vertex);}
      if(colors)for(let j=0;j<colorSize;j++)colors[index*colorSize+j]+=sourceColors.array[vertex*colorSize+j]*colorScale;
    }
    for(let j=0;j<3;j++)coords[index*3+j]/=members.length;
    if(tex){tex[index*2]/=members.length;tex[index*2+1]/=members.length;}
    if(colors)for(let j=0;j<colorSize;j++)colors[index*colorSize+j]/=members.length;
  });
  output.setAttribute('position',new THREE.BufferAttribute(coords,3));
  if(tex)output.setAttribute('uv',new THREE.BufferAttribute(tex,2));
  if(colors)output.setAttribute('color',new THREE.BufferAttribute(colors,colorSize));
  output.setIndex(chosen.indices);chosen.materialGroups.forEach(g=>output.addGroup(g.start,g.count,g.materialIndex));
  output.userData.crowdVertexGroups=chosen.groups;output.computeVertexNormals();output.computeBoundingSphere();
  return output;
}
/* Complementary opaque screen-door coverage avoids alpha overdraw for crowds. */
function installCrowdDither(material,instanced,coverage){
  const prior=material.onBeforeCompile,priorKey=material.customProgramCacheKey;
  material.onBeforeCompile=function(shader,renderer){
    if(prior)prior.call(this,shader,renderer);
    if(instanced){
      shader.vertexShader='attribute float crowdCoverage; varying float vCrowdCoverage;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCrowdCoverage=crowdCoverage;');
      shader.fragmentShader='varying float vCrowdCoverage;\n'+shader.fragmentShader;
    }else{shader.uniforms.crowdCoverage=coverage;shader.fragmentShader='uniform float crowdCoverage;\n'+shader.fragmentShader;}
    const variable=instanced?'vCrowdCoverage':'crowdCoverage';
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat crowdNoise=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));\nif(('+variable+'>=0.0&&crowdNoise>'+variable+')||('+variable+'<0.0&&crowdNoise<'+variable+'+1.0))discard;');
  };
  material.customProgramCacheKey=function(){return(priorKey?priorKey.call(this):'')+':crowd-dither-v2-'+(instanced?'instance':'detail');};
  material.needsUpdate=true;
}
function clearCrowdLod(){
  for(const batch of crowdLodBatches.values()){
    for(const tier of batch.tiers)if(tier)for(const pose of tier.poses)if(pose)for(const mesh of pose.meshes)mesh.geometry.dispose();
    for(const material of batch.materials)material.dispose();
    disposeCrowdBakeRoot(batch);
  }
  crowdLodBatches.clear();crowdLodBuildQueue.length=0;crowdLodPrewarmIndex=0;
  if(crowdLodMesh)scene.remove(crowdLodMesh);crowdLodMesh=null;
  if(typeof enemies!=='undefined')for(const enemy of enemies){enemy._crowdLod=false;enemy._crowdLodState=null;enemy.group.userData.crowdLodHidden=false;enemy.group.visible=true;if(enemy._crowdCoverage)enemy._crowdCoverage.value=1;}
}
function disposeCrowdBakeRoot(batch){
  if(!batch.root)return;
  batch.mixer.stopAllAction();batch.mixer.uncacheRoot(batch.animationRoot);
  const skeletons=new Set();batch.root.traverse(o=>{if(o.skeleton&&!skeletons.has(o.skeleton)){skeletons.add(o.skeleton);o.skeleton.dispose();}});
  batch.root=null;batch.animationRoot=null;batch.mixer=null;
}
function makeOriginalCrowdBatch(enemy){
  if(!enemy.animationRoot||!THREE.SkeletonUtils)return null;
  if(!crowdLodMesh){crowdLodMesh=new THREE.Group();crowdLodMesh.name='四档屏幕精度尸潮';crowdLodMesh.count=0;scene.add(crowdLodMesh);}
  const root=THREE.SkeletonUtils.clone(enemy.group);
  root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.setScalar(1);root.visible=true;root.userData.crowdLodHidden=false;
  const animationRoot=root.children[0]?.children[0];if(!animationRoot)return null;
  const mixer=new THREE.AnimationMixer(animationRoot),clip=enemy.actions?.walk?.getClip();
  if(clip)mixer.clipAction(clip).play();
  const materials=new Set();animationRoot.traverse(source=>{if(!source.isMesh)return;const copy=m=>{const material=m.clone();material.skinning=false;installCrowdDither(material,true);materials.add(material);return material;};source.material=Array.isArray(source.material)?source.material.map(copy):copy(source.material);});
  const bones={};for(const [key,bone] of Object.entries(enemy.poseBones||{}))bones[key]=root.getObjectByName(bone.name);
  const proxy={group:root,poseBones:bones,baseBoneRotations:enemy.baseBoneRotations,visualRoot:root.children[0],attackPose:0,currentAnim:_ANIM_WALK,type:'normal'};
  const baseHeight=(enemy._lodHeight||enemy.lodHeight||1.2)/Math.max(.001,enemy.group.scale.y);
  const batch={root,animationRoot,mixer,clip,proxy,materials,baseHeight,tiers:[null,{poses:[]},{poses:[]},{poses:[]},{poses:[]}],templates:new Map(),remaining:16};
  for(const tier of [3,2,1,4])for(let frame=0;frame<4;frame++)crowdLodBuildQueue.push({batch,tier,frame});
  return batch;
}
function buildCrowdPose(job){
  const {batch,tier,frame}=job,{root,animationRoot,mixer,clip,proxy}=batch;if(!root)return;
  proxy.poseTime=frame*Math.PI/2/7;if(clip)mixer.setTime(clip.duration*frame/4);
  applyZombieReachPose(proxy);root.updateMatrixWorld(true);root.traverse(o=>{if(o.skeleton)o.skeleton.update();});
  const meshes=[],vertex=new THREE.Vector3();
  animationRoot.traverse(source=>{
    if(!source.isMesh||!source.geometry?.attributes.position)return;
    const baked=source.geometry.clone(),position=baked.attributes.position;
    for(let i=0;i<position.count;i++){
      vertex.fromBufferAttribute(source.geometry.attributes.position,i);
      if(source.isSkinnedMesh){if(source.applyBoneTransform)source.applyBoneTransform(i,vertex);else source.boneTransform(i,vertex);}
      vertex.applyMatrix4(source.matrixWorld).divideScalar(batch.baseHeight);position.setXYZ(i,vertex.x,vertex.y,vertex.z);
    }
    baked.deleteAttribute('skinIndex');baked.deleteAttribute('skinWeight');
    const key=source.uuid+':'+tier,geometry=tier===4?baked.clone():simplifyCrowdGeometry(baked,CROWD_LOD_RATIOS[tier],batch.templates.get(key));
    if(tier===4){geometry.computeVertexNormals();geometry.computeBoundingSphere();}
    baked.dispose();if(!frame)batch.templates.set(key,geometry);
    geometry.userData.sourceZombieMesh=source.name||'original-zombie';geometry.userData.lodTier=tier;
    geometry.setAttribute('crowdCoverage',new THREE.InstancedBufferAttribute(new Float32Array(crowdLodCapacity).fill(1),1).setUsage(THREE.DynamicDrawUsage));
    const mesh=new THREE.InstancedMesh(geometry,source.material,crowdLodCapacity);mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.castShadow=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.raycast=()=>{};
    crowdLodMesh.add(mesh);meshes.push(mesh);
  });
  batch.tiers[tier].poses[frame]={meshes,count:0};batch.remaining--;
  if(!batch.remaining){batch.templates.clear();disposeCrowdBakeRoot(batch);}
}
function prewarmCrowdLod(){
  if(typeof SURVIVAL_ZOMBIE_VARIANTS==='undefined'||typeof _buildEnemyGroup!=='function'||crowdLodPrewarmIndex>=SURVIVAL_ZOMBIE_VARIANTS.length)return;
  const variant=SURVIVAL_ZOMBIE_VARIANTS[crowdLodPrewarmIndex];if(!_survivalZombieVariantReady(variant))return;
  crowdLodPrewarmIndex++;if(crowdLodBatches.has(variant.id))return;
  const built=_buildEnemyGroup('normal',false,ENEMY_TYPES.normal,variant);
  if(built.fallback)return;
  const batch=makeOriginalCrowdBatch(built);if(batch)crowdLodBatches.set(variant.id,batch);
  // The bake clone still shares source BufferGeometry; release only the temporary
  // skeleton/material ownership, as with a normal character entity.
  releaseEnemyResources({...built,characterModel:true});
}
function crowdLodDetailCoverage(enemy,value){
  if(!enemy._crowdCoverage){
    enemy._crowdCoverage={value:1};
    enemy.group.traverse(o=>{if(!o.isMesh)return;for(const material of(Array.isArray(o.material)?o.material:[o.material]))installCrowdDither(material,false,enemy._crowdCoverage);});
  }
  enemy._crowdCoverage.value=value;
}
function crowdLodReadyTier(batch,wanted){
  if(!wanted||!batch)return 0;
  if(batch.tiers[wanted]?.poses[0])return wanted;
  for(let tier=3;tier>=1;tier--)if(batch.tiers[tier]?.poses[0])return tier;
  return 0;
}
function appendCrowdInstance(enemy,batch,tier,coverage){
  const moving=enemy.currentAnim===_ANIM_WALK;
  const phase=moving?(Math.floor((enemy.poseTime||0)*(enemy.type==='fast'?11:8))+(enemy.hordeId||0))%4:0;
  const pose=batch.tiers[tier].poses[phase]||batch.tiers[tier].poses[0];
  if(pose.count>=crowdLodCapacity)return false;
  crowdLodTransform.position.copy(enemy.group.position);crowdLodTransform.rotation.copy(enemy.group.rotation);
  crowdLodTransform.scale.copy(enemy.group.scale).multiplyScalar((enemy._lodHeight||1.2)/Math.max(.001,enemy.group.scale.y));crowdLodTransform.updateMatrix();
  for(const mesh of pose.meshes){mesh.setMatrixAt(pose.count,crowdLodTransform.matrix);mesh.geometry.attributes.crowdCoverage.setX(pose.count,coverage);}
  pose.count++;return true;
}
function getCrowdLodStats(){return {...crowdLodStats,tierCounts:[...crowdLodStats.tierCounts]};}
function updateCrowdLod(){
  if(ACTIVE_MODE.key!=='survival'){if(crowdLodMesh)crowdLodMesh.visible=false;return;}
  if(!enemies.length)prewarmCrowdLod();
  if(crowdLodBuildQueue.length){
    const urgent=crowdLodBuildQueue.findIndex(job=>job.tier===3&&job.frame===0);
    buildCrowdPose(crowdLodBuildQueue.splice(urgent<0?0:urgent,1)[0]);
  }
  for(const batch of crowdLodBatches.values())for(const tier of batch.tiers)if(tier)for(const pose of tier.poses)if(pose)pose.count=0;
  camera.updateMatrixWorld(true);
  const viewportHeight=renderer.domElement.clientHeight||renderer.domElement.height/(renderer.getPixelRatio?.()||1)||900;
  const pixelScale=viewportHeight*Math.abs(camera.projectionMatrix.elements[5])*.5,now=performance.now(),detailCandidates=[];
  for(const enemy of enemies){
    if(!enemy.alive&&!enemy.dying)continue;
    crowdLodView.copy(enemy.group.position).applyMatrix4(camera.matrixWorldInverse);
    const depth=camera.isOrthographicCamera?1:Math.max(.1,-crowdLodView.z),height=enemy._lodHeight||1.2;
    const pixels=height*pixelScale/depth,margin=Math.max(12,pixels)*2/viewportHeight;
    enemy._crowdScreenPixels=pixels;
    enemy._crowdInView=-crowdLodView.z>camera.near&&-crowdLodView.z<camera.far&&Math.abs(crowdLodView.x*camera.projectionMatrix.elements[0]/depth)<1+margin&&Math.abs((crowdLodView.y+height*.5)*camera.projectionMatrix.elements[5]/depth)<1+margin;
    if(enemy._crowdInView&&!enemy.boss&&!enemy.dying&&crowdLodTierForPixels(pixels,enemy._crowdLodState?.wanted)===0)detailCandidates.push(enemy);
  }
  detailCandidates.sort((a,b)=>b._crowdScreenPixels-a._crowdScreenPixels||(a.hordeId||0)-(b.hordeId||0));
  const detailIds=new Set(detailCandidates.slice(0,CROWD_DETAIL_BUDGET));
  const stats={logicalCount:0,renderedUniqueCount:0,onScreenCount:0,detailCount:0,tierCounts:[0,0,0,0],transitionCount:0,pendingBuilds:0,drawCalls:0,triangles:0,capacity:crowdLodCapacity};
  let instanceEntities=0;
  for(const enemy of enemies){
    if(!enemy.alive&&!enemy.dying)continue;
    stats.logicalCount++;
    const previous=enemy._crowdLodState;
    const pixels=enemy._crowdScreenPixels;
    const wanted=enemy.boss||enemy.dying?0:enemy._crowdInView?crowdLodTierForPixels(pixels,previous?.wanted):3;
    const wantedMode=wanted===0&&!enemy.boss&&!enemy.dying&&!detailIds.has(enemy)?4:wanted;
    if(enemy._crowdInView)stats.onScreenCount++;
    let batch=null;
    if(wantedMode){
      const key=enemy.variantId||enemy.animationRoot?.userData.assetName||'normal';batch=crowdLodBatches.get(key);
      if(!batch){batch=makeOriginalCrowdBatch(enemy);if(batch)crowdLodBatches.set(key,batch);}
    }else if(previous?.tier||previous?.from)batch=crowdLodBatches.get(enemy.variantId||enemy.animationRoot?.userData.assetName||'normal');
    const ready=crowdLodReadyTier(batch,wantedMode);
    let lod=previous;
    if(!lod)lod=enemy._crowdLodState={tier:ready,wanted,from:null,started:now};
    lod.wanted=wanted;
    if(enemy.dying){lod.tier=0;lod.from=null;}
    if(lod.tier!==ready&&lod.from===null){lod.from=lod.tier;lod.tier=ready;lod.started=now;}
    let fade=lod.from===null?1:Math.min(1,(now-lod.started)/180);
    if(fade>=1||enemy.dying){lod.from=null;fade=1;}
    const detail=lod.tier===0||lod.from===0;
    if(detail&&lod.from!==null)crowdLodDetailCoverage(enemy,lod.tier===0?fade:fade-1);
    else if(enemy._crowdCoverage)enemy._crowdCoverage.value=1;
    let drawn=false,instanced=false;
    if(lod.tier>0&&batch){drawn=appendCrowdInstance(enemy,batch,lod.tier,fade);instanced=drawn;}
    if(lod.from>0&&batch){drawn=appendCrowdInstance(enemy,batch,lod.from,fade-1)||drawn;instanced=drawn;}
    const full=detail||!drawn;
    if(!enemy.group.userData.lodMatrixGuard){
      const updateWorld=enemy.group.updateMatrixWorld;
      enemy.group.updateMatrixWorld=function(force){if(this.userData.crowdLodHidden)return;return updateWorld.call(this,force);};
      enemy.group.userData.lodMatrixGuard=true;
    }
    enemy.group.userData.crowdLodHidden=!full;enemy.group.visible=full;enemy._crowdLod=!full;
    if(instanced)instanceEntities++;
    if(full){
      stats.detailCount++;
      if(enemy._crowdTriangleCount===undefined){enemy._crowdTriangleCount=0;enemy._crowdDrawCalls=0;enemy.group.traverse(o=>{if(o.isMesh&&o.geometry?.attributes.position){enemy._crowdTriangleCount+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;enemy._crowdDrawCalls++;}});}
      stats.triangles+=enemy._crowdTriangleCount;stats.drawCalls+=enemy._crowdDrawCalls;
    }
    if(lod.from!==null)stats.transitionCount++;
    stats.tierCounts[full&&!drawn||lod.tier===4?0:lod.tier]++;stats.renderedUniqueCount++;
  }
  for(const batch of crowdLodBatches.values())for(const tier of batch.tiers)if(tier)for(const pose of tier.poses)if(pose)for(const mesh of pose.meshes){
    mesh.count=pose.count;mesh.visible=pose.count>0;
    if(pose.count){
      // Upload only occupied slots, not every 4096-slot buffer on every frame.
      mesh.instanceMatrix.updateRange.offset=0;mesh.instanceMatrix.updateRange.count=pose.count*16;mesh.instanceMatrix.needsUpdate=true;
      const coverage=mesh.geometry.attributes.crowdCoverage;coverage.updateRange.offset=0;coverage.updateRange.count=pose.count;coverage.needsUpdate=true;
      stats.drawCalls++;stats.triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3*pose.count;
    }
  }
  if(crowdLodMesh){crowdLodMesh.count=instanceEntities;crowdLodMesh.visible=instanceEntities>0;}
  stats.pendingBuilds=crowdLodBuildQueue.length;crowdLodStats=stats;
}

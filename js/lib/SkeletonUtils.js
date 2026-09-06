/* Three.js r128 兼容的蒙皮对象深克隆。
   每个实例拥有独立骨骼层级，避免 AnimationMixer 互串或 SkinnedMesh.skeleton 缺失。 */
(function(){
  "use strict";

  function parallelTraverse(source,cloned,callback){
    callback(source,cloned);
    for(let index=0;index<source.children.length;index++)
      parallelTraverse(source.children[index],cloned.children[index],callback);
  }

  function clone(source){
    if(source==null)return null;
    if(!source.isObject3D)return typeof source.clone==="function"?source.clone():source;

    const cloneLookup=new Map(),sourceLookup=new Map();
    const cloned=source.clone(true);
    parallelTraverse(source,cloned,(sourceNode,clonedNode)=>{
      cloneLookup.set(sourceNode,clonedNode);
      sourceLookup.set(clonedNode,sourceNode);
    });

    cloned.traverse((clonedNode)=>{
      if(!clonedNode.isSkinnedMesh)return;
      const sourceMesh=sourceLookup.get(clonedNode);
      if(!sourceMesh||!sourceMesh.skeleton)return;
      const skeleton=sourceMesh.skeleton.clone();
      skeleton.bones=sourceMesh.skeleton.bones.map((bone)=>cloneLookup.get(bone)).filter(Boolean);
      clonedNode.bindMatrix.copy(sourceMesh.bindMatrix);
      clonedNode.bind(skeleton,clonedNode.bindMatrix);
    });
    return cloned;
  }

  THREE.SkeletonUtils={clone};
})();

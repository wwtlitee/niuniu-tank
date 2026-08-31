/* 蒙皮网格克隆工具 —— Three.js r128 官方 examples/js/utils/SkeletonUtils.js 简化版
   挂到 THREE.SkeletonUtils
   角色 GLB 多实例克隆必须走这个：直接 .clone() 共享 skeleton 骨架，
   多个 AnimationMixer 同时更新同一 skeleton 会动画互串 */
(function(){
  const SkeletonUtils={};

  function clone(source){
    if(source==null)return null;
    if(source.isObject3D)return cloneObject3D(source);
    if(typeof source.clone==="function")return source.clone();
    return source;
  }
  function cloneObject3D(source){
    const object=new source.constructor();
    object.up.copy(source.up);
    object.position.copy(source.position);
    object.quaternion.copy(source.quaternion);
    object.scale.copy(source.scale);
    object.renderOrder=source.renderOrder;
    object.userData=JSON.parse(JSON.stringify(source.userData||{}));
    if(source.matrixAutoUpdate!==undefined)object.matrixAutoUpdate=source.matrixAutoUpdate;
    if(source.matrixWorldAutoUpdate!==undefined)object.matrixWorldAutoUpdate=source.matrixWorldAutoUpdate;
    if(source.layers)object.layers.mask=source.layers.mask;
    if(source.visible!==undefined)object.visible=source.visible;
    if(source.frustumCulled!==undefined)object.frustumCulled=source.frustumCulled;
    if(source.castShadow!==undefined)object.castShadow=source.castShadow;
    if(source.receiveShadow!==undefined)object.receiveShadow=source.receiveShadow;
    if(source.isMesh||source.isLine||source.isPoints){
      object.geometry=source.geometry;
      object.material=source.material;
      object.drawMode=source.drawMode;
    }
    if(source.isLight){
      object.color.copy(source.color);
      object.intensity=source.intensity;
      object.distance=source.distance;
      object.angle=source.angle;
      object.penumbra=source.penumbra;
      object.decay=source.decay;
    }
    if(source.isCamera){
      object.aspect=source.aspect;
      object.near=source.near;
      object.far=source.far;
      object.fov=source.fov;
      object.zoom=source.zoom;
      object.updateProjectionMatrix();
    }
    if(source.isSprite){object.center.copy(source.center);object.rotation=source.rotation;}
    if(source.type==="Mesh"&&source.isSkinnedMesh)return cloneSkinnedMesh(source);
    if(source.children){
      const cs=source.children;
      for(let i=0,l=cs.length;i<l;i++)object.add(clone(cs[i]));
    }
    return object;
  }
  function cloneSkinnedMesh(source){
    const object=new source.constructor(source.geometry,source.material);
    object.position.copy(source.position);
    object.quaternion.copy(source.quaternion);
    object.scale.copy(source.scale);
    object.renderOrder=source.renderOrder;
    object.userData=JSON.parse(JSON.stringify(source.userData||{}));
    object.matrixAutoUpdate=source.matrixAutoUpdate;
    object.matrixWorldAutoUpdate=source.matrixWorldAutoUpdate;
    object.layers.mask=source.layers.mask;
    object.visible=source.visible;
    object.frustumCulled=source.frustumCulled;
    object.castShadow=source.castShadow;
    object.receiveShadow=source.receiveShadow;
    object.drawMode=source.drawMode;
    if(source.skeleton){
      object.skeleton=source.skeleton.clone();
      object.bindMatrix.copy(source.bindMatrix);
      object.bindMatrixInverse.copy(source.bindMatrixInverse);
    }
    if(source.children){
      const cs=source.children;
      for(let i=0,l=cs.length;i<l;i++)object.add(clone(cs[i]));
    }
    return object;
  }

  SkeletonUtils.clone=clone;
  THREE.SkeletonUtils=SkeletonUtils;
})();

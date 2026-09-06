/* Classic-only Kenney scene dressing. Shared files are read-only source assets. */
"use strict";
(function(root){
  const assets=new Map(), failures=[],shared=new WeakSet();
  const manifest={tree:'nature/tree_oak',factory:'commercial/building-c',house:'commercial/building-a'};
  const loader=new THREE.GLTFLoader();
  const ready=Promise.all(Object.entries(manifest).map(async([key,path])=>{
    try{const gltf=await loader.loadAsync('assets/'+path+'.glb');
      gltf.scene.traverse(o=>{if(o.isMesh){shared.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material])){shared.add(m);m.roughness=.88;m.metalness=key==='steel'?.45:.05;if(m.color)m.color.multiplyScalar(.72);if(key==='tree'&&m.color)m.color.setHex(0x6a784b);}}});
      assets.set(key,gltf.scene);}
    catch(error){failures.push(key);console.warn('Classic asset unavailable:',key,error.message);}
  }));
  function model(key,width,height,depth){
    const source=assets.get(key);if(!source)return null;
    const object=source.clone(true),box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const holder=new THREE.Group();object.position.set(-center.x,-box.min.y,-center.z);holder.add(object);
    holder.scale.set(width/Math.max(.001,size.x),height/Math.max(.001,size.y),depth/Math.max(.001,size.z));
    holder.userData.kenney=key;
    holder.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return holder;
  }
  const slabGeo=new THREE.BoxGeometry(3.94,.18,3.94);
  const pavement=document.createElement('canvas');pavement.width=pavement.height=128;
  const ctx=pavement.getContext('2d');ctx.fillStyle='#70756d';ctx.fillRect(0,0,128,128);
  for(let i=0;i<1400;i++){const n=(i*73)%128,m=(i*47+Math.floor(i/128)*13)%128;ctx.fillStyle=i%3?'#697067':'#7c8075';ctx.fillRect(n,m,1,1);}
  const surface=new THREE.CanvasTexture(pavement);surface.encoding=THREE.sRGBEncoding;
  const slabMat=new THREE.MeshStandardMaterial({map:surface,color:0xd5d1b5,roughness:.96});
  shared.add(slabGeo);shared.add(slabMat);
  function dress(group,C){
    const slabs=new THREE.InstancedMesh(slabGeo,slabMat,C.GRID*C.GRID),matrix=new THREE.Matrix4(),color=new THREE.Color();
    for(let z=0;z<C.GRID;z++)for(let x=0;x<C.GRID;x++){
      const i=z*C.GRID+x;matrix.makeTranslation((x+.5)*C.TILE-C.HALF,-.17,(z+.5)*C.TILE-C.HALF);slabs.setMatrixAt(i,matrix);
      color.setHex((x*17+z*31)%5===0?0xdbded3:0xe5e7dd);slabs.setColorAt(i,color);
    }slabs.receiveShadow=true;group.add(slabs);
    const stripeGeo=new THREE.BoxGeometry(.14,.02,1.4),stripeMat=new THREE.MeshBasicMaterial({color:0xb7ab72});
    const lines=new THREE.InstancedMesh(stripeGeo,stripeMat,C.GRID*2);
    for(let z=0;z<C.GRID;z++)for(let side=0;side<2;side++){matrix.makeTranslation((side?1:-1)*(C.HALF-.35),.01,(z+.5)*C.TILE-C.HALF);lines.setMatrixAt(z*2+side,matrix);}group.add(lines);
    for(let side=-1;side<=1;side+=2)for(let i=0;i<4;i++){
      const building=model(i%2?'house':'factory',6,4.8+(i%2)*1.4,6);if(!building)continue;
      building.position.set(side*(C.HALF+5),-.2,-19+i*12);group.add(building);
      const tree=model('tree',2.5,3.8,2.5);if(tree){tree.position.set(side*(C.HALF+3),0,-14+i*12);group.add(tree);}
    }
  }
  function dispose(group){if(!group)return;const seen=new Set();group.traverse(o=>{
    if(o.isInstancedMesh&&typeof o.dispose==='function')o.dispose();
    for(const resource of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])]){
      if(resource&&!shared.has(resource)&&!root.ClassicFeedback?.blockShared.has(resource)&&!seen.has(resource)){seen.add(resource);resource.dispose();}
    }
  });}
  root.ClassicVisuals={ready,model,dress,dispose,failures,get loaded(){return [...assets.keys()];}};
})(window);

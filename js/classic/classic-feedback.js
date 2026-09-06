/* Classic-only procedural eagle monument and bounded combat effects. */
"use strict";
(function(root){
  const blockGeometry=new THREE.BoxGeometry(1,1,1);
  const brickMaterials=[0xb94923,0xcf582b,0xda6938,0xa63d20].map(color=>new THREE.MeshStandardMaterial({color,roughness:.95}));
  const mortar=new THREE.MeshStandardMaterial({color:0x493a2e,roughness:1});
  const armour=new THREE.MeshStandardMaterial({color:0x929fa0,metalness:.65,roughness:.45});
  const rim=new THREE.MeshStandardMaterial({color:0xc8d1c9,metalness:.7,roughness:.34});
  const blockShared=new Set([blockGeometry,...brickMaterials,mortar,armour,rim]);
  function obstacle(steel,seed=0){
    const root=new THREE.Group();root.userData.classicObstacle=steel?'steel':'brick';
    function block(w,h,d,x,y,z,material){const m=new THREE.Mesh(blockGeometry,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);}
    if(!steel){
      block(3.7,1.75,3.7,0,.875,0,mortar);
      for(let course=0;course<4;course++){
        const segments=course%2?[[-1.45,.88],[0,1.86],[1.45,.88]]:[[-.98,1.88],[.98,1.88]];
        for(let row=0;row<2;row++)for(let j=0;j<segments.length;j++){
          const [x,w]=segments[j];block(w,.4,1.88,x,.24+course*.45,(row?1:-1)*.98,brickMaterials[(seed+course+j+row)%4]);
        }
      }
    }else{
      block(3.7,1.8,3.7,0,.9,0,mortar);
      for(const x of [-.98,.98])for(const z of [-.98,.98]){
        block(1.86,1.88,1.86,x,.94,z,armour);
        block(1.65,.1,1.65,x,1.93,z,rim);
        block(1.35,.09,1.35,x,2.01,z,armour);
        for(const dx of [-.64,.64])for(const dz of [-.64,.64])block(.12,.08,.12,x+dx,2.02,z+dz,mortar);
      }
    }
    // One draw per material per destructible cell; brick detail does not add a draw per brick.
    const batches=new Map();for(const child of root.children){child.updateMatrix();if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(child.matrix.clone());}
    root.clear();for(const [material,matrices] of batches){const batch=new THREE.InstancedMesh(blockGeometry,material,matrices.length);matrices.forEach((matrix,i)=>batch.setMatrixAt(i,matrix));batch.castShadow=true;batch.receiveShadow=true;root.add(batch);}
    return root;
  }
  function eagleBase(){
    const group=new THREE.Group();group.userData.classicEagle=true;
    const steel=new THREE.MeshStandardMaterial({color:0x39494c,roughness:.6,metalness:.5});
    const gold=new THREE.MeshStandardMaterial({color:0xe1bd61,roughness:.35,metalness:.65});
    function box(w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);group.add(m);return m;}
    box(3.55,.3,3.55,0,.15,0,steel);box(2.9,.6,2.65,0,.6,0,steel);
    box(2.25,.12,2.1,0,.96,0,gold);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,3.5,10),gold);pole.position.set(-1,2.35,-.65);group.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.75,1.02,8,3),new THREE.MeshStandardMaterial({color:0x862d26,side:THREE.DoubleSide,roughness:.9}));
    flag.position.set(-.1,3.55,-.65);group.add(flag);group.userData.flag=flag;
    // Symmetric swept wings, central head and tail. An actual silhouette, not an emoji.
    const outline=[[-1.45,.7],[-.65,.4],[-.22,.46],[-.18,.8],[.08,.94],[.35,.76],[.15,.66],[.22,.46],[.65,.4],[1.45,.7],[1.23,.18],[.75,.07],[1.04,-.12],[.52,-.15],[.2,-.35],[.36,-.64],[0,-.47],[-.36,-.64],[-.2,-.35],[-.52,-.15],[-1.04,-.12],[-.75,.07],[-1.23,.18]];
    const shape=new THREE.Shape();outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    const badge=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:1,steps:1}),gold);
    badge.position.set(0,1.9,.15);badge.rotation.x=-.35;group.add(badge);
    const insignia=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:0xe1bd61,side:THREE.DoubleSide}));insignia.scale.setScalar(.35);insignia.position.set(-.1,3.55,-.63);group.add(insignia);
    group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return group;
  }
  function createEffects(scene){
    const limit=160,pool=[],active=[];
    const stamp=document.createElement('canvas');stamp.width=stamp.height=64;const ctx=stamp.getContext('2d');
    const gradient=ctx.createRadialGradient(32,32,2,32,32,32);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.45,'rgba(255,255,255,.55)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const texture=new THREE.CanvasTexture(stamp);
    function take(){if(pool.length)return pool.pop();if(active.length>=limit)return null;
      const mesh=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));return {mesh,velocity:new THREE.Vector3()};}
    function emit(position,kind='hit'){
      const explosion=kind==='destroy',smokeCount=explosion?9:2,count=explosion?28:10;
      for(let i=0;i<count;i++){const p=take();if(!p)break;const smoke=i<smokeCount;
        p.life=p.total=smoke?(explosion?1.8:.5):(.16+Math.random()*.36);p.smoke=smoke;p.size=smoke?(explosion?1.6:.35):(.12+Math.random()*(explosion?.55:.16));
        p.mesh.material.color.setHex(smoke?0x55524c:i%3?0xffb53f:0xfff4c4);p.mesh.material.blending=smoke?THREE.NormalBlending:THREE.AdditiveBlending;
        p.mesh.material.opacity=1;p.mesh.position.copy(position);p.mesh.position.y=Math.max(.35,position.y);
        p.velocity.set((Math.random()-.5)*(explosion?10:4),smoke?1.8:Math.random()*5,(Math.random()-.5)*(explosion?10:4));
        if(explosion&&i===smokeCount){p.size=4.2;p.life=p.total=.24;p.velocity.set(0,.5,0);p.mesh.material.color.setHex(0xff7518);}
        p.mesh.scale.setScalar(p.size);scene.add(p.mesh);active.push(p);
      }
    }
    function update(dt){for(let i=active.length-1;i>=0;i--){const p=active[i];p.life-=dt;
      if(p.life<=0){scene.remove(p.mesh);pool.push(p);active.splice(i,1);continue;}
      p.mesh.position.addScaledVector(p.velocity,dt);if(!p.smoke)p.velocity.y-=dt*8;
      p.mesh.material.opacity=Math.min(1,p.life/p.total*(p.smoke?.65:2));p.mesh.scale.setScalar(p.size*(p.smoke?1+2*(1-p.life/p.total):1));
    }}
    function clear(){for(const p of active){scene.remove(p.mesh);pool.push(p);}active.length=0;}
    return {emit,update,clear,get count(){return active.length;},limit};
  }
  root.ClassicFeedback={eagleBase,createEffects,obstacle,blockShared};
})(window);

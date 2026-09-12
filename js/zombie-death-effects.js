/* Weapon-aware zombie remains. Fixed instanced pools; no mesh/material allocation per kill. */
"use strict";
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ZombieDeathEffects=api;
})(typeof window!=='undefined'?window:null,function(){
  const CAPACITIES=Object.freeze({limb:160,head:64,iceBody:96,ice:256,char:96,ember:256,blood:256,stain:160});
  // Shared with living zombies. Textured clothes need a lighter multiplier than bare fabric.
  const PALETTE=Object.freeze({skin:0x36584a,skinTint:0x86b39a,cloth:0x26382f,clothTint:0x748879,bossSkin:0x5b3b3e,bossTint:0xb08c8b,
    muscle:0x580710,freshBlood:0x980a1b,darkBlood:0x48040c,bone:0x95846a});
  const HIT_BUDGET=24,HIT_REFILL_PER_SECOND=60,HIT_COOLDOWN=.075;
  const HIT_RECIPE=Object.freeze({blood:5});
  const CAUSES=Object.freeze({frost:'freeze',ice:'freeze',freeze:'freeze',frozen:'freeze',
    incendiary:'burn',flame:'burn',fire:'burn',burn:'burn',
    grenade:'explosive',mortar:'explosive',missile:'explosive',cannon:'explosive',bomb:'explosive',explosion:'explosive',explosive:'explosive',
    laser:'energy',rail:'energy',arc:'energy',emp:'energy',energy:'energy'});
  const RECIPES=Object.freeze({
    freeze:{iceBody:3,ice:12,stain:1},burn:{char:3,ember:14,stain:1},
    explosive:{limb:4,head:1,blood:16,stain:2},energy:{char:2,ember:8,stain:1},kinetic:{limb:1,blood:10,stain:1}
  });
  function resolveCause(options={}){
    return CAUSES[String(options.damageType||options.projectileType||options.weapon||'').toLowerCase()]||'kinetic';
  }
  function create({THREE,scene,heightAt=()=>0,random=Math.random}={}){
    if(!THREE||!scene)throw new TypeError('ZombieDeathEffects requires THREE and scene');
    const pools={},transform=new THREE.Object3D(),color=new THREE.Color(),dropDirection=new THREE.Vector3(),dropAxis=new THREE.Vector3(0,1,0);
    const statistics={spawnedByCause:{freeze:0,burn:0,explosive:0,energy:0,kinetic:0},hitBursts:0,droppedHitBursts:0,droppedPieces:0,lastCause:null};
    let camera=null,viewportHeight=900,disposed=false,elapsed=0,hitTokens=HIT_BUDGET,hitTimes=new WeakMap();
    const unitRandom=()=>Math.min(.999999,Math.max(0,Number(random())||0));
    const ground=(x,z,fallback=0)=>{const y=heightAt(x,z);return Number.isFinite(y)?y:fallback;};

    // Bake colored skin, sleeves, torn muscle and exposed bone into one reusable limb mesh.
    function joinColored(parts){
      const positions=[],normals=[],colors=[];
      for(const [source,tint,x=0,y=0,z=0,rotation=0] of parts){
        const g=source.index?source.toNonIndexed():source;
        g.rotateZ(rotation);g.translate(x,y,z);const p=g.getAttribute('position'),n=g.getAttribute('normal');
        color.setHex(tint);
        for(let i=0;i<p.count;i++){
          positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(color.r,color.g,color.b);
        }
        if(g!==source)g.dispose();source.dispose();
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;
    }
    function limbGeometry(charred=false,frozen=false){
      const skin=frozen?0x5893a5:charred?0x20211e:PALETTE.skin;
      const cloth=frozen?0x284951:charred?0x131814:PALETTE.cloth;
      const muscle=frozen?0x8dcbd8:charred?0x6a2412:PALETTE.muscle;
      const bone=frozen?0xb8e4eb:charred?0x765039:PALETTE.bone;
      return joinColored([
        [new THREE.CylinderGeometry(.07,.085,.28,5),cloth,0,.11],
        [new THREE.CylinderGeometry(.057,.069,.24,5),skin,.055,-.13,0,.4],
        [new THREE.BoxGeometry(.092,.072,.095),skin,.11,-.26],
        [new THREE.CylinderGeometry(.084,.075,.065,6),muscle,0,.251],
        [new THREE.CylinderGeometry(.037,.054,.105,5),muscle,.04,.277,.024,-.5],
        [new THREE.CylinderGeometry(.019,.013,.075,4),muscle,-.034,.3,-.024,.4],
        [new THREE.CylinderGeometry(.011,.01,.023,5),bone,0,.292],
      ]);
    }
    function headGeometry(){
      return joinColored([
        [new THREE.SphereGeometry(.14,7,5),PALETTE.skin,0,.025],
        [new THREE.BoxGeometry(.07,.03,.015),0x171d19,-.055,.055,.128],
        [new THREE.BoxGeometry(.07,.03,.015),0x171d19,.055,.055,.128],
        [new THREE.BoxGeometry(.07,.018,.025),PALETTE.muscle,0,-.035,.13],
        [new THREE.CylinderGeometry(.068,.053,.075,5),PALETTE.muscle,0,-.124],
        [new THREE.CylinderGeometry(.02,.034,.075,4),PALETTE.muscle,.033,-.158,0,.3],
        [new THREE.CylinderGeometry(.009,.01,.025,5),PALETTE.bone,0,-.169]
      ]);
    }
    function stainGeometry(){
      const vertices=[],radii=[.6,.7,.69,.55,.6,.8,.88,.8,.63,.56,.64,.73,.61,.44,.44,.58];
      for(let i=0;i<radii.length;i++){
        const a=i*Math.PI*2/radii.length,b=(i+1)*Math.PI*2/radii.length,r=radii[i],s=radii[(i+1)%radii.length];
        vertices.push(0,0,0,Math.cos(b)*s,0,Math.sin(b)*s,Math.cos(a)*r,0,Math.sin(a)*r);
      }
      // Small satellite flecks belong to the same mesh instead of adding a circular decal per drop.
      for(const [x,z,r] of [[1.08,.12,.1],[-.77,.78,.08],[.34,-1.02,.07],[-1.08,-.25,.06]])
        vertices.push(x-r,0,z-r,x+r,0,z-r*.5,x,0,z+r);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
    }
    const definitions={
      limb:[limbGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94})],
      head:[headGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94})],
      iceBody:[limbGeometry(false,true),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.24,metalness:.18,emissive:0x1a4957,emissiveIntensity:.3})],
      ice:[new THREE.OctahedronGeometry(.1,0),new THREE.MeshStandardMaterial({color:0xc4f8ff,roughness:.14,metalness:.25,emissive:0x316f82,emissiveIntensity:.45})],
      char:[limbGeometry(true),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})],
      ember:[new THREE.TetrahedronGeometry(.075,0),new THREE.MeshBasicMaterial({color:0xffffff})],
      blood:[new THREE.SphereGeometry(.082,5,4),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false})],
      stain:[stainGeometry(),new THREE.MeshBasicMaterial({color:0xffffff,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})]
    };
    for(const [kind,capacity] of Object.entries(CAPACITIES)){
      const [geometry,material]=definitions[kind],mesh=new THREE.InstancedMesh(geometry,material,capacity);
      // Three r128 sizes lazy instanceColor by current draw count, which is zero while idle.
      // Allocate the full pool before hiding it or every color write targets a zero-length buffer.
      mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3).fill(1),3).setUsage(THREE.DynamicDrawUsage);
      mesh.name=`zombie-death-${kind}`;mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.raycast=()=>{};
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.userData.zombieDeathEffect=true;scene.add(mesh);
      // Fixed records survive reuse; every active instance lives in [0, count).
      const slots=Array.from({length:capacity},()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,rx:0,ry:0,rz:0,spin:0,size:0,stretch:1,life:0,total:0,settled:false,tint:0xffffff,cause:'kinetic'}));
      pools[kind]={kind,capacity,mesh,slots,count:0,cursor:0};
    }
    function writeInstance(pool,i,p){
      const shrink=Math.min(1,p.life/(pool.kind==='stain'?.8:.3));
      transform.position.set(p.x,p.y,p.z);transform.rotation.set(p.rx,p.ry,p.rz);
      if(pool.kind==='stain')transform.scale.set(p.size*shrink,1,p.size*.65*shrink);
      else if(pool.kind==='ice')transform.scale.set(p.size*.55*shrink,p.size*1.7*shrink,p.size*.8*shrink);
      else if(pool.kind==='blood'){
        if(!p.settled){dropDirection.set(p.vx,p.vy,p.vz).normalize();transform.quaternion.setFromUnitVectors(dropAxis,dropDirection);}
        else transform.rotation.set(Math.PI*.5,p.ry,0);
        transform.scale.set(p.size*.7*shrink,p.size*p.stretch*shrink,p.size*.7*shrink);
      }
      else transform.scale.setScalar(p.size*shrink);
      transform.updateMatrix();pool.mesh.setMatrixAt(i,transform.matrix);
      color.setHex(p.tint);pool.mesh.setColorAt(i,color);
    }
    function commit(pool){
      pool.mesh.count=pool.count;pool.mesh.visible=pool.count>0;
      pool.mesh.instanceMatrix.needsUpdate=true;if(pool.mesh.instanceColor)pool.mesh.instanceColor.needsUpdate=true;
    }
    function emit(enemy,options={},isHit=false){
      if(disposed)return false;
      const origin=enemy?.group?.position||enemy?.position;
      if(!origin||!Number.isFinite(origin.x)||!Number.isFinite(origin.y)||!Number.isFinite(origin.z))return false;
      options=options||{};
      const cause=resolveCause(options),height=Math.max(.65,Math.min(8,Number(enemy._lodHeight)||Number(enemy.visualHeight)||1.6));
      if(isHit&&cause!=='kinetic'&&cause!=='explosive')return false;
      const scale=height/1.6,recipe=isHit?HIT_RECIPE:RECIPES[cause];
      let detail=1;
      if(camera){
        const distance=Math.max(1,Math.hypot(origin.x-camera.position.x,origin.y-camera.position.y,origin.z-camera.position.z));
        const projection=camera.projectionMatrix?.elements?.[5]||2;
        const pixels=height*viewportHeight*projection/(distance*2);
        detail=pixels<12?.2:pixels<32?.5:1;
      }
      const bloodCount=Math.max(isHit?2:cause==='explosive'?4:3,Math.round((recipe.blood||0)*detail));
      if(isHit){
        const last=hitTimes.get(enemy);
        if(hitTokens<bloodCount||(last!==undefined&&elapsed-last<HIT_COOLDOWN)){
          statistics.droppedHitBursts++;return false;
        }
        hitTokens-=bloodCount;hitTimes.set(enemy,elapsed);statistics.hitBursts++;
      }else{
        statistics.spawnedByCause[cause]++;statistics.lastCause=cause;
      }
      const direction=options.hitDirection,explosion=options.explosionOrigin;
      const hitPoint=isHit&&options.hitPoint;
      const useHitPoint=hitPoint&&Number.isFinite(hitPoint.x)&&Number.isFinite(hitPoint.y)&&Number.isFinite(hitPoint.z);
      let dx=direction?.x||0,dz=direction?.z||0;
      if(explosion){dx=origin.x-explosion.x;dz=origin.z-explosion.z;}
      const length=Math.hypot(dx,dz);
      if(length>.0001){dx/=length;dz/=length;}else{const a=unitRandom()*Math.PI*2;dx=Math.cos(a);dz=Math.sin(a);}
      for(const [kind,budget] of Object.entries(recipe)){
        const pool=pools[kind],count=kind==='blood'?bloodCount:Math.max(1,Math.round(budget*detail));
        for(let i=0;i<count;i++){
          let index;
          if(pool.count<pool.capacity)index=pool.count++;
          else{index=pool.cursor++%pool.capacity;statistics.droppedPieces++;}
          const p=pool.slots[index],angle=unitRandom()*Math.PI*2,spread=cause==='explosive'?2.6:1.25;
          const forward=cause==='explosive'?3.2+unitRandom()*3.6:cause==='kinetic'?1.5+unitRandom()*2:0;
          p.x=origin.x+(unitRandom()-.5)*height*.22;p.y=origin.y+height*(.3+unitRandom()*.55);p.z=origin.z+(unitRandom()-.5)*height*.22;
          if(useHitPoint){p.x=hitPoint.x+(unitRandom()-.5)*height*.08;p.y=hitPoint.y+(unitRandom()-.5)*height*.08;p.z=hitPoint.z+(unitRandom()-.5)*height*.08;}
          p.vx=(dx*forward+Math.cos(angle)*spread)*Math.sqrt(scale);p.vz=(dz*forward+Math.sin(angle)*spread)*Math.sqrt(scale);
          p.vy=(cause==='explosive'?3+unitRandom()*4:1.3+unitRandom()*2)*Math.sqrt(scale);
          p.rx=unitRandom()*Math.PI;p.ry=unitRandom()*Math.PI*2;p.rz=unitRandom()*Math.PI;p.spin=(unitRandom()-.5)*13;
          p.size=scale*(.75+unitRandom()*.55);p.stretch=1;p.settled=false;p.cause=cause;p.tint=0xffffff;
          p.life=p.total=kind==='ice'||kind==='iceBody'?1.5+unitRandom():kind==='blood'?1.5+unitRandom()*1.1:3+unitRandom()*1.5;
          if(kind==='blood'){
            // Opaque red fluid keeps its hue in the dim scene; no additive light or giant transparent cloud.
            p.tint=i%4===0?PALETTE.freshBlood:i%2?PALETTE.darkBlood:PALETTE.muscle;
            p.stretch=2.1+unitRandom()*1.8;
            p.size*=detail<.5?1.65:detail<1?1.25:1;
            p.life=p.total=isHit?.28+unitRandom()*.22:.65+unitRandom()*.45;
            p.vx*=1.1;p.vz*=1.1;p.vy*=.6;
            if(isHit){p.size*=.85;p.vy*=.65;}
          }else if(kind==='ember'){
            p.vx*=.22;p.vz*=.22;p.vy=1+unitRandom()*1.8;p.size*=.35+unitRandom()*.5;
            p.tint=cause==='energy'?(i%2?0xbafaff:0x4edacb):(i%3?0xff851f:0xffda6c);p.life=p.total=.6+unitRandom()*1.3;
          }else if(kind==='stain'){
            p.x=origin.x+(i?dx*unitRandom()*1.2*scale:0);p.z=origin.z+(i?dz*unitRandom()*1.2*scale:0);
            p.y=ground(p.x,p.z,origin.y)+.025;p.rx=p.rz=0;p.vx=p.vy=p.vz=0;p.settled=true;
            p.size=scale*(cause==='explosive'?.62:.34);p.life=p.total=5+unitRandom()*3;
            p.tint=cause==='freeze'?0x679bad:cause==='burn'||cause==='energy'?0x242622:0x57111a;
          }
          writeInstance(pool,index,p);
        }
        commit(pool);
      }
      return true;
    }
    function spawn(enemy,options={}){return emit(enemy,options,false);}
    function hit(enemy,options={}){return emit(enemy,options,true);}
    function update(dt,nextCamera,nextViewportHeight){
      if(disposed)return;
      if(nextCamera)camera=nextCamera;
      if(Number.isFinite(nextViewportHeight)&&nextViewportHeight>0)viewportHeight=nextViewportHeight;
      if(!Number.isFinite(dt)||dt<=0)return;
      elapsed+=dt;hitTokens=Math.min(HIT_BUDGET,hitTokens+dt*HIT_REFILL_PER_SECOND);
      // Large tab-resume deltas expire records using real elapsed time, but physics never takes an unsafe giant step.
      const step=Math.min(dt,.05);
      for(const pool of Object.values(pools)){
        if(!pool.count)continue;
        for(let i=0;i<pool.count;){
          const p=pool.slots[i];p.life-=dt;
          if(p.life<=0){pool.count--;pool.slots[i]=pool.slots[pool.count];pool.slots[pool.count]=p;continue;}
          if(!p.settled){
            p.vy-=pool.kind==='ember'?-1.1*step:10*step;
            p.x+=p.vx*step;p.y+=p.vy*step;p.z+=p.vz*step;p.rx+=p.spin*step;p.rz+=p.spin*.65*step;
            const floor=ground(p.x,p.z,p.y-1)+.035;
            if(p.y<floor&&pool.kind!=='ember'){
              p.y=floor;p.settled=true;p.vx=p.vy=p.vz=0;
              if(pool.kind==='limb'||pool.kind==='iceBody'||pool.kind==='char')p.rz=Math.PI*.5;
            }
          }
          writeInstance(pool,i,p);i++;
        }
        commit(pool);
      }
    }
    function inspect(){
      const poolState={};let activePieces=0,drawCalls=0,maxPieces=0;
      for(const pool of Object.values(pools)){
        poolState[pool.kind]={active:pool.count,capacity:pool.capacity};activePieces+=pool.count;maxPieces+=pool.capacity;if(pool.count)drawCalls++;
      }
      return {...statistics,spawnedByCause:{...statistics.spawnedByCause},activePieces,maxPieces,drawCalls,pools:poolState};
    }
    function sample(limit=24){
      const result=[];
      for(const pool of Object.values(pools))for(let i=0;i<pool.count&&result.length<Math.min(1600,limit);i++){
        const p=pool.slots[i];result.push({kind:pool.kind,cause:p.cause,x:p.x,y:p.y,z:p.z,vx:p.vx,vy:p.vy,vz:p.vz,life:p.life,tint:p.tint,size:p.size,stretch:p.stretch});
      }
      return result;
    }
    function clear(){
      for(const pool of Object.values(pools)){pool.count=pool.cursor=0;commit(pool);}
      elapsed=0;hitTokens=HIT_BUDGET;hitTimes=new WeakMap();statistics.hitBursts=statistics.droppedHitBursts=0;
      statistics.droppedPieces=0;statistics.lastCause=null;for(const cause in statistics.spawnedByCause)statistics.spawnedByCause[cause]=0;
    }
    function dispose(){
      if(disposed)return;clear();disposed=true;
      for(const pool of Object.values(pools)){scene.remove(pool.mesh);pool.mesh.geometry.dispose();pool.mesh.material.dispose();pool.mesh.dispose?.();}
    }
    return {spawn,hit,update,clear,inspect,sample,dispose};
  }
  return {create,resolveCause,CAPACITIES,PALETTE};
});

/* Worker orders own reserved resources until completion or cancellation. */
const constructionJobs=[];
let constructionSequence=0;
function constructionPassable(x,z){
  return friendlyCellPassable(x,z)&&(!structCells.has(idx(x,z))||grid[z][x]===T_BASE);
}
function constructionHome(){
  const origin=cellOf(baseGroup.position.x,baseGroup.position.z);
  // Pick the closest walkable doorway cell, never spawn on a roof or through a wall.
  for(let radius=0;radius<10;radius++)for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==radius)continue;
    const x=origin.x+dx,z=origin.z+dz;
    if(inMap(x,z)&&constructionPassable(x,z))return {x,z};
  }
  return null;
}
function constructionGoals(anchor,build){
  const [w,d]=build.footprint||[1,1],goals=[];
  for(let x=anchor.x;x<anchor.x+w;x++){goals.push({x,z:anchor.z-1},{x,z:anchor.z+d});}
  for(let z=anchor.z;z<anchor.z+d;z++){goals.push({x:anchor.x-1,z},{x:anchor.x+w,z});}
  return goals;
}
function makeConstructionWorker(){
  const root=new THREE.Group();root.name='基地工程师';
  const material=(color)=>new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.08});
  const navy=material(0x30485a),orange=material(0xf0a52b),skin=material(0xdcb692),dark=material(0x263139);
  const part=(parent,w,h,d,x,y,z,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  part(root,.52,.62,.32,0,1.05,0,orange);
  part(root,.32,.3,.3,0,1.53,0,skin);
  part(root,.46,.15,.41,0,1.74,0,orange);
  part(root,.5,.04,.51,0,1.66,.04,orange);
  part(root,.42,.07,.025,0,1.07,.175,material(0xffefb3));
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.16,.76,0);root.add(leg);part(leg,.19,.58,.23,0,-.29,0,navy);part(leg,.23,.14,.35,0,-.62,.05,dark);legs.push(leg);
    const arm=new THREE.Group();arm.position.set(side*.34,1.32,0);root.add(arm);part(arm,.16,.48,.18,0,-.23,0,navy);part(arm,.17,.16,.19,0,-.52,0,skin);arms.push(arm);
  }
  part(arms[1],.07,.42,.07,0,-.62,.12,dark);part(arms[1],.3,.12,.13,0,-.82,.12,navy);
  root.userData.legs=legs;root.userData.arms=arms;
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return root;
}
function makeConstructionSite(job){
  const g=new THREE.Group(),[w,d]=job.build.footprint||[1,1];
  const material=new THREE.MeshStandardMaterial({color:0x7e8990,roughness:.9});
  const slab=new THREE.Mesh(new THREE.BoxGeometry(w*TILE-.25,.16,d*TILE-.25),material);slab.position.y=.08;g.add(slab);
  const frame=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w*TILE-.45,2.7,d*TILE-.45)),new THREE.LineBasicMaterial({color:0xe8b85c}));
  frame.position.y=1.5;g.add(frame);job.frame=frame;
  const board=new THREE.Mesh(new THREE.BoxGeometry(Math.min(w*TILE,4),.3,.15),new THREE.MeshBasicMaterial({color:0x25313a}));board.position.set(0,3.3,0);g.add(board);
  const bar=new THREE.Mesh(new THREE.BoxGeometry(Math.min(w*TILE,4)-.12,.18,.18),new THREE.MeshBasicMaterial({color:0xf1b84b}));bar.position.set(0,3.3,.04);bar.scale.x=.01;g.add(bar);job.progressBar=bar;
  job.preview=makeConstructionPreview(job);g.add(job.preview);renderer.localClippingEnabled=true;
  attachWorldHealthBar(g,2.95,2.6);
  const cc=footprintCenter(job.anchor,job.build);g.position.set(cc.x,heightAt(cc.x,cc.z),cc.z);
  g.userData.constructionId=job.id;return g;
}
function addConstructionJob(build,anchor,cost,path,saved){
  const job={id:++constructionSequence,build,anchor:{...anchor},cost,pop:build.pop||0,phase:'outbound',elapsed:0,duration:ConstructionSystem.duration(build.id),route:path,routeIndex:1,retry:0,home:path[0],...saved};
  job.maxHp=build.id==='wall'?wallMaxHp(1):180*(build.footprint?.[0]||1)*(build.footprint?.[1]||1);
  job.hp=Math.max(1,Math.min(job.maxHp,Number(saved?.hp)||job.maxHp));
  job.worker=makeConstructionWorker();
  const first=cellCenter(job.home.x,job.home.z);
  job.worker.position.set(first.x,heightAt(first.x,first.z),first.z);
  if(saved?.position)job.worker.position.set(saved.position.x,heightAt(saved.position.x,saved.position.z),saved.position.z);
  scene.add(job.worker);
  if(job.phase!=='returning'){
    reserveFootprint(job,footprintCells(anchor,build));job.site=makeConstructionSite(job);scene.add(job.site);
  }
  constructionJobs.push(job);return job;
}
function damageConstruction(job,damage){
  if(!job||job.phase==='returning'||!Number.isFinite(damage)||damage<=0)return false;
  job.hp=Math.max(0,job.hp-damage);
  if(job.site)syncWorldHealthBar(job.site.userData.healthBar,job.hp,job.maxHp);
  if(job.hp<=0){
    releaseFootprint(job);game.popUsed=Math.max(0,game.popUsed-job.pop);
    constructionReturn(job);computeFlowField();updateResUI();toast('工地被摧毁，工程师返回基地');
  }
  return true;
}
function queueConstruction(build,anchor){
  if(!baseAlive||!baseGroup||!footprintPlaceable(anchor,build))return false;
  const pending=constructionJobs.filter(j=>j.phase!=='returning');
  const owned={house:builtHouses.length,research:researchInstitutes.length,factory:heavyFactories.length,goldmine:goldMines.length};
  const limit={house:5,research:1,factory:1,goldmine:mineUnlockedCount()}[build.id];
  if(limit&&owned[build.id]+pending.filter(j=>j.build.id===build.id).length>=limit){toast('该建筑数量已达上限（含施工中）');return false;}
  if(constructionJobs.length>=12){toast('工程队正在忙碌，请等待工人返回');return false;}
  const cost=priceOf(build),pop=build.pop||0;
  if(game.gold<cost){toast('金币不足');return false;}
  if(game.popUsed+pop>game.popMax){toast('人口不足，请先建住房');return false;}
  const home=constructionHome();
  const blocked=new Set(footprintCells(anchor,build).map(c=>idx(c.x,c.z)));
  const path=home&&ConstructionSystem.findPath(home,constructionGoals(anchor,build),GRID,GRID,(x,z)=>constructionPassable(x,z)&&!blocked.has(idx(x,z)),flowCanStep);
  if(!path){toast('工程师无法到达工地，请保留施工通道');return false;}
  game.gold-=cost;game.popUsed+=pop;
  addConstructionJob(build,anchor,cost,path);
  updateResUI();updateGoldUI();toast(`工程师出发 · ${build.name} · 施工 ${ConstructionSystem.duration(build.id)} 秒`);
  return true;
}
function constructionReturn(job){
  if(job.site){scene.remove(job.site);disposeTransientObject3D(job.site);job.site=null;}
  job.phase='returning';job.retry=0;job.route=null;job.footprintCells=[];
  renderCmdCard();
}
function cancelConstruction(job){
  if(!job||job.phase==='returning')return false;
  releaseFootprint(job);game.gold+=job.cost;game.popUsed=Math.max(0,game.popUsed-job.pop);
  constructionReturn(job);updateResUI();updateGoldUI();toast('施工已取消，费用已退回，工程师返回基地');return true;
}
function completeConstruction(job){
  releaseFootprint(job);
  job.footprintCells=[];
  // The existing factory is the single owner of completed building effects.
  const selected=buildSel,cell=ghostCell,visible=ghost&&ghost.visible;
  game.gold+=job.cost;game.popUsed=Math.max(0,game.popUsed-job.pop);
  buildSel=shopList().findIndex(b=>b.id===job.build.id);ghostCell={...job.anchor};
  const oldGhost=ghost;if(!ghost)ghost={visible:true};else ghost.visible=true;
  try{
    placeBuildingImmediately(null,null,job);
    const ci=idx(job.anchor.x,job.anchor.z),ratio=job.hp/job.maxHp;
    if(job.build.id==='wall'&&wallMeta.has(ci)){const hp=Math.max(1,wallMaxHp(1)*ratio);steelHP.set(ci,hp);wallMeta.get(ci).hp=hp;}
    else{const finished=ownedStructureAtCell(ci);if(finished&&finished.record!==job)finished.record.hp=Math.max(1,finished.record.maxHp*ratio);}
  }finally{buildSel=selected;ghostCell=cell;ghost=oldGhost;if(ghost)ghost.visible=visible;}
  constructionReturn(job);
}
function updateConstruction(dt){
  if(ACTIVE_MODE.key!=='survival'||!Number.isFinite(dt)||dt<=0)return;
  for(let i=constructionJobs.length-1;i>=0;i--){
    const job=constructionJobs[i];
    if(!baseAlive){cancelConstruction(job);scene.remove(job.worker);disposeTransientObject3D(job.worker);constructionJobs.splice(i,1);continue;}
    const working=job.phase==='building';
    if(working){
      const center=footprintCenter(job.anchor,job.build),position=job.worker.position;
      job.worker.rotation.y=Math.atan2(center.x-position.x,center.z-position.z);
      job.worker.userData.legs.forEach(leg=>leg.rotation.x=0);
      job.worker.userData.arms[0].rotation.x=-.35;
      const done=ConstructionSystem.advance(job,dt),progress=job.elapsed/job.duration;
      updateConstructionStage(job);
      job.progressBar.scale.x=Math.max(.01,progress);job.frame.scale.y=.2+progress*.8;
      job.worker.userData.arms[1].rotation.x=-.9+Math.sin(job.elapsed*12)*.65;
      if(done)completeConstruction(job);
      continue;
    }
    job.retry-=dt;
    if(!job.route){
      if(job.retry>0)continue;
      const start=cellOf(job.worker.position.x,job.worker.position.z),goals=job.phase==='returning'?[job.home]:constructionGoals(job.anchor,job.build);
      job.route=ConstructionSystem.findPath(start,goals,GRID,GRID,constructionPassable,flowCanStep);job.routeIndex=1;job.retry=1;
      if(!job.route)continue;
    }
    const next=job.route[job.routeIndex];
    if(!next){
      if(job.phase==='returning'){scene.remove(job.worker);disposeTransientObject3D(job.worker);constructionJobs.splice(i,1);}
      else{
        const c=footprintCenter(job.anchor,job.build),[w,d]=job.build.footprint||[1,1],p=job.worker.position;
        const goal={x:Math.max(c.x-w*TILE/2-.55,Math.min(c.x+w*TILE/2+.55,p.x)),z:Math.max(c.z-d*TILE/2-.55,Math.min(c.z+d*TILE/2+.55,p.z))};
        const dx=goal.x-p.x,dz=goal.z-p.z,distance=Math.hypot(dx,dz);
        if(distance>.02){const move=Math.min(distance,dt*5.2);p.x+=dx/distance*move;p.z+=dz/distance*move;p.y=heightAt(p.x,p.z);}
        else job.phase='building';
      }
      continue;
    }
    if(!constructionPassable(next.x,next.z)){job.route=null;continue;}
    const target=cellCenter(next.x,next.z),p=job.worker.position,dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz),step=Math.min(distance,dt*5.2);
    if(distance>0){p.x+=dx/distance*step;p.z+=dz/distance*step;p.y=heightAt(p.x,p.z);job.worker.rotation.y=Math.atan2(dx,dz);}
    job.walkTime=(job.walkTime||0)+dt;
    job.worker.userData.legs.forEach((leg,index)=>leg.rotation.x=Math.sin(job.walkTime*11+index*Math.PI)*.55);
    job.worker.userData.arms.forEach((arm,index)=>arm.rotation.x=-Math.sin(job.walkTime*11+index*Math.PI)*.45);
    if(distance<=step+.001)job.routeIndex++;
  }
}
function clearConstruction(){
  for(const job of constructionJobs){releaseFootprint(job);if(job.site){scene.remove(job.site);disposeTransientObject3D(job.site);}scene.remove(job.worker);disposeTransientObject3D(job.worker);}
  constructionJobs.length=0;
}
function serializeConstruction(){
  return constructionJobs.map(j=>({buildId:j.build.id,anchor:j.anchor,cost:j.cost,hp:j.hp,phase:j.phase,elapsed:j.elapsed,duration:j.duration,home:j.home,position:{x:j.worker.position.x,z:j.worker.position.z}}));
}
function restoreConstruction(data){
  clearConstruction();
  for(const item of (Array.isArray(data)?data:[]).slice(0,12)){
    if(!item||typeof item!=='object')continue;
    const build=shopList().find(b=>b.id===item.buildId);
    if(!build||!item.anchor||!Number.isInteger(item.anchor.x)||!Number.isInteger(item.anchor.z)||!inMap(item.anchor.x,item.anchor.z)||!item.home||!Number.isInteger(item.home.x)||!Number.isInteger(item.home.z)||!inMap(item.home.x,item.home.z))continue;
    const phase=['outbound','building','returning'].includes(item.phase)?item.phase:'outbound';
    if(phase!=='returning'&&!footprintPlaceable(item.anchor,build))continue;
    const duration=ConstructionSystem.duration(build.id),elapsed=Math.max(0,Math.min(duration,Number(item.elapsed)||0));
    const position=item.position&&Number.isFinite(item.position.x)&&Number.isFinite(item.position.z)?item.position:null;
    addConstructionJob(build,item.anchor,Math.max(0,Number(item.cost)||0),[item.home],{phase,elapsed,duration,hp:item.hp,home:item.home,position,route:null});
    if(phase!=='returning')game.popUsed+=build.pop||0;
  }
}
function finishIndustrialFacade(group,kind){
  if(!group||group.getObjectByName('工业建筑入口'))return;
  const accents={house:0xc7a55f,research:0x79bcc1,factory:0xd49a54,goldmine:0xb5a348};
  if(!accents[kind])return;
  const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
  const width=Math.max(1.2,Math.min(4,size.x*.72)),depth=Math.max(.5,Math.min(1.8,size.z*.3));
  const entrance=new THREE.Group();entrance.name='工业建筑入口';
  const concrete=new THREE.MeshStandardMaterial({color:0xadb2aa,roughness:.92});
  const metal=new THREE.MeshStandardMaterial({color:accents[kind],roughness:.72,metalness:.18,emissive:accents[kind],emissiveIntensity:.08});
  const box=(w,h,d,x,y,z,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;entrance.add(mesh);};
  const front=Math.min(size.z*.48,3);
  box(width,.15,depth,0,.12,front,concrete);
  box(width,.12,.4,0,Math.min(2.3,size.y*.68),front,metal);
  box(.1,1.2,.1,-width*.43,.8,front,metal);box(.1,1.2,.1,width*.43,.8,front,metal);
  group.add(entrance);
}

let survivalRestoreEnvironment=null;
function savedSurvivalEnvironment(snapshot){
  const occupied=new Set(),widths={walls:1,mines:1,turrets:1,houses:1,heroHubs:2,research:2,factories:2,beacons:1};
  for(const [key,width] of Object.entries(widths))for(const r of snapshot.structures?.[key]||[])for(let dz=0;dz<width;dz++)for(let dx=0;dx<width;dx++)occupied.add(idx(r.x+dx,r.z+dz));
  for(const j of snapshot.construction||[]){const spec=shopList().find(b=>b.id===j.buildId);if(spec&&j.anchor)for(const c of footprintCells(j.anchor,spec))occupied.add(idx(c.x,c.z));}
  return {occupied,trees:Array.isArray(snapshot.terrainTrees)?snapshot.terrainTrees.filter(i=>Number.isInteger(i)&&i>=0&&i<GRID*GRID):null};
}
/* Paid research jobs. Serializable locators keep save files independent of scene objects. */
let applyingUpgrade=false,upgradeEscrowCost=null;
function paidUpgradeCost(cost){return applyingUpgrade?upgradeEscrowCost:cost;}
const BASE_ROUTES={tower:{name:'炮台要塞',color:0x698999},tank:{name:'装甲指挥部',color:0xc29448},hero:{name:'英雄指挥中心',color:0xa82c37}};
function upgradeOwner(kind,ref){return {kind,x:ref?.x??ref?.cx??0,z:ref?.z??ref?.cz??0};}
function upgradeOwnerKey(o){return `${o.kind}:${o.x}:${o.z}`;}
function resolveUpgradeOwner(o){
  if(o.kind==='base')return baseAlive&&baseGroup?{group:baseGroup}:null;
  if(o.kind==='wall'){const ci=idx(o.x,o.z);return wallMeta.has(ci)&&steelHP.get(ci)>0?{x:o.x,z:o.z}:null;}
  const list={goldmine:goldMines,house:builtHouses,turret:builtTurrets,beacon:visionBeacons,research:researchInstitutes}[o.kind];
  return list?.find(r=>(r.x??r.cx)===o.x&&(r.z??r.cz)===o.z&&r.hp>0&&r.group?.parent);
}
function pendingUpgrade(type,id,owner){return (game.upgradeJobs||[]).find(j=>j.type===type&&j.id===id&&(!owner||upgradeOwnerKey(j.owner)===upgradeOwnerKey(owner)));}
function deferUpgrade(type,id,owner,cost,level=0){
  if(ACTIVE_MODE.key!=='survival'||game._restoring||applyingUpgrade)return false;
  if((type==='base'||type==='branch')&&(game.upgradeJobs||[]).some(j=>j.type===type&&upgradeOwnerKey(j.owner)===upgradeOwnerKey(owner)))return true;
  if(!resolveUpgradeOwner(owner)||pendingUpgrade(type,id,owner)||!Number.isFinite(cost)||cost<0||game.gold<cost)return true;
  const total=type==='base'?30:type==='doctrine'?15+3*level:type==='tech'||type==='breakthrough'?Math.min(45,12+3*level):Math.min(30,8+2*level);
  game.gold-=cost;(game.upgradeJobs||(game.upgradeJobs=[])).push({type,id,owner,cost,total,remaining:total});
  refreshHeroUI();return true;
}
function executeUpgrade(j,ref){
  const functions={goldmine:()=>upgradeGoldMine(ref),house:()=>upgradeHouse(ref),beacon:()=>upgradeMedicalBeacon(ref),turret:()=>upgradeTurretAt(j.owner.x,j.owner.z),wall:()=>upgradeWallAt(j.owner.x,j.owner.z),branch:()=>chooseTurretBranch(ref,j.id),tech:()=>upgradeTech(j.id),breakthrough:()=>upgradeBreakthrough(j.id),doctrine:()=>buyDoctrineTech(j.id),base:()=>chooseDoctrine(j.id)};
  if(!functions[j.type])return;
  // Release escrow to the existing validated purchase path, which consumes it once.
  game.gold+=j.cost;applyingUpgrade=true;upgradeEscrowCost=j.cost;
  try{functions[j.type]();}finally{applyingUpgrade=false;upgradeEscrowCost=null;}
}
function updateUpgradeJobs(dt){
  if(!(dt>0)||ACTIVE_MODE.key!=='survival')return;
  const occupied=new Set(),jobs=game.upgradeJobs||(game.upgradeJobs=[]);
  for(const j of [...jobs]){
    const ref=resolveUpgradeOwner(j.owner),key=upgradeOwnerKey(j.owner);
    if(!ref){game.gold+=j.cost;jobs.splice(jobs.indexOf(j),1);continue;}
    if(occupied.has(key))continue;occupied.add(key);
    j.remaining=Math.max(0,j.remaining-dt);
    if(j.remaining===0){jobs.splice(jobs.indexOf(j),1);executeUpgrade(j,ref);}
  }
  updateBaseDoctrineVisual();
}
function validUpgradeDescriptor(j){
  const expected={goldmine:'goldmine',house:'house',beacon:'beacon',turret:'turret',wall:'wall',branch:'turret',tech:'research',breakthrough:'research',doctrine:'base',base:'base'};
  if(!expected[j.type]||j.owner?.kind!==expected[j.type])return false;
  if(j.type==='base')return !!BASE_ROUTES[j.id];
  if(j.type==='doctrine')return !!HeroSystem.TECH[j.id];
  if(j.type==='tech')return !!TECH_TREE[j.id];
  if(j.type==='breakthrough')return !!SurvivalSystem.BREAKTHROUGH_RESEARCH[j.id];
  if(j.type==='branch')return !!SurvivalSystem.TURRET_BRANCHES[j.id];
  return j.id==='';
}
function restoreUpgradeJobs(input){
  const seen=new Set();game.upgradeJobs=[];
  for(const raw of Array.isArray(input)?input.slice(0,512):[]){
    if(!raw||!validUpgradeDescriptor(raw)||!['goldmine','house','beacon','turret','wall','branch','tech','breakthrough','doctrine','base'].includes(raw.type)||!raw.owner||!Number.isInteger(raw.owner.x)||!Number.isInteger(raw.owner.z))continue;
    const cost=Number(raw.cost),total=Number(raw.total),remaining=Number(raw.remaining),key=raw.type+':'+raw.id+':'+upgradeOwnerKey(raw.owner);
    if(seen.has(key)||!Number.isFinite(cost)||cost<0||cost>1e15||!Number.isFinite(total)||total<=0||total>120||!Number.isFinite(remaining))continue;
    seen.add(key);game.upgradeJobs.push({type:raw.type,id:String(raw.id),owner:{...raw.owner},cost,total,remaining:Math.max(0,Math.min(total,remaining))});
  }
}
function upgradeLabel(j){return j.type==='base'?BASE_ROUTES[j.id]?.name:j.type==='doctrine'?HeroSystem.TECH[j.id]?.name:j.type==='tech'?TECH_TREE[j.id]?.name:j.type==='breakthrough'?SurvivalSystem.BREAKTHROUGH_RESEARCH[j.id]?.name:({goldmine:'金矿升级',house:'人口房升级',beacon:'治疗塔升级',turret:'炮台升级',wall:'墙体升级',branch:'炮台改装'}[j.type]||'升级');}
function researchProgress(j){const first=(game.upgradeJobs||[]).find(k=>upgradeOwnerKey(k.owner)===upgradeOwnerKey(j.owner));return {progress:1-j.remaining/j.total,label:first===j?`研究 ${Math.ceil(j.remaining)}秒`:'排队中'};}
function heroOrderProgress(id){
  const a=heroArchive(),index=a.orders.findIndex(o=>o.skill===id);if(index<0)return null;
  const d=a.delivery;if(index>0||!d||d.installed)return {progress:0,label:'待配送'};
  return {progress:d.phase==='install'?.8+.2*Math.min(1,d.elapsed/1.2):d.phase==='return'?0:Math.min(.8,d.progress||0),label:d.phase==='install'?'安装中':d.phase==='return'?'保留部件返航':'配送中'};
}
function decorateUpgradeCommands(items){
  return items.map(it=>{
    if(it.empty)return it;
    let j=null;if(it.upgradeType)j=pendingUpgrade(it.upgradeType,it.upgradeId||'',it.upgradeOwner);
    const a=heroArchive();const status=it.heroProduction&&a.status==='producing'?{progress:1-a.remaining/a.productionTotal,label:a.remaining?'装配中':heroHub()?.exitBlocked?'出口受阻':'正在驶出'}:it.heroSkill?heroOrderProgress(it.heroSkill):j?researchProgress(j):null;
    return {...it,category:it.category||(it.upgradeType||it.heroSkill?'tech':it.autoType?'build':null),dim:it.dim||!!j,progress:status?.progress,progressLabel:status?.label};
  });
}
function renderUpgradeDock(){
  let dock=$('upgradeQueueDock');if(!dock){dock=document.createElement('div');dock.id='upgradeQueueDock';($('hud')||document.body).appendChild(dock);}
  if(ACTIVE_MODE.key!=='survival'){dock.hidden=true;return;}
  const rows=(game.upgradeJobs||[]).map(j=>({name:upgradeLabel(j),...researchProgress(j)}));
  const a=heroArchive();for(const o of a.orders){if(rows.some(r=>r.skill===o.skill))continue;rows.push({name:HeroSystem.SKILLS[o.skill].name,skill:o.skill,...heroOrderProgress(o.skill)});}
  if(a.status==='producing')rows.unshift({name:'英雄组装',progress:1-a.remaining/a.productionTotal,label:a.remaining?`${Math.ceil(a.remaining)}秒`:heroHub()?.exitBlocked?'出口受阻':'驶出平台'});
  if(a.delivery?.installed)rows.push({name:'配送无人机',progress:1,label:'安装完成 · 返航'});
  dock.hidden=!rows.length;const signature=JSON.stringify(rows.map(r=>[r.name,r.label,Math.round(r.progress*100)]));if(dock.dataset.signature===signature)return;dock.dataset.signature=signature;dock.innerHTML=rows.map(r=>`<div class="researchRow"><span>${r.name}</span><small>${r.label}</small><div class="globalQueueBar"><i style="width:${Math.round(r.progress*100)}%"></i></div></div>`).join('');
}
function baseDoctrineCommands(){
  const build=shopList().map((b,index)=>({k:String(index+1),hot:String(index+1),category:'build',icon:b.icon,name:b.name,price:priceOf(b),tip:b.desc,dim:game.gold<priceOf(b)||(b.pop>0&&game.popUsed+b.pop>game.popMax)||(b.id==='goldmine'&&goldMines.length>=mineUnlockedCount())||(b.id==='house'&&builtHouses.length>=5)||(b.id==='research'&&researchInstitutes.length>0)||(b.id==='heroHub'&&heroHubs.length>0)||(b.id==='factory'&&heavyFactories.length>0),act:()=>{if(!wc3BuildMode)openWc3Build();selectBuild(index);}}));
  while(build.length<8||build.length%4)build.push({empty:true});
  const commands=game.doctrine?doctrineCommands():Object.entries(BASE_ROUTES).map(([id,r],i)=>({k:['U','J','K'][i],hot:['U','J','K'][i],icon:id==='tower'?'turret':'base',name:r.name,price:1500,tip:'1500金币 · 改建30秒 · 本局三选一 · 解锁四项专属科技',upgradeType:'base',upgradeId:id,upgradeOwner:upgradeOwner('base'),dim:!!(game.upgradeJobs||[]).find(j=>j.type==='base')||game.gold<1500,act:()=>chooseDoctrine(id)}));
  return [...build,...commands];
}
function updateBaseDoctrineVisual(){
  if(!baseGroup||baseGroup.userData.doctrineVisual===game.doctrine)return;
  baseGroup.userData.doctrineVisual=game.doctrine;const old=baseGroup.getObjectByName('流派基地装甲');if(old)removeHeroVisual(old);
  if(!BASE_ROUTES[game.doctrine])return;
  const root=new THREE.Group();root.name='流派基地装甲';const k=heroModelKit(root);k.steel.color.setHex(BASE_ROUTES[game.doctrine].color);
  if(game.doctrine==='tower'){
    for(const side of [-1,1]){k.box(1.1,3.8,2.6,side*2.9,2.6,0,k.steel);for(let i=0;i<3;i++)k.box(.75,.4,.65,side*2.9,4.7,-.8+i*.8,k.edge);}
    const radar=new THREE.Mesh(new THREE.TorusGeometry(1,.13,8,24),k.brass);radar.position.set(0,7,-.4);root.add(radar);k.box(.13,2,.13,0,6,0,k.edge);
  }else if(game.doctrine==='tank'){
    for(const side of [-1,1]){k.box(.85,1.1,4.5,side*3.05,.9,0,k.steel);for(let i=0;i<7;i++){const wheel=k.cyl(.35,.9,side*3.05,.8,-1.8+i*.6,k.edge);wheel.rotation.z=Math.PI/2;}k.box(1.1,.4,3.8,side*2.7,4.3,0,k.brass);}
    for(let i=0;i<3;i++)k.box(.8,.3,2.1,-1.1+i*1.1,5.8,0,k.steel);
  }else{
    for(const side of [-1,1]){k.box(.7,4,2.2,side*2.8,2.8,0,k.steel);k.box(.2,3.3,2.3,side*3.1,2.8,0,k.brass);}
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.85,.14,8,32),k.brass);ring.rotation.x=-Math.PI/2;ring.position.y=6.3;root.add(ring);k.cyl(.68,.12,0,6.3,0,k.glow);
  }
  mergeBuildingSurfaces(root);baseGroup.add(root);
}

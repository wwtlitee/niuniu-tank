/* Unique hero lifetime is owned by the game, never by a destructible hub. */
const heroProjectiles=[];
const heroBurns=new Map();
function heroTarget(e){return isEnemyCombatTarget(e)&&performance.now()>=(e.spawnFlash||0)&&performance.now()>=(e.phaseUntil||0);}
function clearHeroEffects(){for(const s of heroProjectiles){scene.remove(s.mesh);disposeTransientObject3D(s.mesh);}heroProjectiles.length=0;heroBurns.clear();}
function launchHeroProjectile(origin,shot){
  if(heroProjectiles.length>=24)return;
  const weapon=shot.weapon||'mortar',color=weapon==='missile'?0xffd392:0xff9452,mesh=new THREE.Group();
  const bodyGeometry=weapon==='missile'?(typeof THREE.CapsuleGeometry==='function'?new THREE.CapsuleGeometry(.13,.55,4,8):new THREE.CylinderGeometry(.13,.13,.8,8)):new THREE.SphereGeometry(.23,9,7);
  const body=new THREE.Mesh(bodyGeometry,new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.4,roughness:.25,metalness:.4}));body.rotation.x=Math.PI/2;mesh.add(body);
  if(weapon==='missile'){const fin=new THREE.Mesh(new THREE.ConeGeometry(.18,.28,6),new THREE.MeshBasicMaterial({color:0xff6d32}));fin.rotation.x=Math.PI/2;fin.position.z=.38;mesh.add(fin);}
  mesh.position.copy(origin);scene.add(mesh);heroProjectiles.push({...shot,total:shot.t,origin:origin.clone(),mesh});
}
function updateHeroEffects(dt){
  for(let i=heroProjectiles.length-1;i>=0;i--){const s=heroProjectiles[i];s.t-=dt;const p=heroTarget(s.target)?enemyAimPoint(s.target):s.point,progress=Math.min(1,1-s.t/s.total);s.mesh.position.copy(s.origin).lerp(p,progress);if(!s.target)s.mesh.position.y+=Math.sin(progress*Math.PI)*5;
    if(s.t<=0){heroSplash(p,s.damage,s.radius);scene.remove(s.mesh);disposeTransientObject3D(s.mesh);heroProjectiles.splice(i,1);}}
  for(const [e,b] of heroBurns){if(!isEnemyCombatTarget(e)){heroBurns.delete(e);continue;}const elapsed=Math.min(dt,b.t);b.t-=elapsed;heroHit(e,b.damage*elapsed);if(b.t<=0)heroBurns.delete(e);}
}
function heroArchive(){return game.hero||(game.hero=HeroSystem.archive());}
function doctrineLevel(id){return HeroSystem.level(game.doctrineTech?.[id],5);}
function heroHub(){return heroHubs.find(h=>h.hp>0&&h.group.parent===scene);}
function refreshHeroUI(){updateGoldUI();updateResUI();wc3RenderSel();renderCmdCard();}
function chooseDoctrine(route){
  if(!BASE_ROUTES[route]||game.doctrine||!baseAlive)return false;
  if(!applyingUpgrade&&game.gold<1500)return false;
  if(deferUpgrade('base',route,upgradeOwner('base'),1500))return true;
  game.gold-=1500;game.doctrine=route;updateBaseDoctrineVisual();refreshHeroUI();return true;
}
function doctrineAllows(route,currentLevel){return !!game._restoring||currentLevel<3||game.doctrine===route;}
function buyHeroSkill(id){
  const a=heroArchive(),spec=HeroSystem.SKILLS[id];if(!spec||!heroHub()||a.orders.length>=20||a.orders.some(o=>o.skill===id))return false;
  const lv=HeroSystem.orderedLevel(a,id),cost=HeroSystem.skillCost(lv);
  if(!doctrineAllows('hero',lv)||!Number.isFinite(cost)||game.gold<cost)return false;
  game.gold-=cost;a.orders.push({skill:id,level:lv+1});sfx.levelup();refreshHeroUI();return true;
}
function startAutoHeroSkill(id){
  if(!HeroSystem.SKILLS[id])return false;
  game.autoHeroSkills||(game.autoHeroSkills={});game.autoHeroSkills[id]=true;renderCmdCard();return true;
}
function resumeAutoHeroSkills(force=false){
  const a=heroArchive();if(!game.autoHeroSkills||!heroHub()||!heroTank?.alive)return;
  if(!force&&game._autoHeroGoldSnapshot!=null&&game.gold<=game._autoHeroGoldSnapshot)return;
  game._autoHeroGoldSnapshot=game.gold;
  for(const id of Object.keys(game.autoHeroSkills))if(game.autoHeroSkills[id]&&!a.orders.some(o=>o.skill===id)&&a.skills[id]<30)buyHeroSkill(id);
}
function buyDoctrineTech(id){
  const spec=HeroSystem.TECH[id],lv=doctrineLevel(id);
  if(!spec||game.doctrine!==spec.route||!baseAlive||!researchInstitutes[0])return false;
  if(!doctrineAllows(spec.route,lv)||game.researchTier<1)return false;
  const owner=upgradeOwner('research',researchInstitutes[0]);
  const target=nextProjectTargetLevel('doctrine',id,owner,lv,5);
  if(target==null)return false;
  /* P2 §6.2: price by target — techCost at from-level (target-1). */
  const cost=paidUpgradeCost(HeroSystem.techCost(target-1));
  if(!Number.isFinite(cost)||game.gold<cost)return false;
  if(deferUpgrade('doctrine',id,owner,cost,target-1,target))return true;
  game.gold-=cost;(game.doctrineTech||(game.doctrineTech={}))[id]=lv+1;
  for(const unit of friendlyUnits)applyDoctrineStats(unit);
  
  sfx.levelup();refreshHeroUI();return true;
}
function applyDoctrineStats(u){
  if(u.type==='hero'){
    const next=480,ratio=u.hp/Math.max(1,u.maxHp);
    u.maxHp=next;u.hp=next*ratio;u.range=8*TILE*(1+.02*doctrineLevel('targeting'));u.speed=6;u.dmg=3;u.fireRate=1;return;
  }
  if(u.type==='repair')return;
  const spec=SurvivalSystem.FRIENDLY_UNIT_TYPES[u.type];if(!spec)return;
  const lv=researchPowerLevel(game.tech.tank||0);
  u.speed=spec.speed*(1+(TECH_TREE.tank.effect.speedPct||.025)*lv)*(1+.04*doctrineLevel('mobility'));
  u.dmg=spec.damage*(1+(TECH_TREE.tank.effect.damagePct||.07)*lv)*(1+.04*doctrineLevel('munitions'));u.fireRate=spec.fireRate*(1+.03*doctrineLevel('autoload'));
}
function heroProductionQuote(){const a=heroArchive();return {cost:a.status==='unbuilt'?1200:Math.min(Number.MAX_SAFE_INTEGER,Math.ceil(600*1.5**a.revivals)),time:a.status==='unbuilt'?25:30};}
function produceHero(){
  const a=heroArchive(),q=heroProductionQuote();
  if(!heroHub()||!['unbuilt','dead'].includes(a.status)||friendlyUnits.some(u=>u.type==='hero')||game.gold<q.cost||game.popUsed+6>game.popMax)return false;
  game.gold-=q.cost;game.popUsed+=6;if(a.status==='dead')a.revivals++;a.status='producing';a.remaining=q.time;a.productionTotal=q.time;a.deployment=null;refreshHeroUI();return true;
}
// Departure begins on the assembly bed; only this hub's own footprint is passable.
function findHeroDeployment(h,from=h.group.position){
  const origin=h.group.position,radius=1.35*SurvivalSystem.FRIENDLY_UNIT_TYPES.hero.scale;
  const own=new Set(h.footprintCells||[]),bodies=friendlyBodies();
  for(const direction of [{x:0,z:1},{x:1,z:0},{x:-1,z:0}]){
    const distance=TILE*2.6,exit={x:origin.x+direction.x*distance,z:origin.z+direction.z*distance};
    if(!navigationSegmentClear(from,exit,radius,own)||!navigationPositionClear(exit,radius))continue;
    if(bodies.some(b=>{const dx=exit.x-from.x,dz=exit.z-from.z,len=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((b.x-from.x)*dx+(b.z-from.z)*dz)/len));return Math.hypot(from.x+t*dx-b.x,from.z+t*dz-b.z)<radius+b.radius+.12;}))continue;
    return {spawn:{x:origin.x,z:origin.z},exit,own};
  }
  return null;
}
let heroDeploymentRetry=0;
function updateHeroProduction(dt){
  updateHeroEffects(dt);resumeAutoHeroSkills();updateHeroLogistics(dt);
  const a=heroArchive(),h=heroHub();
  if(a.status!=='producing'||!h){updateHeroWorkshop(null,0,dt);return;}
  a.remaining=Math.max(0,a.remaining-dt);
  updateHeroWorkshop(h,1-a.remaining/a.productionTotal,dt);
  if(a.remaining>0){heroDeploymentRetry=0;return;}
  if(a.deployment&&(a.deployment.hubX!==h.x||a.deployment.hubZ!==h.z))a.deployment=null;
  const from=a.deployment||h.group.position;
  heroDeploymentRetry=Math.max(0,heroDeploymentRetry-dt);if(heroDeploymentRetry>0)return;
  const route=findHeroDeployment(h,from);
  if(!route){h.exitBlocked=true;heroDeploymentRetry=.5;return;}
  h.exitBlocked=false;
  a.deployment||={x:from.x,z:from.z,heading:0,hubX:h.x,hubZ:h.z};
  const p=a.deployment,dx=route.exit.x-p.x,dz=route.exit.z-p.z,d=Math.hypot(dx,dz),step=Math.min(d,dt*3);
  p.x+=dx/Math.max(d,.001)*step;p.z+=dz/Math.max(d,.001)*step;p.heading=Math.atan2(dx,dz)+Math.PI;
  updateHeroWorkshop(h,1,0);
  if(d>step+.01)return;
  const u=createFriendlyUnit('hero',p);u.group.rotation.y=p.heading;heroTank=u;u.heroTank=true;a.status='alive';a.deployment=null;
  applyDoctrineStats(u);rebuildHeroModules(u);updateHeroWorkshop(null,0,0);refreshHeroUI();
}
function heroDied(u){if(u.type!=='hero')return;heroArchive().status='dead';heroArchive().remaining=0;heroTank=null;}
function heroDamage(u){return u.dmg*(1+.04*researchPowerLevel(game.tech.heroCore||0))*HeroSystem.growth(heroArchive().kills)*(1+.02*heroArchive().skills.command);}
function heroHit(enemy,damage,pierce=0){
  if(!heroTarget(enemy))return;
  damageEnemy(enemy,damage,{source:'hero',armorPierce:pierce});
}
function heroBeam(from,to,color,width=.06){
  if(lightningBeams.length>=64)return;
  const length=from.distanceTo(to);if(length<.01)return;
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(width,width,length,5),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false}));
  mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
  scene.add(mesh);lightningBeams.push({line:mesh,life:.12});
}
function heroSplash(point,damage,radius){
  for(const e of enemies){if(!isEnemyCombatTarget(e))continue;const d=e.group.position.distanceTo(point);if(d<=radius)heroHit(e,damage*Math.max(.4,1-d/radius));}
  spawnParticles(point,0xffa654,10,4,.3);
}
function updateHeroCombat(u,dt){
  const a=heroArchive(),skills=a.skills;u.heroCooldowns||={};
  if(skills.heal){
    const radius=4.5*TILE,rate=HeroSystem.healingRate(skills.heal);
    const heal=(target,position)=>{if(!target||!validRepairTarget(target)||!position||u.group.position.distanceToSquared(position)>radius*radius)return;const amount=Math.min(target.maxHp-target.hp,target.maxHp*rate*dt);if(amount>0){target.hp+=amount;showMedicalHealingLink(u,target,'tank');}};
    for(const [ci,meta] of wallMeta){const x=ci%GRID,z=Math.floor(ci/GRID);heal(wallRepairTarget({x,z}),cellCenter(x,z));}
    for(const target of new Set([...builtTurrets,...goldMines,...builtHouses,...heroHubs,...heavyFactories,...researchInstitutes,...visionBeacons]))heal(target,target.group?.position);
    if(baseAlive&&baseGroup)heal({group:baseGroup,get hp(){return game.gateHp;},set hp(value){game.gateHp=value;updateHpUI();},maxHp:game.gateMaxHp},baseGroup.position);
  }
  for(const id in u.heroCooldowns)u.heroCooldowns[id]=Math.max(0,u.heroCooldowns[id]-dt);
  let target=heroTarget(u.attackTarget)?u.attackTarget:null;
  if(target&&u.group.position.distanceToSquared(target.group.position)>u.range*u.range)target=null;
  if(!target&&(!u.moveTarget||u.command==='attackMove')){
    let best=u.range*u.range;for(const e of enemies){if(!heroTarget(e)||!isPositionVisible(e.group.position))continue;const d=u.group.position.distanceToSquared(e.group.position);if(d<best){best=d;target=e;}}
  }
  if(!target){
    u.heroChannel=null;
    moveFriendlyUnit(u,dt);return;
  }
  u.attackTarget=target;clearFriendlyRoute(u);
  const origin=u.group.position.clone().add(new THREE.Vector3(0,2,0)),point=enemyAimPoint(target),dir=point.clone().sub(origin).normalize(),damage=heroDamage(u);
  const tur=u.group.userData.turret;if(tur)tur.rotation.y=Math.atan2(dir.x,dir.z)+Math.PI-u.group.rotation.y;
  if(u.heroChannel){
    const ch=u.heroChannel,lv=skills[ch.id];ch.t-=dt;
    if(ch.id==='frost'){target.slowMult=Math.min(target.slowMult||1,1-(.2+.01*(lv-1))*(target.boss?.5:1));target.slowUntil=performance.now()+400;heroHit(target,damage*.4*(1+.08*(lv-1))*dt);}
    else{let hits=0;for(const e of enemies){if(!heroTarget(e))continue;const delta=e.group.position.clone().sub(u.group.position);if(delta.length()>3*TILE||delta.normalize().dot(dir)<.65)continue;heroHit(e,damage*1.5*(1+.08*(lv-1))*dt);heroBurns.set(e,{t:2,damage:damage*.3*(1+.08*(lv-1))});if(++hits>=12)break;}}
    ch.visual=(ch.visual||0)-dt;if(ch.visual<=0){heroBeam(origin,point,ch.id==='frost'?0x9deeff:0xff8535,.1);ch.visual=.12;}if(ch.t<=0)u.heroChannel=null;
  }else{
    u.cd-=dt;if(u.cd<=0){heroHit(target,damage*(1+.06*doctrineLevel('cannon')));heroBeam(origin,point,0xffdc9e,.035);u.cd=1/(1+.02*skills.haste);playSpecialWeapon('grenade');}
  }
  for(const id of ['rail','frost','missile','flame','arc','mortar']){
    const lv=skills[id];if(!lv||u.heroCooldowns[id]>0||!isEnemyCombatTarget(target))continue;
    if((id==='frost'||id==='flame')&&u.heroChannel)continue;
    if(id==='flame'&&u.group.position.distanceTo(target.group.position)>3*TILE)continue;
    u.heroCooldowns[id]=HeroSystem.SKILLS[id].cooldown*(1-.03*doctrineLevel('scheduler'));
    if(id==='frost'||id==='flame'){u.heroChannel={id,t:id==='frost'?3:2};continue;}
    if(id==='rail'){
      const hits=[];for(const e of enemies){if(!isEnemyCombatTarget(e))continue;const v=enemyAimPoint(e).sub(origin),d=v.dot(dir);if(d>=0&&d<=u.range&&v.addScaledVector(dir,-d).length()<Math.max(.5,e.radius||0))hits.push({e,d});}
      hits.sort((a,b)=>a.d-b.d);hits.slice(0,6).forEach((h,i)=>heroHit(h.e,damage*(6+.4*(lv-1))*.8**i,.5));heroBeam(origin,origin.clone().addScaledVector(dir,u.range),0x80fff1,.13);playSpecialWeapon('laser');
    }else if(id==='arc'){
      const used=new Set();let current=target,from=origin;for(let hop=0;hop<5&&current;hop++){const p=enemyAimPoint(current);heroBeam(from,p,0xb9b3ff);heroHit(current,damage*2*(1+.1*(lv-1))*.8**hop);used.add(current);from=p;current=enemies.find(e=>!used.has(e)&&isEnemyCombatTarget(e)&&e.group.position.distanceTo(p)<=2*TILE);}
      playSpecialWeapon('laser');
    }else if(id==='missile'){
      const candidates=enemies.filter(e=>isEnemyCombatTarget(e)&&u.group.position.distanceToSquared(e.group.position)<=u.range*u.range);
      for(let j=0;j<3;j++){const e=candidates[j%candidates.length];if(!e)break;const p=enemyAimPoint(e);launchHeroProjectile(origin,{weapon:'missile',t:.35+j*.15,target:e,point:p,damage:damage*1.2*(1+.1*(lv-1)),radius:TILE});}playSpecialWeapon('grenade');
    }else{launchHeroProjectile(origin,{weapon:'mortar',t:.8,point:point.clone(),damage:damage*4*(1+.12*(lv-1)),radius:1.5*TILE});playSpecialWeapon('grenade');}
  }
}
function heroSkillSummary(id,level){
  const l=HeroSystem.level(level);if(!l)return '尚未学习';
  if(id==='haste')return `自身射速 +${l*2}% / 友军 +${l}%`;
  if(id==='command')return `自身伤害 +${l*2}% / 友军 +${l}%`;
  if(id==='heal')return `恢复目标 ${(l*.3).toFixed(1)}% 最大生命/秒`;
  const values={rail:`${(6+.4*(l-1)).toFixed(1)}倍伤害 · 6目标穿透`,frost:`减速 ${19+l}% · 持续3秒`,missile:`3枚 × ${(1.2*(1+.1*(l-1))).toFixed(2)}倍伤害`,flame:`每秒 ${(1.5*(1+.08*(l-1))).toFixed(2)}倍伤害`,arc:`首目标 ${(2*(1+.1*(l-1))).toFixed(2)}倍伤害`,mortar:`${(4*(1+.12*(l-1))).toFixed(2)}倍伤害 · 1.5格爆炸`};
  return `${values[id]} · 冷却 ${(HeroSystem.SKILLS[id].cooldown*(1-.03*doctrineLevel('scheduler'))).toFixed(1)}秒`;
}
function heroCommands(){
  const a=heroArchive(),q=heroProductionQuote();
  return [{heroProduction:true,category:'build',k:'H',hot:'H',icon:'tank',name:a.status==='producing'?(a.remaining>0?`${['底盘定位','履带安装','装甲拼装','炮塔装配','系统校准'][Math.min(4,Math.floor((1-a.remaining/a.productionTotal)*5))]} ${Math.ceil(a.remaining)}秒`:(heroHub()?.exitBlocked?'出口受阻 · 台内等待':a.deployment?'英雄驶出组装台':'组装完成 · 等待出厂')):a.status==='alive'?'英雄已出战':a.status==='dead'?'复活英雄':'生产英雄',price:['unbuilt','dead'].includes(a.status)?q.cost:null,tip:`唯一英雄 · 6人口 · ${q.time}秒`,dim:!['unbuilt','dead'].includes(a.status)||game.gold<q.cost||game.popUsed+6>game.popMax,act:produceHero},
    ...Object.entries(HeroSystem.SKILLS).map(([id,s],i)=>{const lv=a.skills[id],ordered=HeroSystem.orderedLevel(a,id),cost=HeroSystem.skillCost(ordered),auto=!!game.autoHeroSkills?.[id];return {heroSkill:id,k:String(i+1),hot:String(i+1),icon:s.icon,name:`${s.name} Lv${lv}${ordered>lv?" · 配送+"+(ordered-lv):""}`,price:Number.isFinite(cost)?cost:null,tip:`${s.tip} · 自动触发<br>当前：${heroSkillSummary(id,lv)}<br>${ordered<30?'下单 Lv'+(ordered+1)+'：'+heroSkillSummary(id,ordered+1):'已订至满级'}<br>安装后生效 · 待配送 ${ordered-lv}级${auto?' · 自动配送中':''}<br>Lv4以上需英雄专精`,dim:a.orders.length>=20||!Number.isFinite(cost)||game.gold<cost||!doctrineAllows('hero',ordered),heroAuto:auto,act:()=>buyHeroSkill(id)};})];
}
function doctrineCommands(){
  if(!game.doctrine)return ['tower','tank','hero'].map((r,i)=>({k:String(i+1),hot:String(i+1),icon:r==='tower'?'turret':'tank',name:{tower:'炮台专精',tank:'坦克专精',hero:'英雄专精'}[r],tip:'本局只能选择一条主战路线；其他体系仅可初阶升级',act:()=>chooseDoctrine(r)}));
  const owner=upgradeOwner('research',researchInstitutes[0]);
  return Object.entries(HeroSystem.TECH).filter(([,s])=>s.route===game.doctrine).map(([id,s],i)=>{const lv=doctrineLevel(id),cost=HeroSystem.techCost(lv);return {upgradeType:'doctrine',upgradeId:id,upgradeOwner:owner,k:['U','J','K','L'][i],hot:['U','J','K','L'][i],icon:'research',name:`${s.name} Lv${lv}`,price:Number.isFinite(cost)?cost:null,tip:`${s.tip} · 上限5级`,dim:!Number.isFinite(cost)||game.gold<cost||game.researchTier<1,allowQueue:true,act:()=>buyDoctrineTech(id)};});
}

// 存档继续使用 emp 标识；战斗职责已改为贯穿激光。
function fireLaserTurret(turret,origin,target,range,damage){
  const direction=target.clone().sub(origin).normalize();
  if(!direction.lengthSq()||!Number.isFinite(range)||range<=0)return;
  playSpecialWeapon('laser');
  const end=origin.clone().addScaledVector(direction,range),now=performance.now();
  for(const enemy of enemies){
    if(!enemy.alive||now<enemy.spawnFlash||now<(enemy.phaseUntil||0))continue;
    const offset=enemyAimPoint(enemy).sub(origin),distance=offset.dot(direction);
    if(distance<0||distance>range)continue;
    const radius=.2+(enemy.radius||.3);
    if(offset.addScaledVector(direction,-distance).lengthSq()<=radius*radius)
      damageEnemy(enemy,damage,{source:'turret',armorPierce:turret.pierce||0,projectileType:'laser'});
  }
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,range,6),
    new THREE.MeshBasicMaterial({color:0x8ffff0,transparent:true,opacity:1,depthWrite:false}));
  beam.position.copy(origin).add(end).multiplyScalar(.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
  // 共用有生命周期的特效队列，既不会留下永久射线，也不新增逐帧列表。
  if(lightningBeams.length>=64){const old=lightningBeams.shift();scene.remove(old.line);disposeTransientObject3D(old.line);}
  scene.add(beam);lightningBeams.push({line:beam,life:.18});
}

function friendlyWeaponDescription(unit){
  if(unit.type==='hero')return `英雄 · 击杀 ${heroArchive().kills} · 攻击成长 ×${HeroSystem.growth(heroArchive().kills).toFixed(2)} · 武器自动触发`;
  if(unit.type==='repair')return `自动远程维修 · 范围 ${(unit.range/TILE).toFixed(1)} 格 · 最高${unit.repairPerSecond}生命/秒 · 10生命/金币 · 同目标不叠加 · ≤目标10%/秒${unit.repairBranch?' · '+(REPAIR_BRANCHES[unit.repairBranch]?.tip||''):' · 可升级支援光环'}`;
  return {light:'散弹 · 每轮5颗 · 近距离集中伤害',medium:'燃烧弹 · 命中后灼烧4秒',heavy:'榴弹 · 抛物线弹道与范围爆炸',repair:'战地维修 · 可升级装填支援或火力支援'}[unit.type]||'坦克炮';
}
function fireFriendlyWeapon(unit,enemy){
  const target=enemyAimPoint(enemy),turret=unit.group.userData.turret;
  unit.group.updateMatrixWorld(true);
  const marker=turret&&turret.userData.muzzleMarker;
  const origin=marker?marker.getWorldPosition(new THREE.Vector3()):unit.group.position.clone().add(new THREE.Vector3(0,1.7,0));
  const direction=target.clone().sub(origin).normalize();
  const owner={group:unit.group,type:unit.type,dmg:unit.dmg*(unit._damageAura||1)};
  const options={origin,thruWall:true,source:'friendly'};
  if(unit.type==='light'){
    owner.dmg*=.4;
    for(let i=-2;i<=2;i++)shoot(owner,direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),i*.105),true,{...options,projectileType:'shotgun'});
  }else if(unit.type==='medium'){
    shoot(owner,direction,true,{...options,projectileType:'incendiary',burnDamage:owner.dmg*.45,burnDuration:4});
  }else if(unit.type==='heavy'){
    const duration=Math.max(.18,origin.distanceTo(target)/TURRET_PROJECTILE_SPEED),gravity=18;
    const velocity=target.clone().sub(origin).divideScalar(duration);velocity.y+=gravity*duration*.5;
    shoot(owner,direction,true,{...options,projectileType:'grenade',velocity,gravity,blast:3.8});
  }else shoot(owner,direction,true,{...options,projectileType:'tank'});
}

function applyIncendiaryHit(enemy,bullet){
  if(!enemy.alive||!(bullet.burnDamage>0))return;
  // 同类灼烧取较高伤害并刷新持续时间，不无限叠加伤害或粒子。
  enemy.burnDamage=Math.max(enemy.burnDamage||0,bullet.burnDamage);
  enemy.burnRemaining=Math.max(enemy.burnRemaining||0,bullet.burnDuration||4);
}
function updateIncendiaryDamage(dt){
  if(!Number.isFinite(dt)||dt<=0)return;
  for(const enemy of enemies){
    if(!enemy.alive||!(enemy.burnRemaining>0))continue;
    const elapsed=Math.min(dt,enemy.burnRemaining);enemy.burnRemaining-=elapsed;
    damageEnemy(enemy,enemy.burnDamage*elapsed,{source:'friendly',projectileType:'incendiary'});
    enemy.burnVisualTimer=(enemy.burnVisualTimer||0)-dt;
    if(enemy.burnVisualTimer<=0){spawnParticles(enemyAimPoint(enemy),0xff742a,2,1,.25);enemy.burnVisualTimer=.25;}
    if(enemy.burnRemaining<=0)enemy.burnDamage=0;
  }
}

const REPAIR_BRANCHES=Object.freeze({
  speed:{name:'装填支援维修坦克',cost:120,color:0x56dfd6,tip:'保留维修，18米内友军坦克和炮台攻速 +20%；同类不叠加'},
  attack:{name:'火力支援维修坦克',cost:150,color:0xffbd55,tip:'保留维修，18米内友军坦克和炮台伤害 +25%；同类不叠加'},
});
function upgradeRepairUnit(unit,branch,restoring=false){
  const spec=REPAIR_BRANCHES[branch];
  if(!spec||!unit||!unit.alive||unit.type!=='repair'||unit.repairBranch||(!restoring&&game.gold<spec.cost))return false;
  if(!restoring)game.gold-=spec.cost;
  unit.repairBranch=branch;unit.name=spec.name;
  const antenna=new THREE.Group();antenna.name=spec.name;
  const metal=new THREE.MeshStandardMaterial({color:0x788487,metalness:.65,roughness:.4});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.09,2.1,8),metal);pole.position.set(-.6,2.4,.5);antenna.add(pole);
  for(let i=0;i<3;i++){
    const fin=new THREE.Mesh(new THREE.BoxGeometry(.8-i*.16,.07,.07),metal);fin.position.set(-.6,3.1+i*.17,.5);antenna.add(fin);
  }
  const signal=new THREE.Mesh(new THREE.SphereGeometry(.14,10,6),new THREE.MeshBasicMaterial({color:spec.color}));signal.position.set(-.6,3.65,.5);antenna.add(signal);
  unit.group.add(antenna);
  if(!restoring){updateGoldUI();wc3RenderSel();renderCmdCard();}
  return true;
}
function repairUpgradeCommands(){
  if(wc3Selection.length!==1||wc3Sel.kind!=='unit')return [];
  const unit=wc3Sel.ref;if(unit.type!=='repair'||unit.repairBranch)return [];
  return Object.entries(REPAIR_BRANCHES).map(([branch,spec],i)=>({k:i?'O':'I',hot:i?'O':'I',icon:'📡',name:spec.name,tip:spec.tip,price:spec.cost,dim:game.gold<spec.cost,act:()=>upgradeRepairUnit(unit,branch)}));
}
function updateSupportAuras(){
  const targets=[...builtTurrets,...friendlyUnits];
  for(const target of targets){target._speedAura=1;target._damageAura=1;}
  for(const unit of friendlyUnits){
    if(unit.type==='hero'&&unit.alive&&unit.hp>0){const s=heroArchive().skills;for(const t of targets){if(t.group.position.distanceToSquared(unit.group.position)<=(4.5*TILE)**2){t._speedAura=1+s.haste*(t===unit?.02:.01);t._damageAura=1+s.command*(t===unit?.02:.01);}}continue;}
    if(!unit.alive||unit.hp<=0||!unit.repairBranch)continue;
    for(const target of targets){
      if(target===unit||target.type==='repair'||target.group.position.distanceToSquared(unit.group.position)>324)continue;
      if(unit.repairBranch==='speed')target._speedAura=1.2;
      else if(unit.repairBranch==='attack')target._damageAura=1.25;
    }
  }
}

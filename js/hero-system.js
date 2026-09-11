(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.HeroSystem=api;})(globalThis,()=>{
  const SKILLS=Object.freeze({
    haste:{name:'攻速光环',icon:'speed',tip:'每级自身攻速+2%，友军获得一半'},
    command:{name:'攻击光环',icon:'attack',tip:'每级自身伤害+2%，友军获得一半'},
    heal:{name:'治疗射线',icon:'health',tip:'每级恢复目标0.3%生命/秒；战斗时停疗；10生命/金币'},
    rail:{name:'超电磁炮',icon:'laser',cooldown:8,tip:'自动贯穿最多6敌人，50%穿甲'},
    frost:{name:'冰冻射线',icon:'shield',cooldown:8,tip:'引导3秒减速，首领效果减半'},
    missile:{name:'导弹阵列',icon:'attack',cooldown:10,tip:'自动追踪三发小范围导弹'},
    flame:{name:'等离子喷焰',icon:'flame',cooldown:8,tip:'近距扇形持续伤害与灼烧'},
    arc:{name:'电弧链炮',icon:'laser',cooldown:6,tip:'最多连锁5个不同敌人'},
    mortar:{name:'攻城榴弹',icon:'blast',cooldown:12,tip:'延迟轰击固定落点，大范围爆发'}
  });
  const TECH=Object.freeze({
    range:{route:'tower',name:'火控测距',tip:'每级攻击炮台射程+3%'},
    sustained:{route:'tower',name:'连续射击',tip:'同目标每2秒一层，每层每级+1%伤害，最多5层'},
    feed:{route:'tower',name:'供弹系统',tip:'每级攻击炮台射速+2%，最多10%'},
    autoload:{route:'tank',name:'自动装填',tip:'每级常规坦克射速+3%，最多15%'},
    supply:{route:'tank',name:'战损补给',tip:'每级常规坦克生产费-3%、时间-4%'},
    munitions:{route:'tank',name:'专用弹药',tip:'每级常规坦克伤害+4%，最多20%'},
    cannon:{route:'hero',name:'主炮强化',tip:'每级英雄普通攻击伤害+6%，最多30%，不放大技能'},
    scheduler:{route:'hero',name:'武器调度',tip:'每级英雄攻击技能冷却-3%'},
    targeting:{route:'hero',name:'远程火控',tip:'每级英雄攻击射程+2%，最多10%，不扩大治疗和光环范围'},
    penetration:{route:'tower',name:'穿甲弹头',tip:'每级炮台无视目标3%护甲，上限15%'},
    mobility:{route:'tank',name:'机动传动',tip:'每级常规坦克移动速度+4%，上限20%'},
    delivery:{route:'hero',name:'快速配送',tip:'每级部件无人机飞行速度+12%，上限60%'},
  });
  const level=(v,max=30)=>Math.min(max,Math.max(0,Math.floor(Number(v)||0)));
  const exactPrice=(base,numerator,exponent)=>{const power=BigInt(exponent),denominator=10n**power;return Number((BigInt(base)*BigInt(numerator)**power+denominator-1n)/denominator);};
  const skillPrices=Object.freeze(Array.from({length:30},(_,l)=>exactPrice(1000,13,l)));
  const techPrices=Object.freeze(Array.from({length:5},(_,l)=>exactPrice(1500,18,l)));
  const skillCost=l=>level(l)>=30?Infinity:skillPrices[level(l)];
  const techCost=l=>level(l,5)>=5?Infinity:techPrices[level(l,5)];
  function orderedLevel(a,id){return a.orders.reduce((v,o)=>o.skill===id?Math.max(v,o.level):v,a.skills[id]||0);}
  function archive(input={}){
    input=input&&typeof input==='object'?input:{};
    const skills=Object.fromEntries(Object.keys(SKILLS).map(k=>[k,level(input.skills?.[k])])),orders=[],levels={...skills};
    for(const order of Array.isArray(input.orders)?input.orders.slice(0,270):[]){if(!order||!SKILLS[order.skill])continue;const next=level(order.level);if(next!==levels[order.skill]+1)continue;orders.push({skill:order.skill,level:next});levels[order.skill]=next;}
    const finite=v=>Number.isFinite(v)?Math.max(-10000,Math.min(10000,v)):0;
    const d=input.delivery,delivery=d&&['outbound','install','return'].includes(d.phase)?{phase:d.phase,installed:!!d.installed,progress:Math.max(0,Math.min(.8,Number(d.progress)||0)),flightDistance:Math.max(1,Math.min(10000,Number(d.flightDistance)||12)),elapsed:Math.max(0,Math.min(2,Number(d.elapsed)||0)),x:finite(d.x),y:finite(d.y),z:finite(d.z)}:null;
    const p=input.deployment,deployment=p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?{x:finite(p.x),z:finite(p.z),heading:finite(p.heading),hubX:finite(p.hubX),hubZ:finite(p.hubZ)}:null;
    return {version:2,status:['unbuilt','producing','alive','dead'].includes(input.status)?input.status:'unbuilt',kills:Math.min(1e9,level(input.kills,1e9)),revivals:level(input.revivals,100),remaining:Math.max(0,Math.min(30,Number(input.remaining)||0)),productionTotal:input.productionTotal===30?30:25,skills,orders,delivery,deployment};
  }
  function retireMedical(data={},legacy=true){
    let refund=0;const paid=item=>Number.isFinite(item.paidCost)&&item.paidCost>=0?Math.min(Number.MAX_SAFE_INTEGER,item.paidCost):(legacy?115:2400);
    const units=(data.units||[]).filter(u=>{if(u.type!=='repair')return true;refund+=paid(u)+(u.repairBranch==='speed'?120:u.repairBranch==='attack'?150:0);return false;});
    const factories=(data.factories||[]).map(f=>({...f,autoType:f.autoType==='repair'?null:f.autoType,queue:(f.queue||[]).filter(q=>{if(q.typeId!=='repair')return true;refund+=paid(q);return false;})}));
    return {data:{...data,units,factories},refund:Math.min(Number.MAX_SAFE_INTEGER,refund)};
  }
  return Object.freeze({SKILLS,TECH,level,skillCost,techCost,archive,orderedLevel,retireMedical,growth:k=>1+.002*level(k,1e9),healingRate:l=>level(l)*.003});
});

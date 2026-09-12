const {test}=require('node:test');const assert=require('node:assert/strict');const H=require('../js/hero-system.js');
test('nine passive skills share 1.3 price and healing does not grow with kills',()=>{assert.equal(Object.keys(H.SKILLS).length,9);assert.equal(H.skillCost(0),1000);assert.equal(H.skillCost(9),10605);assert.equal(H.growth(500),2);assert.equal(H.healingRate(30),.09);assert.equal(H.skillCost(30),Infinity);});
test('bounded waves and sanitized persistent hero identity',()=>{const a=H.archive({kills:-2,skills:{heal:999},status:'nonsense'});assert.equal(a.kills,0);assert.equal(a.skills.heal,30);assert.equal(a.status,'unbuilt');assert.equal(Object.keys(H.TECH).length,12);});

test('endless wave count is bounded even far into the run',()=>{const S=require('../js/survival-system.js');assert.equal(S.waveProfile(100).count,4000);assert.ok(Number.isFinite(S.waveProfile(10000).hpMultiplier));});

test('medical refund survives missing factory and never uses inflated new price',()=>{const source={units:[{type:'repair',repairBranch:'speed'},{type:'heavy'}],factories:[{autoType:'repair',queue:[{typeId:'repair'},{typeId:'repair',paidCost:2400},{typeId:'heavy'}]}]};const r=H.retireMedical(source,true);assert.equal(r.refund,2750);assert.equal(r.data.units.length,1);assert.equal(r.data.factories[0].queue.length,1);assert.equal(r.data.factories[0].autoType,null);assert.equal(source.units.length,2);assert.equal(H.retireMedical(r.data,true).refund,0);});

test('decimal skill price does not gain a floating-point extra coin',()=>{assert.equal(H.skillCost(2),1690);});

test('old nullable hero archive safely starts unbuilt',()=>{assert.equal(H.archive(null).status,'unbuilt');});

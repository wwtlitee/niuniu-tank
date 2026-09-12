const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../js/survival-system.js');
test('史诗尸潮从600逐波增长到4000，每只都有独立上场名额',()=>{
  const waves=Array.from({length:10},(_,i)=>S.waveProfile(i+1));
  assert.deepEqual(waves.map(w=>w.count),[600,1000,1400,2000,2400,2800,3200,3600,4000,4000]);
  assert.ok(waves.every(w=>w.activeCap===4000));
  assert.equal(S.waveProfile(11).count,4000);
});
test('新增普通僵尸分摊原波次血量和奖励预算',()=>{
  const previous=[120,180,260,420,520,620,720,840,960,1000];
  for(let wave=1;wave<=10;wave++){
    const spec=S.waveProfile(wave);
    assert.ok(Math.abs(spec.count*spec.densityBudgetScale-previous[wave-1])<1e-7);
    assert.ok(spec.densityBudgetScale>0&&spec.densityBudgetScale<=1);
  }
});

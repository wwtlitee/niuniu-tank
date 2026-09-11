const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createStaticServer } = require('../tools/asset-runtime-catalog.cjs');
const R = require('../js/classic/classic-rules.js');
const C = require('../js/classic/classic-config.js');

test('基地钢壁两级耐久为4和6，地图钢墙仍为不可破障碍', () => {
  assert.equal(typeof R.baseShellMaxHp,'function');
  assert.equal(R.baseShellMaxHp(false,0),1);
  assert.equal(R.baseShellMaxHp(true,0),4);
  assert.equal(R.baseShellMaxHp(true,1),4);
  assert.equal(R.baseShellMaxHp(true,2),6);
  assert.equal(R.baseShellMaxHp(true,999),6);
  const grid=Array.from({length:C.GRID},()=>Array(C.GRID).fill(C.T.EMPTY));
  grid[1].fill(C.T.STEEL);
  assert.equal(R.routeTo(grid,{col:6,row:0},{col:6,row:2}).length,0);
  const route=R.routeTo(grid,{col:6,row:0},{col:6,row:2},new Set([C.GRID+6]));
  assert.ok(route.some(p=>p.col===6&&p.row===1),'能规划射穿基地钢壁的进攻路线');
});

test('实际炮弹击穿强化墙，铲子到期不补缺口，敌车死亡播放爆炸录音', async () => {
  const output=path.resolve(__dirname,'../output/classic-defence');fs.mkdirSync(output,{recursive:true});
  const server=await createStaticServer(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
  const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/classic.html?autotest=1`);
    await page.waitForFunction(()=>window.classicReady);
    const result=await page.evaluate(async()=>{
      const g=ClassicGame;
      if(!g.testShellShot)return {missing:true};
      g.reset(0);g.testUpgrade('baseWall');
      const initial=g.testShellState(),hits=[];
      for(let i=0;i<4;i++){g.testShellShot(6,11,1);hits.push(g.testShellState());}
      g.testShellShot(6,11,1);const breached=g.testShellState();
      g.testUpgrade('baseWall');const upgraded=g.testShellState();
      g.testShellShot(6,11,2);const heavyHit=g.testShellState();
      g.testShellShot(6,11,10,true);const exempt=g.testShellState();
      g.testPickup('shovel');g.testShellShot(6,11,1);g.game.time+=12000;g.testPickupsUpdate();const permanent=g.testShellState();
      g.reset(0);g.testPickup('shovel');
      for(let i=0;i<4;i++)g.testShellShot(6,11,1);
      g.testShellShot(5,11,1);
      g.game.time+=12000;g.testPickupsUpdate();const expired=g.testShellState();
      g.reset(0);g.game.spawnTimer=0;g.step(.05);await g.audio.unlock();g.audio.setMusic(false);
      g.testClearWave();
      return {initial,hits,breached,upgraded,heavyHit,exempt,permanent,expired,reset:g.testShellState(),audio:g.audio.inspect()};
    });
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
    assert.equal(result.missing,undefined,'缺少实际炮弹施工墙验证接口');
    const cell=s=>s.cells.find(c=>c.col===6&&c.row===11);
    assert.equal(cell(result.initial).hp,4);
    assert.deepEqual(result.hits.map(s=>cell(s).hp),[3,2,1,0]);
    assert.equal(cell(result.hits[3]).tile,C.T.EMPTY);
    assert.ok(result.breached.eagleHp<result.initial.eagleHp,'缺口后续炮弹可伤害基地');
    assert.equal(cell(result.upgraded).hp,6);
    assert.equal(cell(result.heavyHit).hp,4);
    assert.equal(cell(result.exempt).hp,4,'基地自动炮豁免不能误伤钢壁');
    assert.equal(result.permanent.shovelUntil,0,'有钢壁强化也必须清除过期铲子计时');
    assert.equal(cell(result.permanent).tile,C.T.STEEL);
    assert.equal(cell(result.permanent).hp,5,'铲子到期不恢复受损的永久钢壁');
    assert.equal(cell(result.expired).tile,C.T.EMPTY,'铲子过期不重建已被击毁的墙');
    assert.equal(result.expired.cells.find(c=>c.col===5&&c.row===11).tile,C.T.BRICK);
    assert.equal(result.reset.steelShell,false);
    assert.equal(result.audio.explosionReady,true);
    assert.equal(result.audio.lastExplosionSource,'recorded');
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>{ClassicGame.reset(0);ClassicGame.testUpgrade('baseWall');ClassicGame.testShellShot(6,11,1);ClassicGame.renderNow();});
    await page.waitForFunction(()=>document.getElementById('classicWall').textContent.includes('19 / 20'));
    await page.screenshot({path:path.join(output,'classic.png')});
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

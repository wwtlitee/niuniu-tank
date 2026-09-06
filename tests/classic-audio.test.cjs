'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const file=require('node:path').join(__dirname,'../js/classic/classic-audio.js');
test('经典音频模块存在且所有自制声音是有限幅度非静音 PCM',()=>{
 assert.ok(fs.existsSync(file),'缺少独立经典音频模块');
 const audio=require(file);
 for(const cue of ['start','clear','over','shoot','brick','steel','hit','explode','pickup','motor','music']){
  const pcm=audio.renderCue(cue,22050);assert.ok(pcm.length>100,cue);
  let peak=0;for(const n of pcm){assert.ok(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));}
  assert.ok(peak>.01&&peak<=1,`${cue}: ${peak}`);
  assert.equal(Math.abs(pcm[0]),0);assert.ok(Math.abs(pcm[pcm.length-1])<.01,'尾端应平滑收敛');
 }
});
test('经典页面独立加载音频并有静音与配乐控制',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../classic.html'),'utf8');
 assert.match(html,/classic-audio\.js/);assert.match(html,/id="classicSound"/);assert.match(html,/id="classicMusic"/);
});
test('强化耗尽仍提供续战选项',()=>{
 const u=require('../js/classic/classic-upgrades.js');const owned=Object.fromEntries(u.CARDS.map(c=>[c.id,c.max]));
 assert.ok(u.pickThree(owned).length>0,'不能进入空白选卡界面');
});
test('高速弹每段检测距离不超过半格，避免一帧穿钢墙',()=>{
 const r=require('../js/classic/classic-rules.js');assert.equal(typeof r.shotSteps,'function');
 for(const speed of [22,34,34*1.3**4])for(const dt of [1/60,.05]){
  const n=r.shotSteps(speed,dt);assert.ok(n>=1);assert.ok(speed*dt/n<=.5);
 }
});

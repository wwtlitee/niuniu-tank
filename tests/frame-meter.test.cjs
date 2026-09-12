const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/survival-hud.js'),'utf8'),context);
test('帧数来自实际帧间隔，不使用被截断的游戏时间',()=>{
 const meter=context.createSurvivalFrameMeter();let sample;
 for(let i=0;i<=10;i++)sample=meter.sample(i*100)||sample;
 assert.equal(sample.fps,10);assert.equal(sample.frameMs,100);
 meter.reset();for(let i=0;i<=60;i++)sample=meter.sample(i*1000/60)||sample;
 assert.ok(Math.abs(sample.fps-60)<1);
});

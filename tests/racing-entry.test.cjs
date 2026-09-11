const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('竞速页面独立加载，不导入生存引擎',()=>{const file=path.join(root,'racing.html');assert.ok(fs.existsSync(file),'缺少竞速页面');const html=fs.readFileSync(file,'utf8');assert.match(html,/racing-rules.js/);assert.match(html,/racing-game.js/);assert.doesNotMatch(html,/src="js\/engine.js/);});
test('第三模式导航到竞速页',()=>{const home=fs.readFileSync(path.join(root,'js/home.js'),'utf8');assert.match(home,/location.href = "racing.html"/);assert.doesNotMatch(home,/state: "soon"/);});
test('竞速文件纳入发布同步',()=>{const script=fs.readFileSync(path.join(root,'tools/sync-play.cjs'),'utf8');for(const f of ['racing.html','js/racing/racing-rules.js','js/racing/racing-game.js','js/racing/racing.css'])assert.ok(script.includes('"'+f+'"'),f);});

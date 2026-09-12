'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('cosmetic release accepts existing 8.10 survival saves without accepting unrelated schemas',()=>{
 const source=fs.readFileSync(require.resolve('../js/engine.js'),'utf8');
 const factory=source.match(/function isCompatibleSurvivalSaveVersion\(version\)\{[^}]+\}/);
 assert.ok(factory,'release compatibility predicate exists');
 const accepts=new Function('GAME_VERSION',factory[0]+';return isCompatibleSurvivalSaveVersion;')(require('../package.json').version);
 for(const version of ['8.10.0','9.0.0','9.1.0','9.2.0','10.0.0'])assert.equal(accepts(version),true);
 for(const version of [null,undefined,'8.9.0','999.0.0',{},9])assert.equal(accepts(version),false);
});

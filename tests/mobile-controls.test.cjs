const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('all three entries load mobile viewport and shared touch controls',()=>{
 for(const file of ['index.html','classic.html','racing.html']){
  const html=fs.readFileSync(file,'utf8');
  assert.match(html,/name="viewport"/);assert.match(html,/js\/mobile-controls.js/);assert.match(html,/css\/mobile.css/);
 }
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const isMobile=require('../js/mobile-controls.js');
const touch={coarse:true,fine:false,hover:false,maxTouchPoints:5};
test('desktop and touch-capable Windows never enable mobile controls',()=>{
 for(const capabilities of [{coarse:false,fine:true,hover:true,maxTouchPoints:0},touch,{...touch,fine:true}])
  assert.equal(isMobile({...capabilities,userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32'}),false);
 assert.equal(isMobile({...touch,userAgent:'Mozilla/5.0 (X11; Linux x86_64)',platform:'Linux x86_64'}),false);
 assert.equal(isMobile({...touch,maxTouchPoints:0,userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel'}),false);
});
test('phones and iPad use touch controls, mouse-equipped devices keep desktop input',()=>{
 for(const device of [{userAgent:'Mozilla/5.0 (iPhone)',platform:'iPhone'},{userAgent:'Mozilla/5.0 (Linux; Android 14)',platform:'Linux armv8l'},{userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel'}]){
  assert.equal(isMobile({...touch,...device}),true);
  assert.equal(isMobile({...touch,...device,fine:true,hover:true}),false);
 }
});

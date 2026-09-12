const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('八批次武器死亡特效使用正式生存灯光及ACES渲染，无着色器错误或逐死亡drawcall', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type() === 'error') errors.push(message.text()); });
  try {
    await page.setContent('<html><body style="margin:0;background:#171d20"><div style="position:absolute;top:32px;width:100%;display:flex;justify-content:space-around;color:#ddd;font:22px sans-serif"><span>冰冻碎裂</span><span>燃烧焦尸</span><span>爆炸断肢</span><span>能量灼蚀</span></div></body></html>');
    await page.addScriptTag({ path: path.resolve(__dirname, '../lib/three.min.js') });
    await page.addScriptTag({ path: path.resolve(__dirname, '../js/survival-system.js') });
    await page.addScriptTag({ path: path.resolve(__dirname, '../js/zombie-death-effects.js') });
    const result = await page.evaluate(() => {
      const scene = new THREE.Scene();scene.background = new THREE.Color(0x171d20);
      const night = SurvivalSystem.NIGHT_VISUALS;
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1400,800);renderer.setPixelRatio(1);document.body.appendChild(renderer.domElement);
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=night.exposure;renderer.outputEncoding=THREE.LinearEncoding;
      const camera = new THREE.PerspectiveCamera(40,1400/800,.1,100);camera.position.set(0,12,19);camera.lookAt(0,1,0);
      const light = new THREE.DirectionalLight(night.moonColor,night.moonIntensity);light.position.set(-42,58,-30);
      scene.add(light,new THREE.AmbientLight(night.ambientColor,night.ambientIntensity),new THREE.HemisphereLight(night.hemisphereSky,night.hemisphereGround,night.hemisphereIntensity));
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(30,20),new THREE.MeshStandardMaterial({color:0x455454,roughness:1}));ground.rotation.x=-Math.PI/2;scene.add(ground);
      let seed=314;const effects=ZombieDeathEffects.create({THREE,scene,heightAt:()=>0,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)});
      effects.update(0,camera,800);
      for(let column=0;column<4;column++)for(let i=0;i<6;i++){
        const enemy={group:new THREE.Group(),_lodHeight:1.9};enemy.group.position.set(-7.5+column*5+(i%2)*.4,0,(Math.floor(i/2)-1)*.85);
        effects.spawn(enemy,{projectileType:['frost','incendiary','grenade','rail'][column],hitDirection:new THREE.Vector3(.25,0,.6)});
      }
      for(let frame=0;frame<15;frame++)effects.update(1/60,camera,800);
      renderer.render(scene,camera);
      window.__deathScene={effects,renderer,scene,camera};
      return { effects:effects.inspect(),renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,lighting:night };
    });
    const output=path.resolve(__dirname,'../output/zombie-death-effects-scene-light');fs.mkdirSync(output,{recursive:true});
    await page.screenshot({path:path.join(output,'weapon-deaths.png')});
    fs.writeFileSync(path.join(output,'weapon-deaths.json'),JSON.stringify(result,null,2));
    assert.equal(result.effects.drawCalls,8);assert.equal(result.renderCalls,9);
    assert.ok(result.effects.spawnedByCause.freeze===6&&result.effects.spawnedByCause.burn===6);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});

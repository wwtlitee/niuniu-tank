"use strict";

const path = require("node:path");
const { chromium } = require("playwright");
const { createStaticServer } = require("./asset-runtime-catalog.cjs");

const CANDIDATES = [
  ..."abcdefghijklmnopqrst".split("").map((letter) => ({ file: `building-${letter}.glb`, label: `建筑 ${letter.toUpperCase()}` })),
  { file: "chimney-basic.glb", label: "烟囱组件" },
];

const CURRENT = [
  { file: "building-a.glb", label: "主基地 · A" },
  { file: "building-p.glb", label: "研究院 · P" },
  { file: "building-k.glb", label: "重工厂 · K" },
  { file: "building-n.glb", label: "金矿 · N" },
  { file: "building-h.glb", label: "人口房 · H" },
];

async function renderSheet(page, { files, cols, rows, title, output, assetOrigin }) {
  const width = 1920, height = 1080, header = 86;
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;background:#12171d;color:#f1e5ca;font-family:"Microsoft YaHei",sans-serif;overflow:hidden}
    h1{height:${header}px;margin:0;padding:22px 30px;font-size:30px;letter-spacing:4px;color:#e4b75e;background:linear-gradient(180deg,#171d24,#10151b);border-bottom:2px solid #8d6b2f}
    canvas{position:absolute;left:0;top:${header}px}.labels{position:absolute;left:0;right:0;top:${header}px;bottom:0;display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);pointer-events:none}
    .cell{position:relative;border:1px solid rgba(180,148,87,.35);background:radial-gradient(circle at 50% 42%,rgba(110,130,145,.08),transparent 60%)}
    .name{position:absolute;left:10px;right:10px;bottom:8px;padding:6px 9px;background:rgba(7,10,13,.84);border-left:3px solid #d4a54e;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style></head><body><h1>${title}</h1><div class="labels"></div></body></html>`);
  await page.addScriptTag({ url: `${assetOrigin.project}/lib/three.min.js` });
  await page.addScriptTag({ url: `${assetOrigin.project}/lib/GLTFLoader.js` });
  await page.waitForFunction(() => typeof THREE !== "undefined" && typeof THREE.GLTFLoader === "function");
  await page.evaluate(async ({ files, cols, rows, width, height, header, sourceOrigin }) => {
    const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true, powerPreference:"low-power" });
    renderer.setPixelRatio(1);renderer.setSize(width,height-header);renderer.setScissorTest(true);renderer.shadowMap.enabled=true;
    document.body.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x1b232a);
    scene.add(new THREE.HemisphereLight(0xd9e8f2,0x172027,1.5));
    const key=new THREE.DirectionalLight(0xffe1ae,2.1);key.position.set(4,7,5);key.castShadow=true;scene.add(key);
    const rim=new THREE.DirectionalLight(0x789cbd,.9);rim.position.set(-5,4,-4);scene.add(rim);
    const ground=new THREE.Mesh(new THREE.CircleGeometry(2.05,40),new THREE.MeshStandardMaterial({color:0x283138,roughness:.92,metalness:.06}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-.03;ground.receiveShadow=true;scene.add(ground);
    const camera=new THREE.PerspectiveCamera(34,(width/cols)/((height-header)/rows),.01,100);camera.position.set(3.5,2.75,4.1);camera.lookAt(0,.55,0);
    const loader=new THREE.GLTFLoader();
    const load=(file)=>new Promise((resolve,reject)=>loader.load(`${sourceOrigin}/${file}`,resolve,undefined,reject));
    const loaded=[];for(const item of files)loaded.push({item,gltf:await load(item.file)});
    const labels=document.querySelector(".labels");
    for(let i=0;i<cols*rows;i++){const cell=document.createElement("div");cell.className="cell";if(files[i])cell.innerHTML=`<div class="name">${String(i+1).padStart(2,"0")} · ${files[i].label}</div>`;labels.appendChild(cell);}
    renderer.setClearColor(0x1b232a,1);
    for(let i=0;i<loaded.length;i++){
      const object=loaded[i].gltf.scene;
      object.traverse((child)=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
      const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3());
      object.scale.setScalar(2.5/Math.max(size.x,size.y,size.z,.001));
      const scaled=new THREE.Box3().setFromObject(object),center=scaled.getCenter(new THREE.Vector3());
      object.position.set(-center.x,-scaled.min.y,-center.z);object.rotation.y=-.45;scene.add(object);
      const cellW=width/cols,cellH=(height-header)/rows,col=i%cols,row=Math.floor(i/cols),x=col*cellW,y=(rows-row-1)*cellH;
      renderer.setViewport(x,y,cellW,cellH);renderer.setScissor(x,y,cellW,cellH);renderer.clear(true,true,true);renderer.render(scene,camera);scene.remove(object);
    }
    renderer.setScissorTest(false);
    const frozen=document.createElement("img");frozen.src=renderer.domElement.toDataURL("image/png");frozen.style.cssText=`position:absolute;left:0;top:${header}px;width:${width}px;height:${height-header}px`;document.body.insertBefore(frozen,labels);await frozen.decode();renderer.dispose();renderer.domElement.remove();
  }, { files, cols, rows, width, height, header, sourceOrigin:assetOrigin.source });
  await page.screenshot({ path:output });
}

async function main(){
  const projectRoot=path.resolve(__dirname,"..");
  const sourceRoot=path.resolve(projectRoot,"..","..","kenny","raw","city-kit-industrial","Models","GLB format");
  const projectServer=await createStaticServer(projectRoot),sourceServer=await createStaticServer(sourceRoot);
  const browser=await chromium.launch({headless:true,args:["--no-sandbox","--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
  const assetOrigin={project:`http://127.0.0.1:${projectServer.address().port}`,source:`http://127.0.0.1:${sourceServer.address().port}`};
  try{
    const page=await browser.newPage();
    /* SwiftShader 首帧偶尔只建立上下文却不提交像素，候选页兼作一次受控预热。 */
    await renderSheet(page,{files:CANDIDATES.slice(0,1),cols:1,rows:1,title:"工业素材预热",output:path.join(projectRoot,"output","industrial-sheet-warmup.png"),assetOrigin});
    await renderSheet(page,{files:CURRENT,cols:3,rows:2,title:"当前生存模式 · 五类建筑对照",output:path.join(projectRoot,"pdoc","material","MAT_当前建筑对照_v6.6.0.png"),assetOrigin});
    await renderSheet(page,{files:CANDIDATES,cols:7,rows:3,title:"Kenney 工业建筑 · 21 个本地候选素材",output:path.join(projectRoot,"pdoc","material","MAT_工业建筑候选21_v6.6.0.png"),assetOrigin});
    await page.close();
  }finally{
    await browser.close();
    await new Promise((resolve)=>projectServer.close(resolve));
    await new Promise((resolve)=>sourceServer.close(resolve));
  }
}

if(require.main===module)main().catch((error)=>{console.error(error);process.exitCode=1;});

module.exports={CANDIDATES,CURRENT};

/* 装甲竞速 v8.2.0 — 独立渲染与交互，不加载生存系统。 */
(async()=>{
 'use strict';
 const $=id=>document.getElementById(id),R=window.RacingRules,T=window.THREE,M=window.RacingModels;
 const fail=message=>{$('errorText').textContent=message;$('error').hidden=false;};
 if(!R||!T){fail('游戏文件未能加载，请重新加载页面。');return;}
 let renderer;
 try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:!!navigator.webdriver});}catch(e){fail('浏览器无法创建 3D 画面，请开启硬件加速后重试。');return;}
 $('stage').appendChild(renderer.domElement);
 renderer.setClearColor(0x9eafb5);renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
 const scene=new T.Scene();scene.fog=new T.FogExp2(0x9eafb5,.00165);
 const camera=new T.PerspectiveCamera(72,innerWidth/innerHeight,.15,750);scene.add(camera);
 scene.add(new T.HemisphereLight(0xdcefff,0x665036,.9));
 const sun=new T.DirectionalLight(0xffe2b2,1.65);sun.position.set(-130,210,100);scene.add(sun);scene.add(sun.target);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-32,right:32,top:32,bottom:-32,near:1,far:450});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0002;sun.shadow.normalBias=.08;
 const colors=R.PALETTE;
 RacingUI.models=M.thumbnails(renderer);
 const linear=color=>new T.Color(color).convertSRGBToLinear();
 const mat=(color,extra={})=>new T.MeshStandardMaterial({color:linear(color),roughness:.72,metalness:.12,...extra});
 const sand=mat(0xa79572),roadMat=mat(0x555851),edgeMat=mat(0x9c8b64);
 // 小型程序纹理只生成一次，增加路面颗粒，不引入外部贴图下载。
 function grainTexture(){const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);let n=4821;for(let i=0;i<pixels.data.length;i+=4){n=(Math.imul(n,1664525)+1013904223)>>>0;const value=180+n%65;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(6,5);return texture;}
 roadMat.map=grainTexture();roadMat.roughness=.94;
 const sandTexture=grainTexture();sandTexture.repeat.set(180,180);sand.map=sandTexture;
 const skyCanvas=document.createElement('canvas');skyCanvas.width=2;skyCanvas.height=256;
 const skyContext=skyCanvas.getContext('2d'),skyGradient=skyContext.createLinearGradient(0,0,0,256);skyGradient.addColorStop(0,'#497b9a');skyGradient.addColorStop(.55,'#9eafb5');skyGradient.addColorStop(1,'#d0c3a8');skyContext.fillStyle=skyGradient;skyContext.fillRect(0,0,2,256);
 const skyTexture=new T.CanvasTexture(skyCanvas);skyTexture.encoding=T.sRGBEncoding;
 const sky=new T.Mesh(new T.SphereGeometry(650,20,12),new T.MeshBasicMaterial({map:skyTexture,side:T.BackSide,fog:false,depthWrite:false}));scene.add(sky);
 const ground=new T.Mesh(new T.PlaneGeometry(2500,2500),sand);ground.receiveShadow=true;ground.rotation.x=-Math.PI/2;ground.position.y=-.4;scene.add(ground);
 function ribbon(samples,width,material,lift=0){
  const vertices=[],uvs=[],indices=[];
  samples.forEach((p,i)=>{
   const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
   for(const side of [-1,1]){vertices.push(p.x+dz/l*width*.5*side,p.y+lift,p.z-dx/l*width*.5*side);uvs.push(side<0?0:1,i/8);}
   if(i<samples.length-1){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
  });
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();const mesh=new T.Mesh(g,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
 }
 const samples=R.track.points.map(p=>({...p,y:R.height(p.s)}));
 // 宽肩路面覆盖低矮地形，阶梯边缘由路肩斜坡连接。
 ribbon(samples,32,edgeMat,-.18);ribbon(samples,24,roadMat);
 const shortcut=R.track.shortcut,shortSamples=Array.from({length:50},(_,i)=>{const t=i/49,s=shortcut.start+(shortcut.end-shortcut.start)*t;return {x:shortcut.a.x+(shortcut.b.x-shortcut.a.x)*t,z:shortcut.a.z+(shortcut.b.z-shortcut.a.z)*t,y:R.height(s)};});
 ribbon(shortSamples,12,edgeMat,-.16);ribbon(shortSamples,9,mat(0x827a60),.015);
 const matrix=new T.Matrix4(),dummy=new T.Object3D();
 function instances(geometry,material,records){
  const mesh=new T.InstancedMesh(geometry,material,records.length);
  records.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx||0,p.ry||0,p.rz||0);dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(p.color!==undefined)mesh.setColorAt(i,linear(p.color));});mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);return mesh;
 }
 const stripeRecords=[],railRecords=[],posts=[];
 for(let s=0;s<R.track.length;s+=7){
  const p=R.sample(s),sin=Math.sin(p.heading),cos=Math.cos(p.heading);
  for(const side of [-1,1]){
   stripeRecords.push({x:p.x+cos*11.2*side,y:p.y+.025,z:p.z-sin*11.2*side,ry:p.heading,sx:.23,sy:.035,sz:4.5});
   // 捷径出入口保持开放。
   if(Math.abs(s-shortcut.start)>22&&Math.abs(s-shortcut.end)>22){
    railRecords.push({x:p.x+cos*14.3*side,y:p.y+.6,z:p.z-sin*14.3*side,ry:p.heading,sx:.55,sy:1.15,sz:6.7,color:Math.floor(s/7)%3===0?0xb58c4b:0x777969});
    if(Math.floor(s/7)%2===0)posts.push({x:p.x+cos*15.2*side,y:p.y+1.5,z:p.z-sin*15.2*side,ry:p.heading,sx:.16,sy:3,sz:.16});
   }
  }
 }
 instances(new T.BoxGeometry(1,1,1),mat(0xd5cab0),stripeRecords);instances(M.bevelBox(1,1,1,.12),mat(0xffffff),railRecords);instances(new T.BoxGeometry(1,1,1),mat(0x414b45),posts);
 // 所有地景使用固定种子，方便复查与稳定加载。
 let seed=991;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const rocks=[],pebbles=[],trunks=[],leaves=[];
 for(let i=0;i<480;i++){
  const x=-260+rand()*920,z=-420+rand()*890,q=R.locate(x,z);if(q.distance<q.width/2+19||RacingSpectacle.reserved(x,z))continue;
  const near=q.distance<55,h=near?3+rand()*11:15+rand()*65;
  rocks.push({x,y:h*.36-1,z,sx:near?5+rand()*9:20+rand()*33,sy:h,sz:near?5+rand()*9:19+rand()*30,ry:rand()*6,color:[0x9b896b,0xb19c77,0x8a8069,0xa28f70][i%4]});
  if(i%4===0&&q.distance<75){trunks.push({x:x+4,y:2,z:z+3,sx:.6,sy:5,sz:.6});leaves.push({x:x+4,y:5,z:z+3,sx:3,sy:4,sz:3});}
 }
 for(let i=0;i<230;i++){const p=R.sample(rand()*R.track.length),side=rand()>.5?1:-1,d=17+rand()*6;pebbles.push({x:p.x+Math.cos(p.heading)*d*side,y:p.y-.4,z:p.z-Math.sin(p.heading)*d*side,sx:1+rand()*2,sy:.5+rand()*1.4,sz:1+rand(),ry:rand()*6});}
 for(const rock of rocks){const q=R.locate(rock.x,rock.z),factor=Math.min(1,Math.max(.1,q.distance-q.width/2-6)/Math.hypot(rock.sx,rock.sz));rock.sx*=factor;rock.sz*=factor;}
 for(let i=rocks.length-1;i>=0;i--)if(RacingSpectacle.reserved(rocks[i].x,rocks[i].z,Math.max(rocks[i].sx,rocks[i].sz)*.8))rocks.splice(i,1);
 const rockGeometry=new T.IcosahedronGeometry(1,2),rockColors=[];
 for(let i=0;i<rockGeometry.attributes.position.count;i++){const y=rockGeometry.attributes.position.getY(i),shade=.7+.25*(y+1)/2+(Math.sin(y*23)>.5?.04:0);rockColors.push(shade,shade*.97,shade*.91);}
 rockGeometry.setAttribute('color',new T.Float32BufferAttribute(rockColors,3));
 const rockCanvas=document.createElement('canvas');rockCanvas.width=256;rockCanvas.height=256;const rockContext=rockCanvas.getContext('2d'),rockPixels=rockContext.createImageData(256,256);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4,band=Math.sin(y*.22+Math.sin(x*.025)*2)*9+Math.sin(y*.73)*4,grain=((Math.imul((x+1)*73856093,(y+7)*19349663)>>>8)%31)-15,value=206+band+grain;rockPixels.data[i]=value;rockPixels.data[i+1]=value-4;rockPixels.data[i+2]=value-12;rockPixels.data[i+3]=255;}rockContext.putImageData(rockPixels,0,0);
 const rockTexture=new T.CanvasTexture(rockCanvas);rockTexture.wrapS=rockTexture.wrapT=T.RepeatWrapping;rockTexture.repeat.set(3,3);instances(rockGeometry,mat(0xffffff,{flatShading:true,vertexColors:true,map:rockTexture}),rocks);
 instances(new T.DodecahedronGeometry(1,0),mat(0x9c9279),pebbles);
 instances(new T.CylinderGeometry(.7,1,1,5),mat(0x514c3a),trunks);instances(new T.ConeGeometry(1,1,9),mat(0x5e6550),leaves);
 function box(w,h,d,color,x,y,z,parent=scene){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);parent.add(m);return m;}
 function sign(text,w,h){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#202924';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#dfb863';ctx.fillRect(0,234,1024,12);ctx.font='600 78px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#eeeadd';ctx.fillText(text,512,118,960);
  const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;return new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));
 }
 let spectacles;const startLabel=$('start').textContent;$('start').textContent='正在载入赛道…';$('start').disabled=true;
 try{spectacles=await RacingSpectacle.create(scene);}catch(e){fail(e.message||'赛道模型加载失败，请刷新重试');return;}
 $('start').textContent=startLabel;$('start').disabled=false;let spectacleState={};
 const start=R.sample(2),gate=new T.Group();gate.position.set(start.x,start.y,start.z);gate.rotation.y=start.heading;scene.add(gate);
 box(.8,9,.8,0x353f38,-13,4,0,gate);box(.8,9,.8,0x353f38,13,4,0,gate);box(27,.8,.8,0x414a40,0,8,0,gate);
 const banner=sign('CANYON  /  START — FINISH',25,3);banner.position.set(0,7.6,-.5);banner.rotation.y=Math.PI;gate.add(banner);
 const checks=[];for(let x=-11;x<12;x+=2)for(let z=0;z<2;z++)checks.push({x:start.x+x,y:start.y+.06,z:start.z+z,sx:2,sy:.04,sz:1,color:(Math.round(x/2)+z)%2?0xe1dbc6:0x303933});instances(new T.BoxGeometry(1,1,1),mat(0xffffff),checks);
 for(const [s,label] of [[shortcut.start-15,'SHORTCUT  ↗'],[R.track.length*.18,'BRAKE  /  弯道'],[R.track.length*.57,'CANYON  SECTOR 02']]){
  const p=R.sample(s),b=sign(label,14,3);b.position.set(p.x+Math.cos(p.heading)*17,p.y+4,p.z-Math.sin(p.heading)*17);b.rotation.y=p.heading+Math.PI;scene.add(b);
 }
 // 发车区机库和观察塔，使用低面数结构。
 const depot=M.builder();
 for(let i=0;i<4;i++){const p=R.sample(-35-i*18),x=p.x-29,y=p.y,z=p.z;
  depot.box(13,6,10,0x939589,x,y+2,z);depot.box(9,3.8,.2,0x37434a,x,y+1.5,z+5.12);depot.box(14,.45,11,0x53616a,x,y+5.2,z);
  for(let j=0;j<9;j++)depot.box(8.8,.055,.1,0x677478,x,y-.1+j*.4,z+5.25);
  for(const side of [-1,1]){depot.box(.3,5,.3,0xc6bca0,x+side*5.9,y+2,z+5.15);depot.box(.7,.4,.4,0xffd998,x+side*4.8,y+3.9,z+5.3);}
  depot.box(2.8,.7,2,0x505c60,x+3,y+5.7,z-2);for(let j=0;j<5;j++)depot.box(.2,.04,1.7,0x9aa69f,x+2+j*.4,y+6.07,z-2);
 }
 scene.add(new T.Mesh(depot.finish(),mat(0xffffff,{vertexColors:true})));
 const gateDetails=M.builder();for(const x of [-13,13]){gateDetails.box(1.7,.4,1.7,0x9a967b,x,.15,0);for(let y=1;y<6;y+=1.2)gateDetails.box(.88,.18,.88,0xd2ad65,x,y,0);}for(let x=-12;x<13;x+=2)gateDetails.box(.8,.16,1,0xffe1a0,x,9,0);gate.add(new T.Mesh(gateDetails.finish(),mat(0xffffff,{vertexColors:true})));
 function mergedBoxes(parts){
  const positions=[],normals=[],colors=[];
  for(const p of parts){const geo=new T.BoxGeometry(p[0],p[1],p[2]).toNonIndexed();geo.translate(p[3],p[4],p[5]);positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);const color=linear(p[6]);for(let i=0;i<geo.attributes.position.count;i++)colors.push(color.r,color.g,color.b);geo.dispose();}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));return geo;
 }
 const vehicleMaterial=mat(0xffffff,{vertexColors:true});
 function makeTank(color){
  const group=new T.Group(),geometry=M.tank(color),body=new T.Mesh(geometry.body,vehicleMaterial);group.add(body);
  body.castShadow=true;body.receiveShadow=true;const turret=new T.Group();turret.position.y=1.65;turret.add(new T.Mesh(geometry.turret,vehicleMaterial));turret.children[0].castShadow=true;turret.children[0].receiveShadow=true;group.add(turret);
  const shield=new T.Mesh(new T.SphereGeometry(3.7,20,12),new T.MeshBasicMaterial({color:0x87dedd,transparent:true,opacity:.15,wireframe:true}));shield.position.y=1.2;shield.visible=false;group.add(shield);scene.add(group);return {group,turret,shield,body,colorIndex:-1};
 }
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;const shadowContext=shadowCanvas.getContext('2d'),shadowGradient=shadowContext.createRadialGradient(32,32,4,32,32,32);shadowGradient.addColorStop(0,'rgba(10,18,24,.65)');shadowGradient.addColorStop(.5,'rgba(10,18,24,.36)');shadowGradient.addColorStop(1,'rgba(10,18,24,0)');shadowContext.fillStyle=shadowGradient;shadowContext.fillRect(0,0,64,64);
 const contactShadows=instances(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),Array(6).fill({x:0,y:-100,z:0}));
 const tanks=colors.map(makeTank),cockpitGeometry=M.cockpit(colors[0]);
 const cockpit=new T.Group();camera.add(cockpit);cockpit.add(new T.Mesh(cockpitGeometry.body,vehicleMaterial));
 const cockpitGun=new T.Group();cockpit.add(cockpitGun);cockpitGun.add(new T.Mesh(cockpitGeometry.gun,vehicleMaterial));
 const crateCanvas=document.createElement('canvas');crateCanvas.width=128;crateCanvas.height=128;const crateContext=crateCanvas.getContext('2d');crateContext.fillStyle='#d79a2e';crateContext.fillRect(0,0,128,128);crateContext.strokeStyle='#ffe29b';crateContext.lineWidth=8;crateContext.strokeRect(6,6,116,116);crateContext.fillStyle='#fff4ca';crateContext.font='bold 88px sans-serif';crateContext.textAlign='center';crateContext.fillText('?',64,97);const crateTexture=new T.CanvasTexture(crateCanvas);crateTexture.encoding=T.sRGBEncoding;
 const pickupMesh=instances(new T.BoxGeometry(2.65,2.65,2.65),mat(0xffffff,{map:crateTexture,emissive:0x916123,emissiveIntensity:.16}),Array(R.LIMITS.pickups).fill({x:0,y:0,z:0}));
 const bulletMesh=instances(new T.SphereGeometry(.35,5,4),new T.MeshBasicMaterial({color:0xffd179}),Array(R.LIMITS.shots).fill({x:0,y:-100,z:0}));
 const mineMesh=instances(M.item('mine').scale(.85,.85,.85),mat(0xffffff,{vertexColors:true,roughness:.5}),Array(R.LIMITS.mines).fill({x:0,y:-100,z:0}));
 const effects=instances(new T.IcosahedronGeometry(.6,0),new T.MeshBasicMaterial({color:0xffc474,transparent:true,opacity:.8}),Array(128).fill({x:0,y:-100,z:0}));
 const skidMesh=instances(new T.BoxGeometry(.42,.018,1.4),new T.MeshBasicMaterial({color:0x292e29,transparent:true,opacity:.45}),Array(256).fill({x:0,y:-100,z:0}));
 const pulseMesh=instances(new T.RingGeometry(.92,1,40),new T.MeshBasicMaterial({color:0x83d7ff,transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false}),Array(12).fill({x:0,y:-100,z:0}));
 const skidMarks=[];let lastSkidTime=0;
 const itemNames=R.ITEM_NAMES,itemTips={boost:'持续 3 秒 · 弯道慎用',missile:'锁定前方 160 米内对手',mine:'留在车后 · 封锁追击路线',shield:'抵挡一次攻击 · 可拦截猎首与飞碟',leader:'锁定第一名 · 预警后重创减速',ufo:'吸起领跑者 · 向后转移 40 米',emp:'30 米电磁震荡 · 打断附近对手推进'};
 let game=R.create(),started=false,last=performance.now(),accumulator=0,manual=false,lastEvent=0,quality='auto',effectiveQuality='high',shake=true,sound=true,frameSamples=[],qualityTime=0,autodriveForTest=false;
 let playerSlot=0,localMenu=false,chosenColor=0,liftingCamera=false;
 const keys=new Set(),mapDots=[];
 const aimPoint=new T.Vector3(),remotePoint=new T.Vector3(),labelPoint=new T.Vector3();
 function readSettings(){try{const s=JSON.parse(localStorage.getItem('tank-racing-settings')||'{}');if(['auto','high','low'].includes(s.quality))quality=s.quality;if(typeof s.shake==='boolean')shake=s.shake;if(typeof s.sound==='boolean')sound=s.sound;}catch{}}
 readSettings();$('quality').value=quality;$('shake').checked=shake;$('sound').checked=sound;
 function saveSettings(){try{localStorage.setItem('tank-racing-settings',JSON.stringify({quality,shake,sound}));}catch{}}
 function resize(){const ratio=Math.min(devicePixelRatio||1,effectiveQuality==='low'?1:1.5);renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
 function setQuality(value){effectiveQuality=value;renderer.shadowMap.enabled=value!=='low';resize();}
 setQuality(quality==='low'?'low':'high');addEventListener('resize',resize);
 $('mapRoad').setAttribute('d',R.track.points.map((p,i)=>`${i?'L':'M'}${p.x},${-p.z}`).join(' ')+' Z');$('mapShortcut').setAttribute('d',`M${shortcut.a.x},${-shortcut.a.z}L${shortcut.b.x},${-shortcut.b.z}`);
 for(let i=0;i<6;i++){const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('r',i===0?7:5);dot.setAttribute('fill',i===0?'#fff':'#d89c66');$('mapCars').appendChild(dot);mapDots.push(dot);}
 $('trackLength').textContent=Math.round(R.track.length).toLocaleString();
 let audio=null,engine=null,engineGain=null;
 function initAudio(){
  try{if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();engine=audio.createOscillator();engine.type='sawtooth';const filter=audio.createBiquadFilter();filter.frequency.value=160;engineGain=audio.createGain();engineGain.gain.value=0;engine.connect(filter).connect(engineGain).connect(audio.destination);engine.start();}if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{audio=null;}
 }
 function beep(type){
  if(!audio||!sound||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain(),now=audio.currentTime;
  o.type=type==='fire'||type==='hit'?'sawtooth':'sine';o.frequency.setValueAtTime(type==='fire'?130:type==='hit'?70:type==='pickup'?720:450,now);o.frequency.exponentialRampToValueAtTime(type==='pickup'?1000:35,now+.16);g.gain.setValueAtTime(.055,now);g.gain.exponentialRampToValueAtTime(.001,now+.2);o.connect(g).connect(audio.destination);o.start(now);o.stop(now+.22);o.onended=()=>{o.disconnect();g.disconnect();};
 }


 function paintPart(mesh,count,color){if(mesh.geometry.userData.paintRanges){M.paint(mesh.geometry,color);return;}const a=mesh.geometry.attributes.color,v=linear(color);for(let i=0;i<count;i++)a.setXYZ(i,v.r,v.g,v.b);a.needsUpdate=true;}
 function paintTank(tank,index){index=Number.isInteger(index)&&index>=0&&index<colors.length?index:0;if(tank.colorIndex===index)return;tank.colorIndex=index;paintPart(tank.body,72,colors[index]);paintPart(tank.turret.children[0],36,colors[index]);}
 let cockpitColor=-1;
 try{const profile=JSON.parse(localStorage.getItem('tank-racing-profile')||'{}');if(typeof profile.name==='string')$('playerName').value=profile.name.slice(0,16);if(Number.isInteger(profile.color)&&colors[profile.color])chosenColor=profile.color;}catch{}
 function saveProfile(){try{localStorage.setItem('tank-racing-profile',JSON.stringify({name:$('playerName').value.trim().slice(0,16)||'车手',color:chosenColor}));}catch{}}
 function colorSelection(){for(const id of ['menuColors','roomColors'])for(const button of $(id).children)button.setAttribute('aria-pressed',String(Number(button.dataset.color)===chosenColor));$('previewName').textContent=$('playerName').value||'车手';}
 for(const id of ['menuColors','roomColors'])colors.forEach((color,index)=>{const b=document.createElement('button');b.type='button';b.dataset.color=index;b.style.setProperty('--swatch',color);b.setAttribute('aria-label',['赤焰红','沙漠金','翡翠绿','冰川蓝','星际紫','钛白'][index]);b.onclick=()=>{chosenColor=index;colorSelection();saveProfile();if(net.role!=='off')net.profile($('roomName').value,chosenColor);};$(id).appendChild(b);});
 colorSelection();$('playerName').onchange=()=>{colorSelection();saveProfile();};$('roomName').onchange=()=>{const name=$('roomName').value.trim().slice(0,16)||'车手';$('playerName').value=name;saveProfile();net.profile(name,chosenColor);};
 const svgNS='http://www.w3.org/2000/svg';function svgElement(tag,attributes,parent){const node=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attributes))node.setAttribute(k,v);parent.appendChild(node);return node;}
 $('mapOutline').setAttribute('d',$('mapRoad').getAttribute('d'));
 const supplyDots=game.pickups.map(p=>{const q=R.supplyPosition(p);return svgElement('circle',{cx:q.x,cy:-q.z,r:3.5},$('mapSupplies'));});
 const mapRanks=game.cars.map(c=>svgElement('text',{'text-anchor':'middle','font-size':11,fill:'#fff'},$('mapLandmarks')));
 for(const [s,text] of [[0,'起点'],[R.track.length*.26,'01'],[R.track.length*.56,'02'],[R.track.length*.82,'03']]){const q=R.sample(s),label=svgElement('text',{x:q.x+15,y:-q.z-12},$('mapLandmarks'));label.textContent=text;}
 const startPoint=R.sample(0);svgElement('path',{d:'M'+(startPoint.x-12)+','+(-startPoint.z)+'h24',stroke:'#ffc56e','stroke-width':4},$('mapLandmarks'));
 const nameplates=game.cars.map(()=>{const el=document.createElement('div');el.className='nameplate';const rank=document.createElement('b'),name=document.createElement('span'),type=document.createElement('small');el.append(rank,name,type);$('nameplates').appendChild(el);return {el,rank,name,type};});
 const ufoGeometry=M.item('ufo'),leaderGeometry=M.item('leader'),threatMaterial=mat(0xffffff,{vertexColors:true,roughness:.38,metalness:.35});
 const threatMeshes=Array.from({length:3},()=>{const group=new T.Group();scene.add(group);const disc=new T.Mesh(ufoGeometry,threatMaterial);disc.scale.setScalar(3);const beam=new T.Mesh(new T.CylinderGeometry(1.2,3.8,8,16,1,true),new T.MeshBasicMaterial({color:0xbca0ff,transparent:true,opacity:.16,side:T.DoubleSide,depthWrite:false}));beam.position.y=-4.3;const rocket=new T.Mesh(leaderGeometry,threatMaterial);rocket.rotation.z=Math.PI;rocket.scale.setScalar(1.4);group.add(disc,beam,rocket);return {group,disc,beam,rocket};});

 let lastSnapshotAt=0;
 function roomUI(){
  const active=net.role!=='off';$('networkStatus').textContent=net.status||'单人随时开跑 · 联机由房主开房';
  $('networkRoom').hidden=!active||!!net.game;$('lobby').hidden=active||started;
  if(active&&!net.game){started=false;localMenu=false;$('lobby').hidden=true;$('hud').hidden=true;$('pause').hidden=true;$('results').hidden=true;}
  $('roomCode').textContent=net.opened?net.code:'连接中';$('roomStatus').textContent=net.status;
  $('roomMembers').replaceChildren();net.members.forEach((member,i)=>{const li=document.createElement('li'),number=document.createElement('i'),name=document.createElement('b'),state=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');number.style.setProperty('--paint',colors[member?.color??i]);name.textContent=member?member.name+(i===net.slot?'（你）':''):'AI 车手';state.textContent=member?(i===0?'● 房主':member.ready?'● 已准备':'○ 等待准备'):'自动补位';li.classList.toggle('ready',!!member?.ready);li.classList.toggle('self',!!member&&i===net.slot);li.append(number,name,state);$('roomMembers').appendChild(li);});$('roomCount').textContent=String(net.members.filter(Boolean).length).padStart(2,'0')+' / 06';const me=net.members[net.slot];if(me){$('roomDriver').textContent=me.name;if(document.activeElement!==$('roomName'))$('roomName').value=me.name;}
  $('roomStart').hidden=net.role!=='host';$('roomStart').disabled=!net.opened||net.members.some(m=>m&&!m.ready);const waiting=net.members.filter(m=>m&&!m.ready).length;$('roomStart').textContent=waiting?'等待 '+waiting+' 位车手准备':'开始比赛 →';$('readyRoom').hidden=net.role!=='client';$('readyRoom').disabled=!net.opened;$('readyRoom').textContent=net.members[net.slot]?.ready?'已准备 · 取消':'准备比赛 →';$('readyRoom').dataset.ready=String(!!net.members[net.slot]?.ready);if(net.opened&&!net.game)$('roomStatus').textContent=net.role==='host'?(waiting?'等待 '+waiting+' 位车手准备':'全员就绪，可以发车'):net.members[net.slot]?.ready?'你已准备，等待房主发车':'选择涂装，准备好后点击下方按钮';$('copyRoom').disabled=!net.opened;
  $('restart').hidden=active;$('leaveRace').hidden=!active;$('leaveResults').hidden=!active;$('again').disabled=net.role==='client';$('again').textContent=net.role==='host'?'返回等候室 →':net.role==='client'?'等待房主返回等候室':'再跑一场 →';
  $('pause').querySelector('h2').textContent=net.role==='client'?'比赛仍在进行':'比赛已暂停';$('pause').querySelectorAll('p')[1].textContent=net.role==='client'?'关闭菜单即可继续驾驶。':'调整好状态，再回到赛道。';
 }
 const net=new RacingNetwork.Session({Peer:window.Peer,peerOptions:window.RACING_NETWORK_CONFIG?.peerOptions||{},onChange:roomUI,
  onStart(g,slot){game=g;playerSlot=slot;started=true;localMenu=false;manual=false;lastSnapshotAt=performance.now();accumulator=0;last=performance.now();keys.clear();lastEvent=0;skidMarks.length=0;lastSkidTime=0;document.activeElement?.blur();initAudio();$('lobby').hidden=true;$('networkRoom').hidden=true;$('hud').hidden=false;$('pause').hidden=true;$('results').hidden=true;mapDots.forEach((d,i)=>{d.setAttribute('r',i===slot?7:5);d.setAttribute('fill',i===slot?'#fff':'#d89c66');});},
  onSnapshot(g){const previous=game.cars[playerSlot];lastSnapshotAt=performance.now();if(g.phase==='racing'&&!g.cars[playerSlot].finished){let next=g.cars[playerSlot];const predictSteps=Math.min(9,Math.round(net.rtt/2000*60));for(let i=0;i<predictSteps;i++)next=R.predictCar(g,next,1/60,localMenu?{}:input());if(previous&&!previous.finished&&Math.hypot(previous.x-next.x,previous.z-next.z)<5){for(const k of ['x','y','z'])next[k]=previous[k]+(next[k]-previous[k])*.4;next.heading=previous.heading+R.angle(next.heading-previous.heading)*.4;}g.cars[playerSlot]=next;}game=g;},
  onExit(reason){started=false;localMenu=false;playerSlot=0;keys.clear();game=R.create();$('lobby').hidden=false;$('hud').hidden=true;$('networkRoom').hidden=true;$('pause').hidden=true;$('results').hidden=true;$('networkStatus').textContent=reason||'已退出房间';}
 });
 const netLabel=document.createElement('span');netLabel.id='netStatus';$('timer').after(netLabel);
 function performAction(action){if(!started||localMenu)return;if(net.role!=='off'){net.action(action);return;}if(action==='use')R.useItem(game,game.cars[playerSlot]);if(action==='switch')R.switchItem(game,game.cars[playerSlot]);if(action==='recover'&&game.phase==='racing')R.recover(game,game.cars[playerSlot]);}
 $('createRoom').onclick=()=>{initAudio();net.host($('playerName').value,chosenColor);};$('joinRoom').onclick=()=>{initAudio();net.join($('roomInput').value,$('playerName').value,chosenColor);};$('roomStart').onclick=()=>net.start();$('readyRoom').onclick=()=>net.ready(!net.members[net.slot]?.ready);
 for(const id of ['leaveRoom','leaveRace','leaveResults'])$(id).onclick=()=>net.leave('已退出房间');
 $('copyRoom').onclick=async()=>{const url=new URL(location.href);url.search='';url.hash='room='+net.code;try{await navigator.clipboard.writeText(url.href);$('roomStatus').textContent='邀请链接已复制';}catch{$('roomStatus').textContent='房间码：'+net.code+'，请发给朋友';}};
 const invite=new URLSearchParams(location.hash.slice(1)).get('room');if(invite)$('roomInput').value=invite.slice(0,6).toUpperCase();
 // 心跳不依赖渲染帧；隐藏房主页会明确暂停整场，避免后台降频造成不公平。
 setInterval(()=>{if(net.role!=='off')net.tick(0,localMenu||document.hidden?{}:input());},1000);
 addEventListener('pagehide',()=>net.leave());

 function startRace(){
  if(net.role!=='off')return;playerSlot=0;$('netStatus').textContent='';mapDots.forEach((d,i)=>{d.setAttribute('r',i===0?7:5);d.setAttribute('fill',i===0?'#fff':'#d89c66');});document.activeElement?.blur();initAudio();game=R.create();game.cars[0].name=$('playerName').value.trim().slice(0,16)||'车手';game.cars[0].color=chosenColor;started=true;accumulator=0;keys.clear();lastEvent=0;skidMarks.length=0;lastSkidTime=0;$('lobby').hidden=true;$('hud').hidden=false;$('pause').hidden=true;$('results').hidden=true;render();
 }
 function togglePause(){if(!started)return;keys.clear();if(net.role==='client'){localMenu=!localMenu;net.sendInput({});$('pause').hidden=!localMenu;}else{if(net.role==='host')net.pause();else R.pause(game);$('pause').hidden=game.phase!=='paused';}if($('pause').hidden){document.activeElement?.blur();initAudio();}}
 $('start').onclick=startRace;$('again').onclick=()=>{if(net.role==='host')net.returnLobby();else if(net.role==='off')startRace();};$('restart').onclick=startRace;$('pauseButton').onclick=togglePause;$('resume').onclick=togglePause;
 $('quality').onchange=e=>{quality=e.target.value;setQuality(quality==='low'?'low':'high');saveSettings();};$('shake').onchange=e=>{shake=e.target.checked;saveSettings();};$('sound').onchange=e=>{sound=e.target.checked;if(sound)initAudio();saveSettings();};
 addEventListener('keydown',e=>{
  if(e.target.matches('select,input,button,a')){if(e.code!=='Escape')return;}
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);
  if(e.repeat)return;
  if(e.code==='Escape')togglePause();if(e.code==='KeyE')performAction('use');if(e.code==='KeyQ')performAction('switch');
  if(e.code==='KeyR'&&started&&game.phase==='racing')performAction('recover');
  if(e.code==='KeyF'){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>{});}
 });
 addEventListener('keyup',e=>keys.delete(e.code));
 addEventListener('blur',()=>{keys.clear();if(net.role==='client')net.sendInput({});if(net.role==='off'&&started&&['racing','countdown'].includes(game.phase))togglePause();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();if(net.role==='client')net.sendInput({});else if(started&&['racing','countdown'].includes(game.phase))togglePause();}});
 renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
 function input(){return {throttle:(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),steer:(keys.has('KeyA')?1:0)-(keys.has('KeyD')?1:0),aimYaw:(keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0),aimPitch:(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0),fire:keys.has('Space'),drift:keys.has('ShiftLeft')||keys.has('ShiftRight')};}
 function update(dt,control){
  const command=localMenu||document.hidden?{}:control||(autodriveForTest?R.autopilot(game.cars[playerSlot],game):input());
  if(net.role!=='off'){net.tick(dt,command);if(started&&net.role==='client'&&performance.now()-lastSnapshotAt<500)game.cars[playerSlot]=R.predictCar(game,game.cars[playerSlot],dt,command);return;}
  if(started)R.step(game,dt,command);
 }
 const timeText=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;
 function showResults(){
  if(!$('results').hidden)return;$('results').hidden=false;const rank=R.ranking(game),position=rank.findIndex(c=>c.id===playerSlot)+1;
  $('resultTitle').textContent=!game.cars[playerSlot].finished?'比赛结束 · 未完赛':position===1?'赢下这场竞逐':`第 ${position} 名完赛`;$('resultTime').textContent=game.cars[playerSlot].finished?`三圈用时 ${timeText(game.cars[playerSlot].finishTime)}`:'本场已结束，未完赛车辆按赛道进度排名';
  $('standings').replaceChildren();for(const c of rank){const li=document.createElement('li');li.textContent=c.name;li.className=c.id===playerSlot?'player':'';const span=document.createElement('span');span.textContent=c.finished?timeText(c.finishTime):`第 ${Math.min(c.lap+1,3)} 圈 · 尚未完赛`;li.appendChild(span);$('standings').appendChild(li);}
  if(net.role!=='off')return;try{const best=Number(localStorage.getItem('tank-racing-best'));if(!best||game.time<best)localStorage.setItem('tank-racing-best',String(game.time));}catch{}
 }
 function hud(){
  const c=game.cars[playerSlot],rank=R.ranking(game).findIndex(o=>o.id===playerSlot)+1;$('position').innerHTML=`${rank}<span>/ 6</span>`;$('lap').textContent=`第 ${Math.min(3,c.lap+1)} / 3 圈`;$('timer').textContent=timeText(game.time);$('speed').textContent=Math.round(Math.abs(c.speed)*3.6);$('speedFill').style.width=`${Math.min(100,Math.abs(c.speed)/58*100)}%`;
  $('item').textContent=itemNames[c.item]||'等待拾取';$('itemTip').textContent=itemTips[c.item]||'驶过黄色补给标记';$('gun').textContent=c.cooldown>0?`主炮装填 ${c.cooldown.toFixed(1)}s`:'主炮就绪 · SPACE';$('status').textContent=c.drifting?`漂移蓄力 ${Math.round(c.driftCharge*100)}%`:c.boost>0?`推进 ${c.boost.toFixed(1)}s`:c.shield>0?`护盾 ${c.shield.toFixed(1)}s`:c.offroad>0?'离开路面 · 正在减速':'';
  for(let i=0;i<2;i++){const el=$('slot'+i),item=c.inventory[i]||'empty';if(el.dataset.item!==item){el.dataset.item=item;el.innerHTML='<em>'+String(i+1).padStart(2,'0')+'</em>'+RacingUI.icon(item)+'<span class="slotHint">'+(item==='empty'?'待补给':itemNames[item])+'</span>';el.style.setProperty('--accent',RacingUI.accents[item]);}el.classList.toggle('selected',c.slot===i);}
  $('driftFill').style.width=`${c.driftCharge*100}%`;$('aimReadout').textContent=`炮口 ${Math.round(c.aim*180/Math.PI)}° / ${Math.round(c.pitch*180/Math.PI)}°`;
  $('countdown').textContent=game.phase==='countdown'?Math.ceil(game.countdown):'';$('notice').textContent=net.role!=='off'?(game.phase==='paused'?'房主暂停了比赛':c.finished?'已冲线 · 等待其他车手':net.role==='client'&&performance.now()-lastSnapshotAt>1000?'等待房主同步…':''):game.messageTime>0?game.message:'';if(net.role!=='off')$('netStatus').textContent=`房间 ${net.code} · ${net.role==='host'?'你是房主':Math.round(net.rtt)+'ms'} · ${net.members.filter(Boolean).length} 位玩家`;
  $('damage').style.opacity=c.stun>0?'.55':'0';
  aimPoint.set(c.x+Math.sin(c.heading+c.aim)*80*Math.cos(c.pitch),c.y+1.9+Math.sin(c.pitch)*80,c.z+Math.cos(c.heading+c.aim)*80*Math.cos(c.pitch)).project(camera);
  $('reticle').style.left=`${Math.max(3,Math.min(97,50+aimPoint.x*50))}%`;$('reticle').style.top=`${Math.max(3,Math.min(97,50-aimPoint.y*50))}%`;
  const order=R.ranking(game);for(const car of game.cars){const dot=mapDots[car.id];dot.setAttribute('cx',car.x);dot.setAttribute('cy',-car.z);dot.setAttribute('fill',car.id===playerSlot?'#fff':colors[car.color]);dot.setAttribute('stroke',car.id===playerSlot?'#101915':colors[car.color]);dot.setAttribute('stroke-width',2);const label=mapRanks[car.id];label.setAttribute('x',car.x);label.setAttribute('y',-car.z-9);label.textContent=order.findIndex(o=>o.id===car.id)+1;}
  game.pickups.forEach((p,i)=>supplyDots[i].style.opacity=p.cooldown>0?.15:1);
  const threat=game.threats.find(t=>t.target===playerSlot);$('threatWarning').hidden=!threat;if(threat){$('threatWarning').replaceChildren();const title=document.createElement('b'),hint=document.createElement('small');title.textContent=threat.kind==='ufo'?(c.lift>0?'飞碟牵引中':'警告 · 飞碟锁定'): '警告 · 猎首导弹来袭';hint.textContent=c.lift>0?'即将后移释放':c.shield>0?'护盾已展开':'立即使用护盾拦截';$('threatWarning').append(title,hint);}
 }
 function setInstance(mesh,i,x,y,z,size=1,ry=0){dummy.position.set(x,y,z);dummy.rotation.set(0,ry,0);dummy.scale.setScalar(size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
 let renderTime=0;
 function render(){
  renderTime=started?game.time:performance.now()/1000;
  const previewSlot=net.role!=='off'&&net.opened?net.slot:0;if(!started){for(const c of game.cars){c.color=net.members[c.id]?.color??c.id;}game.cars[previewSlot].color=chosenColor;const park=R.sample(-65);Object.assign(game.cars[previewSlot],{x:park.x,y:park.y,z:park.z,heading:park.heading});}
  for(const c of game.cars){const m=tanks[c.id];paintTank(m,c.color);if(net.role==='client'&&started&&Math.hypot(m.group.position.x-c.x,m.group.position.z-c.z)<12){m.group.position.lerp(remotePoint.set(c.x,c.y+c.lift,c.z),.35);m.group.rotation.y+=R.angle(c.heading-m.group.rotation.y)*.35;}else{m.group.position.set(c.x,c.y+c.lift,c.z);m.group.rotation.y=c.heading;}m.group.visible=started?c.id!==playerSlot:c.id===previewSlot;m.turret.rotation.y=c.aim;m.turret.rotation.x=-c.pitch;m.shield.visible=c.shield>0;}
  if(started){
   const c=game.cars[playerSlot],p=R.sample(c.lastS+22),fov=72+(c.boost>0?7:Math.max(0,c.speed)/42*3);if(Math.abs(camera.fov-fov)>.05){camera.fov+=(fov-camera.fov)*.12;camera.updateProjectionMatrix();}
   const bob=shake&&game.phase==='racing'?Math.sin(game.time*24)*Math.abs(c.speed)*.0007:0;
   if(c.lift>0)liftingCamera=true;remotePoint.set(c.x,c.y+c.lift+2.85+bob,c.z);if(liftingCamera){camera.position.lerp(remotePoint,.3);if(c.lift===0&&camera.position.distanceTo(remotePoint)<.1)liftingCamera=false;}else camera.position.copy(remotePoint);camera.lookAt(c.x+Math.sin(c.heading)*22,c.y+c.lift+2.85+(p.y-c.y)*.65,c.z+Math.cos(c.heading)*22);if(shake)camera.rotateZ(-c.slip*.06-c.steering*.012);if(cockpitColor!==c.color){cockpitColor=c.color;paintPart(cockpit.children[0],36,colors[c.color]);paintPart(cockpitGun.children[0],36,colors[c.color]);}cockpit.visible=true;cockpitGun.rotation.y=c.aim;cockpitGun.rotation.x=c.pitch;cockpitGun.position.z=c.cooldown>.95?(c.cooldown-.95)*.7:0;
  }else{
   const p=game.cars[previewSlot],orbit=Math.sin(renderTime*.16)*2;if(camera.fov!==55){camera.fov=55;camera.updateProjectionMatrix();}camera.position.set(p.x+Math.sin(p.heading+.75)*13+orbit,p.y+5.6,p.z+Math.cos(p.heading+.75)*13);camera.lookAt(p.x-3,p.y+1.3,p.z);cockpit.visible=false;
  }
  for(let i=0;i<game.pickups.length;i++){const p=game.pickups[i],pos=R.supplyPosition(p);setInstance(pickupMesh,i,pos.x,p.cooldown>0?-100:pos.y+2.3+Math.sin(renderTime*2+i)*.25,pos.z,1,renderTime*.7);}pickupMesh.instanceMatrix.needsUpdate=true;
  bulletMesh.count=game.shots.length;game.shots.forEach((s,i)=>setInstance(bulletMesh,i,s.x,s.y,s.z,s.target===null?1:1.8));bulletMesh.instanceMatrix.needsUpdate=true;
  mineMesh.count=game.mines.length;game.mines.forEach((m,i)=>setInstance(mineMesh,i,m.x,m.y,m.z));mineMesh.instanceMatrix.needsUpdate=true;
  let count=0;for(const e of game.events){
   if(e.id>lastEvent){if(e.car===playerSlot||Math.hypot(e.x-game.cars[playerSlot].x,e.z-game.cars[playerSlot].z)<45)beep(e.type);lastEvent=e.id;}
   if(!['hit','fire','shield','pickup'].includes(e.type))continue;const age=.65-e.ttl;
   for(let k=0;k<(effectiveQuality==='low'?3:7)&&count<128;k++){const a=k*2.4+e.id,r=age*(e.type==='fire'?5:10);setInstance(effects,count++,e.x+Math.sin(a)*r,e.y+1.5+Math.sin(k+1)*r*.6,e.z+Math.cos(a)*r,Math.max(.05,e.ttl)*(e.type==='fire'?.6:1));}
  }
  for(const c of game.cars)if(c.drifting){for(let i=0;i<5&&count<128;i++){const a=renderTime*3+i;setInstance(effects,count++,c.x-Math.sin(c.heading)*(3+i*.7)+Math.cos(a)*1.3,c.y+.3+(i%3)*.2,c.z-Math.cos(c.heading)*(3+i*.7)+Math.sin(a)*1.3,.25+i*.08);}}
  effects.count=count;effects.instanceMatrix.needsUpdate=true;
  let pulses=0;for(const e of game.events)if(e.type==='emp'&&pulses<12){const radius=Math.max(.1,(1-e.ttl/.65)*30);dummy.position.set(e.x,e.y+.2,e.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(radius);dummy.updateMatrix();pulseMesh.setMatrixAt(pulses++,dummy.matrix);}pulseMesh.count=pulses;pulseMesh.instanceMatrix.needsUpdate=true;
  if(started&&game.phase==='racing'&&game.time-lastSkidTime>.05){lastSkidTime=game.time;for(const c of game.cars)if(c.drifting)for(const side of [-1,1]){skidMarks.push({x:c.x+Math.cos(c.heading)*1.7*side,z:c.z-Math.sin(c.heading)*1.7*side,y:c.y+.03,h:c.heading-c.slip,t:game.time});if(skidMarks.length>256)skidMarks.shift();}}
  while(skidMarks.length&&game.time-skidMarks[0].t>8)skidMarks.shift();skidMesh.count=skidMarks.length;skidMarks.forEach((m,i)=>setInstance(skidMesh,i,m.x,m.y,m.z,1,m.h));skidMesh.instanceMatrix.needsUpdate=true;
  if(audio&&engineGain){engine.frequency.setTargetAtTime(35+Math.abs(game.cars[playerSlot].speed)*2,audio.currentTime,.1);engineGain.gain.setTargetAtTime(sound&&started&&game.phase==='racing'?.025:0,audio.currentTime,.05);}
  for(let i=0;i<threatMeshes.length;i++){const mesh=threatMeshes[i],threat=game.threats[i];mesh.group.visible=!!threat;if(!threat)continue;const target=game.cars[threat.target],ufo=threat.kind==='ufo';mesh.disc.visible=mesh.beam.visible=ufo;mesh.rocket.visible=!ufo;mesh.group.position.set(target.x,target.y+(ufo?10:4+Math.max(0,1.2-threat.age)*30),target.z);mesh.disc.rotation.y=renderTime*.8;mesh.beam.material.opacity=threat.grabbed?.24:.08;}
  const order=R.ranking(game);for(const c of game.cars){const plate=nameplates[c.id],distance=Math.hypot(camera.position.x-c.x,camera.position.z-c.z);labelPoint.set(c.x,c.y+c.lift+4.3,c.z).project(camera);const visible=started&&c.id!==playerSlot&&distance<180&&labelPoint.z>0&&labelPoint.z<1&&Math.abs(labelPoint.x)<1.05&&Math.abs(labelPoint.y)<1.05;plate.el.hidden=!visible;if(visible){plate.el.style.left=(50+labelPoint.x*50)+'%';plate.el.style.top=(50-labelPoint.y*50)+'%';plate.el.style.setProperty('--paint',colors[c.color]);plate.rank.textContent=order.findIndex(o=>o.id===c.id)+1;plate.name.textContent=c.name;plate.type.textContent=game.humans.includes(c.id)?'':'AI';plate.el.style.opacity=String(Math.min(1,(180-distance)/40));}}
  spectacleState=spectacles.update(renderTime,game.cars[started?playerSlot:previewSlot]);const caption=$('spectacleCaption');caption.textContent=spectacleState.title;caption.hidden=!started||!spectacleState.site;
  sky.position.copy(camera.position);sun.position.set(camera.position.x-130,camera.position.y+210,camera.position.z+100);sun.target.position.copy(camera.position);
  for(let i=0;i<6;i++){const c=game.cars[i],visible=tanks[i].group.visible;dummy.position.set(c.x,visible?c.y+.045:-100,c.z);dummy.rotation.set(0,c.heading,0);dummy.scale.set(6+c.lift*.2,1,7+c.lift*.2);dummy.updateMatrix();contactShadows.setMatrixAt(i,dummy.matrix);}contactShadows.instanceMatrix.needsUpdate=true;
  renderer.render(scene,camera);if(started){hud();if(game.phase==='finished'){localMenu=false;$('pause').hidden=true;showResults();}}
 }
 function frame(now){
  requestAnimationFrame(frame);const elapsed=Math.min(.1,(now-last)/1000);last=now;
  if(!manual){accumulator+=elapsed;let steps=0;while(accumulator>=1/60&&steps<6){update(1/60);accumulator-=1/60;steps++;}}
  if(quality==='auto'&&started&&game.phase==='racing'&&!manual){qualityTime+=elapsed;frameSamples.push(elapsed*1000);if(frameSamples.length>180)frameSamples.shift();if(qualityTime>6&&frameSamples.length>=120&&frameSamples.reduce((a,b)=>a+b,0)/frameSamples.length>23&&effectiveQuality!=='low'){setQuality('low');}}
  render();
 }
 window.render_game_to_text=()=>JSON.stringify({version:'8.2.0',spectacle:spectacleState,coordinates:'x/z ground plane; +y up; heading 0 toward +z',network:{role:net.role,code:net.code,slot:playerSlot,members:net.members,rtt:net.rtt,match:net.match,status:net.status},started,phase:game.phase,time:game.time,countdown:game.countdown,player:{...game.cars[playerSlot]},rank:R.ranking(game).findIndex(c=>c.id===playerSlot)+1,cars:game.cars.map(c=>({id:c.id,x:c.x,z:c.z,lap:c.lap,progress:c.progress,finished:c.finished})),threats:game.threats,shots:game.shots.length,mines:game.mines.length,item:game.cars[playerSlot].item,quality:effectiveQuality,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,results:game.results});
 window.advanceTime=ms=>{manual=true;for(let i=0;i<Math.min(18000,Math.max(0,Math.round(ms/(1000/60))));i++)update(1/60);render();};
 // 隔离验收可用真实规则驱动 AI，不在正式入口开放状态修改接口。
 if(new URLSearchParams(location.search).get('autotest')==='1')window.RacingTest={net,get game(){return game;},start:startRace,autodrive(seconds){manual=true;for(let i=0;i<seconds*60;i++)update(1/60,R.autopilot(game.cars[playerSlot],game));render();},realtime(auto=false){autodriveForTest=auto;manual=false;last=performance.now();},inspect:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory},ratio:renderer.getPixelRatio(),size:{width:renderer.domElement.width,height:renderer.domElement.height}})};
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(started&&['racing','countdown'].includes(game.phase))togglePause();fail('浏览器暂时释放了 3D 画面，请重新加载比赛。');});
 window.racingReady=true;requestAnimationFrame(frame);
})();

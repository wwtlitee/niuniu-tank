/* 程序模型：静态合批、装甲独立换色；不依赖外部模型下载。 */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory;
 else root.RacingModels=factory(root.THREE);
})(typeof window==='object'?window:globalThis,function(T){
 'use strict';
 const steel=0x46545a,dark=0x202b32,edge=0x87979d,ivory=0xe4e4cf;
 const linear=c=>new T.Color(c).convertSRGBToLinear();
 function bevelBox(w,h,d,r=.12){
  r=Math.min(r,w/5,h/5,d/5);
  const s=new T.Shape(),x=w/2-r,y=h/2-r;
  s.moveTo(-x,-y);s.lineTo(x,-y);s.lineTo(x,y);s.lineTo(-x,y);s.closePath();
  const g=new T.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:1,steps:1,curveSegments:1});
  g.translate(0,0,-d/2+r);return g;
 }
 function builder(){
  const parts=[];
  function add(g,c,x=0,y=0,z=0,rx=0,ry=0,rz=0,paint=false){
   g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);parts.push({g,c,paint});
  }
  function box(w,h,d,c,x=0,y=0,z=0,paint=false){add(bevelBox(w,h,d),c,x,y,z,0,0,0,paint);}
  function cylinder(a,b,h,c,x=0,y=0,z=0,rx=0,rz=0,n=16,paint=false){add(new T.CylinderGeometry(a,b,h,n),c,x,y,z,rx,0,rz,paint);}
  function sphere(r,c,x=0,y=0,z=0){add(new T.SphereGeometry(r,16,10),c,x,y,z);}
  function ring(r,t,c,x=0,y=0,z=0,rx=0){add(new T.TorusGeometry(r,t,6,24),c,x,y,z,rx);}
  function finish(){
   const p=[],n=[],c=[],paintRanges=[];
   for(const part of parts){const g=part.g.index?part.g.toNonIndexed():part.g,v=linear(part.c),offset=p.length/3,count=g.attributes.position.count;
    p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);
    for(let i=0;i<count;i++){const surface=g.attributes.color;c.push(v.r*(surface?surface.getX(i):1),v.g*(surface?surface.getY(i):1),v.b*(surface?surface.getZ(i):1));}
    if(part.paint)paintRanges.push([offset,count]);
    g.dispose();if(g!==part.g)part.g.dispose();
   }
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.userData.paintRanges=paintRanges;g.computeBoundingSphere();return g;
  }
  return {add,box,cylinder,sphere,ring,finish};
 }
 function paint(g,color){const v=linear(color),a=g.attributes.color;for(const [start,count] of g.userData.paintRanges||[])for(let i=start;i<start+count;i++)a.setXYZ(i,v.r,v.g,v.b);a.needsUpdate=true;}
 function armor(w,h,d){const g=bevelBox(w,h,d,.16),a=g.attributes.position;for(let i=0;i<a.count;i++){const f=1-Math.max(0,a.getY(i)/h+.1)*.28;a.setX(i,a.getX(i)*f);a.setZ(i,a.getZ(i)*f);}g.computeVertexNormals();return g;}
 function tank(color){
  const b=builder(),u=builder();
  b.add(armor(3.25,.95,4.85),color,0,1.02,0,0,0,0,true);b.box(3.65,.3,4.45,color,0,1.6,-.08,true);
  b.box(2.7,.4,.35,steel,0,.94,2.48);b.box(2.8,.18,1.1,dark,0,1.8,-1.3);
  for(let i=0;i<8;i++)b.box(.2,.07,1,edge,-1.05+i*.3,1.91,-1.3);
  for(const side of [-1,1]){
   const x=side*1.91;b.box(.86,.95,4.9,dark,x,.7,0);
   for(let j=0;j<6;j++){const z=-1.92+j*.77;b.cylinder(.43,.43,.9,steel,x,.64,z,0,Math.PI/2);b.cylinder(.22,.22,.96,edge,x,.64,z,0,Math.PI/2);b.cylinder(.09,.09,.99,dark,x,.64,z,0,Math.PI/2);}
   // 胶带包围轮组；履带节合并进车体，避免逐节绘制。
   for(let j=0;j<32;j++){const a=j/32*Math.PI*2,z=2.08*Math.cos(a),y=.7+.59*Math.sin(a);b.add(bevelBox(.97,.15,.32,.025),0x525c5c,x,y,z,Math.atan2(-.59*Math.cos(a),-2.08*Math.sin(a)));}
   b.box(.95,.17,4.95,color,x,1.42,0,true);
   for(let j=0;j<3;j++)b.box(.13,.43,1.18,color,side*2.43,1.15,-1.4+j*1.42,true);
   b.box(.55,.3,.22,dark,side*1.25,1.5,2.25);b.box(.38,.16,.04,0xffe4a3,side*1.25,1.52,2.38);
   b.box(.33,.19,.06,0xea6550,side*1.3,1.3,-2.45);
   b.cylinder(.14,.14,.6,steel,side*1.37,1.86,-1.95,Math.PI/2);
  }
  u.add(armor(2.35,.83,2.13),color,0,.39,-.1,0,0,0,true);u.box(1.92,.17,1.65,color,0,.88,-.16,true);
  u.cylinder(.61,.61,.14,steel,.28,1.01,-.35);u.cylinder(.5,.5,.1,color,.28,1.12,-.35,0,0,16,true);
  u.box(.39,.17,.2,0x80c6da,.32,1.21,.03);u.box(.85,.48,.55,steel,0,.4,1.01);
  u.cylinder(.18,.23,3.15,steel,0,.4,2.63,Math.PI/2);
  for(const z of [1.35,2.15,3.65])u.cylinder(.26,.26,.15,edge,0,.4,z,Math.PI/2);
  u.box(.55,.47,.65,steel,0,.4,4.12);u.cylinder(.18,.18,.02,0x080f15,0,.4,4.455,Math.PI/2);
  for(const side of [-1,1])for(let z=-.6;z<.7;z+=.6)u.box(.08,.14,.14,edge,side*1.2,.48,z);
  u.cylinder(.025,.04,1.75,dark,-.9,1.68,-.73,0,0,6);
  return {body:b.finish(),turret:u.finish()};
 }
 function cockpit(color){
  const b=builder(),u=builder();
  b.box(2.7,.45,1.6,color,0,-1.4,-1.1,true);b.box(.7,.14,.5,dark,-.72,-1.12,-1.25);
  for(const x of [-1.04,1.04]){b.box(.08,.12,.9,edge,x,-1.11,-1.05);b.cylinder(.055,.055,.035,steel,x,-1.04,-.8);}
  u.cylinder(.13,.17,2.1,color,0,-.83,-2,Math.PI/2,0,16,true);u.box(.4,.37,.5,steel,0,-.83,-3.05);
  for(const z of [-1.25,-2.65])u.cylinder(.19,.19,.12,edge,0,-.83,z,Math.PI/2);
  return {body:b.finish(),gun:u.finish()};
 }
 function item(type){
  const b=builder();
  if(type==='boost'){
   for(const x of [-.52,.52]){b.cylinder(.38,.38,1.65,0xf3a524,x);b.sphere(.38,0xffca4f,x,.82);b.cylinder(.29,.34,.3,steel,x,-.95);b.cylinder(.29,.29,.12,ivory,x,.1);b.cylinder(.17,.32,.75,0xff5f24,x,-1.38);}
   b.box(1.6,.23,.3,dark,0,.6,.12);b.box(.35,.52,.3,ivory,0,.05,.39);
  }else if(type==='missile'||type==='leader'){
   const c=type==='leader'?0xed4947:0xff973c;
   b.cylinder(.34,.34,1.9,ivory);b.cylinder(0,.34,.85,c,0,1.37);b.cylinder(.37,.37,.28,c,0,.5);b.cylinder(.25,.3,.35,dark,0,-1.1);
   for(let i=0;i<4;i++){const a=i*Math.PI/2;b.add(bevelBox(.12,.8,.66,.04),c,Math.sin(a)*.4,-.7,Math.cos(a)*.4,0,a);}
   if(type==='leader'){b.ring(.65,.1,0xffc544,0,.98,0,Math.PI/2);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;b.cylinder(0,.14,.5,0xffc544,Math.cos(a)*.65,1.22,Math.sin(a)*.65);}}
  }else if(type==='mine'){
   b.cylinder(.98,1.12,.42,0x6e7852,0,-.25);b.cylinder(.76,.9,.28,0xaab27c,0,.1);b.cylinder(.27,.38,.25,dark,0,.35);b.sphere(.19,0xff614a,0,.5);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;b.box(.19,.2,.19,ivory,Math.sin(a)*.83,.16,Math.cos(a)*.83);}
  }else if(type==='shield'){
   const s=new T.Shape();s.moveTo(0,-1.35);s.lineTo(-1,-.45);s.lineTo(-1,1.02);s.lineTo(0,1.35);s.lineTo(1,1.02);s.lineTo(1,-.45);s.closePath();
   b.add(new T.ExtrudeGeometry(s,{depth:.25,bevelEnabled:true,bevelSize:.09,bevelThickness:.07,bevelSegments:1,steps:1}),0x54d9b1);
   b.box(.24,1.48,.1,ivory,0,.12,.4);b.box(1.15,.24,.1,ivory,0,.15,.41);
  }else if(type==='ufo'){
   b.cylinder(.57,1.45,.36,0xa38be2);b.cylinder(1.45,.8,.32,0x626c92,0,-.34);b.sphere(.64,0x79e4dc,0,.28);b.ring(1.31,.1,0xc1b0ff,0,-.12,0,Math.PI/2);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;b.sphere(.13,0xffed96,Math.sin(a)*1.13,.03,Math.cos(a)*1.13);}
   b.cylinder(.18,.44,.8,0x81e3d4,0,-.92);
  }else if(type==='emp'){
   b.sphere(.63,steel);b.ring(.94,.12,0x64cdff);b.ring(.94,.12,0x64cdff,0,0,0,Math.PI/2);b.cylinder(.24,.24,1.72,ivory);b.sphere(.24,0x68e6ff,0,.9);b.sphere(.24,0x68e6ff,0,-.9);
  }else throw new Error('Unknown racing item: '+type);
  return b.finish();
 }
 function thumbnails(renderer){
  const images={},size=renderer.getSize(new T.Vector2()),ratio=renderer.getPixelRatio(),clear=renderer.getClearColor(new T.Color()).clone(),alpha=renderer.getClearAlpha();
  const s=new T.Scene(),camera=new T.OrthographicCamera(-1.95,1.95,1.95,-1.95,.1,30),material=new T.MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.35});
  s.add(new T.HemisphereLight(0xe3f5ff,0x323142,1.5));const key=new T.DirectionalLight(0xffefd4,2.5);key.position.set(-3,5,6);s.add(key);const rim=new T.DirectionalLight(0x8ed4ff,1.5);rim.position.set(4,2,-2);s.add(rim);
  camera.position.set(3,2.5,6);camera.lookAt(0,0,0);
  try{renderer.setPixelRatio(1);renderer.setSize(256,256,false);renderer.setClearColor(0x000000,0);
   for(const type of ['boost','missile','mine','shield','leader','ufo','emp']){const geometry=item(type),mesh=new T.Mesh(geometry,material);if(type==='missile'||type==='leader')mesh.rotation.z=-.35;s.add(mesh);renderer.render(s,camera);images[type]=renderer.domElement.toDataURL('image/png');s.remove(mesh);geometry.dispose();}
  }finally{material.dispose();renderer.setClearColor(clear,alpha);renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);}
  return images;
 }
 return {bevelBox,builder,paint,tank,cockpit,item,thumbnails};
});

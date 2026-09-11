/* Red/gold modular hardpoints. All geometry is merged once after construction. */
function buildHeroModuleDetails(root,skills){
  const k=heroModelKit(root),bounds=[];
  k.steel.color.setHex(0x8f1b29);k.brass.color.setHex(0xd9ab53);k.glow.emissiveIntensity=1.35;
  const dark=new THREE.MeshStandardMaterial({color:0x10191f,metalness:.65,roughness:.38});
  const ivory=new THREE.MeshStandardMaterial({color:0xe5e6dc,metalness:.4,roughness:.3});
  const ice=new THREE.MeshStandardMaterial({color:0x59c9f5,emissive:0x239fe3,emissiveIntensity:.9,metalness:.45,roughness:.23});
  const amber=new THREE.MeshStandardMaterial({color:0xffb450,emissive:0xf27513,emissiveIntensity:1.2,metalness:.35,roughness:.3});
  let active=root;
  function add(mesh,x,y,z){mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;active.add(mesh);return mesh;}
  function casing(w,h,d,x,y,z,mat=k.steel){return add(new THREE.Mesh(chamferedBox(w,h,d),mat),x,y,z);}
  function cylinder(r,h,x,y,z,mat=k.brass,axis='y'){
    const mesh=add(new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),mat),x,y,z);
    if(axis==='z')mesh.rotation.x=Math.PI/2;if(axis==='x')mesh.rotation.z=Math.PI/2;return mesh;
  }
  function ring(r,t,x,y,z,mat=k.brass,axis='z'){
    const mesh=add(new THREE.Mesh(new THREE.TorusGeometry(r,t,6,20),mat),x,y,z);if(axis==='y')mesh.rotation.x=Math.PI/2;return mesh;
  }
  function module(id,build){
    if(!skills[id])return;active=new THREE.Group();active.name=HeroSystem.SKILLS[id].name;root.add(active);build();
    active.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(active);bounds.push({id,min:box.min.toArray(),max:box.max.toArray()});active=root;
  }
  module('rail',()=>{
    casing(.82,.27,.56,0,1.96,-.76,k.brass);
    for(const side of [-1,1]){
      casing(.17,.19,2.05,side*.25,2.03,-1.82,dark);
      casing(.045,.06,1.85,side*.25,2.15,-1.84,ice);
      for(let i=0;i<6;i++)ring(.115,.025,side*.25,2.03,-1.01-i*.31,k.brass);
      cylinder(.11,.22,side*.25,2.03,-2.91,k.edge,'z');cylinder(.067,.025,side*.25,2.03,-3.035,ice,'z');
    }
  });
  module('frost',()=>{
    casing(.46,.27,.95,1.23,1.6,-.75,ivory);
    for(const z of [-.5,-.85]){cylinder(.13,.46,1.23,1.9,z,ice);ring(.135,.025,1.23,2.12,z,k.brass,'y');}
    for(let i=0;i<4;i++)casing(.065,.28,.35,1.02+i*.14,1.67,-.3,k.edge);
    cylinder(.18,.32,1.23,1.64,-1.33,dark,'z');ring(.18,.035,1.23,1.64,-1.5,k.edge);cylinder(.12,.025,1.23,1.64,-1.525,ice,'z');
  });
  module('heal',()=>{
    casing(.48,.36,1.02,-1.23,1.67,-.71,ivory);casing(.37,.08,.73,-1.23,1.9,-.7,k.brass);
    casing(.085,.025,.3,-1.23,1.95,-.63,k.glow);casing(.28,.025,.085,-1.23,1.95,-.63,k.glow);
    cylinder(.18,.27,-1.23,1.72,-1.34,k.brass,'z');ring(.17,.035,-1.23,1.72,-1.49,ivory);cylinder(.12,.025,-1.23,1.72,-1.51,k.glow,'z');
    for(const z of [-.4,-.8])casing(.025,.12,.16,-1.49,1.66,z,k.glow);
  });
  module('missile',()=>{
    for(const side of [-1,1]){
      casing(.6,.43,1.14,side*1.23,1.75,.76);casing(.64,.08,1.22,side*1.23,2.01,.76,k.brass);
      for(const dx of [-.14,.14])for(const dy of [-.1,.1]){
        const x=side*1.23+dx,y=1.77+dy;cylinder(.092,.93,x,y,.66,dark,'z');ring(.092,.018,x,y,.18,k.edge);
        cylinder(.055,.025,x,y,.165,amber,'z');
      }
      for(let i=0;i<3;i++)casing(.045,.025,.18,side*1.23+(i-1)*.15,2.06,.87,ivory);
    }
  });
  module('haste',()=>{
    for(const side of [-1,1]){
      cylinder(.24,.48,side*.72,1.08,2.02,dark,'z');ring(.24,.04,side*.72,1.08,2.25,k.brass);
      cylinder(.17,.025,side*.72,1.08,2.28,ice,'z');ring(.1,.025,side*.72,1.08,2.3,k.edge);
      for(let i=0;i<6;i++){const angle=i*Math.PI/3;const fin=casing(.045,.12,.025,side*.72+Math.sin(angle)*.16,1.08+Math.cos(angle)*.16,2.315,k.brass);fin.rotation.z=-angle;}
      casing(.5,.09,.54,side*.72,1.38,1.95,k.steel);
    }
  });
  module('command',()=>{
    casing(.36,.13,.36,0,2.2,1.15,k.brass);cylinder(.055,.51,0,2.5,1.15,k.edge);
    casing(.68,.42,.1,0,2.84,1.15,dark);casing(.59,.33,.035,0,2.84,1.08,k.brass);
    for(let x=0;x<4;x++)for(let y=0;y<2;y++)casing(.095,.09,.025,-.21+x*.14,2.77+y*.14,1.055,k.glow);
    cylinder(.02,.36,.34,3.05,1.15,k.edge);cylinder(.05,.055,.34,3.24,1.15,amber);
  });
  module('flame',()=>{
    for(const side of [-1,1]){
      casing(.36,.29,.58,side*1.26,1.15,-1.56,k.brass);cylinder(.12,.58,side*1.26,1.15,-1.94,dark,'z');
      for(let i=0;i<3;i++)ring(.135,.022,side*1.26,1.15,-1.8-i*.16,k.brass);
      cylinder(.075,.02,side*1.26,1.15,-2.25,amber,'z');cylinder(.085,.32,side*1.45,1.2,-1.49,k.steel);
      casing(.08,.06,.48,side*1.45,1.36,-1.75,amber);
    }
  });
  module('arc',()=>{
    cylinder(.2,.13,.53,2.25,.12,k.brass);cylinder(.08,.61,.53,2.61,.12,ice);
    for(let i=0;i<4;i++)ring(.18,.026,.53,2.4+i*.14,.12,k.brass,'y');
    const crown=add(new THREE.Mesh(new THREE.SphereGeometry(.105,12,8),ice),.53,2.99,.12);
    crown.scale.y=.7;casing(.11,.06,.38,.53,2.23,.39,dark);
  });
  module('mortar',()=>{
    casing(.34,.16,.48,-.54,2.2,.38,k.brass);const mount=active,barrel=new THREE.Group();barrel.position.set(-.54,2.3,.38);barrel.rotation.x=-.35;mount.add(barrel);active=barrel;
    cylinder(.145,.66,0,.31,0,dark);cylinder(.185,.14,0,.1,0,k.steel);
    for(let i=0;i<3;i++)ring(.15,.025,0,.22+i*.17,0,k.brass,'y');
    ring(.17,.035,0,.66,0,k.edge,'y');cylinder(.115,.01,0,.66,0,dark);
    casing(.06,.09,.25,.18,.36,0,k.brass);active=mount;
  });
  root.userData.moduleBounds=bounds;
  let i=0;for(const id of Object.keys(skills)){const tier=Math.floor(skills[id]/10);for(let j=0;j<tier;j++)k.box(.13,.08,.22,(i%3-1)*.28,.92+j*.1,.7+Math.floor(i/3)*.25,k.glow);i++;}
}

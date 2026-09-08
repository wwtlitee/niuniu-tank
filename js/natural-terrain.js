/* 先生成连续轮廓，再从实际高程派生完整地皮与阻挡格。 */
let naturalSupportPads=[];
function naturalStairHeight(x,z){
  const r=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row),travel=(x-r.x+TILE*.5)/TILE;
  if(travel<0||travel>=1||Math.abs(z-r.z)>TILE*.5)return null;
  return PH*(1-Math.floor(travel*12+1e-8)/12);
}
function migrateStairWalls(snapshot){
  const copy=JSON.parse(JSON.stringify(snapshot)),occupied=new Set(),r=ACTIVE_MODE.ramp,C=ACTIVE_MODE.canyon;
  const onStairs=a=>a&&a.x===r.col&&a.z===r.row;
  const reserve=(a,w=1)=>{for(let dz=0;dz<w;dz++)for(let dx=0;dx<w;dx++)occupied.add(`${a.x+dx},${a.z+dz}`);};
  for(const [key,items] of Object.entries(copy.structures||{}))if(key!=='units'&&Array.isArray(items))
    for(const a of items)if(!onStairs(a))reserve(a,['research','factories'].includes(key)?2:1);
  for(const j of copy.construction||[])if(j.phase!=='returning'&&j.anchor&&!onStairs(j.anchor))reserve(j.anchor,['research','factory'].includes(j.buildId)?2:1);
  const destination=()=>{for(let x=C.x0;x<=C.x1;x++){const a={x,z:C.z0};if(!occupied.has(`${x},${a.z}`)){reserve(a);return a;}}return null;};
  let refund=0;
  if(copy.structures?.walls)copy.structures.walls=copy.structures.walls.filter(w=>{
    if(!onStairs(w))return true;const a=destination();if(a){Object.assign(w,a);return true;}
    for(let level=1;level<=Math.min(1000,Math.max(1,w.lv||1));level++)refund+=wallDefinition(level).price;
    return false;
  });
  copy.construction=(copy.construction||[]).filter(j=>{
    if(j.buildId!=='wall'||j.phase==='returning'||!onStairs(j.anchor))return true;
    const a=destination();if(a){j.anchor=a;j.phase='outbound';return true;}
    refund+=Math.max(0,Number(j.cost)||0);return false;
  });
  copy.game.gold=Math.max(0,Number(copy.game.gold)||0)+refund;
  return copy;
}
function naturalPadsFromSnapshot(snapshot){
  const valid=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.z)&&p.x>0&&p.z>0&&p.x<GRID-1&&p.z<GRID-1;
  if(snapshot.naturalTerrainVersion===2)return (Array.isArray(snapshot.terrainPads)?snapshot.terrainPads:[]).filter(valid).slice(0,160).map(p=>({...p}));
  const pads=[],data=snapshot.structures||{};
  for(const [key,width] of [['mines',1],['houses',1],['turrets',1],['beacons',1],['research',2],['factories',2]])
    for(const item of data[key]||[])if(valid(item))pads.push({x:item.x,z:item.z,w:width,d:width});
  for(const job of snapshot.construction||[]){const build=shopList().find(b=>b.id===job.buildId);if(build&&build.id!=='wall'&&valid(job.anchor))pads.push({x:job.anchor.x,z:job.anchor.z,w:build.footprint?.[0]||1,d:build.footprint?.[1]||1});}
  return pads;
}
function naturalPadDistance(x,z,pad){
  const cx=(pad.x+pad.w*.5)*TILE-HALF,cz=(pad.z+pad.d*.5)*TILE-HALF,r=TILE*.3;
  const qx=Math.abs(x-cx)-(pad.w*TILE*.5+TILE*.4-r),qz=Math.abs(z-cz)-(pad.d*TILE*.5+TILE*.4-r);
  return r-Math.hypot(Math.max(0,qx),Math.max(0,qz))-Math.min(0,Math.max(qx,qz));
}
function naturalContourDistance(x,z,contour){
  let inside=false,minimum=Infinity;
  for(let i=0,j=contour.length-1;i<contour.length;j=i++){
    const a=contour[j],b=contour[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    const ex=x-a.x-t*dx,ez=z-a.z-t*dz;minimum=Math.min(minimum,ex*ex+ez*ez);
    if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return Math.sqrt(minimum)*(inside?1:-1);
}
function installNaturalTerrain(){
  // 高台采用更密的连续网格，崖壁轮廓清晰而不改变可建格逻辑；台阶仍由独立踏面控制。
  const surface=terrainSurface,subdivisions=16,step=TILE/subdivisions,n=GRID*subdivisions+1;
  const elevations=new Float32Array(n*n),wholeCells=new Int8Array(GRID*GRID),contour=[];
  const E=ACTIVE_MODE.enclosure,center=cellCenter((E.x0+E.x1)/2,(E.z0+E.z1)/2);
  const supportPads=naturalSupportPads.map(p=>({...p,w:Math.max(1,Math.min(2,p.w||1)),d:Math.max(1,Math.min(2,p.d||1)),height:(Number.isFinite(p.height)?p.height:surface.heights[idx(p.x,p.z)])>PH*.5?PH:0}));
  const C=ACTIVE_MODE.canyon;
  const pads=[{x:C.x0,z:C.z0-4,w:3,d:3,height:PH},...supportPads,{x:ACTIVE_MODE.base.col,z:ACTIVE_MODE.base.row,w:2,d:2,height:PH}];
  const rx=(E.x1-E.x0+.5)*TILE*.5,rz=(E.z1-E.z0+.4)*TILE*.5;
  for(let i=0;i<192;i++){
    const angle=i*Math.PI*2/192,radius=1+.065*Math.sin(angle*3+.6)+.045*Math.cos(angle*5-.4)+.025*Math.sin(angle*7)+.012*Math.sin(angle*19+.8);
    // 入口两翼展开成宽阔崖顶，北南端仍以曲线接回原高地。
    const east=Math.cos(angle),expandedEast=east>0?Math.pow(east,.3)*(rx+TILE*1.05):east*rx;
    contour.push({x:center.x+expandedEast*radius,z:center.z+Math.sin(angle)*rz*radius});
  }
  const ramp=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row),rampStart=ramp.x-TILE*.5;
  // 岩角放在塔位外侧的缓冲带中；折线端点形成长短不同的凸角与凹口。
  const rockEdge=[[10,14.45],[11.4,14.86],[12.1,14.48],[13.15,14.93],[13.8,14.52],[14.5,14.88],[15.25,14.43],[16.1,14.92],[16.8,14.48],[17.5,14.78],[18.5,14.46],[19.4,14.9],[20.15,14.49],[21.1,14.88],[21.8,14.46],[23,14.7]];
  const rockEdgeAt=z=>{
    const row=(z+HALF)/TILE;
    for(let i=1;i<rockEdge.length;i++)if(row<=rockEdge[i][0]){
      const a=rockEdge[i-1],b=rockEdge[i],t=Math.max(0,(row-a[0])/(b[0]-a[0]));
      return (a[1]+(b[1]-a[1])*t)*TILE-HALF;
    }
    return rockEdge.at(-1)[1]*TILE-HALF;
  };
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const analyticalHeight=(x,z)=>{
    if(Math.abs(x-center.x)>rx+TILE*2||Math.abs(z-center.z)>rz+TILE*2)return 0;
    const distance=naturalContourDistance(x,z,contour),width=TILE*(.16+.045*Math.sin(x*.71+z*.53));
    let height=PH*smooth((distance+width*.72)/width);
    for(const pad of pads){
      const influence=PH*smooth((naturalPadDistance(x,z,pad)+width*.72)/width);
      height=pad.height===PH?Math.max(height,influence):Math.min(height,PH-influence);
    }
    if(x>=rampStart-TILE){
      const travel=(x-rampStart)/TILE,opening=smooth(travel/2.2);
      const bend=TILE*(.28*Math.sin(travel*1.3)+.13*Math.sin(travel*2.4))*smooth((travel-1)/1.6);
      const centerZ=ramp.z+bend,halfWidth=TILE*(.5+opening*(.35+.12*Math.sin(travel*1.8)));
      const roundedHead=.6*Math.pow((z-centerZ)/TILE,2)*(1-smooth(travel));
      const floor=PH*Math.max(0,Math.min(1,1-travel+roundedHead));
      // 岩石峡谷保持陡峭断面，只有中心一格入口允许爬升。
      const side=Math.min(Math.abs(z-centerZ)-halfWidth,Math.abs(z-ramp.z)-TILE*.5);
      const bankWidth=TILE*(.19+.055*Math.sin(travel*2.7+(z>centerZ?1.3:3.1)));
      const bank=smooth(side/bankWidth);
      const erosion=.08*PH*Math.sin(x*2.1+z*1.8)*bank*(1-bank);
      height=Math.min(height,Math.max(0,floor+(PH-floor)*bank+erosion));
    }
    // 东侧岩壁在外环道路之前收口，扩建崖顶不能切断尸群与坦克通行。
    const eastEdge=rockEdgeAt(z);
    return Math.min(height,PH*smooth((eastEdge-x)/(TILE*.16)));
  };
  for(let z=0;z<n;z++)for(let x=0;x<n;x++)elevations[z*n+x]=analyticalHeight(-HALF+x*step,-HALF+z*step);
  surface.natural={elevations,n,step,subdivisions,wholeCells,contour,supportPads};
  surface.heightAt=(x,z)=>{
    if(!Number.isFinite(x)||!Number.isFinite(z)||x<-HALF||z<-HALF||x>=HALF||z>=HALF)return 0;
    const stair=naturalStairHeight(x,z);if(stair!==null)return stair;
    const fx=(x+HALF)/step,fz=(z+HALF)/step,ix=Math.min(n-2,Math.floor(fx)),iz=Math.min(n-2,Math.floor(fz));
    const u=fx-ix,v=fz-iz,i=iz*n+ix,a=elevations[i],b=elevations[i+1],c=elevations[i+n],d=elevations[i+n+1];
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  };
  const originalSample=surface.sample.bind(surface);
  surface.sample=(x,z)=>{
    const sample=originalSample(x,z),height=surface.heightAt(x,z),epsilon=.05;
    const dx=(surface.heightAt(x+epsilon,z)-surface.heightAt(x-epsilon,z))/(2*epsilon);
    const dz=(surface.heightAt(x,z+epsilon)-surface.heightAt(x,z-epsilon))/(2*epsilon),length=Math.hypot(dx,1,dz);
    return {...sample,height,kind:sample.kind==='ramp'?'ramp':Math.abs(dx)+Math.abs(dz)>.01?'natural-slope':sample.kind,normal:{x:-dx/length,y:1/length,z:-dz/length}};
  };
  // 覆盖整个格子里的每个地形三角形，不只判断中心或四角。
  for(let z=1;z<GRID-1;z++)for(let x=1;x<GRID-1;x++){
    let low=Infinity,high=-Infinity;
    for(let dz=0;dz<=subdivisions;dz++)for(let dx=0;dx<=subdivisions;dx++){
      const h=elevations[(z*subdivisions+dz)*n+x*subdivisions+dx];low=Math.min(low,h);high=Math.max(high,h);
    }
    const index=idx(x,z),isRamp=x===ACTIVE_MODE.ramp.col&&z===ACTIVE_MODE.ramp.row;
    const complete=high<.001?0:low>PH-.001?1:-1;wholeCells[index]=isRamp?2:complete;
    if(grid[z][x]===T_BASE){wholeCells[index]=1;continue;}
    if(isRamp)continue;
    grid[z][x]=complete===1?T_PLATEAU:complete===0?T_EMPTY:T_STEEL;
    surface.heights[index]=complete===1?PH:0;surface.ramps[index]=null;
  }
}
function naturalFootprintSupported(cells,build){
  const data=terrainSurface?.natural;if(!data)return true;
  if(!cells.length)return false;
  const first=data.wholeCells[idx(cells[0].x,cells[0].z)];
  return first>=0&&first<2&&cells.every(c=>data.wholeCells[idx(c.x,c.z)]===first);
}
function naturalSurfaceGeometry(offset=0){
  const {elevations:h,n,step,subdivisions}=terrainSurface.natural,positions=[],colors=[],uvs=[],indices=[];
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){
    const y=h[z*n+x],wx=-HALF+x*step,wz=-HALF+z*step;
    positions.push(wx,y+offset,wz);uvs.push(wx/(TILE*2.5),wz/(TILE*2.5));
    const cliff=y>.025&&y<PH-.025;
    const color=new THREE.Color(cliff?0x9ca3a8:0x9f9b87);
    const strata=cliff?.81+.19*Math.sin(y*11+Math.sin(wx*.8+wz*.4)*.7):1;
    color.multiplyScalar((.94+.06*Math.sin(wx*.85+wz*.61))*strata);colors.push(color.r,color.g,color.b);
  }
  for(let z=0;z<n-1;z++)for(let x=0;x<n-1;x++){
    if(Math.floor(x/subdivisions)===ACTIVE_MODE.ramp.col&&Math.floor(z/subdivisions)===ACTIVE_MODE.ramp.row)continue;
    const i=z*n+x;if(Math.max(h[i],h[i+1],h[i+n],h[i+n+1])<.001)continue;
    indices.push(i,i+n,i+1,i+1,i+n,i+n+1);
  }
  // 独立顶点保证踏面与立面硬边，避免高度网格把台阶重新抹成斜坡。
  const r=cellCenter(ACTIVE_MODE.ramp.col,ACTIVE_MODE.ramp.row),left=r.z-TILE*.5,right=r.z+TILE*.5;
  const quad=(points,color)=>{
    const start=positions.length/3,c=new THREE.Color(color);
    for(const [x,y,z] of points){positions.push(x,y+offset,z);colors.push(c.r,c.g,c.b);uvs.push(x/(TILE*2.5),z/(TILE*2.5));}
    indices.push(start,start+1,start+2,start,start+2,start+3);
  };
  for(let i=0;i<12;i++){
    const x0=r.x-TILE*.5+i*TILE/12,x1=x0+TILE/12,top=PH*(1-i/12),bottom=PH*(1-(i+1)/12);
    quad([[x0,top,left],[x0,top,right],[x1,top,right],[x1,top,left]],i%3===0?0xb9b6a7:0xaaa99e);
    quad([[x1,top,left],[x1,top,right],[x1,bottom,right],[x1,bottom,left]],0x777f83);
    quad([[x0,0,left],[x0,top,left],[x1,top,left],[x1,0,left]],0x82898b);
    quad([[x1,0,right],[x1,top,right],[x0,top,right],[x0,0,right]],0x82898b);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function makeNaturalPlateauMesh(){
  const texture=makeSurvivalPlateauTexture();texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  const mesh=new THREE.Mesh(naturalSurfaceGeometry(-.015),new THREE.MeshStandardMaterial({map:texture,vertexColors:true,roughness:.98,emissive:0x30383d,emissiveIntensity:.22}));
  mesh.name='自然侵蚀高坡';mesh.userData.assetName='natural-plateau';mesh.userData.surfaceVariations=4;mesh.receiveShadow=true;mesh.castShadow=true;return mesh;
}
function naturalOverlayGeometry(offset){
  const geometry=naturalSurfaceGeometry(offset),uv=geometry.attributes.uv,position=geometry.attributes.position;
  for(let i=0;i<position.count;i++)uv.setXY(i,(position.getX(i)+HALF)/(GRID*TILE),1-(position.getZ(i)+HALF)/(GRID*TILE));
  return geometry;
}

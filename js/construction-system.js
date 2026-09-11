(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ConstructionSystem=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const seconds=Object.freeze({wall:8,turret:12,rapid:12,cannon:12,antitank:12,emp:12,house:15,goldmine:18,beacon:16,research:28,factory:35,heroHub:25});
  function duration(id){return seconds[id]||15;}
  function advance(job,dt){
    if(job.phase!=='building'||!Number.isFinite(dt)||dt<=0)return false;
    job.elapsed=Math.min(job.duration,job.elapsed+dt);
    return job.elapsed>=job.duration;
  }
  // Four-way BFS prevents diagonal corner cutting; each order plans only on dispatch or obstruction.
  function findPath(start,goals,width,height,passable,canStep=()=>true){
    const inside=(x,z)=>x>=0&&z>=0&&x<width&&z<height;
    if(!start||!inside(start.x,start.z))return null;
    const targets=new Set(goals.filter(g=>inside(g.x,g.z)&&passable(g.x,g.z)).map(g=>g.z*width+g.x));
    if(!targets.size)return null;
    const previous=new Int32Array(width*height).fill(-1),queue=new Int32Array(width*height);
    const first=start.z*width+start.x;previous[first]=first;queue[0]=first;
    for(let head=0,tail=1;head<tail;head++){
      const cell=queue[head],x=cell%width,z=Math.floor(cell/width);
      if(targets.has(cell)){
        const result=[];let cursor=cell;
        while(cursor!==first){result.push({x:cursor%width,z:Math.floor(cursor/width)});cursor=previous[cursor];}
        result.push({x:start.x,z:start.z});return result.reverse();
      }
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,nz=z+dz,index=nz*width+nx;
        if(!inside(nx,nz)||previous[index]!==-1||!passable(nx,nz)||!canStep(x,z,nx,nz))continue;
        previous[index]=cell;queue[tail++]=index;
      }
    }
    return null;
  }
  return {duration,advance,findPath};
});

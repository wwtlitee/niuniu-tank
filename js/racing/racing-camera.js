/* Racing camera poses are independent of simulation and network state. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.RacingCamera=factory(root.RacingRules);})(typeof window==='object'?window:globalThis,function(R){
 'use strict';
 function desired(car,mode='third'){
  const speed=Math.max(0,car.speed),heading=car.heading,forward={x:Math.sin(heading),z:Math.cos(heading)},y=car.y+car.lift;
  if(mode==='first')return {eye:{x:car.x-forward.x*.6,y:y+2.95,z:car.z-forward.z*.6},target:{x:car.x+forward.x*28,y:y+2.95+(R.sample(car.lastS+24).y-car.y)*.6,z:car.z+forward.z*28},fov:72+Math.min(speed/14,3)+(car.boost>0?5:0)};
  const distance=10.8+Math.min(speed,58)*.045,look=4+speed*.09;
  return {eye:{x:car.x-forward.x*distance,y:y+6.1+speed*.014,z:car.z-forward.z*distance},target:{x:car.x+forward.x*look,y:y+1.4+(R.sample(car.lastS+look).y-car.y)*.45,z:car.z+forward.z*look},fov:62+Math.min(speed/10,5)+(car.boost>0?4:0)};
 }
 function smooth(previous,target,dt){
  if(!previous)return target;
  const amount=1-Math.exp(-9*Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0))),out={};
  for(const key of ['eye','target']){out[key]={};for(const axis of ['x','y','z'])out[key][axis]=previous[key][axis]+(target[key][axis]-previous[key][axis])*amount;}
  out.fov=previous.fov+(target.fov-previous.fov)*amount;return out;
 }
 function occluderOpacity(player,rival,eye){
  const dx=eye.x-player.x,dz=eye.z-player.z,length=Math.hypot(dx,dz);
  if(!Number.isFinite(length)||length<.1)return 1;
  const rx=rival.x-player.x,rz=rival.z-player.z,along=(rx*dx+rz*dz)/length,lateral=Math.abs(rx*dz-rz*dx)/length;
  if(!Number.isFinite(along)||!Number.isFinite(lateral)||along<=1||along>length+4)return 1;
  const coverage=Math.max(0,Math.min(1,(6-lateral)/2))*Math.min(1,(along-1)/3);
  return 1-.9*coverage;
 }
 return {desired,smooth,occluderOpacity};
});

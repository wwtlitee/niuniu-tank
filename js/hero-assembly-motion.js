/* Absolute, seekable pick-and-place choreography. Units are workshop metres. */
(function(root){
  const clamp=v=>Math.max(0,Math.min(1,v));
  const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*ease(t));
  function sample(piece,progress){
    const p=clamp(Number.isFinite(progress)?progress:0),side=piece.side||1;
    const [width,height]=piece.size,angle0=side*Math.PI/2;
    const source=[side*2.65,.78-width/2,.25];
    // The entire rotating envelope clears the finished vehicle before traversing.
    const cruise=4.25+Math.hypot(width,height)/2;
    const lifted=[source[0],cruise,source[2]],over=[piece.center[0],cruise,piece.center[2]];
    let position=source.slice(),angle=angle0;
    if(p>=.12&&p<.4)position=mix(source,lifted,(p-.12)/.28);
    else if(p>=.4&&p<.66){position=mix(lifted,over,(p-.4)/.26);angle=angle0*(1-ease((p-.4)/.26));}
    else if(p>=.66){position=mix(over,piece.center,(p-.66)/.2);angle=0;}
    if(p>=.86)position=piece.center.slice();
    const halfHeight=(Math.abs(Math.cos(angle))*height+Math.abs(Math.sin(angle))*width)/2;
    const halfWidth=(Math.abs(Math.cos(angle))*width+Math.abs(Math.sin(angle))*height)/2;
    const contact=piece.contact||[side*width/2,0,0];
    const local=[contact[0]+side*.22,contact[1],contact[2]];
    const grip=[position[0]+Math.cos(angle)*local[0]-Math.sin(angle)*local[1],position[1]+Math.sin(angle)*local[0]+Math.cos(angle)*local[1],position[2]+local[2]];
    const rest=[side*2.8,4.6,-3];
    const tool=p<.12?mix(rest,grip,p/.12):p>.9?mix(grip,rest,(p-.9)/.1):grip;
    const toolAngle=(angle-side*Math.PI/2)*(p>.9?1-ease((p-.9)/.1):1);
    return {position,angle,tool,toolAngle,halfWidth,bottom:position[1]-halfHeight,
      visible:p>=.12&&p<.86,gripped:p>=.12&&p<.9,installed:p>=.86,
      welding:p>=.86&&p<.9,hatch:p<.08?ease(p/.08):p<.4?1:p<.48?1-ease((p-.4)/.08):0};
  }
  const api={sample};if(typeof module==='object'&&module.exports)module.exports=api;else root.HeroAssemblyMotion=api;
})(typeof globalThis==='object'?globalThis:this);

/* Shared, bounded GPU particles. Rendering only; combat never depends on this module. */
"use strict";
(function(root){
  function createBatch(capacity,additive=false){
    const geometry=new THREE.BufferGeometry(),positions=new Float32Array(capacity*3),colors=new Float32Array(capacity*4),sizes=new Float32Array(capacity);
    for(const [key,array,width] of [['position',positions,3],['tint',colors,4],['size',sizes,1]])geometry.setAttribute(key,new THREE.BufferAttribute(array,width).setUsage(THREE.DynamicDrawUsage));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
      uniforms:{pixelScale:{value:600}},
      vertexShader:`attribute vec4 tint; attribute float size; uniform float pixelScale; varying vec4 vTint;
        void main(){vTint=tint;vec4 view=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*view;gl_PointSize=clamp(size*pixelScale/max(1.0,-view.z),1.0,128.0);}`,
      fragmentShader:`varying vec4 vTint;void main(){float r=length(gl_PointCoord-vec2(.5))*2.0;float a=(1.0-smoothstep(.08,1.0,r))*vTint.a;if(a<.008)discard;gl_FragColor=vec4(vTint.rgb,a);}`});
    const mesh=new THREE.Points(geometry,material),drawingSize=new THREE.Vector2();mesh.frustumCulled=false;mesh.renderOrder=additive?11:10;mesh.name=additive?'火光批次':'烟尘批次';
    mesh.onBeforeRender=(renderer,scene,camera)=>{renderer.getDrawingBufferSize(drawingSize);material.uniforms.pixelScale.value=drawingSize.y*camera.projectionMatrix.elements[5]*.5;};
    function set(i,p,c,size,alpha){const j=i*3,k=i*4;positions[j]=p.x;positions[j+1]=p.y;positions[j+2]=p.z;colors[k]=c.r;colors[k+1]=c.g;colors[k+2]=c.b;colors[k+3]=alpha;sizes[i]=size;}
    function commit(count){geometry.setDrawRange(0,count);mesh.visible=count>0;for(const a of Object.values(geometry.attributes))a.needsUpdate=true;}
    commit(0);return {mesh,set,commit,dispose(){geometry.dispose();material.dispose();}};
  }
  root.BattleEffects={createBatch};
})(window);

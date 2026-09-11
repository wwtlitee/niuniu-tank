/* Shared touch controls v8.2.0 — Unclecow */
(()=>{
 'use strict';
 function isMobileDevice({userAgent='',platform='',maxTouchPoints=0,coarse=false,fine=false,hover=false}={}){
  const handheld=/Android|iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1);
  return handheld&&coarse&&!fine&&!hover;
 }
 if(typeof module==='object'&&module.exports){module.exports=isMobileDevice;return;}
 if(!isMobileDevice({userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,
  coarse:matchMedia('(pointer:coarse)').matches,fine:matchMedia('(any-pointer:fine)').matches,hover:matchMedia('(any-hover:hover)').matches}))return;
 const mode=location.pathname.endsWith('racing.html')?'racing':location.pathname.endsWith('classic.html')?'classic':'survival';
 document.body.classList.add('mobile',`mobile-${mode}`);
 const root=document.createElement('div');root.id='touchControls';document.body.append(root);
 const held=new Set();
 function key(code,down){if(held.has(code)===down)return;down?held.add(code):held.delete(code);document.body.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));}
 function pulse(code){if(code==='TouchPlayer'){window.dispatchEvent(new Event('mobile-select-player'));return;}key(code,true);key(code,false);}
 function button(label,code,hold=false){const b=document.createElement('button');b.textContent=label;b.dataset.control=code;root.append(b);let owner=null;
  b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();if(owner!==null)return;owner=e.pointerId;b.setPointerCapture(owner);if(hold)key(code,true);else pulse(code);});
  const release=e=>{if(e.pointerId!==owner)return;owner=null;if(hold)key(code,false);};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,release);return b;
 }
 function stick(name,codes,onMove){const pad=document.createElement('div');pad.className='touchStick '+name;pad.setAttribute('aria-label',name==='drive'?'移动摇杆':'瞄准摇杆');pad.innerHTML='<i></i><span>'+(name==='drive'?'移动':'瞄准')+'</span>';root.append(pad);let owner=null;
  const move=e=>{const r=pad.getBoundingClientRect(),x=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/40)),y=Math.max(-1,Math.min(1,(e.clientY-r.top-r.height/2)/40));pad.firstChild.style.transform=`translate(${x*32}px,${y*32}px)`;codes.forEach((c,i)=>key(c,[y<-.25,y>.25,x<-.25,x>.25][i]));onMove?.(x,y);};
  pad.addEventListener('pointerdown',e=>{e.preventDefault();if(owner!==null)return;owner=e.pointerId;pad.setPointerCapture(owner);move(e);});pad.addEventListener('pointermove',e=>{if(e.pointerId===owner)move(e);});
  const release=e=>{if(e.pointerId!==owner)return;owner=null;codes.forEach(c=>key(c,false));pad.firstChild.style.transform='';onMove?.(0,0);};for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,release);
 }
 if(mode==='classic'){
  stick('drive',['KeyW','KeyS','KeyA','KeyD']);
  stick('aim',[],(x,y)=>{window.MobileAim={x,y,active:Math.hypot(x,y)>.25};key('Space',window.MobileAim.active);});button('空袭','KeyP');
 }else if(mode==='racing'){
  stick('drive',['KeyW','KeyS','KeyA','KeyD']);stick('aim',['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  button('开火','Space',true);button('漂移','ShiftLeft',true);button('道具','KeyE');button('切换','KeyQ');button('回正','KeyR');
 }else{
  button('基地','KeyB');button('科技','KeyT');button('部队','TouchPlayer');button('空袭','KeyQ');
  let command=false;const toggle=button('点选','TouchCommand');toggle.addEventListener('pointerdown',()=>{command=!command;toggle.textContent=command?'下达指令':'点选';toggle.setAttribute('aria-pressed',String(command));});
  const canvas=document.querySelector('#game canvas');let gesture=null;
  const mouse=(type,e,button,buttons)=>{const event=new MouseEvent(type,{bubbles:true,clientX:e.clientX,clientY:e.clientY,button,buttons});Object.defineProperty(event,'mobileTouch',{value:true});canvas.dispatchEvent(event);};
  canvas?.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||gesture)return;e.preventDefault();gesture={id:e.pointerId,x:e.clientX,y:e.clientY,pan:false};canvas.setPointerCapture(e.pointerId);});
  canvas?.addEventListener('pointermove',e=>{if(e.pointerId!==gesture?.id)return;if(!gesture.pan&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>9){gesture.pan=true;mouse('mousedown',{clientX:gesture.x,clientY:gesture.y},2,2);}if(gesture.pan)mouse('mousemove',e,2,2);});
  canvas?.addEventListener('pointerup',e=>{if(e.pointerId!==gesture?.id)return;if(gesture.pan)mouse('mouseup',e,2,0);else{mouse('mousemove',e,0,0);mouse('mousedown',e,command?2:0,command?2:1);mouse('mouseup',e,command?2:0,0);}gesture=null;});
  canvas?.addEventListener('pointercancel',()=>{gesture=null;window.dispatchEvent(new Event('blur'));});
  for(const [label,delta] of [['＋',-120],['－',120]]){const b=button(label,'Zoom'+label);b.addEventListener('pointerdown',()=>window.dispatchEvent(new WheelEvent('wheel',{deltaY:delta,bubbles:true})));}
 }
 button('暂停','Escape').classList.add('touchPause');
 const notice=document.createElement('div');notice.id='rotateHint';notice.textContent='横屏游玩，操作更舒适';document.body.append(notice);
 function clear(){for(const code of [...held])key(code,false);if(window.MobileAim)window.MobileAim.active=false;}
 addEventListener('blur',clear);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});addEventListener('resize',clear);
 function visibility(){const blocking=[...document.querySelectorAll('.overlay,.screen,#pause,#results')].some(el=>!el.hidden&&!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none');root.hidden=blocking;if(blocking)clear();}
 const observer=new MutationObserver(visibility);for(const el of document.querySelectorAll('.overlay,.screen,#pause,#results'))observer.observe(el,{attributes:true,attributeFilter:['class','hidden','style']});visibility();
 window.MobileControls={mode,clear,held:()=>[...held]};
})();

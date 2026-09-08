// 本地合成音景：按声部限流，所有声音经过统一动态压缩。
const soundscape={nextBeat:0,beat:0,lastCrowd:0,music:null,muted:false};
function soundGate(key,seconds,ac){
  const now=ac.currentTime,last=combatSfxLast.get(key);
  if(last!==undefined&&now-last<seconds)return false;
  combatSfxLast.set(key,now);return true;
}
function soundTone(ac,out,freq,end,duration,volume,when,type='sine'){
  const oscillator=ac.createOscillator(),gain=ac.createGain();oscillator.type=type;
  oscillator.frequency.setValueAtTime(freq,when);oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,end),when+duration);
  gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(volume,when+.015);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
  oscillator.connect(gain);gain.connect(out);oscillator.start(when);oscillator.stop(when+duration+.02);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
function playUpgradeChord(){
  const ac=audio();if(!ac||!soundGate('upgrade',.45,ac))return;
  [523,659,784,1046].forEach((frequency,i)=>beep(frequency,.14,'sine',.08,0,i*.07));
}
function playSpecialWeapon(kind){
  const ac=audio();if(!ac||!soundGate('weapon:'+kind,.12,ac))return;
  const when=ac.currentTime+.002,out=combatOutput(ac);
  if(kind==='laser'){
    soundTone(ac,out,1500,170,.22,.065,when,'triangle');
    soundTone(ac,out,740,90,.3,.045,when,'sine');
  }else if(kind==='incendiary'){
    combatNoiseBurst(ac,{when,duration:.65,volume:.15,highpass:180,lowpass:2100});
    soundTone(ac,out,110,45,.25,.09,when);
  }else if(kind==='grenade'){
    soundTone(ac,out,160,38,.35,.14,when,'triangle');
    combatNoiseBurst(ac,{when,duration:.42,volume:.13,highpass:60,lowpass:1700});
  }
}
function updateSurvivalSoundscape(){
  const active=ACTIVE_MODE.key==='survival'&&[STATE.PLAYING,STATE.PREP,STATE.BUILD,STATE.TECH,STATE.UPGRADE,STATE.GATE].includes(state)&&!document.hidden;
  if(!AC)return;const ac=AC;
  if(!soundscape.music){soundscape.music=ac.createGain();soundscape.music.gain.value=0;soundscape.music.connect(combatOutput(ac));}
  soundscape.music.gain.setTargetAtTime(active&&!soundscape.muted?.36:0,ac.currentTime,.15);
  if(!active||soundscape.muted||ac.state!=='running'){soundscape.nextBeat=ac.currentTime;return;}
  if(ac.currentTime>=soundscape.nextBeat){
    // 72 BPM，小调低音、五度持续音与稀疏战鼓。只向前排一拍，暂停不积压。
    const when=ac.currentTime+.02,step=soundscape.beat++%32,root=[55,49,43.65,51.91][Math.floor(step/8)];
    soundscape.nextBeat=ac.currentTime+60/72;
    if(step%4===0){soundTone(ac,soundscape.music,root,root,3.1,.07,when,'triangle');soundTone(ac,soundscape.music,root*1.5,root*1.5,3.1,.035,when);}
    soundTone(ac,soundscape.music,step%4===0?95:65,28,.28,step%4===0?.13:.055,when);
    if(step%2===1)soundTone(ac,soundscape.music,root*4,root*4,.6,.018,when,'triangle');
  }
  if(enemies.length>15&&ac.currentTime-soundscape.lastCrowd>4.5){
    soundscape.lastCrowd=ac.currentTime;
    for(let i=0;i<3;i++)soundTone(ac,combatOutput(ac),67+i*19,43+i*9,1.1,.018,ac.currentTime+i*.17,'sawtooth');
    combatNoiseBurst(ac,{duration:1.2,volume:.035,highpass:80,lowpass:500});
  }
}
addEventListener('pointerdown',()=>{if(AUDIO_DISABLED)return;const ac=audio();if(ac&&ac.state==='suspended')ac.resume().catch(()=>{});},{passive:true});
addEventListener('keydown',event=>{if(event.code==='KeyM'&&!event.repeat&&!/INPUT|TEXTAREA/.test(event.target?.tagName||'')){soundscape.muted=!soundscape.muted;toast(soundscape.muted?'战斗配乐已关闭 · M 开启':'战斗配乐已开启 · M 关闭');}});

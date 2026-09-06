/* Original synthesized chip audio; no Nintendo/Namco recordings or transcribed score. */
'use strict';
(function(root){
  const durations={start:2.4,clear:1.2,over:1.8,shoot:.12,brick:.13,steel:.18,hit:.22,explode:.72,pickup:.5,motor:.32,music:16};
  const tunes={start:[48,55,60,55,62,59,67,64],clear:[60,64,67,72],over:[55,53,48,43],pickup:[72,79,84,88]};
  const frequency=midi=>440*2**((midi-69)/12);
  const pulse=phase=>(phase%1<.25?1:-1);
  const triangle=phase=>1-4*Math.abs((phase%1)-.5);

  /** Deterministic PCM shared by runtime playback and offline audio validation. */
  function renderCue(name,sampleRate=22050){
    if(!durations[name])throw new Error('Unknown classic cue: '+name);
    if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>96000)throw new Error('Invalid sample rate');
    const duration=durations[name],data=new Float32Array(Math.ceil(duration*sampleRate));
    let seed=12345,phase=0;
    for(let i=0;i<data.length;i++){
      const t=i/sampleRate,progress=t/duration;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=(seed/4294967296)*2-1;
      let value=0;
      if(name==='music'){
        // Original minor-key patrol ostinato, intentionally not the Battle City melody.
        const beat=Math.floor(t/.25),noteTime=t%.25;
        const lead=[64,0,67,71,69,67,0,62,64,67,0,74,71,69,67,62];
        const note=lead[beat%lead.length],bass=[40,40,43,38][Math.floor(t/4)%4];
        value=(note?pulse(t*frequency(note))*.16*Math.max(0,1-noteTime/.23):0);
        value+=triangle(t*frequency(bass))*.23*(1-(t%.5)/.5);
        value+=noise*.07*Math.max(0,1-noteTime/.045);
      }else if(tunes[name]){
        const notes=tunes[name],step=duration/notes.length,j=Math.min(notes.length-1,Math.floor(t/step));
        const local=t%step,envelope=Math.min(1,local/.006)*Math.max(0,1-local/(step*.94));
        value=(pulse(t*frequency(notes[j]))*.32+triangle(t*frequency(notes[j]-12))*.16)*envelope;
      }else if(name==='motor'){
        value=(pulse(t*62)*.23+noise*.09)*(.65+.35*Math.sin(t*Math.PI*2*25));
      }else{
        const start={shoot:1250,brick:280,steel:2300,hit:180,explode:105}[name];
        phase+=(start*(1-progress)**2+35)/sampleRate;
        const noiseMix=name==='steel'?.15:name==='shoot'?.25:.85;
        value=(pulse(phase)*(1-noiseMix)+noise*noiseMix)*.66*(1-progress)**2;
      }
      const edge=Math.min(1,t/.004,(duration-t)/.008);
      data[i]=Math.max(-.95,Math.min(.95,value*Math.max(0,edge)));
    }
    return data;
  }

  /** One lazy AudioContext, bounded voices, independent classic-only preferences. */
  function create(){
    let context=null,master=null,muted=false,music=true,paused=false,failed=false;
    let musicSource=null,motorSource=null,mode='playing',pending='start';
    const buffers=new Map(),voices=new Set(),lastCue=new Map(),limit=24;
    try{const saved=JSON.parse(root.localStorage.getItem('tank.classic.audio')||'{}');muted=saved.muted===true;music=saved.music!==false;}catch{}
    function save(){try{root.localStorage.setItem('tank.classic.audio',JSON.stringify({muted,music}));}catch{}}
    function buffer(name){
      if(!buffers.has(name)){const pcm=renderCue(name);const b=context.createBuffer(1,pcm.length,22050);b.copyToChannel(pcm,0);buffers.set(name,b);}
      return buffers.get(name);
    }
    function stop(source){if(source){try{source.stop();}catch{}source.disconnect();}}
    function stopLoops(){stop(musicSource);stop(motorSource);musicSource=motorSource=null;}
    function source(name,gain,loop=false){
      const node=context.createBufferSource(),volume=context.createGain();
      node.buffer=buffer(name);node.loop=loop;volume.gain.value=gain;
      node.connect(volume);volume.connect(master);
      node.onended=()=>{node.disconnect();volume.disconnect();voices.delete(node);};
      node.start();return node;
    }
    function sync(){
      if(!context)return;
      master.gain.value=muted||paused?0:.6;
      const operation=muted||paused?context.suspend():context.resume();operation.catch(()=>{});
      if((!music||mode!=='playing'||muted)&&musicSource){stop(musicSource);musicSource=null;}
      if(music&&!muted&&!paused&&mode==='playing'&&!musicSource)musicSource=source('music',.27,true);
    }
    async function unlock(){
      if(failed)return false;
      try{
        if(!context){const Constructor=root.AudioContext||root.webkitAudioContext;if(!Constructor){failed=true;return false;}
          context=new Constructor();master=context.createGain();
          const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;
          master.connect(limiter);limiter.connect(context.destination);
        }
        sync();
        if(!muted&&!paused){await context.resume();if(pending){const cue=pending;pending=null;play(cue);}}
        return true;
      }catch{failed=true;return false;}
    }
    function play(name){
      if(!context||muted||paused||failed)return false;
      const time=context.currentTime;
      if(time-(lastCue.get(name)??-100)<.045||voices.size>=limit)return false;
      lastCue.set(name,time);const node=source(name,name==='explode'?.5:.42);voices.add(node);return true;
    }
    function setMode(next){
      mode=next;setMoving(false);
      const cue=next==='over'?'over':next==='upgrade'?'clear':'start';
      if(!context)pending=cue;else play(cue);sync();
    }
    function setMoving(moving){
      if(!context)return;
      if(!moving||muted||paused||mode!=='playing'){stop(motorSource);motorSource=null;return;}
      if(!motorSource)motorSource=source('motor',.22,true);
    }
    function reset(){
      stopLoops();for(const node of voices)stop(node);voices.clear();lastCue.clear();
      mode='playing';pending=context?null:'start';paused=false;sync();
    }
    function setPaused(value){paused=!!value;if(paused)setMoving(false);sync();}
    function setMuted(value){muted=!!value;if(muted)setMoving(false);save();sync();}
    function setMusic(value){music=!!value;save();sync();}
    function dispose(){reset();stopLoops();if(context)context.close().catch(()=>{});context=null;buffers.clear();}
    return {unlock,play,setMode,setMoving,reset,setPaused,setMuted,setMusic,dispose,
      inspect:()=>({context:context?.state||'locked',muted,music,paused,failed,voices:voices.size,limit,mode})};
  }
  const api={renderCue,create};if(typeof module!=='undefined')module.exports=api;root.ClassicAudio=api;
})(typeof window!=='undefined'?window:globalThis);

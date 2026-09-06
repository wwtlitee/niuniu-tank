'use strict';
// Render the same runtime synthesizer to a listening reference, not a bundled recording.
const fs=require('node:fs'),path=require('node:path');
const {renderCue}=require('../js/classic/classic-audio.js');
const rate=22050,mix=new Float32Array(rate*22);
function add(name,start,gain){const pcm=renderCue(name,rate),offset=Math.floor(start*rate);for(let i=0;i<pcm.length&&i+offset<mix.length;i++)mix[i+offset]+=pcm[i]*gain;}
add('start',0,.6);add('music',3,.35);
['shoot','brick','steel','hit','explode','pickup','clear','over'].forEach((cue,i)=>add(cue,4+i*2,.65));
const wav=Buffer.alloc(44+mix.length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(mix.length*2,40);
let peak=0;for(let i=0;i<mix.length;i++){peak=Math.max(peak,Math.abs(mix[i]));wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,mix[i]))*32767),44+i*2);}
const dest=path.resolve('output/classic-v6.21.0/audio-preview.wav');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,wav);console.log(JSON.stringify({dest,seconds:22,peak,clipped:peak>1}));

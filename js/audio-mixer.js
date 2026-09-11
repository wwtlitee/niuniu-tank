/* =====================================================================
   js/audio-mixer.js —— 三总线音频混音 + 持久化
   sfx → limiter → master → destination
   music → master → destination
   对外暴露：
     - AudioMixer.init(ac)                        在 audio() 第一次返回 AC 后调用
     - AudioMixer.bus(name)                       返回 GainNode（master/sfx/music）
     - AudioMixer.setVolume(channel, 0..1)
     - AudioMixer.getVolume(channel)
     - AudioMixer.setMuted(boolean)
     - AudioMixer.toggleMuted()                   主静音切换，返回新状态
     - AudioMixer.isMuted()
     - AudioMixer.sfxOutput(ac)                   旧 combatOutput API 兼容入口
     - AudioMixer.musicOutput(ac)                 给 BGM 系统用
     - AudioMixer.applySettings({master,sfx,music,muted})  从 localStorage 一次性灌入
     - AudioMixer.onChange(cb)                    UI 订阅（音量/静音变更时触发）
   持久化键：tank3d.audio.v1
   ===================================================================== */
"use strict";

const AudioMixer = (() => {
  const STORAGE_KEY = "tank3d.audio.v1";
  const DEFAULTS = Object.freeze({ master: 0.85, sfx: 0.95, music: 0.55, muted: false });
  const state = { master: DEFAULTS.master, sfx: DEFAULTS.sfx, music: DEFAULTS.music, muted: DEFAULTS.muted };
  let _ac = null;
  let _master = null, _sfx = null, _music = null, _limiter = null;
  const _listeners = new Set();
  const noiseCaches=new WeakMap();
  function noiseBuffer(ac,duration,decay=1.7){
    let cache=noiseCaches.get(ac);if(!cache){cache=new Map();noiseCaches.set(ac,cache);}
    const length=Math.max(1,Math.floor(ac.sampleRate*duration)),key=length+':'+decay;
    if(cache.has(key))return cache.get(key);
    const buffer=ac.createBuffer(1,length,ac.sampleRate),data=buffer.getChannelData(0);let seed=(length*2654435761)>>>0;
    for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*Math.pow(1-i/length,decay);}
    if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,buffer);return buffer;
  }

  function _emit() { _listeners.forEach((cb) => { try { cb(_snapshot()); } catch (_) {} }); }
  function _snapshot() { return { master: state.master, sfx: state.sfx, music: state.music, muted: state.muted }; }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _snapshot();
      const obj = JSON.parse(raw);
      return {
        master: _clamp(obj.master, 0, 1, state.master),
        sfx: _clamp(obj.sfx, 0, 1, state.sfx),
        music: _clamp(obj.music, 0, 1, state.music),
        muted: !!obj.muted,
      };
    } catch (_) { return _snapshot(); }
  }
  function saveToStorage() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_snapshot())); } catch (_) {}
  }
  function _clamp(v, lo, hi, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }
  function _applyToBus(channel) {
    if (!_ac) return;
    const target = channel === "master" ? _master : channel === "sfx" ? _sfx : channel === "music" ? _music : null;
    if (!target) return;
    const v = state.muted ? 0 : state[channel];
    target.gain.setTargetAtTime(v, _ac.currentTime, 0.04);
  }

  function init(ac) {
    if (_ac) return;
    _ac = ac;
    // 重建总线（master → destination）；sfx 串 limiter；music 直通
    _master = ac.createGain(); _master.gain.value = state.muted ? 0 : state.master;
    _limiter = ac.createDynamicsCompressor();
    _limiter.threshold.value = -12; _limiter.knee.value = 16; _limiter.ratio.value = 8;
    _limiter.attack.value = 0.003; _limiter.release.value = 0.22;
    _sfx = ac.createGain(); _sfx.gain.value = state.muted ? 0 : state.sfx;
    _music = ac.createGain(); _music.gain.value = state.muted ? 0 : state.music;
    _sfx.connect(_limiter); _limiter.connect(_master);
    _music.connect(_master);
    _master.connect(ac.destination);
  }

  function bus(name) {
    if (!_ac) return null;
    if (name === "master") return _master;
    if (name === "sfx") return _sfx;
    if (name === "music") return _music;
    return null;
  }

  function setVolume(channel, v) {
    if (!["master", "sfx", "music"].includes(channel)) return;
    state[channel] = _clamp(v, 0, 1, state[channel]);
    _applyToBus(channel);
    saveToStorage(); _emit();
  }
  function getVolume(channel) {
    return state[channel];
  }

  function setMuted(m) {
    state.muted = !!m;
    ["master", "sfx", "music"].forEach(_applyToBus);
    saveToStorage(); _emit();
  }
  function toggleMuted() { setMuted(!state.muted); return state.muted; }
  function isMuted() { return state.muted; }

  /** 旧 engine.js 调用方式：`someSource.connect(combatOutput(ac))`，所以返回 GainNode 即可。 */
  function sfxOutput() { return _sfx; }
  function musicOutput() { return _music; }

  function applySettings(s) {
    if (!s) return;
    if (typeof s.master === "number") state.master = _clamp(s.master, 0, 1, state.master);
    if (typeof s.sfx === "number") state.sfx = _clamp(s.sfx, 0, 1, state.sfx);
    if (typeof s.music === "number") state.music = _clamp(s.music, 0, 1, state.music);
    if (typeof s.muted === "boolean") state.muted = s.muted;
    if (_ac) {
      _master.gain.value = state.muted ? 0 : state.master;
      _sfx.gain.value = state.muted ? 0 : state.sfx;
      _music.gain.value = state.muted ? 0 : state.music;
    }
    saveToStorage(); _emit();
  }

  function onChange(cb) { _listeners.add(cb); return () => _listeners.delete(cb); }

  // 启动时从 localStorage 加载（但不应用到总线，因为 AC 还没创建）
  const initial = loadFromStorage();
  state.master = initial.master; state.sfx = initial.sfx; state.music = initial.music; state.muted = initial.muted;

  return {
    init, bus, setVolume, getVolume, setMuted, toggleMuted, isMuted,
    sfxOutput, musicOutput, applySettings, onChange,
    STORAGE_KEY, DEFAULTS, noiseBuffer,
  };
})();

if (typeof window !== "undefined") window.AudioMixer = AudioMixer;

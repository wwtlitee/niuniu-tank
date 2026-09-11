/* v8.2.0 · Recorded effects. Decode once, bound voices, reserve room for the horde. */
(function (root) {
  'use strict';
  const entry = (files, gain, gap, priority = 1) => ({
    files: files.split(','),
    gain,
    gap,
    priority,
  });
  const SOUNDS = Object.freeze({
    small: entry('shotgun', 0.24, 0.1),
    medium: entry('cannon', 0.265, 0.13),
    large: entry('heavy-cannon', 0.29, 0.18),
    huge: entry('heavy-cannon', 0.31, 0.3),
    explosion: entry('explosion', 0.25, 0.18),
    bigboom: entry('explosion-heavy', 0.31, 0.35),
    impact: entry('impact', 0.13, 0.12),
    gate: entry('gate', 0.215, 0.24),
    laser: entry('laser', 0.2, 0.14),
    incendiary: entry('flame', 0.23, 0.24),
    grenade: entry('grenade', 0.26, 0.2),
    groan: entry('groan-1,groan-2,groan-3,groan-4', 0.4, 12, 3),
    crowd: entry('crowd', 0.52, 6, 3),
    zombie: entry('zombie-attack', 0.2, 8, 2),
    select: entry('ui-select', 0.22, 0.09, 2),
    upgrade: entry('ui-upgrade', 0.44, 0.55, 2),
    cancel: entry('ui-cancel', 0.25, 0.2, 2),
    build: entry('ui-build', 0.4, 0.22, 2),
    complete: entry('ui-upgrade', 0.5, 0.5, 2),
    pickup: entry('ui-pickup', 0.21, 0.35, 2),
    wave: entry('crowd', 0.65, 5, 3),
    boss: entry('groan-3', 0.65, 5, 3),
  });
  const buffers = new Map(),
    pending = new Map(),
    last = new Map(),
    variants = new Map(),
    voices = new Set(),
    counts = {};
  let ac = null,
    out = null,
    paused = false,
    failed = 0,
    warmup = null;
  const MAX_VOICES = 20;
  const VOCAL_LIMITS = { groan: 2.4, zombie: 0.85, crowd: 2.8, wave: 2.8, boss: 3.2 };
  let vocalAfter = 0;
  const audibility = (distance) => (distance <= 30 ? 1 : Math.max(0, 1 - (distance - 30) / 40));
  async function load(file) {
    if (buffers.has(file)) return buffers.get(file);
    if (pending.has(file)) return pending.get(file);
    const task = (async () => {
      try {
        const response = await fetch('assets/audio/sfx/' + file + '.ogg');
        if (!response.ok) throw Error(response.status);
        const buffer = await ac.decodeAudioData(await response.arrayBuffer());
        buffers.set(file, buffer);
        return buffer;
      } catch (_) {
        failed++;
        return null;
      }
    })();
    pending.set(file, task);
    return task;
  }
  function bind(context, output) {
    if (!context || ac) return;
    ac = context;
    out = output || context.destination;
  }
  function preload() {
    if (!ac) return Promise.resolve();
    return warmup || (warmup = preloadAll());
  }
  async function preloadAll() {
    if (!ac) return;
    const files = [...new Set(Object.values(SOUNDS).flatMap((def) => def.files))];
    // Keep only two decodes in flight; no decoding or buffer generation in combat callbacks.
    let cursor = 0;
    await Promise.all(
      [0, 1].map(async () => {
        while (cursor < files.length) await load(files[cursor++]);
      }),
    );
  }
  function dispose(voice) {
    if (!voices.delete(voice)) return;
    voice.src.onended = null;
    voice.src.disconnect();
    voice.gain.disconnect();
    voice.pan?.disconnect();
  }
  function stop(voice) {
    try {
      voice.src.stop();
    } catch (_) {}
    dispose(voice);
  }
  function play(key, options = {}) {
    const def = SOUNDS[key];
    if (!ac || ac.state !== 'running' || paused || !def || root.AudioMixer?.isMuted()) return false;
    const now = ac.currentTime;
    const vocal = Object.hasOwn(VOCAL_LIMITS, key);
    if (vocal && (now < vocalAfter || [...voices].some((voice) => voice.vocal))) return false;
    if (now - (last.get(key) ?? -Infinity) < def.gap) return false;
    const index = variants.get(key) || 0,
      file = def.files[index % def.files.length],
      buffer = buffers.get(file);
    if (!buffer) return false; // A missed transient never gets replayed late after loading.
    if (voices.size >= (def.priority === 3 ? MAX_VOICES : MAX_VOICES - 3)) {
      const victim = [...voices].find((v) => v.priority < def.priority);
      if (!victim) return false;
      stop(victim);
    }
    const attenuation = audibility(options.distance || 0);
    if (!attenuation) return false;
    last.set(key, now);
    variants.set(key, index + 1);
    const src = ac.createBufferSource(),
      gain = ac.createGain(),
      pan = ac.createStereoPanner?.();
    src.buffer = buffer;
    src.playbackRate.value = options.rate || 0.97 + (index % 3) * 0.03;
    gain.gain.value = def.gain * attenuation * (options.volume ?? 1);
    src.connect(gain);
    if (pan) {
      pan.pan.value = Math.max(-0.75, Math.min(0.75, options.pan || 0));
      gain.connect(pan);
      pan.connect(out);
    } else gain.connect(out);
    const voice = { src, gain, pan, priority: def.priority, vocal };
    voices.add(voice);
    src.onended = () => dispose(voice);
    if (vocal) {
      const seconds = Math.min((buffer.duration || 1) / src.playbackRate.value, VOCAL_LIMITS[key]);
      const volume = gain.gain.value;
      gain.gain.setValueAtTime?.(0, now);
      gain.gain.linearRampToValueAtTime?.(volume, now + 0.02);
      gain.gain.setValueAtTime?.(volume, now + Math.max(0.02, seconds - 0.12));
      gain.gain.linearRampToValueAtTime?.(0, now + seconds);
      src.start(now, 0, seconds * src.playbackRate.value);
      vocalAfter = now + seconds + 4;
    } else src.start();
    counts[key] = (counts[key] || 0) + 1;
    if (def.priority === 3) root.BGMSystem?.duck(1.8);
    return true;
  }
  function setPaused(value) {
    paused = !!value;
    if (paused) {
      for (const voice of [...voices]) stop(voice);
      last.clear();
    }
  }
  const api = {
    SOUNDS,
    bind,
    preload,
    play,
    setPaused,
    audibility,
    getStatus: () => ({
      source: 'recorded',
      ready: buffers.size,
      loading: pending.size - buffers.size - failed,
      failed,
      voices: voices.size,
      maxVoices: MAX_VOICES,
      played: { ...counts },
    }),
  };
  root.SurvivalSoundBank = api;
  if (typeof module === 'object') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);

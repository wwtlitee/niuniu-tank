/* v6.37.0 · Streamed, authored score. Two bounded players; never synthesize music. */
'use strict';
const BGMSystem = (() => {
  let ac = null,
    out = null,
    tracks = [],
    byId = new Map(),
    players = [],
    active = null,
    slot = null,
    id = null,
    manual = null,
    context = { mode: 'menu', sub: 'menu' },
    want = false,
    revision = 0,
    previewing = null,
    previewRestore = null,
    duckUntil = 0,
    lastLevel = -1,
    error = null;
  function bind(context) {
    if (ac === context) return;
    ac = context;
    out = window.AudioMixer?.musicOutput() || ac.destination;
  }
  function configure(list) {
    tracks = Array.isArray(list) ? list.slice() : [];
    byId = new Map(tracks.map((t) => [t.id, t]));
  }
  function getSlotTrackId(key) {
    return tracks.find((t) => t.slot === key)?.id || null;
  }
  function makePlayer() {
    const media = new Audio();
    media.preload = 'auto';
    media.loop = true;
    const source = ac.createMediaElementSource(media),
      gain = ac.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(out);
    const player = { media, source, gain, url: null, timer: null };
    media.addEventListener('error', () => {
      if (player === active) error = '音乐暂时无法播放';
    });
    players.push(player);
    return player;
  }
  function level() {
    return ac && ac.currentTime < duckUntil ? 0.24 : 0.43;
  }
  function applyLevel() {
    if (!ac || !active) return;
    const value = level();
    if (value !== lastLevel) {
      active.gain.gain.setTargetAtTime(value, ac.currentTime, 0.4);
      lastLevel = value;
    }
  }
  function retire(player) {
    if (!player) return;
    clearTimeout(player.timer);
    player.gain.gain.cancelScheduledValues(ac.currentTime);
    player.gain.gain.setTargetAtTime(0, ac.currentTime, 0.24);
    player.timer = setTimeout(() => {
      if (active !== player) {
        player.media.pause();
        player.gain.gain.value = 0;
      }
    }, 1400);
  }
  async function start(trackId, key) {
    if (!ac || !out) return;
    const track = byId.get(trackId);
    slot = key;
    id = trackId;
    want = true;
    if (!track?.url) {
      error = '音乐暂时无法播放';
      return;
    }
    if (active?.url === track.url) {
      applyLevel();
      if (!active.media.paused) return;
      try {
        await active.media.play();
        error = null;
      } catch (_) {
        error = '点击战场开启声音';
      }
      return;
    }
    const ticket = ++revision,
      previous = active;
    const next = players.find((p) => p !== previous) || (players.length < 2 ? makePlayer() : players[0]);
    clearTimeout(next.timer);
    next.media.pause();
    next.gain.gain.cancelScheduledValues(ac.currentTime);
    next.gain.gain.value = 0;
    if (next.url !== track.url) {
      next.url = track.url;
      next.media.src = track.url;
    }
    active = next;
    lastLevel = -1;
    retire(previous);
    try {
      await next.media.play();
      if (ticket !== revision) return;
      if (!want) {
        if (next === active) next.media.pause();
        return;
      }
      error = null;
      applyLevel();
    } catch (_) {
      if (ticket === revision) error = '点击战场开启声音';
    }
  }
  function resolveSlot(c) {
    return c.mode === 'menu'
      ? 'menu'
      : ['prep', 'boss', 'victory', 'defeat'].includes(c.sub)
        ? c.sub
        : 'battle';
  }
  function setContext(next) {
    context = next;
    const key = resolveSlot(next);
    if (previewing) {
      applyLevel();
      return;
    }
    const track = manual || getSlotTrackId(key);
    if (want && key === slot && track === id) {
      applyLevel();
      return;
    }
    return start(track, key);
  }
  function setManualTrack(trackId) {
    manual = byId.has(trackId) ? trackId : null;
    previewing = null;
    previewRestore = null;
    return start(manual || getSlotTrackId(resolveSlot(context)), resolveSlot(context));
  }
  function pause() {
    revision++;
    want = false;
    for (const p of players) {
      clearTimeout(p.timer);
      p.media.pause();
      p.gain.gain.cancelScheduledValues(ac.currentTime);
      p.gain.gain.value = 0;
    }
    lastLevel = -1;
  }
  function resume() {
    return start(previewing || manual || getSlotTrackId(resolveSlot(context)), resolveSlot(context));
  }
  function preview(trackId) {
    if (!byId.has(trackId)) return;
    if (!previewing) previewRestore = { want };
    previewing = trackId;
    return start(trackId, byId.get(trackId).slot);
  }
  function stopPreview() {
    if (!previewing) return;
    const restore = previewRestore;
    previewing = null;
    previewRestore = null;
    if (restore?.want) return start(manual || getSlotTrackId(resolveSlot(context)), resolveSlot(context));
    pause();
  }
  function duck(seconds = 1.8) {
    if (ac) {
      duckUntil = ac.currentTime + seconds;
      applyLevel();
    }
  }
  return {
    bind,
    configure,
    setContext,
    setManualTrack,
    pause,
    resume,
    preview,
    stopPreview,
    duck,
    getTracks: () => tracks.slice(),
    getCurrentTrackId: () => id,
    getSlotTrackId,
    getStatus: () => ({
      slot,
      trackId: id,
      usingSample: !!active && !active.media.paused,
      usingSynth: false,
      streaming: true,
      wantPlaying: want,
      acState: ac?.state || null,
      players: players.length,
      ready: active?.media.readyState >= 3,
      error,
    }),
  };
})();
if (typeof window !== 'undefined') window.BGMSystem = BGMSystem;

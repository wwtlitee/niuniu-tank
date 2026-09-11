'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
function sandbox() {
  const media = [],
    timers = new Map();
  let timerId = 0;
  const ctx = { currentTime: 0, state: 'running', destination: {} };
  const gain = () => ({
    value: 0,
    setTargetAtTime(v) {
      this.value = v;
    },
    cancelScheduledValues() {},
  });
  const node = () => ({ gain: gain(), connect() {}, disconnect() {} });
  Object.assign(ctx, { createGain: node, createMediaElementSource: node });
  class FakeAudio {
    constructor() {
      this.paused = true;
      this.readyState = 4;
      this.src = '';
      this.plays = 0;
      media.push(this);
    }
    addEventListener() {}
    play() {
      this.paused = false;
      this.plays++;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }
  const s = {
    Audio: FakeAudio,
    console,
    setTimeout(fn) {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  s.window = s;
  vm.createContext(s);
  return {
    s,
    ctx,
    media,
    timers,
    read(file) {
      vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), s);
    },
  };
}
test('Boss、战时建造与暂停恢复选择正确音景', () => {
  const t = sandbox(),
    calls = [];
  t.s.BGMSystem = {
    getStatus: () => ({ acState: 'running' }),
    setContext: (x) => calls.push(x.sub),
    pause: () => calls.push('pause'),
  };
  t.read('bgm-controller.js');
  t.s.BGMBridge.tick(1, 'survival', { bossAlive: true, wave: 10, intensity: 0.8 });
  assert.equal(calls.at(-1), 'boss');
  t.s.BGMBridge.tick(5, 'survival', { bossAlive: true, wave: 10 });
  assert.equal(calls.at(-1), 'boss');
  t.s.BGMBridge.tick(3, 'survival', {});
  assert.equal(calls.at(-1), 'pause');
  t.s.BGMBridge.tick(1, 'survival', { bossAlive: false, wave: 10 });
  assert.equal(calls.at(-1), 'battle');
});

function configured() {
  const t = sandbox();
  t.read('bgm-system.js');
  const b = t.s.BGMSystem;
  b.configure([
    { id: 'prep', slot: 'prep', url: 'prep.ogg' },
    { id: 'battle', slot: 'battle', url: 'battle.ogg' },
    { id: 'boss', slot: 'boss', url: 'battle.ogg' },
  ]);
  return { ...t, b };
}
test('音乐等待解锁，最多两个流媒体播放器，同文件战斗与首领切换不重启', async () => {
  const t = configured();
  await t.b.setContext({ mode: 'survival', sub: 'battle' });
  assert.equal(t.b.getStatus().slot, null);
  t.b.bind(t.ctx);
  await t.b.setContext({ mode: 'survival', sub: 'battle' });
  assert.equal(t.b.getStatus().usingSample, true);
  assert.equal(t.b.getStatus().usingSynth, false);
  const first = t.media[0];
  await t.b.setContext({ mode: 'survival', sub: 'boss' });
  assert.equal(first.plays, 1);
  for (let i = 0; i < 20; i++) await t.b.setContext({ mode: 'survival', sub: i % 2 ? 'prep' : 'battle' });
  assert.equal(t.media.length, 2);
  t.b.pause();
  assert.ok(t.media.every((m) => m.paused));
  await t.b.resume();
  assert.equal(t.b.getStatus().usingSample, true);
});
test('手动曲目、试听停止和自动恢复遵守用户选择', async () => {
  const t = configured();
  t.b.bind(t.ctx);
  await t.b.setContext({ mode: 'survival', sub: 'battle' });
  await t.b.setManualTrack('prep');
  assert.equal(t.b.getStatus().trackId, 'prep');
  await t.b.preview('boss');
  await t.b.setContext({ mode: 'survival', sub: 'battle' });
  assert.equal(t.b.getStatus().trackId, 'boss');
  await t.b.stopPreview();
  assert.equal(t.b.getStatus().trackId, 'prep');
  await t.b.setManualTrack(null);
  assert.equal(t.b.getStatus().trackId, 'battle');
  t.b.pause();
  await t.b.preview('prep');
  await t.b.stopPreview();
  assert.equal(t.b.getStatus().wantPlaying, false);
  assert.ok(t.media.every((m) => m.paused));
});
test('暂停能恢复准备阶段，打开设置不消耗准备时间', () => {
  const source = fs.readFileSync(path.join(root, 'js/engine.js'), 'utf8'),
    snippet = source.match(/function setPause\(p\)\{[\s\S]*?\n\}/)[0];
  const s = {
    state: 7,
    pauseReturnState: 1,
    STATE: { PLAYING: 1, PREP: 7, PAUSED: 3 },
    ACTIVE_MODE: { key: 'survival' },
    saveSurvivalSnapshot() {},
    $: () => ({ classList: { add() {}, remove() {} } }),
    performance: { now: () => 10 },
    lastT: 0,
  };
  vm.createContext(s);
  vm.runInContext(snippet, s);
  s.setPause(true);
  assert.equal(s.state, 3);
  s.setPause(false);
  assert.equal(s.state, 7);
});

test('过期的异步播放完成不能暂停刚恢复的同一播放器', async () => {
  const t = configured();
  let resolveOld;
  const proto = t.s.Audio.prototype,
    old = proto.play;
  proto.play = function () {
    old.call(this);
    return new Promise((r) => (resolveOld = r));
  };
  t.b.bind(t.ctx);
  const pending = t.b.setContext({ mode: 'survival', sub: 'battle' });
  t.b.pause();
  proto.play = old;
  await t.b.resume();
  resolveOld();
  await pending;
  assert.equal(t.b.getStatus().usingSample, true);
});

'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
test('生存使用真实素材声库，所有引用都可发布', () => {
  const source = fs.readFileSync(path.join(root, 'js/survival-sound-bank.js'), 'utf8');
  const s = { window: {}, module: { exports: {} } };
  vm.runInNewContext(source, s);
  const bank = s.module.exports;
  assert.ok(Object.keys(bank.SOUNDS).length >= 20);
  for (const definition of Object.values(bank.SOUNDS))
    for (const file of definition.files)
      assert.ok(fs.statSync(path.join(root, 'assets/audio/sfx', file + '.ogg')).size > 500, file);
  assert.equal(bank.audibility(24), 1);
  assert.ok(bank.audibility(50) > 0.25);
  assert.equal(bank.audibility(100), 0);
  assert.ok(!source.includes('createOscillator'));
});
test('所有可玩入口接入统一图标和指挥界面', () => {
  for (const file of ['index.html', 'classic.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /js\/ui-icons.js/);
    assert.match(html, /css\/command-ui.css/);
    assert.doesNotMatch(html, /\p{Extended_Pictographic}/u, file);
  }
});

test('声库只解码一次，保留尸群声部并限制极端连发', async () => {
  let fetched = 0,
    decoded = 0;
  const ac = {
    currentTime: 0,
    state: 'running',
    destination: {},
    decodeAudioData: async () => {
      decoded++;
      return {};
    },
  };
  const node = () => ({
    gain: { value: 1 },
    playbackRate: { value: 1 },
    pan: { value: 0 },
    connect() {},
    disconnect() {},
    start() {},
    stop() {
      this.onended?.();
    },
  });
  Object.assign(ac, { createGain: node, createBufferSource: node, createStereoPanner: node });
  const s = {
    window: { AudioMixer: { isMuted: () => false } },
    module: { exports: {} },
    fetch: async () => {
      fetched++;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/survival-sound-bank.js'), 'utf8'), s);
  const bank = s.module.exports;
  bank.bind(ac);
  await Promise.all([bank.preload(), bank.preload()]);
  assert.equal(fetched, 21);
  assert.equal(decoded, 21);
  for (let i = 0; i < 40; i++) {
    ac.currentTime++;
    bank.play('medium');
  }
  assert.equal(bank.getStatus().voices, 17);
  ac.currentTime += 2;
  assert.equal(bank.play('groan'), true);
  ac.currentTime += 12;
  assert.equal(bank.play('groan'), false, '前一声还在播放时不能叠加另一声低吼');
  assert.equal(bank.play('boss'), false, '丧尸声部共享单声限制');
  assert.equal(bank.getStatus().voices, 18);
  assert.equal(bank.play('laser'), false);
  assert.equal(decoded, 21);
  bank.setPaused(true);
  assert.equal(bank.getStatus().voices, 0);
  assert.equal(bank.play('groan'), false);
  bank.setPaused(false);
  assert.equal(bank.play('upgrade'), true);
  for (let i = 0; i < 100; i++) assert.equal(bank.play('upgrade'), false);
  assert.equal(bank.getStatus().played.upgrade, 1);
});

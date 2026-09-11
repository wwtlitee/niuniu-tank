'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
function scene(count = 24) {
  const played = [],
    s = {
      Math: Object.create(Math),
      ACTIVE_MODE: { key: 'survival' },
      STATE: { PLAYING: 1, PREP: 7, BUILD: 5, TECH: 8, UPGRADE: 2, GATE: 9, PAUSED: 3 },
      state: 1,
      document: { hidden: false, addEventListener() {} },
      addEventListener() {},
      AC: { state: 'running', currentTime: 0 },
      AudioMixer: { isMuted: () => false },
      game: { wave: 1 },
      camFocus: { x: 0, z: 0 },
      isPositionVisible: () => true,
      enemies: Array.from({ length: count }, (_, id) => ({
        id,
        alive: true,
        group: { position: { x: id % 4, z: 2 } },
      })),
      SurvivalSoundBank: {
        setPaused() {},
        audibility: (d) => (d < 70 ? 1 : 0),
        play: (key, opts) => {
          played.push({ key, time: s.AC.currentTime, opts });
          return true;
        },
      },
    };
  s.Math.random = () => 0;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js/survival-audio.js'), 'utf8'), s);
  return {
    s,
    played,
    tick(t) {
      s.AC.currentTime = t;
      vm.runInContext('updateSurvivalSoundscape()', s);
    },
  };
}
test('三分钟驻留尸群不循环播放进攻号叫，低吼之间保留安静间隔', () => {
  const t = scene();
  for (let i = 0; i < 1800; i++) t.tick(i / 10);
  const groans = t.played.filter((p) => p.key === 'groan');
  assert.ok(groans.length > 0 && groans.length <= 15, `三分钟低吼次数 ${groans.length}`);
  for (let i = 1; i < groans.length; i++) assert.ok(groans[i].time - groans[i - 1].time >= 12);
  assert.equal(t.played.filter((p) => p.key === 'crowd').length, 0, '尸群进攻声只随波次触发');
  assert.equal(t.played.filter((p) => p.key === 'wave').length, 1);
});
test('独留一只僵尸不会持续打呼，切出画面不再听见远处低吼', () => {
  const t = scene(1);
  for (let i = 0; i < 180; i++) t.tick(i);
  assert.ok(t.played.filter((p) => p.key === 'groan').length <= 5);
  t.s.isPositionVisible = () => false;
  const before = t.played.length;
  for (let i = 180; i < 300; i++) t.tick(i);
  assert.equal(t.played.length, before);
});
test('暂停与恢复不重置低吼间隔，重启波次仍有一次进攻提示', () => {
  const t = scene();
  for (let i = 0; i < 40; i++) {
    t.s.state = i % 2 ? 3 : 1;
    t.tick(i);
  }
  const calls = t.played.filter((p) => p.key === 'groan');
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].time - calls[i - 1].time >= 12);
  t.s.state = 1;
  t.s.game.wave = 0;
  t.tick(41);
  t.s.game.wave = 1;
  t.tick(42);
  assert.equal(t.played.filter((p) => p.key === 'wave').length, 2);
});

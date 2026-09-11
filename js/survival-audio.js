/* v8.2.0 · Audible human recordings and a bounded combat soundscape. */
const soundscape = { nextGroan: 0, lastWave: 0, active: false, speakers: new WeakMap() };
function soundGate(key, seconds, ac) {
  const now = ac.currentTime,
    last = combatSfxLast.get(key);
  if (last !== undefined && now - last < seconds) return false;
  combatSfxLast.set(key, now);
  return true;
}
function playUpgradeChord() {
  return SurvivalSoundBank.play('upgrade');
}
function playSpecialWeapon(kind) {
  return SurvivalSoundBank.play(kind);
}
function updateSurvivalSoundscape() {
  const active =
    ACTIVE_MODE?.key === 'survival' &&
    [STATE.PLAYING, STATE.PREP, STATE.BUILD, STATE.TECH, STATE.UPGRADE, STATE.GATE].includes(
      state,
    ) &&
    !document.hidden;
  if (active !== soundscape.active) {
    soundscape.active = active;
    SurvivalSoundBank.setPaused(!active);
    soundscape.nextGroan = Math.max(
      soundscape.nextGroan,
      (AC?.currentTime || 0) + 4 + Math.random() * 4,
    );
  }
  if (!active || !AC || AC.state !== 'running' || AudioMixer.isMuted()) return;
  const now = AC.currentTime;
  if (game.wave !== soundscape.lastWave) {
    soundscape.lastWave = game.wave;
    if (game.wave > 0) SurvivalSoundBank.play(game.wave % 5 === 0 ? 'boss' : 'wave');
  }
  if (now < soundscape.nextGroan) return;
  let closest = null,
    minDistance = Infinity;
  for (const enemy of enemies) {
    if (!enemy?.group || !enemy.alive || enemy.dying) continue;
    if (!isPositionVisible(enemy.group.position) || (soundscape.speakers.get(enemy) || 0) > now)
      continue;
    const d = Math.hypot(enemy.group.position.x - camFocus.x, enemy.group.position.z - camFocus.z);
    if (d < 50 && d < minDistance) {
      minDistance = d;
      closest = enemy;
    }
  }
  if (!closest || !SurvivalSoundBank.audibility(minDistance)) {
    soundscape.nextGroan = now + 2;
    return;
  }
  const pan = (closest.group.position.x - camFocus.x) / 45;
  if (
    SurvivalSoundBank.play('groan', { distance: minDistance, pan, rate: closest.boss ? 0.82 : 1 })
  ) {
    soundscape.nextGroan = now + 12 + Math.random() * 10;
    soundscape.speakers.set(closest, now + 40 + Math.random() * 15);
  } else soundscape.nextGroan = now + 3;
}
function unlockSurvivalAudio() {
  if (AUDIO_DISABLED) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  SurvivalSoundBank.preload();
  const status = BGMSystem.getStatus();
  if (state !== STATE.PAUSED && (!status.wantPlaying || status.error)) BGMSystem.resume();
}
addEventListener('pointerdown', unlockSurvivalAudio, { passive: true });
addEventListener(
  'keydown',
  (event) => {
    if (!event.repeat) unlockSurvivalAudio();
  },
  { passive: true },
);
addEventListener('visibilitychange', () => {
  if (document.hidden) {
    SurvivalSoundBank.setPaused(true);
    BGMSystem.pause();
    soundscape.active = false;
  }
});
document.addEventListener('click', (event) => {
  if (event.target.closest('button,.cmdBtn,.modeCard,.classicCard'))
    SurvivalSoundBank.play('select');
});

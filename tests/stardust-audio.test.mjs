import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { MUSIC_CUES, createMusicPlayer } from '../projects/Space-Shooter/systems/music.js';

const settle = () => new Promise(resolve => queueMicrotask(resolve));
function harness({ pending = false } = {}) {
  let clock = 0, serial = 0;
  const frames = new Map(), audios = [], errors = [];
  const player = createMusicPlayer({
    now: () => clock,
    requestFrame: callback => { frames.set(++serial, callback); return serial; },
    cancelFrame: id => frames.delete(id),
    onError: error => errors.push(error),
    createAudio: src => {
      const media = { src, paused: true, volume: 0, currentTime: 0, readyState: 4, calls: 0,
        pause() { this.paused = true; },
        play() { this.calls++; this.paused = false; return pending ? new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }) : Promise.resolve(); },
      };
      audios.push(media); return media;
    },
  });
  return { player, audios, errors, advance(ms) {
    clock += ms;
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
  } };
}

test('all ten cue files exist and victory is the only non-looping cue', async () => {
  assert.equal(Object.keys(MUSIC_CUES).length, 10);
  for (const [key, cue] of Object.entries(MUSIC_CUES)) {
    await access(new URL(`../assets/audio/stardust/${cue.file}`, import.meta.url));
    assert.equal(cue.loop ?? true, key !== 'victory');
  }
});

test('autoplay waits for a gesture and starts only the latest requested cue', async () => {
  const h = harness();
  h.player.play('menu'); h.player.play('level1');
  assert.equal(h.audios.length, 0);
  h.player.unlock(); await settle(); h.advance(800);
  assert.equal(h.audios.length, 1);
  assert.equal(h.player.status().current.track, 'level1');
  assert.equal(h.audios[0].volume, 0.4);
});

test('crossfade preserves custom gain and mute updates both voices immediately', async () => {
  const h = harness(); h.player.unlock(); h.player.play('level1'); await settle(); h.advance(800);
  h.player.play('riddle', { volume: 0.2 }); await settle(); h.advance(400);
  assert.equal(h.audios[0].volume, 0.2); assert.equal(h.audios[1].volume, 0.1);
  h.player.setVolume(0); assert.ok(h.audios.every(a => a.volume === 0));
  h.player.setVolume(0.5);
  assert.equal(h.audios[0].volume, 0.1); assert.equal(h.audios[1].volume, 0.05);
  h.advance(400); assert.equal(h.audios[0].paused, true); assert.equal(h.audios[1].volume, 0.1);
  assert.equal(h.player.status().outgoing, null);
});

test('retrying the same sector preserves playhead and does not recreate media', async () => {
  const h = harness(); h.player.unlock(); h.player.play('level3'); await settle(); h.advance(800);
  h.audios[0].currentTime = 21;
  h.player.play('level3'); h.player.unlock();
  assert.equal(h.audios.length, 1); assert.equal(h.audios[0].calls, 1); assert.equal(h.audios[0].currentTime, 21);
});

test('rapid transitions retain the audible track while replacement loads and cap playback at two voices', async () => {
  const h = harness({ pending: true }); h.player.unlock(); h.player.play('menu'); h.audios[0].resolve(); await settle(); h.advance(800);
  h.player.play('level1'); h.player.play('level2');
  assert.equal(h.audios[0].paused, false); assert.equal(h.audios[1].paused, true);
  assert.equal(h.audios.filter(a => !a.paused).length, 2);
  h.audios[1].resolve(); await settle(); assert.equal(h.player.status().current.track, 'level2');
  h.audios[2].resolve(); await settle(); h.advance(800);
  assert.equal(h.audios.filter(a => !a.paused).length, 1); assert.equal(h.audios[2].volume, 0.4);
});

test('stopping during loading fades the audible voice and stale promises cannot revive it', async () => {
  const h = harness({ pending: true }); h.player.unlock(); h.player.play('menu'); h.audios[0].resolve(); await settle(); h.advance(800);
  h.player.play('level1'); h.player.stop(); h.advance(400);
  assert.equal(h.audios[0].volume, 0.17); assert.equal(h.audios[1].paused, true);
  h.audios[1].resolve(); await settle(); h.advance(400); h.player.unlock();
  assert.ok(h.audios.every(a => a.paused)); assert.equal(h.player.status().current, null);
  assert.equal(h.player.status().requested, null);
});

test('failed playback keeps the old track and retries the desired cue on a later gesture', async () => {
  const h = harness({ pending: true }); h.player.unlock(); h.player.play('menu'); h.audios[0].resolve(); await settle(); h.advance(800);
  h.player.play('level1'); h.audios[1].reject(new Error('media unavailable')); await settle();
  assert.equal(h.errors.length, 1); assert.equal(h.player.status().current.track, 'menu');
  assert.equal(h.audios[0].volume, 0.34); assert.equal(h.audios[1].paused, true);
  h.player.unlock(); h.audios[2].resolve(); await settle(); h.advance(800);
  assert.equal(h.player.status().current.track, 'level1'); assert.equal(h.audios[0].paused, true);
});

test('stop followed by menu crossfades without restarting stale fades', async () => {
  const h = harness(); h.player.unlock(); h.player.play('boss_theme'); await settle(); h.advance(800);
  h.player.stop(); h.player.play('menu'); await settle(); h.advance(400);
  assert.equal(h.audios[0].volume, 0.2); assert.equal(h.audios[1].volume, 0.17);
  h.advance(400); assert.equal(h.audios[0].paused, true); assert.equal(h.audios[1].volume, 0.34);
});

test('invalid volumes cannot throw and an ended victory does not restart on input', async () => {
  const h = harness(); h.player.unlock(); h.player.play('victory'); await settle(); h.advance(800);
  assert.equal(h.audios[0].loop, false);
  h.player.setVolume(-9); assert.equal(h.audios[0].volume, 0);
  h.player.setVolume(9); assert.equal(h.audios[0].volume, 0.36);
  h.player.setVolume(NaN); assert.equal(h.audios[0].volume, 0.36);
  h.audios[0].paused = true; h.audios[0].ended = true; h.player.unlock(); h.player.play('victory');
  assert.equal(h.audios[0].calls, 1);
});

test('a fresh gesture resumes an interrupted looping cue without resetting its position', async () => {
  const h = harness(); h.player.unlock(); h.player.play('level2'); await settle(); h.advance(800);
  h.audios[0].currentTime = 17; h.audios[0].paused = true;
  h.player.unlock(); await settle();
  assert.equal(h.audios[0].paused, false); assert.equal(h.audios[0].calls, 2);
  assert.equal(h.audios[0].currentTime, 17); assert.equal(h.audios.length, 1);
});

// Opening B, outcome 7: sound. Every sound the opening asks for exists as a recipe, the klaxon and torch are loops, the music has three
// moods with the bed cut in danger, and nothing plays when muted. (The real-sound proof is the browser test and the walkthrough.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SFX_IDS, LOOP_IDS, createSfx } from '../projects/Space-Shooter/voyage/onfoot/sfx.js';
import { MOODS, MOOD_NAMES, moodOf, createMood } from '../projects/Space-Shooter/voyage/ui/mood.js';
import { createHangarAudio } from '../projects/Space-Shooter/voyage/ui/audio.js';
import { SOUNDS } from '../projects/Space-Shooter/voyage/onfoot/events.js';
import { SHOTS } from '../projects/Space-Shooter/voyage/slice/shots.js';

test('every sound id the game fires has a recipe, including the new ones the staging uses', () => {
  const fired = ['step', 'door', 'talk', 'shot', 'hit', 'hurt', 'kill', 'dash', 'guard', 'drill', 'crack', 'jam', 'ore', 'turn', 'power', 'unlock', 'scan', 'boost', 'bump', 'dock', 'pickup', 'thud', 'boots', 'breach'];
  for (const id of fired) assert.ok(SFX_IDS.includes(id), `${id} has a recipe`);
  const staged = new Set();
  for (const shot of Object.values(SHOTS)) for (const s of shot) { if (s.op === 'sfx') staged.add(s.id); }
  for (const id of staged) assert.ok(SFX_IDS.includes(id), `staged sfx ${id}`);
  const loops = new Set();
  for (const shot of Object.values(SHOTS)) for (const s of shot) if (s.op === 'loop') loops.add(s.id);
  for (const id of loops) assert.ok(LOOP_IDS.includes(id), `staged loop ${id}`);
  assert.deepEqual([...LOOP_IDS].sort(), ['klaxon', 'torch']);
});

test('the sound hook list in events.js names the new ids so a page can play real files for them', () => {
  for (const id of ['pickup', 'thud', 'boots', 'breach', 'klaxon', 'torch']) assert.ok(SOUNDS.includes(id), `${id} in SOUNDS`);
});

test('sfx never throws without audio, is silent when muted, and hands a page its own player every id', () => {
  const played = [];
  const own = createSfx({ play: (id) => played.push(id) });
  own('shot'); own('breach');
  assert.deepEqual(played, ['shot', 'breach']);
  const quiet = createSfx({ muted: () => true });
  assert.doesNotThrow(() => { quiet('shot'); quiet.loop('klaxon', true); quiet.stopAll(); });
  assert.deepEqual(quiet.running(), [], 'a muted klaxon does not start');
  const nothing = createSfx({});
  assert.doesNotThrow(() => { nothing('step'); nothing('nope'); assert.equal(nothing.loop('nope', true), false); });
});

test('moods: calm keeps the bed, danger and combat cut it and add the tense bed, combat is faster', () => {
  assert.deepEqual([...MOOD_NAMES], ['calm', 'danger', 'combat']);
  assert.equal(MOODS.calm.bed, 1);
  assert.equal(MOODS.danger.bed, 0, 'the music cuts');
  assert.equal(MOODS.combat.bed, 0);
  assert.ok(MOODS.danger.drone > 0 && MOODS.combat.drone > MOODS.danger.drone);
  assert.ok(MOODS.combat.pulseEvery < MOODS.danger.pulseEvery, 'combat pulses faster');
  assert.equal(moodOf('nonsense'), MOODS.calm);
});

test('the hangar bed follows the mood: cut in danger, back in calm, and still muted when muted', () => {
  const made = [];
  const media = (src) => { const a = { src, volume: 0, paused: true, loop: false, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } }; made.push(a); return a; };
  const store = new Map();
  const audio = createHangarAudio({ createAudio: media, storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
  audio.unlock();
  audio.setAmbience('ship.mp3', 0.5);
  const bed = made[0];
  const base = bed.volume;
  assert.ok(base > 0, `the bed plays (${base})`);
  audio.setMoodFactor(0);
  assert.equal(bed.volume, 0, 'cut');
  audio.setMoodFactor(1);
  assert.equal(bed.volume, base, 'restored');
  const mood = createMood({ audio, ctxFactory: () => { throw new Error('no audio here'); } });
  assert.equal(mood.set('danger'), 'danger');
  return new Promise((resolve) => setTimeout(() => {
    assert.ok(audio.moodFactor < 0.1, `the bed fades out (${audio.moodFactor})`);
    mood.set('calm');
    setTimeout(() => { assert.ok(audio.moodFactor > 0.9, `and comes back (${audio.moodFactor})`); mood.destroy(); resolve(); }, 600);
  }, 700));
});

// Round 2 hangar (projects/Space-Shooter/voyage/hangar*, voyage/ui/): the
// physics die (fair, and the landed face is the roll), the skill tree's
// layout, respec, the stations and their ids, the story seam, the audio
// player and the API other lanes mount into. Pure modules and fakes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIE, FACES, throwDie, step, settle, rollOnce, topFace, restingOn, rotate, faceUps } from '../projects/Space-Shooter/voyage/ui/diceSim.js';
import { treeLayout, canUnlearn, unlearn, respecAll, respecCost, respecQuote, effectWords, skillWords } from '../projects/Space-Shooter/voyage/hangarSkills.js';
import { STATIONS, STATION_IDS, stationNear, stationAt, stationState, fitHangar, HANGAR } from '../projects/Space-Shooter/voyage/hangarStations.js';
import { HANGAR_STATIONS, EFFECT_WORDS, RESPEC, LICENCE_COPY } from '../projects/Space-Shooter/voyage/hangarData.js';
import { isUnlocked, tutorialOn, createBus, chance, STAT_TEXT } from '../projects/Space-Shooter/voyage/hangarLinks.js';
import { createHangarAudio, readAudioSettings, AUDIO_KEY } from '../projects/Space-Shooter/voyage/ui/audio.js';
import { hangarApi, provideHangar, mountStation, stationMounts, addLaunch, launches, watchRegistry } from '../projects/Space-Shooter/voyage/hangarApi.js';
import { readPending, rollWords, PENDING_KEY } from '../projects/Space-Shooter/voyage/ui/licence.js';
import { UI_KIT, uiArt, iconFor, ambienceFor } from '../projects/Space-Shooter/voyage/ui/assets.js';
import { createCharacter, learn, unspentPoints, canLearn } from '../projects/Space-Shooter/voyage/character.js';
import { SKILLS, TREES, STATS, ITEMS } from '../projects/Space-Shooter/voyage/data.js';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const memory = (seed = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const captain = (skills = {}, earned = 10) => ({ ...createCharacter({ name: 'Vela Quint' }, () => 0.5, () => 1000), earned, skills });

// --- The die ---------------------------------------------------------------------------

test('dice: faces are a real die (opposites add to 7) and a die resting on a face reads that face', () => {
  const byAxis = new Map();
  for (const f of FACES) { const k = f.n.map(Math.abs).join(); byAxis.set(k, (byAxis.get(k) || 0) + f.value); }
  assert.deepEqual([...byAxis.values()], [7, 7, 7]);
  for (let v = 1; v <= 6; v++) {
    const top = topFace(restingOn(v).q);
    assert.equal(top.value, v);
    assert.ok(top.flatness > 0.999);
  }
});

test('dice: every throw settles flat inside the tray, and the roll is the face pointing up', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const { value, die, seconds } = rollOnce(mulberry(seed));
    assert.ok(die.settled, `seed ${seed} settled`);
    assert.ok(seconds < DIE.maxSeconds, `seed ${seed} settled by physics, not the time limit (${seconds.toFixed(2)} s)`);
    const ups = faceUps(die.q);
    const best = ups.reduce((a, b) => (b.up > a.up ? b : a));
    assert.equal(value, best.value, 'the landed face is the roll');
    assert.ok(best.up > 0.985, `seed ${seed} lies flat`);
    for (const axis of [0, 1]) assert.ok(Math.abs(die.p[axis]) < DIE.tray, 'inside the walls');
    assert.ok(Math.abs(die.p[2] - DIE.size / 2) < 0.03, 'resting on the floor');
  }
});

test('dice: fair over many throws (chi-square, 5 degrees of freedom, p > 0.001)', () => {
  const N = 1200;
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) counts[rollOnce(mulberry(10_000 + i)).value - 1]++;
  const expected = N / 6;
  const chi = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  assert.ok(chi < 20.5, `chi-square ${chi.toFixed(2)} for ${counts.join(', ')}`);
  for (const c of counts) assert.ok(c > N / 6 * 0.7, `every face comes up (${counts.join(', ')})`);
});

test('dice: the same throw lands the same way; a flick bends the throw but stays a physical roll', () => {
  assert.equal(rollOnce(mulberry(42)).value, rollOnce(mulberry(42)).value);
  const flicked = throwDie(mulberry(7), { dx: 1, dy: 0, power: 1 });
  assert.ok(flicked.v[0] > 4 && flicked.p[0] < 0, 'thrown to the right from the left');
  const { die } = settle(flicked);
  assert.ok(die.settled && topFace(die.q).flatness > 0.985);
  // Stepping by hand matches settle(): no hidden state.
  const a = throwDie(mulberry(99)); const b = throwDie(mulberry(99));
  for (let i = 0; i < 300; i++) step(a);
  for (let i = 0; i < 300; i++) step(b);
  assert.deepEqual(a.q, b.q);
  // rotate keeps lengths.
  const r = rotate(a.q, [1, 0, 0]);
  assert.ok(Math.abs(Math.hypot(...r) - 1) < 1e-9);
});

// --- The licence -----------------------------------------------------------------------

test('licence: pending rolls survive a reload and are cleaned; roll words explain a value', () => {
  const s = memory({ [PENDING_KEY]: JSON.stringify({ cha: 5, con: 9, dex: 'x', wis: 1 }) });
  assert.deepEqual(readPending(s), { cha: 5, wis: 1 });
  assert.deepEqual(readPending(memory({ [PENDING_KEY]: '{oops' })), {});
  assert.match(rollWords('dex', 6), /Above average \(\+3/);
  assert.match(rollWords('dex', 6), /Quick hands/);
  assert.match(rollWords('dex', 6), /turret and sidearm/);
  assert.match(rollWords('wis', 3), /Average/);
  assert.match(rollWords('con', 1), /Below average \(-2/);
  assert.match(rollWords('cha', 4), /Passes a normal check 4 times in 6/, 'a 4 + 1d6 meets 7 on a 3 or more');
  assert.equal(chance(4, LICENCE_COPY.checkDc), 4 / 6);
  for (const s2 of STATS) assert.ok(STAT_TEXT[s2.id]?.short, `${s2.id} has plain words`);
});

// --- Skill tree ------------------------------------------------------------------------

test('skill tree: every skill has a node, shared skills are fed by both trees, nodes keep their distance', () => {
  const L = treeLayout();
  assert.equal(L.nodes.length, SKILLS.length);
  for (const s of SKILLS) {
    const into = L.edges.filter((e) => e.to === s.id);
    assert.equal(into.length, s.trees.length, `${s.id}: one conduit per tree`);
    assert.deepEqual(into.map((e) => e.trees[0]).sort(), [...s.trees].sort());
    for (const e of into) if (e.from !== 'root') assert.ok(L.byId.get(e.from).ring < L.byId.get(s.id).ring, 'conduits run outward');
  }
  for (const a of L.nodes) for (const b of L.nodes) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.2, `${a.id} and ${b.id} overlap`);
  for (const n of L.nodes) assert.ok(Math.hypot(n.x, n.y) <= 1.05, `${n.id} fits the screen`);
  assert.equal(L.branches.length, TREES.length);
  assert.deepEqual(treeLayout(), treeLayout(), 'stable');
});

test('skill words: every effect tag a skill uses reads in plain words', () => {
  for (const s of SKILLS) for (const tag of Object.keys(s.effects)) assert.ok(EFFECT_WORDS[tag], `${s.id}: ${tag} has words`);
  assert.equal(effectWords('ship.speed', 0.03), '+3% top speed');
  assert.equal(effectWords('nav', 1), '+1 to navigation rolls');
  const w = skillWords(SKILLS.find((s) => s.id === 'strafe-run'), 2);
  assert.match(w.needs, /1 point in Helm and 1 point in Guns/);
  assert.match(w.now, /\+2 gun damage/);
  assert.deepEqual(w.trees, ['Helm', 'Guns']);
});

test('respec: a rank comes back unless another skill stands on it; a full respec refunds everything', () => {
  let c = captain();
  for (const id of ['smooth-burn', 'smooth-burn', 'star-charts']) c = learn(c, id);
  assert.equal(c.skills['star-charts'], 1);
  assert.equal(unspentPoints(c), 7);
  const blocked = canUnlearn(c, 'smooth-burn');
  assert.equal(blocked.ok, false, 'Star Charts needs 2 Helm points');
  assert.match(blocked.reason, /Star Charts needs these points/);
  assert.equal(unlearn(c, 'smooth-burn'), c, 'unchanged when blocked');
  c = unlearn(c, 'star-charts');
  assert.equal(c.skills['star-charts'], undefined);
  assert.equal(unspentPoints(c), 8, 'a full refund');
  c = unlearn(c, 'smooth-burn');
  assert.equal(c.skills['smooth-burn'], 1);
  assert.equal(canUnlearn(c, 'tight-turns').ok, false, 'nothing to take back');
  const all = respecAll(learn(learn(c, 'tight-turns'), 'steady-aim'));
  assert.deepEqual(all.skills, {});
  assert.equal(unspentPoints(all), 10);
  assert.ok(canLearn(all, 'smooth-burn').ok);
});

test('respec: free while the tutorial runs, a small fee per point after (data, not code)', () => {
  assert.deepEqual(respecCost(3, { tutorial: true }), { money: 0 });
  assert.deepEqual(respecCost(3, { tutorial: false }), { money: 3 * RESPEC.feePerPoint });
  assert.deepEqual(respecCost(0, { tutorial: false }), { money: 0 });
  assert.deepEqual(respecCost(2, {}, { feePerPoint: 0, freeInTutorial: true }), { money: 0 });
  const c = learn(learn(captain(), 'smooth-burn'), 'patch-kit');
  assert.deepEqual(respecQuote(c, { tutorial: false }), { points: 2, cost: { money: 2 * RESPEC.feePerPoint } });
});

// --- Stations --------------------------------------------------------------------------

test('stations: exactly the contract\'s ids, each with words, a footprint inside the floor and a talk ring', () => {
  assert.deepEqual([...STATION_IDS].sort(), ['backroom', 'board', 'hatch', 'kennel', 'locker', 'pad', 'quarters', 'range', 'scrap']);
  assert.equal(STATIONS, HANGAR_STATIONS, 'the data file is the source');
  for (const s of STATIONS) {
    assert.ok(s.name && s.blurb, `${s.id} has words`);
    if (s.unlock) assert.ok(s.copy?.locked, `${s.id} says why it is locked`);
    const b = s.box;
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= HANGAR.width && b.y + b.h <= HANGAR.height, `${s.id} inside the hangar`);
    assert.equal(stationNear(s.at.x, s.at.y)?.id, s.id, `${s.id}: standing on its spot finds it`);
    assert.equal(stationAt(b.x + b.w / 2, b.y + b.h / 2)?.id, s.id, `${s.id}: tapping its prop finds it`);
  }
  // Talk rings never overlap, so walking up is never ambiguous.
  for (const a of STATIONS) for (const b of STATIONS) if (a !== b) assert.ok(Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) > a.ring + b.ring - 0.5, `${a.id} and ${b.id} rings overlap`);
  assert.equal(stationNear(12, 10), null, 'the middle of the pad is no talk ring');
  const f = fitHangar(390, 400, 8);
  assert.ok(f.scale * HANGAR.width <= 390 && f.ox >= 0);
});

test('stations: locked until the story unlocks them; old saves and saves without a story have everything open', () => {
  const pad = STATIONS.find((s) => s.id === 'pad');
  const kennel = STATIONS.find((s) => s.id === 'kennel');
  const tutorial = { story: { v: 1, step: 'walk', unlocks: ['station:quarters'], finished: false, skipped: false } };
  assert.equal(stationState(tutorial, pad, isUnlocked).locked, true);
  assert.equal(stationState(tutorial, kennel, isUnlocked).locked, false, 'Ralph\'s kennel is always open');
  assert.equal(stationState({ story: { ...tutorial.story, unlocks: ['station:pad'] } }, pad, isUnlocked).locked, false);
  assert.equal(stationState({ story: { ...tutorial.story, skipped: true } }, pad, isUnlocked).locked, false);
  assert.equal(stationState({}, pad, isUnlocked).locked, false, 'no story block: open');
  assert.equal(stationState(tutorial, pad, isUnlocked, { station: 'pad' }).objective, true);
  assert.equal(tutorialOn(tutorial), true);
  assert.equal(tutorialOn({ story: { finished: true } }), false);
  assert.equal(tutorialOn({}), false);
});

// --- Bus, API and mounts ---------------------------------------------------------------

test('bus: on, once, off; a failing listener does not stop the others', () => {
  const bus = createBus();
  const seen = [];
  const warn = console.warn; console.warn = () => {};
  bus.on('x', () => { throw new Error('boom'); });
  const off = bus.on('x', (d) => seen.push(['on', d.n]));
  bus.once('x', (d) => seen.push(['once', d.n]));
  bus.emit('x', { n: 1 }); off(); bus.emit('x', { n: 2 });
  console.warn = warn;
  assert.deepEqual(seen, [['on', 1], ['once', 1]]);
});

test('hangar API: other lanes mount station views and launch entries; listeners added before boot still hear opens', () => {
  const calls = [];
  const fired = [];
  const offListen = hangarApi.subscribe((e) => fired.push(e));
  assert.equal(hangarApi.openStation('pad'), false, 'a no-op before boot');
  let emit = null;
  provideHangar({ openStation: (id, o) => { calls.push([id, o?.via]); emit?.({ type: 'open', station: id, via: o?.via }); return true; }, closeStation: () => true, subscribe: (fn) => { emit = fn; return () => { emit = null; }; }, current: 'pad' });
  assert.equal(hangarApi.openStation('locker', { via: 'walk' }), true);
  assert.deepEqual(calls, [['locker', 'walk']]);
  assert.deepEqual(fired, [{ type: 'open', station: 'locker', via: 'walk' }]);
  assert.equal(hangarApi.current, 'pad');
  assert.equal(hangarApi.stationNear(20.6, 9.6)?.id, 'locker');
  provideHangar(null);
  offListen();

  let changes = 0;
  const unwatch = watchRegistry(() => changes++);
  assert.throws(() => mountStation('nowhere', { id: 'shop', render() {} }), /Unknown hangar station/);
  assert.throws(() => mountStation('locker', { id: 'Bad Id', render() {} }), /mountStation needs/);
  const offShop = mountStation('locker', { id: 'shop', label: 'Shop', order: 10, render() {} });
  mountStation('locker', { id: 'fitting', label: 'Fitting', order: 5, render() {} });
  assert.deepEqual(stationMounts('locker').map((m) => m.id), ['fitting', 'shop']);
  offShop();
  assert.deepEqual(stationMounts('locker').map((m) => m.id), ['fitting']);
  const offArena = addLaunch({ id: 'arena', label: 'Dogfight arena', order: 20, run() {} });
  addLaunch({ id: 'practice', label: 'Practice circuit', order: 10, run() {} });
  assert.deepEqual(launches().map((l) => l.id), ['practice', 'arena']);
  assert.throws(() => addLaunch({ id: 'x' }), /addLaunch needs/);
  offArena();
  assert.ok(changes >= 5);
  unwatch();
});

// --- Audio -----------------------------------------------------------------------------

function fakeAudioFactory() {
  const made = [];
  const create = (src) => {
    const a = { src, volume: 1, loop: false, paused: true, playCount: 0, onended: null, onerror: null,
      play() { this.paused = false; this.playCount++; return Promise.resolve(); },
      pause() { this.paused = true; } };
    made.push(a);
    return a;
  };
  return { create, made };
}

test('audio: nothing plays before the first gesture; ambience loops after it, ducks under a voice line, and mute stops both', async () => {
  const storage = memory({ 'starmap.settings': JSON.stringify({ musicVolume: 0.5, sfxVolume: 0.8 }) });
  const { create, made } = fakeAudioFactory();
  const audio = createHangarAudio({ createAudio: create, storage });
  assert.deepEqual(readAudioSettings(storage), { muted: false, ambience: 0.5, voice: 0.8 }, 'starts from today\'s Stardust volumes');
  audio.setAmbience('hum.ogg', 0.8);
  assert.equal(made.length, 0, 'no media made before a gesture');
  assert.equal(await audio.playLine('line.mp3'), 'silent', 'a line before a gesture is text only');
  assert.equal(audio.unlock(), true);
  assert.equal(audio.unlock(), false, 'once');
  const bed = made[0];
  assert.equal(bed.loop, true);
  assert.equal(bed.paused, false);
  assert.ok(Math.abs(bed.volume - 0.4) < 1e-9, 'gain x ambience volume');
  const playing = audio.playLine('chibby.ship.1.mp3');
  const line = made[1];
  assert.ok(Math.abs(line.volume - 0.8) < 1e-9);
  assert.ok(bed.volume < 0.4, 'ducked under the voice');
  line.onended();
  assert.equal(await playing, 'ended');
  assert.ok(Math.abs(bed.volume - 0.4) < 1e-9, 'back up after the line');
  const next = audio.playLine('b.mp3');
  audio.set({ muted: true });
  assert.equal(await next, 'stopped', 'mute cuts a line short');
  assert.equal(bed.paused, true);
  assert.equal(JSON.parse(storage.getItem(AUDIO_KEY)).muted, true, 'kept for this device');
  assert.equal(await audio.playLine('c.mp3'), 'silent');
  audio.set({ muted: false, ambience: 1 });
  assert.equal(bed.paused, false);
  assert.ok(Math.abs(bed.volume - 0.8) < 1e-9);
  const failing = audio.playLine('missing.mp3');
  made.at(-1).onerror();
  assert.equal(await failing, 'failed', 'a missing file never hangs the caption');
  audio.destroy();
});

// --- Assets ----------------------------------------------------------------------------

test('assets: every UI kit picture, station prop, deck texture and ambience file is in the repo (offline, no CDN)', () => {
  const file = (url) => fileURLToPath(url);
  for (const name of UI_KIT) {
    const p = file(uiArt(name));
    assert.ok(existsSync(p), `${name} exists`);
    assert.ok(statSync(p).size < 120_000, `${name} is small`);
  }
  for (const i of ITEMS) assert.ok(iconFor(i.id), `${i.id} has an icon`);
  for (const s of STATS) assert.ok(iconFor(s.id), `${s.id} has an icon`);
  for (const s of STATIONS) assert.ok(s.art, `${s.id} has art`);
  const amb = ambienceFor('hangar', (t) => (t.includes('ogg') ? 'probably' : ''));
  assert.match(amb.url, /hangar-hum\.ogg$/);
  assert.ok(existsSync(file(amb.url)));
  assert.match(ambienceFor('hangar', () => '').url, /hangar-hum\.mp3$/, 'mp3 where Vorbis is missing');
  assert.equal(ambienceFor('nowhere'), null);
});

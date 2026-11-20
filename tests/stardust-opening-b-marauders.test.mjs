// Opening B, outcome 4: the marauder scene is readable. The staging ORDER is tested against a fake stage: the alarm and the hatch
// come before any Reaver, the blown door before the entrance, the stand before the fall, and the fall happens with the camera on Reck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, runAll } from '../projects/Space-Shooter/voyage/slice/timeline.js';
import { SHOTS, OPS, MOOD, shotFor } from '../projects/Space-Shooter/voyage/slice/shots.js';
import { createStager } from '../projects/Space-Shooter/voyage/slice/stager.js';
import { createSliceDirector } from '../projects/Space-Shooter/voyage/slice/director.js';
import { createBus } from '../projects/Space-Shooter/voyage/story/bus.js';
import { RETRY_WORDS } from '../projects/Space-Shooter/voyage/slice/retry.js';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { SLICE_FLAG } from '../projects/Space-Shooter/voyage/slice/rules.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';

const Q = Object.fromEntries(SLICE_LIST.map((q) => [q.id, q]));

test('the timeline fires steps in order after their delays, holds at an await until its signal, and never edits the shot', () => {
  const shot = [{ op: 'a' }, { op: 'b', dt: 100 }, { op: 'c', await: 'go', timeout: 5000, dt: 50 }, { op: 'd', dt: 10 }];
  const frozen = JSON.stringify(shot);
  const seen = [];
  const api = { a: () => seen.push('a'), b: () => seen.push('b'), c: () => seen.push('c'), d: () => seen.push('d') };
  const tl = createTimeline(shot, api);
  tl.step(0); assert.deepEqual(seen, ['a']);
  tl.step(99); assert.deepEqual(seen, ['a']);
  tl.step(1); assert.deepEqual(seen, ['a', 'b']);
  tl.step(4000); assert.deepEqual(seen, ['a', 'b'], 'held at the await');
  assert.equal(tl.waiting, 'go');
  tl.signal('go');
  tl.step(49); assert.deepEqual(seen, ['a', 'b']);
  tl.step(1); assert.deepEqual(seen, ['a', 'b', 'c']);
  tl.step(10); assert.deepEqual(seen, ['a', 'b', 'c', 'd']);
  assert.equal(tl.done, true);
  assert.equal(JSON.stringify(shot), frozen);
  // a missed signal times out so a scene never stalls
  const seen2 = [];
  const t2 = createTimeline([{ op: 'x', await: 'never', timeout: 300 }, { op: 'y' }], { x: () => seen2.push('x'), y: () => seen2.push('y') });
  for (let i = 0; i < 20; i++) t2.step(50);
  assert.deepEqual(seen2, ['x', 'y']);
  // a long single step does not lose time between chained steps
  const seen3 = [];
  createTimeline([{ op: 'p', dt: 100 }, { op: 'q', dt: 100 }], { p: () => seen3.push('p'), q: () => seen3.push('q') }).step(250);
  assert.deepEqual(seen3, ['p', 'q']);
});

test('shots use only known ops and name nodes that exist; every mood key is a real node', () => {
  for (const [key, shot] of Object.entries(SHOTS)) {
    const [qid, nid] = key.split('/');
    if (nid !== 'leave') assert.ok(Q[qid]?.nodes[nid], `${key} names a node`);
    for (const s of shot) assert.ok(OPS.includes(s.op), `${key}: op ${s.op}`);
    assert.ok(shot.every((s) => s.dt == null || (s.dt >= 0 && s.dt < 8000)));
  }
  for (const key of Object.keys(MOOD)) { const [qid, nid] = key.split('/'); assert.ok(Q[qid]?.nodes[nid], `${key} mood node`); }
  assert.ok(shotFor('visitors', 'breach') && !shotFor('visitors', 'bridge'));
});

// A fake world that records everything the stager does, in order, with the camera target at that moment.
function fakeWorld() {
  const calls = [];
  let cam = null, reckDown = false;
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const w = {
    calls, bus: null,
    map: { id: 'duchess-bridge', tile: 48, w: 672, h: 480, doors: [{ id: 'corridor', x: 624, y: 192, w: 48, h: 48, to: 'duchess-corridor' }] },
    position: () => ({ x: 500, y: 300 }),
    npcAt: (id) => (id === 'reck' && !reckDown ? { x: 264, y: 312 } : id === 'reck' ? null : null),
    setState: (tag, st) => { calls.push(['setState', tag, st]); if (tag === 'reck' && st == null) reckDown = true; },
    sound: (id) => calls.push(['sound', id]),
    bark: rec('bark'),
    doors: { force: (id, on) => calls.push(['force', id, on]) },
    stage: {
      actors: new Map(),
      actor(id) { return this.actors.get(id) || null; },
      get actorIds() { return [...this.actors.keys()]; },
      camera: (p) => { cam = p; calls.push(['camera', p ? 'target' : 'player', cam]); },
      pulse: (on) => calls.push(['pulse', on]), banner: (t) => calls.push(['banner', t]), inset: (on) => calls.push(['inset', on]),
      seam: (r, p) => calls.push(['seam', +p.toFixed(2)]), blow: () => calls.push(['blow']), decal: () => calls.push(['decal']),
      spawn(id, o) { this.actors.set(id, { id, ...o }); calls.push(['spawn', id]); },
      walk: (id, pts) => calls.push(['walk', id, pts[0].x]), face() {}, bolt: (x0, y0, x1, y1, o) => calls.push(['bolt', o?.color]),
      hurtAt: () => calls.push(['hurt']), shake: () => {}, smoke: () => calls.push(['smoke']), remove(id) { this.actors.delete(id); calls.push(['remove', id]); },
      flash: () => {}, clearFx: () => calls.push(['clearFx']),
    },
    get camera() { return cam; },
  };
  return w;
}

/** Drives the stager's own loop with a clock we control: 50 ms a tick. signals: { lineId: atMs } (the dialogue box showing that line). */
function harness() {
  const w = fakeWorld();
  const bus = createBus();
  bus.on('audio:mood', (d) => w.calls.push(['mood', d.mode]));
  bus.on('audio:loop', (d) => w.calls.push(['loop', d.id, d.on]));
  bus.on('audio:sfx', (d) => w.calls.push(['sfxEvent', d.id]));
  let t = 0, loopFn = null;
  const stager = createStager({ world: () => w, bus, now: () => t, setTimer: (fn) => { loopFn = fn; return 1; }, clearTimer: () => { loopFn = null; } });
  const run = (ms, { signals = {}, until = null } = {}) => {
    const pending = Object.entries(signals).map(([id, at]) => ({ id, at, t0: t }));
    const end = t + ms;
    while (t < end && !(until && until())) {
      t += 50;
      for (const p of pending) if (!p.fired && t - p.t0 >= p.at) { p.fired = true; bus.emit('talk:line', { id: p.id }); }
      loopFn?.();
    }
    return t;
  };
  return { w, bus, stager, run, now: () => t };
}

function runScene(order, { signals = {} } = {}) {
  const h = harness();
  for (const key of order) assert.ok(h.stager.start(key), key);
  h.run(60000, { signals, until: () => h.stager.running.length === 0 });
  return h;
}

test('the scene plays in a readable order: alarm, then the hatch, then the cut, then the blow, then Reavers, then the stand, then the fall', () => {
  const { w } = runScene(['visitors/breach', 'visitors/last', 'visitors/reck-falls'], { signals: { 'reck.s2.3': 1500 } });
  const names = w.calls.map((c) => c.slice(0, 3).join(':'));
  const idx = (needle, from = 0) => { const i = names.findIndex((n, k) => k >= from && n.startsWith(needle)); assert.ok(i >= 0, `${needle} happens (${names.join(' | ')})`); return i; };
  const mood = idx('mood:danger'), klaxon = idx('loop:klaxon:true'), pulse = idx('pulse:true'), banner = idx('banner'), inset = idx('inset:true');
  assert.ok(mood < klaxon && klaxon < pulse && pulse < banner, 'the music cuts first, then the klaxon, the red pulse and the banner');
  const camHatch = idx('camera:target');
  assert.ok(pulse < camHatch && inset < idx('camera:player'), 'the camera swings to the hatch after the alarm and comes back');
  const seam = idx('seam'), blow = idx('blow');
  assert.ok(camHatch < seam && seam < blow, 'the cut shows before the door is blown');
  assert.ok(names.slice(0, blow).every((n) => !n.startsWith('spawn')), 'no Reaver is on screen before the door is blown');
  assert.ok(names.includes('force:corridor:true'), 'the blown hatch stands open');
  const spawn1 = idx('spawn:r1'), fire1 = idx('bolt:#ffb27a'), hurt1 = idx('hurt'), reckFire = idx('bolt:#cff8f4');
  assert.ok(blow < spawn1 && spawn1 < fire1 && fire1 < hurt1 && hurt1 < reckFire, 'the Reaver comes through, fires, Reck is hit, Reck answers');
  const down = names.findLastIndex((n) => n.startsWith('setState:reck:'));
  assert.ok(reckFire < down, 'Reck goes down after the stand');
});

test('Reck goes down on screen: the camera is on him when he falls, the map state is held until then, and the camera returns to the player', () => {
  const { w } = runScene(['visitors/breach', 'visitors/last', 'visitors/reck-falls'], { signals: { 'reck.s2.3': 1500 } });
  const states = w.calls.filter((c) => c[0] === 'setState');
  assert.deepEqual(states[0].slice(1), ['reck', 'alive'], 'Reck is kept alive in his seat (the flag the engine sets would flip him at once)');
  assert.equal(states.at(-1)[2], null, 'then the map state goes back to following the save: he is down');
  const downAt = w.calls.findIndex((c) => c[0] === 'setState' && c[2] == null);
  const lastCam = w.calls.slice(0, downAt).filter((c) => c[0] === 'camera').at(-1);
  assert.equal(lastCam[1], 'target', 'the camera is on a target (Reck), not the player, when he falls');
  assert.deepEqual({ x: lastCam[2].x, y: lastCam[2].y }, { x: 264, y: 312 }, 'that target is Reck\'s chair');
  const after = w.calls.slice(downAt).filter((c) => c[0] === 'camera');
  assert.equal(after.at(-1)[1], 'player', 'and the camera comes back to the player afterwards');
});

test('the cut-in waits for Reck\'s line and does not blow the door before it', () => {
  const blowAt = (signals) => {
    const h = harness();
    h.stager.start('visitors/last');
    let at = -1;
    h.run(40000, { signals, until: () => { if (h.w.calls.some((c) => c[0] === 'blow')) { at = h.now(); return true; } return false; } });
    return at;
  };
  const without = blowAt({}), withLine = blowAt({ 'reck.s2.3': 2500 });
  assert.ok(withLine > 0 && withLine < without, `Reck's line brings the blow forward (${withLine} < ${without} ms)`);
  assert.ok(without >= 11000, 'without it, the timeout holds the door shut for at least 11 s, and then it still blows (a scene never stalls)');
  assert.ok(withLine >= 2500, 'never before the line is up');
});

test('the Reavers leave before the result card, and the stage is cleared for the next scene', () => {
  const w = fakeWorld(); const bus = createBus(); let t = 0;
  const stager = createStager({ world: () => w, bus, now: () => t, setTimer: () => 1, clearTimer: () => {} });
  w.stage.spawn('r1', { x: 600, y: 200 }); w.stage.spawn('r2', { x: 700, y: 200 });
  let shown = 0;
  const took = stager.endHook({ quest: { id: 'visitors' }, node: 'end-hidden' }, () => { shown++; });
  assert.equal(took, true, 'the stager holds the card back while they leave');
  assert.equal(shown, 0);
  stager.reset();
  assert.ok(w.calls.some((c) => c[0] === 'clearFx'));
  assert.ok(w.calls.some((c) => c[0] === 'force' && c[2] == null), 'the hatch goes back to working by itself');
  assert.equal(w.stage.actorIds.length, 0);
  assert.equal(stager.endHook({ quest: { id: 'third-shift' }, node: 'end-clean' }, () => {}), false, 'other scenes show their card at once');
});

test('a shot plays once per scene run (a talk that ends and resumes does not replay the alarm)', () => {
  const w = fakeWorld(); const bus = createBus();
  const stager = createStager({ world: () => w, bus, now: () => 0, setTimer: () => 1, clearTimer: () => {} });
  assert.ok(stager.start('visitors/breach'));
  assert.equal(stager.start('visitors/breach'), null);
  stager.reset();
  assert.ok(stager.start('visitors/breach'), 'after a reset (a retry) it plays again');
});

// ---- retry ----
function retryDirector({ outcome }) {
  const calls = [];
  const start = { flags: { [SLICE_FLAG]: 1 }, money: 5, quests: { active: {}, done: { 'third-shift': {}, visitors: {} } } };
  let current = structuredClone(start);
  const store = { get: () => current, update: (fn) => { current = fn(current); calls.push(['update']); } };
  const jobs = { playing: false, take: (q) => { calls.push(['take', q.id]); current = { ...current, quests: { ...current.quests, active: { [q.id]: { node: q.start } } } }; return true; }, restart: (q) => calls.push(['restart', q.id]) };
  const world = { map: { id: 'duchess-corridor', tile: 48, w: 960, h: 480, doors: [] }, position: () => ({ x: 400, y: 200 }), player: { angle: 0 }, skip: (o) => { calls.push(['skip', o.room]); return Promise.resolve(); } };
  let shown = 0;
  const retryScreen = { show: () => { shown++; } };
  const stager = { reset: () => calls.push(['reset']), mood: (m) => calls.push(['mood', m]), stagerOf: () => null, endHook: () => false };
  const d = createSliceDirector({ store, jobs, toast: () => {}, world: () => world, fightIn: async () => ({ outcome, hp: 0 }), stager, retryScreen });
  return { d, calls, shown: () => shown, store: () => current };
}

test('going down in a fight ends the run: the retry screen shows, the engine is not told, and retry restores the scene start', async () => {
  const r = retryDirector({ outcome: 'lose' });
  assert.equal(r.d.advance(), true, 'the next scene starts and its start is remembered');
  assert.deepEqual(r.calls.filter((c) => c[0] === 'take'), [['take', 'hold-the-corridor']]);
  // the scene runs and changes the save
  r.store().money = 999;
  const node = QUESTS['hold-the-corridor'].nodes['fight-hold'];
  let done = 'untouched';
  r.d.fight({ live: { setup: { map: 'duchess-corridor', spawn: 'default', seed: 1, enemies: node.arena.enemies.map((e) => ({ ...e, room: true })) } } }, (x) => { done = x; });
  await new Promise((res) => setTimeout(res, 500));
  assert.equal(done, 'untouched', 'a death is not reported to the engine as a branch: there is no losing outcome to walk on from');
  assert.equal(r.shown(), 1, 'the retry screen is up');
  assert.ok(r.calls.some((c) => c[0] === 'mood' && c[1] === 'combat'));
  // retry
  r.d.retryScene();
  await new Promise((res) => setTimeout(res, 20));
  assert.ok(r.calls.some((c) => c[0] === 'skip' && c[1] === 'duchess-bridge'), 'through a fade, to the scene\'s first room');
  assert.deepEqual(r.calls.filter((c) => c[0] === 'restart'), [['restart', 'hold-the-corridor']]);
  assert.equal(r.store().money, 5, 'the save is back as it was when the scene began');
  assert.ok(r.calls.some((c) => c[0] === 'reset'), 'the stage is cleared');
});

test('winning or running is reported as before; only going down is a run-ender', async () => {
  for (const outcome of ['win', 'flee']) {
    const r = retryDirector({ outcome });
    r.d.advance();
    let done = null;
    r.d.fight({ live: { setup: { map: 'duchess-corridor', spawn: 'default', seed: 1, enemies: [] } } }, (x) => { done = x; });
    await new Promise((res) => setTimeout(res, 500));
    assert.deepEqual(done, { outcome, hp: 0 });
    assert.equal(r.shown(), 0);
  }
  assert.ok(RETRY_WORDS.button.length < 40);
});

test('the bridge has what the staging needs: the hatch door, Reck, the console to hide behind', () => {
  const def = MAP_DEFS['duchess-bridge'];
  assert.ok(def.doors.some((d) => d.id === 'corridor' && d.to === 'duchess-corridor'));
  assert.ok(def.entries.some((e) => e.door === 'corridor'), 'a two-door entry: the far door is forced open with the hatch');
  assert.ok(def.npcs.some((n) => n.id === 'reck' && n.states?.down?.hidden));
  assert.ok(def.tags.reck.states.includes('alive') && def.tags.reck.states.includes('down'));
});

test('a shot that starts after a signal still hears it (the stand starts after the cut-in has finished)', () => {
  const h = harness();
  h.stager.start('visitors/last');
  h.run(40000, { signals: { 'reck.s2.3': 500 }, until: () => h.stager.running.length === 0 });
  assert.ok(h.w.calls.some((c) => c[0] === 'blow'));
  const before = h.now();
  h.stager.start('visitors/reck-falls');
  h.run(2000);
  assert.ok(h.w.calls.some((c) => c[0] === 'spawn' && c[1] === 'r1'), `Reaver appears within 2 s of the stand starting (${h.now() - before} ms)`);
});

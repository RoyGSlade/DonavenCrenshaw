// Opening B, outcome 1: a talk never holds the player in place. Pure checks of the talk state machine, the barks,
// the pausable reading clock, jobTalk's walk-off ending and the range glue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTalkState, TALK } from '../projects/Space-Shooter/voyage/slice/talkState.js';
import { createBarker, draftLines, TALK_LINES, PASSING_LINES } from '../projects/Space-Shooter/voyage/slice/barks.js';
import { createTalkRange } from '../projects/Space-Shooter/voyage/slice/talkRange.js';
import { createJobTalk, pausableTimer } from '../projects/Space-Shooter/voyage/datapad/jobTalk.js';
import { createBus } from '../projects/Space-Shooter/voyage/story/bus.js';

const types = (events) => events.map((e) => e.type);

test('talk state: near, paused on walking off, resumed on stepping back, ended far away or after too long', () => {
  const s = createTalkState();
  assert.deepEqual(s.step(20, 100), [], 'idle ignores distance');
  s.open('tull');
  assert.equal(s.state, 'near');
  assert.deepEqual(s.step(TALK.near + 3, 100), [], 'a talk that starts across the room does not pause before you have come close');
  assert.deepEqual(s.step(2, 100), []);
  assert.equal(s.canChoose, true, 'choices answer while you stand near, and while you move near');
  assert.deepEqual(types(s.step(TALK.near, 100)), [], 'exactly at the edge is still near');
  assert.deepEqual(types(s.step(TALK.near + 0.2, 100)), ['pause']);
  assert.equal(s.canChoose, false, 'paused: answers wait');
  assert.deepEqual(types(s.step(TALK.near + 1, 100)), [], 'still paused, no repeat');
  assert.deepEqual(types(s.step(TALK.back - 0.1, 100)), ['resume'], 'back inside: resumes');
  assert.equal(s.state, 'near');
  s.step(7, 100);
  const end = s.step(TALK.far + 1, 100);
  assert.deepEqual(types(end), ['end']);
  assert.equal(end[0].why, 'far');
  assert.equal(s.state, 'idle');
  // paused too long
  s.open('nessa');
  s.step(2, 100);
  s.step(7, 100);
  const seen = [];
  for (let ms = 0; ms <= TALK.pauseMs + 200; ms += 100) seen.push(...s.step(7, 100));
  assert.deepEqual(types(seen), ['end']);
  assert.equal(seen[0].why, 'time');
  assert.deepEqual(types(s.close()), [], 'close when already idle says nothing');
});

test('talk state: an intercom speaker (no body, distance null) is always near; hysteresis stops flicker at the edge', () => {
  const s = createTalkState();
  s.open('nessa');
  s.step(1, 100);
  for (let i = 0; i < 50; i++) assert.deepEqual(s.step(null, 100), []);
  s.step(TALK.near + 0.1, 100);
  assert.equal(s.state, 'paused');
  assert.deepEqual(s.step(TALK.near - 0.1, 100), [], 'just inside the edge is not enough to resume: you have to step properly back');
  assert.deepEqual(types(s.step(TALK.back, 100)), ['resume']);
});

test('barks: talk lines per speaker with a default, never the same line twice in a row, passing barks cool down and stay in range', () => {
  let r = 0;
  const rand = () => { r = (r + 0.37) % 1; return r; };
  const b = createBarker({ rand, passCooldownMs: 10000, chance: 1 });
  for (const who of ['tull', 'nessa', 'reck', 'pip', 'reaver', 'stranger']) for (const kind of ['pause', 'resume', 'end']) assert.ok(b.talkLine(kind, who), `${who} ${kind}`);
  let prev = null;
  for (let i = 0; i < 12; i++) { const l = b.talkLine('pause', 'tull'); assert.notEqual(l, prev); prev = l; }
  assert.equal(b.passing('tull', 6, 0), null, 'too far to bark');
  assert.ok(b.passing('tull', 2, 0), 'in range: a line');
  assert.equal(b.passing('tull', 2, 5000), null, 'cooling down');
  assert.ok(b.passing('tull', 2, 11000), 'cooled down');
  assert.equal(b.passing('nobody', 1, 0), null, 'people with no lines stay quiet');
});

test('draft lines are short, plain and all listed', () => {
  const all = draftLines();
  assert.ok(all.length >= 40);
  for (const l of all) { assert.ok(l.text.length <= 60, l.text); assert.ok(!/[–—]/.test(l.text), 'no em or en dashes'); }
  assert.ok(Object.keys(TALK_LINES.pause).includes('tull'));
  assert.ok(Object.keys(PASSING_LINES).includes('nessa'));
});

test('pausable timer: stops while paused, carries the remaining time, can be cancelled', async () => {
  const bus = createBus();
  let fired = 0;
  const cancel = pausableTimer(bus, () => { fired++; }, 120);
  await new Promise((r) => setTimeout(r, 50));
  bus.emit('talk:pause');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(fired, 0, 'paused: it did not fire');
  bus.emit('talk:resume');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(fired, 0, 'only about 70 ms were left');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(fired, 1);
  const c2 = pausableTimer(bus, () => { fired++; }, 30);
  c2();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fired, 1, 'cancelled');
  cancel();
});

const beatView = (over = {}) => ({ node: 'x', portrait: 'tull', speaker: 'Captain Tull', text: 'Hello.', beat: '', choices: [{ index: 0, label: 'Go on', locked: false }, { index: 1, label: 'Stay', locked: false }], ...over });

test('jobTalk: a beat announces who talks, and walking off answers Later while the scene waits', async () => {
  const bus = createBus();
  const seen = [];
  bus.on('talk:open', (d) => seen.push(['open', d.speaker]));
  bus.on('talk:close', (d) => seen.push(['close', d.speaker]));
  const busy = [];
  const jt = createJobTalk({ bus, store: { get: () => ({}) }, onBusy: (on) => busy.push(on) });
  const p = jt.beat(beatView());
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen, [['open', 'tull']]);
  assert.equal(jt.busy, true);
  jt.leave();
  assert.equal(await p, -1, 'a real choice on screen: walking away is Later');
  assert.deepEqual(seen, [['open', 'tull'], ['close', 'tull']]);
  assert.equal(jt.busy, false);
  // A beat can be answered while the player moves: the answer is just an event.
  const p2 = jt.beat(beatView());
  await new Promise((r) => setTimeout(r, 20));
  bus.emit('story:choose', { index: 1 });
  assert.equal(await p2, 1);
});

test('jobTalk: a narrator beat opens the talk with no speaker body to watch', async () => {
  const bus = createBus();
  const seen = [];
  bus.on('talk:open', (d) => seen.push(d.speaker));
  const jt = createJobTalk({ bus, store: { get: () => ({}) } });
  const p = jt.beat(beatView({ portrait: 'narrator', speaker: null }));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen, [null]);
  bus.emit('story:choose', { index: 0 });
  await p;
});

function fakeWorld() {
  const w = { map: { id: 'duchess-mess' }, d: { tull: 2 }, barks: [], talking: [], npcsHere: () => Object.keys(w.d).map((id) => ({ id })), tilesTo: (id) => (id in w.d ? w.d[id] : null), bark: (id, t) => w.barks.push([id, t]), stage: { talking: (id) => w.talking.push(id) } };
  return w;
}

test('talkRange: walking off pauses with a bark, back resumes, far ends the talk as Later; passing barks only outside a talk', () => {
  const bus = createBus();
  const w = fakeWorld();
  const events = [];
  for (const t of ['talk:pause', 'talk:resume', 'talk:end']) bus.on(t, (d) => events.push([t, d?.why || null]));
  let left = 0;
  let clock = 0;
  const range = createTalkRange({ bus, world: () => w, leave: () => { left++; }, canBark: () => true, now: () => clock, rand: () => 0.1, tickMs: 100 });
  clearInterval(range.destroy && 0);
  bus.emit('talk:open', { speaker: 'tull' });
  assert.deepEqual(w.talking, ['tull']);
  range.tick();
  assert.deepEqual(events, []);
  w.d.tull = 7; range.tick();
  assert.deepEqual(events, [['talk:pause', null]]);
  assert.equal(w.barks.length, 1);
  assert.equal(w.barks[0][0], 'tull');
  w.d.tull = 3; range.tick();
  assert.deepEqual(events.at(-1), ['talk:resume', null]);
  w.d.tull = 7; range.tick();
  w.d.tull = 11; range.tick();
  assert.deepEqual(events.at(-1), ['talk:end', 'far']);
  assert.equal(left, 1, 'the talk was left');
  assert.equal(range.state.state, 'idle');
  // leaving the room counts as far
  bus.emit('talk:open', { speaker: 'tull' });
  w.d.tull = 2; range.tick();
  w.map = { id: 'duchess-bridge' }; range.tick();
  w.d.tull = null; // not in this room any more
  for (let i = 0; i < 200 && range.state.active; i++) range.tick();
  assert.equal(range.state.state, 'idle');
  // a passing bark after the talk
  w.map = { id: 'duchess-mess' }; w.d = { nessa: 2 }; w.barks.length = 0; clock = 100000;
  range.tick();
  assert.equal(w.barks.length, 1, 'a bark in passing');
  range.destroy();
});

test('talkRange: no bark while a talk is open or when the page says the screen is busy', () => {
  const bus = createBus();
  const w = fakeWorld();
  let ok = false;
  const range = createTalkRange({ bus, world: () => w, canBark: () => ok, now: () => 1e6, rand: () => 0.1 });
  range.tick();
  assert.equal(w.barks.length, 0, 'screen busy');
  ok = true;
  bus.emit('talk:open', { speaker: 'tull' });
  range.tick();
  assert.equal(w.barks.length, 0, 'in a talk: no ambient bark');
  range.destroy();
});

test('a talk the player walked off from carries on by itself when they come back (no Continue to press)', () => {
  const bus = createBus();
  const w = fakeWorld();
  let resumed = 0, left = 0;
  const range = createTalkRange({ bus, world: () => w, leave: () => { left++; }, resume: () => { resumed++; }, canBark: () => true, now: () => 1e6, rand: () => 0.99, tickMs: 100 });
  bus.emit('talk:open', { speaker: 'tull' });
  w.d.tull = 2; range.tick();
  w.d.tull = 7; range.tick();
  w.d.tull = 11; range.tick();
  assert.equal(left, 1);
  range.tick();
  assert.equal(resumed, 0, 'still far: nothing');
  w.d.tull = 3; range.tick();
  assert.equal(resumed, 1, 'back beside them: it carries on');
  range.tick();
  assert.equal(resumed, 1, 'once');
  range.destroy();
});

test('walking out after a lone "Go on" line carries on (the scene sent you away); a real choice waits', async () => {
  const bus = createBus();
  const jt = createJobTalk({ bus, store: { get: () => ({}) } });
  const lone = { portrait: 'nessa', speaker: 'Nessa', text: 'Go find Pip.', choices: [{ index: 0, label: 'Go find Pip in the engine room.', locked: false }] };
  const p = jt.beat(lone);
  await new Promise((r) => setTimeout(r, 20));
  jt.leave();
  assert.equal(await p, 0, 'taken: no Continue to press');
  const p2 = jt.beat(lone);
  jt.leave();
  assert.equal(await p2, 0, 'even if they leave before the line is read');
});

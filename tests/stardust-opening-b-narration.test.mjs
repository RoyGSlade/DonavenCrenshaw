// Opening B: stage directions are not dialogue. Presentation only: the approved words stay in the data; what the staging performs is
// not shown, the rest is a small caption, and no camera language ever reaches the player.
import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, beatMode, PERFORMED, isCameraLanguage, CAMERA_WORDS, captionMs } from '../projects/Space-Shooter/voyage/slice/narration.js';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { SHOTS } from '../projects/Space-Shooter/voyage/slice/shots.js';
import { createJobTalk } from '../projects/Space-Shooter/voyage/datapad/jobTalk.js';
import { createBus } from '../projects/Space-Shooter/voyage/story/bus.js';

const Q = Object.fromEntries(SLICE_LIST.map((q) => [q.id, q]));

test('every direction the staging performs is marked performed; each one has a shot; the words stay in the data', () => {
  assert.deepEqual([...PERFORMED], ['visitors/breach', 'visitors/last', 'visitors/reck-falls']);
  for (const key of PERFORMED) { assert.ok(SHOTS[key], `${key} has a shot`); const [q, n] = key.split('/'); assert.ok(Q[q].nodes[n].beat.length > 20, 'the original text is untouched in data'); }
  assert.match(Q.visitors.nodes.breach.beat, /^Cut to the outer airlock/, 'approved text unchanged');
});

test('no direction that reaches the player (caption mode) contains camera language; the one that does is performed', () => {
  const rows = audit();
  assert.ok(rows.length >= 50, `${rows.length} direction and narration nodes audited`);
  for (const r of rows) {
    if (r.call === 'caption' || r.call.startsWith('narration box')) assert.ok(!isCameraLanguage(r.text), `${r.key}: "${r.text.slice(0, 60)}" would show camera language`);
  }
  const cam = rows.filter((r) => isCameraLanguage(r.text));
  assert.deepEqual(cam.map((r) => r.key), ['visitors/breach'], 'only the breach direction speaks camera ("Cut to"), and it is performed');
  assert.equal(beatMode('visitors', 'breach'), 'performed');
  assert.ok(!CAMERA_WORDS.test('a cutting torch and a cut of the pay'), 'ordinary words are fine');
  assert.ok(captionMs('x'.repeat(400)) <= 8000 && captionMs('hi') >= 2400);
});

test('jobTalk shows a performed direction nowhere, a plain one as a caption that never waits, and the spoken line at once', async () => {
  const bus = createBus();
  const captions = [], said = [];
  bus.on('talk:caption', (d) => captions.push(d.text));
  bus.on('story:say', (d) => said.push(d.text));
  const jt = createJobTalk({ bus, store: { get: () => ({}) } });
  const view = (node, beat) => ({ quest: { id: 'visitors' }, node, portrait: 'nessa', speaker: 'Nessa', text: 'Spoken.', beat, choices: [{ index: 0, label: 'Go on', locked: false }] });
  const p1 = jt.beat(view('breach', Q.visitors.nodes.breach.beat));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(captions, [], 'performed: no caption, no box');
  assert.deepEqual(said, ['Spoken.'], 'and the spoken line is up at once (no narration box ahead of it)');
  bus.emit('story:choose', { index: 0 }); await p1;
  const p2 = jt.beat(view('reck-chat', 'Reck swings his boots in the gunner seat.'));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(captions, ['Reck swings his boots in the gunner seat.'], 'plain narration: a caption');
  assert.equal(said.length, 2, 'the line did not wait for the caption');
  bus.emit('story:choose', { index: 0 }); await p2;
});

test('in danger there is no Later, and the roll hint has no digits', async () => {
  const bus = createBus();
  const asked = [];
  bus.on('story:choices', (d) => { if (d) asked.push(d.options.map((o) => o.label)); });
  const jt = createJobTalk({ bus, store: { get: () => ({}) } });
  const view = { quest: { id: 'visitors' }, node: 'reck-falls', portrait: 'reck', speaker: 'Reck', text: 'x', choices: [{ index: 0, label: 'Duck', locked: false, check: { name: 'Stealth', dc: 8, chance: 0.5, roll: 'd20 + Stealth 1' } }, { index: 1, label: 'Stand', locked: false }] };
  const p1 = jt.beat(view); await new Promise((r) => setTimeout(r, 20));
  assert.ok(asked[0].includes('Later'), 'calm: Later is there');
  bus.emit('story:choose', { index: 1 }); await p1;
  bus.emit('audio:mood', { mode: 'danger' });
  const p2 = jt.beat(view); await new Promise((r) => setTimeout(r, 20));
  assert.ok(!asked.at(-1).includes('Later'), 'danger: no Later');
  assert.equal(asked.at(-1).length, 2);
  bus.emit('story:choose', { index: 1 }); await p2;
  bus.emit('audio:mood', { mode: 'calm' });
});

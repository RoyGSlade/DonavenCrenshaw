// Opening B, outcome 3: a roll gives help or time, not pass or fail. The roll maths is untouched; what you do decides the branch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { approachFor, verdictWords, createApproach, HELP, WORK_MS, TABLE } from '../projects/Space-Shooter/voyage/slice/assist.js';
import { APPROACH, approachSpec, targetPoint, targetReached, targetDistance } from '../projects/Space-Shooter/voyage/slice/staging.js';
import { tierOf, TIER } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { startQuest, act, view } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { compileMap, walkable } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { resolveStates, applyStates } from '../projects/Space-Shooter/voyage/onfoot/rules/states.js';
import { emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { createCharacter } from '../projects/Space-Shooter/voyage/character.js';
import { SLICE_FLAG } from '../projects/Space-Shooter/voyage/slice/rules.js';

const Q = Object.fromEntries(SLICE_LIST.map((q) => [q.id, q]));
const janitor = () => ({ ...emptySave(), character: createCharacter({ name: 'Janitor', look: { portrait: 'p1' } }, () => 0.5, () => 1), flags: { [SLICE_FLAG]: 1 } });

test('the roll mapping: tier from the existing minigame tiers, help nests upward, time follows the minigame time table', () => {
  const dc = 10;
  const rows = [[25, 2], [20, 2], [15, 1], [14, 0], [12, 0], [10, 0], [9, -1], [5, -1], [4, -2], [1, -2]];
  for (const [total, tier] of rows) {
    const a = approachFor({ total, dc, natural: false }, { baseMs: 20000 });
    assert.equal(a.tier, tier, `total ${total} vs ${dc}`);
    assert.equal(a.tier, tierOf({ total, dc, natural: false }), 'the minigames\' own tier');
    assert.equal(a.timeMs, Math.round(20000 * TIER[String(tier)].time), 'the minigame time multiplier');
    assert.deepEqual(a.help, [...HELP[String(tier)]]);
  }
  assert.equal(approachFor({ total: 3, dc: 20, natural: true }).tier, 2, 'a natural 20 is always Smooth');
  // Nesting: a better tier never has less help, less time or more work.
  let prev = null;
  for (const t of [-2, -1, 0, 1, 2]) {
    const a = approachFor({ total: 10 + { '-2': -8, '-1': -3, 0: 1, 1: 6, 2: 11 }[t], dc: 10, natural: false }, { baseMs: 20000 });
    assert.equal(a.tier, t);
    if (prev) { assert.ok(a.help.length >= prev.help.length); assert.ok(a.timeMs > prev.timeMs); assert.ok(a.workMs <= prev.workMs); for (const h of prev.help) assert.ok(a.help.includes(h)); }
    prev = a;
  }
  assert.deepEqual(approachFor({ total: 25, dc: 10 }).help, ['hint', 'tool', 'hand']);
  assert.equal(approachFor({ total: 25, dc: 10 }).needsHold, false, 'a hand does the work');
  assert.equal(approachFor({ total: 5, dc: 10 }).needsHold, true);
  assert.equal(TABLE.length, 5);
  assert.deepEqual(TABLE.map((r) => r.label), ['Smooth', 'Good', 'Steady', 'Shaky', 'Rough']);
});

test('words under the die say what the roll bought', () => {
  assert.equal(verdictWords(approachFor({ total: 25, dc: 10 }, { baseMs: 20000 })), 'Smooth roll: a hint, a tool and a hand. 26 s.');
  assert.equal(verdictWords(approachFor({ total: 16, dc: 10 }, { baseMs: 20000 })), 'Good roll: a hint and a tool. 23 s.');
  assert.equal(verdictWords(approachFor({ total: 11, dc: 10 }, { baseMs: 20000 })), 'Steady roll: a hint. 20 s.');
  assert.equal(verdictWords(approachFor({ total: 7, dc: 10 }, { baseMs: 20000 })), 'Shaky roll: no help. 17 s.');
});

test('the approach clock: work fills only at the target while holding, time drains always, pass beats a tie, a hand needs no hold', () => {
  const a = approachFor({ total: 11, dc: 10 }, { baseMs: 4000 }); // Steady: 4 s, 1.5 s of work
  const c = createApproach(a);
  assert.equal(c.step({ dtMs: 1000, inReach: false, holding: true }), null, 'not there yet: no work');
  assert.equal(c.workFraction, 0);
  assert.equal(c.step({ dtMs: 1000, inReach: true, holding: false }), null, 'there but not working: no work');
  assert.equal(c.workFraction, 0);
  assert.equal(c.step({ dtMs: 800, inReach: true, holding: true }), null);
  assert.ok(c.workFraction > 0.4 && c.workFraction < 0.7);
  assert.equal(c.step({ dtMs: 100, inReach: true, holding: false }) , null);
  assert.ok(c.workFraction < 0.5, 'let go and it slips back');
  assert.equal(c.step({ dtMs: 4000, inReach: false, holding: false })?.type, 'fail', 'time ran out');
  assert.equal(c.step({ dtMs: 10 }), null, 'an ended approach stays ended');
  // done in time
  const d = createApproach(approachFor({ total: 11, dc: 10 }, { baseMs: 20000 }));
  let ev = null;
  for (let i = 0; i < 40 && !ev; i++) ev = d.step({ dtMs: 100, inReach: true, holding: true });
  assert.equal(ev.type, 'pass');
  // a hand
  const h = createApproach(approachFor({ total: 30, dc: 10 }, { baseMs: 20000 }));
  ev = null;
  for (let i = 0; i < 10 && !ev; i++) ev = h.step({ dtMs: 100, inReach: true, holding: false });
  assert.equal(ev.type, 'pass', 'smooth roll: someone steps in, no hold needed');
  assert.equal(createApproach(approachFor({ total: 11, dc: 10 })).abandon().type, 'abandon');
});

test('the same roll: an approach draws the same dice and the same maths as the old branch', () => {
  const quest = Q.visitors;
  for (let seed = 1; seed <= 25; seed++) {
    const base = startQuest(quest, janitor(), { seed, now: 1 });
    // to bridge-3
    let { run, save } = base;
    for (const idx of [0, 0]) ({ run, save } = act(quest, run, save, { type: 'choose', index: idx }, { now: 1 }));
    assert.equal(run.node, 'bridge-3');
    const legacy = act(quest, run, save, { type: 'choose', index: 0 }, { now: 1 });
    const approach = act(quest, run, save, { type: 'choose', index: 0, assist: true }, { now: 1 });
    assert.deepEqual(approach.rolls, legacy.rolls, 'the same attempt is rolled');
    assert.equal(approach.run.rng, legacy.run.rng, 'the same number of draws');
    assert.deepEqual(approach.run.lastCheck, legacy.run.lastCheck);
    assert.equal(approach.run.node, 'bridge-3', 'but the node has not moved: you still have to do it');
    assert.deepEqual(approach.run.assist, { node: 'bridge-3', index: 0, attempt: { total: legacy.run.lastCheck.total, dc: 10, natural: legacy.run.lastCheck.natural } });
    assert.ok(legacy.run.node === 'clamps' || legacy.run.node === 'reck-chat');
  }
});

test('an approach ends by what you did, whatever the roll: pass and fail both reachable from every roll', () => {
  const quest = Q.visitors;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    let { run, save } = startQuest(quest, janitor(), { seed, now: 1 });
    for (const idx of [0, 0]) ({ run, save } = act(quest, run, save, { type: 'choose', index: idx }, { now: 1 }));
    const picked = act(quest, run, save, { type: 'choose', index: 0, assist: true }, { now: 1 });
    assert.equal(view(quest, picked.run, picked.save).assist.index, 0, 'the view says an approach is waiting');
    const pass = act(quest, picked.run, picked.save, { type: 'assist', branch: 'pass' }, { now: 1 });
    assert.equal(pass.run.node, 'clamps');
    assert.equal(pass.run.assist, null);
    const fail = act(quest, picked.run, picked.save, { type: 'assist', branch: 'fail' }, { now: 1 });
    assert.equal(fail.run.node, 'reck-chat');
    const gave = act(quest, picked.run, picked.save, { type: 'assist', branch: 'abandon' }, { now: 1 });
    assert.equal(gave.run.node, 'bridge-3', 'giving up leaves the beat as it was');
    assert.equal(gave.run.assist, null);
    const other = act(quest, picked.run, picked.save, { type: 'choose', index: 2 }, { now: 1 });
    assert.equal(other.run.node, 'reck-chat', 'picking another option while one runs takes the other');
    assert.equal(other.run.assist, null);
    assert.ok(act(quest, run, save, { type: 'assist', branch: 'pass' }, { now: 1 }).error, 'no approach, no ending');
    assert.ok(act(quest, picked.run, picked.save, { type: 'assist', branch: 'maybe' }, { now: 1 }).error);
  }
});

const compiled = (room, flags = {}) => { const def = MAP_DEFS[room]; return compileMap(applyStates(def, resolveStates(def, flags))); };

test('staging: every rolled choice without a minigame in scenes 1 to 6 has an approach, and every approach names a real rolled choice', () => {
  const rolled = [];
  for (const q of SLICE_LIST) for (const [nid, n] of Object.entries(q.nodes)) (n.choices || []).forEach((c, i) => { if (c.check && !c.minigame) rolled.push(`${q.id}/${nid}/${i}`); });
  const keys = Object.keys(APPROACH);
  assert.deepEqual(rolled.filter((k) => !keys.includes(k)), [], 'a rolled choice with nothing to do');
  assert.deepEqual(keys.filter((k) => !rolled.includes(k)), [], 'an approach for a choice that is not rolled or is a minigame');
  assert.ok(keys.length >= 20, `${keys.length} approaches`);
});

test('staging: every approach target exists in its room, can be reached on foot, and its words are short and plain', () => {
  for (const [key, spec] of Object.entries(APPROACH)) {
    const [qid, nid] = key.split('/');
    const room = spec.map || Q[qid].nodes[nid].room;
    // A flag can remove a prop (Reck, Nessa); try the states the scene can be in.
    const maps = [{}, { 'reck-down': 1 }, { 'nessa-quit': 1 }, { 'duchess-busted': 1 }].map((f) => compiled(room, f));
    const found = maps.map((m) => ({ m, t: targetPoint(m, spec.where) })).find((x) => x.t);
    assert.ok(found, `${key}: ${JSON.stringify(spec.where)} is in ${room}`);
    const { m, t } = found;
    // reachable: some walkable spot within reach of the target
    let ok = false;
    for (let x = 12; x < m.w && !ok; x += 12) for (let y = 12; y < m.h && !ok; y += 12) if (walkable(m, x, y, 14) && targetReached(t, x, y)) ok = true;
    assert.ok(ok, `${key}: a player can stand within reach`);
    assert.ok(spec.verb && spec.verb.length <= 32, `${key} verb`);
    assert.ok(spec.hint && spec.hint.length <= 60, `${key} hint`);
    assert.ok(spec.baseMs >= 6000 && spec.baseMs <= 60000, `${key} time`);
    for (const line of [spec.hand?.line, spec.forces?.line, spec.tool]) assert.ok(line && line.length <= 50, `${key}: ${line}`);
    for (const line of [spec.verb, spec.hint, spec.hand.line, spec.forces.line, spec.tool]) assert.ok(!/[–—]/.test(line), 'no em or en dashes');
  }
});

test('staging: the duck-behind-the-console spot is out of the hatch\'s line and closer than the helm', () => {
  const m = compiled('duchess-bridge');
  const t = targetPoint(m, APPROACH['visitors/reck-falls/0'].where);
  assert.ok(t.x < 12 * 48, 'inside the bridge');
  assert.equal(approachSpec('visitors', 'reck-falls', 0).workScale, 0.4);
  assert.equal(approachSpec('visitors', 'reck-falls', 9), null);
  assert.ok(targetDistance({ x: 0, y: 0, reach: 10 }, 3, 4) === 5);
});

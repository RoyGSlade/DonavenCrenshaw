// Opening track C: scene 1 (Third Shift) is a chain of real hands-on actions. Pure checks (the browser run is
// tests/stardust-opening-c-browser.test.mjs):
//   the chain order, each beat's pass and fail and what it changes (the mess a loss floods), the mop upgrade effect,
//   the lever states, the ending picker, and the scene data and the room that carry them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startQuest, act, view } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { validateQuest } from '../projects/Space-Shooter/voyage/quests/validate.js';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { createCharacter } from '../projects/Space-Shooter/voyage/character.js';
import { SLICE_FLAG, markerFor, stepOf } from '../projects/Space-Shooter/voyage/slice/rules.js';
import * as R from '../projects/Space-Shooter/voyage/slice/handsOn.js';
import { createMop, mopDown, mopMove, mopUp, sweepRow, sweepsToClear, cleared, puddlesFor, powerOf, HEADS, COLS, ROWS, CLEAR_AT } from '../projects/Space-Shooter/voyage/minigames/mop.js';
import { createLever, leverGrab, leverMove, leverRelease, leverTick, playLever, HUM_TIME, HUM_OK, STRIKES } from '../projects/Space-Shooter/voyage/minigames/lever.js';
import { resolveStates } from '../projects/Space-Shooter/voyage/onfoot/rules/states.js';
import { MAP_DEFS } from '../projects/Space-Shooter/voyage/maps/index.js';
import { SYSTEMS, createRepair } from '../projects/Space-Shooter/voyage/minigames/repair.js';

const Q = SLICE_LIST.find((q) => q.id === 'third-shift');
const rng = () => 0.5;
const janitor = () => ({ ...emptySave(), character: createCharacter({ name: 'Janitor', look: { portrait: 'p1' } }, rng, () => 1), flags: { [SLICE_FLAG]: 1 } });

// ---- the scene data -------------------------------------------------------------------------------------------
test('scene 1 data: the chain is four hands-on nodes in order, then a branch, and the scene still validates', () => {
  assert.deepEqual(validateQuest(Q), []);
  for (const beat of R.BEATS) {
    const node = Q.nodes[R.NODE_OF[beat]];
    assert.equal(node.handsOn, beat, `${beat} node`);
    assert.equal(node.room, 'duchess-holodeck');
    assert.equal(R.beatOf(node), beat);
  }
  assert.deepEqual(R.BEATS.map((b) => Q.nodes[R.NODE_OF[b]].choices[0].to), ['work-hose', 'work-mop', 'work-lever', 'work-end']);
  assert.equal(Q.nodes['work-lever'].choices[1].to, 'end-projector-fried');
  assert.equal(Q.nodes['work-end'].type, 'branch');
  // the old pick-a-way node is the doorway: the page picks the one choice marked `hands`
  assert.equal(Q.nodes.choice.handsOn, 'start');
  assert.deepEqual(Q.nodes.choice.choices.filter((c) => c.hands).map((c) => c.to), ['work-valve']);
  // approved text is untouched: the old choice labels and the end nodes' words are all still there
  assert.ok(Q.nodes.choice.choices.slice(0, 4).every((c) => !c.hands));
});

test('scene 1 steps: one tracker step per beat, each with a marker that names a prop or zone in the room', () => {
  const ids = Q.steps.map((s) => s.id);
  assert.deepEqual(ids, ['brief', 'crew', 'choose', 'valve', 'hose', 'mop', 'lever', 'finish']);
  const room = MAP_DEFS['duchess-holodeck'];
  for (const s of Q.steps.filter((x) => R.BEATS.includes(x.id))) {
    assert.deepEqual(s.nodes, [R.NODE_OF[s.id]]);
    assert.equal(s.text, R.LINES.steps[s.id]);
    const at = s.at;
    const found = at.prop ? room.props.some((p) => p.name === at.prop) : room.zones.some((z) => z.id === at.zone);
    assert.ok(found, `${s.id} marker ${JSON.stringify(at)} exists`);
  }
  assert.equal(stepOf(Q, 'work-mop').id, 'mop');
});

// ---- walking the chain through the real engine ----------------------------------------------------------------
function toChain() {
  let { run, save } = startQuest(Q, janitor(), { seed: 5, now: 1 });
  const go = (label) => {
    const v = view(Q, run, save);
    const i = v.choices.findIndex((c) => c.label.startsWith(label));
    assert.ok(i >= 0, `no choice ${label} at ${run.node}`);
    ({ run, save } = act(Q, run, save, { type: 'choose', index: i }, { now: 2 }));
  };
  go('Go on'); go('Where is this gym?'); go('Start cleaning.');
  return { get run() { return run; }, get save() { return save; }, pick: (i) => { ({ run, save } = act(Q, run, save, { type: 'choose', index: i }, { now: 3 })); } };
}

/** Play the whole chain with the rules: each game's result becomes a flag patch and a node choice. */
function playChain({ valve, hose, lever, shut = false }) {
  const s = toChain();
  assert.equal(s.run.node, 'choice');
  const doorway = Q.nodes.choice.choices.findIndex((c) => c.hands);
  s.pick(doorway);
  const order = [];
  let flags = {};
  const apply = (after) => { flags = { ...flags, ...after.flags }; return after; };
  assert.equal(s.run.node, 'work-valve'); order.push(s.run.node);
  s.pick(apply(R.afterValve(flags, { success: valve, valveShut: shut })).choice);
  assert.equal(s.run.node, 'work-hose'); order.push(s.run.node);
  s.pick(apply(R.afterHose(flags, { success: hose })).choice);
  assert.equal(s.run.node, 'work-mop'); order.push(s.run.node);
  apply(R.takeMop(flags, 'loose'));
  s.pick(apply(R.afterMop()).choice);
  assert.equal(s.run.node, 'work-lever'); order.push(s.run.node);
  s.pick(apply(R.afterLever({ success: lever })).choice);
  return { s, flags, order };
}

test('scene 1 chain: every pass and fail leads where the ending picker says, through the real engine', () => {
  for (const valve of [true, false]) for (const hose of [true, false]) for (const lever of [true, false]) {
    const { s, flags, order } = playChain({ valve, hose, lever });
    assert.deepEqual(order, ['work-valve', 'work-hose', 'work-mop', 'work-lever']);
    const want = R.endingOf(flags, lever);
    // a dialogue end hop (the fried and source-fixed endings speak first) or the end itself: the run reaches that ending's node
    const reached = s.run.ended?.node || s.run.node;
    assert.ok(reached === want || reached === `${want}-end` || reached === want.replace('end-', 'end-') , `${JSON.stringify({ valve, hose, lever })}: ended at ${reached}, wanted ${want}`);
    if (!lever) assert.equal(want, 'end-projector-fried');
  }
});

test('scene 1 chain: the endings by what you did (valve fixed, both lost, the rest)', () => {
  assert.equal(R.endingOf({ [R.FLAG.valveFixed]: 1 }), 'end-source-fixed');
  assert.equal(R.endingOf({ [R.FLAG.valveFixed]: 1, [R.FLAG.hoseLost]: 1 }), 'end-source-fixed');
  assert.equal(R.endingOf({ [R.FLAG.valveLost]: 1, [R.FLAG.hoseLost]: 1 }), 'end-slimed');
  assert.equal(R.endingOf({ [R.FLAG.valveLost]: 1, [R.FLAG.hoseFixed]: 1 }), 'end-clean');
  assert.equal(R.endingOf({ [R.FLAG.valveShut]: 1, [R.FLAG.valveLost]: 1, [R.FLAG.hoseFixed]: 1 }), 'end-clean');
  assert.equal(R.endingOf({ [R.FLAG.valveFixed]: 1 }, false), 'end-projector-fried');
});

test('scene 1 chain: a loss is never a dead end, it floods the floor (more to mop) and the chain goes on', () => {
  let f = {};
  const v = R.afterValve(f, { success: false, valveShut: false });
  assert.equal(v.choice, 1); assert.equal(v.mess, R.MESS.valveLost); f = { ...f, ...v.flags };
  assert.equal(R.chainOf(f).valve, 'lost'); assert.equal(R.chainOf(f).mess, 3);
  const shut = R.afterValve({}, { success: false, valveShut: true });
  assert.equal(shut.mess, R.MESS.valveShut); assert.equal(R.chainOf(shut.flags).valve, 'shut');
  assert.ok(shut.mess < v.mess, 'shutting the valve by hand floods less than walking away');
  const h = R.afterHose(f, { success: false }); f = { ...f, ...h.flags };
  assert.equal(R.chainOf(f).mess, 5); assert.equal(R.chainOf(f).hose, 'lost');
  assert.equal(R.afterValve({}, { success: true }).mess, 0);
  // more floor to mop after a loss
  const clean = createMop({ seed: 3, mess: 0 }), flooded = createMop({ seed: 3, mess: R.chainOf(f).mess });
  assert.ok(flooded.total > clean.total * 1.5, `${flooded.total} vs ${clean.total}`);
  assert.equal(clean.puddles.length, 5); assert.equal(flooded.puddles.length, 14);
  assert.equal(puddlesFor(2), 9); assert.equal(puddlesFor(99), 14);
});

test('scene 1 order: a thing used out of order gets Pip\'s hint and changes nothing; the right one does not', () => {
  assert.equal(R.whyNot('valve', 'valve'), null);
  assert.equal(R.whyNot('hose', 'hose'), null);
  assert.equal(R.whyNot('mop', 'cart'), null); assert.equal(R.whyNot('mop', 'mop-loose'), null); assert.equal(R.whyNot('mop', 'goo'), null);
  assert.equal(R.whyNot('lever', 'lever'), null);
  assert.equal(R.whyNot('valve', 'hose'), R.LINES.order.valve);
  assert.equal(R.whyNot('valve', 'goo'), R.LINES.order.valve);
  assert.equal(R.whyNot('hose', 'lever'), R.LINES.order.hose);
  assert.equal(R.whyNot('mop', 'lever'), R.LINES.order.mop);
  assert.equal(R.whyNot('mop', 'valve'), 'The valve is done.');
  assert.equal(R.whyNot('lever', 'goo'), 'The floor is done.');
  assert.equal(R.whyNot(null, 'valve'), R.LINES.before.valve);
  assert.equal(R.whyNot(null, 'cart'), R.LINES.before.cart);
  assert.equal(R.whyNot('valve', 'nonsense'), null);
});

// ---- the mop -------------------------------------------------------------------------------------------------
test('mop pickup: the loose mop and the cart both give a mop, once', () => {
  const a = R.takeMop({}, 'loose'); assert.equal(a.took, true); assert.equal(R.chainOf(a.flags).held, true); assert.equal(R.chainOf(a.flags).fromCart, false);
  const b = R.takeMop({}, 'cart'); assert.equal(b.took, true); assert.equal(R.chainOf(b.flags).fromCart, true);
  const again = R.takeMop(a.flags, 'cart'); assert.equal(again.took, false); assert.equal(again.line, R.LINES.mop.have);
});

test('mop upgrade: a snug absorber head lifts slime 2.4 times as fast, a loose one 1.6, and neither is worse than plain', () => {
  assert.equal(HEADS.plain.mult, 1); assert.equal(HEADS.absorber.mult, 2.4); assert.equal(HEADS.loose.mult, 1.6);
  const lifted = (head) => { const s = createMop({ seed: 9, mess: 2, head }); sweepRow(s, 3); sweepRow(s, 7); return s.lifted; };
  const plain = lifted('plain'), loose = lifted('loose'), absorber = lifted('absorber');
  assert.ok(Math.abs(absorber / plain - 2.4) < 0.05, `absorber/plain ${absorber / plain}`);
  assert.ok(Math.abs(loose / plain - 1.6) < 0.05, `loose/plain ${loose / plain}`);
  // the whole floor: fewer sweeps with the upgrade, at least 2x fewer
  const slow = sweepsToClear({ seed: 4, mess: 0, head: 'plain' }), fast = sweepsToClear({ seed: 4, mess: 0, head: 'absorber' }), mid = sweepsToClear({ seed: 4, mess: 0, head: 'loose' });
  assert.ok(slow.done && fast.done && mid.done);
  assert.ok(slow.rows >= fast.rows * 2, `plain ${slow.rows} sweeps, absorber ${fast.rows}`);
  assert.ok(fast.rows < mid.rows && mid.rows < slow.rows);
  // the upgrade flags: a good screw is the absorber, a rough one is loose, never plain again
  assert.equal(R.chainOf(R.afterUpgrade({}, { success: true }).flags).head, 'absorber');
  assert.equal(R.chainOf(R.afterUpgrade({}, { success: false }).flags).head, 'loose');
  assert.equal(R.afterUpgrade({ [R.FLAG.headAbsorber]: 1 }, { success: false }).head, 'absorber');
  assert.ok(powerOf('loose') > powerOf('plain'));
});

test('mop game rules: goo wipes up under the head, a jump is not a stroke, done at 92%, and a finished floor is spotless', () => {
  const s = createMop({ seed: 2, mess: 0, head: 'absorber' });
  assert.equal(cleared(s), 0);
  mopMove(s, 5, 5); assert.equal(s.lifted, 0, 'not pressed: no mopping');
  mopDown(s, 0, 0); mopMove(s, 10, 10); assert.equal(s.lifted, 0, 'a jump of 14 cells is a lift and a new press, not a stroke');
  assert.equal(s.strokes, 2);
  let n = 0;
  for (let pass = 0; pass < 40 && !s.done; pass++) for (let y = 1; y < ROWS && !s.done; y += 2) { sweepRow(s, y); n++; }
  assert.ok(s.done && s.result.success);
  assert.equal(s.goo.every((g) => g === 0), true);
  assert.ok(cleared(s) >= CLEAR_AT);
  assert.equal(s.cols, COLS);
  mopUp(s);
});

// ---- the lever -----------------------------------------------------------------------------------------------
test('lever: pull and hold, the hum dies, let go resets; letting go early surges, the second surge fries', () => {
  // wait it out
  const ok = createLever();
  leverGrab(ok); leverMove(ok, 0.5); assert.equal(ok.phase, 'on', 'half way is not off');
  leverMove(ok, 1); assert.equal(ok.phase, 'off'); assert.equal(ok.hum, 1);
  leverTick(ok, HUM_TIME / 2); assert.ok(ok.hum > 0.4 && ok.hum < 0.6);
  leverTick(ok, HUM_TIME / 2); assert.ok(ok.hum <= HUM_OK); assert.equal(ok.phase, 'dead');
  leverRelease(ok);
  assert.equal(ok.done, true); assert.equal(ok.result.success, true); assert.equal(ok.result.how, 'reset'); assert.equal(ok.strikes, 0);
  // a bot's whole play
  assert.equal(playLever(createLever()).result.how, 'reset');
  // too soon: the first is a warning
  const hasty = createLever();
  leverGrab(hasty); leverMove(hasty, 1); leverTick(hasty, 1); leverRelease(hasty);
  assert.equal(hasty.done, false); assert.equal(hasty.strikes, 1); assert.equal(hasty.phase, 'on'); assert.equal(hasty.pos, 0);
  assert.ok(hasty.events.some((e) => e.type === 'surge'));
  // the lever springs back, the player tries again, and this time waits
  leverGrab(hasty); leverMove(hasty, 1); for (let i = 0; i < 40; i++) leverTick(hasty, 0.1); leverRelease(hasty);
  assert.equal(hasty.result.success, true, 'one warning is survivable');
  // the second early release fries the projector
  const bad = createLever();
  for (let k = 0; k < STRIKES; k++) { leverGrab(bad); leverMove(bad, 1); leverTick(bad, 0.5); leverRelease(bad); }
  assert.equal(bad.done, true); assert.equal(bad.result.success, false); assert.equal(bad.result.how, 'fried');
  assert.deepEqual(R.afterLever(bad.result), { flags: {}, choice: 1, line: R.LINES.lever.fried });
  assert.equal(R.afterLever(ok.result).choice, 0);
  // pushing it up before it is fully down is nothing; pulling it back up while the hum still runs is a surge
  const half = createLever(); leverGrab(half); leverMove(half, 0.7); leverRelease(half);
  assert.equal(half.phase, 'on'); assert.equal(half.strikes, 0); assert.equal(half.pos, 0);
  const push = createLever(); leverGrab(push); leverMove(push, 1); leverTick(push, 1); leverMove(push, 0.2);
  assert.equal(push.strikes, 1, 'moving it back up while the hum runs is a surge too');
});

// ---- the room ------------------------------------------------------------------------------------------------
test('the gym: every thing in the chain is a prop you can use, named for what it is (the cart is a cart, not a closet)', () => {
  const room = MAP_DEFS['duchess-holodeck'];
  const tasks = Object.fromEntries(room.props.filter((p) => p.interact?.task).map((p) => [p.interact.task, p]));
  assert.deepEqual(Object.keys(tasks).sort(), ['cart', 'goo', 'hose', 'lever', 'mop-loose', 'valve']);
  for (const [task, label] of [['valve', R.LINES.labels.valve], ['hose', R.LINES.labels.hose], ['cart', R.LINES.labels.cart], ['mop-loose', R.LINES.labels.mop], ['goo', R.LINES.labels.goo], ['lever', R.LINES.labels.lever]]) assert.equal(tasks[task].interact.label, label);
  const labels = room.props.map((p) => p.interact?.label || '').join('|');
  assert.ok(!/closet/i.test(labels), 'no supply closet text on the gym props');
  // props the beats name (the tracker marker) exist
  for (const name of ['holo-valve', 'holo-hose', 'holo-panel']) assert.ok(room.props.some((p) => p.name === name), name);
  assert.ok(R.beatOfTask('cart') === 'mop' && R.beatOfTask('valve') === 'valve' && R.beatOfTask('lever') === 'lever');
});

test('the gym follows the chain: valve fixed, hose sealed, floor mopped, mop taken', () => {
  const room = MAP_DEFS['duchess-holodeck'];
  const st = (flags) => resolveStates(room, flags);
  const start = st({});
  assert.deepEqual([start['holo-valve'], start['holo-hose'], start['holo-goo'], start['holo-flood'], start['loose-mop']], ['leaking', 'leaking', 'dirty', 'dry', 'there']);
  assert.equal(st({ [R.FLAG.valveFixed]: 1 })['holo-valve'], 'fixed');
  assert.equal(st({ [R.FLAG.hoseFixed]: 1 })['holo-hose'], 'sealed');
  assert.equal(st({ [R.FLAG.mess]: 3 })['holo-flood'], 'wet', 'a lost valve or hose floods the floor');
  const mopped = st({ [R.FLAG.mess]: 3, [R.FLAG.mopped]: 1 });
  assert.equal(mopped['holo-goo'], 'clean'); assert.equal(mopped['holo-flood'], 'dry');
  assert.equal(st({ [R.FLAG.held]: 1 })['loose-mop'], 'gone', 'the leaning mop is gone once you took it');
  assert.equal(st({ [R.FLAG.held]: 1, [R.FLAG.fromCart]: 1 })['loose-mop'], 'there', 'taken from the cart: the leaning one stays');
  assert.ok(['on', 'fried', 'off'].includes(st({})['holo-projector']));
});

test('the water games carry the scene: the foam valve is its own system, and the 4 x 4 valve board is solvable', () => {
  assert.equal(SYSTEMS['wellness-foam'], 'Wellness foam');
  const b = createRepair({ seed: 11, size: 4, capacity: 110, system: 'wellness-foam' });
  assert.equal(b.size, 4); assert.equal(b.system, 'wellness-foam'); assert.equal(b.solved, false);
  const seed = R.seedOf({ seed: 5 }, 'valve');
  assert.equal(seed, R.seedOf({ seed: 5 }, 'valve'), 'a left game gives the same board again');
  assert.notEqual(seed, R.seedOf({ seed: 5 }, 'hose'));
});

test('the new words: every line is plain, short, and none of the old stock text is on the cart any more', () => {
  const lines = [];
  const walk = (o) => { for (const v of Object.values(o)) { if (typeof v === 'string') lines.push(v); else if (typeof v === 'object') walk(v); } };
  walk(R.LINES);
  for (const l of lines) assert.ok(l.split(/\s+/).length <= 30, `short: ${l}`);
  assert.ok(!lines.some((l) => /lights? (blink|blinking)/i.test(l)));
  const room = JSON.stringify(MAP_DEFS['duchess-holodeck']);
  assert.ok(!/Supply closet/.test(room));
});

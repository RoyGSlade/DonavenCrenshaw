// The three mini-games in the opening scenes (scene 3 airlock hack, scene 4 haggle with Tull, scene 5 coolant repair), on the REAL
// slice data and the REAL engine. Written before the build (launch/scenemini): the hooks, the payouts and the reachability of every
// approved outcome come from launch/minigames/SCENE-HOOKS.md. Pure: no browser. The page side is tests/stardust-scenemini-browser.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { validateQuest } from '../projects/Space-Shooter/voyage/quests/validate.js';
import { startQuest, act, view } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { explore } from '../projects/Space-Shooter/voyage/quests/explore.js';
import { emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { createCharacter } from '../projects/Space-Shooter/voyage/character.js';
import { SLICE_FLAG } from '../projects/Space-Shooter/voyage/slice/rules.js';
import { SCENE_HOOKS } from '../projects/Space-Shooter/voyage/minigames/sceneHookData.js';
import { startHook, branchOf } from '../projects/Space-Shooter/voyage/minigames/sceneHook.js';
import { attemptWords } from '../projects/Space-Shooter/voyage/ui/attemptRoll.js';
import { eventText } from '../projects/Space-Shooter/voyage/quests/ui/player.js';
import { ready as modulesReady } from '../projects/Space-Shooter/voyage/modules/registry.js';
await modulesReady(); // scene-hook validation reads each game's manifest from the module registry

const Q = Object.fromEntries(SLICE_LIST.map((q) => [q.id, q]));
const rng = () => 0.5;
const save0 = () => ({ ...emptySave(), money: 50, rep: { tull: 5 }, character: createCharacter({ name: 'Janitor', look: { portrait: 'p1' } }, rng, () => 1), flags: { [SLICE_FLAG]: 1 } });
const HOOKS = {
  coolant: { scene: 'gunners-week', node: 'engine-brief-2', label: 'Patch the line with a wrench and tape.', block: { kind: 'repair', title: 'Coolant line' } },
  airlock: { scene: 'hold-the-corridor', node: 'corridor', label: 'Hack the inner airlock door shut from the corridor panel.', block: { kind: 'hack', lock: 2, title: 'Inner airlock door' } },
};
const HAGGLE_NODES = ['desk-2', 'seven', 'ledger'];
const HAGGLE_BLOCK = { kind: 'haggle', who: 'Captain Tull', what: 'your share', open: 20, best: 30, mid: 'end-hired-fair' };

const choicesOf = (id, node) => Q[id].nodes[node].choices;

// Single-way nodes are taken by themselves; `via` names the fork picks on the way (label starts). The ledger's hack check rolls
// from the seed, so seeds are tried until it passes (a plain check with no minigame).
function toNode(id, node, via = []) {
  const quest = Q[id];
  for (let seed = 7; seed < 400; seed++) {
    let { run, save } = startQuest(quest, save0(), { seed, now: 1 });
    const queue = [...via];
    for (let i = 0; i < 60 && run.node !== node; i++) {
      const open = view(quest, run, save).choices.filter((c) => !c.locked);
      const pick = open.length === 1 ? open[0] : open.find((c) => c.label.startsWith(queue[0] ?? '\0')) || open[0];
      if (open.length > 1 && queue.length) queue.shift();
      const r = act(quest, run, save, { type: 'choose', index: pick.index }, { now: 1 });
      if (r.error) break; run = r.run; save = r.save;
    }
    if (run.node === node) return { quest, run, save };
  }
  assert.fail(`no seed reaches ${node}`);
}
const ROUTE = { 'desk-2': [], seven: ['What happened'], ledger: ['Read the ledger'] };
const finish = (quest, run, save) => {
  for (let i = 0; i < 12 && !run.ended; i++) {
    const open = view(quest, run, save).choices?.filter((c) => !c.locked) || [];
    if (!open.length) break;
    const n = act(quest, run, save, { type: 'choose', index: open[0].index }, { now: 1 });
    assert.equal(n.error, undefined); run = n.run; save = n.save;
  }
  return { run, save };
};

test('the five hooked choices carry exactly the approved minigame blocks, and every scene still validates', () => {
  for (const h of Object.values(HOOKS)) {
    const c = choicesOf(h.scene, h.node).find((x) => x.label === h.label);
    assert.deepEqual(c.minigame, h.block, `${h.scene}/${h.node}`);
    assert.ok(c.check, 'the choice keeps its d20 check');
  }
  for (const node of HAGGLE_NODES) {
    const hag = choicesOf('the-eighth-gunner', node).filter((x) => x.label.startsWith('Haggle'));
    assert.equal(hag.length, 1, `${node} has one haggle choice`);
    assert.deepEqual(hag[0].minigame, HAGGLE_BLOCK, node);
  }
  const hooked = SLICE_LIST.flatMap((q) => Object.values(q.nodes).flatMap((n) => (n.choices || []).filter((c) => c.minigame)));
  assert.equal(hooked.length, 5, 'five hooks and no more');
  for (const q of SLICE_LIST) assert.deepEqual(validateQuest(q), [], q.id);
  assert.deepEqual(SCENE_HOOKS.map((h) => h.minigame), [HOOKS.coolant.block, HOOKS.airlock.block, HAGGLE_BLOCK].map((b) => b));
});

test('the validator rejects a broken minigame block', () => {
  const bad = structuredClone(Q['the-eighth-gunner']);
  bad.nodes['desk-2'].choices.find((c) => c.minigame).minigame.mid = 'no-such-node';
  assert.ok(validateQuest(bad).some((e) => /mid node no-such-node does not exist/.test(e)), validateQuest(bad).join('\n'));
  const bad2 = structuredClone(Q['hold-the-corridor']);
  bad2.nodes.corridor.choices.find((c) => c.minigame).minigame.lock = 9;
  assert.ok(validateQuest(bad2).some((e) => /lock is a whole number 1 to 4/.test(e)));
  const bad3 = structuredClone(Q['gunners-week']);
  bad3.nodes['engine-brief-2'].choices.find((c) => c.minigame).check.skill = 'social';
  assert.ok(validateQuest(bad3).some((e) => /should be repair/.test(e)));
});

test('a hooked choice rolls the d20, stays on the node, and waits for the minigame', () => {
  const h = HOOKS.coolant;
  const { quest, run, save } = toNode(h.scene, h.node);
  const v = view(quest, run, save);
  const c = v.choices.find((x) => x.label === h.label);
  assert.deepEqual([c.minigame.kind, c.minigame.title, c.check.dc], ['repair', 'Coolant line', 12]);
  const r = act(quest, run, save, { type: 'choose', index: c.index }, { now: 1 });
  assert.equal(r.error, undefined);
  assert.equal(r.run.node, h.node, 'still on the node: the page plays the minigame');
  assert.equal(r.run.minigame.kind, 'repair'); assert.equal(r.rolls.length, 1, 'the d20 shows on the dice');
  assert.deepEqual(Object.keys(r.run.minigame.attempt).sort(), ['dc', 'natural', 'total']);
  assert.equal(view(quest, r.run, r.save).minigame.kind, 'repair', 'a reload can reopen it');
  assert.ok(startHook(quest.nodes[h.node].choices[c.index], r.run.minigame.attempt, r.save.character).tier >= -2);
  assert.equal(act(quest, r.run, r.save, { type: 'choose', index: 0 }, { now: 1 }).error, 'Finish the minigame first.');
  assert.equal(act(quest, run, save, { type: 'minigame', branch: 'win' }, { now: 1 }).error, 'No minigame to finish.');
  assert.equal(act(quest, r.run, r.save, { type: 'minigame', branch: 'mid' }, { now: 1 }).error, 'That minigame has no such ending.');
  assert.equal(act(quest, r.run, r.save, { type: 'minigame', branch: 'bogus' }, { now: 1 }).error, 'That minigame has no such ending.');
});

// scene, node, label, branch -> where it ends, money, rep, flags (the table in SCENE-HOOKS.md section 2)
const TABLE = [
  ['coolant', 'win', 'end-steady-end', 'steady', 25, 2, ['coolant-fixed', 'nessa-quit', 'pip-quit'], [], { 'hull-patch': 1 }],
  ['coolant', 'lose', 'end-spray-end', 'spray', -15, 0, ['nessa-quit', 'pip-quit'], ['coolant-fixed'], { 'hull-patch': 1 }],
  ['airlock', 'win', 'end-sealed-end', 'sealed', 20, 3, ['airlock-sealed', 'reavers-repelled'], [], {}],
];
for (const [key, branch, end, outcome, money, rep, flags, notFlags, items] of TABLE) {
  test(`scene ${key === 'coolant' ? 5 : 3}: ${key} ${branch} -> ${outcome} (${money} credits)`, () => {
    const h = HOOKS[key];
    const { quest, run, save } = toNode(h.scene, h.node);
    const idx = quest.nodes[h.node].choices.findIndex((x) => x.label === h.label);
    let r = act(quest, run, save, { type: 'choose', index: idx }, { now: 1 });
    const before = r.save; // rewards on the way (turret, scan) are already paid
    r = act(quest, r.run, r.save, { type: 'minigame', branch, xp: 3, skill: 'repair' }, { now: 1 });
    assert.equal(r.error, undefined);
    assert.ok(r.events.some((e) => e.type === 'skill-xp' && e.xp === 3), 'the XP shows as an event');
    const out = finish(quest, r.run, r.save);
    assert.equal(out.run.node, end); assert.equal(out.run.ended.outcome, outcome);
    assert.equal(out.save.money - before.money, Math.max(-before.money, money) , 'the ending pays its own money');
    assert.equal((out.save.rep.tull || 0) - (before.rep.tull || 0), rep);
    for (const f of flags) assert.ok(out.save.flags[f], f);
    for (const f of notFlags) assert.ok(!out.save.flags[f], `${f} not set`);
    for (const [id, n] of Object.entries(items)) assert.equal((out.save.items[id] || 0) - (before.items[id] || 0), n, id);
  });
}

test('scene 3: a failed hack falls into the corridor fight (held +15, overrun -20); a won fight after a lost hack never seals the door', () => {
  const h = HOOKS.airlock;
  const play = (fight) => {
    const { quest, run, save } = toNode(h.scene, h.node);
    const idx = quest.nodes[h.node].choices.findIndex((x) => x.label === h.label);
    let r = act(quest, run, save, { type: 'choose', index: idx }, { now: 1 });
    r = act(quest, r.run, r.save, { type: 'minigame', branch: 'lose', xp: 0, skill: 'hacking' }, { now: 1 });
    assert.equal(r.run.node, 'fight-hold');
    r = act(quest, r.run, r.save, { type: 'live', outcome: fight, hp: 30 }, { now: 1 });
    assert.equal(r.error, undefined);
    return finish(quest, r.run, r.save);
  };
  const won = play('win'), lost = play('lose');
  assert.equal(won.run.ended.outcome, 'held'); assert.equal(lost.run.ended.outcome, 'overrun');
  assert.ok(!won.save.flags['airlock-sealed'] && !lost.save.flags['airlock-sealed']);
  assert.ok(won.save.flags['reavers-repelled']);
});

test('scene 4: all three haggle choices pay 30 / 20 / 10 through the same three endings (well / fair / walked)', () => {
  const rows = [['win', 'end-hired-well-end', 'hired-well', 30, 3, ['gunner-hired', 'pay-raised']], ['mid', 'end-hired-fair-end', 'hired-fair', 20, 2, ['gunner-hired']], ['lose', 'end-lowballed-end', 'lowballed', 10, -1, ['gunner-hired']]];
  for (const node of HAGGLE_NODES) for (const [branch, end, outcome, money, rep, flags] of rows) {
    const { quest, run, save } = toNode('the-eighth-gunner', node, ROUTE[node]);
    const idx = quest.nodes[node].choices.findIndex((x) => x.label.startsWith('Haggle'));
    let r = act(quest, run, save, { type: 'choose', index: idx }, { now: 1 });
    const before = r.save;
    r = act(quest, r.run, r.save, { type: 'minigame', branch, xp: 2, skill: 'social' }, { now: 1 });
    assert.equal(r.error, undefined, `${node} ${branch}`);
    const out = finish(quest, r.run, r.save);
    assert.equal(out.run.node, end, `${node} ${branch}`); assert.equal(out.run.ended.outcome, outcome);
    assert.equal(out.save.money - before.money, money, `${node} ${branch} money`);
    assert.equal((out.save.rep.tull || 0) - (before.rep.tull || 0), rep);
    for (const f of flags) assert.ok(out.save.flags[f], f);
    assert.equal(Boolean(out.save.flags['pay-raised']), branch === 'win');
  }
});

test('the approved words did not change: end-hired-fair already existed with its own line', () => {
  const n = Q['the-eighth-gunner'].nodes['end-hired-fair'];
  assert.equal(n.text, 'Standard share. Good. Welcome to the crew, janitor. Now stop looking at the board.');
  assert.equal(Q['the-eighth-gunner'].nodes['end-hired-fair-end'].title, 'Standard share');
  assert.ok(!view(Q['the-eighth-gunner'], startQuest(Q['the-eighth-gunner'], save0(), { seed: 1, now: 1 }).run, save0()).minigame);
});

test('every node and every ending of scenes 3, 4 and 5 is still reachable (the explorer takes each minigame branch)', () => {
  for (const id of ['hold-the-corridor', 'the-eighth-gunner', 'gunners-week']) {
    const q = Q[id];
    const res = explore(q, save0(), { seeds: Array.from({ length: 12 }, (_, i) => i + 1) });
    assert.deepEqual(res.errors, [], id);
    for (const n of Object.keys(q.nodes)) assert.ok(res.nodes.has(n), `${id}: node ${n}`);
    for (const [e, n] of Object.entries(q.nodes)) if (n.type === 'end') assert.ok(res.ends.has(e), `${id}: ending ${e}`);
  }
});

test('a crew member rolling the hooked check gets the plain d20 (crews do not play minigames)', () => {
  const h = HOOKS.coolant;
  const { quest, run, save } = toNode(h.scene, h.node);
  const idx = quest.nodes[h.node].choices.findIndex((x) => x.label === h.label);
  const crew = act(quest, run, save, { type: 'crew', job: 'check', index: idx }, { now: 1, crew: { name: 'Pip', levels: {}, stats: {} } });
  if (!crew.error) assert.equal(crew.run.minigame ?? null, null);
  assert.equal(branchOf('repair', { success: true }), 'win');
});

test('the d20 tray shows the roll preview line, and the XP event reads in plain words', () => {
  const w = attemptWords({ dice: [14], roll: 14, bonus: 3, total: 17, dc: 12, pass: true, skill: 'repair', preview: 'Steady roll: nothing changes. 3 more on the d20 would make it Smooth.' });
  assert.equal(w.preview, 'Steady roll: nothing changes. 3 more on the d20 would make it Smooth.');
  assert.equal(attemptWords({ dice: [14], roll: 14, bonus: 3, total: 17, dc: 12, pass: true }).preview, '');
  assert.equal(eventText({ type: 'skill-xp', skill: 'hacking', xp: 4 }), '+4 Hacking XP');
});

test('a reload keeps the pending minigame: the saved run reopens it with the same attempt', () => {
  const h = HOOKS.airlock;
  const { quest, run, save } = toNode(h.scene, h.node);
  const idx = quest.nodes[h.node].choices.findIndex((x) => x.label === h.label);
  const r = act(quest, run, save, { type: 'choose', index: idx }, { now: 1 });
  const saved = JSON.parse(JSON.stringify(r.run));
  const v = view(quest, saved, r.save);
  assert.equal(v.minigame.kind, 'hack'); assert.deepEqual(v.minigame.attempt, r.run.minigame.attempt);
  const done = act(quest, saved, r.save, { type: 'minigame', branch: 'win', xp: 1, skill: 'hacking' }, { now: 1 });
  assert.equal(done.error, undefined); assert.equal(done.run.node, 'end-sealed');
});

test('haggle money is one number: the price on the result card is the credits in the wallet (the result still picks the ending, rep and flags)', () => {
  const rows = [['win', 27, 'end-hired-well-end', 3, true], ['win', 36, 'end-hired-well-end', 3, true], ['mid', 22, 'end-hired-fair-end', 2, false], ['lose', 8, 'end-lowballed-end', -1, false], ['win', 99, 'end-hired-well-end', 3, true]];
  for (const node of HAGGLE_NODES) for (const [branch, price, end, rep, raised] of rows) {
    const { quest, run, save } = toNode('the-eighth-gunner', node, ROUTE[node]);
    const idx = quest.nodes[node].choices.findIndex((x) => x.label.startsWith('Haggle'));
    let r = act(quest, run, save, { type: 'choose', index: idx }, { now: 1 });
    const before = r.save;
    r = act(quest, r.run, r.save, { type: 'minigame', branch, xp: 3, skill: 'social', price }, { now: 1 });
    assert.equal(r.error, undefined);
    let cur = r, card = null;
    for (let i = 0; i < 12 && !cur.run.ended; i++) { const open = view(quest, cur.run, cur.save).choices.filter((c) => !c.locked); cur = act(quest, cur.run, cur.save, { type: 'choose', index: open[0].index }, { now: 1 }); }
    card = view(quest, cur.run, cur.save).ended.reward.money;
    const paid = Math.min(40, price);
    assert.equal(cur.run.node, end);
    assert.equal(cur.save.money - before.money, paid, `${node} ${branch} ${price}: wallet`);
    assert.equal(card, paid, 'the end card shows the same number');
    assert.equal((cur.save.rep.tull || 0) - (before.rep.tull || 0), rep);
    assert.equal(Boolean(cur.save.flags['pay-raised']), raised);
  }
  // A repair result with a price is ignored; a haggle without one keeps the approved 30 / 20 / 10 (the table above).
  const h = HOOKS.coolant, t = toNode(h.scene, h.node);
  let r = act(t.quest, t.run, t.save, { type: 'choose', index: t.quest.nodes[h.node].choices.findIndex((x) => x.label === h.label) }, { now: 1 });
  const b = r.save; r = act(t.quest, r.run, r.save, { type: 'minigame', branch: 'win', price: 3 }, { now: 1 });
  assert.equal(finish(t.quest, r.run, r.save).save.money - b.money, 25);
});

// Round trip: regenerating the six scene files from the drafts with the lane's converter (launch/slice/tools/convert.mjs, which
// lives in the lane folder, not in this repo) gives these exact files, so a regenerate keeps the five minigame blocks.
// Skipped where the lane folder is not present (CI, other machines).
const LANES = process.env.STARDUST_LANES || path.join(os.homedir(), 'Desktop', 'lhc-lanes', 'stardust', 'launch');
const convert = path.join(LANES, 'slice', 'tools', 'convert.mjs'), drafts = path.join(LANES, 'quests', 'scenes-draft');
test('converter round trip: a regenerate from the drafts reproduces the data files, minigame blocks included', { skip: !existsSync(convert) || !existsSync(drafts) }, () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'scenemini-convert-'));
  try {
    execFileSync(process.execPath, [convert, drafts, out], { stdio: 'pipe' });
    const here = new URL('../projects/Space-Shooter/voyage/quests/data/slice/', import.meta.url);
    for (const q of SLICE_LIST) assert.equal(readFileSync(path.join(out, `${q.id}.js`), 'utf8'), readFileSync(new URL(`${q.id}.js`, here), 'utf8'), `${q.id} regenerates unchanged`);
    assert.equal((readFileSync(path.join(out, 'the-eighth-gunner.js'), 'utf8').match(/"kind": "haggle"/g) || []).length, 3);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

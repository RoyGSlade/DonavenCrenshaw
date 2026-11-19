// Scene hooks, dry run (read-only): the three proposed `minigame` blocks (SCENE-HOOKS.md) applied to an
// in-memory copy of scene 3 (airlock hack), scene 4 (haggle) and scene 5 (coolant repair). For each hook and each
// outcome a bot plays the real minigame, the result picks the node (sceneHook.targetFor), and the real engine plays the
// scene from there: every ending, payout, rep, flag and item is checked. The quest data files are never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLICE_LIST } from '../projects/Space-Shooter/voyage/quests/data/slice/index.js';
import { validateQuest } from '../projects/Space-Shooter/voyage/quests/validate.js';
import { startQuest, act, view } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { check as rollCheck } from '../projects/Space-Shooter/voyage/character.js';
import { emptySave } from '../projects/Space-Shooter/voyage/save.js';
import { createCharacter } from '../projects/Space-Shooter/voyage/character.js';
import { SLICE_FLAG } from '../projects/Space-Shooter/voyage/slice/rules.js';
import { SCENE_HOOKS, applyHook } from '../projects/Space-Shooter/voyage/minigames/sceneHookData.js';
import { hookIssues, startHook, targetFor, branchOf, xpEvent, worldResult, HOOK_KINDS } from '../projects/Space-Shooter/voyage/minigames/sceneHook.js';
import { createRepair, rotateTile, stepRepair, nextHint } from '../projects/Space-Shooter/voyage/minigames/repair.js';
import { createMirrorHack, stepMirrors, rotateStep, catchPortal, fire, inWindow } from '../projects/Space-Shooter/voyage/minigames/mirrors.js';
import { createHaggle, stepHaggle, ask, takeOffer, bandPrices, priceAt } from '../projects/Space-Shooter/voyage/minigames/haggle.js';

const Q = Object.fromEntries(SLICE_LIST.map((q) => [q.id, q]));
const BEFORE = JSON.stringify(SLICE_LIST);
const rng = () => 0.5;
const janitor = () => ({ ...emptySave(), money: 50, rep: { tull: 5 }, character: createCharacter({ name: 'Janitor', look: { portrait: 'p1' } }, rng, () => 1), flags: { [SLICE_FLAG]: 1 } });

// --- bots: each plays the real minigame to a chosen branch --------------------------------------------------------
function repairBot(setup, seed, want) {
  const s = createRepair({ seed, size: setup.size, capacity: setup.capacity, flow: setup.flow, qualityBonus: setup.qualityBonus });
  if (want === 'win') for (let i = 0; i < 200 && !s.done; i++) { const h = nextHint(s); if (h == null) break; rotateTile(s, h); }
  else for (let i = 0; i < 6000 && !s.done; i++) stepRepair(s, 0.1);
  return s.result;
}
function hackBot(setup, seed, start, want) {
  const s = createMirrorHack({ seed, setup, context: start.context });
  const dt = 1 / 120;
  while (!s.done && s.t < 600) {
    if (want === 'win') {
      const solved = s.layout.solved.map((v, i) => v ?? s.layout.start[i]);
      s.layout.mirrors.forEach((m, i) => { while (s.angles[i] !== solved[i]) rotateStep(s, i, 1); });
      while (!inWindow(s) && !s.done) stepMirrors(s, dt);
      catchPortal(s); if (fire(s)) for (let k = 0; k < 600 && s.projectile; k++) stepMirrors(s, dt);
    } else stepMirrors(s, 0.1);
  }
  return s.result;
}
function haggleBot(setup, seed, m, want) {
  const s = createHaggle({ seed, open: m.open, best: m.best, setup });
  if (want === 'mid') takeOffer(s);
  else if (want === 'win') { const [lo, hi] = bandPrices(s); for (let i = 0; i < 20000 && !s.done; i++) { stepHaggle(s, 1 / 120); const p = priceAt(s); if (p >= lo && p <= hi) ask(s); } }
  else { for (let i = 0; i < 60000 && !s.done; i++) { stepHaggle(s, 1 / 120); if (priceAt(s) >= s.cap - 1) ask(s); } }
  return s.result;
}
const bot = (hook, start, seed, want) => (hook.minigame.kind === 'repair' ? repairBot(start.setup, seed, want) : hook.minigame.kind === 'hack' ? hackBot(start.setup, seed, start, want) : haggleBot(start.setup, seed, hook.minigame, want));

// --- the walk: the real engine, with the hooked choice resolved the way the page would -----------------------------
function walk(hook, want, { after = [] } = {}) {
  const base = Q[hook.scene];
  const { quest, choice: hooked } = applyHook(base, hook);
  assert.deepEqual(validateQuest(quest), [], `${hook.id}: the hooked scene still validates`);
  assert.deepEqual(hookIssues(hooked, quest.nodes), [], `${hook.id}: the block is well formed`);
  const seed = 7;
  const save0 = janitor();
  let { run, save } = startQuest(quest, save0, { seed, now: 1 });
  let money = 0, result = null, start = null, target = null;
  const queue = [...after];
  for (let guard = 0; guard < 80 && !run.ended; guard++) {
    const v = view(quest, run, save);
    let action;
    if (v.part?.kind === 'foot') { action = { type: 'live', outcome: queue.shift().fight, hp: 30 }; }
    else {
      const open = v.choices.filter((c) => !c.locked);
      const raw = quest.nodes[run.node].choices;
      let pick = open.length === 1 ? open[0] : null;
      if (!pick && run.node === hook.node) {
        // The hooked choice: roll the d20 (core's check), play the minigame at that tier, take the node its result names.
        pick = open.find((c) => c.label === hook.label);
        const c = raw[pick.index];
        const attempt = rollCheck(save.character, c.check, (() => { let n = 0; return () => [0.2, 0.55, 0.9][n++ % 3]; })());
        start = startHook(c, attempt, save.character);
        result = bot(hook, start, seed, want);
        assert.ok(result, `${hook.id}: the ${want} bot finished the minigame`);
        assert.equal(branchOf(c.minigame.kind, result), want, `${hook.id}: the bot's result is a ${want}`);
        target = targetFor(c, result);
        // What the engine does once the page hands it the result: the choice leads to `target` (rewards and flags are the engine's own).
        const patched = structuredClone(quest.nodes[run.node]);
        patched.choices[pick.index] = { label: c.label, to: target, ...(c.reward ? { reward: c.reward } : {}) };
        quest.nodes[run.node] = patched;
      }
      if (!pick) pick = open[0];
      action = { type: 'choose', index: pick.index };
      const taken = quest.nodes[run.node].choices[pick.index];
      if (taken.reward?.money) money += taken.reward.money;
    }
    const next = act(quest, run, save, action, { now: 1 });
    assert.equal(next.error, undefined, `${hook.id}: ${next.error}`);
    run = next.run; save = next.save;
  }
  assert.ok(run.ended, `${hook.id}: the scene ends`);
  return { run, save, save0, start, result, target, money, end: quest.nodes[run.node] };
}

const expectEnd = (w, { outcome, result, money, rep, flags = [], notFlags = [] }) => {
  assert.equal(w.run.ended.outcome, outcome); assert.equal(w.run.ended.result ?? w.end.result, result);
  assert.equal(w.save.money - w.save0.money, w.money + money, `money: path ${w.money} + ending ${money}`);
  if (rep != null) assert.equal((w.save.rep.tull || 0) - (w.save0.rep.tull || 0), rep, 'Tull rep');
  for (const f of flags) assert.ok(w.save.flags[f], `flag ${f}`);
  for (const f of notFlags) assert.ok(!w.save.flags[f], `flag ${f} not set`);
};
const H = Object.fromEntries(SCENE_HOOKS.map((h) => [h.id, h]));

test('hooks are well formed, and the real data carries the same blocks the dry run proposed', () => {
  assert.deepEqual(SCENE_HOOKS.map((h) => h.id), ['scene5-coolant', 'scene3-airlock', 'scene4-haggle']);
  for (const h of SCENE_HOOKS) { const { quest, choice } = applyHook(Q[h.scene], h); assert.deepEqual(hookIssues(choice, quest.nodes), []); assert.ok(choice.check, 'the choice keeps its d20 check'); }
  assert.equal(JSON.stringify(SLICE_LIST), BEFORE, 'applying a hook never changes the real quest data');
  // The scene-minigames branch pasted the blocks into the data (tests/stardust-scenemini.test.mjs pins all five).
  for (const h of SCENE_HOOKS) assert.deepEqual(Q[h.scene].nodes[h.node].choices.find((c) => c.label === h.label).minigame, h.minigame, `${h.id} is in the real data`);
  // The validator lines would catch these.
  assert.match(hookIssues({ minigame: { kind: 'repair' } })[0], /needs a check/);
  assert.match(hookIssues({ check: { skill: 'social', pass: 'a', fail: 'b' }, minigame: { kind: 'repair' } })[0], /should be repair/);
  assert.match(hookIssues({ check: { skill: 'social', pass: 'a', fail: 'b' }, minigame: { kind: 'haggle', open: 20, best: 30 } })[0], /mid node/);
  assert.match(hookIssues({ check: { skill: 'hacking' }, minigame: { kind: 'hack', lock: 9 } }).join(), /lock is a whole number 1 to 4/); assert.match(hookIssues({ check: { skill: 'hacking' }, minigame: { kind: 'hack', context: 'moon' } }).join(), /context is one of foot, ship, combat/); assert.match(hookIssues({ check: { skill: 'repair' }, minigame: { kind: 'repair', system: 'toaster' } }).join(), /system is one of engine-cooling/);
  assert.match(hookIssues({ minigame: { kind: 'dance' } })[0], /not one of/);
  assert.deepEqual(Object.keys(HOOK_KINDS), ['repair', 'hack', 'haggle']);
});

test('scene 5, coolant line (repair, dc 12): a sealed patch is "Tape and nerve", a failed one is "Mist everywhere"', () => {
  const win = walk(H['scene5-coolant'], 'win');
  assert.equal(win.target, 'end-steady');
  expectEnd(win, { outcome: 'steady', result: 'success', money: 25, rep: 2, flags: ['coolant-fixed', 'nessa-quit', 'pip-quit'] });
  assert.equal(win.save.items['hull-patch'], 1);
  const lose = walk(H['scene5-coolant'], 'lose');
  assert.equal(lose.target, 'end-spray');
  expectEnd(lose, { outcome: 'spray', result: 'failure', money: -15, flags: ['nessa-quit', 'pip-quit'], notFlags: ['coolant-fixed'] });
  // The roll's tier changed the board: a Smooth roll is smaller, a Rough one bigger.
  const tiers = [-9, 12].map((m) => startHook(win.start && applyHook(Q['gunners-week'], H['scene5-coolant']).choice, { total: 12 + m, dc: 12, natural: false }, janitor().character).setup.size);
  assert.deepEqual(tiers, [6, 4]);
});

test('scene 3, inner airlock (hack, dc 12): a cracked lock seals the door, a tripped one means the corridor fight', () => {
  const win = walk(H['scene3-airlock'], 'win');
  assert.equal(win.target, 'end-sealed');
  expectEnd(win, { outcome: 'sealed', result: 'success', money: 20, rep: 3, flags: ['airlock-sealed', 'reavers-repelled'] });
  const lose = walk(H['scene3-airlock'], 'lose', { after: [{ fight: 'win' }] });
  assert.equal(lose.target, 'fight-hold');
  expectEnd(lose, { outcome: 'held', result: 'success', money: 15, rep: 3, flags: ['reavers-repelled'], notFlags: ['airlock-sealed'] });
  const bad = walk(H['scene3-airlock'], 'lose', { after: [{ fight: 'lose' }] });
  expectEnd(bad, { outcome: 'overrun', result: 'failure', money: -20, rep: -1 });
  assert.equal(win.start.lock, 2); assert.equal(win.start.setup.firewalls, 2); assert.equal(win.start.context, 'foot');
  assert.deepEqual(worldResult('hack', lose.result), { security: 'alerted', terminal: 'locked' }, 'on foot a failed hack locks the terminal');
  assert.deepEqual(worldResult('hack', win.result), { security: 'quiet' });
  assert.deepEqual(worldResult('repair', walk(H['scene5-coolant'], 'lose').result), { broken: true, flooding: true, offline: null, system: 'engine-cooling', systemName: 'Engine cooling' });
});

test('scene 4, the share (haggle, dc 10): well, fair and walked map to 30, 20 and 10 credits', () => {
  const well = walk(H['scene4-haggle'], 'win');
  assert.deepEqual([well.result.outcome, well.target], ['well', 'end-hired-well']);
  expectEnd(well, { outcome: 'hired-well', result: 'success', money: 30, rep: 3, flags: ['gunner-hired', 'pay-raised'] });
  const fair = walk(H['scene4-haggle'], 'mid');
  assert.deepEqual([fair.result.outcome, fair.target], ['fair', 'end-hired-fair']);
  expectEnd(fair, { outcome: 'hired-fair', result: 'success', money: 20, rep: 2, flags: ['gunner-hired'], notFlags: ['pay-raised'] });
  const walked = walk(H['scene4-haggle'], 'lose');
  assert.deepEqual([walked.result.outcome, walked.target], ['walked', 'end-lowballed']);
  expectEnd(walked, { outcome: 'lowballed', result: 'failure', money: 10, rep: -1, flags: ['gunner-hired'] });
  assert.ok(well.result.xp > fair.result.xp && fair.result.xp > 0 && walked.result.xp === 0);
});

test('XP events: a win pays the skill, a loss pays nothing; kinds map to their skills', () => {
  assert.deepEqual(xpEvent('repair', { xp: 4 }), { type: 'skill-xp', skill: 'repair', xp: 4 });
  assert.deepEqual(xpEvent('hack', { xp: 5 }), { type: 'skill-xp', skill: 'hacking', xp: 5 });
  assert.deepEqual(xpEvent('haggle', { xp: 4 }), { type: 'skill-xp', skill: 'social', xp: 4 });
  assert.equal(xpEvent('repair', { xp: 0 }), null); assert.equal(xpEvent('repair', null), null);
});

test('a Rough roll can still pass and a Smooth roll can still fail: the minigame decides, the roll only sets it up', () => {
  const { choice } = applyHook(Q['gunners-week'], H['scene5-coolant']);
  const rough = startHook(choice, { total: 3, dc: 12, natural: false }, janitor().character), smooth = startHook(choice, { total: 25, dc: 12, natural: true }, janitor().character);
  assert.deepEqual([rough.tier, smooth.tier], [-2, 2]);
  const good = repairBot(rough.setup, 3, 'win'), bad = repairBot(smooth.setup, 3, 'lose');
  assert.equal(targetFor(choice, good), 'end-steady'); assert.equal(targetFor(choice, bad), 'end-spray');
});

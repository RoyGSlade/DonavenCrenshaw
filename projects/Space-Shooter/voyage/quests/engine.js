// The quest engine (P7). A quest is data: a set of nodes (dialogue, fight,
// travel, event, puzzle, riddle, branch, end) plus roll specs for its random
// pieces. The engine is pure: it takes the quest, the run, the save and one
// action, and returns the new run, the new save and the reward events. No DOM,
// no Math.random, no Date.now: every roll comes from the run's seed, so the same
// seed and the same actions always end the same way.
//
//   const { run, save } = startQuest(quest, save, { seed, now });
//   view(quest, run, save)                  -> what to show
//   act(quest, run, save, action, { now })  -> { run, save, events, error }
//
// With a crew aboard (P11) the page passes { now, crew } (crew: the second
// player's card, voyage/crew/card.js). Crew actions are { type: 'crew', job }:
// 'turret', 'repair', 'scan', 'mark' (parts/crew.js), 'check' (take a dialogue
// choice's check with the crew's stats) and 'puzzle' (play the cipher or riddle
// turn). Without a crew none of it applies and solo play is unchanged (S57).
//
// Rewards, costs and requirements use core's formats (INTERFACES.md section 3).
import { hashSeed, roller } from './rng.js';
import { roll, fill } from './rolls.js';
import { grant, spend, meets, missing, check, combatStats, GIVERS, STAT_NAMES } from './core.js';
import { SECTORS } from './data/sectors.js';
import { createSkirmish, viewSkirmish, actSkirmish, hullAfter } from './parts/skirmish.js';
import { createFoot, viewFoot, actFoot } from './parts/foot.js';
import { createCipher, viewCipher, actCipher } from './parts/cipher.js';
import { createRiddle, viewRiddle, actRiddle } from './parts/riddle.js';
import { createRace, viewRace, actRace } from './parts/race.js';
import { createTrip, viewTrip, actTrip, createEventStep, viewEventStep, actEventStep } from './parts/travel.js';
import { actCrew } from './parts/crew.js';

export const RUN_VERSION = 1;
const LOG_LIMIT = 40;

// Quest fights fly the upgraded ship: core's ship-fight activity (upgrades and
// the captain count, no board is written). Races read raceStats in parts/race.js.
export const shipFor = save => combatStats(save, null, 'ship-fight');
const MAX_STEPS = 2000;

export const PARTS = Object.freeze({
  skirmish: { create: createSkirmish, view: viewSkirmish, act: actSkirmish },
  foot: { create: createFoot, view: viewFoot, act: actFoot },
  cipher: { create: createCipher, view: viewCipher, act: actCipher },
  riddle: { create: createRiddle, view: viewRiddle, act: actRiddle },
  trip: { create: createTrip, view: viewTrip, act: actTrip },
  event: { create: createEventStep, view: viewEventStep, act: actEventStep },
  race: { create: createRace, view: viewRace, act: actRace },
});

export const NODE_TYPES = Object.freeze(['dialogue', 'branch', 'fight', 'travel', 'event', 'puzzle', 'riddle', 'race', 'end']);

// Which outcomes each kind of step can produce (for validation and tests).
export const PART_OUTCOMES = Object.freeze({
  skirmish: ['win', 'lose', 'flee', 'parley'],
  foot: ['win', 'lose', 'flee'],
  cipher: ['solved', 'failed'],
  riddle: ['solved', 'failed'],
  trip: ['arrived'],
  event: ['resolved', 'none'],
  race: ['win', 'lose'],
});

// A step without its own branch for an outcome falls back: talking a fight down
// counts as winning it, and running away counts as losing it.
export const OUTCOME_FALLBACK = Object.freeze({ parley: 'win', flee: 'lose', none: 'resolved' });

export function partKind(node) {
  switch (node.type) {
    case 'fight': return node.mode === 'foot' ? 'foot' : 'skirmish';
    case 'travel': return 'trip';
    case 'event': return 'event';
    case 'puzzle': return node.kind || 'cipher';
    case 'riddle': return 'riddle';
    case 'race': return 'race';
    default: return null;
  }
}

// ---- requirements ------------------------------------------------------

// A quest requirement is core's format plus two quest-local keys:
//   local: { name: true }      flags set earlier in this run (choice.set)
//   roll:  { 'setup.id': 'x' } a rolled piece equals a value
function splitReq(req = {}) {
  const { local, roll: rolled, ...coreReq } = req;
  return { local: local || {}, rolled: rolled || {}, coreReq };
}

const lookup = (scope, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), scope);

export function reqReasons(req, run, save) {
  if (!req) return [];
  const { local, rolled, coreReq } = splitReq(req);
  const reasons = missing(save, coreReq);
  for (const [name, want] of Object.entries(local)) if (Boolean(run.local[name]) !== Boolean(want)) reasons.push(want ? `Needs: ${name}` : `Closed: ${name}`);
  for (const [path, want] of Object.entries(rolled)) if (lookup(run.rolls, path) !== want) reasons.push('Not this time');
  return reasons;
}

export const reqMet = (req, run, save) => reqReasons(req, run, save).length === 0;

// ---- helpers -----------------------------------------------------------

function scope(quest, run, save) {
  return {
    ...run.rolls,
    player: { name: save.character?.name || 'Captain' },
    giver: { name: GIVERS[quest.giver]?.name || quest.giver },
    npc: quest.npc || {},
    here: { name: SECTORS[run.location]?.name || run.location },
  };
}

function makeCtx(run, save, out, crew = null) {
  const ctx = {
    run,
    save,
    crew,
    ship: shipFor(save),
    rng: roller(run),
    log: line => pushLog(run, line),
    grant(reward) {
      const result = grant(ctx.save, reward);
      ctx.save = result.save;
      out.events.push(...result.events);
    },
    spend(cost) {
      const result = spend(ctx.save, cost);
      if (result.ok) ctx.save = result.save;
      return result.ok;
    },
  };
  return ctx;
}

function pushLog(run, line) {
  run.log.push(line);
  if (run.log.length > LOG_LIMIT) run.log.splice(0, run.log.length - LOG_LIMIT);
}

function lookupRef(value, ctx) {
  return typeof value === 'string' && value.startsWith('$') ? lookup(ctx.run.rolls, value.slice(1)) : value;
}

function resolveEnemyLike(spec, ctx) {
  return typeof spec === 'string' && spec.startsWith('$') ? structuredClone(lookup(ctx.run.rolls, spec.slice(1))) : roll(spec, ctx.rng);
}

// Rewards may name rolled numbers: { money: '$pay' } pays the rolled pay.
export function resolveReward(reward, run) {
  if (!reward) return reward;
  const fix = value => (typeof value === 'string' && value.startsWith('$') ? Number(lookup(run.rolls, value.slice(1))) || 0 : value);
  const out = {};
  for (const [key, value] of Object.entries(reward)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fix(v)]));
    else out[key] = fix(value);
  }
  return out;
}

function resolveEnemy(spec, ctx) {
  if (typeof spec === 'string' && spec.startsWith('$')) return structuredClone(lookup(ctx.run.rolls, spec.slice(1)));
  return roll(spec, ctx.rng);
}

function partParams(quest, node, ctx) {
  switch (node.type) {
    case 'fight': return { enemy: resolveEnemy(node.enemy, ctx), title: node.title, dc: node.dc };
    case 'travel': return { to: node.to, risk: node.risk };
    case 'event': return { deck: node.deck, chance: node.chance };
    case 'race': return { track: lookupRef(node.track, ctx), rival: node.rival ? resolveEnemyLike(node.rival, ctx) : undefined };
    default: return Object.fromEntries(Object.entries(node.params || {}).map(([k, v]) => [k, lookupRef(v, ctx)]));
  }
}

// Enter a node: run its automatic parts (branches, steps that finish at once)
// until it rests on something that needs the player.
function enter(quest, nodeId, ctx, now, depth = 0) {
  const { run } = ctx;
  if (depth > 50) throw new Error(`Quest ${quest.id}: too many automatic steps from ${nodeId}`);
  const node = quest.nodes[nodeId];
  if (!node) throw new Error(`Quest ${quest.id}: unknown node ${nodeId}`);
  run.node = nodeId;
  run.part = null;
  run.visits[nodeId] = (run.visits[nodeId] || 0) + 1;
  if (node.set) Object.assign(run.local, node.set);
  if (node.onEnter) ctx.grant(resolveReward(node.onEnter, run));
  if (node.location) run.location = node.location;

  if (node.type === 'branch') {
    const hit = (node.cases || []).find(c => reqMet(c.when, run, ctx.save));
    return enter(quest, hit ? hit.to : node.else, ctx, now, depth + 1);
  }
  if (node.type === 'end') {
    if (node.reward) ctx.grant(resolveReward(node.reward, run));
    // death: true marks an ending the captain does not walk away from (S25). The
    // page calls core's store.die() when it sees it; the engine only reports it.
    run.ended = { result: node.result, outcome: node.outcome || nodeId, title: node.title || '', followUp: node.followUp || null, node: nodeId, death: Boolean(node.death) };
    pushLog(run, `Quest ${node.result === 'success' ? 'complete' : 'failed'}: ${node.title || node.outcome || nodeId}.`);
    const quests = { ...(ctx.save.quests || {}) };
    const done = { ...(quests.done || {}) };
    const prior = done[quest.id];
    done[quest.id] = { result: node.result, outcome: run.ended.outcome, at: now ?? 0, times: (prior?.times || 0) + 1 };
    const active = { ...(quests.active || {}) };
    delete active[quest.id];
    ctx.save = { ...ctx.save, quests: { ...quests, done, active } };
    return;
  }
  const kind = partKind(node);
  if (kind) {
    const state = PARTS[kind].create(partParams(quest, node, ctx), ctx);
    run.part = { kind, state };
    if (state.done) return finishPart(quest, node, ctx, now, depth);
  }
}

function finishPart(quest, node, ctx, now, depth = 0) {
  const { run } = ctx;
  const { kind, state } = run.part;
  if (kind === 'skirmish') run.hull = hullAfter(state);
  const outcome = state.outcome;
  pushLog(run, `${node.title || kind}: ${outcome}.`);
  const target = node.outcomes?.[outcome] ?? node.outcomes?.[OUTCOME_FALLBACK[outcome]] ?? node.next;
  if (!target) throw new Error(`Quest ${quest.id}: node ${run.node} has no way on for outcome ${outcome}`);
  return enter(quest, target, ctx, now, depth + 1);
}

function choiceFor(choice, run, save) {
  if (!choice.variants) return choice;
  const variant = choice.variants.find(v => reqMet(v.when, run, save));
  if (!variant) return choice;
  const { when: _when, ...over } = variant;
  return { ...choice, ...over, variants: undefined };
}

function checkText(chk) {
  return `${STAT_NAMES[chk.stat] || chk.stat} check, ${chk.dc} or more on d6 + ${chk.stat}`;
}

// ---- public API --------------------------------------------------------

export function rollQuest(quest, seed) {
  const holder = { rng: hashSeed('rolls', quest.id, seed) };
  return roll(quest.rolls || {}, roller(holder));
}

export function startQuest(quest, save, { seed = 1, now = 0 } = {}) {
  const ship = shipFor(save);
  const run = {
    v: RUN_VERSION,
    quest: quest.id,
    seed,
    rng: hashSeed('play', quest.id, seed),
    rolls: rollQuest(quest, seed),
    node: null,
    part: null,
    location: quest.location || 'alpha',
    hull: ship.hp,
    hullMax: ship.hp,
    local: {},
    visits: {},
    steps: 0,
    log: [],
    ended: null,
    startedAt: now,
  };
  const out = { events: [] };
  const ctx = makeCtx(run, save, out);
  pushLog(run, `Took the job: ${quest.title}.`);
  enter(quest, quest.start, ctx, now);
  ctx.save = storeRun(ctx.save, run);
  return { run, save: ctx.save, events: out.events };
}

function storeRun(save, run) {
  if (run.ended) return save;
  const quests = { ...(save.quests || {}) };
  quests.active = { ...(quests.active || {}), [run.quest]: run };
  return { ...save, quests };
}

export function view(quest, run, save) {
  const node = quest.nodes[run.node];
  const s = scope(quest, run, save);
  const base = {
    quest: { id: quest.id, title: quest.title, giver: quest.giver },
    node: run.node,
    type: node.type,
    title: fill(node.title || '', s),
    speaker: node.speaker ? fill(node.speaker, s) : null,
    portrait: node.portrait || null,
    text: fill(node.text || '', s),
    hull: run.hull,
    hullMax: run.hullMax,
    location: run.location,
    locationName: SECTORS[run.location]?.name || run.location,
    log: run.log.slice(-8),
    ended: run.ended ? { ...run.ended, text: fill(node.text || '', s), reward: resolveReward(node.reward, run) || null } : null,
  };
  if (node.type === 'dialogue') {
    base.choices = (node.choices || []).map((raw, index) => {
      const choice = { ...choiceFor(raw, run, save) };
      if (choice.cost) choice.cost = resolveReward(choice.cost, run);
      const reasons = reqReasons(choice.requires, run, save);
      if (choice.cost) reasons.push(...missing(save, { money: choice.cost.money, items: choice.cost.items }));
      return {
        index,
        label: fill(choice.label, s),
        locked: reasons.length > 0,
        reasons: reasons.length && choice.lockedHint ? [choice.lockedHint] : reasons,
        hidden: reasons.length > 0 && Boolean(choice.hideLocked),
        check: choice.check ? { stat: choice.check.stat, dc: choice.check.dc, text: checkText(choice.check) } : null,
        cost: choice.cost || null,
      };
    }).filter(c => !c.hidden);
  }
  if (run.part) {
    const ctx = { run, save, ship: shipFor(save) };
    base.part = { kind: run.part.kind, ...PARTS[run.part.kind].view(run.part.state, ctx) };
  }
  return base;
}

// The minigame turns a crew may play (S55): a cipher guess or a riddle answer.
const CREW_PUZZLE = Object.freeze({ cipher: 'guess', riddle: 'answer' });

// Pick dialogue choice `index`; its check (if any) rolls for `roller` (the
// captain, or the crew taking it). Returns an error string or null.
function choose(quest, run, ctx, node, index, roller, now) {
  const raw = node.choices?.[index];
  if (!raw) return 'No such option.';
  const choice = { ...choiceFor(raw, run, ctx.save) };
  if (choice.cost) choice.cost = resolveReward(choice.cost, run);
  const reasons = reqReasons(choice.requires, run, ctx.save);
  if (reasons.length) return reasons[0];
  if (roller !== ctx.save.character && !choice.check) return 'The captain makes that call.';
  if (choice.cost && !ctx.spend(choice.cost)) return missing(ctx.save, { money: choice.cost.money, items: choice.cost.items })[0] || 'Cannot afford that.';
  run.steps++;
  if (choice.reward) ctx.grant(resolveReward(choice.reward, run));
  if (choice.set) Object.assign(run.local, choice.set);
  let target = choice.to;
  if (choice.check) {
    const r = check(roller, choice.check, ctx.rng.next);
    const who = roller === ctx.save.character ? '' : `${roller.name || 'Your crew'} takes it. `;
    pushLog(run, `${who}${STAT_NAMES[choice.check.stat] || choice.check.stat} check: ${r.roll} + ${r.bonus} = ${r.total} vs ${r.dc}, ${r.pass ? 'pass' : 'fail'}.`);
    run.lastCheck = r;
    target = r.pass ? choice.check.pass : choice.check.fail;
  }
  enter(quest, target, ctx, now);
  return null;
}

function actAsCrew(quest, run, ctx, node, action, now) {
  if (!ctx.crew) return 'No crew aboard.';
  if (action.job === 'check') {
    if (run.part || node.type !== 'dialogue') return 'No check to take right now.';
    return choose(quest, run, ctx, node, action.index, ctx.crew, now);
  }
  if (action.job === 'puzzle') {
    const kind = run.part?.kind;
    if (!CREW_PUZZLE[kind] || action.action?.type !== CREW_PUZZLE[kind]) return 'No puzzle to work on right now.';
    const result = PARTS[kind].act(run.part.state, action.action, ctx);
    if (result.error) return result.error;
  } else {
    const error = actCrew(action, ctx);
    if (error) return error;
  }
  run.steps++;
  if (run.part?.state.done) finishPart(quest, node, ctx, now);
  return null;
}

export function act(quest, runIn, saveIn, action, { now = 0, crew = null } = {}) {
  if (runIn.ended) return { run: runIn, save: saveIn, events: [], error: 'This quest is over.' };
  if (runIn.steps >= MAX_STEPS) return { run: runIn, save: saveIn, events: [], error: 'Too many steps.' };
  const run = structuredClone(runIn);
  const out = { events: [] };
  const ctx = makeCtx(run, saveIn, out, crew);
  const node = quest.nodes[run.node];
  const fail = error => ({ run: runIn, save: saveIn, events: [], error });

  if (action?.type === 'crew') {
    const error = actAsCrew(quest, run, ctx, node, action, now);
    if (error) return fail(error);
  } else if (run.part) {
    const result = PARTS[run.part.kind].act(run.part.state, action, ctx);
    if (result.error) return fail(result.error);
    run.steps++;
    if (run.part.state.done) finishPart(quest, node, ctx, now);
  } else if (node.type === 'dialogue') {
    if (action?.type !== 'choose') return fail('Choose an option.');
    const error = choose(quest, run, ctx, node, action.index, ctx.save.character, now);
    if (error) return fail(error);
  } else return fail('Nothing to do here.');

  return { run, save: storeRun(ctx.save, run), events: out.events };
}

// Can the player take this quest now?
export function availability(quest, save) {
  const reasons = missing(save, quest.requires || {});
  const done = save.quests?.done?.[quest.id];
  if (done && !quest.repeatable && done.result === 'success') reasons.push('Already done');
  return { ok: reasons.length === 0, reasons };
}

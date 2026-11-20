// Scene hooks (proposal, not wired): how a quest choice that carries a `minigame` block turns a d20
// roll into a minigame and the minigame's result into the next node. Pure; nothing here edits quest
// data or the engine. The slice and tech lanes own those; SCENE-HOOKS.md has the exact lines to paste.
//
// A hooked choice keeps its `check` (the d20 still rolls, shows on the dice, and sets the tier):
//   { "label": "...", "check": { skill, stat, tag, dc, pass, fail },
//     "minigame": { "kind": "repair"|"hack"|"haggle", ...params, "mid": "<node>" (haggle only) } }
// Result -> node: win = check.pass, lose = check.fail, mid = minigame.mid (haggle's fair deal).
import { tierOf } from './setup.js';
import { ready, setupOf, assertReady, hookKinds, get as moduleOf } from '../modules/registry.js';

// What a scene can ask for is read from the registry: a module opts in with a `hook` block in its manifest.json
//   "hook": { "skill": "repair", "outcomes": ["win","lose"] | ["win","mid","lose"],
//             "inputs": { "lock": { "type": "int", "min": 1, "max": 4 }, "context": { "type": "enum", "values": [...] }, "open": { "type": "int", "required": true, "greaterThan": "..." } },
//             "defaults": { "title": "..." }, "branch": { "by": "outcome", "win": ["well"], "mid": ["fair"] }, "worldFields": ["security"] }
// so a new game can be hooked into a scene with no edit here. The registry must be loaded (await ready(), or use startHookAsync).
const derive = () => { assertReady('the scene hook kinds'); return Object.fromEntries(Object.entries(hookKinds()).map(([id, h]) => [id, { skill: h.skill, categories: h.categories }])); };
/** The kinds a scene can ask for, the roll skill each pays XP to, and the category ids whose points they read. A live view of the registry. */
export const HOOK_KINDS = new Proxy({}, {
  get: (_, k) => (typeof k === 'symbol' ? undefined : derive()[k]),
  has: (_, k) => (typeof k === 'symbol' ? false : k in derive()),
  ownKeys: () => Reflect.ownKeys(derive()),
  getOwnPropertyDescriptor: (_, k) => { const d = typeof k === 'symbol' ? {} : derive(); return k in d ? { value: d[k], enumerable: true, configurable: true, writable: false } : undefined; },
});

const pointsFor = (kind, character) => Object.fromEntries(HOOK_KINDS[kind].categories.map((c) => [c, character?.points?.[HOOK_KINDS[kind].skill]?.[c] ?? 0]));
const levelFor = (kind, character) => character?.levels?.[HOOK_KINDS[kind].skill] ?? 1;

/** Problems with a choice's minigame block, as plain sentences (the validator lines). Empty when fine. Read from the module's manifest `hook`. */
export function hookIssues(choice, nodes = {}) {
  const m = choice?.minigame;
  if (!m) return [];
  const kinds = hookKinds();
  const hook = kinds[m.kind];
  if (!hook) return [`minigame kind ${m.kind} is not one of ${Object.keys(kinds).join(', ')}`];
  const out = [];
  if (!choice.check) out.push('a minigame choice needs a check (the d20 sets its tier)');
  if (choice.check && hook.skill !== choice.check.skill) out.push(`the check skill ${choice.check.skill} should be ${hook.skill} for ${m.kind}`);
  for (const [key, spec] of Object.entries(hook.inputs)) {
    const v = m[key], bad = [];
    if (v == null) { if (spec.required) bad.push(spec.say || `${m.kind} needs ${key}`); }
    else if (spec.type === 'int') {
      if (!Number.isInteger(v) || (spec.min != null && v < spec.min) || (spec.max != null && v > spec.max) || (spec.greaterThan && !(v > m[spec.greaterThan]))) bad.push(spec.say || `${m.kind} ${key} is a whole number${spec.min != null ? ` ${spec.min} to ${spec.max}` : ''}`);
    } else if (spec.type === 'enum') { if (!spec.values.includes(v)) bad.push(spec.say || `${m.kind} ${key} is one of ${spec.values.join(', ')}`); }
    else if (spec.type === 'string' && typeof v !== 'string') bad.push(`${m.kind} ${key} is text`);
    out.push(...bad);
  }
  if (hook.outcomes.includes('mid')) {
    if (!m.mid) out.push(`${m.kind} needs a mid node for a fair deal`); else if (nodes && Object.keys(nodes).length && !nodes[m.mid]) out.push(`mid node ${m.mid} does not exist`);
  } else if (m.mid) out.push(`${m.kind} has no mid outcome`);
  return [...new Set(out)];
}

/** Everything the page needs to open the minigame after the d20: the tier and the setup. `attempt` is core's attempt ({ total, dc, natural }). Needs the registry loaded: see startHookAsync. */
export function startHook(choice, attempt, character = {}) {
  const m = choice.minigame;
  const tier = tierOf(attempt);
  const level = levelFor(m.kind, character), points = pointsFor(m.kind, character);
  const setup = setupOf(m.kind, { tier, level, points, lock: m.lock ?? 1 }); // the module's own setup
  const { defaults } = hookKinds()[m.kind];
  // `block` is the scene's whole minigame block: every input a module declares travels to it as ctx.context (see minigames/playHook.js).
  return { kind: m.kind, tier, setup, lock: m.lock ?? 1, context: m.context ?? defaults.context ?? 'foot', system: m.system ?? null, title: m.title || null, who: m.who || null, what: m.what || null, open: m.open ?? null, best: m.best ?? null, block: m };
}
/** startHook for page code: waits for the registry first, so a caller cannot forget `await ready()`. */
export async function startHookAsync(choice, attempt, character = {}) { await ready(); return startHook(choice, attempt, character); }

/** The minigame's result as the branch it picks: 'win', 'mid' or 'lose'. By success, or by the result's `outcome` when the hook's `branch` says so (haggle: well, fair, walked). */
export function branchOf(kind, result) {
  const b = hookKinds()[kind]?.branch;
  if (b?.by === 'outcome') return (b.win || []).includes(result?.outcome) ? 'win' : (b.mid || []).includes(result?.outcome) ? 'mid' : 'lose';
  return result?.success ? 'win' : 'lose';
}

/** The node a finished minigame leads to. */
export function targetFor(choice, result) {
  const branch = branchOf(choice.minigame.kind, result);
  return branch === 'win' ? choice.check.pass : branch === 'lose' ? choice.check.fail : choice.minigame.mid;
}

/**
 * What a finished minigame did to the world, as plain facts the scene or the workbench can show (nothing here edits scene data):
 * the module's own `hookWorld(result)` export if it has one (repair: { broken, flooding, offline, system, systemName }), else the result fields the manifest's
 * `hook.worldFields` name (hack: security, and terminal | port | section by context), else the result's `effects.world`, else {}.
 */
export function worldResult(kind, result) {
  const fn = moduleOf(kind).mod.hookWorld;
  if (typeof fn === 'function') return fn(result);
  const fields = hookKinds()[kind]?.worldFields || [];
  if (fields.length) return Object.fromEntries(fields.map((f) => [f, result?.[f]]).filter(([, v]) => v != null));
  return result?.effects?.world || {};
}

/** The skill XP event for a result: { type: 'skill-xp', skill, xp } or null when nothing is earned. */
export function xpEvent(kind, result) {
  const xp = Math.max(0, Math.trunc(result?.xp) || 0);
  return xp > 0 ? { type: 'skill-xp', skill: HOOK_KINDS[kind].skill, xp } : null;
}

export { outcomeOf as haggleOutcome } from './haggle.js';

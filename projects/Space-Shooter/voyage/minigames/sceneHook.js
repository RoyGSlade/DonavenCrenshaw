// Scene hooks (proposal, not wired): how a quest choice that carries a `minigame` block turns a d20
// roll into a minigame and the minigame's result into the next node. Pure; nothing here edits quest
// data or the engine. The slice and tech lanes own those; SCENE-HOOKS.md has the exact lines to paste.
//
// A hooked choice keeps its `check` (the d20 still rolls, shows on the dice, and sets the tier):
//   { "label": "...", "check": { skill, stat, tag, dc, pass, fail },
//     "minigame": { "kind": "repair"|"hack"|"haggle", ...params, "mid": "<node>" (haggle only) } }
// Result -> node: win = check.pass, lose = check.fail, mid = minigame.mid (haggle's fair deal).
import { tierOf } from './setup.js';
import { setupOf } from '../modules/registry.js';
import { CONTEXTS } from './mirrors.js';
import { SYSTEMS, worldOf } from './repair.js';
import { outcomeOf as haggleOutcome } from './haggle.js';
import { HACK_CATEGORIES, REPAIR_CATEGORIES, SOCIAL_CATEGORIES } from './setup.js';

/** The kinds a scene can ask for, the roll skill each pays XP to, and the category ids whose points they read. */
export const HOOK_KINDS = Object.freeze({
  repair: { skill: 'repair', categories: REPAIR_CATEGORIES },
  hack: { skill: 'hacking', categories: HACK_CATEGORIES },
  haggle: { skill: 'social', categories: SOCIAL_CATEGORIES },
});

const pointsFor = (kind, character) => Object.fromEntries(HOOK_KINDS[kind].categories.map((c) => [c, character?.points?.[HOOK_KINDS[kind].skill]?.[c] ?? 0]));
const levelFor = (kind, character) => character?.levels?.[HOOK_KINDS[kind].skill] ?? 1;

/** Problems with a choice's minigame block, as plain sentences (the validator lines). Empty when fine. */
export function hookIssues(choice, nodes = {}) {
  const m = choice?.minigame;
  if (!m) return [];
  const out = [];
  if (!HOOK_KINDS[m.kind]) return [`minigame kind ${m.kind} is not one of ${Object.keys(HOOK_KINDS).join(', ')}`];
  if (!choice.check) out.push('a minigame choice needs a check (the d20 sets its tier)');
  if (choice.check && HOOK_KINDS[m.kind].skill !== choice.check.skill) out.push(`the check skill ${choice.check.skill} should be ${HOOK_KINDS[m.kind].skill} for ${m.kind}`);
  if (m.kind === 'haggle') {
    if (!Number.isInteger(m.open) || !Number.isInteger(m.best) || m.best <= m.open) out.push('haggle needs whole open and best prices, best above open');
    if (!m.mid) out.push('haggle needs a mid node for a fair deal'); else if (nodes && Object.keys(nodes).length && !nodes[m.mid]) out.push(`mid node ${m.mid} does not exist`);
  } else if (m.mid) out.push(`${m.kind} has no mid outcome`);
  if (m.kind === 'hack' && m.lock != null && !(Number.isInteger(m.lock) && m.lock >= 1 && m.lock <= 4)) out.push('hack lock is a whole number 1 to 4 (the number of firewalls)');
  if (m.kind === 'hack' && m.context != null && !CONTEXTS.includes(m.context)) out.push(`hack context is one of ${CONTEXTS.join(', ')}`);
  if (m.kind === 'repair' && m.system != null && !SYSTEMS[m.system]) out.push(`repair system is one of ${Object.keys(SYSTEMS).join(', ')}`);
  return out;
}

/** Everything the page needs to open the minigame after the d20: the tier and the setup. `attempt` is core's attempt ({ total, dc, natural }). */
export function startHook(choice, attempt, character = {}) {
  const m = choice.minigame;
  const tier = tierOf(attempt);
  const level = levelFor(m.kind, character), points = pointsFor(m.kind, character);
  const setup = setupOf(m.kind, { tier, level, points, lock: m.lock ?? 1 }); // the module's own setup (call `await ready()` from modules/registry.js first)
  return { kind: m.kind, tier, setup, lock: m.lock ?? 1, context: m.context ?? 'foot', system: m.system ?? null, title: m.title || null, who: m.who || null, what: m.what || null, open: m.open ?? null, best: m.best ?? null };
}

/** The minigame's result as the branch it picks: 'win', 'mid' or 'lose'. Repair and hack: success. Haggle: well, fair, walked. */
export function branchOf(kind, result) {
  if (kind === 'haggle') return result?.outcome === 'well' ? 'win' : result?.outcome === 'fair' ? 'mid' : 'lose';
  return result?.success ? 'win' : 'lose';
}

/** The node a finished minigame leads to. */
export function targetFor(choice, result) {
  const branch = branchOf(choice.minigame.kind, result);
  return branch === 'win' ? choice.check.pass : branch === 'lose' ? choice.check.fail : choice.minigame.mid;
}

/**
 * What a finished minigame did to the world, as plain facts the scene or the workbench can show (nothing here edits scene data):
 *   repair: { broken, flooding, offline, system, systemName }  (a lost line stays broken; shutting the valve takes the system offline)
 *   hack:   { security, terminal | port | section }            (alerted after the last retry; by context: terminal 'locked' on foot, port 'closed' on a ship, section 'changed' in ship to ship combat)
 *   others: {}
 */
export function worldResult(kind, result) {
  if (kind === 'repair') return worldOf(result);
  if (kind === 'hack') { const { security, terminal, port, section } = result || {}; return Object.fromEntries(Object.entries({ security, terminal, port, section }).filter(([, v]) => v != null)); }
  return {};
}

/** The skill XP event for a result: { type: 'skill-xp', skill, xp } or null when nothing is earned. */
export function xpEvent(kind, result) {
  const xp = Math.max(0, Math.trunc(result?.xp) || 0);
  return xp > 0 ? { type: 'skill-xp', skill: HOOK_KINDS[kind].skill, xp } : null;
}

export { haggleOutcome };

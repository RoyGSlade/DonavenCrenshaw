// Roll preview line (extra 5): under the d20 result, say in plain words what the roll did to the minigame:
// "Smooth roll: 15 s more, a smaller board (4 x 4)." and how far the next tier up is: "2 more on the
// d20 would make it Smooth." It compares the setup at the rolled tier with the setup at a Steady roll
// (same level and points) using the real setup functions, so the line cannot disagree with the game. Pure.
import { tierOf, tierInfo, setupRepair, setupHack, setupHaggle, setupPersuade, setupIntimidate, setupCraft, setupNav, setupStealth, setupPilot } from './setup.js';

const r1 = (x) => Math.round(x * 10) / 10;
const num = (x) => (Number.isInteger(r1(x)) ? String(r1(x)) : r1(x).toFixed(1));
// Phrase makers: each takes (base, now) and returns a phrase or null when nothing changed.
const secs = (key, what) => (b, n) => (r1(n[key]) === r1(b[key]) ? null : `${num(Math.abs(n[key] - b[key]))} s ${n[key] > b[key] ? 'more' : 'less'}${what ? ` ${what}` : ''}`);
const count = (key, one, many, up = 'more', down = 'fewer') => (b, n) => { const d = n[key] - b[key]; return d === 0 ? null : `${Math.abs(d)} ${up === 'more' && d > 0 || down === 'more' && d < 0 ? 'more' : 'fewer'} ${Math.abs(d) === 1 ? one : many}`; };
const pct = (key, what, up = 'wider', down = 'narrower') => (b, n) => { const d = Math.round((n[key] / b[key] - 1) * 100); return d === 0 ? null : `${what} ${Math.abs(d)}% ${d > 0 ? up : down}`; };
const board = (key) => (b, n) => (n[key] === b[key] ? null : `a ${n[key] < b[key] ? 'smaller' : 'bigger'} map (${n[key]} x ${n[key]})`);

export const SPECS = Object.freeze({
  repair: { setup: setupRepair, phrases: [(b, n) => (n.capacity === b.capacity ? null : `a ${n.capacity > b.capacity ? 'deeper' : 'shallower'} pool (${num(Math.abs(n.capacity - b.capacity))} s ${n.capacity > b.capacity ? 'more' : 'less'})`), (b, n) => (n.flow === b.flow ? null : `${n.flow < b.flow ? 'slower' : 'faster'} leaks`), (b, n) => (n.size === b.size ? null : `a ${n.size < b.size ? 'smaller' : 'bigger'} board (${n.size} x ${n.size})`)] },
  hack: { setup: setupHack, phrases: [secs('time', 'on the lock'), (b, n) => { const d = n.tumblers - b.tumblers; return d === 0 ? null : `${Math.abs(d)} ${d < 0 ? 'fewer' : 'more'} tumbler${Math.abs(d) === 1 ? '' : 's'}`; }, (b, n) => { const d = n.misses - b.misses; return d === 0 ? null : `${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} spare miss${Math.abs(d) === 1 ? '' : 'es'}`; }] },
  haggle: { setup: setupHaggle, phrases: [pct('band', 'comfort band'), (b, n) => { const d = n.patience - b.patience; return d === 0 ? null : `${Math.abs(d)} ${d > 0 ? 'more' : 'less'} patience`; }, (b, n) => { const d = n.rounds - b.rounds; return d === 0 ? null : `${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} round${Math.abs(d) === 1 ? '' : 's'}`; }] },
  persuade: { setup: setupPersuade, phrases: [(b, n) => { const d = n.tells - b.tells; return d === 0 ? null : `you notice ${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} thing${Math.abs(d) === 1 ? '' : 's'}`; }, (b, n) => { const d = n.patience - b.patience; return d === 0 ? null : `${Math.abs(d)} ${d > 0 ? 'more' : 'less'} patience`; }, (b, n) => { const d = n.goal - b.goal; return d === 0 ? null : `${Math.abs(d)} ${d < 0 ? 'less' : 'more'} trust needed`; }] },
  intimidate: { setup: setupIntimidate, phrases: [(b, n) => { const d = n.chances[0] - b.chances[0]; return d === 0 ? null : `snap risk ${Math.abs(d)} points ${d < 0 ? 'lower' : 'higher'}`; }, (b, n) => (n.readsOdds === b.readsOdds ? null : n.readsOdds ? 'you read the exact risk' : 'you only read a word for the risk')] },
  craft: { setup: setupCraft, phrases: [(b, n) => { const d = n.strikes - b.strikes; return d === 0 ? null : `${Math.abs(d)} ${d < 0 ? 'fewer' : 'more'} shaping step${Math.abs(d) === 1 ? '' : 's'}`; }, pct('workFactor', 'work time', 'longer', 'shorter'), pct('zone', 'heat band')] },
  nav: { setup: setupNav, phrases: [board('size'), (b, n) => { const d = n.hazards - b.hazards; return d === 0 ? null : `${Math.abs(d)} ${d < 0 ? 'fewer' : 'more'} hazard${Math.abs(d) === 1 ? '' : 's'}`; }, pct('budgetFactor', 'time budget', 'bigger', 'smaller')] },
  stealth: { setup: setupStealth, phrases: [(b, n) => { const d = n.guards - b.guards; return d === 0 ? null : `${Math.abs(d)} ${d < 0 ? 'fewer' : 'more'} guard${Math.abs(d) === 1 ? '' : 's'}`; }, (b, n) => { const d = n.beats - b.beats; return d === 0 ? null : `${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} beats before the shift change`; }] },
  pilot: { setup: setupPilot, phrases: [secs('fall', 'of fall time'), pct('wind', 'wind', 'stronger', 'weaker'), pct('pad', 'pad', 'wider', 'narrower')] },
});

/** The tier above this one's margin needed: { tier, needed } = how many more points on the d20 reach it, or null at Smooth. */
export function nextTier(attempt = {}) {
  const t = tierOf(attempt);
  if (t >= 2 || attempt.natural) return null;
  const need = { '-2': -5, '-1': 0, '0': 5, '1': 10 }[String(t)];
  const margin = (attempt.total ?? 0) - (attempt.dc ?? 10);
  return { tier: t + 1, needed: need - margin, label: tierInfo(t + 1).label };
}

/**
 * The preview for a game and an attempt ({ total, dc, natural }), with the player's level and points.
 * Returns { tier, label, phrases, line, next, nextLine }; `line` reads "Smooth roll: 15 s more, a smaller board (4 x 4)."
 */
export function rollPreview(gameId, attempt, { level = 1, points = {} } = {}) {
  const spec = SPECS[gameId];
  if (!spec) return null;
  const tier = tierOf(attempt);
  const base = spec.setup({ tier: 0, level, points }), now = spec.setup({ tier, level, points });
  const phrases = spec.phrases.map((p) => p(base, now)).filter(Boolean);
  const label = tierInfo(tier).label;
  const line = phrases.length ? `${label} roll: ${phrases.join(', ')}.` : `${label} roll: nothing changes.`;
  const next = nextTier(attempt);
  const nextLine = next ? `${next.needed} more on the d20 would make it ${next.label}.` : 'The best roll there is.';
  return { tier, label, phrases, line, next, nextLine };
}

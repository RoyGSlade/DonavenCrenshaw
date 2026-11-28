// Respec is a nap (round 3, basics lane; skills-menu lane 2026-11-18: now for category points).
// Donaven: "respec costs money and a nap". After Lock in, points come back only at the bunk:
// you pick which points (a plan is { skill: { category: points to take back } }), see the price
// (hangarData.js respec: 10 credits a point, free during the tutorial), then sleep. The screen
// fades out, a beat, then back in with those points free to spend. Reduced motion: no fade, the
// same beat. With the home server on, the Guild bank holds the points, so the nap says so.
import { BASICS_DATA } from './data.js';
import { respecCost, RESPEC } from '../hangarSkills.js';
import { SKILL_CATEGORY_IDS } from '../data.js';
import { spend, money } from '../economy.js';
import { el } from './dom.js';
import { icon } from './icons.js';

const NAP = BASICS_DATA.nap;
export const fillText = (text, vars) => { const v = { s: vars.points === 1 ? '' : 's', ...vars }; return String(text).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? '')); };

const have = (c, skill, cat) => Math.max(0, Math.trunc(c?.points?.[skill]?.[cat]) || 0);
const asked = (plan, skill, cat) => Math.max(0, Math.trunc(plan?.[skill]?.[cat]) || 0);
/** The plan trimmed to what is really there, no empty rows. */
export function cleanPlan(c, plan) {
  const out = {};
  for (const [skill, cats] of Object.entries(plan || {})) {
    if (!SKILL_CATEGORY_IDS[skill]) continue;
    for (const cat of SKILL_CATEGORY_IDS[skill]) {
      const n = Math.min(asked(plan, skill, cat), have(c, skill, cat));
      if (n > 0) out[skill] = { ...out[skill], [cat]: n };
    }
    void cats;
  }
  return out;
}
/** The captain with the plan's points taken out (never below zero, no empty rows). */
export function applyPlan(c, plan) {
  const points = {};
  for (const skill of Object.keys(SKILL_CATEGORY_IDS)) {
    const row = {};
    for (const cat of SKILL_CATEGORY_IDS[skill]) {
      const left = have(c, skill, cat) - Math.min(asked(plan, skill, cat), have(c, skill, cat));
      if (left > 0) row[cat] = left;
    }
    if (Object.keys(row).length) points[skill] = row;
  }
  return { ...c, points };
}
export const planPoints = (plan) => Object.values(plan || {}).reduce((a, row) => a + Object.values(row || {}).reduce((x, n) => x + (n > 0 ? n : 0), 0), 0);

/** Can one more point of this path go on the plan? { ok, reason } in plain words. */
export function canTake(c, plan, skill, cat) {
  if (!SKILL_CATEGORY_IDS[skill]?.includes(cat)) return { ok: false, reason: 'There is no such path.' };
  if (have(c, skill, cat) - asked(plan, skill, cat) <= 0) return { ok: false, reason: 'No points left there to take back.' };
  return { ok: true, reason: '' };
}
/** Can a picked point go back to being kept? */
export const canKeep = (plan, skill, cat) => (asked(plan, skill, cat) > 0 ? { ok: true, reason: '' } : { ok: false, reason: '' });
export const spentTotal = (c) => Object.values(c?.points || {}).reduce((a, row) => a + Object.values(row || {}).reduce((x, n) => x + n, 0), 0);

/** "Want points back? Take a nap at your bunk and pick which ones: 10 credits a point." (free in the tutorial) */
export function napLine(tutorial, { hub = false } = {}) {
  if (hub) return NAP.hub; // the Guild bank holds the points: say so here too, not only at the bunk
  const cost = tutorial && RESPEC.freeInTutorial ? NAP.padFree : `${RESPEC.feePerPoint} credits a point`;
  return fillText(NAP.padLine, { cost });
}

/** What a nap with this plan would do: { points, cost, ok, reason, line }. Nothing picked: no nap. */
export function napQuote(save, tutorial, plan = {}, { hub = false } = {}) {
  const c = save.character;
  if (!c) return { points: 0, cost: 0, ok: false, reason: 'Make a captain first.', line: '' };
  if (!spentTotal(c)) return { points: 0, cost: 0, ok: false, reason: NAP.nothing, line: NAP.nothing };
  if (hub) return { points: 0, cost: 0, ok: false, reason: NAP.hub, line: NAP.hub };
  const clean = cleanPlan(c, plan);
  const points = planPoints(clean);
  if (!points) return { points: 0, cost: 0, ok: false, reason: NAP.pickFirst, line: NAP.pickFirst };
  const cost = respecCost(points, { tutorial }).money || 0;
  const line = cost ? fillText(NAP.costLine, { cost, fee: RESPEC.feePerPoint, points }) : fillText(NAP.freeLine, { points });
  if (cost > (save.money || 0)) return { points, cost, ok: false, reason: fillText(NAP.broke, { cost, money: save.money || 0 }), line };
  return { points, cost, ok: true, reason: '', line };
}

/**
 * Take the nap: pay, fade out, take the picked points back in the dark, fade in.
 * Resolves { ok, points, cost } (ok false with a reason when it can't be done).
 */
export function takeNap({ store, tutorial, plan = {}, hub = false, reducedMotion = () => false, root = document.body, onDone = () => {} }) {
  const save = store.get();
  const q = napQuote(save, tutorial, plan, { hub });
  if (!q.ok) return Promise.resolve({ ok: false, reason: q.reason });
  const paid = q.cost ? spend(save, { money: q.cost }) : { ok: true, save };
  if (!paid.ok) return Promise.resolve({ ok: false, reason: paid.reason || q.reason });
  const still = reducedMotion();
  const veil = el('div', { class: `dp-nap${still ? ' is-still' : ''}`, role: 'status', 'aria-live': 'assertive' },
    el('div', { class: 'dp-nap-card' }, icon('bunk', 'dp-nap-icon'), el('p', { class: 'dp-nap-z', text: 'z z z', 'aria-hidden': 'true' }), el('p', { class: 'dp-nap-line', text: NAP.dream })));
  root.append(veil);
  const fade = still ? 0 : NAP.fadeMs;
  return new Promise((resolve) => {
    requestAnimationFrame(() => veil.classList.add('is-dark'));
    setTimeout(() => {
      // In the dark: the refund (one write: pay and refund together).
      store.update(() => ({ ...paid.save, character: applyPlan(save.character, plan) }));
      setTimeout(() => { veil.querySelector('.dp-nap-line').textContent = fillText(NAP.woke, { points: q.points }); }, NAP.holdMs * 0.55);
      setTimeout(() => {
        veil.classList.remove('is-dark');
        veil.classList.add('is-waking');
        setTimeout(() => {
          veil.remove();
          onDone({ points: q.points, cost: q.cost });
          resolve({ ok: true, points: q.points, cost: q.cost, text: `${fillText(NAP.woke, { points: q.points })}${q.cost ? ` (${money(q.cost)})` : ''}` });
        }, fade);
      }, NAP.holdMs);
    }, fade);
  });
}

// Respec is a nap (round 3, basics lane). Donaven: "respec costs money and a
// nap". At the bunk only: "Take a nap and rethink" costs credits (the existing
// respec rule: hangarData.js respec, free during the tutorial) and plays a short
// nap: the screen fades out, a beat, then fades back in with every skill point
// back to spend. Reduced motion: no fade, the same beat.
import { BASICS_DATA } from './data.js';
import { respecCost, needsHold, RESPEC } from '../hangarSkills.js';
import { SKILLS } from '../data.js';
import { spend, money } from '../economy.js';
import { el } from './pages.js';
import { icon } from './icons.js';

const NAP = BASICS_DATA.nap;
export const fillText = (text, vars) => { const v = { s: vars.points === 1 ? '' : 's', ...vars }; return String(text).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? '')); };

// Donaven (round 3 follow-up): "you pick which ones not all that could be annoying".
// A plan is { skillId: ranks to take back }. A rank can be picked only if every skill
// left still has the tree points it needs; the reason names the skill in the way.

const SKILL_NAME = new Map(SKILLS.map((s) => [s.id, s.name]));
/** The captain with the plan's ranks taken out. */
export function applyPlan(c, plan) {
  const skills = { ...(c.skills || {}) };
  for (const [id, n] of Object.entries(plan || {})) {
    const left = (skills[id] || 0) - n;
    if (left > 0) skills[id] = left; else delete skills[id];
  }
  return { ...c, skills };
}
export const planPoints = (plan) => Object.values(plan || {}).reduce((a, n) => a + (n > 0 ? n : 0), 0);

/** Can one more rank of this skill go on the plan? { ok, reason } in plain words. */
export function canPick(c, plan, id) {
  const have = (c.skills?.[id] || 0) - (plan?.[id] || 0);
  if (have <= 0) return { ok: false, reason: `No ${SKILL_NAME.get(id) || id} ranks left to take back.` };
  const next = { ...plan, [id]: (plan?.[id] || 0) + 1 };
  const held = needsHold(applyPlan(c, next));
  if (!held.ok) return { ok: false, reason: fillText(NAP.blocked, { skill: held.blocker.name, picked: SKILL_NAME.get(id) || id }) };
  return { ok: true, reason: '' };
}
/** Can a picked rank go back (kept)? Putting one back can break nothing, except a rank that needs points still on the plan. */
export function canUnpick(c, plan, id) {
  if (!(plan?.[id] > 0)) return { ok: false, reason: '' };
  const next = { ...plan, [id]: plan[id] - 1 };
  const held = needsHold(applyPlan(c, next));
  if (!held.ok) return { ok: false, reason: fillText(NAP.blockedBack, { skill: held.blocker.name }) };
  return { ok: true, reason: '' };
}

/** What a nap with this plan would do: { points, cost, ok, reason, line }. Nothing picked: no nap. */
export function napQuote(save, tutorial, plan = {}) {
  const c = save.character;
  if (!c) return { points: 0, cost: 0, ok: false, reason: 'Make a captain first.', line: '' };
  if (!Object.keys(c.skills || {}).length) return { points: 0, cost: 0, ok: false, reason: NAP.nothing, line: NAP.nothing };
  const points = planPoints(plan);
  if (!points) return { points: 0, cost: 0, ok: false, reason: NAP.pickFirst, line: NAP.pickFirst };
  if (!needsHold(applyPlan(c, plan)).ok) return { points, cost: 0, ok: false, reason: NAP.planBroken, line: NAP.planBroken };
  const cost = respecCost(points, { tutorial }).money || 0;
  const line = cost ? fillText(NAP.costLine, { cost, fee: RESPEC.feePerPoint, points }) : fillText(NAP.freeLine, { points });
  if (cost > (save.money || 0)) return { points, cost, ok: false, reason: fillText(NAP.broke, { cost, money: save.money || 0 }), line };
  return { points, cost, ok: true, reason: '', line };
}

/**
 * Take the nap: pay, fade out, take the picked ranks back in the dark, fade in.
 * Resolves { ok, points, cost } (ok false with a reason when it can't be done).
 */
export function takeNap({ store, tutorial, plan = {}, reducedMotion = () => false, root = document.body, onDone = () => {} }) {
  const save = store.get();
  const q = napQuote(save, tutorial, plan);
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

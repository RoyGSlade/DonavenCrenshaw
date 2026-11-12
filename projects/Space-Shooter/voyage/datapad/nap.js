// Respec is a nap (round 3, basics lane). Donaven: "respec costs money and a
// nap". At the bunk only: "Take a nap and rethink" costs credits (the existing
// respec rule: hangarData.js respec, free during the tutorial) and plays a short
// nap: the screen fades out, a beat, then fades back in with every skill point
// back to spend. Reduced motion: no fade, the same beat.
import { BASICS_DATA } from './data.js';
import { respecQuote, respecAll, RESPEC } from '../hangarSkills.js';
import { spend, money } from '../economy.js';
import { el } from './pages.js';
import { icon } from './icons.js';

const NAP = BASICS_DATA.nap;
const fillText = (text, vars) => String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

/** What a nap would do for this save: { points, cost, ok, reason, line }. */
export function napQuote(save, tutorial) {
  const c = save.character;
  if (!c) return { points: 0, cost: 0, ok: false, reason: 'Make a captain first.', line: '' };
  const quote = respecQuote(c, { tutorial });
  const cost = quote.cost.money || 0;
  if (!quote.points) return { points: 0, cost: 0, ok: false, reason: NAP.nothing, line: NAP.nothing };
  if (cost > (save.money || 0)) return { points: quote.points, cost, ok: false, reason: fillText(NAP.broke, { cost, money: save.money || 0 }), line: fillText(NAP.costLine, { cost, fee: RESPEC.feePerPoint, points: quote.points }) };
  return { points: quote.points, cost, ok: true, reason: '', line: cost ? fillText(NAP.costLine, { cost, fee: RESPEC.feePerPoint, points: quote.points }) : NAP.free };
}

/**
 * Take the nap: pay, fade out, refund every point in the dark, fade in.
 * Resolves { ok, points, cost } (ok false with a reason when it can't be done).
 */
export function takeNap({ store, tutorial, reducedMotion = () => false, root = document.body, onDone = () => {} }) {
  const save = store.get();
  const q = napQuote(save, tutorial);
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
      store.update(() => ({ ...paid.save, character: respecAll(save.character) }));
      setTimeout(() => { veil.querySelector('.dp-nap-line').textContent = NAP.woke; }, NAP.holdMs * 0.55);
      setTimeout(() => {
        veil.classList.remove('is-dark');
        veil.classList.add('is-waking');
        setTimeout(() => {
          veil.remove();
          onDone({ points: q.points, cost: q.cost });
          resolve({ ok: true, points: q.points, cost: q.cost, text: `${NAP.woke}${q.cost ? ` (${money(q.cost)})` : ''}` });
        }, fade);
      }, NAP.holdMs);
    }, fade);
  });
}

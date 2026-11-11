// The attempt roller: every check in play (a dialogue check, a repair, a hack)
// is its own fresh 1d6 plus the stat and skill bonus against a target
// (Donaven, 2026-11-11). The game's seeded rules decide that number; this only
// shows it: a small die tumbles in the corner for about a second and lands on
// the decided face (ui/dice.js rollTo relabels the faces), then the sum reads
// "4 + 3 = 7 vs 7: made it". Tap to skip. With reduced motion the result shows
// at once. The STAT rolls at captain creation are different: there the landed
// face is the roll (ui/licence.js).
import { createDiceTray, cryptoRng } from './dice.js';
import { STATS } from '../data.js';

// The event a check result arrives on (story lane, ROUND2-CONTRACT.md). One line to rename.
export const ATTEMPT_EVENT = 'check:rolled';
const STAT_NAME = Object.fromEntries(STATS.map((s) => [s.id, s.name]));

/**
 * The words for a check result. r: { roll, bonus, total, dc, pass, stat?, label? }
 * (core's check() shape; bonus already includes the stat).
 */
export function attemptWords(r) {
  const what = r.label || (r.stat ? `${STAT_NAME[r.stat] || r.stat} check` : 'Check');
  const sum = `${r.roll} + ${r.bonus} = ${r.total}`;
  return { what, sum, target: `needs ${r.dc}`, verdict: r.pass ? 'Made it' : 'Not this time' };
}

/** root: an empty element (fixed in a corner by kit.css). bus: the story bus. */
export function createAttemptRoller({ root, bus, reducedMotion = () => false, rng = cryptoRng(), holdMs = 1600 }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ui-attempt-die';
  canvas.setAttribute('aria-hidden', 'true');
  const what = document.createElement('p');
  what.className = 'ui-attempt-what';
  const sum = document.createElement('p');
  sum.className = 'ui-attempt-sum';
  const verdict = document.createElement('p');
  verdict.className = 'ui-attempt-verdict';
  const text = document.createElement('div');
  text.append(what, sum, verdict);
  root.replaceChildren(canvas, text);
  root.className = 'ui-attempt ui-card';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  let tray = null;
  let queue = Promise.resolve();
  let hideTimer = 0;

  root.addEventListener('click', () => { if (tray?.rolling) tray.skip(); else root.hidden = true; });

  function show(result) {
    queue = queue.then(async () => {
      clearTimeout(hideTimer);
      const words = attemptWords(result);
      root.hidden = false;
      root.dataset.pass = String(Boolean(result.pass));
      root.classList.remove('is-done');
      what.textContent = words.what;
      sum.textContent = `Rolling… ${words.target}`;
      verdict.textContent = '';
      if (!tray) tray = createDiceTray(canvas, { rng, reducedMotion, timeScale: 2.2, framing: 1.5, follow: true });
      const roll = Math.min(6, Math.max(1, Math.trunc(result.roll) || 1));
      await tray.rollTo(roll);
      sum.textContent = `${words.sum}, ${words.target}`;
      verdict.textContent = words.verdict;
      root.classList.add('is-done');
      bus?.emit('hangar:attempt-shown', { pass: Boolean(result.pass) });
      hideTimer = setTimeout(() => { root.hidden = true; }, reducedMotion() ? holdMs * 1.5 : holdMs);
    }).catch((error) => console.warn('Stardust: the attempt roller failed', error));
    return queue;
  }

  const off = bus?.on(ATTEMPT_EVENT, (r) => { if (r && Number.isFinite(r.roll)) show(r); });
  return { show, destroy() { off?.(); tray?.destroy(); clearTimeout(hideTimer); } };
}

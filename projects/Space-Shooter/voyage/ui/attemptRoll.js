// The attempt roller: every check in play (a dialogue check, a repair, a hack)
// is its own fresh 2d6 plus the stat's bonus against a target, and a double
// six always works (Donaven, 2026-11-11; ROUND2-CONTRACT.md section 6). The
// game's seeded rules decide the dice; this only shows them: two small dice
// tumble in the corner for about a second and land on the decided faces
// (ui/dice.js rollTo relabels the faces), then the sum reads
// "4 + 3 + 2 = 9, needs 8: made it" (gold on a natural double six). Tap to skip. With reduced motion the result shows
// at once. The STAT rolls at captain creation are different: there the landed
// face is the roll (ui/licence.js).
import { createDiceTray, cryptoRng } from './dice.js';
import { STATS } from '../data.js';

// The event a check result arrives on (story lane, ROUND2-CONTRACT.md). One line to rename.
export const ATTEMPT_EVENT = 'roll:attempt';
const STAT_NAME = Object.fromEntries(STATS.map((s) => [s.id, s.name]));

/**
 * The words for an attempt. r: the contract's attempt shape { dice: [a, b], roll, statMod|bonus,
 * total, dc, pass, natural, stat?, label?, who? } (older single-die { roll, bonus } still reads).
 */
export function attemptWords(r) {
  const what = r.label || (r.stat ? `${STAT_NAME[r.stat] || r.stat} attempt` : 'Attempt');
  const dice = Array.isArray(r.dice) && r.dice.length ? r.dice : [r.roll];
  const bonus = Number(r.bonus) || 0;
  const sum = `${dice.join(' + ')} ${bonus < 0 ? '-' : '+'} ${Math.abs(bonus)} = ${r.total}`;
  const verdict = r.natural ? 'Double six! It works, whatever the odds' : r.pass ? 'Made it' : 'Not this time';
  return { what: r.who ? `${r.who}: ${what}` : what, sum, target: `needs ${r.dc}`, verdict };
}

/** root: an empty element (fixed in a corner by kit.css). bus: the story bus. */
export function createAttemptRoller({ root, bus, reducedMotion = () => false, rng = cryptoRng(), holdMs = 1600 }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ui-attempt-die';
  canvas.setAttribute('aria-hidden', 'true');
  const canvas2 = document.createElement('canvas');
  canvas2.className = 'ui-attempt-die';
  canvas2.setAttribute('aria-hidden', 'true');
  const dice = document.createElement('div');
  dice.className = 'ui-attempt-dice';
  dice.append(canvas, canvas2);
  const what = document.createElement('p');
  what.className = 'ui-attempt-what';
  const sum = document.createElement('p');
  sum.className = 'ui-attempt-sum';
  const verdict = document.createElement('p');
  verdict.className = 'ui-attempt-verdict';
  const text = document.createElement('div');
  text.append(what, sum, verdict);
  root.replaceChildren(dice, text);
  root.className = 'ui-attempt ui-card';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  let tray = null;
  let tray2 = null;
  let queue = Promise.resolve();
  let hideTimer = 0;

  root.addEventListener('click', () => { if (tray?.rolling || tray2?.rolling) { tray?.skip(); tray2?.skip(); } else root.hidden = true; });

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
      root.dataset.natural = String(Boolean(result.natural));
      if (!tray) tray = createDiceTray(canvas, { rng, reducedMotion, timeScale: 2.2, framing: 1.5, follow: true });
      const faces = (Array.isArray(result.dice) && result.dice.length ? result.dice : [result.roll]).map((v) => Math.min(6, Math.max(1, Math.trunc(v) || 1)));
      canvas2.hidden = faces.length < 2;
      if (faces.length > 1 && !tray2) tray2 = createDiceTray(canvas2, { rng, reducedMotion, timeScale: 2.2, framing: 1.5, follow: true });
      await Promise.all([tray.rollTo(faces[0]), faces.length > 1 ? tray2.rollTo(faces[1]) : null]);
      sum.textContent = `${words.sum}, ${words.target}`;
      verdict.textContent = words.verdict;
      root.classList.add('is-done');
      bus?.emit('hangar:attempt-shown', { pass: Boolean(result.pass), natural: Boolean(result.natural) });
      hideTimer = setTimeout(() => { root.hidden = true; }, reducedMotion() ? holdMs * 1.5 : holdMs);
    }).catch((error) => console.warn('Stardust: the attempt roller failed', error));
    return queue;
  }

  const off = bus?.on(ATTEMPT_EVENT, (r) => { if (r && (Array.isArray(r.dice) || Number.isFinite(r.roll))) show(r); });
  return { show, destroy() { off?.(); tray?.destroy(); tray2?.destroy(); clearTimeout(hideTimer); } };
}

// The attempt roller: every check in play (a dialogue check, a repair, a hack)
// is its own fresh d20 plus the level of the skill it uses, against a target;
// advantage rolls two and keeps the higher; a natural 20 always works (design
// doc Section 5; launch tech lane outcome 1). The game's seeded rules decide
// the die; this only shows it: a d20 tumbles in the corner for about a second
// and lands on the decided face (ui/d20.js), then the sum reads
// "14 + Social 2 = 16, needs 12: made it" (gold on a natural 20). With
// advantage two dice land and the dropped one dims. Tap to skip. With reduced
// motion the result shows at once. The STAT rolls at captain creation are
// different: there the landed d6 face is the roll (ui/licence.js).
import { createD20 } from './d20.js';
import { cryptoRng } from './dice.js';
import { STATS, ROLL_SKILLS } from '../data.js';

// The event a check result arrives on (story lane, ROUND2-CONTRACT.md). One line to rename.
export const ATTEMPT_EVENT = 'roll:attempt';
const STAT_NAME = Object.fromEntries(STATS.map((s) => [s.id, s.name]));
const SKILL_NAME = Object.fromEntries(ROLL_SKILLS.map((s) => [s.id, s.name]));

/** The kept d20 of a result and the dropped ones (advantage). */
export function keptDie(r) {
  const dice = (Array.isArray(r?.dice) && r.dice.length ? r.dice : [r?.roll]).map((v) => Math.min(20, Math.max(1, Math.trunc(v) || 1)));
  const kept = Number.isFinite(r?.roll) ? Math.min(20, Math.max(1, Math.trunc(r.roll))) : Math.max(...dice);
  const at = Math.max(0, dice.indexOf(kept));
  return { dice, kept, at, dropped: dice.filter((_, i) => i !== at) };
}

const signed = (n, what) => `${n < 0 ? '-' : '+'} ${what ? `${what} ` : ''}${Math.abs(n)}`;
// "+ Social 2 + 2 ship", or "+ 3" for a result that only says its bonus.
function bonusWords(r) {
  const bonus = Number(r.bonus) || 0;
  if (!Number.isFinite(r.level)) return signed(bonus);
  const parts = [];
  if (r.level) parts.push(signed(r.level, SKILL_NAME[r.skill] || r.skill));
  if (r.statMod) parts.push(signed(r.statMod, STAT_NAME[r.stat] || r.stat));
  if (r.extra) parts.push(`${signed(r.extra)} ship`);
  const rest = bonus - (r.level || 0) - (r.statMod || 0) - (r.extra || 0);
  if (rest) parts.push(signed(rest));
  return parts.length ? parts.join(' ') : signed(0);
}

/**
 * The words for an attempt. r: the attempt shape { dice: [d20] or [d20, d20], roll (kept),
 * bonus, total, dc, pass, natural, advantage?, skill?, stat?, label?, who? }.
 */
export function attemptWords(r) {
  const named = r.skill ? `${SKILL_NAME[r.skill] || r.skill} attempt` : r.stat ? `${STAT_NAME[r.stat] || r.stat} attempt` : 'Attempt';
  const { kept, dropped } = keptDie(r);
  const what = `${r.label || named}${dropped.length ? ' · advantage' : ''}`;
  const adv = dropped.length ? ` (${dropped.join(', ')} dropped)` : '';
  const sum = `${kept}${adv} ${bonusWords(r)} = ${r.total}`;
  const verdict = r.natural ? 'Natural 20! It works, whatever the odds' : r.pass ? 'Made it' : 'Not this time';
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
  let die = null;
  let die2 = null;
  let queue = Promise.resolve();
  let hideTimer = 0;

  root.addEventListener('click', () => { if (die?.rolling || die2?.rolling) { die?.skip(); die2?.skip(); } else root.hidden = true; });

  function show(result) {
    queue = queue.then(async () => {
      clearTimeout(hideTimer);
      const words = attemptWords(result);
      const { dice: faces, at } = keptDie(result);
      root.hidden = false;
      root.dataset.pass = String(Boolean(result.pass));
      root.dataset.natural = String(Boolean(result.natural));
      root.dataset.advantage = String(faces.length > 1);
      root.classList.remove('is-done');
      what.textContent = words.what;
      sum.textContent = `Rolling… ${words.target}`;
      verdict.textContent = '';
      canvas2.hidden = faces.length < 2;
      if (!die) die = createD20(canvas, { rng, reducedMotion });
      if (faces.length > 1 && !die2) die2 = createD20(canvas2, { rng, reducedMotion });
      die.dim(false); die2?.dim(false);
      await Promise.all([die.rollTo(faces[0]), faces.length > 1 ? die2.rollTo(faces[1]) : null]);
      if (faces.length > 1) (at === 0 ? die2 : die).dim(true);
      sum.textContent = `${words.sum}, ${words.target}`;
      verdict.textContent = words.verdict;
      root.classList.add('is-done');
      bus?.emit('hangar:attempt-shown', { pass: Boolean(result.pass), natural: Boolean(result.natural), advantage: faces.length > 1 });
      hideTimer = setTimeout(() => { root.hidden = true; }, reducedMotion() ? holdMs * 1.5 : holdMs);
    }).catch((error) => console.warn('Stardust: the attempt roller failed', error));
    return queue;
  }

  const off = bus?.on(ATTEMPT_EVENT, (r) => { if (r && (Array.isArray(r.dice) || Number.isFinite(r.roll))) show(r); });
  return { show, destroy() { off?.(); die?.destroy(); die2?.destroy(); clearTimeout(hideTimer); } };
}

// The push (social lane, plan 1.4 to 1.6), pure: the DC and its plain-words breakdown, the head start each fact gives, how a
// roll and the person's lean set up the existing mini-games (persuade cards, intimidate ladder, bribe needle), how a game result
// becomes a grade, and what a grade leaves behind. Numbers are the plan's starting values; each is one constant here.
import { setupPersuade, setupIntimidate } from '../minigames/setup.js';
import { setupBribe } from './bribe.js';

export const ABILITY_NAMES = Object.freeze({ persuade: 'Persuade', intimidate: 'Intimidate', bribe: 'Bribe' });
export const APPROACH_NAMES = Object.freeze({ empathy: 'Empathy', anger: 'Anger', money: 'Money' });
export const BOND_NAMES = Object.freeze(['Cold', 'Wary', 'Crew', 'Friendly', 'Trusted', 'Family']);
export const BOND_DC = Object.freeze([2, 1, 0, -1, -2, -3]); // every bond step moves every push roll
export const DC_MIN = 5, DC_MAX = 20;
export const TALK_PATIENCE = 3;
export const TALK_BOND_CAP = 3;     // talk alone lifts the bond to 3; 4 and 5 come from deeds
export const TOPICS_PER_TALK = 2;
export const DAY_MS = 30 * 60 * 1000;   // one game day is 30 real minutes
export const PAID_DAYS = 3;
export const dayOf = (now) => Math.floor(now / DAY_MS);

const clampBond = (b) => Math.max(0, Math.min(5, b));
export { clampBond };

/** How an approach sits with a person: 'fits' (-2), 'neutral' (0) or 'misfit' (+2). */
export const fitOf = (leanValue) => (leanValue < 0 ? 'fits' : leanValue > 0 ? 'misfit' : 'neutral');

/** Mark effects on a push roll. scared: later Intimidate -2, later Empathy +2. */
export function markShift(marks = {}, { ability, approach }) {
  let n = 0;
  if (marks.scared) { if (ability === 'intimidate') n -= 2; if (approach === 'empathy') n += 2; }
  return n;
}

/**
 * The DC and where it came from, in the order the player reads it.
 * { resist, lean, bond, failed, marks, ability, approach } -> { dc, raw, clamped, parts: [{ id, label, n }] }.
 * DC = resist + lean - (bond - 2) + 1 per failed push + marks, kept between 5 and 20.
 */
export function dcOf({ resist = 12, lean = 0, bond = 2, failed = 0, marks = {}, ability, approach }) {
  const parts = [{ id: 'resist', label: 'Their no', n: resist }];
  const bondN = BOND_DC[clampBond(bond)];
  if (lean) parts.push({ id: 'lean', label: `${APPROACH_NAMES[approach]} ${lean < 0 ? 'fits them' : 'is a misfit'}`, n: lean });
  if (bondN) parts.push({ id: 'bond', label: `Bond ${BOND_NAMES[clampBond(bond)]}`, n: bondN });
  if (failed) parts.push({ id: 'failed', label: `${failed} push${failed === 1 ? '' : 'es'} failed this talk`, n: failed });
  const ms = markShift(marks, { ability, approach });
  if (ms) parts.push({ id: 'mark', label: marks.scared ? 'They are scared of you' : 'A mark', n: ms });
  const raw = parts.reduce((a, p) => a + p.n, 0);
  const dc = Math.max(DC_MIN, Math.min(DC_MAX, raw));
  return { dc, raw, clamped: dc !== raw, parts };
}

/** The DC as one plain line: "Their no 12, Empathy fits them -2, Bond Friendly -1 = 9". */
export const dcLine = (d) => `${d.parts.map((p, i) => `${p.label} ${i && p.n > 0 ? '+' : ''}${p.n}`).join(', ')} = ${d.dc}${d.clamped ? ` (kept between ${DC_MIN} and ${DC_MAX})` : ''}`;

/**
 * The head start a push gets from the facts you know (plan 1.5). `known` is a list of fact ids, `facts` the sheet's fact map.
 * persuade: each known fact's tells are shown from the start and its named card is worth 5.
 * intimidate: a push built on a fact (it has needs.facts) cannot snap on the first push, and you always read the percent.
 * bribe: a push built on a fact has a comfort band 1.5 times as wide.
 */
export function headStart({ ability, push, facts = {}, known = [] }) {
  const have = known.filter((f) => facts[f]);
  const built = (push?.needs?.facts || []).length > 0;
  const lines = [];
  const out = { lines, tells: [], named: [], safeFirst: false, readsOdds: false, bandFactor: 1 };
  if (ability === 'persuade') {
    for (const f of have) {
      const fact = facts[f];
      if (!fact.tells && !fact.named) continue;
      out.tells.push(...(fact.tells || []));
      if (fact.named) out.named.push(fact.named);
      lines.push(fact.headStart || fact.label);
    }
  } else if (ability === 'intimidate' && built) {
    out.safeFirst = true; out.readsOdds = true;
    lines.push(`${facts[push.needs.facts[0]]?.headStart || 'You know their weak spot'}: the first push cannot snap`);
  } else if (ability === 'bribe' && built) {
    out.bandFactor = 1.5;
    lines.push(`${facts[push.needs.facts[0]]?.headStart || 'You know what they want'}: the comfort band is 1.5 times as wide`);
  }
  return out;
}

/**
 * The setup for a mini-game: the existing setup function at the roll's tier and your points, then the approach, the facts and the
 * marks. `person` is the sheet, `known` the fact ids, `marks` their marks. Returns { game, setup, opening, head, fit }.
 */
export function pushSetup({ ability, approach, tier = 0, level = 1, points = {}, person, push, known = [], marks = {}, floorShift = 0 }) {
  const lean = person?.lean?.[approach] ?? 0;
  const fit = fitOf(lean);
  const head = headStart({ ability, push, facts: person?.facts, known });
  if (ability === 'persuade') {
    const base = setupPersuade({ tier, points, level });
    const setup = { ...base, patience: Math.max(1, base.patience + (fit === 'misfit' ? -1 : 0)) };
    const opening = { cares: person.cares, dislike: person.dislike, startTrust: fit === 'fits' ? 4 : 0, tells: head.tells, named: head.named };
    return { game: 'persuade', setup, opening, head, fit };
  }
  if (ability === 'intimidate') {
    const base = setupIntimidate({ tier, points, level });
    const shift = fit === 'fits' ? -4 : fit === 'misfit' ? 4 : 0;
    const chances = base.chances.map((c) => (shift < 0 ? Math.max(2, c + shift) : c + shift));
    if (head.safeFirst) chances[0] = 0;
    return { game: 'intimidate', setup: { ...base, chances, readsOdds: base.readsOdds || head.readsOdds }, opening: { shift, safeFirst: head.safeFirst }, head, fit };
  }
  const shift = floorShift + (fit === 'fits' ? -0.15 : fit === 'misfit' ? 0.15 : 0) + (marks.paid ? 0.10 : 0);
  const setup = setupBribe({ tier, points, level, floorShift: Math.round(shift * 100) / 100, bandFactor: head.bandFactor });
  return { game: 'bribe', setup, opening: { floorShift: setup.floorShift, bandFactor: head.bandFactor }, head, fit };
}

/** A finished game's result as a grade: 'great', 'ok', 'no' or 'badno' (plan 1.5). */
export function gradeOf(ability, r = {}) {
  if (ability === 'persuade') return r.success ? ((r.patienceLeft ?? 0) >= 2 ? 'great' : 'ok') : 'no';
  if (ability === 'intimidate') return r.how === 'snapped' || r.outcome === 'snapped' ? 'badno' : r.won >= 15 && r.success ? 'great' : r.success ? 'ok' : 'no';
  return r.grade === 'great' ? 'great' : r.grade === 'ok' ? 'ok' : 'no';
}
export const isWin = (grade) => grade === 'great' || grade === 'ok';

/**
 * What a grade leaves on the world (plan 1.6), as data the talk layer applies:
 * { bond, rep (the boss), mark, endsTalk, closesWant, patience }.
 */
export function aftermath({ ability, approach, grade }) {
  const win = isWin(grade);
  const out = { bond: 0, bossRep: 0, mark: null, patience: win ? 0 : 1, endsTalk: grade === 'badno', closesWant: grade === 'badno' };
  if (approach === 'empathy') out.bond = win ? 1 : 0;
  else if (approach === 'anger') { out.bond = win ? -1 : -2; out.bossRep = win ? 0 : -1; }
  if (win && ability === 'intimidate') out.mark = 'scared';
  if (win && ability === 'bribe') out.mark = 'paid';
  return out;
}

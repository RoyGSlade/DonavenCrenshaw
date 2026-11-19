// The conversation (social lane, plan 1.1 to 1.7), pure. A talk is a small object (patience, topics heard, pushes tried);
// the world is the workbench state (state.people, state.items, state.wants, state.credits, state.rep). Every function takes the
// state and returns a new one; nothing here draws, rolls a die by itself or reads the clock (`now` and `rng` come in).
// People are data (voyage/people/<id>.js); every word spoken comes from a sheet's `lines`.
import { check, checkChance, checkBonusText } from '../character.js';
import { dcOf, dcLine, pushSetup, gradeOf, isWin, aftermath, clampBond, fitOf, dayOf, PAID_DAYS, TALK_PATIENCE, TALK_BOND_CAP, TOPICS_PER_TALK, BOND_NAMES, ABILITY_NAMES, APPROACH_NAMES } from './push.js';
import { ITEMS, wantInfo } from '../people/index.js';
import { characterOf, earnXp } from '../workbench/state.js';
import { tierOf, tierInfo } from '../minigames/setup.js';
import { cleanSkillPoints } from '../minigames/picker.js';

export const MAX_WANTS_SHOWN = 3;
const SOCIAL = { skill: 'social', stat: 'cha', tag: 'talk' };

// ---- what is saved on a person ----------------------------------------------------------------------------------------
/** The saved record for a person (a sheet's starting bond when there is none yet). */
export function personOf(state, sheet) {
  const r = state.people?.[sheet.id] || {};
  return { bond: Number.isInteger(r.bond) ? r.bond : sheet.bond, facts: r.facts || [], marks: r.marks || {}, closed: r.closed || {}, saw: r.saw || [], heard: r.heard || [] };
}
function withPerson(state, sheet, patch) {
  const cur = personOf(state, sheet);
  return { ...state, people: { ...(state.people || {}), [sheet.id]: { ...cur, ...patch } } };
}
const have = (state, item) => state.items?.[item] || 0;
function giveItem(state, item, n = 1) { const max = ITEMS[item]?.max ?? 9; return { ...state, items: { ...(state.items || {}), [item]: Math.min(max, have(state, item) + n) } }; }
function takeItem(state, item, n = 1) { const left = Math.max(0, have(state, item) - n); const items = { ...(state.items || {}) }; if (left) items[item] = left; else delete items[item]; return { ...state, items }; }

// ---- wants -------------------------------------------------------------------------------------------------------------
/** Pin a want to the strip above the answers (once; the newest stays). */
export function pinWant(state, wantId) {
  if (!wantInfo(wantId) || (state.wants || []).includes(wantId)) return state;
  return { ...state, wants: [...(state.wants || []), wantId] };
}
/** The wants shown on the strip: up to 3, not the ones you already hold. */
export function wantsShown(state) {
  return (state.wants || []).filter((id) => { const w = wantInfo(id); return w && !(w.item && have(state, w.item)); }).slice(-MAX_WANTS_SHOWN).map((id) => ({ ...wantInfo(id), id }));
}

/** Is a want closed to this person right now? Closed until the next game day, or until a new fact or a higher bond. */
export function wantClosed(state, sheet, wantId, now) {
  const p = personOf(state, sheet), c = p.closed[wantId];
  if (!c) return false;
  return dayOf(now) < c.untilDay && p.facts.length <= c.facts && p.bond <= c.bond;
}

// ---- days: a borrowed thing goes back by itself ---------------------------------------------------------------------------
/** Apply the day's end: a borrowed thing not returned goes back on its own (bond -1), and a `paid` mark runs out. */
export function tickDay(state, now, sheets) {
  let next = state;
  const day = dayOf(now);
  const said = [];
  for (const sheet of sheets) {
    const p = personOf(next, sheet);
    const marks = { ...p.marks };
    let changed = false, bond = p.bond;
    if (marks.owed && day > marks.owed.dueDay) {
      const o = marks.owed;
      next = takeItem(next, o.item);
      bond = clampBond(bond - 1); delete marks.owed; changed = true;
      said.push(`The ${ITEMS[o.item]?.name.toLowerCase() || 'thing'} went back to ${sheet.name} by itself. Bond -1.`);
    }
    if (marks.paid && day > marks.paid.untilDay) { delete marks.paid; changed = true; }
    if (changed) next = withPerson(next, sheet, { marks, bond });
  }
  return { state: next, said };
}

// ---- a talk ---------------------------------------------------------------------------------------------------------------
/** A fresh talk: 3 patience, nothing heard, nothing pushed. */
export const newTalk = (sheet) => ({ person: sheet.id, patience: TALK_PATIENCE, newTopics: 0, heard: [], failedPushes: [], failed: 0, refused: [], ended: false });

/** The line the person opens with: owed, scared, cold, trusted, or the plain greeting. */
export function greetingOf(state, sheet) {
  const p = personOf(state, sheet);
  for (const g of sheet.greetings || []) {
    const w = g.when || {};
    if (w.mark && !p.marks[w.mark]) continue;
    if (w.bondMax != null && p.bond > w.bondMax) continue;
    if (w.bondMin != null && p.bond < w.bondMin) continue;
    return g.line;
  }
  return sheet.greetings[sheet.greetings.length - 1].line;
}

/** The topics to show: open, heard before, or locked with a hint at what opens them. Scared people close their topics. */
export function topicsOf(state, sheet, talk) {
  const p = personOf(state, sheet);
  return sheet.topics.map((t) => {
    const g = t.gate || {};
    let locked = null;
    if (p.marks.scared) locked = `${sheet.name} will not talk to you right now`;
    else if (g.bond != null && p.bond < g.bond) locked = `get to know ${sheet.name} better`;
    else if (g.fact && !p.facts.includes(g.fact)) locked = `learn something about ${sheet.name} first`;
    else if (g.saw && !p.saw.includes(g.saw)) locked = `look around for what they hide`;
    return { id: t.id, label: t.label, locked, heard: p.heard.includes(t.id), fact: t.fact };
  });
}

/**
 * Ask about a topic. The first time it teaches its fact and lifts the bond 1 (talk alone reaches 3 at most); two new topics per
 * talk, then they say they have work. Returns { state, talk, lines: [line ids], learned, bondDelta, blocked }.
 */
export function askTopic(state, sheet, talk, topicId) {
  const t = sheet.topics.find((x) => x.id === topicId);
  const info = topicsOf(state, sheet, talk).find((x) => x.id === topicId);
  if (!t || !info || info.locked || talk.ended) return { state, talk, lines: [], learned: null, bondDelta: 0, blocked: info?.locked || 'no such topic' };
  const p = personOf(state, sheet);
  if (p.heard.includes(topicId)) return { state, talk, lines: [t.ask, t.say], learned: null, bondDelta: 0, blocked: null };
  if (talk.newTopics >= TOPICS_PER_TALK) return { state, talk, lines: [sheet.workLine], learned: null, bondDelta: 0, blocked: 'work' };
  const bond = p.bond < TALK_BOND_CAP ? p.bond + 1 : p.bond;
  const facts = p.facts.includes(t.fact) ? p.facts : [...p.facts, t.fact];
  return {
    state: withPerson(state, sheet, { bond, facts, heard: [...p.heard, topicId] }),
    talk: { ...talk, newTopics: talk.newTopics + 1, heard: [...talk.heard, topicId] },
    lines: [t.ask, t.say], learned: p.facts.includes(t.fact) ? null : t.fact, bondDelta: bond - p.bond, blocked: null,
  };
}

/** Pressed E on a thing that belongs to them ("see it"): the note, and the topic it opens. */
export function seeThing(state, sheet, thingId) {
  const thing = sheet.sees?.[thingId];
  if (!thing) return { state, note: null };
  const p = personOf(state, sheet);
  const st = p.saw.includes(thingId) ? state : withPerson(state, sheet, { saw: [...p.saw, thingId] });
  return { state: st, note: thing.note };
}

// ---- asking for a want ------------------------------------------------------------------------------------------------------
const lendTo = (state, sheet, wantId, now) => {
  const w = sheet.wants[wantId];
  let next = giveItem(state, w.item);
  const p = personOf(next, sheet);
  next = withPerson(next, sheet, { marks: { ...p.marks, owed: { want: wantId, item: w.item, dueDay: dayOf(now) } } });
  return next;
};
const keepFor = (state, w) => giveItem(state, w.item);

/**
 * Ask for the want (plain speech, no roll). Returns { state, talk, kind, lines, learned }:
 *   'have' you hold it, 'closed' closed for now, 'lent' / 'given' a yes from a bond that is high enough, 'no' a reasoned no.
 */
export function askWant(state, sheet, talk, wantId, now) {
  const w = sheet.wants[wantId];
  if (!w || talk.ended) return { state, talk, kind: 'none', lines: [], learned: null };
  let next = pinWant(state, wantId);
  if (w.item && have(next, w.item)) return { state: next, talk, kind: 'have', lines: [w.have], learned: null };
  if (wantClosed(next, sheet, wantId, now)) return { state: next, talk, kind: 'closed', lines: [w.ask, w.closed], learned: null };
  const p = personOf(next, sheet);
  if (w.give && p.bond >= 5) return { state: keepFor(next, w), talk, kind: 'given', lines: [w.ask, w.trustedLine], learned: null };
  if (w.lend && p.bond >= 4) return { state: lendTo(next, sheet, wantId, now), talk, kind: 'lent', lines: [w.ask, w.trustedLine], learned: null };
  const learned = p.facts.includes(w.noFact) ? null : w.noFact;
  if (learned) next = withPerson(next, sheet, { facts: [...p.facts, w.noFact] });
  return { state: next, talk: { ...talk, refused: talk.refused.includes(wantId) ? talk.refused : [...talk.refused, wantId] }, kind: 'no', lines: [w.ask, w.no], learned };
}

// ---- pushes -------------------------------------------------------------------------------------------------------------------
/** Why a push is not on offer (null when it is). Pushes need what the plan says they need: facts, items, credits. */
function needsMissing(state, sheet, push) {
  const p = personOf(state, sheet);
  for (const f of push.needs?.facts || []) if (!p.facts.includes(f)) return `learn: ${sheet.facts[f]?.label || f}`;
  for (const [item, n] of Object.entries(push.needs?.items || {})) if (have(state, item) < n) return `needs ${n} ${ITEMS[item]?.name || item}`;
  if (push.bribe && !push.bribe.gift && (state.credits || 0) < push.bribe.min + 1) return 'needs credits';
  return null;
}

/** The credits the bribe needle can name: its range, capped by what you hold. */
export const bribeRange = (state, push) => ({ min: push.bribe.min, max: Math.max(push.bribe.min, Math.min(push.bribe.max, push.bribe.gift ? push.bribe.max : state.credits || 0)) });

/**
 * The pushes to offer for a want, after a no: only those whose needs are met (the rest stay out of sight, plan 1.8). Each carries
 * its DC with parts, the odds, the head-start lines and whether this pair was already tried in the talk.
 */
export function pushOptions(state, sheet, talk, wantId, now) {
  const w = sheet.wants[wantId];
  if (!w || !talk.refused.includes(wantId) || talk.ended || wantClosed(state, sheet, wantId, now) || (w.item && have(state, w.item))) return [];
  const p = personOf(state, sheet);
  const ch = characterOf(state);
  return w.pushes.filter((push) => !needsMissing(state, sheet, push)).map((push) => {
    const lean = sheet.lean[push.approach] ?? 0;
    const d = dcOf({ resist: w.resist, lean, bond: p.bond, failed: talk.failed, marks: p.marks, ability: push.ability, approach: push.approach });
    const spec = { ...SOCIAL, dc: d.dc };
    const head = pushSetup({ ability: push.ability, approach: push.approach, person: sheet, push, known: p.facts, marks: p.marks }).head;
    return {
      id: push.id, ability: push.ability, approach: push.approach, say: push.say, push,
      dc: d.dc, parts: d.parts, dcLine: dcLine(d), chance: Math.round(100 * checkChance(ch, spec)), rollText: checkBonusText(ch, spec),
      fit: fitOf(lean), head: head.lines, tried: talk.failedPushes.includes(push.id),
    };
  });
}

/** One pushed attempt's d20: the real roll with the test captain's real Social level, and the game set up at its tier. */
export function attemptPush(state, sheet, talk, wantId, pushId, now, rng = Math.random) {
  const opt = pushOptions(state, sheet, talk, wantId, now).find((o) => o.id === pushId);
  if (!opt || opt.tried) return null;
  const attempt = check(characterOf(state), { ...SOCIAL, dc: opt.dc }, rng);
  const tier = tierOf(attempt);
  const level = state.progress.levels.social;
  const points = cleanSkillPoints('social', state.progress.points.social, level);
  const p = personOf(state, sheet);
  const setup = pushSetup({ ability: opt.ability, approach: opt.approach, tier, level, points, person: sheet, push: opt.push, known: p.facts, marks: p.marks });
  return { opt, attempt, tier, label: tierInfo(tier).label, level, points, ...setup };
}

/**
 * Settle a finished game. `result` is what the game resolved with. Applies, in order: the bond and the boss's report, the mark,
 * what was paid, the item (kept, or borrowed until the day ends), the XP, and the talk's patience. Returns
 * { state, talk, grade, give: 'keep'|'lend'|null, lines: [the reply lines], notes: [plain sentences], xp }.
 */
export function settlePush(state, sheet, talk, wantId, pushId, result, now) {
  const w = sheet.wants[wantId];
  const push = w.pushes.find((x) => x.id === pushId);
  const grade = gradeOf(push.ability, result);
  const win = isWin(grade);
  const after = aftermath({ ability: push.ability, approach: push.approach, grade });
  const notes = [];
  let next = state;
  const p0 = personOf(next, sheet);

  // 1 bond and the boss's report
  let bond = clampBond(p0.bond + after.bond);
  if (after.bond) notes.push(`${sheet.name}'s bond ${after.bond > 0 ? 'up' : 'down'} ${Math.abs(after.bond)}: ${BOND_NAMES[bond]}.`);
  if (after.bossRep && sheet.boss) {
    next = { ...next, rep: { ...(next.rep || {}), [sheet.boss]: ((next.rep || {})[sheet.boss] || 0) + after.bossRep } };
    notes.push(`${sheet.name} tells ${sheet.boss[0].toUpperCase()}${sheet.boss.slice(1)}: rep with ${sheet.boss[0].toUpperCase()}${sheet.boss.slice(1)} ${after.bossRep}.`);
  }
  // 2 the mark
  const marks = { ...p0.marks };
  if (after.mark === 'scared') { marks.scared = { bondWas: p0.bond }; notes.push(`${sheet.name} is scared of you. Topics closed until the bond is back to ${p0.bond}.`); }
  if (after.mark === 'paid') { marks.paid = { untilDay: dayOf(now) + PAID_DAYS }; notes.push(`${sheet.name} has been paid: their floor is 10% higher for ${PAID_DAYS} game days.`); }
  // 3 what was paid (a bribe deal only)
  let paid = 0;
  if (push.ability === 'bribe' && win) {
    const gift = push.bribe?.gift;
    if (gift) for (const [item, n] of Object.entries(gift)) { next = takeItem(next, item, n); notes.push(`You gave ${n} ${ITEMS[item]?.name || item}.`); }
    paid = result.paid || 0;
    if (paid) { next = { ...next, credits: Math.max(0, (next.credits || 0) - paid) }; notes.push(`You paid ${paid} credits.`); }
  }
  // 4 the person record (with scared recovery: the mark lifts when the bond is back where it was)
  if (marks.scared && !after.mark && bond >= marks.scared.bondWas) delete marks.scared;
  next = withPerson(next, sheet, { bond, marks });
  // 5 the item
  let give = null;
  if (win) {
    give = push.gives?.[grade] || 'keep';
    next = give === 'lend' ? lendTo(next, sheet, wantId, now) : keepFor(next, w);
    notes.push(give === 'lend' ? `You borrowed the ${ITEMS[w.item]?.name.toLowerCase()} until the game day ends.` : `You have the ${ITEMS[w.item]?.name.toLowerCase()}.`);
  }
  // 6 XP (the game's own)
  const xp = earnXp(next, 'social', result.xp);
  next = xp.state;
  if (xp.xp) notes.push(`+${xp.xp} Social XP.`);
  if (xp.gained) notes.push(`Social is now level ${next.progress.levels.social}.`);
  // 7 the talk: a no costs patience and closes that pair; a bad no or no patience ends the talk and closes the want
  const nt = { ...talk, failedPushes: win ? talk.failedPushes : [...talk.failedPushes, pushId], failed: talk.failed + (win ? 0 : 1), patience: Math.max(0, talk.patience - after.patience) };
  if (!win && (after.endsTalk || nt.patience <= 0)) {
    nt.ended = true;
    const pe = personOf(next, sheet);
    next = withPerson(next, sheet, { closed: { ...pe.closed, [wantId]: { untilDay: dayOf(now) + 1, bond: pe.bond, facts: pe.facts.length } } });
    notes.push(`${sheet.name} has had enough. The ${w.label.replace(/^the /, '')} is closed until tomorrow, or until you learn something new about them.`);
  }
  const lines = win ? [push.won, ...(give === 'lend' ? [w.lendLine] : [])] : [push.lost];
  return { state: next, talk: nt, grade, give, lines, notes, xp: xp.xp, win };
}

/** Give a borrowed thing back before the day ends. */
export function returnBorrowed(state, sheet, wantId) {
  const p = personOf(state, sheet);
  const o = p.marks.owed;
  if (!o || o.want !== wantId) return { state, ok: false };
  const marks = { ...p.marks }; delete marks.owed;
  return { state: withPerson(takeItem(state, o.item), sheet, { marks }), ok: true };
}

export { ABILITY_NAMES, APPROACH_NAMES };

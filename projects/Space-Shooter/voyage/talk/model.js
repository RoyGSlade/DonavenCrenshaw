// What the conversation panel shows, worked out from the state (pure, so it can be tested and the view only draws it).
// `ui` is the small amount of screen state: the line on show, the last notes, which ability and push are picked.
import * as C from './convo.js';
import { BOND_NAMES, ABILITY_NAMES, APPROACH_NAMES } from './push.js';
import { ITEMS } from '../people/index.js';
import { ABILITIES, APPROACHES } from '../people/check.js';

/** Split a line's words into plain and lit parts. A phrase lights the first time it appears (case-insensitive). */
export function litParts(text, lits = []) {
  const found = [];
  for (const l of lits) {
    const i = text.toLowerCase().indexOf(l.phrase.toLowerCase());
    if (i >= 0 && !found.some((f) => i < f.end && i + l.phrase.length > f.start)) found.push({ ...l, start: i, end: i + l.phrase.length });
  }
  found.sort((a, b) => a.start - b.start);
  const parts = []; let at = 0;
  for (const f of found) { if (f.start > at) parts.push({ text: text.slice(at, f.start) }); parts.push({ text: text.slice(f.start, f.end), lit: { kind: f.kind, id: f.id } }); at = f.end; }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** The lit words a person's line can carry: each want's phrase raises the want, each topic's phrase raises the topic. */
export function litsOf(sheet) {
  return [
    ...Object.entries(sheet.wants || {}).filter(([, w]) => w.lit).map(([id, w]) => ({ phrase: w.lit, kind: 'want', id })),
    ...(sheet.topics || []).filter((t) => t.lit).map((t) => ({ phrase: t.lit, kind: 'topic', id: t.id })),
  ];
}

/** A line object ready to show: who says it, the words (with lit parts for the person's lines), the emotion and its voice id. */
export function lineView(sheet, id) {
  const l = sheet.lines[id];
  const mine = l.who === sheet.speaker;
  return { id, who: l.who, name: mine ? sheet.name : 'You', text: l.text, emotion: l.emotion, voice: id, parts: litParts(l.text, mine ? litsOf(sheet) : []) };
}

/** The whole panel: header, lines on show, wants strip, answers and the push picker. */
export function talkModel(state, sheet, talk, ui, now) {
  const p = C.personOf(state, sheet);
  const wants = C.wantsShown(state);
  const mine = wants.filter((w) => w.person === sheet.id);
  let lines = (ui.lines || []).map((id) => lineView(sheet, id));
  const ask = mine.map((w) => {
    const sw = sheet.wants[w.id];
    const closed = C.wantClosed(state, sheet, w.id, now);
    const owed = p.marks.owed?.want === w.id;
    return { want: w.id, label: w.label, say: sheet.lines[sw.ask].text, state: closed ? 'closed' : 'open', note: closed ? 'Closed until tomorrow, or until you learn something new about them.' : null, owed };
  });
  // Until a want is pinned the greeting stays on show: its amber words are how you raise the want.
  const holding = Object.values(sheet.wants || {}).some((w) => w.item && state.items?.[w.item]);
  if (!ask.length && !holding && ui.greeting && !(ui.lines || []).includes(ui.greeting) && litsOf(sheet).some((l) => l.kind === 'want' && lineView(sheet, ui.greeting).parts.some((x) => x.lit?.id === l.id))) lines = [{ ...lineView(sheet, ui.greeting), earlier: true }, ...lines];
  // the borrowed thing you can give back
  const owed = p.marks.owed && sheet.wants[p.marks.owed.want] ? { want: p.marks.owed.want, label: sheet.wants[p.marks.owed.want].label } : null;
  const topics = C.topicsOf(state, sheet, talk).map((t) => ({ ...t, hint: t.locked ? `??? ${t.locked}` : null }));
  // pushes: only after a no, for the want you refused
  let push = null;
  const refusedWant = talk.refused.find((w) => C.pushOptions(state, sheet, talk, w, now).length);
  if (refusedWant) {
    const options = C.pushOptions(state, sheet, talk, refusedWant, now);
    const abilities = ABILITIES.map((a) => ({ id: a, name: ABILITY_NAMES[a], available: options.some((o) => o.ability === a), tried: options.filter((o) => o.ability === a).every((o) => o.tried) }));
    const abilityPicked = options.some((o) => o.ability === ui.ability) ? ui.ability : null;
    const approaches = abilityPicked ? APPROACHES.map((ap) => { const o = options.find((x) => x.ability === abilityPicked && x.approach === ap); return { id: ap, name: APPROACH_NAMES[ap], available: Boolean(o), tried: Boolean(o?.tried), optionId: o?.id }; }) : [];
    const selected = abilityPicked && options.find((o) => o.id === ui.push && o.ability === abilityPicked) || null;
    push = { want: refusedWant, abilities, ability: abilityPicked, approaches, selected, patience: talk.patience, count: options.length };
    if (selected) {
      const push2 = selected.push;
      push.cost = push2.bribe ? { gift: Object.entries(push2.bribe.gift || {}).map(([i, n]) => `${n} ${ITEMS[i]?.name.toLowerCase() || i}`), credits: C.bribeRange(state, push2) } : null;
      push.sayText = sheet.lines[selected.say].text;
    }
  }
  const marks = [];
  if (p.marks.scared) marks.push('Scared of you');
  if (p.marks.paid) marks.push('Paid');
  if (p.marks.owed) marks.push('You owe them');
  return {
    sheet: { id: sheet.id, name: sheet.name, speaker: sheet.speaker }, bond: { n: p.bond, name: BOND_NAMES[p.bond] }, marks,
    lines, wants: wants.map((w) => ({ id: w.id, label: w.label })), ask, owed, topics, push,
    notes: ui.notes || [], learned: (ui.learned || []).map((f) => sheet.facts[f]?.label || f), ended: talk.ended, patience: talk.patience, credits: state.credits,
    items: Object.entries(state.items || {}).map(([id, n]) => `${n} ${ITEMS[id]?.name.toLowerCase() || id}`),
  };
}

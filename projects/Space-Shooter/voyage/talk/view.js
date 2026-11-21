// The conversation panel on screen (social lane, plan 1.8): one stack at both sizes. The person's line with amber words, the
// "You want" strip, then answers in groups: Ask, Ask about (topics, locked ones as "???"), and Push (only after a no): ability
// row, approach row, then your line in quotes with the roll, its DC in plain words, the head start, and one button, Say it.
// Plain DOM drawn from talk/model.js; nothing here keeps state. 44px targets, no sideways scroll.
import { castPortrait } from '../ui/assets.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); }
  el.append(...kids.filter((x) => x != null && x !== false));
  return el;
};
const btn = (text, onClick, attrs = {}) => { const b = h('button', { type: 'button', ...attrs, text }); if (onClick) b.addEventListener('click', onClick); return b; };

/**
 * Draw the panel into `root` (replaces its children). `m` from talkModel(). `on`: { word(lit), want(id), topic(id), push(id), say(),
 * giveBack(wantId), leave() }. `debug` shows the voice line ids (dev only). The root wears the game's dialogue kit classes.
 */
export function renderTalk(root, m, on, { debug = false } = {}) {
  const last = m.lines.filter((l) => l.who !== 'you').slice(-1)[0];
  const url = castPortrait(m.sheet.speaker, last?.emotion || 'neutral');
  const portrait = h('div', { class: 'ui-dlg-portrait', 'aria-hidden': 'true' }, url ? h('img', { src: url, alt: '' }) : h('span', { text: m.sheet.name.slice(0, 1) }));
  const pips = h('div', { class: 'tk-pips', 'data-bond': m.bond.n, role: 'img', 'aria-label': `Bond ${m.bond.n} of 5, ${m.bond.name}`, title: `Bond: ${m.bond.name}` }, ...[1, 2, 3, 4, 5].map((i) => h('i', { class: i <= m.bond.n ? 'on' : '' })));
  const side = h('div', { class: 'tk-side' }, portrait, pips, h('small', { class: 'tk-bondname', text: m.bond.name }));

  const head = h('div', { class: 'tk-head' }, h('p', { class: 'ui-dlg-name', text: m.sheet.name }), m.marks.length ? h('span', { class: 'tk-marks', text: m.marks.join(' \u00b7 ') }) : null,
    btn('Leave', on.leave, { class: 'ui-btn tk-leave', 'aria-label': `Leave the talk with ${m.sheet.name}` }));

  const lines = h('div', { class: 'tk-lines', 'aria-live': 'polite' }, ...m.lines.map((l) => {
    const words = h('p', { class: 'ui-dlg-text tk-text' }, ...l.parts.map((p) => (p.lit
      ? btn(p.text, () => on.word(p.lit), { class: `tk-lit is-${p.lit.kind}`, 'data-lit': p.lit.kind, 'data-id': p.lit.id, 'aria-label': `${p.lit.kind === 'want' ? 'You want' : 'Ask about'}: ${p.text}` })
      : document.createTextNode(p.text))));
    return h('div', { class: `tk-line ${l.who === 'you' ? 'is-you' : 'is-them'}${l.earlier ? ' is-earlier' : ''}`, 'data-line': l.id, 'data-emotion': l.emotion },
      l.who === 'you' ? h('b', { class: 'tk-speaker', text: 'You' }) : null, words, debug ? h('small', { class: 'tk-voice', text: `voice: ${l.voice}` }) : null);
  }));

  const learned = m.learned.length ? h('ul', { class: 'tk-learned', 'aria-label': 'What you learned' }, ...m.learned.map((f) => h('li', { text: `You learned: ${f}` }))) : null;
  const notes = m.notes.length ? h('ul', { class: 'tk-notes', 'aria-label': 'What changed' }, ...m.notes.map((n) => h('li', { text: n }))) : null;
  const wants = h('div', { class: 'tk-want', role: 'status' }, h('b', { text: 'You want' }),
    ...(m.wants.length ? m.wants.map((w) => h('span', { class: 'tk-chip', 'data-want': w.id, text: w.label })) : [h('span', { class: 'tk-none', text: 'Nothing yet. Listen for amber words.' })]));

  // a dialogue choice: what your character says, then a small tag
  const choice = (say, tag, onClick, attrs = {}) => {
    const b = h('button', { type: 'button', class: `ui-btn ui-dlg-choice tk-choice${attrs.on ? ' is-on' : ''}${attrs.locked ? ' is-locked' : ''}`, ...(attrs.data || {}), 'aria-pressed': attrs.on != null ? String(Boolean(attrs.on)) : null, disabled: attrs.disabled || attrs.locked }, h('span', { class: 'tk-said', text: say }), h('small', { class: 'ui-dlg-odds tk-tag', text: tag }));
    if (onClick && !attrs.locked) b.addEventListener('click', onClick);
    return b;
  };
  const choices = [];
  if (!m.ended) {
    for (const a of m.ask) choices.push(choice(`\u201c${a.say}\u201d`, a.state === 'closed' ? 'Closed until tomorrow, or until you learn something new' : `Ask for ${a.label} \u00b7 no roll`, () => on.want(a.want), { disabled: a.state === 'closed', data: { 'data-want': a.want, 'data-kind': 'ask' } }));
    if (m.owed) choices.push(choice(`Here, your ${m.owed.label.replace(/^the /, '')}. Back before the day ends.`, 'Give it back', () => on.giveBack(m.owed.want), { data: { 'data-give-back': m.owed.want } }));
    for (const t of m.topics) choices.push(t.locked
      ? choice(t.hint, 'Not yet', null, { locked: true, data: { 'data-topic': t.id, 'data-kind': 'topic' } })
      : choice(`\u201c${t.label}\u201d`, t.heard ? 'Ask about \u00b7 heard' : 'Ask about', () => on.topic(t.id), { data: { 'data-topic': t.id, 'data-kind': 'topic' } }));
    if (m.push) {
      for (const c of m.push.choices) choices.push(choice(`\u201c${c.say}\u201d`, c.tried ? `${c.tag} \u00b7 tried, closed this talk` : c.tag, () => on.push(c.id), { on: c.on, disabled: c.tried, data: { 'data-push': c.id, 'data-kind': 'push' } }));
      for (const l of m.push.locked) choices.push(choice(l.hint, 'Push \u00b7 not yet', null, { locked: true, data: { 'data-push-locked': l.id, 'data-kind': 'push' } }));
    }
  }
  const list = h('div', { class: 'ui-dlg-choices tk-choices', role: 'group', 'aria-label': 'What you say' }, ...choices);
  const px = m.push?.selected;
  const card = px ? h('div', { class: 'tk-preview', 'data-push': px.id },
    h('p', { class: 'tk-roll' }, h('b', { text: `Roll ${px.rollText} vs ${px.dc}: ${px.chance}%` })),
    h('p', { class: 'tk-dc', text: `DC: ${px.dcLine}` }),
    ...px.head.map((l) => h('p', { class: 'tk-head-start', text: l })),
    m.push.cost ? h('p', { class: 'tk-cost', text: `It costs: ${[...m.push.cost.gift, `${m.push.cost.credits.min} to ${m.push.cost.credits.max} credits at the needle`].join(' and ')}.` }) : null,
    h('p', { class: 'tk-note', text: `${m.push.patience} of 3 patience left in this talk. A no costs one.` }),
    btn('Say it', on.say, { class: 'ui-btn primary tk-say-it' })) : null;
  const end = m.ended ? h('p', { class: 'tk-note tk-ended', text: `${m.sheet.name} has nothing more to say right now.` }) : null;
  const bag = h('p', { class: 'tk-bag', text: `You carry: ${[`${m.credits} credits`, ...m.items].join(', ')}` });
  const body = h('div', { class: 'ui-dlg-body tk-body' }, head, lines, learned, notes, wants, list, card, end, bag);
  root.replaceChildren(side, body);
}

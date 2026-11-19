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
 * Draw the panel into `root` (replaces its children). `m` from talkModel(). `on`: { word(lit), want(id), topic(id), ability(id), approach(optionId),
 * say(), giveBack(wantId), leave() }.
 */
export function renderTalk(root, m, on) {
  const url = castPortrait(m.sheet.speaker, m.lines.filter((l) => l.who !== 'you').slice(-1)[0]?.emotion || 'neutral');
  const portrait = h('div', { class: 'tk-portrait', 'aria-hidden': 'true' }, url ? h('img', { src: url, alt: '' }) : h('span', { text: m.sheet.name.slice(0, 1) }));
  const head = h('header', { class: 'tk-head' }, portrait,
    h('div', { class: 'tk-who' }, h('b', { class: 'tk-name', text: m.sheet.name }), h('span', { class: 'tk-bond', 'data-bond': m.bond.n, text: `Bond ${m.bond.n} of 5 · ${m.bond.name}` }),
      m.marks.length ? h('span', { class: 'tk-marks', text: m.marks.join(' · ') }) : null),
    btn('Leave', on.leave, { class: 'tk-leave', 'aria-label': `Leave the talk with ${m.sheet.name}` }));

  // the lines on show: yours quoted, theirs with amber words
  const lines = h('div', { class: 'tk-lines', 'aria-live': 'polite' }, ...m.lines.map((l) => {
    const words = h('p', { class: 'tk-text' }, ...l.parts.map((p) => (p.lit
      ? btn(p.text, () => on.word(p.lit), { class: `tk-lit is-${p.lit.kind}`, 'data-lit': p.lit.kind, 'data-id': p.lit.id, 'aria-label': `${p.lit.kind === 'want' ? 'You want' : 'Ask about'}: ${p.text}` })
      : document.createTextNode(p.text))));
    return h('div', { class: `tk-line ${l.who === 'you' ? 'is-you' : 'is-them'}${l.earlier ? ' is-earlier' : ''}`, 'data-line': l.id, 'data-emotion': l.emotion }, h('b', { class: 'tk-speaker', text: l.name }), words, h('small', { class: 'tk-voice', text: `voice: ${l.voice}` }));
  }));

  const learned = m.learned.length ? h('ul', { class: 'tk-learned', 'aria-label': 'What you learned' }, ...m.learned.map((f) => h('li', { text: `You learned: ${f}` }))) : null;
  const notes = m.notes.length ? h('ul', { class: 'tk-notes', 'aria-label': 'What changed' }, ...m.notes.map((n) => h('li', { text: n }))) : null;

  const wants = h('div', { class: 'tk-want', role: 'status' }, h('b', { text: 'You want' }),
    ...(m.wants.length ? m.wants.map((w) => h('span', { class: 'tk-chip', 'data-want': w.id, text: w.label })) : [h('span', { class: 'tk-none', text: 'Nothing yet. Listen for amber words.' })]));

  const groups = [];
  if (!m.ended) {
    if (m.ask.length) groups.push(h('div', { class: 'tk-group tk-ask' }, h('h3', { text: 'Ask' }), ...m.ask.map((a) => btn(`Ask for ${a.label}`, () => on.want(a.want), { class: 'tk-btn primary', 'data-want': a.want, disabled: a.state === 'closed', title: a.note || '' }, ), ...m.ask.filter((a) => a.state !== 'closed').map((a) => h('p', { class: 'tk-quote', text: `"${a.say}"` })), ...m.ask.filter((a) => a.note).map((a) => h('p', { class: 'tk-note', text: a.note })))));
    if (m.owed) groups.push(h('div', { class: 'tk-group' }, btn(`Give back ${m.owed.label}`, () => on.giveBack(m.owed.want), { class: 'tk-btn', 'data-give-back': m.owed.want })));
    groups.push(h('div', { class: 'tk-group tk-topics' }, h('h3', { text: `Ask about` }), ...m.topics.map((t) => (t.locked
      ? h('button', { type: 'button', class: 'tk-btn is-locked', disabled: true, 'data-topic': t.id, text: t.hint })
      : btn(t.label + (t.heard ? ' (heard)' : ''), () => on.topic(t.id), { class: 'tk-btn', 'data-topic': t.id })))));
    if (m.push) {
      const px = m.push;
      const abil = h('div', { class: 'tk-row tk-abilities', role: 'group', 'aria-label': 'How you push' }, ...px.abilities.filter((a) => a.available).map((a) => btn(a.name, () => on.ability(a.id), { class: `tk-btn${a.id === px.ability ? ' is-on' : ''}`, 'data-ability': a.id, 'aria-pressed': a.id === px.ability ? 'true' : 'false', disabled: a.tried })));
      const appr = px.ability ? h('div', { class: 'tk-row tk-approaches', role: 'group', 'aria-label': 'With what' }, ...px.approaches.filter((a) => a.available).map((a) => btn(a.name, () => on.approach(a.optionId), { class: `tk-btn${px.selected && px.selected.approach === a.id ? ' is-on' : ''}`, 'data-approach': a.id, 'aria-pressed': px.selected && px.selected.approach === a.id ? 'true' : 'false', disabled: a.tried, title: a.tried ? 'Tried this talk: closed' : '' }))) : null;
      const card = px.selected ? h('div', { class: 'tk-preview', 'data-push': px.selected.id },
        h('p', { class: 'tk-say', text: `"${px.sayText}"` }),
        h('p', { class: 'tk-roll' }, h('b', { text: `Roll ${px.selected.rollText} vs ${px.selected.dc}: ${px.selected.chance}%` })),
        h('p', { class: 'tk-dc', text: `DC: ${px.selected.dcLine}` }),
        ...px.selected.head.map((l) => h('p', { class: 'tk-head-start', text: l })),
        px.cost ? h('p', { class: 'tk-cost', text: `It costs: ${[...px.cost.gift, `${px.cost.credits.min} to ${px.cost.credits.max} credits at the needle`].join(' and ')}.` }) : null,
        btn('Say it', on.say, { class: 'tk-btn primary tk-say-it' })) : null;
      groups.push(h('div', { class: 'tk-group tk-push' }, h('h3', { text: 'Push' }), h('p', { class: 'tk-note', text: `${px.patience} of 3 patience left in this talk. A no costs one.` }), abil, appr, card));
    }
  } else groups.push(h('p', { class: 'tk-note tk-ended', text: `${m.sheet.name} has nothing more to say right now.` }));

  const bag = h('p', { class: 'tk-bag', text: `You carry: ${[`${m.credits} credits`, ...m.items].join(', ')}` });
  root.replaceChildren(...[head, lines, learned, notes, wants, ...groups, bag].filter(Boolean));
}

// Read the room on screen: what you notice (the tells), a trust bar, their patience, and a hand
// of argument cards. Tap a card to play it. A played card shows what it did: landed +n, a miss,
// or hurt. DOM only, no art. Resolves with the rules' result { success, trust, goal, xp, ... }.
import { play, tellLines, VALUE_NAMES } from './persuade.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const WORDS = { won: 'THEY AGREE', lost: 'THEY SAY NO' };

export function playPersuade(root, { state, who = 'The dockmaster', what = 'let you through', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state;
  const lines = tellLines(s);
  const notice = h('ul', { class: 'pc-tells', 'aria-label': 'What you notice' },
    ...(lines.length ? lines.map((t) => h('li', { text: t })) : [h('li', { class: 'is-none', text: 'They give nothing away. You will have to guess.' })]));
  const trustBar = h('div', { class: 'nv-bar is-time pc-trust' }, h('span', { text: 'Trust' }), h('i', {}, h('u')), h('b', { text: '' }));
  const pips = h('div', { class: 'hg-pips', 'aria-label': 'Their patience' });
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `You want ${who.replace(/^The /, 'the ')} to ${what}. Pick the argument they care about.` });
  const cards = s.hand.map((c) => {
    const b = h('button', { type: 'button', class: `pc-card ui-card${c.named ? ' is-named' : ''}`, 'data-id': c.id, 'data-value': c.value }, h('b', { text: VALUE_NAMES[c.value] }), h('span', { text: c.text }), c.named ? h('em', { class: 'pc-named', text: 'You know this about them' }) : null, h('small', { text: '' }));
    b.addEventListener('click', () => doPlay(c.id));
    return b;
  });
  const hand = h('div', { class: 'pc-hand', role: 'group', 'aria-label': 'Your arguments' }, ...cards);
  const panel = h('section', { class: 'rp-panel pc-panel mg-skin ui-panel', role: 'group', 'aria-label': `Persuade ${who}` },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `PERSUADE · ${who.toUpperCase()}` }), h('p', { class: 'pc-lead', text: 'What you notice' }), notice, trustBar, pips, hand, status,
    h('p', { class: 'rp-help', text: 'A card on something they care about lands, and landing cards in a row builds more trust. A miss costs patience; something they dislike costs two.' }));
  panel.__state = s;
  root.append(panel);
  let finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function paint() {
    trustBar.querySelector('u').style.width = `${Math.min(100, (100 * s.trust) / s.goal)}%`;
    trustBar.querySelector('b').textContent = `${s.trust} of ${s.goal}`;
    pips.replaceChildren(...Array.from({ length: s.patienceMax }, (_, i) => h('span', { class: i < s.patience ? 'on' : '' })));
    s.hand.forEach((c, i) => {
      const b = cards[i], done = s.played.includes(c.id);
      b.disabled = done || s.done;
      const ev = done && s.log?.[c.id];
      b.classList.toggle('is-played', done);
      b.classList.toggle('is-landed', ev?.type === 'landed'); b.classList.toggle('is-miss', ev?.type === 'miss'); b.classList.toggle('is-hurt', ev?.type === 'hurt');
      b.querySelector('small').textContent = ev ? (ev.type === 'landed' ? `Landed +${ev.gain}` : ev.type === 'hurt' ? 'They hate that: -2 patience' : 'They shrug: -1 patience') : '';
    });
  }
  s.log = {};
  function doPlay(id) {
    if (s.done) return;
    const r = play(s, id);
    if (!r) { sound('hurt'); return; }
    const ev = s.events[0];
    s.log[id] = ev;
    status.textContent = r === 'landed' ? `That landed: +${ev.gain} trust${s.streak > 1 ? ` (a streak of ${s.streak - 1} adds ${Math.min(3, s.streak - 1)})` : ''}.` : r === 'hurt' ? 'Wrong nerve. They go cold.' : 'They are not moved by that.';
    sound(r === 'landed' ? 'power' : 'hurt');
    paint(); if (s.done) end();
  }
  function end() {
    paint();
    const r = s.result;
    status.textContent = r.success ? `${who} agrees to ${what}.` : r.how === 'out' ? 'You ran out of things to say.' : `${who} has heard enough.`;
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.outcome },
      h('b', { class: 'rp-stars', text: WORDS[r.outcome] }),
      h('span', { text: `${r.trust} of ${r.goal} trust · ${r.cardsPlayed} card${r.cardsPlayed === 1 ? '' : 's'} played${r.xp ? ` · +${r.xp} Social XP` : ' · No XP'}` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  return promise;
}

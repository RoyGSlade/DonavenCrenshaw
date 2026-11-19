// Push your luck on screen: a ladder of six steps (what you would have, and the risk of a snap on
// the push that gets you there), what you have now, their mood, your saves, and two big buttons:
// Push and Stand. DOM only, no art. Resolves with the rules' result { success, won, stars, xp, ... }.
import { push, stand, nextChance, mood, starsOf } from './intimidate.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const WORDS = { won: 'THEY GIVE IN', snapped: 'THEY SNAPPED', short: 'NOT ENOUGH' };

export function playIntimidate(root, { state, who = 'The loan clerk', what = 'drop the fee', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state;
  const rungs = s.wins.map((w, i) => h('li', { class: 'it-rung', 'data-step': i + 1 }, h('b', { text: String(w) }), h('span', { text: '' }), h('small', { text: '' })));
  const ladder = h('ol', { class: 'it-ladder', 'aria-label': 'Steps' }, ...rungs.slice().reverse());
  const moodEl = h('p', { class: 'it-mood', 'aria-live': 'polite', text: '' });
  const have = h('p', { class: 'it-have', text: '' });
  const pips = h('div', { class: 'hg-pips it-saves', 'aria-label': 'Saves' });
  const pushBtn = h('button', { type: 'button', class: 'primary it-push ui-btn', text: 'Push' });
  const standBtn = h('button', { type: 'button', class: 'it-stand ui-btn', text: 'Stand' });
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `You want ${who.replace(/^The /, 'the ')} to ${what}. You need ${s.goal} to win. Push for more, or Stand and take it.` });
  const panel = h('section', { class: 'rp-panel it-panel mg-skin ui-panel', role: 'group', 'aria-label': `Intimidate ${who}` },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `INTIMIDATE · ${who.toUpperCase()}` }), have, moodEl, pips, h('div', { class: 'it-row' }, pushBtn, standBtn), status, ladder,
    h('p', { class: 'rp-help', text: `${s.readsOdds ? 'You can read the exact risk.' : 'You cannot read them well: the risk is only a word.'} A snap loses everything${s.saves ? '; a save shrugs one snap off' : ''}. Stars at ${s.stars.join(', ')}.` }));
  panel.__state = s;
  root.append(panel);
  let finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function paint() {
    rungs.forEach((li, i) => {
      const ch = s.chances[i], reached = i < s.pushes, next = !s.done && i === s.pushes;
      li.classList.toggle('is-reached', reached); li.classList.toggle('is-next', next);
      li.classList.toggle('is-goal', s.wins[i] >= s.goal && (i === 0 || s.wins[i - 1] < s.goal));
      li.querySelector('span').textContent = reached ? 'done' : s.readsOdds ? `${ch}% they snap` : mood(ch);
      li.querySelector('small').textContent = s.wins[i] >= s.goal ? `★${starsOf(s, s.wins[i])}` : '';
    });
    const c = nextChance(s);
    have.textContent = `You have ${s.won} of the ${s.goal} you need${s.won >= s.goal ? ': enough' : ''}`;
    moodEl.textContent = s.done ? '' : c == null ? '' : `They look ${mood(c)}${s.readsOdds ? `: about ${c} in 100 they snap on the next push` : ''}.`;
    pips.replaceChildren(...Array.from({ length: s.saves }, (_, i) => h('span', { class: i < s.savesLeft ? 'on' : '' })));
    pips.hidden = !s.saves;
    pushBtn.disabled = s.done; standBtn.disabled = s.done;
    standBtn.textContent = `Stand at ${s.won}`;
  }
  function doPush() {
    if (s.done) return;
    const r = push(s);
    if (!r) return;
    status.textContent = r === 'rose' ? `They give ground: you have ${s.won}.` : r === 'saved' ? 'They flinch and hold. Your nerve saved that one.' : 'They snap.';
    sound(r === 'snapped' ? 'hurt' : 'power');
    paint(); if (s.done) end();
  }
  function doStand() { if (s.done) return; stand(s); paint(); end(); }
  pushBtn.addEventListener('click', doPush); standBtn.addEventListener('click', doStand);
  const kd = (e) => { if (s.done) return; if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); if (!e.repeat) doPush(); } else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (!e.repeat) doStand(); } };
  addEventListener('keydown', kd);
  function end() {
    removeEventListener('keydown', kd); paint();
    const r = s.result;
    status.textContent = r.outcome === 'won' ? `${who} agrees to ${what}.` : r.outcome === 'snapped' ? `${who} loses their temper. You get nothing.` : `You stood at ${r.won}, short of ${r.goal}. They hold firm.`;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: r.success ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ui-card ${r.success ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.outcome },
      h('b', { class: 'rp-stars', text: r.success ? stars : WORDS[r.outcome] }),
      h('span', { text: `${r.won} of ${r.goal} · ${r.pushes} push${r.pushes === 1 ? '' : 'es'}${r.savesUsed ? ` · ${r.savesUsed} save${r.savesUsed === 1 ? '' : 's'} used` : ''}${r.xp ? ` · +${r.xp} Social XP` : ' · No XP'}` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  return promise;
}

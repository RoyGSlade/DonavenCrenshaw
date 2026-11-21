// The bribe on screen: the haggle's gauge turned round. A needle sweeps the credits you would offer; their floor is hidden and only a
// lit comfort band just above it shows. Offer inside the band for a Great deal; over it you overpay; under it they hold and their ask
// comes down a quarter of the way. DOM only. Resolves with the rules' result { price, paid, grade, how, xp, success }.
import { offer, takeAsk, stepBribe, needleAt, priceAt, bandPrices } from './bribe.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const WORDS = { great: 'A GREAT DEAL', ok: 'YOU OVERPAID', walked: 'THEY WALKED' };

export function playBribe(root, { state, who = 'Pip', what = 'what you want', gift = null, sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state;
  const range = s.max - s.min;
  const pos = (price) => `${(100 * (price - s.min)) / range}%`;
  const [lo, hi] = bandPrices(s);
  const needle = h('i', { class: 'hg-needle', 'aria-hidden': 'true' });
  const priceTag = h('b', { class: 'hg-price', text: '' });
  const askMark = h('u', { class: 'hg-offer', 'aria-hidden': 'true' }, h('span', { text: 'ask' }));
  const band = h('s', { class: 'hg-band', 'aria-hidden': 'true', style: `left:${pos(lo)};width:${(100 * (hi - lo)) / range}%` });
  const track = h('div', { class: 'hg-track' }, band, askMark, needle, priceTag);
  const scale = h('div', { class: 'hg-scale' }, h('span', { text: `${s.min}` }), h('span', { text: `${s.max} cr` }));
  const pips = h('div', { class: 'hg-pips', 'aria-label': 'Their patience' });
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `You offer ${who} money for ${what}${gift ? ` and ${gift}` : ''}. Tap Offer when the needle is in the lit band.` });
  const offerBtn = h('button', { type: 'button', class: 'hk-btn primary ui-btn', text: 'Offer' });
  const takeBtn = h('button', { type: 'button', class: 'hg-take ui-btn', text: `Pay their ask (${s.ask})` });
  const facts = h('p', { class: 'rp-par', text: '' });
  const panel = h('section', { class: 'rp-panel hg-panel bb-panel mg-skin ui-panel', role: 'group', 'aria-label': `Bribe ${who}` },
    h('p', { class: 'rp-eyebrow ui-nameplate', text: `BRIBE · ${who.toUpperCase()} · ${s.rounds} ROUNDS` }), pips, track, scale, offerBtn, status, takeBtn, facts,
    h('p', { class: 'rp-help', text: 'Offer inside the lit band for a great deal. Over it, you overpay. Under it, they hold out and cost you a patience and a round. Out of patience, they walk and you keep your money.' }));
  panel.__state = s;
  root.append(panel);
  let raf = 0, last = 0, finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;
  function paint() {
    const p = needleAt(s);
    needle.style.left = `${100 * p}%`; priceTag.textContent = `${priceAt(s)}`; priceTag.style.left = `${100 * p}%`;
    askMark.style.left = pos(s.ask);
    pips.replaceChildren(...Array.from({ length: s.patienceMax }, (_, i) => h('span', { class: i < s.patience ? 'on' : '' })));
    takeBtn.textContent = `Pay their ask (${s.ask})`;
    facts.textContent = `${s.asks} of ${s.rounds} offers used · their ask ${s.ask}`;
  }
  function doOffer() {
    if (s.done) return;
    const named = priceAt(s);
    const r = offer(s);
    if (r === 'counter') { status.textContent = `${named} is too low. They hold out at ${s.ask}.`; sound('hurt'); } else if (r) sound(r === 'deal' ? 'power' : 'jam');
    paint(); if (s.done) end();
  }
  const kd = (e) => { if (['Space', 'Enter', 'KeyE'].includes(e.code) && !panel.querySelector('.rp-result')) { e.preventDefault(); if (!e.repeat) doOffer(); } };
  addEventListener('keydown', kd);
  offerBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doOffer(); });
  takeBtn.addEventListener('click', () => { takeAsk(s); paint(); end(); });
  function frame(now) { raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; stepBribe(s, dt); paint(); }
  function end() {
    cancelAnimationFrame(raf); paint(); removeEventListener('keydown', kd);
    const r = s.result;
    offerBtn.hidden = true; takeBtn.hidden = true;
    status.textContent = r.grade === 'walked' ? `${who} walks. You keep your money.` : r.saved > 0 ? `Deal at ${r.price}, ${r.saved} off from your haggle points: you pay ${r.paid} credits.` : `Deal: you pay ${r.paid} credits.`;
    const ok = r.grade !== 'walked';
    const go = h('button', { type: 'button', class: 'primary ui-btn', text: ok ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ui-card ${ok ? 'is-ok' : 'is-bad'}`, role: 'status', 'data-outcome': r.grade },
      h('b', { class: 'rp-stars', text: WORDS[r.grade] }),
      h('span', { text: `${ok ? `${r.paid} credits` : 'no deal'} · ${r.asks} offer${r.asks === 1 ? '' : 's'} · ${r.how === 'sweet' ? 'inside the band' : r.how === 'over' ? 'you could have offered less' : r.how === 'final' ? 'their final ask' : r.how === 'took' ? 'you paid their ask' : 'too low'}${r.xp ? ` · +${r.xp} Social XP` : ' · No XP'}` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}

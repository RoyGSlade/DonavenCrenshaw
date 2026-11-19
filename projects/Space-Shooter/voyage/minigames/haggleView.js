// The haggle on screen: a price gauge with a sweeping needle, their offer marker, the lit
// comfort band, a big Ask button (Space, Enter, click or tap) and Take offer.
// DOM only, no art. Resolves with the rules' result { price, how, outcome, asks, xp, success }.
import { ask, takeOffer, stepHaggle, needleAt, priceAt, bandPrices } from './haggle.js';

const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); } el.append(...kids.filter(Boolean)); return el; };
const WORDS = { well: 'A GREAT DEAL', fair: 'A FAIR DEAL', walked: 'THEY WALKED' };

export function playHaggle(root, { state, who = 'Captain Tull', what = 'your share', sound = () => {}, reducedMotion = () => false } = {}) {
  const s = state;
  const range = s.cap - s.open;
  const pos = (price) => `${(100 * (price - s.open)) / range}%`;
  const [lo, hi] = bandPrices(s);
  const needle = h('i', { class: 'hg-needle', 'aria-hidden': 'true' });
  const priceTag = h('b', { class: 'hg-price', text: '' });
  const offerMark = h('u', { class: 'hg-offer', 'aria-hidden': 'true' }, h('span', { text: 'offer' }));
  const band = h('s', { class: 'hg-band', 'aria-hidden': 'true', style: `left:${pos(lo)};width:${(100 * (hi - lo)) / range}%` });
  const track = h('div', { class: 'hg-track' }, band, offerMark, needle, priceTag);
  const scale = h('div', { class: 'hg-scale' }, h('span', { text: `${s.open}` }), h('span', { text: `${s.cap} cr` }));
  const pips = h('div', { class: 'hg-pips', 'aria-label': 'Their patience' });
  const status = h('p', { class: 'rp-status', role: 'status', 'aria-live': 'polite', text: `${who} offers ${s.open} for ${what}. Tap Ask when the needle is in the lit band.` });
  const askBtn = h('button', { type: 'button', class: 'hk-btn primary', text: 'Ask' });
  const takeBtn = h('button', { type: 'button', class: 'hg-take', text: `Take their offer (${s.offer})` });
  const facts = h('p', { class: 'rp-par', text: '' });
  const panel = h('section', { class: 'rp-panel hg-panel', role: 'group', 'aria-label': `Haggle with ${who}` },
    h('p', { class: 'rp-eyebrow', text: `HAGGLE · ${who.toUpperCase()} · ${s.rounds} ROUNDS` }), pips, track, scale, askBtn, status, takeBtn, facts,
    h('p', { class: 'rp-help', text: 'Ask inside the lit band to close near their limit. Asking too high costs patience and a round. Out of patience, they walk.' }));
  panel.__state = s;
  root.append(panel);
  let raf = 0, last = 0, finish;
  const promise = new Promise((r) => { finish = r; });
  promise.state = s;

  function paint() {
    const p = needleAt(s);
    needle.style.left = `${100 * p}%`;
    priceTag.textContent = `${priceAt(s)}`;
    priceTag.style.left = `${100 * p}%`;
    offerMark.style.left = pos(s.offer);
    pips.replaceChildren(...Array.from({ length: s.patienceMax }, (_, i) => h('span', { class: i < s.patience ? 'on' : '' })));
    takeBtn.textContent = `Take their offer (${s.offer})`;
    facts.textContent = `${s.asks} of ${s.rounds} asks used · their offer ${s.offer}`;
  }
  function doAsk() {
    if (s.done) return;
    const asked = priceAt(s);
    const r = ask(s);
    if (r === 'counter') { status.textContent = `${asked} is too rich. ${who} counters with ${s.offer}.`; sound('hurt'); }
    else if (r) sound(r === 'deal' ? 'power' : 'jam');
    paint();
    if (s.done) end();
  }
  const kd = (e) => { if (['Space', 'Enter', 'KeyE'].includes(e.code) && !panel.querySelector('.rp-result')) { e.preventDefault(); if (!e.repeat) doAsk(); } };
  addEventListener('keydown', kd);
  askBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doAsk(); });
  takeBtn.addEventListener('click', () => { takeOffer(s); paint(); end(); });
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    stepHaggle(s, dt); paint();
  }
  function end() {
    cancelAnimationFrame(raf); paint(); removeEventListener('keydown', kd);
    const r = s.result;
    askBtn.hidden = true; takeBtn.hidden = true;
    status.textContent = r.outcome === 'walked' ? `${who} walks. You get ${r.price}.` : r.bonus > 0 ? `Deal at ${r.base}, +${r.bonus} from your haggle points: ${r.price} credits.` : `Deal at ${r.price}.`;
    const ok = r.outcome !== 'walked';
    const go = h('button', { type: 'button', class: 'primary', text: ok ? 'Continue' : 'Step back' });
    const card = h('div', { class: `rp-result ${r.outcome === 'walked' ? 'is-bad' : 'is-ok'}`, role: 'status', 'data-outcome': r.outcome },
      h('b', { class: 'rp-stars', text: WORDS[r.outcome] }),
      h('span', { text: `${r.price} credits · ${r.asks} ask${r.asks === 1 ? '' : 's'} · ${r.how === 'sweet' ? 'closed in the band' : r.how === 'low-ask' ? 'you could have asked for more' : r.how === 'final' ? 'their final offer' : r.how === 'took' ? 'you took their offer' : 'too greedy'}${r.xp ? ` · +${r.xp} Social XP` : ' · No XP'}` }), go);
    go.addEventListener('click', () => { panel.remove(); finish(r); });
    panel.append(card); go.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' });
  }
  paint();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  return promise;
}

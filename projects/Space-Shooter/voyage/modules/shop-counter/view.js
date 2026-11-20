// Shop counter view: draws what model.view(state) says, and sends the player's taps to the model. A shop front, not a list:
// a roll-up shutter, shelves with items standing on them, a keeper whose face follows what you do, a chalk board, your purse,
// a till and a tray. Everything is CSS and SVG; the only pictures are the keeper's portraits and a few library icons.
import * as M from './model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

// --- items drawn in code when there is no picture (a shape per kind, a colour per item) ---
const SHAPES = {
  gear: '<path d="M14 12 26 8Q32 15 38 8L50 12 52 30Q52 48 32 58 12 48 12 30Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M32 20V50M22 28H42" stroke="HI" stroke-width="2" opacity=".55"/><circle cx="21" cy="19" r="1.8" fill="HI"/><circle cx="43" cy="19" r="1.8" fill="HI"/>',
  part: '<g stroke="HI" stroke-width="2.4" stroke-linecap="round" opacity=".8"><path d="M22 6V14M32 6V14M42 6V14M22 50V58M32 50V58M42 50V58M6 22H14M6 32H14M6 42H14M50 22H58M50 32H58M50 42H58"/></g><rect x="14" y="14" width="36" height="36" rx="5" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><rect x="23" y="23" width="18" height="18" rx="3" fill="#0006"/><rect x="26" y="26" width="12" height="12" rx="2" fill="HI" opacity=".7"/>',
  consumable: '<rect x="27" y="8" width="10" height="12" rx="2" fill="#cdd9e2"/><path d="M24 20H40L44 28V52Q44 58 38 58H26Q20 58 20 52V28Z" fill="#cfe9ee" fill-opacity=".25" stroke="#cfe9ee" stroke-width="2"/><path d="M21 36H43V52Q43 57 38 57H26Q21 57 21 52Z" fill="url(#G)"/><path d="M25 26 24 50" stroke="#fff" stroke-width="2" opacity=".35" stroke-linecap="round"/>',
  material: '<path d="M8 40 16 20 32 10 52 20 56 40 42 56 20 54Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M16 20 32 30 52 20M32 30 20 54M32 30 42 56M8 40 32 30 56 40" stroke="HI" stroke-width="1.6" fill="none" opacity=".55"/>',
  key: '<rect x="6" y="16" width="52" height="32" rx="6" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><rect x="12" y="22" width="14" height="11" rx="2" fill="HI" opacity=".75"/><path d="M12 40H46M12 44H36" stroke="HI" stroke-width="2" opacity=".5" stroke-linecap="round"/><circle cx="49" cy="26" r="3" fill="HI"/>',
  cargo: '<rect x="8" y="14" width="48" height="38" rx="3" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M8 24H56M8 42H56M22 14V52M42 14V52" stroke="#0008" stroke-width="3"/><path d="M8 24H56M8 42H56" stroke="HI" stroke-width="1" opacity=".5"/>',
};
Object.assign(SHAPES, {
  armour: '<path d="M16 10 26 7Q32 14 38 7L48 10 58 22 50 30 47 26V56H17V26L14 30 6 22Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M32 14V56M22 34H42M22 44H42" stroke="HI" stroke-width="1.8" opacity=".5"/>',
  boots: '<path d="M16 8H32V34L50 42Q58 46 58 54H12Q10 54 10 50V12Q10 8 16 8Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M10 54H58" stroke="HI" stroke-width="3" opacity=".55"/><path d="M16 18H30M16 26H30" stroke="HI" stroke-width="2" opacity=".5"/>',
  gun: '<path d="M6 22H46L52 18H58V30H44L40 34H30L28 52H16L20 34H6Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M10 26H42" stroke="HI" stroke-width="2" opacity=".5"/><circle cx="48" cy="24" r="2" fill="HI"/>',
  visor: '<path d="M6 22Q6 14 14 14H50Q58 14 58 22V38Q58 46 50 46H40L32 40 24 46H14Q6 46 6 38Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><rect x="12" y="22" width="18" height="12" rx="6" fill="#0b1724" stroke="HI" stroke-width="2"/><rect x="34" y="22" width="18" height="12" rx="6" fill="#0b1724" stroke="HI" stroke-width="2"/><path d="M6 28H0M58 28H64" stroke="HI" stroke-width="3" opacity=".6"/>',
  kit: '<rect x="8" y="16" width="48" height="36" rx="5" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M22 16V10H42V16" fill="none" stroke="#0009" stroke-width="3"/><path d="M32 24V44M22 34H42" stroke="HI" stroke-width="6" stroke-linecap="round"/>',
  tool: '<path d="M44 6Q56 6 56 18Q56 22 52 24L24 52Q18 58 12 52Q6 46 12 40L40 12Q42 8 44 6Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><circle cx="16" cy="48" r="3" fill="#0008"/><path d="M44 14 50 20" stroke="HI" stroke-width="2.4" opacity=".6"/>',
  roll: '<ellipse cx="32" cy="46" rx="22" ry="8" fill="#0006"/><path d="M10 22V44Q10 52 32 52T54 44V22Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><ellipse cx="32" cy="22" rx="22" ry="8" fill="HI" opacity=".75" stroke="#0007" stroke-width="1.5"/><ellipse cx="32" cy="22" rx="9" ry="3.5" fill="#0b1724"/>',
});
SHAPES.default = SHAPES.part;
const WORDS = [[/vest|coat|suit|armou?r|plate|jacket/i, 'armour'], [/boot|shoe/i, 'boots'], [/pistol|carbine|rifle|gun|blaster|launcher/i, 'gun'], [/goggle|visor|scanner|lens/i, 'visor'], [/kit|case|bag/i, 'kit'], [/spanner|wrench|tool|drill|hammer/i, 'tool'], [/tape|coil|cable|roll/i, 'roll']];
/** Which shape to draw: the record's own `glyph`, else a plain-word guess from the name, else the kind. */
function shapeFor(it) {
  if (it.glyph && SHAPES[it.glyph]) return it.glyph;
  for (const [re, shape] of WORDS) if (re.test(it.name || '')) return shape;
  return SHAPES[it.kind] ? it.kind : 'default';
}
function glyph(it) {
  const { kind, id } = it;
  const hue = M.hashSeed(id) % 360;
  const gid = `scg-${String(id).replace(/[^a-z0-9]/gi, '')}`;
  const body = SHAPES[shapeFor({ ...it, kind })].replaceAll('url(#G)', `url(#${gid})`).replaceAll('HI', `hsl(${hue} 75% 82%)`);
  const span = h('span', { class: 'sc-glyph', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 64 64" xmlns="${SVG_NS}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 52% 62%)"/><stop offset="1" stop-color="hsl(${hue} 55% 28%)"/></linearGradient></defs>${body}</svg>`;
  return span;
}
const withBase = (base, p) => (!p ? null : /^(https?:|data:|blob:|\/)/.test(p) ? p : new URL(p, base).href);

/**
 * mount(stage, state, { ctx, base, onLeave }) -> { destroy() }
 * `onLeave(left)` is called when the player leaves from inside the module (Esc); the entry resolves the promise.
 */
export function mount(stage, state, env) {
  const { ctx = {}, base } = env;
  const reduced = () => Boolean(ctx.reducedMotion?.());
  const sound = (id) => { try { ctx.sound?.(id); } catch { /* a sound must never break the counter */ } };
  const icon = (it) => (it.icon ? h('img', { class: 'sc-icon', src: withBase(base, it.icon), alt: '', draggable: 'false' }) : glyph(it));

  stage.replaceChildren();
  const root = h('div', { class: 'm-shop-counter' });
  stage.append(root);

  // ---- static parts ----
  const chalkFilter = h('span', { class: 'sc-defs', 'aria-hidden': 'true' });
  chalkFilter.innerHTML = `<svg width="0" height="0" xmlns="${SVG_NS}"><filter id="sc-chalk" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${state.seed % 97}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.5"/></filter></svg>`;
  const sign = h('h1', { class: 'sc-sign' });
  const board = h('div', { class: 'sc-board', 'aria-label': 'Chalk board' });
  const say = h('div', { class: 'sc-say', role: 'status', 'aria-live': 'polite' });
  const portraits = Object.fromEntries(M.MOODS.map((m) => [m, h('img', { class: `sc-face sc-face-${m}`, alt: m === 'neutral' ? '' : '', draggable: 'false' })]));
  const keeper = h('div', { class: 'sc-keeper' }, h('div', { class: 'sc-alcove' }, ...Object.values(portraits)), h('span', { class: 'sc-keeper-name' }));
  const unitL = h('section', { class: 'sc-unit sc-unit-l', 'aria-label': 'Shelves' });
  const unitR = h('section', { class: 'sc-unit sc-unit-r', 'aria-label': 'More shelves' });
  const mid = h('div', { class: 'sc-mid' }, h('div', { class: 'sc-mid-top' }, board), h('div', { class: 'sc-who' }, keeper, say));
  const head = h('header', { class: 'sc-head' }, sign);
  const scroller = h('div', { class: 'sc-scroller' }, unitL, unitR);
  const floor = h('div', { class: 'sc-floor' }, mid, scroller);

  const purseDigits = h('b', { class: 'sc-digits' });
  const purse = h('div', { class: 'sc-purse', 'aria-label': 'Your purse' }, h('span', { class: 'sc-purse-bag', html: '<svg viewBox="0 0 48 48"><path d="M16 8Q24 14 32 8L30 15Q40 22 40 33Q40 42 24 42Q8 42 8 33Q8 22 18 15Z" fill="#7a5a3a" stroke="#2b1c10" stroke-width="2"/><path d="M17 14Q24 18 31 14" stroke="#e7c58f" stroke-width="2.4" fill="none"/><circle cx="24" cy="30" r="6" fill="#e3b04b" stroke="#6b4a12" stroke-width="1.5"/><path d="M21 30H27" stroke="#6b4a12" stroke-width="2"/></svg>' }), purseDigits);
  const pile = h('div', { class: 'sc-pile', 'aria-label': 'On the counter' });
  const stamp = h('span', { class: 'sc-stamp' });
  const tillWas = h('s', { class: 'sc-till-was' });
  const tillDigits = h('b', { class: 'sc-digits' });
  const till = h('div', { class: 'sc-till', 'aria-label': 'Till' }, h('span', { class: 'sc-till-top' }, tillWas), tillDigits, h('span', { class: 'sc-till-drawer' }));
  const payBtn = h('button', { class: 'sc-btn sc-pay', type: 'button', onclick: () => run(() => M.pay(state)) }, 'Pay');
  const haggleBtn = h('button', { class: 'sc-btn sc-haggle', type: 'button', onclick: () => askPrice() }, 'Better price?');
  const sellBtn = h('button', { class: 'sc-btn sc-sellbtn', type: 'button', 'aria-expanded': 'false', onclick: () => { trayOpen = !trayOpen; paint(); } }, 'Sell');
  const trayItems = h('div', { class: 'sc-tray-items' });
  const trayEmpty = h('p', { class: 'sc-tray-empty' });
  const offerCard = h('div', { class: 'sc-offer' });
  const tray = h('div', { class: 'sc-tray', 'aria-label': 'Your goods' }, h('div', { class: 'sc-tray-head' }, h('span', { text: 'Your goods' }), h('button', { class: 'sc-x', type: 'button', 'aria-label': 'Close your goods', onclick: () => { trayOpen = false; paint(); } }, '×')), trayItems, trayEmpty, offerCard);
  const counter = h('footer', { class: 'sc-counter' },
    h('div', { class: 'sc-c-left' }, purse, tray),
    h('div', { class: 'sc-c-mid' }, pile, h('div', { class: 'sc-side' }, stamp, haggleBtn)),
    h('div', { class: 'sc-c-right' }, till, h('div', { class: 'sc-actions' }, sellBtn, payBtn)));
  const shutterMsg = h('div', { class: 'sc-shut-msg' });
  const shutter = h('div', { class: 'sc-shutter', 'aria-hidden': 'false', onclick: () => { if (!state.shut) return; shutter.classList.remove('rattle'); void shutter.offsetWidth; shutter.classList.add('rattle'); sound('knock'); } },
    h('span', { class: 'sc-shutter-lamp' }), shutterMsg, h('span', { class: 'sc-shutter-bar' }));
  const room = h('div', { class: 'sc-room' }, h('div', { class: 'sc-wall' }), head, floor, counter, shutter);
  root.append(chalkFilter, room);

  let trayOpen = false;
  let destroyed = false;
  let rolling = { purse: state.save.money, till: 0 };
  const open0 = !state.shut && !state.quick && !reduced();
  room.classList.toggle('is-shut', state.shut);
  room.classList.toggle('is-quick', state.quick);
  room.classList.toggle('is-rolling', open0);
  if (!open0 && !state.shut) room.classList.add('is-up');

  // ---- painting ----
  function resolvePortrait(url) { return withBase(base, url); }
  function paint() {
    const v = M.view(state);
    room.dataset.mood = v.keeper.mood;
    room.classList.toggle('tray-open', trayOpen && !state.quick);
    sellBtn.setAttribute('aria-expanded', String(trayOpen));
    sign.textContent = v.shop.name || ' ';
    for (const m of M.MOODS) {
      const src = resolvePortrait(v.keeper.portraits[m] || v.keeper.portraits.neutral);
      if (src && portraits[m].getAttribute('src') !== src) portraits[m].src = src;
    }
    keeper.querySelector('.sc-keeper-name').textContent = v.keeper.name;
    paintSay(v);
    paintBoard(v);
    paintShelves(v);
    paintCounter(v);
    shutterMsg.replaceChildren();
    if (v.shut) {
      const sp = v.shut.speech;
      shutterMsg.append(
        h('div', { class: 'sc-shut-sign' }, 'Closed'),
        h('div', { class: 'sc-shut-say', 'data-emotion': sp?.emotion || 'neutral' }, h('img', { class: 'sc-shut-face', src: resolvePortrait(v.keeper.portraits.neutral), alt: '' }), h('div', {}, h('b', { text: v.shut.who }), h('p', { text: sp?.text || '' }))));
    }
  }

  function paintSay(v) {
    const sp = v.speech;
    say.replaceChildren();
    say.classList.toggle('is-empty', !sp || !sp.text);
    if (!sp || !sp.text) return;
    say.dataset.emotion = sp.emotion || 'neutral';
    say.dataset.kind = sp.kind;
    say.append(sp.who ? h('b', { class: 'sc-say-who', text: sp.who }) : null, h('span', { class: 'sc-say-text', text: sp.text }));
  }

  function paintBoard(v) {
    board.replaceChildren();
    const rows = [];
    if (v.shop.blurb) rows.push(h('p', { class: 'sc-chalk sc-chalk-blurb', text: v.shop.blurb }));
    for (const why of v.board.discounts) rows.push(h('p', { class: 'sc-chalk sc-chalk-deal' }, h('span', { class: 'sc-star' }, '★'), why));
    if (v.board.short.length) {
      rows.push(h('p', { class: 'sc-chalk sc-chalk-head', text: 'Wanted:' }));
      rows.push(h('p', { class: 'sc-chalk sc-chalk-wanted' }, ...v.board.short.map((w) => h('span', { class: `sc-want${w.have ? ' have' : ''}`, title: w.have ? 'You have one' : '' }, w.have ? '✓ ' : '', w.name))));
    }
    if (!rows.length) rows.push(h('p', { class: 'sc-chalk sc-chalk-doodle', html: '<svg viewBox="0 0 120 30"><path d="M4 22Q30 6 60 20T116 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' }));
    board.dataset.empty = String(!v.board.discounts.length && !v.board.short.length);
    board.append(h('div', { class: 'sc-board-in' }, ...rows), h('span', { class: 'sc-ledge' }));
  }

  function slotNode(it) {
    const state2 = it.locked ? 'locked' : it.gone ? 'gone' : it.onCounter ? 'oncounter' : it.note ? 'blocked' : 'ok';
    const copies = [];
    const n = it.gone || it.onCounter ? 0 : it.shown;
    for (let i = 0; i < n; i++) copies.push(h('span', { class: 'sc-copy', style: { '--i': i, '--of': n, '--lean': `${(it.lean + i * 1.4).toFixed(2)}deg`, '--dx': `${it.shift}px` } }, icon(it)));
    const tagLines = [h('b', { class: 'sc-tag-name', text: it.name })];
    if (it.locked) tagLines.push(h('span', { class: 'sc-tag-why', text: it.lockReason }));
    else if (it.gone) tagLines.push(h('span', { class: 'sc-tag-why', text: 'Sold out' }));
    else if (it.onCounter) tagLines.push(h('span', { class: 'sc-tag-why', text: 'On the counter' }));
    else {
      tagLines.push(h('span', { class: 'sc-price' }, it.was ? h('s', { text: it.was }) : null, h('span', { class: 'sc-now', text: it.price }), it.per ? h('i', { class: 'sc-per', text: `×${it.per}` }) : null));
      if (it.last) tagLines.push(h('em', { class: 'sc-last', text: 'last one' }));
      else if (it.note) tagLines.push(h('em', { class: 'sc-last', text: it.note }));
      if (it.word) tagLines.push(h('em', { class: `sc-word w-${it.word.replace(/\s/g, '')}`, text: it.word }));
    }
    const slot = h('button', { class: `sc-slot is-${state2}`, type: 'button', 'data-id': it.id, 'data-k': `shelf:${it.id}`, 'aria-label': `${it.name}${it.locked ? `, locked: ${it.lockReason}` : it.gone ? ', sold out' : `, ${it.price} credits`}`, onclick: () => run(() => M.lift(state, it.id), { from: it.id }) },
      h('span', { class: 'sc-stand' }, ...copies, it.gone || it.onCounter ? h('span', { class: 'sc-gap' }, h('span', { class: 'sc-dust' })) : null, it.locked ? h('span', { class: 'sc-glass' }, h('span', { class: 'sc-glint' })) : null),
      h('span', { class: 'sc-tag' }, h('span', { class: 'sc-tag-hole' }), ...tagLines));
    return slot;
  }

  const phoneQuery = window.matchMedia ? window.matchMedia('(max-width:700px),(max-height:520px)') : { matches: false, addEventListener() {}, removeEventListener() {} };
  function paintShelves(v) {
    // wide: the record split over two shelf units either side of the keeper. phone: one shelf, read in the record's order, two to a plank.
    const half = phoneQuery.matches ? v.shelves.length : Math.ceil(v.shelves.length / 2);
    const sides = [v.shelves.slice(0, half), v.shelves.slice(half)];
    [unitL, unitR].forEach((unit, i) => {
      unit.replaceChildren();
      const list = sides[i];
      let rows = 0;
      for (let r = 0; r < list.length; r += 2, rows++) unit.append(h('div', { class: 'sc-plank' }, ...list.slice(r, r + 2).map(slotNode)));
      for (; rows < 3; rows++) unit.append(h('div', { class: 'sc-plank is-decor', 'aria-hidden': 'true' }, h('span', { class: 'sc-bare' }, h('span', { class: 'sc-dust' }))));
      unit.classList.toggle('is-empty', !list.length);
    });
    floor.dataset.count = String(v.shelves.length);
  }
  const onPhoneChange = () => { if (!destroyed) paint(); };
  phoneQuery.addEventListener?.('change', onPhoneChange);

  function pileNode(b) {
    const stack = [];
    for (let i = 0; i < Math.min(b.n, 4); i++) stack.push(h('span', { class: 'sc-pcopy', style: { '--i': i } }, icon(b)));
    return h('button', { class: 'sc-chip', type: 'button', 'data-id': b.id, 'data-k': `pile:${b.id}`, 'aria-label': `Put back ${b.name}`, title: `Put back ${b.name}`, onclick: () => run(() => M.putBack(state, b.id), { fromPile: b.id }) }, h('span', { class: 'sc-stackbox' }, ...stack), h('span', { class: 'sc-chip-name', text: b.name }));
  }

  function paintCounter(v) {
    purseDigits.textContent = String(rolling.purse);
    tillDigits.textContent = String(rolling.till);
    tillWas.textContent = v.till.haggled ? String(v.till.gross) : '';
    till.classList.toggle('is-haggled', v.till.haggled);
    till.classList.toggle('is-short', v.short && v.canPay);
    purse.classList.toggle('is-short', v.short && v.canPay);
    pile.replaceChildren(...v.basket.map(pileNode));
    pile.classList.toggle('is-empty', !v.basket.length);
    if (!v.basket.length) pile.append(h('span', { class: 'sc-pile-hint', text: 'Pick things up and they sit here' }));
    const words = { well: 'Good deal', fair: 'Fair deal', walked: 'No deal' };
    stamp.textContent = v.haggle.used ? words[v.haggle.outcome] || '' : '';
    stamp.dataset.outcome = v.haggle.used ? v.haggle.outcome : '';
    payBtn.disabled = !v.canPay;
    payBtn.classList.toggle('is-short', v.short && v.canPay);
    haggleBtn.hidden = !v.haggle.available;
    sellBtn.hidden = state.quick || state.shut;
    sellBtn.classList.toggle('has-goods', v.tray.length > 0);
    // tray
    trayItems.replaceChildren(...v.tray.map((t) => h('button', { class: `sc-tray-item${v.offer?.id === t.id ? ' is-on' : ''}`, type: 'button', 'data-k': `tray:${t.id}`, 'aria-label': `Offer ${t.name}`, onclick: () => run(() => M.offer(state, t.id)) }, h('span', { class: 'sc-tray-ic' }, icon({ ...t, kind: v.items[t.id]?.kind })), h('span', { class: 'sc-tray-name', text: t.name }), t.have > 1 ? h('span', { class: 'sc-tray-more', 'aria-label': 'several' }, ...Array.from({ length: Math.min(t.have - 1, 3) }, () => h('i'))) : null)));
    trayEmpty.textContent = v.tray.length ? '' : "You're carrying nothing they buy.";
    trayEmpty.hidden = v.tray.length > 0;
    offerCard.replaceChildren();
    offerCard.hidden = !v.offer;
    if (v.offer) {
      const o = v.offer;
      offerCard.append(
        h('span', { class: 'sc-offer-ic' }, icon({ ...o, kind: v.items[o.id]?.kind })),
        h('span', { class: 'sc-tag sc-offer-tag' }, h('span', { class: 'sc-tag-hole' }), h('b', { class: 'sc-tag-name', text: o.name }), h('span', { class: 'sc-price' }, h('span', { class: 'sc-now', text: o.price })), o.word ? h('em', { class: `sc-word w-${o.word}`, text: o.word }) : null),
        h('span', { class: 'sc-offer-btns' }, h('button', { class: 'sc-btn sc-take', type: 'button', onclick: () => run(() => M.sellOne(state)) }, 'Take it'), h('button', { class: 'sc-btn', type: 'button', onclick: () => run(() => M.cancelOffer(state)) }, 'Keep it')));
    }
  }

  // ---- number rolling (the till and the purse tick like counters) ----
  const tweens = { purse: 0, till: 0 };
  function roll(key, el, to) {
    const from = rolling[key];
    cancelAnimationFrame(tweens[key]); tweens[key] = 0;
    if (from === to || reduced()) { rolling[key] = to; el.textContent = String(to); return; }
    const t0 = performance.now(), dur = Math.min(700, 260 + Math.abs(to - from) * 3);
    const tick = (now) => {
      if (destroyed) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - (1 - k) ** 3;
      rolling[key] = Math.round(from + (to - from) * e);
      el.textContent = String(rolling[key]);
      if (k < 1) tweens[key] = requestAnimationFrame(tick); else tweens[key] = 0;
    };
    tweens[key] = requestAnimationFrame(tick);
  }

  // ---- doing things: the model changes, then we draw it and animate what happened ----
  function run(action, ctxHint = {}) {
    if (destroyed || state.done) return;
    const focus = document.activeElement?.dataset?.k;
    const rects = {};
    if (ctxHint.from) rects.from = rectOf(`.sc-slot[data-id="${cssEsc(ctxHint.from)}"] .sc-copy:last-child`) || rectOf(`.sc-slot[data-id="${cssEsc(ctxHint.from)}"] .sc-stand`);
    if (ctxHint.fromPile) rects.pile = rectOf(`.sc-chip[data-id="${cssEsc(ctxHint.fromPile)}"] .sc-pcopy:last-child`);
    const ghosts = snapshotPile();
    const before = M.view(state);
    const events = action();
    if (!events.length) return;
    for (const e of events) if (e.type === 'sound') sound(e.id);
    paint();
    animate(events, rects, ghosts, before);
    if (focus) root.querySelector(`[data-k="${cssEsc(focus)}"]`)?.focus({ preventScroll: true });
  }
  const cssEsc = (s) => (window.CSS?.escape ? CSS.escape(String(s)) : String(s).replace(/"/g, '\\"'));
  const rectOf = (sel) => { const el = root.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { r, node: el.cloneNode(true) } : null; };
  function snapshotPile() { return [...pile.querySelectorAll('.sc-pcopy')].map((el) => ({ r: el.getBoundingClientRect(), node: el.cloneNode(true) })); }

  function flyNode(from, to, { dur = 460, scaleTo = 1, arc = -46, fade = false, onDone } = {}) {
    const node = from.node;
    const fr = from.r;
    const fly = h('div', { class: 'sc-fly' }, node);
    Object.assign(fly.style, { width: `${fr.width}px`, height: `${fr.height}px` });
    const o = root.getBoundingClientRect();
    Object.assign(fly.style, { left: `${fr.left - o.left}px`, top: `${fr.top - o.top}px` });
    root.append(fly);
    const dx = to.left + to.width / 2 - (fr.left + fr.width / 2), dy = to.top + to.height / 2 - (fr.top + fr.height / 2);
    const sc = to.width && fr.width ? (to.width / fr.width) * scaleTo : scaleTo;
    const anim = fly.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', filter: 'drop-shadow(0 2px 2px #0008)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 + arc}px) scale(${1.18}) rotate(-7deg)`, filter: 'drop-shadow(0 14px 10px #0007)', opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(${sc}) rotate(0deg)`, filter: 'drop-shadow(0 1px 1px #0008)', opacity: fade ? 0 : 1 },
    ], { duration: dur, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' });
    anim.onfinish = () => { fly.remove(); onDone?.(); };
    anim.oncancel = () => fly.remove();
  }

  function knock(el) { if (!el || reduced()) return; el.classList.remove('knock'); void el.offsetWidth; el.classList.add('knock'); }

  function coins(fromEl, toEl, n = 8) {
    if (reduced() || !fromEl || !toEl) return;
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect(), o = root.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = h('span', { class: 'sc-coin' });
      const sx = a.left - o.left + a.width / 2 + (i % 3 - 1) * 8, sy = a.top - o.top + a.height / 2;
      Object.assign(c.style, { left: `${sx}px`, top: `${sy}px` });
      root.append(c);
      const dx = b.left - o.left + b.width / 2 - sx + ((i * 7) % 11 - 5), dy = b.top - o.top + b.height / 2 - sy;
      const an = c.animate([{ transform: 'translate(0,0) scale(.7)', opacity: 0 }, { transform: `translate(${dx * 0.4}px,${dy * 0.4 - 26 - (i % 4) * 6}px) scale(1)`, opacity: 1, offset: 0.35 }, { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: 0.9 }], { duration: 520 + i * 60, delay: i * 55, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
      an.onfinish = () => c.remove();
    }
  }

  function animate(events, rects, ghosts, before) {
    const v = M.view(state);
    for (const e of events) {
      if (e.type === 'lift') {
        const dest = pile.querySelector(`.sc-chip[data-id="${cssEsc(e.id)}"] .sc-pcopy:last-child`);
        if (rects.from && dest && !reduced()) {
          dest.style.visibility = 'hidden';
          flyNode(rects.from, dest.getBoundingClientRect(), { scaleTo: 1, onDone: () => { dest.style.visibility = ''; dest.classList.add('landed'); knock(counter); sound('knock'); } });
        } else { dest?.classList.add('landed'); }
        const slot = root.querySelector(`.sc-slot[data-id="${cssEsc(e.id)}"]`);
        knock(slot);
      }
      if (e.type === 'putback') {
        const slot = root.querySelector(`.sc-slot[data-id="${cssEsc(e.id)}"] .sc-stand`);
        if (rects.pile && slot && !reduced()) flyNode(rects.pile, slot.getBoundingClientRect(), { dur: 340, arc: -24, fade: true });
        knock(slot);
      }
      if (e.type === 'blocked' || e.type === 'glass') {
        const slot = root.querySelector(`.sc-slot[data-id="${cssEsc(e.id)}"]`);
        if (slot && !reduced()) { slot.classList.remove('shake'); void slot.offsetWidth; slot.classList.add('shake'); }
        if (e.type === 'glass') slot?.classList.add('tapped');
      }
      if (e.type === 'broke') {
        for (const el of [purse, till]) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
      }
      if (e.type === 'pay') {
        coins(purse, till, Math.min(14, 5 + Math.round(e.total / 40)));
        if (!reduced()) ghosts.forEach((g, i) => flyNode(g, new DOMRect(g.r.left - 90, g.r.top + 140, g.r.width, g.r.height), { dur: 560 + i * 40, arc: -10, fade: true, scaleTo: 0.7 }));
        till.classList.remove('ring'); void till.offsetWidth; till.classList.add('ring');
      }
      if (e.type === 'sell') coins(keeper, purse, Math.min(10, 3 + Math.round(e.price / 30)));
      if (e.type === 'haggle') { stamp.classList.remove('slam'); void stamp.offsetWidth; stamp.classList.add('slam'); }
      if (e.type === 'say') { say.classList.remove('pop'); void say.offsetWidth; say.classList.add('pop'); }
      if (e.type === 'mood') { keeper.classList.remove('bump'); void keeper.offsetWidth; keeper.classList.add('bump'); }
    }
    roll('purse', purseDigits, v.purse.money);
    roll('till', tillDigits, v.till.total);
  }

  async function askPrice() {
    if (!M.canHaggle(state) || typeof ctx.play !== 'function') return;
    haggleBtn.disabled = true;
    let result;
    try { result = await ctx.play('haggle', M.haggleRequest(state)); } catch { result = undefined; }
    haggleBtn.disabled = false;
    if (destroyed || state.done) return;
    run(() => M.applyHaggle(state, result));
  }

  // ---- opening: the shutter rolls up, then the keeper says hello ----
  paint();
  rolling = { purse: state.save.money, till: 0 };
  paint();
  let openTimer = 0;
  if (open0) {
    sound('shutter');
    requestAnimationFrame(() => requestAnimationFrame(() => { room.classList.add('is-up'); }));
    openTimer = setTimeout(() => { room.classList.remove('is-rolling'); say.classList.add('pop'); if (state.speech?.lineId) sound(`line:${state.speech.lineId}`); }, 1100);
  } else if (!state.shut && state.speech?.lineId) sound(`line:${state.speech.lineId}`);
  if (state.shut && state.speech?.lineId) sound(`line:${state.speech.lineId}`);

  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); env.onLeave?.(); } };
  document.addEventListener('keydown', onKey);
  return {
    destroy() { destroyed = true; clearTimeout(openTimer); Object.values(tweens).forEach(cancelAnimationFrame); document.removeEventListener('keydown', onKey); phoneQuery.removeEventListener?.('change', onPhoneChange); root.remove(); },
    root,
  };
}

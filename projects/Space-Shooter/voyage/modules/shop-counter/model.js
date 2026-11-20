// Shop counter rules. Pure: seeded, no DOM, no clock, no unseeded random. Every shop, keeper, item, price and line comes in as a
// record in `context` (see README.md); nothing about any shop is written here.
//
//   createCounter({ seed, tier, points, level, quick, haggleReady, context }) -> state
//   view(state)                 -> everything the view draws (the only thing the view reads)
//   lift / putBack / tapLocked  -> the basket; each returns a list of events for the view to animate and sound
//   pay / haggleRequest / applyHaggle
//   offer / cancelOffer / sellOne   -> your own goods
//   finish(state, extra)        -> the result for the host (effects.items, effects.world...)
//
// The state is a plain mutable object; an action changes it and returns events. Same seed and same actions, same shop.

// --- seeded random (the game's own mulberry32 and FNV-1a, copied: a module never imports the game) ---
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  const text = parts.map((p) => String(p)).join('|');
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function rand01(seedInt) {
  let t = (seedInt + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const PATHS = Object.freeze(['valuation', 'barter', 'market']);
/** What a haggle takes off the basket as it stands when the deal is struck. */
export const HAGGLE_OFF = Object.freeze({ well: 0.2, fair: 0.1, walked: 0 });
export const DISCOUNT_CAP = 60;
/** The most copies drawn standing on a shelf (a stack with no limit shows this many). */
export const SHELF_SHOW = 4;
export const MOODS = Object.freeze(['neutral', 'happy', 'annoyed']);

const whole = (v) => (Number.isFinite(v) ? Math.trunc(v) : 0);
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const entries = (o) => (isObj(o) ? Object.entries(o) : []);
const cap1 = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const NUM_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const numWord = (n) => NUM_WORD[n] ?? String(n);

/** Path points: whole numbers 0..9, never more than `level` in all (spent in path order). `haggle` (social's old name) counts as barter. */
export function cleanPoints(points, level = 9) {
  const src = isObj(points) ? { ...points } : {};
  if (src.barter === undefined && src.haggle !== undefined) src.barter = src.haggle;
  const out = {};
  let left = Math.max(0, Math.min(9, whole(level)));
  for (const p of PATHS) {
    const n = Math.max(0, Math.min(9, whole(src[p])));
    out[p] = Math.min(n, left);
    left -= out[p];
  }
  return out;
}

// --- the game's `requires` rules, for money, rep, items, skills, flags (and stats, upgrades), in plain words ---
function saveOf(context) {
  const s = isObj(context?.save) ? context.save : {};
  const c = isObj(s.character) ? s.character : {};
  return {
    money: Math.max(0, whole(s.money)),
    items: { ...(isObj(s.items) ? s.items : {}) },
    rep: { ...(isObj(s.rep) ? s.rep : {}) },
    skills: { ...(isObj(c.skills) ? c.skills : {}), ...(isObj(s.skills) ? s.skills : {}) },
    stats: { ...(isObj(c.stats) ? c.stats : {}), ...(isObj(s.stats) ? s.stats : {}) },
    flags: { ...(isObj(s.flags) ? s.flags : {}) },
    upgrades: { ...(isObj(s.upgrades) ? s.upgrades : {}) },
  };
}

/** Every unmet part of a requirement, in plain words; [] when it is met. Mirrors the game's `missing()`. */
export function missing(save, req, words = {}) {
  const out = [];
  if (!isObj(req)) return out;
  const nm = (id) => words.names?.[id] || cap1(id);
  const item = (id) => words.items?.[id]?.name || cap1(String(id).replace(/-/g, ' '));
  if (whole(req.money) > save.money) out.push('Needs more credits.');
  const rep = entries(req.rep).filter(([g, n]) => (save.rep[g] || 0) < whole(n));
  if (rep.length) out.push(`${rep.map(([g]) => nm(g)).join(' and ')} ${rep.length > 1 ? 'have' : 'has'} to know you first.`);
  for (const [id, n] of entries(req.items)) if ((save.items[id] || 0) < whole(n)) out.push(`Needs ${item(id)}.`);
  for (const [id, n] of entries(req.stats)) if ((save.stats[id] || 0) < whole(n)) out.push(`Needs more ${nm(id)}.`);
  for (const [id, n] of entries(req.skills)) if ((save.skills[id] || 0) < whole(n)) out.push(whole(n) > 1 ? `Needs ${nm(id)} rank ${numWord(whole(n))}.` : `Needs the ${nm(id)} skill.`);
  for (const [id, n] of entries(req.upgrades)) if ((save.upgrades[id] || 0) < whole(n)) out.push(`Needs a better ${nm(id)}.`);
  for (const [id, n] of entries(req.flags)) if ((save.flags[id] || 0) < whole(n)) out.push('Not open to you yet.');
  for (const id of Array.isArray(req.notFlags) ? req.notFlags : []) if (save.flags[id]) out.push('Not for sale any more.');
  if (Array.isArray(req.anyOf) && req.anyOf.length && req.anyOf.every((r) => missing(save, r, words).length)) out.push('Something is still missing.');
  return [...new Set(out)];
}
export const meets = (save, req, words) => missing(save, req, words).length === 0;

// --- the state ---
export function createCounter({ seed = 1, tier = 0, points = {}, level = 9, quick = false, haggleReady = false, context = {} } = {}) {
  const ctx = isObj(context) ? context : {};
  const shop = isObj(ctx.shop) ? ctx.shop : {};
  const stock = (Array.isArray(shop.stock) ? shop.stock : []).filter((s) => isObj(s) && typeof s.item === 'string');
  const t = Math.max(-2, Math.min(2, whole(tier)));
  const save = saveOf(ctx);
  const s = {
    seed: whole(seed) || 1,
    tier: t,
    points: cleanPoints(points, level),
    level,
    quick: Boolean(quick),
    haggleReady: Boolean(haggleReady),
    shopId: String(ctx.shopId ?? shop.id ?? 'shop'),
    shop, stock,
    buys: (Array.isArray(shop.buys) ? shop.buys : []).filter((b) => isObj(b) && typeof b.item === 'string'),
    keeper: isObj(ctx.keeper) ? ctx.keeper : {},
    items: isObj(ctx.items) ? ctx.items : {},
    lineTable: isObj(ctx.lines) ? ctx.lines : {},
    names: isObj(ctx.names) ? ctx.names : {},
    save,
    startMoney: save.money,
    bought: Object.fromEntries(entries(ctx.bought).map(([k, v]) => [k, Math.max(0, whole(v))])), // purchases made here, ever
    visit: { bought: {}, units: {}, sold: {}, rep: {}, spent: 0, earned: 0 },
    basket: {},
    offerId: null,
    haggle: { used: false, outcome: null, pct: 0, covered: {}, stamped: false },
    mood: t >= 2 ? 'happy' : t <= -2 ? 'annoyed' : 'neutral',
    speech: null,
    shut: shop.open === false,
    music: typeof shop.music === 'string' ? shop.music : null,
    done: false,
  };
  const visited = Object.values(s.bought).some((n) => n > 0) || whole(ctx.visits) > 0; // a regular gets the keeper's `back` line when the record has one
  s.speech = s.shut ? lineSpeech(s, 'shut') || textSpeech(s, shop.reason) : (visited && lineSpeech(s, 'back')) || lineSpeech(s, 'open');
  if (s.speech?.kind === 'line') s.mood = faceFor(s.speech.emotion, s.mood); // the first face matches the first line
  return s;
}

// --- words ---
function pickEntry(s, key) {
  let e = s.shop.lines?.[key];
  if (Array.isArray(e)) e = e.length ? e[Math.floor(rand01(hashSeed(s.seed, 'line', key)) * e.length)] : null;
  return isObj(e) ? e : null;
}
function lineSpeech(s, key) {
  const e = pickEntry(s, key);
  if (!e) return null;
  const known = e.line ? s.lineTable[e.line] : null;
  const text = e.text ?? known?.text;
  if (!text) return null;
  return { kind: 'line', key, lineId: e.line || null, who: s.keeper.name || s.shop.name || '', text, emotion: e.emotion ?? known?.emotion ?? 'neutral', direction: e.direction ?? known?.direction ?? '', draft: Boolean(e.draft) };
}
const textSpeech = (s, text) => (text ? { kind: 'line', key: 'shut', lineId: null, who: s.keeper.name || '', text: String(text), emotion: 'neutral', direction: '', draft: false } : null);
const itemName = (s, id) => s.items[id]?.name || cap1(String(id).replace(/-/g, ' '));
const iconOf = (s, id) => s.items[id]?.icon || null;

/** The twelve emotions a line can carry, mapped onto the three portraits. The flat ones (neutral, dry, deadpan, sly) leave the face to what you just did. */
export const EMOTION_FACE = Object.freeze({ neutral: 'neutral', dry: 'neutral', deadpan: 'neutral', sly: 'neutral', warm: 'happy', excited: 'happy', proud: 'happy', playful: 'happy', tender: 'happy', grumpy: 'annoyed', worried: 'annoyed', menacing: 'annoyed' });
/** The face for a line: a strong emotion decides; a flat one defers to `natural` (what the action means for the keeper). */
export function faceFor(emotion, natural = 'neutral') {
  const f = EMOTION_FACE[emotion] || 'neutral';
  return f !== 'neutral' ? f : natural;
}
/** Every action ends here: it plays its own line (or a plain note), or it closes the bubble. The face follows the line, never an older one. */
function react(s, ev, speech, natural = 'neutral') {
  s.speech = speech || null;
  ev.push({ type: 'say', speech: s.speech });
  if (speech?.kind === 'line' && speech.lineId) ev.push({ type: 'sound', id: `line:${speech.lineId}` });
  setMood(s, ev, speech?.kind === 'line' ? faceFor(speech.emotion, natural) : natural);
}
function setMood(s, ev, mood) {
  if (s.mood !== mood) { s.mood = mood; ev.push({ type: 'mood', mood }); }
}

// --- prices ---
/** The shop's own discounts that apply to this captain: [{ off, why }]. */
export function discountsOf(s) {
  const out = [];
  for (const d of Array.isArray(s.shop.discounts) ? s.shop.discounts : []) {
    if (!isObj(d)) continue;
    const on = isObj(d.boon) ? (s.save.stats[d.boon.stat] || 0) >= whole(d.boon.at) : meets(s.save, d.requires || {}, { names: s.names, items: s.items });
    if (on && whole(d.off) > 0) out.push({ off: whole(d.off), why: String(d.why || '') });
  }
  return out;
}
const offPct = (s) => Math.min(DISCOUNT_CAP, discountsOf(s).reduce((n, d) => n + d.off, 0));
const listPrice = (e) => Math.max(0, whole(e?.price?.money));
const unitPrice = (s, e) => Math.max(0, Math.round(listPrice(e) * (1 - offPct(s) / 100)));
const entryOf = (s, id) => s.stock.find((e) => e.item === id) || null;

// --- stock ---
const inBasket = (s, id) => s.basket[id] || 0;
/** Purchases still on the shelf (Infinity with no limit), after what you bought before and what is on the counter. */
function remaining(s, e) {
  if (e.limit === undefined || e.limit === null) return Infinity;
  return Math.max(0, whole(e.limit) - (s.bought[e.item] || 0) - inBasket(s, e.item));
}
function carryRoom(s, e) {
  const max = s.items[e.item]?.max;
  if (!Number.isFinite(max)) return Infinity;
  return max - (s.save.items[e.item] || 0) - inBasket(s, e.item) * Math.max(1, whole(e.qty) || 1);
}
const qtyOf = (e) => Math.max(1, whole(e.qty) || 1);
const lockedBy = (s, e) => missing(s.save, e.requires || {}, { names: s.names, items: s.items });

/** Why an item can't be lifted onto the counter now ('' when it can). */
function liftBlock(s, e) {
  if (lockedBy(s, e).length) return 'locked';
  if (remaining(s, e) <= 0) return 'gone';
  if (carryRoom(s, e) < qtyOf(e)) return 'full';
  return '';
}

export function valuationWord(price, value, per = 1) {
  if (!(value > 0) || !(per > 0)) return null;
  const r = price / (value * per);
  return r <= 0.8 ? 'a steal' : r <= 1.2 ? 'fair' : 'steep';
}
export function offerWord(price, value) {
  if (!(value > 0)) return null;
  const r = price / value;
  return r >= 1 ? 'generous' : r >= 0.6 ? 'fair' : 'low';
}

// --- the till ---
/** What the basket costs: { gross, off, total }. The haggle's cut covers what was on the counter when the deal was struck. */
export function totals(s) {
  let gross = 0, covered = 0;
  for (const [id, n] of entries(s.basket)) {
    const e = entryOf(s, id);
    if (!e || !n) continue;
    const u = unitPrice(s, e);
    gross += u * n;
    covered += u * Math.min(n, s.haggle.covered[id] || 0);
  }
  const off = Math.round(covered * s.haggle.pct);
  return { gross, off, total: gross - off };
}
export const basketCount = (s) => Object.values(s.basket).reduce((a, b) => a + b, 0);

// --- actions ---
const dead = (s) => s.done || s.shut;

export function lift(s, id) {
  const ev = [];
  const e = entryOf(s, id);
  if (dead(s) || !e) return ev;
  const block = liftBlock(s, e);
  if (block === 'locked') return tapLocked(s, id);
  if (block) {
    const why = block === 'gone' ? 'Sold out.' : (s.items[id]?.max === 1 ? 'You have one.' : "You can't carry more.");
    ev.push({ type: 'blocked', id, reason: why });
    react(s, ev, { kind: 'note', key: 'blocked', who: '', text: why, emotion: 'neutral', direction: '' }, 'neutral');
    return ev;
  }
  s.basket[id] = inBasket(s, id) + 1;
  ev.push({ type: 'lift', id }, { type: 'sound', id: 'lift' });
  react(s, ev, { kind: 'blurb', key: 'blurb', who: itemName(s, id), text: e.blurb || s.items[id]?.blurb || '', emotion: 'neutral', direction: '', item: id }, 'neutral');
  return ev;
}

export function putBack(s, id) {
  const ev = [];
  if (dead(s) || !inBasket(s, id)) return ev;
  s.basket[id] -= 1;
  if (s.basket[id] <= 0) delete s.basket[id];
  ev.push({ type: 'putback', id }, { type: 'sound', id: 'knock' });
  react(s, ev, null, 'neutral');
  return ev;
}

export function tapLocked(s, id) {
  const ev = [];
  const e = entryOf(s, id);
  if (dead(s) || !e) return ev;
  const why = lockedBy(s, e);
  if (!why.length) return ev;
  ev.push({ type: 'glass', id, reason: why[0] }, { type: 'sound', id: 'glass' });
  react(s, ev, lineSpeech(s, 'locked') || { kind: 'note', key: 'locked', who: '', text: why[0], emotion: 'neutral', direction: '' }, 'neutral');
  return ev;
}

/** Pay for the basket. Short of money: nothing changes but the keeper's face and the `broke` line. */
export function pay(s) {
  const ev = [];
  if (dead(s) || !basketCount(s)) return ev;
  const { total } = totals(s);
  if (total > s.save.money) {
    ev.push({ type: 'broke', need: total, have: s.save.money }, { type: 'sound', id: 'broke' });
    react(s, ev, lineSpeech(s, 'broke') || { kind: 'note', key: 'broke', who: '', text: "That's not enough.", emotion: 'neutral', direction: '' }, 'annoyed');
    return ev;
  }
  const lines = [];
  for (const [id, n] of entries(s.basket)) {
    const e = entryOf(s, id);
    const units = n * qtyOf(e);
    s.save.items[id] = (s.save.items[id] || 0) + units;
    s.bought[id] = (s.bought[id] || 0) + n;
    s.visit.bought[id] = (s.visit.bought[id] || 0) + n;
    s.visit.units[id] = (s.visit.units[id] || 0) + units;
    for (const [giver, r] of entries(e.rep)) s.visit.rep[giver] = (s.visit.rep[giver] || 0) + whole(r) * n;
    lines.push({ id, n, units });
  }
  s.save.money -= total;
  s.visit.spent += total;
  s.basket = {};
  s.haggle.covered = {};
  s.haggle.stamped = false; // the deal is done: the stamp goes with the pile
  ev.push({ type: 'pay', total, lines }, { type: 'sound', id: 'coins' }, { type: 'sound', id: 'till' });
  react(s, ev, lineSpeech(s, 'buy'), 'happy');
  return ev;
}

// --- the haggle: asked once per visit, through the host's ctx.play ---
export function canHaggle(s) {
  return s.haggleReady && !s.quick && !s.shut && !s.done && !s.haggle.used && basketCount(s) > 0;
}
/** The overrides for `ctx.play('haggle', ...)`: they ask the basket's total, and a great deal is a fifth off. */
export function haggleRequest(s) {
  const { total } = totals(s);
  return { open: total, best: Math.round(total * (1 - HAGGLE_OFF.well)), points: { barter: s.points.barter, haggle: s.points.barter }, tier: s.tier, seed: hashSeed(s.seed, 'haggle', s.shopId, total) };
}
/** Takes the haggle game's result. Nothing said (closed without playing) leaves the control where it was. */
export function applyHaggle(s, result) {
  const ev = [];
  if (!canHaggle(s) || !isObj(result) || result.left) return ev;
  let outcome = result.outcome;
  if (!(outcome in HAGGLE_OFF)) outcome = result.success ? 'well' : 'walked';
  s.haggle = { used: true, outcome, pct: HAGGLE_OFF[outcome], covered: { ...s.basket }, stamped: true };
  ev.push({ type: 'haggle', outcome, pct: s.haggle.pct }, { type: 'sound', id: 'stamp' });
  react(s, ev, lineSpeech(s, `haggle-${outcome}`), outcome === 'well' ? 'happy' : outcome === 'walked' ? 'annoyed' : 'neutral'); // no line in the record: the stamp and the face, no bubble
  return ev;
}

// --- your goods ---
/** What the keeper buys that you are carrying: [{ id, name, icon, have, price, word }]. */
export function trayOf(s) {
  return s.buys.filter((b) => (s.save.items[b.item] || 0) > 0).map((b) => {
    const price = Math.max(0, whole(b.money));
    return { id: b.item, name: itemName(s, b.item), icon: iconOf(s, b.item), have: s.save.items[b.item], price, word: s.points.valuation >= 1 ? offerWord(price, s.items[b.item]?.value) : null };
  });
}
const canSell = (s) => !s.shut && !s.done && !s.quick;

export function offer(s, id) {
  const ev = [];
  if (!canSell(s)) return ev;
  const item = trayOf(s).find((t) => t.id === id);
  if (!item) return ev;
  if (s.offerId === id) return cancelOffer(s);
  s.offerId = id;
  ev.push({ type: 'offer', id, price: item.price }, { type: 'sound', id: 'knock' });
  react(s, ev, null, 'neutral'); // the price is on the tag; an old line must not stay up
  return ev;
}
export function cancelOffer(s) {
  const ev = [];
  if (s.offerId) { ev.push({ type: 'offer-cancel', id: s.offerId }); s.offerId = null; react(s, ev, null, 'neutral'); }
  return ev;
}
/** The keeper takes one of the offered item and pays what their record says. */
export function sellOne(s) {
  const ev = [];
  if (!canSell(s) || !s.offerId) return ev;
  const item = trayOf(s).find((t) => t.id === s.offerId);
  if (!item) { s.offerId = null; return ev; }
  s.save.items[item.id] -= 1;
  if (s.save.items[item.id] <= 0) delete s.save.items[item.id];
  s.save.money += item.price;
  s.visit.sold[item.id] = (s.visit.sold[item.id] || 0) + 1;
  s.visit.earned += item.price;
  ev.push({ type: 'sell', id: item.id, price: item.price }, { type: 'sound', id: 'coins' });
  if (!s.save.items[item.id]) s.offerId = null;
  react(s, ev, lineSpeech(s, 'sell'), 'happy');
  return ev;
}

// --- what the view draws ---
export function view(s) {
  const t = totals(s);
  const mood = s.mood;
  const portrait = s.keeper.portrait || {};
  const shelves = s.stock.map((e) => {
    const rem = remaining(s, e);
    const block = liftBlock(s, e);
    const locked = lockedBy(s, e);
    const unit = unitPrice(s, e);
    const lp = listPrice(e);
    const n = inBasket(s, e.item);
    const finite = Number.isFinite(rem);
    const j = hashSeed(s.seed, 'jit', e.item);
    return {
      id: e.item, name: itemName(s, e.item), icon: iconOf(s, e.item), kind: s.items[e.item]?.kind || 'part', blurb: e.blurb || s.items[e.item]?.blurb || '',
      price: unit, was: unit < lp ? lp : null, per: qtyOf(e) > 1 ? qtyOf(e) : null,
      shown: finite ? Math.min(rem, SHELF_SHOW) : SHELF_SHOW, last: finite && rem === 1,
      gone: finite && rem === 0 && n === 0, onCounter: finite && rem === 0 && n > 0,
      locked: locked.length > 0, lockReason: locked[0] || '', note: !locked.length && block === 'full' ? (s.items[e.item]?.max === 1 ? 'you have one' : 'bag is full') : '',
      inBasket: n, canLift: block === '',
      word: s.points.valuation >= 1 ? valuationWord(unit, s.items[e.item]?.value, qtyOf(e)) : null,
      rep: isObj(e.rep) ? e.rep : null, note2: e.note || '',
      lean: (rand01(j) - 0.5) * 5, shift: Math.round((rand01(j ^ 0x9e3779b1) - 0.5) * 8),
    };
  });
  const board = {
    discounts: discountsOf(s).map((d) => d.why).filter(Boolean),
    short: s.points.market >= 1
      ? s.buys.slice(0, 2 + s.points.market).map((b) => ({ id: b.item, name: itemName(s, b.item), icon: iconOf(s, b.item), have: (s.save.items[b.item] || 0) > 0 }))
      : [],
  };
  return {
    open: !s.shut,
    shut: s.shut ? { speech: s.speech, who: s.keeper.name || s.shop.name || '' } : null,
    shop: { name: s.shop.name || '', blurb: s.shop.blurb || '', music: s.music },
    keeper: { name: s.keeper.name || '', mood, portrait: portrait[mood] || portrait.neutral || null, portraits: portrait },
    speech: s.speech,
    shelves, board,
    purse: { money: s.save.money },
    till: { gross: t.gross, off: t.off, total: t.total, haggled: s.haggle.used && t.off > 0 },
    basket: entries(s.basket).map(([id, n]) => ({ id, name: itemName(s, id), icon: iconOf(s, id), kind: s.items[id]?.kind || 'part', n })),
    canPay: !dead(s) && basketCount(s) > 0,
    short: t.total > s.save.money,
    haggle: { available: canHaggle(s), used: s.haggle.used, outcome: s.haggle.outcome, stamp: s.haggle.stamped ? s.haggle.outcome : null },
    tray: canSell(s) ? trayOf(s) : [],
    offer: s.offerId ? trayOf(s).find((x) => x.id === s.offerId) || null : null,
    quick: s.quick,
    items: Object.fromEntries(Object.keys(s.items).map((id) => [id, { kind: s.items[id]?.kind || 'part' }])),
  };
}

// --- the result ---
export function finish(s, extra = {}) {
  s.done = true;
  const v = s.visit;
  const items = {};
  for (const [id, n] of entries(v.units)) items[id] = (items[id] || 0) + n;
  for (const [id, n] of entries(v.sold)) items[id] = (items[id] || 0) - n;
  for (const id of Object.keys(items)) if (!items[id]) delete items[id];
  const world = { moneyDelta: v.earned - v.spent };
  if (Object.keys(v.rep).some((k) => v.rep[k])) world.rep = Object.fromEntries(entries(v.rep).filter(([, n]) => n));
  if (Object.keys(v.bought).length) world.shops = { [s.shopId]: { bought: { ...v.bought } } };
  const traded = Object.keys(v.bought).length > 0 || Object.keys(v.sold).length > 0;
  const effects = { world };
  if (Object.keys(items).length) effects.items = items;
  return {
    done: true, success: traded, grade: traded ? 100 : 0, effects,
    bought: { ...v.bought }, sold: { ...v.sold }, spent: v.spent, earned: v.earned,
    haggle: { used: s.haggle.used, outcome: s.haggle.outcome },
    ...extra,
  };
}

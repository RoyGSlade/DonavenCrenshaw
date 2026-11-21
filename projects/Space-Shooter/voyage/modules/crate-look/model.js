// Crate look: the rules. Pure: seeded, no DOM, no clock, no unseeded random. A crate, its items and your bag all come in as
// records in `context` (see README.md); nothing about any crate or item is written here.
//
//   createLook({ seed, tier, points, level, quick, context }) -> state
//   view(state)         -> everything the view draws (the only thing the view reads)
//   openLid / shutLid / take / takeAll / putIn / chalk / tapLid  -> each returns a list of events for the view to animate and sound
//   finish(state, extra) -> the result for the host (effects.items, effects.world.crates[id] ...)
//
// The state is a plain mutable object; an action changes it and returns events. Same seed and same actions, same crate.

// --- seeded random (the game's own mulberry32 and FNV-1a, copied: a module never imports the game) ---
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  const text = parts.map((p) => String(p)).join('|');
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function rand01(seedInt) {
  let t = (seedInt + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const roll = (seed, ...parts) => rand01(hashSeed(seed, ...parts));

export const PATHS = Object.freeze(['awareness', 'inspection', 'trace']);
export const TAGS = Object.freeze(['none', 'keep', 'sell', 'scrap']);
export const KINDS = Object.freeze(['wood', 'steel', 'cold']);
/** The most copies of one thing drawn in a pile. Up to this many you can count them by eye. */
export const PILE_SHOW = 10;
export const DEFAULT_CAPACITY = 12;
export const SOUND_IDS = Object.freeze(['latch', 'creak', 'thud', 'straw', 'clink', 'thunk', 'chalk', 'deny', 'dig', 'slip', 'rattle']);

const whole = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const cap1 = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
const NUM_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export const numWord = (n) => (n >= 0 && n <= 9 ? NUM_WORD[n] : 'plenty of');

/** Path points: whole numbers 0..9, never more than `level` in all (spent in path order). */
export function cleanPoints(points, level = 9) {
  const src = isObj(points) ? points : {};
  const out = {};
  let left = Math.max(0, Math.min(9, whole(level)));
  for (const p of PATHS) {
    const n = Math.max(0, Math.min(9, whole(src[p])));
    out[p] = Math.min(n, left);
    left -= out[p];
  }
  return out;
}

const cleanTier = (t) => Math.max(-2, Math.min(2, whole(t)));
const qtyOf = (v) => Math.max(0, Math.min(999, whole(v)));
const idOf = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** A record's contents, cleaned: merged by item and hidden-ness, odd entries dropped. */
function cleanLines(list) {
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (!isObj(e)) continue;
    const item = idOf(e.item);
    const qty = qtyOf(e.qty);
    if (!item || !qty) continue;
    const hidden = e.hidden === true;
    const have = out.find((l) => l.item === item && l.hidden === hidden);
    if (have) have.qty = Math.min(999, have.qty + qty); else out.push({ item, qty, hidden });
  }
  return out;
}
function cleanSlip(list) {
  if (!Array.isArray(list)) return null;
  const lines = cleanLines(list).map(({ item, qty }) => ({ item, qty }));
  return lines.length ? lines : null;
}
function cleanItems(items) {
  const out = {};
  for (const [id, it] of Object.entries(isObj(items) ? items : {})) {
    if (!isObj(it)) continue;
    out[id] = {
      name: typeof it.name === 'string' && it.name.trim() ? it.name.trim() : '',
      icon: typeof it.icon === 'string' && it.icon ? it.icon : '',
      blurb: typeof it.blurb === 'string' ? it.blurb : '',
      glyph: typeof it.glyph === 'string' ? it.glyph : '',
      kind: typeof it.kind === 'string' ? it.kind : '',
    };
  }
  return out;
}
function cleanBag(items) {
  const out = {};
  for (const [id, n] of Object.entries(isObj(items) ? items : {})) { const q = qtyOf(n); if (q) out[id] = q; }
  return out;
}

const sum = (lines) => lines.reduce((a, l) => a + l.qty, 0);
const bagTotal = (bag) => Object.values(bag).reduce((a, n) => a + n, 0);

export function createLook({ seed = 1, tier = 0, points, level = 9, quick = false, context } = {}) {
  const ctx = isObj(context) ? context : {};
  const c = isObj(ctx.crate) ? ctx.crate : {};
  const sd = whole(seed) || 1;
  const t = cleanTier(tier);
  const pts = cleanPoints(points, level);
  const lines = cleanLines(c.contents);
  const items = cleanItems(ctx.items);
  const save = isObj(ctx.save) ? ctx.save : {};
  const bag = cleanBag(save.items);
  const slip = cleanSlip(c.slip);
  const visible0 = lines.filter((l) => !l.hidden);
  const vTotal0 = sum(visible0);
  const total0 = sum(lines);
  const cap = whole(c.capacity) > 0 ? whole(c.capacity) : Math.max(total0, DEFAULT_CAPACITY);
  const bagCap = whole(save.capacity) > 0 ? whole(save.capacity) : Infinity;
  const kind = KINDS.includes(c.kind) ? c.kind : 'wood';
  const sealed = c.sealed === true;
  const id = idOf(c.id) || 'crate';

  // A hidden thing is dug out once `depth` units have been taken from the pile on top of it. A pile with nothing on top is open at once.
  for (const l of lines) {
    l.depth = l.hidden ? (vTotal0 ? Math.max(0, Math.min(vTotal0, 1 + Math.floor(roll(sd, 'depth', l.item) * 3) - t)) : 0) : 0;
    l.found = false;
  }
  // A Rough roll smudges slip lines; a Steady or better one leaves them clean. Inspection reads them anyway.
  const smudged = new Set();
  if (slip && t < 0) {
    const order = slip.map((_, i) => i).sort((a, b) => roll(sd, 'smudge', a) - roll(sd, 'smudge', b));
    for (const i of order.slice(0, Math.min(-t, slip.length))) smudged.add(i);
  }
  const traces = (Array.isArray(c.traces) ? c.traces : []).filter((s) => typeof s === 'string' && s.trim());
  const origin = typeof c.origin === 'string' && c.origin.trim() ? c.origin.trim() : '';
  const traceLine = !origin && pts.trace >= 1 && traces.length ? traces[Math.floor(roll(sd, 'trace') * traces.length)] : '';
  const tag = TAGS.includes(c.tag) ? c.tag : 'none';

  const state = {
    seed: sd, tier: t, points: pts, quick: Boolean(quick), id,
    label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : 'Crate',
    owner: typeof c.owner === 'string' ? c.owner.trim() : '',
    kind, sealed,
    reason: typeof c.reason === 'string' && c.reason.trim() ? c.reason.trim() : 'Sealed. It is not yours to open.',
    capacity: cap, bagCap,
    items, lines, order: lines.map((l) => keyOf(l)),
    initial: lines.map((l) => ({ item: l.item, qty: l.qty, hidden: l.hidden })),
    slip, smudged, origin: origin || traceLine, originFrom: origin ? 'record' : traceLine ? 'trace' : '',
    bag, bagInit: { ...bag },
    lid: 'shut', opened: false, tag, tagInit: tag,
    took: {}, put: {}, removed: 0, changed: false,
    dress: dressing(sd),
    say: '', moves: 0,
  };
  if (state.quick && !sealed) { state.lid = 'open'; state.opened = true; state.say = openLine(state); } else state.say = sealed ? '' : 'Shut tight. Lift the lid.';
  return state;
}

function keyOf(l) { return `${l.item}${l.hidden ? '#h' : ''}`; }
const nameOf = (state, id) => state.items[id]?.name || id;

/** What an empty crate has in it, by seed: a cobweb, a dropped bolt, a boot print, loose straw. */
function dressing(seed) {
  const kinds = ['cobweb', 'bolt', 'bootprint', 'strawclump'];
  const order = kinds.map((k, i) => [k, roll(seed, 'dress', i)]).sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  const n = 1 + Math.floor(roll(seed, 'dress-n') * 3);
  return order.slice(0, n).map((k, i) => ({ kind: k, x: 0.12 + 0.76 * roll(seed, 'dx', k), y: 0.2 + 0.6 * roll(seed, 'dy', k), rot: Math.round(roll(seed, 'dr', k) * 360), corner: Math.floor(roll(seed, 'dc', i) * 4) }));
}

const EMPTY_LINES = ['Empty. Straw and dust.', 'Nothing in it but straw.', 'Empty. Somebody was here first.', 'Just straw. Not a thing in it.'];
function openLine(state) {
  if (!visibleUnits(state) && !state.lines.some((l) => l.hidden && statusOf(state, l) !== 'buried')) return EMPTY_LINES[Math.floor(roll(state.seed, 'empty-line') * EMPTY_LINES.length)];
  return state.quick ? 'Look and take.' : 'Lid off. Tap to take one. Hold to take all.';
}

// --- derived facts ---
export function statusOf(state, l) {
  if (!l.hidden) return 'plain';
  if (l.found) return 'found';
  return state.points.awareness >= 1 ? 'glint' : 'buried';
}
const visibleUnits = (state) => state.lines.filter((l) => !l.hidden || statusOf(state, l) !== 'buried').reduce((a, l) => a + l.qty, 0);
const crateUnits = (state) => sum(state.lines);

/** Slip against the crate as it was when it came to you: more, less, missing, and things that are not on the slip. */
export function slipCheck(state) {
  const out = { lines: [], extras: [] };
  const want = new Map();
  for (const l of state.initial) want.set(l.item, (want.get(l.item) || 0) + l.qty);
  if (!state.slip) return out;
  state.slip.forEach((s, i) => {
    const found = want.get(s.item) || 0;
    const kind = found === s.qty ? 'ok' : found === 0 ? 'missing' : found > s.qty ? 'more' : 'less';
    out.lines.push({ i, item: s.item, slip: s.qty, found, kind });
  });
  const onSlip = new Set(state.slip.map((s) => s.item));
  for (const l of state.initial) if (!onSlip.has(l.item)) out.extras.push({ item: l.item, found: l.qty, hidden: l.hidden });
  return out;
}

function fullWord(units, cap) {
  if (!units) return 'empty';
  const r = units / Math.max(1, cap);
  return r <= 0.3 ? 'nearly empty' : r <= 0.65 ? 'about half' : r <= 0.9 ? 'well stocked' : 'packed tight';
}

/** Where a thing leaves your hands: a clink for small, a thunk for heavy (by the item's kind, never by name). */
export function soundFor(item) {
  return item && ['consumable', 'key', 'part', 'data'].includes(item.kind) ? 'clink' : 'thunk';
}

/** Everything the view draws. */
export function view(state) {
  const sc = slipCheck(state);
  const insp = state.points.inspection >= 1;
  const open = state.lid === 'open';
  const units = visibleUnits(state);
  const tagged = (it) => ({ id: it, name: nameOf(state, it), icon: state.items[it]?.icon || '', glyph: state.items[it]?.glyph || '', kind: state.items[it]?.kind || '', blurb: state.items[it]?.blurb || '' });
  const stacks = open ? state.lines.filter((l) => l.qty > 0 && statusOf(state, l) !== 'buried').map((l) => {
    const slot = state.order.indexOf(keyOf(l));
    return {
      key: keyOf(l), ...tagged(l.item), qty: l.qty, shown: Math.min(l.qty, PILE_SHOW), heaped: l.qty > PILE_SHOW, slot, status: statusOf(state, l),
      notOnSlip: insp && Boolean(state.slip) && !state.slip.some((s) => s.item === l.item),
    };
  }) : [];
  const bagList = Object.entries(state.bag).filter(([, n]) => n > 0).map(([it, n]) => ({ ...tagged(it), qty: n }));
  const slipLines = state.slip ? state.slip.map((s, i) => {
    const chk = sc.lines[i];
    return { item: s.item, name: nameOf(state, s.item), qty: s.qty, smudged: state.smudged.has(i) && !insp, mark: insp && chk.kind !== 'ok' ? chk.kind : null, found: insp && chk.kind !== 'ok' ? chk.found : null };
  }) : null;
  return {
    id: state.id, label: state.label, owner: state.owner, kind: state.kind, sealed: state.sealed, reason: state.reason,
    lid: state.lid, quick: state.quick, opened: state.opened, tag: state.tag,
    fill: { ratio: Math.min(1, units / state.capacity), word: fullWord(units, state.capacity), full: crateUnits(state) >= state.capacity },
    empty: units === 0, dress: state.dress,
    slotCount: Math.max(state.order.length, 1),
    stacks, slip: slipLines, origin: state.origin ? { text: state.origin, from: state.originFrom } : null,
    bag: bagList, bagFull: bagTotal(state.bag) >= state.bagCap, bagRoom: state.bagCap === Infinity ? null : Math.max(0, state.bagCap - bagTotal(state.bag)), bagCap: state.bagCap === Infinity ? null : state.bagCap,
    canChalk: !state.sealed && !state.quick, canPut: !state.sealed && !state.quick && open, canShut: !state.sealed && !state.quick && open,
    say: state.say, paths: { ...state.points },
  };
}

// --- actions ---
const note = (state, text) => { state.say = text; return text; };
const line = (state, item, hidden) => state.lines.find((l) => l.item === item && l.hidden === Boolean(hidden) && l.qty > 0);

function dig(state) {
  // after a take: any hidden thing whose pile on top is gone shows itself
  const events = [];
  for (const l of state.lines) if (l.hidden && !l.found && l.qty > 0 && state.removed >= l.depth) { l.found = true; events.push({ type: 'found', item: l.item, key: keyOf(l) }); }
  return events;
}

/** Lift the lid (a tap, or a drag past the latch). A sealed crate does not open: it says why. */
export function openLid(state) {
  if (state.sealed) { note(state, state.reason); return [{ type: 'sealed', sound: 'rattle' }]; }
  if (state.lid === 'open') return [];
  state.lid = 'open'; state.opened = true;
  const events = [{ type: 'lid', open: true, sound: 'creak' }];
  for (const l of state.lines) if (l.hidden && !l.found && l.qty > 0 && 0 >= l.depth) { l.found = true; events.push({ type: 'found', item: l.item, key: keyOf(l) }); }
  const glint = state.lines.find((l) => l.hidden && !l.found && statusOf(state, l) === 'glint');
  note(state, openLine(state));
  if (glint) state.say += ' Something glints in the straw.';
  return events;
}
export const tapLid = openLid;

export function shutLid(state) {
  if (state.sealed || state.quick || state.lid !== 'open') return [];
  state.lid = 'shut';
  note(state, 'Lid shut.');
  return [{ type: 'lid', open: false, sound: 'thud' }];
}

function moveOne(state, l, n) {
  // n units from the crate line l to your bag; returns how many went
  const room = state.bagCap === Infinity ? n : Math.max(0, state.bagCap - bagTotal(state.bag));
  const go = Math.min(n, l.qty, room);
  if (go <= 0) return 0;
  l.qty -= go;
  state.bag[l.item] = (state.bag[l.item] || 0) + go;
  state.took[l.item] = (state.took[l.item] || 0) + go;
  if (!l.hidden) state.removed += go;
  state.changed = true; state.moves += 1;
  return go;
}

/** Take n of an item (a tap takes one). The bag's room limits it. Returns events. */
export function take(state, key, n = 1) {
  if (state.sealed || state.lid !== 'open') return [];
  const l = state.lines.find((x) => keyOf(x) === key && x.qty > 0);
  if (!l || (l.hidden && statusOf(state, l) === 'buried')) return [];
  const name = nameOf(state, l.item);
  const had = l.qty;
  const go = moveOne(state, l, Math.max(1, whole(n)));
  if (!go) { note(state, 'Your bag is full.'); return [{ type: 'bagfull', item: l.item, sound: 'deny' }]; }
  const events = [{ type: 'take', item: l.item, key, n: go, sound: soundFor(state.items[l.item]), straw: true }];
  if (l.hidden) l.found = true;
  const left = l.qty;
  events.push(...dig(state));
  const kind = go === had ? 'all' : go > 1 ? 'some' : 'one';
  if (kind === 'all') note(state, go > 1 ? `Took all ${numWord(go)} ${name}.` : `Took ${name}. That was the last.`);
  else if (kind === 'some') note(state, `Took ${numWord(go)} ${name}. ${cap1(numWord(left))} left.`);
  else note(state, `Took ${name}. ${cap1(numWord(left))} left.`);
  if (go < Math.max(1, whole(n)) && go < had) { state.say += ' Bag full.'; events.push({ type: 'bagfull', item: l.item, sound: 'deny' }); }
  const found = events.filter((e) => e.type === 'found');
  if (found.length) { state.say += ` Something was under the straw: ${nameOf(state, found[0].item)}.`; events.push({ type: 'dig', sound: 'dig' }); }
  return events;
}
export function takeAll(state, key) {
  const l = state.lines.find((x) => keyOf(x) === key && x.qty > 0);
  return l ? take(state, key, l.qty) : [];
}

/** Put one of your things into the crate. The crate's capacity limits it. */
export function putIn(state, item, n = 1) {
  if (state.sealed || state.quick || state.lid !== 'open') return [];
  const have = state.bag[item] || 0;
  if (!have) return [];
  const go = Math.min(Math.max(1, whole(n)), have, Math.max(0, state.capacity - crateUnits(state)));
  if (go <= 0) { note(state, 'The crate is full.'); return [{ type: 'cratefull', item, sound: 'deny' }]; }
  state.bag[item] = have - go; if (!state.bag[item]) delete state.bag[item];
  let l = line(state, item, false);
  if (!l) { l = { item, qty: 0, hidden: false, depth: 0, found: false }; state.lines.push(l); if (!state.order.includes(keyOf(l))) state.order.push(keyOf(l)); }
  l.qty += go;
  state.put[item] = (state.put[item] || 0) + go;
  state.changed = true; state.moves += 1;
  note(state, `Put ${nameOf(state, item)} in the crate.`);
  return [{ type: 'put', item, key: keyOf(l), n: go, sound: soundFor(state.items[item]), straw: true }];
}

/** Chalk the crate: none, keep, sell, scrap, and round again. */
export function chalk(state) {
  if (state.sealed || state.quick) return [];
  state.tag = TAGS[(TAGS.indexOf(state.tag) + 1) % TAGS.length];
  state.changed = state.changed || state.tag !== state.tagInit; state.moves += 1;
  note(state, state.tag === 'none' ? 'Chalk wiped off.' : `Chalked it: ${state.tag}.`);
  return [{ type: 'chalk', tag: state.tag, sound: 'chalk' }];
}

/** What you saw: the slip's mismatches on lines you could see, and the hidden things you found or spotted. */
export function saw(state) {
  const sc = slipCheck(state);
  if (!state.opened) return { mismatches: [], hidden: [] };
  const seen = (item, hidden) => !hidden || state.lines.some((l) => l.item === item && l.hidden && statusOf(state, l) !== 'buried');
  const mismatches = [];
  for (const m of sc.lines) if (m.kind !== 'ok') mismatches.push({ item: m.item, kind: m.kind, slip: m.slip, found: m.found });
  for (const e of sc.extras) if (seen(e.item, e.hidden)) mismatches.push({ item: e.item, kind: 'extra', slip: 0, found: e.found });
  const hidden = state.lines.filter((l) => l.hidden && statusOf(state, l) !== 'buried').map((l) => l.item);
  return { mismatches, hidden: [...new Set(hidden)] };
}

/** The result for the host. Everything moved so far; nothing the player did not do. */
export function finish(state, extra = {}) {
  const items = {};
  for (const id of new Set([...Object.keys(state.bag), ...Object.keys(state.bagInit)])) {
    const d = (state.bag[id] || 0) - (state.bagInit[id] || 0);
    if (d) items[id] = d;
  }
  const world = {};
  const moved = Object.keys(items).length > 0 || state.tag !== state.tagInit;
  if (moved) {
    world.crates = { [state.id]: { contents: state.lines.filter((l) => l.qty > 0).map((l) => (l.hidden && !l.found ? { item: l.item, qty: l.qty, hidden: true } : { item: l.item, qty: l.qty })), tag: state.tag } };
  }
  return {
    done: true, success: state.opened, grade: 100, ...extra,
    took: { ...state.took }, put: { ...state.put }, tag: state.tag, saw: saw(state),
    effects: { items, world },
  };
}

/** The sum of all units (crate plus bag): the thing that must never change. */
export function conserved(state) {
  return crateUnits(state) + bagTotal(state.bag);
}
export const crateTotal = crateUnits;
export const bagUnits = (state) => bagTotal(state.bag);

// The star base, as save data and rules. Pure: no DOM, no clock of its own, no Math.random.
//
// Claiming it (Dead Weight's "keep the hulk" ending sets the flag `starbase-claimed`) gives the save one small, versioned
// block, `save.base`. Old saves have none and load as they always did; the block is only written once the base is yours.
//
//   base: { v: 1, tier: 1, seed, slots: { <unitId>: <slot 0..3> }, holds: { <unitId>: <what it holds> }, buff?: { id, until } }
//
// `seed` comes from the captain's id, so the layout is the same on every device and never re-rolls; `slots` and `holds`
// are written down once at the claim (a later change to the layout rules cannot move your units).
import { ID } from '../character.js';

export const BASE_VERSION = 1;
export const CLAIM_FLAG = 'starbase-claimed';
export const BASE_ID = 'starbase';
export const BASE_MAPS = Object.freeze({ airlock: 'starbase-airlock', concourse: 'starbase-concourse', workshop: 'starbase-workshop', galley: 'starbase-galley' });
export const SLOT_COUNT = 4;
// Tier 1: the dock strip. The four units a concourse holds, what each one holds (its stock), and the room each opens.
export const UNITS = Object.freeze({
  bay: { id: 'bay', name: 'Fuel and repair bay', short: 'FUEL & REPAIR', holds: 'fuel-cell', shop: 'starbase-fuel', blurb: 'A fuel pump and a repair console.' },
  noodles: { id: 'noodles', name: 'Noodle stall', short: 'NOODLES', holds: 'noodle-bowl', shop: 'starbase-noodles', blurb: 'Hot bowls. A meal keeps you sharp for a while.' },
  store: { id: 'store', name: 'General store', short: 'STORE', holds: 'general', shop: 'starbase-store', blurb: 'Parts, patches and odds and ends.' },
  board: { id: 'board', name: 'Job board', short: 'JOBS', holds: 'postings', shop: null, blurb: 'Postings from the three givers.' },
});
export const UNIT_IDS = Object.freeze(Object.keys(UNITS));
// Your own rooms: not slots on the concourse, always there.
export const ROOMS = Object.freeze({ workshop: { id: 'workshop', name: 'Workshop', map: BASE_MAPS.workshop }, galley: { id: 'galley', name: 'Galley', map: BASE_MAPS.galley } });
export const MEAL = Object.freeze({ id: 'fed', item: 'noodle-bowl', minutes: 10, name: 'Fed' });

/** 32-bit hash of a string (FNV-1a). Same text, same number, everywhere. */
export function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** A seeded generator in [0, 1) (mulberry32). */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The seed for a save: from the captain's id (stable for life), else a fixed one. */
export const seedFor = (save) => hashSeed(`starbase:${save?.character?.id || 'c-unknown'}`) || 1;

/**
 * Which slot each unit takes: a seeded shuffle of 0..SLOT_COUNT-1. Pure: the same seed gives the same layout.
 * Returns { slots: { unitId: slot }, holds: { unitId: what } }.
 */
export function layoutFor(seed) {
  const next = rng(seed);
  const order = [...Array(SLOT_COUNT).keys()];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const slots = {}, holds = {};
  UNIT_IDS.forEach((id, i) => { slots[id] = order[i]; holds[id] = UNITS[id].holds; });
  return { slots, holds };
}

/** An empty-but-valid new base for a seed. */
export function newBase(seed) {
  const { slots, holds } = layoutFor(seed);
  return { v: BASE_VERSION, tier: 1, seed: seed >>> 0, slots, holds };
}

const int = (v, lo, hi, fb) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.trunc(v))) : fb);

/** Any value -> a valid base block, or null when there is none (an old save). Repairs what it can, never throws. */
export function cleanBase(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const seed = int(input.seed, 1, 0xffffffff, 1);
  const fresh = newBase(seed);
  const slots = {}, holds = {};
  const taken = new Set();
  for (const id of UNIT_IDS) {
    const s = input.slots?.[id];
    if (Number.isInteger(s) && s >= 0 && s < SLOT_COUNT && !taken.has(s)) { slots[id] = s; taken.add(s); }
  }
  // A damaged layout falls back to the seed's own, as a whole (half a layout would put two units in one place).
  const layout = Object.keys(slots).length === UNIT_IDS.length ? slots : fresh.slots;
  for (const id of UNIT_IDS) holds[id] = typeof input.holds?.[id] === 'string' && ID.test(input.holds[id]) ? input.holds[id] : UNITS[id].holds;
  const out = { v: BASE_VERSION, tier: int(input.tier, 1, 3, 1), seed, slots: layout, holds };
  const b = input.buff;
  if (b && typeof b === 'object' && b.id === MEAL.id && Number.isFinite(b.until) && b.until > 0) out.buff = { id: MEAL.id, until: Math.trunc(b.until) };
  return out;
}

export const hasBase = (save) => Boolean(save?.base);
export const isClaimed = (save) => (save?.flags?.[CLAIM_FLAG] || 0) > 0 || hasBase(save);

/** The save with its base made, when the claim flag is set and there is none yet. Same save otherwise. */
export function claimBase(save) {
  if (!save || save.base || !((save.flags?.[CLAIM_FLAG] || 0) > 0)) return save;
  return { ...save, base: newBase(seedFor(save)) };
}

/** What a meal does, and for how long. The buff is a timestamp (ms): `until`. */
export function eatMeal(save, now) {
  if (!save?.base) return { ok: false, save, reason: 'You have no base to eat at.' };
  if ((save.items?.[MEAL.item] || 0) < 1) return { ok: false, save, reason: 'No noodle bowl in your kit.' };
  const items = { ...save.items, [MEAL.item]: save.items[MEAL.item] - 1 };
  if (!items[MEAL.item]) delete items[MEAL.item];
  const until = Math.trunc(now) + MEAL.minutes * 60000;
  return { ok: true, save: { ...save, items, base: { ...save.base, buff: { id: MEAL.id, until } } }, until };
}
/** Minutes of buff left (0 when none or run out). */
export const buffMinutes = (save, now) => Math.max(0, Math.ceil(((save?.base?.buff?.until || 0) - now) / 60000));
/** The bonus a meal adds to a d20 roll while it lasts (+1). Rules read it; the quest engine does not yet (see HANDOFF). */
export const buffBonus = (save, now) => (buffMinutes(save, now) > 0 ? 1 : 0);

/** The units of a base in concourse order (slot 0 first): [{ ...unit, slot, holds }]. */
export function unitsOf(base) {
  return UNIT_IDS.map((id) => ({ ...UNITS[id], slot: base.slots[id], holds: base.holds[id] })).sort((a, b) => a.slot - b.slot);
}

// The seat table of a crew session (launch tech lane, outcome 3; design doc
// Section 9): up to four seats, the host in seat 0. Friends join by link or
// room code; the host hires AI crew into empty seats. AI crew are low skill,
// make mistakes, and are paid per job (10/15/25% of its value by tier). A
// player joining mid-mission takes over the lowest AI seat; the AI is paid for
// the checkpoints it worked. Pure: no DOM, no clock; randomness comes from the
// job's seeded roller, so a replay plays the same.
import { ROLL_SKILL_IDS, AI_CREW } from '../data.js';
import { CREW_SEATS } from './protocol.js';

export const AI_NAMES = Object.freeze(['Rook', 'Tansy', 'Old Moss', 'Dibs', 'Kettle', 'Vesper']);
const tierOf = (t) => Math.min(3, Math.max(1, Math.trunc(Number(t)) || 1));

/** The tier table in use: the hub's when it sent one, else data.js AI_CREW. */
export function aiTiers(override = null) {
  const base = AI_CREW;
  if (!override || typeof override !== 'object') return base;
  const out = {};
  for (const t of [1, 2, 3]) {
    const o = override[t] || override[String(t)];
    out[t] = { ...base[t], ...(o && typeof o === 'object' ? o : {}) };
  }
  return out;
}

/** An AI crewmate's card: every skill at the tier's level, never more. */
export function aiCard(tier, { name = null, tiers = AI_CREW } = {}) {
  const t = tierOf(tier);
  const level = Math.min(t, tiers[t]?.level ?? t);
  return {
    name: name || AI_NAMES[t - 1],
    ai: true,
    tier: t,
    stats: { str: 3, con: 3, dex: 3, wis: 3, cha: 3 },
    skills: {},
    levels: Object.fromEntries(ROLL_SKILL_IDS.map((id) => [id, level])),
  };
}

/** A new table: the host in seat 0, the rest open. size 1..4. */
export function createSeats({ size = CREW_SEATS, host = null } = {}) {
  const n = Math.min(CREW_SEATS, Math.max(1, Math.trunc(size) || CREW_SEATS));
  return Array.from({ length: n }, (_, seat) => (seat === 0 ? { seat, kind: 'host', card: host, from: 0 } : { seat, kind: 'open', card: null }));
}

/** Fills every open seat with AI crew of one tier (the host hires them). */
export function fillWithAi(table, { tier = 1, tiers = AI_CREW, from = 0 } = {}) {
  let n = 0;
  return table.map((s) => (s.kind === 'open' ? { seat: s.seat, kind: 'ai', tier: tierOf(tier), card: aiCard(tier, { name: AI_NAMES[(n++ + tierOf(tier) - 1) % AI_NAMES.length], tiers }), from } : s));
}

/** Hires one AI into the lowest open seat; the same table when none is open. */
export function hire(table, { tier = 1, tiers = AI_CREW, from = 0 } = {}) {
  const at = table.findIndex((s) => s.kind === 'open');
  if (at < 0) return table;
  const used = new Set(table.filter((s) => s.kind === 'ai').map((s) => s.card?.name));
  const name = AI_NAMES.find((x) => !used.has(x)) || AI_NAMES[0];
  return table.map((s, i) => (i === at ? { seat: s.seat, kind: 'ai', tier: tierOf(tier), card: aiCard(tier, { name, tiers }), from } : s));
}

/** Lets an AI go (or a human seat leaves): the seat opens. */
export function release(table, seat) {
  return table.map((s) => (s.seat === seat && s.kind !== 'host' ? { seat: s.seat, kind: 'open', card: null } : s));
}

/**
 * A player comes aboard: they take the lowest AI seat (mid-mission), else the
 * lowest open seat. Returns { table, seat, replaced } (seat null when full;
 * replaced: the AI seat entry they took over, with `to` set, for its wage).
 */
export function join(table, card, { at = 0 } = {}) {
  let i = table.findIndex((s) => s.kind === 'ai');
  if (i < 0) i = table.findIndex((s) => s.kind === 'open');
  if (i < 0) return { table, seat: null, replaced: null };
  const replaced = table[i].kind === 'ai' ? { ...table[i], to: at } : null;
  const next = table.map((s, k) => (k === i ? { seat: s.seat, kind: 'human', card, from: at } : s));
  return { table: next, seat: table[i].seat, replaced };
}

/** Every seat that is crew (not the host and not open), for the engine and the roster. */
export const crewSeats = (table) => table.filter((s) => s.kind === 'ai' || s.kind === 'human');

/**
 * An AI seat's turn: one of the options it can take, and whether it fumbles.
 * Mistakes run at the tier's rate (30/20/10%). rng: the job's seeded roller.
 */
export function aiAct(seat, options = [], rng = Math.random, tiers = AI_CREW) {
  const t = tierOf(seat?.tier);
  const action = options.length ? options[Math.min(options.length - 1, Math.floor(rng() * options.length))] : null;
  const mistake = rng() < (tiers[t]?.mistake ?? 0.3);
  return { action, mistake, tier: t };
}

/**
 * AI wages for a job worth `value`: by seat, the tier's share of the value,
 * scaled by the share of the job's checkpoints the AI worked ([from, to)).
 * Returns { seat: credits }. The hub settles the real money; this is the
 * page's preview and the same rule.
 */
export function wageShare(table, value, { checkpoints = 1, tiers = AI_CREW } = {}) {
  const total = Math.max(1, Math.trunc(checkpoints) || 1);
  const out = {};
  table.forEach((s, i) => {
    if (s.kind !== 'ai') return;
    const worked = Math.max(0, Math.min(total, s.to ?? total) - Math.max(0, s.from ?? 0));
    out[s.seat ?? i] = Math.round(Math.max(0, value) * (tiers[tierOf(s.tier)]?.wage ?? 0) * (worked / total));
  });
  return out;
}

/** The host quit: the session ends, and progress is kept at the last checkpoint. */
export function hostLeft({ checkpoint = null } = {}) {
  return { ended: 'host-left', resumeAt: checkpoint };
}

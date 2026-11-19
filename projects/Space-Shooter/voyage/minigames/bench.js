// Daily bench board (a phone check-in toy): one repair board a game day, the same for every account
// (the seed is the day number), always Steady with no points so the board is fair. Everyone may try as
// often as they like; the crew's board keeps each person's best: a sealed patch ranks by fewest turns,
// then by time. Pure; the server (or the dev page) owns where the entries live.
import { hashSeed } from '../quests/rng.js';
import { createRepair } from './repair.js';

export const DAY_MS = 86400000;
export const BENCH_SETUP = Object.freeze({ size: 5, seconds: 50, qualityBonus: 0 });

/** The game day number for a time in milliseconds (UTC days since 1970-01-01). */
export const dayNumber = (ms) => Math.floor(ms / DAY_MS);
/** The repair seed for a day. */
export const benchSeed = (day) => hashSeed('bench', Math.trunc(day));
/** A fresh pure repair state for the day's board. */
export const benchBoard = (day) => createRepair({ seed: benchSeed(day), ...BENCH_SETUP });

/** Turns over par, as a plain phrase: "par", "2 over par", "1 under par" (a lucky board can beat par). */
export function overPar(moves, par) {
  const d = moves - par;
  return d === 0 ? 'par' : d > 0 ? `${d} over par` : `${-d} under par`;
}

/** A new crew board for a day. */
export const createBench = (day) => ({ day: Math.trunc(day), par: benchBoard(day).par, entries: [] });

/** Better first: fewer turns, then less time. Only sealed patches are ranked. */
const better = (a, b) => a.moves - b.moves || a.time - b.time;

/**
 * Record an attempt ({ name, success, moves, time }). Failures are ignored; a person keeps their best.
 * Returns { rank, best, improved } (rank is 1-based on the crew board) or null when it was not a sealed patch.
 */
export function submit(bench, { name, success, moves, time }) {
  if (!success || !name) return null;
  const at = bench.entries.findIndex((e) => e.name === name);
  const entry = { name, moves, time };
  let improved = false;
  if (at < 0) { bench.entries.push(entry); improved = true; }
  else if (better(entry, bench.entries[at]) < 0) { bench.entries[at] = entry; improved = true; }
  bench.entries.sort((a, b) => better(a, b) || a.name.localeCompare(b.name));
  const rank = bench.entries.findIndex((e) => e.name === name) + 1;
  return { rank, best: bench.entries[rank - 1], improved };
}

/** The crew's best so far, or null. */
export const crewBest = (bench) => bench.entries[0] || null;
/** One plain line about where a person stands. */
export function standing(bench, name) {
  const i = bench.entries.findIndex((e) => e.name === name);
  if (i < 0) return `Par is ${bench.par} turns. You have not sealed today's board yet.`;
  const e = bench.entries[i];
  return `You are ${i + 1} of ${bench.entries.length} with ${e.moves} turns (${overPar(e.moves, bench.par)}).`;
}

// Quest races and the practice circuit: the pure rules both pages share.
//
// The new game launches a race on today's racing page (../index.html) with a
// one-use ticket: `?questrace=<token>`. The ticket itself (what to fly) waits
// in this tab's sessionStorage, so a link alone flies nothing. The racing page
// reads the new game's save for the race leg and the upgraded ship, flies it
// in "quest race" mode (systems/questRace.js: no board, no ghost, no personal
// best, no weekly entry) and hands the time back: by postMessage when it runs
// in the hangar's race frame, or by a return link when it was opened on its own.
// The quest engine takes it as { type: 'live', timeMs, finished }.
//
// No DOM; storage and randomness are handed in, so node tests run it.
import { TRACKS } from '../quests/data/tracks.js';
import { raceStats } from '../upgrades.js';
import { CIRCUITS } from './data.js';

export const QUEST_RACE = Object.freeze({
  query: 'questrace',            // ?questrace=<token> on the racing page
  embed: 'embed',                // &embed=1: running inside the hangar's race frame
  ticketKey: 'stardust.questrace.ticket',
  message: 'stardust:questrace', // postMessage type, racing page -> hangar
  time: 'qrt',                   // return link: ?questrace=<token>&qrt=<ms>&qrf=1|0
  finished: 'qrf',
  ticketMaxAgeMs: 6 * 60 * 60 * 1000,
});
export const TOKEN = /^[a-z0-9]{16}$/;
const KINDS = ['quest', 'circuit'];
const MAX_MS = 30 * 60 * 1000;

export function makeToken(rand = Math.random) {
  let out = '';
  while (out.length < 16) out += Math.floor(rand() * 36).toString(36);
  return out.slice(0, 16);
}

/** The race leg waiting in a save: { quest, node, steps, state } or null. */
export function activeRaceLeg(save) {
  for (const run of Object.values(save?.quests?.active || {})) {
    if (run && !run.ended && run.part?.kind === 'race' && run.part.state && !run.part.state.done) {
      return { quest: run.quest, node: run.node, steps: run.steps, state: run.part.state };
    }
  }
  return null;
}

/** A ticket for the race leg in this save, or null when there is none. */
export function questTicket(save, { token, title = '', now = 0 }) {
  const leg = activeRaceLeg(save);
  if (!leg || !TOKEN.test(token)) return null;
  return { v: 1, token, kind: 'quest', quest: leg.quest, node: leg.node, steps: leg.steps, title: String(title).slice(0, 80), at: now };
}

/** A ticket for a practice circuit, or null for an unknown one. */
export function circuitTicket(trackId, { token, now = 0 }) {
  if (!CIRCUITS.some((c) => c.id === trackId) || !TRACKS[trackId] || !TOKEN.test(token)) return null;
  return { v: 1, token, kind: 'circuit', track: trackId, title: '', at: now };
}

/** A ticket read back from storage, checked; null when anything is off. */
export function cleanTicket(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || value.v !== 1 || !TOKEN.test(value.token) || !KINDS.includes(value.kind)) return null;
  if (!Number.isFinite(value.at) || (now && now - value.at > QUEST_RACE.ticketMaxAgeMs)) return null;
  const title = typeof value.title === 'string' ? value.title.slice(0, 80) : '';
  if (value.kind === 'circuit') return TRACKS[value.track] && CIRCUITS.some((c) => c.id === value.track) ? { v: 1, token: value.token, kind: 'circuit', track: value.track, title, at: value.at } : null;
  if (typeof value.quest !== 'string' || typeof value.node !== 'string' || !Number.isInteger(value.steps)) return null;
  return { v: 1, token: value.token, kind: 'quest', quest: value.quest, node: value.node, steps: value.steps, title, at: value.at };
}

export function readTicket(storage = globalThis.sessionStorage, now = Date.now()) {
  try { return cleanTicket(JSON.parse(storage?.getItem(QUEST_RACE.ticketKey) || 'null'), now); } catch { return null; }
}
export function writeTicket(ticket, storage = globalThis.sessionStorage) {
  try { storage?.setItem(QUEST_RACE.ticketKey, JSON.stringify(ticket)); return true; } catch { return false; }
}
export function clearTicket(storage = globalThis.sessionStorage) {
  try { storage?.removeItem(QUEST_RACE.ticketKey); } catch { /* nothing kept */ }
}

/** ?questrace=<token>[&embed=1] on the racing page: { token, embed } or null. */
export function parseQuestRaceQuery(search) {
  let params;
  try { params = new URLSearchParams(search || ''); } catch { return null; }
  const token = params.get(QUEST_RACE.query);
  if (token == null) return null;
  return { token: TOKEN.test(token) ? token : null, embed: params.get(QUEST_RACE.embed) === '1' };
}

/** The circuit's practice best in the new game's own save (not a board), or null. */
export function practiceBest(save, trackId) {
  const ms = save?.races?.circuit?.[trackId]?.ms;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * What the racing page flies for a ticket and the new game's save:
 *   { kind, token, track, weekly, title, label, targetMs, rival, stats, stock, best }
 * stats: the upgraded ship as racing multipliers (core's raceStats, the 'race'
 * activity); stock: the same build as today's racing flies it, for the
 * "your ship vs stock" line. Or { error } in plain words.
 */
export function resolveTicket(ticket, save, { build = null } = {}) {
  if (!ticket) return { error: 'No race ticket.' };
  if (!save?.character) return { error: 'No captain on this device.' };
  const stats = raceStats(save, build, 'race');
  const stock = raceStats(save, build, 'classic-race');
  if (ticket.kind === 'circuit') {
    const circuit = CIRCUITS.find((c) => c.id === ticket.track);
    const track = TRACKS[ticket.track];
    if (!circuit || !track) return { error: 'That circuit is closed.' };
    return {
      kind: 'circuit', token: ticket.token, track: circuit.id, weekly: track.weekly, title: track.title, label: 'Hangar practice',
      targetMs: Math.round(track.pilotMs * circuit.rival.pace), rival: { name: circuit.rival.name, pace: circuit.rival.pace },
      stats, stock, best: practiceBest(save, circuit.id),
    };
  }
  const leg = activeRaceLeg(save);
  if (!leg || leg.quest !== ticket.quest || leg.node !== ticket.node || leg.steps !== ticket.steps) return { error: 'This race is already run, or the job moved on.' };
  const track = TRACKS[leg.state.track];
  if (!track) return { error: 'Unknown track.' };
  return {
    kind: 'quest', token: ticket.token, track: leg.state.track, weekly: track.weekly, title: track.title, label: ticket.title || 'Quest race',
    targetMs: leg.state.targetMs, rival: { name: String(leg.state.rival?.name || 'Rival').slice(0, 40), pace: leg.state.rival?.pace ?? 1 },
    stats, stock, best: null,
  };
}

/** A race result, checked: { token, timeMs, finished } or null. */
export function cleanResult(data, token) {
  if (!data || typeof data !== 'object' || data.token !== token || !TOKEN.test(token)) return null;
  const timeMs = Math.round(Number(data.timeMs));
  if (!Number.isFinite(timeMs) || timeMs <= 0 || timeMs > MAX_MS) return null;
  return { token, timeMs, finished: data.finished !== false };
}

/** The message the racing page posts to the hangar's race frame. */
export const resultMessage = (token, timeMs, finished) => ({ type: QUEST_RACE.message, token, timeMs: Math.round(timeMs), finished: Boolean(finished) });

/** The return link for a racing page opened on its own (relative to the racing page). */
export function returnHref(token, timeMs, finished, base = './voyage/') {
  const p = new URLSearchParams({ [QUEST_RACE.query]: token, [QUEST_RACE.time]: String(Math.round(timeMs)), [QUEST_RACE.finished]: finished ? '1' : '0' });
  return `${base}?${p}`;
}

/** The hangar reading a return link: the result when it matches this tab's ticket, else null. */
export function parseReturn(search, ticket) {
  let params;
  try { params = new URLSearchParams(search || ''); } catch { return null; }
  if (!ticket || !params.has(QUEST_RACE.time)) return null;
  return cleanResult({ token: params.get(QUEST_RACE.query), timeMs: params.get(QUEST_RACE.time), finished: params.get(QUEST_RACE.finished) !== '0' }, ticket.token);
}

/**
 * Keeps a practice lap in the new game's save when it beats the best there.
 * Returns { save, best } (best: it was a new practice best). A lap that did
 * not finish never counts. This is the new game's own record, not a board.
 */
export function recordPractice(save, trackId, timeMs, { finished = true, now = 0 } = {}) {
  if (!finished || !Number.isFinite(timeMs) || timeMs <= 0 || !TRACKS[trackId]) return { save, best: false };
  const races = save.races && typeof save.races === 'object' ? save.races : {};
  const circuit = races.circuit && typeof races.circuit === 'object' ? races.circuit : {};
  const prev = practiceBest(save, trackId);
  const laps = (Number.isInteger(races.laps) ? races.laps : 0) + 1;
  const best = prev == null || timeMs < prev;
  const next = { ...circuit, ...(best ? { [trackId]: { ms: Math.round(timeMs), at: now } } : {}) };
  return { save: { ...save, races: { v: 1, laps, circuit: next } }, best };
}

/** "1.23 s" */
export const gapText = (ms) => `${(Math.abs(ms) / 1000).toFixed(2)} s`;

/** One of the lines, picked by the time so the same result reads the same. */
export function pickLine(lines, ms) {
  return lines[Math.abs(Math.round(ms / 10)) % lines.length];
}

/** Fills {name} placeholders. The page puts the result in with textContent. */
export const fillCopy = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));

/** "+12%" for a multiplier over a base. */
export function pct(value, base = 1) {
  const p = Math.round((value / (base || 1) - 1) * 100);
  return `${p >= 0 ? '+' : ''}${p}%`;
}

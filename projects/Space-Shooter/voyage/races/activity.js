// What a race or a dogfight round pays, and how the pay reaches the player (arena
// lane). Two halves:
//   1. pure payout rules over data.js ACTIVITY_PAY (racePayout, dogfightPayout),
//      and hubJobsFragment(): the rules.json "voyage".jobs entries the Hub needs
//      for the four launch jobs (no Hub code changes, only these four entries);
//   2. createActivityPay: the pipeline. With the home server on and a signed-in
//      pilot, the round is a Hub job ticket (POST /jobs at the start, POST
//      /jobs/:id/settle at the end); the Hub reads every price from its own rules,
//      caps the job and the hour, and a lost ship calls /death. With server mode
//      off the local save is paid, so the game works offline. A guest earns nothing
//      real (Donaven, Q2.1). Nothing here writes a board, a ghost or a record.
//
// No DOM. The fetch is handed in as api(path, { method, body }) -> { ok, status, data }
// (systems/hubRuns.js recorder.api) so node tests run it with a fake hub.
import { ACTIVITY_PAY, SHIP_LOSS, LAUNCH_TRACKS, LAUNCH_ARENAS } from './data.js';
import { emptyUpgrades } from '../save.js';

const whole = (n) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The pay rule for a job id, or null. */
export const payRule = (jobId) => (Object.hasOwn(ACTIVITY_PAY, jobId) ? ACTIVITY_PAY[jobId] : null);
export const raceJob = (trackId) => LAUNCH_TRACKS.find((t) => t.id === trackId)?.job || null;
export const arenaJob = (arenaId) => LAUNCH_ARENAS.find((a) => a.id === arenaId)?.job || null;

const none = (jobId, why) => ({ jobId, credits: 0, fee: 0, net: 0, died: false, max: payRule(jobId)?.max || 0, parts: [], xp: {}, why });

/**
 * A race: { timeMs, finished, targetMs, wrecked }. A wreck is a lost ship (fee, no
 * pay); backing out without a wreck is nothing either way; finishing pays, and
 * beating the rival's time pays more.
 */
export function racePayout(jobId, { timeMs = 0, finished = false, targetMs = Infinity, wrecked = false } = {}) {
  const rule = payRule(jobId);
  if (!rule || rule.kind !== 'race') return none(jobId, 'unknown');
  if (wrecked) return { ...none(jobId, 'wrecked'), fee: SHIP_LOSS.fee, net: -SHIP_LOSS.fee, died: true, parts: [`ship lost: -${SHIP_LOSS.fee} cr fee`] };
  if (!finished || !(timeMs > 0)) return none(jobId, 'no-finish');
  const parts = [`finished: +${rule.finish}`];
  let credits = rule.finish;
  if (timeMs <= targetMs) { credits += rule.win; parts.push(`beat the rival: +${rule.win}`); }
  credits = clamp(credits, 0, rule.max);
  return { jobId, credits, fee: 0, net: credits, died: false, max: rule.max, parts, xp: { ...rule.xp } };
}

/**
 * A dogfight round: { outcome: 'win'|'loss'|'draw'|'interrupted', mode, vsAi, hullFrac, died }.
 * `died` is your own hull gone (a lost ship). A round that the host's tab cut short
 * ('interrupted') pays nothing.
 */
export function dogfightPayout(jobId, { outcome = 'draw', mode = 'duel', vsAi = false, hullFrac = 0, died = false } = {}) {
  const rule = payRule(jobId);
  if (!rule || rule.kind !== 'dogfight') return none(jobId, 'unknown');
  if (outcome === 'interrupted') return none(jobId, 'interrupted');
  const parts = [`round played: +${rule.played}`];
  let credits = rule.played;
  if (outcome === 'win') {
    const win = mode === 'duel' && vsAi ? rule.duelAiWin : rule.win;
    credits += win;
    parts.push(`win: +${win}`);
    const bonus = Math.round(rule.hullBonus * clamp(hullFrac, 0, 1));
    if (bonus) { credits += bonus; parts.push(`hull left: +${bonus}`); }
  }
  credits = clamp(credits, 0, rule.max);
  const lost = Boolean(died);
  if (lost) parts.push(`ship lost: -${SHIP_LOSS.fee} cr fee`);
  return { jobId, credits, fee: lost ? SHIP_LOSS.fee : 0, net: credits - (lost ? SHIP_LOSS.fee : 0), died: lost, max: rule.max, parts, xp: outcome === 'win' ? { ...rule.xp } : {} };
}

/** The rules.json "voyage".jobs entries for the launch jobs (credits, items, xp, minSeconds). */
export function hubJobsFragment() {
  const out = {};
  for (const [id, r] of Object.entries(ACTIVITY_PAY)) {
    out[id] = { maxPayout: { credits: r.max, items: {}, xp: Math.max(0, ...Object.values(r.xp)) }, minSeconds: r.minSeconds };
  }
  return out;
}

/**
 * The pay pipeline. Options:
 *   api, gamePath   the hub recorder's api and gamePath('/v1/x') (null: no hub)
 *   serverOn()      is the home server's economy on for this page?
 *   signedIn()      is a pilot signed in (false: a guest)?
 *   ready()         resolves when the hub has said who is flying (recorder.connect)
 *   store           the Voyage store, for the local save (get, update)
 *   now             the clock
 * start(jobId) opens the round; finish(round, payout, { outcome }) pays it.
 * finish resolves to { source: 'server'|'local'|'guest'|'offline'|'none', paid, fee, died, flags, words }.
 */
export function createActivityPay({ api = null, gamePath = null, serverOn = () => false, signedIn = () => false, ready = async () => {}, store = null, now = Date.now } = {}) {
  const call = (path, body) => (api && gamePath ? api(gamePath(`/v1${path}`), { method: 'POST', body }) : Promise.resolve({ ok: false, status: 0, data: null }));

  function start(jobId) {
    const rule = payRule(jobId);
    if (!rule) return null;
    const round = { jobId, startedAt: now(), ticket: null };
    // Server on: wait for the hub to say who is flying, then take a job ticket (a guest gets none).
    if (serverOn()) round.ticket = Promise.resolve(ready()).catch(() => {}).then(() => (signedIn() ? call('/jobs', { questId: jobId, sessionId: null, seats: [{ kind: 'host' }] }) : { guest: true }));
    return round;
  }

  async function finish(round, payout, { outcome = 'ended' } = {}) {
    if (!round || !payout) return { source: 'none', paid: 0, fee: 0, died: false, flags: [], words: '' };
    const base = { paid: 0, fee: 0, died: payout.died, flags: [], words: '' };
    if (serverOn()) {
      const ticket = await round.ticket;
      if (ticket?.guest || !signedIn()) return { ...base, source: 'guest', words: payout.credits || payout.fee ? `Guest: you would have earned ${payout.credits} cr. Sign in so the Guild bank can pay you.` : '' };
      if (!ticket?.ok || !ticket.data?.id) return { ...base, source: 'offline', words: 'The Guild bank is not answering, so nothing was paid for this one.' };
      const id = ticket.data.id;
      const settled = await call(`/jobs/${encodeURIComponent(id)}/settle`, { outcome: String(outcome).slice(0, 32), credits: payout.net, items: {}, xp: payout.xp });
      let death = null;
      if (payout.died) death = await call('/death', {});
      const flags = settled.data?.flags || [];
      const paid = settled.data?.paid?.credits ?? 0;
      let words = '';
      if (settled.data?.held) words = 'The Guild bank is checking that round. Nothing paid for it yet.';
      else if (flags.includes('hour-cap')) words = 'The Guild bank pays out only so much an hour. Part of that went unpaid.';
      else if (!settled.ok) words = 'The Guild bank would not pay for that one.';
      return { source: 'server', paid, fee: payout.fee, died: payout.died, flags, words, death: death?.ok ? death.data : null, account: settled.data?.account || null };
    }
    // Server mode off: the local save, so the game works offline.
    const save = store?.get?.();
    if (!save?.character) return { ...base, source: 'none', words: payout.credits ? 'Sign on a captain in the hangar to be paid.' : '' };
    store.update((s) => {
      const money = Math.max(0, (s.money || 0) + payout.net);
      return { ...s, money, ...(payout.died ? { upgrades: emptyUpgrades() } : {}) };
    });
    return { source: 'local', paid: payout.credits, fee: payout.fee, died: payout.died, flags: [], words: '' };
  }

  return { start, finish };
}

/** "+140 cr" style line for a result panel. */
export function payLine(result, payout) {
  if (!result || !payout) return '';
  if (result.source === 'guest' || result.source === 'offline' || result.source === 'none') return result.words;
  const bits = [];
  const got = result.source === 'server' ? result.paid : payout.credits;
  if (payout.died) bits.push(`Ship lost: its upgrades are gone. ${payout.credits ? `Round pay ${payout.credits} cr, ` : ''}repair and tow -${payout.fee} cr`);
  else if (payout.credits) bits.push(`Paid ${got} cr`);
  if (!bits.length) bits.push('Nothing paid this time');
  return `${bits.join('. ')}.${result.words ? ` ${result.words}` : ''}`;
}

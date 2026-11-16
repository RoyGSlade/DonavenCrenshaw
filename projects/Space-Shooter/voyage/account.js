// The server-owned economy, browser side (launch tech lane, outcome 2). When the
// home server mode is on (voyage/session.js), the hub owns credits, items, ship
// upgrades and skill levels; this browser keeps them only as a cache that every
// pull from the hub replaces (applyAccount), so an edit in the dev tools never
// sticks. The game still plays locally and at once; afterwards it reports what
// happened (a job's ticket and settle, a purchase, a sale, a claim) and pulls.
// Edna's dice deals are rolled by the hub first, then shown with the hub's die.
//
// Off (the default) every call here is a no-op and the save works as it always has.
import { cleanSave, emptyUpgrades } from './save.js';
import { UPGRADE_IDS, TOP_TIER, ROLL_SKILL_IDS, LEVEL_MIN, LEVEL_MAX } from './data.js';

// XP a passed check claims for its skill. The hub caps every job's XP (rules.json
// "voyage".jobs), so this only sizes the claim.
export const XP_PER_PASS = 10;

const plain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const whole = (v) => (Number.isFinite(v) ? Math.trunc(v) : 0);

/** A save with the hub's numbers in place of its own: money, items, upgrades and skill levels. */
export function applyAccount(save, account) {
  const base = cleanSave(save);
  if (!plain(account)) return base;
  const items = {};
  for (const [id, n] of Object.entries(plain(account.holdings) ? account.holdings : {})) if (whole(n) > 0) items[id] = whole(n);
  const upgrades = emptyUpgrades();
  for (const id of UPGRADE_IDS) upgrades[id] = Math.min(TOP_TIER, Math.max(0, whole(account.upgrades?.[id])));
  const out = { ...base, money: Math.max(0, whole(account.credits)), items, upgrades };
  if (base.character && plain(account.levels)) {
    const levels = { ...base.character.levels };
    for (const id of ROLL_SKILL_IDS) if (Number.isFinite(account.levels[id])) levels[id] = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, whole(account.levels[id])));
    out.character = { ...base.character, levels };
  }
  return cleanSave(out);
}

/** What changed between two saves, as a settle claim: net credits and items (negative = spent). */
export function netChange(before, after) {
  const items = {};
  for (const id of new Set([...Object.keys(before?.items || {}), ...Object.keys(after?.items || {})])) {
    const d = (after?.items?.[id] || 0) - (before?.items?.[id] || 0);
    if (d) items[id] = d;
  }
  return { credits: (after?.money || 0) - (before?.money || 0), items };
}

/** XP a job claims from its rolls: XP_PER_PASS for each passed check, by skill. */
export function xpFromRolls(rolls = []) {
  const xp = {};
  for (const r of rolls) if (r?.pass && r.skill && ROLL_SKILL_IDS.includes(r.skill)) xp[r.skill] = (xp[r.skill] || 0) + XP_PER_PASS;
  return xp;
}

/**
 * The economy client. api(path, { method, body }) -> { ok, status, data } (the
 * hub recorder's api); gamePath('/v1/x') -> the path on the hub. store: the
 * Voyage store. Until enable() it does nothing.
 */
export function createEconomy() {
  let api = null;
  let gamePath = null;
  let store = null;
  let toast = () => {};
  const jobs = new Map(); // questId -> { ticket: Promise, before, rolls }
  const call = (path, body) => (api ? api(gamePath(`/v1${path}`), body === undefined ? undefined : { method: 'POST', body }) : Promise.resolve({ ok: false, status: 0, data: null }));
  const say = (out) => { const why = out?.data?.reason || out?.data?.error; if (why && WORDS[why]) toast(WORDS[why]); };

  const self = {
    get on() { return Boolean(api); },
    enable(opts) { ({ api, gamePath, store } = opts); toast = opts.toast || toast; },
    disable() { api = null; jobs.clear(); },
    /** Pulls the account and puts the hub's numbers in the save. */
    async pull() {
      if (!api) return null;
      const out = await call('/account');
      if (out.ok && out.data?.ok !== false) store.update((s) => applyAccount(s, out.data));
      return out.ok ? out.data : null;
    },
    jobStarted(questId) {
      if (!api) return;
      jobs.set(questId, { before: store.get(), rolls: [], ticket: call('/jobs', { questId, sessionId: null, seats: [{ kind: 'host' }] }) });
    },
    hasJob(questId) { return jobs.has(questId); },
    jobRolled(questId, rolls = []) { const j = jobs.get(questId); if (j) j.rolls.push(...rolls); },
    async jobEnded(questId, ended) {
      const j = jobs.get(questId);
      if (!api || !j) return null;
      jobs.delete(questId);
      const ticket = await j.ticket;
      if (!ticket.ok || !ticket.data?.id) { await self.pull(); return null; }
      const net = netChange(j.before, store.get());
      const out = await call(`/jobs/${ticket.data.id}/settle`, { outcome: ended?.result || 'ended', credits: net.credits, items: net.items, xp: xpFromRolls(j.rolls) });
      if (out.data?.flags?.includes('hour-cap')) toast(WORDS.hour_cap);
      else say(out);
      await self.pull();
      return out.data;
    },
    async spend(kind, id, off = 0) {
      if (!api) return null;
      const out = await call('/spend', { kind, id, off });
      say(out);
      await self.pull();
      return out.data;
    },
    /** A dice deal: the hub rolls; returns { attempt, paid } or null when the hub said no. */
    async roll(dealId) {
      if (!api) return null;
      const out = await call('/roll', { dealId });
      if (!out.ok || out.data?.ok === false) { say(out); return null; }
      return out.data;
    },
    async claim(id, items) {
      if (!api) return null;
      const out = await call('/claims', items ? { id, items } : { id });
      await self.pull();
      return out.data;
    },
    async died() {
      if (!api) return null;
      const out = await call('/death', {});
      await self.pull();
      return out.data;
    },
  };
  return self;
}

const WORDS = {
  hour_cap: 'The Guild bank pays out only so much an hour. The rest of that job went unpaid.',
  too_fast: 'The Guild bank is checking that job. Nothing paid for it yet.',
  cannot_afford: 'The Guild bank says you can\'t cover that.',
  limit: 'You already own as many of those as you can.',
  expired: 'That job ran past its ticket. Nothing paid.',
};

/** The one economy client the voyage page uses (off until boot enables it). */
export const economy = createEconomy();

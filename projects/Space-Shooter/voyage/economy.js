// Money, rep, items and flags: the reward, cost and requirement formats quests
// and the hangar share (INTERFACES.md section 3). Every function takes a save
// and returns a new one; nothing here mutates or touches storage.
import { addEarned, addPermanent, effect, treePoints } from './character.js';
import { cleanSave, itemMax } from './save.js';
import { GIVERS, ITEMS, MAX_REP_REWARDS, MONEY_MAX, REP_MAX, STATS, SKILLS, TREES, UPGRADES, CURRENCY, REP_BANDS } from './data.js';

const GIVER_NAME = Object.fromEntries(GIVERS.map((g) => [g.id, g.name]));
const ITEM_NAME = Object.fromEntries(ITEMS.map((i) => [i.id, i.name]));
const STAT_NAME = Object.fromEntries(STATS.map((s) => [s.id, s.name]));
const SKILL_NAME = Object.fromEntries(SKILLS.map((s) => [s.id, s.name]));
const TREE_NAME = Object.fromEntries(TREES.map((t) => [t.id, t.name]));
const UPGRADE_NAME = Object.fromEntries(UPGRADES.map((u) => [u.id, u.name]));
const whole = (v) => (Number.isFinite(v) ? Math.trunc(v) : 0);
const entries = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o) : []);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const giverName = (id) => GIVER_NAME[id] || id;
export const itemName = (id) => ITEM_NAME[id] || id;
export const money = (n) => `${Math.trunc(n).toLocaleString('en-US')} ${CURRENCY.short}`;

/** Shop discount in percent from the captain's charisma and skills, 0..50. */
export function discount(save) {
  return clamp(effect(save?.character, 'price'), 0, 50);
}
/** A money cost after the captain's discount (never below 0). */
export const priceFor = (save, amount) => Math.max(0, Math.round(whole(amount) * (1 - discount(save) / 100)));

/**
 * Pays a reward. { save, events }: events say what changed, in order, for the UI.
 * Positive rep is raised by the captain's rep bonus (rounded down). Reaching
 * REP_MAX with a giver for the first time also pays MAX_REP_REWARDS[giver].
 */
export function grant(input, reward = {}) {
  let save = cleanSave(input);
  const events = [];
  const r = reward && typeof reward === 'object' ? reward : {};

  if (whole(r.money)) {
    const before = save.money;
    save.money = clamp(before + whole(r.money), 0, MONEY_MAX);
    if (save.money !== before) events.push({ type: 'money', amount: save.money - before });
  }

  for (const [giver, raw] of entries(r.rep)) {
    let n = whole(raw);
    if (!n) continue;
    if (n > 0) n = Math.floor(n * (1 + Math.max(0, effect(save.character, 'rep')) / 100));
    const before = save.rep[giver] || 0;
    const after = clamp(before + n, 0, REP_MAX);
    if (after === before) continue;
    save.rep = { ...save.rep, [giver]: after };
    if (!after) delete save.rep[giver];
    events.push({ type: 'rep', giver, amount: after - before, total: after });
    if (after >= REP_MAX && !save.account.maxRep[giver]) {
      const prize = MAX_REP_REWARDS[giver];
      save.account = { ...save.account, maxRep: { ...save.account.maxRep, [giver]: 1 } };
      if (prize) {
        if (prize.permanent > 0) {
          if (save.character) save.character = addPermanent(save.character, prize.permanent);
          else save.account = { ...save.account, bank: save.account.bank + prize.permanent };
        }
        const unlocks = (prize.unlocks || []).filter((u) => !save.account.unlocks.includes(u));
        save.account = { ...save.account, unlocks: [...save.account.unlocks, ...unlocks] };
        events.push({ type: 'max-rep', giver, permanent: prize.permanent || 0, unlocks });
      }
    }
  }

  for (const [id, raw] of entries(r.items)) {
    const n = whole(raw);
    if (!n) continue;
    const before = save.items[id] || 0;
    const after = clamp(before + n, 0, itemMax(id));
    if (after === before) continue;
    save.items = { ...save.items, [id]: after };
    if (!after) delete save.items[id];
    events.push({ type: 'item', id, amount: after - before, total: after });
  }

  const points = whole(r.skillPoints);
  if (points && save.character) {
    const before = save.character.earned;
    save.character = addEarned(save.character, points);
    if (save.character.earned !== before) events.push({ type: 'skill-points', amount: save.character.earned - before });
  }

  for (const [flag, raw] of entries(r.flags)) {
    const n = whole(raw);
    const flags = { ...save.flags };
    if (n) flags[flag] = n; else delete flags[flag];
    save.flags = flags;
    events.push({ type: 'flag', id: flag, value: n });
  }

  for (const unlock of Array.isArray(r.unlocks) ? r.unlocks : []) {
    if (typeof unlock !== 'string' || save.account.unlocks.includes(unlock)) continue;
    const next = cleanSave({ ...save, account: { ...save.account, unlocks: [...save.account.unlocks, unlock] } });
    if (next.account.unlocks.length === save.account.unlocks.length) continue; // not a valid unlock id
    save = next;
    events.push({ type: 'unlock', id: unlock });
  }
  return { save: cleanSave(save), events };
}

/** Can the save pay this cost? Money is compared as given (callers apply priceFor first). */
export function canAfford(save, cost = {}) {
  const s = cleanSave(save);
  if (whole(cost?.money) > s.money) return false;
  for (const [id, n] of entries(cost?.items)) if (whole(n) > (s.items[id] || 0)) return false;
  return true;
}

/** Pays a cost: { ok, save, reason }. Nothing changes when it can't be paid. */
export function spend(input, cost = {}) {
  const save = cleanSave(input);
  if (!canAfford(save, cost)) return { ok: false, save, reason: missingCost(save, cost)[0] || 'Not enough.' };
  const items = { ...save.items };
  for (const [id, raw] of entries(cost?.items)) {
    const n = Math.max(0, whole(raw));
    items[id] = (items[id] || 0) - n;
    if (items[id] <= 0) delete items[id];
  }
  return { ok: true, save: cleanSave({ ...save, money: save.money - Math.max(0, whole(cost?.money)), items }), reason: '' };
}

function missingCost(save, cost) {
  const out = [];
  const need = whole(cost?.money);
  if (need > save.money) out.push(`Needs ${money(need)} (you have ${money(save.money)}).`);
  for (const [id, raw] of entries(cost?.items)) {
    const n = whole(raw);
    const have = save.items[id] || 0;
    if (n > have) out.push(`Needs ${n} ${itemName(id)} (you have ${have}).`);
  }
  return out;
}

/** Every unmet part of a requirement, in plain words; [] when it is met. */
export function missing(input, req = {}) {
  const save = cleanSave(input);
  const c = save.character;
  const out = [];
  if (!req || typeof req !== 'object') return out;
  if (whole(req.money) > save.money) out.push(`Needs ${money(whole(req.money))}.`);
  for (const [g, n] of entries(req.rep)) if ((save.rep[g] || 0) < whole(n)) out.push(`Needs ${whole(n)} rep with ${giverName(g)}.`);
  for (const [id, n] of entries(req.items)) if ((save.items[id] || 0) < whole(n)) out.push(`Needs ${whole(n)} ${itemName(id)}.`);
  for (const [id, n] of entries(req.stats)) if ((c?.stats?.[id] || 0) < whole(n)) out.push(`Needs ${STAT_NAME[id] || id} ${whole(n)}.`);
  for (const [id, n] of entries(req.skills)) if ((c?.skills?.[id] || 0) < whole(n)) out.push(whole(n) > 1 ? `Needs ${SKILL_NAME[id] || id} rank ${whole(n)}.` : `Needs the ${SKILL_NAME[id] || id} skill.`);
  for (const [id, n] of entries(req.trees)) if (treePoints(c, id) < whole(n)) out.push(`Needs ${whole(n)} points in ${TREE_NAME[id] || id}.`);
  for (const [id, n] of entries(req.upgrades)) if ((save.upgrades[id] || 0) < whole(n)) out.push(`Needs ${UPGRADE_NAME[id] || id} tier ${whole(n)}.`);
  for (const [id, n] of entries(req.flags)) if ((save.flags[id] || 0) < whole(n)) out.push(`Not unlocked yet.`);
  for (const id of Array.isArray(req.notFlags) ? req.notFlags : []) if (save.flags[id]) out.push(`No longer available.`);
  if (Array.isArray(req.anyOf) && req.anyOf.length) {
    const options = req.anyOf.map((r) => missing(save, r));
    if (options.every((m) => m.length)) out.push(`One of: ${options.map((m) => m.join(' ')).join(' Or ')}`);
  }
  return [...new Set(out)];
}

export const meets = (save, req) => missing(save, req).length === 0;

/** The rep band's name for a number (REP_BANDS in data.js). */
export function repBand(n) {
  let name = REP_BANDS[0].name;
  for (const band of REP_BANDS) if (n >= band.min) name = band.name;
  return name;
}

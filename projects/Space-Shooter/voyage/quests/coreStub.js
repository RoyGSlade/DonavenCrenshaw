// A stand-in for core's Voyage modules (voyage/economy.js, voyage/character.js,
// voyage/upgrades.js, voyage/save.js), written from INTERFACES.md version 1.
// Quests code imports these through ./core.js only. When core's files land,
// ./core.js switches to them and this file can go.
//
// Pure functions over a save; nothing here mutates its input.

export const REP_MAX = 100;
export const STATS = Object.freeze(['cha', 'con', 'dex', 'wis']);
export const STAT_NAMES = Object.freeze({ cha: 'Charisma', con: 'Constitution', dex: 'Dexterity', wis: 'Wisdom' });
export const GIVERS = Object.freeze({
  // Proposed by quests (world lane's recommended three, QUEST-GIVERS.md):
  hask: { name: 'Stationmaster Hask', faction: 'relay-guild' },
  vey: { name: 'Lucan Vey', faction: 'none' },
  garrity: { name: 'Hob Garrity', faction: 'driftborn' },
  // Core's placeholders (INTERFACES.md 1.1):
  'relay-guild': { name: 'Relay Guild' },
  'ember-syndicate': { name: 'Ember Syndicate' },
  'hollow-choir': { name: 'Hollow Choir' },
});
export const ITEMS = Object.freeze({
  scrap: { name: 'Scrap', kind: 'material', max: 99 },
  ore: { name: 'Ore', kind: 'material', max: 99 },
  circuit: { name: 'Circuit', kind: 'material', max: 99 },
  'fuel-cell': { name: 'Fuel cell', kind: 'part', max: 9 },
  permit: { name: 'Permit', kind: 'key', max: 1 },
  'nav-chip': { name: 'Nav chip', kind: 'part', max: 9 },
  railgun: { name: 'Railgun', kind: 'part', max: 1 },
  'cargo-crate': { name: 'Cargo crate', kind: 'cargo', max: 9 },
  // Proposed by quests in INTERFACES.md:
  'mining-drill': { name: 'Mining drill', kind: 'key', max: 1 },
});
const SHIP_BASE = Object.freeze({ hp: 100, speed: 1, accel: 1, turn: 1, damage: 10, heat: 100, cargo: 4 });

export function emptySave() {
  return {
    v: 1, updatedAt: 0, character: null, money: 0, rep: {}, items: {},
    upgrades: { hull: 0, engine: 0, thrusters: 0, guns: 0 }, flags: {},
    account: { unlocks: [], maxRep: {} }, quests: {},
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const giverName = id => GIVERS[id]?.name || id;
const itemName = id => ITEMS[id]?.name || id;

export function grant(save, reward = {}) {
  const next = structuredClone(save);
  const events = [];
  if (reward.money) {
    const before = next.money || 0;
    next.money = Math.max(0, before + reward.money);
    events.push({ type: 'money', amount: next.money - before });
  }
  for (const [giver, amount] of Object.entries(reward.rep || {})) {
    const before = next.rep[giver] || 0;
    next.rep[giver] = clamp(before + amount, 0, REP_MAX);
    events.push({ type: 'rep', giver, amount: next.rep[giver] - before });
    if (next.rep[giver] >= REP_MAX && !next.account.maxRep[giver]) {
      next.account.maxRep[giver] = 1;
      events.push({ type: 'max-rep', giver });
    }
  }
  for (const [id, amount] of Object.entries(reward.items || {})) {
    const before = next.items[id] || 0;
    next.items[id] = clamp(before + amount, 0, ITEMS[id]?.max ?? 99);
    if (!next.items[id]) delete next.items[id];
    events.push({ type: 'item', id, amount: (next.items[id] || 0) - before });
  }
  if (reward.skillPoints && next.character) {
    next.character.earned = (next.character.earned || 0) + reward.skillPoints;
    events.push({ type: 'skill-points', amount: reward.skillPoints });
  }
  for (const [id, value] of Object.entries(reward.flags || {})) {
    if (value) next.flags[id] = value; else delete next.flags[id];
    events.push({ type: 'flag', id, amount: value });
  }
  for (const id of reward.unlocks || []) {
    if (!next.account.unlocks.includes(id)) next.account.unlocks.push(id);
    events.push({ type: 'unlock', id });
  }
  return { save: next, events };
}

export function canAfford(save, cost = {}) {
  if ((cost.money || 0) > (save.money || 0)) return false;
  return Object.entries(cost.items || {}).every(([id, n]) => (save.items[id] || 0) >= n);
}

export function spend(save, cost = {}) {
  if (!canAfford(save, cost)) return { ok: false, save, reason: missing(save, { money: cost.money, items: cost.items })[0] || 'Cannot afford' };
  const next = structuredClone(save);
  next.money = (next.money || 0) - (cost.money || 0);
  for (const [id, n] of Object.entries(cost.items || {})) {
    next.items[id] = (next.items[id] || 0) - n;
    if (!next.items[id]) delete next.items[id];
  }
  return { ok: true, save: next, reason: '' };
}

function skillRank(save, id) { return save.character?.skills?.[id] || 0; }

export function missing(save, req = {}) {
  const out = [];
  if (req.money && (save.money || 0) < req.money) out.push(`Needs ${req.money} credits`);
  for (const [giver, n] of Object.entries(req.rep || {})) if ((save.rep[giver] || 0) < n) out.push(`Needs ${n} rep with ${giverName(giver)}`);
  for (const [id, n] of Object.entries(req.items || {})) if ((save.items[id] || 0) < n) out.push(n > 1 ? `Needs ${n} × ${itemName(id)}` : `Needs ${itemName(id)}`);
  for (const [stat, n] of Object.entries(req.stats || {})) if ((save.character?.stats?.[stat] || 0) < n) out.push(`Needs ${STAT_NAMES[stat] || stat} ${n}`);
  for (const [id, n] of Object.entries(req.skills || {})) if (skillRank(save, id) < n) out.push(`Needs skill ${id} ${n}`);
  for (const [tree, n] of Object.entries(req.trees || {})) {
    const points = Object.values(save.character?.trees?.[tree] || {}).reduce((a, b) => a + b, 0);
    if (points < n) out.push(`Needs ${n} points in ${tree}`);
  }
  for (const [id, n] of Object.entries(req.upgrades || {})) if ((save.upgrades?.[id] || 0) < n) out.push(`Needs ${id} tier ${n}`);
  for (const [id, n] of Object.entries(req.flags || {})) if ((save.flags[id] || 0) < n) out.push(`Needs story: ${id}`);
  for (const id of req.notFlags || []) if (save.flags[id]) out.push(`Closed by story: ${id}`);
  if (Array.isArray(req.anyOf) && req.anyOf.length && !req.anyOf.some(r => meets(save, r))) {
    out.push(missing(save, req.anyOf[0])[0] || 'Needs one of several things');
  }
  return out;
}

export const meets = (save, req) => missing(save, req).length === 0;

// Skill effects are core's data; the stub has none, so bonuses are 0.
export function skillBonus(_character, _tag) { return 0; }

export function check(character, { stat, tag, dc }, rng) {
  const roll = 1 + Math.floor(rng() * 6);
  const bonus = (character?.stats?.[stat] || 0) + (tag ? skillBonus(character, tag) : 0);
  const total = roll + bonus;
  return { roll, bonus, total, dc, pass: total >= dc };
}

export function voyageShipStats(save) {
  const ship = { ...SHIP_BASE };
  const tiers = save?.upgrades || {};
  ship.hp += 20 * (tiers.hull || 0) + 4 * (save?.character?.stats?.con || 0);
  ship.damage += 3 * (tiers.guns || 0);
  ship.turn += 0.05 * (save?.character?.stats?.dex || 0);
  return ship;
}

// A test character, made the way core's createCharacter will (stats 1d6 each).
export function testCharacter(stats = { cha: 3, con: 3, dex: 3, wis: 3 }, name = 'Test Pilot') {
  return { id: 'c-test', name, look: { portrait: 'p1', color: '#5fd4ff' }, stats: { ...stats }, earned: 0, permanent: 0, skills: {}, deaths: 0, createdAt: 0 };
}

// Ship upgrades for the new game: the same ship, better in tiers.
//
// Why a stat set of its own (P3, S8, S12): today's racing flies the equipped
// build on shared leaderboards and its weekly physics is versioned for ghosts,
// so an upgrade that touched engine/shipStats.js or the build would change
// ranked times. Dogfight's three classes are balanced against each other for
// duels. The new game needs movement and a fight model (hull, guns), so it
// derives its own numbers each time from SHIP_BASE, a little of the equipped
// build's feel (read only), the upgrade tiers and the captain. Races and fights
// inside the new game read them through raceStats / combatStats, gated by the
// ACTIVITIES table in data.js: the classic boards and the Dogfight arena fly
// exactly as today. Nothing here is written back to the build, the garage or
// the account ship.
import { buildStats } from '../engine/shipStats.js';
import { effect } from './character.js';
import { canAfford, missing, priceFor, spend } from './economy.js';
import { cleanSave } from './save.js';
import { ACTIVITIES, BUILD_FEEL, SHIP_BASE, TOP_TIER, UPGRADES, UPGRADE_IDS } from './data.js';

const UPGRADE = new Map(UPGRADES.map((u) => [u.id, u]));
const r3 = (v) => Math.round(v * 1000) / 1000;

/** The equipped racing build's movement as Voyage multipliers, damped by BUILD_FEEL. */
export function buildFeel(build) {
  const stats = build ? buildStats(build) : null;
  if (!stats) return { speed: 1, accel: 1, turn: 1 };
  const damp = (v) => 1 + (v - 1) * BUILD_FEEL;
  return { speed: damp(stats.topSpeed), accel: damp(stats.accel), turn: damp(stats.grip) };
}

/** The Voyage ship's stats for a save and (optionally) the equipped build key. */
export function voyageShipStats(input, build = null) {
  const save = cleanSave(input);
  const feel = buildFeel(build);
  const out = { ...SHIP_BASE };
  out.speed *= feel.speed;
  out.accel *= feel.accel;
  out.turn *= feel.turn;
  for (const id of UPGRADE_IDS) {
    const tiers = UPGRADE.get(id).tiers;
    for (let t = 0; t < (save.upgrades[id] || 0); t++) for (const [k, v] of Object.entries(tiers[t].add)) out[k] += v;
  }
  const c = save.character;
  for (const k of Object.keys(out)) out[k] += effect(c, `ship.${k}`);
  out.hp = Math.max(10, Math.round(out.hp));
  out.damage = Math.max(1, Math.round(out.damage));
  out.heat = Math.max(10, Math.round(out.heat));
  out.cargo = Math.max(1, Math.round(out.cargo));
  for (const k of ['speed', 'accel', 'turn']) out[k] = r3(Math.max(0.5, out[k]));
  return out;
}

// --- Racing and fighting inside the new game ---------------------------------------

const STOCK_RACE = Object.freeze({ topSpeed: 1, accel: 1, grip: 1, boost: 1, brake: 1 });

/**
 * Multipliers in the racing engine's own words (engine/shipStats.js
 * applyBuildStats), for a race inside the new game. The build's stats, then the
 * upgraded ship's change over stock (speed -> topSpeed, accel, turn -> grip).
 * With an activity whose `upgrades` is false (the classic boards) this is the
 * build's stats exactly, as today.
 */
export function raceStats(input, build = null, activity = 'race') {
  const base = (build && buildStats(build)) || STOCK_RACE;
  if (!ACTIVITIES[activity]?.upgrades) return { ...base };
  const stock = voyageShipStats(emptyLike(input), build);
  const now = voyageShipStats(input, build);
  return {
    topSpeed: r3(base.topSpeed * (now.speed / stock.speed)),
    accel: r3(base.accel * (now.accel / stock.accel)),
    grip: r3(base.grip * (now.turn / stock.turn)),
    boost: base.boost,
    brake: base.brake,
  };
}

/** Ship-fight numbers in Dogfight's words (dogfight/ships.js): hp, speed/thrust/turn scales, gun damage and heat. */
export function combatStats(input, build = null, activity = 'ship-fight') {
  const s = ACTIVITIES[activity]?.upgrades ? voyageShipStats(input, build) : { ...SHIP_BASE };
  return { hp: s.hp, speed: s.speed, thrust: s.accel, turn: s.turn, damage: s.damage, heat: s.heat };
}

/** May this activity write these boards? Upgraded activities never write the classic boards. */
export const writesBoard = (activity, board) => ACTIVITIES[activity]?.boards === board;

// The same save with no upgrades and no captain: the stock ship of the same build.
const emptyLike = (input) => ({ ...cleanSave(input), character: null, upgrades: {} });

/** 0..3: which tier of ship art to show (the average tier, rounded down). */
export function visualTier(input) {
  const save = cleanSave(input);
  const sum = UPGRADE_IDS.reduce((n, id) => n + save.upgrades[id], 0);
  return Math.min(TOP_TIER, Math.floor(sum / UPGRADE_IDS.length));
}

/** The cost of reaching `tier` (1..3) in a system, before the captain's discount; null past the top. */
export function upgradeCost(systemId, tier) {
  return UPGRADE.get(systemId)?.tiers[tier - 1]?.cost || null;
}

/** { ok, tier, cost, reasons }: the next tier, its cost after discount, and why it can't be bought yet. */
export function canUpgrade(input, systemId) {
  const save = cleanSave(input);
  if (!UPGRADE.has(systemId)) return { ok: false, tier: 0, cost: null, reasons: ['Unknown system.'] };
  const tier = save.upgrades[systemId] + 1;
  const base = upgradeCost(systemId, tier);
  if (!base) return { ok: false, tier: TOP_TIER, cost: null, reasons: ['Fully upgraded.'] };
  const cost = { money: priceFor(save, base.money || 0), items: { ...(base.items || {}) } };
  const reasons = canAfford(save, cost) ? [] : missing(save, { money: cost.money, items: cost.items });
  return { ok: reasons.length === 0, tier, cost, reasons };
}

/** Buys the next tier: { ok, save, reason }. */
export function upgrade(input, systemId) {
  const save = cleanSave(input);
  const check = canUpgrade(save, systemId);
  if (!check.ok) return { ok: false, save, reason: check.reasons[0] || 'Not available.' };
  const paid = spend(save, check.cost);
  if (!paid.ok) return { ok: false, save, reason: paid.reason };
  return { ok: true, save: cleanSave({ ...paid.save, upgrades: { ...paid.save.upgrades, [systemId]: check.tier } }), reason: '' };
}

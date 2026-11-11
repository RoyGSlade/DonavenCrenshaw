// Shop rules: Mel's gear, Edna's black market, Chibby's parts. Data lives in
// quests/data/shops.js; this file only reads it. Every function takes a save
// and returns a new one (core's spend and grant do the paying), so the hangar
// commits a purchase with one store.update and the account sync sees it.
//
//   shopView(shopId, save)                     -> what the counter shows
//   buy(save, shopId, itemId)                   -> { ok, save, events, reason, line }
//   sell(save, shopId, itemId)                  -> { ok, save, events, reason, line }
//   tryDeal(save, shopId, dealId, { rng })      -> { ok, save, events, reason, line, text, roll }
//   equip(save, itemId) / unequip(save, slot)   -> { ok, save, reason }
//   loadout(save)                               -> the on-foot kit (weapon, health, speed)
//
// Gear is items in the save (one of each) plus `save.gear = { armour, weapon }`,
// the pieces worn. Tools count just by being owned (quests ask for the item).
import { SHOPS_DATA } from '../quests/data/shops.js';
import { grant, spend, missing, check, checkChance, ITEMS, STAT_NAMES } from '../quests/core.js';
import { priceFor } from '../economy.js';

export const SHOPS = SHOPS_DATA.shops;
export const SHOP_IDS = Object.freeze(Object.keys(SHOPS));
export const GEAR = SHOPS_DATA.gear;
export const SLOTS = Object.freeze(['armour', 'weapon']);

const itemName = (id) => ITEMS[id]?.name || id;
const plain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const statValue = (save, stat) => save?.character?.stats?.[stat] ?? 0;

/** The discounts that apply at a shop right now: [{ off, why }]. */
export function discountsAt(shopId, save) {
  const out = [];
  for (const d of SHOPS[shopId]?.discounts || []) {
    const on = d.boon ? statValue(save, d.boon.stat) >= d.boon.at : missing(save, d.requires || {}).length === 0;
    if (on) out.push({ off: d.off, why: d.why });
  }
  return out;
}

/** A money price at a shop: core's charisma/skill discount, then the shop's own. */
export function priceAt(shopId, save, money) {
  const base = priceFor(save, money || 0);
  const off = Math.min(60, discountsAt(shopId, save).reduce((n, d) => n + d.off, 0));
  return Math.max(0, Math.round(base * (1 - off / 100)));
}

function costOf(shopId, save, price = {}) {
  const cost = {};
  if (price.money) cost.money = priceAt(shopId, save, price.money);
  if (plain(price.items) && Object.keys(price.items).length) cost.items = { ...price.items };
  return cost;
}

function lineOf(shopId, key) {
  const l = SHOPS[shopId]?.lines?.[key];
  return l ? l.line : null;
}

function entryFor(shopId, itemId) {
  return (SHOPS[shopId]?.stock || []).find((s) => s.item === itemId) || null;
}

/** Why an item cannot be bought now ([] = it can), with the price it would cost. */
function blockers(shopId, save, entry) {
  const reasons = [];
  const have = save.items?.[entry.item] || 0;
  const cap = Math.min(entry.limit ?? Infinity, ITEMS[entry.item]?.max ?? Infinity);
  if (have + (entry.qty || 1) > cap) reasons.push(have >= cap && cap === 1 ? 'You have one.' : 'You can\'t carry more.');
  reasons.push(...missing(save, entry.requires || {}));
  const cost = costOf(shopId, save, entry.price);
  if (!reasons.length) reasons.push(...missing(save, { money: cost.money, items: cost.items }));
  return { reasons, cost };
}

/** Everything the counter shows, already priced for this captain. */
export function shopView(shopId, save) {
  const shop = SHOPS[shopId];
  if (!shop) return null;
  const gear = gearOf(save);
  return {
    id: shopId,
    name: shop.name,
    keeper: shop.keeper,
    station: shop.station,
    blurb: shop.blurb,
    money: save.money || 0,
    discounts: discountsAt(shopId, save),
    stock: shop.stock.map((entry) => {
      const { reasons, cost } = blockers(shopId, save, entry);
      const locked = missing(save, entry.requires || {});
      return {
        item: entry.item,
        name: itemName(entry.item),
        qty: entry.qty || 1,
        blurb: entry.blurb || '',
        note: entry.note || '',
        rep: entry.rep || null,
        cost,
        list: entry.price?.money || 0,
        owned: save.items?.[entry.item] || 0,
        gear: GEAR[entry.item] ? { slot: GEAR[entry.item].slot, text: GEAR[entry.item].text } : null,
        locked: locked.length > 0,
        ok: reasons.length === 0,
        reasons,
      };
    }),
    buys: (shop.buys || []).filter((b) => (save.items?.[b.item] || 0) > 0).map((b) => ({ item: b.item, name: itemName(b.item), money: b.money, owned: save.items[b.item], worn: Object.values(gear).includes(b.item) })),
    deals: (shop.deals || []).map((d) => {
      const cost = costOf(shopId, save, d.price);
      const reasons = missing(save, { money: cost.money, items: cost.items });
      const mod = (save.character?.stats?.[d.check.stat] ?? 3) - 3;
      return { id: d.id, name: d.name, blurb: d.blurb, cost, stat: d.check.stat, statName: STAT_NAMES[d.check.stat] || d.check.stat, dc: d.check.dc, mod, chance: save.character ? checkChance(save.character, d.check) : 0, ok: reasons.length === 0, reasons };
    }),
    gear,
  };
}

/** Buys one stock entry. Gear goes on at once when its slot is empty. */
export function buy(save, shopId, itemId) {
  const entry = entryFor(shopId, itemId);
  if (!entry) return { ok: false, save, events: [], reason: 'Not sold here.', line: null };
  const { reasons, cost } = blockers(shopId, save, entry);
  if (reasons.length) return { ok: false, save, events: [], reason: reasons[0], line: lineOf(shopId, entry.requires && missing(save, entry.requires).length ? 'locked' : 'broke') };
  const paid = spend(save, cost);
  if (!paid.ok) return { ok: false, save, events: [], reason: paid.reason, line: lineOf(shopId, 'broke') };
  const out = grant(paid.save, { items: { [entry.item]: entry.qty || 1 }, ...(entry.rep ? { rep: entry.rep } : {}) });
  let next = out.save;
  const events = [{ type: 'spent', money: cost.money || 0, items: cost.items || {} }, ...out.events];
  const g = GEAR[entry.item];
  if (g && SLOTS.includes(g.slot) && !gearOf(next)[g.slot]) next = equip(next, entry.item).save;
  return { ok: true, save: next, events, reason: '', line: lineOf(shopId, 'buy') };
}

/** Sells one of an item the shop buys. Worn gear comes off first. */
export function sell(save, shopId, itemId) {
  const offer = (SHOPS[shopId]?.buys || []).find((b) => b.item === itemId);
  if (!offer) return { ok: false, save, events: [], reason: 'They don\'t buy that here.', line: null };
  const paid = spend(save, { items: { [itemId]: 1 } });
  if (!paid.ok) return { ok: false, save, events: [], reason: paid.reason, line: null };
  const out = grant(paid.save, { money: offer.money });
  let next = out.save;
  if (!(next.items?.[itemId] > 0)) for (const slot of SLOTS) if (gearOf(next)[slot] === itemId) next = unequip(next, slot).save;
  return { ok: true, save: next, events: [{ type: 'item', id: itemId, amount: -1, total: next.items?.[itemId] || 0 }, ...out.events], reason: '', line: lineOf(shopId, 'sell') };
}

/** A risky deal: pay, roll the attempt (2d6 + stat bonus vs the target, contract section 6), take what comes. */
export function tryDeal(save, shopId, dealId, { rng = Math.random } = {}) {
  const deal = (SHOPS[shopId]?.deals || []).find((d) => d.id === dealId);
  if (!deal) return { ok: false, save, events: [], reason: 'No such deal.', line: null };
  if (!save.character) return { ok: false, save, events: [], reason: 'Sign on a captain first.', line: null };
  const cost = costOf(shopId, save, deal.price);
  const paid = spend(save, cost);
  if (!paid.ok) return { ok: false, save, events: [], reason: paid.reason, line: lineOf(shopId, 'broke') };
  const roll = check(paid.save.character, deal.check, rng);
  const side = roll.pass ? deal.pass : deal.fail;
  const out = grant(paid.save, side.reward || {});
  return { ok: true, save: out.save, events: out.events, reason: '', text: side.text, roll, pass: roll.pass, line: lineOf(shopId, side.line) || null };
}

/** The pieces worn: { armour, weapon } (ids or null), repaired against the items owned. */
export function gearOf(save) {
  const worn = plain(save?.gear) ? save.gear : {};
  const out = {};
  for (const slot of SLOTS) {
    const id = worn[slot];
    out[slot] = typeof id === 'string' && GEAR[id]?.slot === slot && (save.items?.[id] || 0) > 0 ? id : null;
  }
  return out;
}

export function equip(save, itemId) {
  const g = GEAR[itemId];
  if (!g || !SLOTS.includes(g.slot)) return { ok: false, save, reason: 'That isn\'t worn.' };
  if (!(save.items?.[itemId] > 0)) return { ok: false, save, reason: `You don't have a ${itemName(itemId)}.` };
  return { ok: true, save: { ...save, gear: { ...gearOf(save), [g.slot]: itemId } }, reason: '' };
}

export function unequip(save, slot) {
  if (!SLOTS.includes(slot)) return { ok: false, save, reason: 'No such slot.' };
  return { ok: true, save: { ...save, gear: { ...gearOf(save), [slot]: null } }, reason: '' };
}

/**
 * The on-foot kit for the shooter (voyage/onfoot): the weapon in its tuning
 * shape (the starting sidearm when nothing better is worn), the extra health
 * and the speed change (a multiplier part: speed * (1 + footSpeed)).
 */
export function loadout(save) {
  const gear = gearOf(save);
  const armour = gear.armour ? GEAR[gear.armour] : null;
  const weapon = gear.weapon ? GEAR[gear.weapon].weapon : SHOPS_DATA.sidearm;
  let footSpeed = armour?.footSpeed || 0;
  for (const [id, g] of Object.entries(GEAR)) if (g.slot === 'tool' && (save.items?.[id] || 0) > 0) footSpeed += g.footSpeed || 0;
  return {
    weapon: { id: gear.weapon || 'sidearm', ...weapon },
    armour: gear.armour,
    footHp: armour?.footHp || 0,
    footSpeed: Math.round(footSpeed * 1000) / 1000,
    tools: Object.keys(GEAR).filter((id) => GEAR[id].slot === 'tool' && (save.items?.[id] || 0) > 0),
  };
}

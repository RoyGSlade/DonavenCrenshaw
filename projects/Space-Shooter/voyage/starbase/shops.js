// The star base's three counters, in the shops module's own shape (quests/data/shops.js, STUDIO-SCHEMA.md "Shops"), bought and
// sold through shops/shop.js and shown by shops/ui.js like Mel's and Edna's. They are registered with addShop, so the hangar's
// three (SHOP_IDS) are untouched. Prices are graybox numbers, set to be easy to change: they are all here.
//   starbase-fuel      the pump in the fuel and repair bay
//   starbase-noodles   the noodle stall: a bowl is a kit item; eating one gives the Fed buff (base.js eatMeal)
//   starbase-store     the general store
import { addShop } from '../shops/shop.js';

export const STARBASE_SHOPS = {
  'starbase-fuel': {
    name: 'Fuel pump', keeper: null, station: 'sb-bay', blurb: 'Your own pump. Cheaper than Chibby, and it has a meter that actually works.',
    lines: {}, discounts: [],
    stock: [
      { item: 'fuel-cell', price: { money: 60 }, qty: 1, blurb: 'A fuel cell, pumped on your own base. Engine tier 3 wants two.' },
      { item: 'hull-patch', price: { money: 35 }, qty: 1, blurb: 'Slap it on mid-job and get back into a fight you were losing.' },
    ],
    buys: [{ item: 'fuel-cell', money: 30 }], deals: [],
  },
  'starbase-noodles': {
    name: 'Noodle stall', keeper: null, station: 'sb-noodles', blurb: 'One pot, always hot. Nobody is sure who the cook is.',
    lines: {}, discounts: [],
    stock: [
      { item: 'noodle-bowl', price: { money: 12 }, qty: 1, blurb: 'A hot bowl. Eat it for ten minutes of feeling sharp.' },
    ],
    buys: [], deals: [],
  },
  'starbase-store': {
    name: 'General store', keeper: null, station: 'sb-store', blurb: 'A little of everything, on a shelf that used to be a cargo rail.',
    lines: {}, discounts: [],
    stock: [
      { item: 'medkit', price: { money: 35 }, qty: 1, blurb: 'A jab of the good stuff. Gets you back up once in a job, on foot.' },
      { item: 'scrap', price: { money: 8 }, qty: 2, blurb: 'Two bits of good scrap. Every tier 1 and 2 upgrade wants some.' },
      { item: 'circuit', price: { money: 55 }, qty: 1, blurb: 'A clean circuit board. Tier 2 and 3 upgrades need them.' },
      { item: 'shield-cell', price: { money: 50 }, qty: 1, blurb: 'A one-shot shield burst.' },
    ],
    buys: [{ item: 'scrap', money: 2 }, { item: 'ore', money: 6 }, { item: 'circuit', money: 20 }], deals: [],
  },
};

let added = false;
/** Register the three counters with the shops module (once). */
export function registerStarbaseShops() {
  if (added) return;
  for (const [id, def] of Object.entries(STARBASE_SHOPS)) addShop(id, def);
  added = true;
}

// The star base, tier 1 (the dock strip): the claim, the save, the layout, the places, the units' shops, the hop home, the dock stand-in.
// Pure modules, no browser (tests/stardust-starbase-browser.test.mjs is the walk-through).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptySave, cleanSave, encodeSave, decodeSave, MAX_SAVE_BYTES } from '../projects/Space-Shooter/voyage/save.js';
import { BASE_VERSION, CLAIM_FLAG, BASE_ID, BASE_MAPS, UNITS, UNIT_IDS, SLOT_COUNT, MEAL, layoutFor, newBase, cleanBase, claimBase, seedFor, hashSeed, eatMeal, buffMinutes, buffBonus, unitsOf } from '../projects/Space-Shooter/voyage/starbase/base.js';
import { buildMaps, SLOT_POS } from '../projects/Space-Shooter/voyage/starbase/maps.js';
import { registerStarbase } from '../projects/Space-Shooter/voyage/starbase/index.js';
import { dockAtBase } from '../projects/Space-Shooter/voyage/starbase/dock.js';
import { STARBASE_SHOPS, registerStarbaseShops } from '../projects/Space-Shooter/voyage/starbase/shops.js';
import { SHOP_IDS, SHOPS, shopView, buy } from '../projects/Space-Shooter/voyage/shops/shop.js';
import { SHOPS_DATA } from '../projects/Space-Shooter/voyage/quests/data/shops.js';
import { QUESTS } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { QUEST_LIST } from '../projects/Space-Shooter/voyage/quests/data/quests/index.js';
import { startQuest, act, availability } from '../projects/Space-Shooter/voyage/quests/engine.js';
import { explore, apply } from '../projects/Space-Shooter/voyage/quests/explore.js';
import { validateQuest } from '../projects/Space-Shooter/voyage/quests/validate.js';
import { testCharacter, emptySave as coreEmptySave } from '../projects/Space-Shooter/voyage/quests/core.js';
import { MAP_DEFS, SECTOR_MAP, GIVER_PLACES, getMap } from '../projects/Space-Shooter/voyage/maps/index.js';
import { compileMap } from '../projects/Space-Shooter/voyage/onfoot/rules/mapdata.js';
import { validateMap } from '../projects/Space-Shooter/voyage/procgen/index.js';
import { createHop, stepHop, PLACES, BASE_PLACE, GIVER_PLACE } from '../projects/Space-Shooter/voyage/explore/rules.js';
import { CRAFT_LIST, startCraft, loadoutOf } from '../projects/Space-Shooter/voyage/starbase/craft.js';
import DESIGN from '../projects/Space-Shooter/voyage/starbase/design-sheet.json' with { type: 'json' };

const captain = (id = 'c-abc123') => ({ ...testCharacter({ cha: 4, con: 4, dex: 4, wis: 4, str: 4 }), id });
const claimed = (id) => claimBase({ ...emptySave(), character: captain(id), money: 500, flags: { [CLAIM_FLAG]: 1 } });
const bytes = (v) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)).length;

// --- the save ------------------------------------------------------------------------------------------------------------------
test('an old save without a base loads exactly as before: no base key appears', () => {
  const old = JSON.stringify({ v: 1, updatedAt: 5, money: 40, items: { scrap: 2 }, flags: { 'fragment-3': 1 }, rep: { garrity: 8 } });
  const loaded = decodeSave(old);
  assert.equal('base' in loaded, false);
  assert.equal(loaded.money, 40);
  assert.deepEqual(cleanSave(emptySave()), emptySave());
  assert.equal('base' in emptySave(), false);
  assert.equal(encodeSave(emptySave()), JSON.stringify(emptySave()), 'an empty save encodes the same text as before the base existed');
});

test('the save round-trips the base block, versioned and small', () => {
  const save = claimed();
  assert.equal(save.base.v, BASE_VERSION);
  assert.equal(save.base.tier, 1);
  const text = encodeSave(save);
  const back = decodeSave(text);
  assert.deepEqual(back.base, save.base);
  assert.deepEqual(decodeSave(encodeSave(back)).base, save.base, 'a second round trip changes nothing');
  assert.ok(bytes(save.base) < 300, `the base block is ${bytes(save.base)} bytes`);
});

test('a base block with a meal buff round-trips too, and a damaged one is repaired', () => {
  const s = claimed();
  const fed = { ...s, base: { ...s.base, buff: { id: MEAL.id, until: 1_700_000_600_000 } } };
  assert.deepEqual(decodeSave(encodeSave(fed)).base.buff, { id: 'fed', until: 1_700_000_600_000 });
  const broken = cleanBase({ v: 9, tier: 99, seed: -5, slots: { bay: 1, noodles: 1, store: 9, board: 'x' }, holds: { bay: 'NOT VALID!', store: 7 }, buff: { id: 'poison', until: 'soon' } });
  assert.equal(broken.v, BASE_VERSION);
  assert.equal(broken.tier, 3, 'tier is kept inside 1..3');
  assert.deepEqual(Object.values(broken.slots).sort(), [0, 1, 2, 3], 'a damaged layout falls back to the seed\'s own: one unit per slot');
  assert.equal(broken.holds.bay, UNITS.bay.holds);
  assert.equal('buff' in broken, false);
  for (const junk of [null, 5, 'x', [], undefined]) assert.equal(cleanBase(junk), null);
});

test('the save stays under its size cap with the base, and the base adds only a few hundred bytes', () => {
  const full = { ...emptySave(), character: captain(), money: 9999, items: Object.fromEntries(['scrap', 'ore', 'circuit', 'fuel-cell', 'noodle-bowl', 'medkit'].map((i) => [i, 9])), flags: { [CLAIM_FLAG]: 1, 'fragment-3': 1 } };
  const before = encodeSave(full), after = encodeSave(claimBase(full));
  assert.ok(before && after, 'both encode (under the cap)');
  assert.ok(bytes(after) < MAX_SAVE_BYTES);
  const added = bytes(after) - bytes(before);
  console.log(`# save size: ${bytes(before)} bytes before the claim, ${bytes(after)} after (+${added}); the cap is ${MAX_SAVE_BYTES}`);
  assert.ok(added > 0 && added < 300);
});

// --- the claim ------------------------------------------------------------------------------------------------------------------
test('claimBase needs the flag; without it the save is returned untouched', () => {
  const plain = { ...emptySave(), character: captain() };
  assert.equal(claimBase(plain), plain);
  const s = claimBase({ ...plain, flags: { [CLAIM_FLAG]: 1 } });
  assert.ok(s.base);
  assert.equal(claimBase(s), s, 'claiming again changes nothing');
});

// --- the layout ------------------------------------------------------------------------------------------------------------------
test('the layout is the same for the same seed, and a seed gives every unit its own slot', () => {
  for (const seed of [1, 7, 12345, 0xdeadbeef]) {
    const a = layoutFor(seed), b = layoutFor(seed);
    assert.deepEqual(a, b);
    assert.deepEqual(Object.keys(a.slots).sort(), [...UNIT_IDS].sort());
    assert.deepEqual(Object.values(a.slots).sort(), [...Array(SLOT_COUNT).keys()]);
    for (const id of UNIT_IDS) assert.equal(a.holds[id], UNITS[id].holds);
  }
  const variety = new Set(Array.from({ length: 60 }, (_, i) => JSON.stringify(layoutFor(i + 1).slots)));
  assert.ok(variety.size >= 6, `${variety.size} different layouts in 60 seeds: the seed does shuffle the concourse`);
});

test('the seed comes from the captain, so two devices with one save build one base and a rebuild never re-rolls', () => {
  assert.equal(seedFor({ character: captain('c-aaa') }), seedFor({ character: captain('c-aaa') }));
  assert.notEqual(seedFor({ character: captain('c-aaa') }), seedFor({ character: captain('c-bbb') }));
  const a = claimed('c-zzz'), b = claimed('c-zzz');
  assert.deepEqual(a.base, b.base);
  // Even if the layout rules changed later, the saved slots stand.
  const moved = cleanBase({ ...a.base, slots: { bay: 3, noodles: 2, store: 1, board: 0 } });
  assert.deepEqual(moved.slots, { bay: 3, noodles: 2, store: 1, board: 0 });
  assert.equal(hashSeed('x'), hashSeed('x'));
});

// --- the maps ------------------------------------------------------------------------------------------------------------------
test('the four places build the same from the same base, compile, and pass procgen\'s rules', () => {
  const base = claimed('c-maps').base;
  const once = JSON.stringify(buildMaps(base)), twice = JSON.stringify(buildMaps(base));
  assert.equal(once, twice, 'same base, same maps (the dresser is seeded)');
  const defs = buildMaps(base);
  assert.deepEqual(defs.map((d) => d.id), Object.values(BASE_MAPS));
  for (const d of defs) {
    const m = compileMap(d);
    assert.ok(m.interacts.length, `${d.id} has things to use`);
    assert.equal(validateMap(d).ok, true, `${d.id} passes validateMap`);
  }
});

test('every door leads somewhere real, and back; every arrival spawn exists', () => {
  const defs = Object.fromEntries(buildMaps(claimed('c-doors').base).map((d) => [d.id, d]));
  const known = { ...defs, ship: MAP_DEFS.ship };
  for (const d of Object.values(defs)) for (const door of d.doors) {
    const to = known[door.to];
    assert.ok(to, `${d.id}/${door.id} goes to ${door.to}`);
    assert.ok(to.spawns[door.arrive], `${door.to} has a ${door.arrive} spawn`);
    if (door.to !== 'ship') assert.ok(to.doors.some((x) => x.to === d.id), `${door.to} has a door back to ${d.id}`);
  }
  assert.ok(defs[BASE_MAPS.airlock].spawns['from-dock'], 'the hop arrives at from-dock');
  assert.ok(MAP_DEFS.ship.spawns['from-dock'], 'the ship\'s ramp comes out at the dock spawn too');
});

test('the concourse has the four units in the slots the base names, each with one walk-up spot; the rooms have theirs', () => {
  for (const id of ['c-one', 'c-two', 'c-three', 'c-four']) {
    const base = claimed(id).base;
    const concourse = buildMaps(base)[1];
    const compiled = compileMap(concourse);
    const stations = compiled.interacts.filter((i) => String(i.id).startsWith('sb-'));
    assert.deepEqual(stations.map((s) => s.id).sort(), UNIT_IDS.map((u) => `sb-${u}`).sort(), 'exactly the four tier-1 units');
    for (const u of unitsOf(base)) {
      const s = stations.find((x) => x.id === `sb-${u.id}`);
      const [bx, by] = SLOT_POS[u.slot];
      assert.ok(s.x / 48 >= bx && s.x / 48 <= bx + 3 && s.y / 48 >= by && s.y / 48 <= by + 2, `${u.id} stands in slot ${u.slot} (${s.x / 48}, ${s.y / 48})`);
    }
  }
  const [, , workshop, galley] = buildMaps(claimed('c-rooms').base);
  assert.deepEqual(compileMap(workshop).interacts.filter((i) => i.kind === 'station').map((i) => i.id), ['sb-workbench']);
  assert.deepEqual(compileMap(galley).interacts.filter((i) => i.kind === 'station').map((i) => i.id), ['sb-galley']);
});

test('the base maps are not in the shared map list, and registering them makes them walkable', () => {
  for (const id of Object.values(BASE_MAPS)) assert.equal(MAP_DEFS[id], undefined);
  assert.deepEqual(Object.keys(GIVER_PLACES).sort(), ['garrity', 'hask', 'vey'], 'the base is no quest giver\'s place');
  registerStarbase(claimed('c-reg').base);
  for (const id of Object.values(BASE_MAPS)) assert.equal(getMap(id).id, id);
});

test('the design sheet carries the settlement checklist', () => {
  for (const key of ['purpose', 'ruler', 'trade', 'defence', 'threePlaces', 'threePeople', 'currentProblem', 'secret', 'services', 'hooks']) assert.ok(DESIGN[key], key);
  assert.equal(DESIGN.threePlaces.length, 3);
  assert.equal(DESIGN.threePeople.length, 3);
  for (const p of DESIGN.threePeople) assert.ok(p.publicGoal && p.privateGoal && p.vulnerability);
});

// --- Dead Weight: keep or sell ---------------------------------------------------------------------------------------------
const DW = QUESTS['dead-weight'];
const strong = () => ({ ...coreEmptySave(), money: 100, character: { ...testCharacter({ cha: 6, con: 6, dex: 6, wis: 6, str: 6 }), levels: Object.fromEntries(['shooting', 'piloting', 'stealth', 'hacking', 'repair', 'crafting', 'social', 'navigation'].map((id) => [id, 9])) } });

test('Dead Weight still validates, and every existing node, step and ending is word for word what was approved', () => {
  assert.deepEqual(validateQuest(DW, QUESTS), [], 'no validator errors');
  const view = (q) => {
    const nodes = Object.fromEntries(Object.entries(q.nodes).filter(([id]) => !['keep-or-sell', 'end-kept'].includes(id)).map(([id, n]) => [id, id === 'haul' ? { ...n, cases: n.cases.filter((c) => c.to !== 'keep-or-sell') } : n]));
    const steps = q.steps.map((s) => ({ ...s, nodes: s.nodes.filter((n) => !['keep-or-sell', 'end-kept'].includes(n)) }));
    return JSON.stringify({ ...q, nodes, steps });
  };
  // sha256 of the approved quest before the star base (everything but the two new nodes, the one inserted branch case and their two step entries).
  assert.equal(createHash('sha256').update(view(DW)).digest('hex'), 'f893dab34d82ec1eca915a281824040cc73477b7dd4cc2c2ee82225fd1b33e46');
  assert.equal(DW.nodes['end-sold'].text, 'Actual credits. That\'s how you know it\'s good. The log says the Knock came from your licence. Funny old universe.');
});

const endsOf = (save, seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) => explore(DW, save, { seeds });
const replay = (save, found) => {
  let { run, save: s } = startQuest(DW, save, { seed: found.seed });
  for (const action of found.path) ({ run, save: s } = apply(DW, run, s, action));
  return s;
};

test('the tow ending now offers keep or sell; keeping sets the claim flag and nothing else changes', () => {
  const found = endsOf(strong());
  assert.deepEqual(found.errors, []);
  const kept = found.ends.get('end-kept');
  assert.ok(kept, 'the keep ending is reachable');
  const after = replay(strong(), kept);
  assert.equal(after.flags[CLAIM_FLAG], 1, 'the claim flag is set');
  assert.equal(after.flags['fragment-3'], 1, 'the Knock fragment still comes with it');
  assert.equal(after.money, 100, 'keeping the hulk pays no credits');
  assert.equal(after.quests.done['dead-weight'].outcome, 'kept-hulk');
  assert.ok(after.account.unlocks.includes('badge:dead-weight'));
  assert.equal(claimBase(after).base.tier, 1, 'and the claim flag gives you the base');
});

test('selling is today\'s ending: same credits, no claim flag', () => {
  const sold = endsOf(strong()).ends.get('end-sold');
  assert.ok(sold, 'the sell ending is reachable');
  const after = replay(strong(), sold);
  assert.equal(after.flags[CLAIM_FLAG], undefined);
  assert.equal(after.flags['fragment-3'], 1);
  assert.ok(after.money > 100, 'credits paid');
  assert.equal(after.quests.done['dead-weight'].outcome, 'sold-whole');
});

test('every other ending is untouched, and a captain who already has the base goes straight to the old sale', () => {
  const found = endsOf(strong());
  for (const id of ['end-engine', 'end-salvaged', 'end-shared', 'end-scraps', 'end-ceded', 'end-beaten', 'end-snapped']) {
    if (!found.ends.has(id)) continue;
    assert.equal(replay(strong(), found.ends.get(id)).flags[CLAIM_FLAG], undefined, `${id} does not claim`);
  }
  const have = { ...strong(), flags: { [CLAIM_FLAG]: 1 } };
  const again = endsOf(have);
  assert.equal(again.ends.has('end-kept'), false, 'no second base');
  assert.ok(again.ends.has('end-sold'), 'the tow still sells');
  assert.equal(availability(DW, have).ok, true, 'the job still repeats');
});

test('the new lines are voiced like the rest (a line id, an emotion and a direction)', () => {
  for (const id of ['keep-or-sell', 'end-kept']) {
    const n = DW.nodes[id];
    assert.match(n.line, /^garrity\.dead-weight\.\w+$/);
    assert.ok(n.emotion && n.direction && n.text);
  }
  assert.equal(QUEST_LIST.filter((q) => q.id === 'dead-weight').length, 1);
});

// --- the hop home --------------------------------------------------------------------------------------------------------------
test('the base is a place on the hop map, but not one of the giver places or the tutorial legs', () => {
  assert.ok(BASE_PLACE && PLACES[BASE_ID] && PLACES[BASE_ID].home);
  assert.equal(PLACES[BASE_ID].map, BASE_MAPS.airlock);
  assert.equal(SECTOR_MAP.places.some((p) => p.id === BASE_ID), false);
  assert.deepEqual(Object.keys(GIVER_PLACE).sort(), ['garrity', 'hask', 'vey']);
});

// A plain pilot: steer at the base, boost while far, ease off near it (the shared autopilot helper stalls just outside the ring from some places).
const pilot = (h) => {
  const s = h.ship, dest = PLACES[h.to];
  const want = Math.atan2(dest.y - s.y, dest.x - s.x), diff = Math.atan2(Math.sin(want - s.angle), Math.cos(want - s.angle));
  const d = Math.hypot(dest.x - s.x, dest.y - s.y), speed = Math.hypot(s.vx, s.vy);
  return { turn: Math.max(-1, Math.min(1, diff * 3)), thrust: Math.abs(diff) < 0.6 && speed < Math.max(4, d * 0.5) ? 1 : 0, brake: speed > d * 0.7 + 2, boost: d > 30 };
};
test('flying home from the hangar and from every other place arrives at the base', () => {
  for (const from of ['home', 'alpha', 'beacon', 'dustfall']) {
    const hop = createHop({ from, to: BASE_ID });
    let t = 0;
    while (!hop.arrived && t < 60 * 90) { stepHop(hop, pilot(hop)); t++; }
    assert.equal(hop.arrived, true, `from ${from}`);
    assert.equal(hop.to, BASE_ID);
    console.log(`# fly home from ${from}: ${(t / 60).toFixed(1)} s`);
  }
});

// --- the dock stand-in ---------------------------------------------------------------------------------------------------------
test('the dock stand-in resolves at once with the real game\'s result shape', async () => {
  const r = await dockAtBase({ save: claimed() });
  assert.equal(r.clean, true);
  assert.deepEqual(Object.keys(r).sort(), ['clean', 'grade', 'hullLost', 'standIn', 'timeS']);
  assert.ok(r.grade >= 0 && r.grade <= 100 && r.hullLost === 0);
});

// --- the units' shops and the meal -----------------------------------------------------------------------------------------------
test('the three base counters register without touching the hangar\'s three', () => {
  const before = JSON.stringify(SHOPS_DATA);
  registerStarbaseShops();
  registerStarbaseShops();
  assert.deepEqual(SHOP_IDS, ['mel', 'edna', 'chibby'], 'the hangar still mounts exactly three');
  assert.equal(JSON.stringify(SHOPS_DATA), before, 'the shared shop data is never changed');
  for (const id of Object.keys(STARBASE_SHOPS)) assert.ok(SHOPS[id]);
});

test('buying a bowl at the noodle stall spends credits; eating it gives a short Fed buff that runs out', () => {
  registerStarbaseShops();
  const s0 = claimed();
  const bought = buy(s0, 'starbase-noodles', 'noodle-bowl');
  assert.equal(bought.ok, true, bought.reason);
  assert.equal(bought.save.items['noodle-bowl'], 1);
  assert.equal(bought.save.money, 500 - 12);
  const t0 = 1_700_000_000_000;
  const ate = eatMeal(bought.save, t0);
  assert.equal(ate.ok, true);
  assert.equal(ate.save.items['noodle-bowl'], undefined, 'the bowl is used up');
  assert.equal(buffMinutes(ate.save, t0), MEAL.minutes);
  assert.equal(buffBonus(ate.save, t0 + 60_000), 1);
  assert.equal(buffBonus(ate.save, t0 + MEAL.minutes * 60_000 + 1), 0, 'the buff runs out');
  assert.equal(eatMeal(ate.save, t0).ok, false, 'no second bowl to eat');
  assert.equal(eatMeal({ ...emptySave(), items: { 'noodle-bowl': 1 } }, t0).ok, false, 'no base, no table');
  assert.deepEqual(decodeSave(encodeSave(ate.save)).base.buff, ate.save.base.buff);
});

test('the fuel pump and the store sell what they say, and a poor captain is told so', () => {
  registerStarbaseShops();
  const rich = claimed();
  assert.equal(buy(rich, 'starbase-fuel', 'fuel-cell').save.items['fuel-cell'], 1);
  assert.equal(buy(rich, 'starbase-store', 'medkit').ok, true);
  const poor = { ...rich, money: 0 };
  assert.equal(buy(poor, 'starbase-store', 'medkit').ok, false);
  const v = shopView('starbase-store', rich);
  assert.deepEqual(v.stock.map((s) => s.item), ['medkit', 'scrap', 'circuit', 'shield-cell']);
});

// --- the workshop's crafting ---------------------------------------------------------------------------------------------------
test('the workshop crafts with the captain\'s real level and points; one d20 sets the tier, the same roll gives the same craft', () => {
  const c = { ...captain(), levels: { crafting: 4 }, points: { crafting: { quality: 2, speed: 1, material: 0 } } };
  assert.deepEqual(loadoutOf(c).level, 4);
  assert.deepEqual(CRAFT_LIST.map((x) => x.id), ['cut', 'screw', 'bolt-plate']);
  for (const id of CRAFT_LIST.map((x) => x.id)) {
    const a = startCraft(c, id, { seed: 9, rng: () => 0.65 }), b = startCraft(c, id, { seed: 9, rng: () => 0.65 });
    assert.deepEqual(a.attempt, b.attempt);
    assert.equal(a.tier, b.tier);
    assert.equal(a.state.recipe.id, id);
    assert.ok(a.label && a.note, 'a tier word and the preview line');
  }
  const low = startCraft(c, 'cut', { rng: () => 0 }), high = startCraft(c, 'cut', { rng: () => 0.99 });
  assert.ok(high.tier > low.tier, 'a better roll gives a better tier');
  assert.ok(startCraft(c, 'cut', { tool: 'good', rng: () => 0.65 }).setup.toolWidth > startCraft(c, 'cut', { tool: 'worn', rng: () => 0.65 }).setup.toolWidth, 'a wider cutter is wider');
  assert.throws(() => startCraft(c, 'weld'), /No craft/);
});

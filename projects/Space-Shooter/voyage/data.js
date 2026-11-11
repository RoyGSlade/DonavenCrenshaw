// Voyage tuning: every name and number the character, money, rep and ship
// upgrade rules use. Rename or retune here; the rule files read only this.
// Ids are short lowercase strings and are what saves store, so rename the
// `name`, not the `id`, once players have saves.
//
// Everything below the frame decisions is a proposal (ASSUMPTIONS.md in the
// core lane names each S-question it stands in for).

export const CURRENCY = Object.freeze({ id: 'credits', name: 'Credits', short: 'cr' });

// --- Character -------------------------------------------------------------------

export const NAME_MAX = 24;
export const STAT_DIE = 6; // stats are 1d6
// A stat's effects are counted per point above (or below) this, so an average
// roll changes nothing and a 1 or a 6 is felt (S17).
export const STAT_BASELINE = 3;
// Points a new captain starts with, so the hangar has something to spend (S22).
export const START_POINTS = 2;

export const STATS = Object.freeze([
  { id: 'cha', name: 'Charisma', blurb: 'Talking, prices and how fast givers warm to you.', effects: { price: 2, rep: 5 } },
  { id: 'con', name: 'Constitution', blurb: 'Hull you can take, and staying up on foot.', effects: { 'ship.hp': 5, 'foot.hp': 10 } },
  { id: 'dex', name: 'Dexterity', blurb: 'Handling, dodging and aim.', effects: { 'ship.turn': 0.03, dodge: 1 } },
  { id: 'wis', name: 'Wisdom', blurb: 'Navigation, scanning and seeing through puzzles.', effects: { nav: 1, scan: 1, puzzle: 1 } },
]);
export const STAT_IDS = Object.freeze(STATS.map((s) => s.id));

// Three trees with a small overlap (S20, S21): an overlap skill sits in two
// trees and its points count toward both.
export const TREES = Object.freeze([
  { id: 'helm', name: 'Helm', blurb: 'Flying and finding the way.' },
  { id: 'guns', name: 'Guns', blurb: 'Fights, in the ship and on foot.' },
  { id: 'wrench', name: 'Wrench', blurb: 'Repair, tech, puzzles and trade.' },
]);

// needs: points already in a tree before the first rank can be learned.
// Each rank costs one point.
export const SKILLS = Object.freeze([
  // Helm
  { id: 'smooth-burn', name: 'Smooth Burn', trees: ['helm'], max: 3, effects: { 'ship.speed': 0.03 }, blurb: 'Top speed.' },
  { id: 'tight-turns', name: 'Tight Turns', trees: ['helm'], max: 3, effects: { 'ship.turn': 0.04 }, blurb: 'Turn rate.' },
  { id: 'star-charts', name: 'Star Charts', trees: ['helm'], max: 2, needs: { helm: 2 }, effects: { nav: 1 }, blurb: 'Better routes and fewer nasty surprises on the way.' },
  { id: 'evasive', name: 'Evasive Pilot', trees: ['helm'], max: 2, needs: { helm: 3 }, effects: { dodge: 1 }, blurb: 'Harder to hit.' },
  // Guns
  { id: 'steady-aim', name: 'Steady Aim', trees: ['guns'], max: 3, effects: { 'ship.damage': 1 }, blurb: 'Ship gun damage.' },
  { id: 'cool-barrels', name: 'Cool Barrels', trees: ['guns'], max: 3, effects: { 'ship.heat': 10 }, blurb: 'Fire longer before the gun overheats.' },
  { id: 'brawler', name: 'Brawler', trees: ['guns'], max: 2, needs: { guns: 2 }, effects: { fight: 1, 'foot.hp': 10 }, blurb: 'On-foot fights.' },
  { id: 'hard-stare', name: 'Hard Stare', trees: ['guns'], max: 1, needs: { guns: 3 }, effects: { talk: 1 }, blurb: 'Some talks go better with a threat behind them.' },
  // Wrench
  { id: 'patch-kit', name: 'Patch Kit', trees: ['wrench'], max: 3, effects: { repair: 1 }, blurb: 'Repairs go faster.' },
  { id: 'reinforced', name: 'Reinforced Hull', trees: ['wrench'], max: 3, effects: { 'ship.hp': 10 }, blurb: 'More hull.' },
  { id: 'slicer', name: 'Slicer', trees: ['wrench'], max: 2, needs: { wrench: 2 }, effects: { hack: 1, puzzle: 1 }, blurb: 'Locks, terminals and puzzles.' },
  { id: 'smooth-talk', name: 'Smooth Talker', trees: ['wrench'], max: 2, effects: { talk: 1, rep: 5 }, blurb: 'Dialogue checks and rep.' },
  { id: 'haggler', name: 'Haggler', trees: ['wrench'], max: 2, needs: { wrench: 1 }, effects: { trade: 1, price: 3 }, blurb: 'Cheaper upgrades and better trades.' },
  // Overlap: one skill, two trees
  { id: 'strafe-run', name: 'Strafe Run', trees: ['helm', 'guns'], max: 2, needs: { helm: 1, guns: 1 }, effects: { 'ship.damage': 1, dodge: 1 }, blurb: 'Fly and fight at once.' },
  { id: 'field-patch', name: 'Field Patch', trees: ['guns', 'wrench'], max: 2, needs: { guns: 1, wrench: 1 }, effects: { repair: 1, 'foot.hp': 5 }, blurb: 'Fix things while they shoot at you.' },
  { id: 'nav-computer', name: 'Nav Computer', trees: ['helm', 'wrench'], max: 2, needs: { helm: 1, wrench: 1 }, effects: { nav: 1, scan: 1, 'ship.cargo': 1 }, blurb: 'Smarter routes and a tidier hold.' },
]);

// Death (P4, Donaven: "they lose half of their skill points and roll fresh
// stats"). The half lost is rounded down; every learned skill is refunded so
// the player spends what is left again. Permanent (max-rep) points are kept.
export const DEATH = Object.freeze({ keepShare: 0.5, refundSkills: true, rerollStats: true });

// Small customisation (S26): a portrait and a colour.
export const PORTRAITS = Object.freeze([
  { id: 'p1', name: 'Courier' }, { id: 'p2', name: 'Mechanic' }, { id: 'p3', name: 'Gunner' }, { id: 'p4', name: 'Navigator' },
]);
export const COLORS = Object.freeze(['#81e6df', '#ffad72', '#b9a4ff', '#9fe870', '#f4d35e', '#ff8fa3']);

// --- Money and reputation -----------------------------------------------------------

export const MONEY_MAX = 9_999_999;
export const REP_MAX = 100;
export const ITEM_STACK_MAX = 999;

// Quest givers (S29: the world lane's recommended three, until Donaven picks;
// S28: one rep number each). Ids match world/QUEST-GIVERS.md; ilvane and
// mallory are written up there as swap-ins and only need a line here.
export const GIVERS = Object.freeze([
  { id: 'hask', name: 'Stationmaster Orrin Hask', short: 'Hask', faction: 'Relay Guild' },
  { id: 'vey', name: 'Lucan Vey', short: 'Vey', faction: 'Beacon Prime (unaligned)' },
  { id: 'garrity', name: 'Hob Garrity', short: 'Garrity', faction: 'Driftborn' },
]);

// Rep bands, for showing a number as a word.
export const REP_BANDS = Object.freeze([
  { min: 0, name: 'Stranger' }, { min: 20, name: 'Known' }, { min: 45, name: 'Trusted' }, { min: 75, name: 'Ally' }, { min: 100, name: 'Sworn' },
]);

// Reaching REP_MAX with a giver pays this once per save. Donaven's answer to
// S30 (2026-11-11): 1 permanent skill point (safe from death) plus that giver's
// own livery and title on the account. Cosmetic only, never a board.
export const MAX_REP_REWARDS = Object.freeze({
  hask: { permanent: 1, unlocks: ['title:lane-warden', 'paint:guild-livery'] },
  vey: { permanent: 1, unlocks: ['title:beacon-regular', 'paint:gilded'] },
  garrity: { permanent: 1, unlocks: ['title:dustfall-made', 'paint:scrapper-livery'] },
});

export const UNLOCK_KINDS = Object.freeze(['title', 'paint', 'decal', 'badge']);
export const UNLOCK_NAMES = Object.freeze({
  'title:lane-warden': 'Title: Lane Warden',
  'paint:guild-livery': 'Paint: Guild livery',
  'title:beacon-regular': 'Title: Beacon Regular',
  'paint:gilded': 'Paint: Gilded trim',
  'title:dustfall-made': 'Title: Dustfall Made',
  'paint:scrapper-livery': 'Paint: Scrapper livery',
});

// Items (S40: railgun is the first item quest). `max` caps a stack.
export const ITEMS = Object.freeze([
  { id: 'scrap', name: 'Scrap', kind: 'material', max: ITEM_STACK_MAX },
  { id: 'ore', name: 'Ore', kind: 'material', max: ITEM_STACK_MAX },
  { id: 'circuit', name: 'Circuit board', kind: 'part', max: 99 },
  { id: 'fuel-cell', name: 'Fuel cell', kind: 'part', max: 99 },
  { id: 'permit', name: 'Docking permit', kind: 'key', max: 1 },
  { id: 'nav-chip', name: 'Nav chip', kind: 'part', max: 9 },
  { id: 'railgun', name: 'Railgun', kind: 'part', max: 9 },
  { id: 'cargo-crate', name: 'Cargo crate', kind: 'cargo', max: 99 },
]);

// --- The Voyage ship -----------------------------------------------------------------
// Voyage only. Nothing here reaches racing, the weekly, Dogfight or any board.

export const SHIP_BASE = Object.freeze({ hp: 100, speed: 1, accel: 1, turn: 1, damage: 10, heat: 100, cargo: 4 });
// How much of the equipped racing build's character carries over (0: none,
// 1: all), so the same ship still flies a little like itself.
export const BUILD_FEEL = 0.5;
export const SHIP_STAT_NAMES = Object.freeze({
  hp: 'Hull', speed: 'Speed', accel: 'Acceleration', turn: 'Handling', damage: 'Gun damage', heat: 'Gun heat', cargo: 'Cargo',
});

// Four systems, tiers 1-3 on top of stock (S9, S10). Tier 3 also needs a part
// that quests hand out (the railgun for guns). Each tier's `add` is added to the
// ship stats; costs are money (shop discounts apply) and items.
export const UPGRADES = Object.freeze([
  {
    id: 'hull', name: 'Hull plating', tiers: [
      { add: { hp: 20 }, cost: { money: 150, items: { scrap: 4 } } },
      { add: { hp: 25 }, cost: { money: 400, items: { scrap: 8, ore: 4 } } },
      { add: { hp: 35, cargo: 1 }, cost: { money: 900, items: { ore: 8, circuit: 2 } } },
    ],
  },
  {
    id: 'engine', name: 'Engine', tiers: [
      { add: { speed: 0.05, accel: 0.04 }, cost: { money: 150, items: { scrap: 4 } } },
      { add: { speed: 0.05, accel: 0.04 }, cost: { money: 400, items: { scrap: 6, circuit: 1 } } },
      { add: { speed: 0.07, accel: 0.05 }, cost: { money: 900, items: { 'fuel-cell': 2, circuit: 2 } } },
    ],
  },
  {
    id: 'thrusters', name: 'Thrusters', tiers: [
      { add: { turn: 0.05 }, cost: { money: 120, items: { scrap: 3 } } },
      { add: { turn: 0.06 }, cost: { money: 350, items: { scrap: 5, circuit: 1 } } },
      { add: { turn: 0.08 }, cost: { money: 800, items: { 'nav-chip': 1, circuit: 1 } } },
    ],
  },
  {
    id: 'guns', name: 'Guns', tiers: [
      { add: { damage: 2, heat: 10 }, cost: { money: 200, items: { scrap: 5 } } },
      { add: { damage: 3, heat: 15 }, cost: { money: 500, items: { ore: 4, circuit: 1 } } },
      { add: { damage: 6, heat: 20 }, cost: { money: 1000, items: { railgun: 1 } } },
    ],
  },
]);
export const UPGRADE_IDS = Object.freeze(UPGRADES.map((u) => u.id));
export const TOP_TIER = 3;

// --- Where upgrades count (S12, S66; Donaven 2026-11-11: racing and Dogfight fold
// into the new game as activities) ---
// upgrades: does the upgraded ship and the captain fly this activity?
// boards: which leaderboards it may write. 'classic' are today's five-circuit and
// weekly boards: they stay exactly as they are, flown with the stock build, so old
// times and ghosts keep their meaning. Activities with upgrades never write them.
export const ACTIVITIES = Object.freeze({
  'classic-race': { name: 'Classic circuits and weekly', upgrades: false, boards: 'classic' },
  'race': { name: 'Race (quest leg or hub circuit)', upgrades: true, boards: 'none' },
  'ship-fight': { name: 'Ship fight (quests, events)', upgrades: true, boards: 'none' },
  'arena': { name: 'Dogfight arena (2-3 players)', upgrades: false, boards: 'dogfight' },
});

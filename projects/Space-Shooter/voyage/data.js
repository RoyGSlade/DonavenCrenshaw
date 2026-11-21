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
// What a new captain signs on with (S27, slice tuning): enough that the first
// paid job puts a tier-1 hull or thruster upgrade in reach. Paid once, when the
// captain is made; a death does not pay it again.
export const START_KIT = Object.freeze({ money: 80, items: { scrap: 4 } });

// Round 2 (story lane, lhc-lanes/stardust/story/STATS.md; Donaven 2026-11-11):
// STATS are rolled once (1d6 each) and give small passive effects (`effects`
// below). Launch (design doc Section 5, Nov 15): they no longer add to rolls
// unless CHECK.addStat is turned on; the d20 adds the SKILL LEVEL instead.
// `rolls`: the everyday attempts the stat is about (words for the player).
// `effects`: small passive numbers, per point over STAT_BASELINE (negative
// below), read with effect(c, tag). Ids are what saves keep: rename the name.

// Attempts (design doc Section 5, "The d20", confirmed Nov 15: "The d20
// replaces 2d6 everywhere. Dialogue and other non-action checks roll a d20, add
// the skill level, and must beat a difficulty number. Advantage means rolling
// twice and keeping the higher."). Every attempt is a fresh d20 + the level of
// the skill the check uses (ROLL_SKILLS, 1..9) + any extra (a ship), against a
// target (dc). A natural 20 always passes, whatever the bonus or target; it
// replaces "a double six always works" (launch tech lane assumption A1).
// alwaysFail stays off (0): a natural 1 is just a low roll. addStat (A2): when
// true the old stat bonus (stat - STAT_BASELINE) adds on top of the level.
// Named targets below (A4); content may use numbers. Old 2d6 targets were
// moved with new = 2 x old - 4 (quests/runUpgrade.js dcFrom2d6).
export const CHECK = Object.freeze({
  dice: 1,
  sides: 20,
  alwaysPass: 20,
  alwaysFail: 0,
  addStat: false,
  levels: { easy: 8, normal: 10, tough: 12, hard: 14, heroic: 18 },
});

// The eight skills of the design doc (Section 5): each levels 1..9 by use, and
// the level is what a d20 roll adds. Levels are earned from XP, which the home
// server owns (launch plan, outcome 2); until then every captain is level 1.
// Ids are what saves keep (character.levels): rename the name, not the id.
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 9;
export const ROLL_SKILLS = Object.freeze([
  { id: 'shooting', name: 'Shooting', blurb: 'Guns, in the ship and on foot.' },
  { id: 'piloting', name: 'Piloting', blurb: 'Flying, racing, dodging and landing.' },
  { id: 'stealth', name: 'Stealth', blurb: 'Moving quiet and staying unseen.' },
  { id: 'hacking', name: 'Hacking', blurb: 'Terminals, locks with brains, other ships.' },
  { id: 'repair', name: 'Repair', blurb: 'Fixing ships and things that rattle.' },
  { id: 'crafting', name: 'Crafting', blurb: 'Making parts and gear.' },
  { id: 'social', name: 'Social', blurb: 'Talking, haggling, bluffing and gambling.' },
  { id: 'navigation', name: 'Navigation', blurb: 'Scanning, noticing and finding the way.' },
]);
export const ROLL_SKILL_IDS = Object.freeze(ROLL_SKILLS.map((s) => s.id));
// The three categories of each roll skill, where level-up points go (one point per level,
// at most POINT_MAX in a category). minigames/picker.js says what each one does; a test
// keeps the two lists equal, and the Hub keeps the same list (stardustLedger CATEGORIES).
export const POINT_MAX = 9;
export const SKILL_CATEGORY_IDS = Object.freeze({
  shooting: Object.freeze(['reload', 'ammo', 'spray']),
  piloting: Object.freeze(['handling', 'boost', 'landing']),
  stealth: Object.freeze(['quiet', 'range', 'decay']),
  hacking: Object.freeze(['time', 'size', 'retries']),
  repair: Object.freeze(['time', 'size', 'quality']),
  crafting: Object.freeze(['quality', 'speed', 'material']),
  social: Object.freeze(['persuade', 'intimidate', 'haggle']),
  navigation: Object.freeze(['time', 'fuel', 'warning']),
});

// AI crew by tier (design doc Section 9, Donaven Nov 16: low skill, mistakes,
// paid per job). The page's defaults; with the home server on, the hub's
// games/stardust/rules.json "voyage" ai and wages win (sent with /v1/clock).
export const AI_CREW = Object.freeze({
  1: Object.freeze({ level: 1, mistake: 0.30, wage: 0.10 }),
  2: Object.freeze({ level: 2, mistake: 0.20, wage: 0.15 }),
  3: Object.freeze({ level: 3, mistake: 0.10, wage: 0.25 }),
});

// Which skill a check uses when it does not name one (`skill` on the check
// wins): its tag first, then its stat. null = no skill: the bare d20 (A3:
// Strength and Health have no home among the eight; the quest lane names a
// `skill` on new checks).
export const CHECK_SKILL = Object.freeze({
  byTag: Object.freeze({
    nav: 'piloting', dodge: 'piloting', race: 'piloting', fly: 'piloting',
    fight: 'shooting', shoot: 'shooting',
    talk: 'social', trade: 'social', haggle: 'social', gamble: 'social', bluff: 'social',
    scan: 'navigation', notice: 'navigation', route: 'navigation',
    hack: 'hacking', repair: 'repair', craft: 'crafting', sneak: 'stealth', hide: 'stealth',
  }),
  byStat: Object.freeze({ cha: 'social', wis: 'navigation', dex: 'piloting', str: null, con: null }),
});

export const STATS = Object.freeze([
  {
    id: 'str', name: 'Strength', blurb: 'Brawling, lifting, hauling and digging.',
    rolls: 'punching a guy when the bullets run out, lifting, hauling, digging, forcing a door',
    effects: { melee: 1, 'mine.speed': 0.1 },
  },
  {
    id: 'con', name: 'Health', blurb: 'Soaking hits and shrugging off poison, sickness and bad meatloaf.',
    rolls: 'shrugging off poison, sickness, bad air and bad meatloaf, staying on your feet',
    effects: { 'ship.hp': 5, 'foot.hp': 10 },
  },
  {
    id: 'dex', name: 'Dexterity', blurb: 'Reflexes, aim and quick hands.',
    rolls: 'dodging, slipping past, quick hands, shooting, flying tricks',
    effects: { 'ship.turn': 0.03, aim: 0.1, 'foot.speed': 0.04, 'repair.speed': 0.1 },
  },
  {
    id: 'wis', name: 'Wisdom', blurb: 'Noticing things and reading people.',
    rolls: 'noticing, scanning, finding the way, reading a lie, working out a puzzle',
    effects: { 'scan.range': 0.1, hint: 1 },
  },
  {
    id: 'cha', name: 'Charisma', blurb: 'Talking, haggling, gambling and being liked.',
    rolls: 'talking someone round, haggling, bluffing, gambling',
    effects: { price: 2, rep: 5 },
  },
]);
export const STAT_IDS = Object.freeze(STATS.map((s) => s.id));

// Three trees with a small overlap (S20, S21): an overlap skill sits in two
// trees and its points count toward both.
export const TREES = Object.freeze([
  { id: 'helm', name: 'Helm', blurb: 'Flying and finding the way.' },
  { id: 'guns', name: 'Guns', blurb: 'Fights, in the ship and on foot.' },
  { id: 'wrench', name: 'Wrench', blurb: 'Repair, tech, puzzles and trade.' },
]);

// SKILLS (the trees) UNLOCK things; they never add to a roll (Donaven, 2026-11-11: "Skills
// should be for neat stuff or locked areas"; SKILL LEVELS: each level unlocks
// any of three kinds). Each level costs one point. `max` = the number of levels.
// `needs`: points already in a tree before level 1. A skill in two trees counts
// for both. Each level's `unlocks`: { type, id, value?, text }, type one of
//   access    a gate content checks ("needs Hacker 2": door, area, lane, option)
//   activity  the skill's own minigame gets better (`value` stacks, in the
//             unit its text says: seconds, a share, a count)
//   ability   a new action (hack an enemy ship, a drift turn, a field repair)
// Ids are ROUND2-CONTRACT.md section 9; content gates with core's requirement
// { skills: { hacker: 2 } }. `text` is the player's "this lets you..." line.
export const SKILL_UNLOCK_TYPES = Object.freeze(['access', 'activity', 'ability']);
export const SKILLS = Object.freeze([
  {
    id: 'pilot', name: 'Pilot', trees: ['helm'], max: 3, blurb: 'Flying tricks and speed.',
    levels: [
      { level: 1, unlocks: [{ type: 'ability', id: 'ship.afterburner', text: 'Kick in an afterburner boost in fights and races.' }, { type: 'activity', id: 'race.boost', value: 1, text: 'One more boost charge in races.' }] },
      { level: 2, unlocks: [{ type: 'access', id: 'lane.shortcut', text: 'Fly the shortcut lanes on the sector map.' }, { type: 'ability', id: 'ship.drift', text: 'Drift: swing the nose round without losing speed.' }] },
      { level: 3, unlocks: [{ type: 'ability', id: 'ship.barrel-roll', text: 'Roll out of a locked-on shot, once a fight.' }, { type: 'activity', id: 'race.boost', value: 1, text: 'One more boost charge in races.' }] },
    ],
  },
  {
    id: 'navigator', name: 'Navigator', trees: ['helm'], max: 2, needs: { helm: 1 }, blurb: 'Finding the way, and the ways nobody charts.',
    levels: [
      { level: 1, unlocks: [{ type: 'access', id: 'poi.hidden', text: 'See hidden places on the sector map.' }, { type: 'activity', id: 'explore.scan', value: 0.25, text: 'Scanner pulse reaches 25% further.' }] },
      { level: 2, unlocks: [{ type: 'ability', id: 'trip.pick-route', text: 'Pick your own route on trips.' }, { type: 'access', id: 'lane.dark', text: 'Fly the dark lanes nobody charts.' }] },
    ],
  },
  {
    id: 'smuggler', name: 'Running Dark', trees: ['helm'], max: 2, needs: { helm: 2 }, blurb: 'Getting places without being seen.',
    levels: [
      { level: 1, unlocks: [{ type: 'ability', id: 'ship.lights-out', text: 'Kill your lights and slip past trouble on the lanes.' }, { type: 'access', id: 'option.running-dark', text: 'Sneak options in travel events.' }] },
      { level: 2, unlocks: [{ type: 'access', id: 'dock.back-door', text: 'Dock at back-door pads: no tolls, no questions.' }, { type: 'activity', id: 'stealth.time', value: 3, text: 'Stay hidden 3 seconds longer.' }] },
    ],
  },
  {
    id: 'gunner', name: 'Gunner', trees: ['guns'], max: 3, blurb: 'Turrets and ship guns.',
    levels: [
      { level: 1, unlocks: [{ type: 'activity', id: 'turret.aim', value: 0.15, text: 'Turret sway 15% steadier.' }, { type: 'ability', id: 'ship.called-shot', text: "Aim for an enemy ship's guns or engines." }] },
      { level: 2, unlocks: [{ type: 'ability', id: 'ship.overcharge', text: 'Fire one big charged shot.' }, { type: 'activity', id: 'turret.aim', value: 0.15, text: 'Turret sway another 15% steadier.' }] },
      { level: 3, unlocks: [{ type: 'ability', id: 'ship.flak', text: 'Throw up a flak screen that eats missiles.' }, { type: 'access', id: 'arena.ace', text: "Enter the arena's ace bracket." }] },
    ],
  },
  {
    id: 'brawler', name: 'Brawler', trees: ['guns'], max: 2, needs: { guns: 1 }, blurb: 'Fists, when the bullets run out.',
    levels: [
      { level: 1, unlocks: [{ type: 'ability', id: 'foot.haymaker', text: 'Throw a real haymaker on foot.' }, { type: 'access', id: 'option.brawl', text: 'Pick a fight in talks.' }] },
      { level: 2, unlocks: [{ type: 'activity', id: 'brawl.combo', value: 1, text: 'One more hit in a punch combo.' }, { type: 'access', id: 'area.fight-pit', text: "Get into the cantina's fight pit." }] },
    ],
  },
  {
    id: 'hard-stare', name: 'Hard Stare', trees: ['guns'], max: 2, needs: { guns: 2 }, blurb: 'Leaning on people.',
    levels: [
      { level: 1, unlocks: [{ type: 'access', id: 'option.threaten', text: 'Threat options in talks.' }] },
      { level: 2, unlocks: [{ type: 'ability', id: 'foot.stare-down', text: 'Make a gang back down without a fight, once a job.' }, { type: 'activity', id: 'stare.time', value: 3, text: 'Threats hold 3 seconds longer in stand-offs.' }] },
    ],
  },
  {
    id: 'mechanic', name: 'Mechanic', trees: ['wrench'], max: 3, blurb: 'Fixing ships and things that rattle.',
    levels: [
      { level: 1, unlocks: [{ type: 'ability', id: 'ship.patch', text: 'Patch the hull between fights.' }, { type: 'activity', id: 'repair.time', value: 0.2, text: 'Repairs take 20% less time.' }] },
      { level: 2, unlocks: [{ type: 'access', id: 'area.engine-room', text: 'Get into locked engine rooms and service ducts.' }, { type: 'activity', id: 'repair.time', value: 0.2, text: 'Repairs take another 20% less time.' }] },
      { level: 3, unlocks: [{ type: 'ability', id: 'ship.field-repair', text: "Repair while they're shooting at you." }] },
    ],
  },
  {
    id: 'hacker', name: 'Hacker', trees: ['wrench'], max: 3, blurb: 'Terminals, sealed doors and other ships.',
    levels: [
      { level: 1, unlocks: [{ type: 'access', id: 'terminal', text: 'Get into terminals.' }, { type: 'activity', id: 'hack.time', value: 5, text: '5 more seconds on the hack timer.' }] },
      { level: 2, unlocks: [{ type: 'access', id: 'door.sealed', text: 'Open sealed doors: warehouses, vaults, the good stuff.' }, { type: 'ability', id: 'ship.hack-jam', text: 'Hack an enemy ship to jam its guns for a round.' }] },
      { level: 3, unlocks: [{ type: 'ability', id: 'ship.hack-shields', text: "Drop an enemy ship's shields for a round." }, { type: 'activity', id: 'hack.time', value: 5, text: '5 more seconds on the hack timer.' }] },
    ],
  },
  {
    id: 'salvager', name: 'Salvager', trees: ['wrench'], max: 2, needs: { wrench: 1 }, blurb: 'Wrecks, scrap and what is inside them.',
    levels: [
      { level: 1, unlocks: [{ type: 'access', id: 'area.salvage', text: "Cut into salvage rooms on wrecks and in Garrity's yard." }, { type: 'activity', id: 'mine.sweet-spot', value: 0.2, text: 'Mining sweet spot 20% bigger.' }] },
      { level: 2, unlocks: [{ type: 'ability', id: 'foot.cutter', text: 'Cut through weak walls with a torch.' }, { type: 'activity', id: 'salvage.yield', value: 1, text: 'One more part from every salvage.' }] },
    ],
  },
  {
    id: 'lockpick', name: 'Lockpick', trees: ['wrench'], max: 2, blurb: 'Old-fashioned locks.',
    levels: [
      { level: 1, unlocks: [{ type: 'access', id: 'door.locked', text: 'Open locked crates, lockers and simple doors.' }, { type: 'activity', id: 'lock.pins', value: 1, text: 'One pin fewer on every lock.' }] },
      { level: 2, unlocks: [{ type: 'access', id: 'area.lockup', text: 'Get into lock-ups and evidence rooms.' }, { type: 'activity', id: 'lock.pins', value: 1, text: 'Another pin fewer.' }] },
    ],
  },
  {
    id: 'trader', name: 'Trader', trees: ['wrench'], max: 2, blurb: 'Deals, papers and the back shelf.',
    levels: [
      { level: 1, unlocks: [{ type: 'access', id: 'option.haggle', text: 'Haggle at shops.' }, { type: 'access', id: 'shop.back-shelf', text: "See Edna's back shelf." }] },
      { level: 2, unlocks: [{ type: 'access', id: 'option.forge', text: 'Forge permits and manifests when the paperwork says no.' }, { type: 'activity', id: 'haggle.rounds', value: 1, text: 'One more round when haggling.' }] },
    ],
  },
  {
    id: 'strafe-run', name: 'Strafe Run', trees: ['helm', 'guns'], max: 2, needs: { helm: 1, guns: 1 }, blurb: 'Flying and shooting at once.',
    levels: [
      { level: 1, unlocks: [{ type: 'ability', id: 'ship.strafe', text: 'A strafing pass: fly and fire in one move.' }] },
      { level: 2, unlocks: [{ type: 'ability', id: 'ship.wingover', text: 'Wingover: turn the fight around in one move.' }, { type: 'activity', id: 'turret.aim', value: 0.1, text: 'Turret sway 10% steadier.' }] },
    ],
  },
  {
    id: 'demolitions', name: 'Demolitions', trees: ['guns', 'wrench'], max: 2, needs: { guns: 1, wrench: 1 }, blurb: 'Things that go bang, on purpose.',
    levels: [
      { level: 1, unlocks: [{ type: 'ability', id: 'foot.charge', text: 'Set a charge to blow a door or a wall.' }, { type: 'access', id: 'door.rubble', text: 'Clear rubble-blocked doors.' }] },
      { level: 2, unlocks: [{ type: 'activity', id: 'charge.radius', value: 0.25, text: 'Charges blow 25% wider.' }, { type: 'ability', id: 'ship.mine', text: 'Drop a space mine behind you in fights.' }] },
    ],
  },
]);

// Death (P4, Donaven: "they lose half of their skill points and roll fresh
// stats"). The half lost is rounded down; every learned skill is refunded so
// the player spends what is left again. Permanent (max-rep) points are kept.
// S11 (Donaven, 2026-11-11): ship upgrades are lost on death too.
export const DEATH = Object.freeze({ keepShare: 0.5, refundSkills: true, rerollStats: true, loseUpgrades: true });

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
  // The opening slice's captain (launch slice lane): his rep is the crew's trust in you.
  { id: 'tull', name: 'Captain Augustin Tull', short: 'Tull', faction: 'The Tin Duchess' },
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
  // The opening slice's captain: no prize, his rep is only the crew's trust in you.
  tull: { permanent: 0, unlocks: [] },
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
  // Proposed by quests (INTERFACES.md 1.4): a tool you have to procure for the
  // railgun's build route at Garrity's yard.
  { id: 'mining-drill', name: 'Mining drill', kind: 'key', max: 1 },
  // Round 2 shops (content lane; prices and what each does: quests/data/shops.js).
  // Mel's gear: worn or carried on foot; quests also open options for some.
  { id: 'flak-vest', name: 'Flak vest', kind: 'gear', max: 1 },
  { id: 'plated-coat', name: 'Plated longcoat', kind: 'gear', max: 1 },
  { id: 'hardsuit', name: 'Dustfall hardsuit', kind: 'gear', max: 1 },
  { id: 'scatter-pistol', name: 'Scatter pistol', kind: 'gear', max: 1 },
  { id: 'bolt-carbine', name: 'Bolt carbine', kind: 'gear', max: 1 },
  { id: 'longshot', name: 'Longshot rifle', kind: 'gear', max: 1 },
  { id: 'breach-kit', name: 'Breach kit', kind: 'gear', max: 1 },
  { id: 'scan-goggles', name: 'Scan goggles', kind: 'gear', max: 1 },
  { id: 'mag-boots', name: 'Mag boots', kind: 'gear', max: 1 },
  { id: 'medkit', name: 'Medkit', kind: 'consumable', max: 9 },
  // Chibby's consumables: spent in jobs (a patch mid-fight, a shield cell).
  { id: 'hull-patch', name: 'Hull patch', kind: 'consumable', max: 9 },
  { id: 'shield-cell', name: 'Shield cell', kind: 'consumable', max: 9 },
  // Edna's back room: not strictly legal anywhere near the Guild.
  { id: 'ghost-transponder', name: 'Ghost transponder', kind: 'key', max: 1 },
  { id: 'syndicate-codes', name: 'Syndicate codes', kind: 'key', max: 1 },
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

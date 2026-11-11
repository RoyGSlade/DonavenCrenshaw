// Races and the arena inside the new game: tuning and copy as data (the Studio
// edits data files, never code). Read by voyage/races/*.js, the racing page's
// quest race screens (ui/questRaceUi.js) and the live crew rules
// (voyage/races/liveCrew.js).
//
// Where each activity writes (core's ACTIVITIES table, voyage/data.js):
//   quest races and the practice circuit fly the upgraded ship ('race') and
//   write NO board, NO ghost, NO personal best and NO weekly entry;
//   the arena is today's Dogfight ('arena'): today's classes and records.

// The hangar practice circuits: today's weekly layouts, flown with the
// upgraded ship. The rival is a pace over the racing game's own test pilot
// (voyage/quests/data/tracks.js pilotMs), so the bar is a real time.
export const CIRCUITS = Object.freeze([
  Object.freeze({ id: 'gantry-drop', title: 'Gantry Drop', blurb: 'The long drop and the razor hairpin. Chibby calls it "a warm-up". Chibby lies.', rival: Object.freeze({ name: "Ralph's lap", pace: 0.97 }) }),
  Object.freeze({ id: 'abandoned-mall', title: 'The Abandoned Mall', blurb: 'Dead escalators, falling debris, every shop for itself. Bring snacks.', rival: Object.freeze({ name: "Chibby's test lap", pace: 0.95 }) }),
]);

// The arena: today's Dogfight page, exactly as it is (2-3 players, today's
// classes and records). The hangar only opens it.
export const ARENA = Object.freeze({
  title: 'The Sim Pit',
  eyebrow: 'ARENA · 2-3 PILOTS',
  blurb: "Chibby's scrap-built sim pit: today's Dogfight, ship against ship. Everyone flies a stock class, so it's skill, not upgrades. Records are Dogfight's own.",
  launch: 'Climb into the pit',
  modes: Object.freeze(['Duel: you and one friend', 'Free-for-all: three pilots, one winner']),
});

// Copy for the quest race screens, in the new tone. {rival}, {track} and
// {gap} are filled in by the page with textContent.
export const RACE_COPY = Object.freeze({
  questEyebrow: 'QUEST RACE',
  circuitEyebrow: 'PRACTICE CIRCUIT',
  noBoards: 'Off the books: no leaderboard, no ghost, no personal best, no weekly entry. Just you, {rival} and the clock.',
  lineUp: 'Line up',
  forfeit: 'Back off (you lose the race)',
  leave: 'Back to the hangar',
  gridLine: "{rival} pulls up on your wing. Engines hot. Don't blink.",
  win: Object.freeze([
    'You crossed first by {gap}. {rival} is going to need a minute.',
    'Clean as a new hull. {gap} clear of {rival}.',
    '{gap} ahead. Somewhere, {rival} is blaming their engine.',
  ]),
  lose: Object.freeze([
    '{rival} got there {gap} sooner. The job heard about it.',
    'Close, but {rival} has {gap} on you. Tune the engine, try again.',
    '{gap} behind {rival}. Nobody saw. Probably.',
  ]),
  practiceBest: 'New practice best on {track}.',
  takeBack: 'Take the time back to the job',
  again: 'Fly it again',
  wreck: 'SHIP LOST',
  limpBack: 'Limp back to the job (you lose the race)',
  retry: 'Try again',
  expired: 'This race ticket has gone stale. Head back and launch it again from the job.',
});

// Live fights with a crew aboard (player two on the turret and the wrench).
// Units: seconds and Dogfight's world cells.
export const LIVE_CREW = Object.freeze({
  turret: Object.freeze({
    cooldown: 0.45,      // seconds between turret shots
    speed: 22,           // bolt speed, cells per second
    life: 1.4,           // seconds before a bolt fizzles
    base: 4,             // damage per hit in quest numbers: base + spread/2 + the crew's fight bonus
    spread: 3,
    maxBolts: 12,
  }),
  repair: Object.freeze({
    holdMs: 1200,        // the crew holds this long (timed on the crew's page)
    cooldown: 5,         // seconds between repairs
  }),
  // With a crew aboard, a hit on your ship can knock a system out
  // (as in turn-by-turn fights); solo pilots never lose systems (S57).
  knockChance: 0.3,
  engineTurn: 0.5,       // turn rate while the engine is out (thrust and boost are gone)
  frameHz: 15,           // live frames sent to the crew per second
});

// Skill abilities in live fights (Donaven, BRIEF.md "SKILL LEVELS"; the skill
// levels that grant them are story's ROUND2-CONTRACT.md section 9, e.g.
// Hacker 2 -> ability `ship.hack-jam`). Data by the contract's ability id.
//   grant:   the skill level that grants it in the contract's trees, and
//            `legacy`, the same for the slice's older skill list, so the bar
//            works on either data (voyage/races/liveFight.js reads whichever
//            the save's skills match).
//   seat:    'pilot' (only the pilot flies it) or 'any' (the crew can use it
//            with their own skills).
//   input:   'timed' asks for a quick timed press (the hack); 'instant' fires.
//   cooldown in seconds; `perLevel` numbers grow with levels above the grant.
// Live ONLY in the new game's fights; today's Dogfight arena and the racing
// boards never see them. Contract ids not listed here (ship.barrel-roll,
// ship.called-shot, ship.flak, ship.strafe, ship.wingover, ship.mine,
// ship.hack-shields, ship.lights-out) do nothing yet.
export const ABILITIES = Object.freeze([
  Object.freeze({
    id: 'ship.hack-jam', name: 'Hack: jam their guns', short: 'HACK', key: '1', seat: 'any', input: 'timed', cooldown: 14,
    grant: Object.freeze({ skill: 'hacker', level: 2 }), legacy: Object.freeze({ skill: 'slicer', level: 1 }),
    text: 'Slice into their fire control. Hit the window and their guns go quiet.',
    window: Object.freeze({ base: 0.16, perLevel: 0.06, perHackSecond: 0.008 }), // share of the sweep that counts; Hacker's hack.time widens it
    sweepSeconds: 1.1,
    jam: Object.freeze({ base: 3, perLevel: 1.5 }),         // seconds their guns are out
  }),
  Object.freeze({
    id: 'ship.overcharge', name: 'Overcharge shot', short: 'OVERCHARGE', key: '2', seat: 'pilot', input: 'instant', cooldown: 12,
    grant: Object.freeze({ skill: 'gunner', level: 2 }), legacy: Object.freeze({ skill: 'steady-aim', level: 2 }),
    text: 'Charge the barrels: your next hit lands as one big shot.',
    factor: 3, armSeconds: Object.freeze({ base: 4, perLevel: 1 }),
  }),
  Object.freeze({
    id: 'ship.field-repair', name: 'Field repair', short: 'REPAIR', key: '3', seat: 'any', input: 'instant', cooldown: 16,
    grant: Object.freeze({ skill: 'mechanic', level: 3 }), legacy: Object.freeze({ skill: 'patch-kit', level: 1 }),
    text: "Slap a patch on the worst of it while they're shooting at you.",
    patch: Object.freeze({ base: 8, perLevel: 3 }),         // hull, in quest numbers
  }),
  Object.freeze({
    id: 'ship.drift', name: 'Drift', short: 'DRIFT', key: '4', seat: 'pilot', input: 'instant', cooldown: 6,
    grant: Object.freeze({ skill: 'pilot', level: 2 }), legacy: Object.freeze({ skill: 'tight-turns', level: 2 }),
    text: 'Swing the nose round onto them without losing speed; a shot mid-swing glances off.',
    guard: Object.freeze({ base: 0.45, perLevel: 0.15 }),   // seconds of glancing hits
  }),
  Object.freeze({
    id: 'ship.afterburner', name: 'Afterburner', short: 'BURN', key: '5', seat: 'pilot', input: 'instant', cooldown: 8,
    grant: Object.freeze({ skill: 'pilot', level: 1 }), legacy: Object.freeze({ skill: 'smooth-burn', level: 2 }),
    text: 'Light the afterburner: a hard kick straight ahead.',
    impulse: Object.freeze({ base: 8, perLevel: 2 }),       // cells per second, forward
  }),
]);

// Activity upgrades this lane reads (contract section 9): Gunner's and Strafe
// Run's `turret.aim` widens the crew turret's hit ring by this many cells per point.
export const TURRET_AIM_RING = 0.6;

// The same as skill-level rows, the shape the BRIEF asks for:
// { skill, level, unlocks: [{ type: 'ability', id, text }] }.
export const ABILITY_UNLOCKS = Object.freeze(ABILITIES.map((a) => Object.freeze({ skill: a.grant.skill, level: a.grant.level, unlocks: Object.freeze([Object.freeze({ type: 'ability', id: a.id, text: a.name })]) })));

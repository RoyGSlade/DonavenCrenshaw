// The tutorial that flows (ROUND2.md item 11), as data. Chibby sets you up and
// hands you the ship; then three hangar people each run a little tutorial and
// send you out to meet one quest giver; once all three are met, jobs open.
//
//   setup  Chibby   walking around, the ship                 (no giver)
//   ralph  Ralph    mining                                   -> Garrity at Dustfall
//   mel    Mel      shooting                                 -> Hask at Alpha Relay
//   edna   Edna     talking (stat options), then a puzzle    -> Vey at Beacon Prime
//   wrap   Chibby   quests open
//
// Each step: { id, leg, objective, station, target, enter: [lines], wait:
// { type, match }, also: [{ type, match, lines, once }], after: [lines],
// reward, unlocks, talk, skipIf }. A line is a line id, or { pick } (a line
// chosen from what happened, PICKS below). Events and ids are
// ROUND2-CONTRACT.md section 4; the director (director.js) runs this.

export const LEGS = Object.freeze([
  { id: 'setup', who: 'chibby', name: 'Signing on' },
  { id: 'ralph', who: 'ralph', giver: 'garrity', name: "Ralph's find" },
  { id: 'mel', who: 'mel', giver: 'hask', name: "Mel's range" },
  { id: 'edna', who: 'edna', giver: 'vey', name: "Edna's lockbox" },
  { id: 'wrap', who: 'chibby', name: 'Open for business' },
]);

const LAUNCH = { type: 'explore:launched', lines: ['chibby.launch.1'], once: 'first-launch' };

export const STEPS = Object.freeze([
  // --- setup: Chibby ---
  { id: 'intro', leg: 'setup', wait: { type: 'intro:done' } },
  {
    id: 'create', leg: 'setup', objective: 'Sign your licence.', station: 'quarters',
    enter: ['chibby.create.name', 'chibby.create.dice'],
    wait: { type: 'captain:created' },
    after: [{ pick: 'roll' }, 'chibby.create.done'],
    unlocks: ['station:quarters'],
    skipIf: 'hasCaptain',
  },
  {
    id: 'walk', leg: 'setup', objective: 'Walk to Chibby at the pad.', station: 'pad',
    enter: ['chibby.walk.1'],
    also: [{ type: 'tutorial:moved', lines: ['chibby.walk.moving'] }],
    wait: { type: 'tutorial:arrived', match: { station: 'pad' } },
  },
  {
    id: 'ship', leg: 'setup', objective: 'Talk to Chibby.', station: 'pad',
    wait: { type: 'met:chibby' },
    after: ['chibby.ship.1', 'chibby.ship.2', 'chibby.ship.3', 'chibby.ship.4'],
    unlocks: ['ship', 'station:pad'],
  },
  // --- ralph: mining, then Garrity ---
  {
    id: 'ralph', leg: 'ralph', objective: 'Ralph found something. Follow him.', station: 'kennel',
    enter: ['chibby.ralph.1'],
    wait: { type: 'met:ralph' },
    after: ['ralph.ralph.1', 'chibby.ralph.2', 'ralph.ralph.2', 'chibby.ralph.3'],
    unlocks: ['station:scrap'],
  },
  {
    id: 'mine', leg: 'ralph', objective: 'Mine the seam Ralph dug up.', station: 'scrap',
    wait: { type: 'tutorial:mined' },
    after: ['ralph.mine.1', 'chibby.mine.1', 'chibby.mine.2', 'chibby.mine.3'],
    reward: { items: { ore: 3 } },
    unlocks: ['explore:dustfall', 'station:hatch'],
  },
  {
    id: 'hop-garrity', leg: 'ralph', objective: 'Fly to Dustfall Station.', station: 'hatch', target: 'dustfall',
    also: [LAUNCH],
    wait: { type: 'explore:arrived', match: { target: 'dustfall' } },
    after: ['garrity.arrive.1'],
  },
  {
    id: 'garrity', leg: 'ralph', objective: 'Find Hob Garrity.', target: 'dustfall',
    wait: { type: 'met:garrity' },
    after: ['garrity.meet.1', 'garrity.meet.2', 'garrity.meet.3', 'garrity.meet.4'],
    reward: { rep: { garrity: 5 }, flags: { 'met-garrity': 1 } },
    unlocks: ['giver:garrity'],
  },
  // --- mel: shooting, then Hask ---
  {
    id: 'mel', leg: 'mel', objective: 'Mel wants a word at the locker.', station: 'locker',
    enter: ['chibby.mel.1'],
    wait: { type: 'met:mel' },
    after: ['mel.meet.1', 'mel.meet.2', 'mel.meet.3'],
    reward: { flags: { 'kit-sidearm': 1 } },
    unlocks: ['station:locker'],
  },
  {
    id: 'shoot', leg: 'mel', objective: "Knock down every target on Mel's range.", station: 'range',
    enter: ['mel.shoot.0'],
    wait: { type: 'tutorial:shot' },
    after: [{ pick: 'shot' }, 'mel.shoot.2', 'mel.shoot.3'],
    unlocks: ['station:range', 'explore:alpha'],
  },
  {
    id: 'hop-hask', leg: 'mel', objective: 'Fly to Alpha Relay.', station: 'hatch', target: 'alpha',
    also: [LAUNCH],
    wait: { type: 'explore:arrived', match: { target: 'alpha' } },
    after: ['hask.arrive.1'],
  },
  {
    id: 'hask', leg: 'mel', objective: 'Find Stationmaster Hask.', target: 'alpha',
    wait: { type: 'met:hask' },
    after: ['hask.meet.1', 'hask.meet.2', 'hask.meet.3', 'hask.meet.4'],
    reward: { rep: { hask: 5 }, flags: { 'met-hask': 1 } },
    unlocks: ['giver:hask'],
  },
  // --- edna: talking and a puzzle, then Vey ---
  {
    id: 'edna', leg: 'edna', objective: 'Someone is whistling in the back room.', station: 'backroom',
    enter: ['chibby.edna.1'],
    wait: { type: 'met:edna' },
    after: ['edna.meet.1', 'edna.meet.2'],
    unlocks: ['station:backroom'],
  },
  {
    id: 'talk', leg: 'edna', objective: "Talk your way into Edna's good books.", station: 'backroom',
    talk: 'edna',
    wait: { type: 'tutorial:talked', match: { talk: 'edna' } },
    after: ['edna.talk.done'],
  },
  {
    id: 'puzzle', leg: 'edna', objective: "Open Edna's lockbox.", station: 'backroom',
    enter: ['edna.puzzle.0'],
    wait: { type: 'tutorial:solved', match: { puzzle: 'lockbox' } },
    after: ['edna.puzzle.1', 'edna.puzzle.2'],
    unlocks: ['explore:beacon'],
  },
  {
    id: 'hop-vey', leg: 'edna', objective: 'Fly to Beacon Prime.', station: 'hatch', target: 'beacon',
    also: [LAUNCH],
    wait: { type: 'explore:arrived', match: { target: 'beacon' } },
    after: ['vey.arrive.1'],
  },
  {
    id: 'vey', leg: 'edna', objective: 'Find Lucan Vey.', target: 'beacon',
    wait: { type: 'met:vey' },
    after: ['vey.meet.1', 'vey.meet.2', 'vey.meet.3', 'vey.meet.4'],
    reward: { rep: { vey: 5 }, flags: { 'met-vey': 1 } },
    unlocks: ['giver:vey'],
  },
  // --- wrap: quests open (no wait: its lines play, then the tutorial ends) ---
  {
    id: 'open', leg: 'wrap',
    enter: ['chibby.open.1', 'chibby.open.2', 'chibby.open.3', 'ralph.open.1', 'chibby.open.4'],
    unlocks: ['jobs', 'station:board'],
  },
]);

export const STEP_IDS = Object.freeze(STEPS.map((s) => s.id));
export const STEP_BY_ID = new Map(STEPS.map((s) => [s.id, s]));

/** Every unlock the tutorial hands out (a skip hands them all over). */
export const ALL_UNLOCKS = Object.freeze([...new Set(STEPS.flatMap((s) => s.unlocks || []))]);
export const UNLOCK_ID = /^(ship|jobs|(station|explore|giver):[a-z0-9][a-z0-9-]{0,31})$/;

// Talks the director runs itself. An option with `stat` needs that stat at
// STAT_OPTION_MIN (data.js) and is shown locked with its reason otherwise, so
// the player learns that stats open options. Every option works here: the
// tutorial talk teaches, it does not fail you.
export const TALKS = Object.freeze({
  edna: {
    who: 'edna',
    prompt: 'edna.talk.ask',
    options: [
      { label: '"I\'m Chibby\'s captain. That should count."', reply: 'edna.talk.plain' },
      { stat: 'cha', label: '"Because you clearly have the best taste on this station."', reply: 'edna.talk.cha' },
      { stat: 'con', label: 'Carry her crates in without being asked.', reply: 'edna.talk.con' },
      { stat: 'dex', label: 'Catch the teacup she "accidentally" knocks off the table.', reply: 'edna.talk.dex' },
      { stat: 'wis', label: '"You don\'t trust anyone. That\'s why you\'re still in business."', reply: 'edna.talk.wis' },
    ],
  },
});

const ORDER = ['cha', 'con', 'dex', 'wis'];
// Lines chosen from what happened: (event detail, save) -> line id.
export const PICKS = Object.freeze({
  /** Chibby reacts to the captain's best stat (the first of a tie), or kindly to a low roll. */
  roll(detail, save) {
    const stats = detail?.character?.stats || save?.character?.stats || {};
    let best = null;
    for (const id of ORDER) if (best === null || (stats[id] || 0) > (stats[best] || 0)) best = id;
    return (stats[best] || 0) <= 3 ? 'chibby.roll.low' : `chibby.roll.${best}`;
  },
  /** Mel: a clean sheet, or "took you long enough". */
  shot(detail) {
    const hits = Number(detail?.hits) || 0;
    const shots = Number(detail?.shots) || 0;
    return shots > 0 && hits >= shots ? 'mel.shoot.clean' : 'mel.shoot.done';
  },
});

// Conditions that let a step pass silently (no lines), e.g. a replay with a captain already made.
export const SKIP_IF = Object.freeze({
  hasCaptain: (save) => Boolean(save?.character),
});

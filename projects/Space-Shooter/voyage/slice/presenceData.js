// The crew's places for each beat of the opening (opening track A). Data only; the rules are in presence.js and presenceCast.js.
//
// A scene lists where each person is by default; a step (named as in the quest data) overrides that for its nodes, and a node
// overrides the step. When a beat starts, anyone who is not where it wants them walks there (see presence.js): the beat
// waits for the people it needs. A room named here is a Tin Duchess room id. `away` = walked off the ship by the cargo ramp.
// DRAFT words are not here; this file has no player-facing text.
export const AWAY = 'away';
export const DOWNED = 'down';
export const NPC_IDS = Object.freeze(['tull', 'nessa', 'pip', 'reck']);

const MESS = 'duchess-mess', GYM = 'duchess-holodeck', BRIDGE = 'duchess-bridge', ENGINE = 'duchess-engine', QUARTERS = 'duchess-quarters', PAD = 'duchess-pad', CORRIDOR = 'duchess-corridor';

/** A place a room's own map does not give a person: tile coordinates (the tile's top-left corner), which way they face. */
export const SPOTS = Object.freeze({
  [GYM]: { tull: { at: [6, 7], face: 'right', wander: 0.2 } },
  [ENGINE]: { tull: { at: [8, 5], face: 'right', wander: 0.2 } },
  [CORRIDOR]: { tull: { at: [16, 8], face: 'down', wander: 0 }, nessa: { at: [18, 8], face: 'down', wander: 0 } },
});

/**
 * Per scene: { start, default, steps, nodes }. `default` is where everyone is for the scene; `steps` (by step id) and `nodes`
 * (by node id) change only the people they name. Reck is the gunner: his place is the bridge until the Reavers shoot him.
 */
export const SCHEDULE = Object.freeze({
  'third-shift': {
    default: { tull: MESS, nessa: GYM, pip: GYM, reck: BRIDGE },
    nodes: { 'end-projector-fried': { tull: GYM }, 'end-projector-fried-end': { tull: GYM } },
  },
  visitors: {
    default: { tull: BRIDGE, nessa: BRIDGE, pip: ENGINE, reck: BRIDGE },
  },
  'hold-the-corridor': {
    default: { tull: BRIDGE, nessa: BRIDGE, pip: ENGINE, reck: DOWNED },
  },
  'the-eighth-gunner': {
    default: { tull: QUARTERS, nessa: BRIDGE, pip: ENGINE, reck: DOWNED },
  },
  'gunners-week': {
    default: { tull: BRIDGE, nessa: BRIDGE, pip: ENGINE, reck: DOWNED },
    steps: { engine: { tull: ENGINE, pip: ENGINE, nessa: AWAY } },
  },
  'day-five': {
    default: { tull: PAD, nessa: AWAY, pip: ENGINE, reck: DOWNED },
    steps: { engine: { tull: PAD, pip: ENGINE } },
  },
});

/**
 * Nodes whose speaker is not standing in the room: a voice on the intercom, so nobody needs to be there. 'scene:node'.
 * (Checked by tests/stardust-opening-a.test.mjs against the scene text: each says intercom, comm link or a cut to elsewhere.)
 */
export const INTERCOM = Object.freeze([
  'visitors:breach', 'hold-the-corridor:end-sealed', 'the-eighth-gunner:bunk',
]);

/** A flag that moves someone for good, whatever the schedule says. */
export const FLAG_RULES = Object.freeze([
  { flag: 'reck-down', npc: 'reck', to: DOWNED },
  { flag: 'nessa-quit', npc: 'nessa', to: AWAY },
  { flag: 'pip-quit', npc: 'pip', to: AWAY },
]);

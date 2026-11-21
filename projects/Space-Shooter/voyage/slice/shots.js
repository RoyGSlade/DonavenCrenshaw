// Shot lists for the staged scenes (opening B, outcome 4). Data only: ./timeline.js plays them, ./stager.js knows what each op does.
// Times are ms after the previous step (dt). `at` names a place the stager resolves in the room: 'hatch' (the bridge's corridor door),
// 'hatch-in' (just inside it), 'stub-far' (down the vestibule, out of the room), 'stub-mid', 'reck', 'player', or { tile: [x, y] }.
//
// Scene 2, Visitors, all on the bridge, no cut:
//   breach     the alarm: music cuts, klaxon, red pulse, a banner, the camera swings to the hatch, an "airlock cam" inset
//   last       the cut-in: boots, the torch seam crawls round the hatch, a char decal, then it blows (the narration for these three nodes is performed, not shown)
//   reck-falls the stand: a Reaver in the hatch fires, Reck is hit twice and answers, the Reaver ducks out, Reck settles and goes down
//   leave      the Reavers go on into the ship (before the result card)
// Every word on a banner here is a DRAFT for Donaven.
export const SHOTS = Object.freeze({
  'visitors/breach': [
    { op: 'music', mode: 'danger', name: 'cut-to-tense' },
    { op: 'loop', id: 'klaxon', on: true },
    { op: 'pulse', on: true },
    { op: 'banner', text: 'HULL BREACH: AIRLOCK 2', ms: 4600 },
    { op: 'inset', on: true, p: 0.04, dt: 250 },
    { op: 'cam', at: 'hatch', dt: 100, name: 'hatch' },
    { op: 'tween', what: 'inset', to: 0.92, ms: 6500, dt: 50 },
    { op: 'cam', at: null, dt: 2300, name: 'back-to-player' },
  ],
  'visitors/last': [
    { op: 'cam', at: 'hatch', name: 'hatch' },
    { op: 'sfx', id: 'boots', dt: 100 },
    { op: 'sfx', id: 'boots', dt: 700 },
    { op: 'loop', id: 'torch', on: true, dt: 800 },
    { op: 'tween', what: 'seam', to: 1, ms: 4800, dt: 50 },
    { op: 'wait', dt: 4900, name: 'seam-finishing' },
    { op: 'loop', id: 'torch', on: false },
    { op: 'blow', name: 'door-blown' },
    { op: 'cam', at: null, dt: 1700, name: 'back-to-player' },
    { op: 'signal', name: 'last-done' },
  ],
  'visitors/reck-falls': [
    { op: 'await', await: 'shot:last-done', timeout: 16000, name: 'door-blown-first' },
    { op: 'cam', at: 'hatch', name: 'hatch' },
    { op: 'actor', id: 'r1', at: 'stub-far', name: 'reaver-1-appears' },
    { op: 'walk', id: 'r1', to: 'hatch-in', speed: 150, dt: 50 },
    { op: 'actor', id: 'r2', at: 'stub-far', dt: 350, name: 'reaver-2-appears' },
    { op: 'walk', id: 'r2', to: 'stub-mid', speed: 120, dt: 50 },
    { op: 'fire', from: 'r1', at: 'reck', dt: 650, name: 'reaver-fires' },
    { op: 'hit', at: 'reck', dt: 150, name: 'reck-hit-1' },
    { op: 'fire', from: 'r1', at: 'reck', dt: 200, name: 'reaver-fires-again' },
    { op: 'hit', at: 'reck', dt: 150, name: 'reck-hit-2' },
    { op: 'cam', at: 'reck', dt: 250, name: 'on-reck' },
    { op: 'fire', from: 'reck', at: 'r1', dt: 450, name: 'reck-fires' },
    { op: 'fire', from: 'reck', at: 'r1', dt: 130 },
    { op: 'fire', from: 'reck', at: 'r1', dt: 130 },
    { op: 'walk', id: 'r1', to: 'stub-far', speed: 210, dt: 260, name: 'reaver-ducks-out' },
    { op: 'wait', dt: 700 },
    { op: 'reck', state: 'down', name: 'reck-down' },
    { op: 'wait', dt: 1300 },
    { op: 'cam', at: null, name: 'back-to-player' },
    { op: 'signal', name: 'stand-done' },
  ],
  'visitors/leave': [
    { op: 'cam', at: 'hatch', name: 'hatch' },
    { op: 'walk', id: 'r1', to: 'stub-far', speed: 110, dt: 100 },
    { op: 'walk', id: 'r2', to: 'stub-far', speed: 110, dt: 100 },
    { op: 'wait', dt: 1500 },
    { op: 'cam', at: null, name: 'back-to-player' },
    { op: 'remove', id: 'r1' },
    { op: 'remove', id: 'r2' },
    { op: 'loop', id: 'klaxon', on: false },
    { op: 'pulse', on: false },
    { op: 'signal', name: 'left' },
  ],
});

export const shotFor = (questId, nodeId) => SHOTS[`${questId}/${nodeId}`] || null;

/** The mood of the music by node: the opening's danger runs from the breach to the end of the corridor fight. */
export const MOOD = Object.freeze({
  'visitors/breach': 'danger', 'visitors/last': 'danger', 'visitors/reck-falls': 'danger',
  'hold-the-corridor/bridge': 'danger', 'hold-the-corridor/bridge-2': 'danger', 'hold-the-corridor/corridor': 'danger', 'hold-the-corridor/cargo-flank': 'danger',
});
/** The scene whose end puts the music back to calm. */
export const CALM_AFTER = Object.freeze(['hold-the-corridor']);

/** Ops a shot may use (the stager implements exactly these). */
export const OPS = Object.freeze(['music', 'loop', 'pulse', 'banner', 'inset', 'cam', 'tween', 'sfx', 'await', 'wait', 'blow', 'actor', 'walk', 'fire', 'hit', 'reck', 'remove', 'signal', 'bark', 'flash', 'shake']);

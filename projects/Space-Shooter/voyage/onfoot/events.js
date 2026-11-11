// The ids the on-foot and exploration layers share with the other lanes, from
// story's ROUND2-CONTRACT.md (v1.0). If a name changes there, change it here.
//
// Events go to the story bus the page hands in (`storyBus` from
// voyage/story/bus.js once story merges: { emit(type, detail) }), and are also
// sent as a window event (`stardust:tutorial`, detail { event, ...data }) so a
// page without the director (the preview, tests) can follow along.

export const TUTORIAL_EVENTS = Object.freeze({
  moved: 'tutorial:moved',         // {} first time the player walks 3 m
  arrived: 'tutorial:arrived',     // { station } entered a station's talk ring
  mined: 'tutorial:mined',         // { ore } a mining run finished
  shot: 'tutorial:shot',           // { hits, shots } the range (or a fight) finished
  solved: 'tutorial:solved',       // { puzzle } a puzzle was solved ('lockbox' in the tutorial)
  launched: 'explore:launched',    // { target } took off on a hop
  exploreArrived: 'explore:arrived', // { target } docked at a sector place
  // Ours, beyond the contract (harmless to the director; useful to the hangar and Studio):
  entered: 'onfoot:entered',       // { map } walked into a place
  poi: 'explore:poi',              // { id } scanned a point of interest
  fight: 'onfoot:fight',           // { outcome, hits, shots, kills } any on-foot fight ended
  hacked: 'onfoot:hacked',         // { id, success, level } a hack finished
});
/** Opening a talk with someone: met:<castId>, every time (contract section 4). */
export const metEvent = castId => `met:${castId}`;

// Cast ids (contract section 1).
export const CAST = Object.freeze(['chibby', 'ralph', 'mel', 'edna', 'hask', 'vey', 'garrity']);

// Hangar station ids (contract section 5). A map's station interact carries
// one; it is passed to the hangar lane's openStation(id) unchanged.
export const STATIONS = Object.freeze(['pad', 'kennel', 'scrap', 'locker', 'range', 'backroom', 'board', 'quarters', 'hatch']);

// Sound hook ids: the page (voice lane's audio map) can play real files for
// these; until then sfx.js makes small synth blips.
export const SOUNDS = Object.freeze(['step', 'door', 'talk', 'shot', 'hit', 'hurt', 'kill', 'dash', 'guard', 'drill', 'crack', 'jam', 'ore', 'turn', 'power', 'unlock', 'scan', 'boost', 'bump', 'dock']);

export const EVENT_NAME = 'stardust:tutorial';

/** emit(event, data): to the bus, the page's sink and the window event. Never throws. */
export function createEmitter({ bus = null, sink = null, target = globalThis } = {}) {
  const seen = new Set();
  function emit(event, data = {}) {
    seen.add(event);
    try { bus?.emit?.(event, data); } catch (error) { console.warn('Stardust: a story bus listener failed', error); }
    try { target?.dispatchEvent?.(new CustomEvent(EVENT_NAME, { detail: { event, ...data } })); } catch { /* no window (tests) */ }
    try { sink?.(event, data); } catch (error) { console.warn('Stardust: a tutorial listener failed', error); }
  }
  emit.once = (event, data) => { if (!seen.has(event)) emit(event, data); };
  emit.seen = event => seen.has(event);
  return emit;
}

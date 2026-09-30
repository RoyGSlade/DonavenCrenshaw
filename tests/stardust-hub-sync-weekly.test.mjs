// The weekly mode's side of the hub sync: the ship snapshot taken when an attempt starts,
// practice flights in the equipped build, and ghosts that carry the ship they were flown in.
// Runs the real module graph against small DOM doubles (like stardust-gameplay-integration).
import test from 'node:test';
import assert from 'node:assert/strict';

const noOp = () => {};
const element = () => ({ getContext: () => ({}), focus: noOp, appendChild: noOp, dataset: {}, pause: noOp, play: () => Promise.resolve(), classList: { toggle: noOp, add: noOp, remove: noOp } });
const canvas = element();
const sent = [];
const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
globalThis.document = { getElementById: (id) => (id === 'starmap-canvas' ? canvas : null), querySelector: () => null, addEventListener: noOp, createElement: element, body: { classList: { toggle: noOp } }, fullscreenElement: null };
globalThis.window = { addEventListener: noOp, removeEventListener: noOp, dispatchEvent: (e) => { sent.push(e); }, devicePixelRatio: 1 };
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = noOp;
globalThis.sessionStorage = { getItem: () => null, removeItem: noOp };

const { state } = await import('../projects/Space-Shooter/state.js');
const { startWeekly, setWeeklyGhost, weeklyGhosts, currentWeeklySession } = await import('../projects/Space-Shooter/engine/modes/weekly.js');
const { WEEKLY_EVENTS } = await import('../projects/Space-Shooter/tracks/weekly.js');
const { createWeeklyLayout } = await import('../projects/Space-Shooter/engine/weekly/layout.js');
const { flyWeeklyLap } = await import('../projects/Space-Shooter/engine/weekly/pilot.js');
const { encodeInputLog } = await import('../projects/Space-Shooter/engine/weekly/replay.js');
const { presetAppearance, cleanAppearance } = await import('../projects/Space-Shooter/systems/shipLivery.js');
const { APPEARANCE_KEY } = await import('../projects/Space-Shooter/systems/shipAppearance.js');
const { setEquippedReader } = await import('../projects/Space-Shooter/systems/runClient.js');
// Without a browser nothing renders a ship, so the garage's in-memory ship is read from the stored one.
setEquippedReader(() => { try { return JSON.parse(storage.get(APPEARANCE_KEY) ?? 'null'); } catch { return null; } });

const event = WEEKLY_EVENTS[0];
const layout = createWeeklyLayout(event);
const lap = flyWeeklyLap(layout);
const log = encodeInputLog({ eventId: event.id, version: event.version, frames: lap.frames, finishMs: lap.time });
const needle = () => { const a = presetAppearance('needle'); a.parts = { body: 0, wings: 1, cockpit: 0, engines: 1 }; return a; };
const attempts = () => sent.filter((e) => e.type === 'stardust:weeklyAttempt').map((e) => e.detail);

test('an attempt records the ship equipped when it started; changing ship afterwards changes nothing', () => {
  state.gfx = { camera: { zoom: 1 }, projectiles: [], particles: [], cellW: 10 };
  state.ui = { paused: false };
  state.run = { kind: 'weekly', current: null };
  storage.set(APPEARANCE_KEY, JSON.stringify(needle()));
  startWeekly(event, { preview: false });
  const first = attempts().at(-1);
  assert.equal(first.preview, false);
  assert.equal(first.build, 'needle:0-1-0-1', 'ranked flights fly the equipped build');
  assert.deepEqual(first.appearance, cleanAppearance(needle()), 'with its paint');
  // The pilot swaps ships while flying: the running attempt's snapshot stays.
  const manta = presetAppearance('manta');
  storage.set(APPEARANCE_KEY, JSON.stringify(manta));
  assert.equal(currentWeeklySession().appearance.family, 'needle');
  assert.equal(attempts().at(-1).appearance.family, 'needle');
});

test('no ship equipped: the attempt has no appearance', () => {
  storage.delete(APPEARANCE_KEY);
  startWeekly(event, { preview: false });
  assert.equal(attempts().at(-1).appearance, null);
});

test('practice in your ship and ranked attempts both fly the equipped build', () => {
  storage.set(APPEARANCE_KEY, JSON.stringify(needle()));
  startWeekly(event, { preview: true, ship: 'equipped' });
  assert.equal(attempts().at(-1).build, 'needle:0-1-0-1');
  assert.equal(attempts().at(-1).preview, true);
  assert.equal(state.run.current.ship, 'needle:0-1-0-1');
  startWeekly(event, { preview: false, ship: 'equipped' });
  assert.equal(attempts().at(-1).build, 'needle:0-1-0-1');
  assert.equal(state.run.current.ship, 'needle:0-1-0-1');
  // With nothing equipped every attempt is the standard ship.
  storage.delete(APPEARANCE_KEY);
  startWeekly(event, { preview: false });
  assert.equal(attempts().at(-1).build, null);
  assert.equal(state.run.current.ship, undefined, 'the standard ship has no build');
});

test('a ghost keeps the ship it was flown in (from the local best or the hub), and stays standard without one', () => {
  assert.equal(setWeeklyGhost('top', { log, label: '#1 rook', color: '#ffd166', appearance: cleanAppearance(needle()), build: 'needle:0-1-0-1', layout }), true);
  assert.equal(setWeeklyGhost('best', { log, label: 'Your best', layout }), true);
  const ghosts = weeklyGhosts();
  const top = ghosts.find((g) => g.label === '#1 rook');
  const best = ghosts.find((g) => g.label === 'Your best');
  assert.equal(top.appearance.family, 'needle');
  assert.equal(top.build, 'needle:0-1-0-1');
  assert.equal(top.sprite, null, 'painted lazily, when drawn');
  assert.equal(best.appearance, null);
  assert.equal(best.build, null);
});

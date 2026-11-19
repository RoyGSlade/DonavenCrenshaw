// The facts the training books quote, each tied to the real mini-game code (Donaven 2026-11-19: "pages teach the real mini-game").
// Every page in bookPages.js lists the fact ids it states; every id here has a `check()` that runs the real rules and returns true
// only while the quoted rule still holds. tests/stardust-minigames-books.test.mjs runs them all, so changing a rule in repair.js,
// mirrors.js, craft.js or setup.js fails the test until the page (or the rule) is looked at. The `claim` is the rule in plain words,
// with the numbers the page quotes. Nothing here has a DOM or a clock; it only builds states with the rules' own functions.
import {
  N, E, S, W, createRepair, recompute, openEnds, poweredSet, shapeOf, rotateTile, stepRepair, isSubmerged, waterLevel, winnable, leaks,
  qualityOf as repairQuality, starsOf as repairStars, shutValve, turn,
} from './repair.js';
import {
  createMirrorHack, createLayout, trace, preview, markerAt, catchPortal, fire, stepMirrors, rotateStep, holdMirror, mirrorXp, CONSEQUENCES,
  CATCH_COOLDOWN, STEPS, STEP_RAD, TURN_SECONDS, inWindow,
} from './mirrors.js';
import {
  createCraft, heatStart, release, stepCraft, shape, heatVerdict, bandOf, workSecondsFor, settleMaterials, qualityOf as craftQuality, starsOf as craftStars,
  TOOLS, SPOIL_SHARE, RUIN_BELOW, HOT_SPOILS, COLD_TIME, HOT_TIME, HEAT_START, HEAT_RATE,
} from './craft.js';
import { setupRepair, setupHack, setupCraft, setupAssembly } from './setup.js';
import * as AS from './assembly.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const seeds = (n) => Array.from({ length: n }, (_, i) => i + 1);
const hackAt = ({ seed = 1, lock = 2, retries = 0, context = 'foot' } = {}) => createMirrorHack({ seed, context, setup: setupHack({ lock, level: 9, points: { retries } }) });
const solvedAngles = (s) => s.layout.solved.map((v, i) => v ?? s.layout.start[i]);
const craftAt = (seed = 1, setup = {}) => createCraft({ seed, setup: { zone: 0.22, speed: 1.1, strikes: 5, ...setup } });
const heatTo = (s, temp) => { s.temp = temp; s.heating = true; return release(s); };
/** Run a hack to the clearing of its first firewall by the book: solve, catch, fire, fly. */
function clearStageOne(s) {
  s.angles = solvedAngles(s);
  s.portal.phase = s.portal.centre; // the marker sits at the window's middle
  if (catchPortal(s) !== 'open') return false;
  fire(s);
  for (let i = 0; i < 600 && s.projectile; i++) stepMirrors(s, 1 / 60);
  return true;
}

/** id -> { skill, claim, check }. */
export const FACTS = Object.freeze({
  // ---- repair (repair.js, setup.js) -------------------------------------------------------------------------------------------
  'repair.closed-network': { skill: 'repair', claim: 'A wet piece with an opening that meets nothing is an open end, and open ends leak.', check() {
    const s = createRepair({ seed: 3 });
    s.tiles.forEach((t) => { t.mask = t.solved; }); recompute(s);
    if (!(s.solved && s.open.length === 0)) return false;
    const i = s.net.find((k) => s.powered.includes(k) && turn(s.tiles[k].mask) !== s.tiles[k].mask);
    s.tiles[i].mask = turn(s.tiles[i].mask); recompute(s);
    return s.open.length > 0 || !s.solved;
  } },
  'repair.tee-needs-three': { skill: 'repair', claim: 'A Tee has three openings and all three must meet something, or the unmet one leaks.', check() {
    if (shapeOf(N | E | S) !== 'tee') return false;
    const state = { cols: 3, rows: 1, src: 0, tiles: [{ mask: E }, { mask: E | W | N }, { mask: W }] };
    const ends = openEnds(state, poweredSet(state));
    return ends.length === 1 && ends[0].i === 1 && ends[0].dir === N;
  } },
  'repair.pump-valve-edges': { skill: 'repair', claim: 'The pump is on the left edge, the valve on the right edge and in the top half.', check() {
    for (const size of [3, 4, 5, 6]) for (const seed of seeds(25)) {
      const s = createRepair({ seed, size });
      if (s.src % s.cols !== 0 || s.dst % s.cols !== s.cols - 1 || Math.floor(s.dst / s.cols) >= Math.ceil(s.rows / 2)) return false;
    }
    return true;
  } },
  'repair.fixed-pieces': { skill: 'repair', claim: 'The pump and the valve cannot be turned.', check() {
    const s = createRepair({ seed: 4 });
    const before = [s.tiles[s.src].mask, s.tiles[s.dst].mask];
    return rotateTile(s, s.src) === false && rotateTile(s, s.dst) === false && s.tiles[s.src].mask === before[0] && s.tiles[s.dst].mask === before[1] && s.moves === 0;
  } },
  'repair.water-rises-bottom': { skill: 'repair', claim: 'The spill is water that rises from the bottom of the board; the bottom row goes under first, the top row last.', check() {
    const s = createRepair({ seed: 5 });
    s.pool = (1 / s.reach) * s.capacity; // the water one row high
    const bottom = s.tiles.map((_, i) => i).filter((i) => Math.floor(i / s.cols) === s.rows - 1 && i !== s.src && i !== s.dst);
    const top = s.tiles.map((_, i) => i).filter((i) => Math.floor(i / s.cols) === 0 && i !== s.src && i !== s.dst);
    return close(waterLevel(s), 1) && bottom.length > 0 && bottom.every((i) => isSubmerged(s, i)) && top.every((i) => !isSubmerged(s, i));
  } },
  'repair.submerged-locked': { skill: 'repair', claim: 'A piece with the water over all of it cannot be turned.', check() {
    const s = createRepair({ seed: 6 });
    s.pool = (1 / s.reach) * s.capacity;
    const i = s.tiles.map((_, k) => k).find((k) => Math.floor(k / s.cols) === s.rows - 1 && !s.tiles[k].fixed);
    const before = s.tiles[i].mask;
    return isSubmerged(s, i) && rotateTile(s, i) === false && s.tiles[i].mask === before && s.events[0]?.type === 'locked';
  } },
  'repair.bottom-row-starts-right': { skill: 'repair', claim: 'Every board starts with its bottom row turned the right way round.', check() {
    return seeds(40).every((seed) => { const s = createRepair({ seed }); const n = s.cols; return s.tiles.every((t, i) => i < n * (n - 1) || t.mask === t.solved); });
  } },
  'repair.only-leaks-fill': { skill: 'repair', claim: 'There is no clock: the pool rises only while an open end is pouring, and it never falls.', check() {
    const sealed = createRepair({ seed: 7 });
    sealed.tiles.forEach((t) => { t.mask = t.solved; }); recompute(sealed);
    for (let i = 0; i < 300; i++) stepRepair(sealed, 1 / 60);
    if (sealed.pool !== 0) return false;
    // A leak that has stopped leaves the pool where it was.
    const s = createRepair({ seed: 7 });
    s.tiles.forEach((t) => { t.wet = 1; });
    for (let i = 0; i < 60; i++) stepRepair(s, 1 / 60);
    if (!(s.pool > 0)) return false;
    const was = s.pool; s.tiles.forEach((t, i) => { t.mask = t.solved; }); recompute(s); s.done = false;
    for (let i = 0; i < 120; i++) stepRepair(s, 1 / 60);
    return s.pool === was;
  } },
  'repair.more-leaks-faster': { skill: 'repair', claim: 'Each pouring open end adds to the pool every second, so more open ends fill it faster.', check() {
    for (const seed of seeds(40)) {
      const s = createRepair({ seed }); recompute(s);
      const k = s.open.length; if (k < 2) continue;
      s.tiles.forEach((t) => { t.wet = 1; });
      for (let i = 0; i < 60; i++) stepRepair(s, 1 / 60);
      return close(s.pool, k * s.flow, 0.01) && k * s.flow > s.flow;
    }
    return false;
  } },
  'repair.coolant-fills': { skill: 'repair', claim: 'An open end only pours once the coolant has filled the piece it is on.', check() {
    for (const seed of seeds(40)) {
      const s = createRepair({ seed }); recompute(s);
      if (!s.open.length) continue;
      const dry = leaks(s).length === 0;
      s.tiles.forEach((t) => { t.wet = 1; });
      return dry && leaks(s).length === s.open.length;
    }
    return false;
  } },
  'repair.locked-lost': { skill: 'repair', claim: 'If a drowned piece is left wrong so the line can never be sealed, the line is lost at once.', check() {
    for (const seed of seeds(60)) {
      const s = createRepair({ seed });
      s.pool = s.capacity * 0.98; // the water is almost at the valve
      let broke = false;
      for (const i of s.net) if (isSubmerged(s, i) && turn(s.tiles[i].mask) !== s.tiles[i].mask) { s.tiles[i].mask = turn(s.tiles[i].mask); broke = true; break; }
      recompute(s);
      if (!broke || winnable(s)) continue;
      stepRepair(s, 0.001);
      return s.done && s.result.success === false && s.result.cause === 'locked' && s.result.how === 'flooded' && s.result.time < 1;
    }
    return false;
  } },
  'repair.valve-flood': { skill: 'repair', claim: 'Water at the valve loses the line, which stays broken and keeps flooding until you shut the valve; that stops it and takes the system offline.', check() {
    const s = createRepair({ seed: 8, system: 'life-support' });
    s.pool = s.capacity; stepRepair(s, 1 / 60);
    const lost = s.done && s.result.success === false && s.result.broken === true && s.result.flooding === true && s.result.cause === 'level';
    const r = shutValve(s);
    return lost && r !== null && r.flooding === false && r.broken === true && r.offline === 'life-support' && shutValve(s) === null;
  } },
  'repair.quality': { skill: 'repair', claim: 'A sealed patch is 40 for sealing, up to 30 for few turns, up to 30 for little spill; 90 and over is three stars, 65 and over two.', check() {
    const q = (moves, spilled) => repairQuality({ success: true, moves, par: 4, spilled, capacity: 100 });
    return q(4, 0) === 100 && q(8, 0) === 85 && q(4, 100) === 70 && q(1000, 100) === 40 && repairQuality({ success: false, moves: 1, par: 1, spilled: 0, capacity: 1 }) === 0
      && repairStars(90) === 3 && repairStars(89) === 2 && repairStars(65) === 2 && repairStars(64) === 1;
  } },

  // ---- assembly repair (assembly.js, setup.js) ---------------------------------------------------------------------------------
  'assembly.one-fit': { skill: 'repair', claim: 'A part fits its socket in exactly one turn, and its mirror twin never fits in any turn.', check() {
    return AS.OUTLINES.every((o) => { const twin = AS.outlineById(o.twin); return [0, 1, 2, 3].filter((q) => AS.fitsSocket(o, q, o)).length === 1 && [0, 1, 2, 3].every((q) => !AS.fitsSocket(twin, q, o)); });
  } },
  'assembly.bounce': { skill: 'repair', claim: 'A wrong part bounces off and counts as a wrong fit; the right part turned the wrong way bounces too, but costs nothing.', check() {
    const s = AS.createAssembly({ seed: 5, setup: setupAssembly({}) }), k = AS.socketOf(s);
    const at = (p) => { AS.grab(s, p.id); AS.carry(s, k.x + AS.pieceSize(s, p).w / 2, k.y + AS.pieceSize(s, p).h / 2); return AS.drop(s); };
    const decoy = s.pieces.find((p) => p.role === 'decoy'), mine = AS.pieceOf(s, k.part);
    mine.rot = [0, 1, 2, 3].find((q) => !AS.fitsSocket(AS.outlineOfPiece(mine), q, AS.outlineById(k.outline)));
    return at(decoy) === 'wrong' && s.wrongFits === 1 && at(mine) === 'turn' && s.wrongFits === 1;
  } },
  'assembly.next-socket': { skill: 'repair', claim: 'The next socket opens only when the last bolt of the part is snug; a stripped bolt comes back out.', check() {
    const s = AS.createAssembly({ seed: 4, setup: setupAssembly({}) }), k = AS.socketOf(s), p = AS.pieceOf(s, k.part);
    while (!AS.fitsSocket(AS.outlineOfPiece(p), p.rot, AS.outlineById(k.outline))) { AS.select(s, p.id); AS.turn(s, 1); }
    AS.grab(s, p.id); AS.carry(s, k.x + AS.pieceSize(s, p).w / 2, k.y + AS.pieceSize(s, p).h / 2); if (AS.drop(s) !== 'snapped') return false;
    const seat = (b) => { AS.grabBolt(s, b.id); AS.carryBolt(s, b.hx, b.hy); return AS.dropBolt(s); };
    const first = s.bolts[0]; seat(first);
    if (AS.screwed(s, first.id, { success: false }) !== 'stripped' || first.seated) return false;
    for (const b of s.bolts.slice()) { if (s.active !== 0) return false; seat(b); AS.screwed(s, b.id, { success: true, grade: 90 }); }
    return s.active === 1 && s.phase === 'fit';
  } },
  'assembly.score': { skill: 'repair', claim: 'A finished unit scores 40, up to 30 more for few wrong fits (6 off each), up to 30 more for the clock left; the clock is 110 seconds, 6 more for each Time point; 90 and over is three stars, 65 and over two.', check() {
    const q = (wrongFits, left) => AS.qualityOf({ success: true, wrongFits, left, clock: 100 });
    return q(0, 100) === 100 && q(1, 100) === 94 && q(0, 0) === 70 && q(5, 0) === 40 && AS.starsOf(90) === 3 && AS.starsOf(89) === 2 && AS.starsOf(65) === 2 && AS.starsOf(64) === 1
      && setupAssembly({}).clock === 110 && setupAssembly({ level: 9, points: { time: 1 } }).clock === 116;
  } },

  // ---- hacking (mirrors.js, setup.js) -----------------------------------------------------------------------------------------
  'hack.grade': { skill: 'hacking', claim: 'A lock of grade 1 to 4 has that many firewalls, one after another.', check() {
    return [1, 2, 3, 4].every((g) => setupHack({ lock: g }).firewalls === g && createMirrorHack({ setup: setupHack({ lock: g }) }).stages === g);
  } },
  'hack.turn-step': { skill: 'hacking', claim: 'A mirror turns in steps of seven and a half degrees, one step every 0.09 seconds of holding.', check() {
    const s = hackAt({ seed: 2 });
    const a = s.angles[0];
    const n = holdMirror(s, 0, 1, TURN_SECONDS + 1e-9);
    return STEPS === 24 && close(STEP_RAD * 24, Math.PI) && close(STEP_RAD, (7.5 * Math.PI) / 180) && close(TURN_SECONDS, 0.09) && n === 1 && s.angles[0] === (a + 1) % STEPS;
  } },
  'hack.preview': { skill: 'hacking', claim: 'The preview beam shows where a shot would go right now.', check() {
    const s = hackAt({ seed: 3 });
    const a = JSON.stringify(preview(s)) === JSON.stringify(trace(s.layout, s.angles));
    s.angles = solvedAngles(s);
    return a && preview(s).hit === true && !trace(s.layout, s.layout.start).hit;
  } },
  'hack.always-solvable': { skill: 'hacking', claim: 'Every board is built backwards from a working beam path, so every board can be solved.', check() {
    for (const seed of seeds(25)) for (let stage = 0; stage < 4; stage++) {
      const l = createLayout({ seed, stage, mirrors: [2, 3, 3, 4][stage], decoys: [1, 2, 3, 3][stage] });
      if (!trace(l, l.solved.map((v, i) => v ?? l.start[i])).hit || trace(l, l.start).hit) return false;
    }
    return true;
  } },
  'hack.catch-window': { skill: 'hacking', claim: 'The catch marker sweeps a bar and back; at a steady roll the lit window is a fifth of the bar.', check() {
    const s = setupHack({});
    return close(s.catchWindow, 0.2) && close(markerAt(0), 0) && close(markerAt(1), 1) && close(markerAt(2), 0) && close(markerAt(1.5), 0.5) && close(markerAt(0.5), 0.5);
  } },
  'hack.catch-miss': { skill: 'hacking', claim: 'A missed catch costs 0.6 seconds of waiting and no try.', check() {
    const s = hackAt({ seed: 4, retries: 2 });
    const tries = s.retriesLeft;
    s.portal.phase = 0; // the marker at the end of the bar, outside the window
    if (inWindow(s)) return false;
    const first = catchPortal(s);
    const second = catchPortal(s);
    return close(CATCH_COOLDOWN, 0.6) && first === 'miss' && second === null && close(s.portal.cooldown, 0.6) && s.retriesLeft === tries && s.retriesUsed === 0 && s.portal.open === false;
  } },
  'hack.fire-needs-portal': { skill: 'hacking', claim: 'You can only fire through an open portal, and the portal closes behind every shot.', check() {
    const s = hackAt({ seed: 5 });
    if (fire(s) !== null) return false;
    s.portal.phase = s.portal.centre;
    if (catchPortal(s) !== 'open' || !s.portal.open) return false;
    const tr = fire(s);
    return tr !== null && s.portal.open === false && s.projectile !== null && s.shots === 1;
  } },
  'hack.fizzle': { skill: 'hacking', claim: 'A shot whose path misses the firewall fizzles; it costs time, not a try.', check() {
    const s = hackAt({ seed: 6, retries: 2 });
    s.portal.phase = s.portal.centre; catchPortal(s);
    const tries = s.retriesLeft, left = s.left;
    fire(s);
    for (let i = 0; i < 900 && s.projectile; i++) stepMirrors(s, 1 / 60);
    return s.fizzles === 1 && s.retriesLeft === tries && s.retriesUsed === 0 && s.left < left && !s.done && s.stage === 0;
  } },
  'hack.no-turn-in-flight': { skill: 'hacking', claim: 'While a shot is in flight the mirrors cannot be turned.', check() {
    const s = hackAt({ seed: 7 });
    s.portal.phase = s.portal.centre; catchPortal(s); fire(s);
    const a = s.angles.slice();
    return s.projectile !== null && rotateStep(s, 0, 1) === false && holdMirror(s, 0, 1, 1) === 0 && JSON.stringify(s.angles) === JSON.stringify(a);
  } },
  'hack.decoys': { skill: 'hacking', claim: 'Some mirrors are decoys that sit clear of the solution; the solution works with them left alone.', check() {
    for (const seed of seeds(20)) {
      const l = createLayout({ seed, stage: 2, mirrors: 3, decoys: 3 });
      const decoys = l.mirrors.filter((m) => m.decoy);
      if (decoys.length !== 3 || decoys.some((m) => m.solved !== null)) return false;
      if (!trace(l, l.solved.map((v, i) => v ?? l.start[i])).hit) return false;
    }
    return setupHack({ lock: 4 }).decoys.every((d) => d >= 1);
  } },
  'hack.time-reset': { skill: 'hacking', claim: 'Each firewall has its own clock, 26 seconds at a steady roll; when it runs out the board resets on the same seed, with the same mirrors and window, and a try is spent.', check() {
    const s = hackAt({ seed: 8, retries: 2 });
    if (!close(setupHack({}).time, 26) || !close(s.left, s.setup.time)) return false;
    const centre = s.portal.centre, start = s.layout.start.slice(), board = JSON.stringify(s.layout), tries = s.retriesLeft;
    s.angles[0] = (s.angles[0] + 5) % STEPS;
    s.left = 0.005; stepMirrors(s, 0.01);
    return s.retriesLeft === tries - 1 && s.retriesUsed === 1 && close(s.left, s.setup.time) && s.portal.centre === centre && JSON.stringify(s.angles) === JSON.stringify(start) && JSON.stringify(s.layout) === board && !s.done;
  } },
  'hack.fresh-clock': { skill: 'hacking', claim: 'Every new firewall starts with a fresh clock.', check() {
    const s = hackAt({ seed: 9, retries: 0, lock: 2 });
    s.left = 5;
    if (!clearStageOne(s)) return false;
    return s.stage === 1 && close(s.left, s.setup.time);
  } },
  'hack.tries-whole-hack': { skill: 'hacking', claim: 'Tries are counted for the whole hack: clearing a firewall gives none back.', check() {
    const s = hackAt({ seed: 10, retries: 3, lock: 3 });
    const start = s.retriesLeft; // 1 base + 3 = 4
    s.left = 0.005; stepMirrors(s, 0.01);
    if (s.retriesLeft !== start - 1) return false;
    s.angles = solvedAngles(s);
    if (!clearStageOne(s)) return false;
    return s.stage === 1 && s.retriesLeft === start - 1 && s.retriesUsed === 1;
  } },
  'hack.lockout-world': { skill: 'hacking', claim: 'With no tries left the hack fails and security is alerted; on foot the terminal locks, at a ship the port closes, in ship-to-ship combat that section is sealed.', check() {
    const want = { foot: ['terminal', 'locked'], ship: ['port', 'closed'], combat: ['section', 'changed'] };
    return Object.entries(want).every(([context, [key, word]]) => {
      const s = createMirrorHack({ seed: 11, context, setup: { ...setupHack({ level: 9 }), retries: 0 } });
      s.left = 0.005; stepMirrors(s, 0.01);
      return s.done && s.result.success === false && s.result.security === 'alerted' && s.result[key] === word && CONSEQUENCES[context][key] === word;
    });
  } },
  'hack.clean-bonus': { skill: 'hacking', claim: 'A run with no try spent pays a bonus.', check() {
    return mirrorXp({ success: true, firewalls: 2, retriesUsed: 0 }) === mirrorXp({ success: true, firewalls: 2, retriesUsed: 1 }) + 1 && mirrorXp({ success: false, firewalls: 2, retriesUsed: 0 }) === 0;
  } },

  // ---- crafting (craft.js, setup.js) ------------------------------------------------------------------------------------------
  'craft.hold-release': { skill: 'crafting', claim: 'Holding heats the stock and the gauge climbs from a low start; letting go locks the temperature and starts the shaping clock.', check() {
    const s = craftAt(1);
    if (!close(s.temp, HEAT_START) || s.phase !== 'heat') return false;
    heatStart(s); for (let i = 0; i < 60; i++) stepCraft(s, 1 / 60);
    const hot = s.temp > HEAT_START + 0.4 && close(HEAT_RATE, 0.45);
    const verdict = release(s);
    return hot && verdict !== null && s.phase === 'shape' && s.work > 0;
  } },
  'craft.heat-verdicts': { skill: 'crafting', claim: 'Let go inside the lit band for a clean heat; below it is too cold, above it too hot.', check() {
    const s = craftAt(2); const [lo, hi] = bandOf(s);
    return heatVerdict(s, (lo + hi) / 2) === 'ok' && heatVerdict(s, lo - 0.01) === 'cold' && heatVerdict(s, hi + 0.01) === 'hot' && close(hi - lo, 0.22);
  } },
  'craft.cold-half-time': { skill: 'crafting', claim: 'Too cold gives half the work time; too hot gives a quarter more time.', check() {
    const s = craftAt(3); const ok = workSecondsFor(s, 'ok');
    return close(COLD_TIME, 0.5) && close(HOT_TIME, 1.25) && close(workSecondsFor(s, 'cold'), Math.round(ok * 0.5 * 10) / 10, 0.06) && close(workSecondsFor(s, 'hot'), Math.round(ok * 1.25 * 10) / 10, 0.06);
  } },
  'craft.hot-spoils': { skill: 'crafting', claim: 'Letting go too hot spoils two lots of stock.', check() {
    const s = craftAt(4); const [, hi] = bandOf(s);
    return HOT_SPOILS === 2 && heatTo(s, hi + 0.05) === 'hot' && s.spoils === 2;
  } },
  'craft.burn': { skill: 'crafting', claim: 'Held to the top of the gauge the stock burns: it lets go for you and counts as too hot.', check() {
    const s = craftAt(5);
    heatStart(s);
    for (let i = 0; i < 600 && s.phase === 'heat'; i++) stepCraft(s, 1 / 60);
    return s.phase === 'shape' && s.heat === 'hot' && s.temp === 1 && s.spoils === 2;
  } },
  'craft.band-upper-half': { skill: 'crafting', claim: 'The lit band always sits in the upper half of the gauge, never near the bottom.', check() {
    return seeds(60).every((seed) => { const [lo, hi] = bandOf(craftAt(seed)); return lo >= 0.45 - 1e-9 && hi <= 0.85 + 1e-9; });
  } },
  'craft.tool-order': { skill: 'crafting', claim: 'Shaping goes rough to fine in a fixed order: Cut, Draw, Bend, Fold, Flatten, Polish; a part uses some of them in that order, and the tools are laid out shuffled.', check() {
    const ids = TOOLS.map((t) => t.id);
    if (ids.join() !== 'cut,draw,bend,fold,flatten,polish') return false;
    return seeds(40).every((seed) => {
      const s = craftAt(seed);
      const sorted = s.order.slice().sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
      return s.order.join() === sorted.join() && s.tiles.join() !== s.order.join() && new Set(s.tiles).size === s.order.length;
    });
  } },
  'craft.wrong-spoil': { skill: 'crafting', claim: 'A wrong tool makes the step unclean and spoils stock; each spoil costs a tenth of the job’s materials.', check() {
    const s = craftAt(6); heatTo(s, (bandOf(s)[0] + bandOf(s)[1]) / 2);
    const wrong = TOOLS.map((t) => t.id).find((id) => id !== s.order[0]);
    const r = shape(s, wrong);
    return r === 'wrong' && s.spoils === 1 && s.dirty === true && s.index === 0 && close(SPOIL_SHARE, 0.1) && close(settleMaterials({ recipe: { materials: 10 }, spoils: 2 }).exact, 12);
  } },
  'craft.fixed-step': { skill: 'crafting', claim: 'The right tool after a wrong one finishes the step, but it is marked fixed, not clean, and only clean steps count.', check() {
    const s = craftAt(7); heatTo(s, (bandOf(s)[0] + bandOf(s)[1]) / 2);
    const wrong = TOOLS.map((t) => t.id).find((id) => id !== s.order[0]);
    shape(s, wrong);
    const r = shape(s, s.order[0]);
    return r === 'fixed' && s.marks[0] === 'fixed' && s.good === 0 && s.index === 1 && s.dirty === false;
  } },
  'craft.work-clock': { skill: 'crafting', claim: 'The shaping clock is 3 seconds plus 2.5 for every step at a clean heat (15.5 seconds for five steps).', check() {
    const five = craftAt(8, { strikes: 5 }), four = craftAt(8, { strikes: 4 });
    return close(workSecondsFor(five, 'ok'), 15.5) && close(workSecondsFor(four, 'ok'), 13) && five.strikes === 5 && four.strikes === 4;
  } },
  'craft.cooled': { skill: 'crafting', claim: 'If the shaping clock runs out the part cools and is not made.', check() {
    const s = craftAt(9); heatTo(s, (bandOf(s)[0] + bandOf(s)[1]) / 2);
    for (let i = 0; i < 3000 && !s.done; i++) stepCraft(s, 1 / 60);
    return s.done && s.result.success === false && s.result.how === 'cooled';
  } },
  'craft.half-clean': { skill: 'crafting', claim: 'A part is made when at least half its steps were clean; with fewer it comes out sloppy and does not count (three of five).', check() {
    const run = (cleanSteps) => {
      const s = craftAt(10, { strikes: 5 }); heatTo(s, (bandOf(s)[0] + bandOf(s)[1]) / 2);
      s.order.forEach((id, k) => { if (k >= cleanSteps) { shape(s, TOOLS.map((t) => t.id).find((x) => x !== id)); } shape(s, id); });
      return s.result;
    };
    const three = run(3), two = run(2);
    return close(RUIN_BELOW, 0.5) && three.success === true && three.how === 'made' && two.success === false && two.how === 'sloppy';
  } },
  'craft.quality': { skill: 'crafting', claim: 'Quality is 10 plus 90 times the share of clean steps (100 when all are clean); 90 and over is three stars, 65 and over two.', check() {
    return craftQuality({ good: 5, strikes: 5 }) === 100 && craftQuality({ good: 0, strikes: 5 }) === 10 && craftQuality({ good: 3, strikes: 5 }) === 64
      && craftStars(90) === 3 && craftStars(89) === 2 && craftStars(65) === 2 && craftStars(64) === 1;
  } },
  'craft.material-bank': { skill: 'crafting', claim: 'Nine Material points cut a job to 64% of its scrap; the bench rounds up each craft and carries the leftover fraction to the next (a four-scrap job runs 3, 3, 2).', check() {
    const factor = setupCraft({ points: { material: 9 }, level: 9 }).materialFactor;
    let bank = 0; const used = [];
    for (let k = 0; k < 3; k++) { const r = settleMaterials({ recipe: { materials: 4 }, spoils: 0, factor, bank }); used.push(r.used); bank = r.bank; }
    return close(factor, 0.64) && used.join() === '3,3,2';
  } },
});

export const FACT_IDS = Object.freeze(Object.keys(FACTS));
/** Does the quoted rule still hold in the code? Unknown ids and any thrown error say no. */
export function factHolds(id) {
  try { return FACTS[id]?.check() === true; } catch { return false; }
}

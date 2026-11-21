// Field sectors for Perihelion: the d20 roll sets up a seeded sector (more wells, rocks, flares and shards on a bad roll,
// fewer on a good one). Pure and seeded: the same seed and setup always draw the same sector. `attempt` re-draws it (the
// entry re-draws when the bot cannot clear a sector). Same data shape as the trainer sectors in perihelionData.js.
import { step as rngStep, hashSeed } from '../quests/rng.js';

const W = 1000, H = 680;
const COLORS = ['#38bdf8', '#f59e0b'];
const GATE_NAMES = { standard: 'Waypoint gate', refuel: 'Refuel gate', slipstream: 'Slipstream gate', unstable: 'Relay gate' };

export function buildFieldSector(seed = 1, setup = {}, attempt = 0) {
  let rng = hashSeed('peri-field', seed, attempt);
  const rand = () => { const [v, n] = rngStep(rng); rng = n; return v; };
  const between = (a, b) => a + (b - a) * rand();
  const ship = { x: Math.round(between(70, 130)), y: Math.round(between(190, 490)), vx: Math.round(between(38, 60)), vy: Math.round(between(-24, 24)), fuel: 90, maxFuel: 100, hull: 3 };
  const gates = [];
  const mods = ['standard', 'refuel', 'slipstream'];
  const wp = { id: 'f-wp', label: '', kind: 'waypoint', mod: mods[Math.floor(rand() * 3)], x: Math.round(between(400, 620)), y: Math.round(between(130, 550)), r: 34 };
  wp.label = GATE_NAMES[wp.mod];
  if (wp.mod === 'refuel') wp.cap = 170;
  gates.push(wp);
  if (rand() < 0.3) gates.push({ id: 'f-opt', label: GATE_NAMES.unstable, kind: 'waypoint', mod: 'unstable', required: false, x: Math.round(between(250, 700)), y: Math.round(between(110, 570)), r: 34, expires: 2 });
  const ex = Math.round(between(850, 905)), ey = Math.round(between(170, 510));
  const exit = { id: 'f-exit', label: 'Exit gate', kind: 'exit', mod: 'standard', x: ex, y: ey, r: 36 };
  if (rand() < 0.55) {
    const ay = Math.round(between(60, 130));
    exit.motion = { ox: ex, oy: Math.max(ay + 40, Math.min(H - ay - 40, ey)), ax: 0, ay, period: Math.round(between(58, 76)) / 10, phase: Math.round(between(0, 6.2) * 10) / 10 };
    exit.y = exit.motion.oy;
    if (rand() < 0.4) { exit.pulse = 4.8; exit.open = 0.68; }
  }
  gates.push(exit);
  const clear = (x, y, gap) => gates.every((g) => Math.hypot(g.x - x, g.y - y) > g.r + gap) && Math.hypot(ship.x - x, ship.y - y) > 150;
  const wells = [];
  for (let i = 0, tries = 0; i < (setup.wells ?? 1) && tries < 200; tries++) {
    const x = Math.round(between(290, 720)), y = Math.round(between(140, 540));
    if (!clear(x, y, 110) || wells.some((w) => Math.hypot(w.x - x, w.y - y) < 240)) continue;
    wells.push({ id: `f-well-${i}`, label: i ? 'Cygnus-B' : 'Anchor', x, y, core: Math.round(between(30, 34)), sling: Math.round(between(90, 106)), reach: Math.round(between(205, 245)), strength: Math.round(between(470, 540)) * 1000, color: COLORS[i % 2] });
    i++;
  }
  const asteroids = [];
  for (let i = 0, tries = 0; i < (setup.asteroids ?? 2) && tries < 300; tries++) {
    const x = Math.round(between(230, 800)), y = Math.round(between(70, 610));
    if (!clear(x, y, 60) || wells.some((w) => Math.hypot(w.x - x, w.y - y) < w.core + 70)) continue;
    const a = rand() * Math.PI * 2, sp = between(26, 52);
    asteroids.push({ id: `f-rock-${i}`, x, y, vx: Math.round(Math.cos(a) * sp), vy: Math.round(Math.sin(a) * sp), r: Math.round(between(18, 22)) });
    i++;
  }
  const flares = [];
  if ((setup.flares ?? 0) > 0 && wells.length) flares.push({ id: 'f-flare', x: wells[0].x, y: wells[0].y, angle: Math.round(between(-3, 3) * 100) / 100, spin: rand() < 0.5 ? 0.34 : -0.34, length: 230, width: 18 });
  const n = rand() < 0.5 ? 1 : 2;
  return {
    id: `field-${seed}-${attempt}`, name: n === 1 ? 'Open space' : 'Drift lane', subtitle: 'Field sector',
    briefing: 'Clear the waypoint gate, then catch the exit. Bend your burns round the wells.',
    maxTurns: undefined, parTurns: 3, parFuel: 46, meteorEvery: setup.meteorEvery ?? 0,
    ship, wells, gates, asteroids, flares, fog: [],
  };
}

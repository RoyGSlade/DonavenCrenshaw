// Bots for the docking game: they drive the same stepDocking inputs a hand does ({ aim, thrust }), so the pure tests can prove the
// game is fair (perfect always docks), has a skill curve (a wobbly hand passes more at a smoother roll) and cannot be cheesed
// (a hand that does nothing, or one that mashes, never passes).
//   perfect  sees the true state, flies the exact line: follows the lane's own sweep, closes at a speed that falls with distance
//   wobbly   a human-sized hand: it looks at the scene as it was `lag` seconds ago, decides every `every` seconds, aims with some
//            error and holds thrust on or off (no half power)
//   lazy     never touches anything
//   mash     a new random aim every 0.1 s and the thrust always held
import { frameOf, halfAt, stepDocking, createDocking, DOCKING_DT, A_T, DRAG, DM, RB } from './model.js';
import { step as rngStep, hashSeed } from './rng.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** The exact control: aim and a thrust level. */
export function perfectInput(s, f = frameOf(s)) {
  const q = Math.abs(f.l) / Math.max(halfAt(s, f.d), 3);
  const go = clamp((1 - q) / 0.5, 0.12, 1);                 // dive in only once lined up
  const closing = clamp(0.45 * f.d, 2, 10) * go;
  const lane = f.w * (RB + Math.max(f.d, 0));               // how fast the lane's centre moves sideways at the ship's distance
  const vx = f.n.x * (lane - 1.3 * f.l) - f.u.x * closing, vy = f.n.y * (lane - 1.3 * f.l) - f.u.y * closing;
  const ax = (vx - s.vx) / 0.6 + DRAG * s.vx, ay = (vy - s.vy) / 0.6 + DRAG * s.vy;
  return { aim: Math.atan2(ay, ax), thrust: clamp(Math.hypot(ax, ay) / A_T, 0, 1) };
}

export function makeBot(kind, seed = 1, o = {}) {
  let rng = hashSeed('dockbot', kind, seed);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  if (kind === 'perfect') return (s) => perfectInput(s);
  if (kind === 'lazy') return () => ({ aim: null, thrust: 0 });
  if (kind === 'mash') { let next = 0, aim = 0; return (s) => { if (s.t >= next) { aim = rand() * 2 * Math.PI - Math.PI; next = s.t + 0.1; } return { aim, thrust: 1 }; }; }
  // wobbly
  const lag = o.lag ?? 0.25, every = o.every ?? 0.25, sigma = o.sigma ?? 0.6, thr = o.threshold ?? 0.35;
  const seen = []; let held = { aim: null, thrust: 0 }, nextAt = 0;
  return (s) => {
    seen.push({ t: s.t, x: s.x, y: s.y, vx: s.vx, vy: s.vy });
    if (s.t < nextAt) return held;
    nextAt = s.t + every;
    let old = seen[0]; for (const q of seen) { if (q.t <= s.t - lag) old = q; else break; }
    while (seen.length > 1 && seen[1].t <= s.t - lag) seen.shift();
    const view = { ...s, x: old.x, y: old.y, vx: old.vx, vy: old.vy };
    const p = perfectInput(view, frameOf(view, s.t));
    held = { aim: p.aim + sigma * gauss(), thrust: p.thrust > thr ? 1 : 0 };
    return held;
  };
}

/** Fly a whole run with a bot. Returns the finished state. */
export function runBot(kind, { seed = 1, setup = {}, o = {}, quick = false } = {}) {
  const s = createDocking({ seed, setup: { ...setup, ...(quick ? { tmax: setup.tmaxQuick ?? setup.tmax } : {}) }, quick });
  const bot = makeBot(kind, seed, o);
  for (let i = 0; i < 60 * (s.tmax + 2) && !s.done; i++) stepDocking(s, DOCKING_DT, bot(s));
  return s;
}

/** A pass rate over n seeds: { rate, meanTime, medianTime, clean }. */
export function sweep(kind, setup, n = 200, o = {}, quick = false) {
  let pass = 0, clean = 0; const times = [];
  for (let i = 1; i <= n; i++) { const r = runBot(kind, { seed: i * 7 + 3, setup, o, quick }).result; if (r.success) { pass++; times.push(r.timeS); if (r.clean) clean++; } }
  times.sort((a, b) => a - b);
  return { rate: pass / n, clean: clean / n, meanTime: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null, medianTime: times.length ? times[times.length >> 1] : null };
}
void DM;

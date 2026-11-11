// The hacking minigame: a bypass. A cursor sweeps round the lock's ring; hit
// Splice while it sits inside the lit window to set a tumbler. Each one sets
// faster and the sweep turns back. Miss too often and the trace trips; run out
// the timer and the lock resets. Pure and seeded; the page sends splice().
// Skill levels change the minigame itself (activityMods 'hack'): more time,
// wider windows, an extra miss. Difficulty (a door's lock level) tightens it.
import { step as rngStep, hashSeed } from '../../quests/rng.js';
import TUNING from '../tuning.json' with { type: 'json' };

export const HACK = Object.freeze({ ...TUNING.hack });
const TAU = Math.PI * 2;
const wrap = a => ((a % TAU) + TAU) % TAU;

export function createHack({ difficulty = 1, seed = 1, mods = {} } = {}) {
  let rng = hashSeed('hack', seed, difficulty);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const level = Math.max(1, Math.min(4, difficulty));
  const count = HACK.tumblers + level - 1;
  const width = Math.max(0.18, (HACK.window + HACK.windowPerLevel * (level - 1)) * (1 + (mods.window || 0)));
  const tumblers = Array.from({ length: count }, (_, i) => ({ at: wrap(rand() * TAU + i * 1.7), width: width * (1 - i * 0.05), set: false }));
  return {
    t: 0, difficulty: level, time: Math.max(6, HACK.time + HACK.timePerLevel * (level - 1) + (mods.time || 0)),
    misses: 0, allowed: HACK.misses + (mods.misses || 0), cursor: wrap(tumblers[0].at + Math.PI), dir: 1,
    tumblers, index: 0, done: false, result: null, events: [],
  };
}

export const speedOf = h => HACK.speed + HACK.speedStep * h.index;
const inside = (h, tb) => { const d = Math.abs(((h.cursor - tb.at + Math.PI * 3) % TAU) - Math.PI); return d <= tb.width / 2; };
export const cursorInWindow = h => !h.done && inside(h, h.tumblers[h.index]);

export function stepHack(h, dt = 1 / 60) {
  h.events = [];
  if (h.done) return h;
  h.t += dt;
  h.cursor = wrap(h.cursor + h.dir * speedOf(h) * dt);
  if (h.t >= h.time) finish(h, false, 'timeout');
  return h;
}

/** Splice now. Returns 'set', 'miss' or null (nothing to do). */
export function splice(h) {
  if (h.done) return null;
  const tb = h.tumblers[h.index];
  if (inside(h, tb)) {
    tb.set = true;
    h.index++;
    h.dir *= -1;
    h.events.push({ type: 'set', n: h.index });
    if (h.index >= h.tumblers.length) finish(h, true, 'open');
    return 'set';
  }
  h.misses++;
  h.events.push({ type: 'miss', misses: h.misses });
  if (h.misses > h.allowed) finish(h, false, 'trace');
  return 'miss';
}

function finish(h, success, how) {
  h.done = true;
  h.result = { success, how, set: h.index, misses: h.misses, time: Math.round(h.t * 10) / 10 };
  h.events.push({ type: 'done', ...h.result });
}

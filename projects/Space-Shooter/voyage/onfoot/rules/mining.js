// The mining minigame: a drill on a heat meter. Hold to drill: heat climbs.
// Keep the heat inside the green band (it drifts as the drill bites into the
// vein) and the bit goes deep fast; under it the drill only scratches, over it
// the bit glows and jams if the meter tops out. Each quarter of the depth
// cracks loose a chunk of ore; a run with no jams adds a clean-core bonus.
// Pure and deterministic; the page feeds { drill } each step.

// Numbers in ../tuning.json "mining": duration (s before the vein closes),
// heatUp / coolDown (per s), band (green width), fast / slow / hot (depth per s
// in, under and over the band), jamTime (s), chunks (ore chunks in a vein).
import TUNING from '../tuning.json' with { type: 'json' };

export const MINING = Object.freeze({ ...TUNING.mining });

/** speed: the captain's dig multiplier, 1 + effect(c, 'mine.speed') (Strength), clamped at 0.5. */
/**
 * mods: activityMods(c, 'mine') (ROUND2-CONTRACT section 9): `sweet` = the green band
 * is bigger by that share (mine.sweet-spot, Salvager: 0.2 = 20% wider), `yield` =
 * extra ore from a run that cracked any (salvage.yield). heatUp / time are optional
 * data knobs (a slower-heating drill, a longer vein); no skill sets them today.
 */
export function createMining({ seed = 1, chunks = MINING.chunks, speed = 1, mods = {} } = {}) {
  return { t: 0, speed: Math.max(0.5, speed), band: MINING.band * (1 + (mods.sweet || 0)), heatUp: Math.max(0.2, MINING.heatUp + (mods.heatUp || 0)), duration: MINING.duration + (mods.time || 0), bonus: Math.max(0, Math.round(mods.yield || 0)), seed: (seed % 997) / 997 * Math.PI * 2, heat: 0, progress: 0, drilling: false, jam: 0, jams: 0, cracks: 0, chunks, inBand: false, zone: 'cold', done: false, result: null, events: [] };
}

/** The green band's [low, high] at time t. */
export function bandAt(s) {
  const centre = 0.56 + 0.17 * Math.sin(s.t * 0.62 + s.seed) * Math.min(1, 0.3 + s.progress);
  const band = s.band ?? MINING.band;
  return [centre - band / 2, centre + band / 2];
}

export function stepMining(s, { drill = false } = {}, dt = 1 / 60) {
  if (s.done) return s;
  s.t += dt;
  s.events = [];
  if (s.jam > 0) {
    s.jam = Math.max(0, s.jam - dt);
    s.heat = Math.max(0, s.heat - MINING.coolDown * 1.4 * dt);
    s.drilling = false;
  } else {
    s.drilling = Boolean(drill);
    s.heat = Math.min(1, Math.max(0, s.heat + (s.drilling ? (s.heatUp ?? MINING.heatUp) : -MINING.coolDown) * dt));
    const [lo, hi] = bandAt(s);
    s.zone = s.heat < lo ? 'cold' : s.heat <= hi ? 'green' : 'hot';
    s.inBand = s.zone === 'green';
    if (s.drilling) {
      const rate = s.zone === 'green' ? MINING.fast : s.zone === 'hot' ? MINING.hot : MINING.slow;
      s.progress = Math.min(1, s.progress + rate * (s.speed || 1) * dt);
    }
    if (s.heat >= 1) { s.jam = MINING.jamTime; s.jams++; s.events.push({ type: 'jam' }); }
  }
  const cracked = Math.floor(s.progress * s.chunks + 1e-9);
  while (s.cracks < cracked) { s.cracks++; s.events.push({ type: 'crack', n: s.cracks }); }
  if (s.progress >= 1 || s.t >= (s.duration ?? MINING.duration)) {
    s.done = true;
    s.result = miningResult(s);
    s.events.push({ type: 'done', ...s.result });
  }
  return s;
}

/** What the run yields: ore count and a reward in core's format. */
export function miningResult(s) {
  const clean = s.progress >= 1 && s.jams === 0;
  const found = s.cracks + (clean ? 1 : 0);
  const ore = found > 0 ? found + (s.bonus || 0) : 0; // salvage.yield: one more part from every salvage
  return { ore, clean, jams: s.jams, time: Math.round(s.t * 10) / 10, reward: ore > 0 ? { items: { ore } } : null };
}

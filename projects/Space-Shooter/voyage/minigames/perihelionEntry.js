// The one clean entry for Perihelion (navigation v2). Everything a page needs, in one import:
//   Field (the d20 roll sets it up):  setupNavField({ tier, points, level })  ->  createNavField({ seed, setup })  ->  playNavField(root, opts)
//   Trainer (Donaven's five sectors): setupNavTrainer({ points, level })      ->  createNavTrainer({ index, setup }) ->  playNavTrainer(root, opts)
//   Stars pay XP in the trainer:      trainerSettle(progress, result) -> { progress, xp }
// Every play function resolves with the game's result ({ success, how, stars, turns, fuelUsed, hullLeft, xp, ... }) and puts
// the pure state on the panel as `.__state` (the browser tests drive bots through it). See nav2/HANDOFF.md for the wiring.
import { createPerihelion, starsFor } from './perihelion.js';
import { buildFieldSector } from './perihelionField.js';
import { TRAINER_SECTORS } from './perihelionData.js';
import { solve } from './perihelionBot.js';
import { setupPerihelion, PERI_CATEGORIES } from './setup.js';
import { playPerihelion } from './perihelionView.js';

export { TRAINER_SECTORS, PERI_CATEGORIES };
export const TRAINER_XP_PER_STAR = 2;
export const PERIHELION_NAME = 'Perihelion';
export const PERIHELION_VERB = 'Plot a burn';

/** The setup the d20 roll and the skill's points make for a field sector (a thin name for setupPerihelion). */
export const setupNavField = (o = {}) => setupPerihelion(o);
/** The trainer always runs at a Steady roll: the player's level and points count, the dice do not. */
export const setupNavTrainer = ({ points = {}, level } = {}) => setupPerihelion({ tier: 0, points, level });

/**
 * A field game. The sector is drawn from the seed; if a search bot cannot clear the drawn sector it is re-drawn (up to
 * `tries` times, deterministic), so a pass is always possible. `verify: false` skips that check (the tests measure the raw draw).
 */
export function createNavField({ seed = 1, setup = setupPerihelion(), verify = true, tries = 8 } = {}) {
  let s = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    s = createPerihelion({ seed, setup, sector: buildFieldSector(seed, setup, attempt), mode: 'field' });
    s.attempt = attempt;
    if (!verify || solve(s, { angles: 36, beam: 5 }).win) break;
  }
  return s;
}
export function createNavTrainer({ index = 0, setup = setupNavTrainer(), seed = 1 } = {}) {
  const sector = TRAINER_SECTORS[Math.max(0, Math.min(TRAINER_SECTORS.length - 1, index | 0))];
  return createPerihelion({ seed: seed + sector.number, setup, sector, mode: 'trainer' });
}

/** Play a field game on screen. opts: { seed, setup, title, sound, reducedMotion }. */
export function playNavField(root, { seed = 1, setup, title = 'Plot a burn', sound = () => {}, reducedMotion = () => false } = {}) {
  return playPerihelion(root, { state: createNavField({ seed, setup }), title, sound, reducedMotion });
}
/** Play one trainer sector on screen. opts: { index, setup, sound, reducedMotion }. */
export function playNavTrainer(root, { index = 0, setup, sound = () => {}, reducedMotion = () => false } = {}) {
  const state = createNavTrainer({ index, setup });
  return playPerihelion(root, { state, title: state.name, sound, reducedMotion });
}

/** What a trainer sector can pay: 2 XP per star. */
export const trainerXpFor = (stars) => TRAINER_XP_PER_STAR * Math.max(0, Math.min(3, stars | 0));

/**
 * Settle a trainer result against the saved progress ({ [sectorId]: { stars, bestFuel, bestTurns } }). Stars pay XP once: a
 * replay pays only for stars above the best so far. Never mutates; returns { progress, xp, newStars }.
 */
export function trainerSettle(progress = {}, result) {
  if (!result?.success || result.mode !== 'trainer') return { progress, xp: 0, newStars: 0 };
  const old = progress[result.sector] || { stars: 0, bestFuel: null, bestTurns: null };
  const newStars = Math.max(0, result.stars - old.stars);
  const next = {
    stars: Math.max(old.stars, result.stars),
    bestFuel: old.bestFuel == null ? result.fuelUsed : Math.min(old.bestFuel, result.fuelUsed),
    bestTurns: old.bestTurns == null ? result.turns : Math.min(old.bestTurns, result.turns),
  };
  return { progress: { ...progress, [result.sector]: next }, xp: trainerXpFor(newStars), newStars };
}

export { createPerihelion, playPerihelion, starsFor, solve };

// The haggle minigame (social). A price needle sweeps from their opening offer up
// to the cap. Tap Ask to name the price it sits on. The other side has a hidden
// limit, shown only as a lit comfort band just under it:
//   ask at or under the limit  -> a deal at that price (never under their offer)
//   ask over the limit         -> too rich: they raise their offer a quarter of the way to the limit,
//                                 you lose a patience and a round
//   rounds run out             -> they close at their current offer
//   patience runs out          -> they walk: the deal is half the opening offer
//   Take offer                 -> close now at their current offer
// Pure and seeded; the view sends ask() and takeOffer() and steps the clock.
import { step as rngStep, hashSeed } from '../quests/rng.js';

const CAP_OVER_BEST = 1.2;
const COUNTER_SHARE = 0.25; // a counter moves their offer a quarter of the way to their limit: greed alone never wins
export const OUTCOMES = Object.freeze({ well: 'well', fair: 'fair', walked: 'walked' });

/**
 * open: their first offer (credits). best: what a great haggle earns (the scene's best share).
 * setup: from setupHaggle (band, speed, patience, rounds, priceBonus).
 */
export function createHaggle({ seed = 1, open = 20, best = 30, setup = {} } = {}) {
  let rng = hashSeed('haggle', seed, open, best);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const cap = Math.round(best * CAP_OVER_BEST);
  const range = cap - open;
  const limitAt = 0.5 + rand() * 0.25;            // where their limit sits in the range, 0..1
  const limit = Math.round(open + limitAt * range);
  const phase = rand();
  return {
    open, best, cap, limit, limitAt,
    band: setup.band ?? 0.12, speed: setup.speed ?? 0.9, priceBonus: setup.priceBonus ?? 0,
    patience: setup.patience ?? 3, patienceMax: setup.patience ?? 3, rounds: setup.rounds ?? 3,
    offer: open, asks: 0, history: [], t: 0, phase,
    done: false, result: null, events: [],
  };
}

/** The needle's position 0..1 (a triangle wave) and the price it names. */
export const needleAt = (s, t = s.t) => { const x = (s.phase + t * s.speed) % 2; return x <= 1 ? x : 2 - x; };
export const priceAt = (s, pos = needleAt(s)) => Math.round(s.open + pos * (s.cap - s.open));
/** The comfort band in price terms: [low, high], high = their limit. */
export const bandPrices = (s) => [Math.round(s.open + Math.max(0, s.limitAt - s.band) * (s.cap - s.open)), s.limit];

export function stepHaggle(s, dt = 1 / 60) {
  s.events = [];
  if (!s.done) s.t += dt;
  return s;
}

/** Name the price the needle sits on. Returns 'deal', 'counter', 'walk' or 'close', or null when done. */
export function ask(s) {
  if (s.done) return null;
  const asked = Math.max(priceAt(s), s.open);
  s.asks++;
  if (asked <= Math.max(s.limit, s.offer)) {
    const price = Math.max(asked, s.offer);
    const [lo] = bandPrices(s);
    s.history.push({ asked, outcome: 'deal', price });
    finish(s, Math.min(s.cap, Math.round(price * (1 + s.priceBonus))), asked >= lo ? 'sweet' : 'low-ask');
    return 'deal';
  }
  s.patience--;
  const counter = Math.round(s.offer + (s.limit - s.offer) * COUNTER_SHARE);
  s.history.push({ asked, outcome: 'counter', counter });
  s.offer = Math.max(s.offer, counter);
  s.events.push({ type: 'counter', asked, offer: s.offer });
  if (s.patience <= 0) { finish(s, Math.round(s.open * 0.5), 'walked'); return 'walk'; }
  if (s.asks >= s.rounds) { finish(s, Math.round(s.offer * (1 + s.priceBonus)), 'final'); return 'close'; }
  return 'counter';
}

/** Close now at their current offer. */
export function takeOffer(s) {
  if (s.done) return null;
  finish(s, Math.min(s.cap, Math.round(s.offer * (1 + s.priceBonus))), 'took');
  return 'close';
}

/** What the price means for the scene: well (closed in the comfort band, or at 95% of the best share or more), fair (at least the opening offer), walked. */
export function outcomeOf(price, how, { open, best }) {
  if (how === 'walked') return OUTCOMES.walked;
  return how === 'sweet' || price >= Math.round(best * 0.95) ? OUTCOMES.well : price >= open ? OUTCOMES.fair : OUTCOMES.walked;
}
/** Placeholder XP: 3, +1 for a closing inside the comfort band. None when they walk. */
export const haggleXp = (r) => (r?.outcome === OUTCOMES.walked ? 0 : 3 + (r?.how === 'sweet' ? 1 : 0));

function finish(s, price, how) {
  s.done = true;
  const outcome = outcomeOf(price, how, s);
  s.result = { price, how, outcome, asks: s.asks, patienceLeft: s.patience, offer: s.offer, success: outcome === OUTCOMES.well, xp: 0 };
  s.result.xp = haggleXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}

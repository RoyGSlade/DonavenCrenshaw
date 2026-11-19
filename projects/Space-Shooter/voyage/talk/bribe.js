// The bribe minigame (social lane, plan 1.5): the haggle needle turned round. YOU pay. The needle sweeps the price you would
// offer from the bottom of the range to the top; they have a hidden floor, shown only as a lit comfort band just ABOVE it.
//   offer at or over their floor and inside the band  -> a deal at that price: GREAT
//   offer over the floor but above the band            -> a deal, you overpaid: OK
//   offer under their floor                            -> too low: they hold, a patience and a round are lost, and their ask
//                                                         drops a quarter of the way down toward the floor
//   Take their ask                                     -> pay what they are asking now (a deal, OK or GREAT by where it sits)
//   rounds run out                                     -> you pay their current ask (a deal)
//   patience runs out                                  -> they walk: no deal, you keep your money
// Bribe points are Haggle points: the price you pay is 1.5% lower per point (rounded down), the band is 0.4% of the range wider.
// Pure and seeded. The view sends offer() and takeAsk() and steps the clock.
import { step as rngStep, hashSeed } from '../quests/rng.js';
import { setupHaggle } from '../minigames/setup.js';

const COUNTER_SHARE = 0.25; // an ask moves a quarter of the way to their floor: lowballing alone never wins
export const GRADES = Object.freeze({ great: 'great', ok: 'ok', walked: 'walked' });

/** The game's setup: the haggle setup (tier, points) plus what the person's sheet and the facts add. */
export function setupBribe({ tier = 0, points = {}, level = 9, floorShift = 0, bandFactor = 1 } = {}) {
  const base = setupHaggle({ tier, points, level });
  return { ...base, band: Math.round(base.band * bandFactor * 10000) / 10000, floorShift, bandFactor, discount: base.priceBonus };
}

/**
 * min/max: the credits the needle can name. setup: from setupBribe. `floorShift`: +0.10 when they were paid recently, -0.15 when
 * the approach fits them, +0.15 when it is a misfit (added up by talk/push.js).
 */
export function createBribe({ seed = 1, min = 10, max = 40, setup = {} } = {}) {
  let rng = hashSeed('bribe', seed, min, max);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const range = max - min;
  const floorAt = 0.5 + rand() * 0.25;               // where their floor sits in the range before any shift, 0..1
  const shift = setup.floorShift ?? 0;
  const floor = Math.min(max, Math.max(min, Math.round((min + floorAt * range) * (1 + shift))));
  const phase = rand();
  return {
    min, max, floor, floorAt,
    band: setup.band ?? 0.12, speed: setup.speed ?? 0.9, discount: setup.discount ?? 0,
    patience: setup.patience ?? 3, patienceMax: setup.patience ?? 3, rounds: setup.rounds ?? 3,
    ask: max, asks: 0, history: [], t: 0, phase,
    done: false, result: null, events: [],
  };
}

/** The needle's position 0..1 (a triangle wave) and the offer it names. */
export const needleAt = (s, t = s.t) => { const x = (s.phase + t * s.speed) % 2; return x <= 1 ? x : 2 - x; };
export const priceAt = (s, pos = needleAt(s)) => Math.round(s.min + pos * (s.max - s.min));
/** The comfort band in credits: [floor, floor + band of the range]. Fractions kept: 28 to 32.278 is the whole band. */
export const bandPrices = (s) => [s.floor, s.floor + s.band * (s.max - s.min)];
/** What you actually pay for an agreed price: their discount per Haggle point, rounded down. */
export const payFor = (s, price) => Math.floor(price * (1 - s.discount));

export function stepBribe(s, dt = 1 / 60) {
  s.events = [];
  if (!s.done) s.t += dt;
  return s;
}

/** Name the offer the needle sits on. Returns 'deal', 'counter', 'walk' or 'close', or null when done. */
export function offer(s, named = priceAt(s)) {
  if (s.done) return null;
  const offered = Math.max(s.min, Math.min(s.max, named));
  s.asks++;
  if (offered >= s.floor) {
    const price = Math.min(offered, s.ask);
    s.history.push({ offered, outcome: 'deal', price });
    finish(s, price, price <= bandPrices(s)[1] ? 'sweet' : 'over');
    return 'deal';
  }
  s.patience--;
  const counter = Math.round(s.ask - (s.ask - s.floor) * COUNTER_SHARE);
  s.history.push({ offered, outcome: 'counter', counter });
  s.ask = Math.min(s.ask, Math.max(s.floor, counter));
  s.events.push({ type: 'counter', offered, ask: s.ask });
  if (s.patience <= 0) { finish(s, 0, 'walked'); return 'walk'; }
  if (s.asks >= s.rounds) { finish(s, s.ask, s.ask <= bandPrices(s)[1] ? 'sweet' : 'final'); return 'close'; }
  return 'counter';
}

/** Pay their current ask now. */
export function takeAsk(s) {
  if (s.done) return null;
  finish(s, s.ask, s.ask <= bandPrices(s)[1] ? 'sweet' : 'took');
  return 'close';
}

/** Placeholder XP, the haggle's: 3, +1 for a deal inside the band. None when they walk. */
export const bribeXp = (r) => (r?.grade === GRADES.walked ? 0 : 3 + (r?.how === 'sweet' ? 1 : 0));

function finish(s, price, how) {
  s.done = true;
  const walked = how === 'walked';
  const paid = walked ? 0 : payFor(s, price);
  const grade = walked ? GRADES.walked : how === 'sweet' ? GRADES.great : GRADES.ok;
  s.result = { price, paid, saved: walked ? 0 : price - paid, how, grade, outcome: walked ? 'walked' : how === 'sweet' ? 'sweet' : 'over', asks: s.asks, patienceLeft: s.patience, ask: s.ask, success: !walked, xp: 0 };
  s.result.xp = bribeXp(s.result);
  s.events.push({ type: 'done', ...s.result });
}

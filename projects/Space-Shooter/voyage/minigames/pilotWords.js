// Plain words and gauge fractions for the touchdown HUD (house rule: state shows as drawn bars and words, never raw numbers).
// Pure: every threshold comes from the model's state (`safe`, `fuelMax`), nothing is copied here.

/** The descent gauge spans 0 .. GAUGE_SPAN x the safe speed, so the safe zone is the first 1/GAUGE_SPAN of it. */
export const GAUGE_SPAN = 3;

/** Where the safe zone ends on the gauge, 0..1. */
export const safeMark = () => 1 / GAUGE_SPAN;

/** How full the descent gauge is, 0..1 (a rising ship reads as empty). */
export const speedFill = (vy, safe) => Math.max(0, Math.min(1, Math.max(0, vy) / (safe * GAUGE_SPAN)));

/** One word for the fall: gentle (well inside the safe speed), safe, or too fast. */
export function speedWord(vy, safe) {
  const sp = Math.max(0, vy);
  return sp <= safe * 0.5 ? 'gentle' : sp <= safe ? 'safe' : 'too fast';
}

/** Colour band for the fall: ok, warn (up to double the safe speed) or bad. */
export const speedTone = (vy, safe) => { const sp = Math.max(0, vy); return sp <= safe ? 'ok' : sp <= safe * 2 ? 'warn' : 'bad'; };

/** Fuel: 'ok', then 'amber' under 40%, then 'low' (red) under 20%, then 'empty'. */
export function fuelLevel(fuel, fuelMax) {
  if (fuel <= 0) return 'empty';
  const f = fuel / fuelMax;
  return f < 0.2 ? 'low' : f < 0.4 ? 'amber' : 'ok';
}
export const fuelWord = (level) => (level === 'empty' ? 'empty' : level === 'low' ? 'low' : '');

/** Wind: calm under 0.4, otherwise a side; strength 0..1 against twice the setup wind (for streak speed and opacity). */
export function windRead(w, setupWind = 1.5) {
  if (Math.abs(w) < 0.4) return { dir: 0, word: 'calm', strength: 0 };
  return { dir: w > 0 ? 1 : -1, word: w > 0 ? 'blowing right' : 'blowing left', strength: Math.min(1, Math.abs(w) / Math.max(0.5, setupWind * 2)) };
}

/** The end-of-flight sentence under the field, no numbers. It says what happened; the card title says it too, so keep them different. `r` is the model's result. */
export function endWords(r) {
  if (r.outcome === 'landed') return r.soft ? 'Down on the pad, a soft touch.' : 'Down on the pad, safe.';
  if (r.outcome === 'crashed') return r.fuelLeft <= 0 ? 'The tank ran dry on the way down.' : 'The ship hit the ground hard.';
  return 'You came down beside the pad.';
}

/** What to try next, for the result card's line (never repeats the card's title). No numbers. */
export function tryWords(r) {
  if (r.outcome === 'crashed') return r.fuelLeft <= 0 ? 'Save some Thrust for the last stretch' : 'Hold Thrust earlier to slow the fall';
  if (r.outcome === 'missed') return 'Drift over the pad sooner';
  return '';
}

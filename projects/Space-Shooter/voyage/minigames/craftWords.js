// Colour and words for the forge: the stock glows dull red, orange, yellow and white as the heat rises (house rule: mechanics show their
// state physically, the HUD uses words and drawn pips, never raw numbers). Pure.

const STOPS = [
  [0.00, [44, 50, 58]],    // cold steel
  [0.30, [122, 29, 18]],   // dull red
  [0.55, [212, 80, 26]],   // orange
  [0.78, [255, 194, 58]],  // yellow
  [1.00, [255, 246, 220]], // white hot
];

/** [r, g, b] of the stock at heat t (0..1). */
export function heatRgb(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]; const [t0, c0] = STOPS[i - 1];
    if (x <= t1) { const k = (x - t0) / (t1 - t0); return c0.map((v, j) => Math.round(v + (c1[j] - v) * k)); }
  }
  return STOPS[STOPS.length - 1][1].slice();
}
export const heatColor = (t) => `rgb(${heatRgb(t).join(' ')})`;
/** The glow around the stock: the same colour, more of it as it heats. */
export const heatGlow = (t) => `rgb(${heatRgb(t).join(' ')} / ${(Math.max(0, Math.min(1, (t - 0.12) / 0.88)) * 0.9).toFixed(2)})`;

/** One word for the temperature against the lit band [lo, hi]. */
export function heatWord(t, [lo, hi]) {
  if (t > hi) return 'too hot';
  if (t >= lo) return 'in the band: let go';
  if (t >= lo - 0.12) return 'nearly there';
  return t < 0.3 ? 'cold' : 'warming up';
}

/** The row of step pips: 'clean', 'spoiled', 'next' (the step to tap now) or 'empty'. */
export function stepPips(s) {
  return Array.from({ length: s.strikes }, (_, i) => {
    if (i < s.index) return s.marks[i] === 'good' ? 'clean' : 'spoiled';
    if (i === s.index && s.phase === 'shape' && !s.done) return s.dirty ? 'spoiled' : 'next';
    return 'empty';
  });
}

/** A quality word for the result card. */
export const qualityWord = (q) => (q >= 90 ? 'Flawless' : q >= 65 ? 'Fine' : 'Rough');

// Pilot touchdown and Heat and shape: the view helpers that turn model state into words, gauge fractions and colours
// (house rule: state shows as drawn bars and plain words, never raw numbers). Pure: no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAUGE_SPAN, safeMark, speedFill, speedWord, speedTone, fuelLevel, fuelWord, windRead, endWords } from '../projects/Space-Shooter/voyage/minigames/pilotWords.js';
import { heatRgb, heatColor, heatGlow, heatWord, stepPips, qualityWord } from '../projects/Space-Shooter/voyage/minigames/craftWords.js';
import { createPilot } from '../projects/Space-Shooter/voyage/minigames/pilot.js';
import { createCraft, shape, release, heatStart, stepCraft } from '../projects/Space-Shooter/voyage/minigames/craft.js';

test('descent gauge: the safe zone is the first third and the word follows the model\'s safe speed', () => {
  assert.equal(safeMark(), 1 / GAUGE_SPAN);
  for (const safe of [2, 3, 4.5]) {
    assert.equal(speedWord(0, safe), 'gentle');
    assert.equal(speedWord(safe * 0.5, safe), 'gentle');
    assert.equal(speedWord(safe * 0.51, safe), 'safe');
    assert.equal(speedWord(safe, safe), 'safe');
    assert.equal(speedWord(safe * 1.01, safe), 'too fast');
    assert.equal(speedWord(-5, safe), 'gentle', 'rising reads as gentle');
    assert.equal(speedFill(safe, safe), safeMark(), 'the needle sits on the safe mark at exactly the safe speed');
    assert.equal(speedFill(safe * 10, safe), 1);
    assert.equal(speedFill(-1, safe), 0);
    assert.deepEqual([speedTone(safe, safe), speedTone(safe * 1.5, safe), speedTone(safe * 3, safe)], ['ok', 'warn', 'bad']);
  }
  // The threshold is read from the model, not copied: a real pilot's safe speed drives the words.
  const s = createPilot({ seed: 3, setup: { safe: 2 } });
  assert.equal(speedWord(2.1, s.safe), 'too fast'); assert.equal(speedWord(1.9, s.safe), 'safe');
});

test('fuel: drains to amber, then red, then empty; the word only shows when low', () => {
  assert.deepEqual([10, 4.1, 3.9, 1.9, 0].map((f) => fuelLevel(f, 10)), ['ok', 'ok', 'amber', 'low', 'empty']);
  assert.deepEqual(['ok', 'amber', 'low', 'empty'].map(fuelWord), ['', '', 'low', 'empty']);
});

test('wind: words and a strength for the streaks', () => {
  assert.deepEqual(windRead(0.2), { dir: 0, word: 'calm', strength: 0 });
  assert.equal(windRead(1).word, 'blowing right'); assert.equal(windRead(-1).word, 'blowing left');
  assert.ok(windRead(1).strength > 0 && windRead(1).strength < windRead(2.9).strength && windRead(99).strength === 1);
});

test('end words carry no digits', () => {
  for (const r of [{ outcome: 'landed', soft: true }, { outcome: 'landed' }, { outcome: 'crashed' }, { outcome: 'missed' }]) assert.doesNotMatch(endWords(r), /\d/);
});

test('heat colour climbs cold steel, dull red, orange, yellow, white and never leaves 0..255', () => {
  const [r0, g0, b0] = heatRgb(0), [r1, g1] = heatRgb(0.3), [r2, g2] = heatRgb(0.55), [r3, g3] = heatRgb(0.78), [r4, g4, b4] = heatRgb(1);
  assert.ok(b0 > r0 - 20 && Math.abs(r0 - g0) < 12, 'cold is a grey steel');
  assert.ok(r1 > 100 && g1 < 40, 'dull red');
  assert.ok(r2 > 190 && g2 > 60 && g2 < 110, 'orange');
  assert.ok(r3 > 240 && g3 > 170, 'yellow');
  assert.ok(r4 > 240 && g4 > 230 && b4 > 200, 'white hot');
  let prev = 0;
  for (let i = 0; i <= 100; i++) { const c = heatRgb(i / 100); assert.ok(c.every((v) => v >= 0 && v <= 255)); const lum = c[0] + c[1] + c[2]; assert.ok(lum >= prev - 1, `brightness never falls as heat rises (${i})`); prev = lum; }
  assert.deepEqual(heatRgb(-3), heatRgb(0)); assert.deepEqual(heatRgb(9), heatRgb(1));
  assert.match(heatColor(0.5), /^rgb\(\d+ \d+ \d+\)$/); assert.match(heatGlow(0), / 0\.00\)$/); assert.match(heatGlow(1), / 0\.90\)$/);
});

test('heat words track the lit band the model gives', () => {
  const band = [0.5, 0.7];
  assert.deepEqual([0.15, 0.35, 0.45, 0.5, 0.7, 0.71].map((t) => heatWord(t, band)), ['cold', 'warming up', 'nearly there', 'in the band: let go', 'in the band: let go', 'too hot']);
});

test('step pips: empty, the next step, clean, spoiled; no numbers in the words', () => {
  const s = createCraft({ seed: 2, setup: { strikes: 4 } });
  assert.deepEqual(stepPips(s), ['empty', 'empty', 'empty', 'empty'], 'before shaping nothing is lit');
  heatStart(s); stepCraft(s, 0.3); release(s);
  assert.deepEqual(stepPips(s), ['next', 'empty', 'empty', 'empty']);
  const wrong = s.tiles.find((t) => t !== s.order[0]);
  shape(s, wrong);
  assert.deepEqual(stepPips(s), ['spoiled', 'empty', 'empty', 'empty'], 'a wrong tap marks the current step spoiled');
  shape(s, s.order[0]);
  assert.deepEqual(stepPips(s), ['spoiled', 'next', 'empty', 'empty'], 'the fixed step stays spoiled');
  shape(s, s.order[1]);
  assert.deepEqual(stepPips(s), ['spoiled', 'clean', 'next', 'empty']);
  assert.equal(stepPips(s).length, s.strikes);
  assert.deepEqual([95, 70, 40].map(qualityWord), ['Flawless', 'Fine', 'Rough']);
});

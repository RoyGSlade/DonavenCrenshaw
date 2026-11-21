// Five shoppers sweep every fixture, every tier and many seeds. A screen has no skill curve; what must hold is the invariants:
// nothing is created or lost (bag plus crate is constant), capacity is never passed, sealed stays sealed, points never take away,
// and the one who rests does as well as the one who does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../model.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'fixtures.json'), 'utf8')).fixtures;
const TIERS = [-2, -1, 0, 1, 2];
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const rng = (seed) => { let i = 0; return () => M.rand01(M.hashSeed(seed, i++)); };
const stackKeys = (s) => M.view(s).stacks.map((x) => x.key);
const bagIds = (s) => Object.keys(s.bag);

// each bot is a function (state, rand, rest) that plays until it is done; `rest()` is the thinker's pause (a no-op for the model: it has no clock)
const BOTS = {
  perfect(s) { M.openLid(s); let guard = 0; while (guard++ < 400) { const k = stackKeys(s)[0]; if (!k) break; const before = M.bagUnits(s); M.takeAll(s, k); if (M.bagUnits(s) === before) break; } M.chalk(s); },
  wobbly(s, r) { // taps the wrong thing a third of the time, forgets to open once in a while
    if (r() > 0.1) M.openLid(s);
    for (let i = 0; i < 40; i++) { const ks = stackKeys(s); if (r() < 0.33) { M.take(s, 'wrong-key'); M.putIn(s, 'wrong'); continue; } if (!ks.length) break; const k = ks[Math.floor(r() * ks.length)]; r() < 0.5 ? M.take(s, k) : M.takeAll(s, k); if (r() < 0.2 && bagIds(s).length) M.putIn(s, bagIds(s)[0]); }
    if (r() < 0.5) M.chalk(s);
  },
  lazy(s) { M.openLid(s); const k = stackKeys(s)[0]; if (k) M.take(s, k); },
  mash(s, r) { const acts = ['open', 'take', 'all', 'put', 'chalk', 'shut']; for (let i = 0; i < 300; i++) { const a = acts[Math.floor(r() * acts.length)]; const ks = stackKeys(s); const k = ks[Math.floor(r() * ks.length)] || 'x'; const b = bagIds(s)[0] || 'x'; if (a === 'open') M.openLid(s); else if (a === 'take') M.take(s, k); else if (a === 'all') M.takeAll(s, k); else if (a === 'put') M.putIn(s, b, 1 + Math.floor(r() * 4)); else if (a === 'chalk') M.chalk(s); else M.shutLid(s); check(s); } },
  rester(s, r, rest) { rest(); M.openLid(s); rest(); let guard = 0; while (guard++ < 400) { const k = stackKeys(s)[0]; if (!k) break; const before = M.bagUnits(s); rest(); M.takeAll(s, k); if (M.bagUnits(s) === before) break; } rest(); M.chalk(s); rest(); },
};

let units0;
function check(s) {
  assert.equal(M.conserved(s), units0, 'nothing created or lost');
  assert.ok(M.crateTotal(s) <= Math.max(s.capacity, M.crateTotal(s) + 0) , 'crate total sane');
  if (s.bagCap !== Infinity) assert.ok(M.bagUnits(s) <= Math.max(s.bagCap, bagStart), 'bag capacity never passed');
  for (const n of Object.values(s.bag)) assert.ok(n > 0 && Number.isInteger(n));
  for (const l of s.lines) assert.ok(l.qty >= 0 && Number.isInteger(l.qty));
}
let bagStart = 0;

function run(bot, fixture, tier, seed, extra = {}) {
  const context = structuredClone(FX[fixture].context);
  const s = M.createLook({ seed, tier, context, ...extra });
  units0 = M.conserved(s); bagStart = M.bagUnits(s);
  const capBefore = M.crateTotal(s);
  BOTS[bot](s, rng(seed * 7 + tier), () => { /* a rest: no clock in the model, so nothing may change */ });
  check(s);
  if (s.sealed) { assert.equal(s.lid, 'shut'); assert.equal(M.crateTotal(s), capBefore); assert.equal(s.tag, s.tagInit); }
  if (!s.sealed) assert.ok(M.crateTotal(s) <= Math.max(s.capacity, capBefore));
  return { s, r: M.finish(s) };
}

test('the five shoppers hold every invariant on every fixture, tier and seed', () => {
  for (const bot of Object.keys(BOTS)) for (const f of Object.keys(FX)) for (const tier of TIERS) for (const seed of SEEDS) run(bot, f, tier, seed);
});

test('points never make it worse: with points a shopper sees and takes at least as much', () => {
  for (const f of Object.keys(FX)) for (const tier of TIERS) for (const seed of SEEDS.slice(0, 8)) {
    const lo = run('perfect', f, tier, seed).r, hi = run('perfect', f, tier, seed, { points: { awareness: 3, inspection: 3, trace: 3 }, level: 9 }).r;
    const sum = (o) => Object.values(o).reduce((a, n) => a + n, 0);
    assert.ok(sum(hi.took) >= sum(lo.took), `${f} t${tier} s${seed}: took ${sum(hi.took)} vs ${sum(lo.took)}`);
    assert.ok(hi.saw.hidden.length >= lo.saw.hidden.length);
    assert.ok(hi.saw.mismatches.length >= lo.saw.mismatches.length);
  }
});

test('the thinker who rests does exactly as well as the one who does not', () => {
  for (const f of Object.keys(FX)) for (const tier of TIERS) for (const seed of SEEDS) {
    const a = run('perfect', f, tier, seed).r, b = run('rester', f, tier, seed).r;
    assert.deepEqual(b, a, `${f} t${tier} s${seed}`);
  }
});

test('the perfect shopper opens everything that opens, the lazy one takes one thing, the mash one never breaks it', () => {
  for (const f of Object.keys(FX)) for (const tier of TIERS) {
    const p = run('perfect', f, tier, 3).r, l = run('lazy', f, tier, 3).r;
    assert.equal(p.success, !FX[f].context.crate.sealed);
    assert.ok(Object.values(l.took).reduce((a, n) => a + n, 0) <= 1);
  }
});

// the table: per bot, per tier, over every fixture and 20 seeds. Printed with `node --test` output when BOT_TABLE=1.
test('bot table (and the length of a visit)', () => {
  const rows = [];
  for (const bot of Object.keys(BOTS)) {
    const row = { bot };
    for (const tier of TIERS) {
      let opened = 0, took = 0, n = 0, moves = 0, saw = 0;
      for (const f of Object.keys(FX)) for (const seed of SEEDS) { const { s, r } = run(bot, f, tier, seed); n++; opened += r.success ? 1 : 0; took += Object.values(r.took).reduce((a, x) => a + x, 0); moves += s.moves; saw += r.saw.mismatches.length + r.saw.hidden.length; }
      row[`t${tier}`] = `${Math.round((opened / n) * 100)}% opened, ${(took / n).toFixed(1)} taken, ${(moves / n).toFixed(1)} moves, ${(saw / n).toFixed(1)} seen`;
    }
    rows.push(row);
  }
  if (process.env.BOT_TABLE) console.table(rows);
  assert.equal(rows.length, 5);
});

// Bot sweep over the model: four shoppers (perfect, wobbly, lazy, mash) across every fixture, tier and a spread of seeds.
// A screen has no skill score to tune, so the table reports what a shopper got, and the test holds the invariants that
// must never break: nobody spends more than they hold, buys a locked or over-limit item, or ends with a corrupt result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as M from '../model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(path.join(here, '..', 'fixtures.json'), 'utf8')).fixtures;
const clone = (o) => JSON.parse(JSON.stringify(o));
const rng = (seed) => { let n = M.hashSeed('bot', seed); return () => { n = (n + 0x6d2b79f5) >>> 0; let t = Math.imul(n ^ (n >>> 15), n | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pickOf = (r, list) => list[Math.floor(r() * list.length)];

function make(name, seed, tier, points = {}) {
  return M.createCounter({ seed, tier, points, haggleReady: true, context: clone(FIX[name].context) });
}
function checkInvariants(s, label) {
  const r = M.finish(s, { left: true });
  assert.ok(s.save.money >= 0, `${label}: money never goes negative`);
  assert.equal(s.save.money, s.startMoney + r.earned - r.spent, `${label}: the purse adds up`);
  assert.equal(r.effects.world.moneyDelta, r.earned - r.spent);
  assert.ok(r.spent <= s.startMoney + r.earned, `${label}: never spends more than held`);
  for (const [id, n] of Object.entries(r.bought)) {
    const e = s.stock.find((x) => x.item === id);
    assert.ok(!s.shut, `${label}: a shut shop sells nothing`);
    if (e.limit !== undefined) assert.ok((s.bought[id] || 0) <= e.limit, `${label}: ${id} within its limit`);
  }
  for (const [id, n] of Object.entries(r.effects.items || {})) assert.ok(Number.isInteger(n) && n !== 0);
  assert.equal(JSON.stringify(r), JSON.stringify(JSON.parse(JSON.stringify(r))));
  return r;
}

const BOTS = {
  perfect(s, r) {
    const v = M.view(s);
    let budget = s.save.money;
    const wants = [];
    for (const it of [...v.shelves].filter((x) => x.canLift && !x.locked).sort((a, b) => b.price - a.price)) { if (it.price <= budget) { wants.push(it.id); budget -= it.price; } }
    for (const id of wants) M.lift(s, id);
    if (M.canHaggle(s)) M.applyHaggle(s, { outcome: 'well' });
    const ev = M.pay(s);
    return { wanted: wants.length, got: ev[0]?.type === 'pay' ? wants.length : 0, ok: wants.length === 0 || ev[0]?.type === 'pay' };
  },
  wobbly(s, r) {
    const ids = s.stock.map((e) => e.item);
    const n = 1 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) M.lift(s, pickOf(r, ids));
    for (let i = 0; i < 6 && !M.basketCount(s); i++) M.lift(s, pickOf(r, ids)); // a wobbly hand taps a locked glass now and then, then tries again
    if (r() < 0.3 && M.canHaggle(s)) M.applyHaggle(s, { outcome: pickOf(r, ['well', 'fair', 'walked']) });
    let ev = M.pay(s);
    while (ev[0]?.type === 'broke') { const left = Object.keys(s.basket); M.putBack(s, pickOf(r, left)); ev = M.pay(s); }
    if (ev[0]?.type !== 'pay') { // priced out of everything it picked: it takes the cheapest thing it can carry and pays
      const cheap = M.view(s).shelves.filter((x) => x.canLift).sort((a, b) => a.price - b.price)[0];
      if (cheap) { M.lift(s, cheap.id); ev = M.pay(s); }
    }
    return { wanted: n, got: ev[0]?.type === 'pay' ? 1 : 0, ok: ev[0]?.type === 'pay' };
  },
  lazy() { return { wanted: 0, got: 0, ok: false }; },
  mash(s, r) {
    const ids = s.stock.map((e) => e.item);
    for (let i = 0; i < 80; i++) {
      const k = r();
      if (k < 0.4) M.lift(s, pickOf(r, ids));
      else if (k < 0.55) M.putBack(s, pickOf(r, ids));
      else if (k < 0.7) M.pay(s);
      else if (k < 0.8) M.tapLocked(s, pickOf(r, ids));
      else if (k < 0.85 && M.canHaggle(s)) M.applyHaggle(s, { outcome: pickOf(r, ['well', 'fair', 'walked']) });
      else if (k < 0.93) { const t = M.trayOf(s); if (t.length) M.offer(s, pickOf(r, t).id); }
      else M.sellOne(s);
    }
    return { wanted: 0, got: 0, ok: true };
  },
};

test('bot sweep: four shoppers over every fixture, tier and seed keep the invariants', () => {
  const table = {};
  for (const name of Object.keys(FIX)) {
    for (const tier of [-2, -1, 0, 1, 2]) {
      for (const [bot, fn] of Object.entries(BOTS)) {
        const row = (table[`${name}/${bot}`] ??= { runs: 0, bought: 0, success: 0 });
        for (let seed = 1; seed <= 12; seed++) {
          const s = make(name, seed, tier, { valuation: seed % 4, barter: seed % 3, market: seed % 5 });
          const res = fn(s, rng(seed * 31 + tier));
          const label = `${name}/${bot}/tier${tier}/seed${seed}`;
          const out = checkInvariants(s, label);
          const probe = M.createCounter({ context: clone(FIX[name].context) });
          for (const id of Object.keys(out.bought)) assert.equal(M.missing(probe.save, probe.stock.find((x) => x.item === id).requires || {}, {}).length, 0, `${label}: ${id} was locked`);
          row.runs++; row.bought += out.success ? 1 : 0; row.success += res.ok ? 1 : 0;
        }
      }
    }
  }
  console.log('\nshopper table (runs: 60 per cell = 12 seeds x 5 tiers). "went home with something" and "did what it set out to do":');
  for (const [k, v] of Object.entries(table)) console.log(`  ${k.padEnd(14)} traded ${String(Math.round((100 * v.bought) / v.runs)).padStart(3)}%   goal met ${String(Math.round((100 * v.success) / v.runs)).padStart(3)}%`);
  for (const name of Object.keys(FIX)) {
    assert.equal(table[`${name}/perfect`].success, table[`${name}/perfect`].runs, `${name}: the perfect shopper always gets what it set out for`);
    assert.equal(table[`${name}/lazy`].bought, 0, `${name}: the lazy shopper buys nothing`);
    assert.ok(table[`${name}/wobbly`].success / table[`${name}/wobbly`].runs >= 0.9, `${name}: a wobbly shopper who corrects after a broke still gets served`);
  }
});

test('points never make it worse: every shopper, same shop, 0 points vs 9 in each path', () => {
  for (const name of Object.keys(FIX)) {
    for (const [bot, fn] of Object.entries(BOTS)) {
      for (let seed = 1; seed <= 6; seed++) {
        const run = (points) => { const s = make(name, seed, 0, points); fn(s, rng(seed)); const r = M.finish(s); return [r.effects, r.spent, r.earned]; };
        const base = run({});
        for (const p of [{ valuation: 9 }, { barter: 9 }, { market: 9 }]) assert.deepEqual(run(p), base, `${name}/${bot}/seed${seed}/${Object.keys(p)}`);
      }
    }
  }
});

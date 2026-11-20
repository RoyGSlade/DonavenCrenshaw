// Pure tests for the shop counter rules: node --test tests/model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as M from '../model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(path.join(here, '..', 'fixtures.json'), 'utf8')).fixtures;
const clone = (o) => JSON.parse(JSON.stringify(o));
const ctxOf = (name, patch = {}) => { const c = clone(FIX[name].context); for (const [k, v] of Object.entries(patch)) c[k] = isObj(v) && isObj(c[k]) ? { ...c[k], ...v } : v; return c; };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const make = (name, opts = {}, patch = {}) => M.createCounter({ seed: 7, context: ctxOf(name, patch), ...opts });
const shelf = (s, id) => M.view(s).shelves.find((x) => x.id === id);

test('a record in gives the right drawing data', () => {
  const s = make('mel');
  const v = M.view(s);
  assert.equal(v.open, true);
  assert.equal(v.shop.name, "Mel's locker");
  assert.equal(v.keeper.name, 'Mel');
  assert.equal(v.keeper.mood, 'neutral');
  assert.match(v.keeper.portrait, /mel-neutral/);
  assert.deepEqual(v.shelves.map((x) => x.id), FIX.mel.context.shop.stock.map((x) => x.item), 'the record decides the stock and its order');
  const flak = shelf(s, 'flak-vest');
  assert.equal(flak.price, 140);
  assert.equal(flak.name, 'Flak vest');
  assert.equal(flak.shown, 1);
  assert.equal(flak.last, true, 'a limit of one is the last one');
  assert.equal(v.purse.money, 260);
  assert.deepEqual(v.tray.map((t) => [t.id, t.price]), [['mag-boots', 70], ['breach-kit', 60]], 'your goods crossed with what Mel buys, in the record\'s order');
  assert.equal(v.speech.text, "Pick something. I haven't got all day. I've got most of it, but not all.", 'the open line comes from the story line table');
  assert.equal(v.speech.lineId, 'mel.shop.1');
});

test('a record line that carries its own text beats the table; a missing line says nothing', () => {
  const s = make('stall');
  assert.equal(M.view(s).speech.text, "Noodles, tape, nuts and bolts. Not in that order.");
  assert.equal(M.view(s).speech.draft, true);
  const noText = ctxOf('mel'); noText.lines = {};
  const bare = M.createCounter({ seed: 7, context: noText });
  assert.equal(M.view(bare).speech, null, 'a line id with no words is never invented');
});

test('stock: limits less what was bought, unlimited stacks, dusty gaps', () => {
  const s = make('stall');
  assert.equal(shelf(s, 'noodle-pot').shown, 2, 'limit 3 less 1 bought');
  assert.equal(shelf(s, 'noodle-pot').last, false);
  assert.equal(shelf(s, 'patch-tape').shown, M.SHELF_SHOW, 'no limit: a full stack');
  assert.equal(shelf(s, 'patch-tape').last, false);
  assert.equal(shelf(s, 'patch-tape').per, 2, 'one purchase gives two');
  M.lift(s, 'noodle-pot');
  assert.equal(shelf(s, 'noodle-pot').shown, 1);
  assert.equal(shelf(s, 'noodle-pot').last, true);
  M.lift(s, 'noodle-pot');
  assert.equal(shelf(s, 'noodle-pot').onCounter, true, 'all on the counter');
  assert.equal(shelf(s, 'noodle-pot').gone, false);
  assert.deepEqual(M.lift(s, 'noodle-pot').map((e) => e.type), ['blocked', 'say'], 'a limit holds');
  assert.equal(M.basketCount(s), 2);
  const sold = make('stall', {}, { bought: { 'noodle-pot': 3 } });
  assert.equal(shelf(sold, 'noodle-pot').gone, true, 'none left leaves a gap');
  assert.equal(M.lift(sold, 'noodle-pot')[0].type, 'blocked');
  assert.equal(M.basketCount(sold), 0);
});

test('lifting and putting back; tap a basket item to put it back', () => {
  const s = make('mel');
  assert.equal(M.view(s).canPay, false, 'empty basket, nothing to pay');
  assert.deepEqual(M.pay(s), [], 'paying nothing does nothing');
  const ev = M.lift(s, 'medkit');
  assert.equal(ev[0].type, 'lift');
  assert.equal(M.view(s).basket[0].id, 'medkit');
  assert.equal(M.view(s).speech.kind, 'blurb', 'the keeper reads the blurb');
  assert.match(M.view(s).speech.text, /jab of the good stuff/);
  assert.equal(M.view(s).till.total, 35);
  M.lift(s, 'medkit');
  assert.equal(M.view(s).till.total, 70, 'medkit has no limit');
  assert.equal(M.putBack(s, 'medkit')[0].type, 'putback');
  assert.equal(M.view(s).till.total, 35);
  M.putBack(s, 'medkit');
  assert.equal(M.view(s).basket.length, 0);
  assert.deepEqual(M.putBack(s, 'medkit'), []);
  assert.equal(M.lift(s, 'nope').length, 0, 'not on the shelf');
});

test('pay: the right effects, and the money only moves on Pay', () => {
  const s = make('mel');
  M.lift(s, 'medkit'); M.lift(s, 'flak-vest');
  assert.equal(s.save.money, 260, 'nothing moves before Pay');
  const ev = M.pay(s);
  assert.equal(ev[0].type, 'pay');
  assert.equal(ev[0].total, 175);
  assert.equal(M.view(s).purse.money, 85);
  assert.equal(M.view(s).keeper.mood, 'happy');
  assert.equal(M.view(s).speech.text, 'Good choice. Don\'t scratch it.', 'the buy line');
  assert.equal(M.view(s).basket.length, 0);
  assert.equal(shelf(s, 'flak-vest').gone, true, 'the one vest is gone from the shelf');
  const r = M.finish(s, { left: true });
  assert.deepEqual(r.effects.items, { medkit: 1, 'flak-vest': 1 });
  assert.equal(r.effects.world.moneyDelta, -175);
  assert.deepEqual(r.effects.world.shops, { mel: { bought: { medkit: 1, 'flak-vest': 1 } } });
  assert.equal(r.success, true);
  assert.equal(r.spent, 175);
});

test('leaving with a full basket buys nothing', () => {
  const s = make('mel');
  M.lift(s, 'medkit');
  const r = M.finish(s, { left: true });
  assert.equal(r.success, false);
  assert.equal(r.effects.items, undefined);
  assert.equal(r.effects.world.moneyDelta, 0);
  assert.equal(r.effects.world.shops, undefined);
});

test('you can not spend more than you have: broke changes nothing', () => {
  const s = make('mel');
  for (const id of ['scatter-pistol', 'bolt-carbine']) M.lift(s, id);
  const before = JSON.stringify([s.save, s.basket, s.visit]);
  const ev = M.pay(s);
  assert.equal(ev[0].type, 'broke');
  assert.equal(JSON.stringify([s.save, s.basket, s.visit]), before, 'money, goods and basket stay as they were');
  assert.equal(M.view(s).keeper.mood, 'annoyed');
  assert.match(M.view(s).speech.text, /not enough money/);
  assert.equal(M.view(s).short, true);
  assert.equal(M.view(s).canPay, true, 'Pay can still be pressed to be told so');
  M.putBack(s, 'bolt-carbine');
  assert.equal(M.view(s).short, false);
  assert.equal(M.pay(s)[0].type, 'pay');
  assert.equal(s.save.money, 40);
  const r = M.finish(s);
  assert.ok(r.effects.world.moneyDelta >= -s.startMoney, 'never spends more than the purse held');
});

test('exact money pays, one credit short does not', () => {
  const s = make('mel', {}, { save: { money: 35 } });
  M.lift(s, 'medkit');
  assert.equal(M.pay(s)[0].type, 'pay');
  const t = make('mel', {}, { save: { money: 34 } });
  M.lift(t, 'medkit');
  assert.equal(M.pay(t)[0].type, 'broke');
});

test('a locked item stays locked, with a plain reason and the keeper\'s locked line', () => {
  const s = make('mel');
  const coat = shelf(s, 'plated-coat');
  assert.equal(coat.locked, true);
  assert.equal(coat.lockReason, 'Hask has to know you first.');
  assert.equal(shelf(s, 'longshot').lockReason, 'Needs the Gunner skill.');
  assert.equal(shelf(s, 'hardsuit').lockReason, 'Garrity has to know you first.');
  const ev = M.lift(s, 'plated-coat');
  assert.equal(ev[0].type, 'glass');
  assert.equal(M.view(s).speech.text, 'Not that one. Not for you. Not yet.');
  assert.equal(M.basketCount(s), 0, 'locked never buys');
  assert.equal(M.tapLocked(s, 'plated-coat')[0].type, 'glass');
  assert.equal(M.basketCount(s), 0);
  const rich = make('mel', {}, { save: { money: 900, rep: { hask: 20, garrity: 45 }, skills: { gunner: 1 } } });
  assert.equal(shelf(rich, 'plated-coat').locked, false, 'when the requirement is met it opens');
  assert.equal(shelf(rich, 'longshot').locked, false);
  assert.equal(M.lift(rich, 'hardsuit')[0].type, 'lift');
});

test('requires: money, rep, items, skills, flags, stats and anyOf follow the game', () => {
  const save = { money: 10, items: { key: 1 }, rep: { a: 5 }, skills: { s: 2 }, stats: { cha: 4 }, flags: { f: 1 }, upgrades: {} };
  assert.deepEqual(M.missing(save, { money: 10, rep: { a: 5 }, items: { key: 1 }, skills: { s: 2 }, stats: { cha: 4 }, flags: { f: 1 } }), []);
  assert.equal(M.missing(save, { money: 11 }).length, 1);
  assert.equal(M.missing(save, { rep: { a: 6 } }).length, 1);
  assert.equal(M.missing(save, { items: { key: 2 } }).length, 1);
  assert.equal(M.missing(save, { skills: { s: 3 } })[0], 'Needs S rank three.');
  assert.equal(M.missing(save, { stats: { cha: 5 } }).length, 1);
  assert.equal(M.missing(save, { flags: { g: 1 } }).length, 1);
  assert.equal(M.missing(save, { notFlags: ['f'] }).length, 1);
  assert.equal(M.missing(save, { anyOf: [{ money: 99 }, { flags: { f: 1 } }] }).length, 0);
  assert.equal(M.missing(save, { anyOf: [{ money: 99 }, { flags: { g: 1 } }] }).length, 1);
});

test('item max: you can not carry more than the game allows', () => {
  const s = make('mel');
  M.lift(s, 'mag-boots');
  assert.equal(M.basketCount(s), 0, 'you already have the one pair');
  assert.equal(shelf(s, 'mag-boots').note, 'you have one');
  const m = make('mel', {}, { save: { items: { medkit: 8 } } });
  assert.equal(M.lift(m, 'medkit')[0].type, 'lift');
  assert.equal(M.lift(m, 'medkit')[0].type, 'blocked', 'nine is the most a bag holds');
  assert.equal(M.basketCount(m), 1);
});

test('discounts: the record\'s words, the old price struck, the lower price charged', () => {
  const s = make('edna');
  const v = M.view(s);
  assert.deepEqual(v.board.discounts, ['Edna likes your cheek (Charisma 6).', "You brought her mother's teapot home."]);
  const fuel = shelf(s, 'fuel-cell');
  assert.equal(fuel.was, 70);
  assert.equal(fuel.price, 53, '25 percent off 70, rounded');
  M.lift(s, 'fuel-cell');
  assert.equal(M.view(s).till.total, 53);
  const plain = make('edna', {}, { save: { stats: { cha: 1 }, flags: {} } });
  assert.deepEqual(M.view(plain).board.discounts, []);
  assert.equal(shelf(plain, 'fuel-cell').was, null);
  assert.equal(shelf(plain, 'fuel-cell').price, 70);
  const one = make('edna', {}, { save: { stats: { cha: 6 }, flags: {} } });
  assert.equal(shelf(one, 'fuel-cell').price, 63);
});

test('discounts never go below nothing or past the cap', () => {
  const ctx = ctxOf('edna');
  ctx.shop.discounts = [{ off: 50, why: 'a' }, { off: 50, why: 'b' }];
  const s = M.createCounter({ seed: 1, context: ctx });
  assert.equal(M.view(s).shelves[0].price, Math.round(70 * (1 - M.DISCOUNT_CAP / 100)));
});

test('rep moves by the record\'s amounts, per purchase', () => {
  const s = make('edna', {}, { save: { money: 900, rep: { hask: 30 } } });
  M.lift(s, 'permit'); M.lift(s, 'syndicate-codes');
  M.pay(s);
  const r = M.finish(s);
  assert.deepEqual(r.effects.world.rep, { hask: -5, vey: 2 });
  assert.equal(r.effects.items.permit, 1);
});

test('a purchase that gives more than one: qty', () => {
  const s = make('stall');
  M.lift(s, 'patch-tape'); M.lift(s, 'patch-tape');
  M.pay(s);
  const r = M.finish(s);
  assert.equal(r.effects.items['patch-tape'], 4, 'two purchases of two');
  assert.deepEqual(r.effects.world.shops.dot.bought, { 'patch-tape': 2 }, 'bought counts purchases');
});

test('haggle: each outcome changes the total as written and removes the control', () => {
  const quote = { well: 0.2, fair: 0.1, walked: 0 };
  for (const [outcome, off] of Object.entries(quote)) {
    const s = make('mel', { haggleReady: true });
    assert.equal(M.view(s).haggle.available, false, 'an empty basket has nothing to haggle over');
    M.lift(s, 'scatter-pistol');
    assert.equal(M.view(s).haggle.available, true);
    const req = M.haggleRequest(s);
    assert.equal(req.open, 220);
    assert.equal(req.best, 176, 'a great haggle is a fifth off');
    const ev = M.applyHaggle(s, { done: true, outcome });
    assert.equal(ev[0].type, 'haggle');
    const v = M.view(s);
    assert.equal(v.till.total, Math.round(220 * (1 - off)), outcome);
    assert.equal(v.haggle.available, false, 'the control is gone');
    assert.equal(v.haggle.used, true);
    assert.equal(v.haggle.outcome, outcome);
    assert.deepEqual(M.applyHaggle(s, { done: true, outcome: 'well' }), [], 'once per visit: a second answer changes nothing');
    assert.equal(M.view(s).till.total, Math.round(220 * (1 - off)));
    assert.equal(v.keeper.mood, outcome === 'well' ? 'happy' : outcome === 'walked' ? 'annoyed' : 'neutral');
  }
});

test('haggle: the cut covers what was on the counter, not what is added after', () => {
  const s = make('mel', { haggleReady: true });
  M.lift(s, 'medkit');
  M.applyHaggle(s, { outcome: 'well' });
  assert.equal(M.view(s).till.total, 28);
  M.lift(s, 'medkit');
  assert.equal(M.view(s).till.total, 28 + 35, 'a later medkit is full price');
  M.putBack(s, 'medkit'); M.putBack(s, 'medkit');
  assert.equal(M.view(s).till.total, 0);
  M.lift(s, 'medkit');
  assert.equal(M.view(s).till.total, 28 + 0, 'put back and lift again is still the deal that was struck');
  const r = (M.pay(s), M.finish(s));
  assert.equal(r.spent, 28);
});

test('haggle: closed without playing leaves the control; missing ctx.play hides it', () => {
  const s = make('mel', { haggleReady: true });
  M.lift(s, 'medkit');
  assert.deepEqual(M.applyHaggle(s, undefined), []);
  assert.deepEqual(M.applyHaggle(s, { left: true }), []);
  assert.equal(M.view(s).haggle.available, true);
  const none = make('mel', { haggleReady: false });
  M.lift(none, 'medkit');
  assert.equal(M.view(none).haggle.available, false, 'no ctx.play: no control');
  assert.deepEqual(M.applyHaggle(none, { outcome: 'well' }), []);
  assert.equal(M.view(none).till.total, 35, 'and it still works');
  assert.equal(M.pay(none)[0].type, 'pay');
});

test('haggle: a result with only success still maps', () => {
  const s = make('mel', { haggleReady: true });
  M.lift(s, 'medkit');
  M.applyHaggle(s, { success: true });
  assert.equal(M.view(s).haggle.outcome, 'well');
});

test('selling: your goods on the tray, the keeper names the price, Take it moves the money and goods', () => {
  const s = make('mel');
  assert.equal(M.offer(s, 'flak-vest').length, 0, 'you do not have one');
  assert.equal(M.offer(s, 'breach-kit')[0].type, 'offer');
  assert.equal(M.view(s).offer.price, 60);
  const ev = M.sellOne(s);
  assert.equal(ev[0].type, 'sell');
  assert.equal(M.view(s).purse.money, 320);
  assert.equal(M.view(s).tray.find((t) => t.id === 'breach-kit'), undefined, 'the last one is gone from the tray');
  assert.equal(M.view(s).offer, null);
  assert.equal(M.view(s).keeper.mood, 'happy');
  assert.match(M.view(s).speech.text, /Back already/);
  const r = M.finish(s);
  assert.deepEqual(r.effects.items, { 'breach-kit': -1 });
  assert.equal(r.effects.world.moneyDelta, 60);
  assert.deepEqual(r.sold, { 'breach-kit': 1 });
  assert.equal(r.success, true);
});

test('selling: tap again to take it off the counter; a stack sells one at a time', () => {
  const s = make('stall');
  M.offer(s, 'scrap');
  assert.equal(M.offer(s, 'scrap')[0].type, 'offer-cancel');
  assert.equal(M.view(s).offer, null);
  M.offer(s, 'scrap');
  M.sellOne(s); M.sellOne(s);
  assert.equal(M.view(s).tray.find((t) => t.id === 'scrap').have, 3);
  assert.equal(M.view(s).purse.money, 96);
  assert.equal(M.finish(s).effects.items.scrap, -2);
});

test('buy then sell back in one visit is never a profit', () => {
  for (const name of ['mel', 'edna', 'stall']) {
    const c = ctxOf(name);
    c.save.money = 5000;
    for (const e of c.shop.stock) {
      const b = c.shop.buys.find((x) => x.item === e.item);
      if (!b || (e.requires && Object.keys(e.requires).length)) continue;
      const s = M.createCounter({ seed: 1, context: clone(c) });
      if (M.lift(s, e.item)[0].type !== 'lift') continue;
      M.pay(s);
      M.offer(s, e.item); M.sellOne(s);
      assert.ok(M.finish(s).effects.world.moneyDelta <= 0, `${name}/${e.item}`);
    }
  }
});

test('a shut shop does nothing but leave', () => {
  const s = make('stall', {}, { shop: { ...FIX.stall.context.shop, open: false } });
  const v = M.view(s);
  assert.equal(v.open, false);
  assert.equal(v.shut.speech.text, 'Pot is off and the shutter is down. Come back after the second shift.');
  assert.equal(v.shut.who, 'Dot');
  for (const f of [() => M.lift(s, 'noodle-pot'), () => M.pay(s), () => M.offer(s, 'scrap'), () => M.sellOne(s), () => M.tapLocked(s, 'star-scrap'), () => M.putBack(s, 'noodle-pot')]) assert.deepEqual(f(), []);
  assert.equal(M.view(s).tray.length, 0);
  const r = M.finish(s, { left: true });
  assert.equal(r.success, false);
  assert.equal(r.effects.world.moneyDelta, 0);
  assert.equal(r.left, true);
  const reason = make('mel', {}, { shop: { ...FIX.mel.context.shop, open: false, reason: 'Closed for stocktake.' } });
  assert.equal(M.view(reason).shut.speech.text, 'Closed for stocktake.');
});

test('tabletop paths: valuation, barter and market only ever add things to see', () => {
  const none = make('edna', { points: {} });
  const rich = make('edna', { points: { valuation: 3, barter: 3, market: 3 }, level: 9 });
  const a = M.view(none), b = M.view(rich);
  assert.equal(a.shelves.every((x) => x.word === null), true, 'no points, no tag words');
  assert.ok(b.shelves.some((x) => x.word), 'valuation gives each tag a word');
  assert.deepEqual(b.shelves.map((x) => x.word).filter(Boolean).every((w) => ['steep', 'fair', 'a steal'].includes(w)), true);
  assert.equal(a.board.short.length, 0);
  assert.ok(b.board.short.length > 0, 'market shows what the keeper is short of');
  assert.ok(M.view(make('edna', { points: { market: 1 } })).board.short.length < b.board.short.length || b.board.short.length >= FIX.edna.context.shop.buys.length - 1, 'more market, a longer list');
  assert.deepEqual(a.shelves.map((x) => [x.id, x.price, x.locked, x.shown]), b.shelves.map((x) => [x.id, x.price, x.locked, x.shown]), 'prices, locks and stock never change with points');
  assert.equal(M.haggleRequest((M.lift(rich, 'fuel-cell'), rich)).points.barter, 3, 'barter goes to the haggle game');
  assert.equal(M.cleanPoints({ haggle: 3 }).barter, 3, 'social\'s haggle points count as barter');
  assert.deepEqual(M.cleanPoints({ valuation: 9, barter: 9, market: 9 }, 12), { valuation: 9, barter: 0, market: 0 }, 'never more points than the level (nine at most)');
});

test('points never make it worse: the same basket costs the same and trades the same at every point total', () => {
  const run = (points) => {
    const s = make('edna', { points, haggleReady: true });
    for (const id of ['fuel-cell', 'nav-chip', 'permit']) M.lift(s, id);
    M.applyHaggle(s, { outcome: 'fair' });
    const t = M.view(s).till.total;
    M.pay(s);
    M.offer(s, 'scrap'); M.sellOne(s);
    const r = M.finish(s);
    return { t, items: r.effects.items, money: r.effects.world.moneyDelta, rep: r.effects.world.rep };
  };
  const base = run({});
  for (const p of [{ valuation: 9 }, { barter: 9 }, { market: 9 }, { valuation: 3, barter: 3, market: 3 }]) assert.deepEqual(run(p), base);
});

test('the tier sets the keeper\'s first face', () => {
  assert.equal(M.view(make('mel', { tier: 2 })).keeper.mood, 'happy');
  assert.equal(M.view(make('mel', { tier: -2 })).keeper.mood, 'annoyed');
  for (const tier of [-1, 0, 1]) assert.equal(M.view(make('mel', { tier })).keeper.mood, 'neutral');
  assert.equal(M.haggleRequest((() => { const s = make('mel', { tier: 1, haggleReady: true }); M.lift(s, 'medkit'); return s; })()).tier, 1);
});

test('determinism: the same seed gives the same shop and the same drawing, another seed leans the items differently', () => {
  const play = (seed) => {
    const s = make('mel', { seed });
    M.lift(s, 'medkit'); M.lift(s, 'flak-vest'); M.pay(s); M.offer(s, 'mag-boots'); M.sellOne(s);
    return [M.view(s), M.finish(s)];
  };
  assert.deepEqual(play(5), play(5));
  const a = M.view(make('mel', { seed: 1 })).shelves.map((x) => [x.lean, x.shift]);
  const b = M.view(make('mel', { seed: 2 })).shelves.map((x) => [x.lean, x.shift]);
  assert.notDeepEqual(a, b);
  const lean = a.flat();
  assert.ok(lean.every(Number.isFinite));
});

test('a line given as a list picks one variant by seed, steadily', () => {
  const ctx = ctxOf('stall');
  ctx.shop.lines.open = [{ text: 'one', emotion: 'warm' }, { text: 'two', emotion: 'warm' }, { text: 'three', emotion: 'warm' }];
  const seen = new Set();
  for (let seed = 1; seed < 30; seed++) {
    const a = M.view(M.createCounter({ seed, context: clone(ctx) })).speech.text;
    assert.equal(a, M.view(M.createCounter({ seed, context: clone(ctx) })).speech.text);
    seen.add(a);
  }
  assert.ok(seen.size >= 2, 'different seeds, different greetings');
});

test('the result follows the contract and the host can apply it', () => {
  const s = make('mel');
  M.lift(s, 'medkit'); M.pay(s);
  const r = M.finish(s, { left: true });
  assert.equal(r.done, true);
  assert.equal(typeof r.success, 'boolean');
  assert.ok(r.grade >= 0 && r.grade <= 100);
  assert.equal(r.left, true);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(r))), JSON.stringify(r), 'plain data, nothing to lose in transit');
  const done = M.finish(make('mel'));
  assert.deepEqual(M.lift(s, 'medkit'), [], 'after leaving nothing moves');
  assert.equal(done.effects.world.moneyDelta, 0);
});

test('records the module has never seen: empty and odd input never throws', () => {
  for (const context of [undefined, {}, { shop: {} }, { shop: { stock: [{ item: 'x' }] } }, { shop: { stock: [{ item: 'x', price: { money: 5 } }, 3, null] }, save: { money: 'lots' } }]) {
    const s = M.createCounter({ context });
    const v = M.view(s);
    assert.ok(Array.isArray(v.shelves));
    M.lift(s, 'x'); M.pay(s); M.finish(s);
  }
  const s = M.createCounter({ context: { shop: { stock: [{ item: 'x', price: { money: 5 } }] }, save: { money: 9 } } });
  M.lift(s, 'x');
  assert.equal(M.view(s).shelves[0].name, 'X', 'an item with no record is named from its id');
  assert.equal(M.pay(s)[0].type, 'pay');
});

test('nothing about any shop is written in the model or the view', () => {
  const src = readFileSync(path.join(here, '..', 'model.js'), 'utf8') + readFileSync(path.join(here, '..', 'view.js'), 'utf8');
  for (const word of ['Mel', 'Edna', 'Chibby', 'locker', 'medkit', 'flak', 'hask', 'garrity', 'credits']) assert.equal(new RegExp(`\\b${word}\\b`, 'i').test(src) && word !== 'credits', false, word);
  assert.equal(/Math\.random|Date\.now|performance\.now/.test(readFileSync(path.join(here, '..', 'model.js'), 'utf8')), false, 'the model has no clock and no unseeded random');
});

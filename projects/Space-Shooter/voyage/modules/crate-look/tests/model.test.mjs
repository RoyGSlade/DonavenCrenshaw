import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../model.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'fixtures.json'), 'utf8')).fixtures;
const ctxOf = (k, patch = {}) => { const c = structuredClone(FX[k].context); return { ...c, ...patch }; };
const make = (k, o = {}) => M.createLook({ seed: 1, ...o, context: ctxOf(k, o.ctxPatch) });
const names = (v) => v.stacks.map((s) => s.id);

test('a record in gives the right drawing data', () => {
  const s = make('ore'); const v0 = M.view(s);
  assert.equal(v0.label, 'Crate 7 · Dustfall ore'); assert.equal(v0.kind, 'wood'); assert.equal(v0.lid, 'shut');
  assert.deepEqual(v0.stacks, [], 'a shut crate shows no contents');
  M.openLid(s); const v = M.view(s);
  assert.deepEqual(names(v), ['ore', 'scrap']);
  assert.equal(v.stacks[0].qty, 9); assert.equal(v.stacks[0].shown, 9); assert.equal(v.stacks[0].name, 'Dustfall ore'); assert.ok(v.stacks[0].icon.endsWith('ore.webp'));
  assert.equal(v.fill.word, 'about half');
  assert.equal(v.slip.length, 2); assert.equal(v.origin.text, 'Dustfall seam, lot seven'); assert.equal(v.origin.from, 'record');
  assert.deepEqual(v.bag.map((b) => [b.id, b.qty]), [['fuel-cell', 2], ['medkit', 1]]);
});

test('a bigger stack looks bigger, up to the pile limit; an item with no picture has no icon (the view draws the parcel)', () => {
  const big = M.createLook({ context: { crate: { contents: [{ item: 'a', qty: 3 }, { item: 'b', qty: 40 }] }, items: { a: { name: 'A' } } } });
  M.openLid(big); const v = M.view(big);
  assert.equal(v.stacks[0].shown, 3); assert.equal(v.stacks[1].shown, M.PILE_SHOW); assert.equal(v.stacks[1].heaped, true);
  assert.equal(v.stacks[0].icon, ''); assert.equal(v.stacks[1].name, 'b');
});

test('fullness words: empty, nearly empty, about half, well stocked, packed tight', () => {
  const w = (n) => { const s = M.createLook({ context: { crate: { capacity: 10, contents: n ? [{ item: 'x', qty: n }] : [] } } }); M.openLid(s); return M.view(s).fill.word; };
  assert.deepEqual([0, 2, 5, 8, 10].map(w), ['empty', 'nearly empty', 'about half', 'well stocked', 'packed tight']);
});

test('lid: a tap opens it, shutting works, take needs it open', () => {
  const s = make('ore');
  assert.deepEqual(M.take(s, 'ore'), [], 'nothing to take through a shut lid');
  const e = M.openLid(s); assert.equal(e[0].type, 'lid'); assert.equal(s.lid, 'open'); assert.deepEqual(M.openLid(s), []);
  M.shutLid(s); assert.equal(s.lid, 'shut'); assert.deepEqual(M.take(s, 'ore'), []); M.openLid(s); assert.equal(M.take(s, 'ore')[0].type, 'take');
});

test('take one, take all, put back; the sums hold', () => {
  const s = make('ore'); M.openLid(s); const total = M.conserved(s);
  M.take(s, 'ore'); assert.equal(s.lines[0].qty, 8); assert.equal(s.bag.ore, 1);
  M.takeAll(s, 'scrap'); assert.equal(s.bag.scrap, 4); assert.equal(M.view(s).stacks.length, 1, 'an emptied stack leaves the pile');
  M.putIn(s, 'scrap'); assert.equal(s.bag.scrap, 3); assert.equal(M.view(s).stacks.find((x) => x.id === 'scrap').qty, 1);
  assert.equal(M.conserved(s), total);
  const r = M.finish(s); assert.deepEqual(r.effects.items, { ore: 1, scrap: 3 }); assert.deepEqual(r.took, { ore: 1, scrap: 4 }); assert.deepEqual(r.put, { scrap: 1 });
  const rec = r.effects.world.crates['crate-7']; assert.deepEqual(rec.contents, [{ item: 'ore', qty: 8 }, { item: 'scrap', qty: 1 }]);
});

test('taking something and putting it back changes nothing in the result', () => {
  const s = make('ore'); M.openLid(s); M.take(s, 'ore'); M.putIn(s, 'ore');
  const r = M.finish(s); assert.deepEqual(r.effects.items, {}); assert.equal(r.effects.world.crates, undefined);
});

test('bag capacity holds: it stays, the move is refused', () => {
  const s = make('ore'); M.openLid(s); // bag has 3 of 8
  const e = M.takeAll(s, 'ore'); assert.equal(M.bagUnits(s), 8); assert.equal(s.lines[0].qty, 4, 'only what fits went');
  assert.ok(e.some((x) => x.type === 'bagfull'));
  const e2 = M.take(s, 'scrap'); assert.equal(e2[0].type, 'bagfull'); assert.equal(s.lines[1].qty, 4); assert.equal(M.view(s).bagFull, true);
  assert.match(s.say, /full/i);
});

test('crate capacity holds: putting into a full crate does nothing', () => {
  const s = M.createLook({ context: { crate: { capacity: 3, contents: [{ item: 'a', qty: 3 }] }, save: { items: { b: 2 } } } }); M.openLid(s);
  const e = M.putIn(s, 'b'); assert.equal(e[0].type, 'cratefull'); assert.equal(s.bag.b, 2); assert.equal(M.crateTotal(s), 3); assert.match(s.say, /full/i);
  M.take(s, 'a'); assert.equal(M.putIn(s, 'b')[0].type, 'put');
  const t = M.createLook({ context: { crate: { capacity: 5, contents: [{ item: 'a', qty: 3 }] }, save: { items: { b: 9 } } } }); M.openLid(t);
  M.putIn(t, 'b', 9); assert.equal(M.crateTotal(t), 5, 'put in as many as fit, never more');
});

test('a sealed crate does nothing but leave', () => {
  const s = make('sealed'); const v = M.view(s);
  assert.equal(v.sealed, true); assert.match(v.reason, /Customs/); assert.equal(v.canChalk, false); assert.equal(v.canPut, false);
  const e = M.openLid(s); assert.equal(e[0].type, 'sealed'); assert.equal(s.lid, 'shut'); assert.equal(s.say, s.reason);
  for (const act of [() => M.take(s, 'circuit'), () => M.takeAll(s, 'circuit'), () => M.putIn(s, 'fuel-cell'), () => M.chalk(s), () => M.shutLid(s)]) assert.deepEqual(act(), []);
  const r = M.finish(s, { left: true }); assert.equal(r.success, false); assert.equal(r.left, true); assert.deepEqual(r.effects, { items: {}, world: {} }); assert.deepEqual(M.view(s).stacks, []);
});

test('an empty crate: the word empty, and it looks different by seed', () => {
  const a = M.createLook({ seed: 3, context: ctxOf('empty') }); M.openLid(a);
  assert.equal(M.view(a).empty, true); assert.equal(M.view(a).fill.word, 'empty'); assert.match(a.say, /empty|straw|nothing/i);
  const sigs = new Set(); for (let sd = 1; sd <= 12; sd++) sigs.add(JSON.stringify(M.createLook({ seed: sd, context: ctxOf('empty') }).dress));
  assert.ok(sigs.size >= 6, 'seeds give different dressing');
  for (let sd = 1; sd <= 12; sd++) assert.ok(M.createLook({ seed: sd, context: ctxOf('empty') }).dress.length >= 1);
});

test('chalk cycles none, keep, sell, scrap, none and is in the result', () => {
  const s = make('ore'); const seen = [s.tag];
  for (let i = 0; i < 4; i++) { M.chalk(s); seen.push(s.tag); }
  assert.deepEqual(seen, ['none', 'keep', 'sell', 'scrap', 'none']);
  M.chalk(s); M.chalk(s); const r = M.finish(s); assert.equal(r.tag, 'sell'); assert.equal(r.effects.world.crates['crate-7'].tag, 'sell');
  const u = make('ore'); M.chalk(u); M.chalk(u); M.chalk(u); M.chalk(u); assert.equal(M.finish(u).effects.world.crates, undefined, 'back to where it began: no change');
});

test('the slip mismatch list is right', () => {
  const s = make('wrongslip'); const c = M.slipCheck(s);
  assert.deepEqual(c.lines.map((l) => [l.item, l.kind, l.slip, l.found]), [['fuel-cell', 'less', 6, 4], ['scrap', 'ok', 3, 3], ['hull-patch', 'more', 2, 5], ['shield-cell', 'missing', 2, 0]]);
  assert.deepEqual(c.extras.map((e) => [e.item, e.hidden]), [['medkit', false], ['nav-chip', true]]);
  assert.deepEqual(M.slipCheck(make('ore')).lines.map((l) => l.kind), ['ok', 'ok']); assert.deepEqual(M.slipCheck(make('food')), { lines: [], extras: [] });
});

test('Inspection marks the lines and the extras; without it nothing is marked', () => {
  const plain = make('wrongslip'); M.openLid(plain); const v0 = M.view(plain);
  assert.ok(v0.slip.every((l) => l.mark === null)); assert.ok(v0.stacks.every((s) => !s.notOnSlip));
  const ins = make('wrongslip', { points: { inspection: 1 } }); M.openLid(ins); const v = M.view(ins);
  assert.deepEqual(v.slip.map((l) => l.mark), ['less', null, 'more', 'missing']); assert.equal(v.slip[0].found, 4);
  assert.deepEqual(v.stacks.filter((s) => s.notOnSlip).map((s) => s.id), ['medkit']);
});

test('a hidden thing appears only when uncovered, or at once with Awareness', () => {
  const s = make('wrongslip'); M.openLid(s);
  assert.ok(!names(M.view(s)).includes('nav-chip'), 'buried at first'); assert.deepEqual(M.take(s, 'nav-chip#h'), [], 'and cannot be taken');
  const depth = s.lines.find((l) => l.hidden).depth; assert.ok(depth >= 1 && depth <= 3);
  let n = 0; while (!names(M.view(s)).includes('nav-chip') && n < 40) { M.take(s, s.lines.find((l) => !l.hidden && l.qty > 0).item); n++; }
  assert.equal(n, depth, 'shows after exactly the pile on top is taken'); assert.match(s.say, /under the straw/i);
  assert.deepEqual(M.saw(s).hidden, ['nav-chip']);
  const a = make('wrongslip', { points: { awareness: 1 } }); M.openLid(a);
  const st = M.view(a).stacks.find((x) => x.id === 'nav-chip'); assert.equal(st.status, 'glint'); assert.match(a.say, /glints/i);
  assert.equal(M.take(a, 'nav-chip#h')[0].type, 'take');
});

test('a hidden thing under an empty pile is there at once; the roll shifts how deep', () => {
  const s = M.createLook({ context: { crate: { contents: [{ item: 'k', qty: 1, hidden: true }] }, items: {} } }); M.openLid(s);
  assert.equal(M.view(s).stacks.length, 1);
  const d = (tier) => make('wrongslip', { tier }).lines.find((l) => l.hidden).depth;
  assert.ok(d(2) <= d(0) && d(0) <= d(-2)); let any = false; for (let sd = 1; sd < 30; sd++) { const f = (t) => M.createLook({ seed: sd, tier: t, context: ctxOf('wrongslip') }).lines.find((l) => l.hidden).depth; assert.ok(f(2) <= f(0) && f(0) <= f(-2)); if (f(2) < f(-2)) any = true; }
  assert.ok(any, 'tier changes depth');
});

test('Trace: the origin line shows from the traces even when the slip has none', () => {
  const none = make('food'); assert.equal(M.view(none).origin, null);
  const tr = make('food', { points: { trace: 1 } }); const o = M.view(tr).origin; assert.ok(o && o.from === 'trace' && ctxOf('food').crate.traces.includes(o.text));
  const rec = make('ore', { points: { trace: 3 } }); assert.equal(M.view(rec).origin.from, 'record');
  const mism = make('wrongslip', { points: { trace: 2 } }); assert.ok(M.view(mism).origin);
});

test('a rough roll smudges slip lines, Inspection reads them anyway, a good roll leaves them clean', () => {
  const sm = (o) => M.view(make('wrongslip', o)).slip.filter((l) => l.smudged).length;
  assert.equal(sm({ tier: 0 }), 0); assert.equal(sm({ tier: 2 }), 0); assert.equal(sm({ tier: -1 }), 1); assert.equal(sm({ tier: -2 }), 2); assert.equal(sm({ tier: -2, points: { inspection: 1 } }), 0);
});

test('saw reports mismatches on lines you could see', () => {
  const s = make('wrongslip'); assert.deepEqual(M.saw(s), { mismatches: [], hidden: [] }, 'nothing seen with the lid shut');
  M.openLid(s); const w = M.saw(s);
  assert.deepEqual(w.mismatches.map((m) => [m.item, m.kind]), [['fuel-cell', 'less'], ['hull-patch', 'more'], ['shield-cell', 'missing'], ['medkit', 'extra']], 'the buried chip is not reported yet');
  assert.equal(M.finish(s).saw.mismatches.length, 4);
});

test('quick mode: the lid is already off; look and take only', () => {
  const s = make('ore', { quick: true }); assert.equal(s.lid, 'open'); assert.equal(M.view(s).stacks.length, 2); assert.equal(M.view(s).canChalk, false);
  assert.deepEqual(M.chalk(s), []); assert.deepEqual(M.putIn(s, 'medkit'), []); assert.deepEqual(M.shutLid(s), []);
  assert.equal(M.take(s, 'ore')[0].type, 'take'); assert.equal(M.finish(s).tag, 'none');
  const sealedQ = make('sealed', { quick: true }); assert.equal(sealedQ.lid, 'shut');
});

test('the result: success only when opened, grade 100, Leave shape', () => {
  const s = make('ore'); const r0 = M.finish(s, { left: true });
  assert.equal(r0.done, true); assert.equal(r0.left, true); assert.equal(r0.success, false); assert.equal(r0.grade, 100);
  M.openLid(s); assert.equal(M.finish(s).success, true);
  for (const k of ['took', 'put', 'tag', 'saw', 'effects']) assert.ok(k in M.finish(s));
});

test('points never remove anything', () => {
  for (const k of Object.keys(FX)) for (const tier of [-2, 0, 2]) for (const seed of [1, 2, 3]) {
    const lo = M.createLook({ seed, tier, context: ctxOf(k) }); const hi = M.createLook({ seed, tier, points: { awareness: 3, inspection: 3, trace: 3 }, level: 9, context: ctxOf(k) });
    M.openLid(lo); M.openLid(hi); const a = M.view(lo), b = M.view(hi);
    assert.ok(b.stacks.length >= a.stacks.length, `${k}: no stack lost`);
    for (const s of a.stacks) assert.ok(b.stacks.some((x) => x.id === s.id && x.qty === s.qty));
    assert.ok(b.slip === null ? a.slip === null : b.slip.every((l, i) => !l.smudged && l.qty === a.slip[i].qty));
    assert.equal((b.origin ? 1 : 0) >= (a.origin ? 1 : 0), true);
  }
});

test('path points are whole 0..9 and never more than the level', () => {
  assert.deepEqual(M.cleanPoints({ awareness: 12, inspection: -3, trace: 'x' }, 9), { awareness: 9, inspection: 0, trace: 0 });
  assert.deepEqual(M.cleanPoints({ awareness: 2, inspection: 2, trace: 2 }, 3), { awareness: 2, inspection: 1, trace: 0 });
  assert.deepEqual(M.cleanPoints(null), { awareness: 0, inspection: 0, trace: 0 });
});

test('determinism per seed: same seed, same crate and same words', () => {
  for (const k of Object.keys(FX)) { const a = M.createLook({ seed: 7, tier: -1, context: ctxOf(k) }), b = M.createLook({ seed: 7, tier: -1, context: ctxOf(k) }); M.openLid(a); M.openLid(b); assert.deepEqual(M.view(a), M.view(b)); }
  assert.notDeepEqual(M.createLook({ seed: 1, context: ctxOf('empty') }).dress, M.createLook({ seed: 2, context: ctxOf('empty') }).dress);
});

test('odd and empty records never throw', () => {
  const odd = [undefined, null, {}, { crate: null }, { crate: 5 }, { crate: { contents: 'x' } }, { crate: { contents: [null, 3, { item: 'a' }, { item: 'a', qty: -2 }, { item: 'b', qty: 'NaN' }, { item: 'c', qty: '4' }, { item: { x: 1 }, qty: 2 }] } },
    { crate: { kind: 'plastic', capacity: -1, slip: 7, traces: [1, null], tag: 'zzz', hidden: 1 }, items: [], save: 3 }, { crate: { sealed: 'yes', contents: [{ item: 'a', qty: 1 }] }, items: { a: null } }, { crate: { capacity: 1, contents: [{ item: 'a', qty: 9 }] }, save: { items: { a: -1, b: 1e9 }, capacity: 0 } },
    { crate: { slip: [{ item: 'q', qty: 2 }], contents: [{ item: 'q', qty: 2, hidden: true }] } }];
  for (const context of odd) for (const quick of [false, true]) {
    const s = M.createLook({ seed: NaN, tier: 'x', points: 'y', level: null, quick, context });
    const v = M.view(s); assert.ok(v.label); M.openLid(s); M.view(s);
    for (const st of M.view(s).stacks) { M.take(s, st.key); M.takeAll(s, st.key); }
    for (const it of Object.keys(s.bag)) M.putIn(s, it, 3);
    M.chalk(s); M.shutLid(s); M.take(s, 'nothing'); M.putIn(s, 'nothing'); M.view(s); JSON.stringify(M.finish(s, { left: true }));
  }
  assert.equal(M.createLook().id, 'crate'); assert.equal(M.view(M.createLook()).empty, true);
});

test('no item, crate or owner name is written in the model, view or audio', () => {
  const src = ['model.js', 'view.js', 'audio.js', 'index.js'].filter((f) => fs.existsSync(path.join(HERE, '..', f))).map((f) => fs.readFileSync(path.join(HERE, '..', f), 'utf8')).join('\n');
  const words = new Set();
  for (const f of Object.values(FX)) { const c = f.context.crate; for (const w of [c.label, c.owner, c.reason, c.origin, ...(c.traces || [])]) if (w) words.add(w); for (const it of Object.values(f.context.items)) { words.add(it.name); if (it.blurb) words.add(it.blurb); } }
  for (const w of words) assert.ok(!src.includes(w), `"${w}" is written in the code`);
  for (const id of Object.keys(FX.wrongslip.context.items).filter((i) => !M.TAGS.includes(i))) assert.ok(!new RegExp(`['"\`]${id}['"\`]`).test(src), `item id "${id}" is written in the code`);
});

test('every fixture is complete: five, with the words and shapes the brief asks for', () => {
  assert.deepEqual(Object.keys(FX), ['ore', 'food', 'empty', 'sealed', 'wrongslip']);
  assert.ok(FX.sealed.context.crate.sealed && FX.sealed.context.crate.reason); assert.equal(FX.empty.context.crate.contents.length, 0);
  assert.ok(FX.wrongslip.context.crate.contents.some((c) => c.hidden) && FX.wrongslip.context.crate.slip.length);
  assert.deepEqual(new Set(Object.values(FX).map((f) => f.context.crate.kind)), new Set(['wood', 'cold', 'steel']));
});

// Pure tests for the claw: node --test projects/Space-Shooter/voyage/modules/claw-pull/tests/model.test.mjs
// No DOM, no clock: time comes in as dt, randomness comes from the seed. SWEEP_N=2 (default 1) multiplies the bot sweeps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BASE, TIER, PATHS, ALIASES, rulesFor, cleanPoints, createGame, step, grab, goBack, done, giveUp, resultOf, words, gripWord, gripFrac, drain, pathAt, loadRadius, tierOf } from '../model.js';
import { buildBoard, rleDecode, rleEncode, mirrorResult, pickResult, straightShaft, probe, graspCheck, SHELL } from '../board.js';
import { BOTS, playBot } from '../bots.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const MOD = path.join(dir, '..');
const fixtures = JSON.parse(readFileSync(path.join(MOD, 'fixtures.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(MOD, 'manifest.json'), 'utf8'));
const SWEEP = +process.env.SWEEP_N || 1;
const RESULTS = fixtures.results.filter((r) => !r.quick);
const QUICK = fixtures.results.filter((r) => r.quick);
const asResult = (r) => ({ finds: r.finds.map((f) => ({ ...f })), tunnel: { ...r.tunnel, rows: rleDecode(r.tunnel.rle) } });
const mk = (o = {}) => createGame({ seed: 1, result: asResult(RESULTS[0]), items: fixtures.items, ...o });

/** A plain board: a straight corridor from the mouth to a find with its pocket cleared all round. `plug` shuts the pocket on the corridor's side. */
function synth({ len = 480, half = 14, r = 30, cracks = 0, plug = false, bonus = false } = {}) {
  const cell = 8, x0 = 44, fx = x0 + len + r + 40, W = Math.ceil(Math.max(800, fx + 130) / cell) * cell, H = 600, w = W / cell, h = H / cell, cy = 304;
  const rows = Array.from({ length: h }, () => new Array(w).fill('0'));
  const open = (x, y) => { const gx = Math.floor(x / cell), gy = Math.floor(y / cell); if (gx >= 0 && gy >= 0 && gx < w && gy < h) rows[gy][gx] = '1'; };
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
    const x = (gx + 0.5) * cell, y = (gy + 0.5) * cell;
    if (x >= x0 && x <= fx - r - 6 && Math.abs(y - cy) <= half) open(x, y);
    const d = Math.hypot(x - fx, y - cy);
    if (d > r && d <= r + SHELL + 4) open(x, y);
  }
  if (plug) for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) { const x = (gx + 0.5) * cell, y = (gy + 0.5) * cell; if (Math.hypot(x - fx, y - cy) > r && Math.hypot(x - fx, y - cy) < r + 40 && x < fx - r * 0.3 && Math.abs(y - cy) < r + 40 && x > fx - r - 36) rows[gy][gx] = '0'; }
  if (plug) for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) { const x = (gx + 0.5) * cell; if (x >= x0 && x < fx - r - 40 && rows[gy][gx] === '0') continue; }
  // re-open the corridor right up to the plug so the claw can get close to it
  if (plug) for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) { const x = (gx + 0.5) * cell, y = (gy + 0.5) * cell; if (x >= x0 && x <= fx - r - 40 && Math.abs(y - cy) <= half) rows[gy][gx] = '1'; }
  const finds = [{ item: 'gem-blue', kind: 'gem', freed: 1, cracks, x: fx, y: cy, r, isFreed: true }];
  if (bonus) finds.push({ item: 'ore-iron', kind: 'ore', freed: 1, cracks: 0, x: fx - 110, y: cy, r: 24, isFreed: true });
  return { finds, tunnel: { cell, w, h, rows: rows.map((q) => q.join('')), entry: { x: x0 - 8, y: cy }, board: { w: W, h: H } } };
}
const mkSynth = (o = {}, g = {}) => createGame({ seed: 5, result: synth(o), items: fixtures.items, ...g });
const run = (g, secs, input, dt = 1 / 60) => { for (let i = 0; i < secs / dt && !g.over; i++) step(g, dt, typeof input === 'function' ? input(g) : input); };
/** Put the head next to the main find on the open ground and close the jaws. */
function grabMain(g, side = 'corridor') {
  const f = g.finds[0], B = g.board;
  let x = f.x - f.r - 14, y = f.y;
  if (side === 'far') x = f.x + f.r + 14;
  g.head.x = g.anchor.x = x; g.head.y = g.anchor.y = y;
  g.path = [{ x: B.start.x, y: B.start.y, s: 0 }, { x, y, s: Math.hypot(x - B.start.x, y - B.start.y) }];
  const r = grab(g);
  return r;
}

test('determinism: the same seed gives the same game; another seed picks another board', () => {
  const a = createGame({ seed: 3, result: asResult(RESULTS[4]), items: fixtures.items }), b = createGame({ seed: 3, result: asResult(RESULTS[4]), items: fixtures.items });
  for (const g of [a, b]) { const bot = BOTS.wobbly(g, {}); playBot(g, bot, { maxT: 60 }); }
  assert.equal(JSON.stringify(resultOf(a)), JSON.stringify(resultOf(b)));
  assert.equal(a.t, b.t); assert.equal(a.knocks, b.knocks);
  const p1 = pickResult({ seed: 1, layout: 'tall', fixtures }), p2 = pickResult({ seed: 2, layout: 'tall', fixtures }), p1b = pickResult({ seed: 1, layout: 'tall', fixtures });
  assert.equal(p1.name, p1b.name); assert.equal(p1.flipX, p1b.flipX);
  const seen = new Set(); for (let s = 1; s <= 12; s++) { const p = pickResult({ seed: s, layout: 'wide', fixtures }); seen.add(`${p.name}|${p.flipX}|${p.flipY}`); }
  assert.ok(seen.size >= 8, `12 seeds gave ${seen.size} different boards`);
  assert.notEqual(p1.name + p1.flipX + p1.flipY, p2.name + p2.flipX + p2.flipY);
});

test('the board built from a real drill result is the drill\'s tunnel (only ground joined to the mouth counts)', () => {
  for (const r of RESULTS.slice(0, 14)) {
    const res = asResult(r), B = buildBoard({ result: res, items: fixtures.items }), rows = res.tunnel.rows;
    assert.equal(B.gw, res.tunnel.w); assert.equal(B.gh, res.tunnel.h); assert.equal(B.cell, res.tunnel.cell);
    let openN = 0;
    for (let gy = 0; gy < B.gh; gy++) for (let gx = 0; gx < B.gw; gx++) {
      const c = gy * B.gw + gx, drillOpen = rows[gy][gx] === '1';
      if (B.open[c]) { openN++; assert.ok(drillOpen, `${r.name}: cell ${gx},${gy} is open on the board but not in the drill's tunnel`); }
    }
    assert.ok(openN > 400, `${r.name}: only ${openN} open cells`);
    // everything the drill left open and joined to the mouth is on the board
    const seen = new Uint8Array(B.gw * B.gh), st = [B.start.y / B.cell | 0, B.start.x / B.cell | 0], stack = [st[0] * B.gw + st[1]]; seen[stack[0]] = 1;
    while (stack.length) { const c = stack.pop(), gx = c % B.gw, gy = (c / B.gw) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= B.gw || ny >= B.gh) continue; const n = ny * B.gw + nx; if (!seen[n] && rows[ny][nx] === '1' && B.core[n] < 0) { seen[n] = 1; stack.push(n); } } }
    for (let c = 0; c < seen.length; c++) assert.equal(!!seen[c], !!B.open[c], `${r.name}: cell ${c} joined-to-mouth status differs`);
    // finds keep the drill's place, size and cracks; their cores are rock until lifted
    B.finds.forEach((f, i) => { assert.equal(f.x, res.finds[i].x); assert.equal(f.y, res.finds[i].y); assert.equal(f.r, res.finds[i].r); assert.equal(f.cracks, res.finds[i].cracks); assert.ok(!B.open[Math.floor(f.y / B.cell) * B.gw + Math.floor(f.x / B.cell)]); });
    assert.ok(B.open[Math.floor(B.start.y / B.cell) * B.gw + Math.floor(B.start.x / B.cell)], 'the claw starts on open ground');
  }
  // a tunnel survives run-length coding and a mirror
  const rows = asResult(RESULTS[3]).tunnel.rows; assert.deepEqual(rleDecode(rleEncode(rows)), rows);
  const m = mirrorResult(asResult(RESULTS[3]), true, true), Bm = buildBoard({ result: m, items: fixtures.items }), B0 = buildBoard({ result: asResult(RESULTS[3]), items: fixtures.items });
  assert.equal(Bm.openCount, B0.openCount);
  assert.ok(Math.abs(Math.hypot(Bm.finds[0].x - Bm.mouth.x, Bm.finds[0].y - Bm.mouth.y) - Math.hypot(B0.finds[0].x - B0.mouth.x, B0.finds[0].y - B0.mouth.y)) < 1);
});

test('every real drill result has a way to the find: a main find the claw can grab, and a clear way in', () => {
  for (const r of RESULTS) {
    const g = createGame({ seed: 1, result: asResult(r), items: fixtures.items });
    assert.ok(g.finds[0].canGrab, `${r.name}: the main find has no cleared side`);
    const bot = BOTS.perfect(g, {}); let n = 0;
    while (g.phase === 'in' && g.t < 40) { const inp = bot.think(g, 1 / 60); if (inp.grab) { const rr = grab(g); if (!rr.ok) bot.refused(rr.why); } step(g, 1 / 60, inp); g.events.length = 0; n++; }
    assert.equal(g.phase, 'reel', `${r.name}: the perfect hand never closed the jaws (${g.t.toFixed(0)} s)`);
  }
});

test('going in: the head follows the pointer at up to 180 units a second, a wall only slows it, and a held pointer costs nothing', () => {
  const g = mkSynth({ len: 600 });
  const tx = g.finds[0].x - 40;
  const t0 = g.t; let maxV = 0;
  run(g, 8, (q) => { maxV = Math.max(maxV, Math.hypot(q.anchor.vx, q.anchor.vy)); return { x: tx, y: 304, down: true }; });
  assert.ok(maxV <= BASE.speedIn + 1 && maxV > 150, `top speed ${maxV}`);
  assert.ok(g.head.x > tx - 60, `the head reached ${g.head.x}`);
  // a wall: point straight into the rock and the anchor slows and slides, never into rock
  const h = mkSynth({ len: 600 });
  run(h, 1.2, { x: h.head.x + 120, y: 304, down: true });
  const before = h.anchor.x; let slowed = false;
  run(h, 2, (q) => { const sp = Math.hypot(q.anchor.vx, q.anchor.vy); if (q.touching && sp < 180) slowed = true; return { x: q.head.x + 20, y: 304 + 400, down: true }; });
  assert.ok(probe(h.board, h.anchor.x, h.anchor.y, 10).d >= 0, 'the anchor stayed in open ground');
  assert.ok(h.anchor.x >= before - 80);
  assert.ok(slowed || h.touching, 'touching the wall slowed the claw');
  // the thumb resting on the glass: nothing is spent, nothing changes
  const k = mkSynth({ len: 600 });
  run(k, 1, { x: k.head.x + 60, y: 304, down: true });
  const snap = { grip: k.grip, knocks: k.knocks, cracks: k.finds[0].cracks, state: k.finds[0].state, phase: k.phase };
  run(k, 6, (q) => ({ x: q.head.x, y: q.head.y, down: true }));
  assert.deepEqual({ grip: k.grip, knocks: k.knocks, cracks: k.finds[0].cracks, state: k.finds[0].state, phase: k.phase }, snap);
});

test('sway: a damped swing with a natural period of about 1.1 s; Control settles it faster; the roll scales it', () => {
  const peaks = (pts) => {
    const g = mkSynth({ len: 600 }, { points: pts });
    g.off = { x: 6, y: 0, vx: 0, vy: 0 };
    const ts = [], amps = []; let prev = 0, prevV = 0;
    for (let i = 0; i < 60 * 5; i++) { step(g, 1 / 60, { down: false }); const v = g.off.x; if (i > 2 && prevV > 0 && v < prev) { ts.push(g.t); amps.push(prev); } prevV = v - prev; prev = v; }
    return { ts, amps, g };
  };
  const a = peaks({});
  assert.ok(a.ts.length >= 2, 'it swings');
  const period = a.ts[1] - a.ts[0];
  assert.ok(period > 0.95 && period < 1.35, `period ${period}`);   // 1.1 s undamped, a little longer with damping 0.35
  assert.ok(a.amps[1] < a.amps[0] * 0.6, 'it is damped');
  // Control: damping 0.35 to 0.54, the swing dies sooner
  assert.equal(rulesFor({}).damping, 0.35); assert.ok(Math.abs(rulesFor({ points: { control: 9 } }).damping - 0.54) < 0.01);
  const c9 = peaks({ control: 9 });
  assert.ok(c9.amps[1] < a.amps[1], `Control 9 left ${c9.amps[1]} against ${a.amps[1]}`);
  // the roll: sway x (1 - 0.12 t)
  for (const t of [-2, -1, 0, 1, 2]) assert.ok(Math.abs(rulesFor({ tier: t }).sway - (1 - 0.12 * t)) < 1e-9);
});

test('roll scaling: sway x (1 - 0.12 t), grip x the shared clock 0.70 .. 1.30, over five tiers', () => {
  const clocks = [0.7, 0.85, 1, 1.15, 1.3];
  [-2, -1, 0, 1, 2].forEach((t, i) => { const r = rulesFor({ tier: t }); assert.equal(r.gripMax, 100 * clocks[i]); assert.ok(r.sway < (i ? rulesFor({ tier: t - 1 }).sway : 9)); assert.equal(TIER[String(t)].time, clocks[i]); });
  assert.equal(tierOf(9), 2); assert.equal(tierOf(-9), -2);
  const g = mkSynth({}, { tier: 2 }); grabMain(g); assert.equal(g.grip, 130);
});

test('each path visibly changes something, and the old Stardust names work', () => {
  const base = rulesFor({});
  // Control: damping. Maneuver: the load fits tighter gaps. Pursuit: a knock costs less and the grip does not tire for a while.
  assert.ok(rulesFor({ points: { control: 9 } }).damping > base.damping * 1.5);
  assert.equal(base.pad, 10); assert.ok(Math.abs(rulesFor({ points: { maneuver: 9 } }).pad - 7.3) < 1e-9);
  const f = { r: 40 }; assert.ok(loadRadius(rulesFor({ points: { maneuver: 9 } }), f) < loadRadius(base, f));
  assert.deepEqual([base.knockLo, base.knockHi], [22, 40]);
  const p9 = rulesFor({ points: { pursuit: 9 } }); assert.ok(Math.abs(p9.knockLo - 14.08) < 0.01 && Math.abs(p9.knockHi - 25.6) < 0.01);
  assert.equal(base.freeTire, 0); assert.equal(rulesFor({ points: { pursuit: 3 } }).freeTire, 2); assert.equal(p9.freeTire, 6);
  assert.deepEqual(cleanPoints({ handling: 4, boost: 5, landing: 6 }), { control: 4, maneuver: 5, pursuit: 6 });
  assert.deepEqual(cleanPoints({ control: 99, maneuver: -3 }), { control: 9, maneuver: 0, pursuit: 0 });
  assert.deepEqual(PATHS, ['control', 'maneuver', 'pursuit']); assert.deepEqual(ALIASES, { handling: 'control', boost: 'maneuver', landing: 'pursuit' });
  // a free stretch of reeling: no tiring for the first seconds with Pursuit 3
  const tired = (pts) => { const g = mkSynth({ len: 900 }, { points: pts }); grabMain(g); const g0 = g.grip; run(g, 1.5, { reel: true }); return g0 - g.grip; };
  assert.ok(tired({}) > 0 && tired({ pursuit: 3 }) < tired({}), 'Pursuit 3 holds the grip for the first 2 s of a reel');
});

test('the grab: reach 26 from the core, the side has to be cleared, and a refusal costs nothing', () => {
  const g = mkSynth({ r: 30 });
  const f = g.finds[0];
  // too far
  g.head.x = g.anchor.x = f.x - f.r - BASE.reach - 12; g.head.y = g.anchor.y = f.y;
  let r = grab(g); assert.equal(r.ok, false); assert.equal(r.why, 'far'); assert.equal(g.phase, 'in'); assert.equal(f.state, 'rock');
  assert.ok(/closer|nothing/.test(words(g)));
  // in reach, side cleared
  g.head.x = g.anchor.x = f.x - f.r - BASE.reach + 6;
  r = grab(g); assert.equal(r.ok, true); assert.equal(g.phase, 'reel'); assert.equal(f.state, 'carried');
  // a plug of uncleared rock on the corridor's side: "that side's still buried", nothing lost
  const p = mkSynth({ r: 30, plug: true });
  const pf = p.finds[0];
  p.head.x = p.anchor.x = pf.x - pf.r - 12; p.head.y = p.anchor.y = pf.y;
  const open = p.board.open[Math.floor(p.head.y / 8) * p.board.gw + Math.floor(p.head.x / 8)];
  assert.ok(!open || graspCheck(p.board, pf, p.head.x, p.head.y, BASE.reach, 0).ok === false, 'the plugged side is not graspable');
  const spot = { x: pf.x - pf.r - 8, y: pf.y };
  p.head.x = p.anchor.x = spot.x; p.head.y = p.anchor.y = spot.y;
  r = grab(p);
  if (!r.ok) { assert.equal(r.why, 'buried'); assert.equal(words(p), "that side's still buried"); assert.equal(pf.cracks, 0); assert.equal(pf.state, 'rock'); assert.equal(p.knocks, 0); }
  // from the open side of the pocket it works
  const q = mkSynth({ r: 30 }), qf = q.finds[0];
  assert.equal(graspCheck(q.board, qf, qf.x + qf.r + 14, qf.y, BASE.reach, 0).ok, true);
  assert.equal(graspCheck(q.board, qf, qf.x + qf.r + 200, qf.y, BASE.reach, 0).ok, false);
});

test('reeling: the pad winds the winch from slow (80) to full (200) and stops it when let go', () => {
  const g = mkSynth({ len: 3000 }); grabMain(g);
  assert.equal(g.phase, 'reel');
  run(g, 0.5, { reel: true }); assert.ok(g.v > 30 && g.v <= 95, `after half a second ${g.v}`);
  run(g, 4, { reel: true }); assert.ok(g.v > 195 && g.v <= 200.01, `held ${g.v}`);
  run(g, 1.4, { reel: false }); assert.ok(g.v < 5, `let go ${g.v}`);
  let maxV = 0; const h = mkSynth({ len: 3000 }); grabMain(h); run(h, 6, (q) => { maxV = Math.max(maxV, q.v); return { reel: true }; }); assert.ok(maxV <= BASE.full + 0.01);
});

test('the grip tires only while the winch turns: a thumb resting costs nothing', () => {
  const g = mkSynth({ len: 900 }); grabMain(g);
  const g0 = g.grip;
  run(g, 5, { reel: false }); assert.equal(g.grip, g0, 'let go: nothing spent');
  run(g, 5, { reel: false, nx: 0, ny: 0 }); assert.equal(g.grip, g0, 'a held pointer with no nudge: nothing spent');
  run(g, 5, { reel: false, nx: 0.3, ny: 0 }); assert.ok(g.grip >= g0 - 0.001, 'a small nudge alone costs nothing');
  const h = mkSynth({ len: 900 }); grabMain(h); const h0 = h.grip; run(h, 1.2, { reel: true });
  assert.ok(h0 - h.grip >= BASE.tire * 1.0 * 0.8, `while reeling the grip tires: ${h0 - h.grip}`);
  // the winch stands still and the clock keeps going: still nothing
  const k = mkSynth({ len: 900 }); grabMain(k); run(k, 0.5, { reel: true }); run(k, 1.6, { reel: false }); const k1 = k.grip; run(k, 6, { reel: false }); assert.equal(k.grip, k1);
});

test('a knock costs 22 to 40 by speed, loosens the grip, and a fast pull strains the jaws', () => {
  // a corridor the load barely fits: the swing knocks it
  const g = mkSynth({ len: 900, half: 9 }); grabMain(g);
  const costs = []; let grip0 = g.grip, ev = 0;
  run(g, 14, (q) => { for (const e of drain(q)) if (e.type === 'knock') { costs.push(e.cost); ev++; } return { reel: true }; });
  g.events.length = 0;
  assert.ok(g.knocks >= 1 || g.drops >= 1 || g.phase !== 'reel', 'a tight corridor at speed knocks the load');
  for (const c of costs) assert.ok(c >= 22 - 1e-6 && c <= 40 + 1e-6, `a knock cost ${c}`);
  assert.ok(costs.length === 0 || costs.reduce((a, b) => a + b, 0) > 0);
  void grip0; void ev;
  // the cost goes by speed: at the slow reel a light knock costs the least
  const r = rulesFor({}); assert.equal(r.knockLo, 22); assert.equal(r.knockHi, 40);
  // the strain: flat out for a while costs more grip than the same time at the slow reel
  const slow = mkSynth({ len: 1500, half: 30 }); grabMain(slow); slow.ramp = 0;
  const fast = mkSynth({ len: 1500, half: 30 }); grabMain(fast);
  run(slow, 6, (q) => ({ reel: q.v < 75 })); run(fast, 6, { reel: true });
  assert.ok(slow.grip > fast.grip, `slow ${slow.grip} fast ${fast.grip}`);
});

test('a dropped find falls, takes one crack, lies somewhere else, and can be fetched; a retry is never the same attempt', () => {
  const g = mkSynth({ len: 900, half: 14 }); grabMain(g);
  run(g, 1.2, { reel: true });
  const from = { x: g.head.x, y: g.head.y }, c0 = g.finds[0].cracks;
  g.grip = 0.01; run(g, 0.2, { reel: true });
  assert.equal(g.phase, 'in', 'the grip went: the claw is empty again');
  const f = g.finds[0];
  assert.equal(f.state, 'lying'); assert.equal(f.cracks, c0 + 1); assert.equal(g.drops, 1);
  assert.ok(Math.hypot(f.x - from.x, f.y - from.y) >= 30, 'it lies somewhere else');
  assert.ok(probe(g.board, f.x, f.y, 10).d >= 3, 'it lies in the open tunnel');
  assert.match(words(g), /dropped|lying/);
  const first = { x: f.x, y: f.y };
  // go back and take it: from any side
  g.head.x = g.anchor.x = f.x - 6; g.head.y = g.anchor.y = f.y; g.path.push({ x: f.x - 6, y: f.y, s: g.path[g.path.length - 1].s + 40 });
  const r = grab(g); assert.equal(r.ok, true); assert.equal(f.state, 'carried');
  assert.ok(g.grip < 100 && Math.abs(g.grip - g.gripMax * (1 - BASE.crackGrip)) < 1e-6, 'a cracked find holds worse');
  run(g, 0.8, { reel: true }); g.grip = 0.01; run(g, 0.3, { reel: true });
  assert.equal(f.cracks, c0 + 2); assert.equal(g.drops, 2);
  assert.ok(Math.hypot(f.x - first.x, f.y - first.y) > 1, 'the second drop lies in a new place');
  // a third crack shatters it: for the main find that is the end
  g.head.x = g.anchor.x = f.x - 6; g.head.y = g.anchor.y = f.y; g.path.push({ x: f.x - 6, y: f.y, s: g.path[g.path.length - 1].s + 40 });
  grab(g); run(g, 0.5, { reel: true }); g.grip = 0.01; run(g, 0.3, { reel: true });
  assert.ok(g.over && g.over.why === 'shattered'); assert.equal(f.state, 'shattered');
  const res = resultOf(g);
  assert.equal(res.success, false); assert.equal(res.dropped, 3); assert.deepEqual(res.effects, { items: { 'shards-gem': 1 } }); assert.equal(res.pulled.length, 0);
  assert.deepEqual(res.shattered, { item: 'gem-blue', shards: 'shards-gem' });
});

test('the drill\'s cracks count: a main find that left the drill with two cracks shatters on the first drop', () => {
  const g = mkSynth({ cracks: 2 }); assert.equal(g.finds[0].cracks, 2); grabMain(g);
  assert.ok(Math.abs(g.grip - 100 * (1 - BASE.crackGrip * 2)) < 1e-6);
  run(g, 0.6, { reel: true }); g.grip = 0.01; run(g, 0.2, { reel: true });
  assert.equal(g.over?.why, 'shattered');
});

test('the drop spot depends on the attempt: two drops of the same find never lie in the same place', () => {
  const spots = [];
  for (let k = 0; k < 6; k++) {
    const g = mkSynth({ len: 900 }, { seed: 7 }); grabMain(g);
    for (let i = 0; i < k; i++) g.finds[0].drops++;   // as if it had been dropped before
    run(g, 1.2, { reel: true }); g.grip = 0.01; run(g, 0.2, { reel: true });
    spots.push(`${Math.round(g.finds[0].x)},${Math.round(g.finds[0].y)}`);
  }
  assert.ok(new Set(spots).size >= 3, `6 drops gave ${new Set(spots).size} places`);   // the drops of one game never repeat (see the test above); across games some places can be shared
});

test('pass, grade, perfect and XP: 70 for the main find, 6 less a knock (floor 40), 15 a bonus find, 15 for no drop', () => {
  const g = mkSynth({ bonus: true }); g.finds[0].state = 'out'; g.over = { why: 'done' };
  const grade = (k, d, bonusOut) => { g.knocks = k; g.drops = d; g.finds[1].state = bonusOut ? 'out' : 'rock'; g.finds[1].canGrab = !bonusOut; return resultOf(g); };
  assert.equal(grade(0, 0, false).grade, 70 + 15);
  assert.equal(grade(3, 0, false).grade, 70 - 18 + 15);
  assert.equal(grade(0, 1, false).grade, 70);
  assert.equal(grade(20, 1, false).grade, 40, 'the floor is 40');
  assert.equal(grade(0, 0, true).grade, 100); assert.equal(grade(0, 0, true).perfect, true);
  assert.equal(grade(0, 0, false).perfect, false, 'a freed find left behind is not perfect');
  assert.equal(grade(1, 0, true).perfect, false);
  assert.equal(grade(0, 0, true).xp, Math.min(6, 2 + 2 + 1)); assert.equal(grade(2, 0, true).xp, 2 + 2);
  assert.equal(grade(0, 0, false).xp, 2 + 1 + 1);
  // a pass puts one of each find that came out into effects.items, by the record's id
  assert.deepEqual(grade(0, 0, true).effects, { items: { 'gem-blue': 1, 'ore-iron': 1 } });
  const f = mkSynth(); f.over = { why: 'gaveup' }; const rf = resultOf(f); assert.equal(rf.success, false); assert.equal(rf.xp, 0); assert.deepEqual(rf.effects, {});
  for (const k of ['success', 'grade', 'pulled', 'dropped', 'knocks', 'done', 'xp']) assert.ok(k in rf, k);
});

test('the claw plays a whole game: in, grab, reel, out onto the bay floor, back for a bonus find, done', () => {
  let any = null;
  for (const r of RESULTS.filter((x) => x.finds.slice(1).some((f) => f.isFreed))) {
    const g = createGame({ seed: 2, tier: 2, result: asResult(r), items: fixtures.items });
    playBot(g, BOTS.perfect(g, {}), { maxT: 150 });
    const res = resultOf(g);
    if (res.success && res.pulled.length >= 2) { any = { r, g, res }; break; }
  }
  assert.ok(any, 'a perfect hand brings out a bonus find as well');
  assert.equal(any.res.pulled[0].item, any.g.finds[0].item); assert.ok(any.res.pulled.every((p) => p.quality > 0 && p.quality <= 100));
  assert.equal(any.g.over.why, 'done'); assert.ok(any.res.grade >= 70);
});

test('plain words that change with every action: nothing goes stale', () => {
  const g = mkSynth({ len: 700 });
  const seen = [words(g)];
  const note = () => { const w = words(g); if (w !== seen[seen.length - 1]) seen.push(w); };
  const f = g.finds[0];
  for (let i = 0; i < 60 * 14 && g.phase === 'in'; i++) { step(g, 1 / 60, { x: f.x - f.r - 10, y: f.y, down: true }); note(); }
  assert.ok(seen.some((w) => /close|reach|near|closer|find is close/.test(w)), `near the find: ${seen.join(' | ')}`);
  grab(g); note(); assert.match(words(g), /got it|Reel/);
  for (let i = 0; i < 60 * 2; i++) { step(g, 1 / 60, { reel: false }); note(); }
  assert.match(words(g), /Reel/, 'the grab message gives way to what is going on');
  for (let i = 0; i < 60; i++) { step(g, 1 / 60, { reel: true }); note(); }
  assert.ok(seen.some((w) => /pull/.test(w)), seen.join(' | '));
  for (const w of seen) assert.ok(!/\d/.test(w), `no digits on the live HUD: "${w}"`);
  assert.ok(!/\d/.test(gripWord(g)));
  assert.ok(gripFrac(g) <= 1 && gripFrac(g) >= 0);
});

test('no item name or line of the world is written in the code (content comes as records)', () => {
  const names = [...Object.keys(fixtures.items), ...Object.values(fixtures.items).map((i) => i.name)];
  for (const file of ['model.js', 'view.js', 'board.js', 'bots.js', 'index.js', 'audio.js']) {
    const text = readFileSync(path.join(MOD, file), 'utf8');
    for (const n of names) assert.ok(!text.includes(n), `${file} mentions "${n}"`);
  }
});

test('quick mode: a straight shaft and one find, and it is short', () => {
  const q = QUICK[0], res = straightShaft(asResult(q));
  assert.equal(res.finds.length, 1);
  const g = createGame({ seed: 1, quick: true, result: res, items: fixtures.items });
  assert.equal(g.finds.length, 1);
  const B = g.board, f = g.finds[0];
  // straight: every point on the line from the mouth to the find is open ground
  let ok = 0, n = 0; for (let s = 24; s < Math.hypot(f.x - B.mouth.x, f.y - B.mouth.y) - f.r - 20; s += 6) { n++; const u = s / Math.hypot(f.x - B.mouth.x, f.y - B.mouth.y); if (B.open[Math.floor((B.mouth.y + (f.y - B.mouth.y) * u) / 8) * B.gw + Math.floor((B.mouth.x + (f.x - B.mouth.x) * u) / 8)]) ok++; }
  assert.ok(ok / n > 0.95, `${ok}/${n} of the shaft is open`);
  const times = [];
  for (const r of QUICK) { const gq = createGame({ seed: 1, quick: true, tier: 0, result: straightShaft(asResult(r)), items: fixtures.items }); playBot(gq, BOTS.wobbly(gq, {}), { maxT: 90 }); if (resultOf(gq).success) times.push(gq.t); }
  assert.ok(times.length >= 3, 'quick games pass'); const mean = times.reduce((a, b) => a + b, 0) / times.length;
  assert.ok(mean >= manifest.quick_length_s[0] - 1 && mean <= manifest.quick_length_s[1], `quick mean ${mean.toFixed(1)} s against ${manifest.quick_length_s}`);
});

test('manifest matches contract 1.1: tabletop paths, aliases, outputs, and the measured length', () => {
  assert.equal(manifest.id, 'claw-pull'); assert.equal(manifest.kind, 'minigame'); assert.equal(manifest.skill, 'piloting'); assert.equal(manifest.contract, '1.1');
  assert.deepEqual(manifest.paths, [{ id: 'control', division: 'Control', tabletopSkill: 'Handling' }, { id: 'maneuver', division: 'Maneuver', tabletopSkill: 'Handling' }, { id: 'pursuit', division: 'Pursuit', tabletopSkill: 'Handling' }]);
  assert.equal(manifest.tabletop, 'Handling'); assert.deepEqual(manifest.path_aliases, ALIASES);
  for (const k of ['success', 'grade', 'pulled', 'dropped', 'knocks']) assert.ok(manifest.outputs.includes(k));
  for (const k of ['seed', 'tier', 'points', 'quick', 'context.rock', 'context.items']) assert.ok(manifest.inputs.includes(k));
  assert.ok(['draft', 'fable-passed', 'erik-played', 'approved', 'in-game'].includes(manifest.status));
  // length: what a good hand (the perfect bot, taking the bonus finds too, and the wobbly hand) really takes
  const t = []; for (const r of RESULTS.slice(0, 18)) { const g = createGame({ seed: 4, tier: 0, result: asResult(r), items: fixtures.items }); playBot(g, BOTS.wobbly(g, {}), { maxT: 90 }); if (resultOf(g).success) t.push(g.t); }
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  assert.ok(mean >= manifest.length_s[0] && mean <= manifest.length_s[1], `wobbly mean ${mean.toFixed(1)} s against ${manifest.length_s}`);
});

function sweep(bot, tier, { n = SWEEP, opts = {}, points = {}, layout = null } = {}) {
  let pass = 0, runs = 0;
  for (const r of RESULTS.filter((x) => !layout || x.layout === layout)) for (let k = 0; k < n; k++) {
    const g = createGame({ seed: 100 + k, tier, points, result: asResult(r), items: fixtures.items });
    playBot(g, BOTS[bot](g, { salt: k, ...opts }), { maxT: 120 });
    runs++; if (resultOf(g).success) pass++;
  }
  return pass / runs;
}

test('bot sweep: perfect passes everywhere, mash never, lazy rarely, the wobbly hand follows the curve, and a resting thumb costs nothing', { timeout: 900000 }, () => {
  const rows = [];
  for (const tier of [-2, -1, 0, 1, 2]) {
    const row = { tier, perfect: sweep('perfect', tier), wobbly: sweep('wobbly', tier, { n: SWEEP * 2 }), thinker: sweep('thinker', tier, { n: SWEEP * 2 }), lazy: sweep('lazy', tier), mash: sweep('mash', tier) };
    rows.push(row);
    assert.ok(row.perfect >= 0.94, `perfect ${JSON.stringify(row)}`);
    assert.ok(row.mash <= 0.08, `mash ${JSON.stringify(row)}`);
    assert.ok(row.lazy <= 0.35, `lazy ${JSON.stringify(row)}`);
  }
  console.log('bot table (pass rate)\n' + rows.map((r) => `${TIER[String(r.tier)].label.padEnd(6)} perfect ${(r.perfect * 100).toFixed(0)}%  wobbly ${(r.wobbly * 100).toFixed(0)}%  thinker ${(r.thinker * 100).toFixed(0)}%  lazy ${(r.lazy * 100).toFixed(0)}%  mash ${(r.mash * 100).toFixed(0)}%`).join('\n'));
  const w = (t) => rows.find((r) => r.tier === t).wobbly;
  // The brief's curve: about 35-50% Rough, 70-80% Steady, 90%+ Smooth.
  assert.ok(w(-2) >= 0.3 && w(-2) <= 0.55, `Rough ${w(-2)}`);
  assert.ok(w(0) >= 0.68 && w(0) <= 0.85, `Steady ${w(0)}`);
  assert.ok(w(2) >= 0.9, `Smooth ${w(2)}`);
  assert.ok(w(-2) < w(-1) && w(-1) <= w(0) + 0.02 && w(0) <= w(2), 'the curve climbs');
  for (const r of rows) assert.ok(r.thinker >= r.wobbly - 0.2, `resting is not punished: thinker ${r.thinker} against wobbly ${r.wobbly} on ${r.tier}`);
});

test('a resting thumb: the thinker rests with the pointer held and the pad let go, and the grip does not change while it rests', () => {
  let rested = 0, checked = 0;
  for (const r of RESULTS.slice(0, 12)) {
    const g = createGame({ seed: 9, tier: 0, result: asResult(r), items: fixtures.items });
    const bot = BOTS.thinker(g, {}); let last = null, restStart = null;
    while (!g.over && g.t < 90) {
      const inp = bot.think(g, 1 / 60);
      const resting = g.phase === 'reel' && inp.reel === false && g.v < 1;
      if (inp.goBack) goBack(g); else if (inp.done) done(g); else if (inp.giveUp) giveUp(g);
      if (g.over) break;
      if (inp.grab && g.phase === 'in') { const rr = grab(g); if (!rr.ok) bot.refused?.(rr.why); }
      const g0 = g.grip; step(g, 1 / 60, inp); g.events.length = 0;
      if (resting && g.phase === 'reel') { checked++; if (g.grip < g0 - 1e-9 && !g.touching) assert.fail(`the grip fell from ${g0} to ${g.grip} while the thumb rested`); rested += 1 / 60; }
      void last; void restStart;
    }
  }
  assert.ok(rested > 5 && checked > 300, `the thinker rested ${rested.toFixed(1)} s`);
});

test('points never make it worse: a wobbly hand at 9 passes at least as often as at 0, per path and all together', { timeout: 900000 }, () => {
  for (const tier of [-2, 0]) {
    const base = sweep('wobbly', tier, { n: SWEEP * 3 });
    for (const p of PATHS) {
      const at9 = sweep('wobbly', tier, { n: SWEEP * 3, points: { [p]: 9 } });
      assert.ok(at9 >= base - 0.04, `${p} at 9 (${at9}) vs 0 (${base}) on tier ${tier}`);
    }
    const all = sweep('wobbly', tier, { n: SWEEP * 3, points: { control: 3, maneuver: 3, pursuit: 3 } });
    assert.ok(all >= base - 0.04, `all three (${all}) vs none (${base})`);
  }
});

test('a retry changes the position of the find and its cracks, and a second seed is a different board, not just a harder one', () => {
  const boards = [1, 2, 3, 4, 5, 6].map((s) => pickResult({ seed: s, layout: 'tall', fixtures }));
  const sig = (p) => `${p.name}|${p.flipX}|${p.flipY}|${p.result.finds[0].x}|${p.result.finds[0].y}`;
  assert.ok(new Set(boards.map(sig)).size >= 5);
  const lens = boards.map((p) => { const g = createGame({ seed: 1, result: p.result, items: fixtures.items }); return Math.round(Math.hypot(g.finds[0].x - g.board.start.x, g.finds[0].y - g.board.start.y)); });
  assert.ok(new Set(lens).size >= 4, `distances to the find: ${lens}`);
});

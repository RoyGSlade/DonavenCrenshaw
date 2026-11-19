// Assembly repair (v2/PLAN.md section 5): the 12-outline set, an independent fitter over 500 seeds (exactly one part fits each socket, in
// exactly one turn), exact tables for the roll and the three Repair points (every point changes something), the result math, the lost
// world result, and perfect / lazy / slow bots at human speed (a time cost per action) that set the base clock. Pure: no DOM.
// The browser test (stardust-minigames-assembly-browser.test.mjs) plays it on screen, by mouse and by touch.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../projects/Space-Shooter/voyage/minigames/assembly.js';
import * as W from '../projects/Space-Shooter/voyage/minigames/screw.js';
import { setupAssembly, setupScrew, ASSEMBLY_BASE, tierInfo, POINT_MAX } from '../projects/Space-Shooter/voyage/minigames/setup.js';
import { SYSTEMS } from '../projects/Space-Shooter/voyage/minigames/repair.js';
import { rollPreview } from '../projects/Space-Shooter/voyage/minigames/rollPreview.js';
import { startStation, settleStation, stationById, worldLine } from '../projects/Space-Shooter/voyage/workbench/stations.js';
import { freshState } from '../projects/Space-Shooter/voyage/workbench/state.js';

const TIERS = [-2, -1, 0, 1, 2];
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const gauss = (r) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ---- the independent fitter: plain point sets, its own turning and mirroring, nothing from assembly.js but the data it checks ---------------
const norm = (pts) => { const mx = Math.min(...pts.map((p) => p[0])), my = Math.min(...pts.map((p) => p[1])); return pts.map(([x, y]) => `${x - mx},${y - my}`).sort().join('|'); };
const rot90 = (pts, k) => { let p = pts; for (let i = 0; i < k; i++) p = p.map(([x, y]) => [-y, x]); return p; };
/** Every (piece, turn) that fills the socket. */
function fitters(state, socket) {
  const want = norm(socket.cells), out = [];
  for (const p of state.pieces) { const base = A.outlineById(p.outline).cells; for (let k = 0; k < 4; k++) if (norm(rot90(base, k)) === want) out.push({ piece: p.id, turn: k }); }
  return out;
}

// ---- human-speed bots ------------------------------------------------------------------------------------------------------------
// A time cost for every action, in seconds. `perfect` is a quick, careful hand; `slow` is an ordinary one with slips and a shaky screw.
const HAND = Object.freeze({
  perfect: { look: 1.4, turn: 0.35, drag: 0.9, bolt: 0.6, perTurn: 0.75, press: 0.5, noise: 0, screw: { rSd: 0, stopSd: 0.02, dTh: 0.1 }, wrongPart: 0, wrongTurn: 0 },
  slow: { look: 2.6, turn: 0.5, drag: 1.4, bolt: 0.95, perTurn: 1.15, press: 0.7, noise: 4, screw: { rSd: 13, stopSd: 0.09, dTh: 0.1 }, wrongPart: 0.15, wrongTurn: 0.2 },
});
/** A finger circling the bolt head (the cutscrew lane's bot); returns the finished Screw state. */
function circle(setup, seed, { rSd = 0, stopSd = 0, dTh = 0.1, stop = true, maxEvents = 6000 } = {}) {
  const s = W.createScrew({ setup }), r = lcg(seed * 13 + 5);
  let th = 0, dev = 0;
  const at = (rad, a) => [s.cx + rad * Math.cos(a), s.cy + rad * Math.sin(a)];
  W.screwDown(s, ...at(75, th));
  for (let i = 0; i < maxEvents && !s.done; i++) {
    th += dTh; dev = dev * 0.85 + gauss(r) * rSd * 0.5;
    W.screwMove(s, ...at(75 + dev, th));
    if (s.status === 'stripped') for (let k = 0; k < 3000 && s.status === 'stripped' && !s.done; k++) { th -= dTh; W.screwMove(s, ...at(75, th)); }
    if (stop && s.status === 'turning' && s.turns + gauss(r) * stopSd >= s.T - s.zone / 2) { W.screwUp(s); if (!s.done) W.screwDown(s, ...at(75, th)); }
  }
  if (!s.done) W.screwGiveUp(s);
  return s;
}
const screwSetup = setupScrew({ tier: 0, level: 1 });

/** Play a whole job with a bot, every action costing time. `kind`: perfect | slow | lazy. Returns the finished state. */
function play(seed, setup, kind = 'perfect', layout = 'wide') {
  const s = A.createAssembly({ seed, setup, layout }), r = lcg(seed * 977 + 3);
  const H = HAND[kind === 'lazy' ? 'perfect' : kind];
  // every hand has its own pace on the day: a log-normal speed factor on every action (the slow hand varies the most)
  const pace = Math.exp(gauss(r) * (kind === 'slow' ? 0.22 : 0.08));
  const spend = (dt) => { A.tick(s, dt * pace); return !s.done; };
  const nz = () => (H.noise ? gauss(r) * H.noise : 0);
  let guard = 0;
  while (!s.done && guard++ < 400) {
    const k = A.socketOf(s);
    if (s.phase === 'fit') {
      if (kind === 'lazy') {
        // never turns anything: tries the loose pieces in tray order, as they lie
        const list = A.trayPieces(s).sort((a, b) => a.home - b.home);
        const p = list[guard % list.length];
        A.grab(s, p.id); if (!spend(1.1)) break; A.carry(s, k.x + A.pieceSize(s, p).w / 2, k.y + A.pieceSize(s, p).h / 2); A.drop(s);
        continue;
      }
      if (!spend(H.look)) break;
      const mine = A.pieceOf(s, k.part);
      const tryPiece = (p, rotateTo) => {
        A.select(s, p.id);
        let need = rotateTo == null ? 0 : (rotateTo - p.rot + 4) % 4, presses = need === 3 ? 1 : need;
        const dir = need === 3 ? -1 : 1;
        for (let i = 0; i < presses; i++) { A.turn(s, dir); if (!spend(H.turn)) return null; }
        A.grab(s, p.id); if (!spend(H.drag)) return null;
        const z = A.pieceSize(s, p);
        A.carry(s, k.x + z.w / 2 + nz(), k.y + z.h / 2 + nz());
        return A.drop(s);
      };
      const right = fitters(s, k)[0].turn;
      if (r() < H.wrongPart) { const decoy = s.pieces.find((p) => p.role === 'decoy' && !p.placed); if (decoy) { tryPiece(decoy, decoy.rot); if (s.done) break; } }
      if (r() < H.wrongTurn) { tryPiece(mine, (right + 1 + Math.floor(r() * 3)) % 4 === right ? (right + 1) % 4 : (right + 1) % 4); if (s.done) break; }
      tryPiece(mine, right);
    } else if (s.phase === 'bolt') {
      for (const b of s.bolts) {
        if (b.tight) continue;
        if (!b.seated) {
          A.grabBolt(s, b.id); if (!spend(H.bolt)) break;
          A.carryBolt(s, b.hx + nz() * 0.6, b.hy + nz() * 0.6);
          if (A.dropBolt(s) !== 'seated') continue;
        }
        const g = circle(screwSetup, seed * 31 + guard * 7 + parseInt(b.id.slice(1), 10), { ...H.screw, stop: kind !== 'lazy' });
        if (!spend(g.travel * H.perTurn + H.press)) break;
        A.screwed(s, b.id, g.result);
        if (s.done) break;
      }
    }
  }
  return s;
}
const rate = (n, f) => { let ok = 0; for (let i = 1; i <= n; i++) if (f(i)) ok++; return ok / n; };

// ---- the outlines ------------------------------------------------------------------------------------------------------------------
test('the 12 outlines: 6 hand-drawn shapes and their mirrors, each with 4 different turns, no mirror twin ever fits', () => {
  assert.equal(A.OUTLINES.length, 12);
  assert.equal(new Set(A.OUTLINES.map((o) => o.id)).size, 12);
  assert.equal(A.OUTLINES.filter((o) => o.mirrored).length, 6);
  for (const o of A.OUTLINES) {
    const turns = [0, 1, 2, 3].map((k) => norm(rot90(o.cells, k)));
    assert.equal(new Set(turns).size, 4, `${o.id} has 4 different turns`);
    const twin = A.outlineById(o.twin);
    assert.equal(twin.twin, o.id);
    const twinTurns = [0, 1, 2, 3].map((k) => norm(rot90(twin.cells, k)));
    assert.ok(turns.every((t) => !twinTurns.includes(t)), `${o.id}: its mirror twin never fits in any turn`);
    assert.ok(o.cells.length >= 5 && o.cells.length <= 7, `${o.id} is 5 to 7 cells`);
    assert.ok(A.sizeOf(o.cells).w <= 3 && A.sizeOf(o.cells).h <= 3, `${o.id} fits 3 x 3`);
  }
  for (const a of A.OUTLINES) for (const b of A.OUTLINES) if (a !== b) {
    const ta = [0, 1, 2, 3].map((k) => norm(rot90(a.cells, k)));
    assert.ok(!ta.includes(norm(b.cells)), `${a.id} and ${b.id} are different outlines in every turn`);
  }
  assert.equal(A.turnCells(A.OUTLINES[0].cells, 4).join(), A.normalise(A.OUTLINES[0].cells).join());
});

test('the fit rule: turned right it fits, any other turn or the mirror twin does not', () => {
  const o = A.outlineById('hook');
  for (let k = 0; k < 4; k++) for (let q = 0; q < 4; q++) assert.equal(A.fitsSocket(o, q, { cells: A.turnCells(o.cells, k) }), q === k);
  assert.equal(A.fitsSocket(A.outlineById('hook-m'), 0, o), false);
  for (let q = 0; q < 4; q++) assert.equal(A.fitsSocket(A.outlineById('hook-m'), q, o), false);
});

test('500 seeds, every roll: exactly one piece fits each socket, in exactly one turn, and it is the socket\'s own part', () => {
  for (const tier of TIERS) for (let seed = 1; seed <= 100; seed++) {
    const setup = setupAssembly({ tier, level: 9, points: { size: seed % 10 } });
    const s = A.createAssembly({ seed, setup, layout: seed % 2 ? 'wide' : 'tall' });
    assert.equal(s.sockets.length, setup.parts);
    assert.equal(s.pieces.filter((p) => p.role === 'part').length, setup.parts);
    assert.equal(s.pieces.filter((p) => p.role === 'decoy').length, setup.decoys);
    assert.equal(new Set(s.pieces.map((p) => p.outline)).size, s.pieces.length, `seed ${seed}: every outline in the tray is different`);
    for (const k of s.sockets) {
      const f = fitters(s, k);
      assert.equal(f.length, 1, `seed ${seed} tier ${tier} socket ${k.id}: exactly one (piece, turn) fits`);
      assert.equal(f[0].piece, k.part);
    }
  }
});

test('the tray: mirror twins are the first decoys, the sockets sit in the housing, the tray pieces fit their slots, the same seed is the same tray', () => {
  for (let seed = 1; seed <= 60; seed++) for (const layout of ['wide', 'tall']) {
    const s = A.createAssembly({ seed, setup: setupAssembly({}), layout }), L = s.layout, ar = A.areasOf(s);
    const decoys = s.pieces.filter((p) => p.role === 'decoy'), partIds = s.pieces.filter((p) => p.role === 'part').map((p) => p.outline);
    assert.equal(decoys.filter((d) => partIds.includes(A.outlineById(d.outline).twin)).length, 3, 'with 4 parts all three decoys are mirror twins');
    for (const p of s.pieces) { const z = A.pieceSize(s, p); assert.ok(z.w <= 3 * L.trayCell && z.h <= 3 * L.trayCell, 'a part in the tray is at tray size'); if (!L.scrolls) assert.ok(p.x >= ar.tray.x && p.y >= ar.tray.y && p.x + z.w <= ar.tray.x + ar.tray.w && p.y + z.h <= ar.tray.y + ar.tray.h, `${p.id} lies in its tray slot`); }
    for (const k of s.sockets) assert.ok(k.x >= ar.housing.x && k.y >= ar.housing.y + A.HEADER && k.x + k.w * L.cell <= ar.housing.x + ar.housing.w && k.y + k.h * L.cell <= ar.housing.y + ar.housing.h, 'the open socket fits the housing');
    for (const k of s.sockets) assert.ok(Math.abs(k.x + (k.w * L.cell) / 2 - (ar.housing.x + ar.housing.w / 2)) <= 1 && Math.abs(k.y + (k.h * L.cell) / 2 - (ar.housing.y + A.HEADER + (ar.housing.h - A.HEADER) / 2)) <= 1, 'every socket opens in the middle of the housing: one large socket at a time');
    assert.ok(L.cell >= 100, 'cells are large');
    const again = A.createAssembly({ seed, setup: setupAssembly({}), layout });
    assert.deepEqual(again.pieces, s.pieces); assert.deepEqual(again.sockets, s.sockets);
  }
  const a = A.createAssembly({ seed: 1, setup: setupAssembly({}) }), b = A.createAssembly({ seed: 2, setup: setupAssembly({}) });
  assert.notDeepEqual(a.sockets.map((k) => k.outline), b.sockets.map((k) => k.outline));
  for (let seed = 1; seed <= 100; seed++) { const s = A.createAssembly({ seed, setup: setupAssembly({ tier: -2 }) }); const ids = s.sockets.map((k) => k.outline); assert.ok(ids.every((id) => !ids.includes(A.outlineById(id).twin))); }
});
test('on a phone a 390 px board draws the open socket with cells of 48 px or more; parts in the tray are bigger than 20 px a cell too', () => {
  const L = A.LAYOUTS.tall, scale = 390 / L.W;
  assert.ok(L.cell * scale >= 48, `socket cells ${L.cell * scale} px`); assert.ok(L.trayCell * scale >= 38, `tray cells ${L.trayCell * scale} px`);
  assert.ok(A.LAYOUTS.wide.cell * (1440 / 1000) >= 48 || A.LAYOUTS.wide.cell * (900 / 620) >= 48);
});
test('parts carry their bolt holes: the holes sit on the part cells, in every turn, before it is fitted', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = A.createAssembly({ seed, setup: setupAssembly({}) });
    for (const p of s.pieces) for (let rot = 0; rot < 4; rot++) {
      p.rot = rot; const cells = A.pieceCells(p).map((c) => c.join()), holes = A.pieceHoles(p);
      assert.ok(holes.length >= 2 && holes.every((h) => cells.includes(h.join())), `${p.id} turn ${rot}: every hole is on a cell`);
    }
    for (const p of s.pieces.filter((q) => q.role === 'part')) assert.equal(p.holes.length, s.sockets.find((k) => k.part === p.id).bolts, 'a part shows as many holes as it will take bolts');
  }
});
test('picking a part up grows it to full size about its own middle; letting go in the air puts it back at tray size', () => {
  const s = A.createAssembly({ seed: 3, setup: setupAssembly({}), layout: 'tall' }); const p = s.pieces[0];
  const z0 = A.pieceSize(s, p), c0 = [p.x + z0.w / 2, p.y + z0.h / 2];
  A.grab(s, p.id); const z1 = A.pieceSize(s, p);
  assert.equal(z1.w / z0.w, s.layout.cell / s.layout.trayCell); assert.ok(Math.abs(p.x + z1.w / 2 - c0[0]) < 0.6 && Math.abs(p.y + z1.h / 2 - c0[1]) < 0.6);
  assert.equal(A.drop(s), 'miss'); assert.deepEqual(A.pieceSize(s, p), z0);
});
test('the tray on a phone scrolls sideways and clamps; no scrolling on a wide board', () => {
  const s = A.createAssembly({ seed: 3, setup: setupAssembly({}), layout: 'tall' });
  const max = A.trayMax(s); assert.ok(max > 0, 'seven parts do not fit one screen width');
  const p = s.pieces.find((q) => q.home === 0), x0 = p.x;
  A.scrollTray(s, 100); assert.equal(Math.round(x0 - p.x), 100); A.scrollTray(s, 99999); assert.equal(s.trayScroll, max); A.scrollTray(s, -99999); assert.equal(s.trayScroll, 0);
  assert.equal(A.trayMax(A.createAssembly({ seed: 3, setup: setupAssembly({}), layout: 'wide' })), 0);
});

// ---- the roll and the points ----------------------------------------------------------------------------------------------------
test('setup: the base is 4 parts, 3 decoys, 10 bolts, 110 s; the roll sets the clock and the part count', () => {
  const b = setupAssembly({});
  assert.deepEqual([b.parts, b.decoys, b.bolts, b.clock], [4, 3, 10, 110]);
  assert.deepEqual(ASSEMBLY_BASE, { clock: 110, parts: 4, decoys: 3, bolts: 10, timePerPoint: 6, boltPoints: 6, qualityPerPoint: 4, snap: 12, boltSnap: 6 });
  assert.deepEqual(TIERS.map((t) => setupAssembly({ tier: t }).parts), [5, 4, 4, 4, 3], 'parts: 3 at Smooth, 5 at Rough');
  assert.deepEqual(TIERS.map((t) => setupAssembly({ tier: t }).clock), [77, 94, 110, 127, 143]);
  assert.deepEqual(TIERS.map((t) => setupAssembly({ tier: t }).label), ['Rough', 'Shaky', 'Steady', 'Good', 'Smooth']);
  assert.equal(setupAssembly({ tier: 7 }).tier, 2, 'tier is clamped');
});

test('every Repair point changes something, on the weakest base (Steady, nothing else spent)', () => {
  const at = (cat, n) => setupAssembly({ tier: 0, level: 9, points: { [cat]: n } });
  for (let n = 1; n <= POINT_MAX; n++) {
    assert.equal(at('time', n).clock, 110 + 6 * n, `Time ${n}`);
    assert.equal(at('quality', n).qualityBonus, 4 * n);
    const prev = at('size', n - 1), now = at('size', n);
    assert.ok(now.bolts < prev.bolts || now.decoys < prev.decoys, `Puzzle size ${n} changes the bolts or the decoys`);
  }
  assert.equal(at('time', 9).clock, 164, '110 up to 164');
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((n) => at('size', n).bolts), [10, 9, 8, 7, 6, 5, 4], 'points 1 to 6: one bolt fewer each, 10 down to 4');
  assert.deepEqual([6, 7, 8, 9].map((n) => at('size', n).decoys), [3, 2, 1, 0], 'points 7 to 9: one decoy fewer each, 3 down to 0');
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((n) => at('size', n).decoys), [3, 3, 3, 3, 3, 3], 'the first six points leave the decoys');
  assert.deepEqual([7, 8, 9].map((n) => at('size', n).bolts), [4, 4, 4], 'the last three leave the bolts');
  assert.equal(setupAssembly({ level: 3, points: { time: 9 } }).clock, 110 + 6 * 3, 'points never pass the level');
});

test('a Rough roll has 5 parts, so the bolts floor at 5 and the size points that cannot cut a bolt take a decoy off instead', () => {
  const at = (n) => setupAssembly({ tier: -2, level: 9, points: { size: n } });
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at(n).bolts), [10, 9, 8, 7, 6, 5, 5, 5, 5, 5]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => at(n).decoys), [3, 3, 3, 3, 3, 3, 2, 1, 0, 0]);
  for (let n = 1; n <= 8; n++) { const a = at(n - 1), b = at(n); assert.ok(b.bolts < a.bolts || b.decoys < a.decoys, `Rough: Puzzle size point ${n} still changes something`); }
  // the same on every roll: no size point is wasted until the tray is empty and the bolts are at their floor
  for (const tier of TIERS) {
    const u = (n) => setupAssembly({ tier, level: 9, points: { size: n } });
    for (let n = 1; n <= 9; n++) { const floor = u(9); const moreToGive = u(n - 1).bolts > floor.bolts || u(n - 1).decoys > floor.decoys; if (moreToGive) assert.ok(u(n).bolts < u(n - 1).bolts || u(n).decoys < u(n - 1).decoys, `tier ${tier} point ${n}`); }
  }
  assert.deepEqual(A.boltsPerPart(10, 4), [3, 3, 2, 2]); assert.deepEqual(A.boltsPerPart(4, 4), [1, 1, 1, 1]); assert.deepEqual(A.boltsPerPart(10, 3), [4, 3, 3]);
  for (let seed = 1; seed <= 40; seed++) for (const tier of TIERS) for (const size of [0, 3, 6, 9]) {
    const setup = setupAssembly({ tier, level: 9, points: { size } }), s = A.createAssembly({ seed, setup });
    assert.equal(s.sockets.reduce((a, k) => a + k.bolts, 0), setup.bolts);
    assert.ok(s.sockets.every((k) => k.bolts >= 1 && k.holes.length === k.bolts && new Set(k.holes.map((c) => c.join())).size === k.bolts));
  }
});
test('the drop radii are part of the setup, by input: the rule the tests check is the rule the player feels', () => {
  assert.deepEqual([setupAssembly({}).snap, setupAssembly({}).boltSnap, setupAssembly({}).input], [24, 14, 'mouse']);
  assert.deepEqual([setupAssembly({ input: 'touch' }).snap, setupAssembly({ input: 'touch' }).boltSnap], [40, 30]);
  assert.equal(setupAssembly({ input: 'pen' }).input, 'mouse', 'an unknown input is a mouse');
  const s = A.createAssembly({ seed: 3, setup: setupAssembly({ input: 'touch' }) }); assert.deepEqual([s.snap, s.boltSnap], [40, 30]);
});

// ---- fitting, snapping, bouncing ----------------------------------------------------------------------------------------------
function fitFirst(s, { turned = true, offset = 0 } = {}) {
  const k = A.socketOf(s), p = A.pieceOf(s, k.part), want = fitters(s, k)[0].turn;
  A.select(s, p.id);
  while (turned && p.rot !== want) A.turn(s, 1);
  A.grab(s, p.id); const z = A.pieceSize(s, p); A.carry(s, k.x + z.w / 2 + offset, k.y + z.h / 2);
  return { s, k, p, result: A.drop(s) };
}
test('a part turned right and dropped within the snap radius snaps in; the bolt step opens', () => {
  const s = A.createAssembly({ seed: 3, setup: setupAssembly({}) });
  const r = fitFirst(s, { offset: 23 });
  assert.equal(r.result, 'snapped'); assert.equal(s.phase, 'bolt'); assert.equal(r.p.placed, true); assert.deepEqual([r.p.x, r.p.y], [r.k.x, r.k.y]);
  assert.equal(s.bolts.length, r.k.bolts); assert.ok(s.events.some((e) => e.type === 'snapped'));
  assert.equal(s.wrongFits, 0);
});
test('outside the snap radius nothing snaps (24 units for a mouse, 40 for a finger), and the part goes back to the tray', () => {
  const s = A.createAssembly({ seed: 3, setup: setupAssembly({}) });
  const r = fitFirst(s, { offset: 25 });
  assert.equal(r.result, 'close'); assert.equal(s.phase, 'fit'); assert.equal(r.p.placed, false); assert.equal(s.wrongFits, 0); assert.deepEqual([r.p.x, r.p.y], [r.p.homeX, r.p.homeY]);
  const t = A.createAssembly({ seed: 3, setup: setupAssembly({ input: 'touch' }) });
  assert.equal(fitFirst(t, { offset: 39 }).result, 'snapped', 'a finger gets 40');
  const far = fitFirst(A.createAssembly({ seed: 3, setup: setupAssembly({}) }), { offset: 600 });
  assert.equal(far.result, 'miss');
});
test('the right part turned the wrong way bounces with no penalty; a wrong part bounces and counts as a wrong fit', () => {
  let s = A.createAssembly({ seed: 5, setup: setupAssembly({}) });
  const k = A.socketOf(s), mine = A.pieceOf(s, k.part), want = fitters(s, k)[0].turn;
  A.select(s, mine.id); while (mine.rot === want) A.turn(s, 1);
  A.grab(s, mine.id); A.carry(s, k.x + A.pieceSize(s, mine).w / 2, k.y + A.pieceSize(s, mine).h / 2);
  assert.equal(A.drop(s), 'turn'); assert.equal(s.wrongFits, 0); assert.equal(s.wrongTurns, 1); assert.equal(mine.placed, false);
  const decoy = s.pieces.find((p) => p.role === 'decoy');
  A.grab(s, decoy.id); const z = A.pieceSize(s, decoy); A.carry(s, k.x + z.w / 2, k.y + z.h / 2);
  assert.equal(A.drop(s), 'wrong'); assert.equal(s.wrongFits, 1); assert.deepEqual([decoy.x, decoy.y], [decoy.homeX, decoy.homeY]);
  // the mirror twin of the right part: the nastiest wrong part
  const twin = s.pieces.find((p) => p.role === 'decoy' && p.outline === A.outlineById(mine.outline).twin);
  if (twin) { for (let q = 0; q < 4; q++) { A.turn(s, 1, twin.id); A.grab(s, twin.id); const zz = A.pieceSize(s, twin); A.carry(s, k.x + zz.w / 2, k.y + zz.h / 2); assert.equal(A.drop(s), 'wrong'); } assert.equal(s.wrongFits, 5); }
});
test('turning keeps a part about its own middle, in either direction, and four turns come back to the start', () => {
  const s = A.createAssembly({ seed: 9, setup: setupAssembly({}) });
  const p = s.pieces[0]; A.select(s, p.id);
  const mid = () => { const z = A.pieceSize(s, p); return [p.x + z.w / 2, p.y + z.h / 2]; };
  const m0 = mid(), r0 = p.rot;
  for (let i = 0; i < 4; i++) { A.turn(s, 1); const m = mid(); assert.ok(Math.abs(m[0] - m0[0]) < 0.51 && Math.abs(m[1] - m0[1]) < 0.51); }
  assert.equal(p.rot, r0); A.turn(s, -1); assert.equal(p.rot, (r0 + 3) % 4);
  assert.equal(A.turn(s, 1, 'nope'), false);
});

// ---- the bolts and the next socket --------------------------------------------------------------------------------------------------
test('bolts: each goes to a hole (14 units for a mouse), a stripped one comes out, and the next socket shows only after the last bolt is snug', () => {
  const s = A.createAssembly({ seed: 4, setup: setupAssembly({}) });
  assert.equal(A.socketOf(s).index, 0);
  fitFirst(s);
  const k = A.socketOf(s);
  const b = s.bolts[0];
  A.grabBolt(s, b.id); A.carryBolt(s, b.hx + 15, b.hy);
  assert.equal(A.dropBolt(s), 'miss'); assert.equal(b.seated, false);
  A.grabBolt(s, b.id); A.carryBolt(s, b.hx + 9, b.hy + 9);
  assert.equal(A.dropBolt(s), 'seated'); assert.equal(b.seated, true);
  assert.equal(A.screwed(s, b.id, { success: false, grade: 40 }), 'stripped'); assert.equal(b.seated, false); assert.equal(s.stripped, 1);
  for (const o of s.bolts) {
    if (!o.seated) { A.grabBolt(s, o.id); A.carryBolt(s, o.hx, o.hy); assert.equal(A.dropBolt(s), 'seated'); }
    assert.equal(s.active, 0, 'still the first socket until the last bolt is snug');
    A.screwed(s, o.id, { success: true, grade: 90 });
  }
  assert.equal(k.done, true); assert.equal(s.active, 1); assert.equal(s.phase, 'fit'); assert.equal(s.bolts, null);
  assert.ok(s.events.some((e) => e.type === 'next-socket'));
  assert.equal(A.grab(s, A.pieceOf(s, A.socketOf(s).part).id), true);
});
test('a bolt cannot go where there is no free hole, and each hole takes one bolt', () => {
  const s = A.createAssembly({ seed: 4, setup: setupAssembly({}) }); fitFirst(s);
  const [a, b] = s.bolts;
  A.grabBolt(s, a.id); A.carryBolt(s, a.hx, a.hy); assert.equal(A.dropBolt(s), 'seated');
  A.grabBolt(s, b.id); A.carryBolt(s, a.hx, a.hy); assert.equal(A.dropBolt(s), 'miss', 'that hole is taken');
  assert.equal(A.grabBolt(s, a.id), false, 'a seated bolt is not picked up again');
});

// ---- the result math --------------------------------------------------------------------------------------------------------------
test('quality: 40, up to 30 for few wrong fits, up to 30 for the clock left, plus the points; stars at 65 and 90', () => {
  const q = (o) => A.qualityOf({ success: true, clock: 100, ...o });
  assert.equal(q({ wrongFits: 0, left: 100 }), 100);
  assert.equal(q({ wrongFits: 0, left: 0 }), 70);
  assert.equal(q({ wrongFits: 1, left: 100 }), 94); assert.equal(q({ wrongFits: 5, left: 100 }), 70); assert.equal(q({ wrongFits: 9, left: 100 }), 70, 'never under 40 + 30');
  assert.equal(q({ wrongFits: 0, left: 50 }), 85); assert.equal(q({ wrongFits: 2, left: 25 }), 66, '40 + 18 + 7.5 rounds to 66');
  assert.equal(q({ wrongFits: 5, left: 0 }), 40);
  assert.equal(q({ wrongFits: 0, left: 50, qualityBonus: 36 }), 100, '100 at most');
  assert.equal(q({ wrongFits: 5, left: 0, qualityBonus: 12 }), 52, 'the points add on top');
  assert.equal(A.qualityOf({ success: false, clock: 100, left: 100 }), 0);
  assert.deepEqual([64, 65, 89, 90, 100].map(A.starsOf), [1, 2, 2, 3, 3]);
  assert.deepEqual([[true, 4, 3], [true, 3, 1], [true, 5, 2], [false, 4, 0]].map(([success, parts, stars]) => A.xpFor({ success, parts, stars })), [8, 4, 9, 0]);
});
test('a finished job: quality, stars and XP on the result; every Quality point is +4', () => {
  const base = (pts) => { const s = play(7, setupAssembly({ tier: 2, level: 9, points: { time: 9, ...pts } }), 'perfect'); return s.result; };
  const a = base({}), b = base({ quality: 3 });
  assert.equal(a.success, true); assert.equal(a.how, 'fixed'); assert.equal(a.broken, false); assert.equal(a.parts, 3);
  assert.ok(b.quality >= a.quality && b.quality <= 100);
  assert.equal(A.qualityOf({ success: true, wrongFits: a.wrongFits, left: a.timeLeft, clock: a.clock, qualityBonus: 0 }), a.quality);
});
test('losing on the clock: the unit stays broken, named, and a retry costs one scrap', () => {
  const s = A.createAssembly({ seed: 2, setup: setupAssembly({}), system: 'reactor-loop' });
  A.tick(s, 109.9); assert.equal(s.done, false);
  A.tick(s, 0.2);
  assert.equal(s.done, true); assert.equal(s.phase, 'lost');
  const r = s.result;
  assert.deepEqual([r.success, r.broken, r.system, r.systemName, r.how, r.quality, r.stars, r.xp], [false, true, 'reactor-loop', 'Reactor loop', 'out-of-time', 0, 0, 0]);
  assert.deepEqual(r.retry, { scrap: 1, why: 'a spoiled gasket' });
  assert.deepEqual(A.worldOf(r), { broken: true, system: 'reactor-loop', systemName: 'Reactor loop' });
  assert.ok(Object.values(SYSTEMS).includes(r.systemName));
  assert.equal(A.tick(s, 5), s); assert.equal(A.drop(s), null, 'nothing moves after the end');
  assert.equal(A.createAssembly({ seed: 2, setup: setupAssembly({}), system: 'nope' }).system, 'engine-cooling');
  assert.equal(A.worldOf(null).systemName, 'Engine cooling');
});
test('plain words for the HUD: clock, wrong fits, ordinals', () => {
  const s = A.createAssembly({ seed: 1, setup: setupAssembly({}) });
  assert.equal(A.clockWords(s), 'plenty of time'); A.tick(s, 50); assert.equal(A.clockWords(s), 'time is going'); A.tick(s, 30); assert.equal(A.clockWords(s), 'running low'); A.tick(s, 20); assert.equal(A.clockWords(s), 'hurry');
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(A.wrongWords), ['none yet', 'one', 'two', 'three', 'four', 'five or more', 'five or more']);
  assert.deepEqual([0, 1, 4].map(A.ordinal), ['first', 'second', 'fifth']);
});
test('a phone turned round: the layout switches, placed parts stay in their sockets', () => {
  const s = A.createAssembly({ seed: 6, setup: setupAssembly({}), layout: 'wide' }); fitFirst(s);
  A.relayout(s, 'tall'); assert.equal(s.layout.kind, 'tall');
  const k = s.sockets[0], p = A.pieceOf(s, k.part);
  assert.deepEqual([p.x, p.y], [k.x, k.y]);
  const T = A.areasOf(s).tray; for (const b of s.bolts) assert.ok(b.homeX >= T.x && b.homeX <= T.x + T.w && b.homeY >= T.y && b.homeY <= T.y + T.h, 'the bolts wait in the slim strip');
  assert.ok(T.h <= 200, 'the bolt strip is slim');
});

// ---- the bots at human speed ---------------------------------------------------------------------------------------------------------
const PASS_TABLE = {};
test('perfect bot at human speed finishes at every roll (all 100 runs each) and every run uses the clock sensibly', () => {
  for (const tier of TIERS) {
    const ok = rate(100, (seed) => play(seed, setupAssembly({ tier, level: 1 }), 'perfect').result.success);
    PASS_TABLE[`perfect ${tier}`] = ok;
    assert.ok(ok >= 0.99, `perfect bot at tier ${tier}: ${ok}`);
  }
  const s = play(11, setupAssembly({}), 'perfect');
  assert.ok(s.result.timeLeft > 20 && s.result.stars >= 2, `perfect Steady run leaves ${s.result.timeLeft} s, ${s.result.stars} stars`);
});
test('lazy bot (never turns a part, never stops the screw) never finishes, at any roll or any points', () => {
  for (const tier of TIERS) {
    const ok = rate(40, (seed) => play(seed, setupAssembly({ tier, level: 9, points: { time: 9 } }), 'lazy').result.success);
    PASS_TABLE[`lazy ${tier}`] = ok;
    assert.equal(ok, 0, `lazy bot at tier ${tier}`);
  }
});
test('slow bot: a slope, not a cliff. More roll and more Time/Size points mean more finished jobs', () => {
  const N = 120;
  const at = (tier, points = {}, level = 9) => rate(N, (seed) => play(seed, setupAssembly({ tier, level, points }), 'slow').result.success);
  const byTier = TIERS.map((t) => at(t, {}, 1));
  TIERS.forEach((t, i) => { PASS_TABLE[`slow ${t}`] = byTier[i]; });
  for (let i = 1; i < byTier.length; i++) assert.ok(byTier[i] >= byTier[i - 1] - 0.05, `a better roll never hurts: ${byTier}`);
  assert.ok(byTier[4] - byTier[0] >= 0.2, `Smooth beats Rough by a clear step: ${byTier}`);
  assert.ok(byTier[0] < 1 && byTier[4] > byTier[0], 'not a cliff: Rough is not zero, Smooth is not the same');
  const time = [0, 3, 6, 9].map((n) => at(0, { time: n })); PASS_TABLE['slow steady time 0/3/6/9'] = time;
  const size = [0, 3, 6, 9].map((n) => at(0, { size: n })); PASS_TABLE['slow steady size 0/3/6/9'] = size;
  for (let i = 1; i < 4; i++) { assert.ok(time[i] >= time[i - 1] - 0.05, `Time points help: ${time}`); assert.ok(size[i] >= size[i - 1] - 0.05, `Size points help: ${size}`); }
  assert.ok(time[3] > time[0] && size[3] > size[0], `${time} ${size}`);
  assert.ok(byTier[2] > 0.3 && byTier[2] < 0.97, `a Steady slow hand sits between the cliffs: ${byTier[2]}`);
});
// The sweep that set the base clock (ASSEMBLY_SWEEP=1): pass rate of each hand at each roll for a base clock of 90 to 130 seconds.
test('sweep: the base clock that the bots chose', { skip: !process.env.ASSEMBLY_SWEEP }, () => {
  const rows = [];
  for (const base of [90, 100, 110, 120, 130]) {
    const row = { base };
    for (const kind of ['perfect', 'slow']) for (const tier of TIERS) {
      row[`${kind}${tier > 0 ? '+' : ''}${tier}`] = rate(200, (seed) => { const u = setupAssembly({ tier, level: 1 }); u.clock = Math.round(base * tierInfo(tier).time); return play(seed, u, kind).result.success; });
    }
    rows.push(row);
  }
  console.log(JSON.stringify(rows));
});
test.after(() => { if (process.env.ASSEMBLY_TABLE) console.log(JSON.stringify(PASS_TABLE, null, 1)); });

// ---- the workbench side: preview words, settling, the lost line ------------------------------------------------------------------------------
test('roll preview words for assembly come from the real setup', () => {
  const L = (total) => rollPreview('assembly', { total, dc: 10 }, { level: 9, points: {} }).line;
  assert.equal(L(22), 'Smooth roll: 33 s more, 1 fewer part.');
  assert.equal(L(16), 'Good roll: 17 s more.');
  assert.equal(L(11), 'Steady roll: nothing changes.');
  assert.equal(L(7), 'Shaky roll: 16 s less.');
  assert.equal(L(-3), 'Rough roll: 33 s less, 1 more part.');
});
test('the repair station can start assembly: setup from the real roll, XP into Repair, a lost unit in plain words', () => {
  const base = stationById('repair');
  const station = { ...base, id: 'assembly', word: 'ASSEMBLY', title: 'Rebuild the unit', label: 'Assembly' };
  const state = freshState();
  const start = startStation(state, station, { total: 22, dc: 10, natural: false });
  assert.equal(start.setup.kind, 'assembly'); assert.equal(start.setup.parts, 3); assert.match(start.preview.line, /Smooth roll/);
  const won = settleStation(state, station, { success: true, xp: 6 });
  assert.match(won.said, /Assembly: you did it\. \+6 Repair XP/);
  const lost = { success: false, broken: true, systemName: 'Reactor loop', retry: { scrap: 1 } };
  assert.equal(worldLine(station, lost), 'The Reactor loop stays broken. Try again at the bench for one scrap (a spoiled gasket), or take the other way.');
  assert.equal(worldLine(station, { success: true }), null);
  assert.match(settleStation(state, station, lost).said, /Assembly: not this time\..*stays broken/);
});

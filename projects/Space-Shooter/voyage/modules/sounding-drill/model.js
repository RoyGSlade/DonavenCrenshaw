// Sounding drill: the pure rules. Seeded, no DOM, no clock, no Math.random; time comes in as `dt`.
// The rock is a grid of 8-unit cells. A drill bit chases a target point, cuts a tunnel, spends a power cell, heats up, and sends
// a ring out every "bite" of travel. Rings light the rock's features (veins, hollows, finds) for a while; then they go dark again.
// Every number below is a placeholder from the brief until a real hand says otherwise.
import { hashSeed, roller } from './rng.js';

export const TIERS = Object.freeze([-2, -1, 0, 1, 2]);
export const PATHS = Object.freeze(['awareness', 'inspection', 'trace']);
export const POINT_MAX = 9;

/** The shared tier numbers (copied from minigames/setup.js: time x), plus this game's own: hard veins by roll. */
export const TIER = Object.freeze({
  '-2': Object.freeze({ time: 0.70, veins: 3, label: 'Rough' }),
  '-1': Object.freeze({ time: 0.85, veins: 2, label: 'Shaky' }),
  '0': Object.freeze({ time: 1.00, veins: 2, label: 'Steady' }),
  '1': Object.freeze({ time: 1.15, veins: 1, label: 'Good' }),
  '2': Object.freeze({ time: 1.30, veins: 1, label: 'Smooth' }),
});
export const tierOf = (tier) => Math.max(-2, Math.min(2, Math.trunc(tier) || 0));
export const tierInfo = (tier) => TIER[String(tierOf(tier))];

export const BASE = Object.freeze({
  cell: 8,                    // grid cell, board units
  tunnel: 36,                 // tunnel width
  speed: Object.freeze({ soft: 85, vein: 30, open: 150 }),   // units a second
  bite: 60,                   // travel between rings
  reach: 170, reachTime: 0.6, // ring reach and the time it takes to get there
  hold: 1.5, fade: 1.0,       // how long a lit thing stays lit, then fades
  listenReach: 1.6, listenTime: 1.2, listenCost: 0.04, listenAfter: 0.5, stillRadius: 14,
  heat: Object.freeze({ vein: 30, soft: 6, openCool: 12, cool: 25, seizeAt: 100, seizeTime: 2, after: 40 }),
  charge: 1060, veinCost: 2,  // charge in units of soft tunnel; a vein costs double
  coreMin: 28, coreMax: 46, shell: 34, freedAt: 0.70,
  shatter: 3, crackPad: 4, crackCool: 1.3,
  quickCharge: 0.6, maxTurns: 2,
  sizeScale: Object.freeze({ small: 0.62, medium: 0.82, large: 1.0 }),
  gradeMain: 60, gradeClean: 20, gradeOneCrack: 10, gradeBonus: 10,
});

// Terrain kinds and feature codes (what a ring can light).
export const K = Object.freeze({ OUT: 0, SOFT: 1, VEIN: 2, HOLLOW: 3 });
export const F = Object.freeze({ NONE: 0, VEIN: 1, HOLLOW: 2, EDGE: 3, CORE: 4, SHELL: 5 });

export function cleanPoints(points) {
  const out = {};
  for (const p of PATHS) out[p] = Math.max(0, Math.min(POINT_MAX, Math.trunc(points?.[p]) || 0));
  return out;
}

/** What a roll and the points do to the game (all in one place so tests and the view agree). */
export function rulesFor({ tier = 0, points = {}, quick = false, board = { w: 1000, h: 760 } } = {}) {
  const t = tierOf(tier);
  const info = tierInfo(t);
  const p = cleanPoints(points);
  const sizeK = (board.w + board.h) / 1700;   // a wide board is 1000 x 760
  const u = board.w / 1000;                   // a narrower (phone) board sees proportionally less far
  return {
    tier: t, label: info.label, points: p, quick: !!quick,
    charge: BASE.charge * info.time * sizeK * (quick ? BASE.quickCharge : 1),
    reach: BASE.reach * u * (1 + 0.1 * t) * (1 + 0.05 * p.awareness),
    reachTime: BASE.reachTime,
    hold: BASE.hold + 0.25 * p.inspection,
    fade: BASE.fade,
    shellShown: p.inspection >= 4,
    afterglow: 0.05 * p.trace,
    veins: info.veins,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The rock

const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dist2seg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  const qx = ax + u * dx, qy = ay + u * dy;
  return { d: Math.hypot(px - qx, py - qy), u };
};

/** The rock outline is an ellipse bent by three harmonics: r(theta) multiplies the ellipse radius. */
function outlineR(rock, theta) {
  const o = rock.outline;
  return 1 + o.a1 * Math.sin(2 * theta + o.p1) + o.a2 * Math.sin(3 * theta + o.p2) + o.a3 * Math.sin(5 * theta + o.p3);
}
export function insideRock(rock, x, y) {
  const nx = (x - rock.cx) / rock.rx, ny = (y - rock.cy) / rock.ry;
  const r = outlineR(rock, Math.atan2(ny, nx));
  return nx * nx + ny * ny <= r * r;
}
/** The point on the rim for a given angle (the entry sits there). */
export function rimPoint(rock, theta) {
  const r = outlineR(rock, theta);
  return { x: rock.cx + rock.rx * r * Math.cos(theta), y: rock.cy + rock.ry * r * Math.sin(theta) };
}

/** Pick the rock's content record: from the host (ctx.context.rock) or rolled from the seed out of the fixtures. */
export function pickRock({ seed = 1, quick = false, rock = null, fixtures = {} } = {}) {
  let rec = rock;
  if (!rec?.finds?.length) {
    const list = fixtures.rocks || [];
    const r = roller({ rng: hashSeed('sounding-drill', 'pick', seed) });
    rec = list.length ? list[Math.floor(r.next() * list.length)] : { size: 'medium', finds: [{ item: 'find', kind: 'ore', main: true }] };
  }
  let finds = rec.finds.map((f) => ({ ...f }));
  if (!finds.some((f) => f.main)) finds[0].main = true;
  let size = rec.size || 'medium';
  if (quick) {
    finds = [finds.find((f) => f.main)];
    size = 'small';
  }
  finds = finds.slice(0, 3);
  return { size, finds };
}

/** Build the geology. Same seed and board, same finds, whatever the tier: veins are generated as three and sliced by the roll. */
export function makeRock({ seed = 1, board = { w: 1000, h: 760 }, quick = false, rock = null, fixtures = {}, items = null, veins = 2 } = {}) {
  const rec = pickRock({ seed, quick, rock, fixtures });
  const itemMap = items || fixtures.items || {};
  const W = board.w, H = board.h, cell = BASE.cell;
  const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
  const rnd = roller({ rng: hashSeed('sounding-drill', 'rock', seed, Math.round(W), Math.round(H), rec.size, rec.finds.length) });
  const s = BASE.sizeScale[rec.size] ?? 0.82;
  const R = {
    W, H, gw, gh, cell, size: rec.size,
    cx: W / 2, cy: H / 2, rx: (W / 2 - 26) * s, ry: (H / 2 - 26) * s,
    outline: { a1: 0.05 + rnd.next() * 0.04, p1: rnd.next() * 6.28, a2: 0.03 + rnd.next() * 0.03, p2: rnd.next() * 6.28, a3: 0.015 + rnd.next() * 0.02, p3: rnd.next() * 6.28 },
    entryAngle0: rnd.next() * 6.28,
    finds: [], veins: [], hollows: [],
  };
  const bend = 1 + R.outline.a1 + R.outline.a2 + R.outline.a3;   // the rim never leaves the board
  R.rx /= bend; R.ry /= bend;
  const margin = (r) => r + BASE.shell + 24;
  const okInside = (x, y, m) => insideRock(R, x, y) && insideRock(R, x + m, y) && insideRock(R, x - m, y) && insideRock(R, x, y + m) && insideRock(R, x, y - m);
  const entry0 = rimPoint(R, R.entryAngle0);
  const sizes = { ore: [38, 46], gem: [28, 36], relic: [36, 44], oddity: [32, 44] };

  // The main find first: far side of the rock from the first entry, so the way in is a real trip.
  const place = (rec1, isMain, tries = 80) => {
    const [lo, hi] = sizes[rec1.kind] || [BASE.coreMin, BASE.coreMax];
    const r = Math.round(lo + rnd.next() * (hi - lo));
    let best = null;
    for (let i = 0; i < tries; i++) {
      let x, y;
      if (isMain) {
        // somewhere across the rock from the first entry: 0.36 to 0.62 of the rock's width away (out of the first ring's reach)
        const toC = Math.atan2(R.cy - entry0.y, R.cx - entry0.x), a = toC + (rnd.next() - 0.5) * 1.9;
        const dd = (0.36 + rnd.next() * 0.26) * 2 * Math.sqrt(R.rx * R.ry);
        x = entry0.x + Math.cos(a) * dd; y = entry0.y + Math.sin(a) * dd;
      } else {
        const a = rnd.next() * 6.28, f = 0.25 + rnd.next() * 0.65;
        x = R.cx + Math.cos(a) * R.rx * f; y = R.cy + Math.sin(a) * R.ry * f;
      }
      if (!okInside(x, y, margin(r))) continue;
      let good = true;
      for (const o of R.finds) if (Math.hypot(o.x - x, o.y - y) < o.r + r + 2 * BASE.shell + 70) good = false;
      const de = Math.hypot(entry0.x - x, entry0.y - y), diam = 2 * Math.sqrt(R.rx * R.ry);
      if (isMain ? (de < 0.36 * diam || de > 0.62 * diam) : de < 170) good = false;
      if (good) { best = { x, y }; break; }
      if (!best) best = { x, y, bad: true };
    }
    const it = itemMap[rec1.item] || {};
    R.finds.push({
      item: rec1.item, kind: rec1.kind, main: !!isMain, x: best.x, y: best.y, r,
      colour: it.colour || ({ ore: '#d0a070', gem: '#6fc3ff', relic: '#ffb36b', oddity: '#e6a8ff' })[rec1.kind] || '#ffffff',
      rot: rnd.next() * 6.28, facets: 5 + Math.floor(rnd.next() * 3),
      cracks: 0, seen: false, lit: -1e9, share: 0, connected: false, shells: null,
    });
  };
  const main = rec.finds.find((f) => f.main);
  place(main, true);
  for (const f of rec.finds) if (f !== main) place(f, false);

  // Hollows: one or two soft voids, away from the finds and the entry.
  const nHol = 1 + Math.floor(rnd.next() * 2);
  for (let i = 0; i < nHol; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const rad = 46 + rnd.next() * 36;
      const a = rnd.next() * 6.28, f = 0.15 + rnd.next() * 0.6;
      const x = R.cx + Math.cos(a) * R.rx * f, y = R.cy + Math.sin(a) * R.ry * f;
      if (!okInside(x, y, rad + 20)) continue;
      if (Math.hypot(x - entry0.x, y - entry0.y) < rad + 140) continue;
      if (R.finds.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + BASE.shell + rad + 24)) continue;
      if (R.hollows.some((o) => Math.hypot(o.x - x, o.y - y) < o.rad + rad + 30)) continue;
      R.hollows.push({ x, y, rad, ry: rad * (0.6 + rnd.next() * 0.3), rot: rnd.next() * 3.14, ph: rnd.next() * 6.28 });
      break;
    }
  }

  // Veins: three candidates across the way from entry to main find; the roll keeps the first `veins`.
  // Every rock has three on file: if the careful placement finds no room, the checks relax a step at a time.
  const mf = R.finds[0];
  const pathA = entry0, pathB = { x: mf.x, y: mf.y };
  const fr = [0.3 + rnd.next() * 0.1, 0.5 + rnd.next() * 0.1, 0.7 + rnd.next() * 0.08];
  for (let i = 0; i < 3; i++) {
    let made = null;
    for (let tries = 0; tries < 160 && !made; tries++) {
      const relax = tries < 60 ? 0 : tries < 110 ? 1 : 2;
      const f = tries < 30 ? fr[i] + (rnd.next() - 0.5) * 0.1 : rnd.next();
      const px = pathA.x + (pathB.x - pathA.x) * f, py = pathA.y + (pathB.y - pathA.y) * f;
      const dir = Math.atan2(pathB.y - pathA.y, pathB.x - pathA.x) + Math.PI / 2 + (rnd.next() - 0.5) * (relax ? 3 : 1.2);
      const half = (110 + rnd.next() * 90) * Math.max(0.7, s) * (relax === 2 ? 0.6 : 1), w = 44 + rnd.next() * 22;
      const off = (rnd.next() - 0.5) * (relax ? 260 : 150);
      const cx = px + Math.cos(dir + Math.PI / 2) * off, cy = py + Math.sin(dir + Math.PI / 2) * off;
      const v = { ax: cx - Math.cos(dir) * half, ay: cy - Math.sin(dir) * half, bx: cx + Math.cos(dir) * half, by: cy + Math.sin(dir) * half, w, ph: rnd.next() * 6.28 };
      if (!insideRock(R, cx, cy)) continue;
      if (R.finds.some((o) => dist2seg(o.x, o.y, v.ax, v.ay, v.bx, v.by).d < o.r + BASE.shell + w / 2 + (relax === 2 ? 4 : 14))) continue;
      if (R.hollows.some((o) => dist2seg(o.x, o.y, v.ax, v.ay, v.bx, v.by).d < o.rad + w / 2 + 10)) continue;
      if (dist2seg(entry0.x, entry0.y, v.ax, v.ay, v.bx, v.by).d < w / 2 + (relax ? 30 : 60)) continue;
      made = v;
    }
    if (made) R.veins.push(made);
  }
  R.veinsAll = R.veins;
  R.veins = R.veinsAll.slice(0, Math.max(0, veins));

  // The grid.
  const n = gw * gh;
  R.kind = new Uint8Array(n); R.feat = new Uint8Array(n); R.findAt = new Int8Array(n).fill(-1);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = (gx + 0.5) * cell, y = (gy + 0.5) * cell, c = gy * gw + gx;
      if (!insideRock(R, x, y)) continue;
      R.kind[c] = K.SOFT;
      for (const v of R.veins) {
        const q = dist2seg(x, y, v.ax, v.ay, v.bx, v.by);
        if (q.d <= (v.w / 2) * (1 + 0.28 * Math.sin(q.u * 9 + v.ph))) { R.kind[c] = K.VEIN; R.feat[c] = F.VEIN; }
      }
      for (const h of R.hollows) {
        const cs = Math.cos(h.rot), sn = Math.sin(h.rot), dx = x - h.x, dy = y - h.y;
        const u = (dx * cs + dy * sn) / h.rad, v2 = (-dx * sn + dy * cs) / h.ry;
        const ang = Math.atan2(v2, u);
        const lim = 1 + 0.12 * Math.sin(3 * ang + h.ph);
        if (u * u + v2 * v2 <= lim * lim) { R.kind[c] = K.HOLLOW; R.feat[c] = F.HOLLOW; }
      }
    }
  }
  // hollow edges
  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      const c = gy * gw + gx;
      if (R.kind[c] !== K.HOLLOW) continue;
      if (R.kind[c - 1] !== K.HOLLOW || R.kind[c + 1] !== K.HOLLOW || R.kind[c - gw] !== K.HOLLOW || R.kind[c + gw] !== K.HOLLOW) R.feat[c] = F.EDGE;
    }
  }
  // finds: core (solid) and shell
  R.finds.forEach((f, i) => {
    f.shells = [];
    const reach = f.r + BASE.shell + cell;
    for (let gy = Math.max(0, Math.floor((f.y - reach) / cell)); gy <= Math.min(gh - 1, Math.floor((f.y + reach) / cell)); gy++) {
      for (let gx = Math.max(0, Math.floor((f.x - reach) / cell)); gx <= Math.min(gw - 1, Math.floor((f.x + reach) / cell)); gx++) {
        const c = gy * gw + gx;
        if (R.kind[c] === K.OUT) continue;
        const d = Math.hypot((gx + 0.5) * cell - f.x, (gy + 0.5) * cell - f.y);
        if (d <= f.r) { R.feat[c] = F.CORE; R.findAt[c] = i; if (R.kind[c] !== K.SOFT) R.kind[c] = K.SOFT; }
        else if (d <= f.r + BASE.shell && R.feat[c] !== F.CORE) {
          if (R.findAt[c] < 0) { R.feat[c] = F.SHELL; R.findAt[c] = i; }
        }
      }
    }
    // shell cell list (cells whose findAt is this find and feat is SHELL), after all finds are stamped
  });
  R.finds.forEach((f, i) => { f.shells = []; });
  for (let c = 0; c < n; c++) if (R.feat[c] === F.SHELL) R.finds[R.findAt[c]].shells.push(c);
  // cells a ring can light
  const fc = [];
  for (let c = 0; c < n; c++) if (R.feat[c] !== F.NONE) fc.push(c);
  R.featCells = Int32Array.from(fc);
  R.itemMap = itemMap;
  return R;
}

// ---------------------------------------------------------------------------------------------------------------------
// The game

/** Start a game. `resume` (a previous result's `resume`) brings back old tunnels, cracks and the turn count. */
export function createGame({ seed = 1, tier = 0, points = {}, quick = false, board = { w: 1000, h: 760 }, rock = null, items = null, fixtures = {}, resume = null } = {}) {
  const rules = rulesFor({ tier, points, quick, board });
  const R = makeRock({ seed, board, quick, rock, fixtures, items, veins: rules.veins });
  const n = R.gw * R.gh;
  const g = {
    seed, rules, rock: R, board,
    t: 0, turned: 0, entryAngle: R.entryAngle0,
    cut: new Uint8Array(n), litAt: new Float32Array(n).fill(-1e9), seen: new Uint8Array(n), conn: new Uint8Array(n),
    bit: { x: 0, y: 0 }, heat: 0, seizeLeft: 0, charge: rules.charge, chargeMax: rules.charge,
    travel: 0, stillT: 0, crackCool: 0, rings: [], events: [], over: null, connT: 0, cutDirty: true,
    entry: { x: 0, y: 0 }, lastInput: { x: 0, y: 0, down: false }, frontKind: K.SOFT, drilling: false, moving: false, dustN: 0,
    attempts: 0,
  };
  if (resume) {
    g.turned = Math.max(0, Math.trunc(resume.turned) || 0);
    g.entryAngle = R.entryAngle0 + g.turned * (Math.PI / 2);
    if (Array.isArray(resume.cut) && resume.cut.length === R.gh) {
      resume.cut.forEach((row, gy) => { for (let gx = 0; gx < R.gw; gx++) if (row[gx] === '1') g.cut[gy * R.gw + gx] = 1; });
    }
    (resume.cracks || []).forEach((k, i) => { if (R.finds[i]) R.finds[i].cracks = Math.max(0, Math.min(BASE.shatter, k | 0)); });
    (resume.seen || []).forEach((k, i) => { if (R.finds[i]) R.finds[i].seen = !!k; });
  }
  beginAttempt(g);
  return g;
}

function beginAttempt(g) {
  const R = g.rock, rim = rimPoint(R, g.entryAngle);
  // step a little inside the rim
  const ix = rim.x + (R.cx - rim.x) * 0.03, iy = rim.y + (R.cy - rim.y) * 0.03;
  g.entry = { x: rim.x, y: rim.y, angle: g.entryAngle };
  g.bit = { x: ix, y: iy };
  g.heat = 0; g.seizeLeft = 0; g.charge = g.chargeMax; g.travel = 0; g.stillT = 0; g.rings = []; g.over = null; g.attempts += 1;
  g.litAt.fill(-1e9);
  stamp(g, g.bit.x, g.bit.y, true);
  stamp(g, rim.x + (R.cx - rim.x) * 0.012, rim.y + (R.cy - rim.y) * 0.012, true);
  g.entryCell = cellIndex(R, g.bit.x, g.bit.y);
  emit(g, g.bit.x, g.bit.y, g.rules.reach, g.rules.reachTime, 'intro');
  computeConn(g);
}

export const cellIndex = (R, x, y) => {
  const gx = Math.floor(x / R.cell), gy = Math.floor(y / R.cell);
  if (gx < 0 || gy < 0 || gx >= R.gw || gy >= R.gh) return -1;
  return gy * R.gw + gx;
};

export function terrainAt(g, x, y) {
  const c = cellIndex(g.rock, x, y);
  if (c < 0) return K.OUT;
  return g.rock.kind[c];
}
export const isOpen = (g, c) => g.cut[c] === 1 || g.rock.kind[c] === K.HOLLOW;

/** Cut a disc out of the rock. Returns the cost in charge (soft = area / tunnel width; vein double). */
function stamp(g, x, y, free = false) {
  const R = g.rock, cell = R.cell, rad = BASE.tunnel / 2;
  let soft = 0, vein = 0;
  const gx0 = Math.max(0, Math.floor((x - rad) / cell)), gx1 = Math.min(R.gw - 1, Math.floor((x + rad) / cell));
  const gy0 = Math.max(0, Math.floor((y - rad) / cell)), gy1 = Math.min(R.gh - 1, Math.floor((y + rad) / cell));
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const c = gy * R.gw + gx;
      if (g.cut[c] || R.kind[c] === K.OUT || R.kind[c] === K.HOLLOW || R.feat[c] === F.CORE) continue;
      const dx = (gx + 0.5) * cell - x, dy = (gy + 0.5) * cell - y;
      if (dx * dx + dy * dy > rad * rad) continue;
      g.cut[c] = 1; g.cutDirty = true;
      if (R.kind[c] === K.VEIN) vein++; else soft++;
    }
  }
  const area = cell * cell / BASE.tunnel;
  return free ? 0 : (soft + vein * BASE.veinCost) * area;
}

/** Send a ring: every feature cell inside `reach` is lit when the ring arrives (bucketed by arrival time). */
function emit(g, x, y, reach, dur, kind = 'bite') {
  const R = g.rock, fc = R.featCells, NB = 32;
  const counts = new Int32Array(NB + 1);
  const r2 = reach * reach, cell = R.cell;
  const tmpB = new Uint8Array(fc.length), keep = new Uint8Array(fc.length);
  let total = 0;
  for (let i = 0; i < fc.length; i++) {
    const c = fc[i], cx = (c % R.gw + 0.5) * cell - x, cy = (((c / R.gw) | 0) + 0.5) * cell - y;
    const d2 = cx * cx + cy * cy;
    if (d2 > r2) continue;
    const b = Math.min(NB - 1, Math.floor(Math.sqrt(d2) / reach * NB));
    tmpB[i] = b; keep[i] = 1; counts[b + 1]++; total++;
  }
  for (let b = 0; b < NB; b++) counts[b + 1] += counts[b];
  const cells = new Int32Array(total), pos = counts.slice();
  for (let i = 0; i < fc.length; i++) if (keep[i]) cells[pos[tmpB[i]]++] = fc[i];
  g.rings.push({ x, y, t0: g.t, reach, dur, kind, offs: counts, cells, nextB: 0, tinked: new Set() });
  g.events.push({ type: kind === 'listen' ? 'listen' : 'ping', x, y, reach, dur });
}

function advanceRings(g) {
  const R = g.rock, NB = 32;
  for (let i = g.rings.length - 1; i >= 0; i--) {
    const ring = g.rings[i], age = g.t - ring.t0;
    const target = Math.min(NB - 1, Math.floor(age / ring.dur * NB));
    while (ring.nextB <= target) {
      const b = ring.nextB, arrival = ring.t0 + (b + 0.5) / NB * ring.dur;
      for (let k = ring.offs[b]; k < ring.offs[b + 1]; k++) {
        const c = ring.cells[k];
        if (arrival > g.litAt[c]) g.litAt[c] = arrival;
        g.seen[c] = 1;
        if (R.feat[c] === F.CORE) {
          const fi = R.findAt[c], f = R.finds[fi];
          f.lit = arrival;
          if (!f.seen) { f.seen = true; g.events.push({ type: 'found', find: fi }); }
          if (!ring.tinked.has(fi)) { ring.tinked.add(fi); g.events.push({ type: 'tink', find: fi, kind: f.kind, d: Math.hypot(f.x - ring.x, f.y - ring.y) }); }
        }
      }
      ring.nextB++;
    }
    if (age > ring.dur + 1.0) g.rings.splice(i, 1);
  }
}

/** How lit a cell is right now, 0..1: full for `hold`, then fading over `fade`, with an afterglow floor for what you have seen. */
export function lightOf(g, c) {
  const age = g.t - g.litAt[c];
  const r = g.rules;
  let i = 0;
  if (age >= 0) i = age <= r.hold ? 1 : age <= r.hold + r.fade ? 1 - (age - r.hold) / r.fade : 0;
  if (g.seen[c] && r.afterglow > i) i = r.afterglow;
  return i;
}
export function findLight(g, f) {
  const age = g.t - f.lit, r = g.rules;
  let i = 0;
  if (age >= 0) i = age <= r.hold ? 1 : age <= r.hold + r.fade ? 1 - (age - r.hold) / r.fade : 0;
  if (f.seen && r.afterglow > i) i = r.afterglow;
  return i;
}

/** Cells joined to the entry by open ground (tunnel or hollow). */
export function computeConn(g) {
  const R = g.rock, { gw, gh } = R, conn = g.conn;
  conn.fill(0);
  const stack = [g.entryCell];
  conn[g.entryCell] = 1;
  while (stack.length) {
    const c = stack.pop(), gx = c % gw, gy = (c / gw) | 0;
    if (gx > 0) tryN(c - 1); if (gx < gw - 1) tryN(c + 1); if (gy > 0) tryN(c - gw); if (gy < gh - 1) tryN(c + gw);
  }
  function tryN(c) { if (!conn[c] && isOpen(g, c) && R.kind[c] !== K.OUT) { conn[c] = 1; stack.push(c); } }
  for (const f of R.finds) {
    let k = 0;
    for (const c of f.shells) if (conn[c] && g.cut[c]) k++;
    f.share = f.shells.length ? k / f.shells.length : 0;
    f.connected = k > 0;
  }
  g.connT = g.t; g.cutDirty = false;
}

export const isFreed = (f) => f.share >= BASE.freedAt && f.cracks < BASE.shatter;

/** One tick. `input` = { x, y, down } in board units (the target the bit chases). */
export function step(g, dt, input = {}) {
  if (g.over) return;
  const R = g.rock, rules = g.rules;
  g.t += dt;
  g.crackCool = Math.max(0, g.crackCool - dt);
  g.lastInput = { x: input.x ?? g.bit.x, y: input.y ?? g.bit.y, down: !!input.down };
  g.drilling = false; g.moving = false;
  const H = BASE.heat;

  if (g.seizeLeft > 0) {
    g.seizeLeft -= dt;
    if (g.seizeLeft <= 0) { g.seizeLeft = 0; g.heat = H.after; g.events.push({ type: 'unseize' }); }
    advanceRings(g);
    return;
  }

  const down = !!input.down && g.charge > 0;
  const tx = input.x ?? g.bit.x, ty = input.y ?? g.bit.y;
  const dx = tx - g.bit.x, dy = ty - g.bit.y, L = Math.hypot(dx, dy);
  let cooling = true;

  if (down && L <= BASE.stillRadius) {
    // holding still: after half a second, listen
    g.stillT += dt;
    if (g.stillT >= BASE.listenAfter && g.charge >= g.chargeMax * BASE.listenCost) {
      g.charge -= g.chargeMax * BASE.listenCost;
      emit(g, g.bit.x, g.bit.y, rules.reach * BASE.listenReach, BASE.listenTime, 'listen');
      g.stillT = 0;
    }
  } else g.stillT = 0;

  if (down && L > BASE.stillRadius) {
    const ux = dx / L, uy = dy / L;
    const pd = BASE.tunnel / 2 + 6;   // look just past the tunnel's own edge
    const probe = terrainAt(g, g.bit.x + ux * pd, g.bit.y + uy * pd);
    const pc = cellIndex(R, g.bit.x + ux * pd, g.bit.y + uy * pd);
    const solidAhead = pc >= 0 && !isOpen(g, pc);
    g.frontKind = probe === K.OUT ? K.SOFT : (solidAhead ? probe : K.HOLLOW);
    const v = solidAhead ? (probe === K.VEIN ? BASE.speed.vein : BASE.speed.soft) : BASE.speed.open;
    const s = Math.min(v * dt, L);
    let nx = g.bit.x + ux * s, ny = g.bit.y + uy * s;
    // stay inside the rock; slide along the rim
    if (terrainAt(g, nx, ny) === K.OUT) {
      if (terrainAt(g, nx, g.bit.y) !== K.OUT) ny = g.bit.y;
      else if (terrainAt(g, g.bit.x, ny) !== K.OUT) nx = g.bit.x;
      else { nx = g.bit.x; ny = g.bit.y; }
    }
    // finds are solid: touching one cracks it
    for (let i = 0; i < R.finds.length; i++) {
      const f = R.finds[i], lim = f.r + BASE.crackPad, d = Math.hypot(nx - f.x, ny - f.y);
      if (d < lim) {
        if (g.crackCool <= 0 && f.cracks < BASE.shatter) {
          f.cracks++; g.crackCool = BASE.crackCool;
          g.events.push({ type: 'crack', find: i, cracks: f.cracks, x: nx, y: ny });
          if (f.cracks >= BASE.shatter) g.events.push({ type: 'shatter', find: i });
        }
        const k = d || 1; nx = f.x + (nx - f.x) / k * lim; ny = f.y + (ny - f.y) / k * lim;
      }
    }
    const mv = Math.hypot(nx - g.bit.x, ny - g.bit.y);
    if (mv > 1e-6) {
      g.bit.x = nx; g.bit.y = ny; g.moving = true;
      const cost = stamp(g, nx, ny);
      g.charge -= cost;
      if (cost > 0 || solidAhead) {
        g.drilling = true;
        g.heat += (g.frontKind === K.VEIN ? H.vein : H.soft) * dt; cooling = false;
        if (g.frontKind === K.VEIN) g.events.push({ type: 'grind' });
      } else { g.heat = Math.max(0, g.heat - H.openCool * dt); cooling = false; }
      g.travel += mv;
      while (g.travel >= BASE.bite) { g.travel -= BASE.bite; emit(g, g.bit.x, g.bit.y, rules.reach, rules.reachTime); }
    }
  }
  if (cooling) g.heat = Math.max(0, g.heat - H.cool * dt);
  if (g.heat >= H.seizeAt) { g.heat = H.seizeAt; g.seizeLeft = H.seizeTime; g.events.push({ type: 'seize' }); }
  if (g.charge <= 0) { g.charge = 0; end(g, 'cell'); }
  if (R.finds[0].cracks >= BASE.shatter) end(g, 'shattered');
  advanceRings(g);
  if (g.cutDirty && g.t - g.connT >= 0.2) computeConn(g);
}

function end(g, why) { if (!g.over) { computeConn(g); g.over = { why }; g.events.push({ type: 'over', why }); } }
/** "Bring the claw": the player ends the attempt. */
export function claw(g) { end(g, 'claw'); }

export function drain(g) { const e = g.events; g.events = []; return e; }

/** Plain-word state for the HUD (no digits). */
export function words(g) {
  const R = g.rock, r = g.rules;
  if (g.over) return g.over.why === 'cell' ? "the cell's spent" : g.over.why === 'shattered' ? 'it shattered' : 'claw coming down';
  if (g.seizeLeft > 0) return 'seized: let it cool';
  let nearest = 1e9;
  for (const f of R.finds) if (f.cracks < BASE.shatter) nearest = Math.min(nearest, Math.hypot(g.bit.x - f.x, g.bit.y - f.y) - f.r);
  if (nearest < BASE.crackPad + 26) return "careful: it's close";
  if (g.charge < g.chargeMax * 0.18) return "cell's low: wrap it up";
  if (g.heat > 72) return 'running hot: lift';
  if (g.moving && g.drilling && g.frontKind === K.VEIN) return 'hard vein: ease off';
  for (const f of R.finds) if (findLight(g, f) > 0.25) return 'something here';
  if (g.moving && !g.drilling) return 'open ground';
  if (g.moving) return 'soft going';
  return g.stillT > 0.15 ? 'listening' : 'press and drag';
}

/** How far the main find is from free, as a plain word and a 0..1 for a drawn meter. */
export function mainProgress(g) {
  const f = g.rock.finds[0];
  const share = Math.min(1, f.share / BASE.freedAt);
  const word = f.cracks >= BASE.shatter ? 'shattered' : share >= 1 ? 'free: bring the claw' : share > 0.6 ? 'nearly free' : share > 0.12 ? 'loosening' : f.seen ? 'still buried' : 'not found yet';
  return { share, word };
}

/** The numbers and records at the end of an attempt. */
export function resultOf(g) {
  computeConn(g);
  const R = g.rock, why = g.over?.why || 'claw';
  const main = R.finds[0];
  const freedAll = R.finds.map(isFreed);
  const success = isFreed(main);
  const cracksTotal = R.finds.reduce((a, f) => a + f.cracks, 0);
  const bonus = R.finds.slice(1);
  const bonusFreed = bonus.filter((f, i) => freedAll[i + 1]).length;
  const perfect = success && main.share >= 0.9 && cracksTotal === 0 && bonus.every((f) => f.seen);
  let grade = 0;
  if (success) grade = Math.min(100, Math.round(BASE.gradeMain * Math.min(1, main.share) + (cracksTotal === 0 ? BASE.gradeClean : cracksTotal === 1 ? BASE.gradeOneCrack : 0) + BASE.gradeBonus * bonusFreed));
  else grade = Math.round(30 * Math.min(1, main.share));
  const nFreed = freedAll.filter(Boolean).length;
  const xp = success ? Math.min(6, 2 + nFreed + (cracksTotal === 0 ? 1 : 0)) : 0;
  const rows = [];
  for (let gy = 0; gy < R.gh; gy++) {
    let s = '';
    for (let gx = 0; gx < R.gw; gx++) { const c = gy * R.gw + gx; s += (g.cut[c] || R.kind[c] === K.HOLLOW) ? '1' : '0'; }
    rows.push(s);
  }
  const cutRows = [];
  for (let gy = 0; gy < R.gh; gy++) { let s = ''; for (let gx = 0; gx < R.gw; gx++) s += g.cut[gy * R.gw + gx] ? '1' : '0'; cutRows.push(s); }
  const canTurn = !success && why !== 'shattered' && g.turned < BASE.maxTurns;
  return {
    done: true, success, grade, perfect, xp, why,
    finds: R.finds.map((f, i) => ({ item: f.item, kind: f.kind, freed: Math.round(f.share * 1000) / 1000, cracks: f.cracks, seen: f.seen, x: Math.round(f.x), y: Math.round(f.y), r: f.r, isFreed: freedAll[i] })),
    tunnel: { cell: R.cell, w: R.gw, h: R.gh, rows, entry: { x: Math.round(g.entry.x), y: Math.round(g.entry.y) }, board: { w: R.W, h: R.H } },
    chargeLeft: Math.round(g.charge / g.chargeMax * 1000) / 1000,
    turned: g.turned,
    canTurn,
    effects: success ? {} : { items: { scrap: 1 } },
    resume: { turned: g.turned, cut: cutRows, cracks: R.finds.map((f) => f.cracks), seen: R.finds.map((f) => f.seen) },
  };
}

/** A failed attempt that can be retried: turn the rock a quarter round; old tunnels and cracks stay; a fresh cell. */
export function turn(g) {
  if (!g.over || g.over.why === 'shattered' || g.turned >= BASE.maxTurns) return false;
  g.turned += 1;
  g.entryAngle = g.rock.entryAngle0 + g.turned * (Math.PI / 2);
  beginAttempt(g);
  g.events.push({ type: 'turned' });
  return true;
}

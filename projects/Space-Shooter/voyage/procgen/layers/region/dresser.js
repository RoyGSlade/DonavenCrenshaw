// The outdoor dresser (layer: biome region, simple version). Lays out a
// planet or moon landing site:
//   1. ground: a ragged rock rim, rock outcrops, texture patches (dunes, salt
//      flats, craters) from seeded noise; sealed-off floor is filled in;
//   2. the landing pad near the way in, landmarks spread far apart (best
//      candidate sampling), each facing the pad with its entrance kept clear;
//   3. paths from the entry to the pad and from the pad to every landmark,
//      two tiles wide, gently winding, kept clear for good;
//   4. working clutter beside the landmarks (crates, barrels, panels);
//   5. nature last: poisson-disk scatter in clusters (rocks, scrub, bones, a
//      wreck), each with its own size and turn so nothing looks stamped.
// Same hard guarantees and validator as rooms. Same input + seed = same area.
// Later layers (ROADMAP.md): a planet's biome map picks the biome and size,
// and a settlement layer claims plots before this scatter runs.

import { makeRng, makeNoise, rollCount } from '../../core/rng.js';
import { Grid, FLOOR, DOOR, ROCK } from '../../core/grid.js';
import { VEC, dirName, dirIndex, sideCells } from '../../core/orient.js';
import { gridChars, round4 } from '../../core/emit.js';
import { validateMap, assessMap } from '../../core/validate.js';

export const REGION_VERSION = 1;
const RES_FREE = -2, RES_KEEP = -1, RES_HARD = -3;
const SIDES = { n: 2, s: 0, w: 1, e: 3 }; // the side of the map an entry sits on -> inward is the opposite

export function dressArea(input, catalogs) {
  const biomeId = input.biome || 'desert';
  const B = catalogs.biomes.biomes[biomeId];
  if (!B) throw new Error(`dressArea: unknown biome ${biomeId}`);
  const seed = input.seed ?? 1;
  const density = Math.max(0, Math.min(1, input.density ?? 0.5));
  const densityMul = 0.5 + density;
  const rng = makeRng(seed, 'region', biomeId);
  // the ground (rim, outcrops, patches) has its own seed so "reroll" can keep the terrain
  const tseed = input.terrainSeed ?? seed;
  const trng = makeRng(tseed, 'region', biomeId);
  const [minW, minH] = B.size.min, [maxW, maxH] = B.size.max;
  const w = Math.round(input.w ?? trng.fork('size').int(minW, maxW));
  const h = Math.round(input.h ?? trng.fork('size', 'h').int(minH, maxH));
  if (w < 16 || h < 12 || w > 128 || h > 128) throw new Error(`dressArea: ${w}x${h} is out of range (16x12 .. 128x128)`);
  const g = new Grid(w, h);
  const S = { g, props: [], npcs: [], zones: [], targets: [], checks: 0 };

  // 1. ground ------------------------------------------------------------------
  const rim = makeNoise(tseed, 'rim', biomeId);
  const depthOf = (x, y) => Math.min(x, y, w - 1 - x, h - 1 - y);
  const bd = B.border?.depth ?? 3;
  g.forEach((x, y, i) => {
    const d = depthOf(x, y);
    const n = rim(x, y, B.border?.noise ?? 5);
    g.type[i] = d === 0 || (d < bd && n > 0.3 + d * 0.17) ? ROCK : FLOOR;
  });
  const entrySpecs = input.entries && input.entries.length ? input.entries : [{ id: 'shuttle', side: 'w', to: 'ship', arrive: 'from-dock', label: 'Back to your ship' }];
  const entries = entrySpecs.map((e, i) => carveEntry(g, e, i, bd));
  for (const e of entries) reserve(g, e.apron, RES_HARD);
  const crag = makeNoise(tseed, 'outcrops', biomeId);
  g.forEach((x, y, i) => {
    if (g.type[i] !== FLOOR || depthOf(x, y) < bd) return;
    if (entries.some(e => e.cells.some(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) < 6))) return;
    if (crag(x, y, B.outcrops?.scale ?? 5) > (B.outcrops?.above ?? 0.8)) g.type[i] = ROCK;
  });
  const starts = entries.flatMap(e => e.cells);
  {
    const { seen } = g.flood(starts);
    g.forEach((x, y, i) => { if (g.type[i] === FLOOR && !seen[i]) g.type[i] = ROCK; });
  }
  for (const [pi, patch] of (B.patches || []).entries()) {
    const pn = makeNoise(tseed, 'patch', pi, biomeId);
    g.forEach((x, y, i) => {
      if (g.type[i] !== FLOOR || g.mark[i]) return;
      const v = pn(x, y, patch.scale ?? 8);
      if ((patch.above != null && v > patch.above) || (patch.below != null && v < patch.below)) g.mark[i] = patch.char;
    });
  }

  const legendOf = () => {
    const legend = { R: { tile: 'rock', solid: true, texture: B.rock } };
    for (const p of B.patches || []) legend[p.char] = { tile: p.texture, texture: p.texture, alpha: 0.85 };
    legend[B.path.char] = { tile: 'path', texture: B.path.texture };
    return legend;
  };

  const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  const entryC = center(rectOf(entries[0].cells));
  const diag = Math.hypot(w, h);

  let pad = null;
  // locked props first
  for (const lp of input.locked || []) {
    const r = coverRect(lp);
    if (!fitsRect(g, r, lp.layer === 'floor')) continue;
    const p = { ...lp, r, locked: true, layer: lp.layer === 'floor' ? 'floor' : 'obj', face: lp.face != null ? dirIndex(lp.face) : null };
    if (lp.role === 'nature' || lp.role === 'clutter') { p.at = lp.at; p.size = lp.size; }
    if (!commit(S, p, true)) continue;
    if (p.role === 'landmark' && p.face != null) reserve(g, [...sideCells(r, p.face, 1), ...sideCells(r, p.face, 2)], RES_HARD);
  }

  // 2. landing pad ----------------------------------------------------------------
  pad = S.props.find(p => p.locked && p.role === 'pad') || null;
  if (!pad && input.pad !== false) {
    const [pw, ph] = B.pad.size;
    const prng = rng.fork('pad');
    const cands = [];
    for (let y = 2; y + ph + 2 < h; y++) for (let x = 2; x + pw + 2 < w; x++) {
      const ring = { x: x - 1, y: y - 1, w: pw + 2, h: ph + 2 };
      if (!fitsRect(g, ring, true)) continue;
      const c = center(ring);
      const d = Math.hypot(c[0] - entryC[0], c[1] - entryC[1]);
      cands.push({ x, y, s: -Math.abs(d - Math.min(12, diag * 0.25)) / 6 + openness(g, ring) * 1.5 + prng.next() * 0.8 });
    }
    cands.sort((a, b) => b.s - a.s);
    const pick = cands.length ? prng.weighted(cands.slice(0, 5), (c) => Math.exp((c.s - cands[0].s) / 0.4)) : null;
    if (pick) {
      pad = { art: B.pad.art, r: { x: pick.x, y: pick.y, w: pw, h: ph }, layer: 'floor', block: false, role: 'pad', rule: 'pad' };
      commit(S, pad);
    }
  }
  if (pad) {
    const ring = ringCells(pad.r).filter(([x, y]) => g.t(x, y) === FLOOR);
    for (const [x, y] of ring) if (B.pad.ring) g.mark[g.idx(x, y)] = B.pad.ring;
    reserve(g, ring, RES_HARD);
    reserve(g, rectCells(pad.r), RES_HARD);
    S.zones.push({ id: 'landing-pad', at: [pad.r.x, pad.r.y], size: [pad.r.w, pad.r.h], required: true });
  }

  // 3. landmarks ---------------------------------------------------------------------
  const lrng = rng.fork('landmarks');
  const want = typeof input.landmarks === 'number' ? input.landmarks : rollCount(lrng, B.landmarks.count);
  const pool = lrng.shuffle(B.landmarks.pick);
  const landmarks = S.props.filter(p => p.locked && p.role === 'landmark');
  for (let k = landmarks.length; k < want && pool.length; k++) {
    const L = pool[k % pool.length];
    const [lw, lh] = L.size;
    const anchors = [...(pad ? [center(pad.r)] : []), ...landmarks.map(l => center(l.r)), entryC];
    const cands = [];
    for (let y = 2; y + lh + 2 < h; y++) for (let x = 2; x + lw + 2 < w; x++) {
      const halo = { x: x - 1, y: y - 1, w: lw + 2, h: lh + 3 };
      if (!fitsRect(g, halo, false)) continue;
      const c = [x + lw / 2, y + lh / 2];
      const far = Math.min(...anchors.map(a => Math.hypot(a[0] - c[0], a[1] - c[1])));
      cands.push({ x, y, s: Math.min(far, diag * 0.45) / 6 + openness(g, halo) + lrng.next() * 0.6 });
    }
    if (!cands.length) break;
    cands.sort((a, b) => b.s - a.s);
    let placed = false;
    for (const c of cands.slice(0, 12)) {
      const r = { x: c.x, y: c.y, w: lw, h: lh };
      const target = pad ? center(pad.r) : entryC;
      const dx = target[0] - (r.x + lw / 2), dy = target[1] - (r.y + lh / 2);
      const face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 0 : 2);
      const apron = [...sideCells(r, face, 1), ...sideCells(r, face, 2)];
      if (!apron.every(([ax, ay]) => g.t(ax, ay) === FLOOR && g.obj[g.idx(ax, ay)] < 0)) continue;
      const lm = { art: L.art, r, layer: 'obj', block: true, role: 'landmark', rule: 'landmarks', face, use: 'front',
        interact: { kind: 'console', id: L.art, label: L.name } };
      if (!commit(S, lm, true)) continue;
      reserve(g, apron, RES_HARD);
      landmarks.push(lm);
      placed = true;
      break;
    }
    if (!placed) break;
  }

  // 4. paths: entry -> pad -> each landmark ------------------------------------------------
  const wind = makeNoise(seed, 'paths', biomeId);
  const nearRock = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g.t(x + dx, y + dy) === ROCK) return 2; return 0; };
  const pathCost = (x, y) => wind(x, y, 4) * 1.6 + nearRock(x, y);
  const hub = pad ? ringCells(pad.r) : starts;
  const goals = [];
  if (pad) goals.push([entries[0].apron, hub]);
  for (const e of entries.slice(1)) goals.push([e.apron, hub]);
  for (const lm of landmarks) goals.push([hub, sideCells(lm.r, lm.face, 2)]);
  const walkOpen = (x, y) => g.walk(x, y);
  const pathSet = [];
  for (const [from, to] of goals) {
    const path = g.path(from, to, walkOpen, pathCost);
    if (!path) continue;
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      pathSet.push([x, y]);
      const [nx, ny] = path[Math.min(path.length - 1, i + 1)];
      const horiz = ny === y && nx !== x;
      const side = horiz ? [x, y + 1] : [x + 1, y];
      if (B.path.width >= 2 && g.t(side[0], side[1]) === FLOOR && g.obj[g.idx(side[0], side[1])] < 0) pathSet.push(side);
    }
  }
  for (const [x, y] of pathSet) {
    const i = g.idx(x, y);
    if (g.type[i] !== FLOOR) continue;
    if (g.mark[i] !== (B.pad.ring || ':') && g.flr[i] < 0) g.mark[i] = B.path.char;
  }
  reserve(g, pathSet, RES_KEEP);

  // 5. working clutter beside landmarks ----------------------------------------------
  for (const [li, lm] of landmarks.entries()) {
    if (lm.locked) continue;
    const crng = rng.fork('near', li);
    const n = rollCount(crng, B.nearLandmark.count, densityMul);
    const members = [lm];
    for (let k = 0; k < n; k++) {
      const item = crng.weighted(B.nearLandmark.pick);
      const [iw, ih] = item.size;
      const cands = [];
      for (const m of members) for (let y = m.r.y - ih; y <= m.r.y + m.r.h; y++) for (let x = m.r.x - iw; x <= m.r.x + m.r.w; x++) {
        const r = { x, y, w: iw, h: ih };
        if (!touches(r, m.r) || !fitsRect(g, r, false)) continue;
        cands.push({ r, s: crng.next() + (m === lm ? 0.3 : 0.5) });
      }
      cands.sort((a, b) => b.s - a.s);
      let ok = false;
      for (const c of cands.slice(0, 8)) {
        const p = { art: item.art, r: c.r, layer: 'obj', block: item.block ?? 'low', role: 'clutter', rule: 'near-landmark',
          rot: crng.chance(0.5) ? 0 : (crng.int(-1, 1) * 0.12) };
        if (commit(S, p, true)) { members.push(p); ok = true; break; }
      }
      if (!ok) break;
    }
  }

  // 6. nature: poisson-disk scatter in clusters ----------------------------------------
  for (const rule of B.scatter || []) {
    const srng = rng.fork('scatter', rule.id);
    const nClusters = rollCount(srng, rule.clusters, densityMul);
    if (!nClusters) continue;
    const floor = [];
    g.forEach((x, y, i) => { if (g.type[i] === FLOOR && g.res[i] === RES_FREE && g.obj[i] < 0) floor.push([x + 0.5, y + 0.5]); });
    if (!floor.length) continue;
    const centers = bestCandidates(srng, floor, nClusters, S.props.filter(p => p.layer === 'obj').map(p => center(p.r)));
    const sigma = rule.spread ?? 3;
    for (const [px, py] of poissonDisk(srng, w, h, rule.radius ?? 2)) {
      const wgt = (rule.density ?? 0.7) * Math.max(...centers.map(([cx, cy]) => Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / (2 * sigma * sigma))));
      if (srng.next() >= wgt) continue;
      const item = srng.weighted(rule.pick);
      const [iw, ih] = item.size;
      const r = { x: Math.floor(px - iw / 2 + 0.5), y: Math.floor(py - ih / 2 + 0.5), w: iw, h: ih };
      if (!fitsRect(g, r, false)) continue;
      const sc = item.scale ? srng.range(item.scale[0], item.scale[1]) : 1;
      const vw = iw * sc, vh = ih * sc;
      const at = [r.x + srng.next() * (iw - vw), r.y + srng.next() * (ih - vh)];
      const p = { art: item.art, r, at, size: [vw, vh], layer: 'obj', block: item.block ?? true, role: 'nature', rule: rule.id,
        rot: rule.rotate ? srng.range(-Math.PI, Math.PI) : 0 };
      commit(S, p, Boolean(p.block));
    }
  }

  // 7. emit --------------------------------------------------------------------------------
  const props = S.props.slice().sort((a, b) => (a.layer === b.layer ? (a.r.y + a.r.h) - (b.r.y + b.r.h) || a.r.x - b.r.x : a.layer === 'floor' ? -1 : 1)).map((p) => {
    const out = { art: p.art, at: (p.at || [p.r.x, p.r.y]).map(round4), size: (p.size || [p.r.w, p.r.h]).map(round4), rot: round4(p.rot || 0), block: p.block };
    if (p.layer === 'floor') out.layer = 'floor';
    if (p.face != null) out.face = typeof p.face === 'number' ? dirName(p.face) : p.face;
    out.role = p.role; out.rule = p.rule;
    if (p.locked) out.locked = true;
    if (p.interact) { out.interact = p.interact; out.use = p.use || 'any'; }
    return out;
  });
  const doors = entries.map(e => ({ id: e.id, at: e.at, size: e.size, to: e.to, arrive: e.arrive, label: e.label || 'Leave', ...(e.to ? {} : { external: true }) }));
  const spawns = {};
  entries.forEach((e, i) => { const c = e.apron[0]; if (i === 0) spawns.default = [c[0], c[1], dirName(e.inward)]; spawns[`from-${e.to || e.id}`] = [c[0], c[1], dirName(e.inward)]; });
  if (pad) spawns['from-landing'] = [pad.r.x + Math.floor(pad.r.w / 2), pad.r.y + Math.floor(pad.r.h / 2), 'down'];
  const map = {
    id: input.id || `${biomeId}-${String(seed).replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 16)}`.slice(0, 32),
    name: input.name || B.name, kind: 'exterior', tile: input.tile || 48, floor: B.ground,
    legend: legendOf(), grid: gridChars(g), props, npcs: S.npcs, doors, spawns, zones: S.zones,
  };
  const { locked, ...rest } = input;
  void locked;
  map.procgen = { version: REGION_VERSION, layer: 'region', biome: biomeId, seed, density, input: { ...rest, w, h }, report: { checks: S.checks, landmarks: landmarks.map(l => l.art) } };
  const v = validateMap(map);
  map.procgen.valid = v.ok;
  map.procgen.problems = v.problems;
  map.procgen.quality = assessMap(map);
  return map;

  // ---- helpers bound to this area ----
  function commit(St, p, check = false) {
    p.i = St.props.length;
    St.props.push(p);
    for (const [x, y] of rectCells(p.r)) {
      const i = g.idx(x, y);
      if (p.layer === 'floor') g.flr[i] = p.i; else { g.obj[i] = p.i; if (p.block) g.block[i] = 1; }
    }
    if (p.interact) St.targets.push(p);
    if (!check || reachOk(St)) return true;
    for (const [x, y] of rectCells(p.r)) { const i = g.idx(x, y); if (p.layer === 'floor') g.flr[i] = -1; else { g.obj[i] = -1; g.block[i] = 0; } }
    if (p.interact) St.targets.pop();
    St.props.pop();
    return false;
  }
  function reachOk(St) {
    St.checks++;
    const { seen, n } = g.flood(starts);
    for (const [x, y] of starts) if (!seen[g.idx(x, y)]) return false;
    let walk = 0;
    g.forEach((x, y) => { if (g.walk(x, y)) walk++; });
    if (walk !== n) return false;
    for (const t of St.targets) if (!sideCells(t.r, t.face, 1).some(([x, y]) => g.in(x, y) && seen[g.idx(x, y)])) return false;
    if (pad && !rectCells(pad.r).some(([x, y]) => seen[g.idx(x, y)])) return false;
    return true;
  }
}

function carveEntry(g, e, i, depth) {
  const side = (e.side || 'w')[0];
  const k = SIDES[side] ?? 1;
  const inward = (k + 2) % 4;
  const width = e.width || 2;
  const along = side === 'n' || side === 's';
  const len = along ? g.w : g.h;
  const start = Math.max(2, Math.min(len - 2 - width, e.at ?? Math.floor((len - width) / 2)));
  const line = side === 'n' ? 0 : side === 's' ? g.h - 1 : side === 'w' ? 0 : g.w - 1;
  const cells = [];
  for (let b = start; b < start + width; b++) cells.push(along ? [b, line] : [line, b]);
  const [dx, dy] = VEC[inward];
  for (const [x, y] of cells) {
    g.type[g.idx(x, y)] = DOOR;
    for (let d = 1; d <= depth + 2; d++) { const cx = x + dx * d, cy = y + dy * d; if (g.in(cx, cy)) g.type[g.idx(cx, cy)] = FLOOR; }
    // widen the cut by one each side so the way in reads as a gap, not a slot
    for (let d = 1; d <= depth + 1; d++) for (const s of [-1, 1]) {
      const cx = x + dx * d + (along ? s : 0), cy = y + dy * d + (along ? 0 : s);
      if (g.in(cx, cy) && Math.min(cx, cy, g.w - 1 - cx, g.h - 1 - cy) > 0) g.type[g.idx(cx, cy)] = FLOOR;
    }
  }
  const apron = [];
  for (let d = 1; d <= 2; d++) for (const [x, y] of cells) apron.push([x + dx * d, y + dy * d]);
  const r = rectOf(cells);
  return { id: e.id || `entry${i ? i + 1 : ''}`, cells, apron, inward, at: [r.x, r.y], size: [r.w, r.h], to: e.to ?? null, arrive: e.arrive ?? null, label: e.label ?? null };
}

function reserve(g, cells, code) {
  for (const [x, y] of cells) {
    if (!g.in(x, y)) continue;
    const i = g.idx(x, y);
    if (code === RES_HARD || g.res[i] === RES_FREE) g.res[i] = code;
  }
}

function fitsRect(g, r, allowKeep) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (!g.in(x, y)) return false;
    const i = g.idx(x, y);
    if (g.type[i] !== FLOOR || g.obj[i] >= 0 || g.flr[i] >= 0) return false;
    if (g.res[i] === RES_HARD || (!allowKeep && g.res[i] === RES_KEEP)) return false;
  }
  return true;
}

/** 0..1: how far a rect is from rock (open ground reads better for big things). */
function openness(g, r) {
  let near = 0, total = 0;
  for (let y = r.y - 2; y < r.y + r.h + 2; y++) for (let x = r.x - 2; x < r.x + r.w + 2; x++) { total++; if (g.t(x, y) === ROCK) near++; }
  return 1 - near / total;
}

function rectOf(cells) {
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}
function rectCells(r) { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]); return out; }
function ringCells(r) { const out = []; for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) out.push([x, y]); return out; }
function touches(a, b) {
  const xT = (a.x + a.w === b.x || b.x + b.w === a.x) && a.y < b.y + b.h && b.y < a.y + a.h;
  const yT = (a.y + a.h === b.y || b.y + b.h === a.y) && a.x < b.x + b.w && b.x < a.x + a.w;
  return xT || yT;
}
const EPS = 1e-6;
function coverRect(p) {
  const [ax, ay] = p.at, [sw, sh] = p.size || [1, 1];
  const x = Math.floor(ax + EPS), y = Math.floor(ay + EPS);
  return { x, y, w: Math.max(1, Math.ceil(ax + sw - EPS) - x), h: Math.max(1, Math.ceil(ay + sh - EPS) - y) };
}

/** Bridson poisson-disk sampling in [1, w-1] x [1, h-1], seeded. */
export function poissonDisk(rng, w, h, radius, k = 20) {
  const cell = radius / Math.SQRT2;
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [], active = [];
  const add = (p) => { pts.push(p); active.push(pts.length - 1); grid[Math.floor(p[1] / cell) * gw + Math.floor(p[0] / cell)] = pts.length - 1; };
  add([rng.range(1, w - 1), rng.range(1, h - 1)]);
  while (active.length) {
    const ai = Math.floor(rng.next() * active.length);
    const [ox, oy] = pts[active[ai]];
    let found = false;
    for (let t = 0; t < k; t++) {
      const a = rng.next() * Math.PI * 2, d = radius * (1 + rng.next());
      const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      let ok = true;
      for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2) && ok; yy++) for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
        const j = grid[yy * gw + xx];
        if (j >= 0 && (pts[j][0] - x) ** 2 + (pts[j][1] - y) ** 2 < radius * radius) { ok = false; break; }
      }
      if (ok) { add([x, y]); found = true; break; }
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}

/** Mitchell's best-candidate: n points spread out from each other and from `avoid`. */
function bestCandidates(rng, pool, n, avoid = []) {
  const out = [];
  for (let k = 0; k < n; k++) {
    let best = null, bestD = -1;
    for (let t = 0; t < 12; t++) {
      const p = pool[Math.floor(rng.next() * pool.length)];
      const others = [...out, ...avoid];
      const d = others.length ? Math.min(...others.map(o => Math.hypot(o[0] - p[0], o[1] - p[1]))) : rng.next();
      if (d > bestD) { bestD = d; best = p; }
    }
    out.push(best);
  }
  return out;
}

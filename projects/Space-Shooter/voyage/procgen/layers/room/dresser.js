// The room dresser (layer: room). Takes a room shell, a room type, a seed and a
// theme, and furnishes it the way a level designer would:
//   1. anchors first, in sensible spots (the bar along the wall facing the
//      door, the reactor in the middle, the helm at the bow);
//   2. functional groups with facing and companions (stools along the bar, a
//      chair behind the desk, pilot seats at the console, lockers in a row);
//   3. the walking routes from every door to every interact point are kept
//      clear (two tiles wide unless the theme is wrecked);
//   4. clutter and decor last, filling the emptier half first, with no repeats
//      crowding each other.
// Hard guarantees, checked after EVERY placement: every door reaches every
// other door, every interact point is reachable from its use side, no open
// floor is sealed off, nothing overlaps, nothing stands in a doorway, nothing
// leaves the walls. The finished map is then re-checked by core/validate.js.
// Same input + same seed = the same room, on every machine.

import { makeRng, rollCount } from '../../core/rng.js';
import { FLOOR, isWallType, WINDOW, rectGap } from '../../core/grid.js';
import { VEC, dirName, opposite, turnsFor, rotFor, turnedSize, sideCells, dirIndex, turnsFromRot } from '../../core/orient.js';
import { gridChars, round4 } from '../../core/emit.js';
import { validateMap, assessMap } from '../../core/validate.js';
import { buildShell } from './shell.js';

const ROLE_ORDER = ['anchor', 'functional', 'clutter', 'decor'];
const RES_FREE = -2, RES_KEEP = -1, RES_DOOR = -3; // reservation codes (n >= 0 = kept for group n)

export const DRESSER_VERSION = 1;

/**
 * Dresses a room. Input (all optional except type):
 *   { type, seed, theme: 'tidy'|'lived-in'|'wrecked', density: 0..1,
 *     shell: { w, h, shape, cut, doors, windows } | { grid, doors },
 *     must: [{ id, prop?, rule?, interact?, station?, npc? }],
 *     spots: [{ id, near?: 'center'|'door'|ruleId, npc?, face? }],
 *     locked: [props from an earlier result to keep exactly],
 *     id, name, tile }
 * Returns onfoot map data plus a `procgen` block (input, report, quality).
 */
export function dressRoom(input, catalogs) {
  const { props: PROPS, rooms: ROOMS } = catalogs;
  const type = input.type;
  const room = ROOMS.rooms[type];
  if (!room) throw new Error(`dressRoom: unknown room type ${type}`);
  const theme = ROOMS.themes[input.theme || 'lived-in'] ? (input.theme || 'lived-in') : 'lived-in';
  const T = ROOMS.themes[theme];
  const seed = input.seed ?? 1;
  const density = Math.max(0, Math.min(1, input.density ?? 0.5));
  const shellSpec = input.shell || defaultShell(room);
  const shell = buildShell(shellSpec.grid || shellSpec.doors ? shellSpec : { ...shellSpec, doors: room.doors });
  const S = new State(shell, PROPS, makeRng(seed, 'room', type), T);
  S.theme = theme;
  const report = { placed: [], skipped: [], locked: [], dropped: [], must: [] };

  // doorways and aprons stay clear for good
  for (const d of shell.doors) for (const [x, y] of d.apron) S.reserve([[x, y]], RES_DOOR);

  // locked props first, exactly where they were
  const lockedRoots = new Map(); // rule id -> count of locked group roots
  for (const lp of input.locked || []) {
    const ok = S.placeLocked(lp);
    (ok ? report.locked : report.dropped).push(lp.art + '@' + lp.at);
    if (ok && lp.rule && !lp.sat) lockedRoots.set(lp.rule, (lockedRoots.get(lp.rule) || 0) + 1);
  }

  // rules for this room + theme extras, with must-haves bound in
  const rules = room.rules.map(r => ({ ...r }));
  for (const extra of T.extra || []) rules.push({ ...extra });
  for (const must of input.must || []) {
    let rule = rules.find(r => (must.rule && r.id === must.rule) || (!must.rule && must.prop && (r.prop === must.prop || (r.pick || []).some(p => (p.prop || p) === must.prop))));
    if (!rule) {
      const def = PROPS.props[must.prop];
      if (!def) throw new Error(`dressRoom: must-have ${must.id} names unknown prop ${must.prop}`);
      rule = { id: `must-${must.id}`, role: 'anchor', prop: must.prop, place: def.wall === 'back' ? 'wall' : 'open', prefer: { far: 2, centered: 1 }, use: def.front === 'none' ? 'any' : 'front' };
      rules.unshift(rule);
    }
    rule.must = must;
    report.must.push(must.id);
  }

  const floorArea = S.floorCells.length;
  const [minW, minH] = room.size?.min || [10, 8], [maxW, maxH] = room.size?.max || [14, 11];
  const refArea = (((minW - 2) * (minH - 2)) + ((maxW - 2) * (maxH - 2))) / 2;
  const densityMul = 0.5 + density;

  const runRule = (rule) => {
    const rng = S.rng.fork('rule', rule.id);
    if (rule.themes && !rule.themes.includes(theme) && !rule.must) return;
    if (rule.minArea && floorArea < rule.minArea && !rule.must) return;
    if (rule.chance != null && !rule.must && rng.next() >= rule.chance) return;
    let scale = rule.scale === 'area' ? floorArea / refArea : 1;
    if (rule.role === 'clutter') scale *= T.clutter * densityMul;
    if (rule.role === 'decor') scale *= T.decor * densityMul;
    let n = rollCount(rng, rule.count ?? 1, scale);
    if (rule.max != null) n = Math.min(n, rule.max);
    n -= lockedRoots.get(rule.id) || 0;
    if (rule.must) n = Math.max(n, 1);
    // locked roots of this rule still get fresh companions
    for (const root of S.props.filter(p => p.locked && p.rule === rule.id && !p.sat)) S.placeSatellites(root, rule, rng);
    for (let k = 0; k < n;) {
      const placed = S.placeRule(rule, rng, k === 0 ? rule.must : null);
      if (placed) { report.placed.push(rule.id); k += placed; } else { report.skipped.push(rule.id); if (rule.must && k === 0) throw new Error(`dressRoom: could not fit must-have ${rule.must.id} in this ${type}`); break; }
    }
  };

  const byRole = (role) => rules.filter(r => (r.role || 'functional') === role);
  for (const rule of byRole('anchor')) runRule(rule);
  for (const rule of byRole('functional')) runRule(rule);
  for (const spot of input.spots || []) S.placeSpot(spot);
  S.reservePaths(T.wide ?? 2);
  const clutterRules = byRole('clutter').map(r => (T.clutterPlace && r.place === 'wall' ? { ...r, place: T.clutterPlace } : r));
  for (const rule of clutterRules) runRule(rule);
  for (const rule of byRole('decor')) runRule(rule);

  const map = S.emit({
    id: input.id || `${type}-${String(seed).replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 16) || 'room'}`.slice(0, 32),
    name: input.name || room.name,
    tile: input.tile || 48,
    floor: room.floor, wall: room.wall,
  });
  const { locked, ...rest } = input;
  void locked;
  map.procgen = {
    version: DRESSER_VERSION, layer: 'room', type, seed, theme, density,
    input: { ...rest, shell: shellSpec },
    report: { ...report, checks: S.checks },
  };
  const v = validateMap(map);
  map.procgen.valid = v.ok;
  map.procgen.problems = v.problems;
  map.procgen.quality = assessMap(map);
  return map;
}

/** The proof/default shell for a room type (its size range middle, doors from data). */
export function defaultShell(room) {
  const [minW, minH] = room.size?.min || [10, 8], [maxW, maxH] = room.size?.max || [14, 11];
  return { w: Math.round((minW + maxW) / 2), h: Math.round((minH + maxH) / 2), doors: room.doors };
}

// ---------------------------------------------------------------------------

class State {
  constructor(shell, PROPS, rng, theme) {
    this.shell = shell;
    this.g = shell.grid;
    this.PROPS = PROPS.props;
    this.rng = rng;
    this.T = theme;
    this.props = [];
    this.npcs = [];
    this.zones = [];
    this.checks = 0;
    const g = this.g;
    this.floorCells = [];
    this.walkCells = [];
    let sx = 0, sy = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    g.forEach((x, y, i) => {
      const t = g.type[i];
      if (t === FLOOR) { this.floorCells.push([x, y]); sx += x + 0.5; sy += y + 0.5; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (t === FLOOR || t === 4) this.walkCells.push(i);
    });
    this.centroid = [sx / this.floorCells.length, sy / this.floorCells.length];
    this.bbox = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    this.diag = Math.hypot(this.bbox.w, this.bbox.h);
    const d0 = shell.doors[0];
    const dc = d0.cells.reduce((a, [x, y]) => [a[0] + x + 0.5, a[1] + y + 0.5], [0, 0]).map(v => v / d0.cells.length);
    this.door = [dc[0] + VEC[d0.inward][0] * 0.5, dc[1] + VEC[d0.inward][1] * 0.5];
    this.doorStarts = shell.doors.flatMap(d => d.cells);
    this.spotCells = [];
    this.mass = { l: 0, r: 0, t: 0, b: 0 };
  }

  // ---- grid bookkeeping ------------------------------------------------------
  reserve(cells, code) {
    const g = this.g;
    for (const [x, y] of cells) {
      if (!g.in(x, y)) continue;
      const i = g.idx(x, y);
      if (code === RES_DOOR || g.res[i] === RES_FREE) g.res[i] = code;
      else if (code === RES_KEEP && g.res[i] >= 0) g.res[i] = RES_KEEP;
    }
  }

  /** Can a prop of this layer stand on every cell of r? owner = its group (may use that group's kept cells). */
  fits(r, layer, owner) {
    const g = this.g;
    if (r.x < 0 || r.y < 0 || r.x + r.w > g.w || r.y + r.h > g.h) return false;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const i = y * g.w + x;
      if (g.type[i] !== FLOOR) return false;
      const res = g.res[i];
      if (res === RES_DOOR) return false;
      if (layer === 'floor') {
        if (g.flr[i] >= 0 || g.obj[i] >= 0) return false;
        if (res >= 0 && res !== owner) return false;
      } else {
        if (g.obj[i] >= 0) return false;
        if (g.flr[i] >= 0 && !this.props[g.flr[i]].under) return false;
        if (res === RES_KEEP) return false;
        if (res >= 0 && res !== owner) return false;
      }
    }
    return true;
  }

  apply(p) {
    const g = this.g;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const i = y * g.w + x;
      if (p.layer === 'floor') g.flr[i] = p.i; else { g.obj[i] = p.i; if (p.block) g.block[i] = 1; }
    }
    this.addMass(p, 1);
  }

  unapply(p) {
    const g = this.g;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const i = y * g.w + x;
      if (p.layer === 'floor') g.flr[i] = -1; else { g.obj[i] = -1; g.block[i] = 0; }
    }
    this.addMass(p, -1);
  }

  addMass(p, sign) {
    if (p.layer === 'floor') return;
    const m = (p.block ? 1 : 0.4) * sign;
    const [cx, cy] = this.centroid;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (x + 0.5 < cx) this.mass.l += m; else this.mass.r += m;
      if (y + 0.5 < cy) this.mass.t += m; else this.mass.b += m;
    }
  }

  /** The hard guarantees, on the live grid. */
  hardOk() {
    this.checks++;
    const g = this.g;
    const { seen, n } = g.flood(this.doorStarts);
    for (const [x, y] of this.doorStarts) if (!seen[g.idx(x, y)]) return false;
    let walk = 0;
    for (const i of this.walkCells) if (!g.block[i]) walk++;
    if (walk !== n) return false; // a sealed pocket
    for (const p of this.props) {
      if (!p.interact) continue;
      if (!this.useCells(p).some(([x, y]) => g.in(x, y) && seen[g.idx(x, y)])) return false;
    }
    for (const [x, y] of this.spotCells) if (!seen[g.idx(x, y)]) return false;
    return true;
  }

  useSides(p) {
    if (p.facing == null || p.use === 'any' || !p.use) return [0, 1, 2, 3];
    return [p.use === 'back' ? opposite(p.facing) : p.facing];
  }
  useCells(p) { return this.useSides(p).flatMap(k => sideCells(p, k, 1)); }

  /** Try to commit a list of pieces; keeps them only if the guarantees hold. */
  commit(pieces) {
    for (const p of pieces) { p.i = this.props.length; this.props.push(p); this.apply(p); }
    if (this.hardOk()) return true;
    for (let k = pieces.length - 1; k >= 0; k--) { this.unapply(pieces[k]); this.props.pop(); }
    return false;
  }

  // ---- making pieces -----------------------------------------------------------
  def(art) {
    const d = this.PROPS[art];
    if (!d) throw new Error(`dresser: prop ${art} is not in props.json`);
    return d;
  }

  piece(art, x, y, turns, facing, extra = {}) {
    const d = this.def(art);
    const [w, h] = turnedSize(d.size, turns);
    return { art, x, y, w, h, turns, facing, block: d.block ?? true, layer: d.layer === 'floor' ? 'floor' : 'obj', under: !!d.under, ...extra };
  }

  placeLocked(lp) {
    const d = this.PROPS[lp.art];
    if (!d) return false;
    const turns = turnsFromRot(lp.rot || 0);
    const p = this.piece(lp.art, Math.round(lp.at[0]), Math.round(lp.at[1]), turns, lp.face != null ? dirIndex(lp.face) : null, {
      rule: lp.rule || null, role: lp.role || 'functional', sat: !!lp.sat, locked: true, interact: lp.interact || null, use: lp.use || null, station: lp.station || null,
    });
    const [w, h] = lp.size ? lp.size.map(Math.round) : [p.w, p.h];
    p.w = w; p.h = h;
    if (!this.fits(p, p.layer, -99)) return false;
    p.group = this.props.length;
    if (!this.commit([p])) return false;
    this.reserveAround(p, d, {});
    return true;
  }

  /** Front clearance, wall gap and use cells stay free of other groups. */
  reserveAround(p, d, rule) {
    if (p.facing != null && d.clear > 0) for (let k = 1; k <= d.clear; k++) this.reserve(sideCells(p, p.facing, k), p.group);
    if (rule.wallGap && p.wallSide != null) for (let k = 1; k <= rule.wallGap; k++) this.reserve(sideCells(p, p.wallSide, k), p.group);
    if (p.interact && p.facing != null && p.use !== 'any') this.reserve(this.useCells(p), p.group);
  }

  // ---- candidates -------------------------------------------------------------
  /** Every legal spot for a unit (one prop, or a run of copies) under a placement mode. */
  candidates(art, rule, n, owner) {
    const d = this.def(art);
    const g = this.g;
    const place = rule.place || (d.wall === 'back' ? 'wall' : 'any');
    const layer = d.layer === 'floor' ? 'floor' : 'obj';
    const directional = d.front && d.front !== 'none';
    const native = directional ? dirIndex(d.front) : 0;
    const gap = rule.runGap || 0;
    const wallGap = rule.wallGap || 0;
    const out = [];
    const variants = [];
    if (place === 'wall' || place === 'corner') {
      for (let s = 0; s < 4; s++) {
        let facing, turnsList;
        if (directional) { facing = rule.orient === 'wall' ? s : opposite(s); turnsList = [turnsFor(facing, native)]; }
        else if (d.wall === 'side') { const [w, h] = d.size; const horiz = s % 2 === 0; turnsList = [(horiz ? w >= h : h >= w) ? 0 : 1]; facing = null; }
        else { turnsList = d.size[0] === d.size[1] ? [0] : [0, 1]; facing = null; }
        for (const turns of turnsList) variants.push({ s, facing, turns, along: s % 2 === 0 ? 'x' : 'y' });
      }
    } else {
      const facings = directional ? [0, 1, 2, 3] : [null];
      for (const facing of facings) {
        const turnsList = directional ? [turnsFor(facing, native)] : (d.size[0] === d.size[1] ? [0] : [0, 1]);
        for (const turns of turnsList) {
          // free-standing runs line up along the piece's long side (track sections, a row of cases)
          const [tw, th] = turnedSize(d.size, turns);
          const along = facing == null ? (th > tw ? 'y' : 'x') : (facing % 2 === 0 ? 'x' : 'y');
          variants.push({ s: null, facing, turns, along });
        }
      }
    }
    const nearTargets = rule.near ? this.props.filter(p => rule.near.includes(p.rule) || (this.PROPS[p.art].tags || []).some(t => rule.near.includes(t))) : [];
    for (const v of variants) {
      const [fw, fh] = turnedSize(d.size, v.turns);
      const W = v.along === 'x' ? n * fw + (n - 1) * gap : fw;
      const H = v.along === 'y' ? n * fh + (n - 1) * gap : fh;
      for (let y = 1; y + H <= g.h - 1; y++) for (let x = 1; x + W <= g.w - 1; x++) {
        const r = { x, y, w: W, h: H };
        // the pieces of a run, and the gaps between them
        const pieces = [];
        for (let k = 0; k < n; k++) pieces.push(v.along === 'x' ? { x: x + k * (fw + gap), y, w: fw, h: fh } : { x, y: y + k * (fh + gap), w: fw, h: fh });
        if (!pieces.every(pc => this.fits(pc, layer, owner))) continue;
        if (gap && !this.gapsOpen(r, pieces)) continue;
        if (v.s != null) {
          let ok = true;
          for (let k = 1; k <= wallGap && ok; k++) for (const [cx, cy] of sideCells(r, v.s, k)) { if (g.t(cx, cy) !== FLOOR || g.obj[g.idx(cx, cy)] >= 0 || g.res[g.idx(cx, cy)] === RES_DOOR) { ok = false; break; } }
          if (!ok) continue;
          for (const [cx, cy] of sideCells(r, v.s, wallGap + 1)) { const t = g.t(cx, cy); if (!isWallType(t) || (d.tall && t === WINDOW)) { ok = false; break; } }
          if (!ok) continue;
          if (place === 'corner' && !this.touchesWall(r, (v.s + 1) % 4) && !this.touchesWall(r, (v.s + 3) % 4)) continue;
        }
        if (place === 'open' || place === 'center') {
          if (!this.ringOpen(r)) continue;
        }
        if (place === 'near' && nearTargets.length && !nearTargets.some(t => rectGap(t, r) <= 1)) continue;
        if (v.facing != null && d.clear > 0) {
          let ok = true;
          for (let k = 1; k <= d.clear && ok; k++) for (const [cx, cy] of sideCells(r, v.facing, k)) { if (g.t(cx, cy) !== FLOOR || g.obj[g.idx(cx, cy)] >= 0) { ok = false; break; } }
          if (!ok) continue;
        }
        out.push({ ...r, pieces, turns: v.turns, facing: v.facing, wallSide: v.s, fw, fh });
      }
    }
    return out;
  }

  gapsOpen(r, pieces) {
    const g = this.g;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (pieces.some(p => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) continue;
      if (g.t(x, y) !== FLOOR || g.obj[g.idx(x, y)] >= 0) return false;
    }
    return true;
  }

  touchesWall(r, k) { return sideCells(r, k, 1).every(([x, y]) => isWallType(this.g.t(x, y))); }
  touchesAnyWall(r) { return [0, 1, 2, 3].some(k => sideCells(r, k, 1).some(([x, y]) => isWallType(this.g.t(x, y)))); }

  /** Free-standing: a 1-tile ring of open floor (no walls, doors or objects) all round. */
  ringOpen(r) {
    const g = this.g;
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
      if (g.t(x, y) !== FLOOR) return false;
      if (g.obj[g.idx(x, y)] >= 0) return false;
      const res = g.res[g.idx(x, y)];
      if (res === RES_DOOR || res >= 0) return false;
    }
    return true;
  }

  // ---- scoring ------------------------------------------------------------------
  score(c, art, rule, rng) {
    const pref = rule.prefer || {};
    const [cx, cy] = [c.x + c.w / 2, c.y + c.h / 2];
    let s = 0;
    const dd = Math.hypot(cx - this.door[0], cy - this.door[1]) / this.diag;
    if (pref.far) s += pref.far * dd;
    if (pref.door) s += pref.door * (1 - dd);
    if (pref.centered) s += pref.centered * this.centeredness(c);
    // "presents": the way it faces the room (a desk turned to the wall presents its other side)
    const presents = c.facing != null ? (rule.orient === 'wall' ? opposite(c.facing) : c.facing) : (c.wallSide != null ? opposite(c.wallSide) : null);
    if (pref.facesDoor && presents != null) s += pref.facesDoor * this.facesPoint(presents, c, this.door);
    if (pref.facesCenter && presents != null) s += pref.facesCenter * this.facesPoint(presents, c, this.centroid);
    // side: on the walls either side of the door axis (side consoles, a relay board), not by the door
    if (pref.side && presents != null) s += pref.side * (presents % 2 !== this.shell.doors[0].inward % 2 ? 1 : 0);
    // zones: things that work together stand together, other zones keep their distance
    if (rule.zone) {
      const mine = this.props.filter(p => p.zone === rule.zone && p.rule !== rule.id);
      const other = this.props.filter(p => p.zone && p.zone !== rule.zone && p.role !== 'decor');
      if (mine.length) s += (pref.zone ?? 1.5) * (1 - Math.min(6, Math.min(...mine.map(p => rectGap(p, c)))) / 6);
      if (other.length) s -= 0.6 * (1 - Math.min(4, Math.min(...other.map(p => rectGap(p, c)))) / 4);
    }
    if (pref.corner) s += pref.corner * (this.isCorner(c) ? 1 : 0);
    if (pref.wall) s += pref.wall * (this.touchesAnyWall(c) ? 1 : 0);
    if (pref.spread) {
      const same = this.props.filter(p => p.rule === rule.id && !p.sat);
      s += pref.spread * (same.length ? Math.min(5, Math.min(...same.map(p => rectGap(p, c)))) / 5 : 1);
    }
    if (pref.near && rule.near) {
      const t = this.props.filter(p => rule.near.includes(p.rule) || (this.PROPS[p.art].tags || []).some(x => rule.near.includes(x)));
      if (t.length) s += pref.near * (1 - Math.min(6, Math.min(...t.map(p => rectGap(p, c)))) / 6);
    }
    s += (pref.balance ?? 0.6) * this.balanceGain(c);
    // the same prop crowding itself from another group reads as copy-paste
    for (const p of this.props) if (p.art === art && rectGap(p, c) <= 2) s -= 0.7;
    // keep the view from the door open: big things off the door's axis (anchors may own the view)
    if (rule.role !== 'anchor') s -= this.doorLanePenalty(c);
    s += rng.next() * (this.T.jitter ?? 0.5);
    return s;
  }

  centeredness(c) {
    const g = this.g;
    if (c.wallSide != null) {
      // centre along the wall run this piece stands against (L-shapes have two runs)
      const horiz = c.wallSide % 2 === 0;
      const row = horiz ? (c.wallSide === 2 ? c.y : c.y + c.h - 1) : (c.wallSide === 1 ? c.x : c.x + c.w - 1);
      const mid = horiz ? Math.floor(c.x + c.w / 2) : Math.floor(c.y + c.h / 2);
      let a = mid, b = mid;
      const open = (v) => (horiz ? g.t(v, row) : g.t(row, v)) === FLOOR;
      while (open(a - 1)) a--;
      while (open(b + 1)) b++;
      const runMid = (a + b + 1) / 2, half = Math.max(1, (b - a + 1) / 2);
      const pos = horiz ? c.x + c.w / 2 : c.y + c.h / 2;
      return 1 - Math.min(1, Math.abs(pos - runMid) / half);
    }
    const [cx, cy] = [c.x + c.w / 2, c.y + c.h / 2];
    return 1 - Math.min(1, Math.hypot(cx - this.centroid[0], cy - this.centroid[1]) / (this.diag / 2));
  }

  facesPoint(dir, c, [px, py]) {
    const [cx, cy] = [c.x + c.w / 2, c.y + c.h / 2];
    const len = Math.hypot(px - cx, py - cy) || 1;
    const [vx, vy] = VEC[dir];
    return (vx * (px - cx) + vy * (py - cy)) / len;
  }

  isCorner(c) {
    let walls = 0;
    for (let k = 0; k < 4; k++) if (this.touchesWall(c, k)) walls |= 1 << k;
    return ((walls & 1) || (walls & 4)) && ((walls & 2) || (walls & 8));
  }

  balanceGain(c) {
    const [cx, cy] = this.centroid;
    const area = c.w * c.h;
    const m = this.mass;
    const total = m.l + m.r + area;
    const left = c.x + c.w / 2 < cx, top = c.y + c.h / 2 < cy;
    const lr = left ? (m.r - m.l) : (m.l - m.r);
    const tb = top ? (m.b - m.t) : (m.t - m.b);
    return (lr + tb) / (2 * Math.max(4, total));
  }

  doorLanePenalty(c) {
    if (c.w * c.h < 3) return 0;
    let hit = 0;
    for (const d of this.shell.doors) {
      const [dx, dy] = VEC[d.inward];
      for (let k = 3; k <= 4; k++) for (const [x, y] of d.cells) {
        const lx = x + dx * k, ly = y + dy * k;
        if (lx >= c.x && lx < c.x + c.w && ly >= c.y && ly < c.y + c.h) hit++;
      }
    }
    return hit * 0.25;
  }

  /** Choose among the best few candidates, seeded; keep the first that passes the guarantees. */
  choose(cands, art, rule, rng, build) {
    if (!cands.length) return null;
    const scored = cands.map(c => ({ c, s: this.score(c, art, rule, rng) })).sort((a, b) => b.s - a.s);
    const temp = 0.15 + (this.T.jitter ?? 0.5) * 0.25;
    let tries = 0;
    while (scored.length && tries < 40) {
      tries++;
      const pool = scored.slice(0, Math.min(5, scored.length));
      const top = pool[0].s;
      const pick = rng.weighted(pool, (x) => Math.exp((x.s - top) / temp));
      const pieces = build(pick.c);
      if (this.commit(pieces)) return { c: pick.c, pieces };
      scored.splice(scored.indexOf(pick), 1);
    }
    return null;
  }

  // ---- rules ----------------------------------------------------------------------
  pickArt(rule, rng, avoid = null) {
    if (rule.prop) return rule.prop;
    const list = (rule.pick || []).map(p => (typeof p === 'string' ? { prop: p, w: 1 } : p));
    const pool = list.length > 1 && avoid ? list.filter(p => p.prop !== avoid) : list;
    return rng.weighted(pool, (p) => p.w ?? 1).prop;
  }

  placeRule(rule, rng, must) {
    const got = this.placeRuleAs(rule, rng, must);
    // a rule may name a looser placement to fall back on in tight rooms
    if (!got && rule.fallback) return this.placeRuleAs({ ...rule, place: rule.fallback, fallback: null }, rng.fork('fallback'), must);
    return got;
  }

  placeRuleAs(rule, rng, must) {
    const art = this.pickArt(rule, rng);
    const d = this.def(art);
    const n = rule.run ? rng.int(rule.run[0], rule.run[1]) : 1;
    const tried = new Set();
    // a run that does not fit shrinks before giving up
    for (let len = n; len >= 1; len--) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const group = this.props.length;
        const cands = this.candidates(art, rule, len, group).filter(c => !tried.has(`${c.x},${c.y},${c.turns},${c.facing}`));
        const got = this.choose(cands, art, rule, rng, (c) => c.pieces.map((pc, k) => {
          const mid = k === Math.floor((c.pieces.length - 1) / 2);
          const interact = mid ? (must?.interact || rule.interact || null) : null;
          return this.piece(art, pc.x, pc.y, c.turns, c.facing, {
            rule: rule.id, role: rule.role || 'functional', group, sat: false, wallSide: c.wallSide, zone: rule.zone || null,
            interact, use: interact ? (rule.use || (c.facing == null ? 'any' : 'front')) : null,
            station: mid ? (must?.station || rule.station || null) : null,
            must: mid && must ? must.id : null,
          });
        }));
        if (!got) break;
        tried.add(`${got.c.x},${got.c.y},${got.c.turns},${got.c.facing}`);
        for (const p of got.pieces) this.reserveAround(p, d, rule);
        const whole = { ...got.c, facing: got.c.facing, group, rule: rule.id };
        const missing = this.placeSatellites(whole, rule, rng);
        if (missing) { this.rollbackTo(group); continue; } // a sofa without its table is not a seating group
        if (rule.ring) this.paintRing(got.c, rule.ring);
        if (rule.cluster) this.growCluster(got.pieces, rule, rng, group);
        if (must?.npc) this.placeKeeper(must, got.pieces, rule, group);
        if ((rule.mirror === true || (rule.mirror === 'tidy' && this.theme === 'tidy')) && this.placeMirror(got.c, art, rule, rng)) return 2;
        return 1;
      }
    }
    return 0;
  }

  /** Undo everything placed from prop index `n` on (pieces, companions and their kept cells). */
  rollbackTo(n) {
    const g = this.g;
    while (this.props.length > n) this.unapply(this.props.pop());
    for (let i = 0; i < g.res.length; i++) if (g.res[i] >= n) g.res[i] = RES_FREE;
  }

  /** Symmetry: the same unit mirrored across the room's door axis (tidy rooms, paired consoles). */
  placeMirror(c, art, rule, rng) {
    const d0 = this.shell.doors[0];
    const vertical = d0.inward % 2 === 0; // door on a north/south wall: mirror left-right
    const b = this.bbox;
    const m = { ...c };
    const flip = (k) => (k == null ? k : vertical ? (k === 1 ? 3 : k === 3 ? 1 : k) : (k === 0 ? 2 : k === 2 ? 0 : k));
    if (vertical) m.x = 2 * b.x + b.w - c.x - c.w; else m.y = 2 * b.y + b.h - c.y - c.h;
    if (m.x === c.x && m.y === c.y) return false;
    m.facing = flip(c.facing); m.wallSide = flip(c.wallSide);
    const d = this.def(art);
    const group = this.props.length;
    const pieces = c.pieces.map(pc => {
      const q = { ...pc };
      if (vertical) q.x = 2 * b.x + b.w - pc.x - pc.w; else q.y = 2 * b.y + b.h - pc.y - pc.h;
      return q;
    });
    if (!pieces.every(pc => this.fits(pc, d.layer === 'floor' ? 'floor' : 'obj', group))) return false;
    if (m.wallSide != null && !sideCells(m, m.wallSide, (rule.wallGap || 0) + 1).every(([x, y]) => isWallType(this.g.t(x, y)))) return false;
    const built = pieces.map((pc, k) => this.piece(art, pc.x, pc.y, c.turns, m.facing, {
      rule: rule.id, role: rule.role || 'functional', group, sat: false, wallSide: m.wallSide, zone: rule.zone || null,
      interact: k === Math.floor((pieces.length - 1) / 2) && rule.interact && !rule.must ? { ...rule.interact, id: `${rule.interact.id}-2` } : null,
      use: rule.interact ? (rule.use || 'front') : null, mirrored: true,
    }));
    if (!this.commit(built)) return false;
    for (const p of built) this.reserveAround(p, d, rule);
    this.placeSatellites({ ...m, group, rule: rule.id }, rule, rng.fork('mirror'));
    return true;
  }

  paintRing(c, ring) {
    const g = this.g;
    const wdt = ring.width || 1;
    const cells = [];
    for (let y = c.y - wdt; y < c.y + c.h + wdt; y++) for (let x = c.x - wdt; x < c.x + c.w + wdt; x++) {
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) continue;
      if (g.t(x, y) !== FLOOR || g.obj[g.idx(x, y)] >= 0) continue;
      cells.push([x, y]);
      if (ring.tile) g.mark[g.idx(x, y)] = ring.tile;
    }
    this.reserve(cells, RES_DOOR);
  }

  /** Companions around a placed parent: stools along a bar, a chair at a desk, sofas round a rug. */
  placeSatellites(parent, rule, rng) {
    let missing = 0;
    for (const [si, sat] of (rule.satellites || []).entries()) {
      const srng = rng.fork('sat', si, parent.x, parent.y);
      if (sat.chance != null && srng.next() >= sat.chance) continue;
      const before = this.props.length;
      const d = this.def(sat.prop);
      // a parent with no front (rug, table) treats its long sides as front and back
      const pf = parent.facing ?? (parent.h > parent.w ? 3 : 0);
      if (sat.side === 'on') {
        const [w, h] = d.size;
        const turns = (w >= h) === (parent.w >= parent.h) ? 0 : 1;
        const [fw, fh] = turnedSize(d.size, turns);
        const x = parent.x + Math.floor((parent.w - fw) / 2), y = parent.y + Math.floor((parent.h - fh) / 2);
        const p = this.piece(sat.prop, x, y, turns, null, { rule: rule.id, role: rule.role, group: parent.group, sat: true });
        if (this.fits(p, p.layer, parent.group)) this.commit([p]);
        if (sat.required && this.props.length === before) missing++;
        continue;
      }
      const sides = sat.side === 'sides' ? [(pf + 1) % 4, (pf + 3) % 4] : [{ front: pf, back: opposite(pf), left: (pf + 3) % 4, right: (pf + 1) % 4 }[sat.side] ?? pf];
      for (const ks of sides) {
        const directional = d.front && d.front !== 'none';
        const facing = !directional ? null : sat.face === 'away' ? ks : sat.face === 'same' ? pf : opposite(ks);
        const turns = directional ? turnsFor(facing, dirIndex(d.front)) : (ks % 2 === 0 ? (d.size[0] >= d.size[1] ? 0 : 1) : (d.size[1] >= d.size[0] ? 0 : 1));
        const [sw, sh] = turnedSize(d.size, turns);
        const gap = sat.gap || 0;
        const horiz = ks % 2 === 0;
        const L = horiz ? parent.w : parent.h, sl = horiz ? sw : sh;
        if (sl > L && sat.side !== 'left' && sat.side !== 'right') continue;
        // slots along the side
        let offsets;
        if (sat.side === 'left' || sat.side === 'right') offsets = [Math.max(0, Math.floor((L - sl) / 2))];
        else if (sat.count === 'fill') {
          const every = Math.max(sl, sat.every || sl);
          const m = Math.floor((L - sl) / every) + 1;
          const start = Math.floor(((L - sl) - (m - 1) * every) / 2);
          offsets = Array.from({ length: m }, (_, i) => start + i * every);
          // long rows break into groups so a bar of stools never reads as one stamped line
          if (sat.maxRun && offsets.length > sat.maxRun) offsets = offsets.filter((_, i) => (i + 1) % (sat.maxRun + 1) !== 0);
        } else {
          const m = Math.min(rollCount(srng, sat.count ?? 1), Math.floor(L / sl));
          if (m <= 0) continue;
          if (sat.align === 'spread' && m > 1) offsets = Array.from({ length: m }, (_, i) => Math.round(i * (L - sl) / (m - 1)));
          else { const span = m * sl; const start = Math.floor((L - span) / 2); offsets = Array.from({ length: m }, (_, i) => start + i * sl); }
        }
        const lateral = sat.side === 'left' || sat.side === 'right';
        for (const o of offsets) {
          let x, y;
          if (ks === 0) { x = parent.x + o; y = parent.y + parent.h + gap; }
          else if (ks === 2) { x = parent.x + o; y = parent.y - gap - sh; }
          else if (ks === 1) { x = parent.x - gap - sw; y = parent.y + o; }
          else { x = parent.x + parent.w + gap; y = parent.y + o; }
          if (lateral && parent.wallSide != null) {
            // beside a wall piece: line up with its wall edge so both hug the wall
            const ws = parent.wallSide;
            if (ws === 2) y = parent.y; else if (ws === 0) y = parent.y + parent.h - sh;
            else if (ws === 1) x = parent.x; else if (ws === 3) x = parent.x + parent.w - sw;
          }
          const p = this.piece(sat.prop, x, y, turns, facing, { rule: rule.id, role: rule.role, group: parent.group, sat: true, seat: !!sat.seat, zone: rule.zone || null });
          if (!this.fits(p, p.layer, parent.group)) continue;
          this.commit([p]);
        }
      }
      if (sat.required && this.props.length === before) missing++;
    }
    return missing;
  }

  /** Stacks: more pieces grown edge-to-edge beside the first (crates against a wall). */
  growCluster(first, rule, rng, group) {
    const more = rng.int(rule.cluster[0], rule.cluster[1]) - 1;
    const members = first.slice();
    let last = first[first.length - 1].art;
    const wallish = rule.place === 'wall' || rule.place === 'corner';
    for (let k = 0; k < more; k++) {
      const art = this.pickArt(rule, rng, rule.pick && rng.next() < 0.7 ? last : null);
      const d = this.def(art);
      const cands = [];
      const directional = d.front && d.front !== 'none';
      // wall-backed pieces (toolbox chests) only join a stack where their back meets a wall
      const variants = directional ? [0, 1, 2, 3].map(s => ({ s, facing: opposite(s), turns: turnsFor(opposite(s), dirIndex(d.front)) })) : (d.size[0] === d.size[1] ? [0] : [0, 1]).map(turns => ({ s: null, facing: null, turns }));
      for (const v of variants) {
        const [fw, fh] = turnedSize(d.size, v.turns);
        for (const m of members) for (let y = m.y - fh; y <= m.y + m.h; y++) for (let x = m.x - fw; x <= m.x + m.w; x++) {
          const r = { x, y, w: fw, h: fh };
          const xTouch = (r.x + r.w === m.x || m.x + m.w === r.x) && r.y < m.y + m.h && m.y < r.y + r.h;
          const yTouch = (r.y + r.h === m.y || m.y + m.h === r.y) && r.x < m.x + m.w && m.x < r.x + r.w;
          if (!xTouch && !yTouch) continue;
          if (v.s != null && (d.wall === 'back' && !this.touchesWall(r, v.s))) continue;
          if (!this.fits(r, 'obj', group)) continue;
          cands.push({ ...r, turns: v.turns, facing: v.facing, wallSide: v.s });
        }
      }
      const clusterRule = { id: rule.id, prefer: { wall: wallish ? 3 : 0.5, balance: 0.2 } };
      const got = this.choose(cands, art, clusterRule, rng, (c) => [this.piece(art, c.x, c.y, c.turns, c.facing, { rule: rule.id, role: rule.role, group, sat: true, zone: rule.zone || null })]);
      if (!got) break;
      members.push(...got.pieces);
      last = art;
    }
  }

  placeKeeper(must, pieces, rule, group) {
    const mid = pieces[Math.floor((pieces.length - 1) / 2)];
    let cell = null, face = 'down';
    if (rule.keeper === 'seat') {
      const seat = this.props.find(p => p.group === group && p.seat);
      if (seat) { cell = [seat.x, seat.y]; face = dirName(seat.facing ?? 0); }
    } else if (rule.keeper === 'back' && mid.facing != null) {
      const cells = sideCells(mid, opposite(mid.facing), 1);
      cell = cells[Math.floor((cells.length - 1) / 2)]; face = dirName(mid.facing);
    }
    if (!cell) {
      const cells = this.useCells(mid).filter(([x, y]) => this.g.walk(x, y));
      if (cells.length) { cell = cells[0]; face = dirName(opposite(mid.facing ?? 2)); }
    }
    if (!cell) return;
    this.npcs.push({ id: must.npc, at: [cell[0], cell[1]], face, wander: 0.3, station: must.station || undefined });
    this.spotCells.push(cell);
    this.reserve([cell], RES_DOOR);
  }

  /** A free standing spot for an npc or a quest beat, reachable and kept clear. */
  placeSpot(spot) {
    const g = this.g;
    const target = spot.near === 'door' ? this.door : spot.near && spot.near !== 'center'
      ? (() => { const p = this.props.find(q => q.rule === spot.near && !q.sat); return p ? [p.x + p.w / 2, p.y + p.h / 2] : this.centroid; })()
      : this.centroid;
    const rng = this.rng.fork('spot', spot.id);
    const cands = this.floorCells.filter(([x, y]) => g.walk(x, y) && g.obj[g.idx(x, y)] < 0 && g.res[g.idx(x, y)] === RES_FREE)
      .map(([x, y]) => ({ x, y, s: -Math.hypot(x + 0.5 - target[0], y + 0.5 - target[1]) + rng.next() * 0.5 }))
      .sort((a, b) => b.s - a.s);
    const c = cands.find(({ x, y }) => { this.spotCells.push([x, y]); const ok = this.hardOk(); if (!ok) this.spotCells.pop(); return ok; });
    if (!c) return;
    this.reserve([[c.x, c.y]], RES_DOOR);
    this.zones.push({ id: spot.id, at: [c.x, c.y], size: [1, 1], required: true, ...(spot.station ? { station: spot.station } : {}) });
    if (spot.npc) this.npcs.push({ id: spot.npc, at: [c.x, c.y], face: spot.face || 'down', wander: spot.wander ?? 0.5 });
  }

  /** Keep the walking routes open before clutter: door to door, door to every interact point and spot. */
  reservePaths(wide) {
    const g = this.g;
    const starts = this.shell.doors[0].cells;
    const goals = [];
    for (const d of this.shell.doors.slice(1)) goals.push(d.cells);
    for (const p of this.props) if (p.interact) goals.push(this.useCells(p).filter(([x, y]) => g.walk(x, y)));
    for (const c of this.spotCells) goals.push([c]);
    const hug = (x, y) => (isWallType(g.t(x + 1, y)) || isWallType(g.t(x - 1, y)) || isWallType(g.t(x, y + 1)) || isWallType(g.t(x, y - 1)) ? 0.6 : 0);
    for (const goal of goals) {
      if (!goal.length) continue;
      const path = g.path(starts, goal, (x, y) => g.walk(x, y), hug);
      if (!path) continue;
      const cells = path.filter(([x, y]) => g.t(x, y) === FLOOR);
      this.reserve(cells, RES_KEEP);
      if (wide >= 2) {
        for (let i = 0; i < path.length; i++) {
          const [x, y] = path[i];
          const [nx, ny] = path[Math.min(path.length - 1, i + 1)];
          const [px, py] = path[Math.max(0, i - 1)];
          const horiz = (nx !== x || px !== x) && ny === y && py === y;
          const opts = horiz ? [[x, y + 1], [x, y - 1]] : [[x + 1, y], [x - 1, y]];
          const side = opts.find(([sx, sy]) => g.t(sx, sy) === FLOOR && g.obj[g.idx(sx, sy)] < 0);
          if (side) this.reserve([side], RES_KEEP);
        }
      }
    }
  }

  // ---- output ---------------------------------------------------------------------
  emit(meta) {
    const rotJ = this.T.rotJitter || 0;
    const jr = this.rng.fork('rot-jitter');
    const order = this.props.slice().sort((a, b) => (a.layer === b.layer ? (a.y + a.h) - (b.y + b.h) || a.x - b.x : a.layer === 'floor' ? -1 : 1));
    const props = order.map((p) => {
      let rot = rotFor(p.turns);
      if (rotJ && (p.role === 'clutter' || p.role === 'decor') && p.w === 1 && p.h === 1 && p.layer !== 'floor') rot += jr.range(-rotJ, rotJ);
      const out = { art: p.art, at: [p.x, p.y], size: [p.w, p.h], rot: round4(rot), block: p.block };
      if (p.layer === 'floor') { out.layer = 'floor'; if (p.under) out.under = true; }
      if (p.facing != null) out.face = dirName(p.facing);
      out.role = p.role; out.rule = p.rule; out.group = p.group;
      if (p.sat) out.sat = true;
      if (p.locked) out.locked = true;
      if (p.interact) { out.interact = p.interact; out.use = p.use; }
      if (p.station) out.station = p.station;
      if (p.must) out.must = p.must;
      return out;
    });
    // group ids renumbered to output order so they stay small and stable
    const remap = new Map();
    for (const p of props) if (!remap.has(p.group)) remap.set(p.group, remap.size);
    for (const p of props) p.group = remap.get(p.group);
    const doors = this.shell.doors.map(d => {
      const out = { id: d.id, at: d.at, size: d.size, to: d.to, arrive: d.arrive || null, label: d.label || 'Door' };
      if (!d.to) out.external = true;
      if (d.locked) out.locked = d.locked;
      if (d.station) out.station = d.station;
      return out;
    });
    const spawns = {};
    this.shell.doors.forEach((d, i) => {
      const c = d.apron[Math.floor((d.cells.length - 1) / 2)] || d.cells[0];
      const s = [c[0], c[1], dirName(d.inward)];
      if (i === 0) spawns.default = s;
      spawns[`from-${d.to || d.id}`] = s;
    });
    return {
      id: meta.id, name: meta.name, kind: 'interior', tile: meta.tile, floor: meta.floor, wall: meta.wall,
      grid: gridChars(this.g), props, npcs: this.npcs, doors, spawns, zones: this.zones,
    };
  }
}

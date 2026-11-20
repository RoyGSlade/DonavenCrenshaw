// Claw: the board. Pure and seeded: no DOM, no clock, no Math.random.
// A board is built from what the Sounding drill left behind: `tunnel = { cell, w, h, rows, entry, board }` (a '1' is open ground) and each
// find's position, size, `freed` share and `cracks`. Only ground joined to the mouth by open cells counts; the rest is rock to the claw.
// With no drill result the module picks one of the real results shipped in fixtures.json by the seed (and mirrors it), so a rolled board
// is always a tunnel somebody actually cut.
import { hashSeed, roller } from './rng.js';

export const SHELL = 34;   // the drill's shell width round a find's core (units): the ring the claw has to reach into

/** Run-length rows ("0120,1300") back to strings of '0' and '1'. Fixtures keep tunnels this way to stay small. */
export function rleDecode(rle) {
  return rle.map((line) => { let s = ''; for (const tok of line.split(',')) s += tok[0].repeat(+tok.slice(1)); return s; });
}
export function rleEncode(rows) {
  return rows.map((s) => { const o = []; let i = 0; while (i < s.length) { let j = i; while (j < s.length && s[j] === s[i]) j++; o.push(`${s[i]}${j - i}`); i = j; } return o.join(','); });
}

/** Mirror a drill result left-right and/or top-bottom (finds, mouth and tunnel together). */
export function mirrorResult(res, flipX, flipY) {
  const { w, h } = res.tunnel.board, cell = res.tunnel.cell;
  const gwu = res.tunnel.w * cell, ghu = res.tunnel.h * cell;   // flip about the grid's own edge, so cells and positions stay in step
  const fx = (x) => (flipX ? gwu - x : x), fy = (y) => (flipY ? ghu - y : y);
  let rows = res.tunnel.rows ? res.tunnel.rows.slice() : rleDecode(res.tunnel.rle);
  if (flipY) rows = rows.slice().reverse();
  if (flipX) rows = rows.map((s) => s.split('').reverse().join(''));
  return {
    ...res,
    finds: res.finds.map((f) => ({ ...f, x: Math.round(fx(f.x)), y: Math.round(fy(f.y)) })),
    tunnel: { cell, w: res.tunnel.w, h: res.tunnel.h, rows, entry: { x: Math.round(fx(res.tunnel.entry.x)), y: Math.round(fy(res.tunnel.entry.y)) }, board: { w, h } },
  };
}

const idx = (B, gx, gy) => gy * B.gw + gx;
export const cellAt = (B, x, y) => {
  const gx = Math.floor(x / B.cell), gy = Math.floor(y / B.cell);
  return gx < 0 || gy < 0 || gx >= B.gw || gy >= B.gh ? -1 : gy * B.gw + gx;
};
export const isOpenAt = (B, x, y) => { const c = cellAt(B, x, y); return c >= 0 && B.open[c] === 1; };

/**
 * Build the board from a drill result.
 * `items` is the host's record map: { [id]: { name, icon, colour, shards } }.
 */
export function buildBoard({ result, items = {}, quick = false } = {}) {
  const T = result.tunnel;
  const cell = T.cell, gw = T.w, gh = T.h, W = T.board.w, H = T.board.h;
  const rows = T.rows || rleDecode(T.rle);
  const raw = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) raw[gy * gw + gx] = rows[gy].charCodeAt(gx) === 49 ? 1 : 0;
  const B = { W, H, cell, gw, gh, raw, open: new Uint8Array(gw * gh), core: new Int8Array(gw * gh).fill(-1), shell: new Int8Array(gw * gh).fill(-1), items, quick: !!quick };

  // The finds, with their core and shell cells. A find's core is rock until the claw lifts it.
  B.finds = result.finds.map((f, i) => {
    const it = items[f.item] || {};
    return {
      i, item: f.item, kind: f.kind || 'ore', name: it.name || f.item, colour: it.colour || ({ ore: '#d0a070', gem: '#6fc3ff', relic: '#ffb36b', oddity: '#e6a8ff' })[f.kind] || '#ffffff',
      icon: it.icon || null, shards: it.shards || null, main: i === 0, x: f.x, y: f.y, r: f.r, cracks: f.cracks | 0, freed: f.freed || 0, drillFreed: !!f.isFreed,
    };
  });
  B.finds.forEach((f, i) => {
    const reach = f.r + SHELL + cell;
    for (let gy = Math.max(0, Math.floor((f.y - reach) / cell)); gy <= Math.min(gh - 1, Math.floor((f.y + reach) / cell)); gy++) {
      for (let gx = Math.max(0, Math.floor((f.x - reach) / cell)); gx <= Math.min(gw - 1, Math.floor((f.x + reach) / cell)); gx++) {
        const c = gy * gw + gx, d = Math.hypot((gx + 0.5) * cell - f.x, (gy + 0.5) * cell - f.y);
        if (d <= f.r) { B.core[c] = i; raw[c] = 0; } else if (d <= f.r + SHELL && B.core[c] < 0 && B.shell[c] < 0) B.shell[c] = i;
      }
    }
  });

  // The mouth: the open cell nearest the entry on the rim; ground counts only if it joins up with it.
  const ex = T.entry.x, ey = T.entry.y;
  let start = -1, bd = 1e9;
  const lim = Math.ceil(70 / cell);
  for (let gy = Math.max(0, Math.floor(ey / cell) - lim); gy <= Math.min(gh - 1, Math.floor(ey / cell) + lim); gy++) {
    for (let gx = Math.max(0, Math.floor(ex / cell) - lim); gx <= Math.min(gw - 1, Math.floor(ex / cell) + lim); gx++) {
      const c = gy * gw + gx; if (!raw[c]) continue;
      const d = Math.hypot((gx + 0.5) * cell - ex, (gy + 0.5) * cell - ey);
      if (d < bd) { bd = d; start = c; }
    }
  }
  if (start < 0) { start = cellAt({ cell, gw, gh }, Math.min(W - 1, Math.max(1, ex)), Math.min(H - 1, Math.max(1, ey))); raw[start] = 1; }
  const stack = [start]; B.open[start] = 1;
  while (stack.length) {
    const c = stack.pop(), gx = c % gw, gy = (c / gw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const n = ny * gw + nx;
      if (raw[n] && !B.open[n]) { B.open[n] = 1; stack.push(n); }
    }
  }
  B.openCount = B.open.reduce((a, v) => a + v, 0);
  // Where the claw "comes out": the roomiest open ground a little way in from the rim, so the load is never dragged along the rim's own edge
  {
    let bestC = start, bestScore = -1e9;
    for (let gy = Math.max(0, Math.floor(ey / cell) - 7); gy <= Math.min(gh - 1, Math.floor(ey / cell) + 7); gy++) {
      for (let gx = Math.max(0, Math.floor(ex / cell) - 7); gx <= Math.min(gw - 1, Math.floor(ex / cell) + 7); gx++) {
        const c = gy * gw + gx; if (!B.open[c]) continue;
        const x = (gx + 0.5) * cell, y = (gy + 0.5) * cell, de = Math.hypot(x - ex, y - ey);
        if (de < 14 || de > 56) continue;
        const sc = probe(B, x, y, 24).d - 0.12 * de;
        if (sc > bestScore) { bestScore = sc; bestC = c; }
      }
    }
    start = bestC;
  }
  // Which way is out: from the middle of the rock through the entry (the rock sits in the middle of the board in the drill).
  const ox = ex - W / 2, oy = ey - H / 2, ol = Math.hypot(ox, oy) || 1;
  B.out = { x: ox / ol, y: oy / ol };
  const sx = ((start % gw) + 0.5) * cell, sy = (((start / gw) | 0) + 0.5) * cell;
  // the mouth is where the load leaves the rock: on the rim, and the head starts a little inside it
  B.mouth = { x: ex, y: ey };
  B.start = { x: sx, y: sy };
  B.rock = rockOutline(B, T.entry);
  return B;
}

/** The rock's outline for drawing: an ellipse through the mouth, grown to hold every open cell and find. The drill's own outline is not in its result. */
function rockOutline(B, entry) {
  const cx = B.W / 2, cy = B.H / 2, ratio = B.H / B.W;
  // an ellipse of the board's shape through the entry
  const k0 = Math.hypot((entry.x - cx) / 1, (entry.y - cy) / ratio);
  let rx = k0, ry = k0 * ratio;
  const need = (x, y, pad) => Math.hypot((x - cx) / (rx + pad), (y - cy) / (ry + pad * ratio));
  let grow = 1;
  for (let gy = 0; gy < B.gh; gy++) for (let gx = 0; gx < B.gw; gx++) if (B.open[gy * B.gw + gx]) grow = Math.max(grow, need((gx + 0.5) * B.cell, (gy + 0.5) * B.cell, 22));
  for (const f of B.finds) grow = Math.max(grow, need(f.x, f.y, f.r + SHELL + 8));
  rx *= grow; ry *= grow;
  rx = Math.min(rx, B.W / 2 - 8); ry = Math.min(ry, B.H / 2 - 8);
  return { cx, cy, rx, ry };
}

/**
 * The nearest solid thing to a point: the distance from (x, y) to the edge of the nearest rock cell, and the way to push out of it.
 * Outside the board counts as rock. `max` is how far to look; beyond it the answer is `max`.
 */
export function probe(B, x, y, max = 40) {
  const cell = B.cell, k = Math.ceil(max / cell) + 1;
  const gx0 = Math.floor(x / cell), gy0 = Math.floor(y / cell);
  let best = max, nx = 0, ny = 0;
  for (let gy = gy0 - k; gy <= gy0 + k; gy++) {
    for (let gx = gx0 - k; gx <= gx0 + k; gx++) {
      const solid = gx < 0 || gy < 0 || gx >= B.gw || gy >= B.gh || B.open[gy * B.gw + gx] === 0;
      if (!solid) continue;
      const x0 = gx * cell, y0 = gy * cell;
      const qx = Math.max(x0, Math.min(x0 + cell, x)), qy = Math.max(y0, Math.min(y0 + cell, y));
      const dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
      if (d < best) { best = d; if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = x - (x0 + cell / 2); ny = y - (y0 + cell / 2); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; } }
    }
  }
  return { d: best, nx, ny };
}

/** Open the cells a find's core held once it is lifted out. */
export function openCore(B, i) {
  for (let c = 0; c < B.core.length; c++) if (B.core[c] === i) { B.core[c] = -1; B.open[c] = 1; }
}
/** Put the core back (the find is set down inside the rock again is never needed, but tests use it). */
export function coreCells(B, i) { const out = []; for (let c = 0; c < B.core.length; c++) if (B.core[c] === i) out.push(c); return out; }

/**
 * Can the jaws close on this find from where the head is? They close from the side the head is on, so that side has to be cleared:
 * the straight line in and the two points where the jaws land either side of it must be open ground. Returns { ok, why }.
 */
export function graspCheck(B, f, hx, hy, reach, i = f.i) {
  const dx = f.x - hx, dy = f.y - hy, d = Math.hypot(dx, dy);
  if (d > f.r + reach) return { ok: false, why: 'far' };
  const ux = dx / (d || 1), uy = dy / (d || 1);
  const open = (x, y) => { const c = cellAt(B, x, y); return c >= 0 && (B.open[c] === 1 || B.core[c] === i); };
  // the straight line in
  for (let s = 0; s <= d - f.r * 0.6; s += 4) if (!open(hx + ux * s, hy + uy * s)) return { ok: false, why: 'buried' };
  // where the jaws land either side of the line, on the core's skin
  const a0 = Math.atan2(-uy, -ux);
  for (const da of [-0.62, 0.62]) {
    const a = a0 + da;
    if (!open(f.x + Math.cos(a) * (f.r + 5), f.y + Math.sin(a) * (f.r + 5))) return { ok: false, why: 'buried' };
  }
  return { ok: true, why: '' };
}

/** A lying (dropped) find is loose in the open: the jaws close from any side. */
export function looseCheck(f, hx, hy, reach) { return Math.hypot(f.x - hx, f.y - hy) <= reach + f.r ? { ok: true, why: '' } : { ok: false, why: 'far' }; }

// ---------------------------------------------------------------------------------------------------------------------
// A rolled board: a real drill result from the fixtures, picked and mirrored by the seed.

/** Pick the layout the screen wants and a result from the fixtures; mirror it by the seed so a second seed is not the same board. */
export function pickResult({ seed = 1, layout = 'tall', quick = false, fixtures = {} } = {}) {
  const all = (fixtures.results || []).filter((r) => !!r.quick === !!quick);
  let list = all.filter((r) => r.layout === layout);
  if (!list.length) list = all;
  if (!list.length) return null;
  const r = roller({ rng: hashSeed('claw-pull', 'pick', seed, layout, quick ? 'q' : 'f') });
  const pick = list[Math.floor(r.next() * list.length)];
  const flipX = r.next() < 0.5, flipY = r.next() < 0.5;
  return { result: mirrorResult({ ...pick, tunnel: { ...pick.tunnel, rows: pick.tunnel.rows || rleDecode(pick.tunnel.rle) } }, flipX, flipY), flipX, flipY, name: pick.name || `${pick.layout}-${pick.seed}` };
}

/**
 * Quick mode: a straight shaft and one find. Keeps the result's main find, its cracks and its mouth, and cuts a straight shaft from the mouth
 * to the find with a cleared pocket round it, so the short version is always a straight pull.
 */
export function straightShaft(result) {
  const T = result.tunnel, cell = T.cell, W = T.board.w, H = T.board.h;
  const f0 = result.finds[0], ex = T.entry.x, ey = T.entry.y;
  const rows = Array.from({ length: T.h }, () => new Array(T.w).fill('0'));
  const dx = f0.x - ex, dy = f0.y - ey, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const half = 21;
  const put = (x, y, rad) => {
    for (let gy = Math.max(0, Math.floor((y - rad) / cell)); gy <= Math.min(T.h - 1, Math.floor((y + rad) / cell)); gy++) {
      for (let gx = Math.max(0, Math.floor((x - rad) / cell)); gx <= Math.min(T.w - 1, Math.floor((x + rad) / cell)); gx++) {
        if (Math.hypot((gx + 0.5) * cell - x, (gy + 0.5) * cell - y) <= rad) rows[gy][gx] = '1';
      }
    }
  };
  for (let s = 0; s <= L - f0.r * 0.6; s += 4) put(ex + ux * s + ux * 6, ey + uy * s + uy * 6, half);
  // the pocket: the ring round the core, cleared on the shaft's side and a good way round
  for (let a = 0; a < Math.PI * 2; a += 0.1) { for (let rr = f0.r + 2; rr <= f0.r + 30; rr += 6) put(f0.x + Math.cos(a) * rr, f0.y + Math.sin(a) * rr, 8); }
  return { ...result, finds: [{ ...f0 }], tunnel: { cell, w: T.w, h: T.h, rows: rows.map((r) => r.join('')), entry: { ...T.entry }, board: { w: W, h: H } } };
}

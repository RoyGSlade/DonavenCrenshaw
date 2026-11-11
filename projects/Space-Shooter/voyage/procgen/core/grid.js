// The shared cell grid every layer places onto: what each cell is, what sits
// on it, what is kept clear, and the walk checks (flood fill and shortest path)
// behind the hard guarantees. Pure data, no DOM.

export const OUT = 0;     // outside the map (solid, not drawn)
export const WALL = 1;    // wall (solid)
export const WINDOW = 2;  // window wall (solid)
export const FLOOR = 3;   // open floor
export const DOOR = 4;    // a doorway cell: walkable, never built on
export const ROCK = 5;    // outdoor impassable rock (solid)

export const isSolidType = (t) => t === OUT || t === WALL || t === WINDOW || t === ROCK;
export const isWallType = (t) => t === WALL || t === WINDOW || t === ROCK;

export class Grid {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.type = new Uint8Array(w * h);        // OUT by default
    this.obj = new Int16Array(w * h).fill(-1);   // object-layer prop index
    this.flr = new Int16Array(w * h).fill(-1);   // floor-layer prop index (rugs, vents, hatches)
    this.block = new Uint8Array(w * h);       // 1 = a prop stops walking here
    this.res = new Int16Array(w * h).fill(-2);   // -2 free, -1 kept clear for everyone, n = kept clear for prop n's group
    this.mark = new Array(w * h).fill(null);  // grid char overrides for open cells (':' pad, 'p' path, ...)
  }
  idx(x, y) { return y * this.w + x; }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  t(x, y) { return this.in(x, y) ? this.type[y * this.w + x] : OUT; }
  isFloor(x, y) { return this.t(x, y) === FLOOR; }
  isWall(x, y) { return isWallType(this.t(x, y)); }
  /** walkable now: floor or doorway, and no blocking prop */
  walk(x, y) {
    if (!this.in(x, y)) return false;
    const i = y * this.w + x, t = this.type[i];
    return (t === FLOOR || t === DOOR) && !this.block[i];
  }
  forEach(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y, this.idx(x, y)); }
  count(fn) { let n = 0; this.forEach((x, y, i) => { if (fn(x, y, i)) n++; }); return n; }

  /** Flood fill from start cells over `pass(x, y)`; returns a visited mask and count. */
  flood(starts, pass = (x, y) => this.walk(x, y)) {
    const seen = new Uint8Array(this.w * this.h);
    const queue = new Int32Array(this.w * this.h);
    let head = 0, tail = 0, n = 0;
    for (const [x, y] of starts) {
      if (!this.in(x, y) || !pass(x, y)) continue;
      const i = this.idx(x, y);
      if (seen[i]) continue;
      seen[i] = 1; queue[tail++] = i; n++;
    }
    while (head < tail) {
      const i = queue[head++];
      const x = i % this.w, y = (i - x) / this.w;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 3 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 0 ? 1 : k === 2 ? -1 : 0);
        if (!this.in(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (seen[j] || !pass(nx, ny)) continue;
        seen[j] = 1; queue[tail++] = j; n++;
      }
    }
    return { seen, n };
  }

  /**
   * Shortest 4-way path from any start to any goal over `pass`, with an
   * optional per-cell extra cost (Dijkstra on small grids). Returns cells or null.
   */
  path(starts, goals, pass = (x, y) => this.walk(x, y), cost = null) {
    const N = this.w * this.h;
    const goal = new Uint8Array(N);
    for (const [x, y] of goals) if (this.in(x, y)) goal[this.idx(x, y)] = 1;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const open = []; // tiny binary heap of [d, i]
    const push = (d, i) => { open.push([d, i]); let c = open.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; } };
    const pop = () => { const top = open[0]; const last = open.pop(); if (open.length) { open[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m; } } return top; };
    for (const [x, y] of starts) if (this.in(x, y) && pass(x, y)) { const i = this.idx(x, y); dist[i] = 0; push(0, i); }
    while (open.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      if (goal[i]) {
        const out = [];
        for (let c = i; c >= 0; c = prev[c]) out.push([c % this.w, Math.floor(c / this.w)]);
        return out.reverse();
      }
      const x = i % this.w, y = (i - x) / this.w;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 3 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 0 ? 1 : k === 2 ? -1 : 0);
        if (!this.in(nx, ny) || !pass(nx, ny)) continue;
        const j = this.idx(nx, ny);
        const nd = d + 1 + (cost ? cost(nx, ny) : 0);
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(nd, j); }
      }
    }
    return null;
  }
}

/** Rect helpers (tile units, integer). */
export const rectCells = (r) => { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]); return out; };
export const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const rectCenter = (r) => [r.x + r.w / 2, r.y + r.h / 2];
/** Gap between two rects in tiles (0 = touching or overlapping), Chebyshev. */
export function rectGap(a, b) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.max(dx, dy);
}

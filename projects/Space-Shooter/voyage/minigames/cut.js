// Cut (v2/PLAN.md section 4.3): follow the outline of the part with the blade. Pure, seeded, no DOM and no clock of its own:
// the view feeds pointer events with their own time stamps (seconds), so a test can play any hand at any speed.
//
// The board is 1000 x 680 units on every screen. The outline is a six-cornered part scribed on the sheet. Press on the start
// mark and drag round it. The game takes a sample every 8 units of travel along your path. A sample COUNTS when it is inside the
// line's width (half the width either side of the scribe) and the feed is under the feed speed (faster tears the cut). The grade
// is the share of the outline that was cut cleanly, spread over every sample you took (so skipping a stretch and wandering about
// both cost): grade = 100 x cut targets / the larger of (targets, samples), less 5 for each gouge (a stray of more than three
// line-widths). 95 is perfect, 85 clean, 70 passes. Lift and carry on from within 20 units of where you stopped.
// The numbers (line width by cutter and roll, feed speed by Speed points, the dotted guide) come from setup.js setupCut.
import { step as rngStep, hashSeed } from '../quests/rng.js';
import { PASS, gradeWord } from './craftChain.js';

export const BOARD = Object.freeze({ w: 1000, h: 680 });
export const SAMPLE = 8;       // units of travel between samples
export const START_R = 20;     // press this close to the start mark, or to where you lifted, to carry on
export const GOUGE_WIDTHS = 3; // straying past this many line-widths gouges the sheet
export const GOUGE_COST = 5;
export const REACH = 5;        // a counting sample cuts the outline targets within this arc length of where it lands

/** The part's outline: `corners` vertices, jittered, scribed inside the board. Seeded. */
export function outlineOf(seed = 1, corners = 6) {
  let rng = hashSeed('cut-outline', seed, corners);
  const rand = () => { const [v, next] = rngStep(rng); rng = next; return v; };
  const pts = [];
  for (let i = 0; i < corners; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * (i + (rand() - 0.5) * 0.36)) / corners;
    const r = 1 + (rand() - 0.5) * 0.24;
    pts.push({ x: Math.round((500 + 395 * r * Math.cos(a)) * 10) / 10, y: Math.round((340 + 250 * r * Math.sin(a)) * 10) / 10 });
  }
  return pts;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createCut({ seed = 1, setup = {}, poly = null } = {}) {
  const corners = setup.corners ?? 6;
  const shape = poly || outlineOf(seed, corners);
  const edges = []; let perimeter = 0;
  for (let i = 0; i < shape.length; i++) { const a = shape[i], b = shape[(i + 1) % shape.length], len = dist(a, b); edges.push({ a, b, len, at: perimeter }); perimeter += len; }
  const N = Math.max(8, Math.round(perimeter / SAMPLE));
  const step = perimeter / N;
  const targets = [];
  for (let i = 0; i < N; i++) targets.push(pointAt({ edges, perimeter }, i * step));
  const width = setup.width ?? 12;
  return {
    seed, poly: shape, edges, perimeter, N, step, targets, start: shape[0],
    width, half: width / 2, feed: setup.feed ?? 300, guide: Boolean(setup.guide), tool: setup.tool ?? 'shop', setup,
    covered: new Array(N).fill(0), coveredCount: 0, good: 0, torn: 0, off: 0, total: 0, gouges: 0, inGouge: false, travel: 0,
    down: false, started: false, last: null, lastT: 0, carry: 0, speed: 0, strokes: [], events: [], t: 0, done: false, result: null,
  };
}

/** A point on the outline at an arc length. */
export function pointAt(o, arc) {
  let a = ((arc % o.perimeter) + o.perimeter) % o.perimeter;
  for (const e of o.edges) { if (a <= e.at + e.len + 1e-9) { const k = e.len ? (a - e.at) / e.len : 0; return { x: e.a.x + (e.b.x - e.a.x) * k, y: e.a.y + (e.b.y - e.a.y) * k, arc: a }; } }
  const e = o.edges[o.edges.length - 1]; return { x: e.b.x, y: e.b.y, arc: o.perimeter };
}

/** Distance from a point to the outline, and the arc length of the nearest point on it. */
export function nearest(s, x, y) {
  let best = Infinity, arc = 0;
  for (const e of s.edges) {
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
    const k = e.len ? Math.max(0, Math.min(1, ((x - e.a.x) * dx + (y - e.a.y) * dy) / (e.len * e.len))) : 0;
    const d = Math.hypot(x - (e.a.x + dx * k), y - (e.a.y + dy * k));
    if (d < best) { best = d; arc = e.at + k * e.len; }
  }
  return { d: best, arc };
}

/** The grade so far (0..100). */
export function gradeOf(s) {
  const denom = Math.max(s.N, s.total);
  const raw = (100 * s.coveredCount) / denom - GOUGE_COST * s.gouges;
  return Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
}

/** Press the blade down. The first press must be on the start mark; later ones within 20 units of where you lifted (`radius` lets a touch screen allow a fingertip's width). Returns true if taken. */
export function cutDown(s, x, y, t = 0, { radius = START_R } = {}) {
  if (s.done) return false;
  const from = s.started ? s.last : s.start;
  if (Math.hypot(x - from.x, y - from.y) > radius) { s.events.push({ type: 'miss-start' }); return false; }
  s.down = true; s.started = true; s.last = { x, y }; s.lastT = t; s.carry = 0; s.speed = 0;
  s.strokes.push([]);
  s.events.push({ type: 'down', x, y });
  return true;
}

/** Lift the blade. */
export function cutUp(s) { if (s.down) { s.down = false; s.events.push({ type: 'up' }); } }

/** Move the blade to (x, y) at time t (seconds). Takes a sample for every 8 units of travel along the way. */
export function cutMove(s, x, y, t = 0) {
  if (s.done || !s.down) return s;
  const d = Math.hypot(x - s.last.x, y - s.last.y);
  const dt = Math.max(0.004, t - s.lastT);
  const v = d / dt;
  s.speed = v;
  if (d > 0) {
    const ux = (x - s.last.x) / d, uy = (y - s.last.y) / d;
    let at = SAMPLE - s.carry;
    while (at <= d + 1e-9) { sample(s, s.last.x + ux * at, s.last.y + uy * at, v); at += SAMPLE; }
    s.carry = d - (at - SAMPLE);
    s.travel += d;
  }
  s.last = { x, y }; s.lastT = t; s.t = t;
  if (!s.done) tryClose(s);
  return s;
}

function sample(s, x, y, v) {
  const { d, arc } = nearest(s, x, y);
  s.total++;
  let kind;
  if (d > GOUGE_WIDTHS * s.width) { kind = 'gouge'; if (!s.inGouge) { s.gouges++; s.inGouge = true; s.events.push({ type: 'gouge', x, y }); } }
  else {
    s.inGouge = false;
    if (d <= s.half) {
      if (v <= s.feed + 1e-9) {
        kind = 'good'; s.good++;
        const lo = Math.floor((arc - REACH) / s.step), hi = Math.ceil((arc + REACH) / s.step);
        for (let i = lo; i <= hi; i++) {
          const idx = ((i % s.N) + s.N) % s.N, ta = idx * s.step;
          let da = Math.abs(ta - arc); da = Math.min(da, s.perimeter - da);
          if (da <= REACH + 1e-9 && !s.covered[idx]) { s.covered[idx] = 1; s.coveredCount++; }
        }
      } else { kind = 'torn'; s.torn++; s.events.push({ type: 'torn', x, y }); }
    } else { kind = 'off'; s.off++; }
  }
  const stroke = s.strokes[s.strokes.length - 1];
  if (stroke) stroke.push({ x, y, k: kind });
}

/** The loop is closed when you are back on the start mark with most of the outline cut: the part drops free by itself. */
function tryClose(s) {
  if (s.coveredCount < 0.8 * s.N || s.travel < 0.8 * s.perimeter) return;
  if (Math.hypot(s.last.x - s.start.x, s.last.y - s.start.y) <= SAMPLE * 2) cutFinish(s, 'closed');
}

/** End the cut now (the Done button, or the loop closing). Returns the result. */
export function cutFinish(s, how = 'done') {
  if (s.done) return s.result;
  s.done = true; s.down = false;
  const grade = gradeOf(s);
  s.result = {
    success: grade >= PASS, grade, word: gradeWord(grade), how, share: Math.round((1000 * s.coveredCount) / s.N) / 10, good: s.good, torn: s.torn, off: s.off, total: s.total,
    gouges: s.gouges, targets: s.N, tool: s.tool, width: s.width, feed: s.feed,
  };
  s.events.push({ type: 'done', ...s.result });
  return s.result;
}

/** Plain words for what ruined the cut (for the grade card): the biggest loss. */
export function cutWhy(r) {
  if (!r || r.grade >= 95) return '';
  const lost = [['gouges', r.gouges * GOUGE_COST], ['torn by feeding too fast', (100 * r.torn) / Math.max(r.targets, r.total)], ['wandered off the line', (100 * r.off) / Math.max(r.targets, r.total)], ['stretches left uncut', 100 - r.share]];
  lost.sort((a, b) => b[1] - a[1]);
  const [name, n] = lost[0];
  if (n < 1) return '';
  return name === 'gouges' ? `${r.gouges} gouge${r.gouges === 1 ? '' : 's'} cost ${r.gouges * GOUGE_COST}.` : name === 'stretches left uncut' ? `${Math.round(100 - r.share)}% of the outline is uncut.` : `Mostly ${name} (${Math.round(n)}%).`;
}

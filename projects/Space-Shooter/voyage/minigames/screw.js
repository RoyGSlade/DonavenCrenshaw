// Screw (v2/PLAN.md section 4.3): circle the mouse (or a finger) round the bolt head. Pure and seeded-free: the view feeds
// pointer positions; a test can play any hand. The close-up is 500 x 500 units with the bolt in the middle (the plan's 1000-wide
// board is for the sheet games; this one is a close-up so the ring is a thumb's width on a phone).
//
//   Clockwise tightens, the other way loosens. Hold inside the ring round the head (40 to 110 units out): step outside it
//   while turning and the driver SLIPS: no progress and a quarter turn lost.
//   The bolt takes `turns` turns (4 at a Steady roll, less with Speed points and a good roll, more with a bad one).
//   The LAST turn has a torque bar. Let go (lift) while the bar is in the green (the last `zone` of the last turn) and the bolt is
//   snug: done. Let go short of the green and it is LOOSE, not done: put the finger back and carry on. Let go a little past the end
//   (up to a quarter turn over) and it is over-tight: done, but it counts as a slip. Keep turning past a quarter turn over the end
//   and the head STRIPS: back it all the way out the other way; it costs a bolt.
//   Grade = 100 - 5 per slip (and per over-tight) - 15 per stripped bolt. The game also ends when the grade can no longer reach 70.
import { PASS, gradeWord } from './craftChain.js';

export const SIZE = 500;
export const SLIP_COST = 5, STRIP_COST = 15, SLIP_TURN = 0.25;
const TAU = Math.PI * 2;

export function createScrew({ setup = {} } = {}) {
  return {
    cx: SIZE / 2, cy: SIZE / 2, T: setup.turns ?? 4, zone: setup.zone ?? 0.15, strip: setup.strip ?? 0.25, ringIn: setup.ringIn ?? 40, ringOut: setup.ringOut ?? 110, setup,
    turns: 0, theta: 0, down: false, engaged: false, status: 'turning', loose: false, slips: 0, over: 0, stripped: 0, slipFlash: 0,
    events: [], done: false, result: null, travel: 0,
  };
}

/** Where the bar starts and where the green begins, in turns. */
export const lastTurnStart = (s) => s.T - 1;
export const greenFrom = (s) => s.T - s.zone * 1;
/** 0..1 across the torque bar (the last turn), beyond 1 up to 1 + strip is the over-tight stretch. */
export const torque = (s) => s.turns - (s.T - 1);
export const inLastTurn = (s) => s.status === 'turning' && s.turns >= s.T - 1 - 1e-9;
export const inGreen = (s) => s.status === 'turning' && s.turns >= greenFrom(s) - 1e-9 && s.turns <= s.T + 1e-9;
export const gradeOf = (s) => Math.max(0, 100 - SLIP_COST * (s.slips + s.over) - STRIP_COST * s.stripped);

const polar = (s, x, y) => { const dx = x - s.cx, dy = y - s.cy; return { r: Math.hypot(dx, dy), a: Math.atan2(dy, dx) }; };
const inRing = (s, r) => r >= s.ringIn - 1e-9 && r <= s.ringOut + 1e-9;

/** Put the driver down at (x, y). Inside the ring it takes hold; outside it does nothing (no slip: it never gripped). */
export function screwDown(s, x, y) {
  if (s.done) return s;
  const p = polar(s, x, y);
  s.down = true; s.loose = false;
  s.engaged = inRing(s, p.r); s.theta = p.a;
  return s;
}

/** Move the driver. Clockwise on the screen is positive. */
export function screwMove(s, x, y) {
  if (s.done || !s.down) return s;
  const p = polar(s, x, y);
  const ring = inRing(s, p.r);
  if (s.engaged && !ring) {
    // the driver slips off the head
    s.engaged = false;
    if (s.status === 'turning') { s.turns = Math.max(0, s.turns - SLIP_TURN); s.slips++; s.slipFlash = 1; s.events.push({ type: 'slip', turns: s.turns }); check(s); }
    return s;
  }
  if (!s.engaged) { if (ring) { s.engaged = true; s.theta = p.a; } return s; }
  let d = p.a - s.theta;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  s.theta = p.a;
  if (Math.abs(d) > 2.6) return s; // a jump across the head: not a turn
  const dt = d / TAU;
  s.travel += Math.abs(dt);
  if (s.status === 'stripped') {
    if (dt < 0) { s.turns = Math.max(0, s.turns + dt); if (s.turns <= 0) { s.status = 'turning'; s.turns = 0; s.events.push({ type: 'backed-out', stripped: s.stripped }); } }
    return s;
  }
  s.loose = false;
  s.turns = Math.max(0, s.turns + dt);
  if (s.turns >= s.T + s.strip - 1e-9) {
    s.turns = s.T + s.strip; s.status = 'stripped'; s.stripped++; s.events.push({ type: 'strip', stripped: s.stripped });
    check(s);
  }
  return s;
}

/** Lift the driver. In the last turn this is "stop": in the green it is snug and done; short of it the bolt is loose. */
export function screwUp(s) {
  if (s.done || !s.down) return s;
  s.down = false; s.engaged = false;
  if (s.status !== 'turning' || s.turns < s.T - 1 - 1e-9) return s; // before the last turn a lift is only a rest
  if (s.turns < greenFrom(s) - 1e-9) { s.loose = true; s.events.push({ type: 'loose', turns: s.turns }); return s; }
  if (s.turns > s.T + 1e-9) { s.over++; s.events.push({ type: 'over' }); }
  finish(s, 'snug');
  return s;
}

function check(s) { if (!s.done && gradeOf(s) < PASS) finish(s, 'rough'); }

/** Give the bolt up (the Give up button): a failed bolt, grade 0. */
export function screwGiveUp(s) { if (!s.done) finish(s, 'gave-up'); return s.result; }

function finish(s, how) {
  s.done = true; s.down = false; s.engaged = false;
  const grade = how === 'gave-up' ? 0 : gradeOf(s);
  s.result = { success: grade >= PASS, grade, word: gradeWord(grade), how, slips: s.slips, over: s.over, stripped: s.stripped, turns: Math.round(s.turns * 1000) / 1000, T: s.T, zone: s.zone };
  s.events.push({ type: 'done', ...s.result });
}

export function screwWhy(r) {
  if (!r || r.grade >= 95) return '';
  const bits = [];
  if (r.stripped) bits.push(`${r.stripped} stripped bolt${r.stripped === 1 ? '' : 's'} (-${r.stripped * STRIP_COST})`);
  if (r.slips) bits.push(`${r.slips} slip${r.slips === 1 ? '' : 's'} (-${r.slips * SLIP_COST})`);
  if (r.over) bits.push(`over-tight (-${r.over * SLIP_COST})`);
  if (r.how === 'gave-up') bits.push('given up');
  return bits.join(', ') + (bits.length ? '.' : '');
}

// The AI pilot for the new game's solo dogfights (launch arena lane). Pure: it
// reads a match and returns the same controls a human's keys would, so the host
// feeds it to stepMatch like any other seat. No DOM, no randomness (it wobbles
// on the match tick, so the same match plays the same way).
//
// What it does, in the order it thinks about it:
//   1. hazards first: walls, rocks and wreckage ahead, and the Stormworks vents
//      when they are about to go live, turn it away before anything else;
//   2. pick the nearest live enemy (and stay on it a couple of seconds, so a
//      free-for-all is not a twitchy mess);
//   3. close in to a fighting range, then circle at it, flipping direction now
//      and then so it can be shot at;
//   4. fire when its nose is on the lead-aimed shot, the gun is cool and no
//      cover is in the way. Its aim carries a small deliberate wobble, so it is
//      beatable: it is the paycheck, not the boss.
import { RULES, NEUTRAL } from "./simulation.js";
import { ventPhase } from "./maps.js";
import { shipStats } from "./ships.js";

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// How a seat flies, by skill. Higher aimWobble = worse shot.
// Today's guns kill in two hits, so a bot has to be slow to line up, not just
// inaccurate: it must hold its nose on you for `reaction` seconds before it fires.
export const BOT_SKILL = Object.freeze({
  rookie: Object.freeze({ aimTolerance: 0.11, aimWobble: 0.1, reaction: 0.45 }),
  regular: Object.freeze({ aimTolerance: 0.13, aimWobble: 0.08, reaction: 0.35 }),
});
export const BOT = Object.freeze({
  fightRange: 7.5,
  closeRange: 3.6,
  fireRange: 14,
  retarget: 2.5,   // seconds before it may switch target
  flip: 4.2,       // seconds between flips of the circling direction
  lookahead: 2.6,
  wall: 2.4,
});

const rectDistance = (x, y, r) => {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width)), dy = Math.max(r.y - y, 0, y - (r.y + r.height));
  return Math.hypot(dx, dy);
};

// Is a straight shot from a to b blocked by cover? (Destructible or not: a shot into
// cover is a wasted shot either way.)
function blocked(match, a, b, ignore = 0.6) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return false;
  for (const o of match.obstacles) {
    if (o.hp === 0) continue;
    const t = clamp(((o.x - a.x) * dx + (o.y - a.y) * dy) / len2, 0, 1);
    const px = a.x + dx * t, py = a.y + dy * t;
    if (Math.hypot(px - o.x, py - o.y) < o.radius && Math.hypot(o.x - b.x, o.y - b.y) > ignore) return true;
  }
  return false;
}

/** The controls for one bot seat this tick. `mem` is a per-seat scratch object the caller keeps. */
export function botControls(match, seat, mem = {}) {
  const me = match.ships[seat];
  if (!me || me.hp <= 0 || match.phase !== "playing") return { ...NEUTRAL };
  const t = match.tick / 60;
  const myRadius = shipStats(me).radius;

  // 2. target: the nearest live enemy, kept for a while.
  const enemies = match.ships.filter((s) => s.id !== seat && s.hp > 0);
  if (!enemies.length) return { ...NEUTRAL };
  let target = enemies.find((s) => s.id === mem.target);
  const nearest = enemies.reduce((best, s) => (Math.hypot(s.x - me.x, s.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y) ? s : best), enemies[0]);
  if (!target || (t - (mem.targetAt ?? -99) > BOT.retarget && nearest.id !== target.id)) {
    target = nearest;
    mem.target = target.id;
    mem.targetAt = t;
  }
  const dx = target.x - me.x, dy = target.y - me.y;
  const range = Math.hypot(dx, dy) || 1;
  const lead = range / RULES.bulletSpeed;
  const skill = BOT_SKILL[mem.skill] || BOT_SKILL.rookie;
  const wobble = Math.sin(t * 2.3 + seat * 1.7) * skill.aimWobble + (hash(Math.floor(t * 2) + seat * 13) - 0.5) * skill.aimWobble;
  const aim = Math.atan2(dy + (target.vy || 0) * lead, dx + (target.vx || 0) * lead) + wobble;

  // 3. where it wants to point.
  const flipSide = Math.floor((t + seat * 1.3) / BOT.flip) % 2 ? 1 : -1;
  let want;
  let thrust = true;
  if (range > BOT.fightRange) want = aim;
  else if (range < BOT.closeRange) { want = aim + Math.PI - flipSide * 0.6; }
  else want = ((t + seat * 0.7) % 2.6) < 1.5 ? aim : aim + flipSide * (Math.PI / 2.6); // nose on for a burst, then circle
  let brake = false;

  // 1. hazards override: steer by summing "away" pushes, strongest wins the heading.
  let ax = 0, ay = 0, danger = 0, hardBrake = false;
  const heading = me.angle;
  const speed = Math.hypot(me.vx, me.vy);
  const look = BOT.lookahead + speed * 0.25;
  for (const o of match.obstacles) {
    if (o.hp === 0) continue;
    const ox = o.x - me.x, oy = o.y - me.y, d = Math.hypot(ox, oy);
    const reach = o.radius + myRadius + 1.1;
    if (d > reach + look) continue;
    const ahead = Math.cos(wrap(Math.atan2(oy, ox) - heading)) > -0.2 || d < reach;
    if (!ahead) continue;
    const closing = (me.vx * ox + me.vy * oy) / d; // positive: flying at it
    const k = clamp(1 - (d - o.radius - myRadius) / (look + 1.1), 0, 1.4) + (closing > 2 ? Math.min(0.5, closing / 12) : 0);
    if (closing > 2.4 && d < reach + closing * 0.55) hardBrake = true;
    ax -= (ox / d) * k * 2.2; ay -= (oy / d) * k * 2.2;
    // slide round it rather than bounce: add a push sideways of the line to the rock
    ax += (-oy / d) * k * flipSide; ay += (ox / d) * k * flipSide;
    danger = Math.max(danger, k);
  }
  const phase = ventPhase(RULES.roundSeconds - match.remaining);
  const soon = ventPhase(RULES.roundSeconds - match.remaining + 1.6) === "live";
  if (phase !== "safe" || soon) {
    for (const v of match.vents || []) {
      const d = rectDistance(me.x, me.y, v);
      if (d > 2.4) continue;
      const cx = v.x + v.width / 2, cy = v.y + v.height / 2, vd = Math.hypot(me.x - cx, me.y - cy) || 1;
      const k = clamp(1.6 - d / 1.8, 0.2, 1.8);
      ax += ((me.x - cx) / vd) * k * 2.6; ay += ((me.y - cy) / vd) * k * 2.6;
      danger = Math.max(danger, Math.min(1.4, k));
    }
  }
  // walls push back toward the middle
  const w = BOT.wall;
  const px = me.x < w ? (w - me.x) / w : me.x > RULES.width - w ? -(me.x - (RULES.width - w)) / w : 0;
  const py = me.y < w ? (w - me.y) / w : me.y > RULES.height - w ? -(me.y - (RULES.height - w)) / w : 0;
  if (px || py) { ax += px * 2; ay += py * 2; danger = Math.max(danger, Math.hypot(px, py)); }
  // gravity wells and cores (Gravemaw is not a launch arena, but a bot should not die in one anyway)
  for (const f of match.fields || []) {
    if (f.type !== "gravity") continue;
    const gx = me.x - f.x, gy = me.y - f.y, d = Math.hypot(gx, gy) || 1;
    if (d < 2.6) { ax += (gx / d) * 2; ay += (gy / d) * 2; danger = Math.max(danger, 1); }
  }
  if (danger > 0.12) {
    // blend the fight heading with the way out; a close call is all escape
    const away = Math.atan2(ay, ax);
    const mix = clamp(danger * 1.1, 0, 1);
    want = Math.atan2(Math.sin(want) * (1 - mix) + Math.sin(away) * mix, Math.cos(want) * (1 - mix) + Math.cos(away) * mix);
    if (danger > 0.85 && speed > 6) brake = Math.abs(wrap(away - heading)) > 1.9;
  }
  if (hardBrake) brake = true;

  const error = wrap(want - heading);
  const aimError = Math.abs(wrap(aim - heading));
  const clear = !blocked(match, me, target);
  const turnOn = Math.abs(error) > 0.02;
  const lined = clear && aimError < skill.aimTolerance + (range < 5 ? 0.1 : 0) && range < BOT.fireRange;
  // hold the nose on the target for the reaction time before the first shot
  mem.aimed = lined ? (mem.aimed || 0) + RULES.step : Math.max(0, (mem.aimed || 0) - RULES.step * 2);
  return {
    ...NEUTRAL,
    turn: turnOn ? clamp(error * 3, -1, 1) : 0,
    thrust: thrust && !hardBrake && (danger < 0.35 || (Math.abs(error) < 0.7 && speed < 3.2)),
    brake,
    boost: danger < 0.2 && range > 13 && Math.abs(error) < 0.2 && ((match.tick + seat * 37) % 180) < 20,
    fire: !me.isOverheated && lined && mem.aimed >= skill.reaction,
  };
}

/** Keeps the per-seat scratch objects a host needs. */
export function createBots(seats, { skill = "rookie" } = {}) {
  const mem = new Map(seats.map((id) => [id, { skill }]));
  return {
    seats: new Set(seats),
    has: (id) => mem.has(id),
    controls: (match, id) => botControls(match, id, mem.get(id)),
  };
}

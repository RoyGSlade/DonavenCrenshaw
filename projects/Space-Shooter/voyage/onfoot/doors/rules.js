// Doors built into the walls, pure rules (no DOM). A door is a gap in a wall with two panels inside the wall thickness.
// Plain doorway: the panels slide apart into pockets in the wall beside the gap when someone comes close, and close
// again when nobody is near. Entry (a two-door vestibule between areas): an outer "room" door, a short vestibule, and
// the same on the other map. The room door closes behind you before anything else happens, the map change happens only
// with both doors shut, and the next room's door opens last. Everything here is plain numbers so it can be tested.

export const TUNING = Object.freeze({
  openSecs: 0.32,    // panels fully apart
  closeSecs: 0.4,    // panels fully shut
  near: 0.95,        // tiles from the gap: a body this close opens the door
  passAt: 0.72,      // open amount where a body can walk through (below it the gap is solid)
  trigger: 0.85,     // tiles in from the room door before the vestibule seals behind you
  cycleSecs: 0.9,    // both doors shut, lights cycling, before the map changes
  settleSecs: 0.5,   // arrived: both doors shut for a beat before the next room's door opens
  eps: 0.001,
});

/** Distance from a point to a rect (0 inside). */
export function rectDistance(x, y, r) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}
export const insideRect = (x, y, r, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
/** Is any body within `near` tiles of the gap? */
export const bodyNear = (rect, bodies, tile, near = TUNING.near) => bodies.some(b => b && rectDistance(b.x, b.y, rect) <= near * tile);
/** Is any body in the gap itself (a door never closes on someone)? */
export const bodyInGap = (rect, bodies, pad = 16) => bodies.some(b => b && insideRect(b.x, b.y, rect, pad));

/** One step of a panel pair's open amount (0 shut .. 1 apart). */
export function stepOpen(open, want, dt, still = false) {
  if (still) return want ? 1 : 0;
  const next = open + (want ? dt / TUNING.openSecs : -dt / TUNING.closeSecs);
  return Math.max(0, Math.min(1, next));
}
export const passable = open => open >= TUNING.passAt;

/**
 * Does the door want to be open? `mode` is the entry's hold: 'shut' (closing for a vestibule cycle: stays open only
 * while someone is in the gap), 'open' (let the arrival out), or 'free' (on approach). A locked or far door never opens.
 */
export function doorWants({ mode = 'free', near = false, locked = false, far = false, gap = false }) {
  if (far || locked) return false;
  if (mode === 'shut') return gap;
  if (mode === 'open') return true;
  return near || gap;
}

// ---- entry (two-door vestibule) sequence ---------------------------------------------------------------------
// phases: idle -> sealing -> cycling -> (swap event) gone ... arrived -> exiting -> idle
export function createEntry(arrived = false) { return { phase: arrived ? 'arrived' : 'idle', t: 0 }; }

/**
 * Steps one entry. in: { dt, inTrigger, inZone, roomOpen, farOpen, gap }. Returns { hold, events, pulse }.
 * hold is what the room door must do ('free' | 'shut' | 'open'); events may hold { type: 'swap' }, which is only
 * ever given while both doors are shut.
 */
export function stepEntry(st, { dt = 0, inTrigger = false, inZone = false, roomOpen = 0, farOpen = 0, gap = false }) {
  const events = [];
  const shut = roomOpen <= TUNING.eps && farOpen <= TUNING.eps;
  switch (st.phase) {
    case 'idle':
      if (inTrigger) { st.phase = 'sealing'; st.t = 0; }
      break;
    case 'sealing':
      if (shut && !gap) { st.phase = 'cycling'; st.t = 0; }
      break;
    case 'cycling':
      st.t += dt;
      if (shut && st.t >= TUNING.cycleSecs) { st.phase = 'gone'; events.push({ type: 'swap' }); }
      break;
    case 'arrived':
      st.t += dt;
      if (st.t >= TUNING.settleSecs) { st.phase = 'exiting'; st.t = 0; events.push({ type: 'exit' }); }
      break;
    case 'exiting':
      if (!inZone) { st.phase = 'idle'; st.t = 0; }
      break;
    default: break;
  }
  const hold = st.phase === 'sealing' || st.phase === 'cycling' || st.phase === 'gone' || st.phase === 'arrived' ? 'shut' : st.phase === 'exiting' ? 'open' : 'free';
  // pulse: 0..1 how hard the cycle lights glow (both doors' strips go amber while it cycles)
  const pulse = st.phase === 'cycling' ? Math.min(1, 0.45 + 0.55 * Math.abs(Math.sin(st.t * 7))) : st.phase === 'arrived' ? Math.max(0, 1 - st.t / TUNING.settleSecs) * 0.8 : 0;
  return { hold, events, pulse };
}

// ---- leaf geometry (local frame: x along the slide, y across the wall; origin at the gap centre) ---------------
/**
 * The two leaves of a door at `open`. slide: each leaf is half the length and moves its own width into the pocket.
 * swing: each leaf is hinged at its outer jamb and turns up to ~84 degrees. Returns { leaves: [{ x0, x1, angle?, hinge? }] }.
 */
export function leaves(length, open, style = 'slide') {
  const half = length / 2;
  if (style === 'swing') {
    const a = open * (Math.PI * 0.47);
    return [{ x0: -half, x1: 0, hinge: -half, angle: a }, { x0: 0, x1: half, hinge: half, angle: -a }];
  }
  const s = open * half;
  return [{ x0: -half - s, x1: -s }, { x0: s, x1: half + s }];
}

// How a fight reads aim and fire (opening B, outcome 6). Pure: no DOM, no clock. input.js feeds it what the devices say.
//
// Why a laptop could not "walk, aim and shoot at the same time" (Donaven, 2026-11-19): on most Windows laptops the touchpad switches
// itself off while keys are being typed, and a held WASD key repeats as typing, so a mouse that is also aiming and clicking goes dead
// the moment you walk. The game only offered the mouse (and the arrow keys, which nothing on screen told you about). So aim and fire
// now have three ways that each work with a hand on WASD, and the fight says so at the start:
//   - arrow keys: aim and fire together (existing),
//   - hold F or J: fire, aiming where the mouse last pointed, or, when the mouse has gone quiet, at the nearest enemy (assist),
//   - the mouse (and click), for a desk mouse, and on a phone the right stick or a tap on the playfield.
export const FIRE_KEYS = Object.freeze(['KeyF', 'KeyJ']);
export const ARROW_AIM = Object.freeze({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] });
/** The mouse counts as live for this long after it last moved or clicked; after that a fire key aims by assist. */
export const MOUSE_LIVE_MS = 1500;
/** Assist looks this far for an enemy (px in the world). */
export const ASSIST_RANGE = 560;

/** The nearest live enemy's bearing from a point: { angle, dist } or null. enemies: [{ x, y, alive }]. */
export function nearestEnemy(from, enemies, range = ASSIST_RANGE) {
  let best = null;
  for (const e of enemies || []) {
    if (e.alive === false) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d <= range && (!best || d < best.dist)) best = { angle: Math.atan2(e.y - from.y, e.x - from.x), dist: d };
  }
  return best;
}

/**
 * Where the player aims, an angle in radians or null for "no aim yet".
 *   stick:      the right stick { x, y } or null (only when pushed past the dead zone)
 *   arrows:     the arrow keys held, [{ x, y }] sums or null
 *   touchAim:   a finger held on the playfield, the angle from the player to it, or null
 *   mouse:      { seen, ageMs, angle } angle from the player's screen point to the pointer
 *   fireKey:    a fire key is down
 *   assist:     { angle } of the nearest enemy, or null
 */
export function decideAim({ stick = null, arrows = null, touchAim = null, mouse = null, fireKey = false, assist = null } = {}) {
  if (stick && Math.hypot(stick.x, stick.y) > 0.25) return Math.atan2(stick.y, stick.x);
  if (arrows && (arrows.x || arrows.y)) return Math.atan2(arrows.y, arrows.x);
  if (touchAim != null) return touchAim;
  const live = mouse?.seen && mouse.ageMs <= MOUSE_LIVE_MS;
  if (fireKey && assist && !live) return assist.angle; // the pointer has gone quiet (a touchpad that sleeps while you walk): aim for them
  if (mouse?.seen) return mouse.angle;
  if (fireKey && assist) return assist.angle;
  return null;
}

/** Is the player firing? Any of: the right stick pushed hard, an arrow key, a held finger on the playfield, a fire key, the mouse button. */
export function decideFire({ stick = null, arrows = false, touchHeld = false, fireKey = false, mouseDown = false } = {}) {
  if (stick && Math.hypot(stick.x, stick.y) > 0.55) return true;
  return Boolean(arrows || touchHeld || fireKey || mouseDown);
}

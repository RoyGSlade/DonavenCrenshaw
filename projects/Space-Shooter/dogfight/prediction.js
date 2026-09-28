// Guest-side prediction of the guest's own ship.
//
// Without it a guest's ship only moves once the host has received the input,
// simulated it, and sent a snapshot back that is then drawn 75 ms late: the
// whole round trip plus buffering stands between a key press and the screen.
// The guest instead flies its own ship locally with exactly the controls it
// sends the host, one fixed step at a time. Each host snapshot says which
// input it had applied (`ack`); the guest restarts from the host's ship and
// replays the inputs the host had not applied yet. What is left of the
// difference is eased out over about a tenth of a second so corrections do
// not jump, and a large one (a jump gate, a ship collision, a trap) snaps.
//
// The host stays authoritative: hits, hull, traps and every other ship come
// from snapshots only. Prediction needs snapshots that carry velocities and
// an ack; through an older host or relay it simply stays off.
import { RULES, stepShipAlone } from "./simulation.js";

const MAX_LOG = 180; // 3 s of unacknowledged steps
const MAX_CATCH_UP = 12; // steps per frame after a stall
export const PREDICTION = Object.freeze({ smoothingSeconds: 0.1, snapDistance: 1.5 });

export function canPredict(ship) {
  return !!ship && Number.isFinite(ship.vx) && Number.isFinite(ship.vy) && Number.isSafeInteger(ship.ack);
}

// A ship the flight code can step, from a cleaned snapshot ship.
function fromSnapshot(ship) {
  return {
    id: ship.id,
    loadout: ship.loadout,
    x: ship.x,
    y: ship.y,
    angle: ship.angle,
    vx: ship.vx,
    vy: ship.vy,
    angVel: ship.angVel || 0,
    hp: ship.hp,
    hit: 0,
    collisionCooldown: 0,
    flux: ship.flux,
    boost: ship.boost,
    _boostCd: ship.boostCooldown || 0,
    boostCooldown: ship.boostCooldown || 0,
    heat: ship.heat || 0,
    maxHeat: 100,
    isOverheated: !!ship.isOverheated,
    shootCooldown: 0,
    trapLock: ship.trapLock || 0,
  };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPredictor(options = {}) {
  const { smoothingSeconds, snapDistance } = { ...PREDICTION, ...options };
  let ship = null;
  let log = [];
  let accumulator = 0;
  let offset = { x: 0, y: 0, angle: 0 };
  const stats = { reconciles: 0, snaps: 0, lastError: 0, maxError: 0, replayed: 0 };

  const drawn = () => ship && { x: ship.x + offset.x, y: ship.y + offset.y, angle: ship.angle + offset.angle };

  return {
    get active() { return !!ship; },
    get stats() { return { ...stats, pending: log.length }; },

    reset() {
      ship = null;
      log = [];
      accumulator = 0;
      offset = { x: 0, y: 0, angle: 0 };
    },

    // A host snapshot of our ship arrived. Returns false when it can't be used.
    reconcile(authoritative, arena) {
      if (!canPredict(authoritative)) { this.reset(); return false; }
      const before = drawn();
      ship = fromSnapshot(authoritative);
      log = log.filter((entry) => entry.seq > authoritative.ack);
      for (const entry of log) stepShipAlone(arena, ship, entry.input);
      stats.reconciles += 1;
      stats.replayed = log.length;
      if (!before) return true;
      const error = { x: before.x - ship.x, y: before.y - ship.y, angle: wrapAngle(before.angle - ship.angle) };
      const distance = Math.hypot(error.x, error.y);
      stats.lastError = distance;
      stats.maxError = Math.max(stats.maxError, distance);
      if (distance > snapDistance) {
        offset = { x: 0, y: 0, angle: 0 };
        stats.snaps += 1;
      } else {
        offset = error;
      }
      return true;
    },

    // Fly forward by one frame with the controls last sent to the host.
    advance(seconds, input, seq, arena) {
      if (!ship) return;
      accumulator = Math.min(accumulator + Math.max(0, seconds), RULES.step * MAX_CATCH_UP);
      while (accumulator >= RULES.step) {
        stepShipAlone(arena, ship, input);
        log.push({ seq, input });
        accumulator -= RULES.step;
      }
      if (log.length > MAX_LOG) log = log.slice(-MAX_LOG);
      const keep = Math.exp(-Math.max(0, seconds) / smoothingSeconds);
      offset = { x: offset.x * keep, y: offset.y * keep, angle: offset.angle * keep };
    },

    // Where to draw our ship this frame.
    pose() { return drawn(); },
  };
}

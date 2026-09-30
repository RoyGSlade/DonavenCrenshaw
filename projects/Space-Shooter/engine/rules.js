import { state, config } from "../state.js";
import { isLapReady, portalCoordinates } from "./track.js";
import { shipTouchesCircle } from "./hull.js";
export function findNearestShard() {
  const lv = state.run?.current;
  if (!lv) return;
  const remaining = lv.nodes.filter(
    (n) => n.kind === "planet" && !lv.shards.has(n.id),
  );
  const checkpoint =
    lv.track?.checkpoints[lv.trackProgress?.nextCheckpoint ?? 0];
  const nextSignal = remaining[0];
  // Guide around the circuit in authored order, never across the infield to a nearby later corner.
  lv.nearestShardTarget =
    checkpoint && (!nextSignal || checkpoint.index + 1 < nextSignal.corner)
      ? {
          kind: "checkpoint",
          x: checkpoint.x - 0.5,
          y: checkpoint.y - 0.5,
          title: "Next checkpoint",
        }
      : nextSignal || lv.nodes.find((n) => n.kind === "gate") || null;
}
/**
 * A signal is collected when the ship's body touches the drawn shard (a
 * circle of PLANET_RADIUS, its drawn half-height) — a wing tip counts — or,
 * as before the hull, when the ship's centre is within PLANET_RADIUS +
 * PLAYER_RADIUS of it. Never less generous than the old circle.
 */
export function touchesSignal(player, node) {
  const x = node.x + 0.5, y = node.y + 0.5;
  return (
    Math.hypot(player.x - x, player.y - y) <= config.PLANET_RADIUS + config.PLAYER_RADIUS ||
    shipTouchesCircle(player, x, y, config.PLANET_RADIUS)
  );
}
export function addPenalty(ms) {
  if (!state.run?.current) return;
  state.run.current.activeMs += ms;
  state.run.totalActiveMs += ms;
}
export function levelElapsedMs(lv, now = performance.now()) {
  return (
    (lv?.activeMs || 0) + (lv?.timerRunning ? Math.max(0, now - lv.t0) : 0)
  );
}
export function hasRequiredShards(lv) {
  const ids =
    lv?.nodes?.filter((n) => n.kind === "planet").map((n) => n.id) || [];
  return ids.length > 0 && ids.every((id) => lv.shards.has(id));
}
export function secretEligible(lv, now = performance.now()) {
  return (
    !!lv &&
    lv.level === 5 &&
    lv.launched &&
    !lv.completed &&
    isLapReady(lv) &&
    hasRequiredShards(lv) &&
    lv.fuel >= 1 &&
    levelElapsedMs(lv, now) < 60000
  );
}
/** A real inward crossing of the rear half, rather than merely pointing backward. */
export function isBacksideArenaEntry(
  gateNode,
  lv = state.run?.current,
  now = performance.now(),
) {
  if (!gateNode || !secretEligible(lv, now)) return false;
  const p = lv.player;
  const relative = portalCoordinates(lv.track, p);
  return (
    relative.forward > 0.12 &&
    Math.hypot(relative.forward, relative.lateral) <= config.GATE_RADIUS &&
    relative.velocity < -0.15 &&
    relative.facing < -0.2
  );
}

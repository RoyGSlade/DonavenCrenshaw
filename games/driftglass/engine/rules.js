// src/roadmap/engine/rules.js
import { state, SHARDS_PER_LEVEL } from '../state.js';

/** Finds the nearest uncollected shard or the gate if none remain. */
export function findNearestShard() {
  const lv = state.run?.current;
  if (!lv) return;
  let nearest = null;
  let minDistSq = Infinity;
  const uncollected = lv.nodes.filter(n => n.kind === 'planet' && !lv.shards.has(n.id));
  if (uncollected.length === 0) {
    lv.nearestShardTarget = lv.nodes.find(n => n.kind === 'gate') || null;
    return;
  }
  for (const shard of uncollected) {
    const dx = shard.x + 0.5 - lv.player.x;
    const dy = shard.y + 0.5 - lv.player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < minDistSq) { minDistSq = d2; nearest = shard; }
  }
  lv.nearestShardTarget = nearest;
}


/** Adds a time penalty to the current run. */
export function addPenalty(ms) {
  const lv = state.run?.current;
  if (!lv) return;
  lv.activeMs += ms;
  state.run.totalActiveMs += ms;
}


/** True if player enters the gate from the backside on L5 with all required shards. */
export function isBacksideArenaEntry(gateNode) {
  const lv = state.run?.current;
  if (!lv) return false;

  const totalPlanets = lv.nodes.filter(n => n.kind === 'planet').length;
  const required = Math.min(SHARDS_PER_LEVEL, totalPlanets);
  const hasAllL5Shards = lv.level === 5 && lv.shards.size >= required;
  if (!hasAllL5Shards) return false;

  const px = lv.player.x, gx = gateNode.x + 0.5;
  // Require a more decisive approach from the right/back to avoid accidental detection
  const fromRight = px > (gx + 0.8); // tightened threshold
  const facingLeft = Math.cos(lv.player.angle) < -0.2; // must be clearly facing left
  return fromRight && facingLeft;
}
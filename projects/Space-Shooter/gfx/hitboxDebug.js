/**
 * Hitbox debug overlay (?debug=hitbox): what the simulation collides with,
 * drawn over the scene. Never mutates the simulation.
 *
 *   drawHitboxDebug(ctx, scene, unit)
 *
 * Call it in world space, where the ship is drawn (the camera transform
 * applied, 1 cell = `unit` px). It outlines the ship's hull (engine/hull.js),
 * or the old circle for a weekly scene on physics 1, the old circle dashed
 * for comparison, the lane contact point when the body is near a rail, the
 * shard / signal pickup shapes, and the mine and rock circles.
 */
import { config } from "../state.js";
import { PLAYER_HULL, shipHull } from "../engine/hull.js";
import { hullLaneContact } from "../engine/track.js";
import { WEEKLY_RULES } from "../engine/weekly/layout.js";

const TAU = Math.PI * 2;
const COLORS = Object.freeze({ hull: "#39ff9f", circle: "rgba(255,255,255,.45)", pickup: "#ffd84a", danger: "#ff5a4e", rock: "#ff9d54", contact: "#ff3df2" });

function ring(ctx, x, y, r, unit, color, dash = null) {
  ctx.strokeStyle = color;
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  ctx.arc(x * unit, y * unit, Math.max(0.5, r * unit), 0, TAU);
  ctx.stroke();
}

export function drawHitboxDebug(ctx, scene, unit) {
  const player = scene?.viewPlayer || scene?.player;
  if (!ctx || !player) return;
  const circleOnly = scene.weekly && scene.physics === 1;
  ctx.save();
  ctx.lineWidth = Math.max(1, unit * 0.02);

  // Pickups: main-game signals (planet nodes) and weekly shards.
  const shards = scene.weekly
    ? (scene.shardList || []).filter((s) => !scene.shards?.has(s.id)).map((s) => ({ x: s.x, y: s.y, touch: WEEKLY_RULES.SHARD_TOUCH, centre: WEEKLY_RULES.SHARD_PICKUP }))
    : (scene.nodes || []).filter((n) => n.kind === "planet" && !scene.shards?.has(n.id)).map((n) => ({ x: n.x + 0.5, y: n.y + 0.5, touch: config.PLANET_RADIUS, centre: config.PLANET_RADIUS + config.PLAYER_RADIUS }));
  for (const s of shards) {
    if (!circleOnly) ring(ctx, s.x, s.y, s.touch, unit, COLORS.pickup);
    // The ship's centre inside this ring also collects (the old rule).
    ring(ctx, s.x, s.y, s.centre, unit, COLORS.pickup, [unit * 0.06, unit * 0.08]);
  }
  for (const m of scene.mines || []) ring(ctx, m.x, m.y, m.radius, unit, COLORS.danger);
  for (const h of [...(scene.viewHazards || scene.hazards || []), ...(scene.gravityWells || [])]) if (!(h.hp <= 0)) ring(ctx, h.x, h.y, h.radius, unit, COLORS.rock);

  // The ship: its hull (solid) and the old centre circle (dashed).
  ring(ctx, player.x, player.y, config.PLAYER_RADIUS, unit, COLORS.circle, circleOnly ? null : [unit * 0.04, unit * 0.05]);
  if (!circleOnly) {
    const poly = shipHull(player, scene.hull || PLAYER_HULL);
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.hull;
    ctx.fillStyle = "rgba(57,255,159,.12)";
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x * unit, p.y * unit) : ctx.moveTo(p.x * unit, p.y * unit)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const p of poly) ctx.fillRect(p.x * unit - 1.5, p.y * unit - 1.5, 3, 3);
    // Nearest rail: the deepest hull point and the rail's outward normal.
    if (scene.track) {
      const c = hullLaneContact(scene.track, player.x, player.y, player.angle, scene.hull || PLAYER_HULL);
      if (c.depth > -0.3 && (c.nx || c.ny)) {
        ctx.strokeStyle = COLORS.contact;
        ctx.fillStyle = COLORS.contact;
        ctx.beginPath();
        ctx.arc(c.px * unit, c.py * unit, Math.max(2, unit * 0.05), 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(c.px * unit, c.py * unit);
        ctx.lineTo((c.px + c.nx * 0.4) * unit, (c.py + c.ny * 0.4) * unit);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

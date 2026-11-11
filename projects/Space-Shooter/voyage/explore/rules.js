// The space-exploration hop: fly your ship across a small sector map from your
// hangar to a quest giver's place (Hask at Alpha Relay, Vey at Beacon Prime,
// Garrity at Dustfall), with points of interest on the way. Pure: no DOM.
//
// Flight is today's shared solo/Dogfight flight (engine/systems/flight.js
// advanceFlight with Dogfight's medium-class config), called read-only: no
// racing, weekly or Dogfight physics changes. Units are Dogfight's (its arena
// is 40 x 24); the sector is bigger, with its own soft edge and rock bounces.
import { advanceFlight, rechargeBoost } from '../../engine/systems/flight.js';
import { shipFlightConfig } from '../../dogfight/ships.js';
import { SECTOR_MAP } from '../maps/index.js';

// The sector map is data (voyage/maps/sector.json, Stardust Studio edits it):
// places (the quest engine's sector ids, each with its giver and the walkable
// map you dock into), points of interest and rocks, in Dogfight units.
const xy = ({ at, ...rest }) => ({ ...rest, x: at[0], y: at[1] });
export const SECTOR = Object.freeze({ w: SECTOR_MAP.w, h: SECTOR_MAP.h, name: SECTOR_MAP.name });
export const STEP = 1 / 60;
export const PLACES = Object.freeze(Object.fromEntries([SECTOR_MAP.start, ...SECTOR_MAP.places].map(p => [p.id, Object.freeze(xy(p))])));
export const GIVER_PLACE = Object.freeze(Object.fromEntries(SECTOR_MAP.places.map(p => [p.giver, p.id])));
// Points of interest: fly close and slow down (or press scan) to look.
// reward: core's reward format, paid once per save (flag poi-<id>).
export const POIS = Object.freeze(SECTOR_MAP.pois.map(p => Object.freeze(xy(p))));
export const ROCKS = Object.freeze(SECTOR_MAP.rocks.map(([x, y, radius]) => Object.freeze({ x, y, radius })));

const FLIGHT = shipFlightConfig({ loadout: { classId: 'medium' } });

/** scanRange: the captain's scan multiplier, 1 + effect(c, 'scan.range') (Wisdom), clamped at 0.5. */
export function createHop({ from = 'home', to, visited = [], scanRange = 1 } = {}) {
  const start = PLACES[from] || PLACES.home;
  const dest = PLACES[to];
  if (!dest) throw new Error(`No place ${to}`);
  const angle = Math.atan2(dest.y - start.y, dest.x - start.x);
  return {
    t: 0, from: start.id, to: dest.id, giver: dest.giver || null,
    ship: { x: start.x + Math.cos(angle) * (start.size * 0.7), y: start.y + Math.sin(angle) * (start.size * 0.7), vx: 0, vy: 0, angle, angVel: 0, _boostCd: 0, boostCooldown: 0, collisionCooldown: 0, hit: 0 },
    scene: { flux: 30, boost: 3, fuel: 100, launched: true },
    scans: {}, seen: [...visited], scanRange: Math.max(0.5, scanRange), events: [], arrived: false, docking: 0, distance: Math.hypot(dest.x - start.x, dest.y - start.y),
  };
}

/** input: { turn (-1..1), thrust (0..1), brake, boost, scan } */
export function stepHop(h, input = {}, dt = STEP) {
  h.events = [];
  if (h.arrived) return h;
  h.t += dt;
  const s = h.ship;
  const dest = PLACES[h.to];
  s.hit = Math.max(0, s.hit - dt);
  s.collisionCooldown = Math.max(0, s.collisionCooldown - dt);
  const inCloud = POIS.some(p => p.kind === 'cloud' && Math.hypot(s.x - p.x, s.y - p.y) < p.radius);
  if (inCloud) h.scene.boost = Math.max(0, h.scene.boost - dt * 0.6);
  const docking = h.docking > 0;
  const keys = {
    turnStrength: docking ? 0 : input.turn || 0,
    thrustStrength: docking ? 0 : (input.thrust ?? 0),
    backStrength: 0, strafeStrength: 0,
    boost: !docking && Boolean(input.boost) && !inCloud,
    brake: docking || Boolean(input.brake),
  };
  rechargeBoost(h.scene, dt);
  advanceFlight(dt, h.scene, s, keys, {}, FLIGHT);
  // Soft sector edge.
  for (const [k, v, max] of [['x', 'vx', SECTOR.w], ['y', 'vy', SECTOR.h]]) {
    if (s[k] < 1) { s[k] = 1; s[v] = Math.abs(s[v]) * 0.5; }
    if (s[k] > max - 1) { s[k] = max - 1; s[v] = -Math.abs(s[v]) * 0.5; }
  }
  // Rocks bounce you (the same push-and-reflect Dogfight uses on its obstacles).
  const r = FLIGHT.PLAYER_RADIUS ?? 0.21;
  for (const o of ROCKS) {
    let dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy);
    const min = r + o.radius;
    if (d >= min) continue;
    if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    s.x = o.x + nx * min; s.y = o.y + ny * min;
    const inward = s.vx * nx + s.vy * ny;
    if (inward < 0) { s.vx -= inward * 1.6 * nx; s.vy -= inward * 1.6 * ny; if (inward < -4 && s.collisionCooldown <= 0) { s.hit = 0.3; s.collisionCooldown = 0.6; h.events.push({ type: 'bump' }); } }
  }
  // Points of interest: in range and slow -> scan builds; full scan = seen.
  for (const p of POIS) {
    if (h.seen.includes(p.id)) continue;
    const near = Math.hypot(s.x - p.x, s.y - p.y) < (p.radius + 3) * h.scanRange;
    const slow = Math.hypot(s.vx, s.vy) < 6;
    if (near && (slow || input.scan)) h.scans[p.id] = Math.min(1, (h.scans[p.id] || 0) + dt / (input.scan ? 0.6 : 1.2));
    else if (!near) h.scans[p.id] = Math.max(0, (h.scans[p.id] || 0) - dt);
    if (h.scans[p.id] >= 1) { h.seen.push(p.id); h.events.push({ type: 'poi', id: p.id, poi: p }); }
  }
  // Arrival: inside the docking ring -> the ship brakes and docks.
  const dd = Math.hypot(s.x - dest.x, s.y - dest.y);
  h.distance = dd;
  if (!docking && dd < dest.size * 0.5 + 2.2) { h.docking = 0.001; h.events.push({ type: 'docking', place: dest.id }); }
  if (h.docking > 0) {
    h.docking += dt;
    // Drift in toward the berth.
    s.x += (dest.x - s.x) * Math.min(1, dt * 1.5); s.y += (dest.y + dest.size * 0.45 - s.y) * Math.min(1, dt * 1.5);
    if (h.docking > 1.2) { h.arrived = true; h.events.push({ type: 'arrived', place: dest.id, giver: dest.giver }); }
  }
  return h;
}

/** Steering from a touch stick: turn toward the stick, thrust by how far it's pushed. */
export function steerToward(ship, stick) {
  const m = Math.hypot(stick.x, stick.y);
  if (m < 0.2) return { turn: 0, thrust: 0 };
  const want = Math.atan2(stick.y, stick.x);
  const diff = Math.atan2(Math.sin(want - ship.angle), Math.cos(want - ship.angle));
  return { turn: Math.max(-1, Math.min(1, diff * 2.2)), thrust: Math.abs(diff) < 1.2 ? Math.min(1, m) : 0 };
}

/** A straight-line autopilot (tests and the "fly me there" help): steer at the target, ease off near it. */
export function autopilot(h) {
  const s = h.ship, dest = PLACES[h.to];
  const want = Math.atan2(dest.y - s.y, dest.x - s.x);
  const diff = Math.atan2(Math.sin(want - s.angle), Math.cos(want - s.angle));
  const d = Math.hypot(dest.x - s.x, dest.y - s.y);
  const speed = Math.hypot(s.vx, s.vy);
  return { turn: Math.max(-1, Math.min(1, diff * 3)), thrust: Math.abs(diff) < 0.5 && (speed < d * 0.9) ? 1 : 0, brake: speed > d * 1.2 };
}

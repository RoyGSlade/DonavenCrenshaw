/** Authored arenas. Geometry is shared by rendering, host physics and the relay. */
export const DEFAULT_MAP = "shatterbelt";
export const MAPS = Object.freeze({
  shatterbelt: {
    name: "Shatterbelt", tag: "BREAK THE BATTLEFIELD", color: "#85efd6", background: "#12352f",
    description: "Cut through crystal barricades. Detonate fuel pods when your rival flies close.",
    legend: "Crystal = 3 hits · Fuel pod = 2 hits / blast · Rock = solid cover",
  },
  gravemaw: {
    name: "Gravemaw", tag: "BEND YOUR APPROACH", color: "#c9abff", background: "#271c48",
    description: "Slingshot around twin gravity wells. Enter either jump gate to flank through the other.",
    legend: "Spirals pull ships · Core burns nearby hull · Linked rings teleport ships",
  },
  stormworks: {
    name: "Stormworks", tag: "RACE THE REACTOR", color: "#ffd08a", background: "#382818",
    description: "Ride opposing boost streams through a ruined station. Cross reactor vents between pulses.",
    legend: "Arrows push ships · Vent: safe → warning → LIVE · Wreckage blocks fire",
  },
  classic: {
    name: "Classic", tag: "OPEN SPACE", color: "#81e6df", background: "#102337",
    description: "The original mirrored asteroid arena.", legend: "Asteroids block ships and projectiles",
  },
});
export const isMapId = id => typeof id === "string" && Object.hasOwn(MAPS, id);

export function createArena(mapId = "classic", seed = 1) {
  if (!isMapId(mapId)) throw new RangeError("Unknown Dogfight map.");
  const obstacles = [], fields = [], gates = [], vents = [];
  const add = (type, x, y, radius, hp = -1) => {
    obstacles.push({ id: obstacles.length, type, x, y, radius, hp, maxHp: hp });
  };
  const pair = (type, x, y, radius, hp = -1) => {
    add(type, x, y, radius, hp); add(type, 40 - x, 24 - y, radius, hp);
  };
  if (mapId === "classic") {
    let state = seed >>> 0;
    const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const [x, y] of [[12, 5], [12, 19], [19, 5.5], [19, 18.5]]) {
      const radius = 0.75 + random() * 0.5;
      pair("rock", x, y + (random() - 0.5) * 1.3, radius);
    }
  }
  if (mapId === "shatterbelt") {
    for (const [x, y, r] of [[10, 5, 1.6], [13, 6.5, 1.1], [17, 4, 1.4], [9, 18, 1.5], [13, 19, 0.8]]) pair("rock", x, y, r);
    for (const [x, y] of [[17, 9], [17, 11.5], [20, 8.5]]) pair("crystal", x, y, 0.9, 150);
    add("crystal", 20, 12, 1.05, 150);
    for (const [x, y] of [[14, 10], [24, 6]]) pair("fuel", x, y, 0.65, 100);
  }
  if (mapId === "gravemaw") {
    for (const [x, y, r] of [[12, 3, 1.3], [20, 4.5, 1.1], [7, 17, 1.7], [15, 18.5, 0.8]]) pair("rock", x, y, r);
    pair("core", 15, 8, 1.05);
    fields.push({ type: "gravity", x: 15, y: 8, radius: 5 }, { type: "gravity", x: 25, y: 16, radius: 5 });
    gates.push({ x: 7, y: 5.5, angle: 0 }, { x: 33, y: 18.5, angle: Math.PI });
  }
  if (mapId === "stormworks") {
    for (const x of [11, 13, 15, 17]) pair("wreck", x, 8, 1);
    for (const x of [11, 13]) pair("wreck", x, 16, 1);
    pair("fuel", 16, 15, 0.65, 100);
    fields.push({ type: "stream", x: 5, y: 3, width: 30, height: 2.4, direction: 1 },
      { type: "stream", x: 5, y: 18.6, width: 30, height: 2.4, direction: -1 });
    vents.push({ x: 19, y: 2, width: 2, height: 8 }, { x: 19, y: 14, width: 2, height: 8 });
  }
  return { mapId, obstacles, fields, gates, vents, bursts: [] };
}

// A shared clock keeps warnings, damage and both clients on the same beat.
export function ventPhase(elapsedSeconds) {
  const cycle = Math.max(0, elapsedSeconds) % 8;
  return cycle < 5 ? "safe" : cycle < 6.5 ? "warning" : "live";
}
export function arenaSnapshot(match) {
  if (match.mapId === "classic") return { mapId: "classic" };
  return {
    mapId: match.mapId,
    terrain: { hp: match.obstacles.map(o => o.hp ?? -1), bursts: match.bursts.map(b => ({ ...b })) },
  };
}
export function displayObstacles(arena, state) {
  return arena.obstacles.map((o, i) => ({ ...o, hp: state?.terrain?.hp[i] ?? o.hp })).filter(o => o.hp !== 0);
}

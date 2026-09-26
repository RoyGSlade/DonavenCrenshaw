import { createTrack, pointOnTrack } from "./track.js";

/** Original, widened interpretations of racing rhythms; no map image or logo is reused. */
export const LEVELS = [
  {
    title: "Alpha Relay",
    inspiration: "Laguna Seca",
    landmark: "The Corkscrew Relay",
    width: 6.4,
    lesson: "One lap. Brake for the hairpin; unwind through the switchback.",
    rumor:
      "First, the Horizon watched our departure. Relay log: A gate has two faces. Most pilots only see one.",
    points: [
      [12, 25],
      [25, 25],
      [38, 26],
      [42, 22],
      [39, 17],
      [31, 16],
      [30, 10],
      [34, 5],
      [24, 5],
      [19, 11],
      [12, 10],
      [7, 15],
      [6, 25],
    ],
    apexes: [3, 6, 9, 11],
    rocks: [1, 4, 7, 10],
  },
  {
    title: "Beacon Prime",
    inspiration: "Silverstone",
    landmark: "The Orbital Esses",
    width: 6.4,
    lesson:
      "Link the fast sweepers. Borrow gravity without surrendering your line.",
    rumor:
      "Second, we followed the Fallen star. Keeper log: Momentum carries you when the engine falls silent.",
    points: [
      [32, 26],
      [24, 26],
      [18, 22],
      [21, 17],
      [14, 16],
      [6, 20],
      [5, 10],
      [12, 5],
      [23, 5],
      [29, 9],
      [33, 6],
      [38, 10],
      [42, 17],
      [42, 26],
    ],
    apexes: [2, 5, 7, 10, 12],
    rocks: [3, 6, 8, 11],
    well: { x: 30, y: 16, radius: 1.1, influence: 7, strength: 6 },
  },
  {
    title: "Dustfall Station",
    inspiration: "Monza",
    landmark: "The Foundry Straight",
    width: 6.4,
    lesson: "Build speed on the straight; shed it before the chicanes.",
    rumor:
      "Third, we looked back toward Home. Shift log: Sixty seconds. Then the old frequency goes quiet.",
    points: [
      [12, 25],
      [27, 25],
      [39, 25],
      [43, 20],
      [41, 13],
      [36, 6],
      [29, 5],
      [26, 9],
      [21, 8],
      [16, 11],
      [13, 16],
      [8, 16],
      [5, 21],
      [7, 25],
    ],
    apexes: [3, 5, 7, 10, 12],
    rocks: [1, 4, 6, 8, 11],
    moving: [4, 11],
  },
  {
    title: "Nether Crossing",
    inspiration: "Monaco",
    landmark: "The Harbour Needle",
    width: 5.8,
    lesson:
      "Use the whole lane through tight turns. Break a sentinel’s prediction.",
    rumor:
      "Last, we entered the Shadow. Patrol log: Behind the threshold waits the keeper of unfinished journeys.",
    points: [
      [16, 26],
      [28, 26],
      [37, 26],
      [42, 22],
      [42, 10],
      [41, 7],
      [38.5, 6],
      [36, 7],
      [35, 10],
      [35, 18],
      [28, 18],
      [28, 6],
      [20, 6],
      [20, 14],
      [13, 14],
      [7, 10],
      [5, 16],
      [7, 22],
      [10, 26],
    ],
    apexes: [3, 6, 10, 13, 16],
    rocks: [1, 3, 8, 11, 14],
    moving: [11],
    drones: [0.4, 0.73],
  },
  {
    title: "Iron Veil",
    inspiration: "Spa-Francorchamps",
    landmark: "The Raidillon Veil",
    width: 6.4,
    lesson:
      "Commit through the sweeping bends, then return to the portal you launched from.",
    rumor:
      "Final log: When the notes run backward, return through the four signs in reverse. The other face remembers.",
    points: [
      [12, 25],
      [23, 25],
      [29, 22],
      [39, 19],
      [43, 13],
      [41, 6],
      [32, 5],
      [27, 9],
      [21, 11],
      [16, 7],
      [9, 6],
      [5, 12],
      [8, 17],
      [5, 21],
      [6, 25],
    ],
    apexes: [2, 5, 8, 11, 13],
    rocks: [1, 3, 6, 9, 11],
    moving: [3, 11],
    drones: [0.28, 0.65],
    well: { x: 31, y: 15, radius: 1.1, influence: 7, strength: 6 },
  },
];

function apexPosition(track, index) {
  const previous =
    track.segments[(index - 1 + track.segments.length) % track.segments.length];
  const next = track.segments[index];
  const turn = Math.sign(previous.tx * next.ty - previous.ty * next.tx);
  const tx = previous.tx + next.tx,
    ty = previous.ty + next.ty,
    length = Math.hypot(tx, ty) || 1;
  return {
    x: track.points[index].x - (ty / length) * turn * 0.7,
    y: track.points[index].y + (tx / length) * turn * 0.7,
  };
}
function asteroidScale(level, index) {
  // Stable per sector/obstacle, including both requested endpoints across the pack.
  return [1.125, 0.75, 0.875, 1, 1.25][(level + index) % 5];
}
export function createLevelLayout(level) {
  const source = LEVELS[level - 1];
  if (!source) throw new RangeError(`Unknown level: ${level}`);
  const track = createTrack(source.points, source.width, source.inspiration);
  const colors = ["blue", "green", "purple", "pink", "blue"];
  const apexes = source.apexes.map((index) => ({
    ...apexPosition(track, index),
    corner: index,
  }));
  const portalNode = {
    x: track.portal.x - 0.5,
    y: track.portal.y - 0.5,
    angle: track.portal.angle,
  };
  const station = pointOnTrack(track, track.length * 0.48, -1.8);
  const nodes = [
    { kind: "start", ...portalNode },
    { kind: "gate", ...portalNode },
    ...apexes.map((point, index) => ({
      kind: "planet",
      x: point.x - 0.5,
      y: point.y - 0.5,
      id: `L${level}-S${index + 1}`,
      color: colors[index],
      corner: point.corner,
      title: `${source.title} apex ${index + 1}`,
      shardName: `Apex signal ${index + 1}`,
      summary: source.rumor,
      clue: source.rumor,
    })),
    { kind: "station", x: station.x - 0.5, y: station.y - 0.5 },
  ];
  const hazards = source.rocks
    .map((segmentIndex, index) => {
      const segment = track.segments[segmentIndex];
      const side = index % 2 ? -1 : 1;
      const pos = pointOnTrack(
        track,
        segment.start + segment.length * 0.5,
        side * 1.95,
      );
      const sizeScale = asteroidScale(level, index),
        baseRadius = 1;
      const hazard = {
        kind: "asteroid",
        x: pos.x,
        y: pos.y,
        radius: baseRadius * sizeScale,
        baseRadius,
        sizeScale,
        hp: 100,
        maxHp: 100,
        destructible: true,
      };
      if (source.moving?.includes(segmentIndex)) {
        const axis = Math.abs(segment.tx) > Math.abs(segment.ty) ? "y" : "x";
        hazard.motion = {
          axis,
          amplitude: 0.35,
          period: 8 + index,
          phase: 0,
          originX: pos.x,
          originY: pos.y,
        };
      }
      return hazard;
    })
    .filter((h) =>
      nodes.every(
        (n) => Math.hypot(h.x - n.x - 0.5, h.y - n.y - 0.5) > h.radius + 0.9,
      ),
    );
  const drones = (source.drones || []).map((fraction, index) => {
    const pos = pointOnTrack(
      track,
      track.length * fraction,
      index % 2 ? 1.8 : -1.8,
    );
    return {
      x: pos.x,
      y: pos.y,
      radius: 0.48,
      hp: 100,
      maxHp: 100,
      angle: Math.atan2(pos.ty, pos.tx),
      state: "patrol",
      cooldown: 1.5 + index,
      telegraph: 0,
    };
  });
  const safeRoute = track.points.map(
    (point, index) => apexes.find((a) => a.corner === index) || { ...point },
  );
  safeRoute.push({ ...track.portal });
  return {
    title: source.title,
    inspiration: source.inspiration,
    landmark: source.landmark,
    lesson: source.lesson,
    rumor: source.rumor,
    briefing: `Fly one full lap in the arrow direction. Collect ${apexes.length} corner signals and return to this portal. Rails block the infield. Dodge rocks or shoot a gap.`,
    track,
    nodes,
    hazards,
    drones,
    gravityWells: source.well ? [{ ...source.well }] : [],
    safeRoute,
    fastRoute: safeRoute.map((p) => ({ ...p })),
  };
}

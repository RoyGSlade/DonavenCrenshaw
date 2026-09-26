import { createLevelLayout } from "./engine/levels.js";
export { LEVELS, createLevelLayout } from "./engine/levels.js";

export function formatMs(ms) {
  const sign = ms < 0 ? "-" : "";
  ms = Math.abs(ms);
  return `${sign}${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}`;
}
export function seededRand(seedStr) {
  let seed = 5381;
  for (const c of String(seedStr)) seed = Math.imul(seed, 33) + c.charCodeAt(0);
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export async function loadRoadmapData() {
  return {
    planets: Array.from({ length: 5 }, (_, i) =>
      createLevelLayout(i + 1)
        .nodes.filter((n) => n.kind === "planet")
        .map((n, j) => ({ ...n, phase: i + 1, order: j + 1 })),
    ).flat(),
  };
}
// Preserve the existing public signature; early levels are intentionally identical across seeds.
export function generateLevelNodes(level, _data, _seedStr) {
  return createLevelLayout(level).nodes;
}

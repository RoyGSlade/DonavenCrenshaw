import { createArena, isMapId } from "./maps.js";

const layouts = new Map();
export function cleanArenaSnapshot(state, expectedMapId = null) {
  const mapId = state?.mapId ?? "classic";
  if (!isMapId(mapId) || (expectedMapId !== null && mapId !== expectedMapId)) return null;
  if (mapId === "classic") return { mapId };
  if (!layouts.has(mapId)) layouts.set(mapId, createArena(mapId));
  const arena = layouts.get(mapId), data = state.terrain;
  if (!data || !Array.isArray(data.hp) || data.hp.length !== arena.obstacles.length ||
      !Array.isArray(data.bursts) || data.bursts.length > arena.obstacles.filter(o => o.type === "fuel").length) return null;
  for (let i = 0; i < data.hp.length; i++) {
    const hp = data.hp[i], o = arena.obstacles[i];
    if (!Number.isInteger(hp) || (o.maxHp === -1 ? hp !== -1 : hp < 0 || hp > o.maxHp)) return null;
  }
  const bursts = [], ids = new Set();
  for (const b of data.bursts) {
    if (!b || !Number.isInteger(b.id) || ids.has(b.id)) return null;
    const o = arena.obstacles[b.id];
    if (!o || o.type !== "fuel" || data.hp[b.id] !== 0 || b.x !== o.x || b.y !== o.y ||
        typeof b.life !== "number" || !Number.isFinite(b.life) || b.life <= 0 || b.life > 0.7) return null;
    ids.add(b.id); bursts.push({ id: b.id, x: b.x, y: b.y, life: b.life });
  }
  return { mapId, terrain: { hp: [...data.hp], bursts } };
}

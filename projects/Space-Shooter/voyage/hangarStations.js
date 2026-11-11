// The hangar as a place: where each station stands, who works there and what
// it opens. Station ids are the story contract's (ROUND2-CONTRACT.md section
// 5). Positions are in metres on a straight-down floor plan, x to the right
// and y down, so the onfoot lane can walk the same floor: `stationNear(x, y)`
// says which talk ring the player stands in, and the page opens it with
// `hangarApi.openStation(id)`. Geometry only, no DOM; the data is hangarData.js.

import { HANGAR_FLOOR, HANGAR_STATIONS, HANGAR_CAST } from './hangarData.js';

export const HANGAR = HANGAR_FLOOR;
// The stations, their positions and their panel words live in hangarData.js.
export const STATIONS = HANGAR_STATIONS;
export const STATION_IDS = Object.freeze(STATIONS.map((s) => s.id));
const BY_ID = new Map(STATIONS.map((s) => [s.id, s]));
export const stationById = (id) => BY_ID.get(id) || null;

export const CAST_NAMES = HANGAR_CAST;

/** The station whose talk ring (x, y) is inside, nearest first; null when none. */
export function stationNear(x, y, stations = STATIONS) {
  let best = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = Math.hypot(x - s.at.x, y - s.at.y);
    if (d <= s.ring && d < bestD) { best = s; bestD = d; }
  }
  return best;
}

/** The station under a point (its prop's box or its talk ring), for clicks and taps. */
export function stationAt(x, y, stations = STATIONS) {
  for (const s of stations) {
    const b = s.box;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return s;
  }
  return stationNear(x, y, stations);
}

/**
 * How a station looks and acts for a save: { open, locked, who, objective }.
 * isUnlocked(save, id) comes from the story lane (hangarLinks.js).
 */
export function stationState(save, station, isUnlocked, objective = null) {
  const open = !station.unlock || isUnlocked(save, station.unlock);
  return {
    id: station.id,
    open,
    locked: !open,
    who: station.who,
    objective: Boolean(objective && objective.station === station.id),
  };
}

/**
 * Fit the floor plan into a box of w x h screen pixels with a margin.
 * Returns { scale, ox, oy } so that screen = o + metres * scale.
 */
export function fitHangar(w, h, margin = 12) {
  const scale = Math.max(1, Math.min((w - margin * 2) / HANGAR.width, (h - margin * 2) / HANGAR.height));
  return { scale, ox: (w - HANGAR.width * scale) / 2, oy: (h - HANGAR.height * scale) / 2 };
}

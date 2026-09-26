/**
 * @fileoverview Data loading, formatting, and procedural generation for the Starmap.
 */
import { config } from './state.js';

// --- FORMATTING ---
export function formatMs(ms) {
  const sign = ms < 0 ? '-' : '';
  ms = Math.abs(ms);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const ccs = String(cs).padStart(2, '0');
  return `${sign}${mm}:${ss}.${ccs}`;
}

// --- RANDOM ---
function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededRand(seedStr) {
  const seed = typeof seedStr === 'number' ? seedStr : hashStr(String(seedStr));
  return mulberry32(seed);
}

// --- HELPERS ---
function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
function occupied(list, x, y) { return list.some(p => p.x === x && p.y === y); }
function minManhattanTo(list, x, y) {
  const h = { x, y }; let m = Infinity;
  for (const p of list) m = Math.min(m, Math.abs(p.x - h.x) + Math.abs(p.y - h.y));
  return m;
}

// --- DATA (INLINE) ---
// Self-contained planet data — no server fetch needed.
const INLINE_ROADMAP = {
  planets: [
    // Level 1
    { id: 'p1a', phase: 1, order: 1, title: 'Alpha Relay', shardName: 'Shard of Origin', summary: 'The first signal beacon.' },
    { id: 'p1b', phase: 1, order: 2, title: 'Beacon Prime', shardName: 'Shard of Light', summary: 'A flickering outpost.' },
    { id: 'p1c', phase: 1, order: 3, title: 'Dustfall Station', shardName: 'Shard of Dust', summary: 'Abandoned mining rig.' },
    // Level 2
    { id: 'p2a', phase: 2, order: 1, title: 'Nether Crossing', shardName: 'Shard of Shadow', summary: 'A dark corridor.' },
    { id: 'p2b', phase: 2, order: 2, title: 'Iron Veil', shardName: 'Shard of Iron', summary: 'Heavy debris field.' },
    { id: 'p2c', phase: 2, order: 3, title: 'Echo Drift', shardName: 'Shard of Echo', summary: 'Strange resonance.' },
    // Level 3
    { id: 'p3a', phase: 3, order: 1, title: 'Crimson Nebula', shardName: 'Shard of Flame', summary: 'Superheated gas cloud.' },
    { id: 'p3b', phase: 3, order: 2, title: 'Void Anchor', shardName: 'Shard of Void', summary: 'Gravitational anomaly.' },
    { id: 'p3c', phase: 3, order: 3, title: 'Crystal Spire', shardName: 'Shard of Crystal', summary: 'Mineral deposit.' },
    { id: 'p3d', phase: 3, order: 4, title: 'Pulse Gate', shardName: 'Shard of Pulse', summary: 'Energy conduit.' },
    // Level 4
    { id: 'p4a', phase: 4, order: 1, title: 'Warden\'s Watch', shardName: 'Shard of Vigil', summary: 'Sentinel territory.' },
    { id: 'p4b', phase: 4, order: 2, title: 'Obsidian Reach', shardName: 'Shard of Obsidian', summary: 'Black-glass asteroids.' },
    { id: 'p4c', phase: 4, order: 3, title: 'Tempest Ring', shardName: 'Shard of Storm', summary: 'Ion storm corridor.' },
    { id: 'p4d', phase: 4, order: 4, title: 'Cipher Relay', shardName: 'Shard of Code', summary: 'Encrypted transmission hub.' },
    // Level 5
    { id: 'p5a', phase: 5, order: 1, title: 'The Altar Gate', shardName: 'Shard of Reckoning', summary: 'Final approach.' },
    { id: 'p5b', phase: 5, order: 2, title: 'Pyre Sanctum', shardName: 'Shard of Pyre', summary: 'Sacred fire.' },
    { id: 'p5c', phase: 5, order: 3, title: 'Veil of Stars', shardName: 'Shard of Stars', summary: 'Cosmic threshold.' },
    { id: 'p5d', phase: 5, order: 4, title: 'The Last Signal', shardName: 'Shard of Silence', summary: 'Beyond the veil.' },
  ]
};

export async function loadRoadmapData() {
  return INLINE_ROADMAP;
}

// --- LEVEL GENERATION ---
export function generateLevelNodes(level, data, seedStr) {
  const { GRID_W, GRID_H } = config;
  const rng = seededRand(seedStr);
  const planetsForLevel = (data?.planets || []).filter(p => p.phase === level).sort((a, b) => a.order - b.order);

  const start = { kind: 'start', x: 1, y: Math.floor(GRID_H / 2) };
  const gate = { kind: 'gate', x: GRID_W - 2, y: randInt(rng, 1, GRID_H - 2) };
  const nodes = [start, gate];
  const placed = [{ x: start.x, y: start.y }, { x: gate.x, y: gate.y }];

  const MIN_DIST = 3;
  const shardColors = ['blue', 'pink', 'green', 'purple']; // Possible shard colors
  let usedColors = new Set();

  for (const p of planetsForLevel) {
    let tries = 0, ok = false;
    let color;
    while (tries++ < 200 && !ok) {
      const x = randInt(rng, 2, GRID_W - 3);
      const y = randInt(rng, 1, GRID_H - 2);
      if (occupied(placed, x, y) || minManhattanTo(placed, x, y) < MIN_DIST) continue;
      // Assign a random color to each shard, ensuring no duplicates for this level
      const availableColors = shardColors.filter(c => !usedColors.has(c));
      if (availableColors.length === 0) {
        // If all colors used, reset
        usedColors.clear();
        color = shardColors[randInt(rng, 0, shardColors.length - 1)];
      } else {
        color = availableColors[randInt(rng, 0, availableColors.length - 1)];
      }
      usedColors.add(color);
      nodes.push({ kind: 'planet', x, y, color, id: p.id, title: p.title, summary: p.summary, video: p.video, shardName: p.shardName });
      placed.push({ x, y }); ok = true;
    }
    // Fallback placement to guarantee winnable levels, also assign color
    if (!ok) {
      const x = randInt(rng, 1, GRID_W - 2);
      const y = randInt(rng, 0, GRID_H - 1);
      const availableColors = shardColors.filter(c => !usedColors.has(c));
      if (availableColors.length === 0) {
        usedColors.clear();
        color = shardColors[randInt(rng, 0, shardColors.length - 1)];
      } else {
        color = availableColors[randInt(rng, 0, availableColors.length - 1)];
      }
      usedColors.add(color);
      nodes.push({ kind: 'planet', x, y, color, id: p.id, title: p.title, summary: p.summary, video: p.video, shardName: p.shardName });
      placed.push({ x, y });
    }
  }

  const stationCount = randInt(rng, 1, 2);
  for (let i = 0; i < stationCount; i++) {
    let tries = 0, ok = false;
    while (tries++ < 200 && !ok) {
      const x = randInt(rng, 2, GRID_W - 3);
      const y = randInt(rng, 0, GRID_H - 1);
      if (occupied(placed, x, y)) continue;
      nodes.push({ kind: 'station', x, y });
      placed.push({ x, y }); ok = true;
    }
  }
  return nodes;
}
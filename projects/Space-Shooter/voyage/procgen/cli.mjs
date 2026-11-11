#!/usr/bin/env node
// A JSON-in, JSON-out door to the procgen API for tools that are not
// JavaScript (the Stardust Studio in Focus is Python). One request on stdin:
//   { "op": "dress", "map": {...}, "options": { "seed": 7, "locked": [0] } }   (STUDIO-SCHEMA section 6)
//   { "op": "dressRoom", "input": { "type": "cantina", "seed": 7 } }
//   { "op": "rerollRoom", "map": {...}, "seed": 8 }            (seed optional)
//   { "op": "lockAndReroll", "map": {...}, "keep": [0, 3], "seed": 9 }
//   { "op": "dressArea", "input": { "biome": "moon", "seed": 3 } }
//   { "op": "rerollArea", "map": {...}, "keep": [2], "seed": 4 }
//   { "op": "validate", "map": {...} }   { "op": "assess", "map": {...} }   { "op": "design", "map": {...} }
//   { "op": "suggestShell", "type": "den", "seed": 2 }
//   { "op": "catalog" }   (room types, themes, biomes, prop ids)
// Reply on stdout: { "ok": true, "result": ... } or { "ok": false, "error": "..." }.
// Pure: reads nothing but stdin, writes nothing but stdout.
import * as api from './index.js';
import { dressRoom as dressMap } from './dress.js';

const OPS = {
  dress: (q) => dressMap(q.map, q.options || {}),
  dressRoom: (q) => api.dressRoom(q.input),
  rerollRoom: (q) => api.rerollRoom(q.map, q.seed),
  lockAndReroll: (q) => api.lockAndReroll(q.map, q.keep || [], q.seed),
  dressArea: (q) => api.dressArea(q.input),
  rerollArea: (q) => api.rerollArea(q.map, q.seed, q.keep || null),
  validate: (q) => api.validateMap(q.map),
  assess: (q) => api.assessMap(q.map),
  design: (q) => api.designChecks(q.map),
  suggestShell: (q) => api.suggestShell(q.type, q.seed ?? 1),
  catalog: () => ({
    roomTypes: Object.fromEntries(api.ROOM_TYPES.map(t => [t, { name: api.CATALOGS.rooms.rooms[t].name, size: api.CATALOGS.rooms.rooms[t].size }])),
    themes: api.THEMES, biomes: api.BIOME_TYPES, props: Object.keys(api.CATALOGS.props.props), version: api.VERSION,
  }),
};

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; if (raw.length > 4_000_000) { process.stdout.write(JSON.stringify({ ok: false, error: 'request too large' })); process.exit(1); } });
process.stdin.on('end', () => {
  let reply;
  try {
    const q = JSON.parse(raw || '{}');
    const fn = OPS[q.op];
    if (!fn) throw new Error(`unknown op ${q.op}; ops: ${Object.keys(OPS).join(', ')}`);
    reply = { ok: true, result: fn(q) };
  } catch (error) {
    reply = { ok: false, error: error.message };
  }
  process.stdout.write(JSON.stringify(reply));
  process.exitCode = reply.ok ? 0 : 1;
});

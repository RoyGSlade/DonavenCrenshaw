// The on-foot and exploration art map: the only file that names art paths for
// these layers. Pack art (approved desert, moon base, enemies and on-foot
// straight-down sprites) is resized into ./art/ by
// lhc-lanes/stardust/onfoot/tools/prep-art.py; the cast sprites by
// scripts/stardust-art.py. Every id without a file draws a
// placeholder (draw.js), so swapping art in is one line per id here.
import { INTERIOR_ART } from './interiorArt.js';

const at = (path) => new URL(`./art/${path}`, import.meta.url).href;

export const SPRITE_FILES = Object.freeze({
  'player-f1': 'player-f1.png', 'player-f2': 'player-f2.png', 'player-f3': 'player-f3.png', 'player-f4': 'player-f4.png',
  'npc-stand-in': 'npc-stand-in.png',
  'raider-grunt': 'raider-grunt.png', 'raider-heavy': 'raider-heavy.png', 'scout-drone': 'scout-drone.png',
  'gun-drone': 'gun-drone.png', 'turret': 'turret.png', 'swarm-bug': 'swarm-bug.png',
  'cargo-crate': 'cargo-crate.png', 'fuel-barrel': 'fuel-barrel.png', 'supply-pod': 'supply-pod.png',
  'drill-rig': 'drill-rig.png', 'airlock-hub': 'airlock-hub.png', 'reactor-block': 'reactor-block.png',
  'antenna-mast': 'antenna-mast.png', 'boulder': 'boulder.png', 'solar-panel': 'solar-panel.png',
  'moon-boulder-s': 'moon-boulder-s.png', 'moon-boulder-m': 'moon-boulder-m.png', 'moon-boulder-l': 'moon-boulder-l.png',
  'moon-rock-cluster-a': 'moon-rock-cluster-a.png', 'moon-rock-cluster-b': 'moon-rock-cluster-b.png',
  'moon-rubble-a': 'moon-rubble-a.png', 'moon-rubble-b': 'moon-rubble-b.png', 'moon-crater-rim': 'moon-crater-rim.png',
  'asteroid': 'asteroid.png', 'relay-station': 'relay-station.png', 'relay-gate': 'relay-gate.png', 'warden': 'warden.png',
});

// Seamless ground textures for exterior maps (one pattern fill each).
export const GROUND_FILES = Object.freeze({ plating: 'tile-plating.png', regolith: 'tile-regolith.png', sand: 'tile-sand.png' });

// The cast's top-down sprites (cast lane, resized by scripts/stardust-art.py into ./art/cast/):
// 128 px WebP, facing UP like the player's frames, the body centre moved to the canvas centre
// so drawBody's centred rotate spins them about their middle. `captain` is whichever of the
// four captain looks is current (captainSprite below); the walk "frames" are drawBody's sway.
export const CAST_FILES = Object.freeze({
  chibby: 'chibby.webp', ralph: 'ralph.webp', mel: 'mel.webp', edna: 'edna.webp', captain: 'cap-a.webp',
  hask: 'hask.webp', vey: 'vey.webp', garrity: 'garrity.webp',
});

// The four captain looks. The hangar's look ids are p1..p4 (data.js PORTRAITS); the cast lane
// calls the same four cap-a..cap-d (jacket trim cyan, crimson, pink, azure).
export const CAPTAIN_LOOKS = Object.freeze({ 'cap-a': 'cap-a.webp', 'cap-b': 'cap-b.webp', 'cap-c': 'cap-c.webp', 'cap-d': 'cap-d.webp' });
const LOOK_ALIAS = Object.freeze({ p1: 'cap-a', p2: 'cap-b', p3: 'cap-c', p4: 'cap-d', a: 'cap-a', b: 'cap-b', c: 'cap-c', d: 'cap-d' });
/** The cap-a..cap-d id for a look id (cap-x, p1..p4 or a..d); anything else is cap-a. */
export const captainLookId = lookId => (CAPTAIN_LOOKS[lookId] ? lookId : LOOK_ALIAS[lookId] || 'cap-a');
let captainLook = 'cap-a';
/** Choose which captain look castImage('captain') draws (the page calls this with save.character.look.portrait). */
export const setCaptainLook = lookId => { captainLook = captainLookId(lookId); };
/** The captain's top-down sprite image for a look id (default: the current look, else cap-a), or null while loading. */
export const captainSprite = (lookId = captainLook) => loadImage(at(`cast/${CAPTAIN_LOOKS[captainLookId(lookId)]}`));

// Canvas side in px at which each sprite's figure stands 72 px tall (Ralph 56, Vey and Garrity 84),
// from scripts/stardust-art.py. drawBody draws a sprite at 46 * scale, so scale = side / 46.
// CAST_FIGURE_PX is the one knob for "how tall a person is on screen" (the player is drawn about 52).
export const CAST_FIGURE_PX = 72;
const CAST_CANVAS = { chibby: 93, ralph: 66.5, mel: 92, edna: 87, captain: 98.9, hask: 85.7, vey: 101.6, garrity: 116.4 };
const castScale = id => Math.round((CAST_CANVAS[id] * (CAST_FIGURE_PX / 72)) / 46 * 1000) / 1000;

// How each cast member looks on the prompt label (and the stand-in colour), and the sprite scale.
export const CAST_LOOK = Object.freeze({
  chibby: { name: 'Chibby', color: '#ffad72', scale: castScale('chibby') },
  ralph: { name: 'Ralph', color: '#f4d35e', scale: castScale('ralph'), dog: true },
  mel: { name: 'Mel', color: '#ff8fa3', scale: castScale('mel') },
  edna: { name: 'Edna', color: '#b9a4ff', scale: castScale('edna') },
  captain: { name: 'Captain', color: '#81e6df', scale: castScale('captain') },
  hask: { name: 'Hask', color: '#9fe870', scale: castScale('hask') },
  vey: { name: 'Vey', color: '#c8a2ff', scale: castScale('vey') },
  garrity: { name: 'Garrity', color: '#e0b061', scale: castScale('garrity') },
});

const images = new Map();
const listeners = new Set();
/** Called whenever an image finishes loading (the static map layer redraws). */
export const onArtLoaded = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function loadImage(url) {
  if (!url) return null;
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => { for (const fn of listeners) fn(url); };
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** A loaded sprite image for an art id, or null (draw a placeholder). Starts the load. */
export function sprite(id) {
  if (INTERIOR_ART.props[id]) return loadImage(INTERIOR_ART.props[id].url);
  return SPRITE_FILES[id] ? loadImage(at(SPRITE_FILES[id])) : null;
}
export const groundImage = id => (GROUND_FILES[id] ? loadImage(at(GROUND_FILES[id])) : null);
export const tileImage = () => null; // single tiles: none yet (interiors come as room floors and wall sets)
/** The art room ('workshop', 'cockpit', ...) -> { floor: image|null, wall(piece): image|null }, or null without art. */
export function roomArt(room) {
  const r = room && INTERIOR_ART.rooms[room];
  if (!r) return null;
  const floor = INTERIOR_ART.floors[r.floor];
  const walls = INTERIOR_ART.walls[r.wall] || {};
  return { floor: floor ? loadImage(floor.url) : null, floorCovers: floor?.covers || [4, 4], wall: piece => (walls[piece] ? loadImage(walls[piece]) : null) };
}
export const interiorProp = id => INTERIOR_ART.props[id] || null;
export const castImage = id => (id === 'captain' ? captainSprite() : CAST_FILES[id] ? loadImage(at(`cast/${CAST_FILES[id]}`)) : null);
export const playerFrames = () => ['player-f1', 'player-f2', 'player-f3', 'player-f4'].map(sprite);

/** Start loading everything a map needs, so the first frames have art. */
export function preload(map) {
  for (const p of map.props) sprite(p.art);
  for (const room of [map.def.room, ...(map.def.rooms || []).map(r => r.room)]) {
    const art = roomArt(room);
    if (art) for (const piece of ['edge-n', 'edge-s', 'edge-w', 'edge-e', 'corner-nw', 'corner-ne', 'corner-sw', 'corner-se', 'outer-nw', 'outer-ne', 'outer-sw', 'outer-se']) art.wall(piece);
  }
  sprite('door-open'); sprite('door-closed');
  groundImage(map.floor);
  playerFrames();
  sprite('npc-stand-in');
  for (const n of map.npcs) castImage(n.id);
}

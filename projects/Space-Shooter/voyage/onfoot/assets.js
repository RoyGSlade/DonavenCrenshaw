// The on-foot and exploration art map: the only file that names art paths for
// these layers. Pack art (approved desert, moon base, enemies and on-foot
// straight-down sprites) is resized into ./art/ by
// lhc-lanes/stardust/onfoot/tools/prep-art.py. Cast sprites and interior
// tiles and props are not delivered yet: every id below without a file draws a
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
  'asteroid': 'asteroid.png', 'relay-station': 'relay-station.png', 'relay-gate': 'relay-gate.png', 'warden': 'warden.png',
});

// Seamless ground textures for exterior maps (one pattern fill each).
export const GROUND_FILES = Object.freeze({ plating: 'tile-plating.png', regolith: 'tile-regolith.png', sand: 'tile-sand.png' });

// The cast's top-down sprites from the cast lane, when they land (file under ./art/cast/).
export const CAST_FILES = Object.freeze({ chibby: null, ralph: null, mel: null, edna: null, captain: null, hask: null, vey: null, garrity: null });

// How the placeholder for each cast member looks, and the name on the prompt.
export const CAST_LOOK = Object.freeze({
  chibby: { name: 'Chibby', color: '#ffad72', scale: 1.05 },
  ralph: { name: 'Ralph', color: '#f4d35e', scale: 0.62, dog: true },
  mel: { name: 'Mel', color: '#ff8fa3', scale: 1 },
  edna: { name: 'Edna', color: '#b9a4ff', scale: 0.95 },
  captain: { name: 'Captain', color: '#81e6df', scale: 1 },
  hask: { name: 'Hask', color: '#9fe870', scale: 1.05 },
  vey: { name: 'Vey', color: '#c8a2ff', scale: 1 },
  garrity: { name: 'Garrity', color: '#e0b061', scale: 1.1 },
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
  if (INTERIOR_ART.props[id]) return loadImage(INTERIOR_ART.props[id]);
  return SPRITE_FILES[id] ? loadImage(at(SPRITE_FILES[id])) : null;
}
export const groundImage = id => (GROUND_FILES[id] ? loadImage(at(GROUND_FILES[id])) : null);
export const tileImage = id => (INTERIOR_ART.tiles[id] ? loadImage(INTERIOR_ART.tiles[id]) : null);
export const castImage = id => (CAST_FILES[id] ? loadImage(at(`cast/${CAST_FILES[id]}`)) : null);
export const playerFrames = () => ['player-f1', 'player-f2', 'player-f3', 'player-f4'].map(sprite);

/** Start loading everything a map needs, so the first frames have art. */
export function preload(map) {
  for (const p of map.props) sprite(p.art);
  groundImage(map.floor);
  playerFrames();
  sprite('npc-stand-in');
  for (const n of map.npcs) castImage(n.id);
}

// The hangar's asset map: the FLUX UI kit, the station props, the cast's
// portraits and the ambience. The only file in voyage/ui naming these paths,
// so a picture or a sound is swapped with one file and one line. The cast
// lane's portraits (lhc-lanes/stardust/cast) are copied small into voyage/art/cast
// by scripts/stardust-art.py; a character without one shows the speaker's initial.
import { CAST_DATA } from '../story/data/cast.js';
import { castPortrait as storyPortrait } from '../story/cast.js';

const at = (path) => new URL(`./${path}`, import.meta.url).href;

// UI kit pieces: kit/<name>.webp (sliced and keyed from the FLUX picks; see
// lhc-lanes/stardust/hangar2/kit/KIT.md for which raw picture each came from).
export const UI_KIT = Object.freeze([
  'panel', 'panel-light', 'dialogue', 'nameplate', 'frame-portrait',
  'button', 'button-hover', 'button-pressed', 'button-disabled',
  'button-primary', 'button-primary-hover', 'button-primary-pressed', 'button-primary-disabled',
  'tab', 'tab-active',
  'node-locked', 'node-available', 'node-learned', 'connector',
  'icon-str', 'icon-cha', 'icon-con', 'icon-dex', 'icon-wis', 'icon-credits', 'icon-skillpoint',
  'icon-helm', 'icon-guns', 'icon-wrench',
  'icon-scrap', 'icon-ore', 'icon-circuit', 'icon-fuel-cell', 'icon-permit', 'icon-nav-chip', 'icon-railgun', 'icon-cargo-crate', 'icon-mining-drill',
]);
const KIT = new Set(UI_KIT);

/** URL of a UI kit picture by name ('node-learned', 'icon-dex'...). Unknown names fall back to the panel. */
export function uiArt(name) {
  return at(`kit/${KIT.has(name) ? name : 'panel'}.webp`);
}

/** Icon for an item id, a stat id or 'credits'; null when the kit has none. */
export function iconFor(id) {
  const name = `icon-${id}`;
  return KIT.has(name) ? at(`kit/${name}.webp`) : null;
}

// Straight-down station props (hangarStations.js `art` keys) and the deck texture.
export const HANGAR_ART = Object.freeze({
  deck: at('kit/backdrop-deck.jpg'),
  props: Object.freeze({
    workbench: at('kit/prop-workbench.webp'),
    kennel: at('kit/prop-kennel.webp'),
    scrap: at('kit/prop-scrap.webp'),
    fitting: at('kit/prop-fitting.webp'),
    range: at('kit/prop-range.webp'),
    market: at('kit/prop-market.webp'),
    comms: at('kit/prop-board.webp'),
    bunk: at('kit/prop-bunk.webp'),
    hatch: at('kit/prop-hatch.webp'),
  }),
});

// Cast portraits: one source of truth, story's cast data (story/data/cast.js `portraits`, files in
// voyage/art/cast/, made by scripts/stardust-art.py). cap-a..cap-d are the four captain looks.
export const CAST_PORTRAITS = CAST_DATA.portraits;

/**
 * URL of a cast member's portrait for a line emotion (neutral, happy, annoyed, or any story
 * emotion such as 'warm' or 'grumpy'), or null (the dialogue box shows an initial).
 * The same function as story's castPortrait, so both boxes show the same face.
 */
export function castPortrait(id, emotion = 'neutral') {
  return storyPortrait(id, emotion);
}

// Ambience beds from the voice lane (lhc-lanes/stardust/voice/ambience/manifest.json):
// seamless loops; OGG loops without a gap, MP3 for browsers without Vorbis.
export const AMBIENCE = Object.freeze({
  hangar: { ogg: '../audio/ambience/hangar-hum.ogg', mp3: '../audio/ambience/hangar-hum.mp3', gain: 0.8 },
  // Chibby's workshop (slide guitar, warm synth) and Edna's den (electric piano, sub bass): about 80 kbps,
  // re-encoded by scripts/stardust-assets.mjs ambience. The hangar page wires which map plays which bed.
  workshop: { ogg: '../audio/ambience/tinker-bench.ogg', mp3: '../audio/ambience/tinker-bench.mp3', gain: 0.8 },
  den: { ogg: '../audio/ambience/night-shift.ogg', mp3: '../audio/ambience/night-shift.mp3', gain: 0.8 },
});

/** The ambience file this browser can loop: { url, gain } or null. */
export function ambienceFor(id, canPlay = (type) => (typeof Audio === 'function' ? new Audio().canPlayType(type) : '')) {
  const bed = AMBIENCE[id];
  if (!bed) return null;
  const ogg = canPlay('audio/ogg; codecs="vorbis"');
  return { url: at(ogg ? bed.ogg : bed.mp3), gain: bed.gain };
}

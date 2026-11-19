// The skills menu's art hooks (skills-menu lane, 2026-11-18). Every picture the menu could
// wear is named here and asked for through one call, so the FLUX kit (launch/SKILLKIT-LANE.md)
// drops in by filling KIT_URLS and nothing else. With no picture set the page draws its own
// CSS and inline SVG stand-ins (the design's emblems, ring and notches).
//
// To drop a piece in: copy the .webp to ui/kit/skills/ and add `'piece-id': 'file.webp'` to KIT_URLS.
import { ROLL_SKILL_IDS } from '../data.js';

export const ART_PIECES = Object.freeze([
  ...ROLL_SKILL_IDS.flatMap((id) => [`emblem-${id}-lit`, `emblem-${id}-dim`]),
  'ring-frame', // the level ring's machined frame, 9 empty sockets the code lights
  'card-frame', // a path card's frame (nine-slice friendly)
  'notch-empty', 'notch-filled', 'notch-pending',
]);
const KNOWN = new Set(ART_PIECES);

/**
 * piece id -> file name inside ui/kit/skills/. The FLUX kit (launch/skillkit/HANDOFF.md, picks A): emblems are cut
 * to the badge's bounding box and centred so lit and dim sit on the same spot; the ring is the plain metal one (the
 * page draws its nine lit arcs in the channel); the card is darkened and re-tinted in CSS; the notch is tinted per
 * skill in CSS. A different pick on Donaven's cards means a different file here, nothing else. No notch-pending
 * picture: pending is an outline the code draws.
 */
export const KIT_URLS = {
  ...Object.fromEntries(ROLL_SKILL_IDS.flatMap((id) => [[`emblem-${id}-lit`, `emblem-${id}-lit.webp`], [`emblem-${id}-dim`, `emblem-${id}-dim.webp`]])),
  'ring-frame': 'ring.webp', 'card-frame': 'card.webp', 'notch-empty': 'notch-empty.webp', 'notch-filled': 'notch-filled.webp',
};

const BASE = new URL('../ui/kit/skills/', import.meta.url);

/** An art set over a piece -> file map; get(piece) is a URL string, or null while the stand-in draws. */
export function createArt(files = KIT_URLS) {
  return { get: (piece) => (KNOWN.has(piece) && typeof files[piece] === 'string' && files[piece] ? new URL(files[piece], BASE).href : null) };
}
const kit = createArt();
/** URL of a kit piece, or null while the stand-in draws. */
export const skillArt = (piece) => kit.get(piece);

// The cast: who speaks, where they stand, and what to call them on screen.
// The bible (voice, looks, history) is lhc-lanes/stardust/story/CAST.md.
// Ids are ROUND2-CONTRACT.md section 1. Portraits arrive from the cast lane;
// until then `portrait` is null and the caption shows initials. The quest
// givers' portraits already live in core's art map (voyage/art.js).
import { giverPortrait } from '../art.js';
import { CAST_DATA } from './data/cast.js';

export const CAST = Object.freeze(Object.fromEntries(Object.entries(CAST_DATA.cast).map(([id, c]) => [id, Object.freeze({ ...c })])));
export const CAST_IDS = Object.freeze(Object.keys(CAST));
export const HANGAR_CAST = Object.freeze(['chibby', 'ralph', 'mel', 'edna']);
export const GIVER_CAST = Object.freeze(['garrity', 'hask', 'vey']);

// Cast-lane portraits (data: CAST_DATA.portraits, file names under voyage/art/cast/)
// and which expression each line emotion shows.
const PORTRAITS = CAST_DATA.portraits || {};
const EXPRESSION = new Map(Object.entries(CAST_DATA.expressions || {}).flatMap(([face, emotions]) => emotions.map((e) => [e, face])));

/** The expression a line's emotion shows: 'neutral', 'happy' or 'annoyed'. */
export const expressionFor = (emotion) => EXPRESSION.get(emotion) || 'neutral';

/** A portrait URL for a cast member (in the expression for `emotion`), or null (show initials). */
export function castPortrait(id, emotion = 'neutral') {
  const set = PORTRAITS[id];
  const file = set && (set[expressionFor(emotion)] || set.neutral);
  if (file) return new URL(`../art/cast/${file}`, import.meta.url).href;
  return CAST[id]?.giver ? giverPortrait(id) : null;
}

export const castName = (id) => CAST[id]?.name || id;

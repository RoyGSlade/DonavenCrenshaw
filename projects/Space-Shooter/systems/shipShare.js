// A ship as a short text code a player can post (Discord, a message) and another
// can paste into the garage: "SDS1-" + base64url of compact JSON. Flight settings
// have the same idea ("SD1-", systems/flightSettings.js). No DOM, so tests run it
// in Node.
//
// A code carries the design and nothing else: hull family, the four part indices,
// the six paint colours and the decal layers. Same rules as every other way a
// design gets in (the hub, a design file), and stricter in one place: a code that
// holds anything the format does not allow is REFUSED, not trimmed.
//   - no images: no png/image layer, no data: URI anywhere
//   - text layers carry a saying id from SAYINGS and nothing else; no free text
//   - known family and part indices, hex colours, every number in its range
// Layer ids are not carried (they are throwaway); decoding gives each layer a
// fresh one. Numbers are rounded to four decimals so codes stay short enough for
// a chat message.
import { PART_SLOTS, ZONES, SHAPES, MAX_LAYERS, SHIP_STYLES, cleanAppearance, sayingText } from './shipLivery.js';

export const SHIP_CODE_PREFIX = 'SDS1-';
export const SHIP_CODE_MAX = 8000;

const HEX6 = /^[0-9a-f]{6}$/i;
const BODY = /^[A-Za-z0-9_-]+$/;
// The flags a layer carries, one bit each.
const FLAGS = [['flipX', 1], ['flipY', 2], ['visible', 4], ['recolor', 8]];
const round = (v, places) => Math.round(v * 10 ** places) / 10 ** places;
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
// An image anywhere in decoded JSON: a data: URI, or an image/png style mime.
const IMAGE = /data:|;\s*base64|image\//i;
const hasImage = (value, depth = 0) => (typeof value === 'string' ? IMAGE.test(value) : depth < 6 && Boolean(value) && typeof value === 'object' && Object.values(value).some((v) => hasImage(v, depth + 1)));

const toBase64Url = (text) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text) => atob(text.replace(/-/g, '+').replace(/_/g, '/'));

/** An appearance → its share code, or null when it is not a valid design. */
export function encodeShipCode(appearance) {
  const a = cleanAppearance(appearance);
  if (!a) return null;
  const layers = a.layers.map((d) => {
    const row = [
      SHAPES.indexOf(d.kind), round(d.x, 4), round(d.y, 4), round(d.width, 4), round(d.height, 4), round(d.angle, 2), round(d.opacity, 2),
      d.color.slice(1), FLAGS.reduce((bits, [key, bit]) => bits | (d[key] ? bit : 0), 0),
    ];
    if (d.kind === 'text') row.push(d.saying);
    return row;
  });
  const data = { v: 1, f: a.family, p: PART_SLOTS.map((s) => a.parts[s]), c: ZONES.map((z) => a.paint[z].slice(1)), l: layers };
  return SHIP_CODE_PREFIX + toBase64Url(JSON.stringify(data));
}

// Why a code was refused, for the garage's status line. decodeShipCode keeps its
// answer simple (design or null); this is for the words.
export function shipCodeProblem(code) {
  const text = String(code ?? '').trim();
  if (!text.startsWith(SHIP_CODE_PREFIX)) return 'That is not a Stardust ship code. Ship codes start with SDS1-.';
  if (decodeShipCode(text)) return null;
  return 'That ship code is not valid. It may be cut off, or hold something Stardust designs do not allow (images, free text).';
}

/** A pasted code → a validated, normalised appearance, or null for anything that is not a valid ship code. */
export function decodeShipCode(code) {
  try {
    const text = String(code ?? '').trim();
    if (!text.startsWith(SHIP_CODE_PREFIX) || text.length > SHIP_CODE_MAX) return null;
    const body = text.slice(SHIP_CODE_PREFIX.length);
    if (!body || !BODY.test(body)) return null;
    const json = fromBase64Url(body);
    const data = JSON.parse(json);
    if (!isObject(data) || data.v !== 1 || hasImage(data)) return null;
    // Exactly the known keys: a code with extra fields is not one of ours.
    if (Object.keys(data).sort().join() !== 'c,f,l,p,v') return null;
    if (typeof data.f !== 'string' || !Array.isArray(data.p) || data.p.length !== PART_SLOTS.length) return null;
    if (!Array.isArray(data.c) || data.c.length !== ZONES.length || !data.c.every((c) => typeof c === 'string' && HEX6.test(c))) return null;
    if (!Array.isArray(data.l) || data.l.length > MAX_LAYERS) return null;
    const layers = [];
    for (const [i, row] of data.l.entries()) {
      if (!Array.isArray(row) || (row.length !== 9 && row.length !== 10)) return null;
      const kind = SHAPES[row[0]];
      if (!Number.isInteger(row[0]) || !kind) return null;
      const [, x, y, width, height, angle, opacity, color, flags] = row;
      if (![x, y, width, height, angle, opacity].every(Number.isFinite) || typeof color !== 'string' || !HEX6.test(color) || !Number.isInteger(flags) || flags < 0 || flags > 15) return null;
      const layer = { id: `s${i + 1}`, kind, x, y, width, height, angle, opacity, color: `#${color}`, ...Object.fromEntries(FLAGS.map(([key, bit]) => [key, (flags & bit) !== 0])) };
      if (kind === 'text') {
        // Only a saying id from the fixed list; a text layer with anything else is refused.
        if (row.length !== 10 || sayingText(row[9]) === null) return null;
        layer.saying = row[9];
      } else if (row.length !== 9) return null;
      layers.push(layer);
    }
    const clean = cleanAppearance({
      version: 2, family: data.f,
      parts: Object.fromEntries(PART_SLOTS.map((s, i) => [s, data.p[i]])),
      paint: Object.fromEntries(ZONES.map((z, i) => [z, `#${data.c[i]}`])),
      layers,
    });
    // cleanAppearance trims what it dislikes; a share code must survive it whole.
    return clean && clean.layers.length === layers.length ? clean : null;
  } catch {
    return null;
  }
}

const label = (family) => SHIP_STYLES.find((s) => s.id === family)?.id.replace(/^./, (c) => c.toUpperCase()) || 'Ship';

/** The name a copied design gets in the garage: "Ada's Manta", or "Shared Manta" for a pasted code. */
export function importedShipName(family, from = null) {
  return (from ? `${from}'s ${label(family)}` : `Shared ${label(family)}`).slice(0, 60);
}

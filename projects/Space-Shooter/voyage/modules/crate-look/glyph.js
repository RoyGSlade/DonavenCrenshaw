// The strapped parcel an item is drawn as when its record has no picture. Copied from the approved shop-counter module (a module never
// imports another); changed only to pick its stencil by the record's glyph or kind, never by a name, and to use this module's class names.
import { hashSeed } from './model.js';
const SVG_NS = 'http://www.w3.org/2000/svg';
function h(tag, attrs = {}) { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else el.setAttribute(k, v); } return el; }
const SHAPES = {
  gear: '<path d="M14 12 26 8Q32 15 38 8L50 12 52 30Q52 48 32 58 12 48 12 30Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M32 20V50M22 28H42" stroke="HI" stroke-width="2" opacity=".55"/><circle cx="21" cy="19" r="1.8" fill="HI"/><circle cx="43" cy="19" r="1.8" fill="HI"/>',
  part: '<g stroke="HI" stroke-width="2.4" stroke-linecap="round" opacity=".8"><path d="M22 6V14M32 6V14M42 6V14M22 50V58M32 50V58M42 50V58M6 22H14M6 32H14M6 42H14M50 22H58M50 32H58M50 42H58"/></g><rect x="14" y="14" width="36" height="36" rx="5" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><rect x="23" y="23" width="18" height="18" rx="3" fill="#0006"/><rect x="26" y="26" width="12" height="12" rx="2" fill="HI" opacity=".7"/>',
  consumable: '<rect x="27" y="8" width="10" height="12" rx="2" fill="#cdd9e2"/><path d="M24 20H40L44 28V52Q44 58 38 58H26Q20 58 20 52V28Z" fill="#cfe9ee" fill-opacity=".25" stroke="#cfe9ee" stroke-width="2"/><path d="M21 36H43V52Q43 57 38 57H26Q21 57 21 52Z" fill="url(#G)"/><path d="M25 26 24 50" stroke="#fff" stroke-width="2" opacity=".35" stroke-linecap="round"/>',
  material: '<path d="M8 40 16 20 32 10 52 20 56 40 42 56 20 54Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M16 20 32 30 52 20M32 30 20 54M32 30 42 56M8 40 32 30 56 40" stroke="HI" stroke-width="1.6" fill="none" opacity=".55"/>',
  key: '<rect x="6" y="16" width="52" height="32" rx="6" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><rect x="12" y="22" width="14" height="11" rx="2" fill="HI" opacity=".75"/><path d="M12 40H46M12 44H36" stroke="HI" stroke-width="2" opacity=".5" stroke-linecap="round"/><circle cx="49" cy="26" r="3" fill="HI"/>',
  cargo: '<rect x="8" y="14" width="48" height="38" rx="3" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M8 24H56M8 42H56M22 14V52M42 14V52" stroke="#0008" stroke-width="3"/><path d="M8 24H56M8 42H56" stroke="HI" stroke-width="1" opacity=".5"/>',
};
Object.assign(SHAPES, {
  armour: '<path d="M16 10 26 7Q32 14 38 7L48 10 58 22 50 30 47 26V56H17V26L14 30 6 22Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M32 14V56M22 34H42M22 44H42" stroke="HI" stroke-width="1.8" opacity=".5"/>',
  boots: '<path d="M16 8H32V34L50 42Q58 46 58 54H12Q10 54 10 50V12Q10 8 16 8Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M10 54H58" stroke="HI" stroke-width="3" opacity=".55"/><path d="M16 18H30M16 26H30" stroke="HI" stroke-width="2" opacity=".5"/>',
  gun: '<path d="M6 22H46L52 18H58V30H44L40 34H30L28 52H16L20 34H6Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M10 26H42" stroke="HI" stroke-width="2" opacity=".5"/><circle cx="48" cy="24" r="2" fill="HI"/>',
  visor: '<path d="M6 22Q6 14 14 14H50Q58 14 58 22V38Q58 46 50 46H40L32 40 24 46H14Q6 46 6 38Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><rect x="12" y="22" width="18" height="12" rx="6" fill="#0b1724" stroke="HI" stroke-width="2"/><rect x="34" y="22" width="18" height="12" rx="6" fill="#0b1724" stroke="HI" stroke-width="2"/><path d="M6 28H0M58 28H64" stroke="HI" stroke-width="3" opacity=".6"/>',
  kit: '<rect x="8" y="16" width="48" height="36" rx="5" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><path d="M22 16V10H42V16" fill="none" stroke="#0009" stroke-width="3"/><path d="M32 24V44M22 34H42" stroke="HI" stroke-width="6" stroke-linecap="round"/>',
  tool: '<path d="M44 6Q56 6 56 18Q56 22 52 24L24 52Q18 58 12 52Q6 46 12 40L40 12Q42 8 44 6Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><circle cx="16" cy="48" r="3" fill="#0008"/><path d="M44 14 50 20" stroke="HI" stroke-width="2.4" opacity=".6"/>',
  roll: '<ellipse cx="32" cy="46" rx="22" ry="8" fill="#0006"/><path d="M10 22V44Q10 52 32 52T54 44V22Z" fill="url(#G)" stroke="#0007" stroke-width="1.5"/><ellipse cx="32" cy="22" rx="22" ry="8" fill="HI" opacity=".75" stroke="#0007" stroke-width="1.5"/><ellipse cx="32" cy="22" rx="9" ry="3.5" fill="#0b1724"/>',
});
SHAPES.default = SHAPES.part;
/** Which shape to draw: the record's own `glyph`, else a plain-word guess from the name, else the kind. */
function shapeFor(it) {
  if (it.glyph && SHAPES[it.glyph]) return it.glyph;
  return SHAPES[it.kind] ? it.kind : 'default';
}
/** Items with no picture are drawn as one well-made object: a strapped, tagged parcel with the item's shape stencilled on its face. */
export function glyph(it) {
  const { kind, id } = it;
  const hue = hashSeed(id) % 360;
  const uid = String(id).replace(/[^a-z0-9]/gi, '');
  const stencil = SHAPES[shapeFor({ ...it, kind })].replaceAll('url(#G)', '#e6eff2').replaceAll(/ stroke="#0007" stroke-width="1\.5"/g, '').replaceAll('HI', '#2b3a47');
  const words = String(it.name || id).split(/[\s-]+/).filter(Boolean);
  const mark = (words.length > 1 ? words[0][0] + words[1][0] : String(words[0] || '?').slice(0, 2)).toUpperCase();
  const acc = `hsl(${hue} 68% 56%)`;
  const span = h('span', { class: 'cl-glyph', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 64 64" xmlns="${SVG_NS}"><defs><linearGradient id="clp-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a6073"/><stop offset="1" stop-color="#22303c"/></linearGradient></defs>`
    + `<rect x="5" y="12" width="54" height="44" rx="4" fill="url(#clp-${uid})" stroke="#0a1118" stroke-width="2"/><path d="M7 14.5H57" stroke="#a9bccb" stroke-width="1.2" opacity=".55"/><path d="M5 23H59" stroke="#0a1118" stroke-width="1.5" opacity=".55"/>`
    + `<g opacity=".92" transform="translate(9 25) scale(.46)">${stencil}</g>`
    + `<rect x="43" y="12" width="7" height="44" fill="${acc}"/><path d="M43 12V56M50 12V56" stroke="#0a1118" stroke-width="1" opacity=".45"/>`
    + `<circle cx="10" cy="17" r="1.6" fill="#a9bccb"/><circle cx="54" cy="17" r="1.6" fill="#a9bccb"/><circle cx="10" cy="51" r="1.6" fill="#a9bccb"/><circle cx="54" cy="51" r="1.6" fill="#a9bccb"/>`
    + `<g transform="rotate(-9 47 42)"><rect x="38" y="35" width="17" height="13" rx="1.6" fill="#efe3c6" stroke="#6a5630" stroke-width="1"/><circle cx="41" cy="38" r="1.1" fill="#2c3a46"/><text x="47.5" y="46" font-size="7.5" font-weight="800" font-family="Consolas,'DejaVu Sans Mono',monospace" text-anchor="middle" fill="#2a1f10">${mark}</text></g></svg>`;
  return span;
}

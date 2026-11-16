// Line icons for the HUD (interact marks, prompt, datapad tabs, tracker): 24-unit
// boxes drawn with currentColor, so CSS colours them per station accent. These are
// the clean stand-ins until the art lane's HUD kit lands; ui/assets.js hudArt(id)
// returns a picture for an id when the kit has one, and that wins.
import { hudArt } from '../ui/assets.js';

export const ICONS = Object.freeze({
  talk: 'M4 5h16v11H10l-5 4v-4H4z M8 10h.01M12 10h.01M16 10h.01',
  use: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  door: 'M5 21V4h10v17M3 21h14M12 12h.01M17 8l4 4-4 4M21 12h-6',
  shop: 'M5 8h14l-1.5 12h-11zM9 8V6a3 3 0 0 1 6 0v2',
  jobs: 'M5 4h14v17H5zM9 9h6M9 13h6M9 17h3',
  bunk: 'M3 18V8M3 14h18v4M21 18v-4M7 11h4a2 2 0 0 1 2 2v1H7zM16 7h4M18 5l2 2-2 2',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  paw: 'M8 9.5a1.6 2 0 1 0 0-.1M16 9.5a1.6 2 0 1 0 0-.1M5 13.5a1.4 1.7 0 1 0 0-.1M19 13.5a1.4 1.7 0 1 0 0-.1M12 13c-3 0-5 3.5-4 5.5s6.5 2 8 0-1-5.5-4-5.5z',
  mine: 'M4 20l9-9M12 5c3 0 6 2 7 5-2-1-5-1-7 0zM12 5c-1 2-1 5 0 7',
  range: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11v2',
  hack: 'M4 5h16v11H4zM8 20h8M12 16v4M8 9l2 2-2 2M12 13h4',
  look: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  fly: 'M12 2l3 7 5 3-5 1-3 7-3-7-5-1 5-3z',
  locked: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3M12 15v2',
  captain: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 4-6 8-6s8 2 8 6',
  pack: 'M6 8h12v13H6zM9 8V5h6v3M6 13h12M11 13v2h2v-2',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  objective: 'M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z',
  pause: 'M8 5v14M16 5v14',
  bag: 'M5 9h14l-1 11H6zM9 9V6a3 3 0 0 1 6 0v3M9 13h6',
  tick: 'M5 12l4 4 10-10',
  goggles: 'M3 10h18v5a2 2 0 0 1-2 2h-4l-3-3-3 3H5a2 2 0 0 1-2-2zM7 13.5h.01M17 13.5h.01',
  boots: 'M7 3h5v9l7 4v4H5v-4l2-1zM5 17h14',
  medkit: 'M4 7h16v13H4zM9 7V4h6v3M12 10v7M8.5 13.5h7',
  transponder: 'M8 9h8v11H8zM12 9V5M9 3l3 2 3-2M10.5 13h3M10.5 16h3',
  codes: 'M5 4h14v16H5zM8 8h3M8 12h8M8 16h5M14 7l2 2-2 2',
});

const SVG = 'http://www.w3.org/2000/svg';
/** An inline icon element (an <img> when the HUD kit has a picture for it). */
export function icon(id, cls = 'dp-icon') {
  const art = hudArt(`icon-${id}`);
  if (art) {
    const img = document.createElement('img');
    img.src = art; img.alt = ''; img.className = cls; img.dataset.icon = id;
    return img;
  }
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.icon = id;
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[id] || ICONS.use);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

/**
 * A key cap: <kbd> with the key's label ("E", "Tab"). The HUD kit's cap for that key (label painted
 * in) wins; else its blank cap (wide for words) with the label on top; else the CSS cap.
 */
export function keyCap(label, cls = 'dp-key') {
  const k = document.createElement('kbd');
  k.className = cls;
  const own = hudArt(`key-${label}`);
  const blank = hudArt(String(label).length > 1 ? 'key-blank-wide' : 'key-blank');
  if (own) {
    k.classList.add('has-art', 'is-painted');
    k.style.setProperty('--dp-key-art', `url("${own}")`);
    k.setAttribute('aria-label', label);
    const sr = document.createElement('span');
    sr.className = 'dp-sr';
    sr.textContent = label;
    k.append(sr);
  } else {
    if (blank) { k.classList.add('has-art'); k.style.setProperty('--dp-key-art', `url("${blank}")`); }
    k.textContent = label;
  }
  if (String(label).length > 1) k.classList.add('is-wide');
  return k;
}

/** The big prompt's icon: the HUD kit's painted interact icon when there is one, else the line icon. */
export function promptIcon(id, cls = 'of-prompt-glyph') {
  const art = hudArt(`prompt-${id}`);
  if (!art) return icon(id, cls);
  const img = document.createElement('img');
  img.src = art; img.alt = ''; img.className = `${cls} is-painted`; img.dataset.icon = id;
  return img;
}

/** A step's mark (tracker, Jobs page): the kit's done / current / to-do mark, else null (CSS draws one). */
export function stepMark(state, cls = 'dp-step-art') {
  const art = hudArt(state === 'done' ? 'step-done' : state === 'now' ? 'step-current' : state === 'skipped' ? 'step-todo' : 'step-todo');
  if (!art) return null;
  const img = document.createElement('img');
  img.src = art; img.alt = ''; img.className = cls;
  return img;
}

// Line icons for items with no picture yet (Pack page), by item id.
export const ITEM_ICONS = Object.freeze({ 'scan-goggles': 'goggles', 'mag-boots': 'boots', medkit: 'medkit', 'ghost-transponder': 'transponder', 'syndicate-codes': 'codes' });

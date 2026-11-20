// The nav console screen (opening track A, outcome 6): a star map of the Drift with its sectors, and "Plot a course", which is locked
// with its reason until you are authorised (the captain, after scene 6). The map is the game's own sector data (maps/sector.json).
import { openObjectScreen, section, chip, note, button, row } from './kit.js';
import { createEl } from '../dom.js';
import { courseState } from '../../slice/objectState.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };

function drawMap(c) {
  const { w, h } = c.size;
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'ok-map', role: 'img', 'aria-label': `The Drift: ${c.places.map((p) => p.name).join(', ')}` });
  root.append(svg('rect', { x: 0, y: 0, width: w, height: h, class: 'ok-map-bg' }));
  for (let x = 20; x < w; x += 20) root.append(svg('line', { x1: x, y1: 0, x2: x, y2: h, class: 'ok-map-grid' }));
  for (let y = 20; y < h; y += 20) root.append(svg('line', { x1: 0, y1: y, x2: w, y2: y, class: 'ok-map-grid' }));
  for (const [x, y, r] of c.rocks) root.append(svg('circle', { cx: x, cy: y, r, class: 'ok-map-rock' }));
  for (const p of c.pois) root.append(svg('circle', { cx: p.at[0], cy: p.at[1], r: 2.2, class: `ok-map-poi${p.scanned ? ' is-scanned' : ''}` }));
  // The lanes: faint dotted lines from the hangar to every place. A lane you may not plot is dimmer.
  for (const p of c.places) root.append(svg('line', { x1: c.home.at[0], y1: c.home.at[1], x2: p.at[0], y2: p.at[1], class: `ok-map-lane${c.authorised ? ' is-open' : ''}` }));
  const star = (cx, cy, r, cls) => root.append(svg('circle', { cx, cy, r, class: cls }));
  star(c.home.at[0], c.home.at[1], 3.2, 'ok-map-home');
  root.append(svg('text', { x: c.home.at[0] + 5, y: c.home.at[1] + 1.5, class: 'ok-map-label' }, c.home.name));
  for (const p of c.places) {
    star(p.at[0], p.at[1], 3.4, 'ok-map-place');
    root.append(svg('text', { x: p.at[0] + 5, y: p.at[1] + 1.5, class: 'ok-map-label' }, p.name));
  }
  const [hx, hy] = c.here;
  star(hx, hy, 2.6, 'ok-map-here');
  star(hx, hy, 5.5, 'ok-map-here-ring');
  root.append(svg('text', { x: hx + 5, y: hy + 1.5, class: 'ok-map-label is-here' }, 'Tin Duchess'));
  return root;
}

/** deps: { store, helm }. helm(): opens the ship's course list (only called when authorised). Resolves when the player leaves. */
export function playNav({ store, helm }) {
  return new Promise((resolve) => {
    const screen = openObjectScreen({ word: 'BRIDGE', title: 'Nav console', kind: 'nav', onLeave: () => done() });
    const c = courseState(store?.get() || {});
    const places = createEl('ul', { class: 'ok-places' }, ...c.places.map((p) => createEl('li', { dataset: { place: p.id } }, createEl('b', { text: p.name }), createEl('small', { text: p.known ? `${p.giver ? `${p.giver[0].toUpperCase()}${p.giver.slice(1)} works there. ` : ''}` : 'Nobody you know. Yet.' }))));
    const plot = button({ label: 'Plot a course', primary: true, locked: !c.authorised, reason: c.reason || '', data: { nav: 'plot' }, onClick: () => { done(); helm?.(); } });
    screen.body.append(section('The Drift', createEl('div', { class: 'ok-map-wrap' }, drawMap(c)), createEl('p', { class: 'ok-note', text: 'The Tin Duchess is somewhere between the hangar and nowhere. The chart marks the Veil: no.' })),
      section('Sectors', places), section('Courses', plot, note(c.authorised ? 'Pick where to fly. Chibby is waiting.' : 'You can read the chart. Only the pilot can set the heading.')));
    let ended = false;
    function done() { if (ended) return; ended = true; screen.close(); resolve(); }
  });
}

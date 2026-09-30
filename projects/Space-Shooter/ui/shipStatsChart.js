// The garage's stat chart: a pentagon with one axis per stat (engine/shipStats.js
// STAT_NAMES), the build's shape filled over the standard ship's outline, each
// stat as points (standard ship = 50), and the hull size underneath.
import { STAT_NAMES, statPoints, buildStats, buildHullSize, isBuild } from '../engine/shipStats.js';

const NS = 'http://www.w3.org/2000/svg';
const R = 70, CX = 110, CY = 96;   // chart radius and centre in the 220 x 196 view box
const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / STAT_NAMES.length;
const point = (i, value) => [CX + Math.cos(angle(i)) * R * (value / 100), CY + Math.sin(angle(i)) * R * (value / 100)];
const polygon = (values) => values.map((v, i) => point(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

/** A stat card element with update(buildKey) to show a build (or hide for a non-build). */
export function createStatChart() {
  const card = document.createElement('div');
  card.className = 'garage-stats';
  card.hidden = true; // until the garage shows a build
  const title = document.createElement('p');
  title.className = 'garage-stats-title';
  title.textContent = 'FLIGHT STATS';
  const svg = el('svg', { viewBox: '0 0 220 196', role: 'img' });
  // Rings at 25 / 50 / 75 / 100; the 50 ring is the standard ship.
  for (const ring of [25, 50, 75, 100]) {
    svg.append(el('polygon', { points: polygon(STAT_NAMES.map(() => ring)), class: ring === 50 ? 'ring standard' : 'ring' }));
  }
  STAT_NAMES.forEach((_, i) => {
    const [x, y] = point(i, 100);
    svg.append(el('line', { x1: CX, y1: CY, x2: x.toFixed(1), y2: y.toFixed(1), class: 'spoke' }));
  });
  const shape = el('polygon', { class: 'shape' });
  svg.append(shape);
  const labels = STAT_NAMES.map(([, name], i) => {
    const [x, y] = point(i, 128);
    const t = el('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': Math.abs(x - CX) < 4 ? 'middle' : x < CX ? 'end' : 'start', 'dominant-baseline': 'middle' });
    const n = el('tspan', { class: 'name' }); n.textContent = name.toUpperCase();
    const v = el('tspan', { class: 'value', dx: '4' });
    t.append(n, v);
    svg.append(t);
    return v;
  });
  const size = document.createElement('p');
  size.className = 'garage-stats-size';
  const note = document.createElement('p');
  note.className = 'garage-stats-note';
  note.textContent = '50 = standard ship. Applies on tracks that allow custom builds.';
  // Small screens have no room for the pentagon over the ship: one line instead.
  const row = document.createElement('p');
  row.className = 'garage-stats-row';
  const SHORT = { topSpeed: 'SPD', accel: 'THR', grip: 'GRP', boost: 'BST', brake: 'BRK' };
  card.append(title, svg, row, size, note);

  card.update = (key) => {
    if (!isBuild(key)) { card.hidden = true; return; }
    card.hidden = false;
    const points = statPoints(buildStats(key));
    shape.setAttribute('points', polygon(STAT_NAMES.map(([stat]) => points[stat])));
    STAT_NAMES.forEach(([stat], i) => { labels[i].textContent = String(points[stat]); });
    row.replaceChildren(...STAT_NAMES.map(([stat], i) => {
      const span = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = String(points[stat]);
      span.append(`${i ? ' · ' : ''}${SHORT[stat]} `, b);
      return span;
    }));
    const s = buildHullSize(key);
    size.textContent = `HULL ${s.width.toFixed(2)} × ${s.length.toFixed(2)} CELLS`;
    svg.setAttribute('aria-label', `Flight stats: ${STAT_NAMES.map(([stat, name]) => `${name} ${points[stat]}`).join(', ')}. Hull ${s.width.toFixed(2)} by ${s.length.toFixed(2)} cells.`);
  };
  return card;
}

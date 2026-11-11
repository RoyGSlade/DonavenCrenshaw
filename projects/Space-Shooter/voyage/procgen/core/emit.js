// Writing layer output as onfoot map data (STUDIO-SCHEMA.md, "Proposed by onfoot").
import { OUT, WALL, WINDOW, FLOOR, DOOR, ROCK } from './grid.js';

/** Grid rows as strings: '#' wall, '|' window, 'R' rock, ' ' outside, '.' floor (or the cell's mark). */
export function gridChars(g) {
  const rows = [];
  for (let y = 0; y < g.h; y++) {
    let row = '';
    for (let x = 0; x < g.w; x++) {
      const i = g.idx(x, y), t = g.type[i];
      row += t === WALL ? '#' : t === WINDOW ? '|' : t === ROCK ? 'R' : t === OUT ? ' ' : t === DOOR ? '.' : t === FLOOR ? (g.mark[i] || '.') : '?';
    }
    rows.push(row);
  }
  return rows;
}

export const round4 = (v) => Math.round(v * 10000) / 10000;

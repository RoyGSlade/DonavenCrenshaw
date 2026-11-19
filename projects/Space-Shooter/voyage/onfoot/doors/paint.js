// Draws the wall doors each frame over the baked layer: panels inside the wall thickness (slide apart into pockets,
// or swing), frames with a lit strip, the pocket slots, a lock strip when locked, and amber cycle lights in a vestibule.
const hex = (c, a = 1) => {
  if (typeof c !== 'string') return `rgba(255,255,255,${a})`;
  if (c[0] !== '#') return c;
  const n = parseInt(c.length === 4 ? c.replace(/./g, (m, i) => (i ? m + m : m)).slice(1) : c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const DEFAULT_LOOK = { doors: { open: '#5ce1f0', locked: '#ffad4d', jamb: '#4a525c' }, hazard: { yellow: '#e7b53c', dark: '#1c1d1f' }, accents: {}, light: {}, doorColors: {} };

/** The accent a door glows with: the door's own colour, else the look's, else the open cyan. */
export function doorColor(look, d, entry) {
  const L = look || DEFAULT_LOOK, c = d.color || entry?.color || L.doorColors?.[d.id];
  return (c && (L.accents?.[c] || L.light?.[c])) || (c && c[0] === '#' ? c : L.doors?.open || DEFAULT_LOOK.doors.open);
}

/** views: system.views(); locked(d) -> bool; cam is the world's camera ({ x, y, zoom }). */
export function drawWallDoors(c, sys, cam, view, look, locked) {
  const views = sys.views();
  if (!views.length) return;
  const L = look || DEFAULT_LOOK, D = { ...DEFAULT_LOOK.doors, ...(L.doors || {}) };
  const k = cam.zoom * view.dpr;
  c.save();
  c.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
  for (const v of views) {
    const d = v.door;
    if ((d.x + d.w - cam.x) * cam.zoom < 0 || (d.y + d.h - cam.y) * cam.zoom < 0 || (d.x - cam.x) * cam.zoom > view.w || (d.y - cam.y) * cam.zoom > view.h) continue;
    const entry = d.entry ? sys.entries.find(e => e.id === d.entry) : null;
    paintDoor(c, d, v, D, L, doorColor(L, d, entry), Boolean(!d.far && locked(d)));
  }
  c.restore();
}

function paintDoor(c, d, v, D, L, accent, locked) {
  const len = d.length, th = d.thick, half = len / 2, T = Math.min(d.w, d.h);
  c.save();
  c.translate(d.x + d.w / 2, d.y + d.h / 2);
  if (d.axis === 'v') c.rotate(Math.PI / 2); // local x = along the slide, local y = across the wall
  const jw = T * 0.34, o = v.open, cyc = v.pulse;
  const strip = locked ? D.locked : cyc > 0 ? mix(accent, '#ffad4d', cyc) : v.far ? hex(accent, 0.45) : accent;
  // The gap: dark passage under the panels.
  c.fillStyle = 'rgba(8,12,18,0.55)'; c.fillRect(-half, -th / 2, len, th);
  // Pocket slots in the wall beside the gap (where the panels go).
  if (d.style === 'slide') {
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -half - len / 2 + jw : half + jw, w = len / 2 - jw;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x0, -T * 0.07, w, T * 0.14);
      c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x0, T * 0.07, w, 1.2);
    }
  }
  // Panels: sliding leaves are clipped to the gap so they vanish into the wall at the frame; swinging leaves turn about their hinge.
  c.save();
  if (d.style === 'slide') { c.beginPath(); c.rect(-half, -th / 2, len, th); c.clip(); }
  if (d.style === 'slide') {
    const s = o * half;
    leaf(c, -half - s, -s, th, D, strip, locked, cyc, -1);
    leaf(c, s, half + s, th, D, strip, locked, cyc, 1);
  } else {
    // Swing: each leaf hinged at its outer jamb, turning toward the far side of the wall.
    const a = o * Math.PI * 0.47;
    for (const s of [-1, 1]) {
      c.save(); c.translate(s * half, 0); c.rotate(-s * a);
      leaf(c, s < 0 ? 0 : -half, s < 0 ? half : 0, th * 0.62, D, strip, locked, cyc, s);
      c.restore();
    }
  }
  c.restore();
  // Frames either side of the gap, with the lit strip facing the opening.
  for (const s of [-1, 1]) {
    const x = s < 0 ? -half - jw : half;
    c.fillStyle = D.jamb; c.fillRect(x, -th / 2, jw, th);
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(x, -th / 2, jw, 1.5);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x, th / 2 - 1.5, jw, 1.5);
    c.fillStyle = strip; c.fillRect(s < 0 ? x + jw - T * 0.1 : x + T * 0.04, -th / 2 + T * 0.12, T * 0.06, th - T * 0.24);
  }
  if (cyc > 0 || locked) { c.globalAlpha = (locked ? 0.35 : 0.5 * cyc); c.fillStyle = strip; c.fillRect(-half - jw, -th / 2 - 2, len + jw * 2, 4); c.fillRect(-half - jw, th / 2 - 2, len + jw * 2, 4); c.globalAlpha = 1; }
  c.restore();
}

// One leaf (local frame): gunmetal slab, lit lip, centre seam groove, a coloured leading-edge strip, hazard ticks.
function leaf(c, x0, x1, th, D, strip, locked, cyc, side) {
  const w = x1 - x0, y0 = -th / 2;
  const g = c.createLinearGradient(0, y0, 0, y0 + th);
  g.addColorStop(0, '#7b8590'); g.addColorStop(0.5, '#59626c'); g.addColorStop(1, '#3d444c');
  c.fillStyle = g; c.fillRect(x0, y0, w, th);
  c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x0, y0, w, 2);
  c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x0, y0 + th - 2, w, 2);
  // panel grooves
  c.fillStyle = 'rgba(0,0,0,0.32)';
  for (let i = 1; i < 3; i++) c.fillRect(x0 + (w * i) / 3, y0 + 3, 1.3, th - 6);
  // hazard ticks along the meeting edge
  const edge = side < 0 ? x1 : x0, n = 4, hh = th / n;
  for (let i = 0; i < n; i += 2) { c.fillStyle = D.hazard?.yellow || '#e7b53c'; c.globalAlpha = 0.8; c.fillRect(side < 0 ? edge - th * 0.16 : edge, y0 + i * hh, th * 0.16, hh); c.globalAlpha = 1; }
  // the lit strip down the middle of the meeting edge (a lock strip when locked)
  c.fillStyle = strip; c.globalAlpha = locked ? 0.95 : 0.8;
  const sx = side < 0 ? x1 - th * 0.2 : x0 + th * 0.2;
  c.fillRect(sx - 1.5, y0 + th * 0.18, 3, th * 0.64);
  c.globalAlpha = 1;
  if (locked) { c.fillStyle = D.locked; c.fillRect(Math.min(x0, x1) + w * 0.18, -2, w * 0.64, 4); }
}

const mix = (a, b, t) => {
  const p = s => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  if (typeof a !== 'string' || a[0] !== '#') return b;
  const A = p(a), B = p(b), m = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
};

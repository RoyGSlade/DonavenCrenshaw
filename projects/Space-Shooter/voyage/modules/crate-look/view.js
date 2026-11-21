// Crate look view: draws what model.view(state) says and sends the player's taps to the model. A crate on the bay floor seen from
// above at an angle: a lid you drag or tap, latches that flip, straw with dents, things piled so a bigger stack looks bigger, a
// packing slip clipped on the side, and your bag in a tray. Everything is SVG and CSS; the only pictures are item icons.
import * as M from './model.js';
import { glyph } from './glyph.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 800;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const withBase = (base, p) => (!p ? null : /^(https?:|data:|blob:|\/)/.test(p) ? p : new URL(p, base).href);
const r1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------------------------------------------- geometry
// One crate seen from above at an angle, in a W x H box. The opening narrows toward the far wall; the near wall faces you.
export function geometry(tall, tallH = 880) {
  const H = tall ? tallH : 560;
  const y0 = 78, y1 = H - 250;
  const xl = (y) => 160 - (160 - 70) * ((y - y0) / (y1 - y0));
  const xr = (y) => W - xl(y);
  return { H, y0, y1, y2: H - 40, xl, xr, tall };
}
/** Where each slot's pile stands, in box units. Stable for a slot. */
export function slotBoxes(g, n, seed) {
  const cols = Math.min(Math.max(n, 1), g.tall ? 3 : 4);
  const rows = Math.ceil(Math.max(n, 1) / cols);
  const top = g.y0 + (g.y1 - g.y0) * (g.tall ? 0.3 : 0.2), bot = g.y1 - 6;
  const rh = (bot - top) / rows;
  const out = [];
  for (let i = 0; i < Math.max(n, 1); i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = Math.min(cols, Math.max(n, 1) - r * cols);
    const yc = top + (r + 0.5) * rh;
    const l = g.xl(yc) + 18, rr = g.xr(yc) - 18;
    const cw = (rr - l) / cols;
    const off = (cols - inRow) * cw * 0.5;
    const size = Math.min(cw * 1.04, rh * 1.25);
    const jx = (M.rand01(M.hashSeed(seed, 'jx', i)) - 0.5) * cw * 0.1, jy = (M.rand01(M.hashSeed(seed, 'jy', i)) - 0.5) * rh * 0.08;
    out.push({ x: l + off + (c + 0.5) * cw + jx, y: yc + jy, size });
  }
  return out;
}
/** A pile of n copies as a pyramid: [{ x, y, s }] in 0..1 of the cell, bottom row first. */
export function pyramid(n) {
  let k = 1; while ((k * (k + 1)) / 2 < n) k++;
  const s = 0.9 / (1 + (k - 1) * 0.62);
  const out = []; let row = 0, left = n;
  while (left > 0) {
    const w = Math.min(k - row, left);
    for (let i = 0; i < w; i++) out.push({ x: 0.5 + (i - (w - 1) / 2) * s * 0.66, y: 0.92 - s * 0.5 - row * s * 0.5, s });
    left -= w; row += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- drawing
const PAL = {
  wood: { base: '#8a6338', lt: '#b98a54', dk: '#5a3d20', in: '#3a2815', rim: '#a37645', nail: '#2a1c10', line: '#4a3219' },
  steel: { base: '#4f5e6b', lt: '#8497a8', dk: '#2a343e', in: '#1d262e', rim: '#6f8394', nail: '#c3d0da', line: '#1e2830' },
  cold: { base: '#c9dfe6', lt: '#f2fbff', dk: '#7a9eac', in: '#46606c', rim: '#e2f2f7', nail: '#3b4b57', line: '#6f93a1' },
};
function wobble(seed, i, a) { return (M.rand01(M.hashSeed(seed, 'wob', i)) - 0.5) * a; }

function faceSvg(kind, g, seed) {
  const p = PAL[kind], { H, y0, y1, y2 } = g;
  const oF = y1 + 24; // near rim's outer y
  const faceTop = oF, faceH = y2 - oF;
  let face = '';
  if (kind === 'wood') {
    const bands = 3, bh = faceH / bands;
    for (let b = 0; b < bands; b++) {
      const yy = faceTop + b * bh;
      face += `<rect x="24" y="${r1(yy)}" width="752" height="${r1(bh)}" fill="url(#cl-wood)" stroke="${p.line}" stroke-width="3"/>`;
      for (let k = 0; k < 7; k++) { const gy = yy + 8 + k * ((bh - 14) / 6) + wobble(seed, b * 9 + k, 3); face += `<path d="M${40 + wobble(seed, k, 20)} ${r1(gy)}Q${200 + wobble(seed, k + 5, 90)} ${r1(gy + wobble(seed, k + 2, 6))} ${380 + wobble(seed, k + 9, 80)} ${r1(gy)}T${740 - wobble(seed, k + 3, 20)} ${r1(gy + wobble(seed, k + 7, 4))}" stroke="${p.dk}" stroke-width="1.4" fill="none" opacity=".34"/>`; }
      for (const nx of [48, 752]) face += `<circle cx="${nx}" cy="${r1(yy + bh / 2)}" r="4.5" fill="${p.nail}"/><circle cx="${nx - 1}" cy="${r1(yy + bh / 2 - 1)}" r="1.6" fill="#fff" opacity=".35"/>`;
    }
    face += `<rect x="24" y="${faceTop}" width="46" height="${faceH}" fill="${p.dk}" opacity=".5"/><rect x="730" y="${faceTop}" width="46" height="${faceH}" fill="${p.dk}" opacity=".5"/>`;
  } else if (kind === 'steel') {
    face += `<rect x="24" y="${faceTop}" width="752" height="${faceH}" fill="url(#cl-steel)" stroke="${p.line}" stroke-width="3"/>`;
    for (let x = 64; x < 760; x += 36) face += `<path d="M${x} ${faceTop + 6}V${y2 - 6}" stroke="#000" stroke-opacity=".28" stroke-width="5"/><path d="M${x + 4} ${faceTop + 6}V${y2 - 6}" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>`;
    face += `<rect x="24" y="${faceTop}" width="752" height="14" fill="#e6a23c" opacity=".9"/><path d="M24 ${faceTop + 14}H776" stroke="#000" stroke-opacity=".4" stroke-width="2"/>`;
    for (let x = 40; x < 780; x += 60) face += `<circle cx="${x}" cy="${faceTop + 7}" r="2.4" fill="#4a3210"/>`;
    for (const [rx, ry] of [[44, y2 - 14], [756, y2 - 14], [44, faceTop + 30], [756, faceTop + 30]]) face += `<circle cx="${rx}" cy="${ry}" r="5" fill="${p.nail}" stroke="#0007" stroke-width="1.5"/>`;
  } else {
    face += `<rect x="24" y="${faceTop}" width="752" height="${faceH}" rx="18" fill="url(#cl-cold)" stroke="${p.line}" stroke-width="3"/>`;
    face += `<rect x="46" y="${faceTop + 18}" width="708" height="${faceH - 38}" rx="12" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3"/><rect x="46" y="${faceTop + 18}" width="708" height="${faceH - 38}" rx="12" fill="none" stroke="${p.dk}" stroke-opacity=".5" stroke-width="1.5" transform="translate(2 2)"/>`;
    face += `<rect x="24" y="${y2 - 22}" width="752" height="22" rx="8" fill="#3fb5c9" opacity=".75"/>`;
    for (const gx of [130, 670]) face += `<path d="M${gx} ${faceTop + 12}v${faceH - 44}" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>`;
  }
  return face;
}
function shellSvg(kind, g, seed) {
  const p = PAL[kind], { H, y0, y1, y2 } = g;
  const oF = y1 + 24;
  const inner = `${g.xl(y0)},${y0} ${g.xr(y0)},${y0} ${g.xr(y1)},${y1} ${g.xl(y1)},${y1}`;
  const rimTop = `${r1(g.xl(y0) - 50)},${y0 - 40} ${r1(g.xr(y0) + 50)},${y0 - 40} 780,${oF} 20,${oF}`;
  const back = y0 + (y1 - y0) * 0.5;
  return `<svg class="cl-shell" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs>
    <linearGradient id="cl-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.lt}"/><stop offset="1" stop-color="${p.base}"/></linearGradient>
    <linearGradient id="cl-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.lt}"/><stop offset=".25" stop-color="${p.base}"/><stop offset="1" stop-color="${p.dk}"/></linearGradient>
    <linearGradient id="cl-cold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${p.base}"/></linearGradient>
    <linearGradient id="cl-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".78"/><stop offset="1" stop-color="${p.in}"/></linearGradient>
    <linearGradient id="cl-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.dk}"/><stop offset="1" stop-color="${p.in}"/></linearGradient></defs>
    <ellipse cx="400" cy="${y2 + 4}" rx="395" ry="26" fill="#000" opacity=".5"/>
    <polygon points="${rimTop}" fill="${p.rim}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="${rimTop}" fill="url(#cl-wood)" opacity="${kind === 'wood' ? 0.55 : 0}"/>
    <polygon points="${inner}" fill="url(#cl-in)"/>
    <polygon points="${g.xl(y0)},${y0} ${g.xr(y0)},${y0} ${g.xr(back)},${back} ${g.xl(back)},${back}" fill="url(#cl-wall)"/>
    ${[0.25, 0.5, 0.75].map((f) => `<path d="M${r1(g.xl(y0 + (back - y0) * f))} ${r1(y0 + (back - y0) * f)}H${r1(g.xr(y0 + (back - y0) * f))}" stroke="#000" stroke-opacity=".35" stroke-width="2"/>`).join('')}
    <polygon points="${g.xl(y0)},${y0} ${g.xl(y1)},${y1} ${g.xl(y1) + 26},${y1} ${g.xl(y0) + 16},${y0}" fill="#000" opacity=".3"/>
    <polygon points="${g.xr(y0)},${y0} ${g.xr(y1)},${y1} ${g.xr(y1) - 26},${y1} ${g.xr(y0) - 16},${y0}" fill="#000" opacity=".3"/>
    <path d="M${g.xl(y0)} ${y0}L${g.xl(y1)} ${y1}M${g.xr(y0)} ${y0}L${g.xr(y1)} ${y1}" stroke="${p.line}" stroke-width="3" opacity=".8"/>
    ${kind === 'cold' ? `<polygon points="${inner}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5"/>` : ''}
    </svg>`;
}
/** The near wall and rim, drawn over the straw so the pile sits inside. */
function frontSvg(kind, g, seed) {
  const p = PAL[kind], { H, y1, y2 } = g;
  const oF = y1 + 24;
  return `<svg class="cl-front" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs>
    <linearGradient id="cl-fw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.lt}"/><stop offset="1" stop-color="${p.base}"/></linearGradient></defs>
    ${faceSvg(kind, g, seed)}
    <polygon points="${g.xl(y1)},${y1} ${g.xr(y1)},${y1} 780,${oF} 20,${oF}" fill="${p.rim}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${g.xl(y1)} ${y1}H${g.xr(y1)}" stroke="#000" stroke-opacity=".5" stroke-width="4"/>
    <path d="M24 ${oF + 2}H776" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
    </svg>`;
}
function lidSvg(kind, g, seed) {
  const p = PAL[kind], { H, y0, y1 } = g;
  const oF = y1 + 24;
  const top = y0 - 40, lift = 12;
  const quad = `${r1(g.xl(y0) - 50)},${top - lift} ${r1(g.xr(y0) + 50)},${top - lift} 790,${oF - 2} 10,${oF - 2}`;
  let det = '';
  const lerpX = (f, side) => (side === 0 ? (g.xl(y0) - 50) + (10 - (g.xl(y0) - 50)) * f : (g.xr(y0) + 50) + (790 - (g.xr(y0) + 50)) * f);
  const lerpY = (f) => top - lift + (oF - 2 - (top - lift)) * f;
  if (kind === 'wood') {
    for (let k = 1; k < 5; k++) { const f = k / 5; det += `<path d="M${r1(lerpX(f, 0))} ${r1(lerpY(f))}L${r1(lerpX(f, 1))} ${r1(lerpY(f))}" stroke="${p.line}" stroke-width="4"/><path d="M${r1(lerpX(f, 0))} ${r1(lerpY(f) + 3)}L${r1(lerpX(f, 1))} ${r1(lerpY(f) + 3)}" stroke="#fff" stroke-opacity=".16" stroke-width="2"/>`; }
    for (let k = 0; k < 14; k++) { const f = (k % 5) / 5 + 0.08 + wobble(seed, k, 0.05); const gy = lerpY(f); det += `<path d="M${r1(lerpX(f, 0) + 60 + wobble(seed, k, 60))} ${r1(gy + 4)}h${r1(150 + wobble(seed, k + 4, 120))}" stroke="${p.dk}" stroke-width="1.5" opacity=".35"/>`; }
    for (const f of [0.1, 0.9]) det += `<path d="M${r1(lerpX(0.02, 0) + 20)} ${r1(lerpY(f))}H${r1(lerpX(0.02, 1) - 20)}" stroke="none"/>`;
  } else if (kind === 'steel') {
    for (let k = 1; k < 7; k++) { const f = k / 7; det += `<path d="M${r1(lerpX(f, 0) + 14)} ${r1(lerpY(f))}L${r1(lerpX(f, 1) - 14)} ${r1(lerpY(f))}" stroke="#000" stroke-opacity=".32" stroke-width="6"/><path d="M${r1(lerpX(f, 0) + 14)} ${r1(lerpY(f) + 4)}L${r1(lerpX(f, 1) - 14)} ${r1(lerpY(f) + 4)}" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>`; }
    det += `<rect x="${r1(lerpX(0.5, 0) + 20)}" y="${r1(lerpY(0.12))}" width="${r1(lerpX(0.5, 1) - lerpX(0.5, 0) - 40)}" height="16" fill="#e6a23c" opacity=".85" transform="skewY(0)"/>`;
    for (const [fx, fy] of [[0.08, 0.1], [0.92, 0.1], [0.04, 0.9], [0.96, 0.9]]) det += `<circle cx="${r1(lerpX(fy, 0) + (lerpX(fy, 1) - lerpX(fy, 0)) * fx)}" cy="${r1(lerpY(fy))}" r="5" fill="${p.nail}" stroke="#0007" stroke-width="1.5"/>`;
  } else {
    det += `<polygon points="${r1(lerpX(0.1, 0) + 24)},${r1(lerpY(0.1))} ${r1(lerpX(0.1, 1) - 24)},${r1(lerpY(0.1))} ${r1(lerpX(0.9, 1) - 24)},${r1(lerpY(0.9))} ${r1(lerpX(0.9, 0) + 24)},${r1(lerpY(0.9))}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="4" stroke-linejoin="round"/><polygon points="${r1(lerpX(0.1, 0) + 24)},${r1(lerpY(0.1))} ${r1(lerpX(0.1, 1) - 24)},${r1(lerpY(0.1))} ${r1(lerpX(0.9, 1) - 24)},${r1(lerpY(0.9))} ${r1(lerpX(0.9, 0) + 24)},${r1(lerpY(0.9))}" fill="none" stroke="${p.dk}" stroke-opacity=".45" stroke-width="2" transform="translate(3 3)"/>`;
    det += `<path d="M${r1(lerpX(0.45, 0) + 50)} ${r1(lerpY(0.45))}H${r1(lerpX(0.45, 1) - 50)}" stroke="#7fd4e2" stroke-width="3" opacity=".5"/>`;
  }
  const fill = kind === 'wood' ? 'url(#cl-lw)' : kind === 'steel' ? 'url(#cl-ls)' : 'url(#cl-lc)';
  return `<svg class="cl-lid-art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs>
    <linearGradient id="cl-lw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lt}"/></linearGradient>
    <linearGradient id="cl-ls" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.dk}"/><stop offset="1" stop-color="${p.lt}"/></linearGradient>
    <linearGradient id="cl-lc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.base}"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>
    <polygon points="${quad}" fill="#000" opacity=".4" transform="translate(0 16)"/>
    <polygon points="${quad}" fill="${fill}" stroke="${p.line}" stroke-width="4" stroke-linejoin="round"/>${det}
    <polygon points="${quad}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2" stroke-linejoin="round" transform="translate(0 4)"/></svg>`;
}

function strawUrl(seed, g) {
  const lines = [];
  for (let i = 0; i < 230; i++) {
    const x = M.rand01(M.hashSeed(seed, 'sx', i)) * W, y = g.y0 + M.rand01(M.hashSeed(seed, 'sy', i)) * (g.y1 - g.y0 + 30);
    const a = (M.rand01(M.hashSeed(seed, 'sa', i)) - 0.5) * 2.4, l = 22 + M.rand01(M.hashSeed(seed, 'sl', i)) * 40;
    const c = ['#e0b95a', '#c99a3e', '#f0d27a', '#a87a2a', '#d8a948'][i % 5];
    lines.push(`<path d="M${r1(x)} ${r1(y)}l${r1(Math.cos(a) * l)} ${r1(Math.sin(a) * l * 0.35)}" stroke="${c}" stroke-width="${i % 7 === 0 ? 3 : 2}" stroke-linecap="round" opacity=".82"/>`);
  }
  const svg = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${W} ${g.H}" preserveAspectRatio="none"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b4220"/><stop offset=".5" stop-color="#9a7430"/><stop offset="1" stop-color="#b78a37"/></linearGradient></defs><rect width="${W}" height="${g.H}" fill="url(#b)"/>${lines.join('')}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const DRESS = {
  cobweb: (d) => `<svg viewBox="0 0 100 100"><g fill="none" stroke="#e8eef2" stroke-opacity=".75" stroke-width="1.2"><path d="M0 0L100 100M0 0L100 50M0 0L50 100M0 0L100 12M0 0L12 100"/><path d="M0 28Q22 22 28 0M0 52Q38 44 52 0M0 76Q52 66 76 0M0 98Q66 86 98 0"/></g></svg>`,
  bolt: () => `<svg viewBox="0 0 60 60"><ellipse cx="32" cy="48" rx="20" ry="5" fill="#000" opacity=".4"/><polygon points="14,20 24,12 38,12 46,22 38,32 24,32" fill="#9aa8b4" stroke="#2a343e" stroke-width="2"/><ellipse cx="30" cy="22" rx="6" ry="5" fill="#3b4752"/><rect x="40" y="26" width="16" height="8" rx="2" fill="#8392a0" stroke="#2a343e" stroke-width="2" transform="rotate(24 48 30)"/></svg>`,
  bootprint: () => `<svg viewBox="0 0 60 100"><g fill="#2a1d0e" opacity=".5"><path d="M16 4Q8 14 12 40Q14 52 20 56Q30 60 38 54Q44 46 42 30Q42 10 34 4Q26 0 16 4Z"/><path d="M14 66Q10 80 16 92Q24 100 34 96Q42 88 40 70Q36 64 26 62Q18 62 14 66Z"/></g><g stroke="#e9c872" stroke-opacity=".55" stroke-width="2.4"><path d="M16 14H36M14 24H40M14 34H40M16 44H38M18 74H36M17 84H35"/></g></svg>`,
  strawclump: () => `<svg viewBox="0 0 100 60"><g stroke="#d9ad4e" stroke-width="3" stroke-linecap="round" fill="none"><path d="M10 50Q30 10 60 12"/><path d="M20 52Q40 20 80 28"/><path d="M30 54Q50 30 90 44"/><path d="M8 40Q24 22 40 20"/></g></svg>`,
};

// ---------------------------------------------------------------------------------------------------------------- mount
/** mount(stage, state, { ctx, base, onLeave }) -> { destroy() } */
export function mount(stage, state, env) {
  const { ctx = {}, base } = env;
  const reduced = () => Boolean(ctx.reducedMotion?.());
  const sound = (id) => { if (!id) return; try { ctx.sound?.(id); } catch { /* a sound must never break the crate */ } };
  const timers = new Set();
  let dead = false;
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, reduced() ? Math.min(ms, 30) : ms); timers.add(t); return t; };
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };

  const iconOf = (it) => {
    const src = it.icon ? withBase(base, it.icon) : null;
    if (!src) return glyph({ id: it.id, name: it.name, kind: it.glyph || it.kind });
    const img = h('img', { class: 'cl-icon', src, alt: '', draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(glyph({ id: it.id, name: it.name, kind: it.glyph || it.kind })), { once: true });
    return img;
  };

  stage.replaceChildren();
  const root = h('div', { class: `m-crate-look cl-k-${state.kind}${state.quick ? ' is-quick' : ''}`, 'data-lid': state.lid });
  stage.append(root);

  const sign = h('h1', { class: 'cl-sign' });
  const ownerLine = h('div', { class: 'cl-owner' });
  const fillWord = h('span', { class: 'cl-fillword' });
  const pips = h('span', { class: 'cl-pips', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, () => h('i')));
  const head = h('header', { class: 'cl-head' }, h('div', { class: 'cl-titles' }, sign, ownerLine), h('div', { class: 'cl-fill' }, pips, fillWord));
  const crate = h('div', { class: 'cl-crate' });
  const shellHost = h('div', { class: 'cl-layer cl-shell-host' });
  const straw = h('div', { class: 'cl-straw' });
  const strawDents = h('div', { class: 'cl-dents' });
  const dressLayer = h('div', { class: 'cl-layer cl-dress' });
  const stacksLayer = h('div', { class: 'cl-layer cl-stacks' });
  const frontHost = h('div', { class: 'cl-layer cl-front-host' });
  const frontText = h('div', { class: 'cl-layer cl-front-text' });
  const chalkEl = h('div', { class: 'cl-chalk', 'aria-hidden': 'true' });
  const latches = [0.2, 0.5, 0.8].map((x, i) => h('span', { class: 'cl-latch', style: { '--x': `${x * 100}%`, '--d': `${i * 130}ms` }, 'aria-hidden': 'true' }, h('i', { class: 'cl-hasp' }), h('i', { class: 'cl-clasp' })));
  const latchRow = h('div', { class: 'cl-layer cl-latches' }, ...latches);
  const fog = h('div', { class: 'cl-layer cl-fog', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, (_, i) => h('i', { style: { '--i': i } })));
  const dust = h('div', { class: 'cl-layer cl-dust', 'aria-hidden': 'true' });
  const lidText = h('div', { class: 'cl-lid-text', 'aria-hidden': 'true' });
  const sealBand = h('div', { class: 'cl-seal', 'aria-hidden': 'true' }, h('i'), h('i'), h('b', { text: 'SEALED' }));
  const lidArt = h('div', { class: 'cl-lid-art-host' });
  const lid = h('button', { class: 'cl-lid', type: 'button', 'aria-label': 'Lift the lid' }, lidArt, lidText, sealBand);
  crate.append(shellHost, straw, h('div', { class: 'cl-layer cl-dent-host' }, strawDents), dressLayer, stacksLayer, fog, frontHost, frontText, chalkEl, lid, latchRow, dust);

  const slipEl = h('aside', { class: 'cl-slip-wrap', 'aria-label': 'Packing slip' });
  const main = h('div', { class: 'cl-main' }, h('div', { class: 'cl-box' }, crate), slipEl);
  const say = h('div', { class: 'cl-say', role: 'status', 'aria-live': 'polite' });
  const trayName = h('span', { class: 'cl-tray-title', text: 'Your bag' });
  const trayState = h('span', { class: 'cl-tray-state' });
  const trayPips = h('span', { class: 'cl-bagpips', 'aria-hidden': 'true' });
  const trayItems = h('div', { class: 'cl-tray-items' });
  const tray = h('section', { class: 'cl-tray', 'aria-label': 'Your bag' }, h('div', { class: 'cl-tray-head' }, trayName, trayPips, trayState), trayItems);
  const btnChalk = h('button', { class: 'cl-btn cl-chalkbtn', type: 'button' }, h('span', { class: 'cl-btn-ic', 'aria-hidden': 'true', text: '✎' }), h('span', { class: 'cl-btn-t', text: 'Chalk it' }), h('span', { class: 'cl-chalk-state' }));
  const btnLid = h('button', { class: 'cl-btn cl-lidbtn', type: 'button' }, h('span', { class: 'cl-btn-ic', 'aria-hidden': 'true', text: '▭' }), h('span', { class: 'cl-btn-t', text: 'Shut lid' }));
  const btnBack = h('button', { class: 'cl-btn cl-backbtn', type: 'button' }, h('span', { class: 'cl-btn-t', text: 'Step back' }));
  const actions = h('div', { class: 'cl-actions' }, btnChalk, btnLid, btnBack);
  const bottom = h('footer', { class: 'cl-bottom' }, tray, actions);
  root.append(h('div', { class: 'cl-floor', 'aria-hidden': 'true' }), head, main, say, bottom);

  // ---- state the view keeps (the model has none of this) ----
  let g = geometry(false);
  let tall = false;
  let lidMode = state.lid === 'open' ? 'off' : 'on'; // on, off, moving
  let busy = false;
  const dents = []; // {x, y} in box units
  const seen = new Set(); // stack keys already drawn (to pop new ones)
  let lastTag = state.tag;

  // ---- sizing: the crate fits the box; tall on a phone so the piles stay big enough to tap ----
  const box = main.querySelector('.cl-box');
  const fit = () => {
    const bw = box.clientWidth, bh = box.clientHeight;
    const wantTall = stage.clientWidth < 600 && stage.clientHeight > stage.clientWidth * 1.05;
    // on a phone the crate grows taller to fill the room it is given, so the piles stay big enough to tap
    const wantH = wantTall && bw > 0 && bh > 0 ? Math.max(700, Math.min(1000, Math.round((bh / bw) * W))) : g.H;
    if (wantTall !== tall || (wantTall && Math.abs(wantH - g.H) > 6)) { tall = wantTall; g = geometry(tall, wantH); buildShell(); render(); }
    const wpx = Math.max(0, Math.min(bw, bh * (W / g.H)));
    crate.style.width = `${wpx}px`; crate.style.height = `${wpx * (g.H / W)}px`;
    root.style.setProperty('--u', `${wpx / W}px`);
  };
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => fit()); ro.observe(box); ro.observe(stage); }
  on(window, 'resize', fit);

  function buildShell() {
    const seed = state.seed;
    shellHost.innerHTML = shellSvg(state.kind, g, seed);
    frontHost.innerHTML = frontSvg(state.kind, g, seed);
    lidArt.innerHTML = lidSvg(state.kind, g, seed);
    straw.style.backgroundImage = strawUrl(seed, g);
    crate.style.setProperty('--H', g.H);
    const oF = g.y1 + 24;
    const pc = (y) => `${(y / g.H) * 100}%`;
    frontText.style.cssText = `top:${pc(oF)};height:${pc(g.y2 - oF)}`;
    latchRow.style.top = pc(oF - 4); latchRow.style.height = pc(54);
    chalkEl.style.cssText = `top:${pc(oF + 14)};height:${pc(g.y2 - oF - 28)}`;
    lidText.style.cssText = `top:${pc(g.y0 + (g.y1 - g.y0) * 0.35)}`;
    sealBand.style.cssText = `top:${pc(g.y0 - 30)};height:${pc(g.y1 - g.y0 + 70)}`;
    fog.style.cssText = `top:${pc(g.y0 - 30)};height:${pc(g.y1 - g.y0 + 30)}`;
    dust.style.cssText = `top:${pc(g.y0 - 40)};height:${pc(g.y1 - g.y0 + 70)}`;
    stacksLayer.style.cssText = `top:0;height:100%`;
  }

  // ---- the straw's level against the crate walls ----
  function setStraw(v) {
    const back = g.y1 - (g.y1 - g.y0) * (0.34 + 0.52 * v.fill.ratio);
    const pt = (x, y) => `${r1((x / W) * 100)}% ${r1((y / g.H) * 100)}%`;
    straw.style.clipPath = `polygon(${pt(g.xl(back), back)}, ${pt(g.xr(back), back)}, ${pt(g.xr(g.y1) + 2, g.y1 + 6)}, ${pt(g.xl(g.y1) - 2, g.y1 + 6)})`;
  }

  // ---- the stacks ----
  const withHold = (btn, key) => {
    let timer = null, held = false;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } btn.classList.remove('is-holding'); };
    btn.addEventListener('pointerdown', (e) => {
      if (busy || e.button > 0) return;
      held = false; btn.classList.add('is-holding');
      timer = setTimeout(() => { timer = null; held = true; btn.classList.remove('is-holding'); act(() => M.takeAll(state, key), btn); }, reduced() ? 250 : 520);
    });
    const up = () => { const was = timer !== null; clear(); if (was && !held && !busy) act(() => M.take(state, key, 1), btn); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', clear);
    btn.addEventListener('pointerleave', clear);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) act(() => (e.shiftKey ? M.takeAll(state, key) : M.take(state, key, 1)), btn); } });
  };

  function stackEl(s, box0) {
    const cell = h('button', { class: `cl-stack${s.status === 'glint' ? ' is-glint' : ''}${s.status === 'found' ? ' is-found' : ''}${s.heaped ? ' is-heaped' : ''}`, type: 'button', 'data-k': s.key, 'data-item': s.id, 'data-qty': s.qty, 'aria-label': `${s.name}: take one. Hold to take all.`,
      style: { left: `${(box0.x / W) * 100}%`, top: `${(box0.y / g.H) * 100}%`, width: `${(box0.size / W) * 100}%`, height: `${(box0.size / g.H) * 100}%` } });
    const pile = h('span', { class: 'cl-pile' });
    pyramid(s.shown).forEach((c, i) => {
      const ic = h('span', { class: 'cl-copy', style: { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.s * 100}%`, height: `${c.s * 100}%`, '--i': i, '--rot': `${r1((M.rand01(M.hashSeed(state.seed, s.key, i)) - 0.5) * 14)}deg` } }, iconOf(s));
      pile.append(ic);
    });
    cell.append(pile, h('span', { class: 'cl-ring', 'aria-hidden': 'true' }));
    if (s.status === 'glint') cell.append(h('span', { class: 'cl-glint', 'aria-hidden': 'true' }));
    if (s.notOnSlip) cell.append(h('span', { class: 'cl-notslip', text: 'not on the slip' }));
    withHold(cell, s.key);
    return cell;
  }

  // ---- the slip ----
  let slipOpen = false;
  function renderSlip(v) {
    slipEl.replaceChildren();
    if (v.sealed) {
      slipEl.append(h('div', { class: 'cl-notice' }, h('div', { class: 'cl-notice-h', text: 'Sealed' }), h('p', { text: v.reason })));
      slipEl.hidden = false; return;
    }
    if (!v.slip && !v.origin) { slipEl.hidden = true; return; }
    slipEl.hidden = false;
    if (!v.slip) { // no slip, but a trace or an origin: a shipping tag on a string
      slipEl.append(h('div', { class: 'cl-tagcard' }, h('i', { class: 'cl-string' }), h('div', { class: 'cl-tagcard-h', text: v.origin.from === 'trace' ? 'You notice' : 'From' }), h('p', { text: v.origin.text })));
      return;
    }
    const lines = v.slip.map((l) => h('li', { class: `cl-sl${l.mark ? ` is-${l.mark}` : ''}${l.smudged ? ' is-smudged' : ''}` },
      h('span', { class: 'cl-sl-name', text: l.name }), h('span', { class: 'cl-sl-dots', 'aria-hidden': 'true' }),
      h('span', { class: 'cl-sl-qty', text: l.smudged ? '' : String(l.qty) }),
      l.smudged ? h('span', { class: 'cl-blot', text: 'smudged' }) : null,
      l.mark ? h('span', { class: 'cl-pencil' }, h('b', { text: l.mark === 'missing' ? 'none here' : l.mark === 'more' ? `found ${l.found}` : `found ${l.found}` })) : null));
    const paper = h('button', { class: `cl-slip${slipOpen ? ' is-open' : ''}`, type: 'button', 'aria-expanded': String(slipOpen), 'aria-label': 'Packing slip: tap to read or fold' },
      h('i', { class: 'cl-clip', 'aria-hidden': 'true' }), h('div', { class: 'cl-slip-h', text: 'Packing slip' }), h('ul', {}, ...lines),
      v.origin ? h('div', { class: `cl-origin is-${v.origin.from}`, text: (v.origin.from === 'trace' ? 'You notice: ' : 'From: ') + v.origin.text }) : null);
    paper.addEventListener('click', () => { slipOpen = !slipOpen; sound('slip'); paper.classList.toggle('is-open', slipOpen); paper.setAttribute('aria-expanded', String(slipOpen)); });
    slipEl.append(paper);
  }

  // ---- the chalk mark on the front ----
  function renderChalk(tag) {
    chalkEl.replaceChildren();
    chalkEl.dataset.tag = tag;
    if (tag === 'none') return;
    const word = { keep: 'KEEP', sell: 'SELL', scrap: 'SCRAP' }[tag];
    const shape = { keep: '<path d="M18 52Q10 14 70 8Q150 4 160 40Q164 66 96 70Q40 74 20 54" />', sell: '<path d="M10 66Q50 58 90 66T170 62" /><path d="M14 74Q56 68 94 74T168 70" />', scrap: '<path d="M14 10L168 70M170 10L12 72" />' }[tag];
    chalkEl.innerHTML = `<svg viewBox="0 0 180 80" aria-hidden="true"><defs><filter id="cl-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${state.seed % 97}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter></defs><g filter="url(#cl-rough)" fill="none" stroke="#f4f1e6" stroke-width="3.6" stroke-linecap="round" opacity=".92">${shape.replace('<path', '<path pathLength="1"')}<text x="90" y="46" text-anchor="middle" font-size="26" font-weight="800" fill="#f4f1e6" stroke="none" font-family="Marker Felt,Segoe Print,Comic Sans MS,cursive" letter-spacing="2">${word}</text></g></svg>`;
  }

  // ---- the bag tray ----
  function renderTray(v) {
    trayItems.replaceChildren();
    const room = v.bagRoom;
    trayState.textContent = v.bagFull ? 'full' : room === null ? '' : room <= 2 ? `room for ${M.numWord(room)} more` : 'room to spare';
    trayPips.replaceChildren();
    if (v.bagCap) { const used = v.bagCap - v.bagRoom; const n = Math.min(v.bagCap, 16); for (let i = 0; i < n; i++) trayPips.append(h('i', { class: i < Math.round((used / v.bagCap) * n) ? 'on' : '' })); }
    tray.classList.toggle('is-full', v.bagFull);
    if (!v.bag.length) { trayItems.append(h('span', { class: 'cl-tray-empty', text: 'Nothing in your bag.' })); return; }
    for (const b of v.bag) {
      const can = v.canPut;
      const btn = h('button', { class: 'cl-tray-item', type: 'button', 'data-item': b.id, 'aria-label': can ? `Put ${b.name} in the crate` : b.name, disabled: !can && false },
        h('span', { class: 'cl-tray-ic' }, iconOf(b)), h('span', { class: 'cl-tray-name', text: b.name }), h('span', { class: 'cl-more', 'aria-hidden': 'true' }, ...Array.from({ length: Math.min(b.qty, 5) }, () => h('i'))));
      btn.addEventListener('click', () => { if (!busy && can) act(() => M.putIn(state, b.id), btn); else if (!can) { say.classList.remove('is-new'); } });
      btn.classList.toggle('is-view', !can);
      trayItems.append(btn);
    }
  }

  // ---- render everything from the model ----
  function render() {
    const v = M.view(state);
    const was = root.contains(document.activeElement) ? document.activeElement : null; // keep keyboard focus through a redraw
    const wasK = was?.dataset?.k, wasItem = was?.classList?.contains('cl-tray-item') ? was.dataset.item : null;
    root.dataset.lid = v.lid; root.classList.toggle('is-empty', v.empty); root.classList.toggle('is-sealed', v.sealed);
    sign.textContent = v.label; ownerLine.textContent = v.owner; ownerLine.hidden = !v.owner;
    fillWord.textContent = v.sealed ? 'sealed' : v.lid === 'open' ? v.fill.word : 'shut';
    const lit = v.lid === 'open' ? Math.ceil(v.fill.ratio * 5 - 0.001) : 0;
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < lit));
    setStraw(v);
    // stacks
    const boxes = slotBoxes(g, v.slotCount, state.seed);
    stacksLayer.replaceChildren(...v.stacks.map((s) => { const el = stackEl(s, boxes[Math.max(0, s.slot)] || boxes[0]); if (!seen.has(s.key)) { if (seen.size || v.opened) el.classList.add('is-new'); seen.add(s.key); } return el; }));
    strawDents.replaceChildren(...dents.map((d) => h('i', { style: { left: `${(d.x / W) * 100}%`, top: `${(d.y / g.H) * 100}%`, '--s': d.s } })));
    dressLayer.replaceChildren();
    if (v.empty && v.lid === 'open') {
      const bx = { x0: g.xl(g.y1) + 60, x1: g.xr(g.y1) - 60, top: g.y0 + (g.y1 - g.y0) * 0.4, bot: g.y1 - 40 };
      for (const d of v.dress) {
        const cob = d.kind === 'cobweb';
        const sz = cob ? 130 : d.kind === 'bootprint' ? 60 : d.kind === 'bolt' ? 52 : 90;
        const x = cob ? (d.corner % 2 ? g.xr(g.y0 + 40) - sz : g.xl(g.y0 + 40)) : bx.x0 + (bx.x1 - bx.x0) * d.x;
        const y = cob ? g.y0 + 24 : bx.top + (bx.bot - bx.top) * d.y;
        const el = h('span', { class: `cl-dr cl-dr-${d.kind}`, style: { left: `${(x / W) * 100}%`, top: `${(y / g.H) * 100}%`, width: `${(sz / W) * 100}%`, '--r': cob ? (d.corner % 2 ? '90deg' : '0deg') : `${d.rot}deg` } });
        el.innerHTML = DRESS[d.kind](d); dressLayer.append(el);
      }
    }
    // lid + cold fog
    lid.disabled = false;
    lid.setAttribute('aria-label', v.sealed ? 'Sealed' : 'Lift the lid');
    lid.hidden = false;
    if (lidMode === 'off') lid.classList.add('is-off'); else lid.classList.remove('is-off');
    lidText.textContent = v.label;
    frontText.innerHTML = '';
    frontText.append(h('div', { class: 'cl-stencil', text: v.label }));
    latches.forEach((l) => l.classList.toggle('is-open', v.lid === 'open' || v.quick));
    root.classList.toggle('has-fog', v.kind === 'cold' && v.lid === 'open');
    if (v.tag !== lastTag || !chalkEl.childElementCount) { renderChalk(v.tag); lastTag = v.tag; }
    renderSlip(v); renderTray(v);
    // actions
    btnChalk.hidden = !v.canChalk; btnChalk.querySelector('.cl-chalk-state').textContent = v.tag === 'none' ? '' : v.tag;
    btnLid.hidden = v.sealed || v.quick; btnLid.querySelector('.cl-btn-t').textContent = v.lid === 'open' ? 'Shut lid' : 'Lift lid';
    btnBack.hidden = !v.sealed;
    actions.hidden = btnChalk.hidden && btnLid.hidden && btnBack.hidden;
    tray.classList.toggle('is-read', !v.canPut);
    say.textContent = v.say || '';
    say.classList.toggle('is-empty', !v.say);
    if (wasK !== undefined || wasItem) {
      const back = (wasK !== undefined && stacksLayer.querySelector(`[data-k="${CSS.escape(wasK)}"]`)) || (wasItem && trayItems.querySelector(`[data-item="${CSS.escape(wasItem)}"]`)) || stacksLayer.querySelector('.cl-stack');
      back?.focus?.({ preventScroll: true });
    }
  }

  // ---- doing things: ask the model, then animate and sound what it says happened ----
  function act(fn, srcEl) {
    if (dead) return;
    const before = new Map([...stacksLayer.querySelectorAll('.cl-stack')].map((e) => [e.dataset.k, e.getBoundingClientRect()]));
    const events = fn() || [];
    for (const e of events) {
      if (e.sound) sound(e.sound);
      if (e.straw) { sound('straw'); crate.classList.remove('is-shift'); void crate.offsetWidth; crate.classList.add('is-shift'); }
      if (e.type === 'take') { const r = before.get(e.key); if (r) { const b = boxFor(e.key); dents.push({ x: b?.x ?? 400, y: (b?.y ?? 300) + (b?.size ?? 60) * 0.18, s: 0.9 }); if (dents.length > 7) dents.shift(); } flyTo(srcEl, e); }
      if (e.type === 'put') flyFrom(e);
      if (e.type === 'bagfull') shake(tray);
      if (e.type === 'cratefull') shake(crate);
      if (e.type === 'found') { later(() => sound('dig'), 120); }
      if (e.type === 'chalk') chalkEl.classList.add('is-draw');
      if (e.type === 'sealed') { shake(lid); }
    }
    render();
    if (events.some((e) => e.type === 'chalk')) { chalkEl.classList.remove('is-draw'); void chalkEl.offsetWidth; chalkEl.classList.add('is-draw'); }
  }
  const boxFor = (key) => { const v = M.view(state); const s = v.stacks.find((x) => x.key === key); const boxes = slotBoxes(g, v.slotCount, state.seed); return s ? boxes[Math.max(0, s.slot)] : null; };
  function shake(el) { el.classList.remove('is-shake'); void el.offsetWidth; el.classList.add('is-shake'); later(() => el.classList.remove('is-shake'), 500); }
  function flyTo(srcEl, e) {
    if (reduced() || !srcEl?.getBoundingClientRect) return;
    const from = srcEl.getBoundingClientRect(); const dest = (trayItems.querySelector(`[data-item="${CSS.escape(e.item)}"] .cl-tray-ic`) || trayItems).getBoundingClientRect();
    const fly = srcEl.querySelector('.cl-copy')?.cloneNode(true); if (!fly) return;
    fly.className = 'cl-fly'; fly.style.cssText = `left:${from.left + from.width / 2 - 24}px;top:${from.top + from.height / 2 - 24}px`;
    root.append(fly);
    const a = fly.animate([{ transform: 'translate(0,0) scale(1.1)', opacity: 1 }, { transform: `translate(${dest.left + dest.width / 2 - (from.left + from.width / 2)}px, ${dest.top + dest.height / 2 - (from.top + from.height / 2)}px) scale(.55)`, opacity: 0.9 }], { duration: 460, easing: 'cubic-bezier(.3,.7,.3,1)' });
    a.onfinish = () => { fly.remove(); const t = trayItems.querySelector(`[data-item="${CSS.escape(e.item)}"]`); if (t) { t.classList.remove('is-got'); void t.offsetWidth; t.classList.add('is-got'); } };
  }
  function flyFrom(e) {
    if (reduced()) return;
    const el = stacksLayer.querySelector(`[data-k="${CSS.escape(e.key)}"]`); if (el) { el.classList.remove('is-new'); void el.offsetWidth; el.classList.add('is-new'); }
  }

  // ---- the lid: latches flip one by one, then it lifts with weight and a puff of dust ----
  function openSequence() {
    if (busy || lidMode !== 'on') return;
    const events = M.openLid(state);
    if (events[0]?.type === 'sealed') { sound('rattle'); shake(lid); render(); return; }
    busy = true; root.classList.add('is-lifting');
    latches.forEach((l, i) => later(() => { l.classList.add('is-open'); sound('latch'); }, i * 130 + 40));
    later(() => {
      sound('creak'); lid.classList.add('is-lifting'); lid.style.removeProperty('--drag');
      later(() => { puff(); sound('thud'); lid.classList.remove('is-lifting'); lid.classList.add('is-off'); lidMode = 'off'; busy = false; root.classList.remove('is-lifting'); render(); events.filter((e) => e.type === 'found').forEach(() => later(() => sound('dig'), 150)); }, 760);
    }, 3 * 130 + 130);
    render(); // the say line, the empty crate and the straw are set now; the lid hides them until it lifts
    lid.classList.remove('is-off');
  }
  function closeSequence() {
    if (busy || lidMode !== 'off' || state.quick || state.sealed) return;
    busy = true; M.shutLid(state);
    lid.classList.remove('is-off'); lid.classList.add('is-landing');
    later(() => { puff(true); sound('thud'); lid.classList.remove('is-landing'); lidMode = 'on'; latches.forEach((l, i) => later(() => { l.classList.remove('is-open'); sound('latch'); render(); }, i * 110 + 60)); later(() => { busy = false; render(); }, 3 * 110 + 160); render(); }, 520);
  }
  function puff(small) {
    if (reduced()) return;
    dust.replaceChildren(...Array.from({ length: small ? 5 : 9 }, (_, i) => h('i', { style: { '--a': `${(i / (small ? 5 : 9)) * 360}deg`, '--dl': `${i * 18}ms`, '--x': `${14 + M.rand01(M.hashSeed(state.seed, 'puff', i)) * 72}%` } })));
    later(() => dust.replaceChildren(), 1100);
  }
  latches.forEach((l) => on(l, 'click', () => openSequence()));
  // drag it up, or tap it
  let drag = null;
  on(lid, 'pointerdown', (e) => { if (busy || lidMode !== 'on' || e.button > 0) return; drag = { y: e.clientY, x: e.clientX, dy: 0, moved: false, id: e.pointerId }; try { lid.setPointerCapture(e.pointerId); } catch { /* fine */ } });
  on(lid, 'pointermove', (e) => { if (!drag) return; drag.dy = e.clientY - drag.y; if (Math.abs(drag.dy) > 6) drag.moved = true; if (drag.moved) lid.style.setProperty('--drag', `${Math.max(-140, Math.min(0, drag.dy))}px`); });
  const endDrag = (e) => {
    if (!drag) return; const d = drag; drag = null; try { lid.releasePointerCapture(d.id); } catch { /* fine */ }
    if (!d.moved || d.dy < -46) openSequence(); else { lid.style.removeProperty('--drag'); }
    if (e?.type === 'pointercancel') lid.style.removeProperty('--drag');
  };
  on(lid, 'pointerup', endDrag); on(lid, 'pointercancel', endDrag);
  on(lid, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSequence(); } });
  on(btnLid, 'click', () => (state.lid === 'open' ? closeSequence() : openSequence()));
  on(btnChalk, 'click', () => { if (!busy) act(() => M.chalk(state), btnChalk); });
  on(btnBack, 'click', () => env.onLeave?.());
  on(window, 'keydown', (e) => { if (e.key === 'Escape') env.onLeave?.(); });

  // ---- first draw ----
  buildShell(); fit(); render();
  if (state.lid === 'open') { lid.classList.add('is-off'); lidMode = 'off'; latches.forEach((l) => l.classList.add('is-open')); }
  render();
  return {
    destroy() {
      dead = true; for (const t of timers) clearTimeout(t); timers.clear();
      for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
      ro?.disconnect(); root.remove();
    },
  };
}

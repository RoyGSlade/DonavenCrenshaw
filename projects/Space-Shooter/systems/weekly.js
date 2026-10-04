// The weekly track's release window, launch links and layout picture. Pure:
// no DOM and no clock of its own (callers pass `now`), so the hangar, the
// website build, the weekly page and node tests share it.
import { WEEKLY_EVENTS, currentWeekly, weeklyById } from '../tracks/weekly.js';
import { releaseCountdown, releaseText } from './customTrack.js';
import { createWeeklyLayout } from '../engine/weekly/layout.js';

export { WEEKLY_EVENTS, currentWeekly, weeklyById };

/**
 * Where an event stands at `now`:
 *   upcoming  before opensAt: countdown to the opening, layout visible, no flying
 *   live      opensAt ≤ now < closesAt: flyable, countdown to the close
 *   closed    after closesAt: results only
 */
export function weeklyStatus(event, now = Date.now()) {
  if (event?.enabled === false) return { state: 'pending', countdown: null, opensText: releaseText(event?.opensAt), closesText: releaseText(event?.closesAt) };
  const open = releaseCountdown(event?.opensAt, now);
  const close = releaseCountdown(event?.closesAt, now);
  const opensText = releaseText(event?.opensAt);
  const closesText = releaseText(event?.closesAt);
  if (!open.valid || !close.valid) return { state: 'invalid', countdown: null, opensText, closesText };
  if (!open.released) return { state: 'upcoming', countdown: open, opensText, closesText };
  if (!close.released) return { state: 'live', countdown: close, opensText, closesText };
  return { state: 'closed', countdown: null, opensText, closesText };
}

/** ?weekly=<id> on a game URL; null when absent or unknown. preview=weekly flies it early, unsaved. */
export function parseWeeklyQuery(search) {
  let params;
  try { params = new URLSearchParams(search || ''); } catch { params = new URLSearchParams(); }
  const id = params.get('weekly');
  const preview = params.get('preview') === 'weekly';
  // ?track=custom links from before the weekly took over the custom slot.
  const legacy = params.get('track') === 'custom';
  const event = id ? weeklyById(id) : preview || legacy ? currentWeekly() : null;
  return { event, preview, focus: !!event };
}

/** ?vs=<username> on a game or weekly-page URL: the pilot whose ghost to race. Usernames are 3-20 of A-Z a-z 0-9 _ -; anything else is ignored. */
export function parseVsQuery(search) {
  let value = '';
  try { value = (new URLSearchParams(search || '').get('vs') || '').trim(); } catch { value = ''; }
  return /^[A-Za-z0-9_-]{3,20}$/.test(value) ? value : null;
}

/** The game link for an event, relative to the site root. With `vs`, it also races that pilot's ghost. */
export function weeklyGameUrl(event, vs = null) {
  return `games/stardust/?weekly=${encodeURIComponent(event.id)}${vs ? `&vs=${encodeURIComponent(vs)}` : ''}`;
}

const f = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * The layout as a standalone SVG: the lane, its rails, every checkpoint as a
 * full-width line, the start/finish line, the race direction and the shards
 * (numbered in lap order) and fuel docks. With obstacles:true it also marks
 * mines, bouncing-rock lanes and sentries (the public preview leaves them out).
 */
export function weeklyPreviewSvg(event, { obstacles = false, title = true } = {}) {
  const layout = createWeeklyLayout(event);
  const { track } = layout;
  const b = track.bounds;
  const pad = 6;
  const vx = b.minX - pad, vy = b.minY - pad - (title ? 16 : 0);
  const vw = b.maxX - b.minX + pad * 2, vh = b.maxY - b.minY + pad * 2 + (title ? 16 : 0);
  const path = track.points.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ') + ' Z';
  const w = track.width;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}" width="${Math.round(vw * 4)}" height="${Math.round(vh * 4)}" role="img" aria-label="${esc(`${layout.title} layout: ${layout.shards.length} shards`)}">`);
  out.push(`<rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" fill="#03070b"/>`);
  out.push(`<g fill="none" stroke-linejoin="round" stroke-linecap="round">`);
  out.push(`<path d="${path}" stroke="#142c3b" stroke-width="${f(w + 1.4)}"/>`);
  out.push(`<path d="${path}" stroke="#7fd3dc" stroke-width="${f(w + 0.5)}"/>`);
  out.push(`<path d="${path}" stroke="#0e1d29" stroke-width="${f(w)}"/>`);
  out.push(`<path d="${path}" stroke="#6095a1" stroke-opacity=".45" stroke-width=".18" stroke-dasharray=".8 1.6"/>`);
  out.push(`</g>`);
  // Checkpoints: full width, from the outside rail to where the inner rails meet.
  out.push(`<g stroke="#ffd39a" stroke-opacity=".55" stroke-width=".32" stroke-dasharray=".7 .5">`);
  for (const c of track.checkpoints) {
    const nx = -c.ty, ny = c.tx;
    const inside = c.insideSide || 1;
    const a = { x: c.x - nx * inside * (w / 2), y: c.y - ny * inside * (w / 2) };
    const z = { x: c.x + nx * inside * c.insideReach, y: c.y + ny * inside * c.insideReach };
    out.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(z.x)}" y2="${f(z.y)}"/>`);
  }
  out.push(`</g>`);
  // Race direction: a chevron every 18 cells.
  out.push(`<g fill="none" stroke="#8de5dc" stroke-opacity=".7" stroke-width=".35">`);
  for (const s of track.segments) {
    for (let d = 9; d < s.length - 3; d += 18) {
      const x = s.x + s.tx * d, y = s.y + s.ty * d, nx = -s.ty, ny = s.tx;
      out.push(`<path d="M${f(x - s.tx * 0.9 + nx * 1)} ${f(y - s.ty * 0.9 + ny * 1)} L${f(x)} ${f(y)} L${f(x - s.tx * 0.9 - nx * 1)} ${f(y - s.ty * 0.9 - ny * 1)}"/>`);
    }
  }
  out.push(`</g>`);
  // Start/finish: a checkered full-width strip across point 0.
  const g = track.portal, squares = 8;
  for (let i = 0; i < squares; i++) for (let row = 0; row < 2; row++) {
    const across = -w / 2 + (i * w) / squares, back = (row - 1) * 0.7;
    const x = g.x + g.tx * back + g.nx * across, y = g.y + g.ty * back + g.ny * across;
    const angle = (Math.atan2(g.ty, g.tx) * 180) / Math.PI;
    out.push(`<rect x="0" y="0" width=".7" height="${f(w / squares)}" transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)})" fill="${(i + row) % 2 ? '#e6f5ff' : '#0a1b26'}"/>`);
  }
  for (const s of layout.stations) out.push(`<circle cx="${f(s.x)}" cy="${f(s.y)}" r="1.25" fill="none" stroke="#6ed2e3" stroke-width=".35"/><text x="${f(s.x + 2)}" y="${f(s.y + 0.8)}" font-size="2.4" fill="#6ed2e3" font-family="Inter, system-ui, sans-serif">FUEL</text>`);
  if (obstacles) {
    for (const m of layout.mines) out.push(`<circle cx="${f(m.x)}" cy="${f(m.y)}" r="${m.radius}" fill="#ff5a4e"/>`);
    for (const r of layout.bouncers) out.push(`<line x1="${f(r.originX - r.nx * r.span)}" y1="${f(r.originY - r.ny * r.span)}" x2="${f(r.originX + r.nx * r.span)}" y2="${f(r.originY + r.ny * r.span)}" stroke="#9aabb7" stroke-width="${f(r.radius * 2)}" stroke-opacity=".35" stroke-linecap="round"/>`);
    for (const t of layout.sentries) out.push(`<rect x="${f(t.x - 0.7)}" y="${f(t.y - 0.7)}" width="1.4" height="1.4" fill="#ffad72"/>`);
  }
  const shardColors = { blue: '#73d9ff', green: '#99e9b2', pink: '#ffa4ca', purple: '#bca5ff' };
  layout.shards.forEach((s, i) => {
    const c = shardColors[s.color] || shardColors.blue;
    out.push(`<path d="M${f(s.x)} ${f(s.y - 1.5)} L${f(s.x + 0.9)} ${f(s.y)} L${f(s.x)} ${f(s.y + 1.5)} L${f(s.x - 0.9)} ${f(s.y)} Z" fill="${c}" stroke="#d6f8ff" stroke-width=".2"/>`);
    out.push(`<text x="${f(s.x + 1.4)}" y="${f(s.y - 1)}" font-size="2.6" font-weight="700" fill="${c}" font-family="Inter, system-ui, sans-serif">${i + 1}</text>`);
  });
  out.push(`<text x="${f(g.x + 1)}" y="${f(g.y - w / 2 - 1.2)}" font-size="2.6" font-weight="700" fill="#e6f5ff" font-family="Inter, system-ui, sans-serif">START / FINISH</text>`);
  if (title) {
    out.push(`<text x="${f(vx + 4)}" y="${f(vy + 9)}" font-size="6" font-weight="800" letter-spacing=".5" fill="#e6f5ff" font-family="Inter, system-ui, sans-serif">${esc(`WEEK ${event.week} · ${layout.title.toUpperCase()}`)}</text>`);
    out.push(`<text x="${f(vx + 4)}" y="${f(vy + 14)}" font-size="3" fill="#a9dcff" font-family="Inter, system-ui, sans-serif">${esc(`${layout.shards.length} shards · ${Math.round(track.length)} cells · clockwise`)}</text>`);
  }
  out.push(`</svg>`);
  return out.join('\n');
}

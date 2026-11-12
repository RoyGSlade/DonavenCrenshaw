// The one interact system's marks (round 3, basics lane): everything you can
// use, talk to or walk through is marked from across the room.
//   - On the floor (canvas): soft corner brackets around a usable thing's
//     footprint, a ring at a person's feet, both in the station's accent colour,
//     breathing slowly (still with reduced motion). Bright in reach; gold for the
//     current objective.
//   - Over it (DOM): a small chip with an icon, and the name for stations, doors
//     and anyone close. Station nameplates live here now: a chip is never hidden
//     under the header (it is pushed below the safe top instead).
//   - The objective off screen or through a door: an arrow at the screen edge
//     with where it leads.
// world.js builds the list each frame (markItems) and calls update and drawGround.
import { BASICS_DATA } from './data.js';
import { icon } from './icons.js';
import { hudArt } from '../ui/assets.js';

const MARKS = BASICS_DATA.marks;

/** The icon and accent for an interact (a station's own look wins over its kind's). */
export function lookFor(kind, station = null, data = MARKS) {
  const k = data.kinds[kind] || data.kinds.station;
  const s = station ? data.stations[station] : null;
  return { icon: s?.icon || k.icon, accent: s?.accent || k.accent, verb: k.verb };
}

export function createMarks({ root, reducedMotion = () => false, data = MARKS }) {
  const layer = document.createElement('div');
  layer.className = 'of-marks';
  layer.setAttribute('aria-hidden', 'true'); // the station buttons and the prompt carry the words for screen readers
  const edge = document.createElement('div');
  edge.className = 'of-edge';
  edge.hidden = true;
  const edgeArrow = document.createElement('i');
  const arrowArt = hudArt('edge-arrow'); // points up: turned a quarter more than the angle
  if (arrowArt) { edgeArrow.className = 'has-art'; edgeArrow.style.backgroundImage = `url("${arrowArt}")`; }
  const edgeText = document.createElement('span');
  edge.append(edgeArrow, edgeText);
  root.append(layer, edge);
  const chips = new Map(); // key -> { el, label, icon, look }

  function chipFor(item) {
    let c = chips.get(item.key);
    if (!c || c.iconId !== item.icon) {
      c?.el.remove();
      const el = document.createElement('div');
      el.className = 'of-mark';
      el.dataset.mark = item.key;
      if (item.station) el.dataset.markStation = item.station; // not data-station: that is the station buttons' hook
      el.dataset.kind = item.kind;
      const label = document.createElement('span');
      el.append(icon(item.icon, 'of-mark-icon'), label);
      layer.append(el);
      c = { el, label, iconId: item.icon, text: null, cls: '', pos: '' };
      chips.set(item.key, c);
    }
    return c;
  }

  /**
   * items: [{ key, kind, station, icon, accent, label, showLabel, sx, sy, inReach, locked, objective }]
   * (sx, sy: the chip's anchor in screen px). safe: { top, bottom } px the HUD keeps clear.
   */
  const RANK = (it) => (it.objective ? 0 : it.station ? 1 : it.kind === 'door' ? 2 : it.kind === 'npc' ? 4 : 3);
  function update(items, view, safe = { top: 0, bottom: 0 }) {
    const live = new Set();
    const placed = []; // chips already put down this frame: later ones step out of their way
    for (const it of [...items].sort((a, b) => RANK(a) - RANK(b))) {
      live.add(it.key);
      const c = chipFor(it);
      const off = it.sx < -40 || it.sx > view.w + 40 || it.sy < -40 || it.sy > view.h + 40;
      // A door chip a box would cover (the dialogue box) just steps away until the box goes.
      const covered = it.kind === 'door' && (safe.hideDoorsUnder || []).some((r) => it.sx > r.left && it.sx < r.right && it.sy > r.top - 10 && it.sy < r.bottom + 30);
      const hide = off || it.inReach || covered;
      if (c.el.hidden !== hide) c.el.hidden = hide;
      if (hide) continue;
      const text = it.showLabel ? it.label : '';
      if (c.text !== text) { c.label.textContent = text; c.text = text; }
      const cls = `of-mark${it.locked ? ' is-locked' : ''}${it.objective ? ' is-objective' : ''}${it.offers ? ' is-offer' : ''}${text ? '' : ' is-icon'}`;
      if (c.cls !== cls) { c.el.className = cls; c.cls = cls; c.el.style.setProperty('--accent', it.accent); }
      // Pushed below the header, kept whole inside the screen and out from under the HUD's boxes; never hidden.
      if (c.width == null || c.measured !== text) { c.width = c.el.offsetWidth || 30; c.height = c.el.offsetHeight || 26; c.measured = text; }
      const half = c.width / 2 + 8;
      let x = Math.max(half, Math.min(view.w - half, it.sx));
      let y = Math.max(safe.top + c.height + 6, Math.min(view.h - safe.bottom - 6, it.sy));
      // A doorway (not this chip's own door) or a keep-clear strip: the chip moves above it.
      for (const r of safe.keepClear || []) {
        if (r.key && r.key === it.key) continue;
        if (x + half - 8 > r.left && x - half + 8 < r.right && y > r.top && y - c.height < r.bottom) y = Math.max(safe.top + c.height + 6, r.top - 2);
      }
      for (const r of safe.avoid || []) {
        // A few pixels of overlap are fine: the chip stays on its thing (8 px slack).
        if (x + half - 8 > r.left && x - half + 8 < r.right && y - 8 > r.top && y - c.height + 8 < r.bottom) {
          // Below the box if there is room, else beside it.
          if (r.bottom + c.height + 6 < view.h - safe.bottom) y = r.bottom + c.height + 6;
          else x = r.right + half;
        }
      }
      for (let tries = 0; tries < 4; tries++) {
        const hit = placed.find((r) => x + half - 8 > r.l && x - half + 8 < r.r && y > r.t && y - c.height < r.b);
        if (!hit) break;
        y = hit.b + c.height + 3;
      }
      placed.push({ l: x - half + 8, r: x + half - 8, t: y - c.height, b: y });
      x = Math.round(x); y = Math.round(y);
      const pos = `translate(${x}px, ${y}px)`;
      if (c.pos !== pos) { c.el.style.transform = pos; c.pos = pos; }
    }
    for (const [key, c] of chips) if (!live.has(key)) { c.el.remove(); chips.delete(key); }
  }

  /** The edge arrow: { sx, sy, label } of an off-screen objective (screen px), or null. */
  function pointTo(target, view, safe = { top: 0, bottom: 0 }) {
    if (!target) { edge.hidden = true; return; }
    const top = safe.top + 30, bottom = view.h - safe.bottom - 30;
    // On screen (even under the header, where its chip is pushed down into view): its own gold marks say it.
    // (The same reach as a chip's: a chip that is drawn already points at it.)
    const inside = target.sx > -40 && target.sx < view.w + 40 && target.sy > -40 && target.sy < view.h + 40;
    if (inside) { edge.hidden = true; return; }
    const cx = view.w / 2, cy = (top + bottom) / 2;
    const a = Math.atan2(target.sy - cy, target.sx - cx);
    const rx = view.w / 2 - 24, ry = (bottom - top) / 2 - 8;
    const k = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
    const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    edge.hidden = false;
    edge.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    edgeArrow.style.transform = `rotate(${arrowArt ? a + Math.PI / 2 : a}rad)`;
    // The arrow sits on the point; the words run inward, so neither is cut off.
    edge.dataset.side = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : Math.sin(a) < 0 ? 'top' : 'bottom';
    if (edgeText.textContent !== target.label) edgeText.textContent = target.label || '';
  }

  /**
   * Floor marks, drawn in world space after the static layer and before people.
   * items: as update, plus box { x, y, w, h } (footprint) or ring { x, y, r } (a person's feet).
   */
  function drawGround(ctx, items, t) {
    const still = reducedMotion();
    const breathe = still ? 0.5 : 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / data.ring.pulse);
    for (const it of items) {
      const gold = it.objective;
      const colour = gold ? BASICS_DATA.marks.objective : it.locked ? '#7d8f9d' : it.accent;
      const a = it.inReach ? data.ring.reachAlpha : Math.min(1, data.ring.alpha + (gold ? 0.35 : 0) + breathe * 0.22);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = colour;
      for (const [width, alpha] of [[it.inReach || gold ? 9 : 7, a * 0.22], [it.inReach || gold ? 3 : 2, a]]) {
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha;
        if (it.ring) {
          ctx.beginPath();
          ctx.ellipse(it.ring.x, it.ring.y + it.ring.r * 0.35, it.ring.r, it.ring.r * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (it.box) {
          brackets(ctx, it.box, it.inReach ? 0 : (still ? 0 : breathe * 2));
        }
      }
      if (it.inReach && it.box) {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = colour;
        ctx.fillRect(it.box.x, it.box.y, it.box.w, it.box.h);
      }
      ctx.restore();
    }
  }

  return {
    update,
    pointTo,
    drawGround,
    hide() { layer.hidden = true; edge.hidden = true; },
    show() { layer.hidden = false; },
    destroy() { layer.remove(); edge.remove(); chips.clear(); },
    el: layer,
  };
}

// Four corner brackets around a box, pushed out by `out` px (the breathing).
function brackets(ctx, b, out = 0) {
  const pad = 5 + out;
  const x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + b.w + pad, y1 = b.y + b.h + pad;
  const L = Math.max(8, Math.min(18, Math.min(b.w, b.h) * 0.3));
  ctx.beginPath();
  ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
  ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
  ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
  ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
  ctx.stroke();
}

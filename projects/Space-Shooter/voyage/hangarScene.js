// The hangar, drawn straight down like the ships: deck plating, walls with
// light strips, the landing pad with your ship, and the stations around it
// (props from the UI kit's top-down set, or simple shapes until they load),
// with the people who work there. Opening a station moves the camera onto it,
// so the station's panel opens in place instead of on another screen.
// One canvas, sized with renderDpr(). With reduced motion nothing moves on its
// own; the camera jumps instead of gliding.
import { renderDpr, readRenderScale } from './renderScale.js';
import { HANGAR, STATIONS, fitHangar, stationAt, CAST_NAMES } from './hangarStations.js';

const TAU = Math.PI * 2;
const CAST_COLOURS = { chibby: '#ffad72', ralph: '#d9b38c', mel: '#ff8fa3', edna: '#b5c8d5' };

/**
 * canvas: the full-page scene. art: { deck: url, props: { [art]: url } }.
 * onStation(id): a station was clicked or tapped on the canvas.
 * onFrame(): after every draw (the page moves its station buttons).
 */
export function createHangarScene(canvas, { reducedMotion = () => false, art = {}, onStation = () => {}, onFrame = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let w = 0, h = 0;
  let view = { scale: 20, ox: 0, oy: 0 };
  let target = view;
  let focusId = null;
  let focusSide = 'right';
  let ship = null, shipScale = 1, tier = 0;
  let states = {};
  let hover = null;
  let frame = 0;
  let visible = true;
  let deck = null;
  let deckPattern = null;
  const props = {};
  const ralph = { x: 7, y: 15.6, tx: 7, ty: 15.6, wait: 0 };
  let lastT = 0;

  function load(url, onload) {
    if (!url) return null;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { onload?.(img); draw(performance.now()); };
    img.src = url;
    return img;
  }
  deck = load(art.deck, () => { deckPattern = null; });
  for (const [key, url] of Object.entries(art.props || {})) props[key] = load(url);

  // Where the hangar sits on screen. A focused station is pulled toward the
  // side away from the open panel (or the top on phones, where the panel is a
  // bottom sheet).
  function fitFor(id) {
    const top = 64; // under the header
    const phone = w <= 700;
    if (!id) {
      // Nothing open: the whole hangar, centred under the header.
      const all = fitHangar(w, Math.max(200, h - top), phone ? 8 : 24);
      all.oy += top;
      return all;
    }
    const base = fitHangar(w, Math.max(200, phone ? h * 0.46 : h - top), phone ? 8 : 24);
    base.oy += top * (phone ? 0.9 : 1);
    const s = STATIONS.find((x) => x.id === id);
    if (!s) return base;
    const zoom = phone ? 1.3 : 1.35;
    const scale = base.scale * zoom;
    const cx = s.box.x + s.box.w / 2;
    const cy = s.box.y + s.box.h / 2;
    const want = phone ? { x: w / 2, y: top + h * 0.2 } : { x: focusSide === 'right' ? w * 0.27 : w * 0.73, y: top + (h - top) / 2 };
    return { scale, ox: want.x - cx * scale, oy: want.y - cy * scale };
  }

  function size() {
    w = innerWidth; h = innerHeight;
    dpr = renderDpr(globalThis.devicePixelRatio || 1, readRenderScale());
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    target = fitFor(focusId);
    view = { ...target };
    deckPattern = null;
  }

  const X = (m) => view.ox + m * view.scale;
  const Y = (m) => view.oy + m * view.scale;
  const S = (m) => m * view.scale;

  function drawFloor() {
    ctx.fillStyle = '#05090f';
    ctx.fillRect(0, 0, w, h);
    const x0 = X(0), y0 = Y(0), fw = S(HANGAR.width), fh = S(HANGAR.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, fw, fh); ctx.clip();
    if (deck?.complete && deck.naturalWidth) {
      if (!deckPattern) deckPattern = ctx.createPattern(deck, 'repeat');
      const tile = S(6); // one texture tile = 6 m
      ctx.save();
      ctx.translate(x0, y0);
      ctx.scale(tile / deck.naturalWidth, tile / deck.naturalWidth);
      ctx.fillStyle = deckPattern;
      ctx.fillRect(0, 0, (fw * deck.naturalWidth) / tile, (fh * deck.naturalWidth) / tile);
      ctx.restore();
      ctx.fillStyle = 'rgba(7,13,23,0.35)';
      ctx.fillRect(x0, y0, fw, fh);
    } else {
      ctx.fillStyle = '#0c1724';
      ctx.fillRect(x0, y0, fw, fh);
      ctx.strokeStyle = '#16283a';
      ctx.lineWidth = 1;
      for (let m = 0; m <= HANGAR.width; m += 2) { ctx.beginPath(); ctx.moveTo(X(m), y0); ctx.lineTo(X(m), y0 + fh); ctx.stroke(); }
      for (let m = 0; m <= HANGAR.height; m += 2) { ctx.beginPath(); ctx.moveTo(x0, Y(m)); ctx.lineTo(x0 + fw, Y(m)); ctx.stroke(); }
    }
    // Warm pools of work light under the stations, cool light on the pad.
    for (const s of STATIONS) {
      const cx = X(s.box.x + s.box.w / 2), cy = Y(s.box.y + s.box.h / 2);
      const r = S(Math.max(s.box.w, s.box.h) * 0.9);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, s.id === 'pad' ? 'rgba(129,230,223,0.10)' : 'rgba(255,173,114,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    // Walls: a thick gunmetal rim with a cyan strip and amber corner lamps.
    ctx.strokeStyle = '#2b3846';
    ctx.lineWidth = Math.max(4, S(0.45));
    ctx.strokeRect(x0, y0, fw, fh);
    ctx.strokeStyle = 'rgba(129,230,223,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + S(0.3), y0 + S(0.3), fw - S(0.6), fh - S(0.6));
    ctx.fillStyle = '#ffad72';
    for (const [cx, cy] of [[0.5, 0.5], [HANGAR.width - 0.5, 0.5], [0.5, HANGAR.height - 0.5], [HANGAR.width - 0.5, HANGAR.height - 0.5]]) {
      ctx.beginPath(); ctx.arc(X(cx), Y(cy), Math.max(2, S(0.14)), 0, TAU); ctx.fill();
    }
  }

  function drawPad(s, t) {
    const cx = X(s.box.x + s.box.w / 2), cy = Y(s.box.y + s.box.h / 2), r = S(s.box.w / 2) * 0.9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0c1724';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0, TAU); ctx.fill();
    const stripes = 36;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#2a221a' : '#a3713f66';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.06, (i / stripes) * TAU, ((i + 1) / stripes) * TAU);
      ctx.arc(0, 0, r * 0.98, ((i + 1) / stripes) * TAU, (i / stripes) * TAU, true);
      ctx.fill();
    }
    ctx.strokeStyle = '#81e6df33';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.stroke();
    ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2;
      const on = reducedMotion() ? 0.8 : 0.35 + 0.65 * Math.max(0, Math.sin(t / 600 - i * 0.5));
      ctx.fillStyle = `rgba(129,230,223,${on.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, Math.max(2, r * 0.025), 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < tier ? '#ffad72' : '#ffad7222';
      ctx.fillRect(-r * 0.2 + i * r * 0.15, -r * 1.16, r * 0.1, Math.max(3, r * 0.035));
    }
    if (ship) {
      const size = r * 1.5 * shipScale;
      ctx.shadowColor = '#000c';
      ctx.shadowBlur = 24;
      ctx.drawImage(ship, -size / 2, -size / 2, size, size);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    // Chibby's bench sits at the pad's lower left.
    drawProp({ art: 'workbench', box: { x: s.box.x - 2.6, y: s.box.y + s.box.h - 2.6, w: 3.6, h: 2.7 } });
  }

  function drawProp(s) {
    const img = props[s.art];
    const b = s.box;
    if (img?.complete && img.naturalWidth) {
      // Fit inside the box, keeping the picture's shape.
      const k = Math.min(S(b.w) / img.naturalWidth, S(b.h) / img.naturalHeight);
      const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
      ctx.drawImage(img, X(b.x) + (S(b.w) - dw) / 2, Y(b.y) + (S(b.h) - dh) / 2, dw, dh);
      return;
    }
    // Until the art loads: a plate with a light strip.
    ctx.fillStyle = '#1a2735';
    ctx.strokeStyle = '#4b5d6e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect?.(X(b.x), Y(b.y), S(b.w), S(b.h), S(0.25)) ?? ctx.rect(X(b.x), Y(b.y), S(b.w), S(b.h));
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(129,230,223,0.5)';
    ctx.fillRect(X(b.x) + S(0.3), Y(b.y) + S(0.25), S(b.w) - S(0.6), Math.max(2, S(0.08)));
  }

  function drawRing(s, t) {
    const st = states[s.id] || {};
    const isHover = hover === s.id || focusId === s.id;
    if (!st.objective && !isHover) return;
    const cx = X(s.at.x), cy = Y(s.at.y);
    const pulse = reducedMotion() ? 0.7 : 0.5 + 0.5 * Math.sin(t / 380);
    ctx.save();
    ctx.strokeStyle = st.objective ? `rgba(255,173,114,${(0.45 + 0.45 * pulse).toFixed(3)})` : 'rgba(129,230,223,0.7)';
    ctx.lineWidth = st.objective ? 2.5 : 1.5;
    ctx.setLineDash(st.objective ? [] : [5, 6]);
    ctx.beginPath(); ctx.arc(cx, cy, S(s.ring * (st.objective ? 0.75 + 0.1 * pulse : 0.8)), 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawPerson(id, x, y, t) {
    const r = Math.max(6, S(0.42));
    const cx = X(x), cy = Y(y);
    const bob = reducedMotion() ? 0 : Math.sin(t / 500 + x) * r * 0.06;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(cx + r * 0.2, cy + r * 0.3, r * 1.05, r * 0.8, 0, 0, TAU); ctx.fill();
    // Shoulders and head, straight down.
    ctx.fillStyle = '#2b3846';
    ctx.beginPath(); ctx.ellipse(cx, cy + bob, r * 1.1, r * 0.65, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = CAST_COLOURS[id] || '#81e6df';
    ctx.beginPath(); ctx.arc(cx, cy + bob, r * 0.55, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#eaf4f5aa';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawRalph(t, dt) {
    // Ralph pads about near his kennel and the scrap pile, then sits.
    if (!reducedMotion()) {
      const dx = ralph.tx - ralph.x, dy = ralph.ty - ralph.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.05) { const step = Math.min(d, 1.6 * dt); ralph.x += (dx / d) * step; ralph.y += (dy / d) * step; }
      else if ((ralph.wait -= dt) <= 0) {
        const spots = [[7, 15.6], [9.5, 15.2], [6, 14.4], [8.4, 17.6], [11, 16.4]];
        const [x, y] = spots[Math.floor((t / 1000) % spots.length)];
        ralph.tx = x; ralph.ty = y; ralph.wait = 2 + ((t / 997) % 3);
      }
    }
    const r = Math.max(5, S(0.32));
    const cx = X(ralph.x), cy = Y(ralph.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(cx + r * 0.2, cy + r * 0.25, r * 1.4, r * 0.75, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = CAST_COLOURS.ralph;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.3, r * 0.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 1.2, cy, r * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#81e6df';
    ctx.beginPath(); ctx.arc(cx + r * 1.45, cy - r * 0.15, Math.max(1.2, r * 0.12), 0, TAU); ctx.fill();
  }

  function draw(t) {
    const dt = Math.min(0.1, lastT ? (t - lastT) / 1000 : 0);
    lastT = t;
    // Glide the camera toward its target.
    const k = reducedMotion() ? 1 : 1 - Math.pow(0.0008, dt || 0.016);
    view = { scale: view.scale + (target.scale - view.scale) * k, ox: view.ox + (target.ox - view.ox) * k, oy: view.oy + (target.oy - view.oy) * k };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFloor();
    for (const s of STATIONS) {
      if (s.id === 'pad') drawPad(s, t);
      else drawProp(s);
      if (states[s.id]?.locked) {
        ctx.fillStyle = 'rgba(5,9,15,0.45)';
        ctx.fillRect(X(s.box.x), Y(s.box.y), S(s.box.w), S(s.box.h));
      }
    }
    for (const s of STATIONS) drawRing(s, t);
    for (const s of STATIONS) {
      if (!s.who || s.who === 'ralph' || s.id === 'range') continue;
      drawPerson(s.who, s.at.x, s.at.y, t);
    }
    drawRalph(t, dt);
    onFrame();
  }

  const settled = () => Math.abs(view.scale - target.scale) < 0.01 && Math.abs(view.ox - target.ox) < 0.3 && Math.abs(view.oy - target.oy) < 0.3;
  function loop(t) {
    frame = 0;
    draw(t);
    // Keep animating while the camera moves; otherwise only for the lights and Ralph.
    if (visible && (!reducedMotion() || !settled())) frame = requestAnimationFrame(loop);
  }
  function start() { if (!frame) frame = requestAnimationFrame(loop); }

  size();
  addEventListener('resize', () => { size(); draw(performance.now()); });
  addEventListener('stardust:render-scale', () => { size(); draw(performance.now()); });
  document.addEventListener('visibilitychange', () => { visible = document.visibilityState === 'visible'; if (visible) start(); });
  canvas.addEventListener('click', (e) => {
    const s = stationAt((e.clientX - view.ox) / view.scale, (e.clientY - view.oy) / view.scale);
    if (s) onStation(s.id);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const s = stationAt((e.clientX - view.ox) / view.scale, (e.clientY - view.oy) / view.scale);
    const id = s?.id || null;
    if (id !== hover) { hover = id; canvas.style.cursor = id ? 'pointer' : ''; start(); }
  });
  start();

  return {
    setShip(image, scale = 1) { ship = image; shipScale = scale; draw(performance.now()); start(); },
    get ship() { return ship; },
    setTier(n) { tier = n; draw(performance.now()); },
    setStates(next) { states = next || {}; start(); },
    setHover(id) { hover = id; start(); },
    /** Move the camera onto a station (null: the whole hangar). side: where the panel opens. */
    focus(id, side = 'right') { focusId = id; focusSide = side; target = fitFor(id); if (reducedMotion()) view = { ...target }; start(); },
    get focused() { return focusId; },
    /** Screen position of a floor point (metres), for the page's station buttons. */
    toScreen(x, y) { return { x: X(x), y: Y(y), scale: view.scale }; },
    toWorld(sx, sy) { return { x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale }; },
    get dpr() { return dpr; },
    names: CAST_NAMES,
  };
}

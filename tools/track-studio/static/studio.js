// Track Studio v2: a phone track-design tool. One full-bleed canvas, a tool
// dock with a contextual sub-toolbar per tool, sheets for settings, layers,
// checks, versions and requests. No inline script, no outside resources;
// server data reaches the DOM through textContent / setAttribute only.
import * as G from '/projects/Space-Shooter/studio/studioGeometry.js';
import {
  newDoc, normalizeDoc, pageSize, toWorld as pageToWorld, toPage as worldToPage, LAYERS, LAYER_ORDER, STAMP_TYPES,
  OBSTACLE_TYPES, ZONE_TYPES, BEHAVIORS, REQUEST_TYPES, REQUEST_BEHAVIORS, VISUAL_REQUEST_TYPES, SKINS, SKIN_LABELS,
  stampLayer, layerCounts,
} from '/projects/Space-Shooter/studio/draftV2.js';
import { gameLane } from '/projects/Space-Shooter/studio/sketchToWeekly.js';
import { createTrack } from '/projects/Space-Shooter/engine/track.js';
import { createWeeklyLayout, WEEKLY_RULES } from '/projects/Space-Shooter/engine/weekly/layout.js';
import {
  SIZES, sizeRule, snapStampSize, trueStampSize, sizeLabel, defaultStampSize, clampLaneWidth, widerThanGame, clampDocWidths,
  blockedRows, shardReach, sizeTable, scaleBar,
} from '/projects/Space-Shooter/studio/gameSizes.js';
import { renderBoard, drawSkinSample, toScreen, toWorldPx, PEN } from './render.js';

const $ = (id) => document.getElementById(id);
const DOC_KEY = 'trackStudio.v2.doc';
const PREFS_KEY = 'trackStudio.v2.prefs';
const REFINE_KEY = 'trackStudio.refine.v1';
const WIDTH_NOTED_KEY = 'trackStudio.v2.widthNoted';
const POLL_MS = 15000;
const STATUS_LABEL = { ready: 'Ready', 'needs-work': 'Needs work', 'agent-working': 'Agent working', 'approval-requested': 'Approval requested' };
const PAGE_SIZES = [['S', 180], ['M', 260], ['L', 360], ['XL', 520]];
const STAMP_PALETTE = ['landmark', 'star', 'mine', 'rock', 'sentry', 'barricade', 'debris', 'gate', 'shards', 'start', 'fuel', 'fast', 'tight', 'calm', 'hazard', 'request'];
const OBSTACLE_LABEL = { mine: 'Mine', rock: 'Rock', sentry: 'Sentry', barricade: 'Barricade', debris: 'Debris' };

// ------------------------------------------------------------------ helpers

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM, which the CSP allows (style attributes it does not)
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(typeof kid === 'object' && kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function fmtMs(ms) {
  if (typeof ms !== 'number' || !(ms > 0)) return null;
  const t = Math.round(ms), m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000), milli = t % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}
const fmtShort = (ms) => { const f = fmtMs(ms); return f ? f.slice(0, -2) : '—'; };
function ago(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, k = 2) => Math.round(v * 10 ** k) / 10 ** k;

function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode, quota */ } }
function load(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }

const prefs = Object.assign({ haptics: true, animate: false, checkpoints: true }, load(PREFS_KEY, {}));
function buzz(pattern = 8) { if (prefs.haptics && navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* unsupported */ } } }

let toastTimer = null;
function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.hidden = !text;
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => { el.hidden = true; }, kind === 'bad' ? 6000 : 3200);
}

async function api(path, body, timeoutMs = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const opts = { signal: ctl.signal, headers: { 'X-Studio': '1' }, cache: 'no-store' };
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, opts); } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'The studio took too long to answer.' : 'Cannot reach the studio. Check your connection.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !data || data.ok === false) {
      const msg = (data && data.error) || `Request failed (${res.status}).`;
      const err = new Error(data && data.hint ? `${msg} ${data.hint}` : msg);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function say(el, text, kind) { el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }

// ------------------------------------------------------------------ state

const canvas = $('board');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, dpr = 1;

const S = {
  doc: null,
  undo: [], redo: [],
  tool: 'lane',
  mode: { lane: 'draw', width: 'brush', obstacles: 'pen', shards: 'pen', landmarks: 'pen', hazards: 'pen', notes: 'pen', stamp: 'place', select: 'tap' },
  opts: {
    smooth: 'medium', brushW: WEEKLY_RULES.MAX_WIDTH, brushPx: 30, obstacleType: 'mine', obstacleSpacing: 6, obstacleSize: 0.84, obstacleBehavior: 'static',
    shardSpacing: 12, showRacing: false, zoneType: 'debris', stampType: 'landmark', stampSize: null, snap: 'off', mirror: false,
  },
  view: { scale: 3, ox: 0, oy: 0 },
  sel: new Set(),
  stylus: false,
  showGame: false,
  state: null,         // the server's /state
  game: null,          // the latest in-browser game check
  compare: new Set(),
  ui: {},              // per version-card panel state
};
let D = null; // derived from S.doc (see refresh)
let live = null; // what the current gesture draws

// ------------------------------------------------------------------ derived data

function worldOf(p) { return pageToWorld(S.doc, p); }
function pageOf(w) { const p = worldToPage(S.doc, w); return [round(clamp(p[0], 0, 1), 5), round(clamp(p[1], 0, 1), 5)]; }
function pageOfFree(w) { const p = worldToPage(S.doc, w); return [round(clamp(p[0], -0.5, 1.5), 5), round(clamp(p[1], -0.5, 1.5), 5)]; }

function refresh() {
  const doc = S.doc;
  const page = pageSize(doc);
  const lane = doc.lane.points.map(worldOf);
  const closed = doc.lane.closed && lane.length >= 4;
  const out = { page, lane, closed, cum: null, lap: 0, analysis: null, samples: [], uniform: G.isUniformWidth(doc.width), skinTrack: null, start: null,
    strokes: [], rows: new Map(), stamps: [], markers: [], racing: null, gameLane: null, shards: { explicit: 0, onLane: 0, off: [] },
    // The one width the game flies: stamps that span the lane and every true-size check use it.
    gameWidth: clampLaneWidth(doc.width.base), blocked: [], mines: 0, shipStart: null };
  if (lane.length >= 2) {
    out.cum = G.cumulative(lane, closed);
    out.lap = out.cum.at(-1);
    out.analysis = G.analyzeLane(lane, { closed, profile: doc.width, step: 1 });
    out.samples = out.analysis.samples;
    const a = out.analysis;
    for (const m of a.overlaps) out.markers.push({ ...m, kind: 'overlap' });
    for (const m of a.crossings) out.markers.push({ ...m, kind: 'crossing' });
    for (const m of a.tight) out.markers.push({ ...m, kind: 'tight' });
    for (const m of a.zigzags) out.markers.push({ ...m, kind: 'zigzag', soft: true });
    const st = doc.lane.start < lane.length ? doc.lane.start : 0;
    const p = G.pointAt(lane, out.cum, out.cum[st] || 0, closed);
    out.start = { x: p.x, y: p.y, tx: p.tx, ty: p.ty, w: G.widthAt(doc.width, out.cum[st] || 0, out.lap) };
    // The ship waits this far behind the line, facing along the lap (engine/weekly/layout.js).
    const back = SIZES.startBehind.value;
    out.shipStart = { x: p.x - p.tx * back, y: p.y - p.ty * back, angle: Math.atan2(p.ty, p.tx) };
  }
  if (closed) {
    try {
      const simple = G.rdpClosed(G.dedupe(lane, 0.3), 0.25);
      const wide = out.uniform ? G.clampWidth(doc.width.base) : out.analysis.maxWidth + 0.4;
      if (simple.length >= 3) out.skinTrack = createTrack(simple, wide, 'studio');
    } catch { out.skinTrack = null; }
    try { out.gameLane = gameLane(doc); } catch { out.gameLane = null; }
    if (S.opts.showRacing && out.samples.length > 6) out.racing = G.racingLine(out.samples, { iterations: 160 });
  }
  for (const s of doc.strokes) {
    const world = s.points.map(worldOf);
    out.strokes.push({ stroke: s, world });
    if (s.layer === 'obstacles' || s.layer === 'shards') out.rows.set(s.id, G.pointsAlong(world, s.spacing || (s.layer === 'shards' ? 12 : 6)));
  }
  for (const s of doc.stamps) {
    const world = worldOf([s.x, s.y]);
    let laneAngle = null;
    if (s.type === 'shards' && lane.length >= 2) {
      const q = G.nearestOnPolyline(lane, world, closed, out.cum);
      if (q) laneAngle = Math.atan2(q.ty, q.tx) * 180 / Math.PI;
    }
    out.stamps.push({ stamp: s, world, layer: stampLayer(s), laneAngle });
  }
  // Shards placed by hand, and how many the ship can reach at the real pickup radius.
  const shardPts = [];
  for (const { stamp, world } of out.stamps) {
    if (stamp.type === 'shard') shardPts.push(world);
    if (stamp.type === 'shards') shardPts.push(world, world, world);
  }
  for (const s of doc.strokes) if (s.layer === 'shards') shardPts.push(...(out.rows.get(s.id) || []));
  out.shards.explicit = shardPts.length;
  // Static mines (stamps and rows) at their real radius, for the blocked-lane check.
  const mines = [];
  for (const { stamp, world } of out.stamps) if (stamp.type === 'mine' && stamp.behavior === 'static') mines.push(world);
  for (const s of doc.strokes) if (s.layer === 'obstacles' && s.type === 'mine' && s.behavior === 'static') mines.push(...(out.rows.get(s.id) || []));
  out.mines = mines.length;
  if (lane.length >= 2) {
    const reach = shardReach(out.gameWidth);
    for (const p of shardPts) {
      const q = G.nearestOnPolyline(lane, p, closed, out.cum);
      if (q && Math.abs(q.off) <= reach) out.shards.onLane++;
      else if (q) out.shards.off.push(p);
    }
    const r = SIZES.mineRadius.value, half = out.gameWidth / 2;
    const items = [];
    for (const p of mines) {
      const q = G.nearestOnPolyline(lane, p, closed, out.cum);
      if (q && Math.abs(q.off) < half + r) items.push({ s: q.s, off: q.off, r });
    }
    out.blocked = blockedRows(items, out.gameWidth, { lap: closed ? out.lap : Infinity }).map((b) => {
      const p = G.pointAt(lane, out.cum, b.s, closed);
      return { ...b, x: p.x, y: p.y };
    });
    for (const b of out.blocked) out.markers.push({ x: b.x, y: b.y, kind: 'blocked' });
  }
  D = out;
  D.checks = buildChecks();
}

// ------------------------------------------------------------------ history

function snapshot() { return JSON.stringify(S.doc); }
function pushUndo(before) {
  if (before === snapshot()) return false;
  clampOldWidths();
  S.undo.push(before);
  if (S.undo.length > 300) S.undo.shift();
  S.redo = [];
  return true;
}
// Older drafts could ask for lanes up to 14 wide. They load and draw as saved;
// the first edit clamps them to the game's range (in the same undo step) and
// says so once per design.
function clampOldWidths() {
  if (!widerThanGame(S.doc) || !clampDocWidths(S.doc)) return;
  const noted = load(WIDTH_NOTED_KEY, []);
  if (Array.isArray(noted) && noted.includes(S.doc.id)) return;
  store(WIDTH_NOTED_KEY, [...(Array.isArray(noted) ? noted : []), S.doc.id].slice(-200));
  S.widthNote = `This design was drawn wider than the game allows. Lane widths over ${WEEKLY_RULES.MAX_WIDTH} are now ${WEEKLY_RULES.MAX_WIDTH}, the game's widest. Undo brings them back.`;
  setTimeout(() => { if (S.widthNote) { toast(S.widthNote, 'bad'); S.widthNote = null; } }, 0);
}

function mutate(fn, { quiet = false } = {}) {
  const before = snapshot();
  fn(S.doc);
  if (!pushUndo(before)) return false;
  changed();
  if (!quiet) buzz(6);
  return true;
}
function changed() {
  refresh();
  store(DOC_KEY, S.doc);
  scheduleSave();
  scheduleCheck();
  updateChrome();
  requestDraw(true);
}
function undo() {
  if (!S.undo.length) return;
  S.redo.push(snapshot());
  S.doc = normalizeDoc(JSON.parse(S.undo.pop()));
  S.sel.clear();
  changed(); buzz(6); renderSub();
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(snapshot());
  S.doc = normalizeDoc(JSON.parse(S.redo.pop()));
  S.sel.clear();
  changed(); buzz(6); renderSub();
}

// ------------------------------------------------------------------ view

function usable() {
  const top = $('banner').hidden ? 64 : 110;
  const bottom = document.querySelector('.dockbar').getBoundingClientRect().height || 170;
  return { x: 8, y: top, w: Math.max(100, W - 16), h: Math.max(100, H - top - bottom - 8) };
}

function fitView() {
  const area = usable();
  const b = D.lane.length >= 2 ? G.bounds([D.lane]) : { minX: 0, minY: 0, maxX: D.page.w, maxY: D.page.h };
  const pad = D.lane.length >= 2 ? 10 : 2;
  const bw = Math.max(20, b.maxX - b.minX + pad * 2), bh = Math.max(20, b.maxY - b.minY + pad * 2);
  const scale = clamp(Math.min(area.w / bw, area.h / bh), 0.3, 60);
  S.view = { scale, ox: area.x + area.w / 2 - ((b.minX + b.maxX) / 2) * scale, oy: area.y + area.h / 2 - ((b.minY + b.maxY) / 2) * scale };
  requestDraw(true);
}

function zoomAt(pt, factor) {
  const w = toWorldPx(S.view, pt);
  const scale = clamp(S.view.scale * factor, 0.3, 80);
  S.view = { scale, ox: pt[0] - w[0] * scale, oy: pt[1] - w[1] * scale };
  requestDraw(true);
}

function panTo(world) {
  const area = usable();
  const scale = Math.max(S.view.scale, 5);
  S.view = { scale, ox: area.x + area.w / 2 - world[0] * scale, oy: area.y + area.h / 2 - world[1] * scale };
  requestDraw(true);
}

function resize() {
  dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
  const first = !W;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  if (first && D) fitView();
  requestDraw(true);
}

// ------------------------------------------------------------------ drawing loop

let drawQueued = false, followUps = 0;
function requestDraw(reset = false) {
  if (reset) followUps = 90;
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(frame);
}

function selectionBox() {
  if (!S.sel.size) return null;
  const pts = [];
  let single = null;
  for (const id of S.sel) {
    const st = D.stamps.find((x) => x.stamp.id === id);
    if (st) {
      const r = Math.max(shownRadius(st.stamp), 13 / S.view.scale);
      pts.push([st.world[0] - r, st.world[1] - r], [st.world[0] + r, st.world[1] + r]);
      single = S.sel.size === 1 ? st : null;
      continue;
    }
    const sk = D.strokes.find((x) => x.stroke.id === id);
    if (sk) pts.push(...sk.world);
  }
  const b = G.bounds([pts]);
  if (!b) return null;
  const a = toScreen(S.view, [b.minX, b.minY]), c = toScreen(S.view, [b.maxX, b.maxY]);
  const box = { x: a[0] - 8, y: a[1] - 8, w: c[0] - a[0] + 16, h: c[1] - a[1] + 16 };
  if (single && (S.tool === 'select' || S.tool === 'stamp')) {
    const q = toScreen(S.view, single.world);
    // Sizes the game fixes get a locked handle; ranges and design intent can be scaled.
    const locked = ['fixed', 'lane'].includes(sizeRule(single.stamp.type, D.gameWidth).kind);
    box.handles = [{ kind: 'rotate', x: q[0], y: box.y - 30 }, { kind: locked ? 'locked' : 'scale', x: box.x + box.w + 14, y: box.y + box.h + 14 }];
    box.stamp = single.stamp;
    box.locked = locked;
    box.sizeLabel = sizeLabel(single.stamp.type, single.stamp.size, D.gameWidth);
  }
  return box;
}

/** How far a stamp reaches from its centre at its in-game size (cells). */
function shownRadius(stamp) {
  const r = trueStampSize(stamp, D.gameWidth) / 2;
  return stamp.type === 'shards' ? Math.max(SIZES.shardClusterGap.value, r) + SIZES.shardHeight.value / 2 : r;
}

function frame(t) {
  drawQueued = false;
  if (!D) return;
  const lane = D.lane.length >= 2 ? { samples: D.samples, closed: D.closed, uniform: D.uniform, skinTrack: D.skinTrack, start: D.start } : null;
  const game = S.showGame && S.game && S.game.layout ? { layout: S.game.layout, offset: S.game.offset } : null;
  const markers = live && live.markers ? live.markers : D.markers;
  S.box = selectionBox();
  const area = usable();
  const busy = renderBoard(ctx, {
    W, H, dpr, view: S.view, page: D.page, skin: S.doc.skin, animate: prefs.animate, time: t / 1000,
    lane: live && live.hideLane ? null : lane, layers: S.doc.layers, strokes: D.strokes, stamps: D.stamps, rows: D.rows,
    markers, racing: D.racing, game, live, selected: S.sel, selectionBox: S.box,
    gameWidth: D.gameWidth, shipStart: D.closed ? D.shipStart : null, legend: { x: area.x, y: area.y + area.h },
  });
  if ((busy || prefs.animate) && followUps-- > 0) requestDraw();
}

// ------------------------------------------------------------------ hit testing

const layerOpen = (layer) => S.doc.layers[layer].visible && !S.doc.layers[layer].locked;

function hitStamp(pt, { layer = null } = {}) {
  const w = toWorldPx(S.view, pt);
  let best = null;
  for (const st of D.stamps) {
    if (!layerOpen(st.layer) || (layer && st.layer !== layer)) continue;
    const r = Math.max(shownRadius(st.stamp), 22 / S.view.scale); // true size, or a fingertip, whichever is bigger
    const d = Math.hypot(st.world[0] - w[0], st.world[1] - w[1]);
    if (d <= r && (!best || d < best.d)) best = { d, st };
  }
  return best && best.st;
}

function hitStroke(pt, { layer = null } = {}) {
  const w = toWorldPx(S.view, pt), reach = 18 / S.view.scale;
  let best = null;
  for (const sk of D.strokes) {
    if (!layerOpen(sk.stroke.layer) || (layer && sk.stroke.layer !== layer)) continue;
    if (sk.stroke.layer === 'hazards' && sk.world.length > 2 && G.pointInPolygon(sk.world, w)) { if (!best) best = { d: reach, sk }; continue; }
    if (sk.world.length < 2) continue;
    const q = G.nearestOnPolyline(sk.world, w, sk.stroke.closed);
    if (q && q.d <= reach && (!best || q.d < best.d)) best = { d: q.d, sk };
  }
  return best && best.sk;
}

function hitHandle(pt) {
  if (!S.box || !S.box.handles) return null;
  return S.box.handles.find((hd) => Math.hypot(hd.x - pt[0], hd.y - pt[1]) <= 26) || null;
}

function laneNear(w, reachCells) {
  if (D.lane.length < 2) return null;
  const q = G.nearestOnPolyline(D.lane, w, D.closed, D.cum);
  return q && q.d <= reachCells ? q : null;
}

// ------------------------------------------------------------------ input

const pointers = new Map();
let gesture = null;
let action = null;
let longPress = null;
let spaceDown = false;

const screenPt = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const isPalm = (e) => e.pointerType === 'touch' && e.width > 48 && e.height > 48;
const youngAction = () => action && performance.now() - action.t0 < 220 && action.travel < 20;

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const pt = screenPt(e);
  if (e.pointerType === 'pen' && !S.stylus) { S.stylus = true; toast('Stylus mode: the pen draws, one finger pans.'); }
  if (isPalm(e)) { pointers.set(e.pointerId, { x: pt[0], y: pt[1], ignored: true }); return; }
  pointers.set(e.pointerId, { x: pt[0], y: pt[1], type: e.pointerType });
  if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || spaceDown)) { startPan(e.pointerId, pt); return; }
  if (gesture && gesture.kind === 'pinch') { pointers.get(e.pointerId).ignored = true; return; }
  if (action) {
    // A second finger: a quick one turns the gesture into a pinch, a late one is a palm.
    if (e.pointerType === 'touch' && action.pointerType === 'touch' && youngAction()) { cancelAction(); startPinch(); }
    else pointers.get(e.pointerId).ignored = true;
    return;
  }
  const active = [...pointers.entries()].filter(([, p]) => !p.ignored);
  if (active.length >= 2) { if (gesture) gesture = null; startPinch(); return; }
  if (gesture) return;
  if (S.stylus && e.pointerType === 'touch') { startPan(e.pointerId, pt); return; }
  startAction(e, pt);
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse' && action === null && (S.tool === 'width' || S.mode[S.tool] === 'erase')) { hoverCursor(screenPt(e)); }
    return;
  }
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  const list = events.length ? events : [e];
  const last = screenPt(list.at(-1));
  p.x = last[0]; p.y = last[1];
  if (p.ignored) return;
  if (gesture && gesture.kind === 'pinch') { updatePinch(); return; }
  if (gesture && gesture.kind === 'pan' && gesture.id === e.pointerId) {
    S.view = { ...S.view, ox: gesture.view.ox + last[0] - gesture.start[0], oy: gesture.view.oy + last[1] - gesture.start[1] };
    requestDraw(); return;
  }
  if (action && action.id === e.pointerId) for (const ev of list) moveAction(screenPt(ev));
});

function endPointer(e, cancelled) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!p) return;
  if (gesture && gesture.kind === 'pinch' && gesture.ids.includes(e.pointerId)) { gesture = null; return; }
  if (gesture && gesture.kind === 'pan' && gesture.id === e.pointerId) { gesture = null; return; }
  if (action && action.id === e.pointerId) { if (cancelled) cancelAction(); else endAction(screenPt(e)); }
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(screenPt(e), Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, dialog')) return;
  if (e.key === ' ') spaceDown = true;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.size) deleteSelection();
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

function startPan(id, pt) { gesture = { kind: 'pan', id, start: pt, view: { ...S.view } }; }
function startPinch() {
  const ids = [...pointers.entries()].filter(([, p]) => !p.ignored).slice(0, 2).map(([id]) => id);
  if (ids.length < 2) return;
  const [a, b] = ids.map((id) => pointers.get(id));
  gesture = { kind: 'pinch', ids, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid0: [(a.x + b.x) / 2, (a.y + b.y) / 2], view: { ...S.view } };
}
function updatePinch() {
  const [a, b] = gesture.ids.map((id) => pointers.get(id));
  if (!a || !b) return;
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  const v = gesture.view, scale = clamp(v.scale * d / gesture.d0, 0.3, 80);
  const w = [(gesture.mid0[0] - v.ox) / v.scale, (gesture.mid0[1] - v.oy) / v.scale];
  S.view = { scale, ox: mid[0] - w[0] * scale, oy: mid[1] - w[1] * scale };
  requestDraw();
}

function hoverCursor(pt) {
  live = { cursor: pt, cursorR: S.tool === 'width' ? S.opts.brushPx : S.opts.brushPx, cursorColor: S.tool === 'width' ? '#3df2ff' : '#ff4fa3' };
  requestDraw();
  clearTimeout(hoverCursor.t);
  hoverCursor.t = setTimeout(() => { if (!action) { live = null; requestDraw(); } }, 900);
}

function cancelAction() {
  clearTimeout(longPress);
  if (action && action.before) { S.doc = normalizeDoc(JSON.parse(action.before)); refresh(); }
  action = null; live = null;
  requestDraw();
}

const reachCells = () => Math.max(4, 40 / S.view.scale);

function startAction(e, pt) {
  const w = toWorldPx(S.view, pt);
  action = { id: e.pointerId, pointerType: e.pointerType, t0: performance.now(), start: pt, last: pt, travel: 0, kind: null };
  const tool = S.tool, mode = S.mode[tool];
  // Long-press any unlocked stamp: its properties sheet.
  const pressed = tool !== 'lane' && tool !== 'width' ? hitStamp(pt) : null;
  if (pressed) {
    longPress = setTimeout(() => {
      if (action && action.travel < 10) {
        const id = pressed.stamp.id;
        cancelAction();
        S.sel = new Set([id]);
        buzz([12, 30, 12]);
        openProps(id);
      }
    }, 520);
  }
  if (tool === 'lane') {
    if (!layerOpen('lane')) { toast('The lane layer is hidden or locked.', 'bad'); action = null; return; }
    if (mode === 'draw') { action.kind = 'lane'; action.raw = [w]; }
    else if (mode === 'erase') { action.kind = 'erase-lane'; action.brush = [w]; }
    else action.kind = 'tap';
  } else if (tool === 'width') {
    if (!D.closed) { toast('Close the lane loop first, then brush its width.', 'bad'); action = null; return; }
    action.kind = 'width'; action.hits = []; addWidthHit(w);
  } else if (['obstacles', 'shards', 'landmarks', 'hazards', 'notes'].includes(tool)) {
    if (!layerOpen(tool)) { toast(`The ${LAYERS[tool].label.toLowerCase()} layer is hidden or locked.`, 'bad'); action = null; return; }
    if (mode === 'erase') { action.kind = 'erase'; action.layer = tool; action.brush = [w]; }
    else if (mode === 'text') action.kind = 'tap';
    else { action.kind = 'pen'; action.layer = tool; action.raw = [w]; }
  } else if (tool === 'stamp' || tool === 'select') {
    const handle = hitHandle(pt);
    // Stamp mode only picks up stamps (so you can stamp inside a zone); Select picks strokes too.
    const onStamp = hitStamp(pt), onStroke = onStamp || tool === 'stamp' ? null : hitStroke(pt);
    if (handle && handle.kind === 'locked' && S.box && S.box.stamp) {
      showHint(`${STAMP_TYPES[S.box.stamp.type].label}: ${sizeLabel(S.box.stamp.type, S.box.stamp.size, D.gameWidth)}.`);
      buzz(4);
      action.kind = 'none';
    } else if (handle && S.box && S.box.stamp) {
      action.kind = handle.kind; action.stampId = S.box.stamp.id; action.before = snapshot();
      action.center = toScreen(S.view, worldOf([S.box.stamp.x, S.box.stamp.y]));
      action.size0 = trueStampSize(S.box.stamp, D.gameWidth); action.rot0 = S.box.stamp.rotation;
      action.a0 = Math.atan2(pt[1] - action.center[1], pt[0] - action.center[0]);
      action.d0 = Math.hypot(pt[0] - action.center[0], pt[1] - action.center[1]) || 1;
    } else if (onStamp || onStroke) {
      const id = onStamp ? onStamp.stamp.id : onStroke.stroke.id;
      if (!S.sel.has(id)) S.sel = new Set([id]);
      action.kind = 'move'; action.before = snapshot(); action.w0 = w; action.moved = false;
      requestDraw();
    } else if (tool === 'select') {
      action.kind = 'lasso'; action.raw = [w];
    } else {
      action.kind = 'tap';
    }
  }
}

function moveAction(pt) {
  if (!action) return;
  action.travel = Math.max(action.travel, Math.hypot(pt[0] - action.start[0], pt[1] - action.start[1]));
  action.last = pt;
  const w = toWorldPx(S.view, pt);
  const k = action.kind;
  if (k === 'lane' || k === 'pen' || k === 'lasso') {
    const lastW = action.raw.at(-1);
    if (Math.hypot(w[0] - lastW[0], w[1] - lastW[1]) * S.view.scale < 1.5) return;
    action.raw.push(w);
    if (k === 'lane') liveLane(); else livePen();
  } else if (k === 'erase-lane' || k === 'erase') {
    action.brush.push(w);
    live = { cursor: pt, cursorR: S.opts.brushPx, cursorColor: '#ff4fa3', points: action.brush, color: 'rgba(255,79,163,0.5)', widthPx: S.opts.brushPx * 2 };
    requestDraw();
  } else if (k === 'width') {
    addWidthHit(w);
    liveWidth(pt);
  } else if (k === 'move') {
    if (action.travel < 6 && !action.moved) return;
    action.moved = true;
    const before = JSON.parse(action.before);
    const dx = w[0] - action.w0[0], dy = w[1] - action.w0[1];
    S.doc = normalizeDoc(before);
    moveSelection(dx, dy);
    refresh(); requestDraw();
  } else if (k === 'rotate' || k === 'scale') {
    const c = action.center, doc = normalizeDoc(JSON.parse(action.before));
    const st = doc.stamps.find((s) => s.id === action.stampId);
    if (!st) return;
    if (k === 'rotate') {
      let deg = action.rot0 + (Math.atan2(pt[1] - c[1], pt[0] - c[0]) - action.a0) * 180 / Math.PI;
      if (Math.abs(((deg % 15) + 15) % 15) < 3) deg = Math.round(deg / 15) * 15; // soft snap to 15°
      st.rotation = round(((deg + 540) % 360) - 180, 1);
    } else {
      // Snaps inside the game's range (rocks, clusters) or to 0.05 cells (design intent).
      st.size = snapStampSize(st.type, action.size0 * Math.hypot(pt[0] - c[0], pt[1] - c[1]) / action.d0, D.gameWidth);
    }
    S.doc = doc; refresh(); requestDraw();
    showHint(k === 'rotate' ? `Rotation ${st.rotation}°` : sizeLabel(st.type, st.size, D.gameWidth));
  }
}

function endAction(pt) {
  clearTimeout(longPress);
  const a = action;
  action = null;
  if (!a) return;
  const w = toWorldPx(S.view, pt);
  const tap = a.travel < 10;
  const k = a.kind;
  if (k === 'lane') { if (tap) laneTap(w); else commitLane(a.raw); }
  else if (k === 'erase-lane') commitEraseLane(a.brush);
  else if (k === 'erase') commitErase(a.layer, a.brush);
  else if (k === 'pen') { if (tap) penTap(a.layer, w); else commitPen(a.layer, a.raw); }
  else if (k === 'width') commitWidth(a.hits);
  else if (k === 'lasso') { if (tap) { S.sel.clear(); } else commitLasso(a.raw); }
  else if (k === 'move' || k === 'rotate' || k === 'scale') {
    if (k === 'move' && !a.moved) {
      S.doc = normalizeDoc(JSON.parse(a.before));
      if (S.tool === 'stamp' && tap) { /* a tap on a stamp in stamp mode just selects it */ }
    } else {
      if (k === 'move') snapSelection();
      if (pushUndo(a.before)) { changed(); buzz(6); }
    }
  } else if (k === 'tap') {
    if (S.tool === 'lane') laneTap(w);
    else if (S.tool === 'notes') askText(w);
    else if (S.tool === 'stamp' && tap) placeStamp(w);
  }
  live = null;
  refresh();
  updateChrome();
  requestDraw(true);
}

// ------------------------------------------------------------------ lane tool

let liveTimer = 0;
function liveLane() {
  const raw = action.raw;
  const base = G.clampWidth(S.doc.width.base);
  const pts = G.smoothStroke(raw, { strength: S.opts.smooth, spacing: 1 });
  const samples = toSamples(pts, base);
  live = { ribbon: samples, hideLane: !S.doc.lane.points.length, markers: live && live.markers };
  // While drawing: pink markers for overlaps and too-tight turns (throttled), a ring when the loop can close.
  const now = performance.now();
  if (now - liveTimer > 120 && pts.length > 8) {
    liveTimer = now;
    const a = G.analyzeLane(pts, { closed: false, width: base });
    live.markers = [...a.overlaps, ...a.crossings, ...a.tight, ...a.zigzags.map((m) => ({ ...m, soft: true }))];
    if (!S.doc.lane.points.length) {
      const len = G.polylineLength(pts);
      const near = len > reachCells() * 4 && G.dist(pts.at(-1), pts[0]) < reachCells();
      if (near && !action.nearStart) buzz(10);
      action.nearStart = near;
      if (near) showHint('Lift your finger to close the loop.');
      else showHint(`${Math.round(len)} cells${a.overlaps.length ? ` · ${a.overlaps.length} overlap${a.overlaps.length === 1 ? '' : 's'}` : ''}${a.tight.length ? ' · too tight' : ''}`, a.overlaps.length || a.tight.length);
    }
  }
  if (action.nearStart) { live.cursor = toScreen(S.view, pts[0]); live.cursorR = 26; live.cursorColor = '#3df2ff'; }
  requestDraw();
}

function toSamples(pts, w) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: p[0], y: p[1], tx: (b[0] - a[0]) / len, ty: (b[1] - a[1]) / len, w, s: 0 };
  });
}

function laneSpacing(lengthCells) { return Math.max(1.5, lengthCells / 1800); }

function setLaneWorld(doc, pts, closed, { keepStartAt = null } = {}) {
  let outside = 0;
  const page = pts.map((p) => { const q = worldToPage(doc, p); if (q[0] < 0 || q[0] > 1 || q[1] < 0 || q[1] > 1) outside++; return pageOf(p); });
  let start = 0;
  if (keepStartAt) {
    let bd = Infinity;
    page.forEach((p, i) => { const d = G.dist(worldOf(p), keepStartAt); if (d < bd) { bd = d; start = i; } });
  }
  doc.lane = { points: page, closed: closed && page.length >= 4, start };
  if (outside) toast('Part of the lane was off the page and was pulled in. A bigger page: Track settings.', 'bad');
}

function commitLane(raw) {
  const reach = reachCells();
  const doc = S.doc;
  const spacing = laneSpacing(G.polylineLength(raw));
  let pts = G.smoothStroke(raw, { strength: S.opts.smooth, spacing });
  if (pts.length < 3 || G.polylineLength(pts) < 8) return;
  const lane = D.lane;
  if (!lane.length) {
    const c = G.autoClose(pts, reach);
    mutate((d) => setLaneWorld(d, c.points, c.closed));
    if (c.closed) { buzz([12, 40, 12]); toast('Loop closed. Reshape it by drawing over the lane.', 'ok'); }
    else showHint('Keep drawing from either end to close the loop.');
    return;
  }
  if (!D.closed) {
    const A = lane[0], B = lane.at(-1);
    let merged = null;
    if (G.dist(pts[0], B) < reach) merged = [...lane, ...pts];
    else if (G.dist(pts[0], A) < reach) merged = [...[...pts].reverse(), ...lane];
    else if (G.dist(pts.at(-1), B) < reach) merged = [...lane, ...[...pts].reverse()];
    else if (G.dist(pts.at(-1), A) < reach) merged = [...pts, ...lane];
    if (!merged) { toast('Start (or end) on an open end of the lane. To start over: Clear lane.', 'bad'); return; }
    const total = G.polylineLength(merged);
    const closes = total > reach * 4 && G.dist(merged[0], merged.at(-1)) < reach;
    const out = G.smoothStroke(merged, { strength: 'low', spacing: laneSpacing(total), closed: closes });
    mutate((d) => setLaneWorld(d, out, closes));
    if (closes) { buzz([12, 40, 12]); toast('Loop closed.', 'ok'); }
    return;
  }
  const reshaped = G.reshapeLane(lane, pts, reach);
  if (!reshaped) { toast('To reshape, start and end your stroke on the lane.', 'bad'); return; }
  const startAt = [D.start.x, D.start.y];
  const out = G.smoothStroke(reshaped, { strength: 'low', spacing: laneSpacing(G.polylineLength(reshaped, true)), closed: true });
  mutate((d) => setLaneWorld(d, out, true, { keepStartAt: startAt }));
  toast('Reshaped.', 'ok');
}

function commitEraseLane(brush) {
  if (D.lane.length < 2) return;
  const r = S.opts.brushPx / S.view.scale;
  const res = G.eraseLane(D.lane, D.closed, brush, r);
  if (res.points.length === D.lane.length) return;
  mutate((d) => setLaneWorld(d, res.points, false));
  showHint('Lane opened. Draw from an open end to join it up again.');
}

function laneTap(w) {
  if (S.mode.lane !== 'start') return;
  const q = laneNear(w, 40 / S.view.scale);
  if (!q) { toast('Tap on the lane to move the start.', 'bad'); return; }
  let best = 0, bd = Infinity;
  D.lane.forEach((p, i) => { const d = G.dist(p, [q.x, q.y]); if (d < bd) { bd = d; best = i; } });
  mutate((d) => { d.lane.start = best; d.stamps = d.stamps.filter((s) => s.type !== 'start'); });
  toast('Start moved.', 'ok');
}

function autoStart() {
  if (!D.closed || !D.analysis) { toast('Close the loop first.', 'bad'); return; }
  const s = G.autoStartDistance(D.analysis);
  let best = 0, bd = Infinity;
  D.cum.slice(0, D.lane.length).forEach((c, i) => { const d = Math.abs(c - s); if (d < bd) { bd = d; best = i; } });
  mutate((d) => { d.lane.start = best; d.stamps = d.stamps.filter((st) => st.type !== 'start'); });
  toast('Start placed on the longest straight.', 'ok');
}

function reverseLane() {
  if (D.lane.length < 2) return;
  mutate((d) => {
    const n = d.lane.points.length, start = d.lane.start;
    d.lane.points = [...d.lane.points].reverse();
    d.lane.start = n - 1 - start;
    d.width.spans = d.width.spans.map((sp) => ({ ...sp, from: ((1 - sp.from - sp.len) % 1 + 1) % 1 }));
  });
  toast('Race direction reversed.', 'ok');
}

function closeLoopNow() {
  if (D.closed || D.lane.length < 4) return;
  const total = G.polylineLength(D.lane);
  const out = G.smoothStroke(D.lane, { strength: 'low', spacing: laneSpacing(total), closed: true });
  mutate((d) => setLaneWorld(d, out, true));
  toast('Loop closed with a straight join.', 'ok');
}

// ------------------------------------------------------------------ width tool

function addWidthHit(w) {
  const reach = S.opts.brushPx / S.view.scale + G.clampWidth(S.doc.width.base) / 2;
  const q = laneNear(w, reach);
  if (q) action.hits.push(q.s);
}

function liveWidth(pt) {
  const st = action.hits.length ? G.coveredStretch(action.hits, D.lap) : null;
  const band = [];
  if (st) {
    const len = ((st.s1 - st.s0) % D.lap + D.lap) % D.lap;
    for (let s = 0; s <= len; s += 1) { const p = G.pointAt(D.lane, D.cum, st.s0 + s, true); band.push([p.x, p.y]); }
  }
  live = { cursor: pt, cursorR: S.opts.brushPx, cursorColor: '#3df2ff', band, bandWidth: S.opts.brushW };
  showHint(`Width ${S.opts.brushW.toFixed(1)} cells over ${band.length} cells of lane`);
  drawGraph();
  requestDraw();
}

function commitWidth(hits) {
  if (!hits.length) return;
  let st = G.coveredStretch(hits, D.lap);
  const pad = Math.max(2, S.opts.brushPx / S.view.scale);
  if (((st.s1 - st.s0) % D.lap + D.lap) % D.lap < pad * 2) st = { s0: st.s0 - pad, s1: st.s1 + pad };
  mutate((d) => { d.width = G.paintWidthSpan(d.width, st.s0, st.s1, clampLaneWidth(S.opts.brushW), D.lap); });
  toast(`Width ${clampLaneWidth(S.opts.brushW).toFixed(1)} painted.`, 'ok');
}

// ------------------------------------------------------------------ pens and erasers

function livePen() {
  const layer = action.layer;
  const pts = action.raw;
  live = { points: pts, color: PEN[layer], widthPx: 3, closed: layer === 'hazards', fill: layer === 'hazards' ? 'rgba(255,154,61,0.15)' : null };
  if (action.kind === 'lasso') Object.assign(live, { color: '#3df2ff', dash: true, closed: true, fill: 'rgba(61,242,255,0.06)' });
  requestDraw();
}

function commitPen(layer, raw) {
  const closed = layer === 'hazards';
  const pts = G.smoothStroke(raw, { strength: 'low', spacing: 0.8, closed });
  if (pts.length < 2) return;
  const stroke = { id: uid('k'), layer, points: pts.map(pageOfFree), closed };
  if (layer === 'obstacles') Object.assign(stroke, { type: S.opts.obstacleType, spacing: S.opts.obstacleSpacing, size: S.opts.obstacleSize, behavior: S.opts.obstacleBehavior });
  if (layer === 'shards') stroke.spacing = S.opts.shardSpacing;
  if (layer === 'hazards') stroke.type = S.opts.zoneType;
  mutate((d) => d.strokes.push(stroke));
  if (layer === 'obstacles') toast(`${G.pointsAlong(pts, stroke.spacing).length} × ${OBSTACLE_LABEL[stroke.type].toLowerCase()} along your stroke.`, 'ok');
  else if (layer === 'shards') toast(`${G.pointsAlong(pts, stroke.spacing).length} shards along your stroke.`, 'ok');
  else if (layer === 'landmarks') askLabel(stroke.id, 'Name this landmark (optional)');
}

function penTap(layer, w) {
  if (layer === 'obstacles') addStamp(S.opts.obstacleType, w, { behavior: S.opts.obstacleBehavior, size: S.opts.obstacleSize });
  else if (layer === 'shards') addStamp('shard', w);
  else if (layer === 'landmarks') addStamp('landmark', w);
  else if (layer === 'notes') askText(w);
  else toast('Draw around an area to paint a zone.', 'bad');
}

function commitErase(layer, brush) {
  const r = S.opts.brushPx / S.view.scale;
  const near = (p) => brush.some((b) => G.dist(p, b) <= r);
  const strokes = D.strokes.filter(({ stroke, world }) => stroke.layer === layer && (world.some(near) || (stroke.layer === 'hazards' && brush.some((b) => G.pointInPolygon(world, b))))).map(({ stroke }) => stroke.id);
  const stamps = D.stamps.filter(({ stamp, world, layer: l }) => l === layer && near(world)).map(({ stamp }) => stamp.id);
  if (!strokes.length && !stamps.length) return;
  mutate((d) => {
    d.strokes = d.strokes.filter((s) => !strokes.includes(s.id));
    d.stamps = d.stamps.filter((s) => !stamps.includes(s.id));
  });
  toast(`Erased ${strokes.length + stamps.length}.`, 'ok');
}

// ------------------------------------------------------------------ stamps and selection

function snapWorld(w, mode = S.opts.snap) {
  if (mode === 'off') return w;
  return G.snapPoint(w, mode, { lane: D.lane.length >= 2 ? D.lane : null, closed: D.closed, profile: S.doc.width, grid: 5 });
}

function addStamp(type, w, extra = {}) {
  const def = STAMP_TYPES[type];
  const layer = def.layer;
  if (!layerOpen(layer)) { toast(`The ${LAYERS[layer].label.toLowerCase()} layer is hidden or locked.`, 'bad'); return null; }
  const at = snapWorld(w);
  // New stamps start at their in-game size (gates and the start line: the lane width the game flies).
  const asked = extra.size ?? (S.tool === 'stamp' && S.opts.stampSize ? S.opts.stampSize : defaultStampSize(type, D.gameWidth, def.size));
  const size = snapStampSize(type, asked, D.gameWidth);
  const make = (p) => {
    const s = { id: uid('s'), type, x: 0, y: 0, rotation: 0, behavior: 'static', ...extra, size };
    [s.x, s.y] = pageOfFree(p);
    // Gates and the start line sit across the lane.
    if ((type === 'gate' || type === 'start' || type === 'barricade') && D.lane.length >= 2) {
      const q = G.nearestOnPolyline(D.lane, p, D.closed, D.cum);
      if (q) s.rotation = round(Math.atan2(q.ty, q.tx) * 180 / Math.PI + (type === 'barricade' ? 90 : 0), 1);
    }
    return s;
  };
  const made = [make(at)];
  if (S.tool === 'stamp' && S.opts.mirror && D.lane.length >= 2 && type !== 'start') made.push(make(G.mirrorAcrossLane(at, D.lane, D.closed)));
  mutate((d) => {
    if (type === 'start') d.stamps = d.stamps.filter((s) => s.type !== 'start');
    d.stamps.push(...made);
  });
  S.sel = new Set([made[0].id]);
  requestDraw();
  return made[0];
}

function placeStamp(w) {
  const type = S.opts.stampType;
  if (type === 'request') { openRequest(w); return; }
  const s = addStamp(type, w);
  if (s && (type === 'landmark' || type === 'star')) askLabel(s.id, type === 'star' ? 'What is this star? (optional)' : 'Name this landmark (optional)');
}

function moveSelection(dx, dy) {
  const d = S.doc;
  for (const s of d.stamps) if (S.sel.has(s.id)) { const w = worldOf([s.x, s.y]); [s.x, s.y] = pageOfFree([w[0] + dx, w[1] + dy]); }
  for (const s of d.strokes) if (S.sel.has(s.id)) s.points = s.points.map((p) => { const w = worldOf(p); return pageOfFree([w[0] + dx, w[1] + dy]); });
}

function snapSelection() {
  if (S.opts.snap === 'off') return;
  for (const s of S.doc.stamps) if (S.sel.has(s.id)) { const w = snapWorld(worldOf([s.x, s.y])); [s.x, s.y] = pageOfFree(w); }
}

function commitLasso(raw) {
  if (raw.length < 3) return;
  const inside = (p) => G.pointInPolygon(raw, p);
  const ids = [];
  for (const { stamp, world, layer } of D.stamps) if (layerOpen(layer) && inside(world)) ids.push(stamp.id);
  for (const { stroke, world } of D.strokes) if (layerOpen(stroke.layer) && world.length && world.filter(inside).length >= world.length / 2) ids.push(stroke.id);
  S.sel = new Set(ids);
  buzz(6);
  toast(ids.length ? `${ids.length} selected.` : 'Nothing inside the lasso.', ids.length ? 'ok' : 'bad');
  renderSub();
}

function deleteSelection() {
  if (!S.sel.size) return;
  const n = S.sel.size;
  mutate((d) => { d.stamps = d.stamps.filter((s) => !S.sel.has(s.id)); d.strokes = d.strokes.filter((s) => !S.sel.has(s.id)); });
  S.sel.clear();
  toast(`Deleted ${n}. Undo brings it back.`, 'ok');
  renderSub();
}

function duplicateSelection() {
  if (!S.sel.size) return;
  const off = 4;
  const ids = new Set();
  mutate((d) => {
    for (const s of d.stamps.filter((x) => S.sel.has(x.id))) { const c = { ...s, id: uid('s') }; const w = worldOf([s.x, s.y]); [c.x, c.y] = pageOfFree([w[0] + off, w[1] + off]); delete c.requestId; d.stamps.push(c); ids.add(c.id); }
    for (const s of d.strokes.filter((x) => S.sel.has(x.id))) { const c = { ...s, id: uid('k'), points: s.points.map((p) => { const w = worldOf(p); return pageOfFree([w[0] + off, w[1] + off]); }) }; d.strokes.push(c); ids.add(c.id); }
  });
  S.sel = ids;
  renderSub();
}

function mirrorSelection(kind) {
  if (!S.sel.size) return;
  if (kind === 'lane' && D.lane.length < 2) { toast('Draw the lane first.', 'bad'); return; }
  const ids = new Set();
  mutate((d) => {
    if (kind === 'lane') {
      // A mirrored copy on the other side of the centre line, same lap position.
      for (const s of d.stamps.filter((x) => S.sel.has(x.id))) { const c = { ...s, id: uid('s') }; [c.x, c.y] = pageOfFree(G.mirrorAcrossLane(worldOf([s.x, s.y]), D.lane, D.closed)); c.rotation = round(-s.rotation, 1); delete c.requestId; d.stamps.push(c); ids.add(c.id); }
      for (const s of d.strokes.filter((x) => S.sel.has(x.id))) { const c = { ...s, id: uid('k'), points: s.points.map((p) => pageOfFree(G.mirrorAcrossLane(worldOf(p), D.lane, D.closed))) }; d.strokes.push(c); ids.add(c.id); }
    } else {
      // Flip in place, left to right about the selection's centre.
      const pts = [];
      for (const s of d.stamps) if (S.sel.has(s.id)) pts.push(worldOf([s.x, s.y]));
      for (const s of d.strokes) if (S.sel.has(s.id)) pts.push(...s.points.map(worldOf));
      const b = G.bounds([pts]), cx = (b.minX + b.maxX) / 2;
      for (const s of d.stamps) if (S.sel.has(s.id)) { const w = worldOf([s.x, s.y]); [s.x, s.y] = pageOfFree([2 * cx - w[0], w[1]]); s.rotation = round(-s.rotation, 1); ids.add(s.id); }
      for (const s of d.strokes) if (S.sel.has(s.id)) { s.points = s.points.map((p) => { const w = worldOf(p); return pageOfFree([2 * cx - w[0], w[1]]); }); ids.add(s.id); }
    }
  });
  S.sel = ids;
  renderSub();
}

function alignSelection(how) {
  const stamps = S.doc.stamps.filter((s) => S.sel.has(s.id));
  if (!stamps.length || D.lane.length < 2) { toast('Select stamps on a lane first.', 'bad'); return; }
  mutate((d) => {
    const mine = d.stamps.filter((s) => S.sel.has(s.id));
    if (how === 'centre' || how === 'edge') {
      for (const s of mine) [s.x, s.y] = pageOfFree(G.snapPoint(worldOf([s.x, s.y]), how, { lane: D.lane, closed: D.closed, profile: d.width }));
    } else if (how === 'even' && mine.length > 2) {
      const qs = mine.map((s) => ({ s, q: G.nearestOnPolyline(D.lane, worldOf([s.x, s.y]), D.closed, D.cum) })).sort((a, b) => a.q.s - b.q.s);
      const s0 = qs[0].q.s, s1 = qs.at(-1).q.s;
      qs.forEach(({ s, q }, i) => {
        const along = s0 + ((s1 - s0) * i) / (qs.length - 1);
        const p = G.pointAt(D.lane, D.cum, along, D.closed);
        [s.x, s.y] = pageOfFree([p.x - p.ty * q.off, p.y + p.tx * q.off]);
      });
    } else if (how === 'across') {
      for (const s of mine) { const q = G.nearestOnPolyline(D.lane, worldOf([s.x, s.y]), D.closed, D.cum); if (q) s.rotation = round(Math.atan2(q.ty, q.tx) * 180 / Math.PI + 90, 1); }
    }
  });
  toast('Aligned.', 'ok');
}

// ------------------------------------------------------------------ racing line and shard brush

function layShardsOnRacingLine(count) {
  if (!D.closed) { toast('Close the loop first.', 'bad'); return; }
  const line = G.racingLine(D.samples, { iterations: 200 });
  const n = line.length, made = [];
  for (let k = 0; k < count; k++) {
    const p = line[Math.floor(((k + 0.5) / count) * n) % n];
    const s = { id: uid('s'), type: 'shard', x: 0, y: 0, size: STAMP_TYPES.shard.size, rotation: 0, behavior: 'static' };
    [s.x, s.y] = pageOfFree(p);
    made.push(s);
  }
  mutate((d) => d.stamps.push(...made));
  toast(`${count} shards laid on the racing line.`, 'ok');
}

// ------------------------------------------------------------------ checks (validation panel)

function buildChecks() {
  const c = [];
  const d = S.doc;
  const a = D.analysis;
  const add = (level, title, detail = '', at = null) => c.push({ level, title, detail, at });
  if (!D.lane.length) { add('bad', 'No lane yet', 'Pick Lane and draw one loop with your finger.'); return c; }
  if (!D.closed) add('bad', 'The loop is open', 'Draw from an open end back to the other, or tap Close loop.', D.lane.at(-1));
  else add('good', 'Loop closed');
  if (a) {
    if (a.overlaps.length) add('bad', `Lane overlaps itself in ${a.overlaps.length} spot${a.overlaps.length === 1 ? '' : 's'}`, `Stretches more than ${G.GAME.LANE_GAP} cells apart along the lap must not touch. Pull them apart or narrow the lane there.`, [a.overlaps[0].x, a.overlaps[0].y]);
    else add('good', 'No lane overlaps');
    if (a.crossings.length) add('bad', `The centre line crosses itself ${a.crossings.length}×`, 'The game has no bridges yet: redraw the crossing.', [a.crossings[0].x, a.crossings[0].y]);
    if (a.tight.length) add('bad', `${a.tight.length} turn${a.tight.length === 1 ? ' is' : 's are'} too tight for the ship`, `Under about ${G.DESIGN.TIGHT_RADIUS} cells of racing radius the ship has to crawl. Round it off or widen the lane there.`, [a.tight[0].x, a.tight[0].y]);
    if (a.zigzags.length) add('warn', `${a.zigzags.length} razor zig-zag${a.zigzags.length === 1 ? '' : 's'}`, 'Left-right flicks in a few lane widths. Smooth them unless they are the point.', [a.zigzags[0].x, a.zigzags[0].y]);
    if (!a.tight.length && !a.zigzags.length) add('good', 'Every turn is flyable');
    if (a.slowest && Number.isFinite(a.slowest.effective)) {
      add(a.slowest.speed < 5 ? 'warn' : 'good', `Tightest corner: ${a.slowest.effective.toFixed(1)}-cell racing radius`,
        `The ship takes it at about ${a.slowest.speed.toFixed(1)} cells/s (cruise ${G.DESIGN.CRUISE}).`, [a.slowest.x, a.slowest.y]);
    }
    const game = WEEKLY_RULES;
    const wMin = a.minWidth, wMax = a.maxWidth;
    if (wMax > game.MAX_WIDTH) add('warn', `Width up to ${wMax.toFixed(1)} cells: wider than the game allows`, `An older draft. The game's widest is ${game.MAX_WIDTH}; your next edit clamps it to ${game.MAX_WIDTH}.`);
    else if (!D.uniform) add('warn', `Width ${wMin.toFixed(1)}–${wMax.toFixed(1)} cells (design intent)`, `The game flies one width for now: ${D.gameWidth} cells. Variable width needs game work.`);
    else add('good', `Width ${d.width.base} cells`, `Game range ${game.MIN_WIDTH}–${game.MAX_WIDTH}.`);
    const lap = Math.round(D.lap);
    if (D.closed) {
      if (lap < game.MIN_LENGTH) add('bad', `Lap is ${lap} cells: too short`, `At least ${game.MIN_LENGTH}. Draw bigger or make the page bigger (Track settings).`);
      else if (lap > 3000) add('bad', `Lap is ${lap} cells: too long`, 'Keep it under about four Gantry Drops (3,000 cells).');
      else add('good', `Lap ${lap} cells · about ${fmtShort(a.humanMs)} for a good pilot`, `The careful autopilot would take about ${fmtShort(a.pilotMs)}.`);
    }
  }
  const sh = D.shards;
  if (!sh.explicit) add('good', 'Shards: automatic', 'No shards drawn, so the converter lays 8–10. Use the Shards pen to place your own.');
  else if (sh.explicit < G.GAME.MIN_SHARDS) add('warn', `${sh.explicit} shard${sh.explicit === 1 ? '' : 's'}: the game needs at least ${G.GAME.MIN_SHARDS}`, 'The converter will add the rest on the centre line.');
  else if (sh.off.length) add('warn', `${sh.off.length} shard${sh.off.length === 1 ? ' is' : 's are'} out of the ship's reach`,
    `At real size the ship collects a shard within ${SIZES.shardPickup.value} cells of its centre, or by touching it, so a shard must sit within ${shardReach(D.gameWidth).toFixed(2)} cells of the centre line on a ${D.gameWidth}-wide lane. The converter pulls these in (or leaves them out if far off).`, sh.off[0]);
  else add('good', `All ${sh.explicit} shards reachable at real pickup size`, 'Weekly tracks usually have 8–10.');
  if (D.blocked.length) {
    add('bad', `Mines block the whole lane in ${D.blocked.length} spot${D.blocked.length === 1 ? '' : 's'}`,
      `At real size (mines ${(2 * SIZES.mineRadius.value).toFixed(2)} across, the ship ${SIZES.shipWidth.value.toFixed(2)} wide) the widest gap there is ${D.blocked[0].gap.toFixed(2)} cells: the ship cannot get through. Space the row out or leave a gap.`, [D.blocked[0].x, D.blocked[0].y]);
  } else if (D.mines) add('good', 'Every mine row leaves the ship a way through', `Checked at real size: mines ${(2 * SIZES.mineRadius.value).toFixed(2)} across, ship ${SIZES.shipWidth.value.toFixed(2)} wide.`);
  if (D.closed) add('good', `Start/finish ${d.stamps.some((s) => s.type === 'start') ? 'set by your stamp' : 'at your first point'}`,
    `${D.gameLane ? D.gameLane.points.length - 1 : '?'} checkpoints are placed on the corners automatically; a Gate stamp pins another.`, [D.start.x, D.start.y]);
  const g = S.game;
  if (D.closed) {
    if (!g || g.status === 'running') add('warn', 'Game check running…', 'The real converter and autopilot are flying your lane on this phone.');
    else if (g.status === 'error') add('warn', 'Game check could not run here', g.error);
    else if (g.report) {
      const r = g.report;
      if (r.ok) add('good', `Autopilot finished in ${fmtShort(r.pilot.ms)}`, `${r.shards} shards, ${r.mines} mines, ${r.bouncers} rocks, ${r.sentries ?? 0} sentries. Width ${r.width}.`);
      else add('bad', 'The autopilot could not finish', (r.problems || []).join(' '));
      for (const n of [...(r.fixes || []), ...(r.notes || [])]) add('warn', n);
    }
  }
  return c;
}

// ------------------------------------------------------------------ game check (worker)

let worker = null, checkTimer = null, checkId = 0;
function startWorker() {
  try {
    worker = new Worker('/studio/worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.ready || m.id !== checkId) return;
      if (!m.ok) { S.game = { status: 'error', error: m.error }; }
      else {
        let layout = null, offset = [0, 0];
        try { layout = createWeeklyLayout(m.event); offset = D.gameLane ? D.gameLane.toWorld([0, 0]) : [0, 0]; } catch { layout = null; }
        S.game = { status: 'done', report: m.report, event: m.event, intent: m.intent, layout, offset, ms: m.ms };
      }
      D.checks = buildChecks(); updateChrome(); requestDraw(true);
    };
    worker.onerror = () => { S.game = { status: 'error', error: 'This browser cannot run the game check; Make track still checks it on the studio machine.' }; worker = null; D.checks = buildChecks(); updateChrome(); };
  } catch { worker = null; }
}
function scheduleCheck() {
  clearTimeout(checkTimer);
  if (!D.closed) { S.game = null; return; }
  if (S.game) S.game.status = 'running';
  checkTimer = setTimeout(() => {
    if (!worker) startWorker();
    if (!worker) return;
    checkId++;
    S.game = Object.assign(S.game || {}, { status: 'running' });
    worker.postMessage({ id: checkId, doc: S.doc });
  }, 1400);
}

// ------------------------------------------------------------------ autosave

let saveTimer = null, saving = false;
function setSave(text, kind = '') { const el = $('save-state'); el.textContent = text; el.className = 'save' + (kind ? ' ' + kind : ''); }
function scheduleSave() {
  clearTimeout(saveTimer);
  setSave('Edited…');
  saveTimer = setTimeout(saveNow, 1500);
}
async function saveNow() {
  if (saving) { scheduleSave(); return; }
  saving = true;
  setSave('Saving…', 'busy');
  try {
    const out = await api('/studio/api/designs', { design: S.doc });
    if (out.id && out.id !== S.doc.id) { S.doc.id = out.id; store(DOC_KEY, S.doc); }
    setSave('Saved');
  } catch (e) {
    setSave('Offline: on phone', 'bad');
  } finally { saving = false; }
}

// ------------------------------------------------------------------ chrome: dock, sub-toolbar, hints

const HINTS = {
  lane: { draw: 'Draw the centre line. Back near the start closes the loop; draw over the lane to reshape it.', erase: 'Rub out part of the lane, then redraw it.', start: 'Tap the lane where the race starts.' },
  width: { brush: `Brush along the lane to set its width there (the game flies ${WEEKLY_RULES.MIN_WIDTH}–${WEEKLY_RULES.MAX_WIDTH}). The taper blends it into the rest.` },
  obstacles: { pen: 'Draw a row of obstacles, or tap for one.', erase: 'Rub out obstacles.' },
  shards: { pen: 'Draw a line of shards, or tap for one.', erase: 'Rub out shards.' },
  landmarks: { pen: 'Sketch a landmark, or tap to drop a marker.', erase: 'Rub out landmarks.' },
  hazards: { pen: 'Draw round an area to make a hazard zone.', erase: 'Rub out zones.' },
  notes: { pen: 'Scribble your intent; agents read it.', text: 'Tap to pin a text note.', erase: 'Rub out notes.' },
  stamp: { place: 'Tap to place. Drag a stamp to move it; long-press for its properties.' },
  select: { tap: 'Tap to select, or drag a lasso. Drag a selection to move it.' },
};
let hintTimer = null;
function showHint(text, bad = false) {
  const el = $('hint');
  el.textContent = text;
  el.className = 'hint' + (bad ? ' bad' : '');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.textContent = (HINTS[S.tool] || {})[S.mode[S.tool]] || ''; el.className = 'hint'; }, 4000);
}

function setTool(tool) {
  S.tool = tool;
  if (tool !== 'select' && tool !== 'stamp') S.sel.clear();
  document.querySelectorAll('#dock .tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  $('hint').textContent = (HINTS[tool] || {})[S.mode[tool]] || '';
  $('hint').className = 'hint';
  renderSub();
  requestDraw();
}
document.querySelectorAll('#dock .tool').forEach((b) => b.addEventListener('click', () => { setTool(b.dataset.tool); buzz(4); }));

function seg(options, value, onPick, label) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => { onPick(v); buzz(4); renderSub(); } }, text)));
}

/** A slider with begin/commit semantics: live preview while dragging, one undo step on release. */
function slider({ label, min, max, step, value, fmt, onLive, onCommit, gameMax = null }) {
  const shown = clamp(value, min, max);
  const out = h('span', { text: `${label} ${fmt(shown)}` });
  const input = h('input', { type: 'range', min, max, step, value: shown, 'aria-label': label });
  let before = null;
  input.addEventListener('input', () => { if (before === null) before = snapshot(); const v = Number(input.value); out.textContent = `${label} ${fmt(v)}`; onLive(v); });
  input.addEventListener('change', () => { const v = Number(input.value); if (onCommit) onCommit(v, before); before = null; });
  return h('div', { class: 'slider' }, out, input, gameMax != null ? h('b', { class: 'gamemax', title: 'The game cannot fly a wider lane', text: `game max ${gameMax}` }) : null);
}

/** Width sliders stop at the game's widest lane and mark it. */
const WIDTH_RANGE = { min: G.GAME.MIN_WIDTH, max: G.GAME.MAX_WIDTH, step: 0.1, gameMax: G.GAME.MAX_WIDTH };

/**
 * A size control that tells the truth about the game: a locked "fixed in game"
 * label where the game has one size, a slider that snaps inside the game's
 * range where it has one, and a free slider in cells for design intent.
 */
function sizeControl(type, value, { label = 'Size', onLive, onCommit }) {
  const rule = sizeRule(type, D.gameWidth);
  if (rule.kind === 'fixed' || rule.kind === 'lane') return h('span', { class: 'stat locked', text: `${label ? `${label}: ` : ''}${sizeLabel(type, value, D.gameWidth)}` });
  const snap = (v) => snapStampSize(type, v, D.gameWidth);
  return slider({ label, min: rule.min, max: rule.max, step: rule.kind === 'range' ? 0.05 : 0.1, value: snap(value), fmt: (v) => sizeLabel(type, v, D.gameWidth),
    onLive: (v) => onLive(snap(v)), onCommit: onCommit ? (v, before) => onCommit(snap(v), before) : undefined });
}

function docSlider(opts) {
  return slider({
    ...opts,
    onLive: (v) => { opts.apply(S.doc, v); refresh(); requestDraw(); },
    onCommit: (v, before) => { if (before !== null && pushUndo(before)) changed(); },
  });
}

function optSlider(key, opts) {
  return slider({ ...opts, value: S.opts[key], onLive: (v) => { S.opts[key] = v; if (opts.after) opts.after(v); }, onCommit: () => {} });
}

function button(text, onclick, cls = '') { return h('button', { type: 'button', class: cls, onclick: () => { onclick(); buzz(4); } }, text); }

let graphCanvas = null;
function renderSub() {
  const sub = $('sub');
  const kids = [];
  const t = S.tool, m = S.mode[t];
  const setMode = (v) => { S.mode[t] = v; $('hint').textContent = (HINTS[t] || {})[v] || ''; };
  graphCanvas = null;
  if (t === 'lane') {
    kids.push(seg([['draw', 'Draw'], ['erase', 'Eraser'], ['start', 'Set start']], m, setMode, 'Lane mode'));
    kids.push(docSlider({ label: 'Width', ...WIDTH_RANGE, value: S.doc.width.base, fmt: (v) => v.toFixed(1), apply: (d, v) => { d.width.base = round(clampLaneWidth(v), 1); } }));
    kids.push(seg([['low', 'Smooth −'], ['medium', 'Smooth'], ['high', 'Smooth +']], S.opts.smooth, (v) => { S.opts.smooth = v; }, 'Smoothing'));
    if (D.lane.length && !D.closed) kids.push(button('Close loop', closeLoopNow, 'attn'));
    kids.push(button('Auto start', autoStart), button('Reverse', reverseLane));
    kids.push(button('Clear lane', () => { if (D.lane.length) { mutate((d) => { d.lane = { points: [], closed: false, start: 0 }; d.width.spans = []; }); toast('Lane cleared. Undo brings it back.', 'ok'); } }, 'danger'));
  } else if (t === 'width') {
    graphCanvas = h('canvas', { class: 'graph', 'aria-label': 'Width along the lap' });
    kids.push(graphCanvas);
    S.opts.brushW = clampLaneWidth(S.opts.brushW);
    kids.push(optSlider('brushW', { label: 'Brush', ...WIDTH_RANGE, fmt: (v) => v.toFixed(1) }));
    kids.push(docSlider({ label: 'Taper', min: 0, max: 120, step: 1, value: S.doc.width.taper, fmt: (v) => `${v} cells`, apply: (d, v) => { d.width.taper = v; } }));
    kids.push(docSlider({ label: 'Base', ...WIDTH_RANGE, value: S.doc.width.base, fmt: (v) => v.toFixed(1), apply: (d, v) => { d.width.base = round(clampLaneWidth(v), 1); } }));
    kids.push(optSlider('brushPx', { label: 'Brush size', min: 12, max: 80, step: 2, fmt: (v) => `${v}px` }));
    kids.push(button('Reset widths', () => mutate((d) => { d.width.spans = []; })));
  } else if (t === 'obstacles') {
    kids.push(seg([['pen', 'Pen'], ['erase', 'Eraser']], m, setMode, 'Obstacle mode'));
    kids.push(seg(OBSTACLE_TYPES.map((k) => [k, OBSTACLE_LABEL[k]]), S.opts.obstacleType, (v) => { S.opts.obstacleType = v; S.opts.obstacleSize = defaultStampSize(v, D.gameWidth, STAMP_TYPES[v].size); }, 'Obstacle type'));
    kids.push(optSlider('obstacleSpacing', { label: 'Spacing', min: 1, max: 30, step: 0.5, fmt: (v) => `${v} cells` }));
    kids.push(sizeControl(S.opts.obstacleType, S.opts.obstacleSize, { onLive: (v) => { S.opts.obstacleSize = v; } }));
    kids.push(seg(Object.entries(BEHAVIORS).filter(([k]) => k !== 'triggered').map(([k, v]) => [k, v.split(' ')[0]]), S.opts.obstacleBehavior, (v) => { S.opts.obstacleBehavior = v; }, 'Behaviour'));
    const inGame = STAMP_TYPES[S.opts.obstacleType].game && (S.opts.obstacleBehavior === 'static' || (S.opts.obstacleType === 'rock' && S.opts.obstacleBehavior === 'moving'));
    kids.push(h('span', { class: 'stat' + (inGame ? ' ok' : ''), text: inGame ? 'In game' : 'Design intent (not in game yet)' }));
  } else if (t === 'shards') {
    kids.push(seg([['pen', 'Pen'], ['erase', 'Eraser']], m, setMode, 'Shard mode'));
    kids.push(optSlider('shardSpacing', { label: 'Spacing', min: 2, max: 60, step: 1, fmt: (v) => `${v}` }));
    kids.push(h('button', { type: 'button', 'aria-pressed': String(S.opts.showRacing), onclick: () => { S.opts.showRacing = !S.opts.showRacing; refresh(); renderSub(); requestDraw(); } }, 'Racing line'));
    kids.push(button('Lay 8 on racing line', () => layShardsOnRacingLine(8)));
    const n = D.shards.explicit;
    kids.push(h('span', { class: 'stat' + (n && n < G.GAME.MIN_SHARDS ? ' bad' : n ? ' ok' : ''), text: n ? `Shards ${D.shards.onLane}/${n} · need ≥${G.GAME.MIN_SHARDS}` : 'Shards: auto (8–10)' }));
  } else if (t === 'landmarks') {
    kids.push(seg([['pen', 'Pen'], ['erase', 'Eraser']], m, setMode, 'Landmark mode'));
    kids.push(button('Landmark stamp', () => { S.opts.stampType = 'landmark'; setTool('stamp'); }));
    kids.push(button('Star stamp', () => { S.opts.stampType = 'star'; setTool('stamp'); }));
  } else if (t === 'hazards') {
    kids.push(seg([['pen', 'Paint'], ['erase', 'Eraser']], m, setMode, 'Zone mode'));
    kids.push(seg(Object.entries(ZONE_TYPES).map(([k, v]) => [k, v]), S.opts.zoneType, (v) => { S.opts.zoneType = v; }, 'Zone type'));
    kids.push(h('span', { class: 'stat', text: 'Design intent (not in game yet)' }));
  } else if (t === 'notes') {
    kids.push(seg([['pen', 'Pen'], ['text', 'Text'], ['erase', 'Eraser']], m, setMode, 'Note mode'));
    kids.push(button('Request something new', () => openRequest(null)));
  } else if (t === 'stamp') {
    kids.push(h('div', { class: 'seg palette', role: 'group', 'aria-label': 'Stamp type' },
      STAMP_PALETTE.map((k) => h('button', { type: 'button', 'aria-pressed': String(S.opts.stampType === k), onclick: () => { S.opts.stampType = k; S.opts.stampSize = null; buzz(4); renderSub(); } },
        h('i', { class: 'swatch', style: `background:${PEN[STAMP_TYPES[k].layer]}` }), k === 'request' ? 'Request new (?)' : STAMP_TYPES[k].label))));
    const type = S.opts.stampType;
    kids.push(sizeControl(type, S.opts.stampSize ?? defaultStampSize(type, D.gameWidth, STAMP_TYPES[type].size), { onLive: (v) => { S.opts.stampSize = v; } }));
    kids.push(seg([['off', 'Snap off'], ['centre', 'Centre'], ['edge', 'Edge'], ['grid', 'Grid']], S.opts.snap, (v) => { S.opts.snap = v; }, 'Snap'));
    kids.push(h('button', { type: 'button', 'aria-pressed': String(S.opts.mirror), onclick: () => { S.opts.mirror = !S.opts.mirror; renderSub(); } }, 'Mirror'));
    if (S.sel.size === 1) kids.push(button('Properties', () => openProps([...S.sel][0])));
  } else if (t === 'select') {
    kids.push(h('span', { class: 'stat', text: S.sel.size ? `${S.sel.size} selected` : 'Nothing selected' }));
    if (S.sel.size) {
      kids.push(button('Duplicate', duplicateSelection), button('Delete', deleteSelection, 'danger'));
      kids.push(button('Mirror across lane', () => mirrorSelection('lane')), button('Flip', () => mirrorSelection('flip')));
      kids.push(button('Snap to centre', () => alignSelection('centre')), button('Snap to edge', () => alignSelection('edge')));
      kids.push(button('Space evenly', () => alignSelection('even')), button('Turn across lane', () => alignSelection('across')));
      if (S.sel.size === 1) kids.push(button('Properties', () => openProps([...S.sel][0])));
      kids.push(button('Clear selection', () => { S.sel.clear(); renderSub(); requestDraw(); }));
    }
    kids.push(seg([['off', 'Snap off'], ['centre', 'Centre'], ['edge', 'Edge'], ['grid', 'Grid']], S.opts.snap, (v) => { S.opts.snap = v; }, 'Snap'));
  }
  sub.replaceChildren(...kids);
  if (graphCanvas) requestAnimationFrame(drawGraph);
}

/** The width profile as a mini graph: width along the lap, the game's 5.8–8 band, the brush stretch. */
function drawGraph() {
  const c = graphCanvas;
  if (!c || !c.isConnected) return;
  const w = c.clientWidth, hgt = c.clientHeight, r = Math.min(globalThis.devicePixelRatio || 1, 2);
  c.width = Math.round(w * r); c.height = Math.round(hgt * r);
  const g = c.getContext('2d');
  g.setTransform(r, 0, 0, r, 0, 0);
  g.clearRect(0, 0, w, hgt);
  if (!D.closed) { g.fillStyle = '#9aa7b4'; g.font = '16px system-ui, sans-serif'; g.fillText('Close the loop first', 10, hgt / 2 + 6); return; }
  const ws = G.widthSamples(S.doc.width, D.lap, Math.max(40, Math.round(w)));
  const lo = G.GAME.MIN_WIDTH - 0.5, hi = Math.max(G.GAME.MAX_WIDTH + 1, ...ws) + 0.5;
  const y = (v) => hgt - 4 - ((v - lo) / (hi - lo)) * (hgt - 8);
  g.fillStyle = 'rgba(61,242,255,0.08)';
  g.fillRect(0, y(G.GAME.MAX_WIDTH), w, y(G.GAME.MIN_WIDTH) - y(G.GAME.MAX_WIDTH));
  if (action && action.kind === 'width' && action.hits.length) {
    const st = G.coveredStretch(action.hits, D.lap);
    g.fillStyle = 'rgba(61,242,255,0.18)';
    const x0 = (st.s0 / D.lap) * w, x1 = (st.s1 / D.lap) * w;
    if (x1 >= x0) g.fillRect(x0, 0, x1 - x0, hgt); else { g.fillRect(x0, 0, w - x0, hgt); g.fillRect(0, 0, x1, hgt); }
  }
  g.beginPath();
  ws.forEach((v, i) => { const x = (i / (ws.length - 1)) * w; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); });
  g.strokeStyle = '#3df2ff'; g.lineWidth = 2; g.stroke();
  const sx = ((D.cum[S.doc.lane.start] || 0) / D.lap) * w;
  g.strokeStyle = '#e8eef4'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, hgt); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#9aa7b4'; g.font = '16px system-ui, sans-serif';
  g.fillText(`${Math.min(...ws).toFixed(1)}–${Math.max(...ws).toFixed(1)}`, 6, 18);
}

function updateChrome() {
  $('doc-title').textContent = S.doc.title || 'Untitled track';
  $('undo').disabled = !S.undo.length;
  $('redo').disabled = !S.redo.length;
  const bad = (D.checks || []).filter((c) => c.level === 'bad').length;
  const badge = $('check-badge');
  badge.hidden = !bad; badge.textContent = String(bad);
  $('check-btn').classList.toggle('ok', !bad && D.closed);
  $('check-btn').setAttribute('aria-label', bad ? `Checks: ${bad} problem${bad === 1 ? '' : 's'}` : 'Checks: all good');
  $('game-btn').setAttribute('aria-pressed', String(S.showGame));
  if ($('dlg-check').open) renderChecks();
  if ($('dlg-layers').open) renderLayers();
  if (graphCanvas) drawGraph();
}

// ------------------------------------------------------------------ small sheets: ask text, labels

function openDialog(id) { const d = $(id); if (!d.open) d.showModal(); return d; }
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
});

function ask(title, { value = '', placeholder = '', multiline = false, ok = 'Save' } = {}) {
  return new Promise((resolve) => {
    $('dlg-ask-h').textContent = title;
    const input = multiline ? h('textarea', { rows: '3', maxlength: '140', placeholder }) : h('input', { type: 'text', maxlength: '80', placeholder, autocomplete: 'off' });
    input.value = value;
    const dlg = $('dlg-ask');
    let done = false;
    const finish = (v) => { if (done) return; done = true; dlg.close(); resolve(v); };
    $('ask-body').replaceChildren(input, h('div', { class: 'row end' }, button('Skip', () => finish(null)), h('button', { type: 'button', class: 'primary', onclick: () => finish(input.value.trim()) }, ok)));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) finish(input.value.trim()); });
    dlg.addEventListener('close', () => finish(null), { once: true });
    openDialog('dlg-ask');
    setTimeout(() => input.focus(), 50);
  });
}

async function askLabel(id, title) {
  const v = await ask(title, { placeholder: 'Food court, broken escalator…' });
  if (v) mutate((d) => { const it = d.stamps.find((s) => s.id === id) || d.strokes.find((s) => s.id === id); if (it) it.label = v.slice(0, 80); });
}

async function askText(w) {
  const v = await ask('Text note', { multiline: true, placeholder: 'Shops fly by here, a store you burst through…', ok: 'Pin it' });
  if (v) addStamp('text', w, { note: v.slice(0, 140) });
}

// ------------------------------------------------------------------ properties sheet

function openProps(id) {
  const st = S.doc.stamps.find((s) => s.id === id);
  const sk = st ? null : S.doc.strokes.find((s) => s.id === id);
  if (!st && !sk) return;
  const body = $('props-body');
  const edit = (fn) => mutate((d) => { const it = d.stamps.find((s) => s.id === id) || d.strokes.find((s) => s.id === id); if (it) fn(it); }, { quiet: true });
  const kids = [];
  if (st) {
    const def = STAMP_TYPES[st.type];
    $('dlg-props-h').textContent = def.label;
    kids.push(h('p', { class: 'muted', text: `Layer: ${LAYERS[def.layer].label}. ${def.game ? 'The game supports it today.' : 'Design intent: not in the game yet.'}` }));
    kids.push(h('label', { text: 'Type' }), h('div', { class: 'chips' }, STAMP_PALETTE.filter((k) => k !== 'request').map((k) =>
      h('button', { type: 'button', 'aria-pressed': String(st.type === k), onclick: () => { edit((it) => { it.type = k; it.size = defaultStampSize(k, D.gameWidth, STAMP_TYPES[k].size); }); openProps(id); } }, STAMP_TYPES[k].label))));
    kids.push(h('label', { text: 'Size' }), propSize(st.type, st.size, id));
    kids.push(propSlider('Rotation (°)', -180, 180, 1, st.rotation, (it, v) => { it.rotation = v; }, id));
    kids.push(h('label', { text: 'Behaviour' }), h('div', { class: 'chips' }, Object.entries(BEHAVIORS).filter(([k]) => k !== 'triggered').map(([k, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(st.behavior === k), onclick: () => { edit((it) => { it.behavior = k; }); openProps(id); } }, label))));
    if (st.behavior !== 'static') kids.push(propSlider('Timing: period (s)', 0.2, 20, 0.1, st.period ?? 2, (it, v) => { it.period = v; }, id));
    kids.push(textField('Label', st.label || '', (v) => edit((it) => { if (v) it.label = v; else delete it.label; })));
    kids.push(textField('Note', st.note || '', (v) => edit((it) => { if (v) it.note = v; else delete it.note; })));
  } else {
    $('dlg-props-h').textContent = `${LAYERS[sk.layer].label} stroke`;
    if (sk.layer === 'obstacles') {
      kids.push(h('label', { text: 'Obstacle' }), h('div', { class: 'chips' }, OBSTACLE_TYPES.map((k) => h('button', { type: 'button', 'aria-pressed': String(sk.type === k), onclick: () => { edit((it) => { it.type = k; it.size = defaultStampSize(k, D.gameWidth, STAMP_TYPES[k].size); }); openProps(id); } }, OBSTACLE_LABEL[k]))));
      kids.push(propSlider('Spacing (cells)', 1, 30, 0.5, sk.spacing || 6, (it, v) => { it.spacing = v; }, id));
      kids.push(h('label', { text: 'Size of each' }), propSize(sk.type, sk.size ?? STAMP_TYPES[sk.type].size, id));
      kids.push(h('label', { text: 'Behaviour' }), h('div', { class: 'chips' }, Object.entries(BEHAVIORS).filter(([k]) => k !== 'triggered').map(([k, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(sk.behavior === k), onclick: () => { edit((it) => { it.behavior = k; }); openProps(id); } }, label))));
    } else if (sk.layer === 'shards') {
      kids.push(propSlider('Spacing (cells)', 2, 60, 1, sk.spacing || 12, (it, v) => { it.spacing = v; }, id));
    } else if (sk.layer === 'hazards') {
      kids.push(h('label', { text: 'Zone' }), h('div', { class: 'chips' }, Object.entries(ZONE_TYPES).map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(sk.type === k), onclick: () => { edit((it) => { it.type = k; }); openProps(id); } }, label))));
    }
    kids.push(textField('Label', sk.label || '', (v) => edit((it) => { if (v) it.label = v; else delete it.label; })));
  }
  kids.push(h('div', { class: 'row' },
    button('Duplicate', () => { S.sel = new Set([id]); duplicateSelection(); $('dlg-props').close(); }),
    button('Request an asset', () => { $('dlg-props').close(); openRequest(st ? worldOf([st.x, st.y]) : null, { title: (st || sk).label || (st ? STAMP_TYPES[st.type].label : '') }); }),
    button('Delete', () => { S.sel = new Set([id]); deleteSelection(); $('dlg-props').close(); }, 'danger')));
  body.replaceChildren(...kids);
  openDialog('dlg-props');
}

function propSlider(label, min, max, step, value, apply, id) {
  return h('div', {}, h('label', { text: label }), slider({ label: '', min, max, step, value, fmt: (v) => String(round(v, 2)),
    onLive: (v) => { const it = S.doc.stamps.find((s) => s.id === id) || S.doc.strokes.find((s) => s.id === id); if (it) { apply(it, round(v, 2)); refresh(); requestDraw(); } },
    onCommit: (v, before) => { if (before !== null && pushUndo(before)) changed(); } }));
}

/** The properties sheet's size: locked, inside the game's range, or free in cells. */
function propSize(type, value, id) {
  const find = () => S.doc.stamps.find((s) => s.id === id) || S.doc.strokes.find((s) => s.id === id);
  return sizeControl(type, value, {
    label: '',
    onLive: (v) => { const it = find(); if (it) { it.size = v; refresh(); requestDraw(); } },
    onCommit: (v, before) => { if (before !== null && pushUndo(before)) changed(); },
  });
}

function textField(label, value, onChange) {
  const input = h('input', { type: 'text', maxlength: '80', autocomplete: 'off' });
  input.value = value;
  input.addEventListener('change', () => onChange(input.value.trim()));
  return h('div', {}, h('label', { text: label }), input);
}

// ------------------------------------------------------------------ layers sheet

function renderLayers() {
  const counts = layerCounts(S.doc);
  $('layers-body').replaceChildren(h('ul', { class: 'list' }, LAYER_ORDER.map((k) => {
    const L = S.doc.layers[k];
    return h('li', {},
      h('i', { class: 'sw', style: `background:${PEN[k]}` }),
      h('span', { class: 'grow', text: `${LAYERS[k].label} (${counts[k]})` }),
      h('button', { type: 'button', 'aria-pressed': String(L.visible), 'aria-label': `${LAYERS[k].label}: ${L.visible ? 'shown' : 'hidden'}`, onclick: () => mutate((d) => { d.layers[k].visible = !d.layers[k].visible; }, { quiet: true }) }, L.visible ? 'Shown' : 'Hidden'),
      h('button', { type: 'button', 'aria-pressed': String(L.locked), 'aria-label': `${LAYERS[k].label}: ${L.locked ? 'locked' : 'unlocked'}`, onclick: () => mutate((d) => { d.layers[k].locked = !d.layers[k].locked; }, { quiet: true }) }, L.locked ? 'Locked' : 'Lock'),
      h('button', { type: 'button', onclick: () => { $('dlg-layers').close(); setTool(k === 'lane' ? 'lane' : k); S.mode[S.tool] = 'erase'; renderSub(); showHint(`Eraser: ${LAYERS[k].label}`); } }, 'Eraser'));
  })));
}

// ------------------------------------------------------------------ checks sheet

function renderChecks() {
  const body = $('check-body');
  const items = (D.checks || []).map((c) => h('li', { class: c.level },
    h('span', { class: 'mark', 'aria-hidden': 'true', text: c.level === 'good' ? '✓' : '!' }),
    h('div', { class: 'grow' }, h('div', { text: c.title }), c.detail ? h('div', { class: 'muted', text: c.detail }) : null),
    c.at ? button('Show', () => { $('dlg-check').close(); panTo(c.at); buzz(6); }) : null));
  const intent = S.game && S.game.intent && S.game.intent.length ? S.game.intent.map((i) => i.text) : [];
  body.replaceChildren(
    h('ul', { class: 'list checks' }, items),
    h('div', { class: 'row' },
      button('Auto start', autoStart),
      h('button', { type: 'button', 'aria-pressed': String(S.showGame), onclick: () => { S.showGame = !S.showGame; updateChrome(); requestDraw(true); renderChecks(); } }, 'Show what the game flies')),
    intent.length ? h('p', { class: 'intent-label', text: 'Design intent (not in game yet)' }) : null,
    intent.length ? h('ul', { class: 'intent' }, intent.map((t) => h('li', { text: t }))) : null,
    sizesTable());
}

/** The in-game sizes the studio draws and checks with, and where each comes from. */
function sizesTable() {
  return h('details', { class: 'sizes' },
    h('summary', { text: 'In-game sizes (cells)' }),
    h('p', { class: 'muted', text: 'Everything on the board is drawn at these sizes, on the same scale as the lane.' }),
    h('table', {}, h('tbody', {}, sizeTable().map((r) => h('tr', {},
      h('td', { text: r.label }), h('td', { class: 'num', text: String(r.value) }), h('td', { class: 'muted', text: `${r.source}: ${r.constant}` }))))));
}

// ------------------------------------------------------------------ track sheet

const SAMPLE_TRACK = createTrack([[4, 6], [26, 4], [34, 12], [30, 22], [18, 18], [8, 24], [2, 16]], 5, 'sample');

function renderTrackSheet() {
  const d = S.doc;
  const field = (label, key, max, placeholder) => {
    const input = h('input', { type: 'text', maxlength: String(max), autocomplete: 'off', placeholder });
    input.value = d[key] || '';
    input.addEventListener('change', () => mutate((doc) => { doc[key] = input.value.trim().replace(/^-+/, '').slice(0, max); }, { quiet: true }));
    return [h('label', { text: label }), input];
  };
  const area = (label, key, max, placeholder) => {
    const t = h('textarea', { rows: '3', maxlength: String(max), placeholder });
    t.value = d[key] || '';
    t.addEventListener('change', () => mutate((doc) => { doc[key] = t.value.slice(0, max); }, { quiet: true }));
    return [h('label', { text: label }), t];
  };
  const skins = h('div', { class: 'skins' }, SKINS.map((k) => {
    const cv = h('canvas', { 'aria-hidden': 'true' });
    const card = h('button', { type: 'button', class: 'skin-card', 'aria-pressed': String(d.skin === k), onclick: () => { mutate((doc) => { doc.skin = k; }); renderTrackSheet(); } }, cv, SKIN_LABELS[k] || k);
    requestAnimationFrame(() => { try { drawSkinSample(cv, SAMPLE_TRACK, k); } catch { /* the board redraws its own lane */ } requestDraw(true); });
    return card;
  }));
  const namesMsg = h('p', { class: 'msg', role: 'status' });
  const designs = h('ul', { class: 'list' }, h('li', { class: 'muted', text: 'Loading saved designs…' }));
  api('/studio/api/designs').then((out) => {
    designs.replaceChildren(...(out.designs.length ? out.designs : [{ id: null }]).map((x) => x.id
      ? h('li', {}, h('span', { class: 'grow', text: `${x.title || 'Untitled'} · ${x.closed ? 'loop' : 'open'} · ${ago(x.savedAt)}${x.id === S.doc.id ? ' (open now)' : ''}` }),
        x.id === S.doc.id ? null : button('Open', () => openDesign(x.id)))
      : h('li', { class: 'muted', text: 'No saved designs yet.' })));
  }).catch(() => designs.replaceChildren(h('li', { class: 'muted', text: 'Saved designs need the studio connection.' })));
  $('track-body').replaceChildren(
    ...field('Track name', 'title', 60, 'The Abandoned Mall'),
    ...field('Landmark', 'landmark', 60, 'The Broken Escalator'),
    h('h3', { text: 'Skin' }), skins,
    h('h3', { text: 'Difficulty' }), h('div', { class: 'chips' }, ['easy', 'normal', 'hard'].map((k) => h('button', { type: 'button', 'aria-pressed': String(d.difficulty === k), onclick: () => { mutate((doc) => { doc.difficulty = k; }); renderTrackSheet(); } }, k[0].toUpperCase() + k.slice(1)))),
    h('h3', { text: 'Automatic hazards' }),
    h('div', { class: 'chips' }, [['auto', 'Auto (when you draw none)'], ['on', 'Always'], ['off', 'Never']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(d.auto.hazards === k), onclick: () => { mutate((doc) => { doc.auto.hazards = k; }); renderTrackSheet(); } }, label))),
    h('h3', { text: 'Page size' }),
    h('p', { class: 'muted', text: `The page is ${Math.round(D.page.w)} × ${Math.round(D.page.h)} cells. A bigger page makes the same drawing a longer lap.` }),
    h('div', { class: 'chips' }, PAGE_SIZES.map(([label, cells]) => h('button', { type: 'button', 'aria-pressed': String(d.page.cells === cells), onclick: () => { mutate((doc) => { doc.page.cells = cells; }); fitView(); renderTrackSheet(); } }, `${label} · ${cells}`))),
    ...area('Notes for this track', 'notes', 4000, 'What should it feel like?'),
    ...area('Name ideas', 'nameIdeas', 1500, 'Words, vibes, places…'),
    button('Ask for 8 name ideas', async () => {
      if (!S.doc.nameIdeas.trim()) { say(namesMsg, 'Type a few name ideas first.', 'err'); return; }
      say(namesMsg, 'Asking…', 'busy');
      try { const out = await api('/studio/api/names', { ideas: S.doc.nameIdeas }); say(namesMsg, out.message || 'Asked.', 'ok'); } catch (e) { say(namesMsg, e.message, 'err'); }
    }), namesMsg,
    h('h3', { text: 'Requests' }), button('Request something new', () => { $('dlg-track').close(); openRequest(null); }),
    h('h3', { text: 'Designs' }),
    h('div', { class: 'row' }, button('New design', newDesign), button('Fit the view', () => { $('dlg-track').close(); fitView(); })), designs,
    h('h3', { text: 'This phone' }),
    h('div', { class: 'chips' },
      h('button', { type: 'button', 'aria-pressed': String(prefs.haptics), onclick: () => { prefs.haptics = !prefs.haptics; store(PREFS_KEY, prefs); buzz(10); renderTrackSheet(); } }, 'Haptics'),
      h('button', { type: 'button', 'aria-pressed': String(prefs.animate), onclick: () => { prefs.animate = !prefs.animate; store(PREFS_KEY, prefs); requestDraw(true); renderTrackSheet(); } }, 'Animate the skin'),
      h('button', { type: 'button', 'aria-pressed': String(S.stylus), onclick: () => { S.stylus = !S.stylus; renderTrackSheet(); } }, 'Stylus mode')));
}

function newDesign() {
  const aspect = clamp(usable().w / usable().h, 0.4, 2.5);
  const fresh = newDoc({ id: 'd-' + Math.random().toString(36).slice(2, 12), aspect, skin: S.doc.skin });
  S.undo.push(snapshot()); S.redo = [];
  S.doc = fresh; S.sel.clear(); S.game = null;
  changed(); fitView();
  $('dlg-track').close();
  toast('New design. Undo brings the last one back.', 'ok');
}

async function openDesign(id) {
  try {
    const out = await api(`/studio/api/designs/${encodeURIComponent(id)}`);
    S.undo.push(snapshot()); S.redo = [];
    S.doc = normalizeDoc(out.design); S.sel.clear(); S.game = null;
    changed(); fitView(); renderSub();
    $('dlg-track').close();
    toast('Design opened.', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

// ------------------------------------------------------------------ versions (Tracks sheet)

const refineNotes = load(REFINE_KEY, {});

function versionCard(v) {
  const st = S.ui[v.id] || (S.ui[v.id] = {});
  const runs = v.runs || {};
  const pendingReq = (v.requests || []).filter((r) => r.status === 'pending');
  const facts = h('dl', { class: 'facts' },
    h('dt', { text: 'Autopilot' }), h('dd', { text: fmtMs(v.autopilotMs) || 'did not finish' }),
    h('dt', { text: 'Your best lap' }), h('dd', { text: fmtMs(runs.bestMs) || 'not flown yet' }),
    h('dt', { text: 'Last lap' }), h('dd', { text: fmtMs(runs.lastMs) ? `${fmtMs(runs.lastMs)}${runs.lastFinished === false ? ' (last try did not finish)' : ''}` : (runs.count ? `no finish${runs.lastReason ? ': ' + runs.lastReason : ''}` : 'not flown yet') }),
    h('dt', { text: 'Laps flown' }), h('dd', { text: `${runs.count || 0}${runs.finished ? `, ${runs.finished} finished` : ''}` }),
    h('dt', { text: 'From' }), h('dd', { text: v.source === 'agent' ? 'Agent edit' : `Your ${v.draftVersion === 2 ? 'design' : 'sketch'}${v.difficulty ? ', ' + v.difficulty : ''}` }),
    v.skin ? h('dt', { text: 'Skin' }) : null, v.skin ? h('dd', { text: SKIN_LABELS[v.skin] || v.skin }) : null);
  const compareBox = h('input', { type: 'checkbox', 'aria-label': `Compare v${v.version}` });
  compareBox.checked = S.compare.has(v.version);
  compareBox.addEventListener('change', () => { if (compareBox.checked) { S.compare.add(v.version); while (S.compare.size > 2) S.compare.delete([...S.compare][0]); } else S.compare.delete(v.version); renderTracks(); });
  const link = location.origin + v.playUrl;
  const copy = button('Copy link', async () => { try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; } catch { copy.textContent = 'Long-press the link to copy'; } setTimeout(() => { copy.textContent = 'Copy link'; }, 2000); });
  return h('li', { class: 'vcard', 'data-version': v.version },
    h('img', { src: v.previewUrl, alt: `Preview of ${v.title || 'track'} version ${v.version}`, loading: 'lazy' }),
    h('div', { class: 'vbody' },
      h('div', { class: 'vhead' }, h('h3', { text: v.title || `Track v${v.version}` }), h('span', { class: 'muted', text: `v${v.version}` }),
        h('span', { class: `chip ${v.status}`, text: STATUS_LABEL[v.status] || v.status })),
      v.landmark ? h('p', { class: 'muted', text: `Landmark: ${v.landmark}` }) : null,
      facts,
      v.problems && v.problems.length ? h('ul', { class: 'problems', 'aria-label': 'Problems' }, v.problems.map((p) => h('li', { text: p }))) : null,
      v.report && v.report.fixes && v.report.fixes.length ? h('p', { class: 'muted', text: `Auto-fixed: ${v.report.fixes.join(' ')}` }) : null,
      v.intent && v.intent.length ? h('p', { class: 'intent-label', text: `Design intent (not in game yet): ${v.intent.length}` }) : null,
      v.intent && v.intent.length ? h('ul', { class: 'intent' }, v.intent.slice(0, 8).map((t) => h('li', { text: t }))) : null,
      v.source === 'agent' && v.notes ? h('p', { class: 'muted', text: `Agent: ${v.notes}` }) : null,
      pendingReq.length ? h('p', { class: 'msg busy', text: `The agent is working on your notes (sent ${ago(pendingReq[0].created)}).` }) : null,
      v.approval ? h('p', { class: 'muted', text: `Approval requested ${ago(v.approval.at)}. Approve it in your Focus Inbox.` }) : null,
      h('div', { class: 'vactions' },
        h('a', { class: 'btn primary', href: v.playUrl, target: '_blank', rel: 'noopener', text: 'Playtest' }),
        copy,
        refineArea(v, st),
        approveArea(v, st),
        v.sketchNumber ? button('Open in editor', () => openVersionSketch(v)) : null,
        h('label', { class: 'check' }, compareBox, 'Compare'))));
}

function refineArea(v, st) {
  const wrap = h('div', {});
  const msg = h('p', { class: 'msg', role: 'status' });
  const toggle = h('button', { type: 'button', 'aria-expanded': String(!!st.refine) }, 'Refine');
  const panel = h('div', { class: 'panel', hidden: !st.refine });
  const ta = h('textarea', { rows: '4', maxlength: '4000', placeholder: 'What should change? Corner 3 is too tight, the mall needs falling stuff…', 'aria-label': `Notes for v${v.version}` });
  ta.value = refineNotes[v.id] || '';
  ta.addEventListener('input', () => { refineNotes[v.id] = ta.value; store(REFINE_KEY, refineNotes); });
  const attach = h('input', { type: 'checkbox' });
  attach.disabled = !D.closed;
  const send = h('button', { type: 'button', class: 'primary' }, 'Send to agent');
  toggle.addEventListener('click', () => { st.refine = !st.refine; panel.hidden = !st.refine; toggle.setAttribute('aria-expanded', String(st.refine)); });
  send.addEventListener('click', async () => {
    const notes = ta.value.trim();
    const sketch = attach.checked && D.closed ? S.doc : null;
    if (!notes && !sketch) { say(msg, 'Write a note or attach the design first.', 'err'); return; }
    send.disabled = true; say(msg, 'Sending…', 'busy');
    try {
      await api('/studio/api/refine', Object.assign({ fromVersion: v.version, notes }, sketch ? { sketch } : {}), 45000);
      delete refineNotes[v.id]; store(REFINE_KEY, refineNotes);
      st.refine = false;
      say(msg, 'Sent. The new version shows up here when the agent is done.', 'ok');
      await refreshState(true);
    } catch (e) { say(msg, e.message, 'err'); } finally { send.disabled = false; }
  });
  panel.append(ta, h('label', { class: 'check' }, attach, 'Also send the design on the canvas'), send);
  wrap.append(toggle, panel, msg);
  return wrap;
}

function approveArea(v, st) {
  const wrap = h('div', {});
  const msg = h('p', { class: 'msg', role: 'status' });
  const blocked = v.status === 'needs-work' ? 'Fix the problems before approving.' : v.approval ? 'Approval already requested.' : null;
  const toggle = h('button', { type: 'button', disabled: !!blocked || (S.state && S.state.preview), 'aria-expanded': String(!!st.approve) }, v.approval ? 'Approval requested' : S.state && S.state.preview ? 'Approve (live studio only)' : 'Approve');
  const panel = h('div', { class: 'panel', hidden: !st.approve });
  const unflown = !(v.runs && v.runs.count);
  const yes = h('button', { type: 'button', class: 'primary' }, unflown ? 'Approve anyway' : 'Yes, request approval');
  panel.append(h('p', { text: `Approving v${v.version} sends a request to your Focus Inbox. Nothing ships until you approve it there.` }),
    unflown ? h('p', { class: 'msg err', text: 'You have not flown this version on the laptop yet.' }) : null,
    h('div', { class: 'row' }, yes, button('Cancel', () => { st.approve = false; panel.hidden = true; })));
  toggle.addEventListener('click', () => { st.approve = !st.approve; panel.hidden = !st.approve; });
  yes.addEventListener('click', async () => {
    yes.disabled = true; say(msg, 'Requesting…', 'busy');
    try { await api('/studio/api/approve', { version: v.version }, 45000); st.approve = false; say(msg, 'Done. Approve it in your Focus Inbox.', 'ok'); await refreshState(true); }
    catch (e) { say(msg, e.message, 'err'); yes.disabled = false; }
  });
  wrap.append(toggle, panel, msg);
  if (blocked && v.status === 'needs-work') wrap.append(h('p', { class: 'muted', text: blocked }));
  return wrap;
}

async function openVersionSketch(v) {
  try {
    const out = await api(`/studio/api/sketches/${v.sketchNumber}`);
    const doc = normalizeDoc(out.sketch);
    if (doc.fromV1) doc.id = 'd-' + Math.random().toString(36).slice(2, 12);
    doc.title = doc.title || v.title || ''; doc.landmark = doc.landmark || v.landmark || '';
    S.undo.push(snapshot()); S.redo = [];
    S.doc = doc; S.sel.clear(); S.game = null;
    changed(); fitView(); renderSub();
    $('dlg-tracks').close();
    toast(`v${v.version}'s ${out.sketch.version === 1 ? 'v1 sketch' : 'design'} is on the canvas. Undo brings yours back.`, 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

function compareView() {
  const vs = (S.state ? S.state.versions : []).filter((v) => S.compare.has(v.version)).sort((a, b) => a.version - b.version);
  if (vs.length !== 2) return h('p', { class: 'muted', text: S.compare.size ? 'Tick one more version to compare side by side.' : 'Tick Compare on two versions to see them side by side.' });
  const row = (label, f) => h('tr', {}, h('th', { text: label }), ...vs.map((v) => h('td', { text: f(v) })));
  return h('div', { class: 'compare' },
    ...vs.map((v) => h('div', {}, h('img', { src: v.previewUrl, alt: `v${v.version}` }), h('div', { text: `v${v.version} · ${v.title || ''}` }))),
    h('table', {}, h('tbody', {},
      row('Status', (v) => STATUS_LABEL[v.status] || v.status),
      row('Autopilot', (v) => fmtShort(v.autopilotMs)),
      row('Your best', (v) => fmtShort(v.runs && v.runs.bestMs)),
      row('Lap', (v) => (v.report && v.report.lengthCells ? `${Math.round(v.report.lengthCells)} cells` : '—')),
      row('Width', (v) => (v.report && v.report.width ? String(v.report.width) : '—')),
      row('Shards / mines', (v) => (v.report ? `${v.report.shards ?? '—'} / ${v.report.mines ?? '—'}` : '—')),
      row('Problems', (v) => String((v.problems || []).length)),
      row('Design intent', (v) => String((v.intent || []).length)),
      row('Skin', (v) => SKIN_LABELS[v.skin] || v.skin || 'default'))));
}

function requestRow(r) {
  const msg = h('span', { class: 'muted', text: `${r.type}, ${r.behavior} · card ${r.card && r.card.status === 'filed' ? (r.card.ref || 'made') : (r.card ? r.card.status : 'not filed')}${r.queue && r.queue.status === 'queued' ? ' · 3D queued' : ''}` });
  const needsRetry = (r.card && r.card.status === 'failed') || (r.queue && r.queue.status === 'failed');
  return h('li', { class: 'req-card' },
    r.sketchUrl ? h('img', { src: r.sketchUrl, alt: '' }) : h('span', { text: '?' }),
    h('div', {}, h('div', { text: r.title }), msg,
      needsRetry ? button('Retry', async () => { try { const out = await api('/studio/api/requests-retry', { id: r.id }); toast(out.message, 'ok'); await refreshState(true); } catch (e) { toast(e.message, 'bad'); } }, 'attn') : null));
}

function renderTracks() {
  const st = S.state;
  const body = $('tracks-body');
  if (!st) { body.replaceChildren(h('p', { class: 'muted', text: 'Connecting to the studio…' })); return; }
  body.replaceChildren(
    st.preview ? h('p', { class: 'msg err', text: 'Preview: this is a copy of your tracks. Approvals are made from the live studio.' }) : null,
    st.lhcConfigured === false ? h('p', { class: 'msg err', text: 'Agent requests are offline: LHC is not set up on the studio server.' }) : null,
    h('h3', { text: 'Compare' }), compareView(),
    h('h3', { text: 'Versions' }),
    st.versions.length ? h('ul', { class: 'vlist' }, st.versions.map(versionCard)) : h('p', { class: 'muted', text: 'No tracks yet. Draw a loop and tap Make.' }),
    st.itemRequests && st.itemRequests.length ? h('h3', { text: 'Requested items' }) : null,
    st.itemRequests && st.itemRequests.length ? h('ul', { class: 'list' }, st.itemRequests.map(requestRow)) : null);
}

let lastStateKey = '';
async function refreshState(force) {
  try {
    const st = await api('/studio/api/state');
    S.state = st;
    $('banner').hidden = !st.preview;
    if (st.preview) $('banner').textContent = 'Studio v2 preview, on a copy of your tracks.';
    const key = JSON.stringify([st.versions, st.itemRequests]);
    const typing = document.activeElement && $('dlg-tracks').contains(document.activeElement) && /TEXTAREA|INPUT/.test(document.activeElement.tagName);
    if ((force || key !== lastStateKey) && $('dlg-tracks').open && !typing) renderTracks();
    lastStateKey = key;
  } catch { /* offline: the save indicator says so */ }
}

// ------------------------------------------------------------------ make track

let making = false;
async function makeTrack() {
  if (making) return;
  if (!D.closed) { toast('Close the lane loop first.', 'bad'); openDialog('dlg-check'); renderChecks(); return; }
  making = true;
  const btn = $('make-btn');
  btn.disabled = true;
  const t0 = Date.now();
  const tick = setInterval(() => toast(`Making your track… ${Math.round((Date.now() - t0) / 1000)}s`), 1000);
  toast('Making your track…');
  try {
    const out = await api('/studio/api/make', { sketch: S.doc }, 120000);
    clearInterval(tick);
    const v = out.version;
    toast(v.status === 'needs-work' ? `Made v${v.version}, but it needs work: ${v.problems[0] || 'see Tracks.'}` : `Made v${v.version}. Playtest it from Tracks.`, v.status === 'needs-work' ? 'bad' : 'ok');
    buzz([10, 40, 10]);
    await refreshState(true);
    openDialog('dlg-tracks'); renderTracks();
    const card = document.querySelector(`[data-version="${v.version}"]`);
    if (card) card.scrollIntoView({ block: 'start' });
  } catch (e) {
    clearInterval(tick);
    toast(`${e.message} Your design is safe; tap Make to retry.`, 'bad');
  } finally { making = false; btn.disabled = false; }
}

// ------------------------------------------------------------------ request something new

const RQ = { at: null, mode: 'canvas', type: 'obstacle', behavior: 'static', photo: null, padStrokes: [], padColor: '#f4f7fb' };

function chipRow(el, options, value, onPick) {
  el.replaceChildren(...options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => { onPick(v); chipRow(el, options, v, onPick); buzz(4); } }, label)));
}

function openRequest(w, { title = '' } = {}) {
  const area = usable();
  RQ.at = w || toWorldPx(S.view, [area.x + area.w / 2, area.y + area.h / 2]);
  RQ.photo = null; RQ.padStrokes = [];
  RQ.mode = 'canvas';
  const form = $('request-form');
  form.reset();
  $('rq-title').value = title;
  $('rq-photo-preview').hidden = true;
  chipRow($('rq-type'), REQUEST_TYPES.map((k) => [k, k[0].toUpperCase() + k.slice(1)]), RQ.type, (v) => { RQ.type = v; $('rq-3d').checked = VISUAL_REQUEST_TYPES.includes(v); });
  chipRow($('rq-behavior'), REQUEST_BEHAVIORS.map((k) => [k, k[0].toUpperCase() + k.slice(1)]), RQ.behavior, (v) => { RQ.behavior = v; });
  chipRow($('rq-sketch-mode'), [['canvas', 'Canvas around the spot'], ['pad', 'Draw it here'], ['none', 'No sketch']], RQ.mode, (v) => { RQ.mode = v; drawPad(); });
  $('rq-3d').checked = VISUAL_REQUEST_TYPES.includes(RQ.type);
  const q = D.lane.length >= 2 ? G.nearestOnPolyline(D.lane, RQ.at, D.closed, D.cum) : null;
  RQ.lap = q && D.closed ? round(q.s / D.lap, 4) : null;
  $('rq-where').textContent = RQ.lap != null ? `A "?" marker goes on the track here, ${Math.round(RQ.lap * 100)}% round the lap.` : 'A "?" marker goes on the canvas where you tapped.';
  RQ.canvasShot = captureRegion(RQ.at);
  say($('rq-msg'), '');
  openDialog('dlg-request');
  requestAnimationFrame(drawPad);
}

/** A 512 × 512 PNG of the board around a world point (the "canvas region" sketch). */
function captureRegion(w) {
  try {
    frame(performance.now());
    const q = toScreen(S.view, w), size = Math.min(W, H, 420) * dpr;
    const sx = clamp(q[0] * dpr - size / 2, 0, canvas.width - size), sy = clamp(q[1] * dpr - size / 2, 0, canvas.height - size);
    const out = document.createElement('canvas');
    out.width = 512; out.height = 512;
    const g = out.getContext('2d');
    g.fillStyle = '#04060a'; g.fillRect(0, 0, 512, 512);
    g.drawImage(canvas, sx, sy, size, size, 0, 0, 512, 512);
    g.strokeStyle = '#ff4fa3'; g.lineWidth = 4; g.setLineDash([10, 8]);
    g.beginPath(); g.arc(256 + (q[0] * dpr - sx - size / 2) * 512 / size, 256 + (q[1] * dpr - sy - size / 2) * 512 / size, 40, 0, Math.PI * 2); g.stroke();
    return out;
  } catch { return null; }
}

function drawPad() {
  const pad = $('rq-pad');
  pad.hidden = RQ.mode === 'none';
  $('rq-pad-tools').hidden = RQ.mode !== 'pad';
  if (RQ.mode === 'none') return;
  const r = Math.min(globalThis.devicePixelRatio || 1, 2), w = pad.clientWidth || 300, hh = pad.clientHeight || 225;
  pad.width = Math.round(w * r); pad.height = Math.round(hh * r);
  const g = pad.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#05080c'; g.fillRect(0, 0, pad.width, pad.height);
  if (RQ.mode === 'canvas') { if (RQ.canvasShot) g.drawImage(RQ.canvasShot, 0, 0, RQ.canvasShot.width, RQ.canvasShot.height, (pad.width - pad.height) / 2, 0, pad.height, pad.height); return; }
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const s of RQ.padStrokes) {
    g.strokeStyle = s.color; g.lineWidth = 4 * r;
    g.beginPath(); s.pts.forEach((p, i) => (i ? g.lineTo(p[0] * pad.width, p[1] * pad.height) : g.moveTo(p[0] * pad.width, p[1] * pad.height))); g.stroke();
  }
}

(function wirePad() {
  const pad = $('rq-pad');
  let cur = null;
  const pos = (e) => { const b = pad.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; };
  pad.addEventListener('pointerdown', (e) => { if (RQ.mode !== 'pad') return; e.preventDefault(); pad.setPointerCapture(e.pointerId); cur = { color: RQ.padColor, pts: [pos(e)] }; RQ.padStrokes.push(cur); });
  pad.addEventListener('pointermove', (e) => { if (!cur) return; cur.pts.push(pos(e)); drawPad(); });
  const end = () => { cur = null; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  const tools = $('rq-pad-tools');
  const colors = [['#f4f7fb', 'White'], ['#ff4fa3', 'Pink'], ['#3df2ff', 'Cyan'], ['#a98bff', 'Violet'], ['#ff9a3d', 'Orange']];
  const renderTools = () => tools.replaceChildren(...colors.map(([c, label]) => h('button', { type: 'button', 'aria-pressed': String(RQ.padColor === c), onclick: () => { RQ.padColor = c; renderTools(); } }, h('i', { class: 'swatch', style: `background:${c}` }), label)),
    button('Clear', () => { RQ.padStrokes = []; drawPad(); }));
  renderTools();
  $('rq-photo').addEventListener('change', async () => {
    const file = $('rq-photo').files && $('rq-photo').files[0];
    RQ.photo = null;
    if (!file) { $('rq-photo-preview').hidden = true; return; }
    try {
      const img = await createImageBitmap(file);
      const s = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      RQ.photo = c.toDataURL('image/jpeg', 0.85);
      $('rq-photo-preview').src = RQ.photo; $('rq-photo-preview').hidden = false;
    } catch { say($('rq-msg'), 'That photo could not be read. Try another.', 'err'); }
  });
})();

$('request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('rq-title').value.trim();
  if (!title) { say($('rq-msg'), 'Give it a title.', 'err'); $('rq-title').focus(); return; }
  let sketchPng = null;
  if (RQ.mode === 'canvas' && RQ.canvasShot) sketchPng = RQ.canvasShot.toDataURL('image/png');
  else if (RQ.mode === 'pad' && RQ.padStrokes.length) sketchPng = $('rq-pad').toDataURL('image/png');
  const stampId = uid('s');
  const [px, py] = pageOfFree(RQ.at);
  const request = {
    title, description: $('rq-desc').value.trim(), effect: $('rq-effect').value.trim(), need: $('rq-need').value.trim(),
    type: RQ.type, behavior: RQ.behavior, needs3d: $('rq-3d').checked,
    form: { size: $('rq-size').value.trim(), shape: $('rq-shape').value.trim(), look: $('rq-look').value.trim() },
    where: { x: px, y: py, lap: RQ.lap, design: S.doc.id && /^d-[A-Za-z0-9_-]{1,36}$/.test(S.doc.id) ? S.doc.id : undefined, track: S.doc.title || '', stampId },
  };
  $('rq-save').disabled = true;
  say($('rq-msg'), 'Saving and filing the card…', 'busy');
  try {
    const out = await api('/studio/api/requests', { request, sketchPng, photo: RQ.photo }, 60000);
    const r = out.request;
    mutate((d) => {
      d.stamps.push({ id: stampId, type: 'request', x: px, y: py, size: 4, rotation: 0, behavior: RQ.behavior === 'triggered' ? 'static' : RQ.behavior, label: title.slice(0, 80), requestId: r.id });
      d.requests.push({ id: r.id, title: title.slice(0, 80), type: r.type, behavior: r.behavior, status: r.status, cardRef: (r.card && r.card.ref) || '', queued: !!(r.queue && r.queue.status === 'queued'), stampId });
    });
    $('dlg-request').close();
    toast(out.message, r.status === 'filed' ? 'ok' : 'bad');
    buzz([10, 40, 10]);
    refreshState(true);
  } catch (err) {
    say($('rq-msg'), `${err.message} Nothing is lost: tap Save request to retry.`, 'err');
  } finally { $('rq-save').disabled = false; }
});

// ------------------------------------------------------------------ top bar

$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('menu-btn').addEventListener('click', () => { renderTrackSheet(); openDialog('dlg-track'); });
$('title-btn').addEventListener('click', async () => {
  const v = await ask('Track name', { value: S.doc.title, placeholder: 'The Abandoned Mall' });
  if (v !== null) mutate((d) => { d.title = v.replace(/^-+/, '').slice(0, 60); }, { quiet: true });
});
$('layers-btn').addEventListener('click', () => { renderLayers(); openDialog('dlg-layers'); });
$('check-btn').addEventListener('click', () => { renderChecks(); openDialog('dlg-check'); });
$('tracks-btn').addEventListener('click', () => { renderTracks(); openDialog('dlg-tracks'); refreshState(true); });
$('make-btn').addEventListener('click', makeTrack);
$('fit-btn').addEventListener('click', () => { fitView(); buzz(4); });
$('game-btn').addEventListener('click', () => {
  S.showGame = !S.showGame;
  if (S.showGame && (!S.game || !S.game.layout)) toast(D.closed ? 'The game check is still running; the overlay appears when it is done.' : 'Close the loop first.');
  updateChrome(); requestDraw(true); buzz(4);
});

// ------------------------------------------------------------------ boot

function boot() {
  W = window.innerWidth; H = window.innerHeight;
  let doc = null;
  try { const saved = load(DOC_KEY, null); if (saved) doc = normalizeDoc(saved); } catch { doc = null; }
  if (!doc) {
    const area = { w: W - 16, h: H - 240 };
    doc = newDoc({ id: 'd-' + Math.random().toString(36).slice(2, 12), aspect: clamp(area.w / Math.max(100, area.h), 0.4, 2.5) });
  }
  S.doc = doc;
  refresh();
  resize();
  fitView();
  setTool('lane');
  updateChrome();
  setSave(doc.lane.points.length ? 'Restored' : 'New');
  if (D.closed) scheduleCheck();
  window.addEventListener('resize', resize);
  refreshState();
  setInterval(() => { if (!document.hidden) refreshState(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshState(); else if (S.doc) { clearTimeout(saveTimer); saveNow(); } });
  // Expose a tiny handle for the headless smoke test (read-only use).
  globalThis.__studio = { S, get D() { return D; }, refresh, fitView, mutate, zoomAt, legend: () => scaleBar(S.view.scale, D.gameWidth) };
}
boot();

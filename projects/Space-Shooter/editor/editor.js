// The custom track editor (editor.html). Unlisted, for the owner: draw on the
// 48 x 32 grid, see the same checks and scripted pilot the tests run, export
// tracks/custom-track.js, or test fly the draft in the game (never saved).
import { CUSTOM_TRACK } from '../tracks/custom-track.js';
import { DRAFT_KEY, pickTrackFields, releaseCountdown, releaseText, trackModuleText } from '../systems/customTrack.js';
import { checkTrack, TRACK_RULES } from '../engine/trackChecks.js';
import {
  GRID_W, GRID_H, blankTrack, snap, insertPoint, removePoint, movePoint, toggleApex, toggleRock,
  hitPoint, hitSegment, parseTrackText,
} from './editorModel.js';

const SAVE_KEY = 'stardust.customTrack.editor';
const $ = (id) => document.getElementById(id);
const canvas = $('ed-canvas');
const ctx = canvas.getContext('2d');

let track = null;
let selected = -1;
let tool = 'points';
let result = null;
let undo = [];
let drag = null;
let checkTimer = 0;
// The width slider while it's being dragged, before the change is committed.
let previewWidth = null;

function store() {
  try { return window.localStorage; } catch { return null; }
}

// ---- state -----------------------------------------------------------------

function setTrack(next, { record = true, keepSelection = true } = {}) {
  if (record && track) {
    undo.push(JSON.stringify(track));
    if (undo.length > 100) undo.shift();
  }
  track = next;
  if (!keepSelection || selected >= track.points.length) selected = -1;
  try { store()?.setItem(SAVE_KEY, JSON.stringify(track)); } catch { /* this session only */ }
  $('ed-undo').disabled = !undo.length;
  syncFields();
  scheduleCheck();
  draw();
  paintSelected();
}

function load(source, note) {
  const picked = pickTrackFields(source);
  undo = [];
  selected = -1;
  setTrack(picked, { record: false, keepSelection: false });
  $('ed-import-note').textContent = note || '';
}

// ---- checks ----------------------------------------------------------------

function scheduleCheck() {
  clearTimeout(checkTimer);
  $('ed-status').textContent = 'Checking…';
  $('ed-status').dataset.state = '';
  checkTimer = setTimeout(runChecks, 150);
}

function runChecks() {
  result = checkTrack(track, { pilot: true });
  const problems = [...result.problems];
  const release = releaseCountdown(track.releaseAt, Date.now());
  if (!release.valid) problems.push({ code: 'release', message: 'Set a release time like 2026-09-29T19:00:00-07:00 (date, time and UTC offset).' });
  const list = $('ed-problems');
  list.replaceChildren(
    ...problems.map((p) => {
      const li = document.createElement('li');
      li.textContent = p.message;
      return li;
    }),
    ...result.warnings.map((w) => {
      const li = document.createElement('li');
      li.className = 'is-warning';
      li.textContent = `Note: ${w.message}`;
      return li;
    }),
  );
  const status = $('ed-status');
  status.dataset.state = problems.length ? 'bad' : 'ok';
  status.textContent = problems.length
    ? `${problems.length} problem${problems.length === 1 ? '' : 's'} to fix before publishing.`
    : 'All checks pass. Ready to test fly and export.';
  const pilot = $('ed-pilot');
  if (result.pilot) {
    const { time, finished, scene } = result.pilot;
    pilot.textContent = finished
      ? `Test pilot (careful line, no boost): ${time.toFixed(2)} s, fuel left ${scene.fuel.toFixed(0)}, hull ${scene.player.hp.toFixed(0)}. Real laps are faster.`
      : `Test pilot didn't finish: ${time.toFixed(1)} s, ${scene.trackProgress.passed} of ${scene.track.checkpoints.length} checkpoints.`;
  } else pilot.textContent = result.layout ? 'The test pilot flies once the other checks pass.' : '';
  $('ed-export').value = trackModuleText(track);
  draw();
}

// ---- fields ----------------------------------------------------------------

const fields = {
  title: $('ed-title'), releaseAt: $('ed-release'), landmark: $('ed-landmark'), lesson: $('ed-lesson'), rumor: $('ed-rumor'),
};

function syncFields() {
  for (const [key, input] of Object.entries(fields)) if (document.activeElement !== input) input.value = track[key] || '';
  if (document.activeElement !== $('ed-width')) $('ed-width').value = String(track.width ?? 6.4);
  $('ed-width-value').textContent = Number(track.width ?? 6.4).toFixed(1);
  $('ed-music').value = track.music;
  if (document.activeElement !== $('ed-version')) $('ed-version').value = String(track.version);
  $('ed-placeholder').checked = !!track.placeholder;
  paintRelease();
  const extras = [];
  if (track.moving?.length) extras.push(`moving rocks on segments ${track.moving.join(', ')}`);
  if (track.drones?.length) extras.push(`${track.drones.length} sentinel${track.drones.length === 1 ? '' : 's'}`);
  if (track.well) extras.push(`a gravity well at (${track.well.x}, ${track.well.y})`);
  $('ed-extras').textContent = extras.length ? `Kept from the imported track: ${extras.join('; ')}. Edit those in the file.` : '';
  $('ed-extras').hidden = !extras.length;
}

function paintRelease(releaseAt = track.releaseAt) {
  const c = releaseCountdown(releaseAt, Date.now());
  const note = $('ed-release-note');
  if (!c.valid) note.textContent = 'Not a valid time yet. Example: 2026-09-29T19:00:00-07:00.';
  else if (c.released) note.textContent = `${releaseText(releaseAt) || 'That time'} has passed: the track opens as soon as it ships${track.placeholder ? ' (unless it is still marked Placeholder)' : ''}.`;
  else note.textContent = `Opens ${releaseText(releaseAt) || releaseAt} · in ${c.label} · your local time ${new Date(Date.parse(releaseAt)).toLocaleString()}`;
}

for (const [key, input] of Object.entries(fields)) {
  input.addEventListener('change', () => setTrack({ ...track, [key]: input.value.trim() }));
  if (key === 'releaseAt') input.addEventListener('input', () => paintRelease(input.value.trim()));
}
$('ed-width').addEventListener('input', () => { previewWidth = Number($('ed-width').value); $('ed-width-value').textContent = previewWidth.toFixed(1); draw(); });
$('ed-width').addEventListener('change', () => { previewWidth = null; setTrack({ ...track, width: Number($('ed-width').value) }); });
$('ed-music').addEventListener('change', () => setTrack({ ...track, music: $('ed-music').value }));
$('ed-version').addEventListener('change', () => {
  const v = Math.max(1, Math.round(Number($('ed-version').value) || 1));
  setTrack({ ...track, version: v });
});
$('ed-placeholder').addEventListener('change', () => {
  const next = { ...track };
  if ($('ed-placeholder').checked) next.placeholder = true;
  else delete next.placeholder;
  setTrack(next);
});
for (const radio of document.querySelectorAll('input[name=tool]')) {
  radio.addEventListener('change', () => { tool = radio.value; paintHint(); draw(); });
}
$('ed-undo').addEventListener('click', undoLast);

function undoLast() {
  const last = undo.pop();
  if (!last) return;
  setTrack(JSON.parse(last), { record: false });
}

function paintHint() {
  $('ed-hint').textContent = {
    points: 'Points: click to add the next point (after the selected one), drag to move, select and press Delete to remove. Point 0 is the start portal; the lap runs in point order. Arrow keys nudge the selected point.',
    apex: `Apex corners: click a point to mark or unmark it. Each apex gets a signal pilots must collect (${TRACK_RULES.MIN_APEXES} to ${TRACK_RULES.MAX_APEXES}). Point 0 can't be one.`,
    rocks: 'Rocks: click a stretch of lane to put a rock on that segment, or take it off. Rocks sit to one side, alternating.',
  }[tool];
}

// ---- selection panel -------------------------------------------------------

function paintSelected() {
  const box = $('ed-selected');
  if (selected < 0 || !track.points[selected]) { box.replaceChildren(); return; }
  const [x, y] = track.points[selected];
  const label = document.createElement('strong');
  label.textContent = selected === 0 ? `Point 0 (start portal) at (${x}, ${y})` : `Point ${selected} at (${x}, ${y})`;
  const button = (text, pressed, onClick, disabled = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  };
  box.replaceChildren(
    label,
    button('Apex corner', track.apexes.includes(selected), () => setTrack(toggleApex(track, selected)), selected === 0),
    button(`Rock on segment ${selected}`, track.rocks.includes(selected), () => setTrack(toggleRock(track, selected))),
    button('Delete point', null, () => { const i = selected; selected = -1; setTrack(removePoint(track, i)); }),
  );
}

// ---- drawing ---------------------------------------------------------------

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(300, Math.round(rect.width * dpr));
  const h = Math.round((w * GRID_H) / GRID_W);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  draw();
}

function draw() {
  if (!track) return;
  const s = canvas.width / GRID_W;
  const X = (x) => x * s, Y = (y) => y * s;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#050a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i <= GRID_W; i++) {
    ctx.strokeStyle = i % 4 ? '#12202d' : '#1d3242';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(i) + 0.5, 0); ctx.lineTo(X(i) + 0.5, canvas.height); ctx.stroke();
  }
  for (let j = 0; j <= GRID_H; j++) {
    ctx.strokeStyle = j % 4 ? '#12202d' : '#1d3242';
    ctx.beginPath(); ctx.moveTo(0, Y(j) + 0.5); ctx.lineTo(canvas.width, Y(j) + 0.5); ctx.stroke();
  }
  const pts = track.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const width = previewWidth ?? (Number(track.width) || 6.4);
  if (pts.length >= 2) {
    const loop = () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      if (pts.length > 2) ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Rails, then the lane: where two stretches merge they become one blob.
    loop(); ctx.strokeStyle = '#3f8f99'; ctx.lineWidth = (width + 0.25) * s; ctx.stroke();
    loop(); ctx.strokeStyle = '#0f2331'; ctx.lineWidth = width * s; ctx.stroke();
    loop(); ctx.setLineDash([s * 0.5, s * 0.5]); ctx.strokeStyle = '#81e6df55'; ctx.lineWidth = Math.max(1, s * 0.08); ctx.stroke(); ctx.setLineDash([]);
    // Direction arrows and segment numbers (rocks are placed by segment).
    pts.forEach(([ax, ay], i) => {
      if (pts.length < 3 && i === pts.length - 1) return;
      const [bx, by] = pts[(i + 1) % pts.length];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, ang = Math.atan2(by - ay, bx - ax);
      ctx.save();
      ctx.translate(X(mx), Y(my)); ctx.rotate(ang);
      ctx.fillStyle = track.rocks.includes(i) ? '#ffad72' : '#81e6df88';
      ctx.beginPath(); ctx.moveTo(s * 0.45, 0); ctx.lineTo(-s * 0.3, -s * 0.3); ctx.lineTo(-s * 0.3, s * 0.3); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (tool === 'rocks') {
        ctx.fillStyle = '#9fb7c4';
        ctx.font = `${Math.max(10, s * 0.55)}px Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`s${i}`, X(mx), Y(my) - s * 0.6);
      }
    });
  }
  const layout = result?.layout;
  if (layout) {
    for (const w of layout.gravityWells || []) {
      ctx.strokeStyle = '#b48cff88'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(w.x), Y(w.y), w.influence * s, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#b48cff'; ctx.beginPath(); ctx.arc(X(w.x), Y(w.y), w.radius * s, 0, Math.PI * 2); ctx.fill();
    }
    for (const h of layout.hazards) {
      ctx.fillStyle = '#8a5a3c'; ctx.strokeStyle = '#ffad72'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(h.x), Y(h.y), h.radius * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const n of layout.nodes) {
      const cx = X(n.x + 0.5), cy = Y(n.y + 0.5);
      if (n.kind === 'planet') {
        ctx.fillStyle = '#81e6df'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2); ctx.fill();
      } else if (n.kind === 'station') {
        ctx.fillStyle = '#7ee2b8'; ctx.fillRect(cx - s * 0.4, cy - s * 0.4, s * 0.8, s * 0.8);
      } else if (n.kind === 'start') {
        ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = Math.max(2, s * 0.15);
        ctx.beginPath(); ctx.arc(cx, cy, s * 0.9, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  // Point handles, numbered in lap order.
  ctx.font = `600 ${Math.max(10, s * 0.6)}px Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  track.points.forEach(([x, y], i) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const apex = track.apexes.includes(i);
    ctx.fillStyle = i === selected ? '#ffad72' : i === 0 ? '#ffd36b' : '#eaf4f5';
    ctx.beginPath(); ctx.arc(X(x), Y(y), s * 0.32, 0, Math.PI * 2); ctx.fill();
    if (apex) { ctx.strokeStyle = '#81e6df'; ctx.lineWidth = Math.max(2, s * 0.12); ctx.beginPath(); ctx.arc(X(x), Y(y), s * 0.62, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#eaf4f5';
    // Point 0 is the start portal (gold); numbers match the apex list and the checks.
    ctx.fillText(String(i), X(x) + s * 0.75, Y(y) - s * 0.7);
  });
}

// ---- pointer and keyboard --------------------------------------------------

function gridPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * GRID_W;
  const y = ((event.clientY - rect.top) / rect.height) * GRID_H;
  const step = $('ed-snap').checked ? 0.5 : 0;
  return [snap(x, step), snap(y, step), x, y];
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  const [sx, sy, rx, ry] = gridPoint(event);
  const radius = Math.max(0.9, (GRID_W / canvas.getBoundingClientRect().width) * 14);
  const hit = hitPoint(track, rx, ry, radius);
  if (tool === 'apex') {
    if (hit >= 0) { selected = hit; setTrack(toggleApex(track, hit)); }
    return;
  }
  if (tool === 'rocks') {
    const seg = hitSegment(track, rx, ry, Math.max(2, (Number(track.width) || 6.4) / 2));
    if (seg >= 0) { selected = seg; setTrack(toggleRock(track, seg)); }
    return;
  }
  if (hit >= 0) {
    selected = hit;
    drag = { index: hit, moved: false, before: JSON.stringify(track) };
    canvas.setPointerCapture(event.pointerId);
    paintSelected();
    draw();
    return;
  }
  const at = selected >= 0 ? selected + 1 : track.points.length;
  selected = at;
  setTrack(insertPoint(track, at, [sx, sy]));
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const [sx, sy] = gridPoint(event);
  const [px, py] = track.points[drag.index];
  if (sx === px && sy === py) return;
  drag.moved = true;
  track = movePoint(track, drag.index, [sx, sy]);
  draw();
  paintSelected();
});

function endDrag() {
  if (!drag) return;
  const { moved, before } = drag;
  drag = null;
  if (!moved) return;
  const moved_ = track;
  track = JSON.parse(before);
  setTrack(moved_);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

document.addEventListener('keydown', (event) => {
  const typing = event.target.closest?.('input, textarea, select');
  if (typing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undoLast(); return; }
  if (selected < 0) return;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    const i = selected;
    selected = -1;
    setTrack(removePoint(track, i));
  } else if (event.key === 'Escape') {
    selected = -1; paintSelected(); draw();
  } else if (event.key.startsWith('Arrow') && event.target === canvas) {
    event.preventDefault();
    const step = event.shiftKey ? 2 : 0.5;
    const [x, y] = track.points[selected];
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    setTrack(movePoint(track, selected, [x + d[0], y + d[1]]));
  }
});

// ---- import / export -------------------------------------------------------

$('ed-load-current').addEventListener('click', () => load(CUSTOM_TRACK, 'Loaded the custom track as shipped in tracks/custom-track.js.'));
$('ed-load-blank').addEventListener('click', () => load(blankTrack(CUSTOM_TRACK.releaseAt), 'Blank grid. Click to place point 0, the start portal, then the rest of the lap in order.'));
$('ed-import').addEventListener('click', () => {
  const parsed = parseTrackText($('ed-import-text').value);
  if (parsed.error) { $('ed-import-note').textContent = parsed.error; return; }
  load(parsed.track, 'Imported the pasted track.');
});

async function copy(text, what) {
  const note = $('ed-export-note');
  try {
    await navigator.clipboard.writeText(text);
    note.textContent = `Copied ${what}.`;
  } catch {
    const area = $('ed-export');
    area.value = text;
    area.focus();
    area.select();
    note.textContent = `Select the text below and copy it (${what}).`;
  }
}
$('ed-copy-js').addEventListener('click', () => { $('ed-export').value = trackModuleText(track); copy(trackModuleText(track), 'custom-track.js'); });
$('ed-copy-json').addEventListener('click', () => {
  const json = JSON.stringify(pickTrackFields(track), null, 2);
  $('ed-export').value = json;
  copy(json, 'the JSON');
});
$('ed-test-fly').addEventListener('click', () => {
  const note = $('ed-export-note');
  try {
    store().setItem(DRAFT_KEY, JSON.stringify(pickTrackFields(track)));
  } catch {
    note.textContent = 'This browser blocked saving the draft, so it can’t be test flown here.';
    return;
  }
  note.textContent = result?.ok ? 'Opened the game with this draft. Nothing from a preview is saved.' : 'Opened the game with this draft. It won’t fly until the checks pass.';
  window.open(new URL('../?preview=custom&draft=1', import.meta.url).href, '_blank', 'noopener');
});

// ---- start -----------------------------------------------------------------

let restored = null;
try { restored = JSON.parse(store()?.getItem(SAVE_KEY) || 'null'); } catch { restored = null; }
if (restored && Array.isArray(restored.points)) load(restored, 'Restored your last editor session on this browser.');
else load(CUSTOM_TRACK, 'Loaded the custom track as shipped in tracks/custom-track.js.');
paintHint();
new ResizeObserver(resize).observe(canvas);
resize();
setInterval(() => { if (track && document.activeElement !== fields.releaseAt) paintRelease(); }, 1000);
// For browser checks: the current track and last result.
window.stardustEditor = { get track() { return track; }, get result() { return result; } };

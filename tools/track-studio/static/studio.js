// Track Studio page. No inline script, no external resources; every piece of
// server data reaches the DOM through textContent / setAttribute only.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = 'trackStudio.draft.v1';
  const REFINE_KEY = 'trackStudio.refine.v1';
  const POLL_MS = 15000;
  const MARK_LABEL = { landmark: 'Landmark', fast: 'Fast', tight: 'Tight', hazard: 'Hazard', calm: 'Calm' };
  const MARK_LETTER = { landmark: 'L', fast: 'F', tight: 'T', hazard: 'H', calm: 'C' };
  const MARK_COLOR = { landmark: '#e6c56a', fast: '#6ee0ff', tight: '#ff8a7a', hazard: '#ffa94d', calm: '#8be28b' };
  const STATUS_LABEL = {
    'ready': 'Ready', 'needs-work': 'Needs work', 'agent-working': 'Agent working', 'approval-requested': 'Approval requested',
  };
  const HINTS = {
    draw: 'Draw one loop with your finger. It closes itself when you lift.',
    start: 'Tap the line where the race should start.',
    landmark: 'Tap the line where the landmark goes.',
    fast: 'Tap a spot that should feel fast.',
    tight: 'Tap a spot that should be tight.',
    hazard: 'Tap a spot that needs a hazard.',
    calm: 'Tap a spot where the player can breathe.',
  };

  // ---------- small helpers ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
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
    const total = Math.round(ms);
    const m = Math.floor(total / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const milli = total % 1000;
    return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
  }

  function ago(iso) {
    const t = Date.parse(iso);
    if (!t) return '';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  }

  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode, quota: ignore */ }
  }
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  async function api(path, body, timeoutMs = 20000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const opts = { signal: ctl.signal, headers: { 'X-Studio': '1' }, cache: 'no-store' };
      if (body !== undefined) {
        opts.method = 'POST';
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      let res;
      try { res = await fetch(path, opts); } catch (e) {
        throw new Error(e.name === 'AbortError' ? 'The studio took too long to answer.' : 'Cannot reach the studio. Check your connection.');
      }
      let data = null;
      try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
      if (!res.ok || !data || data.ok === false) {
        const msg = (data && data.error) || `Request failed (${res.status}).`;
        const err = new Error(data && data.hint ? `${msg} ${data.hint}` : msg);
        err.status = res.status;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function say(el, text, kind) {
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  // ---------- sketch pad ----------
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const pad = { points: [], start: 0, marks: [], tool: 'draw', raw: null, history: [], noteFor: null };
  let cssW = 0;
  let cssH = 0;

  function snapshot() {
    return JSON.stringify({ points: pad.points, start: pad.start, marks: pad.marks });
  }
  function pushHistory() {
    pad.history.push(snapshot());
    if (pad.history.length > 40) pad.history.shift();
  }
  function restore(json) {
    const s = JSON.parse(json);
    pad.points = s.points; pad.start = s.start; pad.marks = s.marks;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cssW = canvas.clientWidth;
    cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function toPx(p) { return [p[0] * cssW, p[1] * cssH]; }

  function draw() {
    if (!cssW) return;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= cssW; x += cssW / 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cssH); ctx.stroke(); }
    for (let y = 0; y <= cssH; y += cssH / 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssW, y); ctx.stroke(); }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (pad.raw && pad.raw.length > 1) {
      ctx.strokeStyle = '#e6c56a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      pad.raw.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    } else if (pad.points.length) {
      const px = pad.points.map(toPx);
      ctx.beginPath();
      px.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 13;
      ctx.stroke();
      ctx.strokeStyle = '#e6c56a';
      ctx.lineWidth = 6;
      ctx.stroke();
      // direction chevrons
      ctx.fillStyle = '#050506';
      for (let k = 1; k <= 4; k++) {
        const i = Math.floor((px.length * k) / 5) % px.length;
        const a = px[i];
        const b = px[(i + 2) % px.length];
        drawArrow(a, Math.atan2(b[1] - a[1], b[0] - a[0]), 7);
      }
      pad.marks.forEach((m) => {
        const p = px[m.at];
        if (p) drawBadge(p, MARK_COLOR[m.kind], MARK_LETTER[m.kind], 15);
      });
      const s = px[pad.start];
      if (s) {
        const nxt = px[(pad.start + 3) % px.length];
        drawBadge(s, '#7fd6a0', 'S', 17);
        ctx.fillStyle = '#7fd6a0';
        drawArrow([s[0] + Math.cos(Math.atan2(nxt[1] - s[1], nxt[0] - s[0])) * 30, s[1] + Math.sin(Math.atan2(nxt[1] - s[1], nxt[0] - s[0])) * 30], Math.atan2(nxt[1] - s[1], nxt[0] - s[0]), 9);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Draw one loop here', cssW / 2, cssH / 2);
    }
  }

  function drawArrow(p, ang, size) {
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.8);
    ctx.lineTo(-size * 0.7, -size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBadge(p, color, letter, r) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#050506';
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, p[0], p[1] + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // Turn a hand-drawn stroke (canvas px) into an evenly spaced, lightly smoothed closed loop (0..1).
  function processStroke(raw) {
    const pts = raw.slice();
    pts.push(pts[0]); // auto-close
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    if (total < Math.max(120, cssW * 0.4)) return null;
    const spacing = Math.max(6, cssW / 60);
    const n = Math.min(300, Math.max(24, Math.round(total / spacing)));
    let out = [];
    let seg = 1;
    for (let k = 0; k < n; k++) {
      const d = (total * k) / n;
      while (seg < cum.length - 1 && cum[seg] < d) seg++;
      const span = cum[seg] - cum[seg - 1] || 1;
      const t = (d - cum[seg - 1]) / span;
      out.push([pts[seg - 1][0] + (pts[seg][0] - pts[seg - 1][0]) * t, pts[seg - 1][1] + (pts[seg][1] - pts[seg - 1][1]) * t]);
    }
    for (let pass = 0; pass < 2; pass++) {
      out = out.map((p, i) => {
        const a = out[(i - 1 + n) % n];
        const b = out[(i + 1) % n];
        return [a[0] * 0.25 + p[0] * 0.5 + b[0] * 0.25, a[1] * 0.25 + p[1] * 0.5 + b[1] * 0.25];
      });
    }
    return out.map((p) => [Math.round((p[0] / cssW) * 10000) / 10000, Math.round((p[1] / cssH) * 10000) / 10000]);
  }

  function nearestIndex(pos, maxPx) {
    let best = -1;
    let bestD = Infinity;
    pad.points.forEach((p, i) => {
      const q = toPx(p);
      const d = Math.hypot(q[0] - pos[0], q[1] - pos[1]);
      if (d < bestD) { bestD = d; best = i; }
    });
    return bestD <= maxPx ? best : -1;
  }

  function canvasPos(ev) {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  let downAt = null;
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    const pos = canvasPos(ev);
    downAt = pos;
    if (pad.tool === 'draw') pad.raw = [pos];
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!downAt || pad.tool !== 'draw' || !pad.raw) return;
    ev.preventDefault();
    const events = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [ev];
    for (const e of events.length ? events : [ev]) {
      const p = canvasPos(e);
      const last = pad.raw[pad.raw.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 2) pad.raw.push(p);
    }
    draw();
  });
  function endPointer(ev, cancelled) {
    if (!downAt) return;
    ev.preventDefault();
    const pos = canvasPos(ev);
    const wasTap = Math.hypot(pos[0] - downAt[0], pos[1] - downAt[1]) < 10;
    downAt = null;
    if (pad.tool === 'draw') {
      const raw = pad.raw;
      pad.raw = null;
      if (cancelled || !raw || raw.length < 8) { draw(); if (!cancelled) say($('pad-msg'), 'Drag your finger to draw a loop.', 'err'); return; }
      const pts = processStroke(raw);
      if (!pts) { draw(); say($('pad-msg'), 'That loop is too small. Draw it bigger.', 'err'); return; }
      pushHistory();
      pad.points = pts; pad.start = 0; pad.marks = [];
      setTool('start');
      say($('pad-msg'), 'Loop closed. Tap the line to move the start, or pick a mark.', 'ok');
      afterChange();
    } else if (wasTap && !cancelled) {
      tap(pos);
    }
  }
  canvas.addEventListener('pointerup', (ev) => endPointer(ev, false));
  canvas.addEventListener('pointercancel', (ev) => endPointer(ev, true));
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  function tap(pos) {
    if (!pad.points.length) { say($('pad-msg'), 'Draw a loop first.', 'err'); return; }
    const i = nearestIndex(pos, 32);
    if (i < 0) { say($('pad-msg'), 'Tap closer to the line.', 'err'); return; }
    pushHistory();
    if (pad.tool === 'start') {
      pad.start = i;
      say($('pad-msg'), 'Start moved.', 'ok');
    } else {
      pad.marks.push({ at: i, kind: pad.tool });
      pad.noteFor = pad.marks.length - 1;
      say($('pad-msg'), `${MARK_LABEL[pad.tool]} added.`, 'ok');
    }
    afterChange();
  }

  function setTool(tool) {
    pad.tool = tool;
    document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    $('pad-hint').textContent = HINTS[tool] || '';
  }
  document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

  $('undo').addEventListener('click', () => {
    if (!pad.history.length) { say($('pad-msg'), 'Nothing to undo.', 'err'); return; }
    restore(pad.history.pop());
    pad.noteFor = null;
    say($('pad-msg'), 'Undone.', 'ok');
    afterChange();
  });
  $('clear').addEventListener('click', () => {
    if (!pad.points.length && !pad.marks.length) return;
    pushHistory();
    pad.points = []; pad.marks = []; pad.start = 0; pad.noteFor = null;
    setTool('draw');
    say($('pad-msg'), 'Cleared. Undo brings it back.', 'ok');
    afterChange();
  });

  // note box for the mark just added
  $('mark-note').addEventListener('input', () => {
    const m = pad.marks[pad.noteFor];
    if (!m) return;
    const v = $('mark-note').value.trim();
    if (v) m.note = v; else delete m.note;
    renderMarks();
    saveDraft();
  });
  $('mark-note-done').addEventListener('click', () => { pad.noteFor = null; renderNoteBox(); });

  function renderNoteBox() {
    const m = pad.marks[pad.noteFor];
    $('note-box').hidden = !m;
    if (m) {
      $('mark-note-label').textContent = `Note for this ${MARK_LABEL[m.kind]} mark (optional)`;
      if ($('mark-note').dataset.for !== String(pad.noteFor) + ':' + pad.marks.length) {
        $('mark-note').value = m.note || '';
        $('mark-note').dataset.for = String(pad.noteFor) + ':' + pad.marks.length;
      }
    } else {
      $('mark-note').dataset.for = '';
    }
  }

  function renderMarks() {
    const list = $('mark-list');
    list.replaceChildren(...pad.marks.map((m, i) => h('li', {},
      h('span', { text: `${MARK_LABEL[m.kind]}${m.note ? ': ' + m.note : ''}` }),
      h('button', {
        type: 'button', 'aria-label': `Remove ${MARK_LABEL[m.kind]} mark`, text: '×',
        onclick: () => {
          pushHistory();
          pad.marks.splice(i, 1);
          pad.noteFor = null;
          afterChange();
        },
      }))));
  }

  function afterChange() {
    renderNoteBox();
    renderMarks();
    draw();
    saveDraft();
    updateAttachBoxes();
  }

  // ---------- draft persistence ----------
  let saveTimer = null;
  function difficulty() {
    const r = document.querySelector('input[name="difficulty"]:checked');
    return r ? r.value : 'normal';
  }
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      store(DRAFT_KEY, {
        points: pad.points, start: pad.start, marks: pad.marks, difficulty: difficulty(),
        title: $('title').value, landmark: $('landmark').value, ideas: $('ideas').value, notes: $('notes').value,
      });
    }, 250);
  }
  function restoreDraft() {
    const d = load(DRAFT_KEY, null);
    if (!d || typeof d !== 'object') return;
    try {
      if (Array.isArray(d.points) && d.points.every((p) => Array.isArray(p) && p.length === 2)) {
        pad.points = d.points;
        pad.start = Number.isInteger(d.start) && d.start < d.points.length ? d.start : 0;
        pad.marks = (Array.isArray(d.marks) ? d.marks : []).filter((m) => MARK_LABEL[m.kind] && Number.isInteger(m.at) && m.at < d.points.length);
      }
      if (['easy', 'normal', 'hard'].includes(d.difficulty)) {
        document.querySelector(`input[name="difficulty"][value="${d.difficulty}"]`).checked = true;
      }
      $('title').value = typeof d.title === 'string' ? d.title : '';
      $('landmark').value = typeof d.landmark === 'string' ? d.landmark : '';
      $('ideas').value = typeof d.ideas === 'string' ? d.ideas : '';
      $('notes').value = typeof d.notes === 'string' ? d.notes : '';
      if (pad.points.length) {
        setTool('start');
        say($('pad-msg'), 'Your unsent sketch is back.', 'ok');
      }
    } catch (e) { /* corrupt draft: start fresh */ }
  }
  ['title', 'landmark', 'ideas', 'notes'].forEach((id) => $(id).addEventListener('input', saveDraft));
  document.querySelectorAll('input[name="difficulty"]').forEach((r) => r.addEventListener('change', saveDraft));

  function currentSketch() {
    if (!pad.points.length) return null;
    return {
      version: 1,
      points: pad.points,
      start: pad.start,
      aspect: Math.round((cssW / cssH) * 1000) / 1000,
      marks: pad.marks.map((m) => (m.note ? { at: m.at, kind: m.kind, note: m.note } : { at: m.at, kind: m.kind })),
      difficulty: difficulty(),
    };
  }

  // ---------- make track / names ----------
  let making = false;
  $('make').addEventListener('click', async () => {
    if (making) return;
    const sketch = currentSketch();
    if (!sketch) { say($('make-msg'), 'Draw a loop on the pad first.', 'err'); return; }
    making = true;
    $('make').disabled = true;
    const t0 = Date.now();
    const tick = setInterval(() => say($('make-msg'), `Making your track… ${Math.round((Date.now() - t0) / 1000)}s`, 'busy'), 500);
    say($('make-msg'), 'Making your track…', 'busy');
    try {
      const out = await api('/studio/api/sketches', {
        sketch, difficulty: sketch.difficulty,
        title: $('title').value.trim(), landmark: $('landmark').value.trim(),
        notes: $('notes').value.trim(), nameIdeas: $('ideas').value.trim(),
      }, 90000);
      const v = out.version;
      $('notes').value = '';
      saveDraft();
      if (v.status === 'needs-work') {
        say($('make-msg'), `Made v${v.version}, but it needs work: ${v.problems[0] || 'see the version below.'}`, 'err');
      } else {
        say($('make-msg'), `Made v${v.version}. Playtest it on your laptop.`, 'ok');
      }
      await refreshState();
      const card = document.querySelector(`[data-version="${v.version}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      say($('make-msg'), `${e.message} Your sketch is still here, tap Make track to retry.`, 'err');
    } finally {
      clearInterval(tick);
      making = false;
      $('make').disabled = false;
    }
  });

  $('names').addEventListener('click', async () => {
    const ideas = $('ideas').value.trim();
    if (!ideas) { say($('names-msg'), 'Type a few name ideas first.', 'err'); return; }
    $('names').disabled = true;
    say($('names-msg'), 'Asking…', 'busy');
    try {
      const out = await api('/studio/api/names', { ideas });
      say($('names-msg'), out.message || 'Asked. Check your Focus Inbox.', 'ok');
    } catch (e) {
      say($('names-msg'), e.message, 'err');
    } finally {
      $('names').disabled = false;
    }
  });

  // ---------- versions ----------
  let lastState = null;
  let lastStateKey = '';
  let seen = null;
  let renderDeferred = false;
  let newNote = '';
  const ui = {}; // per-version panel state: { refine: bool, approve: bool }
  const refineNotes = load(REFINE_KEY, {});

  function saveRefine() { store(REFINE_KEY, refineNotes); }

  function absUrl(path) { return location.origin + path; }

  async function copyText(text, input) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        input.focus();
        input.select();
        return document.execCommand('copy');
      } catch (e2) { return false; }
    }
  }

  function updateAttachBoxes() {
    document.querySelectorAll('.attach-sketch').forEach((cb) => {
      cb.disabled = !pad.points.length;
      if (!pad.points.length) cb.checked = false;
    });
  }

  function versionCard(v) {
    const st = ui[v.id] || (ui[v.id] = {});
    const runs = v.runs || {};
    const best = fmtMs(runs.bestMs);
    const last = fmtMs(runs.lastMs);
    const auto = fmtMs(v.autopilotMs);
    const pendingReq = (v.requests || []).filter((r) => r.status === 'pending');
    const playHref = v.playUrl;
    const playAbs = absUrl(playHref);

    const facts = h('dl', { class: 'facts' },
      h('dt', { text: 'Autopilot' }), h('dd', { text: auto || 'did not finish' }),
      h('dt', { text: 'Best laptop lap' }), h('dd', { text: best || 'not flown yet' }),
      h('dt', { text: 'Last laptop lap' }),
      h('dd', { text: last ? `${last}${runs.lastFinished === false ? ' (last try did not finish)' : ''}` : (runs.count ? `no finish${runs.lastReason ? ': ' + runs.lastReason : ''}` : 'not flown yet') }),
      h('dt', { text: 'Laps flown' }), h('dd', { text: `${runs.count || 0}${runs.finished ? `, ${runs.finished} finished` : ''}` }),
      h('dt', { text: 'From' }), h('dd', { text: v.source === 'agent' ? 'Agent edit' : `Your sketch${v.difficulty ? ', ' + v.difficulty : ''}` }));

    const card = h('li', { class: 'vcard', 'data-version': v.version },
      h('img', { src: v.previewUrl, alt: `Preview of ${v.title || 'track'} version ${v.version}`, loading: 'lazy' }),
      h('div', { class: 'vbody' },
        h('div', { class: 'vhead' },
          h('h3', { text: v.title || `Track v${v.version}` }),
          h('span', { class: 'vn', text: `v${v.version}` }),
          h('span', { class: `chip ${v.status}`, text: STATUS_LABEL[v.status] || v.status })),
        v.landmark ? h('p', { class: 'hint', text: `Landmark: ${v.landmark}` }) : null,
        facts,
        v.problems && v.problems.length
          ? h('ul', { class: 'problems', 'aria-label': 'Problems' }, v.problems.map((p) => h('li', { text: p })))
          : null,
        v.report && v.report.fixes && v.report.fixes.length
          ? h('p', { class: 'fixes', text: `Auto-fixed: ${v.report.fixes.join(' ')}` }) : null,
        v.source === 'agent' && v.notes ? h('p', { class: 'agentnote', text: `Agent: ${v.notes}` }) : null,
        pendingReq.length
          ? h('p', { class: 'working', text: `The agent is working on your notes (sent ${ago(pendingReq[0].created)}). The new version appears here when it is done.` })
          : null,
        v.approval
          ? h('p', { class: 'hint', text: `Approval requested ${ago(v.approval.at)}. Approve it in your Focus Inbox.` }) : null,
        h('div', { class: 'vactions' },
          h('a', { class: 'btn primary', href: playHref, target: '_blank', rel: 'noopener', text: 'Playtest on laptop' }),
          refineArea(v, st),
          approveArea(v, st))));

    const linkInput = h('input', { type: 'text', readonly: true, value: playAbs, 'aria-label': 'Playtest link' });
    linkInput.addEventListener('focus', () => linkInput.select());
    const copyBtn = h('button', { type: 'button', text: 'Copy link' });
    copyBtn.addEventListener('click', async () => {
      copyBtn.textContent = (await copyText(playAbs, linkInput)) ? 'Copied' : 'Press and hold to copy';
      setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 2000);
    });
    card.querySelector('.vactions').insertBefore(h('div', { class: 'linkrow' }, linkInput, copyBtn), card.querySelector('.vactions').children[1]);
    return card;
  }

  function refineArea(v, st) {
    const wrap = h('div', {});
    const msg = h('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
    const toggle = h('button', { type: 'button', 'aria-expanded': String(!!st.refine), text: 'Refine with notes' });
    const panel = h('div', { class: 'panel', hidden: !st.refine });
    const ta = h('textarea', { rows: '4', maxlength: '4000', placeholder: 'What should change? Corner 3 is too tight, make the start faster…', 'aria-label': `Notes for v${v.version}` });
    ta.value = refineNotes[v.id] || '';
    ta.addEventListener('input', () => { refineNotes[v.id] = ta.value; saveRefine(); });
    const attach = h('input', { type: 'checkbox', class: 'attach-sketch' });
    attach.disabled = !pad.points.length;
    const send = h('button', { type: 'button', class: 'primary', text: 'Send to agent' });
    toggle.addEventListener('click', () => {
      st.refine = !st.refine;
      panel.hidden = !st.refine;
      toggle.setAttribute('aria-expanded', String(st.refine));
      if (st.refine) ta.focus();
    });
    send.addEventListener('click', async () => {
      const notes = ta.value.trim();
      const sketch = attach.checked ? currentSketch() : null;
      if (!notes && !sketch) { say(msg, 'Write a note or attach your sketch first.', 'err'); return; }
      send.disabled = true;
      say(msg, 'Sending…', 'busy');
      try {
        await api('/studio/api/refine', Object.assign({ fromVersion: v.version, notes }, sketch ? { sketch } : {}), 45000);
        delete refineNotes[v.id];
        saveRefine();
        ta.value = '';
        attach.checked = false;
        st.refine = false;
        say(msg, 'Sent. The agent will reply in your Focus Inbox and the new version shows up here.', 'ok');
        await refreshState(true);
      } catch (e) {
        say(msg, e.message, 'err');
      } finally {
        send.disabled = false;
      }
    });
    panel.append(ta, h('label', { class: 'check' }, attach, 'Also send the sketch on the pad'), send);
    wrap.append(toggle, panel, msg);
    return wrap;
  }

  function approveArea(v, st) {
    const wrap = h('div', {});
    const msg = h('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
    const blocked = v.status === 'needs-work' ? 'Fix the problems before approving.'
      : v.approval ? 'Approval already requested.' : null;
    const toggle = h('button', { type: 'button', text: v.approval ? 'Approval requested' : 'Approve this version', disabled: !!blocked, 'aria-expanded': String(!!st.approve) });
    const panel = h('div', { class: 'panel', hidden: !st.approve });
    const unflown = !(v.runs && v.runs.count);
    panel.append(
      h('p', { text: `Approving v${v.version} sends a request to your Focus Inbox. Nothing ships until you approve it there. Launch is Tue Oct 6, 3 PM PT.` }),
      unflown ? h('p', { class: 'msg err', text: 'You have not flown this version on the laptop yet.' }) : null);
    const yes = h('button', { type: 'button', class: 'primary', text: unflown ? 'Approve anyway' : 'Yes, request approval' });
    const no = h('button', { type: 'button', text: 'Cancel' });
    panel.append(h('div', { class: 'vactions' }, yes, no));
    toggle.addEventListener('click', () => { st.approve = !st.approve; panel.hidden = !st.approve; toggle.setAttribute('aria-expanded', String(st.approve)); });
    no.addEventListener('click', () => { st.approve = false; panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); });
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      say(msg, 'Requesting…', 'busy');
      try {
        await api('/studio/api/approve', { version: v.version }, 45000);
        st.approve = false;
        say(msg, 'Done. Approve it in your Focus Inbox.', 'ok');
        await refreshState(true);
      } catch (e) {
        say(msg, e.message, 'err');
        yes.disabled = false;
      }
    });
    wrap.append(toggle, panel, msg);
    if (blocked && v.status === 'needs-work') wrap.append(h('p', { class: 'hint', text: blocked }));
    return wrap;
  }

  function renderVersions(state) {
    const list = $('versions');
    $('ver-empty').hidden = state.versions.length > 0;
    list.replaceChildren(...state.versions.map(versionCard));
    $('lhc-banner').hidden = state.lhcConfigured !== false;
    updateAttachBoxes();
  }

  function userIsTyping() {
    const a = document.activeElement;
    return a && $('versions').contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT');
  }

  function announceNew(state) {
    const ids = new Set(state.versions.map((v) => v.id));
    if (seen) {
      const fresh = state.versions.filter((v) => !seen.has(v.id) && v.source === 'agent');
      if (fresh.length) newNote = `new from the agent: v${fresh[0].version}`;
    }
    seen = ids;
  }

  async function refreshState(force) {
    const conn = $('conn');
    try {
      const state = await api('/studio/api/state');
      lastState = state;
      const key = JSON.stringify([state.versions, state.lhcConfigured]);
      announceNew(state);
      if (force || key !== lastStateKey) {
        lastStateKey = key;
        if (userIsTyping() && !force) renderDeferred = true; else renderVersions(state);
      }
      conn.className = 'conn ok';
      conn.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}${newNote ? ' · ' + newNote : ''}`;
    } catch (e) {
      conn.className = 'conn bad';
      conn.textContent = 'Offline, retrying…';
    }
  }

  $('versions').addEventListener('focusout', () => {
    if (renderDeferred) {
      setTimeout(() => {
        if (renderDeferred && !userIsTyping() && lastState) { renderDeferred = false; renderVersions(lastState); }
      }, 50);
    }
  });

  // ---------- boot ----------
  restoreDraft();
  setTool(pad.points.length ? 'start' : 'draw');
  renderNoteBox();
  renderMarks();
  new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();
  refreshState();
  setInterval(() => { if (!document.hidden) refreshState(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshState(); });
})();
